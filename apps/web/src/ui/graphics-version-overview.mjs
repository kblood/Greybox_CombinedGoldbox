const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A shared pixel hash this large is most likely a common tile (for example a solid colour),
 * not evidence of a shared subject. The threshold is a heuristic label, not a proof; the
 * largest CoK groups were checked by decoding (solid palette fills, 2026-11-09).
 */
export const COMMON_PIXEL_THRESHOLD = 10;

/**
 * Overview rows for every source in a game. Each row is a direct, one-hop view of one
 * original source. Rows are never merged transitively: pixel identity can be shared by
 * common tiles across unrelated subjects, so families are reported as pixel-hash groups
 * only, and counterparts stay separate source identities.
 */
/** Decoded-image rows carry `decoded.pixelSha256`; stored font glyphs carry the same definition as `sourcePixelSha256`. */
function pixelHashOf(source) {
  return source.decoded?.pixelSha256 ?? source.sourcePixelSha256 ?? null;
}

/**
 * Registry `source.description.status` is carried exactly as stored (CoK registry values:
 * `unknown`, `partial`, `verified`). Only an absent description or status, or a non-string value,
 * falls back to `missing`; no other value is remapped. This is a semantic description record, not
 * an appearance check, citation check, image review, or completeness score.
 */
const DESCRIPTION_STATUS_KEYS = ['verified', 'partial', 'unknown', 'missing'];
function descriptionStatusOf(source) {
  const status = source.description?.status;
  return typeof status === 'string' ? status : 'missing';
}

/** One count per row. Base categories are always present (zero when absent); other exact strings follow, sorted. */
function countDescriptionStatuses(rows) {
  const counts = new Map(DESCRIPTION_STATUS_KEYS.map((key) => [key, 0]));
  for (const row of rows) counts.set(row.descriptionStatus, (counts.get(row.descriptionStatus) ?? 0) + 1);
  const extras = [...counts.keys()].filter((key) => !DESCRIPTION_STATUS_KEYS.includes(key)).sort(byText);
  return Object.freeze(Object.fromEntries([...DESCRIPTION_STATUS_KEYS, ...extras].map((key) => [key, counts.get(key)])));
}

/**
 * Recorded game-use assertions are the registry's `gameConsumers` records. Each record is counted
 * under its exact recorded `status`; mixed statuses on one source are kept, never reduced to a best
 * status. Only an object with a string status is a record. Anything else is malformed and gets no
 * invented status. Recorded assertions and their evidence do not establish observed game use.
 */
