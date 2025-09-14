package com.ritchermap.markerservice.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CategoryDto {
    private UUID id;
    private UUID gameId;
    private String name;
    private String description;
    private String iconUrl;
    private String displayColor;
    private Integer sortOrder;
    private Boolean isActive;
    private Long markerCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}