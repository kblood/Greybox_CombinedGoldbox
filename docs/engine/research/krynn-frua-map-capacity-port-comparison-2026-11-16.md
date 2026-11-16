# Krynn (CoK, DoK, DQK) vs FRUA: map capacity and port obstacles

**Date:** 2026-11-16. **Scope:** docs-only synthesis of why DQK and the other Krynn titles are
not straightforward FRUA ports, with map-capacity figures checked against current source and
tests. **Method:** repository documents and source/test code only. No game folder, executable
or binary asset was opened; no build, test, emulator or commit was run. Figures marked
`[DOC]` are taken from an existing research note (not re-derived here), `[SRC]` were read in
source, `[TEST]` are pinned by a test file (not run here), `[CITED]` come from a hackdoc or web
source that is not present in this checkout, and `[INF]` are inferences.

## 1. Answer in brief

- **No existing file gives this comparison.** The pieces are split across `docs/findings.md`
  (container lineage, "DQK does not use DAX"), `docs/hlib-format.md` (HLIB spec and DQK/FRUA
  container sharing), `docs/engine/research/frua-and-dungeon-craft.md` (FRUA limits, mostly
  `[CITED]`/`[W]`, compared with Dungeon Craft rather than DQK), `docs/engine/adr/0006-authoring-data-model-vs-frua-import.md`
  (FRUA limits as the superset's import ceiling), and the per-title format notes below.
  The DQK-versus-FRUA map comparison is not stated in any of them.
- **"DQK supports larger maps than FRUA" is only partly true.** Qualified:
  - **Cells per map: true.** Retail DQK maps reach 28×28 = 784 cells. The FRUA GEO file has a
    fixed 576-slot grid region, and the decoder rejects anything larger. 13 of the 20 retail DQK
    maps exceed 576 cells. `[DOC]` `docs/engine/research/dqk-geo-shape-audit.md` §1;
    `[SRC]` `packages/engine/src/module/frua/decode.ts`.
  - **Number of maps: false.** DQK has 20 retail GEO maps. A FRUA design has 40 places
    (36 dungeon + 4 overland). `[CITED]` `frua-and-dungeon-craft.md` §1.1–1.2; `[DOC]` ADR-0006.
  - **Longest side: not established.** DQK's longest retail side is 39; the largest FRUA side
    observed locally is 38. The one-byte FRUA dimensions can represent values through 255, and
    the current importer enforces width×height ≤ 576; this does not prove retail FRUA accepts
    every such shape, so the per-side retail limit remains unverified.
  - **DQK engine ceiling: not established.** A documented disassembly note suggests a fixed
    784-cell runtime buffer, but this was not re-run here (see §6).
- **Why the Krynn titles are not straightforward FRUA ports:** the maps use different cell
  encodings and size budgets; events are ECL scripts, not FRUA's per-map event table (type codes
  0–38, including unused slots);
  DQK and FRUA share the HLIB container family, but their data records differ; CoK and DoK are
  Gen1 DAX/DAA titles with fixed 16×16 exploration maps and EGA art.

## 2. What FRUA supports (evidence)

| Item | Value | Evidence |
| --- | --- | --- |
| Places per design | 40 GEO files: 36 dungeon + 4 overland | `[CITED]` `frua-and-dungeon-craft.md` §1.1–1.2; `[DOC]` `adr/0006…` Context |
| GEO header | height at byte 26, width at byte 27 | `[SRC]` `packages/engine/src/module/frua/decode.ts` `FRUA_GEO_OFFSETS` (lines 34–52) |
| Grid budget | `GRID_SLOT_BUDGET = 576`; cells are 6 bytes at offset 322; grid ends at 3778 | `[SRC]` `decode.ts` lines 29, 47–48 |
| Enforcement | `parseFruaGeo` throws when width×height > 576 | `[SRC]` `decode.ts` `parseFruaGeo` (around lines 358–364) |
| Events | 100 slots × 20 bytes at 3786 (ends 5786); type codes 0–38, with 28/30/31 unused | `[SRC]` `decode.ts` lines 30, 49–50, 199–239 |
| Strings | 400 length-prefixed, 6-bit-packed slots, decoded by the same ECL codec | `[SRC]` `decode.ts` lines 12, 31, 407–417 |
| Cell model | one byte per wall side (low nibble slot, high nibble kind), plus event slot and backdrop/zone byte | `[SRC]` `decode.ts` `decodeWall` (line 153) and the grid loop |
| Overland marker | wall slots 28–30 all 255 | `[SRC]` `decode.ts` `isOverland` |
| Import target | `importFruaGeo` builds `width*height` cells in `ModuleMap` | `[SRC]` `packages/engine/src/module/frua/importer.ts` line 118 |
| Observed sample | HEIRS GEO001–004 overland 38×15 (570 cells); GEO008 dungeon 20×28 (560); 26 GEO files | `[DOC]` `docs/engine/research/frua-38x15-zero-walls-2026-10-13.md` (prior byte read, not repeated here) |

