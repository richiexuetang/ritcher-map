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
    public Dtos.MapResponse rename(@PathVariable long id, @Valid @RequestBody Dtos.RenameMapRequest req) {
        return Dtos.MapResponse.from(maps.rename(id, req.name()));
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
}
