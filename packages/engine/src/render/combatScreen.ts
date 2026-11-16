/**
 * Compose the Champions of Krynn DOS tactical **combat** screen into a single indexed 320×200
 * framebuffer — the real engine layout, not a CSS look-alike.
 *
 * CoK combat is NOT the first-person dungeon screen with different contents. It uses the same
 * 40×25 / 8px tile vocabulary, but the tactical grid owns the full `draw_combat_picture` field
 * x[8,176) y[8,176). The first-person inner viewport frame and the dungeon separator at x=128
 * therefore must not be drawn over it. This compositor keeps the shared outer border, then draws
 * a combat-specific divider at x=176 with the party panel to its right.
 *
 * Pure / DOM-free, mirroring {@link composeExploreScreen}: resolve the returned framebuffer to
 * RGBA with `framebufferToRGBA(fb, palette)` for display. The chrome is drawn by the shared
 * {@link drawScreenChrome} so the two screens can never drift.
 *
 * GEOMETRY NOTE (A3.1 / CS.0 — CONFIRMED): the battle-grid cell→pixel mapping
 * ({@link CombatGridGeometry}) is now pinned from the COAB clean-room oracle
 * (`simeonpilgrim/coab`, MIT — same Gold Box generation), not a candidate guess. The engine draws
 * a combat cell as a 24×24 iso tile: `ovr033.sub_7416E` calls
 * `ovr034.DrawIsoTile(tile, screenPos.y*3, screenPos.x*3)`, `DrawIsoTile`→`OverlayUnbounded`
 * adds +1, and `seg040.draw_clipped_picture` multiplies the row/col by 8 — so cell (c,r) lands at
 * pixel `(8 + c*24, 8 + r*24)`; combatant icons go through the same `draw_combat_picture` path with
 * a matching `(tileX*3)+1` origin, so icons share the tile grid. The whole grid is clipped to the
 * `draw_combat_picture` window `x[8,176) y[8,176)` (= 168×168 = 7×7 cells of 24px). This is wider
 * than the *explore* 3-D viewport (clipped to x128): CoK's battle field genuinely extends past the
 * corridor view's separator. Still CANDIDATE: how the right party panel / vertical separator
 * reconcile with the 168-wide field (the combat-vs-explore chrome question, pinned in CS.10).
 */
