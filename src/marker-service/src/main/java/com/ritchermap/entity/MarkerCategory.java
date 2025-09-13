package com.ritchermap.entity;

import com.ritchermap.entity.audit.AuditableEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.*;

@Entity
@Table(name = "marker_categories")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MarkerCategory extends AuditableEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private UUID id;

    @Column(name = "game_id", nullable = false)
    private UUID gameId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 100)
    private String slug;

    @Column(length = 100)
    private String icon;

    @Column(length = 7)
    private String color;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private MarkerCategory parent;

    @OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<MarkerCategory> subcategories = new ArrayList<>();

    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "is_collectible")
    @Builder.Default
    private Boolean isCollectible = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    @OneToMany(mappedBy = "category", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Marker> markers = new ArrayList<>();

    // Helper methods
    public boolean isRootCategory() {
        return parent == null;
    }

    public int getDepth() {
        int depth = 0;
        MarkerCategory current = this.parent;
        while (current != null) {
            depth++;
            current = current.getParent();
        }
        return depth;
    }

    public List<MarkerCategory> getAncestors() {
        List<MarkerCategory> ancestors = new ArrayList<>();
        MarkerCategory current = this.parent;
        while (current != null) {
            ancestors.add(0, current);
            current = current.getParent();
        }
        return ancestors;
    }

    public String getFullPath() {
        List<MarkerCategory> ancestors = getAncestors();
        ancestors.add(this);
        return ancestors.stream()
                .map(MarkerCategory::getName)
                .reduce((a, b) -> a + " > " + b)
                .orElse(this.name);
    }
}
