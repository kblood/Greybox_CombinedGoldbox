/**
 * ECL virtual machine — Krynn-Gen1 dialect (M2.S2).
 *
 * Executes a decompressed CoK ECL block: the event/dialogue/combat-trigger bytecode the
 * disassembler (M2.S1) decodes. Where the disassembler is a *linear* reader that stops at
 * the first EXIT, the VM is a *random-access* interpreter — it follows GOTO/GOSUB/RETURN
 * and the COMPARE→IF_* branch pattern, so it runs the real control flow of a block.
 *
 * Architecture: the VM is a synchronous **stepper**, pure except for its own state. It
 * fully implements the deterministic core (control flow, the variable/address memory
 * model, COMPARE/IF_*, SAVE, arithmetic/logic, seeded RANDOM, NEWECL chaining). Every
 * *host-facing* opcode (PRINT, PICTURE, INPUT_*, the menus, COMBAT, …) is surfaced as a
 * structured `EclEffect` instead of touching any UI: side-effect-only opcodes emit an
 * effect and continue; input/menu/combat opcodes emit an effect and PAUSE, returning a
 * status the host acts on before calling `resume(value)`. This keeps the engine package
 * DOM-free and the VM fully unit-testable, while a browser/Electron host renders effects
 * and feeds input back.
 *
 * Memory model (from research §3–4): operands are immediates (code 0x00), code addresses
 * (code 0x01, word ≥ 0x8000), or references into a flat sparse game-data memory keyed by
 * absolute address (code 0x01 word < 0x8000, plus the 0x03/0x7F variable forms). Code 0x02 is a
 * 16-bit immediate.
 * Unset addresses read as 0. `SAVE value, dest` writes; `COMPARE a, b` reads.
 *
 * Confidence: control flow + COMPARE/IF + SAVE + NEWECL are CONFIRMED against the block-018
 * worked example (research §4.2). Arithmetic/logic follows the COAB operand convention:
 * op1=arg0, op2=arg1, dest=arg2, with SUBTRACT as `op2 - op1`. ON_GOTO/ON_GOSUB carry an
 * inline jump table and are decoded through dialect-specific operand frames.
 */
import { ECL_GEN1, decodeInstructionAt, type EclDialect, type EclInstruction, type EclOpp } from './disassemble.js';
import { newClock, stepGameTime, type ClockSlots } from '../world/gameClock.js';

/**
 * One monster group queued for the next encounter by a LOAD_MONSTER (0x0B) opcode. The host maps
 * `monsterId` to a `MON{n}CHA.DAX` block (the file chosen by the preceding LOAD_FILES), decodes it,
 * and spawns `count` instances. Mirrors COAB `CMD_LoadMonster` (operands: id, copies, pic block).
 */
export interface EncounterMonster {
  /** Monster definition id = block id within the loaded MON*CHA file. */
  monsterId: number;
  /** How many of this monster to spawn (≥ 1). */
  count: number;
  /** Combat-picture (CPIC) block id for this monster's art. */
  picBlockId: number;
}

/** Encounter approach/sprite state configured by SETUP_MONSTER (0x0C). */
export interface EncounterSetup {
  /** Sprite block id shown while the encounter approaches. */
  spriteId: number;
  /** Maximum allowed encounter distance from the script. */
  maxDistance: number;
  /** Picture block id for the encounter illustration. */
  picId: number;
  /** Current encounter distance after clamping/decrementing. */
  distance: number;
  /**
   * Fourth SETUP_MONSTER operand — present only under the 4-operand short-dialect frame
   * (DoK/Treasures/PoD, `ECL_GEN1_SHORT.wordSetOverrides[0x0c] = 4`; see that dialect's doc
   * comment). DoK's own GAME.OVR handler (file offset 0xBAC) fetches it into an engine global
   * ([0xc4cc]) whose downstream consumer is unlocated, so the VM records the value verbatim and
   * applies no behavior to it — an honest "captured, semantics unknown" field, not a guess.
   */
  extra?: number;
}

/** Result of SURPRISE (0x23), including the raw COAB result byte written to memory 0x02CB. */
export interface EncounterSurprise {
  /** Raw operand values after ECL rvalue resolution and byte clamp. */
  args: readonly [number, number, number, number];
  /** Party surprise check threshold computed as signed byte `(arg4 + 2 - arg1)`. */
  partyThreshold: number;
  /** Monster surprise check threshold computed as signed byte `(arg2 + 2 - arg3)`. */
  monsterThreshold: number;
  /** The party d6 roll consumed by SURPRISE. */
  partyRoll: number;
  /** The monster d6 roll consumed by SURPRISE. */
  monsterRoll: number;
  /** Value written to memory 0x02CB. */
  result: number;
}

interface EncounterMenuState extends EncounterSetup {
  destAddr: number;
  actionValues: readonly number[];
  texts: readonly string[];
  fleeThreshold: number;
  monsterFleeThreshold: number;
  minMovement: number;
  maxMovement: number;
  inDungeon: boolean;
  ins: EclInstruction;
}

/**
 * How a COMBAT pause was resolved — the host supplies this to `resume()` so scripted code that
 * follows COMBAT can branch on it (M5.S4's "combat-outcome trigger"). The VM itself never decides
 * an outcome (fights run entirely on the host); this only carries the host's verdict into the
 * compare-flags register the same way PARTYSTRENGTH/COMPARE_AND already do, so ordinary
 * IF_EQ/IF_LT/IF_GT following COMBAT read it like any other comparison.
 */
export type EclCombatOutcome = 'victory' | 'defeat' | 'flee';

export type EclScriptEffectKind =
  | 'unknown1f'
  | 'eclClock'
  /**
   * GEN2_EXT_41 (DQK Gen2 only, opcode 0x41): Gen2's single opcode-table extension beyond
   * Gen1's 0x00-0x40 ceiling. See the `case 0x41` comment in `exec()` for the grounded-but-
   * unconfirmed semantics hypothesis; this kind exists so a host CAN act on it distinctly from
   * a truly-unknown opcode, without the VM inventing behavior beyond what the live trace proved.
   */
  | 'gen2Ext41';

export type EclCallRoutine =
  | 'redrawDungeonView'
  | 'setupDuelAttack'
  | 'setupDuelDefend'
  | 'playSoundForContext'
  | 'movePositionForward'
  | 'refreshOutdoorWall'
  | 'advanceAnimatedPicture';

export interface EclTreasureCoins {
  copper: number;
  electrum: number;
  silver: number;
  gold: number;
  platinum: number;
  gems: number;
  jewelry: number;
}

export type EclSaveVerseType =
  | 'poison'
  | 'petrification'
  | 'rodStaffWand'
  | 'breathWeapon'
  | 'spell'
  | 'unknown';

export interface EclDamageDice {
  count: number;
  sides: number;
  bonus: number;
}

export type EclDamagePolicy =
  | {
      mode: 'attackRoll';
      target: 'random';
      attempts: number;
      toHitBonus: number;
    }
  | {
      mode: 'automatic';
      target: 'party' | 'selected';
      reason: 'noSaveFlag' | 'selectedNoSave';
    }
  | {
      mode: 'savingThrow';
      target: 'party' | 'selected' | 'random';
      saveBonus: number;
      saveType: EclSaveVerseType;
      saveTypeId: number;
      damageOnSave: 'none' | 'full';
    };

/** Structured side effect emitted to the host (never rendered by the VM itself). */
export type EclEffect =
  | { type: 'print'; stringRef?: number; text?: string; clear: boolean; newline: boolean }
  | { type: 'picture'; id: number }
  | { type: 'clearBox' }
  | { type: 'delay' }
  | { type: 'spriteOff' }
  /** COMBAT: the host runs the fight against the queued `monsters`, then `resume()`s. */
  | { type: 'combat'; monsters: EncounterMonster[] }
  /** SETUP_MONSTER/APPROACH: current encounter approach art/distance state. */
  | { type: 'encounterSetup'; setup: EncounterSetup; ins: EclInstruction }
  /** SURPRISE: computed surprise thresholds/rolls and the raw memory result at 0x02CB. */
  | { type: 'encounterSurprise'; surprise: EncounterSurprise; ins: EclInstruction }
  /**
   * PARTYSTRENGTH (0x1d): the engine computed the party's strength and compared it to `threshold`,
   * leaving the result in the comparison register for the *following* `IF_*`. `strength` is the
   * host-supplied metric (default 0); see {@link EclVmOptions.partyStrength}.
   */
  | { type: 'partyStrength'; strength: number; threshold: number; ins: EclInstruction }
  | { type: 'menu'; style: 'vertical' | 'horizontal' | 'encounter' | 'parlay' | 'yesno'; items: string[]; prompt?: string; destAddr?: number; ins: EclInstruction }
  | { type: 'input'; mode: 'number' | 'string'; destAddr: number; maxLength?: number; ins: EclInstruction }
  /**
   * WHO: ask the host to choose one active party member. The opcode's one operand is the
   * on-screen prompt (an inline ECL string), not a destination address. On resume the supplied
   * zero-based party index becomes the VM's selected-player context for FIND_SPECIAL and the
   * selected-player pseudo-fields.
   */
  | { type: 'who'; prompt: string; ins: EclInstruction }
  | { type: 'chain'; blockId: number }
  /** LOAD_FILES: load the dungeon GEO map (operand 0) — the host calls decodeGeoBlock. */
  | { type: 'loadFiles'; geoBlockId: number; operands: number[] }
  /**
   * TREASURE (0x27): two incompatible operand frames, discriminated by `frame` (see `case 0x27`
   * in `EclVm.exec()`):
   *  - `'coins7Item'` (the Gen1 base `wordSet: 8` reading): COAB writes seven coin slots to
   *    `pooled_money`, then either loads an ITEM{area}.DAX block (`itemBlockId < 0x80`), rolls
   *    `itemBlockId - 0x80` random items, or adds no items (`0xff`). `coins`/`itemBlockId`/
   *    `itemSource`/`randomItemCount` are meaningful; `partyGold`/`itemTail` are absent.
   *  - `'gold3Tail'` (the `wordSet: 4, countAt: 3` reading DQK's `ECL_GEN2` ships and Pools'/
   *    Treasures' own handlers measure but do not yet dialect-ship): `partyGold` holds the three
   *    `rvalue`-accumulated 32-bit party-gold fields (operands 0-2; which COIN TYPE each is is
   *    unproven from the binary), and `itemTail` holds the count-driven item ids (the `0xff`
   *    "no item" sentinel already filtered out). `coins` is all-zero and `itemBlockId`/
   *    `itemSource`/`randomItemCount` are placeholders in this frame — real consumers must switch
   *    on `frame`, not read `coins`/`itemBlockId` unconditionally.
   * The host owns actual inventory/loot pickup state either way.
   */
  | {
      type: 'treasure';
      frame: 'coins7Item' | 'gold3Tail';
      coins: EclTreasureCoins;
      itemBlockId: number;
      itemSource: 'itemBlock' | 'random' | 'none';
      randomItemCount: number;
      /** Only set when `frame === 'gold3Tail'`. */
      partyGold?: [number, number, number];
      /** Only set when `frame === 'gold3Tail'`. */
      itemTail?: number[];
      operands: number[];
      ins: EclInstruction;
    }
  /**
   * ROB (0x28): COAB applies money scaling and item-removal chance to either the selected player
   * or the whole party. The VM decodes the policy; a host with party inventory applies it.
   */
  | {
      type: 'rob';
      scope: 'selected' | 'party';
      moneyLossPercent: number;
      moneyKeepPercent: number;
      itemRobChance: number;
      operands: number[];
      ins: EclInstruction;
    }
  /**
   * DESTROY_ITEMS (0x40): remove every active-party inventory entry whose runtime `Item.type`
   * matches `itemTypeId`. The VM also updates its private FIND_ITEM set immediately; hosts that
   * own the actual party inventory consume this effect to keep the durable inventory in sync.
   */
  | { type: 'destroyItems'; itemTypeId: number; ins: EclInstruction }
  /**
   * DAMAGE (0x2E): COAB rolls `count` d `sides` + `bonus`, then applies it to random/selected/all
   * party members through either trap-style attack rolls or saving throws. The VM decodes that policy;
   * hosts that own party HP, saves, AC, death, and UI messages apply the actual random outcomes.
   */
  | {
      type: 'damage';
      dice: EclDamageDice;
      policy: EclDamagePolicy;
      operands: number[];
      ins: EclInstruction;
    }
  /**
   * LOAD_PIECES: load the WALLDEF symbol sets. `setBlockIds` is the **resolved** per-set
   * list the host feeds straight to `loadDungeonWalls` (0xFF=Reset/empty, 0x7F on set 1 =
   * load WALLDEF block 0), after applying the COAB `CMD_LoadFiles` dispatch (research §3.3):
   * the 0x7F special, and the **two-set area variant** (when both area flags are set, set 2
   * is skipped). `operands` is the raw ECL operand triple; `twoSet` records which branch ran.
   */
  | { type: 'loadPieces'; setBlockIds: [number, number, number]; operands: [number, number, number]; twoSet: boolean }
  /**
   * Opcode 0x37 as a two-operand active-party name lookup: a request from the script, not the
   * shared `LOAD_PIECES`. Source-pinned TWICE, from two titles' own binaries: Pools of Darkness
   * at `GAME.OVR+0x1eca`, and Treasures of the Savage Frontier at its own `GAME.OVR` file
   * `0x2577` (dispatched by a straight-line `cmp al,0x37` / `call 0x2577` pair at `0x33c1`, with
   * no shared target with either neighbour). The host owns the party lookup; when supplied, the
   * VM writes retail's exact 0xFF-not-found / ordinal-plus-inactive-bit result before continuing
   * the same script.
   */
  | { type: 'findCharacter'; name: string; destAddr: number; result?: number; ins: EclInstruction }
  /** Pools 0x41: retail handler distributes operand-2 × 100 XP to party/current character. */
  | {
      type: 'awardExperience';
      scope: 'party' | 'selected';
      hundreds: number;
      amount: number;
      selectedPartyIndex?: number;
      ins: EclInstruction;
    }
  /**
   * PROGRAM (0x38): host-engine routine dispatch. CoK uses PROGRAM #0 for StartGameMenu; the
   * clean-room host implements that flow itself and deliberately does not call the DOS copy
   * protection routine documented in `cok-copy-protection.md`.
   */
  | { type: 'program'; programId: number; ins: EclInstruction }
  /**
   * ECL_CLOCK (0x34): COAB `CMD_EclClock` reads `timeStep,timeSlot` and calls
   * `step_game_time(timeSlot, timeStep)`. The VM advances its internal pure clock
   * and reports the delta so hosts can age parties / expire affects if they own that state.
   */
  | {
      type: 'eclClock';
      timeStep: number;
      timeSlot: number;
      before: ClockSlots;
      after: ClockSlots;
      elapsedMinutes: number;
      yearRollovers: number;
      ins: EclInstruction;
    }
  /**
   * CALL (0x2D): host-engine routine dispatch. COAB Gen1 computes `routineId` from the
   * raw operand word (`operand - 0x7fff`), not from an rvalue/memory lookup. DQK Gen2 also uses
   * low raw words (`0x0001`/`0x0002`) as direct CALL ids in real `ECL.GLB`. `routine` is only
   * populated for corpus-known host routines; unknown ids still preserve the raw operand and id.
   */
  | {
      type: 'call';
      routineId: number;
      routine?: EclCallRoutine;
      operand: number;
      ins: EclInstruction;
      /**
       * Immutable-by-convention snapshot of sparse ECL memory at the instant the native host
       * routine is dispatched. Host calls can read and mutate engine globals between ECL
       * instructions (the attract demos' viewport redraw/move helpers read X/Y/facing), so the
       * final VM memory alone cannot reconstruct the temporal presentation sequence.
       */
      memory: readonly (readonly [address: number, value: number])[];
    }
  /**
   * Fallback host-facing effects for dispatches the VM cannot safely own yet.
   * TREASURE/ROB/DAMAGE/CALL/ECL_CLOCK cases have typed events above; this is
   * reserved for UNKNOWN_1F and invalid clock slots that still should not be
   * lost as generic unhandled opcodes.
   */
  | { type: 'scriptEffect'; kind: EclScriptEffectKind; opcode: number; operands: number[]; ins: EclInstruction }
  /**
   * ADD_NPC (0x36): recruit a named companion into the party (COAB `CMD_AddNPC`, `ovr003.cs:1769`).
   * `npcId` is the `MON{n}CHA.DAX` block id to load via the SAME monster-record decode this engine
   * already uses for combat (`load_mob` in the original engine); `morale` is the operand COAB
   * **overwrites** the record's own stored morale byte with (`control_morale = (operand>>1)+0x80`,
   * which round-trips through this engine's own `decodeMorale` back to exactly `operand`) — the host
   * must apply it, not trust the record's stored value.
   */
  | { type: 'addNpc'; npcId: number; morale: number }
  /**
   * SAVE …, 0x7F12 (ADR-0009): CoAB's `gbl.game_area` register (`0x7F12-0x7C00=0x312` →
   * `alter_character switch_var 0x312` → `set_game_area`, `ovr008.cs:654-656`). The VM stays
   * file-ignorant — it only reports "the script asked to switch to game_area N"; the host
   * resolves what that means (which ECL/GEO/WALLDEF/8X8D/MON/ITEM archive set to use next),
   * the same pattern as `loadFiles`/`loadPieces`.
   */
  | { type: 'setGameArea'; gameArea: number }
  /** Any opcode with no state-changing implementation yet (run-to-completion, no crash). */
  | { type: 'unhandled'; mnemonic: string; opcode: number; ins: EclInstruction };

