#!/usr/bin/env python3
r"""
dok_save_key_sweep.py -- is the Death Knights of Krynn monster saving-throw row keyed off
some record byte OTHER than the hit-dice byte @48?

BACKGROUND (established before this tool, four independent sweeps agreeing)
  Retail `Death Knights of Krynn\MON1CHA.DAX` holds 64 monster records of 216 bytes.
  The five saving throws [PPD, PetPoly, RSW, Breath, Spell] live at offsets 42..46 and the
  hit-dice byte at 48.  Keyed off @48, 43/64 records reproduce the exact canonical AD&D 1e
  FIGHTER row; 0/64 do so at any of the other 211 candidate 5-byte save windows.

  21 records do not match.  7 carry another CLASS's canonical row at their own hd (kuo-toa
  clerics, the black/high wizards, ROGUE).  4 match no canonical row at all.  The remaining
  10 carry a canonical row from some class table but at a level band that is NOT their
  hd@48 -- e.g. ZOMBIE MASTODON hd 12 wearing the fighter 7-8 row.  This tool asks whether a
  second, level-ish byte in the record explains those 10.

WHAT IT MEASURES
  `sweep`      For every one of the 216 record offsets k, score = how many of the 64 records
               satisfy  saves[42..46] == canonical_row(class, record[k]).  Ranked.
  `null`       The floors the sweep must beat, because a max over 216 offsets is a max over
               216 chances:
                 * best-constant floor  -- the score a column that ignores the record entirely
                   can reach, i.e. max over key values v of #{records whose row == row(v)}.
                   The save rows are heavily repeated, so this is NOT zero.
                 * column-permutation null -- shuffle each column's values across records
                   (preserving each column's exact value multiset) and re-run the whole
                   216-offset sweep; the statistic is the MAX over offsets, resampled.
                 * empirical-draw null -- key bytes drawn i.i.d. from the observed hd
                   distribution, same max-over-216 statistic.
  `residue`    For each record the sweep leaves unexplained, list every key value that WOULD
               have produced its observed row (per class), then report which offsets, if any,
               carry such a value for the whole residue set.  This is the direct test of "a
               second level field exists": it must be ONE offset satisfying all of them.
  `oracle`     The same question with the 1e tables DROPPED: for each offset, the fitted
               ceiling of any value->row lookup on that byte, against its own per-offset
               permutation null.  Catches a hidden field whose table we do not know.
  `canon`      How many rows are exact 1e table rows at all (any class, any level), against a
               null that shuffles each save column across records.  This is the hand-authoring
               test: a row typed from a book is exact; a row a designer nudged is L1 1..5 away;
               a row nobody derived at all, such as CoK2's escort NPCs' [1,1,1,1,1], is far.
  `crosscheck` The same monster in two games.  If the row were derived from a record field,
               a monster with the same hd byte in both games would have to carry the same row.
               Run it against Champions of Krynn's 409-byte records (saves 208..212, hd 214),
               which is also the overfitting check on the whole hypothesis.

The AD&D 1e save tables below are the *monster/character* tables extended past the level-12
column that `packages/engine/src/ruleset/addnd1e/combatTables.ts` stops at (that file caps at
12 because PCs do).  DoK monsters reach hd 20, so the 13-14 / 15-16 / 17+ fighter bands and
the cleric/magic-user/thief high bands are required and are transcribed here from the 1e DMG.
Every number in `docs/engine/research/dok-save-key-sweep.md` comes from this file, and
`tools/test_dok_save_key_sweep.py` pins them.
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from typing import Iterable, NamedTuple, Optional, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dax_decode import parse_container, decompress_block  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------------------
# AD&D 1st-edition saving-throw tables, [PPD, PetPoly, RSW, Breath, Spell], roll d20 >= value.
# Each entry is (minimum level for the band, row).  The fighter table has a real level-0 row.
# --------------------------------------------------------------------------------------
SAVE_TABLES: dict[str, tuple[tuple[int, tuple[int, ...]], ...]] = {
    "fighter": (
        (0, (16, 17, 18, 20, 19)),
        (1, (14, 15, 16, 17, 17)),
        (3, (13, 14, 15, 16, 16)),
        (5, (11, 12, 13, 13, 14)),
        (7, (10, 11, 12, 12, 13)),
        (9, (8, 9, 10, 9, 11)),
        (11, (7, 8, 9, 8, 10)),
        (13, (5, 6, 7, 5, 8)),
        (15, (4, 5, 6, 4, 7)),
        (17, (3, 4, 5, 4, 6)),
    ),
    "cleric": (
        (1, (10, 13, 14, 16, 15)),
        (4, (9, 12, 13, 15, 14)),
        (7, (7, 10, 11, 13, 12)),
        (10, (6, 9, 10, 12, 11)),
        (13, (5, 8, 9, 11, 10)),
        (16, (4, 7, 6, 10, 9)),
        (19, (2, 5, 4, 8, 7)),
    ),
    "magicUser": (
        (1, (14, 13, 11, 15, 12)),
        (6, (13, 11, 9, 13, 10)),
        (11, (11, 9, 7, 11, 8)),
        (16, (10, 7, 5, 9, 6)),
        (21, (8, 5, 3, 7, 4)),
    ),
    "thief": (
        (1, (13, 12, 14, 16, 15)),
        (5, (12, 11, 12, 15, 13)),
        (9, (11, 10, 10, 14, 11)),
        (13, (10, 9, 8, 13, 9)),
        (17, (9, 8, 6, 12, 7)),
        (21, (8, 7, 4, 11, 5)),
    ),
}

ALL_CLASSES = ("fighter", "cleric", "magicUser", "thief")


def canonical_row(cls: str, level: int) -> tuple[int, ...]:
    """The 1e save row for `cls` at `level`.  Levels above the last band clamp to it; a level
    below the table's first band clamps up to the first band (only the fighter table has a
    level-0 row, and it is a real DMG row, not a clamp)."""
    bands = SAVE_TABLES[cls]
    row = bands[0][1]
    for minlevel, r in bands:
        if level >= minlevel:
            row = r
        else:
            break
    return row


def levels_producing(cls: str, row: Sequence[int], max_level: int = 40) -> list[int]:
    """Every key value in 0..max_level whose `cls` row equals `row`."""
    target = tuple(row)
    return [lv for lv in range(max_level + 1) if canonical_row(cls, lv) == target]


# --------------------------------------------------------------------------------------
# Record loading (own DAX TOC + signed-byte RLE via dax_decode -- never the TS loader)
# --------------------------------------------------------------------------------------
class Record(NamedTuple):
    block_id: int
    name: str
    data: bytes

    def row(self, save_off: int) -> tuple[int, ...]:
        return tuple(self.data[save_off:save_off + 5])


class Corpus(NamedTuple):
    label: str
    records: tuple[Record, ...]
    size: int
    save_off: int
    hd_off: int


def load_records(path: Path, size: Optional[int] = None) -> tuple[Record, ...]:
    data = path.read_bytes()
    base, blocks = parse_container(data)
    out: list[Record] = []
    for blk in blocks:
        raw = decompress_block(data, base, blk)
        if not raw:
            continue
        if size is not None and len(raw) != size:
            continue
        n = raw[0]
        name = raw[1:1 + n].decode("latin1", "replace").strip() if 0 < n <= 15 else ""
        out.append(Record(blk.block_id, name, raw))
    return tuple(out)


#: The undocumented-until-2026-08-14 fifth source location.  Read-only, never vendored, so the
#: two corpora that live here are absent on a bare clone and every consumer must tolerate that.
GOG_GALAXY = Path("C:/Program Files (x86)/GOG Galaxy/Games")

CORPUS_SPECS: dict[str, tuple[Path, int, int, int]] = {
    # label: (path, record size, saves offset, hit-dice offset).  The offsets are the shipped
    # per-title layouts from packages/engine/src/loaders/monster.ts.
    "dok": (REPO / "Death Knights of Krynn" / "MON1CHA.DAX", 216, 42, 48),
    "cok": (REPO / "Champions of Krynn" / "MON1CHA.DAX", 409, 208, 214),
    "cok2": (REPO / "Champions of Krynn" / "MON2CHA.DAX", 409, 208, 214),
    "cok3": (REPO / "Champions of Krynn" / "MON3CHA.DAX", 409, 208, 214),
    "secret": (GOG_GALAXY / "Secret of the Silver Blades" / "MON1CHA.DAX", 439, 232, 238),
    "coab": (GOG_GALAXY / "Curse of the Azure Bonds" / "MON1CHA.DAX", 422, 0xDF, 0xE5),
}


def load_corpus(key: str) -> Corpus:
    path, size, save_off, hd_off = CORPUS_SPECS[key]
    return Corpus(key, load_records(path, size), size, save_off, hd_off)


# --------------------------------------------------------------------------------------
# The sweep
# --------------------------------------------------------------------------------------
def matches_at(corpus: Corpus, offset: int,
               classes: Iterable[str] = ("fighter",)) -> list[Record]:
    """Records whose save row equals the canonical row for the key byte at `offset`, under any
    of `classes`."""
    classes = tuple(classes)
    hits = []
    for rec in corpus.records:
        if offset >= len(rec.data):
            continue
        key = rec.data[offset]
        row = rec.row(corpus.save_off)
        if any(canonical_row(c, key) == row for c in classes):
            hits.append(rec)
    return hits


def sweep(corpus: Corpus, classes: Iterable[str] = ("fighter",)) -> list[tuple[int, int]]:
    """[(offset, match_count)] for every offset in the record, ranked best-first then by
    offset.  Offsets overlapping the save window itself are INCLUDED -- they are part of the
    216 chances the max is taken over, and excluding them would flatter the winner."""
    classes = tuple(classes)
    scores = [(off, len(matches_at(corpus, off, classes))) for off in range(corpus.size)]
    scores.sort(key=lambda t: (-t[1], t[0]))
    return scores


def save_window_sweep(corpus: Corpus,
                      classes: Iterable[str] = ("fighter",)) -> list[tuple[int, int]]:
    """The mirror-image control: hold the key at the hd offset and slide the FIVE-BYTE save
    window instead, [(window offset, match count)] ranked.  Re-derives the "0/64 at any other
    window" half of the established finding, so this tool can restate it rather than cite it."""
    classes = tuple(classes)
    out = []
    for w in range(corpus.size - 4):
        cnt = sum(
            1 for rec in corpus.records
            if any(canonical_row(c, rec.data[corpus.hd_off]) == tuple(rec.data[w:w + 5])
                   for c in classes)
        )
        out.append((w, cnt))
    out.sort(key=lambda t: (-t[1], t[0]))
    return out


