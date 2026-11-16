/**
 * ECL content port (E3.3) — port a Champions/Death-Knights (Gen1) ECL event/dialogue/combat script onto
 * the DQK engine's Gen2 `ECL.GLB` path. Third and final piece of the E3 content port (after E3.1 GEO and
 * E3.2 MON/ITEM); it writes through the E1 HLIB writer.
 *
 * **The "opcode drift" finding — there isn't any in the body.** The Krynn RE pass (C2 + the C4.2b vmRun1
 * work) established that the Gen1 and Gen2 ECL dialects share an **identical** instruction set: the opcode
 * table (0x00–0x40), the operand framing, and the 6-bit packed strings are byte-for-byte the same VM
 * language. **The only dialect difference is the block header** (see `ecl/disassemble.ts`):
 *   - **Gen1 (CoK/DoK):** a 22-byte header = `[0x1388 magic word] + 5 far pointers {segment, vaddr}`.
 *     Code entry is byte 22, vaddr 0x8014, so `vbase = 0x8014 − 22 = 0x7FFE`.
 *   - **Gen2 (DQK):** a 20-byte header = `5 far pointers {segment, vaddr}`, **no magic word**. Code entry
 *     is byte 20, still vaddr 0x8014, so `vbase = 0x8014 − 20 = 0x8000`.
 *
 * **Why the port is just "drop the magic word."** Both dialects map byte offset → virtual address as
 * `vaddr = vbase + offset`. Removing the 2-byte magic shifts every body byte 2 lower (offset k → k−2), but
 * the vbase simultaneously rises by 2 (0x7FFE → 0x8000), so **every virtual address is preserved**: the
 * entry stays 0x8014 and all body vaddrs (the far-pointer targets and the in-code GOTO/GOSUB/string-ref
 * words, which are ≥0x8000 vaddrs) are unchanged. The far-pointer table — the 20 bytes after the magic —
 * is therefore already exactly the Gen2 header, and the bytecode body needs **no** rewriting. So a Gen1
 * block ported to Gen2 is `block.subarray(2)`: strip the magic, keep the far-pointer table and the body
 * verbatim. Proven by disassembling the ported block as Gen2 and getting the same instruction stream (same
 * vaddrs / mnemonics / operands) the Gen1 original yields as Gen1 — see `eclEncode.test.ts`.
 */
import {
  ECL_GEN1,
  ECL_GEN2,
  parseEclHeader,
  decodeInstructionAt,
  type EclDialect,
  type EclInstruction,
} from '../ecl/disassemble.js';
import { KRYNN_GEN1_OPCODES } from '../ecl/opcodes.js';
import { encodeHlibDataLibrary } from './hlibEncode.js';

/** The Gen1 ECL block magic word (`0x1388`, stored little-endian as `88 13`). */
export const ECL_GEN1_MAGIC = 0x1388;

/** A decompressed block looks like a Gen1 ECL block: ≥ a full header and the 0x1388 magic at the front. */
export function sniffGen1EclBlock(raw: Uint8Array): boolean {
  return raw.length >= ECL_GEN1.headerLen && (raw[0] | (raw[1] << 8)) === ECL_GEN1_MAGIC;
}

/**
 * Port a Gen1 (CoK/DoK) decompressed ECL block to the Gen2 (DQK) ECL header dialect — strip the 2-byte
 * 0x1388 magic word; the 20-byte far-pointer table and the bytecode body are kept verbatim (all virtual
 * addresses are preserved — see the module note). Throws if the block is not a Gen1 ECL block.
 */
export function portGen1EclToGen2(block: Uint8Array): Uint8Array {
  if (!sniffGen1EclBlock(block)) {
    throw new Error(`ECL port: not a Gen1 ECL block (need ≥${ECL_GEN1.headerLen} bytes + 0x1388 magic)`);
  }
  return block.slice(2);
}

