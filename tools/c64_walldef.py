#!/usr/bin/env python3
"""c64_walldef.py -- crack the C64 WALLDEF format using the DOS `WALLDEF*.DAX` shape as a
STRUCTURAL ORACLE.

Companion to `tools/c64_wallset.py` (WALLSET glyph-bank side, sibling-owned; not imported
here on purpose -- see the module note below) and `tools/dax_decode.py` (DOS DAX container +
RLE, imported here as the oracle decoder). Full writeup:
`docs/engine/research/c64-walldef-format.md`.

THE ORACLE. `packages/engine/src/loaders/walldef.ts` documents the DOS shape precisely: a
decompressed `WALLDEF*.DAX` block is one or more fixed **780-byte records**, each a
`byte[5][156]` grid -- 5 wall-graphic "slot" rows x a flat 156-column pool of per-screen-piece
tile runs (`docs/engine/research/firstperson-wall-geometry-cok.md` S3: the 156 columns are 10
named on-screen pieces of sizes {2,4,4,12,16,16,56,22,22,2}, summing to 156). Entries `< 0x2D`
are reserved (0=none, 1=border); entries `>= 0x2D` are real 8x8-tile ids. Death Knights of
Krynn's five `WALLDEF{1..5}.DAX` files hold exactly the ids **{1,2,3,4,5,6,7}**, one DAX block
each, and EVERY block decodes to EXACTLY 3 records (2340 bytes) -- a constant DOS shape across
all 7 ids, matching DoK's 7 C64 `WALLDEF0{1..7}` ids 1:1 (the same clean pairing already
established for `WALLSET`/`WALLDEF` container ids in `c64_wallset.py`). This makes DoK the
title to test predictions against first, per the task brief.

RESULT THIS ROUND: the C64 body is decisively **not** a byte-for-byte or shape-for-shape replay
of the DOS grid (S1). Two brand-new, cross-title-reproducible byte-value facts are established
(S2): a hard void at byte values 0x21-0x3F, and two big frequency spikes at 0x40/0x42, plus the
already-known 0xF0 spike is shown to be a genuine frequency outlier (not just a per-title
ceiling) in a title where the "ceiling" itself does not apply. Three concrete follow-on
hypotheses were tested and **refuted** (S3): a `0x40`-based glyph-index reading (numerically
tempting for DoK's 192-glyph vocabulary, but it does not survive the CoK cross-check -- rule
"BOTH TITLES, ALWAYS"), a control-byte/data-run RLE reading, and a parity-interleaved two-stream
reading. WALLDEF remains genuinely uncracked; S4 states the sharpest untried next hypothesis.

Deliberately does NOT import `tools/c64_wallset.py` (a sibling owns that file this round and is
actively editing it) -- this module reads C64 disks directly via `tools/c64_disk.py`, which is
the shared, stable primitive both files build on.

ROUND 6 (2026-08-13): attacked the byte codec directly with round 5's own named next move (the
`0xF0`-escape-with-operand scheme), the exact-177 pile-up, and a generalisation of the S4
shared-37-byte-prefix lead. All three functions groups live in the "Round 6" section below; full
narrative in `docs/engine/research/c64-walldef-format.md` S6/S7. Headline: the escape+count
reading is real for a well-nulled MINORITY of `0xF0` occurrences (12x-22x a histogram-preserving
shuffle null) but REFUTED as a uniform rule (a naive escape-walk overruns real bodies MORE often
than its own null in 5 of 6 titles); the 177 pile-up is now EXPLAINED for 150-/192-glyph areas
(a trivial density effect) and narrowed (not solved) for the 50-glyph majority; and 37 turns out
NOT to be an exceptional shared-prefix length once checked against all 7 titles -- Curse of the
Azure Bonds shares 155 bytes, Buck Rogers shares 67 bytes across a genuine 3-way group, and
Gateway has three ids that are full 1232-byte byte-identical duplicates.

ROUND 8 (2026-08-13): the ESCAPE TAXONOMY. Round 7 measured the "gap==4" (width 4) record shape
corpus-wide but left 80.6% of the 5971 pooled non-final escapes unexamined; this round sweeps the
whole width spectrum. Headline: **width 4 is NOT the only structured escape class, and it is not
even the commonest** -- width 3 is (1426 records vs 1161). All 15 headline (width, slot) cells
over widths 2-8 carry a payload slot whose values cluster in a narrow band at 2.25x-7.13x their
own slot-permutation null, in 6 of 6 titles, with the bands chosen by leave-one-title-out so no
per-title figure is fitted to its own bytes. The two cleanest are single-VALUE fields with empty
neighbours on both sides: width-5 slot 0 and width-7 slot 2 are the literal byte `0x02` in 381/420
and 234/259 pooled records. Separately, the byte after the escape is a record-KIND tag: a one-rule
modal classifier trained on five titles predicts a held-out title's escape width 46.6%-57.4% of
the time against a 14.7%-19.0% pairing-permutation null, and `op1 == 0xB1` introduces a width-4
record in 145 of 145 pooled escapes across all six titles. Functions: `escape_widths`/
`escape_width_histogram`, `escape_records`/`title_escape_records`, `payload_class_purity`,
`slot_band_count`, `slot_permutation_null[_expectation]`, `best_band_for_slot`,
`escape_op1_width_pairs`, `op1_width_modal_map`/`op1_width_modal_accuracy`/
`op1_width_pairing_null`/`op1_width_crosstab`. Narrative and every number: the doc S9.
"""
from __future__ import annotations

import argparse
import collections
import sys
from pathlib import Path
from typing import NamedTuple, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import c64_disk as c64  # noqa: E402
from dax_decode import parse_container, decompress_block  # noqa: E402

# --------------------------------------------------------------------------------------
# DOS WALLDEF oracle (re-derives the shape documented in packages/engine/src/loaders/walldef.ts,
# via the existing dax_decode.py container/RLE reader -- no new DOS decoding logic here).
# --------------------------------------------------------------------------------------

DOS_RECORD_SIZE = 780
DOS_SLICES = 5
DOS_COLUMNS = 156
DOS_TILE_MIN = 0x2D

# The 10 on-screen wall pieces' tile-block sizes (colCount * rowCount), in draw order, from
# COAB's idxOffset/colCount/rowCount tables -- see firstperson-wall-geometry-cok.md S3. They
# sum to exactly DOS_COLUMNS (156). Exposed as a candidate boundary set for C64 gap-length
# correlation tests (S4's ruled-out attempt; kept here so a future round can re-run it without
# re-deriving the numbers).
DOS_PIECE_SIZES = [2, 4, 4, 12, 16, 16, 56, 22, 22, 2]
assert sum(DOS_PIECE_SIZES) == DOS_COLUMNS


class DosWalldefBlock(NamedTuple):
    """One decoded DOS WALLDEF DAX block (== one wall-style id)."""

    block_id: int
    raw: bytes
    n_records: int  # len(raw) // DOS_RECORD_SIZE


