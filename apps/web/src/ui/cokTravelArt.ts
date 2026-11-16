import { type IndexedImage, type IndexedFramebuffer, type PlacedRgbaArt, type RgbaArt } from '@goldbox/engine';
import type { DialoguePictureSource, DialogueSceneArt } from './dialogue.js';
import manifest from './cokTravelRestyleManifest.json';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';

export const COK_TRAVEL_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest.game, system: manifest.system, archive: manifest.archive.split('/').at(-1)!,
  archiveSha256: manifest.archiveSha256, blockId: manifest.blockId, frameIndex: manifest.frameIndex,
  blockSha256: manifest.blockSha256,
});

async function sha(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Admission uses the actual archive, decompressed block and decoded indices, never an ECL id alone. */
export async function validateCokTravelSource(archiveSha256: string, raw: Uint8Array, image: IndexedImage): Promise<boolean> {
  if (archiveSha256.toLowerCase() !== manifest.archiveSha256
      || image.width !== 304 || image.height !== 120 || image.xOffset !== 0 || image.yOffset !== 0
      || image.transparentIndex !== null || image.indices.length !== 304 * 120) return false;
  return await sha(raw) === manifest.blockSha256 && await sha(image.indices) === manifest.indicesSha256;
}

export async function loadCokTravelRestyle(): Promise<RgbaArt> {
  const expected = manifest.restyle;
  const limit = 8 * 1024 * 1024;
  const url = `${import.meta.env.BASE_URL}restyle/cok/${expected.destination}`;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/${expected.destination}`, expected.sha256,
    url, limit, undefined, 'CoK travel Restyle');
  if (bytes.length !== expected.bytes || bytes.length > limit || bytes.length < 33) throw new Error('Invalid CoK travel Restyle size');
  const owned = Uint8Array.from(bytes);
  const view = new DataView(owned.buffer);
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => owned[index] !== byte)
      || String.fromCharCode(...owned.subarray(12, 16)) !== 'IHDR'
      || view.getUint32(16) !== expected.nativeWidth * expected.pixelScale
      || view.getUint32(20) !== expected.nativeHeight * expected.pixelScale
      || bytes[24] !== 8 || bytes[25] !== expected.colorType) throw new Error('CoK travel Restyle has unreviewed geometry/type');
  if (await sha(owned) !== expected.sha256) throw new Error('CoK travel Restyle does not match reviewed output');
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== 1216 || bitmap.height !== 480) throw new Error('CoK travel Restyle decoded geometry differs');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CoK travel Restyle canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return { width: canvas.width, height: canvas.height,
      pixels: new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  } finally { bitmap.close(); }
}

/** Same native hollow 8x8 white cursor above either source or Restyle map art. */
export function paintCokTravelCursor(frame: IndexedFramebuffer, x: number, y: number, originX = 8, originY = 8): void {
  const left = originX + x * 8, top = originY + y * 8;
  for (let d = 0; d < 8; d++) for (const [px, py] of [
    [left + d, top], [left + d, top + 7], [left, top + d], [left + 7, top + d],
  ]) if (px! >= 0 && px! < frame.width && py! >= 0 && py! < frame.height) frame.indices[py! * frame.width + px!] = 15;
}

export function cokTravelCursorLayer(x: number, y: number): PlacedRgbaArt {
  const pixels = new Uint8ClampedArray(8 * 8 * 4);
  for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
    if (px !== 0 && px !== 7 && py !== 0 && py !== 7) continue;
    pixels.fill(255, (py * 8 + px) * 4, (py * 8 + px) * 4 + 4);
  }
  return { art: { width: 8, height: 8, pixels }, x: 8 + x * 8, y: 8 + y * 8, pixelScale: 1 };
}

export function cokTravelSceneArt(cursor?: () => { x: number; y: number }): DialogueSceneArt {
  return {
    ref: { game: 'cok', logicalId: 'dos.bigpic1.121', frame: 0 }, source: COK_TRAVEL_SOURCE,
    pictureId: 121, comparisonId: 'dos_bigpic1_121', label: 'overland map', pixelScale: 4,
    x: 8, y: 8, loadRestyle: loadCokTravelRestyle,
    ...(cursor ? { foregroundLayers: () => { const { x, y } = cursor(); return [cokTravelCursorLayer(x, y)]; } } : {}),
  };
}
