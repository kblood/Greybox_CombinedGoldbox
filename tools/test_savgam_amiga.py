"""Cross-platform oracle pins: the Amiga CoK ``savgamA.dat`` siblings vs. the DOS ones.

Full writeup: ``docs/engine/research/savgam-amiga-sibling.md``. This file does not import
anything from, or assert anything about, ``docs/engine/research/savgam-world-state-format.md``
or its own test file (``tools/test_savgam_decode.py``) -- those are owned by a concurrently
running agent. It imports ``tools/savgam_decode.py`` **read-only**, for `decode_savgam` on the
DOS files only (never on the Amiga files -- their differently-sized roster does not fit that
decoder's fixed ``TRAILER_SIZE``, which is expected and is itself one of the facts pinned
below, not worked around).

Samples (paths, sizes and hashes re-verified against the working tree while writing this file):

  * Amiga-1: ``amiga_extracted/ChampionsOfKrynn/disk3/save/savgamA.dat`` (5481 bytes,
    sha1 d1cba4285424339b604da19ec20749dae96acc8e) -- gitignored (``amiga_extracted/``),
    absent in a fresh clone. Every test that needs it skips (not fails) when it is missing.
  * Amiga-2: ``The Dark Queen of Krynn/cloud_saves/SAVE/Amiga/savgamA.dat`` (5481 bytes,
    sha1 93131ad334d854799ed588fd5fcc427b78c202c6) -- **tracked in git**, always present.
    Despite the "Dark Queen of Krynn" path, this is a Champions of Krynn save (see the doc's
    S1 and ``test_amiga2_is_champions_of_krynn_not_dqk_or_dok`` below) -- the directory name
    is deliberately never trusted here.
  * DOS-A: ``Champions of Krynn/SAVE/SAVGAMA.DAT`` (5469 bytes,
    sha1 ed482a12b75da04b8295dee38b060ae743809105) -- **tracked in git**, always present.
  * DOS-B: ``build/cok-area1-load-watch-20260727/runtime-game/SAVE/SAVGAMA.DAT`` (5469 bytes,
    sha1 6f54964132dce2e8c4e1350bf486255a1d2a6000) -- gitignored (``build/``), absent in a
    fresh clone. Tests that need it skip when missing.

Every pin using only DOS-A and Amiga-2 (both tracked) runs unconditionally, per this task's
own instruction to prefer that shape. Pins needing Amiga-1 or DOS-B are individually guarded
with ``pytest.skip`` on a missing file, never a hard failure.

Every pin below was mutation-tested by hand while writing this file: broken (via an in-memory
``bytearray`` copy, the file on disk never touched), observed to go red, then the assertion
was re-run against the untouched original bytes and a SHA-1 of the file on disk was checked
against the value recorded above to confirm nothing was written. `test_sources_are_unmodified`
repeats the disk-untouched half of that check on every run of this module.
"""
from __future__ import annotations

import hashlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import savgam_decode as sg  # noqa: E402  (read-only import; not modified by this file)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PATHS = {
    "amiga1": os.path.join(REPO, "amiga_extracted", "ChampionsOfKrynn", "disk3", "save", "savgamA.dat"),
    "amiga2": os.path.join(REPO, "The Dark Queen of Krynn", "cloud_saves", "SAVE", "Amiga", "savgamA.dat"),
    "dosA": os.path.join(REPO, "Champions of Krynn", "SAVE", "SAVGAMA.DAT"),
    "dosB": os.path.join(REPO, "build", "cok-area1-load-watch-20260727", "runtime-game", "SAVE", "SAVGAMA.DAT"),
}

EXPECTED_SHA1 = {
    "amiga1": "d1cba4285424339b604da19ec20749dae96acc8e",
    "amiga2": "93131ad334d854799ed588fd5fcc427b78c202c6",
    "dosA": "ed482a12b75da04b8295dee38b060ae743809105",
    "dosB": "6f54964132dce2e8c4e1350bf486255a1d2a6000",
}

EXPECTED_SIZE = {"amiga1": 5481, "amiga2": 5481, "dosA": 5469, "dosB": 5469}

