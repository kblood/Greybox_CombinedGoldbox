# DQK Overlay-12 Combat Setup Cluster

This note records the Dark Queen of Krynn overlay-12 data cluster that groups combat UI strings,
combat tile-bank names, the battle banner, and the currently known `BackGroundTiles` table anchors.
It is a binary/data anchor set, not a recovered source routine.

## Overlay Context

`tools/disasm_dqk.py` maps DQK overlay descriptor index 12 to file offset `0x62c30`, with the verified
fixup/code-data start at `0x63a20`. Overlay 12 has no normal C prologues in this region; it behaves as
a data-heavy overlay segment. The offsets below are raw `The Dark Queen of Krynn/DQK.EXE` file offsets.
`tools/disasm_dqk.py --overlays` now reports the verified `OVERLAY_PREFIX_BYTES` starts, not the older
`reloc_count / 2 * 4` approximation.

Relative to overlay-12 data start `0x63a20`:

- `DungCom1` at file `0x697c2` is relative `0x5da2`.
- `BackGroundTiles[0]` aligned hit at file `0x69bb7` is relative `0x6197`.

## Located Cluster

| Anchor | File Offset | Evidence |
|---|---:|---|
| `attack ally?` | `0x684a1` | Gen2 target/ally confirmation text |
| `Aim: range =` | `0x684af` | Gen2 Aim prompt text |
| `Move Aim Use Cast Turn Guard Quick@Delay Bandage...` | `0x68ad3` | Gen2 combat command row cluster |
| `Next Prev Manual Target Center Exit` | `0x68b22` | Gen2 Aim/manual target menu |
| `COMSPR` | `0x697bb` | Combat sprite bank name |
| `DungCom1` | `0x697c2` | Gen2 dungeon combat tile-bank name |
| `WildCom1` | `0x697cb` | Gen2 wilderness combat tile-bank name |
| `A battle begins...` | `0x698f8` | Tactical launch banner |
| Adjacent pre-table rows | `0x69ba7` | Four 4-byte records immediately before the aligned table hit; not part of the current `BACKGROUND_TILES` table |
| `BackGroundTiles[0..25]` run | `0x69bb7` | First exact DQK run of the current `BACKGROUND_TILES` data |
| DQK variant/mismatch rows | `0x69c1f` | Relative rows 26..31 differ from the current CoAB-shaped table |
| DQK row-28/variant slice | `0x69c27` | Relative row 28 from the `0x69bb7` base; not an independent table start |
| `BackGroundTiles[32..43]` run | `0x69c37` | Second exact DQK run of the current `BACKGROUND_TILES` data |

Verified byte slices:

```text
0x69ba7: 13 01 00 01 01 01 00 ff ff ff 00 ff ff 00 01 01
0x69bb7: 01 00 ff 00 ff 01 02 00 ff 01 02 01 ff 01 02 02
0x69c1f: 02 02 00 26 01 01 00 0e 01 01 00 0d 01 01 00 0c
0x69c27: 01 01 00 0d 01 01 00 0c 01 01 00 14 01 01 00 15
0x69c37: ff 01 02 00 ff 01 02 01 ff 01 02 02 ff 01 02 03
```

The table-carving verifier now classifies the local window:

- `0x69bb7` is the exact DQK base for `BACKGROUND_TILES[0]`; rows `0..25` match byte-for-byte.
- `0x69ba7` is four records before that base. Those records do not match any current `BACKGROUND_TILES`
  entry, so they are adjacent overlay data or DQK-specific pre-table rows, not earlier rows of the
  current table.
- `0x69c27` is not a second table start. It is relative row 28 when using the `0x69bb7` base, and it
  lives inside the DQK mismatch/variant range for relative rows `26..31`.
- `0x69c37` is relative row 32 and starts a second exact run: rows `32..43` match the current
  `BACKGROUND_TILES` data byte-for-byte.
- Known DQK mismatches inside the carved `0x69bb7..0x69c7f` window are relative rows `26..31`, row `44`,
  and rows `48..49`. Rows `26..31` preserve the record shape but differ in tile-index bytes; row `44`
  and rows `48..49` differ in movement-cost bytes.

## Asset Bank Mapping

The string cluster names the Gen2 combat banks; `DQK_ART_LAYOUT` records the shipped HLIB targets:

| String | Shipped TLB | Disk | Shape |
|---|---|---|---|
| `COMSPR` | `COMSPR.TLB` | `DISK2` | 46 images, 24x24 |
| `DungCom1` | `DUNGCOM.TLB` | `DISK2` | 136 images, 24x24 |
| `WildCom1` | `WILDCOM.TLB` | `DISK2` | 160 images, 24x24 |

These counts are catalogued in `packages/engine/src/loaders/dqkArtMap.ts` and asserted by
`packages/engine/test/dqkCombatCluster.test.ts`.

## Cross-Game Comparison

For the focused old-engine `Load24x24Set` argument comparison and DAX asset-count verification, see
`docs/engine/research/combat-tilebank-load24x24-crossgame.md`.

Focused DQK follow-up notes:

- `docs/engine/research/dqk-combat-context-ca03.md` tracks the `[0xca03]` runtime selector lifecycle.
- `docs/engine/research/dqk-2033-accessor-patterns.md` tracks the `0x2033` current-stream operand
  parser/accessor helpers that feed `[0xca03]`.
- `docs/engine/research/dqk-ca03-runtime-probe.md` tracks the automated live-value probe for the same
  `0x0420ac` operands and current organic-run limitation.
- `docs/engine/research/dqk-combat-render-dispatch.md` tracks the `2740:0846 -> 0x02aa06 -> 2740:172C`
  7x7 render dispatch path and the overlay-0 segment-base correction.

| Game | Dungeon/Wilderness/Random Bank Strings | Load24x24Set Anchor |
|---|---|---|
| CoK | `GAME.OVR:0xf1ac` / `0xf1b4` / `0xf1bc` = `DungCom` / `WildCom` / `RandCom` | `GAME.OVR:0x406a5` |
| DoK | `GAME.OVR:0xce3c` / `0xce44` = `DungCom` / `WildCom`; no direct `RandCom` string in the current scan | `GAME.OVR:0x3d115` |
| NWN | `GAME.OVR:0xdf2c` / `0xdf34` = `DungCom` / `WildCom`; `0xe67c` / `0xe684` = `DungCom` / `RandCom` | `GAME.OVR:0x4c414` |
| DQK | `DQK.EXE:0x697c2` / `0x697cb` = `DungCom1` / `WildCom1` | Not separately pinned; table cluster and bank strings live nearby in overlay 12 |

## Implementation Status

- `packages/engine/src/combat/terrain.ts` already treats `DQK.EXE:0x69bb7` as a byte-table
  cross-check for `BACKGROUND_TILES`.
