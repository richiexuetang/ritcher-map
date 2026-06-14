package com.ritchermap.catalog.api;

import com.ritchermap.catalog.service.GameService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/games")
public class GameController {

    private final GameService games;

    public GameController(GameService games) { this.games = games; }

    @GetMapping
    public List<Dtos.GameResponse> list() {
        return games.list().stream().map(Dtos.GameResponse::from).toList();
    }

    @GetMapping("/{slug}")
    public Dtos.GameResponse get(@PathVariable String slug) {
        return Dtos.GameResponse.from(games.getBySlug(slug));
    }

    @PostMapping
    public ResponseEntity<Dtos.GameResponse> create(@Valid @RequestBody Dtos.CreateGameRequest req) {
        var saved = games.create(
                req.slug(), req.title(), req.primaryColor(), req.accentColor(),
                req.fontFamily(), req.fontUrl(), req.logoUrl(), req.thumbnailUrl());
        return ResponseEntity
                .created(URI.create("/api/v1/games/" + saved.getSlug()))
                .body(Dtos.GameResponse.from(saved));
    }

    @PutMapping("/{slug}")
    public Dtos.GameResponse update(@PathVariable String slug, @Valid @RequestBody Dtos.UpdateGameRequest req) {
        return Dtos.GameResponse.from(games.update(
                slug, req.title(), req.primaryColor(), req.accentColor(),
                req.fontFamily(), req.fontUrl(), req.logoUrl(), req.thumbnailUrl()));
    }

    @DeleteMapping("/{slug}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String slug) {
        games.delete(slug);
    }
}
