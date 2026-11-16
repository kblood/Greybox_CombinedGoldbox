/**
 * Compose the Champions of Krynn DOS exploration/travel screen, pixel-for-pixel, into a single
 * indexed 320×200 framebuffer — the real engine layout, not a CSS look-alike.
 *
 * The original engine paints this screen as a 40×25 grid of 8×8 symbols (`Put8x8Symbol`): an
 * outer decorative border, a vertical + horizontal separator, an inner frame around the
 * first-person viewport, the right-hand party panel, a position/time line, and the message /
 * prompt text — all drawn from the game's own `8X8D1.DAX` tiles and font. This module
 * reproduces that placement. See `docs/engine/research/cok-dos-screen-layout.md`.
 *
 * Frame placement arrays are ported verbatim from the COAB decompile (`engine/seg037.cs`,
 * `draw8x8_03` = the DungeonMap layout). NOTE: those arrays are COAB *game data* and address
 * set-4 tiles up to index 39, but CoK's block 202 holds only 38 tiles (indices 0..37). The two
 * decorative-node values (8, 9) therefore have no CoK tile; we substitute the run's straight
 * tile so the border stays continuous (open question #6 in the spec — CoK's own arrays live in
 * START.EXE and are not yet extracted). Pure / DOM-free.
 */
import type { IndexedImage } from '../model/index.js';
import {
  createFramebuffer,
  blitTile,
  blitIndexedClipped,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { drawHorizontalMenu } from './menuBar.js';

// ── EGA colour indices used by the exploration UI (see spec §8) ──────────────────────────
const C_BLACK = 0;
const C_GREEN = 10; // bright green — stats, position/time, menu body
const C_WHITE = 15; // active party member / headers / selected menu item

/**
 * Frame placement: per-cell value arrays + the offsets that turn a value into a tile index.
 * The original engine forms a symbol id = `value + base`, then indexes its symbol set with
 * `id - symbolSetFix`. We fold that to a tile index = `value + base - symbolSetFix`.
 *
 * The arrays and offsets are GAME-SPECIFIC data (baked into each title's executable), NOT
 * engine constants — see {@link COAB_FRAME_LAYOUT} (the only one we have decompiled) and the
 * note on it. The compositor is layout-agnostic; pass whichever layout matches `frameTiles`.
 */
export interface ExploreFrameLayout {
  /** value→tile index offset for the outer border + separators. */
  outerBase: number;
  /** value→tile index offset for the inner viewport frame. */
  innerBase: number;
  /** Tile index substituted when a value addresses a tile the set lacks, on a HORIZONTAL run. */
  straightH: number;
  /** …on a VERTICAL run. */
  straightV: number;
  outerTop: readonly number[]; // 40 cols, row 0
  outerBottom: readonly number[]; // 40 cols, row 23
  outerLeft: readonly number[]; // rows 0..22, col 0
  outerRight: readonly number[]; // rows 0..22, col 39
  hsep: readonly number[]; // 40 cols, row 16
  vsep: readonly number[]; // rows 0..16, col 16
  innerTop: readonly number[]; // cols 2..14, row 2 (indexed by col)
  innerBottom: readonly number[]; // cols 2..14, row 14 (indexed by col)
  innerLeft: readonly number[]; // rows 2..14, col 2 (indexed by row)
  innerRight: readonly number[]; // rows 2..14, col 14 (indexed by row)
}

/**
 * The Curse of the Azure Bonds frame layout (COAB decompile `engine/seg037.cs` `draw8x8_03`).
 * Its set-4 base (0x11E/0x114 − symbolSetFix 0x100) addresses block-202 tiles 30..39.
 *
 * WARNING: this is COAB's layout, NOT Champions of Krynn's. CoK keeps its frame art in block
 * 203 (set 0) with different placement arrays; using this layout against CoK assets draws the
 * wrong tiles (e.g. moon tiles as the border). It ships here only as a reference / structural
 * stand-in until CoK's own arrays are extracted (see docs/engine/research/cok-frame-arrays.md).
 */
export const COAB_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0x11e - 0x100, // 30
  innerBase: 0x114 - 0x100, // 20
  straightH: 1,
  straightV: 2,
  outerTop:    [0,6,1,1,1,1,1,1,6,1,1,1,1,4,1,1,1,6,1,1,1,1,1,1,1,8,1,1,1,1,1,1,1,4,1,1,1,6,1,2],
  outerBottom: [1,8,6,1,1,1,1,1,1,1,1,4,1,1,1,1,1,6,8,1,1,1,4,1,1,1,1,1,1,6,1,1,1,1,1,1,1,1,4,3],
  outerLeft:   [0,2,9,5,2,2,2,2,2,2,5,7,2,2,2,2,2,9,7,2,2,2,7,1],
  outerRight:  [2,2,9,7,2,2,2,5,2,2,2,2,2,2,2,2,2,7,2,2,2,2,5,2],
  hsep:        [0,8,1,1,1,1,1,1,1,1,1,6,1,1,1,8,4,1,1,1,6,1,1,1,1,1,1,1,1,1,4,1,6,1,1,1,1,1,8,2],
  vsep:        [0,7,5,2,2,2,2,2,2,2,2,2,2,5,2,9,4],
  innerTop:    [4,3,0,6,1,1,1,1,8,1,1,4,1,1,2,1,4],
  innerBottom: [1,2,1,4,1,1,1,1,1,1,8,4,1,1,3],
  innerLeft:   [5,2,0,2,7,2,2,2,2,5,2,2,2,2,1],
  innerRight:  [2,1,2,5,9,2,2,2,7,5,2,2,2,2,3],
};

