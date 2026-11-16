export type GraphicsArchiveCache<T> = Readonly<{
  readonly size: number;
  clear(): void;
  get(key: string, load: () => T | null | Promise<T | null>): Promise<T | null>;
}>;
export function createGraphicsArchiveCache<T>(readRevision: () => number): GraphicsArchiveCache<T>;
