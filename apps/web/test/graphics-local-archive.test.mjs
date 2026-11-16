import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDaaLocatorImage, selectDaxGlyphBytes, selectDaxLocatorImage, selectIlbmAtlasCell, selectIlbmLocatorImage } from '../src/ui/graphicsLocalArchive.mjs';

const image = (width, height, indices) => ({ width, height, indices: Uint8Array.from(indices), xOffset: 0, yOffset: 0, transparentIndex: null, palette: null });

test('selects whole blocks and the exact stored animation frame', () => {
  const first = image(1, 1, [4]), second = image(1, 1, [9]);
  const archive = { blocks: [{ blockId: 7, kind: 'animated', image: first, frames: [first, second] }] };
  assert.equal(selectDaxLocatorImage(archive, { kind: 'whole-image', blockId: 7 }), first);
  assert.equal(selectDaxLocatorImage(archive, { kind: 'block-frame', blockId: 7, frameIndex: 1 }), second);
  assert.equal(selectDaxLocatorImage(archive, { kind: 'block-frame', blockId: 7, frameIndex: 2 }), null);
});

test('duplicate DAX IDs require an exact TOC ordinal and remain stable if decode order changes', () => {
  const first = image(1, 1, [4]), second = image(1, 1, [9]);
  const block0 = { index: 0, blockId: 34, kind: 'frame', image: first };
  const block1 = { index: 1, blockId: 34, kind: 'frame', image: second };
  const locator = { kind: 'whole-image', blockId: 34, entryIndex: 1 };
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, locator), second);
  assert.equal(selectDaxLocatorImage({ blocks: [block1, block0] }, locator), second);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex: null }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex: 0 }), first);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex: 2 }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, blockId: 35 }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex: 0.5 }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex: -1 }), null);
  for (const entryIndex of [Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.equal(selectDaxLocatorImage({ blocks: [block0, block1] }, { ...locator, entryIndex }), null);
  }
  assert.equal(selectDaxLocatorImage({ blocks: [block0, { ...block1, index: 0 }] }, locator), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, { ...block1, index: 0 }] }, { ...locator, entryIndex: 0 }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, { ...block1, blockId: 35 }] }, locator), null);
  assert.equal(selectDaxLocatorImage({ blocks: [block0, { ...block1, image: null }] }, locator), null);
  const firstTwoFrames = { ...block0, frames: [first, second] };
  const secondOneFrame = { ...block1, frames: [second] };
  assert.equal(selectDaxLocatorImage({ blocks: [firstTwoFrames, secondOneFrame] },
    { kind: 'block-frame', blockId: 34, entryIndex: 1, frameIndex: 1 }), null);
  assert.equal(selectDaxLocatorImage({ blocks: [{ blockId: 34, kind: 'frame', image: first }] }, locator), null);
});

test('selects tile arrays and splits row-major 16-pixel strips into exact 8x8 tiles', () => {
  const tiles = [image(8, 8, new Array(64).fill(2)), image(8, 8, new Array(64).fill(3))];
  const stripPixels = [];
  for (let y = 0; y < 8; y++) stripPixels.push(...new Array(8).fill(5), ...new Array(8).fill(6));
  const archive = { blocks: [
    { blockId: 10, kind: 'tileset', image: tiles[0], frames: tiles },
    { blockId: 11, kind: 'tile-strip', image: image(16, 8, stripPixels) },
  ] };
  assert.equal(selectDaxLocatorImage(archive, { kind: 'tile', blockId: 10, tileIndex: 1 }), tiles[1]);
  assert.deepEqual([...selectDaxLocatorImage(archive, { kind: 'tile', blockId: 11, tileIndex: 1 }).indices], new Array(64).fill(6));
  assert.equal(selectDaxLocatorImage(archive, { kind: 'tile', blockId: 11, tileIndex: 2 }), null);
});

test('selects each stored DOS font glyph by exact archive entry and glyph index', () => {
  const raw = new Uint8Array(1416);
  raw[0] = 0b10000001;
  raw[8 * 176 + 7] = 0b01000010;
  const palette = { colors: Array.from({ length: 16 }, (_, index) => [index, index, index]) };
  const block = { index: 0, blockId: 201, kind: 'font', raw, frames: [image(8, 8, new Array(64).fill(0))] };
  block.frames[0].palette = palette;
  const archive = { blocks: [block] };
  const firstLocator = { kind: 'glyph', blockId: 201, entryIndex: 0, glyphIndex: 0 };
  const lastLocator = { ...firstLocator, glyphIndex: 176 };
  assert.deepEqual([...selectDaxGlyphBytes(archive, firstLocator)], [...raw.slice(0, 8)]);
  assert.deepEqual([...selectDaxGlyphBytes(archive, lastLocator)], [...raw.slice(176 * 8, 177 * 8)]);
  const first = selectDaxLocatorImage(archive, firstLocator);
  assert.equal(first.width, 8);
  assert.equal(first.height, 8);
  assert.equal(first.encoding, 'gen1-font-glyph');
  assert.deepEqual([...first.indices.slice(0, 8)], [15, 0, 0, 0, 0, 0, 0, 15]);
  assert.equal(first.palette, palette);
  for (const invalid of [
    { ...firstLocator, glyphIndex: -1 }, { ...firstLocator, glyphIndex: 177 },
    { ...firstLocator, entryIndex: null }, { ...firstLocator, entryIndex: 1 },
    { ...firstLocator, blockId: 202 },
  ]) {
    assert.equal(selectDaxGlyphBytes(archive, invalid), null);
    assert.equal(selectDaxLocatorImage(archive, invalid), null);
  }
  assert.equal(selectDaxGlyphBytes({ blocks: [{ ...block, kind: 'tileset' }] }, firstLocator), null);
  assert.equal(selectDaxGlyphBytes({ blocks: [{ ...block, raw: new Uint8Array(1408) }] }, firstLocator), null);
});

