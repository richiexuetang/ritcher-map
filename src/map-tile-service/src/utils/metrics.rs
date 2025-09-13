use lazy_static::lazy_static;
use prometheus::{
    register_counter_vec, register_histogram_vec, CounterVec, HistogramVec,
};

lazy_static! {
    pub static ref TILE_REQUESTS: CounterVec = register_counter_vec!(
        "tile_requests_total",
        "Total number of tile requests",
        &["map_id", "zoom", "format", "cache_hit"]
    )
    .unwrap();

    pub static ref TILE_GENERATION_TIME: HistogramVec = register_histogram_vec!(
        "tile_generation_duration_seconds",
        "Time taken to generate tiles",
        &["map_id", "zoom"]
    )
    .unwrap();

    pub static ref TILE_SIZE: HistogramVec = register_histogram_vec!(
        "tile_size_bytes",
        "Size of tiles in bytes",
        &["format"]
    )
    .unwrap();
}