const GAME_USE_STATUS_KEYS = ['verified', 'partial', 'unknown'];
/** Exactly one state per source. `missing-structure` and `malformed-structure` cover a source with no usable array. */
const GAME_USE_STATES = ['partial-or-verified', 'only-unknown', 'other-status', 'no-records', 'missing-structure', 'malformed-structure'];
const isGameUseRecord = (entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.status === 'string';

function gameUseOf(source) {
  const consumers = source.gameConsumers;
  if (consumers === undefined || consumers === null) return { state: 'missing-structure', statuses: [], malformedCount: 0 };
  if (!Array.isArray(consumers)) return { state: 'malformed-structure', statuses: [], malformedCount: 0 };
  const statuses = [];
  let malformedCount = 0;
  for (const entry of consumers) {
    if (isGameUseRecord(entry)) statuses.push(entry.status);
    else malformedCount++;
  }
  let state;
  if (statuses.some((status) => status === 'partial' || status === 'verified')) state = 'partial-or-verified';
  else if (statuses.length) state = statuses.every((status) => status === 'unknown') ? 'only-unknown' : 'other-status';
  else state = malformedCount ? 'malformed-structure' : 'no-records';
  return { state, statuses, malformedCount };
}

/** Base categories first (zero when absent), then other exact strings, sorted. */
function orderedGameUseCounts(counts) {
  const extras = [...counts.keys()].filter((key) => !GAME_USE_STATUS_KEYS.includes(key)).sort(byText);
  return Object.freeze(Object.fromEntries([...GAME_USE_STATUS_KEYS, ...extras].map((key) => [key, counts.get(key) ?? 0])));
}

function countGameUseStatuses(statuses) {
  const counts = new Map(GAME_USE_STATUS_KEYS.map((key) => [key, 0]));
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  return orderedGameUseCounts(counts);
}

/**
 * Accounting over overview rows. Record totals and source states are separate: each source has one
 * state, and malformed entries are counted as entries, not as sources (sources with malformed entries
 * overlap the states above). Missing per-row fields count as zero.
 */
function gameUseTotals(rows) {
  const counts = new Map(GAME_USE_STATUS_KEYS.map((key) => [key, 0]));
  const sourceStates = Object.fromEntries(GAME_USE_STATES.map((state) => [state, 0]));
  let assertionRecordCount = 0;
  let malformedRecordCount = 0;
  let sourcesWithMalformedEntries = 0;
  for (const row of rows) {
    assertionRecordCount += row.gameUseRecordCount ?? 0;
    malformedRecordCount += row.gameUseMalformedCount ?? 0;
    if ((row.gameUseMalformedCount ?? 0) > 0) sourcesWithMalformedEntries++;
    sourceStates[row.gameUseState] = (sourceStates[row.gameUseState] ?? 0) + 1;
    for (const [status, count] of Object.entries(row.gameUseByStatus ?? {})) counts.set(status, (counts.get(status) ?? 0) + count);
  }
  return Object.freeze({
    assertionRecordCount,
    malformedRecordCount,
    sourcesWithMalformedEntries,
    byRecordedStatus: orderedGameUseCounts(counts),
    sourceStates: Object.freeze(sourceStates),
  });
}

export function buildVersionOverview(catalog, game) {
  const sources = catalog.sources.filter((source) => source.game === game);
  const scope = catalog.scopes.find((item) => item.game === game);
  const platforms = scope?.platforms ?? [];
  const pixelGroups = new Map();
  for (const source of sources) {
    const hash = pixelHashOf(source);
    if (hash) pixelGroups.set(hash, [...(pixelGroups.get(hash) ?? []), source.id]);
  }

  const rows = sources.map((source) => {
    const counterpartIds = new Set();
    let unverifiedLinkCount = 0;
    for (const link of catalog.crossVersionLinksFor(source.id)) {
      const otherId = link.fromAssetId === source.id ? link.toAssetId : link.fromAssetId;
      if (otherId === source.id) continue;
      counterpartIds.add(otherId);
      if (link.confidence !== 'verified') unverifiedLinkCount++;
    }
    const counterpartPlatforms = new Set();
    for (const id of counterpartIds) {
      const other = catalog.source(id);
      if (other?.platform) counterpartPlatforms.add(other.platform);
    }
    const pixelHash = pixelHashOf(source);
    const pixelGroup = pixelHash ? pixelGroups.get(pixelHash) ?? [source.id] : [source.id];
    const crossPlatform = [...counterpartPlatforms].some((platform) => platform !== source.platform);
    const gameUse = gameUseOf(source);
    return Object.freeze({
      id: source.id,
      platform: source.platform,
      edition: source.edition,
      archiveName: source.archive?.name ?? null,
      identityStatus: source.identityStatus ?? null,
      descriptionStatus: descriptionStatusOf(source),
      gameUseState: gameUse.state,
      gameUseRecordCount: gameUse.statuses.length,
      gameUseMalformedCount: gameUse.malformedCount,
      gameUseByStatus: countGameUseStatuses(gameUse.statuses),
      pixelSha256: pixelHash,
      pixelGroupSize: pixelGroup.length,
      commonPixelCandidate: pixelGroup.length >= COMMON_PIXEL_THRESHOLD,
      counterpartCount: counterpartIds.size,
      counterpartPlatforms: [...counterpartPlatforms].sort(byText),
      unverifiedLinkCount,
      restyleCount: catalog.restylesFor(source.id).length,
      unrecordedPlatforms: platforms.filter((platform) => platform !== source.platform && !counterpartPlatforms.has(platform)).sort(byText),
      status: crossPlatform ? 'cross-platform-recorded' : counterpartIds.size ? 'same-platform-only' : 'no-direct-counterpart',
    });
  }).sort((a, b) => byText(a.id, b.id));

  const countBy = (key) => rows.reduce((counts, row) => {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
  return Object.freeze({
    game,
    platforms: [...platforms].sort(byText),
    editions: [...new Set(rows.map((row) => row.edition).filter(Boolean))].sort(byText),
    archives: [...new Set(rows.map((row) => row.archiveName).filter(Boolean))].sort(byText),
    rows,
    summary: Object.freeze({
      sourceCount: rows.length,
      byStatus: countBy((row) => row.status),
      byPlatform: countBy((row) => row.platform),
      byDescriptionStatus: countDescriptionStatuses(rows),
      gameUse: gameUseTotals(rows),
      withRestyle: rows.filter((row) => row.restyleCount > 0).length,
      pixelGroupsShared: [...pixelGroups.values()].filter((ids) => ids.length > 1).length,
      largestPixelGroup: Math.max(0, ...[...pixelGroups.values()].map((ids) => ids.length)),
      commonPixelCandidateGroups: [...pixelGroups.values()].filter((ids) => ids.length >= COMMON_PIXEL_THRESHOLD).length,
      commonPixelCandidateSources: rows.filter((row) => row.commonPixelCandidate).length,
    }),
  });
}

export const VERSION_OVERVIEW_PAGE_SIZE = 100;

/** Filter and page an overview without mutating its rows. Missing edition/archive mean 'all'; missing unverifiedOnly means false. */
export function filterVersionOverview(overview, state) {
  const edition = state.edition ?? 'all';
  const archive = state.archive ?? 'all';
  const unverifiedOnly = state.unverifiedOnly ?? false;
  const matching = overview.rows.filter((row) => (state.status === 'all' || row.status === state.status)
    && (state.platform === 'all' || row.platform === state.platform)
    && (edition === 'all' || row.edition === edition)
    && (archive === 'all' || row.archiveName === archive)
    && (!unverifiedOnly || row.unverifiedLinkCount > 0));
  const pageCount = Math.max(1, Math.ceil(matching.length / VERSION_OVERVIEW_PAGE_SIZE));
  const page = Math.min(Math.max(0, state.page), pageCount - 1);
  const start = page * VERSION_OVERVIEW_PAGE_SIZE;
  return { rows: matching.slice(start, start + VERSION_OVERVIEW_PAGE_SIZE), pageCount, page };
}

const STATUSES = ['cross-platform-recorded', 'same-platform-only', 'no-direct-counterpart'];
const emptyStatusCounts = () => Object.fromEntries(STATUSES.map((status) => [status, 0]));

function coverageRows(rows, keyOf, extra) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { ...extra(row), sourceCount: 0, byStatus: emptyStatusCounts(), withRestyle: 0, members: [] };
    group.sourceCount++;
    group.byStatus[row.status]++;
    if (row.restyleCount > 0) group.withRestyle++;
    group.members.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ members, ...group }) => ({ ...group, byDescriptionStatus: countDescriptionStatuses(members), gameUse: gameUseTotals(members) }))
    .sort((a, b) => byText(a.platform ?? '', b.platform ?? '') || byText(a.archiveName ?? '', b.archiveName ?? ''));
}

/** Coverage per platform and archive. Every overview row is counted exactly once per table. */
export function coverageByPlatformAndArchive(overview) {
  return Object.freeze(coverageRows(overview.rows, (row) => `${row.platform}\0${row.archiveName ?? ''}`,
    (row) => ({ platform: row.platform, archiveName: row.archiveName ?? null })));
}

/** Coverage per platform. */
export function coverageByPlatform(overview) {
  return Object.freeze(coverageRows(overview.rows, (row) => row.platform, (row) => ({ platform: row.platform })));
}
