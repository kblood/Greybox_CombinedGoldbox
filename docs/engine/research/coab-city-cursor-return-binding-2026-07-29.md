# CoAB city cursor/menu return binding — 2026-07-29

## Result

The formerly unlocated binding is now source- and retail-byte-proven. CoAB does not expose a
global city picker or a walkable overland grid. It exposes a per-route-node destination menu over
`BIGPIC1.DAX#121`; a zero-based local menu choice becomes a **directed edge key**:

```text
0x4C9D = 4 * old_route_node(0x4C9C) + local_vertical_menu_choice(0x7F79)
```

That key selects the next route node, travel cost/mode, `Area1.current_city`, cursor coordinate,
and post-travel ECL dispatch arm from parallel 56-byte retail tables. The previous 40-row scan was
truncated: there are 14 route nodes with four edge slots each. The corrected generated inventory
is `coab-regional-selector.md`; `tools/scan_coab_regional_selector.py` now emits all 56 rows and
the node/choice/next-node/cost/mode fields.

## Original control flow

The recovered source supplies the host semantics without inference:

- `coab_extracted/engine/ovr003.cs:664-691`: `CMD_VertMenu` receives a destination word, calls
  `VertMenuSelect`, and writes its zero-based result to that word. Hub blocks 80/81 use `0x7F79`.
- `ovr003.cs:698-748`: `CMD_HorizontalMenu` follows the same zero-based result convention. This
  owns `ENTER CITY / JOURNEY ON / CAMP [/ SEARCH AREA]` and the later travel-mode menus.
- `ovr027.cs:165-181,315-335`: while in `WildernessMap` with picture `0x79`, every input menu
  positions and blinks the cursor using `Area1.current_city`, restoring the saved background when
  the input closes.
- `ovr028.cs`: `MapCursor.SetPosition` indexes the 33 exact `(x,y)` cursor pairs; draw/restore use
  save-under blits. This is a display cursor, not movement geometry.
- `ovr003.cs:480-493`: `CMD_NewECL` records `gbl.EclBlockId` in
  `Area1.LastEclBlockId` before loading the successor. Area offset `0x1E4` maps to ECL word
  `0x4BF2`. This is the missing return binding.

Retail ECL1#80 makes the journey mechanics explicit:

```text
8C9F  "FROM HERE YOU MAY JOURNEY TO"
8CBA  ON_GOTO [0x4C9B] -> one per-node VERTICAL_MENU
8E64  GETTABLE [0x4C02 + local choice] -> 0x4C9C       ; next node
8E72  ADD local choice, 0x4C9D -> 0x4C9D              ; directed edge
8E7C  GETTABLE edge cost -> 0x4C06
8E86  GETTABLE edge travel mode -> 0x4C08
8E90  prompt route-specific TRAIL/WILDERNESS/BY BOAT/EXIT menu
8E94  if cost became zero: restore 0x4C9B -> 0x4C9C and return to the city-edge loop
8EA7  otherwise advance the ECL clock
910C  GETTABLE edge -> 0x4CA1                          ; current_city
9116  GETTABLE edge -> 0x7F7A; ON_GOTO post-travel arm
```

Block 81 repeats the same structure at `89F8`, `8A13`, `8B37-8B80`, and `8DB9-8DCD` with its
campaign-state-specific destination menus and dispatch table. Thus `0x4C9D` is neither an opaque
host value nor a visual menu index. It identifies the selected directed edge. Unused edge slots
have neighbor/city `0xFF`, zero cost/mode, and fall into the retail default dispatch arm.

## Return transition and executable replay

City/dungeon scripts return with their own `SAVE 1,0x7F12; NEWECL 80/81`. The native NEWECL host
records the departed block at `0x4BF2`. Hub initial entry consumes that predecessor to restore the
correct route node before drawing picture 121. One exact replay is now a focused golden:

1. ECL5#48 executes `SAVE 1,0x7F12; NEWECL 80` at `0x8092/0x8098`.
2. `runEclChain` with a CoAB dialect binding `lastBlockIdAddr: 0x4BF2` records predecessor 48.
3. ECL1#80's `COMPARE [0x4BF2],48` branch writes route node 9.
4. The hub snapshots node 9 in `0x4C9B`, writes `current_city=9`, sets edge base `0x4C9D=36`,
   emits picture 121, and pauses on `ENTER CITY / JOURNEY ON / CAMP`.
5. Choosing `JOURNEY ON`, then the sole node-9 destination `ESSEMBRA`, maps edge 36 to node 8 and
   exposes the retail `TRAIL / WILDERNESS / EXIT` transport menu.

The negative control omits the dialect binding; node 9 is not restored. This discriminates the
host binding from coincidental menu decoding. The generic dialect seam only acts when a title
supplies the proven address; unrelated dialect behavior remains unchanged.

## Implementation boundary — browser slice completed (2026-07-30)

The engine-side chain/return contract and headless retail replay described above are unchanged.
The bounded visual integration is now available at `?coab-regional=1`:

- It starts with retail ECL5#48's ordinary area switch and follows the CoAB dialect's
  `lastBlockIdAddr: 0x4BF2` binding into ECL1#80. The VM, rather than a host-authored route table,
  restores route node/current city 9 and emits picture 121 plus the menus.
- It composes retail `BIGPIC1.DAX#121` with CoAB's `8X8D1.DAX` frame/font. The cursor indexes the
  33 recovered `MapCursor.city_map_x/y` pairs and draws a solid white, palette-index-15 8×8 cell at
  the absolute `(x*8,y*8)` screen coordinate. It is visible for exactly 500 ms, then restores the
  saved picture for exactly 300 ms, matching the recovered input loop.
- The ordinary dialogue presenter exposes the retail `ENTER CITY / JOURNEY ON / CAMP` action menu,
  the route-node-owned destination list, and the later transport/cancel menu. The focused replay
  chooses `JOURNEY ON → ESSEMBRA → WILDERNESS`, preserving directed edge 36's node, cost, mode,
  `current_city`, cursor, clock, and post-travel dispatch semantics.
- The browser seam is observational only (`visited`, memory words, and cursor state). It does not
  add a global city list or free cursor movement over the regional picture.

The focused browser regression is `coab-regional-travel`. It checks the ECL5#48→ECL1#80 visit,
node 9/edge 36 restoration, picture 121, both cursor positions, actual visible/hidden pixel change,
all three retail menu stages, and the transition to node/current-city 8. This closes the visual
slice without broadening the claim to every campaign-state route or inventing an overland grid.

No DOSBox automation was required for this slice; its authority remains recovered source, decoded
retail ECL bytes, the engine replay, and the retail-asset browser regression.

## Regional-city round-trip promotion (2026-07-31)

The bounded selector is now continuous through its city action and return. Choosing `ENTER CITY`
at node/current-city 9 follows the retail dispatch into ECL5#49, mounts GEO5#50 at `(3,0,S)`, and
supports a walked DARK ELF PATROL victory plus safe-cell save/reload. The village's west
`vm_run_1` exit then chains through ECL5#48 back to ECL1#80, restoring node/snapshot/current-city
9, edge 36, BIGPIC1#121, cursor `(31,15)`, and `ENTER CITY / JOURNEY ON / CAMP`.

This promotes CoAB's campaign-matrix town leg without changing the mechanism classification:
the regional selector remains a WildernessMap BIGPIC/menu surface and the village remains ordinary
DUNGCOM dungeon content, not a separate Town engine mode. The engine golden is
`packages/engine/test/coabRegionalTravel.test.ts`; the continuous browser acceptance is
`coab-regional-town-round-trip` in `apps/web/test/e2e.mjs`. The independently audited quest leg is
still blocked, so CoAB remains at the Persistent evidence tier.

## Verification

```powershell
python tools/scan_coab_regional_selector.py
pnpm --filter @goldbox/engine exec vitest run test/coabRegionalTravel.test.ts
pnpm -r exec tsc --noEmit
pnpm build:app
$env:GB_E2E_ONLY='coab-regional-travel'
pnpm --filter @goldbox/web e2e
Remove-Item Env:GB_E2E_ONLY
```
