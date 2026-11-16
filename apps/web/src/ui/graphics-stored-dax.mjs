const complex = { profile: 'dos-complex-stored-frames', kind: 'block-frame', field: 'frameIndex', suffix: 'frame', limit: 32 };
const standard = { profile: 'dos-standard-stored-frame', kind: 'block-frame', field: 'frameIndex', suffix: 'frame', limit: 1, count: 1 };
const glyph = { profile: 'dos-raw-font-201', kind: 'glyph', field: 'glyphIndex', suffix: 'glyph', limit: 177, count: 177, dim: 8 };
const tileLayout = (dim, count) => ({
  profile: 'dos-stored-ega-tile-array', kind: 'tile', field: 'tileIndex', suffix: 'tile', limit: count, count, dim,
});
const tiles256 = tileLayout(8, 256), tiles45 = tileLayout(8, 45), tiles1 = tileLayout(8, 1);
const dungTiles = tileLayout(24, 25), wildTiles = tileLayout(24, 38);

/** The exact source layouts admitted by the frozen DoK DOS roster. */
export function dokStoredDaxLayout(name, entryIndex, blockId) {
  if (/^(?:PIC[1-7]|SPRIT[1-4])\.DAX$/.test(name)) return complex;
  if (/^(?:BACK[1-5]|BIGPIC[1-3]|CBODY|CHEAD|COMSPR|CPIC1|SKYGRND|TITLE)\.DAX$/.test(name)) return standard;
  if (name === '8X8D1.DAX') {
    if (entryIndex === 0 && blockId === 201) return glyph;
    if ((entryIndex === 1 && blockId === 202) || (entryIndex === 2 && blockId === 203)) return tiles45;
    if (entryIndex === 3 && blockId === 204) return tiles1;
    return entryIndex === 4 && blockId === 1 ? tiles256 : null;
  }
  if (/^8X8D[2-5]\.DAX$/.test(name)) return tiles256;
  if (name === 'DUNGCOM.DAX') return dungTiles;
  if (name === 'WILDCOM.DAX') return wildTiles;
  return null;
}

/** Select a stored PIC/SPRIT frame without gameplay XOR. */
function selectComplexFrame(raw, frameIndex) {
  const count = raw[0];
  if (!count || count > 32 || frameIndex >= count) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 1, frame = null;
  for (let i = 0; i < count; i++) {
    if (offset + 21 > raw.length) return null;
    const height = view.getUint16(offset + 4, true), width = 8 * view.getUint16(offset + 6, true);
    const end = offset + 21 + width * height / 2;
    if (!width || width > 640 || !height || height > 256 || end > raw.length) return null;
    if (i === frameIndex) {
      frame = { width, height, packed: raw.subarray(offset + 21, end),
        xOffset: view.getUint16(offset + 8, true), yOffset: view.getUint16(offset + 10, true) };
    }
    offset = end;
  }
  return offset === raw.length ? frame : null;
}

/** Read exact stored child bytes by profile; never fall back to a gameplay decoder. */
export function selectStoredDaxChild(name, blocks, locator) {
  if (!Number.isSafeInteger(locator?.entryIndex) || locator.entryIndex < 0) return null;
  const block = blocks[locator.entryIndex];
  if (!block || block.index !== locator.entryIndex || block.blockId !== locator.blockId) return null;
  const layout = dokStoredDaxLayout(name, locator.entryIndex, locator.blockId);
  if (!layout || layout.kind !== locator.kind
      || ['frameIndex', 'tileIndex', 'cellIndex', 'glyphIndex'].some((field) => field !== layout.field && locator[field] != null)) return null;
  const index = locator[layout.field], { raw } = block;
  if (!Number.isSafeInteger(index) || index < 0 || index >= layout.limit || !(raw instanceof Uint8Array)) return null;
  if (layout === complex) return selectComplexFrame(raw, index);
  if (layout === glyph) {
    if (raw.length !== glyph.count * 8) return null;
    return { width: 8, height: 8, xOffset: 0, yOffset: 0, packed: raw.subarray(index * 8, index * 8 + 8) };
  }
  if (raw.length < 17) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const width = 8 * view.getUint16(2, true), height = view.getUint16(0, true), size = width * height / 2;
  const count = raw[8] === 0xff ? 256 : raw[8];
  if (count !== layout.count || raw.length !== 17 + count * size) return null;
  if (layout === standard) {
    if (!width || width > 4096 || !height || height > 2048) return null;
    return { width, height, xOffset: view.getUint16(6, true), yOffset: view.getUint16(4, true), packed: raw.subarray(17) };
  }
  if (width !== layout.dim || height !== layout.dim) return null;
  const start = 17 + index * size;
  return { width, height, xOffset: 0, yOffset: 0, packed: raw.subarray(start, start + size) };
}

const sha = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Requires both the exact packed bytes and their fixed-palette row-major RGB pin. */
export async function verifyStoredDaxChild(name, blocks, locator, contentSha256, pixelSha256, palette) {
  const source = selectStoredDaxChild(name, blocks, locator);
  if (!source || await sha(source.packed) !== contentSha256) return null;
  const { packed, ...geometry } = source;
  const indices = new Uint8Array(source.width * source.height), rgb = new Uint8Array(indices.length * 3);
  if (locator.kind === 'glyph') {
    for (let i = 0; i < indices.length; i++) indices[i] = packed[i >> 3] & (0x80 >> (i & 7)) ? 15 : 0;
  } else {
    for (let i = 0; i < packed.length; i++) {
      indices[2 * i] = packed[i] >> 4;
      indices[2 * i + 1] = packed[i] & 15;
    }
  }
  for (let i = 0; i < indices.length; i++) {
    const { r, g, b } = palette.colors[indices[i]];
    rgb.set([r, g, b], 3 * i);
  }
  if (await sha(rgb) !== pixelSha256) return null;
  const encoding = locator.kind === 'block-frame' ? 'dax-stored-frame' : `dax-stored-${locator.kind}`;
  return { ...geometry, indices, palette, transparentIndex: null, encoding };
}
