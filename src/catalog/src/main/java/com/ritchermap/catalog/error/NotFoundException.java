package com.ritchermap.catalog.error;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) { super(message); }
    public static NotFoundException of(String what, Object id) {
        return new NotFoundException(what + " not found: " + id);
    }
}
