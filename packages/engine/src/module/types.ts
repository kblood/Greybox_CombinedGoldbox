/**
 * Authoring "module" data model (M5.S1) — ARCHITECTURE.md §2.5, ADR-0006.
 *
 * A `ModulePackage` is a superset of the loaded-game model: an authored module is meant to load
 * and play through the *same* engine path (world/`Explorer`/`EclVm`/ruleset) as an original
 * decoded game, so there is no separate authoring runtime. This first slice implements the
 * playable core only — maps, entrypoints, and a minimal event vocabulary that compiles to real
 * ECL bytecode. `graphicSets` (M5.S2b) and `databases` (M5.S5, monsters/items/spells/classes/
 * races — `module/database.ts`) have since landed; `assets`/`strings` (the rest of
 * ARCHITECTURE.md §2.5's full shape) are still deliberately not modelled — a hand-authored module
 * doesn't need them to load and play headlessly.
 */
import type { Direction, FrameSet, GameMap, MapEntry } from '../model/index.js';
import type { ModuleDatabase } from './database.js';

/**
 * The 35-type FRUA event vocabulary (M5.S4 "Event editor + scripting"; source list:
 * `hackdocs_extracted/GEOEVENT.TXT`, all 39 numbered slots minus the 3 NULL ones and "00 None").
 * Every type compiles to real ECL bytecode ({@link compileModuleEvent} in `eventCompiler.ts`) via
 * one of six reusable shapes:
 *  - **text** (19 types incl. `message`) — {@link MessageEventBody}: print, then optionally chain.
 *    Covers the 18 FRUA kinds (shops/temples/taverns/NPCs/etc.) that don't have a
 *    shop/NPC/quest data model yet (M5.S5); they get an honest text description + flow control
 *    rather than a simulated economy.
 *  - **give treasure** (1 type) — {@link GiveTreasureEventBody}: retain source-shaped currency,
 *    numeric item identities, identification state, and flow control without resolving an item
 *    catalogue or collapsing the reward into generic gold.
 *  - **choice** (11 types) — {@link ChoiceEventBody}: a prompt + 2-9 numbered options, chain to
 *    the one picked. Covers yes/no confirmations, ability/gold/password checks (simplified to an
 *    authored option list — no character-sheet access exists in the stateless block VM), and
 *    button/list menus.
 *  - **combat** (2 types) — {@link CombatEventBody}: run a fight, branch on victory/defeat/flee
 *    (the "combat-outcome trigger").
 *  - **utilities** (1 type) — {@link UtilitiesEventBody}: the variables/arithmetic/branching
 *    primitive.
 *  - **chain** (1 type) — {@link ChainEventBody}: pure unconditional flow control.
 */
export type ModuleEventType =
  // text shape (19)
  | 'message'
  | 'damage'
  | 'trainingHall'
  | 'tavern'
  | 'shop'
  | 'temple'
  | 'guidedTour'
  | 'addNpc'
  | 'npcSays'
  | 'sounds'
  | 'smallTown'
  | 'vault'
  | 'combatTreasure'
  | 'gainExperience'
  | 'passTime'
  | 'camp'
  | 'removeNpc'
  | 'tavernTales'
  | 'specialItems'
  // dedicated source-shaped reward (1)
  | 'giveTreasure'
  // choice shape (11)
  | 'stairs'
  | 'questionButton'
  | 'transferModule'
  | 'whoTries'
  | 'whoPays'
  | 'enterPassword'
  | 'questionList'
  | 'teleporter'
  | 'questStage'
  | 'questionYesNo'
  | 'encounter'
  // combat shape (2)
  | 'combat'
  | 'pickOneCombat'
  // utilities shape (1)
  | 'utilities'
  // chain shape (1)
  | 'chain';

