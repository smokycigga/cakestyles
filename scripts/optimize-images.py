"""Shrink the storefront images that live in client/public/images.

These files ship straight from `public/`, so Vite copies them byte for byte and
nothing ever resizes them: the gallery was handing phones a 730 KB JPEG for a
thumbnail. This re-encodes the images in place — same folder, same filename,
same extension, so no reference anywhere (source, seed data or database) has to
change.

A file is only rewritten when the result is at least 10% smaller, so images that
were already compressed properly are left untouched.

The hero film and its poster are not touched here: `gallery/hero-poster.webp`
must be the film's own first frame, so it is generated from the video rather
than from a still:

    ffmpeg -i "gallery/Create_a_premium_cinematic_bak (1).mp4" \\
           -frames:v 1 frame0.png
    # then save frame0.png as gallery/hero-poster.webp (quality ~72)

Run from the repo root:

    python scripts/optimize-images.py            # report only
    python scripts/optimize-images.py --write    # rewrite the files
"""

import io
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "client", "public", "images")

# Longest edge each folder is actually rendered at. Anything larger is wasted
# bytes: the product cards are ~320 CSS px, the gallery is ~400 px, and the
# menu thumbnails are 130 px.
MAX_EDGE = {
    "products": 800,
    "gallery": 900,
    "menu-items": 260,
    "": 1200,
}

JPEG_QUALITY = 82
WEBP_QUALITY = 78
MIN_SAVING = 0.10

# Handled by the ffmpeg step in the module docstring, never re-encoded here.
DERIVED = {"hero-poster.webp"}


def target_edge(path):
    folder = os.path.dirname(os.path.relpath(path, ROOT))
    return MAX_EDGE.get(folder, MAX_EDGE[""])


def encode(image, fmt):
    buffer = io.BytesIO()
    if fmt == "JPEG":
        image.save(buffer, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True, subsampling=2)
    elif fmt == "WEBP":
        image.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
    elif fmt == "PNG":
        image.save(buffer, "PNG", optimize=True)
    else:
        return None
    return buffer.getvalue()


def shrink(path, write):
    before = os.path.getsize(path)
    edge = target_edge(path)

    with Image.open(path) as source:
        source.load()
        fmt = (source.format or "").upper()

        image = source
        if max(image.size) > edge:
            ratio = edge / max(image.size)
            image = image.resize((round(image.size[0] * ratio), round(image.size[1] * ratio)), Image.LANCZOS)

        if fmt == "JPEG":
            image = image.convert("RGB")
        elif fmt == "WEBP":
            image = image if image.mode in ("RGB", "RGBA") else image.convert("RGBA")
        elif fmt == "PNG":
            # Photographic PNGs are the worst case for the web; a 256-colour
            # palette is visually identical at thumbnail size and far smaller.
            image = image.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE)
        else:
            return None

        data = encode(image, fmt)

    if not data:
        return None

    after = len(data)
    if after >= before * (1 - MIN_SAVING):
        return before, before, False

    if write:
        with open(path, "wb") as handle:
            handle.write(data)
        after = os.path.getsize(path)

    return before, after, True


def main():
    write = "--write" in sys.argv
    total_before = total_after = 0

    for folder, _, files in os.walk(ROOT):
        for name in sorted(files):
            if not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                continue
            if name in DERIVED:
                continue
            path = os.path.join(folder, name)
            result = shrink(path, write)
            if not result:
                continue
            before, after, changed = result
            total_before += before
            total_after += after
            flag = "" if changed else "  (already optimal)"
            print(f"{before / 1024:7.0f} KB -> {after / 1024:6.0f} KB  {os.path.relpath(path, ROOT)}{flag}")

    print(f"\ntotal {total_before / 1024 / 1024:.2f} MB -> {total_after / 1024 / 1024:.2f} MB"
          f"  ({'written' if write else 'dry run'})")


if __name__ == "__main__":
    main()
