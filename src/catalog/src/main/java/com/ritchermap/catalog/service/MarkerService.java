package com.ritchermap.catalog.service;

import com.ritchermap.catalog.domain.Marker;
import com.ritchermap.catalog.error.NotFoundException;
import com.ritchermap.catalog.events.Events.CatalogChanged;
import com.ritchermap.catalog.repo.CategoryRepository;
import com.ritchermap.catalog.repo.MapRepository;
import com.ritchermap.catalog.repo.MarkerRepository;
import com.ritchermap.catalog.repo.MarkerRepositoryCustom.MarkerInsert;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MarkerService {

    /** SRID 0 = no CRS (pixel space). All marker geometries share one factory. */
    private static final GeometryFactory GEOM = new GeometryFactory(new PrecisionModel(), 0);

    private final MarkerRepository markers;
    private final MapRepository maps;
    private final CategoryRepository categories;
    private final ApplicationEventPublisher events;

    public MarkerService(MarkerRepository markers, MapRepository maps,
                         CategoryRepository categories, ApplicationEventPublisher events) {
        this.markers = markers;
        this.maps = maps;
        this.categories = categories;
        this.events = events;
    }

    private Point point(double x, double y) {
        Point p = GEOM.createPoint(new Coordinate(x, y));
        p.setSRID(0);
        return p;
    }

    private void requireMapAndCategory(long mapId, long categoryId) {
        if (!maps.existsById(mapId)) throw NotFoundException.of("map", mapId);
        var cat = categories.findById(categoryId)
                .orElseThrow(() -> NotFoundException.of("category", categoryId));
        if (!cat.getMapId().equals(mapId)) {
            throw NotFoundException.of("category in map " + mapId, categoryId);
        }
    }

    @Transactional(readOnly = true)
    public List<Marker> list(long mapId) {
        if (!maps.existsById(mapId)) throw NotFoundException.of("map", mapId);
        return markers.findAllByMapId(mapId);
    }

    @Transactional
    public Marker create(long mapId, long categoryId, double x, double y,
                         String title, String description) {
        requireMapAndCategory(mapId, categoryId);
        Marker m = new Marker(mapId, categoryId, point(x, y), title, description);
        Marker saved = markers.save(m);
        events.publishEvent(new CatalogChanged(mapId, "marker", "created"));
        return saved;
    }

    @Transactional
    public Marker update(long id, long categoryId, double x, double y,
                         String title, String description) {
        Marker m = markers.findById(id).orElseThrow(() -> NotFoundException.of("marker", id));
        requireMapAndCategory(m.getMapId(), categoryId);
        m.update(categoryId, point(x, y), title, description);
        events.publishEvent(new CatalogChanged(m.getMapId(), "marker", "updated"));
        return m;
    }

    @Transactional
    public void delete(long id) {
        Marker m = markers.findById(id).orElseThrow(() -> NotFoundException.of("marker", id));
        long mapId = m.getMapId();
        markers.deleteById(id);
        events.publishEvent(new CatalogChanged(mapId, "marker", "deleted"));
    }

    /**
     * Editor seeds a map from an extracted dataset (CSV/JSON of points).
     * Goes through {@link MarkerRepositoryCustom#bulkInsert} so 5k markers
     * insert in one batched round trip rather than 5k individual JPA saves.
     *
     * <p>One {@code catalog.changed} event covers the whole import — the read
     * service's invalidation is per-map, so finer granularity buys nothing.
     */
    @Transactional
    public int bulkImport(long mapId, List<MarkerInsert> rows) {
        if (!maps.existsById(mapId)) throw NotFoundException.of("map", mapId);
        // Defensive: reject rows that don't belong to this map.
        for (var r : rows) {
            if (r.mapId() != mapId) {
                throw new IllegalArgumentException(
                        "marker mapId " + r.mapId() + " does not match path mapId " + mapId);
            }
        }
        int n = markers.bulkInsert(rows);
        events.publishEvent(new CatalogChanged(mapId, "marker", "bulk_imported"));
        return n;
    }
}
