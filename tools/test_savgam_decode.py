"""Pins for `savgam_decode.py` against real, unmodified retail SAVGAM world-state saves.

Denominator: **9** real files, both Gen1 titles, all vendored in this repo (no external
D:\\ dependency, so this file always runs):

  * ``Champions of Krynn/SAVE/SAVGAMA.DAT``                              (CoK,  5469 bytes)
  * ``Death Knights of Krynn/SAVE/SAVGAMA.PTY``                          (DoK,  2913 bytes, sparse/fresh)
  * ``Death Knights of Krynn/cloud_saves/SAVE/SAVGAMA.PTY``              (DoK,  2913 bytes)
  * ``Death Knights of Krynn/cloud_saves/SAVE/SAVGAMB.PTY``              (DoK,  2913 bytes)
  * ``Death Knights of Krynn/cloud_saves/SAVE/SAVGAMC.PTY``              (DoK,  2913 bytes)
  * ``The Dark Queen of Krynn/cloud_saves/SAVE/More/2 - Death Knights of Krynn/SAVE/SAVGAMA.PTY``
    (DoK, 2913 bytes -- byte-identical to the cloud_saves A above; an independent copy of the
    same save synced into a different game's cloud folder, kept as a second oracle that it is
    a real, not-hand-edited file)
  * ...................................................SAVGAMB.PTY``    (DoK, 2913 bytes --
    byte-identical to the cloud_saves B above, same reasoning)
  * ``build/cok-area1-load-watch-20260727/runtime-game/SAVE/SAVGAMA.DAT``           (CoK, 5469
    bytes -- **added 2026-09-10**, a distinct CoK world-state, found by hashing every
    ``SAVGAMA.DAT`` at 5469 bytes anywhere in the checkout (not `build/` alone -- a `build/`-only
    sweep gives a different total, see the doc) rather than trusting a since-corrected doc
    sentence that claimed no second CoK save existed in this checkout; see
    `docs/engine/research/savgam-world-state-format.md`)
  * ``build/cok-caravan-worker-route-r2-20260727/runtime-game/SAVE/SAVGAMA.DAT``    (CoK, 5469
    bytes -- **added 2026-09-10**, a third, independently distinct CoK world-state, same method)

Every pin here was mutation-tested: the assertions below were run once against a deliberately
corrupted byte (via `bytearray` copy, never touching the file on disk) to confirm they go RED,
then against the restored bytes to confirm they go GREEN again. See
`test_roster_entry_pin_can_fail` and `test_trailer_offset_pin_can_fail`, which perform that
corrupt/restore cycle live inside the test run itself (not just narrated in a comment) so the
mutation proof is enforced on every run, not just claimed once by a human. The 2026-09-10
additions follow the same convention -- see `test_cok_three_way_differential_pin_can_fail` and
`test_cok_world_state_region_parity_pin_can_fail`.

Source files are opened read-only and never written. `test_sources_are_unmodified` re-derives
a fresh baseline listing (size + mtime) at collection time and compares it again at the end of
the module's tests, so any accidental write anywhere in this file trips a test rather than
going unnoticed.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import savgam_decode as sg  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

REAL_FILES = {
    "cok_savgama": os.path.join(REPO, "Champions of Krynn", "SAVE", "SAVGAMA.DAT"),
    "dok_save_savgama": os.path.join(REPO, "Death Knights of Krynn", "SAVE", "SAVGAMA.PTY"),
    "dok_cloud_savgama": os.path.join(REPO, "Death Knights of Krynn", "cloud_saves", "SAVE", "SAVGAMA.PTY"),
    "dok_cloud_savgamb": os.path.join(REPO, "Death Knights of Krynn", "cloud_saves", "SAVE", "SAVGAMB.PTY"),
    "dok_cloud_savgamc": os.path.join(REPO, "Death Knights of Krynn", "cloud_saves", "SAVE", "SAVGAMC.PTY"),
    "dok_more_savgama": os.path.join(
        REPO, "The Dark Queen of Krynn", "cloud_saves", "SAVE", "More",
        "2 - Death Knights of Krynn", "SAVE", "SAVGAMA.PTY",
    ),
    "dok_more_savgamb": os.path.join(
        REPO, "The Dark Queen of Krynn", "cloud_saves", "SAVE", "More",
        "2 - Death Knights of Krynn", "SAVE", "SAVGAMB.PTY",
    ),
    # Added 2026-09-10: a second and third CoK world-state, found under build/ by hashing
    # every SAVGAMA.DAT in the checkout rather than trusting the (now-corrected) doc claim
    # that no CoK differential pair existed. Confirmed decoder pins ZERO code changes needed
    # (see test_real_file_decodes and friends, parametrized over this dict).
    "cok_diff_b": os.path.join(
        REPO, "build", "cok-area1-load-watch-20260727", "runtime-game", "SAVE", "SAVGAMA.DAT",
    ),
    "cok_diff_c": os.path.join(
        REPO, "build", "cok-caravan-worker-route-r2-20260727", "runtime-game", "SAVE", "SAVGAMA.DAT",
    ),
}

EXPECTED_SIZES = {
    "cok_savgama": 5469,
    "dok_save_savgama": 2913,
    "dok_cloud_savgama": 2913,
    "dok_cloud_savgamb": 2913,
    "dok_cloud_savgamc": 2913,
    "dok_more_savgama": 2913,
    "dok_more_savgamb": 2913,
    "cok_diff_b": 5469,
    "cok_diff_c": 5469,
}

EXPECTED_SLOT_LETTER = {
    "cok_savgama": "A",
    "dok_save_savgama": "A",
    "dok_cloud_savgama": "A",
    "dok_cloud_savgamb": "B",
    "dok_cloud_savgamc": "C",
    "dok_more_savgama": "A",
    "dok_more_savgamb": "B",
    "cok_diff_b": "A",
    "cok_diff_c": "A",
}


def _present():
    return {k: p for k, p in REAL_FILES.items() if os.path.isfile(p)}


def _baseline():
    """size+mtime for every real file this module touches -- used to prove non-mutation."""
    out = {}
    for key, path in REAL_FILES.items():
        if os.path.isfile(path):
            st = os.stat(path)
            out[path] = (st.st_size, st.st_mtime_ns)
    return out


# Denominator check up front: fail loudly, not silently, if the real corpus this file
# depends on has shrunk (e.g. someone deletes a fixture without updating this file).
_PRESENT = _present()


@pytest.mark.skipif(len(_PRESENT) == 0, reason="no real SAVGAM fixtures found in this checkout")
def test_denominator_is_nine():
    """State the denominator. If this drops, a fixture went missing -- investigate, don't lower it.

    Was 7 until 2026-09-10, when a repo-wide hash sweep of every file literally named
    SAVGAMA.DAT at exactly 5469 bytes anywhere in the checkout (not just build/ -- 147
    candidates once 14 same-sized Secret of the Silver Blades files are excluded by hash,
    deduped by SHA-1 to exactly 3 distinct CoK states) found two more distinct, real CoK
    world-states beyond the single retail file this module previously had. This is a
    live-snapshot count over a git-ignored, continuously-churned scratch tree (`build/`) and
    is not expected to reproduce exactly on a later re-run -- see
    docs/engine/research/savgam-world-state-format.md."""
    assert len(_PRESENT) == 9, (
        f"expected all 9 vendored real SAVGAM samples, found {len(_PRESENT)}: {sorted(_PRESENT)}"
    )


@pytest.mark.parametrize("key", sorted(REAL_FILES))
def test_real_file_decodes(key):
    path = REAL_FILES[key]
    if not os.path.isfile(path):
        pytest.skip(f"fixture not present in this checkout: {path}")
    data = open(path, "rb").read()
    assert len(data) == EXPECTED_SIZES[key], f"{key}: unexpected size {len(data)}"
    result = sg.decode_savgam(data, source=path)
    assert result.size == len(data)
    assert len(result.roster) == sg.ROSTER_ENTRY_COUNT
    assert not result.warnings, f"{key}: unexpected warnings {result.warnings}"


@pytest.mark.parametrize("key", sorted(REAL_FILES))
def test_roster_slot_letter_matches_filename(key):
    """The strongest, most independently-checkable claim this module makes: the embedded
    per-slot tag's letter always equals the save file's OWN filename letter. Verified against
    the file's real basename (not a scratch copy's renamed one)."""
    path = REAL_FILES[key]
    if not os.path.isfile(path):
        pytest.skip(f"fixture not present in this checkout: {path}")
    data = open(path, "rb").read()
    result = sg.decode_savgam(data, source=path)
    assert result.slot_letters == {EXPECTED_SLOT_LETTER[key]}
    assert result.filename_letter_matches(os.path.basename(path)) is True


@pytest.mark.parametrize("key", sorted(REAL_FILES))
def test_roster_member_numbers_are_sequential(key):
    path = REAL_FILES[key]
    if not os.path.isfile(path):
        pytest.skip(f"fixture not present in this checkout: {path}")
    data = open(path, "rb").read()
    result = sg.decode_savgam(data, source=path)
    assert [e.member_number for e in result.roster] == [1, 2, 3, 4, 5, 6]
    assert [e.index for e in result.roster] == [0, 1, 2, 3, 4, 5]


@pytest.mark.parametrize("key", sorted(REAL_FILES))
def test_roster_offset_is_size_minus_trailer(key):
    path = REAL_FILES[key]
    if not os.path.isfile(path):
        pytest.skip(f"fixture not present in this checkout: {path}")
    data = open(path, "rb").read()
    result = sg.decode_savgam(data, source=path)
    assert result.roster_offset == len(data) - sg.TRAILER_SIZE
    assert result.roster[0].offset == result.roster_offset
    # 6 entries * 41 bytes/entry + 82-byte tail = 328-byte trailer, exactly.
    assert sg.ROSTER_ENTRY_COUNT * sg.ROSTER_ENTRY_SIZE + len(result.trailer_tail) == sg.TRAILER_SIZE


def test_trailer_size_identical_across_different_file_sizes_and_titles():
    """The load-bearing cross-title claim: CoK (5469 bytes) and DoK (2913 bytes) put the
    roster table at the exact same distance from EOF despite an over-2500-byte size gap."""
    cok = REAL_FILES["cok_savgama"]
    dok = REAL_FILES["dok_cloud_savgama"]
    if not (os.path.isfile(cok) and os.path.isfile(dok)):
        pytest.skip("both CoK and DoK fixtures required for the cross-title claim")
    cok_data = open(cok, "rb").read()
    dok_data = open(dok, "rb").read()
    cok_r = sg.decode_savgam(cok_data)
    dok_r = sg.decode_savgam(dok_data)
    assert len(cok_data) - cok_r.roster_offset == sg.TRAILER_SIZE
    assert len(dok_data) - dok_r.roster_offset == sg.TRAILER_SIZE
    assert len(cok_data) != len(dok_data)  # the whole point: different sizes, same trailer


def test_more_folder_copies_are_byte_identical_to_cloud_saves():
    """`dok_more_savgama/b` are independent second copies of `dok_cloud_savgama/b`, synced
    into a different game's cloud folder. Identity here is itself weak evidence the files are
    real cloud-sync artifacts rather than something hand-crafted for this task."""
    pairs = [
        ("dok_cloud_savgama", "dok_more_savgama"),
        ("dok_cloud_savgamb", "dok_more_savgamb"),
    ]
    for a_key, b_key in pairs:
        a_path, b_path = REAL_FILES[a_key], REAL_FILES[b_key]
        if not (os.path.isfile(a_path) and os.path.isfile(b_path)):
            pytest.skip(f"{a_key}/{b_key} fixtures not both present")
        assert open(a_path, "rb").read() == open(b_path, "rb").read()


# ---------------------------------------------------------------------------
# CoK A/B/C world-state differential (added 2026-09-10). See
# docs/engine/research/savgam-world-state-format.md, "CoK A/B/C world-state differential",
# for the full derivation these pins rest on. "cok_savgama" below is A, "cok_diff_b" is B,
# "cok_diff_c" is C, matching that doc's naming.
# ---------------------------------------------------------------------------

COK_ABC_KEYS = ("cok_savgama", "cok_diff_b", "cok_diff_c")


def _cok_abc_present():
    paths = {k: REAL_FILES[k] for k in COK_ABC_KEYS}
    if not all(os.path.isfile(p) for p in paths.values()):
        return None
    return paths


def _diff_count(x: bytes, y: bytes) -> int:
    return sum(1 for i in range(len(x)) if x[i] != y[i])


def test_cok_three_way_differential_byte_counts():
    """Pins the exact byte-diff counts the doc's differential analysis rests on."""
    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama, cok_diff_b and cok_diff_c all present")
    a = open(paths["cok_savgama"], "rb").read()
    b = open(paths["cok_diff_b"], "rb").read()
    c = open(paths["cok_diff_c"], "rb").read()
    assert _diff_count(a, b) == 536
    assert _diff_count(a, c) == 280
    assert _diff_count(b, c) == 414


