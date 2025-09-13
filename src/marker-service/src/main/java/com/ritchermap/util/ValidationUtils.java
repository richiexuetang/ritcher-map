package com.ritchermap.util;

import java.util.regex.Pattern;

public class ValidationUtils {

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "^[A-Za-z0-9+_.-]+@(.+)$"
    );

    private static final Pattern URL_PATTERN = Pattern.compile(
            "^(https?|ftp|file)://[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]"
    );

    private static final Pattern SLUG_PATTERN = Pattern.compile(
            "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    );

    public static boolean isValidEmail(String email) {
        return email != null && EMAIL_PATTERN.matcher(email).matches();
    }

    public static boolean isValidUrl(String url) {
        return url != null && URL_PATTERN.matcher(url).matches();
    }

    public static boolean isValidSlug(String slug) {
        return slug != null && SLUG_PATTERN.matcher(slug).matches();
    }

    public static String generateSlug(String input) {
        if (input == null) {
            return null;
        }

        return input.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .trim();
    }
}