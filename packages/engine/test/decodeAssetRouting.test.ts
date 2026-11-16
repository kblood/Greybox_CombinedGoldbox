/**
 * `decodeAsset` decides format by sniff ORDER, and nothing measured what that order costs.
 *
 * The dispatcher tries HLIB → GLIB → ILBM → DAA → DAX. The first three carry exact magics; the
 * last two are structural heuristics, so DAA gets first refusal on every file DAX would also
 * claim. `glib.test.ts` pins that the order is load-bearing for a *corrupted* container, but that
 * is a statement about a hand-broken file, not about the corpus. Two questions were unanswered:
 *
 * 1. **Ambiguity** — how many real files decode successfully as BOTH, where the order alone
 *    picks the answer? Measured: **0**.
 * 2. **Shadowing** — how many files does `sniffDaa` claim and `decodeDaa` then reject, where
 *    `decodeDax` would have read them? Those are unreachable through `decodeAsset` even though a
 *    working decoder exists. Measured: **0**.
 *
 * Both are negatives, so both need a control that shows the scan can produce a non-zero, and they
 * need DIFFERENT controls because a decoder never disagrees with itself. Ambiguity is exercised by
 * running DAX against DAX (all 522 DAX files become ambiguous); shadowing by a left slot that
 * claims every file and always throws (all 522 become shadowed). Without those, "0 and 0" is
 * indistinguishable from a loop that never ran — the failure mode this repo has hit repeatedly.
 * Independently mutation-checked: making `sniffDaa` claim everything turns the shadow count to
 * 522 and the first test red.
 *
 * This also guards the 2026-08-25 tightening of the DAA 6-byte index arm: that change moved nine
 * Amiga Pool of Radiance files from "decodes as DAA" to "throws", and the shadow count is what
 * proves the move did not make a DAX-readable file unreachable.
 *
 * Sources are the user's read-only installs — absent source => SKIP.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { decodeDaa, sniffDaa } from '../src/loaders/daa.js';
import { decodeDax, sniffDax } from '../src/loaders/dax.js';

const BS = String.fromCharCode(92);
const norm = (p: string) => p.split(BS).join('/');
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
const WHD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';
const DOS_TITLES = [
  'Champions of Krynn',
  'Death Knights of Krynn',
  'The Dark Queen of Krynn',
  'Pool of Radiance',
  'Curse of the Azure Bonds',
  'Secret of the Silver Blades',
  'Pools of Darkness',
  'Gateway to the Savage Frontier',
  'Treasures of the Savage Frontier',
  'Unlimited Adventures',
];
const AMIGA_TITLES = [
  'ChampionsOfKrynn',
  'DeathKnightsOfKrynn',
  'DarkQueenOfKrynn',
  'PoolOfRadiance',
  'PoolsOfDarkness',
  'CurseOfTheAzureBonds',
  'SecretOfTheSilverBlades',
  'GatewayToSavageFrontier',
  'TreasuresOfSavageFrontier',
  'BuckRogersCountdownDday',
];
const ROOTS = [
  ...DOS_TITLES.map((t) => `${GOG}/${t}`),
  ...AMIGA_TITLES.map((t) => `${WHD}/${t}`),
];
const have = ROOTS.every((r) => existsSync(r));

function everyFile(): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let ents;
    try {
      ents = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = norm(resolve(d, e.name));
      if (e.isDirectory()) walk(full, depth + 1);
      else out.push(full);
    }
  };
  for (const r of ROOTS) walk(r, 0);
  return out;
}

interface Scan {
  scanned: number;
  ambiguous: number;
  shadowed: number;
  leftOnly: number;
  rightOnly: number;
}

/**
 * Sweep the corpus with `left` sniffed first and `right` second, exactly as `decodeAsset` orders
 * them. The two counters need different controls, because a decoder never disagrees with itself:
 * DAX-against-DAX drives `ambiguous` to the whole DAX corpus and leaves `shadowed` at 0, so
 * `shadowed` is instead exercised with a left slot that claims everything and always throws.
 */
function sweep(
  left: readonly [(b: Uint8Array) => boolean, (b: Uint8Array, n: string) => unknown],
  right: readonly [(b: Uint8Array) => boolean, (b: Uint8Array, n: string) => unknown],
): Scan {
  const seen = new Set<string>();
  const s: Scan = { scanned: 0, ambiguous: 0, shadowed: 0, leftOnly: 0, rightOnly: 0 };
  for (const f of everyFile()) {
    let b: Uint8Array;
    try {
      b = new Uint8Array(readFileSync(f));
    } catch {
      continue;
    }
    if (!b.byteLength) continue;
    const key = `${f.slice(f.lastIndexOf('/') + 1).toUpperCase()}:${b.byteLength}`;
    if (seen.has(key)) continue;
    seen.add(key);
    s.scanned++;
    const leftClaims = left[0](b);
    let leftOk = false;
    if (leftClaims) {
      try {
        left[1](b, f);
        leftOk = true;
      } catch {
        /* claimed and rejected */
      }
    }
    let rightOk = false;
    if (right[0](b)) {
      try {
        right[1](b, f);
        rightOk = true;
      } catch {
        /* not this one either */
      }
    }
    if (leftOk && rightOk) s.ambiguous++;
    else if (leftOk) s.leftOnly++;
    else if (rightOk) {
      s.rightOnly++;
      // The first sniffer claimed it and its decoder threw, so `decodeAsset` never reaches the
      // second branch that would have read the file.
      if (leftClaims) s.shadowed++;
    }
  }
  return s;
}

const DAA = [sniffDaa, decodeDaa] as const;
const DAX = [sniffDax, decodeDax] as const;

describe.skipIf(!have)('decodeAsset DAA/DAX sniff order', () => {
  it(
    'no real file decodes as both, and none is shadowed',
    () => {
      const s = sweep(DAA, DAX);
      // Pinned so the corpus cannot quietly shrink to a size where 0 is trivial.
      expect(s.scanned).toBe(2261);
      expect(s.leftOnly).toBe(64); // genuine Amiga .DAA containers
      expect(s.rightOnly).toBe(522); // genuine DOS .DAX containers
      expect(s.ambiguous).toBe(0);
      expect(s.shadowed).toBe(0);
    },
    300000,
  );

  it(
    'control: the same sweep reports non-zero when it should',
    () => {
      // Ambiguity counter is live: run DAX against itself and every DAX file is "both".
      const selfDax = sweep(DAX, DAX);
      expect(selfDax.ambiguous).toBe(522);
      expect(selfDax.leftOnly).toBe(0);
      expect(selfDax.rightOnly).toBe(0);

      // Shadow counter is live: give the left slot a sniffer that claims everything and a decoder
      // that always throws. Every file the right slot can read is then shadowed.
      const claimsAll = [() => true, () => { throw new Error('never'); }] as const;
      const blocked = sweep(claimsAll, DAX);
      expect(blocked.shadowed).toBe(522);
      expect(blocked.rightOnly).toBe(522);
      expect(blocked.ambiguous).toBe(0);
    },
    300000,
  );
});
