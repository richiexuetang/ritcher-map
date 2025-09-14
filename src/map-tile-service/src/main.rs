use actix_web::{middleware as actix_middleware, web, App, HttpServer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod database;
mod handlers;
mod models;
mod services;
mod utils;
mod middleware;

use crate::config::Config;
use crate::database::connection::create_database_pool;
use crate::handlers::{health, tiles};
use crate::services::{
    cache_manager::CacheManager,
    image_processor::ImageProcessor,
    tile_generator::TileGenerator,
};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "map_tile_service=info,actix_web=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::load().expect("Failed to load configuration");

    tracing::info!("Starting Map Tile Service on {}:{}", config.server.host, config.server.port);

    // Initialize database pool
    let db_pool = create_database_pool(&config.database).await
        .expect("Failed to create database pool");

    // Initialize Redis client
    let redis_client = redis::Client::open(config.redis.url.as_str())
        .expect("Failed to create Redis client");

    // Initialize cache manager
    let cache_manager = web::Data::new(
        CacheManager::new(redis_client, config.redis.ttl_seconds)
            .await
            .expect("Failed to create cache manager")
    );

    // Initialize services
    let image_processor = ImageProcessor::new(
        config.tile.tile_size,
        config.tile.compression_quality,
    );

    let tile_generator = web::Data::new(TileGenerator::new(
        db_pool.clone(),
        image_processor,
    ));

    let worker_count = config.server.workers.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    });

    let bind_value = format!("{}:{}", config.server.host, config.server.port);
    // Start HTTP server
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(db_pool.clone()))
            .app_data(tile_generator.clone())
            .app_data(cache_manager.clone())
            .wrap(actix_middleware::Logger::default())
            .wrap(actix_middleware::NormalizePath::trim())
            .wrap(middleware::cors())
            .service(
                web::scope("/api/v1")
                    .service(tiles::get_tile)
                    .service(tiles::generate_tiles)
                    .service(tiles::delete_cache)
            )
            .service(health::health_check)
    })
        .workers(worker_count)
        .bind(bind_value)?
        .run()
        .await
}
