package com.ritchermap.catalog.service;

import com.ritchermap.catalog.domain.Game;
import com.ritchermap.catalog.error.ConflictException;
import com.ritchermap.catalog.error.NotFoundException;
import com.ritchermap.catalog.repo.GameRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * CRUD for per-game branding. Mirrors {@link MapService} but publishes no
 * events: games have no downstream consumers (no Kafka, no realtime sync).
 */
@Service
public class GameService {

    private static final Logger log = LoggerFactory.getLogger(GameService.class);

    private final GameRepository games;

    public GameService(GameRepository games) {
        this.games = games;
    }

    @Transactional(readOnly = true)
    public List<Game> list() {
        return games.findAll();
    }

    @Transactional(readOnly = true)
    public Game getBySlug(String slug) {
        return games.findBySlug(slug).orElseThrow(() -> NotFoundException.of("game", slug));
    }

    @Transactional
    public Game create(String slug, String title, String primaryColor, String accentColor,
                       String fontFamily, String fontUrl, String logoUrl, String thumbnailUrl) {
        if (games.existsBySlug(slug)) {
            throw new ConflictException("game already exists: " + slug);
        }
        Game game = new Game(slug, title);
        game.update(title, primaryColor, accentColor, fontFamily, fontUrl, logoUrl, thumbnailUrl);
        Game saved = games.save(game);
        log.info("created game id={} slug={}", saved.getId(), saved.getSlug());
        return saved;
    }

    @Transactional
    public Game update(String slug, String title, String primaryColor, String accentColor,
                       String fontFamily, String fontUrl, String logoUrl, String thumbnailUrl) {
        Game game = getBySlug(slug);
        game.update(title, primaryColor, accentColor, fontFamily, fontUrl, logoUrl, thumbnailUrl);
        return game;
    }

    @Transactional
    public void delete(String slug) {
        Game game = getBySlug(slug);
        games.delete(game);
        log.info("deleted game id={} slug={}", game.getId(), slug);
    }
}
