# All-Games Decompile Pattern Plan

> **Status reviewed 2026-10-11:** the native DOS Greybox engine is the primary deliverable.
> The mapper and pattern totals below are the recorded broad-pass snapshot, not a fresh
> corpus measurement. Reproducible imports and Ghidra verification are described in
> [decompiler-project-inputs.md](decompiler-project-inputs.md) and `tools/decompiler/README.md`.
> Current title-local boundaries, including recovered CoK/DoK RNG and CoK demo entry,
> are indexed in [decompile-worklist.md](decompile-worklist.md).

> Purpose: turn the "decompile the Gold Box family" idea into a repeatable, evidence-first
> pipeline. The immediate payoff is combat/UI recovery: find the same subsystem in several games,
> compare deltas, then port only the verified behaviour into Greybox.

Execution handoff for the current Gen2/Gen1 decompile split lives in
`docs/engine/research/decompile-handoff-gen1-gen2.md`.

The durable program charter above this research plan is `docs/engine/LONG-TERM-GOALS.md`. New
decompile substeps should state which charter goal, program milestone, and compatibility gate they
unblock.

## 1. Working Hypothesis

The early DAX games are close enough that routines can be recognized across titles by structure,
strings, data-table shape, and ECL side effects even when offsets drift. CoAB is the best available
open/decompiled reference, but it must be treated as a Rosetta stone rather than a universal source
drop.

The later HLIB/TLB/GLB generation, clearly DQK and FRUA in this project, should be analyzed as a
separate family. If a note says "DoK" used the later engine, verify whether it actually means
**DQK**: Death Knights of Krynn is in the older DAX/FBOV line in the local DOS evidence, while
The Dark Queen of Krynn is the HLIB generation.

## 2. Compiler / Runtime Classification Comes First

Do not infer implementation language from title chronology alone. For each DOS game, collect:

| Signal | Why it matters |
| --- | --- |
| MZ header, relocation count, entrypoint | Confirms 16-bit real-mode executable layout. |
| EXEPACK / LZEXE / packed state | Determines whether static strings/code are visible. |
| Borland / Microsoft runtime strings | Identifies startup, calling convention, overlay manager, library idioms. |
| Overlay container (`GAME.OVR`, `FBOV`, `eovNNNN`) | Defines decompile units and far-call resolution. |
| Data containers (`DAX`, `DAA`, `HLIB`/`TLB`/`GLB`) | Correlates engine generation and asset/ECL storage. |
| Known config marker (`POOL.CFG`, `CURSE.CFG`, etc.) | Pins the game profile before scanning. |

"Pascal generation" remains a useful community label for the early DAX line, but the actual DOS
binaries in this workspace show Borland real-mode runtime/overlay signatures for the Krynn builds.
The plan therefore records observed compiler/runtime fingerprints per binary rather than relying on
a single broad label.

## 3. Game Inventory Matrix

Create a generated inventory for every available install folder:

| Family | Games to scan | First-pass expectation |
| --- | --- | --- |
| PoR / FR Gen1 | PoR, CoAB, SotSB, PoD | DAX archives; `START.EXE`/`GAME.OVR` style varies; CoAB source is the reference. |
| Krynn Gen1 | CoK, DoK | DAX + FBOV overlays; compare directly against existing `tools/disasm_cok.py` and `tools/disasm_dok.py`. |
| Savage Frontier / NWN | Gateway, Treasures, NWN AOL | DAX + FBOV-like overlays; likely engine sibling with AD&D 2e / online deltas. |
| Buck Rogers | BR1, BR2 | DAX-like Gen1 branch; rules and combat tables differ. |
| Gen2 / UA | DQK, FRUA | HLIB/TLB/GLB; different runtime/data model; analyze separately. |

The inventory should output JSON/Markdown so stale docs can be caught automatically.

## 4. Pattern-Matching Pipeline

1. **Normalize binaries**
   - Detect/depack if needed.
   - Split resident EXE and overlay banks.
   - Assign stable file-offset and segment:offset ranges.

2. **Extract anchors**
   - ASCII strings and compressed text literals.
   - Far-call stubs and overlay thunk tables.
   - ECL opcode dispatch tables.
   - DAX/HLIB block-name references.
   - Error text, menu text, combat messages, shop/training/rest strings.

