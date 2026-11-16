"""T6-1: no-DOSBox model of DOS first-person encounter art (CPIC1.DAX -> GBIM overlay).

Pure Python, read-only on retail data and on native/src. Three pieces:

  (a) survey_cpic(): decode every CPIC1.DAX block of CoK / DoK and report the
      assumptions the planned CGB->CCFP route relies on (frame 0 standard, <=160x160,
      size histogram, colour-0 transparent pixel counts).
  (b) expected_rect() / composite(): the draw_gbim geometry (constants parsed from
      native/src/ccfp.asm text, not hard-coded) and a compositor into a 320x200 canvas.
  (c) gate_report(): textual facts about the two CCFP gates (load_gbim and
      draw_effect_setup both test graphics_alt_enabled), so a later change flips a pin
      deliberately.

Geometry is derived from READING the assembly, not from a run; a DOSBox frame is the
real arbiter.
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode as dd  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
CCFP_ASM = REPO_ROOT / "native" / "src" / "ccfp.asm"
GAMES = {"CoK": "Champions of Krynn", "DoK": "Death Knights of Krynn"}
EXPECTED_BLOCKS = {"CoK": 52, "DoK": 106}
GBIM_MAX = 160
SCREEN_W, SCREEN_H = 320, 200


# ---------------------------------------------------------------- (a) survey
def cpic_path(game: str, root: Path = REPO_ROOT) -> Path:
    return root / GAMES[game] / "CPIC1.DAX"


def decode_icon(raw: bytes):
    """Frame 0 as (w, h, indices bytes) or None if not a standard frame."""
    std = dd.parse_standard_frame(raw)
    if std is None:
        return None
    w, h, _x, _y = std
    pix = raw[dd.FRAME_HEADER:]
    idx = [0] * (w * h)
    rb = w // 2
    o = 0
    for y in range(h):
        for xb in range(rb):
            i = y * rb + xb
            b = pix[i] if i < len(pix) else 0
            idx[o] = b >> 4
            idx[o + 1] = b & 15
            o += 2
    dd._deroll_indices(idx, w, h)
    return w, h, bytes(idx)


def load_cpic(game: str, root: Path = REPO_ROOT):
    """Return {block_id: (w, h, indices) or None} in TOC order list of (id, icon)."""
    data = cpic_path(game, root).read_bytes()
    base, blocks = dd.parse_container(data)
    out = []
    for blk in blocks:
        raw = dd.decompress_block(data, base, blk)
        out.append((blk.block_id, decode_icon(raw)))
    return out


def survey_cpic(game: str, root: Path = REPO_ROOT) -> dict:
    blocks = load_cpic(game, root)
    sizes = Counter()
    non_standard, oversize, empty_transparent = [], [], []
    zero_counts = {}
    for bid, icon in blocks:
        if icon is None:
            non_standard.append(bid)
            continue
        w, h, idx = icon
        sizes[(w, h)] += 1
        if w > GBIM_MAX or h > GBIM_MAX:
            oversize.append(bid)
        z = idx.count(0)
        zero_counts[bid] = z
        if z == len(idx):
            empty_transparent.append(bid)
    n24 = sizes.get((24, 24), 0)
    return {
        "game": game,
        "blocks": len(blocks),
        "ids": sorted(b for b, _ in blocks),
        "non_standard": non_standard,
        "oversize": oversize,
        "all_transparent": empty_transparent,
        "sizes": dict(sorted(sizes.items())),
        "n_24x24": n24,
        "n_other": sum(sizes.values()) - n24,
        "zero_counts": zero_counts,
        "zero_total": sum(zero_counts.values()),
        "pixel_total": sum(w * h for (w, h), c in sizes.items() for _ in range(c)),
    }


# ----------------------------------------------------- source parsing helpers
def read_ccfp(path: Path = CCFP_ASM) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def routine_body(src: str, name: str) -> str:
    """Text from `name:` to the next column-0 global label (local .labels are indented)."""
    m = re.search(rf"^{re.escape(name)}:[^\n]*\n", src, re.M)
    if not m:
        raise KeyError(name)
    n = re.search(r"^[A-Za-z_][A-Za-z0-9_]*:", src[m.end():], re.M)
    end = m.end() + (n.start() if n else len(src) - m.end())
    return src[m.start():end]


def code_lines(body: str):
    for ln in body.splitlines():
        s = ln.split(";", 1)[0].strip()
        if s:
            yield s


def parse_geometry(src: str) -> dict:
    """Constants of draw_gbim: centre x, bottom y, near-distance threshold."""
    body = list(code_lines(routine_body(src, "draw_gbim")))
    consts = [int(m.group(1)) for ln in body
              if (m := re.match(r"mov\s+dx,\s*(\d+)$", ln))]
    near = [int(m.group(1)) for ln in body
            if (m := re.match(r"cmp\s+word\s+\[effect_setup_distance\],\s*(\d+)$", ln))]
    scale2 = any(re.match(r"mov\s+word\s+\[gbim_scale\],\s*2$", ln) for ln in body)
    ja = any(ln.startswith("ja ") and "scale_ready" in ln for ln in body)
    if len(consts) != 2 or len(near) != 1 or not scale2 or not ja:
        raise ValueError(f"draw_gbim shape changed: {consts} {near} {scale2} {ja}")
    return {"cx": consts[0], "bottom": consts[1], "near_max": near[0]}


# ------------------------------------------------------------ (b) compositor
def expected_rect(w: int, h: int, distance: int, geom: dict | None = None):
    """(x, y, scaled_w, scaled_h, scale) exactly as draw_gbim computes them."""
    g = geom or parse_geometry(read_ccfp())
    s = 2 if distance <= g["near_max"] else 1
    return g["cx"] - (w * s) // 2, g["bottom"] - h * s, w * s, h * s, s


def composite(canvas: bytearray, icon, distance: int, geom: dict | None = None):
    """Draw icon (w, h, indices) into a 320x200 palette-index canvas (colour 0 skipped)."""
    w, h, idx = icon
    x0, y0, sw, sh, s = expected_rect(w, h, distance, geom)
    for sy in range(h):
        for sx in range(w):
            c = idx[sy * w + sx]
            if c == 0:
                continue
            for ry in range(s):
                for rx in range(s):
                    x, y = x0 + sx * s + rx, y0 + sy * s + ry
                    if 0 <= x < SCREEN_W and 0 <= y < SCREEN_H:
                        canvas[y * SCREEN_W + x] = c
    return canvas


def blank_canvas(fill: int = 0) -> bytearray:
    return bytearray([fill]) * (SCREEN_W * SCREEN_H)


# --------------------------------------------------------------- (c) gates
def gate_report(src: str | None = None) -> dict:
    src = read_ccfp() if src is None else src
    dse = list(code_lines(routine_body(src, "draw_effect_setup")))
    lg = list(code_lines(routine_body(src, "load_gbim")))
    pat = re.compile(r"cmp\s+byte\s+\[(?:cs:)?graphics_alt_enabled\],\s*0$")
    return {
        "draw_effect_setup_tests_alt": sum(bool(pat.match(l)) for l in dse),
        "load_gbim_tests_alt": sum(bool(pat.match(l)) for l in lg),
        "load_gbim_tests_scene_overlay": sum(
            bool(re.match(r"cmp\s+byte\s+\[(?:cs:)?scene_overlay\],\s*0$", l)) for l in lg),
        "draw_effect_setup_checks_pic": any(
            l == "cmp ax, [gbim_block]" or re.match(r"cmp\s+ax,\s*\[gbim_block\]$", l)
            for l in dse),
    }


def main():
    for g in GAMES:
        if not cpic_path(g).is_file():
            print(g, "CPIC1.DAX absent")
            continue
        s = survey_cpic(g)
        print(g, {k: v for k, v in s.items() if k not in ("zero_counts", "ids")})
    print(parse_geometry(read_ccfp()), gate_report())


if __name__ == "__main__":
    main()
