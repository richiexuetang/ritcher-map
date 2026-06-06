package com.ritchermap.catalog.service;

import com.ritchermap.catalog.domain.Category;
import com.ritchermap.catalog.error.ConflictException;
import com.ritchermap.catalog.error.NotFoundException;
import com.ritchermap.catalog.events.Events.CatalogChanged;
import com.ritchermap.catalog.repo.CategoryRepository;
import com.ritchermap.catalog.repo.MapRepository;
import com.ritchermap.catalog.repo.MarkerRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CategoryService {

    private final CategoryRepository categories;
    private final MapRepository maps;
    private final MarkerRepository markers;
    private final ApplicationEventPublisher events;

    public CategoryService(CategoryRepository categories, MapRepository maps,
                           MarkerRepository markers, ApplicationEventPublisher events) {
        this.categories = categories;
        this.maps = maps;
        this.markers = markers;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<Category> list(long mapId) {
        if (!maps.existsById(mapId)) throw NotFoundException.of("map", mapId);
        return categories.findAllByMapIdOrderBySortOrderAscNameAsc(mapId);
    }

    @Transactional
    public Category create(long mapId, String slug, String name, String icon,
                           int sortOrder, Long parentId) {
        if (!maps.existsById(mapId)) throw NotFoundException.of("map", mapId);
        if (categories.existsByMapIdAndSlug(mapId, slug)) {
            throw new ConflictException("category exists: " + slug);
        }
        if (parentId != null && !categories.existsById(parentId)) {
            throw NotFoundException.of("parent category", parentId);
        }
        Category c = new Category(mapId, slug, name);
        c.update(name, icon, sortOrder, parentId);
        Category saved = categories.save(c);
        events.publishEvent(new CatalogChanged(mapId, "category", "created"));
        return saved;
    }

    @Transactional
    public Category update(long id, String name, String icon, int sortOrder, Long parentId) {
        Category c = categories.findById(id)
                .orElseThrow(() -> NotFoundException.of("category", id));
        if (parentId != null && parentId.equals(id)) {
            throw new ConflictException("category cannot be its own parent");
        }
        c.update(name, icon, sortOrder, parentId);
        events.publishEvent(new CatalogChanged(c.getMapId(), "category", "updated"));
        return c;
    }

    /**
     * Refuse to delete a category that still has markers — referential integrity
     * is enforced at the DB level too ({@code ON DELETE RESTRICT}), but a clean
     * 409 with a count beats a generic constraint-violation 500.
     */
    @Transactional
    public void delete(long id) {
        Category c = categories.findById(id)
                .orElseThrow(() -> NotFoundException.of("category", id));
        long count = markers.countByCategoryId(id);
        if (count > 0) {
            throw new ConflictException(
                    "category has " + count + " markers; delete or reassign them first");
        }
        long mapId = c.getMapId();
        categories.deleteById(id);
        events.publishEvent(new CatalogChanged(mapId, "category", "deleted"));
    }
}
