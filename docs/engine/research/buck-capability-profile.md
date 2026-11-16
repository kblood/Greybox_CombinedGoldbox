# Buck Rogers: Countdown to Doomsday — audited capability-ledger profile (R1, round 29)

**Status.** This is a **Phase A research artifact**, not a landed ledger entry. Applying the fenced
JSON block below to `tools/goldbox_capabilities.json` (and the paired edits to
`tools/test_goldbox_corpus.py`'s pinned evidence-reference count and area list) is Phase B work,
owned by the round lead — this document supplies the exact text and the exact measured numbers
needed to do that landing without re-deriving anything.

## Why this exists

`tools/goldbox_capabilities.json` carries 11 profiles (measured: `len(load_capabilities())` on
`a63efc6`); `PROFILES` in `tools/goldbox_corpus.py` carries 13 entries, of which 12 have a
`manifest` field. Buck Rogers: Countdown to Doomsday is one of those 12 and has no ledger entry.
`validate_capability_contract(None)` degrades to `{"declared": False, "status": "missing", ...}`
instead of raising, so nothing failed. `tools/test_capability_ledger_coverage.py` (new this round)
is the standing gate that would now catch this — see that file's docstring.

A twelfth profile was drafted in a prior round's subagent transcript and reported in
`docs/engine/HANDOFF.md`'s twenty-eighth entry as "audited, not applied." **It was not actually in
the repository anywhere** — only its prose description survived. The JSON below was therefore
reconstructed from that description and independently re-verified against the current tree
(`a63efc6`), not copied from a file that turned out not to exist.

## Claim-by-claim audit

Every number and path below was re-measured on `a63efc6`, not trusted from the prior round's prose.
Commands are given so a reader can reproduce each one.

| Claim in the drafted profile | Verdict | How measured |
|---|---|---|
| 5 real player careers (warrior, rogue, medic, engineer, rocketJock) map onto addnd1e classes | **Holds exactly.** `BUCK_ROGERS_CAREERS` in `packages/engine/src/ruleset/buckrogers/index.ts` has exactly the 5 keys `rocketJock, warrior, engineer, rogue, medic` mapped to `ranger, fighter, magicUser, thief, cleric`. | `grep -n BUCK_ROGERS_CAREERS -A6 packages/engine/src/ruleset/buckrogers/index.ts` |
| `buckrogers` ruleset resolves via `defaultRulesets().resolve('buckrogers') = [addnd1e, buckrogers]`, no gameplay route instantiates it | **Holds.** `buckrogers` extends `addnd1e.id`; `grep -rn buckrogers apps/web/src/ui/main.ts apps/web/src/ui/explore.ts apps/web/games/*.json` returns **zero** matches — no route or manifest names the ruleset. | grep above; `packages/engine/test/buckrogers.test.ts` exists and is the only consumer |
| ECL_GEN1_BUCK: headerLen 22, vbase 0x7ffe, 7 override opcodes 0x0c/0x1d/0x22/0x23/0x27/0x3f/0x40 | **Holds.** `ECL_GEN1_BUCK` is exported at `packages/engine/src/ecl/disassemble.ts:351`; the override set is pinned and exercised in `packages/engine/test/buckEclDialect.test.ts`. | `grep -n "ECL_GEN1_BUCK" packages/engine/src/ecl/disassemble.ts` |
| 25 retail blocks, 18 clean EXIT, 7 desync, 0 ran-off-end | **SUPERSEDED SAME ROUND by R6 — now 21 clean EXIT / 4 desync.** It held when audited (the pin then read `{desync: 7, cleanExit: 18, ranOffEnd: 0}`), and R6 moved it within the same round by attributing 6 of the 7 sites to dispatcher opcode `0x4c` at `GAME.OVR:0x363b`. The profile text below carries R6's landed numbers, not these. Original audit note: `buckEclDialect.test.ts`'s `census()` test pins `{desync: 7, cleanExit: 18, ranOffEnd: 0}` over a corpus asserted to be exactly 25 blocks. The full desync list is `ecl1.dax#17@0x1c, ecl1.dax#18@0x72, ecl4.dax#64@0x1d, ecl5.dax#80@0x1d, ecl6.dax#94@0x50, ecl6.dax#95@0x9c3, ecl6.dax#99@0x5e` — the last two are NOT in the test file's own `desyncSample` (capped at 5 entries) and are reproduced here from the HANDOFF/plan carry-forward note, since this file's own corpus run agrees with the 7-count but the sample array literal only lists 5. | `npx vitest run packages/engine/test/buckEclDialect.test.ts` (inside `packages/engine`) |
| None of the 7 override opcodes is reached by the 25-block corpus | **SUPERSEDED SAME ROUND by R6 — now FALSE.** It held when audited. R6's closure of `0x4c` resynced blocks that had previously desynced before reaching them, and the pin now reads `0x0c: 2` (plus `0x21: 6`), every other watched override still 0. So the override table now has a partial corpus cross-check where it had none. | same test file, `reachCounts(..., [...OVERRIDE_OPCODES, 0x21])` case |
| `?ecl=buck` opens `ecl2.dax#32-35`, e2e case `ecl-buck` pins first-instruction `0x8014` and an 8-instruction clean EXIT | **Holds exactly.** `apps/web/src/ui/eclInspector.ts`'s `buck` config: `blockIds: [32, 33, 34, 35]`. `e2e.mjs`'s `runEclInspectorBuck` asserts `firstAddr === 0x8014` and `lines >= 8` with an `EXIT` row present. | `grep -n "blockIds" apps/web/src/ui/eclInspector.ts`; `sed -n '12790,12840p' apps/web/test/e2e.mjs` |
| 489 frames (DOS) / 454 frames (Amiga) | **Holds exactly, read from the e2e pins not prose.** `runBuckRogersView`'s `const TOTAL = 489` and `runBuckRogersAmigaView`'s `const TOTAL = 454`. | `grep -n "const TOTAL = " apps/web/test/e2e.mjs` around lines 516 and 614 |
| 8X8D1 font sheet decoded but unreachable in the whole-game dashboard | **Holds, and the e2e file's own comment says so.** `runBuckRogersView`'s `EXPECT` row for `8X8D1` is `frames: 2`, with an inline comment explaining `loadGame.ts` deliberately excludes `kind: 'font'` blocks from this dashboard, and noting a *previous* round's plan expected `2->3`/`489->490` and was wrong. | `sed -n '505,516p' apps/web/test/e2e.mjs` |
| "35 blocks x 3 view distances" for DOS SPRIT1..6 | **Holds.** `dax-vga-compressed-picture.test.ts`'s `SPRIT_CORPUS` entry for Buck Rogers: `blocks: 35`; the module docblock in `daxVgaCompressedPicture.ts` states "35 `SPRIT` x3 = 105" frames. | `packages/engine/test/dax-vga-compressed-picture.test.ts:9`; `packages/engine/src/loaders/daxVgaCompressedPicture.ts` docblock |
| "8.81%" of Buck's non-transparent SPRIT pixels render white | **Sourced, but not standing-test-pinned — disclosed as such.** The number appears in two independently-written places: the Buck DOS manifest's own SPRIT1 note (`apps/web/games/buck-rogers-countdown-to-doomsday.json`) and the `daxVgaCompressedPicture.ts` module docblock. Neither is a numeric assertion in a test file — `dax-vga-compressed-picture.test.ts` has no percentage assertion for Buck. An independent re-derivation this round (scratch vitest run against the shipped `decodeDax`/`vga-compressed-picture` path, deleted, not committed) measured the padded-window (index 32..175) fraction of pixels across all 35 Buck SPRIT blocks x 3 frames three ways: 0.60% of ALL pixels, 8.53% of pixels with index != 0, 8.96% of pixels with index >= 32. None hits 8.81% exactly, but two bracket it closely, confirming the order of magnitude and the qualitative claim (a low-single-digit-percent gap) without pinning the exact "non-transparent" definition the original 8.81% used. **Kept in the profile, with this caveat added to the gap text**, per the instruction to drop the number only if no source at all could be found — a source (two of them) was found. | manifest + docblock greps above; scratch measurement not committed (see this file's own git status) |
| "9-block MUSIC.DAX" | **Holds exactly.** Manifest MUSIC row: `"note": "9 blocks. No Gen1 DOS music player is wired up."` | `apps/web/games/buck-rogers-countdown-to-doomsday.json` |
| SPACETVL exists as a manifest row | **Holds, Amiga-only — the DOS install genuinely has no SPACETVL.DAX.** `ls "D:/.../BuckRogersCountdownDday-...-DOS.../"` has no `spacetvl.dax`; `apps/web/games/buck-rogers-amiga.json` has a `spacetvl.daa` row (`"label": "SPACETVL (space travel backdrop)"`). The drafted `wilderness` sentence "SHIPS/SPACETVL/MARSCOM/VENUSCOM assets exist only as raw catalogued pictures" is about the profile's combined DOS+Amiga asset coverage (the profile covers both manifests, per the `graphics` area text), so citing an Amiga-only asset there is accurate, not an error. | `ls "{external-game-holdings}/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/"` (no spacetvl); `apps/web/games/buck-rogers-amiga.json` (has it) |
| `retail_save.import`/`export` cite `apps/web/test/e2e.mjs` as evidence of an importer that does not exist | **Confirmed wrong, corrected.** No `?import=buck` route, no Buck save importer/exporter source file, and no e2e case exercises one — `apps/web/test/e2e.mjs` contains zero Buck-save-related cases. **Fixed in the profile below**: both directions now cite this research document instead (the pattern `pool-of-radiance` and `secret-of-the-silver-blades` already use for the same "unsupported, no format identified" shape — a single research-doc citation, no manifest, no e2e.mjs). | `grep -n "buck.*save\|save.*buck" apps/web/test/e2e.mjs` (no hits) |
| Two full manifests reachable from the Library picker (`gameview.ts` `GAME_IDS`) | **Holds.** `gameview.ts:189-190` lists both `buck-rogers-countdown-to-doomsday` and `buck-rogers-amiga`. | `grep -n "buck-rogers" apps/web/src/ui/gameview.ts` |

### A number the plan itself got wrong — reported, not silently corrected

The plan's own prediction text says the drafted profile adds **16** evidence citations (58 → 74)
and that the ledger's area-level evidence list gains exactly `["audio", "ecl", "graphics"]` (three
single entries) alongside the pre-existing four `"towns"` entries.

**Both are wrong, measured against the drafted JSON itself** — before any audit correction was even
applied. Counting the arrays in the verbatim draft (the plan's own fenced block, reproduced at
`PLAN-ROUND-29.md:141-248`) gives **19** evidence citations, not 16:

| area | evidence array length in the draft |
|---|---|
| `ruleset` | 2 |
| `ecl` | 6 |
| `map_container` | 1 |
| `graphics` | 5 |
| `audio` | 1 |
| `retail_save.import` | 2 |
| `retail_save.export` | 2 |
| **total** | **19** |

`test_capability_evidence_paths_resolve`'s `cited` list is one row **per evidence string**, not one
row per area, so an area with N evidence items contributes N rows to the sorted area-name list —
the plan's list of three bare area names (`"audio", "ecl", "graphics"`) only makes sense if every
new area contributed exactly one row, which none of them do (`ecl` alone contributes 6, `graphics`
5). This is reported per the project's "the bytes win" rule rather than silently reshaping the
profile to fit the plan's number.

After the audit corrections in this document (drop `e2e.mjs` from both `retail_save` directions,
replace it with this research doc; add two evidence files to `graphics` — the loader module and its
test, which are the actual producing code for the "35 blocks x 3" and "8.81%" claims), the corrected
profile's evidence count is **also 19** (the two changes cancel: −1 −1 on `retail_save`, +2 on
`graphics`). So Phase B's real number is:

