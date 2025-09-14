package com.ritchermap.markerservice.controller;


import com.ritchermap.markerservice.dto.*;
import com.ritchermap.markerservice.service.MarkerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/markers")
@RequiredArgsConstructor
public class MarkerController {

    private final MarkerService markerService;

    @GetMapping("/game/{gameId}")
    public ResponseEntity<Page<MarkerDto>> getMarkersByGame(
            @PathVariable UUID gameId,
            Pageable pageable) {
        Page<MarkerDto> markers = markerService.getMarkersByGame(gameId, pageable);
        return ResponseEntity.ok(markers);
    }

    @GetMapping("/game/{gameId}/bounds")
    public ResponseEntity<List<MarkerDto>> getMarkersInBounds(
            @PathVariable UUID gameId,
            @RequestParam double west,
            @RequestParam double south,
            @RequestParam double east,
            @RequestParam double north) {
        List<MarkerDto> markers = markerService.getMarkersInBounds(gameId, west, south, east, north);
        return ResponseEntity.ok(markers);
    }

    @GetMapping("/game/{gameId}/nearby")
    public ResponseEntity<List<MarkerDto>> getNearbyMarkers(
            @PathVariable UUID gameId,
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(defaultValue = "1000") double radiusMeters) {
        List<MarkerDto> markers = markerService.getNearbyMarkers(gameId, latitude, longitude, radiusMeters);
        return ResponseEntity.ok(markers);
    }

    @GetMapping("/{id}")
    public ResponseEntity<MarkerDto> getMarker(@PathVariable UUID id) {
        MarkerDto marker = markerService.getMarkerById(id);
        return ResponseEntity.ok(marker);
    }

    @PostMapping
    public ResponseEntity<MarkerDto> createMarker(
            @Valid @RequestBody CreateMarkerRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        UUID userId = extractUserId(userDetails);
        MarkerDto marker = markerService.createMarker(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(marker);
    }

    @PutMapping("/{id}")
    public ResponseEntity<MarkerDto> updateMarker(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateMarkerRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        UUID userId = extractUserId(userDetails);
        MarkerDto marker = markerService.updateMarker(id, request, userId);
        return ResponseEntity.ok(marker);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMarker(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserDetails userDetails) {
        UUID userId = extractUserId(userDetails);
        markerService.deleteMarker(id, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bulk")
    public ResponseEntity<List<MarkerDto>> bulkCreateMarkers(
            @Valid @RequestBody MarkerBulkRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        UUID userId = extractUserId(userDetails);
        List<MarkerDto> markers = markerService.bulkCreateMarkers(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(markers);
    }

    private UUID extractUserId(UserDetails userDetails) {
        // In a real implementation, extract user ID from JWT token or user details
        // For now, return a dummy UUID
        return UUID.fromString("550e8400-e29b-41d4-a716-446655440001");
    }
}