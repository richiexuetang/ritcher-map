use actix_web::{error::ResponseError, HttpResponse};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ServiceError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Image processing error: {0}")]
    ImageError(#[from] image::ImageError),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Job not found: {0}")]
    JobNotFound(String),

    #[error("Tileset not found: {0}")]
    TilesetNotFound(String),

    #[error("Tile not found: z={0}, x={1}, y={2}")]
    TileNotFound(u32, u32, u32),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Processing failed: {0}")]
    ProcessingError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),
}

#[derive(Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
    pub details: Option<String>,
}

impl ResponseError for ServiceError {
    fn error_response(&self) -> HttpResponse {
        let (mut status, code) = match self {
            ServiceError::JobNotFound(_) |
            ServiceError::TilesetNotFound(_) |
            ServiceError::TileNotFound(_, _, _) => {
                (HttpResponse::NotFound(), "NOT_FOUND")
            }
            ServiceError::InvalidInput(_) => {
                (HttpResponse::BadRequest(), "INVALID_INPUT")
            }
            ServiceError::Unauthorized(_) => {
                (HttpResponse::Unauthorized(), "UNAUTHORIZED")
            }
            _ => {
                (HttpResponse::InternalServerError(), "INTERNAL_ERROR")
            }
        };

        status.json(ErrorResponse {
            error: self.to_string(),
            code: code.to_string(),
            details: None,
        })
    }
}

pub type Result<T> = std::result::Result<T, ServiceError>;