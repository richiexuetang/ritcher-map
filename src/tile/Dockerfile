# Production image for tile-service (Rust read path).
# Multi-stage: compile with the full toolchain, ship just the binary on a
# distroless glibc base (the binary is dynamically linked). ~20 MB final image.
#   docker build -t tile .
FROM rust:1.94-slim-bookworm AS build
WORKDIR /app
# .dockerignore excludes target/, so this is a small context.
COPY . .
# Shared protobuf contract (single source of truth) lives at repo-root proto/,
# outside this service's build context; supply it as a named build context the
# build.rs reads via RITCHERMAP_PROTO_DIR. Codegen is pure Rust (protox +
# prost-build), so no protoc/cmake/apt deps are needed in the image.
COPY --from=proto . /proto
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
