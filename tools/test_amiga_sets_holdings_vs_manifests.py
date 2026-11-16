"""
R6 -- do the Amiga WHDLoad Gold Box holdings have a manifest? (`docs/engine/PLAN-ROUND-31.md` R6.)

The WHDLoad "Games-WHDLoad/unpacked" pack (external, read-only, never vendored -- see
CLAUDE.md's Amiga source-location list) holds ten distinct Gold Box titles' Amiga ports,
one folder each (English base name; three more folders are German localizations of
titles already counted -- `BuckRogersCountdownDdayDe`, `DeathKnightsOfKrynnDe`,
`PoolsOfDarknessDe` -- and are deliberately excluded from the ten so a locale duplicate
never inflates the count).

Six of the ten now have an Amiga-platform manifest under `apps/web/games/`: Champions
and Death Knights point at our own `amiga_extracted/` ADF dump (not this WHDLoad pack)
and Buck Rogers, Dark Queen of Krynn, Pools of Darkness, and Curse of the Azure Bonds
point at this WHDLoad pack directly -- all six count as "manifested" for their title,
because the question this test answers is "does the title have an Amiga manifest", not
"does it have a WHDLoad-sourced one". Dark Queen/Pools/Curse were landed by Phase B
(`docs/engine/research/amiga-glib-manifests.md`'s staged JSON, k = 3 of the 6 GLIB-era
sets R6 censused), chosen by measured coverage and palette completeness over Secret of
the Silver Blades, Gateway to the Savage Frontier, and Treasures of the Savage Frontier.

The other four -- Secret of the Silver Blades, Gateway to the Savage Frontier, Treasures
of the Savage Frontier (all GLIB-era, censused byte-for-byte in
`packages/engine/test/amigaGlibSetsCensus.test.ts`, and still staged as ready-to-land JSON
in the R6 memo), and Pool of Radiance (a 4th, still Python-only format,
`tools/pool_amiga_decode.py`) -- have NO manifest. This file pins that set exactly as
`KNOWN_UNMANIFESTED`, matching the plan's own predicted "`KNOWN_UNMANIFESTED` after
Phase B: 7 - k" for k = 3 manifests landed (R6 owned the census + this test + the research
doc only; landing manifests from the doc's staged JSON was Phase B's job, tracked
separately -- when a future round lands one of these remaining four, this file's
`KNOWN_UNMANIFESTED` shrinks by one in the same commit that adds the manifest, per the
plan's step 6).

Two-sided, per the project's mutation discipline:
  1. WHDLOAD folders (canonical ten) minus "titles with an Amiga manifest" == KNOWN_UNMANIFESTED
     exactly -- adding a fake folder name to KNOWN_UNMANIFESTED must fail (tested below).
  2. Every manifest that points into the WHDLoad pack points at a folder that actually
     exists on disk -- catches a stale/typo'd path before it reaches Phase B.

Skips (not fails) when the external, never-vendored WHDLoad root is absent, or when
`apps/web/games/` is absent (should not happen in this repo, but the pattern here
matches the rest of `tools/`'s "external source missing => skip" convention).
"""
import json
import os

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHDLOAD_ROOT = (
    r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection"
    r"\Games-WHDLoad\unpacked"
)
GAMES_DIR = os.path.join(REPO_ROOT, "apps", "web", "games")

# The ten canonical (non-German-localization) Gold Box WHDLoad folders. Measured 2026-09-03
# by listing WHDLOAD_ROOT and grepping for the Krynn/Pool/Curse/Secret/Gateway/Treasures/Buck
# titles -- exactly these ten, plus three German-suffixed duplicates that are excluded.
WHDLOAD_GOLDBOX_FOLDERS = {
    "BuckRogersCountdownDday",
    "ChampionsOfKrynn",
    "CurseOfTheAzureBonds",
    "DarkQueenOfKrynn",
    "DeathKnightsOfKrynn",
    "GatewayToSavageFrontier",
    "PoolOfRadiance",
    "PoolsOfDarkness",
    "SecretOfTheSilverBlades",
    "TreasuresOfSavageFrontier",
}

