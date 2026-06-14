package com.ritchermap.catalog.domain;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Per-game branding for the MapGenie-style themed viewer.
 *
 * <p>The {@code slug} matches {@link GameMap#getGameSlug()} and is immutable
 * once created; the branding fields (colors, fonts, logo) are all optional and
 * editable. Games have no downstream consumers, so there are no catalog/tiling
 * events on mutation — unlike {@link GameMap}.
 */
@Entity
@Table(
        name = "games",
        uniqueConstraints = @UniqueConstraint(name = "uq_games_slug", columnNames = "slug")
)
public class Game {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String title;

    @Column(name = "primary_color")
    private String primaryColor;

    @Column(name = "accent_color")
    private String accentColor;

    @Column(name = "font_family")
    private String fontFamily;

    @Column(name = "font_url")
    private String fontUrl;

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(name = "thumbnail_url")
    private String thumbnailUrl;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private Instant updatedAt;

    protected Game() {}

    public Game(String slug, String title) {
        this.slug = slug;
        this.title = title;
    }

    /**
     * Editor edit: apply the title and the six branding fields. The slug is
     * immutable and deliberately not updatable here.
     */
    public void update(String title, String primaryColor, String accentColor,
                       String fontFamily, String fontUrl, String logoUrl, String thumbnailUrl) {
        this.title = title;
        this.primaryColor = primaryColor;
        this.accentColor = accentColor;
        this.fontFamily = fontFamily;
        this.fontUrl = fontUrl;
        this.logoUrl = logoUrl;
        this.thumbnailUrl = thumbnailUrl;
    }

    // Getters (no setters; slug immutable, branding mutated via update())
    public Long getId() { return id; }
    public String getSlug() { return slug; }
    public String getTitle() { return title; }
    public String getPrimaryColor() { return primaryColor; }
    public String getAccentColor() { return accentColor; }
    public String getFontFamily() { return fontFamily; }
    public String getFontUrl() { return fontUrl; }
    public String getLogoUrl() { return logoUrl; }
    public String getThumbnailUrl() { return thumbnailUrl; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
