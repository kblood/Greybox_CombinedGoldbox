import {
  makeEgaPalette,
  type CokCharacterAppearanceRecord,
  type RgbaArt,
} from '@goldbox/engine';
import manifest from './cokPlayerAppearanceManifest.json';
import restyleAdmission from './cokPlayerRestyleAdmission.json';
import canonicalProjection from './cokPlayerCanonicalBindings.json';
import { cokPlayerAppearanceFetchPlan, tryCokPlayerCanonicalBindings,
  type CokPlayerCanonicalFrameIds, type CokPlayerComponentRequest } from './cok-player-canonical-bindings.mjs';
import { localAssetPackOrDevFetchPinned } from './localAssetPack.js';

const PALETTE = makeEgaPalette();
const LIMIT = 8 * 1024 * 1024;

export interface CokPlayerAppearanceFrame {
  bodyBlockId: number;
  canonical: CokPlayerCanonicalFrameIds | null;
  original: RgbaArt;
  restyle: RgbaArt | null;
  restyleStatus: { state: 'pending' | 'ready' | 'failed' | 'not-admitted'; headPath: string; bodyPath: string;
    component?: 'head' | 'body'; error?: string; reason?: string };
  pixelScale: number;
}

export interface CokPlayerAppearance {
  id: string;
  frames: readonly CokPlayerAppearanceFrame[];
}
export interface CokPlayerPreparation { original: CokPlayerAppearance; restyleReady: Promise<CokPlayerAppearance> }

function basePath(appearanceId: string): string {
  const base = import.meta.env.DEV ? '/' : import.meta.env.BASE_URL;
  return `${base}restyle/cok/player/${appearanceId}`;
}

async function fetchPinnedPng(
  appearanceId: string,
  path: string,
  sha256: string,
  width: number,
  height: number,
  colorType: 2 | 6,
): Promise<{ bytes: ArrayBuffer; bitmap: ImageBitmap }> {
  const pngBytes = await localAssetPackOrDevFetchPinned(`cok/player/${appearanceId}/${path}`, sha256,
    `${basePath(appearanceId)}/${path}`, LIMIT, undefined, `CoK player art: ${path}`);
  const bytes = new Uint8Array(pngBytes).buffer;
  if (bytes.byteLength > LIMIT || bytes.byteLength < 33) throw new Error(`Invalid CoK player PNG size: ${path}`);
  const view = new DataView(bytes);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((byte, index) => view.getUint8(index) !== byte)
      || String.fromCharCode(...new Uint8Array(bytes, 12, 4)) !== 'IHDR'
      || view.getUint32(16) !== width || view.getUint32(20) !== height
      || view.getUint8(24) !== 8 || view.getUint8(25) !== colorType) {
    throw new Error(`CoK player PNG geometry/type differs from manifest: ${path}`);
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const actualSha = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (actualSha !== sha256) throw new Error(`CoK player PNG differs from pinned source: ${path}`);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  if (bitmap.width !== width || bitmap.height !== height) {
    bitmap.close();
    throw new Error(`Decoded CoK player PNG geometry differs from manifest: ${path}`);
  }
  return { bytes, bitmap };
}

function canvasPixels(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('CoK player art canvas unavailable');
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

function rgbIndexMap(): Map<string, number> {
  const colors = new Map<string, number>();
  PALETTE.colors.forEach((color, index) => {
    if (color) {
      const key = `${color.r},${color.g},${color.b}`;
      if (!colors.has(key)) colors.set(key, index);
    }
  });
  return colors;
}

function indexSourceFrame(data: ImageData, nativeWidth: number, nativeHeight: number, scale: number): Uint8Array {
  const indices = new Uint8Array(nativeWidth * nativeHeight);
  const egaColors = rgbIndexMap();
  for (let y = 0; y < nativeHeight; y++) {
    for (let x = 0; x < nativeWidth; x++) {
      const offset = ((y * scale + Math.floor(scale / 2)) * data.width + x * scale + Math.floor(scale / 2)) * 4;
      const alpha = data.data[offset + 3]!;
      const r = data.data[offset]!;
      const g = data.data[offset + 1]!;
      const b = data.data[offset + 2]!;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const sample = ((y * scale + py) * data.width + x * scale + px) * 4;
          if (data.data[sample] !== r || data.data[sample + 1] !== g
              || data.data[sample + 2] !== b || data.data[sample + 3] !== alpha) {
            throw new Error(`CHEAD/CBODY source is not an exact ${scale}x pixel enlargement at ${x},${y}`);
          }
        }
      }
      const index = alpha === 0 || (r === 0 && g === 0 && b === 0) ? 0 : egaColors.get(`${r},${g},${b}`);
      if (index === undefined) throw new Error(`CHEAD/CBODY source contains a non-EGA color (${r},${g},${b})`);
      indices[y * nativeWidth + x] = index;
    }
  }
  return indices;
}

