# Round 31 plan — after the thirtieth handoff entry (branch `greybox`, base = round 30's landing commit)

Planning only. Six parallel work items for separate Sonnet implementers on **one shared working
tree**, then a serialized single-writer tail for the files they would otherwise fight over. Every
item is provable from bytes already on disk (repo + the five documented source locations +
`matrixcubed_extracted/`) and the existing gates; none needs DOSBox-X, GameLink, an emulator,
hardware or the user. Nothing here re-plans the seg051 RNG (trace-blocked). The "DQK ECL opcode
table" is **no longer** on the blocked list — `ECL_GEN2`'s docblock records the whole Gen2 operand
table being read out of `DQK.EXE` on 2026-08-07 — so the memory that still lists it is stale, and
the ledger entry for that memory should say so when it is next touched.

The shape of this round: **one item falsifies a claim round 30 is publishing right now** (R1: the
seven Buck far-call targets "resolved to nothing" — three of them resolve through the resolver's
own stub geometry, and the planner reproduced it), **two derive something from a binary that has
never been read** (R2: Matrix Cubed's ECL dispatcher; R4: the DQK Amiga wall-frame variant that
38% of frames fall through), **one closes a disclosed gap with per-field oracles** (R3: the
Pools/Treasures pregen importer), and **two land standing gates over the repo's own text** (R5:
unconsumed exports, unreachable formats, stale numbers in `CLAUDE.md`; R6: six Amiga sets we hold
and list nowhere). Items R2, R3 and R6 add browser routes or cases; the e2e total is expected to
move **175 → 178 + k**, where `k ≤ 3` is the number of Amiga manifests Phase B lands from R6 —
stated here so that a "175/175" in the next handoff is read as three items not landing.

