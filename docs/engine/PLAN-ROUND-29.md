# Round 29 plan — after the twenty-eighth handoff entry (branch `greybox`, base `a63efc6`)

Planning only. Six parallel work items for separate Sonnet implementers on **one shared working
tree**, then a serialized single-writer tail for the files they would otherwise fight over. Every
item is provable from bytes already on disk (repo + the five documented source locations) and the
existing gates; none needs DOSBox-X, GameLink, an emulator, hardware or the user. Nothing here
re-plans the two genuinely trace-blocked items (seg051 RNG, the DQK ECL opcode table).

The shape of this round: **four of the six items close a disclosed gap or falsify a claim the
last entry reported as settled**, one lands a standing test where a one-time measurement stood,
and one attacks the only numbered gap left in a shipped dialect. No item adds a browser route.
The full e2e total is therefore expected to stay at **172** — two existing cases are strengthened,
none are added — and that is stated here so a "172/172" in the next handoff is read as the plan
and not as a miss.

## What the carried-forward list looked like against the bytes

Every item was verified before it was planned. Three of the six carried-forward statements were
wrong or stale in a way that changes the brief:

| carried forward | measured on `a63efc6` |
|---|---|
| Buck has no ledger profile; landing it needs two test edits near `tools/test_goldbox_corpus.py:1806` | **Holds.** 11 `profile_id`s, no Buck. Pin is `self.assertEqual(len(cited), 58)` at **:1806** (not 55 — the last round moved it) and `["towns"] * 4` at **:1811-1814**. The comment at :1807 says "across 12 profiles"; there are 11. The "drafted 12th profile" is **not in the repo** — it exists only in a subagent transcript, so it is reproduced verbatim under R1. |
| `?import=dqk` / `?import=dok` absent from `docs.ts` | **Holds, and is the small end of it.** `docs.ts` is a typed `DEMOS: Demo[]` (90 entries, `flag: '?k=v'`) with an unread `window.__docs.demoFlags()` seam. Also undocumented: 11 of 15 `?game=` manifest ids (both Buck manifests included) and `?explore=cok-natural-6`, `?explore=gateway-quest`, `?explore=secret-natural-4`. No test anywhere compares handled routes to documented ones. |
| `describeProvenance`'s "mixed" branch has engine-level coverage only, no browser exemplar | **False both ways.** `packages/engine/test/dungeonWallGraphicSet.test.ts` contains **no** `'mixed'` case (the only `mixed` mentions in the engine suite are comments). And `?explore=pools`, `pools-natural`, `pools-town` and `?explore=gateway-amiga` mount an Amiga GLIB set that covers symbol sets 1..3 only (`explore.ts:3685-3687`, `3719-3721`: sets 0/4 "simply keep the DOS art"), so their badges must already read `art: mixed — …`. The two e2e probes there (`e2e.mjs:9935`, `:10004`) assert only `!provenance`. |
| CoAB cross-title null is a one-time measurement | **Holds.** Only at `original-save-import-export-status.md:350` and the ledger gap text (`goldbox_capabilities.json:271`), which itself says "NOT a standing test". Secret's six 439-byte `CHRDATA*.SAV` are in the **install root** (its `SAVE\` is empty); Pools 6 × 510 B; Treasures 8 × 510 B. |
| Buck's 7 desyncs, 18/25 clean, pinned in `buckEclDialect.test.ts` | **Holds.** `:104` pins 25 blocks; `:116-127` pins `{desync: 7, cleanExit: 18, ranOffEnd: 0}` but the `desyncSample` is **capped at 5** (`:78`), so `ecl6#95@0x9c3` and `ecl6#99@0x5e` are pinned nowhere in the repo. The dispatch map lists 18 handlers as "Unmeasured" and 12 beyond CoAB's 0x40 — no desync has been attributed to any of them. |
| `eclInspector.ts` says "17 of 24" | **Already fixed** — `:71` reads 18 of 25 and `:78` is the retraction note. Dropped. |

Ground rules carried from `CLAUDE.md`, `PLAN-NEXT-ROUND-2026-09-03.md` and the twenty-eighth entry:

- A probe that cannot fail is not evidence: every new test/e2e assertion must be **seen red** under
  the named mutation, then restored. The report names the mutation and the red output.
- The null must test the **alternatives**, not just the predecessor. Every claimed signal states
  the null and the number it produced next to the real number.
- A decoder nothing calls is not shipped. No item here adds an engine export; R5 is the one that
  reaches engine code, and it only pins existing exports through the path `explore.ts` already takes.
- Correcting a claim without correcting its check leaves the check stale: every ledger, doc or
  comment edit lands with the `tools/test_goldbox_corpus.py` (or other) edit that checks it, in
  the same Phase B step.
- Numbers in disclosures need a null too: every count in a report says which code path computed it.
- Agents **do not commit and do not deploy**. Each reports the exact file list, the mutation it
  watched fail, and the numbers. The lead commits one coherent commit per item with
  **`git commit -- <paths>`** (never a bare `git commit` on the shared tree).