function paletteMap(paletteBytes: readonly number[]): Uint8Array {
  const mapping = Uint8Array.from({ length: 16 }, (_, index) => index);
  for (let i = 0; i < manifest.paletteSelectorIndices.length; i++) {
    const index = manifest.paletteSelectorIndices[i]!;
    const byte = paletteBytes[i]!;
    mapping[index] = byte & 0x0f;
    mapping[index + 8] = byte >>> 4;
  }
  return mapping;
}

interface ComposedSourceFrame {
  indices: Uint8Array;
  /** One means the retail mask preserves the destination pixel (transparent). */
  transparent: Uint8Array;
  original: RgbaArt;
}

function composeOriginal(
  body: ImageData,
  head: ImageData,
  paletteBytes: readonly number[],
  headSize: { nativeWidth: number; nativeHeight: number },
): ComposedSourceFrame {
  const scale = manifest.pixelScale;
  // Admission remains exact-tuple-only. The source-proven head layouts are 24x8 and 24x10;
  // no geometry is inferred from a generated image or an arbitrary character request.
  const headHeight = headSize.nativeHeight;
  if (headSize.nativeWidth !== 24 || (headHeight !== 8 && headHeight !== 10)
      || head.width !== 24 * scale || head.height !== headHeight * scale
      || body.width !== 24 * scale || body.height !== 24 * scale) {
    throw new Error('Unsupported CoK player source composition geometry');
  }
  const bodyIndices = indexSourceFrame(body, 24, 24, scale);
  const headIndices = indexSourceFrame(head, 24, headHeight, scale);
  const transparent = new Uint8Array(24 * 24);
  // Retail ORs the packed pixel plane and ANDs the corresponding mask plane. The frame loader
  // constructs each plane's mask from palette index 1 (not black/index 0), so combine both masks
  // independently of the OR-combined EGA pixel value.
  for (let y = 0; y < headHeight; y++) {
    for (let x = 0; x < 24; x++) {
      const index = y * 24 + x;
      const bodyIndex = bodyIndices[index]!;
      const headIndex = headIndices[index]!;
      transparent[index] = Number(
        bodyIndex === manifest.sourceMaskKey && headIndex === manifest.sourceMaskKey,
      );
      bodyIndices[index] = bodyIndex | headIndex;
    }
  }
  for (let index = headHeight * 24; index < bodyIndices.length; index++) {
    transparent[index] = Number(bodyIndices[index] === manifest.sourceMaskKey);
  }
  const remap = paletteMap(paletteBytes);
  for (let index = 0; index < bodyIndices.length; index++) bodyIndices[index] = remap[bodyIndices[index]!]!;
  const pixels = new Uint8ClampedArray(24 * scale * 24 * scale * 4);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const index = y * 24 + x;
      const color = PALETTE.colors[bodyIndices[index]!];
      if (!color) throw new Error('CoK source palette unavailable for original player art');
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const offset = ((y * scale + py) * 24 * scale + x * scale + px) * 4;
          pixels[offset] = color.r;
          pixels[offset + 1] = color.g;
          pixels[offset + 2] = color.b;
          pixels[offset + 3] = transparent[index] ? 0 : 255;
        }
      }
    }
  }
  return { indices: bodyIndices, transparent, original: { width: 24 * scale, height: 24 * scale, pixels } };
}

function composeRestyle(body: ImageBitmap, head: ImageBitmap, source: ComposedSourceFrame): RgbaArt {
  const width = 24 * manifest.pixelScale;
  const height = 24 * manifest.pixelScale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('CoK player Restyle canvas unavailable');
  context.clearRect(0, 0, width, height);
  context.drawImage(body, 0, 0);
  context.drawImage(head, 0, 0);
  const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
  let visible = 0;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const sourceIndex = y * 24 + x;
      const sourceOffset = y * width * manifest.pixelScale * 4 + x * manifest.pixelScale * 4;
      if (source.transparent[sourceIndex]) {
        for (let py = 0; py < manifest.pixelScale; py++) {
          for (let px = 0; px < manifest.pixelScale; px++) pixels[sourceOffset + (py * width + px) * 4 + 3] = 0;
        }
        continue;
      }
      visible++;
      let alphaMax = 0;
      for (let py = 0; py < manifest.pixelScale; py++) {
        for (let px = 0; px < manifest.pixelScale; px++) {
          alphaMax = Math.max(alphaMax, pixels[sourceOffset + (py * width + px) * 4 + 3]!);
        }
      }
      if (alphaMax === 0) {
        const color = PALETTE.colors[source.indices[sourceIndex]!];
        if (!color) throw new Error('CoK source palette unavailable for silhouette fallback');
        for (let py = 0; py < manifest.pixelScale; py++) {
          for (let px = 0; px < manifest.pixelScale; px++) {
            const offset = sourceOffset + (py * width + px) * 4;
            pixels[offset] = color.r;
            pixels[offset + 1] = color.g;
            pixels[offset + 2] = color.b;
            pixels[offset + 3] = 255;
          }
        }
      }
    }
  }
  if (visible === 0) throw new Error('CoK Restyle player silhouette is empty');
  return { width, height, pixels };
}

