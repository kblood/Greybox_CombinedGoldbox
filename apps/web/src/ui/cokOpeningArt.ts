import { decodeDaa, indexedToRGBA, type RgbaArt } from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';
import type { AssetSource } from './assetSource.js';
import type { DialoguePictureSource, DialoguePictureVariant, DialogueSceneArt } from './dialogue.js';
import { COK_COTTAGE_BASE_SOURCE as COTTAGE_BASE, COK_COTTAGE_SOURCE as COTTAGE_SOURCE, COK_COTTAGE_RESTYLE,
  createCokCottageSceneArt, loadSelectedCokCottageOriginal, requestCokCottageOutput } from './cok-opening-source.mjs';

export const COK_COTTAGE_BASE_SOURCE: Readonly<DialoguePictureSource> = COTTAGE_BASE;
export const COK_COTTAGE_SOURCE: Readonly<DialoguePictureSource> = COTTAGE_SOURCE;
export { COK_COTTAGE_RESTYLE };

/**
 * The frozen identities distinguish the actual Amiga gallery source from its approved DOS
 * same-scene base. Their native pixels differ. This preserves the existing bounded 6× pilot.
 */
export function cokCottageSceneArt(baseSource: Readonly<DialoguePictureSource> | null | undefined,
  amigaVariant?: DialoguePictureVariant): DialogueSceneArt | undefined {
  return createCokCottageSceneArt(baseSource, { loadRestyle: loadCokCottageRestyle, amigaVariant });
}

export function loadCokCottageSelectedOriginal(assetSource: AssetSource | null,
  isCurrent: () => boolean): Promise<DialoguePictureVariant | undefined> {
  return loadSelectedCokCottageOriginal({ assetSource, isCurrent, decode: decodeDaa, rgba: indexedToRGBA });
}

/** Fetch only after a player requests the pilot; an absent gallery must not 404 on boot. */
export async function loadCokCottageRestyle(): Promise<RgbaArt> {
  const file = `${COK_COTTAGE_RESTYLE.stem}.png`;
  const url = import.meta.env.DEV
    ? assetUrl(`renders/restyle-site/restyle/out/${file}`)
    : `./restyle/out/${file}`;
  const bytes = await requestCokCottageOutput({ mode: 'Restyle', baseSource: COK_COTTAGE_BASE_SOURCE,
    fetchImage: async (requestedUrl) => {
      const output = await localAssetPackOrDevFetchPinned(`out/${file}`, COK_COTTAGE_RESTYLE.sha256,
        String(requestedUrl), 8 * 1024 * 1024, undefined, 'CoK cottage Restyle');
      return new Response(Uint8Array.from(output).buffer,
        { status: 200, headers: { 'content-type': 'image/png' } });
    }, url });
  if (!bytes) throw new Error('CoK cottage source is not admitted');
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }));
  try {
    if (bitmap.width !== COK_COTTAGE_RESTYLE.nativeWidth * COK_COTTAGE_RESTYLE.pixelScale
        || bitmap.height !== COK_COTTAGE_RESTYLE.nativeHeight * COK_COTTAGE_RESTYLE.pixelScale) {
      throw new Error('CoK Restyle image has unreviewed geometry');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('CoK Restyle canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height,
      pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data) };
  } finally {
    bitmap.close();
  }
}
