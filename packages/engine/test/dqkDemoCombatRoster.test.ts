/**
 * DQK demo (`ECL.GLB` id 7) terminal COMBAT roster.
 *
 * **2026-08-07 — the "empty roster" this file used to assert was not a gap in the script; it was a
 * gap in our Gen2 operand table.** This test previously claimed "no `LOAD_MONSTER` opcode is
 * reachable anywhere in the block", and `apps/web/src/ui/dqkDemo.ts` carried a matching gap note.
 * Both were artifacts of over-wide Gen2 operand frames desynchronising the decode before it ever
 * reached them. With the table read directly out of DQK.EXE's handler prefetches (see
 * `ECL_GEN2`'s comment in `packages/engine/src/ecl/disassemble.ts`), the walk from the block's own
 * header entries lands cleanly on:
 *
 *   84bc  CLEARMONSTERS
 *   84bd  SETUP_MONSTER #82,#3,#255,#15
 *   84ca  LOAD_MONSTER #82,#3,#82        84d1  LOAD_MONSTER #91,#1,#91
 *   84d8  LOAD_MONSTER #90,#2,#90        84df  LOAD_MONSTER #89,#5,#89
 *   84e6  LOAD_MONSTER #88,#2,#88        84ed  LOAD_MONSTER #40,#3,#40
 *   8500  COMBAT
 *
 * So the demo's terminal combat has a real six-group ECL roster. The other two facts this file
 * pinned are unaffected and still asserted:
 *
 *  - `GEO.GLB` id 26 (the script's own `LOAD_FILES` target and combat area) decodes cleanly via
 *    the existing `decodeGen2GeoArchive` — the map format is NOT the blocker (an earlier version
 *    of the demo's own gap note wrongly said otherwise; this test guards against that regressing).
 *  - The script fires native `CALL 0x0001` (`setupDuelAttack`) host-routine dispatches — DQK's own
 *    "duel" combat-setup mechanic, implemented in DQK.EXE's native code. See
 *    `docs/engine/research/dqk-picture-id-mapping.md` for the trace evidence and
 *    `docs/engine/research/decompile-dqk-ecl-dispatch.md` for the dispatch table itself.
 *
 * The third thing this file used to pin — a nonlocal `GOTO` the VM could not follow — is gone for
 * the same reason as the empty roster: it was where the desynchronised decode happened to land,
 * not a real edge of the script.
 *
 * Skipped when the DQK GOG install isn't present (same convention as this project's other
 * real-asset tests).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEclGlb, decodeHlib, decodeGen2GeoArchive, EclVm, ECL_GEN2, type EclEffect } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqkDir = resolve(repoRoot, 'The Dark Queen of Krynn');
const eclPath = resolve(dqkDir, 'DISK3', 'ECL.GLB');
const geoPath = resolve(dqkDir, 'DISK3', 'GEO.GLB');
const have = existsSync(eclPath) && existsSync(geoPath);

describe.skipIf(!have)('DQK demo (ECL.GLB #7) terminal COMBAT roster', () => {
  it('reaches COMBAT with the script\'s real six-group LOAD_MONSTER roster', async () => {
    const eclBytes = new Uint8Array(await readFile(eclPath));
    const ecl = decodeEclGlb(eclBytes, 'ECL.GLB');
    const block = ecl.blockSourceById(7);
    expect(block).toBeTruthy();

    const vm = new EclVm(block!, { dialect: ECL_GEN2 });
    const allEffects: EclEffect[] = [];
    let res = vm.run();
    allEffects.push(...res.effects);
    // The script opens with a PARLAY attitude menu before any narration — auto-answer with the
    // first choice (same convention `dqkDemo.ts` itself uses) until a non-input pause.
    for (let guard = 0; guard < 20 && res.status === 'awaiting-input'; guard++) {
      res = vm.resume(0);
      allEffects.push(...res.effects);
    }

    expect(res.status).toBe('combat');
    const combat = allEffects.find((e): e is Extract<EclEffect, { type: 'combat' }> => e.type === 'combat');
    expect(combat).toBeTruthy();
    // Byte-checked against the block itself (0x84ca..0x84f3, six consecutive `0b` groups).
    expect(combat!.monsters).toEqual([
      { monsterId: 82, count: 3, picBlockId: 82 },
      { monsterId: 91, count: 1, picBlockId: 91 },
      { monsterId: 90, count: 2, picBlockId: 90 },
      { monsterId: 89, count: 5, picBlockId: 89 },
      { monsterId: 88, count: 2, picBlockId: 88 },
      { monsterId: 40, count: 3, picBlockId: 40 },
    ]);

    // The native "duel setup" CALLs (routineId 1) the demo route also fires.
    const calls = allEffects.filter((e): e is Extract<EclEffect, { type: 'call' }> => e.type === 'call');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.routineId === 1 && c.routine === 'setupDuelAttack')).toBe(true);

    // The route used to end at a "nonlocal GOTO the VM can't follow". That was the same desync:
    // with the corrected Gen2 frames the whole route stays inside the block and nothing is
    // unhandled at all. Asserted as an exact empty set so a future reintroduction is loud.
    const unhandled = allEffects.filter((e): e is Extract<EclEffect, { type: 'unhandled' }> => e.type === 'unhandled');
    expect(unhandled.map((u) => u.mnemonic)).toEqual([]);

    // The script's own LOAD_FILES target — GEO.GLB id 26 — matches the demo route research doc.
    const loadFiles = allEffects.find((e): e is Extract<EclEffect, { type: 'loadFiles' }> => e.type === 'loadFiles');
    expect(loadFiles?.geoBlockId).toBe(26);
  });

  it('GEO.GLB id 26 (the demo combat area) decodes cleanly — the map format is NOT the blocker', async () => {
    const geoBytes = new Uint8Array(await readFile(geoPath));
    const geoArch = decodeHlib(geoBytes, 'GEO.GLB');
    const maps = decodeGen2GeoArchive(geoArch.rawMembers, 'GEO');
    const area26 = maps.find((m) => m.id === 26);
    expect(area26).toBeTruthy();
    expect(area26!.map.width).toBeGreaterThan(0);
    expect(area26!.map.height).toBeGreaterThan(0);
    expect(area26!.map.cells.length).toBe(area26!.map.width * area26!.map.height);
  });
});
