/**
 * ECL reachability census (R1, round 33).
 *
 * `disassembleSubroutine`/`disassembleEclBlock` (disassemble.ts) are a LINEAR scan: they start at
 * one offset (by convention, header entry 4 — `eclInitialEntry`, vaddr 0x8014) and stop at the
 * first `EXIT` or end-of-block. Every "N of M blocks reach a clean EXIT" census built on top of
 * that scan is therefore a LOWER BOUND: it never visits header entries 0-3 (`vmRun1`,
 * `searchLocation`, `preCampCheck`, `campInterrupted`), and it never follows a `GOTO`/`GOSUB`/
 * `ON_GOTO`/`ON_GOSUB` target, so it cannot see a subroutine placed after the first `EXIT` — the
 * exact blind spot that let a plausible-looking Treasures `0x37` override pass a 30-block shallow
 * census and then crash the real VM three rounds ago (see disassemble.ts's `0x37` retraction note
 * and this module's own test file for the reproduction).
 *
 * `walkEclReachable` replaces that lower bound with a worklist walk seeded from all FIVE header
 * entry points, decoding with the SAME `decodeInstructionAt` the VM itself calls (owned by
 * disassemble.ts — this module adds no opcode semantics of its own), and following control flow:
 *
 *   - `IF_*` (0x16-0x1b) makes the NEXT instruction conditional (mirrors `EclVm.execIf`, vm.ts
 *     :2042): the guarded instruction's own start is pushed for normal processing (the "taken"
 *     branch), AND — independently — the offset immediately after the guarded instruction is
 *     pushed too (the "not-taken" branch), regardless of what opcode the guarded instruction turns
 *     out to be. A guarded `GOTO`/`EXIT`/`RETURN`/`NEWECL` therefore does not end exploration: its
 *     own fall-through stays live because the comparison could go either way.
 *   - An unguarded `GOTO` ends the current path and enqueues its target.
 *   - `GOSUB`/`ON_GOSUB` enqueue their target(s) AND continue the current path at the
 *     fall-through (a `GOSUB` returns to its caller eventually; a static walker cannot know where
 *     from inside the callee, so `RETURN` simply ends whichever path reached it).
 *   - `ON_GOTO` enqueues every one of its `count` targets and ends the path (unlike `ON_GOSUB`, it
 *     has no fall-through in the VM's own semantics — see vm.ts :1775-1797).
 *   - `EXIT`/`RETURN`/`NEWECL` end the path.
 *   - A bad opcode, or a truncated read (ran out of block mid-operand — `decodeInstructionAt`'s
 *     `truncated` flag), is recorded as a DESYNC SITE with the jump-chain path that reached it,
 *     and is not decoded further.
 *   - A jump target outside `[dialect.headerLen, raw.length)`, or landing strictly inside an
 *     already-decoded instruction's byte span (not on its start), is recorded as MISALIGNED
 *     rather than followed — the walker never guesses at a resync point.
 *
 * All five entries share ONE global worklist, processed in ascending byte-offset order, and one
 * shared decode cache (`instructions`)/desync registry — NOT five isolated per-entry walks. This
 * matters for correctness, not just efficiency: a target from entry B that lands inside an
 * instruction entry A already decoded must be recognised as mid-instruction regardless of which
 * entry found it first, and a single shared cache is what makes that comparison global. Each
 * worklist item still carries its own originating entry name, so per-entry coverage (how many
 * offsets each entry's OWN traversal reaches, including through a merge with another entry's
 * territory) is exact, not an approximation keyed to "whichever entry got there first".
 *
 * See docs/engine/research/ecl-census-reachability.md for the corpus census, the VM oracle
 * (`executed ⊆ reachable`), the positive control and the mutation tests.
 *
 * KNOWN LIMITATION (documented, not fixed this round): candidate offsets are processed in
 * ascending order specifically so a target discovered after a lower offset has already been
 * decided is checked against every instruction decided so far (catching most mid-instruction
 * collisions). It cannot catch the reverse, pathological case — an instruction decoded at offset
 * X commits before a separate, not-yet-discovered instruction at some offset P < X is later found
 * to overlap X's span. Resolving that in general requires a fixed-point/backtracking disassembler,
 * out of scope for this item; the oracle test is what actually decides whether this limitation
 * bites any real corpus block (it does not, on the Pools/Treasures fixtures measured this round).
 */
import { decodeInstructionAt, parseEclHeader, type EclDialect, type EclInstruction, type EclOpp } from './disassemble.js';

const IF_MIN = 0x16;
const IF_MAX = 0x1b;
const EXIT = 0x00;
const GOTO = 0x01;
const GOSUB = 0x02;
const RETURN = 0x13;
const NEWECL = 0x20;
const ON_GOTO = 0x25;
const ON_GOSUB = 0x26;

/** The five `EclHeader` far-pointer slots, in header order. */
const ENTRY_NAMES = ['vmRun1', 'searchLocation', 'preCampCheck', 'campInterrupted', 'eclInitialEntry'] as const;
export type EclEntryName = (typeof ENTRY_NAMES)[number];

