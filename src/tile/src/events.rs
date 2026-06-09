//! Generated protobuf types for the catalog event contract.
//!
//! `build.rs` compiles `ritchermap/catalog/v1/catalog.proto` (the shared
//! single-source-of-truth contract at repo-root `proto/`) into `OUT_DIR`. We
//! re-expose only the catalog v1 package; the consumer decodes the
//! `CatalogChanged` message it carries.

/// `ritchermap.catalog.v1` — the catalog domain contract.
pub mod catalog_v1 {
    include!(concat!(env!("OUT_DIR"), "/ritchermap.catalog.v1.rs"));
}
