export type CensusChild = {
  kind: string; index: number | null; width: number; height: number; candidate: boolean;
  rgbSha256: string | null; indexSha256: string | null; sourceIds: string[];
};
type CensusParent = {
  children: CensusChild[]; derived: CensusChild[]; drawableCount: number | null; locatorSourceIds: string[];
  status: string; issue: string | null;
};
export type CensusEntry = CensusParent & {
  entryIndex: number; blockId: number; sameIdOccurrence: number; offset: number; storedBytes: number;
  declaredRawBytes: number | null; payloadSha256: string | null; rawSha256: string | null; profile: string | null;
};
export type CensusFile = CensusParent & {
  sourceSet: string; path: string; sha256: string; observedSha256: string | null; bytes: number; observedBytes: number | null;
  format: string | null; category: string; expectedEntries: number | null; entries: CensusEntry[];
};
type Unresolved = { sourceSet: string | null; path: string | null; entryIndex: number | null; sourceId: string; reason: string };
type CensusSummary = {
  documentedGraphicsFiles: number; rosterFiles: number; observedFiles: number; pinMatchedFiles: number;
  uniqueObservedContents: number; storedEntries: number; entryLocatorsWithRegistryRows: number;
  filesWithRegistryEntryLocators: number; structuralFiles: number; structuralStoredEntries: number;
  classificationOpenFiles: number; filesWithUnknownDrawableCount: number; entriesWithUnknownDrawableCount: number;
  parsedDrawableChildren: number; parsedCandidateDrawableChildren: number; drawableChildrenWithExactBinding: number;
  drawableChildrenWithoutExactBinding: number; derivedViews: number; derivedViewsWithExactBinding: number;
  totalDrawableCount: number | null;
};
type CensusReport = {
  game: 'cok' | 'dok'; registryAssetIdentitySha256: string; registryAssetProjectionSha256?: string; rosterSha256?: string;
  sourceSets: { id: string; platform: string; provenance: string; summary: CensusSummary }[];
  files: CensusFile[]; unresolvedRegistryBindings: Unresolved[];
};
export type CensusModel = { report: CensusReport; byFile: Map<string, CensusFile>; bindings: Map<string, { referenced: number; bound: number }> };
export type CensusQuery = {
  game: string; set: string; file: string; status: string; page: number; entry: number | null; entryPage: number;
  childPage: number; unresolvedPage: number;
};
export type CensusPage<T> = { page: number; pages: number; items: T[] };
export function registryIdentityDigest(assets: readonly unknown[], game?: string): Promise<string>;
export function buildSourceCensus(report: unknown, assets: readonly unknown[], dokRoster?: unknown): Promise<CensusModel>;
export function censusFileKey(file: Pick<CensusFile, 'sourceSet' | 'path'>): string;
export function createSourceCensusLoader<T>(load: () => Promise<T>): () => Promise<T>;
export function clearSourceCensusQuery(params: URLSearchParams): void;
export function readSourceCensusQuery(params: URLSearchParams): CensusQuery;
export function writeSourceCensusQuery(params: URLSearchParams, state: CensusQuery): URLSearchParams;
export function censusPage<T>(rows: readonly T[], page: number): CensusPage<T>;
export function sourceCensusSelection(model: CensusModel, state: CensusQuery): {
  missingSet: boolean; missingStatus: boolean; files: CensusPage<CensusFile>; file?: CensusFile; entry?: CensusEntry;
};
