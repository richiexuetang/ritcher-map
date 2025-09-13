package com.ritchermap.dto.request;

import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import jakarta.validation.constraints.*;
import lombok.Data;
import org.hibernate.validator.constraints.URL;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Data
public class UpdateMarkerRequest {

    private UUID categoryId;

    @Size(max = 200, message = "Title must not exceed 200 characters")
    private String title;

    @Size(max = 5000, message = "Description must not exceed 5000 characters")
    private String description;

    @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
    private BigDecimal latitude;

    @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
    private BigDecimal longitude;

    private MarkerType markerType;

    private MarkerStatus status;

    @Min(value = 1, message = "Difficulty level must be between 1 and 5")
    @Max(value = 5, message = "Difficulty level must be between 1 and 5")
    private Integer difficultyLevel;

    private Map<String, Object> rewardInfo;

    private Map<String, Object> requirements;

    private Map<String, Object> metadata;

    @URL(message = "Icon URL must be valid")
    private String iconUrl;

    private Set<String> imageUrls;

    private Set<UUID> tagIds;
}