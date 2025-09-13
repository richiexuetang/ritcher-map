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
@Table(name = "marker_tags")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MarkerTag extends AuditableEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String slug;

    @Column(name = "tag_type", length = 50)
    private String tagType;

    @Column(length = 7)
    private String color;

    @Column(columnDefinition = "TEXT")
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    @ManyToMany(mappedBy = "tags", fetch = FetchType.LAZY)
    private Set<Marker> markers = new HashSet<>();
}
