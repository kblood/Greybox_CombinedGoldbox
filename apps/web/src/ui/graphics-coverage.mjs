import { pageGraphicsReviewRows } from './graphics-review-queue.mjs';

const MODES = ['DOS-EGA', 'Amiga', 'Restyle'];
const STATES = ['mapped', 'unmapped', 'unresolved'];
const LOCATORS = ['kind', 'blockId', 'entryIndex', 'frameIndex', 'tileIndex', 'cellIndex', 'glyphIndex'];
const QUERY_KEYS = ['coverage', 'coverageConsumer', 'coverageState', 'coveragePage', 'coverageRequest'];
const HASH = /^[a-f0-9]{64}$/;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const byte = (value) => count(value) && value <= 255;
const word = (value) => count(value) && value <= 65535;
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const owns = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
const strings = (value) => Array.isArray(value) && value.every(nonempty);
const nullableRef = (table, key) => key === null || owns(table, key);
const COMBAT_EVIDENCE = 'docs/engine/research/cok-runtime-art-combat-sites-v2.json';
const BANKS = { 'ECL1.DAX': 'CPIC1', 'ECL2.DAX': 'CPIC2', 'ECL3.DAX': 'CPIC3' };
const BOUNDS = { statesPerBlock: 50000, callDepth: 24, rosterGroups: 16, witnessTail: 12 };
const COMBAT_COUNTS = ['blocksAtStateLimit', 'distinctImmediatePictureIds', 'distinctRosterVariants',
  'entrySiteAssociations', 'entryVariantAssociations', 'exploredStates', 'physicalSites',
  'sitesWithDynamicPictureVariant', 'sitesWithEmptyRosterVariant', 'withDeclaredMapping'];

function requireCoverage(condition, reason) {
  if (!condition) throw new Error(`Invalid CoK graphics coverage: ${reason}`);
}

function tally(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
}

function sameCounts(saved, counted) {
  return Object.keys(saved).length === counted.size && [...counted].every(([key, value]) => saved[key] === value);
}

const sameArray = (left, right) => Array.isArray(left) && left.length === right.length
  && left.every((item, index) => item === right[index]);
const sortedNumbers = (items) => [...items].sort((left, right) => left - right);

function validateSummaryTotals(report) {
  const { summary, requests, sourceAssets, mappings, frames, outputs } = report;
  const outputRows = Object.values(outputs);
  const compositions = Object.values(frames);
  requireCoverage(summary.eclPictureSites.total === requests.length
    && summary.eclPictureSites.dynamic === requests.filter((row) => row.pictureId === null).length
    && summary.eclPictureSites.withConditionalSource === requests.filter((row) => row.sourceIds.length > 0).length
    && summary.canonicalSourceIds === Object.keys(sourceAssets).length && summary.outputPaths === outputRows.length
    && summary.distinctOutputHashes === new Set(outputRows.map((row) => row.sha256)).size
    && summary.frameComponentPlacements === compositions.reduce((sum, row) => sum + row.components.length, 0)
    && sameCounts(summary.mappingEntriesByConsumer, tally(Object.values(mappings), 'consumer'))
    && sameCounts(summary.framesByKind, tally(compositions, 'kind')), 'summary counts disagree with report rows');
}

function combatScope(value) {
  return value?.campaignComplete === false && value.evidenceScope === 'bounded CoK ECL traversal'
    && value.variantRetention === 'all-distinct-discovered-rosters';
}