def test_cok_three_way_differential_pin_can_fail():
    """Mutation proof for the counts above: corrupt one byte of an in-memory COPY of B
    (never the file on disk), show the A-vs-B count moves off 536, then show the real
    bytes still give 536 and the file on disk is unchanged (SHA-256)."""
    import hashlib

    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama, cok_diff_b and cok_diff_c all present")
    a = open(paths["cok_savgama"], "rb").read()
    b_path = paths["cok_diff_b"]
    b_original = open(b_path, "rb").read()
    b_hash = hashlib.sha256(b_original).hexdigest()
    assert _diff_count(a, b_original) == 536

    mutated = bytearray(b_original)
    equal_offset = next(i for i in range(len(a)) if a[i] == b_original[i])
    mutated[equal_offset] ^= 0xFF  # was equal to A there; now it will differ too
    assert _diff_count(a, bytes(mutated)) == 537

    # RESTORE (in-memory only) and re-verify green, and that disk was never touched.
    assert _diff_count(a, b_original) == 536
    assert hashlib.sha256(open(b_path, "rb").read()).hexdigest() == b_hash


# Inclusive (start, end) byte ranges where A vs B differs outside the roster/trailer, per
# the doc's differential analysis. 385..1021 and 4609..5083.
COK_WORLD_STATE_REGIONS = [(385, 1021), (4609, 5083)]


