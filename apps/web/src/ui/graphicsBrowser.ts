import seed from '../../../../docs/engine/research/cok-graphics-identity-registry-v1.json';
import dokSeed from '../../../../docs/engine/research/dok-graphics-identity-registry-v1.json';
import dokRoster from '../../../../docs/engine/research/dok-graphics-source-roster-v1.json';
import dokVisualDescriptions from '../../../../docs/engine/research/dok-dos-exact-pixel-visual-descriptions-v1.json';
import dokPixelVisualDescriptions from '../../../../docs/engine/research/dok-dos-registry-pixel-visual-descriptions-v1.json';
import cokGlyphVisualDescriptions from '../../../../docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json';
import frameHypothesisSeed from '../../../../docs/engine/research/cok-graphics-frame-hypotheses-v1.json';
import atlasCellDescriptions from '../../../../docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json';
import { decodeDaa, decodeDax, decodeIlbm, indexedToRGBA, makeEgaPalette, readDaxDataBlocks, type DaaArchive, type DaxArchive, type IlbmImage, type IndexedImage } from '@goldbox/engine';
import { REVIEW_CATEGORIES, buildGraphicsReviewQueues, filterGraphicsReviewRows, pageGraphicsReviewRows,
  readGraphicsReviewQuery, writeGraphicsReviewQuery, type ReviewRow } from './graphics-review-queue.mjs';
import { validateCokGeneratedInventory, type CokGeneratedAsset, type CokGeneratedInventory } from './cok-generated-inventory.mjs';
import { paddedInputDescription, reviewedSourcePrompt } from './cok-batch02-prompt-lineage.mjs';
import { restyleAnimationsForSource } from './graphics-restyle-animations.mjs';
import { requireExactRestyleBinding, resolveCuratedCardSources, resolveExternalComparisonBinding, resolveGeneratedAliasBinding, verifyCurrentComparisonPair } from './graphics-alias-bindings.mjs';
import type { GraphicsBindingResult } from './graphics-alias-bindings.mjs';
import { addLocalAssetPackPicker, localAssetImageUrl, localAssetPackBytes, localAssetPackLabel, localAssetPackPinnedBytes } from './localAssetPack.js';
import { addLocalGameArchivePicker, addLocalGameFolderPicker, localGameArchiveCount, localGameArchiveRevision, readLocalGameArchive } from './localGameArchives.js';
import { createGraphicsArchiveCache } from './graphics-archive-cache.mjs';
import { selectDaaLocatorImage, selectDaxGlyphBytes, selectDaxLocatorImage, selectIlbmAtlasCell, selectIlbmLocatorImage } from './graphicsLocalArchive.mjs';
import { clearCoverageQuery, createCoverageLoader, summarizeCoverageForSources } from './graphics-coverage.mjs';
import type { SourceCoverageSummary } from './graphics-coverage.mjs';
import { buildSourceCensus, clearSourceCensusQuery, createSourceCensusLoader, readSourceCensusQuery, writeSourceCensusQuery } from './graphics-source-census.mjs';
import { resolveGraphicsAssetId } from './graphics-id-resolution.mjs';
import { validateGraphicsFrameHypotheses } from './graphics-frame-hypotheses.mjs';
import { createGraphicsCatalog } from './graphics-catalog.mjs';
import { buildVersionComparison } from './graphics-version-comparison.mjs';
import { buildVersionOverview, type VersionOverview } from './graphics-version-overview.mjs';
import { renderVersionOverview, type VersionOverviewState } from './graphicsVersionOverviewView.js';
import terrainRestyleManifest from './cokTerrainRestyleManifest.json';
import { cokTerrainDispositionForSource } from './graphics-runtime-dispositions.mjs';
import { graphicsRenderEvidence } from './graphics-render-evidence.mjs';
import { composeGraphicsRegistry, dokGraphicsAssetCheck } from './graphics-registry.mjs';
import { verifyStoredDaxChild } from './graphics-stored-dax.mjs';

type Evidence = { kind: string; reference: string; note?: string };
type Asset = {
  id: string; game: string; edition: string; platform: string;
  archive: { name: string; path: string; sha256: string | null };
  locator: { kind: string; blockId: number | null; entryIndex?: number | null; frameIndex: number | null; tileIndex: number | null; cellIndex: number | null; glyphIndex?: number | null };
  sourceContentSha256?: string;
  sourcePixelSha256?: string;
  decoded?: { path: string; sha256: string; pixelSha256?: string; width: number; height: number; transparentIndex?: number | null; renderingTransform?: string } | null;
  identityStatus: string;
  description: { text: string; visualDescription?: string; status: string; evidence: Evidence[] };
  gameConsumers: { status: string; use: string; evidence: Evidence[] }[];
  animationGroupId: string | null;
  galleryReferences?: { system: string; id: string; manifest: string; manifestSha256: string; sourceSha256: string; outputSha256: string; label: string; description: string | null; promptFile: string | null; inputFile: string | null }[];
};
type Restyle = {
  id: string; externalReferences?: { system: string; id: string; reference: string; outputSha256?: string }[];
  sourceAssetIds: string[]; sourceRelation: string;
  prompt: { status: string; batch: string | null; path: string | null; sha256: string | null; textSha256: string | null; inputPath: string | null; inputSha256: string | null; text: string | null; references: string[]; referenceAssetIds: string[] };
  outputs: { path: string; sha256: string; role: string }[];
  reviewStatus: string; evidence: Evidence[];
};
type AnimationGroup = { id: string; semantics: string; playback: string; status: string; evidence: Evidence[]; frames: { assetId: string; order: number; role: string }[] };
type AppearanceComponent = { role: 'head' | 'body'; assetId: string; restyleIds: string[] };
type AppearanceSet = {
  id: string; manifestId: string; game: string; platform: string;
  acceptedTuples: { cHeadRequest: number; cBodyBlock: number; cBodySlot: number; suffixCode: number; role: 'primary' | 'storage-slot-alias'; aliasOf?: number }[];
  variants: { index: number; components: AppearanceComponent[] }[];
  evidence: Evidence[]; unresolvedCoverage: string;
};
type Registry = { registryVersion: number; assets: Asset[]; animationGroups: AnimationGroup[]; restyles: Restyle[]; appearanceSets?: AppearanceSet[]; crossVersionLinks: { fromAssetId: string; toAssetId: string; relation: string; confidence: string; evidence: Evidence[] }[] };
export type CanonicalGraphicsSummary = { id: string; game: string; edition: string; platform: string; archiveName: string;
  locator: string; identityStatus: string; descriptionStatus: string; description: string; visualDescription: string;
  descriptionEvidence: Evidence[];
  gameConsumers: { status: string; use: string; evidence: Evidence[] }[];
  animationGroups: { id: string; semantics: string; status: string; playback: string;
    frames: { assetId: string; order: number; role: string }[] }[] };
export type CanonicalGraphicsCoverage = SourceCoverageSummary;
type LocalArchiveImage = IndexedImage | { width: number; height: number; rgba: Uint8ClampedArray };
type AtlasCellPin = { assetId: string; archiveSha256: string; cellIndex: number; rawIndexSha256: string; colorIndexSha256: string; opaqueMaskSha256: string; paletteRgbSha256: string; renderedRgbaSha256: string };
const atlasCellPins = new Map((atlasCellDescriptions as { assets: AtlasCellPin[] }).assets.map((pin) => [pin.assetId, pin]));

const localDaxArchives = createGraphicsArchiveCache<DaxArchive>(localGameArchiveRevision);
const localStoredDaxArchives = createGraphicsArchiveCache<ReturnType<typeof readDaxDataBlocks>>(localGameArchiveRevision);
const localDaaArchives = createGraphicsArchiveCache<DaaArchive>(localGameArchiveRevision);
const localIlbmImages = createGraphicsArchiveCache<IlbmImage>(localGameArchiveRevision);
const storedDaxPalette = makeEgaPalette();

function clearLocalArchiveCaches(): void {
  localDaxArchives.clear();
  localStoredDaxArchives.clear();
  localDaaArchives.clear();
  localIlbmImages.clear();
}

async function localStoredDaxImage(asset: Asset): Promise<IndexedImage | null> {
  if (!asset.archive.sha256 || !checkDokAsset(asset)) return null;
  const { name, sha256 } = asset.archive;
  const key = `${asset.game}\0${name}\0${sha256}`;
  const blocks = await localStoredDaxArchives.get(key, async () => {
    const bytes = await readLocalGameArchive(name, sha256, asset.game);
    if (!bytes) return null;
    try { return readDaxDataBlocks(bytes); } catch { return null; }
  });
  return blocks ? verifyStoredDaxChild(name, blocks, asset.locator, asset.sourceContentSha256,
    asset.sourcePixelSha256, storedDaxPalette).catch(() => null) : null;
}

async function localDaxImage(asset: Asset): Promise<IndexedImage | null> {
  if (!asset.archive.name.toLowerCase().endsWith('.dax') || !asset.archive.sha256 || asset.locator.blockId === null) return null;
  const key = `${asset.game}\0${asset.archive.sha256.toLowerCase()}\0${asset.archive.name.toLowerCase()}`;
  const archive = await localDaxArchives.get(key, async () => {
    const bytes = await readLocalGameArchive(asset.archive.name, asset.archive.sha256!, asset.game);
    if (!bytes) return null;
    try { return decodeDax(bytes, asset.archive.name); } catch { return null; }
  });
  if (!archive) return null;
  if (asset.locator.kind === 'glyph') {
    const stored = selectDaxGlyphBytes(archive, asset.locator);
    if (!stored || !asset.sourceContentSha256 || await bytesSha256(stored) !== asset.sourceContentSha256.toLowerCase()) return null;
  }
  const image = selectDaxLocatorImage(archive, asset.locator);
  const expectedPixels = asset.decoded?.pixelSha256 ?? asset.sourcePixelSha256;
  if (!image || (expectedPixels && await indexedRgbSha256(image) !== expectedPixels.toLowerCase())) return null;
  return image;
}

async function localDaaImage(asset: Asset): Promise<IndexedImage | null> {
  if (!asset.archive.name.toLowerCase().endsWith('.daa') || !asset.archive.sha256 || asset.locator.blockId === null) return null;
  const key = `${asset.game}\0${asset.archive.sha256.toLowerCase()}\0${asset.archive.name.toLowerCase()}`;
  const archive = await localDaaArchives.get(key, async () => {
    const bytes = await readLocalGameArchive(asset.archive.name, asset.archive.sha256!, asset.game);
    if (!bytes) return null;
    const candidateTailIds = [...new Set(registry.assets.filter((candidate) =>
      candidate.archive.name.toLowerCase() === asset.archive.name.toLowerCase()
      && candidate.archive.sha256?.toLowerCase() === asset.archive.sha256!.toLowerCase()
      && candidate.identityStatus === 'candidate'
      && candidate.decoded?.renderingTransform?.startsWith('candidate-tail-offset')
      && candidate.locator.blockId !== null).map((candidate) => candidate.locator.blockId!))];
    try {
      return decodeDaa(bytes, asset.archive.name, candidateTailIds.length ? { cokSpritTailBlockIds: candidateTailIds } : {});
    } catch { return null; }
  });
  if (!archive) return null;
  const image = selectDaaLocatorImage(archive, asset.locator);
  const expectedPixels = asset.decoded?.pixelSha256;
  if (!image || (expectedPixels && await indexedRgbSha256(image) !== expectedPixels.toLowerCase())) return null;
  return image;
}

async function localIlbmImage(asset: Asset): Promise<LocalArchiveImage | null> {
  if (!asset.archive.name.toLowerCase().endsWith('.lbm') || !asset.archive.sha256) return null;
  const key = `${asset.game}\0${asset.archive.sha256.toLowerCase()}\0${asset.archive.name.toLowerCase()}`;
  const ilbm = await localIlbmImages.get(key, async () => {
    const bytes = await readLocalGameArchive(asset.archive.name, asset.archive.sha256!, asset.game);
    if (!bytes) return null;
    try { return decodeIlbm(bytes, asset.archive.name); } catch { return null; }
  });
  if (!ilbm) return null;
  const image = selectIlbmLocatorImage(ilbm, asset.locator);
  if (image) {
    const expectedPixels = asset.decoded?.pixelSha256;
    if (expectedPixels && await indexedRgbSha256(image) !== expectedPixels.toLowerCase()) return null;
    return image;
  }
  if (asset.locator.kind !== 'atlas-cell' || asset.locator.cellIndex === null) return null;
  const pin = atlasCellPins.get(asset.id);
  if (!pin || pin.cellIndex !== asset.locator.cellIndex || pin.archiveSha256 !== asset.archive.sha256) return null;
  const cell = selectIlbmAtlasCell(ilbm, pin.cellIndex);
  if (!cell) return null;
  const checks: [(Uint8Array | Uint8ClampedArray), string][] = [
    [cell.rawIndices, pin.rawIndexSha256], [cell.colorIndices, pin.colorIndexSha256],
    [cell.opaqueMask, pin.opaqueMaskSha256], [cell.paletteRgb, pin.paletteRgbSha256], [cell.rgba, pin.renderedRgbaSha256],
  ];
  for (const [bytes, expected] of checks) {
    const hashInput = new Uint8Array(bytes.byteLength);
    hashInput.set(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', hashInput.buffer));
    const actual = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== expected.toLowerCase()) return null;
  }
  return { width: cell.width, height: cell.height, rgba: cell.rgba };
}

async function localArchiveImage(asset: Asset): Promise<LocalArchiveImage | null> {
  if (asset.game === 'dok') return localStoredDaxImage(asset);
  return asset.archive.name.toLowerCase().endsWith('.dax') ? localDaxImage(asset)
    : asset.archive.name.toLowerCase().endsWith('.daa') ? localDaaImage(asset)
      : asset.archive.name.toLowerCase().endsWith('.lbm') ? localIlbmImage(asset) : null;
}