function combatSite(site, location, bank, bankRecord, rawByPicture) {
  requireCoverage(record(site) && count(site.offset) && Array.isArray(site.variants) && site.variants.length > 0, 'COMBAT site');
  const ids = new Set();
  const orderedRosters = new Set();
  const sitePictures = new Map();
  const entries = new Set();
  const variants = site.variants.map((variant) => {
    requireCoverage(record(variant) && HASH.test(variant.id) && !ids.has(variant.id)
      && record(variant.entries) && Object.keys(variant.entries).length > 0 && Array.isArray(variant.roster)
      && variant.roster.length <= BOUNDS.rosterGroups && variant.roster.every((group) => Array.isArray(group)
        && group.length === 3 && group.every((operand) => Array.isArray(operand) && operand.length === 2
          && byte(operand[0]) && word(operand[1]))), 'COMBAT ordered roster');
    const rosterKey = JSON.stringify(variant.roster);
    requireCoverage(!orderedRosters.has(rosterKey), 'duplicate COMBAT ordered roster');
    orderedRosters.add(rosterKey);
    ids.add(variant.id);
    for (const [entry, witness] of Object.entries(variant.entries)) {
      requireCoverage(nonempty(entry) && record(witness) && count(witness.instructionCount) && witness.instructionCount > 0
        && Array.isArray(witness.offsetTail) && witness.offsetTail.every(count) && witness.offsetTail.at(-1) === site.offset
        && witness.offsetTail.length === Math.min(witness.instructionCount, BOUNDS.witnessTail)
        && witness.truncated === (witness.instructionCount > BOUNDS.witnessTail), 'COMBAT entry witness');
      entries.add(entry);
    }
    const pictureIds = new Set();
    let dynamicPictures = 0;
    for (const [, , [code, raw]] of variant.roster) {
      if (code !== 0) { dynamicPictures++; continue; }
      const picture = raw & 255;
      requireCoverage(owns(bankRecord.pictures, String(picture)), 'missing COMBAT picture binding');
      pictureIds.add(picture);
      if (!sitePictures.has(picture)) sitePictures.set(picture, new Set());
      if (!rawByPicture.has(picture)) rawByPicture.set(picture, new Set());
      sitePictures.get(picture).add(raw);
      rawByPicture.get(picture).add(raw);
    }
    requireCoverage(sameArray(variant.pictureIds, sortedNumbers(pictureIds)), 'COMBAT variant picture IDs');
    return { ...variant, dynamicPictures };
  });
  const bindings = sortedNumbers(sitePictures.keys()).map((pictureId) => ({ pictureId, ...bankRecord.pictures[pictureId],
    rawPictureOperands: sortedNumbers(sitePictures.get(pictureId)) }));
  return { ...location, offset: site.offset, kind: 'combat-site', status: 'bounded-roster-variants', consumer: 'combat-icons', bank,
    bankArchiveSha256: bankRecord.archiveSha256, evidence: COMBAT_EVIDENCE, entries: [...entries], variants, bindings };
}

