# Decompile — ovr030 / ovr031: first-person 3-D world renderer (Krynn)

> Loop iteration 10 of `decompile-worklist.md`. Subsystem: **the first-person dungeon/
> wilderness view** — the far→mid→near cell walk, the 8×8-symbol wall compositing, the
> WALLDEF/GEO loaders, and the sky/time-of-day backdrop. Primary source: COAB
> `coab_extracted/engine/ovr031.cs` — `Draw3dWorld` = `sub_71820`, `Draw3dWorldFar/Mid/Near`,
> `Draw3dWorldBackground`, `draw_3D_8x8_titles` = `sub_71434`, `getMap_wall_type`,
> `WallDoorFlagsGet` = `sub_71573`, `get_wall_x2` = `sub_717A5`, `LoadWalldef`, `Load3DMap` —
> and `ovr030.cs` (pic/sprite/bigpic compositing). Cross-checked against
> `packages/engine/src/world/wallview.ts` and `native/src/ccfp.asm` (CCFP).

## `Draw3dWorld` (sub_71820) — depth walk — VERIFIED

Relative directions off the party facing: `left=(dir+6)%8`, `behind=(dir+4)%8`,
`right=(dir+2)%8`. The view is painted **far→near** over three depth steps:

```
drawStep = 2 (FAR, 2 cells ahead) → 1 (MID, 1 ahead) → 0 (NEAR, party cell)
drawX/Y starts 2 cells ahead (partyPos + 2·MapDirectionDelta[dir]);
each step moves one cell back toward the party (+ MapDirectionDelta[behind]).
```

So `Draw3dWorldFar/Mid/Near` each render one depth band, and because Near is painted last it
**overpaints** the farther bands — classic painter's-order Gold Box pseudo-3D. (`mapAreaDisplay`
swaps the whole view for the overhead `DrawAreaMap` instead.)

### Far band fans — `Draw3dWorldFar`

Each band sweeps a **4-cell fan left** then a **4-cell fan right** of the centre ray (stepping
by `MapDirectionDelta[left]` / `[right]`, column offset `Col ∓= 2` per cell), plus a 3-cell
side-wall pass. For every cell it reads `getMap_wall_type(facing, y, x)` and, when a wall is
present, emits the front face (`draw_3D_8x8_titles(0, …)`) and a join/cap piece
(`draw_3D_8x8_titles(9, …)`) where a run of walls breaks. Mid and Near repeat the pattern with
larger pieces nearer the camera.

## `draw_3D_8x8_titles` (sub_71434) — 8×8 piece compositor — VERIFIED tables

A "piece" (`offsetIndex` 0..9) is a rectangle of 8×8 symbols laid into the 11×11 view window
(origin +2,+2; clipped to rows/cols 0..10). The three pinned tables:

```
idxOffset[11] = { 0, 2, 6, 10, 22, 38, 54, 110, 132, 154, 1 }   // seg600:0ADA — symbol base per piece
colCount[10]  = { 1, 1, 1, 3,  2,  2,  7,  2,   2,   1 }         // seg600:0AE4 — piece width  (cols)
rowCount[10]  = { 2, 4, 4, 4,  8,  8,  8, 11,  11,   2 }         // seg600:0AEE — piece height (rows)
```

The wall id `arg_2` decomposes as **`wallset = (arg_2-1)/5`, `slice = (arg_2-1)%5`** — i.e.
**5 slices per wall set** — and each symbol is `wallDef.blocks[wallset].Id(slice, idx)`,
`idx` walking from `idxOffset[offsetIndex]`. Symbols blit via `ovr038.Put8x8Symbol` (keyed,
skipping the transparent index). This table set is the authoritative pin for how a wall slot
maps to a grid of 8×8 tiles at each depth.

## Map cell lookups — VERIFIED

- **Maps are 16×16, toroidal** (`MapSize=16`; `get_wall_x2`/`getMap_XXX` wrap `>0x0F→0`,
  `<0→0x0F`) — the same wrap ovr015 movement uses.
