import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { IndexedImage } from '../src/model/index.js';
import { findBestIndexedOverlayPlacement } from '../src/render/overlayPlacement.js';
import { decodeDax } from '../src/loaders/dax.js';

function image(width: number, height: number, indices: number[], transparentIndex: number | null = null): IndexedImage {
  return {
    width,
    height,
    indices: Uint8Array.from(indices),
    xOffset: 0,
    yOffset: 0,
    transparentIndex,
    palette: null,
    encoding: 'test',
  };
}

describe('findBestIndexedOverlayPlacement', () => {
  it('finds a partial redraw despite pixels replaced by new lettering', () => {
    const base = image(6, 4, [
      1, 2, 3, 4, 5, 6,
      7, 8, 9, 10, 11, 12,
      13, 14, 15, 16, 17, 18,
      19, 20, 21, 22, 23, 24,
    ]);
    const overlay = image(3, 2, [9, 99, 11, 15, 16, 17]);

    expect(findBestIndexedOverlayPlacement(base, overlay)).toEqual({
      x: 2,
      y: 1,
      matches: 5,
      compared: 6,
    });
  });

  it('ignores transparent pixels and resolves ties topmost then leftmost', () => {
    const base = image(3, 2, [4, 4, 4, 4, 4, 4]);
    const overlay = image(2, 1, [255, 4], 255);
    expect(findBestIndexedOverlayPlacement(base, overlay)).toEqual({
      x: 0,
      y: 0,
      matches: 1,
      compared: 1,
    });
  });

  it('returns null when the overlay cannot be compared', () => {
    const base = image(1, 1, [0]);
    expect(findBestIndexedOverlayPlacement(base, image(2, 1, [0, 0]))).toBeNull();
    expect(findBestIndexedOverlayPlacement(base, image(1, 1, [255], 255))).toBeNull();
  });

  const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
  const realTitles = [
    {
      game: 'Champions of Krynn',
      path: resolve(repoRoot, 'Champions of Krynn', 'TITLE.DAX'),
      expected: [{ x: 40, y: 8, matches: 15_209 }, { x: 0, y: 8, matches: 20_003 }],
    },
    {
      game: 'Death Knights of Krynn',
      path: resolve(repoRoot, 'Death Knights of Krynn', 'TITLE.DAX'),
      expected: [{ x: 0, y: 88, matches: 16_284 }, { x: 0, y: 87, matches: 10_643 }],
    },
    {
      game: 'Curse of the Azure Bonds',
      path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/TITLE.DAX',
      expected: [{ x: 48, y: 88, matches: 15_492 }, { x: 0, y: 88, matches: 19_567 }],
    },
    {
      game: 'Secret of the Silver Blades',
      path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/TITLE.DAX',
      expected: [{ x: 16, y: 40, matches: 15_995 }, { x: 40, y: 40, matches: 14_882 }],
    },
  ];
  for (const title of realTitles) {
    it.skipIf(!existsSync(title.path))(`finds both real ${title.game} title bands`, () => {
      const images = decodeDax(new Uint8Array(readFileSync(title.path)), 'TITLE.DAX').blocks
        .filter((block) => block.image)
        .sort((a, b) => a.blockId - b.blockId)
        .map((block) => block.image!);
      expect(findBestIndexedOverlayPlacement(images[1], images[2])).toMatchObject(title.expected[0]);
      expect(findBestIndexedOverlayPlacement(images[1], images[3])).toMatchObject(title.expected[1]);
    });
  }
});
