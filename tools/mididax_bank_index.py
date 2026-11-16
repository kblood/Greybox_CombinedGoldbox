#!/usr/bin/env python3
"""tools/mididax_bank_index.py -- CoK music, round 34 R6.

Round 33 R6 (docs/midi-dax-format.md section 1.8) found that both live CX/ES
handshake buffers it captured decode cleanly under section 1.4's grammar and
are byte-identical to `Champions of Krynn/SOUND.DAX` block 1 -- but called
that a negative for MIDI.DAX's own song location ("both dynamic captures
happened to catch an SFX-bank install"). That negative answered "is this the
SFX bank?" and never asked "is this a bank of ALL sequences, songs included?"
This module answers the second question, from bytes.

Two prerequisites, both measured here before anything else is trusted:

  1. Round 33/34's `mididax_song_scan.grammar_score` gives its own ONLY known
     positive control (SOUND.DAX block 1, decoded from offset 128) a max
     score of 16 -- BELOW that scorer's own published "hit" bar of 18, while
     the shuffled null tops at 14. A detector that scores its only positive
     control below its own bar is not a detector: every static negative that
     used it is void. `old_scorer_positive_control()` reproduces this.

  2. A recalibrated scorer, `clean_prefix_events()`: starting at a candidate
     offset, decode the section-1.4 running-status grammar with NO tolerance
     for a malformed byte (stop at the first one) and score = the number of
     clean events decoded before that happens (or before a clean `0xFC`
     terminator, which is reported separately as the strongest possible
     signal). This is stricter than the old scorer, which *tallied* good vs.
     bad events over a fixed 64-byte window and let bad events cancel out
     rather than disqualifying the whole window. `recalibrated_rank()` runs
     this over the SAME 814-source corpus `mididax_song_scan.cmd_scan` builds
     and reports where the known positive control ranks.

Once the scorer is trusted, this module also:

  - tests the header (`Champions of Krynn/SOUND.DAX` block 1's first ~128
    bytes) for "sequence directory" vs. "driver state" (`header_directory_test`),
    against a null built by permuting the header's OWN bytes (preserving its
    value histogram) rather than a uniform-random-offset null -- the uniform
    null turned out to already sit near the observed hit rate on the "any
    event boundary" test (both ~0.79-0.89), so it cannot discriminate; the
    stricter "lands on a FRESH STATUS byte, not a running-status continuation"
    test plus the histogram-preserving shuffle is what actually separates
    signal from chance here;
  - segments the full decoded event stream on control-change (0xC0) events
    (`segment_stream`) and reports each segment's event count, note-channel
    set, and Note-On/Off balance -- the discriminator between "only SFX"
    (every segment small) and "a song is in here" (>=200 events, balanced
    Note-On/Off, >=3 voices);
  - reads the driver's own persisted read-cursor cell out of a kept GameLink
    RAM dump (`cursor_from_dump`) using the PER-BLOCK offset this module's own
    disassembly located (see CURSOR_OFFSETS below -- section 1.4's doc text
    named `[0x2B7]` without saying that offset is block-1-specific; block 3
    -- the block actually resident in every kept round-33 dump -- uses
    `[0x340]`, confirmed by disassembling ITS OWN slot-1 code, not assumed
    from block 1's), and reports which decoded segment that live value falls
    inside.

No new DOSBox-X session is required for the cursor check: round 33's own kept
GameLink dumps (`build/r6-dosbox-out/ram1.bin`, `build/r6-dosbox-out2/ram{A,A2,B}.bin`)
are still present (git-ignored, not committed) and are read here exactly as
`mididax_song_locate.py` already reads them -- this module only adds the
correct per-block cursor-cell offset and the segment-membership lookup.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_song_locate as loc_mod  # noqa: E402
import mididax_song_scan as scan_mod  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
COK_DIR = REPO_ROOT / "Champions of Krynn"
SOUND_DAX = COK_DIR / "SOUND.DAX"

NEED_BY_KIND = {0x80: 1, 0x90: 1, 0xC0: 1, 0xE0: 2}

# ---------------------------------------------------------------------------
# 0. Reproduce the old scorer's positive control (void-detector check)
# ---------------------------------------------------------------------------


def old_scorer_positive_control(stride: int = 64) -> dict:
    """Reproduce round 33's claim: `grammar_score` on SOUND.DAX block 1,
    scored over every 64-byte-aligned window from offset 128 onward, tops out
    at 16 -- below the scorer's own published "hit" bar of 18 (the corpus-wide
    top-5 in `mididax_song_scan.cmd_scan` score 18-21) and above the shuffled
    null's max of 14. Returns the measured max and its offset."""
    blocks = scan_mod.dax_blocks(SOUND_DAX)
    raw = blocks[1]
    best_score = None
    best_off = None
    for off in range(128, len(raw) - 63, stride):
        s = scan_mod.grammar_score(raw[off : off + 64])
        if best_score is None or s > best_score:
            best_score, best_off = s, off
    return {"max_score": best_score, "offset": best_off, "published_hit_bar": 18, "published_null_max": 14}


