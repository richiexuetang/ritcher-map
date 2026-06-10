//! Tile serving.
//!
//! Tiles are immutable, content-addressed by `(map, z, x, y)`, and in
//! production sit in object storage behind a CDN. This service is the origin:
//! it fetches a tile's bytes from a [`TileOrigin`] and serves them with a long
//! immutable cache header, fronted by an in-process [`moka`] cache so repeated
//! requests for hot tiles (everyone opens the same starting area) don't hit the
//! backing store.
//!
//! Two origins ship here: a local-filesystem one (matches the tiling pipeline's
//! `LocalTileStore` layout, for dev) and an HTTP one (points at S3/MinIO/R2).

use std::path::{Path, PathBuf};
use std::time::Duration;

use bytes::Bytes;
use moka::future::Cache;

#[derive(Debug, thiserror::Error)]
pub enum TileError {
    #[error("tile not found")]
    NotFound,
    #[error("origin io error: {0}")]
    Io(String),
}

/// Address of a single tile plus its format extension.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TileId {
    pub prefix: String, // e.g. "elden-ring/overworld"
    pub z: u32,
    pub x: u32,
    pub y: u32,
    pub ext: String, // "webp" | "png"
}

impl TileId {
    /// `<prefix>/<z>/<x>/<y>.<ext>` — identical to the tiling pipeline layout.
    pub fn key(&self) -> String {
        format!(
            "{}/{}/{}/{}.{}",
            self.prefix, self.z, self.x, self.y, self.ext
        )
    }

    pub fn mime(&self) -> &'static str {
        match self.ext.as_str() {
            "png" => "image/png",
            _ => "image/webp",
        }
    }
}

/// Anything that can produce tile bytes for a key.
#[async_trait::async_trait]
pub trait TileOrigin: Send + Sync + 'static {
    async fn get(&self, id: &TileId) -> Result<Bytes, TileError>;
}

/// Reads tiles from a directory tree on disk.
pub struct LocalTileOrigin {
    root: PathBuf,
}

impl LocalTileOrigin {
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
        }
    }
}

#[async_trait::async_trait]
impl TileOrigin for LocalTileOrigin {
    async fn get(&self, id: &TileId) -> Result<Bytes, TileError> {
        let path = self.root.join(id.key());
        match tokio::fs::read(&path).await {
            Ok(b) => Ok(Bytes::from(b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(TileError::NotFound),
            Err(e) => Err(TileError::Io(e.to_string())),
        }
    }
}

/// Fetches tiles over HTTP from an object-store / CDN base URL.
pub struct HttpTileOrigin {
    base_url: String,
    client: hyper_util::client::legacy::Client<
        hyper_util::client::legacy::connect::HttpConnector,
        http_body_util::Empty<Bytes>,
    >,
}

impl HttpTileOrigin {
    pub fn new(base_url: impl Into<String>) -> Self {
        let client =
            hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
                .build_http();
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client,
        }
    }
}

#[async_trait::async_trait]
impl TileOrigin for HttpTileOrigin {
    async fn get(&self, id: &TileId) -> Result<Bytes, TileError> {
        use http_body_util::BodyExt;

        let url = format!("{}/{}", self.base_url, id.key());
        let uri: hyper::Uri = url
            .parse()
            .map_err(|e| TileError::Io(format!("bad uri: {e}")))?;
        let resp = self
            .client
            .get(uri)
            .await
            .map_err(|e| TileError::Io(e.to_string()))?;

        match resp.status().as_u16() {
            200 => {
                let body = resp
                    .into_body()
                    .collect()
                    .await
                    .map_err(|e| TileError::Io(e.to_string()))?
                    .to_bytes();
                Ok(body)
            }
            404 => Err(TileError::NotFound),
            other => Err(TileError::Io(format!("origin status {other}"))),
        }
    }
}

/// A [`TileOrigin`] wrapped in an in-process LRU/TTL cache.
///
/// The cache is bounded by total tile *bytes* (weight), not entry count, so a
/// burst of large PNGs can't blow memory. `NotFound` is cached briefly too, to
/// absorb scans over the sparse parts of a map (blank tiles were skipped at
/// tiling time, so misses are normal and frequent).
#[derive(Clone)]
pub struct CachedTiles<O: TileOrigin> {
    origin: std::sync::Arc<O>,
    hits: Cache<TileId, Option<Bytes>>,
}

impl<O: TileOrigin> CachedTiles<O> {
    pub fn new(origin: O, max_bytes: u64) -> Self {
        let hits = Cache::builder()
            .max_capacity(max_bytes)
            .weigher(|_k: &TileId, v: &Option<Bytes>| {
                v.as_ref().map(|b| b.len() as u32).unwrap_or(64).max(1)
            })
            .time_to_live(Duration::from_secs(3600))
            // Required for `invalidate_prefix`: without this, moka rejects the
            // `invalidate_entries_if` predicate (InvalidationClosuresDisabled).
            .support_invalidation_closures()
            .build();
        Self {
            origin: std::sync::Arc::new(origin),
            hits,
        }
    }

