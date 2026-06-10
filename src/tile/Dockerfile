# Production image for tile-service (Rust read path).
# Multi-stage: compile with the full toolchain, ship just the binary on a
# distroless glibc base (the binary is dynamically linked). ~20 MB final image.
#
# Build context is the REPO ROOT (not src/tile): the build needs the shared
# proto/ contract, which lives outside this dir, and single-context builders
# (e.g. Koyeb) can't supply it as a named build context — so we COPY both by
# path from the root context instead. Root .dockerignore excludes **/target/.
#   docker build -f src/tile/Dockerfile -t tile .   # run from repo root
FROM rust:1.94-slim-bookworm AS build
WORKDIR /app
COPY src/tile .
# Shared protobuf contract (single source of truth); build.rs reads it via
# RITCHERMAP_PROTO_DIR. Codegen is pure Rust (protox + prost-build), so no
# protoc/cmake/apt deps are needed in the image.
COPY proto /proto
ENV RITCHERMAP_PROTO_DIR=/proto
RUN cargo build --release --locked

# distroless/cc has glibc + libgcc (needed by the dynamically-linked binary) and
# runs as a non-root user by default.
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/tile-service /usr/local/bin/tile-service
# Defaults; override DATABASE_URL / TILE_ORIGIN at runtime (see docker-compose.prod.yml).
ENV BIND_ADDR=0.0.0.0:8080 \
    TILE_CACHE_MB=128
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/tile-service"]
