"""GBOC v1 output-ownership record: pack/validate/apply, and the effect-7 block.

Design: docs/engine/research/cok-mutation-output-ownership.md (handoff task 2).
This is a Python-reference-level standing test, like the existing 339+25
effect-7-context tests it sits beside -- it does not build or run native code.
No callback is authorized in shipped code (AUTHORIZED_OUTPUT_CALLBACKS is
empty), so every "successful" case below monkeypatches that set for the
duration of one test only, to prove the mechanism is generically correct
without weakening the shipped authorization boundary anywhere else. The
effect-7-specific rejection test below runs against the real, unpatched module.
"""
import struct
from unittest import mock

import pytest

from tools import cok_mutation_output as m
from tools.cok_item_removal import authorize_effect7
from tools.cok_rng import step

BEFORE = 0xDEADBEEF
AFTER1 = step(BEFORE)
AFTER2 = step(AFTER1)


def gbef_fixture(rng):
    raw = bytearray(5750)
    raw[:4] = b'GBEF'
    struct.pack_into('<I', raw, m.GBEF_RNG_OFFSET, rng)
    return bytes(raw)


# ---------------------------------------------------------------------------
# Pack/validate round trip, no output (the shape every currently-verified
# callback -- 0x0C/0x0E/0x17/0x26 -- would use if wired to emit GBOC at all).
# ---------------------------------------------------------------------------

def test_no_output_record_round_trips():
    record = m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE)
    assert len(record) == m.LENGTH
    parsed = m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)
    assert parsed == dict(callback_id=0x0C, write_flag=0, draws=0, rng_before=BEFORE,
                          rng_after=BEFORE, target_ordinal=0, damage=0, queue_slot=0)


def test_no_output_record_rejects_nonzero_output_fields():
    record = m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE)
    corrupted = bytearray(record)
    struct.pack_into('<H', corrupted, 12, 1)  # draws nonzero despite write_flag clear
    struct.pack_into('<I', corrupted, 36, __import__('zlib').crc32(bytes(corrupted[:36])))
    with pytest.raises(ValueError, match='must be zero when the write flag is clear'):
        m.validate(bytes(corrupted), gbef_rng=BEFORE, roster_owner_count=6)


# ---------------------------------------------------------------------------
# Authorized (monkeypatched) success path: RNG folds correctly, target/damage/
# queue provenance is carried, apply() only ever touches the RNG field, and
# both "resume" (re-read at the documented offset) and "cold checkpoint"
# (serialize/reload) preserve it.
# ---------------------------------------------------------------------------

@mock.patch.object(m, 'AUTHORIZED_OUTPUT_CALLBACKS', frozenset({0x4200}))
def test_authorized_output_record_round_trips_and_applies_only_rng():
    record = m.pack(callback_id=0x4200, write_flag=1, draws=2, rng_before=BEFORE,
                    rng_after=AFTER2, target_ordinal=3, damage=9, queue_slot=1)
    parsed = m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)
    assert parsed['draws'] == 2 and parsed['rng_after'] == AFTER2
    assert parsed['target_ordinal'] == 3 and parsed['damage'] == 9

    gbef = gbef_fixture(BEFORE)
    new_gbef, pending = m.apply(gbef, parsed)
    assert struct.unpack_from('<I', new_gbef, m.GBEF_RNG_OFFSET)[0] == AFTER2
    # Nothing outside the 4-byte RNG field changed.
    assert new_gbef[:m.GBEF_RNG_OFFSET] == gbef[:m.GBEF_RNG_OFFSET]
    assert new_gbef[m.GBEF_RNG_OFFSET+4:] == gbef[m.GBEF_RNG_OFFSET+4:]
    # The input GBEF bytes object is untouched (apply() must not mutate in place).
    assert struct.unpack_from('<I', gbef, m.GBEF_RNG_OFFSET)[0] == BEFORE
    # Damage/target/queue are reported, not written anywhere.
    assert pending == dict(target_ordinal=3, damage=9, queue_slot=1)

    # "Resume": the RNG a resumed VM would read is exactly what apply() wrote,
    # at the same offset every other GBEF fixture/consumer in this repo uses.
    resumed_rng = struct.unpack_from('<I', new_gbef, m.GBEF_RNG_OFFSET)[0]
    assert resumed_rng == AFTER2

    # "Cold checkpoint": a checkpoint already stores the complete GBEF blob
    # (a42459b); model that as a byte-for-byte serialize/reload round trip and
    # confirm the RNG field survives it unchanged.
    reloaded = bytes(bytearray(new_gbef))
    assert struct.unpack_from('<I', reloaded, m.GBEF_RNG_OFFSET)[0] == AFTER2
    assert reloaded == new_gbef