import type { IndexedImage } from '../model/index.js';
import {
  createFramebuffer,
  blitIndexed,
  blitIndexedClipped,
  blitIndexedScaledClipped,
  blitTile,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { paintSkyBackdrop, type SkyFacing } from './sky.js';
import { drawText, type BitmapFont } from './textmode.js';
import {
  drawOuterBorder,
  COK_FRAME_LAYOUT,
  MOON_COLUMNS,
  type ExploreFrameLayout,
  type ExploreParty,
} from './exploreScreen.js';

// ── EGA colour indices (shared with the exploration UI) ──────────────────────────────────
const C_BLACK = 0;
const C_GREEN = 10; // bright green — menu/idle text
const C_WHITE = 15; // active member / selected menu item
const C_GRAY = 8; // downed member
const C_YELLOW = 14; // M69.S1 — impaired (asleep/held/feared/slowed); a distinct "caution" tier,
                      // between C_GREEN (fine) and C_GRAY (down)
const C_MAGENTA = 13; // highlighted HP in the CoAB display_hp helper
const C_CYAN = 11; // M71.S1 — guarding (readied ambush stance); a cool "on watch" tone, distinct
                    // from C_YELLOW (impaired/caution) and C_GRAY (down)
const C_PARTY_GLYPH = 9; // light blue — fallback party marker
const C_ENEMY_GLYPH = 12; // light red — fallback enemy marker

// ── Screen layout ────────────────────────────────────────────────────────────────────────
// The 168px battle field ends at x=176 (tile column 22). The party panel starts after that
// divider, so it cannot overlap the tactical grid.
const COMBAT_DIVIDER_COL = 22;
const PANEL_COL = 23;
const PANEL_HDR_ROW = 2;
const PANEL_FIRST_PLAYER_ROW = 4;
const PANEL_MAX_PLAYERS = 6;
const PANEL_AC_COL = 32;
const PANEL_HP_COL = 36;
const TEXT_ROW0 = 22;
const TEXT_COL0 = 1;
const TEXT_MAX_ROWS = 1; // one combat-status line below the 168px field
const MENU_ROW = 24;
const PROMPT_ROW = 24;

/**
 * The battle viewport box — the `draw_combat_picture` clip recovered from the COAB oracle:
 * `draw_clipped_picture(..., 8, 176, 8, 176)` (`seg040.cs`). The 168×168 window holds exactly 7×7
 * cells of 24px. Backdrop tiles + combatant icons are clipped to it so nothing spills past the
 * field; the combat chrome starts at x=176, so it never covers cells.
 */
const BATTLE_BOX = { x0: 8, y0: 8, x1: 176, y1: 176 } as const;

/** Logical→pixel mapping for the battle grid (data-driven; CANDIDATE default below). */
export interface CombatGridGeometry {
  /** Top-left pixel of cell (0,0). */
  originX: number;
  originY: number;
  /** Pixels per cell. */
  cellW: number;
  cellH: number;
  /** Grid extent in cells. */
  cols: number;
  rows: number;
}

/**
 * CONFIRMED geometry (A3.1 / CS.0), recovered from the COAB oracle: a 7×7 visible window of 24×24
 * cells filling the 168×168 battle box (x[8,176), y[8,176)). Cell (c,r) → pixel (8+c*24, 8+r*24).
 * No foreshortening (`screenPos*3` is a straight orthogonal scale — the "iso" name is historical).
 * The logical combat map is larger and scrolls under this window (COAB `mapScreenTopLeft`); these
 * 7×7 are the on-screen cells. See the GEOMETRY NOTE above for the call-chain derivation.
 */
export const COK_COMBAT_GEOMETRY: CombatGridGeometry = {
  originX: 8,
  originY: 8,
  cellW: 24,
  cellH: 24,
  cols: 7,
  rows: 7,
};

/** Where a combatant sits on the battle grid + how to draw it. View-model only — no rules. */
export interface CombatCellState {
  combatantId: string;
  side: 'party' | 'enemy';
  col: number;
  row: number;
  /** Icon to blit (SPRIT frame, magenta-keyed), or null to fall back to a coloured glyph. */
  icon: IndexedImage | null;
  /** 0..1; drives the down state (skeleton uses `down` directly). */
  hpFraction?: number;
  /** hp<=0 → drawn as a prone marker, not the standing icon. */
  down?: boolean;
  /** The unit whose turn it is → cursor box + panel highlight. */
  active?: boolean;
  /**
   * Footprint in cells (CT.7i): 1 = Small 1×1 (default), 2 = Large 2×2. `pos` is the top-left of the
   * footprint (mirrors the engine's `footprintCells` top-left anchor, CT.7f), so a Large figure paints
   * across cells `(col..col+size-1, row..row+size-1)` — a `size·cellW × size·cellH` block.
   */
  size?: number;
  /**
   * M70.S1 — currently under a disabling status (asleep/held/feared/slowed) this fight, mirroring
   * `ExploreParty.impaired` (M69.S1) but for the on-grid figure rather than the sidebar row. Applies to
   * either side (an enemy the player hasn't targeted yet, or the player's own hero). A top-of-footprint
   * bar, distinct from `down`'s bottom-of-footprint prone bar so the two never collide visually.
   * Intentionally excludes `hasted` (a buff) and `fled`/`surrendered`/`unconscious`/`dying`/`dead`
   * (already covered by `down`/the `fled`+`surrendered` skip in `visibleCells()`, M71.S1).
   */
  impaired?: boolean;
  /**
   * M71.S1 — this figure has a readied Guard reaction (`TacticalCombatant.flags.has('guarding')`,
   * CT.7d): the first foe to move within its melee reach takes a free "opportunity" strike
   * (`triggerGuardReactions()`). Set by the player's own Guard command OR the built-in AI (which
   * guards autonomously when it has nothing better to do this turn) — so an enemy can show this with
   * no player action at all. Applies to either side. A left-edge bar, distinct from `impaired`'s top
   * bar and `down`'s bottom bar, so a figure that is briefly both guarding and impaired (put to sleep
   * before its reaction triggers — `inflictStatus()` doesn't clear `guarding`) never visually conflicts.
   */
  guarding?: boolean;
}

/** Terrain under the grid: DUNGCOM/WILDCOM/RANDCOM 24×24 tiles (parseTileSet kind:'tileset'). */
export interface CombatBackdrop {
  tiles: IndexedImage[] | null;
  /**
   * Optional per-backdrop-cell tile index. The backdrop is tiled at the first tile's pixel
   * size across the battle box; entry k is the tile for the k-th backdrop cell in row-major
   * order. Out-of-range / missing → `fillTile`.
   */
  cellTile?: readonly number[] | null;
  /** Single fill tile when no per-cell map is given. Default 0. */
  fillTile?: number;
}

export interface CombatScreenInput {
  geometry?: CombatGridGeometry;
  backdrop?: CombatBackdrop | null;
  /**
   * Optional sky backdrop (ovr028-030): a per-area horizon band (+ optional time-of-day sun/moon)
   * painted into the 168×168 battle box BEHIND the terrain, before combatants. Default off (null /
   * omitted) so the explore/other lanes that compose without a sky are unaffected.
   */
  sky?: {
    skyIndex: number;
    horizonY?: number;
    floorIndex?: number;
    hour?: number;
    facing?: SkyFacing;
    bodySprite?: IndexedImage;
    bodyColourIndex?: number;
  } | null;
  /** Combatant placements + icons (party + enemies). */
  cells?: readonly CombatCellState[];
  /** Frame chrome tiles (block 202) + layout — reused from explore. */
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  /** Optional title-native moon discs, overlaid on the top chrome at columns 8/19/30. */
  moons?: readonly (IndexedImage | null)[];
  font?: BitmapFont | null;
  /** Right panel party rows (active highlighted, down grayed). */
  party?: ExploreParty[];
  /** Combat summary region, used by aim/manual targeting for the currently inspected combatant. */
  summary?: CombatSummary | null;
  /** Command menu — optional prompt plus items with the selected index highlighted. Drawn on the bottom bar. */
  menu?: { items: readonly string[]; selected: number; prompt?: string | null } | null;
  /** Combat log (newline-separated; wraps in the message region rows 17..22). */
  message?: string | null;
  /** Bottom prompt bar text (shown when there is no menu). */
  prompt?: string | null;
}

/** Compact combat side-summary, source-shaped after CoAB CombatDisplayPlayerSummary. */
export interface CombatSummary {
  name: string;
  hp: string | number;
  /** Source-shaped HP colour state: CoAB display_hp uses green full, yellow hurt, magenta highlighted. */
  hpState?: 'full' | 'damaged' | 'highlighted';
  ac: string | number;
  weapon?: string | null;
  status?: string | null;
  down?: boolean;
  impaired?: boolean;
  guarding?: boolean;
}

/** The pixel rect of grid cell (col,row) under `g`. */
function cellRect(g: CombatGridGeometry, col: number, row: number): { x: number; y: number; w: number; h: number } {
  return { x: g.originX + col * g.cellW, y: g.originY + row * g.cellH, w: g.cellW, h: g.cellH };
}

/** Tile the backdrop across the battle box, clipped. Tiles are their own pixel size (e.g. 24×24). */
function drawBackdrop(fb: IndexedFramebuffer, bd: CombatBackdrop): void {
  const tiles = bd.tiles;
  if (!tiles || tiles.length === 0) return;
  const fill = bd.fillTile ?? 0;
  const tw = tiles[0]!.width;
  const th = tiles[0]!.height;
  if (tw <= 0 || th <= 0) return;
  const cols = Math.ceil((BATTLE_BOX.x1 - BATTLE_BOX.x0) / tw);
  const rows = Math.ceil((BATTLE_BOX.y1 - BATTLE_BOX.y0) / th);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, k++) {
      const idx = bd.cellTile?.[k] ?? fill;
      const tile = tiles[idx] ?? tiles[fill] ?? tiles[0]!;
      blitIndexedClipped(
        fb,
        tile,
        BATTLE_BOX.x0 + c * tw,
        BATTLE_BOX.y0 + r * th,
        BATTLE_BOX.x0,
        BATTLE_BOX.y0,
        BATTLE_BOX.x1,
        BATTLE_BOX.y1,
      );
    }
  }
}

