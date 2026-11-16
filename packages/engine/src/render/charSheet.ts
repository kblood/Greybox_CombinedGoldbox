/**
 * Compose the Champions of Krynn character-sheet ("View") screen, pixel-for-pixel, into a single
 * indexed 320×200 framebuffer — the bordered full-screen page the original engine shows when you
 * View a party member: name + race + class/level at the top, the six ability scores down the left,
 * the derived combat line (AC / THAC0 / HP) on the right, the five saving throws, and the
 * deity/Knight-order footer, with a command bar on the bottom row. Pure / DOM-free, mirroring
 * {@link composeExploreScreen} — it reuses the same 8×8 frame tiles, font, and EGA colours.
 *
 * The data comes straight off the ruleset-derived `CharacterSheet` (THAC0, AC, saves, slots), so
 * the sheet shows exactly what the rules computed. The caller flattens a sheet into {@link CharSheetView}.
 */
import type { IndexedImage } from '../model/index.js';
import {
  createFramebuffer,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { drawHorizontalMenu } from './menuBar.js';
import { COK_FRAME_LAYOUT, drawOuterBorder, type ExploreFrameLayout } from './exploreScreen.js';

const C_BLACK = 0;
const C_GREEN = 10; // bright green — labels + values
const C_WHITE = 15; // headers / name

/** One ability row: the three-letter label and the displayed value (STR may carry a percentile). */
export interface CharSheetAbility {
  label: string;
  value: string;
}

/** The flattened character data the sheet renders. */
export interface CharSheetView {
  name: string;
  /** e.g. "HUMAN MALE". */
  raceLine: string;
  /** e.g. "FIGHTER 5" or "FTR/MU 5/5". */
  classLine: string;
  abilities: CharSheetAbility[];
  ac: number | string;
  thac0: number | string;
  hp: number | string;
  maxHp: number | string;
  /**
   * M63.S1 — the party member's current encumbrance-derived movement rate, in AD&D inches (12
   * unencumbered down to 0 overloaded, {@link Encumbrance.moveRate}) — the same real, already-live
   * fact `party.ts`'s `moveRateForMember()` feeds into actual tactical-combat movement every fight
   * (`combat.ts`'s CT.7k-1 `realMove`). Optional so callers that don't compute it (or a synthetic
   * test sheet) simply omit the row. Undefined ⇒ row is skipped, not shown as "MV 0".
   */
  move?: number | string;
  /**
   * M64.S1 — "3 attacks per 2 rounds" (AD&D-1e warrior multiple attacks: fighter/paladin level 7+,
   * ranger level 8+ — CoK's own manual: "Fighters and knights of 7th level or greater can attack
   * twice every other turn") — the same real fact `party.ts`'s `multiAttackHalfSteps()` feeds into
   * every real fighter/paladin/ranger/Knight's actual per-round attack count in tactical combat
   * (`tactical.ts`'s `attacksThisRound()`). A fixed "3/2" label (the only breakpoint modelled);
   * `undefined` when the character doesn't qualify, so the row is omitted, not shown as "ATK 1".
   */
  attacks?: string;
  /**
   * M67.S1 — a DoK save's real unarmoured/unarmed baseline damage dice
   * ({@link DokSavedCharacter.baseDamage}, decoded in the exact same call as `ac`'s DoK-mode
   * `baseArmorClass`), shown only by the `?chared=dok` read-only save viewer — real gameplay
   * `CharacterSheet`s have no "base damage" concept of their own (actual weapon damage always comes
   * from equipped gear). Optional so every other caller (the real character sheet, the CoK save
   * editor) simply omits the row, same as `move`/`attacks`.
   */
  dmg?: string;
  /** Five rows: { label, value } for the saving-throw categories. */
  saves: { label: string; value: number | string }[];
  /** Optional footer (deity, Knight order, …). */
  footer?: string;
  /** Optional position indicator, e.g. "1/4", shown top-right. */
  index?: string;
}

export interface CharSheetInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  sheet: CharSheetView;
  /** Bottom-row command bar (e.g. "Next Prev Exit"). */
  menu?: { items: readonly string[]; selected: number } | null;
}

/**
 * Build the character-sheet screen as a 320×200 indexed framebuffer. Resolve it to RGBA with the
 * EGA palette for display. Layout (8×8 cell grid):
 *   row 2  name (white)          · row 2 col 33 index "1/4"
 *   row 3  race line
 *   rows 5..10  STR/INT/WIS/DEX/CON/CHA (left) · AC / THAC0 / HP / MV / ATK / DMG (right, rows 5..10; MV/ATK/DMG optional)
 *   row 12 "SAVING THROWS" header
 *   rows 13..17 the five save categories + values
 *   row 20 footer (deity / order)
 *   row 24 command bar
 */
export function composeCharSheet(input: CharSheetInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;
  const s = input.sheet;
  const cell = (col: number) => col * 8;
  const row = (r: number) => r * 8;

  // Header.
  drawText(fb, font, s.name.toUpperCase(), cell(2), row(2), C_WHITE);
  if (s.index) drawText(fb, font, s.index, cell(34), row(2), C_GREEN);
  drawText(fb, font, s.raceLine.toUpperCase(), cell(2), row(3), C_GREEN);
  drawText(fb, font, s.classLine.toUpperCase(), cell(2), row(4), C_GREEN);

  // Ability scores down the left (label at col 2, value at col 8).
  s.abilities.slice(0, 6).forEach((a, i) => {
    const r = 6 + i;
    drawText(fb, font, a.label.toUpperCase(), cell(2), row(r), C_GREEN);
    drawText(fb, font, a.value.toUpperCase(), cell(8), row(r), C_WHITE);
  });

  // Derived combat line on the right (labels col 20, values col 30).
  const combat: [string, string][] = [
    ['AC', String(s.ac)],
    ['THAC0', String(s.thac0)],
    ['HP', `${s.hp}/${s.maxHp}`],
    ...(s.move !== undefined ? ([['MV', String(s.move)]] as [string, string][]) : []),
    ...(s.attacks !== undefined ? ([['ATK', s.attacks]] as [string, string][]) : []),
    ...(s.dmg !== undefined ? ([['DMG', s.dmg]] as [string, string][]) : []),
  ];
  combat.forEach(([label, value], i) => {
    const r = 6 + i;
    drawText(fb, font, label, cell(20), row(r), C_GREEN);
    drawText(fb, font, value, cell(30), row(r), C_WHITE);
  });

  // Saving throws.
  drawText(fb, font, 'SAVING THROWS', cell(2), row(13), C_WHITE);
  s.saves.slice(0, 5).forEach((sv, i) => {
    const r = 14 + i;
    drawText(fb, font, sv.label.toUpperCase(), cell(2), row(r), C_GREEN);
    drawText(fb, font, String(sv.value), cell(31), row(r), C_WHITE);
  });

  if (s.footer) drawText(fb, font, s.footer.toUpperCase(), cell(2), row(20), C_GREEN);

  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: row(24),
      selected: input.menu.selected,
      idleColor: C_GREEN,
      selColor: C_WHITE,
    });
  }

  return fb;
}
