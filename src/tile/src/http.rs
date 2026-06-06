//! HTTP layer (Axum): routes, handlers, query parsing, error mapping.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::cluster::cluster_markers;
use crate::domain::{BBox, ClusterConfig, ViewportItems, ViewportQuery, ViewportResponse};
use crate::repo::{MarkerRepo, RepoError};
use crate::tiles::{CachedTiles, TileError, TileId, TileOrigin};

/// Shared application state. Generic over the repo + tile origin so tests can
/// substitute in-memory implementations.
pub struct AppState<R: MarkerRepo, O: TileOrigin> {
    pub repo: R,
    pub tiles: CachedTiles<O>,
    pub cluster_cfg: ClusterConfig,
}

pub type SharedState<R, O> = Arc<AppState<R, O>>;

pub fn router<R: MarkerRepo, O: TileOrigin>(state: SharedState<R, O>) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/maps/:map_id/markers", get(viewport_handler::<R, O>))
        .route("/tiles/*tile", get(tile_handler::<R, O>))
        .with_state(state)
}

// ---- viewport query ----------------------------------------------------------

/// Raw query string for the markers endpoint:
/// `?bbox=minx,miny,maxx,maxy&zoom=3&categories=1,2,3`
#[derive(Debug, Deserialize)]
pub struct ViewportParams {
    pub bbox: String,
    pub zoom: i32,
    #[serde(default)]
    pub categories: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("not found")]
    NotFound,
    #[error("internal error")]
    Internal,
}