# German-localization duplicates of a folder already counted above -- present on disk but
# deliberately NOT separate entries; the reverse-check below still requires these to exist
# when referenced by nothing (they aren't referenced by any manifest), so they're just
# excluded from WHDLOAD_GOLDBOX_FOLDERS rather than asserted absent.
WHDLOAD_LOCALIZATION_DUPES = {
    "BuckRogersCountdownDdayDe",
    "DeathKnightsOfKrynnDe",
    "PoolsOfDarknessDe",
}

# Folder -> the apps/web/games/*.json manifest id that manifests this title on Amiga.
# Champions/Death Knights point at amiga_extracted/ (our own ADF dump), not this WHDLoad
# pack -- they still count as "manifested" here; the question is per-title, not per-source.
#
# Phase B (following R6's docs/engine/research/amiga-glib-manifests.md) landed three of the
# six GLIB-era manifests staged there: dark-queen-amiga, pools-amiga, curse-amiga -- in that
# order, by measured coverage and palette completeness (DQK 100% real palette; Pools 82.9%;
# Curse renders almost everything, mostly under a synthetic EGA-16 stand-in palette). Secret,
# Gateway, and Treasures were left unmanifested: their measured coverage came in below the
# plan's own predicted floor and/or the majority of their frames (Gateway, Treasures) render
# with NO palette at all, a materially worse viewer experience than Curse's "some frame for
# nearly every asset, just re-coloured" story -- see the memo section 3's ranking.
MANIFESTED_AMIGA_TITLES = {
    "ChampionsOfKrynn": "champions-amiga",
    "DeathKnightsOfKrynn": "death-knights-amiga",
    "BuckRogersCountdownDday": "buck-rogers-amiga",
    "DarkQueenOfKrynn": "dark-queen-amiga",
    "PoolsOfDarkness": "pools-amiga",
    "CurseOfTheAzureBonds": "curse-amiga",
    "SecretOfTheSilverBlades": "secret-amiga",
    "GatewayToSavageFrontier": "gateway-amiga",
    "TreasuresOfSavageFrontier": "treasures-amiga",
    "PoolOfRadiance": "pool-amiga",
}

# The exact pinned gap. Round 32 Phase B landed the last four (secret-amiga, gateway-amiga,
# treasures-amiga from R2, pool-amiga from R3), so every WHDLoad Gold Box folder now has a
# manifest and this set is EMPTY. It stays here rather than being deleted: the two-sided
# check below still has to be able to fail, and an empty set is the strongest form of it.
# WHDLOAD_GOLDBOX_FOLDERS minus
# MANIFESTED_AMIGA_TITLES.keys() == this set, matching the plan's own predicted
# "KNOWN_UNMANIFESTED after Phase B: 7 - k" for k = 3 manifests landed.
KNOWN_UNMANIFESTED: set[str] = set()


def _require_whdload():
    if not os.path.isdir(WHDLOAD_ROOT):
        pytest.skip("absent (never-vendored Amiga WHDLoad source)")


def _require_games_dir():
    if not os.path.isdir(GAMES_DIR):
        pytest.skip("apps/web/games/ is absent")


