//! Spatial data access.
//!
//! The read path depends only on the [`MarkerRepo`] trait, so handlers can be
//! tested against an in-memory fake while production uses PostGIS. The PostGIS
//! query relies on a GiST index over a geometry column:
//!
//! ```sql
//! CREATE TABLE markers (
//!   id          BIGSERIAL PRIMARY KEY,
//!   map_id      BIGINT NOT NULL,
//!   category_id BIGINT NOT NULL,   -- FK to categories.id (BIGSERIAL): decode as i64
//!   title       TEXT,
//!   -- pixel-space point; SRID 0 = "no CRS", which is correct for game maps
//!   geom        geometry(Point, 0) NOT NULL
//! );
//! CREATE INDEX markers_geom_gix ON markers USING GIST (geom);
//! CREATE INDEX markers_map_cat  ON markers (map_id, category_id);
//! ```
//!
//! The bounding-box filter uses the `&&` operator, which is index-accelerated.

use async_trait::async_trait;

use crate::domain::{Marker, ViewportQuery};

/// Errors the repository can surface to the HTTP layer.
#[derive(Debug, thiserror::Error)]
pub enum RepoError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

/// What the read path needs from storage. Intentionally tiny.
#[async_trait]
pub trait MarkerRepo: Send + Sync + 'static {
    /// Count markers matching the query's map/bbox/categories (no row fetch).
    async fn count_in_viewport(&self, q: &ViewportQuery) -> Result<i64, RepoError>;

    /// Fetch up to `limit` markers matching the query, nearest the bbox center
    /// first so a truncated set is still spatially representative.
    async fn markers_in_viewport(
        &self,
        q: &ViewportQuery,
        limit: i64,
    ) -> Result<Vec<Marker>, RepoError>;

    /// Native pixel dimensions + max zoom of a map (from the tiling manifest,
    /// mirrored into a `maps` row). Returns `None` if the map is unknown.
    async fn map_meta(&self, map_id: i64) -> Result<Option<MapMeta>, RepoError>;

    /// Tile-key namespace (`<game_slug>/<map_slug>`) for a map, used to scope
    /// tile-cache invalidation when the catalog signals a map changed. Returns
    /// `None` if the map is unknown (e.g. it was deleted).
    async fn prefix_for_map(&self, map_id: i64) -> Result<Option<String>, RepoError>;
}

#[derive(Debug, Clone, Copy)]
pub struct MapMeta {
    pub width: i64,
    pub height: i64,
    pub max_zoom: i32,
}

/// PostGIS-backed implementation.
pub struct PgMarkerRepo {
    pool: sqlx::PgPool,
}