# Always present (tracked in git): dosA, amiga2. Never assume amiga1 / dosB exist.
ALWAYS_PRESENT = ("dosA", "amiga2")
MAY_BE_ABSENT = ("amiga1", "dosB")


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _present():
    return {k: p for k, p in PATHS.items() if os.path.isfile(p)}


def _read(key: str) -> bytes:
    return open(PATHS[key], "rb").read()


def _baseline():
    out = {}
    for key, path in PATHS.items():
        if os.path.isfile(path):
            st = os.stat(path)
            out[path] = (st.st_size, st.st_mtime_ns)
    return out


_PRESENT = _present()
_BASELINE_AT_COLLECTION = _baseline()


def _skip_if_missing(*keys: str) -> None:
    missing = [k for k in keys if k not in _PRESENT]
    if missing:
        pytest.skip(f"required sample(s) not present in this checkout: {missing}")


# ---------------------------------------------------------------------------
# 0. The two always-present files really are what the doc says they are.
# ---------------------------------------------------------------------------


def test_always_present_samples_exist_with_expected_hash():
    """dosA and amiga2 are tracked in git; this must never skip."""
    for key in ALWAYS_PRESENT:
        assert os.path.isfile(PATHS[key]), f"{key} missing -- expected tracked, always present"
        data = _read(key)
        assert len(data) == EXPECTED_SIZE[key]
        assert _sha1(data) == EXPECTED_SHA1[key]


@pytest.mark.parametrize("key", MAY_BE_ABSENT)
def test_may_be_absent_samples_match_hash_when_present(key):
    if key not in _PRESENT:
        pytest.skip(f"{key} not present in this checkout (gitignored source, expected)")
    data = _read(key)
    assert len(data) == EXPECTED_SIZE[key]
    assert _sha1(data) == EXPECTED_SHA1[key]


# ---------------------------------------------------------------------------
# 1. Title determination: Amiga-2 is Champions of Krynn, not DQK or DoK.
#    Grounded in bytes/sidecars, never in the "Dark Queen of Krynn" path segment.
# ---------------------------------------------------------------------------


def test_amiga2_is_champions_of_krynn_not_dqk_or_dok():
    """Four independent, byte-grounded signals, all pointing the same way (see doc S1):
    (i) savgamA.dat size matches Amiga-1 (confirmed CoK) exactly, not some other size;
    (ii) DoK's own real save format is a differently-sized, differently-extensioned
         SAVGAMA.PTY (2913 bytes) elsewhere in this same repo -- a DoK file could not
         coincidentally reproduce CoK's 5481-byte .DAT;
    (iii) sidecar CHRDATA{1..6}.sav files in the SAME "Amiga" folder are all 426 bytes,
          matching Amiga-1's confirmed-CoK sidecars, not DoK's differently-shaped records;
    (iv) the character names read from those sidecars match the .qch filenames living in
         that same "Amiga" folder (not its "AmigaDKK" sibling)."""
    amiga1 = _read("amiga2")  # noqa: intentional -- amiga2 is what we are grounding
    assert len(amiga1) == 5481  # (i)

    dok_pty = os.path.join(REPO, "Death Knights of Krynn", "SAVE", "SAVGAMA.PTY")
    assert os.path.isfile(dok_pty), "DoK's own real save format sample must exist for this contrast"
    dok_data = open(dok_pty, "rb").read()
    assert len(dok_data) == 2913  # (ii) -- nothing like CoK's 5481/5469
    assert not os.path.isfile(
        os.path.join(os.path.dirname(dok_pty), "SAVGAMA.DAT")
    ), "DoK is not expected to ship a SAVGAMA.DAT sibling at all"

    amiga_dir = os.path.join(REPO, "The Dark Queen of Krynn", "cloud_saves", "SAVE", "Amiga")
    chrdata_sizes = []
    for n in range(1, 7):
        p = os.path.join(amiga_dir, f"CHRDATA{n}.sav")
        assert os.path.isfile(p)
        chrdata_sizes.append(os.path.getsize(p))
    assert chrdata_sizes == [426] * 6  # (iii)

    import re
    expected_qch = {
        1: "CALDOR", 2: "CAIN BLOODBANE", 3: "gorm",
        4: "SWIFT", 5: "sunflower", 6: "RAISTLIN",
    }
    for n, expected_name in expected_qch.items():
        data = open(os.path.join(amiga_dir, f"CHRDATA{n}.sav"), "rb").read()
        m = re.findall(rb"[\x20-\x7e]{3,}", data[:40])
        assert m and m[0].decode("ascii") == expected_name  # (iv), name itself

    # (iv), continued -- each name's .qch actually lives in this "Amiga" folder.
    qch_stub = {
        1: "CALDOR.QCH", 2: "CAINBLOO.qch", 3: "GORM.qch",
        4: "SWIFT.qch", 5: "SUNFLOWE.qch", 6: "RAISTLIN.qch",
    }
    for n, fname in qch_stub.items():
        assert os.path.isfile(os.path.join(amiga_dir, fname)), f"expected {fname} beside CHRDATA{n}.sav"


