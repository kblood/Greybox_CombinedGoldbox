# Combat Tile-Bank Load24x24 Cross-Game Evidence

This note records the concrete combat floor tile-bank loader evidence across the old Krynn/NWN engines
and DQK Gen2. It complements the CoAB source note: CoAB names `SetupGroundTiles()` and
`Load24x24Set()`, while this note pins retail binary call arguments and asset shapes.

## Old-Engine Loader Triplets

The old-engine call shape appears as three byte-sized pushes before the same far-call pattern. The
arguments are interpreted in the CoAB source order as `blockId`, `destCellOffset`, and `cellCount`.

| Game | Offset | Bank | Arguments | Asset count |
|---|---:|---|---|---:|
| CoK | `GAME.OVR:0xf1e4` | `DUNGCOM.DAX` | `(1, 0, 0x19)` | 25 |
| CoK | `GAME.OVR:0xf203` | `WILDCOM.DAX` | `(1, 0, 0x21)` | 35 |
| CoK | `GAME.OVR:0xf220` | `RANDCOM.DAX` | `(1, 0x22, 0x06)` | 6 |
| DoK | `GAME.OVR:0xce73` | `DUNGCOM.DAX` | `(1, 0, 0x19)` | 25 |
| DoK | `GAME.OVR:0xcea3` | `WILDCOM.DAX` | `(1, 0, 0x26)` | 38 |
| NWN | `GAME.OVR:0xe04c` | `DUNGCOM`/wilderness-shaped call | `(1, 0, 0x21)` | see below |
| NWN | `GAME.OVR:0xee4f` | `DUNGCOM.DAX` | `(1, 0, 0x19)` | 26 in each local block |
| NWN | `GAME.OVR:0xee71` | `RANDCOM.DAX` | `(1, 0x22, 0x06)` | 6 |

The NWN local `DUNGCOM.DAX` archive has six 24x24 tile blocks, each with count 26. The local NWN folder
has `RANDCOM.DAX` but no `WILDCOM.DAX`, so the `0xe04c` `(1,0,0x21)` call needs routine/context
reconciliation before treating it as a normal wilderness bank load.

DoK is a concrete per-game divergence: the local DoK folder has `DUNGCOM.DAX`, `WILDCOM.DAX`, and
`COMSPR.DAX`, but no `RANDCOM.DAX`, and the current pattern report has no DoK `RandCom` string.

## DQK Gen2 Comparator

DQK does not expose the same old-engine DAX call pattern. Its current Gen2 evidence is:

- `DQK.EXE:0x697c2` = `DungCom1`, DGROUP offset `0x5da2`.
- `DQK.EXE:0x697cb` = `WildCom1`, DGROUP offset `0x5dab`.
- `DQK.EXE:0x2cc1a`: `mov ax,0x5da2; push ax; lcall 0x104c:0x0007`, with surrounding arguments
  `0x19, 0, [0xca03]`.
- `DQK.EXE:0x2cc33`: `mov ax,0x5dab; push ax; lcall 0x104c:0x0007`, with surrounding arguments
  `0x27, 0, [0xca03]`.
- `lcall 0x104c:0x0007` maps to file `0x128c7` and has exactly two raw call sites in local `DQK.EXE`:
  `0x2cc1e` and `0x2cc37`.
- The wrapper forwards the file far pointer and `[0xca03]` through `lcall 0x09a4:0x01dc`
  (`DQK.EXE:0x0c01c`), then calls `0x09a4:0x0b8c` (`DQK.EXE:0x0c9cc`) through temp far pointer
  `[0xc5d4]`. This proves a narrow DQK combat tile-bank wrapper candidate, not yet old-engine copy-loop
  equivalence.
- The extra `0x19` / `0x27` bytes land at wrapper stack slot `[bp+0e]`, but the wrapper does not read
  that slot. `[bp+0c]` is the conditional value copied into `[0x3ab4]`, and `[bp+0a]` is the
  group/block value forwarded to `0x09a4:0x01dc`.
