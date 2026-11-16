import type { DaaArchive, DaxArchive, IlbmImage, IndexedImage } from '@goldbox/engine';
type Locator = { kind: string; blockId: number | null; entryIndex?: number | null; frameIndex: number | null; tileIndex: number | null; glyphIndex?: number | null };
export function selectDaxGlyphBytes(archive: DaxArchive | null, locator: Locator): Uint8Array | null;
export function selectDaxLocatorImage(archive: DaxArchive | null, locator: Locator): IndexedImage | null;
export function selectDaaLocatorImage(archive: DaaArchive | null, locator: Locator): IndexedImage | null;
export function selectIlbmLocatorImage(ilbm: IlbmImage | null, locator: Locator): IndexedImage | null;
export function selectIlbmAtlasCell(ilbm: IlbmImage | null, cellIndex: number): {
  width: 24; height: 24; rawIndices: Uint8Array; colorIndices: Uint8Array; opaqueMask: Uint8Array;
  paletteRgb: Uint8Array; rgba: Uint8ClampedArray;
} | null;
