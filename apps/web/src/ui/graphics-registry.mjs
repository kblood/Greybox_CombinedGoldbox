import { dokStoredDaxLayout } from './graphics-stored-dax.mjs';
import { DOK_PIXEL_NOTE, DOK_PIXEL_SCHEMA, dokPixelVisualRows } from './graphics-dok-pixel-transfer.mjs';

const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ordinal = (value) => Number.isSafeInteger(value) && value >= 0;
export function dokArchiveCategory(name) {
  return name === '8X8D1.DAX' || dokStoredDaxLayout(name) ? 'drawable'
    : /^WALLDEF[1-5]\.DAX$/.test(name) ? 'structural' : 'unsupported';
}

const DOK_VISUAL_SCHEMA = 'dok-dos-exact-pixel-visual-descriptions-v1';
const COK_DONOR = 'cok-dos-font-glyph-visual-descriptions-v1';
const DOK_VISUAL_PINS = {
  [`${COK_DONOR}.json`]: 'ab634a069908dc6ff0670866ba7550d9bd2c294bb023378219a6424ac806975b',
  'cok-graphics-identity-registry-v1.json': '103530666a8d6e8735b1c2c1a274429e7093db8b04606180313f548dd7dff9ec',
  'dok-graphics-identity-registry-v1.json': 'd99b2703c5afb8de0f075da763a40a52e4e5f6f1c19f71f25070a50e5ea79b9c',
  'dok-graphics-source-census-v1.json': 'f26d6ac40f8589a8c5bac00f67b85cf09152d90a9f2614bc3fbe40d53f53a236',
  'dok-graphics-source-roster-v1.json': '3c2a2716d7f88ade66b132f4f3a2099424ef8441042e11f01e647221679c5491',
};
const BLACK_TILE_CONTENT = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925';
const BLACK_RGB = '5d89f056865052bcb89c910d2d62872e029fb273c3db03f8968a52a41593c1b5';
const DOK_PREFIX = 'dok/dos-ega/dos-install/';
const DOK_GLYPH = `${DOK_PREFIX}8x8d1.dax/block/201/entry/0/glyph/`;
const COK_GLYPH = 'cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/';
const BLACK_TILES = new Set([
  '8x8d1.dax/block/203/entry/2/tile/13', '8x8d1.dax/block/1/entry/4/tile/14',
  '8x8d2.dax/block/3/entry/0/tile/14', '8x8d2.dax/block/4/entry/1/tile/14',
  '8x8d3.dax/block/5/entry/0/tile/14', '8x8d3.dax/block/6/entry/1/tile/14',
  '8x8d4.dax/block/2/entry/0/tile/14', '8x8d5.dax/block/7/entry/0/tile/14',
].map((suffix) => DOK_PREFIX + suffix));
const reviewRef = (schema, id) => `docs/engine/research/${schema}.json#${id}`;
const dokRosters = new WeakMap();
const sameFields = (actual, expected) => actual && Object.keys(actual).length === Object.keys(expected).length
  && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && actual[key] === value);