def best_constant_score(corpus: Corpus,
                        classes: Iterable[str] = ("fighter",)) -> tuple[int, int]:
    """The score reachable by a column that ignores the record: (best key value, count).
    This is the cheapest floor -- the save rows repeat, so it is far from zero."""
    classes = tuple(classes)
    rows = [rec.row(corpus.save_off) for rec in corpus.records]
    best = (0, -1)
    for v in range(256):
        c = sum(1 for row in rows if any(canonical_row(cl, v) == row for cl in classes))
        if c > best[1]:
            best = (v, c)
    return best


def _sweep_max_for_columns(rows, columns, classes=("fighter",)) -> int:
    """Max over `columns` of the match count, given precomputed save rows."""
    best = 0
    for col in columns:
        c = sum(1 for row, key in zip(rows, col)
                if any(canonical_row(cl, key) == row for cl in classes))
        if c > best:
            best = c
    return best


def permutation_null(corpus: Corpus, trials: int = 200, seed: int = 12345,
                     classes: Iterable[str] = ("fighter",)) -> list[int]:
    """Shuffle every column's values across records (exact per-column value multiset
    preserved, all association with the record destroyed), re-run the whole offset sweep, and
    record the MAX.  Returns one max per trial."""
    classes = tuple(classes)
    rng = random.Random(seed)
    rows = [rec.row(corpus.save_off) for rec in corpus.records]
    base_cols = [[rec.data[off] for rec in corpus.records] for off in range(corpus.size)]
    out = []
    for _ in range(trials):
        cols = []
        for col in base_cols:
            c = list(col)
            rng.shuffle(c)
            cols.append(c)
        out.append(_sweep_max_for_columns(rows, cols, classes))
    return out


