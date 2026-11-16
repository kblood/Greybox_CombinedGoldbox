/**
 * DQK demo (`ECL.GLB` id 7) terminal `COMBAT` — the native `setupDuelAttack` (`CALL 0x0001`)
 * duel-setup mechanic and the real CPIC combat-icon art it resolves.
 *
 * `dqkDemoCombatRoster.test.ts` already pins the honest gap this closes further: the script's
 * `COMBAT` fires with an EMPTY ECL-level roster (no `LOAD_MONSTER` opcode anywhere in the block) and
 * separately issues five native `CALL 0x0001` dispatches after a nonlocal `GOTO`. This test locks in
 * the follow-up finding (see `docs/engine/research/dqk-duel-setup-dispatch.md` for the full static +
 * dynamic trace evidence):
 *
 *  - DQK.EXE's `CALL` opcode handler (file `0x0327da`, part of the already-solved Gen2 dispatch
 *    table — `decompile-dqk-ecl-dispatch.md`) dispatches routine id 1 to file `0x041a55`, DQK's
 *    native "duel setup" routine — the same class of mechanic as COAB's decompiled
 *    `ovr008.cs SetupDuel(bool)`, matched by call-argument shape AND by the literal DS-relative
 *    string constant `"CPIC"` (file `0x6B1AC`) it pushes as a far string pointer to a 3-arg call
 *    structurally matching COAB's `chead_cbody_comspr_icon(icon, count, "CPIC")`.
 *  - That routine resolves an "icon id" byte via a DGROUP lookup table (file `0x6ADD8`) indexed by
 *    a class/species-like field off the native "current record" pointer, then uses the icon id as
 *    the argument to the CPIC loader.
 *  - A live Unicorn trace of the real Demo route (`--watch-exec` on the icon-store instruction,
 *    file `0x041a7a`) captured the actual icon ids DQK.EXE resolves for this script across two
 *    independent 5-iteration runs of the script: `0x80, 0x80, 0x82, 0x86, 0x80` (first run) and
 *    `0x80, 0x81, 0x80, 0x80, 0x80` (second run) — real, not invented, values.
 *  - `CPIC.TLB` (DISK2) is a plain leaf `TILE` container (unlike PICA/B/C's nested master-with-
 *    set-id-table shape): an icon id `n` decodes via DIRECT positional index — `decodeHlib`'s own
 *    walk-order label `img{n}` (zero-padded to 3 digits) — not a `parseHlibSetIdTable` lookup.
 *
 * This test locks in: CPIC.TLB's own leaf-TILE shape, and that every icon id observed in the live
 * trace decodes to a real, non-degenerate image (apps/web's `dqkDemo.ts` `DEMO_DUEL_ICON_IDS`
 * renders these as the demo's actual duel-combat participants instead of a placeholder note).
 *
 * Skipped when the DQK GOG install isn't present (same convention as this project's other
 * real-asset tests).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodeHlib, indexedToRGBA, sniffHlib } from '../src/index.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const dqkDir = resolve(repoRoot, 'The Dark Queen of Krynn');
const cpicPath = resolve(dqkDir, 'DISK2', 'CPIC.TLB');
const OUT_DIR = resolve(repoRoot, 'renders', 'dqk-demo-duel-icons');
const have = existsSync(cpicPath);

// Mirrors apps/web/src/ui/dqkDemo.ts's DEMO_DUEL_ICON_IDS — the live-captured icon ids from both
// observed script runs (deduplicated). See the module doc above for provenance.
const LIVE_CAPTURED_ICON_IDS = [0x80, 0x81, 0x82, 0x86];

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const out = new Uint8Array(4 + body.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}
function encodePNG(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 4) + 1 + x * 4;
      raw[d] = rgba[s]!;
      raw[d + 1] = rgba[s + 1]!;
      raw[d + 2] = rgba[s + 2]!;
      raw[d + 3] = rgba[s + 3]!;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe.skipIf(!have)('DQK native setupDuelAttack CPIC icon ids', () => {
  it('CPIC.TLB is a plain leaf TILE container (direct positional icon-id index, not a set-id table)', () => {
    const bytes = new Uint8Array(readFileSync(cpicPath));
    expect(sniffHlib(bytes)).toBe(true);
    const arch = decodeHlib(bytes, 'CPIC');
    expect(arch.tag).toBe('TILE');
    expect(arch.nonImage).toBe(false);
    expect(arch.images.length).toBeGreaterThan(150); // real library: ~190 icons
  });

  it('every live-captured duel icon id decodes to a real, non-degenerate image', () => {
    const bytes = new Uint8Array(readFileSync(cpicPath));
    const arch = decodeHlib(bytes, 'CPIC');
    const byLabel = new Map(arch.images.map((im) => [im.label, im]));

    mkdirSync(OUT_DIR, { recursive: true });
    for (const id of LIVE_CAPTURED_ICON_IDS) {
      const label = `img${String(id).padStart(3, '0')}`;
      const found = byLabel.get(label);
      expect(found, `duel icon id ${id} (${label}) not found in CPIC.TLB`).toBeTruthy();
      expect(found!.image.width).toBeGreaterThan(0);
      expect(found!.image.height).toBeGreaterThan(0);
      expect(found!.image.palette).toBeTruthy();

      // Not every pixel transparent/blank — a real decoded sprite, not an empty/garbage frame.
      const nonBlank = found!.image.indices.some((v) => v !== 255 && v !== 0);
      expect(nonBlank, `duel icon id ${id} decoded to an apparently blank image`).toBe(true);

      // Render for visual verification (this project's convention for decoded-art proofs).
      const rgba = indexedToRGBA(found!.image, found!.image.palette!);
      const png = encodePNG(rgba, found!.image.width, found!.image.height);
      writeFileSync(resolve(OUT_DIR, `${label}_id${id}.png`), png);
    }
  });
});
