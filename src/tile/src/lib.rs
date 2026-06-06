//! Tile + viewport query service — the read path of a MapGenie-style platform.
//!
//! Serves immutable map tiles (cached) and answers viewport marker queries
//! against PostGIS, clustering server-side when a viewport is dense.

pub mod cluster;
pub mod domain;
pub mod http;
pub mod repo;
pub mod tiles;
