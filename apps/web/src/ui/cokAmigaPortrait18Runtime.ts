import type { IndexedImage, RgbaArt } from '@goldbox/engine';
import type { AssetSource } from './assetSource.js';
import { CATALOG, assetUrl } from './catalog.js';
import type { DialoguePictureSource, DialogueSceneArt } from './dialogue.js';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import {
  admitCokAmigaPortrait18, COK_AMIGA_PORTRAIT_18_SOURCE,
  validateCokAmigaPortrait18ImportedPng, type CokAmigaPortrait18Admission,
} from './cokAmigaPortrait18Art.js';
import manifest from './cokAmigaDialogue18RestyleManifest.json';

const RESTYLE_BODY_LIMIT = 8 * 1024 * 1024;

/** Bound actual streamed bytes even when Content-Length is absent, false or invalid. */
async function readBoundedBody(response: Response, limit: number, label: string): Promise<Uint8Array> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${label} unavailable (HTTP ${response.status})`);
  }
  const statedSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(statedSize) && statedSize > limit) {
    await response.body?.cancel();
    throw new Error(`${label} exceeds size limit`);
  }
  if (!response.body) throw new Error(`${label} response body unavailable`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > limit - size) {
        await reader.cancel();
        throw new Error(`${label} exceeds size limit`);
      }
      size += value.byteLength;
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    // Also stop a partially read response when its stream fails.
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** A supplied install is exclusive: missing, foreign or failed reads never use bundled data. */
export async function loadCokAmigaPortrait18Source(assetSource?: AssetSource): Promise<CokAmigaPortrait18Admission> {
  const selected = assetSource; // capture this invocation; never consult mutable active-install state
  try {
    let bytes: Uint8Array | null;
    if (selected !== undefined) {
      bytes = await selected.readAsset('PIC1.DAA');
      if (bytes === null) return { ok: false, reason: 'Selected install has no PIC1.DAA' };
    } else {
      if (!import.meta.env.DEV) {
        return { ok: false, reason: 'Select a local CoK Amiga install to view this original portrait' };
      }
      const bundled = CATALOG.find((game) => game.id === 'cok-amiga')?.assets
        .find((asset) => asset.id === 'cok-amiga-pic1');
      if (!bundled || bundled.path !== manifest.archive) {
        return { ok: false, reason: 'Pinned bundled CoK PIC1.DAA catalog entry unavailable' };
      }
      const response = await fetch(assetUrl(bundled.path));
      bytes = await readBoundedBody(response, manifest.archiveByteLength, 'Bundled CoK PIC1.DAA');
    }
    return await admitCokAmigaPortrait18(bytes, COK_AMIGA_PORTRAIT_18_SOURCE);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Fetch/decode only the reserved, exact approved imported output; no resizing or normalization. */
export async function loadCokAmigaPortrait18Restyle(): Promise<RgbaArt> {
  const bytes = await localAssetPackOrDevFetchPinned(`cok/${manifest.restyle.destination}`, manifest.restyle.sha256,
    `${import.meta.env.BASE_URL}restyle/cok/${manifest.restyle.destination}`,
    RESTYLE_BODY_LIMIT, undefined, 'CoK Amiga PIC1 #18 Restyle');
  const approved = await validateCokAmigaPortrait18ImportedPng(bytes);
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(approved).buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== manifest.restyle.width || bitmap.height !== manifest.restyle.height) {
      throw new Error('CoK Amiga PIC1 #18 Restyle decoded geometry differs');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CoK Amiga PIC1 #18 Restyle canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height,
      pixels: new Uint8ClampedArray(context.getImageData(0, 0, bitmap.width, bitmap.height).data) };
  } finally { bitmap.close(); }
}

export interface CokAmigaPortrait18SceneArt extends DialogueSceneArt {
  loadAmigaOriginal: () => Promise<{ source: Readonly<DialoguePictureSource>; image: IndexedImage }>;
}

/** Match the real DOS scene only when its containing PIC1 archive has the reviewed identity. */
export function matchesCokAmigaPortrait18BaseSource(
  candidate: Readonly<DialoguePictureSource> | null | undefined,
): boolean {
  const expected = manifest.baseSource;
  return candidate !== null && candidate !== undefined
    && candidate.game === expected.game && candidate.system === expected.system
    && candidate.archive === expected.archive
    && candidate.archiveSha256.toLowerCase() === expected.archiveSha256
    && candidate.blockId === expected.blockId && candidate.frameIndex === expected.frameIndex;
}

/** Constructing the descriptor performs no reads; the host selects when to load original art. */
export function cokAmigaPortrait18SceneArt(
  loadOriginal: () => Promise<CokAmigaPortrait18Admission>,
): CokAmigaPortrait18SceneArt {
  return {
    ref: { game: 'cok', logicalId: 'amiga.pic1.18', frame: 0 },
    source: COK_AMIGA_PORTRAIT_18_SOURCE, pictureId: 18,
    comparisonId: 'amiga_pic1_018_f0', label: 'portrait',
    pixelScale: 16, x: 24, y: 24,
    amigaOrigin: { x: 24, y: 24 },
    loadRestyle: loadCokAmigaPortrait18Restyle,
    async loadAmigaOriginal() {
      const admitted = await loadOriginal();
      if (!admitted.ok) throw new Error(admitted.reason);
      const expected = COK_AMIGA_PORTRAIT_18_SOURCE;
      if (admitted.source.game !== expected.game || admitted.source.system !== expected.system
        || admitted.source.archive !== expected.archive || admitted.source.archiveSha256 !== expected.archiveSha256
        || admitted.source.blockId !== expected.blockId || admitted.source.frameIndex !== expected.frameIndex
        || admitted.source.blockSha256 !== expected.blockSha256
        || admitted.original.width !== 88 || admitted.original.height !== 88) {
        throw new Error('CoK Amiga PIC1 #18 original admission identity/geometry differs');
      }
      return { source: admitted.source, image: admitted.original };
    },
  };
}
