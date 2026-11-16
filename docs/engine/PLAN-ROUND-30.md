# Round 30 plan — after the twenty-ninth handoff entry (branch `greybox`, base `806aaac`)

Planning only. Six parallel work items for separate Sonnet implementers on **one shared working
tree**, then a serialized single-writer tail for the files they would otherwise fight over. Every
item is provable from bytes already on disk (repo + the five documented source locations) and the
existing gates; none needs DOSBox-X, GameLink, an emulator, hardware or the user. Nothing here
re-plans the two genuinely trace-blocked items (seg051 RNG, the DQK ECL opcode table).

The shape of this round: **two items falsify a claim this project currently publishes** (R3: "Pools'
and Treasures' true layouts remain unknown"; R5: five green browser probes that cannot fail), **three
close a disclosed gap** (R1: `?module=1` does not reproduce its view; R2: no Secret importer; R6:
the ledger's thirteenth profile), and **one attacks the only numbered gap left in a shipped dialect**
(R4: Buck's three unmeasured opcodes). Three items add a browser route or case (R1, R2, R6), so the
full e2e total is expected to move **172 → 175** — stated here so a "175/175" in the next handoff is
read as the plan, and a "172/172" as three items not landing.

Every number in this plan that is called a *measurement* was produced on `806aaac` by the planner
before writing (the scripts are in the planner's scratchpad, not the repo); every number called a
*prediction* or *estimate* is labelled as such. The last plan asserted nine numbers it had not
measured and all nine were wrong. Where a brief says "measure X", the agent's report must state the
number it got and the code path that produced it, next to the number predicted here.

## What the carried-forward list looked like against the bytes

Every item was verified before it was planned. Two of the seven carried-forward statements are
misstated in a way that changes the brief, one is closed by decision, and one is larger than stated:

| carried forward | measured on `806aaac` |
|---|---|
| `?module=1` is written but never read; "the fix is to make `boot()` read the flag" | **Holds, and the fix is larger than a read arm.** `main.ts:1534` writes `?module=1` inside `onLibrarySelect` (`:1529-1541`) and `params.get('module')` appears nowhere in `apps/web/src`. But the Library is in-memory only — `library.ts:126` `const LIBRARY: LibraryEntry[] = []`, zero `localStorage`/`indexedDB` use in that file — and `startModuleExplore` (`moduleExplore.ts:656`) takes the whole `ModulePackage` object. A read arm has nothing to reload from. `moduleExplore.ts:489/511` persists only the *session* (pose/map) under `moduleSaveKey`, not the package. The route gate pins the defect at `tools/test_web_routes_documented.py:96-101`. Also stale in that file: `test_extractor_null_documented_count`'s docstring (`:117-124`) says "exactly 80 `DEMOS` entries" while its assertions (`:126-133`) pin **116** flags / **115** query flags. |
| Buck: 4 desyncs (2 unattributed); 11 `uncertain: true`; `0x42` and `0x2c PARLAY` unmeasured because their handlers call unidentified far routines | **Holds, and all three unmeasured opcodes (`0x29`, `0x2c`, `0x42`) are blocked on the same seven far-call targets** (`0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`, `0x653:0xe58`, `0xb8:0xb6`, `0xbe4:0x1b2b`, `0x10f:0x4d`; `buck-ecl-desyncs.md:47-54, 84-88`). `tools/map_buck_ecl_dispatch.py` stores Capstone's `op_str` for them and has **no segment-base knowledge**. The resolver already exists: `tools/vroomm_layout.py` (`classify_lcall_routes`, TPOV-aware, proven on Secret) — it had never been run on Buck. The planner ran it (read-only, output to scratch): **34 descriptors, `verified`, 4449 fixups, 4423 LCALLs, selector base `0x2d` (score 1066 / runner-up 514), routes `direct 23 / public_stub_owned 1058 / out_of_bounds 8 / unresolved_relocated_segment 3334`**; the seven targets' segment words are the four most-used ones (`0xbe4` 2046 sites, `0x653` 559, `0xb8` 209, `0x10f` 126) and all four are `unresolved_relocated_segment`. That class is the norm, not a Buck failure: Secret 3560/5360, Curse 3388/5368, CoK 3414/5305 (`vroomm-fixup-layout.md:19-27`). Also stale: `gen1-all-games-map.md:19` still says Buck `not_found` / requires `BUCK1.EXE`, while `gen1_map.py:70,311` now match on `BUCK.CFG`/`START.EXE`/`GAME.OVR`; `tools/gen1_ecl_encounter_scan.py:102` carries **7** Buck overrides and no extensions (the engine has 8 + 11); `0x31: 2` is measured and pinned in Python (`test_map_buck_ecl_dispatch.py:344-345`) but deliberately absent from `ECL_GEN1_BUCK` (`disassemble.ts:342-347`); `disassemble.ts:576`'s comment ("currently 0x1F") is stale; the ledger gap sentence at `goldbox_capabilities.json:1009` says both unattributed sites stop at a byte "whose handler calls an unidentified far routine", which is true of `ecl6#94` (opcode `0x29`) and not of `ecl6#99@0x2c0` (byte `0x80`, no handler at all). |
| Secret's offsets are known (`0x6c`/`0x111`) but no importer was built | **Holds.** Only name (PString@0), class@`0x6c` and `ClassLevel[8]`@`0x111` are byte-grounded (`secret-chrdata-layout.md:158-163` disclaims everything else). The planner measured two more anchors: the seven-pair ability block @`0x10` is the **unique** offset in the 439-byte record where all six records have six `(cur,max)` pairs with `cur == max`, values in 3..18, and party-varying values — the same offset as CoAB; and the two bytes before the class byte read `thac0`-shaped (`0x6a` = `[47,47,47,46,44,41]`; `0x3c - raw` = 13/13/13/14/16/19 for paladin 8 / ranger 8 / fighter 8 / f-t 7-8 / cleric 8 / mu 9). There is **one extra byte** between class and age (`0x6d`, values `[1,0,0,0,0,0]`) that CoAB does not have; `0x6e-0x6f` read age-shaped (`20,22,17,60,19,27`), `0x70` hpMax-shaped (`95,74,91,58,78,35`), `0x129` holds `0x32` on all six (CoAB's `baseAc` inverted-store value), and a LE dword at `0x12c` reads `200000/200000/200000/100000/200000/200000` (XP-shaped). **None of those semantics is verified**; they are R2's predictions. |
| Pools' and Treasures' 510-byte layouts remain unknown (0 discriminating offset pairs each) | **Misstated — the layouts are largely CoAB's, and the sweep's own summary hid it.** Applying the SAME class↔`ClassLevel[8]` bitmask oracle with the class byte at **`0xae`** and the level window at **`0x151`** accepts **5/6 Pools** and **7/8 Treasures** records (one miss each: Pools `ABAGAIL`, class 5 magic_user, window `00 00 00 00 00 0c 00 0b` — a nonzero in slot 7; Treasures `OUGO`, class 2 fighter, window `08 00 00 00 00 00 00 00` — level in slot 0 and another `08` at `0x15a`). `secret-chrdata-layout.md` already lists `(0xae, 0x151)` as Treasures' 7/8 nearest miss; it never tried Pools at that pair. The `0` came from requiring n/n agreement. Also measured: the name PString@0 decodes for 6/6 and 8/8; the ability block is again **uniquely** at `0x10` (6/6, 8/8); `0xac` reads `thac0`-shaped (Pools `[46,50,52,48,46,48]`), `0xad` race-shaped, `0xaf` the same extra byte Secret has, `0xb0-0xb1` age (`34,41,34,31,32,35`), `0xb2` hpMax-shaped (`89,116,120,98,92,96`); the five saving-throw-shaped bytes moved from CoAB `0xdf-0xe3` to `0x132-0x136`; `0x170` holds `0x32` on all 14 records; the party-slot byte (`0,1,2,…`) moved from CoAB `0x143` to `0x19c`. The two 510-byte titles share one layout. The single outlier per title is **unexplained** — R3's job, with a null. |
| Matrix Cubed is the ledger's one genuine gap; manifest `None` because policy does not auto-extract the `.7z` | **Holds, and the "policy" is prose, not code.** `PROFILES[12]` is `{"id": "buck-rogers-matrix-cubed", … "manifest": None}` (`goldbox_corpus.py:66`); the only sentence is `docs/goldbox-versions-holdings.md:28-30` ("does not vendor or auto-extract source archives"), repeated in `HANDOFF.md:591-593`. No `tools/*.py` encodes it. `CLAUDE.md` says extraction outputs go in `*_extracted/` (git-ignored, `.gitignore:5`). The archive `D:\Games\Emulator\DOS\Goldbox\buckrogers2_dos_win.7z` (2,115,754 B) lists with `C:\Program Files\7-Zip\7z.exe` (25.01) and `py7zr` 1.1.0 is importable: payload under `BuckRogers2\c\Matrix\` — **27 `.DAX`**, `GAME.OVR` (212,529 B, TPOV expected), `START.EXE` (70,277 B), `MATRIX.CFG`, three `.XMI`, five `.ADV`, `ITEMS`, `FATV9.*`, `SEG00036.*`, `SAVE\ME.STF`/`ME.WHO`; no `CHRDATA*`. `packages/engine/src/detect/profiles.ts:558-582` declares Matrix Cubed's DOS variant `graphicSet: 'dos-ega'` while Countdown's (`:467-481`) is `'dos-vga'` — one of the two is a guess. |
| Three `?query=` routes undocumented as deliberate default-arm aliases | **Closed by decision.** `test_web_routes_documented.py:83-94` records why documenting `?explore=cok`, `?import=1`, `?play=1` would make the page longer and less true. Dropped. |
| e2e assertions that cannot fail — "third round running" | **Measured for the first time as a census** (read-only, `e2e.mjs` at 16,773 lines): 286 negation guards, of which **~10** are genuinely unfalsifiable on a wrong-but-truthy value once each boolean is traced to its assignment; **35** optional-chained `window.__x?.y?.()` calls are never compared to a value; **0** empty `catch` blocks. Five probes are both weak and consequential: `cok-opening-commandant-service-not-used` (`e2e.mjs:2912`, the CoK `town_service` checkpoint in `goldbox_corpus_routes.json:49`, asserts a harness-local flag set at `:2889`), `ecl` (`:16235,16257`, `lines0.length > 0` / `blockId >= 0` — the exact stub-row bug `ecl-buck` was fixed for), `frua-heirs-route` (`:15481,15495`, `!window.__combat?.isOverlay?.()` passes vacuously if the hook is absent — the `__combat?.open?.()` shape again), `nwn-library-game-view` (`:405`, `rendered >= 0`), `explore-pool-holy-symbol-quest` (`:8225`, `if (!northeast \|\| !east)` on raw `move()` returns; the Pool `browser` checkpoint at `routes.json:177`). |

Ground rules carried from `CLAUDE.md`, `PLAN-ROUND-29.md` and the twenty-ninth entry, plus two
that round taught:

- A probe that cannot fail is not evidence: every new test/e2e assertion must be **seen red** under
  the named mutation, then restored. The report names the mutation and quotes the red output.
- The null must test the **alternatives**, not just the predecessor. Every claimed signal states
  the null and the number it produced next to the real number. A negative needs a null too.
- Structural constants (operand widths, offsets, enum values) are read from the **binary or the
  bytes**, never chosen because they make a corpus decode cleanly. Where a field's semantics cannot
  be given an independent check, the field ships **raw and unlabelled**, not guessed.
- A decoder nothing calls is not shipped; a `?query=` URL absent from `docs.ts` is not shipped.
  `tools/test_web_routes_documented.py` and `tools/test_capability_ledger_coverage.py` enforce
  both and are expected to go red mid-Phase-B by design — the steps below say when.
- Correcting a claim without correcting its check leaves the check stale: every ledger, doc or
  comment edit lands with the `tools/test_goldbox_corpus.py` (or other) edit that checks it, in
  the same Phase B step.
- **Measure before you predict.** If a brief's number disagrees with what you measure, the brief is
  wrong: verify by hand, pin what you measured, and report the plan as wrong. Never tune an
  extractor toward a predicted constant.
- **A scripted text replacement that emits a quote or escape into a `.ts` file is typechecked
  before it is reported done** (`pnpm -r exec tsc --noEmit`); `pnpm test:corpus` does not read
  TypeScript and passed straight over one such break last round.
- Agents **do not commit and do not deploy**. Each reports the exact file list, the mutation it
  watched fail, and the numbers. The lead commits one coherent commit per item with
  **`git commit -- <paths>`** (never a bare `git commit` on the shared tree).
- Hard constraints stated in every brief: game-data folders and the external sources (`D:\...`,
  `C:\Program Files (x86)\GOG Galaxy\Games\`) are **read-only, never vendored, never rewritten**;
  **never patch original EXEs on disk**; no DOSBox-X automation is planned, and if any agent thinks
  it needs one it stops and reports (if it were ever used, only the focusless GameLink protocol via
  `tools/dosbox_gamelink.py`, never SendKeys/SetForegroundWindow/SendInput).
- `tools/goldbox_capabilities.json` is **hand-formatted** (raw UTF-8, single-element arrays inline).
  A `json.dumps` round-trip rewrites the whole file. Edit it by anchored text replacement **sliced to
  the target profile first**. Phase B only.
- `apps/web/src/ui/*.ts` docblocks must **not** contain quoted game-data path literals —
  `scripts/bundle-assets.mjs` cannot tell a comment from a call site. `pnpm build:app` must stay at
  exactly its two documented tolerated warnings.
- Any e2e edit registers a new case in **three** places in `apps/web/test/e2e.mjs` — the
  `const runners = new Map([` registry at **`:16425`** (closing `]);` at `:16571`), the awaited list
  in `main()` (`:16586-16730`), and the single `results.unshift(...)` at **`:16744`** — and gives the
  case the registry key as its `id`. A case that needs no game data also joins the `dataIndependent`
  list at `:16741`. Do not move or rename the `const runners = new Map([` declaration —
  `tools/goldbox_corpus.py:_js_focused_block_lines` anchors on it and `test_goldbox_corpus.py` fails
  by design if it moves. `runners.size` is **171** today (135 explicit entries + the 36-entry
  `CASES` spread at `:16570`); results total 172 with `e2e-case-coverage`.

Standing gates (run from repo root) and their **measured** baselines on `806aaac`:

```powershell
pnpm --filter @goldbox/engine test          # 235 test files (ls count); 2,657 tests per the 29th entry
pnpm test:corpus                            # python -m pytest tools/ -q — 1258 collected
pnpm -r exec tsc --noEmit
pnpm build:app                              # 2 tolerated warnings, bundle index-2a0Ofrvp.js
$env:GB_E2E_ONLY='<case-id>'; pnpm --filter @goldbox/web e2e     # scoped iteration only
pnpm --filter @goldbox/web e2e                                   # full 172-case pass before landing (Phase B)
pnpm e2e:intros
```

Other baselines this plan is scored against: ledger **12** `profile_id`s (`goldbox_capabilities.json`
lines 7, 80, 164, 229, 304, 384, 493, 601, 703, 813, 918, 983; file is 1091 lines, last profile
closes at `:1089`); ledger evidence-reference count **77** (`test_goldbox_corpus.py:1806`) with the
area-level list at `:1813-1816`; `docs.ts` `DEMOS` **116** flags (115 query); `KNOWN_UNDOCUMENTED`
**4**, `KNOWN_PHANTOM` **0**; `GAME_IDS` **15** (`gameview.ts:177-192`); `DETECTED_TO_MANIFEST`
**15** keys (`main.ts:1394-1410`); `apps/web/games/` **15** manifests; Buck census
`{desync: 4, cleanExit: 21, ranOffEnd: 0}` (`buckEclDialect.test.ts:149-159`).

Phase A agents run the engine suite, `pnpm test:corpus`, `tsc` and (where their files are in the
bundle) `pnpm build:app`. They do **not** run the full browser harness; the lead does in Phase B.
Scoped `GB_E2E_ONLY` runs are allowed in Phase A where a brief names them.

---

## R1 — `?module=1` reproduces its view: persist the imported module, restore it on boot

**Why now.** The route gate pins `?module=1` as a defect, not a feature (`test_web_routes_documented.py:96-101`):
`main.ts:1534` writes it with `history.replaceState` when a `kind: 'module'` Library entry is
clicked, and nothing reads it back, so reload/share lands on the empty catalog. The one-line read
arm the handoff proposed cannot work — `library.ts:126` holds the Library in memory only and
`startModuleExplore(entry.pkg, …)` needs the package object. The honest fix is: persist the last
imported package text on import, and on `?module=1` re-run the **real** import path over the stored
text (so validation and provenance are recomputed, never trusted from storage) and open it.
Storage is the same per-viewer convenience the automap and journal already use (`automapPanel.ts:58/72`,
`journal.ts:46/56`), but the package can carry art (`buildTestModuleWithArtGbmod`), so use
**IndexedDB**, not `localStorage`; the reference module `packages/engine/test/fixtures/the-greyfen-beacon.gbmod`
is 1,503 bytes, which is the size the e2e will store.

**Read first.** `CLAUDE.md`; twenty-ninth `HANDOFF.md` entry (the `?module=1` paragraph);
`apps/web/src/ui/main.ts:1529-1541` (`onLibrarySelect`), `:1902-2054` (`boot()`, note the
`?automap=1` write/read pair at `:1055-1060` / `:2043-2044` as the shape to copy), `:1907`
(`setLibrarySelectHandler`); `apps/web/src/ui/library.ts` whole file — `LibraryEntry` (`:100`
discriminant), `LIBRARY` (`:126`), `getLibrary` (`:129`), `importModuleText` (`:332`), the
`kind: 'module'` construction sites (`:307, :568, :585, :597`), `renderLibrary` (`:821`, the
`.lib-entry` dataset at `:833-835`), `setupLibrary` (`:861`) and the e2e-only fixture seams near
`:911`; `apps/web/src/ui/moduleExplore.ts:489-511` (session persistence — the precedent for
try/catch storage), `:656` (`startModuleExplore` signature), `:818-885` (`window.__module` seam,
`__rendered`); `apps/web/src/ui/testFixtures.ts`; `apps/web/test/e2e.mjs:10994-11040`
(`module-library-boot`: the real click path), `:11298-11350` (`greyfen-reference-campaign`: the
file-input path and its `packageText === exactText` pin), `:16741` (`dataIndependent`);
`tools/web_routes.py:97-117, 142-154` (why adding a read arm does not change `handled_routes()`).

**Scope — files this agent owns (Phase A).**
- NEW `apps/web/src/ui/modulePersist.ts` — `saveLastModule({fileName, packageText, sha256?, importedAt})`,
  `loadLastModule()`, `clearLastModule()` over one IndexedDB object store (`greybox.modules`, key
  `last`). Every call wrapped so a throwing or absent `indexedDB` resolves to `null`/no-op (the
  artifact/thumbnail contexts and private windows the storage rules warn about). Store the exact
  **text** that was imported, never the deserialized object.
- `apps/web/src/ui/library.ts` — on every successful module import (all four `kind: 'module'`
  construction sites, or the single choke point they share if there is one — say which), call
  `saveLastModule`. Add and export `restoreLastModuleEntry(): Promise<LibraryEntry | null>` that
  loads the stored text, runs it through the same `importModuleText` path a user import takes,
  and returns the resulting entry (already in `LIBRARY`, already rendered). Expose it on the existing
  e2e seam object in `setupLibrary()` (`:911` region) as `restoreLastModule` so Phase A can prove it
  without `main.ts`.
- `apps/web/src/ui/moduleExplore.ts` — only if restoring needs a change there; the planner expects
  **none**. If you touch it, say why.
- NEW `docs/engine/research/module-url-roundtrip.md` — half a page: the design (why text, why
  IndexedDB, why re-import rather than deserialize), and the Phase A proof numbers below.
- Phase A proof (scoped e2e, no new case yet — `e2e.mjs` is Phase B): drive the existing
  `greyfen-reference-campaign` or `module-library-boot` steps in a throwaway script under your
  scratchpad (not in `apps/web/test/`), then `page.reload()` to the bare root, call
  `window.__greybox.restoreLastModule()` (or whatever the seam is named), and assert
  `getLibrary()` contains a `kind:'module'` entry with the same `moduleId`/`title`/`packageSha256`
  as before the reload. Report the stored record's byte length.

**Must NOT touch:** `main.ts`, `docs.ts`, `e2e.mjs`, `tools/test_web_routes_documented.py`,
`tools/web_routes.py` (all Phase B), `apps/web/src/ui/catalog.ts`, `packages/engine/**`.

**Acceptance.** `tsc` clean; `pnpm build:app` at its two warnings (this file is in the bundle); the
scoped existing cases `module-library-boot`, `module-import-validation`,
`module-authored-combat-provenance`, `greyfen-reference-campaign`, `module-art-panel` all still pass
(`GB_E2E_ONLY` each); the Phase A proof above passes; the report gives the stored byte length and
names every call site that now persists.

**Mutations (watch each red, restore).** (i) Make `loadLastModule()` return `null` → the Phase A
proof's post-reload restore returns `null` → red. (ii) Store `packageText + 'x'` → the re-import
must fail validation and `restoreLastModuleEntry()` must return `null` and leave `LIBRARY`
unchanged (proves stored bytes are re-validated, not trusted) → the proof's "entry present" assertion
red. (iii) Phase B: remove the `params.get('module')` arm → the new `module-url-reload` case red.

**Prediction.** Stored record for the Greyfen module ≈ **1.5 KB** (1,503 B of text plus the record
fields); the four `kind:'module'` construction sites share **one** persistence call site (estimate —
if they do not, list all four). After Phase B: `KNOWN_UNDOCUMENTED` **4 → 3**, `docs.ts` flags
**116 → 117** (query 115 → 116), e2e total **172 → 173**, `handled_routes()` unchanged in size
(the replaceState literal already contributed `?module=1`; the presence-only arm contributes the
same string — `web_routes.py:85-94, 102-117`).

**Hard constraints.** Read-only game data; no EXE patching; do not commit, do not deploy.

---

## R2 — `?import=secret`: the Secret of the Silver Blades pregen importer, every field with its own oracle

**Why now.** The twenty-ninth entry's own open list: "No importer was built for Secret despite now
knowing its offsets." The precedent is `?import=coab` (`importCoabParty.ts`, 340 lines; e2e
`import-coab` at `e2e.mjs:12725-12775`). What is known for the 439-byte record: name PString@`0x00`,
class@`0x6c`, `ClassLevel[8]`@`0x111` — and, from the planner's measurement in the table above,
the ability block is uniquely at `0x10` and a `thac0`-shaped byte sits at `0x6a`. Everything else is
a **prediction** in this brief and must earn its label with an independent check, or ship raw. There
is no Secret decompile (`coab_extracted/` is CoAB's; no `secret_extracted/`), so the oracles are:
CoAB's own field relationships (`Player.cs` citations in `coabSavedCharacter.ts:69-88`), the
engine's own AD&D 1e tables (THAC0 and XP thresholds in `packages/engine/src/ruleset/addnd1e/`),
and cross-record invariants over six real pregens.

**Read first.** `CLAUDE.md`; `packages/engine/src/loaders/coabSavedCharacter.ts` (whole file — the
offset table, `coabExpectedClassLevelSlots` `:144-166`, the `!== 422` throw at `:268-271`, and the
docblock's "carried RAW" discipline); `packages/engine/src/index.ts:1080-1091` (the export block to
mirror); `packages/engine/test/coabSavedCharacter.test.ts` (golden + shifted-offset + cross-title
tests); `apps/web/src/ui/importCoabParty.ts` (whole file: `COAB_CHRDATA_PATHS` `:106-113` and the
docblock at `:88-97` explaining why paths are absolute literals and why the *illustrative* ones are
not quoted; `CLASS_LEVEL_SLOT_TO_DL` `:124`, `COAB_RACE_TO_DL` `:139`, `classesFromLevels` `:167`,
`sheetFromCoabSaved` `:190`, `installImportCoabSeam` `:332`); `apps/web/src/ui/main.ts:1768-1827`
(`startImportCoab` — the panel you will move into your own module) and `:1981-1989` (the import
arm); `docs/engine/research/secret-chrdata-layout.md` (all of it, especially §5);
`tools/secret_chrdata_sweep.py:80-110` (the bitmask oracle — read, do not edit; R3 owns it);
`e2e.mjs:12725-12775`. Files: `C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades\CHRDATA{1..6}.SAV`
— **install root**, 439 B each; its `SAVE\` is empty. Read in place; never copy into the repo.

**Scope — files this agent owns (Phase A).**
- NEW `packages/engine/src/loaders/secretSavedCharacter.ts` — implemented as a **layout-parameterised**
  decoder: `export interface Gen1SavedCharacterLayout { size, name, abilities, thac0, race, class,
  age, hpMax, classLevel, baseAc?, exp?, … }`, `export const SECRET_SAVED_CHARACTER_LAYOUT`,
  `decodeGen1SavedCharacter(raw, layout)`, and the thin `decodeSecretSavedCharacter(raw)` /
  `sniffSecretSavedCharacter(raw)` (throws on `!== 439`). Reuse `COAB_CLASS_LABEL`,
  `COAB_CLASS_LEVEL_SLOT_LABEL`, `coabExpectedClassLevelSlots` by import — the sweep validated
  Secret against the same `ClassId`/`SkillType` enums. **A field enters the layout only with an
  oracle**; the docblock lists, per field, the check that admitted it. Fields with no check are
  carried in `raw` and exposed as `unverified: { offset, byte }` entries, not named.
  Oracles this brief expects you to run (report each as pass/fail with the six values):
  - `abilities@0x10`: the uniqueness sweep (only offset in 0..427 where all six records have six
    pairs in 3..18 with `cur == max`, values varying across the party) — planner measured **exactly
    one hit, `0x10`**; reproduce it.
  - `thac0@0x6a`: `0x3c - raw` must equal the engine's own 1e THAC0 for the pinned class/level
    (`addnd1e` table — cite the file and row); planner's values `[47,47,47,46,44,41]`.
  - `race@0x6b`: values `[6,6,6,3,6,6]`; CoAB's enum has human = 7, so this is **not** CoAB's enum
    or not race. Source Secret's own race table from its binary (`START.EXE`/`GAME.OVR` string
    table order — cite the file offset) or leave race **untranslated** and show the raw byte in the
    panel. Do not assume 6 = human.
  - `age@0x6e` (u16 LE) and `hpMax@0x70`: planner's readings `[20,22,17,60,19,27]` and
    `[95,74,91,58,78,35]`. Age: elf/half-elf ages should be the large ones (MALACHITE, f/t, 60).
    HP: must satisfy `level ≤ hp ≤ level × (class hit die + CON bonus)` under the pinned levels and
    the `con` pair at `0x18` — a weak bound; say so, and label HP as `hpMax (bounded, not proven)`
    if that is all you have.
  - `baseAc`: `0x32` at `0x129` on 6/6 (CoAB stores `0x32` at `0x124`); `exp`: LE u32 at `0x12c`
    = `200000 ×5, 100000` — must be ≥ the XP threshold for the pinned level and < the next
    (`addnd1e` XP table; cite). Report the one that fails if any.
  - The extra byte at `0x6d` (`[1,0,0,0,0,0]`; Pools has the same at `0xaf` with the same `1` on
    "Guy de Valois") — **unknown**; carry raw, do not name.
- NEW `packages/engine/test/secretSavedCharacter.test.ts` — golden pins for all six (names, class
  codes `3,4,2,14,0,5`, level arrays, the ability pairs), the shifted-offset negative (class read
  at `0x6b`/`0x6d` breaks the oracle 0/6), the `!== 439` throw, and — the null — that
  `decodeGen1SavedCharacter(curseRecord, SECRET_LAYOUT)` rejects 6/6 Curse records on the oracle.
  `it.skipIf` on the install being absent.
- `packages/engine/src/index.ts` — add the export block after `:1091`. (Only R2 touches this file
  this round.)
- NEW `apps/web/src/ui/importSecretParty.ts` — `importSecretParty(assetSource?)`,
  `installImportSecretSeam()` (`window.__importSecret.summary()/party()`), **and** the panel
  renderer `startImportSecretPanel(root)` so Phase B's `main.ts` edit is a three-line arm. Six
  absolute install-root literals (no `SAVE/` segment); the substitution/dropped-class disclosure
  contract identical to CoAB's; race untranslated unless you sourced the enum. **No quoted
  game-data path literals in any docblock** — follow `importCoabParty.ts:88-97`'s wording.
- `apps/web/src/ui/importCoabParty.ts` — export the translation helpers you reuse
  (`CLASS_LEVEL_SLOT_TO_DL`, `COAB_RACE_TO_DL`, `classesFromLevels`) with **no behaviour change**;
  scoped `import-coab` must still pass.
- NEW `docs/engine/research/secret-chrdata-fields.md` — the per-field oracle table (field, offset,
  six values, oracle, verdict), the sweep for `0x10`, and a "not claimed" section.

**Must NOT touch:** `main.ts`, `docs.ts`, `e2e.mjs`, `goldbox_capabilities.json`,
`test_goldbox_corpus.py`, `supportClaims.json`, `secret_chrdata_sweep.py` / its test / its doc (R3),
`coabSavedCharacter.ts`, `coabSavedCharacter.test.ts`.

**Acceptance.** Engine tests, `pnpm test:corpus`, `tsc` green; `pnpm build:app` at two warnings;
scoped `import-coab` still 1/1; the report lists every field with its oracle verdict, the fields
shipped raw, and the race decision with its evidence.

**Mutations.** (i) Change the layout's class offset to `0x6b` → the golden test's class codes and the
oracle test red. (ii) In the test's null, feed a Curse record → must be rejected; then temporarily
set the layout size to 422 and confirm the decoder still rejects on the oracle, not only on length.
(iii) Phase B: `main.ts` arm removed → `import-secret` red.

**Prediction.** 6/6 heroes import; class/level table exactly `Guy de Valois paladin 8 / PAINE ranger 8
/ EPONA fighter 8 / MALACHITE f-t 7-8 / DOMINIC cleric 8 / MORGAINE mu 9`; the THAC0 oracle passes
6/6 at `0x6a`; the XP oracle passes 6/6 at `0x12c`; race is **not** translatable from CoAB's enum
(two-sided: if you find Secret's own table and it maps 6 → human, land it with the citation); after
Phase B the evidence count moves **77 → 77 + k** where k is the number of new evidence strings you
cite (estimate 3–4; Phase B re-measures), e2e total +1.

**Hard constraints.** Read-only GOG folder; no EXE patching; do not commit, do not deploy.

---

## R3 — Falsify "Pools' and Treasures' true layouts remain unknown": the 510-byte record, with the outlier explained or reported

**Why now.** The ledger (`goldbox_capabilities.json:271`), `support-evidence.json:291` and
`secret-chrdata-layout.md:113-139` all say the 510-byte layouts are unknown, "0 discriminating pairs
each". The planner's measurement says otherwise (table above): the same oracle at `(0xae, 0x151)`
accepts 5/6 Pools and 7/8 Treasures, the ability block and name are at CoAB's offsets, and a dozen
other CoAB fields are visible at consistent shifts. The published number was an artefact of
requiring n/n agreement; the sweep tool's own report listed `(0xae, 0x151)` as Treasures' nearest
miss and stopped. What is genuinely open is the **one outlier per title**: Pools `ABAGAIL` (class 5,
`0x151..0x158` = `00 00 00 00 00 0c 00 0b`) and Treasures `OUGO` (class 2, `08 00 00 00 00 00 00 00`,
plus `08` at `0x15a`). CoAB has a `ClassLevelsOld[8]` at `0x111` (`Player.cs:447`, used at `:494`
for dual-class) directly after `ClassLevel`; whether the 510-byte window at `0x159` is that array is
**unknown** — Pools `PAINE` has `09` at `0x15c` (slot 3), but Secret's equivalent window carries small
values on single-class records too (`EPONA` `01 01`, `MORGAINE` `01 04` in slots 6-7), which argues
against a clean `ClassLevelsOld` reading there. Do not resolve this by picking the hypothesis that
makes the count n/n.

**Read first.** `CLAUDE.md`; `tools/secret_chrdata_sweep.py` (whole file) and
`tools/test_secret_chrdata_sweep.py` (every pin); `docs/engine/research/secret-chrdata-layout.md`
§3-§5; `packages/engine/src/loaders/coabSavedCharacter.ts:69-88` (the CoAB offset table and its
`Player.cs` citations — the field list to look for at shifted offsets); `coab_extracted/Classes/Player.cs:403-560`
(`ClassLevel`, `ClassLevelsOld`, `DualClassExceedsPreviousLevel`, sex/alignment/baseAc/exp/hitPointRolled);
`docs/engine/research/dok-save-key-sweep.md` (shuffled-null precedent); memory
`goldbox-the-null-decides-the-finding`. Files: Pools `…\Pools of Darkness\SAVE\CHRDATA{1..6}.SAV`,
Treasures `…\Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV`, both 510 B, read in place.

**Scope — files this agent owns (Phase A).**
- `tools/secret_chrdata_sweep.py` — extend, without changing any existing pinned number:
  (a) a `--pair C L` mode that scores one fixed pair and prints, per record, name / class code /
  window / expected mask / accept-or-miss; (b) a "best pair by count, not only n/n" summary
  (`top_pairs` with score) so a 5/6 is reported as a 5/6 and not folded into "0"; (c) an
  `--ability-sweep` that reproduces the `0x10` uniqueness measurement (six/seven `(cur,max)` pairs,
  3..18, `cur == max`, party-varying) with its own shuffled null; (d) a `--field-map` that prints, for
  a given title, the bytes at the CoAB-field offsets shifted by a candidate delta, so the report's
  field table is produced by the tool and not by hand.
- `tools/test_secret_chrdata_sweep.py` — add Pools/Treasures pins (skip if absent): `(0xae, 0x151)`
  scores **5/6** and **7/8**; it is the unique top-scoring discriminating pair in each title (state
  the runner-up score); ability sweep yields exactly `{0x10}` on all four titles; shuffled null
  (200 trials) max full-agreement pairs `0`, and max score at any pair ≤ a pinned bound you
  measure; the two outlier record names pinned (`ABAGAIL`, `OUGO`). If you explain the outliers,
  pin the explanation as a predicate that accepts 6/6 and 8/8 **and** still rejects the shuffled
  null; if you do not, pin them as misses with the hypothesis list.
- NEW `docs/engine/research/pools-treasures-chrdata-layout.md` — the field table (name, abilities,
  thac0, race, class, the extra byte at `0xaf`, age, hpMax, saving throws `0x132-0x136`, `ClassLevel`
  `0x151`, the `0x159` window, `0x32`@`0x170`, party slot `0x19c`, XP candidate at `0x172`), each
  row with its check and verdict; the outlier analysis with both hypotheses and the number each
  produces; a "what is NOT claimed" section; and the correction to the published sentence.
- `docs/engine/research/secret-chrdata-layout.md` — append a dated `> CORRECTION (R3, round 30)`
  under §3 (never rewrite the original lines): the `0 discriminating pairs` verdict was a
  threshold artefact; point at the new doc.

**Must NOT touch:** `coabSavedCharacter.ts`, `coabSavedCharacter.test.ts` (its four cross-title
counts at CoAB's offsets remain true and stay), `packages/engine/**` in general (no engine layout
this round — a layout constant nothing decodes with is a decoder nothing calls; R2's
`Gen1SavedCharacterLayout` is where a Pools/Treasures layout goes **next** round, once this doc
exists), `goldbox_capabilities.json` / `test_goldbox_corpus.py` / `supportClaims.json` (Phase B
rewrites the `:271` sentence), R2's files.

**Acceptance.** `pnpm test:corpus` green with the new pins; the report gives, per title: the
top pair and its score, the runner-up, the ability-sweep result, the shuffled-null numbers, the
outlier verdict, and the field table.

**Mutations.** (i) Pin Treasures at `(0xad, 0x151)` → 0/8 → red. (ii) Insert 17 zero bytes at `0x40`
into the Pools records → the top pair must move to `(0xbf, 0x162)` at the same 5/6 (the tool tracks
an insertion). (iii) Shuffle the class byte column across records → the pair's score must fall to the
null's level (proves the 5/6 is the party's own class variety, not a constant window).

**Prediction.** Pools `(0xae, 0x151)` = **5/6**, Treasures **7/8**, both unique top pairs; runner-up
≤ 3/6 and ≤ 4/8 (estimate); ability sweep `{0x10}` ×4; shuffled null max 0 n/n pairs. The outliers:
**unknown** — the planner's guess is that `ABAGAIL` and `OUGO` are dual-classed and the 510-byte
record does not store dual-class the way CoAB's does, but a guess is not a finding; the two-sided
deliverable is either a predicate that admits both with a null or the recorded miss.

**Hard constraints.** Read-only GOG folders; no EXE patching; do not commit, do not deploy.

---

## R4 — Buck's three unmeasured opcodes: resolve the seven far-call targets with the resolver the repo already has

**Why now.** `0x29 ENCOUNTER_MENU` (inherits `14`, unverified), `0x2c PARLAY` (inherits `6`) and
`0x42` (no entry) are the only opcodes whose word set could not be read from the handler, and all
three stop at far calls the map tool records as raw `op_str` strings (table above). `ecl6#94@0x50`
sits on `0x29`; whether `ecl6#99@0x2c0` is downstream of the same cause is unknown. The planner ran
`tools/vroomm_layout.py` on Buck's install: it **works** (34 descriptors, `verified`) and, like
every sibling, leaves most LCALL segment words `unresolved_relocated_segment` — the very words in
question. A naive `file = 512 + seg*16 + off` into `START.EXE` (MZ header 512 B, image 67,619 B)
puts all seven inside the image and two of them on far-function-prologue shapes (`0xbe4:0x62a` →
`0xc66a`: `mov bx,sp; les di,ss:[bx+4]; mov al,ss:[bx+8]; mov bl,al; xor bh,bh; mov cl,3; shr bx,cl`
— a far-pointer bit-test; `0x653:0x1359` → `0x7a89`: `mov bp,sp; sub sp,0x100; les di,[bp+8]; mov
al,es:[di]`), but the operand parser's own stub `0xb8:0x2a` lands at `0xdaa`, **4 bytes before**
descriptor 17's `INT 3F` stub array at `0xdae` (17 stubs, stride 5) — so the naive mapping is not
trustworthy and must be **calibrated on CoAB**, where `build/coab-oracle-map.json` and
`coab_extracted/` name what the same class of far call reaches. Descriptor 15's overlay code
begins at `GAME.OVR:0x1ca15`, exactly the offset the map tool reports for "Buck operand parser" —
i.e. that number is a descriptor start, which the calibration must explain.

**Read first.** `CLAUDE.md`; `docs/engine/research/buck-ecl-desyncs.md` (whole; the `0x29`/`0x2c`/`0x42`
paragraphs at `:47-54, 81-88`, the unattributed section `:160-176`); `docs/engine/research/buck-ecl-dispatch-map.md:1-33, 115-146`;
`tools/map_buck_ecl_dispatch.py:72-82, 85-153, 156-200, 203-298` and `tools/map_pool_ecl_dispatch.py:55-129`
(how CoAB's oracle offsets are used); `tools/vroomm_layout.py:33-46` (`FixupEntry`), `:234-330`
(`infer_stub_selector_base`, `classify_lcall_routes`); `tools/gen1_map.py:346-…` (`scan_descriptors`,
TPOV header) and `:478-…` (`resolve_selectors`, INT 3F stubs); `docs/engine/research/vroomm-fixup-layout.md`;
`build/coab-oracle-map.json` (function name → retail file offset); `packages/engine/src/ecl/disassemble.ts:319-413`;
`packages/engine/test/buckEclDialect.test.ts` (whole); `tools/gen1_ecl_encounter_scan.py:95-150`;
memory `goldbox-verify-gaps-against-binary`. Buck's install `D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\`
(read-only); CoAB's under the GOG path.

**Scope — files this agent owns (Phase A).**
- NEW `tools/buck_far_targets.py` — (1) run the `vroomm_layout` machinery on Buck **and** CoAB in
  memory; (2) on CoAB, take every `lcall` in the CoAB dispatcher's handlers whose `op_str` is an
  `unresolved_relocated_segment` word and whose true target is named by the oracle map (start
  with `@parse_command_sub$q4Byte` at `0x810a` and the handlers that call it), and find the mapping
  `seg:off → (START.EXE resident file offset | descriptor + stub index → GAME.OVR proc)` that lands
  on the oracle-named function for **≥ 10 distinct CoAB calls**, reporting the count that fit and
  the count that did not; (3) apply that mapping to Buck's seven targets and disassemble each
  destination (Capstone, first 40 instructions) into the report; (4) emit JSON. If no single mapping
  explains ≥ 10 CoAB calls, **stop and report the fit table** — that is a landable negative.
- `tools/map_buck_ecl_dispatch.py` — for each `different_far_call_target` handler, if
  `buck_far_targets` resolved its calls, attempt the operand count **from the resolved callee's own
  body** (does it call the derived operand parser `0xb8:0x2a`? with what `mov al,N` prefetch? or is
  it a prompt/keypress/flag routine that consumes no script bytes — quote the instructions). Emit
  the new column; regenerate `docs/engine/research/buck-ecl-dispatch-map.md`.
- `tools/test_map_buck_ecl_dispatch.py` — pin the new column for `0x29`, `0x2c`, `0x42`; the
  existing `stop_reasons` pins at `:326-337` move only if the reason changes (say which).
- `packages/engine/src/ecl/disassemble.ts` — `ECL_GEN1_BUCK` only: add/adjust entries **only** for
  counts read from a resolved handler body, each with the callee file offset in the docblock; fix
  the stale `:576` comment ("currently 0x1F" → name the Buck and Gen2 sets too). Decide `0x31`
  (`:342-347`): run the 6-bit-string menu-label check the docblock describes and either land
  `0x31: 2` with the evidence or write down the specific reason it stays out.
- `packages/engine/test/buckEclDialect.test.ts` — census and attribution pins move only if the
  numbers move; add a pin that the eleven extension entries carry `uncertain: true` (currently
  nothing pins it; the only consumer is red text at `render/eclInspector.ts:127`).
- `tools/gen1_ecl_encounter_scan.py:102-108, 144-150` — sync `GEN1_BUCK_WORD_SETS` to the engine
  (it lacks `0x3c: 0` and every extension) and add the Buck `PROFILE_EXTENDED_OPCODES` entry; if a
  test pins its output for Buck, update it in the same edit (grep `buck` in `tools/test_gen1_ecl_encounter_scan*.py`).
- `docs/engine/research/buck-ecl-desyncs.md` — append a dated section: the seven targets with
  their resolved locations and disassembly, the three verdicts, the census before/after, and what
  `ecl6#99@0x2c0` does after the change.
- Optional, only if the regeneration diff is confined to Buck's rows: `python tools/gen1_map.py`
  to refresh `docs/engine/research/gen1-all-games-map.md:19-20` (Buck `not_found`/`BUCK1.EXE` is
  stale against `gen1_map.py:70,311`). Otherwise report the staleness for Phase B.

**Must NOT touch:** `eclInspector.ts`, `docs.ts`, `main.ts`, `e2e.mjs`, the Buck manifests,
`goldbox_capabilities.json`, `supportClaims.json`, every other dialect constant in `disassemble.ts`,
`vroomm_layout.py` / `gen1_map.py` themselves (import them; if one needs a change to accept Buck,
report the exact edit for Phase B instead of making it).

**Acceptance.** Engine tests, `pnpm test:corpus`, `tsc` green. Report: the CoAB calibration table
(calls tried / fit / did not fit); per Buck target: resolved location, the first instructions, and
what it consumes; the three opcode verdicts with the instruction that gave each count; the census
under the final dialect **and** under `ECL_GEN1` / `_SHORT` / `_GATEWAY` / `_TREASURES` / `_POOLS`;
whether `ecl2.dax#32-35` disassemble identically before and after (the `ecl-buck` e2e pins `#32` at
8 instructions, first vaddr `0x8014`, ending in EXIT).

**Nulls / mutations.** (i) For every new count, the corpus sweep 0..8 for that opcode alone, with the
desync count at each value, published next to the binary-read value (the `0x21`/`0x4c` discipline).
(ii) Revert one new entry → the census pin red. (iii) Set a new count to `+1` → a different census.
(iv) Calibration null: apply the CoAB-fitted mapping to 10 CoAB calls whose targets the oracle names
but that were **not** used to fit — report how many land.

**Prediction.** The CoAB calibration finds a mapping that fits **≥ 10** calls (two-sided: if the
`0xb8`-class and the `0xbe4`-class need different mappings, report both); **≥ 2** of the three opcodes
get a binary-read count; `0x2c PARLAY` is the one most likely to read as **0** script operands
(a fixed-string Y/N prompt, per `buck-ecl-desyncs.md:86-88`) — but that is a guess and a count of
0 lands only with the callee's instructions quoted; census **`desync: 4 → ≤ 3`**; `ecl2#32`
unchanged; `0x31` decided either way.

**Hard constraints.** Read-only Buck and CoAB installs; `GAME.OVR`/`START.EXE` are read, never
patched; no DOSBox-X; do not commit, do not deploy.

---

## R5 — Adversarial: a standing audit of browser probes that cannot fail, and the five that back a ledger checkpoint

**Why now.** Three rounds running, a green assertion turned out to be unfalsifiable, and each was
found by accident. The planner's census (table above) is the first systematic pass; it found
**35** optional-chained `window.__x?.y?.()` calls never compared to a value and five weak probes
that carry weight: `cok-opening-commandant-service-not-used` (`e2e.mjs:2912`; the flag it tests is
set by the harness's own click logic at `:2889`; it is the `town_service` checkpoint at
`tools/goldbox_corpus_routes.json:49`), `ecl` (`:16235` `lines0.length > 0`, `:16257` `blockId >= 0`),
`frua-heirs-route` (`:15481`, `:15495` — `!window.__combat?.isOverlay?.()` is `true` when the hook is
missing), `nwn-library-game-view` (`:405` `rendered >= 0`, `min: 0` at `:411`), and
`explore-pool-holy-symbol-quest` (`:8225` `if (!northeast || !east)` on raw `move()` returns; the
`browser` checkpoint at `routes.json:177`). `tools/goldbox_corpus.py:143-255` checks only that a
marker string sits in code `main()` reaches — not whether the assertion at it can go red. This item
lands the audit as a gate (Phase A) and strengthens the five (Phase B, `e2e.mjs` is serialized).

**Read first.** `CLAUDE.md`; twenty-ninth `HANDOFF.md` entry ("The two e2e probes that 'covered'
this could not fail"); memory `goldbox-probe-must-be-able-to-fail`; `tools/goldbox_corpus.py:143-255`
(`E2E_REACHABILITY_REFS`, `_js_focused_block_lines`, `marker_reaches_live_code`) and
`tools/test_goldbox_corpus.py:1197-1260`; `tools/goldbox_corpus_routes.json` (every
`verification.checkpoints` marker); `apps/web/test/e2e.mjs:2860-2930` (`driveCokOpeningToTravel`),
`:8200-8380` (`runExplorePoolHolySymbolQuest`), `:15440-15500` (`runFruaHeirsRoute`),
`:16200-16270` (`runEclInspector`), `:380-412` (`runNwnLibraryGameView`), `:12826-12861`
(`ecl-buck` — the fixed sibling and its docstring); `apps/web/src/ui/explore.ts:6031`
(`window.__cokOpening.memory()`), `apps/web/src/ui/eclInspector.ts:107, 391-406`
(`blockIds: [18, 34, 80, 97, 68]`, `__ecl.state()/lines()`).

**Scope — files this agent owns (Phase A).**
- NEW `tools/e2e_probe_audit.py` — pure-Python extractors over `e2e.mjs`: (a)
  `uncompared_hook_calls()`: every `window.__<hook>?.<m>?.(` (and the non-optional `window.__<hook>.<m>(`
  inside a `page.evaluate` string) on a line with **no** `===`/`!==`/`>=`/`<=`/`>`/`<`/`.includes(`/
  `.test(`/`JSON.stringify(` applied to the same expression — return `(line, function, text)`;
  (b) `threshold_only_guards()`: `>= 0`, `>= 1`, `> 0`, `.length > 0` assertions with no exact pin
  in the same `pass =` / `ok =` conjunction; (c) `harness_local_flags()`: `errors.push('<marker>')`
  guards whose boolean is assigned only from harness variables (no `page.evaluate` in the
  assignment's data flow within the function) — state the heuristic precisely and print what it
  cannot classify. Each returns a sorted list keyed by the nearest preceding `function` name.
- NEW `tools/test_e2e_probe_audit.py` — pins: (1) the extractor's null on a synthetic snippet (one
  compared call, one uncompared, one `.includes`) → exactly one hit; (2) `uncompared_hook_calls()`
  on the real file equals a pinned `KNOWN_UNCOMPARED` set of `(function, line-text)` tuples —
  **exact**, measured (planner's count 35; if yours differs, yours wins and you say why); (3) a
  pinned `KNOWN_WEAK_CHECKPOINT_PROBES` set naming the five above by `(function, marker-or-text)`,
  asserting each is still present (Phase B shrinks it to `set()`); (4) every marker in
  `goldbox_corpus_routes.json` resolves to a guard the audit classifies as **value-pinning**,
  except those in `KNOWN_WEAK_CHECKPOINT_PROBES` — so a future checkpoint on a harness-local flag
  goes red.
- NEW `docs/engine/research/e2e-probe-audit.md` — the census numbers, the five probes with the
  exact replacement Phase B will write (below), and the regexes.
- For each of the five, **prove the weakness at the browser layer in Phase A** without editing
  `e2e.mjs`: a scratch script that runs the case's steps and then substitutes the wrong-but-truthy
  value (e.g. for `ecl`: pin that a one-row stub satisfies `lines0.length > 0`; for
  `frua-heirs-route`: `delete window.__combat` before the negative arm and show the conjunction
  still holds; for the commandant flag: show `usedTownService` is true with `__cokOpening.memory()`
  unchanged). Report each as "weak: confirmed / not confirmed" with the observation.
- The replacements Phase B applies (write them into the doc, ready to paste):
  - `:2912` → pin the ECL word the COMMANDANT branch writes: diff `window.__cokOpening.memory()`
    before/after the commandant turn in your scratch run, pick the address(es) that change, and
    pin `memory[addr] === value` (the same shape as `:5245`'s `areaMemory(0x4c4b) === 0x08`). If
    no word changes, pin the commandant turn's `window.__dialogue.text()` retail string instead, as
    `:2911` does — and say that the branch is display-only.
  - `:16235/:16257` → `lines0[0].vaddr === <measured>`, `lines0.length >= 8 && lines0.some(EXIT)`,
    and `nextOk = blockId === 34` (the second of `eclInspector.ts:107`'s `blockIds`).
  - `:15481/:15495` → `window.__combat === undefined || window.__combat.isOverlay() === false`,
    preceded by a positive proof the hook is live on the same page (the `:15821` shape).
  - `:405` → `(rendered === 0 && dataAbsent(errors)) || rendered === 256` (the cell count
    `library-boot-graphics` pins at `:10794`), or the retail `headerText` string as `:822` does —
    measure which the route produces.
  - `:8225` → the destination pose JSON after the two moves (read `__explore.getPose()` at
    `:8230-8235`) and `areaMemory(0x49c5)`'s value.

**Must NOT touch:** `e2e.mjs`, `goldbox_corpus_routes.json`, `goldbox_corpus.py`,
`test_goldbox_corpus.py`, `explore.ts`, `eclInspector.ts` (all Phase B or other owners).

**Acceptance.** `pnpm test:corpus` green with the new file; the report gives the three extractor
counts, the five browser-layer weakness confirmations with observations, and the five replacement
snippets with the measured values they pin.

**Mutations.** (i) In a scratch copy of `e2e.mjs`, change one compared hook call to uncompared →
`KNOWN_UNCOMPARED` mismatch red. (ii) Add a fake checkpoint marker to a scratch copy of
`routes.json` pointing at a threshold-only guard → test 4 red. (iii) Phase B: after each
replacement lands, the named wrong-but-truthy substitution (e.g. `delete window.__combat`) must turn
the case red at the browser layer, then restore.

**Prediction.** `uncompared_hook_calls()` = **35** (measured by the planner's regex; yours may
differ — pin yours); all five weaknesses **confirmed** at the browser layer; after Phase B:
`KNOWN_UNCOMPARED` **35 → 33** (the two FRUA lines), `KNOWN_WEAK_CHECKPOINT_PROBES` **5 → 0**, e2e
total unchanged by this item, and each of the five mutations red.

**Hard constraints.** Read-only game data; no EXE patching; do not commit, do not deploy.

---

## R6 — Matrix Cubed: the thirteenth profile, from an extraction the conventions already allow

**Why now.** `tools/test_capability_ledger_coverage.py:130` pins 13 `PROFILES`; the ledger has 12;
`supportClaims.json:100-107` already carries Matrix Cubed at `web_level: "missing"`. The gap is
disclosed in three places and rests on a sentence in prose (`goldbox-versions-holdings.md:28-30`)
that no tool encodes, while `CLAUDE.md` and `.gitignore:5` provide exactly the mechanism: extract
into `*_extracted/`. This item does the one-time extraction into `matrixcubed_extracted/`
(git-ignored, never committed), inventories the DAX corpus with the existing decoders, tests the
`dos-ega` detection claim against bytes, and prepares the manifest and profile as **staged JSON in a
research doc** — because dropping the manifest file into `apps/web/games/` in Phase A would turn
`test_capability_ledger_coverage.py` test 2 and the `manifest-picker-coverage` e2e red on the shared
tree for every other agent. Phase B lands the file, the `PROFILES` key, the ledger entry, the
picker/detection registries, the docs entry and the e2e case **in one step**, atomically.

**Read first.** `CLAUDE.md` (source locations, `*_extracted/` convention); `docs/goldbox-versions-holdings.md:25-32, 62, 108-114, 220-221`;
`tools/goldbox_corpus.py:38-67` (`BUCK_ROOT`, `PROFILES`), `:1439-1446` (`resolve_manifest_asset`,
`inspect_manifest`), `:340-392` (`validate_capability_contract`); `tools/test_capability_ledger_coverage.py`
(all three tests); `tools/goldbox_capabilities.json:982-1089` (Buck's profile — the formatting
exemplar and the sibling whose claims you will NOT copy without measuring); `apps/web/games/buck-rogers-countdown-to-doomsday.json`
(row shape; note it uses absolute `D:/…` paths while `champions-dos.json` uses repo-relative
`Champions of Krynn/…` — repo-relative resolves via `goldbox_corpus.py:1439-1441` and
`catalog.ts:279-290`, and `scripts/bundle-assets.mjs:40-50` copies both kinds);
`packages/engine/src/detect/profiles.ts:467-482` (Countdown, `dos-vga`) and `:558-582` (Matrix,
`dos-ega`), `packages/engine/test/detect.test.ts:115, 266, 292-295`; `tools/dax_inspect.py`,
`tools/dax_decode.py`, `docs/dax-format.md`; `e2e.mjs:487-660` (`buck-rogers-view` /
`buck-rogers-amiga-view` — per-file frame-count pins, the model for the new case);
`tools/test_goldbox_corpus.py:78-113` (the Buck/Matrix `.CFG` discriminator test).

**Scope — files this agent owns (Phase A).**
- NEW `tools/matrix_cubed_extract.py` — idempotent: if `matrixcubed_extracted/BuckRogers2/c/Matrix/MATRIX.CFG`
  exists, do nothing; else extract the archive with `py7zr` (fallback `C:\Program Files\7-Zip\7z.exe x`)
  into `matrixcubed_extracted/`, then print a manifest of every extracted file with size and
  SHA-256. **Never write under `D:\`**; never extract anywhere but `matrixcubed_extracted/`.
- NEW `tools/test_matrix_cubed_inventory.py` — skip if the extraction dir is absent. Pins: file
  count and the 27 `.DAX` names; `dax_inspect --verify` closes the offset chain on **every** `.DAX`
  (count of containers and members — measure); `GAME.OVR` magic (`TPOV` predicted — measure);
  decoded frame totals per picture archive via the same path `dax_decode.py` takes for Countdown;
  and the discriminator: the set of basenames shared with Countdown vs Matrix-only (the
  `test_goldbox_corpus.py:92-103` `shared_buck` set must be a subset of what you extracted).
- The **detection claim**: find the byte-level property that distinguishes a `dos-vga` Gen1 DAX
  install from a `dos-ega` one in this repo's own terms (what does the engine do differently for
  `gateway`/`treasures`/`pools`/Countdown vs `secret`? — read `packages/engine/src/loaders/dax.ts`
  and the manifests' `platform`/`display` and cite the mechanism), apply it to Matrix Cubed's
  bytes, and either correct `profiles.ts:567` to `'dos-vga'` with `detect.test.ts` updated in the
  same edit, or write down that the property cannot be read from bytes and leave it. Do not flip it
  because Countdown says VGA.
- NEW `docs/engine/research/matrix-cubed-profile.md` — (1) the extraction record (archive SHA-256,
  file list, sizes); (2) the inventory numbers; (3) the **staged manifest** as one fenced JSON block,
  `id: buck-rogers-matrix-cubed`, repo-relative paths under `matrixcubed_extracted/…`, one row per
  `.DAX` and `GAME.OVR` with `decode:false` where the Countdown manifest has it, `note`s only for
  things you measured; (4) the **staged ledger profile** as one fenced JSON block in the Buck
  profile's exact formatting, every status `unsupported` except `graphics: partial` (asset-browser
  level, with the measured frame total) and whatever `ecl`/`ruleset` you can honestly claim
  (the `buckrogers` ruleset applies by `profiles.ts:561`; ECL: **nothing** — no dialect has been
  derived for Matrix Cubed and `ECL_GEN1_BUCK` must not be assumed to apply); (5) a scratch-run
  result of `validate_capability_contract(profile)` = `verified-contract` with every evidence path
  resolving, and the evidence-string count the profile adds (Phase B needs it for `:1806`).
- `docs/goldbox-versions-holdings.md` — append a dated note under §3c (`:108-114`): extracted to
  `matrixcubed_extracted/` on this date, inventory numbers, and that the "does not vendor or
  auto-extract" sentence stands for the corpus tool (nothing auto-extracts) while the one-time
  extraction follows `CLAUDE.md`'s `*_extracted/` convention. Never rewrite `:28-30`.
- `packages/engine/src/detect/profiles.ts` (`:558-582` only) and `packages/engine/test/detect.test.ts`
  (Matrix rows only) — only if the detection claim is falsified by bytes.

**Must NOT touch:** `apps/web/games/*` (Phase B lands the file), `tools/goldbox_corpus.py`,
`goldbox_capabilities.json`, `test_goldbox_corpus.py`, `test_capability_ledger_coverage.py`,
`gameview.ts`, `main.ts`, `docs.ts`, `e2e.mjs`, `supportClaims.json`, the Countdown manifest,
anything under `D:\`.

**Acceptance.** `pnpm test:corpus` green with the inventory test collected; engine tests green;
the report gives the inventory numbers, the frame total, the detection verdict with its byte
evidence, and the staged JSON's validator result.

**Mutations.** (i) Delete one `.DAX` name from the inventory pin → red. (ii) Remove one evidence path
from the staged profile in the scratch validator → it must fail on that path. (iii) If `profiles.ts`
changes: revert it → `detect.test.ts` red.

**Prediction.** Extraction: **58 files / 7 folders, 27 `.DAX`**, `GAME.OVR` magic `TPOV`
(Countdown's is TPOV; Matrix Cubed's is a prediction), all `.DAX` chains close; frame total —
**no number predicted** (measure it; the last plan's copied "489/454" style numbers are exactly
what this discipline exists for); the `dos-ega` claim is **more likely wrong than right** (two-sided;
land the bytes either way). After Phase B: ledger **12 → 13**, `GAME_IDS` **15 → 16**,
`DETECTED_TO_MANIFEST` **15 → 16**, manifests **15 → 16**, `KNOWN_MISSING` stays `set()`, e2e +1,
Matrix's `web_level` moves off `missing` only if the corpus derives it (Phase B measures with the
ledger monkeypatched, as round 29's R1 did).

**Hard constraints.** The `.7z` and everything under `D:\` are read-only; the extraction lives only
in git-ignored `matrixcubed_extracted/`; no EXE patching; do not commit, do not deploy.

---

## Dispatch order

**Phase A — fully parallel (six agents, disjoint files):**

| item | owns (Phase A) |
|---|---|
| R1 | NEW `apps/web/src/ui/modulePersist.ts`, `apps/web/src/ui/library.ts`, `apps/web/src/ui/moduleExplore.ts` (only if needed), NEW `docs/engine/research/module-url-roundtrip.md` |
| R2 | NEW `packages/engine/src/loaders/secretSavedCharacter.ts`, NEW `packages/engine/test/secretSavedCharacter.test.ts`, `packages/engine/src/index.ts`, NEW `apps/web/src/ui/importSecretParty.ts`, `apps/web/src/ui/importCoabParty.ts` (exports only), NEW `docs/engine/research/secret-chrdata-fields.md` |
| R3 | `tools/secret_chrdata_sweep.py`, `tools/test_secret_chrdata_sweep.py`, NEW `docs/engine/research/pools-treasures-chrdata-layout.md`, `docs/engine/research/secret-chrdata-layout.md` (append-only) |
| R4 | NEW `tools/buck_far_targets.py`, `tools/map_buck_ecl_dispatch.py`, `tools/test_map_buck_ecl_dispatch.py`, `docs/engine/research/buck-ecl-dispatch-map.md` (regenerated), `docs/engine/research/buck-ecl-desyncs.md` (append), `packages/engine/src/ecl/disassemble.ts` (`ECL_GEN1_BUCK` + the `:576` comment only), `packages/engine/test/buckEclDialect.test.ts`, `tools/gen1_ecl_encounter_scan.py` (+ its Buck test rows), optional `docs/engine/research/gen1-all-games-map.md` + `build/gen1-all-games-map.json` (regenerated only if the diff is Buck-only) |
| R5 | NEW `tools/e2e_probe_audit.py`, NEW `tools/test_e2e_probe_audit.py`, NEW `docs/engine/research/e2e-probe-audit.md` |
| R6 | NEW `tools/matrix_cubed_extract.py`, NEW `tools/test_matrix_cubed_inventory.py`, NEW `docs/engine/research/matrix-cubed-profile.md`, `docs/goldbox-versions-holdings.md` (append), `packages/engine/src/detect/profiles.ts` (`:558-582` only, conditional) + `packages/engine/test/detect.test.ts` (Matrix rows only, conditional), git-ignored `matrixcubed_extracted/` |

Cross-check of the collision surface: no file appears in two rows. `packages/engine/src/index.ts`
is R2's alone. `explore.ts`, `eclInspector.ts`, `dqkExplore.ts`, `geo.ts`, `gameData.ts`, `dax.ts`,
`catalog.ts`, `vroomm_layout.py`, `gen1_map.py`, `goldbox_corpus.py`, `goldbox_corpus_routes.json`
are read-only for everyone this round. `coabSavedCharacter.ts` and its test are touched by nobody
(R2 imports; R3's cross-title counts at CoAB's offsets are unchanged). If any agent finds it must
edit a file outside its row, it stops and reports instead of editing.

**Phase B — serialized, single-writer (the lead, one item at a time, in this order), after each
Phase A item has been reviewed and committed with `git commit -- <paths>`:**

1. **[R5] `apps/web/test/e2e.mjs`** — apply the five replacements from `e2e-probe-audit.md` at
   `:2912`, `:16235`/`:16257`, `:15481`/`:15495`, `:405`, `:8225` (line numbers move as edits land;
   anchor on the quoted text). Each: scoped run green, then the named wrong-but-truthy mutation at
   the browser layer (e.g. `delete window.__combat`; a one-row stub for `ecl`; `usedTownService`
   forced true with memory unchanged) seen **red**, restore. Then `tools/test_e2e_probe_audit.py`:
   `KNOWN_WEAK_CHECKPOINT_PROBES = set()` and shrink `KNOWN_UNCOMPARED` by exactly the lines that
   changed — watch test 3 red before the shrink. No new case; `runners.size` stays 171.
   Marker strings in `goldbox_corpus_routes.json` are **kept verbatim** so reachability is unchanged
   (`test_goldbox_corpus.py:1197-1260` must stay green). `pnpm test:corpus`.
2. **[R1] `apps/web/src/ui/main.ts`** — between the `automap` arm (`:2043-2044`) and the `gameId`
   fallback (`:2045`): `} else if (params.get('module') !== null) { const entry = await
   restoreLastModuleEntry(); if (entry) onLibrarySelect(entry); else setStatus('No imported module
   is stored in this browser — import one from the Library.'); }` (exact wording is the lead's; the
   contract is: restored → the same `onLibrarySelect` path as a click, so `?module=1` is re-written
   and `startModuleExplore` runs; not restored → an honest status, no throw). Import
   `restoreLastModuleEntry` from `./library.js`. **`apps/web/src/ui/docs.ts`**: one `DEMOS` entry
   `flag: '?module=1'`, `name: 'Reopen the last imported module'`, `sub` stating it re-imports the
   package this browser stored on the last Library import and says so when nothing is stored — no
   quoted paths. **`apps/web/test/e2e.mjs`**: NEW case `module-url-reload` — import the Greyfen
   module through the real Library path (copy `:11298-11350`), `goto('${BASE}/?module=1')`, assert
   `window.__module.loaded() === true`, `window.__module.title() === 'The Greyfen Beacon'`,
   `window.__rendered === 3` (the value `:11327` already pins), and that
   `location.search === '?module=1'` after the restore; then clear the store (seam) and reload
   `?module=1` → assert `window.__module` is `undefined` **and** the status text names the Library
   (the negative arm). Register in the registry (`:16425` block), the `main()` list, the
   `dataIndependent` list (`:16741`) and `results.unshift` (`:16744`); `id: 'module-url-reload'`.
   Watch it red under R1's mutation (iii) (remove the arm), restore. **`tools/test_web_routes_documented.py`**:
   remove `"?module=1"` and its comment from `KNOWN_UNDOCUMENTED` (`:96-101`), replace the comment with
   one line saying round 30 made it a real route; `:126-133` `116 → 117`, `115 → 116`; fix the
   docstring at `:117-124` ("exactly 80" → the real count, and drop the sentence about the stale
   `89`). Watch test 2 red between the `docs.ts` edit and the shrink. `tsc`, `pnpm test:corpus`,
   `pnpm build:app` (two warnings).
3. **[R2] `apps/web/src/ui/main.ts`** — in the import arm (`:1981-1989`): `else if (params.get('import')
   === 'secret') await startImportSecret();` where `startImportSecret` is a ≤ 10-line wrapper calling
   R2's `startImportSecretPanel` and `installImportSecretSeam` (mirror `:1768-1827`'s
   `closeMajorViews`/`__rendered` contract); a Library sidebar entry next to `:1321` writing
   `?import=secret`; update the arm's comment block. **`docs.ts`**: `DEMOS` entry `?import=secret`
   next to `:172`, `sub` naming the six install-root pregens, the fields shipped raw, and the race
   decision R2 reported. **`e2e.mjs`**: NEW case `import-secret` modelled on `:12725-12775`: `count
   === 6`, the six names, the class/level table R2 pinned, `hp`/`thac0` only if R2 verified them
   (otherwise assert the raw byte the panel shows), `dataAbsent` skip path; three registrations +
   `id`. Watch red under R2's mutation (iii). **`tools/goldbox_capabilities.json`** sliced to the
   Secret profile (`:918-981`): `retail_save.import` `status: "unsupported"` → `"partial"`, `scope`
   → the pregen-only scope, `evidence` → `secretSavedCharacter.ts`, its test, `importSecretParty.ts`,
   `secret-chrdata-fields.md`, `gaps` → race untranslated (if so), fields shipped raw, no party/quest
   save; then sliced to the Curse profile, the `:271` sentence: replace "No importer was built for
   it, and Pools' and Treasures' true layouts remain unknown (0 discriminating pairs each)." with
   the R2 + R3 state (importer at `?import=secret`; Pools/Treasures class/level at `(0xae, 0x151)`
   5/6 and 7/8 with the outliers named, per `pools-treasures-chrdata-layout.md`). `git diff --stat`
   must show edits inside those two profiles only. **`tools/test_goldbox_corpus.py:1806`** `77 → 77 + k`
   (k = R2's evidence-string count; re-measure, do not add); any phrase assertion on Secret's or
   Curse's import text updated in the same step (grep `retail_save` in that file). Regenerate
   `apps/web/src/generated/support-evidence.json` with `python tools/goldbox_corpus.py --strict`;
   `supportClaims.json` Secret text only if `validate_support_claims` demands it (report either
   way). `tsc`, `pnpm test:corpus`, `pnpm build:app`.
4. **[R3] no further file edit** — the `:271` sentence landed in step 3; confirm
   `support-evidence.json:291` now carries the corrected text (it is generated from the ledger).
5. **[R4]** If the dialect changed: `apps/web/src/ui/eclInspector.ts:62-97` prose (the census
   sentence at `:71-72`, "one of eleven" at `:81-83`, the unattributed list at `:90-95` — quote the
   pinned census, per `:76-79`'s own rule); `docs.ts:181` ("4 of Buck's 25 retail ECL blocks still
   desync", "8 word-set overrides and 11 opcode-table extensions"); `main.ts:2036` comment;
   `goldbox_capabilities.json:999` (the override list) and `:1009` (also correct the imprecise
   "both stop at byte 0x80, whose handler calls an unidentified far routine" to what R4 measured);
   `supportClaims.json:98`; regenerate `support-evidence.json`; if `ecl2.dax#32` changed, re-pin
   `ecl-buck` (`:12826-12861`). If the dialect did **not** change, still correct `:1009` and land
   R4's staleness fixes. `pnpm test:corpus`.
6. **[R6] atomic landing** — copy the staged manifest to `apps/web/games/buck-rogers-matrix-cubed.json`;
   `tools/goldbox_corpus.py:66` `"manifest": None` → `"manifest": "buck-rogers-matrix-cubed"`;
   `tools/goldbox_capabilities.json`: insert the staged profile after `:1089` (anchor: slice to the
   Buck profile through its closing `    }`, insert `,\n` + profile before `\n  ]\n}`; verify with
   `json.load` and `git diff --stat` — additive only, zero deletions); `test_goldbox_corpus.py:1806`
   `+ m` (m = the profile's evidence-string count, re-measured) and the area list at `:1813-1816`
   gains R6's area-level entries; `gameview.ts:177-192` `GAME_IDS` + one row; `main.ts:1394-1410`
   `DETECTED_TO_MANIFEST` `'buck-rogers-matrix-cubed/DOS': 'buck-rogers-matrix-cubed'`; `docs.ts`
   `?game=buck-rogers-matrix-cubed` dashboard entry next to `:216-217` (required in the **same** step,
   or `test_web_routes_documented.py` test 2 goes red on the new manifest route — watch it red
   between the manifest copy and the `docs.ts` entry, as designed); `e2e.mjs` NEW case
   `buck-rogers-matrix-view` modelled on `:487-560` with R6's per-file frame counts (three
   registrations + `id`); `supportClaims.json:100-107` `web_level`/`web_text` to what
   `validate_support_claims` derives after `python tools/goldbox_corpus.py --strict` (lag exceptions
   in `goldbox_corpus.py:1722-1724`); `docs/goldbox-versions-holdings.md:62` row `◐` → held +
   extracted; regenerate `support-evidence.json`; `test_capability_ledger_coverage.py` unchanged
   (`KNOWN_MISSING` stays empty — if test 1 or 2 goes red after this step, the landing was not
   atomic). Scoped `buck-rogers-matrix-view`, `manifest-picker-coverage`, `detection`. `tsc`,
   `pnpm test:corpus`, `pnpm build:app` (two warnings — a new missing-asset warning means a staged
   path is wrong).
7. Full gates: engine, `pnpm test:corpus` (re-measure the collected total; `CLAUDE.md:307`'s
   "1193 tests as of 2026-08-26" is guarded by `test_docs_claims.py` at 15% drift — 1258 today, the
   band's ceiling is ≈ 1372; this round's estimate is ≈ 1290, inside it — update the sentence
   anyway if it is touched), `tsc`, `pnpm build:app`, **full** `pnpm --filter @goldbox/web e2e`
   (**175** expected: 172 + `module-url-reload` + `import-secret` + `buck-rogers-matrix-view`),
   `pnpm e2e:intros`, atomic deploy per `CLAUDE.md`, live-bundle hash check, then drive
   `module-url-reload`, `import-secret`, `buck-rogers-matrix-view` and the five strengthened
   cases against production through `GB_E2E_BASE_URL`. `HANDOFF.md` thirtieth entry — which must
   state plainly that the twenty-ninth entry's "Pools' and Treasures' 510-byte save layouts remain
   unknown (0 discriminating offset pairs each)" was a threshold artefact (if R3 confirms), with
   the 5/6 and 7/8 next to the null, and must not claim the outliers are explained unless R3's
   predicate rejects the shuffled null.

**Bench (substitutes if an item is dropped; same rules):**
- Pools/Treasures importer — only after R3's doc exists and R2's `Gen1SavedCharacterLayout` has
  landed; the layout becomes data, the importer a copy of `?import=secret`.
- Buck `quests` flag census over the 25 blocks — only after R4, since a desyncing block hides its
  writes.
- `?module=<sha256>` (a specific stored module, not the last) — only if a second stored module is
  ever a real use case; do not build ahead.
- `gen1-all-games-map.md` regeneration for Buck if R4 reports it as non-Buck-only.

**Deliberately not picked (blocked, closed, or speculative):** seg051 RNG and the DQK ECL opcode
table (memory `goldbox-decompile-loop`: need a DOSBox-X dynamic trace); the three default-arm
aliases (`test_web_routes_documented.py:83-94` — a decision, not a gap); every `[ ]` leaf in
`BUILD-QUEUE.md` that names DOSBox-X/GameLink/trace; C1.4b `?graphics=c64` (WAIT decision stands);
C1.7 EasyFlash; M10.S4 / M11.S5 (user-decision forks); the IDA `.sig` half (no licence); a Matrix
Cubed ECL dialect (no dispatcher map exists for it; deriving one is a round of its own on the
`map_buck_ecl_dispatch.py` pattern and is listed in R6's profile as a gap, not attempted).

---

## Predictions to score this round against

| item | prediction | scored by |
|---|---|---|
| R1 | stored Greyfen record ≈ 1.5 KB; one shared persistence call site; after Phase B `KNOWN_UNDOCUMENTED` 4 → 3, `docs.ts` flags 116 → 117, `handled_routes()` size unchanged, e2e +1 | R1 report + Phase B step 2 |
| R2 | 6/6 import; class/level table as stated; THAC0 oracle 6/6 at `0x6a`; XP oracle 6/6 at `0x12c`; race not translatable via CoAB's enum; evidence 77 → 77 + k (k est. 3–4); e2e +1 | R2 report + Phase B step 3 |
| R3 | Pools `(0xae, 0x151)` 5/6, Treasures 7/8, unique top pairs; ability sweep `{0x10}` ×4; shuffled null 0; outliers **unknown** (two-sided) | R3 report |
| R4 | CoAB calibration fits ≥ 10 calls; ≥ 2 of 3 opcodes measured; `0x2c` likeliest to read 0; census desync 4 → ≤ 3; `ecl2#32` unchanged; `0x31` decided | R4 report + Phase B step 5 |
| R5 | uncompared hook calls = 35 (planner's regex); all five weaknesses confirmed at the browser layer; after Phase B 35 → 33 and 5 → 0; each replacement seen red under its mutation | R5 report + Phase B step 1 |
| R6 | 58 files / 27 `.DAX` / `TPOV`; all chains close; frame total **not predicted**; `dos-ega` claim more likely wrong than right (two-sided); after Phase B ledger 12 → 13, registries 15 → 16, e2e +1 | R6 report + Phase B step 6 |
| gates | e2e 172 → 175; `test:corpus` ≈ 1290 collected (estimate); build at 2 warnings; `KNOWN_MISSING` stays empty | Phase B step 7 |

Wrong predictions are appended under "## Corrections to this plan, measured after it was
written", as the last two plans did; this file is otherwise kept as the brief that was issued.

---

## Corrections to this plan, measured after it was written (2026-09-03)

Same discipline as round 29's table: where a prediction in this document disagreed with a
measurement, the measurement won and the prediction is recorded here rather than quietly edited out
above.

| # | This plan predicted | Measured | Where |
| --- | --- | --- | --- |
| 1 | R2: **6/6** Secret pregens import, including `MALACHITE f-t 7-8` | **5/6**. MALACHITE is refused, for a located reason: Secret's race byte reads 6, which is not a value in Curse's Race enum, so the race defaults to human, and this ruleset implements the manual's non-humans-only multi-class rule. The unsolved race enum is therefore not cosmetic — it costs exactly one hero. The other five match the predicted class/level table exactly. | `e2e.mjs` `import-secret` (pins the count AND the rejected name, two-sided so solving the race enum forces a revisit); `ruleset/addnd1e-dragonlance/character.ts:134` |
| 2 | R2: evidence count `77 -> 77 + k`, `k` estimated **3–4**, attributed to Secret | **91**, i.e. `+14`, and **none of it is Secret's** — every new evidence row comes from R6's Matrix Cubed profile. The Secret importer added zero. The estimate was roughly the right size for the wrong reason, which is the failure mode a count pinned by profile would have caught and a bare total does not. | `test_goldbox_corpus.py:1806`; area histogram at `:1812` rewritten from 21 area-level rows to 33 |
| 3 | R4: the CoAB calibration finds a mapping fitting **>= 10** calls; **>= 2** of the three opcodes get a binary-read count; census `desync: 4 -> <= 3` | **9 of 103** (8.7%), under the round's own bar; **0** of the three opcodes got a count; census **unchanged at 4**. The brief's central hazard held: an uncalibrated mapping was not carried into Buck, and no address from the attempt appears in `disassemble.ts`. This is the round's landable negative. `0x31 SHORT_MENU` was decided and landed on evidence, as predicted. | `tools/buck_far_targets.py`; `buck-ecl-desyncs.md` (2026-09-03 section) |
| 4 | R5: "the **five** probes the plan named as weak" | There were **six**. The miscount is preserved in `test_e2e_probe_audit.py` rather than silently corrected, because an audit that miscounts its own subjects is exactly the class of error it exists to catch. | `tools/test_e2e_probe_audit.py` |
| 5 | R5: strengthening the probes empties `KNOWN_WEAK_CHECKPOINT_PROBES` and clears both `ROUTES_JSON_WEAK_MARKERS` | The set is empty, but **one marker still classifies "weak"** — and for a reason that is about the classifier, not the probe. `explore-pool-holy-symbol-quest`'s own guard now pins the party's exact positions ({11,28} -> {13,27}, intermediate included); it stays flagged because shape-2 condemns a whole case if its function contains ANY uncompared hook call, and it contains two `waitForFunction` waits. Waits fail by timeout, so they are load-bearing. Narrowing shape 2 is deliberately left undone — it changes what the audit MEANS and needs its own round and its own null. | `tools/test_e2e_probe_audit.py`, `e2e.mjs:8233` region |
| 6 | R5: `loadedOk` pins the ECL route's opening block to **34**, with a terminating **EXIT** row | Wrong twice. The route opens block **18** at vaddr `0x8014`; **34** is where `next()` lands, so pinning both would have made `loadedOk` permanently false. And `buildLines()` returns a fixed `ECL_INSPECTOR_LIST_ROWS` (13) window centred on the PC, so from the head of a block no EXIT is reachable. Replaced with decoded CONTENT pins (the first three rows' exact vaddrs and mnemonics), mutation-proven: flipping `SAVE`'s wordSet 2 -> 3 collapses the listing to 3 rows with a spurious `GOTO`, which the old `blockId >= 0 && length > 0` guard would have passed. | `e2e.mjs` `runEclInspector` |
| 7 | R5: `runFruaHeirsRoute`'s `!window.__combat?.isOverlay?.()` is a weak overlay check | Weaker than that: `window.__combat` is **`undefined`** at both negative checkpoints, so `!undefined === true` was testing nothing at all. Its null is the route's own positive branch, which waits for `isOverlay() === true` — so with an intact MONST.GLB the hook IS installed, and "never installed" is the discriminating statement now pinned. | `e2e.mjs` `runFruaHeirsRoute` (2 sites) |
| 8 | R5: `runNwnLibraryGameView`'s verdict is weak because of `rendered >= 0` | Also true, but `headerText` and `statusText` were captured and never asserted — a dead assignment that reads as coverage. Measured: renders exactly **0** with status "Could not load dungeon: 8X8D.DAX: not found in the selected folder", which is the CORRECT outcome for a filenames-only picked folder. Both the number and the reason are pinned, so a route that starts drawing, or fails differently, goes red. | `e2e.mjs:408` region |
| 9 | R1: `KNOWN_UNDOCUMENTED` 4 -> 3; docs flags 116 -> 117 (query 115 -> 116) | **Exactly right**, both. Recorded because a table of only-wrong predictions would misrepresent the round. | `tools/test_web_routes_documented.py` |
| 10 | R6: 58 files / 7 folders / 27 `.DAX`; the `dos-ega` claim is "more likely wrong than right"; ledger 12 -> 13, `GAME_IDS` / `DETECTED_TO_MANIFEST` / manifests 15 -> 16, `KNOWN_MISSING` stays `set()` | **All correct**, including the two-sided detection call: the claim was falsified against bytes and `profiles.ts:567` now reads `dos-vga`. Matrix Cubed's `web_level` moved `missing -> preview`, derived by the corpus rather than asserted. Its dashboard renders **685** frames across 19 art rows — a number the plan deliberately did not predict. | `matrix-cubed-profile.md`; `e2e.mjs` `matrix-cubed-view` |

One prediction is unresolved rather than wrong: this plan expected the e2e total to move `172 -> 175`.
Three cases were added (`module-url-reload`, `import-secret`, `matrix-cubed-view`), so the arithmetic
holds; the full-pass total is reported in the handoff entry from the run itself, not from this table.