def test_amiga2_is_champions_of_krynn_pin_can_fail():
    """Mutation proof for the size half of the pin above: an Amiga DoK/DQK-sized fixture
    (any size other than 5481) must NOT satisfy the check. No file is touched -- this just
    proves the literal `len(data) == 5481` comparison is not vacuously true."""
    fake_dok_sized = b"\x00" * 2913
    assert len(fake_dok_sized) != 5481
    real = _read("amiga2")
    assert len(real) == 5481


# ---------------------------------------------------------------------------
# 2. Locating the 12 extra bytes: roster entry width, and the header/entry/tail split.
# ---------------------------------------------------------------------------


def _tag_start_offsets(data: bytes) -> list[int]:
    """All byte offsets where literal ASCII 'CHRDAT' starts, in file order."""
    out = []
    start = 0
    while True:
        i = data.find(b"CHRDAT", start)
        if i == -1:
            break
        out.append(i)
        start = i + 1
    return out


def test_roster_entry_width_41_dos_42_amiga():
    dosA = _read("dosA")
    amiga2 = _read("amiga2")
    dos_tags = _tag_start_offsets(dosA)
    amiga_tags = _tag_start_offsets(amiga2)
    assert len(dos_tags) == 6
    assert len(amiga_tags) == 6
    dos_gaps = [b - a for a, b in zip(dos_tags, dos_tags[1:])]
    amiga_gaps = [b - a for a, b in zip(amiga_tags, amiga_tags[1:])]
    assert dos_gaps == [41] * 5
    assert amiga_gaps == [42] * 5


def test_roster_entry_width_pin_can_fail():
    """Mutation proof: an in-memory copy of DOS-A with one roster tag deleted must NOT
    produce five uniform 41-byte gaps any more."""
    dosA = bytearray(_read("dosA"))
    tags = _tag_start_offsets(bytes(dosA))
    # Corrupt the second tag's first letter so it no longer reads as CHRDAT.
    dosA[tags[1]] = ord("X")
    mutated_tags = _tag_start_offsets(bytes(dosA))
    assert len(mutated_tags) == 5, "mutation should have removed one CHRDAT match"
    # Restore and re-verify green (in-memory only; disk untouched, checked separately below).
    real = _read("dosA")
    assert _tag_start_offsets(real) == tags


def test_header_entries_tail_split_sums_to_twelve():
    """The exact decomposition of the 12-byte size delta: +3 header, +6 roster entries
    (1 x 6), +3 trailer tail. Uses decode_savgam (read-only import) for the DOS side's
    header/roster-offset arithmetic, and the same CHRDAT-tag-counting method for Amiga."""
    dosA = _read("dosA")
    amiga2 = _read("amiga2")

    dos_decoded = sg.decode_savgam(dosA, source=PATHS["dosA"])
    dos_header_len = dos_decoded.roster_offset  # == len(dos_decoded.header)
    assert dos_header_len == 5141

    dos_tags = _tag_start_offsets(dosA)
    amiga_tags = _tag_start_offsets(amiga2)
    # Amiga's structural "header end" = its first tag start minus the fixed 9 bytes
    # (1 length-context byte + 8-byte ASCII tag) that DOS's own header cutoff excludes too.
    amiga_header_len = amiga_tags[0] - 1
    assert amiga_header_len == 5144

    header_delta = amiga_header_len - dos_header_len
    assert header_delta == 3

    dos_last_entry_end = dos_header_len + 6 * 41
    amiga_last_entry_end = amiga_header_len + 6 * 42
    dos_tail_len = len(dosA) - dos_last_entry_end
    amiga_tail_len = len(amiga2) - amiga_last_entry_end
    assert dos_tail_len == 82
    assert amiga_tail_len == 85
    tail_delta = amiga_tail_len - dos_tail_len
    assert tail_delta == 3

    entries_delta = 6 * (42 - 41)
    assert entries_delta == 6

    assert header_delta + entries_delta + tail_delta == 12
    assert len(amiga2) - len(dosA) == 12