- `packages/engine/src/loaders/dqkArtMap.ts` already catalogs the DQK combat tile/sprite bank shapes.
- `packages/engine/src/combat/terrain.ts` exports raw `BackGroundTiles` record encode/decode helpers.
- `packages/engine/src/combat/terrain.ts` also exports `DQK_BACKGROUND_TILES`, a DQK-specific
  transcription of native-valid rows `0..0x4c`, and the DQK-native terrain member helper:
  native live background id `0` or `> 0x4c` clamps to `0x15`, then the HLIB member byte is
  `(DQK_BACKGROUND_TILES[id].tileIndex + 1) & 0xff`.
- `packages/engine/test/dqkCombatCluster.test.ts` verifies the DQK binary offsets, the TLB bank metadata,
  the exact `BACKGROUND_TILES[0..25]` and `[32..43]` runs, and the known DQK variant rows. The
  binary-offset tests skip when local `DQK.EXE` is absent.
- `tools/disasm_dqk.py --overlay12-combat` is the focused binary verifier for this cluster. It prints
  the overlay-12 file range `0x62c30..0x6dc80`, the verified data start `0x63a20`, the combat anchor
  relative offsets, and a bounded direct word-scan for raw file-low-word and payload-relative references.

## Xref Status

The focused direct scan is intentionally conservative:

```powershell
python tools/disasm_dqk.py --overlay12-combat
```

Current result:

- `COMSPR` at `0x697bb`, `DungCom1` at `0x697c2`, `WildCom1` at `0x697cb`, `A battle begins...` at
  `0x698f8`, `BackGroundTiles[0]` at `0x69bb7`, and the `BackGroundTiles[32]` run at `0x69c37` all
  validate as overlay-12 anchors.
- None of those primary combat-cluster anchors has a simple raw file-low-word reference inside overlay
  12 itself. That is expected because overlay 12 is DGROUP data loaded from `0x63a20`.
- Whole-file DGROUP-offset scanning (`anchor_file_offset - 0x63a20`) does find code references in other
  overlays/resident code. The strongest decoded references are:
  - `0x02cb88`: `mov ax,0x5d9b; push ax; lcall 0x09a4:0x01dc` for `COMSPR`.
  - `0x02cc1a`: `mov ax,0x5da2; push ax; lcall 0x104c:0x0007` for `DungCom1`, with surrounding
    stack values `0x19, 0, [0xca03]`.
  - `0x02cc33`: `mov ax,0x5dab; push ax; lcall 0x104c:0x0007` for `WildCom1`, with surrounding
    stack values `0x27, 0, [0xca03]`.
  - `0x0325ee`: `mov ax,0x5ed8; push ax; ... lcall 0x0a62:0x0046` for `A battle begins...`.
  - `0x02385a` and related sites: `id * 4`, `add bx,0x6197`, `DS -> ES`, then reads from `es:[bx+n]`,
    which is direct code evidence for the `BackGroundTiles` row-0 base.
- Payload-relative hits for the later `DUNGCOM1` string at `0x6ac97` include data/string coincidences;
  those should not be promoted without local disassembly. The primary cluster references above are the
  stronger combat-loader/table evidence.
- `lcall 0x104c:0x0007` maps to file offset `0x128c7` and has exactly two raw call sites in local
  `DQK.EXE`: `0x02cc1e` and `0x02cc37`. Both are the `DungCom1` / `WildCom1` setup branch above.
- The wrapper at `0x128c7` begins with `lcall 0x09a4:0x01d1`, conditionally stores nonzero
  `[bp+0x0c]` into `[0x3ab4]`, forwards the file far pointer and `[bp+0x0a]` through
  `lcall 0x09a4:0x01dc` (file `0x0c01c`), then calls `0x09a4:0x0b8c` (file `0x0c9cc`) through temp
  far pointer `[0xc5d4]`. It does not by itself prove the old-engine `cellCount * bpp` copy loop; it is
  a narrow DQK tile-bank wrapper candidate.
- The caller's `0x19` / `0x27` values land at wrapper stack slot `[bp+0x0e]`, and this wrapper does not
  read that slot. That contradicts strict old-engine `Load24x24Set(cellCount, dest, block, file)`
  equivalence for `0x104c:0x0007`; the values remain call-site context, not proven tile counts for DQK.
- Current helper annotation: `0x09a4:0x01dc` allocates/configures a TLB/HLIB file-group record and
  recognizes trailing numeric suffixes such as `DungCom1`; `0x09a4:0x0b8c` resolves that group through
  HLIB helper calls and realizes graphics/palette/header data. The actual Gen2 terrain render/copy path
  is separate and is now pinned below at `0x02ba4c -> 0x09a4:0x0515`.
- The first downstream HLIB path is now pinned:
  - `0x09a4:0x0b8c` calls `0x193f:0x033d` at file `0x00c9ef`; this target maps to file `0x01bb2d`
    and has exactly one raw caller in local `DQK.EXE`.
  - `0x09a4:0x0b8c` then calls `0x1796:0x0536` at file `0x00ca10`; this target maps to file
    `0x01a296` and has five raw callers (`0x00ca10`, `0x01341c`, `0x037e55`, `0x0386f7`,
    `0x061206`).
  - `0x1796:0x0536` validates HLIB item type low-nibble `8`, reads size/offset fields from the library
    item, chooses a `0x100` / `0x10` palette-length-like value, and calls `0x161b:0x00b1` at file
    `0x01a39f`.
  - `0x161b:0x00b1` maps to file `0x018661` and updates palette tables around `DS:0xd145` /
    `DS:0xd445` from compact RGB byte triples. It shifts each channel down to VGA DAC width, compares
    against the current palette table, writes changed triples, and marks dirty bits around `DS:0xd0c5`.
    It has four raw callers (`0x01a39f`, `0x03696d`, `0x036b26`, `0x038651`).
  - Nearby `0x161b:0x000b` (`DQK.EXE:0x0185bb`) initializes the palette tables and has one raw caller
    (`0x037e44`). `0x161b:0x0455` (`DQK.EXE:0x018a05`) flushes dirty palette ranges and has five raw
    callers (`0x00c589`, `0x036989`, `0x036b2e`, `0x037e5d`, `0x038659`).
  This branch is now best classified as HLIB palette/header realization, not as the Gen2 terrain
  render/copy path.
- `tools/disasm_dqk.py --lcallers` now verifies the caller counts: `0x104c:0x0007` has 2 callers,
  while the internal helpers are general-purpose routines (`0x09a4:0x01dc` has 16 callers and
  `0x09a4:0x0b8c` has 14 callers in the current local binary). Therefore the next proof should focus on
  the downstream routine that consumes the realized HLIB graphics data, not on finding more
  `DungCom1` / `WildCom1` call sites.

