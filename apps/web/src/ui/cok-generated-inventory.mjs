import { isReviewedCardPrompt } from './cok-batch02-prompt-lineage.mjs';

const HASH = /^[a-f0-9]{64}$/;
const STEM = /^asset-[0-9]{4,}-[a-f0-9]{12}$/;
const MAX_DIMENSION = 32768;

export function validateCokGeneratedInventory(data) {
  const invalid = (detail) => { throw new Error(`Invalid CoK Restyle inventory: ${detail}`); };
  if (!data || data.schema !== 'cok-restyle-inventory-v1' || !Array.isArray(data.assets) || !data.assets.length) {
    invalid('schema and non-empty assets are required');
  }
  const ids = new Set();
  const animationIds = new Set();
  const pairs = new Set();
  let ledgerAliases = 0;
  for (const item of data.assets) {
    if (!item || typeof item.id !== 'string' || !STEM.test(item.id) || ids.has(item.id) || item.stem !== item.id) {
      invalid('unsafe or duplicate item id');
    }
    ids.add(item.id);
    if (!HASH.test(item.sourceSha256) || !HASH.test(item.outputSha256)
        || !Array.isArray(item.sourceSize) || item.sourceSize.length !== 2
        || !Array.isArray(item.outputSize) || item.outputSize.length !== 2
        || ![...item.sourceSize, ...item.outputSize].every((n) => Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION)
        || typeof item.source !== 'string' || typeof item.output !== 'string'
        || item.source !== `images/${item.sourceSha256}.png` || item.output !== `images/${item.outputSha256}.png`
        || typeof item.platform !== 'string' || !Array.isArray(item.platforms) || !item.platforms.length
        || typeof item.family !== 'string' || !Array.isArray(item.families) || !item.families.length
        || !Array.isArray(item.aliases) || !item.aliases.length
        || !['Generated/restyled variant', 'Generated/restyled variant with exact reuse aliases', 'Exact source-image duplicate', 'Reused cross-platform Restyle', 'Reviewed output; origin not specified by ledger'].includes(item.outputType)
        || !Array.isArray(item.promptReferences)
        || item.sourceMatched !== true || item.compositionReview !== 'not-reviewed'
        || typeof item.runtimeApproved !== 'boolean' || !Array.isArray(item.runtimeApprovalEvidence)
        || item.runtimeApproved !== (item.runtimeApprovalEvidence.length > 0)
        || item.runtimeApprovalEvidence.some((evidence) => typeof evidence !== 'string' || !evidence.trim())
        || !Array.isArray(item.ledgerStatuses) || Array.from(item.ledgerStatuses).some((status) => typeof status !== 'string')
        || typeof item.prompt !== 'string') {
      invalid(`${item.id}: invalid source/output or review metadata`);
    }
    const pair = `${item.sourceSha256}:${item.outputSha256}`;
    if (pairs.has(pair)) invalid(`${item.id}: duplicate exact image pair`);
    pairs.add(pair);
    ledgerAliases += item.aliases.length;
    for (const alias of item.aliases) {
      if (!alias || typeof alias.ledger !== 'string' || typeof alias.status !== 'string'
          || typeof alias.family !== 'string' || typeof alias.platform !== 'string') invalid(`${item.id}: invalid ledger alias`);
    }
    for (const prompt of item.promptReferences) {
      if (prompt && Object.hasOwn(prompt, 'transform')) {
        if (!isReviewedCardPrompt(prompt, item)) invalid(`${item.id}: invalid padded-input prompt receipt`);
        continue;
      }
      if (!prompt || !HASH.test(prompt.sha256) || !HASH.test(prompt.inputSha256) || !HASH.test(prompt.outputSha256)
          || !['Batch02', 'Batch03 repair-v5'].includes(prompt.batch) || prompt.inputSha256 !== item.sourceSha256
          || prompt.outputSha256 !== item.outputSha256 || typeof prompt.text !== 'string') invalid(`${item.id}: invalid exact prompt reference`);
    }
    if (!Array.isArray(item.animations)) invalid(`${item.id}: animations must be an array`);
    for (const animation of item.animations) {
      if (!animation || typeof animation.id !== 'string' || !animation.id.trim() || animationIds.has(animation.id)
          || typeof animation.label !== 'string' || !animation.label.trim()
          || !HASH.test(animation.basisSourceSha256) || animation.basisSourceSha256 !== item.sourceSha256
          || !HASH.test(animation.basisOutputSha256) || animation.basisOutputSha256 !== item.outputSha256
          || !Array.isArray(animation.playbackOrder) || !animation.playbackOrder.length
          || !animation.frames || typeof animation.frames !== 'object' || Array.isArray(animation.frames)
          || animation.frames.r0?.sha256 !== item.outputSha256
          || animation.playbackOrder[0] !== 'r0'
          || animation.playbackOrder.some((frame) => typeof frame !== 'string' || !/^r\d+$/.test(frame) || !animation.frames[frame])) {
        invalid(`${item.id}: invalid r0-pinned animation`);
      }
      animationIds.add(animation.id);
      for (const [frameId, frame] of Object.entries(animation.frames)) {
        if (!/^r\d+$/.test(frameId) || !frame || !HASH.test(frame.sha256)
            || !Array.isArray(frame.size) || frame.size.length !== 2
            || !frame.size.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION)
            || typeof frame.note !== 'string' || !frame.note.trim()) invalid(`${item.id}: invalid hub frame ${frameId}`);
        if (frameId === 'r0') {
          if (frame.sha256 !== item.outputSha256 || (frame.promptReference !== null
              && !isReviewedCardPrompt(frame.promptReference, item, animation))) {
            invalid(`${item.id}: r0 must be the exact Restyle output with no prompt or an exact padded-input prompt receipt`);
          }
          continue;
        }
        const prompt = frame.promptReference;
        if (!prompt || Object.hasOwn(prompt, 'transform') || typeof prompt.file !== 'string' || !prompt.file.trim() || !HASH.test(prompt.sha256)
            || !HASH.test(prompt.inputSha256) || prompt.inputSha256 !== item.outputSha256
            || !HASH.test(prompt.outputSha256) || prompt.outputSha256 !== frame.sha256
            || typeof prompt.text !== 'string' || !prompt.text.trim()) invalid(`${item.id}: incomplete or mismatched hub prompt reference for ${frameId}`);
      }
      if (typeof animation.playbackEvidence !== 'string' || !animation.playbackEvidence.trim()
          || typeof animation.derivation !== 'string' || !animation.derivation.trim()) invalid(`${item.id}: incomplete animation evidence`);
    }
  }
  if (!Array.isArray(data.externalComparisons)) invalid('external comparisons must be an array');
  for (const item of data.externalComparisons) {
    if (!item || item.id !== 'cok_overland_bigpic1_121' || item.stem !== '074_cok_overland_bigpic1_121'
        || !HASH.test(item.sourceSha256) || !HASH.test(item.outputSha256) || item.runtimeApproved !== true
        || typeof item.approvalEvidence !== 'string' || !item.approvalEvidence.includes('cokTravelRestyleManifest.json')
        || !Array.isArray(item.aliases) || !item.aliases.length) invalid('invalid source-pinned Runtime alias');
    const pair = `${item.sourceSha256}:${item.outputSha256}`;
    if (pairs.has(pair)) invalid('Runtime pair also appears as an inventory card');
    pairs.add(pair);
    for (const alias of item.aliases) {
      if (!alias || typeof alias.ledger !== 'string' || typeof alias.status !== 'string'
          || typeof alias.family !== 'string' || typeof alias.platform !== 'string') invalid('invalid Runtime ledger alias');
    }
    ledgerAliases += item.aliases.length;
  }
  const imageMode = data.imageMode ?? 'bundled';
  if (!['bundled', 'local-pack'].includes(imageMode)) invalid('invalid image packaging mode');
  const imageCountsValid = imageMode === 'bundled'
    ? Number.isInteger(data.counts?.uniquePngFiles) && data.counts.uniquePngFiles >= data.assets.length
      && Number.isSafeInteger(data.counts?.uniquePngBytes) && data.counts.uniquePngBytes > 0
    : data.counts?.uniquePngFiles === 0 && data.counts?.uniquePngBytes === 0;
  if (!data.counts || data.counts.uniquePairs !== data.assets.length
      || !Number.isInteger(data.counts.sourceOutputEdges) || data.counts.sourceOutputEdges < data.assets.length
      || ledgerAliases !== data.counts.sourceOutputEdges + data.counts.tileAliasRows
      || data.counts.externalComparisonAliases !== data.externalComparisons.length
      || data.counts.aliasEdges !== ledgerAliases - data.counts.uniquePairs - data.externalComparisons.length
      || !Number.isInteger(data.counts.ledgerRecords) || data.counts.ledgerRecords < data.counts.eligibleRecords
      || !Number.isInteger(data.counts.eligibleRecords) || data.counts.eligibleRecords < 0
      || !Number.isInteger(data.counts.tileAliasRows) || data.counts.tileAliasRows < 0
      || !Number.isInteger(data.counts.excludedRows) || data.counts.excludedRows < 0
      || !Number.isInteger(data.counts.heldRows) || data.counts.heldRows < 0
      || !imageCountsValid
      || !Array.isArray(data.excluded) || data.excluded.length !== data.counts.excludedRows
      || !Array.isArray(data.held) || data.held.length !== data.counts.heldRows) {
    invalid(`inconsistent counts: ${JSON.stringify(data.counts)}; aliases=${ledgerAliases}; excluded=${data.excluded?.length}; held=${data.held?.length}`);
  }
  return data;
}

