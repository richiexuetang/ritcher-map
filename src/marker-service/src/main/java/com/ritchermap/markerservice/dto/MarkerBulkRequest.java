package com.ritchermap.markerservice.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class MarkerBulkRequest {

    @NotEmpty(message = "Markers list cannot be empty")
    @Size(max = 1000, message = "Cannot process more than 1000 markers at once")
    @Valid
    private List<CreateMarkerRequest> markers;

    private boolean skipValidation = false;
    private boolean continueOnError = true;
}