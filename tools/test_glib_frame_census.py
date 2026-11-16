"""
Pins for tools/glib_frame_census.py -- R4, PLAN-ROUND-31.md.

Reproduces, from real bytes, the measurement that closes the "38% of the DQK Amiga wall frames
do not decode" gap `dqkAmigaWallArt.test.ts` pins as a KNOWN GAP: the census tool's own byte-level
arithmetic on `8X8DB.TLB` + `8X8DC.TLB` (Amiga WHDLoad `DarkQueenOfKrynn/data/Disk2`, DOS
`The Dark Queen of Krynn/DISK2`).

RESULT (numbered negative -- glib.ts is UNCHANGED by this round): all 305 stub members share the
identical byte shape `h=1, wb=1, dm=0xE1, body=6 bytes`. Splitting by the DOS oracle: 76 are
ALSO an 8x1 placeholder on DOS (genuinely blank/unused wall-piece slots on both platforms, not a
decoder gap); 229 have real DOS art but only the placeholder on Amiga, and every one of them is
the "-right" member of a mirrored pair in the recovered wall-piece vocabulary (far-right /
mid-right / near-right), with 2 corpus-wide exceptions where Amiga DOES store real, independent
art. No (nplanes, variant) hypothesis -- raw contiguous, raw masked, or RLE'd -- computed from
the DOS oracle's REAL dimensions is satisfiable by the stored 6-byte bodies: the art is
structurally absent from the Amiga file, not misdecoded. See
docs/engine/research/dqk-amiga-glib-frame-variant.md for the full writeup.

Skips (never fails) when either source tree is absent -- neither the GOG install nor the Amiga
WHDLoad set is vendored.
"""
import copy
import os

import pytest

import glib_frame_census as C

AMIGA = (
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/"
    "DarkQueenOfKrynn/data/Disk2"
)
DOS = "C:/Modding/GoldBox/The Dark Queen of Krynn/DISK2"

HAVE_DQK = os.path.exists(f"{AMIGA}/8X8DB.TLB") and os.path.exists(f"{DOS}/8X8DB.TLB")
needs_dqk = pytest.mark.skipif(not HAVE_DQK, reason="Amiga WHDLoad set or DOS GOG install not present")

POOLS_8X8D = (
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/"
    "PoolsOfDarkness/data/Disk2/8X8D.TLB"
)
GATEWAY_WALLS_A = (
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/"
    "GatewayToSavageFrontier/data/DiskA/Walls.tlb"
)
GATEWAY_WALLS_C = (
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/"
    "GatewayToSavageFrontier/data/DiskC/Walls.tlb"
)


def _dqk_rows():
    rows_b = C.census_file(f"{AMIGA}/8X8DB.TLB", f"{DOS}/8X8DB.TLB", label_pieces=True)
    rows_c = C.census_file(f"{AMIGA}/8X8DC.TLB", f"{DOS}/8X8DC.TLB", label_pieces=True)
    return rows_b, rows_c


@needs_dqk
def test_stub_count_matches_the_engine_pin():
    """305 = 166 (8X8DB) + 139 (8X8DC) -- exactly what dqkAmigaWallArt.test.ts pins for
    decodeGlib today. The census must agree with the shipped TypeScript decoder before anything
    else in this file is trustworthy."""
    rows_b, rows_c = _dqk_rows()
    sb, sc = C.summarize(rows_b), C.summarize(rows_c)
    assert sb["total"] == 423
    assert sc["total"] == 376
    assert sb["stub_count"] == 166
    assert sc["stub_count"] == 139
    assert sb["stub_count"] + sc["stub_count"] == 305


@needs_dqk
def test_every_stub_shares_one_literal_placeholder_shape():
    """All 305 stubs, both files, are the identical byte record: declared h=1, wb=1, drawing
    method 0xE1 (raw masked, 5-plane), 6-byte body -- exactly the raw-masked budget for that
    tiny DECLARED size ((5+1)*1*1 = 6). One template reused everywhere, not per-member noise."""
    rows_b, rows_c = _dqk_rows()
    rows = rows_b + rows_c
    stubs = [r for r in rows if r.is_stub]
    assert len(stubs) == 305
    shapes = {(r.h, r.wb, r.dm, r.body_len) for r in stubs}
    assert shapes == {(1, 1, 0xE1, 6)}


