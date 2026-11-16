import type { DecodedAsset, IndexedImage, RgbaArt } from '@goldbox/engine';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import manifest from './cokTitleRestyleManifest.json';

/** Source/review contract: docs/engine/research/cok-title-restyle-source-admission-2026-10-27.md. */
export const COK_TITLE_SOURCE = Object.freeze(manifest.source);

export type CokTitleBlock = 1 | 2 | 3 | 4;

// These are the reviewed normalized imports, not the raw ImageGen outputs. In particular #2
// rejects the stale live Batch01 image. Packaging must supply the exact imports at these URLs.
export const COK_TITLE_RESTYLE = Object.freeze({
  1: Object.freeze(manifest.blocks[1]),
  2: Object.freeze(manifest.blocks[2]),
  3: Object.freeze(manifest.blocks[3]),
  4: Object.freeze(manifest.blocks[4]),
});

/** Each screen owns its complete layer list; the transparent #3 is absent from screen 3. */
export const COK_TITLE_SCREENS: readonly (readonly { block: CokTitleBlock; x: number; y: number }[])[] = [
  [{ block: 1, x: 0, y: 0 }],
  [{ block: 2, x: 0, y: 0 }, { block: 3, x: 40, y: 8 }],
  [{ block: 2, x: 0, y: 0 }, { block: 4, x: 0, y: 8 }],
];

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Reject a foreign archive or a regression to the historical byte-8 title decoder. */
export async function validateCokTitleSource(bytes: Uint8Array, decoded: DecodedAsset): Promise<void> {
  if (bytes.length !== COK_TITLE_SOURCE.bytes || await sha256(bytes) !== COK_TITLE_SOURCE.sha256) {
    throw new Error('TITLE.DAX differs from the reviewed DOS source');
  }
  if (decoded.format !== 'dax' || decoded.archive.blocks.length !== 4) {
    throw new Error('TITLE.DAX must contain the four reviewed DAX blocks');
  }
  for (const id of [1, 2, 3, 4] as const) {
    const matches = decoded.archive.blocks.filter((block) => block.blockId === id);
    const block = matches[0];
    const image: IndexedImage | null | undefined = block?.image;
    const expected = COK_TITLE_RESTYLE[id];
    if (matches.length !== 1 || !block || !image || block.kind !== 'frame'
        || image.width !== expected.nativeWidth || image.height !== expected.nativeHeight
        || image.transparentIndex !== null || image.indices.length !== image.width * image.height
        || block.raw.length !== 17 + image.width * image.height / 2) {
      throw new Error(`TITLE.DAX block ${id} source geometry differs`);
    }
    const header = new DataView(block.raw.buffer, block.raw.byteOffset, block.raw.byteLength);
    if (header.getUint16(0, true) !== image.height || header.getUint16(2, true) * 8 !== image.width
        || block.raw[8] !== 1) throw new Error(`TITLE.DAX block ${id} source header differs`);
    for (let pixel = 0; pixel < image.indices.length; pixel += 2) {
      const packed = block.raw[17 + pixel / 2]!;
      if (image.indices[pixel] !== (packed >> 4) || image.indices[pixel + 1] !== (packed & 15)) {
        throw new Error(`TITLE.DAX block ${id} decoded pixels differ from its byte-17 source`);
      }
    }
  }
}

export async function loadCokTitleRestyle(block: CokTitleBlock, signal: AbortSignal): Promise<RgbaArt> {
  const expected = COK_TITLE_RESTYLE[block];
  const bytes = await localAssetPackOrDevFetchPinned(`cok/title/${expected.destination}`, expected.sha256,
    `${import.meta.env.BASE_URL}restyle/cok/title/${expected.destination}`, expected.bytes, signal, `Title Restyle block ${block}`);
  if (signal.aborted) throw new Error('Title Restyle request cancelled');
  if (bytes.byteLength !== expected.bytes) throw new Error('Title Restyle file size differs');
  const owned = Uint8Array.from(bytes);
  const header = new DataView(owned.buffer);
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => owned[index] !== byte)
      || header.getUint32(8) !== 13 || String.fromCharCode(...owned.subarray(12, 16)) !== 'IHDR'
      || header.getUint32(16) !== expected.width || header.getUint32(20) !== expected.height
      || owned[24] !== 8 || owned[25] !== expected.colorType) {
    throw new Error(`Title Restyle block ${block} PNG geometry/type differs`);
  }
  if (await sha256(owned) !== expected.sha256) throw new Error(`Title Restyle block ${block} hash differs from reviewed import`);
  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (signal.aborted) throw new Error('Title Restyle request cancelled');
    if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new Error('Title Restyle decoded geometry differs');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Title Restyle canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height,
      pixels: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data) };
  } finally { bitmap.close(); }
}