export function filterCokGeneratedAssets(assets, { family = 'all', platform = 'all', status = 'all', runtime = 'all', query = '' } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return assets.filter((item) => (family === 'all' || item.families.includes(family))
    && (platform === 'all' || item.platforms.includes(platform))
    && (status === 'all' || item.ledgerStatuses.includes(status))
    && (runtime === 'all' || (runtime === 'approved' ? item.runtimeApproved : !item.runtimeApproved))
    && (!needle || [item.id, item.label, item.family, item.platform, item.sourceName, item.sourceProvenance, item.outputType,
      ...item.runtimeApprovalEvidence,
      ...item.promptReferences.flatMap((prompt) => [prompt.batch, prompt.file, prompt.text]),
      ...item.animations.flatMap((animation) => [animation.label,
        ...Object.values(animation.frames).flatMap((frame) => frame.promptReference ? [frame.promptReference.file, frame.promptReference.text] : [])]),
      ...item.aliases.flatMap((alias) => [alias.ledger, alias.status, alias.sourceArchive ?? '', alias.aliasBasis ?? '', alias.asset ?? '', alias.frame ?? '', alias.tile ?? ''])]
      .join(' ').toLocaleLowerCase().includes(needle)));
}

export function pageCokGeneratedAssets(assets, page = 0, pageSize = 48) {
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 48) {
    throw new Error('CoK inventory pages are limited to 48 assets');
  }
  const pageCount = Math.ceil(assets.length / pageSize);
  const safePage = pageCount ? Math.min(page, pageCount - 1) : 0;
  return { page: safePage, pageCount, total: assets.length, items: assets.slice(safePage * pageSize, (safePage + 1) * pageSize) };
}
