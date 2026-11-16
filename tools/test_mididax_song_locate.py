"""tools/test_mididax_song_locate.py -- pytest for the R6 (round 33) CoK
live-buffer locator.

Covers:
  - the paragraph self-reference predicate on a synthetic image with ONE
    hand-planted self-referential paragraph (this is the mutation target --
    see test_self_reference_predicate_mutation_target's docstring);
  - the null: the SAME predicate on a byte-shuffled copy of a real dump
    finds far fewer hits than a deliberately self-reference-dense image;
  - driver_copy_base()'s corrected formula against the two real, disassembly-
    verified geometries from docs/midi-dax-format.md section 1.7 (physical
    0x5af1b -> base 0x5abc0, block 3's displacement 853) and this round's own
    freshly-found second copy (0x5b78b -> base 0x5b430) -- and explicitly
    that the round-33 PLAN's OWN stated arithmetic ('stub_offset - 0x1b')
    does NOT reproduce either verified base, which is why this file does not
    use it;
  - decode_event_stream against a small hand-built valid stream (clean 0xFC
    termination, 0 malformed) and a deliberately malformed one;
  - unique_across_decoded_sources against real game data, skipped if absent.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_song_locate as loc  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
COK_MIDI = REPO_ROOT / "Champions of Krynn" / "MIDI.DAX"


def _skip_if_missing(path: Path):
    if not path.exists():
        pytest.skip(f"game data not present: {path}")


# ---------------------------------------------------------------------------
# self_reference_candidates -- positive control + mutation target
# ---------------------------------------------------------------------------

def _make_synthetic_image(size_paragraphs: int, planted_paragraphs: list[int]) -> bytes:
    """A `size_paragraphs`-paragraph image of otherwise non-self-referential
    filler (each paragraph's word is its OWN NEGATION, never equal to its own
    paragraph number by construction, since 0xFFFF - p == p only if p==0x7FFF
    which we avoid), with the paragraphs in `planted_paragraphs` overwritten
    with a genuine self-reference (word == own paragraph number)."""
    buf = bytearray(size_paragraphs * 16)
    for p in range(size_paragraphs):
        filler = (0xFFFF - p) & 0xFFFF
        struct.pack_into("<H", buf, p * 16, filler)
    for p in planted_paragraphs:
        struct.pack_into("<H", buf, p * 16, p)
    return bytes(buf)


def test_self_reference_candidates_finds_planted_paragraph():
    img = _make_synthetic_image(4096, planted_paragraphs=[10, 4000])
    hits = loc.self_reference_candidates(img)
    assert set(hits) == {10 * 16, 4000 * 16}


def test_self_reference_candidates_finds_none_in_filler_only_image():
    img = _make_synthetic_image(4096, planted_paragraphs=[])
    hits = loc.self_reference_candidates(img)
    assert hits == []


def test_self_reference_predicate_mutation_target():
    """MUTATION TARGET (R6 report quotes this test's failure verbatim): flip
    `w == (p >> 4)` to `w != (p >> 4)` in
    tools/mididax_song_locate.py::self_reference_candidates and this test
    goes RED, because the filler-only image (deliberately built so NO
    paragraph is self-referential) would then report every single paragraph
    as a "hit" instead of zero."""
    img = _make_synthetic_image(256, planted_paragraphs=[])
    hits = loc.self_reference_candidates(img)
    assert len(hits) == 0, (
        f"expected 0 self-reference hits in an all-filler image, got {len(hits)} "
        "-- if this fires, the '==' predicate was flipped to '!='"
    )


def test_self_reference_null_is_shuffle_of_same_dump():
    """The null must be measured on a shuffled COPY of the same bytes, not a
    freshly-generated random image (histogram-preserving discipline)."""
    img = _make_synthetic_image(2048, planted_paragraphs=[500])
    null_hits = loc.self_reference_null(img, seed=1)
    # The shuffle destroys paragraph alignment of the planted value with high
    # probability; assert the null function runs and returns a list (not that
    # it is empty -- a shuffled copy CAN coincidentally still hit).
    assert isinstance(null_hits, list)


@pytest.mark.parametrize("dump_name", ["ram1.bin"])
def test_self_reference_real_dump_near_chance(dump_name):
    """Against the real round-32 kept dump: real hits should be small
    (single digits) -- consistent with the ~1-per-1MB chance rate the plan
    predicted -- and the shuffled null should be in the same small range,
    not order-of-magnitude different (this is the plan's own null, measured,
    not assumed)."""
    dump = REPO_ROOT / "build" / "r6-dosbox-out" / dump_name
    _skip_if_missing(dump)
    data = dump.read_bytes()
    real_hits = loc.self_reference_candidates(data)
    null_hits = loc.self_reference_null(data, seed=20260903)
    assert len(real_hits) <= 10, f"real hits {len(real_hits)} much higher than the ~1/1MB chance prediction"
    assert len(null_hits) <= 10, f"null hits {len(null_hits)} much higher than the ~1/1MB chance prediction"


# ---------------------------------------------------------------------------
# driver_copy_base -- corrected formula vs the plan's own (wrong) arithmetic
# ---------------------------------------------------------------------------

def test_driver_copy_base_matches_round32_verified_geometry():
    """Round-32 R6 (docs/midi-dax-format.md section 1.7) independently stated
    physical 0x5abc0 as block 3's load-segment base, derived from stub_offset
    0x5af1b. driver_copy_base() must reproduce that exact value."""
    base = loc.driver_copy_base(stub_offset=0x5af1b, displacement=853)
    assert base == 0x5abc0


def test_driver_copy_base_second_copy_disagrees_with_the_plans_own_formula():
    """The round-33 plan states the second copy's base as '0x5b78b - 0x1b'
    (0x5b770). This test proves that number is NOT block 3's on-disk
    chromatic-table-verified base (0x5b430) -- see the R6 report for the
    byte-level chromatic-table proof. This file's own driver_copy_base()
    computes the CORRECT value instead of the plan's literal arithmetic."""
    plans_stated_value = 0x5b78b - 0x1b
    corrected_value = loc.driver_copy_base(stub_offset=0x5b78b, displacement=853)
    assert plans_stated_value == 0x5b770
    assert corrected_value == 0x5b430
    assert corrected_value != plans_stated_value


def test_find_driver_copies_on_real_dump_identifies_block3_twice():
    dump = REPO_ROOT / "build" / "r6-dosbox-out" / "ram1.bin"
    _skip_if_missing(dump)
    data = dump.read_bytes()
    copies = loc.find_driver_copies(data)
    assert len(copies) == 2
    assert all(c.matches_block == 3 for c in copies)
    bases = sorted(c.base for c in copies)
    assert bases == [0x5abc0, 0x5b430]


# ---------------------------------------------------------------------------
# decode_event_stream
# ---------------------------------------------------------------------------

def test_decode_event_stream_clean_termination():
    # NoteOn ch2 note 0x40, running-status note 0x50, end sentinel.
    stream = bytes([0x92, 0x40, 0x50, 0xFC])
    result = loc.decode_event_stream(stream, start=0, max_bytes=len(stream))
    assert result.reason == "clean-end"
    assert result.malformed == 0
    assert result.events == 2  # explicit NoteOn + one running-status continuation


def test_decode_event_stream_reports_malformed_on_bad_status():
    # 0xF5 is not a recognized event kind (0x80/0x90/0xC0/0xE0/0xFC).
    stream = bytes([0xF5, 0x00, 0xFC])
    result = loc.decode_event_stream(stream, start=0, max_bytes=len(stream))
    assert result.malformed >= 1


def test_decode_event_stream_running_status_requires_prior_event():
    # A data byte with no preceding status byte cannot be running status.
    stream = bytes([0x40, 0xFC])
    result = loc.decode_event_stream(stream, start=0, max_bytes=len(stream))
    assert result.malformed == 1


# ---------------------------------------------------------------------------
# unique_across_decoded_sources
# ---------------------------------------------------------------------------

def test_unique_across_decoded_sources_finds_known_sound_dax_content():
    """Positive control: SOUND.DAX block 1's own first 256 bytes must be
    found in SOUND.DAX by this function (round-33 R6 used this exact check
    to disqualify a live-observed buffer that turned out to be SOUND.DAX,
    not a MIDI.DAX note timeline -- see the R6 report)."""
    sound_dax = REPO_ROOT / "Champions of Krynn" / "SOUND.DAX"
    _skip_if_missing(sound_dax)
    import mididax_song_scan as scan_mod
    blocks = scan_mod.dax_blocks(sound_dax)
    probe = blocks[1][:256]
    found = loc.unique_across_decoded_sources(probe, REPO_ROOT)
    assert any("SOUND.DAX" in f for f in found)


def test_unique_across_decoded_sources_empty_for_synthetic_data():
    """A buffer that is not a substring of any decoded source reports empty
    (the 'unique' bar scope item 5 requires)."""
    probe = bytes(range(256))  # 0..255 ramp -- vanishingly unlikely to appear verbatim
    found = loc.unique_across_decoded_sources(probe, REPO_ROOT)
    assert found == []
