/**
 * Savage Frontier post-combat XP arithmetic recovered from the retail Gateway and Treasures
 * `GAME.OVR` files. These functions model battle-end calculation only. Encounter/reaction and the
 * player's explicit choice to enter tactical combat are separate host states.
 *
 * Raw treasure buckets retain their observed DGROUP offsets because their denomination names have
 * not been proven. See `docs/engine/research/savage-frontier-targets.generated.md`.
 */

export const SAVAGE_XP_PER_ITEM_PLUS = 400;

export interface SavageBattleXpResult {
  /** XP before division by the living-party count. */
  total: number;
  /** Retail divisor supplied by the host after excluding its non-living count. */
  livingPartyCount: number;
  /** Integer XP share returned by the retail battle-XP routine. */
  perMember: number;
}

export interface GatewayDefeatedEnemyXp {
  /** Gateway monster word at record offset `0x13C`. */
  flatXp: number;
  /** Gateway monster byte at record offset `0x12C`. */
  rolledHp: number;
  /** Gateway monster byte at record offset `0x13E`. */
  perHpXp: number;
}

export interface GatewayTreasureXp {
  bucket822c?: number;
  bucket8230?: number;
  bucket8234?: number;
  bucket8238?: number;
  bucket823c?: number;
  bucket8240?: number;
  bucket8244?: number;
  itemPluses?: readonly number[];
}

export interface TreasuresDefeatedEnemyXp {
  /** Treasures monster word at record offset `0x198`. */
  flatXp: number;
}

export interface TreasuresTreasureXp {
  bucket9e02?: number;
  bucket9e06?: number;
  bucket9e0a?: number;
  itemPluses?: readonly number[];
}

function uint(value: number | undefined, field: string): number {
  const resolved = value ?? 0;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
  return resolved;
}

function itemPlusXp(pluses: readonly number[] | undefined): number {
  let total = 0;
  for (const plus of pluses ?? []) {
    if (!Number.isSafeInteger(plus) || plus < -128 || plus > 127) {
      throw new RangeError('item plus must be a signed byte integer');
    }
    if (plus > 0) total += plus * SAVAGE_XP_PER_ITEM_PLUS;
  }
  return total;
}

function result(total: number, livingPartyCount: number): SavageBattleXpResult {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError('battle XP total must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(livingPartyCount) || livingPartyCount < 1) {
    throw new RangeError('living party count must be a positive safe integer');
  }
  return { total, livingPartyCount, perMember: Math.floor(total / livingPartyCount) };
}

/** Gateway: monster terms + seven raw treasure conversions + positive `item.plus * 400`. */
export function calcGatewayBattleExp(
  enemies: readonly GatewayDefeatedEnemyXp[],
  loot: GatewayTreasureXp,
  livingPartyCount: number,
): SavageBattleXpResult {
  let total = 0;
  for (const enemy of enemies) {
    total += uint(enemy.flatXp, 'Gateway flat XP');
    total += uint(enemy.rolledHp, 'Gateway rolled HP') * uint(enemy.perHpXp, 'Gateway per-HP XP');
  }
  total += Math.floor(uint(loot.bucket822c, 'Gateway bucket 0x822C') / 200);
  total += Math.floor(uint(loot.bucket8230, 'Gateway bucket 0x8230') / 20);
  total += Math.floor(uint(loot.bucket8234, 'Gateway bucket 0x8234') / 2);
  total += uint(loot.bucket8238, 'Gateway bucket 0x8238');
  total += uint(loot.bucket823c, 'Gateway bucket 0x823C') * 5;
  total += uint(loot.bucket8240, 'Gateway bucket 0x8240') * 250;
  total += uint(loot.bucket8244, 'Gateway bucket 0x8244') * 2200;
  total += itemPlusXp(loot.itemPluses);
  return result(total, livingPartyCount);
}

/** Treasures: flat monster terms + three raw treasure divisions + positive `item.plus * 400`. */
export function calcTreasuresBattleExp(
  enemies: readonly TreasuresDefeatedEnemyXp[],
  loot: TreasuresTreasureXp,
  livingPartyCount: number,
): SavageBattleXpResult {
  let total = 0;
  for (const enemy of enemies) total += uint(enemy.flatXp, 'Treasures flat XP');
  total += Math.floor(uint(loot.bucket9e02, 'Treasures bucket 0x9E02') / 2);
  total += Math.floor(uint(loot.bucket9e06, 'Treasures bucket 0x9E06') / 250);
  total += Math.floor(uint(loot.bucket9e0a, 'Treasures bucket 0x9E0A') / 2200);
  total += itemPlusXp(loot.itemPluses);
  return result(total, livingPartyCount);
}
