package com.ritchermap.catalog.api;

import com.ritchermap.catalog.api.Dtos.CategoryRequest;
import com.ritchermap.catalog.api.Dtos.CategoryResponse;
import com.ritchermap.catalog.service.CategoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CategoryController {

    private final CategoryService categories;

    public CategoryController(CategoryService categories) { this.categories = categories; }

    @GetMapping("/maps/{mapId}/categories")
    public List<CategoryResponse> list(@PathVariable long mapId) {
        return categories.list(mapId).stream().map(CategoryResponse::from).toList();
    }

    @PostMapping("/maps/{mapId}/categories")
    public ResponseEntity<CategoryResponse> create(
            @PathVariable long mapId,
            @Valid @RequestBody CategoryRequest req) {
        var saved = categories.create(mapId, req.slug(), req.name(), req.icon(),
                req.sortOrder(), req.parentId());
        return ResponseEntity
                .created(URI.create("/api/v1/categories/" + saved.getId()))
                .body(CategoryResponse.from(saved));
    }

    @PutMapping("/categories/{id}")
    public CategoryResponse update(@PathVariable long id, @Valid @RequestBody CategoryRequest req) {
        var c = categories.update(id, req.name(), req.icon(), req.sortOrder(), req.parentId());
        return CategoryResponse.from(c);
    }

    @DeleteMapping("/categories/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        categories.delete(id);
    }
}
