import { pageCoverageRequests, readCoverageQuery, writeCoverageQuery } from './graphics-coverage.mjs';
import type { CoverageModel, CoverageRequestRow } from './graphics-coverage.mjs';

type OpenSource = (id: string) => void;
type EvidenceLocation = { archive: string; archiveSha256: string; blockId: number; blockSha256: string; offset: number };

function elem<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const node = elem('button', undefined, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function details(label: string): HTMLDetailsElement {
  const node = elem('details', 'gbx-card');
  node.append(elem('summary', undefined, label));
  return node;
}

function sourceRef(model: CoverageModel, id: string, openSource: OpenSource): HTMLElement {
  const exactId = model.sourceLinks.get(id);
  if (!exactId) return elem('p', 'gbx-muted gbx-unknown', `Source link unavailable for ${id}. The current registry lacks a matching archive and locator.`);
  const source = model.report.sourceAssets[id]!;
  const open = button(id, () => openSource(exactId));
  open.dataset.coverageSource = id;
  const row = elem('p', 'gbx-small');
  row.append(open, document.createTextNode(` · ${source.platform} · ${source.archive}`));
  return row;
}

function locationText(row: EvidenceLocation): string {
  return `${row.archive} · block ${row.blockId} · offset ${row.offset} (0x${row.offset.toString(16)})`;
}

function locationEvidence(row: EvidenceLocation): HTMLElement {
  const evidence = details('Archive and block evidence');
  evidence.append(elem('p', 'gbx-small', `Archive SHA-256 ${row.archiveSha256}`),
    elem('p', 'gbx-small', `Block SHA-256 ${row.blockSha256}`));
  return evidence;
}

function fallback(model: CoverageModel, consumerId: string): HTMLElement {
  const consumer = model.report.consumers[consumerId]!;
  const section = details(`Mode behavior and fallback · ${consumerId}`);
  const terms = elem('dl');
  for (const mode of ['DOS-EGA', 'Amiga', 'Restyle'] as const) {
    terms.append(elem('dt', undefined, mode), elem('dd', 'gbx-muted', consumer.modeBehavior[mode]));
  }
  section.append(terms, elem('p', 'gbx-small', `Consumer evidence · ${consumer.sources.join(' · ')}`));
  return section;
}

function mappingCard(model: CoverageModel, id: string, openSource: OpenSource): HTMLElement {
  const mapping = model.report.mappings[id]!;
  const output = model.report.outputs[mapping.outputPath]!;
  const card = details(`${id} · ${mapping.admission}`);
  card.dataset.coverageMapping = id;
  card.append(elem('p', 'gbx-muted', `Admission ${mapping.admission} · composition ${mapping.compositionStatus} · source ${mapping.sourceStatus}`));
  if (mapping.admissionReason) card.append(elem('p', 'gbx-muted', mapping.admissionReason));
  for (const [label, source] of [['Base source', mapping.baseSourceId], ['Generation source', mapping.generationSourceId]] as const) {
    card.append(elem('h4', undefined, label), source
      ? sourceRef(model, source, openSource) : elem('p', 'gbx-muted gbx-unknown', 'Source locator unresolved.'));
  }
  card.append(elem('p', 'gbx-small', `Declared output · ${mapping.outputPath} · SHA-256 ${output.sha256}`),
    elem('p', 'gbx-small', `Output availability unverified in this snapshot · source PNG comparison ${mapping.sourcePngComparison}`));
  for (const restyleId of mapping.exactRestyleRecordIds) {
    const record = model.report.restyleRecords[restyleId]!;
    card.append(elem('p', 'gbx-small', `Exact Restyle record · ${restyleId} · registry review ${record.registryReview} · prompt ${record.promptStatus}`));
  }
  if (!mapping.exactRestyleRecordIds.length) card.append(elem('p', 'gbx-muted', 'No exact source and output match to a Restyle record is recorded.'));
  card.append(elem('p', 'gbx-small', `Mapping evidence · ${mapping.evidence}`), fallback(model, mapping.consumer));
  return card;
}

function showRequest(panel: HTMLElement, model: CoverageModel, row: CoverageRequestRow, openSource: OpenSource): void {
  const request = row.request;
  const kind = request.kind === 'combat-site' ? 'COMBAT' : 'PICTURE';
  panel.replaceChildren(elem('h2', undefined, `${kind} · ${locationText(request)}`),
    elem('p', 'gbx-muted', `${request.consumer} · ${request.status} · ${row.states.join(' / ')}`),
    locationEvidence(request), elem('p', 'gbx-small', `Request evidence · ${request.evidence}`));
  if (request.kind === 'combat-site') {
    panel.append(elem('p', 'gbx-small', `Entries ${request.entries.join(', ')} · bank ${request.bank} · bank SHA-256 ${request.bankArchiveSha256}`),
      elem('p', 'gbx-muted', `${request.variants.length} distinct ordered rosters found by bounded traversal. The same roster may be reached from multiple entries.`));
    for (const [index, variant] of request.variants.entries()) {
      const roster = details(`Roster ${index + 1} · ${variant.roster.length} groups · ${variant.dynamicPictures} dynamic picture operands`);
      roster.dataset.coverageVariant = variant.id;
      if (!variant.roster.length) roster.append(elem('p', 'gbx-muted gbx-unknown', 'Empty roster on this variant.'));
      const groups = elem('ol');
      for (const [creature, quantity, picture] of variant.roster) {
        const encoded = ([code, value]: [number, number]) => `code ${code}, value ${value}`;
        groups.append(elem('li', undefined, `Creature (${encoded(creature)}) · quantity (${encoded(quantity)}) · picture (${encoded(picture)}) · `
          + (picture[0] === 0 ? `${request.bank} #${picture[1] & 255}` : 'dynamic picture unresolved')));
      }
      if (variant.roster.length) roster.append(groups);
      const witnesses = details('Entry witnesses');
      for (const [entry, witness] of Object.entries(variant.entries)) {
        witnesses.append(elem('p', 'gbx-small', `${entry} · ${witness.instructionCount} instructions · ${witness.truncated ? 'offset tail' : 'offsets'} ${witness.offsetTail.join(', ')}`));
      }
      roster.append(witnesses);
      panel.append(roster);
    }
    if (!request.bindings.length) panel.append(elem('p', 'gbx-muted gbx-unknown', 'No immediate picture source is recorded at this site.'));
    for (const binding of request.bindings) {
      panel.append(elem('h3', undefined, `${request.bank} picture ${binding.pictureId}`),
        elem('p', 'gbx-small', `Stored operands · ${binding.rawPictureOperands.join(', ')}`),
        binding.sourceId ? sourceRef(model, binding.sourceId, openSource) : elem('p', 'gbx-muted gbx-unknown', 'Source unresolved.'));
      if (binding.mappingId) panel.append(mappingCard(model, binding.mappingId, openSource));
      else panel.append(elem('p', 'gbx-muted', 'No declared Restyle mapping for this binding.'));
    }
  } else {
    panel.append(elem('p', 'gbx-small', `Entries · ${request.entries.join(', ')} · ${request.pictureId === null ? 'Dynamic operand' : `Picture ${request.pictureId}`} · code ${request.operand.code}, encoded value ${request.operand.value}`));
    const witnesses = details('Entry witnesses');
    for (const witness of request.entryWitnesses) {
      witnesses.append(elem('p', 'gbx-small', `${witness.entry} · ${witness.instructionSteps} instructions · ${witness.branchEdgeCount} branch edges`),
        elem('p', 'gbx-small', `Offsets SHA-256 ${witness.offsetPathSha256} · branch edges SHA-256 ${witness.branchEdgesSha256}`));
    }
    panel.append(witnesses);
    for (const id of row.sources) panel.append(sourceRef(model, id, openSource));
    if (!row.sources.length) panel.append(elem('p', 'gbx-muted gbx-unknown',
      request.status === 'non-graphic-sentinel' ? 'This operand is a non-graphic sentinel.' : 'Source unresolved.'));
    for (const id of row.mappingIds) panel.append(mappingCard(model, id, openSource));
    if (!row.mappingIds.length) panel.append(elem('p', 'gbx-muted', 'No conditional Restyle mapping is recorded for this request.'));
  }
  panel.append(fallback(model, request.consumer));
}

function overview(model: CoverageModel, openSource: OpenSource): HTMLElement {
  const { summary, demoCombat, limitations } = model.report;
  const { combatScan, eclPictureSites } = summary;
  const section = elem('section', 'gbx-card');
  const scope = elem('p', 'gbx-muted gbx-unknown', 'Campaign coverage is incomplete. COMBAT retains every distinct ordered roster discovered by the bounded DOS ECL traversal. Host effects, cross-ECL transitions, and dynamic branch feasibility are outside this model. Runtime observation and production packaging are unverified.');
  scope.dataset.coverageScope = 'partial';
  section.append(elem('h2', undefined, 'CoK runtime graphics coverage'), scope,
    elem('p', 'gbx-muted', `PICTURE sites: ${eclPictureSites.total} surveyed, ${eclPictureSites.withConditionalSource} with conditional source evidence, ${eclPictureSites.dynamic} dynamic.`),
    elem('p', 'gbx-muted', `COMBAT: ${combatScan.physicalSites} physical sites, ${combatScan.distinctRosterVariants} distinct ordered rosters, ${combatScan.entrySiteAssociations} entry/site associations and ${combatScan.entryVariantAssociations} entry/variant associations.`),
    elem('p', 'gbx-muted', `${combatScan.sitesWithDynamicPictureVariant} sites with a dynamic picture variant · ${combatScan.sitesWithEmptyRosterVariant} sites with an empty roster variant.`));
  const banks = elem('ul');
  for (const [bank, counts] of Object.entries(combatScan.byBank)) {
    banks.append(elem('li', undefined, `${bank} · ${counts.withDeclaredMapping}/${counts.distinctImmediatePictureIds} identified picture IDs with declared mappings · ${counts.distinctRosterVariants} rosters · ${counts.sitesWithDynamicPictureVariant} sites with a dynamic picture variant · ${counts.sitesWithEmptyRosterVariant} sites with an empty roster variant`
      + (counts.unmappedPictureIds.length ? ` · unmapped IDs ${counts.unmappedPictureIds.join(', ')}` : '')));
  }
  const mappingCount = Object.values(summary.mappingEntriesByConsumer).reduce((sum, value) => sum + value, 0);
  section.append(elem('p', 'gbx-muted', `${combatScan.withDeclaredMapping}/${combatScan.distinctImmediatePictureIds} bank-qualified picture IDs discovered by the bounded traversal have declared mappings.`),
    banks, elem('p', 'gbx-muted', `${summary.canonicalSourceIds} canonical source locators · ${mappingCount} declared mapping and component rows · ${summary.outputPaths} output paths · ${summary.distinctOutputHashes} distinct output hashes.`),
    elem('p', 'gbx-muted', `Composition slots · ${Object.entries(summary.framesByKind).map(([kind, total]) => `${total} ${kind}`).join(' · ')} · ${summary.frameComponentPlacements} component placements.`));
  const limits = details('Traversal bounds and evidence');
  const frontierCounts = Object.entries(combatScan.frontierEventsByReason);
  limits.append(elem('p', 'gbx-muted', `${combatScan.exploredStates} explored states · ${combatScan.blocksAtStateLimit} blocks reached the state limit · ${combatScan.hasExplorationFrontiers
    ? frontierCounts.map(([reason, events]) => `${events} ${reason}`).join(', ') : 'zero recorded exploration frontiers for these inputs'}.`),
    elem('p', 'gbx-muted', `Bounds: ${model.combatLimits.statesPerBlock.toLocaleString()} states per block, ${model.combatLimits.callDepth} call frames, ${model.combatLimits.rosterGroups} queued groups, ${model.combatLimits.witnessTail} retained offsets per witness.`));
  for (const limit of limitations) limits.append(elem('p', 'gbx-muted', limit));
  const demo = details(`Separate combat demo fixture · ${demoCombat.bindings.length} slots · ${model.demoPictureIds} distinct ${demoCombat.bank} picture IDs`);
  demo.dataset.coverageDemo = 'true';
  demo.append(elem('p', 'gbx-muted', locationText(demoCombat)), locationEvidence(demoCombat),
    elem('p', 'gbx-small', demoCombat.evidence.join(' · ')));
  for (const slot of demoCombat.bindings) {
    const row = elem('div', 'gbx-card');
    row.dataset.coverageDemoSlot = slot.slot;
    row.append(elem('p', 'gbx-small', `${slot.slot} · picture ${slot.pictureId} · ${slot.mappingId}`), sourceRef(model, slot.sourceId, openSource));
    demo.append(row);
  }
  const comparison = elem('a', undefined, 'Open before / after comparisons');
  comparison.href = '?restyle=1';
  const town = details('Town and main-menu original-source use · 70 addressable graphics IDs');
  town.append(elem('p', 'gbx-muted', 'Both routes currently render their DOS-EGA border and font in every graphics mode. Their selected DOS archive is not hash-verified by these routes; no Amiga or Restyle replacement is admitted, and runtime observation remains unverified.'));
  for (const use of model.report.originalSourceUses) {
    const group = details(`${use.id} · ${use.sourceIds.length} source IDs`);
    group.append(elem('p', 'gbx-muted', use.selectionScope),
      elem('p', 'gbx-small', `${use.platform} · ${use.archive} · archive SHA-256 ${use.archiveSha256} · block ${use.blockId} · ${use.locatorKind}`),
      elem('p', 'gbx-small', `Consumers · ${use.consumerIds.join(', ')}`),
      elem('p', 'gbx-small', `Use evidence · ${use.evidence.join(' · ')}`));
    for (const id of use.sourceIds) group.append(sourceRef(model, id, openSource));
    town.append(group);
  }
  section.append(limits, demo, town, comparison);
  return section;
}

export function renderCoverageMode(container: HTMLElement, model: CoverageModel, openSource: OpenSource): void {
  const state = readCoverageQuery(new URLSearchParams(location.search), model);
  const controls = elem('div', 'gbx-toolbar');
  const consumer = elem('select'); consumer.setAttribute('aria-label', 'Coverage consumer');
  consumer.append(new Option('All request consumers', 'all'), ...[...new Set(model.rows.map((row) => row.request.consumer))]
    .sort().map((id) => new Option(id, id)));
  const filter = elem('select'); filter.setAttribute('aria-label', 'Coverage mapping state');
  filter.append(new Option('All mapping states', 'all'), new Option('Declared mapping', 'mapped'),
    new Option('Identified source without mapping', 'unmapped'), new Option('Unresolved request or operand', 'unresolved'));
  consumer.value = state.consumer;
  filter.value = state.state;
  const previous = button('Previous', () => { state.page--; draw(); }); previous.dataset.coveragePrevious = 'true';
  const next = button('Next', () => { state.page++; draw(); }); next.dataset.coverageNext = 'true';
  const count = elem('span', 'gbx-muted'); count.dataset.coveragePage = 'true';
  controls.append(consumer, filter, previous, count, next);
  const layout = elem('div', 'gbx-layout');
  const list = elem('nav', 'gbx-list'); list.setAttribute('aria-label', 'CoK coverage requests');
  const panel = elem('section', 'gbx-panel'); panel.setAttribute('aria-live', 'polite');
  layout.append(list, panel);
  container.replaceChildren(overview(model, openSource), controls, layout);
  const draw = () => {
    const paged = pageCoverageRequests(model, state);
    state.page = paged.page;
    const active = paged.items.find((row) => row.id === state.request) ?? paged.items[0];
    state.request = active?.id ?? '';
    previous.disabled = paged.page === 0;
    next.disabled = paged.page + 1 >= paged.pageCount;
    count.textContent = `${paged.total} matching request rows · page ${paged.pageCount ? paged.page + 1 : 0}/${paged.pageCount}`;
    list.replaceChildren();
    for (const row of paged.items) {
      const node = button(locationText(row.request), () => { state.request = row.id; draw(); });
      node.className = 'gbx-pick';
      node.dataset.coverageRequest = row.id;
      node.setAttribute('aria-current', String(row.id === state.request));
      node.append(elem('small', undefined, `${row.request.kind} · ${row.states.join(' / ')}`));
      list.append(node);
    }
    if (active) showRequest(panel, model, active, openSource);
    else panel.replaceChildren(elem('p', 'gbx-empty', 'No recorded requests match these filters.'));
    history.replaceState(null, '', `${location.pathname}?${writeCoverageQuery(new URLSearchParams(location.search), state)}${location.hash}`);
  };
  consumer.addEventListener('change', () => { state.consumer = consumer.value; state.page = 0; draw(); });
  filter.addEventListener('change', () => {
    if (filter.value === 'mapped' || filter.value === 'unmapped' || filter.value === 'unresolved') state.state = filter.value;
    else state.state = 'all';
    state.page = 0;
    draw();
  });
  draw();
}

export function renderSourceCoverage(container: HTMLElement, model: CoverageModel, id: string, openSource: OpenSource): void {
  container.replaceChildren();
  const usage = model.usage.get(id);
  if (!usage) {
    container.append(elem('p', 'gbx-muted', 'Not recorded in this coverage snapshot.'));
    return;
  }
  if (!model.sourceLinks.has(id)) {
    container.append(elem('p', 'gbx-muted gbx-unknown', 'Coverage unavailable for this identity. The current archive and locator do not match the snapshot.'));
    return;
  }
  container.append(elem('p', 'gbx-muted', 'Incomplete static coverage. Runtime observation and production packaging are unverified.'));
  const { requests, mappings, frames, originalVariants, originalSourceUses, demo } = usage;
  container.append(elem('p', 'gbx-small', `${requests.length} request rows · ${mappings.length} mapping roles · ${frames.length} composition placements · ${originalSourceUses.length} original-source use records · ${demo.length} demo slots`));
  const requestList = details('Recorded requests');
  for (const row of requests.slice(0, 48)) {
    const link = elem('a', 'gbx-small', `${locationText(row.request)} · ${row.request.status}`);
    const page = Math.floor(model.rows.indexOf(row) / 48);
    link.href = `?${writeCoverageQuery(new URLSearchParams(), { consumer: 'all', state: 'all', page, request: row.id })}`;
    const entry = elem('p'); entry.append(link); requestList.append(entry);
  }
  if (requests.length > 48) requestList.append(elem('p', 'gbx-muted', 'Showing the first 48 requests. Open the coverage view to browse the full snapshot.'));
  if (requests.length) container.append(requestList);
  const roles = new Map<string, string[]>();
  for (const { id: mappingId, role } of mappings) roles.set(mappingId, [...(roles.get(mappingId) ?? []), role]);
  for (const [mappingId, labels] of roles) {
    container.append(elem('p', 'gbx-small', labels.join(' / ')), mappingCard(model, mappingId, openSource));
  }
  for (const { id: compositionId, component } of frames) {
    const frame = model.report.frames[compositionId]!;
    container.append(elem('p', 'gbx-small', `Composition · ${compositionId} · ${component.role} · ${frame.admission} · ${frame.consumerIds.join(', ')}`));
  }
  const directConsumers = new Set([
    ...requests.map((row) => row.request.consumer),
    ...frames.flatMap((row) => model.report.frames[row.id]!.consumerIds),
  ]);
  for (const consumerId of directConsumers) container.append(fallback(model, consumerId));
  for (const variant of originalVariants) container.append(elem('p', 'gbx-small', `Original variant · ${variant}`));
  for (const use of originalSourceUses) {
    const row = model.report.originalSourceUses.find((candidate) => candidate.id === use.id);
    if (row) container.append(elem('p', 'gbx-small', `Original source use · ${use.id} · ${use.consumerIds.join(', ')} · ${use.selectionScope} · ${use.evidence.join(' · ')}`));
  }
  if (demo.length) container.append(elem('p', 'gbx-small', `Demo slots · ${demo.map((slot) => slot.slot).join(', ')}`));
}
