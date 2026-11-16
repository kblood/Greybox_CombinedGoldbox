import { decodeDaa, type DaaArchive, type IndexedImage } from '@goldbox/engine';
import type { DialoguePictureSource } from './dialogue.js';
import { COK_TRAVEL_SOURCE } from './cokTravelArt.js';
import manifest from './cokAmigaTravelManifest.json';

/** An Amiga source candidate pinned to the exact existing DOS travel-picture identity. */
export const COK_AMIGA_TRAVEL_SOURCE: Readonly<DialoguePictureSource> = Object.freeze({
  game: manifest.game,
  system: manifest.system,
  archive: manifest.archive,
  archiveSha256: manifest.archiveSha256,
  blockId: manifest.blockId,
  frameIndex: manifest.frameIndex,
  blockSha256: manifest.blockSha256,
});

/** The precise existing DOS identity this alternate-system source corresponds to. */
export const COK_AMIGA_TRAVEL_BASE_SOURCE: Readonly<DialoguePictureSource> = COK_TRAVEL_SOURCE;

function check(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(`CoK Amiga BIGPIC1 #121 admission: ${detail}`);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkRequestedIdentity(requested: Readonly<DialoguePictureSource>): void {
  const expected = COK_AMIGA_TRAVEL_SOURCE;
  check(requested.game === expected.game && requested.system === expected.system
    && requested.archive === expected.archive && requested.archiveSha256 === expected.archiveSha256
    && requested.blockId === expected.blockId && requested.frameIndex === expected.frameIndex
    && (requested.blockSha256 === undefined || requested.blockSha256 === expected.blockSha256),
  'requested identity is not the pinned Amiga BIGPIC1.DAA #121 frame 0');
}

function rgbBytes(image: IndexedImage): Uint8Array {
  const palette = image.palette!;
  const rgb = new Uint8Array(image.indices.length * 3);
  for (let i = 0; i < image.indices.length; i++) {
    const color = palette.colors[image.indices[i]!];
    check(color !== null && color !== undefined, 'image references an undefined palette color');
    rgb[i * 3] = color.r;
    rgb[i * 3 + 1] = color.g;
    rgb[i * 3 + 2] = color.b;
  }
  return rgb;
}

/**
 * Validate decoded pixels independently of loading or presentation. The returned image owns
 * its indices and palette. This evidence does not establish original-install provenance.
 */
export async function validateCokAmigaTravelDecodedEvidence(archive: DaaArchive): Promise<IndexedImage> {
  const expected = manifest.decoded;
  check(archive.kind === manifest.container.kind && archive.dataBase === manifest.container.dataBase
    && archive.blocks.length === manifest.container.entryCount && archive.subFrames.length === 0,
  'decoded container differs');
  const matches = archive.blocks.filter((block) => block.blockId === manifest.blockId);
  check(matches.length === 1, 'archive does not contain exactly one selected block ID');
  const block = matches[0]!;
  check(block.kind === 'frame' && block.image !== null && block.image !== undefined
    && block.frames === undefined, 'selected block is not a single decoded frame');

  const input = block.image;
  check(input.width === expected.width && input.height === expected.height
    && input.xOffset === expected.xOffset && input.yOffset === expected.yOffset
    && input.transparentIndex === expected.transparentIndex && input.encoding === expected.encoding
    && input.indices.length === expected.width * expected.height,
  'decoded image geometry or opacity differs');
  check(input.palette?.source === expected.paletteSource
    && input.palette.firstColor === expected.paletteFirstColor
    && input.palette.count === expected.paletteCount && input.palette.colors.length === 256
    && input.palette.colors.slice(0, 32).every((color) => color !== null
      && [color.r, color.g, color.b].every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255))
    && input.palette.colors.slice(32).every((color) => color === null)
    && input.indices.every((index) => index < 32), 'decoded palette/image opacity differs');

  // Snapshot all caller-owned decoded bytes and palette objects before asynchronous hashing.
  const image: IndexedImage = {
    width: input.width,
    height: input.height,
    xOffset: input.xOffset,
    yOffset: input.yOffset,
    transparentIndex: input.transparentIndex,
    encoding: input.encoding,
    indices: new Uint8Array(input.indices),
    palette: {
      ...input.palette!,
      colors: input.palette!.colors.map((color) => color === null ? null : { ...color }),
    },
  };
  const raw = new Uint8Array(block.raw);
  const rgb = rgbBytes(image);
  const [rawSha256, rgbSha256] = await Promise.all([sha256(raw), sha256(rgb)]);
  check(rawSha256 === manifest.blockSha256, 'raw block SHA-256 differs');
  check(rgbSha256 === expected.rgbSha256, 'native RGB SHA-256 differs');
  return image;
}

async function admitCokAmigaTravelOrThrow(
  archiveBytes: Uint8Array,
  requested: Readonly<DialoguePictureSource>,
): Promise<{ source: Readonly<DialoguePictureSource>; baseSource: Readonly<DialoguePictureSource>; original: IndexedImage }> {
  checkRequestedIdentity(requested);
  check(archiveBytes.byteLength === manifest.archiveByteLength, 'archive byte length differs');
  const bytes = new Uint8Array(archiveBytes); // copies Buffer aliases and offset views too
  check(await sha256(bytes) === manifest.archiveSha256, 'archive SHA-256 differs');
  const dataBase = (bytes[0]! << 8) | bytes[1]!;
  check(dataBase === manifest.container.dataBase && dataBase >= 2
    && (dataBase - 2) % 9 === 0 && (dataBase - 2) / 9 === manifest.container.entryCount,
  'archive table shape differs');
  const decoded = decodeDaa(bytes, manifest.archive);
  const original = await validateCokAmigaTravelDecodedEvidence(decoded);
  return { source: COK_AMIGA_TRAVEL_SOURCE, baseSource: COK_AMIGA_TRAVEL_BASE_SOURCE, original };
}

export type CokAmigaTravelAdmission =
  | { ok: true; source: Readonly<DialoguePictureSource>; baseSource: Readonly<DialoguePictureSource>; original: IndexedImage }
  | { ok: false; reason: string };

/** Verify exact candidate-package bytes and decoded art; no runtime loader is provided here. */
export async function admitCokAmigaTravel(
  archiveBytes: Uint8Array,
  requested: Readonly<DialoguePictureSource>,
): Promise<CokAmigaTravelAdmission> {
  try {
    return { ok: true, ...(await admitCokAmigaTravelOrThrow(archiveBytes, requested)) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}
