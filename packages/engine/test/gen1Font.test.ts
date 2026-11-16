/**
 * Gen1 (CoK/DoK/Buck Rogers-family) 8×8 monochrome text font — `8X8D1.DAX` block 201.
 *
 * `apps/web/games/buck-rogers-countdown-to-doomsday.json`'s pre-2026-09-02 note read the
 * block linearly from '@' (`code - 0x40`) and concluded digits/punctuation were "not in this
 * bank and have not been located". That reading cannot address ANY digit at all — `code -
 * 0x40` is negative for every digit code — so the note's own arithmetic already proves it
 * wrong; see the first `describe` block below. The real addressing is the SAME fold
 * `cokFont.ts` already uses for CoK/DoK: `glyph = ToUpper(ch) % 64` (COAB `seg041.cs:49`),
 * under which Buck's slot 48 IS populated and IS '0'.
 *
 * This file:
 *  1. Pins the "note's own reading can't work" null + the real fold's digit/letter coverage.
 *  2. Pins the measured glyph bytes (CoK vs DoK vs Buck) on real game files (skipIf absent).
 *  3. Sweeps every `8X8D*.DAX` block across the five documented source locations and asserts
 *     the EXACT claim set of `dax.ts`'s new `'font'` routing arm (routing null).
 *  4. Proves the routing arm's id gate does real work with a synthetic decoy block, since on
 *     the real corpus every non-201 block happens to have a raw length that is NOT a multiple
 *     of 8 (so "loosen the id gate" alone doesn't flip any retail file — a synthetic
 *     counterexample is required to make the gate's necessity observable).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { cokGlyphSlot, fontSheetImage, loadCokFont, loadGen1Font, COK_FONT_BLOCK } from '../src/loaders/cokFont.js';
import { decodeDax, readDaxDataBlocks } from '../src/loaders/dax.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..'); // packages/engine/test/../../.. = repo root

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------------------------------------------------------------------------------------
// 1. The note's own reading is the null.
// ---------------------------------------------------------------------------------------

describe('the linear-from-"@" reading cannot address any digit; the real fold can', () => {
  it('code - 0x40 (the note\'s reading) is negative for every digit 0-9', () => {
    for (const ch of DIGITS) {
      const code = ch.charCodeAt(0);
      expect(code - 0x40, `'${ch}' (0x${code.toString(16)}) - 0x40`).toBeLessThan(0);
    }
  });

  it('cokGlyphSlot (the real ToUpper(ch) % 64 fold) lands every digit and letter in 0..63', () => {
    for (const ch of DIGITS + LETTERS + ' ') {
      const slot = cokGlyphSlot(ch.charCodeAt(0));
      expect(slot, `slot for '${ch}'`).toBeGreaterThanOrEqual(0);
      expect(slot, `slot for '${ch}'`).toBeLessThan(64);
    }
    expect(cokGlyphSlot('0'.charCodeAt(0))).toBe(48);
    expect(cokGlyphSlot('A'.charCodeAt(0))).toBe(1);
    expect(cokGlyphSlot('@'.charCodeAt(0))).toBe(0);
    expect(cokGlyphSlot('Z'.charCodeAt(0))).toBe(26);
    expect(cokGlyphSlot(' '.charCodeAt(0))).toBe(32);
  });
});

// ---------------------------------------------------------------------------------------
// 2. Measured glyph bytes on real game files.
// ---------------------------------------------------------------------------------------

const COK_PATH = resolve(REPO_ROOT, 'Champions of Krynn', '8X8D1.DAX');
const DOK_PATH = resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D1.DAX');
const BUCK_PATH =
  'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d1.dax';

const haveCok = existsSync(COK_PATH);
const haveDok = existsSync(DOK_PATH);
const haveBuck = existsSync(BUCK_PATH);

function glyphBytesAt(daxBytes: Uint8Array, blockId: number, slot: number): Uint8Array {
  const blocks = readDaxDataBlocks(daxBytes);
  const font = blocks.find((b) => b.blockId === blockId);
  if (!font) throw new Error(`block ${blockId} not found`);
  return font.raw.subarray(slot * 8, slot * 8 + 8);
}

function glyphNonEmpty(daxBytes: Uint8Array, blockId: number, slot: number): boolean {
  const g = glyphBytesAt(daxBytes, blockId, slot);
  return g.some((b) => b !== 0);
}

describe('measured glyph bytes: CoK vs DoK vs Buck Rogers', () => {
  it.skipIf(!haveBuck)('Buck slot 48 (\'0\') matches the measured bitmap exactly', () => {
    const bytes = new Uint8Array(readFileSync(BUCK_PATH));
    const g = glyphBytesAt(bytes, COK_FONT_BLOCK, 48);
    expect(Array.from(g)).toEqual([0x00, 0x00, 0x38, 0x44, 0x44, 0x44, 0x38, 0x00]);
  });

  it.skipIf(!haveCok)('CoK slot 48 differs from Buck\'s (distinct typeface)', () => {
    const bytes = new Uint8Array(readFileSync(COK_PATH));
    const g = glyphBytesAt(bytes, COK_FONT_BLOCK, 48);
    expect(Array.from(g)).not.toEqual([0x00, 0x00, 0x38, 0x44, 0x44, 0x44, 0x38, 0x00]);
  });

  it.skipIf(!(haveCok && haveDok))('CoK and DoK are byte-identical across all 64 addressable slots', () => {
    const cok = new Uint8Array(readFileSync(COK_PATH));
    const dok = new Uint8Array(readFileSync(DOK_PATH));
    let same = 0;
    for (let slot = 0; slot < 64; slot++) {
      const a = glyphBytesAt(cok, COK_FONT_BLOCK, slot);
      const b = glyphBytesAt(dok, COK_FONT_BLOCK, slot);
      if (Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0) same++;
    }
    expect(same).toBe(64);
  });

  it.skipIf(!(haveCok && haveBuck))('CoK and Buck share only 1 of the 64 addressable slots (distinct typeface)', () => {
    const cok = new Uint8Array(readFileSync(COK_PATH));
    const buck = new Uint8Array(readFileSync(BUCK_PATH));
    let same = 0;
    for (let slot = 0; slot < 64; slot++) {
      const a = glyphBytesAt(cok, COK_FONT_BLOCK, slot);
      const b = glyphBytesAt(buck, COK_FONT_BLOCK, slot);
      if (Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0) same++;
    }
    expect(same).toBe(1);
  });

  for (const [label, path, have] of [
    ['CoK', COK_PATH, haveCok],
    ['DoK', DOK_PATH, haveDok],
    ['Buck', BUCK_PATH, haveBuck],
  ] as const) {
    it.skipIf(!have)(`${label}: every folded slot for 0-9 and A-Z is non-empty`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const missing: string[] = [];
      for (const ch of DIGITS + LETTERS) {
        const slot = cokGlyphSlot(ch.charCodeAt(0));
        if (!glyphNonEmpty(bytes, COK_FONT_BLOCK, slot)) missing.push(ch);
      }
      expect(missing, `missing glyphs: ${missing.join(',')}`).toEqual([]);
    });

    it.skipIf(!have)(`${label}: loadGen1Font/loadCokFont decode and agree`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const generic = loadGen1Font(bytes, COK_FONT_BLOCK);
      expect(generic).not.toBeNull();
      if (label === 'CoK') {
        const specific = loadCokFont(bytes);
        expect(specific).not.toBeNull();
        expect(specific!.count).toBe(generic!.count);
        expect(Array.from(specific!.bits)).toEqual(Array.from(generic!.bits));
      }
    });
  }

  it.skipIf(!haveBuck)('Buck has exactly 70 populated (non-all-zero) glyph slots, 0..70, gap at 32', () => {
    const bytes = new Uint8Array(readFileSync(BUCK_PATH));
    const blocks = readDaxDataBlocks(bytes);
    const font = blocks.find((b) => b.blockId === COK_FONT_BLOCK)!;
    const glyphCount = Math.floor(font.raw.byteLength / 8);
    expect(glyphCount).toBe(256);
    const populated: number[] = [];
    for (let slot = 0; slot < glyphCount; slot++) {
      const g = font.raw.subarray(slot * 8, slot * 8 + 8);
      if (g.some((b) => b !== 0)) populated.push(slot);
    }
    expect(populated.length).toBe(70);
    expect(Math.min(...populated)).toBe(0);
    expect(Math.max(...populated)).toBe(70);
    expect(populated).not.toContain(32); // ' ' (space) is legitimately blank, not "missing"
  });
});

// ---------------------------------------------------------------------------------------
// 3. fontSheetImage geometry / layout (no real files needed).
// ---------------------------------------------------------------------------------------

describe('fontSheetImage layout', () => {
  it.skipIf(!haveCok)('is 128x32 (16 cols x 4 rows of 8x8), slot r*16+c at cell (c*8, r*8)', () => {
    const bytes = new Uint8Array(readFileSync(COK_PATH));
    const font = loadGen1Font(bytes, COK_FONT_BLOCK)!;
    const sheet = fontSheetImage(font);
    expect(sheet.width).toBe(128);
    expect(sheet.height).toBe(32);
    expect(sheet.indices.length).toBe(128 * 32);

    // Slot 1 = 'A' sits at row 0, col 1 -> cell (8, 0). Cross-check a lit pixel in the sheet
    // against the same pixel read directly out of the raw glyph bytes.
    const rawBlocks = readDaxDataBlocks(bytes);
    const rawFont = rawBlocks.find((b) => b.blockId === COK_FONT_BLOCK)!.raw;
    const slot = 1;
    const cellX = (slot % 16) * 8;
    const cellY = Math.floor(slot / 16) * 8;
    for (let gy = 0; gy < 8; gy++) {
      const byte = rawFont[slot * 8 + gy];
      for (let gx = 0; gx < 8; gx++) {
        const on = ((byte >> (7 - gx)) & 1) === 1;
        const px = sheet.indices[(cellY + gy) * 128 + (cellX + gx)];
        expect(px, `slot ${slot} px (${gx},${gy})`).toBe(on ? 15 : 0);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------
// 4. Routing null — sweep every 8X8D*.DAX block in the corpus, assert the EXACT claim set.
// ---------------------------------------------------------------------------------------

interface SweepFile {
  label: string;
  path: string;
}

// Every 8X8D*.DAX (any numeral suffix) across the three DOS-DAX-holding source locations that
// actually apply (repo root for CoK/DoK; GOG Galaxy for the other six titles that ship
// 8X8D1.DAX; D: for Buck Rogers). Measured 2026-09-02 by globbing each location — this list is
// deliberately NOT limited to "8X8D1.DAX": Pools of Darkness and Treasures of the Savage
// Frontier's own block-201 fonts live in `8X8D0.DAX`, and Secret of the Silver Blades' in
// `8X8D5.DAX` (see the corrected manifest note and this file's header comment).
const SWEEP_FILES: SweepFile[] = [
  { label: 'CoK/8X8D1', path: resolve(REPO_ROOT, 'Champions of Krynn', '8X8D1.DAX') },
  { label: 'CoK/8X8D2', path: resolve(REPO_ROOT, 'Champions of Krynn', '8X8D2.DAX') },
  { label: 'CoK/8X8D3', path: resolve(REPO_ROOT, 'Champions of Krynn', '8X8D3.DAX') },
  { label: 'DoK/8X8D1', path: resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D1.DAX') },
  { label: 'DoK/8X8D2', path: resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D2.DAX') },
  { label: 'DoK/8X8D3', path: resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D3.DAX') },
  { label: 'DoK/8X8D4', path: resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D4.DAX') },
  { label: 'DoK/8X8D5', path: resolve(REPO_ROOT, 'Death Knights of Krynn', '8X8D5.DAX') },
  {
    label: 'Curse/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D1.DAX',
  },
  {
    label: 'Curse/8X8D2',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D2.DAX',
  },
  {
    label: 'Curse/8X8D3',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D3.DAX',
  },
  {
    label: 'Curse/8X8D4',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D4.DAX',
  },
  {
    label: 'Curse/8X8D5',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D5.DAX',
  },
  {
    label: 'Curse/8X8D6',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D6.DAX',
  },
  {
    label: 'Gateway/8X8D',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D.DAX',
  },
  {
    label: 'Gateway/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
  },
  {
    label: 'Gateway/8X8D2',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D2.DAX',
  },
  {
    label: 'Gateway/8X8D3',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D3.DAX',
  },
  {
    label: 'Gateway/8X8D4',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D4.DAX',
  },
  {
    label: 'Gateway/8X8D5',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D5.DAX',
  },
  {
    label: 'Gateway/8X8D6',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D6.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D1.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D2',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D2.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D3',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D3.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D4',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D4.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D5',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D5.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D6',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D6.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D7',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D7.DAX',
  },
  {
    label: 'PoolOfRadiance/8X8D8',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D8.DAX',
  },
  {
    label: 'PoolsOfDarkness/8X8D0',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
  },
  {
    label: 'PoolsOfDarkness/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX',
  },
  {
    label: 'Secret/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
  },
  {
    label: 'Secret/8X8D2',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D2.DAX',
  },
  {
    label: 'Secret/8X8D3',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D3.DAX',
  },
  {
    label: 'Secret/8X8D5',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D5.DAX',
  },
  {
    label: 'Treasures/8X8D0',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
  },
  {
    label: 'Treasures/8X8D1',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D1.DAX',
  },
  { label: 'Buck/8x8d0', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d0.dax' },
  { label: 'Buck/8x8d1', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d1.dax' },
  { label: 'Buck/8x8d2', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d2.dax' },
  { label: 'Buck/8x8d3', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d3.dax' },
  { label: 'Buck/8x8d4', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d4.dax' },
  { label: 'Buck/8x8d5', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d5.dax' },
  { label: 'Buck/8x8d6', path: 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/8x8d6.dax' },
];

// The exact claim set, measured 2026-09-02: block id 201 in exactly these 9 files (one entry
// each) — every DOS Gen1/late-Gen1 title we hold a `8X8D*.DAX` for has a block-201 font
// SOMEWHERE, though not always in `8X8D1.DAX`.
const EXPECTED_FONT_CLAIMS = [
  'CoK/8X8D1#201',
  'DoK/8X8D1#201',
  'Curse/8X8D1#201',
  'Gateway/8X8D1#201',
  'PoolOfRadiance/8X8D1#201',
  'PoolsOfDarkness/8X8D0#201',
  'Secret/8X8D5#201',
  'Treasures/8X8D0#201',
  'Buck/8x8d1#201',
].sort();

const availableSweepFiles = SWEEP_FILES.filter((f) => existsSync(f.path));

function sweepFontClaims(): string[] {
  const claims: string[] = [];
  for (const f of availableSweepFiles) {
    const bytes = new Uint8Array(readFileSync(f.path));
    const stem = f.path.split(/[\\/]/).pop()!.replace(/\.dax$/i, '');
    const archive = decodeDax(bytes, stem);
    for (const blk of archive.blocks) {
      if (blk.kind === 'font') claims.push(`${f.label}#${blk.blockId}`);
    }
  }
  return claims.sort();
}

describe('dax.ts \'font\' routing arm — exact claim set across the corpus', () => {
  it.skipIf(availableSweepFiles.length === 0)(
    'claims exactly the block-201 fonts present in the available files, nothing else',
    () => {
      const claims = sweepFontClaims();
      // Only assert membership for files that exist locally, but never allow extras.
      const expectedAvailable = EXPECTED_FONT_CLAIMS.filter((c) =>
        availableSweepFiles.some((f) => c.startsWith(f.label + '#')),
      );
      expect(claims).toEqual(expectedAvailable);
    },
  );

  it.skipIf(availableSweepFiles.length < SWEEP_FILES.length)(
    'full corpus present: claims all 9 titles\' block-201 fonts, exactly',
    () => {
      expect(sweepFontClaims()).toEqual(EXPECTED_FONT_CLAIMS);
    },
  );
});

// ---------------------------------------------------------------------------------------
// 5. Routing null — synthetic decoy proves the id gate does real work.
//
// On the retail corpus above, every non-201 8X8D block happens to have a raw length that is
// NOT a multiple of 8, so removing the `blockId === COK_FONT_BLOCK` check from dax.ts would
// not flip any real file's classification. That does not mean the gate is decorative: it
// means the retail corpus never exercises the failure mode. This synthetic file does.
// ---------------------------------------------------------------------------------------

/** RLE-encode `payload` as one or more literal runs (control byte = run length - 1, max 128). */
function rleEncodeLiteral(payload: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < payload.length; ) {
    const runLen = Math.min(128, payload.length - i);
    out.push(runLen - 1); // control < 0x80 => literal run of (control+1) bytes
    for (let k = 0; k < runLen; k++) out.push(payload[i + k]);
    i += runLen;
  }
  return new Uint8Array(out);
}

