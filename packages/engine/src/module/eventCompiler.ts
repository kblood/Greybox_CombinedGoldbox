/**
 * Event → ECL bytecode compiler (M5.S4 "Event editor + scripting"). Extends the Gen1 message-block
 * encoder `loader.ts` shipped in M5.S1 to the rest of the 35-type FRUA event vocabulary
 * (`module/types.ts` `ModuleEventType`), reusing the SAME real opcode set (`ecl/opcodes.ts`
 * `KRYNN_GEN1_OPCODES`) rather than inventing a bespoke authoring bytecode — ADR-0006 (no separate
 * authoring runtime): an authored event must run through the exact same `EclVm` as a real decoded
 * game's event.
 *
 * Every compiled block's ECL memory is self-contained and stateless between invocations —
 * `loader.ts` gives each triggered event its own fresh `EclVm`/memory, so a `utilities` event's variable only
 * lives for the duration of that one compiled block: set-then-branch *within* the same event works
 * (the "variables/arithmetic/branching" primitive this slice delivers), but persisting a variable
 * *across* separately-triggered events remains unsupported. `ModuleEventRuntime` separately owns
 * source-event once-only/repeat state and its save snapshot; it does not make ECL variables global.
 *
 * Nineteen of the 35 types (shops/temples/taverns/etc.) don't have a shop/NPC/quest data model yet
 * (that's M5.S5 "Database editors"); until then they compile honestly to text + flow control
 * rather than pretending to simulate commerce/dialogue — same pattern as M5.S2b's deferred
 * field-level event decode.
 *
 * Bytecode shape reference (see `ecl/vm.ts` `execIf`): Krynn Gen1 `IF_EQ`..`IF_GE` guard exactly
 * the ONE following instruction (a conditional *skip*, not a jump-to-label) — so a run of
 * `COMPARE/flags-setter ; IF_cc ; <guarded arm>` blocks chained back-to-back, each falling through
 * to the next check when its own guard is false, is a complete N-way branch with no
 * label/forward-reference assembler needed.
 */
import { ECL_GEN1 } from '../ecl/disassemble.js';
import type {
  ChoiceEventBody,
  CombatEventBody,
  CompareOp,
  ChainEventBody,
  GiveTreasureEventBody,
  ModuleEvent,
  ModuleEventType,
  MessageEventBody,
  UtilitiesEventBody,
} from './types.js';

/**
 * Pack ASCII text into the ECL 6-bit inline-string alphabet ({@link decodeEclString}'s inverse):
 * value 0 terminates, 1–31 are ASCII 'A'–'_' (ASCII − 64), and 32–63 map to themselves (space,
 * digits, and punctuation in that ASCII range). Lowercase is upper-cased first; any other
 * character throws rather than silently drop it. The 27–31 tail is load-bearing for retail FRUA:
 * HEIRS.DSN uses '^' in a text substitution line.
 */
export function encodeEclString(text: string): Uint8Array {
  const values: number[] = [];
  for (const ch of text.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 63) values.push(code);
    else if (code >= 65 && code <= 95) values.push(code - 64);
    else throw new Error(`encodeEclString: unsupported character ${JSON.stringify(ch)} in ${JSON.stringify(text)}`);
  }
  values.push(0); // terminator (decodeEclString stops at the first 0 regardless of byte padding)

  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const v of values) {
    acc = (acc << 6) | v;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bits > 0) bytes.push((acc << (8 - bits)) & 0xff);
  return new Uint8Array(bytes);
}

const ENTRY = 0x8014;
const SEGMENT = 0x0101;
const MAGIC = 0x1388;

/** Reserved scratch address for choice-shape events' INPUT_NUMBER reply — safe to reuse across
 * events since each runs in its own fresh `EclVm` memory (see file header). */
const CHOICE_INPUT_ADDR = 0x9800;
/** Base address for `utilities` scripting variables — `variable` (0-255) offsets from here. */
const VARIABLE_BASE = 0x9000;

function pushU16(bytes: number[], v: number): void {
  bytes.push(v & 0xff, (v >> 8) & 0xff);
}

/** 22-byte Gen1 header: 0x1388 magic + five far pointers, all pointing at the code entry 0x8014
 * (mirroring `loaders/eclEncode.ts`'s `makeEclForwardStub`). */
