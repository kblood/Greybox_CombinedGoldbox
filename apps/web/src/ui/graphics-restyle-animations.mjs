// Resolve generated hub previews only through the full canonical source →
// Restyle record → inventory card → exact image hash chain.
export function restyleAnimationsForSource(asset, restyles, inventory) {
  if (!asset?.decoded || !Array.isArray(restyles) || !Array.isArray(inventory?.assets)) return [];
  const matches = [];
  for (const restyle of restyles) {
    if (!restyle.sourceAssetIds?.includes(asset.id)) continue;
    const cardIds = new Set((restyle.externalReferences ?? [])
      .filter((reference) => reference.system === 'cok-restyle-inventory-v1')
      .map((reference) => reference.id));
    if (!cardIds.size || !restyle.outputs?.length) continue;
    for (const item of inventory.assets) {
      if (!cardIds.has(item.id) || item.sourceSha256 !== asset.decoded.sha256) continue;
      if (!restyle.outputs.some((output) => output.sha256?.toLowerCase() === item.outputSha256.toLowerCase())) continue;
      if (!Array.isArray(item.animations) || !item.animations.length) continue;
      for (const animation of item.animations) {
        if (animation.basisSourceSha256 !== asset.decoded.sha256
            || animation.basisOutputSha256 !== item.outputSha256
            || animation.frames?.r0?.sha256 !== item.outputSha256) continue;
        matches.push({ restyleId: restyle.id, item, animation });
      }
    }
  }
  return matches.sort((a, b) => a.animation.id < b.animation.id ? -1 : a.animation.id > b.animation.id ? 1 : 0);
}
