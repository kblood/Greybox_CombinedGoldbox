#!/usr/bin/env python3
"""C64 Gold Box `WALLDEF` structural analysis -- an INDEPENDENT, DOS-format-blind attack.

This module deliberately never reads or references the DOS `WALLDEF*.DAX` format (that
oracle-based attack is a sibling slice's job, on different files). Everything here is derived
by treating `WALLDEF` as an unknown binary format and testing structural hypotheses against
the bytes themselves, corpus-wide (all seven C64 Gold Box titles), each claim checked against
a null that destroys only the specific structure being claimed -- see the module's own
`RECORD_ORDER_SHUFFLE_SEED` / `WITHIN_COLUMN_SHUFFLE_SEED` docstrings for how those nulls are
built. Full write-up with numbers: `docs/engine/research/c64-walldef-structure.md`.

What this module ESTABLISHES (see the doc for the full derivation and both nulls):

1. **A period-2 (byte-parity) alternation is real, corpus-wide, and well-nulled.** Adjacent
   same-parity bytes (lag 2, 4, 6, ...) match far more often than adjacent opposite-parity
   bytes (lag 1, 3, 5, ...) -- an EXCEPTIONLESS pattern across every one of the 8 tested
   (odd-lag, next-even-lag) pairs from lag 1 to lag 16, pooled over all 101 files. Two
   independent nulls that each destroy a different specific part of this claim (shuffling
   2-byte RECORD ORDER; shuffling values WITHIN each parity COLUMN) both collapse the lag-2
   signal back to baseline while leaving the marginal per-parity value distribution intact --
   see `stride_gap()` and `WithinColumnShuffleTests`/`RecordOrderShuffleTests` in the test file.
2. **A secondary, weaker, NOT fully resolved peak sits at lag 4** (the single largest
   real-vs-null ratio in a lag-1..16 sweep) -- reported as an open lead toward a possibly
   4-byte (or larger, parity-substructured) record, not a proven record size.
3. **The `0xF0` ceiling is exceptionless, not just common.** Every body whose maximum byte is
   240 (0xF0) NEVER contains any OTHER byte with high nibble `0xF` -- i.e. `0xF0` is a reserved
   sentinel value, and ordinary data bytes are strictly bounded to `0x00-0xEF` in those bodies.
   Checked over every 240-max body in the corpus (0 violations -- see `nibble_ceiling_report()`).
4. **The terminator byte is an exceptionless, title-level binary choice.** Every WALLDEF body's
   LAST byte is either exactly `0x00` or exactly `0xFF`, and which one is a property of the
   TITLE, not the individual area: all Pool of Radiance files end `0xFF`, all other six titles'
   files end `0x00` -- zero exceptions in 101 files (see `terminal_byte_report()`).
5. **Two clean, honest NEGATIVES that keep the above from being overclaimed:** `0xF0`'s own
   byte positions do NOT respect the period-2 parity split (see `sentinel_parity_report()`);
   and no single stride-2 or stride-4 COLUMN behaves as a flat index into its partner
   `WALLSET`'s glyph bank -- every column's in-range fraction sits at the same, near-chance
   level as every other column (see `column_in_range_report()`), extending the project's
   existing whole-body negative result (`c64_wallset_render.walldef_index_validity`) down to
   the column level.

Usage:
    python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --lag-sweep
    python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --nibble-ceiling
    python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --terminator
"""
from __future__ import annotations

import argparse
import random
import sys
from collections import Counter
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_wallset as wallset  # noqa: E402 -- reused ONLY for its disk/inventory reader; none
# of this module's own analysis logic depends on WALLSET's glyph reading or on anything DOS.

#: The seven titles this corpus's WALLDEF/WALLSET pairing was established over (see
#: `c64_wallset.py`'s own module docstring: "101 paired ids ... 640 file instances" across
#: exactly these seven title folder names under the project's standing C64 source root).
TITLES = [
    "Champions of Krynn",
    "Curse of the Azure Bonds",
    "Secret of the Silver Blades",
    "Death Knights of Krynn",
    "Gateway to the Savage Frontier",
    "Pool of Radiance",
    "Buck Rogers - Countdown to Doomsday",
]

#: The one title whose WALLDEF bodies terminate `0xFF` instead of `0x00` -- see
#: `terminal_byte_report()`. Named here (not just discovered ad hoc) so a future change to the
#: set is a one-line, greppable edit rather than a buried literal.
FF_TERMINATED_TITLE = "Pool of Radiance"


