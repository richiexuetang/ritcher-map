# proto — cross-service contracts

The single source of truth for every shape that crosses a service boundary in
RitcherMap. Before this existed, the Kafka event shapes were hand-mirrored in
Java, Python, and Rust, and the JWT claims lived only in comments — which is how
the `TilingFailed` payload ended up disagreeing (`{map_id, event}` vs
`{map_id, reason}`) and how snake_case/camelCase drift crept in. Defining them
once here and generating per-language stubs removes that whole class of bug.

## What's defined

| File                          | Messages                                             | Crosses                          |
|-------------------------------|------------------------------------------------------|----------------------------------|
| `ritchermap/tiling/v1`        | `TilingRequested`, `TilingCompleted`, `TilingFailed` | catalog (Java) ↔ tiling (Python) |
| `ritchermap/catalog/v1`       | `Map`, `Category`, `Marker`, `CatalogChanged`        | catalog (Java) → read path (Rust); shared w/ frontend |
| `ritchermap/progress/v1`      | `ProgressUpdate`, `SyncEnvelope`                     | gateway (Go) internals (Redis + WS) |
| `ritchermap/auth/v1`          | `SessionClaims`                                      | accounts (Rails) → gateway (Go)  |

## Tooling

[`buf`](https://buf.build) is the canonical tool: `buf lint` enforces the
conventions (v1 versioning, `*_UNSPECIFIED = 0` enum zero values), and
`buf breaking` fails CI on a wire-incompatible change to a released message —
the guardrail that makes the contract safe to depend on across five services.

```bash
buf lint
buf breaking --against '.git#branch=main'
buf generate            # Go + Python stubs (see buf.gen.yaml)
```

## Codegen per language

The `.proto` files are the source of truth; the *generation mechanism* differs
by ecosystem (this is normal for polyglot protobuf):

- **Go (gateway)** — `buf generate` → `gen/go/...` via `protoc-gen-go`.
- **Python (tiling)** — `buf generate` → `gen/python/...` (plus `.pyi` stubs).
- **Java (catalog)** — the Gradle protobuf plugin compiles the shared `proto/`
  dir during the build:
  ```kotlin
  // build.gradle.kts
  plugins { id("com.google.protobuf") version "0.9.4" }
  dependencies { implementation("com.google.protobuf:protobuf-java:4.28.2") }
  protobuf {
    protoc { artifact = "com.google.protobuf:protoc:4.28.2" }
    // point sourceSets.main.proto at ../../proto in settings
  }
  ```
- **Rust (read path)** — `prost` in `build.rs` compiles the same files:
  ```rust
  // build.rs
  fn main() {
      prost_build::compile_protos(
          &["../../proto/ritchermap/catalog/v1/catalog.proto"],
          &["../../proto"],
      ).unwrap();
  }
  // Cargo.toml: prost = "0.13", build-dependencies: prost-build = "0.13"
  ```

## Wire format: protobuf binary on Kafka

Events move to **protobuf binary** on the Kafka wire (compact, fast, schema-
evolvable, and — being tag-based — immune to the field-name-casing drift that
bit the JSON version). This is a coordinated change; bump the topic/version
when you cut over.

Per-service serializer changes:

- **Java (catalog)** — `value-serializer: ByteArraySerializer`; publish
  `event.toByteArray()`. Consume with `ByteArrayDeserializer` +
  `TilingCompleted.parseFrom(bytes)`. (Replaces the Spring `JsonSerializer` and
  the hand-written records in `Events.java`.)
- **Python (tiling)** — producer `value_serializer = lambda m: m.SerializeToString()`;
  consumer `value_deserializer = lambda b: TilingRequested.FromString(b)`.
  (Replaces `json.dumps`/`json.loads`.)
- **Rust (read path)** — `prost::Message::decode(bytes)` for `CatalogChanged`.
  (Replaces the hand-written JSON struct.)

If you'd rather not change the wire during migration, protobuf's canonical JSON
mapping lets you keep JSON bytes while still generating the types from these
files — adopt the generated types first, switch the wire second.

> One JSON-mapping gotcha for the **frontend**: proto3 JSON encodes `int64` as a
> *string* (to avoid JS precision loss). The TS client should expect `id` and
> `marker_id` as strings if it ever consumes proto-JSON.

## Migration checklist

1. `TilingFailed` — Python worker: send `TilingFailed(map_id=…, reason=str(exc))`
   instead of `{map_id, event}`. **This is the bug fix.**
2. `catalog/Events.java` records → generated `com.ritchermap.proto.*` classes.
3. Python worker dict payloads → generated message classes.
4. Rust `CatalogChanged` JSON struct → generated prost type.
5. `SessionClaims` — accounts encodes the JWT from these field names (adding
   `premium`); gateway decodes into the generated struct and gates free-tier
   limits on `premium`. **This closes the premium-enforcement gap.**
6. `ProgressUpdate.marker_id` is `int64` — update the gateway's progress store/
   handler to carry int64 rather than string. **This resolves the type drift.**
