package com.ritchermap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ritchermap.dto.request.BulkImportRequest;
import com.ritchermap.dto.request.CreateMarkerRequest;
import com.ritchermap.dto.response.BulkOperationResponse;
import com.ritchermap.entity.Marker;
import com.ritchermap.enums.BulkOperationType;
import com.ritchermap.enums.MarkerStatus;
import com.ritchermap.exception.BulkOperationException;
import com.ritchermap.repository.MarkerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.CSVRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class BulkOperationService {

    private final MarkerService markerService;
    private final MarkerRepository markerRepository;
    private final EventPublisherService eventPublisher;
    private final ObjectMapper objectMapper;

    @Value("${app.marker.max-bulk-size:1000}")
    private int maxBulkSize;

    @Value("${app.marker.allowed-file-types:csv,json}")
    private String allowedFileTypes;

    // In-memory storage for operation status (in production, use Redis or database)
    private final Map<UUID, BulkOperationResponse> operationStatus = new ConcurrentHashMap<>();

//    public BulkOperationResponse importMarkers(BulkImportRequest request, UUID operatedBy) {
//        log.info("Starting bulk import operation for game: {}", request.getGameId());
//
//        validateBulkRequest(request);
//
//        UUID operationId = UUID.randomUUID();
//        BulkOperationResponse response = createInitialResponse(operationId, request.getOperationType());
//        operationStatus.put(operationId, response);
//
//        if (request.isValidateOnly()) {
//            return validateMarkersOnly(operationId, request);
//        }
//
//        // Process asynchronously
//        processBulkImportAsync(operationId, request, operatedBy);
//
//        return response;
//    }
//
//    public BulkOperationResponse importMarkersFromFile(UUID gameId, MultipartFile file,
//                                                       boolean validateOnly, UUID operatedBy) {
//        log.info("Starting file import operation for game: {}", gameId);
//
//        validateFile(file);
//
//        UUID operationId = UUID.randomUUID();
//        BulkOperationResponse response = createInitialResponse(operationId, BulkOperationType.IMPORT_CREATE);
//        operationStatus.put(operationId, response);
//
//        // Process file asynchronously
//        processFileImportAsync(operationId, gameId, file, validateOnly, operatedBy);
//
//        return response;
//    }
//
//    public BulkOperationResponse exportMarkers(UUID gameId, String format, UUID operatedBy) {
//        log.info("Starting export operation for game: {} in format: {}", gameId, format);
//
//        UUID operationId = UUID.randomUUID();
//        BulkOperationResponse response = createInitialResponse(operationId, BulkOperationType.EXPORT);
//        operationStatus.put(operationId, response);
//
//        // Process export asynchronously
//        processExportAsync(operationId, gameId, format, operatedBy);
//
//        return response;
//    }

    public BulkOperationResponse getOperationStatus(UUID operationId) {
        BulkOperationResponse response = operationStatus.get(operationId);
        if (response == null) {
            throw new BulkOperationException("Operation not found: " + operationId);
        }
        return response;
    }

//    @Async
//    @Transactional
//    public CompletableFuture<Void> processBulkImportAsync(UUID operationId, BulkImportRequest request, UUID operatedBy) {
//        return CompletableFuture.runAsync(() -> {
//            try {
//                updateOperationStatus(operationId, "PROCESSING", 0, 0, 0);
//
//                List<CreateMarkerRequest> markers = request.getMarkers();
//                int totalRecords = markers.size();
//                int successfulRecords = 0;
//                int failedRecords = 0;
//                List<String> errors = new ArrayList<>();
//
//                for (int i = 0; i < markers.size(); i++) {
//                    try {
//                        CreateMarkerRequest markerRequest = markers.get(i);
//                        markerRequest.setGameId(request.getGameId());
//
//                        if (request.isSkipDuplicates() && isDuplicate(markerRequest, request.getDuplicateToleranceMeters())) {
//                            log.debug("Skipping duplicate marker at position {}", i);
//                            continue;
//                        }
//
//                        markerService.createMarker(markerRequest, operatedBy);
//                        successfulRecords++;
//
//                        // Update progress every 10 records
//                        if (i % 10 == 0) {
//                            updateOperationStatus(operationId, "PROCESSING", totalRecords, successfulRecords, failedRecords);
//                        }
//
//                    } catch (Exception e) {
//                        failedRecords++;
//                        errors.add(String.format("Row %d: %s", i + 1, e.getMessage()));
//                        log.warn("Failed to import marker at position {}: {}", i, e.getMessage());
//                    }
//                }
//
//                completeOperation(operationId, totalRecords, successfulRecords, failedRecords, errors);
//
//            } catch (Exception e) {
//                failOperation(operationId, e.getMessage());
//                log.error("Bulk import operation failed", e);
//            }
//        });
//    }

//    @Async
//    public CompletableFuture<Void> processFileImportAsync(UUID operationId, UUID gameId, MultipartFile file,
//                                                          boolean validateOnly, UUID operatedBy) {
//        return CompletableFuture.runAsync(() -> {
//            try {
//                updateOperationStatus(operationId, "PROCESSING", 0, 0, 0);
//
//                String filename = file.getOriginalFilename();
//                String fileExtension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
//
//                List<CreateMarkerRequest> markers;
//                if ("csv".equals(fileExtension)) {
//                    markers = parseCSVFile(file, gameId);
//                } else if ("json".equals(fileExtension)) {
//                    markers = parseJSONFile(file, gameId);
//                } else {
//                    throw new BulkOperationException("Unsupported file format: " + fileExtension);
//                }
//
//                if (validateOnly) {
//                    validateMarkers(operationId, markers);
//                } else {
//                    importMarkers(operationId, markers, operatedBy);
//                }
//
//            } catch (Exception e) {
//                failOperation(operationId, e.getMessage());
//                log.error("File import operation failed", e);
//            }
//        });
//    }

    @Async
    public CompletableFuture<Void> processExportAsync(UUID operationId, UUID gameId, String format, UUID operatedBy) {
        return CompletableFuture.runAsync(() -> {
            try {
                updateOperationStatus(operationId, "PROCESSING", 0, 0, 0);

                List<Marker> markers = markerRepository.findByGameIdAndStatus(gameId, MarkerStatus.ACTIVE, null).getContent();

                String exportData;
                if ("csv".equals(format.toLowerCase())) {
                    exportData = exportToCSV(markers);
                } else if ("json".equals(format.toLowerCase())) {
                    exportData = exportToJSON(markers);
                } else {
                    throw new BulkOperationException("Unsupported export format: " + format);
                }

                // In production, save to file storage (S3, etc.) and return download URL
                Map<String, Object> metadata = new HashMap<>();
                metadata.put("exportData", exportData);
                metadata.put("recordCount", markers.size());
                metadata.put("format", format);

                BulkOperationResponse response = operationStatus.get(operationId);
                response.setStatus("COMPLETED");
                response.setTotalRecords(markers.size());
                response.setSuccessfulRecords(markers.size());
                response.setCompletedAt(OffsetDateTime.now());
                response.setMetadata(metadata);

                log.info("Export operation completed: {}", operationId);

            } catch (Exception e) {
                failOperation(operationId, e.getMessage());
                log.error("Export operation failed", e);
            }
        });
    }

    private void validateBulkRequest(BulkImportRequest request) {
        if (request.getMarkers() == null || request.getMarkers().isEmpty()) {
            throw new BulkOperationException("No markers provided for import");
        }

        if (request.getMarkers().size() > maxBulkSize) {
            throw new BulkOperationException("Bulk size exceeds maximum allowed: " + maxBulkSize);
        }
    }

    private void validateFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new BulkOperationException("File is empty");
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw new BulkOperationException("Invalid filename");
        }

        String fileExtension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (!Arrays.asList(allowedFileTypes.split(",")).contains(fileExtension)) {
            throw new BulkOperationException("Unsupported file type: " + fileExtension);
        }
    }

    private List<CreateMarkerRequest> parseCSVFile(MultipartFile file, UUID gameId) throws IOException {
        List<CreateMarkerRequest> markers = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream()));
             CSVParser csvParser = new CSVParser(reader, CSVFormat.DEFAULT.withFirstRecordAsHeader())) {

            for (CSVRecord csvRecord : csvParser) {
                CreateMarkerRequest marker = new CreateMarkerRequest();
                marker.setGameId(gameId);
                marker.setTitle(csvRecord.get("title"));
                marker.setDescription(csvRecord.get("description"));
                marker.setLatitude(new BigDecimal(csvRecord.get("latitude")));
                marker.setLongitude(new BigDecimal(csvRecord.get("longitude")));

                if (csvRecord.isMapped("marker_type")) {
                    marker.setMarkerType(com.ritchermap.enums.MarkerType.valueOf(csvRecord.get("marker_type")));
                }

                if (csvRecord.isMapped("difficulty_level")) {
                    marker.setDifficultyLevel(Integer.parseInt(csvRecord.get("difficulty_level")));
                }

                if (csvRecord.isMapped("icon_url")) {
                    marker.setIconUrl(csvRecord.get("icon_url"));
                }

                markers.add(marker);
            }
        }

        return markers;
    }

    private List<CreateMarkerRequest> parseJSONFile(MultipartFile file, UUID gameId) throws IOException {
        CreateMarkerRequest[] markersArray = objectMapper.readValue(file.getInputStream(), CreateMarkerRequest[].class);
        List<CreateMarkerRequest> markers = Arrays.asList(markersArray);

        // Set game ID for all markers
        markers.forEach(marker -> marker.setGameId(gameId));

        return markers;
    }

    private String exportToCSV(List<Marker> markers) throws IOException {
        StringWriter stringWriter = new StringWriter();

        try (CSVPrinter csvPrinter = new CSVPrinter(stringWriter, CSVFormat.DEFAULT.withHeader(
                "id", "title", "description", "latitude", "longitude", "marker_type",
                "difficulty_level", "verified", "created_at"))) {

            for (Marker marker : markers) {
                csvPrinter.printRecord(
                        marker.getId(),
                        marker.getTitle(),
                        marker.getDescription(),
                        marker.getLatitude(),
                        marker.getLongitude(),
                        marker.getMarkerType(),
                        marker.getDifficultyLevel(),
                        marker.getVerified()
                );
            }
        }

        return stringWriter.toString();
    }

    private String exportToJSON(List<Marker> markers) throws IOException {
        return objectMapper.writeValueAsString(markers);
    }

    private boolean isDuplicate(CreateMarkerRequest request, double toleranceMeters) {
        List<Marker> nearby = markerRepository.findNearbyMarkers(
                request.getGameId(),
                request.getLatitude().doubleValue(),
                request.getLongitude().doubleValue(),
                toleranceMeters / 1000.0,
                1
        );

        return !nearby.isEmpty();
    }

    private void validateMarkers(UUID operationId, List<CreateMarkerRequest> markers) {
        int totalRecords = markers.size();
        int validRecords = 0;
        int invalidRecords = 0;
        List<String> errors = new ArrayList<>();

        for (int i = 0; i < markers.size(); i++) {
            try {
                // Perform validation logic here
                CreateMarkerRequest marker = markers.get(i);
                if (marker.getTitle() == null || marker.getTitle().trim().isEmpty()) {
                    throw new IllegalArgumentException("Title is required");
                }
                if (marker.getLatitude() == null || marker.getLongitude() == null) {
                    throw new IllegalArgumentException("Coordinates are required");
                }

                validRecords++;
            } catch (Exception e) {
                invalidRecords++;
                errors.add(String.format("Row %d: %s", i + 1, e.getMessage()));
            }
        }

        completeOperation(operationId, totalRecords, validRecords, invalidRecords, errors);
    }

