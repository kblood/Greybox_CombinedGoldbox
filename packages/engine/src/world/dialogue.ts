/**
 * Interactive ECL dialogue runner (A5.3) — turns the ECL VM's run/resume lifecycle into a sequence
 * of NPC-dialogue "turns" a UI can present and respond to.
 *
 * A dungeon step-event (or any ECL block) drives the VM through PRINTs, menus, inputs, combats, and
 * block chains. The walk loop used to *auto-drain* such an event with default choices (no player
 * agency). This runner instead exposes each pause as a structured {@link DialogueTurn}: accumulated
 * narrative `text`, plus what the script is waiting for — a list of `choices` to pick (ASK/branch),
 * a queued `combat` roster, a `chain` to another block, or the `end`. The host shows the turn, then
 * calls `choose(value)` (the player's menu pick / input), `afterCombat()` (once the fight is run), or
 * stops. Branching is emergent: the chosen value is what the script's own IF/ON_GOTO reads next, so
 * different picks walk different narrative paths.
 *
 * The runner depends only on a minimal {@link EclMachine} surface (`run` + `resume`), which the real
 * {@link EclVm} satisfies — so it stays pure and is unit-testable against a scripted stub machine.
 */
import type { EclCombatOutcome, EclEffect, EclInputValue, EclRunResult, EncounterMonster, EncounterSetup, EncounterSurprise } from '../ecl/vm.js';
import { primeSearchLocation, primeVmRun1, type SearchLocationOptions } from './dungeonEvents.js';
import { EclVm } from '../ecl/vm.js';

/** The slice of the ECL VM the dialogue runner needs (real `EclVm` and test stubs both satisfy it). */
export interface EclMachine {
  run(): EclRunResult;
  resume(value?: EclInputValue, opts?: { combatOutcome?: EclCombatOutcome }): EclRunResult;
}

/** What the script is currently waiting on at a `say` turn. */
export type DialogueAwait = 'menu' | 'input' | 'who' | 'none';

/** One step of a conversation handed to the UI. */
export type DialogueTurn = (
  /** Narrative text plus, if the script paused for the player, the choices/input it wants. */
  | {
      kind: 'say'; text: string; choices: string[]; prompt?: string; awaiting: DialogueAwait;
      input?: { mode: 'number' | 'string'; destAddr: number; maxLength?: number };
    }
  /** The script queued a fight: the host runs combat against `monsters`, then calls `afterCombat()`. */
  | {
      kind: 'combat';
      text: string;
      monsters: EncounterMonster[];
      setup?: EncounterSetup;
      surprise?: EncounterSurprise;
      /** Scripted pre-combat TREASURE queue; the host offers it only after a victory. */
      treasure?: Extract<EclEffect, { type: 'treasure' }>;
    }
  /** The script wants to continue in another block (`NEWECL`); the host loads it and starts fresh. */
  | { kind: 'chain'; text: string; blockId: number }
  /** The event finished (EXIT / halt). */
  | { kind: 'end'; text: string }
) & {
  /** Most recent retail PICTURE effect emitted with this pause, when the script changed the art. */
  pictureId?: number;
};

/** Join the print effects emitted since the last pause into one normalised narrative string. */
export function collectText(effects: readonly EclEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (e.type === 'print' && e.text) parts.push(e.text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** The last PICTURE in a batch wins, matching the retail interpreter's current-picture register. */
function lastPicture(effects: readonly EclEffect[]): number | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i]!;
    if (effect.type === 'picture') return effect.id;
  }
  return undefined;
}

/** The most recent prompt effect (menu/input/who) decides what a `say` turn is waiting for. */
function lastPrompt(effects: readonly EclEffect[]): {
  awaiting: DialogueAwait;
  choices: string[];
  prompt?: string;
  input?: { mode: 'number' | 'string'; destAddr: number; maxLength?: number };
} {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.type === 'menu') return { awaiting: 'menu', choices: [...e.items], prompt: e.prompt };
    if (e.type === 'input') return {
      awaiting: 'input', choices: [],
      input: { mode: e.mode, destAddr: e.destAddr, ...(e.maxLength !== undefined ? { maxLength: e.maxLength } : {}) },
    };
    if (e.type === 'who') return { awaiting: 'who', choices: [], prompt: e.prompt };
  }
  return { awaiting: 'none', choices: [] };
}

/** The last queued combat roster in this batch of effects. */
function lastCombat(effects: readonly EclEffect[]): EncounterMonster[] {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.type === 'combat') return e.monsters;
  }
  return [];
}

/** The latest encounter setup emitted before/with COMBAT in this VM batch, if the script provided one. */
function lastEncounterSetup(effects: readonly EclEffect[]): EncounterSetup | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.type === 'encounterSetup') return { ...e.setup };
  }
  return undefined;
}

/** The latest surprise roll/result emitted before/with COMBAT in this VM batch, if present. */
function lastEncounterSurprise(effects: readonly EclEffect[]): EncounterSurprise | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]!;
    if (e.type === 'encounterSurprise') return { ...e.surprise, args: [...e.surprise.args] as [number, number, number, number] };
  }
  return undefined;
}

/** The latest scripted treasure queue emitted before COMBAT, if the encounter supplied one. */
function lastTreasure(effects: readonly EclEffect[]): Extract<EclEffect, { type: 'treasure' }> | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i]!;
    if (effect.type === 'treasure') return effect;
  }
  return undefined;
}

