CREATE TYPE operation_type AS ENUM ('CREATE', 'UPDATE', 'DELETE');

CREATE TABLE marker_history (
                                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                marker_id UUID NOT NULL,
                                game_id UUID NOT NULL,
                                category_id UUID,
                                position GEOMETRY(POINT, 4326) NOT NULL,
                                title VARCHAR(255) NOT NULL,
                                description TEXT,
                                metadata JSONB DEFAULT '{}',
                                visibility_level INTEGER,
                                operation_type operation_type NOT NULL,
                                changed_by UUID,
                                version INTEGER,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for history queries
CREATE INDEX idx_marker_history_marker ON marker_history(marker_id);
CREATE INDEX idx_marker_history_game ON marker_history(game_id);
CREATE INDEX idx_marker_history_created_at ON marker_history(created_at);
CREATE INDEX idx_marker_history_changed_by ON marker_history(changed_by);
CREATE INDEX idx_marker_history_operation ON marker_history(operation_type);

-- Partitioning by month for better performance (optional)
-- Could be implemented later for high-volume scenarios