// ---------------------------------------------------------------------------
// Gen1-long → Gen2 operand-frame transcoding (2026-07-23, cok-m4-fidelity-plan.md §25)
// ---------------------------------------------------------------------------
//
// The header port above is necessary but NOT sufficient: the Gen2 interpreter parses a few
// opcodes with a different operand-frame count than CoK's Gen1-long dialect
// (`ECL_GEN2.wordSetOverrides` — all runtime/handler-disasm proven):
//
//   - `0x0c SETUP_MONSTER`: Gen1-long 3 frames, Gen2 **4** (live handler `25a4:2db1` does
//     `mov al,4; push ax; lcall 2033:0013`). Running a verbatim CoK block on DQK makes the
//     engine swallow the two bytes AFTER SETUP_MONSTER as a bogus 4th frame — on CoK area 34's
//     wandering-encounter route those bytes are the `3a 0d` DELAY+APPROACH pair, which is the
//     desync behind the 16-round combat-init crash investigation.
//   - `0x21 LOAD_FILES`: Gen1-long 3 frames, Gen2 **2**. The dropped third operand is a
//     constant (#255/#127 across the whole CoK corpus) with NO Gen2 consumer — but left
//     verbatim, Gen2 decodes its `00 xx` frame as opcode 0x00 = EXIT, silently terminating the
//     area's init script right after LOAD_FILES.
//   - `0x2c PARLAY` (6 → 4) and `0x1d PARTYSTRENGTH` (1 → 0): the Gen2 forms take FEWER
//     operands with different semantics (PARLAY loses two of the five attitude values;
//     PARTYSTRENGTH loses the threshold compare) — there is no proven semantic mapping, so
//     these are honestly left untranslated and reported (CoK's reachable corpus has 2 PARLAY
//     sites and 0 PARTYSTRENGTH sites).
//
// **The translation must not move any existing byte** — GOTO/GOSUB/ON_GOTO targets and the
// header far pointers are absolute vaddrs. And it must not leave stray bytes on the execution
// path: DQK's dispatcher range check (`cmp ax,0x41; jbe`) sends every out-of-range opcode byte
// to a bare `retf` WITHOUT advancing the stream cursor (canonical `2033:0d28 → 0f45 = CB`), so
// an unknown filler byte would hang the VM refetching itself forever, not skip past. The fix
// shape that satisfies both constraints is a **GOTO trampoline**: overwrite the drifted
// instruction with `GOTO stub` (4 bytes — always fits, the smallest drifted site is 7) and
// zero-fill the remainder (never executed — control has left before those bytes), then append
// the stub at the END of the block (new vaddrs, shifts nothing): the same instruction
// re-encoded with the operand frames the Gen2 interpreter actually parses, followed by
// `GOTO back` to the instruction after the original site. SETUP_MONSTER keeps its three
// original frames verbatim + an appended `00 00` (immediate 0) 4th frame — imm-0 matches the
// dominant native-corpus shape and lands only in the unlocated-consumer global [0xc2e7];
// LOAD_FILES keeps its first two frames verbatim (the third had no Gen2 consumer to lose).

/** One drifted-opcode site rewritten into a GOTO trampoline by {@link transcodeGen1EclBlockToGen2}. */
export interface Gen2TranscodePatch {
  opcode: number;
  /** vaddr of the original (now trampolined) instruction. */
  vaddr: number;
  /** vaddr of the appended re-encoded stub. */
  stubVaddr: number;
}

/** Report of one block's Gen1-long → Gen2 operand-frame transcode. */
export interface Gen2TranscodeReport {
  patched: Gen2TranscodePatch[];
  /** Reachable drifted sites left untouched (no proven semantic mapping, or a structural guard). */
  untranslated: { opcode: number; vaddr: number; reason: string }[];
  /** Bytes appended to the block for trampoline stubs. */
  appendedBytes: number;
}