def empirical_draw_null(corpus: Corpus, trials: int = 200, seed: int = 999,
                        classes: Iterable[str] = ("fighter",)) -> list[int]:
    """Key bytes drawn i.i.d. from the observed hit-dice value distribution, one synthetic
    column per record offset per trial, statistic = max over columns."""
    classes = tuple(classes)
    rng = random.Random(seed)
    rows = [rec.row(corpus.save_off) for rec in corpus.records]
    pool = [rec.data[corpus.hd_off] for rec in corpus.records]
    n = len(rows)
    out = []
    for _ in range(trials):
        cols = [[rng.choice(pool) for _ in range(n)] for _ in range(corpus.size)]
        out.append(_sweep_max_for_columns(rows, cols, classes))
    return out


# --------------------------------------------------------------------------------------
# Residue analysis
# --------------------------------------------------------------------------------------
class Residue(NamedTuple):
    record: Record
    hd: int
    row: tuple[int, ...]
    #: class -> key values that would have produced this row
    keys: dict[str, list[int]]


def residue(corpus: Corpus, classes: Iterable[str] = ("fighter",)) -> list[Residue]:
    """Records the `classes` sweep at the hd offset does NOT explain, with the key values that
    would have explained them under each class table."""
    classes = tuple(classes)
    explained = {r.block_id for r in matches_at(corpus, corpus.hd_off, classes)}
    out = []
    for rec in corpus.records:
        if rec.block_id in explained:
            continue
        row = rec.row(corpus.save_off)
        keys = {}
        for cl in ALL_CLASSES:
            lv = levels_producing(cl, row)
            if lv:
                keys[cl] = lv
        out.append(Residue(rec, rec.data[corpus.hd_off], row, keys))
    return out