/**
 * Draw one combatant across its footprint: the icon (bottom-centre anchored, rising above the floor)
 * or a glyph. A Large (2×2) figure (`size` > 1) paints a `size·cellW × size·cellH` block top-left
 * anchored at its cell — a one-cell SPRIT fallback is nearest-neighbour upscaled by the footprint
 * size, while a native multi-cell CPIC (already wider/taller than one cell) is kept at 1:1. Small
 * (`size` 1, default) is the original 1-cell draw.
 */
function drawCombatant(fb: IndexedFramebuffer, g: CombatGridGeometry, cell: CombatCellState): void {
  const size = Math.max(1, Math.floor(cell.size ?? 1));
  const rect = cellRect(g, cell.col, cell.row);
  const fw = rect.w * size; // footprint pixel width/height (size×size cells, top-left anchored)
  const fh = rect.h * size;
  if (cell.down) {
    // Prone marker: a dim bar across the footprint floor.
    fillRectIndexed(fb, rect.x, rect.y + fh - 2, fw, 2, C_GRAY);
    return;
  }
  const icon = cell.icon;
  if (icon) {
    // Native large-monster CPICs are already 48x48 for a 2x2 footprint. Scaling those by `size`
    // produced 96x96 dragons and hid the party. Only scale art that still fits inside one cell;
    // this retains the established fallback behaviour for 12/24px one-cell sprites.
    const iconScale = size > 1 && icon.width <= rect.w && icon.height <= rect.h ? size : 1;
    const sw = icon.width * iconScale;
    const sh = icon.height * iconScale;
    const dx = Math.round(rect.x + fw / 2 - sw / 2);
    const dy = rect.y + fh - sh; // bottom-aligned to the footprint floor
    blitIndexedScaledClipped(fb, icon, dx, dy, iconScale, BATTLE_BOX.x0, BATTLE_BOX.y0, BATTLE_BOX.x1, BATTLE_BOX.y1);
  } else {
    // No sprite → a coloured marker filling the footprint interior.
    const color = cell.side === 'party' ? C_PARTY_GLYPH : C_ENEMY_GLYPH;
    fillRectIndexed(fb, rect.x + 1, rect.y + 1, Math.max(1, fw - 2), Math.max(1, fh - 2), color);
  }
  // M70.S1 — a caution bar across the TOP of the footprint (down's own bar sits at the BOTTOM, so the
  // two markers never overlap); works identically whether the figure draws via a blitted icon (enemy)
  // or the coloured glyph fallback (party) — no icon-pixel recolouring needed.
  if (cell.impaired) fillRectIndexed(fb, rect.x, rect.y, fw, 2, C_YELLOW);
  // M71.S1 — a LEFT-edge bar for a readied Guard stance; a distinct edge from impaired's top bar and
  // down's bottom bar, so a figure that is briefly both guarding and impaired never visually conflicts.
  if (cell.guarding) fillRectIndexed(fb, rect.x, rect.y, 2, fh, C_CYAN);
}

