/**
 * Treasures of the Savage Frontier's third `8X8D` wall-tile sub-format — pins the REAL,
 * checkable structural facts found while investigating it, PLUS (round 3, this file's
 * final section) the now-solved pixel decode.
 *
 * `8X8D1.DAX`'s 12 blocks use a header `dax.ts`'s existing `parseTileSet`/`parseTileStrip`
 * detectors correctly decline (a genuinely different field layout from CoK/DoK's own
 * `8X8D*.DAX`, not a parser bug). Rounds 1-2 left them at `kind: 'complex'`; round 3
 * (`../src/loaders/daxTreasures8x8dTile.ts`) solved the DGROUP lookup-table construction
 * AND found the real payload uses a simpler, table-free "mode 2" verbatim-copy path, so
 * `decodeDax` now decodes all 12 blocks for real — see that module's doc comment and
 * `docs/engine/research/treasures-8x8d1-thirdformat.md` round 3 for the full derivation.
 *
 * Per this project's "UNLOCATED beats invention" rule, the structural-facts section below
 * still asserts only byte-arithmetic facts (unchanged from rounds 1-2); the final section
 * asserts the round-3 decode itself, including the still-open gaps (index 0..15 color is
 * unresolved and rendered black only for inspection, not a proven palette entry).
 *
 * Real-bytes-gated (`existsSync`): skips cleanly when the Treasures GOG install isn't
 * present, same convention as every other Gateway/Treasures test in this project.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDaxDataBlocks, decodeDax } from '../src/loaders/dax.js';
import { parseTreasures8x8dTile, treasures8x8dTileToIndexedImage } from '../src/loaders/daxTreasures8x8dTile.js';
import { createHash } from 'node:crypto';

const treasuresDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const haveTreasures = existsSync(resolve(treasuresDir, '8X8D1.DAX'));
const haveExecutables =
  existsSync(resolve(treasuresDir, 'GAME.OVR')) && existsSync(resolve(treasuresDir, 'GAME.EXE'));

function loadBlocks(file: string) {
  const bytes = new Uint8Array(readFileSync(resolve(treasuresDir, file)));
  return readDaxDataBlocks(bytes);
}

const EXPECTED_BLOCK_IDS = [1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const CONSTANT_HEADER = [0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x20, 0x6f];

describe('Treasures 8X8D1.DAX third sub-format — structural facts only (no decode)', () => {
  it.skipIf(!haveTreasures)('has 12 blocks, all decompressing to exactly 16818 bytes', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    expect(blocks.map((b) => b.blockId)).toEqual(EXPECTED_BLOCK_IDS);
    for (const blk of blocks) {
      expect(blk.raw.byteLength, `block ${blk.blockId}`).toBe(16818);
    }
  });

  it.skipIf(!haveTreasures)('shares a constant 10-byte header across every block, diverging at byte 10', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    for (const blk of blocks) {
      expect(Array.from(blk.raw.subarray(0, 10)), `block ${blk.blockId} header`).toEqual(
        CONSTANT_HEADER,
      );
    }
    // block 1 vs block 2: identical through byte 126, differ at byte 127 (both proven this
    // session — see the research doc's fact 4).
    const b1 = blocks[0].raw;
    const b2 = blocks[1].raw;
    expect(Array.from(b1.subarray(0, 127))).toEqual(Array.from(b2.subarray(0, 127)));
    expect(b1[127]).not.toBe(b2[127]);
  });

  it.skipIf(!haveTreasures)('every block has real, distinct content past the header (12 unique MD5s)', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    const hashes = new Set(blocks.map((b) => createHash('md5').update(b.raw).digest('hex')));
    expect(hashes.size).toBe(12);
  });

  it.skipIf(!haveTreasures)(
    'block 1 has a real (non-random) low-byte-value (<=0x3F) run of exactly 338 bytes right after the header',
    () => {
      const blocks = loadBlocks('8X8D1.DAX');
      const raw = blocks[0].raw;
      let i = 10;
      while (i < raw.byteLength && raw[i] <= 0x3f) i++;
      expect(i - 10).toBe(338);
      expect(raw[i]).toBe(0x45); // the first byte that breaks the run
    },
  );

});

/**
 * Executable-oracle facts (2026-07-21, round 2) — resolves the two far-call targets the
 * prior round's `GAME.OVR` dispatcher trace left UNLOCATED (segments `0xa77`/`0x229`,
 * blocked on VROOMM overlay-segment routing). New finding: NEITHER segment is a VROOMM
 * overlay-descriptor selector at all (both `tools/vroomm_layout.py`'s strict stub-geometry
 * classifier and `tools/gen1_map.py`'s legacy resolver independently reject them as
 * out-of-range/unresolvable) — they are literal, static references into `GAME.EXE`'s own
 * always-resident code, addressable directly as `file_offset = GAME.EXE's MZ header size
 * (512 bytes) + segment*16 + offset`. That formula, applied to segment `0x229` offset
 * `0x1350` (the call the prior round flagged as "the strongest candidate for the actual
 * pixel unpack/blit routine"), lands on ~700 bytes of clean, non-garbage x86 containing
 * literal VGA segment constants (`0xA000`, `0xA200`) and a `row * 320` address calculation
 * (`mov dx,0x140; mul dx` — 0x140 = 320, the VGA mode-13h scanline stride) — strong,
 * checkable evidence this is a real VGA linear-framebuffer blit routine, not noise.
 * Segment `0xa77` offset `0x1aaf` (pushed as the byte-count parameter right before the
 * call) is itself a recursive call BACK into `0xa77:0x1aaf`'s own sibling entry used
 * elsewhere as a 3-argument (src far ptr, dst far ptr, count) copy — matching Pascal's
 * `System.Move` calling convention exactly.
 *
 * This test pins the raw byte-level facts only (fixed file offsets containing fixed byte
 * sequences) — it does NOT decode any pixel data and makes no claim about the row-table
 * layout inside the raw 8X8D1.DAX payload (still genuinely unresolved — see the research
 * doc's "What remains unresolved" section, updated this round).
 */
