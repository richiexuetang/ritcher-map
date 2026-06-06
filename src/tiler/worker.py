"""Async worker: consume tiling jobs from Kafka, produce tiles to S3.

This is the production entrypoint in the architecture. The catalog/CMS service
(Java) publishes a `map.tiling.requested` event when an editor uploads a new
map image; this worker tiles it and publishes `map.tiling.completed` so the
catalog can mark the map ready and the read path can pick it up.

kafka-python and boto3 are imported lazily so the rest of the package has no
hard dependency on them.

Event contract (JSON value of `map.tiling.requested`):
    {
      "map_id": "uuid",
      "prefix": "elden-ring/overworld",   # output key namespace
      "source_bucket": "uploads",
      "source_key": "raw/elden-ring/overworld.png",
      "format": "webp",                    # optional
      "max_zoom": null                     # optional override
    }
"""
from __future__ import annotations

import io
import json
import logging
import os
from dataclasses import dataclass

from PIL import Image

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


def handle_event(event: dict, cfg: WorkerConfig, s3, store: S3TileStore) -> dict:
    """Tile a single map. Returns the completion payload."""
    source = _load_source(s3, event["source_bucket"], event["source_key"])
    result = tile_image(
        source,
        store,
        event["prefix"],
        fmt=event.get("format", "webp"),
        max_zoom=event.get("max_zoom"),
    )
    payload = result.to_manifest(base_url=cfg.cdn_base_url)
    payload["map_id"] = event["map_id"]
    return payload


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
        value_deserializer=lambda b: json.loads(b.decode()),
        max_poll_records=1,  # tiling is heavy; one map per poll
    )
    producer = KafkaProducer(
        bootstrap_servers=cfg.brokers,
        value_serializer=lambda v: json.dumps(v).encode(),
    )
    log.info("worker up; consuming %s", REQUEST_TOPIC)

    for msg in consumer:
        event = msg.value
        try:
            payload = handle_event(event, cfg, s3, store)
            producer.send(COMPLETED_TOPIC, payload)
            producer.flush()
            consumer.commit()
            log.info("tiled map %s: %d tiles", event.get("map_id"), payload["tiles_written"])
        except Exception:  # keep the consumer alive; route the failure
            log.exception("tiling failed for %s", event.get("map_id"))
            producer.send(FAILED_TOPIC, {"map_id": event.get("map_id"), "event": event})
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