/** Draw a 1px white outline around the active unit's footprint (the turn cursor), clipped to the box. */
function drawCursor(fb: IndexedFramebuffer, g: CombatGridGeometry, cell: CombatCellState): void {
  const size = Math.max(1, Math.floor(cell.size ?? 1));
  const r = cellRect(g, cell.col, cell.row);
  const x0 = Math.max(BATTLE_BOX.x0, r.x);
  const y0 = Math.max(BATTLE_BOX.y0, r.y);
  const x1 = Math.min(BATTLE_BOX.x1, r.x + r.w * size);
  const y1 = Math.min(BATTLE_BOX.y1, r.y + r.h * size);
  if (x1 <= x0 || y1 <= y0) return;
  fillRectIndexed(fb, x0, y0, x1 - x0, 1, C_WHITE); // top
  fillRectIndexed(fb, x0, y1 - 1, x1 - x0, 1, C_WHITE); // bottom
  fillRectIndexed(fb, x0, y0, 1, y1 - y0, C_WHITE); // left
  fillRectIndexed(fb, x1 - 1, y0, 1, y1 - y0, C_WHITE); // right
}

/** Combat-specific chrome: outer border + a divider after the full 168px battle field. */
function drawCombatChrome(fb: IndexedFramebuffer, tiles: IndexedImage[], layout: ExploreFrameLayout): void {
  drawOuterBorder(fb, tiles, layout);
  const divider = tiles[layout.outerBase + layout.straightV] ?? tiles[layout.straightV];
  if (!divider) return;
  for (let row = 1; row <= 21; row++) {
    blitTile(fb, divider, COMBAT_DIVIDER_COL, row);
  }
}

