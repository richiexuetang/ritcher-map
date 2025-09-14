package com.ritchermap.markerservice.service;

import com.ritchermap.markerservice.entity.Marker;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class EventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.kafka.topics.marker-events:marker-events}")
    private String markerEventsTopic;

    public void publishMarkerCreated(Marker marker) {
        try {
            Map<String, Object> event = createBaseEvent(marker, "marker.created");
            kafkaTemplate.send(markerEventsTopic, marker.getId().toString(), event);
            log.debug("Published marker.created event for marker {}", marker.getId());
        } catch (Exception e) {
            log.error("Failed to publish marker.created event for marker {}", marker.getId(), e);
        }
    }

    public void publishMarkerUpdated(Marker marker, Marker originalMarker) {
        try {
            Map<String, Object> event = createBaseEvent(marker, "marker.updated");
            event.put("changes", calculateChanges(originalMarker, marker));
            kafkaTemplate.send(markerEventsTopic, marker.getId().toString(), event);
            log.debug("Published marker.updated event for marker {}", marker.getId());
        } catch (Exception e) {
            log.error("Failed to publish marker.updated event for marker {}", marker.getId(), e);
        }
    }

    public void publishMarkerDeleted(Marker marker) {
        try {
            Map<String, Object> event = createBaseEvent(marker, "marker.deleted");
            kafkaTemplate.send(markerEventsTopic, marker.getId().toString(), event);
            log.debug("Published marker.deleted event for marker {}", marker.getId());
        } catch (Exception e) {
            log.error("Failed to publish marker.deleted event for marker {}", marker.getId(), e);
        }
    }

    private Map<String, Object> createBaseEvent(Marker marker, String eventType) {
        Map<String, Object> event = new HashMap<>();
        event.put("eventId", UUID.randomUUID().toString());
        event.put("eventType", eventType);
        event.put("timestamp", System.currentTimeMillis());
        event.put("markerId", marker.getId().toString());
        event.put("gameId", marker.getGame().getId().toString());
        event.put("categoryId", marker.getCategory() != null ? marker.getCategory().getId().toString() : null);
        event.put("title", marker.getTitle());
        event.put("position", Map.of(
                "latitude", marker.getPosition().getY(),
                "longitude", marker.getPosition().getX()
        ));
        event.put("visibilityLevel", marker.getVisibilityLevel());
        event.put("version", marker.getVersion());

        return event;
    }

    private Map<String, Object> calculateChanges(Marker original, Marker updated) {
        Map<String, Object> changes = new HashMap<>();

        if (!original.getTitle().equals(updated.getTitle())) {
            changes.put("title", Map.of("from", original.getTitle(), "to", updated.getTitle()));
        }

        if (!Objects.equals(original.getDescription(), updated.getDescription())) {
            changes.put("description", Map.of("from", original.getDescription(), "to", updated.getDescription()));
        }

        if (!original.getPosition().equals(updated.getPosition())) {
            changes.put("position", Map.of(
                    "from", Map.of("latitude", original.getPosition().getY(), "longitude", original.getPosition().getX()),
                    "to", Map.of("latitude", updated.getPosition().getY(), "longitude", updated.getPosition().getX())
            ));
        }

        return changes;
    }
}