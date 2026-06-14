-- Per-map minimum zoom level: the lowest zoom the viewer exposes / requests.
-- 0 for normal full pyramids (the tiler always builds 0..max_zoom); set higher
-- for imported pyramids whose lowest level isn't 0, or by an editor to limit
-- how far users can zoom out. Existing rows default to 0.
ALTER TABLE maps ADD COLUMN min_zoom INT NOT NULL DEFAULT 0;