def split_residue(res: Sequence[Residue]):
    """(other_class_at_own_hd, wrong_band, no_canonical_row)."""
    own, wrong, none = [], [], []
    for r in res:
        if not r.keys:
            none.append(r)
        elif any(r.hd in ks for ks in r.keys.values()):
            own.append(r)
        else:
            wrong.append(r)
    return own, wrong, none


def offsets_explaining(corpus: Corpus, targets: Sequence[Record],
                       classes: Iterable[str] = ALL_CLASSES) -> list[int]:
    """Offsets whose byte explains EVERY record in `targets` (under any of `classes`)."""
    classes = tuple(classes)
    ok = []
    for off in range(corpus.size):
        if all(
            any(canonical_row(c, rec.data[off]) == rec.row(corpus.save_off) for c in classes)
            for rec in targets
        ):
            ok.append(off)
    return ok


def best_offset_for(corpus: Corpus, targets: Sequence[Record],
                    classes: Iterable[str] = ALL_CLASSES) -> tuple[int, int]:
    """(count, offset) for the offset that explains the most of `targets`."""
    classes = tuple(classes)
    best = (-1, -1)
    for off in range(corpus.size):
        c = sum(1 for rec in targets
                if any(canonical_row(cl, rec.data[off]) == rec.row(corpus.save_off)
                       for cl in classes))
        if c > best[0]:
            best = (c, off)
    return best