Test coverage: `packages/engine/test/frua-geo.test.ts` builds a 2×2 map and checks parsing and
import. It does **not** assert the >576 rejection path `[TEST, grep-verified]`.

## 3. What DQK supports (evidence)

| Item | Value | Evidence |
| --- | --- | --- |
| Retail GEO maps | 20 members, sparse area IDs (2–66) | `[DOC]` `dqk-geo-shape-audit.md` §1; `[DOC]` `docs/engine/HANDOFF.md` (sparse-ID note, ~lines 10966–10972) |
| Member header | 8 bytes: byte 0 height, byte 1 width, 6 reserved | `[SRC]` `packages/engine/src/loaders/geo.ts` lines 182–196, 241–260 |
| Member body | four W×H planes: walls N/E and S/W nibble-packed; backdrop/zone; door flags (2 bits per side) | `[SRC]` `geo.ts` lines 13–16, 124 (Gen1 and Gen2 share the plane semantics) |
| Decoder cap | none. Only zero dimensions or a length mismatch throw | `[SRC]` `geo.ts` `decodeGen2GeoBlock` (lines 241–260) |
| Shapes | 12 square, 8 non-square; smallest 10×10 (area 2); longest side 39 (areas 14 and 38); largest 28×28 = 784 cells (areas 10, 30, 34, 42, 50, 58, 62) | `[TEST]` `packages/engine/test/dqkGeoShapeCensus.test.ts` `EXPECTED_SHAPES` (line 60); `[DOC]` `dqk-geo-shape-audit.md` §1 |
| Events | no event table in the GEO member; scripts live in `ECL.GLB` (47 members, same area IDs) | `[DOC]` `docs/engine/research/ecl-gen2-dqk.md` lines 9–18 |
| Area-to-map | several areas can share one GEO map (areas 30, 31, 32 use GEO map 30) | `[DOC]` `docs/engine/research/dqk-campaign-legs.md` (GEO pairing, ~lines 88–95) |
| Runtime buffer | fixed allocation of 3144 bytes = 8 + 4×784; planes at fixed offsets | `[DOC]` `docs/engine/research/dqk-0032-writer.md` §3 "The GEO buffer" (~lines 333–368); claimed proven from DQK.EXE disassembly, **not re-run here** |

Cell counts and the 13-of-20 figure were recomputed from the census table in
`dqk-geo-shape-audit.md` §1 (not from the test file).

## 4. Map geometry and limits, side by side

| Quantity | FRUA design file | DQK retail (`GEO.GLB`) | CoK / DoK (Gen1 `GEO*.DAX`) |
| --- | --- | --- | --- |
| Cells per map | ≤ 576 (fixed grid region; decoder rejects more) | 100 to 784; 13 of 20 above 576 | 256 (16×16 fixed) |
| Longest observed side | 38 (overland, HEIRS) | 39 | 16 |
| Non-square maps | yes (38×15, 20×28 observed) | yes (8 of 20) | no (fixed 16×16) |
| Maps | 40 places per design; 26 GEO files in HEIRS sample | 20 retail members | CoK: 15 dungeon levels in GEO1–3.DAX; DoK count not pinned here |
| Map-to-script link | events stored in the map (100 slots × 20 bytes) | ECL.GLB, 47 members, sharing area IDs with GEO | ECL DAX blocks sharing GEO block IDs |
| Per-cell encoding | 6 bytes: one per wall side, eventSlot, backdrop | 4 planes: nibble walls, backdrop, door flags | same 4-plane model as DQK |
| Exploration geometry | the above | the above | `[DOC]` `geo-map-format-cok.md` ("Decompressed block size", 1026-byte block) |
| Tactical combat grid | separate; not a GEO map | 50×25 background-id grid `[DOC]` `dqk-combat-render-dispatch.md` line 73 | CoAB (the Gen1 oracle) uses 50×25 `[DOC]` `decompile-ovr032-combat-map.md` §7; the CoK/DoK grid is not measured here |

