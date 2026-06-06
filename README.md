# RitcherMap

A self-hosted interactive game-map platform — zoomable tiled maps with thousands
of categorized, searchable markers and per-user progress tracking, in the spirit
of [mapgenie.io](https://mapgenie.io). Built as a polyglot, event-driven system
that puts each language where it's genuinely strongest.

> **Note on assets:** RitcherMap ships no game map imagery. Base maps are a
> swappable input; develop and test against synthetic or properly-licensed
> images. Game publishers' map art is copyrighted.

---

## Why polyglot

The platform splits along one fundamental axis: a **massively read-heavy hot
path** (serving tiles and answering "what markers are in this viewport?") sitting
next to a smaller, sync-sensitive **write path** (catalog edits, user progress).
That asymmetry is what makes a language split meaningful rather than decorative —
each service is sized and built for its workload.

| Service        | Language       | Role                                                        |
|----------------|----------------|-------------------------------------------------------------|
| `tile-service` | Rust           | Tiles + viewport marker queries — the latency-critical read path |
| `catalog`      | Java / Spring  | Maps, categories, markers CMS — the transactional write path & schema owner |
| `tiling`       | Python         | Offline pipeline: source image → tile pyramid → object storage |
| `gateway`      | Go             | Edge auth, routing, realtime sync (WebSocket fan-out)       |
| `accounts`     | Rails          | Users, subscriptions/billing, admin                         |
| `web`          | React + TS     | MapLibre GL frontend (Simple/pixel CRS)                     |

Shared backbone: **PostgreSQL + PostGIS** (spatial source of truth), **Redis**
(cache + pub/sub), **Kafka** (cross-service events), **S3-compatible** object
storage (tiles).

---

## Architecture

```
                    Frontend (React + MapLibre GL)
                                │
                                ▼
                    Gateway (Go) — edge auth · routing · realtime sync (WS)
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                         ▼
  tile-service (Rust)     catalog (Java)           accounts (Rails)
  tiles + viewport        admin CMS, map           users · billing
  queries  (READ)         lifecycle  (WRITE)
        │   │                   │
  reads │   │ reads             │ writes
   S3   │   ▼                   ▼
 (tiles)│  ┌─────────────────────────────────┐
        └─►│     PostgreSQL + PostGIS          │
           │     Redis · Kafka                 │
           └──────────────▲────────────────────┘
                          │  map.tiling.requested / completed
              tiling (Python) — source image → tile pyramid → S3
                          (offline worker, Kafka-driven)

Event bus wires the write path to the read path:
  catalog  ──map.tiling.requested──▶  tiling
  tiling   ──map.tiling.completed──▶  catalog       (marks the map READY)
  catalog  ──catalog.changed───────▶  tile-service  (invalidates hot cache)
```

Maps are tiled and queried in **native pixel space** ("Simple CRS"), not Web
Mercator — game maps aren't georeferenced. The same coordinate system runs end
to end: the Python tiler's output, the PostGIS `geometry(Point, 0)` column, the
Rust viewport queries, and the MapLibre client.

---

## Repository layout

```
ritchermap/
├── README.md                  # this file
├── docker-compose.yml         # local infra: postgres+postgis, redis, kafka, minio  (planned)
├── Makefile                   # top-level: up / test / proto / migrate              (planned)
│
├── proto/                     # cross-service contracts (buf) — source of truth     (planned)
│   ├── catalog/v1/            #   map, marker, category messages
│   ├── progress/v1/           #   user-progress / sync events
│   └── tiling/v1/             #   tiling request / completion events
│
├── services/
│   ├── tiling/                # Python  — tile pyramid generator
│   ├── tile-service/          # Rust    — read path (tiles + viewport queries)
│   ├── catalog/               # Java    — write path / CMS (owns the DB schema)
│   ├── gateway/               # Go      — edge auth, routing, realtime sync         (planned)
│   └── accounts/              # Rails   — users, billing, admin                     (planned)
│
├── web/                       # React + TS + MapLibre frontend                      (planned)
│
├── infra/                     # deployment (k8s / terraform), shared infra config   (planned)
└── tools/                     # repo-wide scripts: codegen, seed data, lint         (planned)
```

Each service keeps its **native build tooling** (Cargo, Gradle, pip, go mod, bundler).
The top-level `Makefile` only delegates — there is no meta-build system trying to
unify five toolchains.

---

## Status

This is an in-progress learning project. What's actually built vs. designed:

| Component      | Status                | Notes                                                        |
|----------------|-----------------------|--------------------------------------------------------------|
| `tiling`       | ✅ Built & tested     | End-to-end verified: image → pyramid → S3/disk + manifest    |
| `tile-service` | ✅ Built & tested     | 17 tests pass; verified over HTTP against real tiles         |
| `catalog`      | ✅ Built              | Compiles & runs; integration tests need Testcontainers       |
| `proto`        | 🚧 Planned            | Contracts mirrored by hand for now                           |
| `gateway`      | 🚧 Planned            | Design complete                                              |
| `accounts`     | 🚧 Planned            | Design complete                                              |
| `web`          | 🚧 Planned            | Design complete                                              |
| `infra` / CI   | 🚧 Planned            | docker-compose + path-filtered CI per service                |

---

## Local development

You need **PostgreSQL with the PostGIS extension**, a **Kafka broker**, and
**S3-compatible storage** (MinIO locally). A root `docker-compose.yml` to bring
these up with one command is planned (see Status); until then, run them however
you like and point the services at them via env vars.

### tiling (Python)

```bash
cd services/tiling
pip install -e ".[s3]"
# tile an image to local disk (dev) or S3 (prod)
tiler tile world.png --prefix elden-ring/overworld --out ./tiles
```

### tile-service (Rust) — read path

```bash
cd services/tile-service
psql "$DATABASE_URL" -f migrations/0001_init.sql   # reference only; catalog owns the canonical schema
DATABASE_URL=postgres://ritchermap:ritchermap@localhost/ritchermap \
TILE_ORIGIN=local:./tiles \
cargo run --release
# GET /maps/{id}/markers?bbox=minx,miny,maxx,maxy&zoom=Z[&categories=1,2]
# GET /tiles/{prefix}/{z}/{x}/{y}.webp
```

### catalog (Java) — write path

```bash
cd services/catalog
DATABASE_URL=jdbc:postgresql://localhost:5432/ritchermap \
DATABASE_USER=ritchermap DATABASE_PASSWORD=ritchermap \
KAFKA_BROKERS=localhost:9092 \
./gradlew bootRun
# Flyway runs V1__init.sql on startup against an EMPTY database.
# REST under /api/v1/{maps,categories,markers}
```

Each service has its own README with the full endpoint/CLI reference and design
notes.

---

## Conventions

**Schema ownership.** `catalog` is the **sole writer** of the `maps`,
`categories`, and `markers` tables; its `V1__init.sql` is the authoritative
schema. `tile-service` reads the same tables read-only — its `migrations/`
directory is reference only, kept in sync by hand.

**Map lifecycle.** A map row exists (`DRAFT`/`UPLOADED`) before it's tiled;
`width`/`height`/`max_zoom` are populated only when `map.tiling.completed`
arrives and the map flips to `READY`. The read path filters by
`status = 'READY'` so it never serves a half-built map.

**Immutable, versioned tiles.** Tiles are content-addressed by
`<prefix>/<z>/<x>/<y>.<ext>` and never overwritten — re-tiling publishes a new
prefix (e.g. `…/v2`). The CDN/browser cache them forever; cache "invalidation"
is just pointing the manifest at a new prefix. Blank tiles are skipped at tiling
time, so the read path treats missing tiles as transparent (404 → MapLibre
renders nothing).

**Event-driven cache invalidation.** Writers don't call readers synchronously.
`catalog` emits `catalog.changed` after a committed write; `tile-service`
consumes it to drop affected per-map cache entries. The only synchronous
cross-service hop is through the gateway.

**Contract-first (target).** Once `proto/` lands, every cross-service message
is defined there and each service generates its own stubs — that's what keeps
five languages type-consistent. Until then, event shapes are mirrored by hand
(see each service's `events`/`worker` module).

**CI is path-filtered.** Each service's pipeline triggers only on changes under
its own path (plus `proto/**`, which fans out to all consumers). A Rails change
must never recompile Rust.

---

## License

Personal / educational project. Not affiliated with any game publisher or with
mapgenie.io.