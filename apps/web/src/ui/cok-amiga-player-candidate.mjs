const ID = 'cok/amiga/candidate/chart-head5-body1';
const ARCHIVE = 'e17783a48aec7d7708bc3d3af4c7cc3adc496376d11aa4cf2abbea4ac9d1ce72';
const CELLS = [
  ['cok/amiga/disk2/lbm/chart.lbm/cell/67', 67, 144, 120, 'c16ae6024f26497cb3d5e0db63cdd8d6a8cb77f7042866717f4056dd3f4f5d41', '10b95930d6221318f2cc87831513e563305493f60927460fa6d0e894b43bc5ca'],
  ['cok/amiga/disk2/lbm/chart.lbm/cell/1', 1, 0, 0, 'd9cee48c65c0ef7579ad93979a73ba6dbd746218fae3836b0e3f7df3a8efb585', 'f9d1ca2fd376cee2597b988d443824c110986e22248831e844ff546d78743aab'],
  ['cok/amiga/disk2/lbm/chart.lbm/cell/32', 32, 168, 48, '4ee6edc24d17b246e40bee987544f1000f498cd165b6c04733b9d182a0b36fe2', 'afcd9411d9bcfe0a4d4c183397bb4f493887f7afd947835cc84f32a6580594a5'],
];
const SELECTORS = [1, 2, 3, 4, 6, 7];
function requireCandidate(condition) {
  if (!condition) throw new Error('Invalid CoK Amiga player candidate identity, pins or geometry');
}

/** Metadata validation is not retail provenance, pixel-hash verification or runtime admission. */
export function validateCokAmigaPlayerCandidate(candidate) {
  const a = candidate?.archive;
  requireCandidate(candidate?.schema === 'cok-amiga-player-candidate-v1' && candidate.id === ID
    && candidate.game === 'cok' && candidate.platform === 'Amiga'
    && candidate.atlasSelector === 2 && candidate.headSelector === 5 && candidate.bodySelector === 1
    && a?.path === 'disk2/charT.LBM' && a.sha256 === ARCHIVE && a.width === 320 && a.height === 200
    && a.planes === 5 && a.masking === 0 && candidate.cellSize?.width === 24 && candidate.cellSize.height === 24
    && candidate.provenance?.retailMedia === 'unverified' && candidate.provenance.runtimeObservation === 'unverified'
    && candidate.dosIdentityBridge === null && candidate.runtimeAdmission === 'held'
    && candidate.restyleAdmission === 'held' && candidate.playbackAdmission === 'held'
    && candidate.compositionReview?.status === 'unverified-hypothesis'
    && candidate.paletteMapping?.status === 'unverified' && candidate.paletteMapping.bytes === null
    && Array.isArray(candidate.cells) && candidate.cells.length === 3);
  candidate.cells.forEach((row, i) => {
    const [assetId, cell, x, y, raw, opaque] = CELLS[i];
    requireCandidate(row.assetId === assetId && row.cell === cell && row.x === x && row.y === y && row.rawSha256 === raw
      && row.opaqueSha256 === opaque && row.role === (i === 0 ? 'head' : 'body')
      && (i === 0 ? !Object.hasOwn(row, 'variant') : row.variant === i - 1));
  });
  return candidate;
}

/** Separate candidate selectors only: DOS tuples and number similarity cannot select this art. */
export function resolveCokAmigaPlayerCandidate(candidate, request) {
  try { validateCokAmigaPlayerCandidate(candidate); } catch { return null; }
  if (!request || Object.keys(request).sort().join('/') !== 'atlasSelector/bodySelector/candidateId/headSelector/variant'
      || request.candidateId !== ID || request.atlasSelector !== 2 || request.headSelector !== 5
      || request.bodySelector !== 1 || ![0, 1].includes(request.variant)) return null;
  return { candidateId: ID, headCell: 67, bodyCell: request.variant === 0 ? 1 : 32,
    variant: request.variant, runtimeAdmission: 'held', playbackAdmission: 'held', compositionStatus: 'hypothesis-only' };
}

/** Hypothesis-only model for hand-authored fixtures. No Amiga compositor is source-verified here.
 * No fetch, decoding or asset admission occurs. Supplied arrays are unauthenticated five-bit indices.
 */
export function composeCokAmigaPlayerCandidate(candidate, request, head, body,
  paletteBytes, remap = true) {
  const selection = resolveCokAmigaPlayerCandidate(candidate, request);
  requireCandidate(selection && typeof remap === 'boolean'
    && (remap ? Array.isArray(paletteBytes) && paletteBytes.length === 6
      && paletteBytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
      : paletteBytes === undefined || (Array.isArray(paletteBytes) && paletteBytes.length === 6
        && paletteBytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))));
  for (const [part, cell] of [[head, 67], [body, selection.bodyCell]]) {
    requireCandidate(part?.candidateId === ID && part.archiveSha256 === ARCHIVE && part.cell === cell
      && part.width === 24 && part.height === 24 && part.rawIndices instanceof Uint8Array
      && part.rawIndices.length === 576 && part.rawIndices.every((v) => v <= 31));
  }
  const mapping = Uint8Array.from({ length: 16 }, (_, i) => i);
  if (remap) SELECTORS.forEach((index, i) => {
    mapping[index] = paletteBytes[i] & 15;
    mapping[index + 8] = paletteBytes[i] >>> 4;
  });
  const indices = new Uint8Array(576), opaque = new Uint8Array(576);
  for (let i = 0; i < 576; i++) {
    const h = head.rawIndices[i], b = body.rawIndices[i];
    indices[i] = mapping[(h | b) & 15];
    // Hypothesis: the inverted fifth planes supply per-component opacity, combined with OR.
    // Opaque black and color 1 remain opaque when their fifth bit is clear.
    opaque[i] = Number((h & 16) === 0 || (b & 16) === 0);
  }
  return { width: 24, height: 24, indices, opaque, runtimeAdmission: 'held', compositionStatus: 'hypothesis-only' };
}
