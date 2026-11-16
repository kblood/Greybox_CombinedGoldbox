import { validateCokGeneratedInventory } from './cok-generated-inventory.mjs';
import { frameHypothesisRows, validateGraphicsFrameHypotheses } from './graphics-frame-hypotheses.mjs';

export const REVIEW_CATEGORIES = Object.freeze([
  { id: 'unknown-description', label: 'Unknown descriptions', unit: 'sources' },
  { id: 'missing-visual-description', label: 'Missing visual descriptions', unit: 'sources' },
  { id: 'unknown-consumer', label: 'Unknown game consumers', unit: 'sources' },
  { id: 'unknown-animation', label: 'Unknown frame semantics', unit: 'groups' },
  { id: 'frame-hypotheses', label: 'Frame hypotheses', unit: 'hypotheses' },
  { id: 'unresolved-gallery', label: 'Unresolved gallery cards', unit: 'cards' },
  { id: 'stale-gallery-reference', label: 'Stale gallery references', unit: 'references' },
]);
const ordered = (rows) => rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const unique = (values) => [...new Set(values)].sort();
const unknown = (value) => !value || value === 'unknown';

export function buildGraphicsReviewQueues(registry, inventory = null, frameHypotheses = null) {
  const sources = new Map(registry.assets.map((asset) => [asset.id, asset]));
  const sourceRow = (asset, reasons) => ({ key: asset.id, unit: 'sources', platforms: [asset.platform],
    sourceIds: [asset.id], groupId: null, cardId: null, reasons,
    text: [asset.id, asset.archive?.name, asset.archive?.path, asset.description?.text,
      asset.description?.visualDescription, ...asset.gameConsumers.flatMap((consumer) => [consumer.status, consumer.use])].join(' '),
    details: { description: asset.description, consumers: asset.gameConsumers },
    evidence: [...(asset.description?.evidence ?? []), ...asset.gameConsumers.flatMap((consumer) => consumer.evidence ?? [])] });
  const queues = {
    'unknown-description': ordered(registry.assets.filter((asset) => unknown(asset.description?.status))
      .map((asset) => sourceRow(asset, ['Description remains unknown.']))),
    'missing-visual-description': ordered(registry.assets.filter((asset) => typeof asset.description?.visualDescription !== 'string'
      || !asset.description.visualDescription.trim())
      .map((asset) => sourceRow(asset, ['No visual description is recorded.']))),
    'unknown-consumer': ordered(registry.assets.filter((asset) => !asset.gameConsumers.length
      || asset.gameConsumers.some((consumer) => unknown(consumer.status)))
      .map((asset) => sourceRow(asset, [asset.gameConsumers.length ? 'At least one consumer remains unknown; known peers are retained.' : 'No consumer evidence is recorded.']))),
    'unknown-animation': ordered(registry.animationGroups.filter((group) => unknown(group.semantics) || unknown(group.playback))
      .map((group) => ({ key: group.id, unit: 'groups', platforms: unique(group.frames.map((frame) => sources.get(frame.assetId)?.platform).filter(Boolean)),
        sourceIds: unique(group.frames.map((frame) => frame.assetId)), groupId: group.id, cardId: null,
        reasons: [`Semantics: ${group.semantics ?? 'unknown'}; playback: ${group.playback ?? 'unknown'}.`],
        text: [group.id, group.semantics, group.playback, ...group.frames.map((frame) => frame.assetId)].join(' '),
        details: group, evidence: group.evidence ?? [] }))),
    'frame-hypotheses': [],
    'unresolved-gallery': [],
    'stale-gallery-reference': [],
  };
  const hypothesisValidation = validateGraphicsFrameHypotheses(frameHypotheses, registry);
  queues['frame-hypotheses'] = ordered(frameHypothesisRows(hypothesisValidation, registry));
  let inventoryStatus = { status: 'unavailable', error: 'Packaged gallery inventory has not been loaded.',
    totalCards: null, exactCards: null, unresolvedCards: null, staleReferences: null, aliasRows: null };
  if (inventory !== null) {
    try {
      const data = validateCokGeneratedInventory(inventory);
      const references = new Map();
      for (const restyle of registry.restyles) for (const ref of restyle.externalReferences ?? []) {
        if (ref.system !== 'cok-restyle-inventory-v1') continue;
        const rows = references.get(ref.id) ?? [];
        if (!rows.includes(restyle)) rows.push(restyle);
        references.set(ref.id, rows);
      }
      for (const card of data.assets) {
        const refs = references.get(card.id) ?? [];
        const exact = refs.filter((restyle) => restyle.sourceAssetIds.length > 0
          && restyle.sourceAssetIds.every((id) => sources.get(id)?.decoded?.sha256 === card.sourceSha256)
          && restyle.outputs.some((output) => output.role === 'gallery-copy' && output.sha256 === card.outputSha256));
        if (refs.length && exact.length === refs.length) continue;
        const state = !refs.length ? 'none' : exact.length ? 'conflicting' : 'stale';
        queues['unresolved-gallery'].push({ key: card.id, unit: 'cards', platforms: [...card.platforms],
          sourceIds: unique(exact.flatMap((row) => row.sourceAssetIds)), groupId: null, cardId: card.id,
          reasons: [`Exact source/output reference: ${state}.`,
            `${card.aliases.length} ledger alias row(s); card coverage does not establish individual alias locator resolution.`],
          text: [card.id, card.label, ...card.platforms, state, ...card.aliases.flatMap((alias) =>
            [alias.platform, alias.family, alias.sourceName, alias.sourceProvenance, alias.ledger])].join(' '),
          details: { state, sourceSha256: card.sourceSha256, outputSha256: card.outputSha256,
            aliases: card.aliases, referencedRestyleIds: refs.map((row) => row.id), aliasResolution: 'not-established-by-card-coverage' },
          evidence: refs.flatMap((row) => row.evidence ?? []) });
      }
      const currentCardIds = new Set(data.assets.map((card) => card.id));
      for (const [cardId, refs] of references) {
        if (currentCardIds.has(cardId)) continue;
        const sourceIds = unique(refs.flatMap((row) => row.sourceAssetIds));
        const platforms = unique(sourceIds.map((id) => sources.get(id)?.platform).filter(Boolean));
        queues['stale-gallery-reference'].push({ key: cardId, unit: 'references', platforms,
          sourceIds, groupId: null, cardId,
          reasons: ['Registry reference points to a gallery card ID absent from the validated inventory.'],
          text: [cardId, ...sourceIds, ...refs.flatMap((row) => row.id)].join(' '),
          details: { state: 'stale-card-id', referencedRestyleIds: refs.map((row) => row.id),
            aliasResolution: 'not-established-by-card-coverage' },
          evidence: refs.flatMap((row) => row.evidence ?? []) });
      }
      ordered(queues['unresolved-gallery']);
      ordered(queues['stale-gallery-reference']);
      inventoryStatus = { status: 'ready', error: null, totalCards: data.assets.length,
        exactCards: data.assets.length - queues['unresolved-gallery'].length,
        unresolvedCards: queues['unresolved-gallery'].length,
        staleReferences: queues['stale-gallery-reference'].length,
        aliasRows: queues['unresolved-gallery'].reduce((sum, row) => sum + row.details.aliases.length, 0) };
    } catch (error) {
      inventoryStatus = { ...inventoryStatus, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { queues, inventory: inventoryStatus, frameHypotheses: hypothesisValidation };
}

export function filterGraphicsReviewRows(model, { category = 'unknown-description', platform = 'all', query = '' } = {}) {
  if (!REVIEW_CATEGORIES.some((row) => row.id === category)) throw new Error('Unknown graphics review category');
  const needle = query.trim().toLowerCase();
  return model.queues[category].filter((row) => (platform === 'all' || row.platforms.includes(platform))
    && (!needle || `${row.text} ${row.reasons.join(' ')}`.toLowerCase().includes(needle)));
}

export function pageGraphicsReviewRows(rows, page = 0, pageSize = 48) {
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 48) {
    throw new Error('Graphics review pages are limited to 48 rows');
  }
  const pageCount = Math.ceil(rows.length / pageSize), safePage = pageCount ? Math.min(page, pageCount - 1) : 0;
  return { page: safePage, pageCount, total: rows.length, items: rows.slice(safePage * pageSize, (safePage + 1) * pageSize) };
}

export function readGraphicsReviewQuery(params) {
  const category = REVIEW_CATEGORIES.some((row) => row.id === params.get('review')) ? params.get('review') : 'unknown-description';
  const rawPage = params.get('reviewPage') ?? '0';
  return { category, platform: params.get('reviewPlatform') || 'all', query: params.get('q') ?? '',
    page: /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : 0 };
}

export function writeGraphicsReviewQuery(params, state) {
  const next = new URLSearchParams(params);
  next.set('graphics', '1'); next.set('review', state.category); next.delete('id'); next.delete('appearance');
  for (const key of ['reviewPlatform', 'q', 'reviewPage']) next.delete(key);
  if (state.platform !== 'all') next.set('reviewPlatform', state.platform);
  if (state.query.trim()) next.set('q', state.query.trim());
  if (state.page > 0) next.set('reviewPage', String(state.page));
  return next.toString();
}