/** The typed host-dispatch effect emitted by the ECL `CALL` opcode. */
export type EclCallEffect = Extract<EclEffect, { type: 'call' }>;

/**
 * Optional synchronous result from a native CALL host bridge.
 *
 * Most routines only mutate host memory and existing `void` callbacks remain valid. A routine
 * that returns a value consumed immediately by ECL `IF_*` may instead provide the two ECL-word
 * values the native handler compared; the VM refreshes all six comparison flags before advancing
 * to the following instruction. Gateway's raw CALL 0x080C menu compares choice index 0/1 with 1.
 */
export interface EclCallHostResult {
  comparison?: { left: number; right: number };
}

/** Why `run()`/`resume()` returned control to the host. */
export type EclStatus =
  /** Hit EXIT (or RETURN with an empty call stack). Execution finished. */
  | 'exited'
  /** NEWECL: the host should load `chainBlockId` and start a fresh VM on it. */
  | 'chain'
  /** An input, menu, or WHO opcode needs a value; call `resume(value)`. */
  | 'awaiting-input'
  /** COMBAT: the host should run combat, then `resume()` to continue the script. */
  | 'combat'
  /** Stopped defensively (bad opcode, unsupported ON_GOTO, or step budget). */
  | 'halted';

export interface EclRunResult {
  status: EclStatus;
  /** Effects emitted since the previous return (cleared each `run`/`resume`). */
  effects: EclEffect[];
  /** Present when `status === 'chain'`. */
  chainBlockId?: number;
  /** Present when `status === 'halted'`. */
  haltReason?: string;
  /** The instruction that caused a pause/halt (input/menu/combat/halt), if any. */
  at?: EclInstruction;
}

/** Result of a single {@link EclVm.step} — the instruction that ran and the resulting status. */
export interface EclStepResult {
  /** The instruction executed this step (null once the VM is already finished). */
  instruction: EclInstruction | null;
  /** `'running'` when the VM merely advanced; otherwise the yield status (exited/chain/…/halted). */
  status: EclStatus | 'running';
  /** True once execution has finished (EXIT / out-of-bounds / halt). */
  done: boolean;
  /** Present when `status === 'halted'`. */
  haltReason?: string;
  /** Present when `status === 'chain'` (NEWECL target). */
  chainBlockId?: number;
  /** Effects emitted by this one instruction. */
  effects: EclEffect[];
}

export interface EclVmOptions {
  /** Pre-seed game-data memory (absolute address → value). */
  memory?: Map<number, number>;
  /**
   * Mutable pending encounter roster shared by the host across ECL invocations.
   *
   * Most scripts queue `LOAD_MONSTER` and hit `COMBAT` in one VM run, so the default private roster
   * is sufficient. Some DQK Gen2 SearchLocation paths load monster groups in one per-cell invocation
   * and fight them in a later invocation; pass the same array to each VM to model that original
   * global encounter state. `CLEAR_MONSTERS` and `COMBAT` clear the shared array.
   */
  encounterRoster?: EncounterMonster[];
  /** Deterministic PRNG seed for RANDOM (default 0x1234). */
  seed?: number;
  /**
   * Optional title-host bridge for RANDOM (0x08) variants whose operand is an inclusive maximum.
   *
   * The clean-room VM default remains `rand % max(1, operand)` for backward compatibility. Gateway
   * to the Savage Frontier's own GAME.OVR handler is byte-proven to increment operands below 255
   * before calling its random helper, so `RANDOM #N` there yields `0..N` only for `N < 255`. A
   * Gateway host can supply that exact range contract here without silently changing every existing
   * ECL route or claiming that the clean-room LCG is the retail PRNG. Operand 255 is rejected on this
   * bridge because its native domain is not established; returned values are otherwise validated.
   */
  rollRandomInclusive?: (maximumInclusive: number) => number;
  /** Safety cap on executed instructions per run/resume (default 100000). */
  stepBudget?: number;
  /**
   * Synchronous bridge for native host routines invoked by ECL `CALL` (0x2D).
   *
   * The callback runs after the immutable-by-convention `effect.memory` snapshot is captured but
   * before the VM advances to the following ECL instruction. It receives the VM's live shared
   * memory map so a host routine can update engine-owned registers that the script reads
   * immediately afterward. Gateway ECL5#19 relies on exactly this ordering: its
   * `movePositionForward` call changes the party pose/cell descriptor, then the same VM invocation
   * redispatches `search_location` for the destination cell.
   */
  onCall?: (effect: EclCallEffect, memory: Map<number, number>) => void | EclCallHostResult;
  /**
   * Synchronous Pools POOLS_FIND_CHARACTER bridge. `null` means the named party-controlled record
   * was not found; `undefined` leaves the destination untouched when a host has no roster model.
   * The callback must only match party-controlled records and returns the zero-based ordinal in the
   * full ordered TeamList. Retail sets bit 7 when that matched record is not in combat.
   */
  findCharacter?: (name: string) => { index: number; inCombat: boolean } | null | undefined;
  /** Entry byte offset (default `dialect.headerLen` = vaddr 0x8014, the main subroutine). */
  entry?: number;
  /**
   * Block-header dialect (Gen1 CoK/DoK vs Gen2 DQK). Drives the entry offset, the virtual base
   * used to resolve GOTO/GOSUB targets, and the in-code lower bound. Defaults to {@link ECL_GEN1}.
   */
  dialect?: EclDialect;
  /**
   * Party-strength metric fed to the PARTYSTRENGTH (0x1d) opcode's comparison. The exact in-engine
   * formula and the operand's units are **unrecoverable from disk** (the opcode is undocumented and
   * its sole operand decodes as an opaque `c12:128`-style word), so the host supplies whatever scalar
   * it uses to gauge party power; the opcode just compares it against the operand value for the
   * following `IF_*`. Defaults to **0** (treat the party as minimum strength), which is deterministic
   * and conservatively *fails* `IF_GE threshold` strength gates rather than spuriously triggering them.
   */
  partyStrength?: number;
  /**
   * Host-computed current encounter distance used by SETUP_MONSTER (0x0C).
   * COAB derives this from map position/direction; the VM clamps this value to
   * the script's max-distance operand. Defaults to 0 for headless runs.
   */
  encounterDistance?: number;
  /**
   * Whether encounter menus are running in a dungeon. COAB offers ADVANCE while a dungeon
   * encounter is still distant, but PARLAY at distance 0 or outdoors. Defaults to true,
   * matching the first-person dungeon boot path.
   */
  inDungeon?: boolean;
  /**
   * Host roster signal used by PARTY_SURPRISE (0x22). COAB `CMD_PartySurprise`
   * writes 1 to its first destination when the party contains a ranger or
   * cleric/ranger multiclass, and always writes 0 to its second destination.
   * Defaults to false because a headless VM run has no loaded party roster.
   */
  partyHasRanger?: boolean;
  /**
   * Initial selected party-member index, used with {@link partyMemberAffects}.
   * LOAD_CHARACTER (0x0A) updates this index when its selected party member
   * exists. Defaults to unset, in which case FIND_SPECIAL uses
   * `selectedPlayerAffects` as a static selected-player signal.
   */
  selectedPartyIndex?: number;
  /**
   * Per-party-member affect ids used by LOAD_CHARACTER followed by
   * FIND_SPECIAL. COAB's LOAD_CHARACTER masks off bit 7 and selects a party
   * entry when the resulting index is within the active TeamList; missing
   * entries are treated as no affects.
   */
  partyMemberAffects?: Iterable<Iterable<number>>;
  /**
   * Per-party-member "in combat" flags for selected-player pseudo-field 0x7D00.
   * Gold Box ECL addresses in 0x7C00..0x7FFF are selected-player fields, not
   * ordinary script memory; 0x7D00 reads 1 for an active selected player, 0x80
   * for a selected player not in combat, and 0 when LOAD_CHARACTER missed.
   */
  partyMemberInCombat?: Iterable<boolean>;
  /**
   * Affect ids present on any party member, used by CHECKPARTY's party-affect
   * query. Defaults to empty for headless/native-style runs.
   */
  partyAffects?: Iterable<number>;
  /**
   * Party movement values used by CHECKPARTY's movement min/max/average query.
   * Defaults to empty, which writes deterministic zero statistics.
   */
  partyMovements?: Iterable<number>;
  /**
   * Per-party-member thief skill byte arrays used by CHECKPARTY's eight thief
   * skill min/max/average queries. Missing per-member entries read as 0.
   */
  partyThiefSkills?: Iterable<Iterable<number>>;
  /**
   * Item-type ids currently carried by any party member, used by FIND_ITEM
   * (0x32). Defaults to empty for headless/native-style runs with no loaded
   * inventory, which makes the opcode set IF_NE.
   */
  partyItemTypes?: Iterable<number>;
  /**
   * Affect ids on the selected character, used by FIND_SPECIAL (0x3F).
   * Defaults to empty when no selected-player model is available.
   */
  selectedPlayerAffects?: Iterable<number>;
  /**
   * Per-party-member spell id lists used by SPELL (0x3B). COAB scans party
   * members in order, then scans each member's spell list in order. On a hit,
   * it writes the 1-based spell-list slot and 0-based party index; on a miss,
   * it writes slot 0xFF and the last scanned party index (0xFF for an empty
   * headless roster).
   */
  partySpellLists?: Iterable<Iterable<number>>;
  /**
   * Initial seven-slot game clock for ECL_CLOCK (0x34). Defaults to the campaign
   * epoch (`newClock()`); hosts that persist a clock can pass their current slots
   * and read back {@link EclVm.gameClock}.
   */
  clock?: ClockSlots;
}

