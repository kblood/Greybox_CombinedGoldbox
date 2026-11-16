# Combat System Source Recovery Goal

## Objective

Recover the Gold Box combat source model end-to-end: identify the original routines and data structures
that transform an ECL/script encounter into tactical combat, document them from decompiled and binary
sources, and implement the verified pipeline in Greybox web/native previews.

Completion means a scripted encounter can enter combat mode through decoded encounter data, render a
combat area from recovered terrain/background setup rather than placeholders, place party and monsters
according to the original setup rules, run verified combat mechanics, and resume the script/exploration
state with the correct outcome.

Documentation is part of the implementation goal. Every new combat-source finding, decompile result,
asset/data-format discovery, or behavior change must update the matching research/documentation file in
the same work pass. This includes focused research notes plus any affected README, architecture,
web/native, or user-facing docs, not only files under `docs/engine/research/`. If the finding is a new
subsystem, routine family, file format, or cross-game difference that would make an existing note too
broad, create a focused new research file and link it from this goal or the nearest relevant overview.

The docs pass is mandatory for each implementation/research slice: check whether the finding changes an
existing claim, add the missing source anchor or verification command, and create a new file when the
finding is genuinely new enough that appending it to an existing note would hide important detail.
Do not rely on chat history for durable research: if new source evidence changes what we know, either
update the current research note or add and link a new one before considering the slice done.
This includes creating new files for newly recovered source families, data layouts, combat mechanics,
asset formats, or cross-game differences, then linking them from the relevant overview/goal documents in
the same work pass.

## Current Evidence Already Found

- CoAB decompile is the main early-Gold-Box oracle for combat. Relevant anchors are documented in:
  - `docs/engine/research/combat-source-matrix.md`
  - `docs/engine/research/neverwinter-nights-dos-combat-flow.md`
  - `docs/engine/research/dqk-overlay12-combat-setup-cluster.md`
  - `docs/engine/research/dqk-combat-context-ca03.md`
  - `docs/engine/research/dqk-2033-accessor-patterns.md`
  - `docs/engine/research/dqk-ca03-runtime-probe.md`
  - `docs/engine/research/dqk-qsv-save-transfer-consumers.md`
  - `docs/engine/research/dqk-palanthas-palace-combat-route.md`
  - `docs/engine/research/dqk-start-load-route-anchors.md`
  - `docs/engine/research/dqk-combat-render-dispatch.md`
  - `docs/engine/research/combat-tilebank-load24x24-crossgame.md`
  - `docs/engine/research/combat-mechanics-coab.md`
  - `docs/engine/research/combat-floor-ui-source-anchors.md`
  - `docs/engine/research/decompile-ovr011-battle-setup.md`
  - `docs/engine/research/decompile-ovr010-monster-ai.md`
  - `docs/engine/research/decompile-ovr015-movement.md`
  - `docs/engine/research/decompile-ovr019-034-038-draw.md`
  - `docs/engine/research/combat-area-setup-coab.md`
- Combat viewport/chrome is identified:
  - 7x7 visible combat grid.
  - 24x24 pixel cells.
  - Battle viewport clipped to roughly pixel `x/y 8..176`.
  - Scrolling uses `mapScreenTopLeft`.
  - Engine mirror lives in `packages/engine/src/render/combatScreen.ts`.
- Combat floor loading is anchored:
  - CoAB `SetupGroundTiles()` loads `DUNGCOM`, `WILDCOM`, and `RANDCOM`.
  - `Load24x24Set()` appends 24x24 combat tiles into the mutable combat tile bank.
  - Current web decodes CoK `DUNGCOM.DAX` and renders its 24x24 tiles in combat.
- Terrain metadata is partially recovered:
  - CoAB `BackGroundTiles` records carry movement cost, visibility/height fields, and render tile index.
  - DQK byte-table cross-check exists at `DQK.EXE:0x69bb7`, plus a second exact run at `0x69c37`.
  - DQK overlay-12 combat setup cluster is now isolated in
    `docs/engine/research/dqk-overlay12-combat-setup-cluster.md`: it pins Gen2 combat UI strings,
    `COMSPR`, `DungCom1`, `WildCom1`, `A battle begins...`, the `BackGroundTiles[0..25]` run at
    `0x69bb7`, the `BackGroundTiles[32..43]` run at `0x69c37`, the known local DQK variant rows, and
    DGROUP xrefs such as `0x02cc1a` / `0x02cc33` for the `DungCom1` / `WildCom1` loader candidates.
  - Cross-game combat tile-bank loading is now pinned in
    `docs/engine/research/combat-tilebank-load24x24-crossgame.md`: old-engine CoK/DoK/NWN
    `Load24x24Set`-shaped argument triplets are verified against real DAX tile counts. DQK's Gen2
    `lcall 0x104c:0x0007` candidate is now scoped as combat TLB/HLIB file-group setup, not as the
    strict old-engine copy-loop equivalent. The DQK wrapper
    maps to file `0x128c7`, has exactly two raw call sites (`0x02cc1e`, `0x02cc37`), and forwards
    `DungCom1` / `WildCom1` through `0x09a4:0x01dc` (`DQK.EXE:0x0c01c`) and `0x09a4:0x0b8c`
    (`DQK.EXE:0x0c9cc`). The apparent `0x19` / `0x27` count-like caller values land at `[bp+0x0e]`
    and are not read by this wrapper, so the downstream Gen2 routine that selects/copies 24x24 cells
    from realized TLB/HLIB data remains open. The first downstream branch from `0x09a4:0x0b8c` is now
    pinned as HLIB palette/header realization: `0x1796:0x0536` (`DQK.EXE:0x01a296`) validates item type
    low-nibble `8` and calls `0x161b:0x00b1`, which updates VGA palette tables and dirty bits rather
    than copying 24x24 combat cells.
  - DQK Gen2 combat map population is now pinned beyond the tile-bank loader:
    `0x02cb60` dispatches the `DungCom1` / `WildCom1` setup branch, `0x02c397` initializes the dungeon
    path by filling `[0xbedb]+9` for `0x04e2` bytes with background id `0x16`, `0x02cb2b` initializes
    the wilderness path by filling the same `0x04e2 == 50*25` grid with background id `0x45`, and
    `0x02bcf0` writes individual background ids to `[0xbedb]+9 + y*0x32 + x`. `0x02c6d7` consumes that
    50x25 grid, indexes `BackGroundTiles` at DGROUP `0x6197`, checks `tileIndex` byte `+3`, and applies
    wilderness/tree variants. This proves the DQK live tactical map is a 50x25 background-id grid.
  - DQK renderer-side background mapping is now pinned at `DQK.EXE:0x02ba4c`: it reads the same
    `[0xbedb]+9 + y*0x32 + x` grid, clamps invalid/zero/`>0x4c` ids to `0x15`, indexes
    `BackGroundTiles` at DGROUP `0x6197`, reads byte `+3` as `tileIndex`, and calls
    `0x09a4:0x0515` with the active `[0xc5d4]/[0xc5d6]` `DungCom1` / `WildCom1` group,
    flag `0`, and `tileIndex+1`. Special/remapped cells can overlay `[0xb17d]/[0xb17f]` combat art
    with `otherTileIndex+0x0f` through the same HLIB render/copy entry.
  - Greybox now has a DQK-specific terrain-table consumer,
    `dqkNativeTerrainGridFromBackgroundMap()`, which applies that native renderer clamp before reading
    `DQK_BACKGROUND_TILES` for blocked/sight/cost semantics. This is deliberately separate from the
    CoAB `terrainGridFromBackgroundMap()` helper and prevents future DQK combat surfaces from using
    CoAB terrain rows by accident.
  - `0x09a4:0x0515` is now decompiled far enough to pin member indexing. It maps to
    `DQK.EXE:0x00c355`, forwards `member`, group id, `x`, and `y` to `0x169b:0x0bd0`, and the downstream
    HLIB helpers `0x193f:0x01fd` / `0x193f:0x02a1` check `member < count` and seek
    `0x10 + member*4`. The consumed member is therefore a flat zero-based index inside the selected
    group. `tileIndex+1` is a caller-side terrain convention/reservation over the active Dung/Wild
    group, not a `(masterSet, localSlot)` pair passed through `0x0515`.
  - DQK combat terrain master/leaf selection is now narrowed for the shipped `DungCom1` and `WildCom1`
    paths. `0x09a4:0x01dc` strips the trailing `1`, clears group-record `+2` for this digit-suffixed
    path, stores the parsed suffix in `[0xa317]`, stores runtime `[0xca03]` in `[0xa627]`, and opens the
    base `DUNGCOM.TLB` / `WILDCOM.TLB`. The `0x09a4:0x004b` callback first looks up master set key
    `[0xa627]` via `0x193f:0x0419`, then falls back to `suffix * 100 + [0xa627]`; with `a629=0`, it
    binds the selected master member range through `0x193f:0x0071`. The shipped master set-id tables map
    context key `1` to leaf 1 in both files (`DUNGCOM.TLB` leaf base `0x0046`, `WILDCOM.TLB` leaf base
    `0x003a`), but the suffix `1` is not itself the primary leaf selector. The `0x2033` operand-parser
    accessors are now documented in `docs/engine/research/dqk-2033-accessor-patterns.md`: `0x2033:0013`
    parses current-stream operands from `[ae5c:ae5e]+[b7f9]`, `0x2033:0112` returns typed operand
    values, and operand `2` in the `0x0420ac` handler is the immediate source for `[0xca03]`. The
    same note now narrows operand `1` to a combat-art/orientation resource selector: it is stored at
    current combatant `+0x13`, passed to `1D99:13B9`, and that stub resolves to overlay-11
    `DQK.EXE:0x061bc3`, which loads through `back1` / `8x8d%c%d` / `GEO1` resource strings and mirrors
    the value to current combatant `+0xc6`. The exact gameplay/editor label and runtime values remain
    open. `docs/engine/research/dqk-ca03-runtime-probe.md` now records the automated Unicorn
    watch-mode for those runtime values; the probe is implemented and verified, the older VGA retrace
    stall at `DQK.EXE:0x05285..0x05288` is modelled, and `--fake-keys` now supports queued synthetic
    BIOS input for route-driving attempts. Later route probes added `--watch-dqk-route`,
    `--watch-exec`, `--watch-file-writes`, and `--fake-timer`. The earlier `--load-seg 0x1000`
    overwrite finding is now superseded: the real issue was the synthetic DOS memory model. With
    `PSP:[2]` and `INT 21h AH=4A` fixed, `--load-seg 0x1000` is again the route
    baseline; `--load-seg 0x2000` avoids the old overwrite but leaves DQK below its own conventional
    memory requirement. The timer delay loop at `DQK.EXE:0x0135ec` / timer getter `151e:00c6` is still
    handled by `--fake-timer`, which advances `DS:cda6/cda8`. The current fixed-memory
    party-input-gated route with `--load-seg 0x1000`, route watches, fake timer, DOS-memory tracing, and
    drift guards reaches the 12M instruction cap without resident-code corruption, but still reaches
    zero `ca03` watch rows and no party/load route proof. The remaining runtime gap is route/state
    fidelity after startup and save selection, not the older VGA, keyboard, image-placement, timer, or
    `20d7:094a` blockers. A follow-up input pass added
    `--trace-keys`, `--fake-key-rearm-after`, `--fake-key-min-instr-gap`, `wait:N` fake-key tokens,
    `INT 21h/AH=06` direct-console handling, and route-file markers. Those probes prove that queued
    keys are consumed, including a full `esc,wait:2500000,l,t,a,enter,b` script by 6M instructions, but
    still produce no `SAVG`/`SAVE`/`VAULT`/`TDQK`/`CHRDAT`/`ROSTER`/`QSV` opens and no `ca03` rows. The
    early start/load route anchors are now documented in
    `docs/engine/research/dqk-start-load-route-anchors.md`: party/start menu render and dispatch,
    `Load Saved Game`, QSV/slot picker, selected-QSV loader, saved `[ca03]` reader, `Vault%c.DAT`, and
    `Begin Adventuring` are all in `--watch-dqk-route`. A focused 6M-instruction route-case trace still
    consumed all keys without hitting any of those anchors. The live generic prompt loop has now been
    mapped back to resident input/title code: `L` and `T` are read by `1102:044a`
    (`DQK.EXE:0x01386a`) with returns through `17fa:0155` / `17fa:0221`, not by the party menu or
    QSV/slot picker. A follow-up `gate:0x1aa6:0x1703` fake-key probe proved that gating the route keys
    directly on the widget dispatcher is too late or too specific when the cold boot is still in the
    title/resource prompt path: the gate never released. Inserting two neutral `SPACE` prompts and then
    gating `1aa6:1703` still did not reach that widget address before a later stop. A broader
    `gate:0x1102:0x00a1` run did release from the later active input predicate, then reached
    `1aa6:1703` / `1aa6:170f` and consumed all route keys, but still opened no QSV/save files, hit no
    `25a4:*` party-menu watches, hit no `1f4e:*` load-source watches, and produced zero `ca03` rows.
    The `464f:*` / `1aa6:*` form context is now identified far enough to reject it as the party/load
    proof. The old pre-memory-fix widget snapshot was `dac0=0x0004`, `dac7=522e:db68`, and callbacks
    `[0:3aa6:1183,1:2bdb:008e,2:2bdb:008e,3:2bdb:008e]`; under the fixed-memory `--load-seg 0x1000`
    baseline the equivalent state is `dac0=0x0004`, `dac7=422e:db68`, with live callbacks
    `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`. Static disassembly maps those to the generic
    widget wrapper at `DQK.EXE:0x01dfe3` and widget flag/draw handler at `DQK.EXE:0x00e23e`. The next
    DQK runtime step is therefore to bypass generic widget-loop success and prove the real party-menu
    render/input anchors (`25a4:3127` / `25a4:33c3`) before feeding `L/T/A/Enter/B`. A direct
    `gate:0x25a4:0x33c3:party-menu-input-call` run remains negative after the memory fix: the gate
    waits for the canonical party-input target, only the pre-gate `ESC` / `SPACE` prompts are consumed,
    no party/load/CA03 watches fire, and file opens stay in startup/title assets. The old `20d7:094a`
    stop is resolved as loaded-code overwrite caused by the previous memory model; further fixed-delay
    input attempts are therefore still not a source answer. The active form/widget state is now
    instrumented far enough to show the bad route is a resident mode-`2` generic form
    (`1d0c=2`, `a6b5=1`, `dac0=4`) that enters `1bdb:1008`, not the party/load form. A follow-up
    early trace shows `1d0c=2` is file-loaded initial resident form/resource data from
    `DQK.EXE@0x63a20` into `422e:0000`, landing at file `0x6572c`, not a late `mov [1d0c],2`
    setter. A static scan found resident setters at `0bdb:141e` / file `0x00f5ce` and `0bdb:1410` /
    file `0x00f5c0`, plus candidate callers `0bdb:0521`, `0bdb:1a1b`, and `0bdb:1f25`; however,
    `build\dqk-load1000-mode2-callers.log` shows those setters/callers do not execute in the current
    route. The actual hits are `0bdb:0dcf`, `0bdb:1206`, and `0bdb:1008`. A call-site run then found
    the concrete `0bdb:1206` caller: `0bdb:1e87` / file `0x010037`, inside the `0bdb:1e29` function.
    A branch trace now resolves that immediate fork: `00d7:2543` returns `AX=0`, so `0bdb:1e47`
    takes the `JE` path to `0bdb:1e5c`, bypassing the `0bdb:0521` branch and continuing through
    `0bdb:0d26/eed6 -> 0bdb:1206 -> 0bdb:1008`. Static disassembly then identifies
    `00d7:2543` as a case-insensitive string-equality wrapper over `00d7:24de`. It compares the
    caller string `[bp+0xa]/[bp+0xc]` against `DGROUP:3aee/3af0`, a far pointer to
    `Press button or enter to continue`; the current route returns mismatch. A follow-up tracer run
    dumps the live caller string as `Play Demo Quit`, proving the route is still in the title/demo/quit
    options form rather than a valid continue-prompt or party/load form. The next DQK route work is to
    drive or bypass that title form into the real party/load anchors, or use DOSBox-X/debugger
    breakpoints at those anchors.
    The selected-leaf reserved-slot
    question is resolved at asset level: member `0` in DUNGCOM/WILDCOM leaf
    1 is the palette/color-table record, decoded images start at `set01_img001`, and
    `BackGroundTiles.tileIndex+1` deliberately skips member zero.
  - DQK `[0xca03]` context lifecycle is now documented in
    `docs/engine/research/dqk-combat-context-ca03.md`: save/load reads/writes it at
    `0x035b02` / `0x0363b0`, reset paths zero `ca03..ca06` at `0x038024` / `0x03821a`, the live setter
    starts at `0x0420ac`, and combat setup forwards it through `0x104c:0007 -> 0x09a4:01dc` into
    `[0xa627]`.
  - DQK renderer dispatch is now documented in `docs/engine/research/dqk-combat-render-dispatch.md`:
    resident stub `1D99:0EC3` / `2740:0846` resolves to file `0x02ab66`, calls the full viewport helper
    at `0x02aa06`, loops row/col `0..6`, and calls `2740:172C` / `DQK.EXE:0x02ba4c` for each visible
    cell. Tooling now distinguishes overlay-0 segment base `0x022400` from first prologue/code start
    `0x022401`, so `2740:172C` resolves to the real `push bp` at `0x02ba4c`.
  - DQK native terrain-member conversion now has an engine helper and real-asset tests:
    `dqkNativeCombatTerrainMemberByte()` mirrors the renderer's live background-id clamp (`0` or
    `> 0x4c` -> `0x15`) and HLIB member-byte conversion `(tileIndex + 1) & 0xff` over the
    DQK-specific `DQK_BACKGROUND_TILES` table carved from `DQK.EXE:0x69bb7`. Focused tests verify that
    native-valid rows `0..0x4c` map to existing `WILDCOM.TLB` set-1 labels, and the dungeon/shared
    subsets also map to `DUNGCOM.TLB` set-1 labels.
    `dqkNativeBackgroundCellMemberMap()` now applies the same conversion over a viewport of live DQK
    background ids, returning the HLIB member bytes DQK passes to `0x09a4:0515`; this keeps future DQK
    50x25 combat rendering separate from CoAB's `backgroundCellTileMap()` tile-index helper.
    `buildDqkNativeCombatMap()` now wraps explicit/recovered DQK background-id arrays as a
    DQK-specific `TerrainGrid` plus party/enemy anchors, while deliberately not fabricating the missing
    live DQK map-population step.
    Web `?combat=dqk` now exposes that contract as a labelled synthetic DQK native background-id preview
    fixture: 50x25 ids, `placementMode="anchor"`, DQK Gen2 terrain/member seams, and
    `backgroundSummary.checksum=3917224348`. This preview is intentionally not a DQK TLB/VGA rendering
    proof and not a claim that the original `[bedb]+9` population routine has been run.
    `tools/unicorn_dqk_trace.py --dump-dqk-combat-map PREFIX` now instruments the original DQK
    setup/render anchors and will dump the far-pointer-backed `ptr_seg:(ptr_off+9)` 50x25 surface when
    a route reaches them. The hook has been syntax/smoke validated, including a 2000-instruction
    startup run that correctly produces zero rows; it also now validates live bytes against the expected
    `DQK.EXE` file offset before accepting a watchpoint, because DQK reuses overlay memory. A staged
    area-5 loaded-save trace that previously appeared to hit `cell-writer-entry-file-02bcf0` now logs
    three `alias-skip` rows at live `389c:0340` / physical `0x038d00`; the actual bytes are party-menu
    setup bytes, not the `0x02bcf0` writer prologue. This is not yet a recovered original
    combat-surface artefact. Surface-write dumps are now armed only after a byte-validated combat-map
    anchor, so generic writes through a stale/non-combat `[bedb]` pointer do not create false
    `[bedb]+9` dump rows.
  - Greybox now has `packages/engine/src/combat/terrain.ts` with `BACKGROUND_TILES` helpers and raw
    four-byte `BackGroundTiles` record encode/decode helpers.
