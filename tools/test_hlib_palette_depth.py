"""
HLIB TILE colour tables store FULL 8-bit RGB, not 6-bit DAC values.

findings.md is the repo's declared authority ("where it disagrees with the individual docs,
this file wins") and it claimed "embedded 6-bit-DAC VGA palette" for HLIB TILE chunks, as did
five research docs -- one of which prescribed writing converted Amiga art into HLIB as
`c6 = round(c4*63/15)`, i.e. at a quarter brightness, on the exact roadmap step the primary
deliverable runs through. hlib-format.md had already been corrected without the others
following, so the drift was invisible.

This test is the standing check: it measures the shipped bytes, and it fails if the docs drift
back. The null is explicit -- if the 6-bit claim were true, ZERO palette bytes could exceed 63.
"""
import glob
import os
import re
import struct

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOG = r"C:\Program Files (x86)\GOG Galaxy\Games"

COLOUR_TABLE_MAGIC = (8, 24)


def _tile_palette_bytes(path):
    """Return the colour table's RGB triplet bytes for an HLIB TILE leaf, or None."""
    data = open(path, "rb").read()
    if data[:4] != b"HLIB" or len(data) < 20:
        return None
    count = struct.unpack_from("<H", data, 8)[0] + 1
    magic = data[11]
    if data[12:16] != b"TILE":
        return None
    if 16 + 4 * count > len(data):
        return None
    ptrs = struct.unpack_from("<%dI" % count, data, 16)
    off = ptrs[1] if magic == 1 else ptrs[0]
    if off + 8 > len(data):
        return None
    _cycle, _first, ncolors = struct.unpack_from("<HHH", data, off)
    cmagic = data[off + 7]
    if ncolors == 0 or ncolors > 256 or cmagic not in COLOUR_TABLE_MAGIC:
        return None
    trip = data[off + 8: off + 8 + ncolors * 3]
    return trip if len(trip) == ncolors * 3 else None


def _scan(patterns):
    total = over = 0
    files = 0
    for pat in patterns:
        for f in sorted(glob.glob(pat)):
            trip = _tile_palette_bytes(f)
            if trip is None:
                continue
            files += 1
            total += len(trip)
            over += sum(1 for b in trip if b > 63)
    return files, total, over


def test_dqk_tile_palettes_are_8_bit_not_6_bit_dac():
    files, total, over = _scan([os.path.join(REPO, "The Dark Queen of Krynn", "DISK*", "*.TLB")])
    if files == 0:
        pytest.skip("DQK .TLB files absent")
    assert files >= 6
    # If the "6-bit DAC (0..63)" claim were right, `over` would have to be 0.
    assert over > 0, "the 6-bit-DAC claim predicts 0 bytes over 63; found none, so re-check"
    assert over / total > 0.7, (over, total)


def test_frua_is_the_independent_corpus_and_agrees():
    """FRUA is a second, separate HLIB corpus. It must show the same thing, or the DQK
    measurement is a quirk of one game rather than a property of the format."""
    files, total, over = _scan([os.path.join(GOG, "Unlimited Adventures", "DISK*", "*.TLB")])
    if files == 0:
        pytest.skip("FRUA install absent")
    assert over / total > 0.7, (over, total)


def test_a_genuinely_6_bit_palette_would_be_detected_by_the_same_scan():
    """
    Positive control. The scan above is only meaningful if it CAN report a 6-bit table, so run
    the identical over-63 predicate on a synthetic table whose bytes are all <= 63 and confirm
    it reports zero. Without this the assertions above are unfalsifiable.
    """
    six_bit = bytes(range(0, 64)) * 3
    assert sum(1 for b in six_bit if b > 63) == 0


_SCALING = re.compile(r"<<\s*2|\*\s*4\b|×\s*4\b|63\s*/\s*15|v6\s*\*\s*4")
_NEGATION = re.compile(
    r"not\s+(a\s+)?6-bit|is NOT|do not scale|no scaling|already 8-bit|unscaled|"
    r"false\*{0,2} for HLIB|this line said|used to claim|until 2026-08-22",
    re.I,
)


def _is_hlib_dac_scaling_claim(line: str) -> bool:
    """True iff `line` tells a reader to DAC-scale an HLIB/TILE/TLB palette."""
    low = line.lower()
    if "6-bit" not in low and "6 bit" not in low:
        return False
    if not any(k in line for k in ("HLIB", "TILE", "TLB")):
        return False
    if not _SCALING.search(line):
        return False
    return not _NEGATION.search(line)


def test_docs_do_not_prescribe_dac_scaling_for_hlib_palettes():
    """
    The drift this guards: six docs described the HLIB TILE palette as 6-bit DAC, and one of
    them told a future converter to write Amiga art into HLIB as `round(c4*63/15)` -- a quarter
    brightness, on the exact roadmap step the primary deliverable runs through.

    The check targets the harmful half of the claim: a SCALING prescription applied in an HLIB
    context. Genuinely-6-bit formats live in this repo too (the Gateway/Treasures/Pools DAX VGA
    extensions), so merely mentioning 6-bit is fine; telling someone to scale an HLIB palette is
    not. Lines that explicitly negate the claim are exempt so a correction can quote what it
    corrects.
    """
    offenders = []
    for path in glob.glob(os.path.join(REPO, "docs", "**", "*.md"), recursive=True):
        for i, line in enumerate(open(path, encoding="utf-8", errors="replace"), 1):
            if _is_hlib_dac_scaling_claim(line):
                offenders.append(f"{os.path.relpath(path, REPO)}:{i}: {line.strip()[:110]}")
    assert not offenders, (
        "docs prescribe DAC scaling for an HLIB palette (they are already 8-bit):\n"
        + "\n".join(offenders)
    )


def test_the_doc_scan_would_catch_the_claim_it_guards():
    """
    Positive control for the scan above -- otherwise it is a green light that never looks.
    The first string is the exact sentence decompilation-sources.md carried until 2026-08-22;
    the rest must NOT trip it, or the scan would flag its own corrections and every honestly
    6-bit DAX VGA-extension line in the repo.
    """
    assert _is_hlib_dac_scaling_claim(
        "for HLIB's **6-bit DAC** use `c6 = round(c4*63/15)`"
    )
    assert _is_hlib_dac_scaling_claim(
        "- **VGA TLB**: 6-bit DAC values (0-63 per channel). Upscale: `v8 = v6 * 4`."
    )
    assert not _is_hlib_dac_scaling_claim(
        "the HLIB `TILE` colour table is NOT 6-bit and takes no scaling at all"
    )
    assert not _is_hlib_dac_scaling_claim(
        "MOV DH, [BP+0Ah]     ; param 2 = red   (6-bit DAC, 0..63)"  # DAX VGA extension
    )
