package com.ritchermap.repository.custom;

import com.ritchermap.dto.request.MarkerFilterRequest;
import com.ritchermap.entity.Marker;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface MarkerCustomRepository {

    Page<Marker> findMarkersWithFilters(MarkerFilterRequest filterRequest, Pageable pageable);

    List<Marker> findNearbyMarkers(UUID gameId, double latitude, double longitude, double radiusKm, int limit);

    Map<String, Object> getMarkerStatistics(UUID gameId);

    List<Marker> findMarkersWithinPolygon(UUID gameId, List<double[]> polygonPoints);

    List<Marker> findDuplicateMarkers(UUID gameId, double toleranceMeters);
}