    pub async fn get(&self, id: TileId) -> Result<Bytes, TileError> {
        if let Some(slot) = self.hits.get(&id).await {
            return match slot {
                Some(b) => Ok(b),
                None => Err(TileError::NotFound),
            };
        }
        match self.origin.get(&id).await {
            Ok(b) => {
                self.hits.insert(id, Some(b.clone())).await;
                Ok(b)
            }
            Err(TileError::NotFound) => {
                self.hits.insert(id, None).await; // negative cache
                Err(TileError::NotFound)
            }
            Err(e) => Err(e),
        }
    }

    /// Drop every cached tile (positive or negative) under `prefix`.
    ///
    /// Called when the catalog signals a map changed: a re-tile rewrites the
    /// raster bytes under the same `<prefix>/z/x/y` keys, so the previously
    /// cached bytes are now stale. moka's `invalidate_entries_if` enqueues the
    /// predicate to run lazily against current entries; we don't await eviction.
    pub fn invalidate_prefix(&self, prefix: &str) {
        let p = prefix.to_string();
        if let Err(e) = self
            .hits
            .invalidate_entries_if(move |id, _v| id.prefix == p)
        {
            // Only happens if support_invalidation_closures() wasn't enabled at
            // build time — a programmer error, but don't crash the consumer.
            tracing::error!(error = %e, prefix, "tile cache invalidate_entries_if rejected");
        }
    }

    /// Test-only: force moka's deferred maintenance (insertions/invalidations)
    /// to run now, so assertions about cache contents are deterministic.
    #[cfg(any(test, feature = "memrepo"))]
    pub async fn run_pending_for_test(&self) {
        self.hits.run_pending_tasks().await;
    }

    /// Test-only: number of live cache entries (after pending maintenance).
    #[cfg(any(test, feature = "memrepo"))]
    pub fn entry_count_for_test(&self) -> u64 {
        self.hits.entry_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_key_matches_pipeline_layout() {
        let id = TileId {
            prefix: "elden-ring/overworld".into(),
            z: 4,
            x: 3,
            y: 7,
            ext: "webp".into(),
        };
        assert_eq!(id.key(), "elden-ring/overworld/4/3/7.webp");
        assert_eq!(id.mime(), "image/webp");
    }

    #[tokio::test]
    async fn local_origin_reads_and_reports_missing() {
        let dir = std::env::temp_dir().join(format!("tiles-test-{}", std::process::id()));
        let key_dir = dir.join("m/4/3");
        tokio::fs::create_dir_all(&key_dir).await.unwrap();
        tokio::fs::write(key_dir.join("7.webp"), b"abc")
            .await
            .unwrap();

        let origin = LocalTileOrigin::new(&dir);
        let present = TileId {
            prefix: "m".into(),
            z: 4,
            x: 3,
            y: 7,
            ext: "webp".into(),
        };
        let missing = TileId {
            prefix: "m".into(),
            z: 4,
            x: 3,
            y: 8,
            ext: "webp".into(),
        };

        assert_eq!(&origin.get(&present).await.unwrap()[..], b"abc");
        assert!(matches!(
            origin.get(&missing).await,
            Err(TileError::NotFound)
        ));

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn cache_serves_second_hit_without_touching_origin() {
        // A counting origin proves the second read is served from cache.
        struct Counting {
            n: std::sync::atomic::AtomicUsize,
        }
        #[async_trait::async_trait]
        impl TileOrigin for Counting {
            async fn get(&self, _id: &TileId) -> Result<Bytes, TileError> {
                self.n.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(Bytes::from_static(b"xyz"))
            }
        }
        let origin = Counting {
            n: Default::default(),
        };
        let cached = CachedTiles::new(origin, 1024 * 1024);
        let id = TileId {
            prefix: "m".into(),
            z: 0,
            x: 0,
            y: 0,
            ext: "webp".into(),
        };

        let a = cached.get(id.clone()).await.unwrap();
        let b = cached.get(id.clone()).await.unwrap();
        assert_eq!(a, b);
        assert_eq!(cached.origin.n.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn invalidate_prefix_evicts_only_matching_prefix() {
        struct Static;
        #[async_trait::async_trait]
        impl TileOrigin for Static {
            async fn get(&self, _id: &TileId) -> Result<Bytes, TileError> {
                Ok(Bytes::from_static(b"x"))
            }
        }
        let cached = CachedTiles::new(Static, 1024 * 1024);
        let mk = |prefix: &str| TileId {
            prefix: prefix.into(),
            z: 0,
            x: 0,
            y: 0,
            ext: "webp".into(),
        };

        // Prime two prefixes.
        cached.get(mk("elden-ring/overworld")).await.unwrap();
        cached.get(mk("other-map/world")).await.unwrap();
        cached.hits.run_pending_tasks().await;
        assert_eq!(cached.hits.entry_count(), 2);

        // Invalidate one; the other survives.
        cached.invalidate_prefix("elden-ring/overworld");
        cached.hits.run_pending_tasks().await;
        assert_eq!(cached.hits.entry_count(), 1);
        assert!(cached.hits.get(&mk("other-map/world")).await.is_some());
        assert!(cached.hits.get(&mk("elden-ring/overworld")).await.is_none());
    }
}
