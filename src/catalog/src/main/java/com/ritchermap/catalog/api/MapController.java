package com.ritchermap.catalog.api;

import com.ritchermap.catalog.service.MapService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/maps")
public class MapController {

    private final MapService maps;

    public MapController(MapService maps) { this.maps = maps; }

    @GetMapping
    public List<Dtos.MapResponse> list() {
        return maps.list().stream().map(Dtos.MapResponse::from).toList();
    }

    @GetMapping("/{id}")
    public Dtos.MapResponse get(@PathVariable long id) {
        return Dtos.MapResponse.from(maps.get(id));
    }

    @PostMapping
    public ResponseEntity<Dtos.MapResponse> create(@Valid @RequestBody Dtos.CreateMapRequest req) {
        var saved = maps.create(req.gameSlug(), req.mapSlug(), req.name());
        return ResponseEntity
                .created(URI.create("/api/v1/maps/" + saved.getId()))
                .body(Dtos.MapResponse.from(saved));
    }

    @PatchMapping("/{id}")
    public Dtos.MapResponse update(@PathVariable long id, @Valid @RequestBody Dtos.UpdateMapRequest req) {
        return Dtos.MapResponse.from(maps.update(id, req.name(), req.minZoom()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        maps.delete(id);
    }

    /**
     * Editor signals the source image is uploaded and ready to tile. Catalog
     * emits {@code map.tiling.requested}; the Python worker picks it up.
     */
    @PostMapping("/{id}/tiling")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Dtos.MapResponse requestTiling(@PathVariable long id,
                                          @Valid @RequestBody Dtos.RequestTilingRequest req) {
        return Dtos.MapResponse.from(
                maps.requestTiling(id, req.sourceBucket(), req.sourceKey(), req.format())
        );
    }

    /**
     * Editor imported a pre-built {@code {z}/{x}/{y}} tile pyramid straight to
     * tile storage (no source image, no worker run). Mark the map READY with
     * the supplied dimensions.
     */
    @PostMapping("/{id}/imported")
    public Dtos.MapResponse markImported(@PathVariable long id,
                                         @Valid @RequestBody Dtos.MarkImportedRequest req) {
        return Dtos.MapResponse.from(
                maps.markImported(
                        id, req.width(), req.height(), req.maxZoom(),
                        req.minZoom() != null ? req.minZoom() : 0,
                        req.tileSize() != null ? req.tileSize() : 256,
                        req.format() != null ? req.format() : "webp")
        );
    }
}