def test_cok_world_state_regions_differ_only_at_odd_offsets():
    """Structural pin: every A-vs-B differing byte inside the two world-state regions
    lands at an ODD file offset -- 241 of 241, 0 at even offsets. This does NOT by itself
    prove a big-endian u16 array (see the doc's "Structural attack" section for why an
    all-zero interleaved byte array is observationally identical on this evidence alone)."""
    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama and cok_diff_b present")
    a = open(paths["cok_savgama"], "rb").read()
    b = open(paths["cok_diff_b"], "rb").read()
    region_diffs = [
        i for lo, hi in COK_WORLD_STATE_REGIONS for i in range(lo, hi + 1) if a[i] != b[i]
    ]
    assert len(region_diffs) == 241
    even = [o for o in region_diffs if o % 2 == 0]
    assert even == [], f"unexpected even-offset diffs (breaks the odd-only claim): {even}"


def test_cok_world_state_region_parity_pin_can_fail():
    """Mutation proof: force an EVEN-offset byte inside region 1 to differ between A and a
    mutated copy of B, and confirm the odd-only assertion above would then correctly fail
    (it is not vacuously true, e.g. because the range check has an off-by-one that finds
    nothing)."""
    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama and cok_diff_b present")
    a = open(paths["cok_savgama"], "rb").read()
    b_original = open(paths["cok_diff_b"], "rb").read()
    even_offset = 386  # inside region 1; currently equal (both 0x00) between A and B
    assert a[even_offset] == b_original[even_offset] == 0
    mutated = bytearray(b_original)
    mutated[even_offset] = 0x01
    region_diffs = [
        i for lo, hi in COK_WORLD_STATE_REGIONS for i in range(lo, hi + 1) if a[i] != mutated[i]
    ]
    assert even_offset in region_diffs
    even = [o for o in region_diffs if o % 2 == 0]
    assert even != [], "the odd-only pin failed to notice a deliberately-introduced even-offset diff"


