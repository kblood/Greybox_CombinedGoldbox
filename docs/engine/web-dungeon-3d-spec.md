# Web 3D dungeon view - design spec (rev 2)

Status: DESIGN ONLY (rev 2, 2026-10-07). Nothing here is built, run, committed or deployed.
Request (Danish, translated): a 3D version of the dungeons for the Goldbox web part, built on how
the walls are read in the dungeon view, so 3D and 2D agree.

Scope: the web-engine secondary track. The primary deliverable (native DOS engine) is untouched.

Fact policy. Facts tagged (read) were read from source on 2026-10-07 (`loaders/geo.ts`,
`world/wallview.ts`, `world/explorer.ts`, `model/index.ts`, `world/dungeonWalls.ts`, the ovr015 and
ovr030 research docs). Tagged (reviewer) are census figures a reviewer measured with scratch scripts;
they are hypotheses until the tests in section 4 re-derive them and MUST NOT be quoted elsewhere as
facts. Nothing else was executed. Rev 2 changes are summarised in appendix A; rejected critique items
are in appendix B.

## 0. Decisions (and what is left to the user)

1. **Renderer: hand-written WebGL2, no new dependency**, with a **Canvas2D fallback** painting the
   same mesh. three.js is rejected for v1 (first dependency in `apps/web`). Open to the user: switch to
   three.js if scope grows to models/lighting. The engine module is renderer-neutral. The renderer is a
   **lazily imported chunk** (dynamic `import()` from the route/sidebar handlers) so first paint of the
   viewer does not grow; a bundle-size delta is recorded in the implementer's handoff (section 4.4).
2. **Engine module is pure TS** in `packages/engine` (zero DOM). Renderer in `apps/web/src/ui`.
3. **Wall reading model (rev 2).** The 2D view reads a wall only from INSIDE a cell: far front is
   `wt(facing, cell)`, side walls `wt(left|right, cell)`; the edge facing the viewer is never read
   (read, `wallview.ts`). `wallType()` on an in-grid cell returns `cell.walls[dir]` directly and never
   looks at a neighbour; the wrap affects only OUT-OF-GRID coordinates (read, `wallview.ts:45-53`). The
   3D mesh therefore uses: **own-side quads, one-sided (back-face culled) rendering, per-side slots**,
   plus an explicit **topology** (section 1.4) for what lies beyond the grid edge.
4. **Per-edge ownership is directed** (`sharedEdges:false`). Each cell emits a quad for each of ITS OWN
   nonzero sides, visible only from that cell's interior side. A wall present from both sides is two
   coincident back-to-back quads, each with its OWN slot (the two sides can carry different slots,
   (reviewer) CoK 2506 of 14400 and DoK 3520 of 18240 directed sides). A one-way edge is one quad and is
   INVISIBLE from the open neighbour, exactly as in 2D. **Back-face culling is a hard requirement of both
   renderers** (section 2.3a) and has its own tests.
5. **Door semantics are unresolved in the repo and the spec says so** (section 1.3) instead of silently
   choosing "passable".

## 1. Engine module: `packages/engine/src/world/dungeon3d.ts`

### 1.1 Interface