function header(): number[] {
  const bytes: number[] = [];
  pushU16(bytes, MAGIC);
  for (let slot = 0; slot < 5; slot++) {
    pushU16(bytes, SEGMENT);
    pushU16(bytes, ENTRY);
  }
  if (bytes.length !== ECL_GEN1.headerLen) throw new Error('eventCompiler: header length drifted from ECL_GEN1.headerLen');
  return bytes;
}

/** A code-0x00 immediate operand (2 wire bytes) — `EclVm.rvalue` reads it back as `0-255`. */
function opImm(v: number): number[] {
  if (!Number.isInteger(v) || v < 0 || v > 0xff) {
    throw new Error(`eventCompiler: immediate value out of byte range 0-255: ${v}`);
  }
  return [0x00, v];
}

/** A code-0x01 memory-address operand (3 wire bytes) — `EclVm.rvalue`/`addrOf` read/write `addr`. */
function opAddr(addr: number): number[] {
  if (!Number.isInteger(addr) || addr < 0 || addr > 0xffff) {
    throw new Error(`eventCompiler: address out of range 0-65535: ${addr}`);
  }
  return [0x01, addr & 0xff, (addr >> 8) & 0xff];
}

/** A code-0x80 inline packed-string operand, as PRINT already uses for message text. */
function opString(text: string): number[] {
  const packed = encodeEclString(text);
  if (packed.length > 0xff) throw new Error(`eventCompiler: packed text too long (${packed.length} bytes): ${JSON.stringify(text)}`);
  return [0x80, packed.length, ...packed];
}

function emit(bytes: number[], opcode: number, ...operands: number[][]): void {
  bytes.push(opcode);
  for (const op of operands) bytes.push(...op);
}

function clampEventId(id: number): number {
  if (!Number.isInteger(id) || id < 0 || id > 0xff) {
    throw new Error(`eventCompiler: event id out of range 0-255 for NEWECL: ${id}`);
  }
  return id;
}

/** Loader/linker hook for translating a host-visible event id to the one-byte token encoded in
 * NEWECL. Direct compiler callers omit this and retain the historical identity encoding. */
export interface CompileModuleEventOptions {
  encodeChainTarget?: (targetEventId: number) => number;
}

/** NEWECL `target` (chain to another `ModuleEvent.id`) if given, else EXIT. */
function emitChain(bytes: number[], target: number | undefined, opts?: CompileModuleEventOptions): void {
  if (target !== undefined) {
    const encoded = opts?.encodeChainTarget ? opts.encodeChainTarget(target) : target;
    emit(bytes, 0x20, opImm(clampEventId(encoded))); // NEWECL
  }
  else bytes.push(0x00); // EXIT
}

function emitPrintLines(bytes: number[], lines: string[]): void {
  for (const line of lines) emit(bytes, 0x11, opString(line)); // PRINT
}

const IF_OPCODE: Record<CompareOp, number> = { eq: 0x16, ne: 0x17, lt: 0x18, gt: 0x19, le: 0x1a, ge: 0x1b };

/** `COMPARE left,right ; IF_cc ; <guarded: onTrue> ; <fallback: onFalse>` — a complete two-way
 * branch (see file header re: IF_cc as a conditional skip, not a jump). */
function emitCompareBranch(
  bytes: number[],
  left: number[],
  right: number[],
  op: CompareOp,
  onTrue: number | undefined,
  onFalse: number | undefined,
  opts?: CompileModuleEventOptions,
): void {
  emit(bytes, 0x03, left, right); // COMPARE
  emit(bytes, IF_OPCODE[op]); // wordSet 0 — no operands
  emitChain(bytes, onTrue, opts);
  emitChain(bytes, onFalse, opts);
}

function finish(bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

// ---- shape compilers -----------------------------------------------------------------------

/** Text shape (19 of the 35 types, including `message`): print, then optionally chain. */
export function compileTextEvent(body: MessageEventBody, opts?: CompileModuleEventOptions): Uint8Array {
  const bytes = header();
  emitPrintLines(bytes, [body.text, ...(body.additionalTexts ?? [])]);
  emitChain(bytes, body.chainTo, opts);
  return finish(bytes);
}

function assertGiveTreasureInteger(label: string, value: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`eventCompiler: Give Treasure ${label} must be an integer in 0-${max}; got ${value}`);
  }
}