function collectCombat(report, receipt) {
  requireCoverage(report.combatEvidence === COMBAT_EVIDENCE && HASH.test(report.inputs?.[COMBAT_EVIDENCE])
    && receipt?.schema === 'cok-runtime-art-combat-sites-v2' && combatScope(receipt)
    && record(receipt.limits) && Object.keys(receipt.limits).length === Object.keys(BOUNDS).length
    && Object.entries(BOUNDS).every(([key, value]) => receipt.limits[key] === value)
    && record(receipt.inputs) && Object.keys(receipt.inputs).length > 0
    && Object.entries(receipt.inputs).every(([path, hash]) => HASH.test(hash) && report.inputs[path] === hash)
    && Array.isArray(receipt.archives) && receipt.archives.length === Object.keys(BANKS).length, 'COMBAT receipt pins and bounds');
  const { combatBindings, sourceAssets, mappings, summary: { combatScan: scan } } = report;
  requireCoverage(record(combatBindings) && record(scan.byBank)
    && [combatBindings, scan.byBank].every((table) => Object.keys(table).length === Object.keys(BANKS).length), 'COMBAT bank tables');
  const result = [];
  const archiveNames = new Set();
  const totals = Object.fromEntries(COMBAT_COUNTS.map((key) => [key, 0]));
  const frontiers = new Map();
  const pictureBlocks = new Map();
  for (const archive of receipt.archives) {
    requireCoverage(record(archive) && owns(BANKS, archive.archive) && !archiveNames.has(archive.archive)
      && HASH.test(archive.archiveSha256) && Array.isArray(archive.blocks) && archive.blocks.length > 0, 'COMBAT archive');
    archiveNames.add(archive.archive);
    const bank = BANKS[archive.archive];
    const bankRecord = combatBindings[bank];
    requireCoverage(record(bankRecord) && HASH.test(bankRecord.archiveSha256) && record(bankRecord.pictures), `COMBAT bank ${bank}`);
    const counts = Object.fromEntries(COMBAT_COUNTS.map((key) => [key, 0]));
    const bankFrontiers = new Map();
    const rawByPicture = new Map();
    const blockIds = new Set();
    for (const block of archive.blocks) {
      requireCoverage(record(block) && byte(block.blockId) && !blockIds.has(block.blockId) && HASH.test(block.blockSha256)
        && count(block.exploredStates) && block.exploredStates <= BOUNDS.statesPerBlock
        && Array.isArray(block.frontiers) && Array.isArray(block.sites), 'COMBAT block');
      blockIds.add(block.blockId);
      const location = { archive: archive.archive, archiveSha256: archive.archiveSha256, blockId: block.blockId, blockSha256: block.blockSha256 };
      pictureBlocks.set(`${archive.archive}/${block.blockId}`, location);
      counts.exploredStates += block.exploredStates;
      if (block.frontiers.some((event) => event?.reason === 'state-budget')) counts.blocksAtStateLimit++;
      for (const event of block.frontiers) {
        requireCoverage(record(event) && nonempty(event.reason) && count(event.events) && event.events > 0, 'COMBAT frontier');
        bankFrontiers.set(event.reason, (bankFrontiers.get(event.reason) ?? 0) + event.events);
      }
      const offsets = new Set();
      for (const site of block.sites) {
        const row = combatSite(site, location, bank, bankRecord, rawByPicture);
        requireCoverage(!offsets.has(row.offset), 'duplicate COMBAT site');
        offsets.add(row.offset);
        result.push(row);
        counts.physicalSites++;
        counts.entrySiteAssociations += row.entries.length;
        counts.distinctRosterVariants += row.variants.length;
        counts.entryVariantAssociations += row.variants.reduce((sum, variant) => sum + Object.keys(variant.entries).length, 0);
        if (row.variants.some((variant) => variant.dynamicPictures > 0)) counts.sitesWithDynamicPictureVariant++;
        if (row.variants.some((variant) => !variant.roster.length)) counts.sitesWithEmptyRosterVariant++;
      }
    }
    requireCoverage(rawByPicture.size === Object.keys(bankRecord.pictures).length, `COMBAT picture union for ${bank}`);
    const unmapped = [], unresolved = [];
    for (const pictureId of sortedNumbers(rawByPicture.keys())) {
      const binding = bankRecord.pictures[pictureId];
      requireCoverage(record(binding) && sameArray(binding.rawPictureOperands, sortedNumbers(rawByPicture.get(pictureId)))
        && nullableRef(sourceAssets, binding.sourceId) && nullableRef(mappings, binding.mappingId), 'COMBAT binding');
      if (binding.sourceId !== null) {
        const source = sourceAssets[binding.sourceId];
        requireCoverage(source.platform === 'DOS-EGA' && source.archive.toUpperCase() === `${bank}.DAX`
          && source.archiveSha256 === bankRecord.archiveSha256 && source.locator.blockId === pictureId
          && source.locator.kind === 'block-frame' && source.locator.frameIndex === 0, 'COMBAT source locator');
      } else unresolved.push(pictureId);
      if (binding.mappingId === null) unmapped.push(pictureId);
      else {
        requireCoverage(binding.sourceId !== null && binding.mappingId === `combat/${bank}/${pictureId}`
          && mappings[binding.mappingId].baseSourceId === binding.sourceId, 'COMBAT mapping association');
        counts.withDeclaredMapping++;
      }
    }
    counts.distinctImmediatePictureIds = rawByPicture.size;
    const saved = scan.byBank[bank];
    requireCoverage(record(saved) && COMBAT_COUNTS.every((key) => saved[key] === counts[key])
      && sameArray(saved.unmappedPictureIds, unmapped) && sameArray(saved.unresolvedSourcePictureIds, unresolved)
      && record(saved.frontierEventsByReason) && sameCounts(saved.frontierEventsByReason, bankFrontiers), `summary counts for ${bank}`);
    for (const [reason, count] of bankFrontiers) frontiers.set(reason, (frontiers.get(reason) ?? 0) + count);
    for (const key of COMBAT_COUNTS) totals[key] += counts[key];
  }
  requireCoverage(COMBAT_COUNTS.every((key) => scan[key] === totals[key])
    && record(scan.frontierEventsByReason) && sameCounts(scan.frontierEventsByReason, frontiers)
    && scan.hasExplorationFrontiers === (frontiers.size > 0), 'summary counts for COMBAT traversal');
  return { result, pictureBlocks, limits: receipt.limits };
}