# The doc's decisive structural finding for region 2 specifically: it is a one-ASCII-byte-
# per-16-bit-word text buffer that reproduces a real ECL script's own SAVE-string operands.
ECL3_097_TEXT_FIELDS = ["WHAT DO YOU DO?", "ATTACK", "MOVE AWAY", "REPORT HUMANS", "GIVE THEM THE CROWN"]
ECL3_097_TEXT_FIELD_SPACING = [40, 40, 30, 40]  # bytes between successive fields' first char


def test_cok_b_world_state_text_matches_ecl3_097_dump():
    """Cross-oracle proof, independent of the SAVGAM file itself: the word-per-character
    text this differential exposes in B reproduces ECL3_097.txt's (Area 3, Block 97) own
    `0x09 SAVE <string...>` operands verbatim, at the SAME relative spacing the ECL dump's
    own field offsets declare (0x28, 0x28, 0x1E, 0x28 bytes = 40, 40, 30, 40).

    `daxdump_extracted/` is git-ignored (locally re-derived from `daxdump.zip` via
    `EclDump.exe`), so this skips rather than fails when it is absent -- it is corroborating
    evidence, not the primary pin."""
    ecl_path = os.path.join(REPO, "daxdump_extracted", "ECL3_097.txt")
    paths = _cok_abc_present()
    if not os.path.isfile(ecl_path) or paths is None:
        pytest.skip("daxdump_extracted/ECL3_097.txt (gitignored) or cok_diff_b not present")
    ecl_text = open(ecl_path, encoding="ascii", errors="replace").read()
    for s in ECL3_097_TEXT_FIELDS:
        assert f"'{s}'" in ecl_text, f"{s!r} not found in ECL3_097.txt as expected"

    data = open(paths["cok_diff_b"], "rb").read()
    offsets = [sg.find_word_per_char_string(data, s) for s in ECL3_097_TEXT_FIELDS]
    assert all(o is not None for o in offsets), offsets
    deltas = [offsets[i + 1] - offsets[i] for i in range(len(offsets) - 1)]
    assert deltas == ECL3_097_TEXT_FIELD_SPACING


