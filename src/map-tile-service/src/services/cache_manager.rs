use crate::models::tile::TileResponse;
use crate::utils::error::TileServiceError;
use redis::{aio::ConnectionManager, AsyncCommands, Client};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize, Deserialize)]
struct CachedTile {
    pub data: String, // Base64 encoded image data
    pub content_type: String,
    pub etag: String,
    pub cached_at: chrono::DateTime<chrono::Utc>,
}

pub struct CacheManager {
    client: ConnectionManager,
    default_ttl: u64,
}

impl CacheManager {
    pub async fn new(client: Client, default_ttl: u64) -> Result<Self, TileServiceError> {
        let connection_manager = ConnectionManager::new(client).await?;
        Ok(Self {
            client: connection_manager,
            default_ttl,
        })
    }

    pub async fn get_tile(&self, cache_key: &str) -> Result<Option<TileResponse>, TileServiceError> {
        let mut conn = self.client.clone();

        let cached_json: Option<String> = conn.get(cache_key).await?;

        if let Some(json_str) = cached_json {
            let cached_tile: CachedTile = serde_json::from_str(&json_str)
                .map_err(|e| TileServiceError::Internal(format!("Failed to deserialize cached tile: {}", e)))?;

            // Decode base64 image data
            let data = general_purpose::STANDARD
                .decode(&cached_tile.data)
                .map_err(|e| TileServiceError::Internal(format!("Failed to decode cached image data: {}", e)))?;

            // Update access time
            let _: () = conn.expire(cache_key, self.default_ttl as i64).await?;

            return Ok(Some(TileResponse {
                data,
                content_type: cached_tile.content_type,
                cache_key: cache_key.to_string(),
                etag: cached_tile.etag,
            }));
        }

        Ok(None)
    }

    pub async fn set_tile(&self, cache_key: &str, tile: &TileResponse) -> Result<(), TileServiceError> {
        // Encode image data as base64
        let encoded_data = general_purpose::STANDARD.encode(&tile.data);

        let cached_tile = CachedTile {
            data: encoded_data,
            content_type: tile.content_type.clone(),
            etag: tile.etag.clone(),
            cached_at: chrono::Utc::now(),
        };

        let json_str = serde_json::to_string(&cached_tile)
            .map_err(|e| TileServiceError::Internal(format!("Failed to serialize tile for cache: {}", e)))?;

        let mut conn = self.client.clone();
        let _: () = conn.set_ex(cache_key, &json_str, self.default_ttl).await?;

        // Also store ETag separately for quick access
        let etag_key = format!("etag:{}", cache_key);
        let _: () = conn.set_ex(&etag_key, &tile.etag, self.default_ttl).await?;

        Ok(())
    }

    pub async fn get_etag(&self, cache_key: &str) -> Result<String, TileServiceError> {
        let etag_key = format!("etag:{}", cache_key);
        let mut conn = self.client.clone();

        let etag: Option<String> = conn.get(&etag_key).await?;
        etag.ok_or_else(|| TileServiceError::Internal("ETag not found in cache".to_string()))
    }

    pub async fn invalidate_game_tiles(&self, game_id: &str) -> Result<(), TileServiceError> {
        let pattern = format!("tile:{}:*", game_id);
        let etag_pattern = format!("etag:tile:{}:*", game_id);

        let mut conn = self.client.clone();

        // Get all keys matching the pattern
        let keys: Vec<String> = conn.keys(&pattern).await?;
        let etag_keys: Vec<String> = conn.keys(&etag_pattern).await?;

        // Delete all matching keys
        if !keys.is_empty() {
            let _: () = conn.del(&keys).await?;
        }
        if !etag_keys.is_empty() {
            let _: () = conn.del(&etag_keys).await?;
        }

        tracing::info!("Invalidated {} tiles and {} etags for game {}", keys.len(), etag_keys.len(), game_id);

        Ok(())
    }

    pub async fn get_cache_stats(&self) -> Result<CacheStats, TileServiceError> {
        let mut conn = self.client.clone();

        let info: String = redis::cmd("INFO")
            .arg("memory")
            .query_async(&mut conn)
            .await?;

        let keyspace: String = redis::cmd("INFO")
            .arg("keyspace")
            .query_async(&mut conn)
            .await?;

        // Parse Redis info (simplified)
        let used_memory = Self::parse_redis_info(&info, "used_memory:")
            .unwrap_or(0);
        let total_keys = Self::parse_redis_info(&keyspace, "keys=")
            .unwrap_or(0);

        Ok(CacheStats {
            used_memory,
            total_keys,
            hit_rate: 0.0, // Would need to track this separately
        })
    }

    fn parse_redis_info(info: &str, key: &str) -> Option<u64> {
        info.lines()
            .find(|line| line.starts_with(key))?
            .split(':')
            .nth(1)?
            .parse()
            .ok()
    }
}

#[derive(Serialize, Deserialize)]
pub struct CacheStats {
    pub used_memory: u64,
    pub total_keys: u64,
    pub hit_rate: f64,
}