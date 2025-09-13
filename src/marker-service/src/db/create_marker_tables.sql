CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Marker Categories
CREATE TABLE marker_categories (
                                   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                                   game_id UUID NOT NULL,
                                   name VARCHAR(100) NOT NULL,
                                   slug VARCHAR(100) NOT NULL,
                                   icon VARCHAR(100),
                                   color VARCHAR(7),
                                   description TEXT,
                                   parent_id UUID REFERENCES marker_categories(id),
                                   display_order INTEGER DEFAULT 0,
                                   is_active BOOLEAN DEFAULT true,
                                   is_collectible BOOLEAN DEFAULT false,
                                   metadata JSONB DEFAULT '{}',
                                   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                                   CONSTRAINT unique_category_slug_per_game UNIQUE (game_id, slug)
);

-- Marker Tags
CREATE TABLE marker_tags (
                             id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                             name VARCHAR(100) NOT NULL UNIQUE,
                             slug VARCHAR(100) NOT NULL UNIQUE,
                             tag_type VARCHAR(50),
                             color VARCHAR(7),
                             description TEXT,
                             metadata JSONB DEFAULT '{}',
                             created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                             updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Markers
CREATE TABLE markers (
                         id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                         game_id UUID NOT NULL,
                         map_id UUID,
                         category_id UUID REFERENCES marker_categories(id),
                         title VARCHAR(200) NOT NULL,
                         description TEXT,
                         coordinates GEOMETRY(POINT, 4326) NOT NULL,
                         latitude DECIMAL(10, 8) NOT NULL,
                         longitude DECIMAL(11, 8) NOT NULL,
                         marker_type VARCHAR(50) DEFAULT 'poi',
                         status VARCHAR(20) DEFAULT 'active',
                         difficulty_level INTEGER,
                         reward_info JSONB DEFAULT '{}',
                         requirements JSONB DEFAULT '{}',
                         metadata JSONB DEFAULT '{}',
                         icon_url VARCHAR(500),
                         image_urls TEXT[],
                         external_id VARCHAR(100),
                         created_by UUID,
                         verified BOOLEAN DEFAULT false,
                         verified_by UUID,
                         verified_at TIMESTAMP WITH TIME ZONE,
                         view_count INTEGER DEFAULT 0,
                         like_count INTEGER DEFAULT 0,
                         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                         CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
                         CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180),
                         CONSTRAINT valid_difficulty CHECK (difficulty_level IS NULL OR (difficulty_level >= 1 AND difficulty_level <= 5))
);

-- Marker Tags Junction
CREATE TABLE marker_marker_tags (
                                    marker_id UUID REFERENCES markers(id) ON DELETE CASCADE,
                                    tag_id UUID REFERENCES marker_tags(id) ON DELETE CASCADE,
                                    PRIMARY KEY (marker_id, tag_id)
);

-- Marker History (Audit Trail)
CREATE TABLE marker_history (
                                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                                marker_id UUID NOT NULL REFERENCES markers(id) ON DELETE CASCADE,
                                action VARCHAR(20) NOT NULL, -- CREATE, UPDATE, DELETE
                                changed_by UUID,
                                changes JSONB,
                                previous_values JSONB,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Marker Comments
CREATE TABLE marker_comments (
                                 id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                                 marker_id UUID NOT NULL REFERENCES markers(id) ON DELETE CASCADE,
                                 user_id UUID NOT NULL,
                                 content TEXT NOT NULL,
                                 parent_id UUID REFERENCES marker_comments(id),
                                 is_edited BOOLEAN DEFAULT false,
                                 is_deleted BOOLEAN DEFAULT false,
                                 created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                 updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial indexes
CREATE INDEX idx_markers_coordinates ON markers USING GIST (coordinates);
CREATE INDEX idx_markers_lat_lng ON markers (latitude, longitude);

-- Performance indexes
CREATE INDEX idx_markers_game_id ON markers (game_id);
CREATE INDEX idx_markers_map_id ON markers (map_id);
CREATE INDEX idx_markers_category_id ON markers (category_id);
CREATE INDEX idx_markers_status ON markers (status);
CREATE INDEX idx_markers_type ON markers (marker_type);
CREATE INDEX idx_markers_created_at ON markers (created_at);
CREATE INDEX idx_markers_verified ON markers (verified);
CREATE INDEX idx_markers_external_id ON markers (external_id);

-- Compound indexes for common queries
CREATE INDEX idx_markers_game_status ON markers (game_id, status);
CREATE INDEX idx_markers_game_category ON markers (game_id, category_id);
CREATE INDEX idx_markers_game_type ON markers (game_id, marker_type);

-- Category indexes
CREATE INDEX idx_categories_game_id ON marker_categories (game_id);
CREATE INDEX idx_categories_parent_id ON marker_categories (parent_id);
CREATE INDEX idx_categories_is_active ON marker_categories (is_active);
CREATE INDEX idx_categories_display_order ON marker_categories (display_order);

-- Tag indexes
CREATE INDEX idx_tags_type ON marker_tags (tag_type);

-- History indexes
CREATE INDEX idx_history_marker_id ON marker_history (marker_id);
CREATE INDEX idx_history_created_at ON marker_history (created_at);
CREATE INDEX idx_history_action ON marker_history (action);

-- Comment indexes
CREATE INDEX idx_comments_marker_id ON marker_comments (marker_id);
CREATE INDEX idx_comments_user_id ON marker_comments (user_id);
CREATE INDEX idx_comments_parent_id ON marker_comments (parent_id);
CREATE INDEX idx_comments_created_at ON marker_comments (created_at);

-- JSONB indexes for metadata queries
CREATE INDEX idx_markers_metadata ON markers USING GIN (metadata);
CREATE INDEX idx_markers_reward_info ON markers USING GIN (reward_info);
CREATE INDEX idx_markers_requirements ON markers USING GIN (requirements);
CREATE INDEX idx_categories_metadata ON marker_categories USING GIN (metadata);

-- Update functions for timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_markers_modtime BEFORE UPDATE ON markers FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_categories_modtime BEFORE UPDATE ON marker_categories FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_tags_modtime BEFORE UPDATE ON marker_tags FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_comments_modtime BEFORE UPDATE ON marker_comments FOR EACH ROW EXECUTE FUNCTION update_modified_column();