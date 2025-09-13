package com.ritchermap.dto.response;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Data
public class MarkerHistoryResponse {

    private UUID id;
    private String action;
    private UUID changedBy;
    private Map<String, Object> changes;
    private Map<String, Object> previousValues;
    private OffsetDateTime createdAt;
}