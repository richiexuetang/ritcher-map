use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use std::sync::Arc;

mod config;
mod error;
mod handlers;
mod models;
mod services;
mod utils;

use config::Config;
use services::{cache::CacheService, storage::StorageService, tile::TileService};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    log::info!("Starting Map Tile Service");

    // Load configuration
    let config = Config::from_env().expect("Failed to load configuration");
    let bind_address = format!("{}:{}", config.server.host, config.server.port);

    // Initialize services
    let cache_service = Arc::new(
        CacheService::new(&config.redis.url)
            .await
            .expect("Failed to connect to Redis"),
    );

    let storage_service = Arc::new(
        StorageService::new(&config.s3)
            .await
            .expect("Failed to initialize S3 client"),
    );

    let tile_service = Arc::new(TileService::new(
        cache_service.clone(),
        storage_service.clone(),
        config.tile.clone(),
    ));

    log::info!("Server starting on {}", bind_address);

    // Start HTTP server
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(tile_service.clone()))
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600),
            )
            .service(
                web::scope("/api/v1")
                    .service(handlers::health)
                    .service(handlers::get_tile)
                    .service(handlers::get_tile_metadata)
                    .service(handlers::generate_tiles)
                    .service(handlers::invalidate_cache)
                    .service(handlers::get_metrics),
            )
    })
        .bind(bind_address)?
        .run()
        .await
}