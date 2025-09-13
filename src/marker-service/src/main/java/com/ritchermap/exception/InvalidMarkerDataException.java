package com.ritchermap.exception;

public class InvalidMarkerDataException extends RuntimeException {

    public InvalidMarkerDataException(String message) {
        super(message);
    }

    public InvalidMarkerDataException(String message, Throwable cause) {
        super(message, cause);
    }
}
