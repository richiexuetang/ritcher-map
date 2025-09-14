package com.ritchermap.markerservice.dto;


import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

@Data
public class CreateMarkerRequest {

    @NotNull(message = "Game ID is required")
    private UUID gameId;

    private UUID categoryId;

    @NotNull(message = "Position is required")
    @Valid
    private PositionDto position;

    @NotBlank(message = "Title is required")
    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    @Size(max = 2000, message = "Description must not exceed 2000 characters")
    private String description;

    private Map<String, Object> metadata;

    @Min(value = 0, message = "Visibility level must be 0 or greater")
    @Max(value = 10, message = "Visibility level must be 10 or less")
    private Integer visibilityLevel = 1;

    @Data
    public static class PositionDto {
        @NotNull(message = "Latitude is required")
        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
        private double latitude;

        @NotNull(message = "Longitude is required")
        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
        private double longitude;
    }
}