/** Give Treasure compiles only its control-flow carrier. Its explicit FRUA item IDs cannot be
 * represented by ECL TREASURE's ITEM-area-block operand, so ModuleEventRuntime emits the dedicated
 * source-shaped effect before running this block and following its (possibly relocated) chain. */
export function compileGiveTreasureEvent(
  body: GiveTreasureEventBody,
  opts?: CompileModuleEventOptions,
): Uint8Array {
  assertGiveTreasureInteger('platinum', body.platinum, 0x7fffffff);
  assertGiveTreasureInteger('gems', body.gems, 0xffff);
  assertGiveTreasureInteger('jewelry', body.jewelry, 0xffff);
  if (!Array.isArray(body.items) || body.items.length > 8) {
    throw new Error('eventCompiler: Give Treasure items must contain at most 8 source item IDs');
  }
  for (const itemId of body.items) {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 0xff) {
      throw new Error(`eventCompiler: Give Treasure item IDs must be integers in 1-255; got ${itemId}`);
    }
  }
  if (typeof body.itemsIdentified !== 'boolean') {
    throw new Error('eventCompiler: Give Treasure itemsIdentified must be boolean');
  }
  if (body.source) {
    if (body.source.format !== 'frua' || !Number.isSafeInteger(body.source.sourceEventSlot) ||
        body.source.sourceEventSlot <= 0 ||
        typeof body.source.itemDatSourceName !== 'string' || body.source.itemDatSourceName.trim().length === 0 ||
        typeof body.source.itemsDatSourceName !== 'string' || body.source.itemsDatSourceName.trim().length === 0) {
      throw new Error('eventCompiler: Give Treasure source provenance is invalid');
    }
  }
  const bytes = header();
  emitChain(bytes, body.chainTo, opts);
  return finish(bytes);
}

/**
 * Choice shape (11 types): print a prompt plus a 1-based numbered option list, capture the
 * host's reply via INPUT_NUMBER, then chain to the matching option. Compiles to a chain of
 * `COMPARE input,#(i+1) ; IF_EQ ; NEWECL option[i]` triples — a false compare just falls through
 * to the next triple, so N options need no label machinery, only a trailing EXIT for a
 * no-match/out-of-range reply.
 */
export function compileChoiceEvent(body: ChoiceEventBody, opts?: CompileModuleEventOptions): Uint8Array {
  if (body.options.length < 2) throw new Error('eventCompiler: choice events need at least 2 options');
  if (body.options.length > 9) throw new Error('eventCompiler: choice events support at most 9 options (single-digit reply)');
  const bytes = header();
  emitPrintLines(bytes, [body.prompt, ...body.options.map((o, i) => `${i + 1}) ${o.label}`)]);
  // INPUT_NUMBER's retail handler writes through operand 2; operand 1 is parsed but otherwise unused.
  emit(bytes, 0x0f, opImm(0), opAddr(CHOICE_INPUT_ADDR));
  for (let i = 0; i < body.options.length; i++) {
    emit(bytes, 0x03, opAddr(CHOICE_INPUT_ADDR), opImm(i + 1)); // COMPARE input,#(i+1)
    emit(bytes, 0x16); // IF_EQ
    emitChain(bytes, body.options[i].chainTo, opts);
  }
  bytes.push(0x00); // EXIT — reached only if the reply matched no option
  return finish(bytes);
}

/**
 * Combat shape (2 types: `combat`, `pickOneCombat`): queue `monsters`, run COMBAT, then branch on
 * the host's verdict (`EclVm.resume`'s `combatOutcome`) — the "combat-outcome trigger". `resume()`
 * sets the compare flags to `(code, 1)` with victory=1/defeat=0/flee=2, so IF_EQ/IF_LT/IF_GT read
 * back exactly victory/defeat/flee respectively.
 */
