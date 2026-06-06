"""Image-pyramid tiling for game maps.

Game maps are not geo referenced, so we tile them in a *pixel* coordinate
system (the "Simple CRS" that Leaflet / MapLibre GL expose for flat images)
rather than Web Mercator. The output follows the standard slippy-map XYZ
scheme: tiles are addressed by (z, x, y) with the origin at the top-left and
y increasing downward, which is MapLibre/Leaflet's default (`tms: false`).

At the maximum zoom level the source image is at native resolution. Each
lower zoom level is the previous one halved, so zoom 0 fits the whole map in
a single tile's worth of pixels.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterator

from PIL import Image

# Game maps routinely exceed Pillow's default decompression-bomb threshold.
# We control the inputs, so lift the guard.
Image.MAX_IMAGE_PIXELS = None

TILE_SIZE = 256


@dataclass(frozen=True)
class Tile:
    """A single rendered tile and its address in the pyramid."""

    z: int
    x: int
    y: int
    image: Image.Image


@dataclass(frozen=True)
class PyramidSpec:
    """The plan for tiling one source image."""

    width: int
    height: int
    tile_size: int
    min_zoom: int
    max_zoom: int

    def zoom_range(self) -> range:
        return range(self.min_zoom, self.max_zoom + 1)

    def level_dimensions(self, z: int) -> tuple[int, int]:
        """Pixel dimensions of the (downscaled) image at zoom level ``z``."""
        scale = 2 ** (self.max_zoom - z)
        return (
            max(1, math.ceil(self.width / scale)),
            max(1, math.ceil(self.height / scale)),
        )

    def grid_dimensions(self, z: int) -> tuple[int, int]:
        """Number of (cols, rows) of tiles at zoom level ``z``."""
        w, h = self.level_dimensions(z)
        return math.ceil(w / self.tile_size), math.ceil(h / self.tile_size)

    def tile_count(self) -> int:
        total = 0
        for z in self.zoom_range():
            cols, rows = self.grid_dimensions(z)
            total += cols * rows
        return total


def compute_max_zoom(width: int, height: int, tile_size: int = TILE_SIZE) -> int:
    """Smallest max-zoom such that the native image fits the tile grid."""
    longest = max(width, height)
    if longest <= tile_size:
        return 0
    return math.ceil(math.log2(longest / tile_size))


def plan_pyramid(
        width: int,
        height: int,
        *,
        tile_size: int = TILE_SIZE,
        min_zoom: int = 0,
        max_zoom: int | None = None,
) -> PyramidSpec:
    if width <= 0 or height <= 0:
        raise ValueError(f"invalid source dimensions: {width}x{height}")
    if max_zoom is None:
        max_zoom = compute_max_zoom(width, height, tile_size)
    if not (0 <= min_zoom <= max_zoom):
        raise ValueError(f"bad zoom range: min={min_zoom} max={max_zoom}")
    return PyramidSpec(width, height, tile_size, min_zoom, max_zoom)


def generate_tiles(
        source: Image.Image,
        spec: PyramidSpec,
        *,
        resample: int = Image.LANCZOS,
        skip_blank: bool = True,
) -> Iterator[Tile]:
    """Yield every tile in the pyramid, lazily.

    Partial edge tiles are padded with transparency to a full ``tile_size``
    square. When ``skip_blank`` is set, fully transparent tiles are dropped so
    sparse / non-rectangular maps don't waste storage.
    """
    src = source.convert("RGBA")
    ts = spec.tile_size

    for z in spec.zoom_range():
        level_w, level_h = spec.level_dimensions(z)
        scale = 2 ** (spec.max_zoom - z)
        level_img = src if scale == 1 else src.resize((level_w, level_h), resample)
        cols, rows = spec.grid_dimensions(z)

        for ty in range(rows):
            for tx in range(cols):
                left, upper = tx * ts, ty * ts
                crop = level_img.crop(
                    (left, upper, min(left + ts, level_w), min(upper + ts, level_h))
                )
                if skip_blank and crop.getbbox() is None:
                    continue
                if crop.size == (ts, ts):
                    tile_img = crop
                else:  # pad partial edge tile onto a transparent square
                    tile_img = Image.new("RGBA", (ts, ts), (0, 0, 0, 0))
                    tile_img.paste(crop, (0, 0))
                yield Tile(z=z, x=tx, y=ty, image=tile_img)