- Dungeon combat-area setup is partially recovered:
  - CoAB `SetupDungeonFloor()` scans a 13x5 dungeon-cell window into a 50x25 combat map.
  - Greybox now has `packages/engine/src/combat/coabCombatMap.ts` for the deterministic dungeon core,
    emitting both 50x25 `backgroundIds` and a `TerrainGrid` from the same `BackGroundTiles` ids.
  - The builder now mirrors CoAB `WallDoorFlagsGet()` / `getMap_wall_type()` tri-state flags over
    decoded GEO wall/x3 bytes and can run `sub_370D3()` random table/chair placement with an injected
    seeded d10 roller.
  - The same module now exports `buildCoabWildernessCombatMap()` for CoAB `SetupWildernessFloor()`,
    including `CityInfo` and the three RNG-driven wilderness passes.
  - CoAB dice call shape is now source-anchored but not original-RNG-complete:
    `coab_extracted/engine/ovr024.cs:586-593` loops `dice_count` times over
    `seg051.Random(dice_size)+1`, and `coab_extracted/engine/seg051.cs:33-50` shows the extracted C#
    port's max-exclusive `Random(max)` wrapper. Greybox exports `rollCoabDie()`, `rollCoabDice()`, and
    `coabDiceRollerFromRandom()` to preserve this consumption shape over an injected source. The
    original DOS RNG algorithm/state/seeding path remains unrecovered, so these helpers must not be
    treated as bit-for-bit RNG parity.
  - `packages/engine/src/loaders/area1.ts` now decodes the CoAB Area1 host record fields needed by
    wilderness combat setup, including `current_city` at offset `0x342` and `inDungeon` at `0x1cc`.
    It also decodes early Krynn `SAVGAMA.DAT` save wrappers whose embedded Area1 record starts at
    offset `1`, preserving the preceding `game_area` byte. CoAB `loadSaveGame()`/`SaveGame()` source
    backs that wrapper layout: one `game_area` byte, one 0x800 Area1 block, then Area2/other state.
    Because load later copies `area2_ptr.game_area` back into runtime `gbl.game_area`, the decoder also
    exposes optional `area2GameArea` when the wrapper includes the Area2 block.
  - Web `?wild=1` now tries to read a real `SAVGAMA.DAT` through a user-picked `AssetSource` or the
    bundled CoK save path, exposes the decoded native `game_area` + Area1 record through
    `__wild.area1Host()`, and promotes it to recovered wilderness combat only when the record is
    actually wilderness-mode.
  - `patchCoabArea1HostState()` / `patchCoabSavgamaArea1HostState()` now provide a durable
    source-layout fixture path: a real `SAVGAMA.DAT` wrapper can be copied, patched at recovered
    header `game_area`, `Area2.game_area`, and Area1 offsets, decoded again, and used for browser
    wilderness-combat verification without hand-building an unrelated byte array.
  - Web `?wild=1` also has byte-shaped `__wild.setCombatHostFromArea1(areaBytes, { rngSeed })` and
    save-wrapper-shaped `__wild.setCombatHostFromSavgama(saveBytes, { rngSeed })` seams; wandering
    combat uses `buildCoabWildernessCombatMap()` and passes 50x25 `backgroundIds` through
    `launchCombat()` when that context is present, while keeping the flat fallback when absent. The older
    direct `__wild.setCombatHost({ currentCity, rngSeed })` seam remains only as a narrow debug hook.
  - Web `?combat=mvp` preserves the helper's `mapToBackGroundTile`-style ids for rendering/inspection.
  - `apps/web/src/ui/explore.ts` routes script-triggered Krynn Gen1 dungeon combat through the same
    builder and passes `backgroundIds` through `launchCombat()` to the combat renderer, including
    decoded plane-2 `get_wall_x2` data for furniture placement.
