package com.ritchermap.event;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class MarkerDeletedEvent {
    private UUID markerId;
    private UUID gameId;
    private String title;
    private OffsetDateTime deletedAt;
}
