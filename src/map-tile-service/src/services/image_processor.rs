use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use std::io::Cursor;
use crate::utils::error::TileServiceError;

pub struct ImageProcessor {
    pub tile_size: u32,
    pub compression_quality: u8,
}

impl ImageProcessor {
    pub fn new(tile_size: u32, compression_quality: u8) -> Self {
        Self {
            tile_size,
            compression_quality,
        }
    }

    /// Create a blank tile with transparency
    pub fn create_blank_tile(&self, format: &str) -> Result<Vec<u8>, TileServiceError> {
        let img = ImageBuffer::from_fn(self.tile_size, self.tile_size, |_x, _y| {
            Rgba([0, 0, 0, 0]) // Transparent
        });

        let dynamic_img = DynamicImage::ImageRgba8(img);
        self.encode_image(&dynamic_img, format)
    }

    /// Resize image to tile size
    pub fn resize_to_tile(&self, image: &DynamicImage) -> DynamicImage {
        image.resize_exact(
            self.tile_size,
            self.tile_size,
            image::imageops::FilterType::Lanczos3,
        )
    }

    /// Crop image to specific bounds within the tile
    pub fn crop_image(&self, image: &DynamicImage, x: u32, y: u32, width: u32, height: u32) -> Result<DynamicImage, TileServiceError> {
        if x + width > image.width() || y + height > image.height() {
            return Err(TileServiceError::Internal("Crop bounds exceed image dimensions".to_string()));
        }

        Ok(image.crop_imm(x, y, width, height))
    }

    /// Encode image to specified format
    pub fn encode_image(&self, image: &DynamicImage, format: &str) -> Result<Vec<u8>, TileServiceError> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        match format.to_lowercase().as_str() {
            "png" => {
                image.write_to(&mut cursor, ImageFormat::Png)?;
            }
            "jpg" | "jpeg" => {
                // Convert to RGB if it has alpha channel
                let rgb_image = if image.color().has_alpha() {
                    DynamicImage::ImageRgb8(image.to_rgb8())
                } else {
                    image.clone()
                };
                rgb_image.write_to(&mut cursor, ImageFormat::Jpeg)?;
            }
            "webp" => {
                // For WebP, we need to handle it differently
                let rgb_image = image.to_rgb8();
                let webp_data = self.encode_webp(&rgb_image)?;
                return Ok(webp_data);
            }
            _ => {
                return Err(TileServiceError::UnsupportedFormat(format.to_string()));
            }
        }

        Ok(buffer)
    }

    /// Encode image as WebP
    fn encode_webp(&self, image: &image::RgbImage) -> Result<Vec<u8>, TileServiceError> {
        // Simplified WebP encoding - in production, use libwebp bindings
        // For now, fallback to PNG
        let dynamic_img = DynamicImage::ImageRgb8(image.clone());
        self.encode_image(&dynamic_img, "png")
    }

    /// Apply compression based on format
    pub fn optimize_for_web(&self, image_data: Vec<u8>, format: &str) -> Result<Vec<u8>, TileServiceError> {
        match format.to_lowercase().as_str() {
            "jpg" | "jpeg" => self.optimize_jpeg(image_data),
            "png" => self.optimize_png(image_data),
            "webp" => Ok(image_data), // Already optimized during encoding
            _ => Ok(image_data),
        }
    }

    fn optimize_jpeg(&self, data: Vec<u8>) -> Result<Vec<u8>, TileServiceError> {
        // Load and re-encode with specified quality
        let img = image::load_from_memory(&data)?;
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // Convert to RGB and save with quality
        let rgb_img = img.to_rgb8();
        let dynamic_img = DynamicImage::ImageRgb8(rgb_img);

        // Note: image crate doesn't support quality settings directly
        // In production, use mozjpeg or similar for better compression
        dynamic_img.write_to(&mut cursor, ImageFormat::Jpeg)?;

        Ok(buffer)
    }

    fn optimize_png(&self, data: Vec<u8>) -> Result<Vec<u8>, TileServiceError> {
        // PNG optimization could use oxipng or similar
        // For now, return as-is
        Ok(data)
    }

    /// Composite multiple images into a single tile
    pub fn composite_images(&self, base: &DynamicImage, overlays: Vec<(DynamicImage, u32, u32)>) -> DynamicImage {
        let mut result = base.clone();

        for (overlay, x, y) in overlays {
            // Simple alpha blending - in production, use imageproc for better compositing
            result = self.blend_images(&result, &overlay, x, y);
        }

        result
    }

    fn blend_images(&self, base: &DynamicImage, overlay: &DynamicImage, x: u32, y: u32) -> DynamicImage {
        let mut base_rgba = base.to_rgba8();
        let overlay_rgba = overlay.to_rgba8();

        for (ox, oy, pixel) in overlay_rgba.enumerate_pixels() {
            let target_x = x + ox;
            let target_y = y + oy;

            if target_x < base_rgba.width() && target_y < base_rgba.height() {
                let base_pixel = base_rgba.get_pixel_mut(target_x, target_y);
                *base_pixel = self.alpha_blend(*base_pixel, *pixel);
            }
        }

        DynamicImage::ImageRgba8(base_rgba)
    }

    fn alpha_blend(&self, base: Rgba<u8>, overlay: Rgba<u8>) -> Rgba<u8> {
        let alpha = overlay[3] as f32 / 255.0;
        let inv_alpha = 1.0 - alpha;

        Rgba([
            (overlay[0] as f32 * alpha + base[0] as f32 * inv_alpha) as u8,
            (overlay[1] as f32 * alpha + base[1] as f32 * inv_alpha) as u8,
            (overlay[2] as f32 * alpha + base[2] as f32 * inv_alpha) as u8,
            ((overlay[3] as f32 * alpha + base[3] as f32 * inv_alpha) as u8).max(overlay[3]),
        ])
    }
}