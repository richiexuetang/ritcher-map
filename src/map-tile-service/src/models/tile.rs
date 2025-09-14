use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TileMetadata {
    pub id: Uuid,
    pub game_id: Uuid,
    pub zoom_level: i32,
    pub tile_x: i32,
    pub tile_y: i32,
    pub format: String,
    pub file_size: i64,
    pub content_hash: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_accessed: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileRequest {
    pub game_id: String,
    pub z: u8,
    pub x: u32,
    pub y: u32,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileResponse {
    pub data: Vec<u8>,
    pub content_type: String,
    pub cache_key: String,
    pub etag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileGenerationRequest {
    pub game_id: String,
    pub zoom_levels: Option<Vec<u8>>,
    pub bounds: Option<TileBounds>,
    pub force_regenerate: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileBounds {
    pub north: f64,
    pub south: f64,
    pub east: f64,
    pub west: f64,
}

impl TileRequest {
    pub fn validate(&self, min_zoom: u8, max_zoom: u8) -> Result<(), crate::utils::error::TileServiceError> {
        use crate::utils::error::TileServiceError;

        // Validate zoom level
        if self.z < min_zoom || self.z > max_zoom {
            return Err(TileServiceError::InvalidZoomLevel(self.z, min_zoom, max_zoom));
        }

        // Validate tile coordinates for the zoom level
        let max_coord = 2_u32.pow(self.z as u32);
        if self.x >= max_coord || self.y >= max_coord {
            return Err(TileServiceError::InvalidCoordinates(self.z, self.x, self.y));
        }

        Ok(())
    }

    pub fn to_cache_key(&self) -> String {
        format!("tile:{}:{}:{}:{}:{}", self.game_id, self.z, self.x, self.y, self.format)
    }

    pub fn to_file_path(&self, base_path: &str) -> String {
        format!("{}/{}/{}/{}/{}.{}", base_path, self.game_id, self.z, self.x, self.y, self.format)
    }
}