package com.ritchermap.catalog.service;

import com.ritchermap.proto.catalog.v1.CatalogChanged;
import com.ritchermap.proto.tiling.v1.TilingRequested;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

/**
 * Publishes Kafka events for catalog changes.
 *
 * <p><b>Publish timing.</b> {@link TransactionalEventListener} with
 * {@link TransactionPhase#AFTER_COMMIT} ensures we only publish for changes
 * that actually committed — no "ghost" events for rolled-back transactions.
 *
 * <p><b>Failure window.</b> Between the DB commit and the Kafka send, a JVM
 * crash will lose the event. For a learning project that's acceptable; the
 * production upgrade is the <b>transactional outbox pattern</b>: write the
 * event to an {@code outbox} table in the same transaction, and have a
 * separate process (or Debezium) tail it and publish to Kafka. The service
 * layer publishes a Spring {@link ApplicationEvent}; swapping the AFTER_COMMIT
 * listener for an outbox writer is a contained change.
 *
 * <p><b>Why both styles.</b> {@code TilingRequested} is fired explicitly
 * inside the service (we want to send it whether the surrounding transaction
 * commits a state change or not — uploading the source is itself the trigger).
 * {@code CatalogChanged} fires only after commit, since its purpose is to
 * invalidate caches that should mirror committed state.
 */
@Component
public class CatalogEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(CatalogEventPublisher.class);

    private final KafkaTemplate<String, byte[]> kafka;
    private final String tilingRequestedTopic;
    private final String catalogChangedTopic;

    public CatalogEventPublisher(
            KafkaTemplate<String, byte[]> kafka,
            @Value("${mapgenie.topics.tiling-requested}") String tilingRequestedTopic,
            @Value("${mapgenie.topics.catalog-changed}") String catalogChangedTopic) {
        this.kafka = kafka;
        this.tilingRequestedTopic = tilingRequestedTopic;
        this.catalogChangedTopic = catalogChangedTopic;
    }

    /** Eager publish — used for tiling requests, which aren't tied to a DB commit alone. */
    public void publishTilingRequested(TilingRequested event) {
        log.info("publish tiling.requested map_id={} prefix={}", event.getMapId(), event.getPrefix());
        kafka.send(tilingRequestedTopic, String.valueOf(event.getMapId()), event.toByteArray());
    }

    /**
     * Service layer fires this as a Spring event; we publish to Kafka only
     * once the surrounding DB transaction commits. The key is {@code mapId}
     * so all events for one map land on the same partition (ordering).
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCatalogChanged(CatalogChanged event) {
        log.debug("publish catalog.changed map_id={} kind={} action={}",
                event.getMapId(), event.getKind(), event.getAction());
        kafka.send(catalogChangedTopic, String.valueOf(event.getMapId()), event.toByteArray());
    }
}
