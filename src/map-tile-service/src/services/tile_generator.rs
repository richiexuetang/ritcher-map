use crate::database::connection::DatabasePool;
use crate::models::{game::Game, tile::*};
use crate::services::image_processor::ImageProcessor;
use crate::utils::{error::TileServiceError, spatial::TileCoordinate};
use image::DynamicImage;
use uuid::Uuid;

pub struct TileGenerator {
    pub db: DatabasePool,
    pub image_processor: ImageProcessor,
}

#[derive(sqlx::FromRow)]
struct MarkerData {
    id: Uuid,
    position: String, // PostGIS POINT as WKT
    marker_type: String,
    title: String,
    metadata: serde_json::Value,
}

struct LatLng {
    lat: f64,
    lng: f64,
}

impl MarkerData {
    fn get_position(&self) -> Option<LatLng> {
        // Parse WKT POINT(lng lat) format
        if !self.position.starts_with("POINT(") || !self.position.ends_with(")") {
            return None;
        }

        let coords_str = &self.position[6..self.position.len()-1]; // Remove "POINT(" and ")"
        let coords: Vec<&str> = coords_str.split_whitespace().collect();

        if coords.len() != 2 {
            return None;
        }

        if let (Ok(lng), Ok(lat)) = (coords[0].parse::<f64>(), coords[1].parse::<f64>()) {
            Some(LatLng { lat, lng })
        } else {
            None
        }
    }
}

impl TileGenerator {
    pub fn new(db: DatabasePool, image_processor: ImageProcessor) -> Self {
        Self {
            db,
            image_processor,
        }
    }

    /// Generate a single tile
    pub async fn generate_tile(&self, request: &TileRequest) -> Result<TileResponse, TileServiceError> {
        // Validate request
        request.validate(0, 18)?;

        // Get game information
        let game = self.get_game(&request.game_id).await?;

        // Generate tile based on available data
        let tile_data = self.create_tile(&game, request).await?;

        // Generate cache key and ETag
        let cache_key = request.to_cache_key();
        let etag = self.generate_etag(&tile_data);
        let content_type = self.get_content_type(&request.format);

        Ok(TileResponse {
            data: tile_data,
            content_type,
            cache_key,
            etag,
        })
    }

    /// Generate multiple tiles in batch
    pub async fn generate_tiles_batch(&self, game_id: &str, zoom_levels: Vec<u8>, bounds: Option<TileBounds>) -> Result<Vec<TileMetadata>, TileServiceError> {
        let game = self.get_game(game_id).await?;
        let mut generated_tiles = Vec::new();

        for zoom in zoom_levels {
            let tiles = if let Some(bounds) = &bounds {
                TileCoordinate::tiles_in_bounds(bounds, zoom)
            } else {
                // Generate all tiles for the game bounds
                if let Some(game_bounds) = game.get_bounds() {
                    let tile_bounds = TileBounds {
                        north: game_bounds.north,
                        south: game_bounds.south,
                        east: game_bounds.east,
                        west: game_bounds.west,
                    };
                    TileCoordinate::tiles_in_bounds(&tile_bounds, zoom)
                } else {
                    continue; // Skip if no bounds defined
                }
            };

            for tile_coord in tiles {
                let request = TileRequest {
                    game_id: game_id.to_string(),
                    z: tile_coord.z,
                    x: tile_coord.x,
                    y: tile_coord.y,
                    format: "png".to_string(),
                };

                match self.generate_and_store_tile(&game, &request).await {
                    Ok(metadata) => generated_tiles.push(metadata),
                    Err(e) => {
                        tracing::warn!("Failed to generate tile {:?}: {}", request, e);
                        continue;
                    }
                }
            }
        }

        Ok(generated_tiles)
    }

    async fn create_tile(&self, game: &Game, request: &TileRequest) -> Result<Vec<u8>, TileServiceError> {
        // Get tile bounds
        let tile_coord = TileCoordinate {
            x: request.x,
            y: request.y,
            z: request.z,
        };
        let bounds = tile_coord.to_bounds();

        // Start with base map or blank tile
        let mut base_image = if let Some(base_url) = &game.base_map_url {
            self.fetch_base_map_tile(base_url, request).await
                .unwrap_or_else(|_| self.create_blank_base_tile())
        } else {
            self.create_blank_base_tile()
        };

        // Get markers within tile bounds
        let markers = self.get_markers_in_bounds(game.id, &bounds).await?;

        // Render markers onto tile
        if !markers.is_empty() {
            base_image = self.render_markers_on_tile(base_image, &markers, &bounds).await?;
        }

        // Resize to standard tile size
        let resized_image = self.image_processor.resize_to_tile(&base_image);

        // Encode to requested format
        self.image_processor.encode_image(&resized_image, &request.format)
    }

    async fn fetch_base_map_tile(&self, base_url: &str, request: &TileRequest) -> Result<DynamicImage, TileServiceError> {
        let tile_url = format!("{}/{}/{}/{}.png", base_url, request.z, request.x, request.y);

        let response = reqwest::get(&tile_url).await
            .map_err(|e| TileServiceError::Internal(format!("Failed to fetch base map: {}", e)))?;

        let image_data = response.bytes().await
            .map_err(|e| TileServiceError::Internal(format!("Failed to read base map data: {}", e)))?;

        let image = image::load_from_memory(&image_data)?;
        Ok(image)
    }

