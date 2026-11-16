"""
Pins for `tools/moncha_rle.py`, the 257 - c run-length convention used by HLIB/GLIB
`DATA` members.

The convention itself is old news -- `packages/engine/src/util/rle.ts`'s `monchaRLE` is
the reference implementation and documents it. What these tests exist to stop is the
mistake the Python side kept making: reaching for `tools/dax_decode.py`'s `rle_decode`
(256 - c, correct for `.DAX`) on a `DATA` member, which does not fail loudly. It decodes,
just short and out of phase, so the damage reads as a wrong offset rather than a wrong
codec.

So the synthetic tests are written to DISCRIMINATE, not merely to pass: each one uses an
input the two conventions disagree on, and `test_repeat_count_is_257_minus_c_not_256`
asserts that disagreement against the real `dax_decode.rle_decode` rather than against a
restatement of it. A pin both conventions satisfy would prove nothing.

The real-data tests use the declared 2-byte big-endian uncompressed length as the oracle:
the engine passes that word to its decompressor as the expected output size, so it is an
independent check that was not produced by our decoder. DQK's `MONCHA.GLB` is in-repo;
FRUA's `MONST.GLB` lives in the never-vendored GOG install and skips when absent.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import dax_decode  # noqa: E402
from moncha_rle import (MONCHA_MEMBER_HEADER, decode_moncha_member,  # noqa: E402
                        iter_moncha_members, moncha_rle)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DQK_MONCHA = os.path.join(REPO, "The Dark Queen of Krynn", "DISK2", "MONCHA.GLB")
FRUA_MONST = (r"C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures"
              r"\DISK2\MONST.GLB")


# --------------------------------------------------------------------------- #
# Synthetic pins -- every one of these separates 257 - c from 256 - c
# --------------------------------------------------------------------------- #
def test_literal_run_copies_c_plus_one_bytes():
    # Control 0x02 => copy 3 literals. Shared with DAX; here to anchor the half that
    # does NOT differ, so a failure elsewhere can be localised.
    assert moncha_rle(b"\x02ABC") == b"ABC"
    assert moncha_rle(b"\x00Z") == b"Z"


def test_repeat_count_is_257_minus_c_not_256():
    """The discriminating pin: same bytes, two conventions, different answers."""
    # c = 0xFF => 257 - 255 = 2 repeats here, but 256 - 255 = 1 under DAX.
    assert moncha_rle(b"\xff\x41") == b"AA"
    assert dax_decode.rle_decode(b"\xff\x41") == b"A"
    # c = 0x81 => 128 repeats here, 127 under DAX (the saturating control SSI actually
    # emits most often).
    assert moncha_rle(b"\x81\x41") == b"A" * 128
    assert dax_decode.rle_decode(b"\x81\x41") == b"A" * 127
    # And the two implementations must actually disagree on this input -- if a future
    # edit made them agree, one of them would be wrong for its own family.
    assert moncha_rle(b"\xff\x41") != dax_decode.rle_decode(b"\xff\x41")


def test_repeat_range_is_two_to_128():
    # 0x81 is the largest run (128) and 0xFF the smallest (2); there is no 1-byte run
    # under this convention, which is exactly what frees 0x80 to be an opcode.
    assert len(moncha_rle(b"\x81\x00")) == 128
    assert len(moncha_rle(b"\xff\x00")) == 2


def test_0x80_is_a_no_op_not_a_run():
    """0x80 consumes nothing and emits nothing -- it is not a 128-byte repeat (the DAX
    reading) and not a 129-byte literal copy."""
    # Bare 0x80 produces nothing at all.
    assert moncha_rle(b"\x80") == b""
    # 0x80 in front of a literal run leaves the run untouched: the 0x00 that follows is
    # read as the next CONTROL byte (copy 0 + 1 literals), not as a repeat value.
    assert moncha_rle(b"\x80\x00Q") == b"Q"
    # DAX would have swallowed the next byte as a repeat value and emitted 128 copies.
    assert dax_decode.rle_decode(b"\x80\x00Q") == b"\x00" * 128
    # Interleaved with real data, the no-op is transparent.
    assert moncha_rle(b"\x01AB\x80\x00C") == b"ABC"


def test_expected_bound_stops_early():
    assert moncha_rle(b"\x81\x41", expected=10) == b"A" * 10
    assert moncha_rle(b"\x81\x41", expected=None) == b"A" * 128


def test_truncated_stream_is_tolerated_not_raised():
    # A trailing control byte with no operand must not raise; the caller's length check
    # is what catches a desync.
    assert moncha_rle(b"\x02AB") == b"AB"
    assert moncha_rle(b"\xff") == b""


def test_decode_moncha_member_validates_the_declared_length():
    body = b"\xff\x41"                       # expands to 2 bytes ("AA")
    assert decode_moncha_member(b"\x00\x02" + body) == b"AA"
    with pytest.raises(ValueError):
        decode_moncha_member(b"\x00\x03" + body)
    with pytest.raises(ValueError):
        decode_moncha_member(b"\x00")


# --------------------------------------------------------------------------- #
# Real bytes -- the declared length word is the oracle, and 256 - c is the null
# --------------------------------------------------------------------------- #
def _dax_convention_member(member):
    """What a caller reaching for `dax_decode.rle_decode` would have got."""
    return dax_decode.rle_decode(member[MONCHA_MEMBER_HEADER:])


def _declared(member):
    return (member[0] << 8) | member[1]


@pytest.mark.skipif(not os.path.exists(DQK_MONCHA),
                    reason="DQK MONCHA.GLB not present")
def test_dqk_moncha_members_all_match_their_declared_length():
    data = open(DQK_MONCHA, "rb").read()
    members = list(iter_moncha_members(data))
    assert len(members) == 98
    good = sum(1 for _i, m in members
               if len(moncha_rle(m[MONCHA_MEMBER_HEADER:])) == _declared(m))
    assert good == 98
    # Every member also survives the validating wrapper.
    for _i, m in members:
        decode_moncha_member(m)


@pytest.mark.skipif(not os.path.exists(DQK_MONCHA),
                    reason="DQK MONCHA.GLB not present")
def test_dqk_moncha_null_the_dax_convention_matches_nothing():
    """The null. 98/98 vs 0/98 is what makes the test above a measurement."""
    data = open(DQK_MONCHA, "rb").read()
    members = list(iter_moncha_members(data))
    good = sum(1 for _i, m in members if len(_dax_convention_member(m)) == _declared(m))
    assert good == 0


@pytest.mark.skipif(not os.path.exists(FRUA_MONST),
                    reason="FRUA MONST.GLB not present (never-vendored GOG install)")
def test_frua_monst_records_are_a_single_length_only_under_257():
    """FRUA is the fixed-record-size corpus, so the shape of the failure is visible:
    257 - c gives one length for all 127 records, 256 - c shatters it."""
    data = open(FRUA_MONST, "rb").read()
    members = [m for _i, m in iter_moncha_members(data)]
    assert len(members) == 127
    ours = {len(moncha_rle(m[MONCHA_MEMBER_HEADER:])) for m in members}
    assert ours == {450}
    theirs = {len(_dax_convention_member(m)) for m in members}
    assert len(theirs) > 1 and 450 not in theirs
