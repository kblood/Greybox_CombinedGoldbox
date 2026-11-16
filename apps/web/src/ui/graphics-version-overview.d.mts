export type GameUseState = 'partial-or-verified' | 'only-unknown' | 'other-status' | 'no-records' | 'missing-structure' | 'malformed-structure';
export type GameUseTotals = Readonly<{ assertionRecordCount: number; malformedRecordCount: number; sourcesWithMalformedEntries: number;
  byRecordedStatus: Record<string, number>; sourceStates: Record<GameUseState, number> }>;
export type VersionOverviewRow = Readonly<{
  id: string; platform: string; edition: string; archiveName: string | null; identityStatus: string | null;
  descriptionStatus: string; gameUseState: GameUseState; gameUseRecordCount: number; gameUseMalformedCount: number;
  gameUseByStatus: Record<string, number>; pixelSha256: string | null; pixelGroupSize: number; commonPixelCandidate: boolean; counterpartCount: number; counterpartPlatforms: string[];
  unverifiedLinkCount: number; restyleCount: number; unrecordedPlatforms: string[];
  status: 'cross-platform-recorded' | 'same-platform-only' | 'no-direct-counterpart';
}>;
export type VersionOverview = Readonly<{
  game: string; platforms: string[]; editions: string[]; archives: string[]; rows: VersionOverviewRow[];
  summary: Readonly<{ sourceCount: number; byStatus: Record<string, number>; byPlatform: Record<string, number>;
    byDescriptionStatus: Record<string, number>; gameUse: GameUseTotals; withRestyle: number; pixelGroupsShared: number; largestPixelGroup: number;
    commonPixelCandidateGroups: number; commonPixelCandidateSources: number }>;
}>;
export function buildVersionOverview(catalog: any, game: string): VersionOverview;
export const VERSION_OVERVIEW_PAGE_SIZE: number;
export function filterVersionOverview(overview: VersionOverview,
  state: { status: string; platform: string; edition?: string; archive?: string; unverifiedOnly?: boolean; page: number }):
  { rows: VersionOverviewRow[]; pageCount: number; page: number };
export type VersionCoverageRow = Readonly<{ platform: string; archiveName?: string | null; sourceCount: number;
  byStatus: Record<'cross-platform-recorded' | 'same-platform-only' | 'no-direct-counterpart', number>; withRestyle: number;
  byDescriptionStatus: Record<string, number>; gameUse: GameUseTotals }>;
export function coverageByPlatformAndArchive(overview: VersionOverview): VersionCoverageRow[];
export function coverageByPlatform(overview: VersionOverview): VersionCoverageRow[];
export const COMMON_PIXEL_THRESHOLD: number;
