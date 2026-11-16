import { coverageByPlatform, coverageByPlatformAndArchive, filterVersionOverview, type GameUseState,
  type VersionCoverageRow, type VersionOverview, type VersionOverviewRow } from './graphics-version-overview.mjs';

const STATUS_LABELS: Record<VersionOverviewRow['status'], string> = {
  'cross-platform-recorded': 'Cross-platform recorded',
  'same-platform-only': 'Same platform only',
  'no-direct-counterpart': 'No direct counterpart',
};

export type VersionOverviewState = { status: string; platform: string; edition: string; archive: string; unverifiedOnly: boolean; page: number };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Render the full CoK version overview: one row per registry source with direct counterparts,
 * restyle counts and explicit gaps. Counterparts are not merged, and gaps are not absences.
 */
export function renderVersionOverview(container: HTMLElement, overview: VersionOverview,
  state: VersionOverviewState, onState: (next: VersionOverviewState) => void, onSelect: (id: string) => void): void {
  const { summary } = overview;
  const status = el('select'); status.setAttribute('aria-label', 'Version overview status');
  status.append(new Option('All statuses', 'all'), ...Object.keys(STATUS_LABELS).map((key) => new Option(STATUS_LABELS[key as VersionOverviewRow['status']], key)));
  status.value = state.status;
  const platform = el('select'); platform.setAttribute('aria-label', 'Version overview platform');
  platform.append(new Option('All platforms', 'all'), ...overview.platforms.map((value) => new Option(value, value)));
  platform.value = state.platform;
  const edition = el('select'); edition.setAttribute('aria-label', 'Version overview edition');
  edition.append(new Option('All editions', 'all'), ...overview.editions.map((value) => new Option(value, value)));
  edition.value = state.edition;
  const archive = el('select'); archive.setAttribute('aria-label', 'Version overview archive');
  archive.append(new Option('All archives', 'all'), ...overview.archives.map((value) => new Option(value, value)));
  archive.value = state.archive;
  const unverifiedToggle = el('input'); unverifiedToggle.type = 'checkbox'; unverifiedToggle.checked = state.unverifiedOnly;
  const unverifiedLabel = el('label');
  unverifiedLabel.append(unverifiedToggle, el('span', undefined, 'Only sources with unverified links'));
  const controls = el('div', 'gbx-toolbar');
  const previous = el('button', undefined, 'Previous'); previous.type = 'button';
  const next = el('button', undefined, 'Next'); next.type = 'button';
  const pageLabel = el('span', 'gbx-muted');
  controls.append(status, platform, edition, archive, unverifiedLabel, previous, pageLabel, next);

  const totals = el('p', 'gbx-small', `${summary.sourceCount} sources · ` + Object.entries(summary.byStatus)
    .map(([key, count]) => `${STATUS_LABELS[key as VersionOverviewRow['status']] ?? key}: ${count}`).join(' · ')
    + ` · with restyle records: ${summary.withRestyle} · shared pixel groups: ${summary.pixelGroupsShared} (largest ${summary.largestPixelGroup})`);
  const descriptionTotals = el('p', 'gbx-small', `Semantic description status, one count per source: ${describeCounts(summary.byDescriptionStatus)}. Exact registry values, with missing for absent records; not a completeness score.`);
  const { gameUse } = summary;
  const gameUseTotalsLine = el('p', 'gbx-small', `Recorded game-use assertions: ${gameUse.assertionRecordCount} records across ${summary.sourceCount} sources (record and source counts are separate). Records by exact recorded status: ${describeCounts(gameUse.byRecordedStatus)}.`);
  const gameUseSourcesLine = el('p', 'gbx-small', `Sources, one state each (total ${summary.sourceCount}): ${describeGameUseStates(gameUse.sourceStates)}. Malformed entries (not records with a string status): ${gameUse.malformedRecordCount} entries in ${gameUse.sourcesWithMalformedEntries} sources; these sources also appear in the states above.`);
  const gameUseNote = el('p', 'gbx-small gbx-muted', 'Recorded game-use assertions are the registry\'s consumer records, shown with their exact recorded statuses and never reduced to a best status. Recorded assertions or statuses, and the presence of evidence or citations, do not establish observed execution, citation correctness, or documentation quality.');
  const note = el('p', 'gbx-small gbx-muted', 'Each row is one original source. Counterparts remain separate identities; shared pixels are recorded relationships, not proof of shared subject or game use. "Not recorded" means no direct link was found, not that the platform lacks the graphic.');
  const evidenceNote = el('p', 'gbx-small gbx-muted', 'Evidence dimensions are separate and do not imply one another: semantic description status (the registry\'s description record), visible appearance annotation, source identity, counterpart confidence (verified or unverified link records), and observed game use. A description status is not an image review or citation check, and no status here is a completeness score.');

  const linkNote = el('p', 'gbx-small gbx-muted', 'Counterparts are distinct recorded sources. Unverified links counts the link records that are not verified; they may be tentative, and they are not subtracted from Counterparts. Recorded coverage, including unverified links, does not mean a verified match.');

  const { rows, pageCount, page: current } = filterVersionOverview(overview, state);
  const table = el('table', 'gbx-table');
  const head = el('thead');
  const headRow = el('tr');
  for (const label of ['Source ID', 'Platform', 'Edition', 'Archive', 'Semantic description status', 'Recorded game-use assertions', 'Counterparts', 'Unverified links', 'Counterpart platforms', 'Restyles', 'Pixel group', 'Status', 'Not recorded']) {
    headRow.append(el('th', undefined, label));
  }
  head.append(headRow);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    const idCell = el('td');
    const button = el('button', undefined, row.id); button.type = 'button';
    button.addEventListener('click', () => onSelect(row.id));
    idCell.append(button);
    tr.append(idCell, el('td', undefined, row.platform), el('td', undefined, row.edition),
      el('td', undefined, row.archiveName ?? '—'), el('td', undefined, row.descriptionStatus),
      el('td', undefined, describeGameUseRow(row)),
      el('td', undefined, String(row.counterpartCount)),
      el('td', undefined, String(row.unverifiedLinkCount)),
      el('td', undefined, row.counterpartPlatforms.join(', ') || '—'), el('td', undefined, String(row.restyleCount)),
      el('td', undefined, row.commonPixelCandidate ? `${row.pixelGroupSize} · common-pixel candidate` : String(row.pixelGroupSize)),
      el('td', undefined, STATUS_LABELS[row.status]),
      el('td', undefined, row.unrecordedPlatforms.join(', ') || '—'));
    body.append(tr);
  }
  table.append(head, body);
  const empty = rows.length ? null : el('p', 'gbx-muted', 'No sources match these filters.');
  pageLabel.textContent = `Page ${current + 1} of ${pageCount}`;
  previous.disabled = current <= 0;
  next.disabled = current >= pageCount - 1;

  const emit = (patch: Partial<VersionOverviewState>) => onState({ ...state, ...patch });
  status.addEventListener('change', () => emit({ status: status.value, page: 0 }));
  platform.addEventListener('change', () => emit({ platform: platform.value, page: 0 }));
  edition.addEventListener('change', () => emit({ edition: edition.value, page: 0 }));
  archive.addEventListener('change', () => emit({ archive: archive.value, page: 0 }));
  unverifiedToggle.addEventListener('change', () => emit({ unverifiedOnly: unverifiedToggle.checked, page: 0 }));
  previous.addEventListener('click', () => emit({ page: current - 1 }));
  next.addEventListener('click', () => emit({ page: current + 1 }));

  container.replaceChildren(el('h2', undefined, 'Version comparison overview · Champions of Krynn'), totals, descriptionTotals,
    gameUseTotalsLine, gameUseSourcesLine, gameUseNote, note,
    evidenceNote, coverageSection(overview), controls, linkNote, ...(empty ? [empty] : []), table);
}

