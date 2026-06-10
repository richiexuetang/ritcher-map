//! Pure-Rust protobuf codegen for the catalog event contract.
//!
//! The tile service consumes `catalog.changed` (protobuf binary) to invalidate
//! its tile cache, so it needs the `CatalogChanged` Rust type. We generate it
//! here with `protox` (a pure-Rust `protoc` replacement: parses `.proto` into a
//! `FileDescriptorSet`) plus `prost-build` (descriptor -> Rust). No system
//! `protoc`, `cmake`, or other native toolchain is required, which keeps the
//! distroless build image clean.
//!
//! The shared contract lives at repo-root `proto/` (outside this service's build
//! context). Locally/CI that's `../../proto`; in Docker the proto tree is copied
//! to `/proto` and pointed at via `RITCHERMAP_PROTO_DIR`. We compile ONLY
//! `ritchermap/catalog/v1/catalog.proto` into `OUT_DIR`; `src/events.rs`
//! `include!`s the result as `catalog_v1`.

use std::path::PathBuf;

fn main() {
    let proto_dir =
        std::env::var("RITCHERMAP_PROTO_DIR").unwrap_or_else(|_| "../../proto".to_string());
    let proto_dir = PathBuf::from(proto_dir);
    let catalog_proto = proto_dir.join("ritchermap/catalog/v1/catalog.proto");

    // Rebuild when the contract or its location changes.
    println!("cargo:rerun-if-env-changed=RITCHERMAP_PROTO_DIR");
    println!("cargo:rerun-if-changed={}", catalog_proto.display());

    // protox parses the .proto (resolving imports relative to `proto_dir`) into a
    // FileDescriptorSet without needing a `protoc` binary.
    let file_descriptors = protox::compile([&catalog_proto], [&proto_dir])
        .expect("failed to compile ritchermap/catalog/v1/catalog.proto with protox");

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set by cargo"));
    prost_build::Config::new()
        .out_dir(&out_dir)
        .compile_fds(file_descriptors)
        .expect("prost-build failed to generate Rust from the catalog descriptor set");
}
