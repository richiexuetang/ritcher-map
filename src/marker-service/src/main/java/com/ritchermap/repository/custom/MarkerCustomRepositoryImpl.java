package com.ritchermap.repository.custom;

import com.ritchermap.dto.request.MarkerFilterRequest;
import com.ritchermap.entity.Marker;
import com.ritchermap.enums.MarkerStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import jakarta.persistence.TypedQuery;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.*;

@Repository
@Slf4j
public class MarkerCustomRepositoryImpl implements MarkerCustomRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public Page<Marker> findMarkersWithFilters(MarkerFilterRequest filterRequest, Pageable pageable) {
        StringBuilder jpql = new StringBuilder("SELECT m FROM Marker m ");
        StringBuilder whereClause = new StringBuilder("WHERE 1=1 ");
        Map<String, Object> parameters = new HashMap<>();

        // Add joins if needed
        if (filterRequest.getCategoryIds() != null && !filterRequest.getCategoryIds().isEmpty()) {
            jpql.append("LEFT JOIN m.category c ");
        }

        if (filterRequest.getTagIds() != null && !filterRequest.getTagIds().isEmpty()) {
            jpql.append("LEFT JOIN m.tags t ");
        }

        // Build where clause
        if (filterRequest.getGameId() != null) {
            whereClause.append("AND m.gameId = :gameId ");
            parameters.put("gameId", filterRequest.getGameId());
        }

        if (filterRequest.getMapId() != null) {
            whereClause.append("AND m.mapId = :mapId ");
            parameters.put("mapId", filterRequest.getMapId());
        }

        if (filterRequest.getStatus() != null) {
            whereClause.append("AND m.status = :status ");
            parameters.put("status", filterRequest.getStatus());
        }

        if (filterRequest.getMarkerTypes() != null && !filterRequest.getMarkerTypes().isEmpty()) {
            whereClause.append("AND m.markerType IN :markerTypes ");
            parameters.put("markerTypes", filterRequest.getMarkerTypes());
        }

        if (filterRequest.getCategoryIds() != null && !filterRequest.getCategoryIds().isEmpty()) {
            whereClause.append("AND c.id IN :categoryIds ");
            parameters.put("categoryIds", filterRequest.getCategoryIds());
        }

        if (filterRequest.getTagIds() != null && !filterRequest.getTagIds().isEmpty()) {
            whereClause.append("AND t.id IN :tagIds ");
            parameters.put("tagIds", filterRequest.getTagIds());
        }

        if (filterRequest.getVerified() != null) {
            whereClause.append("AND m.verified = :verified ");
            parameters.put("verified", filterRequest.getVerified());
        }

        if (filterRequest.getMinDifficulty() != null) {
            whereClause.append("AND m.difficultyLevel >= :minDifficulty ");
            parameters.put("minDifficulty", filterRequest.getMinDifficulty());
        }

        if (filterRequest.getMaxDifficulty() != null) {
            whereClause.append("AND m.difficultyLevel <= :maxDifficulty ");
            parameters.put("maxDifficulty", filterRequest.getMaxDifficulty());
        }

        if (StringUtils.hasText(filterRequest.getSearchTerm())) {
            whereClause.append("AND (LOWER(m.title) LIKE LOWER(:searchTerm) OR LOWER(m.description) LIKE LOWER(:searchTerm)) ");
            parameters.put("searchTerm", "%" + filterRequest.getSearchTerm() + "%");
        }

        // Bounding box filter
        if (filterRequest.getMinLatitude() != null && filterRequest.getMaxLatitude() != null &&
                filterRequest.getMinLongitude() != null && filterRequest.getMaxLongitude() != null) {
            whereClause.append("AND m.latitude BETWEEN :minLat AND :maxLat ");
            whereClause.append("AND m.longitude BETWEEN :minLng AND :maxLng ");
            parameters.put("minLat", filterRequest.getMinLatitude());
            parameters.put("maxLat", filterRequest.getMaxLatitude());
            parameters.put("minLng", filterRequest.getMinLongitude());
            parameters.put("maxLng", filterRequest.getMaxLongitude());
        }

        // Date range filter
        if (filterRequest.getCreatedAfter() != null) {
            whereClause.append("AND m.createdAt >= :createdAfter ");
            parameters.put("createdAfter", filterRequest.getCreatedAfter());
        }

        if (filterRequest.getCreatedBefore() != null) {
            whereClause.append("AND m.createdAt <= :createdBefore ");
            parameters.put("createdBefore", filterRequest.getCreatedBefore());
        }

        // Build final query
        String finalJpql = jpql.toString() + whereClause.toString();

        // Add ordering
        if (pageable.getSort().isSorted()) {
            finalJpql += "ORDER BY ";
            finalJpql += pageable.getSort().toString().replace(":", " ");
        } else {
            finalJpql += "ORDER BY m.createdAt DESC";
        }

        // Create and execute query
        TypedQuery<Marker> query = entityManager.createQuery(finalJpql, Marker.class);
        parameters.forEach(query::setParameter);

