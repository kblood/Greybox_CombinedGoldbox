export function cokTerrainSourceMatches(left, right) {
  return !!left && !!right && left.game === right.game && left.system === right.system
    && left.archive === right.archive && left.archiveSha256 === right.archiveSha256
    && left.blockId === right.blockId && left.tileIndex === right.tileIndex;
}

export function cokTerrainRestyleIndicesForSources(restyleSources, activeSources) {
  const result = new Set();
  for (const [index, source] of restyleSources) {
    if (cokTerrainSourceMatches(source, activeSources[index])) result.add(index);
  }
  return result;
}

export function cokTerrainRestylesForSources(artByIndex, restyleSources, activeSources) {
  const compatible = cokTerrainRestyleIndicesForSources(restyleSources, activeSources);
  return new Map([...artByIndex].filter(([index]) => compatible.has(index)));
}
