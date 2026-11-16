/**
 * Static area-id remap for ported Gen1 ECL blocks (round-12/13 id-collision mitigation —
 * `docs/engine/research/cok-m4-fidelity-plan.md` §20/§21). CoK/DoK's own per-disk area-id bands
 * (16–36 / 48–68 / 80–99) were chosen to be disjoint ACROSS THEIR OWN THREE DISKS, but were never
 * checked against DQK's own native-occupied GEO/ECL id space — 3 of CoK's 15 ported GEO areas and 12
 * of its 23 ported ECL areas land on ids a real, native DQK area already uses (round 12, §20.1). This
 * module finds and rewrites the STATIC (immediate-byte) `NEWECL #areaId` cross-references inside a
 * Gen1 ECL block's bytecode body, so shifting a ported area's id (see `buildDqkGame.ts`'s `idOffset`
 * build option) doesn't silently break an in-game area transition that used to target the old, now
 * renumbered id.
 *
 * **Scope / disclosed limitation (round 13's own corpus scan, all 23 CoK ECL areas):** `NEWECL` can
 * address its target either as an immediate byte (`code=0x00`; 28 real occurrences found in CoK's
 * ECL1-3.DAX) or, in exactly one case (CoK `ECL1.DAX` block 16, `NEWECL 0x4c25`), as a WORD operand
 * referencing a runtime VM variable — an INDIRECT jump whose actual area id isn't a literal in the
 * block at all (some other opcode, somewhere else, writes the real target into that variable at
 * runtime). This module only rewrites the immediate form; the one dynamic occurrence is left
 * untouched — there is no single byte to patch, and tracing every write to that variable across the
 * whole game is out of this experiment's bounded scope. Also, only `NEWECL` sites **reachable from
 * the block's 5 header far-pointer entries** are found and rewritten (a real BFS over decoded
 * instructions, not a raw byte-pattern scan, specifically to avoid misinterpreting string/operand
 * data that happens to contain a `0x20` byte as a false-positive NEWECL instruction). The corpus's own
 * `COMPARE; IF_xx; GOTO` idiom proves `GOTO`/`ON_GOTO` are NOT reliably unconditional here (an earlier
 * draft that stopped the linear walk at every `GOTO`, treating it like `EXIT`, silently lost 24 of the
 * 28 real sites — code physically following a `GOTO` is very much still live when the guarding `IF_xx`
 * doesn't hold), so this walk treats only `EXIT`/`RETURN` as true flow terminators and follows BOTH a
 * `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB`'s jump target(s) AND its own linear fallthrough. A `NEWECL`
 * reachable only through some other indirect mechanism (e.g. `CALL`) would still not be found by this
 * walk; none was found in CoK's real corpus, but this is a disclosed gap, not a proven-complete
 * rewrite.
 */
import { ECL_GEN1, parseEclHeader, decodeInstructionAt, type EclInstruction } from '../ecl/disassemble.js';

/** One statically-addressed `NEWECL #imm` site found in a raw Gen1 ECL block. */
export interface NewEclImmediateSite {
  /** Byte offset (within the raw Gen1 block, magic included) of the operand's value byte. */
  valueOffset: number;
  /** The area id currently encoded there (0..255). */
  target: number;
}

/**
 * Find every reachable `NEWECL #imm` site in a raw Gen1 (magic-prefixed) ECL block, via a walk from
 * the block's 5 header far-pointer entries (`vmRun1`/`searchLocation`/`preCampCheck`/
 * `campInterrupted`/`eclInitialEntry`) that follows BOTH linear fallthrough AND genuine control-flow
 * jump operands — GOTO/GOSUB's single target, ON_GOTO/ON_GOSUB's count-driven trailing targets — but
 * NOT every word-kind operand (most opcodes use word-kind operands for VM *variable* addresses, not
 * code addresses; blindly following those desyncs the walk into non-code bytes and yields garbage
 * "instructions" — verified empirically while building this module: an earlier draft that followed
 * every word-kind operand produced a bogus `NEWECL 19493` in CoK ECL1 block 16 that a targeted
 * re-check showed was the block's own real dynamic NEWECL, misread because its operand ISN'T a jump
 * target at all).
 */
