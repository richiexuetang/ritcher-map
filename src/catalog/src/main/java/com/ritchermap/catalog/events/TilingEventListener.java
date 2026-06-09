package com.ritchermap.catalog.events;

import com.google.protobuf.InvalidProtocolBufferException;
import com.ritchermap.catalog.service.MapService;
import com.ritchermap.proto.tiling.v1.TilingCompleted;
import com.ritchermap.proto.tiling.v1.TilingFailed;
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
    public void onCompleted(byte[] payload, Acknowledgment ack) throws InvalidProtocolBufferException {
        TilingCompleted ev = TilingCompleted.parseFrom(payload);
        log.info("received tiling.completed map_id={} tiles={}", ev.getMapId(), ev.getTilesWritten());
        maps.completeTiling(
                ev.getMapId(), ev.getWidth(), ev.getHeight(), ev.getMaxZoom(), ev.getTileSize(), ev.getFormat()
        );
        ack.acknowledge();
    }

    @KafkaListener(
            topics = "${mapgenie.topics.tiling-failed}",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onFailed(byte[] payload, Acknowledgment ack) throws InvalidProtocolBufferException {
        TilingFailed ev = TilingFailed.parseFrom(payload);
        log.warn("received tiling.failed map_id={} reason={}", ev.getMapId(), ev.getReason());
        maps.failTiling(ev.getMapId());
        ack.acknowledge();
    }
}
