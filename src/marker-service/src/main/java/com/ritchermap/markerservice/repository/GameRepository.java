package com.ritchermap.markerservice.repository;

import com.ritchermap.markerservice.entity.Game;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GameRepository extends JpaRepository<Game, UUID> {

    Optional<Game> findBySlug(String slug);

    List<Game> findByIsActiveTrue();

    @Query("SELECT g FROM Game g WHERE g.isActive = true ORDER BY g.name")
    List<Game> findActiveGamesOrderByName();

    boolean existsBySlug(String slug);
}