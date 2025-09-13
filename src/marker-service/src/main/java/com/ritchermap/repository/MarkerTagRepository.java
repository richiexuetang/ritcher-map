package com.ritchermap.repository;

import com.ritchermap.entity.MarkerTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
public interface MarkerTagRepository extends JpaRepository<MarkerTag, UUID> {

    Optional<MarkerTag> findBySlug(String slug);

    List<MarkerTag> findByTagType(String tagType);

    @Query("SELECT t FROM MarkerTag t WHERE t.name ILIKE %:name%")
    List<MarkerTag> findByNameContainingIgnoreCase(@Param("name") String name);

    @Query("SELECT DISTINCT t FROM MarkerTag t JOIN t.markers m WHERE m.gameId = :gameId")
    List<MarkerTag> findTagsUsedInGame(@Param("gameId") UUID gameId);

    @Query("SELECT t, COUNT(m) FROM MarkerTag t JOIN t.markers m WHERE m.gameId = :gameId GROUP BY t ORDER BY COUNT(m) DESC")
    List<Object[]> findPopularTagsInGame(@Param("gameId") UUID gameId);

    Set<MarkerTag> findAllByIdIn(Set<UUID> ids);

    boolean existsBySlug(String slug);
}