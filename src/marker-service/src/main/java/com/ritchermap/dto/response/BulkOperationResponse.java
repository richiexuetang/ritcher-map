package com.ritchermap.dto.response;

import com.ritchermap.enums.BulkOperationType;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
public class BulkOperationResponse {

    private UUID operationId;
    private BulkOperationType operationType;
    private String status;
    private int totalRecords;
    private int processedRecords;
    private int successfulRecords;
    private int failedRecords;
    private List<String> errors;
    private Map<String, Object> metadata;
    private OffsetDateTime startedAt;
    private OffsetDateTime completedAt;
}