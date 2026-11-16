const SHA256 = /^[a-f0-9]{64}$/i;

/** Resolve a terrain manifest row only through its complete source archive and locator identity. */
export function cokTerrainDispositionForSource(source, manifest) {
  if (!source || !manifest || source.game !== manifest.game || source.platform !== manifest.system
      || source.archive?.name !== manifest.archive
      || source.archive?.sha256?.toLowerCase() !== manifest.sourceArchiveSha256?.toLowerCase()
      || source.locator?.blockId !== manifest.blockId || !Number.isInteger(source.locator?.tileIndex)) return null;

  const tile = manifest.tiles.find((candidate) => candidate.tileIndex === source.locator.tileIndex);
  if (!tile) return null;
  if (tile.preservedEmpty === true) {
    const hashesMatch = SHA256.test(tile.sha256 ?? '') && SHA256.test(tile.sourcePngSha256 ?? '')
      && tile.sha256.toLowerCase() === tile.sourcePngSha256.toLowerCase();
    return { status: hashesMatch ? 'preserved-source' : 'unresolved', tileIndex: tile.tileIndex, tile };
  }
  if (tile.preservedEmpty !== false || !SHA256.test(tile.sha256 ?? '')) {
    return { status: 'unresolved', tileIndex: tile.tileIndex, tile };
  }
  return { status: 'linked-restyle', tileIndex: tile.tileIndex, tile };
}
