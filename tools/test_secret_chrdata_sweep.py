r"""
Pins the load-bearing numbers in `docs/engine/research/secret-chrdata-layout.md`.

Every retail file this reads comes from the external, never-vendored GOG Galaxy installs
(`C:\Program Files (x86)\GOG Galaxy\Games\...`) -- every test SKIPS rather than fails when its
title's directory is absent on the running machine.

Scope note: this file pins Curse (the calibration case) and Secret. Pools and Treasures were
report-only through round 29 -- round 30's R3 falsified the "0 discriminating pairs" verdict for
both (see `docs/engine/research/pools-treasures-chrdata-layout.md`) and this file now pins their
near-miss numbers too, at the (n-1)-of-n tier rather than full n-of-n agreement.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secret_chrdata_sweep as S  # noqa: E402


def _records(title: str) -> list[bytes]:
    if not S.title_dir_available(title):
        pytest.skip(f"{title}: GOG install absent on this machine")
    return S.load_records(title)


# --------------------------------------------------------------------------------------
# (a) Calibration: Curse's own real offsets must fall out of the sweep with no prior
#     knowledge of where they are -- this is what makes the sweep trustworthy on Secret.
# --------------------------------------------------------------------------------------
def test_curse_calibration_discriminating_full_agreement_is_exactly_the_known_offsets():
    records = _records("curse")
    res = S.sweep(records)
    assert res.n_records == 6
    assert res.record_size == 422
    # The RAW (unfiltered) sweep is dominated by degenerate matches: any offset that reads a
    # constant class code across the whole party (most commonly 0 = cleric, sitting in a run of
    # unused zero bytes) trivially "agrees" with any level window that is ALSO constant across
    # the party. This is a real, measured number -- not a bug -- and it is why the tool also
    # computes the discriminating subset (party's class code actually varies).
    assert len(res.full_agreement) == 598
    # The discriminating subset -- requiring the class byte to vary across the 6 real pregens,
    # which it genuinely does (paladin/paladin/mc_f_t/mc_f_mu/cleric/magic_user) -- collapses to
    # exactly Player.cs's own offsets, with no other candidate surviving.
    assert res.full_agreement_discriminating == [(0x75, 0x109)]
    # Runner-up: the second-best discriminating hypothesis, reported next to the winner.
    assert res.runner_up_discriminating_score == 5
    assert len(res.runner_up_discriminating_pairs) == 145


# --------------------------------------------------------------------------------------
# (b) Secret: the discriminating full-agreement set, pinned exactly.
# --------------------------------------------------------------------------------------
def test_secret_discriminating_full_agreement_is_exactly_one_pair():
    records = _records("secret")
    res = S.sweep(records)
    assert res.n_records == 6
    assert res.record_size == 439
    assert len(res.full_agreement) == 270  # RAW, degenerate-dominated -- reported for contrast
    assert res.full_agreement_discriminating == [(0x6C, 0x111)]
    assert res.runner_up_discriminating_score == 5
    assert len(res.runner_up_discriminating_pairs) == 148

    # This is a load-bearing NEGATIVE result against part of the plan's own prediction: it
    # predicted a single contiguous 17-byte insertion (l - 0x109 == c - 0x75 for one k). The
    # measured pair does NOT satisfy that -- see docs/engine/research/secret-chrdata-layout.md.
    c, l = res.full_agreement_discriminating[0]
    assert c - 0x75 != l - 0x109


# --------------------------------------------------------------------------------------
# (c) The shuffled null -- an upper bound the real counts must clear, reported next to them.
# --------------------------------------------------------------------------------------
def test_curse_shuffled_null_upper_bound():
    records = _records("curse")
    null = S.shuffled_null(records, trials=200, seed=12345)
    assert null["max_full_agreement_discriminating_pairs"] <= 0
    # The real count (1, from the calibration test above) clears this ceiling.
    real = len(S.sweep(records).full_agreement_discriminating)
    assert real > null["max_full_agreement_discriminating_pairs"]


def test_secret_shuffled_null_upper_bound():
    records = _records("secret")
    null = S.shuffled_null(records, trials=200, seed=12345)
    assert null["max_full_agreement_discriminating_pairs"] <= 0
    real = len(S.sweep(records).full_agreement_discriminating)
    assert real > null["max_full_agreement_discriminating_pairs"]


# --------------------------------------------------------------------------------------
# (d) At Secret's found pair: the level bytes are plausible (1..25) and the name decodes to
#     printable ASCII for all 6 -- "it is a layout, not a coincidence".
# --------------------------------------------------------------------------------------
def test_secret_found_pair_is_a_plausible_layout_not_noise():
    records = _records("secret")
    res = S.sweep(records)
    assert res.full_agreement_discriminating == [(0x6C, 0x111)]
    c, l = res.full_agreement_discriminating[0]
    names = []
    for raw in records:
        window = raw[l : l + 8]
        for b in window:
            if b != 0:
                assert 1 <= b <= 25, f"implausible level byte {b}"
        namelen = raw[0]
        assert 1 <= namelen <= 15
        name_bytes = raw[1 : 1 + namelen]
        assert all(32 <= b < 127 for b in name_bytes), f"non-printable name bytes {name_bytes!r}"
        names.append(name_bytes.decode("ascii"))
    assert len(names) == 6
    assert names == ["Guy de Valois ", "PAINE", "EPONA", "MALACHITE", "DOMINIC", "MORGAINE"]


# --------------------------------------------------------------------------------------
# One Secret record accepts the CoAB oracle at CoAB's OWN fixed offsets (0x75, 0x109) -- the
# coincidence the R3 plan asked to be named. Cross-checked here against the sweep's own
# machinery (independent of packages/engine/test/coabSavedCharacter.test.ts's TS version of
# the same measurement).
# --------------------------------------------------------------------------------------
def test_secret_coincidental_match_at_coab_fixed_offsets_is_malachite():
    records = _records("secret")
    c, l = 0x75, 0x109
    matches = []
    for raw in records:
        expected = S.expected_bitmask(raw[c])
        actual = 0
        for k in range(8):
            if raw[l + k] != 0:
                actual |= 1 << k
        if expected != -1 and expected == actual:
            namelen = raw[0]
            matches.append(raw[1 : 1 + namelen].decode("ascii"))
    assert matches == ["MALACHITE"]


# --------------------------------------------------------------------------------------
# Mutation (iii): the tool must track a genuine insertion, not just report CoAB's own offsets
# by coincidence. Insert 17 zero bytes at 0x40 into every real Curse record (this exactly
# reproduces Secret's own 422 -> 439 size delta) and require the discriminating full-agreement
# pair to move by the insertion size on BOTH axes: (0x75+17, 0x109+17) = (0x86, 0x11a).
# --------------------------------------------------------------------------------------
def test_sweep_tracks_a_synthetic_insertion():
    records = _records("curse")
    mutated = S.insert_zero_bytes(records, at=0x40, count=17)
    assert len(mutated[0]) == 439
    res = S.sweep(mutated)
    assert res.full_agreement_discriminating == [(0x86, 0x11A)]


# --------------------------------------------------------------------------------------
# The class-code enum mirror in this tool must actually agree with the TS engine source it is
# transcribed from, or every measurement above is worthless. Spot-checked against the literal
# citations in packages/engine/src/loaders/coabSavedCharacter.ts (COAB_CLASS_LABEL /
# coabExpectedClassLevelSlots), not re-derived.
# --------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "code,expected_mask",
    [
        (0, 0b00000001),  # cleric
        (2, 0b00000100),  # fighter
        (3, 0b00001000),  # paladin
        (5, 0b00100000),  # magic_user
        (13, 0b00100100),  # mc_f_mu: fighter(bit2) + magic_user(bit5)
        (14, 0b01000100),  # mc_f_t: fighter(bit2) + thief(bit6)
    ],
)
def test_expected_bitmask_matches_ts_source(code, expected_mask):
    assert S.expected_bitmask(code) == expected_mask


def test_expected_bitmask_rejects_unknown_and_out_of_range():
    assert S.expected_bitmask(17) == -1  # 'unknown'
    for code in (18, 99, 255):
        assert S.expected_bitmask(code) == -1


# --------------------------------------------------------------------------------------
# R3 (round 30) -- Pools and Treasures at (0xae, 0x151). Round 29 published "0 discriminating
# pairs" for both titles; that number is the FULL n-of-n agreement count and is still 0 -- it is
# not wrong as a literal statement. What round 29 hid is that (0xae, 0x151) is a genuine
# near-miss at (n-1)-of-n, clears a null built for the ALTERNATIVE (any pair's max score, not
# just the predecessor CoAB offset), and lines up with a dozen other CoAB-shaped fields at a
# consistent shift. See docs/engine/research/pools-treasures-chrdata-layout.md.
# --------------------------------------------------------------------------------------
def test_pools_and_treasures_full_agreement_is_still_zero():
    # The literal round-29 number: FULL n-of-n agreement. This did not change and is not being
    # retracted -- it is the threshold that hid the near-miss, not a wrong count.
    pools = S.sweep(_records("pools"))
    treasures = S.sweep(_records("treasures"))
    assert pools.full_agreement_discriminating == []
    assert treasures.full_agreement_discriminating == []


def test_pools_0xae_0x151_scores_5_of_6():
    records = _records("pools")
    r = S.score_one_pair(records, 0xAE, 0x151)
    assert r["score"] == 5
    assert r["of"] == 6


def test_treasures_0xae_0x151_scores_7_of_8():
    records = _records("treasures")
    r = S.score_one_pair(records, 0xAE, 0x151)
    assert r["score"] == 7
    assert r["of"] == 8


def test_pools_0xae_0x151_is_the_unique_high_diversity_pair_at_its_score_tier():
    # (0xae, 0x151) is NOT the only pair reaching score 5/6 -- 26 discriminating pairs tie at
    # that score (mostly near-constant "leakage" columns, see the module doc section 0). What
    # makes it the real one: class_diversity (the count of DISTINCT raw class-byte values across
    # the 6-record party) is a strict argmax at this pair -- every other tied pair reads <=2
    # distinct class codes across the party (near-constant), while (0xae, 0x151) reads 5.
    records = _records("pools")
    res = S.sweep(records)
    assert res.runner_up_discriminating_score == 5
    tied = res.runner_up_discriminating_pairs
    assert (0xAE, 0x151) in tied
    assert len(tied) == 26  # the tie is real and large -- "unique" requires the diversity filter
    diversities = {(c, l): S.class_diversity(records, c) for c, l in tied}
    winner_diversity = diversities[(0xAE, 0x151)]
    assert winner_diversity == 5
    others = [d for (c, l), d in diversities.items() if (c, l) != (0xAE, 0x151)]
    assert max(others) < winner_diversity
    assert set(others) == {2}


def test_treasures_0xae_0x151_is_the_unique_high_diversity_pair_at_its_score_tier():
    # Treasures ties only 2-wide at its top score: (0xad, 0x1e9) -- the same near-constant
    # ("7/8 magic_user") leakage pattern seen in Pools -- and (0xae, 0x151). class_diversity
    # again separates them cleanly: 2 vs 6.
    records = _records("treasures")
    res = S.sweep(records)
    assert res.runner_up_discriminating_score == 7
    tied = res.runner_up_discriminating_pairs
    assert tied == [(0xAD, 0x1E9), (0xAE, 0x151)]
    assert S.class_diversity(records, 0xAD) == 2
    assert S.class_diversity(records, 0xAE) == 6


def test_pools_and_treasures_shuffled_null_ceilings():
    # The null must test the ALTERNATIVE the real (n-1)-of-n score actually has to beat: the
    # max score reached by ANY pair (not just the max count of full-agreement pairs, which stays
    # 0 in both the real data and the null and so proves nothing about a near-miss). 200 trials,
    # same seed as the rest of this file's null tests.
    pools_null = S.shuffled_null(_records("pools"), trials=200, seed=12345)
    treasures_null = S.shuffled_null(_records("treasures"), trials=200, seed=12345)

    assert pools_null["max_full_agreement_discriminating_pairs"] == 0
    assert treasures_null["max_full_agreement_discriminating_pairs"] == 0

    # Pinned ceilings, measured on this data/seed -- the real near-miss scores (5/6, 7/8) both
    # clear them.
    assert pools_null["max_score_any_discriminating_pair"] == 4
    assert treasures_null["max_score_any_discriminating_pair"] == 5
    assert 5 > pools_null["max_score_any_discriminating_pair"]
    assert 7 > treasures_null["max_score_any_discriminating_pair"]


def test_ability_block_offset_is_0x10_on_all_four_titles():
    for title in ("curse", "secret", "pools", "treasures"):
        records = _records(title)
        assert S.ability_block_offsets(records) == [0x10]


def test_ability_block_null_ceiling_is_zero_on_all_four_titles():
    for title in ("curse", "secret", "pools", "treasures"):
        records = _records(title)
        assert S.ability_sweep_null(records, trials=200, seed=12345) == 0


# --------------------------------------------------------------------------------------
# The two outliers named in the R3 plan brief: ABAGAIL (Pools) and OUGO (Treasures) are the ONE
# miss in each title at (0xae, 0x151). Both misses are pinned as MISSES with the byte-level
# facts that make each one distinctive -- NOT resolved by an untested predicate. Each anomaly is
# an n=1 sample within its title (no second record shares the pattern), so no predicate built
# from it could be checked against a shuffled null without circularity; per
# `goldbox-the-null-decides-the-finding`, that makes it an UNKNOWN, not a finding.
# --------------------------------------------------------------------------------------
def test_pools_outlier_is_abagail_with_an_extra_set_bit():
    records = _records("pools")
    r = S.score_one_pair(records, 0xAE, 0x151)
    misses = [row for row in r["records"] if not row["hit"]]
    assert [row["name"] for row in misses] == ["ABAGAIL"]
    abagail = misses[0]
    # class = magic_user (slot 5); window carries slot 5 (expected) AND slot 7 -- the ClassLevel
    # slot CoAB calls "monk" -- both nonzero. No other of the 14 Pools+Treasures records has any
    # nonzero byte at window slot 7 (l+7 = 0x158).
    assert abagail["class_label"] == "magic_user"
    assert abagail["window"] == [0, 0, 0, 0, 0, 12, 0, 11]
    treasures = _records("treasures")
    for title_records in (records, treasures):
        for raw in title_records:
            if raw is not records[4]:  # ABAGAIL is Pools record index 4
                assert raw[0x158] == 0, "ABAGAIL's slot-7 anomaly should be the only one of 14"


def test_treasures_outlier_is_ougo_with_a_level_in_the_wrong_slot():
    records = _records("treasures")
    r = S.score_one_pair(records, 0xAE, 0x151)
    misses = [row for row in r["records"] if not row["hit"]]
    assert [row["name"] for row in misses] == ["OUGO"]
    ougo = misses[0]
    # class = fighter (slot 2, expected); the window instead carries a level in slot 0 (cleric).
    # OUGO is also the ONLY one of 14 Pools+Treasures records with a nonzero byte at 0x15a (two
    # bytes past the window) -- a value of 8, matching the misplaced level's own magnitude. This
    # is suggestive of a class change (dual-classing, or a stored "previous class" level) but is
    # a SINGLE example: no predicate built from it can be checked against a null, so it is
    # reported as a fact, not resolved as a finding.
    assert ougo["class_label"] == "fighter"
    assert ougo["window"] == [8, 0, 0, 0, 0, 0, 0, 0]
    ougo_raw = records[6]  # OUGO is Treasures record index 6
    assert ougo_raw[0x15A] == 8
    for i, raw in enumerate(records):
        if i != 6:
            assert raw[0x15A] == 0, "OUGO's 0x15a byte should be the only nonzero one of 8"
    pools = _records("pools")
    for raw in pools:
        assert raw[0x15A] == 0, "and none of Pools' 6 records has it either"


# --------------------------------------------------------------------------------------
# Mutation (iii) from the R3 plan brief: shuffling WHICH record owns which class byte at 0xae
# (cross-record shuffle of just that one column, level windows untouched) must collapse the
# score to near the null's ceiling -- proof the 5/6 and 7/8 scores reflect the party's own class
# variety lining up with its own level array, not some structural property of the window
# position alone.
# --------------------------------------------------------------------------------------
def test_shuffling_the_class_byte_column_collapses_the_score():
    import numpy as np

    for title, expected_of in (("pools", 6), ("treasures", 8)):
        records = _records(title)
        rng = np.random.default_rng(42)
        class_col = [r[0xAE] for r in records]
        perm = rng.permutation(len(records))
        mutated = []
        for raw, new_c in zip(records, [class_col[i] for i in perm]):
            buf = bytearray(raw)
            buf[0xAE] = new_c
            mutated.append(bytes(buf))
        r = S.score_one_pair(mutated, 0xAE, 0x151)
        assert r["of"] == expected_of
        # Well below the real score (5/6, 7/8) and at/under the shuffled-null ceiling measured
        # in test_pools_and_treasures_shuffled_null_ceilings (4 for pools, 5 for treasures).
        assert r["score"] <= 1
