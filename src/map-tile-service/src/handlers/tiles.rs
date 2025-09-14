use actix_web::{delete, get, post, web, HttpRequest, HttpResponse, Result};
use crate::config::Config;
use crate::models::tile::{TileGenerationRequest, TileRequest};
use crate::services::{cache_manager::CacheManager, tile_generator::TileGenerator};
use crate::utils::error::TileServiceError;

#[get("/tiles/{game_id}/{z}/{x}/{y}.{format}")]
pub async fn get_tile(
    path: web::Path<(String, u8, u32, u32, String)>,
    config: web::Data<Config>,
    generator: web::Data<TileGenerator>,
    cache: web::Data<CacheManager>,
    req: HttpRequest,
) -> Result<HttpResponse, TileServiceError> {
    let (game_id, z, x, y, format) = path.into_inner();

    let tile_request = TileRequest {
        game_id: game_id.clone(),
        z,
        x,
        y,
        format: format.clone(),
    };

    // Validate request parameters
    tile_request.validate(config.tile.min_zoom, config.tile.max_zoom)?;

    // Check if client has cached version (ETag)
    if let Some(if_none_match) = req.headers().get("if-none-match") {
        let cache_key = tile_request.to_cache_key();
        if let Ok(cached_etag) = cache.get_etag(&cache_key).await {
            if if_none_match.to_str().unwrap_or("") == cached_etag {
                return Ok(HttpResponse::NotModified().finish());
            }
        }
    }

    // Try to get from cache first
    let cache_key = tile_request.to_cache_key();
    if let Ok(Some(cached_tile)) = cache.get_tile(&cache_key).await {
        return Ok(HttpResponse::Ok()
            .insert_header(("content-type", cached_tile.content_type))
            .insert_header(("etag", cached_tile.etag))
            .insert_header(("cache-control", format!("public, max-age={}, stale-while-revalidate={}",
                                                     config.tile.cache_headers.max_age,
                                                     config.tile.cache_headers.stale_while_revalidate)))
            .body(cached_tile.data));
    }

    // Generate tile if not in cache
    let tile_response = generator.generate_tile(&tile_request).await?;

    // Store in cache for future requests
    if let Err(e) = cache.set_tile(&cache_key, &tile_response).await {
        tracing::warn!("Failed to cache tile {}: {}", cache_key, e);
    }

    // Update access metrics
    // metrics::TILE_REQUESTS_TOTAL
    //     .with_label_values(&[&game_id, &z.to_string(), &format])
    //     .inc();

    Ok(HttpResponse::Ok()
        .insert_header(("content-type", tile_response.content_type))
        .insert_header(("etag", tile_response.etag))
        .insert_header(("cache-control", format!("public, max-age={}, stale-while-revalidate={}",
                                                 config.tile.cache_headers.max_age,
                                                 config.tile.cache_headers.stale_while_revalidate)))
        .body(tile_response.data))
}

#[post("/tiles/generate")]
pub async fn generate_tiles(
    request: web::Json<TileGenerationRequest>,
    generator: web::Data<TileGenerator>,
    cache: web::Data<CacheManager>,
) -> Result<HttpResponse, TileServiceError> {
    let req = request.into_inner();

    // Default to common zoom levels if not specified
    let zoom_levels = req.zoom_levels.unwrap_or_else(|| vec![1, 2, 3, 4, 5, 6, 7, 8]);

    // Start background tile generation
    let generated_tiles = generator
        .generate_tiles_batch(&req.game_id, zoom_levels, req.bounds)
        .await?;

    // Optionally invalidate cache if force_regenerate is true
    if req.force_regenerate.unwrap_or(false) {
        if let Err(e) = cache.invalidate_game_tiles(&req.game_id).await {
            tracing::warn!("Failed to invalidate cache for game {}: {}", req.game_id, e);
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Tile generation completed",
        "generated_count": generated_tiles.len(),
        "tiles": generated_tiles
    })))
}

#[delete("/tiles/cache/{game_id}")]
pub async fn delete_cache(
    path: web::Path<String>,
    cache: web::Data<CacheManager>,
) -> Result<HttpResponse, TileServiceError> {
    let game_id = path.into_inner();

    // Invalidate all cached tiles for the game
    cache.invalidate_game_tiles(&game_id).await?;

    // Update cache invalidation metrics
    // metrics::CACHE_INVALIDATIONS_TOTAL
    //     .with_label_values(&[&game_id])
    //     .inc();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Cache cleared successfully",
        "game_id": game_id
    })))
}