Key point: DQK kept the Gen1 four-plane cell model and removed the 16×16 limit. FRUA changed
the cell model and fixed the grid at 576 slots. The two are not a byte-level port of each other.

## 5. Shared lineage versus real incompatibility

**Shared (verified):**
- The HLIB container family. DQK `GEO.GLB`/`ECL.GLB` and FRUA GEO/SCRIPT/STRG/GAME libraries
  are HLIB files `[DOC]` `docs/findings.md` §2; `docs/hlib-format.md`;
  `docs/engine/HANDOFF.md` (~line 10952).
- The 6-bit ECL string codec: FRUA strings are decoded by `decodeEclString`
  `[SRC]` `decode.ts` lines 12, 407–417.
- The NUL-terminated menu framing: DQK.EXE and CKIT.EXE carry the same framing and differ in
  vocabulary `[DOC]` `docs/engine/research/combat-screen-plan-cok.md` §8.3–8.4.
- DQK's ECL shares most bytecode with the Gen1 ECL, but its block header differs and at least
  two opcodes are framed differently `[DOC]` `docs/engine/research/ecl-gen2-dqk.md` header.

**Not shared, or not compatible (verified or documented):**
- **Same container, different data.** `TOPVIEW.TLB` has the same name and length in DQK and
  FRUA but different content `[DOC]` `docs/hlib-format.md` (~line 251).
- **Map cells and budget.** See §4. A 28×28 DQK map cannot fit in a FRUA design file.
- **Event model.** FRUA events use type codes 0–38 (including unused slots) in a table with 100
  slots per map. DQK events are ECL scripts shared by area ID. `[SRC]` `decode.ts` (event type
  table around line 199).
- **Monster records.** FRUA `MONST.GLB` uses fixed 450-byte records; DQK `MONCHA.GLB` records
  vary and carry a length word `[DOC]` `docs/engine/HANDOFF.md` (~line 10931);
  `docs/findings.md` §2a.
- **Character records.** FRUA `.CCH` is ≥398 bytes; the DQK compact record is 416–598 bytes and
  is "NOT the FRUA format" `[DOC]` `docs/engine/research/moncha-character-c4.2b-2b-2.md`.
- **Art.** DQK VGA 256-colour TILE with an embedded palette; FRUA 8-bit TLB with fixed palette
  ranges; CoK and DoK DOS release is EGA 16-colour only `[DOC]` `docs/findings.md` §1–2.
  Palette comparison is possible, but there is no drop-in art path.
- **Rules.** FRUA hard-codes AD&D 1e and cannot edit spells or items `[CITED]`
  `frua-and-dungeon-craft.md` §1.6. The Krynn titles use the DragonLance rules
  `[DOC]` `docs/engine/research/cok-dragonlance-rules.md`.

## 6. Other concrete Krynn-to-FRUA port obstacles

1. **Container extension collisions.** `.TLB`/`.GLB` is HLIB on DOS and GLIB on Amiga, and
   `.dax` means DAX on DOS and Pool-Amiga on Amiga; route by bytes, not extension
   `[DOC]` `docs/findings.md` §2 correction.
2. **Gen1 DAX maps are not FRUA GEO files.** CoK/DoK blocks are 1026 bytes with 16×16 planes
   and share IDs with ECL DAX blocks `[SRC]` `packages/engine/src/loaders/geo.ts` (line 36,
   `GEO_GRID = 16`, `GEO_BLOCK_SIZE = 1026`).
3. **Script opcode drift.** ECL needs translation or engine patches between engines
   `[DOC]` `docs/findings.md` §5 item 3.
4. **Area-to-map many-to-one (DQK).** One FRUA place equals one map and its events. DQK has
   47 areas over 20 maps, so a direct per-place import would lose the area structure.
5. **Hard FRUA ceilings on import.** 40 places, 100 events per map, 400 strings, 576 cells.
   A DQK map above 576 cells cannot be stored in a FRUA design file at all.