/** Compact `key: count` list in the order the overview supplies (base categories first). */
function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join(' · ');
}

const GAME_USE_STATE_LABELS: Record<GameUseState, string> = {
  'partial-or-verified': 'with partial or verified assertions',
  'only-unknown': 'only unknown assertions',
  'other-status': 'other exact status, no partial or verified',
  'no-records': 'no records',
  'missing-structure': 'missing structure',
  'malformed-structure': 'malformed structure',
};

function describeGameUseStates(states: Record<GameUseState, number>): string {
  return (Object.keys(GAME_USE_STATE_LABELS) as GameUseState[]).map((state) => `${GAME_USE_STATE_LABELS[state]}: ${states[state]}`).join(' · ');
}

/** Per-source cell: the exact recorded statuses that occur (mixed kept), or the explicit structure state. */
function describeGameUseRow(row: VersionOverviewRow): string {
  if (row.gameUseState === 'missing-structure' || row.gameUseState === 'malformed-structure') return GAME_USE_STATE_LABELS[row.gameUseState];
  if (row.gameUseState === 'no-records') return 'no records';
  const statuses = Object.entries(row.gameUseByStatus).filter(([, count]) => count > 0).map(([key, count]) => `${key}: ${count}`).join(' · ');
  const malformed = row.gameUseMalformedCount ? ` · ${row.gameUseMalformedCount} malformed entries` : '';
  return `${row.gameUseRecordCount} records · ${statuses}${malformed}`;
}

function coverageTable(rows: VersionCoverageRow[], withArchive: boolean): HTMLTableElement {
  const table = el('table', 'gbx-table');
  const head = el('tr');
  for (const label of [...(withArchive ? ['Archive'] : []), 'Platform', 'Sources', 'Cross-platform recorded',
    'Same platform only', 'No direct counterpart', 'With restyles', 'Semantic description status',
    'Game-use assertion records', 'Game-use sources by state']) head.append(el('th', undefined, label));
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  for (const row of rows) {
    const tr = el('tr');
    const cells = [...(withArchive ? [row.archiveName ?? '—'] : []), row.platform, String(row.sourceCount),
      String(row.byStatus['cross-platform-recorded']), String(row.byStatus['same-platform-only']),
      String(row.byStatus['no-direct-counterpart']), String(row.withRestyle), describeCounts(row.byDescriptionStatus),
      `${row.gameUse.assertionRecordCount} · ${describeCounts(row.gameUse.byRecordedStatus)}`,
      describeGameUseStates(row.gameUse.sourceStates)];
    for (const cell of cells) tr.append(el('td', undefined, cell));
    table.tBodies[0]!.append(tr);
  }
  return table;
}

/** Coverage per platform and per archive. Recorded links only; "no direct counterpart" is not absence. */
function coverageSection(overview: VersionOverview): HTMLElement {
  const details = el('details');
  details.append(el('summary', undefined, 'Coverage per platform and archive (recorded links only)'));
  details.append(el('p', 'gbx-small gbx-muted', 'Each source is counted once per table. "No direct counterpart" means no recorded link, not that the platform lacks the graphic. Semantic description status counts are exact registry values with explicit missing; they are not a completeness score. Game-use assertion records and sources are counted separately; recorded assertions do not establish observed execution.'));
  details.append(coverageTable(coverageByPlatform(overview), false));
  details.append(coverageTable(coverageByPlatformAndArchive(overview), true));
  return details;
}