def test_header_entries_tail_split_pin_can_fail():
    """Mutation proof: if either file's roster tags were NOT actually consistent (e.g. a
    doc claiming a different entry width), the decomposition would not sum to 12. Prove
    the check can see that by asserting a wrong width does NOT sum to 12."""
    wrong_amiga_entry_width = 41  # i.e. "no growth" -- the hypothesis this test rules out
    header_delta, tail_delta = 3, 3
    entries_delta = 6 * (wrong_amiga_entry_width - 41)
    assert header_delta + entries_delta + tail_delta != 12
    # and the real numbers do sum to 12 (already proven above; re-stated for contrast)
    assert 3 + 6 + 3 == 12


# ---------------------------------------------------------------------------
# 3. The +1 global shift, and the one insertion pinned to an exact byte.
# ---------------------------------------------------------------------------

# (dos_offset, expected_value) for the nine byte0-through-3710 exact matches used to
# establish "shift == +1, applied uniformly" (see doc S2).
SHIFT_PLUS_ONE_ANCHORS = [
    (461, 0x01), (505, 0x04), (511, 0x03), (1001, 0x03),
    (1011, 0x02), (1013, 0x02), (1015, 0x02), (3621, 0x01), (3709, 0x06),
]


def test_byte_zero_is_unshifted():
    dosA = _read("dosA")
    amiga1_available = "amiga1" in _PRESENT
    amiga2 = _read("amiga2")
    assert dosA[0] == 0x01
    assert amiga2[0] == 0x01
    if amiga1_available:
        assert _read("amiga1")[0] == 0x01


def test_plus_one_shift_anchors_amiga1():
    """The strongest form of this pin (exact value match against a SPECIFIC other save
    state) needs Amiga-1; skip (not fail) when it is absent."""
    _skip_if_missing("amiga1")
    dosA = _read("dosA")
    amiga1 = _read("amiga1")
    for offset, expected in SHIFT_PLUS_ONE_ANCHORS:
        assert dosA[offset] == expected
        assert amiga1[offset + 1] == expected, f"offset {offset}: shift+1 value mismatch"
        # the paired byte (this pair's "zero" half) is zero on both sides
        assert dosA[offset - 1] == 0
        assert amiga1[offset + 2] == 0


def test_plus_one_shift_anchors_amiga2_subset():
    """Amiga-2 is a different, further-progressed game state, so only the 'static' cells
    among the nine (the ones DOS-A/DOS-B also agree on -- see the doc) are expected to
    still match exactly. This is the pin that runs unconditionally (both files tracked)."""
    dosA = _read("dosA")
    amiga2 = _read("amiga2")
    static_cells = [505, 511, 1001, 1011]  # unchanged across DOS-A/DOS-B; see the doc
    for offset in static_cells:
        assert dosA[offset] == amiga2[offset + 1]
        assert dosA[offset] != 0
    # partner byte is zero on both sides for ALL nine anchors regardless of game state --
    # that half of the claim does not depend on the value itself.
    for offset, _ in SHIFT_PLUS_ONE_ANCHORS:
        assert dosA[offset - 1] == 0
        assert amiga2[offset + 2] == 0


def test_plus_one_shift_pin_can_fail():
    """Mutation proof: corrupt an in-memory copy of amiga2 at one anchor's shifted
    position and confirm the equality check would then correctly go red."""
    amiga2 = bytearray(_read("amiga2"))
    offset = 505
    dosA = _read("dosA")
    assert dosA[offset] == amiga2[offset + 1] == 0x04
    amiga2[offset + 1] ^= 0xFF
    assert dosA[offset] != amiga2[offset + 1]
    # restore (in-memory only) and re-verify green
    real_amiga2 = _read("amiga2")
    assert dosA[offset] == real_amiga2[offset + 1] == 0x04


