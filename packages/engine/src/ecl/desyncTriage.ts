/**
 * ECL deep-desync triage (R1, round 34).
 *
 * `walkEclReachable` (reachability.ts) finds every byte offset reachable from a block's five
 * header entries that fails to decode (`EclDesyncSite`) — a bad opcode byte or a truncated
 * operand read. Round 33 published these counts (CoK 33, DoK 72, Secret 40, Buck 195, Matrix 452)
 * as "dialect gaps to close" without asking whether the walker's OWN control-flow rules manufacture
 * some of them: an unconditional `GOSUB`'s static fall-through edge is pushed onto the worklist
 * unconditionally (reachability.ts's own docblock: "a GOSUB returns to its caller eventually; a
 * static walker cannot know where from inside the callee, so RETURN simply ends whichever path
 * reached it") — but the REAL `EclVm` (vm.ts) only resumes at that fall-through offset if the
 * callee's own control flow actually executes a `RETURN`. A callee whose every path dead-ends at
 * `EXIT`/`NEWECL` (or another desync) never returns control there at all: the walker's fall-through
 * edge is live in the static graph but dead at runtime.
 *
 * This module classifies each `EclDesyncSite` by the LAST edge in its (first-discovered) jump-chain
 * path, and — only for `GOSUB:fallthrough` / `ON_GOSUB:fallthrough` edges — asks whether the call's
 * own target(s) can reach a `RETURN`, using the exact same edge rules `walkEclReachable` and
 * `EclVm.exec` use for `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB`/`IF_*` (mirrored here read-only; this
 * module imports `decodeInstructionAt` from disassemble.ts, never reachability.ts's internals,
 * and calls neither module's writer).
 *
 * ONE MORE VM RULE THIS MODULE HONOURS THAT THE STATIC WALKER DOES NOT DISTINGUISH: `EclVm.exec`'s
 * `GOSUB`/`ON_GOSUB` cases check `inCode(target)` (vm.ts :1904, `offset >= headerLen && offset <
 * raw.length` — IDENTICAL to `walkEclReachable`'s own out-of-block test) before pushing a return
 * address. When the target is OUT of the block (a "nonlocal" GOSUB, e.g. a call into a shared
 * runtime routine this block's own bytes never contain), the VM does NOT push a call-stack entry at
 * all — it logs an `unhandled` effect and sets `pc = next` immediately, in the SAME step that
 * decoded the GOSUB. In that case the fall-through is ALWAYS live, unconditionally, regardless of
 * whether any "callee" ever reaches a RETURN (there is no local callee to analyze). See
 * `docs/engine/research/ecl-deep-desync-triage.md` for the byte-traced CoK block-16 example that
 * surfaced this (a GOSUB whose target genuinely IS in-block there, reached, executed, and returned —
 * the nonlocal case is the OTHER branch of the same `inCode` check and is handled here for
 * completeness/correctness, not because that specific example needed it).
 *
 * See docs/engine/research/ecl-deep-desync-triage.md for the corpus census and the verdict: this
 * module's own measurement found EVERY CoK site (33/33) and EVERY Secret site (40/40) — regardless
 * of edge kind — sharing ONE root cause (opcode 0x41 missing from the base Gen1 table), which the
 * dead-fall-through theory does not explain and does not need. See that doc for the full account
 * of why P1 (>= 20/33 dead fall-through) is FALSIFIED at 0/33.
 */
import { decodeInstructionAt, type EclDialect, type EclInstruction } from './disassemble.js';
import type { EclDesyncSite, EclEntryName } from './reachability.js';

const IF_MIN = 0x16;
const IF_MAX = 0x1b;
const EXIT = 0x00;
const GOTO = 0x01;
const GOSUB = 0x02;
const RETURN = 0x13;
const NEWECL = 0x20;
const ON_GOTO = 0x25;
const ON_GOSUB = 0x26;

/**
 * The parent control-flow edge that led the walker to a desync offset, read off the LAST label in
 * `EclDesyncSite.path` (the jump-chain path `walkEclReachable` records for the first discovery of
 * that offset). `'entry'` covers the degenerate case of a bad opcode sitting directly at one of the
 * five header entry points (path has exactly one element: the bare entry name, no `@`).
 */
export type EclDesyncEdgeKind =
  | 'entry'
  | 'GOSUB:target'
  | 'GOSUB:fallthrough'
  | 'ON_GOSUB:target'
  | 'ON_GOSUB:fallthrough'
  | 'IF:taken'
  | 'IF:fallthrough'
  | 'GOTO'
  | 'ON_GOTO'
  | 'straight';

