import { decodeDaa, indexedToRGBA, type DaaArchive, type IndexedImage } from '@goldbox/engine';
import type { DialoguePictureSource } from './dialogue.js';
import manifest from './cokAmigaDialogue18RestyleManifest.json';

/** A source-specific admission, with no ECL scene, fetch, browser or presentation binding. */
export const COK_AMIGA_PORTRAIT_18_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest.game,
  system: manifest.system,
  archive: 'PIC1.DAA',
  archiveSha256: manifest.archiveSha256,
  blockId: manifest.blockId,
  frameIndex: manifest.frameIndex,
  blockSha256: manifest.blockSha256,
});

function check(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(`CoK Amiga PIC1 #18 admission: ${detail}`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkRequestedIdentity(requested: Readonly<DialoguePictureSource>): void {
  const source = COK_AMIGA_PORTRAIT_18_SOURCE;
  check(requested.game === source.game && requested.system === source.system
    && requested.archive === source.archive && requested.archiveSha256 === source.archiveSha256
    && requested.blockId === source.blockId && requested.frameIndex === source.frameIndex
    && (requested.blockSha256 === undefined || requested.blockSha256 === source.blockSha256),
  'requested identity is not the admitted Amiga PIC1.DAA #18 frame 0');
}

/**
 * Checks decoded evidence only; this cannot establish archive provenance. Returns
 * an owned image snapshot so caller mutations during hashing cannot change the verdict.
 */
export async function validateCokAmigaPortrait18DecodedEvidence(archive: DaaArchive): Promise<IndexedImage> {
  const expected = manifest.decoded;
  check(archive.kind === manifest.container.kind && archive.dataBase === manifest.container.dataBase
    && archive.blocks.length === 0 && archive.subFrames.length === manifest.container.entryCount,
  'decoded container differs');
  const sf = archive.subFrames[manifest.container.tocOrdinal];
  check(archive.subFrames.filter((entry) => entry.blockId === manifest.blockId).length === 1
    && sf?.blockId === manifest.blockId && sf.subOffset === manifest.container.subOffset,
    'decoded entry identity/order differs');
  check(sf.pixOff === expected.pixOff && sf.width === expected.width && sf.height === expected.height
    && sf.widthDiv8 === expected.width / 8 && sf.x === expected.x && sf.y === expected.y
    && sf.numDist === expected.numFrames && sf.frames.length === expected.numFrames,
  'decoded entry geometry/frame count differs');
  const input = sf.frames[0];
  check(archive.frameSet.frames.get(manifest.blockId) === input, 'primary frame binding differs');
  check(input.width === expected.width && input.height === expected.height
    && input.xOffset === expected.x && input.yOffset === expected.y
    && input.transparentIndex === expected.transparentIndex && input.encoding === 'daa-subframe'
    && input.indices.length === expected.width * expected.height, 'decoded image differs');
  check(input.palette?.source === 'amiga-12bit' && input.palette.firstColor === 0
    && input.palette.count === 32 && input.palette.colors.length === 256, 'decoded palette shape differs');
  check(input.palette.colors.slice(0, 32).every((c) => c !== null
    && [c.r, c.g, c.b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    && input.palette.colors.slice(32).every((c) => c === null), 'decoded palette entries differ');
  const tail = sf.tailLayout;
  check(tail?.layout === expected.layout && tail.bitmapStart === expected.bitmapStart
    && tail.planarByteLength === expected.planarByteLength && tail.frameStride === expected.frameStride
    && tail.decodedStream.byteLength === expected.byteLength
    && tail.decodedStream.byteOffset === 0 && tail.decodedStream.buffer.byteLength === expected.byteLength,
  'decoded tail-layout metadata differs');

  // Snapshot every hashed payload before the first await. Never retain caller-owned buffers.
  const stream = new Uint8Array(tail.decodedStream);
  const image: IndexedImage = {
    width: input.width, height: input.height, xOffset: input.xOffset, yOffset: input.yOffset,
    transparentIndex: input.transparentIndex, encoding: input.encoding,
    indices: new Uint8Array(input.indices),
    palette: { ...input.palette, colors: input.palette.colors.map((c) => c === null ? null : { ...c }) },
  };
  const palette = Uint8Array.from(image.palette!.colors.slice(0, 32).flatMap((c) => [c!.r, c!.g, c!.b]));
  const planar = stream.subarray(expected.bitmapStart, expected.bitmapStart + expected.planarByteLength);
  const rgba = indexedToRGBA(image);
  const hashes = await Promise.all([
    sha256(stream), sha256(planar), sha256(image.indices), sha256(palette), sha256(new Uint8Array(rgba)),
  ]);
  check(hashes[0] === manifest.blockSha256, 'decoded full stream hash differs');
  check(hashes[1] === expected.planarSha256, 'decoded planar hash differs');
  check(hashes[2] === expected.indicesSha256, 'decoded indices hash differs');
  check(hashes[3] === expected.rgbPaletteSha256, 'decoded RGB palette hash differs');
  check(hashes[4] === expected.opaqueRgbaSha256, 'decoded opaque RGBA hash differs');
  return image;
}

async function admitCokAmigaPortrait18OrThrow(
  archiveBytes: Uint8Array,
  requested: Readonly<DialoguePictureSource>,
): Promise<{ source: Readonly<DialoguePictureSource>; original: IndexedImage }> {
  checkRequestedIdentity(requested);
  check(archiveBytes.byteLength === manifest.archiveByteLength, 'archive byte length differs');
  const bytes = new Uint8Array(archiveBytes); // also copies Node Buffer and nonzero-offset views
  check(await sha256(bytes) === manifest.archiveSha256, 'archive SHA-256 differs');
  const c = manifest.container;
  const view = new DataView(bytes.buffer);
  check(view.getUint16(0, false) === c.dataBase && (c.dataBase - 2) / 6 === c.entryCount,
    'archive TOC size differs');
  const off = 2 + c.tocOrdinal * 6;
  check(bytes[off] === manifest.blockId && bytes[off + 1] === 0
    && view.getUint32(off + 2, false) === c.subOffset
    && c.dataBase + view.getUint32(off + 2, false) === c.compressedStart
    && c.dataBase + view.getUint32(off + 8, false) === c.compressedEnd
    && c.compressedEnd - c.compressedStart === c.compressedByteLength, 'archive selected TOC entry differs');
  check(await sha256(bytes.subarray(c.compressedStart, c.compressedEnd)) === c.compressedSha256,
    'compressed entry SHA-256 differs');
  const decoded = decodeDaa(bytes, 'PIC1.DAA', { singleFrameTailBlockIds: [manifest.blockId] });
  const original = await validateCokAmigaPortrait18DecodedEvidence(decoded);
  return { source: COK_AMIGA_PORTRAIT_18_SOURCE, original };
}

export type CokAmigaPortrait18Admission =
  | { ok: true; source: Readonly<DialoguePictureSource>; original: IndexedImage }
  | { ok: false; reason: string };

/** Verify the private snapshot before decoder opt-in; failure is an explicit result. */
export async function admitCokAmigaPortrait18(
  archiveBytes: Uint8Array,
  requested: Readonly<DialoguePictureSource>,
): Promise<CokAmigaPortrait18Admission> {
  try {
    const admitted = await admitCokAmigaPortrait18OrThrow(archiveBytes, requested);
    return { ok: true, ...admitted };
  } catch (error) {
    const reason = error instanceof Error
      ? [error.message, error.cause instanceof Error ? error.cause.message : undefined].filter(Boolean).join(': ')
      : String(error);
    return { ok: false, reason };
  }
}

/** Validate the exact approved imported PNG and return its private owned byte snapshot. */
export async function validateCokAmigaPortrait18ImportedPng(pngBytes: Uint8Array): Promise<Uint8Array> {
  const expected = manifest.restyle;
  check(pngBytes.byteLength === expected.byteLength, 'imported PNG byte length differs');
  const bytes = new Uint8Array(pngBytes);
  const view = new DataView(bytes.buffer);
  check([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    && view.getUint32(8, false) === 13
    && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR', 'imported PNG signature/IHDR differs');
  check(view.getUint32(16, false) === expected.width && view.getUint32(20, false) === expected.height
    && bytes[24] === expected.bitDepth && bytes[25] === expected.colorType
    && bytes[26] === 0 && bytes[27] === 0 && bytes[28] === 0, 'imported PNG geometry/type differs');
  check(await sha256(bytes) === expected.sha256, 'imported PNG SHA-256 differs');
  return bytes;
}