function panelName(name: string): string {
  return name.toUpperCase().slice(0, Math.max(1, PANEL_AC_COL - PANEL_COL - 1));
}

function panelLine(text: string): string {
  // CoAB TextRegion.CombatSummary is inclusive x 0x17..0x26, i.e. 16 text columns.
  return text.toUpperCase().slice(0, 16);
}

function drawCombatSummary(fb: IndexedFramebuffer, font: BitmapFont, summary: CombatSummary): void {
  const color = summary.down ? C_GRAY : summary.impaired ? C_YELLOW : summary.guarding ? C_CYAN : C_WHITE;
  const hpColor = summary.down ? C_GRAY
    : summary.hpState === 'highlighted' ? C_MAGENTA
    : summary.hpState === 'damaged' ? C_YELLOW
    : summary.hpState === 'full' ? C_GREEN
    : color;
  drawText(fb, font, panelLine(summary.name), PANEL_COL * 8, PANEL_HDR_ROW * 8, color);
  drawText(fb, font, 'HITPOINTS', PANEL_COL * 8, (PANEL_HDR_ROW + 2) * 8, C_GREEN);
  drawText(fb, font, String(summary.hp), PANEL_HP_COL * 8, (PANEL_HDR_ROW + 2) * 8, hpColor);
  drawText(fb, font, 'AC', PANEL_COL * 8, (PANEL_HDR_ROW + 3) * 8, C_GREEN);
  drawText(fb, font, String(summary.ac), PANEL_HP_COL * 8, (PANEL_HDR_ROW + 3) * 8, color);
  if (summary.weapon) drawText(fb, font, panelLine(summary.weapon), PANEL_COL * 8, (PANEL_HDR_ROW + 5) * 8, C_GREEN);
  if (summary.status) drawText(fb, font, panelLine(summary.status), PANEL_COL * 8, (PANEL_HDR_ROW + 6) * 8, color);
}

/**
 * Build the full 320×200 indexed combat screen. Pure / DOM-free. Draw order: clear → backdrop
 * → combatant icons (back-to-front by row) → active cursor → combat chrome → right panel → menu →
 * message → prompt.
 */
