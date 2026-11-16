#!/usr/bin/env python3
"""Report EGA ink colours by horizontal text run in a Gold Box screenshot.

This is a read-only diagnostic for fixed 640x400 GameLink screenshots.  It does
not infer a menu's meaning: it identifies visible label runs and their colour
histograms so a caller can distinguish selection highlighting from OCR guesses.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from PIL import Image


def load_cok_font(path: Path) -> bytes:
    """Load CoK's flat 8×8 glyph payload from 8X8D1.DAX block 201."""
    from dax_decode import decompress_block, parse_container

    source = path.read_bytes()
    data_base, blocks = parse_container(source)
    block = next((candidate for candidate in blocks if candidate.block_id == 201), None)
    if block is None:
        raise ValueError(f"CoK font block 201 not found in {path}")
    glyphs = decompress_block(source, data_base, block)
    if len(glyphs) < 64 * 8:
        raise ValueError(f"CoK font payload too small: {len(glyphs)} bytes")
    return glyphs


def decode_cok_label(image: Image.Image, start: int, end: int, top: int, glyphs: bytes) -> str | None:
    """Decode a 2× scaled EGA label using the retail folded 8×8 CoK font."""
    cell_start = (start // 16) * 16
    cell_end = ((end + 15) // 16) * 16
    letters: list[str] = []
    for x0 in range(cell_start, cell_end, 16):
        pixels: list[int] = []
        for glyph_y in range(8):
            row = 0
            for glyph_x in range(8):
                ink = any(
                    image.getpixel((x0 + glyph_x * 2 + dx, top + glyph_y * 2 + dy)) != (0, 0, 0)
                    for dx in range(2) for dy in range(2)
                )
                if ink:
                    row |= 1 << (7 - glyph_x)
            pixels.append(row)
        scores = [sum((actual ^ expected).bit_count() for actual, expected in zip(pixels, glyphs[slot * 8 : slot * 8 + 8])) for slot in range(64)]
        score = min(scores)
        if score:
            return None
        slot = scores.index(score)
        letters.append(chr(slot if slot >= 32 else slot + 64))
    return "".join(letters).rstrip()


def parse_int(value: str) -> int:
    return int(value, 0)


def detect_cok_profile(result_runs: list[dict[str, object]]) -> str | None:
    """Classify a fixed CoK command-row geometry without trusting OCR text."""
    # The first seven rows are combat rows at y=370; the latter three are
    # post-combat/campaign rows captured at y=384.  All are intentionally
    # geometry-only: a selected label is solid white and therefore cannot be
    # decoded from the folded font payload.
    profiles = {
        "movement": ((0, 186), (208, 272), (290, 352), (372, 382), (404, 414), (432, 496)),
        "movement_active": ((0, 186), (208, 272), (290, 352), (372, 382), (404, 414)),
        "primary": ((0, 64), (82, 144), (162, 208), (226, 272), (290, 352), (370, 432)),
        "primary_short": ((0, 64), (82, 144), (162, 208), (226, 272), (290, 352)),
        "done": ((2, 80), (98, 176), (194, 256), (274, 336), (352, 432), (450, 512)),
        "done_short": ((0, 80), (98, 160), (178, 240), (258, 336), (354, 416)),
        "continue_battle": ((2, 128), (146, 240), (246, 250), (258, 304), (320, 352)),
        "treasure": ((0, 64), (82, 144), (162, 224), (242, 320), (338, 400)),
        "yes_no": ((0, 48), (66, 96)),
        "destination": ((0, 48), (66, 128), (146, 304), (322, 432), (450, 512), (530, 608)),
    }
    for profile_name, expected_runs in profiles.items():
        profile_runs = result_runs
        if profile_name == "movement_active" and len(result_runs) == 6:
            # The two digits in 10+ can be separated by six pixels, wider than
            # ordinary glyph spacing, so join only this known numeric counter.
            profile_runs = result_runs[:4] + [{**result_runs[4], "x": [result_runs[4]["x"][0], result_runs[5]["x"][1]]}]
        if len(profile_runs) != len(expected_runs):
            continue
        if profile_name == "movement_active":
            # MOVE LEFT is a decimal counter: 1..9 is one glyph, 10+ two glyphs.
            if (all(abs(run["x"][0] - expected[0]) <= 3 and abs(run["x"][1] - expected[1]) <= 3
                    for run, expected in zip(profile_runs[:4], expected_runs[:4])) and
                    abs(profile_runs[4]["x"][0] - 404) <= 3 and 414 <= profile_runs[4]["x"][1] <= 432):
                return profile_name
            continue
        if all(abs(run["x"][0] - expected[0]) <= 3 and abs(run["x"][1] - expected[1]) <= 3
               for run, expected in zip(profile_runs, expected_runs)):
            return profile_name
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--top", type=parse_int, default=370, help="inclusive pixel row (default: 370)")
    parser.add_argument("--bottom", type=parse_int, default=400, help="exclusive pixel row (default: 400)")
    parser.add_argument("--join-gap", type=parse_int, default=4,
                        help="maximum blank-column gap within one menu label (default: 4)")
    parser.add_argument("--expect-white", nargs=2, type=parse_int, metavar=("START", "END"),
                        help="fail unless a label spanning START..END is entirely white")
    parser.add_argument("--expect-white-tolerance", type=parse_int, default=0,
                        help="allowed per-edge pixel deviation for --expect-white (default: 0)")
    parser.add_argument("--expect-cok-combat", choices=("movement", "movement_active", "primary", "primary_short", "done", "done_short", "continue_battle", "treasure", "yes_no", "destination"),
                        help="fail unless the requested fixed CoK command-row geometry is present")
    parser.add_argument("--font", type=Path, help="retail CoK 8X8D1.DAX; decode labels from its 8×8 font")
    parser.add_argument("--glyph-top", type=parse_int, default=384,
                        help="screen y of the scaled text row used with --font (default: 384)")
    parser.add_argument("--expect-label", action="append", default=[], metavar="TEXT",
                        help="fail unless an exactly decoded retail-font label is present (repeatable; requires --font)")
    parser.add_argument("--expect-selected-index", type=parse_int,
                        help="fail unless exactly this zero-based menu label is entirely white")
    parser.add_argument("--output", type=Path, help="write JSON rather than stdout")
    args = parser.parse_args()

    image = Image.open(args.image).convert("RGB")
    width, height = image.size
    if not (0 <= args.top < args.bottom <= height):
        raise SystemExit(f"row range {args.top}..{args.bottom} outside image height {height}")

    # A column belongs to a label if it has any non-black pixel in the requested row band.
    active: list[bool] = []
    for x in range(width):
        active.append(any(image.getpixel((x, y)) != (0, 0, 0) for y in range(args.top, args.bottom)))

    runs: list[tuple[int, int]] = []
    start: int | None = None
    for x, has_ink in enumerate(active + [False]):
        if has_ink and start is None:
            start = x
        elif not has_ink and start is not None:
            # Ignore isolated frame/panel pixels; menu glyph runs are wider than one DOS pixel.
            if x - start >= 4:
                runs.append((start, x))
            start = None

    # Consecutive glyph runs are separated by two scaled pixels; menu labels by
    # at least sixteen. Join only the former into whole labels.
    labels: list[tuple[int, int]] = []
    for start, end in runs:
        if labels and start - labels[-1][1] <= args.join_gap:
            labels[-1] = (labels[-1][0], end)
        else:
            labels.append((start, end))

    result_runs: list[dict[str, object]] = []
    glyphs = load_cok_font(args.font) if args.font else None
    for start, end in labels:
        colours: Counter[str] = Counter()
        for x in range(start, end):
            for y in range(args.top, args.bottom):
                colour = image.getpixel((x, y))
                if colour != (0, 0, 0):
                    colours["#%02x%02x%02x" % colour] += 1
        non_black = sum(colours.values())
        white = colours["#ffffff"]
        result = {
            "x": [start, end],
            "colours": dict(colours.most_common()),
            "white_fraction": white / non_black if non_black else 0.0,
        }
        if glyphs is not None and args.glyph_top + 16 <= height:
            result["text"] = decode_cok_label(image, start, end, args.glyph_top, glyphs)
        result_runs.append(result)

    detected_profile = detect_cok_profile(result_runs)

    selected = [index for index, run in enumerate(result_runs) if run["white_fraction"] == 1.0]
    result = {"image": str(args.image), "size": [width, height], "rows": [args.top, args.bottom],
              "runs": result_runs, "cok_combat_profile": detected_profile, "selected_indices": selected}
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        if args.output.exists():
            raise SystemExit(f"refusing to overwrite output: {args.output}")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    white_ok = True
    if args.expect_white:
        expected_start, expected_end = args.expect_white
        white_ok = False
        for run in result_runs:
            start, end = run["x"]
            if (abs(start - expected_start) <= args.expect_white_tolerance and
                    abs(end - expected_end) <= args.expect_white_tolerance and
                    run["white_fraction"] == 1.0):
                white_ok = True
                break
    profile_ok = not args.expect_cok_combat or detected_profile == args.expect_cok_combat
    if not white_ok:
        expected_start, expected_end = args.expect_white
        raise SystemExit(
            f"no entirely-white label at x={expected_start}..{expected_end} "
            f"(tolerance {args.expect_white_tolerance}); inspect runs in output"
        )
    if not profile_ok:
        raise SystemExit(
            f"expected CoK {args.expect_cok_combat} combat menu, found {detected_profile or 'unknown'}; "
            "inspect runs in output"
        )
    if args.expect_label:
        if glyphs is None:
            raise SystemExit("--expect-label requires --font")
        decoded = {str(run.get("text")) for run in result_runs if run.get("text") is not None}
        missing = [label.upper() for label in args.expect_label if label.upper() not in decoded]
        if missing:
            raise SystemExit(f"missing decoded label(s): {', '.join(missing)}; found {sorted(decoded)}")
    if args.expect_selected_index is not None:
        if selected != [args.expect_selected_index]:
            raise SystemExit(f"expected only selected label index {args.expect_selected_index}, found {selected}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