export function coverageSourceMatches(source, asset) {
  return Boolean(source && asset && asset.identityStatus === 'source-pinned'
    && asset.platform === source.platform
    && asset.archive.name.toUpperCase() === source.archive.toUpperCase()
    && asset.archive.sha256 === source.archiveSha256
    && LOCATORS.every((key) => (asset.locator[key] ?? null) === (source.locator[key] ?? null)));
}

export function createCoverageLoader(load, assets) {
  let pending;
  return () => pending ??= Promise.resolve().then(load).then(({ report, receipt }) => buildCoverageModel(report, assets, receipt));
}

export function buildCoverageModel(report, assets, receipt) {
  requireCoverage(record(report) && report.schema === 'cok-runtime-art-coverage-v2', 'report version');
  const summary = report.summary;
  const scan = summary?.combatScan;
  requireCoverage(combatScope(scan) && report.pictureEvidenceScope === 'fixed encoded operands with bounded entry witnesses'
    && report.runtimeObservation === 'unverified' && report.productionPackage === 'unverified', 'evidence scope');
  requireCoverage(strings(report.limitations) && report.limitations.length > 0, 'limitations');
  const { consumers, sourceAssets, outputs, restyleRecords, mappings, frames, requests, demoCombat, originalVariants,
    originalSourceUses } = report;
  requireCoverage([consumers, sourceAssets, outputs, restyleRecords, mappings, frames, originalVariants].every(record)
    && Array.isArray(originalSourceUses)
    && Array.isArray(requests), 'report tables');
  requireCoverage([summary.eclPictureSites, summary.framesByKind, summary.mappingEntriesByConsumer].every(record), 'summary tables');
  for (const [id, row] of Object.entries(consumers)) {
    requireCoverage(record(row) && strings(row.sources)
      && MODES.every((mode) => nonempty(row.modeBehavior?.[mode])), `consumer ${id}`);
  }
  for (const [id, source] of Object.entries(sourceAssets)) {
    requireCoverage(record(source) && nonempty(source.platform) && nonempty(source.archive) && HASH.test(source.archiveSha256)
      && record(source.locator) && nonempty(source.locator.kind)
      && LOCATORS.slice(1).every((key) => source.locator[key] == null || count(source.locator[key]))
      && strings(source.restyleRecordIds) && source.restyleRecordIds.every((key) => owns(restyleRecords, key)), `source ${id}`);
  }
  for (const [id, output] of Object.entries(outputs)) {
    requireCoverage(record(output) && HASH.test(output.sha256), `output ${id}`);
  }
  for (const [id, row] of Object.entries(restyleRecords)) {
    requireCoverage(record(row) && nonempty(row.registryReview) && nonempty(row.promptStatus)
      && Array.isArray(row.outputs) && row.outputs.every((output) =>
        record(output) && HASH.test(output.sha256) && nonempty(output.role)), `Restyle record ${id}`);
  }

  const usage = new Map(Object.keys(sourceAssets).map((id) => [id, { requests: [], mappings: [], frames: [],
    originalVariants: [], originalSourceUses: [], demo: [] }]));
  for (const [id, row] of Object.entries(mappings)) {
    requireCoverage(record(row) && owns(consumers, row.consumer) && owns(outputs, row.outputPath)
      && nullableRef(sourceAssets, row.baseSourceId) && nullableRef(sourceAssets, row.generationSourceId)
      && ['runtime-declared', 'admitted', 'held'].includes(row.admission)
      && nonempty(row.compositionStatus) && nonempty(row.sourceStatus) && nonempty(row.sourcePngComparison)
      && strings(row.exactRestyleRecordIds) && row.exactRestyleRecordIds.every((key) =>
        owns(restyleRecords, key) && sourceAssets[row.generationSourceId]?.restyleRecordIds.includes(key)
        && restyleRecords[key].outputs.some((output) => output.sha256 === outputs[row.outputPath].sha256)), `mapping ${id}`);
    usage.get(row.baseSourceId)?.mappings.push({ id, role: 'base source' });
    usage.get(row.generationSourceId)?.mappings.push({ id, role: 'generation source' });
  }
  for (const [id, row] of Object.entries(frames)) {
    requireCoverage(record(row) && nonempty(row.admission) && nonempty(row.kind) && strings(row.consumerIds)
      && row.consumerIds.every((key) => owns(consumers, key)) && Array.isArray(row.components), `composition ${id}`);
    for (const component of row.components) {
      requireCoverage(record(component) && owns(mappings, component.mappingId) && nonempty(component.role), `component ${id}`);
      const mapping = mappings[component.mappingId];
      for (const source of new Set([mapping.baseSourceId, mapping.generationSourceId])) {
        usage.get(source)?.frames.push({ id, component });
      }
    }
  }
  for (const [id, source] of Object.entries(originalVariants)) {
    requireCoverage(owns(sourceAssets, source), `original variant ${id}`);
    usage.get(source).originalVariants.push(id);
  }

  const expectedOriginalUses = {
    'town/frame': { blockId: 202, kind: 'tile', indexField: 'tileIndex', first: 20, last: 25,
      prefix: 'cok/dos-ega/disk1/8x8d1.dax/block/202/tile/' },
    'town/font': { blockId: 201, kind: 'glyph', indexField: 'glyphIndex', first: 0, last: 63,
      prefix: 'cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/' },
  };
  const expectedConsumers = ['main-menu', 'town-services'];
  requireCoverage(originalSourceUses.length === Object.keys(expectedOriginalUses).length, 'Town original source-use records');
  const seenUseIds = new Set();
  for (const use of originalSourceUses) {
    const expected = expectedOriginalUses[use?.id];
    const expectedIds = expected ? Array.from({ length: expected.last - expected.first + 1 }, (_, i) => `${expected.prefix}${i + expected.first}`) : [];
    requireCoverage(expected && !seenUseIds.has(use.id) && sameArray(use.consumerIds, expectedConsumers)
      && use.platform === 'DOS-EGA' && use.archive === '8X8D1.DAX'
      && use.archiveSha256 === '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915'
      && use.blockId === expected.blockId && use.locatorKind === expected.kind && use.indexField === expected.indexField
      && nonempty(use.selectionScope) && strings(use.evidence) && use.evidence.length > 0
      && sameArray(use.sourceIds, expectedIds), `original source use ${use?.id}`);
    seenUseIds.add(use.id);
    for (const id of use.sourceIds) {
      const source = sourceAssets[id];
      const asset = assets.find((candidate) => candidate.id === id);
      requireCoverage(source && coverageSourceMatches(source, asset) && source.platform === use.platform
        && source.archive === use.archive && source.archiveSha256 === use.archiveSha256
        && source.locator.kind === use.locatorKind && source.locator.blockId === use.blockId
        && Number.isSafeInteger(source.locator[use.indexField])
        && id === `${expected.prefix}${source.locator[use.indexField]}`, `original source identity ${id}`);
      usage.get(id).originalSourceUses.push({ id: use.id, consumerIds: [...use.consumerIds], selectionScope: use.selectionScope,
        evidence: use.evidence });
    }
  }

  const combat = collectCombat(report, receipt);
  const requestById = new Map();
  const rows = [...combat.result, ...requests].map((request) => {
    requireCoverage(record(request) && owns(consumers, request.consumer) && nonempty(request.archive)
      && HASH.test(request.archiveSha256) && HASH.test(request.blockSha256) && count(request.blockId)
      && count(request.offset) && nonempty(request.status) && nonempty(request.evidence), 'request identity');
    let sources, mappingIds, states;
    if (request.kind === 'combat-site') {
      sources = request.bindings.flatMap((item) => item.sourceId === null ? [] : [item.sourceId]);
      mappingIds = request.bindings.flatMap((item) => item.mappingId === null ? [] : [item.mappingId]);
      states = request.bindings.map((item) => item.mappingId ? 'mapped' : item.sourceId ? 'unmapped' : 'unresolved');
      if (request.variants.some((variant) => variant.dynamicPictures || !variant.roster.length)) states.push('unresolved');
    } else {
      const pinned = combat.pictureBlocks.get(`${request.archive}/${request.blockId}`);
      requireCoverage(request.kind === 'ecl-picture' && (request.pictureId === null || word(request.pictureId))
        && pinned?.archiveSha256 === request.archiveSha256 && pinned.blockSha256 === request.blockSha256
        && strings(request.entries) && strings(request.sourceIds) && strings(request.conditionalMappingIds)
        && request.sourceIds.every((id) => owns(sourceAssets, id)) && request.conditionalMappingIds.every((id) =>
          owns(mappings, id) && request.sourceIds.includes(mappings[id].baseSourceId)), 'PICTURE request');
      requireCoverage((request.pictureId !== null && request.status !== 'non-graphic-sentinel') || !request.sourceIds.length,
        'unresolved or non-graphic PICTURE source');
      const { operand, entryWitnesses } = request;
      requireCoverage(record(operand) && byte(operand.code) && word(operand.value)
        && (request.pictureId === null ? operand.kind === 'dynamic' && operand.code !== 0
          : operand.kind === 'immediate' && operand.code === 0 && request.pictureId === operand.value)
        && new Set(request.entries).size === request.entries.length && request.entries.length > 0
        && Array.isArray(entryWitnesses) && entryWitnesses.length === request.entries.length
        && entryWitnesses.every((witness, index) => record(witness) && witness.entry === request.entries[index]
          && count(witness.instructionSteps) && count(witness.branchEdgeCount)
          && HASH.test(witness.offsetPathSha256) && HASH.test(witness.branchEdgesSha256)), 'PICTURE operand and entry witnesses');
      sources = request.sourceIds;
      mappingIds = request.conditionalMappingIds;
      states = request.status === 'non-graphic-sentinel' ? ['sentinel']
        : [mappingIds.length ? 'mapped' : sources.length ? 'unmapped' : 'unresolved'];
    }
    const id = [request.kind, request.archive, request.blockId, request.offset, ''].join('/');
    requireCoverage(!requestById.has(id), `duplicate request ${id}`);
    const row = { id, request, sources: [...new Set(sources)], mappingIds: [...new Set(mappingIds)], states: [...new Set(states)] };
    requestById.set(id, row);
    for (const source of row.sources) usage.get(source).requests.push(row);
    return row;
  });
  validateSummaryTotals(report);

  requireCoverage(record(demoCombat) && nonempty(demoCombat.archive) && nonempty(demoCombat.bank)
    && HASH.test(demoCombat.archiveSha256) && HASH.test(demoCombat.blockSha256) && count(demoCombat.blockId)
    && count(demoCombat.offset) && strings(demoCombat.evidence) && Array.isArray(demoCombat.bindings), 'demo fixture');
  const demoSlots = new Set();
  for (const slot of demoCombat.bindings) {
    requireCoverage(record(slot) && nonempty(slot.slot) && !demoSlots.has(slot.slot)
      && count(slot.pictureId) && owns(sourceAssets, slot.sourceId) && owns(mappings, slot.mappingId)
      && mappings[slot.mappingId].baseSourceId === slot.sourceId
      && sourceAssets[slot.sourceId].archive.toUpperCase() === `${demoCombat.bank.toUpperCase()}.DAX`
      && sourceAssets[slot.sourceId].locator.blockId === slot.pictureId
      && sourceAssets[slot.sourceId].locator.frameIndex === 0, 'demo slot');
    demoSlots.add(slot.slot);
    usage.get(slot.sourceId).demo.push(slot);
  }

  const sourceLinks = new Map();
  const registryById = new Map();
  for (const asset of assets) registryById.set(asset.id, registryById.has(asset.id) ? null : asset);
  for (const [id, source] of Object.entries(sourceAssets)) {
    if (coverageSourceMatches(source, registryById.get(id))) sourceLinks.set(id, id);
  }
  return { report, rows, requestById, usage, sourceLinks, combatLimits: combat.limits,
    demoPictureIds: new Set(demoCombat.bindings.map((slot) => slot.pictureId)).size };
}

