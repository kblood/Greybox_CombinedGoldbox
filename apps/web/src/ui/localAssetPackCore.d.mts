export type LocalAssetPackReader = { readPath(path: string): Promise<Uint8Array | null> };
export type HostedRestyleReader = { read(path: string, expectedSha256?: string | null, signal?: AbortSignal,
  isCurrent?: () => boolean): Promise<Uint8Array | null>;
  readAnimationIndex(signal?: AbortSignal, isCurrent?: () => boolean): Promise<Uint8Array | null>;
  pin(path: string, signal?: AbortSignal, isCurrent?: () => boolean): Promise<string | null> };
export function createHostedRestyleReader(pin: unknown, baseUrl: string,
  fetcher?: typeof fetch): HostedRestyleReader;
export function createImageDemandLoader(Observer: typeof IntersectionObserver | null):
  (image: HTMLImageElement, load: () => void) => void;
export type LocalAssetPackSnapshot<T> = Readonly<{ pack: T; revision: number }>;
export function createLocalAssetPackEpoch<T>(initialPack: T): Readonly<{
  snapshot(): LocalAssetPackSnapshot<T>;
  replace(nextPack: T): number;
  isCurrent(snapshot: LocalAssetPackSnapshot<T>): boolean;
}>;
export function createLocalImageUrlCache(args: {
  createUrl(bytes: Uint8Array): string;
  revokeUrl(url: string): void;
  matchesHash(bytes: Uint8Array, expectedSha256: string): Promise<boolean>;
}): Readonly<{
  replace(revision: number): void;
  get<T>(snapshot: LocalAssetPackSnapshot<T>, isCurrent: (snapshot: LocalAssetPackSnapshot<T>) => boolean,
    candidates: readonly string[], expectedSha256: string | null | undefined,
    readPath: (snapshot: LocalAssetPackSnapshot<T>, path: string) => Promise<Uint8Array | null>,
    resolveExpected?: (path: string) => Promise<string | null>, provenance?: 'local' | 'hosted'): Promise<string | null>;
}>;
export function readLocalThenHostedImageUrl<T>(cache: ReturnType<typeof createLocalImageUrlCache>,
  snapshot: LocalAssetPackSnapshot<T>, isCurrent: (snapshot: LocalAssetPackSnapshot<T>) => boolean,
  paths: readonly string[], expected: string | null | undefined,
  readLocal: (snapshot: LocalAssetPackSnapshot<T>, path: string) => Promise<Uint8Array | null>,
  readHosted: (snapshot: LocalAssetPackSnapshot<T>, path: string) => Promise<Uint8Array | null>,
  resolveExpected?: (path: string) => Promise<string | null>): Promise<string | null>;
export function readPackSnapshot<T extends LocalAssetPackReader>(snapshot: LocalAssetPackSnapshot<T | null>,
  isCurrent: (snapshot: LocalAssetPackSnapshot<T | null>) => boolean, path: string): Promise<Uint8Array | null>;
export function normalizeLocalPackPath(path: string): string | null;
export function matchesLocalAssetSha256(bytes: Uint8Array, expectedSha256: string): Promise<boolean>;
export function readPinnedLocalAsset(readPath: (path: string) => Promise<Uint8Array | null>, path: string,
  expectedSha256: string): Promise<Uint8Array | null>;
export function readPinnedLocalOrFetch(readPath: ((path: string) => Promise<Uint8Array | null>) | null,
  localPath: string, expectedSha256: string, url: string, maxBytes: number, signal?: AbortSignal,
  label?: string, allowDevelopmentFallback?: boolean, isCurrent?: () => boolean, hostedReader?: HostedRestyleReader): Promise<Uint8Array>;
export function findHashMatchedCandidate<T>(candidates: readonly T[], expectedSha256: string,
  readCandidate: (candidate: T, expectedSha256: string) => Promise<Uint8Array | null>): Promise<Uint8Array | null>;