This closes the first DQK xref pass for the combat cluster: `DungCom1`/`WildCom1` now have candidate
loader calls, the battle banner has a display call, and `BackGroundTiles` has repeated table-consumer
code. The wrapper is now named at the high level as combat TLB/HLIB file-group setup, not as the DQK
copy-loop equivalent of old-engine `Load24x24Set`.

`[0xca03]` is now traced as the runtime terrain-group context selector. Its live setter at
`DQK.EXE:0x0420ac` parses two current-stream operands through `0x2033:0013`, reads operand `2` through
`0x2033:0112`, treats `0xff` as no-update, invalidates the old `[0xb7a8]` group through `0x09a4:0009`
when the value changes, then writes the new zero-extended selector to `[0xca03]`. Save/load
serialization reads/writes the word at `0x035b02` / `0x0363b0`, and reset paths zero `ca03..ca06` at
`0x038024` / `0x03821a`. The parser/accessor bodies are pinned at `DQK.EXE:0x031d33` / `0x031e32`;
see `docs/engine/research/dqk-2033-accessor-patterns.md`.

## Combat Map Population

The next setup layer is now pinned around the same DQK branch:

- `0x02cb60` is the setup dispatcher that loads `COMSPR`, maps COMSPR frames via `0x09a4:0x0881` for
  destination slots `0x0f..0x25`, checks `[0xb20f]+0x22`, then chooses the combat terrain bank:
  nonzero loads `DungCom1` and later calls `0x02c397`; zero loads `WildCom1` and later calls
  `0x02cb2b`.
- `0x02bcf0` is the recovered cell writer for the live DQK combat background-id map. It computes
  `x = a95e*6 + a95f*5 + localX + 0x15`, `y = a95f*5 + localY + 0x0a`, bounds checks `x <= 0x31`
  and `y <= 0x18`, then writes `backgroundId + 1` to `[0xbedb]+9 + y*0x32 + x`.
- `0x02c397` initializes the dungeon path by filling `[0xbedb]+9` for `0x04e2` bytes with `0x16`,
  then walks `a95f = -2..2` and `a95e = -6..6` to classify a 13x5 source window into the 50x25
  tactical map through helpers such as `0x02bddf`, `0x02be3e`, `0x02beeb`, `0x02bf75`, and
  `0x02c18e`.
- `0x02cb2b` initializes the wilderness path by filling `[0xbedb]+9` for `0x04e2` bytes with `0x45`,
  then applies `0x02c550`, `0x02c6d7`, and `0x02c869`.
- `0x04e2 == 1250 == 50*25`, so `[0xbedb]+9` is the DQK tactical background-id map, matching the
  old-engine/CoAB 50x25 combat map dimensions.
- `0x02c6d7` walks that 50x25 map, reads a background id from `[0xbedb]+9`, indexes
  `BackGroundTiles` at DGROUP `0x6197`, checks record byte `+3` (`tileIndex`) for `0x25`, and applies
  randomized wilderness/tree variants by writing new background ids back into the map.

This is a stronger DQK area-setup result than the earlier tile-bank wrapper alone: the live Gen2 combat
map is now identified as a 50x25 background-id grid.

## Combat Background Renderer

The renderer-side consumer is now pinned at `DQK.EXE:0x02ba4c`:

- `0x02ba4c` reads a live combat background id from `[0xbedb]+9 + y*0x32 + x`.
- It clamps invalid, zero, or `> 0x4c` ids to fallback id `0x15`.
- It indexes `BackGroundTiles` at DGROUP `0x6197` and reads record byte `+3` as `tileIndex`.
- The ordinary terrain path pushes the active `DungCom1` / `WildCom1` group pointer
  `[0xc5d4]/[0xc5d6]`, flag `0`, `tileIndex+1`, and screen coordinates, then calls
  `0x09a4:0x0515`.
- Special/remapped terrain can also push the live combat art group `[0xb17d]/[0xb17f]`, flag `1`,
  `otherTileIndex+0x0f`, and the same screen coordinates into `0x09a4:0x0515`.

The dispatch path into this renderer is now pinned:

- `LCALL 2740:172C` resolves to `DQK.EXE:0x02ba4c` when overlay 0 is resolved against segment base
  `0x022400`, not first-prologue byte `0x022401`.
- Direct calls to `2740:172C` occur at `0x02a498`, `0x02a8db`, `0x02a90b`, and `0x02ab37`.
- The ordinary full repaint enters through resident stub `1D99:0EC3` / `LJMP 2740:0846`, file
  `0x02ab66`, which calls `0x02aa06`.
- `0x02aa06` loops viewport row/col `0..6`, derives map x/y from `[0xbedb]+2/+4`, and calls
  `2740:172C` once per visible cell.

Current interpretation: DQK does not appear to use an old-engine raw `24*24` byte-copy loop for combat
terrain. It maps the recovered 50x25 background-id grid through `BackGroundTiles.tileIndex`, then asks
the Gen2 HLIB render/copy entry `0x09a4:0x0515` to draw members from the currently selected
`DUNGCOM.TLB` / `WILDCOM.TLB` group, with a secondary COMSPR/live-art overlay path for special cells.

`0x09a4:0x0515` is now decompiled far enough to settle the member-index shape:

- `0x09a4:0x0515` maps to `DQK.EXE:0x00c355`. It has a normal prologue and takes
  `x=[bp+6]`, `y=[bp+8]`, `member=[bp+0a]`, `flag/context=[bp+0c]`, and
  `groupPtr=[bp+0e]`.
- It enables draw state through `0x09a4:0x05ee`, reads the group id from `es:[groupPtr]`, zero-extends
  the member byte, and forwards `member`, group id, `x`, and `y` to `0x169b:0x0bd0`.
- The downstream HLIB helpers `0x193f:0x01fd` and `0x193f:0x02a1` validate the HLIB header, check
  `member < count`, and seek `0x10 + member*4`. That proves the consumed member is a flat zero-based
  member index inside the selected group.
- `0x09a4:0x0881` (`DQK.EXE:0x00c6c1`) installs/copies members between groups. Its `resolveFlag`
  decides whether the source member is translated by `0x193f:0x0380`; otherwise source and destination
  members are already flat slots. The destination member is always a flat live slot.

This means the terrain caller's `tileIndex+1` is a caller-side convention/reservation over the active
Dung/Wild group, not a `(masterSet, localSlot)` pair passed through `0x0515`. Group selection lives in
the group pointer (`[0xc5d4]/[0xc5d6]` for terrain, `[0xb17d]/[0xb17f]` for live COMSPR/combat art).

The active Dung/Wild combat terrain group is now narrowed through the TLB master set-id tables and the
group-selection callback:

- `0x09a4:0x01dc` strips trailing digits from names such as `DungCom1` / `WildCom1`, clears group
  record `+2` for this digit-suffixed path, stores the parsed suffix in temp state `[0xa317]`, stores
  the runtime context key `[0xca03]` in `[0xa627]`, formats the base `.TLB` name, and calls
  `0x17fa:0x025b` to load/open the selected library under record id `slot+2`.