/**
 * Champions of Krynn's actual exploration-screen frame layout, recovered by exact pixel
 * matching (MSE=0) of `8X8D1.DAX` **block 202** tiles against a real CoK DOS screenshot
 * (`renders/explore/ref/cok_blog_30.png`) — see `docs/engine/research/cok-frame-arrays.md`.
 *
 * Values are DIRECT block-202 tile indices (base 0). The whole frame is six tiles: 20 =
 * horizontal cyan double-bar, 24 = vertical gray column, 23/25 = upper/lower junction, 21/22
 * = the brackets that flank each moon on the top edge. The three moons (block-202 tiles
 * 26–37, phase-dependent) overlay the top row at columns 8/19/30 — pass them as
 * `ExploreScreenInput.moons`. Outer and inner frames share the same tiles.
 */
export const COK_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0,
  innerBase: 0,
  straightH: 20,
  straightV: 24,
  outerTop:    [20,20,20,20,20,20,20,21,20,22,20,20,20,20,20,20,20,20,21,20,22,20,20,20,20,20,20,20,20,21,20,22,20,20,20,20,20,20,20,20],
  outerBottom: [20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],
  outerLeft:   [20,23,24,24,24,24,24,24,24,24,24,24,24,24,24,25,20,23,24,24,24,24,25,20],
  outerRight:  [20,23,24,24,24,24,24,24,24,24,24,24,24,24,24,25,20,23,24,24,24,24,25,20],
  hsep:        [20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],
  vsep:        [20,23,24,24,24,24,24,24,24,24,24,24,24,24,24,25,20],
  // Inner arrays are indexed by col/row directly (cells 2..14); entries 0,1 are unused pads.
  innerTop:    [0,0,20,20,20,20,20,20,20,20,20,20,20,20,20],
  innerBottom: [0,0,20,20,20,20,20,20,20,20,20,20,20,20,20],
  innerLeft:   [0,0,20,23,24,24,24,24,24,24,24,24,24,25,20],
  innerRight:  [0,0,20,23,24,24,24,24,24,24,24,24,24,25,20],
};

/**
 * Death Knights of Krynn's DOS exploration-screen frame layout, recovered by exact cell-by-cell
 * matching of `8X8D1.DAX` block 202 against a native 320×200 retail-demo framebuffer. Every chrome
 * cell below is an MSE=0 match. DoK stores these roles at indices 0..11, unlike CoK's 20..25
 * ordering; feeding DoK art through {@link COK_FRAME_LAYOUT} paints moon discs as straight borders.
 *
 * Tiles 0..3 are the four corners, 4 is the horizontal run, 5/6 are moon brackets, 7 is the
 * vertical run, 8/9 are the vertical separator's top/bottom junctions, and 10/11 terminate the
 * horizontal separator. DoK's phase-dependent moon discs live separately at indices 12..23.
 */