const validatedSources = new WeakMap<CokPlayerAppearance, { key: string; sources: ComposedSourceFrame[] }>();
const canonicalBindings = tryCokPlayerCanonicalBindings(manifest, restyleAdmission, canonicalProjection);

/** Mandatory sources compose before optional requests; retries retain only private pixel buffers. */
export async function prepareCokPlayerAppearance(
  appearance: CokCharacterAppearanceRecord | undefined,
  priorOriginal?: CokPlayerAppearance,
  scope: 'all' | 'primary' = 'all',
): Promise<CokPlayerPreparation | null> {
  if (!appearance || appearance.paletteBytes.length !== 6
      || !appearance.paletteBytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) return null;
  const fullPlan = cokPlayerAppearanceFetchPlan(manifest, canonicalBindings, appearance);
  if (!fullPlan || !['all', 'primary'].includes(scope)) return null;
  const plan = { ...fullPlan, frames: scope === 'primary' ? fullPlan.frames.slice(0, 1) : fullPlan.frames };
  const key = JSON.stringify([plan, appearance, scope]);
  const cached = priorOriginal && validatedSources.get(priorOriginal);
  const sources: ComposedSourceFrame[] = cached?.key === key ? cached.sources : [];
  const path = (file: string, kind: 'original' | 'restyle') => `${kind}/${file.split('/').at(-1)}`;
  const fetchPart = (request: CokPlayerComponentRequest, kind: 'original' | 'restyle') =>
    fetchPinnedPng(plan.manifestId, path(request.file, kind), request.sha256,
      request.width, request.height, request.colorType);
  if (!sources.length) {
    // The two variant head locators retain distinct IDs and share this verified source PNG.
    const sourceHead = await fetchPart(plan.originalHead, 'original');
    try {
      const pixels = canvasPixels(sourceHead.bitmap);
      for (const frame of plan.frames) {
        const sourceBody = await fetchPart(frame.originalBody, 'original');
        try { sources.push(composeOriginal(canvasPixels(sourceBody.bitmap), pixels, appearance.paletteBytes, plan.headSize)); }
        finally { sourceBody.bitmap.close(); }
      }
    } finally { sourceHead.bitmap.close(); }
  }
  const original: CokPlayerAppearance = { id: plan.manifestId, frames: sources.map((source, index) => {
    const art = { ...source.original, pixels: new Uint8ClampedArray(source.original.pixels) };
    const frame = plan.frames[index]!;
    return { bodyBlockId: frame.bodyBlockId, original: art, restyle: null, pixelScale: manifest.pixelScale,
      canonical: frame.canonical,
      restyleStatus: frame.restyle
        ? { state: 'pending', headPath: path(frame.restyle.head.file, 'restyle'), bodyPath: path(frame.restyle.body.file, 'restyle') }
        : { state: 'not-admitted', headPath: '', bodyPath: '', component: 'body', reason: frame.reason } };
  }) };
  validatedSources.set(original, { key, sources });
  const failed = (frame: CokPlayerAppearanceFrame, component: 'head' | 'body', error: unknown): CokPlayerAppearanceFrame =>
    ({ ...frame, restyleStatus: { ...frame.restyleStatus, state: 'failed', component, error: error instanceof Error ? error.message : String(error) } });
  const restyleReady = (async (): Promise<CokPlayerAppearance> => {
    const frames = [...original.frames];
    const firstRestyle = plan.frames.find((frame) => frame.restyle)?.restyle;
    if (!firstRestyle) return { ...original, frames };
    let bitmap: ImageBitmap;
    try { bitmap = (await fetchPart(firstRestyle.head, 'restyle')).bitmap; }
    catch (error) { return { ...original, frames: frames.map((frame, index) => plan.frames[index]!.restyle
      ? failed(frame, 'head', error) : frame) }; }
    try {
      for (const [index, { restyle }] of plan.frames.entries()) {
        if (!restyle) continue;
        let optional: ImageBitmap | undefined;
        const frame = frames[index]!;
        try {
          optional = (await fetchPart(restyle.body, 'restyle')).bitmap;
          frames[index] = { ...frame, restyle: composeRestyle(optional, bitmap, sources[index]!),
            restyleStatus: { ...frame.restyleStatus, state: 'ready' } };
        } catch (error) { frames[index] = failed(frame, 'body', error); }
        finally { optional?.close(); }
      }
      return { ...original, frames };
    } finally { bitmap.close(); }
  })();
  return { original, restyleReady };
}

/** Completed-result wrapper retains strict mandatory-source validation for callers and tests. */
export async function loadCokPlayerAppearance(appearance: CokCharacterAppearanceRecord | undefined): Promise<CokPlayerAppearance | null> {
  return (await prepareCokPlayerAppearance(appearance))?.restyleReady ?? null;
}

export { resolveCokPlayerPresentation } from './cok-player-presentation.mjs';

export const COK_PLAYER_APPEARANCE_ID = manifest.appearances[0]!.appearanceId;