export class DialogueRunner {
  private readonly vm: EclMachine;
  private done = false;

  constructor(vm: EclMachine, private readonly onEffects?: (effects: readonly EclEffect[]) => void) {
    this.vm = vm;
  }

  isDone(): boolean {
    return this.done;
  }

  /** Begin the event: run to the first pause and return its turn. */
  start(): DialogueTurn {
    return this.translate(this.vm.run());
  }

  /**
   * Answer a `say` turn with the player's value — a menu index, a typed number, or a chosen-character
   * index — and run on to the next turn. The value becomes what the script reads next (the branch).
   */
  choose(value: EclInputValue = 0): DialogueTurn {
    if (this.done) return { kind: 'end', text: '' };
    return this.translate(this.vm.resume(value));
  }

  /** Resume after the host has run a queued combat, continuing the script. */
  afterCombat(outcome?: EclCombatOutcome): DialogueTurn {
    if (this.done) return { kind: 'end', text: '' };
    return this.translate(this.vm.resume(0, outcome ? { combatOutcome: outcome } : undefined));
  }

  private translate(r: EclRunResult): DialogueTurn {
    this.onEffects?.(r.effects);
    const text = collectText(r.effects);
    const pictureId = lastPicture(r.effects);
    const picture = pictureId === undefined ? {} : { pictureId };
    switch (r.status) {
      case 'combat':
        {
          const setup = lastEncounterSetup(r.effects);
          const surprise = lastEncounterSurprise(r.effects);
          const treasure = lastTreasure(r.effects);
          return {
            kind: 'combat', text, monsters: lastCombat(r.effects),
            ...(setup ? { setup } : {}),
            ...(surprise ? { surprise } : {}),
            ...(treasure ? { treasure } : {}),
            ...picture,
          };
        }
      case 'chain':
        this.done = true; // this block is finished; the host starts a fresh runner on the chained block
        return { kind: 'chain', text, blockId: r.chainBlockId ?? 0, ...picture };
      case 'awaiting-input': {
        const { awaiting, choices, prompt, input } = lastPrompt(r.effects);
        return {
          kind: 'say', text, choices, awaiting,
          ...(prompt !== undefined ? { prompt } : {}), ...(input ? { input } : {}), ...picture,
        };
      }
      case 'exited':
      case 'halted':
      default:
        this.done = true;
        return { kind: 'end', text, ...picture };
    }
  }
}

/**
 * Page a dense retail narrative result at its PRINT boundaries without changing the underlying
 * VM's input/combat semantics. Gen1 cinematic blocks often emit several PICTURE/PRINTCLEAR pairs
 * between their only real menu and combat pause; presenting only the terminal result collapses
 * those scenes and leaves every line under the last picture. Synthetic `awaiting-input` pages have
 * no menu effect, so {@link DialogueRunner} exposes the ordinary single Continue action. The final
 * page retains the VM's real status and is the only page whose answer resumes the wrapped machine.
 */
export class NarrativeDialogueMachine implements EclMachine {
  private pages: EclRunResult[] = [];

  constructor(private readonly machine: EclMachine) {}

  run(): EclRunResult {
    return this.paginate(this.machine.run());
  }

  resume(value: EclInputValue = 0, opts?: { combatOutcome?: EclCombatOutcome }): EclRunResult {
    const queued = this.pages.shift();
    return queued ?? this.paginate(this.machine.resume(value, opts));
  }

  private paginate(result: EclRunResult): EclRunResult {
    const printIndexes = result.effects
      .map((effect, index) => effect.type === 'print' ? index : -1)
      .filter((index) => index >= 0);
    if (printIndexes.length <= 1) return result;

    const pages: EclRunResult[] = [];
    let start = 0;
    for (const end of printIndexes.slice(0, -1)) {
      pages.push({ status: 'awaiting-input', effects: result.effects.slice(start, end + 1) });
      start = end + 1;
    }
    pages.push({ ...result, effects: result.effects.slice(start) });
    this.pages = pages.slice(1);
    return pages[0]!;
  }
}

/**
 * Build a dialogue runner for the event on the cell the party just entered (`backdrop` = the GEO
 * plane-2 byte). Returns null when the block has no SearchLocation handler (no per-step events).
 * Pass a persistent `memory` map to carry area-script state across steps, exactly as the walk loop
 * already does for {@link primeSearchLocation}.
 */
export function dialogueForCell(
  block: Uint8Array,
  backdrop: number,
  opts: SearchLocationOptions = {},
): DialogueRunner | null {
  const vm: EclVm | null = primeSearchLocation(block, backdrop, opts);
  return vm ? new DialogueRunner(vm) : null;
}

/**
 * Build a dialogue runner for the **vmRun1** per-step main loop (the COAB engine runs this every
 * walk step, *before* SearchLocation — see {@link primeVmRun1}). It carries the same drive/resume
 * lifecycle as {@link dialogueForCell}, so the host can drain it identically and read any combat /
 * text effect it produces. Pass the persistent `memory` map so the encounter cooldown (`[0x0097]`)
 * and tickers survive across steps, and seed the party position / facing / cell-descriptor through
 * `opts.seedMemory`. Returns null when the block has no vmRun1 handler.
 */
export function dialogueForVmRun1(
  block: Uint8Array,
  opts: SearchLocationOptions = {},
): DialogueRunner | null {
  const vm: EclVm | null = primeVmRun1(block, opts);
  return vm ? new DialogueRunner(vm) : null;
}