/** Classify a desync site's parent edge from its jump-chain path. Pure string parsing — no bytes. */
export function classifyParentEdge(path: readonly string[]): EclDesyncEdgeKind {
  const last = path[path.length - 1];
  if (last === undefined) return 'entry';
  const at = last.indexOf('@');
  if (at === -1) return 'entry'; // bare entry name, e.g. path === ['searchLocation']
  const prefix = last.slice(0, at);
  const rest = last.slice(at);
  switch (prefix) {
    case 'IF':
      return rest.endsWith(':taken') ? 'IF:taken' : 'IF:fallthrough';
    case 'GOTO':
      return 'GOTO';
    case 'GOSUB':
      return rest.includes(':fallthrough') ? 'GOSUB:fallthrough' : 'GOSUB:target';
    case 'ON_GOTO':
      return 'ON_GOTO';
    case 'ON_GOSUB':
      return rest.includes(':fallthrough') ? 'ON_GOSUB:fallthrough' : 'ON_GOSUB:target';
    default:
      // Any other mnemonic prefix is reachability.ts's default case: `${mnemonic}@offset:fallthrough`
      // — an ordinary, unconditional next-instruction continuation.
      return 'straight';
  }
}

/** Pull the byte offset out of a jump-chain label like `"GOSUB@0x796:fallthrough"` or `"GOSUB@0x796"`. */
function parentOffsetFromLabel(label: string): number | undefined {
  const m = /@0x([0-9a-f]+)/i.exec(label);
  return m ? parseInt(m[1], 16) : undefined;
}

function toOffset(word: number, dialect: EclDialect): number {
  return word >= dialect.vbase ? word - dialect.vbase : word;
}

function inCode(offset: number, raw: Uint8Array, dialect: EclDialect): boolean {
  return offset >= dialect.headerLen && offset < raw.length;
}

function decodeAt(
  raw: Uint8Array,
  offset: number,
  dialect: EclDialect,
  cache: Map<number, EclInstruction | undefined>,
): EclInstruction | undefined {
  if (cache.has(offset)) return cache.get(offset);
  let ins: EclInstruction | undefined;
  if (inCode(offset, raw, dialect)) {
    const dec = decodeInstructionAt(raw, offset, dialect.vbase, dialect);
    if (!dec.badOpcode && dec.ins && !dec.truncated) ins = dec.ins;
  }
  cache.set(offset, ins);
  return ins;
}

/**
 * Forward reachability search, starting at `start`, answering: can control reach a RETURN opcode
 * before every live path dead-ends (EXIT/NEWECL/an undecodable byte/a cycle with no new nodes)?
 * Mirrors `walkEclReachable`'s own edge rules (reachability.ts) exactly — IF_* explores both the
 * taken AND not-taken continuations, GOTO/GOSUB/ON_GOTO/ON_GOSUB follow their real targets (and
 * GOSUB/ON_GOSUB's own fall-through, since a NESTED call's eventual return also continues the
 * search) — but answers a boolean reachability question rather than building a full instruction
 * map, and is bounded (20000 visited offsets) against pathological cycles.
 */
function reachesReturn(
  raw: Uint8Array,
  dialect: EclDialect,
  start: number,
  cache: Map<number, EclInstruction | undefined>,
): boolean {
  const visited = new Set<number>();
  const stack: number[] = [start];
  let budget = 20000;
  while (stack.length > 0 && budget-- > 0) {
    const offset = stack.pop()!;
    if (visited.has(offset)) continue;
    visited.add(offset);
    const ins = decodeAt(raw, offset, dialect, cache);
    if (!ins) continue; // dead end: out-of-block, bad opcode, or truncated read
    if (ins.opcode === RETURN) return true;
    if (ins.opcode === EXIT || ins.opcode === NEWECL) continue;
    const next = offset + ins.size;
    if (ins.opcode >= IF_MIN && ins.opcode <= IF_MAX) {
      stack.push(next); // "taken": the guarded instruction runs, follow it as a normal node
      const guard = decodeAt(raw, next, dialect, cache);
      if (guard) stack.push(next + guard.size); // "not-taken": skip the guarded instruction
      continue;
    }
    switch (ins.opcode) {
      case GOTO:
        stack.push(toOffset(ins.args[0]?.word ?? -1, dialect));
        break;
      case GOSUB:
        stack.push(toOffset(ins.args[0]?.word ?? -1, dialect));
        stack.push(next);
        break;
      case ON_GOTO:
      case ON_GOSUB: {
        const count = ins.args[1]?.word ?? 0;
        for (let i = 0; i < count; i++) {
          const opp = ins.args[2 + i];
          if (opp) stack.push(toOffset(opp.word, dialect));
        }
        if (ins.opcode === ON_GOSUB) stack.push(next);
        break;
      }
      default:
        stack.push(next);
        break;
    }
  }
  return false;
}