# ---------------------------------------------------------------------------
# 1. Recalibrated scorer: longest clean event-run, stop at first malformed byte
# ---------------------------------------------------------------------------


@dataclass
class CleanRun:
    events: int
    reason: str  # "clean-end" | "malformed-status" | "malformed-data" | "malformed-orphan-data" | "ran-off-end" | "exhausted"
    end_offset: int


def clean_prefix_events(buf: bytes, start: int) -> CleanRun:
    """Decode the section-1.4 running-status grammar starting at `start`,
    STOPPING at the first malformed byte (unlike `mididax_song_locate.
    decode_event_stream`, which counts malformed bytes but keeps going).
    Returns the number of clean events decoded and why decoding stopped.
    A `clean-end` (a literal 0xFC status byte, itself a valid zero-length
    event) is the strongest possible signal -- real event streams are
    expected to terminate this way; code or graphics data that merely
    aliases the grammar's *shape* for a while has no reason to do so."""
    i = start
    n = len(buf)
    events = 0
    last_kind: tuple[int, int] | None = None
    while i < n:
        b = buf[i]
        if b & 0x80:
            if b == 0xFC:
                return CleanRun(events, "clean-end", i)
            kind = b & 0xF0
            need = NEED_BY_KIND.get(kind)
            if need is None:
                return CleanRun(events, "malformed-status", i)
            if i + 1 + need > n:
                return CleanRun(events, "ran-off-end", i)
            data_bytes = buf[i + 1 : i + 1 + need]
            if any(db & 0x80 for db in data_bytes):
                return CleanRun(events, "malformed-data", i)
            events += 1
            last_kind = (kind, need)
            i += 1 + need
        else:
            if last_kind is None:
                return CleanRun(events, "malformed-orphan-data", i)
            kind, need = last_kind
            if i + need > n:
                return CleanRun(events, "ran-off-end", i)
            data_bytes = buf[i:i + need]
            if any(db & 0x80 for db in data_bytes):
                return CleanRun(events, "malformed-data", i)
            events += 1
            i += need
    return CleanRun(events, "exhausted", i)


def best_clean_run_for_source(data: bytes, stride: int = 64) -> tuple[int, int | None, str | None]:
    """The best (over every `stride`-aligned starting offset) `clean_prefix_events`
    score for one source blob. Returns (best_events, best_offset, best_reason)."""
    best_events = 0
    best_off: int | None = None
    best_reason: str | None = None
    n = len(data)
    for off in range(0, max(1, n), stride):
        run = clean_prefix_events(data, off)
        if run.events > best_events:
            best_events, best_off, best_reason = run.events, off, run.reason
    return best_events, best_off, best_reason


def _corpus_sources() -> list[tuple[str, bytes]]:
    """The SAME source pool `mididax_song_scan.cmd_scan` builds (GAME.OVR
    carved segments, every CoK .DAX block, the unpacked START.EXE image if
    present) -- reused here so the recalibrated scorer is ranked against
    the identical 814-source corpus the old scorer's void result was
    measured against, not a different, easier one."""
    sources: list[tuple[str, bytes]] = []
    try:
        sys.path.insert(0, str(REPO_ROOT / "tools"))
        import carve_goldbox_overlays as carve  # type: ignore

        ovr_path = COK_DIR / "GAME.OVR"
        ovr_data = ovr_path.read_bytes()
        for seg in carve.carve_vroomm_segments(ovr_path):
            sources.append(
                (f"GAME.OVR:seg[{seg.file_offset:#x}+{seg.size:#x}]", ovr_data[seg.file_offset : seg.file_offset + seg.size])
            )
    except Exception as exc:  # pragma: no cover - defensive, matches mididax_song_scan
        print(f"WARNING: could not carve GAME.OVR segments: {exc}", file=sys.stderr)

    dax_paths = {p.resolve(): p for p in list(COK_DIR.glob("*.DAX")) + list(COK_DIR.glob("*.dax"))}
    for daxfile in sorted(dax_paths.values(), key=lambda p: p.name):
        try:
            blocks = scan_mod.dax_blocks(daxfile)
        except Exception:
            continue
        for bid, raw in blocks.items():
            sources.append((f"{daxfile.name}:block{bid}", raw))

    unpacked = REPO_ROOT / "build" / "exepack" / "cok.bin"
    if unpacked.exists():
        sources.append(("START.EXE[R6-unpacked]", unpacked.read_bytes()))
    return sources


