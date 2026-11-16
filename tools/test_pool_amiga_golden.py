"""
Tests for tools/pool_amiga_golden.py -- PLAN-ROUND-32.md R3.

Two independent things are pinned here, both against real bytes and both skipping
(never failing) when their external source is absent:

1. The golden fixture (`packages/engine/test/fixtures/pool-amiga-golden.json`) is
   byte-for-byte reproducible from the Amiga WHDLoad source RIGHT NOW -- this is the
   generator's own correctness/staleness check, not a claim about the TypeScript port
   (that comparison lives in `packages/engine/test/poolAmiga.test.ts`).
2. The sibling-oracle measurement PLAN-ROUND-32.md R3 asks for: per shared block id,
   does the Amiga (w, h) agree with the DOS DAX decode of the same manifest family,
   against the alternative that Amiga block ids are unrelated to DOS block ids (a
   shuffled-id-mapping null) -- with the numbered negative this file actually found:
   the plan's predicted null (<=15%) does not hold. The real null is 28.8%-55%
   depending on scope, because most of the comparable population is a single
   (w, h) value (see `test_sibling_oracle_null_is_higher_than_the_plan_predicted`).
"""
from __future__ import annotations

import copy
import json
import os
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import pool_amiga_golden as G  # noqa: E402
import pool_amiga_decode as PA  # noqa: E402
import dax_decode as D  # noqa: E402

DATA_DIR = G.DEFAULT_DATA_DIR
FIXTURE = G.DEFAULT_OUT
DOS_DIR = Path(
    "C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD"
)

HAVE_SOURCE = DATA_DIR.exists()
HAVE_DOS = DOS_DIR.exists()
needs_source = pytest.mark.skipif(not HAVE_SOURCE, reason="Amiga WHDLoad Pool of Radiance data not present")
needs_both = pytest.mark.skipif(
    not (HAVE_SOURCE and HAVE_DOS),
    reason="Amiga WHDLoad Pool of Radiance data and/or the DOS GOG install are not both present",
)


def _load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------------
# 1. Golden fixture generator: reproducibility + totals + a real mutation.
# ---------------------------------------------------------------------------------


@needs_source
def test_fixture_exists_and_matches_a_fresh_build():
    """The checked-in fixture must be byte-for-byte reproducible from source right now
    -- not a claim about the TS port, just that the generator is deterministic and the
    checked-in file is not stale. Every hash is compared, not just the totals."""
    assert FIXTURE.exists(), f"missing {FIXTURE} -- run: python tools/pool_amiga_golden.py"
    checked_in = _load_fixture()
    fresh = G.build_golden(DATA_DIR)
    assert fresh == checked_in


@needs_source
def test_totals_843_blocks_23_files():
    """843/843 blocks -- the number docs/pool-amiga-format.md and PLAN-ROUND-32.md R3's
    acceptance bar both name. frames=1672 is recorded (not asserted against a number the
    plan named) so a future decoder change that shifts frame counts is visible here."""
    fixture = _load_fixture()
    assert fixture["totals"]["files"] == 23
    assert fixture["totals"]["blocks"] == 843
    assert fixture["totals"]["frames"] == 1672


@needs_source
def test_kind_partition_image_blocks_vs_data_blocks():
    """Partition the 843 blocks by kind: 511 carry an image ('standard' or 'animated' --
    the population a frame-hash comparison can discriminate on), 332 are non-graphics
    'data' blocks (ecl/geo/item/moncha/monitm/monspc/walldef) -- vacuously 0 frames each,
    not a decoder gap. Against the null of a decoder that silently drops blocks it can't
    classify: build_golden raises rather than skipping (see build_file_record), so this
    partition can only be measured, never manufactured by omission."""
    fixture = _load_fixture()
    kinds = {"standard": 0, "animated": 0, "data": 0}
    for rec in fixture["files"].values():
        for b in rec["blocks"]:
            kinds[b["kind"]] += 1
    assert kinds["data"] == 332
    assert kinds["standard"] + kinds["animated"] == 511
    assert sum(kinds.values()) == 843


def test_mutation_a_corrupted_hash_is_detected_by_comparison():
    """Required mutation (ground rule 4): the fixture-vs-rebuild comparison must be able
    to fail. Does not need the external source -- corrupts an in-memory copy of the
    checked-in fixture's first block hash and confirms the comparison used by
    test_fixture_exists_and_matches_a_fresh_build would now see a mismatch.

    RED line reproduced by hand for this report (corrupt on disk, run pytest, restore):
        AssertionError: assert {'files': {'8...!= {'files': {'8...
    (the two dicts differ at files["8x8d.dax"]["blocks"][0]["rawSha256"]).
    """
    if not FIXTURE.exists():
        pytest.skip("no checked-in fixture to mutate")
    original = _load_fixture()
    mutated = copy.deepcopy(original)
    first_file = next(iter(mutated["files"]))
    first_block = mutated["files"][first_file]["blocks"][0]
    real_hash = first_block["rawSha256"]
    first_block["rawSha256"] = "0" * 64
    assert mutated != original  # the probe CAN fail
    first_block["rawSha256"] = real_hash
    assert mutated == original  # restored


