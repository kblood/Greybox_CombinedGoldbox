export interface CombatTerrainSource {
  /** Local frame identity travels with the image when RANDCOM is appended. */
  game: string;
  system: string;
  archive: string;
  archiveSha256: string;
  blockId: number;
  tileIndex: number;
}
export declare function cokTerrainSourceMatches(left?: CombatTerrainSource, right?: CombatTerrainSource): boolean;
export declare function cokTerrainRestyleIndicesForSources(
  restyleSources: ReadonlyMap<number, CombatTerrainSource>, activeSources: readonly CombatTerrainSource[],
): Set<number>;
export declare function cokTerrainRestylesForSources<T>(
  artByIndex: ReadonlyMap<number, T>, restyleSources: ReadonlyMap<number, CombatTerrainSource>,
  activeSources: readonly CombatTerrainSource[],
): Map<number, T>;