- Temporary map mutation is partially recovered:
  - `packages/engine/src/combat/coabCombatMap.ts` now has pure helpers for downed-player,
    stinking-cloud, and cloudkill `mapToBackGroundTile` mutations.
  - The helpers cover recovered cloud shapes, saved ground tiles, passable-cell `present[]` gating,
    downed/cloud overlay peeling, and restore/re-overlay behavior from CoAB decompile anchors.
  - The same module now has `CoabCombatTileState`, a live reducer that owns mutable combat
    `backgroundIds`, active downed records, timed gas-cloud records, cloud expiry, saved-ground restore,
    and remaining-overlay preservation.
  - `apps/web/src/ui/combat.ts` now wraps recovered 50x25 maps in that reducer during live combat:
    Stinking Cloud / Cloudkill spell ids add timed cloud records, cloud cells are exposed as
    `TerrainGrid.hazard`, cloud expiry runs from the tactical round-start hook, rendered
    `backgroundIds` stay pointed at the live map, and party `slain` events mark downed-player tiles.
  - Cloud movement/effect mechanics now include CoAB entry gates and Cloudkill poison bands:
    noxious-cloud failed-save entry rejection, poisonous-cloud HD<7 entry blocking, Cloudkill HD 0-4
    no-save death, HD 5 save-at-4-penalty, HD 6 normal save, and HD 7+ immunity to the poison routine.
  - CoAB noxious-cloud exposure now distinguishes the `in_poison_cloud(arg_0 != 0)` paths: a made
    poison save applies the one-round `stinking_cloud`/coughing affect, while a failed save applies
    helplessness for `d4+1` rounds. Begin-turn exposure keeps the CoAB distinction that noxious clouds
    do not re-run this branch when `arg_0 == 0`.
  - Cloud immunity now has a source-shaped MVP in the tactical engine: `noxiousCloudImmune` bypasses
    noxious entry rejection and coughing/helpless exposure, while `poisonCloudImmune` bypasses poisonous
    HD entry rejection and Cloudkill poison death. This is intentionally narrower than COAB's full affect
    table and is documented in `docs/engine/research/combat-mechanics-coab.md`.
  - Cloud protection affect-id mapping is now source-split at engine level: MON*SPC joins
    `protect_magic`, `minor_globe`, `stinking_cloud`, `animate_dead`, `affect_6f`, `affect_7d`, and
    `affect_85` into separate noxious-entry, noxious-exposure, and poisonous-entry gates. The older broad
    tactical flags remain as overrides, but live monster records now use the narrower source-shaped
    fields. A follow-up source pass found no protective-affect or fleeing gate in CoAB poisonous
    post-entry exposure; `in_poison_cloud` only applies HD bands and lets HD 7+ fall through unaffected.
  - Combat cure healing can now target unconscious allies and emits a `stand-up` event when the target
    returns above zero HP; the web CoAB tile reducer uses that event to restore the downed-player tile
    while preserving any active cloud overlay.
  - Post-combat roster recovery now has a shared engine helper:
    `packages/engine/src/combat/party.ts` exports `applyCombatRosterCarryOver`,
    `healRosterMember`, and `raiseRosterMember`. Web combat-end HP/dead carry-over, camp Cure/rest
    healing, and camp Raise Dead now share the same source-shaped rule: unconscious members can be
    recovered by cure/rest, while permadead members are skipped by ordinary healing and can only be
    raised to 1 HP. Camp-cast Raise Dead now selects the first permanent-dead `deadStore` member, not
    merely the first `hp <= 0` roster member. Source anchors are documented in
    `docs/engine/research/combat-mechanics-coab.md`.
  - Source-shaped roster cleanup and Raise Dead helpers now cover the newly recovered edge cases:
    `cleanupCombatRosterAfterCombat` mirrors CoAB normal, duel, party-fled, and party-killed roster
    cleanup at pure-engine level; `raiseRosterMemberWithRules` accepts `dead || animated`, clears
    poison/animate state, decrements positive CON, rejects elf/`CON <= 0` only in spell mode, and
    intentionally keeps temple mode free of race/CON rejection.
  - Web camp-cast Raise Dead now calls the spell-mode rules helper and persists CON loss on success;
    web temple Raise Dead calls the temple-mode helper, does not reject elves/CON 0, and also persists
    positive-CON decrement. Focused e2e checks cover both live roster paths.
  - Tactical combat now separates exact-0 `unconscious` from negative recoverable `dying`.
    `damage_player` anchors in CoAB show exactly 0 HP -> `unconscious`, -1 through -9 -> `dying`,
    and -10 or lower (`damage >= hp_before + 10`) -> `dead`; Greybox mirrors that internally while
    keeping `conditionOf()` collapsed to `ok | unconscious | dead` for roster carry-over.
  - Gen1 tactical combat now carries CoAB `actions.bleeding` semantics: `dying` stores HP as 0 plus a
    `bleeding` counter, round-start `BattleRoundChecks` increments it, `> 9` becomes `dead`, and
    tactical `bandage` converts the first party-side `dying` member to `unconscious` while clearing
    bleeding. DQK/Gen2 bleeding-to-death is still left off because its death timing remains UNLOCATED.
  - Cloudkill is now a normal zone-only `TacticalSpell`, and DoK raw spell id 91 crosswalks to
    `m5-cloudkill`.
- Placement has a partial recovered implementation:
  - `packages/engine/src/combat/deploy.ts` mirrors CoAB `ovr011 PlaceCombatants`.
  - It covers formation placement, team direction, encounter distance, and start region logic.
  - `deployCoabSourceCombatants()` now preserves the recovered CoAB placement tables
    (`direction_165EC`, `direction_165FC`, `HalfDirToIso`, `unk_16610`, `unk_16618`, and
    `unk_16620`) and the final `CombatMap.pos` formula. This corrects the older over-broad claim that
    the first party combatant occupies local `(0,0)`: `(0,0)` is only `team_start_x/y`, while actual
    local candidates are table-derived. Focused engine tests now prove the east-facing table sequence,
    raw unclamped `encounter_distance`, and blocked-cell candidate probing.
  - Web combat now attempts that source-shaped placement for recovered CoAB 50x25 maps when every
    visible party/enemy combatant fits in the current terrain. It exposes `window.__combat.placementMode()`
    for verification. A focused browser probe over
    `window.__explore.testScriptSetupFight(3, 0x57, 2)` proves `placementMode="coab-source"`,
    `p1=(26,12)`, `e0=(46,13)`, and the recovered 50x25 background summary. Non-CoAB terrain or
    out-of-frame source placements fall back to the prior anchor/offset path.
  - CoAB multi-cell placement footprint shapes are now recovered at engine-oracle level from
    `coab_extracted/engine/ovr033.cs`: size `1` = one cell, size `2` = vertical 1x2, size `3` =
    horizontal 2x1, and size `4` = 2x2. `coabSourceFootprintCells()` exposes those shapes and
    `deployCoabSourceCombatants()` can consume `partySizes` / `enemySizes` to reject occupied or blocked
    source footprints during placement.
  - CoAB 422-byte monster/player records now decode `Player.field_DE & 7` at offset `0xde` into
    `MonsterRecord.coabSourceSize`, carry it through `monsterCombatant()` as `Combatant.coabSourceSize`,
    and feed it into web source-shaped placement. This remains separate from `combatSize` because the
    live tactical renderer/movement still uses a square footprint model while CoAB placement uses
    vertical, horizontal, and 2x2 source footprint shapes.
  - CoK and DoK source-size bytes are now mapped into the same source-footprint field:
    CoK CCH/monster size indicator `0xcf & 7`, and DoK compact size indicator `0x29 & 7`. This preserves
    the important high-bit distinction where raw `129` is a source footprint `1` but still a large-target
    / square-renderer `combatSize` of `2`.
- Combat geometry/mechanics have decompile-backed pieces:
  - Movement uses Gold Box half-step concepts; orthogonal/diagonal costs are tracked in research.
  - `packages/engine/src/combat/geometry.ts` covers combat-map reach and LOS primitives from `ovr032/033`.
  - `packages/engine/src/combat/tactical.ts` contains the live tactical engine.
- Monster data flow exists:
  - `MON1CHA.DAX` decoding feeds `MonsterRecord`.
  - Side tables such as `MON1SPC`, `MON1ITM`, and `MON1WIZ` are partially decoded and joined in later work.
  - `packages/engine/src/combat/encounter.ts` maps ECL `EncounterMonster[]` rosters to spawned combatants.
- ECL to combat flow exists in Greybox:
  - ECL VM queues monster groups and pauses on combat.
  - `SETUP_MONSTER` / `APPROACH` emit `EncounterSetup` approach state with current `distance`.
  - `DialogueRunner` exposes combat turns to the host and preserves the latest emitted `EncounterSetup`.
  - CoK/DoK web path: `SearchLocation`/dialogue runner -> roster -> `spawnEnemies()` -> `launchCombat()`.
  - CoK/DoK non-interactive web SearchLocation combat now keeps the paused runner until overlay `onEnd`,
    maps the real `CombatResult` to `victory` / `defeat` / `flee`, and resumes the same VM through
    `DialogueRunner.afterCombat(outcome)`.
  - CoK/DoK web combat now threads `EncounterSetup.distance` into `launchCombat` deployment when the
    script provides setup; DQK carries the same optional setup field through `CellEvent` and
    `launchDqkCombat`.
  - CoK/DoK and DQK web combat now pass live host `mapDirection` into `launchCombat`; recovered-distance
    terrain placement uses that direction for the enemy anchor, and the adapter converts it into the
    tactical engine's separate `Facing` convention for the party's initial facing.
  - CoK/DoK `SearchLocation` priming now also seeds Gen1 host map direction `[0xc04e]` from the live
    explorer facing (`0=N, 2=E, 4=S, 6=W`), matching the native `CCECL /F` bridge. This is host-state
    seeding for ECL branches, separate from the already-wired combat placement `mapDirection`.
  - `SURPRISE` now emits typed `EncounterSurprise` data and web combat launch preserves it through the
    CoK/DoK and DQK paths for inspection/host handoff.
  - DQK web path: `vmRun1` + `SearchLocation` over `ECL.GLB` -> roster -> shared combat overlay.
  - DQK web `vmRun1` / `SearchLocation` combat now also keeps the paused combat-producing runner until
    overlay `onEnd`; if `vmRun1` queues the fight, it resumes with outcome first and then runs
    `SearchLocation` on the same persisted area memory.
  - DQK Gen2 `PARLAY` (`0x2c`) has a recovered dialect-specific short frame: three mapped values plus
    destination, not the Gen1 five-values-plus-destination frame. Area 66 byte-proves this because the
    next byte after `PARLAY #35, c29:9, #0, [0x0022]` is the following `COMBAT` opcode.
  - DQK area 66 now has a shipped-script combat proof: real `ECL.GLB` subroutine `0x8398` queues
    `LOAD_MONSTER` groups `24x4, 36x1, 24x3, 61x2, 63x4`, pauses on PARLAY, resumes into `COMBAT`,
    and launches the shared web combat overlay through the DQK MONCHA resolver.
  - DQK now has a native DOS/ASM natural-step combat/resume proof:
    `docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md` records
    `native/gbdqk-combat-flow-test.ps1 -Headless`, where `GBBOOT /E /T 1 /A 5` starts from area-5
    pose `(0,1,north)`, steps to `(0,0)`, queues monster `0x002E x2`, prints `DRAGONS ATTACK!`,
    writes `_GBCOMB.RAW` / `_GBCR.BIN`, yields combat at area 5 PC `11D0`, and resumes native script
    state at area 5 PC `11DC`. `native/ccecl-dqk-combat-test.ps1 -Headless` now independently pins the
    same CCECL -> CCCOMBAT -> CCECL `/R` PC boundary. This proof uses Greybox's compact WGRD/CCGEO
    bridge for the native preview surface; it must not be read as proof that the native flow executed
    DQK's original `DungCom1` / `WildCom1` 50x25 map-population routine. The original terrain setup
    evidence remains the overlay-12 `[0xbedb]+9` / `BackGroundTiles` / HLIB render path above.
  - DQK area 23 now has a corrected encounter-state guard: descriptors 89/90 can queue monsters through
    `LOAD_MONSTER` and exit, while descriptor 18 no longer reaches or consumes `COMBAT` after the DQK
    Gen2 `0x1d` zero-operand correction. Greybox still supports a host-shared pending
    `encounterRoster` for scripts that later consume queued rosters, but area 23 is not currently that
    proof and is not a natural web-walk proof because the local DQK `GEO.GLB` has no decoded map id 23.
  - DQK loaded-GEO natural scan now pins the current local-data boundary: area 18 descriptor 157 and
    area 58 descriptor 162 are walk-reachable `COMBAT` gates, but follow-up tracing shows they are
    temple/service cells. They print Mislaxa/Reorx temple text, run `CLEARMONSTERS`, set `[0x0014]=1`,
    and then call `COMBAT`, so they should be researched as special host/non-monster dispatches rather
    than treated as proof of a missing wandering-monster roster.
  - DQK combat-entrypoint CFG scan is now documented in
    `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`. It corrects the older claim that area 66
    `SearchLocation` reaches `0x8398`: current CFG shows it does not. Area 5 is now the strongest DQK
    natural-step combat/resume proof; area 23 remains only a load-without-combat retention guard until a
    real later top-level `COMBAT` consumer is found.
  - Krynn Gen1 now has a retail SearchLocation combat proof:
    `docs/engine/research/gen1-retail-searchlocation-combat-proof.md` records CoK `ECL1/GEO1` block 34
    cell `(1,0)`, descriptor `129`, reaching `COMBAT` with roster `35x7, 38x2`. Engine and web e2e
    prove this retail cell launches the normal combat overlay and receives recovered 50x25
    `backgroundIds` from `buildCoabDungeonCombatMap()`. Browser e2e also now proves a no-teleport
    walk path from Greybox's current CoK default start `(14,10,north)` to a reachable retail combat
    cell `(3,15)`, descriptor `156`, roster `13x8, 35x5, 38x2`, using only normal
    `window.__explore.move()` calls.
  - Browser e2e now proves the CoK/DoK `resolveCombat(..., runner)` callback contract and the DQK
    `launchDqkCombat(..., runner, afterCombat)` callback contract with outcome-specific post-combat
    markers, plus the real area-66 shipped-subroutine roster launch.