- The `0x09a4:0x004b` callback at `DQK.EXE:0x00be8b` resolves the master member by first looking up
  key `[0xa627]` through `0x193f:0x0419`, then falling back to `suffix * 100 + [0xa627]`. With
  `a629=0` on the Dung/Wild wrapper path, it binds the selected master member range to the logical group
  through `0x193f:0x0071`.
- In shipped `DUNGCOM.TLB`, the master set-id table at `0x002c` has entries:
  `id 1 -> pointerNo 1 -> leaf 0x0046`, `id 5 -> pointerNo 1 -> leaf 0x0046`,
  `id 2 -> pointerNo 2 -> leaf 0x3f2e`, `id 3 -> pointerNo 3 -> leaf 0x7e16`,
  `id 4 -> pointerNo 4 -> leaf 0xbd02`, and `id 6 -> pointerNo 5 -> leaf 0xfbea`.
- In shipped `WILDCOM.TLB`, the master set-id table at `0x0028` has entries:
  `id 1 -> pointerNo 1 -> leaf 0x003a`, `id 2 -> pointerNo 2 -> leaf 0x5f4a`,
  `id 4 -> pointerNo 3 -> leaf 0xbe5a`, and `id 5 -> pointerNo 4 -> leaf 0x11d6a`.

Therefore context key `1` maps to leaf 1 in both shipped combat terrain masters, but the trailing
`1` in `DungCom1` / `WildCom1` is not itself the primary leaf selector. The current open selector gap is
capturing actual runtime operand values and firm gameplay/editor labels for the `0x0420ac` operands.
Operand `2` feeds `[ca03]`; operand `1` is now narrowed to the `1D99:13B9` combat-art/GEO resource
loader path at `DQK.EXE:0x061bc3`. After a leaf is selected, `tileIndex+1` indexes flat members inside
that selected logical group.

The recovered table rows now have a concrete asset-label check:

- `DQK.EXE:0x69bb7` rows `0..25` map through `tileIndex+1` to existing `DUNGCOM.TLB` set-1 labels.
- `DQK.EXE:0x69c1f` DQK variant rows `26..31` map through `tileIndex+1` to existing `WILDCOM.TLB`
  set-1 labels, including high wilderness member numbers such as `tileIndex 0x26 -> member 0x27`.
- `DQK.EXE:0x69c37` rows `32..43` map to set-1 labels in both `DUNGCOM.TLB` and `WILDCOM.TLB`.
- The full native-valid DQK table range `0..0x4c` is now transcribed as `DQK_BACKGROUND_TILES`; all of
  those rows map through `tileIndex+1` to existing `WILDCOM.TLB` set-1 labels.
- Greybox now exposes `dqkNativeTerrainGridFromBackgroundMap()` for renderer-compatible DQK Gen2 terrain
  semantics. It applies the native combat renderer clamp (`0` or `>0x4c` -> `0x15`) before reading
  `DQK_BACKGROUND_TILES` for blocked/sight/cost checks, so future DQK combat surfaces do not accidentally
  reuse the CoAB `BackGroundTiles` table for DQK background ids.
- `dqkNativeBackgroundCellMemberMap()` applies the same DQK clamp and `tileIndex+1` conversion over a
  requested viewport and returns the HLIB member bytes that DQK sends to `0x09a4:0515`. This is the DQK
  counterpart to CoAB's `backgroundCellTileMap()`, whose return values are old-engine 24x24 tile indexes
  and should not be used for Gen2 DQK terrain rendering.
- `buildDqkNativeCombatMap()` wraps an explicit DQK background-id surface as `backgroundIds`,
  `dqkNativeTerrainGridFromBackgroundMap()`, and tactical anchors. It is a safe handoff shape for future
  web/native probes once a route can dump the original 50x25 `[bedb]+9` surface; it does not itself
  recover or simulate DQK's map-population routine.
- `tools/unicorn_dqk_trace.py --dump-dqk-combat-map PREFIX` now provides that future handoff route:
  when the known setup/render anchors execute, it reads the far pointer stored at DGROUP
  `[0xbedb]:[0xbedd]` and dumps the `ptr_seg:(ptr_off+9)` 50x25 surface plus CSV context. The hook is
  validated and now rejects overlay-memory aliases by comparing the live bytes with the expected
  `DQK.EXE` file offset before dumping. A staged area-5 loaded-save trace reached the old physical
  `28d0:0000` watch three times as live `389c:0340`, but byte validation showed party-menu bytes, not
  the `0x02bcf0` cell-writer prologue; that run now writes zero dump rows. No organic DQK combat route
  has produced a validated nonzero original `[bedb]+9` dump yet.
- Web `?combat=dqk` is now a non-default synthetic DQK native background-id preview fixture over that
  handoff shape. The e2e seam verifies 50x25 dimensions, anchor placement, DQK terrain/member conversion
  (`terrainInfo(1,1).tile == 0x27`, `terrainInfo(35,16).tile == 0x20`), and checksum `3917224348`.
  It intentionally still uses the shared combat screen and does not claim DQK VGA `DUNGCOM.TLB` /
  `WILDCOM.TLB` visual parity.

This is still a render/terrain-table invariant, not a proof that the current native area-5 WGRD combat
preview has run the original DQK `DungCom1` / `WildCom1` setup path. The native area-5 proof is compatible
with the recovered DQK combat/resume flow, while the original 50x25 map population and HLIB terrain
dispatch remain the overlay-12 evidence tracked here.

The remaining renderer gaps are now:

- Capture actual runtime operand values and gameplay/editor labels for the `0x0420ac` operands: operand
  `2` feeds `[ca03]`, while operand `1` drives the `1D99:13B9` combat-art/GEO resource loader.
  `tools/unicorn_dqk_trace.py --watch-ca03-operands` now automates this dump when real DQK execution
  reaches the setter. The base tracer now passes the earlier VGA retrace wait, but the current 1M
  organic Unicorn run still records zero rows and is dominated by generic memory copy/fill hot spots.
- Map `BackGroundTiles.tileIndex+1` against selected `DUNGCOM.TLB` / `WILDCOM.TLB` visual render
  samples. Reserved slot zero is already pinned as the leaf palette/color-table member.

Art-side indexing must stay explicit while finishing that renderer path:

- `DUNGCOM.TLB` is a master HLIB with five leaf sets containing `26, 26, 26, 26, 32` images, total 136.
- `WILDCOM.TLB` is a master HLIB with four leaf sets containing `40, 40, 40, 40` images, total 160.
- `0x09a4:0x0515` and the downstream `0x193f` helpers consume flat member indexes inside the selected
  group. In both combat terrain master files, context key `1` maps to leaf 1, but current evidence says
  the key comes from `[0xca03]` and only falls back through the parsed filename suffix.
