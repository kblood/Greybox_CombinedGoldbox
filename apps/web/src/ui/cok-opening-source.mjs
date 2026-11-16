// DOM-free production admission for the existing reviewed cottage counterpart pilot.
export const COK_COTTAGE_BASE_SOURCE = Object.freeze({ game: 'cok', system: 'DOS-EGA', archive: 'BIGPIC1.DAX',
  archiveSha256: '34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec', blockId: 112, frameIndex: 0 });
export const COK_COTTAGE_SOURCE = Object.freeze({ game: 'cok', system: 'Amiga', archive: 'BIGPIC1.DAA',
  archiveSha256: '6267f07ad52f4a7bc6bdf958c5201e7b4e3bc826547ec3c7626579ee9bf89fed', blockId: 112, frameIndex: 0 });
export const COK_COTTAGE_RESTYLE = Object.freeze({ pictureId: 112, logicalId: 'opening.cottage',
  comparisonId: 'scene_cok_cottage', stem: '002_scene_cok_cottage', nativeWidth: 304, nativeHeight: 120,
  pixelScale: 6, sha256: 'fbe3b9e6db24c0d7a79ee07f3d254edbd4230de93e0975d1b776177787284e14' });
export const COK_COTTAGE_LINEAGE = Object.freeze({
  baseAssetId: 'cok/dos-ega/disk1/bigpic1.dax/block/112/frame/0',
  sourceAssetId: 'cok/amiga/disk2/bigpic1.daa/block/112/frame/0',
  baseRgbSha256: 'fef6d0c33eff530e9b4f09348205e3dbbf20718d13bbe6d66b08a81c1fbebae2',
  sourceRgbSha256: 'b771d56cc25e533e1689a083a61c5e503e3847e515849c5ba5d6d5f1be559a69',
  sourcePngSha256: 'e5cc5da1f6119f72ec85f4d0e80b6e14050da4aa45a7c69865da05041f2da020',
  inputSha256: '5134e1e03148c10b0548a0c572edba951cc2b03c13d12fd98428714ddd318bf2',
  promptSha256: '6c23a125998a4340cbd152dde4841b67ada4a4d92ce0a7c8904ffe57eacbb6ac',
});
const LIMIT = 8 * 1024 * 1024;
const sha = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  (byte) => byte.toString(16).padStart(2, '0')).join('');

export function matchesCokCottageSource(candidate, expected = COK_COTTAGE_BASE_SOURCE) {
  return !!candidate && candidate.game === expected.game && candidate.system === expected.system
    && candidate.archive === expected.archive && typeof candidate.archiveSha256 === 'string'
    && candidate.archiveSha256.toLowerCase() === expected.archiveSha256
    && candidate.blockId === expected.blockId && candidate.frameIndex === expected.frameIndex
    && candidate.blockSha256 === undefined;
}

export function createCokCottageSceneArt(baseSource, { loadRestyle, amigaVariant } = {}) {
  if (!matchesCokCottageSource(baseSource)) return undefined;
  if (typeof loadRestyle !== 'function') throw new Error('CoK cottage Restyle loader unavailable');
  const amigaOriginal = amigaVariant?.image;
  if (amigaVariant && (!matchesCokCottageSource(amigaVariant.source, COK_COTTAGE_SOURCE) || !amigaOriginal
      || amigaOriginal.width !== 304 || amigaOriginal.height !== 120
      || amigaOriginal.xOffset !== 0 || amigaOriginal.yOffset !== 0)) throw new Error('CoK cottage Amiga geometry differs');
  return { ref: { game: 'cok', logicalId: COK_COTTAGE_RESTYLE.logicalId },
    source: COK_COTTAGE_SOURCE, baseSource: COK_COTTAGE_BASE_SOURCE,
    pictureId: 112, comparisonId: COK_COTTAGE_RESTYLE.comparisonId, label: 'cottage', pixelScale: 6,
    x: 8, y: 8, amigaOrigin: { x: 8, y: 8 }, restyleRequiresAmigaOriginal: false,
    ...(amigaOriginal ? { amigaOriginal } : {}), loadRestyle };
}

/** Only the captured selected install is read. Missing/foreign/stale assets yield DOS fallback. */
export async function loadSelectedCokCottageOriginal({ assetSource, isCurrent, decode, rgba }) {
  if (!assetSource || !isCurrent()) return undefined;
  try {
    const input = await assetSource.readAsset('BIGPIC1.DAA');
    if (!input || !isCurrent()) return undefined;
    const bytes = new Uint8Array(input);
    if (await sha(bytes) !== COK_COTTAGE_SOURCE.archiveSha256 || !isCurrent()) return undefined;
    const archive = decode(bytes, 'BIGPIC1.DAA');
    const hits = archive.blocks.filter((block) => block.blockId === 112);
    const image = hits[0]?.image;
    if (archive.kind !== 'blocks' || hits.length !== 1 || !image || archive.frameSet.frames.get(112) !== image
        || image.width !== 304 || image.height !== 120 || image.xOffset !== 0 || image.yOffset !== 0
        || image.indices.length !== 304 * 120 || image.transparentIndex !== null) return undefined;
    // Freeze the admitted evidence against mutable decoder/installation buffers.
    const snapshot = { ...image, indices: new Uint8Array(image.indices),
      palette: image.palette && { ...image.palette, colors: image.palette.colors.map((color) => color && { ...color }) } };
    const pixels = rgba(snapshot);
    if (pixels.length !== 304 * 120 * 4) return undefined;
    const rgb = new Uint8Array(304 * 120 * 3);
    for (let i = 0; i < 304 * 120; i++) {
      if (pixels[i * 4 + 3] !== 255) return undefined;
      rgb.set(pixels.subarray(i * 4, i * 4 + 3), i * 3);
    }
    if (await sha(rgb) !== COK_COTTAGE_LINEAGE.sourceRgbSha256 || !isCurrent()) return undefined;
    return { source: COK_COTTAGE_SOURCE, image: snapshot };
  } catch { return undefined; }
}

/** Verify the approved opaque RGB PNG before any browser bitmap decoding. */
export async function validateCokCottageOutput(input) {
  const bytes = new Uint8Array(input);
  if (bytes.byteLength > LIMIT) throw new Error('CoK Restyle image exceeds size limit');
  if (bytes.byteLength < 33 || ![137,80,78,71,13,10,26,10].every((value,i) => bytes[i] === value)) {
    throw new Error('CoK Restyle image does not match reviewed output (PNG signature)');
  }
  const view = new DataView(bytes.buffer);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR'
      || view.getUint32(16) !== 1824 || view.getUint32(20) !== 720
      || bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) {
    throw new Error('CoK Restyle image has unreviewed PNG geometry/type');
  }
  if (await sha(bytes) !== COK_COTTAGE_RESTYLE.sha256) throw new Error('CoK Restyle image does not match reviewed output');
  return bytes;
}

/** The factory and existing renderer own mode choice; this guard also prevents unqualified requests. */
export async function requestCokCottageOutput({ mode, baseSource, fetchImage, url }) {
  if (mode !== 'Restyle' || !matchesCokCottageSource(baseSource)) return null;
  const response = await fetchImage(url);
  if (!response.ok) throw new Error(`CoK Restyle image unavailable (HTTP ${response.status})`);
  const mime = response.headers.get('content-type');
  if (mime && mime.split(';')[0].trim().toLowerCase() !== 'image/png') throw new Error('CoK Restyle image has unreviewed MIME type');
  if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('CoK Restyle image exceeds size limit');
  const bytes = await response.arrayBuffer();
  return validateCokCottageOutput(bytes);
}
