/** Resolve one stored archive entry without falling through to another duplicate ID. */
function selectStoredEntry(entries, locator) {
  if (!Array.isArray(entries) || !Number.isSafeInteger(locator?.blockId)
      || locator.blockId < 0 || locator.blockId > 255) return null;
  const matchingIds = entries.filter((candidate) => candidate?.blockId === locator.blockId);
  if (locator.entryIndex == null) return matchingIds.length === 1 ? matchingIds[0] : null;
  if (!Number.isSafeInteger(locator.entryIndex) || locator.entryIndex < 0) return null;
  const matchingIndexes = entries.filter((candidate) => candidate?.index === locator.entryIndex);
  return matchingIndexes.length === 1 && matchingIndexes[0].blockId === locator.blockId
    ? matchingIndexes[0] : null;
}

/** Return the exact stored 8-byte DOS CoK glyph after resolving its pinned TOC entry. */
export function selectDaxGlyphBytes(archive, locator) {
  if (!archive || locator?.kind !== 'glyph' || locator.blockId !== 201 || locator.entryIndex !== 0
      || !Number.isSafeInteger(locator.glyphIndex) || locator.glyphIndex < 0 || locator.glyphIndex >= 177) return null;
  const block = selectStoredEntry(archive.blocks, locator);
  if (!block || block.index !== 0 || block.kind !== 'font' || !(block.raw instanceof Uint8Array) || block.raw.length !== 1416) return null;
  return block.raw.slice(locator.glyphIndex * 8, locator.glyphIndex * 8 + 8);
}

/** Select one decoded DAX locator without inferring identity from its pixels. */
export function selectDaxLocatorImage(archive, locator) {
  if (!archive || locator?.blockId == null) return null;
  const block = selectStoredEntry(archive.blocks, locator);
  if (!block) return null;
  if (locator.kind === 'whole-image') return block.image ?? null;
  if (locator.kind === 'glyph') {
    const stored = selectDaxGlyphBytes(archive, locator);
    const palette = block.frames?.[0]?.palette;
    if (!stored || !palette) return null;
    const indices = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) indices[y * 8 + x] = (stored[y] & (0x80 >> x)) !== 0 ? 15 : 0;
    }
    return { width: 8, height: 8, indices, xOffset: 0, yOffset: 0,
      transparentIndex: null, palette, encoding: 'gen1-font-glyph' };
  }
  if (locator.kind === 'block-frame') {
    if (!Number.isInteger(locator.frameIndex) || locator.frameIndex < 0) return null;
    return block.frames?.[locator.frameIndex] ?? (locator.frameIndex === 0 ? block.image ?? null : null);
  }
  if (locator.kind !== 'tile' || !Number.isInteger(locator.tileIndex) || locator.tileIndex < 0) return null;
  if (block.kind === 'tileset') return block.frames?.[locator.tileIndex] ?? null;
  if (block.kind !== 'tile-strip' || !block.image) return null;
  const image = block.image, x = (locator.tileIndex % 2) * 8, y = Math.floor(locator.tileIndex / 2) * 8;
  if (x + 8 > image.width || y + 8 > image.height || image.width > 32768) return null;
  const indices = new Uint8Array(64);
  for (let row = 0; row < 8; row++) {
    indices.set(image.indices.subarray((y + row) * image.width + x, (y + row) * image.width + x + 8), row * 8);
  }
  return { width: 8, height: 8, indices, xOffset: 0, yOffset: 0,
    transparentIndex: image.transparentIndex, palette: image.palette, encoding: image.encoding };
}

/** Select one decoded DAA 9-byte block or indexed subframe by its exact stored locator. */
export function selectDaaLocatorImage(archive, locator) {
  if (!archive || locator?.blockId == null) return null;
  if (archive.kind === 'index') {
    const subFrame = selectStoredEntry(archive.subFrames, locator);
    if (!subFrame) return null;
    if (locator.kind === 'whole-image') return subFrame.frames?.[0] ?? null;
    if (locator.kind === 'block-frame' && Number.isInteger(locator.frameIndex) && locator.frameIndex >= 0) {
      return subFrame.frames?.[locator.frameIndex] ?? null;
    }
    return null;
  }
  const block = selectStoredEntry(archive.blocks, locator);
  if (!block) return null;
  if (locator.kind === 'whole-image') return block.image ?? null;
  if (locator.kind === 'block-frame') {
    if (!Number.isInteger(locator.frameIndex) || locator.frameIndex < 0) return null;
    return block.frames?.[locator.frameIndex] ?? (locator.frameIndex === 0 ? block.image ?? null : null);
  }
  if (locator.kind === 'tile' && block.kind === 'tileset' && Number.isInteger(locator.tileIndex) && locator.tileIndex >= 0) {
    return block.frames?.[locator.tileIndex] ?? null;
  }
  return null;
}

/** Select an exact ILBM whole-image locator. Atlas-cell cropping is handled separately. */
export function selectIlbmLocatorImage(ilbm, locator) {
  if (!ilbm?.image || locator?.kind !== 'whole-image' || locator.blockId != null
      || locator.frameIndex != null || locator.tileIndex != null || locator.cellIndex != null) return null;
  return ilbm.image;
}

/**
 * Crop a source-verified CoK 5-plane player atlas cell. Plane 4 is the inverted
 * opaque mask; planes 0..3 select the CMAP color. Returns all intermediate bytes
 * so the caller can check the pinned crop, palette and rendered RGBA hashes.
 */
export function selectIlbmAtlasCell(ilbm, cellIndex) {
  const image = ilbm?.image;
  if (!image || ilbm.width !== 320 || ilbm.height !== 200 || ilbm.planes !== 5
      || image.width !== 320 || image.height !== 200 || image.indices?.length !== 320 * 200
      || !Number.isInteger(cellIndex) || cellIndex < 1 || cellIndex > 96
      || !ilbm.palette?.colors || ilbm.palette.colors.length < 16) return null;
  const x = ((cellIndex - 1) % 12) * 24;
  const y = Math.floor((cellIndex - 1) / 12) * 24;
  const rawIndices = new Uint8Array(24 * 24);
  const colorIndices = new Uint8Array(24 * 24);
  const opaqueMask = new Uint8Array(24 * 24);
  const paletteRgb = new Uint8Array(16 * 3);
  for (let color = 0; color < 16; color++) {
    const entry = ilbm.palette.colors[color];
    if (!entry || ![entry.r, entry.g, entry.b].every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return null;
    paletteRgb.set([entry.r, entry.g, entry.b], color * 3);
  }
  if (paletteRgb.every((channel) => channel % 16 === 0)) {
    for (let i = 0; i < paletteRgb.length; i++) paletteRgb[i] |= paletteRgb[i] >> 4;
  }
  const rgba = new Uint8ClampedArray(24 * 24 * 4);
  for (let row = 0; row < 24; row++) {
    for (let column = 0; column < 24; column++) {
      const target = row * 24 + column;
      const value = image.indices[(y + row) * 320 + x + column];
      if (value === undefined || value > 31) return null;
      const color = value & 15;
      const opaque = 1 - ((value >> 4) & 1);
      rawIndices[target] = value;
      colorIndices[target] = color;
      opaqueMask[target] = opaque;
      rgba[target * 4] = paletteRgb[color * 3];
      rgba[target * 4 + 1] = paletteRgb[color * 3 + 1];
      rgba[target * 4 + 2] = paletteRgb[color * 3 + 2];
      rgba[target * 4 + 3] = opaque * 255;
    }
  }
  return { width: 24, height: 24, rawIndices, colorIndices, opaqueMask, paletteRgb, rgba };
}