const EXIT = 0x00;

/** LOAD_PIECES operand sentinels (research §3.3). */
const PIECES_RESET = 0xff; // "leave this set empty"
const PIECES_DEFAULT_SET1 = 0x7f; // var_3 == 0x7F → LoadWalldef(1, block 0)

/**
 * CoK area-struct flags COAB calls `field_1CE` / `field_1D0` — their absolute addresses in
 * the running game-data segment (verified from ECL1 block 34's `SAVE …,1` writes). When both
 * are non-zero the dungeon is a **two-set area**: LOAD_PIECES loads only sets 1 and 3.
 */
const AREA_FIELD_1CE = 0x4be7;
const AREA_FIELD_1D0 = 0x4be8;
const SURPRISE_RESULT_ADDR = 0x02cb;
// COAB Area2.field_67E aliases ECL word 0x7F3F through vm_GetMemoryValue's
// `(word * 2 + 0x800) & 0xFFFF` mapping. CMD_AddSubDivMulti writes DIV's remainder here;
// Gateway ECL5#19 immediately reads it back to normalize a temporary facing rotation. This is the
// Gen1 default only — Gen2 (DQK) uses a different address; see EclDialect.divRemainderAddr's doc
// comment for the byte evidence on both sides.
const DIV_REMAINDER_ADDR_GEN1_DEFAULT = 0x7f3f;

type PendingValue = { kind: 'value'; destAddr: number; valueMap?: readonly number[] };
type PendingString = { kind: 'string'; destAddr: number; maxLength: number };
type PendingEncounterMenu = { kind: 'encounterMenu'; state: EncounterMenuState };
/**
 * Short-dialect PARTY_SURPRISE (0x22): a YES/NO prompt whose answer lands in the compare flags,
 * not in memory — `resume(0)` = first item (YES) sets only EQ, any other value sets only NE
 * (see the case 0x22 comment for the DoK GAME.OVR proof).
 */
type PendingYesNo = { kind: 'yesNo' };
type PendingWho = { kind: 'who' };
type PendingInput = PendingValue | PendingString | PendingEncounterMenu | PendingYesNo | PendingWho;

/** Player answer accepted by ECL input opcodes: menus/numbers use a word, INPUT_STRING uses text. */
export type EclInputValue = number | string;

/** Tiny deterministic LCG so RANDOM is reproducible in tests/headless. */
function nextRand(state: number): { value: number; state: number } {
  const s = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { value: s, state: s };
}

function signedByte(v: number): number {
  const b = v & 0xff;
  return b >= 0x80 ? b - 0x100 : b;
}

function summarizeByteValues(values: readonly number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  let min = 0xff;
  let max = 0;
  let sum = 0;
  for (const value of values) {
    const b = value & 0xff;
    if (b < min) min = b;
    if (b > max) max = b;
    sum += b;
  }
  return { min, max, avg: Math.floor(sum / values.length) & 0xff };
}

const ECL_CALL_ROUTINES: Partial<Record<number, EclCallRoutine>> = {
  // 0x2DCB and 0x2E10 are sibling-title encoded operands for the same dungeon redraw host entry.
  0xadcc: 'redrawDungeonView',
  0xae11: 'redrawDungeonView',
  0x0001: 'setupDuelAttack',
  0x0002: 'setupDuelDefend',
  0x3201: 'playSoundForContext',
  0x401f: 'movePositionForward',
  0x4019: 'refreshOutdoorWall',
  0xe804: 'advanceAnimatedPicture',
};

function eclCallRoutineId(operandWord: number, dialect: EclDialect): number {
  if (!dialect.hasMagic && operandWord < 0x8000) return operandWord & 0xffff;
  return (operandWord - 0x7fff) & 0xffff;
}

function treasureCoins(values: readonly number[]): EclTreasureCoins {
  return {
    copper: values[0] ?? 0,
    electrum: values[1] ?? 0,
    silver: values[2] ?? 0,
    gold: values[3] ?? 0,
    platinum: values[4] ?? 0,
    gems: values[5] ?? 0,
    jewelry: values[6] ?? 0,
  };
}

function treasureItemSource(itemBlockId: number): { itemSource: 'itemBlock' | 'random' | 'none'; randomItemCount: number } {
  if (itemBlockId < 0x80) return { itemSource: 'itemBlock', randomItemCount: 0 };
  if (itemBlockId === 0xff) return { itemSource: 'none', randomItemCount: 0 };
  return { itemSource: 'random', randomItemCount: itemBlockId - 0x80 };
}

const SAVE_VERSE_TYPES: readonly EclSaveVerseType[] = ['poison', 'petrification', 'rodStaffWand', 'breathWeapon', 'spell'];

function saveVerseType(id: number): EclSaveVerseType {
  return SAVE_VERSE_TYPES[id] ?? 'unknown';
}

function damagePolicy(controlByte: number, targetByte: number): EclDamagePolicy {
  if ((controlByte & 0x80) === 0) {
    return {
      mode: 'attackRoll',
      target: 'random',
      attempts: controlByte,
      toHitBonus: targetByte,
    };
  }

  if ((controlByte & 0x40) !== 0) {
    if ((controlByte & 0x20) !== 0) {
      return { mode: 'automatic', target: 'party', reason: 'noSaveFlag' };
    }
    const saveTypeId = targetByte & 0x07;
    return {
      mode: 'savingThrow',
      target: 'party',
      saveBonus: controlByte & 0x1f,
      saveType: saveVerseType(saveTypeId),
      saveTypeId,
      damageOnSave: (controlByte & 0x10) !== 0 ? 'full' : 'none',
    };
  }

  if ((targetByte & 0x80) !== 0) {
    const selectedSaveType = targetByte & 0x07;
    if (selectedSaveType === 0) {
      return { mode: 'automatic', target: 'selected', reason: 'selectedNoSave' };
    }
    const saveTypeId = selectedSaveType - 1;
    return {
      mode: 'savingThrow',
      target: 'selected',
      saveBonus: controlByte & 0x1f,
      saveType: saveVerseType(saveTypeId),
      saveTypeId,
      damageOnSave: (controlByte & 0x10) !== 0 ? 'full' : 'none',
    };
  }

  const saveTypeId = targetByte & 0x07;
  return {
    mode: 'savingThrow',
    target: 'random',
    saveBonus: controlByte & 0x1f,
    saveType: saveVerseType(saveTypeId),
    saveTypeId,
    damageOnSave: (controlByte & 0x10) !== 0 ? 'full' : 'none',
  };
}

/**
 * The mnemonics that select opcode 0x37's two-operand party-name-lookup behaviour instead of the
 * inherited three-operand `LOAD_PIECES`. Each is carried by exactly one dialect and each was read
 * from that title's own `GAME.OVR` handler; the VM keys on the mnemonic rather than on the dialect
 * so that a dialect never has to adopt another title's label to get the right behaviour.
 */
export const FIND_CHARACTER_MNEMONICS: ReadonlySet<string> = new Set(['POOLS_FIND_CHARACTER', 'TREASURES_FIND_CHARACTER']);

export class EclVm {
  private readonly raw: Uint8Array;
  readonly memory: Map<number, number>;
  /** Runtime string cells (`0x81` operands), distinct from ordinary numeric VM words. */
  private readonly strings = new Map<number, string>();
  private pc: number;
  private callStack: number[] = [];
  /**
   * Comparison result, modelled as COAB's six-slot `compare_flags[]` array (one boolean per
   * IF_* opcode: index 0 ==, 1 !=, 2 <, 3 >, 4 <=, 5 >=). `CMD_Compare`/`PARTYSTRENGTH` fill
   * all six from a value pair; `CMD_CompareAnd` (0x14) sets ONLY slot 0 (==) when both of its
   * operand pairs are equal, else ONLY slot 1 (!=) — so a following IF_LE/IF_GE does NOT
   * spuriously pass (the bug a single {left,right} register would have). Verified against
   * COAB `CMD_CompareAnd` (sub_26B0C) + `CMD_If`, the same-generation Gold Box engine.
   */
  private cmpFlags: boolean[] = [false, false, false, false, false, false];
  private rng: number;
  /** Optional title-host inclusive RANDOM bridge; see {@link EclVmOptions.rollRandomInclusive}. */
  private readonly rollRandomInclusive?: (maximumInclusive: number) => number;
  private readonly stepBudget: number;
  /** Optional synchronous native-host bridge for CALL (0x2D). */
  private readonly onCall?: (effect: EclCallEffect, memory: Map<number, number>) => void | EclCallHostResult;
  private readonly findCharacter?: EclVmOptions['findCharacter'];
  private effects: EclEffect[] = [];
  /** Set while paused on an input/menu/who opcode awaiting `resume(value)`. */
  private pending: PendingInput | null = null;
  /** Set right after a COMBAT pause (which — unlike input/menu/who — writes no `pending` slot of
   * its own); tells `resume()` to apply an `EclCombatOutcome` to the compare flags. */
  private lastPauseWasCombat = false;
  private finished = false;
  /** Monster groups queued by LOAD_MONSTER since the last CLEAR_MONSTERS / combat. */
  private readonly encounter: EncounterMonster[];
  /** Current encounter approach state from SETUP_MONSTER/APPROACH. */
  private encounterSetup: EncounterSetup | null = null;
  /** Header dialect (entry/vbase/header-length): Gen1 CoK/DoK or Gen2 DQK. */
  private readonly dialect: EclDialect;
  /** Host-supplied party-strength metric for PARTYSTRENGTH (0x1d); see {@link EclVmOptions.partyStrength}. */
  private readonly partyStrength: number;
  /** Host-computed encounter distance seed for SETUP_MONSTER. */
  private readonly encounterDistance: number;
  /** Host flag for encounter-menu outdoor vs dungeon choice layout. */
  private readonly inDungeon: boolean;
  /** Host roster signal for PARTY_SURPRISE (0x22); see {@link EclVmOptions.partyHasRanger}. */
  private readonly partyHasRanger: boolean;
  /** Selected party-member index set by LOAD_CHARACTER (0x0A), when per-member host data exists. */
  private selectedPartyIndex: number | null;
  /** Per-party-member affect sets used by LOAD_CHARACTER + FIND_SPECIAL. */
  private readonly partyMemberAffects: readonly ReadonlySet<number>[];
  /** Per-party-member selected-player in-combat flags used by rvalue(0x7D00). */
  private readonly partyMemberInCombat: readonly boolean[];
  /** One-shot COAB player_not_found flag set by a failed LOAD_CHARACTER. */
  private selectedPartyNotFound: boolean;
  /** Host party-wide affect signal for CHECKPARTY (0x1E). */
  private readonly partyAffects: Set<number>;
  /** Host party movement values for CHECKPARTY (0x1E). */
  private readonly partyMovements: readonly number[];
  /** Host per-member thief skill values for CHECKPARTY (0x1E). */
  private readonly partyThiefSkills: readonly (readonly number[])[];
  /** Host inventory signal for FIND_ITEM (0x32); see {@link EclVmOptions.partyItemTypes}. */
  private readonly partyItemTypes: Set<number>;
  /** Host selected-character affect signal for FIND_SPECIAL (0x3F). */
  private readonly selectedPlayerAffects: Set<number>;
  /** Host party spell-list signal for SPELL (0x3B). */
  private readonly partySpellLists: readonly (readonly number[])[];
  /** Internal pure game clock advanced by ECL_CLOCK (0x34). */
  private clockSlots: ClockSlots;

