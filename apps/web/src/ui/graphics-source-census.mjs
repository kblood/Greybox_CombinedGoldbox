import { dokArchiveCategory } from './graphics-registry.mjs';
import { dokStoredDaxLayout } from './graphics-stored-dax.mjs';

const SOURCE_SETS = new Map([['dos-install', 'DOS-EGA'], ['amiga-private-extraction', 'Amiga']]);
const DOK_SOURCE_SETS = new Map([['dos-install', 'DOS-EGA']]);
const FILE_STATUSES = ['missing', 'unavailable', 'pin-mismatch', 'unsupported', 'invalid', 'partial', 'scanned'];
const ENTRY_STATUSES = ['decoded', 'structural', 'invalid', 'unsupported'];
const CHILD_FIELDS = new Map([['block-frame', 'frameIndex'], ['tile', 'tileIndex'], ['atlas-cell', 'cellIndex'],
  ['whole-image', null], ['glyph', 'glyphIndex']]);
const LOCATOR_FIELDS = ['kind', 'blockId', 'entryIndex', 'frameIndex', 'tileIndex', 'cellIndex', 'glyphIndex'];
const QUERY_KEYS = ['sourceCoverage', 'sourceGame', 'sourceSet', 'sourceFile', 'sourceStatus', 'sourcePage', 'sourceEntry', 'sourceEntryPage',
  'sourceChildPage', 'sourceUnresolvedPage'];
const CENSUS_PAGE_SIZE = 40;
const SHA = /^[a-f0-9]{64}$/;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const optionalCount = (value) => value === null || count(value);
const hash = (value) => typeof value === 'string' && SHA.test(value);
const optionalHash = (value) => value === null || hash(value);
const label = (value) => typeof value === 'string' && value.length > 0;

function requireCensus(condition, message) {
  if (!condition) throw new Error(`Invalid graphics source census: ${message}`);
}

