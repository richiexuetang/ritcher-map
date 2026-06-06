"""Local CLI: tile an image to disk or S3.

    python -m tiler.cli tile world.png --prefix elden-ring/overworld --out ./tiles
    python -m tiler.cli tile world.png --prefix elden-ring/overworld --s3 my-bucket --base-url https://cdn.example.com/tiles
"""
from __future__ import annotations

import argparse
import sys

from .storage import LocalTileStore, S3TileStore
from .tiles import tile_image


def _progress(written: int, total: int) -> None:
    pct = 100 * written / total if total else 100
    print(f"\r  tiling… {written}/{total} ({pct:5.1f}%)", end="", flush=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tiler")
    sub = parser.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("tile", help="tile a source image into a pyramid")
    t.add_argument("image", help="path to the source map image")
    t.add_argument("--prefix", required=True, help="key namespace, e.g. elden-ring/overworld")
    t.add_argument("--out", help="local output directory")
    t.add_argument("--s3", metavar="BUCKET", help="S3 bucket name (instead of --out)")
    t.add_argument("--base-url", help="CDN base URL recorded in the manifest")
    t.add_argument("--format", default="webp", choices=["webp", "png"])
    t.add_argument("--quality", type=int, default=85)
    t.add_argument("--tile-size", type=int, default=256)
    t.add_argument("--min-zoom", type=int, default=0)
    t.add_argument("--max-zoom", type=int, default=None)
    t.add_argument("--keep-blank", action="store_true", help="store fully transparent tiles too")

    args = parser.parse_args(argv)

    if bool(args.out) == bool(args.s3):
        parser.error("provide exactly one of --out or --s3")
    store = S3TileStore(args.s3) if args.s3 else LocalTileStore(args.out)

    result = tile_image(
        args.image,
        store,
        args.prefix,
        tile_size=args.tile_size,
        min_zoom=args.min_zoom,
        max_zoom=args.max_zoom,
        fmt=args.format,
        quality=args.quality,
        skip_blank=not args.keep_blank,
        on_progress=_progress,
    )
    print()  # newline after progress bar
    print(
        f"done: {result.tiles_written} tiles written, {result.tiles_skipped} blank skipped, "
        f"z{result.min_zoom}-{result.max_zoom}, {result.duration_s}s"
    )
    if args.base_url:
        print("tile URL template:", result.tile_url_template(args.base_url))
    return 0


if __name__ == "__main__":
    sys.exit(main())