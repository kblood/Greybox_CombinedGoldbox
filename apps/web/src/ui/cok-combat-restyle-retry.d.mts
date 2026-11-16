export interface CokCombatRestyleRetryRequest<T> {
  archiveSha256: string | undefined; generation: string;
  requestedIds: Iterable<number>; failedIds: ReadonlySet<number>; successfulIds: ReadonlySet<number>;
  admitted: (id: number) => boolean; load: (id: number) => Promise<T>;
  isCurrent: () => boolean; apply: (id: number, result: T) => void;
  failed: (id: number, error: unknown) => void;
}
export function createCokCombatRestyleRetry(): <T>(request: CokCombatRestyleRetryRequest<T>) => Promise<void>;