export function composeCombatScreen(input: CombatScreenInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  const g = input.geometry ?? COK_COMBAT_GEOMETRY;

  // 1. Clear the interior.
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  // 1a. Optional sky backdrop (ovr028-030). paintSkyBackdrop fills the FULL framebuffer width, so it
  // runs on a BATTLE_BOX-sized sub-fb and is blitted into the box — a direct call on `fb` would
  // clobber the right party panel (x ≥ 176). Painted before terrain so tiles/icons overpaint it.
  if (input.sky) {
    const sw = BATTLE_BOX.x1 - BATTLE_BOX.x0;
    const sh = BATTLE_BOX.y1 - BATTLE_BOX.y0;
    const sub = createFramebuffer(sw, sh, C_BLACK);
    paintSkyBackdrop(sub, input.sky.skyIndex, {
      horizonY: input.sky.horizonY ?? 48,
      floorIndex: input.sky.floorIndex ?? 8,
      hour: input.sky.hour,
      facing: input.sky.facing,
      skyColour: input.sky.skyIndex,
      bodySprite: input.sky.bodySprite,
      bodyColourIndex: input.sky.bodyColourIndex,
    });
    // IndexedFramebuffer is not an IndexedImage — wrap it (opaque, no per-image palette) for blit.
    blitIndexed(fb, { ...sub, xOffset: 0, yOffset: 0, transparentIndex: null, palette: null }, BATTLE_BOX.x0, BATTLE_BOX.y0);
  }

  // 2. Backdrop terrain (confined to the battle box).
  if (input.backdrop) drawBackdrop(fb, input.backdrop);

  // 3. Combatants, back-to-front (smaller row first) so nearer figures overpaint farther ones.
  const cells = (input.cells ?? []).slice().sort((a, b) => a.row - b.row);
  for (const cell of cells) drawCombatant(fb, g, cell);

  // 4. Active-unit cursor.
  const activeCell = cells.find((c) => c.active);
  if (activeCell) drawCursor(fb, g, activeCell);

  // 5. Combat chrome (outer border + divider after the full tactical field).
  const tiles = input.frameTiles ?? null;
  if (tiles) drawCombatChrome(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);
  if (input.moons) {
    input.moons.forEach((moon, i) => {
      if (!moon || i >= MOON_COLUMNS.length) return;
      const col = MOON_COLUMNS[i]!;
      fillRectIndexed(fb, col * 8, 0, 8, 8, C_BLACK);
      blitTile(fb, moon, col, 0);
    });
  }

  // 6. Right party panel + 7. menu / 8. message / prompt (need the font).
  const font = input.font ?? null;
  if (font) {
    if (input.summary) {
      drawCombatSummary(fb, font, input.summary);
    } else {
      drawText(fb, font, 'NAME', PANEL_COL * 8, PANEL_HDR_ROW * 8, C_WHITE);
      drawText(fb, font, 'AC HP', (PANEL_AC_COL - 1) * 8, PANEL_HDR_ROW * 8, C_WHITE);
      const party = (input.party ?? []).slice(0, PANEL_MAX_PLAYERS);
      party.forEach((p, i) => {
        const row = PANEL_FIRST_PLAYER_ROW + i;
        // M42.S1 / M69.S1 / M71.S1 — active > down > impaired > guarding > default green.
        const color = p.active ? C_WHITE : p.down ? C_GRAY : p.impaired ? C_YELLOW : p.guarding ? C_CYAN : C_GREEN;
        drawText(fb, font, panelName(p.name), PANEL_COL * 8, row * 8, color);
        drawText(fb, font, String(p.ac), PANEL_AC_COL * 8, row * 8, color);
        drawText(fb, font, String(p.hp), PANEL_HP_COL * 8, row * 8, color);
      });
    }

    if (input.message) {
      const lines = input.message.split('\n').slice(0, TEXT_MAX_ROWS);
      lines.forEach((line, i) => {
        drawText(fb, font, line.toUpperCase(), TEXT_COL0 * 8, (TEXT_ROW0 + i) * 8, C_WHITE);
      });
    }

    // 7. Command menu on the bottom bar: items spaced, selected highlighted. Falls back to the
    // prompt string when no menu is supplied.
    if (input.menu && input.menu.items.length > 0) {
      let x = TEXT_COL0 * 8;
      if (input.menu.prompt) {
        const prompt = input.menu.prompt.toUpperCase();
        drawText(fb, font, prompt, x, MENU_ROW * 8, C_GREEN);
        x += (prompt.length + 1) * 8;
      }
      input.menu.items.forEach((item, i) => {
        const label = item.toUpperCase();
        drawText(fb, font, label, x, MENU_ROW * 8, i === input.menu!.selected ? C_WHITE : C_GREEN);
        x += (label.length + 1) * 8; // one blank cell between items
      });
    } else if (input.prompt) {
      drawText(fb, font, input.prompt.toUpperCase(), TEXT_COL0 * 8, PROMPT_ROW * 8, C_GREEN);
    }
  }

  return fb;
}