def _load_manifests():
    _require_games_dir()
    out = {}
    for name in sorted(os.listdir(GAMES_DIR)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(GAMES_DIR, name)
        with open(path, encoding="utf-8") as fh:
            out[name[: -len(".json")]] = json.load(fh)
    return out


def test_whdload_goldbox_folders_are_exactly_the_pinned_ten():
    """Sanity floor under everything else here: if the pack's layout drifts, catch it first."""
    _require_whdload()
    on_disk = {
        name for name in os.listdir(WHDLOAD_ROOT)
        if os.path.isdir(os.path.join(WHDLOAD_ROOT, name))
        and (name in WHDLOAD_GOLDBOX_FOLDERS or name in WHDLOAD_LOCALIZATION_DUPES)
    }
    assert on_disk == WHDLOAD_GOLDBOX_FOLDERS | WHDLOAD_LOCALIZATION_DUPES
    assert len(WHDLOAD_GOLDBOX_FOLDERS) == 10
    assert len(WHDLOAD_LOCALIZATION_DUPES) == 3


def test_unmanifested_whdload_titles_equal_the_pinned_set_exactly():
    _require_whdload()
    manifests = _load_manifests()
    manifested_titles = {
        folder for folder, manifest_id in MANIFESTED_AMIGA_TITLES.items()
        if manifest_id in manifests and manifests[manifest_id].get("platform") == "Amiga"
    }
    # Every claimed "already manifested" title really does have an Amiga manifest on disk --
    # if Phase B ever lands the champions/death-knights/buck manifests differently, this must
    # still hold, or MANIFESTED_AMIGA_TITLES is stale.
    assert manifested_titles == set(MANIFESTED_AMIGA_TITLES)

    unmanifested = WHDLOAD_GOLDBOX_FOLDERS - manifested_titles
    assert unmanifested == KNOWN_UNMANIFESTED
    # Round 32 Phase B: this is now 0. Stating it positively as well, because "the gap set is
    # empty" is a claim that can pass vacuously if WHDLOAD_GOLDBOX_FOLDERS itself ever went
    # empty or got mis-globbed -- pin the covered count against the canonical ten instead.
    assert len(unmanifested) == 0
    assert manifested_titles == WHDLOAD_GOLDBOX_FOLDERS
    assert len(manifested_titles) == len(WHDLOAD_GOLDBOX_FOLDERS) == 10


def test_a_fake_folder_in_known_unmanifested_is_rejected():
    """Mutation: KNOWN_UNMANIFESTED must not tolerate an entry that isn't a real WHDLoad folder."""
    fake = "KNOWN_UNMANIFESTED contains a folder name not present in WHDLOAD_GOLDBOX_FOLDERS"
    bogus = KNOWN_UNMANIFESTED | {"NotARealGoldBoxTitle"}
    assert not bogus.issubset(WHDLOAD_GOLDBOX_FOLDERS), fake
    # And the reverse: every real entry of KNOWN_UNMANIFESTED IS one of the ten canonical folders.
    assert KNOWN_UNMANIFESTED.issubset(WHDLOAD_GOLDBOX_FOLDERS)


def test_every_manifest_pointing_into_the_whdload_pack_points_at_an_existing_folder():
    """Reverse check: a manifest whose file paths name a WHDLoad folder must name a real one."""
    manifests = _load_manifests()
    referenced_folders = set()
    normalized_root = WHDLOAD_ROOT.replace("\\", "/")
    for manifest_id, data in manifests.items():
        for entry in data.get("files", []):
            path = str(entry.get("path", "")).replace("\\", "/")
            if normalized_root not in path and "WHDLoad Collection/Games-WHDLoad/unpacked" not in path:
                continue
            # Path shape: .../unpacked/<Folder>/data/...
            marker = "unpacked/"
            idx = path.find(marker)
            assert idx != -1, "%s: WHDLoad-shaped path with no unpacked/ marker: %s" % (manifest_id, path)
            rest = path[idx + len(marker):]
            folder = rest.split("/", 1)[0]
            referenced_folders.add((manifest_id, folder))

    if not referenced_folders:
        # Buck's manifest is the only current WHDLoad-sourced one; if manifests change shape
        # such that none reference the pack, this becomes vacuous -- flag it rather than pass
        # silently, since the plan expects at least buck-rogers-amiga to reference it.
        pytest.skip("no manifest currently references the WHDLoad pack by path")

    if os.path.isdir(WHDLOAD_ROOT):
        for manifest_id, folder in referenced_folders:
            full = os.path.join(WHDLOAD_ROOT, folder)
            assert os.path.isdir(full), "%s references missing WHDLoad folder %r" % (manifest_id, folder)
    else:
        pytest.skip("absent (never-vendored Amiga WHDLoad source) -- path shapes checked, existence not")


def test_every_manifest_pointing_into_the_whdload_pack_referencing_a_missing_folder_would_fail():
    """Mutation: a manifest pointing at a folder that does not exist must be caught, not silently pass."""
    _require_whdload()
    fake_folder = os.path.join(WHDLOAD_ROOT, "ThisGoldBoxTitleDoesNotExist")
    assert not os.path.isdir(fake_folder)