- **Total cited evidence references: 58 → 77** (not 74).
- **New area-level rows** (evidence cited directly on a capability, not nested under
  `import`/`export`): `ruleset` ×2, `ecl` ×6, `map_container` ×1, `graphics` ×7, `audio` ×1 — 17 new
  rows across **5** distinct areas, not the predicted 3. Combined with the pre-existing `["towns"] *
  4`, the full sorted area-name list Phase B must pin is 21 entries long:
  `["audio"] + ["ecl"]*6 + ["graphics"]*7 + ["map_container"] + ["ruleset"]*2 + ["towns"]*4`.

Phase B's edit to `tools/test_goldbox_corpus.py:1806` and the assertion immediately below it must
use **77** and this 21-entry list, not the plan's 74 / 7-entry prediction.

## Independent re-measurement of the current ledger (ground truth, not from prose)

```
$ python3 -c "... walk tools/goldbox_capabilities.json, replicate test_capability_evidence_paths_resolve's cited-list logic ..."
total cited: 58
area-level count: 4
area-level areas: ['towns']
nested count: 54
nested breakdown: {'retail_save.import': 30, 'retail_save.export': 24}
profiles with retail_save nested evidence: 11
```

This also corrects a HANDOFF.md aside ("51 of those sit under retail_save.import/export across 12
profiles") — the real, present-tense split on `a63efc6` is **54** nested references across **11**
profiles, not 51 across 12; the HANDOFF prose is stale narrative, not a live pin (nothing tests it).

## The corrected, audited profile

Differences from the verbatim draft in `PLAN-ROUND-29.md`, applied here:

1. `retail_save.import.evidence` and `retail_save.export.evidence`: `apps/web/test/e2e.mjs` removed
   (it evidences nothing — no importer/exporter exists); each now cites only this document, matching
   the `pool-of-radiance` / `secret-of-the-silver-blades` precedent for the same claim shape.
2. `graphics.evidence`: two items added — `packages/engine/src/loaders/daxVgaCompressedPicture.ts`
   and `packages/engine/test/dax-vga-compressed-picture.test.ts` — the actual producing code/test
   for the "35 blocks x 3 view distances" and the SPRIT palette-gap claims, which the draft cited
   only indirectly through the manifest.
3. `graphics.gaps`: the SPRIT-palette bullet gains one clause disclosing that 8.81% is a documented
   but not standing-test-pinned figure, with the bracketing re-derivation noted above.

Everything else is reproduced verbatim from the drafted text (re-verified true above), The
ECL desync/override counts were flagged as provisional pending R6, and R6 did move them: the
profile JSON below is reconciled to R6's landed pin (`{desync: 4, cleanExit: 21, ranOffEnd: 0}`, 8
word-set overrides, 11 opcode extensions) in Phase B step 1. The two audit rows above keep their
supersession noted rather than being rewritten, so the sequence stays legible.

