export type VersionComparisonMember = {
  assetId: string; depth: 0 | 1; resolved: boolean; platform: string | null; edition: string | null;
  links: { relation: string; confidence: string; evidence: any[] }[]; restyleIds: string[];
};
export type VersionComparison = Readonly<{
  subjectId: string; game: string; members: VersionComparisonMember[];
  platforms: { platform: string; editions: { edition: string; assetIds: string[] }[] }[];
  restyles: { id: string; sourceRelation: string | null; sourceAssetIds: string[] }[];
  unverifiedLinkCount: number; unresolvedMemberIds: string[];
  unrecordedPlatforms: { platform: string; status: string; note: string }[];
}>;
export function buildVersionComparison(catalog: { source(id: string): any | null; crossVersionLinksFor(id: string): any[];
  restylesFor(id: string): any[]; scopes: { game: string; platforms: string[] }[] }, subjectId: string): VersionComparison;