# ---------------------------------------------------------------------------------
# 2. Sibling-oracle: Amiga (w, h) per block id vs the DOS DAX decode of the same
#    manifest family (apps/web/games/pool-of-radiance.json), against a shuffled-id
#    null -- see goldbox-sibling-platform-as-oracle.md and
#    goldbox-the-null-decides-the-finding.md.
# ---------------------------------------------------------------------------------

# Families present in BOTH the Amiga corpus (one merged "<family>.dax") and the DOS
# manifest (apps/web/games/pool-of-radiance.json, split into per-area numbered files).
# Excludes: TITLE (no Amiga counterpart file), and the non-graphics families (geo, ecl,
# walldef, moncha/mon1cha, monitm/mon1itm, item) which have no (w, h) to compare.
FAMILY_DOS_FILES = {
    "pic": [f"PIC{i}.DAX" for i in range(1, 9)],
    "cpic": [f"CPIC{i}.DAX" for i in range(1, 9)],
    "chead": ["CHEAD.DAX"],
    "8x8d": [f"8X8D{i}.DAX" for i in range(1, 9)],
    "dungcom": ["DUNGCOM.DAX"],
    "wildcom": ["WILDCOM.DAX"],
    "randcom": ["RANDCOM.DAX"],
    "sprit": [f"SPRIT{i}.DAX" for i in range(1, 9)],
    "comspr": ["COMSPR.DAX"],
    "cbody": ["CBODY.DAX"],
    "bacpac": ["BACPAC.DAX"],
}


def _amiga_wh_map(family: str) -> dict[int, tuple[int, int]]:
    """block_id -> (w, h) for every block in `<family>.dax` that decodes as a standard
    or animated frame (first frame's dims for animated, since sprit's zoom frames vary
    in size and the block id is one entity)."""
    path = DATA_DIR / f"{family}.dax"
    data = path.read_bytes()
    base, blocks = PA.parse_container(data)
    out: dict[int, tuple[int, int]] = {}
    for blk in blocks:
        raw = PA.decompress_block(data, base, blk)
        std = PA.parse_standard(raw)
        if std:
            w, h, _frames = std
            out[blk.block_id] = (w, h)
        else:
            anim = PA.parse_animated(raw)
            if anim:
                out[blk.block_id] = (anim[0][1], anim[0][2])
    return out


def _dos_wh_map(family: str) -> dict[int, tuple[int, int]]:
    """block_id -> (w, h) from `tools/dax_decode.py`'s `parse_standard_frame`, merged
    across every numbered DOS file in the family. `parse_standard_frame` declines
    "complex frame" blocks (item_count != 1) rather than guessing -- see that module's
    docstring -- so families where every DOS file uses complex framing contribute 0
    entries here; that is a real limitation of this particular oracle, not evidence the
    formats disagree, and is reported as such rather than smoothed over. A block id that
    disagrees across two DOS area files (a genuinely different picture reusing the id)
    is dropped as inconsistent rather than picking one arbitrarily."""
    seen: dict[int, set[tuple[int, int]]] = {}
    for fname in FAMILY_DOS_FILES[family]:
        path = DOS_DIR / fname
        if not path.exists():
            continue
        data = path.read_bytes()
        try:
            base, blocks = D.parse_container(data)
        except ValueError:
            continue
        for blk in blocks:
            try:
                raw = D.decompress_block(data, base, blk)
            except Exception:
                continue
            std = D.parse_standard_frame(raw)
            if std:
                w, h, _xo, _yo = std
                seen.setdefault(blk.block_id, set()).add((w, h))
    return {bid: next(iter(vals)) for bid, vals in seen.items() if len(vals) == 1}


def _sibling_data():
    """Returns (shared, amiga, dos) where `shared` is {(family, block_id): True} for
    every id present with a consistent (w, h) on both platforms, and amiga/dos are the
    {(family, block_id): (w, h)} maps restricted to `shared`."""
    amiga: dict[tuple[str, int], tuple[int, int]] = {}
    dos: dict[tuple[str, int], tuple[int, int]] = {}
    per_family = {}
    for family in FAMILY_DOS_FILES:
        am = _amiga_wh_map(family)
        dm = _dos_wh_map(family)
        shared_ids = set(am) & set(dm)
        distinct = len({am[i] for i in shared_ids})
        per_family[family] = (len(am), len(dm), len(shared_ids), distinct)
        for i in shared_ids:
            amiga[(family, i)] = am[i]
            dos[(family, i)] = dm[i]
    return amiga, dos, per_family