/** Result of analyzing one `GOSUB`/`ON_GOSUB` call site whose fall-through is a desync site. */
export interface EclCalleeAnalysis {
  /** Byte offset of the GOSUB/ON_GOSUB instruction itself. */
  callSiteOffset: number;
  /** Every call target the instruction carries (ON_GOSUB can carry several). */
  targets: number[];
  /**
   * True iff at least one in-block target's forward flow can reach a RETURN — the fall-through is
   * then genuinely reachable at runtime via a real call/return, not just by the walker's
   * unconditional static rule.
   */
  reachesReturn: boolean;
  /**
   * True iff at least one target is OUT of this block (`!inCode`) — `EclVm.exec`'s own `inCode`
   * guard (vm.ts) then treats the call as "nonlocal": it never pushes a call-stack entry and falls
   * through in the SAME step, unconditionally. A nonlocal target makes the fall-through live no
   * matter what `reachesReturn` says (there is no local callee to be dead).
   */
  anyNonlocal: boolean;
}

function analyzeCallSite(
  raw: Uint8Array,
  dialect: EclDialect,
  callSiteOffset: number,
  cache: Map<number, EclInstruction | undefined>,
): EclCalleeAnalysis | undefined {
  const ins = decodeAt(raw, callSiteOffset, dialect, cache);
  if (!ins) return undefined;
  const targets: number[] = [];
  if (ins.opcode === GOSUB) {
    targets.push(toOffset(ins.args[0]?.word ?? -1, dialect));
  } else if (ins.opcode === ON_GOSUB) {
    const count = ins.args[1]?.word ?? 0;
    for (let i = 0; i < count; i++) {
      const opp = ins.args[2 + i];
      if (opp) targets.push(toOffset(opp.word, dialect));
    }
  } else {
    return undefined; // the label lied about its own prefix — should not happen
  }
  const anyNonlocal = targets.some((t) => !inCode(t, raw, dialect));
  const anyReturn = targets.some((t) => inCode(t, raw, dialect) && reachesReturn(raw, dialect, t, cache));
  return { callSiteOffset, targets, reachesReturn: anyReturn, anyNonlocal };
}

export type EclDesyncClassification = 'dead-fallthrough' | 'live' | 'indeterminate';

export interface EclDesyncTriageEntry {
  offset: number;
  vaddr: number;
  edgeKind: EclDesyncEdgeKind;
  classification: EclDesyncClassification;
  /** Populated only for `GOSUB:fallthrough` / `ON_GOSUB:fallthrough` edges. */
  callee?: EclCalleeAnalysis;
  entries: readonly EclEntryName[];
  path: readonly string[];
}

/**
 * Classify every desync site the deep walker found in one block. Pure: reads `raw`/`dialect`,
 * never mutates. A site is `'dead-fallthrough'` ONLY when it sits on a `GOSUB:fallthrough` /
 * `ON_GOSUB:fallthrough` edge AND every one of that call's targets is in-block AND none of them can
 * reach a RETURN — i.e. the exact case where the real `EclVm` would never resume at this offset by
 * any call/return sequence. Every other edge kind (`IF:taken`, `IF:fallthrough`, `GOTO`, `ON_GOTO`,
 * `straight`) is a control-flow edge the VM takes UNCONDITIONALLY once the branch is taken (or, for
 * `IF:fallthrough`, whenever the guard is false) — there is no "does it ever return" question to
 * ask, so these are always `'live'`.
 */
export function triageDesyncSites(
  raw: Uint8Array,
  dialect: EclDialect,
  sites: readonly EclDesyncSite[],
): EclDesyncTriageEntry[] {
  const cache = new Map<number, EclInstruction | undefined>();
  return sites.map((site): EclDesyncTriageEntry => {
    const edgeKind = classifyParentEdge(site.path);
    let classification: EclDesyncClassification = 'live';
    let callee: EclCalleeAnalysis | undefined;
    if (edgeKind === 'GOSUB:fallthrough' || edgeKind === 'ON_GOSUB:fallthrough') {
      const last = site.path[site.path.length - 1];
      const callSiteOffset = parentOffsetFromLabel(last);
      if (callSiteOffset === undefined) {
        classification = 'indeterminate';
      } else {
        callee = analyzeCallSite(raw, dialect, callSiteOffset, cache);
        classification = callee && !callee.anyNonlocal && !callee.reachesReturn ? 'dead-fallthrough' : 'live';
        if (!callee) classification = 'indeterminate';
      }
    }
    return {
      offset: site.offset,
      vaddr: site.vaddr,
      edgeKind,
      classification,
      callee,
      entries: site.entries,
      path: site.path,
    };
  });
}

export interface EclDesyncHistogram {
  total: number;
  byEdgeKind: Record<string, number>;
  deadFallthrough: number;
  live: number;
  indeterminate: number;
}

export function histogramDesyncTriage(entries: readonly EclDesyncTriageEntry[]): EclDesyncHistogram {
  const byEdgeKind: Record<string, number> = {};
  let deadFallthrough = 0;
  let live = 0;
  let indeterminate = 0;
  for (const e of entries) {
    byEdgeKind[e.edgeKind] = (byEdgeKind[e.edgeKind] ?? 0) + 1;
    if (e.classification === 'dead-fallthrough') deadFallthrough++;
    else if (e.classification === 'live') live++;
    else indeterminate++;
  }
  return { total: entries.length, byEdgeKind, deadFallthrough, live, indeterminate };
}
