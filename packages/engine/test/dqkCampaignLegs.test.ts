/**
 * The Dark Queen of Krynn — campaign-matrix leg byte anchors (Gen2/HLIB).
 *
 * DQK was the last game in the corpus with five un-investigated campaign-matrix legs. A workflow of
 * five finder agents plus five adversarial refuters produced
 * `docs/engine/research/dqk-campaign-legs.md`; **this file exists because agent findings are not
 * evidence.** Every assertion below was re-derived from the retail bytes by hand before being
 * written, and each case is a byte anchor over `DISK3/ECL.GLB` — not a restatement of a scan
 * summary. Where my own re-derivation disagreed with the reported finding, the assertion here
 * follows the bytes and the divergence is recorded in the comment.
 *
 * SCOPE, stated plainly:
 *   - Five legs are anchored: middle (area 31), town (area 4), wilderness (18 -> 5 -> 38),
 *     quest ([0x0187] bit 0x20, areas 55 -> 54) and — as of 2026-08-07 — ending (area 66 -> 67,
 *     cases G and H).
 *   - The `ending` leg was `blocked` through two prior rounds. Its finder claimed `proven`; the
 *     refuter downgraded it, correctly at the time, and one of the finder's citations had
 *     fabricated provenance (`0x0032` appears nowhere in `dungeonEvents.ts`, which I verified
 *     directly). What finally resolved it was neither agent's reading: `[0x0032]` is not a story
 *     flag at all but the facing wall type, and the ending arm does not consult it. See case G.
 *   - These are STATIC byte anchors plus, where it costs nothing, structural arithmetic. They are
 *     deliberately NOT full VM route goldens. The sharpest engine gap that blocked route goldens —
 *     `DIV_REMAINDER_ADDR` hardcoded to Gen1's `0x7f3f` while Gen2 reads its remainder from ECL
 *     data offset `0x0029`, proved by the middle leg's bit helper in case D — has since been fixed
 *     (`EclDialect.divRemainderAddr`); case F now pins the byte rather than declaring a gap.
 *   - NO native/DOSBox-X evidence is used or implied anywhere in this file.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEclGlb, decodeGen2GeoArchive, decodeHlib } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const eclGlb = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');
const geoGlb = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');
const haveRetail = existsSync(eclGlb) && existsSync(geoGlb);

/** Gen2 code window: vaddr 0x8000 maps to member offset 0. */
const off = (vaddr: number) => vaddr - 0x8000;

let cache: Map<number, Uint8Array> | null = null;
async function areas(): Promise<Map<number, Uint8Array>> {
  if (cache) return cache;
  const arch = decodeEclGlb(new Uint8Array(await readFile(eclGlb)), 'ECL.GLB');
  cache = new Map([...arch.idToMember].map(([id, m]) => [id, arch.members[m]!]));
  return cache;
}

const hex = (raw: Uint8Array, vaddr: number, len: number) =>
  [...raw.slice(off(vaddr), off(vaddr) + len)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

/** The Gold Box 6-bit packed-string codec (MSB-first; 0 terminates; 1..31 -> +64). */
function decode6(bytes: Uint8Array): string {
  let acc = 0;
  let bits = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      const v = (acc >> bits) & 0x3f;
      if (v === 0) return out;
      out += String.fromCharCode(v >= 1 && v <= 31 ? v + 64 : v);
    }
  }
  return out;
}

/**
 * Alignment-free raw sweep for operands naming a literal address. Only operand codes 1/2/3/0x81
 * carry a 16-bit address; codes 0 and 0x80 carry a single byte and cannot name one. This is
 * deliberately alignment-FREE so it cannot be desynced by an opcode-table error — the same
 * truncation-immune method `pools-ending-route.md` uses for its guard-word census.
 */
function literalRefs(raw: Uint8Array, addr: number): number[] {
  const lo = addr & 0xff;
  const hi = (addr >> 8) & 0xff;
  const hits: number[] = [];
  for (let i = 0; i < raw.length - 2; i += 1) {
    if ((raw[i] === 1 || raw[i] === 2 || raw[i] === 3 || raw[i] === 0x81) && raw[i + 1] === lo && raw[i + 2] === hi) {
      hits.push(i + 0x8000);
    }
  }
  return hits;
}

