package com.ritchermap.catalog.api;

import com.ritchermap.catalog.domain.Category;
import com.ritchermap.catalog.domain.GameMap;
import com.ritchermap.catalog.domain.Marker;
import com.ritchermap.catalog.domain.MapStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Wire DTOs for the catalog API. Records throughout — they're immutable,
 * pattern-match-friendly, and Jackson handles them natively.
 *
 * <p>Entities are deliberately not exposed; conversion happens here in static
 * {@code from(...)} methods. This keeps lazy-loading and Hibernate proxy
 * concerns inside the persistence layer.
 */
public final class Dtos {
    private Dtos() {}

    // ---------- Map ----------

    public record CreateMapRequest(
            @NotBlank @Pattern(regexp = "[a-z0-9-]+") @Size(max = 60) String gameSlug,
            @NotBlank @Pattern(regexp = "[a-z0-9-]+") @Size(max = 60) String mapSlug,
            @NotBlank @Size(max = 200) String name
    ) {}

    public record RenameMapRequest(@NotBlank @Size(max = 200) String name) {}

    public record RequestTilingRequest(
            @NotBlank String sourceBucket,
            @NotBlank String sourceKey,
            String format     // optional; defaults to webp
    ) {}

    /**
     * Editor uploaded a pre-built {@code {z}/{x}/{y}} pyramid straight to tile
     * storage (no source image to tile). Carries the dimensions the worker
     * would otherwise have computed so the map can go READY directly.
     */
    public record MarkImportedRequest(
            @NotNull @Positive Long width,
            @NotNull @Positive Long height,
            @NotNull @PositiveOrZero Integer maxZoom,
            @Positive Integer tileSize,   // optional; defaults to 256
            String format                 // optional; defaults to webp
    ) {}

    public record MapResponse(
            long id,
            String gameSlug,
            String mapSlug,
            String name,
            String prefix,
            MapStatus status,
            Long width,
            Long height,
            Integer maxZoom,
            int tileSize,
            String format,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static MapResponse from(GameMap m) {
            return new MapResponse(
                    m.getId(), m.getGameSlug(), m.getMapSlug(), m.getName(), m.getPrefix(),
                    m.getStatus(), m.getWidth(), m.getHeight(), m.getMaxZoom(),
                    m.getTileSize(), m.getFormat(), m.getCreatedAt(), m.getUpdatedAt()
            );
        }
    }

    // ---------- Category ----------

    public record CategoryRequest(
            @NotBlank @Pattern(regexp = "[a-z0-9-]+") @Size(max = 60) String slug,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 200) String icon,
            int sortOrder,
            Long parentId
    ) {}

    public record CategoryResponse(
            long id, long mapId, Long parentId,
            String slug, String name, String icon, int sortOrder
    ) {
        public static CategoryResponse from(Category c) {
            return new CategoryResponse(
                    c.getId(), c.getMapId(), c.getParentId(),
                    c.getSlug(), c.getName(), c.getIcon(), c.getSortOrder()
            );
        }
    }

    // ---------- Marker ----------

    public record MarkerRequest(
            @NotNull Long categoryId,
            @NotNull Double x,
            @NotNull Double y,
            @Size(max = 200) String title,
            @Size(max = 4000) String description
    ) {}

    public record MarkerResponse(
            long id, long mapId, long categoryId,
            double x, double y,
            String title, String description
    ) {
        public static MarkerResponse from(Marker m) {
            return new MarkerResponse(
                    m.getId(), m.getMapId(), m.getCategoryId(),
                    m.getGeom().getX(), m.getGeom().getY(),
                    m.getTitle(), m.getDescription()
            );
        }
    }

    public record BulkImportRow(
            @NotNull Long categoryId,
            @NotNull Double x,
            @NotNull Double y,
            String title,
            String description
    ) {}

    public record BulkImportRequest(@NotNull List<BulkImportRow> markers) {}

    public record BulkImportResponse(int inserted) {}
}
