export interface PaddedPromptTransform {
  method: 'nearest-neighbor';
  nativeSize: [number, number];
  sourceScale: number;
  inputScale: number;
  canvas: [number, number];
  crop: [number, number, number, number];
  cropRgbaSha256: string;
}
export interface ReviewedPrompt {
  batch: string;
  file: string;
  sha256: string;
  text: string;
  inputSha256: string;
  outputSha256: string;
  inputFile: string;
  sourceSha256: string;
  transform: PaddedPromptTransform;
}
type Card = { id: string; sourceSha256: string; outputSha256: string };
type Animation = { id: string; basisSourceSha256: string; basisOutputSha256: string; frames: Record<string, { sha256: string }> };
export function reviewedCardPrompt(card: Card, animation?: Animation | null): ReviewedPrompt | null;
export function isReviewedCardPrompt(reference: unknown, card: Card, animation?: Animation | null): boolean;
export function reviewedSourcePrompt(source: { id: string; decoded?: { sha256?: string | null } | null },
  restyle: { id: string; outputs: readonly { sha256: string }[]; sourceAssetIds: readonly string[];
    externalReferences?: readonly { system: string; id: string }[]; prompt?: { sha256: string | null; inputSha256: string | null } }): ReviewedPrompt | null;
export function paddedInputDescription(reference: Pick<ReviewedPrompt, 'transform' | 'inputFile' | 'inputSha256' | 'sourceSha256' | 'outputSha256'>): string;
