package com.ritchermap.markerservice.service;

import com.ritchermap.markerservice.dto.*;
import com.ritchermap.markerservice.entity.Game;
import com.ritchermap.markerservice.entity.Marker;
import com.ritchermap.markerservice.entity.Category;
import com.ritchermap.markerservice.entity.MarkerHistory;
import com.ritchermap.markerservice.exception.ResourceNotFoundException;
import com.ritchermap.markerservice.exception.ValidationException;
import com.ritchermap.markerservice.repository.GameRepository;
import com.ritchermap.markerservice.repository.MarkerRepository;
import com.ritchermap.markerservice.repository.CategoryRepository;
import com.ritchermap.markerservice.repository.MarkerHistoryRepository;
import com.ritchermap.markerservice.util.GeometryUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.locationtech.jts.geom.Point;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MarkerService {

    private final MarkerRepository markerRepository;
    private final GameRepository gameRepository;
    private final CategoryRepository categoryRepository;
    private final MarkerHistoryRepository historyRepository;
    private final EventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<MarkerDto> getMarkersByGame(UUID gameId, Pageable pageable) {
        validateGameExists(gameId);
        return markerRepository.findByGameId(gameId, pageable)
                .map(this::convertToDto);
    }

    @Transactional(readOnly = true)
    public List<MarkerDto> getMarkersInBounds(UUID gameId, double west, double south, double east, double north) {
        validateGameExists(gameId);
        return markerRepository.findMarkersInBounds(gameId, west, south, east, north)
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public MarkerDto getMarkerById(UUID id) {
        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marker not found: " + id));
        return convertToDto(marker);
    }

    @Transactional
    public MarkerDto createMarker(CreateMarkerRequest request, UUID userId) {
        // Validate game exists
        Game game = gameRepository.findById(request.getGameId())
                .orElseThrow(() -> new ResourceNotFoundException("Game not found: " + request.getGameId()));

        // Validate category if provided
        Category category = null;
        if (request.getCategoryId() != null) {
            category = categoryRepository.findById(request.getCategoryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + request.getCategoryId()));

            if (!category.getGame().getId().equals(request.getGameId())) {
                throw new ValidationException("Category does not belong to the specified game");
            }
        }

        // Create marker
        Marker marker = new Marker();
        marker.setGame(game);
        marker.setCategory(category);
        marker.setPosition(GeometryUtils.createPoint(request.getPosition().getLongitude(), request.getPosition().getLatitude()));
        marker.setTitle(request.getTitle());
        marker.setDescription(request.getDescription());
        marker.setMetadata(request.getMetadata() != null ? request.getMetadata() : new HashMap<>());
        marker.setVisibilityLevel(request.getVisibilityLevel());
        marker.setCreatedBy(userId);
        marker.setUpdatedBy(userId);

        marker = markerRepository.save(marker);

        // Create history record
        createHistoryRecord(marker, MarkerHistory.OperationType.CREATE, userId);

        // Publish event
        eventPublisher.publishMarkerCreated(marker);

        log.info("Created marker {} for game {} by user {}", marker.getId(), game.getId(), userId);

        return convertToDto(marker);
    }

    @Transactional
    public MarkerDto updateMarker(UUID id, UpdateMarkerRequest request, UUID userId) {
        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marker not found: " + id));

        // Store original version for history
        Marker originalMarker = new Marker();
        copyMarkerProperties(marker, originalMarker);

        // Update fields if provided
        if (request.getCategoryId() != null) {
            Category category = categoryRepository.findById(request.getCategoryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + request.getCategoryId()));

            if (!category.getGame().getId().equals(marker.getGame().getId())) {
                throw new ValidationException("Category does not belong to the marker's game");
            }
            marker.setCategory(category);
        }

        if (request.getPosition() != null) {
            marker.setPosition(GeometryUtils.createPoint(
                    request.getPosition().getLongitude(),
                    request.getPosition().getLatitude()
            ));
        }

        if (request.getTitle() != null) {
            marker.setTitle(request.getTitle());
        }

        if (request.getDescription() != null) {
            marker.setDescription(request.getDescription());
        }

        if (request.getMetadata() != null) {
            marker.setMetadata(request.getMetadata());
        }

        if (request.getVisibilityLevel() != null) {
            marker.setVisibilityLevel(request.getVisibilityLevel());
        }

        marker.setUpdatedBy(userId);

        marker = markerRepository.save(marker);

        // Create history record
        createHistoryRecord(marker, MarkerHistory.OperationType.UPDATE, userId);

        // Publish event
        eventPublisher.publishMarkerUpdated(marker, originalMarker);

        log.info("Updated marker {} by user {}", marker.getId(), userId);

        return convertToDto(marker);
    }

    @Transactional
    public void deleteMarker(UUID id, UUID userId) {
        Marker marker = markerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marker not found: " + id));

        // Create history record before deletion
        createHistoryRecord(marker, MarkerHistory.OperationType.DELETE, userId);

        // Publish event before deletion
        eventPublisher.publishMarkerDeleted(marker);

        markerRepository.delete(marker);

        log.info("Deleted marker {} by user {}", id, userId);
    }

    @Transactional
    public List<MarkerDto> bulkCreateMarkers(MarkerBulkRequest request, UUID userId) {
        List<MarkerDto> createdMarkers = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (int i = 0; i < request.getMarkers().size(); i++) {
            try {
                CreateMarkerRequest markerRequest = request.getMarkers().get(i);
                MarkerDto created = createMarker(markerRequest, userId);
                createdMarkers.add(created);
            } catch (Exception e) {
                String error = String.format("Error creating marker at index %d: %s", i, e.getMessage());
                errors.add(error);

                if (!request.isContinueOnError()) {
                    throw new ValidationException("Bulk creation failed: " + error);
                }
            }
        }

        if (!errors.isEmpty()) {
            log.warn("Bulk marker creation completed with {} errors: {}", errors.size(), errors);
        }

        log.info("Bulk created {} markers for user {}", createdMarkers.size(), userId);

        return createdMarkers;
    }

    @Transactional(readOnly = true)
    public List<MarkerDto> getNearbyMarkers(UUID gameId, double latitude, double longitude, double radiusMeters) {
        validateGameExists(gameId);
        return markerRepository.findMarkersNearLocation(gameId, latitude, longitude, radiusMeters)
                .stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private void validateGameExists(UUID gameId) {
        if (!gameRepository.existsById(gameId)) {
            throw new ResourceNotFoundException("Game not found: " + gameId);
        }
    }

    private void createHistoryRecord(Marker marker, MarkerHistory.OperationType operationType, UUID userId) {
        MarkerHistory history = new MarkerHistory();
        history.setMarkerId(marker.getId());
        history.setGameId(marker.getGame().getId());
        history.setCategoryId(marker.getCategory() != null ? marker.getCategory().getId() : null);
        history.setPosition(marker.getPosition());
        history.setTitle(marker.getTitle());
        history.setDescription(marker.getDescription());
        history.setMetadata(marker.getMetadata());
        history.setVisibilityLevel(marker.getVisibilityLevel());
        history.setOperationType(operationType);
        history.setChangedBy(userId);
        history.setVersion(marker.getVersion());

        historyRepository.save(history);
    }

    private void copyMarkerProperties(Marker source, Marker target) {
        target.setId(source.getId());
        target.setGame(source.getGame());
        target.setCategory(source.getCategory());
        target.setPosition(source.getPosition());
        target.setTitle(source.getTitle());
        target.setDescription(source.getDescription());
        target.setMetadata(new HashMap<>(source.getMetadata()));
        target.setVisibilityLevel(source.getVisibilityLevel());
        target.setCreatedBy(source.getCreatedBy());
        target.setUpdatedBy(source.getUpdatedBy());
        target.setVersion(source.getVersion());
    }

    private MarkerDto convertToDto(Marker marker) {
        MarkerDto dto = new MarkerDto();
        dto.setId(marker.getId());
        dto.setGameId(marker.getGame().getId());
        dto.setGameSlug(marker.getGame().getSlug());

        if (marker.getCategory() != null) {
            dto.setCategoryId(marker.getCategory().getId());
            dto.setCategoryName(marker.getCategory().getName());
        }

        Point point = marker.getPosition();
        dto.setPosition(new MarkerDto.PositionDto(point.getY(), point.getX()));

        dto.setTitle(marker.getTitle());
        dto.setDescription(marker.getDescription());
        dto.setMetadata(marker.getMetadata());
        dto.setVisibilityLevel(marker.getVisibilityLevel());
        dto.setCreatedBy(marker.getCreatedBy());
        dto.setUpdatedBy(marker.getUpdatedBy());
        dto.setVersion(marker.getVersion());
        dto.setCreatedAt(marker.getCreatedAt());
        dto.setUpdatedAt(marker.getUpdatedAt());

        return dto;
    }
}