/** A byte offset the walk could not decode: a bad opcode or a truncated (ran-past-end) read. */
export interface EclDesyncSite {
  /** Byte offset of the failing decode attempt. */
  offset: number;
  vaddr: number;
  /** Jump-chain label path that reached this offset (first path discovered). */
  path: string[];
  /** Every header entry point whose walk reaches this site. */
  entries: EclEntryName[];
}

/** A jump target the walker declined to follow. */
export interface EclMisalignedTarget {
  target: number;
  reason: 'out-of-block' | 'mid-instruction';
  /** Jump-chain label path that produced this target (first occurrence). */
  path: string[];
  /** Every header entry point whose walk produced this target. */
  entries: EclEntryName[];
}

export interface EclReachabilityOptions {
  /**
   * Mutation-test hook (see eclReachability.test.ts): when true, an `IF_*` opcode's guarded
   * instruction is treated as the ONLY live continuation — the not-taken fall-through past it is
   * never enqueued. This is expected to shrink the reachable set and make the VM oracle's
   * `executed ⊆ reachable` bar fail on the Treasures fixture (proving the real rule is
   * load-bearing, not decorative).
   */
  disableIfGuardFallthrough?: boolean;
}

export interface EclReachabilityResult {
  /** Every instruction the walk decoded, keyed by byte offset. */
  instructions: Map<number, EclInstruction>;
  reachableOffsets: Set<number>;
  desyncSites: EclDesyncSite[];
  misalignedTargets: EclMisalignedTarget[];
  /** Per-header-entry-point reachable-offset counts (that entry's own full traversal size). */
  coverageByEntry: Record<EclEntryName, number>;
  /** Sum of every reached instruction's byte size. */
  reachableBytes: number;
  /**
   * Bytes in `[dialect.headerLen, raw.length)` that are non-zero and not covered by any reached
   * instruction — an upper bound on "block content the walk never explains" (zero bytes are
   * excluded because padding/reset regions are typically zero-filled and would otherwise dominate
   * this count without being evidence of anything).
   */
  unreachedNonZeroBytes: number;
}

function toOffset(word: number, dialect: EclDialect): number {
  // Tolerate already-relative encodings, matching EclVm's own targetOffset (vm.ts).
  return word >= dialect.vbase ? word - dialect.vbase : word;
}

function targetOffset(a: EclOpp, dialect: EclDialect): number {
  return toOffset(a.word, dialect);
}

interface WorkItem {
  offset: number;
  path: string[];
  entry: EclEntryName;
}

/**
 * Walk every instruction reachable from all five `EclHeader` entry points of one ECL block,
 * following jumps and honouring the `IF_*` guard rule. See the module docblock for the exact
 * rules and `docs/engine/research/ecl-census-reachability.md` for the corpus census this backs.
 */
