/**
 * DQK disk assembly (E4.2a) — the executable-side of the CoK/DoK→DQK rebuild. Verified against the
 * real GOG release:
 *
 *  - {@link DQK_DISK_LAYOUT} matches the actual DISK1/DISK2/DISK3 listings exactly (every file
 *    classified, none missing, none invented).
 *  - {@link planExeTitlePatch} finds "The Dark Queen of Krynn" in the real `DQK.EXE` and a CoK/DoK
 *    retitle changes *only* the 23-byte title region — the rest of the 449 664-byte image is
 *    byte-identical.
 *
 * Synthetic cases cover the conf generator and the patch guards deterministically.
 */
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DQK_DISK_LAYOUT,
  DQK_TITLE,
  GAME_TITLES,
  diskFilesByOrigin,
  generateDosboxConf,
  planExeTitlePatch,
  applyExePatches,
  retitleDqkExe,
  planProtectionBypassPatches,
  DQK_PROTECTION_PATCH_SPECS,
  planDqkBuild,
  buildDqkGameData,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const dqkDir = resolve(repoRoot, 'The Dark Queen of Krynn');
const exePath = resolve(dqkDir, 'DQK.EXE');
const haveExe = existsSync(exePath);
const haveDisks = ['DISK1', 'DISK2', 'DISK3'].every((d) => existsSync(resolve(dqkDir, d)));

describe('DQK disk layout (E4.2a)', () => {
  it('classifies the port-produced files exactly', () => {
    const port = diskFilesByOrigin('port').map((f) => f.name).sort();
    expect(port).toEqual(['ECL.GLB', 'GEO.GLB', 'ITEM.DAT', 'ITEMS.DAT', 'MONCHA.GLB']);
  });

  it('places the GLBs on their real disks', () => {
    const byName = new Map(DQK_DISK_LAYOUT.map((f) => [f.name, f]));
    expect(byName.get('GEO.GLB')!.disk).toBe('DISK3');
    expect(byName.get('ECL.GLB')!.disk).toBe('DISK3');
    expect(byName.get('MONCHA.GLB')!.disk).toBe('DISK2');
    expect(byName.get('ITEM.DAT')!.disk).toBe('DISK1');
  });

  it.skipIf(!haveDisks)('matches the real DISK1/DISK2/DISK3 listings exactly', async () => {
    const real = new Set<string>();
    for (const d of ['DISK1', 'DISK2', 'DISK3'] as const) {
      for (const name of await readdir(resolve(dqkDir, d))) real.add(name.toUpperCase());
    }
    const planned = new Set(DQK_DISK_LAYOUT.map((f) => f.name));
    const missing = [...real].filter((n) => !planned.has(n)).sort();
    const invented = [...planned].filter((n) => !real.has(n)).sort();
    expect(missing, 'files on disk but not in layout').toEqual([]);
    expect(invented, 'files in layout but not on disk').toEqual([]);
    // And each planned file lives on the disk the layout claims.
    for (const f of DQK_DISK_LAYOUT) {
      const onDisk = (await readdir(resolve(dqkDir, f.disk))).map((n) => n.toUpperCase());
      expect(onDisk, `${f.name} on ${f.disk}`).toContain(f.name);
    }
  });
});

describe('DOSBox conf generation (E4.2a)', () => {
  it('reproduces the START.BAT invocation', () => {
    const conf = generateDosboxConf({ mountPath: '/games/cok' });
    expect(conf).toContain('[autoexec]');
    expect(conf).toContain('mount c "/games/cok"');
    expect(conf).toContain('DQK SB220 SI7 RB330');
    expect(conf).toContain('exit');
    // SB args reflected in the sblaster block.
    expect(conf).toMatch(/sbbase=220/);
    expect(conf).toMatch(/irq=7/);
  });
});

