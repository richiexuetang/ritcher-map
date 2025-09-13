package com.ritchermap.dto.response;

import lombok.Data;

import java.util.Map;
import java.util.UUID;

@Data
public class MarkerCategoryResponse {

    private UUID id;
    private String name;
    private String slug;
    private String icon;
    private String color;
    private String description;
    private boolean isCollectible;
    private Map<String, Object> metadata;
}