export function walkEclReachable(
  raw: Uint8Array,
  dialect: EclDialect,
  opts: EclReachabilityOptions = {},
): EclReachabilityResult {
  const header = parseEclHeader(raw, dialect);
  const entryOffsets: Record<EclEntryName, number> = {
    vmRun1: toOffset(header.vmRun1, dialect),
    searchLocation: toOffset(header.searchLocation, dialect),
    preCampCheck: toOffset(header.preCampCheck, dialect),
    campInterrupted: toOffset(header.campInterrupted, dialect),
    eclInitialEntry: toOffset(header.eclInitialEntry, dialect),
  };

  const instructions = new Map<number, EclInstruction>();
  const desyncOffsets = new Set<number>();
  const desyncMap = new Map<number, EclDesyncSite>();
  const misalignedMap = new Map<string, EclMisalignedTarget>();
  const reachedByEntry = new Map<number, Set<EclEntryName>>();
  const coverageByEntry = {} as Record<EclEntryName, number>;
  for (const name of ENTRY_NAMES) coverageByEntry[name] = 0;

  const addEntryTo = (list: EclEntryName[], name: EclEntryName) => {
    if (!list.includes(name)) list.push(name);
  };
  const recordDesync = (offset: number, path: string[], entry: EclEntryName) => {
    const existing = desyncMap.get(offset);
    if (existing) addEntryTo(existing.entries, entry);
    else desyncMap.set(offset, { offset, vaddr: dialect.vbase + offset, path, entries: [entry] });
  };
  const recordMisaligned = (
    target: number,
    reason: 'out-of-block' | 'mid-instruction',
    path: string[],
    entry: EclEntryName,
  ) => {
    const key = `${target}:${reason}`;
    const existing = misalignedMap.get(key);
    if (existing) addEntryTo(existing.entries, entry);
    else misalignedMap.set(key, { target, reason, path, entries: [entry] });
  };
  const isMidInstruction = (offset: number): boolean => {
    for (const ins of instructions.values()) {
      if (offset > ins.offset && offset < ins.offset + ins.size) return true;
    }
    return false;
  };

  const worklist: WorkItem[] = [];
  const push = (offset: number, note: string, base: string[], entry: EclEntryName) =>
    worklist.push({ offset, path: [...base, note], entry });

  for (const name of ENTRY_NAMES) {
    const start = entryOffsets[name];
    if (start < dialect.headerLen || start >= raw.length) {
      // An invalid/unimplemented entry pointer is metadata, not executed code — recorded as
      // misaligned so per-entry coverage still accounts for it, never as a desync (nothing was
      // ever decoded at it).
      recordMisaligned(start, 'out-of-block', [name], name);
      continue;
    }
    worklist.push({ offset: start, path: [name], entry: name });
  }

  // (offset, entry) pairs already expanded — prevents reprocessing the same entry's own
  // rediscovery of a node it has already visited (e.g. a loop back to an earlier GOTO target).
  const seenPairs = new Set<string>();

  while (worklist.length) {
    // Ascending-offset processing across ALL entries together — see the module docblock's
    // "KNOWN LIMITATION" note for what this does and does not guarantee.
    let minIdx = 0;
    for (let i = 1; i < worklist.length; i++) if (worklist[i].offset < worklist[minIdx].offset) minIdx = i;
    const { offset, path, entry } = worklist.splice(minIdx, 1)[0];

    const pairKey = `${offset}:${entry}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    if (desyncOffsets.has(offset)) {
      recordDesync(offset, path, entry);
      continue;
    }
    if (!instructions.has(offset)) {
      if (offset < dialect.headerLen || offset >= raw.length) {
        recordMisaligned(offset, 'out-of-block', path, entry);
        continue;
      }
      if (isMidInstruction(offset)) {
        recordMisaligned(offset, 'mid-instruction', path, entry);
        continue;
      }
      const dec = decodeInstructionAt(raw, offset, dialect.vbase, dialect);
      if (dec.badOpcode || !dec.ins || dec.truncated) {
        desyncOffsets.add(offset);
        recordDesync(offset, path, entry);
        continue;
      }
      instructions.set(offset, dec.ins);
    }
    const ins = instructions.get(offset)!;
    let reachedSet = reachedByEntry.get(offset);
    if (!reachedSet) {
      reachedSet = new Set<EclEntryName>();
      reachedByEntry.set(offset, reachedSet);
    }
    if (!reachedSet.has(entry)) {
      reachedSet.add(entry);
      coverageByEntry[entry]++;
    }

    const next = offset + ins.size;
    const op = ins.opcode;
    const hex = (n: number) => `0x${n.toString(16)}`;

    if (op >= IF_MIN && op <= IF_MAX) {
      // The guarded instruction's own start is pushed for NORMAL processing (decoded, registered
      // and its own control flow followed, on the "taken" branch). Independently, unless the
      // fall-through rule is disabled, the offset past the guarded instruction is pushed too — the
      // "not-taken" branch, live no matter what opcode the guarded instruction turns out to be.
      push(next, `IF@${hex(offset)}:taken`, path, entry);
      if (!opts.disableIfGuardFallthrough) {
        const guard = decodeInstructionAt(raw, next, dialect.vbase, dialect);
        if (!guard.badOpcode && guard.ins && !guard.truncated) {
          push(guard.next, `IF@${hex(offset)}:fallthrough`, path, entry);
        }
        // Guarded instruction itself undecodable: the VM's execIf sends the not-taken pc past
        // end-of-block (vm.ts :2050) — the path simply ends, nothing to enqueue.
      }
      continue;
    }

    switch (op) {
      case EXIT:
      case RETURN:
      case NEWECL:
        break; // path ends
      case GOTO:
        push(targetOffset(ins.args[0], dialect), `GOTO@${hex(offset)}`, path, entry);
        break;
      case GOSUB:
        push(targetOffset(ins.args[0], dialect), `GOSUB@${hex(offset)}`, path, entry);
        push(next, `GOSUB@${hex(offset)}:fallthrough`, path, entry);
        break;
      case ON_GOTO:
      case ON_GOSUB: {
        const count = ins.args[1]?.word ?? 0;
        for (let i = 0; i < count; i++) {
          const opp = ins.args[2 + i];
          if (!opp) continue;
          push(targetOffset(opp, dialect), `${ins.mnemonic}@${hex(offset)}[${i}]`, path, entry);
        }
        if (op === ON_GOSUB) push(next, `ON_GOSUB@${hex(offset)}:fallthrough`, path, entry);
        break;
      }
      default:
        push(next, `${ins.mnemonic}@${hex(offset)}:fallthrough`, path, entry);
        break;
    }
  }

  const reachableOffsets = new Set(instructions.keys());
  let reachableBytes = 0;
  for (const ins of instructions.values()) reachableBytes += ins.size;

  const covered = new Uint8Array(raw.length);
  for (const ins of instructions.values()) {
    for (let i = ins.offset; i < ins.offset + ins.size && i < raw.length; i++) covered[i] = 1;
  }
  let unreachedNonZeroBytes = 0;
  for (let i = dialect.headerLen; i < raw.length; i++) {
    if (!covered[i] && raw[i] !== 0) unreachedNonZeroBytes++;
  }

  return {
    instructions,
    reachableOffsets,
    desyncSites: Array.from(desyncMap.values()),
    misalignedTargets: Array.from(misalignedMap.values()),
    coverageByEntry,
    reachableBytes,
    unreachedNonZeroBytes,
  };
}
