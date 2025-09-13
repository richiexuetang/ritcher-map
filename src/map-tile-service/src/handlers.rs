use crate::{
    error::TileError,
    models::{Tile, TileFormat, TileGenerationRequest},
    services::tile::TileService,
};
use actix_web::{get, post, web, HttpResponse, Result};
use std::sync::Arc;

#[get("/health")]
pub async fn health() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "map-tile-service",
        "version": "1.0.0"
    })))
}

#[get("/tiles/{map_id}/{z}/{x}/{y}.{format}")]
pub async fn get_tile(
    path: web::Path<(String, u8, u32, u32, String)>,
    tile_service: web::Data<Arc<TileService>>,
) -> Result<HttpResponse> {
    let (map_id, z, x, y, format_str) = path.into_inner();

    let format = TileFormat::from_str(&format_str)
        .ok_or(TileError::InvalidParameters("Invalid format".to_string()))?;

    let tile = Tile {
        map_id,
        z,
        x,
        y,
        format: format.clone(),
    };

    let data = tile_service.get_tile(&tile).await?;

    Ok(HttpResponse::Ok()
        .content_type(format.mime_type())
        .append_header(("Cache-Control", "public, max-age=86400"))
        .append_header(("X-Tile-Coords", format!("{}/{}/{}", z, x, y)))
        .body(data))
}

#[get("/metadata/{map_id}")]
pub async fn get_tile_metadata(
    map_id: web::Path<String>,
    tile_service: web::Data<Arc<TileService>>,
) -> Result<HttpResponse> {
    let metadata = tile_service.get_metadata(&map_id).await?;
    Ok(HttpResponse::Ok().json(metadata))
}

#[post("/generate")]
pub async fn generate_tiles(
    request: web::Json<TileGenerationRequest>,
    tile_service: web::Data<Arc<TileService>>,
) -> Result<HttpResponse> {
    // In production, this should be handled asynchronously with a job queue
    let metadata = tile_service
        .generate_tiles_from_image(&request)
        .await?;

    Ok(HttpResponse::Ok().json(metadata))
}

#[post("/cache/invalidate/{map_id}")]
pub async fn invalidate_cache(
    map_id: web::Path<String>,
    tile_service: web::Data<Arc<TileService>>,
) -> Result<HttpResponse> {
    tile_service.invalidate_cache(&map_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": format!("Cache invalidated for map: {}", map_id)
    })))
}

#[get("/metrics")]
pub async fn get_metrics() -> Result<HttpResponse> {
    // Prometheus metrics endpoint
    use prometheus::{Encoder, TextEncoder};

    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();

    Ok(HttpResponse::Ok()
        .content_type("text/plain; version=0.0.4")
        .body(buffer))
}