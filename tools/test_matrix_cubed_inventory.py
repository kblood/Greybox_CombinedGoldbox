"""Inventory tests for the Buck Rogers: Matrix Cubed extraction (R6, round 30).

Matrix Cubed is the capability ledger's one genuine gap (`tools/goldbox_corpus.py`'s `PROFILES`
carries it with `manifest: None`) because its only known-held copy sits inside the read-only
`D:/Games/Emulator/DOS/Goldbox/buckrogers2_dos_win.7z` bundle and nothing in `tools/` had ever
extracted it. `tools/matrix_cubed_extract.py` performs that one-time extraction into the
git-ignored `matrixcubed_extracted/` (see `.gitignore:5`'s `*_extracted/` rule; the same
convention as `daxdump_extracted/`, `hackdocs_extracted/`, `amiga_extracted/`). This file pins
what that extraction actually contains, so a later change to the extractor or a corrupted/partial
re-extraction is caught rather than silently trusted.

Every number pinned below was measured on the extracted bytes, not assumed:
  - file/folder/`.DAX` counts: `python tools/matrix_cubed_extract.py` manifest output.
  - the offset-chain-closes and container/member counts: `tools/dax_inspect.py`'s own
    `parse_toc`/`verify` on all 27 `.DAX` files.
  - `GAME.OVR`'s magic: read directly. It is **`FBOV`**, not `TPOV` -- this CORRECTS the round
    30 plan's prediction (`docs/engine/PLAN-ROUND-30.md`'s R6 section predicted TPOV "since
    Countdown's is TPOV"; Matrix Cubed's own bytes disagree with its sibling title).
  - decoded frame/complex totals per picture archive: `tools/dax_decode.py`'s own block
    classification (`parse_vga_chunky_items` / `parse_vga_compressed_picture` /
    `parse_standard_frame` / `parse_tile_strip`, in that same preference order the tool's own
    `main()` uses) run over every block of all 19 graphics-bearing `.DAX` files. This is also the
    evidence for the `dos-ega` -> `dos-vga` correction in `profiles.ts`: not one block across the
    whole picture corpus decodes as a plain EGA 4bpp `frame`.

Skips (does not fail) when the extraction directory is absent -- this is external, never-vendored
source material, exactly like the `D:` Amiga/C64 sources and the GOG Galaxy installs.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import dax_decode
import dax_inspect

REPO_ROOT = TOOLS.parent
EXTRACT_ROOT = REPO_ROOT / "matrixcubed_extracted"
MATRIX_DIR = EXTRACT_ROOT / "BuckRogers2" / "c" / "Matrix"
SENTINEL = MATRIX_DIR / "MATRIX.CFG"

# Measured via `python tools/matrix_cubed_extract.py` (7z.exe CLI fallback -- py7zr 1.1.0 cannot
# extract this archive: it uses a BCJ2 filter py7zr does not implement, so the fallback path is
# not merely defensive here, it is the one that actually ran).
EXPECTED_TOTAL_FILES = 58
EXPECTED_DAX_NAMES = sorted([
    "8X8D0.DAX", "8X8D1.DAX", "BACK1.DAX", "BIGPIC1.DAX", "BORDERS.DAX", "CHARS.DAX",
    "COMSPR.DAX", "CPIC1.DAX", "CURSOR.DAX", "ECL1.DAX", "GEO1.DAX", "HITEK.DAX", "ITEM0.DAX",
    "LOTEK.DAX", "MARSCOM.DAX", "MON0CHA.DAX", "MON0ITM.DAX", "MON0SPC.DAX", "MUSIC.DAX",
    "PIC1.DAX", "PIC7.DAX", "PIC8.DAX", "SHIPS.DAX", "SPRIT1.DAX", "TITLE.DAX", "VENUSCOM.DAX",
    "WALLDEF1.DAX",
])

# Measured with `dax_inspect.parse_toc` + `dax_inspect.verify` on every file above: entry counts
# per container, summed. All 27 chains close exactly on EOF (asserted separately, per-file).
EXPECTED_TOTAL_MEMBERS = 611
EXPECTED_MEMBERS_PER_FILE = {
    "8X8D0.DAX": 1, "8X8D1.DAX": 13, "BACK1.DAX": 20, "BIGPIC1.DAX": 6, "BORDERS.DAX": 1,
    "CHARS.DAX": 72, "COMSPR.DAX": 50, "CPIC1.DAX": 108, "CURSOR.DAX": 1, "ECL1.DAX": 33,
    "GEO1.DAX": 25, "HITEK.DAX": 1, "ITEM0.DAX": 1, "LOTEK.DAX": 1, "MARSCOM.DAX": 1,
    "MON0CHA.DAX": 63, "MON0ITM.DAX": 42, "MON0SPC.DAX": 35, "MUSIC.DAX": 9, "PIC1.DAX": 46,
    "PIC7.DAX": 1, "PIC8.DAX": 1, "SHIPS.DAX": 41, "SPRIT1.DAX": 23, "TITLE.DAX": 4,
    "VENUSCOM.DAX": 1, "WALLDEF1.DAX": 11,
}

# The 19 files dax_decode.py's own classifier accepts as pictures (the same 8 categories
# Countdown's manifest catalogs as decode:true: title/scenes/backdrops/portraits/tiles/sprites/
# ui). ECL1/GEO1/WALLDEF1/MON0CHA/MON0ITM/MON0SPC/ITEM0/MUSIC are data blocks, cataloged with
# decode:false in Countdown's own manifest and left undecoded here for the same reason.
PICTURE_FILES = [
    "TITLE", "BIGPIC1", "PIC1", "PIC7", "PIC8", "SPRIT1", "BACK1", "BORDERS", "CHARS", "COMSPR",
    "CPIC1", "CURSOR", "HITEK", "LOTEK", "MARSCOM", "VENUSCOM", "8X8D0", "8X8D1", "SHIPS",
]

# Measured by classifying every block of every PICTURE_FILES archive the same way
# `dax_decode.py main()` does (chunky-items, then compressed-picture, then standard frame, then
# tile-strip; whatever is left is "complex/unsupported"). ZERO blocks anywhere in this corpus
# classify as a plain EGA 4bpp `frame` -- every single one is `vga-chunky-items` or
# `vga-compressed-picture`, both embedded-6-bit-DAC-palette VGA formats.
EXPECTED_STANDARD_FRAMES = {
    "TITLE": 4, "BIGPIC1": 6, "PIC1": 102, "PIC7": 1, "PIC8": 1, "SPRIT1": 69, "BACK1": 20,
    "BORDERS": 12, "CHARS": 72, "COMSPR": 50, "CPIC1": 108, "CURSOR": 1, "HITEK": 53,
    "LOTEK": 52, "MARSCOM": 42, "VENUSCOM": 44, "8X8D0": 95, "8X8D1": 2836, "SHIPS": 35,
}
EXPECTED_COMPLEX_UNSUPPORTED = {
    # 8X8D1 block 201: the Gen1 text-glyph font block (same 2048-byte 1bpp shape as Countdown's
    # own 8X8D1#201 -- COK_FONT_BLOCK's sibling), which this simple classifier (unlike the TS
    # engine's dedicated font loader) does not attempt.
    "8X8D1": 1,
    # SHIPS ids 40/41/42/43/44/50: 108-byte non-picture ship-stat records -- the SAME shape and
    # even the SAME six ids Countdown's own SHIPS.DAX manifest note describes ("41 blocks: 35
    # render as art, and 6 (#40..#44, #50) are 108-byte data records").
    "SHIPS": 6,
}
EXPECTED_TOTAL_STANDARD_FRAMES = sum(EXPECTED_STANDARD_FRAMES.values())  # 3603
EXPECTED_TOTAL_COMPLEX = sum(EXPECTED_COMPLEX_UNSUPPORTED.values())  # 7

EXPECTED_GAME_OVR_MAGIC = b"FBOV"


def _classify_dax_file(path: Path) -> tuple[int, int]:
    """(standard_frame_count, complex_unsupported_count) using dax_decode.py's own classifier."""
    data = path.read_bytes()
    data_base, blocks = dax_decode.parse_container(data)
    standard = complex_ = 0
    for blk in blocks:
        raw = dax_decode.decompress_block(data, data_base, blk)
        chunky = dax_decode.parse_vga_chunky_items(raw)
        compressed = None if chunky else dax_decode.parse_vga_compressed_picture(raw)
        fr = None if chunky or compressed else dax_decode.parse_standard_frame(raw)
        if chunky:
            standard += chunky["count"]
        elif compressed:
            standard += len(compressed["frames"])
        elif fr:
            standard += 1
        else:
            strip = dax_decode.parse_tile_strip(raw)
            if strip:
                standard += 1
            else:
                complex_ += 1
    return standard, complex_


