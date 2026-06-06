# catalog (Java / Spring Boot)

The **write-side owner** of the catalog domain: maps, categories, markers. It
holds the schema in PostGIS (the Rust read-path service consumes it read-only),
exposes a REST admin/CMS API, and integrates with the rest of the platform via
Kafka.

## What it does

```
editor uploads source image
   |
   v
POST /api/v1/maps/{id}/tiling   -> catalog persists, emits map.tiling.requested
                                                                 |
                                                                 v
                                         Python tiling worker tiles -> S3
                                                                 |
                                                                 v
catalog consumes map.tiling.completed -> sets width/height/max_zoom, status=READY
                                                                 |
                                                                 v
                                          emits catalog.changed (map updated)
                                                                 |
                                                                 v
                                          Rust read service invalidates cache
```

Subsequent edits to markers/categories follow the same pattern: write to
PostGIS in a transaction, emit `catalog.changed` after commit, Rust invalidates.

## Layout

```
src/main/java/io/mapgenie/catalog/
├── CatalogApplication.java
├── domain/         GameMap, MapStatus, Category, Marker  (JPA entities)
├── repo/           Spring Data repositories + bulk-insert JdbcTemplate impl
├── service/        MapService, CategoryService, MarkerService, CatalogEventPublisher
├── api/            Map/Category/Marker controllers + Dtos (records)
├── events/         Event records + TilingEventListener (Kafka consumer)
└── error/          NotFoundException, ConflictException, GlobalExceptionHandler

src/main/resources/
├── application.yml
└── db/migration/V1__init.sql     (canonical schema)

src/test/java/.../service/MapServiceTest.java
```

## Run locally

You need Postgres (with the PostGIS extension) and a Kafka broker. Easiest path
is the monorepo's `docker-compose.yml`. Then:

```bash
DATABASE_URL=jdbc:postgresql://localhost:5432/mapgenie \
DATABASE_USER=mapgenie \
DATABASE_PASSWORD=mapgenie \
KAFKA_BROKERS=localhost:9092 \
./gradlew bootRun
```

Flyway runs `V1__init.sql` on startup (creates the `map_status` enum, tables,
GiST spatial index, and `updated_at` triggers).

## API quick tour

```bash
# Create a map (DRAFT)
curl -X POST localhost:8081/api/v1/maps -H 'content-type: application/json' \
  -d '{"gameSlug":"elden-ring","mapSlug":"overworld","name":"Overworld"}'

# Tell the tiling worker to process the uploaded source -> async tiling
curl -X POST localhost:8081/api/v1/maps/1/tiling -H 'content-type: application/json' \
  -d '{"sourceBucket":"uploads","sourceKey":"raw/elden-ring/overworld.png"}'

# Create a category
curl -X POST localhost:8081/api/v1/maps/1/categories -H 'content-type: application/json' \
  -d '{"slug":"sites-of-grace","name":"Sites of Grace","sortOrder":1}'

# Add a marker
curl -X POST localhost:8081/api/v1/maps/1/markers -H 'content-type: application/json' \
  -d '{"categoryId":1,"x":1024,"y":768,"title":"Stranded Graveyard"}'

# Bulk import (5000 markers in one batched round trip)
curl -X POST 'localhost:8081/api/v1/maps/1/markers:bulk' \
  -H 'content-type: application/json' -d @markers.json
```

## Test

```bash
./gradlew test
```

`MapServiceTest` is a service-layer unit test using Mockito — fast, no DB. The
real integration tests against PostGIS + Kafka belong in `*IT.java` classes
using Testcontainers (template included in the test source set as a stub).

## Design notes worth flagging

**Schema ownership.** This service is the sole writer of `maps`, `categories`,
`markers`. The Rust read service's `migrations/` directory is reference-only;
this `V1__init.sql` is authoritative.

**Map dimensions are nullable.** A map exists in `DRAFT`/`UPLOADED` long before
it's tiled, so `width`/`height`/`max_zoom` are nullable and populated only when
`map.tiling.completed` arrives. **The Rust service's `map_meta` query must
filter by `status = 'READY'`** so it never observes the partial state.

**Event timing — `AFTER_COMMIT` vs outbox.** `CatalogChanged` events publish
via `@TransactionalEventListener(AFTER_COMMIT)`, so a rolled-back transaction
never produces a ghost event. The gap is the failure window between DB commit
and Kafka send — a JVM crash there loses the event. For a learning project
that's fine; the production upgrade is a **transactional outbox** (write the
event to an `outbox` table inside the same transaction, separate publisher
process tails it). The service layer already publishes Spring application
events, so swapping the listener for an outbox writer is contained.

**Kafka consumer is at-least-once.** `ack-mode: manual_immediate` plus an
idempotency check in `completeTiling` means duplicate `tiling.completed`
deliveries are safe.

**Bulk import.** Per-row JPA `save` is slow at 5k markers; `MarkerRepositoryImpl`
uses `JdbcTemplate.batchUpdate` with a parameterized `ST_MakePoint`, so the
import is a single batched round trip.