/** A FRUA-style event, compiled to a real ECL bytecode block by {@link compileModuleEvent}. */
export interface ModuleEvent {
  /** Matches a `MapCell.event` id on the owning `ModuleMap`. */
  id: number;
  /** Consume this source event when it begins successfully. Later map or chain triggers are silent
   * until a saved {@link ModuleEventStateSnapshot} that does not contain it is restored. Omitted
   * means repeatable, preserving every schema-1 module written before event state existed. */
  onceOnly?: boolean;
  /** A source event deliberately retained as an explicit boundary although its behavior is not
   * implemented. `ModuleEventRuntime` halts before consuming or executing it; the semantic
   * `type` and source-local identity remain inspectable instead of being replaced by fake text. */
  unsupported?: {
    sourceFormat: string;
    sourceEventSlot: number;
    sourceType: number;
    sourceTypeName: string;
  };
  type: ModuleEventType;
  body: ModuleEventBody;
}

export type ModuleEventBody =
  | MessageEventBody
  | GiveTreasureEventBody
  | ChoiceEventBody
  | CombatEventBody
  | UtilitiesEventBody
  | ChainEventBody;

/** Give Treasure's source-shaped payload. `items` contains numeric, one-based identities in the
 * source module's own item vocabulary; hosts may resolve them only when they hold the matching
 * catalogue capability. No currency conversion, appraisal, or inventory mutation happens here. */
export interface GiveTreasureEventSource {
  format: 'frua';
  sourceEventSlot: number;
  itemDatSourceName: string;
  itemsDatSourceName: string;
}

export interface GiveTreasureEventBody {
  platinum: number;
  gems: number;
  jewelry: number;
  items: number[];
  itemsIdentified: boolean;
  /** When present, runtime emission requires a host authorization callback for these retained
   * catalogue capability names. Authored source-less rewards remain runnable. */
  source?: GiveTreasureEventSource;
  /** `ModuleEvent.id` to chain to after emitting the reward effect. */
  chainTo?: number;
}

/** Dedicated host effect emitted by {@link ModuleEventRuntime} exactly where a Give Treasure
 * event occurs in an automatically-followed chain. This is intentionally distinct from ECL's
 * generic `treasure` effect, whose final operand names an ITEM-area block rather than FRUA's up to
 * eight explicit item IDs. */
export interface GiveTreasureEventEffect {
  type: 'giveTreasure';
  /** Host-visible event id (therefore already map-renumbered when applicable). */
  eventId: number;
  platinum: number;
  gems: number;
  jewelry: number;
  items: number[];
  itemsIdentified: boolean;
}

/** Text shape body (19 types incl. `message`) — prints `text` (uppercase ASCII letters, space, and
 * 32–63 punctuation/digits only; the ECL 6-bit string packing has no lowercase — see
 * {@link encodeEclString}), then optionally chains to another event. */
export interface MessageEventBody {
  text: string;
  /** Further source text boxes shown by the same event, in source order. FRUA Text Statement
   * events can carry up to five independently-advanced boxes; keeping them separate produces one
   * PRINT effect per box instead of flattening distinct retail narration into an invented line. */
  additionalTexts?: string[];
  /** `ModuleEvent.id` to chain to (NEWECL) after printing; omit to just exit. */
  chainTo?: number;
}

/** One selectable branch of a {@link ChoiceEventBody}. */
export interface ChoiceOption {
  label: string;
  /** `ModuleEvent.id` to chain to if picked; omit to exit without chaining. */
  chainTo?: number;
  /** After this option's complete branch exits, return to the same question without moving the
   * party or re-triggering its map cell. This is FRUA Question-Button's per-option repeat flag. */
  repeatQuestion?: boolean;
}

/** Choice shape body (11 types) — a prompt plus 2-9 numbered options; the host answers with a
 * 1-based number (INPUT_NUMBER) and the matching option's `chainTo` fires. */
export interface ChoiceEventBody {
  prompt: string;
  options: ChoiceOption[];
}

/** Combat shape body (2 types: `combat`, `pickOneCombat`) — loads `monsters`, runs COMBAT, then
 * branches on the host-supplied outcome (see `EclVm.resume`'s `combatOutcome` parameter). */
