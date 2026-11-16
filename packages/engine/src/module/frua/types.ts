/**
 * FRUA `.DSN` `GEOxxx.DAT` — raw decoded shape (M5.S2). Byte layout verified against the
 * community hackdocs (`hackdocs_extracted/GEODATA.TXT`, `GEOGRIDS.TXT`, `GEOENTRY.TXT`,
 * `GEOEVENT.TXT` — by Nol Drek / Halfscan / others) — see
 * `docs/engine/research/frua-and-dungeon-craft.md` §1.1 for the broader `.DSN` folder
 * context (a design is a folder of these plus `GAME001.DAT`/`MONSTxxx.DAT`/`STRGxxx.DAT`,
 * not modelled yet — this slice is the per-map file only).
 *
 * This is the FRUA-shaped layer: it preserves FRUA's own structure (all 38 event-type
 * slots, the full grid, all 8 entry points) losslessly, including type-specific bytes that
 * aren't field-decoded yet (kept in `raw16`, cited per type in `decode.ts`'s
 * `FRUA_EVENT_FIELD_MAP`). `importer.ts` maps the parts that are representable today into
 * the engine's `ModulePackage`/`ModuleEvent` model; anything not yet representable is
 * reported, not dropped or invented — see `FruaImportResult.unmapped`.
 */
import type { Direction } from '../../model/index.js';

export type FruaWallKind =
  | 'open'
  | 'secret'
  | 'locked'
  | 'lockedSecret'
  | 'wizardLocked'
  | 'wizardLockedSecret'
  | 'lockedKey'
  | 'blocked'
  | 'falseDoor';

export interface FruaWall {
  /** 0 = blank wall (no wall present); 1–15 = wall/door graphic slot. */
  slot: number;
  kind: FruaWallKind;
  /** 0–7, present only when `kind === 'lockedKey'`. */
  keyIndex?: number;
}

export interface FruaCell {
  north: FruaWall;
  east: FruaWall;
  south: FruaWall;
  west: FruaWall;
  /** 0 = no event; else a 1-based slot into `FruaGeo.events`. */
  eventSlot: number;
  /** 0–3. */
  backdropSlot: number;
  /** 0–7. */
  zone: number;
}

export interface FruaEntryPoint {
  x: number;
  y: number;
  facing: Direction;
}

export interface FruaRestEvent {
  minutes: number;
  eventSlot: number;
  percentChance: number;
  noRest: boolean;
}

export interface FruaStepEvent {
  steps: number;
  eventSlot: number;
  /** 0 = all zones; else a bitmask of EXCLUDED zones (bit i = zone i+1 excluded). */
  excludedZoneMask: number;
}

/** Trigger condition decoded from an event's common byte 2/3 (GEOEVENT.TXT "THE FIRST FOUR
 * BYTES"). `value` is byte 3 ("Condition to Check") — its meaning depends on `kind` (an
 * item/quest# 0–63, a 1–99 percentage, a direction bitmask 1–15, or a class/race id); see
 * GEOEVENT.TXT for the per-kind value table (not further decoded here). */
export interface FruaCondition {
  kind:
    | 'always'
    | 'hasSpecialItem'
    | 'lacksSpecialItem'
    | 'dayTime'
    | 'nightTime'
    | 'randomPercent'
    | 'partySearching'
    | 'partyNotSearching'
    | 'facingDirection'
    | 'questComplete'
    | 'questFailed'
    | 'questInProgress'
    | 'partyDetectingTraps'
    | 'partyNotDetectingTraps'
    | 'partySeesInvisible'
    | 'partyCannotSeeInvisible'
    | 'classInParty'
    | 'raceInParty';
  value: number;
}

/** Decoded type-10 Question-Button payload. GEOEVENT.TXT stores the visible labels in one
 * caret-delimited string and the five branch destinations/return/backup flags in parallel byte
 * fields. Keeping both the split labels and all five raw button positions prevents an absent
 * fifth label from shifting a later branch. */
export interface FruaQuestionButton {
  prompt: string;
  /** The source string before caret splitting, retained for byte/text provenance. */
  labelsText: string;
  /** Caret-delimited button positions (at most five). Internal empty positions are retained so
   * later labels stay aligned with their parallel target/flag bytes. */
  labels: string[];
  /** Button 1..5 chain targets; zero means that button has no target. */
  branchTargets: [number, number, number, number, number];
  /** 1-based button numbers whose post-chain behavior is "return to question". */
  repeatQuestionButtons: number[];
  /** 1-based button numbers whose post-chain behavior is "backup one step". */
  backupOneStepButtons: number[];
  /** Byte 8's +128 flag. False means picture semantics remain relevant to the event. */
  noArt: boolean;
}

export interface FruaCombatGroup {
  /** Source group position 1..6; retained even when count/monsterSlot is zero. */
  group: 1 | 2 | 3 | 4 | 5 | 6;
  monsterSlot: number;
  count: number;
  /** FRUA only provides friendly flags for groups 4..6. */
  friendly: boolean;
}

