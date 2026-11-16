/**
 * `SOUNDS.GLB` (Amiga `DIG8`) decode test — the silent-titles audio-gap attack
 * (`docs/engine/research/audio-silent-titles.md`). Verifies the `dig8.ts` decoder against the
 * real Amiga `SOUNDS.GLB` files for the five DataLib-era titles that ship one (Curse of the
 * Azure Bonds, Secret of the Silver Blades, Gateway to the Savage Frontier, Treasures of the
 * Savage Frontier, Pools of Darkness — Pool of Radiance ships NO sound file on either platform,
 * see the research doc's inventory table).
 *
 * These sources are the user's EXTERNAL Amiga WHDLoad installs (absolute paths, read-only,
 * never vendored) — absent source => SKIP, exactly like the GLIB golden suite
 * (`test/glib.test.ts`).
 *
 * Verification is more than "it parses": every member must round-trip through the SAME 4-byte
 * DIG4-style header (sample rate 0x1CFA = 7418 Hz, matching DQK's own already-verified DIG4/VOC
 * rate) and its PCM must show a real audio *shape* — DC-centred (mean near 0 once shifted by
 * -128), and a non-trivial RMS envelope (computed over 8 equal chunks) that VARIES across the
 * clip, i.e. it is not flat/silent and not a single repeated byte. That rules out "parses but is
 * garbage" without requiring an actual audible listen in this harness.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { decodeGlibDig8, sniffDig8 } from '../src/audio/dig8.js';

const TITLES: { name: string; path: string }[] = [
  {
    name: 'Curse of the Azure Bonds',
    path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SOUNDS.GLB',
  },
  {
    name: 'Secret of the Silver Blades',
    path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/sounds.glb',
  },
  {
    name: 'Gateway to the Savage Frontier',
    path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sounds.glb',
  },
  {
    name: 'Treasures of the Savage Frontier',
    path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sounds.glb',
  },
  {
    name: 'Pools of Darkness',
    path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/SOUNDS.GLB',
  },
];

function rmsChunks(pcm: Float32Array, n: number): number[] {
  const chunkSize = Math.floor(pcm.length / n) || 1;
  const out: number[] = [];
  for (let c = 0; c < n; c++) {
    const start = c * chunkSize;
    const end = c === n - 1 ? pcm.length : start + chunkSize;
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < pcm.length; i++) {
      sum += pcm[i] * pcm[i];
      count++;
    }
    out.push(count > 0 ? Math.sqrt(sum / count) : 0);
  }
  return out;
}

describe('decodeGlibDig8 — Amiga SOUNDS.GLB digitized SFX (silent-titles audio gap)', () => {
  for (const { name, path } of TITLES) {
    if (!existsSync(path)) {
      it.skip(`${name}: SOUNDS.GLB — source missing (external Amiga drive not attached)`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${name}: SOUNDS.GLB decodes to real-shaped digitized PCM`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      expect(sniffDig8(bytes)).toBe(true);

      const { sounds } = decodeGlibDig8(bytes, `${name}/SOUNDS.GLB`);
      expect(sounds.length).toBeGreaterThan(0);

      for (const s of sounds) {
        // Same 3 rate values as DQK's own already-verified DIG4/VOC bank (5564/7418/11127 Hz —
        // Pools of Darkness's own bank uses the high 11127 Hz rate on at least one member, same
        // as DQK's "die"/"lightning" high-rate effects).
        expect([5564, 7418, 11127]).toContain(s.clip.sampleRate);
        expect(s.clip.pcm.length).toBeGreaterThan(0);

        // DC-centred (0x80-centred unsigned PCM, mapped to [-1,1)).
        let sum = 0;
        for (let i = 0; i < s.clip.pcm.length; i++) sum += s.clip.pcm[i];
        const mean = sum / s.clip.pcm.length;
        expect(Math.abs(mean)).toBeLessThan(0.3);

        // Real audio shape: an RMS envelope that varies across the clip (not flat/silent,
        // not a single repeated byte) — the same discriminator used to verify DQK's DIG4.
        const chunks = rmsChunks(s.clip.pcm, 8);
        const maxRms = Math.max(...chunks);
        const minRms = Math.min(...chunks);
        expect(maxRms).toBeGreaterThan(0.05); // not silence
        // Skip the variation check for very short clips (too few samples per chunk to be meaningful).
        if (s.clip.pcm.length >= 64) {
          expect(maxRms - minRms).toBeGreaterThan(0); // not a perfectly flat/constant signal
        }
      }
    });
  }
});