# --------------------------------------------------------------------------------------------
# Corpus loading (thin wrapper over c64_wallset.inventory -- deduplicated by (title, id
# suffix), since several ids' WALLDEF file appears on more than one disk side with identical
# content; c64_wallset.py's own module docstring documents this for the raw inventory count).
# --------------------------------------------------------------------------------------------


class WalldefRecord(NamedTuple):
    title: str
    suffix: str
    body: bytes  # 2-byte CBM load address already stripped by c64_wallset.iter_wall_files
    glyph_count: int | None  # partner WALLSET's glyph count, or None if no partner was read


def collect(root: Path, titles: list[str] | None = None) -> list[WalldefRecord]:
    """Every distinct-by-(title, id) WALLDEF body under `root`, paired with its WALLSET glyph
    count when available. `root` is the C64 source directory (one subfolder per title, each
    holding that title's `*.d64` sides) -- the project's standing, never-vendored location.
    Titles not present under `root` are silently skipped (lets a partial/offline checkout
    still exercise whatever titles it does have -- see the test file's own skip behaviour for
    the case where `root` itself does not exist at all).
    """
    out: list[WalldefRecord] = []
    for title in (titles or TITLES):
        title_dir = root / title
        if not title_dir.is_dir():
            continue
        inv = wallset.inventory(title_dir)
        glyph_counts: dict[str, int] = {}
        for f in inv["WALLSET"]:
            if f.problem or f.suffix in glyph_counts:
                continue
            if f.body and len(f.body) % wallset.GLYPH_SIZE == 0:
                glyph_counts[f.suffix] = len(f.body) // wallset.GLYPH_SIZE
        seen: set[str] = set()
        for f in inv["WALLDEF"]:
            if f.problem or f.suffix in seen:
                continue
            seen.add(f.suffix)
            out.append(WalldefRecord(title, f.suffix, f.body, glyph_counts.get(f.suffix)))
    return out


# --------------------------------------------------------------------------------------------
# 1. Nibble ceiling (finding 3 in the module docstring)
# --------------------------------------------------------------------------------------------

#: The one sentinel byte value this module's nibble-ceiling check is built around. Chosen
#: because it is the corpus's own near-universal maximum for 50-glyph-title bodies (see the
#: doc's section 1 for the per-title max-byte census this module's `nibble_ceiling_report`
#: reproduces).
CEILING_SENTINEL = 0xF0


def nibble_ceiling_violations(body: bytes) -> list[int]:
    """Byte VALUES (not positions) in `body` with high nibble `0xF` other than `0xF0` itself.

    A non-empty result means this specific body does NOT observe the "high nibble F implies
    low nibble 0" rule -- i.e. it is a counter-example to finding 3. Deduplicated (a value
    either appears at all or doesn't; positions/counts are not what this check is about).
    """
    return sorted({b for b in body if (b >> 4) == 0xF and b != CEILING_SENTINEL})


class NibbleCeilingSummary(NamedTuple):
    checked: int  # bodies whose own max byte == CEILING_SENTINEL
    violations: int  # of those, how many contain any OTHER high-nibble-F byte


def nibble_ceiling_report(records: list[WalldefRecord]) -> NibbleCeilingSummary:
    checked = violations = 0
    for r in records:
        if not r.body or max(r.body) != CEILING_SENTINEL:
            continue
        checked += 1
        if nibble_ceiling_violations(r.body):
            violations += 1
    return NibbleCeilingSummary(checked, violations)


# --------------------------------------------------------------------------------------------
# 2. Terminator byte (finding 4)
# --------------------------------------------------------------------------------------------


class TerminatorSummary(NamedTuple):
    #: {byte_value: [(title, suffix), ...]} -- every terminator value actually observed, and
    #: which files carry it. A future corpus addition that terminates on some THIRD value
    #: would show up here as a new key rather than being silently absorbed into "0x00 or 0xFF".
    by_value: dict[int, list[tuple[str, str]]]


def terminal_byte_report(records: list[WalldefRecord]) -> TerminatorSummary:
    by_value: dict[int, list[tuple[str, str]]] = {}
    for r in records:
        if not r.body:
            continue
        by_value.setdefault(r.body[-1], []).append((r.title, r.suffix))
    return TerminatorSummary(by_value)


