# Decompile Handoff: Gen2 RTLink/Plus and Gen1 FBOV/VROOMM

> **Status reviewed 2026-10-11:** this handoff's mapping/import prerequisites have progressed.
> `rtlink_map.py`, `vroomm_layout.py` and reproducible decompiler packages exist;
> `tools/decompiler/README.md` records real Ghidra imports/FID reopen checks for eleven titles.
> IDA's real import gate remains unrecorded. DQK's dispatch is mapped; CoK/DoK RNG and
> CoK's demo entry are recovered. Use [decompile-worklist.md](decompile-worklist.md) for
> current boundaries. The native DOS engine is primary and the browser engine secondary.

> Purpose: give the next agent or work session a concrete decompile plan for both Gold Box engine
> families, starting from the compiler/runtime evidence already recovered locally.

Program-level end goals, compatibility levels, and milestone gates are defined in
`docs/engine/LONG-TERM-GOALS.md`. This handoff is the decompilation workstream beneath that charter.

## Current Ground Truth

The project now has a reproducible compiler/runtime fingerprint test:

```powershell
python tools\compiler_fingerprint.py `
  "C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures\CKIT.EXE" `
  "The Dark Queen of Krynn\DQK.EXE" `
  --compare-dqk-runtime-window "The Dark Queen of Krynn\DQK.EXE"
