export type CokTerrainTileDisposition = {
  tileIndex: number;
  stem: string;
  sha256: string;
  sourcePngSha256: string;
  preservedEmpty: boolean;
};
export type CokTerrainDispositionManifest = {
  game: string;
  system: string;
  archive: string;
  sourceArchiveSha256: string;
  blockId: number;
  tiles: CokTerrainTileDisposition[];
};
export type CokTerrainSource = {
  game: string;
  platform: string;
  archive: { name: string; sha256: string | null };
  locator: { blockId: number | null; tileIndex: number | null };
};
export function cokTerrainDispositionForSource(source: CokTerrainSource | null | undefined, manifest: CokTerrainDispositionManifest):
  { status: 'linked-restyle' | 'preserved-source' | 'unresolved'; tileIndex: number; tile: CokTerrainTileDisposition } | null;
