# Round 32 plan — base commit `112c360` ("Measure Matrix Cubed's own ECL dialect, and find the agreement proves less than it says")

Written 2026-09-03 by the round-32 planner. Planning only: nothing in this document has been
implemented, and no file other than this one was touched. Base state: `112c360` on `greybox`,
committed, pushed, deployed and verified live; gates at that commit were 2723 engine tests
(240 files), 1378 corpus tests (+1 skipped), full e2e 181/181 (144 `runners` + 36 `CASES` + 1),
`pnpm e2e:intros` green, `pnpm build:app` with the two tolerated warnings and 19 manifests.

Round 31's own post-mortem ("The one that matters most": the missing alternative hypothesis) is
the rule this plan is built around. Every acceptance bar below that counts an agreement, a
match, a similarity or an accept-count names the alternative it is measured against in the same
sentence, and every number an agent publishes is published next to its null.

---

## What the carried-forward list looked like against the bytes

Every claim the round-31 handoff carried forward was re-tested against the files before an
item was built on it. Three are wrong, one is stale in a way that changes an item's shape, and
one carried-forward *negative* turns out to have been measured against compressed bytes.

| # | Carried-forward claim (source) | Tested how | Verdict |
|---|---|---|---|
| 1 | "691 engine exports that nothing outside their defining module references" (HANDOFF 31, `standing-audits-round-31.md`) | Grepped the 691 names across `tools/*.mts` and `apps/web/test/e2e.mjs`, which the audit does not scan (it reads only `apps/**` and `packages/**` `.ts/.tsx`) | **WRONG by 19.** `tools/build-dqk-dir.mts` (7), `tools/build-cok-wallart-scratch.mts` (6), `tools/dqk-protection-solve.mts` (6), `apps/web/test/e2e.mjs` (2), `tools/cok_m4_static_verify.mts` (1), `tools/render_artmap_proof.mts` (1) consume `COK_WALL_SET_ID_BASE, CokWallDiskSource, DqkGameTarget, DqkProtectionQuestion, ItemRecord, REFERENCE_DB_DETAIL_ROWS, answerDqkProtection, buildDqkGameDataMulti, buildGen1ItemOverrides, buildPortableArtOverrides, decodeDqkSaveResume, decodeHlibSetIdTable, dqkArtEntry, normalizeHeading, parseDqkCodes, parseDqkCodesVocabulary, parseDqkProtectionPrompt, patchDqkSaveResumeArea, stampCokWallHeaders`. The build pipeline is a consumer the audit cannot see. The real number is 672, and the blind-spot list in `standing-audits-round-31.md` does not name this gap. Fixed in Phase B step 1. |
| 2 | "DQK populates its combat surface at `[bedb]+9` from DungCom1/WildCom1 and that routine is an unrecovered later task" (`goldbox_capabilities.json` DQK ruleset gap; `apps/web/test/e2e.mjs` explore-dqk comment; `dqkExplore.ts`) | `python tools/disasm_dqk.py --dqk-combat-map` and `--disasm 0x2c397 --len 0x120`; `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` | **WRONG (stale).** The routine is recovered: dispatcher `0x02cb60` (tests `[0xb20f]+0x22`), dungeon population `0x02c397` (fills 0x4e2 bytes with 0x16, walks `[0xa95f]` = -2..2 and `[0xa95e]` = -6..6, calls `0x02bddf` four times with direction 6/0/2/4 then `0x02be3e`, `0x02beeb`, `0x02bf75`, `0x02c18e`), cell writer `0x02bcf0` (`x = a95e*6 + a95f*5 + localX + 0x15`, `y = a95f*5 + localY + 0x0a`, writes `bg+1` at `[0xbedb]+9 + y*0x32 + x`), renderer `0x02ba4c`. It disassembles as plain Borland C — no fixups, no overlay stubs on the path. What is missing is a TypeScript transcription and a validated oracle (`build/dqk-bedb9-area18-cell115-journal.csv` and its `-resume2-` sibling are header-only). That is R1. |
| 3 | "DQK copy protection UNLOCATED; 0x212E3 was wrong" (memory `goldbox-protection-bypass.md`) | `docs/engine/research/unicorn-dqk-trace.md:1322-1332`; `build/dqk-load1000-journal-autoanswer.log:372701` | **WRONG (stale memory).** The answer-compare call is observed at file `0x039112` (canonical `26f8:02c2`, phys `0x037242`); prompt table `DGROUP:6dd2` (20-byte rows); prompt draw entry file `0x038edb`; static call site `0x031B11`. The 0x212E3 patch remains an unrelated overlay-4 gate. The site is located; what is not done is the branch after it and a data-side or build-copy-only bypass. Benched, not taken (see "Rejected"). |
| 4 | "MZ mapping `START.EXE file = mz_header + seg*16 + off`: 0/140 Borland-prologue hits at shift 0 — decisive negative; 16 resident segments unresolved" (`buck-ecl-desyncs.md` round-31 R1) | Read the MZ header and the 18 bytes at `CS:0000` of all eight Gen1 executables | **The negative was measured against compressed bytes.** Every Gen1 executable we hold is genuine Microsoft EXEPACK: `relocs = 0`, identical unpacker entry `8c c0 05 10 00 0e 1f a3 04 00 ...`, the `RB` signature at `CS:0010`, and the "Packed file is corrupt" string. Buck `start.exe` (dest 0x1108 paragraphs), Matrix `START.EXE` (0x1265), CoAB (0xf3e), CoK (0x1002), Pools `GAME.EXE` (0x11c5), Gateway `GAME.EXE` (0xa0d), Treasures `GAME.EXE` (0x1348), Secret `START.EXE` (0x137d). `docs/dax-format.md:146` and `packages/engine/src/util/rle.ts:32` already say this for CoK/DoK; `compiler-runtime-matrix.md` flags all of them "EXEPACK-like". Nobody connected it to the resident-segment calibration. The 229/240 CoAB stub-selector calibration was unaffected (it read `GAME.OVR`, which is not packed); the 0/140 resident result is uninformative, not negative. That is R5. |
| 5 | "CoK MIDI.DAX: 5 DAX blocks, ids 1-5, one per song" (`docs/midi-dax-format.md` §1, ledger CoK audio gap) | Decompressed all five blocks and counted `mov dx, imm16` immediates followed within 12 bytes by `out dx,al/ax`, plus `out imm8, al` | **WRONG.** Block 1 writes `0x221/0x223` (dual SAA1099 = C/MS); block 2 writes `0x330/0x331` (MPU-401 = Roland LAPC); block 3 writes `0x388` x16 (AdLib OPL2); block 4 writes port `0xC0` x18 (Tandy SN76496); block 5 writes `0x42/0x43/0x61` (PIT + PC speaker). That is the START.EXE "SOUND TYPE: [1] C/MS [2] Roland LAPC [3] AdLib [4] Tandy [5] PC" menu, in order. The five blocks are five hardware drivers for the same songs, not five songs for one chip. The song data therefore lives outside MIDI.DAX, which is why §1.6's search inside the block for a note timeline never found one. That reshapes R6. |
| 6 | "No Pools GAME.OVR opcode-dispatch disassembly was done — the dialect's word sets are derived from scan agreement across the corpus, not from a handler table" (ledger Pools ecl gap) | `packages/engine/src/ecl/disassemble.ts` docblock above `ECL_GEN1_SHORT_POOLS` | **Contradicted by the code's own docblock**, which says the four overrides were read from Pools' own handlers at `+0x264a`, `+0x0e9e`, `+0x1eca`, `+0x240c`. One of the two is wrong; no `pools-ecl-dispatch-map.md` exists (the `pool-` one is Pool of Radiance). Treasures' docblock, by contrast, admits "the opcode->handler dispatch was not located". R4 settles both from the bytes. |
| 7 | Secret / Gateway / Treasures Amiga GLIB sets are unmanifested because 86-88% of their frames have no palette (`amiga-glib-manifests.md` §5) | Ran `firstGlibPalette` on each `ALWAYS.TLB` and `decodeGlib` with and without it on representative banks | **Holds, and the fix is measured.** ALWAYS.TLB carries a `glib-ctab` in all three (Secret 16 colours; Gateway 32; Treasures 32; Curse 16). Passing it as `fallbackPalette` flips every 4-plane bank from `ega-fixed` to `glib-ctab` (Secret 8X8D 65, SPRIT 102, DUNGCOM 30; Gateway Sprit 120; Curse 8X8D 65) but leaves every 5-plane bank `NULL` (Gateway Walls 65 + 2384, DungCom 25; Treasures Walls 65 + 1404, dungcom 25, CBody 128) because `decodeGlib` (`glib.ts:596`) only applies a fallback when `setIs4Plane`. Nothing in `decodeAsset` or `loadGame.ts` passes a fallback at all; only `explore.ts:3701` does, for Gateway walls. That is R2. |
| 8 | Pool of Radiance Amiga format solved in Python only (`tools/pool_amiga_decode.py`), no TS port | Ran `parse_container` + `decompress_block` over all 23 `.dax` in the WHDLoad `PoolOfRadiance/data` | **Holds; 843/843 blocks decompress with checksum.** The DOS `pool-of-radiance` manifest (47 files) is the sibling oracle. That is R3. |
| 9 | Matrix: 16 discriminating of 75, 22 vacuous, 4 desyncs; Buck: 4 resident targets `unknown` | `matrix-ecl-dialect.md` §7-8, `buck-ecl-desyncs.md` | Holds — but the four Buck `unknown`s and the 22 vacuous opcodes all bottom out in resident START.EXE code, which row 4 shows was never readable. R5. |
| 10 | Amiga DQK: 305 stubs, no hypothesis fits | HANDOFF 31 R4 | Holds. Not taken — nothing byte-decidable in one round was proposed. |

---

## Ground rules for every item (the seven hard requirements)

1. Any acceptance bar on an agreement / match / similarity / accept-count names the alternative
   hypothesis in the same sentence. Where a count is asked for, the partition is asked for too:
   discriminating / free / vacuous.
2. A negative needs a null; so does every number. Report the null's number next to the real one.
3. Nothing is shipped until something outside its own test consumes it. Every export, decoder,
   manifest or format names its consumer in the acceptance criteria (a `GAME_IDS` row, a
   `decodeAsset` branch, a route in `main.ts`, a `docs.ts` entry, an e2e case). A `?game=` URL is
   not a menu entry.
4. Every new probe is mutation-tested: break it, watch RED, restore, report the RED line.
5. e2e cases need three-place registration (`const runners = new Map([` registry, awaited call in
   `main()`, name in `results.unshift(...)`). Never move or rename the `const runners = new Map([`
   declaration — `tools/goldbox_corpus.py` anchors on it.
