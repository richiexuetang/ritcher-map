package com.ritchermap.dto.request;

import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

@Data
public class MarkerFilterRequest {

    private UUID gameId;
    private UUID mapId;
    private Set<UUID> categoryIds;
    private Set<UUID> tagIds;
    private Set<MarkerType> markerTypes;
    private MarkerStatus status;
    private Boolean verified;
    private Integer minDifficulty;
    private Integer maxDifficulty;
    private String searchTerm;

    // Bounding box
    private BigDecimal minLatitude;
    private BigDecimal maxLatitude;
    private BigDecimal minLongitude;
    private BigDecimal maxLongitude;

    // Date range
    private OffsetDateTime createdAfter;
    private OffsetDateTime createdBefore;

    // Nearby search
    private BigDecimal centerLatitude;
    private BigDecimal centerLongitude;
    private Double radiusKm;
}
