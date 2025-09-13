package com.ritchermap.util;

import java.math.BigDecimal;

public class GeoUtils {

    private static final double EARTH_RADIUS_KM = 6371.0;

    public static double calculateDistance(BigDecimal lat1, BigDecimal lng1, BigDecimal lat2, BigDecimal lng2) {
        double lat1Rad = Math.toRadians(lat1.doubleValue());
        double lng1Rad = Math.toRadians(lng1.doubleValue());
        double lat2Rad = Math.toRadians(lat2.doubleValue());
        double lng2Rad = Math.toRadians(lng2.doubleValue());

        double deltaLat = lat2Rad - lat1Rad;
        double deltaLng = lng2Rad - lng1Rad;

        double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_KM * c;
    }

    public static boolean isValidLatitude(BigDecimal latitude) {
        return latitude.compareTo(BigDecimal.valueOf(-90)) >= 0 &&
                latitude.compareTo(BigDecimal.valueOf(90)) <= 0;
    }

    public static boolean isValidLongitude(BigDecimal longitude) {
        return longitude.compareTo(BigDecimal.valueOf(-180)) >= 0 &&
                longitude.compareTo(BigDecimal.valueOf(180)) <= 0;
    }
}