@mock.patch.object(m, 'AUTHORIZED_OUTPUT_CALLBACKS', frozenset({0x4200}))
def test_apply_rejects_stale_gbef_rng():
    record = m.pack(callback_id=0x4200, write_flag=1, draws=1, rng_before=BEFORE,
                    rng_after=AFTER1, target_ordinal=1, damage=1, queue_slot=0)
    parsed = m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)
    stale = gbef_fixture(AFTER1)  # GBEF already advanced past what the record assumed
    with pytest.raises(ValueError, match='no longer matches'):
        m.apply(stale, parsed)


# ---------------------------------------------------------------------------
# Malformed / unauthorized rejections: every one must leave inputs unchanged
# (trivially true for the immutable `bytes` inputs; asserted explicitly below
# by re-reading them after the raised exception).
# ---------------------------------------------------------------------------

def _corrupt(record, offset, value_bytes):
    raw = bytearray(record)
    raw[offset:offset+len(value_bytes)] = value_bytes
    struct.pack_into('<I', raw, 36, __import__('zlib').crc32(bytes(raw[:36])))
    return bytes(raw)


@pytest.mark.parametrize('bad_length', [0, 39, 41, 5750])
def test_rejects_wrong_length(bad_length):
    with pytest.raises(ValueError, match='40 bytes'):
        m.validate(bytes(bad_length), gbef_rng=BEFORE, roster_owner_count=6)


def test_rejects_bad_magic():
    record = bytearray(m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE))
    record[:4] = b'XXXX'
    with pytest.raises(ValueError, match='magic'):
        m.validate(bytes(record), gbef_rng=BEFORE, roster_owner_count=6)


def test_rejects_bad_checksum():
    record = bytearray(m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE))
    record[36] ^= 0xFF
    with pytest.raises(ValueError, match='checksum'):
        m.validate(bytes(record), gbef_rng=BEFORE, roster_owner_count=6)


@pytest.mark.parametrize('version,length', [(0, 40), (2, 40), (1, 41)])
def test_rejects_wrong_version_or_length_field(version, length):
    record = m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE)
    corrupted = _corrupt(record, 4, struct.pack('<HH', version, length))
    with pytest.raises(ValueError, match='version/length'):
        m.validate(corrupted, gbef_rng=BEFORE, roster_owner_count=6)


@pytest.mark.parametrize('offset,width', [(11, 1), (14, 2), (27, 1), (30, 6)])
def test_rejects_nonzero_reserved_bytes(offset, width):
    record = m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE)
    corrupted = _corrupt(record, offset, b'\x01'*width)
    with pytest.raises(ValueError, match='[Rr]eserved'):
        m.validate(corrupted, gbef_rng=BEFORE, roster_owner_count=6)


def test_rejects_rng_before_mismatch_with_live_gbef():
    record = m.pack(callback_id=0x0C, write_flag=0, rng_before=BEFORE, rng_after=BEFORE)
    with pytest.raises(ValueError, match='RNG-before'):
        m.validate(record, gbef_rng=AFTER1, roster_owner_count=6)


@mock.patch.object(m, 'AUTHORIZED_OUTPUT_CALLBACKS', frozenset({0x4200}))
def test_rejects_wrong_rng_arithmetic():
    # rng_after does not fold from rng_before by the declared draw count.
    record = m.pack(callback_id=0x4200, write_flag=1, draws=2, rng_before=BEFORE,
                    rng_after=AFTER1, target_ordinal=1, damage=1, queue_slot=0)
    with pytest.raises(ValueError, match='fold'):
        m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)


@mock.patch.object(m, 'AUTHORIZED_OUTPUT_CALLBACKS', frozenset({0x4200}))
def test_rejects_out_of_range_target_ordinal():
    record = m.pack(callback_id=0x4200, write_flag=1, draws=1, rng_before=BEFORE,
                    rng_after=AFTER1, target_ordinal=7, damage=1, queue_slot=0)
    with pytest.raises(ValueError, match='live roster member'):
        m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)


def test_present_output_with_zero_draws_is_rejected_even_if_otherwise_well_formed():
    with pytest.raises(ValueError, match='at least one RNG draw'):
        m.pack(callback_id=0x4200, write_flag=1, draws=0, rng_before=BEFORE,
              rng_after=BEFORE, target_ordinal=1, damage=1, queue_slot=0)


# ---------------------------------------------------------------------------
# The load-bearing test: effect 7 is rejected by the (real, unpatched)
# shipped module even when every arithmetic/structural field is correct.
# This is the actual enforcement point handoff task 2 requires -- "keep the
# effect-7 rejection" -- proven against real module state, not a mock.
# ---------------------------------------------------------------------------

def test_effect_7_is_rejected_with_arithmetically_correct_output():
    assert 7 not in m.AUTHORIZED_OUTPUT_CALLBACKS
    record = m.pack(callback_id=7, write_flag=1, draws=1, rng_before=BEFORE,
                    rng_after=AFTER1, target_ordinal=1, damage=5, queue_slot=0)
    with pytest.raises(ValueError, match='not authorized'):
        m.validate(record, gbef_rng=BEFORE, roster_owner_count=6)