export const DOK_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0,
  innerBase: 0,
  straightH: 4,
  straightV: 7,
  outerTop:    [0,4,4,4,4,4,4,5,4,6,4,4,4,4,4,4,4,4,5,4,6,4,4,4,4,4,4,4,4,5,4,6,4,4,4,4,4,4,4,1],
  outerBottom: [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,3],
  outerLeft:   [0,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,10,7,7,7,7,7,7,2],
  outerRight:  [1,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,11,7,7,7,7,7,7,3],
  hsep:        [10,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,11],
  vsep:        [8,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,9],
  // Inner arrays are indexed directly by col/row (2..14); entries 0 and 1 are padding.
  innerTop:    [0,0,0,4,4,4,4,4,4,4,4,4,4,4,1],
  innerBottom: [0,0,2,4,4,4,4,4,4,4,4,4,4,4,3],
  innerLeft:   [0,0,0,7,7,7,7,7,7,7,7,7,7,7,2],
  innerRight:  [0,0,1,7,7,7,7,7,7,7,7,7,7,7,3],
};

/**
 * Secret of the Silver Blades' DOS frame, recovered at MSE=0 from native attract-demo frame t0040
 * against all 101 tiles in `8X8D1.DAX#202`. All 237 standard chrome cells match exactly. Secret
 * has no Dragonlance moon cut-outs: its top edge is a continuous blue/white run. Tiles 49/52..55
 * form the outer screen and tiles 56..59 form the inset first-person window.
 */
export const SECRET_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0,
  innerBase: 0,
  straightH: 55,
  straightV: 53,
  outerTop:    [49,49,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55],
  outerBottom: [55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55],
  outerLeft:   [49,49,53,53,53,53,53,53,53,53,53,53,53,53,53,54,55,52,53,53,53,53,54,55],
  outerRight:  [55,52,53,53,53,53,53,53,53,53,53,53,53,53,53,54,55,52,53,53,53,53,54,55],
  hsep:        [55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55],
  vsep:        [55,52,53,53,53,53,53,53,53,53,53,53,53,53,53,54,55],
  innerTop:    [0,0,59,59,59,59,59,59,59,59,59,59,59,59,59],
  innerBottom: [0,0,59,59,59,59,59,59,59,59,59,59,59,59,59],
  innerLeft:   [0,0,59,56,57,57,57,57,57,57,57,57,57,58,59],
  innerRight:  [0,0,59,56,57,57,57,57,57,57,57,57,57,58,59],
};

/**
 * Gateway to the Savage Frontier's 5-plane VGA frame. Native frame t0086 proves all 237/237 cells
 * exactly after the block's 33-byte prefix and row-interleaved planar5 pixels are decoded. Tiles
 * 28/22 are the decorated outer horizontal/vertical runs; 39/38 form the inset box. The apparently
 * irregular 28..33 choices are the retail frame's fixed sparkle pattern, not approximations.
 */
export const GATEWAY_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0,
  innerBase: 0,
  straightH: 28,
  straightV: 22,
  outerTop:    [20,33,33,28,28,28,28,28,28,28,28,28,29,28,33,33,20,33,33,28,28,28,28,28,28,28,28,31,32,28,28,28,28,30,28,28,28,33,33,20],
  outerBottom: [20,33,33,28,30,28,28,28,29,28,28,29,28,28,28,28,28,31,28,29,32,28,28,32,28,28,28,28,28,28,28,28,28,28,28,30,28,33,33,20],
  outerLeft:   [20,27,27,25,22,26,22,22,24,22,22,22,22,22,27,27,20,27,27,22,22,27,27,20],
  outerRight:  [20,27,27,22,24,22,22,24,22,22,22,22,26,25,27,27,20,27,27,22,22,27,27,20],
  hsep:        [20,33,33,28,28,31,28,28,28,28,28,28,28,28,33,33,20,33,33,28,29,28,28,28,28,28,28,28,28,28,28,30,28,28,28,28,28,33,33,20],
  vsep:        [20,27,27,22,22,25,22,22,24,22,22,22,23,22,27,27,20],
  innerTop:    [0,0,34,39,39,39,39,39,39,39,39,39,39,39,36],
  innerBottom: [0,0,35,39,39,39,39,39,39,39,39,39,39,39,37],
  innerLeft:   [0,0,34,38,38,38,38,38,38,38,38,38,38,38,35],
  innerRight:  [0,0,36,38,38,38,38,38,38,38,38,38,38,38,37],
};

