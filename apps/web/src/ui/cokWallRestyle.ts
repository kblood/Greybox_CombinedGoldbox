import { composeWallView, indexedToRGBA, makeEgaPalette, type DungeonWalls, type GameMap,
  type IndexedFramebuffer, type IndexedImage, type WallPose, type RgbaArt } from '@goldbox/engine';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import { terrainSha256 } from './cokTerrainRestyle.js';
import manifest from './cokWallRestyleManifest.json';

export type CokWallRestyleIdentity = (typeof manifest.banks)[number]['tiles'][number] & {
  archive: string; sourceArchiveSha256: string; blockId: number;
};
export type CokWallRestyleRef = Pick<CokWallRestyleIdentity, 'archive' | 'sourceArchiveSha256' | 'blockId' | 'tileIndex'>;
interface WallArchiveIdentity { game: string; system: string; archive: string; archiveSha256: string }
const archiveByRawBlock = new WeakMap<Uint8Array, WallArchiveIdentity & { blockId: number }>();

export function cokWallRestyleRef(identity: CokWallRestyleIdentity): CokWallRestyleRef {
  return { archive: identity.archive, sourceArchiveSha256: identity.sourceArchiveSha256,
    blockId: identity.blockId, tileIndex: identity.tileIndex };
}
export function cokWallRestyleKey(identity: CokWallRestyleRef): string {
  return `${identity.archive}@${identity.sourceArchiveSha256}#${identity.blockId}:${identity.tileIndex}`;
}

/** Associate metadata with the exact raw objects consumed by loadDungeonWalls. */
export async function registerCokWallArchive(bytes: Uint8Array, blocks: ReadonlyMap<number, Uint8Array>, path: string): Promise<boolean> {
  if (path.replaceAll('\\', '/').split('/').pop() !== manifest.archive || !globalThis.crypto?.subtle) return false;
  const archiveSha256 = await terrainSha256(bytes);
  if (archiveSha256 !== manifest.sourceArchiveSha256) return false;
  let registered = 0;
  for (const bank of manifest.banks) {
    const raw = blocks.get(bank.blockId);
    if (!raw) continue;
    if (await terrainSha256(raw) !== bank.sourceBlockSha256) { archiveByRawBlock.delete(raw); continue; }
    archiveByRawBlock.set(raw, { game: 'cok', system: 'DOS-EGA', archive: manifest.archive,
      archiveSha256, blockId: bank.blockId });
    registered++;
  }
  return registered === manifest.banks.length;
}

export function cokWallRestyleIdentity(source: WallArchiveIdentity & { blockId: number; tileIndex: number }): CokWallRestyleIdentity | null {
  if (source.game !== manifest.game || source.system !== manifest.system || source.archive !== manifest.archive
      || source.archiveSha256 !== manifest.sourceArchiveSha256) return null;
  const bank = manifest.banks.find((bank) => bank.blockId === source.blockId);
  const tile = bank?.tiles.find((tile) => tile.tileIndex === source.tileIndex);
  return bank && tile ? { ...tile, archive: manifest.archive,
    sourceArchiveSha256: manifest.sourceArchiveSha256, blockId: bank.blockId } : null;
}

export function wallIdentityForImage(walls: DungeonWalls, image: IndexedImage): CokWallRestyleIdentity | null {
  const origin = walls.tileOrigin?.(image);
  const archive = origin ? archiveByRawBlock.get(origin.raw) : null;
  return origin && archive && archive.blockId === origin.blockId
    ? cokWallRestyleIdentity({ ...archive, tileIndex: origin.tileIndex }) : null;
}

