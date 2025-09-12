use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub redis: RedisConfig,
    pub s3: S3Config,
    pub tile: TileConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TileConfig {
    pub tile_size: u32,
    pub max_zoom: u8,
    pub min_zoom: u8,
    pub cache_ttl: u64,
    pub quality: u8,
    pub enable_webp: bool,
}

impl Config {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        Ok(Config {
            server: ServerConfig {
                host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: env::var("PORT")
                    .unwrap_or_else(|_| "8080".to_string())
                    .parse()
                    .unwrap_or(8080),
            },
            redis: RedisConfig {
                url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string()),
            },
            s3: S3Config {
                bucket: env::var("S3_BUCKET").unwrap_or_else(|_| "map-tiles".to_string()),
                region: env::var("AWS_REGION").unwrap_or_else(|_| "us-west-1".to_string()),
                endpoint: env::var("S3_ENDPOINT").ok(),
            },
            tile: TileConfig {
                tile_size: 256,
                max_zoom: 20,
                min_zoom: 0,
                cache_ttl: 3600,
                quality: 85,
                enable_webp: true,
            },
        })
    }
}
