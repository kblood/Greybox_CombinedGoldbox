#!/usr/bin/env python3
r"""
secret_chrdata_sweep.py -- where did Secret of the Silver Blades' extra 17 bytes go?

BACKGROUND
  `packages/engine/src/loaders/coabSavedCharacter.ts` decodes Curse of the Azure Bonds'
  422-byte `CHRDATA{n}.SAV` pregens byte-faithfully, anchored by a "consistency oracle":
  the single `_class` byte@0x75 (`ClassId` enum) and the independently-stored `ClassLevel[8]`
  array@0x109 agree on which slots are nonzero, 6/6 real records
  (`coabExpectedClassLevelSlots`, `coabSavedCharacter.ts`).

  The same two CoAB offsets applied to the three later Forgotten Realms trilogy titles give
  near-zero agreement (Secret's 439-byte records 1/6, Pools' and Treasures' 510-byte records
  0/6 and 0/8 -- `docs/engine/research/original-save-import-export-status.md`). Secret is
  422 + 17 bytes. This tool asks: is there SOME OTHER (class-offset, level-offset) pair that
  gets full agreement on Secret, and if so, where does it sit relative to CoAB's (0x75, 0x109)?

WHAT IT MEASURES
  For a given title's records (all the same length), sweep every candidate class-byte offset
  `c` (0..len-1) crossed with every candidate 8-byte `ClassLevel` window offset `l`
  (0..len-8), scoring how many records satisfy the SAME oracle
  `coabExpectedClassLevelSlots(record[c]) == {i : record[l+i] != 0}`.
  "Full agreement" means every record in the title accepts, i.e. score == record count.

  `--shuffle N`  a null: N independent trials, each byte-shuffling every record's own bytes
                 (a permutation of that record, not a cross-record swap -- this keeps each
                 record's own byte *multiset* but destroys its bit/field structure), then
                 rerunning the whole sweep and counting how many (c, l) pairs reach full
                 agreement in that shuffled copy. Reports the MAX of that count over the N
                 trials (plus mean/p95, for context) -- the ceiling "random structure" can
                 reach, which any real finding must clear.

  Runner-up: alongside the full-agreement set, the best score BELOW full agreement is always
  reported -- a winner that only beats "random" and not "the second-best (c, l) hypothesis" is
  not a finding (project epistemic standard, `CLAUDE.md`).

Usage:
  python tools/secret_chrdata_sweep.py --title curse
  python tools/secret_chrdata_sweep.py --title secret --shuffle 200 --json
  python tools/secret_chrdata_sweep.py --title pools
  python tools/secret_chrdata_sweep.py --title treasures

Every number `docs/engine/research/secret-chrdata-layout.md` reports comes from this file, and
`tools/test_secret_chrdata_sweep.py` pins the ones that are load-bearing.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

REPO = Path(__file__).resolve().parent.parent
GOG_GALAXY = Path("C:/Program Files (x86)/GOG Galaxy/Games")

# --------------------------------------------------------------------------------------
# ClassId / SkillType, transcribed verbatim from coab_extracted/Classes/Enums.cs and mirrored
# from packages/engine/src/loaders/coabSavedCharacter.ts (COAB_CLASS_LABEL /
# COAB_CLASS_LEVEL_SLOT_LABEL) -- NOT re-derived, so a drift between the two would be a bug in
# one of them, not an independent measurement.
# --------------------------------------------------------------------------------------
CLASS_LABEL: dict[int, str] = {
    0: "cleric",
    1: "druid",
    2: "fighter",
    3: "paladin",
    4: "ranger",
    5: "magic_user",
    6: "thief",
    7: "monk",
    8: "mc_c_f",
    9: "mc_c_f_m",
    10: "mc_c_r",
    11: "mc_c_mu",
    12: "mc_c_t",
    13: "mc_f_mu",
    14: "mc_f_t",
    15: "mc_f_mu_t",
    16: "mc_mu_t",
    17: "unknown",
}
SLOT_LABEL: list[str] = ["cleric", "druid", "fighter", "paladin", "ranger", "magic_user", "thief", "monk"]
SHORT_TO_SLOT: dict[str, str] = {"c": "cleric", "f": "fighter", "r": "ranger", "mu": "magic_user", "t": "thief", "m": "monk"}


def expected_bitmask(class_code: int) -> int:
    """Mirrors `coabExpectedClassLevelSlots`. Returns a bitmask over the 8 SLOT_LABEL indices,
    or -1 for a code with no expectation (17 = unknown, or any code outside 0..17 -- 'reject',
    per the plan). -1 never equals a valid ClassLevel[8] nonzero-slot bitmask (0..255), so it
    naturally scores as a non-match everywhere it is used."""
    name = CLASS_LABEL.get(class_code)
    if name is None or name == "unknown":
        return -1
    if not name.startswith("mc_"):
        return 1 << SLOT_LABEL.index(name)
    mask = 0
    for part in name[3:].split("_"):
        slot_name = SHORT_TO_SLOT.get(part)
        if slot_name is None:
            return -1
        mask |= 1 << SLOT_LABEL.index(slot_name)
    return mask


EXPECTED_BITMASK_TABLE = np.array([expected_bitmask(b) for b in range(256)], dtype=np.int32)

CLASS_OFFSET_COAB = 0x75
CLASS_LEVEL_OFFSET_COAB = 0x109

# --------------------------------------------------------------------------------------
# R3 (round 30) additions: the CoAB field table (name, offset, size-in-bytes), transcribed from
# `packages/engine/src/loaders/coabSavedCharacter.ts`'s own offset constants and citations --
# used by `--field-map` to print a candidate title's bytes at each CoAB field shifted by one
# hand-picked delta at a time (the record was NOT extended by one uniform delta throughout --
# see `secret-chrdata-layout.md` section 2 -- so this prints one region's worth per invocation,
# not a single whole-record guess).
# --------------------------------------------------------------------------------------
COAB_FIELD_TABLE: list[tuple[str, int, int]] = [
    ("name (PString)", 0x00, 16),
    ("ability block (7x cur/max)", 0x10, 14),
    ("thac0 (SByte)", 0x73, 1),
    ("race (IByte)", 0x74, 1),
    ("class (IByte)", 0x75, 1),
    ("age (SWord)", 0x76, 2),
    ("hpMax (Byte)", 0x78, 1),
    ("classLevel (ByteArray[8])", 0x109, 8),
    ("sex (Byte)", 0x119, 1),
    ("alignment (Byte)", 0x11B, 1),
    ("baseAc (Byte)", 0x124, 1),
    ("exp (Int)", 0x127, 4),
    ("hitPointRolled (Byte)", 0x12C, 1),
]


def class_diversity(records: list[bytes], offset: int) -> int:
    """Number of DISTINCT raw byte values at `offset` across the party -- a tie-breaker for
    offsets that reach the same agreement score: a byte that is one constant class code on
    (n-1) records and a different one on the last record ("degenerate leakage", see the module
    doc / research doc section 0) has diversity 2 no matter how large the party is, while a
    genuine class byte has diversity close to the number of distinct classes actually played."""
    return len({r[offset] for r in records if offset < len(r)})


def top_pairs_by_score(res: "SweepResult", records: list[bytes], tiers: int = 3) -> list[dict]:
    """The R3 brief's "best pair by count, not only n/n" summary: instead of collapsing
    anything short of full agreement to a bare miss, report the top `tiers` distinct
    discriminating scores (descending, starting below full agreement), each with its score,
    the pairs tied at that score, and each pair's `class_diversity` -- the tie-break that
    distinguishes a real class byte from a near-constant one riding along at the same raw
    score (see `class_diversity`)."""
    counts = res.counts
    n = res.n_records
    _, discriminating = _agreement_matrix(records)
    scores = sorted({int(s) for s in np.unique(counts[discriminating, :]) if s < n}, reverse=True)
    out = []
    for score in scores[:tiers]:
        rows, cols = np.nonzero(discriminating)[0], None
        idx = np.argwhere((counts == score) & discriminating[:, None])
        pairs = sorted((int(c), int(l)) for c, l in idx)
        out.append(
            {
                "score": score,
                "of": n,
                "pairs": [
                    {"c": f"0x{c:x}", "l": f"0x{l:x}", "class_diversity": class_diversity(records, c)}
                    for c, l in pairs
                ],
            }
        )
    return out


def score_one_pair(records: list[bytes], c: int, l: int) -> dict:
    """`--pair C L`: score ONE fixed (class-offset, level-offset) pair and report, per record,
    the name / class code+label / 8-byte window / expected vs actual bitmask / hit-or-miss --
    the exact per-record breakdown the R3 outlier analysis needs, produced by the tool instead
    of by hand."""
    rows = []
    hits = 0
    for raw in records:
        namelen = raw[0]
        name_bytes = raw[1 : 1 + namelen]
        try:
            name = name_bytes.decode("ascii")
        except UnicodeDecodeError:
            name = repr(name_bytes)
        cls = raw[c] if c < len(raw) else None
        expected = expected_bitmask(cls) if cls is not None else -1
        window = list(raw[l : l + 8]) if l + 8 <= len(raw) else []
        actual = 0
        for k, b in enumerate(window):
            if b != 0:
                actual |= 1 << k
        hit = expected != -1 and expected == actual
        hits += int(hit)
        rows.append(
            {
                "name": name,
                "class_code": cls,
                "class_label": CLASS_LABEL.get(cls, "?") if cls is not None else None,
                "window": window,
                "expected_mask": f"{expected:08b}" if expected != -1 else "invalid",
                "actual_mask": f"{actual:08b}",
                "hit": hit,
            }
        )
    return {"c": f"0x{c:x}", "l": f"0x{l:x}", "score": hits, "of": len(records), "records": rows}


def ability_block_offsets(records: list[bytes], n_pairs: int = 6, lo: int = 3, hi: int = 18) -> list[int]:
    """Reproduces the `0x10` ability-block uniqueness measurement generically: an offset `w`
    qualifies iff it starts `n_pairs` consecutive (cur, max) byte pairs where, for EVERY
    record, cur == max, every value is in `[lo, hi]` (the AD&D-1e 3..18 ability range), and at
    least one pair's value varies across the party (rules out a constant-padding run trivially
    satisfying cur==max==0, which is outside [lo,hi] anyway, but also any other constant
    stretch). Verified to return exactly `[0x10]` for all four titles -- see
    `docs/engine/research/pools-treasures-chrdata-layout.md`."""
    if not records:
        return []
    data = np.array([list(r) for r in records], dtype=np.uint8)
    n, length = data.shape
    width = n_pairs * 2
    hits = []
    for w in range(0, length - width + 1):
        ok = True
        varies = False
        for p in range(n_pairs):
            cur = data[:, w + 2 * p]
            mx = data[:, w + 2 * p + 1]
            if not np.array_equal(cur, mx):
                ok = False
                break
            if np.any((cur < lo) | (cur > hi)):
                ok = False
                break
            if len(set(cur.tolist())) > 1:
                varies = True
        if ok and varies:
            hits.append(w)
    return hits


def ability_sweep_null(records: list[bytes], trials: int, seed: int, n_pairs: int = 6, lo: int = 3, hi: int = 18) -> int:
    """Shuffled null for `ability_block_offsets`: byte-shuffle each record independently
    `trials` times and report the MAX, over all trials, of how many offsets qualify. The real
    measurement (exactly 1, `{0x10}`) must clear this ceiling."""
    rng = np.random.default_rng(seed)
    data = np.array([list(r) for r in records], dtype=np.uint8)
    n = data.shape[0]
    max_count = 0
    for _ in range(trials):
        shuffled = np.empty_like(data)
        for i in range(n):
            shuffled[i] = rng.permutation(data[i])
        recs = [bytes(row) for row in shuffled]
        max_count = max(max_count, len(ability_block_offsets(recs, n_pairs, lo, hi)))
    return max_count


def field_map(records: list[bytes], delta: int) -> list[dict]:
    """`--field-map`: for every CoAB field in `COAB_FIELD_TABLE`, print the bytes at
    `coab_offset + delta` for every record in `records` -- lets the report show, e.g., the
    thac0/race/class/extra-byte group at delta=+0x39 or the classLevel group at delta=+0x48
    without hand-transcribing hex dumps. A field whose shifted range runs off the end of a
    record is reported with `out_of_range: true` instead of bytes."""
    out = []
    for name, off, size in COAB_FIELD_TABLE:
        new_off = off + delta
        row: dict = {"field": name, "coab_offset": f"0x{off:x}", "shifted_offset": f"0x{new_off:x}", "size": size}
        if new_off < 0:
            row["out_of_range"] = True
        else:
            values = []
            oor = False
            for r in records:
                if new_off + size > len(r):
                    oor = True
                    break
                values.append(list(r[new_off : new_off + size]))
            if oor:
                row["out_of_range"] = True
            else:
                row["values"] = [" ".join(f"{b:02x}" for b in v) for v in values]
        out.append(row)
    return out

# --------------------------------------------------------------------------------------
# Title record locations. Secret's CHRDATA files are in the GOG install ROOT, not SAVE\ --
# verified on-disk (its SAVE\ is empty); the other three titles are the usual SAVE\.
# --------------------------------------------------------------------------------------
TITLE_SPECS: dict[str, tuple[Path, range]] = {
    "curse": (GOG_GALAXY / "Curse of the Azure Bonds" / "SAVE", range(1, 7)),
    "secret": (GOG_GALAXY / "Secret of the Silver Blades", range(1, 7)),
    "pools": (GOG_GALAXY / "Pools of Darkness" / "SAVE", range(1, 7)),
    "treasures": (GOG_GALAXY / "Treasures of the Savage Frontier" / "SAVE", range(1, 9)),
}


def title_dir_available(title: str) -> bool:
    d, indices = TITLE_SPECS[title]
    return (d / f"CHRDATA{indices[0]}.SAV").exists()


def load_records(title: str) -> list[bytes]:
    d, indices = TITLE_SPECS[title]
    out = []
    for i in indices:
        p = d / f"CHRDATA{i}.SAV"
        out.append(p.read_bytes())
    lengths = {len(r) for r in out}
    if len(lengths) != 1:
        raise ValueError(f"{title}: records are not all the same length: {sorted(lengths)}")
    return out


@dataclass
class SweepResult:
    n_records: int
    record_size: int
    full_agreement: list[tuple[int, int]]  # (c, l) pairs at score == n_records, UNFILTERED
    full_agreement_discriminating: list[tuple[int, int]]  # subset with a party-varying class byte
    runner_up_score: int
    runner_up_pairs: list[tuple[int, int]]  # ALL pairs at runner_up_score (may be truncated for report)
    runner_up_discriminating_score: int
    runner_up_discriminating_pairs: list[tuple[int, int]]
    counts: "np.ndarray" = field(repr=False)  # (record_size, record_size-7) agreement matrix


def _agreement_matrix(records: list[bytes]) -> tuple["np.ndarray", "np.ndarray"]:
    """counts[c, l] = number of records where expected_bitmask(record[c]) ==
    actual_bitmask(record[l:l+8]) (bit k set iff record[l+k] != 0). Vectorised over records
    (small, <=8) and offsets (up to ~510) with numpy; a pure-Python triple loop over a 510-byte
    record's full offset grid is the same computation ~50x slower.

    Also returns `discriminating[c]`: True iff `expected_bitmask(record[c])` is not the SAME
    value on every record. A `c` that reads the same class code on the whole party (most often
    because it sits in a run of bytes that is 0 -- i.e. 'cleric' -- on every pregen, a common
    shape for unused/padding fields) can only reach full agreement against an `l` whose window
    is ALSO constant across the party, which is a structural coincidence, not the party's own
    class variety lining up with its own level array. See the module doc and
    `docs/engine/research/secret-chrdata-layout.md` -- this is what separates the ~600-pair raw
    sweep from the single real pair."""
    n = len(records)
    data = np.array([list(r) for r in records], dtype=np.uint8)  # (n, L)
    L = data.shape[1]
    n_l = L - 7
    nz = (data != 0).astype(np.int32)  # (n, L)
    actual = np.zeros((n, n_l), dtype=np.int32)
    for k in range(8):
        actual += nz[:, k : k + n_l] << k
    expected = EXPECTED_BITMASK_TABLE[data]  # (n, L), int32, -1 or a valid bitmask 1..255
    counts = np.zeros((L, n_l), dtype=np.int32)
    for i in range(n):
        counts += expected[i, :, None] == actual[i, None, :]
    discriminating = np.any(expected != expected[0:1, :], axis=0)  # (L,) bool
    return counts, discriminating


def _pick_best_below(counts: "np.ndarray", ceiling: int, col_mask: Optional["np.ndarray"] = None) -> tuple[int, list[tuple[int, int]]]:
    m = counts if col_mask is None else counts[col_mask, :]
    below = m[m < ceiling]
    if below.size == 0:
        return 0, []
    score = int(below.max())
    if col_mask is None:
        idx = np.argwhere(counts == score)
    else:
        rows = np.nonzero(col_mask)[0]
        sub_idx = np.argwhere(counts[col_mask, :] == score)
        idx = np.stack([rows[sub_idx[:, 0]], sub_idx[:, 1]], axis=1)
    return score, sorted((int(c), int(l)) for c, l in idx)


def sweep(records: list[bytes]) -> SweepResult:
    n = len(records)
    counts, discriminating = _agreement_matrix(records)
    full_idx = np.argwhere(counts == n)
    full_pairs = sorted((int(c), int(l)) for c, l in full_idx)
    full_pairs_disc = sorted((c, l) for c, l in full_pairs if discriminating[c])
    runner_up_score, runner_up_pairs = _pick_best_below(counts, n)
    runner_up_disc_score, runner_up_disc_pairs = _pick_best_below(counts, n, col_mask=discriminating)
    return SweepResult(
        n_records=n,
        record_size=records[0].__len__(),
        full_agreement=full_pairs,
        full_agreement_discriminating=full_pairs_disc,
        runner_up_score=runner_up_score,
        runner_up_pairs=runner_up_pairs,
        runner_up_discriminating_score=runner_up_disc_score,
        runner_up_discriminating_pairs=runner_up_disc_pairs,
        counts=counts,
    )


def shuffled_null(records: list[bytes], trials: int, seed: int) -> dict:
    """Byte-shuffle each record independently (permute its own bytes -- preserves the record's
    byte multiset, destroys any field structure) `trials` times; for each trial, count how many
    (c, l) pairs reach FULL agreement (score == n_records) in the shuffled copy -- both the raw
    count and the discriminating-only count. Reports the max of each over all trials (the null
    ceiling), plus mean and p95 for context."""
    rng = np.random.default_rng(seed)
    n = len(records)
    data = np.array([list(r) for r in records], dtype=np.uint8)
    full_counts = []
    full_counts_disc = []
    max_scores = []       # R3: max score reached by ANY pair, not just full-agreement pairs --
    max_scores_disc = []  # the stronger null a near-miss (n-1/n) real score must be checked against.
    for _ in range(trials):
        shuffled = np.empty_like(data)
        for i in range(n):
            shuffled[i] = rng.permutation(data[i])
        shuffled_records = [bytes(row) for row in shuffled]
        res = sweep(shuffled_records)
        full_counts.append(len(res.full_agreement))
        full_counts_disc.append(len(res.full_agreement_discriminating))
        max_scores.append(int(res.counts.max()) if res.counts.size else 0)
        counts_disc = res.counts
        _, disc_mask = _agreement_matrix(shuffled_records)
        max_scores_disc.append(int(counts_disc[disc_mask, :].max()) if disc_mask.any() else 0)
    arr = np.array(full_counts)
    arr_disc = np.array(full_counts_disc)
    arr_max = np.array(max_scores)
    arr_max_disc = np.array(max_scores_disc)
    return {
        "trials": trials,
        "seed": seed,
        "max_full_agreement_pairs": int(arr.max()) if arr.size else 0,
        "mean_full_agreement_pairs": float(arr.mean()) if arr.size else 0.0,
        "p95_full_agreement_pairs": float(np.percentile(arr, 95)) if arr.size else 0.0,
        "max_full_agreement_discriminating_pairs": int(arr_disc.max()) if arr_disc.size else 0,
        "mean_full_agreement_discriminating_pairs": float(arr_disc.mean()) if arr_disc.size else 0.0,
        "p95_full_agreement_discriminating_pairs": float(np.percentile(arr_disc, 95)) if arr_disc.size else 0.0,
        # R3: the null ceiling for a NEAR-MISS score (any pair, not just full n/n agreement) --
        # answers "how high can pure byte-shuffle noise score at ANY pair" so a real (n-1)/n
        # score can be checked against the alternative it actually has to beat.
        "max_score_any_pair": int(arr_max.max()) if arr_max.size else 0,
        "max_score_any_discriminating_pair": int(arr_max_disc.max()) if arr_max_disc.size else 0,
    }


def insert_zero_bytes(records: list[bytes], at: int, count: int) -> list[bytes]:
    """Synthetic-mutation helper (not used by the CLI): insert `count` zero bytes at offset
    `at` into every record. Used by the R3 mutation test to prove the sweep tracks a genuine
    insertion rather than reporting CoAB's own offsets by coincidence."""
    out = []
    for r in records:
        out.append(r[:at] + bytes(count) + r[at:])
    return out


