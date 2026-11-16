/**
 * Gold Box horizontal command menu — the space-separated verb bar the original engine drew
 * via `displayInput` (e.g. "Area Cast View Encamp Search Look"). Each option's first letter
 * is its hotkey, shown in a highlight colour; the cursor-selected option is drawn fully
 * highlighted. This is the one menu idiom the whole series shares — dungeon command bar, the
 * Encamp sub-menu, the Magic sub-menu, Yes/No prompts — so it lives in one pure renderer that
 * the explore and combat compositors both call (no DOM/Node).
 *
 * Verb lists are transcribed from the Gold Box engine's own menu strings (studied from the
 * COAB decompile for fidelity, re-implemented here). Krynn-Gen1 (CoK/DoK) reuses this exact
 * menu engine, so the same verbs apply.
 */
import { drawText, type BitmapFont } from './textmode.js';
import type { IndexedFramebuffer } from './screen.js';

/** The dungeon/adventure command bar shown while exploring. */
export const GB_MENU_DUNGEON = ['Area', 'Cast', 'View', 'Encamp', 'Search', 'Look'] as const;
/** The Encamp sub-menu (after choosing Encamp). */
export const GB_MENU_ENCAMP = ['Save', 'View', 'Magic', 'Rest', 'Alter', 'Fix', 'Exit'] as const;
/** The Magic sub-menu (after Encamp → Magic). */
export const GB_MENU_MAGIC = ['Cast', 'Memorize', 'Scribe', 'Display', 'Rest', 'Exit'] as const;
/** A plain confirmation menu. */
export const GB_MENU_YESNO = ['Yes', 'No'] as const;

/** The hotkey character for a menu item (its upper-cased first letter). */
export function menuHotkey(item: string): string {
  return (item[0] ?? '').toUpperCase();
}

/** Where a drawn menu item sits horizontally, for click/touch hit-testing. */
export interface MenuItemHit {
  index: number;
  /** Left pixel (inclusive). */
  x0: number;
  /** Right pixel (exclusive). */
  x1: number;
}

export interface MenuBarOptions {
  /** Left pixel of the first item. */
  x: number;
  /** Top pixel (row * 8). */
  y: number;
  /** Index of the cursor-selected item, or -1 for none. */
  selected?: number;
  /** Colour of unselected body text. */
  idleColor: number;
  /** Colour of the selected item (whole word) and, by default, of each hotkey letter. */
  selColor: number;
  /** Colour of the hotkey first-letter on unselected items (defaults to `selColor`). */
  hotkeyColor?: number;
  /** Blank cells between items (default 1). */
  gap?: number;
}

/**
 * Draw a horizontal hotkey menu and return each item's pixel span. Items are upper-cased to
 * match the engine font. The selected item is drawn fully in `selColor`; unselected items get
 * their hotkey letter in `hotkeyColor` and the remainder in `idleColor`.
 */
export function drawHorizontalMenu(
  fb: IndexedFramebuffer,
  font: BitmapFont,
  items: readonly string[],
  opts: MenuBarOptions,
): MenuItemHit[] {
  const gap = opts.gap ?? 1;
  const hotkeyColor = opts.hotkeyColor ?? opts.selColor;
  const hits: MenuItemHit[] = [];
  let x = opts.x;
  items.forEach((item, i) => {
    const label = item.toUpperCase();
    const x0 = x;
    if (i === opts.selected) {
      drawText(fb, font, label, x, opts.y, opts.selColor);
    } else if (label.length > 0) {
      // Hotkey letter highlighted, body in the idle colour.
      drawText(fb, font, label[0]!, x, opts.y, hotkeyColor);
      if (label.length > 1) drawText(fb, font, label.slice(1), x + 8, opts.y, opts.idleColor);
    }
    const w = label.length * 8;
    hits.push({ index: i, x0, x1: x0 + w });
    x = x0 + w + gap * 8;
  });
  return hits;
}