- Binary pattern anchors exist:
  - `A battle begins...`
  - `is hit FOR`
  - `Hitting for`
  - `and Misses`
  - `DUNGCOM`, `DUNGCOM1`, `COMSPR`, `CPIC`, `CHEAD`, `CBODY`
  - See `docs/engine/research/pattern-match-report.md` and `docs/engine/research/combat-anchor-xrefs.md`.
- NWN DOS/AOL now has a focused combat-flow note:
  `docs/engine/research/neverwinter-nights-dos-combat-flow.md` records the native GBBOOT proof for
  seeded ECL7 combat, a natural area-1 GEO/ECL movement-to-combat route at descriptor 229, real
  `MONCHA.DAX` rosters, `_GBCOMB.RAW` combat snapshots, `_GBCR.BIN` result sidecars, and post-combat
  script resume. This is a native real-data handoff/resume proof, not a recovered NWN source
  equivalence proof.
- DQK now has a focused combat-flow note:
  `docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md` records the native GBBOOT proof for
  area-5 natural-step monster combat, real dragon encounter roster `0x002E x2`, `_GBCOMB.RAW` combat
  snapshot, `_GBCR.BIN` result sidecar, and post-combat script resume. This is a native real-data
  handoff/resume proof, not a recovered DQK map-population/source-equivalence proof.
- CoAB/CotAB is not complete just because the current reverse-engineering focus has moved to DQK.
  CoAB remains the strongest source-shaped anchor for early Gold Box combat-map setup and placement:
  the recovered dungeon core, wilderness builder port, placement oracle, and web/native smoke coverage
  are materially ahead of the later games. DQK is being investigated separately because it represents
  the later Gen2/UA-like branch, where the CoAB builder and assumptions must not be applied without
  binary/runtime confirmation.

## Known Gaps

- The exact original combat-area setup pipeline is not fully recovered beyond the CoAB dungeon
  `SetupDungeonFloor()` core, seeded `sub_370D3()` furniture pass, and engine-side
  `SetupWildernessFloor()` port now implemented in Greybox.
- `mapToBackGroundTile` population for CoAB dungeon floors is implemented, including random
  furniture/object placement when a d10 source is injected, but the original game RNG algorithm/state
  alignment is still not proved. Current `rollCoabDie()` / `rollCoabDice()` coverage verifies
  source-shaped dice consumption only.
- We do not yet know the exact routine chain that chooses dungeon/wilderness/random combat backgrounds for
  every encounter type.
- Wilderness combat-map setup (`SetupWildernessFloor`, `CityInfo`, RNG-driven groups/details) is now
  implemented in engine/tests and wired to live web wilderness combat when decoded Area1/SAVGAMA bytes,
  or the older explicit debug seam, supply `currentCity`. CoAB's natural source is the Area1 byte at
  offset `0x342` (`coab_extracted/Classes/Area1.cs:151`) loaded through `DataIO`, then copied into
  `gbl.current_city` during `SetupWildernessFloor()`; Greybox now has an engine decoder, a
  `SAVGAMA.DAT` wrapper decoder, and a web native-save read path for that record. The current bundled CoK
  save decodes as `gameArea=1,area2GameArea=1,inDungeon=1,currentCity=0`; the local played CoK cloud
  save decodes as `gameArea=3,area2GameArea=3,current3D=97,lastPos=(4,5),lastEclBlockId=98,inDungeon=1,
  currentCity=1`. Both are dungeon-mode. Greybox can now derive a deterministic source-layout wilderness
  fixture by patching a copy of the native save wrapper, and web e2e uses that derived wrapper for
  recovered 50x25 wilderness combat. A real original wilderness-mode Area1/save fixture is still needed
  before normal demo wilderness can use native current-city state without a patch/test seam.
- Exact GEO wall/door byte conversion is now mirrored for decoded Gen1 `GameMap` cells, but raw-plane
  roundtrip and cross-game binary equivalence still need proof.
- Gen2 / DQK combat-map setup and population routines need separate confirmation before claiming the
  CoAB builder applies there.
- CoAB source-shaped placement is now available as an engine oracle and is wired into live web 50x25
  recovered maps when the source coordinates fit inside the current terrain. The path now feeds decoded
  CoAB `field_DE & 7`, CoK `0xcf & 7`, and DoK `0x29 & 7` monster/player source-size bytes when they are
  present. Remaining placement work is party/source record size wiring where applicable, mapping
  equivalent DQK/Gen2 source-size bytes if they exist, reconciling the tactical engine's current square
  footprint model with CoAB's
  vertical/horizontal source footprints, dungeon wall-aware fallback direction wiring, and recovering the
  original offset/scrolling context for raw distance/direction combinations that still fall outside the
  web terrain frame and therefore use the anchor fallback.
- Temporary combat tile mutation has pure engine helpers, a live tile-state reducer, and web combat wiring
  for Stinking Cloud / Cloudkill spell ids, hazard exposure, round-start expiry, rendered `backgroundIds`,
  party downed-tile writes, CoAB cloud entry gates, Cloudkill HD-band poison/death behavior, and normal
  Cloudkill spell availability. Noxious-cloud cough/helpless exposure behavior is now implemented for the
  core CoAB save-success/save-failure paths, and source-shaped noxious/poison cloud immunity flags now
  cover the first protective-affect MVP. Cloud-protection affect-id mapping is now source-split for
  noxious movement entry, noxious post-entry exposure, and poisonous movement entry. A source pass found
  no separate CoAB poisonous post-entry protection gate beyond HD 7+ falling through. Remaining gaps are
  exact fleeing/status edge cases, exact duration/RNG alignment, and full Raise Dead/permadead fidelity beyond the current pure helper and
  web camp/temple wiring model: exact temple menu/text parity, temple max-HP recalculation after CON
  loss, exact status strings, and native/richer-status host wiring for callers that preserve more source
  state than the current public web roster.
- Binary equivalence is not proved for CoK/DoK/NWN/DQK combat-map population routines beyond existing
  string/table anchors. NWN has native real-data combat handoff/resume proof, but its combat-map
  population routines still need decompile/binary equivalence against the CoAB map builders.
- We need the precise ECL opcode/data path for:
  - `SETUP_MONSTER`
  - `APPROACH`
  - `LOAD_MONSTER`
  - `COMBAT`
  - surprise mechanics: the raw VM result is now typed and carried into web combat launch, but it remains
    unwired to tactical deployment/initiative/turn skipping until a verified host consumer is recovered
  - encounter distance and live host mapDirection are now wired through browser combat placement, but
    original surprise mechanics and cross-game binary equivalence still need source-backed confirmation
  - DQK browser live-cell proof that a shipped `vmRun1`/`SearchLocation` combat branch resumes with the
    actual overlay outcome. Native `GBBOOT /E /T 1 /A 5` now proves a natural-step non-empty combat/resume
    path, and the direct area-66 shipped subroutine is proven and browser-launched, but browser walking
    still lacks a decoded natural non-empty DQK map fixture. A descriptor-only scan over decoded DQK GEO
    descriptors with blank area memory still finds 0 non-empty rosters, so the normal web walk/SearchLocation
    gate into that or another encounter needs more host-state, RNG/ticker, or selector recovery. Area 23
    still exposes `LOAD_MONSTER` at `0xa981`, but the former `COMBAT` at `0x9cd2` was a stale
    Gen1-style `0x1d` decode and descriptor 18 now ends normally. Web fallback enemies are restricted to
    explicit demo calls and are not used for real empty ECL rosters. A natural browser fixture still
    needs a matching GEO map/source or the same monster-roster pattern in a loaded DQK map. The natural
    empty-roster gates in areas 18/58 should be tracked separately as temple/service `COMBAT` dispatches
    because they explicitly clear monsters before calling `COMBAT`.

## Documentation and Research Updates

- Documentation/research updates are required work, not optional cleanup. Each implementation or reverse
  engineering slice must end with an explicit docs pass before it can be considered done.
- When implementation or source recovery changes the model, update the relevant documentation/research
  files in the same slice. If the finding is a new subsystem, data layout, routine family, UI behavior,
  or cross-game difference, create a new focused research file immediately rather than burying it in
  scratch notes.
- Update this goal file whenever a recovered combat source path changes scope, invalidates a prior
  assumption, or adds a new open target.
- Update the nearest focused research note in the same work pass when new evidence is found. For the
  current DQK combat-entrypoint work, that file is
  `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`.
- Add a new research file when a new subsystem, data format, host variable family, binary routine group,
  combat UI/mechanics behavior, or cross-game difference is found and would make the existing notes
  misleading or too broad.
- Do not treat new files as optional cleanup. If a discovery is a new source family, file format, combat
  subsystem, or version-specific difference, add a focused note immediately and link it from the current
  source map.
- Link any new research file from this goal file and from the closest overview note, usually
  `docs/engine/research/combat-ecl-to-combat-flow.md`.
- Do not leave new research as temporary scratch output when it changes the source model. Promote it into
  `docs/engine/research/`, give it a focused name, record the source paths/offsets/test commands, and
  add links from the goal or overview files that future work is likely to read first.
- If a slice discovers something that is not just another detail of an existing note, add the new
  documentation/research file in the same slice instead of deferring it to a later cleanup pass.