// The offline verifier hashes the pinned files and derives the sidecar from the full census.
// Composition checks the compact reviewed slice against the registry and original donor evidence.
function dokVisualRows(base, sidecar, donor) {
  const invalid = () => { throw new Error('Invalid source-only DoK visual-description sidecar'); };
  if (sidecar?.schema !== DOK_VISUAL_SCHEMA || Object.keys(sidecar).length !== 4
      || !sameFields(sidecar.inputSha256, DOK_VISUAL_PINS)
      || sidecar.reviewScope !== 'Visible appearance only. No character identity, subject, game use, playback, '
        + 'cross-version identity, Restyle lineage, or runtime admission is established.'
      || !Array.isArray(sidecar.assets) || sidecar.assets.length !== 185 || donor?.schema !== COK_DONOR || donor.version !== 1
      || donor.layout?.glyphWidth !== 8 || donor.layout.glyphHeight !== 8
      || !Array.isArray(donor.assets) || donor.assets.length !== 177) invalid();
  const baseById = new Map(base.assets.map((asset) => [asset.id, asset]));
  const byIndex = new Map(), byPixel = new Map();
  for (const row of donor.assets) {
    if (!row) invalid();
    const { glyphIndex, pixelSha256, sourceContentSha256, visualDescription } = row;
    const assetId = COK_GLYPH + glyphIndex;
    const asset = baseById.get(assetId);
    const reviewReference = reviewRef(COK_DONOR, assetId);
    const reviews = asset?.description?.evidence?.filter(({ kind }) => kind === 'visual-review');
    const note = `Visible 8×8 pixel pattern reviewed against source atlas SHA-256 ${donor.sourceAtlasSha256}; `
      + `stored glyph bytes SHA-256 ${sourceContentSha256} and decoded pixel SHA-256 ${pixelSha256}. `
      + 'Character/codepoint, subject, game use, selector, and playback semantics are not inferred.';
    if (!ordinal(glyphIndex) || glyphIndex >= 177 || byIndex.has(glyphIndex) || row.assetId !== assetId
        || !asset || asset.archive.sha256 !== donor.sourceArchiveSha256 || asset.locator.kind !== 'glyph'
        || asset.locator.glyphIndex !== glyphIndex || asset.sourcePixelSha256 !== pixelSha256
        || asset.sourceContentSha256 !== sourceContentSha256 || asset.description.visualDescription !== visualDescription
        || typeof visualDescription !== 'string' || !visualDescription.trim()
        || reviews?.length !== 1 || !sameFields(reviews[0], { kind: 'visual-review', reference: reviewReference, note })) invalid();
    byIndex.set(glyphIndex, row);
    const appearance = byPixel.get(pixelSha256) ?? { text: visualDescription, donors: new Map() };
    if (appearance.text !== visualDescription) invalid();
    appearance.donors.set(assetId, reviewReference);
    byPixel.set(pixelSha256, appearance);
  }
  const rows = new Map();
  const pixels = new Set();
  for (const row of sidecar.assets) {
    if (typeof row?.assetId !== 'string') invalid();
    const { assetId, kind, width, height, archiveSha256, pixelSha256, sourceContentSha256, visualDescription, donors } = row;
    const appearance = byPixel.get(pixelSha256);
    const glyph = assetId.startsWith(DOK_GLYPH) ? byIndex.get(Number(assetId.slice(DOK_GLYPH.length))) : undefined;
    const exactTarget = (kind === 'glyph' && glyph && assetId === DOK_GLYPH + glyph.glyphIndex
      && glyph.pixelSha256 === pixelSha256 && glyph.sourceContentSha256 === sourceContentSha256)
      || (kind === 'tile' && BLACK_TILES.has(assetId) && pixelSha256 === BLACK_RGB && sourceContentSha256 === BLACK_TILE_CONTENT);
    if (Object.keys(row).length !== 9 || !exactTarget || rows.has(assetId) || width !== 8 || height !== 8
        || !sha(archiveSha256) || !appearance || visualDescription !== appearance.text
        || !Array.isArray(donors) || donors.length !== appearance.donors.size
        || new Set(donors.map((ref) => ref?.assetId)).size !== donors.length
        || !donors.every((ref) => appearance.donors.has(ref?.assetId)
          && sameFields(ref, { assetId: ref.assetId, reviewReference: appearance.donors.get(ref.assetId) }))) invalid();
    rows.set(assetId, row);
    pixels.add(pixelSha256);
  }
  if (pixels.size !== 162) invalid();
  return rows;
}

function checkVisualDescription(asset, row) {
  const { description } = asset;
  if (!row) return Object.keys(description).length === 3
    && !Object.hasOwn(description, 'visualDescription') && description.evidence.length === 0;
  return Object.keys(description).length === 4 && asset.archive.sha256 === row.archiveSha256
    && (row.transfer || asset.locator.kind === row.kind)
    && asset.sourceContentSha256 === row.sourceContentSha256 && asset.sourcePixelSha256 === row.pixelSha256
    && description.visualDescription === row.visualDescription && description.evidence.length === 1
    && sameFields(description.evidence[0], {
      kind: 'visual-review', reference: reviewRef(row.transfer ? DOK_PIXEL_SCHEMA : DOK_VISUAL_SCHEMA, asset.id),
      note: row.transfer ? DOK_PIXEL_NOTE : 'Copied from previously reviewed exact pixels; no new DoK visual inspection.',
    });
}

