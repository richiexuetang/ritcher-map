"""Tile encoding and storage backends.

The orchestrator stays storage-agnostic: it talks to the ``TileStore``
protocol, and we ship a local-filesystem implementation (for dev / testing)
and an S3 implementation (for production). boto3 is imported lazily so the
core engine and the local store work with zero extra dependencies.
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Protocol

from PIL import Image

# Tile format -> (Pillow format, mime, file extension)
_FORMATS = {
    "webp": ("WEBP", "image/webp", "webp"),
    "png": ("PNG", "image/png", "png"),
}


def encode_tile(image: Image.Image, fmt: str = "webp", *, quality: int = 85) -> bytes:
    try:
        pil_fmt, _, _ = _FORMATS[fmt]
    except KeyError:
        raise ValueError(f"unsupported tile format: {fmt!r}") from None
    buf = io.BytesIO()
    if pil_fmt == "WEBP":
        # method 4 balances speed vs. size; 6 is ~3x slower for <1% gain.
        image.save(buf, pil_fmt, quality=quality, method=4)
    else:  # PNG is lossless; quality is ignored, optimize instead
        image.save(buf, pil_fmt, optimize=True)
    return buf.getvalue()


def content_type(fmt: str) -> str:
    return _FORMATS[fmt][1]


def extension(fmt: str) -> str:
    return _FORMATS[fmt][2]


class TileStore(Protocol):
    """Anything that can persist tiles + a per-map manifest."""

    def put_tile(self, key: str, data: bytes, *, mime: str) -> None: ...
    def put_manifest(self, key: str, manifest: dict) -> None: ...


def tile_key(prefix: str, z: int, x: int, y: int, fmt: str) -> str:
    """Standard layout: ``<prefix>/<z>/<x>/<y>.<ext>`` (e.g. tiles/elden-ring/overworld)."""
    return f"{prefix}/{z}/{x}/{y}.{extension(fmt)}"


class LocalTileStore:
    """Write tiles to a directory tree. Useful for local preview + tests."""

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def put_tile(self, key: str, data: bytes, *, mime: str) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_manifest(self, key: str, manifest: dict) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(manifest, indent=2))


class S3TileStore:
    """Write tiles to any S3-compatible bucket (AWS S3, MinIO, R2, ...).

    Tiles are immutable, so we set a long, public, immutable cache header —
    the CDN and browser can hold them forever. Cache invalidation happens by
    publishing a new map version (a new key prefix), never by overwriting.
    """

    def __init__(self, bucket: str, *, client=None, cache_control: str = "public, max-age=31536000, immutable"):
        if client is None:
            import boto3  # lazy: only needed in production

            client = boto3.client("s3")
        self.bucket = bucket
        self.client = client
        self.cache_control = cache_control

    def put_tile(self, key: str, data: bytes, *, mime: str) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=mime,
            CacheControl=self.cache_control,
        )

    def put_manifest(self, key: str, manifest: dict) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(manifest).encode(),
            ContentType="application/json",
            CacheControl="public, max-age=60",  # manifest may change between versions
        )