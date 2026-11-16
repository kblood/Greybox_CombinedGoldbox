/**
 * buildGraphicSet tests (M1.S2 build path) — maps a LoadedGame's category-grouped
 * frames into a GraphicSet addressable by (AssetKind, index), and proves the result
 * resolves through a GraphicSetManager. Pure, synthetic data.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGraphicSet,
  createGraphicSetManager,
  CATEGORY_TO_KIND,
  type LoadedGame,
  type IndexedImage,
  type GameFrame,
  type GameCategoryGroup,
  type GameFileResult,
} from '../src/index.js';

function img(tag: number): IndexedImage {
  return {
    width: 1, height: 1, indices: new Uint8Array([tag]),
    xOffset: 0, yOffset: 0, transparentIndex: null, palette: null,
  };
}
const frame = (tag: number): GameFrame => ({ label: `f${tag}`, image: img(tag) });

function file(path: string, frames: GameFrame[]): GameFileResult {
  return { path, name: path, category: 'scenes', format: 'dax', frames };
}

function game(): LoadedGame {
  const scenes: GameCategoryGroup = {
    category: 'scenes',
    files: [file('A', [frame(10), frame(11)]), file('B', [frame(12)])],
    frameCount: 3,
  };
  const tiles: GameCategoryGroup = {
    category: 'tiles',
    files: [file('T', [frame(20)])],
    frameCount: 1,
  };
  return {
    id: 'cok-dos', title: 'CoK', platform: 'DOS',
    display: { width: 320, height: 200 },
    categories: [scenes, tiles],
    totalFrames: 4, errors: [], skipped: [],
  };
}

describe('buildGraphicSet', () => {
  it('maps categories to AssetKinds and indexes frames sequentially', () => {
    const set = buildGraphicSet(game(), 'DOS-EGA', 'DOS EGA');
    expect(set.id).toBe('DOS-EGA');
    expect(set.complete).toBe(true);

    // scenes -> 'bigpic', sequential across files A(10,11) then B(12).
    const bigpic = set.frames.get(CATEGORY_TO_KIND.scenes)!;
    expect(bigpic.get(0)?.indices[0]).toBe(10);
    expect(bigpic.get(1)?.indices[0]).toBe(11);
    expect(bigpic.get(2)?.indices[0]).toBe(12);

    // tiles -> 'tile8x8'.
    const tiles = set.frames.get(CATEGORY_TO_KIND.tiles)!;
    expect(tiles.get(0)?.indices[0]).toBe(20);
  });

  it('marks complete=false when the game had load errors', () => {
    const g = game();
    g.errors = [file('bad', [])];
    expect(buildGraphicSet(g, 'DOS-EGA', 'x').complete).toBe(false);
  });

  it('feeds a GraphicSetManager that resolves the built frames', () => {
    const set = buildGraphicSet(game(), 'DOS-EGA', 'DOS EGA');
    const m = createGraphicSetManager([set]);
    expect(m.resolve({ category: 'bigpic', index: 1 })?.indices[0]).toBe(11);
    expect(m.resolve({ category: 'tile8x8', index: 0 })?.indices[0]).toBe(20);
    expect(m.resolve({ category: 'bigpic', index: 99 })).toBeNull();
  });
});
