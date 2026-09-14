#!/usr/bin/env python3
"""Crop the poster out of Instagram-reel screenshots and name them by style.

    python3 scripts/crop-style-screenshots.py <dir-with-screenshots> [--out DIR] [--order name|mtime]

Screenshots are sorted (iPhone numbers them in capture order) and mapped 1:1
onto scripts/style-templates.json. Each poster is found as the sharp region
inside the blurred reel background, written to <out>/<slug>.jpg, and a labelled
contact sheet (<out>/contact-sheet.jpg) is produced so the mapping can be
eyeballed before seeding. Add "crop": [x0, y0, x1, y1] (fractions of the
screenshot) to a style entry to override the auto-crop.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = Path(__file__).resolve().parent
STYLES = json.loads((HERE / "style-templates.json").read_text())
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".heic"}


def sharp_bbox(im: Image.Image):
    """Bounding box of the sharp poster inside the reel's blurred backdrop."""
    g = im.convert("L")
    w, h = g.size
    e = np.asarray(g.filter(ImageFilter.FIND_EDGES), dtype=np.float32)
    # Search window: below the "Reels / Friends" header, above the caption
    # card, left of the like/comment column.
    y0, y1 = int(h * 0.105), int(h * 0.555)
    x0, x1 = int(w * 0.03), int(w * 0.88)
    win = e[y0:y1, x0:x1]
    rows = win.mean(axis=1)
    cols = win.mean(axis=0)

    def smooth(a, k=9):
        return np.convolve(a, np.ones(k) / k, mode="same")

    def span(a):
        a = smooth(a)
        base = np.percentile(a, 10)
        thr = base + 0.16 * (a.max() - base)
        idx = np.where(a > thr)[0]
        if len(idx) == 0:
            return 0, len(a)
        return int(idx[0]), int(idx[-1]) + 1

    ry0, ry1 = span(rows)
    cx0, cx1 = span(cols)
    # The smoothing window pads each edge by a few px; pull back inside the paper.
    inset = 4
    return (x0 + cx0 + inset, y0 + ry0 + inset, x0 + cx1 - inset, y0 + ry1 - inset)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1]).expanduser()
    out = Path(sys.argv[sys.argv.index("--out") + 1]).expanduser() if "--out" in sys.argv else src / "cropped"
    order = sys.argv[sys.argv.index("--order") + 1] if "--order" in sys.argv else "name"
    out.mkdir(parents=True, exist_ok=True)

    files = [p for p in src.iterdir() if p.suffix.lower() in EXTS and not p.name.startswith(".")]
    files.sort(key=(lambda p: p.stat().st_mtime) if order == "mtime" else (lambda p: p.name.lower()))
    if len(files) != len(STYLES):
        print(f"WARNING: {len(files)} screenshots but {len(STYLES)} styles; mapping the first {min(len(files), len(STYLES))}.")

    tiles = []
    for style, p in zip(STYLES, files):
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        w, h = im.size
        if "crop" in style:
            fx0, fy0, fx1, fy1 = style["crop"]
            box = (int(fx0 * w), int(fy0 * h), int(fx1 * w), int(fy1 * h))
        else:
            box = sharp_bbox(im)
        poster = im.crop(box)
        dest = out / f"{style['slug']}.jpg"
        poster.save(dest, "JPEG", quality=92, optimize=True)
        print(f"{style['slug']:24s} ← {p.name:20s} crop={box} {poster.size[0]}x{poster.size[1]}")
        tiles.append((style["name"], poster))

    # Contact sheet: 5 across, labelled, for a quick visual check.
    if tiles:
        tw, th, cols = 240, 300, 5
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * (th + 28)), (28, 26, 24))
        d = ImageDraw.Draw(sheet)
        for i, (name, poster) in enumerate(tiles):
            thumb = ImageOps.contain(poster, (tw - 12, th - 12))
            x = (i % cols) * tw + (tw - thumb.width) // 2
            y = (i // cols) * (th + 28) + 6
            sheet.paste(thumb, (x, y))
            d.text(((i % cols) * tw + 8, (i // cols) * (th + 28) + th + 6), f"{i + 1}. {name}", fill=(242, 238, 230))
        sheet.save(out / "contact-sheet.jpg", "JPEG", quality=85)
        print(f"\nWrote {len(tiles)} posters + contact-sheet.jpg to {out}")


if __name__ == "__main__":
    main()