/**
 * Proven frame-count translations, keyed `opcode:srcFrames->dstFrames`. Only transitions with
 * SEMANTIC evidence get a rule; every other reachable frame-count mismatch between the source
 * dialect and Gen2 is reported untranslated rather than guessed at.
 */
const PROVEN_FRAME_TRANSLATIONS: Readonly<
  Record<string, { keepFrames: number; appendFrames: readonly number[] }>
> = {
  // SETUP_MONSTER long→Gen2: params 1-3 are the same sprite/maxDistance/pic globals in both
  // engines (CoAB CMD_SetupMonster vs DQK 25a4:2db1); the 4th lands in the unlocated-consumer
  // global [0xc2e7], and imm 0 is the dominant native-corpus shape.
  '12:3->4': { keepFrames: 3, appendFrames: [0x00, 0x00] },
  // LOAD_FILES 3→2: operand 0 (GEO block) + operand 1 match; the Gen1 3rd operand is a constant
  // (#255/#127 corpus-wide) that DQK's 2-frame handler never fetches — nothing to lose.
  '33:3->2': { keepFrames: 2, appendFrames: [] },
};

/** Frame count `dialect` parses for `opcode`, or undefined when the opcode doesn't exist there. */
function effectiveWordSet(dialect: EclDialect, opcode: number): number | undefined {
  const def = dialect.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode];
  if (!def) return undefined;
  return dialect.wordSetOverrides?.[opcode] ?? def.wordSet;
}

/** Byte length of one decoded operand frame (2, 3, or 2+len for inline strings). */
function frameByteLength(a: EclInstruction['args'][number]): number {
  if (a.code === 0x80) return 2 + a.high;
  return a.code === 1 || a.code === 2 || a.code === 3 || a.code === 0x81 ? 3 : 2;
}

/**
 * Walk every instruction reachable from a Gen1 block's five header far-pointer roots, following
 * both linear fallthrough and real jump operands (GOTO/GOSUB targets, ON_GOTO/ON_GOSUB trailing
 * target lists), stopping threads only at EXIT/RETURN/bad-opcode — the same rules
 * `eclAreaIdRemap.ts` proved out against the real CoK corpus (28/28 NEWECL sites). Returns the
 * decoded instructions keyed by start offset.
 */
function walkReachableInstructions(raw: Uint8Array, dialect: EclDialect): Map<number, EclInstruction> {
  const header = parseEclHeader(raw, dialect);
  const vbase = dialect.vbase;
  const roots = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ];
  const visited = new Map<number, EclInstruction>();
  const queue: number[] = [];
  for (const vaddr of roots) {
    const off = vaddr - vbase;
    if (off >= 0 && off < raw.length) queue.push(off);
  }
  while (queue.length) {
    let pos = queue.pop()!;
    while (pos < raw.length && !visited.has(pos)) {
      const dec = decodeInstructionAt(raw, pos, vbase, dialect);
      if (dec.badOpcode || !dec.ins) break;
      const ins = dec.ins;
      visited.set(pos, ins);
      let jumpArgs: EclInstruction['args'] = [];
      if (ins.opcode === 0x01 || ins.opcode === 0x02) jumpArgs = ins.args.slice(0, 1); // GOTO/GOSUB
      else if (ins.opcode === 0x25 || ins.opcode === 0x26) jumpArgs = ins.args.slice(2); // ON_GOTO/ON_GOSUB
      for (const a of jumpArgs) {
        if (a.kind === 'word') {
          const t = a.word - vbase;
          if (t >= 0 && t < raw.length && !visited.has(t)) queue.push(t);
        }
      }
      if (ins.opcode === 0x00 || ins.opcode === 0x13) break; // EXIT / RETURN
      if (dec.truncated) break;
      pos = dec.next;
    }
  }
  return visited;
}

/**
 * Port a Gen1-long (CoK) ECL block to Gen2 **including operand-frame transcoding**: the header
 * port of {@link portGen1EclToGen2} plus a GOTO-trampoline rewrite of every reachable
 * SETUP_MONSTER/LOAD_FILES site (see the module note above for why and for the trampoline
 * shape). Every pre-existing byte keeps its offset and vaddr; stubs are appended at the end.
 */
