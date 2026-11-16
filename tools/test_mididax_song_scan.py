"""tools/test_mididax_song_scan.py -- pytest for the R6 CoK-music census + scan tool.

Covers:
  - the port-scan idiom recognizer (mov dx,imm16 -> out dx,al/ax; out imm8,al)
    against small hand-built byte sequences with a known answer;
  - the census's own claims for CoK's 5 MIDI.DAX blocks (the round-32 row-5
    correction: 5 disjoint hardware port sets, not 5 songs);
  - the readEvent grammar recognizer against the ONE block/offset already
    known (by direct disassembly, docs/midi-dax-format.md section 1.4) to
    contain the literal readEvent loop -- this is the recognizer's positive
    control, and the one this file's mutation test targets.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_song_scan as m  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
COK_MIDI = REPO_ROOT / "Champions of Krynn" / "MIDI.DAX"


def _skip_if_missing(path: Path):
    if not path.exists():
        pytest.skip(f"game data not present: {path}")


# ---------------------------------------------------------------------------
# Port-scan idiom
# ---------------------------------------------------------------------------

def test_scan_ports_finds_mov_dx_out():
    # mov dx, 0x0221 ; nop ; nop ; out dx, al
    raw = bytes([0xBA, 0x21, 0x02, 0x90, 0x90, 0xEE])
    hits = m.scan_ports(raw)
    assert any(h.kind == "mov_dx_out" and h.port == 0x221 for h in hits)


def test_scan_ports_rejects_mov_dx_without_out_within_window():
    # mov dx, 0x0221 followed by 13 NOPs then out dx,al -- outside the 12-byte window
    raw = bytes([0xBA, 0x21, 0x02]) + bytes([0x90] * 13) + bytes([0xEE])
    hits = m.scan_ports(raw)
    assert not any(h.kind == "mov_dx_out" and h.port == 0x221 for h in hits)


def test_scan_ports_out_imm8():
    raw = bytes([0xE6, 0x61])  # out 0x61, al  (PC speaker gate port)
    hits = m.scan_ports(raw)
    assert any(h.kind == "out_imm8" and h.port == 0x61 for h in hits)


def test_scan_ports_redefinition_before_out_does_not_count_first_port():
    # mov dx,0x0221 ; mov dx,0x0330 ; out dx,al  -- the 0x221 def is shadowed
    # before any out uses it, so only 0x330 should count as a mov_dx_out hit.
    raw = bytes([0xBA, 0x21, 0x02, 0xBA, 0x30, 0x03, 0xEE])
    hits = [h for h in m.scan_ports(raw) if h.kind == "mov_dx_out"]
    ports = {h.port for h in hits}
    assert 0x330 in ports
    assert 0x221 not in ports


# ---------------------------------------------------------------------------
# CoK census: the row-5 correction, from bytes
# ---------------------------------------------------------------------------

def test_cok_five_blocks_five_disjoint_port_sets():
    """The alternative hypothesis this test rejects: 'one block per song'
    predicts the SAME port set recurring across CoK's 5 MIDI.DAX blocks.
    Observed (measured here, not asserted): each block's port set is
    essentially disjoint from every other block's -- see the module-level
    Jaccard-overlap report in `census` for the full cross-block numbers."""
    _skip_if_missing(COK_MIDI)
    blocks = m.dax_blocks(COK_MIDI)
    assert sorted(blocks) == [1, 2, 3, 4, 5]

    summaries = {bid: m.port_summary(raw) for bid, raw in blocks.items()}

    # Block 1: dual SAA1099 (C/MS) at 0x220/0x221 chip-pair addressing.
    assert "0x221" in summaries[1]["mov_dx_out_ports"]
    assert "0x223" in summaries[1]["mov_dx_out_ports"]
    # Block 2: MPU-401 (Roland LAPC).
    assert "0x330" in summaries[2]["mov_dx_out_ports"]
    assert "0x331" in summaries[2]["mov_dx_out_ports"]
    # Block 3: AdLib (OPL2), word port 0x388.
    assert "0x388" in summaries[3]["mov_dx_out_ports"]
    # Block 4: Tandy, direct out imm8 to port 0xC0.
    assert "0xc0" in summaries[4]["out_imm8_ports"]
    # Block 5: PIT + PC speaker.
    for port in ("0x42", "0x43", "0x61"):
        assert port in summaries[5]["out_imm8_ports"]

    # Cross-block port-set overlap must be near-disjoint, not near-identical
    # (near-identical is what "one block per song" predicts).
    sets = {
        bid: set(s["mov_dx_out_ports"]) | set(s["out_imm8_ports"])
        for bid, s in summaries.items()
    }
    overlaps = []
    ids = sorted(sets)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = sets[ids[i]], sets[ids[j]]
            union = a | b
            overlaps.append(len(a & b) / len(union) if union else 0.0)
    mean_overlap = sum(overlaps) / len(overlaps)
    assert mean_overlap < 0.2, (
        f"mean pairwise port-set overlap {mean_overlap:.3f} is too high to "
        "reject the 'one block per song, same driver' alternative"
    )


# ---------------------------------------------------------------------------
# readEvent grammar recognizer -- positive control + mutation target
# ---------------------------------------------------------------------------

def test_grammar_score_recognizes_known_readevent_loop_in_block1():
    """Positive control: block 1 offset 0x410 (measured, not assumed) is
    where the literal readEvent loop bytes (docs/midi-dax-format.md section
    1.4's `26 8A 04 46 84 C0 78` = `mov al,es:[si]; inc si; test al,al; js`)
    live, by direct disassembly. The 64-byte-aligned window covering it must
    score well above the shuffled-window null (empirically mean ~-1.3,
    max ~14 over >=1000 shuffled windows -- see `scan`'s own output)."""
    _skip_if_missing(COK_MIDI)
    blocks = m.dax_blocks(COK_MIDI)
    raw = blocks[1]
    idx = raw.find(m.READEVENT_PATTERN)
    assert idx == 0x410, (
        f"readEvent pattern moved to offset {hex(idx)}; the positive-control "
        "offset in this test's docstring needs updating"
    )
    win_off = (idx // 64) * 64
    window = raw[win_off:win_off + 64]
    score = m.grammar_score(window)
    assert score >= 10, f"known-good driver window scored only {score}"


def test_grammar_score_literal_pattern_present_check():
    """Isolate the +20 literal-match term specifically (this is the line a
    mutation test corrupts -- see tools/mididax_song_scan.py and the R6
    report for the RED line this produces when `READEVENT_PATTERN` itself
    is corrupted by one byte)."""
    window = bytes(64)
    base_score = m.grammar_score(window)
    window_with_pattern = m.READEVENT_PATTERN + bytes(64 - len(m.READEVENT_PATTERN))
    assert m.grammar_score(window_with_pattern) >= base_score + 15
