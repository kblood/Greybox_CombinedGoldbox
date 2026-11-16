// Shared browser/packager contract. src/input/prompt/expected_output are provenance,
// not runtime URLs: a comparison references only orig/<stem>.png and out/<stem>.png.
const safeName = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(value)
  && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(value);

export const RESTYLE_GAMES = Object.freeze({
  cok: 'Champions of Krynn',
  dok: 'Death Knights of Krynn',
  dqk: 'Dark Queen of Krynn',
  gateway: 'Gateway to the Savage Frontier',
  pool: 'Pools of Darkness',
});

// Bounded decoded image geometry also keeps all aspect/scale products exact JS integers.
export const MAX_IMAGE_DIMENSION = 32768;
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
export function validImageSize(width, height) {
  return [width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= MAX_IMAGE_DIMENSION)
    && width * height <= MAX_IMAGE_PIXELS;
}

export function validateRestyleManifest(manifest) {
  const invalid = (detail) => { throw new Error(`Invalid restyle manifest: ${detail}`); };
  if (!manifest || typeof manifest.batch !== 'string' || !manifest.batch
      || !Array.isArray(manifest.items) || !manifest.items.length) {
    invalid('batch and non-empty items are required');
  }
  const ids = new Set();
  const stems = new Set();
  for (const item of manifest.items) {
    if (!item || !safeName(item.id) || ids.has(item.id)) invalid('unsafe or duplicate item id');
    if (!safeName(item.stem) || stems.has(item.stem)) invalid(`${item.id}: unsafe or duplicate stem`);
    ids.add(item.id);
    stems.add(item.stem);
    if (typeof item.kind !== 'string' || typeof item.src !== 'string'
        || (item.description !== undefined && typeof item.description !== 'string')
        || (item.label !== undefined && typeof item.label !== 'string')
        || (item.game !== undefined && !Object.hasOwn(RESTYLE_GAMES, item.game))
        || !Number.isSafeInteger(item.k) || item.k <= 0
        || !validImageSize(item.native_w, item.native_h)
        || !validImageSize(item.native_w * item.k, item.native_h * item.k)) {
      invalid(`${item.id}: invalid comparison metadata`);
    }
    const sourceHash = item.sourceSha256;
    const outputHash = item.outputSha256;
    if ((sourceHash !== undefined || outputHash !== undefined)
        && (!/^[a-f0-9]{64}$/i.test(sourceHash ?? '') || !/^[a-f0-9]{64}$/i.test(outputHash ?? ''))) {
      invalid(`${item.id}: sourceSha256 and outputSha256 must be a complete SHA-256 pair`);
    }
  }
  return manifest;
}

// Explicit game metadata controls the collapsible sections; items without it remain in an
// "Other" group rather than being guessed from filenames or source paths.
export function groupRestyleItems(items) {
  const groups = new Map();
  for (const item of items) {
    const game = item.game ?? 'other';
    let members = groups.get(game);
    if (!members) { members = []; groups.set(game, members); }
    members.push(item);
  }
  const order = [...Object.keys(RESTYLE_GAMES), 'other'];
  return [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([game, members]) => ({ game, label: RESTYLE_GAMES[game] ?? 'Other games', items: members }));
}

// Optional fidelity, when supplied, must describe exactly this manifest's output pairs.
// This binds identity and size, not image content or the freshness of the recorded metrics.
export function validateRestyleFidelity(data, manifest) {
  validateRestyleManifest(manifest);
  const invalid = () => { throw new Error('Invalid restyle fidelity: ID/stem/size or metrics mismatch'); };
  if (!data || !Array.isArray(data.results) || data.results.length !== manifest.items.length
      || (data.missing !== undefined && (!Array.isArray(data.missing) || data.missing.length))) invalid();
  const items = new Map(manifest.items.map((item) => [item.stem, item]));
  const seen = new Set();
  for (const result of data.results) {
    const item = result && items.get(result.stem);
    if (!item || seen.has(result.stem) || result.id !== item.id
        || !['ok', 'FLAG'].includes(result.verdict)
        || ![result.edge_corr, result.hist_dist, result.aspect_dev].every(Number.isFinite)
        || !Array.isArray(result.size) || result.size.length !== 2
        || result.size[0] !== item.native_w * item.k || result.size[1] !== item.native_h * item.k
        || (result.k !== undefined && result.k !== item.k)) invalid();
    seen.add(result.stem);
  }
  return data;
}

// Exact batch01 IDs, verified against renders/imggen/webpack/batch01/manifest.json.
// The persistent manifest identifies itself as batch01+batch02; only for that union
// can batch02 be determined as its complement. Numeric stem prefixes overlap.
const PILOT_IDS = new Set([
  'logo_dok_dragonlance',
  'scene_cok_cottage',
  'scene_cok_draconian',
  'scene_dok_skeleton_dragon',
  'scene_dqk_riders',
  'face_cok_amiga_068',
  'face_cok_amiga_069',
  'face_cok_dos_068',
  'face_cok_dos_069',
  'band_cok_title_art',
  'band_dok_ssi_presents',
  'band_dqk_world_map',
]);
const BATCH03_IDS = new Set([
  'band_cok_dos_ssi_presents',
  'cok_dos_title_logo',
  'cok_dos_dragonlance_vol1',
  'face_cok_dos_pic1_015_f0',
  'scene_cok_dos_pic1_058_f0',
]);
const RUNTIME_IDS = new Set(['cok_overland_bigpic1_121', 'cok_demo_bigpic2_116']);

export function selectRestyleItems(manifest, batch) {
  validateRestyleManifest(manifest);
  if (!batch || batch === 'all' || batch === manifest.batch) return manifest.items;
  if (manifest.batch === 'batch01+batch02' && ['batch01', 'batch02'].includes(batch)) {
    const ids = new Set(manifest.items.map((item) => item.id));
    if (![...PILOT_IDS].every((id) => ids.has(id))) {
      throw new Error('Cannot determine exact batch membership: batch01 IDs are missing or changed');
    }
    return manifest.items.filter((item) => PILOT_IDS.has(item.id) === (batch === 'batch01'));
  }
  if (manifest.batch === 'batch01+batch02+batch03' && ['batch01', 'batch02', 'batch03'].includes(batch)) {
    const ids = new Set(manifest.items.map((item) => item.id));
    const coreIds = new Set([...PILOT_IDS, ...BATCH03_IDS]);
    if (![...coreIds].every((id) => ids.has(id))) {
      throw new Error('Cannot determine exact batch membership: batch01 or batch03 IDs are missing or changed');
    }
    const runtimePresent = [...RUNTIME_IDS].filter((id) => ids.has(id));
    if (runtimePresent.length && runtimePresent.length !== RUNTIME_IDS.size) {
      throw new Error('Cannot determine exact runtime membership: runtime IDs are missing or changed');
    }
    const excluded = new Set([...coreIds, ...runtimePresent]);
    return manifest.items.filter((item) => batch === 'batch01'
      ? PILOT_IDS.has(item.id)
      : batch === 'batch03' ? BATCH03_IDS.has(item.id) : !excluded.has(item.id));
  }
  if (manifest.batch === 'batch01+batch02+batch03' && batch === 'runtime') {
    const ids = new Set(manifest.items.map((item) => item.id));
    if (![...RUNTIME_IDS].every((id) => ids.has(id))) {
      throw new Error('Cannot determine exact runtime membership: runtime IDs are missing or changed');
    }
    return manifest.items.filter((item) => RUNTIME_IDS.has(item.id));
  }
  throw new Error(`Unavailable restyle batch: ${batch}`);
}
