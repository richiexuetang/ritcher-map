package com.ritchermap.catalog.domain;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;

import java.time.Instant;

@Entity
@Table(name = "markers")
public class Marker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "map_id", nullable = false)
    private Long mapId;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false, columnDefinition = "geometry(Point,0)")
    private Point geom;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private Instant updatedAt;

    protected Marker() {}

    public Marker(Long mapId, Long categoryId, Point geom, String title, String description) {
        this.mapId = mapId;
        this.categoryId = categoryId;
        this.geom = geom;
        this.title = title;
        this.description = description;
    }

    public Long getId() { return id; }
    public Long getMapId() { return mapId; }
    public Long getCategoryId() { return categoryId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public Point getGeom() { return geom; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void update(Long categoryId, Point geom, String title, String description) {
        this.categoryId = categoryId;
        this.geom = geom;
        this.title = title;
        this.description = description;
    }
}
