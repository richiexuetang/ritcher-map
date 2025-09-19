CREATE TABLE markers (
                         id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                         game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
                         position GEOMETRY(Point, 4326),
--                          latitude DOUBLE PRECISION NOT NULL,
--                          longitude DOUBLE PRECISION NOT NULL,
                         title VARCHAR(255) NOT NULL,
                         description TEXT,
                         visibility_level INTEGER DEFAULT 1,
                         created_by UUID,
                         updated_by UUID,
                         version INTEGER DEFAULT 1,
                         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                         updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_markers_game ON markers(game_id);
CREATE INDEX idx_markers_category ON markers(category_id);
-- CREATE INDEX idx_markers_location ON markers(latitude, longitude);
CREATE INDEX idx_markers_game_visibility ON markers(game_id, visibility_level);
CREATE INDEX idx_markers_created_by ON markers(created_by);
CREATE INDEX idx_markers_created_at ON markers(created_at);

-- Add trigger for updated_at
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
--     RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = NOW();
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';
--
-- CREATE TRIGGER update_markers_updated_at BEFORE UPDATE ON markers
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample markers
-- INSERT INTO markers (id, game_id, category_id, latitude, longitude, title, description, visibility_level, created_by, updated_by) VALUES
--                                                                                                                                       ('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001', 40.7128, -74.0060, 'NYC Treasure', 'A treasure in New York City', 1, '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001'),
--                                                                                                                                       ('550e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440002', 34.0522, -118.2437, 'LA NPC', 'An NPC in Los Angeles', 1, '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001');