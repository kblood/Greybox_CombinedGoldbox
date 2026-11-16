# CoK DOS Tactical Combat Screen — Implementation Plan

**Status: IMPLEMENTED FOR THE WEB PREVIEW; SCREENSHOT-EXACT CLOSING GATE STILL OPEN.** This began as the implementation plan for the
original-look tactical **combat screen** for Champions of Krynn (DOS EGA, older Gold Box /
DAX). It mirrors the *exploration* pipeline that is already done and verified pixel-exact
(`packages/engine/src/render/exploreScreen.ts` `composeExploreScreen`, `render/screen.ts`,
`render/textmode.ts`, `apps/web/src/ui/explore.ts`). The engine already has combat
*resolution* (`packages/engine/src/combat/`); this plan adds the combat *screen* (renderer
+ controller boundary) without touching the rules core.

Grounded in: `docs/engine/research/cok-dos-screen-layout.md`,
`docs/engine/research/firstperson-wall-geometry-cok.md` (the `draw_combat_picture` clip),
`docs/engine/research/dax-complex-subframe.md` §B/§D (SPRIT sprites + DUNGCOM tilesets),
`docs/engine/research/cok-monster-format.md`, and the COAB oracle
(`github.com/simeonpilgrim/coab`, MIT) cited inline. SSI executables were not decompiled.
Confidence is labelled per claim; **(inferred)** marks anything not yet pinned to COAB or a
real screenshot.

> **Verification stance:** like explore, structural placement gets *synthetic* unit goldens
> now; a *real-asset* manual render (skipped without GOG assets) is added immediately, and a
> pixel-exact array-recovery pass against a genuine CoK combat **screenshot** (MSE=0, the
> method that produced `COK_FRAME_LAYOUT`) is the closing gate. Until that screenshot match
> lands, the **grid-cell pixel anchors and the menu/message exact rows are CANDIDATE**, not
> confirmed.

---

## 1. The CoK combat screen — layout

### 1.1 What it is

CoK tactical combat is an **overhead-but-foreshortened battle grid** drawn into the *same*
upper-left viewport box the dungeon 3-D view uses, with the party-status panel on the right
and a command menu + message line below. It is NOT a separate full-screen mode: the engine
reuses the 320×200 / 40×25 / 8px-tile screen, the `draw_combat_picture` clipped blitter
(`docs/engine/research/firstperson-wall-geometry-cok.md` §1, `seg040.cs`), the block-201
mono font, and the same EGA-16 palette. This is why the explore compositor's primitives
(`createFramebuffer`, `blitIndexed`, `blitIndexedClipped`, `fillRectIndexed`, `drawText`)
carry over unchanged.

The battle area is a rectangular grid of cells. Each cell holds at most one combatant icon.
A **backdrop** (terrain) is composited under the icons from the `DUNGCOM` / `WILDCOM` /
`RANDCOM` 24×24 tile sets (already decoded — `parseTileSet`, `kind:'tileset'`,
`docs/engine/research/dax-complex-subframe.md` §D). Party members and monsters are drawn as
**sprites/icons** (`SPRIT*.DAX`, `docs/engine/research/dax-complex-subframe.md` §B) over the
backdrop. A cursor/highlight marks the active combatant; the bottom command menu and the
scrolling message line drive the turn.

> **CORRECTED 2026-09-07 — read from the retail bytes.** This sentence used to give the menu
> as `MOVE / ATTACK / CAST / USE / GUARD / BANDAGE / VIEW / AIM / TURN / WAIT / …`. That is
> wrong in five ways, and it is wrong in a CoK-titled document, so it was being read with
> authority it never earned. To this file's credit it labelled the claim `**(inferred)**` at
> §1.2 and asked at §4 to "verify exact CoK wording/order vs a screenshot" — that verification
> has now been done, from bytes rather than a screenshot.
>
> CoK's menu lives in `Champions of Krynn/GAME.OVR` (**not** `START.EXE`, which contains none
> of it) as length-prefixed cells at `0xB5BE`:
>
> ```
> \x05Move \tView Aim \x04Use \x05Cast \x05Turn \x05Yell \x04Done
> ```
>
> and a **second tier** at `0xBF28`:
>
> ```
> \x06Guard \x0bDelay Quit \x08Bandage \x0fAuto Speed Exit
> ```
>
> So: **7 stored cells / 8 words** in the main menu, **4 cells / 7 words** in the submenu.
> Note `View Aim ` is ONE 9-byte cell — do not split it into two entries, and do not build a
> 7-entry table for the submenu.
>
> What the old line got wrong:
> 1. **There is no `ATTACK` command.** The CoK manual states the mechanism positively:
>    *"MOVE is used to allow a character to move. Attack by moving the character into an
>    enemy's square."* (`build/cok-manual-extracted.txt:988-989` — note that file is under the
>    git-ignored `build/`, so it is a local artifact, not repo evidence.)
> 2. **There is no `WAIT`.** The retail equivalent is `DELAY`, and it is in the submenu.
> 3. **`AIM` is fused into `View Aim `**, not a separate cell.
> 4. **`YELL` was missing** — it is a real CoK command (Kender taunt).
> 5. **The menu is two-tier, and `DONE` does not end the turn** — it opens the submenu
>    (`:1067`, *"DONE is used to bring up the secondary combat menu"*). **`QUIT` ends the
>    turn.** Any key map that treats `D` as "end turn" is not CoK-faithful.
>
> **Do not generalise this row to the other titles — the line has two menu shapes plus a
> reskin.** DoK, Dark Queen, Pools of Darkness, Treasures and FRUA use a FLAT two-row form,
> stored as one 68-byte string in `Death Knights of Krynn/START.EXE` at `0xE9DE` (and DoK's
> `GAME.OVR` contains none of it — the split is inverted between the two games):
>
> ```
> Move Aim Use Cast Turn Guard Quick@Delay Bandage Yell View Speed End
> ```
>
> The `@` (0x40) at byte 34 is the row break, not a separator between commands. CoAB and Pool
> of Radiance use `Move View Aim Use Cast Turn Quick Done` — **CoK substitutes `Yell` for
> `Quick`**, so a CoK-labelled claim carrying `Quick` is the wrong-subject error one level
> down. Secret of the Silver Blades drops `Turn`; NWN puts `Zap` in the Yell/Quick slot; Buck
> Rogers: Matrix Cubed is a full sci-fi reskin. A native implementation wants a per-title
> command table, exactly like its boot-profile table.

### 1.2 Region map (pixel coords, [inclusive, exclusive))

The screen frame uses the same 40×25 tile vocabulary as exploration, but it is **not** the
first-person dungeon chrome with different contents. The combat grid owns the full confirmed
`draw_combat_picture` clip x[8,176), y[8,176). Therefore the dungeon inner viewport frame and
the col-16 separator (x=128) must not be drawn over combat: those cut directly through the
tactical field. The implemented compositor keeps the outer border, draws a combat divider at
col 22 (x=176), places the party panel to its right, and uses the bottom rows for log/menu.