3. **Fingerprint code**
   - Normalize near/far call targets and relocations.
   - Hash short instruction windows around anchors.
   - Detect common prologues/epilogues, `RET n`, switch tables, and indexed table reads.
   - Match routines by control-flow shape, not absolute address.

4. **Fingerprint data tables**
   - THAC0/save/XP monotonic matrices.
   - Direction delta tables.
   - Combat deploy grids.
   - Item/monster fixed-stride structs.
   - ECL argument-count tables and opcode name/message correlations.

5. **Cross-game subsystem map**
   - For each subsystem, record CoAB source unit, each game offset, confidence, deltas, and current
     Greybox implementation status.
   - Prefer "verified partial" over broad claims.

6. **Dynamic proof where static analysis stalls**
   - Use DOSBox-X / dosdebug / Spice86 watchpoints on seed variables, ECL PC, combat map writes,
     and tile/backdrop buffers.
   - Capture traces that map live writes back to overlay offsets.

7. **Savestate waypoint loop**
   - Use DOSBox-X savestates as durable runtime waypoints when a route is expensive to reproduce.
     DOSBox-X is the preferred DOS emulator for this step because it supports save/load states,
     save slots, user-selected save files, and interval autosaves; classic DOSBox and DOSBox
     Staging are not assumed to provide this workflow.
   - Capture named waypoints per title and route, for example
     `states/dqk/party-loaded`, `states/dqk/before-known-encounter`,
     `states/dqk/combat-frame0`, and `states/dqk/combat-aim`.
   - Each waypoint should have a matching screenshot, visible input context, mounted-drive
     manifest, game save files, and any memory dump/debugger export needed to re-anchor the state.
   - Use these states to shorten dynamic research loops: resume at the nearest verified point,
     dump/watch only the combat-transition interval, then map the observed writes/calls back to
     the carved overlay offsets.
   - Treat savestates as runtime evidence, not decompile output. A savestate can prove what the
     original executable does at a moment in play, but recovered routines still need static offset
     anchors, data-structure notes, and Greybox tests before they are considered implemented.

## 5. Combat-Specific Targets

The next useful cross-game targets are:

| Target | Pattern |
| --- | --- |
| Combat UI/chrome | `draw_combat_picture`, menu command strings, party-status column writes, frame-tile calls. |
| Battle floor setup | `SetupDungeonFloor`, `SetupWildernessFloor`, DUNGCOM/WILDCOM/RANDCOM tile-index writes. |
| Combatant deployment | Encounter distance, party corner, enemy facing, 11x6 deploy region. |
| Monster icon link | ECL `LOAD_MONSTER` / `SETUP_MONSTER` pic ids to CPIC/COMSPR block lookup. |
| LOS/movement | `BackGroundTiles` movement/sight flags, wall/door obstruction, hazard tiles. |

These are recovery targets for title-local floor/object/icon placement. Existing native/web
paths already consume recovered data in some titles; their coverage and fallback behavior
must be checked per route before describing a missing subsystem.

## 6. Deliverables

- `tools/inventory_goldbox_binaries.*`: emits per-game compiler/runtime/container signatures.
- `tools/compiler_fingerprint.*`: classifies individual DOS executables/overlay pools by
  compiler/linker/runtime byte evidence, with explicit separation between "toolchain proven" and
  "source language inferred".
- `tools/carve_goldbox_overlays.*`: shared overlay extractor for FBOV/HLIB code banks.
- `tools/match_goldbox_patterns.*`: cross-game string/table/code fingerprint matcher.
- `docs/engine/research/compiler-runtime-matrix.md`: generated or regenerated summary.
- One subsystem note per recovered behaviour, with exact offsets and confidence.

## 6.1 Implementation Status

- **DONE:** `tools/inventory_goldbox_binaries.py` inventories known local game roots, sniffs MZ,
  FBOV, DAX, DAA, HLIB, LBM, XMI, ADV, and CFG files, and emits deterministic JSON plus Markdown.
- **DONE:** `docs/engine/research/compiler-runtime-matrix.md` is generated from the first local
  pass and currently covers CoK, DoK, DQK, CoAB data, and NWN DOS/AOL.
