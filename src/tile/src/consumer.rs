//! `catalog.changed` consumer — keeps the tile cache fresh.
//!
//! The catalog service (the write path) publishes a [`CatalogChanged`] protobuf
//! message to the `catalog.changed` topic after every committed write. This
//! service is the read path; its only mutable state is the in-process tile cache
//! ([`CachedTiles`]). Tiles are immutable per `(prefix, z, x, y)` key, so the
//! only way a cached tile goes stale is a **re-tile**: the tiling pipeline
//! rewrites new raster bytes under the same prefix. That surfaces here as a
//! `KIND_MAP` event, whereupon we evict every cached tile under that map's
//! prefix.
//!
//! Markers and categories are served LIVE from PostGIS (no cache), so
//! `KIND_MARKER` / `KIND_CATEGORY` events are no-ops for us.
//!
//! Design notes:
//!   * Pure-Rust [`rskafka`] client — no native librdkafka / cmake.
//!   * No consumer group: each instance reads ALL partitions from the LATEST
//!     offset. A fresh instance has an empty cache, so only events from "now"
//!     matter — we never replay history. Reading every partition means every
//!     instance sees every event, which is exactly right for broadcast cache
//!     invalidation.
//!   * Optional + non-fatal: gated on `KAFKA_BROKERS`; runs as a background
//!     task that retries on connect/fetch errors and skips undecodable messages.
//!     It must NEVER block or fail main startup.

use std::ops::Range;
use std::sync::Arc;
use std::time::Duration;

use prost::Message;
use rskafka::client::partition::{OffsetAt, UnknownTopicHandling};
use rskafka::client::ClientBuilder;

use crate::events::catalog_v1::{catalog_changed::Kind, CatalogChanged};
use crate::http::AppState;
use crate::repo::MarkerRepo;
use crate::tiles::TileOrigin;

/// Default topic; overridable via `CATALOG_CHANGED_TOPIC`.
const DEFAULT_TOPIC: &str = "catalog.changed";

/// Backoff between connect/fetch retries, and the long-poll window for fetch.
const RETRY_DELAY: Duration = Duration::from_secs(5);
const FETCH_MAX_WAIT_MS: i32 = 5_000;
/// Fetch byte window: ask for at least 1 byte (block until something arrives),
/// cap a single response at ~1 MiB (these messages are tiny).
const FETCH_BYTES: Range<i32> = 1..1_048_576;

/// Read `KAFKA_BROKERS`; spawn the consumer iff it is set and non-empty.
///
/// Returns immediately. When disabled (no broker — local runs, the unit-test
/// image) it logs once and does nothing, so startup and tests never need Kafka.
pub fn spawn_if_configured<R, O>(state: Arc<AppState<R, O>>)
where
    R: MarkerRepo,
    O: TileOrigin,
{
    let brokers = match std::env::var("KAFKA_BROKERS") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => {
            tracing::info!("catalog.changed consumer disabled: KAFKA_BROKERS unset");
            return;
        }
    };
    let topic =
        std::env::var("CATALOG_CHANGED_TOPIC").unwrap_or_else(|_| DEFAULT_TOPIC.to_string());

    let brokers: Vec<String> = brokers
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if brokers.is_empty() {
        // e.g. KAFKA_BROKERS="," — non-empty raw value but no usable host. Disable
        // rather than spawn a consumer that can only loop on connect failures.
        tracing::warn!("catalog.changed consumer disabled: KAFKA_BROKERS has no usable broker");
        return;
    }

    tracing::info!(?brokers, %topic, "starting catalog.changed consumer");
    tokio::spawn(run(brokers, topic, state));
}

/// Top-level loop: (re)connect, discover partitions, then consume each partition
/// concurrently. Any connect/metadata error backs off and retries forever — a
/// flaky or briefly-unavailable broker must never take down the read path.
async fn run<R, O>(brokers: Vec<String>, topic: String, state: Arc<AppState<R, O>>)
where
    R: MarkerRepo,
    O: TileOrigin,
{
    loop {
        match connect_and_consume(&brokers, &topic, &state).await {
            // `connect_and_consume` only returns on error; success is an endless
            // loop. Either way, back off and rebuild the client + partition set
            // (handles topic-not-yet-created and leadership changes).
            Err(e) => {
                tracing::warn!(error = %e, "catalog.changed consumer error; retrying");
            }
        }
        tokio::time::sleep(RETRY_DELAY).await;
    }
}