describe('DQK.EXE title patch (E4.2a)', () => {
  it('rejects a title longer than the original region', () => {
    const fake = new TextEncoder().encode(`xx${DQK_TITLE}\0yy`);
    expect(() => planExeTitlePatch(fake, 'A Title That Is Far Too Long To Fit Here')).toThrow(/longer/);
  });

  it('refuses an ambiguous (duplicated) title', () => {
    const fake = new TextEncoder().encode(`${DQK_TITLE}__${DQK_TITLE}`);
    expect(() => planExeTitlePatch(fake, 'Champions of Krynn')).toThrow(/more than once/);
  });

  it('NUL-terminates a shorter replacement', () => {
    const fake = new TextEncoder().encode(`pre.${DQK_TITLE}\0post`);
    const patch = planExeTitlePatch(fake, 'Champions of Krynn');
    const out = applyExePatches(fake, [patch]);
    const region = out.subarray(patch.offset, patch.offset + DQK_TITLE.length);
    const nul = region.indexOf(0);
    expect(nul).toBe('Champions of Krynn'.length);
    expect(new TextDecoder().decode(region.subarray(0, nul))).toBe('Champions of Krynn');
  });

  it.skipIf(!haveExe)('retitles the real DQK.EXE, touching only the 23-byte title region', async () => {
    const exe = new Uint8Array(await readFile(exePath));
    for (const target of ['cok', 'dok'] as const) {
      const { exe: patched, patch } = retitleDqkExe(exe, target);
      expect(patch.offset).toBe(427923);
      expect(patch.before.length).toBe(DQK_TITLE.length);
      expect(patched.length).toBe(exe.length);

      // The new title is present and NUL-terminated at the same offset.
      const region = patched.subarray(patch.offset, patch.offset + DQK_TITLE.length);
      const nul = region.indexOf(0);
      const shown = new TextDecoder().decode(nul < 0 ? region : region.subarray(0, nul));
      expect(shown).toBe(GAME_TITLES[target]);

      // Every byte OUTSIDE the title region is byte-identical.
      let diffs = 0;
      for (let i = 0; i < exe.length; i++) {
        const inRegion = i >= patch.offset && i < patch.offset + DQK_TITLE.length;
        if (!inRegion && exe[i] !== patched[i]) diffs++;
      }
      expect(diffs, `${target}: bytes changed outside title region`).toBe(0);
    }

    // 'dqk' target is a no-op (identical bytes).
    const { exe: same } = retitleDqkExe(exe, 'dqk');
    expect(Buffer.from(same).equals(Buffer.from(exe))).toBe(true);
  });
});