  constructor(raw: Uint8Array, opts: EclVmOptions = {}) {
    this.dialect = opts.dialect ?? ECL_GEN1;
    if (raw.length < this.dialect.headerLen) {
      throw new Error(`ECL VM: block too small (${raw.length} bytes; need ≥ ${this.dialect.headerLen})`);
    }
    this.raw = raw;
    this.memory = opts.memory ?? new Map<number, number>();
    this.encounter = opts.encounterRoster ?? [];
    this.pc = opts.entry ?? this.dialect.headerLen;
    this.rng = (opts.seed ?? 0x1234) >>> 0;
    this.rollRandomInclusive = opts.rollRandomInclusive;
    this.stepBudget = opts.stepBudget ?? 100000;
    this.onCall = opts.onCall;
    this.findCharacter = opts.findCharacter;
    this.partyStrength = (opts.partyStrength ?? 0) | 0;
    this.encounterDistance = Math.max(0, opts.encounterDistance ?? 0) & 0xff;
    this.inDungeon = opts.inDungeon ?? true;
    this.partyHasRanger = opts.partyHasRanger ?? false;
    this.selectedPartyIndex = opts.selectedPartyIndex === undefined ? null : opts.selectedPartyIndex & 0x7f;
    this.partyMemberAffects = Array.from(
      opts.partyMemberAffects ?? [],
      (affects) => new Set(Array.from(affects, (v) => v & 0xff)),
    );
    this.partyMemberInCombat = Array.from(opts.partyMemberInCombat ?? [], (v) => !!v);
    this.selectedPartyNotFound = false;
    this.partyAffects = new Set(Array.from(opts.partyAffects ?? [], (v) => v & 0xff));
    this.partyMovements = Array.from(opts.partyMovements ?? [], (v) => v & 0xff);
    this.partyThiefSkills = Array.from(opts.partyThiefSkills ?? [], (skills) => Array.from(skills, (v) => v & 0xff));
    this.partyItemTypes = new Set(Array.from(opts.partyItemTypes ?? [], (v) => v & 0xff));
    this.selectedPlayerAffects = new Set(Array.from(opts.selectedPlayerAffects ?? [], (v) => v & 0xff));
    this.partySpellLists = Array.from(opts.partySpellLists ?? [], (spells) => Array.from(spells, (v) => v & 0xff));
    this.clockSlots = (opts.clock ?? newClock()).slice() as ClockSlots;
  }

  /** Current deterministic RNG state for a host that chains independent VM entries. */
  get rngState(): number {
    return this.rng;
  }

  /** Current program counter (byte offset) and virtual address — for tests/diagnostics. */
  get programCounter(): number {
    return this.pc;
  }
  get vaddr(): number {
    return this.dialect.vbase + this.pc;
  }
  /** Current seven-slot game clock after any ECL_CLOCK instructions executed so far. */
  get gameClock(): ClockSlots {
    return this.clockSlots.slice() as ClockSlots;
  }
  get done(): boolean {
    return this.finished;
  }

  // --- operand resolution --------------------------------------------------

  /** Read an operand as a value (rvalue): immediate, or a dereferenced memory cell. */
  private rvalue(a: EclOpp): number {
    switch (a.code) {
      case 0x00:
        return a.high; // literal immediate
      case 0x80:
        return a.high; // string-table index / inline-string marker (value = index)
      case 0x81:
        return a.word; // runtime memory-string pointer
      case 0x02:
        return a.word; // 16-bit immediate literal
      case 0x01:
      case 0x03:
      case 0x7f:
        {
          const selectedValue = this.selectedPlayerPseudoValue(a.word);
          if (selectedValue !== null) return selectedValue;
        }
        return this.memory.get(a.word) ?? 0; // variable reference
      default:
        return a.high;
    }
  }

  /** The destination address (lvalue) an operand names. */
  private addrOf(a: EclOpp): number {
    return a.word;
  }

  // --- public driver -------------------------------------------------------

  /** Run until the VM pauses (input/combat), chains, exits, or halts. */
  run(): EclRunResult {
    this.effects = [];
    return this.loop();
  }

  /**
   * Resume after an input/menu/who/combat pause. For input/menu the supplied `value` is written
   * to the opcode's destination address. For WHO it is the zero-based selected party index. For
   * combat, `value` is ignored; pass
   * `opts.combatOutcome` instead — it is written into the compare-flags register (default
   * `'defeat'` if omitted, the same conservative-default convention as
   * {@link EclVmOptions.partyStrength}) so a following IF_EQ/IF_LT/IF_GT branches on victory (==),
   * defeat (<), or flee (>) against the fixed reference value 1.
   */
  resume(value: EclInputValue = 0, opts?: { combatOutcome?: EclCombatOutcome }): EclRunResult {
    this.effects = [];
    if (this.pending) {
      if (this.pending.kind === 'encounterMenu') {
        const flow = this.resumeEncounterMenu(this.numericInput(value));
        if (flow) return flow;
      } else if (this.pending.kind === 'yesNo') {
        // Menu-index convention (same as every other menu pause): 0 = the first item = YES.
        this.setBooleanCompareFlags(this.numericInput(value) === 0);
        this.pending = null;
      } else if (this.pending.kind === 'who') {
        // DQK's retail WHO handler masks the returned member id with 0x7f, locates that party
        // record, and installs it as the global selected-player pointer. The host-facing VM uses
        // its equivalent zero-based roster index; the DOS form's key/click confirmation protocol
        // is deliberately a UI concern, not encoded here.
        this.selectedPartyIndex = Math.max(0, Math.trunc(this.numericInput(value))) & 0x7f;
        this.selectedPartyNotFound = false;
        this.pending = null;
      } else if (this.pending.kind === 'string') {
        // COAB CMD_InputString writes an upper-cased, NUL-terminated string into operand 2's
        // runtime-string cell. Operand 1 is only the maximum input length. Preserve both the
        // textual cell used by 0x81 COMPARE/PRINT operands and its source-faithful character words.
        const entered = (typeof value === 'string' ? value : String(value)).toUpperCase();
        const text = (entered.length > 0 ? entered : ' ').slice(0, this.pending.maxLength);
        this.strings.set(this.pending.destAddr, text);
        for (let i = 0; i < text.length; i++) this.memory.set(this.pending.destAddr + i, text.charCodeAt(i));
        this.memory.set(this.pending.destAddr + text.length, 0);
        this.pending = null;
      } else {
        this.memory.set(this.pending.destAddr, this.resolvePendingValue(this.numericInput(value), this.pending));
        this.pending = null;
      }
    } else if (this.lastPauseWasCombat) {
      const code = opts?.combatOutcome === 'victory' ? 1 : opts?.combatOutcome === 'flee' ? 2 : 0;
      this.setCompareFlags(code, 1);
    }
    this.lastPauseWasCombat = false;
    return this.loop();
  }

  private numericInput(value: EclInputValue): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolvePendingValue(value: number, pending: PendingValue): number {
    if (!pending.valueMap) return value & 0xffff;
    const index = Math.max(0, Math.trunc(value));
    return (pending.valueMap[index] ?? pending.valueMap[0] ?? 0) & 0xffff;
  }

  /** The six COAB compare flags (==, !=, <, >, <=, >=) after the last comparison — for the inspector. */
  get compareFlags(): readonly boolean[] {
    return this.cmpFlags.slice();
  }

  /** GOSUB call-stack depth — for the inspector. */
  get callDepth(): number {
    return this.callStack.length;
  }

  /**
   * Execute exactly ONE instruction (the ECL inspector's single-step). Unlike {@link run}, this
   * never loops: it decodes the instruction at the PC, executes it, and returns what ran plus the
   * resulting status — `'running'` when the VM simply advanced, or the yield status (`exited` /
   * `chain` / `awaiting-input` / `combat` / `halted`) when the instruction handed control back.
   * A pending input pause is auto-answered with 0 on the next step so stepping never hangs (a
   * debugger flows through). Effects emitted by this one instruction are returned in `effects`.
   */
  step(): EclStepResult {
    this.effects = [];
    if (this.pending) {
      // Auto-answer a paused input/menu/who with 0 so single-stepping continues past it.
      if (this.pending.kind === 'encounterMenu') {
        const pendingIns = this.pending.state.ins;
        const flow = this.resumeEncounterMenu(0);
        if (flow) {
          return {
            instruction: pendingIns,
            status: flow.status,
            done: this.finished,
            haltReason: flow.haltReason,
            chainBlockId: flow.chainBlockId,
            effects: this.effects.slice(),
          };
        }
      } else if (this.pending.kind === 'yesNo') {
        // Auto-answer 0 = the first item (YES) — same "a debugger flows through" convention.
        this.setBooleanCompareFlags(true);
        this.pending = null;
      } else if (this.pending.kind === 'who') {
        // Auto-select the first party member so single-stepping continues past WHO.
        this.selectedPartyIndex = 0;
        this.selectedPartyNotFound = false;
        this.pending = null;
      } else if (this.pending.kind === 'string') {
        const text = '0'.slice(0, this.pending.maxLength);
        this.strings.set(this.pending.destAddr, text);
        if (text) this.memory.set(this.pending.destAddr, text.charCodeAt(0));
        this.memory.set(this.pending.destAddr + text.length, 0);
        this.pending = null;
      } else {
        this.memory.set(this.pending.destAddr, this.resolvePendingValue(0, this.pending));
        this.pending = null;
      }
    }
    if (this.finished) {
      return { instruction: null, status: 'exited', done: true, effects: [] };
    }
    if (this.pc >= this.raw.length) {
      this.finished = true;
      return { instruction: null, status: 'exited', done: true, effects: [] };
    }
    const dec = decodeInstructionAt(this.raw, this.pc, this.dialect.vbase, this.dialect);
    if (dec.badOpcode || !dec.ins) {
      this.finished = true;
      return { instruction: null, status: 'halted', done: true, haltReason: `bad opcode at ${this.pc}`, effects: [] };
    }
    const ins = dec.ins;
    const flow = this.exec(ins, dec.next);
    return {
      instruction: ins,
      status: flow ? flow.status : 'running',
      done: this.finished,
      haltReason: flow?.haltReason,
      chainBlockId: flow?.chainBlockId,
      effects: this.effects.slice(),
    };
  }

  private loop(): EclRunResult {
    let steps = 0;
    while (!this.finished) {
      if (steps++ >= this.stepBudget) {
        return { status: 'halted', effects: this.effects, haltReason: 'step-budget exceeded' };
      }
      if (this.pc >= this.raw.length) {
        this.finished = true;
        return { status: 'exited', effects: this.effects };
      }
      const dec = decodeInstructionAt(this.raw, this.pc, this.dialect.vbase, this.dialect);
      if (dec.badOpcode || !dec.ins) {
        this.finished = true;
        return { status: 'halted', effects: this.effects, haltReason: `bad opcode at ${this.pc}` };
      }
      const ins = dec.ins;
      const flow = this.exec(ins, dec.next);
      if (flow) return flow; // a pause/chain/exit/halt result
    }
    return { status: 'exited', effects: this.effects };
  }