```ts
import type { GameMap, Direction } from '../model/index.js';

/** 1 cell = 1 unit. X east+, Z south+, Y up. Cell (x,y) spans X [x,x+1], Z [y,y+1]. North = -Z. */
export const CELL_SIZE = 1;
export const WALL_HEIGHT = 1;

export type Face = 'north' | 'east' | 'south' | 'west';

export interface WallQuad {
  x: number; y: number;               // owning cell (in-grid only; torus copies are a view concern)
  side: Direction;                    // == the cell.walls key
  slot: number;                       // THIS side's raw nibble, 1..15
  /** The neighbour's opposite-side nibble, or null when there is no in-grid neighbour. */
  reverseSlot: number | null;
  /** Both sides walled but slot !== reverseSlot. Textures are keyed per quad slot, never per edge. */
  slotMismatch: boolean;
  /** Raw 2-bit plane-3 flag for this side, 0..3. */
  door: number;
  doorState: 'none' | 'closed' | 'open';   // per SIDE (doorsOpen is stored on one cell only)
  /** Movement class, see 1.3. */
  passage: 'blocked' | 'door' | 'locked' | 'gateway';
  /** Neighbour exists in-grid and has no wall on its opposite side (wall seen from one side only). */
  oneWay: boolean;
  /** Side lies on the grid edge (no in-grid neighbour). */
  boundary: boolean;
  corners: readonly [number, number, number][];  // 4, CCW seen from the owning cell's interior
  face: Face;                                    // outward normal; used for back-face culling
}

/** An edge with slot 0 but non-zero door bits. Emits NO wall quad; surfaced so it is not lost. */
export interface DoorOnOpenEdge { x: number; y: number; side: Direction; door: number; }

export interface FloorQuad {
  x: number; y: number;
  backdrop: number;                   // cell.floor, the plane-2 byte (zone/graphic selector, NOT a texture id)
  outdoor: boolean;                   // backdrop < 0x80 per ovr030 Draw3dWorldBackground (read, doc); see 1.5
  corners: readonly [number, number, number][];
}
export interface CeilingQuad { x: number; y: number; corners: readonly [number, number, number][]; }

export interface DungeonMesh {
  name: string; width: number; height: number;
  topology: 'bounded' | 'torus';
  walls: WallQuad[];                  // sorted (y, x, N,E,S,W): deterministic
  doorsOnOpen: DoorOnOpenEdge[];
  floors: FloorQuad[];                // row-major
  ceilings: CeilingQuad[];            // row-major, indoor cells only
  stats: { walls: number; oneWay: number; slotMismatch: number; doors: number;
           doorsOnOpen: number; boundary: number; openBoundary: number; cells: number };
}

export interface BuildMeshOptions {
  /** Default: 'torus' for Gen1 16x16 maps unless eclBlockId is 0 or 10, else 'bounded'.
   *  DQK/Gen2 and FRUA default 'bounded'. See 1.4. */
  topology?: 'bounded' | 'torus';
  /** The ECL block id the 2D view would use for off-map reads; 0 or 10 => off-map is open (bounded). */
  eclBlockId?: number;
  ceilings?: boolean;                 // default true; only emitted for cells with outdoor === false
  /** Caller hint that a map is an overland/world map. When true AND rejectOverland (default true) the
   *  builder returns null. A mislabel is not silent: stats.openBoundary is large for open worlds and the
   *  view surfaces it (2.2). */
  overland?: boolean;
  rejectOverland?: boolean;
}

export function buildDungeonMesh(map: GameMap, opts?: BuildMeshOptions): DungeonMesh | null;

/** Wall key set of a mesh ("x,y,side"). Test/diagnostic helper; consumed by the seam's meshWallKeys. */
export function meshWallSet(mesh: DungeonMesh): Set<string>;

/** Pure movement predicate SHARED with Explorer (see 1.6): the class of the edge leaving (x,y) via dir. */
export function stepTarget(map: GameMap, x: number, y: number, dir: Direction,
                           topology: 'bounded' | 'torus', opts?: { allowLocked?: boolean }
                          ): { x: number; y: number } | null;

/** Back-face test. true iff the quad's outward normal faces away from the camera (must be culled). */
export function isBackFacing(q: WallQuad, camX: number, camZ: number): boolean;

/** Painter order for the Canvas2D fallback: back-face culled, far to near. */
export function paintOrder(mesh: DungeonMesh, camX: number, camZ: number): WallQuad[];

export interface FrontFaceRequest { slot: number; }   // keyed by RAW slot only, see 2.5
export function frontFaceRequests(mesh: DungeonMesh): FrontFaceRequest[];
```

`predicateWallSet` from rev 1 is DELETED: it was a second copy of the same expression (tautology). The
independent oracle is in the tests (4.1), never exported from the module under test. This also removes
the `engine_export_consumers.py` problem for a test-only export; the remaining new exports each have a
non-test consumer in the view (`buildDungeonMesh`, `stepTarget`, `isBackFacing`/`paintOrder`,
`frontFaceRequests`, `meshWallSet` via the seam, constants via the renderer). Implementer confirms by
running that gate.

Grid guarantees the module relies on (read from `GameMap`): Gen1 maps are 16x16 with
`cells[y*16+x]`; Gen2 (`decodeGen2GeoBlock`) is `width*height` with **header byte 0 = HEIGHT, byte 1 =
WIDTH** (read, `geo.ts`, proven against DQK.EXE `GetFacingWallType`). The stale comment in
`native/src/ccgeo.asm:51-52` says width then height and MUST NOT be followed. The module indexes with
`map.width`/`map.height` generically and never hard-codes 16.

### 1.2 Texture hint

