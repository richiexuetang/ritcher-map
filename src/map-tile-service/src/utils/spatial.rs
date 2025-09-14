use crate::models::tile::TileBounds;

pub struct TileCoordinate {
    pub x: u32,
    pub y: u32,
    pub z: u8,
}

pub struct LatLng {
    pub lat: f64,
    pub lng: f64,
}

impl TileCoordinate {
    /// Convert tile coordinates to geographic bounds
    pub fn to_bounds(&self) -> TileBounds {
        let n = 2.0_f64.powi(self.z as i32);

        let west = (self.x as f64) / n * 360.0 - 180.0;
        let east = ((self.x + 1) as f64) / n * 360.0 - 180.0;

        let north_rad = ((n - self.y as f64) / n * std::f64::consts::PI).sinh().atan();
        let south_rad = ((n - (self.y + 1) as f64) / n * std::f64::consts::PI).sinh().atan();

        let north = north_rad.to_degrees();
        let south = south_rad.to_degrees();

        TileBounds { north, south, east, west }
    }

    /// Convert geographic coordinates to tile coordinates
    pub fn from_lat_lng(lat: f64, lng: f64, zoom: u8) -> Self {
        let n = 2.0_f64.powi(zoom as i32);

        let x = ((lng + 180.0) / 360.0 * n).floor() as u32;
        let lat_rad = lat.to_radians();
        let y = ((1.0 - (lat_rad.tan() + (1.0 / lat_rad.cos())).ln() / std::f64::consts::PI) / 2.0 * n).floor() as u32;

        Self { x, y, z: zoom }
    }

    /// Get all tile coordinates within bounds at given zoom level
    pub fn tiles_in_bounds(bounds: &TileBounds, zoom: u8) -> Vec<TileCoordinate> {
        let nw = Self::from_lat_lng(bounds.north, bounds.west, zoom);
        let se = Self::from_lat_lng(bounds.south, bounds.east, zoom);

        let mut tiles = Vec::new();

        let min_x = nw.x.min(se.x);
        let max_x = nw.x.max(se.x);
        let min_y = nw.y.min(se.y);
        let max_y = nw.y.max(se.y);

        for x in min_x..=max_x {
            for y in min_y..=max_y {
                tiles.push(TileCoordinate { x, y, z: zoom });
            }
        }

        tiles
    }
}

/// Calculate the great circle distance between two points in meters
pub fn haversine_distance(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    const EARTH_RADIUS_M: f64 = 6_371_000.0;

    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();
    let delta_lat = (lat2 - lat1).to_radians();
    let delta_lng = (lng2 - lng1).to_radians();

    let a = (delta_lat / 2.0).sin().powi(2) +
        lat1_rad.cos() * lat2_rad.cos() *
            (delta_lng / 2.0).sin().powi(2);

    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS_M * c
}