package com.ritchermap.catalog.repo;

import com.ritchermap.catalog.domain.Game;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GameRepository extends JpaRepository<Game, Long> {
    Optional<Game> findBySlug(String slug);
    boolean existsBySlug(String slug);
}