6. Game data is read-only. Never patch an original EXE. External sources (the `D:/` Amiga, C64
   and DOS images; the GOG Galaxy installs) are referenced, never vendored. Any DOSBox-X
   automation uses the focusless GameLink protocol (`tools/dosbox_gamelink.py`, or `-GameLink` on
   `tools/dosbox_x_debugbox_probe.ps1`), never host-level SendKeys / SetForegroundWindow /
   SendInput. R6 is the round's only DOSBox-X owner.
7. File ownership is disjoint. The Phase B single-writer set is reserved for the lead:
   `apps/web/src/ui/main.ts`, `apps/web/src/ui/docs.ts`, `apps/web/src/ui/gameview.ts`,
   `apps/web/src/ui/eclInspector.ts`, `apps/web/test/e2e.mjs`, `apps/web/games/*.json`,
   `tools/goldbox_capabilities.json`, `apps/web/src/ui/supportClaims.json`,
   `apps/web/src/ui/support-evidence.json`, `tools/test_goldbox_corpus.py`, `tools/goldbox_corpus.py`,
   `tools/test_web_routes_documented.py`, `tools/test_capability_ledger_coverage.py`,
   `tools/test_amiga_sets_holdings_vs_manifests.py`, `tools/engine_export_consumers.py`,
   `CLAUDE.md`, `docs/engine/HANDOFF.md`. Agents write the intended patches for those files
   into their reports, verbatim, ready to apply.

Gates every agent runs before reporting: `pnpm --filter @goldbox/engine test`, `pnpm test:corpus`,
`pnpm -r exec tsc --noEmit`. Agents touching `apps/web` also run `pnpm build:app`. No agent
commits or deploys.

---

## R1 — DQK's own dungeon combat surface, transcribed from `DQK.EXE` (engine behaviour)

**Why now.** Every DQK fight is fought on `combat.ts`'s flat 13x9 fallback, pinned by
`explore-dqk` and disclosed in the ledger, on the stated grounds that the population routine was
unrecovered. Row 2 above shows it is recovered and readable. This is the single largest
faithfulness gap in the DQK profile and it is now a transcription job, not a research job.

**Read first.** `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` (Combat Map
Population, Combat Background Renderer, Remaining Work); `python tools/disasm_dqk.py --dqk-combat-map`;
`packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkNativeCombatMap`,
`dqkNativeTerrainGridFromBackgroundMap`); `packages/engine/src/combat/terrain.ts`
(`DQK_BACKGROUND_TILES`); `packages/engine/src/combat/coabCombatMap.ts:360-400`
(`buildCoabDungeonCombatMap`, the Gen1 sibling: same -2..2 / -6..6 walk, edge flags for
directions 0/6/2/4, `buildBackgroundTiles1..4`, `addRandomFurniture`); `apps/web/src/ui/explore.ts:1388-1399`
(`encounterTerrainForPose`, how Gen1 wires it); `apps/web/src/ui/dqkExplore.ts:1365-1420`
(`launchDqkCombat`, which passes no terrain).

**Scope.**
1. Disassemble and transcribe, instruction-quoted in the doc, `0x02c397` and its callees
   `0x02bd62` (the wall probe), `0x02bddf` (edge classifier; note the `[0x6189]`/`[0x6192]`
   direction-delta tables and the `(dir+4) mod 8` at its head), `0x02be3e`, `0x02beeb`,
   `0x02bf75`, `0x02c18e`, and the cell writer `0x02bcf0`. Identify every DGROUP global read
   (`[0xc9f0]`/`[0xc9f1]` look like party x/y; `[0xa964]`/`[0xa96c]`/`[0xa970]`/`[0xa972]` are the
   four edge results) and every table (the `0x6189`/`0x6192` deltas; anything under
   `0x02c18e` that looks like a furniture/random pick).
2. Add `buildDqkDungeonCombatMap(input)` to `packages/engine/src/combat/dqkCombatMap.ts`,
   taking the GEO wall lookup, the party pose and an injectable RNG, producing the 50x25
   `backgroundIds` surface that `buildDqkNativeCombatMap` already accepts. Where `0x02c18e`
   consumes the engine RNG, expose the RNG as an input and record the call sequence.
3. Wire `launchDqkCombat` in `apps/web/src/ui/dqkExplore.ts` to build and pass the terrain for
   dungeon poses (the `[0xb20f]+0x22 != 0` branch). Wilderness (`0x02cb2b`) is optional; if
   not done, the wilderness branch keeps the 13x9 fallback and the report says so with the
   count of DQK areas that would take each branch.
4. Write, into the report, the intended Phase B patches: the `explore-dqk` e2e pin flip
   (`{w:13,h:9}` → `{w:50,h:25}` and the comment rewrite), the ledger DQK ruleset gap sentence
   rewrite, and the `combat-source-matrix.md` row.

**Owned files.** `packages/engine/src/combat/dqkCombatMap.ts`, `packages/engine/src/combat/terrain.ts`
(only if a tile id needs adding), `packages/engine/test/dqkCombatMap.test.ts` (create if absent),
`packages/engine/test/dqkCombatCluster.test.ts`, `apps/web/src/ui/dqkExplore.ts`,
`docs/engine/research/dqk-overlay12-combat-setup-cluster.md` (new section), `tools/disasm_dqk.py`
(only to add a `--dqk-combat-helpers` listing if useful).

**Must NOT touch.** The Phase B set; `coabCombatMap.ts`; `explore.ts`; `combat.ts`.

**Acceptance.**
- The transcription is instruction-quoted: every branch in the TS has the `DQK.EXE` file offset
  of the instruction it transcribes in a comment, and the doc section lists all nine routines
  with their quoted disassembly.
