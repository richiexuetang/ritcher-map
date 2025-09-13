use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tile {
    pub map_id: String,
    pub z: u8,
    pub x: u32,
    pub y: u32,
    pub format: TileFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TileFormat {
    PNG,
    JPEG,
    WEBP,
}

impl TileFormat {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "png" => Some(TileFormat::PNG),
            "jpeg" | "jpg" => Some(TileFormat::JPEG),
            "webp" => Some(TileFormat::WEBP),
            _ => None,
        }
    }

    pub fn to_string(&self) -> String {
        match self {
            TileFormat::PNG => "png".to_string(),
            TileFormat::JPEG => "jpeg".to_string(),
            TileFormat::WEBP => "webp".to_string(),
        }
    }

    pub fn mime_type(&self) -> &str {
        match self {
            TileFormat::PNG => "image/png",
            TileFormat::JPEG => "image/jpeg",
            TileFormat::WEBP => "image/webp",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileMetadata {
    pub map_id: String,
    pub total_tiles: u64,
    pub zoom_levels: Vec<ZoomLevel>,
    pub bounds: Bounds,
    pub created_at: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomLevel {
    pub zoom: u8,
    pub tile_count: u32,
    pub cols: u32,
    pub rows: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub north: f64,
    pub south: f64,
    pub east: f64,
    pub west: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileGenerationRequest {
    pub map_id: String,
    pub source_image_url: String,
    pub min_zoom: u8,
    pub max_zoom: u8,
    pub format: String,
}