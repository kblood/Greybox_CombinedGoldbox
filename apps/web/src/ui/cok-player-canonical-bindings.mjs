import { cokPlayerFrameRestyleAdmission } from './cok-player-restyle-admission.mjs';

const HASH = /^[a-f0-9]{64}$/i;
const TUPLE_FIELDS = ['cHeadRequest', 'cBodyBlock', 'cBodySlot', 'suffixCode'];
const MANIFEST_PATH = 'apps/web/src/ui/cokPlayerAppearanceManifest.json';
const APPEARANCE_ID = /^cok-player-(?:[0-9a-f]{2}-){3}[0-9a-f]{2}$/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tupleKey = (row) => TUPLE_FIELDS.map((key) => row[key]).join('/');
const hash = (value) => typeof value === 'string' && HASH.test(value);
const deviceName = (value) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
function file(value) {
  if (typeof value !== 'string' || !value) return false;
  const parts = value.split('/');
  return parts.every((part, index) => {
    const name = index === parts.length - 1 && part.endsWith('.png') ? part.slice(0, -4) : part;
    return /^[A-Za-z0-9_-]+$/.test(name) && !deviceName(name);
  }) && parts.at(-1).endsWith('.png');
}

// Independently reviewed selector domain. Storage slot selects an alias, never a block offset.
function reviewedSelector(row) {
  if (!row || !TUPLE_FIELDS.every((field) => Number.isInteger(row[field]))) return null;
  const selectors = {
    '5/24/0/2': ['05-18-00-02', 'primary'], '5/24/2/2': ['05-18-00-02', 'storage-slot-alias'],
    '5/1/1/2': ['05-01-01-02', 'primary'],
    '5/23/4/2': ['05-17-04-02', 'primary'], '5/23/5/2': ['05-17-04-02', 'storage-slot-alias'],
    '3/11/3/1': ['03-0b-03-01', 'primary'],
  };
  const entry = selectors[tupleKey(row)];
  if (!entry) return null;
  const offset = row.suffixCode === 2 ? 64 : 0;
  return { manifestId: `cok-player-${entry[0]}`, role: entry[1],
    heads: [row.cHeadRequest + offset, row.cHeadRequest + offset + 128],
    bodies: [row.cBodyBlock + offset, row.cBodyBlock + offset + 128] };
}

function matchesReviewedAppearance(appearance, selector) {
  return selector && appearance?.appearanceId === selector.manifestId
    && same(appearance.head?.blockIds, selector.heads)
    && Array.isArray(appearance.bodyFrames)
    && same(appearance.bodyFrames?.map((part) => part.blockId), selector.bodies)
    && Array.isArray(appearance.sourceTuples)
    && appearance.sourceTuples.length === (['cok-player-05-18-00-02', 'cok-player-05-17-04-02']
      .includes(selector.manifestId) ? 2 : 1)
    && appearance.sourceTuples.every((tuple, index) => {
      const reviewed = reviewedSelector(tuple);
      return reviewed?.manifestId === selector.manifestId
        && reviewed.role === (index === 0 ? 'primary' : 'storage-slot-alias');
    });
}

function requireBinding(condition, label) {
  if (!condition) throw new Error(`Invalid CoK player canonical binding: ${label}`);
}

function unique(rows, count, key) {
  requireBinding(Array.isArray(rows) && rows.length === count, key);
  const result = new Map(rows.map((row) => [row[key], row]));
  requireBinding(result.size === count, `duplicate ${key}`);
  return result;
}

