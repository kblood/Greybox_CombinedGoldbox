"""Exact raster checks shared by image-source registry importers."""

from __future__ import annotations

from PIL import Image


def exact_nearest_neighbor_render(image: Image.Image, native_rgb: bytes,
                                 width: int, height: int, scale: int = 4) -> bool:
    """Check every source-render pixel against the nearest-neighbor expansion of native RGB."""
    if width < 1 or height < 1 or scale < 1 or len(native_rgb) != width * height * 3:
        return False
    source = image.convert("RGB")
    if source.size != (width * scale, height * scale):
        return False
    decoded = Image.frombytes("RGB", (width, height), native_rgb)
    expected = decoded.resize((width * scale, height * scale), Image.Resampling.NEAREST)
    return source.tobytes() == expected.tobytes()
