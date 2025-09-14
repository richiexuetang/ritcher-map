package com.ritchermap.markerservice.repository;

import com.ritchermap.markerservice.entity.Marker;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MarkerRepository extends JpaRepository<Marker, UUID> {

    List<Marker> findByGameIdAndVisibilityLevelGreaterThan(UUID gameId, Integer visibilityLevel);

    Page<Marker> findByGameId(UUID gameId, Pageable pageable);

    List<Marker> findByCategoryId(UUID categoryId);

    @Query(value = """
        SELECT m.* FROM markers m 
        WHERE m.game_id = :gameId 
        AND m.visibility_level > 0
        AND ST_Intersects(m.position, ST_MakeEnvelope(:west, :south, :east, :north, 4326))
        """, nativeQuery = true)
    List<Marker> findMarkersInBounds(
            @Param("gameId") UUID gameId,
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north
    );

    @Query(value = """
        SELECT COUNT(*) FROM markers m 
        WHERE m.game_id = :gameId 
        AND m.visibility_level > 0
        """, nativeQuery = true)
    long countVisibleMarkersByGameId(@Param("gameId") UUID gameId);

    @Query(value = """
        SELECT m.* FROM markers m 
        WHERE m.game_id = :gameId 
        AND m.visibility_level > 0
        AND ST_DWithin(m.position, ST_MakePoint(:longitude, :latitude)::geography, :radiusMeters)
        ORDER BY ST_Distance(m.position, ST_MakePoint(:longitude, :latitude)::geography)
        """, nativeQuery = true)
    List<Marker> findMarkersNearLocation(
            @Param("gameId") UUID gameId,
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("radiusMeters") double radiusMeters
    );

    List<Marker> findByCreatedBy(UUID userId);
}