export function transcodeGen1EclBlockToGen2(
  block: Uint8Array,
  sourceDialect: EclDialect = ECL_GEN1,
): {
  block: Uint8Array;
  report: Gen2TranscodeReport;
} {
  const base = portGen1EclToGen2(block); // validates + strips the magic (a fresh copy)
  const reachable = walkReachableInstructions(block, sourceDialect);
  const report: Gen2TranscodeReport = { patched: [], untranslated: [], appendedBytes: 0 };

  // The drifted-opcode set is DIALECT-DEPENDENT: e.g. CoK's long dialect parses SETUP_MONSTER
  // with 3 frames (drifted vs Gen2's 4), while DoK's short dialect already parses 4 (no drift).
  const drifted = (opcode: number): boolean => {
    const src = effectiveWordSet(sourceDialect, opcode);
    const dst = effectiveWordSet(ECL_GEN2, opcode);
    return src !== undefined && dst !== undefined && src !== dst;
  };

  const sites = [...reachable.values()]
    .filter((ins) => drifted(ins.opcode))
    .sort((a, b) => a.offset - b.offset);
  if (sites.length === 0) return { block: base, report };

  const stubs: number[] = [];
  const gen2BaseLen = base.length;
  for (const ins of sites) {
    const srcFrames = effectiveWordSet(sourceDialect, ins.opcode)!;
    const dstFrames = effectiveWordSet(ECL_GEN2, ins.opcode)!;
    const rule = PROVEN_FRAME_TRANSLATIONS[`${ins.opcode}:${srcFrames}->${dstFrames}`];
    if (!rule) {
      report.untranslated.push({
        opcode: ins.opcode,
        vaddr: ins.vaddr,
        reason: 'no proven Gen1→Gen2 semantic operand mapping',
      });
      continue;
    }
    // Structural guards — violations skip the site (leaving today's behavior) rather than risk
    // corrupting an overlapping decode. None fire on the real CoK corpus.
    if (ins.size < 4) {
      report.untranslated.push({ opcode: ins.opcode, vaddr: ins.vaddr, reason: 'site too small for a GOTO' });
      continue;
    }
    let overlap = false;
    for (let p = ins.offset + 1; p < ins.offset + ins.size; p++) {
      if (reachable.has(p)) {
        overlap = true;
        break;
      }
    }
    if (overlap) {
      report.untranslated.push({
        opcode: ins.opcode,
        vaddr: ins.vaddr,
        reason: 'another reachable instruction starts inside this site',
      });
      continue;
    }
    if (ins.args.length < rule.keepFrames) {
      report.untranslated.push({ opcode: ins.opcode, vaddr: ins.vaddr, reason: 'truncated operand list' });
      continue;
    }

    // Stub: opcode + kept original frames (verbatim bytes) + appended frames + GOTO back.
    const stubVaddr = 0x8000 + gen2BaseLen + stubs.length;
    let keptLen = 0;
    for (let i = 0; i < rule.keepFrames; i++) keptLen += frameByteLength(ins.args[i]);
    const stub: number[] = [ins.opcode];
    for (let i = 0; i < keptLen; i++) stub.push(block[ins.offset + 1 + i]);
    stub.push(...rule.appendFrames);
    const retVaddr = ins.vaddr + ins.size;
    stub.push(0x01, 0x01, retVaddr & 0xff, (retVaddr >> 8) & 0xff); // GOTO back
    if (stubVaddr + stub.length > 0x10000) {
      report.untranslated.push({ opcode: ins.opcode, vaddr: ins.vaddr, reason: 'stub vaddr overflow' });
      continue;
    }
    stubs.push(...stub);

    // Site: GOTO stub + zero fill (unreachable — control transfers before these bytes).
    const siteOff = ins.offset - 2; // Gen2 offset (magic stripped)
    base[siteOff] = 0x01;
    base[siteOff + 1] = 0x01;
    base[siteOff + 2] = stubVaddr & 0xff;
    base[siteOff + 3] = (stubVaddr >> 8) & 0xff;
    for (let p = siteOff + 4; p < siteOff + ins.size; p++) base[p] = 0x00;
    report.patched.push({ opcode: ins.opcode, vaddr: ins.vaddr, stubVaddr });
  }

  if (stubs.length === 0) return { block: base, report };
  report.appendedBytes = stubs.length;
  const out = new Uint8Array(gen2BaseLen + stubs.length);
  out.set(base, 0);
  out.set(stubs, gen2BaseLen);
  return { block: out, report };
}