impl From<RepoError> for ApiError {
    fn from(e: RepoError) -> Self {
        tracing::error!(error = %e, "repo error");
        ApiError::Internal
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (code, msg) = match self {
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not found".into()),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into()),
        };
        (code, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

/// Parse `minx,miny,maxx,maxy` into a validated [`BBox`].
fn parse_bbox(s: &str) -> Result<BBox, ApiError> {
    let parts: Vec<&str> = s.split(',').collect();
    if parts.len() != 4 {
        return Err(ApiError::BadRequest(
            "bbox must be 'minx,miny,maxx,maxy'".into(),
        ));
    }
    let mut v = [0f64; 4];
    for (i, p) in parts.iter().enumerate() {
        v[i] = p
            .trim()
            .parse()
            .map_err(|_| ApiError::BadRequest(format!("bbox component {i} not a number")))?;
    }
    let b = BBox::new(v[0], v[1], v[2], v[3]);
    if !b.is_valid() {
        return Err(ApiError::BadRequest("bbox max < min".into()));
    }
    Ok(b)
}

/// Parse an optional comma-separated category id list.
fn parse_categories(s: &Option<String>) -> Result<Vec<i32>, ApiError> {
    let Some(s) = s else { return Ok(Vec::new()) };
    if s.trim().is_empty() {
        return Ok(Vec::new());
    }
    s.split(',')
        .map(|p| {
            p.trim()
                .parse::<i32>()
                .map_err(|_| ApiError::BadRequest(format!("bad category id: {p:?}")))
        })
        .collect()
}

async fn viewport_handler<R: MarkerRepo, O: TileOrigin>(
    State(state): State<SharedState<R, O>>,
    Path(map_id): Path<i64>,
    Query(params): Query<ViewportParams>,
) -> Result<Json<ViewportResponse>, ApiError> {
    let bbox = parse_bbox(&params.bbox)?;
    let categories = parse_categories(&params.categories)?;
    let query = ViewportQuery {
        map_id,
        bbox,
        zoom: params.zoom,
        categories,
    };

    let meta = state
        .repo
        .map_meta(map_id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let resp =
        build_viewport_response(&state.repo, &query, meta.max_zoom, &state.cluster_cfg).await?;
    Ok(Json(resp))
}

/// Core decision logic, factored out so it can be unit-tested without HTTP:
/// count first; if the bbox is dense, cluster server-side; otherwise expand
/// the individual markers.
pub async fn build_viewport_response<R: MarkerRepo>(
    repo: &R,
    query: &ViewportQuery,
    max_zoom: i32,
    cfg: &ClusterConfig,
) -> Result<ViewportResponse, ApiError> {
    let total = repo.count_in_viewport(query).await?;

    if total > cfg.max_markers {
        // Dense: fetch a representative sample (bounded) and cluster it.
        // We fetch more than max_markers so clusters reflect real density,
        // but still cap the row scan to keep latency bounded.
        let sample_limit = (cfg.max_markers * 8).min(20_000);
        let markers = repo.markers_in_viewport(query, sample_limit).await?;
        let clusters = cluster_markers(&markers, query.zoom, max_zoom, cfg);
        Ok(ViewportResponse {
            map_id: query.map_id,
            zoom: query.zoom,
            items: ViewportItems::Clusters { clusters },
            total,
            clustered: true,
        })
    } else {
        let markers = repo.markers_in_viewport(query, cfg.max_markers).await?;
        Ok(ViewportResponse {
            map_id: query.map_id,
            zoom: query.zoom,
            items: ViewportItems::Markers { markers },
            total,
            clustered: false,
        })
    }
}

// ---- tile serving ------------------------------------------------------------

async fn tile_handler<R: MarkerRepo, O: TileOrigin>(
    State(state): State<SharedState<R, O>>,
    Path(tile): Path<String>,
) -> Result<Response, ApiError> {
    // `tile` is "<prefix...>/<z>/<x>/<y>.<ext>"; the prefix may contain slashes,
    // so split the fixed trailing components off the right.
    let parts: Vec<&str> = tile.rsplitn(4, '/').collect();
    // rsplitn yields right-to-left: [ "y.ext", "x", "z", "<prefix>" ]
    if parts.len() != 4 {
        return Err(ApiError::BadRequest(
            "tile path must be <prefix>/<z>/<x>/<y>.<ext>".into(),
        ));
    }
    let y_ext = parts[0];
    let x: u32 = parts[1]
        .parse()
        .map_err(|_| ApiError::BadRequest("tile x not a number".into()))?;
    let z: u32 = parts[2]
        .parse()
        .map_err(|_| ApiError::BadRequest("tile z not a number".into()))?;
    let prefix = parts[3].to_string();

    let (y_str, ext) = y_ext
        .rsplit_once('.')
        .ok_or_else(|| ApiError::BadRequest("tile must end in .webp or .png".into()))?;
    let y: u32 = y_str
        .parse()
        .map_err(|_| ApiError::BadRequest("tile y not a number".into()))?;
    if ext != "webp" && ext != "png" {
        return Err(ApiError::BadRequest("unsupported tile extension".into()));
    }

    let id = TileId {
        prefix,
        z,
        x,
        y,
        ext: ext.to_string(),
    };
    let mime = id.mime();

    match state.tiles.get(id).await {
        Ok(bytes) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            // Tiles are immutable; let the CDN + browser hold them forever.
            headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=31536000, immutable"),
            );
            Ok((StatusCode::OK, headers, bytes).into_response())
        }
        // Blank tiles are skipped at tiling time, so misses are expected; a
        // 404 lets MapLibre treat them as transparent.
        Err(TileError::NotFound) => Err(ApiError::NotFound),
        Err(e) => {
            tracing::error!(error = %e, "tile origin error");
            Err(ApiError::Internal)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bbox_ok() {
        let b = parse_bbox("0,0,100,200").unwrap();
        assert_eq!(b, BBox::new(0.0, 0.0, 100.0, 200.0));
    }

    #[test]
    fn parse_bbox_rejects_bad_shapes() {
        assert!(parse_bbox("1,2,3").is_err());
        assert!(parse_bbox("a,b,c,d").is_err());
        assert!(parse_bbox("100,100,0,0").is_err()); // max < min
    }

    #[test]
    fn parse_categories_variants() {
        assert_eq!(parse_categories(&None).unwrap(), Vec::<i32>::new());
        assert_eq!(
            parse_categories(&Some("".into())).unwrap(),
            Vec::<i32>::new()
        );
        assert_eq!(
            parse_categories(&Some("1,2,3".into())).unwrap(),
            vec![1, 2, 3]
        );
        assert!(parse_categories(&Some("1,x".into())).is_err());
    }
}
