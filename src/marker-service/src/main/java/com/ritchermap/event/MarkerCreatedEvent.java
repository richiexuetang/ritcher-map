package com.ritchermap.event;

import com.ritchermap.enums.MarkerType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class MarkerCreatedEvent {
    private UUID markerId;
    private UUID gameId;
    private UUID mapId;
    private String title;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private MarkerType markerType;
    private UUID createdBy;
    private OffsetDateTime createdAt;
}
