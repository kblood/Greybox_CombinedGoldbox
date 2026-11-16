const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortMembers = (a, b) => a.depth - b.depth || byText(a.platform ?? '', b.platform ?? '')
  || byText(a.edition ?? '', b.edition ?? '') || byText(a.assetId, b.assetId);

/**
 * Build a bounded, one-hop comparison around one original source ID.
 *
 * Only direct registry cross-version links are followed. Pixel identity is kept as a
 * relationship between distinct source IDs; it never merges identities, proves a shared
 * subject, or proves game use. Platforms without a recorded direct counterpart are
 * reported as unrecorded, not absent.
 */
export function buildVersionComparison(catalog, subjectId) {
  const subject = catalog.source(subjectId);
  if (!subject) throw new Error(`Unknown source ID: ${subjectId}`);

  const members = new Map([[subjectId, { assetId: subjectId, depth: 0, resolved: true, platform: subject.platform,
    edition: subject.edition, links: [], restyleIds: [] }]]);
  for (const link of catalog.crossVersionLinksFor(subjectId)) {
    const assetId = link.fromAssetId === subjectId ? link.toAssetId : link.fromAssetId;
    if (assetId === subjectId) continue;
    if (!members.has(assetId)) {
      const other = catalog.source(assetId);
      members.set(assetId, { assetId, depth: 1, resolved: Boolean(other), platform: other?.platform ?? null,
        edition: other?.edition ?? null, links: [], restyleIds: [] });
    }
    members.get(assetId).links.push({ relation: link.relation, confidence: link.confidence, evidence: link.evidence ?? [] });
  }

  const restyleById = new Map();
  for (const member of members.values()) {
    const ids = new Set();
    for (const restyle of catalog.restylesFor(member.assetId)) {
      ids.add(restyle.id);
      restyleById.set(restyle.id, { id: restyle.id, sourceRelation: restyle.sourceRelation ?? null,
        sourceAssetIds: [...new Set(restyle.sourceAssetIds)].sort() });
    }
    member.restyleIds = [...ids].sort();
    member.links.sort((a, b) => byText(a.relation, b.relation) || byText(a.confidence, b.confidence));
  }

  const sorted = [...members.values()].sort(sortMembers);
  const presentPlatforms = new Set(sorted.map((member) => member.platform).filter(Boolean));
  const gamePlatforms = catalog.scopes.find((scope) => scope.game === subject.game)?.platforms ?? [];
  const unrecordedPlatforms = gamePlatforms.filter((platform) => !presentPlatforms.has(platform)).sort(byText)
    .map((platform) => ({ platform, status: 'no-direct-counterpart-recorded',
      note: 'No direct cross-version link from this source. This is not evidence that the platform lacks the graphic.' }));

  const platformGroups = new Map();
  for (const member of sorted) {
    const key = member.platform ?? 'unresolved';
    const group = platformGroups.get(key) ?? { platform: key, editions: new Map() };
    const editionKey = member.edition ?? 'unresolved';
    const rows = group.editions.get(editionKey) ?? [];
    rows.push(member.assetId);
    group.editions.set(editionKey, rows);
    platformGroups.set(key, group);
  }

  return Object.freeze({
    subjectId,
    game: subject.game,
    members: sorted,
    platforms: [...platformGroups.values()].sort((a, b) => byText(a.platform, b.platform)).map((group) => ({
      platform: group.platform,
      editions: [...group.editions.entries()].sort(([a], [b]) => byText(a, b))
        .map(([edition, assetIds]) => ({ edition, assetIds: [...assetIds].sort() })),
    })),
    restyles: [...restyleById.values()].sort((a, b) => byText(a.id, b.id)),
    unverifiedLinkCount: sorted.reduce((count, member) => count + member.links.filter((link) => link.confidence !== 'verified').length, 0),
    unresolvedMemberIds: sorted.filter((member) => !member.resolved).map((member) => member.assetId),
    unrecordedPlatforms,
  });
}
