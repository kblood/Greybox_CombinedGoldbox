import type { AssetSource } from './assetSource.js';
import { CATALOG, assetUrl } from './catalog.js';
import { dialoguePictureSourceKey, type DialoguePictureSource, type DialogueSceneArt } from './dialogue.js';
import {
  admitCokAmigaTravel, COK_AMIGA_TRAVEL_BASE_SOURCE, COK_AMIGA_TRAVEL_SOURCE,
  type CokAmigaTravelAdmission,
} from './cokAmigaTravelArt.js';
import { cokTravelSceneArt } from './cokTravelArt.js';
import { readCokTravelTownNames, writeCokTravelTownNames } from './cokTravelMapPresentation.js';
import manifest from './cokAmigaTravelManifest.json';

async function readExactArchive(response: Response): Promise<Uint8Array> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`CoK Amiga BIGPIC1.DAA unavailable (HTTP ${response.status})`);
  }
  const contentLength = response.headers.get('content-length');
  const statedLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(statedLength) && statedLength !== manifest.archiveByteLength) {
    await response.body?.cancel();
    throw new Error('CoK Amiga BIGPIC1.DAA byte length differs');
  }
  if (!response.body) throw new Error('CoK Amiga BIGPIC1.DAA response body unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > manifest.archiveByteLength - length) {
        await reader.cancel();
        throw new Error('CoK Amiga BIGPIC1.DAA exceeds pinned byte length');
      }
      chunks.push(new Uint8Array(value));
      length += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (length !== manifest.archiveByteLength) throw new Error('CoK Amiga BIGPIC1.DAA byte length differs');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Read only the captured install; development may use the local catalog's private archive. */
export async function loadCokAmigaTravelSource(assetSource?: AssetSource): Promise<CokAmigaTravelAdmission> {
  try {
    let bytes: Uint8Array | null;
    if (assetSource !== undefined) {
      bytes = await assetSource.readAsset(manifest.archive);
      if (bytes === null) return { ok: false, reason: 'Selected install has no BIGPIC1.DAA' };
    } else {
      if (!import.meta.env.DEV) {
        return { ok: false, reason: 'Select a local CoK Amiga install to view the Amiga travel map' };
      }
      const bundled = CATALOG.find((game) => game.id === 'cok-amiga')?.assets
        .find((asset) => asset.id === 'cok-amiga-bigpic1');
      if (!bundled || bundled.path !== 'amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA') {
        return { ok: false, reason: 'Pinned catalog CoK Amiga BIGPIC1.DAA is unavailable' };
      }
      bytes = await readExactArchive(await fetch(assetUrl(bundled.path)));
    }
    return await admitCokAmigaTravel(bytes, COK_AMIGA_TRAVEL_SOURCE);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function matchesCokAmigaTravelBaseSource(
  candidate: Readonly<DialoguePictureSource> | null | undefined,
): boolean {
  return candidate !== null && candidate !== undefined
    && candidate.game === COK_AMIGA_TRAVEL_BASE_SOURCE.game
    && candidate.system === COK_AMIGA_TRAVEL_BASE_SOURCE.system
    && candidate.archive === COK_AMIGA_TRAVEL_BASE_SOURCE.archive
    && candidate.archiveSha256.toLowerCase() === COK_AMIGA_TRAVEL_BASE_SOURCE.archiveSha256
    && candidate.blockId === COK_AMIGA_TRAVEL_BASE_SOURCE.blockId
    && candidate.frameIndex === COK_AMIGA_TRAVEL_BASE_SOURCE.frameIndex
    && candidate.blockSha256 === COK_AMIGA_TRAVEL_BASE_SOURCE.blockSha256;
}

export function cokAmigaTravelSceneArt(
  cursor: () => { x: number; y: number },
  loadOriginal: () => Promise<CokAmigaTravelAdmission>,
): DialogueSceneArt {
  return {
    ...cokTravelSceneArt(cursor),
    source: COK_AMIGA_TRAVEL_SOURCE,
    baseSource: COK_AMIGA_TRAVEL_BASE_SOURCE,
    amigaOrigin: { x: 8, y: 8 },
    restyleRequiresAmigaOriginal: false,
    townNamesToggle: {
      label: 'Town names (Amiga map)',
      read: readCokTravelTownNames,
      write: writeCokTravelTownNames,
    },
    async loadAmigaOriginal() {
      const admitted = await loadOriginal();
      if (!admitted.ok) throw new Error(admitted.reason);
      if (dialoguePictureSourceKey(admitted.source) !== dialoguePictureSourceKey(COK_AMIGA_TRAVEL_SOURCE)
          || dialoguePictureSourceKey(admitted.baseSource) !== dialoguePictureSourceKey(COK_AMIGA_TRAVEL_BASE_SOURCE)
          || admitted.original.width !== 304 || admitted.original.height !== 120) {
        throw new Error('CoK Amiga travel map admission identity/geometry differs');
      }
      return { source: admitted.source, image: admitted.original };
    },
  };
}