```json
{
  "profile_id": "buck-rogers-countdown-to-doomsday",
  "capabilities": {
    "ruleset": {
      "status": "partial",
      "detail": "packages/engine/src/ruleset/buckrogers/index.ts defines a buckrogers ruleset that extends addnd1e with a naming/approximation layer only: BUCK_ROGERS_CAREERS maps Buck's 5 real player careers (warrior, rogue, medic, engineer, rocketJock) onto existing 1e classes (fighter, thief, cleric, magicUser, ranger). Ability modifiers, XP tables, and THAC0 are the unmodified addnd1e originals, and the ruleset resolves through the default registry (defaultRulesets().resolve('buckrogers') = [addnd1e, buckrogers]).",
      "evidence": [
        "packages/engine/src/ruleset/buckrogers/index.ts",
        "packages/engine/test/buckrogers.test.ts"
      ],
      "gaps": [
        "No Buck Rogers XXVc-specific combat, weapon, vehicle, or XP math exists; every mechanical number used is the AD&D 1e original, not a science-fiction rule.",
        "No gameplay route ever instantiates a character on this ruleset; it is exercised only by its own unit tests, not by exploration, combat, or import."
      ]
    },
    "ecl": {
      "status": "partial",
      "detail": "ECL_GEN1_BUCK (headerLen 22, vbase 0x7ffe, 8 word-set overrides at opcodes 0x0c/0x1d/0x22/0x23/0x27/0x3c/0x3f/0x40, plus 11 opcode-table extensions at 0x41 and 0x43..0x4c that Gen1's 0x00-0x40 ceiling has no entry for) was derived from Buck's own retail GAME.OVR dispatcher and operand parser by tools/map_buck_ecl_dispatch.py (docs/engine/research/buck-ecl-dispatch-map.md), not borrowed from a sibling title's dialect. Every operand count is read from its handler's own prefetch (mov al,N; push ax; lcall 0xb8,0x2a), NOT fitted to make the corpus decode: for both swept opcodes the corpus actively prefers a different value than the binary states, and the binary was taken anyway (0x4c binary=2 yields 4 desyncs where corpus-best 0 yields 1; 0x43 binary=1 is tied for the worst value swept). Measured against Buck's own 25 retail blocks across ecl1..ecl6.dax (packages/engine/test/buckEclDialect.test.ts): 21 disassemble to a clean terminating EXIT and 4 desync (ecl1#17@0xec, ecl1#18@0x395, ecl6#94@0x50, ecl6#99@0x2c0). A single-step browser inspector (?ecl=buck, documented in docs.ts) opens ecl2.dax#32-35 under this dialect; e2e case ecl-buck pins the dialect-dependent first-instruction address (0x8014) and an 8-instruction clean EXIT.",
      "evidence": [
        "packages/engine/src/ecl/disassemble.ts",
        "packages/engine/test/buckEclDialect.test.ts",
        "tools/map_buck_ecl_dispatch.py",
        "docs/engine/research/buck-ecl-dispatch-map.md",
        "apps/web/src/ui/eclInspector.ts",
        "apps/web/test/e2e.mjs"
      ],
      "gaps": [
        "4 of 25 retail blocks still desync under this dialect (down from 7 within round 29 by R6's attribution of opcode 0x4c); that is a real, uncorrected gap in the reconstruction, not a rendering issue. Two of the four are explicitly UNATTRIBUTED rather than explained: ecl6#94@0x50 and ecl6#99@0x2c0 both stop at byte 0x80, whose handler calls an unidentified far routine.",
        "The corpus cross-check of the override table is partial at best: of the watched overrides only 0x0c is reached (twice), every other one zero times, so most of the table's correctness still rests entirely on the binary dispatcher map. Eleven extension opcodes carry uncertain: true, and 0x42 and 0x2c PARLAY were disassembled and left deliberately unmeasured because their handlers call far routines this pass could not identify.",
        "No gameplay route ever executes Buck ECL against a live game state (no ?explore= route, no GEO map, no combat or dialogue outcome); the only consumer is the standalone single-step inspector."
      ]
    },
    "map_container": {
      "status": "unsupported",
      "detail": "Buck's own GEO1, ECL1, WALLDEF1, MON0CHA/MON0ITM/MON0SPC, and ITEM0 DAX archives are catalogued in the asset manifest with decode:false and no route mounts a legal Buck dungeon or overland walk. The manifest's own notes on these rows state explicitly that no Buck route is claimed in the campaign matrix.",
      "evidence": ["apps/web/games/buck-rogers-countdown-to-doomsday.json"],
      "gaps": [
        "GEO/WALLDEF/monster/item container layouts for Buck have not been reverse-engineered or wired to any exploration or combat surface.",
        "The 25-block ECL corpus is disassembled (see ecl above) but never executed against a GEO map or live game state."
      ]
    },
    "graphics": {
      "status": "partial",
      "detail": "Two full asset manifests are shipped and reachable from the Library game picker (apps/web/src/ui/gameview.ts GAME_IDS): buck-rogers-countdown-to-doomsday (DOS VGA, 489 frames across TITLE/PIC/CHARS/COMSPR/SPRIT/MARSCOM/VENUSCOM/HITEK/LOTEK/SHIPS/8X8D1, pinned by e2e case buck-rogers-view) and buck-rogers-amiga (WHDLoad Amiga dump, 454 frames across the equivalent DAA families, pinned by e2e case buck-rogers-amiga-view). Both decode with the SAME unmodified DAX/DAA decoders already shipped for CoK/DoK; no new decoder was written for either platform, and TS decodeDaa pixel-parity with the Python reference decoder is proven on 3 real Amiga blocks (packages/engine/test/buckAmigaArt.test.ts).",
      "evidence": [
        "apps/web/games/buck-rogers-countdown-to-doomsday.json",
        "apps/web/games/buck-rogers-amiga.json",
        "apps/web/src/ui/gameview.ts",
        "apps/web/test/e2e.mjs",
        "packages/engine/test/buckAmigaArt.test.ts",
        "packages/engine/src/loaders/daxVgaCompressedPicture.ts",
        "packages/engine/test/dax-vga-compressed-picture.test.ts"
      ],
      "gaps": [
        "This is asset-browser-level graphics only: no exploration, town, wilderness, or combat screen composites this art in a live route.",
        "DOS SPRIT1..6 (35 blocks x 3 view distances) are missing their entire 32..175 palette range; both the manifest's own note and the loader's module docblock report 8.81% of non-transparent pixels rendering as flat white placeholder, and no in-file colour source exists anywhere in Buck's own DAX corpus to recover them. That 8.81% figure is documented in two independent places but is not asserted by any standing test; an independent re-derivation this round bracketed it at 8.53%-8.96% under two plausible 'non-transparent' definitions, confirming the order of magnitude without pinning the exact original formula.",
        "The DOS 8X8D1.DAX block-201 text font is decoded (packages/engine/test/gen1Font.test.ts) but, like every Gen1 title, is deliberately excluded from the whole-game GraphicSet dashboard and, unlike Champions of Krynn's cok-8x8d1 precedent, has no single-asset catalog entry of its own, so it is unreachable in the UI.",
        "Amiga SHIPS.daa is not cross-mapped block-for-block against the DOS SHIPS.dax; only block-id overlap is noted, not identity."
      ]
    },
    "audio": {
      "status": "unsupported",
      "detail": "The DOS install ships a 9-block MUSIC.DAX archive, catalogued in the manifest with decode:false and the explicit note that no Gen1 DOS music player is wired up. No decoder, player, or sequencing exists for Buck audio, and no browser route offers it.",
      "evidence": ["apps/web/games/buck-rogers-countdown-to-doomsday.json"],
      "gaps": ["MUSIC.DAX is uncatalogued beyond its block count; no decoder, mapping, or playback path exists."]
    },
    "retail_save": {
      "status": "unsupported",
      "detail": "Buck's own save-game format has not been identified, located, or decoded anywhere in this repo, and no importer or exporter is shipped.",
      "gaps": ["There is no bidirectional or one-way bridge to any Buck save/campaign file, and the file format itself is unrecovered."],
      "import": {
        "status": "unsupported",
        "scope": "No selected-folder or bundled Buck Rogers retail character, party, or campaign-save importer exists.",
        "evidence": ["docs/engine/research/buck-capability-profile.md"],
        "gaps": ["Buck's save file format has not even been identified, let alone mapped into an importer."]
      },
      "export": {
        "status": "unsupported",
        "scope": "No Greybox session-to-Buck retail save exporter exists.",
        "evidence": ["docs/engine/research/buck-capability-profile.md"],
        "gaps": ["No retail-compatible Buck save encoder or format understanding exists."]
      }
    },
    "towns": {
      "status": "unsupported",
      "detail": "No Buck GEO block has been identified as a town/station, and no route mounts one.",
      "gaps": ["Town-equivalent structures (space stations, bases) have not been located in Buck's own GEO/ECL corpus."]
    },
    "wilderness": {
      "status": "unsupported",
      "detail": "No overland/travel layer is implemented for Buck; SHIPS/SPACETVL/MARSCOM/VENUSCOM assets exist only as raw catalogued pictures, not as a live travel controller.",
      "gaps": ["No travel-time progression, encounter cadence, or transition handling exists for Buck's space/planet travel model."]
    },
    "quests": {
      "status": "unsupported",
      "detail": "No cross-block quest-flag relationship has been identified in Buck's ECL corpus; the 25-block disassembly (see ecl above) has not been searched for writer/reader pairs the way Gateway, Pools, Treasures, and NWN were.",
      "gaps": ["No quest graph or flag census exists for Buck at any level, engine or browser."]
    },
    "companion": {
      "status": "unsupported",
      "detail": "No Buck-specific Gold Box Companion route exists. The Electron selected-folder acceptances cover Secret and Treasures only.",
      "gaps": [
        "No Buck Electron selected-folder route is shipped or tested.",
        "Companion databases and journal semantics are not populated for Buck campaign state."
      ]
    }
  }
}
```