- UI is not yet original-complete:
  - web combat now shows the recovered command menu order `Move View Aim Use Cast Turn Quick Done`.
    **SUBJECT NARROWED 2026-09-07: that row is CoAB's, and it is stated here without a title.**
    It was recovered from the CoAB decompile (`coab_extracted\engine\ovr009.cs:313-360`, cited
    correctly as CoAB in `combat-floor-ui-source-anchors.md:39`) and is right for CoAB and Pool
    of Radiance. It is **wrong for Champions of Krynn**, whose retail `GAME.OVR` at `0xB5BE`
    reads `Move / View Aim / Use / Cast / Turn / **Yell** / Done` with a second-tier
    `Guard / Delay Quit / Bandage / Auto Speed Exit` at `0xBF28` — CoK substitutes `Yell` for
    `Quick` and puts Guard/Delay/Bandage behind `Done`. It is wrong for DoK and DQK too, which
    use a flat two-row form (`Death Knights of Krynn/START.EXE` `0xE9DE`). Secret drops `Turn`;
    NWN uses `Zap`. See `combat-screen-plan-cok.md` §1.1 for the byte evidence and the
    per-title table.

    **And the UI does inherit the error — checked, not assumed.** `apps/web/src/ui/combat.ts:133`
    declares `const MENU_ITEMS = ['Move','View','Aim','Use','Cast','Turn','Quick','Done']` as a
    single module constant with **no per-title switch** (its only readers are the bar builder at
    `:1319` and the two arrow-key handlers at `:2693-2694`), while that same module loads
    `Champions of Krynn/SPRIT1.DAX`, `8X8D1.DAX` and `DUNGCOM.DAX` (`:127-130`). So the screen is
    CoK-skinned and shows CoAB's row: `Quick` where CoK has `Yell`, and CoK's second tier
    (`Guard / Delay Quit / Bandage / Auto Speed Exit`) absent rather than behind `Done`. Small,
    real, and browser-track — recorded here rather than fixed, because this file is the native
    track's note. The fix is a per-title table, which is what the native engine needs anyway.
  - web combat target mode now shows `Range = N` and `Next Prev Manual Target Center Exit`.
  - web combat `Manual` targeting now has a visible grid-cursor MVP: arrows move the cursor, `Target`
    confirms a reachable enemy under it, `Center` recenters, and `Exit` cancels. It is aligned with the
    recovered `ovr014.Target(...)` behavior but not full source parity.
  - web combat target mode now shows a selected-target combat summary in the side panel, with target
    name, HP, AC, weapon, and status from the same selected/manual target state that drives Aim. This is
    source-shaped from CoAB `CombatDisplayPlayerSummary(target)`, clears when manual cursor has no legal
    target, and no longer pretends the target is a party-list row. It is still not exact text-region
    parity.
  - web combat Move mode now shows `Move/Attack, Move Left = N` on the bottom prompt row while walking
    and `can't go there` on failed move attempts, source-shaped from CoAB `ovr009` move prompts.
  - web combat Move mode now supports an orthogonal occupied-cell bump-attack MVP: moving into an
    adjacent enemy during `party-move` resolves through the same attack path instead of attempting
    movement, source-shaped from CoAB `ovr009.sub_33B26 -> sub_33F03`.
  - web combat Move mode now accepts CoAB's eight Move/Attack direction keys
    `H/I/M/Q/P/O/K/G` = N/NE/E/SE/S/SW/W/NW, and diagonal occupied-cell bump attacks resolve through
    the same attack path.
  - web combat Move/Attack bump now also mirrors the CoAB ranged-only rejection for a readied bow:
    bumping an adjacent enemy with that weapon keeps the actor in Move/Attack mode and displays
    `Not with that weapon` instead of attacking or moving.
  - tactical movement now mirrors the CoAB `move_step_away_attack` ordering at MVP level: foes that
    threaten a mover's origin cell, but would not threaten its destination, get a `leaving` free strike
    before the move event is applied.
  - tactical Guard availability now follows the CoAB ranged-weapon menu gate at MVP level: pure missile
    readied weapons cannot ready Guard or spend the turn through direct guard application, while melee and
    thrown/ranged-melee-modeled weapons still can.
  - tactical ally attacks now have a CoAB-shaped confirmation MVP: normal target lists stay foe-only, but
    an explicit `allowAlly` action can melee/missile a same-side target after host/UI confirmation, and
    web regression seams prove unconfirmed attacks are no-ops while confirmed attacks damage/log normally.
    The engine now also carries MONCHA-backed `npcControlled` combatants and converts active
    NPC-controlled party-side combatants to enemy after a confirmed same-side attack, matching CoAB's
    `control_morale >= NPC_Base` hostility flip at MVP level. It exposes `allyAttackConfirmed()` as the
    `area2_ptr.field_666` analogue and `teamCounts()` as the active party/enemy count analogue of
    `CountCombatTeamMembers()`. Web manual target mode, non-manual target cycling, and Move/Attack bump
    now show a visible `Attack Ally:` `Yes No` prompt before invoking the confirmed attack path, and the
    web seam exposes the same confirmation/count state. The engine now also carries a narrow
    `actions.target` analogue (`actionTargetId` / `targetIntentOf(id)`): accepted target choices record
    intent, and confirmed ally-attack conversion clears that target intent for converted healthy
    NPC-controlled allies while leaving PCs/downed NPCs untouched.
  - web combat `Use` now has a source-shaped MVP: readied combat-use items route through the tactical
    spell path, emit `uses an item`, consume one stack unit, and end the actor action. The current Vial
    potion hook is provisional until real per-instance ITEM affect/charge bytes are retained.
  - web combat now exposes the tactical Bandage MVP: `B`, the `Bandage` button, and the e2e seam call
    the engine `bandage` action when a party member is `dying`, logging the conversion to
    `unconscious`. Exact conditional menu insertion/timing around CoAB `bandage(false)` remains open.
  - web combat `Quick` now has a per-actor MVP: it no longer resolves the whole battle, prefers a useful
    readied combat-use item, then drives only the current actor through the tactical AI until that actor's
    turn changes. Full-battle auto-resolve remains separate as `Auto`.
  - remaining UI/combat-control gaps are exact move-prompt row/clear timing, ranged-melee item
    distinctions beyond the current bow-vs-melee model, raw/full original action-struct parity,
    exact guard/readied-strike and leaving/free-attack eligibility for special weapons/statuses, exact
    `AttacksReceived`/direction-change handling, exact manual-mode prompt/menu timing, original
    eight-direction cursor mapping, exact `Aim:` prompt timing, exact `Use`
    item-menu/scroll/charge semantics, source-backed per-actor `Quick` ordering/interrupt semantics,
    side-panel text-region layout, exact target status strings, exact Bandage menu insertion/prompt
    timing, and target summary row/column/clear behavior.
- Some mechanics still need direct source reconciliation:
  - initiative setup
  - movement half-step accounting
  - terrain movement costs
  - height-based LOS
  - missile range/cover penalties
  - rear AC/backstab
  - morale/flee/surrender
  - treasure/outcome and XP handoff
- Cross-game differences are not fully mapped:
  - CoK / DoK / NWN likely share early compiled-source patterns.
  - DQK and UA-era games use later Gen2 structures and need separate confirmation.

## Research And Implementation Milestones

Each milestone includes documentation as part of its done state. A milestone is not done until it either
updates the existing research notes that the work changes, or adds a new focused file when a newly
recovered subsystem, data format, routine family, or cross-game difference would otherwise be hidden in a
catch-all note.

### 0. Documentation Discipline

Keep the documentation and research corpus current as part of the work, not as an afterthought:

- Update existing research files when a new finding corrects, narrows, or supersedes them.
- Add new research files when a newly discovered subsystem, routine, data format, or cross-game pattern
  does not fit cleanly into an existing document.
- When a finding is completely new to the repo, create the new research file in the same slice and link it
  from this goal plus the nearest overview, instead of burying it in a temporary note or terminal output.
- Treat new documentation files as part of the deliverable, not scratch notes: name them clearly, link them
  from the nearest overview/goal file, and keep them when they contain durable evidence.
- Add navigation links from the goal/source-recovery notes to any new research files so later work can find
  the new evidence without rediscovering it.
- When adding a new file, also update any stale nearby overview text so the new note does not contradict
  older research or disappear from the documented combat-source map.
- Link new implementation work back to the relevant research notes and source anchors.
- Record binary offsets, decompiled routine names, source file paths, test commands, and verification evidence.
- Mark uncertain findings as provisional instead of presenting them as recovered facts.
- Keep older notes honest: if a previous assumption is disproven, update it rather than leaving conflicting
  documentation behind.

Deliverable: every meaningful combat-source discovery has a durable repo reference, either by updating an
existing document or by adding a focused new research note.

### 1. Source Inventory

Inventory all primary combat sources:

- CoAB decompile files and routine names.
- FRUA/UA docs and forum-derived combat/event notes.
- Local CoK, DoK, DQK, NWN binaries and asset archives.
- Existing pattern reports and overlay carve manifests.
- Any available decompiled Curse/UA-related source references.

Deliverable: `docs/engine/research/combat-source-matrix.md` lists each combat subsystem, the best
current authority for it, the implementation/verification evidence, and the remaining source gaps.

### 2. ECL Encounter Flow

Recover the event-to-combat chain:

- Find how `SearchLocation` and `vmRun1` reach encounter setup.
- Decompile or annotate `SETUP_MONSTER`, `APPROACH`, `LOAD_MONSTER`, and `COMBAT`.
- Determine where encounter distance, surprise, side/facing, and monster groups are stored.
- Verify how combat outcome resumes script control and compare flags.

Deliverable: documented flow from ECL opcode stream to combat launch and back.

### 3. Combat Area Setup

Recover tactical map construction:

- Identify original `mapToBackGroundTile` allocation and fill routines beyond the recovered CoAB
  deterministic dungeon core.
- Determine how dungeon GEO walls/backdrops/doors become combat terrain IDs, including exact
  `WallDoorFlagsGet()` / `getMap_wall_type()` conversion from raw GEO bytes.
- Determine how wilderness/random encounters select `WILDCOM`/`RANDCOM`.
- Decode how walls, floor pieces, obstacles, random furniture, temporary cloud/downed-player mutations,
  and object-like tiles are placed/restored.
- Compare CoAB source with CoK/DoK/NWN/DQK binary anchors.

Deliverable: a decoded combat-area builder that emits `BackGroundTiles` ids, render tile ids, blocked
terrain, LOS/height metadata, and dimensions.

### 4. Party And Monster Placement

Recover placement semantics:

- Team start arrays.
- Facing and side direction.
- Encounter distance.
- Surprise effects.
- Multi-cell monster footprints.
- Occupied-cell collision and nearest-open fallback.

Deliverable: placement code that can be verified against CoAB `PlaceCombatants` and live scripted encounters.

### 5. UI And Layout

Implement authentic combat UI behavior:

- 7x7 viewport with scrolling.
- Original command labels and dispatch order.
- Move/attack prompt and movement-left text.
- Aim menu and target cycling.
- Side status panel.
- Combat log/text rows.
- Target summary and hit/miss/damage strings.

Deliverable: web/native combat preview visually and semantically matches the decompiled UI flow.

### 6. Mechanics Reconciliation

Audit and align tactical mechanics:

- Initiative.
- Movement half-steps and diagonal costs.
- Terrain costs and blocked cells.
- LOS/height checks.
- Melee/missile/cast/turn/use/guard/wait/flee.
- Morale, rout, surrender.
- Backstab/rear AC.
- Helpless/asleep/held states.
- Treasure/XP and post-combat result handling.

Deliverable: tests and implementation notes tying each mechanic to a decompiled source or documented gap.

### 7. Cross-Game Comparison

Compare combat source patterns across games:

- Pool/Curse/Secret/Gateway/Buck Rogers/CoK/DoK/NWN early engine binaries.
- DQK and later Gen2 binaries.
- Shared compiler/source-language signatures.
- Data layout changes between generations.

Deliverable: compatibility table for which recovered combat routines/data formats apply to which games.

### 8. Playable Verification

Prove the recovered pipeline in running builds:

- Web `?combat=mvp` shows terrain/background from recovered combat-area setup, not synthetic placeholders.
- A real script-triggered encounter enters combat mode with decoded monsters, names, icons, stats, and placement.
- Combat resolves and returns to exploration/script state.
- Native/DOS ASM path can render at least the same recovered combat map and roster in its preview/smoke mode.

Deliverable: repeatable tests/screenshots/traces demonstrating the end-to-end path.

## Immediate Next Step

2026-07-13 DQK tracer status update: the `20d7:094a` stop is now root-caused as a synthetic-DOS
memory-layout bug, not as original invalid DQK code. `TITLE.TLB` was being read over resident EXE bytes
because `PSP:[2]` and `INT 21h AH=4A` resize were modeled incorrectly. `tools/unicorn_dqk_trace.py` now
sets a DOS-like top-of-memory word, handles `AH=4A` as resize, logs `AH=48/49/4A` with
`--trace-dos-memory`, and supports targeted drift checks with `--watch-file-drift-after`. The route
baseline should return to `--load-seg 0x1000`; `--load-seg 0x2000` avoids the old overlap but leaves
DQK below its own memory requirement (`540000` required, `524544` available). The fixed
`--load-seg 0x1000` party-input-gated run reaches 12M instructions without the old code overwrite, but
still does not produce CA03 rows or prove the party/load route. The remaining DQK blocker is therefore
input/menu route fidelity or DOSBox-X debugger capture at the party/combat anchors, not
`20d7:094a` state corruption.

