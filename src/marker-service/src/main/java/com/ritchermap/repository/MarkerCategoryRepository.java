package com.ritchermap.repository;

import com.ritchermap.entity.MarkerCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MarkerCategoryRepository extends JpaRepository<MarkerCategory, UUID> {

    List<MarkerCategory> findByGameIdAndIsActiveTrue(UUID gameId);

    List<MarkerCategory> findByGameIdAndParentIsNullAndIsActiveTrue(UUID gameId);

    Optional<MarkerCategory> findByGameIdAndSlug(UUID gameId, String slug);

    List<MarkerCategory> findByParentIdAndIsActiveTrue(UUID parentId);

    @Query("SELECT c FROM MarkerCategory c WHERE c.gameId = :gameId AND c.isCollectible = true AND c.isActive = true")
    List<MarkerCategory> findCollectibleCategories(@Param("gameId") UUID gameId);

    @Query("SELECT COUNT(m) FROM Marker m WHERE m.category.id = :categoryId AND m.status = 'ACTIVE'")
    long countMarkersByCategory(@Param("categoryId") UUID categoryId);

    boolean existsByGameIdAndSlug(UUID gameId, String slug);
}