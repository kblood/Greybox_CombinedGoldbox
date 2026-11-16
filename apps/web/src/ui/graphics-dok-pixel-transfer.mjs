// DoK source annotations are composed synchronously. Seal the compact admission
// inputs here; the Python verifier separately checks the original file bytes and PNGs.
const SHA256_ROUND = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotate = (word, bits) => (word >>> bits) | (word << (32 - bits));
function sha256(text) {
  const source = new TextEncoder().encode(text);
  const bytes = new Uint8Array(Math.ceil((source.length + 9) / 64) * 64);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(source.length / 0x20000000));
  view.setUint32(bytes.length - 4, source.length * 8);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let block = 0; block < bytes.length; block += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3))
        + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const first = h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25))
        + ((e & f) ^ (~e & g)) + SHA256_ROUND[i] + words[i];
      const second = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      h = g; g = f; f = e; e = (d + first) | 0;
      d = c; c = b; b = a; a = (first + second) | 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) state[i] += result[i];
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('');
}


// Two fixed pins, one per input form: the raw registry (dev and Node tests) and the public-projected
// registry that the production build serves (decision 142.2b; see goal file task 32).
const PROOF_SHA256 = Object.freeze([
  '2d1290595dfa468bdf2fa6f32256f0fdf6159ac24980f38bce752ec6a954d8f4',
  '1a09f4137516783d17b83c3d954549df9ea167357f4a96cc246ac89395ca76ed',
]);
export const DOK_PIXEL_SCHEMA = 'dok-dos-registry-pixel-visual-descriptions-v1';
export const DOK_PIXEL_NOTE = 'Prior CoK review: exact dimensions and RGB SHA-256; no new DoK inspection.';
const compare = (x, y) => x < y ? -1 : x > y ? 1 : 0;
const byAssetId = (a, b) => compare(a.assetId, b.assetId);
const byAppearance = (a, b) => a.width - b.width || a.height - b.height || compare(a.pixelSha256, b.pixelSha256);
const appearanceKey = ({ width, height, pixelSha256 }) => `${width}/${height}/${pixelSha256}`;
const canonicalJson = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

/** Bind both sidecars, the exact DoK rows, and the complete matching CoK donor records. */
export function dokPixelVisualRows(base, registry, roster, { transfer, sidecar, donor }) {
  const invalid = () => { throw new Error('Invalid source-only DoK pixel-transfer sidecar or registry proof'); };
  let normalized, pixels, proof;
  try {
    if (transfer?.schema !== DOK_PIXEL_SCHEMA || transfer.appearances?.length !== 335) invalid();
    normalized = [...transfer.appearances].sort(byAppearance).map((row) => ({
      ...row, targets: [...row.targets].sort(byAssetId), donorIds: [...row.donorIds].sort(),
    }));
    pixels = new Set(normalized.map(appearanceKey));
    const matches = base.assets.filter(({ decoded }) => decoded && pixels.has(appearanceKey(decoded)))
      .sort((a, b) => compare(a.id, b.id));
    if (matches.length !== 1215) invalid();
    proof = canonicalJson([
      registry, { ...roster, files: [...roster.files].sort((a, b) => compare(a.path, b.path)) },
      { ...sidecar, assets: [...sidecar.assets].sort(byAssetId).map((row) => ({
        ...row, donors: [...row.donors].sort(byAssetId),
      })) },
      { ...donor, assets: [...donor.assets].sort((a, b) => a.glyphIndex - b.glyphIndex) },
      { ...transfer, appearances: normalized }, matches,
    ]);
  } catch {
    invalid();
  }
  if (!PROOF_SHA256.includes(sha256(proof))) invalid();
  return new Map(normalized.flatMap(({ pixelSha256, visualDescription, targets }) =>
    targets.map((row) => [row.assetId, { ...row, pixelSha256, visualDescription, transfer: true }])));
}
