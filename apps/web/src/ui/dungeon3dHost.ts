/**
 * Thin, always-loaded host for the 3D dungeon view (`dungeon3d.ts`).
 *
 * The renderer itself is a lazily imported chunk (WebGL2 + Canvas2D painters, picker, minimap), so
 * the router and every OTHER view's start function must be able to ask "close the 3D view" without
 * pulling that chunk in. The chunk registers its teardown here when it mounts; until then
 * `closeDungeon3d()` is a free no-op.
 */

/** Titles the 3D view can open (static, so the sidebar never needs the lazy chunk). */
export interface Dungeon3dTitle { id: string; title: string; kind: 'gen1' | 'dqk' }
export const DUNGEON3D_TITLES: Dungeon3dTitle[] = [
  { id: 'cok', title: 'Champions of Krynn', kind: 'gen1' },
  { id: 'dok', title: 'Death Knights of Krynn', kind: 'gen1' },
  { id: 'coab', title: 'Curse of the Azure Bonds', kind: 'gen1' },
  { id: 'pool', title: 'Pool of Radiance', kind: 'gen1' },
  { id: 'secret', title: 'Secret of the Silver Blades', kind: 'gen1' },
  { id: 'gateway', title: 'Gateway to the Savage Frontier', kind: 'gen1' },
  { id: 'treasures', title: 'Treasures of the Savage Frontier', kind: 'gen1' },
  { id: 'pools', title: 'Pools of Darkness', kind: 'gen1' },
  { id: 'dqk', title: 'The Dark Queen of Krynn', kind: 'dqk' },
];

let closer: (() => void) | null = null;

/** Called by the lazy chunk when a view mounts (fn) and when it tears down (null). */
export function setDungeon3dCloser(fn: (() => void) | null): void {
  closer = fn;
}

/** Close the 3D dungeon view if one is mounted or still loading. Safe to call from any view. */
export function closeDungeon3d(): void {
  closer?.();
}

/** Lazily load the renderer chunk and open the 3D view for a title. */
export async function startDungeon3dLazy(
  gameId: string,
  areaSel?: string | null,
  assetSource?: import('./assetSource.js').AssetSource,
): Promise<number> {
  const mod = await import('./dungeon3d.js');
  return mod.startDungeon3d(gameId, assetSource, areaSel ?? undefined);
}