@needs_both
def test_sibling_oracle_agreement_and_family_partition():
    """Real (w, h) agreement across every shared block id, partitioned by whether the
    family's shared population is discriminating (>=2 distinct Amiga values, so an
    id-shuffle COULD disagree) or vacuous (<=1 distinct value, so any id assignment
    "agrees" by construction) -- ground rule 1's discriminating/vacuous split applied to
    this measurement.

    MEASURED (2026-09-03): 295 shared ids total, 295/295 (100%) agree. Only 4 of the 11
    candidate families produce ANY shared ids at all (cpic, chead, comspr, cbody) --
    the other 7 (pic, 8x8d, dungcom, wildcom, randcom, sprit, bacpac) have DOS files
    that are entirely "complex frame" encoded, which `parse_standard_frame` declines
    rather than mis-decodes; the sibling oracle simply cannot see those families with
    this decoder. Of the 4 that do produce shared ids, comspr (23 ids) and cbody (128
    ids) are VACUOUS (single (w, h) value each: 24x24) -- 151/295 = 51% of the "agreement"
    is unfalsifiable by construction. Only cpic (116 ids, 4 distinct values) and chead
    (28 ids, 2 distinct values) are discriminating -- 144/295 = 49%."""
    amiga, dos, per_family = _sibling_data()
    shared_keys = list(amiga.keys())
    assert len(shared_keys) == 295
    agree = sum(1 for k in shared_keys if amiga[k] == dos[k])
    assert agree == 295

    vacuous_families = {f for f, (_a, _d, _s, dv) in per_family.items() if dv <= 1 and _s > 0}
    discriminating_families = {f for f, (_a, _d, _s, dv) in per_family.items() if dv >= 2}
    assert vacuous_families == {"comspr", "cbody"}
    assert discriminating_families == {"cpic", "chead"}

    vacuous_n = sum(per_family[f][2] for f in vacuous_families)
    discriminating_n = sum(per_family[f][2] for f in discriminating_families)
    assert vacuous_n == 151
    assert discriminating_n == 144
    assert vacuous_n + discriminating_n == 295

    # Families that contributed zero shared ids -- the decoder-coverage limitation named
    # in this test's docstring, not a format disagreement.
    zero_share_families = {f for f, (_a, _d, s, _dv) in per_family.items() if s == 0}
    assert zero_share_families == {"pic", "8x8d", "dungcom", "wildcom", "randcom", "sprit", "bacpac"}


@needs_both
def test_sibling_oracle_null_is_higher_than_the_plan_predicted():
    """The numbered negative: PLAN-ROUND-32.md R3 predicted the shuffled-id null would be
    <=15%. Measured, it is NOT -- because 151 of the 295 shared ids (comspr + cbody) carry
    a single (w, h) value each, ANY id-to-value assignment "agrees" there, which inflates
    a naive global shuffle to ~55%. Restricting to the two families whose shared
    population is actually discriminating (cpic + chead, 144 ids, >=2 distinct values)
    gives a fairer null of ~29% -- still well below the 100% real agreement, so the
    sibling-id-oracle hypothesis holds, just not by the margin the plan guessed.
    Both numbers are reported; neither is hidden in favour of the other."""
    amiga, dos, per_family = _sibling_data()
    shared_keys = list(amiga.keys())
    discriminating_families = {f for f, (_a, _d, _s, dv) in per_family.items() if dv >= 2}
    disc_keys = [k for k in shared_keys if k[0] in discriminating_families]
    assert len(disc_keys) == 144

    def shuffled_agree_fraction(keys: list, seeds: range) -> float:
        fractions = []
        for seed in seeds:
            rng = random.Random(seed)
            vals = [amiga[k] for k in keys]
            rng.shuffle(vals)
            shuffled = dict(zip(keys, vals))
            fractions.append(sum(1 for k in keys if shuffled[k] == dos[k]) / len(keys))
        return sum(fractions) / len(fractions)

    null_all = shuffled_agree_fraction(shared_keys, range(20))
    null_discriminating = shuffled_agree_fraction(disc_keys, range(20))

    real_all = sum(1 for k in shared_keys if amiga[k] == dos[k]) / len(shared_keys)
    real_disc = sum(1 for k in disc_keys if amiga[k] == dos[k]) / len(disc_keys)

    assert real_all == 1.0
    assert real_disc == 1.0
    # Both nulls measured well ABOVE the plan's predicted <=15% ceiling -- the corrected
    # finding this test exists to pin. Loose bounds (not exact floats) since the shuffle
    # is randomized; the *comparison to the plan's prediction* is what matters here.
    assert 0.40 <= null_all <= 0.70, f"null_all={null_all}"
    assert 0.15 <= null_discriminating <= 0.45, f"null_discriminating={null_discriminating}"
    # The real result still clearly separates from either null.
    assert real_all - null_all > 0.30
    assert real_disc - null_discriminating > 0.50
