use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Game {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub map_bounds: Option<String>, // PostGIS POLYGON as WKT
    pub max_zoom_level: i32,
    pub min_zoom_level: i32,
    pub tile_size: i32,
    pub base_map_url: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameBounds {
    pub north: f64,
    pub south: f64,
    pub east: f64,
    pub west: f64,
}

impl Game {
    pub fn get_bounds(&self) -> Option<GameBounds> {
        self.map_bounds.as_ref().and_then(|wkt| {
            // Parse WKT POLYGON to extract bounds
            // Simplified parsing - in production, use a proper WKT parser
            Self::parse_bounds_from_wkt(wkt)
        })
    }

    fn parse_bounds_from_wkt(wkt: &str) -> Option<GameBounds> {
        // Simplified WKT parsing for POLYGON((west south, east south, east north, west north, west south))
        if !wkt.starts_with("POLYGON((") || !wkt.ends_with("))") {
            return None;
        }

        let coords_str = &wkt[9..wkt.len()-2]; // Remove "POLYGON((" and "))"
        let points: Vec<&str> = coords_str.split(',').collect();

        if points.len() < 4 {
            return None;
        }

        let mut west = f64::INFINITY;
        let mut east = f64::NEG_INFINITY;
        let mut south = f64::INFINITY;
        let mut north = f64::NEG_INFINITY;

        for point_str in points {
            let coords: Vec<&str> = point_str.trim().split_whitespace().collect();
            if coords.len() != 2 {
                continue;
            }

            if let (Ok(lng), Ok(lat)) = (coords[0].parse::<f64>(), coords[1].parse::<f64>()) {
                west = west.min(lng);
                east = east.max(lng);
                south = south.min(lat);
                north = north.max(lat);
            }
        }

        if west.is_infinite() || east.is_infinite() || south.is_infinite() || north.is_infinite() {
            return None;
        }

        Some(GameBounds { north, south, east, west })
    }
}