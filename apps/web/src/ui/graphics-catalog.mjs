const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byOrder = (a, b) => a.order - b.order || byText(a.assetId, b.assetId);

/** Build stable direct indexes over the source registry; this never merges source identities. */
export function createGraphicsCatalog(registry) {
  const sources = new Map();
  for (const asset of registry.assets) {
    if (sources.has(asset.id)) throw new Error(`Duplicate canonical source ID: ${asset.id}`);
    sources.set(asset.id, asset);
  }
  const links = new Map(), restyles = new Map(), frameGroups = new Map(), animationGroupsById = new Map();
  const appearances = new Map(), outputs = new Map();
  const append = (map, key, value) => { const rows = map.get(key) ?? []; rows.push(value); map.set(key, rows); };
  for (const link of registry.crossVersionLinks) {
    append(links, link.fromAssetId, link); append(links, link.toAssetId, link);
  }
  for (const list of links.values()) list.sort((a, b) => byId({ id: `${a.fromAssetId}\0${a.toAssetId}\0${a.relation}` },
    { id: `${b.fromAssetId}\0${b.toAssetId}\0${b.relation}` }));
  for (const restyle of registry.restyles) {
    for (const id of new Set(restyle.sourceAssetIds)) append(restyles, id, restyle);
    for (const output of restyle.outputs) {
      const hash = output.sha256.toLowerCase();
      append(outputs, hash, { restyle, output });
    }
  }
  for (const list of restyles.values()) list.sort(byId);
  for (const list of outputs.values()) list.sort((a, b) => byId(a.restyle, b.restyle) || byText(a.output.role, b.output.role));
  for (const group of registry.animationGroups) {
    const orderedGroup = { ...group, frames: [...group.frames].sort(byOrder) };
    if (animationGroupsById.has(orderedGroup.id)) throw new Error(`Duplicate animation group ID: ${orderedGroup.id}`);
    animationGroupsById.set(orderedGroup.id, orderedGroup);
    for (const id of new Set(orderedGroup.frames.map((frame) => frame.assetId))) append(frameGroups, id, orderedGroup);
  }
  for (const list of frameGroups.values()) list.sort(byId);

  // Group-level matches are review/navigation candidates only. Require a verified direct
  // pixel-identity link for every same-ordinal frame; never infer a shared subject or animation.
  const verifiedPixelPairs = new Set(registry.crossVersionLinks
    .filter((link) => link.relation === 'pixel-identical' && link.confidence === 'verified')
    .map((link) => [link.fromAssetId, link.toAssetId].sort().join('\0')));
  const groupCandidates = new Map();
  const orderedGroups = [...animationGroupsById.values()].sort(byId);
  for (const sourceGroup of orderedGroups) {
    const sourceOrders = sourceGroup.frames.map((frame) => frame.order);
    if (!sourceOrders.length || new Set(sourceOrders).size !== sourceOrders.length) continue;
    for (const targetGroup of orderedGroups) {
      if (sourceGroup.id === targetGroup.id || sourceGroup.frames.length !== targetGroup.frames.length) continue;
      const targetByOrder = new Map(targetGroup.frames.map((frame) => [frame.order, frame]));
      if (targetByOrder.size !== targetGroup.frames.length) continue;
      const framePairs = [];
      for (const sourceFrame of sourceGroup.frames) {
        const targetFrame = targetByOrder.get(sourceFrame.order);
        if (!targetFrame || !verifiedPixelPairs.has([sourceFrame.assetId, targetFrame.assetId].sort().join('\0'))) break;
        framePairs.push({ order: sourceFrame.order, sourceAssetId: sourceFrame.assetId, targetAssetId: targetFrame.assetId });
      }
      if (framePairs.length !== sourceGroup.frames.length) continue;
      const rows = groupCandidates.get(sourceGroup.id) ?? [];
      rows.push({ sourceGroupId: sourceGroup.id, targetGroupId: targetGroup.id,
        sourceGroup, targetGroup, frameCount: framePairs.length, framePairs });
      groupCandidates.set(sourceGroup.id, rows);
    }
  }
  for (const [sourceGroupId, rows] of groupCandidates) {
    rows.sort((a, b) => byId(a.targetGroup, b.targetGroup));
    for (const row of rows) row.candidateCount = rows.length;
    groupCandidates.set(sourceGroupId, rows);
  }
  for (const appearance of registry.appearanceSets ?? []) for (const variant of appearance.variants) {
    for (const component of variant.components) append(appearances, component.assetId,
      { appearance, variantIndex: variant.index, role: component.role });
  }
  for (const list of appearances.values()) list.sort((a, b) => byId(a.appearance, b.appearance)
    || a.variantIndex - b.variantIndex || byText(a.role, b.role));

  const games = new Map();
  for (const asset of registry.assets) {
    const scope = games.get(asset.game) ?? { game: asset.game, sourceCount: 0, platforms: new Set(), editions: new Set() };
    scope.sourceCount++; scope.platforms.add(asset.platform); scope.editions.add(asset.edition); games.set(asset.game, scope);
  }
  const scopes = [...games.values()].map((scope) => ({ game: scope.game, sourceCount: scope.sourceCount,
    platforms: [...scope.platforms].sort(), editions: [...scope.editions].sort(), completeness: 'not-established' }))
    .sort((a, b) => byText(a.game, b.game));
  return Object.freeze({
    scopes,
    source: (id) => sources.get(id) ?? null,
    sourcesFor: (ids) => ids.map((id) => sources.get(id) ?? null),
    sources: [...sources.values()].sort(byId),
    crossVersionLinksFor: (id) => links.get(id) ?? [],
    restylesFor: (id) => restyles.get(id) ?? [],
    restyleOutputGroupsFor: (id) => {
      const rows = new Map();
      for (const restyle of restyles.get(id) ?? []) for (const output of restyle.outputs) {
        const hash = output.sha256.toLowerCase();
        const group = rows.get(hash) ?? { sha256: hash, uses: outputs.get(hash) ?? [] };
        rows.set(hash, group);
      }
      return [...rows.values()].sort((a, b) => byText(a.sha256, b.sha256));
    },
    inspectRestyleReuse: (id) => {
      const directRestyles = restyles.get(id) ?? [];
      const linkedOutputHashes = new Set(directRestyles.flatMap((restyle) => restyle.outputs.map((output) => output.sha256.toLowerCase())));
      const linkedRestyleIds = new Set(directRestyles.map((restyle) => restyle.id));
      const possibleByHash = new Map(), unresolvedLineage = [];
      const linksForSource = links.get(id) ?? [];
      const exactTwins = new Set();
      for (const link of linksForSource) {
        const otherId = link.fromAssetId === id ? link.toAssetId : link.fromAssetId;
        if (link.relation === 'pixel-identical' && link.confidence === 'verified') exactTwins.add(otherId);
        else unresolvedLineage.push({ sourceId: otherId, link, reason: 'This relation is not verified pixel identity; it does not establish Restyle reuse.' });
      }
      for (const sourceId of [...exactTwins].sort()) {
        const peerRestyles = restyles.get(sourceId) ?? [];
        if (!peerRestyles.length) {
          unresolvedLineage.push({ sourceId, link: null,
            reason: 'A pixel-identical source has no linked Restyle output; this does not establish that new generation is appropriate.' });
          continue;
        }
        for (const restyle of peerRestyles) {
          if (!restyle.outputs.length) {
            unresolvedLineage.push({ sourceId, link: null, restyleId: restyle.id,
              reason: 'The linked Restyle record has no output hash to inspect.' });
          }
          for (const output of restyle.outputs) {
            if (linkedRestyleIds.has(restyle.id) || linkedOutputHashes.has(output.sha256.toLowerCase())) continue;
            const link = linksForSource.find((candidate) =>
              (candidate.fromAssetId === id && candidate.toAssetId === sourceId)
              || (candidate.toAssetId === id && candidate.fromAssetId === sourceId));
            const hash = output.sha256.toLowerCase();
            const candidate = possibleByHash.get(hash) ?? { sha256: hash, uses: [],
              reason: 'Direct verified pixel identity only; inspect prompt, composition, palette/consumer context, and runtime admission before reuse.' };
            candidate.uses.push({ sourceId, link, restyle, output });
            possibleByHash.set(hash, candidate);
          }
        }
      }
      const possibleReuse = [...possibleByHash.values()]
        .map((candidate) => ({ ...candidate, uses: candidate.uses.sort((a, b) => byText(a.sourceId, b.sourceId)
          || byId(a.restyle, b.restyle) || byText(a.output.role, b.output.role)) }))
        .sort((a, b) => byText(a.sha256, b.sha256));
      unresolvedLineage.sort((a, b) => byText(a.sourceId, b.sourceId) || byText(a.reason, b.reason));
      const alreadyLinkedOutputs = [...new Set(directRestyles.flatMap((restyle) => restyle.outputs.map((output) => output.sha256.toLowerCase())))].sort()
        .map((sha256) => {
          const uses = directRestyles.flatMap((restyle) => restyle.outputs.filter((output) => output.sha256.toLowerCase() === sha256)
            .map((output) => ({ restyle, output })));
          const ownUseKeys = new Set(uses.map((use) => `${use.restyle.id}\0${use.output.role}`));
          const otherByteIdenticalUses = (outputs.get(sha256) ?? []).filter((use) => !ownUseKeys.has(`${use.restyle.id}\0${use.output.role}`));
          return { sha256, uses, otherByteIdenticalUses };
        });
      if (!alreadyLinkedOutputs.length && !possibleReuse.length && !unresolvedLineage.length) {
        unresolvedLineage.push({ sourceId: id, link: null,
          reason: 'No exact linked or direct pixel-identical output was found; absence does not establish that new generation is appropriate.' });
      }
      return { sourceId: id, alreadyLinkedOutputs, possibleReuse, unresolvedLineage,
        generationRecommendation: 'none' };
    },
    animationGroupsFor: (id) => frameGroups.get(id) ?? [],
    animationGroupMatchesFor: (groupId) => groupCandidates.get(groupId) ?? [],
    appearanceMembershipsFor: (id) => appearances.get(id) ?? [],
  });
}