/** Project validated, exact source-linked coverage without upgrading it to observed runtime use. */
export function summarizeCoverageForSources(model, sourceAssetIds) {
  return sourceAssetIds.map((id) => {
    if (!model.sourceLinks.has(id)) return { id, status: 'not-in-snapshot', runtimeObservation: model.report.runtimeObservation,
      requests: [], mappings: [], frames: [], originalVariants: [], originalSourceUses: [], demoSlots: [] };
    const usage = model.usage.get(id);
    if (!usage) return { id, status: 'not-in-snapshot', runtimeObservation: model.report.runtimeObservation,
      requests: [], mappings: [], frames: [], originalVariants: [], originalSourceUses: [], demoSlots: [] };
    return { id, status: 'matched', runtimeObservation: model.report.runtimeObservation,
      requests: usage.requests.map(({ request, states }) => ({ consumer: request.consumer, status: request.status, states: [...states] })),
      mappings: usage.mappings.map(({ id: mappingId, role }) => {
        const mapping = model.report.mappings[mappingId];
        return { consumer: mapping.consumer, role, admission: mapping.admission,
          compositionStatus: mapping.compositionStatus, sourceStatus: mapping.sourceStatus, evidence: mapping.evidence };
      }),
      frames: usage.frames.map(({ id: frameId }) => {
        const frame = model.report.frames[frameId];
        return { id: frameId, kind: frame.kind, admission: frame.admission, consumerIds: [...frame.consumerIds] };
      }),
      originalVariants: [...usage.originalVariants],
      originalSourceUses: usage.originalSourceUses.map((row) => ({ ...row, evidence: [...row.evidence] })),
      demoSlots: usage.demo.map(({ slot }) => slot) };
  });
}