6. **Combat outcome.** FRUA cannot distinguish won from fled in event chains `[CITED]`
   `frua-and-dungeon-craft.md` §1.4. Not verified against DQK here.

## 7. Verified versus uncertain

**Verified in this pass (by reading current source/tests or the census table):**
- FRUA decoder constants, the 576 check, the 6-byte cell and 100/400 slot counts (`decode.ts`).
- DQK decoder has no cell cap; its header is height then width (`geo.ts`).
- Census shapes: 20 members, max 784 cells, max side 39, 13 of 20 above 576 cells (census
  table in `dqk-geo-shape-audit.md` §1; `EXPECTED_SHAPES` pinned in `dqkGeoShapeCensus.test.ts`).
- CoK/Gen1 GEO geometry is a 1026-byte, 16×16 exploration block (`geo.ts`; `geo-map-format-cok.md`).

**Uncertain or unverified:**
- The origin of the 576 figure is `GEODATA.TXT` in `hackdocs_extracted/`, which is not present
  in this checkout `[CITED]`. The "≈24×24, minimum 11×11" wording is from a FRUA FAQ `[W]`;
  the local evidence contradicts the square reading (38×15, 20×28).
- Whether the DQK runtime accepts maps above 784 cells. The 3144-byte buffer in
  `dqk-0032-writer.md` §3 suggests a fixed 784-cell ceiling `[INF]`, but it is a documented
  disassembly claim that was not re-run here.
- DoK's total GEO member count is not pinned in the documents read here.
- The HEIRS sample figures (26 files, 38×15, 20×28) come from a prior byte read and were not
  repeated here.
- FRUA's combat outcome and DQK's combat semantics are not compared here.
- `frua-geo.test.ts` has no negative test for the 576 rejection `[TEST, grep-verified]`.

## 8. Implications for the Greybox FRUA importer and superset direction

1. **Describe the claim correctly.** Say that retail DQK maps are larger than a FRUA design
   file can store (784 versus 576 cells), that DQK has fewer maps than a FRUA design allows (20
   versus 40 places), and that neither is a per-side ceiling. Do not describe DQK as a larger
   FRUA module.
2. **Keep the 576 check where it belongs.** It is a FRUA file-layout rule in `parseFruaGeo`.
   The superset must not inherit it. `docs/engine/ARCHITECTURE.md` line 337 already says
   "unlimited (no FRUA 40-place cap)", and `importFruaGeo` builds an unbounded
   `ModuleMap` cell array (`importer.ts` line 118).
3. **Do not route DQK through the FRUA importer.** DQK maps need the Gen2 GEO decoder
   (`decodeGen2GeoArchive`) and ECL event handling. A DQK-to-FRUA conversion would fail for 13 of
   20 maps by cell count alone and would need a lossy event mapping for the rest.
4. **Test gap, if the team wants one.** A negative test for the >576 rejection in
   `frua-geo.test.ts`, and an explicit DQK capacity test. Not done here; for the coordinator to
   decide.
5. **Documentation.** `frua-and-dungeon-craft.md` §1.2 and §3 still describe the 576 cells as
   "≈24×24" from a web source. A pointer to this note was added there (see §9).

## 9. Changes made and evidence limits

- **Created:** this file, `docs/engine/research/krynn-frua-map-capacity-port-comparison-2026-11-16.md`.
- **Edited:** `docs/engine/research/frua-and-dungeon-craft.md`, one pointer note after the §1.2
  table, linking here. No other content changed.
- **Not changed:** `docs/engine/HANDOFF.md`, `docs/engine/BUILD-QUEUE.md`, `GOAL.md` and
  `DECISIONS-NEEDED.md`. These are coordinator-owned records; the coordinator should record this
  slice there if desired.
- **Instructions read:** `AGENTS.md`, `docs/engine/ORCHESTRATION.md`, `CLAUDE.md`, `README.md`,
  the head of `GOAL.md`, `docs/engine/HANDOFF.md`, `docs/engine/BUILD-QUEUE.md`,
  `docs/engine/DECISIONS-NEEDED.md`. No nested instruction files apply to `docs/`.
- **Limits:** no game data was opened, no tests were run, and nothing was committed or pushed.