Every number in this plan that is called a *measurement* was produced by the planner on the round-30
working tree (`806aaac` + round 30's Phase A and its in-flight Phase B) before writing; the scripts
are in the planner's scratchpad, not the repo. Every number called a *prediction* or *estimate* is
labelled as such. Round 29's plan got four predictions wrong and round 30's got at least three
(the Matrix `TPOV` magic was `FBOV`; the CoAB linear calibration did not fit; the `0x2c` verdict was
never tested). Where a brief says "measure X", the agent's report must state the number it got and
the code path that produced it, next to the number predicted here.

## What the carried-forward list looked like against the bytes

| carried forward (round 30, HANDOFF twenty-ninth + `buck-ecl-desyncs.md` round-30 section) | measured on the round-30 tree |
|---|---|
| Buck: "the seven far-call targets, calibrated on CoAB first, resolved to nothing"; `0x29`/`0x2c`/`0x42` "still genuinely unmeasured"; both `tools/test_buck_far_targets.py` and `tools/test_map_buck_ecl_dispatch.py` pin every target `unresolved` | **False for three of the seven.** `tools/vroomm_layout.py::map_game(Buck)` classifies the fixup entries for segment `0xb8` (209 sites) and `0x10f` (126 sites) as **`public_stub_owned`** — only `0xbe4` (2046) and `0x653` (559) are `unresolved_relocated_segment`. Under Buck's own inferred selector base `0x2d`, selector `0xb8` is **descriptor 15** (delta `0x8b`, 33 stubs, overlay code at `GAME.OVR:0x1ca15`) and `0x10f` is **descriptor 25** (delta `0xe2`, 45 stubs, code at `0x2ba60`). The resolutions: `0xb8:0x2a` → desc 15 stub 2 → proc `0x0` → **`0x1ca15`** — byte-exactly the operand parser the dispatch map found by structural similarity, which is the calibration; `0xb8:0x7f` (called by `0x29`) → stub 19 → **`0x1e0f2`**; `0xb8:0xb6` (called by `0x42`) → stub 30 → **`0x1e98e`**; `0x10f:0x4d` (called by `0x2c`) → desc 25 stub 9 → **`0x2d9cd`**. CoAB calibration of the same geometry: selector `0x4c` → descriptor 7, stub 2 → `0x810a` = the oracle's `@parse_command_sub$q4Byte` exactly; across CoAB, **229 of 240** distinct `public_stub_owned` targets land on an oracle-named function start (`retail_file_offset`), and shifting every target by +1/−1/+16/−16 bytes gives 1/0/0/0. Round 30's negative was real for the *method it tested* (a single linear `seg*mult+off+D` over all 103 pairs, 9/103 best, 0/10 holdout) and wrong as a statement about the targets, because it mixed stub-selector segments (not linear in the file) with resident ones and never read `FixupEntry.route_kind`. The handlers themselves were also read: **none of the three consumes a script byte in its own body** — `0x2c` at `0x267d` calls `0xbe4:0x1b2b`, `0xbe4:0x62a`, then `0x10f:0x4d` with `al=1` and does `cmp al,0x59` (`'Y'`) before setting `[0x6d0c]` or `[0x6d0d]`; `0x29` at `0x2646` calls `0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`; `0x42` at `0x313b` pushes five globals `[0x5f40..0x5f44]`, calls `0x653:0xe58`, `0xb8:0xb6`, then near-calls `0x904` (opcode `0x00`'s handler). Whether the *callees* advance the ECL PC is the open question R1 answers. |
| Matrix Cubed: extracted, 27 `.DAX`, `GAME.OVR` is `FBOV`; "no dispatch map has been built from Matrix Cubed's own GAME.OVR at all"; ledger `ecl: unsupported` | **Holds.** `ECL1.DAX` = 33 blocks (ids 1, 2, 16–21, 24, 32–38, 48–50, 64–66, 80, 81, …), 247,573 raw bytes. `tools/map_buck_ecl_dispatch.py` locates the dispatcher/parser by structural match against the CoAB oracle and derives the parser call target from the handlers themselves — nothing in it is TPOV-specific except the file lookup at `:81`. Matrix's `FBOV` is CoAB's own overlay magic, so the FBOV-side helpers (`map_pool_ecl_dispatch.dispatch_table`) apply directly. The Python all-paths scanner (`gen1_ecl_encounter_scan.scan_block`) is **not** a usable census: Countdown under its own dialect shows truncation holes in 25/25 blocks (403 holes), so its Matrix numbers (32/33 blocks with holes under `buck` 601 / `long` 464 / `short` 532) are a weak hint at most — the engine's single-path census (`buckEclDialect.test.ts`'s method) is the only discriminating null. |
| "No importer was built for Pools/Treasures"; `(0xae, 0x151)` 5/6 and 7/8; outliers `ABAGAIL`/`OUGO` reported as misses; a dozen fields "plausible, unverified" | **Holds.** `Gen1SavedCharacterLayout` (`secretSavedCharacter.ts:112-148`) has `size/name/nameMaxLen/abilities/thac0/race/class/age/hpMax/classLevel/classLevelSlots/baseAc?/exp?/unverifiedOffsets?` — no saving-throw or party-slot field, both of which `pools-treasures-chrdata-layout.md` §4 located (`0x132-0x136`, `0x19c`). `decodeGen1SavedCharacter(raw, layout)` throws on `raw.length !== layout.size`. `importSecretParty.ts` is the panel/seam template (`importSecretParty`, `installImportSecretSeam`, `startImportSecretPanel`). |
| DQK Amiga: "38% of the Amiga frames do not decode" — 305 of 799 `8X8DB.TLB`+`8X8DC.TLB` members are degenerate stubs; `8X8DB` set 4 fails 47/47; "a per-set codec or plane-depth variant" | **Holds, and is pinned as a KNOWN GAP that goes red when it closes** (`dqkAmigaWallArt.test.ts:129-148`: `166` + `139` stubs, `0.382`, set04 `= 47`, sets 1-3/5-9 `< 47`). The DOS oracle is on disk: `The Dark Queen of Krynn/DISK2/8X8DB.TLB` + `8X8DC.TLB` (HLIB), same set count, 47-frame sets, per-frame dimensions agreeing at shift 0 for 478 of 494 decodable frames (`:93-110`). `glib.ts:decodeImage` (`:440-518`) knows variants 0/1/2/3 and `0xd2`, and returns `null` for anything else — so the 305 are either an unknown `dm` byte or a size-check rejection; nobody has printed the histogram. |
| "A decoder nothing calls is not shipped" — recurring; nothing pins it | **Measured for the first time.** Of **1,167** names exported from `packages/engine/src/index.ts`, **16** are referenced by no non-test file in `apps/**` or `packages/**` outside their defining module (and outside the export block): fourteen `C64_PICTURE_*` constants, **`addnd2eThac0`** (the 2e ruleset's THAC0, consumed by nothing), and `COK_WALL_PALETTE_BASE`. `decodeAsset` returns five formats (`hlib`, `glib`, `ilbm`, `daa`, `dax`) plus the catalog-level `c64-picture`/`dqk-save` kinds; no test says which of those a manifest or catalog entry can actually produce. |
| `CLAUDE.md` numeric/status claims | **Two stale, both unpinned.** `:291` "`apps/web/test/e2e.mjs`, 164 cases" — the harness reports 172 on `806aaac` and the round-30 tree already registers 173 selectable + coverage; `:203` "DQK-Amiga partial, Disk 3 unrecoverable — low priority" — contradicted by `:313-320` of the same file (recovered 2026-07-18). `tools/test_docs_claims.py` pins only the `test:corpus` size (15% band), cited file paths, and the old deploy URL. |
| Six Amiga GLIB-era sets held with no manifest | **Holds.** `apps/web/games/` has 15 manifests; Amiga variants exist only for CoK, DoK and Buck. WHDLoad `data/` container counts (`.tlb`/`.glb`/`.dax`, case-insensitive): Curse **27**, Secret **21**, Pools **24**, Gateway **27**, Treasures **25**, DQK **23**, Pool of Radiance **23** (PoR is the 4th Amiga format, decoded by `tools/pool_amiga_decode.py` only — no TS decoder, so it cannot reach a manifest this round). `decodeAsset` sniffs GLIB since 2026-08-22 and `loadGame.ts:144-161` renders every image member of a GLIB archive. |

Ground rules carried from `CLAUDE.md`, `PLAN-ROUND-30.md` and the twenty-ninth/thirtieth entries:

- A probe that cannot fail is not evidence: every new test/e2e assertion must be **seen red** under
  the named mutation, then restored. The report names the mutation and quotes the red output.
- The null must test the **alternatives**, not just the predecessor. Every claimed signal states
  the null and the number it produced next to the real number. A negative needs a null too.
- Structural constants (operand widths, offsets, enum values, codec variants) are read from the
  **binary or the bytes**, never chosen because they make a corpus decode cleanly. Where a field's
  semantics cannot be given an independent check, the field ships **raw and unlabelled**.
- A decoder nothing calls is not shipped; a `?query=` URL absent from `docs.ts` is not shipped; a
  manifest absent from `GAME_IDS` is not shipped. `tools/test_web_routes_documented.py`,
  `tools/test_capability_ledger_coverage.py` and (after R5) the export/format audits enforce this
  and are expected to go red mid-Phase-B by design — the steps below say when.
- Correcting a claim without correcting its check leaves the check stale: every ledger, doc or
  comment edit lands with the test edit that checks it, in the same Phase B step.
- **Measure before you predict.** If a brief's number disagrees with what you measure, the brief
  is wrong: verify by hand, pin what you measured, report the plan as wrong.
- **A scripted text replacement into a `.ts` file is typechecked before it is reported done.**
- Agents **do not commit and do not deploy**. Each reports the exact file list, the mutation it
  watched fail, and the numbers. The lead commits one coherent commit per item with
  **`git commit -- <paths>`** (never a bare `git commit` on the shared tree).
- Hard constraints in every brief: game-data folders and the external sources (`D:\...`,
  `C:\Program Files (x86)\GOG Galaxy\Games\`) are **read-only, never vendored, never rewritten**;
  `matrixcubed_extracted/` is git-ignored and never committed; **never patch original EXEs on
  disk**; no DOSBox-X automation is planned, and if an agent thinks it needs one it stops and
  reports (if ever used: only the focusless GameLink protocol via `tools/dosbox_gamelink.py`).
- `tools/goldbox_capabilities.json` is **hand-formatted**. Edit it by anchored text replacement
  **sliced to the target profile first**. Phase B only.
- `apps/web/src/ui/*.ts` docblocks must **not** contain quoted game-data path literals
  (`scripts/bundle-assets.mjs` cannot tell a comment from a call site). `pnpm build:app` must stay
  at exactly its two documented tolerated warnings.
- Any e2e edit registers a new case in **three** places in `apps/web/test/e2e.mjs` — the
  `const runners = new Map([` registry (anchor on that text; it was at `:16689` on the round-30
  tree and moves), the awaited list in `main()`, and the single `results.unshift(...)` — and gives
  the case the registry key as its `id`. A case that needs no game data also joins the
  `dataIndependent` list. Do not move or rename the `const runners = new Map([` declaration.
- **Files in the Phase B single-writer set, for every item:** `apps/web/src/ui/main.ts`,
  `apps/web/src/ui/docs.ts`, `apps/web/test/e2e.mjs`, `tools/goldbox_capabilities.json`,
  `apps/web/src/ui/supportClaims.json`, `apps/web/src/generated/support-evidence.json`,
  `tools/test_goldbox_corpus.py`, `tools/goldbox_corpus.py`, `CLAUDE.md`,
  `docs/engine/HANDOFF.md`, `apps/web/src/ui/gameview.ts`, `apps/web/src/ui/eclInspector.ts`,
  `apps/web/games/*.json`, `tools/test_web_routes_documented.py`,
  `tools/test_capability_ledger_coverage.py`. An agent that needs one of these **describes the
  exact edit in its report** and does not make it.

Standing gates (run from repo root) and their **measured** baselines on the round-30 tree:

```powershell
pnpm --filter @goldbox/engine test          # 236 test files (ls count); tests per the thirtieth entry
pnpm test:corpus                            # python -m pytest tools/ -q — 1297 collected (round 30 Phase A in tree)
pnpm -r exec tsc --noEmit
pnpm build:app                              # 2 tolerated warnings
$env:GB_E2E_ONLY='<case-id>'; pnpm --filter @goldbox/web e2e     # scoped iteration only
pnpm --filter @goldbox/web e2e                                   # full pass before landing (Phase B)
pnpm e2e:intros
```

Other baselines: e2e registry **137** explicit entries + the **36**-entry `CASES` spread = 173
selectable on the round-30 tree mid-Phase-B (round 30 expects **175** total once its third case
lands — re-measure on the landing commit); ledger **12** profiles (13 after round 30's step 6);
`apps/web/games/` **15** manifests (16); `GAME_IDS` **15** (16); `PLATFORM_VARIANT_MANIFESTS`
`{champions-amiga, death-knights-amiga, buck-rogers-amiga}`; `KNOWN_MISSING = set()`; Buck census
`{desync: 4, cleanExit: 21, ranOffEnd: 0}` with sample `['ecl1.dax#17@0xec', 'ecl1.dax#18@0x395',
'ecl6.dax#94@0x50', 'ecl6.dax#99@0x2c0']`; Buck `vroomm_layout` routes
`{direct_overlay_code: 23, public_stub_owned: 1058, public_stub_target_out_of_bounds: 8,
unresolved_relocated_segment: 3334}`; CoAB routes `{public_stub_owned: 1980,
unresolved_relocated_segment: 3388}`.

Phase A agents run the engine suite, `pnpm test:corpus`, `tsc` and (where their files are in the
bundle) `pnpm build:app`. They do **not** run the full browser harness; the lead does in Phase B.
Scoped `GB_E2E_ONLY` runs are allowed in Phase A where a brief names them.

---

## R1 — Buck's three unmeasured opcodes: the far-call targets resolve through the resolver's own stub geometry, and round 30's negative is retracted

**Why now.** Round 30's R4 reported the seven far-call targets as "resolved to nothing" and pinned
that in two test files. The measurement above says the resolver it was told to use resolves three
of them — `0xb8:0x7f` → `GAME.OVR:0x1e0f2`, `0xb8:0xb6` → `0x1e98e`, `0x10f:0x4d` → `0x2d9cd` — by
the same geometry that puts the parser stub `0xb8:0x2a` on `0x1ca15` (the structural match) and
CoAB's `0x4c:0x2a` on the oracle's `0x810a`, with 229/240 stub-routed CoAB targets landing on
named function starts and a ±1/±16-byte null of 1/0/0/0. The linear fit that failed was fitted over
stub-selector segments (which are not linear in the file) and resident segments together. That
negative stays recorded as a true statement about linear fits; the claim about the targets is
retracted here. Three handler bodies have already been read (table above) and consume no script
bytes themselves; the deliverable is what the *callees* do, read from the binary, and a census.

**Read first.** `CLAUDE.md`; HANDOFF thirtieth entry (Buck paragraph) and twenty-ninth (the
`0x21`/`0x4c` sweep discipline); `docs/engine/research/buck-ecl-desyncs.md` (whole, especially the
round-30 section and its "Mutation test" — you are flipping those pins); `tools/vroomm_layout.py:223-330`
(`stub_selector_geometry`, `infer_stub_selector_base`, `classify_lcall_routes` — the resolver
you will use, **unmodified**) and `:331-425` (`map_game`); `tools/buck_far_targets.py` and
`tools/test_buck_far_targets.py` (whole — the linear-fit machinery stays as the recorded negative);
`tools/map_buck_ecl_dispatch.py:156-300` (`_first_far_call`, `derive_operand_parser_call_target`,
`operand_word_sets`, the `different_far_call_target` stop) and `tools/test_map_buck_ecl_dispatch.py:317-360`;
`docs/engine/research/buck-ecl-dispatch-map.md:1-40, 79-103, 130-166`;
`packages/engine/src/ecl/disassemble.ts:319-445` (`ECL_GEN1_BUCK` and its docblock) and the
`ECL_GEN1_SHORT` PARLAY note near `:470-475` (Gen2's `0x2c` is a Y/N prompt, no parser call — the
shape you are about to see again); `packages/engine/test/buckEclDialect.test.ts` (whole);
`build/coab-oracle-map.json` (`functions[*].retail_file_offset`, `symbol`); memory
`goldbox-verify-gaps-against-binary`. Buck install `D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\`
(read-only); CoAB under the GOG root.

**Scope — files this agent owns (Phase A).**
- `tools/buck_far_targets.py` — add a second resolution path **before** the linear fit:
  `stub_route_targets()` runs `vroomm_layout.map_game` on Buck, collects every `lcall_segment`
  fixup entry whose `(original_segment, call_target_offset)` is one of the seven targets, and
  reports `route_kind`, `target_descriptor_index`, `target_stub_index`, `target_proc_offset`,
  `target_ovr_file_offset`. Calibration, in the same tool, on CoAB: (a) `0x4c:0x2a` must route to
  `0x810a` (`@parse_command_sub$q4Byte`); (b) the fraction of distinct `public_stub_owned` targets
  on oracle `retail_file_offset`s (predicted 229/240) next to the same count under +1/−1/+16/−16
  byte shifts (predicted 1/0/0/0); (c) Buck's own calibration: `0xb8:0x2a` must route to the
  dispatch map's parser offset `0x1ca15`. Keep the linear-fit section and its `landable_negative`
  status; add a `resolution_method` field per target: `stub_geometry` / `linear_fit` /
  `unresolved`. Disassemble each stub-resolved callee (Capstone, to its first `retf`, capped)
  into the JSON and Markdown.
- `tools/test_buck_far_targets.py` — flip `test_all_seven_distinct_targets_report_unresolved` to
  the measured split (3 `stub_geometry`, 4 `unresolved`, with the four named); keep the linear-fit
  tests as they are (that negative is still true); add the CoAB calibration pins (a)-(c) and the
  shifted null as `<=` bounds you measure.
- `tools/map_buck_ecl_dispatch.py` — for `0x29`, `0x2c`, `0x42`: given a resolved callee, walk it
  and answer, quoting instructions: does it (or anything it near-calls inside its own descriptor)
  call the operand parser (far `0xb8:0x2a`, or **near** `call 0x0` inside descriptor 15, where the
  parser is proc 0), and does it touch the ECL PC global? Identify that global first from the
  parser body at `0x1ca15` (the word the parser increments per operand set) and state its address.
  Emit a `script_bytes_consumed` verdict per opcode: `0` (no PC touch anywhere reachable),
  `N` (a prefetch `mov al,N` found), or `unknown (resident callee 0xSEG:0xOFF unread)`.
  Regenerate `docs/engine/research/buck-ecl-dispatch-map.md`; `tools/test_map_buck_ecl_dispatch.py:339-360`
  pins move to the new verdicts.
- **Stretch, only with its null:** the resident segments `0xbe4`/`0x653` are relocated words, not
  stub selectors. Test the one mapping the round-30 planner used — `START.EXE file = mz_header_bytes
  + seg*16 + off` — by its own calibration on CoAB **without the oracle**: for CoAB's resident-class
  segments (`0x8f7`, `0xed`, `0xe3`, …) count how many distinct call targets land on a Borland
  prologue (`55 8b ec` / `55 89 e5`) versus the same count at ±1..±16 byte shifts. Land the mapping
  for Buck only if the CoAB prologue-hit rate is decisively above every shift; then read
  `0xbe4:0x62a`, `0xbe4:0x1b2b`, `0x653:0x1359`, `0x653:0xe58` for PC access. If it is not decisive,
  report the table and leave the four `unknown`.
- `packages/engine/src/ecl/disassemble.ts` — `ECL_GEN1_BUCK` only: a `wordSetOverrides` entry for
  `0x29`, `0x2c` or `0x42` lands **only** with a `script_bytes_consumed` verdict of `0` or `N` whose
  every reachable callee was read (no `unknown` in the chain), each with the callee file offsets
  in the docblock. If a frame turns out to be variable-length (inline string, terminator-scanned),
  do **not** model it — document what `EclDialect` would need and leave the desync.
- `packages/engine/test/buckEclDialect.test.ts` — census and sample pins move only if the numbers
  move; for every new override, the `0x21`-style sweep 0..8 published as a test comment, and a pin
  that the binary-read value is the one landed even where it is not the corpus minimum.
- `tools/gen1_ecl_encounter_scan.py` — sync `GEN1_BUCK_WORD_SETS` if the engine dialect changes
  (and its Buck test rows in the same edit).
- `docs/engine/research/buck-ecl-desyncs.md` — append a dated round-31 section: the retraction,
  stated plainly ("three of the seven targets were resolvable by the resolver the brief named,
  through `route_kind`, and the round-30 section above is wrong where it says otherwise"), the
  CoAB calibration numbers with their nulls, the three callee disassemblies, the three verdicts,
  the census before/after, and what `ecl6.dax#94@0x50` and `ecl6.dax#99@0x2c0` do after.

**Must NOT touch:** `tools/vroomm_layout.py`, `tools/gen1_map.py` (import only; if either needs a
change, report the exact edit for Phase B), `eclInspector.ts`, `docs.ts`, `main.ts`, `e2e.mjs`,
the Buck manifests, `goldbox_capabilities.json`, `supportClaims.json`, every other dialect
constant in `disassemble.ts`, R2's Matrix files.

**Acceptance.** Engine tests, `pnpm test:corpus`, `tsc` green. Report: the CoAB calibration
(distinct targets / on-oracle / each shift); the three resolutions with descriptor, stub index,
proc offset and file offset; per opcode the callee walk with the PC-global address and the
quoted instruction that decides it; the verdict per opcode; the census under the final dialect;
whether `ecl2.dax#32-35` disassemble identically before and after (`ecl-buck` pins `#32` at 8
instructions, first vaddr `0x8014`, ending in EXIT — if that moves, say so for Phase B).

**Nulls / mutations.** (i) CoAB shifted-null as above. (ii) In the tool, set the selector base
to `0x2d ± 1` → `0xb8:0x2a` must stop landing on `0x1ca15` (the geometry is not loose). (iii)
Revert one new override → the census pin red. (iv) Set a new count to `+1` → a different census.
(v) For every new override, the corpus sweep 0..8 with the desync count at each value, published
next to the binary-read value.

**Prediction.** CoAB calibration 229/240 with null 1/0/0/0 (measured). Three targets resolve
(measured). `0x2c` PARLAY verdict **`0`** (the handler is a fixed-string Y/N prompt; `0x10f:0x4d`'s
callee copies 0x28 bytes from a far pointer, saves/restores three globals `[0x6b45-0x6b47]`, and
returns the key in `al`) — but it lands only if `0xbe4:0x1b2b` and `0xbe4:0x62a` are read and do
not touch the PC, so the honest estimate is **`0` or `unknown`**. `0x42` verdict `0` or `unknown`
on `0x653:0xe58`. `0x29` is the one most likely to stay `unknown` (`0xbe4:0x62a` and `0x653:0x1359`
are both resident). Census: `desync 4 → 3` if any one of the three lands and it is the `0x29` site,
else unchanged (**estimate; two-sided**). `ecl6#99@0x2c0` unchanged. `ecl2#32` unchanged.

**Hard constraints.** Read-only Buck and CoAB installs; `GAME.OVR`/`START.EXE` read, never
patched; no DOSBox-X; do not commit, do not deploy.

---

## R2 — Matrix Cubed's ECL dialect, from its own `FBOV` `GAME.OVR`, with Countdown as the sibling null and the eleven `uncertain` opcodes cross-checked handler-by-handler

**Why now.** Round 30 extracted Matrix Cubed and staged its profile with `ecl: unsupported` and
the explicit gap "tools/map_buck_ecl_dispatch.py has never been run against it". Its `GAME.OVR`
carries `FBOV` — CoAB's own overlay magic — so the CoAB-side helpers apply without the TPOV
work Buck needed. Two questions, both two-sided: (1) does Matrix Cubed dispatch the same
`0x00-0x4c` table as Countdown with the same per-opcode word sets, or does it diverge (a diverging
table is a finding; an identical one licenses `ECL_GEN1_BUCK` for Matrix with a citation); (2) for
the eleven `0x41..0x4c` extension opcodes Countdown ships with `uncertain: true`, does Matrix's
handler for the same opcode carry the **same** `mov al,N` prefetch — a second, independently
compiled binary agreeing is the strongest static evidence available short of a trace, and a
disagreement is a defect in one of the two readings.

**Read first.** `CLAUDE.md`; `docs/engine/research/matrix-cubed-profile.md` (whole);
`tools/map_buck_ecl_dispatch.py` (whole — the pipeline you copy; note `:81` is the only
TPOV/Buck-specific lookup) and `tools/map_pool_ecl_dispatch.py:55-130` (`disassemble_shape`,
`dispatch_table`, `oracle_offset` — the FBOV path); `docs/engine/research/buck-ecl-dispatch-map.md`
(the columns you reproduce); `packages/engine/src/ecl/disassemble.ts:319-445` (`ECL_GEN1_BUCK`,
`headerLen 22`, `vbase 0x7ffe`, the eleven `uncertain` entries at `:431-441`);
`packages/engine/test/buckEclDialect.test.ts` (whole — `loadBuckBlocks`, `census`, the sample
pins; your test is this file with Matrix's paths); `tools/gen1_map.py:71, 313` (Matrix detection
markers); `docs/engine/research/gen1-ecl-extended-opcodes.md` §8. Files: `matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR`
(212,529 B, `FBOV`), `START.EXE`, `ECL1.DAX` (33 blocks); Countdown's `game.ovr` for the
comparison; the CoAB oracle at `build/coab-oracle-map.json`.

**Scope — files this agent owns (Phase A).**
- NEW `tools/map_matrix_ecl_dispatch.py` — the Buck pipeline pointed at Matrix's `GAME.OVR`:
  structural match of the dispatcher and operand parser against the CoAB oracle (report the
  similarity numbers next to Buck's `0.8872`/`0.8550`); `dispatch_table` + the fallthrough
  resolver; `derive_operand_parser_call_target` (state the target and its share of handlers);
  `operand_word_sets` per opcode; the same Unmeasured / beyond-0x40 partition. Then the **sibling
  comparison**: for every opcode both titles dispatch, the measured word set in each, and for
  the eleven extension opcodes the handler-body similarity (the tool's own sequence/trigram
  metrics) and whether the prefetch immediates agree. Emit JSON + Markdown
  (`docs/engine/research/matrix-ecl-dispatch-map.md`, generated). Import shared helpers from
  `map_buck_ecl_dispatch.py`/`map_pool_ecl_dispatch.py`; **do not edit them** (R1 owns the Buck
  tool; if a helper needs a parameter, copy it locally and say so).
- NEW `tools/test_map_matrix_ecl_dispatch.py` — pins: dispatcher/parser offsets and similarity
  floors; opcode range and handler count; the agreement/disagreement counts against Countdown;
  the eleven-opcode prefetch table exactly; skip if `matrixcubed_extracted/` is absent.
- NEW `packages/engine/test/matrixEclDialect.test.ts` — a **test-local** `ECL_GEN1_MATRIX`
  constant (do not touch `disassemble.ts`; Phase B lands it) built only from what the tool read;
  `loadMatrixBlocks()` over `ECL1.DAX` (33, pinned); the census under `ECL_GEN1_MATRIX`, and the
  nulls under `ECL_GEN1_BUCK`, `ECL_GEN1`, `ECL_GEN1_SHORT`, `ECL_GEN1_SHORT_POOLS` — all five
  pinned, with the desync sample by `file#block@offset`. If `ECL_GEN1_MATRIX` equals
  `ECL_GEN1_BUCK` field-for-field, say so and pin **that** (a deep-equal), and pin that the
  census is then identical by construction — do not invent a delta.
- NEW `docs/engine/research/matrix-ecl-dialect.md` — the derivation, the sibling table, the
  census table, the eleven-opcode verdicts (`agree` / `disagree` / `absent in Matrix`), and a
  "claim boundary" section. State the `headerLen`/`vbase` evidence for Matrix separately (read
  the block header shape from `ECL1.DAX` bytes as `buckEclDialect.test.ts` did for Countdown —
  do not inherit 22/`0x7ffe`).

**Must NOT touch:** `disassemble.ts` (Phase B), `map_buck_ecl_dispatch.py`,
`test_map_buck_ecl_dispatch.py`, `buckEclDialect.test.ts`, `gen1_ecl_encounter_scan.py` (all R1),
`eclInspector.ts`, `docs.ts`, `main.ts`, `e2e.mjs`, `goldbox_capabilities.json`, the Matrix
manifest, `matrix-cubed-profile.md` (round 30's; append a pointer paragraph only if Phase B asks).

**Acceptance.** `pnpm test:corpus` and engine tests green with the new files collected; the
report gives the dispatcher/parser match numbers, the opcode range, the parser call target and
share, the five-way census table, and the eleven-opcode table.

**Nulls / mutations.** (i) The four sibling dialects' censuses are the null: if `ECL_GEN1_MATRIX`
does not beat `ECL_GEN1_BUCK` on Matrix's own corpus **and** differs from it, say which opcodes
account for the difference and do not land the worse one. (ii) Feed the tool Countdown's
`game.ovr` (TPOV) → it must refuse or report the TPOV mismatch, not silently map it. (iii) Change
one pinned prefetch value by 1 in the test → red. (iv) Mutate the dispatcher offset by +1 →
the structural match must fall below the pinned floor.

**Prediction.** Dispatcher/parser similarity to CoAB **≥ 0.80** on both (estimate — Buck's are
0.887/0.855 and Matrix is a later build of the same engine). Matrix dispatches `0x00..0x4c`
with the same two in-range gaps (`0x1f`, `0x3b`) (estimate). Word sets: **agree with Countdown on
≥ 70 of 75** dispatched opcodes; the eleven extension prefetches **agree 11/11** (estimate —
two-sided; a single disagreement is the more interesting result). Census: under `ECL_GEN1_BUCK`,
**desync ≤ 6 of 33** (estimate — the Python scanner's `buck 601 / long 464` hole counts hint the
Gen1-long frame may fit Matrix better than Buck's, but that scanner is non-discriminating, so this
is the number most likely to be wrong). After Phase B: `?ecl=matrix` route, e2e +1, ledger
`ecl: unsupported → partial` for Matrix, evidence count +4 (estimate).

**Hard constraints.** `matrixcubed_extracted/` is git-ignored and read in place; nothing under
`D:\` is written; no EXE patching; no DOSBox-X; do not commit, do not deploy.

---

## R3 — `?import=pools` and `?import=treasures`: the 510-byte pregen importer, every field with its own oracle, and the two outliers shown rather than smoothed

**Why now.** Round 30's R3 falsified "Pools' and Treasures' layouts remain unknown" — class at
`0xae`, `ClassLevel[8]` at `0x151`, 5/6 and 7/8 — and its "what is NOT claimed" section hands the
importer to the layout-parameterised decoder R2 landed for Secret. Twelve further fields are
"plausible, unverified"; the importer is the place they earn a label or ship raw. `ABAGAIL`
(Pools, record 4, class 5 `magic_user`, window `00 00 00 00 00 0c 00 0b`) and `OUGO` (Treasures,
record 6, class 2 `fighter`, `08 00 00 00 00 00 00 00`, another `08` at `0x15a`) disagree with the
oracle and **must be shown disagreeing** in the panel — a party of 6/8 with two heroes flagged is
the truthful product.

**Read first.** `CLAUDE.md`; `docs/engine/research/pools-treasures-chrdata-layout.md` (whole,
especially §4 field table, §5, §6, §7); `docs/engine/research/secret-chrdata-fields.md` (the
per-field oracle table you reproduce for 14 records); `packages/engine/src/loaders/secretSavedCharacter.ts`
(whole — `Gen1SavedCharacterLayout`, `decodeGen1SavedCharacter`, the `unverified` mechanism);
`packages/engine/test/secretSavedCharacter.test.ts` (golden + oracle + cross-title null — your
model); `apps/web/src/ui/importSecretParty.ts` (whole — panel, seam, the substitution
disclosure, the absolute-path convention and why docblocks must not quote paths);
`packages/engine/src/index.ts` (the Secret export block); `packages/engine/src/ruleset/addnd1e/progression.ts`
(`xpForLevel`, `levelForXp`, `hitDie`) and the 1e THAC0 table the Secret oracle cited;
`coab_extracted/Classes/Player.cs:403-560`; `tools/secret_chrdata_sweep.py` (`--pair`,
`--field-map` — read, do not edit). Files: `…\Pools of Darkness\SAVE\CHRDATA{1..6}.SAV` (510 B),
`…\Treasures of the Savage Frontier\SAVE\CHRDATA{1..8}.SAV` (510 B), GOG root, read in place.

**Scope — files this agent owns (Phase A).**
- `packages/engine/src/loaders/secretSavedCharacter.ts` — **optional** fields only, added to
  `Gen1SavedCharacterLayout` and threaded through `decodeGen1SavedCharacter` with no change to
  Secret's decoded output (its tests stay green untouched): `savingThrows?: number` (5 bytes),
  `partySlot?: number`, `extraByte?: number` (carried raw). Nothing else in this file moves.
- NEW `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts` — one
  `POOLS_TREASURES_SAVED_CHARACTER_LAYOUT` (the two titles share it; assert that with a test, not
  a comment), `decodePoolsTreasuresSavedCharacter(raw)` / `sniff…` (throws on `!== 510`). Per
  field, the oracle that admitted it, run over all 14 records and reported pass/fail with values:
  - `abilities@0x10` — uniqueness sweep (reproduce `{0x10}` on both titles);
  - `thac0@0xac` — `0x3c - raw` vs the engine's 1e THAC0 for the pinned class/level, on the 12
    records the class/level oracle accepts;
  - `exp@0x172` (LE u32) — `xpForLevel(level) ≤ exp < xpForLevel(level+1)` for the pinned
    class/level (say how multi-class records are handled: per-class or total, per `Player.cs`);
  - `hpMax@0xb2` — the weak `level ≤ hp ≤ level × (hit die + CON bonus)` bound, labelled bounded;
  - `age@0xb0` u16 — range only; label as such;
  - `savingThrows@0x132` — all in AD&D 1e range for the class/level (cite the table);
  - `baseAc@0x170 = 0x32` on 14/14 and `partySlot@0x19c` = record index — exact;
  - `race@0xad` — **raw** unless you source the title's own race enum from its binary (cite
    offset); `extra@0xaf` — raw, unnamed.
- NEW `packages/engine/test/poolsTreasuresSavedCharacter.test.ts` — goldens for all 14 (names,
  class codes, level arrays, ability pairs); the oracle at `(0xae, 0x151)` accepting exactly 5/6
  and 7/8 with `ABAGAIL`/`OUGO` named as the misses; the shifted-offset negative (class at
  `0xad`/`0xaf` → 0/n); the cross-title null (Curse 422 B and Secret 439 B records rejected by
  length **and**, with size temporarily widened in the test, by the oracle); `it.skipIf` on absence.
- `packages/engine/src/index.ts` — the export block after Secret's. (Only R3 touches `index.ts`.)
- NEW `apps/web/src/ui/importPoolsTreasuresParty.ts` — `importPoolsTreasuresParty(title, assetSource?)`,
  `installImportPoolsTreasuresSeam()` (`window.__importPools` / `__importTreasures` `summary()`/`party()`),
  `startImportPoolsTreasuresPanel(root, title)` so Phase B's `main.ts` edit is two three-line
  arms. The panel lists, per hero, the fields that passed their oracle, the fields shipped raw,
  and for `ABAGAIL`/`OUGO` a visible "class byte and level array disagree — shown raw, not
  translated" line. No quoted game-data path literals in any docblock.
- NEW `docs/engine/research/pools-treasures-chrdata-fields.md` — the 14-record oracle table, the
  outlier disclosure, and a "not claimed" section.

**Must NOT touch:** `main.ts`, `docs.ts`, `e2e.mjs`, `goldbox_capabilities.json`,
`test_goldbox_corpus.py`, `supportClaims.json`, `secret_chrdata_sweep.py` / its test / its docs,
`importSecretParty.ts`, `coabSavedCharacter.ts`, `importCoabParty.ts`.

**Acceptance.** Engine tests, `pnpm test:corpus`, `tsc` green; `pnpm build:app` at two warnings;
scoped `import-secret` and `import-coab` still 1/1; the report lists every field with its
verdict and the 14 values, the raw fields, and the race decision with evidence.

**Mutations.** (i) Move the class offset to `0xad` → goldens and oracle red. (ii) Widen the size
check to accept 439 and feed Secret's records → must be rejected by the oracle, not only by
length. (iii) Make the panel translate `ABAGAIL` as a plain magic-user → the disagreement pin in
the seam red. (iv) Phase B: remove the `main.ts` arm → `import-pools` / `import-treasures` red.

**Prediction.** 5/6 and 7/8 pass the class/level oracle (measured by round 30). THAC0 oracle
passes **≥ 10 of 12** accepted records (estimate — Pools' `[46,50,52,48,46,48]` reads as THAC0
14/10/8/12/14/12 for what should be mid-teens levels; a systematic miss is a finding about the
store, not the tool). XP oracle passes **≥ 10 of 12** (estimate; Treasures' `22600` on most
records looks like a fresh-party value). Race **not** translatable (two-sided). After Phase B:
e2e +2, evidence +6 (estimate), `KNOWN_UNDOCUMENTED` unchanged, `docs.ts` +2 flags.

**Hard constraints.** Read-only GOG folders (never copy a `CHRDATA*.SAV` into the repo); no EXE
patching; do not commit, do not deploy.

---

## R4 — The 305 DQK Amiga wall frames that fall through `decodeGlib`, with the DOS HLIB frames as the oracle

**Why now.** `dqkAmigaWallArt.test.ts:129-148` pins 38% of the DQK Amiga `8X8DB`/`8X8DC` members
as stubs and says the failures are structured — ~15 of 47 at a regular stride in most sets, and
`8X8DB` set 4 failing 47/47 — "a per-set codec or plane-depth variant". Nobody has printed the
draw-method byte of a failing member. The DOS files are the same sets in HLIB, and per-frame
dimensions already agree at shift 0 for 478 of 494 decodable frames, so for every failing Amiga
member the DOS twin publishes the expected `(w, h)` — which turns the codec question into byte
arithmetic: which `(nplanes, variant)` makes the member's body length equal the plane budget.
This is the DAX↔DAA `BIGPIC1` proof again, one format generation later. Two-sided by
construction: a variant that decodes the 305 with the DOS twins agreeing on dimensions (and,
where the DOS and Amiga art are the same picture, on pixels after palette mapping) is a decoder
fix; a body length no hypothesis fits is a numbered negative.

**Read first.** `CLAUDE.md`; `docs/engine/research/dqk-amiga-wall-art-feasibility.md` (whole —
§1c, §3); `packages/engine/test/dqkAmigaWallArt.test.ts` (whole — `amigaFrames`, `isStub`, the
pins you will flip); `packages/engine/src/loaders/glib.ts` (whole — `decodeImage` `:440-518`,
`decodeE3`, `rle18`, `planesToChunky`, `iterLeafRegions`, `loadContainer`; the header comment
on which titles use 4 vs 5 planes); `packages/engine/src/loaders/hlib.ts` (the DOS twin's frame
header and codecs — the shapes to compare); `docs/hlib-format.md`; `docs/daa-format.md` §8 and
`docs/engine/research/subframe-format.md` §3 (the disassembly-from-the-68000 precedent, if the
arithmetic alone does not settle it — the WHDLoad `data/` folder has no executable, so that
route needs the ADF-extracted `amiga_extracted/` DQK binary or is out of scope; say which);
`packages/engine/test/dungeonWallsAmigaGlib.test.ts` (round 29's real-bytes GLIB precedent).
Files: Amiga `…\unpacked\DarkQueenOfKrynn\data\Disk2\8X8DB.TLB` / `8X8DC.TLB` (82,238 B / ?);
DOS `The Dark Queen of Krynn\DISK2\8X8DB.TLB` / `8X8DC.TLB`. Read in place.

**Scope — files this agent owns (Phase A).**
- NEW `tools/glib_frame_census.py` — pure-Python big-endian GLIB leaf walker (mirror `glib.ts`'s
  header shape: `h u16, voff u16, hoff u16, wb u8, dm u8`), printing per member: set index, frame
  index, `dm`, `wb`, `h`, body length, and the DOS twin's `(w, h)` from `tools/hlib_decode.py`;
  then the histogram of `dm` over the 305 stubs vs the 494 non-stubs, and for each stub the
  `(nplanes, variant)` hypotheses whose plane budget equals the body length (raw contiguous,
  raw masked, RLE'd — after `rle18` where applicable, so the tool needs a Python `rle18`).
- NEW `tools/test_glib_frame_census.py` — pins the `dm` histogram exactly (measured), the stub
  count 305 (the census must agree with the engine's before anything changes), and the
  hypothesis table for set 4 of `8X8DB`. Skip when either source is absent.
- `packages/engine/src/loaders/glib.ts` — `decodeImage` only, and only for a variant the census
  identified by arithmetic **and** whose decoded frames agree with the DOS twins' dimensions on
  every affected member; the docblock cites the `dm` byte and the byte budget. If the identified
  variant needs a palette the file lacks, use the same `fallbackPalette` path the 4-plane sets
  already use and say so.
- `packages/engine/test/dqkAmigaWallArt.test.ts` — the KNOWN GAP pins (`:129-148`) move to the new
  counts; the dimension-agreement pins (`:93-110`, `:125`) are re-measured and must not go down;
  add the per-set stub table as data so a partial fix is visible as a partial fix.
- NEW `docs/engine/research/dqk-amiga-glib-frame-variant.md` — the histogram, the arithmetic, the
  verdict per set, and pixel-level agreement with DOS where the art is shared (state the palette
  mapping used, as `dok-8x8d-amiga-format.md` did with block 202's relocation).

**Must NOT touch:** `hlib.ts`, `loadGame.ts`, `explore.ts`, `dqkExplore.ts`, `gameData.ts`,
`glibTileBank.ts`, `dungeonWallsAmigaGlib.test.ts`, R6's census files, `e2e.mjs`.

**Acceptance.** Engine tests and `pnpm test:corpus` green; `tsc` clean; the report gives the
`dm` histogram, the stub count before/after, per-set counts, and the dimension-agreement numbers
before/after.

**Nulls / mutations.** (i) The DOS-twin dimension check is the null: a wrong variant that
"decodes" produces frames whose `(w, h)` disagree with DOS — report agreement over the newly
decoded frames next to the 478/494 baseline, and reject any variant below it. (ii) Feed the
Python census a member with `dm` forced to a known-good value → it must classify as non-stub
(the census discriminates on `dm`, not on position). (iii) Revert the `glib.ts` change → the
new pins red. (iv) The other GLIB titles are the control: run the census over Pools/Gateway
Amiga `8X8D.TLB` and report their stub counts before and after — a variant that is real for DQK
must not *break* a frame that decoded before (pin: zero regressions).

**Prediction.** The 305 stubs share **one or two `dm` values** absent from the 494 (estimate);
set 4 of `8X8DB` is a **5-plane variant in a 4-plane-declared file or vice versa** (estimate —
`glib.ts` decides `nplanes` from `dm ≥ 0xe0` alone). Stub count after: **≤ 60** (estimate;
two-sided — if the arithmetic fits nothing, the deliverable is the histogram and hypothesis table,
and the pins stay at 166/139). Dimension agreement on newly decoded frames ≥ 96% (the baseline's
own bar). Zero regressions on Pools/Gateway.

**Hard constraints.** Read-only Amiga and DOS sources; no EXE patching; do not commit, do not
deploy.

---

## R5 — Three standing audits over the repo's own text: exports nothing consumes, formats nothing can reach, and numbers `CLAUDE.md` gets wrong

**Why now.** "Solved but unwired" has recurred in four shapes (an unreferenced export; a decoder
whose only consumer category filtered it out; a `?game=` URL in no menu; an importer consumed by
a drag-and-drop dump). Two of those shapes now have gates (`test_web_routes_documented.py`,
`test_capability_ledger_coverage.py`); the first has none. Measured: **16 of 1,167** `index.ts`
exports have no consumer outside their defining module and the tests — fourteen `C64_PICTURE_*`
constants, `addnd2eThac0` (a ruleset function nothing calls), `COK_WALL_PALETTE_BASE`. Separately,
`CLAUDE.md` — loaded into every agent session — says "164 cases" (`:291`; the harness reports 172
on `806aaac`) and "Disk 3 unrecoverable" (`:203`; the same file records the recovery at
`:313-320`). `tools/test_docs_claims.py` pins neither. All three audits are cheap, all three
return exact sets, and all three can come back "nothing to fix" next round, which is the point.

**Read first.** `CLAUDE.md`; memory `goldbox-solved-but-unwired`; `tools/test_docs_claims.py`
(whole — the style and the `AUTHORITATIVE_DOCS` scope); `tools/web_routes.py` and
`tools/test_web_routes_documented.py` (the exact-set idiom); `packages/engine/src/index.ts`
(export blocks; `decodeAsset` at `:1678` and its `DecodedAsset` union at `:1658`);
`apps/web/src/ui/catalog.ts:20-45, 120-140` (`kind: 'c64-picture' | 'dqk-save'`);
`packages/engine/src/game/loadGame.ts:100-165` (which formats a manifest row can produce);
`apps/web/games/*.json` (`container` fields); `apps/web/test/e2e.mjs` (grep `format ===`,
`encoding:` and the per-format cases); `docs/findings.md`, `docs/engine/ROADMAP.md` (the other
two authoritative docs).

**Scope — files this agent owns (Phase A).**
- NEW `tools/engine_export_consumers.py` — `exports()` (every name in `index.ts`'s `export {}`
  blocks, with `type` flag and defining module), `consumers(name)` (files under `apps/**` and
  `packages/**` excluding `node_modules`, `dist*`, `*.test.ts`, `**/test/**`, `.d.ts`, the
  defining module, and `index.ts`'s export/import lines — but **including** `index.ts`'s body,
  since `decodeAsset` lives there), and `unconsumed()` → sorted list. State the word-boundary
  regex and its known blind spots (string-keyed access, re-exports under another name).
- NEW `tools/test_engine_export_consumers.py` — (1) null on a synthetic pair of files (one
  consumed, one not) → exactly one hit; (2) `unconsumed()` on the real tree equals a pinned
  `KNOWN_UNCONSUMED` set **exactly** (measured — planner's 16; yours wins if it differs, say why);
  (3) every `DecodedAsset.format` and every catalog `kind` has at least one producer (a catalog
  entry or manifest row whose bytes sniff to it — resolve by reading the file if present, else by
  the manifest's `container` string, and say which) **and** at least one e2e case that asserts on
  a value derived from it — pinned as an exact `FORMAT_REACHABILITY` table with `producer` /
  `e2e` columns, `None` allowed only inside a pinned `KNOWN_UNREACHABLE` set.
- NEW `tools/docs_numeric_claims.py` — extract `<number> <noun>` claims from the four
  `AUTHORITATIVE_DOCS` with a small resolver registry: e2e case count (`runners` entries + `CASES`
  + 1 coverage — anchor on the registry text, never on line numbers), `test:corpus` collected
  count, manifest count, ledger profile count, `apps/web/games` count, `.d64` sides / PRG files
  (from the committed `docs/engine/research/c64-disk-format.md` numbers, since the drive is
  external — say so), Amiga extracted file counts (`amiga_extracted/`, skip if absent). Each claim
  classifies as `FRESH` / `STALE` / `HISTORICAL` (inside a dated section or a `~~strike~~`) /
  `UNCHECKABLE`, and the tool prints what it could not classify. Add a **status-claim** check
  for the two phrases a doc can contradict itself on: a sentence asserting "unrecoverable" /
  "not held" / "no decoder" for a thing another sentence in the same file says is recovered / held
  / decoded — implement as a pinned list of (assertion regex, contradiction regex) pairs, not as
  NLP, and say so.
- `tools/test_docs_claims.py` — add (d) `STALE` claims == a pinned exact set (measured: the
  `164 cases` and `Disk 3 unrecoverable` sentences), watched red before Phase B empties it; (e)
  the e2e count claim inside a 5% band the way (a) already does for `test:corpus`.
- NEW `docs/engine/research/standing-audits-round-31.md` — the three tables, the numbers, what
  Phase B should delete/rewrite (an unconsumed export is either wired, deleted, or pinned as
  deliberately public API — recommend per name), and the residual.

**Must NOT touch:** `CLAUDE.md`, `docs/findings.md`, `ROADMAP.md`, `HANDOFF.md` (Phase B rewrites
the stale sentences), `index.ts` (R3), `catalog.ts`, `e2e.mjs`, `main.ts`, `docs.ts`,
`goldbox_corpus.py`.

**Acceptance.** `pnpm test:corpus` green with the three new files collected; the report gives
the exact `KNOWN_UNCONSUMED` set with a recommendation per name, the `FORMAT_REACHABILITY` table,
and the stale-claims set with the corrected sentence for each.

**Mutations.** (i) Add `export const zzzUnused = 1;` to a scratch copy of a loader → the set
mismatch red. (ii) Remove `sniffIlbm` from the scratch `decodeAsset` → the ILBM producer row must
flip. (iii) Change "164" to "172" in a scratch copy of `CLAUDE.md` → that claim flips to `FRESH`
and the stale set shrinks (the audit detects a fix, not just a break). (iv) Add a fake
`HISTORICAL` marker around a stale sentence → it must be excluded, and the report must say so.

**Prediction.** `KNOWN_UNCONSUMED` = **16** (measured; your regex may differ — pin yours);
`FORMAT_REACHABILITY`: `ilbm` has a producer (the CoK/DoK Amiga `.lbm` catalog entries) and an
e2e case; **`daa` has a producer and a case; `glib` has a producer but the e2e assertion is on a
frame count only** (estimate); `dqk-save` has a producer via `?import=dqk` (measured) — so
`KNOWN_UNREACHABLE` is **empty or one entry** (two-sided). Stale claims in `CLAUDE.md`: **exactly
2** (measured); in `findings.md`/`ROADMAP.md`: **0** (estimate — both carry dated sections the
`HISTORICAL` rule should absorb; if the rule misfires, the count is a defect in the rule, not the
docs).

**Hard constraints.** Read-only game data; no EXE patching; do not commit, do not deploy.

---

## R6 — Six Amiga sets we hold and list nowhere: decoder coverage measured with the shipped decoders, manifests staged for the ones that clear the bar

**Why now.** The holdings matrix says Amiga for ten titles; the Library lists three. Round 27
turned Buck's Amiga folder into a manifest by measuring "29 of 31 `.daa` decode with the shipped
decoders unchanged, 454 frames" and pinning the per-file counts. The six GLIB-era sets — Curse
(27 container files), Secret (21), Pools (24), Gateway (27), Treasures (25), DQK (23) — have had
`decodeAsset` GLIB support since 2026-08-22 and have never been measured as sets. Pool of
Radiance's Amiga set (23 files, the 4th format) is decoded only by `tools/pool_amiga_decode.py`
and is reported here as **solved-but-unported**, not manifested. This is the "a `?game=` URL is
not a menu entry" class one step earlier: the titles have no `?game=` at all.

**Read first.** `CLAUDE.md`; HANDOFF twenty-seventh entry (the Buck Amiga manifest paragraph and
the frame-count correction); `docs/amiga-inventory.md` §2026-07-18 (format verdicts per set);
`docs/goldbox-versions-holdings.md` §2; `apps/web/games/buck-rogers-amiga.json` (the template —
absolute WHDLoad paths, `category`, `label`, `note`s only for measured things);
`packages/engine/src/game/loadGame.ts:100-165` (the DAA/ILBM/GLIB branches — what a row can
render); `packages/engine/src/loaders/glib.ts` (the header comment on 4- vs 5-plane titles and
`fallbackPalette`; `firstGlibPalette`); `apps/web/test/e2e.mjs` (`buck-rogers-amiga-view`, the
per-file pins); `tools/test_capability_ledger_coverage.py:54` (`PLATFORM_VARIANT_MANIFESTS` —
Phase B extends it); `packages/engine/src/detect/profiles.ts` (whether a detector exists for each
Amiga folder; the CoK-Amiga/Buck-Amiga confusion from round 27 is the hazard). Sources: the
WHDLoad `unpacked\<Title>\data\` folders (read-only).

**Scope — files this agent owns (Phase A).**
- NEW `packages/engine/test/amigaGlibSetsCensus.test.ts` — for each of the seven sets (skip per
  set if absent): walk every `.tlb`/`.glb`/`.dax`/`.lbm` (case-insensitive) under `data/`, run
  `decodeAsset` **unchanged**, and pin per set: container files, files that decode to ≥ 1 image,
  files that decode to 0 images with their `tag`, files that throw with the error's first line,
  total image frames. For PoR, pin that every `.dax` throws or sniffs as none of the five formats
  (the "unported" disclosure as a test). Measure on the **base commit's** `glib.ts` — R4 may
  change it mid-round; state the commit you measured on.
- NEW `tools/test_amiga_sets_holdings_vs_manifests.py` — two-sided: the set of WHDLoad Gold Box
  folders present on disk (skip if the pack is absent) minus the set of manifests whose paths
  point into them must equal a pinned `KNOWN_UNMANIFESTED` set exactly (Phase B shrinks it by
  what it lands); and every manifest that points into the pack must point at an existing folder.
- NEW `docs/engine/research/amiga-glib-manifests.md` — the census table; the palette source per
  set (which `ALWAYS.TLB`/`.fon`/first-palette the 4-plane sets need, measured by whether frames
  come back with a colour table); a **staged manifest** per set as a fenced JSON block, one row
  per container file, `category`/`label` from the DOS sibling manifest's naming, `note`s only for
  measured counts, ids `curse-amiga`, `secret-amiga`, `pools-amiga`, `gateway-amiga`,
  `treasures-amiga`, `dark-queen-amiga`; a recommended landing order by coverage; and the PoR
  "unported" section pointing at `tools/pool_amiga_decode.py` and `docs/pool-amiga-format.md`.
- If `profiles.ts` has no detector for a set, **report** the marker files (do not edit
  `profiles.ts` — the round-27 mis-detection is the reason detection edits are reviewed, not
  batched).

**Must NOT touch:** `apps/web/games/*` (Phase B lands the files), `glib.ts` (R4), `loadGame.ts`,
`gameview.ts`, `main.ts`, `docs.ts`, `e2e.mjs`, `profiles.ts`, `detect.test.ts`,
`test_capability_ledger_coverage.py`, `goldbox_capabilities.json`, anything under `D:\`.

**Acceptance.** Engine tests and `pnpm test:corpus` green; the report gives the seven-row census,
the staged manifests, and the recommended landing order with each set's coverage percentage and
frame total.

**Nulls / mutations.** (i) Feed the census one DOS `.TLB` (HLIB) under an Amiga label → it must
sniff `hlib`, not `glib`, and the test must fail on the format pin (the census reads bytes, not
extensions). (ii) Delete one file name from a pinned set → red. (iii) Add a fake folder to the
`KNOWN_UNMANIFESTED` pin → red (exact set). (iv) Phase B: each landed manifest's e2e case pins its
frame total; drop one row → red.

**Prediction.** Per set, files decoding to ≥ 1 image: **Curse ≥ 20/27, Secret ≥ 16/21, Pools
≥ 18/24, Gateway ≥ 20/27, Treasures ≥ 18/25, DQK ≥ 15/23** (estimates; the `.glb` masters —
`ECL`, `GEO`, `SOUNDS`, `MONCHA` — are non-image by design and count against these). Frame totals:
**not predicted**. At least one set needs a `fallbackPalette` to render colour (the 4-plane
titles, per `glib.ts`'s header). After Phase B: manifests **16 → 16 + k**, `GAME_IDS` and
`DETECTED_TO_MANIFEST` `+k`, `PLATFORM_VARIANT_MANIFESTS` `3 → 3 + k`, e2e `+k`, with `k ≤ 3`
this round and the rest staged. `KNOWN_UNMANIFESTED` after Phase B: `7 − k`.

**Hard constraints.** Read-only WHDLoad folders; no EXE patching; do not commit, do not deploy.

---

## Dispatch order

**Phase A — fully parallel (six agents, disjoint files):**

| item | owns (Phase A) |
|---|---|
| R1 | `tools/buck_far_targets.py`, `tools/test_buck_far_targets.py`, `tools/map_buck_ecl_dispatch.py`, `tools/test_map_buck_ecl_dispatch.py`, `docs/engine/research/buck-ecl-dispatch-map.md` (regenerated), `docs/engine/research/buck-ecl-desyncs.md` (append), `packages/engine/src/ecl/disassemble.ts` (`ECL_GEN1_BUCK` block only), `packages/engine/test/buckEclDialect.test.ts`, `tools/gen1_ecl_encounter_scan.py` (+ Buck test rows) |
| R2 | NEW `tools/map_matrix_ecl_dispatch.py`, NEW `tools/test_map_matrix_ecl_dispatch.py`, NEW `docs/engine/research/matrix-ecl-dispatch-map.md` (generated), NEW `packages/engine/test/matrixEclDialect.test.ts`, NEW `docs/engine/research/matrix-ecl-dialect.md` |
| R3 | `packages/engine/src/loaders/secretSavedCharacter.ts` (optional layout fields only), NEW `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts`, NEW `packages/engine/test/poolsTreasuresSavedCharacter.test.ts`, `packages/engine/src/index.ts`, NEW `apps/web/src/ui/importPoolsTreasuresParty.ts`, NEW `docs/engine/research/pools-treasures-chrdata-fields.md` |
| R4 | NEW `tools/glib_frame_census.py`, NEW `tools/test_glib_frame_census.py`, `packages/engine/src/loaders/glib.ts` (`decodeImage` only), `packages/engine/test/dqkAmigaWallArt.test.ts`, NEW `docs/engine/research/dqk-amiga-glib-frame-variant.md` |
| R5 | NEW `tools/engine_export_consumers.py`, NEW `tools/test_engine_export_consumers.py`, NEW `tools/docs_numeric_claims.py`, `tools/test_docs_claims.py`, NEW `docs/engine/research/standing-audits-round-31.md` |
| R6 | NEW `packages/engine/test/amigaGlibSetsCensus.test.ts`, NEW `tools/test_amiga_sets_holdings_vs_manifests.py`, NEW `docs/engine/research/amiga-glib-manifests.md` |

Cross-check of the collision surface: no file appears in two rows. `packages/engine/src/index.ts`
is R3's alone. `disassemble.ts` is R1's alone (R2 stages its constant in its test). `glib.ts` is
R4's alone (R6 measures on the base commit and says so). `vroomm_layout.py`, `gen1_map.py`,
`map_pool_ecl_dispatch.py`, `hlib.ts`, `loadGame.ts`, `catalog.ts`, `explore.ts`, `dqkExplore.ts`,
`gameData.ts`, `profiles.ts`, `secret_chrdata_sweep.py`, `importSecretParty.ts`,
`matrix-cubed-profile.md` are read-only for everyone this round. If any agent finds it must edit
a file outside its row, it stops and reports instead of editing.

**Phase B — serialized, single-writer (the lead, one item at a time, in this order), after each
Phase A item has been reviewed and committed with `git commit -- <paths>`:**

1. **[R1]** `tools/goldbox_capabilities.json` sliced to the Buck profile: the `ecl.gaps` sentence
   that says the two unattributed sites stop at a byte "whose handler calls an unidentified far
   routine" → the round-31 state (three targets resolved by stub geometry, verdicts per opcode,
   what stays unknown and why — resident segments `0xbe4`/`0x653`); the override list if it
   changed. `apps/web/src/ui/eclInspector.ts` prose (census sentence, unattributed list) to match
   the pinned census; `docs.ts` `?ecl=buck` blurb numbers; `main.ts` comment if it quotes them;
   `supportClaims.json` Buck text; regenerate `support-evidence.json`; if `ecl2.dax#32` changed,
   re-pin `ecl-buck`. `HANDOFF.md`'s thirty-first entry must state plainly that the thirtieth
   entry's "resolved to nothing" was wrong for three of seven, with the calibration numbers.
   `pnpm test:corpus`.
2. **[R2]** `packages/engine/src/ecl/disassemble.ts`: land `ECL_GEN1_MATRIX` verbatim from the
   test-local constant (or `export const ECL_GEN1_MATRIX = ECL_GEN1_BUCK;` with the citation if
   R2 proved identity), and switch the test to import it. `eclInspector.ts`: a `matrix` arm
   opening `ECL1.DAX` with the block ids R2 measured **clean** (not a desync sample — the
   round-28 mistake); `main.ts` `?ecl=matrix`; `docs.ts` entry; `e2e.mjs` NEW case `ecl-matrix`
   pinning first vaddr, `lines >= 8`, a real EXIT row (three registrations + `id`); ledger Matrix
   `ecl` `unsupported → partial` with R2's evidence, `test_goldbox_corpus.py` evidence count `+m`
   re-measured; `test_web_routes_documented.py` watched red between the `main.ts` arm and the
   `docs.ts` entry. `tsc`, `pnpm test:corpus`, `pnpm build:app`.
3. **[R3]** `main.ts` import arm: `=== 'pools'` / `=== 'treasures'` → `startImportPoolsTreasuresPanel`
   wrappers; Library sidebar entries; `docs.ts` two entries naming the pregen scope, the raw
   fields and the two flagged heroes; `e2e.mjs` NEW `import-pools` (`count === 6`, names,
   class/level table, `ABAGAIL` flagged) and `import-treasures` (`count === 8`, `OUGO` flagged),
   watched red under R3's mutation (iv); ledger Pools and Treasures `retail_save.import`
   `unsupported → partial` sliced per profile, and the Curse `:271`-area sentence updated to name
   the importer; `test_goldbox_corpus.py` count `+n`; regenerate `support-evidence.json`;
   `test_web_routes_documented.py` between steps. `tsc`, `pnpm test:corpus`, `pnpm build:app`.
4. **[R4]** No browser file. Ledger DQK `graphics.gaps` sentence about the Amiga wall set (38% /
   305 stubs) → R4's after-count; if the count did not move, leave the sentence and add R4's
   histogram doc as evidence. If R4 changed `glib.ts`, re-run R6's census test on the landed tree
   and record the delta in R6's doc (Phase B note, not an R6 re-run).
5. **[R5]** `CLAUDE.md:291` `164 cases` → the re-measured total with "as of <date>" so (e) can
   band it; `CLAUDE.md:203` "Disk 3 unrecoverable — low priority" → "Disk 3 recovered 2026-07-18
   from the WHDLoad pack (see below)"; `CLAUDE.md:307`'s `test:corpus` sentence re-measured; empty
   `test_docs_claims.py`'s stale set, watched red before. `addnd2eThac0`: either wire it where the
   2e ruleset resolves THAC0 (if `addnd2e` currently falls through to 1e's, that is a finding —
   pin it) or remove the export; `COK_WALL_PALETTE_BASE` and the `C64_PICTURE_*` constants:
   keep as public API only if a doc says so, else drop from `index.ts` — then shrink
   `KNOWN_UNCONSUMED` to the residual, watched red between. `pnpm test:corpus`, `tsc`.
6. **[R6] atomic landing, per manifest, up to three, best coverage first:** copy the staged JSON
   to `apps/web/games/<id>.json`; `gameview.ts` `GAME_IDS` row; `main.ts` `DETECTED_TO_MANIFEST`
   only if a detector exists (else note "manual `?game=` only" in `docs.ts`); `docs.ts` dashboard
   entry (same step, or `test_web_routes_documented.py` goes red — watch it); `e2e.mjs` NEW
   `<id>-view` modelled on `buck-rogers-amiga-view` with R6's per-file frame counts (three
   registrations + `id`); `test_capability_ledger_coverage.py` `PLATFORM_VARIANT_MANIFESTS` `+1`
   (watched red between the copy and the pin); `tools/test_amiga_sets_holdings_vs_manifests.py`
   `KNOWN_UNMANIFESTED` `−1` (watched red); ledger: the DOS profile's `graphics.detail` names the
   Amiga manifest as a second set, not a better one. Scoped `<id>-view`, `manifest-picker-coverage`,
   `detection`. `tsc`, `pnpm test:corpus`, `pnpm build:app` (a new missing-asset warning means a
   staged path is wrong).
7. Full gates: engine, `pnpm test:corpus` (re-measure the collected total; `CLAUDE.md`'s
   sentence is banded at 15% — 1297 on the round-30 tree, estimate ≈ 1340 after this round),
   `tsc`, `pnpm build:app`, **full** `pnpm --filter @goldbox/web e2e` (**178 + k** expected),
   `pnpm e2e:intros`, atomic deploy per `CLAUDE.md`, live-bundle hash check, then drive
   `ecl-buck`, `ecl-matrix`, `import-pools`, `import-treasures` and each landed `<id>-view`
   against production through `GB_E2E_BASE_URL`. `HANDOFF.md` thirty-first entry — which must
   carry the R1 retraction, the R2/R3/R4 numbers next to their nulls, and the prediction
   corrections table appended to this file.

**Bench (substitutes if an item is dropped; same rules):**
- Pool of Radiance Amiga TS decoder port (`tools/pool_amiga_decode.py` → `loaders/poolAmiga.ts`,
  golden-pinned against the Python output) — only after R6's census pins PoR as unported.
- `?graphics=amiga` for DQK's top-down explorer — blocked on `dqkExplore.ts` having no wall view
  (`dqk-amiga-wall-art-feasibility.md` §1a); not this round.
- Buck `quests` flag census — only after R1, since a desyncing block hides its writes.
- The 30 C64/DOS same-length GEO/ECL pairs: map each differing byte to an instruction/operand
  (ECL) or plane cell (GEO) — a clean measurement, cut this round for lack of a consumer.

**Deliberately not picked (blocked, closed, or speculative):** seg051 RNG (trace); the three
default-arm route aliases (decision); every `[ ]` leaf in `BUILD-QUEUE.md` that names
DOSBox-X/GameLink/trace; C1.4b `?graphics=c64` (WAIT decision stands); C1.7 EasyFlash;
M10.S4 / M11.S5 (user-decision forks); the IDA `.sig` half (no licence); a Buck resident-segment
oracle beyond R1's prologue-rate stretch (needs a CoAB `START.EXE` symbol map that does not exist).

---

## Predictions to score this round against

| item | prediction | scored by |
|---|---|---|
| R1 | CoAB calibration 229/240, null 1/0/0/0 (measured); 3 of 7 targets resolve (measured); `0x2c` = `0` or `unknown`; `0x42` = `0` or `unknown`; `0x29` most likely `unknown`; census `4 → 3` only if the `0x29` site clears, else unchanged; `ecl2#32` unchanged | R1 report + Phase B step 1 |
| R2 | similarity ≥ 0.80 both; range `0x00..0x4c`, gaps `0x1f`/`0x3b`; ≥ 70/75 word sets agree with Countdown; extension prefetches 11/11; Matrix under `ECL_GEN1_BUCK` desync ≤ 6/33 (least confident); e2e +1 | R2 report + Phase B step 2 |
| R3 | 5/6, 7/8 (measured by round 30); THAC0 ≥ 10/12; XP ≥ 10/12; race untranslated; e2e +2; evidence +6 | R3 report + Phase B step 3 |
| R4 | stubs share 1-2 `dm` values; a plane-count mismatch; stubs ≤ 60 after (two-sided); dimension agreement ≥ 96% on new frames; 0 regressions on Pools/Gateway | R4 report + Phase B step 4 |
| R5 | `KNOWN_UNCONSUMED` = 16; `KNOWN_UNREACHABLE` ≤ 1; stale `CLAUDE.md` claims = 2, other docs 0 | R5 report + Phase B step 5 |
| R6 | coverage floors per set as stated; ≥ 1 set needs a fallback palette; `k ≤ 3` land; `KNOWN_UNMANIFESTED` = 7 − k | R6 report + Phase B step 6 |
| gates | e2e 175 → 178 + k; `test:corpus` ≈ 1340; build at 2 warnings; `KNOWN_MISSING` stays empty | Phase B step 7 |

Wrong predictions are appended under "## Corrections to this plan, measured after it was
written", as the last two plans did; this file is otherwise kept as the brief that was issued.

---

## Dispatch — the six prompts, ready to paste

Each prompt is complete on its own. Every agent gets the same closing block.

### R1

```
You are implementing item R1 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md; docs/engine/PLAN-ROUND-31.md (the header, ground rules, and the R1 section in full); docs/engine/HANDOFF.md thirtieth and twenty-ninth entries (Buck paragraphs); docs/engine/research/buck-ecl-desyncs.md (whole, especially the round-30 section you are correcting); tools/vroomm_layout.py:223-425; tools/buck_far_targets.py and its test; tools/map_buck_ecl_dispatch.py:156-300 and tools/test_map_buck_ecl_dispatch.py:317-360; packages/engine/src/ecl/disassemble.ts:319-445 and the ECL_GEN1_SHORT PARLAY note; packages/engine/test/buckEclDialect.test.ts; memory goldbox-verify-gaps-against-binary.

The finding you start from (planner-measured, reproduce it first): vroomm_layout.map_game(Buck) already routes segments 0xb8 and 0x10f as public_stub_owned. 0xb8:0x2a -> descriptor 15 stub 2 -> GAME.OVR:0x1ca15 (the dispatch map's parser — the calibration); 0xb8:0x7f -> 0x1e0f2 (called by 0x29); 0xb8:0xb6 -> 0x1e98e (called by 0x42); 0x10f:0x4d -> descriptor 25 stub 9 -> 0x2d9cd (called by 0x2c). On CoAB the same geometry puts 0x4c:0x2a on the oracle's 0x810a and 229 of 240 distinct stub-routed targets on oracle-named function starts, with +1/-1/+16/-16 byte shifts giving 1/0/0/0. Round 30's "all seven unresolved" is therefore wrong for three targets; its linear-fit negative stays true for linear fits. Only 0xbe4 and 0x653 are resident (genuinely unresolved).

Deliver: (1) tools/buck_far_targets.py gains a stub-geometry resolution path with the CoAB calibration and the shifted null; its test flips to 3 resolved / 4 unresolved (named), keeping the linear-fit negative. (2) tools/map_buck_ecl_dispatch.py walks each resolved callee for 0x29/0x2c/0x42 — first identify the ECL PC global from the parser body at 0x1ca15 — and emits a script_bytes_consumed verdict per opcode (0 / N / unknown naming the unread resident callee); regenerate buck-ecl-dispatch-map.md; move the pins in tools/test_map_buck_ecl_dispatch.py. (3) Stretch, only with its null: the resident mapping START.EXE file = mz_header + seg*16 + off, calibrated on CoAB by Borland-prologue hit rate vs +-1..16 shifts; land it only if decisive. (4) ECL_GEN1_BUCK in disassemble.ts changes ONLY for a verdict of 0 or N with every reachable callee read; publish the 0..8 corpus sweep next to any binary-read value; a variable-length frame is documented, not modelled. (5) buckEclDialect.test.ts census pins move only if the numbers move. (6) Append a dated round-31 section to buck-ecl-desyncs.md that retracts the round-30 statement plainly and carries every number with its null.

You own exactly: tools/buck_far_targets.py, tools/test_buck_far_targets.py, tools/map_buck_ecl_dispatch.py, tools/test_map_buck_ecl_dispatch.py, docs/engine/research/buck-ecl-dispatch-map.md, docs/engine/research/buck-ecl-desyncs.md (append), packages/engine/src/ecl/disassemble.ts (ECL_GEN1_BUCK block only), packages/engine/test/buckEclDialect.test.ts, tools/gen1_ecl_encounter_scan.py (Buck rows + their tests). Do NOT edit vroomm_layout.py or gen1_map.py (import them; report any needed change). Do NOT touch eclInspector.ts, docs.ts, main.ts, e2e.mjs, goldbox_capabilities.json, supportClaims.json, HANDOFF.md, the Buck manifests, any other dialect constant, or R2's new Matrix files — those are Phase B single-writer files: describe the exact edit you need in your report instead.

Mutations to watch red and restore: selector base 0x2d+-1 breaks the 0x1ca15 landing; revert one new override -> census pin red; +1 on a new count -> different census. Report: the calibration numbers, the three resolutions, per-opcode callee walk with the deciding instruction quoted, verdicts, census before/after, and whether ecl2.dax#32-35 changed. State every number next to the plan's prediction.

Hard constraints: Buck and CoAB installs are read-only; never patch an EXE; no DOSBox-X; game-data folders are never rewritten. Run pnpm --filter @goldbox/engine test, pnpm test:corpus, pnpm -r exec tsc --noEmit. Do not commit. Do not deploy.

ALREADY VERIFIED — do not re-derive, but DO reproduce as your first step and say whether you got the same numbers. An independent read-only adversarial pass at the close of round 30 reproduced (a)-(f) exactly against the real installs, and settled two things you would otherwise have to prove: (1) the calibration is NOT circular. 0x1ca15 was originally found by nearest_function() scanning all 603 raw Borland prologues in Buck's GAME.OVR and picking the best instruction-token match to CoAB's oracle-named @parse_command_sub$q4Byte (similarity 0.8550) — a path that never imports vroomm_layout, never touches descriptor/stub/fixup tables, and never uses the literal 0xb8:0x2a; and the seg:off literal itself comes from a majority vote (50/75 handlers) over raw disassembled text. Buck's bytes at 0x1ca15 are 5589e583ec08c646fe00, identical to CoAB's oracle prefix for the first 8. Three disjoint methods converge. (2) 229/240 is not a density artefact: oracle function starts are 737 in a 240,634-byte span (0.31%), a uniform-random null over 3,000 trials means 0.72-0.73 hits and never exceeded 6, so the real result is ~300x chance; and perturbing STUB_STRIDE to 3/4/6/8 resolves ZERO targets to public_stub_owned rather than merely fewer, so no competing plausible geometry exists. All three of 0x1e0f2, 0x1e98e, 0x2d9cd start with 55 89 e5 and disassemble cleanly for 25+ instructions. Round 30's linear-fit negative and this stub-geometry result are COMPATIBLE statements about different mechanisms — your retraction must say so rather than claiming round 30 was simply wrong.

REQUIRED CORRECTION, which the adversarial pass found and which must land with your retraction: do NOT write "only 0xbe4 and 0x653 are unresolved" without scoping it. That is true of the seven blocking targets only; Buck's binary has 16 distinct unresolved segments across its 3334 unresolved lcall sites (0xbe4, 0x653, 0x14b, 0x267, 0x15f, 0xa7b, 0x800, 0x8ad, 0x7da, 0x13e, 0x157, 0xb00, 0x1b0, 0xa93, 0xb62, 0x15c). Scope the sentence to the seven targets in every artifact you touch, and pin the 16 as a measured number so an unqualified reading cannot come back. Note also that NOTHING in the plan's prediction section is verified: the per-opcode script_bytes_consumed verdicts and any census movement still require reading 0xbe4:0x1b2b, 0xbe4:0x62a, 0x653:0x1359, 0x653:0xe58, which remain resident and unread. Report those as open unless you actually read them.
```

### R2

```
You are implementing item R2 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md; docs/engine/PLAN-ROUND-31.md (header, ground rules, R2 in full); docs/engine/research/matrix-cubed-profile.md; tools/map_buck_ecl_dispatch.py (whole) and tools/map_pool_ecl_dispatch.py:55-130; docs/engine/research/buck-ecl-dispatch-map.md; packages/engine/src/ecl/disassemble.ts:319-445; packages/engine/test/buckEclDialect.test.ts (whole); tools/gen1_map.py:71,313; docs/engine/research/gen1-ecl-extended-opcodes.md section 8.

Task: derive Matrix Cubed's ECL dialect from its own matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR (magic FBOV — CoAB's own overlay magic, so the FBOV helpers apply) with the same pipeline that produced Countdown's: structural match of dispatcher and operand parser against build/coab-oracle-map.json, dispatch_table plus the fallthrough resolver, the parser call target derived from the handlers, per-opcode word sets from the mov al,N prefetch. Then the sibling comparison against Countdown: per-opcode word-set agreement, and for the eleven 0x41..0x4c extension opcodes Countdown ships with uncertain: true, whether Matrix's handler carries the same prefetch immediate (agree / disagree / absent). Build a test-local ECL_GEN1_MATRIX in a new packages/engine/test/matrixEclDialect.test.ts (do NOT edit disassemble.ts — Phase B lands the constant) and pin the engine's single-path census over ECL1.DAX's 33 blocks under it AND under ECL_GEN1_BUCK, ECL_GEN1, ECL_GEN1_SHORT, ECL_GEN1_SHORT_POOLS (the null). Read headerLen/vbase from Matrix's own block bytes; do not inherit 22/0x7ffe. If ECL_GEN1_MATRIX equals ECL_GEN1_BUCK field-for-field, pin a deep-equal and say the censuses are identical by construction. Note: the Python all-paths scanner in gen1_ecl_encounter_scan.py is NOT a usable census (Countdown under its own dialect shows holes in 25/25 blocks) — use only as a hint, never as evidence.

You own exactly: NEW tools/map_matrix_ecl_dispatch.py, NEW tools/test_map_matrix_ecl_dispatch.py, NEW docs/engine/research/matrix-ecl-dispatch-map.md (generated), NEW packages/engine/test/matrixEclDialect.test.ts, NEW docs/engine/research/matrix-ecl-dialect.md. Import helpers from map_buck_ecl_dispatch.py / map_pool_ecl_dispatch.py read-only (R1 owns the Buck tool; copy a helper locally if you need a parameter, and say so). Do NOT touch disassemble.ts, buckEclDialect.test.ts, gen1_ecl_encounter_scan.py, eclInspector.ts, docs.ts, main.ts, e2e.mjs, goldbox_capabilities.json, the Matrix manifest, matrix-cubed-profile.md — describe any needed edit in your report (Phase B single-writer).

Nulls/mutations: the four sibling censuses; feeding the tool Countdown's TPOV game.ovr must refuse or report the mismatch; a pinned prefetch value +-1 -> red; dispatcher offset +1 -> similarity below the pinned floor. Report: match numbers next to Buck's 0.8872/0.8550, opcode range and gaps, parser target and share, the five-way census, the eleven-opcode table, and every number next to the plan's prediction.

Hard constraints: matrixcubed_extracted/ is git-ignored, read in place, never committed; nothing under D:\ is written; never patch an EXE; no DOSBox-X. Run pnpm --filter @goldbox/engine test, pnpm test:corpus, pnpm -r exec tsc --noEmit. Do not commit. Do not deploy.
```

### R3

```
You are implementing item R3 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md; docs/engine/PLAN-ROUND-31.md (header, ground rules, R3 in full); docs/engine/research/pools-treasures-chrdata-layout.md (whole); docs/engine/research/secret-chrdata-fields.md; packages/engine/src/loaders/secretSavedCharacter.ts (whole); packages/engine/test/secretSavedCharacter.test.ts; apps/web/src/ui/importSecretParty.ts (whole, including why docblocks must not quote game-data paths); packages/engine/src/index.ts (the Secret export block); packages/engine/src/ruleset/addnd1e/progression.ts; coab_extracted/Classes/Player.cs:403-560.

Task: the Pools of Darkness / Treasures of the Savage Frontier 510-byte pregen importer, built on the layout-parameterised decoder. Known, byte-grounded: class byte 0xae and ClassLevel[8] at 0x151 accept 5/6 Pools and 7/8 Treasures; ABAGAIL (Pools record 4, class 5) and OUGO (Treasures record 6, class 2) disagree with the oracle and must be SHOWN disagreeing in the panel, never translated. Abilities at 0x10 (unique), 0x32 at 0x170 on 14/14, party slot at 0x19c. Every other field enters the layout only with an oracle run over all 14 records and reported pass/fail with values: thac0@0xac vs the engine's 1e THAC0 for the pinned class/level; exp@0x172 (LE u32) inside [xpForLevel(level), xpForLevel(level+1)); hpMax@0xb2 as a bounded label; age@0xb0 range-only; savingThrows@0x132 in 1e range; race@0xad RAW unless you source the title's own enum from its binary with a cited offset; extra@0xaf raw and unnamed. Add OPTIONAL fields only (savingThrows?, partySlot?, extraByte?) to Gen1SavedCharacterLayout in secretSavedCharacter.ts, with Secret's output and tests unchanged.

You own exactly: packages/engine/src/loaders/secretSavedCharacter.ts (optional fields only), NEW packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts, NEW packages/engine/test/poolsTreasuresSavedCharacter.test.ts, packages/engine/src/index.ts, NEW apps/web/src/ui/importPoolsTreasuresParty.ts (importPoolsTreasuresParty(title), installImportPoolsTreasuresSeam(), startImportPoolsTreasuresPanel(root, title) — so Phase B's main.ts edit is two short arms), NEW docs/engine/research/pools-treasures-chrdata-fields.md. Do NOT touch main.ts, docs.ts, e2e.mjs, goldbox_capabilities.json, test_goldbox_corpus.py, supportClaims.json, secret_chrdata_sweep.py or its test/docs, importSecretParty.ts, coabSavedCharacter.ts, importCoabParty.ts — describe the Phase B edits (the two ?import= arms, two docs.ts entries, two e2e cases with the values to pin, the two ledger profiles) in your report.

Tests: goldens for all 14; the oracle accepting exactly 5/6 and 7/8 with the two misses named; shifted-offset negative (0xad/0xaf -> 0/n); cross-title null (Curse 422 B and Secret 439 B rejected by length AND, with size widened inside the test, by the oracle); it.skipIf on absence. Mutations to watch red and restore: class offset -> 0xad; widened size + Secret records; panel translating ABAGAIL as a plain magic-user must trip the seam pin. Scoped e2e import-secret and import-coab must still pass (GB_E2E_ONLY). Report every field's verdict and 14 values next to the plan's prediction.

Hard constraints: GOG folders are read-only, never copy a CHRDATA*.SAV into the repo; no quoted game-data path literals in docblocks; never patch an EXE. Run pnpm --filter @goldbox/engine test, pnpm test:corpus, pnpm -r exec tsc --noEmit, pnpm build:app (must stay at its two tolerated warnings). Do not commit. Do not deploy.
```

### R4

```
You are implementing item R4 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md; docs/engine/PLAN-ROUND-31.md (header, ground rules, R4 in full); docs/engine/research/dqk-amiga-wall-art-feasibility.md (whole); packages/engine/test/dqkAmigaWallArt.test.ts (whole — you will move its KNOWN GAP pins); packages/engine/src/loaders/glib.ts (whole, decodeImage at 440-518); packages/engine/src/loaders/hlib.ts; docs/hlib-format.md; docs/daa-format.md section 8; docs/engine/research/subframe-format.md section 3; packages/engine/test/dungeonWallsAmigaGlib.test.ts; memory goldbox-the-null-decides-the-finding.

Task: 305 of 799 members of the DQK Amiga 8X8DB.TLB/8X8DC.TLB (WHDLoad unpacked DarkQueenOfKrynn/data/Disk2) come out of decodeGlib as stubs; 8X8DB set 4 fails 47/47; nobody has printed the draw-method byte of a failing member. The DOS twins (The Dark Queen of Krynn/DISK2/8X8DB.TLB, 8X8DC.TLB, HLIB) are the oracle: same sets, 47-frame sets, dimensions agreeing at shift 0 for 478/494 decodable frames. Step 1: a pure-Python big-endian GLIB leaf walker (tools/glib_frame_census.py, mirroring glib.ts's 8-byte image header) printing per member dm/wb/h/body length and the DOS twin's (w,h), the dm histogram over stubs vs non-stubs, and for each stub the (nplanes, variant) hypotheses whose plane budget equals the body length (raw contiguous, raw masked, after rle18 — port rle18 to Python). Pin the histogram and the 305 in tools/test_glib_frame_census.py (skip if sources absent). Step 2: change glib.ts decodeImage ONLY for a variant the arithmetic identified AND whose decoded frames agree with the DOS twins' dimensions on every affected member; cite dm and the byte budget in the docblock. Step 3: move the pins in dqkAmigaWallArt.test.ts (dimension-agreement pins must not go down; add the per-set stub table as data). Step 4: docs/engine/research/dqk-amiga-glib-frame-variant.md with the histogram, arithmetic, per-set verdict, and pixel agreement with DOS where the art is shared (state the palette mapping). If the arithmetic fits nothing, the deliverable is the histogram, the hypothesis table, and unchanged pins — a numbered negative.

You own exactly: NEW tools/glib_frame_census.py, NEW tools/test_glib_frame_census.py, packages/engine/src/loaders/glib.ts (decodeImage only), packages/engine/test/dqkAmigaWallArt.test.ts, NEW docs/engine/research/dqk-amiga-glib-frame-variant.md. Do NOT touch hlib.ts, loadGame.ts, explore.ts, dqkExplore.ts, gameData.ts, glibTileBank.ts, dungeonWallsAmigaGlib.test.ts, e2e.mjs, goldbox_capabilities.json, or R6's new census files; describe any Phase B edit (ledger DQK graphics gap sentence) in your report.

Nulls/mutations: DOS-twin dimension agreement over newly decoded frames next to the 478/494 baseline (reject any variant below it); a member with dm forced to a known-good value must classify non-stub; revert glib.ts -> new pins red; run the census over Pools and Gateway Amiga 8X8D.TLB before and after and pin ZERO regressions. Report the histogram, stub counts before/after per set, agreement numbers, and every number next to the plan's prediction.

Hard constraints: Amiga and DOS sources read-only; never patch an EXE; no DOSBox-X. Run pnpm --filter @goldbox/engine test, pnpm test:corpus, pnpm -r exec tsc --noEmit. Do not commit. Do not deploy.
```

### R5

```
You are implementing item R5 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md; docs/engine/PLAN-ROUND-31.md (header, ground rules, R5 in full); memory goldbox-solved-but-unwired; tools/test_docs_claims.py (whole); tools/web_routes.py and tools/test_web_routes_documented.py (the exact-set idiom); packages/engine/src/index.ts (export blocks; decodeAsset at 1678, DecodedAsset union at 1658); apps/web/src/ui/catalog.ts:20-45,120-140; packages/engine/src/game/loadGame.ts:100-165; apps/web/games/*.json; apps/web/test/e2e.mjs (grep format ===, encoding:); docs/findings.md; docs/engine/ROADMAP.md.

Task: three standing audits, each returning an exact set. (1) tools/engine_export_consumers.py + test: every name exported from index.ts, and for each the files under apps/** and packages/** that reference it (excluding node_modules, dist*, *.test.ts, **/test/**, .d.ts, the defining module, and index.ts's export/import lines — but INCLUDING index.ts's body, where decodeAsset lives); pin unconsumed() == KNOWN_UNCONSUMED exactly (planner measured 16: fourteen C64_PICTURE_* constants, addnd2eThac0, COK_WALL_PALETTE_BASE — yours wins if it differs, say why). State the regex and its blind spots. (2) In the same test: a FORMAT_REACHABILITY table — every DecodedAsset.format and every catalog kind needs a producer (catalog entry or manifest row whose bytes sniff to it; read the file if present, else the container string, and say which) and an e2e case asserting on a value derived from it; None only inside a pinned KNOWN_UNREACHABLE. (3) tools/docs_numeric_claims.py + additions to tools/test_docs_claims.py: extract <number> <noun> claims from the four AUTHORITATIVE_DOCS with a resolver registry (e2e case count anchored on the runners registry text plus the CASES spread plus 1, test:corpus collected, manifests, ledger profiles, .d64 sides/PRG files from the committed C64 doc, amiga_extracted counts when present), classify FRESH/STALE/HISTORICAL/UNCHECKABLE, print the unclassifiable, and add a pinned list of (assertion regex, contradiction regex) pairs for self-contradictions ("unrecoverable" vs recovered etc.) — pin the STALE set exactly (planner measured 2 in CLAUDE.md: "164 cases" at :291 and "Disk 3 unrecoverable" at :203) and band the e2e-count claim at 5%. (4) docs/engine/research/standing-audits-round-31.md with the three tables and a per-name recommendation (wire / delete / pin as public API).

You own exactly: NEW tools/engine_export_consumers.py, NEW tools/test_engine_export_consumers.py, NEW tools/docs_numeric_claims.py, tools/test_docs_claims.py, NEW docs/engine/research/standing-audits-round-31.md. Do NOT edit CLAUDE.md, findings.md, ROADMAP.md, HANDOFF.md, index.ts (R3 owns it), catalog.ts, e2e.mjs, main.ts, docs.ts, goldbox_corpus.py — write the exact corrected sentences and the export dispositions in your report for Phase B.

Mutations to watch red and restore: a scratch export const zzzUnused -> set mismatch; remove sniffIlbm in a scratch decodeAsset -> the ILBM producer row flips; change "164" to the real count in a scratch CLAUDE.md copy -> that claim flips FRESH and the stale set shrinks (the audit must detect a fix, not only a break); a fake HISTORICAL marker around a stale sentence -> excluded and reported. Report every set next to the plan's prediction.

Hard constraints: read-only game data; never patch an EXE. Run pnpm test:corpus and pnpm -r exec tsc --noEmit. Do not commit. Do not deploy.
```

### R6

```
You are implementing item R6 of docs/engine/PLAN-ROUND-31.md in C:\Modding\GoldBox (branch greybox). Read, in order: CLAUDE.md (source locations; the Amiga WHDLoad path); docs/engine/PLAN-ROUND-31.md (header, ground rules, R6 in full); docs/engine/HANDOFF.md twenty-seventh entry (the Buck Amiga manifest and its frame-count correction); docs/amiga-inventory.md section 2026-07-18; docs/goldbox-versions-holdings.md section 2; apps/web/games/buck-rogers-amiga.json (the template); packages/engine/src/game/loadGame.ts:100-165; packages/engine/src/loaders/glib.ts (header comment on 4- vs 5-plane titles, fallbackPalette, firstGlibPalette); apps/web/test/e2e.mjs case buck-rogers-amiga-view; tools/test_capability_ledger_coverage.py:54; packages/engine/src/detect/profiles.ts.

Task: six held Amiga GLIB-era sets have no manifest — under D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\: CurseOfTheAzureBonds (27 container files), SecretOfTheSilverBlades (21), PoolsOfDarkness (24), GatewayToSavageFrontier (27), TreasuresOfSavageFrontier (25), DarkQueenOfKrynn (23); PoolOfRadiance (23, the 4th Amiga format, Python decoder only) is reported as solved-but-unported, not manifested. Measure, with the shipped decoders UNCHANGED (decodeAsset), on the base commit's glib.ts (R4 may change it mid-round; state the commit you measured on): NEW packages/engine/test/amigaGlibSetsCensus.test.ts walks every .tlb/.glb/.dax/.lbm (case-insensitive) under each data/ and pins per set: container files, files decoding to >= 1 image, files decoding to 0 images with their tag, files that throw with the error's first line, total frames; for PoR, pin that every .dax sniffs as none of the five formats. NEW tools/test_amiga_sets_holdings_vs_manifests.py: the set of WHDLoad Gold Box folders on disk minus the set of manifests pointing into them == a pinned KNOWN_UNMANIFESTED exactly, and every manifest pointing into the pack points at an existing folder. NEW docs/engine/research/amiga-glib-manifests.md: the census table; the palette source per set (measured by whether frames return a colour table); a staged manifest per set as a fenced JSON block (ids curse-amiga, secret-amiga, pools-amiga, gateway-amiga, treasures-amiga, dark-queen-amiga; one row per container file; category/label from the DOS sibling's naming; notes only for measured counts; absolute WHDLoad paths as the Buck template does); a recommended landing order by coverage; the PoR unported section pointing at tools/pool_amiga_decode.py and docs/pool-amiga-format.md; and, if profiles.ts has no detector for a set, the marker files you would use — do NOT edit profiles.ts (round 27's mis-detection is why detection edits are reviewed).

You own exactly: NEW packages/engine/test/amigaGlibSetsCensus.test.ts, NEW tools/test_amiga_sets_holdings_vs_manifests.py, NEW docs/engine/research/amiga-glib-manifests.md. Do NOT touch apps/web/games/*, glib.ts, loadGame.ts, gameview.ts, main.ts, docs.ts, e2e.mjs, profiles.ts, detect.test.ts, test_capability_ledger_coverage.py, goldbox_capabilities.json, anything under D:\ — Phase B lands up to three manifests atomically from your staged JSON; describe in your report, per manifest, the GAME_IDS row, the DETECTED_TO_MANIFEST key (or "manual ?game= only"), the docs.ts entry, and the e2e <id>-view frame pins.

Nulls/mutations: feed the census one DOS .TLB under an Amiga label -> must sniff hlib and fail the format pin (bytes, not extensions); delete one name from a pinned set -> red; add a fake folder to KNOWN_UNMANIFESTED -> red. Report the seven-row census and every number next to the plan's prediction (coverage floors per set, >= 1 set needing a fallback palette).

Hard constraints: WHDLoad folders are read-only; never patch an EXE. Run pnpm --filter @goldbox/engine test, pnpm test:corpus, pnpm -r exec tsc --noEmit. Do not commit. Do not deploy.
```

---

## Corrections to this plan, measured after it was written

The plan above is kept as the brief that was issued. Everything below is what the bytes said.

| # | what the plan predicted | what was measured | verdict |
|---|---|---|---|
| 1 | R1: CoAB calibration 229/240, null 1/0/0/0 | 229/240; uniform-random null averages 0.72 over 3,000 trials and never exceeded 6; perturbing the one free structural parameter resolves ZERO | **held**, and the null is stronger than predicted |
| 2 | R1: 3 of 7 far-call targets resolve | 3 of 7 (`0x1e0f2`, `0x1e98e`, `0x2d9cd`) | **held** |
| 3 | R1: `0x2c` = `0` or `unknown`; `0x42` = `0` or `unknown`; `0x29` most likely `unknown` | all three stay `unknown` — every resolved chain ends in unread resident code | **held** (the weaker branch of each) |
| 4 | R1: census `4 -> 3` only if the `0x29` site clears, else unchanged | unchanged at 4 | **held** |
| 5 | R1: round 30's "only `0xbe4`/`0x653` are unresolved" | true only of these seven targets; Buck's binary has **16** distinct unresolved segments | **plan's own carried-forward line was too wide**, now scoped |
| 6 | R2: similarity >= 0.80 both | dispatcher 0.8885, parser 0.8750 — and both are the unique global maximum over 564 candidates (mean 0.0648, runner-up 0.2583), a null the plan did not ask for | **held**, with a null added |
| 7 | R2: range `0x00..0x4c`, gaps `0x1f`/`0x3b` | exactly that | **held** |
| 8 | R2: >= 70/75 word sets agree with Countdown | 75/75 (53 concrete + 22 both-unmeasured, 0 disagreements) | **held numerically — and the framing was wrong.** Only **16 of 75** discriminate against the plain-Gen1 alternative (8 measured override deltas + 8 beyond-`0x40` extensions); 56 shared opcodes are free for the alternative and 22 are vacuous. Matrix matches Countdown 16/16. The plan asked for an agreement count and never asked what would have agreed anyway. See the corrected wording in `disassemble.ts`, the ledger, `supportClaims.json`, `docs.ts` and `docs/engine/research/matrix-ecl-dialect.md`. |
| 9 | R2: extension prefetches 11/11 | 11/11, including the three `no_far_call` opcodes independently landing on the same both-unmeasured verdict | **held** |
| 10 | R2: Matrix under `ECL_GEN1_BUCK` desync <= 6/33 ("least confident") | 4/33 | **held**, better than predicted — but the census is **not evidence**: plain Gen1 scores 26/7 on the same blocks and `ECL_GEN1_SHORT_POOLS`, wrong for Matrix, ties at exactly 29/4 |
| 11 | R2: e2e +1 | +1 (`ecl-matrix`) | **held** |
| 12 | R3: 5/6, 7/8 oracle agreement | 5/6 (ABAGAIL disagrees) and 7/8 (OUGO disagrees) | **held** |
| 13 | R3: e2e +2, evidence +6 | +2 (`import-pools`, `import-treasures`) | **held** |
| 14 | R3 (unpredicted) | the memo documented the two oracle misses but **not** that `createCharacter` rejects BINKY and CHERROD for unrelated race/class-cap violations, nor that SMOKE is excluded by the 6-hero party cap — three rejections, two different causes, easily mistaken for the oracle disagreement | **gap the plan did not anticipate**, now disclosed in the docs entry and the e2e assertions |
| 15 | R4: a `(nplanes, variant)` byte budget fits, and `glib.ts` changes if dimension agreement >= 96% | **no hypothesis fits any of the 305 stubs**; `glib.ts` untouched | **plan's hoped-for branch lost**; the plan's own sanctioned numbered-negative branch taken |
| 16 | R4: stubs <= 60 after (two-sided); 0 regressions on Pools/Gateway | stubs unchanged at 305; 0 regressions (nothing changed) | **not reached** — the two-sided pin never became applicable |
| 17 | R5: `KNOWN_UNCONSUMED` = 16 | **692** | **off by more than 40x.** Cross-checked three ways before being believed: known-wired exports report consumed, an independently written pre-existing sweep corroborates the magnitude by a different code path, and a real slice is type-only exports consumed via structural inference. Phase B then shrank it to **691** by wiring one, which the audit reported as `fixed` |
| 18 | R5: `KNOWN_UNREACHABLE` <= 1 | as pinned in `test_engine_export_consumers.py` | **held** |
| 19 | R5: stale `CLAUDE.md` claims = 2, other docs 0 | 3 stale claims found and all 3 fixed rather than allowlisted; `KNOWN_STALE_CLAIMS` is now empty and `FORMER_STALE_CLAIMS` guards against the pins being orphaned | **one more than predicted** |
| 20 | R6: `k <= 3` land; `KNOWN_UNMANIFESTED` = 7 - k | k = 3 (`dark-queen-amiga`, `pools-amiga`, `curse-amiga`); unmanifested 7 -> 4 | **held at the ceiling** |
| 21 | R6: >= 1 set needs a fallback palette | Curse needs one for **94.9%** of its frames (only 5.1% carry a real embedded palette); Pools for 17.1%; DQK for none. Gateway/Treasures/Secret were declined precisely because 86-88% of their frames have no palette at all | **held**, and quantified per set |
| 22 | gates: e2e 175 -> 178 + k; `test:corpus` ~= 1340; build at 2 warnings; `KNOWN_MISSING` stays empty | e2e 175 -> **181** (178 + 3); `test:corpus` **1378** + 1 skipped; build at exactly the 2 known warnings; `KNOWN_MISSING` empty | **held** (`test:corpus` ran 38 above the estimate) |

### The one that matters most

Item 8. The plan asked R2 to count agreements between two dialect tables and set the bar at
70/75. R2 cleared it with 75/75 and the round nearly shipped that as the headline. It took an
adversarial pass to point out that the question was malformed: an agreement count means nothing
until you say what the alternative would have scored, and the honest alternative here — the plain
Gen1 base table both dialects are built on — predicts 56 of those agreements for free. This is the
same failure the repo has already recorded twice under "the null decides the finding", arriving in
a new shape: not a wrong null, but a **missing** one, in a plan-written acceptance bar. Future
plans should state the alternative hypothesis alongside any agreement or match threshold, or the
bar will keep being clearable by construction.