/**
 * Neverwinter Nights (DOS/AOL, 1991) exploration-screen frame layout, calibrated from `8X8D.DAX`
 * block 202 (40 tiles vs. CoK's 38 — see `docs/engine/research/neverwinter-nights-dos-format-
 * coverage.md`'s 8X8D detail section and the follow-up calibration in that doc's "Prioritized
 * follow-ups" item 2). Unlike CoK, this is NOT an MSE=0 match against a real screenshot — no
 * surviving DOS screenshot of this title's exploration screen has been located — it is a
 * STRUCTURAL calibration: visually inspecting all 40 tiles (`renders/explore/nwn/
 * block202_grid_zoom.png` / `block202_grid_20to39.png`, not committed — git-ignored render
 * output) found the same "clean repeating border" grammar CoK's own block 202 uses, just with a
 * different (wood/parchment brown-yellow, vs. CoK's cyan/gray) art style and only THREE roles
 * confidently identified by visual pattern rather than pixel match:
 *
 *   - tile 28: a clean, uniform horizontal wood-grain double-bar — the straight run for every
 *     horizontal edge (outer top/bottom, both separators, inner top/bottom).
 *   - tile 22: a clean, uniform vertical wood-grain double-bar (tile 38 is a near-identical
 *     second copy) — the straight run for every vertical edge (outer left/right, the vertical
 *     separator, inner left/right).
 *   - tile 27: an unambiguous "+"-shaped full horizontal bar crossing a full vertical bar — used
 *     wherever CoK's layout uses a directional (asymmetric) upper/lower junction tile (23/25).
 *     NWN's tile set does not have two separably-identified junction pieces the way CoK's does,
 *     so this single symmetric cross tile fills BOTH junction roles here — a simplification, not
 *     a proven per-role split.
 *
 * Tiles 0-19 (direction arrows + a 16-tile uniform-gray "gauge" cluster) and the remaining 20-39
 * tiles NOT listed above (20/21/34-37: colour-varying "gem"-in-bracket icons; 23-26/29-33: assorted
 * transition/corner-looking pieces) were visually inspected but their EXACT roles were not pinned
 * with confidence — most plausibly a moon/status-gem overlay and asymmetric corner caps
 * respectively, mirroring CoK's bracket(21/22)+moon(26-37) top-row overlay, but Forgotten
 * Realms/NWN has no Dragonlance moon lore to motivate re-using CoK's exact scheme, and no
 * reference screenshot exists to confirm placement. Rather than guess, this layout omits any
 * bracket/moon overlay entirely (`outerTop`/`hsep` are uniformly `straightH`, unlike CoK's, which
 * carves out bracket+moon columns at 7-9/18-20/29-31) — a plain, undecorated box border. This is
 * the same "leave it honestly absent rather than misassembled" convention `GameData.
 * frameTilesUnverified`'s own doc comment already established; callers should likewise pass
 * `moons: undefined` (or omit it) when using this layout.
 */
