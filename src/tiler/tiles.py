"""Orchestration: turn one source image into a stored tile pyramid + manifest."""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image

from pyramid import TILE_SIZE, generate_tiles, plan_pyramid
from storage import TileStore, content_type, encode_tile, tile_key


@dataclass
class TileResult:
    """Manifest describing a tiled map.

    This is exactly what the catalog service stores and the frontend reads to
    configure a MapLibre/Leaflet `Simple CRS` source: native pixel size, zoom
    bounds, tile URL template, and tile format.
    """

    prefix: str
    width: int
    height: int
    tile_size: int
    min_zoom: int
    max_zoom: int
    format: str
    tiles_written: int
    tiles_skipped: int
    duration_s: float

    def tile_url_template(self, base: str) -> str:
        return f"{base}/{self.prefix}/{{z}}/{{x}}/{{y}}.{self.format if self.format != 'webp' else 'webp'}"

    def to_manifest(self, *, base_url: str | None = None) -> dict:
        m = asdict(self)
        # MapLibre Simple-CRS bounds in pixel space: [[0, 0], [height, width]].
        m["bounds"] = [[0, 0], [self.height, self.width]]
        if base_url:
            m["tiles"] = [self.tile_url_template(base_url)]
        return m


def tile_image(
        source: str | Path | Image.Image,
        store: TileStore,
        prefix: str,
        *,
        tile_size: int = TILE_SIZE,
        min_zoom: int = 0,
        max_zoom: int | None = None,
        fmt: str = "webp",
        quality: int = 85,
        skip_blank: bool = True,
        write_manifest: bool = True,
        on_progress=None,
) -> TileResult:
    """Tile ``source`` into ``store`` under ``prefix`` and return a manifest.

    ``prefix`` is the per-map key namespace, e.g. ``"elden-ring/overworld"``.
    ``on_progress`` (optional) is called as ``on_progress(written, total)``.
    """
    img = source if isinstance(source, Image.Image) else Image.open(source)
    spec = plan_pyramid(
        img.width, img.height, tile_size=tile_size, min_zoom=min_zoom, max_zoom=max_zoom
    )
    total = spec.tile_count()
    mime = content_type(fmt)

    started = time.monotonic()
    written = skipped = 0
    for tile in generate_tiles(img, spec, skip_blank=skip_blank):
        data = encode_tile(tile.image, fmt, quality=quality)
        store.put_tile(tile_key(prefix, tile.z, tile.x, tile.y, fmt), data, mime=mime)
        written += 1
        if on_progress is not None:
            on_progress(written, total)
    skipped = total - written

    result = TileResult(
        prefix=prefix,
        width=img.width,
        height=img.height,
        tile_size=spec.tile_size,
        min_zoom=spec.min_zoom,
        max_zoom=spec.max_zoom,
        format=fmt,
        tiles_written=written,
        tiles_skipped=skipped,
        duration_s=round(time.monotonic() - started, 3),
    )
    if write_manifest:
        store.put_manifest(f"{prefix}/manifest.json", result.to_manifest())
    return result