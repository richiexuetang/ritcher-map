package com.ritchermap.repository;

import com.ritchermap.entity.Marker;
import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import com.ritchermap.repository.custom.MarkerCustomRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MarkerRepository extends JpaRepository<Marker, UUID>, MarkerCustomRepository {

    // Basic finders
    Page<Marker> findByGameIdAndStatus(UUID gameId, MarkerStatus status, Pageable pageable);

    List<Marker> findByGameIdAndMarkerType(UUID gameId, MarkerType markerType);

    Page<Marker> findByGameIdAndCategoryId(UUID gameId, UUID categoryId, Pageable pageable);

    Optional<Marker> findByGameIdAndExternalId(UUID gameId, String externalId);

    // Spatial queries
    @Query(value = """
        SELECT m FROM Marker m 
        WHERE m.gameId = :gameId 
        AND m.status = :status 
        AND m.latitude BETWEEN :minLat AND :maxLat 
        AND m.longitude BETWEEN :minLng AND :maxLng
        """)
    List<Marker> findMarkersWithinBounds(
            @Param("gameId") UUID gameId,
            @Param("status") MarkerStatus status,
            @Param("minLat") BigDecimal minLat,
            @Param("maxLat") BigDecimal maxLat,
            @Param("minLng") BigDecimal minLng,
            @Param("maxLng") BigDecimal maxLng
    );

    @Query(value = """
        SELECT m.* FROM markers m 
        WHERE m.game_id = :gameId 
        AND m.status = 'ACTIVE'
        AND ST_DWithin(m.coordinates, ST_MakePoint(:longitude, :latitude)::geography, :radiusMeters)
        ORDER BY ST_Distance(m.coordinates, ST_MakePoint(:longitude, :latitude)::geography)
        LIMIT :limit
        """, nativeQuery = true)
    List<Marker> findNearbyMarkers(
            @Param("gameId") UUID gameId,
            @Param("latitude") double latitude,
            @Param("longitude") double longitude,
            @Param("radiusMeters") double radiusMeters,
            @Param("limit") int limit
    );

    // Search queries
    @Query("""
        SELECT m FROM Marker m 
        WHERE m.gameId = :gameId 
        AND m.status = :status 
        AND (LOWER(m.title) LIKE LOWER(CONCAT('%', :searchTerm, '%')) 
             OR LOWER(m.description) LIKE LOWER(CONCAT('%', :searchTerm, '%')))
        """)
    Page<Marker> searchMarkers(
            @Param("gameId") UUID gameId,
            @Param("status") MarkerStatus status,
            @Param("searchTerm") String searchTerm,
            Pageable pageable
    );

    // Statistics queries
    @Query("SELECT COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status")
    long countByGameIdAndStatus(@Param("gameId") UUID gameId, @Param("status") MarkerStatus status);

    @Query("SELECT m.markerType, COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status GROUP BY m.markerType")
    List<Object[]> getMarkerCountByType(@Param("gameId") UUID gameId, @Param("status") MarkerStatus status);

    @Query("SELECT m.category.id, COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status AND m.category IS NOT NULL GROUP BY m.category.id")
    List<Object[]> getMarkerCountByCategory(@Param("gameId") UUID gameId, @Param("status") MarkerStatus status);

    // Bulk operations
    @Modifying
    @Query("UPDATE Marker m SET m.status = :newStatus WHERE m.gameId = :gameId AND m.status = :currentStatus")
    int bulkUpdateStatus(
            @Param("gameId") UUID gameId,
            @Param("currentStatus") MarkerStatus currentStatus,
            @Param("newStatus") MarkerStatus newStatus
    );

    @Modifying
    @Query("UPDATE Marker m SET m.category.id = :newCategoryId WHERE m.category.id = :oldCategoryId")
    int bulkUpdateCategory(
            @Param("oldCategoryId") UUID oldCategoryId,
            @Param("newCategoryId") UUID newCategoryId
    );

    @Modifying
    @Query("UPDATE Marker m SET m.viewCount = m.viewCount + 1 WHERE m.id = :markerId")
    void incrementViewCount(@Param("markerId") UUID markerId);

    // Recent markers
    List<Marker> findTop10ByGameIdAndStatusOrderByCreatedAtDesc(UUID gameId, MarkerStatus status);

    // Popular markers
    @Query("SELECT m FROM Marker m WHERE m.gameId = :gameId AND m.status = :status ORDER BY m.viewCount DESC, m.likeCount DESC")
    Page<Marker> findPopularMarkers(@Param("gameId") UUID gameId, @Param("status") MarkerStatus status, Pageable pageable);

    // Verification queries
    List<Marker> findByGameIdAndStatusAndVerified(UUID gameId, MarkerStatus status, Boolean verified);

//    @Query("SELECT m FROM Marker m WHERE m.gameId = :gameId AND m.verified = false AND m.status = :status ORDER BY m.createdAt ASC")
//    Page<Marker> findUnverifiedMarkers(@Param("gameId") UUID gameId, @Param("status") MarkerStatus status, Pageable pageable);

    // Batch operations for cleanup
//    @Query("SELECT m FROM Marker m WHERE m.status = :status AND m.updatedAt < :cutoffDate")
//    List<Marker> findOldMarkersByStatus(@Param("status") MarkerStatus status, @Param("cutoffDate") OffsetDateTime cutoffDate);

//    @Modifying
//    @Query("DELETE FROM Marker m WHERE m.status = :status AND m.updatedAt < :cutoffDate")
//    int deleteOldMarkersByStatus(@Param("status") MarkerStatus status, @Param("cutoffDate") OffsetDateTime cutoffDate);
}