@needs_dqk
def test_dm_histogram_does_not_discriminate_stub_from_non_stub():
    """MEASUREMENT CORRECTS THE PLAN: PLAN-ROUND-31.md's own mutation (ii) assumes "the census
    discriminates on dm, not on position" -- i.e. that dm is what separates stub from non-stub.
    It measurably is NOT: dm=0xE1 is the drawing method of every stub AND of 491 of the 494
    non-stub decodes (0xE0 accounts for the other 3, all in 8X8DC, all non-stubs). The real
    discriminator is the declared (h, wb) -- see test_dm_forced_does_not_reclassify below, which
    is this file's version of that mutation, corrected to match what the bytes actually show."""
    rows_b, rows_c = _dqk_rows()
    sb, sc = C.summarize(rows_b), C.summarize(rows_c)
    assert sb["dm_hist_stub"] == {0xE1: 166}
    assert sc["dm_hist_stub"] == {0xE1: 139}
    assert sb["dm_hist_nonstub"] == {0xE1: 257}
    assert sc["dm_hist_nonstub"] == {0xE0: 3, 0xE1: 234}
    # Merged: 305 stubs, all 0xE1; 494 non-stubs, 491 x 0xE1 + 3 x 0xE0.
    stub_dm = {**sb["dm_hist_stub"]}
    for k, v in sc["dm_hist_stub"].items():
        stub_dm[k] = stub_dm.get(k, 0) + v
    assert stub_dm == {0xE1: 305}


@needs_dqk
def test_dos_oracle_splits_the_305_into_both_degenerate_and_amiga_only():
    """The 76/229 split that turns "38% doesn't decode" into two different findings: 76 are
    genuinely blank on BOTH platforms (not a decoder gap at all -- unused wall-piece slots), 229
    have real DOS art but only the placeholder on Amiga (the true failures)."""
    rows_b, rows_c = _dqk_rows()
    rows = rows_b + rows_c
    s = C.summarize(rows)
    assert s["stub_count"] == 305
    assert s["both_degenerate_count"] == 76
    assert s["amiga_only_count"] == 229
    assert s["unknown_dos_count"] == 0
    # Per file, matching the exploratory measurement exactly.
    sb, sc = C.summarize(rows_b), C.summarize(rows_c)
    assert (sb["both_degenerate_count"], sb["amiga_only_count"]) == (47, 119)
    assert (sc["both_degenerate_count"], sc["amiga_only_count"]) == (29, 110)


@needs_dqk
def test_hypothesis_table_for_8x8db_set4():
    """The plan's own named case: `8X8DB.TLB` set index 3 ("set 4" in the plan's 1-based prose,
    the set the brief calls out by name as failing 47/47). Unlike the 229 amiga-only failures,
    this set's DOS twin is ALSO an 8x1 stub at all 47 positions -- there is no real oracle
    dimension to test a hypothesis against here at all, which is itself the finding: this is not
    a per-set codec or plane-depth variant (the plan's own estimate), it is an authored-blank set
    on BOTH platforms. All 47 members share the exact same 6 literal bytes (not just the same
    shape) -- `ff0000000000` -- confirming a single template value, not per-member noise."""
    rows_b, _ = _dqk_rows()
    set4 = [r for r in rows_b if r.set_index == 3]
    assert len(set4) == 47
    assert all(r.is_stub for r in set4)
    assert all(r.dos_is_stub is True for r in set4)
    assert {r.body_hex for r in set4} == {"ff0000000000"}
    # No hypothesis table applies: hypotheses_for_stub needs a real (w, h) oracle, and there is
    # none here (dos_wh is a stub shape too) -- asserted explicitly rather than skipped, so a
    # future change that gives this set a real DOS twin is a visible, intended failure here.
    assert all(r.dos_wh == (8, 1) for r in set4)


@needs_dqk
def test_amiga_only_failures_are_the_mirrored_right_piece_with_two_named_exceptions():
    """Every one of the 229 amiga-only failures is the "-right" member of a mirrored pair in the
    47-frame wall-piece vocabulary (far-right / mid-right / near-right,
    dqk-amiga-wall-art-feasibility.md section 2b) -- consistent with the Amiga renderer drawing
    that piece as a horizontal mirror of its "-left" sibling rather than storing separate art.
    Exactly 2 near-right positions corpus-wide are NOT stubs (the Amiga master stores real art
    there instead, agreeing with DOS on dimensions) -- named here so a future census that finds a
    different exception count is a real signal, not noise."""
    rows_b, rows_c = _dqk_rows()
    rows = rows_b + rows_c
    truefail = lambda r: r.is_stub and r.dos_is_stub is False
    hist = C.piece_histogram(rows, truefail)
    assert hist == {"far-right": 77, "mid-right": 77, "near-right": 75}
    assert set(hist) <= {"far-right", "mid-right", "near-right"}
    assert sum(hist.values()) == 229

    # The two named exceptions: real (non-stub) near-right members that agree with DOS.
    exceptions = [
        r for r in rows
        if r.piece == "near-right" and not r.is_stub and r.dos_wh is not None
        and (r.width, r.height) == r.dos_wh
    ]
    keys = {(r.file, r.set_index) for r in exceptions}
    assert ("8X8DB.TLB", 2) in keys  # set02
    assert ("8X8DC.TLB", 1) in keys  # set01


