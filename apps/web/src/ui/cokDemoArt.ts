import type { IndexedImage } from '@goldbox/engine';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import manifest from './cokDemoArtManifest.json';

export const COK_DEMO_PICTURE_ID = manifest.pictureId;
export const COK_DEMO_DOS_SOURCE = Object.freeze(manifest.dos);
export const COK_DEMO_AMIGA_SOURCE = Object.freeze(manifest.amiga);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Admit the Restyle only for the pinned DOS source scene and decoded geometry. */
export async function validateCokDemoDosSource(
  archive: Uint8Array,
  raw: Uint8Array,
  image: IndexedImage,
): Promise<boolean> {
  return image.width === manifest.nativeWidth && image.height === manifest.nativeHeight
    && image.xOffset === 0 && image.yOffset === 0 && image.transparentIndex === null
    && await sha256(archive) === manifest.dos.archiveSha256
    && await sha256(raw) === manifest.dos.blockSha256;
}

/** Admit the Amiga choice only when both archive and picture block match the reviewed source. */
export async function validateCokDemoAmigaSource(
  archive: Uint8Array,
  raw: Uint8Array | null,
  image: IndexedImage,
): Promise<boolean> {
  return image.width === manifest.nativeWidth && image.height === manifest.nativeHeight
    && image.xOffset === 0 && image.yOffset === 0 && image.transparentIndex === null
    && await sha256(archive) === manifest.amiga.archiveSha256
    && (!raw || await sha256(raw) === manifest.amiga.blockSha256);
}

/** Decode the approved frame-0 PNG after checking its exact bytes, dimensions and PNG type. */
export async function loadCokDemoRestyle(): Promise<ImageBitmap> {
  const expected = manifest.restyle;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/${expected.destination}`, expected.sha256,
    `${import.meta.env.BASE_URL}restyle/cok/${expected.destination}`, 8 * 1024 * 1024, undefined, 'CoK demo Restyle');
  if (bytes.length !== expected.bytes || bytes.length < 33 || bytes.length > 8 * 1024 * 1024) {
    throw new Error('CoK demo Restyle has an invalid file size');
  }
  const owned = Uint8Array.from(bytes);
  const view = new DataView(owned.buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => owned[index] !== byte)
      || view.getUint32(8) !== 13 || String.fromCharCode(...owned.subarray(12, 16)) !== 'IHDR'
      || view.getUint32(16) !== expected.width || view.getUint32(20) !== expected.height
      || owned[24] !== 8 || owned[25] !== expected.colorType) {
    throw new Error('CoK demo Restyle has unreviewed PNG geometry or type');
  }
  if (await sha256(owned) !== expected.sha256) throw new Error('CoK demo Restyle hash differs from the reviewed frame');
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  if (bitmap.width !== expected.width || bitmap.height !== expected.height) {
    bitmap.close();
    throw new Error('CoK demo Restyle decoded geometry differs');
  }
  return bitmap;
}
