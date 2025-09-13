package com.ritchermap.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class CacheService {

    private final CacheManager cacheManager;

    public void invalidateGameMarkers(UUID gameId) {
        log.debug("Invalidating game markers cache for game: {}", gameId);

        // Invalidate relevant cache entries
        var cache = cacheManager.getCache("game-markers");
        if (cache != null) {
            cache.evict(gameId);
        }

        // Could also invalidate other related caches
        invalidateMarkerStats(gameId);
    }

    public void invalidateMarkerStats(UUID gameId) {
        log.debug("Invalidating marker stats cache for game: {}", gameId);

        var cache = cacheManager.getCache("marker-stats");
        if (cache != null) {
            cache.evict(gameId);
        }
    }

    public void invalidateAllMarkerCaches() {
        log.debug("Invalidating all marker caches");

        cacheManager.getCacheNames().forEach(cacheName -> {
            if (cacheName.startsWith("marker") || cacheName.startsWith("game-")) {
                var cache = cacheManager.getCache(cacheName);
                if (cache != null) {
                    cache.clear();
                }
            }
        });
    }
}