/** Check the compact generated projection against the independent player manifest and policy. */
export function validateCokPlayerCanonicalBindings(manifest, policy, projection) {
  const pins = projection?.inputSha256;
  requireBinding(projection?.schema === 'cok-player-canonical-bindings-v1'
    && pins && Object.keys(pins).length === 3 && ['manifest', 'policy', 'registry'].every((key) => hash(pins[key]))
    && Array.isArray(policy?.frames) && policy.frames.length === 8 && same(policy.frames, projection.admission)
    && manifest?.pixelScale === 4, 'header or admission pins');
  requireBinding(same(projection.settings, Object.fromEntries(
    ['sourceFrameSize', 'sourceMaskKey', 'paletteSelectorIndices', 'pixelScale', 'sourceContainers']
      .map((key) => [key, manifest[key]]))), 'source composition settings');
  const appearances = unique(manifest.appearances, 4, 'appearanceId');
  const sets = unique(projection.appearanceSets, 4, 'manifestId');
  const sources = unique(projection.sources, 12, 'id');
  const restyles = unique(projection.restyles, 10, 'id');
  for (const row of restyles.values()) {
    requireBinding(typeof row.id === 'string' && row.id.startsWith('restyle/')
      && Array.isArray(row.sourceAssetIds) && new Set(row.sourceAssetIds).size === row.sourceAssetIds.length
      && Array.isArray(row.outputs) && row.outputs.length > 0 && row.outputs.every((output) => hash(output?.sha256))
      && ['generated', 'runtime-admitted'].includes(row.reviewStatus), `Restyle row ${row.id}`);
  }
  const usedSources = new Set(), usedRestyles = new Set(), byTuple = new Map();
  let admitted = 0;
  const plans = [];

  function componentPlan(binding, role, block, part) {
    const family = role === 'head' ? 'chead' : 'cbody';
    const archive = `${family.toUpperCase()}.DAX`;
    const source = sources.get(binding?.assetId);
    requireBinding(binding?.role === role && Number.isInteger(block) && source?.game === 'cok'
      && source.platform === 'DOS-EGA' && source.edition === 'DOS'
      && source.id === `cok/dos-ega/install/${family}.dax/block/${block}/frame/0`
      && source.archive?.name === archive && source.archive.path === `Champions of Krynn/${archive}`
      && hash(source.archive.sha256) && source.archive.sha256 === manifest.sourceContainers?.[archive]?.toLowerCase()
      && source.locator?.kind === 'block-frame' && source.locator.blockId === block && source.locator.frameIndex === 0
      && source.locator.tileIndex === null && source.locator.cellIndex === null && source.locator.entryIndex == null,
    `${role} locator for block ${block}`);
    const decoded = source.decoded;
    requireBinding(file(part?.sourceFile) && file(part.restyleFile) && hash(part.sourceSha256) && hash(part.restyleSha256)
      && part.nativeWidth === 24 && (role === 'head' ? [8, 10].includes(part.nativeHeight) : part.nativeHeight === 24)
      && decoded?.width === part.nativeWidth * manifest.pixelScale
      && decoded.height === part.nativeHeight * manifest.pixelScale
      && decoded.sha256 === part.sourceSha256.toLowerCase(), `source image for ${source.id}`);
    // Check the complete set of matching Restyle IDs, including source membership. Matching
    // output bytes alone must never let a candidate attach to a different source locator.
    const outputHash = part.restyleSha256.toLowerCase();
    const matches = [...restyles.values()].filter((row) => row.sourceAssetIds?.includes(source.id)
      && row.outputs?.some((output) => output.sha256 === outputHash));
    requireBinding(matches.length > 0 && same(matches.map((row) => row.id).sort(), binding.restyleIds),
      `Restyle membership for ${source.id}`);
    usedSources.add(source.id);
    for (const row of matches) usedRestyles.add(row.id);
    return {
      sourceId: source.id, restyleIds: [...binding.restyleIds],
      original: { file: part.sourceFile, sha256: decoded.sha256.toUpperCase(), width: decoded.width, height: decoded.height, colorType: 2 },
      candidate: { file: part.restyleFile, sha256: outputHash.toUpperCase(), width: decoded.width, height: decoded.height, colorType: 6 },
    };
  }

  for (const [id, appearance] of appearances) {
    const set = sets.get(id);
    requireBinding(typeof id === 'string' && APPEARANCE_ID.test(id)
      && set?.id === `cok/dos-ega/appearance/${id.slice('cok-player-'.length)}`
      && set.game === 'cok' && set.platform === 'DOS-EGA'
      && set.sourceManifest?.path === MANIFEST_PATH && set.sourceManifest.sha256 === pins.manifest
      && Array.isArray(appearance.sourceTuples) && appearance.sourceTuples.length > 0
      && Array.isArray(set.acceptedTuples) && set.acceptedTuples.length === appearance.sourceTuples.length
      && set.variants?.length === 2 && appearance.head?.blockIds?.length === 2 && appearance.bodyFrames?.length === 2,
    `appearance set ${id}`);
    requireBinding(appearance.sourceTuples.every((tuple) =>
      matchesReviewedAppearance(appearance, reviewedSelector(tuple))), `reviewed selector blocks for ${id}`);
    const frames = set.variants.map((variant, index) => {
      requireBinding(variant?.index === index && variant.components?.length === 2, `variant order for ${id}`);
      const bodyPart = appearance.bodyFrames[index];
      const head = componentPlan(variant.components[0], 'head', appearance.head.blockIds[index], appearance.head);
      const body = componentPlan(variant.components[1], 'body', bodyPart.blockId, bodyPart);
      const admission = cokPlayerFrameRestyleAdmission(manifest, policy, id, index);
      requireBinding(index === 0 ? admission.state === 'admitted' : admission.state === 'not-admitted'
        && admission.reason === 'awaiting-prompt-and-composition-review', `policy decision for ${id}/${index}`);
      if (admission.state === 'admitted') admitted++;
      return { bodyBlockId: bodyPart.blockId, head, body, admission,
        restyle: admission.state === 'admitted' ? { head: head.candidate, body: body.candidate } : null };
    });
    const plan = { manifestId: id, appearanceSetId: set.id, frames };
    plans.push(plan);
    for (const [index, row] of set.acceptedTuples.entries()) {
      const expected = appearance.sourceTuples[index];
      const key = tupleKey(row);
      const reviewed = reviewedSelector(row);
      requireBinding(matchesReviewedAppearance(appearance, reviewed) && row.role === reviewed.role,
        `reviewed selector role for ${id}`);
      requireBinding(TUPLE_FIELDS.every((field) => Number.isInteger(row[field]) && row[field] === expected[field])
        && (index === 0 ? row.role === 'primary' && !Object.hasOwn(row, 'aliasOf')
          : row.role === 'storage-slot-alias' && row.aliasOf === 0) && !byTuple.has(key), `selector tuple for ${id}`);
      byTuple.set(key, plan);
    }
  }
  requireBinding(byTuple.size === 6 && usedSources.size === sources.size && usedRestyles.size === restyles.size
    && admitted === 4, 'coverage');
  return { plans, resolve: (row) => reviewedSelector(row) ? byTuple.get(tupleKey(row)) ?? null : null };
}