No pixels in the engine. `frontFaceRequests` returns distinct raw slots only. Wallset/slice are NOT
exposed as texture keys, because the repo describes `slice` two ways (`wallpieces.ts:64-66` "variant
slice" vs `dungeonWalls.ts:42` "5 depth slices x 156 pool columns"); the derived `wallset`/`slice`
fields of rev 1 are removed until that is settled.

### 1.3 Doors, locks and special bits

The repo's own sources conflict and the spec records the conflict instead of resolving it:

- `geo.ts:149-150` and `importer.ts` say flag 2 = "gateway/special".
- `decompile-ovr015-movement.md:43-44` (read): `bash_door`/`pick_lock` treat
  `WallDoorFlagsGet == 3` as a LOCKED door.

`passage` therefore classifies: `blocked` (walled, door 0), `door` (walled, door 1), `gateway`
(walled, door 2), `locked` (walled, door 3). Open edges have no quad. Movement rule, chosen to match the
2D `Explorer.edgeBlocks` (`walls !== 0 && doors === 0` blocks, read) for door 1 and 2 while NOT
walking through locked doors: `blocked` and `locked` block; `door` and `gateway` pass; `locked` passes
only when the caller sets `allowLocked` (the view offers a "pass locked doors" toggle, default OFF, with
a status note). This is a deliberate, documented difference from `Explorer.edgeBlocks` for value 3 only;
the shared predicate (1.6) takes the difference as an explicit parameter so it is tested, not hidden.
(reviewer) retail census: CoK door flags on walled edges 1:1701, 2:95, 3:9; DoK only flag 1 on walled
edges. Re-derived by the tests.

Door bits on slot-0 edges (reviewer: CoK 8, DoK 3; FRUA can encode lock/blocked kinds with slot 0 in
`importer.ts:22-33`) emit no wall quad but are listed in `mesh.doorsOnOpen` and counted, and the view
draws a marker at the edge. For FRUA, "blocked" (kind with slot 0) is rendered as a translucent
barrier and `stepTarget` blocks it; secret/false-door kinds ARE a concept there (rev 1's "no secret-door
concept" applied to Gen1 only and is corrected).

`doorsOpen` is stored on the ONE cell whose bit was set (`MapSetDoorUnlocked`, read, `model/index.ts`),
so `doorState` is per SIDE and the two sides of a door may disagree. Rendering rule: a door whose
state is `open` on the viewed side draws that side as an outlined, 50% transparent quad (so the user sees
through it); this is a 3D-only enhancement with NO 2D parity oracle (the 2D view never draws open vs
closed). Standalone sessions keep `doorsOpen` local and never persisted.

Specials (teleporters, pits) are ECL-driven: no geometry. Non-goal.

### 1.4 Boundary and topology (rev 2: wrap is modelled, not dropped)

Three conventions exist and the spec names all of them:

1. **Gen1 2D view / movement (read):** 16x16 toroidal. Off-map reads clamp-wrap to the opposite edge
   unless the ECL block is 0 or 10 (then open). `decompile-ovr015-movement.md` states movement wraps
   (`mapPos &= 0x0F`) too.
2. **DQK binary (read, `geo.ts`):** off-map coordinates are CLAMPED against `width-1`/`height-1`, so a
   read past the edge returns the edge cell's own wall. No wrap.
3. **The 3D mesh/`Explorer`:** `Explorer` today treats the grid edge as blocking (edge cases not
   wrapped).

Rule: `topology` is an explicit mesh property. Gen1 defaults to `'torus'` (matching the 2D view and the
original), 0/10 blocks and Gen2 default `'bounded'`. A boundary side's quad is emitted iff its own
nibble is nonzero in every topology. What differs:

- `torus`: the view draws the mesh at 3x3 translated copies so the far view across the edge shows the
  wrapped cells; `stepTarget` wraps; `boundary:true` quads are not "map edge".
- `bounded`: no wrap; an open boundary side shows a "map edge" plane (view-level) and `stepTarget`
  blocks.
- DQK clamp semantics are recorded as a DQK 2D-convention note; the 3D view does not claim DQK 2D
  parity (no web DQK first-person oracle exists). Its parity is tested against the clamp rule (4.1 item 3b).

Open boundary sides are common, not rare (reviewer, open/total): CoK 23/960, DoK 234/1216, Curse
30/1024, Pool of Radiance 432/1856, Pools of Darkness 192/2048, Gateway 629/1920, Treasures
1405/2624, Secret 0/1088. `stats.openBoundary` exposes the count so a mislabelled open world is visible.

### 1.5 Ceilings and outdoors (rev 2)

`cell.floor` is plane 2 (read, `geo.ts:157`), which `decompile-ovr030-3d-renderer.md` identifies as the
`get_wall_x2` byte whose test `< 0x80` selects outdoors (sky drawn only then). `explore.ts` `roofByteOf`
says the byte is "not decoded"; that is about the roof graphic, not this test. Rule: `outdoor =
cell.floor < 0x80` (Gen1 only; marked "from doc, re-verify against `GAME.OVR` before relying"), ceilings
are emitted only for non-outdoor cells, outdoor cells draw a flat sky colour. The view's "ceiling"
toggle still exists. Gen2/FRUA: `outdoor` is false unless the map supplies it; no inference.

### 1.6 One shared movement predicate

`stepTarget` is the single implementation. `Explorer.edgeBlocks` is refactored to call an exported pure
`edgeClass(walls, doors, dir)` helper from `explorer.ts` (a small separate change, with the Explorer's
tests as regression) so 3D and 2D cannot drift. The only intentional divergence is `locked` (1.3).

## 2. View module: `apps/web/src/ui/dungeon3d.ts`

Exports `startDungeon3d(gameId, assetSource?, areaSel?)` and `closeDungeon3d()`. All paths are under
`apps/web/src/ui/` (there is no `apps/web/src/main.ts`; the router is `apps/web/src/ui/main.ts`).

### 2.1 Lifecycle and teardown

Module state + `dungeon3dMountSeq`; `closeDungeon3d()` first, bump seq. Teardown list (every path,
including error paths):
1. Every GL call and every texture upload is guarded by a seq check; async map load and async texture
   build capture the seq and discard results (and delete any GL object already created) if stale.
2. Cancel RAF and the tween; remove `keydown`, `resize`, pointer listeners; release pointer capture on
   orbit drag.
3. `webglcontextlost` (preventDefault + stop RAF) and `webglcontextrestored` (rebuild buffers/textures)
   handlers; on restore failure fall back to Canvas2D.
4. Delete buffers, textures, programs; call `WEBGL_lose_context.loseContext()` on every close path, so
   repeated open/close cannot exhaust Chrome's ~16 live contexts.
5. Dispose the view-local `Automap` and `composeAutomapPanel` buffers.
6. `window.__dungeon3d = undefined` (same convention as explore: `explore.ts` clears with
   `= undefined`), asserted with `=== undefined` and `typeof`.
7. Pointer/keyboard focus: the canvas is focusable (`tabindex=0`, `aria-label`), keyboard controls
   documented in the status line; `Esc` returns focus to the sidebar entry.

Shader compile/link failure, WebGL2 absence, context-creation failure and context-restore failure all
fall back to Canvas2D with the reason shown in the status line and `seam.rendererReason`.

### 2.2 Map loading (extraction is a separate, gated change)

Helpers needed from `explore.ts` (`listAllGen1Areas`, `GEN1_BASE_GAMES`, `readAssetBytes`,
`fetchDaxRaw`, `buildWallGraphics`, `walldefBlockFor`) are extracted to
`apps/web/src/ui/gen1Areas.ts` as a **separate change that is merged and gated before any step-3+ work
begins**. explore.ts is ~6.8k lines under concurrent edit. Before extraction the implementer enumerates
the closure state each helper touches (module-level caches, status setters, `mountSeq`) and passes them
as parameters; the extraction's proof is **byte-level, not "e2e green"**: a Node script (or e2e step)
hashes each helper's output (decoded area list, wall graphics bitmaps, WALLDEF block choice) for every
area of every installed title before and after, and the two hash tables must be identical. Existing
`explore-*` cases are an additional, weaker check.

- Gen1 titles: picker from `listAllGen1Areas`. Non-walkable maps open via `decodeGeoBlock` with flat
  colour. Counts (reviewer): CoK 15, DoK 19, Curse 16, Secret 17, Pools of Darkness 32, Gateway 30,
  Treasures 41; **Pool of Radiance (DOS) is a plain 1026-byte Gen1 DAX title (29 GEO blocks, reviewer)
  and is IN scope**, not "try it": it is listed like the others, subject to the invariant test.
- Amiga GLIB GEO (16x16 planes without the 8-byte header, `ccgeo.asm:57-61`; DQK-Amiga and
  Curse/Secret/Pools/Gateway/Treasures) is NOT supported in v1 and the picker says so; adding it
  requires a TS GLIB-GEO map decode that does not exist yet (the `glib.ts` container loader exists;
  the GEO member decode does not). Listed as non-goal, not silently omitted.
- DQK: `GEO.GLB` -> `decodeHlib` -> `decodeGen2GeoArchive`. The GEO archive holds 20 maps with area ids
  2,4,10,14,18,22,24,26,30,34,38,42,46,47,50,54,58,62,63,66 (`dqk-geo-shape-audit.md`, read). **Area 5 is
  NOT a GEO member**; it is a separate structure (`world/dqkArea5Overland.ts`) and is NOT offered in this
  picker (rev 1's badge is removed). Flat colour only.
- FRUA/authored modules: via `moduleExplore.ts` `GameMap`; FRUA lock/secret kinds per 1.3.
- Overland: the original keys openness on the ECL block (0/10), not on a fixed list, so the picker takes
  the caller hint for Gateway GEO6 and Treasures GEO1 (flagged `overland`, 3D not offered) AND shows
  `openBoundary` per map; any map where `openBoundary / boundary > 0.25` carries a "mostly open edge -
  may be an overland map" note and still renders in `bounded` topology. A test (4.1 item 7) asserts the
  two known overland maps return `null`.
- Buck Rogers: not checked; non-claim.

### 2.3 Cameras

**Grid-walk (default).** Pose (x,y,facing 0/2/4/6), arrows step via `stepTarget`, turn 90 degrees, ~150 ms
tween, eye height 0.5. In `torus` topology the pose wraps. `locked` doors block unless the toggle is on.

**Free-fly orbit.** Drag orbit, wheel zoom, WASD pan, `F` top-down. No collision. Keys: `C` mode,
`Esc` close, `M` minimap, `T` textures/flat, `L` ceilings, `3` (inside explore, last in build order).

**2.3a Back-face culling (required).** WebGL2: `gl.enable(CULL_FACE)` with CCW front faces and the
corner winding in 1.1; a draw with culling disabled is a defect. Canvas2D: `paintOrder` returns only
quads where `!isBackFacing(q, camX, camZ)` (sign of `dot(normal, cam - quadCentre)`). In orbit mode this
is visible by design: one-way walls vanish from outside. Tests in 4.1 (item 2b) and 4.3.

### 2.4 Minimap

`composeAutomapPanel` for the map plus a pose arrow; click teleports the walk camera (view-only);
view-local `Automap`; fog default off with a toggle. In torus topology the minimap wraps the arrow.

### 2.5 Textures

Keyed by RAW SLOT per quad side (never per edge: the two sides can differ, 1.1 `slotMismatch`).
UNPROTOTYPED. The 2D renderer owns dedicated side pieces per slot (pieces 1/2/4/5/7/8, read in
`wallpieces.ts`); the harvest therefore renders **three** synthetic poses per slot through
`composeWallView`: near front (front faces), left side piece and right side piece (side faces), and
falls back to the front mosaic only for a missing piece. Whether this looks right is the first thing the
step-6 prototype answers. NEAREST + CLAMP_TO_EDGE, half-texel inset to avoid atlas bleeding; atlas size
is capped (limit stated in the status line); `devicePixelRatio` and `resize` are handled by resizing the
drawing buffer to `clientSize * dpr` on a ResizeObserver. Flat-colour fallback is first-class, with the
slot colour `hsl(slot*47 mod 360, 35%, 45%)`, status line "textured n/15, m flat". The 3D view does not
yet honour the `G` graphics-set switch (live platform switching is a project pillar); the status line
says "platform: DOS art only (v1)" rather than staying silent; palette-texture path (ADR-0007) is the v2.

### 2.6 Picker

`div.gb-mappicker`, title and area selects, labels show `stats.walls`, `stats.oneWay`,
`stats.slotMismatch`, `stats.openBoundary`.

### 2.7 Seam

`window.__dungeon3d = { gameId, areaId, mode, renderer, rendererReason, topology, pose, stats,
meshWallKeys(), texturedSlots, flatSlots, frameHash(), key(k), step(dir), turn(d), setMode(m),
setPose(x,y,f), select(areaId) }`. `key(k)` dispatches through the REAL keydown handler (same code
path as a user's keypress) so key handling, `Esc`, `C`, `T`, `L`, `M` and tween settling are
exercised; `step()`/`turn()` are convenience wrappers around `key()`. `frameHash()` hashes the last
presented Canvas2D frame (or a `readPixels` of the WebGL frame when available).

## 3. How it is reached

- `?dungeon3d=<gameId>[&area=<disk:id>]` as a new `else if` branch in `boot()` in
  `apps/web/src/ui/main.ts`, before the `?game=`/`?asset=` fallbacks.
- Sidebar `explore-pick` entry per supported title; library "3D view" button in the
  `show*LibraryRoutes` panels and Gen1/DQK branches of `onLibrarySelect`.
- `closeMajorViews()` (in `ui/main.ts`) gains `closeDungeon3d()`. **The inverse is required too:**
  every existing view's start function (explore, dqk demos, moduleExplore, library routes) calls
  `closeDungeon3d()` so opening Explore on top of 3D cannot stack. Test in 4.3.
- `3` from inside the 2D explorer needs a small exported `getExplorePose()` in explore.ts: a SECOND
  explore.ts touch, scheduled last and separate from the extraction.
- CSS `.gb-3d-*` in `viewer.css` using `:root` tokens.
- Bundling: `bundle-assets.mjs` copies literal single-quoted game paths into `dist-app`, which contradicts
  "never vendored" for any deployed bundle (existing behaviour, raised not resolved; user must decide
  before any deploy). The new sidebar entries reuse `gameData.ts` literals and add none computed, but
  they DO widen what a production build embeds; `pnpm e2e:static` (`static-build.mjs`) is the only gate
  that sees production-only fetch paths and MUST include the new route. Production base
  (`GB_E2E_BASE_URL`) lacks `/@fs`, so the case must resolve assets via the same path explore uses.
- Electron (`apps/electron`, extraResources, offline): WebGL2 support under Electron is not assumed;
  the Canvas2D fallback is the guaranteed path and the implementer verifies the Electron renderer
  reports its `renderer` and passes a smoke case in the Electron e2e (a new, small case, added to the
  Electron suite; not just the web suite). GPU flags are not changed.
- Performance bounds: stated quad budget for the painter path (all 3 x 3 torus copies, back-to-back pairs
  and culled ones) with a per-frame time measured on the largest map of each title and recorded in the
  handoff; the Canvas2D fallback draws only quads within a view radius (default 12 cells) to keep the
  O(n log n) sort bounded.
- Ledgers: the new user-visible feature likely needs a capability-ledger / support-claims entry; the
  implementer checks `supportClaims.json`, `support.ts` and `test_goldbox_corpus.py`, rather than
  assuming "only if they require it".

## 4. Test plan

### 4.1 Engine unit tests (`packages/engine/test/dungeon3d.test.ts`, vitest)

All independent oracles live in the TEST FILE, written in a different form from the builder (neighbour
comparison, raw plane reads). Nothing compares a module function to an alias of itself.

0. **Always-on fixtures (no retail data).** Hand-built maps (3x3, non-square 5x3, a 16x16 torus case, a
   FRUA-style fixture) always run, so a fresh clone never skips the whole invariant.
1. **Exact geometry:** quad count, corners, normals, winding, `oneWay`, `boundary`, `slotMismatch`,
   `passage`, `doorsOnOpen`, deterministic order (build twice, `toEqual`).
2. **Wall-set invariant against the raw decode.** For each loadable map, the test re-decodes the raw GEO
   block bytes ITSELF (plane 0/1 nibbles) without calling `decodeGeoBlock`/`decodeGen2GeoBlock`, and
   asserts `meshWallSet` equals `{(x,y,side): nibble != 0}`. This catches a decoder-read bug, not only a
   mesh bug. Iterated titles: every installed Gen1 title via `readDaxDataBlocks`, DQK via
   `decodeGen2GeoArchive`, FRUA fixtures. **Per-title minimum counts when that title's data is present**
   (derived by the test from the file's own TOC filtered to 1026-byte blocks / the HLIB member count, then
   asserted equal to the mesh count); a missing install skips only that title and prints
   `SKIP title (no data)`, so zero iterations for a present title fails.
2b. **Culling / one-way invisibility.** Using `isBackFacing` and `paintOrder`, for a hand-built
   one-way edge A.east set, B.west = 0: from B's cell the quad is culled; from A it is drawn; for a
   symmetric wall both quads exist and only the near-side one survives from each side. Also run over
   every retail one-way edge found by 5.
3. **Parity against what 2D actually draws.** For each Gen1 map and a sample of poses (all cells x 4
   facings, plus every one-way and boundary edge), run `planWallView`/`composeWallView` (the real 2D
   planner) with the mesh's topology, record which wall slots appear at each depth/side, and compare to
   the slots the mesh reports as visible from the same pose using `paintOrder` and the same visibility
   rule at depths 0..3. This is the real agreement test; it replaces rev 1's in-grid `wallType` check
   (which was tautological).
   3a. **Out-of-grid convention.** For torus topology, assert `wallType()` for x=-1/16, y=-1/16 equals
   the mesh's wrapped read for every Gen1 map, and for ECL block 0/10 assert off-map = 0. The list of
   edge cells where bounded vs torus differ is an independently counted number per title (recount from
   raw planes), not enumerated from the 3D rule.
   3b. **DQK clamp convention:** `GetFacingWallType` semantics (clamp) vs the mesh's bounded rule on the
   20 maps; non-square maps (the 8 pinned by `dqkGeoShapeCensus.test.ts`) must index with
   width = byte 1, height = byte 0; a transposed-header control must go RED.
4. **Movement parity with the real Explorer.** `stepTarget` is checked against the actual `Explorer`
   class's `canMove` (not a re-typed expression) for every cell/side of every map, in `bounded` topology;
   the only allowed divergence is `locked` (door 3) and `torus` wrap, each asserted separately.
5. **Independently recounted census.** `oneWay`, `slotMismatch`, door histograms on walled/open edges
   and `openBoundary` per title are recounted in the test via direct neighbour comparison over the raw
   planes (different code form) and compared to `mesh.stats`. The reviewer figures are NOT pinned as
   constants (they were measured, not derived by this spec): the test asserts equality between two
   independent derivations and prints the numbers; a human then writes the printed figures into the
   handoff. A control flips one wall in a fixture and requires both counts to move.
6. **Doors:** door 1/2/3 yield the right `passage`; a walled-edge door 3 blocks by default; a slot-0
   edge with door bits lands in `doorsOnOpen`; FRUA blocked kind blocks.
7. **Overland:** Gateway GEO6 and Treasures GEO1 with `overland:true` return `null`; without the hint
   `stats.openBoundary` is reported (so the e2e can assert the badge).

### 4.2 Mutation checks (each seen RED via a byte-exact backup copy, never `git checkout`)

M1 drop `west` from the emit loop; M3 mirror east/west corners; M4 treat one-way as symmetric;
M5 add a wrap in `bounded` topology; M6 change sort order; M7 feed the quad slot from `doors`;
**M8 disable culling** (`isBackFacing` always false) -> 2b red; **M9 swap forward/reverse slot** ->
`slotMismatch` test red; **M10 transpose Gen2 width/height** -> 3b red; **M11 make `locked` passable**
-> item 6 red; **M12 renderer winding reversed** -> e2e frame-hash control red. M2 (`> 0` vs `!== 0`)
is equivalent for nibbles and is not a mutation.

### 4.3 e2e (`apps/web/test/e2e.mjs`)

Case id `dungeon3d-view`, runner `runDungeon3d(browser)`.

Registration is THREE edits, not two: (1) a key in `const runners = new Map([` (currently ~line 17670;
re-locate by searching the declaration, never by number); (2) `const dungeon3d = await runDungeon3d(browser)`
in the full pass; (3) the variable name added to the single long `results.unshift(...)` line (~18019).
`e2e-case-coverage` verifies the registry-vs-full-pass pair, and a missed `unshift` name only fails
after a full run, so the implementer runs the full pass once. The case count in CLAUDE.md /
`test_docs_claims.py` (15% band; check the current rule) is updated in the same change.

Independent oracle. The wall set is computed in the TEST PROCESS (Node side) from the retail DAX bytes
read from disk by the harness, via a small pure parser written in the test (plane 0/1 nibbles), and
compared to `meshWallKeys()` from the page. An in-page recomputation from the page's decoded map is
NOT accepted (it is the same predicate on the same data; `window.__explore` also does not exist on this
route). Assertions: `stats.walls > 0`; key-set equality; `key('ArrowUp')` into a wall leaves the pose and
into an open edge moves exactly one cell (through the real keydown path); a locked door blocks unless the
toggle is on; torus wrap steps over the grid edge on a Gen1 map.

Renderer coverage:
- `--disable-gpu` is set in the harness (`e2e.mjs` launch args, searched, not numbered), so WebGL2 is
  usually absent. Therefore the plan adds **one dedicated WebGL case** launched with an explicit
  software GL (`--use-gl=angle --use-angle=swiftshader` / `--enable-unsafe-swiftshader`), which
  asserts `renderer === 'webgl2'`, `getError() === 0`, a clean shader compile, texture upload, a frame
  whose hash changes after a pose change and after a one-wall flip, and `loseContext()` at close.
  If that environment cannot create WebGL2, the case FAILS LOUD (`SKIP: webgl2 unavailable`) and the
  handoff states WebGL is untested; "recorded canvas2d" is never counted as WebGL coverage.
- Canvas2D check, not a colour-count: (a) `frameHash()` changes when the pose changes; (b) it changes
  when one wall is flipped in the loaded map via the seam (`select` with a patched map); (c) a mirrored
  east/west frame hashes differently from the true frame; (d) a deliberately blanked canvas is detected
  by a stated check (fewer than N distinct colours, N fixed in the spec's implementation note) and is
  seen RED against the real renderer, as a negative control.
- Culling control: from a pose on the open side of a one-way edge the frame hash equals the frame hash
  of the same scene with that quad removed; with culling disabled (M8) it differs.

Teardown/leak assertions: open -> close -> `window.__dungeon3d === undefined`; open 3D, open Explore
(and each other view) -> no `__dungeon3d`, no leaked `.gb-3d-canvas`, GL context lost (spied
`WEBGL_lose_context`); rapid open/close x20 does not exhaust contexts or leave listeners (counted via a
wrapper around `addEventListener` installed in the test page, not the seam); a `webglcontextlost`
event drops to Canvas2D.

Data-absent: `dataAbsent(errors)` (the pattern appears on ~80 lines) per title; a title present on disk
must produce its non-zero count or the case fails.

Probe-must-fail: before trusting, see red for (a) seam removed, (b) wrong wall key, (c) `step()`
ignoring walls, (d) culling off, (e) blank canvas, (f) mirrored frame.

`pnpm e2e:static` is extended (or a sibling case added) to open the route from the production bundle.
The Electron e2e gets the smoke case from section 3.

### 4.4 Gates (by the implementer, none run now)

`pnpm --filter @goldbox/engine test`, `pnpm test:corpus` (`engine_export_consumers`,
`test_docs_claims` case count, ledgers), `pnpm -r exec tsc --noEmit`, `pnpm build:app`,
`pnpm --filter @goldbox/web e2e`, `pnpm e2e:intros`, `pnpm e2e:static`, the Electron e2e smoke.
Handoff records: bundle-size delta and the lazy chunk size, per-frame cost on the largest maps, and
the extraction hash table from 2.2. Deployment remains a separate, user-approved step.

## 5. Non-goals and honest limits

Non-goals (v1): ECL execution, combat, encounters, party, specials, editing, sprites/monsters/NPCs,
lighting, shadows, sound, saving, multiplayer, mobile controls, palette-texture live platform switching,
DQK textured walls, wilderness/overland 3D, Amiga GLIB GEO maps (no TS decode yet), DQK first-person 2D
parity (no web oracle).

Limits:
- **Original art is pre-skewed perspective mosaics**; reuse on faces other than the near front is an
  approximation, unprototyped. Flat colour is the guaranteed floor.
- **Wall conventions differ per title** (1.4): Gen1 wraps, DQK clamps, `Explorer` blocks the edge. The
  3D view makes this an explicit `topology`; where it is `bounded` it differs from the retail Gen1
  picture near borders.
- **One-way edges** render exactly as in 2D (one side only). "Secret door" is an inference, not claimed.
- **Door flag meanings conflict across the repo** (1.3); value 3 is treated as locked per the ovr015
  decompile; Gateway GEO6 / Treasures GEO1 carry door bits on thousands of open edges and are overland,
  so plane 3 may mean something else there.
- **`doorsOpen` is per side and session-local**; open doors have no 2D oracle.
- **Outdoor test is from a decompile doc** (`floor < 0x80`), pending verification against the binary.
- **Reviewer figures are hypotheses** until the tests re-derive them; none are authoritative.
- Headless WebGL requires the SwiftShader case; if unavailable WebGL is untested and the handoff says so.
- Bundling copies game assets into `dist-app` (existing behaviour), unresolved and for the user.
- explore.ts is large and under concurrent edit: the extraction and `getExplorePose()` are the main
  merge-conflict risks, and are separate changes.

## 6. Suggested build order

1. `dungeon3d.ts` + shared `edgeClass` refactor + unit tests + invariant + mutations (engine only).
2. Extraction refactor of explore.ts helpers as its own change, with the before/after hash table; merged
   and gated before step 3.
3. Canvas2D renderer (culling) + grid-walk + seam + e2e (works headless).
4. WebGL2 renderer + orbit camera + SwiftShader e2e case + lifecycle/teardown tests.
5. Minimap sync.
6. Texture harvest prototype (front + side pieces) + flat fallback accounting.
7. Routes, sidebar, library button, `closeMajorViews` and the inverse close calls, `e2e:static`, Electron smoke.
8. `getExplorePose()` and the `3` hotkey.
9. Gates, then the user decides on deploy.

## Appendix A: what rev 2 changed (defect -> fix)

- D1: back-face culling is mandatory (0.4, 2.3a), `isBackFacing`, tests 2b/M8, e2e culling control.
- D2: per-quad slot, `reverseSlot`, `slotMismatch`, textures keyed per side (1.1, 2.5), M9.
- D3/D9: topology modelled (torus default for Gen1, bounded otherwise), DQK clamp named, open-boundary counts (1.4).
- D4/D5/critical-integration: tautological `predicateWallSet` deleted; oracles are raw-plane recounts in the test; parity test now runs the real 2D planner (4.1 items 2, 3, 3a); movement tested against the real `Explorer`.
- D6/D7/D8: door classes, locked blocks by default, `doorsOnOpen`, FRUA kinds, per-side `doorState` (1.3).
- D10: area 5 removed from the GEO picker; overland keyed by hint plus `openBoundary` (2.2).
- D11: Pool of Radiance in scope; GLIB GEO listed as a non-goal; reviewer census kept as hypotheses.
- D12: outdoor from plane 2 `< 0x80` (1.5).
- D13: header order pinned to height-then-width, ccgeo.asm comment flagged stale, transposed control (1.1, 3b, M10).
- D14: side pieces used for side faces; `wallset`/`slice` dropped as texture keys (1.2, 2.5).
- Integration items: Node-side e2e oracle, SwiftShader case, three-edit registration, per-title minimum counts, always-on fixtures, lazy chunk and size record, Electron and static gates, teardown list, inverse closes, extraction hash proof, shared `edgeClass`, ledger check, `key()` through real handlers, frame-hash controls, platform-switch limit stated.

## Appendix B: critique items rejected or narrowed

- "Scout counts pinned as constants make the test a snapshot" (accepted in substance, not rejected): fixed by item 5 (two independent derivations compared, numbers printed not pinned).
- D9 "Gen1 `inMap` fixed at 16 means the spec must handle variable grids in wallview": narrowed. wallview is Gen1-only by construction; the mesh does not call it for Gen2 (section 1.1 indexes by `map.width/height`).
- "Do not publish scout/reviewer counts anywhere": narrowed. They appear only tagged (reviewer) and as hypotheses, per the fact policy; none is asserted as a constant.
- "No performance/accessibility/DPR plan": accepted but kept as bounds and notes (2.1, 2.5, 3), not hard numeric thresholds, since none can be measured without code.
- Adding the Electron and static gates is accepted; changing Electron GPU flags is rejected (not requested, unmeasured risk).