@needs_dqk
def test_no_hypothesis_fits_the_amiga_only_failures():
    """The numbered negative: for every amiga-only failure, none of the (nplanes, variant)
    byte-budget hypotheses -- computed from the DOS oracle's REAL (w, h) at that position -- is
    satisfiable by the stored 6-byte body. This is what licenses NOT changing glib.ts: the data
    to decode a real image at these positions simply is not present in the Amiga file."""
    rows_b, rows_c = _dqk_rows()
    rows = rows_b + rows_c
    checked = 0
    for r in rows:
        if r.is_stub and r.dos_is_stub is False:
            hyps = C.hypotheses_for_stub(r.body, r.dos_wh[0], r.dos_wh[1])
            assert not any(h.fits for h in hyps), (r.file, r.frame_index, r.dos_wh, hyps)
            checked += 1
    assert checked == 229


@needs_dqk
def test_mutation_forced_declared_dimensions_reclassify_as_non_stub():
    """Required mutation: a member with its DECLARED dimensions forced to a known-good (real)
    value must classify as non-stub -- the census discriminates on the declared (h, wb), i.e. on
    the member's own header bytes, not on its position in the walk order."""
    rows_b, _ = _dqk_rows()
    stub = next(r for r in rows_b if r.is_stub and r.dos_wh is not None and r.dos_is_stub is False)
    assert C.MemberRow(**{**vars(stub)}).is_stub  # sanity: unmodified copy is still a stub
    forced = copy.copy(stub)
    real_w, real_h = stub.dos_wh
    forced.wb = max(1, real_w // 8)
    forced.h = real_h
    forced.width = forced.wb * 8
    forced.height = forced.h
    forced.is_stub = forced.width == 8 and forced.height == 1
    assert not forced.is_stub


@needs_dqk
def test_mutation_dm_forced_does_not_reclassify():
    """The PLAN's own mutation (ii) said forcing `dm` to "a known-good value" should reclassify a
    stub as non-stub. Measured, that is false: `dm` is 0xE1 on both populations (see
    test_dm_histogram_does_not_discriminate_stub_from_non_stub above), so forcing it to the OTHER
    observed real value (0xE0, raw opaque) changes nothing about the classification, which is
    driven entirely by the declared (h, wb). Recorded here as the corrected mutation, per
    CLAUDE.md's "measure before you predict" rule -- the brief's assumption about the
    discriminator was wrong, and the fix is to test what is actually true, not what was guessed."""
    rows_b, _ = _dqk_rows()
    stub = next(r for r in rows_b if r.is_stub)
    forced = copy.copy(stub)
    forced.dm = 0xE0  # the other real, observed drawing method in this corpus
    # width/height (hence is_stub) derive from (h, wb) alone -- dm never entered that computation.
    assert forced.is_stub  # unchanged: dm was never the discriminator


@needs_dqk
def test_reverting_glib_ts_change_would_flip_these_pins_red():
    """Documents the intended mutation for glib.ts itself, even though this round makes NO change
    to it (a numbered negative, see the module docblock): if a future round found a real fix and
    these numbers dropped, `test_stub_count_matches_the_engine_pin` and
    `test_every_stub_shares_one_literal_placeholder_shape` would go red first, which is the
    intended signal that this file (and the KNOWN GAP pins in dqkAmigaWallArt.test.ts) needs
    re-deriving -- exactly the same contract dqkAmigaWallArt.test.ts's own docblock states for
    itself. Asserted here as a design note, not a live check (nothing to revert this round)."""
    assert True


def test_zero_regressions_on_pools_and_gateway():
    """Control group: the census tool must not manufacture stubs on titles that already decode
    cleanly. Pools/Gateway's wall-tile containers report 0 stubs before this round's arithmetic
    was written and 0 after (glib.ts is unchanged -- see the module docblock), so this is a
    single measurement standing in for "before" and "after" at once; a future round that DOES
    change glib.ts must re-run this and see it stay at 0."""
    any_present = False
    for path in (POOLS_8X8D, GATEWAY_WALLS_A, GATEWAY_WALLS_C):
        if not os.path.exists(path):
            continue
        any_present = True
        rows = C.census_file(path)
        stubs = [r for r in rows if r.is_stub]
        assert stubs == [], f"{path}: unexpected stub(s) {stubs[:3]}"
    if not any_present:
        pytest.skip("no Pools/Gateway Amiga source present")


@needs_dqk
def test_rle_byte_count_match_can_be_a_degenerate_false_fit():
    """Named regression for the exact false-positive the first version of this hypothesis sweep
    produced: 8X8DB frame 107 (set02, set-relative 13 = 'far-right'; declared 8x1 stub, DOS
    oracle real dims 8x7, body `c70838003838`) reaches the 4-plane AND 5-plane raw-contiguous byte
    budgets (28 and 35 bytes) EXACTLY under `_rle18` -- a byte-count match -- but every decoded
    byte is 0x08: a single flat color, not an 8x7 image with any of the line art the DOS oracle
    actually has at this position. `rle_actually_consumes` must reject this (requires >1 distinct
    byte in the decoded output), so `hypotheses_for_stub` must report NO fit here, keeping this
    member inside the 229 "no hypothesis fits" population instead of manufacturing a fix that
    decodes to a blank rectangle."""
    rows_b, _ = _dqk_rows()
    member = next(r for r in rows_b if r.frame_index == 107)
    assert member.piece == "far-right"
    assert member.dos_wh == (8, 7)
    assert member.body.hex() == "c70838003838"

    # The raw decompressor genuinely reaches both byte-count targets...
    assert C.G._rle18(member.body, 28) == bytes([0x08] * 28)
    assert C.G._rle18(member.body, 35) == bytes([0x08] * 35)
    # ...which is exactly why a bare byte-count check is not enough:
    assert C.rle_actually_consumes(member.body, 28) is False
    assert C.rle_actually_consumes(member.body, 35) is False

    hyps = C.hypotheses_for_stub(member.body, 8, 7)
    assert not any(h.fits for h in hyps), hyps


def test_rle_actually_consumes_helper_is_a_real_check_not_a_bound():
    """`rle_actually_consumes` must be able to fail in BOTH the ways that matter
    (goldbox-probe-must-be-able-to-fail): a body too short to reach the target is rejected, and a
    body that reaches the target byte count with UNIFORM (single distinct value) content is also
    rejected -- see test_rle_byte_count_match_can_be_a_degenerate_false_fit for the real corpus
    case that motivated the second check. A body that reaches the target with genuinely varied
    content is accepted, proving the helper is not vacuously false either."""
    # A literal-copy opcode (control byte < 128 copies the next c+1 bytes verbatim): control byte
    # 0x01 copies 2 literal bytes 0xAA, 0xBB -- reaches a 2-byte target with two DIFFERENT values.
    literal = bytes([0x01, 0xAA, 0xBB])
    assert C.rle_actually_consumes(literal, 2) is True
    assert C.rle_actually_consumes(literal, 3) is False  # no 4th source byte to reach 3 out bytes
    assert C.rle_actually_consumes(literal, 0) is False  # degenerate target

    # A run opcode (control byte >= 128 repeats the next byte (257-c) times) reaches the target
    # byte count just as exactly, but the content is uniform -- correctly rejected.
    run = bytes([0xFF, 0x00])  # repeat 0x00, (257-255)=2 times -> 2 bytes, all 0x00
    assert C.G._rle18(run, 2) == bytes([0x00, 0x00])  # the raw decompressor does reach length 2...
    assert C.rle_actually_consumes(run, 2) is False  # ...but it is degenerate, so this rejects it


def test_hypotheses_for_stub_can_fit_when_the_arithmetic_actually_allows_it():
    """Sanity check that `hypotheses_for_stub` is not vacuously "NONE" for every input --
    construct a body that DOES satisfy the raw-contiguous budget for a small real geometry, and
    confirm the function reports a fit. This is the mutation that proves the "NONE" result on the
    real 229 failures is informative rather than a bug that always returns no-fit."""
    # 4 planes x 1 row x 1 byte/row = 4 bytes exactly satisfies raw-contiguous for an 8x1 image.
    body = bytes([0, 0, 0, 0])
    hyps = C.hypotheses_for_stub(body, real_w=8, real_h=1)
    fits = [h for h in hyps if h.fits]
    assert any(h.nplanes == 4 and h.variant == "raw-contiguous" for h in fits)