def superset_offsets(corpus: Corpus,
                     classes: Iterable[str] = ("fighter",)) -> list[tuple[int, int]]:
    """Offsets whose explained set is a strict superset of the hd offset's explained set."""
    classes = tuple(classes)
    base = {r.block_id for r in matches_at(corpus, corpus.hd_off, classes)}
    out = []
    for off in range(corpus.size):
        if off == corpus.hd_off:
            continue
        got = {r.block_id for r in matches_at(corpus, off, classes)}
        if got > base:
            out.append((off, len(got)))
    return out


# --------------------------------------------------------------------------------------
# Table-free tests
#
# The sweep above assumes the key indexes the 1e tables.  A hidden field need not: the engine
# could hold any value -> row lookup.  These functions therefore ask the *table-free* question
# -- "how much of the corpus could ANY function of this byte explain?" -- which is the fitted
# ceiling, i.e. the modal row within each value group.  That statistic rises purely with the
# number of distinct values (a byte with 64 distinct values scores 64/64 for free), so it is
# meaningless without the per-offset permutation null that accompanies it here.
# --------------------------------------------------------------------------------------
def fitted_coverage(rows: Sequence[Sequence[int]], column: Sequence[int]) -> int:
    """The best any value->row lookup on `column` could do: sum of the modal row count per
    distinct value.  An upper bound on every hypothesis that keys the row off this byte."""
    groups: dict[int, "dict[tuple, int]"] = {}
    for v, row in zip(column, rows):
        g = groups.setdefault(v, {})
        key = tuple(row)
        g[key] = g.get(key, 0) + 1
    return sum(max(g.values()) for g in groups.values())


def fitted_coverage_sweep(corpus: Corpus, trials: int = 200, seed: int = 7):
    """[(excess, real, null_mean, null_max, offset, distinct_values)] for every offset,
    ranked by excess over its own column-permutation null.

    NOT offered for the joint key (hd, X).  That statistic was tried and REJECTED: at 64
    records, pairing hd with almost any high-entropy byte makes nearly every (hd, X) cell a
    singleton, so the fitted coverage saturates at 64/64 for real and permuted columns alike.
    A synthetic corpus carrying a genuine second field scored z = +1.2 while the real corpus
    scored z = +4.3 -- the probe ranks a planted field BELOW noise, so it cannot fail in the
    informative direction and is not evidence.  The residue test (`offsets_explaining` /
    `best_offset_for`) is the joint question asked in a form that does not saturate."""
    rng = random.Random(seed)
    rows = [rec.row(corpus.save_off) for rec in corpus.records]

    def cov(col):
        return fitted_coverage(rows, col)

    out = []
    for off in range(corpus.size):
        col = [rec.data[off] for rec in corpus.records]
        real = cov(col)
        nulls = []
        for _ in range(trials):
            s = list(col)
            rng.shuffle(s)
            nulls.append(cov(s))
        mu = sum(nulls) / len(nulls)
        out.append((real - mu, real, mu, max(nulls), off, len(set(col))))
    out.sort(reverse=True)
    return out


# --------------------------------------------------------------------------------------
# "Is the row a canonical 1e row at all?" -- the hand-authoring test
# --------------------------------------------------------------------------------------
def canonical_rows(max_level: int = 40) -> tuple[tuple[int, ...], ...]:
    return tuple(sorted({canonical_row(cl, lv)
                         for cl in ALL_CLASSES for lv in range(max_level + 1)}))


def nearest_canonical(row: Sequence[int]) -> tuple[int, tuple[int, ...]]:
    """(L1 distance, nearest canonical row).  Distance 0 means the row IS a table row."""
    return min((sum(abs(a - b) for a, b in zip(row, cr)), cr) for cr in canonical_rows())