//    private void importMarkers(UUID operationId, List<CreateMarkerRequest> markers, UUID operatedBy) {
//        int totalRecords = markers.size();
//        int successfulRecords = 0;
//        int failedRecords = 0;
//        List<String> errors = new ArrayList<>();
//
//        for (int i = 0; i < markers.size(); i++) {
//            try {
//                markerService.createMarker(markers.get(i), operatedBy);
//                successfulRecords++;
//            } catch (Exception e) {
//                failedRecords++;
//                errors.add(String.format("Row %d: %s", i + 1, e.getMessage()));
//            }
//        }
//
//        completeOperation(operationId, totalRecords, successfulRecords, failedRecords, errors);
//    }

    private BulkOperationResponse validateMarkersOnly(UUID operationId, BulkImportRequest request) {
        try {
            validateMarkers(operationId, request.getMarkers());
            return operationStatus.get(operationId);
        } catch (Exception e) {
            failOperation(operationId, e.getMessage());
            return operationStatus.get(operationId);
        }
    }

//    private BulkOperationResponse createInitialResponse(UUID operationId, BulkOperationType operationType) {
//        return BulkOperationResponse.builder()
//                .operationId(operationId)
//                .operationType(operationType)
//                .status("STARTED")
//                .totalRecords(0)
//                .processedRecords(0)
//                .successfulRecords(0)
//                .failedRecords(0)
//                .errors(new ArrayList<>())
//                .metadata(new HashMap<>())
//                .startedAt(OffsetDateTime.now())
//                .build();
//    }

    private void updateOperationStatus(UUID operationId, String status, int totalRecords,
                                       int successfulRecords, int failedRecords) {
        BulkOperationResponse response = operationStatus.get(operationId);
        if (response != null) {
            response.setStatus(status);
            response.setTotalRecords(totalRecords);
            response.setProcessedRecords(successfulRecords + failedRecords);
            response.setSuccessfulRecords(successfulRecords);
            response.setFailedRecords(failedRecords);
        }
    }

    private void completeOperation(UUID operationId, int totalRecords, int successfulRecords,
                                   int failedRecords, List<String> errors) {
        BulkOperationResponse response = operationStatus.get(operationId);
        if (response != null) {
            response.setStatus("COMPLETED");
            response.setTotalRecords(totalRecords);
            response.setProcessedRecords(successfulRecords + failedRecords);
            response.setSuccessfulRecords(successfulRecords);
            response.setFailedRecords(failedRecords);
            response.setErrors(errors);
            response.setCompletedAt(OffsetDateTime.now());
        }

        // Publish completion event
//        eventPublisher.publishBulkOperationCompleted(response);

        log.info("Bulk operation completed: {} - Success: {}, Failed: {}",
                operationId, successfulRecords, failedRecords);
    }

    private void failOperation(UUID operationId, String errorMessage) {
        BulkOperationResponse response = operationStatus.get(operationId);
        if (response != null) {
            response.setStatus("FAILED");
            response.setErrors(Arrays.asList(errorMessage));
            response.setCompletedAt(OffsetDateTime.now());
        }
    }
}