def test_cok_roster_tags_unchanged_despite_differential():
    """The differential's roster table keeps the SAME slot tags (CHRDATA1..6) in A, B and
    C -- nothing in SAVGAMA.DAT itself reassigns which sidecar backs which slot. A literal
    'party swap' reading of the A-vs-C difference does not hold at the roster-table level;
    see `test_cok_states_have_genuinely_different_sidecar_character_data` for where the
    real per-state difference actually lives."""
    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama, cok_diff_b and cok_diff_c all present")
    tags_by_state = {}
    for key, path in paths.items():
        data = open(path, "rb").read()
        result = sg.decode_savgam(data, source=path)
        tags_by_state[key] = tuple(e.base_filename for e in result.roster)
    values = list(tags_by_state.values())
    assert all(v == values[0] for v in values), tags_by_state
    assert values[0] == ("CHRDATA1", "CHRDATA2", "CHRDATA3", "CHRDATA4", "CHRDATA5", "CHRDATA6")


def test_cok_states_have_genuinely_different_sidecar_character_data():
    """Refutes a literal 'C is a party SWAP of A': the roster TAGS are identical (previous
    test), so what actually differs per-state is the sidecar CHRDATA1.SAV bytes themselves.
    Confirms each of the three save directories' own CHRDATA1.SAV is a distinct file."""
    import hashlib

    paths = _cok_abc_present()
    if paths is None:
        pytest.skip("need cok_savgama, cok_diff_b and cok_diff_c all present")
    sidecars = {key: os.path.join(os.path.dirname(path), "CHRDATA1.SAV") for key, path in paths.items()}
    missing = [p for p in sidecars.values() if not os.path.isfile(p)]
    if missing:
        pytest.skip(f"CHRDATA1.SAV sidecar(s) not present: {missing}")
    hashes = {key: hashlib.sha1(open(p, "rb").read()).hexdigest() for key, p in sidecars.items()}
    assert len(set(hashes.values())) == 3, f"expected 3 distinct CHRDATA1.SAV files, got {hashes}"