export function findReachableNewEclImmediateSites(raw: Uint8Array): NewEclImmediateSite[] {
  const header = parseEclHeader(raw, ECL_GEN1);
  const vbase = ECL_GEN1.vbase;
  const roots = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ];
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const vaddr of roots) {
    const off = vaddr - vbase;
    if (off >= 0 && off < raw.length) queue.push(off);
  }

  const sites: NewEclImmediateSite[] = [];
  while (queue.length) {
    let pos = queue.pop()!;
    while (pos < raw.length && !visited.has(pos)) {
      visited.add(pos);
      const dec = decodeInstructionAt(raw, pos, vbase, ECL_GEN1);
      if (dec.badOpcode || !dec.ins) break;
      const ins: EclInstruction = dec.ins;

      if (ins.opcode === 0x20 /* NEWECL */) {
        const a = ins.args[0];
        // NEWECL has exactly one fixed operand (wordSet: 1, no countAt), so its value byte is always
        // at offset+2 for the immediate form: [opcode][code=0x00][value].
        if (a && a.kind === 'imm') sites.push({ valueOffset: ins.offset + 2, target: a.high });
      }

      // Only follow REAL control-flow jump targets.
      let jumpArgs: EclInstruction['args'] = [];
      if (ins.opcode === 0x01 || ins.opcode === 0x02) jumpArgs = ins.args.slice(0, 1); // GOTO / GOSUB
      else if (ins.opcode === 0x25 || ins.opcode === 0x26) jumpArgs = ins.args.slice(2); // ON_GOTO / ON_GOSUB trailing targets
      for (const a of jumpArgs) {
        if (a.kind === 'word') {
          const t = a.word - vbase;
          if (t >= 0 && t < raw.length && !visited.has(t)) queue.push(t);
        }
      }

      // GOTO is NOT reliably unconditional in this dialect: the real corpus shows the idiom
      // `COMPARE; IF_xx; GOTO target` where `IF_xx` conditionally gates whether the immediately
      // following instruction (here, the GOTO) executes at all — when the condition doesn't hold,
      // execution falls through to whatever comes AFTER the GOTO instead. So both successors of a
      // GOTO/ON_GOTO are potentially live: its jump target(s) (queued above) AND the next instruction
      // in sequence (linear fallthrough, below) — only EXIT/RETURN are true, unconditional flow
      // terminators worth stopping this walk's current linear thread at.
      if (ins.opcode === 0x00 /* EXIT */ || ins.opcode === 0x13 /* RETURN */) break;
      if (dec.truncated) break;
      pos = dec.next;
    }
  }
  return sites;
}

/**
 * Return a copy of `raw` with every reachable `NEWECL #imm` site's target rewritten through
 * `remap` (id → id). Only sites whose CURRENT target actually changes under `remap` are touched — a
 * no-op remap (every site maps to itself) returns `raw` itself, unchanged. Throws if a remapped
 * target doesn't fit the single-byte immediate form (0..255): every real Krynn area id does today,
 * so this should never fire on real data — it is a guard against a silently-wrong shift, not a real
 * code path.
 */
export function remapEclBlockAreaIds(raw: Uint8Array, remap: (id: number) => number): Uint8Array {
  const sites = findReachableNewEclImmediateSites(raw);
  let out: Uint8Array | null = null;
  for (const site of sites) {
    const next = remap(site.target);
    if (next === site.target) continue;
    if (!Number.isInteger(next) || next < 0 || next > 0xff) {
      throw new Error(
        `remapEclBlockAreaIds: NEWECL target ${site.target} -> ${next} doesn't fit the single-byte ` +
          `immediate form (0..255) at raw block offset ${site.valueOffset}`,
      );
    }
    if (!out) out = raw.slice();
    out[site.valueOffset] = next;
  }
  return out ?? raw;
}
