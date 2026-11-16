export type GraphicsIdResolution = {
  status: 'empty' | 'exact' | 'alias' | 'ambiguous' | 'missing';
  ids: string[];
};

export function resolveGraphicsAssetId<T extends { id: string }>(
  requestedId: string | null | undefined,
  assets: readonly T[],
  aliasesFor: (asset: T) => readonly string[],
): GraphicsIdResolution;