def _shared_buck_basenames() -> set[str]:
    """The `shared_buck` literal from `test_goldbox_corpus.py`'s CFG-discriminator test.

    Read from that file's own source rather than duplicated by hand, so this test cannot drift
    from the set it is supposed to be checking a superset of.
    """
    source = (TOOLS / "test_goldbox_corpus.py").read_text(encoding="utf-8")
    m = re.search(r"shared_buck = \{(.+?)\}", source, re.DOTALL)
    if not m:
        raise AssertionError("test_goldbox_corpus.py no longer defines a `shared_buck` set")
    names = re.findall(r'"([^"]+)"', m.group(1))
    if not names:
        raise AssertionError("shared_buck literal parsed empty")
    return set(names)


@unittest.skipUnless(SENTINEL.exists(), "Matrix Cubed extraction not present; run "
                      "tools/matrix_cubed_extract.py first (needs the read-only D:\\ source)")
class MatrixCubedInventoryTests(unittest.TestCase):
    def test_extracted_file_count(self) -> None:
        files = [p for p in EXTRACT_ROOT.rglob("*") if p.is_file()]
        self.assertEqual(len(files), EXPECTED_TOTAL_FILES)

    def test_dax_names(self) -> None:
        names = sorted(p.name for p in MATRIX_DIR.glob("*.DAX"))
        self.assertEqual(names, EXPECTED_DAX_NAMES)

    def test_every_dax_offset_chain_closes_on_eof(self) -> None:
        problems = {}
        total_members = 0
        for name in EXPECTED_DAX_NAMES:
            data = (MATRIX_DIR / name).read_bytes()
            data_base, entries = dax_inspect.parse_toc(data)
            issues = dax_inspect.verify(data, data_base, entries)
            if issues:
                problems[name] = issues
            self.assertEqual(len(entries), EXPECTED_MEMBERS_PER_FILE[name], name)
            total_members += len(entries)
        self.assertEqual(problems, {}, f"offset chain did not close cleanly: {problems}")
        self.assertEqual(total_members, EXPECTED_TOTAL_MEMBERS)

    def test_game_ovr_magic_is_fbov_not_tpov(self) -> None:
        """Corrects the round 30 plan's TPOV prediction -- Matrix Cubed's own GAME.OVR is FBOV."""
        data = (MATRIX_DIR / "GAME.OVR").read_bytes()
        self.assertEqual(data[:4], EXPECTED_GAME_OVR_MAGIC)
        self.assertNotEqual(data[:4], b"TPOV")

    def test_picture_archives_decode_to_the_pinned_frame_totals(self) -> None:
        standard_totals = {}
        complex_totals = {}
        for stem in PICTURE_FILES:
            standard, complex_ = _classify_dax_file(MATRIX_DIR / f"{stem}.DAX")
            standard_totals[stem] = standard
            complex_totals[stem] = complex_
        self.assertEqual(standard_totals, EXPECTED_STANDARD_FRAMES)
        self.assertEqual(
            {k: v for k, v in complex_totals.items() if v},
            EXPECTED_COMPLEX_UNSUPPORTED,
        )
        self.assertEqual(sum(standard_totals.values()), EXPECTED_TOTAL_STANDARD_FRAMES)
        self.assertEqual(sum(complex_totals.values()), EXPECTED_TOTAL_COMPLEX)

    def test_no_picture_block_decodes_as_plain_ega_frame(self) -> None:
        """The detection-claim evidence: dax_decode's classifier never falls through to a plain
        `parse_standard_frame`/`parse_tile_strip` hit anywhere in this corpus -- every block is
        one of the two embedded-palette VGA shapes, or unclassified. If this ever goes false, the
        `dos-vga` correction in `profiles.ts` needs revisiting, not just this test."""
        for stem in PICTURE_FILES:
            data = (MATRIX_DIR / f"{stem}.DAX").read_bytes()
            data_base, blocks = dax_decode.parse_container(data)
            for blk in blocks:
                raw = dax_decode.decompress_block(data, data_base, blk)
                chunky = dax_decode.parse_vga_chunky_items(raw)
                compressed = None if chunky else dax_decode.parse_vga_compressed_picture(raw)
                if chunky or compressed:
                    continue
                fr = dax_decode.parse_standard_frame(raw)
                self.assertIsNone(
                    fr, f"{stem}.DAX block {blk.block_id} decoded as a plain EGA frame "
                        "-- the dos-vga claim needs re-checking",
                )

    def test_countdowns_shared_buck_basenames_are_a_subset_of_what_was_extracted(self) -> None:
        shared_buck = _shared_buck_basenames()
        extracted = {p.name.upper() for p in MATRIX_DIR.glob("*")}
        missing = {name for name in shared_buck if name.upper() not in extracted}
        self.assertEqual(
            missing, set(),
            "test_goldbox_corpus.py's shared_buck set names files this extraction does not have",
        )

    def test_matrix_only_config_and_music_markers_present(self) -> None:
        """The Matrix-only half of the same discriminator (MATRIX.CFG + the three BUCK?.XMI
        tracks + TANDY.ADV), matching `profiles.ts`'s own `buck-rogers-matrix-cubed` markers."""
        extracted = {p.name.upper() for p in MATRIX_DIR.glob("*")}
        for name in ("MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "TANDY.ADV"):
            self.assertIn(name, extracted)


if __name__ == "__main__":
    unittest.main()
