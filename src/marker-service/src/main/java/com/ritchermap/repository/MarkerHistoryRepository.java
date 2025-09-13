package com.ritchermap.repository;

import com.ritchermap.entity.MarkerHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface MarkerHistoryRepository extends JpaRepository<MarkerHistory, UUID> {

    Page<MarkerHistory> findByMarkerIdOrderByCreatedAtDesc(UUID markerId, Pageable pageable);

    List<MarkerHistory> findByMarkerIdAndAction(UUID markerId, String action);

    @Query("SELECT h FROM MarkerHistory h WHERE h.changedBy = :userId ORDER BY h.createdAt DESC")
    Page<MarkerHistory> findByChangedByOrderByCreatedAtDesc(@Param("userId") UUID userId, Pageable pageable);

    @Query("SELECT h FROM MarkerHistory h WHERE h.marker.gameId = :gameId AND h.createdAt >= :since ORDER BY h.createdAt DESC")
    List<MarkerHistory> findRecentHistoryForGame(@Param("gameId") UUID gameId, @Param("since") OffsetDateTime since);

    @Query("SELECT h.action, COUNT(h) FROM MarkerHistory h WHERE h.marker.gameId = :gameId GROUP BY h.action")
    List<Object[]> getActionStatistics(@Param("gameId") UUID gameId);

    void deleteByMarkerIdAndCreatedAtBefore(UUID markerId, OffsetDateTime cutoffDate);
}