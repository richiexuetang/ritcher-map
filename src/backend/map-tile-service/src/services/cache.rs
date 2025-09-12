use crate::error::TileError;
use bytes::Bytes;
use redis::{aio::ConnectionManager, AsyncCommands, Client };

pub struct CacheService {
    conn: ConnectionManager,
}

impl CacheService {
    pub async fn new(redis_url: &str) -> Result<Self, TileError> {
        let client = Client::open(redis_url)
            .map_err(|e| TileError::CacheError(e.to_string()))?;

        let conn = ConnectionManager::new(client)
            .await
            .map_err(|e| TileError::CacheError(e.to_string()))?;

        Ok(Self { conn })
    }

    pub async fn get(&self, key: &str) -> Result<Option<Bytes>, TileError> {
        let mut conn = self.conn.clone();
        let data: Option<Vec<u8>> = conn
            .get(key)
            .await
            .map_err(|e| TileError::CacheError(e.to_string()))?;

        Ok(data.map(Bytes::from))
    }

    pub async fn set(&self, key: &str, value: &Bytes, ttl: u64) -> Result<(), TileError> {
        let mut conn = self.conn.clone();
        conn.set_ex::<_, _, ()>(key, value.to_vec(), ttl)
            .await
            .map_err(|e| TileError::CacheError(e.to_string()))?;
        Ok(())
    }

    pub async fn invalidate_pattern(&self, pattern: &str) -> Result<(), TileError> {
        let mut conn = self.conn.clone();
        let keys: Vec<String> = conn
            .keys(pattern)
            .await
            .map_err(|e| TileError::CacheError(e.to_string()))?;

        if !keys.is_empty() {
            conn.del::<_, ()>(keys)
                .await
                .map_err(|e| TileError::CacheError(e.to_string()))?;
        }

        Ok(())
    }
}