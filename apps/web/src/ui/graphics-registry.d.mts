type SourceAsset = { id: string; game: string };
type SourceRegistry = {
  registryVersion: number; assets: SourceAsset[]; animationGroups: unknown[]; restyles: unknown[];
  crossVersionLinks: unknown[]; appearanceSets?: unknown[];
};
export function composeGraphicsRegistry<T extends SourceRegistry>(base: T, ...shards: {
  game: string; registry: SourceRegistry; checkAsset: (asset: SourceAsset) => boolean;
  exactVisualDescriptions?: { sidecar: unknown; donor: unknown; transfer?: unknown };
}[]): T;
export function dokGraphicsAssetCheck(roster: unknown): (asset: SourceAsset) => boolean;
export function dokArchiveCategory(name: string): 'drawable' | 'structural' | 'unsupported';