A follow-up repeat-watch pass now samples the fixed-memory route across repeated input/form polls. It
confirms that the run accepts the gated `SPACE` through live `364f:0079`, then stabilizes in a generic
widget loop with `dac0=0x0004`, `dac7=422e:db68`, callbacks
`[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, `a627=0x000a`, `c7d8=0`, and
`ca03=0`. The party-menu watches `25a4:3127` / `25a4:33c3` still never execute. The immediate DQK
branch-trace follow-up now proves that `364f:0079` itself is the normal overlay-4 active-form
key-return path for `SPACE`, not a hidden party-menu dispatch: it skips the `0x152` / `0x153`
special-key handlers, calls `1102:00c4`, and returns with `dac0=0`, `c7d8=0`, and `ca03=0`. The
caller-shell trace around `264f:03a2..03c3` then proves the current route is counting Space through
startup/resource pages: returned `AL=0x20` advances a local counter to `9`, returns to startup caller
`2d99:0701`, and only later reaches the generic widget form with the same non-party callbacks. A
follow-up DGROUP write trace now identifies the low-level generic widget chain:
`1aa6:11eb` allocates widget storage, `1aa6:1277` publishes the active buffer, `1aa6:127b/127f/1283`
write `dac9/dac7/dac0`, and `1aa6:1294` / `1aa6:134c` parse four resident `1bdb` form-definition
records to produce `dac0=4`, `dac7=422e:db68`, callbacks
`[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`. A later form-discriminator trace
(`build\dqk-load1000-1bdb-formmode.log`) adds that this is specifically the resident mode-`2` generic
form: `1d0c=2`, `a6b5=1`, `a627=0x000a`, `c7d8=0`, `ca03=0`, and the route enters
`1bdb:1008` / `DQK.EXE:0x00f1b8` with no `25a4:*` party/load hits and a header-only CA03 CSV. The
active DQK subgoal is therefore no longer "find the `dac0/dac7` writers", nor simply a late
form-mode setter: `1d0c=2` is loaded by `INT 21h/AH=3F` from `DQK.EXE@0x63a20` into `422e:0000`
before startup code enters overlay 4. Static setters exist (`0bdb:141e`, `0bdb:1410`), but the
focused `mode2-callers` runtime trace shows the current route bypasses them and reaches
`0bdb:0dcf -> 0bdb:1206 -> 0bdb:1008`. The `1206-callsite` trace narrows that to the `0bdb:1e29`
branch that calls `0bdb:1206` at file `0x010037` instead of calling `0bdb:0521` at `0x00fffd`.
The branch condition is now traced and the helper is identified: `00d7:2543` is a case-insensitive
string-equality wrapper, `DGROUP:3aee/3af0` points at `Press button or enter to continue`, and the
current route returns `AX=0` because the caller string is `Play Demo Quit`.

Superseding 2026-07-13 route update: the title/options blocker is now resolved. Raw BIOS key
`0x1950` selects uppercase `P` / `Play`, returns from the `Play Demo Quit` form with `AX=0000`, and
reaches the `25a4:*` party/load route including `25a4:3127`, `25a4:33c3`, and the Load Saved Game
case at `25a4:3664`. The next blocker was DOS file enumeration, so `tools/unicorn_dqk_trace.py` now
models minimal `INT 21h/AH=4E` and `AH=4F` over the game root plus `SAVE`/disk subdirectories and
writes a minimal DTA find-result record. With that in place, the route enumerates `SAVE\*.*`, finds
`SAVGAMA.QSV` and `VAULTA.DAT`, opens `SAVE\SavGamA.qsv`, then loads `DISK3\ECL.glb`,
`DISK3\GEO.glb`, and later DQK art/resource TLBs. The same run captures three live CA03 setter-watch
rows at canonical `25a4:1d47`: `op1=0xba, op2=0x03` at stream offset `b7f9=0x8277`, then
`op1=0xba, op2=0x07` at `0x8295` and `0x82d0`. The watch logs before instruction execution, so the
logged `ca03=0x0004` is the pre-write value. The active DQK gap is now to decode those stream contexts
and continue from loaded `ECL.glb`/`GEO.glb` into the `DungCom1` / `WildCom1` terrain setup consumers,
not to reach the title or party/load menu.

Follow-up in the same work slice: `--watch-ca03-operands` now dumps raw stream bytes as both a
straight-line physical view and a wrapped real-mode view. The wrapped view is the useful one for these
rows: `b7f9=0x8277` maps to `stream_wrap_phys=0x05b957`, `0x8295` maps to `0x05b975`, and `0x82d0`
maps to `0x05b9b0`, with ECL-like opcode/operand bytes. The straight-line view lands on code-like
bytes. A 40M-instruction consumer trace with watches on `28d0:0f14/0f25/0f2e/0f3e/0f47/0f6d/0f73`
and `2740:172c` still reaches only the three CA03 setter rows, not `DungCom1` / `WildCom1`. The next
DQK work is therefore two-pronged: decode the wrapped runtime stream rows, and find the missing
post-save route/input/state transition into the consumer/combat-terrain setup.

`tools/dqk_ca03_stream_decode.py` now decodes the wrapped windows reproducibly. The current rows decode
as city/Palanthas context (`SAVE #0,0x0039`, `PRINT "YOU CONTINUE INTO THE CITY."`, `PARTYSTRENGTH`,
`PICTURE #150`, `PRINTCLEAR "THE CITY OF PALAN"`, and a seven-item `HORIZONTAL_MENU` beginning
`PALACE` / `TEMPLE` / `HALL` / `SHOP`). This proves the setter route is still in a city/menu script
context, not combat terrain setup. Do not use these rows as combat consumer proof.

Follow-up journal-gate correction: `build\dqk-load1000-journal-gate.log` proves the loaded-save route
continues through the party "Begin Adventuring" case and reaches the real journal prompt draw entry
`26f8:008b` at instruction `13897005`. That older queued-key gate waited on
`1f4e:0be1`, so the final answer/input key was never released. The follow-up tracer work now dumps the
live journal prompt state and uses `journal-answer`; journal solving is no longer the live DQK route
blocker.

Implemented follow-up: the Unicorn tracer now dumps DQK journal prompt state from the original
`26f8:*` routine and supports a trace-only `journal-answer` fake-key token that expands from the live
expected-answer buffer `DS:c6f9`. The current deterministic route selects heading `"RUNNING AWAY"`,
word `5`, expected/typed answer `"FROM"`, then reaches the same three city/Palanthas CA03 rows. This
removes the journal prompt as the immediate DQK route blocker for research traces. It does not yet prove
combat terrain setup: the auto-answer run still does not hit `DUNGCOM.TLB`, `WILDCOM.TLB`,
`28d0:0f25`, `28d0:0f3e`, `2740:0846`, or `2740:172c` before the current cap.

Superseding Palanthas/Palace route correction: `gate-b7f9` now reads canonical DQK DGROUP `B7F9`, and
the working sequence places three Return prompts before `gate-b7f9:0x82d0:palanthas-menu`. The route
selects `PALACE` from the decoded Palanthas `HORIZONTAL_MENU`, but the earlier claim that it reached
ECL `COMBAT` at `0x8439` is now disproven. A filtered DGROUP trace shows DQK Gen2 opcode `0x1d`
advances as a zero-operand opcode, then `0x12` dispatches `PRINTCLEAR`; the byte `0x24` at `0x8439`
is the `PRINTCLEAR` inline-string length, not a top-level opcode. The durable correction is in
`docs/engine/research/dqk-palanthas-palace-combat-route.md`, and the DQK Gen2 framing exception is in
`docs/engine/research/ecl-gen2-dqk.md`. The next DQK source-recovery step is therefore not to follow
the Palace branch into COMBAT, but to locate or drive a different DQK path with a real top-level
`0x24` dispatch and then trace that handoff into tactical setup. The current candidate priority is
recorded in `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`: trace area 5 first because it
already has a native natural-step non-empty combat/resume proof, keep area 66 `0x8398 -> 0x83cb` as the
direct Gen2 PARLAY/roster regression, and treat areas 10/60/58 as static candidates until their live
entry paths are proven.

Follow-up correction: the staged area-5 original-`DQK.EXE` trace is not a positive original
combat-writer proof yet. The initial zero-filled `cell-writer-entry-file-02bcf0` rows were caused by
physical overlay aliasing: canonical `28d0:0000` mapped to physical `0x038d00`, but at runtime that
address was live party-menu code at `389c:0340`, not the overlay-12 `0x02bcf0` prologue. The tracer now
validates each `--dump-dqk-combat-map` watchpoint against expected `DQK.EXE` bytes and logs those hits
as `DQK-COMBAT-MAP alias-skip`; the validated 13M-instruction area-5 run writes zero dump rows. The
next DQK trace must therefore reach a byte-validated setup dispatcher/fill/store/renderer anchor before
any `[bedb]+9` artefact is accepted.

Follow-up tooling: `tools/unicorn_dqk_trace.py --watch-ecl-opcode 0x24` now logs writes of top-level
opcode byte `0x24` to canonical DGROUP `[b1c7]`, including the wrapped current stream bytes at
`[ae5c:ae5e]+[b7f9]`. A 15M-instruction Palanthas/Palace regression produced no `ECL-OPCODE` rows and,
after the armed surface-write fix, zero accepted combat-map dump rows. This is the desired negative
control: raw inline `0x24` bytes no longer count as COMBAT evidence, and generic writes through the
current `[bedb]` pointer no longer count as original map setup. The native area-5 oracle remains green:
`native\gbdqk-combat-flow-test.ps1 -Headless` and `native\ccecl-dqk-combat-test.ps1 -Headless` both
pass, proving the native `0x002E x2` dragon combat/resume fixture while leaving original-`DQK.EXE`
map-population recovery open.

Follow-up route-control tooling: `--fake-keys` now supports
`poke-dgroup8:OFF:VALUE[:LABEL]` and `poke-dgroup16:OFF:VALUE[:LABEL]`. These tokens write through
the tracer's canonical DQK DGROUP segment after any preceding wait/gate tokens release and are logged
by `--trace-keys`. This makes it possible to stage known original cursor globals or clearly labelled
synthetic route-control values after the route has reached a suitable live mode, then watch whether
original `DQK.EXE` advances into a real `0x24` dispatch and byte-validated combat setup/render
anchors. The poke itself is not completion evidence; it is only a way to control state for the next
original-runtime trace.

Correction for that staged route wording: GBBOOT/CCECL native `MEM[0023]`, `MEM[0111]`,
`MEM[0112]`, `MEM[00ca]`, `MEM[00cb]`, and `MEM[00cc]` are CCECL logical sparse-memory keys, not
original `DQK.EXE` DGROUP offsets. `native/src/ccecl.asm` stores them in the VM `mem_keys` /
`mem_vals` table, and `native/src/gbboot.asm` seeds them with `/0 addr value`. They remain useful
clean-room/native labels for the area-5 dragon fixture, but an original DQK Unicorn run must not poke
those offsets as if they were retail globals. Valid original-runtime probes should watch confirmed
DGROUP stream and combat globals such as `[ae5c:ae5e]`, `[b7f9]`, `[b1c7]`, `[bedb:bedd]`, and
`[ca03]`, plus byte-validated setup/render anchors.

Area-5 original-runtime regression: the latest 15M-instruction accessor-watch run added operand
details for `2033:0112` and `1D99:11CF`. It hit `2033:0112` eighteen times and `1D99:11CF` seven
times, and captured one `[ca03]` row near `b7f9=0x82d0`, but produced zero
`ECL-OPCODE opcode=0x24` rows, zero byte-validated setup/render hits, three expected overlay
`alias-skip` rows, and zero accepted `[bedb]+9` combat-map dump rows. That preserves the current
state: the native area-5 oracle is green, but original DQK has not yet been traced into the combat
handoff or tactical map population.

Area-18 save-resume regression: generated `SAVGAMA.QSV` fixtures patched to area 18, then to area 18
cell `(11,5)` with both the header mirror and documented flat-QSV resume block
(`@1024=11`, `@1025=5`, `@1026=2`) plus the journal-answer gate enabled, still do not drive original
`DQK.EXE` into combat. The 26M-instruction `build\dqk-area18-cell115-resume2-clean.log` run opened
`SAVE\SavGamA.qsv`, solved the journal prompt (`FROM`), but logged one city/menu `[ca03]` row at
`b7f9=0x82d0`, zero top-level `0x24`, zero combat setup/render hits, and zero accepted `[bedb]+9`
rows. Treat the tested QSV area/position/resume bytes as insufficient route control; the next
original-runtime DQK work must identify the selector that installs the target area/ECL stream after
save load, or use a natural route to the stronger area-5 candidate.

