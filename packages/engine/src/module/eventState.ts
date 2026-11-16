/** Portable, versioned durable state for authored/FRUA module events. Kept separate from the ECL
 * runtime so save-game repair can depend on this tiny pure schema without pulling in a module VM. */
import type { GiveTreasureEventEffect } from './types.js';

export const MODULE_EVENT_STATE_VERSION = 1 as const;
export const MODULE_ARTIFACT_ID_MAX_LENGTH = 256 as const;

/** Normalize an opaque immutable-artifact identity at an untrusted boundary. Identities are kept
 * byte-for-byte rather than trimmed or case-folded: changing their spelling must never broaden
 * which artifact may consume a save. The deliberately small printable-ASCII alphabet covers
 * SHA-256 hex, UUIDs, and algorithm-prefixed content IDs while keeping logs/storage keys safe. */
export function normalizeModuleArtifactId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > MODULE_ARTIFACT_ID_MAX_LENGTH) {
    return null;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/.test(value) ? value : null;
}

export interface ModuleEventStateSnapshot {
  version: typeof MODULE_EVENT_STATE_VERSION;
  moduleId: string;
  /** Immutable package/content identity. Omitted only by legacy, unfingerprinted runtimes. */
  artifactId?: string;
  consumedEventIds: number[];
  /** Canonical exact-once Give Treasure receipts. Omitted when empty so schema-1 snapshots written
   * before source-shaped rewards retain their exact historical JSON shape. */
  treasureReceipts?: GiveTreasureEventEffect[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTreasureReceipt(value: unknown): GiveTreasureEventEffect | null {
  if (!isObject(value) || value.type !== 'giveTreasure' ||
      typeof value.eventId !== 'number' || !Number.isSafeInteger(value.eventId) || value.eventId <= 0 ||
      typeof value.platinum !== 'number' || !Number.isSafeInteger(value.platinum) ||
        value.platinum < 0 || value.platinum > 0x7fffffff ||
      typeof value.gems !== 'number' || !Number.isSafeInteger(value.gems) || value.gems < 0 || value.gems > 0xffff ||
      typeof value.jewelry !== 'number' || !Number.isSafeInteger(value.jewelry) ||
        value.jewelry < 0 || value.jewelry > 0xffff ||
      !Array.isArray(value.items) || value.items.length > 8 ||
      !value.items.every((item) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 1 && item <= 0xff) ||
      typeof value.itemsIdentified !== 'boolean') {
    return null;
  }
  return {
    type: 'giveTreasure',
    eventId: value.eventId,
    platinum: value.platinum,
    gems: value.gems,
    jewelry: value.jewelry,
    items: [...value.items] as number[],
    itemsIdentified: value.itemsIdentified,
  };
}

/** Repair an untrusted snapshot without needing a loaded module. Package-specific validation is
 * applied by `ModuleEventRuntime.restore`. */
export function normalizeModuleEventStateSnapshot(value: unknown): ModuleEventStateSnapshot | null {
  if (!isObject(value) || value.version !== MODULE_EVENT_STATE_VERSION || typeof value.moduleId !== 'string') {
    return null;
  }
  let artifactId: string | undefined;
  if (value.artifactId !== undefined) {
    const normalized = normalizeModuleArtifactId(value.artifactId);
    if (normalized === null) return null;
    artifactId = normalized;
  }
  if (!Array.isArray(value.consumedEventIds)) return null;
  const consumedEventIds = [...new Set(value.consumedEventIds.filter(
    (id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
  ))].sort((a, b) => a - b);
  const receiptByEventId = new Map<number, GiveTreasureEventEffect>();
  if (Array.isArray(value.treasureReceipts)) {
    for (const candidate of value.treasureReceipts) {
      const receipt = normalizeTreasureReceipt(candidate);
      if (receipt && !receiptByEventId.has(receipt.eventId)) receiptByEventId.set(receipt.eventId, receipt);
    }
  }
  const treasureReceipts = [...receiptByEventId.values()].sort((left, right) => left.eventId - right.eventId);
  return {
    version: MODULE_EVENT_STATE_VERSION,
    moduleId: value.moduleId,
    ...(artifactId !== undefined ? { artifactId } : {}),
    consumedEventIds,
    ...(treasureReceipts.length > 0 ? { treasureReceipts } : {}),
  };
}
