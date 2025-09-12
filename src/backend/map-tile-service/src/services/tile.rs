use crate::{
    config::TileConfig,
    error::TileError,
    models::{Tile, TileFormat, TileGenerationRequest, TileMetadata},
    services::{cache::CacheService, storage::StorageService},
};
use bytes::Bytes;
use image::{imageops::FilterType, DynamicImage, ImageFormat};
use rayon::prelude::*;
use std::sync::Arc;
use crate::models::{Bounds, ZoomLevel};

pub struct TileService {
    cache: Arc<CacheService>,
    storage: Arc<StorageService>,
    config: TileConfig,
}

impl TileService {
    pub fn new(cache: Arc<CacheService>, storage: Arc<StorageService>, config: TileConfig) -> Self {
        Self { cache, storage, config }
    }

    pub async fn get_tile(&self, tile: &Tile) -> Result<Bytes, TileError> {
        let cache_key = self.get_cache_key(tile);

        // Check cache first
        if let Some(data) = self.cache.get(&cache_key).await? {
            log::debug!("Cache hit for tile: {}", cache_key);
            return Ok(data);
        }

        // Fetch from storage
        let storage_key = self.get_storage_key(tile);
        let data = self.storage.get(&storage_key).await?;

        // Store in cache
        self.cache
            .set(&cache_key, &data, self.config.cache_ttl)
            .await?;

        Ok(data)
    }

    pub async fn generate_tiles_from_image(
        &self,
        request: &TileGenerationRequest,
    ) -> Result<TileMetadata, TileError> {
        log::info!("Starting tile generation for map: {}", request.map_id);

        // Download source image
        let image_data = self.download_image(&request.source_image_url).await?;
        let img = image::load_from_memory(&image_data)
            .map_err(|e| TileError::ImageError(e.to_string()))?;

        let format = TileFormat::from_str(&request.format)
            .ok_or_else(|| TileError::InvalidParameters("Invalid format".to_string()))?;

        let mut total_tiles = 0u64;
        let mut zoom_levels = Vec::new();

        // Generate tiles for each zoom level
        for zoom in request.min_zoom..=request.max_zoom {
            let level_info = self
                .generate_tiles_for_zoom(&request.map_id, &img, zoom, &format)
                .await?;
            total_tiles += level_info.tile_count as u64;
            zoom_levels.push(level_info);
        }

        let metadata = TileMetadata {
            map_id: request.map_id.clone(),
            total_tiles,
            zoom_levels,
            bounds: Bounds {
                north: 90.0,
                south: -90.0,
                east: 180.0,
                west: -180.0,
            },
            created_at: chrono::Utc::now().to_rfc3339(),
            format: format.to_string(),
        };

        // Save metadata
        self.save_metadata(&metadata).await?;

        Ok(metadata)
    }

    async fn generate_tiles_for_zoom(
        &self,
        map_id: &str,
        img: &DynamicImage,
        zoom: u8,
        format: &TileFormat,
    ) -> Result<ZoomLevel, TileError> {
        let tiles_per_side = 2u32.pow(zoom as u32);
        let total_size = tiles_per_side * self.config.tile_size;

        // Resize image for this zoom level
        let resized = img.resize_exact(total_size, total_size, FilterType::Lanczos3);

        // Generate tiles in parallel
        let tiles: Vec<_> = (0..tiles_per_side)
            .into_par_iter()
            .flat_map(|x| {
                (0..tiles_per_side)
                    .into_par_iter()
                    .map(move |y| (x, y))
            })
            .collect();

        let tile_size = self.config.tile_size;
        let tiles_generated: Vec<_> = tiles
            .par_iter()
            .map(|(x, y)| {
                let tile = self.extract_tile(&resized, *x, *y, tile_size);
                let tile_data = self.encode_tile(&tile, format, self.config.quality)
                    .map_err(|e| TileError::ImageError(e.to_string()))?;

                let tile_obj = Tile {
                    map_id: map_id.to_string(),
                    z: zoom,
                    x: *x,
                    y: *y,
                    format: format.clone(),
                };

                Ok((tile_obj, tile_data))
            })
            .collect::<Result<Vec<_>, TileError>>()?;

        // Save tiles to storage
        for (tile, data) in tiles_generated {
            let key = self.get_storage_key(&tile);
            self.storage.put(&key, &data).await?;
        }

        Ok(ZoomLevel {
            zoom,
            tile_count: tiles_per_side * tiles_per_side,
            cols: tiles_per_side,
            rows: tiles_per_side,
        })
    }

    fn extract_tile(&self, img: &DynamicImage, x: u32, y: u32, size: u32) -> DynamicImage {
        let x_offset = x * size;
        let y_offset = y * size;
        img.crop_imm(x_offset, y_offset, size, size)
    }

    fn encode_tile(
        &self,
        img: &DynamicImage,
        format: &TileFormat,
        quality: u8,
    ) -> Result<Bytes, image::ImageError> {
        let mut buffer = Vec::new();

        match format {
            TileFormat::PNG => {
                img.write_to(&mut std::io::Cursor::new(&mut buffer), ImageFormat::Png)?;
            }
            TileFormat::JPEG => {
                let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut buffer,
                    quality,
                );
                img.write_with_encoder(encoder)?;
            }
            TileFormat::WEBP => {
                // WebP encoding requires additional handling
                let rgba = img.to_rgba8();
                let (width, height) = (rgba.width(), rgba.height());
                let encoder = webp::Encoder::from_rgba(&rgba, width, height);
                let encoded = encoder.encode(quality as f32);
                buffer = encoded.to_vec();
            }
        }

        Ok(Bytes::from(buffer))
    }

    async fn download_image(&self, url: &str) -> Result<Vec<u8>, TileError> {
        let response = reqwest::get(url)
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?;

        Ok(bytes.to_vec())
    }

    fn get_cache_key(&self, tile: &Tile) -> String {
        format!(
            "tile:{}:{}:{}:{}:{}",
            tile.map_id,
            tile.z,
            tile.x,
            tile.y,
            tile.format.to_string()
        )
    }

    fn get_storage_key(&self, tile: &Tile) -> String {
        format!(
            "{}/{}/{}/{}.{}",
            tile.map_id,
            tile.z,
            tile.x,
            tile.y,
            tile.format.to_string()
        )
    }

    async fn save_metadata(&self, metadata: &TileMetadata) -> Result<(), TileError> {
        let key = format!("{}/metadata.json", metadata.map_id);
        let data = serde_json::to_vec(metadata)
            .map_err(|_e| TileError::InternalError)?;
        self.storage.put(&key, &Bytes::from(data)).await?;
        Ok(())
    }

    pub async fn get_metadata(&self, map_id: &str) -> Result<TileMetadata, TileError> {
        let key = format!("{}/metadata.json", map_id);
        let data = self.storage.get(&key).await?;
        let metadata = serde_json::from_slice(&data)
            .map_err(|_| TileError::InvalidParameters("Invalid metadata".to_string()))?;
        Ok(metadata)
    }

    pub async fn invalidate_cache(&self, map_id: &str) -> Result<(), TileError> {
        self.cache.invalidate_pattern(&format!("tile:{}:*", map_id)).await?;
        Ok(())
    }
}