/** Build a minimal synthetic DAX container from {blockId, raw} entries (RLE'd internally). */
function buildSyntheticDax(entries: { blockId: number; raw: Uint8Array }[]): Uint8Array {
  const tocBytes = entries.length * 9;
  const compressed = entries.map((e) => rleEncodeLiteral(e.raw));
  const dataBase = 2 + tocBytes;
  let offset = 0;
  const toc: number[] = [];
  const dataChunks: Uint8Array[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { blockId, raw } = entries[i];
    const comp = compressed[i];
    toc.push(blockId & 0xff);
    toc.push(offset & 0xff, (offset >> 8) & 0xff, (offset >> 16) & 0xff, (offset >> 24) & 0xff);
    toc.push(raw.length & 0xff, (raw.length >> 8) & 0xff);
    toc.push(comp.length & 0xff, (comp.length >> 8) & 0xff);
    dataChunks.push(comp);
    offset += comp.length;
  }
  const total = dataBase + offset;
  const out = new Uint8Array(total);
  out[0] = tocBytes & 0xff;
  out[1] = (tocBytes >> 8) & 0xff;
  out.set(toc, 2);
  let pos = dataBase;
  for (const chunk of dataChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

describe.skipIf(!haveCok)('routing null: synthetic decoy — id gate rejects a non-201 unclaimed 8X8D block', () => {
  it('block 201 (real-shaped glyph data) claims \'font\'; sibling block 250 (same length, opaque bytes) does not', () => {
    // Real CoK glyph bytes for block 201 (first 512 bytes = 64 glyphs) so the font arm's own
    // "fails every existing parse" precondition is exercised honestly, not just skipped.
    const cokFontBytes = new Uint8Array(readFileSync(COK_PATH));
    const cokBlocks = readDaxDataBlocks(cokFontBytes);
    const real201 = cokBlocks.find((b) => b.blockId === COK_FONT_BLOCK)!.raw.subarray(0, 512);

    // Decoy: same length (512, a multiple of 8, >= 64 glyphs), but content designed to fail
    // every earlier parser (0xFF repeated => height/width_div8 reads as 0xFFFF, rejected by
    // every header-based check) so it would fall through to 'complex' today.
    const decoy = new Uint8Array(512).fill(0xff);

    const synthetic = buildSyntheticDax([
      { blockId: COK_FONT_BLOCK, raw: real201 },
      { blockId: 250, raw: decoy },
    ]);

    const archive = decodeDax(synthetic, '8X8D1');
    const b201 = archive.blocks.find((b) => b.blockId === COK_FONT_BLOCK)!;
    const b250 = archive.blocks.find((b) => b.blockId === 250)!;

    expect(b201.kind).toBe('font');
    expect(b201.frames?.length).toBe(64);
    expect(b250.kind).not.toBe('font');
    expect(b250.kind).toBe('complex');
  });
});