describe('DQK build plan (E4.2b-1)', () => {
  // A minimal fake EXE that carries the title once.
  const fakeExe = () => new TextEncoder().encode(`HDR..${DQK_TITLE}\0..tail`);
  // Empty game data → valid (empty) GLBs, deterministic.
  const emptyGame = () =>
    buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });

  it('covers the whole layout exactly once, plus the EXE and conf', () => {
    const plan = planDqkBuild({ gameData: emptyGame(), exe: fakeExe(), target: 'cok' });

    // Every layout file appears exactly once across emit∪copy.
    const planned = [...plan.emit, ...plan.copy]
      .filter((f) => f.disk !== 'root')
      .map((f) => f.path)
      .sort();
    const expected = DQK_DISK_LAYOUT.map((f) => `${f.disk}/${f.name}`).sort();
    expect(planned).toEqual(expected);

    // The three port GLBs + the two generated root files are emitted; nothing else is.
    const emitPaths = plan.emit.map((f) => f.path).sort();
    expect(emitPaths).toEqual(
      ['DISK2/MONCHA.GLB', 'DISK3/ECL.GLB', 'DISK3/GEO.GLB', 'DQK.EXE', 'dosbox.conf'].sort(),
    );
    // Copy list = everything else (43 of the 46 layout files). NB SOUNDS.GLB (audio) IS copied —
    // only the three ported GLBs are emitted.
    expect(plan.copy.length).toBe(DQK_DISK_LAYOUT.length - 3);
    const portGlbs = new Set(['GEO.GLB', 'MONCHA.GLB', 'ECL.GLB']);
    expect(plan.copy.some((f) => portGlbs.has(f.fromName))).toBe(false);
  });

  it('emits the port GLBs with the game-data bytes and a retitled EXE', () => {
    const game = emptyGame();
    const plan = planDqkBuild({ gameData: game, exe: fakeExe(), target: 'dok' });

    const geo = plan.emit.find((f) => f.path === 'DISK3/GEO.GLB')!;
    expect(Buffer.from(geo.bytes).equals(Buffer.from(game.geoGlb))).toBe(true);
    const moncha = plan.emit.find((f) => f.path === 'DISK2/MONCHA.GLB')!;
    expect(Buffer.from(moncha.bytes).equals(Buffer.from(game.monchaGlb))).toBe(true);

    // The emitted EXE is retitled to the DoK name.
    const exeFile = plan.emit.find((f) => f.path === 'DQK.EXE')!;
    expect(new TextDecoder().decode(exeFile.bytes)).toContain('Death Knights of Krynn');

    // The conf is the generated DOSBox conf.
    const confFile = plan.emit.find((f) => f.origin === 'conf')!;
    expect(confFile.path).toBe('dosbox.conf');
    expect(new TextDecoder().decode(confFile.bytes)).toContain('DQK SB220 SI7 RB330');
  });

  // A minimal party-present save: a 38-byte header with Party Size @31 > 0 (E6.2a gate field).
  const partyPresentSave = (partySize = 6) => {
    const s = new Uint8Array(38);
    s[31] = partySize;
    return s;
  };

  it('drops a party-present save at the build root and emits any extra SAVE/ files (E6.2b)', () => {
    const vault = new Uint8Array([9, 9, 9]);
    const plan = planDqkBuild({
      gameData: emptyGame(),
      exe: fakeExe(),
      target: 'cok',
      save: { savgama: partyPresentSave(6), files: { 'SAVE/VAULTA.DAT': vault } },
    });
    const sav = plan.emit.find((f) => f.path === 'SAVGAMA.QSV');
    expect(sav, 'SAVGAMA.QSV emitted at root').toBeDefined();
    expect(sav!.disk).toBe('root');
    expect(sav!.origin).toBe('save');
    expect(sav!.bytes[31]).toBe(6);
    const vaultFile = plan.emit.find((f) => f.path === 'SAVE/VAULTA.DAT')!;
    expect(Buffer.from(vaultFile.bytes).equals(Buffer.from(vault))).toBe(true);
    // No save-drop means no SAVGAMA.QSV (the default build is unchanged).
    const noSave = planDqkBuild({ gameData: emptyGame(), exe: fakeExe(), target: 'cok' });
    expect(noSave.emit.some((f) => f.origin === 'save')).toBe(false);
  });

  it('refuses a roster-empty save (it would leave the menu disabled)', () => {
    expect(() =>
      planDqkBuild({
        gameData: emptyGame(),
        exe: fakeExe(),
        target: 'cok',
        save: { savgama: partyPresentSave(0) },
      }),
    ).toThrow(/roster-empty/);
  });

  it('moves an overridden file from copy to emit', () => {
    const items = new Uint8Array([1, 2, 3, 4]);
    const plan = planDqkBuild({
      gameData: emptyGame(),
      exe: fakeExe(),
      target: 'cok',
      overrides: { 'ITEM.DAT': items },
    });
    // ITEM.DAT is now emitted (not copied).
    const emitted = plan.emit.find((f) => f.path === 'DISK1/ITEM.DAT');
    expect(emitted).toBeDefined();
    expect(Buffer.from(emitted!.bytes).equals(Buffer.from(items))).toBe(true);
    expect(plan.copy.some((f) => f.path === 'DISK1/ITEM.DAT')).toBe(false);
  });

  it.skipIf(!haveExe || !existsSync(resolve(repoRoot, 'Champions of Krynn', 'GEO1.DAX')))(
    'plans a real CoK build: real GLBs emitted, real DQK.EXE retitled',
    async () => {
      const cok = (f: string) => resolve(repoRoot, 'Champions of Krynn', f);
      const [geo, mon, ecl, exe] = await Promise.all([
        readFile(cok('GEO1.DAX')),
        readFile(cok('MON1CHA.DAX')),
        readFile(cok('ECL1.DAX')),
        readFile(exePath),
      ]);
      const game = buildDqkGameData({
        geo: new Uint8Array(geo),
        mon: new Uint8Array(mon),
        ecl: new Uint8Array(ecl),
      });
      const plan = planDqkBuild({ gameData: game, exe: new Uint8Array(exe), target: 'cok' });

      // The emitted GEO.GLB is exactly the E4.1 output.
      const geoOut = plan.emit.find((f) => f.path === 'DISK3/GEO.GLB')!;
      expect(Buffer.from(geoOut.bytes).equals(Buffer.from(game.geoGlb))).toBe(true);

      // The emitted EXE is the real image retitled to CoK, same length.
      const exeOut = plan.emit.find((f) => f.path === 'DQK.EXE')!;
      expect(exeOut.bytes.length).toBe(exe.length);
      const region = exeOut.bytes.subarray(427923, 427923 + DQK_TITLE.length);
      const nul = region.indexOf(0);
      expect(new TextDecoder().decode(region.subarray(0, nul))).toBe('Champions of Krynn');

      // The copy list still references real DQK release files (art/audio/engine).
      expect(plan.copy.every((f) => f.fromName.length > 0)).toBe(true);
    },
  );
});