/** Output is opaque RGB texture. Only original DOS source index13 defines transparency. */
export async function loadCokWallRestyle(identity: CokWallRestyleIdentity, source: IndexedImage): Promise<RgbaArt> {
  if (source.width !== 8 || source.height !== 8 || source.transparentIndex !== 13
      || await terrainSha256(source.indices) !== identity.sourceIndicesSha256) throw new Error('CoK wall source pixels/mask differ from pinned tile');
  const base = import.meta.env.DEV ? '/' : import.meta.env.BASE_URL;
  const url = `${base}restyle/cok/walls/${identity.stem}.png`;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/walls/${identity.stem}.png`, identity.sha256,
    url, 8 * 1024 * 1024, undefined, 'CoK wall Restyle');
  if (bytes.byteLength < 33 || bytes.byteLength > 8 * 1024 * 1024 || await terrainSha256(bytes) !== identity.sha256) throw new Error('CoK wall PNG differs from pinned output');
  const owned = Uint8Array.from(bytes);
  const header = new DataView(owned.buffer);
  if (header.getUint8(24) !== 8 || header.getUint8(25) !== identity.colorType || header.getUint32(16) !== 64 || header.getUint32(20) !== 64) throw new Error('CoK wall PNG geometry/type mismatch');
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== 64 || bitmap.height !== 64) throw new Error('CoK wall bitmap geometry mismatch');
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CoK wall canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      pixels[(y * 64 + x) * 4 + 3] = source.indices[Math.floor(y / 8) * 8 + Math.floor(x / 8)] === 13 ? 0 : 255;
    }
    return { width: 64, height: 64, pixels };
  } finally { bitmap.close(); }
}

export interface LoadedCokWalls { art: Map<IndexedImage, RgbaArt>; errors: Map<string, string> }
export async function loadCokWallRestyles(walls: DungeonWalls): Promise<LoadedCokWalls> {
  const result: LoadedCokWalls = { art: new Map(), errors: new Map() };
  const images = new Set(walls.tileSets.flatMap((bank) => bank?.tiles ?? []));
  await Promise.all([...images].map(async (image) => {
    const identity = wallIdentityForImage(walls, image);
    if (!identity) return;
    try { result.art.set(image, await loadCokWallRestyle(identity, image)); }
    catch (error) { result.errors.set(cokWallRestyleKey(identity), error instanceof Error ? error.message : String(error)); }
  }));
  return result;
}

/** Replay every original wall blit in engine order, including native near-wall fallback. */
export function cokWallRestyleLayers(map: GameMap, pose: WallPose, walls: DungeonWalls,
  loaded: LoadedCokWalls, foreground: IndexedFramebuffer,
): { layers: { art: RgbaArt; x: number; y: number; pixelScale: number }[]; tileIdentities: CokWallRestyleRef[];
  visibleRestylePixels: number; visibleRestylePixelsByIdentity: Record<string, number> } {
  const layers: { art: RgbaArt; x: number; y: number; pixelScale: number }[] = [];
  const owner = new Uint16Array(320 * 200);
  const ordinalByKey = new Map<string, number>();
  const identityByOrdinal: CokWallRestyleRef[] = [];
  for (const blit of composeWallView(map, pose, walls.readId)) {
    const image = walls.lookupTile(blit);
    if (!image) continue;
    const restyle = loaded.art.get(image);
    const identity = restyle ? wallIdentityForImage(walls, image) : null;
    let ordinal = 0;
    if (identity) {
      const key = cokWallRestyleKey(identity);
      ordinal = ordinalByKey.get(key) ?? 0;
      if (!ordinal) {
        identityByOrdinal.push(cokWallRestyleRef(identity));
        ordinal = identityByOrdinal.length;
        ordinalByKey.set(key, ordinal);
      }
    }
    const art = restyle ?? { width: image.width, height: image.height, pixels: indexedToRGBA(image, image.palette ?? makeEgaPalette()) };
    const pixelScale = restyle ? 8 : 1;
    const pixels = new Uint8ClampedArray(art.pixels);
    let visible = false;
    for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
      const sx = blit.px + Math.floor(x / pixelScale), sy = blit.py + Math.floor(y / pixelScale);
      const offset = (y * art.width + x) * 4 + 3;
      if (sx < 8 || sx >= 128 || sy < 8 || sy >= 128 || foreground.indices[sy * foreground.width + sx] !== 255) pixels[offset] = 0;
      else if (pixels[offset]) { visible = true; owner[sy * 320 + sx] = ordinal; }
    }
    if (!visible) continue;
    layers.push({ art: { ...art, pixels }, x: blit.px, y: blit.py, pixelScale });
  }
  // If this pose never uses an admitted tile, retain the untouched indexed DOS path.
  const tileIdentities = [...new Set(owner)].filter((ordinal) => ordinal > 0).map((ordinal) => identityByOrdinal[ordinal - 1]!);
  const visibleRestylePixelsByIdentity: Record<string, number> = {};
  for (const ordinal of owner) {
    if (!ordinal) continue;
    const key = cokWallRestyleKey(identityByOrdinal[ordinal - 1]!);
    visibleRestylePixelsByIdentity[key] = (visibleRestylePixelsByIdentity[key] ?? 0) + 1;
  }
  return { layers: tileIdentities.length ? layers : [], tileIdentities, visibleRestylePixelsByIdentity,
    visibleRestylePixels: owner.reduce((count, ordinal) => count + (ordinal > 0 ? 1 : 0), 0) };
}
