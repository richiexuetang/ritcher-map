package com.ritchermap.service;

import com.ritchermap.dto.request.CreateMarkerRequest;
import com.ritchermap.dto.request.UpdateMarkerRequest;
import com.ritchermap.entity.Marker;
import com.ritchermap.exception.InvalidMarkerDataException;
import com.ritchermap.repository.MarkerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MarkerValidationService {

    private final MarkerRepository markerRepository;

    @Value("${app.marker.duplicate-tolerance-meters:10.0}")
    private double duplicateToleranceMeters;

    public void validateCreateRequest(CreateMarkerRequest request) {
        log.debug("Validating create marker request");

        // Additional business validations beyond bean validation
        if (request.getDifficultyLevel() != null &&
                (request.getDifficultyLevel() < 1 || request.getDifficultyLevel() > 5)) {
            throw new InvalidMarkerDataException("Difficulty level must be between 1 and 5");
        }

        // Validate coordinate bounds
        validateCoordinates(request.getLatitude(), request.getLongitude());

        // Validate external ID uniqueness if provided
        if (request.getExternalId() != null) {
            markerRepository.findByGameIdAndExternalId(request.getGameId(), request.getExternalId())
                    .ifPresent(existing -> {
                        throw new InvalidMarkerDataException("Marker with external ID already exists: " + request.getExternalId());
                    });
        }
    }

    public void validateUpdateRequest(Marker existingMarker, UpdateMarkerRequest request) {
//        log.debug("Validating update marker request for marker: {}", existingMarker.getId());

        // Validate coordinates if provided
        if (request.getLatitude() != null && request.getLongitude() != null) {
            validateCoordinates(request.getLatitude(), request.getLongitude());
        }

        // Additional business validations
        if (request.getDifficultyLevel() != null &&
                (request.getDifficultyLevel() < 1 || request.getDifficultyLevel() > 5)) {
            throw new InvalidMarkerDataException("Difficulty level must be between 1 and 5");
        }
    }

    public void checkForDuplicates(UUID gameId, BigDecimal latitude, BigDecimal longitude) {
        log.debug("Checking for duplicate markers near {},{}", latitude, longitude);

        List<Marker> nearby = markerRepository.findNearbyMarkers(
                gameId, latitude.doubleValue(), longitude.doubleValue(),
                duplicateToleranceMeters / 1000.0, 5); // Convert meters to km

        if (!nearby.isEmpty()) {
            log.warn("Found {} nearby markers within {}m tolerance", nearby.size(), duplicateToleranceMeters);
            // You might want to throw an exception or just log warning based on business rules
        }
    }

    private void validateCoordinates(BigDecimal latitude, BigDecimal longitude) {
        if (latitude.compareTo(BigDecimal.valueOf(-90)) < 0 ||
                latitude.compareTo(BigDecimal.valueOf(90)) > 0) {
            throw new InvalidMarkerDataException("Latitude must be between -90 and 90");
        }

        if (longitude.compareTo(BigDecimal.valueOf(-180)) < 0 ||
                longitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw new InvalidMarkerDataException("Longitude must be between -180 and 180");
        }
    }
}