package com.ritchermap.catalog.service;

import com.ritchermap.catalog.domain.GameMap;
import com.ritchermap.catalog.domain.MapStatus;
import com.ritchermap.catalog.error.ConflictException;
import com.ritchermap.catalog.error.NotFoundException;
import com.ritchermap.catalog.repo.MapRepository;
import com.ritchermap.proto.catalog.v1.CatalogChanged;
import com.ritchermap.proto.tiling.v1.TilingRequested;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MapService {

    private static final Logger log = LoggerFactory.getLogger(MapService.class);

    private final MapRepository maps;
    private final CatalogEventPublisher kafkaPublisher;
    private final ApplicationEventPublisher springEvents;

    public MapService(
            MapRepository maps,
            CatalogEventPublisher kafkaPublisher,
            ApplicationEventPublisher springEvents) {
        this.maps = maps;
        this.kafkaPublisher = kafkaPublisher;
        this.springEvents = springEvents;
    }

    /** All events from this service concern a map, so kind is always KIND_MAP. */
    private static CatalogChanged mapChanged(long mapId, CatalogChanged.Action action) {
        return CatalogChanged.newBuilder()
                .setMapId(mapId)
                .setKind(CatalogChanged.Kind.KIND_MAP)
                .setAction(action)
                .build();
    }

    @Transactional
    public GameMap create(String gameSlug, String mapSlug, String name) {
        String prefix = gameSlug + "/" + mapSlug;
        if (maps.existsByPrefix(prefix)) {
            throw new ConflictException("map already exists: " + prefix);
        }
        GameMap saved = maps.save(new GameMap(gameSlug, mapSlug, name));
        springEvents.publishEvent(mapChanged(saved.getId(), CatalogChanged.Action.ACTION_CREATED));
        log.info("created map id={} prefix={}", saved.getId(), saved.getPrefix());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<GameMap> list() {
        return maps.findAll();
    }

    @Transactional(readOnly = true)
    public GameMap get(long id) {
        return maps.findById(id).orElseThrow(() -> NotFoundException.of("map", id));
    }

    @Transactional
    public GameMap rename(long id, String name) {
        GameMap m = get(id);
        m.rename(name);
        springEvents.publishEvent(mapChanged(id, CatalogChanged.Action.ACTION_UPDATED));
        return m;
    }

    @Transactional
    public void delete(long id) {
        if (!maps.existsById(id)) throw NotFoundException.of("map", id);
        maps.deleteById(id);
        springEvents.publishEvent(mapChanged(id, CatalogChanged.Action.ACTION_DELETED));
    }

    /**
     * Editor uploaded the source image. We mark the map UPLOADED and request
     * tiling. The {@link TilingRequested} event publishes immediately (not
     * AFTER_COMMIT) so it goes out even if no other state changes.
     *
     * <p>Idempotent on the catalog side: re-uploading an already-UPLOADED or
     * TILING map re-emits the tiling request, which is what you want for
     * re-tiling after a failure.
     */
    @Transactional
    public GameMap requestTiling(long id, String sourceBucket, String sourceKey, String format) {
        GameMap m = get(id);
        m.markUploaded(sourceKey);
        // max_zoom is left unset (optional) so the worker chooses, matching the
        // previous null. The other fields map one-to-one onto the proto.
        TilingRequested req = TilingRequested.newBuilder()
                .setMapId(m.getId())
                .setPrefix(m.getPrefix())
                .setSourceBucket(sourceBucket)
                .setSourceKey(sourceKey)
                .setFormat(format != null ? format : "webp")
                .build();
        kafkaPublisher.publishTilingRequested(req);
        springEvents.publishEvent(mapChanged(id, CatalogChanged.Action.ACTION_UPDATED));
        log.info("requested tiling for map id={} source={}", id, sourceKey);
        return m;
    }

    /**
     * Editor imported a pre-built {@code {z}/{x}/{y}} pyramid directly into tile
     * storage (no source image, no tiling worker run). Apply the supplied
     * dimensions and go READY — the same end state as {@link #completeTiling},
     * but driven by an admin HTTP call instead of a Kafka completion event.
     * Returns the entity so the controller can echo the updated map.
     */
    @Transactional
    public GameMap markImported(long id, long width, long height, int maxZoom,
                                int tileSize, String format) {
        GameMap m = get(id);
        m.markReady(width, height, maxZoom, tileSize, format);
        springEvents.publishEvent(mapChanged(id, CatalogChanged.Action.ACTION_UPDATED));
        log.info("map id={} marked imported: {}x{} z0..{} format={}", id, width, height, maxZoom, format);
        return m;
    }

    /**
     * Called by the {@code map.tiling.completed} listener. Idempotent so a
     * duplicate completion message (Kafka at-least-once) doesn't fail.
     */
    @Transactional
    public void completeTiling(long mapId, long width, long height, int maxZoom,
                               int tileSize, String format) {
        GameMap m = get(mapId);
        if (m.getStatus() == MapStatus.READY
                && m.getWidth() != null && m.getWidth() == width
                && m.getHeight() != null && m.getHeight() == height) {
            log.debug("ignoring duplicate completion for already-READY map id={}", mapId);
            return;
        }
        m.markReady(width, height, maxZoom, tileSize, format);
        springEvents.publishEvent(mapChanged(mapId, CatalogChanged.Action.ACTION_UPDATED));
        log.info("map id={} ready: {}x{} z0..{}", mapId, width, height, maxZoom);
    }

    /** Called by the {@code map.tiling.failed} listener. */
    @Transactional
    public void failTiling(long mapId) {
        GameMap m = get(mapId);
        m.markFailed();
        springEvents.publishEvent(mapChanged(mapId, CatalogChanged.Action.ACTION_UPDATED));
        log.warn("tiling failed for map id={}", mapId);
    }
}
