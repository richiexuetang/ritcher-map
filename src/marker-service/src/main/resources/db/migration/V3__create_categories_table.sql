-- src/main/resources/db/migration/V2__Create_categories_table.sql
CREATE TABLE categories (
                            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                            game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            description TEXT,
                            display_color VARCHAR(7), -- Hex color code
                            sort_order INTEGER DEFAULT 0,
                            is_active BOOLEAN DEFAULT true,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

                            UNIQUE(game_id, name)
);

CREATE INDEX idx_categories_game ON categories(game_id);
CREATE INDEX idx_categories_active ON categories(game_id, is_active);
CREATE INDEX idx_categories_sort ON categories(game_id, sort_order);

-- Insert sample categories
INSERT INTO categories (id, game_id, name, description, display_color, sort_order) VALUES
                                                                                       ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Treasure', 'Treasure chests and valuable items', '#FFD700', 1),
                                                                                       ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'NPCs', 'Non-player characters', '#00FF00', 2),
                                                                                       ('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Points of Interest', 'Notable locations and landmarks', '#0000FF', 3);