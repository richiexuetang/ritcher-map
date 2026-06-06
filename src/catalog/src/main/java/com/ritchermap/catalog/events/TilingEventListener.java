package com.ritchermap.catalog.events;

import com.ritchermap.catalog.service.MapService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

/**
 * Bridges Kafka completion/failure events into the catalog's lifecycle methods.
 *
 * <p>Acknowledgment is manual ({@code ack-mode: manual_immediate}) so we only
 * commit the offset after the DB transaction has succeeded. If
 * {@code completeTiling} throws, the message is not acked and Kafka will
 * redeliver — combined with the idempotency check inside the service, that's
 * safe at-least-once handling.
 */
@Component
public class TilingEventListener {

    private static final Logger log = LoggerFactory.getLogger(TilingEventListener.class);

    private final MapService maps;

    public TilingEventListener(MapService maps) {
        this.maps = maps;
    }

    @KafkaListener(
            topics = "${mapgenie.topics.tiling-completed}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onCompleted(Events.TilingCompleted ev, Acknowledgment ack) {
        log.info("received tiling.completed map_id={} tiles={}", ev.mapId(), ev.tilesWritten());
        maps.completeTiling(
                ev.mapId(), ev.width(), ev.height(), ev.maxZoom(), ev.tileSize(), ev.format()
        );
        ack.acknowledge();
    }

    @KafkaListener(
            topics = "${mapgenie.topics.tiling-failed}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onFailed(Events.TilingFailed ev, Acknowledgment ack) {
        log.warn("received tiling.failed map_id={} reason={}", ev.mapId(), ev.reason());
        maps.failTiling(ev.mapId());
        ack.acknowledge();
    }
}
