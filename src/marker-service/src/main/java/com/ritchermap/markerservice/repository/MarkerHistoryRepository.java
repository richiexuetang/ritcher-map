package com.ritchermap.markerservice.repository;

import com.ritchermap.markerservice.entity.MarkerHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface MarkerHistoryRepository extends JpaRepository<MarkerHistory, UUID> {

    Page<MarkerHistory> findByMarkerIdOrderByCreatedAtDesc(UUID markerId, Pageable pageable);

    List<MarkerHistory> findByGameIdAndCreatedAtBetween(UUID gameId, LocalDateTime start, LocalDateTime end);

    @Query("SELECT mh FROM MarkerHistory mh WHERE mh.changedBy = :userId ORDER BY mh.createdAt DESC")
    Page<MarkerHistory> findUserChanges(@Param("userId") UUID userId, Pageable pageable);
}
