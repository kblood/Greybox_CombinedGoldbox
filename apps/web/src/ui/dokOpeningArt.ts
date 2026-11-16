import type { RgbaArt } from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { localAssetPackPinnedBytes } from './localAssetPack.js';

/** One source-checked retail ECL1#16 picture, not a DoK-wide graphics mode. */
export const DOK_DRAGON_RESTYLE = {
  pictureId: 113,
  logicalId: 'opening.skeleton-dragon',
  comparisonId: 'scene_dok_skeleton_dragon',
  label: 'skeleton dragon',
  stem: '004_scene_dok_skeleton_dragon',
  nativeWidth: 304,
  nativeHeight: 120,
  pixelScale: 6,
  sha256: 'baf59cd1707307c2793b763395de5eca8666e5056c6174ec374d3daddb9fb6a5',
  amigaArchiveSha256: '29451e8561ed16a6dabc4560c890e02d8bb2cc77c320691119c29dad541c3b23',
} as const;

/** Fetch only on demand; absent or modified ignored gallery output must fail closed. */
export async function loadDokDragonRestyle(): Promise<RgbaArt> {
  const file = `${DOK_DRAGON_RESTYLE.stem}.png`;
  const limit = 8 * 1024 * 1024;
  let pinnedBytes = await localAssetPackPinnedBytes(`out/${file}`, DOK_DRAGON_RESTYLE.sha256);
  if (!pinnedBytes && import.meta.env.DEV) {
    const response = await fetch(assetUrl(`renders/restyle-site/restyle/out/${file}`));
    if (!response.ok) throw new Error(`DoK Restyle image unavailable (HTTP ${response.status})`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('DoK Restyle image exceeds size limit');
    pinnedBytes = new Uint8Array(await response.arrayBuffer());
  }
  if (!pinnedBytes) throw new Error('DoK Restyle image unavailable; select the local Restyle image folder');
  if (pinnedBytes.byteLength > limit) throw new Error('DoK Restyle image exceeds size limit');
  const bytes = new Uint8Array(pinnedBytes).buffer;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha !== DOK_DRAGON_RESTYLE.sha256) throw new Error('DoK Restyle image does not match reviewed output');
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  try {
    if (bitmap.width !== DOK_DRAGON_RESTYLE.nativeWidth * DOK_DRAGON_RESTYLE.pixelScale
        || bitmap.height !== DOK_DRAGON_RESTYLE.nativeHeight * DOK_DRAGON_RESTYLE.pixelScale) {
      throw new Error('DoK Restyle image has unreviewed geometry');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('DoK Restyle canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height,
      pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data) };
  } finally {
    bitmap.close();
  }
}
