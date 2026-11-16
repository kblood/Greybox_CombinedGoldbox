import { censusFileKey, censusPage, readSourceCensusQuery, sourceCensusSelection, writeSourceCensusQuery } from './graphics-source-census.mjs';
import type { CensusChild, CensusModel, CensusPage, CensusQuery } from './graphics-source-census.mjs';

function elem<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const node = elem('button', label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function evidence(summary: string, lines: string[]): HTMLElement {
  const details = elem('details');
  details.append(elem('summary', summary), ...lines.map((line) => elem('p', line, 'gbx-small')));
  return details;
}

function appendPages(container: HTMLElement, label: string, paged: CensusPage<unknown>, change: (page: number) => void) {
  if (paged.pages <= 1) return;
  const controls = elem('div', undefined, 'gbx-toolbar');
  const previous = button(`Previous ${label}`, () => change(paged.page - 1));
  const next = button(`Next ${label}`, () => change(paged.page + 1));
  previous.disabled = paged.page === 0;
  next.disabled = paged.page + 1 === paged.pages;
  controls.append(previous, elem('span', `Page ${paged.page + 1} / ${paged.pages}`, 'gbx-muted'), next);
  container.append(controls);
}

function appendChild(container: HTMLElement, child: CensusChild, derived: boolean, dok: boolean, select: (id: string) => void) {
  const card = elem('div', undefined, 'gbx-card');
  card.dataset.censusChild = derived ? 'derived' : 'drawable';
  card.append(elem('h4', `${child.kind}${child.index === null ? '' : ` ${child.index}`} · ${child.width} × ${child.height}`),
    elem('p', child.candidate ? 'Candidate render · no exact binding' : child.sourceIds.length ? 'Exact ID binding' : 'No exact ID binding', 'gbx-muted'));
  for (const id of child.sourceIds) {
    const link = button(id, () => select(id));
    link.dataset.censusSource = id;
    card.append(link);
  }
  card.append(evidence('Child evidence', [`RGB SHA-256: ${child.rgbSha256 ?? 'Unavailable'}`,
    `${dok ? 'Stored child bytes' : 'Index'} SHA-256: ${child.indexSha256 ?? 'Unavailable'}`]));
  container.append(card);
}

export function renderSourceCensus(container: HTMLElement, model: CensusModel, select: (id: string) => void) {
  let state = readSourceCensusQuery(new URLSearchParams(location.search));
  const change = (changes: Partial<CensusQuery>) => {
    state = { ...state, ...changes };
    const params = writeSourceCensusQuery(new URLSearchParams(location.search), state);
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
    render();
  };
  const render = () => {
    const { report } = model;
    const view = sourceCensusSelection(model, state);
    const dok = report.game === 'dok';
    const heading = elem('h2', 'Source inventory and ID coverage');
    heading.dataset.sourceCensusScope = 'true';
    container.replaceChildren(heading,
      elem('p', `Recorded ${dok ? 'Death Knights of Krynn' : 'Champions of Krynn'} source scan. Read this receipt without selecting a local folder.`, 'gbx-muted'),
      evidence('Receipt fingerprint', [`Registry identity SHA-256: ${report.registryAssetIdentitySha256}`,
        ...(report.rosterSha256 ? [`Roster SHA-256: ${report.rosterSha256}`] : [])]));
    if (dok) container.append(elem('p', 'The DOS scan binds all stored frames, tiles, and glyphs in the pinned inventory. WALLDEF entries are structural.', 'gbx-muted'));
    for (const { platform, summary: s, provenance } of report.sourceSets) {
      const overview = elem('article', undefined, 'gbx-card');
      overview.dataset.censusSummary = platform;
      overview.append(elem('h3', platform), elem('p', provenance, 'gbx-muted'),
        elem('p', `${s.documentedGraphicsFiles} documented graphics files · ${s.rosterFiles} roster occurrences · ${s.observedFiles} observed · ${s.pinMatchedFiles} pin matched · ${s.uniqueObservedContents} distinct observed contents`),
        elem('p', `${s.storedEntries} stored entries · ${s.entryLocatorsWithRegistryRows} with registry entry locators across ${s.filesWithRegistryEntryLocators} files`),
        elem('p', `${s.parsedDrawableChildren} parsed drawable children · ${s.parsedCandidateDrawableChildren} candidate renders · ${s.drawableChildrenWithExactBinding} exact bindings · ${s.drawableChildrenWithoutExactBinding} without exact bindings`),
        elem('p', `Total drawable count: ${s.totalDrawableCount ?? 'Unknown'} · ${s.filesWithUnknownDrawableCount} files and ${s.entriesWithUnknownDrawableCount} entries with unknown counts`),
        elem('p', `${s.derivedViews} derived views (${s.derivedViewsWithExactBinding} exact bindings) · ${s.structuralFiles} structural files with ${s.structuralStoredEntries} entries · ${s.classificationOpenFiles} files pending classification`));
      container.append(overview);
    }

    const files = elem('section');
    files.append(elem('h3', 'File occurrences'));
    const controls = elem('div', undefined, 'gbx-toolbar');
    const set = elem('select'); set.setAttribute('aria-label', 'Source set');
    set.append(new Option('All source sets', ''), ...report.sourceSets.map((row) => new Option(row.platform, row.id)));
    if (view.missingSet) set.append(new Option(`Unknown source set: ${state.set}`, state.set));
    set.value = state.set;
    set.addEventListener('change', () => change({ set: set.value, file: '', page: 0, entry: null, entryPage: 0, childPage: 0 }));
    const status = elem('select'); status.setAttribute('aria-label', 'File scan state');
    const states = [...new Set(report.files.map((file) => file.status))].sort();
    status.append(new Option('All scan states', ''), ...states.map((value) => new Option(value, value)));
    if (state.status && !states.includes(state.status)) status.append(new Option(state.status, state.status));
    status.value = state.status;
    status.addEventListener('change', () => change({ status: status.value, file: '', page: 0, entry: null, entryPage: 0, childPage: 0 }));
    controls.append(set, status);
    files.append(controls);
    if (view.missingSet || view.missingStatus || !view.files.items.length) {
      files.append(elem('p', view.missingSet || view.missingStatus ? 'The bookmarked filter is unavailable.' : 'No recorded file occurrences match these filters.', 'gbx-muted'));
    }
    const table = elem('table');
    const header = table.createTHead().insertRow();
    header.append(...['File occurrence', 'Scan state', 'ID bindings'].map((label) => elem('th', label)));
    const body = table.createTBody();
    for (const file of view.files.items) {
      const key = censusFileKey(file);
      const binding = model.bindings.get(key)!;
      const row = button(`${file.sourceSet} · ${file.path}`, () => change({ file: key, entry: null, entryPage: 0, childPage: 0 }));
      row.className = 'gbx-pick';
      row.dataset.censusFile = key;
      row.setAttribute('aria-current', String(key === state.file));
      const cells = body.insertRow();
      cells.insertCell().append(row);
      cells.insertCell().textContent = file.status;
      cells.insertCell().textContent = `${binding.bound} exact child or view IDs · ${binding.referenced - binding.bound} parent-only references`;
    }
    if (view.files.items.length) files.append(table);
    appendPages(files, 'files', view.files, (page) => change({ page }));
    container.append(files);

    const file = view.file;
    if (state.file && !file) container.append(elem('p', `Bookmarked file occurrence unavailable: ${state.file}`, 'gbx-unknown'));
    if (file) {
      const details = elem('section', undefined, 'gbx-panel');
      details.dataset.censusFileDetail = 'true';
      details.append(elem('h3', file.path), elem('p', `${file.sourceSet} · ${file.category} · ${file.status}`, 'gbx-muted'),
        elem('p', `Stored entries: ${file.entries.length} · Total drawable count: ${file.drawableCount ?? 'Unknown'}`));
      details.append(evidence('File evidence', [
        `Expected SHA-256: ${file.sha256}`, `Observed SHA-256: ${file.observedSha256 ?? 'Unavailable'}`,
        `Expected bytes: ${file.bytes} · Observed bytes: ${file.observedBytes ?? 'Unknown'}`,
        `Format: ${file.format ?? 'Unknown'} · Expected entries: ${file.expectedEntries ?? 'Unknown'}`,
        ...(file.issue ? [file.issue] : []),
      ]));
      const entryPage = censusPage(file.entries, state.entryPage);
      if (file.entries.length) {
        details.append(elem('h4', 'Stored entries'), button('File-level children and views', () => change({ entry: null, childPage: 0 })));
      }
      for (const entry of entryPage.items) {
        const entryButton = button(`TOC ordinal ${entry.entryIndex} · block ${entry.blockId} · ${entry.status === 'structural' ? 'structural resource' : entry.status}`,
          () => change({ entry: entry.entryIndex, childPage: 0 }));
        entryButton.dataset.censusEntry = String(entry.entryIndex);
        entryButton.className = 'gbx-pick';
        entryButton.setAttribute('aria-current', String(entry.entryIndex === state.entry));
        details.append(entryButton);
      }
      appendPages(details, 'entries', entryPage, (entryPage) => change({ entryPage }));
      if (state.entry !== null && !view.entry) {
        details.append(elem('p', `Bookmarked TOC ordinal ${state.entry} is unavailable.`, 'gbx-unknown'));
      } else {
        const parent = view.entry ?? file;
        if (view.entry) {
          const entry = view.entry;
          details.append(elem('h4', `Selected TOC ordinal ${entry.entryIndex} · block ${entry.blockId}`),
            elem('p', entry.status === 'structural' ? 'Structural resource' : `Drawable count: ${entry.drawableCount ?? 'Unknown'}`),
            evidence('Entry evidence', [
              `Same block occurrence: ${entry.sameIdOccurrence} · Offset: ${entry.offset} · Stored bytes: ${entry.storedBytes} · Declared raw bytes: ${entry.declaredRawBytes ?? 'Unknown'}`,
              `Payload SHA-256: ${entry.payloadSha256 ?? 'Unavailable'}`, `Raw SHA-256: ${entry.rawSha256 ?? 'Unavailable'}`,
              `Decoder profile: ${entry.profile ?? 'Unknown'}`, ...(entry.issue ? [entry.issue] : []),
            ]));
        }
        const exact = new Set([...parent.children, ...parent.derived].flatMap((child) => child.sourceIds));
        const parentOnly = parent.locatorSourceIds.filter((id) => !exact.has(id));
        if (parentOnly.length) details.append(evidence(`Parent-only registry references (${parentOnly.length})`, parentOnly));
        const children = censusPage([
          ...parent.children.map((child) => ({ child, derived: false })),
          ...parent.derived.map((child) => ({ child, derived: true })),
        ], state.childPage);
        for (const derived of [false, true]) {
          const group = children.items.filter((row) => row.derived === derived);
          if (!group.length) continue;
          details.append(elem('h4', derived ? 'Derived views' : 'Drawable children'));
          for (const { child } of group) appendChild(details, child, derived, dok, select);
        }
        if (!children.items.length) details.append(elem('p', 'No drawable children or derived views recorded for this selection.', 'gbx-muted'));
        appendPages(details, 'children and views', children, (childPage) => change({ childPage }));
      }
      container.append(details);
    }

    const unresolved = elem('section', undefined, 'gbx-card');
    unresolved.dataset.censusUnresolved = 'true';
    const records = report.unresolvedRegistryBindings;
    unresolved.append(elem('h3', `${records.length} unresolved registry records`));
    const reasons = new Map<string, number>();
    for (const row of records) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
    unresolved.append(elem('p', [...reasons].map(([reason, total]) => `${total} ${reason.replaceAll('-', ' ')}`).join(' · '), 'gbx-muted'));
    const page = censusPage(records, state.unresolvedPage);
    const rows = elem('ul');
    for (const row of page.items) {
      rows.append(elem('li', `${row.sourceId} · ${row.reason}${row.path ? ` · ${row.path}` : ''}${row.entryIndex === null ? '' : ` · TOC ordinal ${row.entryIndex}`}`));
    }
    unresolved.append(rows);
    appendPages(unresolved, 'unresolved records', page, (unresolvedPage) => change({ unresolvedPage }));
    container.append(unresolved);
  };
  render();
}
