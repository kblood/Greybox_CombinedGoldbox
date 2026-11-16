#!/usr/bin/env python3
"""C64 COMPIC / CHARPIC / variable-size PIC: inventory, and what is genuinely established.

STATUS: COMPIC is SOLVED (2026-08-14) -- pixel layout, frame shape and multi-unit composition;
see `decode_frame` / `compose_compic` and docs/engine/research/c64-compic-format.md sections 6
and 6.3. CHARPIC and the variable-size `PIC*` family are NOT solved and remain inventory-only.

The VIC-II blit routine was never located despite a real disassembly effort -- the format was
solved from the data instead, and the composition half from the DOS release used as an oracle
(a COMPIC's filename hex suffix IS the DOS block id, so `CPIC*.DAX` publishes the same monster's
width and height). The docs file records what the code searches tried and ruled out; keeping
that account matters, because two of the three earlier readings were confidently wrong.

What this module establishes, from bytes and cross-checked against two independent sources (the
MON monster-record file and the DOS release), is:

1. COMPIC (combat monster picture) files come in exactly three sizes, in EXACT linear proportion
   with NO header of any kind: body length (file length minus the 2-byte CBM load word) is
   162*n, or 162*n+1, for n in {1, 2, 4} -- i.e. bodies of 162/163, 324/325 or 648/649 bytes.
   Every one of 379 COMPIC files across all seven titles fits this with zero exceptions
   (`compic_size_class`, `test_every_compic_file_fits_the_proportional_formula`). "n" is called
   the size class below (1x / 2x / 4x).

2. A monster's own MON record predicts its COMPIC's size class -- and, as of 2026-08-14, its
   whole FRAME SHAPE. Codes 2 and 3 both mean "2 units", which looked like redundancy until the
   DOS oracle showed code 2 is the tall 24x48 frame and code 3 the wide 48x24 one (zero
   exceptions in 90 matched blocks). See `mon_frame_shape`. The size-class form below is kept
   because it is what the 269/272 accuracy figure was measured against.

   MON bodies are a fixed 480 bytes
   in Champions of Krynn, Death Knights of Krynn, Curse of the Azure Bonds, Secret of the Silver
   Blades and Gateway to the Savage Frontier (`MON_BODY_LEN`). Body byte 153 (absolute file
   offset 155), masked with `& 0x7F`, holds a small code -- 1, 2, 3, or 4 -- and
   `code -> {1: 1x, 2: 2x, 3: 2x, 4: 4x}` correctly predicts the COMPIC size class for 269 of 272
   monster/COMPIC pairs across those five titles (98.9%; `mon_predicted_compic_class`,
   `test_mon_byte_153_predicts_compic_class_for_the_five_relevant_titles`). This is a genuine,
   independent, code-free cross-check (it never reads a COMPIC file's own bytes to make the
   prediction) but it is NOT the same thing as having found the code that reads this field --
   see the docs file for exactly what was searched and why the consuming routine stayed
   unlocated.

   Pool of Radiance is EXCLUDED from that claim on purpose: its own byte 153 predicts correctly
   only 47 of 56 pairs (83.9%), well below the other five titles, and Buck Rogers cannot even be
   compared -- its MON bodies are 204 or 546 bytes, an entirely different record layout, not 480
   (`BUCK_ROGERS_MON_IS_A_DIFFERENT_LAYOUT`). Both exclusions are measured facts, not assumptions.

3. CHARPIC (the character-record screen's shared portrait frame) is a SINGLE file per title,
   always named `CHARPIC00` -- never per-character -- and its size is constant across six of the
   seven titles at exactly 2032 bytes; Buck Rogers alone ships a 5834-byte CHARPIC00
   (`CHARPIC_FIXED_SIZE`, `CHARPIC_BUCK_ROGERS_SIZE`). Its internal layout is UNLOCATED.

4. The remaining variable-size `PIC*` family (any PIC file that is not the solved 2681/2682-byte
   BIGPIC-equivalent decoded by `c64_pic.py`) stays UNLOCATED. One observation worth recording
   for whoever picks this up next: several small PIC files open with a short run of ascending
   bytes at ASCII 'A'/'B'/'C'/'D' (0x41-0x44) before falling to zeros -- e.g. Champions PIC17
   opens `41 42 43 42 41`, PIC3B opens `41 42 43 44` -- suggestive of frame/layer tags, but this
   was never traced to consuming code and is reported as an unconfirmed lead, not a finding.

5. (2026-08-11 pass) The pixel codec is STILL unsolved, but three specific hypotheses about
   *where* the consumer lives were tested and closed, and one origin claim was upgraded from
   weak to fact:
   - GDRIVE00's real residence is $C000 (`absolute_call_targets`, `gdrive_table_entries`,
     `GDRIVE00_TABLE_ENTRY_COUNT`) -- not the earlier scout handoff's weak "$4000?" guess. This
     also explains a call site the format doc's section 2.3 had flagged as unexplained: COM.PREP's
     `JSR $C063` is 3-byte-aligned inside GDRIVE00's own 35-entry dispatch table (entry 33, target
     $C26E) but lands 24 bytes PAST the end of GDRIVE01's own (25-entry, 75-byte) dispatch table --
     GDRIVE00, not GDRIVE01, is resident when COM.PREP makes that call.
   - GDRIVE00's own $C063 entry point was traced and is a monster/object on-screen POSITION
     tracker (writes X/Y placement bytes into 128-entry tables at $7A00/$7A80), not a picture
     blit -- this specific hypothesis is closed.
   - GDRIVE02's generic parameterised byte-copy primitive at $C006 has zero external callers
     across all eight $0800-resident overlays -- "COMPIC reuses GDRIVE02's copy loop with a
     smaller count" is closed.
   None of this locates the actual consumer. See the doc's dated section for the full account,
   including why a literal-string search for "COMPIC" fails (filenames are built from a resource
   catalog in ITEMNAMES, not embedded per-caller) and the concrete remaining blocker (a
   low-memory resident kernel, referenced by JSR targets in the $2E00-$3B70 range from at least
   three different overlays, is not among any of the ~600 PRG entries across CoK's six disk
   sides and was not located this round).

See docs/engine/research/c64-compic-format.md for the full disassembly narrative: which files
were read (GDRIVE00's dispatch table, GDRIVE01's 25-entry jump table and its row-table
subroutines, GDRIVE02 -- confirmed to be the BIGPIC blit ONLY, reused by COMBAT for the terrain
background and not for monster icons), what searches were run, and what is left to try.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disasm as _disasm  # noqa: E402
import c64_disk as c64  # noqa: E402

# ---------------------------------------------------------------------------------------------
# COMPIC: the proportional size formula (established; see module docstring point 1)
# ---------------------------------------------------------------------------------------------

COMPIC_UNIT = 162          # bytes per size-class unit, with NO header
COMPIC_CLASSES = (1, 2, 4)  # the only size classes ever observed


def compic_size_class(file_len: int) -> int | None:
    """The size class (1, 2 or 4) a COMPIC file's total length (incl. 2-byte load word) implies.

    Returns None if the length does not fit ANY class exactly (a real "this isn't a COMPIC, or
    the formula is wrong" signal -- every file in the seven-title corpus fits).
    """
    body = file_len - 2
    for n in COMPIC_CLASSES:
        base = COMPIC_UNIT * n
        if body in (base, base + 1):
            return n
    return None


# ---------------------------------------------------------------------------------------------
# COMPIC: the unit pixel layout (SOLVED 2026-08-14 -- see c64-compic-format.md section 6)
# ---------------------------------------------------------------------------------------------
#
# A 162-byte unit is TWO animation frames of one 3x3-cell multicolour sprite plus a colour
# map per frame:
#
#     body[  0: 72]  frame A glyphs   9 cells x 8 bytes  -> 24 x 24 px
#     body[ 72:144]  frame B glyphs   9 cells x 8 bytes
#     body[144:153]  frame A colour   1 byte per cell
#     body[153:162]  frame B colour   1 byte per cell
#
# This is what the measured structure was pointing at all along: lag 72 scores far above a
# closed-form permutation null in EVERY size class (3.37x at n=1, 2.60x at n=2, 5.68x at n=4)
# while lag 72n sits at or below null (0.77x, 0.90x). So 72 is the invariant frame length and a
# larger file is a SEQUENCE of 162-byte units -- not one larger frame. The two blocks measure as
# "planes of the same picture" (0.415 within-file vs 0.156 cross-file) because they are two
# poses of the same creature.
#
# Confirmed by rendering: recognisable Gold Box combat sprites (a coiled serpent, a striding
# lizard, a soldier drawing a bow), each in two poses.
#
# How multiple units compose is ALSO settled (2026-08-14), by the DOS release used as an
# oracle: a C64 COMPIC's filename hex suffix is the DOS block id, so CPIC*.DAX holds the SAME
# monster picture, already decodable, at a known width and height. Matching 112 C64 files to
# their DOS blocks gives the frame shape directly:
#
#     MON byte-153 code 1 -> 1 unit  -> DOS 24x24
#     MON byte-153 code 2 -> 2 units -> DOS 24x48   (tall)      36/36 blocks
#     MON byte-153 code 3 -> 2 units -> DOS 48x24   (wide)      42/42 blocks
#     MON byte-153 code 4 -> 4 units -> DOS 48x48              22/22 blocks
#
# ZERO exceptions in 90 matched n>1 blocks. So byte 153 is not merely a size class -- it is a
# SHAPE code, and codes 2 and 3 (which both mean "2 units") are exactly the tall/wide split.
#
# The units then fill the frame COLUMN BY COLUMN, RIGHT TO LEFT, top-to-bottom within a column:
#
#     24x48 tall   unit 0 on top,  unit 1 below
#     48x24 wide   unit 1 on left, unit 0 on right
#     48x48        TL=unit 2  TR=unit 0
#                  BL=unit 3  BR=unit 1
#
# One rule fits all three shapes. Measured against the DOS ink masks, with a cross-file pairing
# as the null (see the doc for the full table):
#
#     48x24  order (1,0) wins 51/54 files, mean agreement 0.743 vs null 0.627
#     24x48  order (0,1) wins 32/36 files, mean agreement 0.706 vs null 0.615
#     48x48  bottom row (BL=3, BR=1) wins 18/18 distinct pictures, mean margin +0.299
#            top row    (TL=2, TR=0) wins 12/18, mean margin +0.223
#
# The 48x48 top row is the weakest leg and is reported as such: it is not unanimous. It is still
# the right reading, because every informative case agrees with it -- sorted by margin, the ten
# largest margins are all positive (+0.22..+0.76) and all six disagreements are near zero
# (-0.141..-0.013), i.e. smaller than the sixth-largest agreement. A wrong rule would produce
# large negative margins somewhere; none exist.
#
# Frame A of every unit belongs to one pose and frame B to the other, matching the DOS pair of
# blocks N and N|0x80.

CELLS_PER_FRAME = 9         # 3 x 3 character cells
CELL_BYTES = 8              # one 8x8 glyph, 1 byte per pixel row
FRAME_GLYPH_BYTES = CELLS_PER_FRAME * CELL_BYTES   # 72
FRAMES_PER_UNIT = 2
FRAME_COLS = 3
FRAME_ROWS = 3

# byte offsets within one 162-byte unit
FRAME_A_GLYPHS = (0, 72)
FRAME_B_GLYPHS = (72, 144)
FRAME_A_COLOUR = (144, 153)
FRAME_B_COLOUR = (153, 162)


def compic_units(body: bytes) -> list[bytes]:
    """Split a COMPIC body into its 162-byte units (drops a trailing odd byte if present)."""
    return [body[i * COMPIC_UNIT:(i + 1) * COMPIC_UNIT]
            for i in range(len(body) // COMPIC_UNIT)]


def unit_frames(unit: bytes) -> list[tuple[bytes, bytes]]:
    """The two (glyph_bytes, colour_bytes) frames of one 162-byte unit."""
    if len(unit) < COMPIC_UNIT:
        raise ValueError(f"unit is {len(unit)} bytes, need {COMPIC_UNIT}")
    return [
        (unit[FRAME_A_GLYPHS[0]:FRAME_A_GLYPHS[1]], unit[FRAME_A_COLOUR[0]:FRAME_A_COLOUR[1]]),
        (unit[FRAME_B_GLYPHS[0]:FRAME_B_GLYPHS[1]], unit[FRAME_B_COLOUR[0]:FRAME_B_COLOUR[1]]),
    ]


def decode_frame(glyphs: bytes, colour: bytes, background: int = 0) -> list[list[int]]:
    """One frame -> a 24x24 grid of C64 palette indices.

    Multicolour character mode: each byte is four 2-bit pairs, each pair covering two pixels.
    Pair 00 is the background, 01 takes the colour byte's high nibble, 10 and 11 take its low
    nibble. Multicolour mode is settled corpus-wide for this material (commit 2782e22).
    """
    rows = [[background] * (FRAME_COLS * 8) for _ in range(FRAME_ROWS * 8)]
    for cy in range(FRAME_ROWS):
        for cx in range(FRAME_COLS):
            i = cy * FRAME_COLS + cx
            glyph = glyphs[i * CELL_BYTES:(i + 1) * CELL_BYTES]
            lo, hi = colour[i] & 0x0F, (colour[i] >> 4) & 0x0F
            for ry, bits in enumerate(glyph):
                for p in range(4):
                    pair = (bits >> (6 - 2 * p)) & 0b11
                    idx = background if pair == 0 else (hi if pair == 1 else lo)
                    for d in range(2):
                        rows[cy * 8 + ry][cx * 8 + p * 2 + d] = idx
    return rows


def decode_compic(body: bytes, background: int = 0) -> list[list[list[int]]]:
    """Every frame in a COMPIC body, in file order: 2 frames per 162-byte unit."""
    out = []
    for unit in compic_units(body):
        for glyphs, colour in unit_frames(unit):
            out.append(decode_frame(glyphs, colour, background))
    return out


# The composed frame shape, keyed by the MON byte-153 shape code. Each value is
# (grid_cols, grid_rows, unit_order) where unit_order lists the unit index for each grid slot
# in raster order. The single rule behind all four: columns right-to-left, top-to-bottom
# within a column.
_SHAPE_BY_MON_CODE = {
    1: (1, 1, (0,)),
    2: (1, 2, (0, 1)),          # tall  24x48
    3: (2, 1, (1, 0)),          # wide  48x24
    4: (2, 2, (2, 0, 3, 1)),    #       48x48
}

# (unit_count, tall) -> the MON shape code meaning the same thing, for callers that have no MON
# record. `tall` only matters at 2 units, where it is the only thing separating codes 2 and 3.
# This maps to a CODE rather than duplicating the shape, so `_SHAPE_BY_MON_CODE` stays the single
# definition of the layout and the two accessors cannot drift apart.
_UNITS_TO_MON_CODE = {
    (1, False): 1, (1, True): 1,
    (2, True): 2, (2, False): 3,
    (4, False): 4, (4, True): 4,
}


def mon_frame_shape(mon_body: bytes) -> tuple[int, int, tuple[int, ...]] | None:
    """(grid_cols, grid_rows, unit_order) for a monster, from its own 480-byte MON body.

    Byte 153 is a shape code, not just a size class: codes 2 and 3 both mean "2 units" but
    select the tall (24x48) and wide (48x24) frame respectively. Returns None for a body that
    is too short or carries a code outside 1..4.
    """
    if len(mon_body) <= MON_SIZE_BYTE_OFFSET:
        return None
    return _SHAPE_BY_MON_CODE.get(mon_body[MON_SIZE_BYTE_OFFSET] & 0x7F)


def frame_shape(unit_count: int, tall: bool = False) -> tuple[int, int, tuple[int, ...]]:
    """(grid_cols, grid_rows, unit_order) from a unit count, without needing the MON record.

    `tall` only matters at 2 units, where it picks 24x48 over 48x24; prefer `mon_frame_shape`
    when the monster's MON record is available, since that resolves it from the data.
    """
    code = _UNITS_TO_MON_CODE.get((unit_count, bool(tall)))
    if code is None:
        raise ValueError(f"no COMPIC frame shape for {unit_count} unit(s)")
    return _SHAPE_BY_MON_CODE[code]


def compose_compic(body: bytes, shape: tuple[int, int, tuple[int, ...]],
                   pose: int = 0, background: int = 0) -> list[list[int]]:
    """A COMPIC body's units composed into one picture, as a grid of C64 palette indices.

    `shape` comes from `mon_frame_shape` or `frame_shape`. `pose` picks frame A (0) or B (1)
    of every unit -- the two poses correspond to the DOS pair of blocks N and N|0x80.
    """
    if pose not in (0, 1):
        raise ValueError(f"pose must be 0 or 1, got {pose}")
    cols, rows, order = shape
    units = compic_units(body)
    if len(units) < len(order):
        raise ValueError(f"body has {len(units)} unit(s), shape needs {len(order)}")
    tiles = [decode_frame(*unit_frames(units[i])[pose], background=background) for i in order]
    side = FRAME_COLS * 8
    out = [[background] * (cols * side) for _ in range(rows * side)]
    for slot, tile in enumerate(tiles):
        ox, oy = (slot % cols) * side, (slot // cols) * side
        for y in range(side):
            out[oy + y][ox:ox + side] = tile[y]
    return out


# ---------------------------------------------------------------------------------------------
# MON records: the byte-153 size-class predictor (established for 5 titles; see point 2)
# ---------------------------------------------------------------------------------------------

MON_BODY_LEN = 480          # fixed MON body length in the five titles this predictor covers
MON_SIZE_BYTE_OFFSET = 153  # offset into the 480-byte body (absolute file offset 155)

# code (byte153 & 0x7F) -> predicted COMPIC size class
_MON_CODE_TO_CLASS = {1: 1, 2: 2, 3: 2, 4: 4}

# Titles where the predictor was measured to hold (>=98% of pairs; see the doc for the exact
# per-title counts). Pool of Radiance and Buck Rogers are deliberately absent -- see point 2.
MON_PREDICTOR_TITLES = (
    "Champions of Krynn",
    "Death Knights of Krynn",
    "Curse of the Azure Bonds",
    "Secret of the Silver Blades",
    "Gateway to the Savage Frontier",
)

# Titles whose MON body is not 480 bytes at all -- a different record layout, not a failed
# prediction. Buck Rogers uses 204 (small monsters) or 546 (large) bytes; two Pool of Radiance
# monsters also use 546.
BUCK_ROGERS_MON_IS_A_DIFFERENT_LAYOUT = "Buck Rogers - Countdown to Doomsday"


def mon_predicted_compic_class(mon_body: bytes) -> int | None:
    """Predict a monster's COMPIC size class from its own 480-byte MON body, byte 153 only.

    Returns None if the body is too short, or if the byte's low-7-bit code is not one of the
    four ever observed (1/2/3/4).
    """
    if len(mon_body) <= MON_SIZE_BYTE_OFFSET:
        return None
    code = mon_body[MON_SIZE_BYTE_OFFSET] & 0x7F
    return _MON_CODE_TO_CLASS.get(code)


# ---------------------------------------------------------------------------------------------
# CHARPIC: constant-size, single-id fact (established; see point 3)
# ---------------------------------------------------------------------------------------------

CHARPIC_FIXED_SIZE = 2032          # six of seven titles
CHARPIC_BUCK_ROGERS_SIZE = 5834    # Buck Rogers alone


# ---------------------------------------------------------------------------------------------
# Consumer-identification: real 6502 disassembly facts (2026-08-11 pass)
#
# These do NOT decode pixels. They pin, as reproducible/testable facts, what a fresh disassembly
# pass found and ruled out while hunting for COMPIC's consumer -- see the dated section in
# docs/engine/research/c64-compic-format.md for the full narrative. Every function here operates
# on a file's BODY (the 2-byte CBM load-address prefix already stripped), matching how
# tools/c64_disasm.py's own SIZE/OPCODES tables are used elsewhere in this project.
# ---------------------------------------------------------------------------------------------


def _linear_decode(data: bytes):
    """Yield (offset, mnemonic, mode, operand_bytes) for a linear (non-branch-following) decode.

    Unrecognised opcodes are skipped one byte at a time (matching c64_disasm.py's own `.byte`
    fallback), so a wrong origin degrades into a low hit-rate rather than a plausible fiction --
    same rationale as tools/c64_disasm.py's own module docstring.
    """
    pc = 0
    n = len(data)
    while pc < n:
        op = data[pc]
        if op not in _disasm.OPCODES:
            pc += 1
            continue
        mnem, mode = _disasm.OPCODES[op]
        size = _disasm.SIZE[mode]
        if pc + size > n:
            break
        yield pc, mnem, mode, data[pc + 1 : pc + size]
        pc += size


def absolute_call_targets(data: bytes, org: int, lo: int, hi: int) -> list[tuple[int, str, int]]:
    """(address, 'JSR'/'JMP', target) for every absolute-mode JSR/JMP whose target is in [lo, hi).

    Used to find which overlay's dispatch table a caller is really invoking, the same technique
    that pinned GDRIVE01 as GDRIVE02's mutually-exclusive co-occupant of $C000 in the earlier
    fixed-size-picture work. `data` is a file body at assumed origin `org`.
    """
    hits: list[tuple[int, str, int]] = []
    for pc, mnem, mode, opnd in _linear_decode(data):
        if mnem in ("JSR", "JMP") and mode == _disasm.ABS:
            target = opnd[0] | (opnd[1] << 8)
            if lo <= target < hi:
                hits.append((org + pc, mnem, target))
    return hits


def gdrive_table_entries(data: bytes, max_entries: int) -> list[int]:
    """Read sequential 3-byte `JMP $xxxx` entries starting at file offset 0, stopping at the
    first byte that is not the JMP-absolute opcode ($4C). Returns the list of JMP targets.

    This is how GDRIVE00's and GDRIVE01's own front-matter dispatch tables are structured (see
    the doc): a real vector table is a gapless run of `4C lo hi` triples, and real code or data
    always follows once the table ends -- so "where does the $4C run stop" IS the table length,
    derived from the bytes rather than assumed. Deliberately does NOT attempt to decode
    non-$4C bytes as instructions (see `_linear_decode`'s docstring for why a generic opcode
    walk is a poor test here: $00/BRK is a legal 1-byte opcode, so a naive walk "decodes"
    through almost any byte run, including pure data).
    """
    entries: list[int] = []
    for i in range(max_entries):
        off = i * 3
        if off + 3 > len(data) or data[off] != JMP_ABS_OPCODE:
            break
        entries.append(data[off + 1] | (data[off + 2] << 8))
    return entries


JMP_ABS_OPCODE = 0x4C

# GDRIVE00's real residence is $C000 (not the scout handoff's weak "$4000?" guess): its own
# vector table is 35 sequential 3-byte JMP entries filling exactly this span -- see
# test_gdrive00_jump_table_is_35_clean_jmp_entries and the doc's 2026-08-11 section for the
# corroborating cross-file call-site evidence. Re-derived by `gdrive_table_entries`, not assumed.
GDRIVE00_TABLE_ENTRY_COUNT = 35


# ---------------------------------------------------------------------------------------------
# Inventory helpers
# ---------------------------------------------------------------------------------------------

_TRAILING_HEX = re.compile(r"[0-9A-F]{1,2}$")


def family_of(name: str) -> str:
    """Strip a trailing 1-2 digit hex id, e.g. 'COMPIC0B' -> 'COMPIC', 'CHARSET' -> 'CHARSET'."""
    return _TRAILING_HEX.sub("", name)


def title_files(title_dir: Path) -> dict[str, bytes]:
    """Every readable closed PRG across all sides of one title's disk set (first side wins)."""
    out: dict[str, bytes] = {}
    for img in sorted(title_dir.glob("*.[Dd]64")) + sorted(title_dir.glob("*.[Gg]64")):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type != "PRG" or not e.closed:
                continue
            data, problem = c64.read_file_checked(disk, e)
            if problem:
                continue
            out.setdefault(e.name, data)
    return out


def compic_mon_pairs(files: dict[str, bytes]) -> dict[str, tuple[int, bytes]]:
    """{hex id -> (COMPIC file length, MON 480-byte body)} for every id present in both families.

    Only MON records whose body is exactly MON_BODY_LEN are included -- a title using a different
    record layout (Buck Rogers, and Pool of Radiance's two 546-byte outliers) simply contributes
    no pairs for those ids, rather than a wrong comparison.
    """
    compic_len: dict[str, int] = {}
    mon_body: dict[str, bytes] = {}
    for name, data in files.items():
        fam = family_of(name)
        hexid = name[len(fam):]
        if fam == "COMPIC":
            compic_len.setdefault(hexid, len(data))
        elif fam == "MON":
            body = data[2:]
            if len(body) == MON_BODY_LEN:
                mon_body.setdefault(hexid, body)
    return {i: (compic_len[i], mon_body[i]) for i in compic_len.keys() & mon_body.keys()}


def predictor_accuracy(files: dict[str, bytes]) -> tuple[int, int, list[str]]:
    """(matched, total, mismatched_ids) of the MON-byte-153 predictor against real COMPIC sizes."""
    matched = 0
    mismatched: list[str] = []
    pairs = compic_mon_pairs(files)
    for hexid, (compic_len, mon_body) in pairs.items():
        actual = compic_size_class(compic_len)
        predicted = mon_predicted_compic_class(mon_body)
        if predicted == actual:
            matched += 1
        else:
            mismatched.append(hexid)
    return matched, len(pairs), sorted(mismatched)


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("title_dir", type=Path, help="a title's C64 disk-set directory")
    a = ap.parse_args(argv)

    files = title_files(a.title_dir)
    compics = [(n, len(d)) for n, d in files.items() if family_of(n) == "COMPIC"]
    unclassified = [(n, ln) for n, ln in compics if compic_size_class(ln) is None]
    print(f"{a.title_dir.name}: {len(compics)} COMPIC files, "
          f"{len(unclassified)} do not fit the proportional formula")
    for n, ln in unclassified:
        print(f"  {n}: {ln} bytes")

    charpics = [(n, len(d)) for n, d in files.items() if family_of(n) == "CHARPIC"]
    for n, ln in charpics:
        flag = "" if ln in (CHARPIC_FIXED_SIZE, CHARPIC_BUCK_ROGERS_SIZE) else "  ** unexpected size **"
        print(f"  {n}: {ln} bytes{flag}")

    matched, total, mismatched = predictor_accuracy(files)
    if total:
        pct = 100.0 * matched / total
        print(f"  MON byte-153 predictor: {matched}/{total} ({pct:.1f}%); "
              f"mismatched ids: {mismatched}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