- A test feeds the same synthetic wall inputs (at least three hand-built 13x5 windows: open
  room, corridor, dead-end corner) plus one real DQK GEO area (pick the area/cell the empty
  `build/dqk-bedb9-area18-cell115-journal.csv` was meant to capture) to both
  `buildDqkDungeonCombatMap` and `buildCoabDungeonCombatMap`, and reports, per input, the count of
  the 1250 cells that agree, **against the alternative hypothesis that DQK's routine is CoAB's
  `SetupDungeonFloor` verbatim** (which predicts 1250/1250 up to the tile-id vocabulary). Partition
  the agreeing cells into agree-by-fill (outside the 13x5 window, both sides' fill value) and
  agree-by-logic (inside the window), and name which helper explains each disagreeing region.
  The null: the same comparison with the wall input shuffled (expected agreement ~ fill-only).
- `window.__combat.mapSize()` on a `?dqk=1` dungeon fight returns `{w:50,h:25}` locally (the e2e
  pin will be flipped in Phase B; report the local run of `GB_E2E_ONLY=explore-dqk` showing the
  pin going RED for exactly that reason, which is the mutation test for the pin).
- The RNG consumption of the DQK path is recorded (calls per fight; null: CoAB's
  `addRandomFurniture` count on the same input).
- Consumer named: `launchDqkCombat` (`dqkExplore.ts`), reachable from `?dqk=1`.

**Nulls and mutations.** Break the cell writer's `+0x15`/`+0x0a` anchor in the TS and show the
agreement test go RED; restore; quote the RED line. Shuffled-wall null as above.

**Prediction.** Transcription under 400 TS lines. On the real area: >= 60% of 1250 cells agree
with CoAB's builder by logic-plus-fill, with the disagreements explained by (a) DQK's window
fill 0x16 vs CoAB's, (b) DQK's 0x02c18e furniture pick, (c) tile-id vocabulary. The alternative
"verbatim SetupDungeonFloor" is rejected by at least the fill value.

**Hard constraints.** Read-only `DQK.EXE`. No DOSBox-X (R6 owns it); the oracle is the
instruction-quoted disassembly plus the CoAB sibling, not a runtime dump. Do not commit.

---

## R2 — GLIB fallback palette from ALWAYS.TLB, then land Secret / Gateway / Treasures Amiga (decode something new)

**Why now.** Row 7 measured the fix: the palette these sets need is in each disk's ALWAYS.TLB,
`firstGlibPalette` already reads it, `glibTileBank.ts:72-90` already applies a fallback per
member, and `explore.ts:3701` already does exactly this for Gateway walls. What is missing is
(a) `decodeGlib` refusing the fallback for 5-plane sets and (b) any manifest-level way to say
"this file's palette lives in that file". With those two, the three staged manifests stop being
86-88% palette-less and can land, and `curse-amiga`'s 5.1%-real-palette state becomes 100%.

**Read first.** `docs/engine/research/amiga-glib-manifests.md` §2, §3, §5, §9 (staged JSON for
`secret-amiga`, `gateway-amiga`, `treasures-amiga`); `packages/engine/src/loaders/glib.ts`
(`readPalette`, `ega16Palette`, `setIs4Plane` at :535, `decodeGlib` at :596, `firstGlibPalette`
at :716); `packages/engine/src/loaders/glibTileBank.ts:72-90`; `packages/engine/src/game/loadGame.ts`
GLIB branch (~:140-165); `apps/web/src/ui/explore.ts:3695-3710` and `gameData.ts:249,1046`
(`amigaGlibPalettePath`); `apps/web/games/curse-amiga.json` (the landed shape to copy).

**Scope.**
1. In `decodeGlib`, apply `fallbackPalette` to 5-plane sets when the fallback has at least 32
   colours (ALWAYS.TLB's 0xE8 104-byte table); keep the EGA-16 stand-in for 4-plane sets only.
   Guard: a frame whose max index >= `fallback.count` must not be given that palette — count
   those and report the count (predicted 0) next to the count under the wrong (16-colour) palette.
2. Add a manifest field (name it `paletteFrom`, a path relative to the game root, per file or
   per manifest) consumed in `loadGame.ts`'s GLIB branch: read it once via `firstGlibPalette`,
   pass it as `decodeGlib`'s `fallbackPalette`. Types in the manifest type module (find it; own it).
3. Measure, per set, the palette-source histogram (`NULL` / `ega-fixed` / `glib-ctab`) over
   every frame of every GLIB file in the staged manifests before and after. Row 7's before
   numbers are the baseline to reproduce.
4. Oracle for "ALWAYS.TLB is the palette these frames were drawn with", **against the
   alternative that the per-disk TITLE.TLB colour table (or any other ctab on the same disk) is**:
   decode one Gateway wall tile and one Gateway sprite through the manifest path and through the
   source-verified `?explore=gateway-amiga` route's own `amigaGlibPalettePath` path; report the
   count of RGB-identical pixels (predicted 100%) next to the same count under TITLE.TLB's ctab
   and under a shuffled ALWAYS ctab. For Secret and Treasures, which have no explore route, do
   the same against the DOS sibling's frame for the same block id after EGA/VGA quantisation —
   report the nearest-colour agreement and its shuffled-palette null.
5. Finalise the three manifests plus the `curse-amiga` `paletteFrom` addition and write them,
   verbatim, into the report and into `amiga-glib-manifests.md` §10 for Phase B to land, together
   with the `GAME_IDS` rows, `docs.ts` entries, `KNOWN_UNMANIFESTED` edit (4 → 1, PoR left for
   R3), `PLATFORM_VARIANT_MANIFESTS` edit, and one e2e case per manifest in the shape of the
   `curse-amiga` case (three-place registration spelled out).

**Owned files.** `packages/engine/src/loaders/glib.ts`, `packages/engine/src/loaders/glibTileBank.ts`,
`packages/engine/src/game/loadGame.ts`, the manifest type module, `packages/engine/test/glib*.test.ts`,
`packages/engine/test/loadGame*.test.ts`, `docs/engine/research/amiga-glib-manifests.md`.

**Must NOT touch.** The Phase B set (manifests included); `packages/engine/src/index.ts`
(R3 owns `decodeAsset`; if R2 wants an options argument there, write it as an intended patch);
`explore.ts`; `gameData.ts`.

**Acceptance.**
- Before/after histograms for all six Amiga GLIB sets (Curse, Secret, Pools, Gateway, Treasures,
  DQK), each `NULL` count after the change stated next to the before count; the change must not
  alter DQK or Pools (their 0xE8 tables are in-file).
- The oracle in scope item 4, with all three numbers per tile.
- The guard count (frames with max index >= fallback count) — real number and the 16-colour null.
- Consumer named: `loadGame.ts` GLIB branch (already consumed by every `?game=` route) plus the
  three staged manifests, whose landing (Phase B) is the visible consumer.
- Mutation: point `paletteFrom` at a file with no ctab and show the loadGame test RED; restore.

**Prediction.** After: Secret 0 NULL / 0 ega-fixed; Gateway 0 NULL; Treasures 0 NULL; Curse 0
ega-fixed. Oracle 100% RGB-identical vs the explore route; TITLE.TLB ctab < 100%; shuffled ctab
< 20%. Guard count 0.

**Hard constraints.** Amiga sources referenced by `D:/` path only. Do not commit.

---

## R3 — Pool of Radiance Amiga decoder, TypeScript port, wired into `decodeAsset` (decode something new)

**Why now.** The 4th, distinct Amiga container (backwards LZSS bit-stream + XOR checksum, BE
10-byte TOC) is solved and verified in Python (row 8: 843/843 blocks), but nothing in the
engine reads it, so Pool of Radiance Amiga is the only held Gold Box set the product cannot
open. The DOS `pool-of-radiance` manifest and its 47 files are the sibling oracle for block
identity.

**Read first.** `docs/pool-amiga-format.md`; `tools/pool_amiga_decode.py` (`parse_container`,
`decompress`, `decompress_block`, `planar_to_indices`, `parse_standard`, `parse_animated`,
`compose_paperdoll`); `packages/engine/src/loaders/daa.ts` (the Amiga sibling loader whose shape
to copy) and `packages/engine/test/daa.test.ts`; `packages/engine/src/index.ts:1692`
(`decodeAsset` dispatch); `apps/web/games/pool-of-radiance.json` (DOS sibling manifest);
`apps/web/games/curse-amiga.json` (an Amiga manifest shape); memory note
`goldbox-sibling-platform-as-oracle.md` (compare payloads from offset 2; sibling ids are DOS ids).

**Scope.**
1. `packages/engine/src/loaders/poolAmiga.ts`: container parse, decompress with checksum,
   standard and animated frame parse, palette handling (`--pal alt/combat/combat2/dark/pic` in
   the Python tool — port the same tables and say where each comes from), returning the same
   `DecodedAsset` shape the DAA loader returns.
2. Golden fixture: a Python script `tools/pool_amiga_golden.py` emits
   `packages/engine/test/fixtures/pool-amiga-golden.json` holding, per file, per block: the
   sha256 of the decompressed bytes, and per decoded frame: `w,h,frames`, and the sha256 of the
   index array. Hashes only — no pixel data is vendored.
3. `decodeAsset` branch (format tag `'pool-amiga'`, plus detection by the BE 10-byte TOC + checksum
   if hintless detection is feasible; say which).
4. Sibling-oracle test: for every `.dax` name shared with the DOS manifest, compare `(w,h)` per
   block id with the DOS DAX decode, **against the alternative that Amiga block ids are unrelated
   to DOS block ids** — report the agreement count next to the count under a shuffled id mapping.
5. Stage `apps/web/games/pool-amiga.json` (in the report and in `docs/pool-amiga-format.md`
   §"Manifest"), with `GAME_IDS` row, `docs.ts` entry, `KNOWN_UNMANIFESTED` edit (PoR out),
   FORMAT_REACHABILITY row for `tools/test_goldbox_corpus.py`, and an e2e case in the
   `curse-amiga` shape, all as intended Phase B patches.

**Owned files.** `packages/engine/src/loaders/poolAmiga.ts`, `packages/engine/src/index.ts`
(export + `decodeAsset` branch only), `packages/engine/test/poolAmiga.test.ts`,
`packages/engine/test/fixtures/pool-amiga-golden.json`, `tools/pool_amiga_golden.py`,
`tools/test_pool_amiga_golden.py`, `docs/pool-amiga-format.md`.

**Must NOT touch.** The Phase B set; `tools/pool_amiga_decode.py` (the oracle stays as it is
— if it has a bug, report it, do not fix both sides in the same round); any other loader.

**Acceptance.**
- 843/843 decompressed-block hashes identical to the Python oracle, and N/N frame index hashes
  identical (state N), **against the alternative that the TS port is a re-implementation that
  merely renders plausibly** — the null is the same comparison after flipping one input bit per
  block (expected 0/843).
- Sibling-oracle agreement count with its shuffled-mapping null.
- Consumer named: the `decodeAsset` branch (reached by the asset browser for any file in the
  staged manifest) and the staged `pool-amiga` manifest for Phase B.
- Mutation: corrupt one golden hash, watch the test go RED, restore; quote the RED line.
- `pool_amiga_golden.py` is itself tested (`tools/test_pool_amiga_golden.py`, skipping when the
  `D:/` source is absent) so `pnpm test:corpus` sees it.

**Prediction.** 843/843 blocks, all frames identical; sibling `(w,h)` agreement >= 90% of shared
block ids vs a shuffled-mapping null <= 15%. Port under 500 lines.

**Hard constraints.** Amiga source referenced by path; hashes only in the repo. Do not commit.

---

## R4 — Pools / Gateway / Treasures ECL dialects read from their own `GAME.OVR` (engine behaviour, conditional)

**Why now.** Row 6: the ledger says Pools' dialect is corpus-fitted; the code says it was read
from Pools' handlers; neither is backed by a dispatch map. Treasures' code admits its dispatch
was never located and its 0x42 SET ORDER "is assumed, not proven". Gateway's `gen1-short-gateway`
has no map either. Three FBOV binaries (Pools 264086 B, Gateway 347622 B, Treasures 310572 B —
all `FBOV`, all unpacked on disk) and one TPOV (Secret, 278528 B) have never been put through the
pipeline that mapped CoAB, DoK, Buck, Matrix and Pool of Radiance.

**Read first.** `tools/map_pool_ecl_dispatch.py` (FBOV path, CoAB oracle in
`build/coab-oracle-map.json`, structural dispatcher match, `mov al,N; push ax; lcall <parser>`
prefetch), `tools/map_matrix_ecl_dispatch.py`, `tools/map_buck_ecl_dispatch.py` (TPOV path,
`find_operand_parser_pc_global`, `walk_far_call_chain`); `docs/engine/research/pool-ecl-dispatch-map.md`
and `matrix-ecl-dialect.md` §7-8 (the partition table shape); `packages/engine/src/ecl/disassemble.ts`
:268-320 (`ECL_GEN1_SHORT`'s Treasures docblock, `ECL_GEN1_SHORT_POOLS`), and the
`gen1-short-gateway` dialect literal; `apps/web/src/ui/gameData.ts:127-145,616,899,1488,1535`
(which route uses which dialect).

**Scope.**
1. Generalise the FBOV mapper into `tools/map_gen1_ecl_dispatch.py --game pools|gateway|treasures`
   (Secret via the TPOV path if it drops in; optional), writing
   `docs/engine/research/{pools,gateway,treasures}-ecl-dispatch-map.md` in the generated shape.
2. For each title, per opcode 0x00-0x4f: handler-read operand count (or `no_far_call` /
   `unknown`), the count the engine's dialect currently uses, and the count the plain
   `ECL_GEN1_SHORT` alternative would use. Partition: discriminating (dialect and alternative
   differ and the binary decides), free (they agree), vacuous (binary gives no count).
3. Decide row 6: do Pools' `+0x264a`, `+0x0e9e`, `+0x1eca`, `+0x240c` hold the prefetch idiom with
   the counts the docblock claims? Report yes/no per handler with the quoted bytes.
4. Test Treasures' 0x42 (`LOAD_AREA_PIECES`, wordSet 4) and its assumed SET ORDER against the
   handler; test Gateway's overrides likewise.
5. Change a dialect literal in `disassemble.ts` **only** where the binary contradicts it, and
   for each change show the corpus effect: count of ECL blocks whose disassembly changes, and
   the count of those that land on better instruction boundaries (fewer bad opcodes / fewer
   nonlocal GOTOs) versus worse — next to the same counts for the alternative. Every `?explore=`
   route on that dialect is the consumer; list them.

**Owned files.** `tools/map_gen1_ecl_dispatch.py`, `tools/test_map_gen1_ecl_dispatch.py`,
`docs/engine/research/pools-ecl-dispatch-map.md`, `gateway-ecl-dispatch-map.md`,
`treasures-ecl-dispatch-map.md` (+ `secret-` if done), `packages/engine/src/ecl/disassemble.ts`
(dialect literals only), `packages/engine/test/ecl*.test.ts` for pins on any change.

**Must NOT touch.** The Phase B set; `map_buck_ecl_dispatch.py`, `map_matrix_ecl_dispatch.py`,
`vroomm_layout.py`, `buck_far_targets.py` (R5); the Buck/Matrix dialect literals.

**Acceptance.**
- Three maps with dispatcher similarity and parser similarity to the CoAB oracle stated **next
  to the similarity of a non-dispatcher routine of the same length** (the null the Buck map
  used), and the operand-parser PC global identified per title.
- Per-opcode partition table per title, with totals (discriminating / free / vacuous / desync).
- Row 6 verdict with quoted bytes.
- For each dialect edit: the corpus-effect counts above, plus a pinned engine test naming the
  handler offset. For each non-edit where the binary and the dialect disagree but the corpus
  says the dialect is right: say so, do not edit, and file it as a desync with the count.
- Mutation: change one handler-read count in the tool's oracle map and show
  `test_map_gen1_ecl_dispatch.py` RED; restore.

**Prediction.** Pools: dispatcher similarity >= 0.95, the four docblock handlers confirmed, and
>= 40 opcodes dispatched; the ledger sentence is the wrong one. Treasures: 0x42 = 4 operands
confirmed; SET ORDER decided. Gateway: 0-2 dialect edits. At least one title yields a
discriminating opcode the corpus fit got wrong.

**Hard constraints.** Read-only `GAME.OVR`s (GOG Galaxy paths). Do not commit.

---

## R5 — Unpack EXEPACK, then finish the Buck / Matrix resident calibration and the 22 vacuous opcodes (tools + research)

**Why now.** Row 4: the "decisive negative" that left four Buck opcodes `unknown` and 16 resident
segments unresolved was measured against EXEPACK-compressed bytes. All eight Gen1 executables
carry the `RB` signature at `CS:0010`; the resident code is not on disk in readable form. An
EXEPACK unpacker is ~100 lines of public, well-documented algorithm (reverse run-length with
0xB0/0xB2 commands and a packed relocation table), and once the load image exists, every
resident target `walk_far_call_chain` bottomed in becomes readable — which also unblocks the 22
vacuous opcodes in both Buck and Matrix (neither handler chain reached the parser because both
ended in resident code).

**Read first.** `docs/engine/research/buck-ecl-desyncs.md` "Round 31 R1" (the three callee
disassemblies, the 0/140 calibration, the 16 segment list `0xbe4, 0x653, 0x14b, 0x267, 0x15f,
0xa7b, 0x800, 0x8ad, 0x7da, 0x13e, 0x157, 0xb00, 0x1b0, 0xa93, 0xb62, 0x15c`);
`docs/engine/research/matrix-ecl-dialect.md` §7-8 and its Correction; `tools/vroomm_layout.py`
(`classify_lcall_routes`, `public_stub_owned` / `unresolved_relocated_segment`),
`tools/buck_far_targets.py`, `tools/map_buck_ecl_dispatch.py`
(`find_operand_parser_pc_global` → `0x3be2`, `walk_far_call_chain`); `docs/dax-format.md:146`;
`tools/inventory_goldbox_binaries.py:261`.

**Scope.**
1. `tools/exepack_unpack.py <exe> --out <image.bin> --json <meta.json>`: parse the MZ header,
   read the EXEPACK header at `CS:0000` (`real_ip, real_cs, mem_start, exepack_size, real_sp,
   real_ss, dest_len, skip_len, 'RB'`), decompress backwards into `dest_len` paragraphs, decode
   the packed relocation table, apply nothing (relocations are recorded, not applied — the
   consumers want load-image-relative segment values). Emit the unpacked image and a JSON with
   the real entry point, the relocation list and the image length. Test on all eight Gen1
   executables; the length must equal `dest_len * 16`.
2. Independent check of the unpacker (**against the alternative that it produced a plausible
   but wrong image**): (a) every decoded relocation target must hold a word < `dest_len`
   (a segment value) — report the fraction next to the fraction at the same offsets in the
   packed file; (b) the 16 unresolved Buck segments must land on Borland prologues at shift 0
   in the unpacked image — report the count next to shifts -1 and +1 (the round-31 result was
   0/140 at 0 and 2/140 at -1 on packed bytes); (c) CoAB's resident targets from the 229/240
   calibration must resolve the same way.
3. Re-run `walk_far_call_chain` for Buck's four `unknown` opcodes and Matrix's four desyncs
   into the unpacked resident image; verdict per opcode: count N / `no_far_call` / still
   `unknown`, with the quoted prefetch bytes.
4. The 22 vacuous opcodes, both binaries: with the resident image readable, does the chain
   touch the ECL PC global `0x3be2` or call the parser? For each, the count if measured, and
   whether it is now discriminating (base `ECL_GEN1` count differs) or free.
5. Update `buck-ecl-desyncs.md`, `matrix-ecl-dialect.md` (§9), and both generated maps. Any
   dialect-literal edit goes into the report as an intended patch for Phase B (R4 owns
   `disassemble.ts`).

**Owned files.** `tools/exepack_unpack.py`, `tools/test_exepack_unpack.py`,
`tools/buck_far_targets.py`, `tools/vroomm_layout.py`, `tools/map_buck_ecl_dispatch.py`,
`tools/map_matrix_ecl_dispatch.py`, `docs/engine/research/buck-ecl-desyncs.md`,
`docs/engine/research/matrix-ecl-dialect.md`, `docs/engine/research/buck-ecl-dispatch-map.md`,
`docs/engine/research/matrix-ecl-dispatch-map.md`, `docs/engine/research/compiler-runtime-matrix.md`
(one sentence: "EXEPACK-like" → confirmed EXEPACK, all eight).

**Must NOT touch.** The Phase B set; `disassemble.ts`; `map_pool_ecl_dispatch.py`; any file R4
creates; the original executables (unpacked images go under `build/`, git-ignored).

**Acceptance.**
- Eight unpacked images, each `dest_len*16` bytes, with the three independent checks and their
  nulls.
- Buck: count of the 16 segments resolved (predicted >= 14); the four `unknown` opcodes each
  re-verdicted, with how many remain `unknown` and why.
- The 22-opcode table for both binaries: newly measured count, partition, and the totals
  before/after (Matrix was 16 discriminating / 56 free / 22 vacuous of 75 — state the new
  triple next to that one).
- Mutation: flip one byte in an unpacked image's relocation table and show
  `test_exepack_unpack.py` RED; restore.

**Prediction.** All eight unpack to length. Buck >= 14/16 segments on prologues at shift 0,
<= 2 at shifts -1/+1. Of the 22 vacuous, >= 12 become measured, of which >= 3 discriminating.
Buck's four `unknown` shrink to <= 1. Matrix's 4 desyncs: at least 2 attributed to a specific
opcode's count.

**Hard constraints.** Never write to the original executables. No DOSBox-X (R6 owns it). Do
not commit.

---

## R6 — CoK music: five drivers, not five songs — find where the songs actually live (decode something new; the round's only DOSBox-X owner)

**Why now.** Row 5: MIDI.DAX's five blocks are the five hardware drivers of the Sound Type menu
(C/MS, MPU-401, AdLib, Tandy, PC speaker), so §1.6's search for a "note timeline inside the
block" was looking in the right file for the wrong thing. The note events are read by the
driver from an external buffer handed over in CX/ES (§1.6's handshake), and that buffer's origin
is the actual question. The event grammar the driver consumes is already solved (§1.4), so the
stream is recognisable once seen. A full-RAM GameLink dump while the title music plays shows
the loaded driver, its live cursor and the buffer it is reading — and a search of the on-disk
files for that buffer's bytes answers "which file, which offset" without any disassembly.

**Read first.** `docs/midi-dax-format.md` §1.1-1.6 (event grammar, `FA 51 07` handshake,
readEvent pattern `26 8A 04 46 84 C0 78`), §2.4-2.6 (DoK backends; "same driver in Gateway /
Treasures / Pools MUSIC.DAX"); `docs/engine/research/dosbox-x-gamelink-automation.md` (the
single global shared-memory hazard; one session at a time); `tools/dosbox_gamelink.py` (`peek`,
`dump-memory --length 0x100000`, `press`, `screenshot`); `tools/dosbot/lib.ps1` (how the boot
scripts launch CoK from a scratch copy); `tools/unicorn_cok_midi.py` (what was tried statically
and where it stalled: overlay segment `0x4f4a`); `tools/carve_goldbox_overlays.py`;
`packages/engine/src/audio/` (the Amiga SMUS path, the shape a DOS song decoder would join).

**Scope.**
1. Publish the driver census as bytes: per MIDI.DAX block (CoK) and per driver blob backend
   (DoK §2.4), the `mov dx, imm16 ... out` port set and the `out imm8` set — the row-5 table with
   its method, **against the alternative "one block per song" which predicts the same port set in
   all five blocks** (observed: five disjoint sets). Extend the same scan to Buck, Matrix,
   Gateway, Treasures and Pools `MUSIC.DAX` (numbers only; this closes the ledger's
   "MUSIC.DAX uncatalogued" wording for Buck/Matrix at the driver level).
2. Static pass first (no emulator): the driver's readEvent loop consumes a byte stream with a
   known grammar. Write `tools/mididax_song_scan.py` that scores every 64-byte-aligned window
   of every CoK file (`GAME.OVR` carved segments, every DAX block of every DAX, `START.EXE`
   resident image if R5's unpacker lands early — otherwise the packed file, noted as such) for
   grammar conformance, and report the top candidates **next to the score distribution of
   shuffled windows** (the null). If a candidate stands clear of the null, name file + offset.
3. Dynamic pass: boot CoK from a scratch copy under DOSBox-X with GameLink output, select
   Sound Type [1] C/MS (or whichever the scratch config already has — record it), reach the
   title music, and `dump-memory` the full 1 MB. Locate the loaded driver by its 18-byte
   `JMP rel16` vector and 27-byte slot-0 stub (report the segment; null: the stub must occur
   exactly once); read the driver's live ES:SI / CX:ES buffer per §1.6; extract the buffer;
   search every on-disk CoK file for it. Report the match (file, offset, length) next to the
   null "a random 32-byte RAM window maps to no file span" (expected 0 of 100 random windows).
4. If found: `docs/midi-dax-format.md` §1.7 with the location, the buffer format cross-checked
   against §1.4, and `tools/mididax_song_extract.py` producing a note-event JSON per song. Then,
   if time allows, `packages/engine/src/audio/dosSong.ts` decoding that JSON to the same
   note-event shape the SMUS path feeds, with a unit test; the consumer is `gameAudio.ts`, whose
   wiring is written into the report as an intended patch (it is not in the Phase B set, but
   sharing it across rounds would be a second owner — leave it to the lead this round).
   If not found: the negative with both nulls, the dump kept under `build/`, and the exact
   next step.

**Owned files.** `tools/mididax_decode.py`, `tools/mididax_song_scan.py`,
`tools/mididax_song_extract.py`, `tools/test_mididax_*.py`, `docs/midi-dax-format.md`,
`packages/engine/src/audio/dosSong.ts`, `packages/engine/test/dosSong.test.ts`,
`tools/dosbot/` additions for the CoK music boot (new script files only).

**Must NOT touch.** The Phase B set; `apps/web/src/ui/gameAudio.ts` (intended patch only); the
repo game folders (run from a scratch copy; `KRYNN.CFG` in the repo is read-only); any other
agent's files.

**Acceptance.**
- The driver census table with the alternative-hypothesis sentence and the null.
- Static scan: top-5 candidates with scores next to the shuffled-window distribution
  (mean/max over >= 1000 windows).
- Dynamic: the driver segment (found exactly once), the live buffer's first 64 bytes, the file
  match with offset, and the random-window null count.
- Mutation: corrupt one byte of the readEvent grammar in `mididax_song_scan.py`'s recogniser and
  show its test RED on the known-good driver block; restore.
- If a decoder ships: the unit test, the JSON for all songs, and the named consumer.

**Prediction.** The songs are in `GAME.OVR` as data segments (not in any DAX) — the driver's
CX:ES buffer resolves into one of the 35 carved fbov segments; the static scan already ranks
that segment top-5 before the dump confirms it. DoK backends 4-5 are Tandy (port 0xC0) and PC
speaker (0x42/0x61). The DOS song decoder does not ship this round; the location and extractor do.

**Hard constraints.** DOSBox-X automation uses the focusless GameLink protocol only
(`tools/dosbox_gamelink.py`, or `-GameLink` on `tools/dosbox_x_debugbox_probe.ps1`); never
host-level SendKeys / SetForegroundWindow / SendInput. One DOSBox-X session at a time; R6 is the
only agent allowed to start one this round. Run the game from a scratch copy; never modify the
repo's game folders or any original executable. Do not commit.

---

## Rejected candidates (with reasons)

- **DQK copy protection bypass.** Row 3 shows the compare site is located (file `0x039112`),
  so this is now a two-step job: find the branch after the compare, then choose a data-side
  workaround or a patch applied only to the emitted build copy (`tools/build-dqk-dir.mts`),
  never to `DQK.EXE`. It needs the DOSBox-X slot to verify, which R6 holds, and the memory rule
  says the deliverable shape (save-flag vs build-copy patch) is a user decision. Benched with
  that exact next step; the memory note is corrected in Phase B.
- **"Wire the 692 unwired exports."** 19 of them are wired (row 1) and the rest are a
  maintenance list, not a capability. The audit blind spot is fixed in Phase B step 1; no
  agent slice.
- **Amiga DQK 305 stubs.** No hypothesis proposed that a round can decide from bytes.
- **Buck / Matrix MUSIC.DAX catalogue** — folded into R6 scope item 1 (numbers only).
- **Secret of the Silver Blades ECL map** — optional tail of R4 (TPOV path), not a slice.

---

## Dispatch order

| Slot | Item | Owner model | Resource it owns | Starts |
|---|---|---|---|---|
| 1 | R1 DQK combat surface | Opus | `dqkCombatMap.ts`, `dqkExplore.ts`, `disasm_dqk.py` | t0 |
| 2 | R2 GLIB fallback palette + three Amiga manifests | Opus | `glib.ts`, `glibTileBank.ts`, `loadGame.ts`, manifest types | t0 |
| 3 | R3 PoR Amiga TS decoder | Sonnet | `loaders/poolAmiga.ts`, `index.ts` | t0 |
| 4 | R4 Pools/Gateway/Treasures dispatch maps | Opus | `map_gen1_ecl_dispatch.py`, `disassemble.ts` | t0 |
| 5 | R5 EXEPACK + Buck/Matrix resident calibration | Sonnet | `exepack_unpack.py`, Buck/Matrix tools + docs | t0 |
| 6 | R6 CoK song location | Opus | **DOSBox-X (sole owner)**, `midi-dax-format.md`, `mididax_*` tools, `audio/dosSong.ts` | t0 |

All six launch in one message; ownership is disjoint by construction (R2/R3 split
`loadGame.ts` vs `index.ts`; R4/R5 split `disassemble.ts` vs the Buck/Matrix tools; R6 alone
starts DOSBox-X). R6 should not wait for R5's unpacker — the RAM dump contains the resident
image already.

### Phase B (lead, serialized, after all six reports are in)

1. **Audit blind spot.** `tools/engine_export_consumers.py`: add `tools/**/*.mts` and
   `apps/web/test/*.mjs` to the scanned set; re-pin `KNOWN_UNCONSUMED` (672 expected, minus
   whatever R2/R3 wire: `firstGlibPalette` leaves the list); rewrite the blind-spot paragraph in
   `standing-audits-round-31.md` (or a `-round-32.md` successor).
2. **Manifests.** Land `secret-amiga`, `gateway-amiga`, `treasures-amiga` (R2), `pool-amiga`
   (R3), the `curse-amiga` `paletteFrom` edit; `GAME_IDS` rows in `gameview.ts`; `docs.ts`
   entries; `KNOWN_UNMANIFESTED` 4 → 0; `PLATFORM_VARIANT_MANIFESTS`; FORMAT_REACHABILITY row
   for `pool-amiga`. 19 → 23 manifests; `pnpm build:app` must show no new missing-asset warning.
3. **e2e.** Flip the `explore-dqk` pin to `{w:50,h:25}` with R1's comment; add four manifest
   cases with three-place registration; run the full 181-case pass (expect 185) and
   `e2e-case-coverage` green.
4. **Ledger.** Rewrite: DQK ruleset gap (R1), Pools ecl gap (R4's row-6 verdict), CoK audio gap
   ("five drivers; songs at <location>" or the negative), Buck/Matrix ecl gaps (R5 counts),
   Buck/Matrix audio "MUSIC.DAX uncatalogued" → driver census (R6). `supportClaims.json` /
   `support-evidence.json` where a claim's evidence path moved.
5. **Dialect literals.** Apply R5's intended `disassemble.ts` patches (if any) after R4's edits
   are in; re-run the engine tests.
6. **Memory.** Correct `goldbox-protection-bypass.md` (compare site at file `0x039112`).
7. Gates: engine, corpus, tsc, build, full e2e, intros. HANDOFF thirty-second entry with a
   corrections table scoring the predictions below. Commit, push, deploy, verify the live bundle.

---

## Predictions to score this round against

| # | Item | Prediction | Scored how |
|---|---|---|---|
| P1 | R1 | Transcription < 400 TS lines; on the real DQK area >= 60% of 1250 cells agree with CoAB's builder; the "verbatim SetupDungeonFloor" alternative is rejected by at least the window fill value (0x16) | R1 report table |
| P2 | R1 | `?dqk=1` dungeon fights report `{w:50,h:25}`; the old 13x9 pin goes RED locally for exactly that reason | R1 mutation line |
| P3 | R2 | After: Secret 0 NULL / 0 ega-fixed; Gateway 0 NULL; Treasures 0 NULL; Curse 0 ega-fixed; DQK and Pools histograms unchanged | R2 before/after table |
| P4 | R2 | Gateway wall tile via manifest path is 100% RGB-identical to the explore route; TITLE.TLB ctab < 100%; shuffled ctab < 20%; guard count 0 | R2 oracle numbers |
| P5 | R3 | 843/843 blocks and all frames hash-identical to the Python oracle; bit-flip null 0/843; sibling `(w,h)` agreement >= 90% vs shuffled <= 15% | R3 report |
| P6 | R4 | Pools dispatcher similarity >= 0.95, >= 40 opcodes dispatched, the four docblock handlers confirmed — the ledger sentence is the wrong one | R4 row-6 verdict |
| P7 | R4 | Treasures 0x42 = 4 operands confirmed and SET ORDER decided; at least one title has a discriminating opcode the corpus fit got wrong; 0-2 Gateway edits | R4 partition tables |
| P8 | R5 | All eight executables unpack to `dest_len*16`; Buck >= 14/16 segments on prologues at shift 0, <= 2 at shifts -1/+1 | R5 checks |
| P9 | R5 | Of the 22 vacuous opcodes >= 12 become measured, >= 3 discriminating; Buck `unknown` 4 → <= 1; Matrix >= 2 of 4 desyncs attributed | R5 tables |
| P10 | R6 | Five disjoint port sets (C/MS, MPU-401, AdLib, Tandy, PC speaker) in CoK; DoK backends 4-5 = Tandy 0xC0 and PC speaker 0x42/0x61 | R6 census |
| P11 | R6 | The song buffer resolves into one of the 35 carved `GAME.OVR` fbov segments (not a DAX); the static scan ranks it top-5 before the dump | R6 match + scan |
| P12 | R6 | No DOS song decoder ships this round; location + extractor do | R6 deliverables |
| P13 | Phase B | Full e2e 185/185; manifests 23; `KNOWN_UNCONSUMED` re-pinned at 672 minus the wired ones; corpus count within 15% of the CLAUDE.md sentence (no sentence edit needed) | Phase B gates |

---

## Dispatch — the six prompts, ready to paste

Common preamble for every prompt (paste above each one):

> You are one of six agents in round 32 of the Gold Box Greybox build in `{repo-root}`
> (branch `greybox`, base `112c360`). Read `CLAUDE.md`, then `docs/engine/PLAN-ROUND-32.md`
> (your item and the "Ground rules" section), then the item's "Read first" list. Own only the
> files your item names; do not edit any file in the Phase B single-writer set (listed under
> ground rule 7) — write the exact patch you want applied there into your report instead.
> Game data and every original executable are read-only; external sources on `D:/` and under
> GOG Galaxy are referenced by path, never copied into the repo. Every agreement / match /
> similarity / count you report names the alternative hypothesis it was measured against in the
> same sentence, and every number is reported next to its null. Every new probe is
> mutation-tested (break it, see RED, restore, quote the RED line). Anything you build names its
> consumer outside its own test. Before reporting, run `pnpm --filter @goldbox/engine test`,
> `pnpm test:corpus`, `pnpm -r exec tsc --noEmit` (and `pnpm build:app` if you touched
> `apps/web`). Do not commit. Do not deploy. Report in under 400 words plus your tables and
> patches: what you measured, the numbers with their nulls, what you changed, the intended
> Phase B patches verbatim, and what you could not decide and why.

### Prompt R1 — DQK dungeon combat surface (Opus)

You own `packages/engine/src/combat/dqkCombatMap.ts`, `packages/engine/src/combat/terrain.ts`
(only to add a tile id), `packages/engine/test/dqkCombatMap.test.ts` (create if absent),
`packages/engine/test/dqkCombatCluster.test.ts`, `apps/web/src/ui/dqkExplore.ts`,
`docs/engine/research/dqk-overlay12-combat-setup-cluster.md`, and `tools/disasm_dqk.py` (only
to add a listing flag). Do not touch `coabCombatMap.ts`, `explore.ts`, `combat.ts`, or the
Phase B set. No DOSBox-X this round — R6 owns it.

Task. DQK's dungeon combat-surface population is located and readable: dispatcher `0x02cb60`,
population `0x02c397`, helpers `0x02bd62`, `0x02bddf`, `0x02be3e`, `0x02beeb`, `0x02bf75`,
`0x02c18e`, cell writer `0x02bcf0` (run `python tools/disasm_dqk.py --dqk-combat-map` and
`--disasm <addr> --len <n>`). Transcribe them into `buildDqkDungeonCombatMap(input)` in
`dqkCombatMap.ts`, producing the 50x25 `backgroundIds` surface `buildDqkNativeCombatMap`
already accepts, with the GEO wall lookup, party pose and an injectable RNG as inputs. Every
TS branch carries the `DQK.EXE` file offset it transcribes. Add the instruction-quoted
disassembly of all nine routines to the research doc. Then wire `launchDqkCombat` in
`dqkExplore.ts` to build and pass this terrain for dungeon poses (the `[0xb20f]+0x22 != 0`
branch); wilderness (`0x02cb2b`) is optional — if left, say so and count the DQK areas per branch.

Acceptance. (1) A test feeds three hand-built 13x5 windows (open room, corridor, dead-end
corner) plus one real DQK GEO area to both `buildDqkDungeonCombatMap` and
`buildCoabDungeonCombatMap` and reports, per input, how many of the 1250 cells agree — measured
against the alternative hypothesis that DQK's routine is CoAB's `SetupDungeonFloor` verbatim
(which predicts 1250/1250 up to tile-id vocabulary). Partition agreeing cells into
agree-by-fill (outside the window) and agree-by-logic (inside), and name the helper that
explains each disagreeing region. Null: the same comparison with the wall input shuffled.
(2) Record the RNG calls per fight on the DQK path next to CoAB's `addRandomFurniture` count on
the same input. (3) Locally, `?dqk=1` dungeon fights return `{w:50,h:25}` from
`window.__combat.mapSize()`; run `GB_E2E_ONLY=explore-dqk pnpm --filter @goldbox/web e2e` and
quote the line where the existing 13x9 pin goes RED — that is the pin's mutation test; do not
edit `e2e.mjs`. (4) Mutation: break the cell writer's `+0x15`/`+0x0a` anchor, watch the agreement
test go RED, restore, quote the line. (5) Consumer: `launchDqkCombat`. (6) Intended Phase B
patches, verbatim: the `explore-dqk` pin flip and comment rewrite in `apps/web/test/e2e.mjs`,
the DQK ruleset gap sentence in `tools/goldbox_capabilities.json`, and a
`docs/engine/research/combat-source-matrix.md` row.

Prediction to score: under 400 TS lines; >= 60% of 1250 cells agree on the real area; the
verbatim-CoAB alternative is rejected at least by DQK's 0x16 window fill.

### Prompt R2 — GLIB fallback palette from ALWAYS.TLB; land Secret / Gateway / Treasures Amiga (Opus)

You own `packages/engine/src/loaders/glib.ts`, `packages/engine/src/loaders/glibTileBank.ts`,
`packages/engine/src/game/loadGame.ts`, the manifest type module (find it), the
`packages/engine/test/glib*.test.ts` and `loadGame*.test.ts` files, and
`docs/engine/research/amiga-glib-manifests.md`. Do not touch `packages/engine/src/index.ts`
(R3 owns `decodeAsset`), `explore.ts`, `gameData.ts`, `apps/web/games/*.json` or the rest of the
Phase B set.

Measured baseline (reproduce it first). `firstGlibPalette` on each disk's ALWAYS.TLB returns a
`glib-ctab` (Secret 16 colours; Gateway 32; Treasures 32; Curse 16). Passing it as
`decodeGlib`'s `fallbackPalette` flips 4-plane banks from `ega-fixed` to `glib-ctab` (Secret
8X8D 65, SPRIT 102, DUNGCOM 30; Gateway Sprit 120; Curse 8X8D 65) but every 5-plane bank stays
`NULL` (Gateway Walls 65 + 2384, DungCom 25; Treasures Walls 65 + 1404, dungcom 25, CBody 128)
because `glib.ts:596` gates the fallback on `setIs4Plane`. Nothing in `loadGame.ts` passes a
fallback; only `explore.ts:3701` does, for Gateway walls.

Task. (1) Let `decodeGlib` apply a fallback with >= 32 colours to 5-plane sets; keep the EGA-16
stand-in for 4-plane only; guard against frames whose max index >= fallback count. (2) Add a
manifest field `paletteFrom` (path relative to the game root; per manifest, optionally per
file) consumed by `loadGame.ts`'s GLIB branch via `firstGlibPalette` → `decodeGlib(bytes, hint,
fallback)`. (3) Measure the palette-source histogram (`NULL` / `ega-fixed` / `glib-ctab`) over
every frame of every GLIB file in the staged `secret-amiga`, `gateway-amiga`, `treasures-amiga`
manifests and in `curse-amiga`, `pools-amiga`, `dark-queen-amiga`, before and after. (4) Oracle:
decode one Gateway wall tile and one Gateway sprite through the manifest path and through the
`?explore=gateway-amiga` route's `amigaGlibPalettePath` path; report the RGB-identical pixel
count — measured against the alternative that the per-disk TITLE.TLB colour table is the real
palette — next to the same count under TITLE.TLB's ctab and under a shuffled ALWAYS ctab. For
Secret and Treasures do the same against the DOS sibling frame for the same block id after
quantisation, with the shuffled-palette null. (5) Finalise the three manifests plus a
`curse-amiga` `paletteFrom` edit and write them verbatim into your report and into
`amiga-glib-manifests.md` §10, together with the `GAME_IDS` rows (`apps/web/src/ui/gameview.ts`),
`docs.ts` entries, `KNOWN_UNMANIFESTED` edit in `tools/test_amiga_sets_holdings_vs_manifests.py`
(4 → 1; PoR stays for R3), `PLATFORM_VARIANT_MANIFESTS` edit, and one e2e case per manifest in
the `curse-amiga` case's shape with three-place registration written out (`const runners = new
Map([` registry entry, awaited call in `main()`, name in `results.unshift(...)`; never move or
rename the `const runners = new Map([` declaration).

Acceptance. Before/after histograms for all six sets with each after-count next to its
before-count (DQK and Pools must be unchanged); the oracle's three numbers per tile; the guard
count next to the 16-colour null; the consumer (`loadGame.ts` GLIB branch, plus the staged
manifests); a mutation where `paletteFrom` points at a ctab-less file and the loadGame test
goes RED (quote it); all gates green.

Prediction to score: Secret 0 NULL / 0 ega-fixed; Gateway 0 NULL; Treasures 0 NULL; Curse 0
ega-fixed; oracle 100% vs explore route, TITLE.TLB < 100%, shuffled < 20%; guard 0.

### Prompt R3 — Pool of Radiance Amiga decoder, TypeScript port (Sonnet)

You own `packages/engine/src/loaders/poolAmiga.ts`, `packages/engine/src/index.ts` (the export
and one `decodeAsset` branch only), `packages/engine/test/poolAmiga.test.ts`,
`packages/engine/test/fixtures/pool-amiga-golden.json`, `tools/pool_amiga_golden.py`,
`tools/test_pool_amiga_golden.py`, and `docs/pool-amiga-format.md`. Do not edit
`tools/pool_amiga_decode.py` (it is the oracle; report bugs, do not fix both sides), any other
loader, or the Phase B set.

Task. Port `tools/pool_amiga_decode.py` (`parse_container`, `decompress` with the XOR checksum,
`planar_to_indices`, `parse_standard`, `parse_animated`, the five palette tables) to
`packages/engine/src/loaders/poolAmiga.ts`, returning the `DecodedAsset` shape `daa.ts`
returns. Source: the 23 `.dax` files under
`{external-game-holdings}/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/`
(843 blocks; all decompress under the Python tool). Write `tools/pool_amiga_golden.py` to emit
a hashes-only fixture (per block: sha256 of decompressed bytes; per frame: `w,h,frames` and
sha256 of the index array) and a corpus test for it that skips when `D:/` is absent. Add the
`decodeAsset` branch (format tag `'pool-amiga'`; say whether hintless detection by the BE
10-byte TOC + checksum is feasible and whether you enabled it). Stage
`apps/web/games/pool-amiga.json` (copy `pool-of-radiance.json`'s file list into the Amiga
names) in `docs/pool-amiga-format.md` §"Manifest" and in your report, with the intended
`GAME_IDS` row, `docs.ts` entry, `KNOWN_UNMANIFESTED` edit (PoR out), FORMAT_REACHABILITY row
for `tools/test_goldbox_corpus.py`, and an e2e case in the `curse-amiga` shape with three-place
registration written out.

Acceptance. 843/843 block hashes and N/N frame hashes identical to the oracle (state N) —
measured against the alternative that the port merely renders plausibly — with the null
being the same comparison after flipping one input bit per block (expect 0/843). Sibling
oracle: for every `.dax` name shared with the DOS `pool-of-radiance` manifest, the per-block-id
`(w,h)` agreement with the DOS DAX decode, measured against the alternative that Amiga ids
are unrelated to DOS ids, next to the count under a shuffled id mapping (compare payloads
from offset 2; see memory `goldbox-sibling-platform-as-oracle.md`). Consumer: the `decodeAsset`
branch and the staged manifest. Mutation: corrupt one golden hash, quote the RED line, restore.

Prediction to score: 843/843; sibling agreement >= 90% vs shuffled <= 15%; port under 500 lines.

### Prompt R4 — Pools / Gateway / Treasures ECL dialects from their own GAME.OVR (Opus)

You own `tools/map_gen1_ecl_dispatch.py`, `tools/test_map_gen1_ecl_dispatch.py`,
`docs/engine/research/pools-ecl-dispatch-map.md`, `gateway-ecl-dispatch-map.md`,
`treasures-ecl-dispatch-map.md` (and `secret-` if you get to it),
`packages/engine/src/ecl/disassemble.ts` (dialect literals only, and only on binary evidence),
and `packages/engine/test/ecl*.test.ts` for pins. Do not touch `map_buck_ecl_dispatch.py`,
`map_matrix_ecl_dispatch.py`, `vroomm_layout.py`, `buck_far_targets.py`, the Buck/Matrix
dialect literals (R5's territory), or the Phase B set.

Context. The ledger says Pools' `ECL_GEN1_SHORT_POOLS` word sets "are derived from scan agreement
across the corpus, not from a handler table"; the dialect's own docblock says its four
overrides (0x1f:1, 0x21:2, 0x37:2, 0x41:2) were read from Pools' handlers at `+0x264a`,
`+0x0e9e`, `+0x1eca`, `+0x240c`. Treasures' docblock admits its dispatch was never located and
its 0x42 SET ORDER is assumed. `gen1-short-gateway` has no map. All three `GAME.OVR`s are
`FBOV` and unpacked on disk (Pools 264086 B, Gateway 347622 B, Treasures 310572 B); Secret's is
`TPOV` (278528 B). `tools/map_pool_ecl_dispatch.py` (Pool of Radiance, FBOV path, CoAB oracle
`build/coab-oracle-map.json`) is the pipeline to generalise.

Task. Generalise the FBOV mapper into `tools/map_gen1_ecl_dispatch.py --game
pools|gateway|treasures` and generate the three maps. Per title, per opcode 0x00-0x4f: the
handler-read operand count (or `no_far_call` / `unknown`, with the `mov al,N; push ax; lcall
<parser>` bytes quoted), the count the engine's current dialect uses, and the count plain
`ECL_GEN1_SHORT` would use; partition each opcode as discriminating (dialect and alternative
differ and the binary decides), free (they agree), or vacuous (binary gives no count).
Decide the Pools contradiction: do the four docblock offsets hold the prefetch idiom with the
claimed counts? Test Treasures' 0x42 = 4 and its SET ORDER against the handler; test
Gateway's overrides. Edit a dialect literal only where the binary contradicts it, and for
every edit report the corpus effect (ECL blocks whose disassembly changes; how many land on
better boundaries — fewer bad opcodes, fewer nonlocal GOTOs — versus worse) next to the same
counts for the alternative; pin it with an engine test naming the handler offset; list the
`?explore=` routes that consume that dialect (`apps/web/src/ui/gameData.ts` `eclDialect:`
entries). Where the binary and the dialect disagree but the corpus favours the dialect, do
not edit — file it as a desync with its count.

Acceptance. Three maps with dispatcher and parser similarity to the CoAB oracle reported next
to the similarity of a non-dispatcher routine of the same length (the null); the per-opcode
partition tables with totals; the Pools verdict with quoted bytes; the corpus-effect numbers
per edit; a mutation where one handler-read count in the oracle map is changed and
`test_map_gen1_ecl_dispatch.py` goes RED (quote it); the intended
`tools/goldbox_capabilities.json` gap-sentence rewrite for Pools and Gateway ecl, verbatim.

Prediction to score: Pools similarity >= 0.95, >= 40 opcodes dispatched, four handlers
confirmed (the ledger sentence is the wrong one); Treasures 0x42 = 4 and SET ORDER decided;
0-2 Gateway edits; at least one discriminating opcode the corpus fit got wrong.

### Prompt R5 — EXEPACK unpack; Buck / Matrix resident calibration; the 22 vacuous opcodes (Sonnet)

You own `tools/exepack_unpack.py`, `tools/test_exepack_unpack.py`, `tools/buck_far_targets.py`,
`tools/vroomm_layout.py`, `tools/map_buck_ecl_dispatch.py`, `tools/map_matrix_ecl_dispatch.py`,
`docs/engine/research/buck-ecl-desyncs.md`, `matrix-ecl-dialect.md`, `buck-ecl-dispatch-map.md`,
`matrix-ecl-dispatch-map.md`, and one sentence in `compiler-runtime-matrix.md`. Do not touch
`packages/engine/src/ecl/disassemble.ts` (R4 owns it — write any dialect edit as an intended
patch), `map_pool_ecl_dispatch.py`, any file R4 creates, or the Phase B set. Never write to an
original executable; unpacked images go under `build/` (git-ignored). No DOSBox-X (R6 owns it).

Context. Round 31's "decisive negative" (0/140 Borland prologues at shift 0 under the MZ
mapping `file = mz_header + seg*16 + off`; 16 resident segments `0xbe4, 0x653, 0x14b, 0x267,
0x15f, 0xa7b, 0x800, 0x8ad, 0x7da, 0x13e, 0x157, 0xb00, 0x1b0, 0xa93, 0xb62, 0x15c` unresolved;
four Buck opcodes `unknown`) was measured against EXEPACK-compressed bytes. All eight Gen1
executables are genuine Microsoft EXEPACK: relocs 0, the `RB` signature at `CS:0010`, entry
bytes `8c c0 05 10 00 0e 1f a3 04 00`. Destination lengths in paragraphs: Buck `start.exe`
(`{external-game-holdings}/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/`) 0x1108; Matrix `START.EXE`
(`matrixcubed_extracted/BuckRogers2/c/Matrix/`) 0x1265; CoAB `START.EXE` (GOG Galaxy) 0xf3e;
CoK 0x1002; Pools `GAME.EXE` 0x11c5; Gateway `GAME.EXE` 0xa0d; Treasures `GAME.EXE` 0x1348;
Secret `START.EXE` 0x137d. The CoAB 229/240 stub-selector calibration read `GAME.OVR` and is
unaffected.

Task. (1) Write `tools/exepack_unpack.py <exe> --out <image.bin> --json <meta.json>`: parse the
MZ header, the EXEPACK header at `CS:0000` (`real_ip, real_cs, mem_start, exepack_size,
real_sp, real_ss, dest_len, skip_len, 'RB'`), decompress backwards into `dest_len` paragraphs,
decode the packed relocation table, record (do not apply) relocations, emit the image and the
JSON. Run it on all eight. (2) Check it independently — measured against the alternative that
it produced a plausible but wrong image: (a) fraction of decoded relocation targets holding a
word < `dest_len`, next to the fraction at the same offsets in the packed file; (b) the 16 Buck
segments landing on Borland prologues at shift 0, next to shifts -1 and +1; (c) CoAB's resident
targets resolving the same way. (3) Re-run `walk_far_call_chain` into the unpacked resident
image for Buck's four `unknown` opcodes and Matrix's four desyncs; verdict per opcode with the
quoted prefetch bytes. (4) For the 22 vacuous opcodes in both binaries: does the chain now touch
the ECL PC global `0x3be2` or reach the parser? Count where measured; partition as
discriminating (base `ECL_GEN1` count differs) or free; report the new
discriminating / free / vacuous triple next to Matrix's 16 / 56 / 22 of 75. (5) Update the four
research docs and the two generated maps; put any `disassemble.ts` edit in the report as an
intended patch with its corpus-effect numbers.

Acceptance. Eight images at `dest_len*16` bytes with the three checks and their nulls; the
16-segment count; the eight opcode re-verdicts; the 22-opcode tables; a mutation where one
byte of an image's relocation table is flipped and `test_exepack_unpack.py` goes RED (quote it);
`pnpm test:corpus` green (the new test skips when the `D:/` source is absent).

Prediction to score: all eight unpack; Buck >= 14/16 at shift 0, <= 2 at -1/+1; >= 12 of 22
measured, >= 3 discriminating; Buck `unknown` 4 → <= 1; >= 2 of Matrix's 4 desyncs attributed.

### Prompt R6 — CoK music: five drivers, not five songs; find the songs (Opus; sole DOSBox-X owner)

You own `tools/mididax_decode.py`, `tools/mididax_song_scan.py`, `tools/mididax_song_extract.py`,
`tools/test_mididax_*.py`, `docs/midi-dax-format.md`, `packages/engine/src/audio/dosSong.ts`,
`packages/engine/test/dosSong.test.ts`, and new script files under `tools/dosbot/`. Do not touch
`apps/web/src/ui/gameAudio.ts` (intended patch only), the repo game folders, any original
executable, any other agent's files, or the Phase B set.

DOSBox-X rule, non-negotiable: all DOSBox-X automation — keypresses, screenshots, memory reads —
goes through the focusless GameLink protocol (`tools/dosbox_gamelink.py`, or `-GameLink` on
`tools/dosbox_x_debugbox_probe.ps1`; see `docs/engine/research/dosbox-x-gamelink-automation.md`).
Never host-level SendKeys / SetForegroundWindow / SendInput. GameLink is a single global shared
memory: one session at a time, and you are the only agent allowed to start one this round. Run
the game from a scratch copy of `Champions of Krynn/` (see `tools/dosbot/lib.ps1`); the repo
copy and its `KRYNN.CFG` are read-only.

Context (measured 2026-09-03). The five MIDI.DAX blocks write to disjoint port sets: block 1
`0x221/0x223` (dual SAA1099, C/MS); block 2 `0x330/0x331` (MPU-401, Roland LAPC); block 3 `0x388`
x16 (AdLib); block 4 `out 0xC0` x18 (Tandy); block 5 `0x42/0x43/0x61` (PIT + PC speaker). That
is START.EXE's "SOUND TYPE: [1] C/MS [2] Roland LAPC [3] AdLib [4] Tandy [5] PC" menu in order:
five drivers for the same songs, not five songs. The doc's "one per song" (§1) is wrong and its
§1.6 search for a note timeline inside the block was looking for the wrong thing. The driver's
event grammar (§1.4) and the `FA 51 07` CX/ES buffer handshake (§1.6) are solved; the buffer's
origin is the question.

Task. (1) Publish the driver census as bytes (`mov dx, imm16` followed within 12 bytes by
`out dx,al/ax`; `out imm8,al`) per CoK block and per DoK §2.4 backend — measured against the
alternative "one block per song", which predicts the same port set in all five (observed: five
disjoint) — and extend the scan to Buck, Matrix, Gateway, Treasures and Pools `MUSIC.DAX`
(numbers only). (2) Static pass: `tools/mididax_song_scan.py` scores every 64-byte-aligned
window of every CoK file (the 35 carved `GAME.OVR` segments via `tools/carve_goldbox_overlays.py`,
every DAX block of every DAX, and `START.EXE` — packed; say so, or use R5's unpacked image if it
lands under `build/`) for §1.4 grammar conformance; report the top-5 next to the score
distribution of >= 1000 shuffled windows. (3) Dynamic pass: boot CoK, note the Sound Type in the
scratch config, reach the title music, `dump-memory --length 0x100000`, locate the loaded driver
by its 18-byte `JMP rel16` vector and 27-byte slot-0 stub (it must occur exactly once — report
the count), read the live CX:ES / ES:SI buffer per §1.6, extract it, and search every on-disk
CoK file for it; report file + offset + length next to the null that 100 random 32-byte RAM
windows map to no file span. (4) If found: `docs/midi-dax-format.md` §1.7, `tools/mididax_song_extract.py`
emitting a note-event JSON per song, and — only if time allows — `packages/engine/src/audio/dosSong.ts`
with a unit test and an intended `gameAudio.ts` patch. If not found: the negative with both
nulls, the dump kept under `build/`, and the exact next step.

Acceptance. The census table with its alternative-hypothesis sentence; the static top-5 with
the null distribution (mean/max); the driver segment count, the live buffer's first 64 bytes,
the file match and the random-window null; a mutation where one byte of the grammar
recogniser is corrupted and its test goes RED on the known-good driver block (quote it); the
intended ledger rewrite for the CoK audio gap and the Buck/Matrix "MUSIC.DAX uncatalogued" gaps,
verbatim; gates green.

Prediction to score: songs live in a carved `GAME.OVR` segment, not a DAX, and the static scan
ranks it top-5 before the dump confirms it; DoK backends 4-5 are Tandy `0xC0` and PC speaker
`0x42/0x61`; the location and extractor ship, the TS decoder does not.

---

## Corrections to this plan, measured after it was written

The plan above is kept as the brief that was issued. Everything below is what the bytes said.

| # | what the plan predicted | what was measured | verdict |
|---|---|---|---|
| P1a | R1: transcription < 400 TS lines | ~230 new, 280 total | **held** |
| P1b | R1: >= 60% of 1250 cells agree with CoAB's builder on the real DQK area | 1250/1250 on real GEO area 18, and on all three synthetic grids | **held numerically, and the bar was set far too low to mean anything.** The shuffled-wall null ALSO scores 1250/1250 on that area, because it has no doors. See "the one that matters most" below |
| P1c | R1: the "verbatim SetupDungeonFloor" alternative is rejected by the window fill value (0x16) | **the mechanism does not exist.** CoAB's tiling writes all 1250 cells on any grid >= 13x5, so there is no untouched outside-window region for a fill value to distinguish | **plan's premise falsified by its own agent**, which then supplied a real discriminator instead: a crafted door grid triggering `northOfEast === 3`, where DQK writes tile **8** and CoAB tile **2** at cell 527 |
| P2 | R1: `?dqk=1` dungeon fights report `{w:50,h:25}`; the old 13x9 pin goes RED for exactly that reason | exactly that, with the RED text quoted | **held** |
| P3 | R2: Secret 0 NULL / 0 ega-fixed; Gateway 0 NULL; Treasures 0 NULL; Curse 0 ega-fixed; DQK and Pools unchanged | every clause held and stronger — all four sets reach 100% `glib-ctab` (curse 2097 ega -> 0 of 2209; secret 1851 -> 0 of 2025; gateway 2894 NULL -> 0 of 3281; treasures 1958 -> 0 of 2273). Pools and DQK proved unchanged by deep-equal, not by inspection | **held** |
| P4 | R2: Gateway wall tile 100% RGB-identical via manifest vs explore route; TITLE.TLB < 100%; shuffled < 20%; guard 0 | `Walls.tlb` **152576/152576 = 100%**; TITLE.TLB null **33.30%**; shuffled null **8.66%**; guard **0** | **held on all four** — and R2 reported that the guard *structurally cannot fire* (5-plane admission requires capacity >= 32, always covering a <= 31 max index), then forced a real failure with a 4-colour fallback on 4-plane `Sprit.tlb`: 120/120 frames refused |
| P5a | R3: 843/843 block hashes identical to the Python oracle; bit-flip null 0/843 | 843/843, null 0/843, frames 1672/1672 | **held** |
| P5b | R3: sibling `(w,h)` agreement >= 90% | 295/295 = 100% across all shared ids | **held** |
| P5c | R3: shuffled-id null <= 15% | **~55%** over 20 seeds | **FAILED, and reported as a numbered negative.** Many Amiga/DOS families share dimensions regardless of id. R3 replaced the control rather than the conclusion: restricted to discriminating ids (cpic + chead, 144 of them), real 100% vs shuffled ~29% |
| P5d | R3: port under 500 lines | 426 | **held** |
| P6 | R4: Pools dispatcher similarity >= 0.95, >= 40 opcodes dispatched, the four docblock handlers confirmed — the ledger sentence is the wrong one | dispatcher **0.9680** (nulls 0.2948 / 0.1497), parser **1.0000** (nulls 0.4796 / 0.4268), **66** handlers; all four cited handlers hold the prefetch idiom with the claimed counts | **held on every clause** — the docblock was right and the capability ledger was the wrong artifact, which is the reverse of the usual direction |
| P7a | R4: Treasures `0x42` = 4 operands, SET ORDER decided | confirmed from its own handler and its internal loop: ascending, operand N -> slot N-1 — decided WITHOUT the cross-opcode analogy the old docblock assumed | **held** |
| P7b | R4: 0-2 Gateway edits | **6** (0x1d/0x22/0x2c/0x32/0x40/0x41) | **missed, 3x the ceiling** |
| P7c | R4: at least one title has a *discriminating* opcode the corpus fit got wrong | **zero** | **REJECTED — and the rejection is worth more than a hit.** Every disagreement in all three titles lands in the **free** partition: opcodes where the shipped dialect and the plain alternative agree with each other while the binary contradicts both. A shipped-vs-alternative comparison is structurally blind to those, which is why R4 had to widen `partition_opcodes`'s desync flag beyond the discriminating bucket |
| P8a | R5: all eight executables unpack to `dest_len*16` | all 8 | **held** — after R5 caught its own error: the check was first computed against `dest_len_bytes`, which exceeds 0xFFFF for several titles. Refixed to the paragraph scale: 1.000 across all 8 against a packed-file null of 0.239-0.442 |
| P8b | R5: Buck >= 14/16 segments on Borland prologues at shift 0, <= 2 at +/-1 | 98/175 pairs (56%) at shift 0 and **0/175** at +/-1, but only **11 of 16** segments resolve — 5 stride-5 stub segments do not resolve under the hypothesis at all | **missed on the segment count**; the shift null held perfectly |
| P9a | R5: >= 12 of 22 vacuous opcodes measured, >= 3 discriminating | 17 measured (6 touch the ECL PC, 11 verdict `0`), 5 stay `no_far_call`; **3** discriminating | **held, exactly at the bar** |
| P9b | R5: Buck `unknown` 4 -> <= 1 | 4 -> 1 | **held** |
| P9c | R5: Matrix >= 2 of 4 desyncs attributed | 2 attributed; desyncs 4 -> 3 | **held at the bar** — but one of the two is `#18`, which MOVED from `@0x135` to a new `@0x14b0` rather than closing. R5 labelled it a masked site revealed, not a fix |
| P10a | R6: five disjoint port sets in CoK (C/MS, MPU-401, AdLib, Tandy, PC speaker) | exactly that; mean pairwise Jaccard overlap **0.014** against the "one block per song" alternative, which predicts ~1.0 | **held** |
| P10b | R6: DoK backends 4-5 = Tandy 0xC0 and PC speaker 0x42/0x61 | DoK has **one shared driver blob** in block 0 (0x40/0x42/0x43/0x61/0xC0); blocks 1-7 show **zero** port hits and are pure song data | **not decided** — the prediction assumed DoK mirrors CoK's five-driver shape, and it does not. The 0xC0 cluster is consistent with a Tandy/speaker split but does not prove one |
| P11 | R6: the song buffer resolves into one of the 35 carved `GAME.OVR` fbov segments; the static scan ranks it top-5 | the top-5 are all inside `MIDI.DAX` block 1 at 0x410 — the known `readEvent` loop itself, not a note buffer. Nothing outside `MIDI.DAX` scored | **REJECTED.** The songs are not in a carved segment and were not found |
| P12 | R6: location + extractor ship; no TS decoder | neither the location nor the extractor shipped; the plan's own sanctioned negative branch was taken | **half held** |
| P13 | Phase B: full e2e 185/185; manifests 23; `KNOWN_UNCONSUMED` re-pinned at 672 minus the wired ones; corpus count within 15% of the `CLAUDE.md` sentence | see the Phase B row below | **the 672 was the plan's own carried-forward number and it was wrong twice over** |

### Phase B, measured

- `KNOWN_UNCONSUMED` is **734**, not "672 minus the wired ones". Two separate corrections: the carried-forward 672 should have been **675** (3 of the 19 exports the plan credited are names appearing only inside comments — `ItemRecord` and `REFERENCE_DB_DETAIL_ROWS` in `e2e.mjs`, which imports nothing from the engine at all, and `COK_WALL_SET_ID_BASE` in a `.mts` comment, so the genuine figure was 16 imports); and R1's and R3's new exports then raised the total. The null that decided how to fix the comment problem: across the pre-existing roots, **0 of 925** consumed exports were consumed only via a comment, so adding comment-stripping moves no existing number and exists purely to stop the new `tools/*.mts` root importing false positives.
- The plan predicted no `CLAUDE.md` sentence edit would be needed for the corpus count. Re-measured rather than assumed.

### The one that matters most

**Item P1b, and it is the same failure as round 31's item 8 in a new costume.** The plan asked R1 to
clear a 60% cell-agreement bar and R1 cleared it at 100%. The number means nothing: the plan never
asked what the *alternative* would score, and on the test area — which has no doors — a
shuffled-wall null also scores 1250/1250. The entire discriminating set is one crafted door cell.
Round 31 recorded the lesson as "state the alternative alongside any agreement threshold"; this
round shows an acceptance bar can be missing its null even when the plan's author has just written
that lesson down.

**And three separate agents independently found a plan-supplied null worthless** — R6's "100 random
RAM windows map to no file span" (measured 55/100, because overlay code is legitimately resident
verbatim), R3's shuffled-id control (55%, not the predicted <= 15%), and R5's discovery that round
31's shipped "0 of 140" negative was measured against still-EXEPACK-compressed bytes (66 of 140
against the unpacked image). All three replaced the control rather than the conclusion. Future
plans should treat a supplied null as a hypothesis to be measured, not a constant to be inherited.

**One further limit surfaced that reaches backwards into three rounds of reports.** R4 falsified a
proposed Treasures `0x37` by *running the VM* rather than reading more bytes, and the crash exposed
that `disassembleEclBlock`'s census only walks each block's first `EXIT` — so it never sees
subroutine bytes that real quest and combat logic reaches. Every "N of M blocks reach a clean EXIT"
number in this repo, including round 31's 29/33 for Matrix and this round's Buck and Matrix
censuses, is an under-walk. The censuses were kept, with that caveat now stated next to them.