/// One client lifetime: build the client, list the topic's partitions, and spawn
/// a per-partition fetch loop for each. Returns `Err` on any setup failure (the
/// caller backs off and retries).
async fn connect_and_consume<R, O>(
    brokers: &[String],
    topic: &str,
    state: &Arc<AppState<R, O>>,
) -> Result<std::convert::Infallible, Box<dyn std::error::Error + Send + Sync>>
where
    R: MarkerRepo,
    O: TileOrigin,
{
    let client = ClientBuilder::new(brokers.to_vec()).build().await?;

    let partitions: Vec<i32> = client
        .list_topics()
        .await?
        .into_iter()
        .find(|t| t.name == topic)
        .map(|t| t.partitions.into_iter().collect())
        .ok_or_else(|| format!("topic {topic:?} not found yet"))?;

    if partitions.is_empty() {
        return Err(format!("topic {topic:?} has no partitions").into());
    }
    tracing::info!(%topic, partitions = ?partitions, "consuming catalog.changed");

    // One task per partition, owned by a JoinSet. If any partition loop exits
    // (always an error), we abort the rest (JoinSet drop) and bubble up so the
    // caller rebuilds the whole client — handling leadership changes too.
    let mut set: tokio::task::JoinSet<
        Result<std::convert::Infallible, Box<dyn std::error::Error + Send + Sync>>,
    > = tokio::task::JoinSet::new();
    for partition in partitions {
        let client_pc = client
            .partition_client(topic.to_string(), partition, UnknownTopicHandling::Retry)
            .await?;
        let state = Arc::clone(state);
        let topic = topic.to_string();
        set.spawn(async move { consume_partition(client_pc, partition, &topic, state).await });
    }

    // First task to finish ends the client lifetime.
    match set.join_next().await {
        Some(Ok(inner)) => inner, // partition loop returned Err(..)
        Some(Err(join_err)) => Err(Box::new(join_err)),
        None => Err("no partition consumers were spawned".into()),
    }
    // `set` drops here, aborting any siblings still running.
}

/// Fetch loop for a single partition, starting at the LATEST offset (never
/// replay history). Decode + dispatch each record; a fetch error returns so the
/// partition (and client) get rebuilt.
async fn consume_partition<R, O>(
    pc: rskafka::client::partition::PartitionClient,
    partition: i32,
    topic: &str,
    state: Arc<AppState<R, O>>,
) -> Result<std::convert::Infallible, Box<dyn std::error::Error + Send + Sync>>
where
    R: MarkerRepo,
    O: TileOrigin,
{
    let mut offset = pc.get_offset(OffsetAt::Latest).await?;
    tracing::debug!(%topic, partition, offset, "partition consumer starting at latest");

    loop {
        let (records, _high_watermark) = pc
            .fetch_records(offset, FETCH_BYTES, FETCH_MAX_WAIT_MS)
            .await?;

        for rao in records {
            // Advance past this record regardless of decode outcome so a single
            // bad message can never wedge the loop.
            offset = rao.offset + 1;
            handle_record(&rao.record, partition, &state).await;
        }
    }
}

/// Decode one Kafka record's value as [`CatalogChanged`] and invalidate as
/// needed. A missing/undecodable value is logged and skipped (never a panic).
async fn handle_record<R, O>(
    record: &rskafka::record::Record,
    partition: i32,
    state: &Arc<AppState<R, O>>,
) where
    R: MarkerRepo,
    O: TileOrigin,
{
    let Some(value) = record.value.as_deref() else {
        tracing::debug!(partition, "catalog.changed record has no value; skipping");
        return;
    };

    let event = match CatalogChanged::decode(value) {
        Ok(ev) => ev,
        Err(e) => {
            tracing::warn!(error = %e, partition, "undecodable catalog.changed message; skipping");
            return;
        }
    };

    // `kind` is an open i32 on the wire; map it to the known enum.
    match event.kind() {
        Kind::Map => {
            invalidate_map(event.map_id, state).await;
        }
        Kind::Marker | Kind::Category => {
            tracing::debug!(
                map_id = event.map_id,
                kind = ?event.kind(),
                "markers served live; no tile cache impact"
            );
        }
        Kind::Unspecified => {
            tracing::warn!(
                map_id = event.map_id,
                "catalog.changed with KIND_UNSPECIFIED; skipping"
            );
        }
    }
}

