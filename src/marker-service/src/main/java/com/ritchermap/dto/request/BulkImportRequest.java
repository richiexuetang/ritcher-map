package com.ritchermap.dto.request;

import com.ritchermap.enums.BulkOperationType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class BulkImportRequest {

    @NotNull
    private UUID gameId;

    @NotNull
    private BulkOperationType operationType;

    private List<CreateMarkerRequest> markers;

    private Map<String, Object> options;

    private boolean validateOnly;

    private boolean skipDuplicates;

    private double duplicateToleranceMeters = 10.0;
}