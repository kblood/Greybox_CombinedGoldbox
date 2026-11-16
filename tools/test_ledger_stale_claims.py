"""Tests for `tools/ledger_stale_claims.py` (round 34 R5).

Two halves, mirroring `tools/test_docs_claims.py`'s idiom for `docs_numeric_claims.py`:

  (a) `LedgerFixtureTests` -- a planted-null suite (goldbox-probe-must-be-able-to-fail): 6
      synthetic self-contradictions the detector MUST catch (one per concrete pattern, with
      redundancy across the three `P_*` families) and 6 synthetic near-misses it MUST NOT
      flag, each keyed to a real design decision (the CORRECTED-quote guard, the
      negation-before-proof guard, cross-concept scoping, and the `status` gate on
      P_STATUS_STALE). This is Bar A from `docs/engine/PLAN-ROUND-34.md`'s R5 section:
      recall 6/6, false positives <= 1/6.
  (b) `test_live_ledger_stale_claims_pinned_exactly` -- Bar C: the real
      `tools/goldbox_capabilities.json` at round 34's base commit produces exactly
      `KNOWN_STALE_LEDGER_CLAIMS`, the same "exact-set idiom" `test_docs_claims.py` uses for
      `KNOWN_STALE_CLAIMS` (a `==`, not a subset check, so both a regression and a fix show up).
      Phase B applies the adjudicated fixes and empties this set, moving the ids to
      `FORMER_STALE_LEDGER_CLAIMS` below -- this module's own copy of the round-31
      FORMER_STALE_CLAIMS idiom, so a corrected claim regressing silently is itself detectable.

All 4 live ids here were adjudicated BY HAND against the real ledger prose (not accepted on
the detector's say-so) -- see `docs/engine/research/ledger-stale-claims.md` for the
per-instance writeup and the verbatim Phase B patch text.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ledger_stale_claims as lsc  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]


def _profile(profile_id: str, capabilities: dict) -> dict:
    return {"profile_id": profile_id, "capabilities": capabilities}


def _cap(status: str, detail: str, gaps: list[str] | None = None) -> dict:
    cap = {"status": status, "detail": detail}
    if gaps is not None:
        cap["gaps"] = gaps
    return cap


# --------------------------------------------------------------------------------------
# (a) planted fixture: 6 real hits, 6 near-misses
# --------------------------------------------------------------------------------------


class LedgerFixtureTests:
    """Plain (non-unittest) assertion methods, run via simple `assert` under pytest's
    function-based collection -- each test is its own top-level `test_*` function below so
    pytest reports them individually (a class body of bare methods is not auto-collected
    without inheriting `unittest.TestCase`, so this class is a namespace only; the real
    tests are the module-level functions that follow, one per planted case, so a single
    regressing case fails on its own name instead of a single combined test hiding it)."""


# --- 6 planted contradictions, one function each so a regression names itself ----------


def test_planted_family_list_geo_is_detected():
    profiles = [
        _profile(
            "fixture-geo",
            {
                "map_container": _cap(
                    "partial",
                    "Fixture: GEO decodes 100% under decodeGeoBlock for every block in this title.",
                    ["GEO/monster container layouts for Fixture Game have not been reverse-engineered."],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_FAMILY_LIST" and "GEO" in c.message for c in claims), claims


def test_planted_family_list_walldef_is_detected():
    profiles = [
        _profile(
            "fixture-walldef",
            {
                "map_container": _cap(
                    "partial",
                    "Fixture: WALLDEF decodes 100% for every block in this title.",
                    ["WALLDEF/item container layouts for Fixture Game have not been reverse-engineered."],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_FAMILY_LIST" and "WALLDEF" in c.message for c in claims), claims


def test_planted_family_list_ecl_is_detected():
    profiles = [
        _profile(
            "fixture-ecl",
            {
                "map_container": _cap(
                    "partial",
                    "Fixture: every ECL block decodes, all carrying the Gen1 magic.",
                    ["ECL/monster container layouts for Fixture Game have not been reverse-engineered."],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_FAMILY_LIST" and "ECL" in c.message for c in claims), claims


def test_planted_status_stale_corrected_marker_is_detected():
    profiles = [
        _profile(
            "fixture-status-corrected",
            {
                "map_container": _cap(
                    "unsupported",
                    "CORRECTED 2026-01-01: this title's archive is now DECODED at 100%.",
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_STATUS_STALE" for c in claims), claims


def test_planted_status_stale_updated_marker_is_detected():
    profiles = [
        _profile(
            "fixture-status-updated",
            {
                "map_container": _cap(
                    "unsupported",
                    "UPDATED 2026-01-02: the archive is fully decoded.",
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_STATUS_STALE" for c in claims), claims


def test_planted_cross_capability_disassembly_is_detected():
    profiles = [
        _profile(
            "fixture-quests",
            {
                "ecl": _cap(
                    "proven",
                    "A dispatch map was built from the binary and the corpus disassembles cleanly.",
                ),
                "quests": _cap(
                    "unsupported",
                    "No quest graph exists; the ECL corpus has not even been disassembled.",
                ),
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert any(c.pattern == "P_CROSS_CAPABILITY_DISASSEMBLY" for c in claims), claims


PLANTED_CONTRADICTION_TESTS = [
    test_planted_family_list_geo_is_detected,
    test_planted_family_list_walldef_is_detected,
    test_planted_family_list_ecl_is_detected,
    test_planted_status_stale_corrected_marker_is_detected,
    test_planted_status_stale_updated_marker_is_detected,
    test_planted_cross_capability_disassembly_is_detected,
]


def test_all_six_planted_contradictions_pass_individually():
    """Bar A's recall half as one number: re-running the 6 planted-contradiction tests above
    must all pass -- 6/6, the exact bar the plan names. Kept as a second, explicit assertion
    (not a replacement for the individual tests, which name a regression precisely) so the
    "6/6" figure in the R5 report is itself something this file computes, not something
    typed by hand."""
    for fn in PLANTED_CONTRADICTION_TESTS:
        fn()
    assert len(PLANTED_CONTRADICTION_TESTS) == 6


# --- 6 planted near-misses, each keyed to a specific design decision -------------------


def test_near_miss_corrected_quote_is_not_flagged():
    """The exact "quotes an old claim in the course of correcting it" shape named in
    docs/engine/PLAN-ROUND-34.md's R5 section -- must NOT be flagged."""
    profiles = [
        _profile(
            "fixture-nm-quote",
            {
                "map_container": _cap(
                    "partial",
                    "GEO decodes 100% via decodeGeoBlock.",
                    [
                        "CORRECTED 2026-01-01: this gap said 'GEO/monster container layouts for "
                        "Fixture Game have not been reverse-engineered', which was false."
                    ],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


def test_near_miss_no_decoded_family_overlap_is_not_flagged():
    """A family-list denial where NONE of the named families are proven decoded by this
    entry's own detail -- both can be true at once (the round-33 bug this module exists to
    catch is specifically an OVERLAP, not any co-occurrence of the two phrase shapes)."""
    profiles = [
        _profile(
            "fixture-nm-no-overlap",
            {
                "map_container": _cap(
                    "unsupported",
                    "This is a preview only; no container format has been decoded yet.",
                    ["GEO/WALLDEF container layouts for Fixture Game have not been reverse-engineered."],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


def test_near_miss_partial_status_with_correction_is_not_flagged():
    """P_STATUS_STALE is gated on status == 'unsupported'; a 'partial' entry with the same
    CORRECTED+decoded language is the ledger doing exactly what it should (status already
    reflects the correction) and must not be flagged."""
    profiles = [
        _profile(
            "fixture-nm-partial",
            {
                "map_container": _cap(
                    "partial",
                    "CORRECTED 2026-01-01: now decodes 100% of the archive.",
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


def test_near_miss_unproven_ecl_sibling_is_not_flagged():
    """The cross-capability check requires the profile's OWN `ecl` entry to independently
    prove disassembly; if it does not, a sibling's "has not been disassembled" is simply
    true, not contradicted."""
    profiles = [
        _profile(
            "fixture-nm-unproven-ecl",
            {
                "ecl": _cap("unsupported", "This title's ECL dialect is still fully unknown."),
                "quests": _cap(
                    "unsupported",
                    "The ECL corpus has not even been disassembled.",
                ),
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


def test_near_miss_negated_proof_phrase_is_not_flagged():
    """`_is_negated_immediately_before` guard: a proof-phrase regex must not treat a NEGATED
    mention of its own proof phrase ("no dispatch map exists") as proof of disassembly."""
    profiles = [
        _profile(
            "fixture-nm-negated-proof",
            {
                "ecl": _cap("unsupported", "No dispatch map exists yet for this title's ECL dialect."),
                "quests": _cap("unsupported", "The ECL corpus has not even been disassembled."),
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


def test_near_miss_cross_concept_wired_vs_decoded_is_not_flagged():
    """Decode success and wiring are different capability facets; a gap correctly saying
    "no route wires this in" beside a detail that only claims decoding is NOT a
    contradiction (this is exactly why the real buck-rogers-countdown-to-doomsday
    map_container gap's "wired to any exploration surface" clause is a NARROWING target, not
    a deletion target -- see docs/engine/research/ledger-stale-claims.md). No pattern in this
    module targets wired/unwired at all, so this case documents the scope boundary rather
    than exercising a guard."""
    profiles = [
        _profile(
            "fixture-nm-wired",
            {
                "map_container": _cap(
                    "partial",
                    "GEO decodes 100% under decodeGeoBlock.",
                    ["Nothing here is wired to any exploration or combat surface."],
                )
            },
        )
    ]
    claims = lsc.find_stale_claims_in_profiles(profiles)
    assert claims == [], claims


PLANTED_NEAR_MISS_TESTS = [
    test_near_miss_corrected_quote_is_not_flagged,
    test_near_miss_no_decoded_family_overlap_is_not_flagged,
    test_near_miss_partial_status_with_correction_is_not_flagged,
    test_near_miss_unproven_ecl_sibling_is_not_flagged,
    test_near_miss_negated_proof_phrase_is_not_flagged,
    test_near_miss_cross_concept_wired_vs_decoded_is_not_flagged,
]


def test_all_six_planted_near_misses_pass_individually():
    """Bar A's precision half: 0 of the 6 near-misses flagged (the bar allows <= 1/6; this
    module ships at 0/6, which is stronger than the bar requires -- report the stronger
    number, not just 'bar met')."""
    for fn in PLANTED_NEAR_MISS_TESTS:
        fn()
    assert len(PLANTED_NEAR_MISS_TESTS) == 6


# --------------------------------------------------------------------------------------
# (b) live ledger: exact-set pin (Bar C)
# --------------------------------------------------------------------------------------

# Adjudicated BY HAND (docs/engine/research/ledger-stale-claims.md carries the full writeup
# and the verbatim Phase B patch for each). All 4 were real, and round 34 Phase B applied all
# four fixes, so this set is now EMPTY and the four ids live in FORMER_STALE_LEDGER_CLAIMS
# below (mirroring FORMER_STALE_CLAIMS in tools/test_docs_claims.py).
KNOWN_STALE_LEDGER_CLAIMS: frozenset[str] = frozenset()

# Round 34 Phase B moved all four here. Kept as a named set rather than deleted, so a future
# regression on one of these ids names itself instead of appearing as an anonymous
# "new (investigate)" entry.
#
# One gotcha found while clearing them, worth recording next to the ids it affected: the
# P_CROSS_CAPABILITY_DISASSEMBLY guard pairs SINGLE quotes, so the verbatim replacement text
# suggested in ledger-stale-claims.md did NOT clear the detector -- the apostrophes in
# "Cubed's"/"profile's" broke the pairing and the corrected wording silently failed to fire.
# Switching the inner quoting to double quotes cleared it. That was found by running the
# detector, not by trusting the patch text; a suggested patch is a hypothesis like any other.
FORMER_STALE_LEDGER_CLAIMS: frozenset[str] = frozenset(
    {
        "buck-rogers-countdown-to-doomsday::map_container::P_FAMILY_LIST",
        "buck-rogers-matrix-cubed::map_container::P_FAMILY_LIST",
        "buck-rogers-matrix-cubed::map_container::P_STATUS_STALE",
        "buck-rogers-matrix-cubed::quests::P_CROSS_CAPABILITY_DISASSEMBLY",
    }
)


def test_live_ledger_stale_claims_pinned_exactly() -> None:
    found = lsc.stale_claim_ids(lsc.find_stale_claims())
    assert found == KNOWN_STALE_LEDGER_CLAIMS, (
        "ledger self-contradiction set changed.\n"
        f"  found:    {sorted(found)}\n"
        f"  expected: {sorted(KNOWN_STALE_LEDGER_CLAIMS)}\n"
        f"  new (investigate): {sorted(found - KNOWN_STALE_LEDGER_CLAIMS)}\n"
        f"  fixed (shrink the set): {sorted(KNOWN_STALE_LEDGER_CLAIMS - found)}"
    )


def test_former_stale_ledger_claims_do_not_reappear() -> None:
    """Mirrors test_former_stale_claims_still_have_live_registry_entries in
    tools/test_docs_claims.py: once Phase B moves an id from KNOWN_STALE_LEDGER_CLAIMS to
    FORMER_STALE_LEDGER_CLAIMS, it must not silently come back."""
    found = lsc.stale_claim_ids(lsc.find_stale_claims())
    regressed = sorted(FORMER_STALE_LEDGER_CLAIMS & found)
    assert not regressed, f"previously-fixed ledger claim(s) regressed: {regressed}"


def test_ledger_file_is_readable_and_nonempty() -> None:
    """Sanity floor: the detector's file-reading path (`find_stale_claims()` with no
    explicit path, i.e. the real repo file) actually runs end to end."""
    claims = lsc.find_stale_claims()
    assert isinstance(claims, list)
    assert lsc.CAPABILITIES_JSON.exists()
