/** Real-byte golden for DoK's zero-based, shared 256-tile first-person wall bank. */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDaxDataBlocks, decodeGeoBlock, loadDungeonWalls, composeWallView } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..', '..', '..', 'Death Knights of Krynn');
async function dax(file: string) {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(root, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe('DoK native demo wall-bank routing', () => {
  it('uses zero-based global WALLDEF ids at retail pose 5,15 north', async () => {
    const [geo, wd, tl] = await Promise.all([dax('GEO1.DAX'), dax('WALLDEF4.DAX'), dax('8X8D4.DAX')]);
    const { map } = decodeGeoBlock(geo.get(32)!, 'DoK GEO1#32');
    const walls = loadDungeonWalls([2, 0x7f, 0x7f], {
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: (id) => tl.get(id) ?? null,
    });
    const blits = composeWallView(map, { px: 5, py: 15, facing: 0, eclBlockId: 2 }, walls.readId);
    const atTopLeft = blits.find((b) => b.px === 24 && b.py === 24);
    expect(atTopLeft?.tileId).toBe(55);
    expect(walls.lookupTile(atTopLeft!)).toBe(walls.singleBank!.tiles[55]);

    // The next two cells are native-framebuffer matches for bank tiles 49 and 52.
    const next = blits.find((b) => b.px === 24 && b.py === 32);
    const next2 = blits.find((b) => b.px === 24 && b.py === 40);
    expect([next?.tileId, next2?.tileId]).toEqual([49, 52]);
    expect(walls.lookupTile(next!)).toBe(walls.singleBank!.tiles[49]);
    expect(walls.lookupTile(next2!)).toBe(walls.singleBank!.tiles[52]);

    // DoK's global bank also owns low ids; they must not fall through to CoK's boot/UI set 0.
    const lowGlobalId = blits.find((b) => b.tileId === 1)!;
    expect(lowGlobalId.set).toBe(0); // generic CoK classifier, deliberately ignored by DoK lookup
    expect(walls.lookupTile(lowGlobalId)).toBe(walls.singleBank!.tiles[1]);
  });
});
