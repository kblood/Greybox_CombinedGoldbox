export type GraphicsBindingResult = {
  status: 'resolved' | 'unresolved';
  reason: string | null;
  sourceAssetIds: string[];
  sources: Array<Record<string, unknown>>;
  candidateSourceAssetIds?: string[];
  rowId?: string;
  cardId?: string;
};
export type AliasFingerprint = { aliasKey: string; aliasHash: string; rowId?: string };
export type CurrentGraphicsCard = { id: string; sourceSha256: string; outputSha256: string };
export type CurrentAlias = Record<string, unknown>;
export function verifyCurrentComparisonPair(args: { sourceUrl?: string; outputUrl?: string; sourceBytes?: Uint8Array | ArrayBuffer; outputBytes?: Uint8Array | ArrayBuffer; allowFetch?: boolean; expectedSourceSha256: string; expectedOutputSha256: string; fetchImpl?: typeof fetch; cryptoImpl?: Crypto }): Promise<{ status: 'resolved' | 'unresolved'; reason: string | null; sourceSha256?: string; outputSha256?: string; sourceAssetIds?: string[]; sources?: Array<Record<string, unknown>> }>;
export function resolveGeneratedAliasBinding(args: { card: CurrentGraphicsCard; currentAlias: CurrentAlias; aliasIndex: number; aliasFingerprint: AliasFingerprint; sidecar: unknown; registry: unknown }): GraphicsBindingResult;
export function resolveExternalComparisonBinding(args: { card: CurrentGraphicsCard; currentAlias: CurrentAlias; aliasIndex: number; aliasFingerprint: AliasFingerprint; sidecar: unknown; registry: unknown }): GraphicsBindingResult;
export function requireExactRestyleBinding(result: GraphicsBindingResult, expected: { sourceAssetId: string; restyleId: string; outputSha256: string }): GraphicsBindingResult;
export function resolveCuratedCardSources(args: { cardId: string; sourceSha256: string; outputSha256: string; sidecar: unknown; registry: unknown }): GraphicsBindingResult;
