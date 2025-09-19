-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Games table
CREATE TABLE games (
                       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                       name VARCHAR(255) NOT NULL,
                       slug VARCHAR(100) UNIQUE NOT NULL,
                       map_bounds GEOMETRY(POLYGON, 4326),
                       max_zoom_level INTEGER DEFAULT 18,
                       min_zoom_level INTEGER DEFAULT 0,
                       tile_size INTEGER DEFAULT 256,
                       base_map_url VARCHAR(500),
                       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tile metadata table
CREATE TABLE tile_metadata (
                               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                               game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                               zoom_level INTEGER NOT NULL,
                               tile_x INTEGER NOT NULL,
                               tile_y INTEGER NOT NULL,
                               format VARCHAR(10) NOT NULL,
                               file_size BIGINT NOT NULL,
                               content_hash VARCHAR(64) NOT NULL,
                               created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                               last_accessed TIMESTAMP WITH TIME ZONE,

                               UNIQUE(game_id, zoom_level, tile_x, tile_y, format)
);

-- Markers table (simplified for tile service)
CREATE TABLE markers (
                         id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                         game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         category_id UUID,
                         position GEOMETRY(POINT, 4326) NOT NULL,
                         title VARCHAR(255) NOT NULL,
                         description TEXT,
                         marker_type VARCHAR(50) NOT NULL DEFAULT 'poi',
                         metadata JSONB DEFAULT '{}',
                         visibility_level INTEGER DEFAULT 1,
                         created_by UUID,
                         version INTEGER DEFAULT 1,
                         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                         updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_games_slug ON games(slug);
CREATE INDEX idx_tile_metadata_game_zoom ON tile_metadata(game_id, zoom_level);
CREATE INDEX idx_tile_metadata_coords ON tile_metadata(game_id, zoom_level, tile_x, tile_y);
CREATE INDEX idx_tile_metadata_created ON tile_metadata(created_at);
CREATE INDEX idx_tile_metadata_accessed ON tile_metadata(last_accessed) WHERE last_accessed IS NOT NULL;

-- Spatial indexes
CREATE INDEX idx_games_bounds ON games USING GIST(map_bounds);
CREATE INDEX idx_markers_position ON markers USING GIST(position);
CREATE INDEX idx_markers_game_position ON markers USING GIST(game_id, position);
CREATE INDEX idx_markers_visibility ON markers(visibility_level) WHERE visibility_level > 0;

-- Partitioning for tile metadata (optional, for high-volume scenarios)
-- CREATE TABLE tile_metadata_y2024m01 PARTITION OF tile_metadata
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Insert sample game data
INSERT INTO games (id, name, slug, max_zoom_level, min_zoom_level) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'Example Game', 'example-game', 18, 0);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markers_updated_at BEFORE UPDATE ON markers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();