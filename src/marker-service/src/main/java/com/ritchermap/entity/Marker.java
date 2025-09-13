package com.ritchermap.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.ritchermap.entity.audit.AuditableEntity;
import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;

@Entity
@Table(name = "markers")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Marker extends AuditableEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private UUID id;

    @Column(name = "game_id",  nullable = false)
    private UUID gameId;

    @Column(name = "map_id")
    private UUID mapId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private MarkerCategory category;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "geometry(Point,4326)")
    @JsonIgnore
    private Point coordinates;

    @Column(nullable = false, precision = 10, scale = 8)
    private BigDecimal latitude;

    @Column(nullable = false, precision = 11, scale = 8)
    private BigDecimal longitude;

    @Enumerated(EnumType.STRING)
    @Column(name = "marker_type")
    @Builder.Default
    private MarkerType markerType = MarkerType.POI;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private MarkerStatus status = MarkerStatus.ACTIVE;

    @Column(name = "difficulty_level")
    private Integer difficultyLevel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reward_info", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> rewardInfo = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> requirements = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    @Column(name = "icon_url", length = 500)
    private String iconUrl;

    @Column(name = "image_urls")
    @ElementCollection
    @CollectionTable(name = "marker_images", joinColumns = @JoinColumn(name = "marker_id"))
    private Set<String> imageUrls = new HashSet<>();

    @Column(name = "external_id", length = 100)
    private String externalId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Builder.Default
    private Boolean verified = false;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    @Column(name = "view_count")
    @Builder.Default
    private Integer viewCount = 0;

    @Column(name = "like_count")
    @Builder.Default
    private Integer likeCount = 0;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "marker_marker_tags",
            joinColumns = @JoinColumn(name = "marker_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    private Set<MarkerTag> tags = new HashSet<>();

    @OneToMany(mappedBy = "marker", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<MarkerHistory> history = new ArrayList<>();

    @OneToMany(mappedBy = "marker", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<MarkerComment> comments = new ArrayList<>();

    // Helper methods
    public void addTag(MarkerTag tag) {
        tags.add(tag);
    }

    public void removeTag(MarkerTag tag) {
        tags.remove(tag);
    }

    public void incrementViewCount() {
        this.viewCount = (this.viewCount == null ? 0 : this.viewCount) + 1;
    }

    public void incrementLikeCount() {
        this.likeCount = (this.likeCount == null ? 0 : this.likeCount) + 1;
    }

    public void decrementLikeCount() {
        this.likeCount = Math.max(0, (this.likeCount == null ? 0 : this.likeCount) - 1);
    }

    public boolean isWithinBounds(BigDecimal minLat, BigDecimal maxLat, BigDecimal minLng, BigDecimal maxLng) {
        return latitude.compareTo(minLat) >= 0 && latitude.compareTo(maxLat) <= 0 &&
                longitude.compareTo(minLng) >= 0 && longitude.compareTo(maxLng) <= 0;
    }
}
