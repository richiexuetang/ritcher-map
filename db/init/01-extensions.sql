-- Idempotent safety net. The postgis/postgis base image already creates this
-- extension in POSTGRES_DB on first boot; this keeps things correct if the DB
-- name is customized or the base behavior changes. catalog's Flyway V1 also
-- runs `CREATE EXTENSION IF NOT EXISTS postgis` on its own startup.
CREATE EXTENSION IF NOT EXISTS postgis;
