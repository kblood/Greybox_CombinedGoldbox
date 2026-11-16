/**
 * composeAutomapPanel (D1). Pixel asserts on a small map: visited cells paint a floor block,
 * discovered walls a cyan edge, the party a white marker + red facing pip, and a noted cell a
 * magenta dot — while unvisited cells stay black (fog of war). Cell geometry comes from the same
 * `automapGridLayout` the compositor uses.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { Automap, composeAutomapPanel, automapGridLayout } from '../src/index.js';
import type { MapCell, Direction } from '../src/model/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const NO_WALLS = (): MapCell => ({ walls: { north: 0, east: 0, south: 0, west: 0 } });

function gridMap(width: number, height: number): { width: number; height: number; cells: MapCell[] } {
  const cells: MapCell[] = [];
  for (let i = 0; i < width * height; i++) cells.push(NO_WALLS());
  return { width, height, cells };
}

// EGA indices the compositor uses (kept in sync with automapPanel.ts).
const C_BLACK = 0;
const C_FLOOR = 8;
const C_WALL = 11;
const C_PARTY = 15;
const C_FACE = 12;
const C_NOTE = 13;

describe('composeAutomapPanel', () => {
  const W = 5;
  const H = 4;
  const { cellPx, originX, originY } = automapGridLayout(W, H);
  const cx = (x: number) => originX + x * cellPx + Math.floor(cellPx / 2);
  const cy = (y: number) => originY + y * cellPx + Math.floor(cellPx / 2);

  function panel() {
    const map = gridMap(W, H);
    map.cells[1 * W + 1].walls.north = 1; // a wall on the north edge of cell (1,1)
    const automap = new Automap(W, H);
    automap.visit(1, 1);
    automap.visit(2, 1);
    automap.setNote(2, 1, 'altar');
    return composeAutomapPanel({
      font: solidFont(),
      title: 'Automap',
      map,
      automap,
      pose: { x: 1, y: 1, facing: 'north' as Direction },
      status: 'explored 2 cells',
      menu: { items: ['Note', 'Close'], selected: 0 },
    });
  }

  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = panel();
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('paints discovered floor on visited cells, black on unvisited (fog of war)', () => {
    const fb = panel();
    // (2,1) is visited, not the party cell, note marker is in the corner — its centre is floor.
    expect(px(fb, cx(2), cy(1))).toBe(C_FLOOR);
    // (0,0) was never visited — stays black.
    expect(px(fb, cx(0), cy(0))).toBe(C_BLACK);
    expect(px(fb, cx(4), cy(3))).toBe(C_BLACK);
  });

  it('draws the party marker (white) with a red facing pip at the party cell', () => {
    const fb = panel();
    expect(px(fb, cx(1), cy(1))).toBe(C_PARTY); // white block over the party cell
    // facing north → a red pip on the top edge of the cell, away from the wall-line centre.
    expect(px(fb, cx(1), originY + 1 * cellPx + 1)).toBe(C_FACE);
  });

  it('draws a cyan wall edge on a discovered wall', () => {
    const fb = panel();
    // north edge of (1,1): sample near the left of the edge, clear of the centred facing pip.
    const ox = originX + 1 * cellPx;
    const oy = originY + 1 * cellPx;
    expect(px(fb, ox + 1, oy)).toBe(C_WALL);
  });

  it('marks a noted cell with a magenta dot', () => {
    const fb = panel();
    const s = Math.max(2, Math.floor(cellPx / 3));
    const ox = originX + 2 * cellPx;
    const oy = originY + 1 * cellPx;
    expect(px(fb, ox + cellPx - s, oy + 2)).toBe(C_NOTE);
  });

  it('renders nothing in the grid for an empty automap (no crash)', () => {
    const map = gridMap(W, H);
    const fb = composeAutomapPanel({ font: solidFont(), map, automap: new Automap(W, H) });
    expect(px(fb, cx(2), cy(1))).toBe(C_BLACK); // nothing visited → all black grid
  });
});