- Recovered DQK terrain rows now have an engine-level label check that verifies the native
  `tileIndex+1` member byte lands on real set-1 `DUNGCOM.TLB` / `WILDCOM.TLB` image labels for the
  native-valid DQK rows carved from `DQK.EXE`.

## R1 (Round 32) — Dungeon Combat-Surface Population, byte-transcribed

The "Compare DQK's Gen2 combat-area population against CoAB `SetupDungeonFloor()`" item above is
now done. TypeScript: `packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkDungeonCombatMap`),
tested in `packages/engine/test/dqkCombatMap.test.ts`. Every branch there cites the `DQK.EXE` file
offset it transcribes; the disassembly excerpts below are the byte-for-byte evidence for the nine
routines (dispatcher `0x02cb60`, wall probe `0x02bd62`, edge classifier `0x02bddf`, cell writer
`0x02bcf0`, floor/west `0x02be3e`, north `0x02beeb`, NW corner `0x02bf75`, NE corner `0x02c18e`,
population `0x02c397`).

**Dispatcher, `0x02cb60`** (confirms the `[0xb20f]+0x22` gate and the DungCom1/dungeon vs
WildCom1/wilderness split already pinned above):

```
02cb60  push bp / mov bp,sp / sub sp,6
02cb66  mov word ptr [bp-4],0        ; init locals
02cb6b  mov word ptr [bp-6],0
02cb70..02cb78  lcall 0x9a4,0x1d1    ; load COMSPR (unrelated to terrain)
02cb87..02cb9a  lcall 0x9a4,0x1dc    ; open the combat terrain library
02cb94..02cb9f  lcall 0x9a4,0xb8c    ; [bp-4]/[bp-6] pushed — group id
```
(the `[0xb20f]+0x22` branch and its two `0x02c397`/`0x02cb2b` call sites were already pinned in
"Combat Map Population" above; unchanged by this round.)

**Cell writer, `0x02bcf0`** — exactly the `dqkWriteCell` anchor, `+0x15`/`+0x0a`:

```
02bcf6  mov al,[0xa95e]        ; ox
02bcf9..02bcfd  cwde / mov dx,6 / mul dx      ; ox*6
02bd00..02bd0c  mov al,[0xa95f] ; oy; mul dx=5; add dl,al; add dl,[bp+6] (localX)
02bd0f  add dl, 0x15                          ; x = ox*6 + oy*5 + localX + 0x15
02bd15..02bd23  mov al,[0xa95f]; mul dx=5; add al,[bp+8] (localY); add al, 0xa
                                              ; y = oy*5 + localY + 0x0a
02bd26..02bd3c  bounds: 0<=x<=0x31, 0<=y<=0x18
```

**Wall probe, `0x02bd62`** and **edge classifier, `0x02bddf`** — the out-of-bounds special case
(`dqkOutOfBoundsFlag`) is at `0x02bdc1`: `cmp al,[0xc9f1]` (party Y) / `jne ->1` then
`cmp [bp+0xa],2` / `je ->0`, `cmp [bp+0xa],6` / `jne ->1`, i.e. 0 only when the probed row equals
the party's row AND direction is east(2) or west(6), else 1 — byte-identical to CoAB's
`sourceEdgeFlag`. In-bounds, `0x02bd9d`/`0x02bdb1` call far door/wall lookups `0x1d99:0x10fd` /
`0x1d99:0x10f3` and combine into 0/1/3.

**Floor+west, `0x02be3e`** — memset the 6x3 sub-block to `0x16` (`02be50`), then on `dir6===1`
write `4,3,0xd` at `(v-1,v)/(v,v)/(v,v+1)` for `v=2..4` (`02be7f..02beb5`); on `dir6===3`
(`0x02bec0`) write `8` at `(2,1)` and `0` at `(4,5)` — matches `dqkBuildFloorAndWest` exactly.

**North, `0x02beeb`** — `dir0===1` writes `5,5,0xa,0xa` at the four corner cells (`02bef2..02bf2f`);
else (`0x02bf34`) writes `0x16` at all four — matches `dqkBuildNorth` exactly.

**NW corner, `0x02bf75`** — computes `cornerOpen` via two `0x02bddf` calls (west-of-north-neighbor
OR north-of-west-neighbor), then a 4-way jump table (`02bfde`) on `dir6∈{0,1,3}`; the `dir0===0`
sub-case at `0x02bfff..0x2c02b` matches `a` in `dqkBuildNorthwestCorner` exactly (0x16/0/0xd/0xd
per `[0xa96c]` value), and `0x02c02e..0x2c05a` matches the `dir6===0` sub-case (0xf/5 or 0x12/2 on
`cornerOpen`).

**NE corner, `0x02c18e`** — `northOfEast = edgeFlag(2, x, y-1)` at `02c194..02c1ae`,
`eastOfNorth = edgeFlag(0, x+1, y)` at `02c1b1..02c1cb` — matches `dqkBuildNortheastCorner`'s two
probes exactly (direction constants 2 and 0, offsets `y-1`/`x+1` via the `dec al`/`inc al` on the
pushed coordinate). This is the routine with the ONE confirmed divergence from CoAB
(`northOfEast===3` shares the `northOfEast===1` code path, writing tile 7, where CoAB's ternary
collapses to tile 1) — proven on a crafted door grid in `dqkCombatMap.test.ts`'s
"northeast-corner divergence" test (cell 527: DQK id 8 vs CoAB id 2, the only disagreement in
1250 cells).

**Population, `0x02c397`** — memsets 1250 (`0x4e2`) bytes at `[0xbedb]+9` to `0x16` via
`lcall 0xd7,0x27a6` (`02c39d..02c3b6`), walks `oy=-2..2`/`ox=-6..6`, computes `mapX/mapY` from
party position `[0xc9f0]/[0xc9f1]`, then calls the edge classifier FOUR times storing into
`[0xa96c]` (west, dir=6), `[0xa970]` (north, dir=0), `[0xa964]` (east, dir=2), and `[0xa972]`
(south, dir=4) — then calls exactly `0x02be3e` and `0x02beeb` (visible above; `0x02bf75`/`0x02c18e`
follow immediately after in the same block, not shown). **`[0xa972]` (south) is written but never
read by any of the four called helpers** — a dead DGROUP read, transcribed faithfully as `void
dir4` in `dqkCombatMap.ts`. **No RNG-driven fifth pass exists**: none of the nine routines contains
an `lcall` to any DQK random-number routine — contradicting this doc's own earlier "Remaining Work"
assumption that a randomized furniture pass needed recovering; there isn't one on the DQK side.

