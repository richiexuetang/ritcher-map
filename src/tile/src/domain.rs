use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BBox {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl BBox {
    pub fn new(min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Self {
        Self {
            min_x,
            min_y,
            max_x,
            max_y,
        }
    }

    pub fn width(&self) -> f64 {
        (self.max_x - self.min_x).max(0.0)
    }

    pub fn height(&self) -> f64 {
        (self.max_y - self.min_y).max(0.0)
    }

    pub fn is_valid(&self) -> bool {
        self.max_x >= self.min_x && self.max_y >= self.min_y
    }

    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y
    }
}

/// A single map marker (e.g. a chest, boss, shard) in pixel space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Marker {
    pub id: i64,
    pub category_id: i32,
    pub x: f64,
    pub y: f64,
    pub title: Option<String>,
}

/// A server-side aggregation of nearby markers, returned at low zoom so the
/// client never has to render thousands of points at once.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cluster {
    /// Representative (centroid) position in pixel space.
    pub x: f64,
    pub y: f64,
    /// Number of markers this cluster stands in for.
    pub count: i64,
    /// Category, if the cluster is homogeneous; `None` when it mixes categories.
    pub category_id: Option<i32>,
}

/// Discriminated response: either expanded markers or aggregated clusters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ViewportItems {
    Markers { markers: Vec<Marker> },
    Clusters { clusters: Vec<Cluster> },
}

/// Full response to a viewport query.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ViewportResponse {
    pub map_id: i64,
    pub zoom: i32,
    #[serde(flatten)]
    pub items: ViewportItems,
    /// Total markers matched in the bbox before any clustering/limiting.
    pub total: i64,
    /// True if `total` exceeded the marker limit and results were clustered.
    pub clustered: bool,
}

/// Parsed + validated query parameters for the viewport endpoint.
#[derive(Debug, Clone)]
pub struct ViewportQuery {
    pub map_id: i64,
    pub bbox: BBox,
    pub zoom: i32,
    /// Empty = all categories.
    pub categories: Vec<i32>,
}

/// Tunables for when/how the read path clusters.
#[derive(Debug, Clone, Copy)]
pub struct ClusterConfig {
    /// If a bbox matches more markers than this, cluster instead of expanding.
    pub max_markers: i64,
    /// Grid cell size in *screen* pixels; markers within a cell merge.
    pub cell_px: f64,
    /// Tile size used to convert zoom levels into a pixel scale.
    pub tile_size: f64,
}

impl Default for ClusterConfig {
    fn default() -> Self {
        Self {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        }
    }
}
