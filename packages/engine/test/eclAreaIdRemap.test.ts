/**
 * Static area-id remap for ported Gen1 ECL blocks (round-12/13 id-collision mitigation,
 * `cok-m4-fidelity-plan.md` §20/§21). Verifies:
 *
 *  1) Synthetic: a `NEWECL #imm` site reachable from the block's entry is found and rewritten
 *     through a remap function; a no-op remap (target maps to itself) leaves the block byte-identical
 *     (same reference, no allocation); an out-of-range remap throws instead of silently corrupting.
 *  2) A dynamic (word-kind, variable-referenced) NEWECL operand is left untouched by design (it isn't
 *     a literal area id in the block at all).
 *  3) Reachability: a `NEWECL` reachable ONLY via a `GOTO` jump target (not linear fallthrough, which
 *     hits an EXIT first) is still found — proves the walk follows jump targets, not just linear
 *     fallthrough.
 *  4) Real corpus (skip when CoK data absent): scanning every CoK ECL1-3.DAX block finds exactly the
 *     28 real immediate NEWECL cross-references documented in the module's own doc comment, all
 *     targeting other real ported area ids, and zero false positives (garbage targets outside the
 *     ported id set) — the same corpus-wide check that caught (and fixed) two earlier-draft bugs: an
 *     over-eager "follow every word-kind operand" desync, and a wrong "GOTO terminates flow like EXIT"
 *     assumption that silently dropped 24 of the 28 real sites (this dialect's `COMPARE; IF_xx; GOTO`
 *     idiom means a GOTO is often conditionally skipped, so its own fallthrough is live too).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ECL_GEN1,
  readDaxDataBlocks,
  sniffGen1EclBlock,
  findReachableNewEclImmediateSites,
  remapEclBlockAreaIds,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cokDir = resolve(repoRoot, 'Champions of Krynn');
const haveCok = ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX'].every((f) => existsSync(resolve(cokDir, f)));

/** Build a minimal Gen1 ECL block: 0x1388 magic + a 20-byte far-ptr table (entry only) + a body. */
function makeGen1Block(body: number[]): Uint8Array {
  const header = new Uint8Array(ECL_GEN1.headerLen);
  header[0] = 0x88; // magic 0x1388
  header[1] = 0x13;
  header[2 + 4 * 4 + 2] = 0x14; // far-pointer 4 (eclInitialEntry) vaddr word -> 0x8014
  header[2 + 4 * 4 + 2 + 1] = 0x80;
  return Uint8Array.from([...header, ...body]);
}

describe('findReachableNewEclImmediateSites / remapEclBlockAreaIds — synthetic', () => {
  it('finds a NEWECL #imm site at the block entry and remaps it', () => {
    // NEWECL #16 (opcode 0x20, code 0x00 imm, value 16), then EXIT.
    const block = makeGen1Block([0x20, 0x00, 16, 0x00]);
    const sites = findReachableNewEclImmediateSites(block);
    // opcode(headerLen+0) + code(headerLen+1) + value(headerLen+2)
    expect(sites).toEqual([{ valueOffset: ECL_GEN1.headerLen + 2, target: 16 }]);

    const remapped = remapEclBlockAreaIds(block, (id) => (id === 16 ? 116 : id));
    expect(remapped).not.toBe(block); // real copy, source untouched
    expect(remapped[ECL_GEN1.headerLen + 2]).toBe(116);
    // Everything else is byte-identical.
    expect(Array.from(remapped.slice(0, ECL_GEN1.headerLen + 2))).toEqual(
      Array.from(block.slice(0, ECL_GEN1.headerLen + 2)),
    );
    expect(block[ECL_GEN1.headerLen + 2]).toBe(16); // original untouched
  });

  it('a no-op remap (target maps to itself) returns the SAME reference, no copy', () => {
    const block = makeGen1Block([0x20, 0x00, 16, 0x00]);
    const remapped = remapEclBlockAreaIds(block, (id) => id); // identity
    expect(remapped).toBe(block);
  });

  it('a block with no NEWECL at all is untouched', () => {
    const block = makeGen1Block([0x00]); // just EXIT
    expect(findReachableNewEclImmediateSites(block)).toEqual([]);
    expect(remapEclBlockAreaIds(block, (id) => id + 100)).toBe(block);
  });

  it('throws instead of silently corrupting when a remapped target overflows the immediate byte', () => {
    const block = makeGen1Block([0x20, 0x00, 16, 0x00]);
    expect(() => remapEclBlockAreaIds(block, (id) => (id === 16 ? 300 : id))).toThrow(/immediate form/);
  });

  it('leaves a DYNAMIC (word-kind, variable-referenced) NEWECL untouched', () => {
    // NEWECL 0x1234 via code=0x01 (word form): [opcode][code=1][high][val], word=(val<<8)|high.
    const block = makeGen1Block([0x20, 0x01, 0x34, 0x12, 0x00]);
    expect(findReachableNewEclImmediateSites(block)).toEqual([]); // not an 'imm' site
    expect(remapEclBlockAreaIds(block, (id) => id + 100)).toBe(block); // nothing to touch
  });

  it('finds a NEWECL reached only through a GOTO jump target, not fallthrough', () => {
    // entry: GOTO past an immediate EXIT (fallthrough dead-ends there) to a NEWECL reachable only via
    // the jump target itself.
    // offsets (from ECL_GEN1.headerLen): 0 GOTO -> vaddr of offset 5, 4 EXIT (fallthrough stops here),
    // 5 NEWECL #16, EXIT (reached only via the GOTO's own jump target).
    const gotoTargetVaddr = 0x8014 + 5;
    const body = [
      0x01,
      1,
      gotoTargetVaddr & 0xff,
      (gotoTargetVaddr >> 8) & 0xff, // GOTO -> offset 5
      0x00, // EXIT: fallthrough after the GOTO stops here (no site found this way)
      0x20,
      0x00,
      16,
      0x00, // reached only via the jump target: NEWECL #16, EXIT
    ];
    const block = makeGen1Block(body);
    const sites = findReachableNewEclImmediateSites(block);
    expect(sites.map((s) => s.target)).toEqual([16]);
  });
});