- Current disassembly makes `0x09a4:0x01dc` look like generic TLB/HLIB file-group setup: it frees an
  existing output pointer, allocates a six-byte group record, recognizes trailing digits such as
  `DungCom1`, and formats names through `%s.tlb` / `%s%d%03d` / `%s%d` strings. `0x09a4:0x0b8c` takes
  the resulting group pointer and realizes/installs library graphics/palette/header data through HLIB
  helper calls. Neither routine currently looks like a `cellCount * bpp` tile-copy loop.
- The downstream HLIB realization path is now pinned one step further: `0x09a4:0x0b8c` validates/counts
  the resolved library item through `0x193f:0x033d` (`DQK.EXE:0x1bb2d`) and then calls
  `0x1796:0x0536` (`DQK.EXE:0x1a296`). That routine validates item type low-nibble `8`, decodes
  table payload fields, and calls `0x161b:0x00b1` at `DQK.EXE:0x1a39f`; the callee starts at
  `DQK.EXE:0x18661` and updates palette tables around `DS:0xd145` / `DS:0xd445` from compact RGB byte
  triples, marking dirty bits around `DS:0xd0c5`. Nearby `0x161b:0x000b` initializes those palette
  tables and `0x161b:0x0455` flushes dirty palette ranges.
- `DQK_ART_LAYOUT` maps `DUNGCOM.TLB` to 136 images and `WILDCOM.TLB` to 160 images. Those are HLIB/TLB
  Gen2 banks, not DAX blocks, so the old-engine `cellCount` values should not be copied across without
  proving the DQK routine semantics.
- The real DQK master-set layouts are also now pinned for renderer verification: `DUNGCOM.TLB` contains
  five leaf sets with `26, 26, 26, 26, 32` images, and `WILDCOM.TLB` contains four leaf sets with
  `40, 40, 40, 40` images. The `0x09a4:0x0515` draw path consumes flat member indexes inside the
  selected group. The `0x09a4:0x004b` group-selection callback first looks up the master set key from
  `[0xa627]`, which `0x09a4:0x01dc` loaded from runtime `[0xca03]`, then falls back to
  `suffix * 100 + [0xa627]`. The shipped master set-id tables map context key `1` to leaf 1 in both
  files, but the `DungCom1` / `WildCom1` suffix `1` is not itself the primary leaf selector.
- DQK combat-area population is now pinned separately from TLB image copying: `0x02c397` fills
  `[0xbedb]+9` for `0x04e2` bytes with dungeon background id `0x16`, `0x02cb2b` fills the same
  50x25 grid with wilderness background id `0x45`, and `0x02bcf0` writes individual background ids to
  `[0xbedb]+9 + y*0x32 + x`.
- DQK renderer-side terrain mapping is now pinned at `DQK.EXE:0x02ba4c`: it reads the same
  `[0xbedb]+9 + y*0x32 + x` background-id grid, clamps invalid ids to `0x15`, indexes
  `BackGroundTiles` at DGROUP `0x6197`, reads record byte `+3` as `tileIndex`, then calls
  `0x09a4:0x0515` with the active `[0xc5d4]/[0xc5d6]` Dung/Wild group, flag `0`, and
  `tileIndex+1`. Special/remapped cells can overlay `[0xb17d]/[0xb17f]` live combat art with
  `otherTileIndex+0x0f` through the same render/copy entry.
- `0x09a4:0x0515` maps to `DQK.EXE:0x00c355` and forwards `member`, group id, `x`, and `y` to
  `0x169b:0x0bd0`. The downstream HLIB helpers `0x193f:0x01fd` and `0x193f:0x02a1` validate
  `member < count` and seek `0x10 + member*4`, proving that the consumed member is a flat zero-based
  entry in the selected group. `0x09a4:0x0881` uses `0x193f:0x0380` only when its `resolveFlag` says the
  source member needs symbolic translation; destination slots are flat live slots.
- Engine helper `dqkNativeCombatTerrainMemberByte()` now mirrors the DQK renderer's native conversion
  for recovered rows: live background id `0` or `> 0x4c` clamps to `0x15`, then
  `(DQK_BACKGROUND_TILES[id].tileIndex + 1) & 0xff` is the HLIB member byte. Tests verify that the
  native-valid DQK rows `0..0x4c` are carved from `DQK.EXE:0x69bb7` and map to existing set-1 labels in
  `WILDCOM.TLB`; the dungeon/shared subsets also map to `DUNGCOM.TLB` set-1 labels.
