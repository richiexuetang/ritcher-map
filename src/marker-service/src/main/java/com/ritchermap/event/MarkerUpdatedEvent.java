package com.ritchermap.event;

import com.ritchermap.enums.MarkerStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class MarkerUpdatedEvent {
    private UUID markerId;
    private UUID gameId;
    private String title;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private MarkerStatus status;
    private OffsetDateTime updatedAt;
}
