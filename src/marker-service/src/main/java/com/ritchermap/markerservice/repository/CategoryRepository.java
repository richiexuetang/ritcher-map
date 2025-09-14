package com.ritchermap.markerservice.repository;

import com.ritchermap.markerservice.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByGameIdAndIsActiveTrue(UUID gameId);

    @Query("SELECT c FROM Category c WHERE c.game.id = :gameId AND c.isActive = true ORDER BY c.sortOrder, c.name")
    List<Category> findActiveByGameIdOrderBySortOrder(@Param("gameId") UUID gameId);

    Optional<Category> findByGameIdAndName(UUID gameId, String name);

    boolean existsByGameIdAndName(UUID gameId, String name);
}
