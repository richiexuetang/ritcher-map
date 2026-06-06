package com.ritchermap.catalog.repo;

import java.util.List;

/**
 * Bulk operations on {@link com.ritchermap.catalog.domain.Marker} that don't fit
 * the Spring Data JPA derived-query model.
 */
public interface MarkerRepositoryCustom {
    /**
     * Insert many markers in a single batched statement.
     *
     * <p>JPA's per-entity {@code save} path issues one INSERT per row plus the
     * usual lifecycle overhead, which makes importing thousands of markers
     * (the common editor workflow when seeding a new map) painfully slow. This
     * uses {@code JdbcTemplate#batchUpdate} with a parameterized
     * {@code ST_MakePoint} so a 5000-marker import finishes in a single
     * round trip + batch flush.
     *
     * @return number of rows inserted
     */
    int bulkInsert(List<MarkerInsert> rows);

    /** Flat row for bulk insert; not an entity, no JPA overhead. */
    record MarkerInsert(
            long mapId,
            long categoryId,
            double x,
            double y,
            String title,
            String description
    ) {}
}
