package com.ritchermap.exception;

public class BulkOperationException extends RuntimeException {

    public BulkOperationException(String message) {
        super(message);
    }

    public BulkOperationException(String message, Throwable cause) {
        super(message, cause);
    }
}