- `getMap_wall_type(dir, y, x)` → the cell's `wall_type_dir_{0,2,4,6}` (the four cardinal
  edges; only even directions carry walls).
- `WallDoorFlagsGet(dir, y, x)` → the `x3_dir_N` **door-unlocked bit** for that edge (the exact
  bits ovr015's `MapSetDoorUnlocked` writes — renderer and movement share them).
- `get_wall_x2(y, x)` → the cell's `x2` (overhead/roof byte), used for the sky test below.
- **Edge rule:** off-map cells return 0 (open) **only when `EclBlockId ∈ {0,10}`**; otherwise
  the coordinate wraps — so scripted/border areas behave differently from open wilderness.

## Sky & time-of-day — `Draw3dWorldBackground` — VERIFIED (a likely engine gap)

Draws the sky colour block + floor, then — **only outdoors** (`get_wall_x2 < 0x80` and
`sky_colour == 11`) — overlays a **sun/moon sprite positioned by `area_ptr.time_hour` and
`mapDirection`**:

- **sunrise** hours 1–5: visible facing **East (dir 2)** (and partly **North dir 4** for hour>2),
  the sprite rising as `row = (2+5) − hour`;
- **sunset** hours 13–18: visible facing **West (dir 6)** (and North for hour≥16), sinking as
  `row = (2+hour) − 13`;
- facing **North (dir 0)** always shows the `sky_dax_250` body.

So the first-person view's sky tracks the **game clock** (ovr021's `time_hour`) and compass —
the sun/moons (`sky_dax_250/251/252`) move across the sky by hour. This couples the renderer to
the clock and the moon-phase system.

## Asset loaders — VERIFIED block sizes

- `Load3DMap` (`GEO{area}.dax`): each 3-D map block is **exactly `0x402` (1026) bytes** =
  16×16 cells × 4 bytes + a 2-byte header (the GEO cell record `loaders/geo.ts` already decodes).
- `LoadWalldef` (`WALLDEF{area}.dax`): wall-symbol records of **`0x30C` (780) bytes** each, up
  to **4 wall sets** per area (`(size/0x30C)+symbolSet ≤ 4`); relocated by `symbol_set_fix`,
  paired with `8X8D` tile pools (`ovr038.Load8x8D`).

## Krynn-binary anchors (CoK GAME.OVR)

| Routine | Anchor string | file offset |
| --- | --- | --- |
| `LoadWalldef` | `"WALLDEF"` (+ `".dax"`) | **0x3e26f** |
| `Load3DMap` | `"Unable to load geo in Load3DMap."` | **0x3e583** |

(`tools/disasm_cok.py strings`.) Byte-level confirmation of the `idxOffset/colCount/rowCount`
tables and the time-of-day branches is pending the overlay DGROUP base (methodology §3.2); the
algorithm is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

The old missing-sky-layer report is superseded. `packages/engine/src/render/sky.ts`
implements `selectSkyColour`, `skyBodyPlacement`, `paintSkyBackdrop` and
`renderFirstPersonViewWithSky`, composing sky/floor/body before the far-to-near walls.
`apps/web/src/ui/explore.ts` calls that composite. Coverage is in
`packages/engine/test/sky.test.ts`.

The caller still supplies default `AREA_SKY` indices, and `roofByteOf` defaults to indoor
when a cell has no decoded roof byte. Real per-area indices, title-local body sprites and
placement therefore remain fidelity work; the optional body fallback is a colored block.
An injected title-native backdrop bypasses those generated bands/body. Keep these limits
separate from the implemented wall projection and the existence of the sky helper.

## Gen1 ↔ Gen2

The Gen1 reference explains the far-to-near wall composition used by the current helper.
DQK uses different VGA assets and title-local rendering evidence. The old blanket claim
that all WALLDEF/GEO sizes, piece tables and projection behavior were identical across
the trilogy was not established by this COAB-backed note.
