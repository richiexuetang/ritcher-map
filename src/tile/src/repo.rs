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
//!   category_id INT    NOT NULL,
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

use crate::domain::{BBox, Marker, ViewportQuery};

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

    /// Build the shared `WHERE` clause. Categories are passed as an array bind
    /// (`= ANY($n)`); an empty array means "all categories", expressed as a
    /// separate branch so the planner can skip the category filter entirely.
    fn bbox_envelope(b: &BBox) -> String {
        // ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid)
        format!(
            "ST_MakeEnvelope({}, {}, {}, {}, 0)",
            b.min_x, b.min_y, b.max_x, b.max_y
        )
    }
}

#[async_trait]
impl MarkerRepo for PgMarkerRepo {
    async fn count_in_viewport(&self, q: &ViewportQuery) -> Result<i64, RepoError> {
        let env = Self::bbox_envelope(&q.bbox);
        let row: (i64,) = if q.categories.is_empty() {
            sqlx::query_as(&format!(
                "SELECT COUNT(*) FROM markers \
                 WHERE map_id = $1 AND geom && {env}"
            ))
                .bind(q.map_id)
                .fetch_one(&self.pool)
                .await?
        } else {
            sqlx::query_as(&format!(
                "SELECT COUNT(*) FROM markers \
                 WHERE map_id = $1 AND category_id = ANY($2) AND geom && {env}"
            ))
                .bind(q.map_id)
                .bind(&q.categories)
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
        let env = Self::bbox_envelope(&q.bbox);
        let cx = (q.bbox.min_x + q.bbox.max_x) / 2.0;
        let cy = (q.bbox.min_y + q.bbox.max_y) / 2.0;
        let center = format!("ST_SetSRID(ST_MakePoint({cx}, {cy}), 0)");

        let rows: Vec<MarkerRow> = if q.categories.is_empty() {
            sqlx::query_as(&format!(
                "SELECT id, category_id, ST_X(geom) AS x, ST_Y(geom) AS y, title \
                 FROM markers \
                 WHERE map_id = $1 AND geom && {env} \
                 ORDER BY geom <-> {center} \
                 LIMIT $2"
            ))
                .bind(q.map_id)
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query_as(&format!(
                "SELECT id, category_id, ST_X(geom) AS x, ST_Y(geom) AS y, title \
                 FROM markers \
                 WHERE map_id = $1 AND category_id = ANY($2) AND geom && {env} \
                 ORDER BY geom <-> {center} \
                 LIMIT $3"
            ))
                .bind(q.map_id)
                .bind(&q.categories)
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
        };

        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn map_meta(&self, map_id: i64) -> Result<Option<MapMeta>, RepoError> {
        let row: Option<(i64, i64, i32)> = sqlx::query_as(
            "SELECT width, height, max_zoom FROM maps WHERE id = $1",
        )
            .bind(map_id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|(width, height, max_zoom)| MapMeta { width, height, max_zoom }))
    }
}

/// Row shape for sqlx decoding; converted into the domain `Marker`.
#[derive(sqlx::FromRow)]
struct MarkerRow {
    id: i64,
    category_id: i32,
    x: f64,
    y: f64,
    title: Option<String>,
}

impl From<MarkerRow> for Marker {
    fn from(r: MarkerRow) -> Self {
        Marker { id: r.id, category_id: r.category_id, x: r.x, y: r.y, title: r.title }
    }
}

/// In-memory repository for tests and local demos (no database required).
#[cfg(any(test, feature = "memrepo"))]
pub struct InMemoryRepo {
    pub markers: Vec<Marker>,
    pub markers_map_id: i64,
    pub meta: MapMeta,
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
        Ok(if map_id == self.markers_map_id { Some(self.meta) } else { None })
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