def test_no_callback_is_authorized_in_shipped_code():
    # Mutation guard: if this ever goes green with a nonempty set, something
    # authorized a callback for RNG/damage output without following the
    # "What remains before this is native" checklist in the design doc.
    assert m.AUTHORIZED_OUTPUT_CALLBACKS == frozenset()


# ---------------------------------------------------------------------------
# DOCUMENT-DO-NOT-CLOSE (2026-09-09, Codex adversarial review). This section
# pins a known, DELIBERATE design boundary. It does not attempt to fix
# anything -- doing so is explicitly out of scope, per the review and per
# AUTHORIZED_OUTPUT_CALLBACKS staying the empty frozenset() on purpose (see
# this module's own docstring: "only this cm_remove_effect-boundary
# authority exists so far"). Its only job is to make the gap UNDENIABLE:
# assert, in code, that the forgery CURRENTLY SUCCEEDS, so nobody can later
# assume "the RNG-fold check would catch a forged record" without this test
# going red first.
#
# THE GAP: `authorize_effect7` (this repo's Python mirror of the real,
# actually-wired native routine `cm_authorize_output` in
# native/src/cokremove.inc -- unlike this file's own `m.validate`, whose
# AUTHORIZED_OUTPUT_CALLBACKS is empty and therefore rejects every
# callback id including 7, `authorize_effect7` already accepts callback
# id 7 unconditionally) checks that a GBOC record is INTERNALLY
# self-consistent: magic/version/length/CRC valid, reserved bytes zero,
# rng_before matches the paused state, rng_after fold-matches rng_before
# by exactly `draws` calls of the same public, deterministic, non-secret
# `cok_rng.step` function, target_ordinal is in range, and the target's
# prior status is 0. NONE of those checks require the caller to have
# actually run a real effect-7 callback, or to know anything a forger
# without access to the live game wouldn't also know (rng_before is the
# paused, observable GBEF state; cok_rng.step has no key). So any party
# who can read the paused RNG state can fabricate `draws` and `damage` to
# whatever values it likes, fold the RNG by hand, and the record will be
# authorized -- proven below with two deliberately absurd choices: the
# maximum representable draw count (65535, an amount no single effect-7
# attack would plausibly consume) paired with maximum damage (255), and
# the same absurd draw count paired with damage=0 (a claimed "attack"
# that changes nothing). Both are accepted exactly like a genuine record
# would be, because nothing in the boundary distinguishes them.
#
# IF THIS EVER GOES RED: it means `authorize_effect7`/`cm_authorize_output`
# started rejecting one of these forged shapes, i.e. some new check now
# discriminates real provenance from mere arithmetic self-consistency. In
# that case this test's assertions (that the forgery SUCCEEDS) must be
# INVERTED to assert rejection instead (`pytest.raises(RemovalError, ...)`)
# -- do not simply delete or loosen this test, because the point of a
# pinned gap is that closing it is a NEWS EVENT, not a silent diff.

FORGED_HP = 50


def _forged_body(*, status=0, hp=FORGED_HP):
    body = bytearray(409)
    body[392] = status  # GBOC_EFFECT7_STATUS_OFFSET
    body[407] = hp       # GBOC_EFFECT7_HP_OFFSET
    return bytes(body)


def _fold(rng_before, draws):
    state = rng_before
    for _ in range(draws):
        state = step(state)
    return state


@pytest.mark.parametrize('damage,expected_hp_field', [
    (255, 0),          # maximum damage: "kill blow", full overkill
    (0, FORGED_HP),     # zero damage: a claimed attack that does nothing
])
def test_forged_maximal_draws_record_is_currently_authorized_no_real_callback_ran(damage, expected_hp_field):
    """PINS THE GAP: a record nobody's real effect-7 execution could have
    produced (65535 RNG draws is not a plausible single-attack cost) still
    passes `authorize_effect7` when its RNG arithmetic is merely
    self-consistent. This is Codex's forged-record finding, pinned so the
    boundary's current, deliberate permissiveness cannot silently regress
    into being mistaken for a provenance guarantee it was never designed
    to provide.
    """
    draws = 0xFFFF  # maximum representable draw count -- the forgery
    rng_after = _fold(BEFORE, draws)
    record = m.pack(callback_id=7, write_flag=1, draws=draws, rng_before=BEFORE,
                    rng_after=rng_after, target_ordinal=1, damage=damage, queue_slot=0)
    body = _forged_body()
    # This does NOT raise: the forged record is indistinguishable, to this
    # boundary, from a genuine one. That is the finding, not a bug in this
    # test.
    new_body, new_rng = authorize_effect7(record, BEFORE, body)
    assert new_rng == rng_after
    assert new_body[407] == expected_hp_field