/** Append checked source-only shards while preserving the base rows, order, and lineage. */
export function composeGraphicsRegistry(base, ...shards) {
  const ids = new Set(base.assets.map((row) => row.id));
  const groupIds = new Set(base.animationGroups.map((row) => row.id));
  const games = new Set(base.assets.map((row) => row.game));
  if (base.registryVersion !== 1 || ids.size !== base.assets.length || groupIds.size !== base.animationGroups.length) {
    throw new Error('Invalid base graphics registry');
  }
  const assets = [...base.assets], animationGroups = [...base.animationGroups];
  for (const { game, registry, checkAsset, exactVisualDescriptions, strict = false } of shards) {
    if (!/^[a-z0-9-]+$/.test(game) || games.has(game) || registry.registryVersion !== base.registryVersion
        || registry.restyles.length || registry.crossVersionLinks.length || registry.appearanceSets?.length
        || (exactVisualDescriptions !== undefined && game !== 'dok')) {
      throw new Error(`Invalid source-only graphics shard: ${game}`);
    }
    // DoK is not the current goal. If its pixel-transfer proof does not verify (for example because
    // the public build projects the CoK registry, which the proof pins raw), skip the whole DoK shard
    // before any shared state changes, so the CoK browser still starts. `strict` (tests and tools) rethrows
    // the same failure instead, so validators can be checked directly.
    const local = new Map(), grouped = new Set();
    let visuals;
    try {
      visuals = exactVisualDescriptions === undefined ? new Map()
        : dokVisualRows(base, exactVisualDescriptions?.sidecar, exactVisualDescriptions?.donor);
      if (exactVisualDescriptions?.transfer !== undefined) {
        for (const [id, row] of dokPixelVisualRows(base, registry, dokRosters.get(checkAsset), exactVisualDescriptions)) {
          if (visuals.has(id)) throw new Error('Invalid source-only DoK overlapping visual descriptions');
          visuals.set(id, row);
        }
      }
    } catch (error) {
      if (game !== 'dok' || strict) throw error;
      console.warn(`[graphics] DoK shard skipped: ${error.message}`);
      continue;
    }
    games.add(game);
    for (const asset of registry.assets) {
      if (asset.game !== game || !asset.id.startsWith(`${game}/`) || ids.has(asset.id)
          || asset.galleryReferences?.length || asset.gameConsumers.length || asset.description.status !== 'unknown'
          || asset.description.text !== '' || !checkVisualDescription(asset, visuals.get(asset.id))
          || !checkAsset(asset)) throw new Error(`Invalid source-only graphics asset: ${asset.id}`);
      ids.add(asset.id); local.set(asset.id, asset); assets.push(asset);
    }
    if (visuals.size && (local.size !== 2614 || [...visuals.keys()].some((id) => !local.has(id)))) {
      throw new Error('Invalid source-only DoK visual-description coverage');
    }
    for (const group of registry.animationGroups) {
      const firstFrame = local.get(group.frames[0]?.assetId);
      const storedEvidence = firstFrame && group.evidence?.length === 1 && sameFields(group.evidence[0], {
        kind: 'game-data',
        reference: `${firstFrame.archive.name}#entry/${firstFrame.locator.entryIndex}/block/${firstFrame.locator.blockId}`,
        note: 'Pinned DoK DOS archive; stored frame order only. No game use or playback meaning is established.',
      });
      if (!group.id.startsWith(`${game}/`) || groupIds.has(group.id) || group.frames.length < 2
          || (visuals.size && (!storedEvidence || Object.keys(group).length !== 6))
          || [group.semantics, group.playback, group.status].some((value) => value !== 'unknown')
          || !group.frames.every(({ assetId, order, role }, i) => order === i && role === `stored frame ${i}` && !grouped.has(assetId)
            && local.get(assetId)?.animationGroupId === group.id && local.get(assetId).locator.kind === 'block-frame'
            && local.get(assetId).locator.frameIndex === i
            && grouped.add(assetId))) {
        throw new Error(`Invalid source-only frame group: ${group.id}`);
      }
      groupIds.add(group.id); animationGroups.push(group);
    }
    if ([...local.values()].some((asset) => asset.animationGroupId !== null && !grouped.has(asset.id))) {
      throw new Error(`Unresolved source-only frame group: ${game}`);
    }
  }
  return { ...base, assets, animationGroups };
}

export function dokGraphicsAssetCheck(roster) {
  if (roster.schema !== 'dok-graphics-source-roster-v1' || roster.inventoryReference !== 'docs/dos-inventory.md'
      || roster.files.length !== 37) throw new Error('Invalid DoK graphics roster');
  const archives = new Map();
  let entries = 0;
  for (const pin of roster.files) {
    if (!/^[A-Z0-9]+\.DAX$/.test(pin.path) || archives.has(pin.path) || !sha(pin.sha256)
        || !ordinal(pin.bytes) || pin.bytes < 11 || !pin.tocBlockIds.length
        || !pin.tocBlockIds.every((block) => ordinal(block) && block <= 255)) throw new Error('Invalid DoK archive pin');
    archives.set(pin.path, pin);
    entries += pin.tocBlockIds.length;
  }
  if (entries !== 430) throw new Error('Invalid DoK TOC denominator');
  const check = (asset) => {
    const { archive, locator: loc } = asset;
    const pin = archives.get(archive.name);
    const layout = dokStoredDaxLayout(archive.name, loc.entryIndex, loc.blockId);
    if (!pin || !layout || archive.path !== pin.path || archive.sha256 !== pin.sha256
        || asset.platform !== 'DOS-EGA' || asset.edition !== 'DOS install' || asset.identityStatus !== 'source-pinned'
        || !sha(asset.sourceContentSha256) || !sha(asset.sourcePixelSha256) || asset.decoded !== null
        || loc.kind !== layout.kind || !ordinal(loc.entryIndex) || !ordinal(loc.blockId)
        || pin.tocBlockIds[loc.entryIndex] !== loc.blockId || !ordinal(loc[layout.field]) || loc[layout.field] >= layout.limit
        || ['frameIndex', 'tileIndex', 'cellIndex', 'glyphIndex'].some((field) => field !== layout.field && loc[field] != null)) return false;
    const entryId = `dok/dos-ega/dos-install/${pin.path.toLowerCase()}/block/${loc.blockId}/entry/${loc.entryIndex}`;
    return asset.id === `${entryId}/${layout.suffix}/${loc[layout.field]}`
      && (layout.profile === 'dos-complex-stored-frames'
        ? asset.animationGroupId === `${entryId}/stored-frame-set` || (loc.frameIndex === 0 && asset.animationGroupId === null)
        : asset.animationGroupId === null);
  };
  dokRosters.set(check, roster);
  return check;
}