  /**
   * Execute one instruction. `next` is the fall-through offset. Returns a result object to
   * yield to the host (pause/chain/exit/halt), or null to keep running. Mutates pc.
   */
  private exec(ins: EclInstruction, next: number): EclRunResult | null {
    const a = ins.args;
    switch (ins.opcode) {
      case EXIT:
        this.finished = true;
        return { status: 'exited', effects: this.effects, at: ins };

      case 0x01: { // GOTO addr
        const t = this.targetOffset(a[0]);
        if (!this.inCode(t)) {
          // Non-local jump (target outside this block's code range, e.g. into the game's
          // global data segment). A standalone block VM cannot follow it — flag and fall
          // through so the rest of the script still executes.
          this.effects.push({ type: 'unhandled', mnemonic: 'GOTO(nonlocal)', opcode: ins.opcode, ins });
          this.pc = next;
          return null;
        }
        this.pc = t;
        return null;
      }

      case 0x02: { // GOSUB addr
        const t = this.targetOffset(a[0]);
        if (!this.inCode(t)) {
          this.effects.push({ type: 'unhandled', mnemonic: 'GOSUB(nonlocal)', opcode: ins.opcode, ins });
          this.pc = next;
          return null;
        }
        this.callStack.push(next);
        this.pc = t;
        return null;
      }

      case 0x13: // RETURN
        if (this.callStack.length === 0) {
          this.finished = true;
          return { status: 'exited', effects: this.effects, at: ins };
        }
        this.pc = this.callStack.pop()!;
        return null;

      case 0x03: // COMPARE a, b  → set the six comparison flags
        this.compareOperands(a[0], a[1]);
        this.pc = next;
        return null;

      case 0x14: { // COMPARE_AND a,b,c,d (compound) → flag[0] (==) iff (a==b AND c==d), else flag[1] (!=)
        // VERIFIED against COAB CMD_CompareAnd (sub_26B0C): the opcode reads four operand values,
        // tests the TWO pairs for equality, and sets compare_flags[0]=true when both hold else
        // compare_flags[1]=true — every other slot stays false. Confirmed by self-disassembling
        // DQK ECL.GLB area 18 vmRun1 @0x836e: `COMPARE_AND [0xbf],#1,[0x11],#2 ; IF_EQ ; GOTO`
        // — the IF_EQ (op 0x16 @0x8379) reads flag[0]. (NB: the research listing's #257/#5634/#383
        // were operand-misframing artifacts — real immediates are #1/#2, mask #0x7F, facing a raw
        // ordinal; see docs/engine/research/combat-trigger-c4.2b-2b-2c-iii.md.)
        const bothEqual = this.rvalue(a[0]) === this.rvalue(a[1]) && this.rvalue(a[2] ?? a[0]) === this.rvalue(a[3] ?? a[0]);
        this.cmpFlags = [bothEqual, !bothEqual, false, false, false, false];
        this.pc = next;
        return null;
      }

      case 0x16: // IF =
      case 0x17: // IF <>
      case 0x18: // IF <
      case 0x19: // IF >
      case 0x1a: // IF <=
      case 0x1b: // IF >=
        return this.execIf(ins, next);

      case 0x09: { // SAVE value, dest
        const dest = this.addrOf(a[1]);
        this.memory.set(dest, this.rvalue(a[0]) & 0xffff);
        // ECL uses an inline packed string (`0x80`) saved to a runtime string cell (`0x81`)
        // for location names such as CoK ECL1#16's WILD/THROTL/OUTPOST dispatcher.  Preserve
        // the ordinary numeric marker above for existing consumers, but keep the text separately
        // so later COMPARE/PRINT operands obey the original string semantics.
        if (a[0]?.text !== undefined && a[1]?.code === 0x81) this.strings.set(dest, a[0].text);
        // ADR-0009: 0x7F12 → alter_character switch_var 0x312 → set_game_area (COAB ovr008.cs:654-656).
        if (dest === 0x7f12) {
          this.effects.push({ type: 'setGameArea', gameArea: this.rvalue(a[0]) & 0xff });
        }
        this.pc = next;
        return null;
      }

      case 0x04: // ADD
      case 0x05: // SUBTRACT
      case 0x06: // DIVIDE
      case 0x07: // MULTIPLY
      case 0x2f: // AND
      case 0x30: // OR
        this.execArith(ins);
        this.pc = next;
        return null;

      case 0x08: { // RANDOM range, dest  → dest = rand % range
        const operand = Math.max(0, this.rvalue(a[0]));
        if (this.rollRandomInclusive) {
          if (operand === 0xff) {
            throw new Error('ECL VM: inclusive RANDOM bridge does not model operand 255');
          }
          const value = this.rollRandomInclusive(operand);
          if (!Number.isInteger(value) || value < 0 || value > operand) {
            throw new Error(`ECL VM: inclusive RANDOM #${operand} returned invalid value ${value}`);
          }
          this.memory.set(this.addrOf(a[1]), value);
        } else {
          const r = nextRand(this.rng);
          this.rng = r.state;
          const range = Math.max(1, operand);
          this.memory.set(this.addrOf(a[1]), r.value % range);
        }
        this.pc = next;
        return null;
      }

      case 0x20: { // NEWECL #id → chain to another block
        this.finished = true;
        const blockId = this.rvalue(a[0]);
        return { status: 'chain', effects: this.effects, chainBlockId: blockId, at: ins };
      }

      // --- host effects that do not pause ---
      case 0x11: // PRINT
      case 0x12: // PRINTCLEAR
      case 0x33: { // PRINT_RETURN
        const runtimeText = a[0]?.code === 0x81 ? this.strings.get(a[0].word) : undefined;
        this.effects.push({
          type: 'print',
          ...(a[0]?.kind === 'strref' ? { stringRef: a[0].high } : { stringRef: a[0]?.word }),
          ...(a[0]?.text !== undefined ? { text: a[0].text } : runtimeText !== undefined ? { text: runtimeText } : {}),
          clear: ins.opcode === 0x12,
          newline: ins.opcode === 0x33,
        });
        this.pc = next;
        return null;
      }

      case 0x0e: // PICTURE id
        this.effects.push({ type: 'picture', id: this.rvalue(a[0]) });
        this.pc = next;
        return null;

      case 0x3d: // CLEAR_BOX
        this.effects.push({ type: 'clearBox' });
        this.pc = next;
        return null;

      case 0x3a: // DELAY
        this.effects.push({ type: 'delay' });
        this.pc = next;
        return null;

      case 0x42: { // Treasures' LOAD_AREA_PIECES area, set1, set2, set3 (one combined loader)
        // See ECL_GEN1_SHORT_TREASURES's own `0x42` doc comment for why this is the area loader
        // and what is/isn't proven about it. Emitting both effects is what lets `loadDungeon`
        // mount the 19 blocks that carry it — among them ECL1#16, the game's opening area.
        //
        // DIALECT GATE (round 35 R1). This case is selected BY OPCODE, and byte 0x42 is NOT
        // Treasures-only: `ECL_GEN1_BUCK`/`ECL_GEN1_MATRIX` also carry a 0x42, measured
        // zero-operand (`BUCK_EXT_42`), and round 35 made those decode for the first time — 232
        // Buck and 528 Matrix instructions. Without this guard every one of them would fall into
        // the body below and read `a[0..3]` from an EMPTY operand list, i.e. `rvalue(undefined)`
        // on four operands that were never decoded, and would emit a `loadFiles`/`loadPieces`
        // pair claiming an area load that Buck's script never asked for. Keying on the mnemonic
        // (the same convention `FIND_CHARACTER_MNEMONICS` uses for 0x37, for the same reason)
        // sends any other dialect's 0x42 to the `unhandled` effect instead, which is the honest
        // outcome: Buck's/Matrix's 0x42 handler far-calls are still unidentified and NO semantics
        // are claimed for it. `buckEclDialect.test.ts` pins that 0 of them reach `loadFiles`.
        if (ins.mnemonic !== 'LOAD_AREA_PIECES') {
          this.effects.push({ type: 'unhandled', mnemonic: ins.mnemonic, opcode: ins.opcode, ins });
          this.pc = next;
          return null;
        }
        this.effects.push({
          type: 'loadFiles',
          geoBlockId: this.rvalue(a[0]),
          operands: a.map((op) => this.rvalue(op)),
        });
        const pieces: [number, number, number] = [this.rvalue(a[1]), this.rvalue(a[2]), this.rvalue(a[3])];
        this.effects.push({ type: 'loadPieces', ...this.resolvePieces(pieces) });
        this.pc = next;
        return null;
      }

      case 0x21: // LOAD_FILES — operand 0 = dungeon GEO map block (EclDump "Load GEO N")
        this.effects.push({
          type: 'loadFiles',
          geoBlockId: this.rvalue(a[0]),
          operands: a.map((op) => this.rvalue(op)),
        });
        this.pc = next;
        return null;

      case 0x37: { // LOAD_PIECES in early dialects; Pools and Treasures both replace it with a party-name lookup.
        if (FIND_CHARACTER_MNEMONICS.has(ins.mnemonic)) {
          // Pools GAME.OVR+0x1eca proves this two-operand command decodes an inline name, walks
          // the native party list, and writes 0xFF when absent or the zero-based TeamList ordinal
          // with bit 7 set when the matched record is not currently in combat. The synchronous
          // host bridge is required because following instructions branch on this byte immediately.
          // Treasures' own handler at its `GAME.OVR` file `0x2577` opens with the same
          // `mov al,2; push ax; lcall 0x58,0x2a` two-operand prefetch and then reads a 28-byte
          // inline name at `[0xa862]` before walking the party list -- the same shape, read from a
          // different binary. Both titles' mnemonics are matched here rather than one dialect
          // borrowing the other's label, so a dialect keeps its own title's name.
          const name = (a[0]?.text ?? '').trim();
          const destAddr = this.addrOf(a[1]);
          const match = this.findCharacter?.(name);
          let result: number | undefined;
          if (match === null) {
            result = 0xff;
          } else if (match !== undefined) {
            if (!Number.isInteger(match.index) || match.index < 0 || match.index > 0x7f) {
              throw new Error(`ECL VM: POOLS_FIND_CHARACTER returned invalid TeamList index ${match.index}`);
            }
            result = match.index | (match.inCombat ? 0 : 0x80);
          }
          if (result !== undefined) this.memory.set(destAddr, result);
          this.effects.push({ type: 'findCharacter', name, destAddr, ...(result !== undefined ? { result } : {}), ins });
          this.pc = next;
          return null;
        }
        const operands: [number, number, number] = [this.rvalue(a[0]), this.rvalue(a[1]), this.rvalue(a[2])];
        this.effects.push({ type: 'loadPieces', ...this.resolvePieces(operands) });
        this.pc = next;
        return null;
      }

      case 0x2a: { // GETTABLE base, offset, dest (COAB CMD_GetTable sub_26E3F)
        const base = this.addrOf(a[0]);
        const offset = this.rvalue(a[1]) & 0xff;
        const tableAddr = (base + offset) & 0xffff;
        const value = this.memory.has(tableAddr)
          ? this.memory.get(tableAddr)!
          : (this.inCode(this.targetOffset({ ...a[0], word: tableAddr }))
            ? this.raw[this.targetOffset({ ...a[0], word: tableAddr })]
            : 0);
        this.memory.set(this.addrOf(a[2]), value);
        this.pc = next;
        return null;
      }

      case 0x35: { // SAVE_TABLE value, base, offset (COAB CMD_SaveTable sub_26E9D)
        const value = this.rvalue(a[0]) & 0xffff;
        const base = this.addrOf(a[1]);
        const offset = this.rvalue(a[2]) & 0xffff;
        this.memory.set((base + offset) & 0xffff, value);
        this.pc = next;
        return null;
      }

      case 0x1f: { // UNKNOWN_1F — EclDump labels "notsure"; preserve evidence.
        this.effects.push({
          type: 'scriptEffect',
          kind: 'unknown1f',
          opcode: ins.opcode,
          operands: a.map((op) => this.rvalue(op)),
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x41: {
        if (ins.mnemonic === 'POOLS_AWARD_XP') {
          const selector = this.rvalue(a[0]) & 0xffff;
          const hundreds = this.rvalue(a[1]) & 0xffff;
          this.effects.push({
            type: 'awardExperience',
            scope: selector === 0 ? 'selected' : 'party',
            hundreds,
            amount: hundreds * 100,
            ...(selector === 0 && this.selectedPartyIndex !== null ? { selectedPartyIndex: this.selectedPartyIndex } : {}),
            ins,
          });
          this.pc = next;
          return null;
        }
        // GEN2_EXT_41 — DQK Gen2's ONE opcode-table extension beyond Gen1's 0x00-0x40 ceiling
        // (ECL_GEN2.opcodeOverrides; see docs/engine/research/decompile-dqk-ecl-dispatch.md's
        // "2026-07-18 DYNAMIC TRACE — SOLVED"). Only reachable when a script was decoded under
        // ECL_GEN2 (KRYNN_GEN1_OPCODES has no 0x41 entry, so Gen1 scripts still bad-opcode/halt
        // on this byte — a genuine desync signal the project intentionally keeps, see the doc's
        // "Engine cross-check").
        //
        // Live trace r3 (area 65 member 45) fired this end-to-end with operand bytes `00 01 00
        // 64` (two literal operands, values 1 and 100) and the handler disassembly (file
        // 0x042ae9) iterates the 7-slot party array counting members with `es:[bx+0xa5] > 0`
        // then does 32-bit division of a value by that count before driving text-output helpers.
        // Combined with the script contexts the census found — after an XP-award INPUT_NUMBER
        // prompt, after a scene transition, after a menu choice — this reads as a **party-wide
        // award/split (XP-award class) operation**. That is a GROUNDED HYPOTHESIS, NOT A PROVEN
        // SEMANTIC: no live run has confirmed what the handler writes back or where. So the VM
        // does not compute or apply any award — it only surfaces the raw operands as a distinct,
        // labeled effect so a host can opportunistically act on the hypothesis (or ignore it)
        // without the VM inventing unverified game behavior.
        this.effects.push({
          type: 'scriptEffect',
          kind: 'gen2Ext41',
          opcode: ins.opcode,
          operands: a.map((op) => this.rvalue(op)),
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x2e: { // DAMAGE
        const operands = a.map((op) => this.rvalue(op));
        this.effects.push({
          type: 'damage',
          dice: {
            count: operands[1],
            sides: operands[2],
            bonus: operands[3],
          },
          policy: damagePolicy(operands[0] & 0xff, operands[4] & 0xff),
          operands,
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x27: { // TREASURE — two incompatible frames this dialect's own `def.countAt` picks:
        // Gen1 base (`wordSet: 8`, no `countAt`): coins[7]+itemBlockId (COAB CMD_Treasure/load_item).
        // Gen2/Gen1-short-with-`countAt` (`wordSet: 4, countAt: 3`, shipped for DQK's ECL_GEN2 and
        // documented — not yet dialect-shipped — for Pools/Treasures, see disassemble.ts's
        // ECL_GEN1_SHORT_POOLS/TREASURES docblock): three `rvalue`-accumulated 32-bit party-gold
        // fields (operands 0-2, semantics of which coin TYPE each is is unproven from the binary —
        // only that they are three separate accumulator addresses), a count (operand 3), then
        // `count` more item-id operands (0xff sentinel = "no item", filtered out of `itemTail`).
        // Reading `operands[7]` unconditionally here (the pre-round-33-R2 code) was already wrong
        // for DQK: Gen2 decodes 0x27 as 4+tail, so `operands[7]` was undefined whenever the tail
        // held fewer than 4 items and a stray tail item whenever it held 4 or more.
        const operands = a.map((op) => this.rvalue(op));
        const usesCountAtFrame = this.dialect.opcodeOverrides?.[0x27]?.countAt !== undefined;
        if (usesCountAtFrame) {
          const itemTail = operands.slice(4).filter((v) => (v & 0xff) !== 0xff).map((v) => v & 0xff);
          this.effects.push({
            type: 'treasure',
            frame: 'gold3Tail',
            coins: treasureCoins([]),
            itemBlockId: 0xff,
            itemSource: 'none',
            randomItemCount: 0,
            partyGold: [operands[0] ?? 0, operands[1] ?? 0, operands[2] ?? 0],
            itemTail,
            operands,
            ins,
          });
        } else {
          const itemBlockId = operands[7] & 0xff;
          const source = treasureItemSource(itemBlockId);
          this.effects.push({
            type: 'treasure',
            frame: 'coins7Item',
            coins: treasureCoins(operands.slice(0, 7)),
            itemBlockId,
            ...source,
            operands,
            ins,
          });
        }
        this.pc = next;
        return null;
      }

      case 0x28: { // ROB allParty,lossPercent,itemChance (COAB CMD_Rob)
        const operands = a.map((op) => this.rvalue(op));
        const allParty = operands[0] & 0xff;
        const moneyLossPercent = operands[1] & 0xff;
        this.effects.push({
          type: 'rob',
          scope: allParty === 0 ? 'selected' : 'party',
          moneyLossPercent,
          moneyKeepPercent: Math.max(0, 100 - moneyLossPercent),
          itemRobChance: operands[2] & 0xff,
          operands,
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x34: { // ECL_CLOCK timeStep,timeSlot (COAB CMD_EclClock -> step_game_time)
        const timeStep = this.rvalue(a[0]) & 0xff;
        const timeSlot = this.rvalue(a[1]) & 0xff;
        if (timeSlot > 6) {
          this.effects.push({
            type: 'scriptEffect',
            kind: 'eclClock',
            opcode: ins.opcode,
            operands: [timeStep, timeSlot],
            ins,
          });
          this.pc = next;
          return null;
        }
        const before = this.clockSlots.slice() as ClockSlots;
        const advanced = stepGameTime(before, timeSlot, timeStep);
        this.clockSlots = advanced.clock;
        this.effects.push({
          type: 'eclClock',
          timeStep,
          timeSlot,
          before,
          after: advanced.clock,
          elapsedMinutes: advanced.elapsedMinutes,
          yearRollovers: advanced.yearRollovers,
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x2d: { // CALL — preserve raw operand and computed host routine id.
        const operand = a[0].word & 0xffff;
        const routineId = eclCallRoutineId(operand, this.dialect);
        const routine = ECL_CALL_ROUTINES[routineId];
        const memory = [...this.memory.entries()]
          .sort(([addressA], [addressB]) => addressA - addressB)
          .map(([address, value]) => [address, value] as const);
        const effect: EclCallEffect = routine
          ? { type: 'call', routineId, routine, operand, ins, memory }
          : { type: 'call', routineId, operand, ins, memory };
        this.effects.push(effect);
        // Native CALLs are synchronous. The host must be allowed to update engine-owned state
        // before the next bytecode instruction executes (not after run()/resume() returns).
        const hostResult = this.onCall?.(effect, this.memory);
        if (hostResult && typeof hostResult === 'object' && hostResult.comparison) {
          this.setCompareFlags(hostResult.comparison.left & 0xffff, hostResult.comparison.right & 0xffff);
        }
        this.pc = next;
        return null;
      }

      case 0x38: { // PROGRAM id — host routine dispatch (PROGRAM 0 = StartGameMenu in CoK)
        this.effects.push({ type: 'program', programId: this.rvalue(a[0]) & 0xff, ins });
        this.pc = next;
        return null;
      }

      case 0x3c: // PROTECTION — no-op in the clean-room Krynn VM; CoK ECL does not use it.
        this.pc = next;
        return null;

      case 0x3e: // DUMP — retail/debug diagnostic; no game-state effect.
        this.pc = next;
        return null;

      case 0x0c: { // SETUP_MONSTER sprite,maxDistance,pic (COAB CMD_SetupMonster sub_263C9).
        // Short-dialect titles (DoK/Treasures/PoD) pass a FOURTH operand — DoK's GAME.OVR handler
        // at 0xBAC is vm_LoadCmdSets(4) with params 1-3 landing in the same sprite/area/pic globals
        // as CoAB's 3-operand form and param 4 in an extra global ([0xc4cc], consumer unlocated).
        // See ECL_GEN1_SHORT's doc comment (disassemble.ts) for the corpus audit. The VM captures
        // it as `extra` without inventing behavior for it.
        const spriteId = this.rvalue(a[0]) & 0xff;
        const maxDistance = this.rvalue(a[1]) & 0xff;
        const picId = this.rvalue(a[2]) & 0xff;
        this.encounterSetup = {
          spriteId,
          maxDistance,
          picId,
          distance: Math.min(this.encounterDistance, maxDistance),
          ...(a.length >= 4 ? { extra: this.rvalue(a[3]) & 0xff } : {}),
        };
        this.effects.push({ type: 'encounterSetup', setup: { ...this.encounterSetup }, ins });
        this.pc = next;
        return null;
      }

      case 0x0d: { // APPROACH: decrement encounter distance if one is active
        if (this.encounterSetup) {
          this.encounterSetup = {
            ...this.encounterSetup,
            distance: Math.max(0, this.encounterSetup.distance - 1),
          };
          this.effects.push({ type: 'encounterSetup', setup: { ...this.encounterSetup }, ins });
        }
        this.pc = next;
        return null;
      }

      case 0x40: { // DESTROY_ITEMS itemType (COAB CMD_DestroyItems sub_292F9)
        const itemType = this.rvalue(a[0]) & 0xff;
        this.partyItemTypes.delete(itemType);
        this.effects.push({ type: 'destroyItems', itemTypeId: itemType, ins });
        this.pc = next;
        return null;
      }

      case 0x36: { // ADD_NPC npc_id, morale → recruit a companion (COAB CMD_AddNPC, ovr003.cs:1769)
        const npcId = this.rvalue(a[0]) & 0xff;
        const morale = this.rvalue(a[1]) & 0xff;
        this.effects.push({ type: 'addNpc', npcId, morale });
        this.pc = next;
        return null;
      }

      case 0x32: { // FIND_ITEM itemType -> compare_flags[EQ/NE] (COAB CMD_FindItem sub_28856)
        const itemType = this.rvalue(a[0]) & 0xff;
        this.setBooleanCompareFlags(this.partyItemTypes.has(itemType));
        this.pc = next;
        return null;
      }

      // --- host effects that PAUSE for the host ---
      case 0x0f: // INPUT_NUMBER unused/prompt operand, dest
      case 0x10: { // INPUT_STRING maxLength, dest
        // Both retail handlers parse two operands and write through operand 2. For INPUT_STRING,
        // operand 1 is passed to getUserInputString as its input-length cap (COAB ovr003.cs).
        const destAddr = this.addrOf(a[1]);
        const maxLength = Math.max(0, this.rvalue(a[0]));
        this.pending = ins.opcode === 0x10
          ? { kind: 'string', destAddr, maxLength }
          : { kind: 'value', destAddr };
        this.pc = next;
        this.effects.push({
          type: 'input', mode: ins.opcode === 0x0f ? 'number' : 'string', destAddr,
          ...(ins.opcode === 0x10 ? { maxLength } : {}), ins,
        });
        return { status: 'awaiting-input', effects: this.effects, at: ins };
      }

      case 0x15: // VERTICAL_MENU
      case 0x2b: // HORIZONTAL_MENU
      case 0x31: // SPRITE_OFF in the long dialects; a menu in the short one (guarded below).
      { // ENCOUNTER_MENU is handled separately below.
        // 0x31 carries two unrelated meanings across the dialects. In the 1991+ short titles
        // it is a menu whose frame is byte-identical to 0x2b (dest, count, then `count` inline
        // items) — Death Knights 142/142 and Pools 491/491 inline items unpack to real menu labels
        // (ATTACK / FLEE / TALK / PAY / BLUFF / GROVEL / LEAVE ...), while Pool of Radiance under
        // the same frame yields 100/161 with desync garbage. See ECL_GEN1_SHORT's opcodeOverrides
        // comment. Gen2 reaches the same conclusion from the other direction: DQK's 0x31 slot stub
        // and 0x2b's BOTH trampoline into handler 25a4:1ff7, passing al purely as a discriminator,
        // so 0x31 is literally the same menu code path (see ECL_GEN2's comment). Keying off the
        // dialect-resolved mnemonic, not the raw byte, keeps the long titles on SPRITE_OFF.
        if (ins.opcode === 0x31 && ins.mnemonic !== 'SHORT_MENU') {
          this.effects.push({ type: 'spriteOff' });
          this.pc = next;
          return null;
        }
        // COAB writes the chosen item index to the destination operand; following script
        // instructions usually branch by reading that same cell.
        const destAddr = this.addrOf(a[0]);
        this.pending = { kind: 'value', destAddr };
        this.pc = next;
        const style = ins.opcode === 0x15 ? 'vertical' : 'horizontal';
        // Menu item strings follow the count operand: index 3+ for VERTICAL (after dest,
        // prompt, count), index 2+ for HORIZONTAL (after dest, count). VERTICAL also has a
        // prompt string at index 1.
        const itemsFrom = ins.opcode === 0x15 ? 3 : 2;
        const items = a.slice(itemsFrom).map((op) => op.text).filter((t): t is string => t !== undefined);
        const prompt = ins.opcode === 0x15 ? a[1]?.text : undefined;
        this.effects.push({ type: 'menu', style, items, ...(prompt !== undefined ? { prompt } : {}), destAddr, ins });
        return { status: 'awaiting-input', effects: this.effects, at: ins };
      }

      case 0x29: { // ENCOUNTER_MENU: setup encounter art, then pause for COMBAT/WAIT/FLEE/ADVANCE|PARLAY.
        const spriteId = this.rvalue(a[0]) & 0xff;
        const maxDistance = this.rvalue(a[1]) & 0xff;
        const picId = this.rvalue(a[2]) & 0xff;
        const distance = Math.min(this.encounterDistance, maxDistance);
        const state: EncounterMenuState = {
          spriteId,
          maxDistance,
          picId,
          distance,
          destAddr: this.addrOf(a[3]),
          actionValues: a.slice(4, 9).map((op) => this.rvalue(op) & 0xff),
          texts: a.slice(9, 12).map((op) => op.text ?? ''),
          fleeThreshold: this.rvalue(a[12]) & 0xff,
          monsterFleeThreshold: this.rvalue(a[13]) & 0xff,
          ...this.encounterMovementStats(),
          inDungeon: this.inDungeon,
          ins,
        };
        this.pc = next;
        return this.pauseEncounterMenu(state, true);
      }

      case 0x39: { // WHO prompt → choose the selected-player context
        // The one retail operand is an inline string (DQK area 67: "WHO WILL THROW A STONE?"),
        // not an lvalue. DQK.EXE's handler parses the form result, locates the matching active
        // party record, and updates the selected-player pointer; resume() mirrors that with the
        // host roster index used by this VM's selected-player queries.
        this.pending = { kind: 'who' };
        this.pc = next;
        this.effects.push({ type: 'who', prompt: a[0]?.text ?? '', ins });
        return { status: 'awaiting-input', effects: this.effects, at: ins };
      }

      case 0x2c: { // PARLAY values,dest → choose an attitude, then write mapped value to dest
        // Gen1-SHORT dialect (DoK/Gateway/Treasures/PoD, wordSetOverrides[0x2c]=1) encodes
        // PARLAY with a single operand: just the destination address, no remap table. In that
        // case `values` is empty -- fall back to a passthrough (raw choice index 0-4 written
        // directly to destAddr) rather than an empty valueMap, which previously made every
        // choice resolve to the same (undefined ?? 0 =) 0, causing all 5 attitudes to look
        // identical (found via DoK ECL1#36 / ECL2#64 / ECL3#81 PARLAY resume investigation).
        const destIndex = Math.max(0, a.length - 1);
        const values = a.slice(0, destIndex).map((op) => this.rvalue(op) & 0xff);
        const destAddr = this.addrOf(a[destIndex]);
        this.pending = { kind: 'value', destAddr, valueMap: values.length > 0 ? values : undefined };
        this.pc = next;
        this.effects.push({
          type: 'menu',
          style: 'parlay',
          items: ['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE'],
          destAddr,
          ins,
        });
        return { status: 'awaiting-input', effects: this.effects, at: ins };
      }

      case 0x3f: { // FIND_SPECIAL affectId -> selected-player affect query (COAB CMD_FindSpecial sub_292A5)
        const affectId = this.rvalue(a[0]) & 0xff;
        this.setBooleanCompareFlags(this.selectedAffects().has(affectId));
        this.pc = next;
        return null;
      }

      case 0x0a: { // LOAD_CHARACTER player_index (COAB CMD_LoadCharacter sub_262E9)
        const playerIndex = this.rvalue(a[0]) & 0x7f;
        const memberCount = Math.max(
          this.partyMemberAffects.length,
          this.partyMemberInCombat.length,
          this.partyThiefSkills.length,
          this.partySpellLists.length,
        );
        if (playerIndex > 0 && playerIndex < memberCount) {
          this.selectedPartyIndex = playerIndex;
          this.selectedPartyNotFound = false;
        } else {
          this.selectedPartyNotFound = true;
        }
        this.pc = next;
        return null;
      }

      case 0x3b: { // SPELL spellId,slotDest,playerDest (COAB CMD_Spell ovr003.cs:1785)
        const spellId = this.rvalue(a[0]) & 0xff;
        const found = this.findPartySpell(spellId);
        this.memory.set(this.addrOf(a[1]), found.spellIndex);
        this.memory.set(this.addrOf(a[2]), found.playerIndex);
        this.pc = next;
        return null;
      }

      case 0x1e: { // CHECKPARTY query,affect,locA,locB,locC,locD (COAB CMD_CheckParty sub_27454)
        const queryRaw = a[0].code === 0x01 ? a[0].word : this.rvalue(a[0]);
        const query = (queryRaw - 0x7fff) & 0xffff;
        let valA = 0;
        let valB = 0;
        let valC = 0;
        let valD = 0;

        if (query === 8001) {
          const affectId = this.rvalue(a[1]) & 0xff;
          valD = this.partyAffects.has(affectId) ? 1 : 0;
        } else if (query >= 0x00a5 && query <= 0x00ac) {
          const skillIndex = query - 0x00a5;
          const stats = summarizeByteValues(this.partyThiefSkills.map((skills) => skills[skillIndex] ?? 0));
          valA = stats.min;
          valB = stats.max;
          valC = stats.avg;
        } else if (query === 0x009f) {
          const stats = summarizeByteValues(this.partyMovements);
          valA = stats.min;
          valB = stats.max;
          valC = stats.avg;
        }

        this.memory.set(this.addrOf(a[2]), valA);
        this.memory.set(this.addrOf(a[3]), valB);
        this.memory.set(this.addrOf(a[4]), valC);
        this.memory.set(this.addrOf(a[5]), valD);
        this.pc = next;
        return null;
      }

      case 0x0b: { // LOAD_MONSTER id, copies, picBlock → queue a group for the next encounter
        const monsterId = this.rvalue(a[0]) & 0xff;
        const count = a[1] ? Math.max(1, this.rvalue(a[1]) & 0xff) : 1;
        const picBlockId = a[2] ? this.rvalue(a[2]) & 0xff : 0;
        this.encounter.push({ monsterId, count, picBlockId });
        this.pc = next;
        return null;
      }

      case 0x1d: { // PARTYSTRENGTH [threshold] → compute party strength, set comparison register
        // EVIDENCE-BACKED SEMANTICS (research C4.2b-2b-2b §4 + ecl-krynn-gen1-opcodes.md): this opcode
        // is consistently *followed by* an IF_GE/IF_EQ (e.g. area 23 `PARTYSTRENGTH c18:128 ; IF_GE`),
        // so it behaves like COMPARE — it leaves `{left: partyStrength, right: threshold}` in the cmp
        // register for the next instruction. This REFUTES the earlier "engine auto-fills the encounter
        // roster" hypothesis: the disassembly shows a strength *gate*, not a queue op; the roster still
        // comes from LOAD_MONSTER (or the host's wandering table). Threshold = the operand value;
        // strength = the host metric (default 0). The metric's exact formula/units are unrecoverable
        // from disk (see {@link EclVmOptions.partyStrength}); the comparison itself is the faithful part.
        const threshold = a[0] ? this.rvalue(a[0]) : 0;
        this.setCompareFlags(this.partyStrength, threshold);
        this.effects.push({ type: 'partyStrength', strength: this.partyStrength, threshold, ins });
        this.pc = next;
        return null;
      }

      case 0x22: { // PARTY_SURPRISE (long dialect: out_has_ranger,out_zero addresses, COAB
        // CMD_PartySurprise sub_2767E). Gen1-SHORT dialect (DoK/Gateway/Treasures/PoD,
        // ECL_GEN1_SHORT's wordSetOverrides[0x22]=0) takes ZERO operands. The 0-operand frame
        // itself was proven by the 2026-07-18 corpus audit (Pool 14/14 clean under 2 operands vs
        // DoK/Treasures/PoD 119/120, 115/115, 254/254 desynced — dok-natural-route.md's
        // opcode-0x22 finding); the first guess at its runtime SEMANTICS (a partyHasRanger
        // compare, flagged "not dynamically confirmed" at the time) is now REFUTED and replaced
        // by DoK's own GAME.OVR handler disassembly (2026-07-23, dok-natural-route.md Update 15):
        // the handler at file offset 0x23BB fetches NO ECL operands — it zeroes the six engine
        // condition-flag bytes ([0xc606..0xc60b]; proven to be exactly the IF_EQ/IF_NE/IF_LT/
        // IF_GT flag bytes by the IF dispatcher at 0x14f9, which tests [0xc606+n] per IF opcode),
        // runs a MENU prompt (`lcall 0xe9:0x43` on the fixed menu record at ds:0x2fad), then sets
        // ONLY the EQ flag when the returned choice equals the first-choice key ([0x57c0]) and
        // ONLY the NE flag otherwise. I.e. short PARTY_SURPRISE is a retail YES/NO prompt whose
        // answer lands in the compare flags — which is precisely how the retail scripts use it
        // ("GO DOWN THE STAIRS?" / "OKAY?" / "WANT ONE?" each immediately followed by IF_EQ or
        // IF_NE). The YES-item-first labeling below is the natural reading of those retail
        // prompts; only the labels (not the flag mechanics) rest on it. Gen2 inherits the SAME
        // mechanics: DQK's own dispatch-table handler (DQK.EXE file 0x0330E4, near 2033:13C4,
        // decompile-dqk-ecl-dispatch.md row 0x22) memsets the 4 condition-flag bytes at
        // ds:0xB2F5, runs a prompt call returning AL, then sets ONLY [0xB2F5] (EQ) on the first
        // choice and ONLY [0xB2F6] (NE) otherwise — structurally identical to DoK's handler, so
        // ECL_GEN2's zero-operand PARTY_SURPRISE pauses here too (retail sites: "DO YOU TRY TO
        // MOVE THE LEVER?", "ARE YOU IN NEED OF HELP?" — pinned in dqkEvents.test.ts).
        if (a.length >= 2) {
          this.memory.set(this.addrOf(a[0]), this.partyHasRanger ? 1 : 0);
          this.memory.set(this.addrOf(a[1]), 0);
          this.pc = next;
          return null;
        }
        this.pending = { kind: 'yesNo' };
        this.pc = next;
        this.effects.push({ type: 'menu', style: 'yesno', items: ['YES', 'NO'], ins });
        return { status: 'awaiting-input', effects: this.effects, at: ins };
      }

      case 0x23: { // SURPRISE a,b,c,d -> mem[0x02CB] (COAB CMD_Surprise sub_2771E)
        // Gen1-SHORT dialect (DoK/Treasures/PoD, ECL_GEN1_SHORT's wordSetOverrides[0x23]=0):
        // ZERO operands, and the instruction is script-TERMINAL. DoK's own GAME.OVR handler
        // (file offset 0x3076, build/dok-ecl-dispatch-map.json) fetches no ECL operands at all —
        // it pushes four compiled-in constants (1,0x11,0x26,0x16: the classic Gold Box
        // message-window rectangle, cols 1..0x26, rows 0x11..0x16) to the RedrawView-analog
        // engine export (`0x41:0x8e` far stub) and then TAIL-CALLS the opcode-0x00 CMD_Exit
        // handler. So under the short dialect there is no surprise roll and no [0x02CB] write —
        // the honest model is "redraw text window, then EXIT". Corpus corroboration in
        // ECL_GEN1_SHORT's doc comment (Pool 22/22 clean under the 4-operand frame vs
        // DoK 0/205 / Treasures 6/209 / PoD 9/369). The SAME semantics carry into Gen2:
        // DQK's own dispatch-table handler (DQK.EXE file 0x033122, near 2033:1402,
        // decompile-dqk-ecl-dispatch.md row 0x23) pushes the identical 1,0x11,0x26,0x16
        // message-window rectangle and then near-CALLS the opcode-0x00 EXIT handler (0x031ECE)
        // itself — so ECL_GEN2's zero-operand SURPRISE is script-terminal too (proven 2026-07-23;
        // the dqkEvents.test.ts descriptor-90 golden pins it against retail ECL.GLB bytes).
        if (a.length === 0) {
          this.finished = true;
          return { status: 'exited', effects: this.effects, at: ins };
        }
        const rollD6 = () => {
          const r = nextRand(this.rng);
          this.rng = r.state;
          return (r.value % 6) + 1;
        };
        const arg1 = this.rvalue(a[0]) & 0xff;
        const arg2 = this.rvalue(a[1]) & 0xff;
        const arg3 = this.rvalue(a[2]) & 0xff;
        const arg4 = this.rvalue(a[3]) & 0xff;
        const partyThreshold = signedByte(arg4 + 2 - arg1);
        const monsterThreshold = signedByte(arg2 + 2 - arg3);
        const partyRoll = rollD6();
        const monsterRoll = rollD6();
        let result = 0;
        if (partyRoll <= partyThreshold) {
          result = monsterRoll <= monsterThreshold ? 3 : 1;
        }
        // Verified against COAB listing sub_2771E: this second test overwrites
        // the prior value, so when both checks pass the stored result is 2.
        if (monsterRoll <= monsterThreshold) {
          result = 2;
        }
        this.memory.set(SURPRISE_RESULT_ADDR, result);
        this.effects.push({
          type: 'encounterSurprise',
          surprise: {
            args: [arg1, arg2, arg3, arg4],
            partyThreshold,
            monsterThreshold,
            partyRoll,
            monsterRoll,
            result,
          },
          ins,
        });
        this.pc = next;
        return null;
      }

      case 0x1c: // CLEAR_MONSTERS → empty the pending encounter roster
        this.encounter.length = 0;
        this.pc = next;
        return null;

      case 0x24: // COMBAT → pause; host runs combat against the queued monsters then resume()
        this.pc = next;
        this.lastPauseWasCombat = true;
        this.effects.push({ type: 'combat', monsters: this.encounter.map((m) => ({ ...m })) });
        this.encounter.length = 0;
        return { status: 'combat', effects: this.effects, at: ins };

      case 0x25: // ON_GOTO   selector, count, target_0 … target_{count-1}
      case 0x26: { // ON_GOSUB selector, count, target_0 … target_{count-1}
        // Jump-table dispatch (CONFIRMED against ECL1 block 34's SearchLocation, which indexes
        // by `mapWallRoof & 63`): the selector is 0-based — value v branches to target_v. A
        // selector outside [0,count) takes no branch and falls through (COAB's clamp). 0x8287
        // (= target_0, the open-floor encounter check) proves the 0-based convention.
        const selector = this.rvalue(a[0]);
        const count = a[1]?.word ?? 0;
        const targetOpp = selector >= 0 && selector < count ? a[2 + selector] : undefined;
        if (!targetOpp) {
          this.pc = next; // out-of-range / missing target → no branch
          return null;
        }
        const t = this.targetOffset(targetOpp);
        if (!this.inCode(t)) {
          this.effects.push({ type: 'unhandled', mnemonic: `${ins.mnemonic}(nonlocal)`, opcode: ins.opcode, ins });
          this.pc = next;
          return null;
        }
        if (ins.opcode === 0x26) this.callStack.push(next);
        this.pc = t;
        return null;
      }

      default:
        // Remaining unknown/debug opcodes are surfaced and skipped so the script
        // still runs to completion deterministically.
        this.effects.push({ type: 'unhandled', mnemonic: ins.mnemonic, opcode: ins.opcode, ins });
        this.pc = next;
        return null;
    }
  }

  /**
   * Apply the COAB `CMD_LoadFiles` "Pieces" dispatch (research §3.3) to the three raw
   * operands `[var_3, var_2, var_1]` → the per-set WALLDEF block-id triple `loadDungeonWalls`
   * consumes (0xFF = Reset/empty). Reads the two area flags from VM memory, so it must run
   * *after* the block's `SAVE`s to those flags — which is always the case for a real
   * dungeon-init block (it sets them just before LOAD_PIECES).
   */
  private resolvePieces(operands: [number, number, number]): {
    setBlockIds: [number, number, number];
    operands: [number, number, number];
    twoSet: boolean;
  } {
    const [var3, var2, var1] = operands;
    const twoSet = (this.memory.get(AREA_FIELD_1CE) ?? 0) !== 0 && (this.memory.get(AREA_FIELD_1D0) ?? 0) !== 0;
    let setBlockIds: [number, number, number];
    if (var3 === PIECES_DEFAULT_SET1) {
      // 0x7F special: load WALLDEF block 0 into set 1; sets 2/3 left empty.
      setBlockIds = [PIECES_DEFAULT_SET1, PIECES_RESET, PIECES_RESET];
    } else if (twoSet) {
      // Two-set area: set 1 ← var_3, set 3 ← var_1, set 2 skipped (Reset).
      setBlockIds = [var3, PIECES_RESET, var1];
    } else {
      // Normal three-set area: sets 1/2/3 ← var_3/var_2/var_1 (operand order).
      setBlockIds = [var3, var2, var1];
    }
    return { setBlockIds, operands, twoSet };
  }

  /** Resolve a GOTO/GOSUB target operand to a byte offset within the block. */
  private targetOffset(a: EclOpp): number {
    const w = a.word;
    return w >= this.dialect.vbase ? w - this.dialect.vbase : w; // tolerate already-relative encodings
  }

  /** True if a byte offset is within this block's executable region. */
  private inCode(offset: number): boolean {
    return offset >= this.dialect.headerLen && offset < this.raw.length;
  }

  /**
   * Set the six COAB comparison flags from a value pair (the `CMD_Compare`/`compare_variables`
   * model): slot i is true iff the i-th relation (==,!=,<,>,<=,>=) holds for (left, right).
   * IF_* (0x16..0x1b) then reads `cmpFlags[opcode-0x16]`. COMPARE_AND fills the array directly.
   */
  private setCompareFlags(left: number, right: number): void {
    this.cmpFlags = [
      left === right, // 0x16 IF_EQ
      left !== right, // 0x17 IF_NE
      left < right, //   0x18 IF_LT
      left > right, //   0x19 IF_GT
      left <= right, //  0x1a IF_LE
      left >= right, //  0x1b IF_GE
    ];
  }

  /** Compare packed-inline text with a prior runtime-string SAVE when either side is textual. */
  private compareOperands(left: EclOpp, right: EclOpp): void {
    const leftText = left.text ?? (left.code === 0x81 ? this.strings.get(left.word) : undefined);
    const rightText = right.text ?? (right.code === 0x81 ? this.strings.get(right.word) : undefined);
    if (leftText !== undefined || rightText !== undefined) {
      const equal = leftText !== undefined && rightText !== undefined && leftText === rightText;
      this.cmpFlags = [equal, !equal, false, false, equal, equal];
      return;
    }
    this.setCompareFlags(this.rvalue(left), this.rvalue(right));
  }

  private encounterMovementStats(): { minMovement: number; maxMovement: number } {
    if (this.partyMovements.length === 0) return { minMovement: 0xff, maxMovement: 0 };
    const stats = summarizeByteValues(this.partyMovements);
    return { minMovement: stats.min, maxMovement: stats.max };
  }

  private encounterMenuItems(state: EncounterMenuState): string[] {
    return state.distance === 0 || !state.inDungeon
      ? ['COMBAT', 'WAIT', 'FLEE', 'PARLAY']
      : ['COMBAT', 'WAIT', 'FLEE', 'ADVANCE'];
  }

  private encounterMenuText(state: EncounterMenuState): string | undefined {
    const start = Math.min(Math.max(state.distance, 0), 2);
    for (let i = 0; i < 3; i++) {
      const text = state.texts[(start + i) % 3] ?? '';
      if (text.length > 0) return text;
    }
    return undefined;
  }

  private pauseEncounterMenu(state: EncounterMenuState, includeSetup: boolean): EclRunResult {
    this.pending = { kind: 'encounterMenu', state };
    this.encounterSetup = {
      spriteId: state.spriteId,
      maxDistance: state.maxDistance,
      picId: state.picId,
      distance: state.distance,
    };
    if (includeSetup) {
      this.effects.push({ type: 'encounterSetup', setup: { ...this.encounterSetup }, ins: state.ins });
    }
    const text = this.encounterMenuText(state);
    if (text !== undefined) {
      this.effects.push({ type: 'print', text, clear: state.inDungeon, newline: false });
    }
    this.effects.push({ type: 'menu', style: 'encounter', items: this.encounterMenuItems(state), destAddr: state.destAddr, ins: state.ins });
    return { status: 'awaiting-input', effects: this.effects, at: state.ins };
  }

  private resumeEncounterMenu(value: number): EclRunResult | null {
    if (!this.pending || this.pending.kind !== 'encounterMenu') return null;
    const state = this.pending.state;
    const selected = Math.max(0, Math.min(3, Math.trunc(value)));
    const internal = (state.distance === 0 || !state.inDungeon) && selected === 3 ? 4 : selected;
    const action = state.actionValues[internal] ?? 0;

    let result: number | null = null;
    let nextDistance = state.distance;
    let message: string | undefined;

    const waitOrAdvance = (): void => {
      if (nextDistance > 0) {
        nextDistance -= 1;
      } else {
        message = 'Both sides wait.';
      }
    };

    switch (action) {
      case 0:
        result = internal === 2 && state.minMovement >= state.fleeThreshold ? 2 : 1;
        break;
      case 1:
        if (internal === 0) result = 1;
        else if (internal === 1) message = 'Both sides wait.';
        else if (internal === 2) result = 2;
        else if (internal === 3) waitOrAdvance();
        else if (internal === 4) {
          if (nextDistance > 0) nextDistance -= 1;
          else result = 3;
        }
        break;
      case 2:
        if (internal === 0 && state.monsterFleeThreshold <= state.maxMovement) result = 1;
        else {
          result = 0;
          message = 'The monsters flee.';
        }
        break;
      case 3:
        if (internal === 0) result = 1;
        else if (internal === 1 || internal === 3) waitOrAdvance();
        else if (internal === 2) result = 2;
        else if (internal === 4) {
          if (nextDistance <= 0) result = 3;
          else nextDistance -= 1;
        }
        break;
      case 4:
        if (internal === 0) result = 1;
        else if (internal === 1 || internal === 3 || internal === 4) {
          if (nextDistance <= 0) result = 3;
          else nextDistance -= 1;
        } else if (internal === 2) {
          result = 2;
        }
        break;
      default:
        result = 1;
        break;
    }

    if (result !== null) {
      if (message) this.effects.push({ type: 'print', text: message, clear: true, newline: false });
      this.memory.set(state.destAddr, result & 0xffff);
      this.pending = null;
      return null;
    }

    const nextState: EncounterMenuState = { ...state, distance: Math.max(0, nextDistance) };
    if (nextState.distance !== state.distance) {
      this.encounterSetup = {
        spriteId: nextState.spriteId,
        maxDistance: nextState.maxDistance,
        picId: nextState.picId,
        distance: nextState.distance,
      };
      this.effects.push({ type: 'encounterSetup', setup: { ...this.encounterSetup }, ins: state.ins });
    }
    if (message) this.effects.push({ type: 'print', text: message, clear: true, newline: false });
    return this.pauseEncounterMenu(nextState, false);
  }

  /**
   * COAB boolean query opcodes such as FIND_ITEM and FIND_SPECIAL clear all
   * six flags, then set only EQ on success or only NE on failure.
   */
  private setBooleanCompareFlags(found: boolean): void {
    this.cmpFlags = [found, !found, false, false, false, false];
  }

  private selectedAffects(): ReadonlySet<number> {
    if (this.selectedPartyIndex !== null) {
      return this.partyMemberAffects[this.selectedPartyIndex] ?? new Set<number>();
    }
    return this.selectedPlayerAffects;
  }

  private selectedPlayerPseudoValue(addr: number): number | null {
    if (addr === 0x7d00) return this.selectedPlayerInCombatValue();
    if (addr >= 0x7ca5 && addr <= 0x7cac && this.selectedPartyIndex !== null) {
      return this.partyThiefSkills[this.selectedPartyIndex]?.[addr - 0x7ca5] ?? 0;
    }
    return null;
  }

  private selectedPlayerInCombatValue(): number {
    if (this.selectedPartyNotFound) {
      this.selectedPartyNotFound = false;
      return 0;
    }
    if (this.selectedPartyIndex === null) return 0;
    return (this.partyMemberInCombat[this.selectedPartyIndex] ?? true) ? 1 : 0x80;
  }

  private findPartySpell(spellId: number): { spellIndex: number; playerIndex: number } {
    let playerIndex = 0;
    for (const spellList of this.partySpellLists) {
      const spellIndex = spellList.findIndex((id) => id === spellId);
      if (spellIndex >= 0) return { spellIndex: spellIndex + 1, playerIndex };
      playerIndex++;
    }
    return { spellIndex: 0xff, playerIndex: (playerIndex - 1) & 0xff };
  }

  /** IF_*: execute the next instruction iff the comparison holds, else skip it. */
  private execIf(ins: EclInstruction, next: number): EclRunResult | null {
    const pass = this.cmpFlags[ins.opcode - 0x16] ?? false;
    if (pass) {
      this.pc = next; // fall through → the guarded instruction runs
      return null;
    }
    // Skip the guarded instruction: decode it only to learn its size.
    const guarded = decodeInstructionAt(this.raw, next, this.dialect.vbase, this.dialect);
    this.pc = guarded.ins ? guarded.next : this.raw.length;
    return null;
  }

  /**
   * Arithmetic/logic with the COAB `CMD_AddSubDivMulti` / `CMD_AndOr` operand convention:
   * operands `op1`=arg0, `op2`=arg1, dest=arg2's word; SUBTRACT is `op2 - op1`.
   * AND/OR also refresh compare flags against zero.
   */
  private execArith(ins: EclInstruction): void {
    const a = ins.args;
    const x = this.rvalue(a[0]); // op1
    const y = this.rvalue(a[1]); // op2
    let r: number;
    let logic = false;
    switch (ins.opcode) {
      case 0x04: r = x + y; break; // ADD
      case 0x05: r = y - x; break; // SUBTRACT — op2 − op1 (COAB CMD_AddSubDivMulti)
      case 0x06: { // DIVIDE — quotient to op3, remainder to Area2.field_67E / ECL [0x7F3F] (Gen1;
        // dialect-dependent — see EclDialect.divRemainderAddr).
        // The retail unsigned x86 DIV faults on a zero divisor; do not silently fabricate a
        // quotient/remainder for malformed bytecode.
        if (y === 0) throw new Error('ECL DIVIDE by zero');
        r = Math.trunc(x / y);
        this.memory.set(this.dialect.divRemainderAddr ?? DIV_REMAINDER_ADDR_GEN1_DEFAULT, (x % y) & 0xffff);
        break;
      }
      case 0x07: r = x * y; break; // MULTIPLY
      case 0x2f: r = x & y; logic = true; break; // AND
      case 0x30: r = x | y; logic = true; break; // OR
      default: r = 0;
    }
    r &= 0xffff;
    this.memory.set(this.addrOf(a[2]), r);
    // COAB CMD_AndOr (sub_26DD0): AND/OR are byte results that ALSO set the compare flags vs 0.
    if (logic) this.setCompareFlags(r, 0);
  }
}

/** Legacy synthetic menu-result slot retained for API compatibility; current menu opcodes use their destination operands. */
export const MENU_RESULT_ADDR = 0x10000;