impl PgMarkerRepo {
    pub fn new(pool: sqlx::PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MarkerRepo for PgMarkerRepo {
    async fn count_in_viewport(&self, q: &ViewportQuery) -> Result<i64, RepoError> {
        let b = &q.bbox;
        // Envelope coords are bound as parameters (not interpolated): sqlx 0.9
        // requires a &'static str for query_as, and binding keeps the SQL static.
        let row: (i64,) = if q.categories.is_empty() {
            sqlx::query_as(
                "SELECT COUNT(*) FROM markers \
                 WHERE map_id = $1 AND geom && ST_MakeEnvelope($2, $3, $4, $5, 0)",
            )
            .bind(q.map_id)
            .bind(b.min_x)
            .bind(b.min_y)
            .bind(b.max_x)
            .bind(b.max_y)
            .fetch_one(&self.pool)
            .await?
        } else {
            sqlx::query_as(
                "SELECT COUNT(*) FROM markers \
                 WHERE map_id = $1 AND category_id = ANY($2) \
                 AND geom && ST_MakeEnvelope($3, $4, $5, $6, 0)",
            )
            .bind(q.map_id)
            .bind(&q.categories)
            .bind(b.min_x)
            .bind(b.min_y)
            .bind(b.max_x)
            .bind(b.max_y)
            .fetch_one(&self.pool)
            .await?
        };
        Ok(row.0)
    }

    async fn markers_in_viewport(
        &self,
        q: &ViewportQuery,
        limit: i64,
    ) -> Result<Vec<Marker>, RepoError> {
        let b = &q.bbox;
        let cx = (b.min_x + b.max_x) / 2.0;
        let cy = (b.min_y + b.max_y) / 2.0;

        // Bbox envelope and the nearest-center point are bound as parameters so
        // the SQL stays a &'static str (sqlx 0.9 SqlSafeStr requirement).
        let rows: Vec<MarkerRow> = if q.categories.is_empty() {
            sqlx::query_as(
                "SELECT id, category_id, ST_X(geom) AS x, ST_Y(geom) AS y, title \
                 FROM markers \
                 WHERE map_id = $1 AND geom && ST_MakeEnvelope($2, $3, $4, $5, 0) \
                 ORDER BY geom <-> ST_SetSRID(ST_MakePoint($6, $7), 0) \
                 LIMIT $8",
            )
            .bind(q.map_id)
            .bind(b.min_x)
            .bind(b.min_y)
            .bind(b.max_x)
            .bind(b.max_y)
            .bind(cx)
            .bind(cy)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as(
                "SELECT id, category_id, ST_X(geom) AS x, ST_Y(geom) AS y, title \
                 FROM markers \
                 WHERE map_id = $1 AND category_id = ANY($2) \
                 AND geom && ST_MakeEnvelope($3, $4, $5, $6, 0) \
                 ORDER BY geom <-> ST_SetSRID(ST_MakePoint($7, $8), 0) \
                 LIMIT $9",
            )
            .bind(q.map_id)
            .bind(&q.categories)
            .bind(b.min_x)
            .bind(b.min_y)
            .bind(b.max_x)
            .bind(b.max_y)
            .bind(cx)
            .bind(cy)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };

        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn map_meta(&self, map_id: i64) -> Result<Option<MapMeta>, RepoError> {
        let row: Option<(i64, i64, i32)> =
            sqlx::query_as("SELECT width, height, max_zoom FROM maps WHERE id = $1")
                .bind(map_id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(width, height, max_zoom)| MapMeta {
            width,
            height,
            max_zoom,
        }))
    }

    async fn prefix_for_map(&self, map_id: i64) -> Result<Option<String>, RepoError> {
        // `maps` is owned by the catalog (V1__init_schema.sql: prefix TEXT NOT
        // NULL UNIQUE); the tile service reads it.
        let row: Option<(String,)> = sqlx::query_as("SELECT prefix FROM maps WHERE id = $1")
            .bind(map_id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|(prefix,)| prefix))
    }
}

/// Row shape for sqlx decoding; converted into the domain `Marker`.
#[derive(sqlx::FromRow)]
struct MarkerRow {
    id: i64,
    // BIGINT column — decoding into i32 is what made the endpoint 500 once any
    // marker row existed (sqlx will not silently narrow int8 -> i32).
    category_id: i64,
    x: f64,
    y: f64,
    title: Option<String>,
}

impl From<MarkerRow> for Marker {
    fn from(r: MarkerRow) -> Self {
        Marker {
            id: r.id,
            category_id: r.category_id,
            x: r.x,
            y: r.y,
            title: r.title,
        }
    }
}

/// In-memory repository for tests and local demos (no database required).
#[cfg(any(test, feature = "memrepo"))]
pub struct InMemoryRepo {
    pub markers: Vec<Marker>,
    pub markers_map_id: i64,
    pub meta: MapMeta,
    /// Tile-key namespace for `markers_map_id`, returned by `prefix_for_map`.
    pub prefix: String,
}

#[cfg(any(test, feature = "memrepo"))]
#[async_trait]
impl MarkerRepo for InMemoryRepo {
    async fn count_in_viewport(&self, q: &ViewportQuery) -> Result<i64, RepoError> {
        Ok(self.filter(q).count() as i64)
    }

    async fn markers_in_viewport(
        &self,
        q: &ViewportQuery,
        limit: i64,
    ) -> Result<Vec<Marker>, RepoError> {
        let cx = (q.bbox.min_x + q.bbox.max_x) / 2.0;
        let cy = (q.bbox.min_y + q.bbox.max_y) / 2.0;
        let mut v: Vec<Marker> = self.filter(q).cloned().collect();
        v.sort_by(|a, b| {
            let da = (a.x - cx).powi(2) + (a.y - cy).powi(2);
            let db = (b.x - cx).powi(2) + (b.y - cy).powi(2);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        });
        v.truncate(limit.max(0) as usize);
        Ok(v)
    }

    async fn map_meta(&self, map_id: i64) -> Result<Option<MapMeta>, RepoError> {
        Ok(if map_id == self.markers_map_id {
            Some(self.meta)
        } else {
            None
        })
    }

    async fn prefix_for_map(&self, map_id: i64) -> Result<Option<String>, RepoError> {
        Ok(if map_id == self.markers_map_id {
            Some(self.prefix.clone())
        } else {
            None
        })
    }
}

#[cfg(any(test, feature = "memrepo"))]
impl InMemoryRepo {
    fn filter<'a>(&'a self, q: &'a ViewportQuery) -> impl Iterator<Item = &'a Marker> {
        self.markers.iter().filter(move |m| {
            q.map_id == self.markers_map_id
                && q.bbox.contains(m.x, m.y)
                && (q.categories.is_empty() || q.categories.contains(&m.category_id))
        })
    }
}