        // Set pagination
        query.setFirstResult((int) pageable.getOffset());
        query.setMaxResults(pageable.getPageSize());

        List<Marker> results = query.getResultList();

        // Count query for total elements
        String countJpql = "SELECT COUNT(DISTINCT m) FROM Marker m " +
                (jpql.toString().contains("JOIN") ? jpql.substring(jpql.indexOf("LEFT JOIN")) : "") +
                whereClause.toString();

        TypedQuery<Long> countQuery = entityManager.createQuery(countJpql, Long.class);
        parameters.forEach(countQuery::setParameter);

        Long total = countQuery.getSingleResult();

        return new PageImpl<>(results, pageable, total);
    }

    @Override
    public List<Marker> findNearbyMarkers(UUID gameId, double latitude, double longitude, double radiusKm, int limit) {
        String sql = """
            SELECT m.* FROM markers m 
            WHERE m.game_id = :gameId 
            AND m.status = 'ACTIVE'
            AND ST_DWithin(
                m.coordinates, 
                ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'), 
                :radiusMeters
            )
            ORDER BY ST_Distance(m.coordinates, ST_GeogFromText('POINT(' || :longitude || ' ' || :latitude || ')'))
            LIMIT :limit
            """;

        Query query = entityManager.createNativeQuery(sql, Marker.class);
        query.setParameter("gameId", gameId);
        query.setParameter("latitude", latitude);
        query.setParameter("longitude", longitude);
        query.setParameter("radiusMeters", radiusKm * 1000); // Convert km to meters
        query.setParameter("limit", limit);

        return query.getResultList();
    }

    @Override
    public Map<String, Object> getMarkerStatistics(UUID gameId) {
        Map<String, Object> stats = new HashMap<>();

        // Total markers
        String totalQuery = "SELECT COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status";
        Long total = entityManager.createQuery(totalQuery, Long.class)
                .setParameter("gameId", gameId)
                .setParameter("status", MarkerStatus.ACTIVE)
                .getSingleResult();
        stats.put("totalMarkers", total);

        // Markers by type
        String typeQuery = "SELECT m.markerType, COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status GROUP BY m.markerType";
        List<Object[]> typeResults = entityManager.createQuery(typeQuery)
                .setParameter("gameId", gameId)
                .setParameter("status", MarkerStatus.ACTIVE)
                .getResultList();

        Map<String, Long> byType = new HashMap<>();
        typeResults.forEach(row -> byType.put(row[0].toString(), (Long) row[1]));
        stats.put("byType", byType);

        // Verified vs unverified
        String verifiedQuery = "SELECT m.verified, COUNT(m) FROM Marker m WHERE m.gameId = :gameId AND m.status = :status GROUP BY m.verified";
        List<Object[]> verifiedResults = entityManager.createQuery(verifiedQuery)
                .setParameter("gameId", gameId)
                .setParameter("status", MarkerStatus.ACTIVE)
                .getResultList();

        Map<String, Long> byVerification = new HashMap<>();
        verifiedResults.forEach(row -> byVerification.put(row[0].toString(), (Long) row[1]));
        stats.put("byVerification", byVerification);

        return stats;
    }

    @Override
    public List<Marker> findMarkersWithinPolygon(UUID gameId, List<double[]> polygonPoints) {
        if (polygonPoints.size() < 3) {
            throw new IllegalArgumentException("Polygon must have at least 3 points");
        }

        StringBuilder polygonWkt = new StringBuilder("POLYGON((");
        for (int i = 0; i < polygonPoints.size(); i++) {
            if (i > 0) polygonWkt.append(", ");
            polygonWkt.append(polygonPoints.get(i)[1]).append(" ").append(polygonPoints.get(i)[0]); // lng lat
        }
        // Close the polygon
        polygonWkt.append(", ").append(polygonPoints.get(0)[1]).append(" ").append(polygonPoints.get(0)[0]);
        polygonWkt.append("))");

        String sql = """
            SELECT m.* FROM markers m 
            WHERE m.game_id = :gameId 
            AND m.status = 'ACTIVE'
            AND ST_Within(m.coordinates, ST_GeomFromText(:polygon, 4326))
            """;

        Query query = entityManager.createNativeQuery(sql, Marker.class);
        query.setParameter("gameId", gameId);
        query.setParameter("polygon", polygonWkt.toString());

        return query.getResultList();
    }

    @Override
    public List<Marker> findDuplicateMarkers(UUID gameId, double toleranceMeters) {
        String sql = """
            SELECT DISTINCT m1.* FROM markers m1, markers m2 
            WHERE m1.game_id = :gameId 
            AND m2.game_id = :gameId 
            AND m1.id != m2.id 
            AND m1.status = 'ACTIVE' 
            AND m2.status = 'ACTIVE'
            AND ST_DWithin(m1.coordinates, m2.coordinates, :tolerance)
            ORDER BY m1.created_at
            """;

        Query query = entityManager.createNativeQuery(sql, Marker.class);
        query.setParameter("gameId", gameId);
        query.setParameter("tolerance", toleranceMeters);

        return query.getResultList();
    }
}