def recalibrated_rank(sources: list[tuple[str, bytes]] | None = None, stride: int = 64) -> list[dict]:
    """Rank every source by its best `clean_prefix_events` score, descending.
    Each entry also carries `code_like` (the existing x86-alias disqualifier,
    reused unchanged from `mididax_song_scan`) as a belt-and-suspenders cross
    check, though the recalibrated scorer's own `clean-end` requirement
    already disqualifies the x86-code false positives the old scorer had
    (measured: see the R6 report / test suite)."""
    if sources is None:
        sources = _corpus_sources()
    results = []
    for name, data in sources:
        if len(data) < 8:
            continue
        events, off, reason = best_clean_run_for_source(data, stride=stride)
        verdict = None
        if off is not None:
            window = data[off : off + 64]
            verdict = scan_mod.x86_code_verdict(window)
        results.append({"source": name, "events": events, "offset": off, "reason": reason, "x86_alias_verdict": verdict})
    results.sort(key=lambda r: -r["events"])
    return results


def shuffled_source_null(sources: list[tuple[str, bytes]], seed: int, stride: int = 64) -> list[int]:
    """Null for the recalibrated scorer: shuffle each source's OWN bytes
    (histogram-preserving) and re-run `best_clean_run_for_source` -- tests
    'does this look like a coherent stream', not 'does this file contain
    rare byte values'."""
    rng = random.Random(seed)
    out = []
    for _name, data in sources:
        if len(data) < 64:
            continue
        buf = bytearray(data)
        rng.shuffle(buf)
        events, _off, _reason = best_clean_run_for_source(bytes(buf), stride=stride)
        out.append(events)
    return out


# ---------------------------------------------------------------------------
# 2. Full-stream decode + segmentation
# ---------------------------------------------------------------------------


@dataclass
class Event:
    offset: int
    kind: int  # 0x80/0x90/0xC0/0xE0/0xFC
    channel: int | None
    data: tuple[int, ...]


@dataclass
class DecodeResult:
    events: list[Event]
    malformed: int
    end_offset: int
    reason: str


def decode_full_stream(buf: bytes, start: int) -> DecodeResult:
    """Decode from `start` to completion, tolerating malformed bytes (skip
    one byte, keep going, count it) so a genuinely-clean region downstream of
    a stray bad byte is not lost -- this is the "how much real content is
    here" decoder, distinct from `clean_prefix_events`'s "is the START of
    this window coherent" scorer."""
    i = start
    n = len(buf)
    events: list[Event] = []
    malformed = 0
    last_kind_ch: tuple[int, int, int] | None = None  # (kind, channel, need)
    while i < n:
        b = buf[i]
        if b & 0x80:
            if b == 0xFC:
                events.append(Event(i, 0xFC, None, ()))
                return DecodeResult(events, malformed, i, "clean-end")
            kind = b & 0xF0
            ch = b & 0x0F
            need = NEED_BY_KIND.get(kind)
            if need is None:
                malformed += 1
                i += 1
                continue
            if i + 1 + need > n:
                return DecodeResult(events, malformed, i, "ran-off-end")
            data = buf[i + 1 : i + 1 + need]
            if any(d & 0x80 for d in data):
                malformed += 1
                i += 1
                continue
            events.append(Event(i, kind, ch, tuple(data)))
            last_kind_ch = (kind, ch, need)
            i += 1 + need
        else:
            if last_kind_ch is None:
                malformed += 1
                i += 1
                continue
            kind, ch, need = last_kind_ch
            if i + need > n:
                return DecodeResult(events, malformed, i, "ran-off-end")
            data = buf[i:i + need]
            if any(d & 0x80 for d in data):
                malformed += 1
                i += 1
                continue
            events.append(Event(i, kind, ch, tuple(data)))
            i += need
    return DecodeResult(events, malformed, i, "exhausted")