# --------------------------------------------------------------------------------------------
# 3. Period-2 alternation: match-fraction / index-of-coincidence primitives, and the two
#    structural nulls (findings 1-2 in the module docstring).
# --------------------------------------------------------------------------------------------


def match_fraction(body: bytes, lag: int) -> float:
    """Fraction of positions i in [0, len(body)-lag) where body[i] == body[i+lag].

    The base primitive for every lag-based statistic in this module. `lag=0` is not a useful
    call (every position trivially matches itself) and is not specially handled -- callers
    are expected to pass lag >= 1.
    """
    n = len(body) - lag
    if n <= 0:
        return 0.0
    same = sum(1 for i in range(n) if body[i] == body[i + lag])
    return same / n


def index_of_coincidence(body: bytes) -> float:
    """P(two INDEPENDENT random positions in `body` hold equal values), from `body`'s own byte
    multiset. This is the correct density-matched baseline for `match_fraction` -- NOT a flat
    1/256 or 1/alphabet-size guess -- because it accounts for `body`'s own (often quite skewed)
    marginal byte-value distribution. Any excess of `match_fraction` over this number is excess
    that the marginal distribution alone cannot explain.
    """
    n = len(body)
    if n < 2:
        return 0.0
    counts = Counter(body)
    return sum(c * (c - 1) for c in counts.values()) / (n * (n - 1))


def shuffle_record_order(body: bytes, stride: int, rng: random.Random) -> bytes:
    """Null A: split `body` into `stride`-byte records (dropping a `len(body) % stride`
    remainder, appended back untouched) and shuffle the RECORD ORDER, keeping each record's own
    bytes intact and in place relative to each other. Destroys sequential/positional adjacency
    between records while preserving (a) which bytes are paired together within one record and
    (b) each record's own multiset of values -- so a real "value B tends to follow value A in
    the NEXT record" effect must disappear under this null; a real "these two byte-positions
    within one record are correlated with each other" effect must NOT.
    """
    cut = len(body) - (len(body) % stride)
    records = [body[i:i + stride] for i in range(0, cut, stride)]
    rng.shuffle(records)
    return b"".join(records) + body[cut:]


def shuffle_within_column(body: bytes, stride: int, rng: random.Random) -> bytes:
    """Null B: split `body` into `stride` columns by `position mod stride`, and shuffle each
    column's values independently (columns stay separate; positions keep their column identity,
    only WHICH value sits at which row within that column changes). Destroys any real
    record-to-record sequential correlation within a column while preserving each column's own
    marginal distribution exactly. A real "value at parity p tends to repeat at the NEXT
    same-parity position" effect must disappear under this null.
    """
    cut = len(body) - (len(body) % stride)
    columns = [bytearray(body[r:cut:stride]) for r in range(stride)]
    for col in columns:
        rng.shuffle(col)
    out = bytearray(cut)
    for r, col in enumerate(columns):
        out[r:cut:stride] = col
    return bytes(out) + body[cut:]


#: Deterministic seed for both structural nulls -- every number quoted in the research doc is
#: reproducible from this constant, not from an unseeded `random.Random()`.
NULL_SEED = 20260812


class StrideGap(NamedTuple):
    real_mean: float
    record_order_null_mean: float
    within_column_null_mean: float


def stride_gap(bodies: list[bytes], lag: int, seed: int = NULL_SEED) -> StrideGap:
    """Mean `match_fraction(., lag)` over `bodies`, for the real data and both nulls at
    `stride=lag`. The central rerunnable statistic behind findings 1-2: a real record-boundary
    effect at this lag shows `real_mean` well above BOTH null means; a false positive driven
    purely by marginal byte-value skew shows all three roughly equal.
    """
    rng = random.Random(seed)
    real = [match_fraction(b, lag) for b in bodies]
    ro_null = [match_fraction(shuffle_record_order(b, lag, rng), lag) for b in bodies]
    wc_null = [match_fraction(shuffle_within_column(b, lag, rng), lag) for b in bodies]
    n = len(bodies)
    return StrideGap(sum(real) / n, sum(ro_null) / n, sum(wc_null) / n)


def lag_sweep(bodies: list[bytes], max_lag: int = 16, seed: int = NULL_SEED) -> dict[int, StrideGap]:
    """`stride_gap` for every lag 1..max_lag -- the sweep `nibble`/§ in the doc quotes."""
    return {lag: stride_gap(bodies, lag, seed) for lag in range(1, max_lag + 1)}