export const NWN_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0,
  innerBase: 0,
  straightH: 28,
  straightV: 22,
  outerTop:    [28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  outerBottom: [28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  outerLeft:   [28,27,22,22,22,22,22,22,22,22,22,22,22,22,22,27,28,27,22,22,22,22,27,28],
  outerRight:  [28,27,22,22,22,22,22,22,22,22,22,22,22,22,22,27,28,27,22,22,22,22,27,28],
  hsep:        [28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  vsep:        [28,27,22,22,22,22,22,22,22,22,22,22,22,22,22,27,28],
  // Inner arrays are indexed by col/row directly (cells 2..14); entries 0,1 are unused pads,
  // matching COK_FRAME_LAYOUT's own convention.
  innerTop:    [0,0,28,28,28,28,28,28,28,28,28,28,28,28,28],
  innerBottom: [0,0,28,28,28,28,28,28,28,28,28,28,28,28,28],
  innerLeft:   [0,0,28,27,22,22,22,22,22,22,22,22,22,27,28],
  innerRight:  [0,0,28,27,22,22,22,22,22,22,22,22,22,27,28],
};

/** The three moons overlay the top frame row at these columns (CoK). */
export const MOON_COLUMNS = [8, 19, 30] as const;
const MOON_ROW = 0;

// ── Layout geometry (tile cells / pixels) ────────────────────────────────────────────────
const GRID_COLS = 40;
const VIEWPORT_ORIGIN = { x: 8, y: 8 }; // 3-D view top-left (WALL_VIEWPORT)
// Confine the viewport so it cannot spill past the vertical separator (col 16 = x128) or the
// horizontal separator (row 16 = y128); the inner frame is then drawn on top to mask the rim.
const VIEWPORT_CLIP = { x0: 8, y0: 8, x1: 128, y1: 128 };
const PANEL_COL = 17; // right party panel first column (x=136)
const PANEL_HDR_ROW = 2;
const PANEL_FIRST_PLAYER_ROW = 4;
const PANEL_MAX_PLAYERS = 6;
const PANEL_AC_COL = 31;
const PANEL_HP_COL = 36;
const POS_TIME_ROW = 15;
const TEXT_ROW0 = 17;
const TEXT_COL0 = 1;
const TEXT_MAX_ROWS = 6; // rows 17..22
const PROMPT_ROW = 24;

/** One party row as shown in the right panel. */
export interface ExploreParty {
  name: string;
  ac: string | number;
  hp: string | number;
  /** Highlight as the active/selected member (white instead of green). */
  active?: boolean;
  /**
   * M42.S1 — fallen this fight (unconscious, dying, or dead) — greys the row in `composeCombatScreen`.
   * `composeExploreScreen` intentionally leaves this unread: the exploration HUD's own party panel
   * already conveys a fallen member via a literal "DOWN"/"DEAD" hp string (`explore.ts`'s
   * `compositorParty()`) instead of colour, so no behaviour changes there.
   */
  down?: boolean;
  /**
   * M69.S1 — under a disabling tactical status (asleep/held/feared/slowed) this fight
   * ({@link TacticalCombatant.flags}) — asleep/held silently skip the actor's turn, feared strips
   * Attack/Cast from the legal-action list, none of which was ever visible on this panel before now
   * (only a one-time, scroll-prone combat-log line). Colour-only signal (this fixed-width panel has
   * no spare text-column budget); doesn't distinguish which status, only that one applies.
   * Intentionally excludes `hasted` (a buff, not a warning) and `fled`/`surrendered`/`unconscious`/
   * `dying`/`dead` (already covered by `down`). `composeExploreScreen` never sets or reads this — no live
   * tactical-combat state exists outside a battle.
   */
  impaired?: boolean;
  /**
   * M71.S1 — this party member chose Guard this fight ({@link TacticalCombatant.flags} has
   * `'guarding'`, CT.7d): the first foe to move within their melee reach takes a free "opportunity"
   * strike back. A reminder that they'll react, since the only other trace is a single scrolling
   * combat-log line. `composeExploreScreen` never sets or reads this, same as `impaired`.
   */
  guarding?: boolean;
}

export interface ExploreScreenInput {
  /** Optional full-screen source-art backdrop, painted before the viewport and chrome. */
  background?: IndexedImage | null;
  /** Precomposed source-art chrome pieces, painted over the viewport before text. */
  decorations?: ReadonlyArray<{ image: IndexedImage; x: number; y: number }>;
  /**
   * The frame symbol tiles (8×8 IndexedImages, magenta-keyed) that {@link frameLayout} indexes.
   * For Champions of Krynn this is `8X8D1.DAX` block 203 (set 0, 45 tiles). When omitted, no
   * border is drawn (the rest of the screen still composes).
   */
  frameTiles?: IndexedImage[] | null;
  /** Placement layout for `frameTiles`. Defaults to {@link COK_FRAME_LAYOUT}. */
  frameLayout?: ExploreFrameLayout;
  /**
   * The three moons, drawn over the top frame row at {@link MOON_COLUMNS} (cols 8/19/30).
   * Each is an 8×8 indexed tile for that moon's current phase (block-202 tiles 26–37);
   * entries may be null to skip. Order: [Lunitari(red), Solinari(white), Nuitari(blue)]
   * matches MOON_COLUMNS left→right as they appear on screen.
   */
  moons?: (IndexedImage | null)[];
  /** The first-person viewport (≤168×168 indexed), blitted at (8,8) and clipped to the window. */
  viewport?: IndexedFramebuffer | null;
  /** Text font (block 201). When absent, all text is skipped (frame still renders). */
  font?: BitmapFont | null;
  /** Right-panel party rows (max 6 shown). */
  party?: ExploreParty[];
  /** Position/time status line, e.g. "12,7 NORTH 06:30". */
  position?: string | null;
  /** Message/text area content (newline-separated; wraps at the text region). */
  message?: string | null;
  /** Prompt-bar text on the bottom row. */
  prompt?: string | null;
  /**
   * The in-screen command menu drawn on the bottom row in the original Gold Box style
   * (hotkey first-letters highlighted, the selected verb fully highlighted) — e.g. the
   * dungeon "Area Cast View Encamp Search Look" bar or the Encamp sub-menu. Takes precedence
   * over {@link prompt} when present.
   */
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Resolve a frame placement value to its tile, falling back to `straight` when the value
 * addresses a tile the set does not have (e.g. COAB values 8/9 → index 38/39 on a 38-tile set). */
function frameTile(tiles: IndexedImage[], value: number, base: number, straight: number): IndexedImage | null {
  const idx = value + base;
  return tiles[idx] ?? tiles[straight + base] ?? null;
}

/** Put a frame symbol at (row, col) if the tile resolves. */
function putFrame(
  fb: IndexedFramebuffer,
  tiles: IndexedImage[],
  value: number,
  base: number,
  straight: number,
  row: number,
  col: number,
): void {
  const tile = frameTile(tiles, value, base, straight);
  if (tile) blitTile(fb, tile, col, row);
}

/**
 * Draw ONLY the outer 40×24 border from `tiles`/`layout` (no separators, no inner viewport frame) —
 * the clean page frame a full-screen TEXT page wants (character sheet, spellbook, …). Reuses the
 * layout's outer arrays so the border art matches the exploration screen exactly.
 */
export function drawOuterBorder(
  fb: IndexedFramebuffer,
  tiles: IndexedImage[],
  layout: ExploreFrameLayout,
): void {
  const { outerBase: ob, straightH: sh, straightV: sv } = layout;
  for (let col = 0; col < GRID_COLS; col++) {
    putFrame(fb, tiles, layout.outerTop[col]!, ob, sh, 0, col);
    putFrame(fb, tiles, layout.outerBottom[col]!, ob, sh, 23, col);
  }
  for (let row = 0; row < layout.outerLeft.length - 1; row++) {
    putFrame(fb, tiles, layout.outerLeft[row]!, ob, sv, row, 0);
    putFrame(fb, tiles, layout.outerRight[row]!, ob, sv, row, 39);
  }
}

/**
 * Draw the shared 40×25 screen chrome — outer border, the two separators, and the inner
 * viewport frame — from `tiles` placed by `layout`. This is the decorative skeleton common to
 * BOTH the exploration screen and the combat screen (which reuse the identical border per
 * `docs/engine/research/combat-screen-plan-cok.md` §1.2). Factored out of
 * {@link composeExploreScreen} verbatim so the two compositors can't drift; the explore
 * goldens pin that this produces byte-identical output to the inline version it replaced.
 */
export function drawScreenChrome(
  fb: IndexedFramebuffer,
  tiles: IndexedImage[],
  layout: ExploreFrameLayout,
): void {
  const L = layout;
  const { outerBase: ob, innerBase: ib, straightH: sh, straightV: sv } = L;

  // Outer border.
  for (let col = 0; col < GRID_COLS; col++) {
    putFrame(fb, tiles, L.outerTop[col]!, ob, sh, 0, col);
    putFrame(fb, tiles, L.outerBottom[col]!, ob, sh, 23, col);
  }
  for (let row = 0; row < L.outerLeft.length - 1; row++) {
    putFrame(fb, tiles, L.outerLeft[row]!, ob, sv, row, 0);
    putFrame(fb, tiles, L.outerRight[row]!, ob, sv, row, 39);
  }

  // Separators: horizontal at row 16, vertical at col 16 (rows 0..16).
  for (let col = 0; col < GRID_COLS; col++) {
    putFrame(fb, tiles, L.hsep[col]!, ob, sh, 16, col);
  }
  for (let row = 0; row < L.vsep.length; row++) {
    putFrame(fb, tiles, L.vsep[row]!, ob, sv, row, 16);
  }

  // Inner viewport frame (cols/rows 2..14, indexed directly).
  for (let col = 2; col <= 14; col++) {
    putFrame(fb, tiles, L.innerTop[col]!, ib, sh, 2, col);
    putFrame(fb, tiles, L.innerBottom[col]!, ib, sh, 14, col);
  }
  for (let row = 2; row <= 14; row++) {
    putFrame(fb, tiles, L.innerLeft[row]!, ib, sv, row, 2);
    putFrame(fb, tiles, L.innerRight[row]!, ib, sv, row, 14);
  }
}

/**
 * Build the full exploration screen as a 320×200 indexed framebuffer. Resolve it to RGBA with
 * `framebufferToRGBA(fb, palette)` for display. The draw order matches the engine
 * (`docs/engine/research/cok-dos-screen-layout.md` §10): clear → viewport → outer frame →
 * separators → inner frame (on top of the viewport) → panel → position → text → prompt.
 */
export function composeExploreScreen(input: ExploreScreenInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);

  // 1. Paint the title's backdrop where one exists; older EGA layouts clear to black.
  if (input.background) blitIndexedClipped(fb, input.background, 0, 0, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  else fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  // 2. First-person viewport (drawn first; the inner frame masks its rim afterwards).
  if (input.viewport) {
    const vp: IndexedImage = {
      width: input.viewport.width,
      height: input.viewport.height,
      indices: input.viewport.indices,
      xOffset: 0,
      yOffset: 0,
      transparentIndex: null,
      palette: null,
    };
    blitIndexedClipped(
      fb,
      vp,
      VIEWPORT_ORIGIN.x,
      VIEWPORT_ORIGIN.y,
      VIEWPORT_CLIP.x0,
      VIEWPORT_CLIP.y0,
      VIEWPORT_CLIP.x1,
      VIEWPORT_CLIP.y1,
    );
  }

  // 3-5. Frame (outer border, separators, inner viewport frame) — only if frame tiles given.
  const tiles = input.frameTiles ?? null;
  if (tiles) {
    drawScreenChrome(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);
  }

  for (const decoration of input.decorations ?? []) {
    blitIndexedClipped(
      fb,
      decoration.image,
      decoration.x,
      decoration.y,
      0,
      0,
      SCREEN_WIDTH,
      SCREEN_HEIGHT,
    );
  }

  // 5b. The three moons overlay the top frame row at fixed columns. The moon disc sits on a
  // black cell (not the cyan bar), so clear the cell first — the moon tile's transparent
  // (magenta) pixels then show black, matching the original.
  if (input.moons) {
    input.moons.forEach((m, i) => {
      if (m && i < MOON_COLUMNS.length) {
        const col = MOON_COLUMNS[i]!;
        fillRectIndexed(fb, col * 8, MOON_ROW * 8, 8, 8, C_BLACK);
        blitTile(fb, m, col, MOON_ROW);
      }
    });
  }

  // 6. Right party panel + 7. position/time + 8. text + prompt (text needs the font).
  const font = input.font ?? null;
  if (font) {
    drawText(fb, font, 'NAME', PANEL_COL * 8, PANEL_HDR_ROW * 8, C_WHITE);
    drawText(fb, font, 'AC HP', (PANEL_AC_COL - 1) * 8, PANEL_HDR_ROW * 8, C_WHITE);
    const party = (input.party ?? []).slice(0, PANEL_MAX_PLAYERS);
    party.forEach((p, i) => {
      const row = PANEL_FIRST_PLAYER_ROW + i;
      drawText(fb, font, p.name.toUpperCase(), PANEL_COL * 8, row * 8, p.active ? C_WHITE : C_GREEN);
      drawText(fb, font, String(p.ac), PANEL_AC_COL * 8, row * 8, C_GREEN);
      drawText(fb, font, String(p.hp), PANEL_HP_COL * 8, row * 8, C_GREEN);
    });

    if (input.position) {
      drawText(fb, font, input.position.toUpperCase(), PANEL_COL * 8, POS_TIME_ROW * 8, C_GREEN);
    }

    if (input.message) {
      const lines = input.message.split('\n').slice(0, TEXT_MAX_ROWS);
      lines.forEach((line, i) => {
        drawText(fb, font, line.toUpperCase(), TEXT_COL0 * 8, (TEXT_ROW0 + i) * 8, C_WHITE);
      });
    }

    if (input.menu && input.menu.items.length > 0) {
      drawHorizontalMenu(fb, font, input.menu.items, {
        x: TEXT_COL0 * 8,
        y: PROMPT_ROW * 8,
        selected: input.menu.selected,
        idleColor: C_GREEN,
        selColor: C_WHITE,
      });
    } else if (input.prompt) {
      drawText(fb, font, input.prompt.toUpperCase(), TEXT_COL0 * 8, PROMPT_ROW * 8, C_GREEN);
    }
  }

  return fb;
}
