package com.ritchermap.catalog.repo;

import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;

/**
 * Spring Data JPA looks up a bean named {@code <RepoName>Impl} to provide
 * custom-interface methods. So this class must be named exactly
 * {@code MarkerRepositoryImpl}.
 */
@Repository
public class MarkerRepositoryImpl implements MarkerRepositoryCustom {

    private final JdbcTemplate jdbc;

    public MarkerRepositoryImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String INSERT_SQL =
            "INSERT INTO markers (map_id, category_id, title, description, geom) " +
                    "VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 0))";

    @Override
    public int bulkInsert(List<MarkerInsert> rows) {
        if (rows.isEmpty()) return 0;
        int[] counts = jdbc.batchUpdate(INSERT_SQL, new BatchPreparedStatementSetter() {
            @Override public void setValues(PreparedStatement ps, int i) throws SQLException {
                MarkerInsert r = rows.get(i);
                ps.setLong(1, r.mapId());
                ps.setLong(2, r.categoryId());
                if (r.title() == null) ps.setNull(3, Types.VARCHAR); else ps.setString(3, r.title());
                if (r.description() == null) ps.setNull(4, Types.VARCHAR); else ps.setString(4, r.description());
                ps.setDouble(5, r.x());
                ps.setDouble(6, r.y());
            }
            @Override public int getBatchSize() { return rows.size(); }
        });
        int total = 0;
        for (int c : counts) total += Math.max(c, 0);
        return total;
    }
}

