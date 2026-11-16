import type { Combatant, EncounterMonster, GraphicSetId, MonsterLookup, MonsterRecord } from '@goldbox/engine';
import type { CombatAssetPaths } from './combat.js';
import type { RuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import type { AssetSource } from './assetSource.js';

/** Leave pointer clicks and native button navigation/activation to the graphics controls. */
export function isDemoGraphicsControl(target: EventTarget | null, key?: string): boolean {
  if (key !== undefined && key !== 'Tab' && key !== 'Enter' && key !== ' ') return false;
  return target instanceof Element && target.closest('[data-demo-graphics-control]') !== null;
}

interface DemoPictureScene {
  partyPictureIds?: readonly number[];
  partyPictureFlips?: readonly boolean[];
  flipPartyPictures?: boolean;
  flipEnemyPictures?: boolean;
}

/** Give the original icon and the Restyle lookup the same picture ID for each combatant. */
export function demoCombatRoster(
  npcJoins: readonly { npcId: number; morale: number }[],
  groups: readonly EncounterMonster[],
  lookup: MonsterLookup,
  combatantFrom: (record: MonsterRecord, id: string, side: 'party' | 'enemy', morale?: number) => Combatant,
  scene?: DemoPictureScene,
) {
  const party: Combatant[] = [];
  const enemies: Combatant[] = [];
  const pictures = new Map<string, { blockId: number; flip?: boolean }>();
  npcJoins.forEach(({ npcId, morale }, index) => {
    const record = lookup(npcId);
    if (!record) return;
    const id = `demo-npc-${index}`;
    party.push(combatantFrom(record, id, 'party', morale));
    pictures.set(id, {
      blockId: scene?.partyPictureIds?.[index] ?? npcId,
      flip: scene?.partyPictureFlips?.[index] ?? scene?.flipPartyPictures,
    });
  });
  for (const { monsterId, count, picBlockId } of groups) {
    const record = lookup(monsterId);
    if (!record) continue;
    for (let index = 0; index < Math.max(1, count); index++) {
      const id = `demo-foe-${enemies.length}`;
      enemies.push(combatantFrom(record, id, 'enemy'));
      pictures.set(id, { blockId: picBlockId, flip: scene?.flipEnemyPictures });
    }
  }
  return { party, enemies, pictures };
}

/** Read combat DAX banks from the selected local CoK install; never use a bundled fallback there. */
export function demoCombatAssetReader(assetSource?: Pick<AssetSource, 'readAsset'>): CombatAssetPaths['readAsset'] | undefined {
  if (!assetSource) return undefined;
  return async (path) => {
    const basename = path.split(/[\\/]/).at(-1) ?? path;
    const bytes = await assetSource.readAsset(basename);
    if (!bytes) throw new Error(`${basename} was not found in the selected game folder`);
    return bytes;
  };
}

/** Keep the demo's source banks and apply CoK's shared presentation choice. */
export function demoCombatAssetPaths(
  paths: CombatAssetPaths | undefined,
  gameId: string | undefined,
  mode: RuntimeGraphicsMode,
  fallback: GraphicSetId,
  readAsset?: CombatAssetPaths['readAsset'],
): CombatAssetPaths | undefined {
  if (!paths || gameId !== 'cok') return paths;
  return {
    ...paths,
    ...(readAsset ? { readAsset } : {}),
    runtimeGameId: 'cok',
    graphicsMode: mode === 'Restyle' ? fallback : mode,
    restyleMode: mode === 'Restyle',
  };
}
