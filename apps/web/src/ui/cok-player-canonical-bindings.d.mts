import type { CokPlayerRestyleAdmission } from './cok-player-restyle-admission.mjs';

export interface CokPlayerComponentRequest {
  file: string;
  sha256: string;
  width: number;
  height: number;
  colorType: 2 | 6;
}

interface CokPlayerComponentBinding {
  sourceId: string;
  restyleIds: readonly string[];
  original: CokPlayerComponentRequest;
  candidate: CokPlayerComponentRequest;
}

interface CokPlayerCanonicalPlan {
  manifestId: string;
  appearanceSetId: string;
  frames: readonly {
    bodyBlockId: number;
    head: CokPlayerComponentBinding;
    body: CokPlayerComponentBinding;
    admission: CokPlayerRestyleAdmission;
    restyle: { head: CokPlayerComponentRequest; body: CokPlayerComponentRequest } | null;
  }[];
}

interface CokPlayerCanonicalBindings {
  plans: readonly CokPlayerCanonicalPlan[];
  resolve(row: unknown): CokPlayerCanonicalPlan | null;
}

export interface CokPlayerCanonicalFrameIds {
  appearanceSetId: string;
  headSourceId: string;
  bodySourceId: string;
}

interface CokPlayerAppearanceFetchPlan {
  manifestId: string;
  headSize: { nativeWidth: number; nativeHeight: number };
  originalHead: CokPlayerComponentRequest;
  frames: readonly {
    bodyBlockId: number;
    canonical: CokPlayerCanonicalFrameIds | null;
    originalBody: CokPlayerComponentRequest;
    candidateHeadPath?: string;
    candidateBodyPath?: string;
    restyle: { head: CokPlayerComponentRequest; body: CokPlayerComponentRequest } | null;
    reason: string;
  }[];
}

export function validateCokPlayerCanonicalBindings(manifest: unknown, policy: unknown, projection: unknown): CokPlayerCanonicalBindings;
export function tryCokPlayerCanonicalBindings(manifest: unknown, policy: unknown, projection: unknown): CokPlayerCanonicalBindings | null;
export function cokPlayerAppearanceFetchPlan(manifest: unknown, bindings: CokPlayerCanonicalBindings | null, request: unknown): CokPlayerAppearanceFetchPlan | null;
