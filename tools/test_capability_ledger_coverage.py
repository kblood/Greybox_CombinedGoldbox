"""Walk from `PROFILES` and `apps/web/games/*.json` to `tools/goldbox_capabilities.json`.

Until this file existed, nothing walked from either side to the capability ledger. Buck Rogers:
Countdown to Doomsday has had a `PROFILES` entry, a browser asset manifest, an Amiga manifest, a
binary-derived ECL dialect, and two browser routes since 2026-08-26 -- and still had no ledger
profile as of round 29's base commit `a63efc6`. Nothing went red because
`validate_capability_contract(None)` degrades to `status: "missing"` rather than failing, and no
test compared `PROFILES` (or the shipped manifests) against `load_capabilities()`'s keys.

Three tests, all two-sided (a phantom entry is caught, not just a missing one):

1. `test_ledger_profiles_match_PROFILES` -- the `PROFILES` ids missing from the ledger must equal
   a pinned `KNOWN_MISSING` set exactly. Round 29's Phase B landed Buck's profile, so `KNOWN_MISSING` is
   emptied or this test goes red -- that coupling is intentional, not a bug to work around.
2. `test_every_manifest_is_owned` -- every `apps/web/games/*.json` stem not named by any
   `PROFILES[*]["manifest"]` must equal a pinned `PLATFORM_VARIANT_MANIFESTS` set exactly, and each
   of those must share its `title` field with a profile whose own manifest IS owned (the rule this
   file implements: an owned DOS/base manifest and an un-owned platform-variant manifest for the
   same title is a deliberate "extra art source", not an orphan).
3. `test_support_claims_cover_PROFILES` -- `apps/web/src/ui/supportClaims.json`'s `profile_id`s
   equal `PROFILES` ids exactly. `validate_support_claims` already asserts a form of this
   (`goldbox_corpus.py:1718-1719`, the "support claim missing for corpus profile" branch) but only
   against the *corpus* (which is built from the same `PROFILES` list) and only when a live corpus
   run succeeds; this test reads `supportClaims.json` and `PROFILES` directly so it costs nothing
   and does not depend on external, never-vendored install detection succeeding.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import goldbox_corpus

REPO_ROOT = goldbox_corpus.REPO_ROOT
GAMES_DIR = REPO_ROOT / "apps/web/games"
SUPPORT_CLAIMS_PATH = REPO_ROOT / "apps/web/src/ui/supportClaims.json"

# Buck Rogers: Countdown to Doomsday is in PROFILES with a manifest, but
# tools/goldbox_capabilities.json carries no profile for it (measured on a63efc6: 11 ledger
# profiles, Buck absent). Landing the profile (Phase B, a separate agent) must empty this set --
# if it stays non-empty after that edit, the profile did not actually land under the id PROFILES
# expects.
KNOWN_MISSING: set[str] = set()

# apps/web/games/*.json stems that are not named by any PROFILES[*]["manifest"]. Each is a
# platform-variant asset source (Amiga art) for a title whose DOS/base manifest already has its
# own PROFILES entry -- a deliberate second art source, not an orphaned or dead manifest.
#
# dark-queen-amiga/pools-amiga/curse-amiga added by Phase B (PLAN-ROUND-31.md, following R6's
# docs/engine/research/amiga-glib-manifests.md) -- each shares its `title` with its DOS/base
# PROFILES-owned sibling (dark-queen-dos, pools-of-darkness, curse-of-the-azure-bonds).
#
# secret-amiga/gateway-amiga/treasures-amiga (round 32 R2) and pool-amiga (round 32 R3) complete
# the set: every one of the ten Gold Box titles in the WHDLoad pack now has an Amiga manifest, so
# tools/test_amiga_sets_holdings_vs_manifests.py's KNOWN_UNMANIFESTED is empty. Note pool-amiga is
# Pool of Radiance and is NOT a GLIB set -- it is the 4th Amiga container format, decoded by
# packages/engine/src/loaders/poolAmiga.ts, so it reaches this list by a different route than the
# other three.
PLATFORM_VARIANT_MANIFESTS: set[str] = {
    "champions-amiga",
    "death-knights-amiga",
    "buck-rogers-amiga",
    "dark-queen-amiga",
    "pools-amiga",
    "curse-amiga",
    "secret-amiga",
    "gateway-amiga",
    "treasures-amiga",
    "pool-amiga",
}


def manifest_title(stem: str) -> str | None:
    path = GAMES_DIR / f"{stem}.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    title = data.get("title")
    return title if isinstance(title, str) else None


class CapabilityLedgerCoverageTests(unittest.TestCase):
    def test_ledger_profiles_match_PROFILES(self) -> None:
        """PROFILES ids that have a manifest but no ledger entry must be exactly KNOWN_MISSING.

        Two-sided: also assert the reverse -- every ledger profile_id is a real PROFILES id, so a
        profile for a title the corpus does not know about (a typo'd id, a renamed title) is a
        phantom entry the support page would read but nothing else would ever detect or route.
        """
        profile_ids_with_manifest = {p["id"] for p in goldbox_corpus.PROFILES if p.get("manifest")}
        ledger = goldbox_corpus.load_capabilities()
        ledger_ids = set(ledger.keys())

        missing = profile_ids_with_manifest - ledger_ids
        self.assertEqual(missing, KNOWN_MISSING)

        all_profile_ids = {p["id"] for p in goldbox_corpus.PROFILES}
        phantom = ledger_ids - all_profile_ids
        self.assertEqual(phantom, set())

    def test_every_manifest_is_owned(self) -> None:
        """Every apps/web/games/*.json stem is either a PROFILES manifest or a pinned variant.

        The "share a title prefix with a profile that has its own manifest" rule is implemented as:
        the un-owned manifest's `title` field equals the `title` field of some PROFILES entry that
        itself has a (different, owned) manifest. That is the actual shape in the repo -- e.g.
        buck-rogers-amiga.json's title 'Buck Rogers: Countdown to Doomsday' matches PROFILES'
        buck-rogers-countdown-to-doomsday entry, whose own manifest field is
        'buck-rogers-countdown-to-doomsday' (owned). A manifest with no owner and no such sibling
        would fail this and correctly go red -- it would be a truly orphaned file.
        """
        manifest_stems = {p.stem for p in GAMES_DIR.glob("*.json")}
        owned_stems = {p["manifest"] for p in goldbox_corpus.PROFILES if p.get("manifest")}
        unowned = manifest_stems - owned_stems
        self.assertEqual(unowned, PLATFORM_VARIANT_MANIFESTS)

        owned_titles_by_profile = {
            p["id"]: manifest_title(p["manifest"])
            for p in goldbox_corpus.PROFILES
            if p.get("manifest")
        }
        for stem in sorted(unowned):
            title = manifest_title(stem)
            self.assertIsNotNone(title, f"{stem}.json has no readable title")
            sibling = [pid for pid, t in owned_titles_by_profile.items() if t == title]
            self.assertTrue(
                sibling,
                f"{stem}.json (title={title!r}) shares no title with any owned-manifest PROFILES entry",
            )

    def test_support_claims_cover_PROFILES(self) -> None:
        """supportClaims.json profile_ids == PROFILES ids, exactly (13 as of a63efc6).

        goldbox_corpus.validate_support_claims already flags a profile_id present in PROFILES/the
        corpus but absent from supportClaims.json (the "support claim missing for corpus profile"
        branch, :1718-1719) -- but only as part of a full corpus build, which needs the external,
        never-vendored install roots to detect every title. This test is the direct, cheap pin:
        it reads supportClaims.json and PROFILES only, so it holds even when an install root is
        absent, and it also fails on a claim for a profile_id PROFILES does not have (a phantom
        support claim), which the corpus-side check does not itself name as a distinct failure mode.
        """
        profile_ids = {p["id"] for p in goldbox_corpus.PROFILES}
        claims = json.loads(SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        claim_ids = {game["profile_id"] for game in claims.get("games", [])}
        self.assertEqual(claim_ids, profile_ids)
        self.assertEqual(len(profile_ids), 13)


if __name__ == "__main__":
    unittest.main()