async function digestText(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Same field order, UTF-8 JSON tuple encoding and ASCII ID order as the Python producer. */
export async function registryIdentityDigest(assets, game = 'cok') {
  const rows = assets.filter((asset) => asset.game === game).map((asset) => {
    requireCensus(/^[\x21-\x7e]+$/.test(asset.id), 'registry ID');
    requireCensus(asset.sourceContentSha256 == null || hash(asset.sourceContentSha256), 'source content hash');
    requireCensus(asset.sourcePixelSha256 == null || hash(asset.sourcePixelSha256), 'source pixel hash');
    return [asset.id, asset.platform, asset.edition, asset.identityStatus, asset.archive.name,
      asset.archive.sha256 ?? null, LOCATOR_FIELDS.map((key) => asset.locator[key] ?? null),
      asset.decoded?.pixelSha256 ?? null, asset.sourceContentSha256 ?? null, asset.sourcePixelSha256 ?? null];
  });
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return digestText(JSON.stringify(rows));
}

export function censusFileKey(file) {
  return `${file.sourceSet}/${file.path}`;
}

function occurrenceEdition(file) {
  const [first, second] = file.path.split('/');
  const name = (second ?? first).split('.')[0].toUpperCase();
  if (file.sourceSet === 'dos-install') {
    if (name === 'CHEAD' || name === 'CBODY') return 'DOS';
    return /^(?:BIGPIC|CPIC|PIC)[123]$/.test(name) ? `DOS disk ${name.at(-1)}` : 'DOS install';
  }
  const disk = first.at(-1);
  if (/^(?:PIC|SPRIT)[12]$/.test(name)) return `Amiga disk${disk} candidate copy`;
  if (file.path.toLowerCase() === 'disk2/8x8d1.dax') return 'Amiga disk 2 (candidate ADF extraction)';
  return `Amiga disk ${disk}`;
}

function summarize(files) {
  const entries = files.flatMap((file) => file.entries);
  const structural = files.filter((file) => file.category === 'structural');
  const drawable = files.filter((file) => file.category !== 'structural');
  const parents = [...files, ...entries];
  const children = parents.flatMap((parent) => parent.children);
  const derived = parents.flatMap((parent) => parent.derived);
  const boundChildren = children.filter((row) => row.sourceIds.length).length;
  return {
    documentedGraphicsFiles: files.filter((file) => file.category === 'graphics'
      || (file.sourceSet === 'dos-install' && file.category === 'structural')).length,
    rosterFiles: files.length,
    observedFiles: files.filter((file) => file.observedSha256).length,
    pinMatchedFiles: files.filter((file) => file.sha256 === file.observedSha256).length,
    uniqueObservedContents: new Set(files.flatMap((file) => file.observedSha256 ?? [])).size,
    storedEntries: entries.length,
    entryLocatorsWithRegistryRows: entries.filter((entry) => entry.locatorSourceIds.length).length,
    filesWithRegistryEntryLocators: files.filter((file) => file.entries.some((entry) => entry.locatorSourceIds.length)).length,
    structuralFiles: structural.length,
    structuralStoredEntries: structural.reduce((total, file) => total + file.entries.length, 0),
    classificationOpenFiles: files.filter((file) => file.category === 'classification-open').length,
    filesWithUnknownDrawableCount: drawable.filter((file) => file.drawableCount === null).length,
    entriesWithUnknownDrawableCount: drawable.flatMap((file) => file.entries).filter((entry) => entry.drawableCount === null).length,
    parsedDrawableChildren: children.length,
    parsedCandidateDrawableChildren: children.filter((row) => row.candidate).length,
    drawableChildrenWithExactBinding: boundChildren,
    drawableChildrenWithoutExactBinding: children.length - boundChildren,
    derivedViews: derived.length,
    derivedViewsWithExactBinding: derived.filter((row) => row.sourceIds.length).length,
    totalDrawableCount: drawable.every((file) => file.drawableCount !== null) ? children.length : null,
  };
}

export async function buildSourceCensus(report, assets, dokRoster) {
  const dok = dokRoster !== undefined, game = dok ? 'dok' : 'cok';
  const sourceSets = dok ? DOK_SOURCE_SETS : SOURCE_SETS;
  requireCensus(report?.schema === `${game}-graphics-source-census-v1` && report.game === game
    && hash(dok ? report.rosterSha256 : report.registryAssetProjectionSha256) && hash(report.registryAssetIdentitySha256)
    && Array.isArray(report.sourceSets) && Array.isArray(report.files) && Array.isArray(report.unresolvedRegistryBindings), 'report shape');
  requireCensus(await registryIdentityDigest(assets, game) === report.registryAssetIdentitySha256, 'registry identity fingerprint differs');
  if (dok) {
    requireCensus(await digestText(`${JSON.stringify(dokRoster, null, 2)}\n`) === report.rosterSha256
      && dokRoster.files.length === report.files.length && !report.unresolvedRegistryBindings.length, 'DoK roster fingerprint or accounting');
  }
  const registry = new Map();
  for (const asset of assets.filter((row) => row.game === game)) {
    requireCensus(!registry.has(asset.id), 'duplicate registry ID');
    registry.set(asset.id, asset);
  }
  const byFile = new Map(), occurrenceKeys = new Set(), exactIds = new Set(), parentIds = new Map();
  const bindings = new Map();
  for (const [fileIndex, file] of report.files.entries()) {
    const platform = sourceSets.get(file.sourceSet);
    const pathPattern = platform === 'Amiga' ? /^disk[123]\/[A-Z0-9]+\.(?:DAX|DAA|LBM)$/i : /^[A-Z0-9]+\.DAX$/i;
    requireCensus(platform && typeof file.path === 'string' && pathPattern.test(file.path)
      && ['graphics', 'structural', 'classification-open'].includes(file.category)
      && FILE_STATUSES.includes(file.status) && hash(file.sha256) && count(file.bytes)
      && optionalHash(file.observedSha256) && optionalCount(file.observedBytes)
      && optionalCount(file.expectedEntries) && optionalCount(file.drawableCount) && Array.isArray(file.entries), 'file occurrence');
    const key = censusFileKey(file), edition = dok ? 'DOS install' : occurrenceEdition(file);
    const dokCategory = dok ? dokArchiveCategory(file.path) : null;
    if (dok) {
      const pin = dokRoster.files[fileIndex];
      requireCensus(pin.path === file.path && pin.sha256 === file.sha256 && file.sha256 === file.observedSha256
        && pin.bytes === file.bytes && file.bytes === file.observedBytes && file.format === 'dax-9'
        && pin.tocBlockIds.length === file.entries.length && file.expectedEntries === file.entries.length
        && dokCategory !== 'unsupported'
        && file.category === (dokCategory === 'structural' ? 'structural' : 'graphics')
        && file.status === 'scanned' && file.issue === null
        && (dokCategory === 'structural' ? file.drawableCount === 0 : file.drawableCount > 0), 'DoK file pin or coverage state');
    }
    requireCensus(!occurrenceKeys.has(key.toLowerCase()), 'duplicate file occurrence');
    occurrenceKeys.add(key.toLowerCase());
    byFile.set(key, file);
    const blockCounts = new Map();
    for (const entry of file.entries) blockCounts.set(entry.blockId, (blockCounts.get(entry.blockId) ?? 0) + 1);
    const blockOccurrences = new Map();
    let referenced = 0, bound = 0;
    for (const [index, parent] of [file, ...file.entries].entries()) {
      const entry = index > 0 ? parent : null;
      const layout = dok && entry ? dokStoredDaxLayout(file.path, entry.entryIndex, entry.blockId) : null;
      if (entry) {
        const occurrence = (blockOccurrences.get(entry.blockId) ?? 0) + 1;
        blockOccurrences.set(entry.blockId, occurrence);
        requireCensus(entry.entryIndex === index - 1 && count(entry.blockId) && entry.blockId <= 255
          && entry.sameIdOccurrence === occurrence && count(entry.offset) && Number.isSafeInteger(entry.storedBytes)
          && optionalCount(entry.declaredRawBytes) && optionalHash(entry.payloadSha256) && optionalHash(entry.rawSha256)
          && optionalCount(entry.drawableCount) && ENTRY_STATUSES.includes(entry.status), 'stored entry');
        if (dok) requireCensus(dokRoster.files[fileIndex].tocBlockIds[entry.entryIndex] === entry.blockId
          && entry.storedBytes > 0 && entry.offset >= 2 + 9 * file.entries.length && entry.offset + entry.storedBytes <= file.bytes
          && entry.declaredRawBytes > 0 && entry.issue === null && hash(entry.payloadSha256) && hash(entry.rawSha256)
          && (dokCategory === 'drawable'
            ? layout && entry.status === 'decoded' && entry.profile === layout.profile
              && (layout.count == null ? entry.drawableCount > 0 && entry.drawableCount <= layout.limit : entry.drawableCount === layout.count)
            : entry.status === 'structural' && entry.profile === 'structural' && entry.drawableCount === 0), 'DoK entry pin or coverage state');
      }
      requireCensus(Array.isArray(parent.children) && Array.isArray(parent.derived) && Array.isArray(parent.locatorSourceIds), 'parent rows');
      if (dok) requireCensus(!parent.derived.length && (entry && dokCategory === 'drawable'
        ? parent.children.length === parent.locatorSourceIds.length
        : !parent.children.length && !parent.locatorSourceIds.length), 'DoK drawable admission');
      const parentChildren = parent.children.length + (entry ? 0 : file.entries.reduce((n, row) => n + (row.drawableCount ?? 0), 0));
      requireCensus(parent.drawableCount === null || parent.drawableCount === parentChildren, 'drawable count differs');
      for (const id of parent.locatorSourceIds) {
        const asset = registry.get(id);
        requireCensus(asset && !parentIds.has(id) && file.observedSha256 && file.sha256 === file.observedSha256
          && asset.archive.sha256 === file.observedSha256 && asset.platform === platform && asset.edition === edition
          && asset.archive.name.toLowerCase() === file.path.split('/').at(-1).toLowerCase(), 'parent source binding');
        const loc = asset.locator;
        requireCensus(entry ? Boolean(entry.payloadSha256) && loc.blockId === entry.blockId
          && (loc.entryIndex === entry.entryIndex || (!dok && loc.entryIndex == null && blockCounts.get(entry.blockId) === 1))
          : loc.blockId == null && loc.entryIndex == null && file.format === 'iff-ilbm', 'parent locator differs');
        parentIds.set(id, parent);
        referenced++;
      }
      const childKeys = new Set();
      for (const [childIndex, child] of [...parent.children, ...parent.derived].entries()) {
        requireCensus(CHILD_FIELDS.has(child.kind) && count(child.width) && child.width > 0 && count(child.height) && child.height > 0
          && (child.kind === 'whole-image' ? child.index === null : count(child.index))
          && optionalHash(child.rgbSha256) && optionalHash(child.indexSha256) && typeof child.candidate === 'boolean'
          && Array.isArray(child.sourceIds) && child.sourceIds.length <= 1, 'child row');
        if (dok) requireCensus(layout && child.kind === layout.kind && child.index === childIndex && !child.candidate
          && (layout.dim == null || (child.width === layout.dim && child.height === layout.dim))
          && hash(child.indexSha256) && hash(child.rgbSha256) && child.sourceIds.length === 1, 'DoK stored child');
        const childKey = `${child.kind}/${child.index}`;
        requireCensus(!childKeys.has(childKey), 'duplicate child locator');
        childKeys.add(childKey);
        for (const id of child.sourceIds) {
          const asset = registry.get(id), field = CHILD_FIELDS.get(child.kind);
          requireCensus(asset && parentIds.get(id) === parent && !exactIds.has(id) && !child.candidate
            && asset.identityStatus === 'source-pinned' && !asset.edition.includes('candidate') && asset.locator.kind === child.kind
            && ['frameIndex', 'tileIndex', 'cellIndex', 'glyphIndex'].every((name) => name === field
              ? asset.locator[name] === child.index : asset.locator[name] == null)
            && (field !== 'glyphIndex' || child.indexSha256 === asset.sourceContentSha256
              && child.rgbSha256 === asset.sourcePixelSha256)
            && (!dok || child.indexSha256 === asset.sourceContentSha256 && child.rgbSha256 === asset.sourcePixelSha256)
            && (!child.rgbSha256 || !(asset.decoded?.pixelSha256 ?? asset.sourcePixelSha256)
              || child.rgbSha256 === (asset.decoded?.pixelSha256 ?? asset.sourcePixelSha256)), 'exact child binding');
          exactIds.add(id);
          bound++;
        }
      }
    }
    bindings.set(key, { referenced, bound });
  }
  const unresolved = new Set();
  for (const row of report.unresolvedRegistryBindings) {
    const file = row.path === null ? null : byFile.get(censusFileKey(row));
    requireCensus(registry.has(row.sourceId) && !exactIds.has(row.sourceId) && !unresolved.has(row.sourceId)
      && label(row.reason) && (row.path === null ? row.sourceSet === null && row.entryIndex === null
        : file && (row.entryIndex === null || (count(row.entryIndex) && file.entries[row.entryIndex]?.entryIndex === row.entryIndex))), 'unresolved registry row');
    unresolved.add(row.sourceId);
  }
  requireCensus(exactIds.size + unresolved.size === registry.size, 'registry accounting');
  const setIds = new Set();
  for (const set of report.sourceSets) {
    requireCensus(sourceSets.has(set.id) && set.platform === sourceSets.get(set.id)
      && !setIds.has(set.id) && label(set.provenance) && set.summary, 'source set');
    setIds.add(set.id);
    const expected = summarize(report.files.filter((file) => file.sourceSet === set.id));
    requireCensus(Object.keys(expected).length === Object.keys(set.summary).length
      && Object.entries(expected).every(([key, value]) => set.summary[key] === value), 'summary counters differ');
  }
  requireCensus(setIds.size === sourceSets.size, 'missing source set');
  if (dok) {
    const summary = report.sourceSets[0].summary;
    requireCensus(summary.rosterFiles === 37 && summary.pinMatchedFiles === 37 && summary.storedEntries === 430
      && summary.filesWithRegistryEntryLocators === 32 && summary.entryLocatorsWithRegistryRows === 423
      && summary.drawableChildrenWithExactBinding === 2614 && summary.structuralFiles === 5
      && summary.structuralStoredEntries === 7 && summary.filesWithUnknownDrawableCount === 0
      && summary.entriesWithUnknownDrawableCount === 0 && summary.totalDrawableCount === 2614, 'DoK denominator');
  }
  return { report, byFile, bindings };
}

export function createSourceCensusLoader(load) {
  let pending;
  return () => pending ??= Promise.resolve().then(load).catch((error) => {
    pending = undefined;
    throw error;
  });
}

export function clearSourceCensusQuery(params) {
  for (const key of QUERY_KEYS) params.delete(key);
}

function queryIndex(value, fallback = 0) {
  return value && /^\d+$/.test(value) && count(Number(value)) ? Number(value) : fallback;
}

export function readSourceCensusQuery(params) {
  return { game: params.get('sourceGame') ?? 'cok', set: params.get('sourceSet') ?? '', file: params.get('sourceFile') ?? '',
    status: params.get('sourceStatus') ?? '', page: queryIndex(params.get('sourcePage')),
    entry: queryIndex(params.get('sourceEntry'), null), entryPage: queryIndex(params.get('sourceEntryPage')),
    childPage: queryIndex(params.get('sourceChildPage')),
    unresolvedPage: queryIndex(params.get('sourceUnresolvedPage')) };
}

export function writeSourceCensusQuery(params, state) {
  const next = new URLSearchParams(params);
  clearSourceCensusQuery(next);
  next.set('graphics', '1');
  next.set('sourceCoverage', '1');
  for (const [key, value] of [
    ['sourceGame', state.game && state.game !== 'cok' ? state.game : ''],
    ['sourceSet', state.set], ['sourceFile', state.file], ['sourceStatus', state.status],
    ['sourcePage', state.page || ''], ['sourceEntry', state.entry], ['sourceEntryPage', state.entryPage || ''],
    ['sourceChildPage', state.childPage || ''],
    ['sourceUnresolvedPage', state.unresolvedPage || ''],
  ]) if (value !== null && value !== '') next.set(key, String(value));
  return next;
}

export function censusPage(rows, requested) {
  const pages = Math.ceil(rows.length / CENSUS_PAGE_SIZE);
  const page = Math.min(count(requested) ? requested : 0, Math.max(0, pages - 1));
  return { page, pages, items: rows.slice(page * CENSUS_PAGE_SIZE, (page + 1) * CENSUS_PAGE_SIZE) };
}

export function sourceCensusSelection(model, state) {
  const missingGame = (state.game ?? 'cok') !== model.report.game;
  const missingSet = Boolean(state.set && !model.report.sourceSets.some((set) => set.id === state.set));
  const missingStatus = Boolean(state.status && !FILE_STATUSES.includes(state.status));
  const files = missingGame ? [] : model.report.files.filter((file) => (!state.set || file.sourceSet === state.set)
    && (!state.status || file.status === state.status));
  const found = model.byFile.get(state.file);
  const file = !missingGame && found && (!state.set || found.sourceSet === state.set) ? found : undefined;
  const entry = file && state.entry !== null ? file.entries[state.entry] : undefined;
  return { missingSet, missingStatus, files: censusPage(files, state.page), file, entry };
}
