package com.ritchermap.catalog.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * A tiled (or about-to-be-tiled) game map.
 *
 * <p>Named {@code GameMap} rather than {@code Map} to avoid clashing with
 * {@link java.util.Map} in the rest of the codebase.
 *
 * <p>Dimensions and {@code maxZoom} are nullable: they're populated when the
 * tiling worker reports completion, not when the row is first created. The
 * read path filters by {@code status = 'READY'} so it never observes the
 * not-yet-populated state.
 */
@Entity
@Table(
        name = "maps",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_maps_prefix", columnNames = "prefix"),
                @UniqueConstraint(name = "uq_maps_game_map", columnNames = {"game_slug", "map_slug"})
        }
)
public class GameMap {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_slug", nullable = false)
    private String gameSlug;

    @Column(name = "map_slug", nullable = false)
    private String mapSlug;

    @Column(nullable = false)
    private String name;

    /** Tile-key namespace, e.g. {@code "elden-ring/overworld"}. Must equal {@code gameSlug + "/" + mapSlug}. */
    @Column(nullable = false)
    private String prefix;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)              // map to the Postgres ENUM type
    @Column(nullable = false, columnDefinition = "map_status")
    private MapStatus status = MapStatus.DRAFT;

    @Column(name = "source_object_key")
    private String sourceObjectKey;

    // Populated when tiling completes:
    private Long width;
    private Long height;

    @Column(name = "max_zoom")
    private Integer maxZoom;

    /** Lowest zoom the viewer exposes; 0 unless set by import or an editor. */
    @Column(name = "min_zoom", nullable = false)
    private int minZoom = 0;

    @Column(name = "tile_size", nullable = false)
    private int tileSize = 256;

    @Column(nullable = false)
    private String format = "webp";

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private Instant updatedAt;

    protected GameMap() {}

    public GameMap(String gameSlug, String mapSlug, String name) {
        this.gameSlug = gameSlug;
        this.mapSlug = mapSlug;
        this.name = name;
        this.prefix = gameSlug + "/" + mapSlug;
    }

    /**
     * Apply the tiling result: dimensions, max zoom, and transition to {@link MapStatus#READY}.
     * Idempotent — calling on an already-READY map is a no-op except for the dimensions update.
     */
    public void markReady(long width, long height, int maxZoom, int tileSize, String format) {
        this.width = width;
        this.height = height;
        this.maxZoom = maxZoom;
        this.tileSize = tileSize;
        this.format = format;
        this.status = MapStatus.READY;
    }

    public void markFailed() {
        this.status = MapStatus.FAILED;
    }

    /** Set the minimum zoom (config field; callers clamp to [0, maxZoom]). */
    public void setMinZoom(int minZoom) {
        this.minZoom = minZoom;
    }

    public void markUploaded(String sourceObjectKey) {
        this.sourceObjectKey = sourceObjectKey;
        this.status = MapStatus.UPLOADED;
    }

    // Getters (no setters for fields managed by lifecycle methods)
    public Long getId() { return id; }
    public String getGameSlug() { return gameSlug; }
    public String getMapSlug() { return mapSlug; }
    public String getName() { return name; }
    public String getPrefix() { return prefix; }
    public MapStatus getStatus() { return status; }
    public String getSourceObjectKey() { return sourceObjectKey; }
    public Long getWidth() { return width; }
    public Long getHeight() { return height; }
    public Integer getMaxZoom() { return maxZoom; }
    public int getMinZoom() { return minZoom; }
    public int getTileSize() { return tileSize; }
    public String getFormat() { return format; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void rename(String name) { this.name = name; }
}
