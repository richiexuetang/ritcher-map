-- Canonical schema owned by the catalog service.
-- The Rust read-path service consumes this schema read-only.
--
-- Coordinate system: SRID 0 = "no CRS" / unitless cartesian, which is correct
-- for game maps (pixel space, not Earth). This matches the Python tiling
-- pipeline's Simple-CRS output.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Maps
-- ---------------------------------------------------------------------------
-- A map row exists from the moment an editor creates it, *before* the source
-- image has been tiled. The lifecycle is:
--
--   DRAFT     -> editor created the row, no source yet
--   UPLOADED  -> source object uploaded; tiling job has been requested
--   TILING    -> worker is processing (optional state; we may skip it)
--   READY     -> tiles exist, width/height/max_zoom populated; readable
--   FAILED    -> tiling failed; surfaced to the editor for re-upload
--
-- width/height/max_zoom are NULL until the tiling worker reports completion,
-- so the Rust read path must filter by status = 'READY'.

CREATE TYPE map_status AS ENUM ('DRAFT', 'UPLOADED', 'TILING', 'READY', 'FAILED');

CREATE TABLE maps (
                      id                BIGSERIAL PRIMARY KEY,
                      game_slug         TEXT       NOT NULL,           -- e.g. 'elden-ring'
                      map_slug          TEXT       NOT NULL,           -- e.g. 'overworld'
                      name              TEXT       NOT NULL,           -- display name
                      prefix            TEXT       NOT NULL UNIQUE,    -- '<game_slug>/<map_slug>' tile key namespace
                      status            map_status NOT NULL DEFAULT 'DRAFT',
                      source_object_key TEXT,                          -- raw image location, e.g. 'raw/elden-ring/overworld.png'
                      width             BIGINT,                        -- native pixel width  (set on TILING completion)
                      height            BIGINT,                        -- native pixel height (set on TILING completion)
                      max_zoom          INT,                           -- (set on TILING completion)
                      tile_size         INT        NOT NULL DEFAULT 256,
                      format            TEXT       NOT NULL DEFAULT 'webp',
                      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                      UNIQUE (game_slug, map_slug)
);

CREATE INDEX maps_status_idx ON maps (status);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
-- Per-map marker categorization. Supports a single level of nesting via
-- parent_id so editors can group ("Bosses > Field Bosses, Evergaol Bosses").
-- sort_order controls display in the filter panel.

CREATE TABLE categories (
                            id          BIGSERIAL PRIMARY KEY,
                            map_id      BIGINT     NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                            parent_id   BIGINT              REFERENCES categories(id) ON DELETE SET NULL,
                            slug        TEXT       NOT NULL,
                            name        TEXT       NOT NULL,
                            icon        TEXT,                                -- icon key/URL for the UI
                            sort_order  INT        NOT NULL DEFAULT 0,
                            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                            UNIQUE (map_id, slug)
);

CREATE INDEX categories_map_idx ON categories (map_id);

-- ---------------------------------------------------------------------------
-- Markers
-- ---------------------------------------------------------------------------
-- A point in the map's native pixel space. The GiST index serves both bbox
-- overlap (`geom && ST_MakeEnvelope(...)`) and nearest-to-center ordering
-- (`geom <-> ST_MakePoint(...)`) used by the Rust read service.

CREATE TABLE markers (
                         id          BIGSERIAL PRIMARY KEY,
                         map_id      BIGINT     NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                         category_id BIGINT     NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                         title       TEXT,
                         description TEXT,
                         geom        geometry(Point, 0) NOT NULL,
                         created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                         updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX markers_geom_gix ON markers USING GIST (geom);
CREATE INDEX markers_map_cat  ON markers (map_id, category_id);

-- updated_at trigger (one trigger, reused for all three tables)
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maps_touch       BEFORE UPDATE ON maps       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER categories_touch BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER markers_touch    BEFORE UPDATE ON markers    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();