```
┌─────────────────────────────────────────────────────┐
│ Outer top border   y[0,8)   x[0,320)                │
├──────────┬───────────────────────┬──────────────────┤
│ Battle viewport (combat grid)    │ Right panel       │
│ clip x[8,176) y[8,176) 168×168   │ x[136,312)        │
│   backdrop tiles + combatant     │ party rows 2..9   │
│   icons + active-unit cursor     │ (name AC HP)      │
│   (vsep col16 x[128,136))        │                   │
├──────────┴───────────────────────┴──────────────────┤
│ Horizontal separator   y[128,136)  x[0,320)          │
├─────────────────────────────────────────────────────┤
│ Combat message / action log  rows 17..22  x[8,312)   │
│ Command menu (MOVE ATTACK CAST …) drawn here / row24 │
├─────────────────────────────────────────────────────┤
│ Outer bottom border y[184,192)                       │
│ Prompt / menu bar   row 24  y[192,200)               │
└─────────────────────────────────────────────────────┘
```

| Region | Pixel rect (x,y) | Source / confidence |
|---|---|---|
| Outer border | same top/bottom/edge frame tiles as explore | `cok-dos-screen-layout.md` §3 — **CONFIRMED** frame art |
| **Battle viewport** | x[8,176), y[8,176) = 168×168 | `firstperson-wall-geometry-cok.md` §1 — viewport is the `draw_combat_picture` clip, *named for combat*; **CONFIRMED as the clip**, grid mapping CANDIDATE |
| Combat divider | x[176,184), rows 1..21 | implemented in `composeCombatScreen`; keeps dungeon separator off the tactical field |
| Right party panel | x[184,312), rows 2..9 | combat-specific panel placement; rows highlight the **active** unit and gray/mark combat states |
| Command menu | rows 22 / 24 (x[8,312)/full) | horizontal list with a highlighted item; **(inferred)** exact row. The wording is no longer inferred — see the correction in §1.1: CoK is two-tier `Move / View Aim / Use / Cast / Turn / Yell / Done`, and the `MOVE/ATTACK/…` this cell used to name does not exist in any title |
| Message/log | row 22 in current preview | kept below the x[8,176) grid so combat text never paints over cells |

### 1.3 Battle-grid geometry (CONFIRMED — recovered from the COAB oracle, A3.1/CS.0)

**Pinned, not candidate.** The cell→pixel mapping was recovered from the COAB clean-room
decompile (`simeonpilgrim/coab`, MIT — the same older Gold Box generation as CoK), reading the
combat-draw call chain directly rather than guessing from a screenshot:

- `ovr033.sub_7416E` draws a backdrop cell with
  `ovr034.DrawIsoTile(tile, screenPos.y * 3, screenPos.x * 3)`.
- `ovr034.DrawIsoTile` → `seg040.OverlayUnbounded(set, 0, tile, rowY, colX)` which calls
  `draw_combat_picture(source, rowY + 1, colX + 1, …)` (the **+1**).
- `seg040.draw_combat_picture(blk, rowY, colX, idx)` = `draw_clipped_picture(blk, rowY, colX, idx,
  8, 176, 8, 176)`; `draw_clipped_picture` sets `minY = rowY * 8`, `minX = colX * 8`.

Composing the chain for a backdrop cell `(c, r)` (`screenPos.x=c, screenPos.y=r`):
`minX = ((c*3) + 1) * 8 = c*24 + 8`, `minY = r*24 + 8`. Combatant icons take the same path —
`ovr034.draw_combat_icon` → `draw_combat_picture(icon, (tileY*3)+1, (tileX*3)+1, 0)` — so icons
land on the **same** grid origin as the tiles. Therefore:

| Quantity | Value | Source |
|---|---|---|
| Cell origin (cell 0,0 top-left) | **pixel (8, 8)** | `(c*3+1)*8` with c=0 |
| Cell size | **24 × 24 px** | the `*3` (→8px units) × 8 = 24; DUNGCOM tiles are 24×24 |
| Clip / viewport box | **x[8,176) y[8,176) = 168×168** | `draw_combat_picture` clip args |
| Visible window | **7 × 7 cells** | 168 / 24 = 7 exactly |
| Foreshortening | **none** (orthogonal) | `screenPos*3` is a straight scale, no skew term |

This is **wider than the explore 3-D viewport** (which clips to x128 — see
`exploreScreen.ts` `VIEWPORT_CLIP`): CoK's battle field genuinely extends past the corridor
view's vertical separator. The logical combat map is larger than 7×7 and **scrolls** under the
window (COAB `gbl.mapToBackGroundTile.mapScreenTopLeft`); the 7×7 are the on-screen cells.

Encoded in `COK_COMBAT_GEOMETRY` (`packages/engine/src/render/combatScreen.ts`) and pinned by
`combatScreen.test.ts`. The web preview now treats the combat-vs-explore chrome question by
removing the dungeon x=128 separator and moving the combat divider to x=176. **Still open:**
CS.10 should compare this against a genuine CoK combat screenshot and adjust exact panel/log
rows if needed.

---

## 2. Engine-side interface contract

The boundary mirrors explore exactly: **a pure, DOM-free compositor that returns an
`IndexedFramebuffer`**, plus a **combat-view state model** that is *derived from* the
existing combat core, never duplicating rules. The web layer resolves the framebuffer to
RGBA via the existing `framebufferToRGBA(fb, palette)` and paints it with `ScreenSurface`,
just like `apps/web/src/ui/explore.ts`'s `drawScreen()`.

### 2.1 `composeCombatScreen` — the renderer (new: `packages/engine/src/render/combatScreen.ts`)

```ts
/** Where each combatant sits on the battle grid + how to draw it. View-model only — no rules. */
export interface CombatCellState {
  combatantId: string;           // matches Combatant.id in combat/combat.ts
  side: 'party' | 'enemy';
  col: number; row: number;      // logical grid cell
  /** Icon to blit (SPRIT frame, magenta-keyed), or null to fall back to a colored glyph. */
  icon: IndexedImage | null;
  hpFraction: number;            // 0..1, drives a wound tint / down state
  down: boolean;                 // hp<=0 → drawn prone/removed
  active?: boolean;              // the unit whose turn it is (cursor + panel highlight)
}

/** Logical→pixel mapping for the battle grid (data-driven so the screenshot-recovered
 * numbers drop in without an interface change — cf. ExploreFrameLayout). */
export interface CombatGridGeometry {
  originX: number; originY: number;   // top-left of cell (0,0), default (8,8)
  cellW: number; cellH: number;       // pixels per cell
  cols: number; rows: number;
  /** Optional per-row vertical squash for the Gold Box foreshortened look. Default 0. */
  rowSkew?: number;
}

export interface CombatBackdrop {
  /** 24×24 DUNGCOM/WILDCOM/RANDCOM tiles (parseTileSet kind:'tileset'). */
  tiles: IndexedImage[] | null;
  /** Per-grid-cell backdrop tile index, length cols*rows; out-of-range → tile 0. */
  cellTile?: readonly number[] | null;
  /** Single fill tile when no per-cell map is given. Default: tile 0. */
  fillTile?: number;
}

export interface CombatScreenInput {
  geometry?: CombatGridGeometry;          // default CANDIDATE constant
  backdrop?: CombatBackdrop | null;
  /** Combatant placements + icons (party + enemies). */
  cells: readonly CombatCellState[];
  /** Reuse the explore chrome verbatim. */
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;       // defaults to COK_FRAME_LAYOUT
  font?: BitmapFont | null;
  /** Right panel: party rows (active highlighted, down grayed). */
  party?: ExploreParty[];
  /** The command menu items, with the selected index highlighted. */
  menu?: { items: readonly string[]; selected: number } | null;
  /** Scrolling combat log (newline-joined; wraps in the message region). */
  message?: string | null;
  /** Bottom prompt bar text. */
  prompt?: string | null;
}

/** Build the full 320×200 indexed combat screen. Pure / DOM-free. Resolve with
 *  framebufferToRGBA(fb, palette). Draw order: clear → backdrop tiles → combatant icons
 *  (back-to-front by row) → active-unit cursor → outer frame + separators (chrome) →
 *  right panel → menu → message → prompt. */
export function composeCombatScreen(input: CombatScreenInput): IndexedFramebuffer;
```

