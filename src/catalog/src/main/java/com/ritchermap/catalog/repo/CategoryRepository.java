package com.ritchermap.catalog.repo;

import com.ritchermap.catalog.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findAllByMapIdOrderBySortOrderAscNameAsc(Long mapId);
    Optional<Category> findByMapIdAndSlug(Long mapId, String slug);
    boolean existsByMapIdAndSlug(Long mapId, String slug);
    long countByMapId(Long mapId);
}

