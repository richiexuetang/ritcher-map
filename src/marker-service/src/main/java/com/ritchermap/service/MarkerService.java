package com.ritchermap.service;

import com.ritchermap.dto.mapper.MarkerMapper;
import com.ritchermap.dto.request.CreateMarkerRequest;
import com.ritchermap.dto.request.MarkerFilterRequest;
import com.ritchermap.dto.request.UpdateMarkerRequest;
import com.ritchermap.dto.response.MarkerResponse;
import com.ritchermap.dto.response.MarkerSummaryResponse;
import com.ritchermap.entity.Marker;
import com.ritchermap.entity.MarkerCategory;
import com.ritchermap.entity.MarkerTag;
import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.exception.MarkerNotFoundException;
import com.ritchermap.repository.MarkerCategoryRepository;
import com.ritchermap.repository.MarkerRepository;
import com.ritchermap.repository.MarkerTagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class MarkerService {

    private final MarkerRepository markerRepository;
    private final MarkerCategoryRepository categoryRepository;
    private final MarkerTagRepository tagRepository;
    private final MarkerMapper markerMapper;
    private final MarkerValidationService validationService;
    private final MarkerHistoryService historyService;
    private final EventPublisherService eventPublisher;
    private final CacheService cacheService;

    @Cacheable(value = "markers", key = "#id")
    @Transactional(readOnly = true)
    public MarkerResponse findById(UUID id) {
        log.debug("Finding marker by id: {}", id);

        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new MarkerNotFoundException("Marker not found with id: " + id));

        // Increment view count asynchronously
        incrementViewCountAsync(id);

        return markerMapper.toResponse(marker);
    }

    @Transactional(readOnly = true)
    public Page<MarkerSummaryResponse> findMarkersWithFilters(MarkerFilterRequest filterRequest, Pageable pageable) {
        log.debug("Finding markers with filters: {}", filterRequest);

        Page<Marker> markers = markerRepository.findMarkersWithFilters(filterRequest, pageable);

        return markers.map(markerMapper::toSummaryResponse);
    }

    @Transactional(readOnly = true)
    public Page<MarkerSummaryResponse> findByGameId(UUID gameId, Pageable pageable) {
        log.debug("Finding markers for game: {}", gameId);

        Page<Marker> markers = markerRepository.findByGameIdAndStatus(gameId, MarkerStatus.ACTIVE, pageable);

        return markers.map(markerMapper::toSummaryResponse);
    }

    @Transactional(readOnly = true)
    public List<MarkerSummaryResponse> findNearbyMarkers(UUID gameId, BigDecimal latitude, BigDecimal longitude,
                                                         double radiusKm, int limit) {
        log.debug("Finding nearby markers for game: {} at {},{} within {}km", gameId, latitude, longitude, radiusKm);

        List<Marker> markers = markerRepository.findNearbyMarkers(
                gameId, latitude.doubleValue(), longitude.doubleValue(), radiusKm, limit);

        return markers.stream()
                .map(markerMapper::toSummaryResponse)
                .collect(Collectors.toList());
    }

    @CachePut(value = "markers", key = "#result.id")
    public MarkerResponse createMarker(CreateMarkerRequest request, UUID createdBy) {
        log.info("Creating marker: {} for game: {}", request.getTitle(), request.getGameId());

        // Validate request
        validationService.validateCreateRequest(request);

        // Check for duplicates
        validationService.checkForDuplicates(request.getGameId(), request.getLatitude(), request.getLongitude());

        // Create marker entity
        Marker marker = markerMapper.toEntity(request);
        marker.setCreatedBy(createdBy);

        // Set category if provided
        if (request.getCategoryId() != null) {
            MarkerCategory category = categoryRepository.findById(request.getCategoryId())
                    .orElseThrow(() -> new IllegalArgumentException("Category not found"));
            marker.setCategory(category);
        }

        // Set tags if provided
        if (request.getTagIds() != null && !request.getTagIds().isEmpty()) {
            Set<MarkerTag> tags = tagRepository.findAllById(request.getTagIds()).stream()
                    .collect(Collectors.toSet());
            marker.setTags(tags);
        }

        // Save marker
        marker = markerRepository.save(marker);

        // Create history entry
        historyService.recordMarkerCreated(marker, createdBy);

        // Publish event
        eventPublisher.publishMarkerCreated(marker);

        // Invalidate related caches
        cacheService.invalidateGameMarkers(request.getGameId());

//        log.info("Marker created successfully with id: {}", marker.getId());

        return markerMapper.toResponse(marker);
    }

    @CachePut(value = "markers", key = "#id")
    public MarkerResponse updateMarker(UUID id, UpdateMarkerRequest request, UUID updatedBy) {
        log.info("Updating marker: {}", id);

        // Find existing marker
        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new MarkerNotFoundException("Marker not found with id: " + id));

        // Store previous values for history
        Map<String, Object> previousValues = historyService.captureMarkerState(marker);

        // Validate update request
        validationService.validateUpdateRequest(marker, request);

        // Update marker entity
        markerMapper.updateEntity(marker, request);

        // Update category if provided
        if (request.getCategoryId() != null) {
            MarkerCategory category = categoryRepository.findById(request.getCategoryId())
                    .orElseThrow(() -> new IllegalArgumentException("Category not found"));
            marker.setCategory(category);
        }

        // Update tags if provided
        if (request.getTagIds() != null) {
            Set<MarkerTag> tags = tagRepository.findAllById(request.getTagIds()).stream()
                    .collect(Collectors.toSet());
            marker.setTags(tags);
        }

        // Save marker
        marker = markerRepository.save(marker);

        // Create history entry
        historyService.recordMarkerUpdated(marker, updatedBy, previousValues);

        // Publish event
        eventPublisher.publishMarkerUpdated(marker);

        // Invalidate related caches
        cacheService.invalidateGameMarkers(marker.getGameId());

        log.info("Marker updated successfully: {}", id);

        return markerMapper.toResponse(marker);
    }

    @CacheEvict(value = "markers", key = "#id")
    public void deleteMarker(UUID id, UUID deletedBy) {
        log.info("Deleting marker: {}", id);

        // Find existing marker
        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new MarkerNotFoundException("Marker not found with id: " + id));

        // Soft delete by setting status
        marker.setStatus(MarkerStatus.ARCHIVED);
        markerRepository.save(marker);

        // Create history entry
        historyService.recordMarkerDeleted(marker, deletedBy);

        // Publish event
        eventPublisher.publishMarkerDeleted(marker);

        // Invalidate related caches
        cacheService.invalidateGameMarkers(marker.getGameId());

        log.info("Marker deleted successfully: {}", id);
    }

    public void verifyMarker(UUID id, UUID verifiedBy) {
        log.info("Verifying marker: {}", id);

        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new MarkerNotFoundException("Marker not found with id: " + id));

        marker.setVerified(true);
        marker.setVerifiedBy(verifiedBy);
        marker.setVerifiedAt(java.time.OffsetDateTime.now());

        markerRepository.save(marker);

        // Create history entry
        historyService.recordMarkerVerified(marker, verifiedBy);

        // Publish event
        eventPublisher.publishMarkerVerified(marker);

        log.info("Marker verified successfully: {}", id);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getMarkerStatistics(UUID gameId) {
        log.debug("Getting marker statistics for game: {}", gameId);

        return markerRepository.getMarkerStatistics(gameId);
    }

    private void incrementViewCountAsync(UUID markerId) {
        // This would typically be done asynchronously
        try {
            markerRepository.incrementViewCount(markerId);
        } catch (Exception e) {
            log.warn("Failed to increment view count for marker: {}", markerId, e);
        }
    }
}