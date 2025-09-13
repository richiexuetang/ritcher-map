package com.ritchermap.dto.response;

import lombok.Data;

import java.util.UUID;

@Data
public class MarkerTagResponse {

    private UUID id;
    private String name;
    private String slug;
    private String tagType;
    private String color;
}