"""Async worker: consume tiling jobs from Kafka, produce tiles to S3.

This is the production entrypoint in the architecture. The catalog/CMS service
(Java) publishes a `map.tiling.requested` event when an editor uploads a new
map image; this worker tiles it and publishes `map.tiling.completed` so the
catalog can mark the map ready and the read path can pick it up.

kafka-python and boto3 are imported lazily so the rest of the package has no
hard dependency on them.

Event contract (protobuf binary, generated from proto/ritchermap/tiling/v1):
    - consume `map.tiling.requested` as a serialized `tiling.v1.TilingRequested`
      (parse with pb.TilingRequested.FromString(raw_bytes))
    - produce `map.tiling.completed` as a serialized `tiling.v1.TilingCompleted`
    - on failure, produce `map.tiling.failed` as a serialized
      `tiling.v1.TilingFailed` {map_id, reason}

The Kafka wire is raw protobuf bytes (NOT JSON). `map_id` is an int64.
"""
from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass

from PIL import Image

from ritchermap.tiling.v1 import tiling_pb2 as pb
from storage import S3TileStore
from tiles import tile_image

log = logging.getLogger("tiler.worker")

REQUEST_TOPIC = os.environ.get("TILING_REQUEST_TOPIC", "map.tiling.requested")
COMPLETED_TOPIC = os.environ.get("TILING_COMPLETED_TOPIC", "map.tiling.completed")
FAILED_TOPIC = os.environ.get("TILING_FAILED_TOPIC", "map.tiling.failed")


@dataclass
class WorkerConfig:
    brokers: str
    group_id: str
    output_bucket: str
    cdn_base_url: str | None = None


def _load_source(s3, bucket: str, key: str) -> Image.Image:
    obj = s3.get_object(Bucket=bucket, Key=key)
    return Image.open(io.BytesIO(obj["Body"].read()))


def handle_event(
    req: pb.TilingRequested, cfg: WorkerConfig, s3, store: S3TileStore
) -> pb.TilingCompleted:
    """Tile a single map. Returns a `TilingCompleted` protobuf message."""
    source = _load_source(s3, req.source_bucket, req.source_key)
    result = tile_image(
        source,
        store,
        req.prefix,
        fmt=req.format or "webp",
        max_zoom=req.max_zoom if req.HasField("max_zoom") else None,
    )
    return pb.TilingCompleted(
        map_id=req.map_id,  # int64 — keep it an int
        prefix=result.prefix,
        width=result.width,
        height=result.height,
        max_zoom=result.max_zoom,
        tile_size=result.tile_size,
        format=result.format,
        tiles_written=result.tiles_written,
    )


def run(cfg: WorkerConfig) -> None:  # pragma: no cover - requires a live broker
    import boto3
    from kafka import KafkaConsumer, KafkaProducer

    s3 = boto3.client("s3")
    store = S3TileStore(cfg.output_bucket, client=s3)
    consumer = KafkaConsumer(
        REQUEST_TOPIC,
        bootstrap_servers=cfg.brokers,
        group_id=cfg.group_id,
        enable_auto_commit=False,
        value_deserializer=lambda b: b,  # raw protobuf bytes; parse below
        max_poll_records=1,  # tiling is heavy; one map per poll
    )
    producer = KafkaProducer(
        bootstrap_servers=cfg.brokers,
        value_serializer=lambda m: m.SerializeToString(),
    )
    log.info("worker up; consuming %s", REQUEST_TOPIC)

    for msg in consumer:
        map_id = 0  # default if the request can't even be parsed
        try:
            req = pb.TilingRequested.FromString(msg.value)
            map_id = req.map_id
            completed = handle_event(req, cfg, s3, store)
            producer.send(COMPLETED_TOPIC, completed)
            producer.flush()
            consumer.commit()
            log.info("tiled map %s: %d tiles", map_id, completed.tiles_written)
        except Exception as exc:  # keep the consumer alive; route the failure
            log.exception("tiling failed for %s", map_id)
            producer.send(FAILED_TOPIC, pb.TilingFailed(map_id=map_id, reason=str(exc)))
            producer.flush()
            consumer.commit()  # don't reprocess a poison message; dead-letter instead


def main() -> None:  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    run(
        WorkerConfig(
            brokers=os.environ.get("KAFKA_BROKERS", "localhost:9092"),
            group_id=os.environ.get("KAFKA_GROUP", "tiling-workers"),
            output_bucket=os.environ["TILES_BUCKET"],
            cdn_base_url=os.environ.get("CDN_BASE_URL"),
        )
    )


if __name__ == "__main__":
    main()