## What the scratch validator (not committed) reported

`goldbox_corpus.validate_capability_contract(profile)` on the JSON above: **`verified-contract`**,
zero `failed_checks`. All 19 evidence paths in the profile resolve as real files (verified with
`(REPO_ROOT / ref).is_file()`, matching `_capability_evidence_paths_resolve`'s own predicate).

With the ledger monkeypatched in memory (11 existing profiles + this one, 12 total; the real
`tools/goldbox_capabilities.json` on disk was never written to) and `goldbox_corpus.py`'s full
`--strict` generation path run with `--json`/`--markdown`/`--support-json` all redirected into a
scratch directory:

- Buck's derived `web_level` **did not change from `preview`** — matches the plan's prediction, and
  for the reason the plan gives: `evidence_level()` derives the web level from `route`/`manifest`/
  `binary` status only; capability-ledger status affects the level solely at the `verified` tier
  (via `game.get("capabilities", {}).get("status")`), which requires `route.status ==
  "verified-byte-contract"` first. Buck has no declared route (`route.declared == False`), so it
  cannot reach that branch regardless of what the ledger says.
- **Corrected against measurement** (an earlier draft of this document speculated the checked-in
  artifact was already stale for unrelated reasons; that was wrong and is retracted here — the
  bytes below are what actually ran). Regenerating `support-evidence.json` from a from-scratch
  `build_corpus()` run **without** the Buck monkeypatch, using the real on-disk ledger, produces
  **byte-for-byte the same content** as the checked-in
  `apps/web/src/generated/support-evidence.json` (0 changed lines in a `difflib.unified_diff`) — the
  checked-in artifact is current on `a63efc6`, not stale. Regenerating **with** the Buck profile
  monkeypatched into the in-memory ledger then produces a **161-line diff** against that same
  baseline. That 161-line slice is entirely and exactly attributable to landing this profile: it
  replaces Buck's `"capabilities"` object (previously
  `{"declared": false, "status": "missing", "checks": {}, "failed_checks": ["declaration"]}`) with
  the full `verified-contract` object (all `capabilities`/`capabilities.checks` fields for the 10
  areas plus the two `retail_save` directions), **and** changes Buck's `gaps` array from
  `["retail-route-not-declared"]` to
  `["retail-route-not-declared", "retail-save-import-unsupported", "retail-save-export-unsupported"]`
  — `game_gaps()` only reads `capabilities.capabilities.retail_save.{import,export}.status` once
  the ledger entry exists at all, so landing the profile is what turns those two gap tags on. No
  other field on Buck's game record changes.