    fn create_blank_base_tile(&self) -> DynamicImage {
        // Create a simple base tile with grid lines or solid color
        let tile_size = self.image_processor.tile_size;
        let mut img = image::RgbaImage::new(tile_size, tile_size);

        // Fill with light gray background
        for pixel in img.pixels_mut() {
            *pixel = image::Rgba([240, 240, 240, 255]);
        }

        DynamicImage::ImageRgba8(img)
    }

    async fn get_markers_in_bounds(&self, game_id: Uuid, bounds: &TileBounds) -> Result<Vec<MarkerData>, TileServiceError> {
        let query = r#"
            SELECT id, position, marker_type, title, metadata
            FROM markers
            WHERE game_id = $1
            AND ST_Intersects(
                position,
                ST_MakeEnvelope($2, $3, $4, $5, 4326)
            )
            AND visibility_level > 0
        "#;

        let markers = sqlx::query_as::<_, MarkerData>(query)
            .bind(game_id)
            .bind(bounds.west)
            .bind(bounds.south)
            .bind(bounds.east)
            .bind(bounds.north)
            .fetch_all(&self.db)
            .await?;

        Ok(markers)
    }

    async fn render_markers_on_tile(&self, base_image: DynamicImage, markers: &[MarkerData], bounds: &TileBounds) -> Result<DynamicImage, TileServiceError> {
        let mut result = base_image;
        let tile_size = self.image_processor.tile_size as f64;

        for marker in markers {
            // Convert marker position to pixel coordinates within tile
            if let Some(position) = marker.get_position() {
                let pixel_pos = self.lat_lng_to_pixel(&position, bounds, tile_size);

                // Get marker icon based on type
                let icon = self.get_marker_icon(&marker.marker_type).await?;

                // Composite icon onto tile
                let overlays = vec![(icon, pixel_pos.0 as u32, pixel_pos.1 as u32)];
                result = self.image_processor.composite_images(&result, overlays);
            }
        }

        Ok(result)
    }

    fn lat_lng_to_pixel(&self, position: &LatLng, bounds: &TileBounds, tile_size: f64) -> (f64, f64) {
        let x = (position.lng - bounds.west) / (bounds.east - bounds.west) * tile_size;
        let y = (bounds.north - position.lat) / (bounds.north - bounds.south) * tile_size;
        (x, y)
    }

    async fn get_marker_icon(&self, marker_type: &str) -> Result<DynamicImage, TileServiceError> {
        // In production, load from icon cache or file system
        // For now, create a simple colored circle
        let size = 16u32;
        let mut img = image::RgbaImage::new(size, size);

        let color = match marker_type {
            "treasure" => [255, 215, 0, 255],   // Gold
            "enemy" => [255, 0, 0, 255],        // Red
            "npc" => [0, 255, 0, 255],          // Green
            "poi" => [0, 0, 255, 255],          // Blue
            _ => [128, 128, 128, 255],          // Gray
        };

        let center = (size / 2) as i32;
        let radius = (size / 2 - 2) as i32;

        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let dx = x as i32 - center;
            let dy = y as i32 - center;
            let distance = (dx * dx + dy * dy) as f64;

            if distance <= (radius * radius) as f64 {
                *pixel = image::Rgba(color);
            } else {
                *pixel = image::Rgba([0, 0, 0, 0]); // Transparent
            }
        }

        Ok(DynamicImage::ImageRgba8(img))
    }

    async fn generate_and_store_tile(&self, game: &Game, request: &TileRequest) -> Result<TileMetadata, TileServiceError> {
        let tile_data = self.create_tile(game, request).await?;
        let content_hash = self.calculate_hash(&tile_data);

        // Store metadata in database
        let metadata = TileMetadata {
            id: Uuid::new_v4(),
            game_id: game.id,
            zoom_level: request.z as i32,
            tile_x: request.x as i32,
            tile_y: request.y as i32,
            format: request.format.clone(),
            file_size: tile_data.len() as i64,
            content_hash,
            created_at: chrono::Utc::now(),
            last_accessed: None,
        };

        let query = r#"
            INSERT INTO tile_metadata
            (id, game_id, zoom_level, tile_x, tile_y, format, file_size, content_hash, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (game_id, zoom_level, tile_x, tile_y, format)
            DO UPDATE SET
                file_size = EXCLUDED.file_size,
                content_hash = EXCLUDED.content_hash,
                created_at = EXCLUDED.created_at
        "#;

        sqlx::query(query)
            .bind(metadata.id)
            .bind(metadata.game_id)
            .bind(metadata.zoom_level)
            .bind(metadata.tile_x)
            .bind(metadata.tile_y)
            .bind(&metadata.format)
            .bind(metadata.file_size)
            .bind(&metadata.content_hash)
            .bind(metadata.created_at)
            .execute(&self.db)
            .await?;

        Ok(metadata)
    }

    async fn get_game(&self, game_id: &str) -> Result<Game, TileServiceError> {
        let uuid = Uuid::parse_str(game_id)
            .map_err(|_| TileServiceError::GameNotFound(game_id.to_string()))?;

        let game = sqlx::query_as::<_, Game>("SELECT * FROM games WHERE id = $1")
            .bind(uuid)
            .fetch_optional(&self.db)
            .await?
            .ok_or_else(|| TileServiceError::GameNotFound(game_id.to_string()))?;

        Ok(game)
    }

    fn generate_etag(&self, data: &[u8]) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        data.hash(&mut hasher);
        format!("\"{}\"", hasher.finish())
    }

    fn calculate_hash(&self, data: &[u8]) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        data.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    fn get_content_type(&self, format: &str) -> String {
        match format.to_lowercase().as_str() {
            "png" => "image/png".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "webp" => "image/webp".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }
}