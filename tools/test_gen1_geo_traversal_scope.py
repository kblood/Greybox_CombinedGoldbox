"""Pins for `tools/gen1_geo_traversal_scope.py` — the LAYER 1 Gen1 GEO traversal-scope
measurement (item: map-traversal-scope-docs, 2026-09-09).

What this file guards, and why each pin exists:

  1. The headline LAYER 1 count: CoK 15 + DoK 19 = 34 GEO blocks, with the exact id lists,
     and that no raw_size other than 1026 is seen in the accepted set. This is the number
     that replaces the old unquantified "no claim is made yet for complete map traversal"
     disclaimer in `docs/engine/research/native-cok-dok-compatibility-plan.md` and
     `CLAUDE.md` — if it drifts, those docs' cited number is wrong and must be re-derived,
     not silently trusted.
  2. Sub-finding (d)(i): id 127 never appears as a container-level GEO block in either game,
     at any raw_size. This is what resolves the "extra target" dispute in the brief.
  3. Sub-finding (d)(ii): DoK's LOAD_FILES(127) "dynamic site" count is exactly 1 (block 17,
     offset 0x2e), and that count is robust under both the correct dialect and the wrong one.
  4. THE MANDATORY MUTATION the brief demanded be SEEN TO FIRE: decoding DoK's real ECL
     bytecode under CoK's un-overridden dialect (`DIALECT_COK`) must reproduce the historical
     false "17/19, ids 65+97 uncovered" DoK census, with a visible desync-site spike. This is
     not a synthetic mutation of this module's own code -- it is the actual dialect-mismatch
     bug the two disputing re-implementations apparently hit, reproduced on real retail bytes.
  5. A mutation test on the CONTAINER-PARSING side (separate from the ECL-dialect mutation
     above, per the brief's explicit "separate from" instruction): using the `require_header_word`
     escape hatch already built into `geo_container_scope` for exactly this purpose, prove that
     a wrong, CoK-specific extra constraint on DoK's header word would silently shrink the
     count -- i.e. prove the check *can* fail, then confirm production code (default call, no
     `require_header_word`) does not apply that wrong constraint.

Every new assertion in this file was mutation-tested by hand against a live-edited copy of
`gen1_geo_traversal_scope.py` (see this item's structured report for the exact RED/GREEN
commands and output) rather than trusted on inspection alone.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen1_geo_traversal_scope as scope  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parent.parent

COK_IDS = [32, 34, 48, 49, 50, 64, 66, 67, 68, 80, 81, 82, 96, 97, 99]
DOK_IDS = [32, 33, 34, 36, 48, 49, 50, 51, 64, 65, 66, 67, 80, 82, 83, 96, 97, 98, 99]


def _skip_if_missing_retail():
    cok_dir = REPO_ROOT / "Champions of Krynn"
    dok_dir = REPO_ROOT / "Death Knights of Krynn"
    if not cok_dir.is_dir() or not dok_dir.is_dir():
        pytest.skip("retail Champions of Krynn / Death Knights of Krynn folders not present")


class TestHeadlineLayer1Count:
    """CoK 15 + DoK 19 = 34 GEO blocks -- the number the docs disclaimer must cite."""

    def setup_method(self):
        _skip_if_missing_retail()

    def test_cok_count_and_ids(self):
        result = scope.geo_container_scope("cok", root=REPO_ROOT)
        assert result.count == 15
        assert result.accepted_ids == COK_IDS

    def test_dok_count_and_ids(self):
        result = scope.geo_container_scope("dok", root=REPO_ROOT)
        assert result.count == 19
        assert result.accepted_ids == DOK_IDS

    def test_total_is_34(self):
        cok = scope.geo_container_scope("cok", root=REPO_ROOT)
        dok = scope.geo_container_scope("dok", root=REPO_ROOT)
        assert cok.count + dok.count == 34

    def test_only_raw_size_1026_present(self):
        """Sanity fact from the brief: 'every raw_size is 1026 (no other value present)' --
        checked over the ACCEPTED set's own toc_raw_size field (all entries pass through the
        1026 filter by construction; this pins that the filter is not vacuous and that the
        decompressed-length re-check never rejects one of these blocks)."""
        cok = scope.geo_container_scope("cok", root=REPO_ROOT)
        dok = scope.geo_container_scope("dok", root=REPO_ROOT)
        assert {r.toc_raw_size for r in cok.accepted} == {1026}
        assert {r.toc_raw_size for r in dok.accepted} == {1026}
        assert {r.decompressed_len for r in cok.accepted} == {1026}
        assert {r.decompressed_len for r in dok.accepted} == {1026}


class TestId127AbsentFromContainer:
    """Sub-finding (d)(i): 127 is an ECL sentinel, never a GEO container block."""

    def setup_method(self):
        _skip_if_missing_retail()

    def test_cok_container_never_has_id_127(self):
        assert scope.id_127_present_in_container("cok", root=REPO_ROOT) is False

    def test_dok_container_never_has_id_127(self):
        assert scope.id_127_present_in_container("dok", root=REPO_ROOT) is False


class TestDokDynamicSiteCountIsOne:
    """Sub-finding (d)(ii): DoK's LOAD_FILES(127) count is 1 (block 17, offset 0x2e), not 2,
    and that count is robust under both the correct and the wrong dialect."""

    def setup_method(self):
        _skip_if_missing_retail()

    def _sites_targeting_127(self, dialect):
        game_dir = scope.GEN1_GAMES["dok"]
        hits = []
        for n in scope.GEO_FILE_NUMBERS:
            path = REPO_ROOT / game_dir / f"ECL{n}.DAX"
            sites, _desync = scope.ecl_load_files_sites(path, dialect)
            hits.extend((n, *s) for s in sites if s[2] == 127)
        return hits

    def test_exactly_one_site_under_own_dialect(self):
        hits = self._sites_targeting_127(scope.DIALECT_DOK_OWN)
        assert len(hits) == 1
        ecl_file, block_id, offset, target = hits[0]
        assert (ecl_file, block_id, offset, target) == (1, 17, 0x2E, 127)

    def test_exactly_one_site_survives_wrong_dialect(self):
        """The site sits close enough to block 17's entry point to survive desync even under
        the wrong (CoK) dialect -- this is what makes the count 'robust' per the module
        docstring, not an accident of the correct dialect only."""
        hits = self._sites_targeting_127(scope.DIALECT_COK)
        assert len(hits) == 1


class TestMandatoryDialectMutation:
    """THE MANDATORY MUTATION (brief section (b)): decode DoK's real ECL bytecode under CoK's
    un-overridden ('long word-set') dialect instead of DoK's own verified dialect, and confirm
    it reproduces the documented false '17/19, ids 65+97 uncovered' census with a visible
    spike in desync (truncated-decode) sites. If this did NOT reproduce, the honest thing
    would be to say so -- it does reproduce, exactly, on real retail bytes.
    """

    def setup_method(self):
        _skip_if_missing_retail()

    def test_own_dialect_is_clean_19_of_19_zero_desync(self):
        dok_ids = set(scope.geo_container_scope("dok", root=REPO_ROOT).accepted_ids)
        paired, desync = scope.dok_paired_area_census(scope.DIALECT_DOK_OWN, root=REPO_ROOT)
        assert paired & dok_ids == dok_ids
        assert desync == 0

    def test_cok_dialect_on_dok_reproduces_false_17_of_19_missing_65_97(self):
        dok_ids = set(scope.geo_container_scope("dok", root=REPO_ROOT).accepted_ids)
        paired, desync = scope.dok_paired_area_census(scope.DIALECT_COK, root=REPO_ROOT)
        covered = paired & dok_ids
        missing = dok_ids - paired
        assert len(covered) == 17, f"expected 17/19 covered, got {len(covered)}/19: {sorted(covered)}"
        assert missing == {65, 97}, f"expected exactly {{65, 97}} missing, got {sorted(missing)}"

    def test_desync_spikes_under_wrong_dialect(self):
        """The 'visible spike in truncated decodes' the brief asked for: desync count under
        the wrong dialect must be dramatically higher than under the correct one (0)."""
        _paired_own, desync_own = scope.dok_paired_area_census(scope.DIALECT_DOK_OWN, root=REPO_ROOT)
        _paired_cok, desync_cok = scope.dok_paired_area_census(scope.DIALECT_COK, root=REPO_ROOT)
        assert desync_own == 0
        assert desync_cok >= 100, f"expected a visible spike (>=100), got {desync_cok}"


class TestContainerParsingMutation:
    """A mutation test on the CONTAINER-PARSING side, separate from the ECL-dialect mutation
    above. `require_header_word` is production code's own escape hatch for exactly this: it
    lets a test apply a wrong, CoK-specific extra constraint to DoK's scan and observe the
    count silently shrink -- demonstrating the check *can* fail -- and then confirms that
    ordinary production code (no `require_header_word` argument) never applies it.
    """

    def setup_method(self):
        _skip_if_missing_retail()

    def test_wrong_cok_specific_header_word_constraint_would_shrink_dok_count(self):
        dok_default = scope.geo_container_scope("dok", root=REPO_ROOT)
        assert dok_default.count == 19  # production behaviour: no header-word constraint

        # DoK's own header words are heterogeneous (verified: not one shared constant across
        # its 19 real blocks), so requiring them all to equal any single fixed word is a wrong,
        # CoK-shaped assumption. Pick the header word of DoK's OWN first accepted block as the
        # "wrong constant a CoK-only implementation might have hard-coded" and show it breaks.
        wrong_constant = dok_default.accepted[0].header_word
        mutated = scope.geo_container_scope(
            "dok", root=REPO_ROOT, require_header_word=wrong_constant
        )
        assert mutated.count < dok_default.count, (
            "expected the wrong single-header-word constraint to shrink the DoK count below "
            f"19 (RED if this constraint were real production behaviour); got "
            f"{mutated.count} vs default {dok_default.count}"
        )

    def test_toc_entry_size_is_9_not_a_free_parameter(self):
        """Pin TOC_ENTRY_SIZE=9 itself (dax-format.md section 1) so a future edit that widens
        the TOC entry silently is caught here rather than only in a downstream count drift."""
        assert scope.TOC_ENTRY_SIZE == 9

    def test_gen1_geo_raw_size_constant_is_1026(self):
        """Pin the structural gate constant itself (ccgeo.asm's cmp ax, 1026)."""
        assert scope.GEN1_GEO_RAW_SIZE == 1026


class TestRleDecodeRoundTrip:
    """Basic correctness pin on the module's own local, dependency-free RLE copy (kept
    independent from tools/dax_decode.py per the module's own docstring rationale)."""

    def test_literal_run(self):
        # c=2 -> literal run of 3 bytes
        assert scope.rle_decode(bytes([2, 0xAA, 0xBB, 0xCC])) == bytes([0xAA, 0xBB, 0xCC])

    def test_repeat_run(self):
        # c=0xFE (254) -> repeat next byte (256-254)=2 times
        assert scope.rle_decode(bytes([0xFE, 0x11])) == bytes([0x11, 0x11])

    def test_expected_length_stops_early(self):
        data = bytes([2, 1, 2, 3]) + bytes([2, 4, 5, 6])
        assert scope.rle_decode(data, expected=3) == bytes([1, 2, 3])


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
