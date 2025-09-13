package com.ritchermap.exception;

public class MarkerNotFoundException extends RuntimeException {
    public MarkerNotFoundException(String message) {
        super(message);
    }

    public MarkerNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