test('selects DAA indexed frames and tile-array entries by their recorded locators', () => {
  const first = image(1, 1, [7]), second = image(1, 1, [8]);
  const indexed = { kind: 'index', subFrames: [{ blockId: 52, frames: [first, second] }] };
  const blocks = { kind: 'blocks', blocks: [{ blockId: 11, kind: 'tileset', image: first, frames: [first, second] }] };
  assert.equal(selectDaaLocatorImage(indexed, { kind: 'block-frame', blockId: 52, frameIndex: 1 }), second);
  assert.equal(selectDaaLocatorImage(indexed, { kind: 'block-frame', blockId: 52, frameIndex: 2 }), null);
  assert.equal(selectDaaLocatorImage(blocks, { kind: 'tile', blockId: 11, tileIndex: 1 }), second);
});

test('DAA block and indexed entries use entryIndex and reject ambiguous same-ID fallbacks', () => {
  const first = image(1, 1, [7]), second = image(1, 1, [8]);
  const blocks = { kind: 'blocks', blocks: [
    { index: 0, blockId: 52, image: first }, { index: 1, blockId: 52, image: second },
  ] };
  const indexed = { kind: 'index', subFrames: [
    { index: 0, blockId: 52, frames: [first] }, { index: 1, blockId: 52, frames: [second] },
  ] };
  for (const archive of [blocks, indexed]) {
    const selected = selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: 1, frameIndex: 0 });
    assert.equal(selected, second);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: null, frameIndex: 0 }), null);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: 0.25, frameIndex: 0 }), null);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: Infinity, frameIndex: 0 }), null);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: 3, frameIndex: 0 }), null);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 53, entryIndex: 1, frameIndex: 0 }), null);
    assert.equal(selectDaaLocatorImage(archive, { kind: 'block-frame', blockId: 52, entryIndex: 1, frameIndex: 1 }), null);
    const reversed = archive === blocks
      ? { ...archive, blocks: [...archive.blocks].reverse() }
      : { ...archive, subFrames: [...archive.subFrames].reverse() };
    assert.equal(selectDaaLocatorImage(reversed, { kind: 'block-frame', blockId: 52, entryIndex: 1, frameIndex: 0 }), second);
  }
  assert.equal(selectDaaLocatorImage({ kind: 'index', subFrames: [{ blockId: 52, frames: [first] }] },
    { kind: 'block-frame', blockId: 52, frameIndex: 0 }), first);
  assert.equal(selectDaaLocatorImage({ kind: 'index', subFrames: [{ blockId: 52, frames: [first] }] },
    { kind: 'block-frame', blockId: 52, entryIndex: 0, frameIndex: 0 }), null);
  assert.equal(selectDaaLocatorImage({ kind: 'index', subFrames: [{ index: 0, blockId: 52, frames: [first] }] },
    { kind: 'block-frame', blockId: 52, entryIndex: 0, frameIndex: 0 }), first);
  assert.equal(selectDaaLocatorImage(blocks, { kind: 'block-frame', blockId: 256, entryIndex: 0, frameIndex: 0 }), null);
});

test('selects an exact ILBM whole-image locator but does not infer atlas-cell crops', () => {
  const image = { width: 320, height: 200, indices: new Uint8Array(320 * 200), palette: { colors: [] } };
  const ilbm = { width: 320, height: 200, image, palette: image.palette };
  assert.equal(selectIlbmLocatorImage(ilbm, { kind: 'whole-image', blockId: null, frameIndex: null, tileIndex: null, cellIndex: null }), image);
  assert.equal(selectIlbmLocatorImage(ilbm, { kind: 'atlas-cell', blockId: null, frameIndex: null, tileIndex: null, cellIndex: 32 }), null);
  assert.equal(selectIlbmLocatorImage(ilbm, { kind: 'whole-image', blockId: 1, frameIndex: null, tileIndex: null, cellIndex: null }), null);
});

test('crops the documented 24x24 atlas grid and applies its inverted fifth-plane mask', () => {
  const indices = new Uint8Array(320 * 200);
  const x = 11 * 24, y = 2 * 24;
  indices[y * 320 + x] = 3;
  indices[y * 320 + x + 1] = 16 | 5;
  const colors = Array.from({ length: 16 }, (_, index) => ({ r: index * 16, g: index * 16, b: index * 16 }));
  const ilbm = { width: 320, height: 200, planes: 5, image: { width: 320, height: 200, indices }, palette: { colors } };
  const cell = selectIlbmAtlasCell(ilbm, 36);
  assert.equal(cell.width, 24);
  assert.equal(cell.height, 24);
  assert.deepEqual([...cell.rawIndices.slice(0, 2)], [3, 21]);
  assert.deepEqual([...cell.colorIndices.slice(0, 2)], [3, 5]);
  assert.deepEqual([...cell.opaqueMask.slice(0, 2)], [1, 0]);
  assert.deepEqual([...cell.paletteRgb.slice(9, 18)], [51, 51, 51, 68, 68, 68, 85, 85, 85]);
  assert.deepEqual([...cell.rgba.slice(0, 8)], [51, 51, 51, 255, 85, 85, 85, 0]);
  assert.equal(selectIlbmAtlasCell(ilbm, 0), null);
  assert.equal(selectIlbmAtlasCell({ ...ilbm, planes: 4 }, 36), null);
});