/** Typed view over Combat event bytes 5..20 from GEOEVENT.TXT. Raw bytes remain on `FruaEvent`. */
export interface FruaCombat {
  intro: string;
  pictureId: number;
  noArt: boolean;
  moraleModifier: number;
  surprise: 'none' | 'party' | 'monsters' | 'reserved';
  outdoors: boolean;
  groups: [FruaCombatGroup, FruaCombatGroup, FruaCombatGroup, FruaCombatGroup, FruaCombatGroup, FruaCombatGroup];
  autoApproach: boolean;
  partyNeverDies: boolean;
  noTreasure: boolean;
  magicWorks: boolean;
  distance: 'upClose' | 'nearby' | 'farAway' | 'reserved';
  attackDirections: Direction[];
  /** Byte 19's un-interpreted 0/64/128/192 turn-undead modifier field. */
  turnUndeadModifierBits: 0 | 64 | 128 | 192;
}

/** Typed view over Give Treasure bytes 5–20 from GEOEVENT.TXT. Item IDs remain FRUA's numeric,
 * one-based source identities; resolving them against a particular ITEM.DAT catalogue is a
 * separate capability-gated step. Zero-valued item slots mean "None" and are omitted from
 * `items`, while the event's original slot bytes remain byte-for-byte available in `raw16`. */
export interface FruaGiveTreasure {
  /** Bytes 5–8 little-endian, excluding byte 8's high identification flag bit. */
  platinum: number;
  /** Bytes 9–10 little-endian. */
  gems: number;
  /** Bytes 11–12 little-endian. */
  jewelry: number;
  /** Non-zero Item#1..Item#8 values, in source order. */
  items: number[];
  /** Byte 8 high bit: every item granted by this event is already identified. */
  itemsIdentified: boolean;
}

/**
 * One decoded event-table slot. The common header (bytes 1–4) is fully typed; the 16
 * type-specific bytes (5–20) are kept whole in `raw16` (lossless) plus convenience
 * extractions for the fields `decode.ts`'s `FRUA_EVENT_FIELD_MAP` declares for this type —
 * string refs (resolved to text), chain-to-event# refs, and picture#. Fields not in that map
 * (monster stats, shop inventories, cost modifiers, guided-tour step
 * nibbles, …) are real GEOEVENT.TXT-documented data but aren't field-decoded yet; they're
 * still present, byte-for-byte, in `raw16`.
 */
export interface FruaEvent {
  /** 1-based position in the 100-slot event table (matches `FruaCell.eventSlot`). */
  slot: number;
  /** 0–38 raw type id (GEOEVENT.TXT table; 28/30/31 are unused "NULL" slots). */
  type: number;
  typeName: string;
  onceOnly: boolean;
  chainMode: 'always' | 'ifHappens' | 'ifDoesntHappen';
  condition: FruaCondition;
  /** Byte 4 — the whole event's unconditional "chain to" (distinct from any type-specific
   * per-branch chain fields surfaced in `chains`, e.g. Question-Yes/No's onYes/onNo). */
  chainToEvent: number;
  /** Bytes 5–20 (record offset 4..19), raw and complete — 16 bytes, always present. */
  raw16: number[];
  /** Resolved text for every type-specific string-ref field this type declares. */
  strings: Record<string, string>;
  /** Type-specific chain-to-event# fields. */
  chains: Record<string, number>;
  /** Picture# field, when this type declares one. */
  pictureId?: number;
  /** Present only for type 10; a typed view over the already-lossless `raw16` fields. */
  questionButton?: FruaQuestionButton;
  /** Present only for type 1; a typed view over the Combat-specific bytes. */
  combat?: FruaCombat;
  /** Present only for type 3; a typed view over the Give Treasure-specific bytes. */
  giveTreasure?: FruaGiveTreasure;
}

/** One decoded `GEOxxx.DAT` — a single dungeon or overland map plus its event table and
 * string pool. `cells` is `width*height` long, row-major (index = y*width+x) — only the
 * first `width*height` of the file's fixed 576-slot grid budget are meaningful. */
export interface FruaGeo {
  height: number;
  width: number;
  /** Up to 3 wall-texture-set slots (255,255,255 in overland modules). */
  wallSlots: [number, number, number];
  /** True when `wallSlots` reads as the overland sentinel (255,255,255). */
  isOverland: boolean;
  /** Always 8 slots (GEOENTRY.TXT); unused slots typically read (0,0,'north'). */
  entryPoints: FruaEntryPoint[];
  /** Always 8 slots, one per zone. */
  restEvents: FruaRestEvent[];
  /** Always 8 slots, one per zone. */
  stepEvents: FruaStepEvent[];
  moduleName: string;
  /** Always 8 slots, one per zone (max 15 chars each). */
  zoneNames: string[];
  cells: FruaCell[];
  /** Always 100 slots (type 0 = "None" for unused slots). */
  events: FruaEvent[];
  /** All 400 string-table slots, decoded (empty string for slots past `stringCount`). */
  strings: string[];
  /** "Number of individual text boxes" actually in use (offset 5798–5799). */
  stringCount: number;
}
