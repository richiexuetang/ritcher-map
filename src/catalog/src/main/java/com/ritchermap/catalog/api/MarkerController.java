package com.ritchermap.catalog.api;

import com.ritchermap.catalog.api.Dtos.BulkImportRequest;
import com.ritchermap.catalog.api.Dtos.BulkImportResponse;
import com.ritchermap.catalog.api.Dtos.MarkerRequest;
import com.ritchermap.catalog.api.Dtos.MarkerResponse;
import com.ritchermap.catalog.repo.MarkerRepositoryCustom.MarkerInsert;
import com.ritchermap.catalog.service.MarkerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class MarkerController {

    private final MarkerService markers;

    public MarkerController(MarkerService markers) { this.markers = markers; }

    @GetMapping("/maps/{mapId}/markers")
    public List<MarkerResponse> list(@PathVariable long mapId) {
        return markers.list(mapId).stream().map(MarkerResponse::from).toList();
    }

    @PostMapping("/maps/{mapId}/markers")
    public ResponseEntity<MarkerResponse> create(
            @PathVariable long mapId,
            @Valid @RequestBody MarkerRequest req) {
        var saved = markers.create(mapId, req.categoryId(), req.x(), req.y(),
                req.title(), req.description());
        return ResponseEntity
                .created(URI.create("/api/v1/markers/" + saved.getId()))
                .body(MarkerResponse.from(saved));
    }

    @PutMapping("/markers/{id}")
    public MarkerResponse update(@PathVariable long id, @Valid @RequestBody MarkerRequest req) {
        var m = markers.update(id, req.categoryId(), req.x(), req.y(),
                req.title(), req.description());
        return MarkerResponse.from(m);
    }

    @DeleteMapping("/markers/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        markers.delete(id);
    }

    /** Bulk import — used when seeding a new map from an extracted dataset. */
    @PostMapping("/maps/{mapId}/markers:bulk")
    public BulkImportResponse bulk(@PathVariable long mapId,
                                   @Valid @RequestBody BulkImportRequest req) {
        var rows = req.markers().stream()
                .map(r -> new MarkerInsert(
                        mapId, r.categoryId(), r.x(), r.y(), r.title(), r.description()))
                .toList();
        int n = markers.bulkImport(mapId, rows);
        return new BulkImportResponse(n);
    }
}