describe('findReachableNewEclImmediateSites — real CoK corpus', () => {
  it.skipIf(!haveCok)('finds only real, in-ported-id-space targets across every ECL1-3.DAX block', async () => {
    const portedIds = new Set<number>();
    const perBlockTargets: { disk: number; blockId: number; targets: number[] }[] = [];
    for (let k = 1; k <= 3; k++) {
      const bytes = new Uint8Array(await readFile(resolve(cokDir, `ECL${k}.DAX`)));
      const blocks = readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw));
      for (const b of blocks) {
        portedIds.add(b.blockId);
        const sites = findReachableNewEclImmediateSites(b.raw);
        if (sites.length) perBlockTargets.push({ disk: k, blockId: b.blockId, targets: sites.map((s) => s.target) });
      }
    }
    // 22 real source blocks across ECL1-3.DAX (the build's own reported "22 scripts" — the round-12
    // table's "23" includes the synthetic area-1 new-game entry stub, which isn't a source DAX block).
    expect(portedIds.size, 'CoK ships 22 ported ECL source areas').toBe(22);

    const totalSites = perBlockTargets.reduce((n, e) => n + e.targets.length, 0);
    // 28 -> 30 on 2026-09-04 (round 34 Phase B). Round 34 R1 added opcode 0x41 (wordSet 2) to the
    // base Gen1 table, closing all 33 of CoK's deep decode-desync sites; two NEWECL cross-references
    // that sat DOWNSTREAM of a 0x41 desync became reachable as a result. They are real, not noise:
    // the per-target validity check below -- the same one that once caught a desynced walk landing
    // on a bogus NEWECL 19493 -- passes on all 30, so both new targets are ported area ids.
    // This is the shape to expect from a decode fix: the corpus does not change, the amount of it
    // we can see does.
    expect(totalSites, 'exactly 30 real immediate NEWECL cross-references in CoK').toBe(30);

    // Every found target is a real ported area id -- no garbage/out-of-range value slipped through
    // (this is the check that caught the earlier "follow every word-kind operand" bug: a desynced
    // walk landed on a bogus NEWECL 19493 that isn't a valid area id at all).
    for (const entry of perBlockTargets) {
      for (const t of entry.targets) {
        expect(portedIds.has(t), `disk ${entry.disk} block ${entry.blockId} NEWECL target ${t} is a real ported id`).toBe(
          true,
        );
      }
    }

    // The one known dynamic NEWECL (CoK ECL1 block 16, `NEWECL 0x4c25`) contributes fewer reachable
    // immediate sites than its block's total NEWECL instruction count -- confirms it was excluded, not
    // silently miscounted as zero because the whole block failed to parse.
    const block16 = perBlockTargets.find((e) => e.disk === 1 && e.blockId === 16);
    // [17, 64] -> [17, 17, 64] on 2026-09-04 (round 34 Phase B): a SECOND static `NEWECL 17`
    // became visible once opcode 0x41 was modelled. Block 16 is not an arbitrary block to gain
    // one -- it is the same block whose offset 0x79a round 34 R1 proved is genuinely EXECUTED
    // from cold, by a full GOSUB(0x796 -> 0xdb0 HORIZONTAL_MENU) -> RETURN(0xdd6) -> resume(0x79a)
    // sequence with no scripted memory. Two independent measurements -- a static reachability
    // walk and a VM execution trace -- land on the same bytes, so this is corroboration rather
    // than a golden being moved to match. The dynamic `NEWECL 0x4c25` is still excluded.
    expect(block16?.targets.sort((a, b) => a - b)).toEqual([17, 17, 64]);
  });

  it.skipIf(!haveCok)('remapping with a +100 offset leaves non-NEWECL bytes byte-identical', async () => {
    const bytes = new Uint8Array(await readFile(resolve(cokDir, 'ECL1.DAX')));
    const block = readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw)).find((b) => b.blockId === 34)!;
    const remap = (id: number): number => id + 100;
    const remapped = remapEclBlockAreaIds(block.raw, remap);
    const sites = findReachableNewEclImmediateSites(block.raw);
    expect(sites.length).toBeGreaterThan(0);
    let diffCount = 0;
    for (let i = 0; i < block.raw.length; i++) if (block.raw[i] !== remapped[i]) diffCount++;
    expect(diffCount, 'only the NEWECL value bytes differ').toBe(sites.length);
    for (const s of sites) expect(remapped[s.valueOffset]).toBe(s.target + 100);
  });
});
