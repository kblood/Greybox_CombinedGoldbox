"""Full-screen DAX title blocks must render un-wrapped (pixel data starts at byte 17).

Regression for renders/dax/DoK_TITLE/TITLE_001.png: that PNG was produced before commit
1b8ad592 (FRAME_HEADER 8 -> 17), so pixel data was read 9 bytes (18 px) early and the whole
frame was shifted sideways, with right-edge pixels (the (R) marks, the ends of 'INC.' and
'Dragons') wrapped onto the left margin. These tests drive the real CLI (`dax_decode.py`),
so they exercise the header_len the renderer actually passes, not just the constant.
"""
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "dax_decode.py"
TITLES = [("Champions of Krynn", "CoK"), ("Death Knights of Krynn", "DoK")]


def _render(game, tmp_path):
    src = ROOT / game / "TITLE.DAX"
    if not src.exists():
        pytest.skip(f"{src} not present")
    subprocess.run([sys.executable, str(TOOL), str(src), "--out", str(tmp_path), "--scale", "1"],
                   check=True, capture_output=True)
    from PIL import Image
    return Image.open(tmp_path / "TITLE_001.png").convert("RGB")


@pytest.mark.parametrize("game,tag", TITLES)
def test_title_block1_not_wrapped(game, tag, tmp_path):
    pytest.importorskip("PIL")
    im = _render(game, tmp_path)
    assert im.size == (320, 200)
    px = im.load()
    bg = px[0, 100]
    # Below the SSI bar the 8 left and 4 right columns are pure background. A rolled
    # frame drags right-edge glyphs ((R), 's', '.') onto the left margin.
    for y in range(48, 200):
        for x in list(range(0, 8)) + list(range(316, 320)):
            assert px[x, y] == bg, f"{tag} TITLE_001 edge pixel ({x},{y}) is not background"
    # Left/right border columns agree on every row (a clean, correctly framed image).
    assert all(px[0, y] == px[319, y] for y in range(200))


def test_dok_title_ssi_bar_centered(tmp_path):
    pytest.importorskip("PIL")
    im = _render("Death Knights of Krynn", tmp_path)
    px = im.load()
    # Red SSI bar row (y~35): the logo's gray/white mark sits around x=130..220 in the correct
    # frame; shifted 18 px it would straddle 150..240.
    xs = [x for x in range(320) for y in range(4, 28) if px[x, y] not in (px[0, 100],)]
    assert xs, "no logo pixels found"
    centre = (min(xs) + max(xs)) / 2
    assert 150 <= centre <= 170, f"SSI logo centre x={centre}, expected ~160"
