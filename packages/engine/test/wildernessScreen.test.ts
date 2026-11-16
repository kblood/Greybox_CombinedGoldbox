/**
 * composeWildernessScreen — the overland travel screen compositor. Solid-font pixel asserts on the
 * region name, terrain tiles, the party marker, the info panel, and the command bar.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  composeWildernessScreen,
  TERRAIN_COLOR,
  type WildernessView,
  type WildTileView,
} from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

// 3×3 region: row 0 all plains except a town site at (2,0); party at (1,1) on forest; water at (0,2).
function view(overrides: Partial<WildernessView> = {}): WildernessView {
  const t = (terrain: WildTileView['terrain'], extra: Partial<WildTileView> = {}): WildTileView => ({ terrain, ...extra });
  const tiles: WildTileView[] = [
    t('plains'), t('plains'), t('town', { site: true }),
    t('plains'), t('forest', { party: true }), t('plains'),
    t('water'), t('plains'), t('plains'),
  ];
  return {
    areaName: 'Test Vale',
    width: 3,
    height: 3,
    tiles,
    party: { x: 1, y: 1 },
    locationLabel: 'Forest',
    time: 'Day 1  06:00',
    ...overrides,
  };
}

describe('composeWildernessScreen', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeWildernessScreen({ font: solidFont(), view: view() });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('paints terrain tiles with their EGA terrain colour', () => {
    const fb = composeWildernessScreen({ view: view() });
    // Map origin is tile col 2 row 3 → pixel (16,24). Tile (0,0) plains fills 8×8 there.
    expect(px(fb, 16 + 2, 24 + 2)).toBe(TERRAIN_COLOR.plains);
    // Tile (2,0) town site → 3rd column: pixel (16 + 16 + 1, 24 + 1).
    expect(px(fb, 16 + 16 + 1, 24 + 1)).toBe(TERRAIN_COLOR.town);
    // Tile (0,2) water → 3rd row: pixel (16 + 1, 24 + 16 + 1).
    expect(px(fb, 16 + 1, 24 + 16 + 1)).toBe(TERRAIN_COLOR.water);
  });

  it('marks the party tile with a white box over its terrain', () => {
    const fb = composeWildernessScreen({ view: view() });
    // Party at (1,1) → map col 2+1=3, row 3+1=4 → pixel origin (24,32). White border ring at +1.
    expect(px(fb, 24 + 1, 32 + 1)).toBe(15);
  });

  it('draws the region name (white) and the info panel labels', () => {
    const fb = composeWildernessScreen({ font: solidFont(), view: view() });
    expect(px(fb, 16, 8)).toBe(15); // area name at row 1 col 2
    expect(px(fb, 18 * 8, 3 * 8)).toBe(15); // "LOCATION" header at col 18 row 3
    expect(px(fb, 18 * 8, 4 * 8)).toBe(10); // location label (green) row 4
  });

  it('shows a yellow status line when present', () => {
    const fb = composeWildernessScreen({ font: solidFont(), view: view({ status: 'A monster attacks!' }) });
    expect(px(fb, 18 * 8, 9 * 8)).toBe(14);
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeWildernessScreen({
      font: solidFont(),
      view: view(),
      menu: { items: ['Move', 'Look', 'Camp', 'Map', 'Exit'], selected: 0 },
    });
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('skips text when no font is provided but still paints the map', () => {
    const fb = composeWildernessScreen({ view: view() });
    expect(px(fb, 16, 8)).toBe(0); // no area name text
    expect(px(fb, 16 + 2, 24 + 2)).toBe(TERRAIN_COLOR.plains); // map still drawn
  });
});
