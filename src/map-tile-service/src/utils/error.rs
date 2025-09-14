use actix_web::{HttpResponse, ResponseError};
use std::fmt;

#[derive(Debug, thiserror::Error)]
pub enum TileServiceError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Image processing error: {0}")]
    ImageProcessing(#[from] image::ImageError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Tile not found: game={0}, z={1}, x={2}, y={3}")]
    TileNotFound(String, u8, u32, u32),

    #[error("Invalid tile coordinates: z={0}, x={1}, y={2}")]
    InvalidCoordinates(u8, u32, u32),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("Game not found: {0}")]
    GameNotFound(String),

    #[error("Invalid zoom level: {0} (min: {1}, max: {2})")]
    InvalidZoomLevel(u8, u8, u8),

    #[error("Configuration error: {0}")]
    Configuration(String),

    #[error("Internal server error: {0}")]
    Internal(String),
}

impl ResponseError for TileServiceError {
    fn error_response(&self) -> HttpResponse {
        match self {
            TileServiceError::TileNotFound(_, _, _, _) => {
                HttpResponse::NotFound().json(ErrorResponse::new("TILE_NOT_FOUND", &self.to_string()))
            }
            TileServiceError::InvalidCoordinates(_, _, _) |
            TileServiceError::InvalidZoomLevel(_, _, _) => {
                HttpResponse::BadRequest().json(ErrorResponse::new("INVALID_PARAMETERS", &self.to_string()))
            }
            TileServiceError::UnsupportedFormat(_) => {
                HttpResponse::BadRequest().json(ErrorResponse::new("UNSUPPORTED_FORMAT", &self.to_string()))
            }
            TileServiceError::GameNotFound(_) => {
                HttpResponse::NotFound().json(ErrorResponse::new("GAME_NOT_FOUND", &self.to_string()))
            }
            _ => {
                tracing::error!("Internal server error: {}", self);
                HttpResponse::InternalServerError().json(ErrorResponse::new("INTERNAL_ERROR", "An unexpected error occurred"))
            }
        }
    }
}

#[derive(serde::Serialize)]
struct ErrorResponse {
    error: ErrorDetail,
    timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Serialize)]
struct ErrorDetail {
    code: String,
    message: String,
}

impl ErrorResponse {
    fn new(code: &str, message: &str) -> Self {
        Self {
            error: ErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
            },
            timestamp: chrono::Utc::now(),
        }
    }
}