Design notes:
- **Same primitives as explore.** Backdrop tiles via `blitIndexedClipped` into the
  `[8,176)×[8,176)` box (so icons/tiles never spill into the panel/separators); chrome via
  the existing `putFrame` logic — factor the explore frame-drawing into a shared
  `drawScreenChrome(fb, tiles, layout)` so both compositors call it (avoids divergence).
- **No DOM, no rules.** `CombatCellState` is a pure view-model the controller derives from a
  `Combatant[]` + a positions map. The compositor never imports `combat/combat.ts`.
- **Icons are `IndexedImage`** (the neutral model) — the renderer is asset-source-agnostic,
  so DoK/DQK feed differently-decoded icons without renderer changes (extends-cleanly).
- **Graphics-mode switch is free**: the framebuffer stays indexed; switching EGA↔Amiga is a
  palette + icon-set swap at the edge (ADR-0004), no compositor change.

### 2.2 The combat-view controller (new: lives in the player UI, `apps/web/src/ui/combat.ts`)

The controller is the analog of `explore.ts`: it owns turn flow, input, and the bridge to
the rules core. **It does not duplicate `runCombat`'s math.** Two integration options for the
rules boundary are weighed in the ADR; the recommended one (interactive stepper) needs a
small, additive extension to `combat/combat.ts` rather than a rewrite. The controller:
1. Builds combatant placements (initial deployment + a positions map `id → {col,row}`).
2. Each turn, asks the rules core for the acting unit + legal actions, renders via
   `composeCombatScreen`, takes input (keyboard/menu), applies the action, appends to the log.
