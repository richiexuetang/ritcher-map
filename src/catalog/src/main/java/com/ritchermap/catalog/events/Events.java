package com.ritchermap.catalog.events;

/**
 * Wire contracts for the catalog's Kafka topics.
 *
 * <p>These records are the canonical event shapes; the Python tiling worker
 * and the Rust read service consume the same shapes (mirrored by hand, until
 * we wire up Protobuf code-gen across all services).
 *
 * <p>Records are deliberately flat and use snake_case field names through
 * Jackson configuration in the application's ObjectMapper.
 */
public final class Events {
    private Events() {}

    // ---------- Outbound: catalog -> tiling worker ----------

    /**
     * Published on topic {@code map.tiling.requested} when an editor uploads
     * a source image. The Python worker consumes this, tiles, and publishes
     * {@link TilingCompleted}.
     */
    public record TilingRequested(
            long mapId,
            String prefix,
            String sourceBucket,
            String sourceKey,
            String format,
            Integer maxZoom   // nullable; null lets the worker pick
    ) {}

    // ---------- Inbound: tiling worker -> catalog ----------

    /**
     * Consumed from {@code map.tiling.completed}. Catalog uses width/height/
     * maxZoom to mark the map READY.
     */
    public record TilingCompleted(
            long mapId,
            String prefix,
            long width,
            long height,
            int maxZoom,
            int tileSize,
            String format,
            long tilesWritten
    ) {}

    /** Consumed from {@code map.tiling.failed}. Catalog marks the map FAILED. */
    public record TilingFailed(
            long mapId,
            String reason
    ) {}

    // ---------- Outbound: catalog -> read service (cache invalidation) ----------

    /**
     * Published on {@code catalog.changed} after any committed write that
     * affects what the read path serves. The Rust service consumes this to
     * invalidate per-map cache entries.
     *
     * <p>{@code kind} narrows the change so the consumer can be selective:
     * {@code "map"}, {@code "category"}, or {@code "marker"}.
     */
    public record CatalogChanged(
            long mapId,
            String kind,
            String action   // "created" | "updated" | "deleted" | "bulk_imported"
    ) {}
}