def decode_dos_walldef_file(path: str | Path) -> list[DosWalldefBlock]:
    """Decode every block in one `WALLDEF*.DAX` file via the shared DAX container/RLE reader.

    Raises ValueError if any block's decompressed length is not a positive multiple of
    `DOS_RECORD_SIZE` -- i.e. if the file does not match the documented DOS shape at all.
    """
    data = Path(path).read_bytes()
    data_base, blocks = parse_container(data)
    out: list[DosWalldefBlock] = []
    for blk in blocks:
        raw = decompress_block(data, data_base, blk)
        if len(raw) == 0 or len(raw) % DOS_RECORD_SIZE != 0:
            raise ValueError(
                f"{path}: block id={blk.block_id} raw_size={len(raw)} is not a positive "
                f"multiple of {DOS_RECORD_SIZE}"
            )
        out.append(DosWalldefBlock(blk.block_id, raw, len(raw) // DOS_RECORD_SIZE))
    return out


def dos_walldef_inventory(title_dir: str | Path, filenames: list[str]) -> dict[int, DosWalldefBlock]:
    """`{block_id: DosWalldefBlock}` across a list of `WALLDEF*.DAX` files in `title_dir`.

    Missing files are silently skipped (callers pass the known filename list for a title; a
    title's ids are spread across several `WALLDEFn.DAX` files, not one per id).
    """
    out: dict[int, DosWalldefBlock] = {}
    for fn in filenames:
        p = Path(title_dir) / fn
        if not p.exists():
            continue
        for blk in decode_dos_walldef_file(p):
            out[blk.block_id] = blk
    return out


def dos_entry_kind(value: int) -> str:
    """Classify one raw DOS WALLDEF entry byte, mirroring `walldefEntryKind` in walldef.ts."""
    if value == 0x00:
        return "none"
    if value < DOS_TILE_MIN:
        return "border"
    return "tile"


# --------------------------------------------------------------------------------------
# C64 WALLDEF file access (reads *.d64 directly via c64_disk -- no dependency on the sibling
# c64_wallset.py module, see the module docstring).
# --------------------------------------------------------------------------------------


class C64WalldefFile(NamedTuple):
    disk: str
    name: str
    suffix: str  # the 2-hex-digit id suffix, e.g. "01"
    body: bytes  # file bytes minus the 2-byte CBM load-address prefix
    problem: Optional[str]


def iter_c64_prg_files(title_dir: str | Path, prefix: str) -> list[C64WalldefFile]:
    """Every readable closed PRG on `title_dir`'s `*.d64`/`*.D64` sides whose name starts with
    `prefix`. Generic version of `iter_c64_walldef_files` (which is just `prefix="WALLDEF"`),
    added in the task session (2026-08-13) so Q2's disk-layout cross-check can read `GEO*` and
    `WALLSET*` bodies too WITHOUT importing the sibling-owned `c64_wallset.py` module (see the
    module docstring) -- this reads `c64_disk` directly, the same shared stable primitive.

    Non-recursive glob by design (CLAUDE.md's `superseded/` trap: a title's damaged-dump
    backups live in a subfolder and a recursive glob would silently read them back in).
    """
    out: list[C64WalldefFile] = []
    for img in sorted(list(Path(title_dir).glob("*.d64")) + list(Path(title_dir).glob("*.D64"))):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type != "PRG" or not e.closed or not e.name.startswith(prefix):
                continue
            data, problem = c64.read_file_checked(disk, e)
            suffix = e.name[len(prefix):]
            out.append(C64WalldefFile(img.name, e.name, suffix, data[2:] if len(data) >= 2 else b"", problem))
    return out


def iter_c64_walldef_files(title_dir: str | Path) -> list[C64WalldefFile]:
    """Every readable closed `WALLDEF*` PRG on `title_dir`'s `*.d64`/`*.D64` sides."""
    return iter_c64_prg_files(title_dir, "WALLDEF")


def c64_prg_inventory(title_dir: str | Path, prefix: str) -> dict[str, bytes]:
    """`{id_suffix: body}` for every PRG matching `prefix` on one title's disk set,
    deduplicating disk-side duplicate copies (first seen wins, matching the convention
    `c64_wallset.py` uses for the same corpus). Generic version of `c64_walldef_inventory`."""
    out: dict[str, bytes] = {}
    for f in iter_c64_prg_files(title_dir, prefix):
        if f.suffix not in out and f.problem is None:
            out[f.suffix] = f.body
    return out


def c64_walldef_inventory(title_dir: str | Path) -> dict[str, bytes]:
    """`{id_suffix: body}` for one title, deduplicating disk-side duplicate copies (first seen
    wins, matching the convention `c64_wallset.py` uses for the same corpus)."""
    return c64_prg_inventory(title_dir, "WALLDEF")


# --------------------------------------------------------------------------------------
# Byte-value analysis -- the new leads this round (S2/S3 in the doc).
# --------------------------------------------------------------------------------------

# The near-total void discovered this round: byte values in [VOID_LO, VOID_HI] are almost
# never emitted anywhere in the C64 WALLDEF corpus (either title). See
# void_range_stats()/test cases for exact counts.
VOID_LO = 0x21
VOID_HI = 0x3F

# The two classes flanking the void, used by the (refuted) control/data hypotheses below.
CTRL_MAX = 0x20  # bytes < this are "class C" (low/control candidates)
DATA_MIN = 0x40  # bytes >= this are "class D" (high/data candidates)


def byte_histogram(data: bytes) -> collections.Counter:
    return collections.Counter(data)


def void_range_stats(data: bytes, lo: int = VOID_LO, hi: int = VOID_HI) -> tuple[int, int, float]:
    """`(hits, total, fraction)` of bytes falling in `[lo, hi]`."""
    hits = sum(1 for x in data if lo <= x <= hi)
    total = len(data)
    return hits, total, (hits / total if total else 0.0)


def byte_class(b: int, ctrl_max: int = CTRL_MAX, data_min: int = DATA_MIN) -> str:
    """'C' (candidate control/low byte), 'D' (candidate data/high byte), or 'X' (void-range)."""
    if b < ctrl_max:
        return "C"
    if b >= data_min:
        return "D"
    return "X"


def control_run_test(
    data: bytes, ctrl_max: int = CTRL_MAX, data_min: int = DATA_MIN
) -> tuple[int, int, Optional[int]]:
    """Test the (REFUTED -- see the doc S3.2) hypothesis: a control byte `c < ctrl_max`
    introduces a run of exactly `c + 1` following literal bytes, each `>= data_min`.

    Walks the stream left to right; on each attempted control byte, either the run matches
    (all `c+1` following bytes are class D and in range) and the cursor advances past it, or it
    mismatches and the cursor advances by 1 byte (so a false 'control' byte doesn't desync the
    whole rest of the scan). Returns `(matched_count, mismatched_count, first_mismatch_offset)`.
    """
    i = 0
    n = len(data)
    matched = 0
    mismatched = 0
    first_bad: Optional[int] = None
    while i < n:
        c = data[i]
        if c < ctrl_max:
            run = c + 1
            ok = i + 1 + run <= n and all(data[i + 1 + j] >= data_min for j in range(run))
            if ok:
                matched += 1
                i += 1 + run
                continue
            mismatched += 1
            if first_bad is None:
                first_bad = i
        i += 1
    return matched, mismatched, first_bad


def parity_class_counts(data: bytes, ctrl_max: int = CTRL_MAX, data_min: int = DATA_MIN) -> dict[str, int]:
    """Test the (REFUTED -- see the doc S3.3) hypothesis that class C/D bytes are interleaved
    by position parity (an even/odd two-stream format). Returns raw counts for both parities so
    a caller can compare `even_C/even_D` against `odd_C/odd_D`."""
    counts = {"even_C": 0, "even_D": 0, "odd_C": 0, "odd_D": 0}
    for i, x in enumerate(data):
        cls = byte_class(x, ctrl_max, data_min)
        if cls == "X":
            continue
        key = ("even_" if i % 2 == 0 else "odd_") + cls
        counts[key] += 1
    return counts


def gap_lengths(data: bytes, ctrl_max: int = CTRL_MAX) -> collections.Counter:
    """Counter of run-lengths of consecutive class-D-or-X bytes between successive class-C
    bytes (class C = `byte < ctrl_max`). Used to test (inconclusive -- see the doc S3.4)
    whether gap lengths cluster at `DOS_PIECE_SIZES`."""
    out: collections.Counter = collections.Counter()
    gap = 0
    for x in data:
        if x < ctrl_max:
            out[gap] += 1
            gap = 0
        else:
            gap += 1
    return out


def aggregate_bodies(bodies: dict[str, bytes]) -> bytes:
    """Concatenate every body in an inventory dict, for whole-title histogram statistics."""
    return b"".join(bodies.values())


# --------------------------------------------------------------------------------------
# Corpus-appropriate nulls for the byte-value claims (lead session, 2026-08-12).
#
# The round-1 void claim above was scored against a uniform-random-over-0..255 null, which
# assumes a baseline density WALLDEF does not have and will flag ANY sparse band as extreme.
# The functions here score a band against the title's OWN histogram instead. See
# docs/engine/research/c64-walldef-format.md S2.1's correction box.
# --------------------------------------------------------------------------------------

SECTION_SPLIT_BYTE = 0xF0
HIGH_BAND_LO = 0x80
HIGH_BAND_HI = 0xEF


def sliding_window_rank(
    body: bytes, lo: int = VOID_LO, hi: int = VOID_HI
) -> tuple[int, int, int]:
    """Rank the byte-value window `[lo, hi]` against every same-width window over 0..255.

    Returns `(hits, rank, window_count)` with `rank` 1-based and ties broken by window start,
    so rank 1 means "no same-width window in this title's own corpus is sparser."

    This is the null the round-1 void claim needed: it controls for the title's own baseline
    sparsity rather than assuming a uniform distribution. A band can be 100x below a uniform
    null and still be unremarkable here.
    """
    width = hi - lo + 1
    hist = byte_histogram(body)
    scored = sorted(
        (sum(hist.get(v, 0) for v in range(s, s + width)), s) for s in range(256 - width + 1)
    )
    hits = next(c for c, s in scored if s == lo)
    rank = next(i for i, (_, s) in enumerate(scored, 1) if s == lo)
    return hits, rank, len(scored)


def largest_all_zero_run(body: bytes) -> tuple[int, int]:
    """`(length, start_value)` of the widest run of byte values that never occur at all.

    Reported alongside `sliding_window_rank` because a *wider* untouched band elsewhere is the
    obvious competing explanation for any "this band is a type boundary" reading.
    """
    hist = byte_histogram(body)
    best = best_start = run = 0
    for v in range(256):
        if hist.get(v, 0):
            run = 0
            continue
        run += 1
        if run > best:
            best, best_start = run, v - run + 1
    return best, best_start


def section_split(body: bytes) -> Optional[tuple[int, bytes, bytes]]:
    """Split a body at its first `0xF0` -> `(cut, section1, section2)`, or None if absent.

    Every CoK/DoK WALLDEF body has no `0xF0` in its first ~60-70%, then `0xF0` recurring every
    3-8 bytes; the first occurrence is a clean boundary. **Pool of Radiance bodies contain no
    `0xF0` at all**, so this returns None there -- callers must handle it rather than assume
    the split is universal.
    """
    cut = body.find(SECTION_SPLIT_BYTE)
    if cut < 0:
        return None
    return cut, body[:cut], body[cut:]


def section2_high_band(body: bytes) -> list[int]:
    """Sorted distinct values in `[0x80, 0xEF]` within section 2, or `[]` if there is no split.

    The restriction matters: section 2's high-band alphabet is 10-17 distinct values on CoK,
    against 45-124 distinct values >=0x40 across the whole body. Do not conflate this with the
    whole-file band used by the refuted `0x40 + glyph_index` hypothesis (doc S3.1).

    **`HIGH_BAND_HI` is an analysis window, not a property of the data (corrected 2026-08-13).**
    Never report "value V is this id's own maximum" for `V == HIGH_BAND_HI` -- that is true by
    construction. Call `section2_bytes_above_band` first: in Buck Rogers and Death Knights of
    Krynn, section 2 really does use values all the way to `0xFF`, so a `0xEF` "maximum" there is
    the window's edge, not the data's. See the doc S6.2 correction box.
    """
    split = section_split(body)
    if split is None:
        return []
    return sorted({b for b in split[2] if HIGH_BAND_LO <= b <= HIGH_BAND_HI})


def section2_bytes_above_band(body: bytes) -> list[int]:
    """Sorted distinct section-2 values strictly above `HIGH_BAND_HI` -- the bytes
    `section2_high_band` silently discards.

    Non-empty means any "maximum == HIGH_BAND_HI" statement about this body is a clipping
    artifact. Empty means the band genuinely contains the whole of section 2's upper range and a
    maximum below `HIGH_BAND_HI` is a real ceiling. Excludes the split sentinel `0xF0` itself,
    which every split body contains by definition.
    """
    split = section_split(body)
    if split is None:
        return []
    return sorted({b for b in split[2] if b > HIGH_BAND_HI and b != SECTION_SPLIT_BYTE})


def gap_below_sentinel(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> Optional[int]:
    """Width of the run of byte values never used, immediately below `sentinel`.

    `None` when the body does not contain `sentinel` at all (Pool of Radiance). `0` means the
    value directly below the sentinel *is* used, i.e. the sentinel is flush against real data.

    Replaces the vacuous "no byte above the maximum" check: asking whether a body whose maximum
    is `0xF0` contains a byte in `0xF1`-`0xFF` cannot fail by construction. This can, and does --
    Buck Rogers scores 0 on all seven bodies. See `c64-walldef-structure.md` S3's correction.
    """
    used = set(body)
    if sentinel not in used:
        return None
    gap = 0
    v = sentinel - 1
    while v >= 0 and v not in used:
        gap += 1
        v -= 1
    return gap


def aggregate_section2(bodies: dict[str, bytes]) -> bytes:
    """Concatenate the section 2 of every body that has one, skipping those that do not.

    **Split per file, never on the concatenation.** `section_split(aggregate_bodies(inv))` finds
    the first `0xF0` of the *first* body and returns almost the whole corpus as "section 2" --
    a silent, plausible-looking wrong answer. This helper exists so that mistake is not
    reachable.
    """
    parts = [split[2] for b in bodies.values() if (split := section_split(b)) is not None]
    return b"".join(parts)


def high_band_frequency_ratio(section2: bytes, value: int) -> float:
    """`count(value) / median(count)` over the *populated* `[0x80, 0xEF]` values of section 2.

    Takes already-split section-2 bytes -- pass `aggregate_section2(inv)`, not a raw body or a
    raw aggregate.

    The discriminator between "sentinel" and "merely a high value": the real sentinel `0xF0`
    scores 54.7x-193.8x its own neighbourhood across the six titles that have a split, whereas
    `0xB1` -- which is the per-file maximum in 15 of 22 CoK ids and equals a tempting
    `0x80 + 49` -- scores only 1.6x-4.8x, i.e. it is ordinary. Returns 0.0 on an empty band.
    """
    hist = byte_histogram(section2)
    counts = sorted(c for v in range(HIGH_BAND_LO, HIGH_BAND_HI + 1) if (c := hist.get(v, 0)))
    if not counts:
        return 0.0
    mid = len(counts) // 2
    median = counts[mid] if len(counts) % 2 else (counts[mid - 1] + counts[mid]) / 2
    return hist.get(value, 0) / median if median else 0.0


# --------------------------------------------------------------------------------------
# Round 6 (2026-08-13): the 0xF0-escape/operand hypothesis, a title-class explanation for the
# exact-177 pile-up, and the pairwise longest-common-prefix matrix generalising S4's DoK
# 01/05 lead. See docs/engine/research/c64-walldef-format.md S6/S7/S8 for the narrative.
# --------------------------------------------------------------------------------------


def f0_operand_gap_pairs(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> list[tuple[int, int]]:
    """`(op1, gap)` for every `sentinel` occurrence EXCEPT THE LAST.

    `op1` is the byte immediately following the escape; `gap` is the count of bytes strictly
    between it and the NEXT `sentinel` occurrence. The last occurrence in a body is excluded
    on purpose -- it has no "next escape" to measure a gap against, and an earlier draft of
    this analysis measured it against "distance to body end" instead, which produced a few
    absurd 1000+ outlier gaps that do not belong to the same population (see the doc S6).
    """
    positions = [i for i, b in enumerate(body) if b == sentinel]
    n = len(body)
    out: list[tuple[int, int]] = []
    for idx in range(len(positions) - 1):
        pos = positions[idx]
        if pos + 1 >= n:
            continue
        op1 = body[pos + 1]
        gap = positions[idx + 1] - pos - 1
        out.append((op1, gap))
    return out


def f0_operand_exact_match_count(body: bytes, *, op1_max: Optional[int] = None) -> tuple[int, int]:
    """`(matches, total)` of `f0_operand_gap_pairs(body)` where `op1 == gap` -- the direct
    test of "the byte after 0xF0 is a literal count of bytes until the next escape".

    `op1_max`, if given, restricts to pairs whose `op1 < op1_max` first -- the "count-like
    operand" subset.

    **Score this against `f0_operand_permutation_null`, NOT against `shuffle_bytes` (corrected
    2026-08-13).** See the doc S6.1's correction box: a whole-body shuffle relocates the escapes
    themselves, and the real escapes are clustered (real mean gap 6.2-14.6 vs 17.7-20.8 shuffled),
    so the shuffle null is scored against a gap distribution the real data does not have. That
    inflates the apparent effect from ~2.1x-2.8x to ~10x-16x unrestricted, and manufactures an
    effect entirely for the `op1 < 0x20` subset, which is at chance (1.11x-1.31x) under the
    correct null.
    """
    pairs = f0_operand_gap_pairs(body)
    if op1_max is not None:
        pairs = [(op1, gap) for op1, gap in pairs if op1 < op1_max]
    return sum(1 for op1, gap in pairs if op1 == gap), len(pairs)


def shuffle_bytes(body: bytes, rng) -> bytes:
    """A histogram-preserving shuffle of one body -- the general-purpose null construction for
    the byte-value claims in this module (CLAUDE.md's rule: shuffling WITHIN the real data, not
    drawing from a uniform distribution, is what actually tests out a marginal-distribution-driven
    false positive; `rng` is a `random.Random` instance the caller seeds for reproducibility).

    **NOT the right null for any claim about the RELATIONSHIP between an escape's operand and its
    gap** -- it moves the escapes, so it changes the gap distribution being predicted rather than
    only breaking the operand-to-gap association. Use `f0_operand_permutation_null` there.
    """
    ba = bytearray(body)
    rng.shuffle(ba)
    return bytes(ba)


def f0_operand_permutation_null(
    pairs: list[tuple[int, int]], rng, trials: int = 20
) -> tuple[int, int]:
    """`(matches, comparisons)` for the correct null of "op1 predicts the gap to the next escape".

    Holds the REAL `(op1, gap)` populations fixed -- every real operand value and every real gap
    length is still present, exactly once each -- and permutes only which operand is paired with
    which gap. That destroys the claimed association and nothing else, so the surviving match rate
    is exactly the rate explained by the two marginals alone.

    `shuffle_bytes` was used for this in round 6's first pass and is wrong here: relocating every
    byte also relocates the `0xF0`s, and real escapes are clustered (real mean gap 6.2-14.6 across
    the six titles vs 17.7-20.8 after a whole-body shuffle). A rarer, longer gap is far less likely
    to coincide with a small operand byte, so the shuffle null scores a low match rate for a reason
    that has nothing to do with the hypothesis. Under this permutation null the unrestricted effect
    survives at ~2.1x-2.8x, and the `op1 < 0x20` subset -- round 6's originally-claimed strongest
    evidence -- collapses to chance (1.11x-1.31x). See the doc S6.1 correction box.

    `trials` permutations are pooled to keep the null's own sampling noise well below the effect
    size being measured.
    """
    if not pairs:
        return 0, 0
    ops = [op1 for op1, _ in pairs]
    gaps = [gap for _, gap in pairs]
    matches = 0
    for _ in range(trials):
        rng.shuffle(ops)
        matches += sum(1 for op1, gap in zip(ops, gaps) if op1 == gap)
    return matches, trials * len(pairs)


def f0_walk_overrun(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> tuple[int, int]:
    """Walk `body` left-to-right treating every `sentinel` byte as an escape followed by a
    literal 1-byte COUNT operand naming how many bytes to skip before the walk resumes at
    plain literal bytes (same style of walk as round-3's `control_run_test`, but keyed on
    `sentinel` specifically rather than every byte `<0x20`).

    Returns `(escapes_attempted, overruns)`. `overruns` counts every escape whose implied run
    would extend past (or is truncated at) the end of `body`. A well-formed escape+count
    encoding should overrun LESS often than a histogram-preserving shuffle of the same body,
    because real operand values should track real remaining space -- the doc S6 shows the
    real corpus does the OPPOSITE (overruns MORE than its own null in all 6 checked titles),
    which is what refutes "every 0xF0 carries a uniform 1-byte count operand" as stated.
    """
    i = 0
    n = len(body)
    escapes = 0
    overruns = 0
    while i < n:
        if body[i] == sentinel:
            escapes += 1
            if i + 2 > n:
                overruns += 1
                i += 1
                continue
            op = body[i + 1]
            run_end = i + 2 + op
            if run_end > n:
                overruns += 1
                i += 1
                continue
            i = run_end
        else:
            i += 1
    return escapes, overruns


def title_max_values(bodies: dict[str, bytes]) -> dict[str, int]:
    """`{id: section2_high_band(body)[-1]}` for every id with a non-empty section-2 high
    band. Skips ids with no split at all (Pool of Radiance) and any with an empty band."""
    out: dict[str, int] = {}
    for sid, body in bodies.items():
        band = section2_high_band(body)
        if band:
            out[sid] = band[-1]
    return out


def title_pileup_value(bodies: dict[str, bytes]) -> Optional[tuple[int, int, int]]:
    """`(value, pileup_count, n_ids_with_split)` for the mode of `title_max_values` -- the
    single value that is most often an id's own section-2 maximum across the title.
    `None` if no id in `bodies` has a split at all."""
    maxima = title_max_values(bodies)
    if not maxima:
        return None
    counts = collections.Counter(maxima.values())
    value, count = counts.most_common(1)[0]
    return value, count, len(maxima)


def value_presence_counts(bodies: dict[str, bytes]) -> collections.Counter:
    """`{value: n_ids_whose_section2_high_band_contains_value}`, over ids that have a split.

    Used to test whether a candidate "pile-up value" (from `title_pileup_value`) sits inside
    a smoothly-decaying popularity distribution (an ordinary tile index, just a common one) or
    isolated above a gap in that distribution (evidence of a distinct reserved/special code)
    -- see the doc S7 for the two title-class-specific answers this gives.
    """
    out: collections.Counter = collections.Counter()
    for sid, body in bodies.items():
        for v in set(section2_high_band(body)):
            out[v] += 1
    return out


def longest_common_prefix(a: bytes, b: bytes) -> int:
    """Length of the shared leading run of `a` and `b`."""
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def pairwise_lcp(bodies: dict[str, bytes]) -> dict[tuple[str, str], int]:
    """`{(id_a, id_b): lcp}` for every unordered pair of ids in `bodies` (`id_a < id_b`,
    string-sorted so the key order is deterministic)."""
    ids = sorted(bodies)
    out: dict[tuple[str, str], int] = {}
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            out[(a, b)] = longest_common_prefix(bodies[a], bodies[b])
    return out


def max_pairwise_lcp(bodies: dict[str, bytes]) -> tuple[int, list[tuple[str, str]]]:
    """`(max_lcp, [pairs achieving it])` over `pairwise_lcp(bodies)`. Empty pair list only
    when `bodies` has fewer than 2 entries."""
    matrix = pairwise_lcp(bodies)
    if not matrix:
        return 0, []
    best = max(matrix.values())
    return best, sorted(pair for pair, v in matrix.items() if v == best)


# --------------------------------------------------------------------------------------
# Lead session (2026-08-13): corpus-wide measurement of the "gap==4" 0xF0-escape record
# shape S6.1 flagged as "ONE observed local run in one file, not a proven general record
# shape" (the DoK 03 trace `f0 82 0c 82 | f0 82 0c 83 | ...`). See doc S6.1/S7's replacement
# text for the narrative this backs.
# --------------------------------------------------------------------------------------

#: Position difference between two CONSECUTIVE `sentinel` occurrences that makes a
#: candidate 4-byte record (`sentinel byte1 byte2 byte3`, next `sentinel` immediately after).
GAP4_WIDTH = 4

#: The byte2-clustering band this round's headline finding is about (`body[p+2]` in the
#: brief's own 1-indexed-from-the-escape counting -- i.e. the SECOND of the record's three
#: payload bytes, the doc's worked-trace "fixed 0x0C" byte, not the "variant" third byte).
GAP4_CLUSTER_LO = 0x09
GAP4_CLUSTER_HI = 0x0F


class Gap4Record(NamedTuple):
    """One `sentinel byte1 byte2 byte3` candidate 4-byte record: two CONSECUTIVE `sentinel`
    occurrences exactly `GAP4_WIDTH` bytes apart (i.e. the very next escape in the body, not
    merely "some later escape happens to sit width bytes on" -- see `gap4_records`).

    Field names follow the doc's own worked DoK `03` trace language: `byte1` is the escape's
    first payload byte (the doc's "style" byte); `byte2` is the doc's "second byte" (a fixed
    value that repeated verbatim across the worked trace's three records, and is this
    function's headline clustering finding); `byte3` is the "variant" byte that differed
    across the trace (`82`, then `83`).
    """

    pos: int
    byte1: int
    byte2: int
    byte3: int


def gap4_records(
    body: bytes, sentinel: int = SECTION_SPLIT_BYTE, width: int = GAP4_WIDTH
) -> list[Gap4Record]:
    """Every CONSECUTIVE pair of `sentinel` occurrences exactly `width` bytes apart, decoded
    as a candidate `width`-byte record `sentinel byte1 byte2 byte3` (only meaningful for
    `width == 4`, i.e. a 3-byte payload; kept as a parameter so a future round can re-run the
    same walk at a different width without duplicating the loop).

    "Consecutive" means adjacent in the SORTED LIST of escape positions -- i.e. the very next
    `sentinel` after this one, not merely a later occurrence that happens to sit `width` bytes
    away while an earlier occurrence sits strictly between them. For `width == 4` an
    intervening escape is impossible anyway (the minimum record body is at least 1 byte), but
    an offset-arithmetic version (`body[p + width] == sentinel`, no positions list) would
    silently miscount at other widths, which is why this walks the escape-position list
    instead.
    """
    positions = [i for i, b in enumerate(body) if b == sentinel]
    n = len(body)
    out: list[Gap4Record] = []
    for idx in range(len(positions) - 1):
        pos = positions[idx]
        if positions[idx + 1] - pos != width:
            continue
        if pos + width >= n:
            continue
        out.append(Gap4Record(pos, body[pos + 1], body[pos + 2], body[pos + 3]))
    return out


def gap4_third_byte_distribution(
    bodies: dict[str, bytes], sentinel: int = SECTION_SPLIT_BYTE
) -> tuple[int, collections.Counter]:
    """`(total_records, Counter({byte2: count}))` across every body in a title's inventory
    (pass `c64_walldef_inventory(title_dir)`).

    `byte2` is `body[p+2]` where `p` is the first escape's offset -- the record's SECOND
    payload byte (`Gap4Record.byte2`), the one that clusters heavily in
    `[GAP4_CLUSTER_LO, GAP4_CLUSTER_HI]`. This is NOT the "variant" byte that differed across
    the doc's worked trace (`Gap4Record.byte3`) -- see `gap4_records`'s docstring and
    `gap4_byte1_vs_cluster_crosstab` for the check that keeps all three slots straight.
    """
    counter: collections.Counter = collections.Counter()
    total = 0
    for body in bodies.values():
        for rec in gap4_records(body, sentinel):
            counter[rec.byte2] += 1
            total += 1
    return total, counter


def gap4_cluster_fraction(
    counter: collections.Counter,
    total: int,
    lo: int = GAP4_CLUSTER_LO,
    hi: int = GAP4_CLUSTER_HI,
) -> float:
    """Fraction of a `gap4_third_byte_distribution` counter's mass inside `[lo, hi]`.
    Returns 0.0 on an empty counter (avoids a ZeroDivisionError for Pool of Radiance, which
    has no `0xF0` at all and so no gap==4 records)."""
    if total == 0:
        return 0.0
    return sum(c for v, c in counter.items() if lo <= v <= hi) / total


def gap4_slot_permutation_null(
    records: list[Gap4Record],
    rng,
    trials: int = 20,
    lo: int = GAP4_CLUSTER_LO,
    hi: int = GAP4_CLUSTER_HI,
) -> tuple[int, int]:
    """The CORRECT null for "byte2 specifically clusters in `[lo, hi]`" (matches the task's
    prescribed position-preserving permutation, not a whole-body shuffle -- see the module's
    Round 6 correction box on `shuffle_bytes` vs `f0_operand_permutation_null` for why a
    whole-body shuffle is the wrong tool for a claim about a RELATIONSHIP between co-located
    quantities: it would relocate the escapes themselves and so change which bytes are even
    "the record's payload" in the first place).

    Holds the real gap==4 escape POSITIONS fixed -- the same records, same three byte VALUES
    each -- and permutes only WHICH of a record's three payload bytes lands in the "byte2"
    (middle) slot, per record. This tests the specific claim at stake: is `[lo, hi]` clustering
    a property of the MIDDLE SLOT specifically (a real positional/structural fact), or merely
    an artifact of `[lo, hi]` being a common value somewhere among a record's three payload
    bytes regardless of which slot it lands in (the "byte-value base rate" explanation the task
    brief names)? Real data: `byte1` and `byte3` are almost never in `[lo, hi]` (0 of every
    title's records, one 3-record exception in Buck Rogers) while `byte2` almost always is
    (87%-99%) -- so under random slot assignment the "middle slot" should land in `[lo, hi]`
    at close to the base rate of ANY slot doing so (~1/3, since almost every record has
    exactly one low-band value among its three bytes), not at the real ~90%+ rate.

    Returns `(matches, comparisons)` pooled over `trials` permutations, matching the pooling
    convention `f0_operand_permutation_null` already uses in this module.
    """
    if not records:
        return 0, 0
    matches = 0
    for _ in range(trials):
        for rec in records:
            triple = [rec.byte1, rec.byte2, rec.byte3]
            rng.shuffle(triple)
            if lo <= triple[1] <= hi:
                matches += 1
    return matches, trials * len(records)


def gap4_byte1_vs_cluster_crosstab(
    records: list[Gap4Record], lo: int = GAP4_CLUSTER_LO, hi: int = GAP4_CLUSTER_HI
) -> dict[int, tuple[int, int]]:
    """`{byte1_value: (n_records, n_with_byte2_in_[lo,hi])}` -- cross-tabulates the "style"
    byte against whether its record's byte2 falls in the cluster band.

    Exists to answer, without overclaiming, whether `byte1` selects from a small ENUMERATED
    set (standing rule: no "always"/"never" language without a population actually iterated
    and counted). It does not by itself prove `byte1` is a record-kind tag -- only that its
    observed range across the checked corpus is small; report the exact count returned by
    `len(...)` on this dict's keys, not an assumed one.
    """
    out: dict[int, list[int]] = {}
    for rec in records:
        bucket = out.setdefault(rec.byte1, [0, 0])
        bucket[0] += 1
        if lo <= rec.byte2 <= hi:
            bucket[1] += 1
    return {k: (v[0], v[1]) for k, v in out.items()}


# --------------------------------------------------------------------------------------
# Task session (2026-08-13): CoK's two 177-pile-up exceptions (id 04 -> 187, id 17 -> 203)
# and Gateway's 1232-byte WALLDEF03/WALLDEF1F/WALLDEF1F. triple duplicate. See
# docs/engine/research/c64-walldef-format.md's new section for the narrative.
# --------------------------------------------------------------------------------------


def section2_true_max(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> Optional[int]:
    """The real maximum byte value in section 2, EXCLUDING the sentinel itself.

    `max(section_split(body)[2])` is tautologically useless: section 2 by definition STARTS
    at (and contains many further) `sentinel` occurrences, so a naive max would almost always
    just report the sentinel value, not the highest real data byte. This is also the intended
    replacement for reading a body's "maximum" off `section2_high_band`, which additionally
    clips at `HIGH_BAND_HI` -- see the doc's mandatory band-edge audit for why both must be
    checked before reporting any id's true ceiling. `None` if the body has no split at all.
    """
    split = section_split(body)
    if split is None:
        return None
    _, _, s2 = split
    vals = [b for b in s2 if b != sentinel]
    return max(vals) if vals else None


def section2_bytevalue_count(body: bytes, value: int) -> int:
    """How many times `value` occurs in this body's section 2 (0 if the body has no split or
    `value` never occurs). A thin wrapper kept separate from `high_band_frequency_ratio` (which
    needs an already-aggregated multi-body section2, not one body's raw count) so a single id's
    own byte counts can be pinned directly and re-derived, not eyeballed off a printed histogram."""
    split = section_split(body)
    if split is None:
        return 0
    return byte_histogram(split[2])[value]


def section2_singleton_max_ids(bodies: dict[str, bytes]) -> list[tuple[str, int]]:
    """`[(id, max_value)]` for every id whose section-2 IN-BAND maximum (`section2_high_band`'s
    last element) occurs EXACTLY ONCE in that same id's own section 2.

    This is the direct test of the task's framed "distinction worth testing": that CoK's two
    177-pile-up exceptions (04's 0xBB, 17's 0xCB) are singled out by their extra code occurring
    only once, unlike the shared 0xB1 sentinel's usual 2-4x. Measured directly (see the doc):
    a singleton max is NOT rare -- it is the common case across every title's ids, including
    many ids whose max IS the title's own pile-up value. So "the max occurs once" on its own
    does not distinguish the two exceptions from the other 20; what distinguishes them is that
    their singleton max sits ABOVE the title's pile-up ceiling, not merely that it is a
    singleton. Skips ids with no split.
    """
    out: list[tuple[str, int]] = []
    for sid in sorted(bodies):
        band = section2_high_band(bodies[sid])
        if not band:
            continue
        maxval = band[-1]
        if section2_bytevalue_count(bodies[sid], maxval) == 1:
            out.append((sid, maxval))
    return out


def cross_side_duplicate_ids_from_files(
    files: list[C64WalldefFile],
) -> dict[str, tuple[list[str], bool]]:
    """`{suffix: (sorted distinct disk names, all_bodies_identical)}` for every suffix that is
    present (by filename) on MORE THAN ONE disk side, from an already-read file list (pure --
    the disk-reading wrapper is `cross_side_duplicate_ids` below). Files with a read `problem`
    are excluded, matching `c64_prg_inventory`'s own convention.

    This is the "same id, copied wherever a later side needs it" phenomenon -- distinct from
    `full_body_duplicate_groups` below, which is "different id NUMBERS sharing one body." Both
    are real in this corpus but are not the same claim; see the doc for why conflating them
    overstates how unusual Gateway's WALLDEF03/1F/1F. trio actually is.
    """
    sides: dict[str, set[str]] = collections.defaultdict(set)
    body_sets: dict[str, set[bytes]] = collections.defaultdict(set)
    for f in files:
        if f.problem is not None:
            continue
        sides[f.suffix].add(f.disk)
        body_sets[f.suffix].add(f.body)
    return {
        suffix: (sorted(disks), len(body_sets[suffix]) == 1)
        for suffix, disks in sides.items()
        if len(disks) > 1
    }


def cross_side_duplicate_ids(title_dir: str | Path) -> dict[str, tuple[list[str], bool]]:
    """Disk-reading wrapper around `cross_side_duplicate_ids_from_files` for one WALLDEF
    inventory. See that function's docstring for the exact claim this answers."""
    return cross_side_duplicate_ids_from_files(iter_c64_walldef_files(title_dir))


def full_body_duplicate_groups(bodies: dict[str, bytes]) -> list[list[str]]:
    """Groups of 2+ DIFFERENT ids whose bodies are fully byte-identical (same length, same
    content top to bottom) -- generalises the doc's earlier `max_pairwise_lcp`-based Gateway
    finding, which only ever reports the SINGLE longest-prefix pair/group and so silently
    missed Gateway's second, shorter (1221-byte) full duplicate `02`/`1E` (masked because
    1221 < 1232, the `03`/`1F`/`1F.` trio's own length, so it never became "the max").
    Each returned group is sorted; the list itself is sorted by each group's first id.
    """
    groups: dict[bytes, list[str]] = {}
    for sid in sorted(bodies):
        groups.setdefault(bodies[sid], []).append(sid)
    return sorted((g for g in groups.values() if len(g) > 1), key=lambda g: g[0])


def geo_ids_present(title_dir: str | Path) -> dict[str, set[str]]:
    """`{disk_name: {GEO id suffixes present on that side}}` -- reads `GEO*` PRGs directly via
    `iter_c64_prg_files` (no GEO-specific decoder needed; only the filename id matters here).
    Backs the Q2 disk-layout verification: which sides ship which GEO ids, cross-checked
    against which sides ship which WALLDEF ids."""
    out: dict[str, set[str]] = collections.defaultdict(set)
    for f in iter_c64_prg_files(title_dir, "GEO"):
        if f.problem is not None:
            continue
        out[f.disk].add(f.suffix)
    return out


def geo_id_universe(title_dir: str | Path) -> set[str]:
    """Every GEO id suffix present ANYWHERE across a title's disk sides (union over
    `geo_ids_present`'s values) -- the population `walldef_ids_without_matching_geo` checks
    WALLDEF ids against."""
    universe: set[str] = set()
    for ids in geo_ids_present(title_dir).values():
        universe |= ids
    return universe


def walldef_ids_without_matching_geo(title_dir: str | Path) -> list[str]:
    """WALLDEF ids (from `c64_walldef_inventory`) with NO same-named GEO file ANYWHERE on the
    title's disk sides -- not merely "not on the same side," but absent from the whole title.

    On Gateway this isolates exactly `1F`, `1F.`, `24` (3 of 14): the only WALLDEF ids that
    are not also a real, independently-numbered dungeon/area id. The other 11 DO have a
    same-numbered GEO file somewhere (though, per the doc, often on a DIFFERENT side -- same-
    numbering does not imply co-location). This is the sharper version of the task's
    "duplication co-occurs with an absent GEO on that side" question: the absence that
    actually distinguishes Gateway's duplicated ids is title-wide (no such GEO id exists at
    all for 1F/1F.), not merely side-local (Side 4, where 1F/1F. live, does have GEO files --
    just none named GEO1F).
    """
    universe = geo_id_universe(title_dir)
    inv = c64_walldef_inventory(title_dir)
    return sorted(sid for sid in inv if sid not in universe)


def dot_suffixed_prg_names(title_dir: str | Path) -> set[str]:
    """Every closed PRG filename on this title's disk sides ending in a literal `.` --
    the sweep behind the "is `1F.` a copy or a revision" question. Scans the WHOLE
    directory (not just WALLDEF/WALLSET), so a dot-suffixed file elsewhere in the corpus
    (Buck Rogers' `SAVEBUCK.`, an unrelated save-file placeholder) is not silently missed --
    "checked and found only one example" and "only checked the wall family" are different
    claims, and rule 4 requires the former, not the latter.
    """
    out: set[str] = set()
    for img in sorted(list(Path(title_dir).glob("*.d64")) + list(Path(title_dir).glob("*.D64"))):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type == "PRG" and e.closed and e.name.endswith("."):
                out.add(e.name)
    return out


# --------------------------------------------------------------------------------------
# Round 8 (2026-08-13): ESCAPE TAXONOMY -- separating the 0xF0 escape population into its
# distinct kinds instead of treating every escape uniformly (the doc's own S7 "next move").
#
# Everything below generalises the round-7 gap==4 instrument from the single width 4 to the
# whole width spectrum. `gap4_records` is kept as-is (its 10 tests pin round 7's numbers) but
# it is a SPECIAL CASE of `escape_records`: it only ever returns three payload bytes, so it
# is silently wrong at any width but 4 despite taking a `width=` argument. Use
# `escape_records` for anything that is not literally width 4.
#
# See docs/engine/research/c64-walldef-format.md S9 for the narrative and the numbers.
# --------------------------------------------------------------------------------------

#: Payload byte classes. The C64 WALLDEF escape payload alphabet is essentially binary:
#: a low "nibble" class and a high class, with the round-1 void at 0x21-0x3F (and everything
#: up to 0x7F) almost unused INSIDE a short escape payload. Measured over all 7 titles: for
#: every escape width <= 24, at least 97.7% of payload bytes are in one of these two classes
#: (exactly 100.00% at widths 5, 6, 8-15, 18, 20, 24), and the rate collapses to 72.0% for
#: widths > 24 -- which is the evidence that widths > 24 are NOT records at all but stray
#: `0xF0`-to-`0xF0` spans crossing section 1. See `payload_class_purity`.
PAYLOAD_NIBBLE_LO = 0x01
PAYLOAD_NIBBLE_HI = 0x0F
PAYLOAD_HIGH_LO = 0x80

#: The widest escape width that still behaves like a record (see `PAYLOAD_NIBBLE_LO` above).
#: An ANALYSIS BOUNDARY, not a claimed property of the format -- always report the counts on
#: both sides of it (`payload_class_purity` does).
ESCAPE_RECORD_MAX_WIDTH = 24


class EscapeRecord(NamedTuple):
    """One escape record: the payload between two CONSECUTIVE `sentinel` occurrences.

    `width` is `next_escape_pos - pos`, so `len(payload) == width - 1`. Unlike `Gap4Record`
    (three named byte fields, hard-wired to width 4) this keeps the whole payload, which is
    what makes a width sweep possible at all.
    """

    pos: int
    payload: bytes

    @property
    def width(self) -> int:
        return len(self.payload) + 1


def escape_positions(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> list[int]:
    """Every offset in `body` holding `sentinel`."""
    return [i for i, b in enumerate(body) if b == sentinel]


def escape_widths(body: bytes, sentinel: int = SECTION_SPLIT_BYTE) -> list[int]:
    """`next_pos - pos` for every CONSECUTIVE pair of escapes, i.e. one entry per NON-FINAL
    escape (the last escape in a body has no successor to measure against -- the same
    exclusion `f0_operand_gap_pairs` makes and for the same reason).

    Note the off-by-one against `f0_operand_gap_pairs`, which reports the count of bytes
    STRICTLY BETWEEN two escapes: `width == gap + 1`. `gap4_records`'s `width` argument uses
    THIS convention (distance between escape offsets), so "the gap==4 record" of round 7 is
    `width == 4`, a 3-byte payload. Both conventions are in the doc; this module uses `width`
    everywhere from round 8 on.
    """
    pos = escape_positions(body, sentinel)
    return [pos[i + 1] - pos[i] for i in range(len(pos) - 1)]


def escape_width_histogram(
    bodies: dict[str, bytes], sentinel: int = SECTION_SPLIT_BYTE
) -> collections.Counter:
    """`Counter({width: n})` pooled over a whole title inventory (pass
    `c64_walldef_inventory(title_dir)`, which already de-duplicates the per-disk-side copies
    -- a naive per-file aggregate double- or triple-counts, the recorded corpus trap).

    Returns an EMPTY counter for Pool of Radiance, which contains no `0xF0` in any WALLDEF
    body at all. Callers must assert that zero explicitly rather than letting a `for` loop
    skip it silently (a probe that never executes reads as PASS).
    """
    out: collections.Counter = collections.Counter()
    for body in bodies.values():
        out.update(escape_widths(body, sentinel))
    return out


def escape_records(
    body: bytes, width: int, sentinel: int = SECTION_SPLIT_BYTE
) -> list[EscapeRecord]:
    """Every CONSECUTIVE escape pair exactly `width` apart, with its FULL `width - 1` byte
    payload. The width-general replacement for `gap4_records`.

    "Consecutive" means adjacent in the sorted escape-position list, so an intervening escape
    can never be swallowed into a payload (an offset-arithmetic version, `body[p + width] ==
    sentinel`, would over-count at widths > 4 -- exactly the bug `gap4_records`'s docstring
    warns about and this function must not reintroduce now that widths > 4 are in play).

    At `width == 4` this returns the same records as `gap4_records`, byte for byte
    (`test_escape_records_agrees_with_gap4_records_at_width_4`).
    """
    if width < 2:
        raise ValueError(f"width must be >= 2 (a record needs at least one payload byte), got {width}")
    pos = escape_positions(body, sentinel)
    out: list[EscapeRecord] = []
    for i in range(len(pos) - 1):
        if pos[i + 1] - pos[i] != width:
            continue
        out.append(EscapeRecord(pos[i], bytes(body[pos[i] + 1: pos[i + 1]])))
    return out


def title_escape_records(
    bodies: dict[str, bytes], width: int, sentinel: int = SECTION_SPLIT_BYTE
) -> list[EscapeRecord]:
    """`escape_records` pooled over a whole de-duplicated title inventory."""
    out: list[EscapeRecord] = []
    for body in bodies.values():
        out += escape_records(body, width, sentinel)
    return out


def payload_class_purity(
    records: list[EscapeRecord],
) -> tuple[int, int, collections.Counter]:
    """`(payload_bytes, bytes_in_the_two_classes, Counter of the leftovers)`.

    The two classes are `[PAYLOAD_NIBBLE_LO, PAYLOAD_NIBBLE_HI]` and `>= PAYLOAD_HIGH_LO`.
    This is the measurement that justifies `ESCAPE_RECORD_MAX_WIDTH` -- report it on both
    sides of that boundary rather than quoting the boundary as if it were a format fact.
    """
    total = 0
    inside = 0
    other: collections.Counter = collections.Counter()
    for rec in records:
        for b in rec.payload:
            total += 1
            if PAYLOAD_NIBBLE_LO <= b <= PAYLOAD_NIBBLE_HI or b >= PAYLOAD_HIGH_LO:
                inside += 1
            else:
                other[b] += 1
    return total, inside, other


def slot_band_count(
    records: list[EscapeRecord], slot: int, lo: int, hi: int
) -> tuple[int, int]:
    """`(hits, total)` of records whose payload byte at `slot` falls in `[lo, hi]`."""
    hits = sum(1 for r in records if lo <= r.payload[slot] <= hi)
    return hits, len(records)


def slot_permutation_null_expectation(
    records: list[EscapeRecord], lo: int, hi: int
) -> float:
    """The EXACT expected in-band rate of the slot-permutation null, computed in closed form:
    the mean over records of (in-band payload bytes) / (payload length).

    Identical for every slot by construction, which is the point -- the null says "the band is
    a property of the record, not of this particular slot". `slot_permutation_null` samples
    the same quantity; this is the analytic value to check the sampler against.

    **It also fixes the null's ceiling, and that ceiling is width-dependent.** With payload
    length `L`, a perfectly slot-locked field (every in-band value always in the same slot,
    exactly one per record) gives real = 1.0 and null = 1/L, i.e. a maximum attainable ratio
    of about `L = width - 1`. So a ">= 2x over the null" bar is NOT width-neutral: it is
    unreachable at width 2 (`L == 1`, the null is the real data -- ratio is identically 1.00)
    and only barely reachable at width 3 (`L == 2`). Quote the ceiling next to the ratio.
    """
    if not records:
        return 0.0
    total = 0
    hits = 0
    for r in records:
        total += len(r.payload)
        hits += sum(1 for b in r.payload if lo <= b <= hi)
    return hits / total if total else 0.0


def slot_permutation_null(
    records: list[EscapeRecord], slot: int, rng, trials: int = 20, *, lo: int, hi: int
) -> tuple[int, int]:
    """Width-general version of `gap4_slot_permutation_null`: `(matches, comparisons)`.

    Holds every real record fixed -- same escape positions, same payload byte VALUES -- and
    permutes only WHICH payload byte lands in `slot`. That destroys the slot-to-value
    association and nothing else, which is the null a positional claim needs; a whole-body
    shuffle (`shuffle_bytes`) would relocate the escapes and so change which bytes are a
    record's payload at all (the error round 6 had to retract, see that correction box).

    Pooled over `trials` permutations, matching this module's existing convention.
    """
    if not records:
        return 0, 0
    matches = 0
    for _ in range(trials):
        for r in records:
            t = list(r.payload)
            rng.shuffle(t)
            if lo <= t[slot] <= hi:
                matches += 1
    return matches, trials * len(records)


def best_band_for_slot(
    records: list[EscapeRecord],
    slot: int,
    *,
    max_band_width: int = 16,
    min_coverage: float = 0.5,
) -> Optional[tuple[int, int, float, float]]:
    """Search contiguous value bands for the one maximising `real_rate / null_rate` at `slot`.

    Returns `(lo, hi, real_rate, null_rate)` or `None` if no band reaches `min_coverage`.
    The null is the closed-form `slot_permutation_null_expectation` (no sampling noise inside
    a search loop).

    **This is a SEARCH, and its output is a selected result, not a measurement.** Two things
    are mandatory when reporting anything it returns:
      1. Name the family actually searched. With the defaults the per-slot family is 3976
         contiguous bands (widths 1..16 over 0..255); multiply by the number of (width, slot)
         cells swept. Round 8 searched 28 cells x 3976 bands = 111,328 and corrected against
         that number, not a borrowed threshold. Note that a TRUE per-fold leave-one-out reruns
         this search once per held-out title, so quoting per-fold results makes the family
         6 x 111,328 = 667,968 (Bonferroni alpha 7.49e-08), not 111,328.
      2. Select the band on data OTHER than the data it is scored on. Round 8 uses
         leave-one-title-out: the band is chosen on the other five titles and evaluated on the
         held-out one, so no quoted per-title ratio is selected on its own bytes.
    Also audit the chosen band's edges: maximising a RATIO can push the band to exclude a
    slot's own modal value (real round-8 example: width 4 slot 2's best band is [0x83, 0x88],
    which excludes `0x82` -- that slot's single most common value, 468 of 1161 records).
    """
    if not records:
        return None
    best: Optional[tuple[int, int, float, float, float]] = None
    n = len(records)
    for bw in range(1, max_band_width + 1):
        for lo in range(0, 257 - bw):
            hi = lo + bw - 1
            real = sum(1 for r in records if lo <= r.payload[slot] <= hi) / n
            if real < min_coverage:
                continue
            null = slot_permutation_null_expectation(records, lo, hi)
            if null <= 0:
                continue
            ratio = real / null
            if best is None or ratio > best[0]:
                best = (ratio, lo, hi, real, null)
    if best is None:
        return None
    _, lo, hi, real, null = best
    return lo, hi, real, null


def escape_op1_width_pairs(
    body: bytes, sentinel: int = SECTION_SPLIT_BYTE
) -> list[tuple[int, int]]:
    """`(op1, width)` for every NON-FINAL escape -- the escape-taxonomy pairing.

    Same population as `f0_operand_gap_pairs`, but reporting the escape-to-escape distance
    (`width`) instead of the byte count strictly between (`gap`), so it lines up with
    `escape_records`/`gap4_records`. `width == gap + 1` exactly.
    """
    pos = escape_positions(body, sentinel)
    out: list[tuple[int, int]] = []
    for i in range(len(pos) - 1):
        if pos[i] + 1 >= len(body):
            continue
        out.append((body[pos[i] + 1], pos[i + 1] - pos[i]))
    return out


def op1_width_modal_map(pairs: list[tuple[int, int]]) -> dict[int, int]:
    """`{op1: the width that op1 most often introduces}` -- a one-rule classifier trained on
    `pairs`. Ties are broken by `Counter.most_common`, i.e. by first-insertion order; only
    relevant for op1 values with a tied modal width, which are rare and low-count."""
    by: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    for op1, width in pairs:
        by[op1][width] += 1
    return {op1: c.most_common(1)[0][0] for op1, c in by.items()}


def op1_width_modal_accuracy(
    pairs: list[tuple[int, int]], modal: dict[int, int], fallback: int
) -> float:
    """Fraction of `pairs` whose width the `modal` map predicts correctly; op1 values absent
    from the map fall back to `fallback` (pass the training set's own most common width)."""
    if not pairs:
        return 0.0
    return sum(1 for op1, w in pairs if modal.get(op1, fallback) == w) / len(pairs)


def op1_width_pairing_null(
    pairs: list[tuple[int, int]],
    modal: dict[int, int],
    fallback: int,
    rng,
    trials: int = 20,
) -> float:
    """The correct null for "op1 predicts the escape's width": hold the real op1 population
    and the real width population fixed and permute only WHICH op1 is paired with WHICH width
    (the same position-preserving construction as `f0_operand_permutation_null`).

    A whole-body shuffle is wrong here for the reason the S6.1 correction box gives -- it
    relocates the escapes and so changes the width distribution being predicted. Returns the
    mean accuracy over `trials` permutations.
    """
    if not pairs:
        return 0.0
    ops = [op1 for op1, _ in pairs]
    widths = [w for _, w in pairs]
    acc = 0.0
    for _ in range(trials):
        rng.shuffle(ops)
        acc += sum(1 for op1, w in zip(ops, widths) if modal.get(op1, fallback) == w) / len(pairs)
    return acc / trials


def op1_width_crosstab(pairs: list[tuple[int, int]]) -> dict[int, collections.Counter]:
    """`{op1: Counter({width: n})}` -- the raw escape taxonomy table."""
    by: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    for op1, width in pairs:
        by[op1][width] += 1
    return dict(by)


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--c64-dir", help="C64 title directory (*.d64 sides) to inventory")
    ap.add_argument("--dos-dir", help="DOS title directory (WALLDEF*.DAX) to inventory")
    ap.add_argument(
        "--dos-files",
        nargs="*",
        default=["WALLDEF1.DAX", "WALLDEF2.DAX", "WALLDEF3.DAX", "WALLDEF4.DAX", "WALLDEF5.DAX"],
        help="WALLDEF*.DAX filenames to scan under --dos-dir",
    )
    ap.add_argument("--histogram", action="store_true", help="print an aggregate byte histogram for --c64-dir")
    args = ap.parse_args(argv)

    if args.dos_dir:
        inv = dos_walldef_inventory(args.dos_dir, args.dos_files)
        for bid in sorted(inv):
            blk = inv[bid]
            print(f"DOS id={bid:3d} raw_size={len(blk.raw):5d} records={blk.n_records}")

    if args.c64_dir:
        inv = c64_walldef_inventory(args.c64_dir)
        for suffix in sorted(inv):
            b = inv[suffix]
            print(f"C64 WALLDEF{suffix} len={len(b)} max={max(b):#04x} min={min(b):#04x}")
        if args.histogram:
            allb = aggregate_bodies(inv)
            hist = byte_histogram(allb)
            hits, total, frac = void_range_stats(allb)
            print(f"\naggregate bytes={total} void[{VOID_LO:#04x}-{VOID_HI:#04x}] hits={hits} ({frac:.3%})")
            for v in sorted(hist):
                print(f"  {v:3d} {v:#04x} {hist[v]:5d}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
