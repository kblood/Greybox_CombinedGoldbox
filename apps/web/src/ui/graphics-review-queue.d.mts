export type ReviewState = { category: string; platform: string; query: string; page: number };
export type ReviewRow = { key: string; unit: string; platforms: string[]; sourceIds: string[]; groupId: string | null; cardId: string | null; reasons: string[]; text: string; details: unknown; evidence: { kind: string; reference: string; note?: string }[] };
export type ReviewModel = { queues: Record<string, ReviewRow[]>; inventory: { status: string; error: string | null; totalCards: number | null; exactCards: number | null; unresolvedCards: number | null; staleReferences: number | null; aliasRows: number | null }; frameHypotheses: { status: string; error: string | null } };
export const REVIEW_CATEGORIES: readonly { id: string; label: string; unit: string }[];
export function buildGraphicsReviewQueues(registry: unknown, inventory?: unknown, frameHypotheses?: unknown): ReviewModel;
export function filterGraphicsReviewRows(model: ReviewModel, options?: { category?: string; platform?: string; query?: string }): ReviewRow[];
export function pageGraphicsReviewRows(rows: ReviewRow[], page?: number, pageSize?: number): { page: number; pageCount: number; total: number; items: ReviewRow[] };
export function readGraphicsReviewQuery(params: URLSearchParams): ReviewState;
export function writeGraphicsReviewQuery(params: URLSearchParams, state: ReviewState): string;
