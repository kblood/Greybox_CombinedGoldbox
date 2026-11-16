import { decodeDaa, indexedToRGBA, type DaaArchive, type IndexedImage } from '@goldbox/engine';
import type { DialoguePictureSource } from './dialogue.js';
import manifest from './cokAmigaDialogue57RestyleManifest.json';

/** Exact CoK Amiga PIC1.DAA#57 frame 0 identity, independent of ECL or presentation. */
export const COK_AMIGA_PORTRAIT_57_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest.game, system: manifest.system, archive: 'PIC1.DAA', archiveSha256: manifest.archiveSha256,
  blockId: manifest.blockId, frameIndex: manifest.frameIndex, blockSha256: manifest.blockSha256,
});

function check(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(`CoK Amiga PIC1 #57 admission: ${detail}`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkRequestedIdentity(requested: Readonly<DialoguePictureSource>): void {
  const source = COK_AMIGA_PORTRAIT_57_SOURCE;
  check(requested.game === source.game && requested.system === source.system
    && requested.archive === source.archive && requested.archiveSha256 === source.archiveSha256
    && requested.blockId === source.blockId && requested.frameIndex === source.frameIndex
    && (requested.blockSha256 === undefined || requested.blockSha256 === source.blockSha256),
  'requested identity is not the admitted Amiga PIC1.DAA #57 frame 0');
}

/** Validate the decoder's exact selected DAA entry and return a private pixel snapshot. */
export async function validateCokAmigaPortrait57DecodedEvidence(archive: DaaArchive): Promise<IndexedImage> {
  const expected = manifest.decoded;
  const container = manifest.container;
  check(archive.kind === container.kind && archive.dataBase === container.dataBase
    && archive.blocks.length === 0 && archive.subFrames.length === container.entryCount,
  'decoded container differs');
  const sf = archive.subFrames[container.tocOrdinal];
  check(archive.subFrames.filter((entry) => entry.blockId === manifest.blockId).length === 1
    && sf?.blockId === manifest.blockId && sf.subOffset === container.subOffset,
  'decoded entry identity/order differs');
  check(sf.pixOff === expected.pixOff && sf.width === expected.width && sf.height === expected.height
    && sf.widthDiv8 === expected.width / 8 && sf.x === expected.x && sf.y === expected.y
    && sf.numDist === expected.numFrames && sf.frames.length === expected.numFrames,
  'decoded entry geometry/frame count differs');
  const input = sf.frames[0];
  check(archive.frameSet.frames.get(manifest.blockId) === input && input.width === expected.width
    && input.height === expected.height && input.xOffset === expected.x && input.yOffset === expected.y
    && input.transparentIndex === expected.transparentIndex && input.encoding === 'daa-subframe'
    && input.indices.length === expected.width * expected.height,
  'decoded image differs');
  check(input.palette?.source === 'amiga-12bit' && input.palette.firstColor === 0
    && input.palette.count === 32 && input.palette.colors.length === 256
    && input.palette.colors.slice(0, 32).every((color) => color !== null
      && [color.r, color.g, color.b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    && input.palette.colors.slice(32).every((color) => color === null),
  'decoded palette differs');
  const tail = sf.tailLayout;
  check(tail?.layout === expected.layout && tail.bitmapStart === expected.bitmapStart
    && tail.planarByteLength === expected.planarByteLength && tail.frameStride === expected.frameStride
    && tail.decodedStream.byteLength === expected.byteLength
    && tail.decodedStream.byteOffset === 0 && tail.decodedStream.buffer.byteLength === expected.byteLength,
  'decoded tail-layout metadata differs');

  const stream = new Uint8Array(tail.decodedStream);
  const image: IndexedImage = { width: input.width, height: input.height, xOffset: input.xOffset,
    yOffset: input.yOffset, transparentIndex: input.transparentIndex, encoding: input.encoding,
    indices: new Uint8Array(input.indices),
    palette: { ...input.palette!, colors: input.palette!.colors.map((color) => color && { ...color }) } };
  const palette = Uint8Array.from(image.palette!.colors.slice(0, 32).flatMap((color) => [color!.r, color!.g, color!.b]));
  const planar = stream.subarray(expected.bitmapStart, expected.bitmapStart + expected.planarByteLength);
  const rgba = indexedToRGBA(image);
  const hashes = await Promise.all([sha256(stream), sha256(planar), sha256(image.indices), sha256(palette), sha256(new Uint8Array(rgba))]);
  check(hashes[0] === expected.decodedStreamSha256 && hashes[0] === manifest.blockSha256
    && hashes[1] === expected.planarSha256 && hashes[2] === expected.indicesSha256
    && hashes[3] === expected.rgbPaletteSha256 && hashes[4] === expected.opaqueRgbaSha256,
  'decoded source hashes differ');
  return image;
}

async function admitOrThrow(archiveBytes: Uint8Array, requested: Readonly<DialoguePictureSource>) {
  checkRequestedIdentity(requested);
  check(archiveBytes.byteLength === manifest.archiveByteLength, 'archive byte length differs');
  const bytes = new Uint8Array(archiveBytes);
  check(await sha256(bytes) === manifest.archiveSha256, 'archive SHA-256 differs');
  const container = manifest.container;
  const view = new DataView(bytes.buffer);
  check(view.getUint16(0, false) === container.dataBase
    && (container.dataBase - 2) / 6 === container.entryCount, 'archive TOC size differs');
  const offset = 2 + container.tocOrdinal * 6;
  const nextOffset = 2 + (container.tocOrdinal + 1) * 6;
  check(bytes[offset] === manifest.blockId && bytes[offset + 1] === 0
    && view.getUint32(offset + 2, false) === container.subOffset
    && container.dataBase + view.getUint32(offset + 2, false) === container.compressedStart
    && container.dataBase + view.getUint32(nextOffset + 2, false) === container.compressedEnd
    && container.compressedEnd - container.compressedStart === container.compressedByteLength,
  'archive selected TOC entry differs');
  check(await sha256(bytes.subarray(container.compressedStart, container.compressedEnd)) === container.compressedSha256,
    'compressed entry SHA-256 differs');
  const decoded = decodeDaa(bytes, 'PIC1.DAA', { singleFrameTailBlockIds: [manifest.blockId] });
  return { source: COK_AMIGA_PORTRAIT_57_SOURCE, original: await validateCokAmigaPortrait57DecodedEvidence(decoded) };
}

export type CokAmigaPortrait57Admission =
  | { ok: true; source: Readonly<DialoguePictureSource>; original: IndexedImage }
  | { ok: false; reason: string };

export async function admitCokAmigaPortrait57(
  archiveBytes: Uint8Array,
  requested: Readonly<DialoguePictureSource>,
): Promise<CokAmigaPortrait57Admission> {
  try { return { ok: true, ...await admitOrThrow(archiveBytes, requested) }; }
  catch (error) {
    const reason = error instanceof Error
      ? [error.message, error.cause instanceof Error ? error.cause.message : undefined].filter(Boolean).join(': ')
      : String(error);
    return { ok: false, reason };
  }
}

/** Snapshot/validate the exact approved Batch02 import before browser image decoding. */
export async function validateCokAmigaPortrait57ImportedPng(pngBytes: Uint8Array): Promise<Uint8Array> {
  const expected = manifest.restyle;
  check(pngBytes.byteLength === expected.byteLength, 'imported PNG byte length differs');
  const bytes = new Uint8Array(pngBytes);
  const view = new DataView(bytes.buffer);
  check([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    && view.getUint32(8, false) === 13 && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR',
  'imported PNG signature/IHDR differs');
  check(view.getUint32(16, false) === expected.width && view.getUint32(20, false) === expected.height
    && bytes[24] === expected.bitDepth && bytes[25] === expected.colorType
    && bytes[26] === 0 && bytes[27] === 0 && bytes[28] === 0,
  'imported PNG geometry/type differs');
  check(await sha256(bytes) === expected.sha256, 'imported PNG SHA-256 differs');
  return bytes;
}