export interface CombatEventBody {
  monsters: { monsterId: number; count: number; picBlockId: number }[];
  /** Friendly source monster groups. They are host/tactical metadata, not LOAD_MONSTER operands:
   * the shared ECL combat effect historically queues only the opposing roster. */
  friendlyMonsters?: { monsterId: number; count: number; picBlockId: number }[];
  /** Source narration printed immediately before the combat handoff. */
  intro?: string;
  /** Source-specific encounter flags retained losslessly enough for later tactical fidelity. */
  source?: {
    format: 'frua';
    pictureId: number;
    noArt: boolean;
    moraleModifier: number;
    surprise: 'none' | 'party' | 'monsters' | 'reserved';
    outdoors: boolean;
    autoApproach: boolean;
    partyNeverDies: boolean;
    noTreasure: boolean;
    magicWorks: boolean;
    distance: 'upClose' | 'nearby' | 'farAway' | 'reserved';
    attackDirections: Direction[];
    turnUndeadModifierBits: 0 | 64 | 128 | 192;
  };
  onVictory?: number;
  onDefeat?: number;
  onFlee?: number;
}

export type CompareOp = 'eq' | 'ne' | 'lt' | 'gt' | 'le' | 'ge';

/** Utilities shape body (1 type) — the variables/arithmetic/branching primitive (FRUA's
 * "Utilities" quest-math event): `store`/`add`/`subtract` a byte `value` (0-255) into a numbered
 * scripting `variable` (an author-chosen counter, analogous to FRUA's "Quest#"), then optionally
 * compare the new value against a constant and branch. The variable lives only for this one
 * compiled block — see `eventCompiler.ts`'s file header for the cross-event persistence boundary. */
export interface UtilitiesEventBody {
  op: 'store' | 'add' | 'subtract';
  variable: number;
  /** 0-255 — the ECL immediate-operand encoding this compiles to fits one byte. */
  value: number;
  compare?: { op: CompareOp; value: number; onTrue?: number; onFalse?: number };
}

/** Chain shape body (1 type) — pure unconditional flow control: chain to another event, or exit
 * if `chainTo` is omitted. */
export interface ChainEventBody {
  chainTo?: number;
}

/** One map. `cells`/`entries` are the exact `GameMap` shape — literal reuse, no conversion. */
export interface ModuleMap {
  name: string;
  width: number;
  height: number;
  cells: GameMap['cells'];
  entries: MapEntry[];
  events: ModuleEvent[];
}

/** Where a party may start. `mapIndex` indexes `ModulePackage.maps`; `entryId` matches a
 * `MapEntry.id` on that map. */
export interface EntryPoint {
  id: number;
  mapIndex: number;
  entryId: number;
}

/**
 * A source-import limitation retained inside the portable package. This is diagnostic provenance,
 * never executable authority: validators surface it as a warning so an imported package cannot
 * appear fully supported merely because the richer importer report was left behind in memory.
 */
export interface ModuleSourceWarning {
  /** Stable importer-owned code, for example `frua.unsupported_event`. */
  code: string;
  message: string;
  sourceFormat: string;
  /** Owning `ModulePackage.maps` index when the warning is map-local. */
  mapIndex?: number;
  sourceMap?: string;
  sourceEventId?: number;
}

export interface ModulePackage {
  schema: 1;
  id: string;
  title: string;
  /** A registered `RulesetPlugin` id (see `ruleset/index.ts` `defaultRulesets()`). */
  ruleset: string;
  maps: ModuleMap[];
  entrypoints: EntryPoint[];
  /** Decoded HLIB `.TLB` art sets (M5.S2b) — FRUA's `.TLB` container is the SAME HLIB DataLib
   * format `loaders/hlib.ts` already decodes for DQK (`UATFILES.TXT` lists identical filenames —
   * `BIGPIC.TLB`/`CPIC.TLB`/`ADDQ1.XMI`/`SFXDQ.VOC` — across both releases). Optional: a
   * hand-authored module, or an import run without art files, has none. */
  graphicSets?: FrameSet[];
  /** Authored monsters/items/spells/classes/races (M5.S5) — see `module/database.ts`. Optional: a
   * module that only uses text/choice/utilities/chain events has no need for one. */
  databases?: ModuleDatabase;
  /** Additive source-import limitations which must survive `.gbmod` serialization and validation. */
  sourceWarnings?: ModuleSourceWarning[];
}
