package com.ritchermap.dto.response;

import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Data
public class MarkerResponse {

    private UUID id;
    private UUID gameId;
    private UUID mapId;
    private MarkerCategoryResponse category;
    private String title;
    private String description;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private MarkerType markerType;
    private MarkerStatus status;
    private Integer difficultyLevel;
    private Map<String, Object> rewardInfo;
    private Map<String, Object> requirements;
    private Map<String, Object> metadata;
    private String iconUrl;
    private Set<String> imageUrls;
    private String externalId;
    private UUID createdBy;
    private boolean verified;
    private UUID verifiedBy;
    private OffsetDateTime verifiedAt;
    private Integer viewCount;
    private Integer likeCount;
    private Set<MarkerTagResponse> tags;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}