def _fmt_pairs(pairs: list[tuple[int, int]], limit: int = 10) -> str:
    shown = pairs[:limit]
    s = ", ".join(f"(0x{c:x}, 0x{l:x})" for c, l in shown)
    if len(pairs) > limit:
        s += f", ... ({len(pairs) - limit} more)"
    return s


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--title", required=True, choices=sorted(TITLE_SPECS))
    ap.add_argument("--shuffle", type=int, default=0, help="run an N-trial shuffled null")
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--pair", nargs=2, metavar=("C", "L"), help="score ONE fixed (class, level-window) pair, e.g. --pair 0xae 0x151")
    ap.add_argument("--top-pairs", type=int, default=0, metavar="N", help="report the top N discriminating score tiers, not just full agreement")
    ap.add_argument("--ability-sweep", action="store_true", help="reproduce the 0x10 ability-block uniqueness measurement")
    ap.add_argument("--field-map", type=lambda s: int(s, 0), default=None, metavar="DELTA", help="print CoAB field-table bytes shifted by DELTA")
    args = ap.parse_args(argv)

    if not title_dir_available(args.title):
        msg = f"{args.title}: CHRDATA files not found under {TITLE_SPECS[args.title][0]} -- external GOG install absent on this machine"
        if args.json:
            print(json.dumps({"title": args.title, "error": msg}))
        else:
            print(msg)
        return 1

    records = load_records(args.title)

    if args.pair is not None:
        c = int(args.pair[0], 0)
        l = int(args.pair[1], 0)
        result = score_one_pair(records, c, l)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"title={args.title} pair=({result['c']}, {result['l']}) score={result['score']}/{result['of']}")
            for row in result["records"]:
                mark = "HIT" if row["hit"] else "MISS"
                print(f"  {row['name']:20s} class={row['class_code']!s:>4s} {row['class_label']:12s} "
                      f"expected={row['expected_mask']} actual={row['actual_mask']} window={row['window']} {mark}")
        return 0

    if args.ability_sweep:
        hits = ability_block_offsets(records)
        result = {"title": args.title, "n_records": len(records), "ability_block_offsets": [f"0x{h:x}" for h in hits]}
        if args.shuffle:
            result["null_max_offset_count"] = ability_sweep_null(records, args.shuffle, args.seed)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"title={args.title} ability-block candidate offsets: {[f'0x{h:x}' for h in hits]}")
            if args.shuffle:
                print(f"  shuffled null ({args.shuffle} trials): max offset count = {result['null_max_offset_count']}")
        return 0

    if args.field_map is not None:
        rows = field_map(records, args.field_map)
        if args.json:
            print(json.dumps({"title": args.title, "delta": f"0x{args.field_map:x}" if args.field_map >= 0 else f"-0x{-args.field_map:x}", "fields": rows}, indent=2))
        else:
            print(f"title={args.title} field-map at delta={'+' if args.field_map >= 0 else '-'}0x{abs(args.field_map):x}")
            for row in rows:
                if row.get("out_of_range"):
                    print(f"  {row['field']:28s} coab={row['coab_offset']:>6s} -> {row['shifted_offset']:>6s}  OUT OF RANGE")
                else:
                    print(f"  {row['field']:28s} coab={row['coab_offset']:>6s} -> {row['shifted_offset']:>6s}  {row['values']}")
        return 0

    res = sweep(records)

    out: dict = {
        "title": args.title,
        "n_records": res.n_records,
        "record_size": res.record_size,
        "full_agreement_count": len(res.full_agreement),
        "full_agreement_pairs_hex_sample": [f"(0x{c:x}, 0x{l:x})" for c, l in res.full_agreement[:10]],
        "full_agreement_discriminating_count": len(res.full_agreement_discriminating),
        "full_agreement_discriminating_pairs_hex": [f"(0x{c:x}, 0x{l:x})" for c, l in res.full_agreement_discriminating],
        "runner_up_score": res.runner_up_score,
        "runner_up_pair_count": len(res.runner_up_pairs),
        "runner_up_pairs_hex_sample": [f"(0x{c:x}, 0x{l:x})" for c, l in res.runner_up_pairs[:10]],
        "runner_up_discriminating_score": res.runner_up_discriminating_score,
        "runner_up_discriminating_pair_count": len(res.runner_up_discriminating_pairs),
        "runner_up_discriminating_pairs_hex_sample": [f"(0x{c:x}, 0x{l:x})" for c, l in res.runner_up_discriminating_pairs[:10]],
    }
    if args.shuffle:
        out["null"] = shuffled_null(records, args.shuffle, args.seed)
    if args.top_pairs:
        out["top_pairs"] = top_pairs_by_score(res, records, tiers=args.top_pairs)

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"title={args.title} n_records={res.n_records} record_size={res.record_size}")
        print(f"RAW full-agreement pairs ({len(res.full_agreement)}, includes degenerate/constant-class "
              f"offsets): {_fmt_pairs(res.full_agreement)}")
        print(f"DISCRIMINATING full-agreement pairs ({len(res.full_agreement_discriminating)}, class byte "
              f"varies across the party -- the real signal): {_fmt_pairs(res.full_agreement_discriminating)}")
        print(f"runner-up (raw) score: {res.runner_up_score}/{res.n_records}, "
              f"{len(res.runner_up_pairs)} pair(s): {_fmt_pairs(res.runner_up_pairs)}")
        print(f"runner-up (discriminating) score: {res.runner_up_discriminating_score}/{res.n_records}, "
              f"{len(res.runner_up_discriminating_pairs)} pair(s): {_fmt_pairs(res.runner_up_discriminating_pairs)}")
        if args.shuffle:
            null = out["null"]
            print(f"shuffled null over {null['trials']} trials (seed={null['seed']}): "
                  f"max RAW full-agreement pairs = {null['max_full_agreement_pairs']} "
                  f"(mean {null['mean_full_agreement_pairs']:.2f}, p95 {null['p95_full_agreement_pairs']:.2f}); "
                  f"max DISCRIMINATING full-agreement pairs = {null['max_full_agreement_discriminating_pairs']} "
                  f"(mean {null['mean_full_agreement_discriminating_pairs']:.2f}, "
                  f"p95 {null['p95_full_agreement_discriminating_pairs']:.2f})")
            print(f"  null ceiling for a score at ANY pair (the near-miss/(n-1)-of-n check): "
                  f"raw={null['max_score_any_pair']}, discriminating={null['max_score_any_discriminating_pair']}")
        if args.top_pairs:
            print(f"top {args.top_pairs} discriminating score tiers (below full agreement):")
            for tier in out["top_pairs"]:
                print(f"  score {tier['score']}/{tier['of']}, {len(tier['pairs'])} pair(s):")
                for p in tier["pairs"]:
                    print(f"    (c={p['c']}, l={p['l']})  class_diversity={p['class_diversity']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