- Hard constraints stated in every brief: game-data folders and the external sources (`D:\...`,
  `C:\Program Files (x86)\GOG Galaxy\Games\`) are **read-only, never vendored, never rewritten**;
  **never patch original EXEs on disk**; no DOSBox-X automation is planned, and if any agent thinks
  it needs one it stops and reports (if it were ever used, only the focusless GameLink protocol via
  `tools/dosbox_gamelink.py`, never SendKeys/SetForegroundWindow/SendInput).
- `tools/goldbox_capabilities.json` is **hand-formatted** (raw UTF-8, single-element arrays inline).
  A `json.dumps` round-trip rewrites the whole file (339- and 296-line diffs, both reverted). Edit
  it by anchored text replacement **sliced to the target profile first**. Phase B only.
- `apps/web/src/ui/*.ts` docblocks must **not** contain quoted game-data path literals —
  `scripts/bundle-assets.mjs` cannot tell a comment from a call site. `pnpm build:app` must stay at
  exactly its two documented tolerated warnings.
- Any e2e edit registers new cases in **three** places in `apps/web/test/e2e.mjs` (the
  `const runners = new Map([` registry at :16390, the awaited list in `main()`, and the single
  `results.unshift(...)` at :16709) and gives the case the registry key as its `id`. This round
  plans **no new case**. Do not move or rename the `const runners = new Map([` declaration —
  `tools/goldbox_corpus.py:_js_focused_block_lines` anchors on it and `test_goldbox_corpus.py` fails
  by design if it moves.

Standing gates (run from repo root):

```powershell
pnpm --filter @goldbox/engine test
pnpm test:corpus                       # python -m pytest tools/ -q — 1231 collected on a63efc6
pnpm -r exec tsc --noEmit
pnpm build:app
$env:GB_E2E_ONLY='<case-id>'; pnpm --filter @goldbox/web e2e     # scoped iteration only
pnpm --filter @goldbox/web e2e                                   # full 172-case pass before landing (Phase B)
pnpm e2e:intros
```

Phase A agents run the engine suite, `pnpm test:corpus`, `tsc` and (where their files are in the
bundle) `pnpm build:app`. They do **not** run the full browser harness; the lead does in Phase B.

---

## R1 — Buck Rogers' twelfth capability profile, audited against bytes, and the gate that would have noticed its absence

**Why now.** Buck has two manifests, an Amiga set, a binary-derived ECL dialect, a ruleset and two
browser routes, and the ledger that the support page reads carries 11 profiles without it. The
reason nothing went red: `tools/goldbox_corpus.py:353-354` returns `status: "missing"` for an
absent profile instead of failing, and **no test anywhere** walks from `PROFILES` (13 entries,
`goldbox_corpus.py:53-67`) or from `apps/web/games/*.json` (15 files) to the ledger. Three
manifests (`champions-amiga`, `death-knights-amiga`, `buck-rogers-amiga`) are referenced by no
profile at all. The gate lands in Phase A; the profile lands in Phase B (the ledger is a
serialized file).

**Read first.** `CLAUDE.md`; `docs/engine/HANDOFF.md` twenty-eighth entry (the "Open, and
deliberately not done" paragraph and the "Two Phase B mechanics" paragraph); `tools/goldbox_corpus.py:40-67`
(`PROFILES`, `BUCK_ROOT`), `:340-392` (`CAPABILITY_AREAS`, `CAPABILITY_STATUSES`,
`validate_capability_contract`), `:1688-1720` (`validate_support_claims`);
`tools/test_goldbox_corpus.py:1778-1814`; `tools/goldbox_capabilities.json:228-302` (the Curse
profile — the formatting exemplar); `apps/web/src/ui/supportClaims.json:93-108`;
`tools/test_support_evidence_artifact.py` (how `apps/web/src/generated/support-evidence.json` is
kept current).

**Scope — files this agent owns (Phase A).**
- NEW `tools/test_capability_ledger_coverage.py`. Three tests, all two-sided:
  1. `ledger_profiles_match_PROFILES`: `{p["id"] for p in PROFILES if p["manifest"]} - set(load_capabilities())`
     must equal a pinned `KNOWN_MISSING = {"buck-rogers-countdown-to-doomsday"}` **exactly**
     (assert equality, not subset — when Phase B lands the profile this test goes red until
     `KNOWN_MISSING` is emptied, which is the intended coupling). Also assert the reverse: every
     ledger `profile_id` is a `PROFILES` id (a profile for a title the corpus does not know is a
     phantom).
  2. `every_manifest_is_owned`: the set of `apps/web/games/*.json` stems not named by any
     `PROFILES[*]["manifest"]` must equal a pinned `PLATFORM_VARIANT_MANIFESTS =
     {"champions-amiga", "death-knights-amiga", "buck-rogers-amiga"}` exactly, and each of those
     must share a `title` prefix with a profile that has a DOS manifest (state the rule you
     implement; a manifest with no owner and no sibling is red).
  3. `support_claims_cover_PROFILES`: `supportClaims.json` `profile_id`s == `PROFILES` ids (13).
     If `validate_support_claims` already asserts this (`goldbox_corpus.py:1718-1719`), say so and
     keep the test anyway as the direct pin — it costs nothing and reads from the file, not the
     validator.
- NEW `docs/engine/research/buck-capability-profile.md`: the audited profile (below) in one fenced
  JSON block, preceded by a claim-by-claim audit table. **Every number and path in the profile
  text is re-measured, not copied**: the 489 / 454 frame counts (read the e2e pins in
  `e2e.mjs` for `buck-rogers-view` / `buck-rogers-amiga-view`), "35 blocks x 3 view distances"
  and "8.81%" (find the source in the Buck manifest notes or `packages/engine/test/` and cite the
  line; if you cannot find a test or tool that produced 8.81%, drop the number from the profile
  and say so), "9-block MUSIC.DAX" (count from the manifest row), "5 real player careers" (count
  `BUCK_ROGERS_CAREERS` in `packages/engine/src/ruleset/buckrogers/index.ts`), `decode:false`
  rows, and the ECL numbers — which must be **read from `packages/engine/test/buckEclDialect.test.ts`**,
  never from prose (the twenty-eighth entry's "17 of 24" was exactly this failure). The ECL text
  is provisional until R6 lands; write it from the current pins and mark the two sentences R6
  may move (desync count, override count) so Phase B can reconcile them.
- A scratch script (scratchpad, not committed) that parses the fenced JSON, runs
  `goldbox_corpus.validate_capability_contract(profile)` and asserts `"verified-contract"`,
  checks every `evidence` path with `(REPO_ROOT / ref).is_file()`, and reports the new evidence
  total (predicted **58 + 16 = 74**) and the new area-level list (predicted
  `["audio", "ecl", "graphics", "towns", "towns", "towns", "towns"]`). Then, with the ledger
  monkeypatched in memory (never written), run the support-evidence generation path
  (`goldbox_corpus.py`'s `--strict` main, `--support-json <scratch path>`) and report **whether
  Buck's derived `web_level` changes from `preview`** and the diff line count of
  `support-evidence.json`. This is the measurement Phase B needs before it edits `supportClaims.json`.

**The drafted profile, verbatim from the last round's audit (not in the repo; audit it, do not trust it):**

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
          "detail": "ECL_GEN1_BUCK (headerLen 22, vbase 0x7ffe, 7 word-set overrides at opcodes 0x0c/0x1d/0x22/0x23/0x27/0x3f/0x40) was derived from Buck's own retail GAME.OVR dispatcher and operand parser by tools/map_buck_ecl_dispatch.py (docs/engine/research/buck-ecl-dispatch-map.md), not borrowed from a sibling title's dialect. Measured against Buck's own 25 retail blocks across ecl1..ecl6.dax (packages/engine/test/buckEclDialect.test.ts): 18 disassemble to a clean terminating EXIT and 7 desync (ecl1#17@0x1c, ecl1#18@0x72, ecl4#64@0x1d, ecl5#80@0x1d, ecl6#94@0x50, ecl6#95@0x9c3, ecl6#99@0x5e). A single-step browser inspector (?ecl=buck, documented in docs.ts) opens ecl2.dax#32-35 under this dialect; e2e case ecl-buck pins the dialect-dependent first-instruction address (0x8014) and an 8-instruction clean EXIT.",
          "evidence": [
            "packages/engine/src/ecl/disassemble.ts",
            "packages/engine/test/buckEclDialect.test.ts",
            "tools/map_buck_ecl_dispatch.py",
            "docs/engine/research/buck-ecl-dispatch-map.md",
            "apps/web/src/ui/eclInspector.ts",
            "apps/web/test/e2e.mjs"
          ],
          "gaps": [
            "7 of 25 retail blocks desync under this dialect; that is a real, uncorrected gap in the reconstruction, not a rendering issue.",
            "None of the dialect's own 7 override opcodes is exercised even once by this 25-block corpus, so the override table's correctness rests entirely on the binary dispatcher map, with no corpus cross-check available.",
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
            "packages/engine/test/buckAmigaArt.test.ts"
          ],
          "gaps": [
            "This is asset-browser-level graphics only: no exploration, town, wilderness, or combat screen composites this art in a live route.",
            "DOS SPRIT1..6 (35 blocks x 3 view distances) are missing their entire 32..175 palette range; 8.81% of non-transparent pixels render as flat white placeholder, and no in-file colour source exists anywhere in Buck's own DAX corpus to recover them.",
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
            "evidence": ["apps/web/games/buck-rogers-countdown-to-doomsday.json", "apps/web/test/e2e.mjs"],
            "gaps": ["Buck's save file format has not even been identified, let alone mapped into an importer."]
          },
          "export": {
            "status": "unsupported",
            "scope": "No Greybox session-to-Buck retail save exporter exists.",
            "evidence": ["apps/web/games/buck-rogers-countdown-to-doomsday.json", "apps/web/test/e2e.mjs"],
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

Known issues with the draft to resolve in the audit: the `retail_save.import`/`export` blocks cite
`apps/web/test/e2e.mjs` as evidence of an importer that does not exist — cite the manifest only,
or state what in `e2e.mjs` is evidence (an absence is not). "Only the SPRIT palette gap" and the
"8.81%" figure need a producing test or tool; "SPACETVL" must exist as a manifest row or be removed.

**Must NOT touch:** `tools/goldbox_capabilities.json`, `tools/test_goldbox_corpus.py`,
`tools/goldbox_corpus.py`, `apps/web/src/ui/supportClaims.json`,
`apps/web/src/generated/support-evidence.json`, `docs/engine/research/release-contract-gap-audit.md`
(all Phase B), any Buck manifest, `docs.ts`, `e2e.mjs`.

**Acceptance.** `pnpm test:corpus` green with the new file collected (report the new collected
total; it was 1231). The scratch validator reports `verified-contract`, 16/16 evidence paths
resolve, the predicted 74 and the area list, and the `web_level` / diff-size measurement.

**Mutations (watch each red, restore).** (i) Add a throwaway `apps/web/games/zzz-fake.json` →
test 2 red. (ii) Remove Buck from `KNOWN_MISSING` → test 1 red (this is the Phase B flip seen in
advance). (iii) Delete one `evidence` path from the draft in the scratch run → the validator must
fail on that path, not pass (proves the check bites before Phase B relies on it).

**Prediction.** Evidence total 58 → **74**; area-level list gains exactly `audio`, `ecl`,
`graphics`; `KNOWN_MISSING` has exactly 1 member; `PLATFORM_VARIANT_MANIFESTS` exactly 3; Buck's
derived `web_level` **does not change** from `preview` (the level is route-derived, not
ledger-derived — two-sided: if it does change, say what changed it).

**Hard constraints.** Read-only game data and external sources; no EXE patching; do not commit,
do not deploy.

---

## R2 — A "`?query=` URL is not a menu entry" gate: every handled route is documented, every documented route is handled

**Why now.** The twenty-sixth entry found four manifests reachable only by typing `?game=`; the
twenty-eighth found `?import=dqk` / `?import=dok` in the same state. Measured today the drift is
larger — 2 `?import=`, 11 `?game=`, 3 `?explore=` — and the class of bug recurs because nothing
compares `main.ts`'s dispatcher (`:1910-2050`) to `docs.ts`'s `DEMOS` (`:93-182`). `docs.ts`
even exposes `window.__docs.demoFlags()` (`:250-254`) and nothing reads it. The gate lands in
Phase A with the measured drift pinned; the `docs.ts` entries land in Phase B.

**Read first.** `CLAUDE.md`; twenty-sixth and twenty-eighth `HANDOFF.md` entries (the
"unreachable from the UI" paragraphs); `apps/web/src/ui/main.ts:1910-2050` (the `params.get`
chain) and its `history.replaceState` sites (`:1151, :1245, :1282, :1294, :1306, :1318, :1491,
:1576, :1743`); `apps/web/src/ui/docs.ts:85-182`; `apps/web/src/ui/gameData.ts` (the explore-id
union near `:31`, and each `GameData` entry's `id`); `apps/web/games/*.json`;
`apps/web/test/e2e.mjs:438-475` (`runManifestPickerCoverage` — the closest existing analogue);
`tools/test_docs_claims.py` (style precedent for a pytest that reads source files as text).

**Scope — files this agent owns (Phase A).**
- NEW `tools/web_routes.py` — pure-Python extractors, no Node: `handled_routes()` = the union of
  (a) every `params.get('<k>') === '<v>'` literal in `main.ts`; (b) every `'?<k>=<v>'` literal
  passed to `history.replaceState` in `main.ts`; (c) `?explore=<id>` for every id the explore
  dispatcher accepts (derive from the `GameId` union / `GameData` ids in `gameData.ts` — state
  which declaration you anchor on); (d) `?game=<stem>` for every `apps/web/games/*.json`.
  `documented_routes()` = every `flag: '?<k>=<v>'` in `docs.ts`. Both return sorted sets of
  `'?k=v'` strings.
- NEW `tools/test_web_routes_documented.py` — three tests: (1) the extractor's own null:
  `documented_routes()` has exactly **89** members (90 `DEMOS` entries minus the one
  `Library → HEIRS.DSN` entry with no query string) — if your regex finds a different number,
  the regex is wrong, not the file; (2) `handled - documented == KNOWN_UNDOCUMENTED` **exactly**
  (a pinned, commented set — measured, not guessed); (3) `documented - handled == set()`
  (a documented route nothing handles is a phantom; if any exist today, pin them in a
  `KNOWN_PHANTOM` set and report them — they are findings).
- Report: the full `KNOWN_UNDOCUMENTED` set, partitioned into (i) routes with a live e2e case
  (grep the case's `goto` URL in `e2e.mjs`) and (ii) routes with none. Partition (i) is what Phase
  B documents; (ii) is disclosed as the residual.

**Must NOT touch:** `docs.ts`, `main.ts`, `e2e.mjs`, `gameData.ts`, `gameview.ts` (all Phase B
or other owners). Do not "fix" the drift in Phase A; pin it.

**Acceptance.** `pnpm test:corpus` green. The report lists every undocumented route with its
e2e case id or "none".

**Mutations.** (i) In a scratch copy of `docs.ts` fed to the extractor (or by temporarily
editing and restoring), remove the `?import=coab` entry → test 2 red with `?import=coab` in the
diff. (ii) Add `?import=zzz` to `KNOWN_UNDOCUMENTED` → test 2 red (the set is exact, not a
superset). (iii) Add a fake `flag: '?nothing=1'` → test 3 red.

**Prediction.** `|handled - documented|` ≥ **16** (2 + 11 + 3) and ≤ 45; of those, at least 16
have a live e2e case. `documented - handled` = **0** (two-sided: a phantom is a finding, land it).
The extractor null recovers exactly 89.

**Hard constraints.** Read-only game data; no EXE patching; do not commit, do not deploy.

---

## R3 — The CoAB cross-title null becomes a standing test, and Secret's 439-byte record gets its offsets by oracle sweep

**Why now.** The ledger's own text (`goldbox_capabilities.json:271`) says the cross-title null
"is a one-time measurement … NOT a standing test — nothing goes red if it silently stops
holding". The last plan's bench item "Secret importer, only after R2's offset measurement says
the COAB layout holds there" was answered: it does **not** hold (1/6), and Secret's record is
439 = 422 + 17 bytes. The next question is where the 17 bytes went, and the CoAB offset oracle
(class byte ↔ `ClassLevel[8]` agreement, `coabExpectedClassLevelSlots` in
`packages/engine/src/loaders/coabSavedCharacter.ts:144`) can answer it by sweep with no
disassembly. Two-sided by construction: a unique 6/6 pair is a layout; zero pairs or many is
also a landable number.

**Read first.** `CLAUDE.md`; `packages/engine/src/loaders/coabSavedCharacter.ts` (offsets and
their `Player.cs` citations; note `decodeCoabSavedCharacter` **throws on any length ≠ 422** at
`:269`, so the cross-title test reads fields directly); `packages/engine/test/coabSavedCharacter.test.ts:199-262`
(the golden + shifted-offset tests — the model for the new describe);
`docs/engine/research/original-save-import-export-status.md:340-360`;
`coab_extracted/Classes/Enums.cs:69-89` (`ClassId`), `coab_extracted/Classes/Player.cs:708`
(`StructSize`); `docs/engine/research/dok-save-key-sweep.md` (a precedent for an offset sweep
with a shuffled null). File locations: Curse `…\Curse of the Azure Bonds\SAVE\CHRDATA{1..6}.SAV`
(422 B); Secret `…\Secret of the Silver Blades\CHRDATA{1..6}.SAV` (**install root**, 439 B —
its `SAVE\` is empty); Pools `…\Pools of Darkness\SAVE\CHRDATA{1..6}.SAV` (510 B); Treasures
`…\Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV` (510 B). All under
`C:\Program Files (x86)\GOG Galaxy\Games\`, all read-only.

**Scope — files this agent owns (Phase A).**
- `packages/engine/test/coabSavedCharacter.test.ts` — append a `describe('cross-title null …')`
  with `it.skipIf(<that title's files absent>)` per title. A local helper applies the CoAB
  oracle at the CoAB offsets to raw bytes of any length (class @0x75, slots @0x109..0x110,
  using the exported `coabExpectedClassLevelSlots`). Pins, exact: Curse **6/6**, Secret **1/6**,
  Pools **0/6**, Treasures **0/8** — and the name of the one Secret record that passes (report
  it; it is either a coincidence or a partial layout overlap, and the sweep below says which).
- NEW `tools/secret_chrdata_sweep.py` — for a set of records, sweep every class offset `c` and
  level-array offset `l` (8 bytes) and count records where the oracle accepts; print every
  `(c, l)` with full agreement plus the runner-up. Requirements: a `--title` flag for
  curse/secret/pools/treasures; a `--shuffle N` null (byte-shuffle each record N times, report
  the max full-agreement pair count over the shuffles); `--json` output. Treat class codes
  outside `ClassId` (0..17) as rejecting.
- NEW `tools/test_secret_chrdata_sweep.py` — skip if the GOG root is absent. Pins: (a) the
  **calibration**: on Curse the sweep's full-agreement set contains `(0x75, 0x109)` and the
  total number of full-agreement pairs is pinned (measure it; predicted 1); (b) on Secret the
  full-agreement set is pinned exactly (predicted one pair); (c) the shuffled null's maximum
  over 200 shuffles is pinned as an upper bound (`<=`) and stated in the report next to the
  real count; (d) at Secret's found pair, the level bytes are all in 1..25 and the name PString
  at 0 decodes to printable ASCII for 6/6 (the "it is a layout, not a coincidence" check).
- NEW `docs/engine/research/secret-chrdata-layout.md` — the numbers, the inferred insertion
  point(s) (`c - 0x75` and `l - 0x109` say whether the 17 bytes sit before the class byte,
  between, or after), and the Pools/Treasures sweep results as **report-only** (same tool, same
  nulls; no test pins beyond what you measured — say "report-only").
- `docs/engine/research/original-save-import-export-status.md` — append a dated Secret section
  and change the sentence at `:350` so it says the null is now pinned in the engine suite (name
  the test).

**Must NOT touch:** `coabSavedCharacter.ts`, `packages/engine/src/index.ts`,
`apps/web/src/ui/importCoabParty.ts`, `tools/goldbox_capabilities.json` (Phase B rewrites the
`:271` gap sentence), `test_goldbox_corpus.py`, `main.ts`, `docs.ts`, `e2e.mjs`. No Secret
importer this round — the layout is the deliverable.

**Acceptance.** `pnpm --filter @goldbox/engine test` and `pnpm test:corpus` green; report the
four cross-title counts, the Curse calibration pair count, Secret's full-agreement pairs with
`(c, l)` in hex, the shuffled-null maximum, and the Pools/Treasures report-only results.

**Mutations.** (i) Change `0x75` to `0x74` in the test's local helper → Curse drops from 6/6 →
red. (ii) In the sweep test, assert Curse's pair set is `{(0x76, 0x109)}` → red (the calibration
can fail). (iii) Feed the sweep the Curse records with 17 zero bytes inserted at 0x40 → the
found pair must move to `(0x86, 0x11a)` (the tool tracks an insertion; if it does not, the tool
is wrong).

**Prediction.** Curse sweep: exactly **1** full-agreement pair. Secret: exactly **1**, with
`l - 0x109 = c - 0x75 = k` for a single `k ∈ [0, 17]` (one contiguous insertion before the
class byte); shuffled-null max **0** full-agreement pairs over 200 shuffles. Pools/Treasures
(510 B): 1 pair each with `k` larger and possibly `l - 0x109 ≠ c - 0x75` (two insertions) —
report-only.

**Hard constraints.** Read-only GOG folders (never copy a `CHRDATA*.SAV` into the repo — read
it in place, and the tests skip when absent); no EXE patching; do not commit, do not deploy.

---

## R4 — Adversarial: every DQK coordinate claim on the eight non-square maps, re-derived under the corrected (height, width) stride

**Why now.** Commit `dc12cd1` (2026-08-07) corrected `decodeGen2GeoBlock` from (W, H) to
(H, W): "8 of 20 DQK maps were being transposed." Research written before that date computed
cell coordinates with the old stride, and the last round found one such claim only because R4
happened to walk area 54 (`dqk-campaign-legs.md:572-579` and `:678-688`: 23x21 → 21 wide × 23
tall, six cells relabelled). Nobody has swept the other seven maps. Four DQK research docs
predate the fix (`dqk-search-location.md` first 06-22, `dqk-newgame-entry.md` 06-24,
`dqk-palanthas-palace-combat-route.md` 07-15, `dqk-demo-route.md` 07-21); `dqk-*.md` carries 64
`(x,y)` mentions, 10 on lines naming a non-square area. The census below is the planner's own
measurement (Python over `DISK3/GEO.GLB` via `dqk_ecl_combat_scan.read_hlib_data_archive`) and
is what the test pins:

| area | member | h | w |
|---|---|---|---|
| 14 | 4 | 39 | 20 |
| 18 | 5 | 16 | 11 |
| 22 | 6 | 27 | 24 |
| 38 | 11 | 20 | 39 |
| 46 | 13 | 27 | 29 |
| 47 | 14 | 27 | 29 |
| 54 | 16 | 23 | 21 |
| 66 | 20 | 22 | 34 |

The other 12 (areas 2, 4, 10, 24, 26, 30, 34, 42, 50, 58, 62, 63) are square, so transposition
cannot move a cell on them — that is the null: every coordinate claim about a square map must
classify CORRECT under both stride readings, or the audit script is broken.

**Read first.** `CLAUDE.md`; `packages/engine/src/loaders/geo.ts:190-262` (the derivation from
`2f0d:0628`); `git show dc12cd1 -- packages/engine/src/loaders/geo.ts`; `dqk-campaign-legs.md:560-580`
and `:675-690` (the shape of an appended CORRECTION — copy it); `packages/engine/test/dqkQuest.test.ts:1-40`;
`docs/engine/research/dqk-search-location.md`, `dqk-demo-route.md`,
`dqk-palanthas-palace-combat-route.md`, `dqk-newgame-entry.md`, `dqk-ending-ingress.md`,
`dqk-campaign-legs.md` (all legs, not only QUEST); memory `goldbox-verify-gaps-against-binary`.

**Scope — files this agent owns (Phase A).**
- NEW `packages/engine/test/dqkGeoShapeCensus.test.ts` — skip if DQK data absent. Pins: the 20
  maps' `(areaId, h, w)` exactly as the table; exactly 8 non-square; and for each of the 12
  square maps, that decoding the raw block under a deliberately transposed reading yields the
  same cell at every `(x, y)` (the null, asserted).
- NEW `tools/dqk_geo_claim_audit.py` — reads every `docs/engine/research/dqk-*.md`, finds lines
  with an `(x,y)` pair and an area/member reference (be explicit about the regexes and print
  what they missed), and for claims of the checkable kinds — "descriptor 0xNN at (x,y)", "cell
  (x,y) is …", "landing pose (x,y)", "N cells at …" — re-derives the claim from the corrected
  decoder (port only what you need: header `(h, w)`, plane stride `w`, descriptor plane) and
  classifies CORRECT / STALE / UNCHECKABLE with the reason. Include `apps/web/src/ui/dqkExplore.ts`
  and `packages/engine/test/dqk*.test.ts` in the scan (read-only) so a hard-coded stale pose in
  code is found, not only prose.
- NEW `docs/engine/research/dqk-geo-shape-audit.md` — the census, every claim with its
  classification, and the calibration line: the already-corrected area-54 claim at
  `dqk-campaign-legs.md:566-568` must classify STALE and its correction at `:576` CORRECT.
- `docs/engine/research/dqk-*.md` — append a dated `> CORRECTION (R4, round 29)` block under
  each STALE claim in the doc that carries it, with the corrected coordinates. Never rewrite the
  original lines.

**Must NOT touch:** `geo.ts`, `dqkExplore.ts`, `dqkCampaignLegs.test.ts`, `dqkQuest.test.ts`,
`tools/goldbox_corpus.py` (its `sniff_gen2_geo` at `:538` names `width, height = raw[0], raw[1]` —
harmless because `w*h` commutes, but the naming is transposed; Phase B one-liner). If a STALE
coordinate is found in code or a test, **report it for Phase B** rather than editing.

**Acceptance.** Engine tests and `pnpm test:corpus` green; the audit doc lists every claim; the
report gives counts: claims scanned / checkable / CORRECT / STALE / UNCHECKABLE, split by
non-square vs square maps, and the calibration result.

**Mutations.** (i) Flip area 54's pinned `(h, w)` to `(21, 23)` → census red. (ii) Run the audit
with the stride deliberately transposed → every CORRECT claim on a non-square map must flip
(report the flip count; if a claim survives both readings it is not a coordinate claim). (iii)
Disable the square-map null → nothing should change in the classification counts (proves the
null is independent of the finding, and that it was actually running).

**Prediction.** Claims on non-square maps: ≥ **1** STALE beyond the already-corrected area-54
claim, most likely in the four pre-08-07 docs, at areas 66 (landing pose (6,21) and X=29
writes are already known-correct under `w=34`, so not there) or 14/38 (39×20 vs 20×39 — the
most transposition-sensitive pair). Claims on square maps: **0** STALE (null). Engine tests:
**0** STALE (they run against the decoder). `dqkExplore.ts`: 0 or 1 hard-coded stale pose —
two-sided.

**Hard constraints.** Read-only game data (`The Dark Queen of Krynn/DISK3/GEO.GLB` is read in
place); no EXE patching; no DOSBox-X; do not commit, do not deploy.

---

## R5 — The provenance badge's "mixed" branch: falsify "no browser exemplar", and pin both mixed semantics in the engine

**Why now.** The twenty-eighth entry and `e2e.mjs:10209-10212` state that `describeProvenance`'s
mixed path "has engine-level coverage only (`dungeonWallGraphicSet` tests) and no browser
case". Measured: `dungeonWallGraphicSet.test.ts` has **no** `'mixed'` assertion, and the GLIB
routes are the exemplar — `explore.ts:3685-3687` (Pools: "Boot/UI tile sets 0 and 4 are NOT in
this container on the Amiga side … they fall through to the DOS art") and `:3719-3721`
(Gateway). `wallArtProvenance` (`dungeonWallGraphicSet.ts:116-133`) buckets DOS `tile8x8` keys
into `symbol set N` (`N = floor(key/1000)`) and `wall bricks (shared bank)` (key ≥ 100000), so
a Pools dungeon under Amiga must report sets 1..3 `'Amiga'` and sets 0/4 `'DOS-EGA'`, i.e. the
cross-category mixed badge `art: mixed — Amiga (3), DOS-EGA (2) of 5 categories`. There are two
"mixed" semantics — within-category (`source === 'mixed'`, `:130`) and cross-category
(`describeProvenance` `:2586`) — and neither is pinned anywhere.

**Read first.** `CLAUDE.md`; `packages/engine/src/world/dungeonWallGraphicSet.ts` (whole file);
`apps/web/src/ui/explore.ts:2562-2587` (`describeProvenance`) and `:3660-3745`
(`buildGlibWallGraphics` — the exact call sequence to reproduce); `apps/web/src/ui/gameData.ts`
Pools (`:1494-1545`) and `gateway-amiga` (`:1003-1046`) entries for the archive paths and
`amigaGlibTilesPath` / `amigaGlibPalettePath`; `packages/engine/test/dungeonWallsAmigaDok.test.ts`
and `dungeonWallsAmiga.test.ts` (the real-bytes precedents, and the stale `it` title at
`dungeonWallsAmigaDok.test.ts:69`); `e2e.mjs:9880-9950` and `:9960-10020` (the two GLIB
graphics-switch cases).

**Scope — files this agent owns (Phase A).**
- `packages/engine/test/dungeonWallGraphicSet.test.ts` — add: (a) a synthetic within-category
  case: two sets where the richer set covers only half of one category's keys → that category
  reports `source: 'mixed'` and the others their single source; (b) a synthetic cross-category
  case: richer set covers categories 1..3 fully, 0 and 4 not at all → exact array
  `[{symbol set 0, DOS-EGA}, {1, Amiga}, {2, Amiga}, {3, Amiga}, {4, DOS-EGA}]` (sorted as the
  function sorts); (c) the null: with the base set active, every category reports the base set.
- NEW `packages/engine/test/dungeonWallsAmigaGlib.test.ts` — real bytes, skip if absent.
  Reproduce `buildGlibWallGraphics` for Pools' `?explore=pools` block (18) and for Gateway's
  `gateway-amiga` block (2) using the same engine exports `explore.ts` imports (confirm each is
  exported from `packages/engine/src/index.ts`; **if one is not, stop and report — do not add an
  export**). Pin `wallArtProvenance` per category with Amiga active: the exact category list and
  each source; count of Amiga vs DOS-EGA categories; and that with DOS-EGA active all are
  DOS-EGA. Also pin `bankSwapParity` outcomes for the blocks the two routes actually load (the
  Gateway Sundabar block-15 refusal is a documented negative — pin it as such if it is cheap).
- `packages/engine/test/dungeonWallsAmigaDok.test.ts` — fix only the `it` title at `:69` ("the
  single-bank wall sets fall back to DOS" is false since R1 of the last round); assertions untouched.
- Report: the exact badge string `describeProvenance` would render for each route (compute it
  from the provenance array by re-implementing the 2586 format in the report, not in engine code)
  and the text Phase B should assert.

**Must NOT touch:** `explore.ts`, `dungeonWallGraphicSet.ts`, `index.ts`, `gameData.ts`,
`e2e.mjs` (Phase B strengthens the two cases), `dungeonWallsAmiga.test.ts`.

**Acceptance.** Engine tests green and `tsc` clean. The report states, per route, the category
list with sources and the predicted badge text.

**Mutations.** (i) In the synthetic within-category case, let the richer set cover all keys →
`'mixed'` becomes `'Amiga'` → red. (ii) In the real-bytes test, pass `tileSetForBlock: () =>
null` → all categories DOS-EGA → the Amiga-count pin red. (iii) Phase B: in `explore.ts`, make
`tileSetForBlock` return null for all ids → the e2e `/mixed/` and per-category assertion must go
red, then restore.

**Prediction.** Pools block 18 under Amiga: **5** categories, `Amiga (3)`, `DOS-EGA (2)`, badge
`art: mixed — Amiga (3), DOS-EGA (2) of 5 categories`. Gateway block 2: the same shape (state the
count; the route's `LOAD_PIECES` may load fewer than five sets — report what it loads). The
within-category `'mixed'` source appears on **no** real-bytes route (it needs a bank that is
partially decodable; none is known) — asserted as an absence with the synthetic case as the
positive control. If either real route reports full Amiga coverage, the `explore.ts` comments at
3685 and 3719 are wrong and the twenty-eighth entry was right — land that instead.

**Hard constraints.** Read-only game data (Pools disk 2 `8X8D.TLB`, Gateway `Walls.tlb` /
`Always.tlb` under the documented WHDLoad and GOG paths, read in place); no EXE patching; do not
commit, do not deploy.

---

## R6 — Buck's seven desyncs: attribute each to a handler in the dispatcher map, and close the ones whose word set was merely unmeasured

**Why now.** `ECL_GEN1_BUCK` was derived from Buck's own `GAME.OVR` (`disassemble.ts:351-356`,
`tools/map_buck_ecl_dispatch.py`), and the corpus census is pinned at 25 blocks, 18 clean, 7
desync. The dispatch map says 18 of the 75 handlers are **Unmeasured** ("handler never reaches
the derived call target before returning") and 12 lie beyond CoAB's 0x40, so their word sets
are defaults, not measurements. Nobody has looked at which opcode sits at each desync site.
Static, no trace needed: read the byte at `badOpcodeAt`, look the handler up, and where the
operand count can be read from the handler body (the prefetch method in memory
`goldbox-verify-gaps-against-binary`), the dialect can be corrected **from the binary**. The
twenty-eighth entry's warning stands: corpus fit chose the wrong 0x21 once (Pools' `0x21: 2`
resyncs 2 more blocks and is wrong); **no override lands on corpus fit alone**.

**Read first.** `CLAUDE.md`; `packages/engine/test/buckEclDialect.test.ts` (whole file, note
the sample cap at `:78`); `packages/engine/src/ecl/disassemble.ts:319-356` and the disassembler
core (`:680-720`, where `badOpcodeAt` is set); `docs/engine/research/buck-ecl-dispatch-map.md`
(the Unmeasured column and the Claim Boundary section); `tools/map_buck_ecl_dispatch.py` and
`tools/map_pool_ecl_dispatch.py` (how a handler's operand-parser calls are counted);
`docs/engine/research/pool-ecl-dispatch-map.md`; memory `goldbox-verify-gaps-against-binary`.
Buck's DOS install: `D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\` (read-only).

**Scope — files this agent owns (Phase A).**
- `packages/engine/test/buckEclDialect.test.ts` — raise the sample cap so **all 7** desync sites
  are pinned by `file#block@offset`, and add a test that pins, per site, the opcode byte at
  `badOpcodeAt` and the three preceding decoded mnemonics (the attribution table, as data).
- `tools/map_buck_ecl_dispatch.py` — extend to emit, for each Unmeasured handler, the reason the
  call-target walk stopped (ret before call / indirect jump / jump into another handler), and to
  attempt the operand count by the fallthrough/merge chain the tool already uses for the 12
  recovered opcodes. Regenerate `docs/engine/research/buck-ecl-dispatch-map.md`.
  `tools/test_map_buck_ecl_dispatch.py` — pin the new columns.
- `packages/engine/src/ecl/disassemble.ts` — `ECL_GEN1_BUCK.wordSetOverrides` only, and only for
  opcodes whose count was **read from the handler**; each new entry carries the handler file
  offset in the docblock. If a desync opcode's count cannot be read from the binary, it stays
  unmodelled and the desync stays — say so.
- NEW `docs/engine/research/buck-ecl-desyncs.md` — the 7-row attribution table: site, opcode
  byte, handler offset, class (UNMEASURED / BEYOND-0x40 / AGREED-BUT-UPSTREAM / DATA), what was
  read from the handler, and the census before/after.

**Must NOT touch:** `eclInspector.ts`, `docs.ts`, `main.ts`, `e2e.mjs`, the Buck manifests,
`goldbox_capabilities.json`, `supportClaims.json`, `tools/gen1_ecl_encounter_scan.py`, every other
dialect constant in `disassemble.ts`.

**Acceptance.** Engine tests, `pnpm test:corpus`, `tsc` green. Report: the 7-row table; the
census under the final dialect and under `ECL_GEN1` / `ECL_GEN1_SHORT` / `_GATEWAY` /
`_TREASURES` / `_POOLS` (the existing pins at `:143-144`, `:179-180`, `:193-196` move only if
the numbers move, and the report says which); and **whether `ecl2.dax#32-35` disassemble
identically** before and after (the `ecl-buck` e2e pins `#32` at 8 instructions, first vaddr
`0x8014`, ending in EXIT — if any new override touches those blocks, Phase B must re-pin the case
and you must say so).

**Nulls / mutations.** (i) For every new override, state the count a pure corpus fit would have
chosen (sweep 0..8 for that opcode alone and report the desync count at each) — if the
binary-read count is not the corpus-minimising one, that is the 0x21 shape again and is the
reason the binary wins; if it is, say the corpus agrees rather than that it confirms. (ii)
Revert one new override → the census returns to `{7, 18, 0}` → the new pin is red. (iii) Set a
newly measured count to `+1` → a different desync count (the pin discriminates the value, not
just presence).

**Prediction.** ≥ **4** of the 7 desync opcodes are Unmeasured or beyond-0x40 handlers; ≥ 2 of
those yield a readable operand count from the handler body; the census moves from `{7, 18, 0}`
to desync ≤ **5**, cleanExit ≥ **20**; `ecl2.dax#32` is unchanged. If instead all 7 sites are at
agreed opcodes, the desync is upstream (an earlier instruction over/under-consumed) and the
deliverable is the attribution table with the dialect unchanged — landable.

**Hard constraints.** Read-only Buck install; `GAME.OVR` is read, never patched; no DOSBox-X; do
not commit, do not deploy.

---

## Dispatch order

**Phase A — fully parallel (six agents, disjoint files):**

| item | owns (Phase A) |
|---|---|
| R1 | NEW `tools/test_capability_ledger_coverage.py`, NEW `docs/engine/research/buck-capability-profile.md` |
| R2 | NEW `tools/web_routes.py`, NEW `tools/test_web_routes_documented.py` |
| R3 | `packages/engine/test/coabSavedCharacter.test.ts`, NEW `tools/secret_chrdata_sweep.py`, NEW `tools/test_secret_chrdata_sweep.py`, NEW `docs/engine/research/secret-chrdata-layout.md`, `docs/engine/research/original-save-import-export-status.md` |
| R4 | NEW `packages/engine/test/dqkGeoShapeCensus.test.ts`, NEW `tools/dqk_geo_claim_audit.py`, NEW `docs/engine/research/dqk-geo-shape-audit.md`, `docs/engine/research/dqk-*.md` (append-only corrections) |
| R5 | `packages/engine/test/dungeonWallGraphicSet.test.ts`, NEW `packages/engine/test/dungeonWallsAmigaGlib.test.ts`, `packages/engine/test/dungeonWallsAmigaDok.test.ts` (one `it` title) |
| R6 | `tools/map_buck_ecl_dispatch.py`, `tools/test_map_buck_ecl_dispatch.py`, `docs/engine/research/buck-ecl-dispatch-map.md` (regenerated), `packages/engine/src/ecl/disassemble.ts` (`ECL_GEN1_BUCK` only), `packages/engine/test/buckEclDialect.test.ts`, NEW `docs/engine/research/buck-ecl-desyncs.md` |

Cross-check of the collision surface: no file appears in two rows. `packages/engine/src/index.ts`
is touched by nobody (R5 must report, not add, if an export is missing). `explore.ts`,
`dqkExplore.ts`, `geo.ts`, `gameData.ts`, `loaders/*.ts` are read-only for everyone this round.
`docs/engine/research/original-save-import-export-status.md` is R3's alone; `dqk-*.md` are R4's
alone (R6's docs are `buck-*.md`). If any agent finds it must edit a file outside its row, it
stops and reports instead of editing.

**Phase B — serialized, single-writer (the lead, one item at a time, in this order), after each
Phase A item has been reviewed and committed with `git commit -- <paths>`:**

1. **[R6 → R1 reconciliation, no file edit]** Read R6's final census. If the desync/override
   counts moved, rewrite the two marked sentences of R1's profile `ecl.detail`/`ecl.gaps` in
   `docs/engine/research/buck-capability-profile.md` before anything reads it.
2. **[R1] `tools/goldbox_capabilities.json`**: insert the audited profile as the twelfth element.
   Anchor: slice to the last profile (`"profile_id": "secret-of-the-silver-blades"` through its
   closing `    }`), then insert `,\n` + the profile text before `\n  ]\n}`. Verify with
   `python -c "import json;json.load(open('tools/goldbox_capabilities.json',encoding='utf-8'))"`
   and `git diff --stat` — the diff must be **additive only** (one hunk, ~120 lines, zero
   deletions); anything else is the round-trip failure, revert.
3. **[R1] `tools/test_goldbox_corpus.py:1806`** `58` → the number R1 measured (predicted 74);
   **`:1811-1814`** area list → `["audio", "ecl", "graphics", "towns", "towns", "towns", "towns"]`;
   **`:1807`** comment "across 12 profiles" → now true — say "12 profiles (Buck added round 29)".
   Then `tools/test_capability_ledger_coverage.py`: `KNOWN_MISSING = set()` (watch test 1 red
   between steps 2 and this, as designed). Regenerate `apps/web/src/generated/support-evidence.json`
   with `python tools/goldbox_corpus.py --strict`; commit the artifact with the ledger (the
   `test_support_evidence_artifact_is_current` gate). `apps/web/src/ui/supportClaims.json:98`:
   replace "Buck's ECL dialect has never been verified against its own binary" with the recovered
   state (leave `web_level` as R1's measurement says). `docs/engine/research/release-contract-gap-audit.md:230`
   "11/13" → "12/13". `pnpm test:corpus`.
4. **[R3] `tools/goldbox_capabilities.json`** Curse `retail_save.import.gaps[3]` (the sentence
   at `:271`): replace "That cross-title null is a one-time measurement recorded in the research
   doc, NOT a standing test — nothing goes red if it silently stops holding, unlike the
   shifted-offset oracle, which is pinned in the engine suite." with "That cross-title null is
   pinned in `packages/engine/test/coabSavedCharacter.test.ts` alongside the shifted-offset
   oracle; Secret's 439-byte layout is documented in `docs/engine/research/secret-chrdata-layout.md`."
   Sliced to the Curse profile first. Then check `tools/test_goldbox_corpus.py`'s Curse import
   assertion still finds the phrases it requires (pregen-only scope, ruleset translation) — if it
   asserted the old sentence, update the assertion in the same step. Evidence count unchanged.
   `pnpm test:corpus`.
5. **[R2] `apps/web/src/ui/docs.ts`**: add `DEMOS` entries for `?import=dok`, `?import=dqk`,
   `?explore=cok-natural-6`, `?explore=gateway-quest`, `?explore=secret-natural-4`, and the 11
   undocumented `?game=<id>` manifests (one entry each, `sub` from the manifest's own title/notes —
   **no quoted game-data path literals in `sub` or comments**), plus any partition-(i) route R2
   reported. Fix `docs.ts:181`: the inspector opens `ecl2.dax` (`#32-35`), not `ecl1.dax`.
   **`apps/web/src/ui/main.ts:2036`** comment: same `ecl1` → `ecl2` correction (comment only).
   Then `tools/test_web_routes_documented.py`: shrink `KNOWN_UNDOCUMENTED` to the residual R2's
   partition (ii) lists, watched red before the shrink. `pnpm test:corpus`, `pnpm build:app` (two
   tolerated warnings, no more).
6. **[R4] `tools/goldbox_corpus.py:538`** `width, height = raw[0], raw[1]` → `height, width = raw[0], raw[1]`
   (behaviour identical; naming agrees with `geo.ts`). If R4 reported a STALE coordinate in
   `dqkExplore.ts` or a test, correct it here with its own mutation (revert → the R4 census or
   audit test red). `pnpm test:corpus`, engine tests.
7. **[R5] `apps/web/test/e2e.mjs`**: in `explore-pools-graphics-switch` (`:9935`) and
   `explore-gateway-amiga-graphics-switch` (`:10004`) replace `if (!provenance) …` with the
   per-category pin R5 reported (exact category count, `Amiga` on sets 1..3, `DOS-EGA` on the
   rest) plus the badge text read from `.gb-graphics-provenance` matching `/^art: mixed — /`;
   correct the comments at `:1520-1522` and `:10209-10212` ("no browser exemplar" → name these
   two cases). Watch red under R5's mutation (iii) in `explore.ts`, restore. No new case: the
   registry, `main()` and `results.unshift` are untouched, and `e2e-case-coverage` stays at 171
   selectable / 172 total. Scoped runs of both cases, then `explore-dok` and `explore-cok` as
   controls (their provenance pins must still pass).
8. **[R6]** If the dialect changed: `apps/web/games/buck-rogers-countdown-to-doomsday.json`
   `ecl1.dax` note, `docs.ts:181` blurb ("7 word-set overrides", "18 of 25" if quoted) and
   `supportClaims.json:98` numbers; if `ecl2.dax#32` changed, re-pin `ecl-buck`. `pnpm test:corpus`.
9. Full gates: engine, `pnpm test:corpus` (re-measure the collected total; `CLAUDE.md`'s "1193
   tests as of 2026-08-26" sentence is guarded by `test_docs_claims.py` at 15% drift — 1231
   today, ≈1245 after this round, inside the band; update the sentence anyway if it is touched),
   `tsc`, `pnpm build:app`, **full** `pnpm --filter @goldbox/web e2e` (172 expected),
   `pnpm e2e:intros`, atomic deploy per `CLAUDE.md`, live-bundle hash check, then drive
   `explore-pools-graphics-switch` and `explore-gateway-amiga-graphics-switch` against production
   through `GB_E2E_BASE_URL`. `HANDOFF.md` twenty-ninth entry — which must state plainly that the
   twenty-eighth entry's "mixed branch has engine-level coverage only and no browser exemplar"
   was wrong on both halves (if R5 confirms), with the badge strings.

**Bench (substitutes if an item is dropped; same rules):**
- Secret of the Silver Blades importer — only after R3 lands a unique `(c, l)` pair; same file
  pattern as `?import=coab`; would need `index.ts` + `main.ts` + `docs.ts` + `e2e.mjs` (Phase B).
- Pools/Treasures 510-byte layouts — R3's report-only sweep says whether one insertion or two.
- `describeProvenance` within-category `'mixed'` browser exemplar — needs a title with a
  partially decodable bank; none is known. Do not manufacture one.
- Buck `quests` flag census (writer/reader pairs over the 25 blocks) — only after R6, since a
  desyncing block hides its writes.

**Deliberately not picked (blocked or speculative):** seg051 RNG and the DQK ECL opcode table
(memory `goldbox-decompile-loop`: need a DOSBox-X dynamic trace); every `[ ]` leaf in
`BUILD-QUEUE.md` that names DOSBox-X/GameLink/trace; C1.4b `?graphics=c64` (WAIT decision
stands); C1.7 EasyFlash; Matrix Cubed (inside a `.7z`, not auto-extracted by policy); M10.S4 /
M11.S5 (user-decision forks); the IDA `.sig` half (no licence); the P3.1 Savage Frontier VGA
archive contract (a multi-round item, not one sitting).

---

## Predictions to score this round against

| item | prediction | scored by |
|---|---|---|
| R1 | evidence total 58 → 74; area list gains `audio, ecl, graphics`; `KNOWN_MISSING` = 1; variant manifests = 3; Buck `web_level` unchanged (`preview`) | R1 report + Phase B step 3 |
| R2 | 16 ≤ undocumented ≤ 45; ≥ 16 with an e2e case; phantom documented routes = 0; extractor null = 89 | R2 report |
| R3 | cross-title pins 6/6, 1/6, 0/6, 0/8; Curse sweep 1 pair; Secret 1 pair with a single `k ∈ [0,17]`; shuffled max 0 | R3 report |
| R4 | ≥ 1 further STALE claim on a non-square map; 0 on square maps; 0 in engine tests | R4 audit doc |
| R5 | Pools: 5 categories, `Amiga (3), DOS-EGA (2)`; Gateway same shape; within-category `'mixed'` on no real route | R5 report + Phase B step 7 |
| R6 | ≥ 4 of 7 sites at Unmeasured/beyond-0x40 handlers; desync ≤ 5, cleanExit ≥ 20; `ecl2#32` unchanged | R6 report |
| gates | e2e total stays 172/172; `pnpm test:corpus` ≈ 1245 collected; build at 2 warnings | Phase B step 9 |

Wrong predictions are appended under "## Corrections to this plan, measured after it was
written", as the last plan did; this file is otherwise kept as the brief that was issued.

---

## Corrections to this plan, measured after it was written (2026-09-03)

Kept as issued above; the measurements below win where they differ.

| # | plan predicted | measured | note |
|---|---|---|---|
| R1 | evidence total 58 → 74; area list gains 3 entries | **58 → 77**; area list is **21** entries | the test counts one row per evidence STRING, not per area: `ecl` alone contributes 6 and `graphics` 7 |
| R2 | extractor null = exactly 89 `DEMOS` flags | **80** | the brief said "if your regex finds a different number, the regex is wrong". That was bad guidance and the agent correctly ignored it: it verified by hand and pinned 80 |
| R2 | 16 ≤ undocumented ≤ 45 | **41 undocumented, 1 phantom** | inside the band, but the carried-forward note had said "two `?import=` routes" |
| R3 | Curse/Secret sweeps yield ~1 pair each | **598 / 270 raw pairs** | byte 0 is a valid `cleric` code, so any constant-zero window trivially agrees over a 6-record party; a discriminating filter (class byte must vary) collapses Curse to exactly its 2 known real offsets |
| R3 | Secret = single contiguous insertion, one `k ∈ [0,17]` | **false** | class byte −9, level array +8; only the 17-byte gap growth matches the size delta. Verified as a property of the bytes by injecting a real 17-byte insertion into Curse and watching the sweep track it to one consistent `k` |
| R3 | Pools/Treasures 1 pair each | **0 discriminating pairs each** | reported with null (0/200) and nearest miss (Treasures 7/8) |
| R5 | badge reads `art: mixed — Amiga (3), DOS-EGA (2) of 5 categories` | **no mixed badge on either route** | Pools = 1 uniform `wall bricks (shared bank)` (DoK-style `singleBank` collapses sets 1-3); Gateway = 3 uniform `symbol set N`. Boot sets 0/4 never enter either route's DOS key space, so there is no DOS-EGA category to mix with |
| R4 | 4 of 5 named extra docs likely hold stale coordinates | **4 of them contain zero coordinate patterns** | the suspicion was unfounded rather than refuted |
| R6 | scope is `wordSetOverrides` only | also needed **`opcodeOverrides`** | `wordSetOverrides` cannot express "this opcode exists at all", and `0x41`/`0x43..0x4c` are new dispatcher entries with no base-table slot. Flagged by the agent as a judgment call rather than taken silently |

Predictions that held: R1's `web_level` unchanged at `preview` and `KNOWN_MISSING` = 1; R2's
"≥16 undocumented routes have a live e2e case"; R3's four cross-title counts (6/6, 1/6, 0/6, 0/8) and
shuffled null max 0; R4's zero stale claims on square maps and zero in engine tests; R6's
`desync ≤ 5`, `cleanExit ≥ 20`, and `ecl2#32` unchanged; and the gate predictions (e2e stays 172,
build at 2 warnings) — though `test:corpus` landed at 1,257, above the ≈1,245 estimate.