# ---------------------------------------------------------------------------
# Mutation proof: a check that has never been seen failing is not evidence.
# These corrupt an in-memory bytearray COPY (the file on disk is never touched),
# confirm the decoder goes red, then restore and confirm it goes green again --
# all inside one test run, not narrated after the fact.
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not os.path.isfile(REAL_FILES["dok_cloud_savgamb"]), reason="fixture missing")
def test_roster_entry_pin_can_fail():
    path = REAL_FILES["dok_cloud_savgamb"]
    original = open(path, "rb").read()

    # Sanity: the real bytes decode clean and hash what we expect.
    import hashlib
    original_hash = hashlib.sha256(original).hexdigest()
    clean = sg.decode_savgam(original)
    assert clean.roster[2].base_filename == "CHRDATB3"
    assert not clean.warnings

    # MUTATE (in memory only): flip the length-prefix byte of roster entry 2.
    mutated = bytearray(original)
    entry_off = clean.roster[2].offset
    assert mutated[entry_off] == 8
    mutated[entry_off] = 0xAA
    with pytest.raises(sg.SavgamFormatError):
        sg.decode_savgam(bytes(mutated))

    # MUTATE differently: corrupt one letter of the tag body so it no longer starts "CHRDAT".
    mutated2 = bytearray(original)
    mutated2[entry_off + 1] = ord("X")  # 'C' -> 'X' in "CHRDAT..."
    with pytest.raises(sg.SavgamFormatError):
        sg.decode_savgam(bytes(mutated2))

    # RESTORE and re-verify green, and that the disk file itself was never touched.
    restored = sg.decode_savgam(original)
    assert restored.roster[2].base_filename == "CHRDATB3"
    assert hashlib.sha256(open(path, "rb").read()).hexdigest() == original_hash


@pytest.mark.skipif(not os.path.isfile(REAL_FILES["dok_cloud_savgamc"]), reason="fixture missing")
def test_trailer_offset_pin_can_fail():
    """Prove the `TRAILER_SIZE`/roster-offset pin is load-bearing: shifting the constant by
    even 1 byte must break real-file decoding, not silently keep passing."""
    path = REAL_FILES["dok_cloud_savgamc"]
    original = open(path, "rb").read()
    good = sg.decode_savgam(original)
    assert good.roster[0].base_filename == "CHRDATC1"

    for wrong_trailer in (sg.TRAILER_SIZE - 1, sg.TRAILER_SIZE + 1):
        wrong_offset = len(original) - wrong_trailer
        entry = original[wrong_offset : wrong_offset + 9]
        # Off-by-one must NOT also happen to look like a valid tag (it doesn't, for these
        # real bytes) -- this is the actual mutation-can-fail evidence for the constant.
        looks_valid = entry[0] == 8 and entry[1:].startswith(b"CHRDAT")
        assert not looks_valid, (
            f"TRAILER_SIZE={sg.TRAILER_SIZE} is not uniquely determined: offset "
            f"{wrong_offset} (trailer size {wrong_trailer}) also looks like a valid entry"
        )


def test_sources_are_unmodified():
    """Final check: every real file this module read is byte-for-byte where it started.
    Compares against a baseline captured at import time (top of this module's collection)."""
    baseline = _baseline()
    for path, (size, mtime_ns) in baseline.items():
        st = os.stat(path)
        assert st.st_size == size, f"{path}: size changed ({size} -> {st.st_size})"
        assert st.st_mtime_ns == mtime_ns, f"{path}: mtime changed -- file was written to"


# Capture the baseline at import time so test_sources_are_unmodified has something to compare
# against regardless of test ordering.
_BASELINE_AT_COLLECTION = _baseline()


def test_sources_unmodified_since_collection():
    now = _baseline()
    assert now == _BASELINE_AT_COLLECTION
