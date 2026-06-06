package com.ritchermap.catalog.repo;

import com.ritchermap.catalog.domain.Marker;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MarkerRepository extends JpaRepository<Marker, Long>, MarkerRepositoryCustom {
    List<Marker> findAllByMapId(Long mapId);
    long countByMapId(Long mapId);
    long countByCategoryId(Long categoryId);

    @Modifying
    @Query("DELETE FROM Marker m WHERE m.mapId = :mapId")
    int deleteAllByMapId(@Param("mapId") Long mapId);
}