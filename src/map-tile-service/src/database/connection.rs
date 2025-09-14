use crate::config::DatabaseConfig;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

pub type DatabasePool = PgPool;

pub async fn create_database_pool(config: &DatabaseConfig) -> Result<DatabasePool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(config.acquire_timeout_seconds))
        .idle_timeout(Duration::from_secs(config.idle_timeout_seconds))
        .test_before_acquire(true)
        .connect(&config.url)
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&pool).await?;

    tracing::info!("Database pool created successfully");
    Ok(pool)
}