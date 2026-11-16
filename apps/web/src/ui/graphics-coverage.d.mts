export type CoverageLocator = {
  kind: string;
  blockId?: number | null;
  entryIndex?: number | null;
  frameIndex?: number | null;
  tileIndex?: number | null;
  cellIndex?: number | null;
  glyphIndex?: number | null;
};
export type CoverageAsset = {
  id: string;
  identityStatus: string;
  platform: string;
  archive: { name: string; sha256: string | null };
  locator: CoverageLocator;
};
type CoverageSource = {
  archive: string;
  archiveSha256: string;
  platform: string;
  locator: CoverageLocator;
};
type Mode = 'DOS-EGA' | 'Amiga' | 'Restyle';
type Consumer = { modeBehavior: Record<Mode, string>; sources: string[] };
type Location = { archive: string; archiveSha256: string; blockId: number; blockSha256: string; offset: number };
type CombatBinding = { pictureId: number; rawPictureOperands: number[]; sourceId: string | null; mappingId: string | null };
type DemoSlot = Omit<CombatBinding, 'rawPictureOperands'> & { slot: string; sourceId: string; mappingId: string };
type CombatWitness = { instructionCount: number; offsetTail: number[]; truncated: boolean };
type PictureWitness = { entry: string; instructionSteps: number; offsetPathSha256: string; branchEdgeCount: number; branchEdgesSha256: string };
type Operand = [code: number, value: number];
type Variant = {
  id: string;
  pictureIds: number[];
  dynamicPictures: number;
  roster: [Operand, Operand, Operand][];
  entries: Record<string, CombatWitness>;
};
type Request = Location & { consumer: string; evidence: string; status: string } & (
  { kind: 'ecl-picture'; pictureId: number | null; entries: string[]; sourceIds: string[]; conditionalMappingIds: string[];
      operand: { kind: 'immediate' | 'dynamic'; code: number; value: number }; entryWitnesses: PictureWitness[] }
  | { kind: 'combat-site'; bank: string; bankArchiveSha256: string; entries: string[]; variants: Variant[]; bindings: CombatBinding[] }
);
type State = 'mapped' | 'unmapped' | 'unresolved';
export type CoverageRequestRow = { id: string; request: Request; sources: string[]; mappingIds: string[]; states: (State | 'sentinel')[] };
export type CoverageQuery = { consumer: string; state: State | 'all'; page: number; request: string };
type Mapping = {
  consumer: string;
  baseSourceId: string | null;
  generationSourceId: string | null;
  outputPath: string;
  exactRestyleRecordIds: string[];
  admission: 'runtime-declared' | 'admitted' | 'held';
  admissionReason?: string | null;
  compositionStatus: string;
  sourceStatus: string;
  sourcePngComparison: string;
  evidence: string;
};
type Component = { mappingId: string; role: string };
type Composition = { kind: string; admission: string; consumerIds: string[]; components: Component[]; reason?: string };
type BankCounts = {
  distinctImmediatePictureIds: number;
  withDeclaredMapping: number;
  distinctRosterVariants: number;
  sitesWithDynamicPictureVariant: number;
  sitesWithEmptyRosterVariant: number;
  unmappedPictureIds: number[];
};
type CoverageReport = {
  consumers: Record<string, Consumer>;
  originalSourceUses: { id: string; consumerIds: string[]; platform: string; archive: string; archiveSha256: string;
    blockId: number; locatorKind: string; indexField: 'tileIndex' | 'glyphIndex'; selectionScope: string;
    evidence: string[]; sourceIds: string[] }[];
  sourceAssets: Record<string, CoverageSource>;
  mappings: Record<string, Mapping>;
  outputs: Record<string, { sha256: string }>;
  restyleRecords: Record<string, { registryReview: string; promptStatus: string; outputs: { role: string; sha256: string }[] }>;
  frames: Record<string, Composition>;
  demoCombat: Location & { bank: string; evidence: string[]; bindings: DemoSlot[] };
  limitations: string[];
  runtimeObservation: 'unverified';
  productionPackage: 'unverified';
  summary: {
    canonicalSourceIds: number;
    outputPaths: number;
    distinctOutputHashes: number;
    frameComponentPlacements: number;
    combatScan: {
      physicalSites: number; distinctRosterVariants: number; entrySiteAssociations: number; entryVariantAssociations: number;
      distinctImmediatePictureIds: number; withDeclaredMapping: number; exploredStates: number; blocksAtStateLimit: number;
      sitesWithDynamicPictureVariant: number; sitesWithEmptyRosterVariant: number;
      hasExplorationFrontiers: boolean; frontierEventsByReason: Record<string, number>; byBank: Record<string, BankCounts>;
    };
    eclPictureSites: { total: number; dynamic: number; withConditionalSource: number };
    framesByKind: Record<string, number>;
    mappingEntriesByConsumer: Record<string, number>;
  };
};
type Usage = {
  requests: CoverageRequestRow[];
  mappings: { id: string; role: 'base source' | 'generation source' }[];
  frames: { id: string; component: Component }[];
  originalVariants: string[];
  originalSourceUses: { id: string; consumerIds: string[]; selectionScope: string; evidence: string[] }[];
  demo: DemoSlot[];
};
export type CoverageModel = {
  report: CoverageReport;
  rows: CoverageRequestRow[];
  requestById: Map<string, CoverageRequestRow>;
  usage: Map<string, Usage>;
  sourceLinks: Map<string, string>;
  demoPictureIds: number;
  combatLimits: { statesPerBlock: number; callDepth: number; rosterGroups: number; witnessTail: number };
};
export type SourceCoverageSummary = { id: string; status: 'matched' | 'not-in-snapshot'; runtimeObservation: 'unverified';
  requests: { consumer: string; status: string; states: string[] }[];
  mappings: { consumer: string; role: string; admission: string; compositionStatus: string; sourceStatus: string; evidence: string }[];
  frames: { id: string; kind: string; admission: string; consumerIds: string[] }[];
  originalVariants: string[]; originalSourceUses: { id: string; consumerIds: string[]; selectionScope: string; evidence: string[] }[];
  demoSlots: string[] };
export function coverageSourceMatches(source: CoverageSource | undefined, asset: CoverageAsset | null | undefined): boolean;
export function createCoverageLoader(load: () => Promise<{ report: unknown; receipt: unknown }>, assets: CoverageAsset[]): () => Promise<CoverageModel>;
export function buildCoverageModel(report: unknown, assets: CoverageAsset[], receipt: unknown): CoverageModel;
export function summarizeCoverageForSources(model: CoverageModel, sourceAssetIds: readonly string[]): SourceCoverageSummary[];
export function readCoverageQuery(params: URLSearchParams, model: CoverageModel): CoverageQuery;
export function clearCoverageQuery(params: URLSearchParams): void;
export function writeCoverageQuery(params: URLSearchParams, state: CoverageQuery): URLSearchParams;
export function pageCoverageRequests(model: CoverageModel, state: CoverageQuery, size?: number): {
  page: number; pageCount: number; total: number; items: CoverageRequestRow[];
};