/// Resolve the map's tile prefix and evict its cached tiles. If the prefix can't
/// be resolved (unknown/deleted map) we skip — stale entries TTL out on their
/// own.
async fn invalidate_map<R, O>(map_id: i64, state: &Arc<AppState<R, O>>)
where
    R: MarkerRepo,
    O: TileOrigin,
{
    match state.repo.prefix_for_map(map_id).await {
        Ok(Some(prefix)) => {
            tracing::info!(map_id, %prefix, "invalidating tile cache for re-tiled map");
            state.tiles.invalidate_prefix(&prefix);
        }
        Ok(None) => {
            tracing::debug!(
                map_id,
                "no prefix for map (deleted?); skipping invalidation"
            );
        }
        Err(e) => {
            tracing::warn!(error = %e, map_id, "failed to resolve map prefix; skipping invalidation");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ClusterConfig;
    use crate::events::catalog_v1::catalog_changed::Action;
    use crate::repo::{InMemoryRepo, MapMeta};
    use crate::tiles::{CachedTiles, TileError, TileId, TileOrigin};
    use bytes::Bytes;

    const MAP_ID: i64 = 42;
    const PREFIX: &str = "elden-ring/overworld";

    /// Origin that always serves bytes, so we can prime the tile cache.
    struct StaticOrigin;
    #[async_trait::async_trait]
    impl TileOrigin for StaticOrigin {
        async fn get(&self, _id: &TileId) -> Result<Bytes, TileError> {
            Ok(Bytes::from_static(b"tile"))
        }
    }

    /// Build an AppState whose InMemoryRepo maps MAP_ID -> PREFIX and whose tile
    /// cache is primed with one tile under PREFIX.
    async fn primed_state() -> Arc<AppState<InMemoryRepo, StaticOrigin>> {
        let repo = InMemoryRepo {
            markers: Vec::new(),
            markers_map_id: MAP_ID,
            meta: MapMeta {
                width: 100,
                height: 100,
                max_zoom: 4,
            },
            prefix: PREFIX.to_string(),
        };
        let tiles = CachedTiles::new(StaticOrigin, 1024 * 1024);
        tiles
            .get(TileId {
                prefix: PREFIX.into(),
                z: 0,
                x: 0,
                y: 0,
                ext: "webp".into(),
            })
            .await
            .unwrap();
        tiles.run_pending_for_test().await;

        Arc::new(AppState {
            repo,
            tiles,
            cluster_cfg: ClusterConfig::default(),
        })
    }

    /// Encode a CatalogChanged into a Kafka record (key = map_id string, value =
    /// protobuf binary), mirroring what the catalog publishes.
    fn record_for(map_id: i64, kind: Kind, action: Action) -> rskafka::record::Record {
        let ev = CatalogChanged {
            map_id,
            kind: kind as i32,
            action: action as i32,
        };
        rskafka::record::Record {
            key: Some(map_id.to_string().into_bytes()),
            value: Some(ev.encode_to_vec()),
            headers: Default::default(),
            timestamp: Default::default(),
        }
    }

    #[tokio::test]
    async fn catalog_changed_round_trips_on_the_wire() {
        let ev = CatalogChanged {
            map_id: MAP_ID,
            kind: Kind::Map as i32,
            action: Action::BulkImported as i32,
        };
        let decoded = CatalogChanged::decode(ev.encode_to_vec().as_slice()).unwrap();
        assert_eq!(decoded.map_id, MAP_ID);
        assert_eq!(decoded.kind(), Kind::Map);
        assert_eq!(decoded.action(), Action::BulkImported);
    }

    #[tokio::test]
    async fn kind_map_invalidates_the_tile_cache() {
        let state = primed_state().await;
        assert_eq!(state.tiles.entry_count_for_test(), 1);

        handle_record(&record_for(MAP_ID, Kind::Map, Action::Updated), 0, &state).await;
        state.tiles.run_pending_for_test().await;

        assert_eq!(
            state.tiles.entry_count_for_test(),
            0,
            "a re-tile must evict the cached tiles under the map's prefix"
        );
    }

    #[tokio::test]
    async fn marker_and_category_events_are_noops() {
        let state = primed_state().await;
        for kind in [Kind::Marker, Kind::Category] {
            handle_record(&record_for(MAP_ID, kind, Action::Created), 0, &state).await;
        }
        state.tiles.run_pending_for_test().await;
        assert_eq!(
            state.tiles.entry_count_for_test(),
            1,
            "markers are served live; their events must not touch the tile cache"
        );
    }

    #[tokio::test]
    async fn unknown_map_id_is_skipped_not_panicked() {
        let state = primed_state().await;
        // A map the repo doesn't know -> prefix_for_map returns None -> skip.
        handle_record(
            &record_for(MAP_ID + 1, Kind::Map, Action::Deleted),
            0,
            &state,
        )
        .await;
        state.tiles.run_pending_for_test().await;
        assert_eq!(state.tiles.entry_count_for_test(), 1);
    }

    #[tokio::test]
    async fn undecodable_and_empty_records_are_skipped() {
        let state = primed_state().await;

        // Value present but not valid protobuf for this message.
        let garbage = rskafka::record::Record {
            key: None,
            value: Some(vec![0xff, 0xff, 0xff, 0xff, 0xff]),
            headers: Default::default(),
            timestamp: Default::default(),
        };
        handle_record(&garbage, 0, &state).await;

        // Tombstone (no value).
        let empty = rskafka::record::Record {
            key: Some(b"k".to_vec()),
            value: None,
            headers: Default::default(),
            timestamp: Default::default(),
        };
        handle_record(&empty, 0, &state).await;

        state.tiles.run_pending_for_test().await;
        assert_eq!(state.tiles.entry_count_for_test(), 1);
    }
}