describe.skipIf(!haveRetail)('DQK campaign-matrix legs — retail byte anchors', () => {
  it('A. the archive shape the other cases rest on', async () => {
    const map = await areas();
    expect(map.size).toBe(47);
    // Every area cited below is present.
    for (const id of [4, 5, 18, 31, 54, 55]) expect(map.has(id)).toBe(true);
  });

  // ------------------------------------------------------------------------------- TOWN (area 4)
  it('B. TOWN — Palanthas: a real 7-service menu whose destination is read back by its dispatch', async () => {
    const a4 = (await areas()).get(4)!;

    // 0x2b HORIZONTAL_MENU: destination operand, count operand, then `count` inline packed strings.
    expect(hex(a4, 0x82d0, 6)).toBe('2b 01 bf 00 00 07');
    let p = off(0x82d0) + 1;
    const dest = a4[p + 1]! | (a4[p + 2]! << 8);
    p += 3;
    const count = a4[p + 1]!;
    p += 2;
    expect(dest).toBe(0x00bf);
    expect(count).toBe(7);

    const items: string[] = [];
    for (let i = 0; i < count; i += 1) {
      expect(a4[p]).toBe(0x80); // inline packed string
      const len = a4[p + 1]!;
      p += 2;
      items.push(decode6(a4.slice(p, p + len)));
      p += len;
    }
    // A canonical Gold Box town service list. This is what makes area 4 a TOWN rather than a
    // dungeon pane, and it is decoded from the retail bytes, not asserted from a doc.
    expect(items).toEqual(['PALACE', 'TEMPLE', 'HALL', 'SHOP', 'INN', 'BAR', 'LEAVE']);

    // The menu's operands consume exactly up to the dispatch — no gap, no overlap.
    expect(p + 0x8000).toBe(0x82fe);

    // 0x25 ON_GOTO reads the SAME cell the menu wrote, with a matching arm count. That mutual
    // reference is the discriminating fact: a mis-framed menu cannot produce it.
    expect(hex(a4, 0x82fe, 6)).toBe('25 01 bf 00 00 07');
    let q = off(0x82fe) + 1;
    const selector = a4[q + 1]! | (a4[q + 2]! << 8);
    q += 3;
    const arms = a4[q + 1]!;
    q += 2;
    expect(selector).toBe(dest);
    expect(arms).toBe(count);

    const targets: number[] = [];
    for (let i = 0; i < arms; i += 1) {
      targets.push(a4[q + 1]! | (a4[q + 2]! << 8));
      q += 3;
    }
    expect(targets).toEqual([0x8319, 0x860f, 0x8648, 0x8655, 0x85d6, 0x8689, 0x87cb]);
    // Seven labels, seven arms, all inside the area's own code window.
    for (const t of targets) expect(t).toBeGreaterThanOrEqual(0x8000);
  });

  // ------------------------------------------------------------------- QUEST (areas 55 -> 54)
  it('C. QUEST — [0x0187] bit 0x20 has exactly one setter, in a different area from its reader', async () => {
    const map = await areas();

    // The setter: area 55 ORs bit 0x20 into [0x0187].
    expect(hex(map.get(55)!, 0x80dd, 9)).toBe('30 01 87 01 00 20 01 87 01');
    // The reader: area 54 masks the SAME bit out of the SAME word into a scratch cell, then
    // compares it and branches. Two different areas — this is the cross-area link the leg needs.
    expect(hex(map.get(54)!, 0x977f, 9)).toBe('2f 01 87 01 00 20 01 bf 00');
    expect(hex(map.get(54)!, 0x9788, 7)).toBe('03 01 bf 00 00 00 17'); // COMPARE [0x00BF],#0 ; IF_NE

    // CORPUS-WIDE CENSUS over all 47 areas, alignment-free. Exactly two areas name [0x0187] at all.
    const touching = [...map].filter(([, raw]) => literalRefs(raw, 0x0187).length > 0).map(([id]) => id);
    expect(touching.sort((a, b) => a - b)).toEqual([54, 55]);

    // IMPORTANT QUALIFICATION, found while verifying and NOT in the original finding: [0x0187] is a
    // shared BITFIELD, not a single flag. Enumerate every OR-write (opcode 0x30) of an immediate
    // into it, corpus-wide, and the bits are distinct. "Sole setter of the WORD" would be FALSE;
    // "sole setter of the BIT" is what is true, and it is what this leg rests on.
    const orWrites: Array<[number, number, number]> = []; // [areaId, vaddr, bitMask]
    for (const [id, raw] of map) {
      for (const v of literalRefs(raw, 0x0187)) {
        const i = off(v) - 1;
        // 0x30 OR: <op> <src=[0x0187]> <imm> <dst>; the immediate follows the 3-byte src operand.
        if (raw[i] === 0x30 && raw[i + 4] === 0x00) orWrites.push([id, v - 1, raw[i + 5]!]);
      }
    }
    const bits = orWrites.map(([, , m]) => m).sort((a, b) => a - b);
    expect(bits).toEqual([0x01, 0x04, 0x08, 0x10, 0x20, 0x40, 0x40, 0x40, 0x80]);
    // Bit 0x20 is written exactly once, and only by area 55.
    const setters20 = orWrites.filter(([, , m]) => m === 0x20);
    expect(setters20).toHaveLength(1);
    expect(setters20[0]![0]).toBe(55);
    expect(setters20[0]![1]).toBe(0x80dd);

    // Negative control on the clear side: area 54 carries an AND clear-mask, but 0xBF preserves
    // bit 0x20 (it clears 0x40). So nothing in the corpus ever clears this bit.
    expect(hex(map.get(54)!, 0x8b24, 9)).toBe('2f 01 87 01 00 bf 01 87 01');
    expect(0xbf & 0x20).toBe(0x20);

    // DECLARED LIMIT: this census matches operands naming the address LITERALLY. Opcode 0x35
    // SAVE_TABLE writes a COMPUTED base+offset and would be INVISIBLE here — the same caveat the
    // Pools quest leg carries. See case D, which exhibits exactly such a computed write.
  });

  // ------------------------------------------------------- WILDERNESS (area 18 -> 5 -> 38)
  it('D. WILDERNESS — area 18 exits into the single overland hub, which fans out to ten areas', async () => {
    const map = await areas();

    // Area 18's exit into the overland map.
    expect(hex(map.get(18)!, 0x85a8, 3)).toBe('20 00 05'); // NEWECL #5

    // Area 5 carries a CONTIGUOUS crossing table. Enumerate every immediate NEWECL in area 5.
    const a5 = map.get(5)!;
    const newecl: Array<[number, number]> = [];
    for (let i = 0; i < a5.length - 2; i += 1) {
      if (a5[i] === 0x20 && a5[i + 1] === 0x00) newecl.push([i + 0x8000, a5[i + 2]!]);
    }
    // Ten crossings clustered in 0xa3df..0xa551, plus one outlier at 0xae32.
    const table = newecl.filter(([v]) => v >= 0xa3df && v <= 0xa551);
    expect(table).toHaveLength(10);
    expect(table.map(([, id]) => id)).toEqual([18, 22, 38, 26, 30, 46, 50, 58, 62, 54]);
    // The cited crossing.
    expect(hex(a5, 0xa40c, 3)).toBe('20 00 26'); // NEWECL #38
    // Every destination is a real area in the archive — the fan-out is not pointing at nothing.
    for (const [, id] of table) expect(map.has(id)).toBe(true);

    // DECLARED OVERLAP, asserted rather than narrated: this leg necessarily transits area 5, which
    // is ALREADY the matrix's proven `early` leg. DQK ships exactly one overland hub, so the
    // overlap is structural and unavoidable, not a shortcut. The two legs rest on different
    // evidence in that area (early = the campInterrupted ZOMBIE encounter; wilderness = this
    // crossing table), but a reviewer applying a strict "no shared area id" rule should downgrade
    // this leg. The gate outcome is unchanged either way, because `ending` fails regardless.
    expect(map.has(5)).toBe(true);
  });

  // ------------------------------------------------------------------------------ MIDDLE (area 31)
  it('E. MIDDLE — area 31 fires a real COMBAT and consumes it through a generic set-bit helper', async () => {
    const a31 = (await areas()).get(31)!;

    // 0x24 COMBAT, then the victory branch, then the consume.
    expect(hex(a31, 0x92ef, 16)).toBe('24 17 01 01 ec a4 09 00 1c 01 bf 00 02 01 3b a4');
    //  0x92ef 24                COMBAT
    //  0x92f0 17                IF_NE
    //  0x92f1 01 01 ec a4       GOTO 0xa4ec
    //  0x92f5 09 00 1c 01 bf 00 SAVE #28 -> [0x00BF]      <- the bit NUMBER, not a mask
    //  0x92fb 02 01 3b a4       GOSUB 0xa43b              <- the generic set-bit helper

    // The helper at 0xa43b, decoded byte by byte. This is what makes the consume verifiable.
    expect(hex(a31, 0xa43b, 46)).toBe(
      '06 01 bf 00 00 08 01 bf 00 ' + //            DIV  [0x00BF] #8      -> [0x00BF]
        '09 03 29 00 01 c2 00 ' + //                SAVE (code 3, 0x0029) -> [0x00C2]
        '2a 01 4c 01 01 bf 00 01 c0 00 ' + //       TABLE base 0x014C idx [0x00BF] -> [0x00C0]
        '2a 01 dc a4 01 c2 00 01 c1 00 ' + //       TABLE base 0xA4DC idx [0x00C2] -> [0x00C1]
        '30 01 c0 00 01 c1 00 01 c0 00', //         OR   [0x00C0],[0x00C1] -> [0x00C0]
    );
    //  06 [0x00BF] #8 -> [0x00BF]              DIV bit# by 8            = byte index
    //  09 (code 3, 0x0029) -> [0x00C2]         read the DIV REMAINDER   = bit index within the byte
    //  2a base 0x014C idx [0x00BF] -> [0x00C0] read the bitfield byte
    //  2a base 0xA4DC idx [0x00C2] -> [0x00C1] read the bit-mask table
    //  30 OR [0x00C0],[0x00C1] -> [0x00C0]     set the bit
    //  (followed by 0x35 SAVE_TABLE, which writes back to a COMPUTED address)
    expect(a31[off(0xa43b) + 46]).toBe(0x35); // SAVE_TABLE writes it back

    // The mask table the helper indexes is the eight single-bit values, in order.
    expect(hex(a31, 0xa4dc, 8)).toBe('01 02 04 08 10 20 40 80');

    // The arithmetic the consume performs, stated explicitly so it cannot be hand-waved:
    // bit 28 -> byte 28/8 = 3, bit 28%8 = 4 -> mask 0x10, address 0x014C + 3 = 0x014F.
    expect(Math.floor(28 / 8)).toBe(3);
    expect(28 % 8).toBe(4);
    expect(a31[off(0xa4dc) + (28 % 8)]).toBe(0x10);
    expect(0x014c + Math.floor(28 / 8)).toBe(0x014f);

    // HONEST QUALIFICATION, and a correction to the reported finding, which stated the consume as
    // "[0x014F] |= 0x10" as though it were a literal write. It is not: the write is SAVE_TABLE to a
    // COMPUTED address, so [0x014F] is never NAMED anywhere in area 31. The arithmetic above is
    // sound and the address is right, but the fact is DERIVED, not a literal byte. This is exactly
    // the census blind spot declared in case C.
    expect(literalRefs(a31, 0x014f)).toEqual([]);
    // The bitfield BASE, by contrast, is named literally — five times.
    expect(literalRefs(a31, 0x014c)).toEqual([0xa44c, 0xa46d, 0xa485, 0xa4a6, 0xa4be]);
  });

  // ------------------------------------------------------------------ the engine gap this exposed
  it('F. the Gen2 div-remainder address is 0x0029 (now modelled by the VM)', async () => {
    const a31 = (await areas()).get(31)!;
    // The helper reads its remainder through operand code 3 naming address 0x0029, immediately
    // after the DIV. Gen1's remainder lives at 0x7f3f, which `vm.ts` used to hardcode for BOTH
    // dialects. That is now dialect-aware (`EclDialect.divRemainderAddr`, set to 0x0029 on
    // ECL_GEN2), so this case pins the byte the fix was derived from rather than a gap.
    expect(hex(a31, 0xa444, 7)).toBe('09 03 29 00 01 c2 00'); // SAVE (code 3, 0x0029) -> [0x00C2]
  });

  // ------------------------------------------------------------------------------ the ending leg
  //
  // This leg was `blocked` on a single claim: that nothing in the corpus ever arms host word
  // [0x0032], the value that gates most of area 66's content arms. That claim was TRUE and
  // IRRELEVANT — [0x0032] is not a latch at all. DQK.EXE's ECL operand resolver intercepts
  // address 0x32 in a class-0 special-address table (`25a4:0897`, values at DQK.EXE file
  // 0x040BB3) and dispatches it to `25a4:099c` = `a0 f3 c9` (`mov al,[0xc9f3]`) — the wall type
  // of the map edge the party is facing, recomputed from the GEO planes on every move and turn.
  // The write path (`25a4:06d2`, table at file 0x0409E8) has NO entry for 0x32, so the four
  // corpus `SAVE #0,[0x0032]` sites are dead stores against a byte the read path never consults.
  //
  // Cross-check that settles it independently of any disassembly judgement: the same table maps
  // ECL [0x002d] -> [0xc9f4], and 0x002d is the Gen2 `cellDescAddr` this project established
  // years earlier from a completely different direction. [0xc9f0/f1/f2/f3/f4] is the
  // X/Y/facing/wallType/cellDescriptor block — the same 5-tuple already located for DoK.
  //
  // And the ending does not depend on any of it: the terminal arm is not [0x0032]-gated.
  it('G. ending — area 66 dispatches on cellDescriptor & 0x7F and its terminal arm chains ECL #67', async () => {
    const a = await areas();
    const a66 = a.get(66)!;

    // The dispatcher: AND #0x7F, [0x002d] -> [0x009B], then ON_GOTO [0x009B] with 15 arms.
    expect(hex(a66, 0x8669, 9)).toBe('2f 00 7f 01 2d 00 01 9b 00'); // AND #0x7F,[0x002d]->[0x009B]
    expect(hex(a66, 0x8672, 6)).toBe('25 01 9b 00 00 0f'); // ON_GOTO [0x009B], #15
    // Arm 14 (the 15th target) is the terminal arm at 0x9D18. Targets are 3-byte operand
    // frames (`01 lo hi`), not bare words.
    const armBase = off(0x8672) + 6;
    expect(hex(a66, 0x8672 + 6 + 14 * 3, 3)).toBe('01 18 9d');
    const arm14 = a66[armBase + 14 * 3 + 1]! | (a66[armBase + 14 * 3 + 2]! << 8);
    expect(arm14).toBe(0x9d18);

    // The terminal arm: gated ONLY on the [0x00A0] step counter, then NEWECL #67.
    //   03 01 a0 00 00 ff   COMPARE [0x00A0], #255
    //   16                  IF_EQ
    //   01 01 2a 9d         GOTO 0x9D2A   (the [0x009A]==4 variant scene — not this leg's claim)
    //   02 01 03 9f         GOSUB 0x9F03
    //   20 00 43            NEWECL #67
    expect(hex(a66, 0x9d18, 21)).toBe(
      '03 01 a0 00 00 ff 16 01 01 2a 9d 02 01 03 9f 20 00 43 03 01 9a',
    );
    // No [0x0032] operand anywhere in the arm's own guard chain (the `01 32 00` operand form).
    const arm = a66.slice(off(0x9d18), off(0x9d27));
    expect([...arm].some((_, i) => arm[i] === 0x01 && arm[i + 1] === 0x32 && arm[i + 2] === 0x00))
      .toBe(false);

    // ECL #67 exists and is the finale: Takhisis on her throne before the portal.
    const a67 = a.get(67);
    expect(a67).toBeDefined();
    // PRINTCLEAR frames are `12 80 <len>` (opcode, operand code 0x80 = inline packed
    // string, length byte), so the packed text starts 3 bytes in.
    expect(decode6(a67!.slice(off(0x804f) + 3))).toContain('HUGE GOLDEN BELL');
    expect(decode6(a67!.slice(off(0x80bd) + 3))).toContain('A WOMAN SITS ON A BURNISHED THRONE');
    // Its own initial_entry carries the same saturating counter, and its four non-init entries
    // all point at one stub (0x9654) — i.e. area 67 is a cutscene, not an explorable map.
    expect(hex(a67!, 0x8038, 12)).toBe('03 01 a0 00 00 ff 16 01 01 5b 96 09');
  });

  it('H. ending — the arm-14 cell is 38 steps from area 66\'s scripted landing pose', async () => {
    const a66 = (await areas()).get(66)!;

    // Area 66's initial_entry writes the party pose TWICE, and only the second one is the
    // landing. 0x8055 sets (29,21) purely to stage the 17-frame "YOU FIND YOURSELVES FALLING
    // BETWEEN WORLDS" animation loop (0x8095..0x80AD); 0x80B1 then sets (6,21) immediately
    // before "THE BLACK MAGE" / "WELCOME TO THE ABYSS.". Write addresses per DQK.EXE's ECL
    // write table (0x0034 = X, 0x0035 = Y, 0x0011 = facing).
    expect(hex(a66, 0x8055, 18)).toBe(
      '09 00 1d 01 34 00 09 00 15 01 35 00 09 00 00 01 11 00', // X=29 Y=21 facing=0 (transient)
    );
    expect(hex(a66, 0x80b1, 18)).toBe(
      '09 00 06 01 34 00 09 00 15 01 35 00 09 00 00 01 11 00', // X=6  Y=21 facing=0 (landing)
    );

    const bytes = new Uint8Array(await readFile(geoGlb));
    const maps = decodeGen2GeoArchive(decodeHlib(bytes, 'GEO.GLB').rawMembers, 'GEO');
    const g66 = maps.find((m) => m.id === 66)!;
    // Retail header order is (height, width): raw[0]=22 rows, raw[1]=34 columns. Getting this
    // backwards transposes the map, and the ECL's own X=29 write is out of range under the
    // transposed reading — an independent check on the header order.
    expect([g66.map.width, g66.map.height]).toEqual([34, 22]);

    // Exactly one cell selects arm 14 (descriptor & 0x7F == 14).
    const arm14Cells = g66.map.cells
      .map((c, i) => ({ i, d: c.floor }))
      .filter(({ d }) => (d & 0x7f) === 14);
    expect(arm14Cells).toHaveLength(1);
    const { width: W, height: H, cells } = g66.map;
    const target = arm14Cells[0]!.i;
    expect([target % W, Math.floor(target / W)]).toEqual([27, 4]);

    // Walk the real wall graph with the Explorer's own blocking rule (a wall blocks unless
    // the edge carries a door flag). The graph is DIRECTED — Gold Box wall slots are
    // one-sided — so this is a forward search from the landing pose, not a reverse one.
    const steps: [number, number, 'north' | 'east' | 'south' | 'west'][] = [
      [0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west'],
    ];
    const bfs = (startX: number, startY: number): Map<number, number> => {
      const start = startY * W + startX;
      const dist = new Map<number, number>([[start, 0]]);
      const queue = [start];
      while (queue.length) {
        const i = queue.shift()!;
        const x = i % W, y = Math.floor(i / W);
        for (const [dx, dy, dir] of steps) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const c = cells[i]!;
          if (c.walls[dir] !== 0 && (c.doors?.[dir] ?? 0) === 0) continue;
          const j = ny * W + nx;
          if (!dist.has(j)) { dist.set(j, dist.get(i)! + 1); queue.push(j); }
        }
      }
      return dist;
    };

    // The landing pose reaches the ending cell in 38 steps, well inside the [0x00A0] budget
    // (seeded 210 at 0x85BE, +1 per search_location, terminal arm fires while it is < 255).
    const fromLanding = bfs(6, 21);
    expect(fromLanding.get(target)).toBe(38);
    expect(fromLanding.size).toBe(629);

    // HONEST NOTE, and the reason the transient pose is pinned above: the map has several
    // disjoint regions, and the ANIMATION pose (29,21) sits in a 110-cell one that cannot
    // reach the ending cell at all. If the two writes were ever read as alternative branches
    // rather than as a sequence, this leg would look unreachable. Asserted so it stays honest.
    const fromTransient = bfs(29, 21);
    expect(fromTransient.size).toBe(110);
    expect(fromTransient.has(target)).toBe(false);
  });
});