Correction: the old generated fixtures also left QSV `@21=0x04`, which is now known to be the
loaded-save ECL member selector, not a generic initiated flag. It lands at current-record `+0x16`,
then `[ae63]`, and then the `ECL1` member loader. Any future same-numbered area/member fixture must
pair `@18` with `@21`; otherwise the original runtime will reload member 4.

Follow-up correction for that regression: the QSV reader route-watch was using stale `1f4e:*` anchors.
The fixed-memory route maps `DQK.EXE:0x035a58` as canonical `2177:28f8` / live `3177:28f8`; the tracer
now logs QSV-backed state at `2177:*`. `build\dqk-qsv-state-resume2-2177.log` proves the patched
area18/cell `(11,5)` values are actually present in original runtime at the QSV reader
(`hdr@18=0x12`, `hdr@36=0x0b`, `hdr@37=0x05`, `res@1024..1028=0b,05,02,00,00`, `ae57=0002`). The
remaining gap is therefore the later consumer/copy path from `[b20f]+1+offset` and `c9f0..c9f4` into
active map/pose/ECL state, not whether the save patch reaches memory.

Follow-up static consumer slice: `docs/engine/research/dqk-qsv-save-transfer-consumers.md` now pins the
first consumer layer after the QSV reader. QSV `@18` lands at current-record `+0x13` and is passed to
the same `1D99:13B9` resource/context loader used by the live `0x0420ac` setter when saved `[ca03]` is
positive. QSV `@36/@37` land at record `+0x25/+0x26`, which `DQK.EXE:0x043c07` snapshots, moves,
clamps to `x=0..0x25` / `y=0..0x0e`, and later draw helpers consume as coordinates. The flat
`c9f0/c9f1/c9f2` bytes are now classified as active x/y/facing-like globals with refreshed lookup caches
`c9f3/c9f4`; `DQK.EXE:0x043a6a`, `0x043b26`, and `0x043dc5` validate, mutate, and render from those
globals. `ae67/ae57` are now classified as previous/current mode words; `DQK.EXE:0x031b9e` restores
`ae57` from QSV-backed `ae67` and is the strongest post-load mode-transfer candidate. This still does
not prove tactical setup: none of these consumers touch `[bedb]+9`, `DungCom1`, `WildCom1`, or the
byte-validated combat setup/render anchors.

Runtime follow-up for the same consumer slice: `--watch-dqk-save-transfer` now instruments those
post-QSV anchors with byte validation. The area-18 resume2 baseline hits the `2177:2b46` post-load
gate with `ca03=0xfef0`, so the signed `jle` skips the `+0x13` resource/context loader. A synthetic
positive-control copy patched to QSV `ca03=0001` reaches `2177:2b51` and `2177:2b56` and passes
`AX=0x0012` from record `+0x13` to the `1D99:13B9` loader. This proves the gate but remains a
route-control experiment, not combat setup proof.

Dispatch follow-up for the same slice: `docs/engine/research/decompile-dqk-ecl-dispatch.md` now records
a credible static DQK ECL stream-dispatch / operand-advance candidate at `DQK.EXE:file 0x041645`. It
reads the current byte from `[ae5c:ae5e]+[b7f9]`, stores it in `[b1c7]`, indexes `opcode - 1`, and
jumps through a CS-relative table. A provisional table-base interpretation maps `0x24 COMBAT` to a
shared zero-operand/advance landing, but this is not yet the recovered COMBAT handler. The focused
Palanthas/Palace runtime watch on `25a4:1275` still did not hit the candidate dispatch. The
`25a4:14ce` candidate did fire twice, but only early in the route (`b7f9=0x802b` / `0x803d`), so it is
now a live shared ECL/control fragment rather than a COMBAT-specific proof. The known CA03 writer at
`25a4:1d47` still hit around `b7f9=0x83ae` and `0x8498`. The tracer now logs canonical ECL stream state
as `ecl=b1c7:<last-opcode> cur:<current-byte> at:<stream-seg>:<cursor>`. The next DQK task is to use
that field plus `--watch-ecl-opcode 0x24` at a proven real top-level `0x24` stream offset, then trace
from the live handler into the tactical setup decision.

Static ECL boundary follow-up: `tools/dqk_ecl_combat_scan.py` now makes the top-level-vs-inline-byte
distinction reproducible for DQK `ECL.GLB`. On the current retail archive it finds `3252` raw `0x24`
bytes but only `35` decoded entry-reachable instruction-boundary `COMBAT` rows after the scanner was
corrected to mirror CCECL's dynamic/nonlocal `GOTO cc0:0` fallthrough behavior. The scan re-confirms
that Palace `0x8439` is an inline `PRINTCLEAR` length, not a COMBAT opcode, and narrows stronger
entry-reachable encounter-shaped rows to candidates such as native area 5 `0x91cf`, area 32 `0x939e`,
area 39 `0x9ff2`, area 58 `0x9967`, area 59 `0x8a3c`, and area 60 `0x9b71`; direct/static proofs such
as area 66 `0x83cb` remain separate evidence classes. `tools/unicorn_dqk_trace.py` now also has
`--stop-on-ecl-opcode` and `--stop-on-dqk-combat-map-hit`, so the next long area-5 original-runtime
trace can halt at the first logged top-level `0x24` or first accepted byte-validated `[bedb]+9`
snapshot instead of running blindly to an instruction cap.

Latest area-5 original-runtime correction: that long stop trace has now been run against
`build\dqk-area5-save-trace\DQK.EXE` as `build\dqk-area5-route91cf-stop.log`. It reached the
loaded-save path, opened `SAVE\SavGamA.qsv`, solved the journal prompt with `FROM`, and then waited
for `gate-b7f9:0x91cf` while the live stream was still near `b7f9=0x82fe`. It ran to the full
60M-instruction cap, logged one city/Palanthas `[ca03]` row at `b7f9=0x82d0`, logged zero top-level
`ECL-OPCODE opcode=0x24` rows, and produced only the header row in
`build\dqk-bedb9-area5-route91cf-stop.csv`. This means area 5 is still a green native/CCECL oracle and
static ECL target, but the generated loaded-save fixture has not proven the original `DQK.EXE`
combat handoff. The remaining original-runtime gap is target area/ECL stream selection or a natural
route, not title/menu input, file enumeration, journal answering, QSV/current-record transfer, or
stop-hook plumbing.

Latest save-transfer correction: `tools/unicorn_dqk_trace.py` now has
`--watch-current-record-write OFFSET[:LABEL]` and accepts overlay-6/overlay-7 file-offset aliases for
the reused `25a4:*` runtime segment. The area-5 16M rerun in
`build\dqk-area5-record-transfer-16m.log` proves `SAVGAMA.QSV` is copied into the live current record:
the INT 21h read writes `rec+13=0x05`, `rec+24=0x00`, `rec+25=0x00`, and `rec+26=0x00`; the QSV reader
then reports `hdr@18=0x05`, `@21=0x04`, `@31=0x06`, `@33=0x01`, `@36=0x00`, `@37=0x00`,
`res@1024..1028=0x07,0x0d,0x00,0x00,0x00`, `ae67=0x0004`, and `ae57=0x0002`; and the post-load gate
preserves `rec+13=0x05` with active pose-like globals `c9f0=0x07`, `c9f1=0x0d`, `c9f2=0x00`. The same
run accepts `25a4:3756` as overlay-7 `DQK.EXE:0x047f06`, showing the resident/mode loop with
`ae57=0x0004`. This removes QSV copy/current-record transfer as the suspected area-5 failure layer,
but it still does not prove original DQK combat-map population: the only `[ca03]` row is still the
Palanthas/menu context at `b7f9=0x82d0`, and no top-level `0x24` or accepted `[bedb]+9` map dump has
been captured.

Latest static CFG correction: `tools/dqk_ecl_combat_scan.py` now prints HLIB absolute file offsets for
COMBAT rows, including `area=005 member=005 combat=91cfh offset=0x11cf file=0x006a2f`,
`area=058 member=038 combat=9967h offset=0x1967 file=0x057137`,
`area=059 member=039 combat=8a3ch offset=0x0a3c file=0x058e96`, and
`area=060 member=040 combat=9b71h offset=0x1b71 file=0x05cc09`. Area 5 is now entry-reachable in the
static scanner through CCECL-compatible dynamic/nonlocal `GOTO` fallthrough. Area 58 is a local-GEO
descriptor-162 temple/service gate and a good opcode/handler target, but it clears monsters before
`COMBAT`. Area 59/60 are real header-CFG top-level candidates, but the current local `GEO.GLB` lacks
map ids 59 and 60. Keep 58/59/60 as static/route candidates until another map source or transition
makes them natural proof of the desired combat handoff.

Latest area-58 original-runtime correction: `build\dqk-area58-desc162-runtime.log` patched the staged
save route to area 58, cell `(17,15)`, flat pose bytes `17,15,3`, and ran the same current-record,
opcode, setup/render, and combat-map watches. It proves the QSV/current-record transfer for area 58
(`rec+13=0x3a`, `rec+25=0x11`, `rec+26=0x0f`, `c9f0=0x11`, `c9f1=0x0f`, `c9f2=0x03`) but still logs
zero top-level `ECL-OPCODE opcode=0x24`, zero byte-validated setup/render hits, and only the header row
in `build\dqk-bedb9-area58-desc162.csv`. The focused mode-selection rerun
(`build\dqk-area58-mode-selection-15m-r2.log`,
`build\dqk-ca03-watch-area58-mode-selection-15m-r2.csv`) narrows that failure further: QSV loads
`ae67=4`, `ae57=2`, and `ca03/ca05=fef0`; post-load clears current mode at `2177:319d` /
`DQK.EXE:0x0362fd`; overlay 7 sets mode 4 at canonical `25a4:3722` / live `389c:07a2` /
`DQK.EXE:0x047ed2`; the known overlay-7 loop at `25a4:3756` / live `389c:07d6` then has `ae57=4`;
and `25a4:0024` runs the byte-validated `b7f9=0x8000` reset body (`DQK.EXE:0x038075`,
`0x03825a`, or `0x0402e4`). The only later `[ca03]` row is still the Palanthas/menu stream
(`b7f9=0x82d0`, `op1=0xba`, `op2=0x07`, `stream=5b6e:8000`), not area 58's static `0x9967`.
Therefore the loaded-save blocker is now specifically the selector that installs the target
area/ECL stream and reaches top-level `COMBAT`, not QSV byte loading, current-record copy, or the
generic mode-2 to mode-4 rebuild.

Latest selector correction: `build\dqk-area58-selector-15m.log` adds explicit DGROUP watches for
`[ae5c:ae5e]` and resource-helper stack probes. The only watched stream-pointer installation before
the first CA03 row is the startup/current buffer (`35de:0074 [ae5e]=5b6e`, `35de:0078 [ae5c]=0000`,
`35de:0083 [ae5c]=8000`); no later watched write retargets the active stream to area 58. The
post-clear HLIB open is `gen`, the post-reset HLIB open is `PICB1`, and the route takes
`10b2:00e4` rather than the watched-but-absent `10b2:02d3` branch. Runtime follow-up confirms
`DQK.EXE:0x032ded` / canonical `1f4e:1ebd` as the loaded-save ECL member-selector chain: it computes
`[ae63]` from current-record `+0x16`, calls `1d99:137d` and `1d99:1373`, and then the overlay-6 loader
at `DQK.EXE:0x0403d8`, which calls `1fc4:0130` with DS:`773e` (`"ECL1"` at
`DQK.EXE:0x06b15e`) and the caller member id.

