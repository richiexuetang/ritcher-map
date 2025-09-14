use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub tile: TileConfig,
    pub storage: StorageConfig,
    pub metrics: MetricsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub workers: Option<usize>,
    pub max_connections: usize,
    pub timeout_seconds: u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout_seconds: u64,
    pub idle_timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub pool_size: usize,
    pub timeout_seconds: u64,
    pub ttl_seconds: u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileConfig {
    pub tile_size: u32,
    pub max_zoom: u8,
    pub min_zoom: u8,
    pub formats: Vec<String>,
    pub compression_quality: u8,
    pub cache_headers: CacheHeaders,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CacheHeaders {
    pub max_age: u32,
    pub stale_while_revalidate: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StorageConfig {
    pub base_path: String,
    pub temp_path: String,
    pub cdn_base_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MetricsConfig {
    pub enabled: bool,
    pub endpoint: String,
}

impl Config {
    pub fn load() -> Result<Self, anyhow::Error>{
        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());

        let mut settings = config::Config::builder().add_source(config::File::with_name(&format!("config/{}", environment)))
            .add_source(config::Environment::with_prefix("TILE_SERVICE").separator("_"))
            .build()?;

        Ok(settings.try_deserialize()?)
    }
}