- **DONE:** `tools/compiler_fingerprint.py` provides the focused compiler/linker/runtime test. It
  classifies local CKIT and DQK as the same Borland C++ 3.x-family RTLink/Plus large-model runtime,
  and CoK/DoK/NWN `GAME.OVR` as the older FBOV/VROOMM family. Its output deliberately distinguishes
  proven toolchain/runtime from inferred source language.
- **DONE:** `tools/carve_goldbox_overlays.py` normalizes all located Gen1 FBOV/TPOV pools and
  VROOMM loader-resident code, plus DQK/FRUA RTLink resident and overlay candidates, into stable
  JSON/Markdown chunk records.
- **DONE:** `docs/engine/research/overlay-carve-manifest.md` is generated from 20 retail code files
  across the configured corpus, currently yielding 61 chunks: 8 FBOV pools, 1 TPOV pool, 9 VROOMM
  resident chunks, 2 RTLink resident chunks, and 41 RTLink overlay candidates.
- **DONE:** `tools/match_goldbox_patterns.py` consumes the overlay carve manifest and emits
  cross-game string, prologue-window, and focused byte-pattern matches for combat UI, battle-floor,
  combat icon, and NWN/DQK-specific anchors.
- **DONE:** `docs/engine/research/pattern-match-report.md` is generated from the first combat-only
  pass; it now pins recurring anchors such as `A battle begins`, `is hit FOR`,
  `points of damage`, `DUNGCOM`, `Aim`, `Attack`, `Bandage`, `is forced to flee`, and
  `Surrenders` across CoK, DoK, DQK, and NWN where present.
- **DONE:** `tools/xref_goldbox_anchors.py` consumes the pattern report and emits a focused
  candidate xref report for combat anchors. It filters to non-control-flow operands so the output
  is a smaller manual follow-up list instead of a full-byte coincidence dump.
- **DONE:** `docs/engine/research/combat-anchor-xrefs.md` is generated from that xref pass. It is
  candidate evidence, not final routine naming, but it now points at concrete follow-up windows for
  `Load24x24Set`, NWN surrender/flee state, CPIC/COMSPR icon loading, and DQK DUNGCOM1 setup.
- **DONE:** `tools/vroomm_layout.py` strictly maps 426 Gen1 descriptors and all 64,416 fixups. Its
  independent instruction scan proves 61,623 `LCALL` relocations and routes every one to resident
  MZ code, an in-bounds public overlay stub, or a descriptor-header entry. The remaining 2,793
  segment relocations are classified separately.
- **DONE:** `tools/correlate_vroomm_calls.py` joins all routed calls to exact normalized function
  starts. It classifies all 61,623 calls and identifies 181 exact clustered targets without
  promoting 68 interior range coincidences or unresolved relocated selectors to symbols.
- **DONE:** `tools/map_coab_oracle.py` uses CoAB's own listing/link order as a same-game oracle. All
  36 source overlay units and 851 listed functions round-trip to in-bounds retail `GAME.OVR`
  offsets; 11 combat anchors are pinned, while sibling-game names remain behavior-gated.
- **DONE:** native `CCCOMBAT /V` RAW rendering now uses the recovered `draw_combat_picture`
  geometry: seven visible 24px cells clipped to x/y `[8,176)`, while the 10x10 tactical mechanics
  grid remains unchanged.
- **PLANNED:** add a DOSBox-X savestate waypoint set for the combat routes. The first useful states
  are DQK after party load, DQK before a known encounter, DQK combat frame 0, CoK/DoK combat frame 0,
  and NWN combat frame 0. These states should replace long boot-to-combat traces wherever the goal is
  to observe the transition or in-combat UI rather than to prove the whole start/load route.
- **FOLLOW-UP:** real terrain and source-placement paths now exist, including the recovered
  CoAB 50x25 web path described in `decompile-ovr011-battle-setup.md`. Do not describe all
  combat floors as flat placeholders. Verify the title and caller being changed; remaining
  source footprints, wall-direction wiring, range/LOS adoption and fallback placements
  are still explicit limits.

## 7. Clean-Room Boundary

COAB and Dungeon Craft are study/oracle references. Do not copy their code into the MIT/TS engine.
Use them to identify behaviour, then reimplement from verified specs, tests, and local game bytes.