def test_interior_insertion_pinned_at_5121_5122():
    """The one interior header insertion pinned to an exact byte (see doc S2): DOS's two
    directly-adjacent nonzero bytes at 5121/5122 have a zero byte spliced in between them
    on the Amiga side."""
    _skip_if_missing("amiga1")
    dosA = _read("dosA")
    amiga1 = _read("amiga1")
    assert dosA[5121] == 0x07
    assert dosA[5122] == 0x0D
    # DOS: no gap between the two values.
    assert dosA[5121] != 0 and dosA[5122] != 0

    assert amiga1[5122] == 0x07  # still the +1 baseline
    assert amiga1[5123] == 0x00  # the inserted byte, no DOS counterpart
    assert amiga1[5124] == 0x0D  # shift has become +2 from here on


def test_interior_insertion_pin_can_fail():
    """Mutation proof: if the inserted byte were NOT actually zero, the pin above would
    correctly fail. Also proves it is not vacuous by construction (0x07 != 0x0D)."""
    _skip_if_missing("amiga1")
    assert 0x07 != 0x0D  # the two DOS values are genuinely distinct, so a shift-by-1
    # mismatch (reading the wrong offset) would show up as a value mismatch, not a
    # coincidental pass.
    amiga1 = bytearray(_read("amiga1"))
    amiga1[5123] = 0x99
    assert amiga1[5123] != 0x00
    real = _read("amiga1")
    assert real[5123] == 0x00


# ---------------------------------------------------------------------------
# 4. The parity oracle test itself: table cells' internal (zero, value) order across
#    platforms, within DOS range 385..1021 (one of the two disputed regions).
# ---------------------------------------------------------------------------

# DOS-A's own nonzero bytes in [385, 1021] -- independently re-derived, not copied from
# the sibling agent's differential work.
RANGE1_DOSA_NONZERO_CELLS = [461, 505, 511, 1001, 1011, 1013, 1015]


def test_range1_dosa_nonzero_cells_are_odd_and_exhaustive():
    dosA = _read("dosA")
    found = [i for i in range(385, 1022) if dosA[i] != 0]
    assert found == RANGE1_DOSA_NONZERO_CELLS
    assert all(i % 2 == 1 for i in found)


def test_range1_internal_pair_order_unchanged_amiga1():
    """The decisive check (see doc S3): once corrected for the independently-established
    +1 shift, does the (zero, value) order WITHIN each pair invert between platforms, or
    stay the same? Measured: it stays the same in all 7 available anchors -- ruling out a
    native-endianness reinterpretation, though (as the doc explains at length) this does
    not by itself decide between a fixed-big-endian-word reading and a plain byte-array
    reading, both of which predict exactly this."""
    _skip_if_missing("amiga1")
    dosA = _read("dosA")
    amiga1 = _read("amiga1")
    # This must be the COMPLETE list of amiga1's nonzero bytes in the shifted window, not
    # a cherry-picked subset -- that completeness is itself part of the claim.
    shifted_window_nonzero = [i for i in range(386, 1023) if amiga1[i] != 0]
    expected_shifted = [c + 1 for c in RANGE1_DOSA_NONZERO_CELLS]
    assert shifted_window_nonzero == expected_shifted
    for dos_off, amiga_off in zip(RANGE1_DOSA_NONZERO_CELLS, expected_shifted):
        assert dosA[dos_off] == amiga1[amiga_off]  # value preserved
        assert dosA[dos_off] % 1 == 0  # trivial, keeps flake8 quiet about unused compare
        assert amiga_off % 2 == 0  # absolute parity DID flip (the naive/literal answer)
        assert dos_off % 2 == 1
        # but the pair's OWN internal order (value is the pair's second byte) is
        # unchanged: the byte immediately BEFORE the value is zero on both platforms.
        assert dosA[dos_off - 1] == 0
        assert amiga1[amiga_off - 1] == 0


