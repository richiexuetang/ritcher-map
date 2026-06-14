-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
-- Per-game branding (MapGenie-style): a game groups one or more maps and
-- carries the visual identity (colors, fonts, logo) the webapp themes with.
-- The slug matches maps.game_slug; there's no FK because maps predate games
-- and a game row may not exist for every game_slug yet.

CREATE TABLE games (
    id            BIGSERIAL PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    primary_color TEXT,
    accent_color  TEXT,
    font_family   TEXT,
    font_url      TEXT,
    logo_url      TEXT,
    thumbnail_url TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER games_touch BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
