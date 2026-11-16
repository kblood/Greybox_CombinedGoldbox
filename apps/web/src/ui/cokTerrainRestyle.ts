import { decodeAsset, type IndexedImage, type IndexedFramebuffer, type RgbaArt } from '@goldbox/engine';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import manifest from './cokTerrainRestyleManifest.json';
import type { CombatTerrainSource } from './cok-terrain-source-match.mjs';

export type CokTerrainIdentity = (typeof manifest.tiles)[number];

export function cokTerrainRestyleIdentity(source?: CombatTerrainSource): CokTerrainIdentity | null {
  if (!source || source.game !== manifest.game || source.system !== manifest.system
      || source.archive !== manifest.archive || source.archiveSha256 !== manifest.sourceArchiveSha256
      || source.blockId !== manifest.blockId || !Number.isInteger(source.tileIndex)) return null;
  return manifest.tiles.find((tile) => tile.tileIndex === source.tileIndex) ?? null;
}

export async function terrainSha256(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const input = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Preserve block and frame index before geometry filtering or bank concatenation. */
export function decodeCombatTerrain(bytes: Uint8Array, name: string): { image: IndexedImage; blockId: number; tileIndex: number }[] {
  const decoded = decodeAsset(bytes, name);
  if (decoded.format !== 'dax' && decoded.format !== 'daa') return [];
  return decoded.archive.blocks.filter((block) => block.kind === 'tileset' || block.kind === 'vga-chunky-items')
    .flatMap((block) => (block.frames ?? []).map((image, tileIndex) => ({ image, blockId: block.blockId, tileIndex })))
    .filter(({ image }) => image.width === 24 && image.height === 24);
}

export async function loadCokTerrainRestyle(identity: CokTerrainIdentity, source: IndexedImage): Promise<RgbaArt> {
  if (source.width !== identity.nativeWidth || source.height !== identity.nativeHeight
      || await terrainSha256(source.indices) !== identity.sourceIndicesSha256) {
    throw new Error('CoK terrain source pixels differ from the pinned tile');
  }
  const base = import.meta.env.DEV ? '/' : import.meta.env.BASE_URL;
  const url = `${base}restyle/cok/terrain/${identity.stem}.png`;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/terrain/${identity.stem}.png`, identity.sha256,
    url, 8 * 1024 * 1024, undefined, 'CoK terrain Restyle');
  if (bytes.byteLength < 33 || bytes.byteLength > 8 * 1024 * 1024
      || await terrainSha256(bytes) !== identity.sha256) throw new Error('CoK terrain PNG differs from pinned output');
  const owned = Uint8Array.from(bytes);
  const header = new DataView(owned.buffer);
  if (header.getUint8(24) !== 8 || header.getUint8(25) !== identity.colorType
      || header.getUint32(16) !== 96 || header.getUint32(20) !== 96) throw new Error('CoK terrain PNG geometry/type mismatch');
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== 96 || bitmap.height !== 96) throw new Error('CoK terrain bitmap geometry mismatch');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CoK terrain canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    // RGB black/gray are opaque. Only the engine foreground mask can remove terrain pixels.
    return { width: bitmap.width, height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally { bitmap.close(); }
}

/** Sentinel 255 is reserved here: admitted DOS EGA foreground uses only indices 0..15. */
export function cokTerrainLayers(tiles: readonly IndexedImage[], cellTiles: readonly number[] | null,
  artByGlobalIndex: ReadonlyMap<number, RgbaArt>, foreground: IndexedFramebuffer,
): { art: RgbaArt; x: number; y: number; pixelScale: number }[] {
  const layers: { art: RgbaArt; x: number; y: number; pixelScale: number }[] = [];
  for (let cell = 0; cell < 49; cell++) {
    const requested = cellTiles?.[cell] ?? 0;
    const index = tiles[requested] ? requested : 0;
    const art = artByGlobalIndex.get(index);
    if (!art) continue;
    const x = 8 + (cell % 7) * 24, y = 8 + Math.floor(cell / 7) * 24;
    const pixels = new Uint8ClampedArray(art.pixels);
    for (let ay = 0; ay < 96; ay++) for (let ax = 0; ax < 96; ax++) {
      const sx = x + Math.floor(ax / 4), sy = y + Math.floor(ay / 4);
      if (foreground.indices[sy * foreground.width + sx] !== 255) pixels[(ay * 96 + ax) * 4 + 3] = 0;
    }
    layers.push({ art: { ...art, pixels }, x, y, pixelScale: 4 });
  }
  return layers;
}
