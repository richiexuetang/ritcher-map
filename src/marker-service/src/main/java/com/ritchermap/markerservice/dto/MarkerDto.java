package com.ritchermap.markerservice.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MarkerDto {
    private UUID id;
    private UUID gameId;
    private String gameSlug;
    private UUID categoryId;
    private String categoryName;
    private PositionDto position;
    private String title;
    private String description;
    private Map<String, Object> metadata;
    private Integer visibilityLevel;
    private UUID createdBy;
    private UUID updatedBy;
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PositionDto {
        private double latitude;
        private double longitude;
    }
}