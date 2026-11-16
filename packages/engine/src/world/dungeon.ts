/**
 * Dungeon load orchestration — DOS Champions of Krynn (M1.S5d).
 *
 * Ties the per-dungeon pipeline together into one tested entry point: run a dungeon's
 * **ECL init block** through the VM, take its `loadFiles` (GEO map block) and `loadPieces`
 * (resolved WALLDEF symbol-set triple — already through the COAB CMD_LoadFiles dispatch, see
 * `EclVm.resolvePieces`) effects, then decode the GEO map and load the WALLDEF/8X8D wall sets.
 *
 * The result drives both views directly: `map` → the top-down automap + `Explorer`, and
 * `{map, walls}` → `composeWallView`/`renderWallView` for the first-person EGA viewport. This
 * is the seam the web/Electron host calls on dungeon entry — keeping all the GEO+ECL+WALLDEF
 * coordination in the pure engine where it is unit-testable against real game bytes.
 */
import type { GameMap } from '../model/index.js';
import { decodeGeoBlock } from '../loaders/geo.js';
import { EclVm, type EclEffect } from '../ecl/vm.js';
import type { EclDialect } from '../ecl/disassemble.js';
import { loadDungeonWalls, type DungeonWalls, type DungeonWallSources } from './dungeonWalls.js';
import { collectText } from './dialogue.js';

type LoadFilesEffect = Extract<EclEffect, { type: 'loadFiles' }>;
type LoadPiecesEffect = Extract<EclEffect, { type: 'loadPieces' }>;
type AddNpcEffect = Extract<EclEffect, { type: 'addNpc' }>;

/** Sources for the per-area DAX blocks the init effects name (all already DAX-decompressed). */
export interface DungeonSources extends DungeonWallSources {
  /** Decompressed `GEO{area}.DAX` block by id, or null if absent. */
  geoBlock(blockId: number): Uint8Array | null;
}

/** The fully loaded dungeon: map + wall assets + the init signals that produced them. */
export interface LoadedDungeon {
  /** Engine-neutral dungeon grid (drives the automap + `Explorer`). */
  map: GameMap;
  /** Loaded WALLDEF/8X8D sets (drives `composeWallView`/`renderWallView`). */
  walls: DungeonWalls;
  /** The GEO map block the ECL `loadFiles` named. */
  geoBlockId: number;
  /** The resolved per-set WALLDEF block ids + raw operands + two-set flag (from `loadPieces`). */
  pieces: Pick<LoadPiecesEffect, 'setBlockIds' | 'operands' | 'twoSet'>;
  /**
   * ECL `ADD_NPC` (0x36) sites the init block scripted, in emission order — "recruit a named
   * companion" (M35.S1). Empty for every dungeon that has none (the common case). `morale` is the
   * raw operand the host must apply to the resolved combatant, OVERWRITING the monster record's own
   * stored morale byte (COAB `CMD_AddNPC` reassigns it — see `EclEffect`'s `addNpc` doc).
   */
  npcJoins: { npcId: number; morale: number }[];
  /**
   * Narrative text from any `print` effect the init block emitted before exiting/chaining — joined
   * in emission order via the same `collectText` the per-cell dialogue runner uses (M36.S1). Empty
   * string for the common case (no init-block narration, e.g. CoK's own default boot block).
   */
  introText: string;
}

/**
 * Run a dungeon's ECL init block and load everything it asks for.
 *
 * `initEcl` is the decompressed ECL block bytes (e.g. `ECL1` block 34). The VM runs it once;
 * dungeon-init blocks emit their `loadFiles`/`loadPieces` before exiting or chaining, so a
 * single run captures them. `opts.memory` pre-seeds VM memory (e.g. area flags) when a caller
 * needs to force a specific area variant; normally the init block sets them itself. `opts.entry`
 * is for a byte-located route. `opts.dialect` selects profile-specific virtual-address mapping,
 * including Pool's early-Gen1 `0x98FE` base. `opts.fallbackPieces` supplies a default WALLDEF
 * `setBlockIds` triple to use when the init block emits `loadFiles` but genuinely never calls
 * LOAD_PIECES itself — Treasures of the Savage Frontier's own wilderness-encounter scripts do
 * this for real (see `ECL_GEN1_SHORT_TREASURES`'s doc comment): they reuse a wall/tile set the
 * host is expected to already have loaded, rather than reissuing it per encounter. Every other
 * caller omits this and keeps the strict original behavior.
 *
 * Throws if the block emits no `loadFiles`, if neither `loadPieces` nor `opts.fallbackPieces` are
 * available, if the GEO block is absent, or if `loadDungeonWalls` rejects the WALLDEF set (missing
 * block / record overflow).
 */
export function loadDungeon(
  initEcl: Uint8Array,
  sources: DungeonSources,
  opts: {
    memory?: Map<number, number>;
    label?: string;
    entry?: number;
    dialect?: EclDialect;
    fallbackPieces?: readonly [number, number, number];
  } = {},
): LoadedDungeon {
  const vm = new EclVm(initEcl, {
    ...(opts.memory ? { memory: opts.memory } : {}),
    ...(opts.entry !== undefined ? { entry: opts.entry } : {}),
    ...(opts.dialect ? { dialect: opts.dialect } : {}),
  });
  const result = vm.run();

  const loadFiles = result.effects.find((e): e is LoadFilesEffect => e.type === 'loadFiles');
  const loadPiecesEffect = result.effects.find((e): e is LoadPiecesEffect => e.type === 'loadPieces');
  if (!loadFiles) {
    throw new Error('loadDungeon: ECL init block emitted no LOAD_FILES (GEO map) effect');
  }
  const loadPieces: Pick<LoadPiecesEffect, 'setBlockIds' | 'operands' | 'twoSet'> | undefined =
    loadPiecesEffect ??
    (opts.fallbackPieces
      ? { setBlockIds: [...opts.fallbackPieces] as [number, number, number], operands: [...opts.fallbackPieces] as [number, number, number], twoSet: false }
      : undefined);
  if (!loadPieces) {
    throw new Error('loadDungeon: ECL init block emitted no LOAD_PIECES (WALLDEF) effect');
  }

  const geoRaw = sources.geoBlock(loadFiles.geoBlockId);
  if (!geoRaw) {
    throw new Error(`loadDungeon: GEO block ${loadFiles.geoBlockId} not found`);
  }
  const { map } = decodeGeoBlock(geoRaw, opts.label ?? `GEO#${loadFiles.geoBlockId}`);
  const walls = loadDungeonWalls(loadPieces.setBlockIds, sources);
  const npcJoins = result.effects
    .filter((e): e is AddNpcEffect => e.type === 'addNpc')
    .map((e) => ({ npcId: e.npcId, morale: e.morale }));
  const introText = collectText(result.effects);

  return {
    map,
    walls,
    geoBlockId: loadFiles.geoBlockId,
    pieces: { setBlockIds: loadPieces.setBlockIds, operands: loadPieces.operands, twoSet: loadPieces.twoSet },
    npcJoins,
    introText,
  };
}