/** One ECL block to place in a Gen2 `ECL.GLB`. `block` is **Gen2** bytes (already ported / native). */
export interface EclGlbEntry {
  /** Logical area id (shared with GEO.GLB / MONCHA.GLB so map + script + bestiary pair by id). */
  id: number;
  block: Uint8Array;
}

/**
 * Build a synthetic **Gen2** ECL block whose only action is `NEWECL #target` — it immediately hands
 * control to area `target`'s script, then `EXIT`. This is the E6.1 new-game entry shim: `DQK.EXE` loads
 * `EclBlockId = 1` on a fresh "Begin Adventuring" (see docs/engine/research/dqk-newgame-entry.md), but a
 * ported CoK/DoK `ECL.GLB` has no area-1 script (CoK's lowest ECL id is 16). Placing this stub at area 1
 * satisfies the engine's hard-coded first load and forwards to the real overland entry — **no DQK.EXE
 * patch needed**.
 *
 * Layout (24 bytes): the 20-byte Gen2 header (five `{segment 0x0101, vaddr}` far pointers, ALL pointing at
 * the entry 0x8014 so any handler dispatch also lands on the forward) + the body `20 00 NN`
 * (`NEWECL #target`) + `00` (EXIT). Byte-faithful to the game: a real CoK `NEWECL #16` is exactly
 * `20 00 10`, and CoK blocks 17/36 literally `NEWECL #16` to reach the overland. `target` must be ≤ 255
 * (every Krynn area id is); a larger value would need the 3-byte word-operand form.
 */
export function makeEclForwardStub(target: number): Uint8Array {
  if (!Number.isInteger(target) || target < 0 || target > 0xff) {
    throw new Error(`makeEclForwardStub: target area id ${target} out of the 0..255 immediate range`);
  }
  const ENTRY = 0x8014;
  const SEGMENT = 0x0101;
  const out = new Uint8Array(24);
  const dv = new DataView(out.buffer);
  for (let slot = 0; slot < 5; slot++) {
    dv.setUint16(slot * 4, SEGMENT, true); // far-pointer segment word
    dv.setUint16(slot * 4 + 2, ENTRY, true); // far-pointer vaddr word → 0x8014
  }
  out[20] = 0x20; // NEWECL
  out[21] = 0x00; // operand code 0x00 = immediate
  out[22] = target; // immediate value (area id)
  out[23] = 0x00; // EXIT
  return out;
}