describe('Treasures GAME.EXE/GAME.OVR executable-oracle facts — byte fingerprints only (no pixel decode)', () => {
  const gameOvrPath = resolve(treasuresDir, 'GAME.OVR');
  const gameExePath = resolve(treasuresDir, 'GAME.EXE');

  // GAME.OVR: the 8x8d resource dispatcher (VROOMM descriptor 37, ovr_file_offset 0x4bb1a)
  // makes two far calls whose raw encoded (offset, segment) operands are these exact bytes.
  const DISPATCHER_OVR_OFFSET = 0x4bb1a;
  const MOVE_LCALL_CODE_OFFSET = 460; // -> file 0x4bce6
  const DRAW_LCALL_CODE_OFFSET = 483; // -> file 0x4bcfd

  it.skipIf(!haveExecutables)(
    'GAME.OVR: descriptor 37 dispatcher calls 0xa77:0x1aaf (Move) then 0x229:0x1350 (draw)',
    () => {
      const ovr = new Uint8Array(readFileSync(gameOvrPath));
      const moveCallAt = DISPATCHER_OVR_OFFSET + MOVE_LCALL_CODE_OFFSET;
      const drawCallAt = DISPATCHER_OVR_OFFSET + DRAW_LCALL_CODE_OFFSET;
      // 0x9A = LCALL opcode; operand is offset:u16 then segment:u16, little-endian.
      expect(Array.from(ovr.subarray(moveCallAt, moveCallAt + 5))).toEqual([
        0x9a, 0xaf, 0x1a, 0x77, 0x0a,
      ]);
      expect(Array.from(ovr.subarray(drawCallAt, drawCallAt + 5))).toEqual([
        0x9a, 0x50, 0x13, 0x29, 0x02,
      ]);
      // The same descriptor's own local filename table (the prior round's stuck di=0x20/
      // 0x25/0x2b offsets) resolves cleanly once read from this same, now-confirmed base:
      // Pascal length-prefixed 'bord' (mode 4), '8x8d0' (mode 3), '8x8d1' (default/else).
      const strings = ovr.subarray(DISPATCHER_OVR_OFFSET + 0x20, DISPATCHER_OVR_OFFSET + 0x31);
      expect(Buffer.from(strings).toString('latin1')).toBe('\x04bord\x058x8d0\x058x8d1');
    },
  );

  it.skipIf(!haveExecutables)(
    'GAME.EXE: segment 0xa77/0x229 are NOT VROOMM overlay-descriptor selectors (both far outside the resolvable stub geometry)',
    () => {
      // Regression pin for the negative result that unblocked this round: neither segment
      // is reachable through vroomm_layout.py's inferred public-stub selector geometry
      // (base 0x40 + cumulative per-descriptor paragraphs, topping out at 0x147 for
      // Treasures' 38 descriptors) nor gen1_map.py's legacy "selector*16 + CD3F stub"
      // resolver. This is why the prior round's VROOMM-routing lead was a dead end, and
      // why the direct GAME.EXE resident-segment formula below is the right approach.
      const MAX_RESOLVABLE_SELECTOR = 0x147;
      expect(0xa77).toBeGreaterThan(MAX_RESOLVABLE_SELECTOR);
      expect(0x229).toBeGreaterThan(MAX_RESOLVABLE_SELECTOR);
    },
  );

  it.skipIf(!haveExecutables)(
    'GAME.EXE: segment 0x229 offset 0x1350 (the draw routine) contains real VGA blit code, not noise',
    () => {
      const exe = new Uint8Array(readFileSync(gameExePath));
      // MZ header size for this GAME.EXE is 512 bytes (32 header paragraphs); resident
      // segment references resolve as header_bytes + segment*16 + offset.
      const HEADER_BYTES = 512;
      const fo = HEADER_BYTES + 0x229 * 16 + 0x1350;
      expect(fo).toBe(0x37e0);
      // mov ax, 0xa200 (an off-screen source buffer segment)
      expect(Array.from(exe.subarray(fo + 0x19, fo + 0x1c))).toEqual([0xb8, 0x00, 0xa2]);
      // mov ax, 0xa000 (the real VGA mode-13h linear framebuffer segment)
      expect(Array.from(exe.subarray(fo + 0x2e, fo + 0x31))).toEqual([0xb8, 0x00, 0xa0]);
      // the recursive far call back into 0xa77:0x1aaf (Move) to perform the actual copy
      expect(Array.from(exe.subarray(fo + 0x5b, fo + 0x60))).toEqual([
        0x9a, 0xaf, 0x1a, 0x77, 0x0a,
      ]);
      // mov dx, 0x140 (320 decimal); mul dx  -- VGA mode-13h row stride multiply
      expect(Array.from(exe.subarray(fo + 0x126, fo + 0x12b))).toEqual([
        0xba, 0x40, 0x01, 0xf7, 0xe2,
      ]);
      // clean retf terminates the routine 0x199 bytes later, with no decode desync in between
      expect(exe[fo + 0x199]).toBe(0xcb);
    },
  );
});