def exact_canonical_count(corpus: Corpus) -> int:
    return sum(1 for rec in corpus.records
               if nearest_canonical(rec.row(corpus.save_off))[0] == 0)


def column_shuffle_null(corpus: Corpus, trials: int = 500, seed: int = 5) -> list[int]:
    """Shuffle each of the five save columns independently across records.  Every column keeps
    its exact marginal distribution; only the pairing into rows is destroyed.  Returns the
    exact-canonical-row count per trial -- the null for `exact_canonical_count`."""
    rng = random.Random(seed)
    rows = [rec.row(corpus.save_off) for rec in corpus.records]
    n = len(rows)
    cols = [[row[i] for row in rows] for i in range(5)]
    out = []
    for _ in range(trials):
        sh = []
        for col in cols:
            s = list(col)
            rng.shuffle(s)
            sh.append(s)
        out.append(sum(1 for k in range(n)
                       if nearest_canonical(tuple(sh[i][k] for i in range(5)))[0] == 0))
    return out


def rows_by_hd(corpus: Corpus) -> dict[int, dict[tuple[int, ...], int]]:
    """hd value -> {save row: count}.  If the row were a function of hd, every inner dict
    would have exactly one entry."""
    out: dict[int, dict[tuple[int, ...], int]] = {}
    for rec in corpus.records:
        g = out.setdefault(rec.data[corpus.hd_off], {})
        row = rec.row(corpus.save_off)
        g[row] = g.get(row, 0) + 1
    return out


def shared_monsters(a: Corpus, b: Corpus) -> list[tuple[str, int, tuple, int, tuple]]:
    """Monsters present in both corpora by name: (name, hd_a, row_a, hd_b, row_b).  Two games
    disagreeing on the row for the same monster at the same hd is the cleanest possible
    falsification of "the row is derived from a record field"."""
    ba = {r.name: r for r in a.records}
    out = []
    for r in b.records:
        if r.name in ba:
            x = ba[r.name]
            out.append((r.name, x.data[a.hd_off], x.row(a.save_off),
                        r.data[b.hd_off], r.row(b.save_off)))
    return out


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------
def _fmt_row(row: Sequence[int]) -> str:
    return "[" + ",".join(f"{v:2d}" for v in row) + "]"


def cmd_sweep(args) -> None:
    corpus = load_corpus(args.corpus)
    classes = ALL_CLASSES if args.any_class else ("fighter",)
    scores = sweep(corpus, classes)
    n = len(corpus.records)
    print(f"# {corpus.label}: {n} records of {corpus.size} bytes, "
          f"saves @{corpus.save_off}..{corpus.save_off + 4}, hd @{corpus.hd_off}")
    print(f"# classes tested: {', '.join(classes)}")
    print(f"# hd offset @{corpus.hd_off} scores {dict(scores)[corpus.hd_off]}/{n}")
    v, c = best_constant_score(corpus, classes)
    print(f"# best-constant floor: key value {v} scores {c}/{n} "
          "(a column that ignores the record entirely)")
    print(f"# top {args.top} offsets:")
    for off, cnt in scores[:args.top]:
        mark = "  <-- hd" if off == corpus.hd_off else ""
        print(f"  @{off:3d}  {cnt:3d}/{n}{mark}")
    others = [(o, cnt) for o, cnt in scores if o != corpus.hd_off]
    print(f"# best NON-hd offset: @{others[0][0]} = {others[0][1]}/{n}")
    sup = superset_offsets(corpus, classes)
    print(f"# offsets explaining a strict SUPERSET of @{corpus.hd_off}: {sup if sup else 'NONE'}")