- The reserved member-zero behavior is now pinned at asset level: DUNGCOM/WILDCOM leaf 1 member `0` is
  the palette/color-table record (`cycle=5`, `first=32`, `ncol=224`), decoded terrain images begin at
  `set01_img001`, and terrain-used `dqkNativeCombatTerrainMemberByte()` values are nonzero. The
  `tileIndex+1` conversion therefore skips a real non-image member, not an accidentally missing frame.
- The direct render dispatch is pinned separately in
  `docs/engine/research/dqk-combat-render-dispatch.md`: ordinary repaint enters via resident
  `1D99:0EC3` / `2740:0846`, calls `0x02aa06`, loops a 7x7 viewport, and calls `2740:172C`
  (`DQK.EXE:0x02ba4c`) for each visible cell.
- The `[0xca03]` selector lifecycle is pinned separately in
  `docs/engine/research/dqk-combat-context-ca03.md`: it is saved/loaded, zeroed during reset, set by the
  `0x0420ac` context routine, and forwarded into `0x09a4:01dc` as `[0xa627]`.
- The `0x2033` operand-parser/accessor pattern that feeds `[0xca03]` is pinned separately in
  `docs/engine/research/dqk-2033-accessor-patterns.md`: `0x2033:0013` parses current-stream operands
  from `[ae5c:ae5e]+[b7f9]`, `0x2033:0112` returns typed operand values, and operand `2` in the
  `0x0420ac` handler is the immediate source for `[0xca03]`. Operand `1` in the same handler is now
  narrowed to a combat-art/orientation resource selector: it is stored at current combatant `+0x13`,
  passed to `1D99:13B9`, and that stub resolves to overlay-11 `DQK.EXE:0x061bc3`, which loads through
  `back1` / `8x8d%c%d` / `GEO1` strings and mirrors the value to current combatant `+0xc6`.

The current source-recovery status is: DQK `lcall 0x104c:0x0007` is the only local caller target for
`DungCom1`/`WildCom1` combat bank setup, but it is not yet source-equivalent to old-engine
`Load24x24Set`. The strict old-engine argument equivalence is now disproven for this wrapper because
the apparent count-like bytes are unused here. The newly followed downstream branch is palette/header
realization, not a 24x24 tile-copy path. The renderer-side proof now points at Gen2 HLIB member
render/copy calls instead of an old-engine raw `24*24` byte-copy loop. The member consumed by the draw
path is flat within the selected group, and member zero is now resolved as the selected leaf's
palette/color-table record. New retail script evidence gives one concrete CA03 label/value route:
DQK `ECL.GLB#2` offers NORMAL/CAVE/WATER/SWAMP/ABYSS/FLAME, then executes `LOAD_FILES #2,
choice+1`; `DQK.EXE:0x0420ac` stores operand 2 in `[ca03]`. This establishes six script values and
their menu labels, but not a live combat invocation or the on-screen result of each choice.
Remaining proof includes operand-1 resource labels, values from other scripts, runtime
DungCom/WildCom selection, and visual reconciliation of selected-leaf images against native
screenshots/contact sheets. Native Greybox preserves this selector in GBEF but has no consumer for
it yet; see the Task 9 area-2 trace in `HANDOFF-DOK-HP-2026-09-24.md`.

## Verification

```powershell
pnpm --filter @goldbox/engine exec vitest run test/combatTileBankLoadAnchors.test.ts --reporter=verbose
pnpm --filter @goldbox/engine exec vitest run test/combatTerrain.test.ts test/dqkCombatCluster.test.ts --reporter=verbose
python tools/disasm_dqk.py --overlay12-combat
python tools/disasm_dqk.py --dqk-hlib-combat
python tools/disasm_dqk.py --dqk-combat-map
python tools/disasm_dqk.py --dqk-render-copy
python tools/disasm_dqk.py --dqk-combat-set-selection
python tools/disasm_dqk.py --dqk-ca03-xrefs
python tools/disasm_dqk.py --dqk-2033-accessors
python tools/disasm_dqk.py --dqk-combat-render-path
```

The engine test is optional over local retail data. When the local CoK/DoK/NWN files are present, it
asserts the old-engine call offsets above and verifies the DAX tile counts from decoded archive bytes.
