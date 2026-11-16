/**
 * Save/Load bridge (A6.1) — bundles the web build's scattered localStorage stores (party roster,
 * memorised spells, spellbooks, packs, XP, the gold pool, the journal) plus the party's world
 * position / game clock / quest flags into one engine {@link SaveGame}, writes it to a named slot,
 * and restores it on Load. The serialization + validation is pure engine code (`world/saveGame.ts`);
 * this module owns the localStorage plumbing and the cache-refresh that lets a live view see a
 * restored game without a page reload.
 */
import {
  makeSave,
  serializeSave,
  deserializeSave,
  summarizeSave,
  type SaveGame,
  type SavePosition,
  type SaveSummary,
  type ModuleEventStateSnapshot,
} from '@goldbox/engine';
import { reloadStores } from './party.js';
import { reloadJournal } from './journal.js';

// The individual store keys the rest of the app reads/writes (kept in sync with party.ts / journal.ts).
const KEYS = {
  party: 'greybox.party.cok',
  memorize: 'greybox.memorize.cok',
  spellbook: 'greybox.spellbook.cok',
  inventory: 'greybox.inventory.cok',
  gold: 'greybox.gold.cok',
  xp: 'greybox.xp.cok',
  journal: 'greybox.journal.cok',
} as const;

const SLOT_PREFIX = 'greybox.save.cok.';
/** The default slot the Encamp → Save verb writes (and Load reads). */
export const QUICK_SLOT = 'quick';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Snapshot the current campaign (all stores + the given world state) into a SaveGame. */
export function captureSave(opts: {
  name: string;
  position?: SavePosition | null;
  clockMinutes?: number;
  flags?: Record<string, number>;
  areaMemory?: Record<string, Record<string, number>>;
  moduleEventState?: ModuleEventStateSnapshot;
  savedAt?: number;
}): SaveGame {
  return makeSave({
    name: opts.name,
    savedAt: opts.savedAt ?? 0,
    party: readJson(KEYS.party, [] as unknown[]) as never,
    stores: {
      memorize: readJson(KEYS.memorize, {}),
      spellbook: readJson(KEYS.spellbook, {}),
      inventory: readJson(KEYS.inventory, {}),
      xp: readJson(KEYS.xp, {} as Record<string, number>),
      gold: Number(localStorage.getItem(KEYS.gold) ?? 0) || 0,
    },
    journal: readJson(KEYS.journal, { entries: [] }),
    position: opts.position ?? null,
    clockMinutes: opts.clockMinutes ?? 0,
    flags: opts.flags ?? {},
    areaMemory: opts.areaMemory ?? {},
    moduleEventState: opts.moduleEventState,
  });
}

/** Write a SaveGame to a slot. Returns the slot key. */
export function writeSlot(slot: string, save: SaveGame): string {
  const key = SLOT_PREFIX + slot;
  try { localStorage.setItem(key, serializeSave(save)); } catch { /* ignore quota */ }
  return key;
}

/** Capture + write in one step (the Save verb's whole job). */
export function saveToSlot(slot: string, opts: Parameters<typeof captureSave>[0]): SaveGame {
  const save = captureSave(opts);
  writeSlot(slot, save);
  return save;
}

/** Read + validate a slot, or null if it is empty / unparseable. */
export function readSlot(slot: string): SaveGame | null {
  const raw = localStorage.getItem(SLOT_PREFIX + slot);
  return raw ? deserializeSave(raw) : null;
}

export function hasSlot(slot: string): boolean {
  return localStorage.getItem(SLOT_PREFIX + slot) !== null;
}

export function deleteSlot(slot: string): void {
  localStorage.removeItem(SLOT_PREFIX + slot);
}

/** All save slots (slot id + summary), for a load list. */
export function listSlots(): { slot: string; summary: SaveSummary }[] {
  const out: { slot: string; summary: SaveSummary }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SLOT_PREFIX)) continue;
    const save = readSlot(key.slice(SLOT_PREFIX.length));
    if (save) out.push({ slot: key.slice(SLOT_PREFIX.length), summary: summarizeSave(save) });
  }
  return out.sort((a, b) => b.summary.savedAt - a.summary.savedAt);
}

/**
 * Restore a save into the live store keys, then refresh the module caches so views read the restored
 * game immediately. Returns the saved world state (position + clock + flags) so the caller can
 * teleport the explorer / set the clock. The party stores are written verbatim from the slot.
 */
export function applySave(save: SaveGame): {
  name: string; // M46.S1 — the human-facing save label, previously dropped here
  position: SavePosition | null;
  clockMinutes: number;
  flags: Record<string, number>;
  areaMemory: Record<string, Record<string, number>>;
  moduleEventState?: ModuleEventStateSnapshot;
} {
  const set = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  };
  set(KEYS.party, save.party);
  set(KEYS.memorize, save.stores.memorize ?? {});
  set(KEYS.spellbook, save.stores.spellbook ?? {});
  set(KEYS.inventory, save.stores.inventory ?? {});
  set(KEYS.xp, save.stores.xp ?? {});
  try { localStorage.setItem(KEYS.gold, String(save.stores.gold ?? 0)); } catch { /* ignore */ }
  set(KEYS.journal, save.journal);
  // Refresh the in-memory caches the live views hold.
  reloadStores();
  reloadJournal();
  return {
    name: save.name,
    position: save.position,
    clockMinutes: save.clockMinutes,
    flags: save.flags,
    areaMemory: save.areaMemory,
    moduleEventState: save.moduleEventState,
  };
}

/** Load the given slot (default: the quick slot) and apply it; null if the slot is empty. */
export function loadSlot(slot: string = QUICK_SLOT): ReturnType<typeof applySave> | null {
  const save = readSlot(slot);
  return save ? applySave(save) : null;
}