# --------------------------------------------------------------------------------------------
# 4. Honest negatives: sentinel parity, and per-column flat-index-fraction (finding 5)
# --------------------------------------------------------------------------------------------


def sentinel_parity_report(body: bytes, sentinel: int = CEILING_SENTINEL) -> tuple[int, int]:
    """(even_position_count, odd_position_count) for every occurrence of `sentinel` in `body`.

    If the period-2 structure found by `stride_gap` extended cleanly through the sentinel's own
    region, this would come back heavily lopsided (sentinel always even, or always odd). It
    does not (see the doc) -- reported here as the rerunnable half of that honest negative.
    """
    even = odd = 0
    for i, b in enumerate(body):
        if b == sentinel:
            if i % 2 == 0:
                even += 1
            else:
                odd += 1
    return even, odd


def column_in_range_fraction(body: bytes, stride: int, glyph_count: int) -> list[float]:
    """For each of `stride` columns (`position mod stride`), the fraction of that column's own
    values that are `< glyph_count` -- i.e. would be a valid index into the partner WALLSET's
    glyph bank if that column, alone, were read as a flat index array. Returns one float per
    column, in column order, so a caller can compare them directly (a real "this column is
    THE index field" signature would show one column starkly higher than the rest).
    """
    cut = len(body) - (len(body) % stride)
    out = []
    for r in range(stride):
        col = body[r:cut:stride]
        out.append(sum(1 for v in col if v < glyph_count) / len(col) if col else 0.0)
    return out


def column_in_range_report(records: list[WalldefRecord], stride: int) -> dict[str, list[float]]:
    """Per-title mean `column_in_range_fraction`, over every record in that title with a known
    `glyph_count`. {title: [mean_frac_col0, mean_frac_col1, ...]}.
    """
    by_title: dict[str, list[list[float]]] = {}
    for r in records:
        if not r.body or r.glyph_count is None:
            continue
        fracs = column_in_range_fraction(r.body, stride, r.glyph_count)
        by_title.setdefault(r.title, [[] for _ in range(stride)])
        for col, f in enumerate(fracs):
            by_title[r.title][col].append(f)
    return {
        title: [sum(col) / len(col) if col else 0.0 for col in cols]
        for title, cols in by_title.items()
    }


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, required=True, help="C64 source root (one folder per title)")
    ap.add_argument("--lag-sweep", action="store_true")
    ap.add_argument("--nibble-ceiling", action="store_true")
    ap.add_argument("--terminator", action="store_true")
    ap.add_argument("--sentinel-parity", action="store_true")
    ap.add_argument("--column-in-range", type=int, metavar="STRIDE")
    args = ap.parse_args(argv)

    records = collect(args.root)
    print(f"loaded {len(records)} WALLDEF records across {len({r.title for r in records})} titles")

    if args.lag_sweep:
        bodies = [r.body for r in records]
        for lag, gap in lag_sweep(bodies).items():
            ratio = gap.real_mean / gap.record_order_null_mean if gap.record_order_null_mean else float("inf")
            print(f"  lag={lag:2d}  real={gap.real_mean:.4f}  record_order_null={gap.record_order_null_mean:.4f}"
                  f"  within_column_null={gap.within_column_null_mean:.4f}  ratio={ratio:.2f}x")

    if args.nibble_ceiling:
        s = nibble_ceiling_report(records)
        print(f"nibble ceiling: checked={s.checked} violations={s.violations}")

    if args.terminator:
        s = terminal_byte_report(records)
        for value, files in sorted(s.by_value.items()):
            titles = sorted({t for t, _ in files})
            print(f"  terminator 0x{value:02X}: {len(files)} files, titles={titles}")

    if args.sentinel_parity:
        even_total = odd_total = 0
        for r in records:
            if not r.body or max(r.body) != CEILING_SENTINEL:
                continue
            e, o = sentinel_parity_report(r.body)
            even_total += e
            odd_total += o
        print(f"sentinel 0xF0 positions: even={even_total} odd={odd_total}")

    if args.column_in_range is not None:
        for title, means in column_in_range_report(records, args.column_in_range).items():
            print(f"  {title}: {[round(m, 3) for m in means]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
