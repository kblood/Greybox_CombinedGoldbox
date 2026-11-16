r"""
Pins every number in `docs/engine/research/dok-save-key-sweep.md`.

The doc reports a NEGATIVE -- there is no second, level-ish key field behind the Death
Knights of Krynn monster saving-throw rows -- so most of these tests assert a ceiling rather
than a floor.  A ceiling assertion is only worth anything if the measurement it caps is able
to exceed it, so three tests plant a real hidden key field and require the same functions to
find it: `test_planting_the_needed_levels_in_a_real_record_byte_makes_the_sweep_find_it`
(the strongest -- it plants the exact field the hypothesis predicts into the REAL retail
records), plus `test_sweep_finds_an_injected_key_field` and
`test_oracle_finds_an_injected_lookup_field` on synthetic corpora.  Without them every
ceiling here would also pass on a sweep that always returned zero.

Injecting a fault into `canonical_row`, `matches_at`, `offsets_explaining`,
`fitted_coverage` or `nearest_canonical` each turns this file red (10, 10, 2, 2 and 7 tests
respectively) -- checked, then reverted.

Retail data: four archives live in the repo (`Death Knights of Krynn/MON1CHA.DAX`,
`Champions of Krynn/MON{1,2,3}CHA.DAX`), and two come from the external, never-vendored GOG
Galaxy installs (Secret of the Silver Blades, Curse of the Azure Bonds).  Every test skips if
its file is missing rather than failing.
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dok_save_key_sweep as K  # noqa: E402


def corpus(key: str) -> K.Corpus:
    path = K.CORPUS_SPECS[key][0]
    if not path.exists():
        pytest.skip(f"retail data absent: {path}")
    return K.load_corpus(key)


@pytest.fixture(scope="module")
def dok() -> K.Corpus:
    return corpus("dok")


# --------------------------------------------------------------------------------------
# The corpus itself
# --------------------------------------------------------------------------------------
def test_corpus_shape(dok):
    assert len(dok.records) == 64
    assert all(len(r.data) == 216 for r in dok.records)
    assert (dok.save_off, dok.hd_off) == (42, 48)
    names = {r.name for r in dok.records}
    for n in ("ZOMBIE MASTODON", "SIR DRYDEN", "LORD SOTH", "GHOUL"):
        assert n in names


def test_save_tables_reproduce_known_1e_rows():
    # Bands the shipped ruleset table (`combatTables.ts`) stops before, plus one it covers.
    assert K.canonical_row("fighter", 1) == (14, 15, 16, 17, 17)
    assert K.canonical_row("fighter", 12) == (7, 8, 9, 8, 10)
    assert K.canonical_row("fighter", 15) == (4, 5, 6, 4, 7)
    assert K.canonical_row("fighter", 17) == (3, 4, 5, 4, 6)
    assert K.canonical_row("fighter", 99) == (3, 4, 5, 4, 6)  # clamps to the last band
    assert K.canonical_row("cleric", 8) == (7, 10, 11, 13, 12)
    assert K.canonical_row("magicUser", 13) == (11, 9, 7, 11, 8)
    assert K.canonical_row("thief", 6) == (12, 11, 12, 15, 13)


# --------------------------------------------------------------------------------------
# The established baseline, re-derived rather than cited
# --------------------------------------------------------------------------------------
def test_hd_offset_scores_43_of_64_on_the_fighter_table(dok):
    assert len(K.matches_at(dok, 48, ("fighter",))) == 43


def test_hd_offset_scores_50_of_64_when_all_four_class_tables_are_allowed(dok):
    assert len(K.matches_at(dok, 48, K.ALL_CLASSES)) == 50


def test_only_the_42_window_is_the_save_block(dok):
    """Control in the other direction: slide the 5-byte window, keep the key at @48."""
    ranked = K.save_window_sweep(dok)
    assert ranked[0] == (42, 43)
    assert all(cnt == 0 for _, cnt in ranked[1:])


# --------------------------------------------------------------------------------------
# 1. The 216-offset sweep, and 2. the nulls it must beat
# --------------------------------------------------------------------------------------
def test_no_offset_beats_hd_and_none_explains_a_superset(dok):
    ranked = K.sweep(dok)
    assert ranked[0] == (48, 43)
    non_hd = [(o, c) for o, c in ranked if o != 48]
    assert non_hd[0] == (71, 37)          # @71 is the known hd mirror, not a second field
    assert sum(1 for r in dok.records if r.data[71] == r.data[48]) == 47
    assert K.superset_offsets(dok) == []
    assert K.superset_offsets(dok, K.ALL_CLASSES) == []


def test_everything_except_hd_and_its_mirror_sits_at_or_below_the_noise_floor(dok):
    """THE headline null.  A max over 216 offsets is a max over 216 chances, so the floor is
    the max the same sweep reaches on column-permuted data."""
    ranked = dict(K.sweep(dok))
    third = max(c for o, c in ranked.items() if o not in (48, 71))
    assert third == 14                        # @22/@23, the ability-score bytes

    floor = K.permutation_null(dok, trials=60, seed=12345)
    assert max(floor) >= third, "the third-best real offset is not above the noise floor"
    assert max(floor) < 43, "the null must not reach the hd offset's score"

    draw = K.empirical_draw_null(dok, trials=60, seed=999)
    assert max(draw) >= third
    assert max(draw) < 43

    # And the cheapest floor of all: a column that ignores the record entirely.
    assert K.best_constant_score(dok) == (9, 13)


# --------------------------------------------------------------------------------------
# 3. The residue, and the direct "does one offset explain the ten?" test
# --------------------------------------------------------------------------------------
def test_residue_splits_7_10_4(dok):
    own, wrong, none = K.split_residue(K.residue(dok))
    assert (len(own), len(wrong), len(none)) == (7, 10, 4)
    assert {r.record.name for r in wrong} == {
        "ZOMBIE MASTODON", "SKELETAL GIANT", "WIGHT", "SPECTRE", "GHAST",
        "CRAZED DWARF", "SIR DRYDEN", "FLAVIUS", "DURFEY", "UNDEAD DURFEY",
    }
    assert {r.record.name for r in none} == {
        "UNDEAD BEAST", "BLACK MAGE", "EVIL WARRIOR", "LORD SOTH",
    }


def test_no_offset_explains_the_ten_and_the_best_is_inside_its_own_null(dok):
    _, wrong, _ = K.split_residue(K.residue(dok))
    targets = [r.record for r in wrong]
    assert K.offsets_explaining(dok, targets) == []
    count, _off = K.best_offset_for(dok, targets)
    assert count == 3

    # Null for that 3: permute each column, take the max over all 216 offsets.
    need = {}
    for r in wrong:
        ks = set()
        for lv in r.keys.values():
            ks |= set(lv)
        need[r.record.block_id] = ks
    idx = {r.block_id: i for i, r in enumerate(dok.records)}
    rng = random.Random(4242)
    maxes = []
    for _ in range(60):
        best = 0
        for off in range(dok.size):
            col = [r.data[off] for r in dok.records]
            rng.shuffle(col)
            best = max(best, sum(1 for r in wrong
                                 if col[idx[r.record.block_id]] in need[r.record.block_id]))
        maxes.append(best)
    assert max(maxes) >= count, "the best real offset does not even clear the null's maximum"


def test_no_transform_of_any_byte_explains_the_ten(dok):
    """Widen the hypothesis space past raw bytes: nibbles, masks, shifts, u16s, hd offsets."""
    _, wrong, _ = K.split_residue(K.residue(dok))
    need = {}
    for r in wrong:
        ks = set()
        for lv in r.keys.values():
            ks |= set(lv)
        need[r.record.block_id] = ks

    transforms = []
    for off in range(dok.size):
        transforms += [
            lambda d, o=off: d[o],
            lambda d, o=off: d[o] & 0x0F,
            lambda d, o=off: d[o] >> 4,
            lambda d, o=off: d[o] & 0x7F,
            lambda d, o=off: d[o] >> 1,
        ]
        if off < dok.size - 1:
            transforms += [
                lambda d, o=off: d[o] | (d[o + 1] << 8),
                lambda d, o=off: (d[o] << 8) | d[o + 1],
            ]
    transforms += [lambda d, k=k: max(0, d[48] + k) for k in range(-6, 7)]

    best = max(sum(1 for r in wrong if f(r.record.data) in need[r.record.block_id])
               for f in transforms)
    assert len(transforms) > 1500
    assert best == 5, "a transform now explains a different number of the ten"


def test_table_free_oracle_finds_no_second_field(dok):
    """Drop the assumption that the key indexes the 1e tables: ask what ANY value->row lookup
    on each byte could reach.  Only the save bytes themselves, hd@48, its mirror @71 and the
    HD-correlated THAC0 byte @31 rise clear of their own permutation nulls."""
    out = K.fitted_coverage_sweep(dok, trials=60, seed=7)
    strong = {off for excess, *_rest, off, _d in
              [(e, r, m, x, o, d) for e, r, m, x, o, d in out] if excess > 10}
    assert strong == {42, 43, 44, 45, 46, 48, 71, 31}
    by_off = {o: (e, r, d) for e, r, _m, _x, o, d in out}
    assert by_off[48][1] == 45      # a per-hd lookup fitted to the data itself caps at 45/64
    assert by_off[71][1] == 41
    rest = max(e for e, _r, _m, _x, o, _d in out if o not in strong)
    assert rest < 7.5, "some other byte now clears the noise band"


def test_planting_the_needed_levels_in_a_real_record_byte_makes_the_sweep_find_it(dok):
    """The falsifiability proof for the whole negative, run on the REAL corpus rather than on
    synthetic noise: write into a spare byte exactly the second field the hypothesis predicts
    (each record's own hd, except the ten wrong-band records, which get the level their row
    actually implies).  The unchanged `sweep`, `superset_offsets` and `offsets_explaining` must
    all promote that byte.  They do not do so for any byte of the retail file."""
    _own, wrong, _none = K.split_residue(K.residue(dok))
    plant = {r.record.block_id: min(min(lv) for lv in r.keys.values()) for r in wrong}
    slot = 150
    assert dict(K.sweep(dok))[slot] < 14, "pick a slot that is not already scoring"

    recs = []
    for rec in dok.records:
        d = bytearray(rec.data)
        d[slot] = plant.get(rec.block_id, rec.data[dok.hd_off])
        recs.append(K.Record(rec.block_id, rec.name, bytes(d)))
    planted = K.Corpus("planted", tuple(recs), dok.size, dok.save_off, dok.hd_off)

    ranked = K.sweep(planted, K.ALL_CLASSES)
    assert ranked[0][0] == slot
    assert ranked[0][1] == 60           # the 50 hd already explained, plus all ten
    assert slot in [o for o, _n in K.superset_offsets(planted, K.ALL_CLASSES)]
    by_id = {r.block_id: r for r in planted.records}
    ten = [by_id[r.record.block_id] for r in wrong]
    assert K.offsets_explaining(planted, ten) == [slot]
    assert max(K.permutation_null(planted, trials=40, classes=K.ALL_CLASSES)) < 60


# --------------------------------------------------------------------------------------
# 4. The rival hypothesis: SSI hand-authored these rows
# --------------------------------------------------------------------------------------
def test_rows_are_transcribed_1e_table_rows_far_beyond_any_null(dok):
    assert K.exact_canonical_count(dok) == 60
    nulls = K.column_shuffle_null(dok, trials=200, seed=5)
    assert max(nulls) <= 3, "the shuffle null is producing table rows by chance"


def test_the_four_non_canonical_rows_are_single_column_edits_of_a_table_row(dok):
    got = {}
    for rec in dok.records:
        l1, near = K.nearest_canonical(rec.row(dok.save_off))
        if l1:
            got[rec.name] = (l1, near)
    assert got == {
        "UNDEAD BEAST": (4, (5, 6, 7, 5, 8)),    # fighter 13-14, spell column 8 -> 4
        "BLACK MAGE": (4, (13, 11, 9, 13, 10)),  # magic-user 6-10, four columns 1 better
        "EVIL WARRIOR": (5, (5, 6, 7, 5, 8)),    # fighter 13-14, every column 1 worse
        "LORD SOTH": (2, (3, 4, 5, 4, 6)),       # fighter 17+, breath and spell 1 better
    }
    # Null: a shuffled row's distance to the nearest table row, for scale.
    rng = random.Random(31337)
    rows = [r.row(dok.save_off) for r in dok.records]
    cols = [[row[i] for row in rows] for i in range(5)]
    dists = []
    for _ in range(200):
        sh = []
        for col in cols:
            s = list(col)
            rng.shuffle(s)
            sh.append(s)
        dists += [K.nearest_canonical(tuple(sh[i][k] for i in range(5)))[0]
                  for k in range(len(rows))]
    assert sum(dists) / len(dists) > 6, "the shuffle null is not far from the tables"
    assert max(l1 for l1, _ in got.values()) == 5


def test_the_row_is_not_a_function_of_hd(dok):
    by_hd = K.rows_by_hd(dok)
    assert len(by_hd) == 15
    assert sum(1 for g in by_hd.values() if len(g) > 1) == 8
    assert sum(max(g.values()) for g in by_hd.values()) == 45


# --------------------------------------------------------------------------------------
# Cross-title validation (does the hypothesis survive another file?)
# --------------------------------------------------------------------------------------
def test_same_monster_same_hd_different_row_across_the_two_games():
    cok, dok = corpus("cok"), corpus("dok")
    shared = {n: (ha, ra, hb, rb) for n, ha, ra, hb, rb in K.shared_monsters(cok, dok)}
    assert set(shared) == {"RED DRAGON", "GHOUL", "SIVAK"}
    for name in ("GHOUL", "SIVAK"):
        ha, ra, hb, rb = shared[name]
        assert ha == hb, name
        assert ra != rb, f"{name} would have to differ for the derived-field story to break"
    assert shared["GHOUL"][1] == (14, 15, 16, 16, 17)
    assert shared["GHOUL"][3] == (14, 15, 16, 17, 17)
    assert shared["SIVAK"][1] == (9, 10, 11, 11, 12)
    assert shared["SIVAK"][3] == (11, 12, 13, 13, 14)


@pytest.mark.parametrize("key,total,exact,fighter_at_hd", [
    ("cok", 26, 20, 14),
    ("cok2", 32, 21, 15),
    ("cok3", 30, 22, 17),
])
def test_cok_archives_show_the_same_picture(key, total, exact, fighter_at_hd):
    c = corpus(key)
    assert len(c.records) == total
    assert K.exact_canonical_count(c) == exact
    assert len(K.matches_at(c, c.hd_off, ("fighter",))) == fighter_at_hd
    assert K.superset_offsets(c) == []


@pytest.mark.parametrize("key,total,exact,fighter_at_hd,any_class_at_hd", [
    ("secret", 70, 62, 50, 59),
    ("coab", 18, 14, 10, 12),
])
def test_other_gen1_titles_show_the_same_picture(key, total, exact, fighter_at_hd,
                                                 any_class_at_hd):
    """External, never-vendored GOG Galaxy installs -- skip rather than fail when absent."""
    c = corpus(key)
    assert len(c.records) == total
    assert K.exact_canonical_count(c) == exact
    assert len(K.matches_at(c, c.hd_off, ("fighter",))) == fighter_at_hd
    assert len(K.matches_at(c, c.hd_off, K.ALL_CLASSES)) == any_class_at_hd
    assert K.superset_offsets(c) == []


def test_dok_has_no_effective_hd_byte_the_way_cok_and_coab_do():
    """CoK @306 and CoAB @318 hold HD-plus-bonus ("effective HD"), which for CoAB explains two
    monsters raw hd misses.  DoK's compact record carries no such byte: every offset that is
    >= hd on all 64 records exceeds it on ALL 64 (they are name characters, hp, the inverted
    THAC0/AC bytes), so none of them is hd plus a small bonus, and each scores 4/64."""
    dok_c = corpus("dok")
    hd = [r.data[dok_c.hd_off] for r in dok_c.records]
    found = []
    for off in range(dok_c.size):
        col = [r.data[off] for r in dok_c.records]
        if all(v >= h for v, h in zip(col, hd)):
            greater = sum(1 for v, h in zip(col, hd) if v > h)
            if greater >= 5:
                found.append((off, greater, len(K.matches_at(dok_c, off, K.ALL_CLASSES))))
    assert found, "the scan found nothing at all -- it cannot distinguish anything"
    assert all(g == len(hd) for _o, g, _s in found), "an hd-plus-bonus byte would not exceed hd everywhere"
    assert max(s for _o, _g, s in found) == 4

    coab = corpus("coab")     # the contrast case, on a file that DOES have the byte
    hdc = [r.data[coab.hd_off] for r in coab.records]
    col = [r.data[318] for r in coab.records]
    assert sum(1 for v, h in zip(col, hdc) if v == h) == 2
    assert sum(1 for v, h in zip(col, hdc) if v > h) == 13
    # the three that read 0 are the plot NPCs whose row is the off-table [1,1,1,1,1]
    assert sum(1 for v, h in zip(col, hdc) if v < h) == 3
    assert len(K.matches_at(coab, 318, ("fighter",))) == 10
    assert K.superset_offsets(coab) == []   # it still explains no superset of hd


def test_cok2_escort_npcs_carry_an_off_table_always_saves_row():
    """[1,1,1,1,1] is on no table at any level for any class -- a human typed it."""
    c = corpus("cok2")
    ones = {r.name for r in c.records if r.row(c.save_off) == (1, 1, 1, 1, 1)}
    assert ones == {"SIR RINGWALD", "LYN SWIFTFOOT", "VARIANNA", "MAYA"}
    assert K.nearest_canonical((1, 1, 1, 1, 1))[0] == 17


# --------------------------------------------------------------------------------------
# Falsifiability: the same functions must FIND a key field when one is really there
# --------------------------------------------------------------------------------------
def _synthetic(size: int, save_off: int, hd_off: int, key_off: int, n: int,
               lookup=None, seed: int = 1) -> K.Corpus:
    """A corpus whose save row genuinely IS keyed off `key_off`, with every other byte random."""
    rng = random.Random(seed)
    recs = []
    for i in range(n):
        d = bytearray(rng.randrange(256) for _ in range(size))
        lvl = rng.randrange(1, 21)
        d[key_off] = lvl
        d[hd_off] = rng.randrange(1, 21)
        row = lookup(lvl) if lookup else K.canonical_row("fighter", lvl)
        d[save_off:save_off + 5] = bytes(row)
        recs.append(K.Record(i, f"M{i}", bytes(d)))
    return K.Corpus("synthetic", tuple(recs), size, save_off, hd_off)


def test_sweep_finds_an_injected_key_field():
    c = _synthetic(216, 42, 48, key_off=137, n=64)
    ranked = K.sweep(c)
    assert ranked[0][0] == 137
    assert ranked[0][1] == 64
    assert K.superset_offsets(c) != [], "the injected field must beat the hd offset"
    assert max(K.permutation_null(c, trials=40)) < 64


def test_oracle_finds_an_injected_lookup_field():
    """A key whose value->row map is NOT the 1e table: the table-driven sweep must miss it and
    the table-free oracle must still find it.  This is what makes the oracle's null result on
    the real corpus mean something."""
    scramble = {lvl: ((lvl * 7) % 19 + 1, (lvl * 5) % 19 + 1, lvl % 19 + 1,
                      (lvl * 3) % 19 + 1, (lvl * 11) % 19 + 1) for lvl in range(21)}
    c = _synthetic(216, 42, 48, key_off=137, n=64, lookup=lambda lv: scramble[lv])
    assert dict(K.sweep(c)).get(137, 0) == 0, "the 1e-table sweep should be blind to this"
    out = K.fitted_coverage_sweep(c, trials=40, seed=7)
    ranked = [off for _e, _r, _m, _x, off, _d in out]
    assert 137 in ranked[:6]
    by_off = {off: (e, r) for e, r, _m, _x, off, _d in out}
    assert by_off[137][1] == 64
    assert by_off[137][0] > 20


def test_canonical_count_falls_when_a_row_is_perturbed(dok):
    """Prove `exact_canonical_count` can move: nudge one column of one record."""
    victim = dok.records[0]
    d = bytearray(victim.data)
    d[dok.save_off] = (d[dok.save_off] + 1) % 20
    mutated = K.Corpus(dok.label, (K.Record(victim.block_id, victim.name, bytes(d)),
                                   *dok.records[1:]), dok.size, dok.save_off, dok.hd_off)
    assert K.exact_canonical_count(mutated) == 59
