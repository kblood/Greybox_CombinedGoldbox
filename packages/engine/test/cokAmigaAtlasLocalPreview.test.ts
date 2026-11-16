import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeIlbm } from '../src/loaders/ilbm.js';
import pins from '../../../docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json';
import { selectIlbmAtlasCell } from '../../../apps/web/src/ui/graphicsLocalArchive.mjs';

const SOURCE_ROOT = 'C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn';
const rows = pins.assets;
const available = rows.every((row) => existsSync(resolve(SOURCE_ROOT, row.assetId.match(/disk[1-3]/)?.[0] ?? '', row.archivePath.split('/').at(-1)!)));

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('CoK Amiga atlas local preview', () => {
  if (!available) {
    it.skip('source LBM files are not installed at the pinned local path', () => {});
    return;
  }

  it('matches all 18 archive, selector, color, mask, palette and RGBA pins', () => {
    for (const row of rows) {
      const disk = row.assetId.match(/disk[1-3]/)?.[0];
      expect(disk, row.assetId).toBeTruthy();
      const file = resolve(SOURCE_ROOT, disk!, row.archivePath.split('/').at(-1)!);
      const bytes = new Uint8Array(readFileSync(file));
      expect(sha256(bytes), `${row.assetId} archive`).toBe(row.archiveSha256);
      const cell = selectIlbmAtlasCell(decodeIlbm(bytes, file), row.cellIndex);
      expect(cell, row.assetId).not.toBeNull();
      expect(sha256(cell!.rawIndices), `${row.assetId} raw index`).toBe(row.rawIndexSha256);
      expect(sha256(cell!.colorIndices), `${row.assetId} color index`).toBe(row.colorIndexSha256);
      expect(sha256(cell!.opaqueMask), `${row.assetId} opaque mask`).toBe(row.opaqueMaskSha256);
      expect(sha256(cell!.paletteRgb), `${row.assetId} palette`).toBe(row.paletteRgbSha256);
      expect(sha256(cell!.rgba), `${row.assetId} RGBA`).toBe(row.renderedRgbaSha256);
    }
  });
});
