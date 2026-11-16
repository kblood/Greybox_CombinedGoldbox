import type { RgbaArt } from '@goldbox/engine';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import manifest from './cokCombatRestyleManifest.json';

/** Archive identity is part of every mapping because CPIC block ids repeat across disks. */
export const COK_CPIC1_SOURCE_SHA256 = manifest.banks.find((bank) => bank.name === 'CPIC1')!.sourceArchiveSha256;

export interface CokCombatRestyleIdentity {
  bank: string;
  sourceArchiveSha256: string;
  pictureId: number;
  stem: string;
  nativeWidth: number;
  nativeHeight: number;
  pixelScale: number;
  sha256: string;
  colorType: 2 | 6;
  allowOpaque: boolean;
  sourceIndicesSha256?: string;
}

/**
 * Exact source-pinned DAX block mappings. Both bank and block id must match; ids repeat between
 * CPIC1/2/3 and every disk has a different source archive.
 */
const BY_ARCHIVE_AND_ID = new Map<string, ReadonlyMap<number, CokCombatRestyleIdentity>>(
  manifest.banks.map((bank) => [
    bank.sourceArchiveSha256,
    new Map(bank.icons.map((icon) => [icon.pictureId, {
      ...icon,
      bank: bank.name,
      sourceArchiveSha256: bank.sourceArchiveSha256,
      colorType: icon.colorType as 2 | 6,
    } satisfies CokCombatRestyleIdentity])),
  ]),
);

export function cokCombatRestyleIdentity(pictureId: number, sourceArchiveSha256?: string): CokCombatRestyleIdentity | null {
  if (!sourceArchiveSha256) return null;
  return BY_ARCHIVE_AND_ID.get(sourceArchiveSha256)?.get(pictureId) ?? null;
}

export function isCokCombatRestylePictureId(pictureId: number): boolean {
  return manifest.banks.some((bank) => bank.icons.some((icon) => icon.pictureId === pictureId));
}

/** A known bank may have an unmapped id even when that id is mapped on another disk. */
export function cokCombatRestyleSourceError(pictureId: number, sourceArchiveSha256?: string): string | null {
  const bank = manifest.banks.find((entry) => entry.sourceArchiveSha256 === sourceArchiveSha256);
  if (!bank) return 'source archive hash is unavailable or does not match a pinned CPIC bank';
  return cokCombatRestyleIdentity(pictureId, sourceArchiveSha256) ? null
    : `source ${bank.name} picture ${pictureId} has no admitted Restyle mapping; original icon retained`;
}

/** Load only an exact, source-pinned CoK combat candidate; invalid output stays on the original path. */
export async function loadCokCombatRestyleIcon(identity: CokCombatRestyleIdentity): Promise<RgbaArt> {
  const base = import.meta.env.DEV ? '/' : import.meta.env.BASE_URL;
  const url = `${base}restyle/cok/combat/${identity.stem}.png`;
  const limit = 8 * 1024 * 1024;
  const bytes = await localAssetPackOrDevFetchPinned(`cok/combat/${identity.stem}.png`, identity.sha256,
    url, limit, undefined, 'CoK combat Restyle');
  if (bytes.byteLength > limit) throw new Error('CoK combat Restyle exceeds size limit');
  if (bytes.byteLength < 33) throw new Error('CoK combat Restyle PNG is truncated');
  const owned = Uint8Array.from(bytes);
  const header = new DataView(owned.buffer);
  if (String.fromCharCode(...owned.subarray(12, 16)) !== 'IHDR'
      || header.getUint8(24) !== 8 || header.getUint8(25) !== identity.colorType) {
    throw new Error('CoK combat Restyle PNG type differs from its pinned manifest');
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer));
  const sha = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha !== identity.sha256) throw new Error('CoK combat Restyle does not match its pinned output');

  const bitmap = await createImageBitmap(new Blob([owned.buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== identity.nativeWidth * identity.pixelScale
        || bitmap.height !== identity.nativeHeight * identity.pixelScale) {
      throw new Error('CoK combat Restyle geometry differs from its pinned dimensions');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('CoK combat Restyle canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const pixels = new Uint8ClampedArray(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data);
    if (!identity.allowOpaque && !pixels.some((_, index) => index % 4 === 3 && pixels[index]! < 255)) {
      throw new Error('CoK combat Restyle is opaque and cannot be overlaid safely');
    }
    return { width: bitmap.width, height: bitmap.height, pixels };
  } finally {
    bitmap.close();
  }
}
