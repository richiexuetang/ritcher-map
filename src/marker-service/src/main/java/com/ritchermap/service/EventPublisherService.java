package com.ritchermap.service;

import com.ritchermap.entity.Marker;
import com.ritchermap.event.MarkerCreatedEvent;
import com.ritchermap.event.MarkerDeletedEvent;
import com.ritchermap.event.MarkerUpdatedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EventPublisherService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final String MARKER_TOPIC = "marker-events";

    public void publishMarkerCreated(Marker marker) {
        log.debug("Publishing marker created event for: {}", marker.getId());

        MarkerCreatedEvent event = MarkerCreatedEvent.builder()
                .markerId(marker.getId())
                .gameId(marker.getGameId())
                .mapId(marker.getMapId())
                .title(marker.getTitle())
                .latitude(marker.getLatitude())
                .longitude(marker.getLongitude())
//                .markerType(marker.getMarkerType())
                .createdBy(marker.getCreatedBy())
//                .createdAt(marker.getCreatedAt())
                .build();

        kafkaTemplate.send(MARKER_TOPIC, marker.getId().toString(), event);
    }

    public void publishMarkerUpdated(Marker marker) {
        log.debug("Publishing marker updated event for: {}", marker.getId());

        MarkerUpdatedEvent event = MarkerUpdatedEvent.builder()
                .markerId(marker.getId())
                .gameId(marker.getGameId())
                .title(marker.getTitle())
                .latitude(marker.getLatitude())
                .longitude(marker.getLongitude())
//                .status(marker.getStatus())
//                .updatedAt(marker.getUpdatedAt())
                .build();

        kafkaTemplate.send(MARKER_TOPIC, marker.getId().toString(), event);
    }

    public void publishMarkerDeleted(Marker marker) {
        log.debug("Publishing marker deleted event for: {}", marker.getId());

        MarkerDeletedEvent event = MarkerDeletedEvent.builder()
                .markerId(marker.getId())
                .gameId(marker.getGameId())
                .title(marker.getTitle())
//                .deletedAt(marker.getUpdatedAt())
                .build();

        kafkaTemplate.send(MARKER_TOPIC, marker.getId().toString(), event);
    }

    public void publishMarkerVerified(Marker marker) {
        log.debug("Publishing marker verified event for: {}", marker.getId());

        // Create a custom event or reuse updated event
        publishMarkerUpdated(marker);
    }
}