def cmd_null(args) -> None:
    corpus = load_corpus(args.corpus)
    n = len(corpus.records)
    perm = permutation_null(corpus, trials=args.trials, seed=args.seed)
    emp = empirical_draw_null(corpus, trials=args.trials, seed=args.seed + 1)
    v, c = best_constant_score(corpus)
    scores = dict(sweep(corpus))
    others = sorted(((cnt, o) for o, cnt in scores.items() if o != corpus.hd_off), reverse=True)
    print(f"# {corpus.label}, fighter table, {args.trials} trials")
    print(f"real     : hd @{corpus.hd_off} = {scores[corpus.hd_off]}/{n}")
    print(f"real     : best non-hd offset @{others[0][1]} = {others[0][0]}/{n}")
    print(f"floor    : best constant (key={v}) = {c}/{n}")
    for name, samples in (("perm-null", perm), ("draw-null", emp)):
        samples = sorted(samples)
        mean = sum(samples) / len(samples)
        p95 = samples[int(0.95 * (len(samples) - 1))]
        print(f"{name}: max-over-{corpus.size}-offsets  mean {mean:.2f}  "
              f"p95 {p95}  max {samples[-1]}  min {samples[0]}")


def cmd_residue(args) -> None:
    corpus = load_corpus(args.corpus)
    res = residue(corpus)
    print(f"# {corpus.label}: {len(res)}/{len(corpus.records)} records unexplained by "
          f"fighter@{corpus.hd_off}")
    for r in res:
        keys = "; ".join(
            f"{cl}:{'+'.join(str(k) for k in ks[:6])}{'..' if len(ks) > 6 else ''}"
            for cl, ks in r.keys.items()
        ) or "NO canonical row (any class, levels 0..40)"
        print(f"  blk {r.record.block_id:3d} {r.record.name:<16} hd {r.hd:2d} "
              f"{_fmt_row(r.row)}  {keys}")
    own, wrong, none = split_residue(res)
    print(f"# {len(own)} are another class's row at their OWN hd; "
          f"{len(wrong)} carry a canonical row at a DIFFERENT band; "
          f"{len(none)} match no canonical row at all")
    targets = [r.record for r in wrong]
    offs = offsets_explaining(corpus, targets)
    print(f"# offsets explaining ALL {len(targets)} wrong-band records: "
          f"{offs if offs else 'NONE'}")
    cnt, off = best_offset_for(corpus, targets)
    print(f"# best single offset explains {cnt}/{len(targets)} of them (@{off})")


def cmd_oracle(args) -> None:
    corpus = load_corpus(args.corpus)
    n = len(corpus.records)
    out = fitted_coverage_sweep(corpus, trials=args.trials, seed=args.seed)
    print(f"# {corpus.label}: table-free fitted ceiling, key = one byte, "
          f"{args.trials} permutations per offset")
    print("# 'fitted' = the best ANY value->row lookup on that byte could score, so it is an "
          "upper bound\n# on every hypothesis keyed off it -- and it inflates with the byte's "
          "distinct-value count,\n# which is exactly what the per-offset permutation null "
          "controls for.")
    print("  offset  distinct   fitted   perm-null mean/max   excess")
    for ex, real, mu, mx, off, d in out[:args.top]:
        tag = ""
        if off == corpus.hd_off:
            tag = "  <-- hd"
        elif corpus.save_off <= off <= corpus.save_off + 4:
            tag = "  <-- a save byte (trivially self-predictive)"
        print(f"   @{off:3d}   {d:5d}   {real:4d}/{n}   {mu:9.2f}/{mx:<4d}   {ex:+7.2f}{tag}")
    tail = out[-1]
    print(f"  (floor: @{tail[4]} excess {tail[0]:+.2f})")


