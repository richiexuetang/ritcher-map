package com.ritchermap.catalog.repo;

import com.ritchermap.catalog.domain.GameMap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MapRepository extends JpaRepository<GameMap, Long> {
    Optional<GameMap> findByPrefix(String prefix);
    Optional<GameMap> findByGameSlugAndMapSlug(String gameSlug, String mapSlug);
    boolean existsByPrefix(String prefix);
}