export type FrameHypothesisValidation = { status: 'missing' | 'invalid' | 'ready'; hypotheses: any[]; error: string | null };
export function validateGraphicsFrameHypotheses(sidecar: unknown, registry: any): FrameHypothesisValidation;
export function frameHypothesisRows(validation: FrameHypothesisValidation, registry: any): any[];