**Headline correction to this doc's own working assumption:** the CoAB-comparison test discovered
that CoAB's `SetupDungeonFloor` also writes literally all 1250 cells on any grid >= 13x5 (the
6-col/5-row tiling tessellates the full 50x25 surface with zero gaps), so the raw-fill-value
difference (DQK's `0x16` memset vs CoAB's implicit `0`) never survives to the final surface as a
distinguishing "untouched region." The actual, measured rejection of "DQK is CoAB verbatim" is (a)
the NE-corner tile-7-vs-1 divergence above, requiring a door (edge flag 3), and (b) DQK never
reading its RNG at all, against CoAB's own (floor-plane-gated) furniture pass. See
`dqkCombatMap.test.ts` for the full measurement, including the shuffled-input null (also 1250/1250
agreement — the null and the real case are only distinguished by the crafted-door and RNG tests,
not by the whole-surface comparison).

**Consumer:** `apps/web/src/ui/dqkExplore.ts`'s `launchDqkCombat`, via the new
`dqkDungeonTerrainForArea()` helper, for all 20 GEO.GLB dungeon areas (ids `2,4,10,14,18,22,24,26,
30,34,38,42,46,47,50,54,58,62,63,66`). DQK's ECL-owned wilderness/overland area 5
(`DqkArea5OverlandSession`) has no Gen2 GEO grid to sample and still falls through to `combat.ts`'s
flat 13x9 field — confirmed by `GB_E2E_ONLY=explore-dqk pnpm --filter @goldbox/web e2e` going RED
at the `explore-dqk` case's own pin: `dqkCombatMapSize: {"w":50,"h":25} (expected the disclosed
flat 13x9 fallback)`, exactly as that pin's own comment anticipated for "the day someone DOES wire
it."

## R3 (Round 33) — Wilderness Combat-Surface Population, byte-transcribed

The "Compare... `SetupWildernessFloor()`" half of the R1-era item above is now also done. TypeScript:
`packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkWildernessCombatMap`), tested in
`packages/engine/test/dqkCombatMap.test.ts`. Every branch cites the `DQK.EXE` file offset it
transcribes; disassembly excerpts for the five named routines plus their two helpers follow.

**Dispatcher's wilderness branch, `0x02cb2b`** (the `[0xb20f]+0x22 == 0` arm of `0x02cb60`, sibling
to R1's dungeon branch which shares the same dispatcher):

```
02cb2b  mov  ax, 0x45 / push ax          ; fill value 0x45
02cb2f  mov  ax, 0x4e2 / push ax         ; 1250 cells
02cb33  mov  dx,[0xbedd] / mov ax,[0xbedb] / add ax,9
02cb3d  push dx / push ax
02cb3f  lcall 0xd7,0x27a6                ; far memset -- SAME call R1's dungeon fill uses (there: 0x16)
02cb47  les  bx,[0xb20f]
02cb4b  mov  al, es:[bx+0x1a2]           ; [0xb20f]+0x1a2 -- "currentCity" analogue
02cb50  mov  [0xa960], al                ; -> resolved city index 0x02c473 indexes with
02cb53  call 0x2c550                     ; floor01
02cb57  call 0x2c6d7                     ; floor02
02cb5b  call 0x2c869                     ; floor03
02cb5f  retf
```
Confirms the memset fill id (`0x45`), the `[0xb20f]+0x1a2` -> `[0xa960]` copy, and the fixed
floor01/floor02/floor03 call order -- no other passes exist.

**Flags-table lookup, `0x02c473`:**

```
02c473  push bp / mov bp,sp / sub sp,0x20
02c47a  lea  ax,[bp-0x20] / push ax / push ds / mov ax,0x5d7b / push ax / mov cx,0x20
02c486  lcall 0xd7,0x2b69                ; far copy: DGROUP 0x5d7b, 0x20 (32) bytes -> stack
02c48b  mov  al,[0xa960] / mov ah,0 / mov bx,ax
02c492  lea  ax,[bp-0x20] / add bx,ax
02c497  mov  al, ss:[bx]                 ; index the just-copied 32-byte table by [0xa960]
02c49d  retf
```
The copy-to-stack is immaterial (it is a fixed 32-byte table read either way); modelled directly
as `DQK_CITY_INFO[currentCity] ?? 0`. Dumped and compared byte-for-byte against `COAB_CITY_INFO`'s
first 32 entries: **identical, 32/32** (`dqkCombatMap.test.ts`). Null: `GATEWAY_CITY_INFO`, itself a
genuine independently-tuned sibling table, agrees with `COAB_CITY_INFO` on only 31/32 of those same
32 bytes (index 31: `0x20` vs `0x80`) -- DQK's exact match is signal, not an artifact of every title
sharing this table's shape.

**Floor01, `0x02c550`** (+ helper `0x02c49e`, the river-mouth "notch" writer):

```
02c550  push bp / mov bp,sp / sub sp,4
02c556  les  bx,[0xb20f]
02c55a  cmp  es:[bx+0x33], 0
02c55f  jne  0x2c564
02c561  jmp  0x2c6d3                     ; gate closed -> return, ZERO dice consumed
02c564  mov al,4/push ax / mov al,5/push ax
02c56a  lcall 0x48f,0x1968               ; 5d4 -- the pass's FIRST roll when the gate is open
02c571  mov dl,0x22 / sub dl,al          ; col = 0x22 - roll
02c57d  ...(inc ax;inc ax)/idiv 7; jg 0x2c57a   ; while ((col+2)%7)>0: col--
02c58d  mov [bp-3],1                     ; counter = 1
02c591..02c6c7  for row=0..0x18: ... (body, see dqkCombatMap.ts inline citations)
```
The gate at `0x2c55a..0x2c561` reads `[0xb20f]+0x33` DIRECTLY -- no roll spent on it at all, where
CoAB's own gate (`coabCombatMap.ts:406..410`, `if (rollDie(rng,100) > threshold) return;`) rolls a
d100 UNCONDITIONALLY before the check, every time, gate outcome or not. Confirmed empirically in
`dqkCombatMap.test.ts`: with the gate open, DQK's very first logged roll has `sides=4` (the 5d4
column roll); CoAB's very first logged roll (any `currentCity`, since the roll precedes the
threshold test) always has `sides=100`. This is the exact, verified mechanism behind "DQK consumes
one d100 fewer than CoAB whenever pass 1 runs."

Helper `0x02c49e` (`dqkWildernessFloor01Notch`) confirmed against fresh disassembly: `bx` is
computed ONCE from `(x=bp+6, y=bp+8)` as `[0xbedb]+y*50+x`, then reused with FOUR different fixed
offsets -- `+9` (cell `x`, unconditional `0x3a`), `+0xa` (cell `x+1`, gated `x<0x31`, `1d2+0x3a`),
`+0xb` (cell `x+2`, gated `x+1<0x31`, `1d2+0x3a`), `+0xc` (cell `x+3`, gated `x+2<0x31`, fixed
`0x3d`) -- exactly the `+9=+0`, `+0xa=+1`, `+0xb=+2`, `+0xc=+3` relative addressing the R1 dungeon
cell-writer anchor already established, applied here to a different base pair. The out-param write
resetting the caller's counter to `1` is `02c547..02c54a` (`les bx,[bp+0xa]; mov es:[bx],1`).

**Floor02, `0x02c6d7`:**

```
02c6d7  call 0x2c473 / test al,0x80 / je 0x2c6e8 / jmp 0x2c865      ; early exit, same bit as CoAB
02c6e8  mov  [bp-1], 5                                              ; neededRoll base = 5 (CoAB: 10)
02c6ec  call 0x2c473 / and al,[0x5d0a] / or al,al / je .. / sub [bp-1],3   ; flags & [0x5d0a] -=3
02c6fc  call 0x2c473 / test al,4      / je .. / sub [bp-1],3         ; flags & 4  -=3
02c708  call 0x2c473 / test al,0x40   / je .. / add [bp-1],2         ; flags & 0x40 +=2
02c714  call 0x2c473 / test al,8      / je .. / add [bp-1],5         ; flags & 8  +=5
02c720  cmp [bp-1],0 / jge .. / mov [bp-1],1                         ; clamp <0 to 1
```
`[0x5d0a]` (file `0x69724`) is a single DGROUP mask byte, value `0x02` in the shipped binary --
functionally CoAB's own `cityFlags & 2` test, read through a byte rather than an immediate. Every
BIT tested (`0x80`, `[0x5d0a]`=2, `4`, `0x40`, `8`) is identical to CoAB's; every MAGNITUDE
(`5,-3,-3,+2,+5` vs CoAB's `10,-5,-2,+5,+10`) is DQK-specific, roughly but not exactly halved. The
population loop and its two-roll gate/write bodies (`02c731..02c865`) are byte-identical in
structure and tile-id formulas to CoAB's `setupWildernessFloor02` -- see the inline file-offset
citations in `dqkWildernessFloor02` (`dqkCombatMap.ts`).

**Floor03, `0x02c869`** (+ helper `0x02c9d3`, the per-cell stepped writer):

```
02c869  push bp / mov bp,sp / sub sp,2 / push si
02c870  mov  si, 0x32                                                ; score = 50, same base as CoAB
02c873  call 0x2c473 / test al,0x10 / je .. / add si,0xa             ; +10
02c87e  call 0x2c473 / test al,0x20 / je .. / add si,0x1e            ; +30
02c889  call 0x2c473 / test al,0x40 / je .. / add si,0x14            ; +20
02c894  call 0x2c473 / test al,4    / je .. / sub si,0xa             ; -10
02c89f  call 0x2c473 / and al,[0x5d0a] / or al,al / je .. / sub si,0x14   ; -20, via [0x5d0a] like floor02
02c8ae  call 0x2c473 / test al,0x80 / je .. / sub si,0x32            ; -50
```
Every bit AND magnitude here matches CoAB's `setupWildernessFloor03` exactly (unlike floor02).
Helper `0x02c9d3` (`dqkSetGroupMapStepped`), confirmed against fresh disassembly:

```
02c9d3  ... lcall 0x48f,0x1968 (1d100) -> [bp-1]=roll
02c9ec  cmp al,[bp+0xa]         ; roll <= s0 (bp+0xa)?  ja -> 0x2ca1e
02c9f1  ... write 1d2+0x31, jmp 0x2cb27                              ; bucket 1
02ca1e  [bp+0xa]+[bp+0xc]+1 vs roll ; roll <= s0+s1+1 (bp+0xc = s1)?  jl -> 0x2ca51
02ca34  ... write 0x2c (FIXED), jmp 0x2cb27                          ; bucket 2
02ca51  [bp+0xa]+[bp+0xc]+1 vs roll ; IDENTICAL threshold recomputed  jl -> 0x2ca94
02ca67  ... write 1d5+0x2c, jmp 0x2cb27                              ; bucket 3 -- UNREACHABLE
02ca94  [bp+0xa]+[bp+0xc]+[bp+0xe]+[bp+0x10] vs roll                 ; s0+s1+s2+s3, bucket 4
02cac7  ... write 0x44, jmp 0x2cb27
```
`0x2ca1e..0x2ca32` and `0x2ca51..0x2ca65` compute the BYTE-IDENTICAL expression
`[bp+0xa]+[bp+0xc]+1` from the same two inputs (`s0`,`s1`) -- bucket 2 (the first to test this
threshold) claims every roll `<= s0+s1+1` and returns, so bucket 3's own `1d5+0x2c` write
(`0x2ca67..0x2ca8d`) can never execute. This is a genuine dead branch compiled into shipped
`DQK.EXE`, not a transcription error. Confirmed empirically (`dqkCombatMap.test.ts`'s "dead branch"
test): across all five score bands and several dice seeds, `buildDqkWildernessCombatMap`'s output
never contains an id in bucket 3's exclusive range (`0x2d..0x31`, since bucket 2 always writes the
single fixed value `0x2c` first). The five score bands themselves (`02c8f8..02c9b6`) pass IDENTICAL
step values to CoAB's own four call sites except band `10..29`, whose `stepD` is DQK `0x14`(20)
against CoAB's `0xe`(14) -- the sole differing step value in this pass's setup.

**Comparison vs the plan's "verbatim CoAB under a tile-id relabel" alternative:** DQK's and CoAB's
wilderness tile-id vocabularies are genuinely DISJOINT numeric ranges (unlike the R1 dungeon case,
which shared ids `0..0x18`), so raw byte-id comparison rejects "verbatim" trivially and
uninformatively (measured: 6/1250, alternative predicted 1250/1250) regardless of whether the
underlying algorithms match. The fair test compares at the semantic CATEGORY level (fill / pass1 /
pass2 / pass3, each derived from a builder's own internally-disjoint write-id ranges, verified
directly from source above and in `dqkCombatMap.test.ts`) with the SAME dice stream fed to both
builders. That measured **527/1250** category agreement on `(currentCity=1, pass1Gate=true, seed=42)`
-- but the reseeded-independent-streams null measured on the SAME flags was ALSO **527/1250**, and
repeating both conditions across five different seed pairs found no separation at all (same-seed
trials: 527, 584; independent-seed trials: 518, 527, 446 -- fully overlapping ranges). **The
finding is not "low agreement" but "zero measurable extra correlation from sharing the dice tape
at all"**: DQK's pass 1 gate consumes zero dice against CoAB's mandatory one (proven above), so the
two builders' consumption of a shared stream desynchronises from the very first decision and never
resynchronises -- a stronger rejection of "verbatim under a relabel" than the plan's own predicted
mechanism (a raw tile-id/fill-value difference). Per-pass dice consumption on those same flags:
DQK p1=80, p2=1238, p3=947 (total 2265) vs CoAB's total 2604 (CoAB's three pass functions are
module-private, so no CoAB per-pass split is available without editing `coabCombatMap.ts`, which
this item does not own).

**Native inputs with no found writer:** `[0xb20f]+0x1a2` ("currentCity") and `[0xb20f]+0x33`
(pass 1's gate) have no writer in the modelled area-5 overland ECL host
(`world/dqkArea5Overland.ts`'s tracked memory offsets are an entirely different, ECL-VM-addressed
byte space -- `0x00c0/0x00c1/0x001b/0x00ca..0x00cc/0x003a` -- not this native DGROUP struct). Both
ship as explicit `DqkWildernessCombatMapInput` fields with stated defaults (`currentCity` -> `0`,
`pass1Gate` -> `true`) rather than an invented value.

**Consumer:** `apps/web/src/ui/dqkExplore.ts`'s `launchDqkCombat`, via the new
`dqkWildernessTerrainForArea5()` helper (deep-importing `buildDqkWildernessCombatMap` directly from
`packages/engine/src/combat/dqkCombatMap.ts` pending a Phase B `index.ts` export -- see "Remaining
Work"), for area 5 specifically; all other areas still use `dqkDungeonTerrainForArea` (R1). This
replaces area 5's previous fallback to `combat.ts`'s flat 13x9 field.

## Remaining Work

- Extend the DQK terrain-table carve beyond `0x69c7f` to determine whether later rows rejoin the current
  CoAB-shaped table, remain DQK-specific variants, or point to a different Gen2 terrain table.
- Extend the DQK terrain-table comparison beyond native-valid row `0x4c` only if later code proves ids
  above `0x4c` have a separate use; the renderer clamps them for combat background drawing.
- Continue beyond the palette/header branch and find the separate Gen2 path, if any, that maps realized
  `DUNGCOM.TLB` / `WILDCOM.TLB` 24x24 image entries to live combat tile/render bank slots.
- Reconcile `BackGroundTiles.tileIndex+1` against visual samples for `DUNGCOM.TLB` / `WILDCOM.TLB`.
- Keep the overlay-12 fixup-entry/runtime trace work available for broader routine recovery; the direct
  DGROUP refs above are enough for the first combat-cluster xref pass, but not for full routine
  equivalence.
- ~~Compare DQK's Gen2 combat-area population against CoAB `SetupDungeonFloor()` /
  `SetupWildernessFloor()` before reusing CoAB map-building details as DQK facts.~~ **done** for both
  halves -- dungeon in R1 (Round 32), wilderness in R3 (Round 33), above.
- `buildDqkWildernessCombatMap` is not yet re-exported from the `@goldbox/engine` barrel
  (`packages/engine/src/index.ts`); `dqkExplore.ts` deep-imports it directly as a stated, temporary
  workaround. Add the export (and `DqkWildernessCombatMap`/`DqkDiceRoller`/`DqkWildernessCombatMapInput`/
  `DQK_CITY_INFO`) the next time `index.ts` is not single-writer-locked, then switch the import back
  to `@goldbox/engine`.
- `apps/web/test/e2e.mjs`'s `explore-dqk` case still asserts area 5's combat surface is the flat
  13x9 fallback; now that area 5 gets real 50x25 wilderness terrain, that assertion needs updating
  (see the intended patch text in the R3 handoff/report) the next time `e2e.mjs` is not
  single-writer-locked.

## Verification

```powershell
pnpm --filter @goldbox/engine exec vitest run test/dqkCombatCluster.test.ts --reporter=verbose
pnpm --filter @goldbox/engine exec vitest run test/combatTerrain.test.ts --reporter=verbose
python tools/disasm_dqk.py --overlays
python tools/disasm_dqk.py --overlay12-combat
python tools/disasm_dqk.py --dqk-hlib-combat
python tools/disasm_dqk.py --dqk-combat-map
python tools/disasm_dqk.py --dqk-render-copy
python tools/disasm_dqk.py --dqk-combat-set-selection
python tools/disasm_dqk.py --dqk-ca03-xrefs
python tools/disasm_dqk.py --dqk-combat-render-path
python tools/disasm_dqk.py --disasm 0x128c7 --len 0x50
python tools/disasm_dqk.py --disasm 0xc01c --len 0x120
python tools/disasm_dqk.py --disasm 0xc9cc --len 0x80
python tools/disasm_dqk.py --disasm 0x1a296 --len 0x120
python tools/disasm_dqk.py --disasm 0x18661 --len 0x120
python tools/disasm_dqk.py --disasm 0x2bcf0 --len 0x90
python tools/disasm_dqk.py --disasm 0x2c397 --len 0x120
python tools/disasm_dqk.py --disasm 0x2cb2b --len 0x80
python tools/disasm_dqk.py --disasm 0x2c6d7 --len 0x120
python tools/disasm_dqk.py --disasm 0x2ba4c --len 0x200
python tools/disasm_dqk.py --disasm 0xc355 --len 0x80
python tools/disasm_dqk.py --disasm 0xc6c1 --len 0x120
python tools/disasm_dqk.py --disasm 0x19980 --len 0x120
python tools/disasm_dqk.py --disasm 0x1b9ed --len 0x80
python tools/disasm_dqk.py --disasm 0x1ba91 --len 0x80
python tools/disasm_dqk.py --disasm 0x1bb70 --len 0x80
python tools/disasm_dqk.py --lcallers 0x09a4 0x0515
python tools/disasm_dqk.py --lcallers 0x09a4 0x0881
python tools/disasm_dqk.py --lcallers 0x104c 0x0007
python tools/disasm_dqk.py --lcallers 0x09a4 0x01dc
python tools/disasm_dqk.py --lcallers 0x09a4 0x0b8c
python tools/disasm_dqk.py --lcallers 0x1796 0x0536
python tools/disasm_dqk.py --lcallers 0x161b 0x00b1
python tools/disasm_dqk.py --lcallers 0x161b 0x000b
python tools/disasm_dqk.py --lcallers 0x161b 0x0455
python tools/disasm_dqk.py --disasm 0x2cb2b --len 0x50
python tools/disasm_dqk.py --disasm 0x2c473 --len 0x60
python tools/disasm_dqk.py --disasm 0x2c49e --len 0x90
python tools/disasm_dqk.py --disasm 0x2c550 --len 0xa0
python tools/disasm_dqk.py --disasm 0x2c6d7 --len 0x60
python tools/disasm_dqk.py --disasm 0x2c869 --len 0x60
python tools/disasm_dqk.py --disasm 0x2c9d3 --len 0x100
pnpm --filter @goldbox/engine exec vitest run test/dqkCombatMap.test.ts --reporter=verbose
```