async function bytesSha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function indexedRgbSha256(image: IndexedImage): Promise<string> {
  const rgba = indexedToRGBA(image, image.palette ?? null);
  const rgb = new Uint8Array(image.width * image.height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source]!; rgb[target++] = rgba[source + 1]!; rgb[target++] = rgba[source + 2]!;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgb.buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderArchiveCanvas(canvas: HTMLCanvasElement, image: LocalArchiveImage): void {
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const pixels = 'rgba' in image ? image.rgba : indexedToRGBA(image, image.palette ?? null);
  const data = context.createImageData(image.width, image.height);
  data.data.set(pixels); context.putImageData(data, 0, 0);
}

const cokRegistry = seed as Registry;
const checkDokAsset = dokGraphicsAssetCheck(dokRoster);
const registry = composeGraphicsRegistry(cokRegistry, { game: 'dok', registry: dokSeed, checkAsset: checkDokAsset,
  exactVisualDescriptions: { sidecar: dokVisualDescriptions, donor: cokGlyphVisualDescriptions, transfer: dokPixelVisualDescriptions } });
const loadSourceCensus = createSourceCensusLoader(async () => {
  const { default: report } = await import('../../../../docs/engine/research/cok-graphics-source-census-v1.json');
  return buildSourceCensus(report, cokRegistry.assets);
});
const loadDokSourceCensus = createSourceCensusLoader(async () => {
  const { default: report } = await import('../../../../docs/engine/research/dok-graphics-source-census-v1.json');
  return buildSourceCensus(report, registry.assets, dokRoster);
});
const catalog = createGraphicsCatalog(registry);
const gameLabels = new Map([['cok', 'Champions of Krynn'], ['dok', 'Death Knights of Krynn']]);
/** Return compact facts only for canonical IDs supplied by an exact gallery binding. */
export function getCanonicalGraphicsSummaries(sourceAssetIds: readonly string[]): (CanonicalGraphicsSummary | null)[] {
  return catalog.sourcesFor(sourceAssetIds).map((asset: Asset | null) => {
    return asset ? { id: asset.id, game: asset.game, edition: asset.edition, platform: asset.platform,
      archiveName: asset.archive.name, locator: fmtLocator(asset), identityStatus: asset.identityStatus,
      descriptionStatus: asset.description.status, description: asset.description.text,
      visualDescription: asset.description.visualDescription ?? '',
      descriptionEvidence: asset.description.evidence.map(({ kind, reference, note }) => ({ kind, reference, ...(note ? { note } : {}) })),
      gameConsumers: asset.gameConsumers.map(({ status, use, evidence }) => ({ status, use,
        evidence: evidence.map(({ kind, reference, note }) => ({ kind, reference, ...(note ? { note } : {}) })) })),
      animationGroups: catalog.animationGroupsFor(asset.id).map(({ id, semantics, status, playback, frames }) => ({
        id, semantics, status, playback, frames: frames.map(({ assetId, order, role }) => ({ assetId, order, role })),
      })) } : null;
  });
}
const frameHypothesisValidation = validateGraphicsFrameHypotheses(frameHypothesisSeed, cokRegistry);
const frameHypothesisIdsBySource = new Map<string, string[]>();
if (frameHypothesisValidation.status === 'ready') for (const hypothesis of frameHypothesisValidation.hypotheses) {
  for (const source of hypothesis.sources) {
    const ids = frameHypothesisIdsBySource.get(source.assetId) ?? [];
    ids.push(hypothesis.id);
    frameHypothesisIdsBySource.set(source.assetId, ids);
  }
}
const loadCoverage = createCoverageLoader(async () => {
  const [report, receipt] = await Promise.all([
    import('../../../../docs/engine/research/cok-runtime-art-coverage-v2.json'),
    import('../../../../docs/engine/research/cok-runtime-art-combat-sites-v2.json'),
  ]);
  return { report: report.default, receipt: receipt.default };
}, cokRegistry.assets);
/** Return validated bounded static use rows only when the coverage report pins this exact source. */
export async function getCanonicalGraphicsCoverage(sourceAssetIds: readonly string[]): Promise<CanonicalGraphicsCoverage[]> {
  return summarizeCoverageForSources(await loadCoverage(), sourceAssetIds);
}
declare const __REPO_ROOT__: string;
const IS_DEV = import.meta.env.DEV;
const sourceIdsByGalleryId = new Map<string, string[]>();
const sourceIdsByCuratedGalleryId = new Map<string, string[]>();
const curatedAliasesBySourceId = new Map<string, string[]>();
const galleryIdsBySourceId = new Map<string, string[]>();
const restyleSearchTermsBySourceId = new Map<string, string[]>();
for (const restyle of registry.restyles) {
  for (const reference of restyle.externalReferences ?? []) {
    if (reference.system !== 'cok-restyle-inventory-v1') continue;
    const sourceIds = sourceIdsByGalleryId.get(reference.id) ?? [];
    for (const sourceId of restyle.sourceAssetIds) {
      if (!sourceIds.includes(sourceId)) sourceIds.push(sourceId);
      const galleryIds = galleryIdsBySourceId.get(sourceId) ?? [];
      if (!galleryIds.includes(reference.id)) galleryIds.push(reference.id);
      galleryIdsBySourceId.set(sourceId, galleryIds);
    }
    sourceIdsByGalleryId.set(reference.id, sourceIds);
  }
  const terms = [restyle.prompt.text ?? '', ...restyle.outputs.map((output) => output.role)];
  for (const sourceId of restyle.sourceAssetIds) {
    const sourceTerms = restyleSearchTermsBySourceId.get(sourceId) ?? [];
    sourceTerms.push(...terms);
    restyleSearchTermsBySourceId.set(sourceId, sourceTerms);
  }
}
const tocEntriesByArchiveBlock = new Map<string, Set<number>>();
for (const asset of registry.assets) {
  const { blockId, entryIndex } = asset.locator;
  if (blockId === null || entryIndex === null || entryIndex === undefined) continue;
  const key = `${asset.archive.path}\0${asset.archive.sha256 ?? ''}\0${blockId}`;
  const entries = tocEntriesByArchiveBlock.get(key) ?? new Set<number>();
  entries.add(entryIndex);
  tocEntriesByArchiveBlock.set(key, entries);
}
for (const asset of registry.assets) {
  for (const reference of asset.galleryReferences ?? []) {
    if (reference.system !== 'cok-curated-restyle-v1') continue;
    const sourceIds = sourceIdsByCuratedGalleryId.get(reference.id) ?? [];
    if (!sourceIds.includes(asset.id)) sourceIds.push(asset.id);
    sourceIdsByCuratedGalleryId.set(reference.id, sourceIds);
    const aliases = curatedAliasesBySourceId.get(asset.id) ?? [];
    aliases.push(reference.id, reference.label, reference.description ?? '');
    curatedAliasesBySourceId.set(asset.id, aliases);
  }
}
const STYLE_ID = 'graphics-browser-style';
const SOURCE_PAGE_SIZE = 48;
let activeAnimationTimer: number | undefined;
let curatedOriginalPaths = new Map<string, string[]>();
let curatedRestylePaths = new Map<string, string[]>();
let currentCuratedStemsById = new Map<string, string>();
let generatedInventoryPromise: Promise<CokGeneratedInventory> | undefined;
type AliasBindingsSidecar = {
  generatedAliasRows: { rowId: string; inventoryAssetId: string; aliasKey: string; aliasHash: string; [key: string]: any }[];
  externalComparisonAliases: { rowId: string; inventoryAssetId: string; aliasKey: string; aliasHash: string; [key: string]: any }[];
  curatedCards: unknown[];
};
let aliasBindingsPromise: Promise<AliasBindingsSidecar> | undefined;
function loadAliasBindings(): Promise<AliasBindingsSidecar> {
  aliasBindingsPromise ??= import('../../../../docs/engine/research/cok-graphics-alias-bindings-v1.json')
    .then((module) => (module.default ?? module) as AliasBindingsSidecar)
    .catch((error) => { aliasBindingsPromise = undefined; throw error; });
  return aliasBindingsPromise;
}
const unresolvedBinding = (reason: string): GraphicsBindingResult => ({ status: 'unresolved', reason, sourceAssetIds: [], sources: [] });
async function verifyGalleryPair(sourcePath: string, outputPath: string, sourceSha256: string, outputSha256: string,
  devSourceUrl: string, devOutputUrl: string) {
  const [sourceBytes, outputBytes] = await Promise.all([
    localAssetPackPinnedBytes(sourcePath, sourceSha256),
    localAssetPackPinnedBytes(outputPath, outputSha256),
  ]);
  return verifyCurrentComparisonPair({
    ...(IS_DEV ? { sourceUrl: devSourceUrl, outputUrl: devOutputUrl } : {}),
    sourceBytes: sourceBytes ?? undefined, outputBytes: outputBytes ?? undefined,
    allowFetch: IS_DEV, expectedSourceSha256: sourceSha256, expectedOutputSha256: outputSha256,
  });
}
export type ResolvedGeneratedAlias = { aliasIndex: number; result: GraphicsBindingResult };

export async function resolveGeneratedGalleryAliases(item: CokGeneratedAsset): Promise<ResolvedGeneratedAlias[]> {
  try {
    const baseUrl = IS_DEV ? `/@fs/${__REPO_ROOT__.replace(/\\/g, '/')}/renders/restyle-site/restyle/cok-generated`
      : './restyle/cok-generated';
    const sourcePath = `images/${item.sourceSha256}.png`, outputPath = `images/${item.outputSha256}.png`;
    const currentPair = await verifyGalleryPair(`cok-generated/${sourcePath}`, `cok-generated/${outputPath}`,
      item.sourceSha256, item.outputSha256, `${baseUrl}/${sourcePath}`, `${baseUrl}/${outputPath}`);
    if (currentPair.status !== 'resolved') {
      return item.aliases.map((_, aliasIndex) => ({ aliasIndex,
        result: unresolvedBinding(currentPair.reason ?? 'Current generated image pair is unresolved.') }));
    }
    const sidecar = await loadAliasBindings();
    return item.aliases.map((alias, aliasIndex) => {
      const rowId = `generated/${item.id}/alias/${String(aliasIndex).padStart(3, '0')}`;
      const row = sidecar.generatedAliasRows.find((candidate) => candidate.rowId === rowId);
      if (!row) return { aliasIndex, result: unresolvedBinding('No source-binding row exists for this current alias position.') };
      const result = resolveGeneratedAliasBinding({ card: item, currentAlias: alias, aliasIndex,
        aliasFingerprint: { rowId, aliasKey: row.aliasKey, aliasHash: row.aliasHash }, sidecar, registry: cokRegistry });
      return { aliasIndex, result };
    });
  } catch (error) {
    return item.aliases.map((_, aliasIndex) => ({ aliasIndex,
      result: unresolvedBinding(`Exact alias evidence unavailable: ${error instanceof Error ? error.message : String(error)}`) }));
  }
}

export async function resolveExternalGalleryAlias(item: CokGeneratedInventory['externalComparisons'][number], alias: CokGeneratedInventory['externalComparisons'][number]['aliases'][number], aliasIndex: number): Promise<GraphicsBindingResult> {
  try {
    const sidecar = await loadAliasBindings();
    const rowId = `external/${item.id}/alias/${String(aliasIndex).padStart(3, '0')}`;
    const row = sidecar.externalComparisonAliases.find((candidate) => candidate.rowId === rowId);
    if (!row) return unresolvedBinding('No source-binding row exists for this current external alias position.');
    return resolveExternalComparisonBinding({ card: item, currentAlias: alias, aliasIndex,
      aliasFingerprint: { rowId, aliasKey: row.aliasKey, aliasHash: row.aliasHash }, sidecar, registry: cokRegistry });
  } catch (error) {
    return unresolvedBinding(`Exact alias evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resolveExternalGalleryCard(cardId: string, currentStem?: string): Promise<GraphicsBindingResult> {
  try {
    const inventory = await loadGeneratedInventory();
    const item = inventory.externalComparisons.find((comparison) => comparison.id === cardId);
    if (!item || (currentStem !== undefined && item.stem !== currentStem)) {
      return unresolvedBinding('No exact external comparison matches this current card ID and stem.');
    }
    const baseUrl = IS_DEV ? `/@fs/${__REPO_ROOT__.replace(/\\/g, '/')}/renders/restyle-site/restyle` : './restyle';
    const sourcePath = `orig/${item.stem}.png`, outputPath = `out/${item.stem}.png`;
    const currentPair = await verifyGalleryPair(sourcePath, outputPath, item.sourceSha256, item.outputSha256,
      `${baseUrl}/${sourcePath}`, `${baseUrl}/${outputPath}`);
    if (currentPair.status !== 'resolved') return unresolvedBinding(currentPair.reason ?? 'Current external comparison images are unresolved.');
    const resolved = await Promise.all(item.aliases.map((alias, index) => resolveExternalGalleryAlias(item, alias, index)));
    if (resolved.some((result) => result.status !== 'resolved')) {
      return unresolvedBinding(resolved.find((result) => result.status !== 'resolved')?.reason ?? 'External comparison alias is unresolved.');
    }
    const sourceIds = [...new Set(resolved.flatMap((result) => result.sourceAssetIds))];
    const sources = resolved.flatMap((result) => result.sources);
    return sourceIds.length ? { status: 'resolved', reason: null, sourceAssetIds: sourceIds, sources, cardId }
      : unresolvedBinding('External comparison has no exact source aliases.');
  } catch (error) {
    return unresolvedBinding(`Exact external comparison evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resolveCuratedGalleryCard(cardId: string, currentStem?: string): Promise<GraphicsBindingResult> {
  try {
    const sidecar = await loadAliasBindings();
    const card = sidecar.curatedCards.find((candidate: any) => candidate.cardId === cardId) as any;
    if (!card || card.status !== 'exact') return unresolvedBinding('Curated card has no exact gallery-source record.');
    const displayStem = currentStem ?? currentCuratedStemsById.get(cardId);
    if (!displayStem) return unresolvedBinding('Current comparison manifest has no item for this curated card ID.');
    if (card.stem !== displayStem) return unresolvedBinding('Current comparison stem does not match the exact curated card pair.');
    const baseUrl = IS_DEV ? `/@fs/${__REPO_ROOT__.replace(/\\/g, '/')}/renders/restyle-site/restyle`
      : './restyle';
    const expectedSourceSha256 = card.sourceHashes?.[0] ?? '';
    const expectedOutputSha256 = card.outputHashes?.[0] ?? '';
    const sourcePath = `orig/${displayStem}.png`, outputPath = `out/${displayStem}.png`;
    const currentPair = await verifyGalleryPair(sourcePath, outputPath, expectedSourceSha256, expectedOutputSha256,
      `${baseUrl}/${sourcePath}`, `${baseUrl}/${outputPath}`);
    if (currentPair.status !== 'resolved') return unresolvedBinding(currentPair.reason ?? 'Current curated image pair is unresolved.');
    const result = resolveCuratedCardSources({ cardId, sourceSha256: currentPair.sourceSha256!,
      outputSha256: currentPair.outputSha256!, sidecar, registry: cokRegistry });
    if (result.status !== 'resolved') return unresolvedBinding(result.reason ?? 'Curated source link is unresolved.');
    const sourceIds = result.sourceAssetIds, sources = result.sources;
    return sourceIds.length ? { status: 'resolved', reason: null, sourceAssetIds: sourceIds, sources, cardId }
      : unresolvedBinding('Curated card has no exact source links.');
  } catch (error) {
    return unresolvedBinding(`Exact curated evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resolveGeneratedGalleryCardForSource(cardId: string, sourceAssetId: string,
  restyleId: string, outputSha256: string): Promise<GraphicsBindingResult> {
  let item: CokGeneratedAsset | undefined;
  try {
    const inventory = await loadGeneratedInventory();
    item = inventory.assets.find((asset) => asset.id === cardId);
    if (!item) {
      const external = inventory.externalComparisons.find((comparison) => comparison.id === cardId);
      if (!external) return unresolvedBinding('Current gallery inventory has no card with this ID.');
      const resolved = await Promise.all(external.aliases.map((alias, index) => resolveExternalGalleryAlias(external, alias, index)));
      const exact = resolved.find((result) => requireExactRestyleBinding(result,
        { sourceAssetId, restyleId, outputSha256 }).status === 'resolved');
      return exact ?? unresolvedBinding(resolved.find((result) => result.status === 'unresolved')?.reason
        ?? 'No exact alias link connects this source, card, and Restyle output.');
    }
    const aliases = await resolveGeneratedGalleryAliases(item);
    const exact = aliases.find(({ result }) => requireExactRestyleBinding(result,
      { sourceAssetId, restyleId, outputSha256 }).status === 'resolved');
    return exact?.result ?? unresolvedBinding(aliases.find(({ result }) => result.status === 'unresolved')?.result.reason
      ?? 'No exact alias link connects this source, card, and Restyle output.');
  } catch (error) {
    return unresolvedBinding(`Exact gallery evidence unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function loadGeneratedInventory(): Promise<CokGeneratedInventory> {
  generatedInventoryPromise ??= (async () => {
    const local = await localAssetPackBytes('cok-generated/manifest.json');
    return local ? new Response(new Blob([new Uint8Array(local).buffer])) : fetch('./restyle/cok-generated/manifest.json');
  })().then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateCokGeneratedInventory(await response.json());
  }).catch((error) => {
    generatedInventoryPromise = undefined;
    throw error;
  });
  return generatedInventoryPromise;
}
const CSS = `
.gbx-page{max-width:1440px;margin:0 auto;padding:8px 12px 48px;color:var(--fg)}
.gbx-page h1{font-size:23px;color:var(--accent);margin:8px 0 5px}.gbx-lede,.gbx-muted{color:var(--muted);font-size:13px;line-height:1.5}
.gbx-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}.gbx-toolbar input,.gbx-toolbar select,.gbx-page button{background:var(--panel2);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:6px 9px;font:inherit}.gbx-toolbar input{min-width:min(460px,80vw)}
.gbx-toolbar[hidden],.gbx-layout[hidden]{display:none}
.gbx-layout{display:grid;grid-template-columns:minmax(220px,330px) minmax(0,1fr);gap:16px;align-items:start}.gbx-list,.gbx-panel,.gbx-card{background:var(--panel);border:1px solid var(--border);border-radius:6px}.gbx-list{position:sticky;top:12px;max-height:75vh;overflow:auto;padding:6px}.gbx-pick{display:block;width:100%;text-align:left;margin:2px 0;cursor:pointer;overflow-wrap:anywhere}.gbx-pick[aria-current=true]{border-color:var(--accent);color:var(--accent)}.gbx-pick small{display:block;color:var(--muted)}
.gbx-panel{padding:14px;min-width:0}.gbx-panel h2{font-size:18px;color:var(--accent2);margin:0 0 4px;overflow-wrap:anywhere}.gbx-meta{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.gbx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0}.gbx-card{padding:10px;min-width:0}.gbx-card h3{font-size:14px;color:var(--accent2);margin:0 0 6px}.gbx-card figure{margin:0}.gbx-card img,.gbx-card canvas{display:block;max-width:100%;max-height:310px;object-fit:contain;margin:5px auto;background:#080808;image-rendering:pixelated}.gbx-card figcaption,.gbx-small{font-size:11px;color:var(--muted);overflow-wrap:anywhere}.gbx-pill{display:inline-block;border:1px solid var(--border);border-radius:10px;padding:1px 7px;margin:3px 4px 2px 0;font-size:11px;color:var(--muted)}.gbx-unknown{color:#e8ad63}.gbx-card details{margin-top:8px}.gbx-card summary{cursor:pointer;color:var(--accent)}.gbx-evidence{font-size:11px;color:var(--muted);overflow-wrap:anywhere;margin:4px 0}.gbx-anim-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gbx-anim-controls input{width:min(360px,100%)}.gbx-empty{padding:18px;color:var(--muted)}
@media(max-width:760px){.gbx-layout{grid-template-columns:1fr}.gbx-list{position:static;max-height:32vh}}
`;

function elem<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function pill(text: string, extra = ''): HTMLElement { return elem('span', `gbx-pill ${extra}`.trim(), text); }
function heading(text: string): HTMLHeadingElement { return elem('h3', undefined, text); }
function fmtLocator(asset: Asset): string {
  const l = asset.locator;
  const tocKey = l.blockId === null ? '' : `${asset.archive.path}\0${asset.archive.sha256 ?? ''}\0${l.blockId}`;
  const tocEntries = [...(tocEntriesByArchiveBlock.get(tocKey) ?? [])].sort((a, b) => a - b);
  const occurrence = l.entryIndex === null || l.entryIndex === undefined ? 0 : tocEntries.indexOf(l.entryIndex) + 1;
  const entry = l.entryIndex === null || l.entryIndex === undefined ? ''
    : ` · TOC entry ${l.entryIndex + 1}${tocEntries.length > 1 ? ` (duplicate ${occurrence})` : ''}`;
  if (l.kind === 'block-frame') return `${asset.archive.name} #${l.blockId}${entry} · frame ${l.frameIndex}`;
  if (l.kind === 'tile') return `${asset.archive.name} #${l.blockId} · tile ${l.tileIndex}`;
  if (l.kind === 'atlas-cell') return `${asset.archive.name} #${l.blockId} · cell ${l.cellIndex}`;
  if (l.kind === 'glyph') return `${asset.archive.name} #${l.blockId} · stored glyph ${l.glyphIndex}`;
  return `${asset.archive.name} · whole image`;
}
function searchAliases(asset: Asset): string[] {
  if (asset.game !== 'cok') return [];
  const family = asset.archive.name.replace(/\.[^.]+$/, '');
  const block = asset.locator.blockId;
  if (block === null) return [family];
  const padded = String(block).padStart(3, '0');
  const frame = asset.locator.frameIndex;
  const glyph = asset.locator.glyphIndex;
  const entryIndex = asset.locator.entryIndex;
  const tocEntry = entryIndex === null || entryIndex === undefined ? null : entryIndex + 1;
  const tocKey = block === null ? '' : `${asset.archive.path}\0${asset.archive.sha256 ?? ''}\0${block}`;
  const duplicateEntries = [...(tocEntriesByArchiveBlock.get(tocKey) ?? [])].sort((a, b) => a - b);
  const duplicateOccurrence = entryIndex === null || entryIndex === undefined ? null : duplicateEntries.indexOf(entryIndex) + 1;
  return [family, `${family}_${padded}`, `${family}#${block}`, `${family}#${padded}`,
    ...(tocEntry === null ? [] : [`${family}#${block} toc ${tocEntry}`,
      ...(duplicateOccurrence === null ? [] : [`${family}#${block} entry ${duplicateOccurrence}`])]),
    ...(glyph === null || glyph === undefined ? [] : [`${family}_${padded}_g${glyph}`, `${family}#${block} glyph ${glyph}`]),
    ...(frame === null ? [] : [`${family}_${padded}_f${frame}`, `${family}#${block} frame ${frame}`,
      ...(duplicateOccurrence === null ? [] : [`${family}_${padded}_entry${duplicateOccurrence}_f${frame}`])])];
}
function restyleGalleryAliases(assetId: string): string[] {
  return galleryIdsBySourceId.get(assetId) ?? [];
}
export function sourceAssetIdsForRestyleGalleryCard(galleryId: string): string[] {
  return [...(sourceIdsByGalleryId.get(galleryId) ?? [])];
}
export function sourceAssetIdsForCuratedRestyleCard(galleryId: string): string[] {
  return [...(sourceIdsByCuratedGalleryId.get(galleryId) ?? [])];
}
function curatedRestyleAliases(assetId: string): string[] {
  return curatedAliasesBySourceId.get(assetId) ?? [];
}
const sourceSearchTextById = new Map(registry.assets.map((asset) => [asset.id, [asset.id,
  asset.archive.name, asset.archive.path, asset.platform, asset.edition, fmtLocator(asset),
  asset.description.text, asset.description.visualDescription ?? '', ...searchAliases(asset),
  ...restyleGalleryAliases(asset.id), ...curatedRestyleAliases(asset.id),
  ...asset.gameConsumers.flatMap((consumer) => [consumer.use, consumer.status,
    ...consumer.evidence.map((evidence) => evidence.note ?? '')]),
  ...(restyleSearchTermsBySourceId.get(asset.id) ?? [])].join(' ').toLocaleLowerCase()]));
function imageCandidates(path: string, hash: string | null | undefined): string[] {
  const out: string[] = [];
  if (hash) out.push(`./restyle/cok-generated/images/${hash}.png`);
  if (path && !/^[A-Za-z]:[\\/]/.test(path)) {
    const relative = path.replace(/^\/+/, '');
    out.push(`./restyle/${relative}`, `./restyle/cok/${relative}`);
  }
  return [...new Set(out)];
}
function normalizeSourcePath(path: string): string {
  let normalized = path.replace(/\\/g, '/').toLocaleLowerCase().replace(/^[a-z]:\//, '');
  const work = normalized.indexOf('cok_restyle_work/');
  if (work >= 0) normalized = normalized.slice(work + 'cok_restyle_work/'.length);
  if (normalized.startsWith('renders/')) normalized = normalized.slice('renders/'.length);
  if (normalized.startsWith('amiga_render_all/')) normalized = normalized.slice('amiga_render_all/'.length);
  return normalized;
}
function originalCandidates(asset: Asset): string[] {
  const decoded = asset.decoded;
  if (!decoded) return [];
  return [...imageCandidates(decoded.path, decoded.sha256), ...(curatedOriginalPaths.get(asset.id) ?? [])];
}
function restyleOutputCandidates(restyle: Restyle, output: Restyle['outputs'][number]): string[] {
  return [...new Set([...imageCandidates(output.path, output.sha256),
    ...(curatedRestylePaths.get(JSON.stringify([restyle.id, output.sha256])) ?? [])])];
}
function addImage(card: HTMLElement, title: string, candidates: string[], dimensions?: string, expectedSha256?: string, sourceAsset?: Asset): void {
  const fig = elem('figure');
  const img = elem('img');
  const canvas = elem('canvas');
  canvas.hidden = true;
  img.alt = title;
  img.hidden = true;
  const cap = elem('figcaption', undefined, `${title}${dimensions ? ` · ${dimensions}` : ''} · checking available copy…`);
  let provenance = '';
  let index = 0;
  const tryNext = () => {
    if (index >= candidates.length) {
      img.hidden = true;
      cap.textContent = `${title}${dimensions ? ` · ${dimensions}` : ''} · no matching image was found in the selected folders or site assets`;
      cap.classList.add('gbx-unknown');
      return;
    }
    img.src = candidates[index++];
  };
  img.addEventListener('load', () => { img.hidden = false; cap.textContent = `${title}${dimensions ? ` · ${dimensions}` : ''} · available${provenance}`; });
  img.addEventListener('error', tryNext);
  fig.append(img, canvas, cap);
  card.append(fig);
  void (async () => {
    const localImage = sourceAsset ? await localArchiveImage(sourceAsset) : null;
    if (!fig.isConnected) return;
    if (localImage) {
      renderArchiveCanvas(canvas, localImage); canvas.hidden = false; img.hidden = true;
      if (sourceAsset?.game === 'dok') {
        cap.textContent = `${title} · ${localImage.width}×${localImage.height} · archive, stored bytes and RGB SHA-256 verified`;
        return;
      }
      const isCandidate = sourceAsset!.identityStatus === 'candidate' || !!sourceAsset!.decoded?.renderingTransform;
      const decodeLabel = isCandidate
        ? `candidate ${sourceAsset!.decoded?.renderingTransform ?? 'render'}; archive SHA-256 and pinned candidate pixel hash verified`
        : sourceAsset!.locator.kind === 'glyph'
          ? 'exact archive SHA-256, stored glyph bytes and decoded pixel hash verified'
        : sourceAsset!.locator.kind === 'atlas-cell'
          ? `exact ${sourceAsset!.archive.name} SHA-256 and atlas index/color/mask/palette/RGBA hashes verified`
          : `exact ${sourceAsset!.archive.name} SHA-256${sourceAsset!.decoded?.pixelSha256 ? ' and decoded pixel hash verified' : ' verified; decoded pixel hash unrecorded'}`;
      cap.textContent = `${title}${dimensions ? ` · ${dimensions}` : ''} · ${decodeLabel}`;
      return;
    }
    if (sourceAsset?.game === 'dok') {
      cap.textContent = `${title} · choose the matching local DoK archive folder. Preview requires the exact archive and source hashes.`;
      cap.classList.add('gbx-unknown');
      return;
    }
    provenance = sourceAsset && /\.(dax|daa|lbm)$/i.test(sourceAsset.archive.name)
      ? ' · page preview; local archive decode or pinned pixel match is unavailable' : '';
    const localUrl = await localAssetImageUrl(candidates, expectedSha256);
    if (!fig.isConnected) return;
    if (localUrl) { provenance = ' · verified local Restyle image folder'; img.src = localUrl; }
    else if (IS_DEV) tryNext();
    else {
      cap.textContent = `${title}${dimensions ? ` · ${dimensions}` : ''} · select the local Restyle image folder to view this artwork`;
      cap.classList.add('gbx-unknown');
    }
  })();
}
function evidenceBlock(title: string, records: Evidence[]): HTMLElement {
  const details = elem('details');
  details.append(elem('summary', undefined, `${title} (${records.length})`));
  for (const e of records) details.append(elem('p', 'gbx-evidence', `${e.kind}: ${e.reference}${e.note ? ` — ${e.note}` : ''}`));
  return details;
}
function sourceImageCard(asset: Asset): HTMLElement {
  const card = elem('section', 'gbx-card');
  if (asset.game === 'dok') {
    const kind = asset.locator.kind === 'block-frame' ? 'frame' : asset.locator.kind;
    card.append(heading(`Stored source ${kind}`), elem('p', 'gbx-muted', 'Shows the stored EGA pixels without gameplay transformations.'));
    addImage(card, `Stored EGA ${kind}`, [], undefined, undefined, asset);
    return card;
  }
  const d = asset.decoded;
  const candidateTransform = d?.renderingTransform;
  const renderEvidence = graphicsRenderEvidence(asset);
  card.append(heading(renderEvidence?.title ?? (candidateTransform ? 'Candidate source render' : 'Original source')));
  if (d) addImage(card, candidateTransform ? 'Candidate decoded view' : 'Decoded original', originalCandidates(asset), `${d.width}×${d.height}`, d.sha256, asset);
  else if (asset.locator.kind === 'atlas-cell' && asset.locator.cellIndex !== null) {
    addImage(card, `Decoded atlas cell ${asset.locator.cellIndex}`, [], '24×24', undefined, asset);
  } else if (asset.locator.kind === 'glyph' && asset.locator.glyphIndex !== null && asset.locator.glyphIndex !== undefined) {
    addImage(card, `Decoded stored glyph ${asset.locator.glyphIndex}`, [], '8×8', undefined, asset);
  } else card.append(elem('p', 'gbx-muted', 'No decoded image path is recorded for this source.'));
  if (renderEvidence) {
    card.append(pill(renderEvidence.label, 'gbx-unknown'),
      elem('p', 'gbx-muted gbx-unknown', renderEvidence.explanation));
  }
  if (d?.transparentIndex !== undefined && d.transparentIndex !== null) {
    card.append(elem('p', 'gbx-small', `Transparent palette index: ${d.transparentIndex}`));
  }
  card.append(elem('p', 'gbx-small', `Archive: ${asset.archive.path} · ${asset.identityStatus}${asset.archive.sha256 ? ` · SHA-256 ${asset.archive.sha256}` : ''}`));
  return card;
}
function renderRestyleHubAnimations(panel: HTMLElement, asset: Asset, restyles: Restyle[]): void {
  const linked = restyles.filter((restyle) => restyle.externalReferences?.some((reference) => reference.system === 'cok-restyle-inventory-v1'));
  if (!linked.length) return;
  const card = elem('section', 'gbx-card'); card.dataset.restyleHubAnimations = 'true';
  card.append(heading('Restyle hub preview'));
  card.append(elem('p', 'gbx-muted', 'Preview playback follows the hub’s recorded order. Its cadence is a viewer control and does not establish the original game timing or animation meaning.'));
  card.append(elem('p', 'gbx-muted', 'Loading exact source and Restyle links…'));
  panel.append(card);
  void loadGeneratedInventory().then((inventory) => {
    if (!card.isConnected || !panel.contains(card)) return;
    const matches = restyleAnimationsForSource(asset, linked, inventory);
    card.replaceChildren(heading('Restyle hub preview'), elem('p', 'gbx-muted', 'Playback uses the recorded hub order and viewer cadence only; it does not establish the original game timing or animation meaning.'));
    if (!matches.length) {
      card.append(elem('p', 'gbx-muted gbx-unknown', 'No generated animation is linked through an exact source ID, Restyle record, inventory card and image hash.'));
      return;
    }
    for (const { restyleId, item, animation } of matches) {
      const section = elem('article', 'gbx-card'); section.dataset.animationId = animation.id;
      section.append(elem('h3', undefined, animation.label), elem('p', 'gbx-small', `${animation.id} · ${restyleId} · ${item.id}`));
      const controls = elem('div', 'gbx-anim-controls');
      const previous = elem('button', undefined, 'Previous step'); previous.type = 'button';
      const play = elem('button', undefined, 'Play'); play.type = 'button'; play.dataset.hubPlay = 'true';
      const stop = elem('button', undefined, 'Stop'); stop.type = 'button'; stop.dataset.hubStop = 'true';
      const next = elem('button', undefined, 'Next step'); next.type = 'button';
      const slider = elem('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(animation.playbackOrder.length - 1); slider.step = '1'; slider.value = '0';
      slider.setAttribute('aria-label', 'Select Restyle hub playback step');
      const label = elem('span', 'gbx-small'); label.dataset.hubFrame = 'true';
      const stage = elem('div', 'gbx-grid'); const frameCard = elem('div', 'gbx-card'); stage.append(frameCard);
      let step = 0;
      const showStep = (requested: number) => {
        step = (requested + animation.playbackOrder.length) % animation.playbackOrder.length;
        slider.value = String(step);
        const frameId = animation.playbackOrder[step];
        const frame = animation.frames[frameId];
        label.textContent = `Step ${step + 1}/${animation.playbackOrder.length} · ${frameId} · ${frame.note}`;
        frameCard.replaceChildren(heading(`${frameId} · ${frame.note}`));
        addImage(frameCard, `hub-${frameId}`, imageCandidates(`images/${frame.sha256}.png`, frame.sha256), `${frame.size[0]}×${frame.size[1]}`, frame.sha256);
      };
      previous.addEventListener('click', () => showStep(step - 1));
      next.addEventListener('click', () => showStep(step + 1));
      slider.addEventListener('input', () => showStep(Number(slider.value)));
      play.addEventListener('click', () => {
        if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
        activeAnimationTimer = window.setInterval(() => showStep(step + 1), 500);
      });
      stop.addEventListener('click', () => { if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer); activeAnimationTimer = undefined; });
      controls.append(previous, play, stop, next, slider, label); section.append(controls, stage);
      const playback = elem('details'); playback.append(elem('summary', undefined, 'Recorded playback order'), elem('p', 'gbx-small', animation.playbackOrder.join(' → ')),
        elem('p', 'gbx-small', `Evidence: ${animation.playbackEvidence}. ${animation.derivation}`)); section.append(playback);
      for (const [frameId, frame] of Object.entries(animation.frames)) {
        if (!frame.promptReference) continue;
        const prompt = elem('details'); prompt.append(elem('summary', undefined, `${frameId} prompt · ${frame.promptReference.file}`),
          elem('p', 'gbx-small', 'transform' in frame.promptReference
            ? `Prompt SHA-256 ${frame.promptReference.sha256} · ${paddedInputDescription(frame.promptReference)}`
            : `Prompt SHA-256 ${frame.promptReference.sha256} · input ${frame.promptReference.inputSha256} · output ${frame.promptReference.outputSha256}`),
          elem('pre', 'gbx-small', frame.promptReference.text));
        const pre = prompt.querySelector('pre'); if (pre) pre.style.whiteSpace = 'pre-wrap';
        section.append(prompt);
      }
      card.append(section); showStep(0);
    }
  }).catch((error) => {
    if (!card.isConnected || !panel.contains(card)) return;
    card.replaceChildren(heading('Restyle hub preview'), elem('p', 'gbx-muted gbx-unknown', `Generated hub inventory unavailable: ${error instanceof Error ? error.message : String(error)}`));
  });
}
function renderAsset(panel: HTMLElement, asset: Asset, onSelect: (asset: Asset) => void): void {
  if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
  activeAnimationTimer = undefined;
  panel.replaceChildren();
  const title = elem('h2', undefined, asset.id);
  panel.append(title, elem('div', 'gbx-meta', `${asset.game.toUpperCase()} · ${asset.edition} · ${asset.platform} · ${fmtLocator(asset)}`));
  panel.append(pill(`Description: ${asset.description.status}`, asset.description.status === 'unknown' ? 'gbx-unknown' : ''), pill(`Identity: ${asset.identityStatus}`));
  panel.append(elem('p', asset.description.status === 'unknown' ? 'gbx-muted gbx-unknown' : 'gbx-muted', asset.description.text));
  if (asset.description.visualDescription) panel.append(elem('p', 'gbx-muted', `Visible appearance: ${asset.description.visualDescription}`));
  else if (asset.game === 'dok') panel.append(elem('p', 'gbx-muted gbx-unknown', 'Visible appearance: not reviewed.'));
  panel.append(evidenceBlock('Description evidence', asset.description.evidence));

  const layout = elem('div', 'gbx-grid');
  layout.append(sourceImageCard(asset));
  const consumers = elem('section', 'gbx-card');
  consumers.append(heading('Game use / selectors'));
  if (!asset.gameConsumers.length) consumers.append(elem('p', 'gbx-muted gbx-unknown', 'Unknown — no consumer evidence recorded.'));
  for (const c of asset.gameConsumers) {
    consumers.append(pill(c.status, c.status === 'unknown' ? 'gbx-unknown' : ''), elem('p', 'gbx-muted', c.use), evidenceBlock('Use evidence', c.evidence));
  }
  layout.append(consumers);
  panel.append(layout);
  const terrainDisposition = cokTerrainDispositionForSource(asset, terrainRestyleManifest);
  if (terrainDisposition) {
    const terrainCard = elem('section', 'gbx-card');
    terrainCard.dataset.role = 'runtime-terrain-disposition';
    terrainCard.append(heading('Runtime terrain graphics'));
    if (terrainDisposition.status === 'preserved-source') {
      terrainCard.append(elem('p', 'gbx-muted', `Tile ${terrainDisposition.tileIndex}: preserved source tile; the Restyle pack intentionally keeps this empty tile unchanged.`));
    } else if (terrainDisposition.status === 'linked-restyle') {
      terrainCard.append(elem('p', 'gbx-muted', `Tile ${terrainDisposition.tileIndex}: Restyle output ${terrainDisposition.tile.stem} is declared for this exact runtime source.`));
    } else {
      terrainCard.append(elem('p', 'gbx-muted gbx-unknown', `Tile ${terrainDisposition.tileIndex}: manifest row exists, but its output declaration is incomplete.`));
    }
    terrainCard.append(elem('p', 'gbx-small', `Manifest: ${terrainRestyleManifest.archive}, block ${terrainRestyleManifest.blockId}, tile ${terrainDisposition.tileIndex} · source archive SHA-256 ${terrainRestyleManifest.sourceArchiveSha256} · row output SHA-256 ${terrainDisposition.tile.sha256}`));
    panel.append(terrainCard);
  }
  if (asset.game === 'dok') {
    const link = elem('a', undefined, 'Open this archive and entry in the source inventory');
    const params = new URLSearchParams(location.search);
    clearCoverageQuery(params);
    params.delete('id');
    link.href = `?${writeSourceCensusQuery(params, { ...readSourceCensusQuery(new URLSearchParams()), game: 'dok',
      set: 'dos-install', file: `dos-install/${asset.archive.name}`, entry: asset.locator.entryIndex ?? null })}${location.hash}`;
    panel.append(link);
  } else {
    const coverage = elem('details', 'gbx-card');
    coverage.dataset.sourceCoverage = 'true';
    coverage.append(elem('summary', undefined, 'Runtime use and fallback'));
    const coverageBody = elem('div');
    coverage.append(coverageBody);
    panel.append(coverage);
    let coverageRequested = false;
    coverage.addEventListener('toggle', () => {
      if (!coverage.open || coverageRequested || !coverage.isConnected) return;
      coverageRequested = true;
      coverageBody.textContent = 'Loading coverage…';
      void Promise.all([import('./graphicsCoverage.js'), loadCoverage()]).then(([ui, model]) => {
        if (!coverage.isConnected) return;
        ui.renderSourceCoverage(coverageBody, model, asset.id, (id) => {
          const source = registry.assets.find((candidate) => candidate.id === id);
          if (source) onSelect(source);
        });
      }).catch(() => {
        if (coverage.isConnected) coverageBody.textContent = 'Coverage unavailable. Source identities and Restyle records remain available.';
      });
    });
  }

  const comparison = buildVersionComparison(catalog, asset.id);
  if (comparison.members.length > 1 || comparison.unrecordedPlatforms.length || comparison.restyles.length) {
    const summary = elem('section', 'gbx-card');
    summary.append(heading('Version comparison (direct registry links only)'));
    summary.append(elem('p', 'gbx-small gbx-muted', 'Counterparts stay separate source identities. Pixel identity is not proof of shared subject or game use.'));
    for (const group of comparison.platforms) {
      for (const edition of group.editions) {
        const row = elem('p', 'gbx-small');
        row.append(pill(group.platform), document.createTextNode(` ${edition.edition}: ${edition.assetIds.length} source${edition.assetIds.length === 1 ? '' : 's'} `));
        for (const id of edition.assetIds) {
          const member = comparison.members.find((item) => item.assetId === id);
          const target = registry.assets.find((item) => item.id === id);
          const button = elem('button', undefined, id === asset.id ? `${id} (this)` : id);
          button.type = 'button';
          button.disabled = id === asset.id || !target;
          if (target) button.addEventListener('click', () => onSelect(target));
          row.append(button, document.createTextNode(' '));
          if (member?.restyleIds.length) row.append(pill(`${member.restyleIds.length} restyle`));
        }
        summary.append(row);
      }
    }
    for (const missing of comparison.unrecordedPlatforms) {
      summary.append(elem('p', 'gbx-small gbx-unknown', `${missing.platform}: no direct counterpart recorded. ${missing.note}`));
    }
    if (comparison.unverifiedLinkCount) summary.append(elem('p', 'gbx-small gbx-unknown', `${comparison.unverifiedLinkCount} counterpart link(s) are not verified.`));
    if (comparison.restyles.length) summary.append(elem('p', 'gbx-small', `Restyle candidate records across these sources: ${comparison.restyles.map((item) => item.id).join(', ')}`));
    panel.append(summary);
  }

  const links = catalog.crossVersionLinksFor(asset.id);
  if (links.length) {
    const related = elem('section', 'gbx-card');
    related.append(heading('Linked source versions / candidates (kept separate)'));
    for (const link of links) {
      const targetId = link.fromAssetId === asset.id ? link.toAssetId : link.fromAssetId;
      const target = registry.assets.find((item) => item.id === targetId);
      const version = elem('article', 'gbx-card');
      version.append(elem('h3', undefined, target?.id ?? targetId), pill(link.relation), pill(link.confidence));
      if (target) {
        version.append(elem('p', 'gbx-small', `${target.platform} · ${target.edition} · ${fmtLocator(target)}`));
        if (target.decoded) addImage(version, target.decoded.renderingTransform ? 'Linked candidate source render' : 'Linked source image', originalCandidates(target), `${target.decoded.width}×${target.decoded.height}`, target.decoded.sha256, target);
        const button = elem('button', undefined, `Open ${target.id}`);
        button.type = 'button'; button.addEventListener('click', () => onSelect(target)); version.append(button);
      }
      version.append(evidenceBlock('Link evidence', link.evidence));
      related.append(version);
    }
    panel.append(related);
  }

  const restyles = catalog.restylesFor(asset.id);
  const frameHypothesisIds = frameHypothesisIdsBySource.get(asset.id) ?? [];
  if (frameHypothesisIds.length) {
    const section = elem('section', 'gbx-card');
    section.append(heading(`Open frame hypotheses (${frameHypothesisIds.length})`));
    section.append(elem('p', 'gbx-muted gbx-unknown', 'These are unverified review leads, not confirmed animation memberships or game-use claims.'));
    for (const id of frameHypothesisIds) {
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('graphics', '1'); url.searchParams.set('review', 'frame-hypotheses'); url.searchParams.set('q', asset.id);
      url.hash = '';
      const link = elem('a', 'gbx-small', `Review ${id}`) as HTMLAnchorElement;
      link.dataset.role = 'frame-hypothesis-link';
      link.href = url.toString(); section.append(link);
    }
    panel.append(section);
  }
  const curatedReferences = (asset.galleryReferences ?? []).filter((reference) => reference.system === 'cok-curated-restyle-v1');
  if (curatedReferences.length) {
    const curatedSection = elem('section', 'gbx-card');
    curatedSection.append(heading(`Curated before/after cards (${curatedReferences.length})`));
    for (const reference of curatedReferences) {
      const row = elem('article', 'gbx-card');
      row.append(elem('p', 'gbx-small', `${reference.label} · ${reference.id}`));
      if (reference.description) row.append(elem('p', 'gbx-muted', reference.description));
      row.append(elem('p', 'gbx-small', `Exact source PNG ${reference.sourceSha256} · comparison output ${reference.outputSha256}`));
      const state = elem('p', 'gbx-small gbx-unknown', 'Checking exact source, output and gallery evidence…');
      state.dataset.role = 'curated-alias-resolution';
      row.append(state);
      void resolveCuratedGalleryCard(reference.id).then((result) => {
        if (!row.isConnected) return;
        if (result.status !== 'resolved') {
          state.textContent = `Unresolved gallery link: ${result.reason ?? 'exact evidence is unavailable'}`;
          return;
        }
        if (!result.sourceAssetIds.includes(asset.id)) {
          state.textContent = 'Unresolved gallery link: this source ID is not present in the exact curated source links.';
          return;
        }
        state.remove();
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('restyle', '1');
        url.searchParams.set('curated', reference.id);
        url.hash = '';
        const link = elem('a', 'gbx-small', 'Open exact curated Restyle card') as HTMLAnchorElement;
        link.dataset.role = 'exact-restyle-link'; link.href = url.toString(); row.append(link);
      });
      curatedSection.append(row);
    }
    panel.append(curatedSection);
  }
  const restyleSection = elem('section', 'gbx-card');
  const restyleOutputGroups = catalog.restyleOutputGroupsFor(asset.id);
  restyleSection.append(heading(`Restyle lineage (${restyles.length} records · ${restyleOutputGroups.length} distinct output hashes)`));
  if (!restyles.length) restyleSection.append(elem('p', 'gbx-muted gbx-unknown', 'No Restyle lineage is linked to this source ID in the current seed.'));
  const shownRestyleOutputHashes = new Set<string>();
  for (const restyle of restyles) {
    const item = elem('article', 'gbx-card');
    item.append(elem('h3', undefined, restyle.id), pill(restyle.sourceRelation), pill(restyle.reviewStatus));
    for (const reference of restyle.externalReferences ?? []) {
      item.append(elem('p', 'gbx-small', `Restyle gallery ID: ${reference.id} · ${reference.system} · ${reference.reference}`));
      if (reference.system === 'cok-restyle-inventory-v1' || reference.system === 'cok-runtime-comparison-v1') {
        const state = elem('p', 'gbx-small gbx-unknown', 'Checking exact source, output and card evidence…');
        state.dataset.role = 'generated-alias-resolution'; item.append(state);
        void resolveGeneratedGalleryCardForSource(reference.id, asset.id, restyle.id, reference.outputSha256 ?? '').then((result) => {
          if (!item.isConnected) return;
          if (result.status !== 'resolved') {
            state.textContent = `Unresolved gallery link: ${result.reason ?? 'exact evidence is unavailable'}`;
            return;
          }
          state.remove();
          const url = new URL(location.href);
          url.search = '';
          url.searchParams.set('restyle', '1');
          url.searchParams.set('gallery', reference.id);
          url.hash = `rs-gallery-${reference.id}`;
          const link = elem('a', 'gbx-small', 'Open exact Restyle card') as HTMLAnchorElement;
          link.dataset.role = 'exact-restyle-link'; link.href = url.toString(); item.append(link);
        });
      }
    }
    if (restyle.sourceAssetIds.length > 1) {
      const shared = elem('p', 'gbx-muted', `This output is linked to multiple distinct source IDs: ${restyle.sourceAssetIds.join(' · ')}`);
      item.append(shared);
      for (const sourceId of restyle.sourceAssetIds) {
        if (sourceId === asset.id) continue;
        const other = registry.assets.find((entry) => entry.id === sourceId);
        if (other) {
          const openOther = elem('button', undefined, `Open source ${other.id}`); openOther.type = 'button';
          openOther.addEventListener('click', () => onSelect(other)); item.append(openOther);
        }
      }
    }
    const reviewedPrompt = reviewedSourcePrompt(asset, restyle);
    if (reviewedPrompt) {
      const details = elem('details');
      const pre = elem('pre', 'gbx-small', reviewedPrompt.text); pre.style.whiteSpace = 'pre-wrap';
      details.append(elem('summary', undefined, `${reviewedPrompt.batch} prompt · ${reviewedPrompt.file}`),
        elem('p', 'gbx-small', `Prompt SHA-256 ${reviewedPrompt.sha256} · ${paddedInputDescription(reviewedPrompt)}`), pre);
      item.append(details);
    } else if (restyle.prompt.status === 'linked-full-text' && restyle.prompt.text) {
      item.append(elem('p', 'gbx-muted', `Prompt (${restyle.prompt.batch ?? 'batch unknown'}): ${restyle.prompt.text}`));
    } else {
      const promptState = restyle.prompt.status === 'linked-hash-only'
        ? `Prompt text unavailable; exact prompt file is ${restyle.prompt.path ?? 'not recorded'}${restyle.prompt.sha256 ? ` (SHA-256 ${restyle.prompt.sha256})` : ''}.`
        : 'Prompt is unknown; no exact prompt text or file is linked.';
      item.append(elem('p', 'gbx-muted gbx-unknown', promptState));
    }
    if (restyle.prompt.inputPath || restyle.prompt.inputSha256) {
      const input = elem('div', 'gbx-small', `Generation input: ${restyle.prompt.inputPath ?? 'path unknown'}`);
      item.append(input);
      if (restyle.prompt.inputSha256) addImage(item, 'Restyle input', imageCandidates(restyle.prompt.inputPath ?? '', restyle.prompt.inputSha256), undefined, restyle.prompt.inputSha256);
    }
    for (const output of restyle.outputs) {
      const out = elem('div', 'gbx-card');
      out.append(elem('p', 'gbx-small', `${output.role} · ${output.path}`));
      const group = restyleOutputGroups.find((row) => row.sha256 === output.sha256.toLowerCase());
      const duplicateUses = group?.uses.filter((use) => use.restyle.id !== restyle.id || use.output.role !== output.role) ?? [];
      if (duplicateUses.length) {
        const duplicateList = duplicateUses.map((use) => `${use.restyle.id} (${use.output.role}; ${use.restyle.reviewStatus})`).join(' · ');
        out.append(elem('p', 'gbx-muted', `Exact same output bytes are also linked by: ${duplicateList}. One preview per SHA-256 is shown; source IDs and review states remain separate.`));
      }
      if (!shownRestyleOutputHashes.has(output.sha256.toLowerCase())) {
        shownRestyleOutputHashes.add(output.sha256.toLowerCase());
        addImage(out, output.role, restyleOutputCandidates(restyle, output), undefined, output.sha256);
      } else out.append(elem('p', 'gbx-muted', `Preview is the same SHA-256 already shown above: ${output.sha256}.`));
      item.append(out);
    }
    item.append(evidenceBlock('Restyle evidence', restyle.evidence));
    restyleSection.append(item);
  }
  panel.append(restyleSection);
  const reuse = catalog.inspectRestyleReuse(asset.id);
  const reuseSection = elem('section', 'gbx-card');
  reuseSection.dataset.role = 'restyle-reuse-inspector';
  reuseSection.dataset.generationRecommendation = reuse.generationRecommendation;
  reuseSection.append(heading(`Restyle reuse review (${reuse.alreadyLinkedOutputs.length} linked outputs · ${reuse.possibleReuse.length} possible reuse · ${reuse.unresolvedLineage.length} unresolved)`));
  reuseSection.append(elem('p', 'gbx-muted', 'Only direct verified pixel-identical source links are listed as possible reuse. They are review leads, not assignments or runtime approvals. Missing output lineage does not recommend generating another image.'));
  for (const group of reuse.alreadyLinkedOutputs) {
    const linked = elem('p', 'gbx-small');
    linked.textContent = `Already linked to this source · ${group.sha256} · ${group.uses.map((use) => `${use.restyle.id} (${use.output.role}; ${use.restyle.reviewStatus})`).join(' · ')}`
      + (group.otherByteIdenticalUses.length ? ` · same output bytes also occur in ${group.otherByteIdenticalUses.map((use) => `${use.restyle.id} (${use.output.role})`).join(' · ')}` : '');
    linked.dataset.role = 'restyle-reuse-linked-output'; reuseSection.append(linked);
  }
  for (const candidate of reuse.possibleReuse) {
    const row = elem('article', 'gbx-card'); row.dataset.role = 'restyle-reuse-candidate'; row.dataset.outputSha256 = candidate.sha256;
    row.append(elem('p', 'gbx-small', `Possible existing output · SHA-256 ${candidate.sha256} · ${candidate.uses.length} direct source/Restyle record(s)`));
    row.append(elem('p', 'gbx-muted gbx-unknown', candidate.reason));
    const lineage = elem('details');
    lineage.append(elem('summary', undefined, `Review exact source/output lineage (${candidate.uses.length})`));
    for (const use of candidate.uses) {
      const evidence = elem('div', 'gbx-card');
      evidence.append(elem('p', 'gbx-small', `${use.sourceId} · ${use.restyle.id} · ${use.output.role} · review ${use.restyle.reviewStatus} · prompt ${use.restyle.prompt?.status ?? 'unknown'}`));
      const peer = catalog.source(use.sourceId);
      if (peer) {
        const open = elem('button', undefined, `Review source ${peer.id}`); open.type = 'button'; open.addEventListener('click', () => onSelect(peer)); evidence.append(open);
      }
      lineage.append(evidence);
    }
    row.append(lineage);
    const use = candidate.uses[0];
    if (use) addImage(row, `Possible reuse · ${use.output.role}`,
      restyleOutputCandidates(use.restyle, use.output), undefined, candidate.sha256);
    reuseSection.append(row);
  }
  for (const unresolved of reuse.unresolvedLineage) {
    const row = elem('p', 'gbx-muted gbx-unknown', `${unresolved.sourceId}: ${unresolved.reason}`);
    row.dataset.role = 'restyle-reuse-unresolved'; reuseSection.append(row);
  }
  panel.append(reuseSection);
  renderRestyleHubAnimations(panel, asset, restyles);

  const appearanceMemberships = catalog.appearanceMembershipsFor(asset.id).reduce((groups, membership) => {
    const existing = groups.find((row) => row.appearance.id === membership.appearance.id);
    const label = `variant ${membership.variantIndex + 1} ${membership.role}`;
    if (existing) existing.memberships.push(label);
    else groups.push({ appearance: membership.appearance, memberships: [label] });
    return groups;
  }, [] as { appearance: AppearanceSet; memberships: string[] }[]);
  if (appearanceMemberships.length) {
    const appearanceSection = elem('section', 'gbx-card'); appearanceSection.append(heading('Character appearance sets'));
    for (const { appearance, memberships } of appearanceMemberships) {
      const row = elem('article', 'gbx-card'); row.append(elem('p', 'gbx-small', `${appearance.id} · ${memberships.join(', ')}`));
      const url = new URL(location.href); url.search = ''; url.searchParams.set('graphics', '1'); url.searchParams.set('appearance', appearance.id); url.hash = '';
      const link = elem('a', 'gbx-small', 'Open appearance set') as HTMLAnchorElement; link.href = url.toString(); row.append(link);
      appearanceSection.append(row);
    }
    panel.append(appearanceSection);
  }

  const animation = asset.animationGroupId ? catalog.animationGroupsFor(asset.id).find((group) => group.id === asset.animationGroupId) : undefined;
  if (asset.animationGroupId) {
    const animationCard = elem('section', 'gbx-card');
    animationCard.append(heading(asset.game === 'dok' ? 'Stored frame order' : 'Animation / frame relationship'));
    if (!animation) {
      animationCard.append(elem('p', 'gbx-muted gbx-unknown', `Animation group ${asset.animationGroupId} is referenced, but its group record is missing.`));
    } else {
      const semantics = animation.semantics === 'time-animation'
        ? 'Temporal animation: frames advance over time.'
        : animation.semantics === 'zoom-distance'
          ? 'Zoom/distance set: choose a view by distance; these frames are not a time animation.'
          : `Frame relationship: ${animation.semantics}; playback meaning ${animation.playback}.`;
      animationCard.append(pill(animation.semantics), pill(animation.playback), pill(animation.status), elem('p', 'gbx-muted', semantics));
      const controls = elem('div', 'gbx-anim-controls');
      const slider = elem('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(Math.max(0, animation.frames.length - 1)); slider.step = '1';
      slider.setAttribute('aria-label', animation.semantics === 'zoom-distance' ? 'Select distance view' : 'Select frame');
      const frameLabel = elem('span', 'gbx-small');
      const frameStage = elem('div', 'gbx-grid');
      const frameCard = elem('div', 'gbx-card'); frameCard.append(heading('Selected source frame'));
      frameStage.append(frameCard);
      let current = Math.max(0, animation.frames.findIndex((frame) => frame.assetId === asset.id));
      const stop = elem('button', undefined, 'Stop'); stop.type = 'button'; stop.hidden = animation.semantics !== 'time-animation';
      const play = elem('button', undefined, 'Play'); play.type = 'button'; play.hidden = animation.semantics !== 'time-animation';
      const showFrame = (index: number) => {
        current = Math.min(animation.frames.length - 1, Math.max(0, index));
        slider.value = String(current);
        const frame = animation.frames[current];
        const source = registry.assets.find((candidate) => candidate.id === frame.assetId);
        frameLabel.textContent = `${current + 1}/${animation.frames.length} · ${frame.role} · ${frame.assetId}`;
        frameCard.replaceChildren(heading('Selected source frame'));
        if (source?.game === 'dok') addImage(frameCard, frame.role, [], undefined, undefined, source);
        else if (source?.decoded) addImage(frameCard, frame.role, originalCandidates(source), `${source.decoded.width}×${source.decoded.height}`, source.decoded.sha256, source);
        else frameCard.append(elem('p', 'gbx-muted gbx-unknown', 'Decoded frame image is unavailable in this registry record.'));
      };
      slider.addEventListener('input', () => showFrame(Number(slider.value)));
      slider.addEventListener('change', () => {
        const frame = animation.frames[Number(slider.value)];
        const source = frame && registry.assets.find((candidate) => candidate.id === frame.assetId);
        if (source && source.id !== asset.id) onSelect(source);
      });
      play.addEventListener('click', () => {
        if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
        activeAnimationTimer = window.setInterval(() => showFrame((current + 1) % animation.frames.length), 550);
      });
      stop.addEventListener('click', () => { if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer); activeAnimationTimer = undefined; });
      controls.append(slider, frameLabel);
      if (asset.game !== 'dok') controls.append(play, stop);
      animationCard.append(controls, frameStage, evidenceBlock('Animation evidence', animation.evidence));
      showFrame(current);

      const frameSetMatches = catalog.animationGroupMatchesFor(animation.id);
      const matchSection = elem('section', 'gbx-card');
      matchSection.dataset.role = 'animation-frame-set-matches';
      matchSection.append(heading(`Exact ordered frame-set matches (${frameSetMatches.length})`));
      matchSection.append(elem('p', 'gbx-muted', 'Each listed group has the same number of stored frames and a verified pixel-identical source at every matching frame ordinal. These are navigation candidates only; they do not prove the same subject, game role, or temporal animation. Multiple candidates remain separate.'));
      if (!frameSetMatches.length) {
        matchSection.append(elem('p', 'gbx-muted gbx-unknown', 'No complete exact ordered frame-set match is linked in the current registry.'));
      }
      for (const match of frameSetMatches) {
        const candidate = elem('article', 'gbx-card');
        candidate.dataset.role = 'animation-frame-set-match';
        candidate.dataset.sourceGroupId = match.sourceGroupId;
        candidate.dataset.targetGroupId = match.targetGroupId;
        candidate.append(elem('h3', undefined, match.targetGroupId), pill(match.targetGroup.semantics), pill(match.targetGroup.playback), pill(match.targetGroup.status));
        candidate.append(elem('p', 'gbx-small', `${match.frameCount} exact ordered source-frame matches${match.candidateCount > 1 ? ` · ${match.candidateCount} complete candidates for this group` : ''}`));
        const open = elem('button', undefined, 'Open matching frame at selected ordinal');
        open.type = 'button';
        open.addEventListener('click', () => {
          const selectedFrame = animation.frames[current];
          const pair = match.framePairs.find((row) => row.order === selectedFrame?.order);
          const target = pair && registry.assets.find((source) => source.id === pair.targetAssetId);
          if (target) onSelect(target);
        });
        candidate.append(open);
        matchSection.append(candidate);
      }
      animationCard.append(matchSection);
    }
    panel.append(animationCard);
  }
}

function hexByte(value: number): string { return `0x${value.toString(16).padStart(2, '0').toUpperCase()}`; }

function normalizedEditionLabel(edition: string): string {
  return edition.replace(/\bdisk(\d+)\b/gi, 'disk $1').replace(/\s+/g, ' ').trim();
}

function renderAppearanceSet(panel: HTMLElement, appearance: AppearanceSet, onSelect: (asset: Asset) => void): void {
  if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
  activeAnimationTimer = undefined;
  panel.replaceChildren();
  panel.append(elem('h2', undefined, appearance.id));
  panel.append(elem('div', 'gbx-meta', `${appearance.game.toUpperCase()} · ${appearance.platform} · ${appearance.manifestId}`));
  panel.append(elem('p', 'gbx-muted', 'Appearance set from explicitly verified source tuples. The set groups source components; it does not identify a character by name.'));

  const tuples = elem('section', 'gbx-card');
  tuples.append(heading('Accepted source tuples'));
  for (const tuple of appearance.acceptedTuples) {
    const label = tuple.role === 'primary' ? 'Primary tuple' : 'Storage-slot alias for the same appearance';
    tuples.append(elem('p', 'gbx-small', `${label} · ${hexByte(tuple.cHeadRequest)} ${hexByte(tuple.cBodyBlock)} ${hexByte(tuple.cBodySlot)} ${hexByte(tuple.suffixCode)}`));
  }
  tuples.append(elem('p', 'gbx-small', 'Tuple fields: CHEAD request · CBODY block · storage slot · suffix. The slot aliases preserve the exact observed selector values.'));
  panel.append(tuples);

  const variants = elem('div', 'gbx-grid');
  for (const variant of [...appearance.variants].sort((a, b) => a.index - b.index)) {
    const card = elem('section', 'gbx-card');
    card.append(heading(`Stored variant ${variant.index + 1}`));
    card.append(elem('p', 'gbx-small', `Variant index ${variant.index}; temporal animation meaning is not established.`));
    for (const component of variant.components) {
      const source = registry.assets.find((asset) => asset.id === component.assetId);
      const componentCard = elem('article', 'gbx-card');
      componentCard.append(heading(component.role === 'head' ? 'Head component' : 'Body component'));
      componentCard.append(elem('p', 'gbx-small', component.assetId));
      if (source?.decoded) addImage(componentCard, `${component.role} source`, originalCandidates(source), `${source.decoded.width}×${source.decoded.height}`, source.decoded.sha256, source);
      if (source) {
        const open = elem('button', undefined, `Open source ${source.id}`);
        open.type = 'button'; open.addEventListener('click', () => onSelect(source)); componentCard.append(open);
      } else componentCard.append(elem('p', 'gbx-muted gbx-unknown', 'Source component is missing from the registry.'));
      const candidates = component.restyleIds.map((id) => registry.restyles.find((row) => row.id === id)).filter((row): row is Restyle => Boolean(row));
      componentCard.append(heading(`Restyle candidates (${candidates.length})`));
      if (!candidates.length) componentCard.append(elem('p', 'gbx-muted gbx-unknown', 'No linked Restyle candidates.'));
      for (const candidate of candidates) {
        componentCard.append(elem('p', 'gbx-small', `${candidate.id} · ${candidate.reviewStatus}`));
        for (const output of candidate.outputs) addImage(componentCard, `${output.role} · ${candidate.reviewStatus}`, restyleOutputCandidates(candidate, output), undefined, output.sha256);
      }
      card.append(componentCard);
    }
    variants.append(card);
  }
  panel.append(variants);
  panel.append(elem('p', 'gbx-muted gbx-unknown', appearance.unresolvedCoverage));
  panel.append(evidenceBlock('Appearance-set evidence', appearance.evidence));
}

export async function startGraphicsBrowser(): Promise<void> {
  curatedOriginalPaths = new Map();
  curatedRestylePaths = new Map();
  currentCuratedStemsById = new Map();
  try {
    const local = await localAssetPackBytes('manifest.json');
    const response = local ? new Response(new Blob([new Uint8Array(local).buffer])) : await fetch('./restyle/manifest.json');
    if (response.ok) {
      const manifest = await response.json() as { items?: { id?: string; src?: string; stem?: string }[] };
      for (const item of manifest.items ?? []) {
        if (item.id && item.stem && /^[A-Za-z0-9_-]+$/.test(item.stem)) currentCuratedStemsById.set(item.id, item.stem);
      }
      for (const asset of registry.assets) {
        const source = asset.decoded?.path;
        if (!source) continue;
        const normalized = normalizeSourcePath(source);
        const match = manifest.items?.find((item) => item.src && item.stem
          && normalizeSourcePath(item.src) === normalized);
        if (match?.stem) curatedOriginalPaths.set(asset.id, [`./restyle/orig/${match.stem}.png`]);
      }
      const assets = new Map(registry.assets.map((asset) => [asset.id, asset]));
      for (const restyle of registry.restyles) {
        for (const output of restyle.outputs) {
          // A curated filename is usable only through a reference on an exact
          // linked source and the same output hash; names never establish lineage.
          const references = restyle.sourceAssetIds.flatMap((id) => assets.get(id)?.galleryReferences ?? [])
            .filter((reference) => reference.system === 'cok-curated-restyle-v1'
              && reference.outputSha256.toLowerCase() === output.sha256.toLowerCase())
            .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
          const paths: string[] = [];
          for (const reference of references) {
            const match = manifest.items?.find((item) => item.id === reference.id);
            if (match?.stem && /^[A-Za-z0-9_-]+$/.test(match.stem)) paths.push(`./restyle/out/${match.stem}.png`);
          }
          if (paths.length) curatedRestylePaths.set(JSON.stringify([restyle.id, output.sha256]), [...new Set(paths)]);
        }
      }
    }
  } catch { /* Optional curated copies can supplement the generated SHA-addressed image pool. */ }
  const output = document.querySelector('#output') as HTMLElement | null;
  const status = document.querySelector('#status') as HTMLElement | null;
  if (!output) return;
  output.replaceChildren();
  document.querySelectorAll('#games .cat-asset').forEach((item) => item.classList.remove('active'));
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.append(style);
  }
  const appearanceSets = registry.appearanceSets ?? [];
  const scopeSummary = catalog.scopes.map((scope) => `${scope.game.toUpperCase()}: ${scope.sourceCount} sources; coverage not established`).join(' · ');
  if (status) status.textContent = `Graphics identity browser · ${scopeSummary} · ${appearanceSets.length} appearance sets.`
    + (localAssetPackLabel() ? ` · local image folder: ${localAssetPackLabel()}` : '')
    + (localGameArchiveCount() ? ` · ${localGameArchiveCount()} local archive files` : '');
  const page = elem('main', 'gbx-page');
  page.append(elem('h1', undefined, 'Game graphics · identities and versions'));
  page.append(elem('p', 'gbx-lede', `Browse by source-qualified game asset ID. Catalogued scope: ${scopeSummary}. Coverage completeness is not established. Original archives and platforms remain distinct even when pixels or Restyle outputs are shared. Descriptions, game use, prompts, and animation meaning show their evidence and remain explicitly unknown when unmapped.`));
  const toolbar = elem('div', 'gbx-toolbar');
  const mode = elem('select'); mode.setAttribute('aria-label', 'Browse graphics by');
  mode.append(new Option('Source asset IDs', 'assets'), new Option('Character appearance sets', 'appearances'),
    new Option('Review queue', 'review'), new Option('Runtime consumer coverage', 'coverage'),
    new Option('Source inventory and ID coverage', 'sourceCoverage'), new Option('Version comparison overview', 'versions'));
  mode.options[1]!.disabled = appearanceSets.length === 0;
  const search = elem('input'); search.type = 'search'; search.placeholder = 'Search IDs, archives, descriptions, use…'; search.setAttribute('aria-label', 'Search game graphics');
  const count = elem('span', 'gbx-muted'); toolbar.append(mode, search, count);
  addLocalAssetPackPicker(toolbar, () => {
    generatedInventoryPromise = undefined;
    void startGraphicsBrowser();
  });
  addLocalGameArchivePicker(toolbar, () => {
    clearLocalArchiveCaches();
    void startGraphicsBrowser();
  });
  // One remembered folder per game (registry asset.game). The CoK registry key is 'cok'.
  addLocalGameFolderPicker(toolbar, 'cok', `${gameLabels.get('cok') ?? 'Champions of Krynn'} archives`, () => {
    clearLocalArchiveCaches();
    void startGraphicsBrowser();
  });
  const assetFilterControls = elem('div', 'gbx-toolbar'); assetFilterControls.dataset.assetFilters = 'true'; assetFilterControls.hidden = true;
  const assetGame = elem('select'); assetGame.setAttribute('aria-label', 'Source game'); assetGame.dataset.assetFilter = 'game';
  const assetPlatform = elem('select'); assetPlatform.setAttribute('aria-label', 'Source platform'); assetPlatform.dataset.assetFilter = 'platform';
  const assetEdition = elem('select'); assetEdition.setAttribute('aria-label', 'Source edition'); assetEdition.dataset.assetFilter = 'edition';
  const assetIdentityStatus = elem('select'); assetIdentityStatus.setAttribute('aria-label', 'Source identity status'); assetIdentityStatus.dataset.assetFilter = 'identity';
  const platforms = [...new Set(registry.assets.map((asset) => asset.platform))].sort();
  const editions = [...new Set(registry.assets.map((asset) => normalizedEditionLabel(asset.edition)))].sort((a, b) => a.localeCompare(b));
  const identityStatuses = [...new Set(registry.assets.map((asset) => asset.identityStatus))].sort();
  assetGame.append(new Option('All games', 'all'), ...catalog.scopes.map(({ game }) => new Option(gameLabels.get(game) ?? game, game)));
  assetPlatform.append(new Option('All platforms', 'all'), ...platforms.map((value) => new Option(value, value)));
  assetEdition.append(new Option('All editions', 'all'), ...editions.map((value) => new Option(value, value)));
  assetIdentityStatus.append(new Option('All identity statuses', 'all'), ...identityStatuses.map((value) => new Option(value, value)));
  assetFilterControls.append(assetGame, assetPlatform, assetEdition, assetIdentityStatus);
  const assetControls = elem('div', 'gbx-toolbar'); assetControls.dataset.assetControls = 'true'; assetControls.hidden = true;
  const assetPrevious = elem('button', undefined, 'Previous'); assetPrevious.type = 'button'; assetPrevious.dataset.assetPrevious = 'true';
  const assetPageLabel = elem('span', 'gbx-muted'); assetPageLabel.dataset.assetPage = 'true';
  const assetNext = elem('button', undefined, 'Next'); assetNext.type = 'button'; assetNext.dataset.assetNext = 'true';
  assetControls.append(assetPrevious, assetPageLabel, assetNext);
  const reviewControls = elem('div', 'gbx-toolbar'); reviewControls.dataset.reviewControls = 'true';
  const category = elem('select'); category.setAttribute('aria-label', 'Review queue category');
  for (const row of REVIEW_CATEGORIES) category.append(new Option(row.label, row.id));
  const platform = elem('select'); platform.setAttribute('aria-label', 'Review queue platform');
  const previous = elem('button', undefined, 'Previous'); previous.type = 'button';
  const next = elem('button', undefined, 'Next'); next.type = 'button';
  previous.dataset.reviewPrevious = 'true'; next.dataset.reviewNext = 'true';
  const summary = elem('p', 'gbx-muted'); summary.dataset.reviewSummary = 'true';
  reviewControls.append(category, platform, previous, next);
  const layout = elem('div', 'gbx-layout');
  const list = elem('nav', 'gbx-list'); list.setAttribute('aria-label', 'Game graphics');
  const panel = elem('section', 'gbx-panel'); panel.setAttribute('aria-live', 'polite');
  const coverage = elem('section'); coverage.hidden = true; coverage.dataset.coverageView = 'true';
  const sourceCensus = elem('section'); sourceCensus.hidden = true; sourceCensus.dataset.sourceCensus = 'true';
  const versionsView = elem('section'); versionsView.hidden = true; versionsView.dataset.versionOverview = 'true';
  layout.append(list, panel);
  page.append(toolbar, assetFilterControls, assetControls, reviewControls, summary, layout, coverage, sourceCensus, versionsView);
  output.append(page);
  const paramsAtStart = new URLSearchParams(location.search);
  assetGame.value = gameLabels.has(paramsAtStart.get('assetGame') ?? '') ? paramsAtStart.get('assetGame')! : 'all';
  assetPlatform.value = platforms.includes(paramsAtStart.get('assetPlatform') ?? '') ? paramsAtStart.get('assetPlatform')! : 'all';
  assetEdition.value = editions.includes(paramsAtStart.get('assetEdition') ?? '') ? paramsAtStart.get('assetEdition')! : 'all';
  assetIdentityStatus.value = identityStatuses.includes(paramsAtStart.get('assetIdentity') ?? '') ? paramsAtStart.get('assetIdentity')! : 'all';
  const requestedAppearance = paramsAtStart.get('appearance');
  const requestedSet = appearanceSets.find((row) => row.id === requestedAppearance || row.manifestId === requestedAppearance);
  let reviewState = readGraphicsReviewQuery(paramsAtStart);
  let reviewModel = buildGraphicsReviewQueues(cokRegistry, null, frameHypothesisSeed);
  let inventoryRequested = false, inventoryLoading = false;
  let selectedReviewKey = '';
  let browseMode: 'assets' | 'appearances' | 'review' | 'coverage' | 'sourceCoverage' | 'versions' = paramsAtStart.get('versions') === '1' ? 'versions'
    : paramsAtStart.get('sourceCoverage') === '1' ? 'sourceCoverage'
    : paramsAtStart.get('coverage') === '1' ? 'coverage'
    : paramsAtStart.has('review') ? 'review' : requestedSet ? 'appearances' : 'assets';
  let versionOverview: VersionOverview | null = null;
  let versionState: VersionOverviewState = { status: 'all', platform: 'all', edition: 'all', archive: 'all', unverifiedOnly: false, page: 0 };
  const showVersionOverview = () => {
    versionOverview ??= buildVersionOverview(catalog, 'cok');
    renderVersionOverview(versionsView, versionOverview, versionState, (next) => {
      versionState = next;
      showVersionOverview();
    }, (id) => {
      const asset = registry.assets.find((candidate) => candidate.id === id);
      if (asset) select(asset);
    });
  };
  if (browseMode === 'review') search.value = reviewState.query;
  const clearReviewParams = (params: URLSearchParams) => {
    for (const key of ['review', 'reviewPlatform', 'reviewPage', 'q']) params.delete(key);
  };
  if (browseMode === 'sourceCoverage') {
    const params = new URLSearchParams(paramsAtStart);
    clearReviewParams(params); clearCoverageQuery(params);
    for (const key of ['id', 'appearance', 'restyle']) params.delete(key);
    if (params.toString() !== paramsAtStart.toString()) history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  }
  mode.value = browseMode;
  const requestedId = paramsAtStart.get('id');
  const idResolution = resolveGraphicsAssetId(requestedId, registry.assets, searchAliases);
  const requestedAsset = idResolution.status === 'exact' || idResolution.status === 'alias'
    ? registry.assets.find((asset) => asset.id === idResolution.ids[0]) : undefined;
  if (requestedId && !requestedAsset) search.value = requestedId;
  if (requestedAsset && assetGame.value !== 'all' && assetGame.value !== requestedAsset.game) assetGame.value = requestedAsset.game;
  const visibleAssets = () => {
    const q = search.value.trim().toLocaleLowerCase();
    return registry.assets.filter((asset) => (!q || sourceSearchTextById.get(asset.id)?.includes(q))
      && (assetGame.value === 'all' || asset.game === assetGame.value)
      && (assetPlatform.value === 'all' || asset.platform === assetPlatform.value)
      && (assetEdition.value === 'all' || normalizedEditionLabel(asset.edition) === assetEdition.value)
      && (assetIdentityStatus.value === 'all' || asset.identityStatus === assetIdentityStatus.value));
  };
  let selectedId = requestedId ? requestedAsset?.id ?? '' : visibleAssets()[0]?.id ?? '';
  const requestedIndex = visibleAssets().findIndex((asset) => asset.id === (requestedAsset?.id ?? idResolution.ids[0]));
  let assetPage = Math.floor(Math.max(0, requestedIndex) / SOURCE_PAGE_SIZE);
  let selectedAppearanceId = requestedSet?.id ?? appearanceSets[0]?.id ?? '';
  const select = (asset: Asset) => {
    if (browseMode !== 'assets') search.value = '';
    if (assetGame.value !== 'all' && assetGame.value !== asset.game) assetGame.value = asset.game;
    const position = visibleAssets().indexOf(asset);
    if (position >= 0) assetPage = Math.floor(position / SOURCE_PAGE_SIZE);
    browseMode = 'assets'; mode.value = browseMode;
    selectedId = asset.id;
    const params = new URLSearchParams(location.search); params.set('graphics', '1'); params.set('id', asset.id); params.delete('appearance');
    if (assetGame.value !== 'all') params.set('assetGame', assetGame.value);
    clearReviewParams(params); clearCoverageQuery(params); clearSourceCensusQuery(params);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
    renderAsset(panel, asset, select); drawList();
  };
  const selectAppearance = (appearance: AppearanceSet) => {
    browseMode = 'appearances'; mode.value = browseMode; selectedAppearanceId = appearance.id;
    const params = new URLSearchParams(location.search); params.set('graphics', '1'); params.set('appearance', appearance.id); params.delete('id');
    clearReviewParams(params); clearCoverageQuery(params); clearSourceCensusQuery(params);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
    renderAppearanceSet(panel, appearance, select); drawList();
  };
  const showReviewRow = (row: ReviewRow) => {
    if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
    activeAnimationTimer = undefined;
    selectedReviewKey = row.key; panel.replaceChildren(elem('h2', undefined, row.key));
    panel.append(elem('p', 'gbx-muted', `${row.unit} · ${row.platforms.join(' / ') || 'platform unknown'}`));
    for (const reason of row.reasons) panel.append(elem('p', 'gbx-muted gbx-unknown', reason));
    for (const id of row.sourceIds) {
      const asset = registry.assets.find((candidate) => candidate.id === id);
      if (!asset) { panel.append(elem('p', 'gbx-small', `Missing source reference: ${id}`)); continue; }
      const open = elem('button', undefined, `Open source ${id}`); open.type = 'button';
      open.dataset.reviewSourceId = id; open.addEventListener('click', () => select(asset)); panel.append(open);
    }
    if (reviewState.category === 'frame-hypotheses' && row.sourceIds.length) {
      const previews = elem('div', 'gbx-grid'); previews.dataset.role = 'frame-hypothesis-sources';
      for (const id of row.sourceIds) {
        const asset = registry.assets.find((candidate) => candidate.id === id);
        if (asset) addImage(previews, `Pinned source · ${id}`,
          originalCandidates(asset), asset.decoded ? `${asset.decoded.width}×${asset.decoded.height}` : undefined,
          asset.decoded?.sha256, asset);
      }
      panel.append(previews);
    }
    if (row.cardId) {
      const link = elem('a', undefined, 'Open generated gallery card');
      link.href = `${location.pathname}?${new URLSearchParams({ restyle: '1', gallery: row.cardId })}`;
      panel.append(link);
    }
    const details = elem('details'); details.open = true;
    details.append(elem('summary', undefined, 'Recorded details (no status changes)'));
    const text = elem('pre', 'gbx-small', JSON.stringify(row.details, null, 2)); text.style.whiteSpace = 'pre-wrap';
    details.append(text); panel.append(details, evidenceBlock('Review evidence', row.evidence));
  };
  const loadReviewInventory = async () => {
    if (inventoryRequested) return;
    inventoryRequested = true; inventoryLoading = true;
    try {
      reviewModel = buildGraphicsReviewQueues(cokRegistry, await loadGeneratedInventory(), frameHypothesisSeed);
    } catch (error) {
      reviewModel = buildGraphicsReviewQueues(cokRegistry, null, frameHypothesisSeed);
      reviewModel.inventory.error = `Packaged gallery inventory unavailable: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      inventoryLoading = false;
      if (page.isConnected && browseMode === 'review') drawList();
    }
  };
  let coverageRender = 0;
  const showCoverage = async () => {
    const render = ++coverageRender;
    coverage.replaceChildren(elem('p', 'gbx-muted', 'Loading runtime coverage…'));
    const stillSelected = () => page.isConnected && browseMode === 'coverage' && render === coverageRender;
    try {
      const [ui, model] = await Promise.all([import('./graphicsCoverage.js'), loadCoverage()]);
      if (!stillSelected()) return;
      ui.renderCoverageMode(coverage, model, (id) => {
        const source = registry.assets.find((candidate) => candidate.id === id);
        if (source) select(source);
      });
    } catch {
      if (stillSelected()) coverage.replaceChildren(elem('p', 'gbx-muted gbx-unknown', 'Coverage unavailable. Select another mode to browse source identities and Restyle records.'));
    }
  };
  let censusRender = 0;
  const showSourceCensus = async () => {
    const render = ++censusRender;
    const params = new URLSearchParams(location.search);
    const { game } = readSourceCensusQuery(params);
    const selector = elem('select'); selector.setAttribute('aria-label', 'Source inventory game');
    selector.append(...[...gameLabels].map(([value, label]) => new Option(label, value)));
    if (!gameLabels.has(game)) selector.append(new Option(`Unknown game: ${game}`, game));
    selector.value = game;
    selector.addEventListener('change', () => {
      const next = writeSourceCensusQuery(params, { ...readSourceCensusQuery(new URLSearchParams()), game: selector.value });
      history.replaceState(null, '', `${location.pathname}?${next}${location.hash}`);
      void showSourceCensus();
    });
    const body = elem('div');
    sourceCensus.replaceChildren(selector, body);
    if (!gameLabels.has(game)) {
      body.append(elem('p', 'gbx-muted gbx-unknown', 'The bookmarked source inventory game is unavailable.'));
      return;
    }
    body.append(elem('p', 'gbx-muted', 'Loading source inventory…'));
    const stillSelected = () => page.isConnected && browseMode === 'sourceCoverage' && render === censusRender;
    try {
      const [ui, model] = await Promise.all([import('./graphicsSourceCensus.js'), game === 'dok' ? loadDokSourceCensus() : loadSourceCensus()]);
      if (!stillSelected()) return;
      ui.renderSourceCensus(body, model, (id) => {
        const asset = registry.assets.find((candidate) => candidate.id === id);
        if (stillSelected() && asset) select(asset);
      });
    } catch {
      if (!stillSelected()) return;
      const retry = elem('button', undefined, 'Reload page to retry');
      retry.type = 'button';
      retry.addEventListener('click', () => location.reload());
      body.replaceChildren(elem('p', 'gbx-muted gbx-unknown', 'Source inventory unavailable.'), retry);
    }
  };
  const drawList = () => {
    const q = search.value.trim().toLocaleLowerCase();
    reviewControls.hidden = summary.hidden = browseMode !== 'review';
    assetFilterControls.hidden = browseMode !== 'assets';
    assetControls.hidden = browseMode !== 'assets';
    const reportMode = browseMode === 'coverage' || browseMode === 'sourceCoverage' || browseMode === 'versions';
    layout.hidden = search.hidden = count.hidden = reportMode;
    coverage.hidden = browseMode !== 'coverage';
    sourceCensus.hidden = browseMode !== 'sourceCoverage';
    versionsView.hidden = browseMode !== 'versions';
    if (reportMode) {
      if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
      activeAnimationTimer = undefined;
      if (browseMode === 'versions') showVersionOverview();
      else if (browseMode === 'sourceCoverage') void showSourceCensus();
      else void showCoverage();
      return;
    }
    list.setAttribute('aria-label', browseMode === 'review' ? 'Graphics review queue' : browseMode === 'assets' ? 'Game graphics source identities' : 'Character appearance sets');
    list.replaceChildren();
    if (browseMode === 'review') {
      reviewState.query = search.value;
      category.value = reviewState.category;
      const platforms = [...new Set(Object.values(reviewModel.queues).flatMap((rows) => rows.flatMap((row) => row.platforms)))].sort();
      if (reviewState.platform !== 'all' && !platforms.includes(reviewState.platform)) platforms.push(reviewState.platform);
      platform.replaceChildren(new Option('All platforms', 'all'), ...platforms.map((value) => new Option(value, value)));
      platform.value = reviewState.platform;
      const galleryQueue = reviewState.category === 'unresolved-gallery' || reviewState.category === 'stale-gallery-reference';
      summary.textContent = REVIEW_CATEGORIES.map((row) => `${row.label}: ${['unresolved-gallery', 'stale-gallery-reference'].includes(row.id) && reviewModel.inventory.status !== 'ready'
        ? 'unavailable' : `${reviewModel.queues[row.id]!.length} ${row.unit}`}`).join(' · ');
      if (galleryQueue && reviewModel.inventory.status !== 'ready') {
        count.dataset.reviewInventoryState = !inventoryRequested || inventoryLoading ? 'loading' : 'unavailable';
        count.textContent = inventoryLoading ? 'Gallery inventory loading…' : 'Gallery inventory unavailable';
        previous.disabled = next.disabled = true;
        panel.replaceChildren(elem('h2', undefined, REVIEW_CATEGORIES.find((row) => row.id === reviewState.category)!.label), elem('p', 'gbx-muted gbx-unknown', reviewModel.inventory.error ?? 'Gallery inventory unavailable'));
        const params = new URLSearchParams(location.search);
        clearCoverageQuery(params); clearSourceCensusQuery(params);
        history.replaceState(null, '', `${location.pathname}?${writeGraphicsReviewQuery(params, reviewState)}${location.hash}`);
        if (!inventoryRequested) void loadReviewInventory();
        return;
      }
      count.dataset.reviewInventoryState = reviewModel.inventory.status;
      const rows = filterGraphicsReviewRows(reviewModel, reviewState), paged = pageGraphicsReviewRows(rows, reviewState.page);
      reviewState.page = paged.page;
      const unit = REVIEW_CATEGORIES.find((row) => row.id === reviewState.category)!.unit;
      count.textContent = `${paged.total} ${unit} · page ${paged.pageCount ? paged.page + 1 : 0} / ${paged.pageCount}`;
      previous.disabled = paged.page === 0; next.disabled = paged.page + 1 >= paged.pageCount;
      for (const row of paged.items) {
        const button = elem('button', 'gbx-pick', row.key); button.type = 'button'; button.dataset.reviewKey = row.key;
        button.append(elem('small', undefined, `${row.platforms.join(' / ')} · ${row.reasons[0]}`));
        button.addEventListener('click', () => { showReviewRow(row); drawList(); }); list.append(button);
      }
      const selected = paged.items.find((row) => row.key === selectedReviewKey) ?? paged.items[0];
      if (selected) showReviewRow(selected);
      else panel.replaceChildren(elem('h2', undefined, 'Review queue'), elem('p', 'gbx-empty', 'No recorded items match these filters.'));
      const params = new URLSearchParams(location.search);
      clearCoverageQuery(params); clearSourceCensusQuery(params);
      history.replaceState(null, '', `${location.pathname}?${writeGraphicsReviewQuery(params, reviewState)}${location.hash}`);
    } else if (browseMode === 'assets') {
      const matches = visibleAssets();
      const pageCount = Math.ceil(matches.length / SOURCE_PAGE_SIZE);
      assetPage = pageCount ? Math.min(assetPage, pageCount - 1) : 0;
      const pageItems = matches.slice(assetPage * SOURCE_PAGE_SIZE, (assetPage + 1) * SOURCE_PAGE_SIZE);
      count.textContent = `${matches.length} / ${registry.assets.length} source identities`;
      assetPageLabel.textContent = `Page ${pageCount ? assetPage + 1 : 0} / ${pageCount}`;
      assetPrevious.disabled = assetPage === 0;
      assetNext.disabled = assetPage + 1 >= pageCount;
      if (!matches.length) list.append(elem('p', 'gbx-empty', 'No source identities match this search.'));
      for (const asset of pageItems) {
        const button = elem('button', 'gbx-pick'); button.type = 'button'; button.dataset.assetId = asset.id; button.setAttribute('aria-current', String(asset.id === selectedId));
        button.append(document.createTextNode(asset.id), elem('small', undefined, `${asset.platform} · ${fmtLocator(asset)}`));
        button.addEventListener('click', () => select(asset)); list.append(button);
      }
    } else {
      const matches = appearanceSets.filter((appearance) => !q || [appearance.id, appearance.manifestId,
        ...appearance.acceptedTuples.flatMap((tuple) => [tuple.cHeadRequest, tuple.cBodyBlock, tuple.cBodySlot, tuple.suffixCode].map(hexByte)),
        ...appearance.variants.flatMap((variant) => variant.components.flatMap((component) => [component.assetId, ...component.restyleIds]))]
        .join(' ').toLocaleLowerCase().includes(q));
      count.textContent = `${matches.length} / ${appearanceSets.length} appearance sets`;
      if (!matches.length) list.append(elem('p', 'gbx-empty', 'No appearance sets match this search.'));
      for (const appearance of matches) {
        const button = elem('button', 'gbx-pick'); button.type = 'button'; button.dataset.appearanceId = appearance.id;
        button.setAttribute('aria-current', String(appearance.id === selectedAppearanceId));
        button.append(document.createTextNode(appearance.id), elem('small', undefined, `${appearance.acceptedTuples.length} exact selector tuple(s) · two stored variants`));
        button.addEventListener('click', () => selectAppearance(appearance)); list.append(button);
      }
    }
  };
  const syncAssetFilters = () => {
    const params = new URLSearchParams(location.search);
    for (const [key, value] of [['assetGame', assetGame.value], ['assetPlatform', assetPlatform.value], ['assetEdition', assetEdition.value], ['assetIdentity', assetIdentityStatus.value]]) {
      if (value === 'all') params.delete(key); else params.set(key, value);
    }
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  };
  search.addEventListener('input', () => { reviewState.page = 0; assetPage = 0; drawList(); });
  assetGame.addEventListener('change', () => {
    assetPage = 0;
    syncAssetFilters();
    const visible = visibleAssets();
    const asset = visible.find((row) => row.id === selectedId) ?? visible[0];
    if (asset) { select(asset); return; }
    if (activeAnimationTimer !== undefined) window.clearInterval(activeAnimationTimer);
    activeAnimationTimer = undefined;
    selectedId = '';
    const params = new URLSearchParams(location.search); params.delete('id');
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
    panel.replaceChildren(elem('p', 'gbx-empty', 'No source identities match these filters.'));
    drawList();
  });
  for (const filter of [assetPlatform, assetEdition, assetIdentityStatus]) filter.addEventListener('change', () => {
    assetPage = 0; syncAssetFilters(); drawList();
  });
  category.addEventListener('change', () => { reviewState.category = category.value; reviewState.page = 0; drawList(); });
  platform.addEventListener('change', () => { reviewState.platform = platform.value; reviewState.page = 0; drawList(); });
  previous.addEventListener('click', () => { reviewState.page = Math.max(0, reviewState.page - 1); drawList(); });
  next.addEventListener('click', () => { reviewState.page++; drawList(); });
  assetPrevious.addEventListener('click', () => { assetPage = Math.max(0, assetPage - 1); drawList(); });
  assetNext.addEventListener('click', () => { assetPage++; drawList(); });
  mode.addEventListener('change', () => {
    if (mode.value === 'coverage' || mode.value === 'sourceCoverage' || mode.value === 'versions') {
      browseMode = mode.value;
      const params = new URLSearchParams(location.search);
      clearReviewParams(params);
      clearCoverageQuery(params); clearSourceCensusQuery(params);
      params.delete('id'); params.delete('appearance'); params.delete('restyle'); params.delete('versions');
      params.set('graphics', '1'); params.set(browseMode, '1');
      if (browseMode === 'sourceCoverage' && (assetGame.value === 'dok' || selectedId.startsWith('dok/'))) params.set('sourceGame', 'dok');
      history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
      drawList();
      return;
    }
    browseMode = mode.value === 'review' ? 'review' : mode.value === 'appearances' && appearanceSets.length ? 'appearances' : 'assets';
    if (browseMode === 'review') { search.value = reviewState.query; drawList(); return; }
    if (browseMode === 'appearances') {
      const appearance = appearanceSets.find((row) => row.id === selectedAppearanceId) ?? appearanceSets[0];
      if (appearance) { selectAppearance(appearance); return; }
    }
    const asset = registry.assets.find((row) => row.id === selectedId) ?? visibleAssets()[0];
    if (asset) { select(asset); return; }
    drawList();
  });
  const first = registry.assets.find((asset) => asset.id === selectedId) ?? visibleAssets()[0];
  drawList();
  if (browseMode === 'review' || browseMode === 'coverage' || browseMode === 'sourceCoverage' || browseMode === 'versions') { /* drawList owns the lazy modes. */ }
  else if (browseMode === 'appearances') {
    const appearance = appearanceSets.find((row) => row.id === selectedAppearanceId) ?? appearanceSets[0];
    if (appearance) renderAppearanceSet(panel, appearance, select);
    else if (first) renderAsset(panel, first, select);
  } else if (requestedId && idResolution.status === 'ambiguous') {
    panel.replaceChildren(elem('h2', undefined, 'Choose a matching source identity'),
      elem('p', 'gbx-muted', `“${requestedId}” matches ${idResolution.ids.length} source records. Select the exact edition and archive below.`));
    for (const id of idResolution.ids.slice(0, SOURCE_PAGE_SIZE)) {
      const asset = registry.assets.find((row) => row.id === id);
      if (!asset) continue;
      const button = elem('button', 'gbx-pick', asset.id); button.type = 'button';
      button.dataset.idCandidate = asset.id;
      button.append(elem('small', undefined, `${asset.game} · ${asset.platform} · ${asset.edition} · ${fmtLocator(asset)}`));
      button.addEventListener('click', () => select(asset)); panel.append(button);
    }
    if (idResolution.ids.length > SOURCE_PAGE_SIZE) panel.append(elem('p', 'gbx-muted', `Showing the first ${SOURCE_PAGE_SIZE} matches; use the source list search to browse all matches.`));
  } else if (requestedId && idResolution.status === 'missing') {
    panel.replaceChildren(elem('h2', undefined, 'Source identity not found'),
      elem('p', 'gbx-muted', `No canonical source ID or known alias matches “${requestedId}”. Search the source list to find a valid identity.`));
  } else if (first) renderAsset(panel, first, select);
}