def cmd_canon(args) -> None:
    for key in (sorted(CORPUS_SPECS) if args.corpus == "all" else [args.corpus]):
        corpus = load_corpus(key)
        n = len(corpus.records)
        ex = exact_canonical_count(corpus)
        nulls = column_shuffle_null(corpus, trials=args.trials)
        print(f"# {corpus.label}: {ex}/{n} save rows are EXACT canonical 1e rows "
              f"(some class, some level 0..40)")
        print(f"#   column-shuffle null: mean {sum(nulls) / len(nulls):.2f}/{n}, "
              f"max {max(nulls)} over {args.trials} trials")
        for rec in corpus.records:
            row = rec.row(corpus.save_off)
            l1, cr = nearest_canonical(row)
            if l1:
                print(f"    {rec.name:<16} hd {rec.data[corpus.hd_off]:2d} {_fmt_row(row)} "
                      f"nearest {_fmt_row(cr)}  L1={l1}")
        by_hd = rows_by_hd(corpus)
        multi = sum(1 for g in by_hd.values() if len(g) > 1)
        ceiling = sum(max(g.values()) for g in by_hd.values())
        print(f"#   the row is NOT a function of hd: {multi}/{len(by_hd)} hd values carry more "
              f"than one row;\n#   a per-hd lookup fitted to the data itself tops out at "
              f"{ceiling}/{n}")


def cmd_crosscheck(args) -> None:
    a, b = load_corpus(args.a), load_corpus(args.b)
    print(f"# monsters present in BOTH {a.label} and {b.label}, by name")
    print(f"  {'name':<16} {a.label:>6} hd  row                     "
          f"{b.label:>6} hd  row")
    disagree = 0
    same_hd_disagree = 0
    for name, hda, rowa, hdb, rowb in shared_monsters(a, b):
        flag = ""
        if rowa != rowb:
            disagree += 1
            flag = "  DIFFERENT ROW"
            if hda == hdb:
                same_hd_disagree += 1
                flag += " AT THE SAME HD"
        print(f"  {name:<16} {hda:9d}  {_fmt_row(rowa)}   {hdb:9d}  {_fmt_row(rowb)}{flag}")
    print(f"# {disagree} shared monsters carry a different save row in the two games; "
          f"{same_hd_disagree} of those have the SAME hd byte in both.")
    print("# Any hypothesis that derives the row from a record field must explain how the "
          "same\n# monster at the same hd gets two different rows.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sweep", help="rank every record offset as a save-row key")
    s.add_argument("--corpus", default="dok", choices=sorted(CORPUS_SPECS))
    s.add_argument("--top", type=int, default=12)
    s.add_argument("--any-class", action="store_true")
    s.set_defaults(func=cmd_sweep)

    s = sub.add_parser("null", help="report the floors the sweep must beat")
    s.add_argument("--corpus", default="dok", choices=sorted(CORPUS_SPECS))
    s.add_argument("--trials", type=int, default=200)
    s.add_argument("--seed", type=int, default=12345)
    s.set_defaults(func=cmd_null)

    s = sub.add_parser("residue",
                       help="what the hd key leaves unexplained, and what would explain it")
    s.add_argument("--corpus", default="dok", choices=sorted(CORPUS_SPECS))
    s.set_defaults(func=cmd_residue)

    s = sub.add_parser("oracle",
                       help="table-free fitted ceiling per offset, vs a per-offset null")
    s.add_argument("--corpus", default="dok", choices=sorted(CORPUS_SPECS))
    s.add_argument("--top", type=int, default=12)
    s.add_argument("--trials", type=int, default=200)
    s.add_argument("--seed", type=int, default=7)
    s.set_defaults(func=cmd_oracle)

    s = sub.add_parser("canon", help="how many rows are exact 1e table rows, vs a null")
    s.add_argument("--corpus", default="dok", choices=sorted(CORPUS_SPECS) + ["all"])
    s.add_argument("--trials", type=int, default=500)
    s.set_defaults(func=cmd_canon)

    s = sub.add_parser("crosscheck", help="same monster, two games: same row?")
    s.add_argument("--a", default="cok", choices=sorted(CORPUS_SPECS))
    s.add_argument("--b", default="dok", choices=sorted(CORPUS_SPECS))
    s.set_defaults(func=cmd_crosscheck)

    args = ap.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