/** Unavailable canonical evidence blocks optional Restyles and keeps the DOS original path. */
export function tryCokPlayerCanonicalBindings(manifest, policy, projection) {
  try { return validateCokPlayerCanonicalBindings(manifest, policy, projection); }
  catch { return null; }
}

/** Produce exactly the requests the player loader can use, including DOS-only fallback. */
export function cokPlayerAppearanceFetchPlan(manifest, bindings, request) {
  const reviewed = reviewedSelector(request);
  if (!reviewed) return null;
  const key = tupleKey(request);
  const mapped = manifest.appearances.find((entry) => entry.sourceTuples.some((tuple) => tupleKey(tuple) === key));
  if (!matchesReviewedAppearance(mapped, reviewed)) return null;
  if (!file(mapped.head?.sourceFile) || mapped.bodyFrames.some((body) => !file(body?.sourceFile))) return null;
  const binding = bindings?.resolve(request);
  const canonical = binding?.manifestId === mapped.appearanceId ? binding : null;
  const dos = (part) => ({ file: part.sourceFile, sha256: part.sourceSha256, width: part.nativeWidth * manifest.pixelScale,
    height: part.nativeHeight * manifest.pixelScale, colorType: 2 });
  return {
    manifestId: mapped.appearanceId,
    headSize: { nativeWidth: mapped.head.nativeWidth, nativeHeight: mapped.head.nativeHeight },
    originalHead: canonical?.frames[0].head.original ?? dos(mapped.head),
    frames: mapped.bodyFrames.map((body, index) => {
      const frame = canonical?.frames[index];
      const restyle = frame?.restyle && file(frame.restyle.head?.file) && file(frame.restyle.body?.file)
        ? frame.restyle : null;
      return {
        bodyBlockId: body.blockId,
        canonical: canonical && frame ? { appearanceSetId: canonical.appearanceSetId,
          headSourceId: frame.head.sourceId, bodySourceId: frame.body.sourceId } : null,
        originalBody: frame?.body.original ?? dos(body),
        ...(restyle ? { candidateHeadPath: restyle.head.file, candidateBodyPath: restyle.body.file } : {}),
        restyle,
        reason: frame?.admission.reason ?? 'player-canonical-binding-unavailable',
      };
    }),
  };
}