/**
 * Round 3 (2026-07-21): the DGROUP `LOOKUP_TABLE` this task set out to recover is solved
 * (built per-resource from bytes already inside the same DAX block — see
 * `daxTreasures8x8dTile.ts`'s module doc for the full disassembly-derived algorithm and
 * DGROUP-segment cross-check), and the real pixel payload turned out to use a SEPARATE,
 * simpler, table-free "mode 2" verbatim-copy path. `decodeDax` now decodes every
 * `8X8D1.DAX` block for real. Visual confirmation (by eye, not just byte-count plausibility):
 * `renders/treasures_8x8d_probe/block{1,2,8}_full_w64.png` (git-ignored, not committed) show
 * clean, non-random, differently-colored (orange/brown, dark red/purple, green — matching each
 * block's own embedded palette) wall/stone-texture imagery with horizontal mortar-line banding
 * — the task's explicit "visually coherent" bar.
 */
describe('Treasures 8X8D1.DAX third sub-format — round 3: solved decode', () => {
  it.skipIf(!haveTreasures)('parseTreasures8x8dTile decodes all 12 real blocks to a 64x256 tile', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    for (const blk of blocks) {
      const tile = parseTreasures8x8dTile(blk.raw);
      expect(tile, `block ${blk.blockId}`).not.toBeNull();
      expect(tile!.width).toBe(64);
      expect(tile!.height).toBe(256);
      expect(tile!.indices.byteLength).toBe(64 * 256);
      expect(tile!.paletteBase).toBe(32);
      expect(tile!.numColors).toBe(112);
      // every real pixel byte falls in the algorithm's proven domain: control/mortar
      // values 0..15, or a direct local-palette index [paletteBase, paletteBase+numColors).
      for (const v of tile!.indices) {
        expect(v < 16 || (v >= 32 && v < 32 + 112), `block ${blk.blockId} pixel value ${v}`).toBe(
          true,
        );
      }
    }
  });

  it.skipIf(!haveTreasures)('the reconstructed LOOKUP_TABLE matches the disassembled construction exactly', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    const tile = parseTreasures8x8dTile(blocks[0].raw)!;
    // identity fill 0..15
    for (let i = 0; i < 16; i++) expect(tile.lookupTable[i]).toBe(i);
    // nibble-pair fill starting at paletteBase, built from the block's own seed bytes
    // right after the embedded 112-color palette (raw offset 10 + 112*3 = 346).
    const raw = blocks[0].raw;
    const seedStart = 10 + 112 * 3;
    for (let i = 0; i < 56; i++) {
      const b = raw[seedStart + i];
      expect(tile.lookupTable[32 + i * 2]).toBe(b >> 4);
      expect(tile.lookupTable[32 + i * 2 + 1]).toBe(b & 0xf);
    }
  });

  it.skipIf(!haveTreasures)('decodeDax wires the new format in: kind "8x8d-treasures-mode2", real palette, no NaN pixels', () => {
    const bytes = new Uint8Array(readFileSync(resolve(treasuresDir, '8X8D1.DAX')));
    const archive = decodeDax(bytes, '8X8D1');
    expect(archive.blocks.length).toBe(12);
    for (const blk of archive.blocks) {
      expect(blk.kind, `block ${blk.blockId}`).toBe('8x8d-treasures-mode2');
      expect(blk.image, `block ${blk.blockId}`).not.toBeNull();
      expect(blk.image!.width).toBe(64);
      expect(blk.image!.height).toBe(256);
      expect(blk.image!.palette?.source).toBe('dax-8x8d-treasures-mode2');
      expect(blk.image!.palette?.firstColor).toBe(32);
      expect(blk.image!.palette?.count).toBe(112);
      // every defined palette slot is a real, in-range 8-bit color (no undefined/NaN math
      // from the 6-bit-DAC scale — every embedded DAC byte was gated <=63 at parse time).
      for (let i = 32; i < 32 + 112; i++) {
        const c = blk.image!.palette!.colors[i];
        expect(c, `block ${blk.blockId} color ${i}`).not.toBeNull();
        expect(c!.r).toBeGreaterThanOrEqual(0);
        expect(c!.r).toBeLessThanOrEqual(255);
      }
    }
  });

  it.skipIf(!haveTreasures)('treasures8x8dTileToIndexedImage round-trips indices verbatim (no transparency key)', () => {
    const blocks = loadBlocks('8X8D1.DAX');
    const tile = parseTreasures8x8dTile(blocks[0].raw)!;
    const img = treasures8x8dTileToIndexedImage(tile);
    expect(img.transparentIndex).toBeNull();
    expect(Array.from(img.indices)).toEqual(Array.from(tile.indices));
    expect(img.encoding).toBe('dax-8x8d-treasures-mode2');
  });
});
