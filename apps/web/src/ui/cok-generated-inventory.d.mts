export interface CokGeneratedAlias { ledger: string; status: string; family: string; platform: string; [key: string]: unknown }
import type { ReviewedPrompt } from './cok-batch02-prompt-lineage.mjs';
type DirectPrompt = { file: string; sha256: string; inputSha256: string; outputSha256: string; text: string };
export type CokGeneratedPromptReference = (DirectPrompt & { batch: string }) | ReviewedPrompt;
export interface CokGeneratedAnimation { id: string; label: string; basisSourceSha256: string; basisOutputSha256: string; playbackOrder: string[]; frames: Record<string, { sha256: string; size: [number, number]; note: string; promptReference: DirectPrompt | ReviewedPrompt | null }>; playbackEvidence: string; derivation: string }
export interface CokGeneratedHeldRow { ledger: string; index: number; status: string; reason: string }
export interface CokGeneratedExcludedRow { ledger: string; index: number; status: string; [key: string]: unknown }
export interface CokGeneratedAsset {
  id: string; stem: string; label: string; family: string; families: string[]; platform: string; platforms: string[];
  source: string; output: string; sourceName: string; sourceProvenance: string; sourceSha256: string; outputSha256: string; outputType: string;
  sourceSize: [number, number]; outputSize: [number, number]; ledgerStatuses: string[]; aliases: CokGeneratedAlias[];
  sourceMatched: true; compositionReview: 'not-reviewed'; runtimeApproved: boolean; runtimeApprovalEvidence: string[]; prompt: string;
  reviewNotes: string[];
  animations: CokGeneratedAnimation[];
  promptReferences: CokGeneratedPromptReference[];
}
export interface CokGeneratedExternalComparison { id: 'cok_overland_bigpic1_121'; stem: '074_cok_overland_bigpic1_121'; label: string; sourceSha256: string; outputSha256: string; runtimeApproved: true; approvalEvidence: string; aliases: CokGeneratedAlias[] }
export interface CokGeneratedInventory { schema: string; imageMode?: 'bundled' | 'local-pack'; assets: CokGeneratedAsset[]; counts: { ledgerRecords: number; eligibleRecords: number; sourceOutputEdges: number; tileAliasRows: number; uniquePairs: number; externalComparisonAliases: number; aliasEdges: number; animations: number; animationPlaybackSteps: number; excludedRows: number; heldRows: number; uniquePngFiles: number; uniquePngBytes: number }; held: CokGeneratedHeldRow[]; excluded: CokGeneratedExcludedRow[]; externalComparisons: CokGeneratedExternalComparison[] }
export function validateCokGeneratedInventory(data: unknown): CokGeneratedInventory;
export function filterCokGeneratedAssets(assets: CokGeneratedAsset[], options?: { family?: string; platform?: string; status?: string; runtime?: 'all' | 'approved' | 'candidate'; query?: string }): CokGeneratedAsset[];
export function pageCokGeneratedAssets<T>(assets: T[], page?: number, pageSize?: number): { page: number; pageCount: number; total: number; items: T[] };
