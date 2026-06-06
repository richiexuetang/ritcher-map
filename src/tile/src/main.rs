//! Production entrypoint: wire PostGIS + a tile origin into the Axum app.
//!
//! Env:
//!   DATABASE_URL   postgres://user:pass@host/db   (required)
//!   TILE_ORIGIN    local:/path/to/tiles  |  http://cdn-or-bucket/base   (required)
//!   BIND_ADDR      default 0.0.0.0:8080
//!   TILE_CACHE_MB  in-process tile cache budget, default 256

use std::sync::Arc;

use tile_service::domain::ClusterConfig;
use tile_service::http::{router, AppState};
use tile_service::repo::PgMarkerRepo;
use tile_service::tiles::{CachedTiles, HttpTileOrigin, LocalTileOrigin, TileOrigin};

use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tile_service=debug".into()),
        )
        .init();

    let db_url = std::env::var("DATABASE_URL")?;
    let origin_spec = std::env::var("TILE_ORIGIN")?;
    let bind = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let cache_mb: u64 = std::env::var("TILE_CACHE_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(256);

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(16)
        .connect(&db_url)
        .await?;
    let repo = PgMarkerRepo::new(pool);

    // One generic AppState type per origin kind; pick at startup.
    if let Some(path) = origin_spec.strip_prefix("local:") {
        let tiles = CachedTiles::new(LocalTileOrigin::new(path), cache_mb * 1024 * 1024);
        serve(repo, tiles, &bind).await
    } else {
        let tiles = CachedTiles::new(HttpTileOrigin::new(origin_spec), cache_mb * 1024 * 1024);
        serve(repo, tiles, &bind).await
    }
}

async fn serve<O: TileOrigin>(
    repo: PgMarkerRepo,
    tiles: CachedTiles<O>,
    bind: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let state = Arc::new(AppState {
        repo,
        tiles,
        cluster_cfg: ClusterConfig::default(),
    });
    let app = router(state).layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!("tile-service listening on {bind}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutting down");
}