`build\dqk-area58-selector-ecl-loader-0118-15m.log` corrects the live watch address for that loader:
file `0x0402c0` is loaded at live `35a4:0000`, so `DQK.EXE:0x0403d8` is canonical `25a4:0118` in this
route. The old area-58 fixture reaches `1d99:137d` with `[ae63]=0x04`, current-record `+0x16=0x04`,
`+0x22=0x01`, `+0x24=0x00`, and `stream=5b6e:8000`, then calls the loader; `1d99:1373` then enters
the reset body, and the later CA03 row remains on `5b6e:8000`. The paired patched fixture
`build\dqk-area58-desc162-eclmember58-save-trace` changes both QSV copies at `@21` to `0x3a`, and
`build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` reaches `1d99:137d` / `1d99:1373` with
`rec+16=0x3a`, `[ae63]=0x3a`, and `cx=0x003a` at the member-load watch. It writes zero CA03 rows before
the 15M cap. The next DQK probe should therefore start after correct member selection and find a route
to a real top-level `0x24` or byte-validated combat-map setup hit.

2026-07-13 follow-up: the corrected area-58 member-selection route is now bounded more tightly.
`build\dqk-area58-eclmember58-route30m.log` runs original `DQK.EXE` for 30M instructions with
`@18=0x3a` and `@21=0x3a`; it reaches the member selector and ECL1 loader with `rec+16=0x3a`,
`[ae63]=0x3a`, and `cx=0x003a`, but writes zero CA03 rows and zero byte-validated combat-map rows.
Static inspection of the loaded member's entry (`dqk_ecl_combat_scan.py --inspect-area 58
--inspect-vaddr 0x8014`) explains the negative: `0x8014` compares `#58` against host memory
`0x0016`, then `IF_EQ` exits at `0x801b`. Since the resumed record already has `mem[0x0016]=58`,
loaded-save initial entry exits before descriptor-162 logic. The known area-58 `COMBAT` at
`0x9967` remains a `SearchLocation`/cell-descriptor target, not the member's initial-entry target.
`build\dqk-area58-eclmember58-postkeys26m.log` adds post-journal exploration/search/movement keys
and consumes them all, but still produces zero `ECL-OPCODE opcode=0x24`, zero CA03 rows, and zero
accepted combat-map rows. The next DQK original-runtime task is therefore to identify the actual
input/movement path that invokes `SearchLocation` for descriptor 162, or stage the save one step
before `(17,15)` so original movement enters the descriptor cell.

Follow-up tooling now makes that adjacent-cell probe reproducible instead of ad hoc:
`patchDqkSaveResumeArea()` accepts `position` and raw DQK `facing`, writing both `@36/@37` and
`@1024/@1025/@1026`, and `tools/build-dqk-dir.mts` exposes the same fields as `--save-ecl-member`,
`--save-x`, `--save-y`, and `--save-facing`. The first copied adjacent fixture
`build\dqk-area58-desc162-adjacent-west-save-trace` staged `(16,15)` facing east, but
`build\dqk-area58-adjwest-up34m.log` consumed only `2/18` fake keys, never opened
`SAVE\SavGamA.qsv`, and therefore is only a route-control negative, not a descriptor-162
SearchLocation negative. The next probe must first reproduce the known-good save-load/journal route,
then drive one movement step from the adjacent cell.

`build\dqk-area58-adjwest-fastkeys24m.log` now performs that stronger adjacent probe. It reaches
`SAVE\SavGamA.qsv`, copies the staged current-record bytes (`rec+13=0x3a`, `rec+16=0x3a`,
`rec+25=0x10`, `rec+26=0x0f`) and flat pose bytes (`c9f0=0x10`, `c9f1=0x0f`, `c9f2=0x01`), solves the
journal prompt, executes the same initial-entry `COMPARE #58` / `IF_EQ` / `EXIT` branch at
`8014h..801bh`, and consumes the queued `up` key (`0x4800`) after journal. It still records zero
top-level `0x24` rows, zero CA03 rows, and zero accepted `[bedb]+9` combat-map rows. This moves the
remaining DQK blocker from "could not reproduce adjacent save-load" to "post-load movement/input is not
yet proven to invoke SearchLocation for descriptor 162." The next original-runtime work should watch the
movement/SearchLocation dispatcher around the live descriptor/facing/area bytes (`[0x002d]`,
`[0x0011]`, `[0x001b]`) and the pose transition after `0x4800`, instead of only watching the later
COMBAT/setup hooks.

`build\dqk-area58-adjwest-cellwatch24m.log` adds those descriptor/facing/area write watches. Its only
write to `[0x0011]`, `[0x001b]`, or `[0x002d]` is the early resident bulk load from
`DQK.EXE@0x63a20` before runtime setup; there are no later writes after QSV load or after the consumed
`up` key. It again consumes all fake keys, preserves the staged pose, and produces zero `0x24`, zero
CA03, and zero combat-map rows. The next DQK task is therefore not another broad adjacent-save trace;
it is finding the concrete post-journal input handler/exploration walker that receives `0x4800` and
mapping why it does not reach the movement/SearchLocation state mutation path.

`tools/unicorn_dqk_trace.py` now has `--watch-dgroup-read`, `--watch-dgroup-read-limit`, and
`--watch-dgroup-read-after` for that specific follow-up. The intended full probe is the same adjacent
area-58 route plus read/write watches on `[0x0011]`, `[0x001b]`, and `[0x002d]`, with the read watch
gated to the post-load input window (for example `--watch-dgroup-read-after 14800000`). A smoke run
`build\dqk-readwatch-resident-smoke.log` confirms the logger emits `DGROUP-READ` rows with reader
CS:IP, instruction text, bytes, aliases, and DQK state summary. Use this to separate three cases:
the `up` key never enters the exploration walker, the walker reads different state than the staged
QSV pose, or the walker reaches the descriptor/facing/area reads but branches away before
`SearchLocation`.

`build\dqk-area58-adjwest-readwatch24m.log` was the first full read-watch attempt, but it is not
interpretable as a post-load movement negative: it hit the 24M instruction cap without QSV-route
evidence, without the `0x4800` key-consumption line, without post-`14800000` `DGROUP-READ` rows, and
with zero CA03 / combat-map rows. Rerun the adjacent route with the same read watches after restoring
the known-good route-control behavior from `build\dqk-area58-adjwest-cellwatch24m.log`.

That rerun is now split into two useful probes. `tools/unicorn_dqk_trace.py` lazily arms
`--watch-dgroup-read` and range-limits it to the watched DGROUP clusters; this avoids the global
read-hook route break. `build\dqk-area58-adjwest-rangedread17m.log` reproduces the good route, arms the
read hook at instruction `14800000`, consumes `up` at `14849408`, consumes all fake keys, and records
zero reads of `[0x0011]`, `[0x001b]`, or `[0x002d]` before the 17M cap.
`build\dqk-area58-adjwest-poseread17m.log` adds `[0xc9f0]`, `[0xc9f1]`, and `[0xc9f2]` pose-mirror
read watches and still records zero post-load reads. This means the current post-journal key path is
not reaching movement, SearchLocation-state, or pose-state consumers.

The next concrete DQK runtime anchor is the form callback path after the `0x4800` read:
`2102:00d1 -> 2c4c:0053 -> 251e:00dc -> 10d7:005c`, then
`2102:00e7 -> 2c4c:0002 -> 22b7:235f`, `2102:00f3 -> 2c4c:005f`, and
`217e:003b CALLF_IND [DGROUP:ca23 / phys 0x04ed03] -> 2fe9:0006 -> 1bdb:036c`. The next original
runtime task is to trace that callback/form owner and find the transition from this post-journal form
back to the real exploration walker.

Continue the ECL-to-combat and area-setup integration:

1. Follow binary anchors around `A battle begins...`, `DUNGCOM`, `Load24x24Set`, `BackGroundTiles`, and
   command/aim menu strings.
2. Decompile or annotate the remaining routines that mutate or extend `mapToBackGroundTile`: random
   dungeon furniture RNG alignment, finding a real original wilderness-mode `SAVGAMA.DAT`/Area1 fixture
   for web wilderness host-state instead of relying on the derived
   `__wild.setCombatHostFromNativeSavgamaPatch(...)` fixture seam or the older explicit
   `__wild.setCombatHost` debug seam (current local scan is documented as a negative in
   `docs/engine/research/combat-source-matrix.md`: the DOS candidates are dungeon-mode and Amiga
   candidates are endian/layout-different), RNG host-state alignment for wilderness/random passes, DQK
   Gen2 combat TLB/HLIB realization after the initial overlay-12 `DungCom1`/`WildCom1` xref pass:
   `lcall 0x104c:0x0007` is now annotated as file-group setup through `0x09a4:0x01dc` /
   `0x09a4:0x0b8c` at `DQK.EXE:0x0c01c` / `0x0c9cc`; the followed
   `0x1796:0x0536 -> 0x161b:0x00b1` branch is palette/header realization, so the separate downstream
   renderer-side routine is now pinned at `DQK.EXE:0x02ba4c`; `0x09a4:0x0515` now proves flat member
   indexing inside the selected group, and the Dung/Wild group-selection callback now proves
   `[0xca03]` is the primary master-set key while the filename suffix is a fallback/cache component.
   The native member-byte and decoded-label check is now implemented for native-valid DQK rows, the
   reserved member-zero palette/color-table behavior is pinned for DUNGCOM/WILDCOM leaf 1, the 7x7
   render-dispatch path into `0x02ba4c` is pinned, the `0x2033` parser/accessor body is pinned at
   `DQK.EXE:0x031d33` / `0x031e32`, and operand `1` is narrowed to the `1D99:13B9` combat-art/GEO
   resource loader path at `DQK.EXE:0x061bc3`. `tools/unicorn_dqk_trace.py --watch-ca03-operands`
   now automates the dump when real execution reaches those anchors, and the base tracer now models the
   VGA retrace port, DOS memory resizing, `SAVE\*.*` enumeration, title `Play` selection, loaded-save
   start, journal answering, and Palanthas menu gating. The current positive DQK route uses
   `journal-answer`, three intervening Return prompts, and `gate-b7f9:0x82d0` to select `PALACE`, but
   it is now classified as narrative/menu flow, not combat flow. The remaining DQK source gap is no
   longer the title/options form, save-load route, journal prompt, or first CA03 setter. It is finding
   and tracing a real native Gen2 `COMBAT` handoff into tactical setup: locate a true top-level `0x24`
   dispatch, then capture firm
   gameplay/editor labels for the operands that feed `[ca03]` and resource selection, reconcile
   selected-leaf visual samples against native screenshots/contact sheets, plus
   cloud duration/RNG and
   host-affect timing beyond the current source-split entry/exposure gates, remaining
   Raise Dead/permadead fidelity beyond the current helpers (temple max-HP recalculation, exact
   menu/status text, native richer-status wiring), and cross-game population variants.
3. Keep expanding the script-triggered Krynn Gen1 dungeon-combat regression coverage. Real CoK
   `SearchLocation` cells now prove both the retail descriptor/roster path into the web combat overlay
   with recovered `backgroundIds` and a no-teleport browser walk path from Greybox's current default
   start to a reachable retail combat cell. Remaining Gen1 proof gaps are original SSI entry/start
   recovery, broader cross-game coverage, and binary-equivalence coverage, not the basic retail
   ECL-to-overlay handoff.
4. Keep the research corpus current as implementation discoveries land: update existing docs when they
   become stale, and add new focused research files when a newly recovered system, data format, or
   cross-game difference does not fit cleanly in the current notes. Link those files from this goal or the
   nearest relevant index/research overview. This includes promoting new decompile offsets, binary
   anchors, data layouts, and cross-game differences into durable docs in the same work slice rather than
   leaving them only in chat, temporary scratch files, or terminal output.

## Completion Criteria

This goal is complete only when the following are all true:

- The source/decompile references for encounter launch, area setup, placement, UI, and mechanics are documented.
- Documentation and research notes are up to date with the final implementation and no known obsolete combat
  assumptions are left uncorrected.
- Newly discovered combat systems, file formats, or cross-game differences have their own research files
  when they are substantial enough that appending to an existing note would hide important detail.
- The recovered terrain/background setup can build a combat map from real game context.
- Web combat preview and Krynn Gen1 script-triggered dungeon combat use that recovered map setup.
- Script-triggered combat uses decoded encounter rosters and returns control to the script/explorer.
- Tests or runtime verification prove the flow with real local game data.
- Remaining unknowns, if any, are explicitly scoped as future work and do not block the recovered end-to-end MVP.
