use crate::{config::S3Config, error::TileError};
use aws_config::BehaviorVersion;
use aws_sdk_s3::{primitives::ByteStream, Client};
use bytes::Bytes;

pub struct StorageService {
    client: Client,
    bucket: String,
}

impl StorageService {
    pub async fn new(config: &S3Config) -> Result<Self, TileError> {
        let mut aws_config = aws_config::defaults(BehaviorVersion::latest());

        if let Some(endpoint) = &config.endpoint {
            aws_config = aws_config.endpoint_url(endpoint);
        }

        let sdk_config = aws_config.load().await;
        let client = Client::new(&sdk_config);

        Ok(Self {
            client,
            bucket: config.bucket.clone(),
        })
    }

    pub async fn get(&self, key: &str) -> Result<Bytes, TileError> {
        let result = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?;

        let data = result
            .body
            .collect()
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?
            .into_bytes();

        Ok(data)
    }

    pub async fn put(&self, key: &str, data: &Bytes) -> Result<(), TileError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data.clone()))
            .send()
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?;

        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<(), TileError> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| TileError::StorageError(e.to_string()))?;

        Ok(())
    }
}