## For Phase B (verbatim text, not applied here)

- `tools/goldbox_capabilities.json`: the 11 existing profiles are **not** in alphabetical or
  `PROFILES`-declaration order (measured order: `champions-of-krynn, death-knights-of-krynn,
  pool-of-radiance, curse-of-the-azure-bonds, treasures-of-the-savage-frontier,
  gateway-to-the-savage-frontier, pools-of-darkness, neverwinter-nights-dos, dark-queen-of-krynn,
  forgotten-realms-unlimited-adventures, secret-of-the-silver-blades`). Simplest, lowest-risk
  insertion: append the profile JSON above as the 12th and last array element, directly after
  `secret-of-the-silver-blades`'s closing brace — sliced-and-anchored per this file's own hand-format
  convention (`CLAUDE.md`: never a `json.dumps` round-trip on this file).
- `tools/test_goldbox_corpus.py:1806`: change `self.assertEqual(len(cited), 58)` to
  `self.assertEqual(len(cited), 77)`.
- The assertion immediately below it (`:1811-1814` in the plan's citation, `["towns"] * 4`): replace
  with the 21-entry sorted list derived above:
  `["audio"] + ["ecl"] * 6 + ["graphics"] * 7 + ["map_container"] + ["ruleset"] * 2 + ["towns"] * 4`.
  Update the adjoining comment (currently describing "51... across 12 profiles... the remaining 4
  are the only area-level citation") to describe the real post-Buck shape: 5 distinct areas now
  carry area-level evidence (`ruleset`, `ecl`, `map_container`, `graphics`, `audio` — all from this
  one profile — plus the pre-existing `towns` from Treasures), not "the only area-level citation."
- `apps/web/src/ui/supportClaims.json`: Buck's `profile_id` already exists there
  (`test_support_claims_cover_PROFILES`, this round's new test, is green on the current file) —
  confirm no change is needed there; this profile does not move Buck's `web_level`.
- `tools/test_capability_ledger_coverage.py`'s `KNOWN_MISSING` set must be emptied to `set()` once
  the ledger profile lands, or `test_ledger_profiles_match_PROFILES` goes red by design (this is the
  intended coupling — see that test's docstring).
