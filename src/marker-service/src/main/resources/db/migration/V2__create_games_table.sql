CREATE TABLE games (
                       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                       name VARCHAR(255) NOT NULL,
                       slug VARCHAR(100) UNIQUE NOT NULL,
                       description TEXT,
                       is_active BOOLEAN DEFAULT true,
                       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_games_slug ON games(slug);
CREATE INDEX idx_games_active ON games(is_active);

-- Insert sample game
INSERT INTO games (id, name, slug, description, is_active) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'Example Game', 'example-game', 'Example game for testing', true);