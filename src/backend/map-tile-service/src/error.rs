use actix_web::{error::ResponseError, http::StatusCode, HttpResponse};

#[derive(Debug, thiserror::Error)]
pub enum TileError {
    #[error("Tile not found")]
    NotFound,

    #[error("Invalid parameters: {0}")]
    InvalidParameters(String),

    #[error("Cache error: {0}")]
    CacheError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Image processing error: {0}")]
    ImageError(String),

    #[error("Internal server error")]
    InternalError,
}

impl ResponseError for TileError {
    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        HttpResponse::build(status).json(serde_json::json!({
            "error": self.to_string(),
            "status": status.as_u16(),
        }))
    }

    fn status_code(&self) -> StatusCode {
        match self {
            TileError::NotFound => StatusCode::NOT_FOUND,
            TileError::InvalidParameters(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}