@dataclass
class Segment:
    start_offset: int
    end_offset: int
    event_count: int
    note_on: int
    note_off: int
    channels: list[int] = field(default_factory=list)


def segment_stream(events: list[Event]) -> list[Segment]:
    """Split `events` into segments at each 0xC0 (control-change) event --
    the only event type CoK's own manual/menu convention (docs section 1.4's
    "control/instrument-select event") plausibly marks a new logical
    sequence with, given the stream carries exactly one 0xFC (end) sentinel
    total (measured: not one per song) so 0xFC cannot be the segmenter."""
    segments: list[Segment] = []
    cur: list[Event] = []
    for e in events:
        if e.kind == 0xC0 and cur:
            segments.append(_build_segment(cur))
            cur = []
        cur.append(e)
    if cur:
        segments.append(_build_segment(cur))
    return segments


def _build_segment(evs: list[Event]) -> Segment:
    note_on = sum(1 for e in evs if e.kind == 0x90)
    note_off = sum(1 for e in evs if e.kind == 0x80)
    channels = sorted({e.channel for e in evs if e.channel is not None and e.kind in (0x80, 0x90)})
    return Segment(evs[0].offset, evs[-1].offset, len(evs), note_on, note_off, channels)


def is_song_like(seg: Segment, min_events: int = 200, min_voices: int = 3) -> bool:
    """Bar C's own claim shape: >=200 events, 0 malformed (checked by the
    caller via `decode_full_stream`'s malformed count over the whole source),
    >=3 voices, and periodic (i.e., roughly balanced) Note-On/Off pairing."""
    if seg.event_count < min_events:
        return False
    if len(seg.channels) < min_voices:
        return False
    if seg.note_on == 0:
        return False
    balance = min(seg.note_on, seg.note_off) / max(seg.note_on, seg.note_off)
    return balance >= 0.9


# ---------------------------------------------------------------------------
# 3. Header verdict: sequence-directory vs. driver-state
# ---------------------------------------------------------------------------


def event_boundaries(raw: bytes, start: int) -> tuple[set[int], set[int]]:
    """All event-start byte offsets from a full decode of `raw` from `start`
    (assumed clean per the known positive control), split into "any boundary"
    (includes running-status continuations, which start with a DATA byte) and
    "fresh status-byte boundary" (the high bit is actually set there) --
    the doc's own "must start with a status byte, not a delta" bar."""
    result = decode_full_stream(raw, start)
    all_starts: set[int] = set()
    status_starts: set[int] = set()
    for e in result.events:
        all_starts.add(e.offset)
        if raw[e.offset] & 0x80:
            status_starts.add(e.offset)
    return all_starts, status_starts


def _word_at(buf: bytes, off: int) -> int:
    return buf[off] | (buf[off + 1] << 8)


def header_directory_test(raw: bytes, header_len: int, stream_start: int, shuffle_n: int = 5000, seed: int = 20260904) -> dict:
    """Read every byte-aligned 2-byte LE word in `raw[:header_len]` as a
    candidate offset RELATIVE TO stream_start (word + stream_start), test
    what fraction land on (a) any event boundary and (b) a fresh status-byte
    boundary of the real decode, and compare against the SAME procedure run
    on `shuffle_n` random permutations of the header's OWN bytes (a
    histogram-preserving null -- NOT a uniform-random-offset null, which this
    module measures separately and shows does not discriminate, since the
    stream's own any-boundary density is already ~0.79-0.89)."""
    header = raw[:header_len]
    n = len(raw)
    all_starts, status_starts = event_boundaries(raw, stream_start)

    def hit_fractions(hdr: bytes) -> tuple[float, float, int]:
        cands = [_word_at(hdr, o) + stream_start for o in range(0, len(hdr) - 1)]
        in_range = [c for c in cands if stream_start <= c < n]
        if not in_range:
            return 0.0, 0.0, 0
        hit_all = sum(1 for c in in_range if c in all_starts)
        hit_status = sum(1 for c in in_range if c in status_starts)
        return hit_all / len(in_range), hit_status / len(in_range), len(in_range)

    real_any, real_status, real_n = hit_fractions(header)

    rng = random.Random(seed)
    any_null: list[float] = []
    status_null: list[float] = []
    for _ in range(shuffle_n):
        shuffled = bytearray(header)
        rng.shuffle(shuffled)
        a, s, _cnt = hit_fractions(bytes(shuffled))
        any_null.append(a)
        status_null.append(s)

    ge_status = sum(1 for s in status_null if s >= real_status)

    # Also report the naive uniform-random-offset null the plan itself
    # proposed, to show explicitly that it does NOT discriminate (both are
    # close to the stream's own boundary density) -- this is reported, not
    # hidden, per the "measure the null yourself, even if it turns out
    # useless" ground rule.
    stream_len = n - stream_start
    uniform_any_density = len(all_starts) / stream_len
    uniform_status_density = len(status_starts) / stream_len

    return {
        "header_len": header_len,
        "stream_start": stream_start,
        "real_any_frac": real_any,
        "real_status_frac": real_status,
        "real_in_range_candidates": real_n,
        "shuffled_header_null_any_mean": sum(any_null) / len(any_null),
        "shuffled_header_null_status_mean": sum(status_null) / len(status_null),
        "shuffled_header_null_status_max": max(status_null),
        "shuffled_header_null_trials": shuffle_n,
        "p_shuffled_status_frac_ge_real": ge_status / shuffle_n,
        "uniform_random_offset_null_any_density": uniform_any_density,
        "uniform_random_offset_null_status_density": uniform_status_density,
        "uniform_null_discriminates": abs(real_any - uniform_any_density) > 0.1,
    }