```

Current classification:

| Family | Representative binaries | Proven local runtime/toolchain evidence | Source-language status |
| --- | --- | --- | --- |
| Gen2 / UA | `DQK.EXE`, FRUA `CKIT.EXE` | Borland C++ 3.x-family large-model code, RTLink/Plus, integrated overlay tail, `55 8B EC` prologues, no FBOV | C/C++ toolchain likely; C++ source features not proven from stripped bytes |
| Gen1 | PoR/CoAB/Secret/CoK/DoK/Savage/Pools/NWN `GAME.OVR` plus launcher EXEs | Borland VROOMM/FBOV overlay family, older large-model prologue shape, DAX data | Pascal-era engine family by community evidence; local bytes prove overlay/toolchain family |

Important references:

- `docs/engine/research/krynn-toolchain-forensics.md`
- `docs/engine/research/decompilation-sources.md`
- `docs/engine/research/all-games-decompile-pattern-plan.md`
- `docs/engine/research/gen1-all-games-map.md`
- `docs/engine/research/vroomm-fixup-layout.md`
- `docs/engine/research/vroomm-call-correlations.md`
- `docs/engine/research/coab-oracle-retail-map.md`
- `docs/engine/research/pool-ecl-dispatch-map.md`
- `docs/engine/research/gen1-ecl-natural-encounters.md`
- `docs/engine/research/overlay-carve-manifest.md`
- `docs/engine/research/pattern-match-report.md`
- `docs/engine/research/combat-system-source-recovery-goal.md`

## Priority Outcome

The immediate payoff is combat recovery:

1. Find the real transition from ECL/SearchLocation/encounter data into combat mode.
2. Recover combat map setup, terrain/background placement, combatants, icons, UI/chrome, and outcome
   resume semantics.
3. Feed only verified behaviour into Greybox web/native; do not invent combat layouts to fill gaps.

## Gen2 Plan: DQK and FRUA/CKIT

### Inputs

- `C:\Program Files (x86)\GOG Galaxy\Games\The Dark Queen of Krynn\DQK.EXE`
- `C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures\CKIT.EXE`
- DQK Gen2 data: `ECL.GLB`, `GEO.GLB`, `MONCHA.GLB`, `*.TLB`
- FRUA/UA docs in `hackdocs_extracted/`, especially GLB/TLB/GEO/SCRIPT notes
- Existing DQK runtime traces in `docs/engine/research/unicorn-dqk-trace.md`

### Working Hypothesis

DQK and CKIT share the Gen2 runtime family. CKIT is likely easier for generic UA/Gen2 structures
because its editor/runtime tables are more table-driven and documented by the UA hackdocs. DQK remains
the gameplay target, so any CKIT-derived finding must be confirmed in DQK by xref, byte match, or
runtime trace before implementation.

### Steps

1. **Use and extend the existing RTLink/Plus segment map**
   - `tools/rtlink_map.py` already maps these structures: 13 DQK and 28 CKIT descriptors.
     Validate only new/approximate boundaries; see `rtlink-map-dqk-ckit.md` and the
     2026-10-02 overlay-5 base correction.
   - Output JSON and Markdown: file ranges, likely segment bases, prologue clusters, far-call vectors,
     relocation references, string ranges, and data-only ranges.
   - Success: a stable map that lets a file offset round-trip to a probable segment:offset and back.

2. **Use the existing import recipe**
   - Generate packages with `tools/export_decompiler_inputs.py --strict` and follow
     `tools/decompiler/README.md`. Ghidra imports and independently queried FID databases
     are recorded for eleven titles; a fresh import after mapper changes remains its own check.
   - IDA's smoke import remains unrecorded. Shared-runtime grouping and title-local semantic
     symbols remain separate from raw signature matches.

3. **Separate runtime from game/editor code**
   - Use exact byte-window matches between CKIT and DQK to mark shared RTLink/Borland helpers.
   - Tag functions as `runtime`, `hlib-io`, `ui-form`, `ecl-vm`, `combat`, `render`, `editor-only`,
     or `unknown`.
   - Success: the combat search excludes known runtime/helpers and focuses on game functions.

4. **Use recovered Gen2 dispatch to prove the remaining combat handoff**
   - Dispatch is canonical `2033:0d34`, file `0x032a54`, 66 slots; operand framing and
     short-menu semantics are recovered in `decompile-dqk-ecl-dispatch.md`. A real live
     DQK `0x24` handoff remains unverified. Start from known DQK anchors: `0x24 COMBAT`, `[0xca03]`, `DungCom1`/`WildCom1`, combat strings,
     `A battle begins...`, `Aim`, `Attack`, `Bandage`, and the 50x25 `[0xbedb]+9` background grid.
   - Cross-check CKIT for table shapes and handler dispatch patterns.
   - Use DOSBox-X savestates or Unicorn only for the narrow transition interval.
   - Success: documented call chain from ECL encounter/combat opcode to combat setup function(s).

5. **Produce decompile notes by subsystem**
   - One focused note per recovered cluster: `gen2-ecl-dispatch`, `gen2-combat-entry`,
     `gen2-combat-map-setup`, `gen2-combat-ui`, `gen2-combatants`, `gen2-combat-outcome`.
   - Each note must include offsets, confidence, command output or trace IDs, and implementation status.

### Gen2 Deliverables

- Existing `tools/rtlink_map.py`, extended only for new evidence.
- `docs/engine/research/rtlink-map-dqk-ckit.md`.
- Updated `compiler-runtime-matrix.md` including the real CKIT path.
- Decompiler project recipe: exact loader settings, signatures used, and segment map import steps.
- First recovered Gen2 combat-handoff note with verified DQK offsets.

## Gen1 Plan: CoK, DoK, NWN, CoAB Lineage

### Inputs

- GOG Galaxy Gold Box installs under `C:\Program Files (x86)\GOG Galaxy\Games`
- Pool/CoAB/Secret/CoK/DoK `START.EXE` + `GAME.OVR`
- Gateway/Treasures/Pools `GAME.EXE` + `GAME.OVR`
- NWN `GAME.EXE` + `GAME.OVR`
- Any available Buck Rogers installs
- `coab_extracted/` as study-only decompiled oracle
- Existing tools: `tools/disasm_cok.py`, `tools/disasm_dok.py`, `tools/carve_goldbox_overlays.py`,
  `tools/match_goldbox_patterns.py`, `tools/xref_goldbox_anchors.py`, `tools/gen1_map.py`

Current local broad-pass status lives in `docs/engine/research/gen1-all-games-map.md`: Pool of
Radiance, Curse of the Azure Bonds, Secret of the Silver Blades, Champions of Krynn, Death Knights of
Krynn, Gateway to the Savage Frontier, Treasures of the Savage Frontier, Pools of Darkness, and NWN DOS
are binary-mapped in that generated snapshot. Its Buck Rogers `not_found` rows are historical
scanner results, not current holdings: DOS Countdown and Matrix sources are held under
`{external-game-holdings}/Emulator/DOS/Goldbox/` (Matrix's archived distribution requires extraction to scratch).
Their title-local dispatch work is in `buck-ecl-dispatch-map.md` and
`matrix-ecl-dispatch-map.md`; the older eleven-package export does not include them.

### Working Hypothesis

Gen1 games are close enough that subsystem recovery should proceed by COAB source anchor -> pattern
match in CoK/DoK/NWN -> byte/routine verification -> clean-room TS/native implementation. Do not assume
identical offsets or opcode semantics where DAX blocks or game rules drift.

### Steps

1. **Finish shared FBOV/VROOMM resolver**
   - Generalize CoK/DoK overlay descriptor logic into a shared tool instead of per-game scripts.
   - **Current:** `vroomm_layout.py` parses all 64,416 fixups across 11 installs, classifies every
     relocation, resolves every public-stub start, and accounts for all 61,623 `LCALL`s. A unique
     runtime stub selector base is inferred per install; 21,625 public and 128 direct-overlay calls
     resolve statically, while other relocated selectors remain explicit. Exact target correlation
     reaches 181 clustered function starts.
   - Remaining success gate: add title-specific runtime/behavior evidence for semantic promotion,
     rather than further selector arithmetic.
   - **Save-dispatch slice:** `map_gen1_save_dispatch.py` maps `savgam` Pascal-string references to
     owning public procedures and inbound VROOMM calls across the same corpus. DoK is retained as a
     resident-`START.EXE` exception; NWN is retained as a no-literal exception requiring runtime or
     data-flow recovery.

2. **Apply Gen1 FLIRT/decompiler workflow**
   - Load launcher EXE + `GAME.OVR` in IDA Free 5.0 where possible.
   - Apply Borland/Turbo C/C++ signatures appropriate for older large-model DOS code.
   - Use COAB function names as naming hints only; do not copy code.
   - Success: runtime/overlay loader functions are separated from game overlay functions.

3. **Map COAB source units to local games**
   - For each combat-relevant COAB source unit, record the local CoK/DoK/NWN candidate offsets:
     battle setup, terrain/floor setup, combatant deployment, combat UI draw, monster AI, morale,
     movement/LOS, damage, death/outcome.
   - Success: `combat-source-matrix.md` becomes a live index of source unit -> game offsets -> status.
   - **Current:** `map_coab_oracle.py` round-trips all 36 CoAB listing units and 851 functions to
     CoAB retail offsets, including 11 combat anchors. Sibling title mappings remain behavior-gated.

4. **Use savestates for route proof**
   - Create DOSBox-X states for CoK/DoK/NWN at party loaded, before encounter, combat frame 0, aim mode.
   - Capture screenshots, input context, mounted drive manifest, and memory/debug dumps.
   - Success: short traces can prove combat entry without replaying full boot flows.

5. **Port only verified behaviour**
   - Every implementation change needs a focused test or preview that discriminates verified behaviour
     from the old placeholder.
   - For combat MVP, priority is correct UI mode, terrain/background setup, monster icon/name placement,
     and encounter-to-combat handoff before deeper AI/mechanics.

### Gen1 Deliverables

- `tools/gen1_map.py`, `tools/vroomm_layout.py`, `tools/export_decompiler_inputs.py`, and
  `tools/map_gen1_save_dispatch.py` as the
  shared overlay resolver and import-package pipeline.
- `tools/gen1_map.py` currently provides the first broad shared map: availability, FBOV descriptor
  scan, anchor scan, and primary VROOMM selector resolution for every available local Gen1 target.
- Updated `overlay-carve-manifest.md` for every available Gen1 game.
- Updated `combat-source-matrix.md` with CoK/DoK/NWN offsets.
- Generated VROOMM fixup/call reports plus title-specific notes for any semantics promoted from them.
- Gen1 combat-frame savestate set and trace recipe.

## Parallel Work Packages

These are safe to split across subagents or separate worktrees:

| Work package | Scope | Output |
| --- | --- | --- |
| Gen2 RTLink boundary follow-up | Existing DQK + CKIT map; validate approximate/new prefixes | `tools/rtlink_map.py`, `rtlink-map-dqk-ckit.md` |
| Gen2 decompiler verification | Existing import helpers; fresh imports and pending IDA smoke gate | `tools/decompiler/README.md`, `decompiler-project-inputs.md` |
| Gen2 combat handoff | DQK ECL -> combat setup call chain | focused combat note + offsets |
| Gen1 FBOV resolver | Shared CoK/DoK/NWN overlay/fixup resolver | `tools/gen1_map.py`, `tools/vroomm_layout.py`, `tools/export_decompiler_inputs.py`, updated manifest |
| Gen1 combat matrix | COAB source -> local offsets | updated `combat-source-matrix.md` |
| Savestate harness | DOSBox-X state naming, screenshots, dumps | `states/` manifest + docs |

## Verification Gates

- `python -m py_compile tools\compiler_fingerprint.py` and any new Python tools.
- New mapper tools must emit deterministic JSON and Markdown.
- `git diff --check` on changed docs/tools.
- For every decompile claim: exact file, offset, bytes or trace row, confidence, and whether it is
  implemented, pending, or rejected.
- For web/native combat changes: screenshot/e2e or native smoke that visibly proves the recovered path.

## Clean-Room Rules

- COAB and Dungeon Craft/UAF are study/oracle references. Do not copy their code into Greybox.
- GPL or unlicensed source may inform behaviour only; implementation must be from local bytes,
  documented specs, tests, and clean-room reimplementation.
- When CKIT/FRUA explains a Gen2 table, confirm against DQK before using it for DQK gameplay.
