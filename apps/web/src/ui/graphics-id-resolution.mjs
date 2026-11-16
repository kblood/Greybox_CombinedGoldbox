/**
 * Resolve a bookmark against canonical source IDs and secondary search aliases.
 * Exact IDs always take precedence. Alias collisions are returned to the caller
 * instead of selecting whichever registry row happens to occur first.
 */
export function resolveGraphicsAssetId(requestedId, assets, aliasesFor) {
  const query = String(requestedId ?? '').trim().toLowerCase();
  if (!query) return { status: 'empty', ids: [] };

  const exactIds = [...new Set(assets
    .filter((asset) => asset.id.toLowerCase() === query)
    .map((asset) => asset.id))];
  if (exactIds.length === 1) return { status: 'exact', ids: exactIds };
  if (exactIds.length > 1) return { status: 'ambiguous', ids: exactIds };

  const aliasIds = [...new Set(assets
    .filter((asset) => aliasesFor(asset).some((alias) => alias.toLowerCase() === query))
    .map((asset) => asset.id))];
  if (aliasIds.length === 1) return { status: 'alias', ids: aliasIds };
  if (aliasIds.length > 1) return { status: 'ambiguous', ids: aliasIds };
  return { status: 'missing', ids: [] };
}
