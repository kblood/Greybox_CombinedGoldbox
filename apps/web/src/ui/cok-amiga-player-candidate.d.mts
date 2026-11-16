export interface CokAmigaCandidateRequest {
  candidateId: string;
  atlasSelector: number;
  headSelector: number;
  bodySelector: number;
  variant: number;
}
export interface CokAmigaCandidateCell {
  candidateId: string;
  archiveSha256: string;
  cell: number;
  width: number;
  height: number;
  rawIndices: Uint8Array;
}
export function validateCokAmigaPlayerCandidate(candidate: unknown): unknown;
export function resolveCokAmigaPlayerCandidate(candidate: unknown, request: unknown): {
  candidateId: string; headCell: number; bodyCell: number; variant: number;
  runtimeAdmission: 'held'; playbackAdmission: 'held'; compositionStatus: 'hypothesis-only';
} | null;
export function composeCokAmigaPlayerCandidate(candidate: unknown, request: unknown,
  head: CokAmigaCandidateCell, body: CokAmigaCandidateCell, paletteBytes?: readonly number[], remap?: boolean): {
  width: number; height: number; indices: Uint8Array; opaque: Uint8Array; runtimeAdmission: 'held'; compositionStatus: 'hypothesis-only';
};
