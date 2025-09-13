package com.ritchermap.dto.response;

import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.enums.MarkerType;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
public class MarkerSummaryResponse {

    private UUID id;
    private UUID gameId;
    private String title;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private MarkerType markerType;
    private MarkerStatus status;
    private String iconUrl;
    private boolean verified;
    private Integer viewCount;
    private OffsetDateTime createdAt;
}