export function compileCombatEvent(body: CombatEventBody, opts?: CompileModuleEventOptions): Uint8Array {
  const bytes = header();
  if (body.intro) emitPrintLines(bytes, [body.intro]);
  for (const m of body.monsters) {
    emit(bytes, 0x0b, opImm(m.monsterId), opImm(m.count), opImm(m.picBlockId)); // LOAD_MONSTER
  }
  bytes.push(0x24); // COMBAT
  emit(bytes, 0x16); // IF_EQ (victory: code===1)
  emitChain(bytes, body.onVictory, opts);
  emit(bytes, 0x18); // IF_LT (defeat: code<1, i.e. code===0)
  emitChain(bytes, body.onDefeat, opts);
  emit(bytes, 0x19); // IF_GT (flee: code>1, i.e. code===2)
  emitChain(bytes, body.onFlee, opts);
  bytes.push(0x00); // EXIT fallback (unreachable in practice — outcome is always 0/1/2)
  return finish(bytes);
}

/**
 * Utilities shape (1 type): the variable/arithmetic/branching primitive. `store`/`add`/`subtract`
 * a byte `value` into a numbered scripting `variable`, then optionally COMPARE the new value
 * against a constant and branch two ways.
 */
export function compileUtilitiesEvent(body: UtilitiesEventBody, opts?: CompileModuleEventOptions): Uint8Array {
  const bytes = header();
  const addr = VARIABLE_BASE + (body.variable & 0xff);
  if (body.op === 'store') {
    emit(bytes, 0x09, opImm(body.value), opAddr(addr)); // SAVE value,dest
  } else if (body.op === 'add') {
    emit(bytes, 0x04, opImm(body.value), opAddr(addr), opAddr(addr)); // ADD value,var,var → var += value
  } else {
    emit(bytes, 0x05, opImm(body.value), opAddr(addr), opAddr(addr)); // SUBTRACT value,var,var → var -= value
  }
  if (body.compare) {
    const { op, value, onTrue, onFalse } = body.compare;
    emitCompareBranch(bytes, opAddr(addr), opImm(value), op, onTrue, onFalse, opts);
  } else {
    bytes.push(0x00); // EXIT
  }
  return finish(bytes);
}

/** Chain shape (1 type): pure unconditional flow control. */
export function compileChainEvent(body: ChainEventBody, opts?: CompileModuleEventOptions): Uint8Array {
  const bytes = header();
  emitChain(bytes, body.chainTo, opts);
  return finish(bytes);
}

// ---- dispatch --------------------------------------------------------------------------------

const TEXT_TYPES: ReadonlySet<ModuleEventType> = new Set([
  'message', 'damage', 'trainingHall', 'tavern', 'shop', 'temple', 'guidedTour',
  'addNpc', 'npcSays', 'sounds', 'smallTown', 'vault', 'combatTreasure', 'gainExperience',
  'passTime', 'camp', 'removeNpc', 'tavernTales', 'specialItems',
]);
const CHOICE_TYPES: ReadonlySet<ModuleEventType> = new Set([
  'stairs', 'questionButton', 'transferModule', 'whoTries', 'whoPays', 'enterPassword',
  'questionList', 'teleporter', 'questStage', 'questionYesNo', 'encounter',
]);
const COMBAT_TYPES: ReadonlySet<ModuleEventType> = new Set(['combat', 'pickOneCombat']);

/** Compile one `ModuleEvent` to a real ECL block runnable by `EclVm`. */
export function compileModuleEvent(event: ModuleEvent, opts?: CompileModuleEventOptions): Uint8Array {
  // Retained unsupported boundaries halt in ModuleEventRuntime before their block can run. Keep an
  // inert valid block so older schema-1 packages with a placeholder body remain loadable while the
  // semantic event itself is still represented honestly by `unsupported`.
  if (event.unsupported) return compileChainEvent({});
  if (event.type === 'giveTreasure') {
    return compileGiveTreasureEvent(event.body as GiveTreasureEventBody, opts);
  }
  if (TEXT_TYPES.has(event.type)) return compileTextEvent(event.body as MessageEventBody, opts);
  if (CHOICE_TYPES.has(event.type)) return compileChoiceEvent(event.body as ChoiceEventBody, opts);
  if (COMBAT_TYPES.has(event.type)) return compileCombatEvent(event.body as CombatEventBody, opts);
  if (event.type === 'utilities') return compileUtilitiesEvent(event.body as UtilitiesEventBody, opts);
  if (event.type === 'chain') return compileChainEvent(event.body as ChainEventBody, opts);
  throw new Error(`compileModuleEvent: unsupported event type ${JSON.stringify((event as ModuleEvent).type)}`);
}