# ---------------------------------------------------------------------------
# 4. Cursor cell offsets per block (disassembly-verified) + dump reading
# ---------------------------------------------------------------------------

# Block-relative offset of each MIDI.DAX block's own persisted tick-cursor
# cell -- loaded into SI at slot 1's readEvent-loop entry and stored back
# from SI after each tick's processing (the same load-then-store idiom in
# every block, confirmed by disassembling EACH block's own slot 1, not
# assumed from block 1's -- docs/midi-dax-format.md section 1.4 named
# `[0x2B7]` without stating that offset is block-1-specific; it is NOT: block
# 3 (the AdLib block, the one actually resident in every kept round-33
# GameLink dump) uses `[0x340]`).
#
#   block 1 (C/MS):    0x2b7  -- load @1020, store @1190 (both confirmed)
#   block 2 (Roland):  0x7e   -- load @333 confirmed; no store found in this
#                                 pass (a capstone linear-disassembly drift
#                                 past an embedded data table, the project's
#                                 known caveat, is the suspected cause) --
#                                 reported as LOWER CONFIDENCE, load-only.
#   block 3 (AdLib):   0x340  -- load @1020, store @1254 (both confirmed)
#   block 4 (Tandy):   0x1ee  -- load @696, store @912 (both confirmed)
#   block 5 (PC spkr): 0xe0   -- load @446, store @615 (both confirmed)
CURSOR_OFFSETS: dict[int, dict] = {
    1: {"offset": 0x2B7, "confidence": "load+store confirmed"},
    2: {"offset": 0x7E, "confidence": "load only -- store not found (capstone drift suspected)"},
    3: {"offset": 0x340, "confidence": "load+store confirmed"},
    4: {"offset": 0x1EE, "confidence": "load+store confirmed"},
    5: {"offset": 0xE0, "confidence": "load+store confirmed"},
}


def cursor_from_dump(dump: bytes, copy: "loc_mod.DriverCopy") -> int | None:
    """Read the live cursor SI value for one `DriverCopy` found in a RAM
    dump, using the PER-BLOCK offset table above (falls back to None if the
    matched block has no known cursor offset or the dump is too short)."""
    if copy.matches_block is None:
        return None
    entry = CURSOR_OFFSETS.get(copy.matches_block)
    if entry is None:
        return None
    addr = copy.base + entry["offset"]
    if addr + 1 >= len(dump):
        return None
    return loc_mod.read_word(dump, addr)


def classify_offset(segments: list[Segment], offset: int) -> int | None:
    """Which segment index (0-based) `offset` falls inside, or None."""
    for idx, seg in enumerate(segments):
        if seg.start_offset <= offset <= seg.end_offset:
            return idx
    return None