3. On end, returns a `CombatResult` (same shape the core already produces) to the caller
   (`explore.ts`'s `resolveCombat`), so HP-persistence/XP wiring (`applyCombatHp`) is unchanged.

---

## 3. Assets that drive the screen

| Asset | File(s) | Loader (status) | Role | Gap |
|---|---|---|---|---|
| Backdrop tiles | `DUNGCOM.DAX`, `WILDCOM.DAX`, `RANDCOM.DAX` | `decodeDax` → `parseTileSet` `kind:'tileset'` (**done**, 25×24×24, `dax-complex-subframe.md` §D) | terrain under the grid | Krynn Gen1 dungeon fights now use recovered CoAB `SetupDungeonFloor`-style `backgroundIds`; remaining gaps are screenshot-exact layout, RNG alignment, wilderness/random setup, and cross-game/DQK variants |
| Combatant icons | `SPRIT1.DAX` … (monsters), party icons | `decodeDax` animated path (**done**, `dax-complex-subframe.md` §B; 3 view-size frames, magenta=13 mask) | the figures on the grid | **monster→sprite link**: `MON{n}CHA` record has NO verified sprite-id field (`cok-monster-format.md`); the ECL `LOAD_MONSTER` carries a `picBlockId` (`ecl/vm.ts` `EncounterMonster.picBlockId`) — *that* is the icon source, not the monster record. Confirm CPIC vs SPRIT block id semantics. |
| Frame / chrome | `8X8D1.DAX` block 202 + font block 201 | `decode8x8dBlock` + `loadCokFont` (**done**) | border, separators, panel, text | none (reused from explore) |
| Palette | fixed EGA-16 | `makeEgaPalette` (**done**) | color resolve | none |
| Combat command labels | engine strings, `GAME.OVR` `0xB5BE` + `0xBF28` | n/a | the two-tier `Move / View Aim / …` menu | **DONE 2026-09-07** — verified from the retail bytes, not a screenshot; exact cells in §1.1. Hard-code per title, not once |

Key asset finding to carry forward: **the icon for an enemy group comes from the ECL
encounter setup (`EncounterMonster.picBlockId`), not from the `MON{n}CHA` record.** The
controller already receives `EncounterMonster[]` (see `explore.ts` `resolveCombat`); it must
pass `picBlockId` into a sprite lookup (`SPRIT*` / `CPIC*` decode) to get the icon. This is
the one new loader-wiring step; the decoders themselves exist.

---

## 4. Milestones / task breakdown

Small, independently testable steps. Golden strategy mirrors explore: synthetic-tile unit
goldens for placement (`exploreScreen.test.ts` style), a skipped real-asset manual render
(`renderExplore.manual.test.ts` style), then a screenshot-recovery pass.

| # | Task | Acceptance / golden | Size | Agent |
|---|---|---|---|---|
| **CS.0** | **Research/recover grid geometry**: from a real CoK combat screenshot, pin `CombatGridGeometry` (cell size, cols/rows, foreshortening) and the menu/message exact rows by MSE-matching DUNGCOM tiles + font, as `COK_FRAME_LAYOUT` was. Write the numbers into this doc. | Doc gives geometry with a screenshot match (cells + 1 backdrop tile byte-exact); CANDIDATE → CONFIRMED | M | Researcher / Sonnet |
| **CS.1** | Factor explore frame drawing into shared `drawScreenChrome(fb, tiles, layout)` used by both compositors (no behavior change). | Existing `exploreScreen.test.ts` still green; new fn unit-tested | S | Implementer / Sonnet |
| **CS.2** | `composeCombatScreen` skeleton: clear → backdrop fill → chrome → panel → message → prompt (no icons yet). Synthetic tiles. | Unit golden: 320×200 fb; backdrop confined to [8,176); panel/prompt text at explore coords | M | Implementer / Opus |
| **CS.3** | Backdrop layer: tile the DUNGCOM set into the grid via `CombatBackdrop` (fill + per-cell map), clipped. | Unit golden: known tile index lands at the right grid cell; nothing past x128/y128 | S | Implementer / Sonnet |
| **CS.4** | Combatant icons: blit `CombatCellState` icons back-to-front, magenta-keyed, with active-unit cursor + down state. | Unit golden: synthetic icon at cell→pixel; active cursor present; down unit grayed | M | Implementer / Opus |
| **CS.5** | Command menu render: horizontal `MOVE/ATTACK/…` list with selected item reversed (white-bg/black-fg, as explore menu highlights). | Unit golden: selected item uses reversed colors at the menu row | S | Implementer / Sonnet |
| **CS.6** | Real-asset manual render (skipped w/o GOG assets): compose a static battle from real DUNGCOM + SPRIT1 + 8X8D1 + font → PNG in `renders/combat/`. | Test writes a coherent combat PNG; `expect(png.length>100)` | M | Implementer / Opus |
| **CS.7** | Monster→icon wiring: resolve `EncounterMonster.picBlockId` → `SPRIT*/CPIC*` frame; controller builds `CombatCellState[]` from a resolved encounter. | Unit: a 3-goblin roster yields 3 placed cells with the right icon block | S | Implementer / Opus |
| **CS.8** | Rules boundary: additive interactive stepper on the combat core (see ADR) — `createCombat(combatants, opts)` → `{ current, legalActions, apply, log, result }` — leaving `runCombat` as a thin loop over it (regression-safe). | Existing combat goldens (`combat.test.ts`, `encounter.test.ts`) byte-identical; new stepper unit-tested; `runCombat` re-expressed via stepper produces the *same* log | L | Implementer / Opus |
| **CS.9** | `apps/web/src/ui/combat.ts` controller: deploy party + enemies, keyboard-driven MOVE/ATTACK turns, render each step via `composeCombatScreen`, return `CombatResult`. Replaces the auto-resolved `encounter-overlay` path in `explore.ts` when a real party fights. | E2e: trigger an encounter → combat screen renders → a turn resolves → outcome returns; HP persists via existing `applyCombatHp`; no console errors | L | Verifier+Implementer / Opus |
| **CS.10** | Screenshot-recovery closing gate: combat compositor output matches a genuine CoK combat screenshot on cleanly-visible cells (MSE-style, as explore hit 206/206). | Documented match; CANDIDATE labels in this doc → CONFIRMED | M | Verifier / Opus |

CS.0/CS.1/CS.2 are the unblocking first slice (CS.1 + CS.2 can proceed on synthetic tiles
in parallel with CS.0's research).

---

## 5. Open questions / risks

1. **Grid geometry (highest risk).** Cell size, grid dimensions, and the foreshortened
   vertical spacing are CANDIDATE until the screenshot pass (CS.0/CS.10). Mitigation:
   `CombatGridGeometry` is a data-driven parameter (the `ExploreFrameLayout` pattern), so the
   renderer ships before the numbers are final and gains correctness with no API churn.
2. **Monster→sprite link.** Confirmed *not* in the `MON{n}CHA` record; the icon comes from
   ECL `EncounterMonster.picBlockId` (already plumbed to the host). Risk: whether that id
   indexes `SPRIT*`, `CPIC*`, or a combat-specific block needs a one-file check (COAB
   `CMD_LoadMonster` / the CPIC decode). `COMSPR.DAX` (305-byte records,
   `dax-complex-subframe.md` §D "still don't decode") may be the combat-sprite container —
   flag for a small reversing pass if `picBlockId` doesn't resolve to SPRIT.
3. **Per-encounter backdrop map.** The basic Krynn Gen1 dungeon map is no longer a placeholder:
   `buildCoabDungeonCombatMap()` emits CoAB `SetupDungeonFloor`-style 50x25 `backgroundIds` from the
   current GEO walls/doors/floor bytes, and `explore.ts` passes those ids into `launchCombat()`.
   Remaining risk is fidelity, not existence: screenshot-exact tile layout, random furniture RNG
   alignment, wilderness/random setup, cross-game variants, and DQK Gen2 confirmation still need
   source-backed proof.
4. **Rules-core extension shape.** `runCombat` currently runs a fight to completion
   internally. Interactive play needs to *step*. The ADR recommends an additive stepper that
   `runCombat` is re-expressed over, keeping every existing golden byte-identical — but this
   is the one change that touches the verified rules file, so it must be regression-pinned.
5. **Initiative/turn-order display.** The core rolls initiative per round internally
   (`combat.ts`); surfacing turn order to the UI needs the stepper (CS.8). Until then the
   screen can show the resolved log (current behavior) — no regression.

---

## 6. Extending to DoK and DQK

The design is deliberately seam-compatible across the three games; only the *edges* differ:

- **DoK (Krynn-Gen1, DAX-EGA — same engine generation):** identical chrome, identical
  `composeCombatScreen`, same EGA-16 palette. Differences are pure data: DoK's own
  `DUNGCOM/WILDCOM`-equivalent backdrops, `SPRIT*` icons, `MON{n}CHA` records, and (possibly)
  a few ECL opcode deltas for combat setup. **No renderer change** — feed DoK's decoded
  `IndexedImage`s and geometry. Expect CS.0's geometry to transfer (same engine).
- **DQK (Gen2, HLIB-VGA):** the *renderer* is unchanged — it composes an indexed framebuffer
  from `IndexedImage` icons/backdrops regardless of source. What changes at the edge:
  (a) backdrops/icons come from **HLIB `TILE` chunks** (`loaders/hlib.ts`, done) with an
  **embedded 256-color VGA palette**, not DUNGCOM/SPRIT + fixed EGA; (b) the chrome may use a
  different frame layout (pass a different `*_FRAME_LAYOUT`/geometry); (c) Gen2 ECL combat-
  setup opcodes differ (the ECL VM dialect handles that, not the screen). Because the
  framebuffer is indexed and resolved through a swappable `Palette`, **live EGA↔Amiga↔VGA
  switching of the combat screen is the same pointer-swap as explore** (ADR-0004) — built in,
  not bolted on.

The single cross-game contract is: *give `composeCombatScreen` a `CombatGridGeometry`, a set
of `IndexedImage` backdrop tiles + icons, the per-cell placements, and the chrome layout;
it returns an indexed 320×200 framebuffer.* Everything game-specific is data at that seam.

---

*Plan by Greybox (Opus), 2026-06-21. Grounded in the cited repo files + research docs; COAB
(`simeonpilgrim/coab`, MIT) used for structural context only. SSI executables not
decompiled. Geometry/menu specifics labelled CANDIDATE pending the screenshot-recovery pass
(CS.0/CS.10), the same method that produced the pixel-exact exploration `COK_FRAME_LAYOUT`.*

---

## 7. The command contract, read out of the retail bytes (2026-09-07)

Everything in this section was re-derived on 2026-09-07 by reading the shipped executables,
not from the plan above, not from a manual, and not from our own TypeScript engine. Every
claim names the file and the file offset it came from, so a reader can check it in one
command. Where it contradicts §1.1 or §6, this section wins — those were written from
recollection and screenshots in June and §1.1 already carries its own correction block.

### 7.1 CoK and DoK do not share a menu SHAPE, only a vocabulary

This is the finding that matters for the native engine, and it is not a wording difference.

**Champions of Krynn — `Champions of Krynn/GAME.OVR` @ `0xB5BD`.** Seven separately
length-prefixed cells packed back to back, each with its own leading length byte:

```
\x05"Move "  \x09"View Aim "  \x04"Use "  \x05"Cast "  \x05"Turn "  \x05"Yell "  \x04"Done"
```

Note `View Aim ` is ONE cell of length 9, not two cells. Seven cells, eight words.
A second block at `0xBF27` holds the submenu, same idiom, four cells / seven words:

```
\x06"Guard "  \x0b"Delay Quit "  \x08"Bandage "  \x0f"Auto Speed Exit"
```

**Death Knights of Krynn — `Death Knights of Krynn/START.EXE` @ `0xE9C6`.** ONE cell, length
`0x44` (68), containing every word at once with an `@` (0x40) embedded at the exact midpoint:

```
\x44"Move Aim Use Cast Turn Guard Quick@Delay Bandage Yell View Speed End"
        ^-- 34 chars --^        ^@^      ^-- 33 chars --^
```

followed at `0xEA12` by a separate `\x04"Done"`, and at `0xEA1E` by
`\x23"Next Prev Manual Target Center Exit"`.

So CoK renders a **cell list with a submenu behind `Done`**, and DoK renders a **single
string with a row break**. A native engine that stores "the CoK words" and "the DoK words"
in one table shape will get one of the two games wrong in layout even with the right
vocabulary. This is a per-title *renderer* difference, which is why the engine needs a menu
**shape id** and not just a word list.

**Correction to my own earlier note.** An earlier pass in this project recorded the DoK blob
at `0xE9DE`. That offset is real but lands 24 bytes INTO the string, at `Guard`, so the list
read from it silently began in the middle and lost `Move Aim Use Cast Turn `. The length
prefix is at `0xE9C6`. Quoting an offset you landed on rather than the one the record starts
at is how a true-looking list ends up short.

### 7.2 There is no ATTACK command and no WAIT command

Neither word appears in either menu. Attack is move-into-the-enemy's-square, and the retail
prompt says so in as many words — `Champions of Krynn/GAME.OVR` @ `0xBAC9`:

```
\x19"Move/Attack, Move Left = "   \x05" Done"   \x05"Flee:"   \x0e"can't go there"
```

`WAIT` does not exist **in the Krynn line or in FRUA**; the command is `Delay`, and in CoK it
lives in the submenu. **Narrowed 2026-09-07 — this sentence used to say `WAIT` does not exist,
full stop, and that is false one game over:** Buck Rogers ships a literal `"Wait "` cell
(`BuckRogers1-CountdownToDoomsday/game.ovr` @ `0xAF86` block, see §8.2). `Attack` is absent from
all six menus read so far and that one still stands unqualified.

### 7.3 The retail action economy is a movement-point budget, displayed live

`Move Left = ` is followed by a printed number, so CoK is not "one action then next
combatant" — a character in move mode has a remaining-movement counter that is decremented
per step and shown to the player, ` Done` stops the move early, and `Flee:` is reachable from
*inside* move mode rather than only from the top menu. `can't go there` is the blocked-square
rejection. Four strings, one screen mode, and together they pin the whole move loop.

### 7.4 Aim is a targeting MODE with its own prompt row

`Champions of Krynn/GAME.OVR` @ `0x17D58`, again as separate cells:

```
\x08"Range = "   \x02"  "   \x07"Target "   \x11"Next Prev Manual "   \x0b"Center Exit"   \x04"Aim:"
```

DoK carries the same six words as one `\x23` cell (`0xEA1E`) plus a shorter `\x0b"Target Exit"`
— the identical cells-vs-blob split as the main menu, which corroborates §7.1 rather than
merely repeating it. `Range = ` means the aim cursor reports live distance to the hovered
target, so Aim is a mode with its own draw and its own key handling, not a single action.

### 7.5 A geometry record appears to follow each menu record — NOT yet decoded

Immediately after each menu string sits a short fixed record. After DoK's combat menu:
`CD 00 B2 00 0C 00 B0`; after DoK's `Buy` menu: `40 00 B2 00 09 00 B0`. The `0x0C`/`0x09`
plausibly count menu entries and `0x00B2`/`0xB0` recur in both. **This is a guess and is
labelled as one** — I have not traced the code that reads these bytes, so the field
assignment is unverified and nothing in the engine should be built on it yet.

### 7.6 What this section does NOT establish

- **DQK and Buck Rogers were not covered when §7 was written; §8 now covers them, and the
  caution was right.** The warning that stood here -- "two shapes are not proof of only two
  shapes" -- was vindicated within the hour: DQK turned out to use a **third** framing.
- **No claim about the CoK submenu's trigger is made from bytes.** `Done` sitting last in the
  main list and `Exit` sitting last in the submenu is suggestive of `Done` opening the submenu
  and the submenu's own `Quit`/`Exit` ending the turn, but adjacency in a string table is not
  control flow. That reading is still owed a disassembly or a manual citation.
- **Nothing here was observed running.** These are static bytes; no DOSBox session was run.

---

## 8. DQK, FRUA and Buck Rogers — three framings, not two (2026-09-07)

Section 7 read CoK and DoK and warned that "two shapes are not proof of only two shapes."
That caution was justified within the hour. Reading the remaining DOS titles gives **three
framings and at least three vocabularies**, and the framing does not follow the vocabulary.

### 8.1 The Dark Queen of Krynn — same words as DoK, third framing

`The Dark Queen of Krynn/DQK.EXE` @ **`0x68AD3`**, 68 bytes, NUL at `0x68AD2` before and
`0x68B17` after:

```
\x00"Move Aim Use Cast Turn Guard Quick@Delay Bandage Yell View Speed End"\x00
```

**DQK uses NUL-terminated C strings, not Pascal length prefixes**, and that is measured
rather than assumed: a chained-Pascal-cell detector (length byte 0x03–0x14 → printable text →
next length byte, at least 3 links) returns **zero candidates across all 449,664 bytes of
DQK.EXE**. So the payload is *byte-identical in content* to DoK's — including the `@` — while
the framing is different. A table keyed on the words alone would call these two games the
same and be wrong about both the parser and the layout.

DQK.EXE is **not packed**: 2,291 relocations, no `LZ91`/`EXEPACK`/`PKLITE`/`diet`/`UPX`
signature in the first 16 KB. The MZ image ends at `0x23CD5` and the menu sits 282,110 bytes
past it, in the rtlink overlay area, stored plainly. No unpacking was needed or attempted.

Shape: **flat, no submenu.** There is no CoK-style `Done`→submenu block; the list has no
`Done` at all and ends in `End`. The adjacent `0x68B18 "Undo Done"` is a separate two-word
menu.

Companion strings, all `DQK.EXE`, all text-start offsets:

| Offset | String | What it is |
|---|---|---|
| `0x68AA8` | `Move Area Cast View Encamp Search Look Inv` | exploration menu, immediately before |
| `0x68B22` | `Next Prev Manual Target Center Exit` | the aim sub-prompt; same 35 chars as DoK's `\x23` cell |
| `0x684AF` | `Aim: range = ` | live range readout, as CoK's `Range = ` |
| `0x684D8` | `can't go there` | blocked-square rejection |
| `0x688CA` | `move/attack, move left = ` | **the movement budget, in a Gen2 title** |
| `0x688A5` | `(use cursor keys) ` | the input device, stated by the game |
| `0x684A1` | `attack ally? ` | confirmation on a friendly-fire target |
| `0x684D0` | `flee ? ` | flee confirmation |

`0x688CA` matters most: it puts the live movement counter of §7.3 in **both** engine
generations, so it is a Gold Box rule and not a CoK quirk. `0x688A5` names cursor keys as the
retail movement input.

### 8.2 Buck Rogers — CoK-shaped framing, a different vocabulary, and a real `Wait`

`D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\game.ovr` (note: the menu is in
`game.ovr`, CoK's placement, not DoK's `START.EXE`). Offsets below are of the **length byte**.

Block A @ `0xAF2C`, seven cells:
```
\x05"Move " \x0c"Target View " \x0b"Intimidate " \x06"Quick " \x04"Aid " \x07"Sprint " \x06"Dodge "
```
Block B @ `0xAF86`, four cells:
```
\x08"Jetpack " \x05"Wait " \x06"Guard " \x03"End"
```

`Target View ` is one cell of length 0x0C, structurally the twin of CoK's `View Aim ` (length
9). So Buck is **CoK-shaped** — Pascal cells, main block plus a second block — while sharing
almost none of Krynn's words. `Move`, `Quick`, `Guard` and `End` are the only overlap, and
`Wait` exists here and nowhere else in the line.

Matrix Cubed (`buckrogers2_dos_win.7z` → `Matrix\GAME.OVR` @ `0xB1AF` and `0xB209`) carries
the identical two blocks. The two overlays differ (BR1 `TP` magic, 210,071 bytes; BR2 `FB`,
212,529), so these are two independent reads of the same text, not one file counted twice.

Buck's aim prompt is split differently again — `game.ovr` @ `0x144BF`:
`\x11"Next Prev Manual " \x07"Attack " \x0b"Center Exit" \x04"Aim:"` — it inserts `Attack`
where DQK and DoK have `Target Center`. **`Attack` appears here as a targeting sub-option, not
as a top-level combat command**, which does not weaken §7.2.

Buck also carries the §7.3 cluster verbatim at `0xB479`:
`\x0b"Move/Attack" \x0e", Move Left = " \x05" Done" \x05"Flee:" \x0e"can't go there"`,
plus a jetpack sub-mode at `0x147BA` (`Flying / Land / Attack / Exit / (Use Cursor keys) `)
and a **separate 12-cell ship-combat menu** at `0x6BE7` (`Fire Target / Load / Juryrig /
Quit View@ / Close / Withdraw / Ram / Board / Command / Aid / Boost engines / Sensors `).
That is a fourth vocabulary on the same engine, so "one menu per title" is already wrong.

### 8.3 FRUA — Gen2 framing, and a vocabulary that is not DQK's

`C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures\CKIT.EXE` @ `0x89D89` holds the
same NUL-terminated table, confirming the framing is **generation-wide, not DQK-specific**.
But its combat string reads `… Bandage View Speed End Win` — **no `Yell`, plus `Win`**. `Yell`
is DQK's own. So even inside one framing the word list varies.

### 8.4 The table this actually implies

| Title | File | Framing | Structure |
|---|---|---|---|
| Champions of Krynn | `GAME.OVR` | Pascal cells | main (7 cells) + submenu (4 cells) |
| Death Knights of Krynn | `START.EXE` | Pascal, one blob | flat, `@` row break, detached `Done` |
| The Dark Queen of Krynn | `DQK.EXE` | **NUL-terminated** | flat, `@` row break |
| Unlimited Adventures | `CKIT.EXE` | **NUL-terminated** | flat; drops `Yell`, adds `Win` |
| Buck Rogers 1 & 2 (ground) | `game.ovr` | Pascal cells | two blocks |
| Buck Rogers 1 & 2 (ship) | `game.ovr` | Pascal cells | 12 cells, separate menu |

Framing, structure and vocabulary vary **independently**. The engine therefore needs a menu
*shape id* selecting a parser and a layout, not a per-title word list — and a title can need
more than one, because Buck's ship combat is a second menu in the same executable.

### 8.5 The `@` byte — still not resolved from code

Read as a row break, `@` splits DoK's and DQK's 68 bytes into `Move Aim Use Cast Turn Guard
Quick` and `Delay Bandage Yell View Speed End`. Three things support that and none of them is
the handler:

- `Gateway to the Savage Frontier/GAME.OVR` @ `0xC227` stores the Pascal form
  `\x06"Quick " \x07"@Delay " \x08"Bandage "` — `@` is the **first** char of its own cell.
- Buck's `game.ovr` @ `0x6BF9` stores `\x0a"Quit View@"` — `@` is the **last** char of its
  cell. Either way it sits on a cell boundary.
- `DISK1\GAME.FON` is 12 bytes per glyph, 96 glyphs, base 0x20; glyph 0x40 at font offset
  `0x180` is `7f 41 41 5d 45 5d 5d 55 55 5f`, an ordinary `@` bitmap — so it is **not** an
  invisible spacer character.

Against that: **zero** `cmp al,40h` in either encoding (`3C 40`: 0 occurrences; `80 F8 40`: 0)
anywhere in DQK.EXE, and zero `3C 20`. The handler was not found, so the row-break reading
remains an inference from three files' byte layout, not a decoded behaviour.

### 8.6 Nulls, with their method

These are measured absences, and the instrument that produced them reproduces the known CoK
and DoK offsets and surfaces real text from DAX archives (`mon0cha.dax` → `D.R. WARRIOR`,
`DESERT APE`, `HEXADILLO`), so they are not vacuous zeros.

- **DQK whole tree, 985 files**, searched for the menu needle: **exactly one hit**,
  `DQK.EXE:0x68AD3`. Same single-hit result for the aim prompt, `Undo Done` and the
  exploration menu. `INSTALL.EXE`: zero. No separate overlay file exists.
- **Buck Rogers 1: 91 files, every non-`game.ovr` file zero hits**, with all 39 `.dax`
  TOC-parsed and RLE-decompressed and re-scanned (570 blocks, 0 skips, 0 hits). BR2: 24 `.DAX`
  decompressed, 611 blocks, 0 hits.
- **Both games' `START.EXE` carry `Intimidate`, `Sprint` and `Jetpack` but no combat menu** —
  reading the surrounding bytes shows the career-skill table (`Use Jetpack`, `Leadership`,
  `Hide in Shadows`, `Maneuver in 0G`) and a status-message table, not a command list.
  Chasing a word without reading its neighbours would have filed those as the menu.
- **Two nulls are method-limited and are flagged rather than banked.** DQK's `.TLB`/`.GLB`
  containers scan clean, but `ECL.GLB` holds no English prose at all (83 ASCII runs of 8+
  chars, 0 English-looking), so its payload is encoded and a raw scan cannot rule out text
  inside it. Buck's `ecl*.dax` decompressed cleanly but reads as scrambled (`AC$AD`, `1P=%`),
  so ECL carries a further encoding that was not inverted. Both results are "no plaintext
  needle as stored", not "no menu text under any encoding".
- Three needle hits were chased and discarded as false positives: `FATV9.CAT:0x1DCE` is
  `"Castanets"` in an AdLib bank, and two are DOSBox/readme prose. None has length-prefix
  structure.

Free cross-check: the repo's `DQK.EXE` is md5-identical to the GOG Galaxy copy
(`62d9a483…`, both 449,664 bytes, menu at the same offset), so there is no second DQK build to
reconcile.

### 8.7 What §8 does not establish

- **No handler was read for any of these tables.** Every claim here is about bytes at rest:
  which file, which offset, what framing. Which cell a key selects, and whether CoK's `Done`
  opens the submenu, are still unread — §7.6's caveat stands unchanged.
- **DQK's table appears to be walked by index rather than by pointer** — `0x688F4`–`0x68C61`
  is one unbroken run of 41 NUL-terminated menu strings and the combat menu is ordinal 26 —
  but a search for an index array found none (no WORD array at either alignment, and the one
  4-stride far-pointer candidate matched 25 of 40 deltas over image data and was rejected).
  "Reached by skipping n NULs" is the remaining hypothesis, not a finding.
- **Nothing here was observed running.** No DOSBox session was launched for any of it.

## 9. What each command actually DOES — semantics, not just labels (2026-09-07)

Sections 7 and 8 recovered the command *vocabulary* from the retail bytes. They say
nothing about what any command does. This section covers the semantics, and it exists
because two of the engine's behaviours turned out to be wrong in ways no menu survey
could have caught.

**Provenance, because it is uneven and the difference matters.**

- **Re-derived by me, in this repo, and quotable forever:** the back-attack rule, from
  `build/cok-manual-extracted.txt:988-992`. That artifact is committed.
- **Sibling-engine decompile, byte-proven there and NOT in the Krynn binaries:**
  everything attributed below to `ovr*.cs` comes from the Curse of the Azure Bonds
  decompile. CoAB is the same engine generation as CoK and DoK (Gen1). It is **not**
  DQK, which is Gen2. Treat every CoAB figure as a strong prior for CoK/DoK and as
  *unverified* for DQK.
- **Extracted from retail PDFs in a scratchpad that no longer exists:** the manual and
  Journal quotes for DoK and DQK. The verbatim quotes recorded here are the evidence;
  the line numbers they carried were traceability for a working directory that is gone.
  Any of these can be re-derived from the GOG PDFs, and one of them should be before it
  is relied on for a number — see the CoK Journal caveat in 9.4.

### 9.1 The back attack — the engine was wrong, and so was my first fix

I recorded a suspicion that retail had no attack of opportunity. It is refuted five
times over: CoK manual and Journal, DoK manual and Journal, DQK Journal, all saying
near-verbatim that moving away from an adjacent enemy gives that enemy a free attack at
your back, and that back attacks have an improved chance to hit.

The manuals stop there. `ovr014.move_step_away_attack(direction, victim)` (DOS
`sub_3E954`), called from both the human move loop (`ovr009.cs:545`) and the monster AI
(`ovr010.cs:477`) immediately *before* the step, settles the rest:

| Question | Retail (Gen1 oracle) | This engine |
| --- | --- | --- |
| Per move or per step? | Per **step** — no per-command latch | per step |
| Which foes? | `adjacent(origin) \ adjacent(destination)`, by speculative relocation | same, same method |
| The "improved chance" | Substitutes the target's stored **rear AC**; `ac - ac_behind = Dex + shield + 2` | **only the 2** — see below |
| Facing | **Not consulted** — the behind flag is passed as a constant | not consulted (no facing field exists) |
| Stacks with GUARD? | No — disjoint sets, by construction | disjoint, inherited from the subtraction |
| Fleeing off-map | Does **not** provoke; steps taken to reach the edge do | same, by omission |

**The one stated shortfall.** Retail's rear AC drops the Dexterity and shield
contributions and adds 2 (`ovr025.cs:477-484`; two literal `dec ax` in the original
8086). Our combatant record carries a single flat `C_AC` with no such decomposition, so
`BACK_ATTACK_AC equ 2` implements the constant and *cannot* implement the other two
terms. Against a Dex-16 shielded fighter retail is 5 points easier to hit and this
engine is 2. That is a known gap in the number, recorded rather than rounded away.

Two of my own claims died here and are kept as retractions because they were the kind
that read as reasoning rather than as guesses:

- *"No source supports an exemption for a foe you are still adjacent to."* The source
  does exactly that, by relocating the mover and subtracting the destination set.
- *"A foe adjacent to both squares strikes twice."* It cannot: guard fires from
  `adjacent(destination)` and the back attack from `adjacent(origin) \
  adjacent(destination)`, so no combatant is ever in both sets.

**Also worth carrying:** retail *grants* the reacting foe an attack it does not have
(`ovr014.cs:398-401`) and saves/restores its target, so its own turn is undisturbed.
And the message path prints `"(from behind) "`, so in a faithful UI every one of these
should be labelled as such.

### 9.2 Commands whose semantics are now settled

- **DELAY** — acts **later in the same round**, at segment 10, the last. Not a lost
  turn: the character gets a full turn when reached. Both the CoK and DoK Journals say
  so explicitly; DQK's says "hold action until the end of the round" without naming a
  segment. The engine's `rotate_order_to_tail` is therefore faithful in effect. It is
  *not* faithful in expression: retail puts two delayers both on segment 10, an order
  array puts them in delay order. That dissolves only if initiative becomes segments.
- **GUARD** — a **readied attack**, not an AC bonus, and the sentence is word-for-word
  identical in all three manuals: "GUARD sets a character to stand and attack the first
  enemy that moves adjacent. GUARD is only an option if a character is armed with a
  melee weapon." `trigger_guard_reactions` matches this. **When guard expires is stated
  nowhere in any of the three games** — the engine consuming it at the guard's own next
  turn is an inference, and is labelled as one in the source.
- **QUICK (DoK, DQK) / AUTO (CoK)** — the same command renamed, and it is a **rule, not
  a UI convenience**: it sets *persistent per-character state* that survives the current
  combat and every subsequent one until manual control is reselected, with a per-caster
  magic on/off sub-toggle (byte-confirmed in all three: CoK `GAME.OVR` @0xB2A6
  `Magic On`/`Magic Off`, DoK `START.EXE` @0xCE24, DQK `DQK.EXE` @0x6845C). DQK's manual
  omits the persistence sentence, so attribute it to CoK and DoK only. The native engine
  treats `Q` as "auto this turn", which is the wrong shape.
- **CoK's DONE opens the submenu; QUIT ends the turn.** §1.1's counterintuitive reading
  is confirmed from a third direction — the manual states `DONE is used to bring up the
  secondary combat menu` and `QUIT ends a character's turn`. Note CoK has **two
  different Dones**: the menu one, and a move-mode `Done` in the movement bar
  (`GAME.OVR` @0xBAC9, mirrored by DoK `START.EXE` @0xEA13 and DQK `DQK.EXE` @0x68B18
  `Undo Done`). One dispatch table must not serve both.
- **SPEED** is pure UI — a message-printing rate, 0 fastest to 9 slowest, documented
  under the Encamp menu's ALTER command and byte-confirmed as a global setting
  (`GAME.OVR` @0x1C99E `Game Speed = %d (0=fastest 9=slowest)`). It is **not**
  initiative. Its ALTER siblings are not all cosmetic, though: `LEVEL` and `ORDER` bear
  rules, `ICON` and `PICS` do not.

### 9.3 Rules retail has that this engine does not

Listed because each is a behaviour a player would notice, not a nicety:

1. **Missile fire is forbidden while adjacent to an enemy** (DoK and DQK Journals), with
   a kender hoopak exception, and bows fire twice / darts three times per turn.
   `pick_missile_target` filters on range and line-of-fire only.
2. **CAST has two gates we ignore**: it does not appear at all if the caster has been hit
   recently (concentration broken, all three manuals), and spells take **casting time in
   segments**, beginning on the caster's segment and going off a few segments later
   (DoK and DQK Journals) — so a caster can be interrupted or killed in between.
3. **YELL** is a kender-only taunt: intelligent opponents save vs magic or attack in a
   berserker rage, redirecting attacks at the kender for the duration of the combat, at
   a combat penalty. Absent entirely. It is on CoK's *main* menu and DoK's and DQK's top
   bar, so this is a visible hole.
4. **Fleeing is gated**: faster than all enemies to escape freely, 50% at parity with the
   fastest, an exception if you can reach the edge unseen, no XP for the battle, and —
   the harsh one — **if all active characters flee, dead and unconscious characters are
   lost**. None of it is implemented.
5. **BANDAGE and the DYING state.** 0 HP is unconscious and safe; −1..−9 is *dying* and
   bleeds 1 HP per turn until bandaged; −10 is dead. `CF_DYING` does not exist in
   `cccombat.asm` and neither do `bleed` or `bandage` — the engine cannot represent the
   state the command operates on. See 9.5.

### 9.4 NULLs — reported as nulls

- **Turn undead has no numbers anywhere.** No roll, no table, no range, no duration in
  any manual or Journal of any of the three games. Whatever the engine uses for range
  and flee duration is invented and should say so.
- **GUARD expiry** — unstated in all three.
- **Post-BANDAGE status** — unstated in all three; no status list has a
  "bandaged"/"stabilised" entry.
- **The bleed tick period** — the texts say "per turn"; the manuals define a turn as ten
  minutes, but only in a spell-duration context. Per combat round is an inference.
- **Regaining manual control from QUICK/AUTO** — all three manuals defer to the Data
  Card, which is not among the PDFs.
- **Initiative die, range, and the size of the DEX modifier** — unstated in all six
  documents.
- **CoK YELL's AC modifier sign** — the CoK PDF text layer drops the glyph entirely
  (`suffer a -2 THACQ and 2 AC`). It may be `-2`, `+2` or bare `2`. **Do not let it
  default.** More generally that extraction has dropped digits 2-8 throughout, so any
  CoK Journal *number* must be re-extracted with a different text layer before use; the
  CoK Cluebook extracts cleanly, so a clean layer is achievable.
- **DQK's menu length** — its manual prints 12 items with no MOVE, while `DQK.EXE`
  @0x68AD3 stores 13 including `Move`. Unresolved; settling it needs a running game.

### 9.5 A free flag bit exists, so BANDAGE is not structurally blocked

`C_FLAGS`'s low byte is fully spent (`CF_DEAD` .. `CF_ASLEEP`, bits 0-7) and its high
byte stores decoded morale as `percent+1`. That reads at first like "no room for a
`CF_DYING`". It is not: `set_morale_from_al` clamps the percentage to **102** before the
`inc`, so the stored high byte never exceeds **103**, and **bit 15 (`8000h`) is free**.

A dying state can therefore be added without restructuring the 38-byte record. What is
still missing is everything around it — a per-round bleed tick, a `BANDAGE` command, and
the ordinary-play question of what state a bandaged character ends in, which is a
documented NULL (9.4). Worth knowing before the camp/rest/heal work, since that is where
healing out of this state belongs.

### 9.6 The move loop itself — three mechanisms, and one label I had invented (2026-09-07)

Section 9.1 settled what the *back attack* does. It left the surrounding loop unexamined,
and the loop turned out to hold three separate rules the engine had wrong. All three come
from the same Gen1 sibling oracle as the rest of §9 — byte-proven in CoAB, **not** in the
Krynn binaries — except where a figure is re-derived from CoK's own `GAME.OVR`, which is
said explicitly.

**The unit was already right, and now it is right for a reason.** `actions.move` is in
**half-squares**: `CalcMoves` returns `moves * 2` (`ovr014.cs:56-79`), the prompt divides
it back (`ovr009.cs:433`, `"Move/Attack, Move Left = {0} "` with `move / 2`), and the loop
guard `while (player.actions.move > 1 …)` therefore means "can still afford the cheapest
step", not a reserve. **Nothing is reserved**, and a stranded odd half is discarded by the
tail (`ovr009.cs:584-587`, `if (move < 2) move = 0`).

**1. An unaffordable step is refused, not overdrawn.** The cost is computed and tested
*before* anything is committed: `if (cost > player.actions.move)` prints `"can't go there"`
and skips the whole else-branch — no back attack, no step, no charge — leaving the loop to
re-prompt (`ovr009.cs:544-546`). Impassable terrain reaches the same message through
`move_cost == 0xFF` forcing the cost to `0xFFFF`, which is why one string serves both.
This engine charged first and let the budget go negative. **It is observable**: at movement
4 (budget 8) a diagonal walk buys **two** steps, because the third costs 3 against a
remaining 2; overdrawing buys three. Fixture 42 pins it, and 3-steps-instead-of-2 is what
the mutation actually produced.

**2. A bump attack costs no movement, and does not end the move by itself.** This is the
one I had labelled `; the swing ends the move, as in retail` **without evidence**, and
flagged as an unlabelled inference. It is wrong twice.

The oracle's move loop (`ovr009.cs:426-583`) contains **no** `break`, `continue`, `goto` or
`return` — the whole body was read. A bump attack is a branch inside one iteration. Move
mode ends only as a *side effect*: `AttackTarget` sets `turnComplete` once the attacker's
attacks are spent (`ovr014.cs:864-868`), which calls `clear_actions` (`ovr014.cs:999-1002`),
whose `Action.Clear` sets `move = 0` (`Classes/Action.cs:33-39`). So it is **`move = 0`,
not `move -= cost`** — model it as a debit and you diverge the moment a character has more
than one attack.

And **killing the target leaves move mode open**. The drain loop at `ovr014.cs:811-816`
exits early on `targetNotInCombat` with attacks unspent, so `turnComplete` stays false,
`clear_actions` never runs, and the walk continues on an untouched budget. A target that
*survives* absorbs every remaining attack in that one command. Fixtures 43 and 44 pin both
halves against the same tape and seed, differing only in the target's hit points.

*Stated shortfall:* the oracle carries two counters (primary and secondary weapon,
`attackIdx` 2 down to 1) and this engine's ledger is one, so a one-attack character here
ends its move on a kill where retail's second counter might still be positive. The
kill-keeps-moving rule is only observable at 2+ attacks in this engine.

*Also NOT a rule:* there is no "attacked this turn" latch. `actions.field_8`
(`ovr014.cs:738`) has exactly three references in the whole decompile and the two reads sit
in `reclac_attacks` (`ovr014.cs:508-510`), guarding only against a mid-turn weapon swap
raising an already-spent attack rate. It never gates movement.

**3. ESC is an undo, not an abort.** `arg_4 == 0` restores `movesBackup` *and* teleports
the figure back to its pre-move square (`ovr009.cs:441-455` → `ovr033.sub_7515A`, which
sets `gbl.CombatMap[player_index].pos = pos`). The full allowance comes back. If the old
square is now blocked the turn ends instead. **This engine treats ESC as "end the move",
which keeps the walk — that is a divergence and is not fixed here.** Enter (13) is the
different thing: it keeps both the position and the remaining allowance.

**A decompiler artifact to not copy, and it matters.** `ovr009.cs:525` renders the
affordability pre-check's diagonal test as `if ((dir / 2) < 1)`. The original is
`shr al,1` + `jnb` (`coab_new.lst`, `ovr009:0DAD-0DD0`) — a **bit-0 test**, `(dir & 1)`,
identical to `sub_3E748`'s. The decompiler turned a carry test into a division. Implemented
from the C# it would cost 3 for directions 0 and 1 and 2 for everything else. `ovr014.cs:265`
is the truth; the C# in this repo is not authoritative for bit tests.

**Divergence left standing, deliberately:** retail re-offers the combat menu after a move
(`ovr009.cs`'s `while (var_2 == false)` loop), so a character may move, act, and move again
inside one turn. Here `.move` ends the turn. Changing it would alter what every existing
tape *means* — `"M4D"` would stop being one command followed by an end — so it needs its own
commit with its own control.
