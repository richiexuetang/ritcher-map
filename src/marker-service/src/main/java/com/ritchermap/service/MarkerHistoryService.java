package com.ritchermap.service;

import com.ritchermap.dto.mapper.MarkerMapper;
import com.ritchermap.dto.response.MarkerHistoryResponse;
import com.ritchermap.entity.Marker;
import com.ritchermap.entity.MarkerHistory;
import com.ritchermap.repository.MarkerHistoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class MarkerHistoryService {

    private final MarkerHistoryRepository historyRepository;
    private final MarkerMapper markerMapper;

    @Transactional(readOnly = true)
    public Page<MarkerHistoryResponse> getMarkerHistory(UUID markerId, Pageable pageable) {
        log.debug("Getting history for marker: {}", markerId);

        Page<MarkerHistory> history = historyRepository.findByMarkerIdOrderByCreatedAtDesc(markerId, pageable);

        return history.map(markerMapper::toHistoryResponse);
    }

    public void recordMarkerCreated(Marker marker, UUID createdBy) {
//        log.debug("Recording marker created event for: {}", marker.getId());

        MarkerHistory history = MarkerHistory.builder()
                .marker(marker)
                .action("CREATE")
                .changedBy(createdBy)
                .changes(captureMarkerState(marker))
                .build();

        historyRepository.save(history);
    }

    public void recordMarkerUpdated(Marker marker, UUID updatedBy, Map<String, Object> previousValues) {
//        log.debug("Recording marker updated event for: {}", marker.getId());

        Map<String, Object> changes = calculateChanges(previousValues, captureMarkerState(marker));

        if (!changes.isEmpty()) {
            MarkerHistory history = MarkerHistory.builder()
                    .marker(marker)
                    .action("UPDATE")
                    .changedBy(updatedBy)
                    .changes(changes)
                    .previousValues(previousValues)
                    .build();

            historyRepository.save(history);
        }
    }

    public void recordMarkerDeleted(Marker marker, UUID deletedBy) {
        log.debug("Recording marker deleted event for: {}", marker.getId());

        MarkerHistory history = MarkerHistory.builder()
                .marker(marker)
                .action("DELETE")
                .changedBy(deletedBy)
                .previousValues(captureMarkerState(marker))
                .build();

        historyRepository.save(history);
    }

    public void recordMarkerVerified(Marker marker, UUID verifiedBy) {
        log.debug("Recording marker verified event for: {}", marker.getId());

        Map<String, Object> changes = new HashMap<>();
        changes.put("verified", true);
        changes.put("verifiedBy", verifiedBy);
        changes.put("verifiedAt", OffsetDateTime.now());

        MarkerHistory history = MarkerHistory.builder()
                .marker(marker)
                .action("VERIFY")
                .changedBy(verifiedBy)
                .changes(changes)
                .build();

        historyRepository.save(history);
    }

    public Map<String, Object> captureMarkerState(Marker marker) {
        Map<String, Object> state = new HashMap<>();

        state.put("title", marker.getTitle());
        state.put("description", marker.getDescription());
        state.put("latitude", marker.getLatitude());
        state.put("longitude", marker.getLongitude());
        state.put("markerType", marker.getMarkerType());
        state.put("status", marker.getStatus());
        state.put("difficultyLevel", marker.getDifficultyLevel());
        state.put("categoryId", marker.getCategory() != null ? marker.getCategory().getId() : null);
        state.put("verified", marker.getVerified());
        state.put("iconUrl", marker.getIconUrl());
        state.put("metadata", marker.getMetadata());

        return state;
    }

    private Map<String, Object> calculateChanges(Map<String, Object> oldValues, Map<String, Object> newValues) {
        Map<String, Object> changes = new HashMap<>();

        newValues.forEach((key, newValue) -> {
            Object oldValue = oldValues.get(key);
            if (!java.util.Objects.equals(oldValue, newValue)) {
                changes.put(key, newValue);
            }
        });

        return changes;
    }
}