describe('DQK.EXE copy-protection bypass patch (E6.2b-4)', () => {
  // A fake EXE long enough to carry the patch site with its verified before-bytes in place.
  const fakeProtectedExe = () => {
    const exe = new Uint8Array(0x21400);
    for (const spec of DQK_PROTECTION_PATCH_SPECS) exe.set(Uint8Array.from(spec.before), spec.offset);
    return exe;
  };

  it('produces the DoProtCheck stub patch (MOV AX,1 ; RETF)', () => {
    const exe = fakeProtectedExe();
    const patches = planProtectionBypassPatches(exe);
    expect(patches.length).toBe(1);
    expect(patches[0].offset).toBe(0x212e3);
    expect([...patches[0].before]).toEqual([0xe8, 0x37, 0xf0, 0xea]); // call FBOV-loader + ljmp head
    expect([...patches[0].after]).toEqual([0xb8, 0x01, 0x00, 0xcb]); // MOV AX,1 ; RETF
  });

  it('applies cleanly, touching only the 4 stub bytes', () => {
    const exe = fakeProtectedExe();
    const patched = applyExePatches(exe, planProtectionBypassPatches(exe));
    expect([...patched.subarray(0x212e3, 0x212e7)]).toEqual([0xb8, 0x01, 0x00, 0xcb]);
    let diffs = 0;
    for (let i = 0; i < exe.length; i++) if (exe[i] !== patched[i]) diffs++;
    expect(diffs).toBe(4);
  });

  it('refuses an EXE whose stub bytes do not match (wrong build / already patched)', () => {
    const exe = fakeProtectedExe();
    exe[0x212e3] = 0xb8; // already patched
    expect(() => planProtectionBypassPatches(exe)).toThrow(/expected byte/);
  });

  it('plan applies the bypass only when requested', () => {
    const game = buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });
    const exe = fakeProtectedExe();
    // Embed the title region too so the retitle step can run on this fake EXE.
    const withTitle = new Uint8Array(exe.length + DQK_TITLE.length + 8);
    withTitle.set(exe);
    withTitle.set(new TextEncoder().encode(`${DQK_TITLE}\0`), exe.length + 2);

    const off = planDqkBuild({ gameData: game, exe: withTitle, target: 'cok' });
    expect([...off.emit.find((f) => f.path === 'DQK.EXE')!.bytes.subarray(0x212e3, 0x212e7)]).toEqual([
      0xe8, 0x37, 0xf0, 0xea,
    ]); // untouched
    const on = planDqkBuild({ gameData: game, exe: withTitle, target: 'cok', bypassProtection: true });
    expect([...on.emit.find((f) => f.path === 'DQK.EXE')!.bytes.subarray(0x212e3, 0x212e7)]).toEqual([
      0xb8, 0x01, 0x00, 0xcb,
    ]); // bypassed
  });

  it.skipIf(!haveExe)('matches the real DQK.EXE DoProtCheck stub byte-for-byte', async () => {
    const exe = new Uint8Array(await readFile(exePath));
    // The resident FBOV stub: call <FBOV-loader> ; ljmp 2726:0020 (the protection overlay entry).
    expect([...exe.subarray(0x212e3, 0x212eb)]).toEqual([0xe8, 0x37, 0xf0, 0xea, 0x20, 0x00, 0x26, 0x27]);
    expect(0x212e3).toBeLessThan(137429); // inside the MZ image (mz_image_end), not the overlay tail
    const patched = applyExePatches(exe, planProtectionBypassPatches(exe));
    expect([...patched.subarray(0x212e3, 0x212e7)]).toEqual([0xb8, 0x01, 0x00, 0xcb]);
    expect(patched.length).toBe(exe.length);
  });
});