/** Options for {@link portGen1EclArchiveToGen2}. */
export interface EclArchivePortOptions {
  /**
   * Inject a synthetic new-game entry stub ({@link makeEclForwardStub}) at this area id **when the ported
   * set has no block with it**. Set to 1 for a CoK/DoK→DQK build so `DQK.EXE`'s hard-coded fresh-game
   * `EclBlockId = 1` load resolves and forwards to the real overland (E6.1).
   */
  entryAreaId?: number;
  /** Area the injected stub forwards to (the `NEWECL` target). Defaults to the lowest ported area id. */
  entryForwardsTo?: number;
  /**
   * Observe each block's Gen1 → Gen2 operand-frame transcode report (see
   * {@link transcodeGen1EclBlockToGen2}) — lets a build surface how many SETUP_MONSTER/LOAD_FILES
   * trampolines were emitted and which sites were honestly left untranslated.
   */
  onTranscode?: (areaId: number, report: Gen2TranscodeReport) => void;
  /**
   * The SOURCE game's Gen1 dialect (default {@link ECL_GEN1}, CoK's long form). Determines which
   * opcodes are frame-drifted vs Gen2 — DoK's short dialect (`ECL_GEN1_SHORT`) already matches
   * Gen2 on SETUP_MONSTER/PARTYSTRENGTH/PARTY_SURPRISE/SURPRISE, so only LOAD_FILES (3→2) and
   * PARLAY (1→4, untranslated) drift for it.
   */
  sourceDialect?: EclDialect;
}

/**
 * Decide whether a new-game entry stub must be injected, and where it forwards to. Pure; exported so a
 * build's manifest can report the synthetic entry without re-deriving it. Returns null when no
 * `entryAreaId` is requested, a block with that id already exists, or there is nothing to forward to.
 */
export function planEntryStub(
  ids: number[],
  opts: EclArchivePortOptions,
): { areaId: number; forwardsTo: number } | null {
  if (opts.entryAreaId === undefined || ids.includes(opts.entryAreaId) || ids.length === 0) return null;
  return { areaId: opts.entryAreaId, forwardsTo: opts.entryForwardsTo ?? Math.min(...ids) };
}

/** Build the id-table member: `u16 count`, then `count × {u16 areaId, u16 member}` (member = 1-based slot). */
function encodeIdTable(ids: number[]): Uint8Array {
  const out = new Uint8Array(2 + 4 * ids.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, ids.length, true);
  for (let i = 0; i < ids.length; i++) {
    dv.setUint16(2 + 4 * i, ids[i] & 0xffff, true); // areaId
    dv.setUint16(2 + 4 * i + 2, i + 1, true); // member index (member[0] is this table)
  }
  return out;
}

/**
 * Pack Gen2 ECL blocks into a complete DQK `ECL.GLB`: member[0] = the id table, then one ECL block per
 * entry, all wrapped in an HLIB `DATA` library (`magic=1`) through E1's {@link encodeHlibDataLibrary}.
 * Round-trips through {@link decodeEclGlb}.
 */
export function encodeEclGlb(entries: EclGlbEntry[]): Uint8Array {
  const members: Uint8Array[] = [encodeIdTable(entries.map((e) => e.id))];
  for (const e of entries) members.push(e.block);
  return encodeHlibDataLibrary(members, { tag: 'DATA', magic: 1 });
}

/**
 * Port a whole Gen1 ECL block set onto the DQK engine: convert each block to the Gen2 header dialect,
 * transcode the operand-frame drift ({@link transcodeGen1EclBlockToGen2} — SETUP_MONSTER/LOAD_FILES
 * GOTO trampolines), and pack the lot into an `ECL.GLB`-style HLIB `DATA` library (so script + GEO
 * map + bestiary pair by id). This is what the CoK/DoK → DQK content port emits for the scripts.
 */
export function portGen1EclArchiveToGen2(
  entries: EclGlbEntry[],
  opts: EclArchivePortOptions = {},
): Uint8Array {
  const ported: EclGlbEntry[] = entries.map((e) => {
    const { block, report } = transcodeGen1EclBlockToGen2(e.block, opts.sourceDialect);
    opts.onTranscode?.(e.id, report);
    return { id: e.id, block };
  });
  const inject = planEntryStub(
    entries.map((e) => e.id),
    opts,
  );
  // Prepend the new-game entry stub so DQK.EXE's fresh-start EclBlockId=1 load resolves (E6.1).
  if (inject) ported.unshift({ id: inject.areaId, block: makeEclForwardStub(inject.forwardsTo) });
  return encodeEclGlb(ported);
}
