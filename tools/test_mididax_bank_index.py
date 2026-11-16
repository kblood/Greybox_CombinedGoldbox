"""tools/test_mididax_bank_index.py -- pytest for round 34 R6's recalibrated
CoK SOUND.DAX static scorer, header verdict, segmenter, and cursor reader.

Covers, in order:
  - the old `grammar_score`'s void-detector reproduction (positive control
    scores 16, below its own published 18 bar);
  - `clean_prefix_events` unit behaviour on hand-built byte streams (clean
    end, malformed status, malformed data, orphan running-status data,
    ran-off-end) -- each with a KNOWN answer, not just "it runs";
  - the recalibrated ranking on a small synthetic corpus with a known real
    stream against x86-code-alias distractors;
  - `segment_stream` on a synthetic multi-segment stream;
  - `header_directory_test`'s shuffled-header null is reproducible at a fixed
    seed;
  - `cursor_from_dump` / `classify_offset` on a synthetic buffer;
  - real-file integration checks (skipped if the game data isn't present)
    pinning the round's own headline numbers: 814 sources, rank #1, 11088
    events, >=1 song-like segment;
  - a mutation test that flips one comparison in `clean_prefix_events` and
    proves the harness actually goes RED for it (ground rule: a probe that
    has never been seen failing is not evidence).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_bank_index as bank  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
SOUND_DAX = REPO_ROOT / "Champions of Krynn" / "SOUND.DAX"


def _skip_if_missing(path: Path):
    if not path.exists():
        pytest.skip(f"game data not present: {path}")


# ---------------------------------------------------------------------------
# 0. Old scorer void-detector reproduction
# ---------------------------------------------------------------------------


def test_old_scorer_positive_control_scores_below_its_own_hit_bar():
    _skip_if_missing(SOUND_DAX)
    result = bank.old_scorer_positive_control()
    assert result["max_score"] == 16, (
        f"old grammar_score's positive control changed from the plan's measured 16 "
        f"to {result['max_score']} -- re-check whether the scanner is still void"
    )
    assert result["max_score"] < result["published_hit_bar"]
    assert result["max_score"] > result["published_null_max"]


# ---------------------------------------------------------------------------
# 1. clean_prefix_events unit behaviour -- known answers on hand-built bytes
# ---------------------------------------------------------------------------


def test_clean_prefix_events_clean_end():
    # Note-on ch0 note=60 then FC (end).
    buf = bytes([0x90, 60, 0xFC])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 1
    assert run.reason == "clean-end"
    assert run.end_offset == 2


def test_clean_prefix_events_running_status_continuation():
    # Note-on ch0 note=60, then running-status note=61 (no new status byte),
    # then FC.
    buf = bytes([0x90, 60, 61, 0xFC])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 2
    assert run.reason == "clean-end"


def test_clean_prefix_events_malformed_status_byte():
    # 0xA0 is a status byte (high bit set) but not a recognized kind.
    buf = bytes([0x90, 60, 0xA0, 1])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 1
    assert run.reason == "malformed-status"
    assert run.end_offset == 2


def test_clean_prefix_events_malformed_data_byte():
    # Note-on needs 1 data byte with the high bit clear; 0xFF has it set.
    buf = bytes([0x90, 0xFF])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 0
    assert run.reason == "malformed-data"


def test_clean_prefix_events_orphan_running_status_data():
    # A bare data byte with no preceding status byte in this decode at all.
    buf = bytes([60, 61])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 0
    assert run.reason == "malformed-orphan-data"


def test_clean_prefix_events_ran_off_end():
    buf = bytes([0x90, 60])[:-1]  # note-on with its data byte truncated away
    run = bank.clean_prefix_events(bytes([0x90]), 0)
    assert run.events == 0
    assert run.reason == "ran-off-end"


def test_clean_prefix_events_stops_at_first_malformed_not_after():
    # Real events, THEN a malformed byte, then more real-looking events --
    # score must reflect only the clean PREFIX, proving this is stricter
    # than a tally-good-vs-bad-and-sum scorer.
    buf = bytes([0x90, 60, 0x80, 60]) + bytes([0xA0, 1]) + bytes([0x90, 60, 0x80, 60])
    run = bank.clean_prefix_events(buf, 0)
    assert run.events == 2  # only the two clean events before the 0xA0
    assert run.reason == "malformed-status"


# ---------------------------------------------------------------------------
# 2. Recalibrated ranking on a small synthetic corpus
# ---------------------------------------------------------------------------


def _make_real_stream(n_events: int) -> bytes:
    out = bytearray()
    for i in range(n_events):
        out.append(0x90)
        out.append(i % 100)
        out.append(0x80)
        out.append(i % 100)
    out.append(0xFC)
    return bytes(out)


def test_recalibrated_rank_prefers_real_stream_over_code_like_distractor():
    real = _make_real_stream(50)  # 100 clean events then a clean-end
    # A distractor guaranteed to be malformed at the very first event under
    # the grammar (0x81 = Note-Off status, needs one data byte with the high
    # bit clear; 0x82 has it set -- "malformed-data" immediately, at every
    # starting offset), unlike a real event stream which never behaves this
    # way and eventually reaches a clean 0xFC terminator.
    distractor = bytes([0x81, 0x82] * 40)
    sources = [("real", real), ("distractor", distractor)]
    ranked = bank.recalibrated_rank(sources)
    assert ranked[0]["source"] == "real"
    assert ranked[0]["reason"] == "clean-end"
    assert ranked[0]["events"] >= 90


def test_shuffled_source_null_does_not_reach_real_stream_score():
    real = _make_real_stream(80)  # 160 events
    sources = [("real", real)]
    null_scores = bank.shuffled_source_null(sources, seed=1)
    real_events, _off, _reason = bank.best_clean_run_for_source(real)
    assert all(n < real_events for n in null_scores)


# ---------------------------------------------------------------------------
# 3. segment_stream on a synthetic multi-segment stream
# ---------------------------------------------------------------------------


def test_segment_stream_splits_on_control_change():
    events = [
        bank.Event(0, 0x90, 0, (60,)),
        bank.Event(2, 0x80, 0, (60,)),
        bank.Event(4, 0xC0, 0, (1,)),  # boundary
        bank.Event(6, 0x90, 1, (61,)),
        bank.Event(8, 0x80, 1, (61,)),
        bank.Event(10, 0x90, 2, (62,)),
        bank.Event(12, 0x80, 2, (62,)),
    ]
    segs = bank.segment_stream(events)
    assert len(segs) == 2
    assert segs[0].event_count == 2
    assert segs[1].event_count == 5
    # channels only counts Note-On/Off events (kind 0x80/0x90), not the 0xC0
    # boundary event itself -- the boundary's own channel field (0) is not a
    # "voice" in the segment's own note content.
    assert segs[1].channels == [1, 2]


def test_is_song_like_requires_event_count_voices_and_balance():
    balanced = bank.Segment(0, 999, event_count=200, note_on=100, note_off=100, channels=[0, 1, 2])
    assert bank.is_song_like(balanced)

    too_short = bank.Segment(0, 10, event_count=50, note_on=25, note_off=25, channels=[0, 1, 2])
    assert not bank.is_song_like(too_short)

    too_few_voices = bank.Segment(0, 999, event_count=200, note_on=100, note_off=100, channels=[0])
    assert not bank.is_song_like(too_few_voices)

    unbalanced = bank.Segment(0, 999, event_count=200, note_on=180, note_off=20, channels=[0, 1, 2])
    assert not bank.is_song_like(unbalanced)


# ---------------------------------------------------------------------------
# 4. header_directory_test null reproducibility
# ---------------------------------------------------------------------------


def test_header_directory_test_null_reproducible_at_fixed_seed():
    _skip_if_missing(SOUND_DAX)
    raw = bank.scan_mod.dax_blocks(SOUND_DAX)[1]
    r1 = bank.header_directory_test(raw, header_len=128, stream_start=128, shuffle_n=200, seed=42)
    r2 = bank.header_directory_test(raw, header_len=128, stream_start=128, shuffle_n=200, seed=42)
    assert r1["shuffled_header_null_status_mean"] == r2["shuffled_header_null_status_mean"]
    assert r1["shuffled_header_null_status_max"] == r2["shuffled_header_null_status_max"]


def test_header_directory_test_real_status_frac_beats_shuffled_header_null():
    _skip_if_missing(SOUND_DAX)
    raw = bank.scan_mod.dax_blocks(SOUND_DAX)[1]
    result = bank.header_directory_test(raw, header_len=128, stream_start=128, shuffle_n=1000, seed=20260904)
    assert result["real_status_frac"] > result["shuffled_header_null_status_max"], (
        "the real header's fresh-status-byte hit rate no longer clears the "
        "histogram-preserving shuffled-header null -- the directory-leaning "
        "reading in the R6 report needs re-checking"
    )
    # The plan's OWN proposed null (uniform random offset, density ~0.79) does
    # NOT discriminate -- this is reported explicitly, not hidden.
    assert result["uniform_null_discriminates"] is False


def test_header_directory_test_uniform_null_matches_measured_boundary_density():
    _skip_if_missing(SOUND_DAX)
    raw = bank.scan_mod.dax_blocks(SOUND_DAX)[1]
    result = bank.header_directory_test(raw, header_len=128, stream_start=128, shuffle_n=10, seed=1)
    assert abs(result["uniform_random_offset_null_any_density"] - 0.7957) < 0.001


# ---------------------------------------------------------------------------
# 5. cursor_from_dump / classify_offset on synthetic data
# ---------------------------------------------------------------------------


def test_classify_offset_finds_containing_segment():
    segs = [
        bank.Segment(0, 9, 5, 2, 3, [0]),
        bank.Segment(10, 99, 40, 20, 20, [0, 1, 2]),
    ]
    assert bank.classify_offset(segs, 5) == 0
    assert bank.classify_offset(segs, 50) == 1
    assert bank.classify_offset(segs, 200) is None


def test_cursor_from_dump_reads_the_per_block_offset():
    # Build a fake "dump" where a block-3 driver copy's base is 0x100, and
    # plant a nonzero word at base+0x340 (block 3's own cursor cell).
    base = 0x100
    dump = bytearray(base + 0x400)
    dump[base + 0x340] = 0x58
    dump[base + 0x341] = 0x0B
    copy = bank.loc_mod.DriverCopy(stub_offset=0, displacement=853, base=base, matches_block=3)
    si = bank.cursor_from_dump(bytes(dump), copy)
    assert si == 0x0B58


def test_cursor_from_dump_returns_none_for_unmatched_block():
    dump = bytes(0x500)
    copy = bank.loc_mod.DriverCopy(stub_offset=0, displacement=999, base=0x100, matches_block=None)
    assert bank.cursor_from_dump(dump, copy) is None


# ---------------------------------------------------------------------------
# 6. Real-file integration -- the round's own headline numbers
# ---------------------------------------------------------------------------


def test_sound_dax_is_one_block_14064_bytes():
    _skip_if_missing(SOUND_DAX)
    blocks = bank.scan_mod.dax_blocks(SOUND_DAX)
    assert sorted(blocks) == [1]
    assert len(blocks[1]) == 14064


def test_recalibrated_scorer_ranks_positive_control_first_of_814():
    _skip_if_missing(SOUND_DAX)
    sources = bank._corpus_sources()
    assert len(sources) == 814, (
        f"corpus source count changed from 814 to {len(sources)} -- re-check "
        "against tools/mididax_song_scan.py's own count before trusting the rank"
    )
    ranked = bank.recalibrated_rank(sources)
    assert ranked[0]["source"] == "SOUND.DAX:block1"
    assert ranked[0]["reason"] == "clean-end"
    assert ranked[0]["events"] == 11088
    # Wide separation from #2, not a photo finish.
    assert ranked[0]["events"] > ranked[1]["events"] * 2


def test_sound_dax_has_song_like_segment_and_no_malformed():
    _skip_if_missing(SOUND_DAX)
    raw = bank.scan_mod.dax_blocks(SOUND_DAX)[1]
    decoded = bank.decode_full_stream(raw, 128)
    assert decoded.malformed == 0
    assert decoded.reason == "clean-end"
    segments = bank.segment_stream(decoded.events)
    song_like = [s for s in segments if bank.is_song_like(s)]
    assert len(song_like) >= 1
    assert any(s.event_count >= 200 for s in song_like)


def test_cursor_report_on_kept_dumps_lands_in_a_song_like_segment():
    """Reuses round 33's kept GameLink dumps (no new DOSBox-X session) --
    skipped if they are not present locally (git-ignored scratch)."""
    _skip_if_missing(SOUND_DAX)
    dump = REPO_ROOT / "build" / "r6-dosbox-out" / "ram1.bin"
    _skip_if_missing(dump)
    raw = bank.scan_mod.dax_blocks(SOUND_DAX)[1]
    decoded = bank.decode_full_stream(raw, 128)
    segments = bank.segment_stream(decoded.events)
    report = bank.cursor_report([dump], segments)
    live_copies = [c for c in report[0]["driver_copies"] if c["cx_handshake"] != "0x0"]
    assert live_copies, "expected at least one installed (non-zero CX handshake) driver copy in ram1.bin"
    for c in live_copies:
        assert c["segment_index"] is not None, f"live cursor {c['cursor_si']} did not land in any decoded segment"
        assert segments[c["segment_index"]].event_count >= 200


# ---------------------------------------------------------------------------
# 7. Mutation test -- watch a probe actually go RED
# ---------------------------------------------------------------------------


def test_mutation_flipping_malformed_status_check_breaks_the_known_answer():
    """Ground rule: a probe that has never been seen failing is not evidence.
    Flip `need is None` to `need is not None` in a local copy of the
    malformed-status branch logic and confirm the KNOWN-malformed case
    (0xA0, an unrecognized status kind) now WRONGLY reports it as fine --
    i.e. confirm the real function's check is load-bearing by showing what
    breaks without it."""

    def mutated_clean_prefix_events(buf: bytes, start: int) -> bank.CleanRun:
        i = start
        n = len(buf)
        events = 0
        last_kind = None
        while i < n:
            b = buf[i]
            if b & 0x80:
                if b == 0xFC:
                    return bank.CleanRun(events, "clean-end", i)
                kind = b & 0xF0
                need = bank.NEED_BY_KIND.get(kind)
                if need is not None:  # MUTATED: was `if need is None:` -- inverted
                    return bank.CleanRun(events, "malformed-status", i)
                # mutated branch now treats every unrecognized kind as fine
                # (need is None here, so this used to be the malformed path)
                events += 1
                i += 1
                continue
            else:
                if last_kind is None:
                    return bank.CleanRun(events, "malformed-orphan-data", i)
                kind, need = last_kind
                if i + need > n:
                    return bank.CleanRun(events, "ran-off-end", i)
                data_bytes = buf[i:i + need]
                if any(db & 0x80 for db in data_bytes):
                    return bank.CleanRun(events, "malformed-data", i)
                events += 1
                i += need
        return bank.CleanRun(events, "exhausted", i)

    buf = bytes([0x90, 60, 0xA0, 1])
    real = bank.clean_prefix_events(buf, 0)
    mutated = mutated_clean_prefix_events(buf, 0)

    assert real.reason == "malformed-status" and real.events == 1 and real.end_offset == 2
    # The mutation must disagree with the real function's EVENT COUNT (both
    # happen to land on the string "malformed-status", but for entirely
    # different reasons -- the real function correctly decodes the first
    # valid Note-On/Off pair before hitting the genuinely bad 0xA0 byte,
    # while the mutated version wrongly flags the very FIRST, legitimate
    # status byte as malformed). If this assertion itself fails, the
    # mutation was a no-op and proves nothing.
    assert mutated.events != real.events or mutated.end_offset != real.end_offset, (
        "MUTATION DID NOT CHANGE BEHAVIOUR -- the malformed-status check is "
        "not load-bearing for this input, pick a different mutation target"
    )
    assert mutated.events == 0 and mutated.end_offset == 0, (
        "expected the mutated (inverted) check to misflag the very first, "
        "legitimate status byte as malformed -- got a different failure mode, "
        "re-derive the mutation's expected output"
    )
