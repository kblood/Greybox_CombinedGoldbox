"""T6-2/T6-3 helper: compare a CCFPVIEW.RAW / _GBVIEW.RAW frame with the model.

  python tools/encounter_art_compare.py icon  BASE.RAW OUT.RAW GAME BLOCK DIST
  python tools/encounter_art_compare.py marker BASE.RAW OUT.RAW

`icon`  : OUT must equal BASE with the retail CPIC1 block composited by the model
          (exit 0, prints "MATCH ..."); otherwise exit 1 with the mismatch count.
`marker`: OUT must differ from BASE by the colour-12 approach box (>= 500 pixels).
Pure Python, read-only.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import encounter_art_model as m  # noqa: E402

PIXELS = m.SCREEN_W * m.SCREEN_H


def read_raw(path: str):
    b = Path(path).read_bytes()
    if len(b) != 4 + PIXELS + 768 or int.from_bytes(b[0:2], "little") != 320 \
            or int.from_bytes(b[2:4], "little") != 200:
        raise SystemExit(f"bad RAW {path}: len {len(b)}")
    return bytearray(b[4:4 + PIXELS]), b[4 + PIXELS:]


def diff_count(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)


def main(argv):
    mode = argv[1]
    base, _ = read_raw(argv[2])
    out, _ = read_raw(argv[3])
    if mode == "icon":
        game, bid, dist = argv[4], int(argv[5]), int(argv[6])
        icon = dict(m.load_cpic(game))[bid]
        exp = m.composite(bytearray(base), icon, dist)
        painted = diff_count(base, exp)
        bad = diff_count(exp, out)
        red = sum(1 for v in out if v == 12) - sum(1 for v in base if v == 12)
        print(f"icon block={bid} dist={dist} model_painted={painted} mismatches={bad} red_extra={red}")
        if painted < 50:
            print("FAIL: model painted too few pixels to be a meaningful oracle")
            return 1
        if bad:
            print("FAIL: frame differs from model composite")
            return 1
        print("MATCH")
        return 0
    if mode == "rect":
        # GBBOOT route: `base` is the same route rendered WITHOUT CPIC1 (marker
        # frame).  Every opaque model pixel must be exact in `out`; everything
        # outside the icon rect and the marker rect must equal the marker frame.
        game, bid, dist = argv[4], int(argv[5]), int(argv[6])
        icon = dict(m.load_cpic(game))[bid]
        x0, y0, sw, sh, s = m.expected_rect(icon[0], icon[1], dist)
        canvas = m.composite(m.blank_canvas(), icon, dist)
        opaque = [i for i, v in enumerate(canvas) if v]
        wrong = sum(1 for i in opaque if out[i] != canvas[i])
        reds_out = sum(1 for v in out if v == 12)
        reds_base = sum(1 for v in base if v == 12)
        # marker box geometry per draw_effect_setup: w=max(8,28-4d), h=w+8, centre 92, bottom 132-12d
        d = min(dist, 5)
        mw = max(8, 28 - 4 * d)
        mx0, my0, mx1, my1 = 92 - mw // 2, 132 - 12 * d - (mw + 8), 92 - mw // 2 + mw, 132 - 12 * d
        outside = 0
        for i in range(PIXELS):
            x, y = i % 320, i // 320
            in_icon = x0 <= x < x0 + sw and y0 <= y < y0 + sh
            in_mark = mx0 - 1 <= x <= mx1 and my0 - 1 <= y <= my1
            if not in_icon and not in_mark and out[i] != base[i]:
                outside += 1
        print(f"rect block={bid} dist={dist} opaque={len(opaque)} wrong={wrong} "
              f"outside_diff={outside} red_icon_run={reds_out} red_marker_run={reds_base}")
        if len(opaque) < 50 or wrong or outside or reds_base - reds_out < 400:
            print("FAIL")
            return 1
        print("MATCH")
        return 0
    if mode == "marker":
        red = sum(1 for v in out if v == 12) - sum(1 for v in base if v == 12)
        print(f"marker red_extra={red}")
        return 0 if red >= 500 else 1
    if mode == "same":
        n = diff_count(base, out)
        print(f"same diff={n}")
        return 0 if n == 0 else 1
    raise SystemExit("mode")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