def cursor_report(dump_paths: list[Path], segments: list[Segment]) -> list[dict]:
    out = []
    for p in dump_paths:
        if not p.exists():
            out.append({"dump": str(p), "error": "missing"})
            continue
        data = p.read_bytes()
        copies = loc_mod.find_driver_copies(data)
        entry: dict = {"dump": str(p), "driver_copies": []}
        for c in copies:
            si = cursor_from_dump(data, c)
            seg_idx = classify_offset(segments, si) if si is not None else None
            entry["driver_copies"].append(
                {
                    "stub_offset": hex(c.stub_offset),
                    "matches_block": c.matches_block,
                    "base": hex(c.base),
                    "cx_handshake": hex(loc_mod.cx_handshake_value(data, c)),
                    "cursor_si": hex(si) if si is not None else None,
                    "segment_index": seg_idx,
                    "segment_event_count": segments[seg_idx].event_count if seg_idx is not None else None,
                }
            )
        out.append(entry)
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def cmd_rank(args: argparse.Namespace) -> None:
    old = old_scorer_positive_control()
    sources = _corpus_sources()
    ranked = recalibrated_rank(sources)
    null_scores = shuffled_source_null(sources, seed=args.seed)
    null_scores.sort(reverse=True)
    result = {
        "old_scorer_positive_control": old,
        "sources_scanned": len(sources),
        "recalibrated_top5": ranked[:5],
        "recalibrated_positive_control_rank": next(
            (i + 1 for i, r in enumerate(ranked) if r["source"] == "SOUND.DAX:block1"), None
        ),
        "recalibrated_null_max": null_scores[0] if null_scores else None,
        "recalibrated_null_top5": null_scores[:5],
    }
    print(json.dumps(result, indent=2, default=str))


def cmd_header(args: argparse.Namespace) -> None:
    raw = scan_mod.dax_blocks(SOUND_DAX)[1]
    result = header_directory_test(raw, header_len=args.header_len, stream_start=args.stream_start, seed=args.seed)
    print(json.dumps(result, indent=2))


def cmd_segments(args: argparse.Namespace) -> None:
    raw = scan_mod.dax_blocks(SOUND_DAX)[1]
    decoded = decode_full_stream(raw, args.stream_start)
    segments = segment_stream(decoded.events)
    report = {
        "raw_len": len(raw),
        "stream_start": args.stream_start,
        "total_events": len(decoded.events),
        "malformed": decoded.malformed,
        "end_reason": decoded.reason,
        "segments": [
            {
                "start_offset": s.start_offset,
                "end_offset": s.end_offset,
                "event_count": s.event_count,
                "note_on": s.note_on,
                "note_off": s.note_off,
                "channels": s.channels,
                "song_like": is_song_like(s),
            }
            for s in segments
        ],
    }
    print(json.dumps(report, indent=2))


def cmd_cursor(args: argparse.Namespace) -> None:
    raw = scan_mod.dax_blocks(SOUND_DAX)[1]
    decoded = decode_full_stream(raw, args.stream_start)
    segments = segment_stream(decoded.events)
    dump_paths = [Path(p) for p in args.dumps] if args.dumps else [
        REPO_ROOT / "build" / "r6-dosbox-out" / "ram1.bin",
        REPO_ROOT / "build" / "r6-dosbox-out2" / "ramA.bin",
        REPO_ROOT / "build" / "r6-dosbox-out2" / "ramA2.bin",
        REPO_ROOT / "build" / "r6-dosbox-out2" / "ramB.bin",
    ]
    print(json.dumps(cursor_report(dump_paths, segments), indent=2))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    rank_p = sub.add_parser("rank", help="recalibrate the static scorer; rank the positive control among 814 sources")
    rank_p.add_argument("--seed", type=int, default=1234)

    header_p = sub.add_parser("header", help="sequence-directory vs driver-state header test")
    header_p.add_argument("--header-len", type=int, default=128)
    header_p.add_argument("--stream-start", type=int, default=128)
    header_p.add_argument("--seed", type=int, default=20260904)

    seg_p = sub.add_parser("segments", help="segment the decoded event stream on control-change events")
    seg_p.add_argument("--stream-start", type=int, default=128)

    cursor_p = sub.add_parser("cursor", help="read the live driver cursor out of kept GameLink RAM dumps")
    cursor_p.add_argument("--stream-start", type=int, default=128)
    cursor_p.add_argument("dumps", nargs="*")

    args = p.parse_args()
    if args.command == "rank":
        cmd_rank(args)
    elif args.command == "header":
        cmd_header(args)
    elif args.command == "segments":
        cmd_segments(args)
    elif args.command == "cursor":
        cmd_cursor(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