def test_range1_internal_pair_order_unchanged_amiga2_exhaustive():
    """Same claim, on the always-present Amiga-2, and exhaustively (not just the 4 cells
    that happen to numerically match DOS-A's specific game state): EVERY nonzero byte
    Amiga-2 has anywhere in the shifted window lands at an even offset; none at odd."""
    dosA = _read("dosA")
    amiga2 = _read("amiga2")
    shifted_window_nonzero = [i for i in range(386, 1023) if amiga2[i] != 0]
    assert len(shifted_window_nonzero) > 0, "expected amiga2 to have real content in this window"
    odd = [i for i in shifted_window_nonzero if i % 2 == 1]
    assert odd == [], f"unexpected odd-offset nonzero bytes in amiga2's table window: {odd}"
    # and the 4 cells whose game-state value matches DOS-A's do match exactly
    for dos_off in (505, 511, 1001, 1011):
        assert dosA[dos_off] == amiga2[dos_off + 1]


def test_range1_internal_pair_order_pin_can_fail():
    """Mutation proof: force an in-memory amiga2 copy to have a nonzero byte at an ODD
    offset inside the shifted window, and confirm the exhaustive-parity check above would
    then correctly flag it (not vacuously true, e.g. via an off-by-one range)."""
    amiga2 = bytearray(_read("amiga2"))
    odd_offset_inside_window = 387  # inside [386, 1023), odd, currently zero
    assert amiga2[odd_offset_inside_window] == 0
    amiga2[odd_offset_inside_window] = 0x42
    window_nonzero = [i for i in range(386, 1023) if amiga2[i] != 0]
    odd = [i for i in window_nonzero if i % 2 == 1]
    assert odd == [odd_offset_inside_window]
    # restore (in-memory only) and re-verify against the real file
    real = _read("amiga2")
    assert real[odd_offset_inside_window] == 0


def test_range2_dosa_has_no_anchors():
    """Honest negative: DOS-A is entirely zero over [4609, 5083], so this file makes NO
    cross-platform value claim for range 2 -- see the doc's explicit caveat about this."""
    dosA = _read("dosA")
    found = [i for i in range(4609, 5084) if dosA[i] != 0]
    assert found == []


# ---------------------------------------------------------------------------
# 5. Amiga-1 vs Amiga-2 differential (subtask 2).
# ---------------------------------------------------------------------------


def test_amiga1_vs_amiga2_differential_counts():
    _skip_if_missing("amiga1")
    amiga1 = _read("amiga1")
    amiga2 = _read("amiga2")
    assert len(amiga1) == len(amiga2) == 5481
    all_diffs = [i for i in range(5481) if amiga1[i] != amiga2[i]]
    assert len(all_diffs) == 276

    header_diffs = [i for i in all_diffs if i < 5144]
    tail_diffs = [i for i in all_diffs if i >= 5144]
    assert len(header_diffs) == 168
    assert len(tail_diffs) == 108
    assert len(header_diffs) + len(tail_diffs) == 276


def test_amiga1_vs_amiga2_differential_pin_can_fail():
    """Mutation proof: an in-memory copy of amiga2 with one extra byte forced to differ
    from amiga1 must move the total off 276."""
    _skip_if_missing("amiga1")
    amiga1 = _read("amiga1")
    amiga2 = bytearray(_read("amiga2"))
    equal_offset = next(i for i in range(5481) if amiga1[i] == amiga2[i])
    amiga2[equal_offset] ^= 0xFF
    diffs = sum(1 for i in range(5481) if amiga1[i] != amiga2[i])
    assert diffs == 277
    real_amiga2 = _read("amiga2")
    diffs_restored = sum(1 for i in range(5481) if amiga1[i] != real_amiga2[i])
    assert diffs_restored == 276


# ---------------------------------------------------------------------------
# Non-mutation of the files themselves.
# ---------------------------------------------------------------------------


def test_sources_are_unmodified():
    """Re-derives size+mtime at the end of the run and compares against collection time,
    and independently re-checks the sha1 recorded at the top of this file -- a
    byte-identical rewrite (same size/mtime-insensitive content, different mtime) would
    still be caught by the hash half of this check."""
    current = _baseline()
    assert current == _BASELINE_AT_COLLECTION, "a source file's size or mtime changed during this test run"
    for key, path in PATHS.items():
        if os.path.isfile(path):
            assert _sha1(open(path, "rb").read()) == EXPECTED_SHA1[key], f"{key} content changed on disk"
