"""tools/test_mididax_event_frame.py -- pytest for round 35 R2's measurement of the
CoK `MIDI.DAX` event-record width, taken from the driver's own code.

What is pinned here, in order:

  - the interpreter entry is DERIVED (slot-0 stub -> `sub_table` -> entry 0), not
    written down from a hex dump;
  - block 1 (C/MS) and block 3 (AdLib) measure the SAME framing:
    0x90 / 0x80 = 2 data bytes + 1 wait byte, 0xC0 = 1 + 1, 0xE0 = 2 + 1,
    unrecognised kinds = 2 + 1, and 0xFC = one flag byte and NO wait byte;
  - the wait byte's store instruction is the doc's own `[0x2BD]` cell for block 1
    (`[0x346]` for block 3), and that cell is the one tested+decremented once per
    tick at the interpreter head -- i.e. the third byte IS section 1.4's predicted
    per-tick wait counter, now located in the stream;
  - all five driver blocks are measured, and block 2 (MPU-401) is asserted to be
    the documented structural exception (it dispatches 0xB0/0xD0/0xC0 and forwards
    0x8x/0x9x through a width flag) rather than being quietly averaged in;
  - the reference stream decoder, driven by the MEASURED widths, reproduces the
    round's census of `Champions of Krynn/SOUND.DAX` block 1 to the digit;
  - MUTATION TESTS. Two byte-level mutations are seen RED. And the plan's own
    suggested mutation -- "point it at a shifted offset" -- is measured and found
    only PARTLY discriminating (10 of 16 shifts fail, 6 re-synchronise onto the
    same instruction stream and return the right answer anyway), which is recorded
    as a fact about x86 self-synchronisation, not papered over.

Tests that need the retail `MIDI.DAX` / `SOUND.DAX` skip when it is absent.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_event_frame as frame  # noqa: E402
import dax_decode as dx  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
MIDI_DAX = REPO_ROOT / "Champions of Krynn" / "MIDI.DAX"
SOUND_DAX = REPO_ROOT / "Champions of Krynn" / "SOUND.DAX"

#: Bytes consumed after the status byte, wait byte INCLUDED.
EXPECTED = {"0x80": 3, "0x90": 3, "0xc0": 2, "0xe0": 3, "default": 3}


def _blocks():
    if not MIDI_DAX.exists():
        pytest.skip(f"game data not present: {MIDI_DAX}")
    return frame.load_midi_blocks(MIDI_DAX)


def _sound_block1() -> bytes:
    if not SOUND_DAX.exists():
        pytest.skip(f"game data not present: {SOUND_DAX}")
    data = SOUND_DAX.read_bytes()
    base, blocks = dx.parse_container(data)
    return dx.decompress_block(data, base, blocks[0])


# ---------------------------------------------------------------------------
# 0. The entry point is derived, never written down
# ---------------------------------------------------------------------------


def test_interpreter_entry_is_derived_from_the_slot0_stub():
    blocks = _blocks()
    # doc section 1.5a: the per-block-varying `call word ptr [bx+disp16]` operand
    assert frame.sub_table_offset(blocks[1]) == 712
    assert frame.sub_table_offset(blocks[3]) == 853
    # sub_table[0] is the tick interpreter in both blocks (sub_table[1] is slot 1)
    assert frame.interpreter_entry(blocks[1]) == 1006
    assert frame.interpreter_entry(blocks[3]) == 1006
    assert frame.slot_targets(blocks[1])[1] == 745   # doc section 1.4's slot-1 entry
    assert frame.slot_targets(blocks[3])[1] == 886


# ---------------------------------------------------------------------------
# 1. The framing, measured from two independent backends
# ---------------------------------------------------------------------------


def test_block1_cms_record_widths():
    rep = frame.analyze_block(_blocks()[1])
    assert frame.frame_widths(rep) == EXPECTED
    b = rep["branches"]
    # the exact fetch instructions the count is built from (block-relative offsets)
    assert b["0x90"]["fetch_addrs"] == [0x506, 0x516, 0x51A, 0x5DA]
    assert b["0x80"]["fetch_addrs"] == [0x5DA]
    assert b["0xc0"]["fetch_addrs"] == [0x4D0]
    # 0x80's SECOND data byte is framed but never read: a bare `inc si` skips it,
    # which is why the count comes from SI advancement and not from fetch count.
    assert b["0x80"]["data_bytes"] == 2 and len(b["0x80"]["fetch_addrs"]) == 1
    # block 1's 0xE0 branch reads NEITHER of its two data bytes (`inc si; inc si`)
    assert b["0xe0"]["data_bytes"] == 2 and b["0xe0"]["fetch_addrs"] == []
    assert rep["counts_sound"] is True


def test_block3_adlib_record_widths_agree_with_block1():
    blocks = _blocks()
    rep1 = frame.analyze_block(blocks[1])
    rep3 = frame.analyze_block(blocks[3])
    assert frame.frame_widths(rep3) == EXPECTED
    assert frame.frame_widths(rep3) == frame.frame_widths(rep1)
    b = rep3["branches"]
    assert b["0x90"]["fetch_addrs"] == [0x527, 0x537, 0x53B, 0x5F4]
    assert b["0x80"]["fetch_addrs"] == [0x5F4]
    assert b["0xc0"]["fetch_addrs"] == [0x4EF]
    # unlike block 1, block 3 actually READS both 0xE0 data bytes
    assert b["0xe0"]["fetch_addrs"] == [0x468, 0x46C]
    assert rep3["counts_sound"] is True


# ---------------------------------------------------------------------------
# 2. The third byte is section 1.4's per-tick wait counter
# ---------------------------------------------------------------------------


def test_wait_byte_lands_in_the_documented_per_tick_counter_cell():
    blocks = _blocks()
    rep1 = frame.analyze_block(blocks[1])
    # docs/midi-dax-format.md section 1.4 predicted `[0x2BD]` from the head's
    # decrement alone and could not say where the value came from. It comes from
    # the LAST byte of every event record, at 0x493, stored (minus one) at 0x4a0.
    assert rep1["wait_cell"] == 0x2BD
    assert rep1["tail_fetch_addr"] == 0x493
    assert rep1["wait_store_addr"] == 0x4A0
    assert rep1["wait_cell_head_cmp"] and rep1["wait_cell_head_dec"]

    rep3 = frame.analyze_block(blocks[3])
    assert rep3["wait_cell"] == 0x346
    assert rep3["tail_fetch_addr"] == 0x4D3
    assert rep3["wait_store_addr"] == 0x4E0
    assert rep3["wait_cell_head_cmp"] and rep3["wait_cell_head_dec"]


def test_terminator_takes_a_flag_byte_and_no_wait_byte():
    for bid in (1, 3):
        rep = frame.analyze_block(_blocks()[bid])
        term = rep["terminator"]
        assert term["flag_bytes"] == 1, bid
        assert term["reaches_tail"] is False, bid  # 0xFC never reaches the wait tail
        assert term["loop_test_addrs"], bid        # `cmp al, 0x80` -> restart the stream


# ---------------------------------------------------------------------------
# 3. All five blocks, with block 2's structural exception stated, not averaged
# ---------------------------------------------------------------------------


def test_all_five_driver_blocks_measured_and_block2_is_the_stated_exception():
    blocks = _blocks()
    widths = {bid: frame.frame_widths(frame.analyze_block(raw)) for bid, raw in blocks.items()}
    for bid in (1, 3, 4, 5):
        assert widths[bid] == EXPECTED, (bid, widths[bid])
    # Block 2 is the Roland MPU-401 backend: it has NO 0x90/0x80 branch at all
    # (those bytes are forwarded to the MIDI port), and instead branches 0xB0/0xD0
    # with MIDI's own data-byte counts -- plus the same trailing wait byte.
    assert "0x90" not in widths[2] and "0x80" not in widths[2]
    assert widths[2]["0xb0"] == 3   # 2 data + wait
    assert widths[2]["0xd0"] == 2   # 1 data + wait
    assert widths[2]["0xc0"] == 2   # 1 data + wait, same as every other block
    for bid in blocks:
        assert frame.analyze_block(blocks[bid])["counts_sound"] is True, bid


# ---------------------------------------------------------------------------
# 4. The census, decoded with the measured widths
# ---------------------------------------------------------------------------


def test_measured_widths_decode_sound_dax_block1_to_the_published_census():
    rep = frame.analyze_block(_blocks()[1])
    raw = _sound_block1()
    census = frame.decode_events(raw, frame.data_widths(rep))
    assert len(raw) == 14064
    assert census["count_without_end"] == 3699
    assert census["count_with_end"] == 3700
    assert census["note_on"] == 1846
    assert census["note_off"] == 1846
    assert census["program_change"] == 7
    assert census["tick_total"] == 7860
    assert census["malformed"] == 0
    assert census["end_reason"] == "clean-end"
    assert census["channels"] == [1, 2, 3, 4, 5]
    # The frame closes the buffer exactly: the 0xFC's flag byte is the LAST byte.
    assert census["last_consumed_offset"] == len(raw) - 1
    # ...and that flag is 0x81, not the 0x80 the handler tests for, so this bank
    # ends rather than restarting. (Stated as what the handler does with the byte.)
    assert census["end_flag"] == 0x81
    # Two content facts the framing makes visible and the 1-byte reading could not:
    offs = [e for e in census["events"] if e["kind"] == "noteOff" and len(e["data"]) == 2]
    assert len(offs) == 1846
    assert {e["data"][1] for e in offs} == {64}
    ons = [e for e in census["events"] if e["kind"] == "noteOn"]
    assert min(e["data"][0] for e in ons) == 36 and max(e["data"][0] for e in ons) == 96
    assert {e["data"][1] for e in ons} == {75, 85, 90, 100, 120, 127}


# ---------------------------------------------------------------------------
# 5. Mutation tests -- the probe is seen failing before it is trusted
# ---------------------------------------------------------------------------


def test_mutation_removing_one_inc_si_changes_the_measured_width():
    raw = bytearray(_blocks()[1])
    assert raw[0x5DE] == 0x46, "expected `inc si` (0x46) at block-1 0x5de"
    raw[0x5DE] = 0x90  # nop out the skip of Note-Off's second data byte
    widths = frame.frame_widths(frame.analyze_block(bytes(raw)))
    assert widths["0x80"] == 2, widths            # was 3
    # 0x90's velocity-0 path jumps INTO the 0x80 handler, so the two paths now
    # disagree (2 vs 3) and the branch is reported ambiguous rather than guessed.
    assert "0x90" not in widths, widths
    assert widths != EXPECTED


def test_mutation_breaking_the_tail_shape_makes_the_tool_refuse():
    raw = bytearray(_blocks()[1])
    assert bytes(raw[0x497:0x499]) == b"\x3c\x00", "expected `cmp al, 0` at 0x497"
    raw[0x498] = 0x01  # `cmp al, 1` -- no longer the wait-byte tail
    with pytest.raises(ValueError):
        frame.analyze_block(bytes(raw))


def test_pointing_the_tool_at_a_non_interpreter_entry_refuses():
    with pytest.raises(ValueError):
        frame.analyze_block(_blocks()[1], 718)  # slot 0's trampoline, not the interpreter


def test_shifted_entry_offset_is_only_partly_discriminating():
    """
    The plan asked for "fails when pointed at a shifted offset". Measured: it does
    for 10 of 16 shifts, and for the other 6 the x86 stream re-synchronises within
    a couple of bytes and the tool returns the correct framing anyway. Recorded as
    a measured non-discriminator, so nobody later cites a passing shift sweep as
    proof the entry offset is right. The byte-level mutations above are what carry
    the "this probe can fail" claim.
    """
    raw = _blocks()[1]
    entry = frame.interpreter_entry(raw)
    failed, resynced, other = 0, 0, []
    for shift in list(range(-8, 0)) + list(range(1, 9)):
        try:
            widths = frame.frame_widths(frame.analyze_block(raw, entry + shift))
        except Exception:
            failed += 1
            continue
        if widths == EXPECTED:
            resynced += 1
        else:
            other.append((shift, widths))
    assert failed == 10, (failed, resynced, other)
    assert resynced == 6, (failed, resynced, other)
    assert other == []
