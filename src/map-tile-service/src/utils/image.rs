use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use crate::error::ServiceError;

pub fn calculate_tiles(dimension: u32, tile_size: u32) -> u32 {
    (dimension as f32 / tile_size as f32).ceil() as u32
}

pub fn calculate_optimal_tile_size(width: u32, height: u32) -> u32 {
    let max_dim = width.max(height);
    if max_dim <= 512 {
        128
    } else if max_dim <= 2048 {
        256
    } else if max_dim <= 8192 {
        512
    } else {
        1024
    }
}

/// Calculate the maximum zoom level for an image
pub fn calculate_max_zoom(width: u32, height: u32, tile_size: u32) -> u32 {
    let max_dimension = width.max(height);
    let tiles_at_max = (max_dimension as f32 / tile_size as f32).ceil();
    (tiles_at_max.log2().ceil() as u32).max(1).min(20)
}

/// Get image format from file extension
pub fn get_format_from_extension(ext: &str) -> Option<ImageFormat> {
    match ext.to_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "gif" => Some(ImageFormat::Gif),
        "webp" => Some(ImageFormat::WebP),
        "tiff" | "tif" => Some(ImageFormat::Tiff),
        "bmp" => Some(ImageFormat::Bmp),
        _ => None,
    }
}

/// Validate image data
pub fn validate_image_data(data: &[u8]) -> Result<(u32, u32, String), ServiceError> {
    let cursor = Cursor::new(data).into_inner();

    // Try to detect format
    let format = image::guess_format(cursor)
        .map_err(|e| ServiceError::InvalidInput(format!("Invalid image format: {}", e)))?;

    // Load image to get dimensions
    let img = image::load(Cursor::new(data), format)
        .map_err(|e| ServiceError::ImageError(e))?;

    let (width, height) = img.dimensions();

    // Validate dimensions
    const MAX_DIMENSION: u32 = 65536;
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(ServiceError::InvalidInput(
            format!("Image dimensions too large: {}x{} (max: {}x{})",
                    width, height, MAX_DIMENSION, MAX_DIMENSION)
        ));
    }

    if width == 0 || height == 0 {
        return Err(ServiceError::InvalidInput(
            "Image has zero dimensions".to_string()
        ));
    }

    let format_str = match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::Gif => "gif",
        ImageFormat::WebP => "webp",
        ImageFormat::Tiff => "tiff",
        ImageFormat::Bmp => "bmp",
        _ => "unknown",
    }.to_string();

    Ok((width, height, format_str))
}

/// Calculate memory usage for an image
pub fn calculate_memory_usage(width: u32, height: u32, channels: u32, bits_per_channel: u32) -> u64 {
    (width as u64) * (height as u64) * (channels as u64) * (bits_per_channel as u64 / 8)
}

/// Resize image maintaining aspect ratio
pub fn resize_preserve_aspect(
    img: &DynamicImage,
    max_width: u32,
    max_height: u32,
) -> DynamicImage {
    let (width, height) = img.dimensions();

    let width_ratio = max_width as f32 / width as f32;
    let height_ratio = max_height as f32 / height as f32;
    let scale = width_ratio.min(height_ratio);

    let new_width = (width as f32 * scale) as u32;
    let new_height = (height as f32 * scale) as u32;

    img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
}

/// Convert image to RGB8 format
pub fn ensure_rgb8(img: DynamicImage) -> DynamicImage {
    match img {
        DynamicImage::ImageRgb8(_) => img,
        _ => DynamicImage::ImageRgb8(img.to_rgb8()),
    }
}

/// Convert image to RGBA8 format
pub fn ensure_rgba8(img: DynamicImage) -> DynamicImage {
    match img {
        DynamicImage::ImageRgba8(_) => img,
        _ => DynamicImage::ImageRgba8(img.to_rgba8()),
    }
}

/// Calculate a hash for image data
pub fn calculate_image_hash(data: &[u8]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_tiles() {
        assert_eq!(calculate_tiles(1000, 256), 4);
        assert_eq!(calculate_tiles(256, 256), 1);
        assert_eq!(calculate_tiles(257, 256), 2);
    }

    #[test]
    fn test_calculate_max_zoom() {
        assert_eq!(calculate_max_zoom(1024, 1024, 256), 2);
        assert_eq!(calculate_max_zoom(2048, 2048, 256), 3);
        assert_eq!(calculate_max_zoom(4096, 4096, 256), 4);
    }

    #[test]
    fn test_calculate_optimal_tile_size() {
        assert_eq!(calculate_optimal_tile_size(512, 512), 128);
        assert_eq!(calculate_optimal_tile_size(1024, 1024), 256);
        assert_eq!(calculate_optimal_tile_size(4096, 4096), 512);
        assert_eq!(calculate_optimal_tile_size(16384, 16384), 1024);
    }

    #[test]
    fn test_get_format_from_extension() {
        assert_eq!(get_format_from_extension("png"), Some(ImageFormat::Png));
        assert_eq!(get_format_from_extension("jpg"), Some(ImageFormat::Jpeg));
        assert_eq!(get_format_from_extension("JPEG"), Some(ImageFormat::Jpeg));
        assert_eq!(get_format_from_extension("xyz"), None);
    }

    #[test]
    fn test_calculate_memory_usage() {
        // RGBA image 1024x1024, 8 bits per channel
        assert_eq!(calculate_memory_usage(1024, 1024, 4, 8), 4_194_304);

        // RGB image 100x100, 8 bits per channel
        assert_eq!(calculate_memory_usage(100, 100, 3, 8), 30_000);
    }
}