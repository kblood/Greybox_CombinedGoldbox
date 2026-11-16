/**
 * composeExploreScreen tests. Synthetic set-4 tiles (each filled with its own index so a tile
 * is identifiable wherever it lands) drive frame placement, the out-of-range fallback, the
 * clipped viewport, and font text — no game assets needed. A separate manual render
 * (renderExplore.manual.test.ts) validates against the REAL CoK tiles visually.
 */
import { describe, it, expect } from 'vitest';
import {
  composeExploreScreen,
  createFramebuffer,
  makeBitmapFont,
  COAB_FRAME_LAYOUT,
  DOK_FRAME_LAYOUT,
  SECRET_FRAME_LAYOUT,
  NWN_FRAME_LAYOUT,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedImage,
} from '../src/index.js';

/** A set of `n` 8×8 tiles where tile i is filled with palette index i (0..n-1). */
function syntheticSet4(n: number): IndexedImage[] {
  return Array.from({ length: n }, (_, i) => ({
    width: 8,
    height: 8,
    indices: new Uint8Array(64).fill(i),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  }));
}

/** Read the framebuffer index at a pixel. */
function at(fb: { width: number; indices: Uint8Array }, x: number, y: number): number {
  return fb.indices[y * fb.width + x];
}

describe('composeExploreScreen', () => {
  it('produces a full 320×200 indexed framebuffer', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40) });
    expect(fb.width).toBe(SCREEN_WIDTH);
    expect(fb.height).toBe(SCREEN_HEIGHT);
    expect(fb.indices.length).toBe(320 * 200);
  });

  it('places outer-border symbols per the COAB arrays (value + 0x1E)', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40), frameLayout: COAB_FRAME_LAYOUT });
    // OUTER_TOP[0] = 0 → tile 30, at (row 0, col 0) → px (0,0).
    expect(at(fb, 0, 0)).toBe(30);
    // OUTER_TOP[1] = 6 → tile 36, at col 1 → px (8,0).
    expect(at(fb, 8, 0)).toBe(36);
    // OUTER_TOP[39] = 2 → tile 32, at col 39 → px (312,0).
    expect(at(fb, 312, 0)).toBe(32);
  });

  it('places the inner viewport frame (value + 0x14) on the grid', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40), frameLayout: COAB_FRAME_LAYOUT });
    // INNER_TOP[2] = 0 → tile 20, at (row 2, col 2) → px (16,16). inner-left writes last,
    // INNER_LEFT[2]=0→20 too, so the corner cell is tile 20.
    expect(at(fb, 16, 16)).toBe(20);
  });

  it('falls back to the straight tile when a value addresses a missing tile (38-tile block)', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(38), frameLayout: COAB_FRAME_LAYOUT });
    // OUTER_TOP[25] = 8 → tile 38 (absent in a 38-tile set) → straight horizontal value 1 → tile 31.
    expect(at(fb, 25 * 8, 0)).toBe(31);
    // OUTER_LEFT[2] = 9 → tile 39 (absent) → straight vertical value 2 → tile 32, at (row 2,col 0).
    expect(at(fb, 0, 16)).toBe(32);
  });

  it('defaults to the CoK layout: outer border is tile 20, columns are tile 24', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40) }); // no frameLayout → CoK
    expect(at(fb, 0, 0)).toBe(20); // outer top-left = horizontal bar tile 20
    expect(at(fb, 8 * 5, 23 * 8)).toBe(20); // bottom row all tile 20
    expect(at(fb, 0, 8 * 5)).toBe(24); // left column mid = vertical column tile 24
  });

  it('DOK_FRAME_LAYOUT uses its native corner, separator, and inner-box tile roles', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(45), frameLayout: DOK_FRAME_LAYOUT });
    expect(at(fb, 0, 0)).toBe(0); // upper-left corner
    expect(at(fb, 39 * 8, 0)).toBe(1); // upper-right corner
    expect(at(fb, 0, 23 * 8)).toBe(2); // lower-left corner
    expect(at(fb, 39 * 8, 23 * 8)).toBe(3); // lower-right corner
    expect(at(fb, 5 * 8, 0)).toBe(4); // horizontal run
    expect(at(fb, 0, 5 * 8)).toBe(7); // vertical run
    expect(at(fb, 16 * 8, 0)).toBe(8); // vertical separator top junction
    expect(at(fb, 16 * 8, 16 * 8)).toBe(9); // separator crossing
    expect(at(fb, 0, 16 * 8)).toBe(10); // horizontal separator left junction
    expect(at(fb, 39 * 8, 16 * 8)).toBe(11); // horizontal separator right junction
  });

  it('SECRET_FRAME_LAYOUT keeps the moonless outer and inset frame banks separate', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(101), frameLayout: SECRET_FRAME_LAYOUT });
    expect(fb.indices[0]).toBe(49);
    expect(fb.indices[3 * 8 * fb.width]).toBe(53);
    expect(fb.indices[2 * 8 * fb.width + 2 * 8]).toBe(59);
    expect(fb.indices[3 * 8 * fb.width + 2 * 8]).toBe(56);
  });

  it('NWN_FRAME_LAYOUT: renders a coherent border from its own straight/junction tiles (40-tile block 202)', () => {
    // Neverwinter Nights (DOS/AOL) calibration — see that constant's own doc comment in
    // exploreScreen.ts and docs/engine/research/neverwinter-nights-dos-format-coverage.md's
    // follow-up item 2. Every index this layout references must be < 40 (NWN's real block-202
    // tile count), unlike COK_FRAME_LAYOUT's indices which top out at 37 for a 38-tile block.
    const allIndices = [
      ...NWN_FRAME_LAYOUT.outerTop, ...NWN_FRAME_LAYOUT.outerBottom,
      ...NWN_FRAME_LAYOUT.outerLeft, ...NWN_FRAME_LAYOUT.outerRight,
      ...NWN_FRAME_LAYOUT.hsep, ...NWN_FRAME_LAYOUT.vsep,
      ...NWN_FRAME_LAYOUT.innerTop, ...NWN_FRAME_LAYOUT.innerBottom,
      ...NWN_FRAME_LAYOUT.innerLeft, ...NWN_FRAME_LAYOUT.innerRight,
    ];
    for (const v of allIndices) expect(v).toBeLessThan(40);
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40), frameLayout: NWN_FRAME_LAYOUT });
    expect(at(fb, 0, 0)).toBe(28); // outer top-left = NWN's horizontal wood-grain bar tile 28
    expect(at(fb, 8 * 5, 23 * 8)).toBe(28); // bottom row all tile 28
    expect(at(fb, 0, 8 * 5)).toBe(22); // left column mid = NWN's vertical wood-grain bar tile 22
    expect(at(fb, 0, 8)).toBe(27); // outer left row 1 = the cross-junction tile, just like CoK's 23 role
  });

  it('overlays moons on the top row at columns 8/19/30', () => {
    const moon = { ...syntheticSet4(1)[0]!, indices: new Uint8Array(64).fill(7) }; // tile of index 7
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40), moons: [moon, moon, moon] });
    expect(at(fb, 8 * 8, 0)).toBe(7); // col 8
    expect(at(fb, 19 * 8, 0)).toBe(7); // col 19
    expect(at(fb, 30 * 8, 0)).toBe(7); // col 30
  });

  it('blits the viewport at (8,8), clipped before the separators (no spill past x128/y128)', () => {
    const viewport = createFramebuffer(168, 168, 99); // distinctive fill
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40), viewport });
    expect(at(fb, 8, 8)).toBe(99); // top-left of the window
    expect(at(fb, 127, 127)).toBe(99); // just inside the clip
    // Past the clip (x≥128, y≥128) the viewport must NOT appear — that region is the
    // separator / panel / text, painted by the frame (not index 99).
    expect(at(fb, 130, 60)).not.toBe(99);
    expect(at(fb, 60, 130)).not.toBe(99);
  });

  it('draws panel + position + prompt text when a font is supplied', () => {
    // 1-glyph font: ASCII 'X' (0x58) → a fully-lit 8×8 block, mapped by code-first.
    const bits = new Uint8Array(8).fill(0xff);
    const font = makeBitmapFont(bits, 8, 8, 0x58, 1); // only 'X'
    const fb = composeExploreScreen({
      frameTiles: syntheticSet4(40),
      font,
      party: [{ name: 'XXX', ac: 'X', hp: 'X', active: true }],
      position: 'XX',
      prompt: 'X',
    });
    // Active party name at (row 4, col 17) → px (136,32), white (15), 'X' is fully lit.
    expect(at(fb, 136, 32)).toBe(15);
    // Prompt at row 24, col 1 → px (8,192), green (10).
    expect(at(fb, 8, 192)).toBe(10);
  });

  it('renders the frame even with no font (text simply omitted)', () => {
    const fb = composeExploreScreen({ frameTiles: syntheticSet4(40) });
    expect(at(fb, 0, 0)).toBe(20); // CoK border still present (tile 20)
  });
});
