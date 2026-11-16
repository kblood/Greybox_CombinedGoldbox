import type { RgbaArt } from '@goldbox/engine';
import type { DialoguePictureSource, DialogueSceneArt } from './dialogue.js';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import manifest from './cokDialogueRestyleManifest.json';
import manifest58 from './cokDialogue58RestyleManifest.json';
import manifest15 from './cokDialogue15RestyleManifest.json';

/** DOS PIC1#57 frame 0 only. Its DOS prompt is absent; the Amiga prompt is not its provenance. */
export const COK_PORTRAIT_57_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest.game, system: manifest.system, archive: manifest.archive.split('/').at(-1)!,
  archiveSha256: manifest.archiveSha256, blockId: manifest.blockId, frameIndex: manifest.frameIndex,
});

export const COK_PORTRAIT_57_RESTYLE = manifest.restyle;

export const COK_PORTRAIT_58_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest58.game, system: manifest58.system, archive: manifest58.archive.split('/').at(-1)!,
  archiveSha256: manifest58.archiveSha256, blockId: manifest58.blockId, frameIndex: manifest58.frameIndex,
});
export const COK_PORTRAIT_58_RESTYLE = manifest58.restyle;

/** Appearance-only identity: the retail narration and source portrait disagree; neither is reinterpreted. */
export const COK_PORTRAIT_15_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest15.game, system: manifest15.system, archive: manifest15.archive.split('/').at(-1)!,
  archiveSha256: manifest15.archiveSha256, blockId: manifest15.blockId, frameIndex: manifest15.frameIndex,
});
export const COK_PORTRAIT_15_RESTYLE = manifest15.restyle;

async function loadPortraitRestyle(expected: typeof manifest.restyle | typeof manifest58.restyle | typeof manifest15.restyle): Promise<RgbaArt> {
  const limit = 8 * 1024 * 1024;
  const url = `${import.meta.env.BASE_URL}restyle/cok/dialogue/${expected.file}`;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/dialogue/${expected.file}`, expected.sha256,
    url, limit, undefined, 'CoK portrait Restyle');
  if (bytes.byteLength < 33) throw new Error('Invalid CoK portrait Restyle size');
  const owned = Uint8Array.from(bytes);
  const view = new DataView(owned.buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => view.getUint8(index) !== byte)
      || String.fromCharCode(...owned.subarray(12, 16)) !== 'IHDR'
      || view.getUint32(16) !== expected.nativeWidth * expected.pixelScale
      || view.getUint32(20) !== expected.nativeHeight * expected.pixelScale
      || view.getUint8(24) !== 8 || view.getUint8(25) !== expected.colorType) {
    throw new Error('CoK portrait Restyle has unreviewed geometry/type');
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expected.sha256) throw new Error('CoK portrait Restyle does not match reviewed output');
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== expected.nativeWidth * expected.pixelScale
        || bitmap.height !== expected.nativeHeight * expected.pixelScale) {
      throw new Error('CoK portrait Restyle decoded geometry differs');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CoK portrait Restyle canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height,
      pixels: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data) };
  } finally { bitmap.close(); }
}

/** Keep the same 88×88 portrait origin as the indexed presentation (24,24). */
export function cokPortrait57SceneArt(): DialogueSceneArt {
  return {
    ref: { game: 'cok', logicalId: 'dos.pic1.57', frame: 0 },
    source: COK_PORTRAIT_57_SOURCE, pictureId: 57,
    comparisonId: 'dos_pic1_057_f0', label: 'portrait',
    pixelScale: 4, x: 24, y: 24, loadRestyle: loadCokPortrait57Restyle,
  };
}

/** The approved import is used byte-for-byte; its 1408x1408 RGB pixels are not normalized again. */
export function loadCokPortrait58Restyle(): Promise<RgbaArt> {
  return loadPortraitRestyle(COK_PORTRAIT_58_RESTYLE);
}

export function loadCokPortrait57Restyle(): Promise<RgbaArt> {
  return loadPortraitRestyle(COK_PORTRAIT_57_RESTYLE);
}

export function cokPortrait58SceneArt(): DialogueSceneArt {
  return {
    ref: { game: 'cok', logicalId: 'dos.pic1.58', frame: 0 },
    source: COK_PORTRAIT_58_SOURCE, pictureId: 58,
    comparisonId: 'dos_pic1_058_f0', label: 'portrait',
    pixelScale: 16, x: 24, y: 24, loadRestyle: loadCokPortrait58Restyle,
  };
}

export function loadCokPortrait15Restyle(): Promise<RgbaArt> {
  return loadPortraitRestyle(COK_PORTRAIT_15_RESTYLE);
}

export function cokPortrait15SceneArt(): DialogueSceneArt {
  return {
    ref: { game: 'cok', logicalId: 'dos.pic1.15', frame: 0 },
    source: COK_PORTRAIT_15_SOURCE, pictureId: 15,
    comparisonId: 'dos_pic1_015_f0', label: 'portrait',
    pixelScale: 16, x: 24, y: 24, loadRestyle: loadCokPortrait15Restyle,
  };
}

/** Each retail picture keeps its own source and cache identity, despite sharing PIC1.DAX. */
export function cokPortraitSceneArts(): readonly DialogueSceneArt[] {
  return [cokPortrait57SceneArt(), cokPortrait58SceneArt(), cokPortrait15SceneArt()];
}