export function readCoverageQuery(params, model) {
  const consumer = params.get('coverageConsumer');
  const state = params.get('coverageState');
  const page = params.get('coveragePage') ?? '';
  const query = {
    consumer: model.rows.some((row) => row.request.consumer === consumer) ? consumer : 'all',
    state: STATES.includes(state) ? state : 'all',
    page: /^\d+$/.test(page) && count(Number(page)) ? Number(page) : 0,
    request: '',
  };
  const request = params.get('coverageRequest') ?? '';
  const legacy = /^combat-entry\/([^/]+\/\d+\/\d+\/)\w+$/.exec(request);
  const target = model.requestById.get(legacy ? `combat-site/${legacy[1]}` : request);
  if (target && (!legacy || target.request.entries.includes(request.split('/').at(-1)))) {
    const index = filteredRequests(model, query).indexOf(target);
    if (index >= 0) { query.request = target.id; query.page = Math.floor(index / 48); }
  }
  return query;
}

export function clearCoverageQuery(params) {
  for (const key of QUERY_KEYS) params.delete(key);
}

export function writeCoverageQuery(params, state) {
  const next = new URLSearchParams(params);
  clearCoverageQuery(next);
  for (const key of ['id', 'appearance', 'review', 'reviewPlatform', 'reviewPage', 'q', 'restyle']) next.delete(key);
  next.set('graphics', '1');
  next.set('coverage', '1');
  if (state.consumer !== 'all') next.set('coverageConsumer', state.consumer);
  if (state.state !== 'all') next.set('coverageState', state.state);
  if (state.page > 0) next.set('coveragePage', String(state.page));
  if (state.request) next.set('coverageRequest', state.request);
  return next;
}

function filteredRequests(model, state) {
  return model.rows.filter((row) => (state.consumer === 'all' || row.request.consumer === state.consumer)
    && (state.state === 'all' || row.states.includes(state.state)));
}

export function pageCoverageRequests(model, state, size = 48) {
  return pageGraphicsReviewRows(filteredRequests(model, state), state.page, size);
}
