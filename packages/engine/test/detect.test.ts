/**
 * Game-detection fingerprinter tests (M0.S5).
 *
 * Drives `fingerprintFolder` with synthetic file lists (so these run green on a
 * fresh clone with no game data) covering each Krynn variant, the CoK/DoK
 * disambiguation, junk rejection, and the optional magic-confirmation pass. A final
 * opt-in block fingerprints the REAL DOS installs if present in the repo.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprintFolder,
  confirmWithMagic,
  type FolderEntry,
  type ReadFirstBytes,
} from '../src/index.js';

const toEntries = (names: string[]): FolderEntry[] => names.map((path) => ({ path }));

// --- Representative (synthetic) file lists, basenames only -----------------

const COK_DOS = [
  'BIGPIC1.DAX', 'BIGPIC2.DAX', 'GEO1.DAX', 'GEO2.DAX', 'ECL1.DAX', 'ECL2.DAX',
  '8X8D1.DAX', '8X8D2.DAX', 'KRYNN.CFG', 'GAME.OVR', 'COMSPR.DAX', 'CHEAD.DAX',
  'CBODY.DAX', 'MON1CHA.DAX', 'MON1ITM.DAX', 'CURSOR.DAX', 'Manual.pdf',
];

const DOK_DOS = [
  'BIGPIC1.DAX', 'BIGPIC2.DAX', 'GEO1.DAX', 'GEO2.DAX', 'ECL1.DAX', 'ECL2.DAX',
  '8X8D1.DAX', '8X8D4.DAX', '8X8D5.DAX', 'DKK.CFG', 'BACK1.DAX', 'BACK2.DAX',
  'CHEAD.DAX', 'COMSPR.DAX', 'MON1WIZ.DAX', 'ITEM0.DAX',
];

const COK_AMIGA = [
  'disk1/scrn1b.lbm', 'disk1/scrn2.lbm', 'disk1/gothic.lbm', 'disk1/SKY.DAA',
  'disk1/8X8D0.DAA', 'disk1/comspr.daa', 'disk1/DUNGCOM.DAA',
  'disk2/BIGPIC1.DAA', 'disk2/CPIC1.DAA', 'disk2/HEAD1.DAA', 'disk3/bigpic2.daa',
];

const DOK_AMIGA = [
  'disk1/BIGPIC1.DAA', 'disk1/CPIC1.daa', 'disk1/Title1.LBM', 'disk1/comspr.daa',
];

const DQK_DOS = [
  'DISK1/TITLE.TLB', 'DISK1/ALWAYS.TLB', 'DISK1/SOUNDS.GLB', 'DISK1/DQK.CFG',
  'DISK2/BIGPIC.TLB', 'DISK2/CPIC.TLB', 'DISK2/ECL.GLB', 'DISK2/GEO.GLB',
  'DQK.EXE', 'START.BAT',
];

const JUNK = ['readme.txt', 'photo.jpg', 'notes.docx', 'setup.exe', 'data.bin'];

// --- Broader roster (M5.S6) — synthetic fixtures, see docs/engine/research/
// broader-roster-detection.md for what's independently verified vs. inferred. ---

const POOL_OF_RADIANCE_DOS = [
  'POOL.CFG', 'START.EXE', 'GEO1.DAX', 'GEO2.DAX', 'ECL1.DAX', 'ECL2.DAX',
  '8X8D1.DAX', 'BIGPIC1.DAX',
];

const CURSE_OF_THE_AZURE_BONDS_DOS = [
  'CURSE.CFG', 'BIGPIC1.DAX', 'BIGPIC2.DAX', 'ECL1.DAX', 'ECL2.DAX', '8X8D1.DAX',
  '8X8D2.DAX', 'COMSPR.DAX', 'SKY.DAX', 'TITLE.DAX', 'MON1CHA.DAX', 'TILES.DAX',
];

const SECRET_OF_THE_SILVER_BLADES_DOS = [
  'BLADES.CFG', 'START.EXE', 'GAME.OVR', 'GEO1.DAX', 'ECL1.DAX', '8X8D1.DAX',
  'BIGPIC1.DAX', 'COMSPR.DAX', 'TITLE.DAX',
];

const GATEWAY_TO_THE_SAVAGE_FRONTIER_DOS = [
  'GAME.EXE', 'GAME.OVR', 'GAME.CFG', 'GO.BAT', 'ZOUNDS.DAX', 'MUSIC.DAX',
  '8X8D1.DAX', 'COMSPR.DAX', 'DUNGCOM.DAX', 'RANDCOM.DAX', 'SKY.DAX', 'TITLE.DAX',
];

const NEVERWINTER_NIGHTS_DOS = [
  'GAME.EXE', 'GAME.OVR', 'GAME.CFG', 'ECL0.DAX', 'GEO0.DAX', 'ECL1.DAX', 'GEO1.DAX',
  '8X8D.DAX', 'WALLDEF.DAX', 'MONCHA.DAX', 'CPIC.DAX', 'TITLE.DAX',
];

const TREASURES_OF_THE_SAVAGE_FRONTIER_DOS = [
  'GAME.EXE', 'GAME.OVR', 'TREASURE.CFG', 'ZOUNDS.DAX', 'STARTUP.EXE', 'CONTROL.EXE',
  'ECL1.DAX', 'GEO1.DAX', '8X8D1.DAX', 'COMSPR.DAX', 'TITLE.DAX',
];

const POOLS_OF_DARKNESS_DOS = [
  'GAME.EXE', 'GAME.OVR', 'POOL4.CFG', 'ZOUNDS.DAX', 'STARTUP.EXE', 'CONTROL.EXE',
  'VACE.EXE', 'ECL1.DAX', 'GEO1.DAX', '8X8D1.DAX', 'BIGPIC1.DAX',
];

// The INSTALLED folder, taken from the real listing of
// `D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday` (basenames uppercased; the install
// stores them lowercase and all matching here is case-insensitive).
const BUCK_ROGERS_DOS = [
  'BUCK.CFG', 'SHIPS.DAX', 'START.EXE', 'GAME.OVR', 'TITLE.DAX', 'BORDERS.DAX', 'CHARS.DAX',
  'COMSPR.DAX', 'CURSOR.DAX', 'HITEK.DAX', 'LOTEK.DAX', 'MARSCOM.DAX', 'VENUSCOM.DAX',
  'MON0CHA.DAX', 'MON0ITM.DAX', 'MON0SPC.DAX', 'ITEM0.DAX', 'MUSIC.DAX', 'SAVGAMA.DAT',
  'ECL1.DAX', 'GEO1.DAX', '8X8D1.DAX', 'BIGPIC1.DAX', 'BACK1.DAX', 'CPIC1.DAX', 'PIC1.DAX',
  'SPRIT1.DAX', 'WALLDEF1.DAX',
];
/** The floppy distribution's own names — a 3-part split executable and its installer. */
const BUCK_ROGERS_FLOPPY_MEDIA = ['BUCK1.EXE', 'BUCK2.EXE', 'BUCK3.EXE', 'INSTALL.COM'];

// Real listing of the WHDLoad-unpacked Amiga dump (R1, 2026-09-02):
// `D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/
// BuckRogersCountdownDday/data`. Basenames lowercase as measured on disk; matching is
// case-insensitive. 34 `.daa` + 6 `.lbm` total on the real folder; a representative subset here.
const BUCK_ROGERS_AMIGA = [
  'bigpic1.daa', 'bigpic2.daa', 'bigpic3.daa', 'ships.daa', 'comspr.daa', 'cpic1.daa', 'cpic2.daa',
  '8x8d0.daa', '8x8d1.daa', 'back1.daa', 'borders.daa', 'hitek0.daa', 'lotek0.daa', 'marscom0.daa',
  'venuscom0.daa', 'spacetvl.daa', 'pic0.daa', 'sprit1.daa', 'ttl1.lbm', 'buckfont.lbm', 'chars.lbm',
  'globals.daa', 'pointers.daa',
];
const BUCK_ROGERS_MATRIX_CUBED_DOS = ['START.EXE', 'MATRIX.CFG', 'BUCKA.XMI', 'BUCKB.XMI', 'BUCKC.XMI', 'TANDY.ADV'];
const FRUA_DOS = ['CKIT.EXE', 'SCRIPT.GLB', 'GEO.GLB', 'STRG.GLB', 'SOUNDS.GLB'];

describe('fingerprintFolder — Krynn trilogy', () => {
  it('identifies Champions of Krynn (DOS)', () => {
    const r = fingerprintFolder(toEntries(COK_DOS));
    expect(r.best).not.toBeNull();
    expect(r.best?.profileId).toBe('champions-of-krynn');
    expect(r.best?.platform).toBe('DOS');
    expect(r.best?.graphicSet).toBe('dos-ega');
    expect(r.ambiguous).toBe(false);
    expect(r.best?.confidence).toBeGreaterThan(0.5);
  });

  it('identifies Death Knights of Krynn (DOS) and does NOT confuse it with CoK', () => {
    const r = fingerprintFolder(toEntries(DOK_DOS));
    expect(r.best?.profileId).toBe('death-knights-of-krynn');
    expect(r.best?.platform).toBe('DOS');
    // CoK variant must be disqualified (DKK.CFG/BACK1.DAX exclude it).
    expect(r.ranked.some((m) => m.profileId === 'champions-of-krynn')).toBe(false);
  });

  it('identifies Champions of Krynn (Amiga) via nested disk paths', () => {
    const r = fingerprintFolder(toEntries(COK_AMIGA));
    expect(r.best?.profileId).toBe('champions-of-krynn');
    expect(r.best?.platform).toBe('Amiga');
    expect(r.best?.container).toBe('DAA');
  });

  it('identifies Death Knights of Krynn (Amiga) and excludes CoK-Amiga', () => {
    const r = fingerprintFolder(toEntries(DOK_AMIGA));
    expect(r.best?.profileId).toBe('death-knights-of-krynn');
    expect(r.best?.platform).toBe('Amiga');
    expect(r.ranked.some((m) => m.profileId === 'champions-of-krynn')).toBe(false);
  });

  it('identifies The Dark Queen of Krynn (DOS / HLIB)', () => {
    const r = fingerprintFolder(toEntries(DQK_DOS));
    expect(r.best?.profileId).toBe('dark-queen-of-krynn');
    expect(r.best?.engineGen).toBe('gen2-hlib');
    expect(r.best?.graphicSet).toBe('dos-vga');
  });

  it('rejects a junk folder (no qualifying candidate)', () => {
    const r = fingerprintFolder(toEntries(JUNK));
    expect(r.best).toBeNull();
    expect(r.ranked.length).toBe(0);
  });

  it('rejects an empty folder', () => {
    const r = fingerprintFolder([]);
    expect(r.best).toBeNull();
    expect(r.ranked).toEqual([]);
  });
});

describe('fingerprintFolder — broader roster (M5.S6)', () => {
  it('identifies Pool of Radiance (DOS) and does not confuse it with CoK/DoK/CoAB', () => {
    const r = fingerprintFolder(toEntries(POOL_OF_RADIANCE_DOS));
    expect(r.best?.profileId).toBe('pool-of-radiance');
    expect(r.best?.platform).toBe('DOS');
    expect(r.ambiguous).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'champions-of-krynn')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'curse-of-the-azure-bonds')).toBe(false);
  });

  it('identifies Curse of the Azure Bonds (DOS) via CURSE.CFG', () => {
    const r = fingerprintFolder(toEntries(CURSE_OF_THE_AZURE_BONDS_DOS));
    expect(r.best?.profileId).toBe('curse-of-the-azure-bonds');
    expect(r.best?.platform).toBe('DOS');
    expect(r.ranked.some((m) => m.profileId === 'champions-of-krynn')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'pool-of-radiance')).toBe(false);
  });

  it('identifies Secret of the Silver Blades (DOS) via BLADES.CFG', () => {
    const r = fingerprintFolder(toEntries(SECRET_OF_THE_SILVER_BLADES_DOS));
    expect(r.best?.profileId).toBe('secret-of-the-silver-blades');
    expect(r.best?.platform).toBe('DOS');
    expect(r.ranked.some((m) => m.profileId === 'curse-of-the-azure-bonds')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'pool-of-radiance')).toBe(false);
  });

  it('identifies Gateway to the Savage Frontier (DOS) via GAME.CFG plus ZOUNDS.DAX', () => {
    const r = fingerprintFolder(toEntries(GATEWAY_TO_THE_SAVAGE_FRONTIER_DOS));
    expect(r.best?.profileId).toBe('gateway-to-the-savage-frontier');
    expect(r.best?.platform).toBe('DOS');
    // MUSIC.DAX is shared with a real DoK install, but DoK's own required gate
    // (BIGPIC1/GEO1/ECL1/8X8D1.DAX) isn't satisfied by this fixture, so it never ranks.
    expect(r.ranked.some((m) => m.profileId === 'death-knights-of-krynn')).toBe(false);
  });

  it('identifies Neverwinter Nights (DOS/AOL) via GAME.CFG plus ECL0/GEO0 without confusing it for Gateway', () => {
    const r = fingerprintFolder(toEntries(NEVERWINTER_NIGHTS_DOS));
    expect(r.best?.profileId).toBe('neverwinter-nights-dos');
    expect(r.best?.platform).toBe('DOS');
    expect(r.best?.engineGen).toBe('gen1-dax');
    expect(r.ranked.some((m) => m.profileId === 'gateway-to-the-savage-frontier')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'pools-of-darkness')).toBe(false);
  });

  it('identifies Treasures of the Savage Frontier (DOS) via TREASURE.CFG', () => {
    const r = fingerprintFolder(toEntries(TREASURES_OF_THE_SAVAGE_FRONTIER_DOS));
    expect(r.best?.profileId).toBe('treasures-of-the-savage-frontier');
    expect(r.best?.platform).toBe('DOS');
    expect(r.ranked.some((m) => m.profileId === 'gateway-to-the-savage-frontier')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'pools-of-darkness')).toBe(false);
  });

  it('identifies Pools of Darkness (DOS) via POOL4.CFG without treating ZOUNDS.DAX as Gateway-only', () => {
    const r = fingerprintFolder(toEntries(POOLS_OF_DARKNESS_DOS));
    expect(r.best?.profileId).toBe('pools-of-darkness');
    expect(r.best?.platform).toBe('DOS');
    expect(r.ranked.some((m) => m.profileId === 'gateway-to-the-savage-frontier')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'treasures-of-the-savage-frontier')).toBe(false);
  });

  it('identifies Buck Rogers: Countdown to Doomsday (DOS) from the installed folder', () => {
    const r = fingerprintFolder(toEntries(BUCK_ROGERS_DOS));
    expect(r.best?.profileId).toBe('buck-rogers-countdown-to-doomsday');
    expect(r.best?.platform).toBe('DOS');
    expect(r.best?.engineGen).toBe('gen1-dax');
    // Corrected 2026-08-26 from 'dos-ega'. BUCK.CFG's first CRLF field is `V` where Champions'
    // KRYNN.CFG holds `E` in the identical slot, and the art carries 224-entry 6-bit DAC palettes.
    expect(r.best?.graphicSet).toBe('dos-vga');
    expect(r.ambiguous).toBe(false);
  });

  /**
   * The trade this profile deliberately makes, asserted rather than left implicit. Until
   * 2026-08-26 the DOS variant REQUIRED the floppy media's three-part executable, and matched
   * nothing else — so the one Buck install this project actually holds could not be detected,
   * while a folder of self-extracting installer blobs with no readable asset in it could.
   */
  it('no longer matches raw floppy media alone, and the installed names are why', () => {
    const media = fingerprintFolder(toEntries(BUCK_ROGERS_FLOPPY_MEDIA));
    expect(media.best?.profileId).not.toBe('buck-rogers-countdown-to-doomsday');

    // Neither required basename exists on the media; both exist in the install.
    for (const name of ['BUCK.CFG', 'SHIPS.DAX']) {
      expect(`${name}:${BUCK_ROGERS_FLOPPY_MEDIA.includes(name)}`).toBe(`${name}:false`);
      expect(`${name}:${BUCK_ROGERS_DOS.includes(name)}`).toBe(`${name}:true`);
    }

    // And the media names still SCORE: dropping them from the installed listing lowers confidence
    // without breaking the match, which is what "markers, not a gate" means.
    const withMedia = fingerprintFolder(toEntries([...BUCK_ROGERS_DOS, ...BUCK_ROGERS_FLOPPY_MEDIA]));
    expect(withMedia.best?.profileId).toBe('buck-rogers-countdown-to-doomsday');
    expect(withMedia.best!.score).toBeGreaterThan(fingerprintFolder(toEntries(BUCK_ROGERS_DOS)).best!.score);
  });

  it('does not claim any other Gold Box install: the required pair is Buck-only', () => {
    for (const folder of [COK_DOS, DOK_DOS, DQK_DOS, POOL_OF_RADIANCE_DOS, POOLS_OF_DARKNESS_DOS, TREASURES_OF_THE_SAVAGE_FRONTIER_DOS, BUCK_ROGERS_MATRIX_CUBED_DOS, FRUA_DOS]) {
      const r = fingerprintFolder(toEntries(folder));
      expect(r.ranked.some((m) => m.profileId === 'buck-rogers-countdown-to-doomsday')).toBe(false);
    }
  });

  it('identifies Buck Rogers: Countdown to Doomsday (Amiga) and does not confuse it with CoK/DoK-Amiga', () => {
    const r = fingerprintFolder(toEntries(BUCK_ROGERS_AMIGA));
    expect(r.best?.profileId).toBe('buck-rogers-countdown-to-doomsday');
    expect(r.best?.platform).toBe('Amiga');
    expect(r.best?.container).toBe('DAA');
    expect(r.ambiguous).toBe(false);
    // The latent bug this profile fixes: BIGPIC1.DAA alone used to satisfy both the CoK-Amiga and
    // DoK-Amiga `required` gates, and neither excluded Buck's own files, so a Buck Amiga folder
    // was told it was Champions of Krynn. Both must now be entirely absent from `ranked`.
    expect(r.ranked.some((m) => m.profileId === 'champions-of-krynn')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'death-knights-of-krynn')).toBe(false);
  });

  it('the existing CoK-Amiga and DoK-Amiga fixtures still do not match Buck-Amiga', () => {
    const cok = fingerprintFolder(toEntries(COK_AMIGA));
    const dok = fingerprintFolder(toEntries(DOK_AMIGA));
    expect(cok.ranked.some((m) => m.profileId === 'buck-rogers-countdown-to-doomsday')).toBe(false);
    expect(dok.ranked.some((m) => m.profileId === 'buck-rogers-countdown-to-doomsday')).toBe(false);
  });

  it('identifies Buck Rogers: Matrix Cubed (DOS) via MATRIX.CFG', () => {
    const r = fingerprintFolder(toEntries(BUCK_ROGERS_MATRIX_CUBED_DOS));
    expect(r.best?.profileId).toBe('buck-rogers-matrix-cubed');
    expect(r.best?.platform).toBe('DOS');
    expect(r.best?.engineGen).toBe('gen1-dax');
    // R6 (2026-09-03): corrected from 'dos-ega'. MATRIX.CFG's first field is `V` (measured on
    // the extracted install) and every picture block in the corpus decodes as an embedded-
    // palette VGA format, not plain EGA 4bpp -- see profiles.ts's own comment on this variant and
    // docs/engine/research/matrix-cubed-profile.md.
    expect(r.best?.graphicSet).toBe('dos-vga');
    expect(r.ranked.some((m) => m.profileId === 'buck-rogers-countdown-to-doomsday')).toBe(false);
  });

  it('identifies Forgotten Realms Unlimited Adventures (DOS) via CKIT.EXE plus SCRIPT.GLB', () => {
    const r = fingerprintFolder(toEntries(FRUA_DOS));
    expect(r.best?.profileId).toBe('forgotten-realms-unlimited-adventures');
    expect(r.best?.platform).toBe('DOS');
    expect(r.best?.engineGen).toBe('gen2-hlib');
    expect(r.best?.ruleset).toBe('addnd1e');
    expect(r.ranked.some((m) => m.profileId === 'dark-queen-of-krynn')).toBe(false);
  });

  it('a real Krynn folder never registers as one of the broader-roster games', () => {
    const r = fingerprintFolder(toEntries(COK_DOS));
    expect(r.ranked.some((m) => m.profileId === 'pool-of-radiance')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'curse-of-the-azure-bonds')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'secret-of-the-silver-blades')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'gateway-to-the-savage-frontier')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'treasures-of-the-savage-frontier')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'pools-of-darkness')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'neverwinter-nights-dos')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'buck-rogers-matrix-cubed')).toBe(false);
    expect(r.ranked.some((m) => m.profileId === 'forgotten-realms-unlimited-adventures')).toBe(false);
  });
});

describe('confirmWithMagic — HLIB probe boosts confidence', () => {
  it('confirms DQK via "HLIB" magic at offset 0 of TITLE.TLB', async () => {
    const r = fingerprintFolder(toEntries(DQK_DOS));
    const hlib = new Uint8Array([0x48, 0x4c, 0x49, 0x42]); // "HLIB"
    const reader: ReadFirstBytes = async (base) => (base === 'title.tlb' ? hlib : null);
    const confirmed = await confirmWithMagic(r, reader);
    const dqk = confirmed.ranked.find((m) => m.profileId === 'dark-queen-of-krynn');
    expect(dqk?.magicConfirmed).toBe(true);
    expect(dqk!.confidence).toBeGreaterThanOrEqual(r.best!.confidence);
  });

  it('leaves the match intact when the magic mismatches', async () => {
    const r = fingerprintFolder(toEntries(DQK_DOS));
    const notHlib = new Uint8Array([0, 0, 0, 0]);
    const reader: ReadFirstBytes = async () => notHlib;
    const confirmed = await confirmWithMagic(r, reader);
    expect(confirmed.best?.profileId).toBe('dark-queen-of-krynn');
    expect(confirmed.best?.magicConfirmed).toBe(false);
  });

  it('confirms FRUA via "HLIB" magic at offset 0 of SCRIPT.GLB', async () => {
    const r = fingerprintFolder(toEntries(FRUA_DOS));
    const hlib = new Uint8Array([0x48, 0x4c, 0x49, 0x42]);
    const reader: ReadFirstBytes = async (base) => (base === 'script.glb' ? hlib : null);
    const confirmed = await confirmWithMagic(r, reader);
    const frua = confirmed.ranked.find((m) => m.profileId === 'forgotten-realms-unlimited-adventures');
    expect(frua?.magicConfirmed).toBe(true);
    expect(confirmed.best?.profileId).toBe('forgotten-realms-unlimited-adventures');
  });
});

// --- Opt-in: fingerprint the REAL DOS installs if present in the repo -------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

function scanTop(dir: string): FolderEntry[] {
  // Shallow scan is enough for the DOS installs (flat folders).
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => ({ path: d.name }));
}

describe('fingerprintFolder — real installs (skipped if absent)', () => {
  const cokDir = resolve(repoRoot, 'Champions of Krynn');
  const dokDir = resolve(repoRoot, 'Death Knights of Krynn');
  const coabDir = resolve(repoRoot, 'coab_extracted', 'Data');
  const hasCok = existsSync(cokDir);
  const hasDok = existsSync(dokDir);
  const hasCoab = existsSync(coabDir);
  const optionalFixtureTitle = (title: string, fixture: string, present: boolean) =>
    present ? title : `${title} [skipped: required fixture ${fixture} is absent]`;

  it('explains an absent optional fixture in its skip title', () => {
    expect(optionalFixtureTitle('real CoK DOS install → champions-of-krynn', 'Champions of Krynn/', false))
      .toBe('real CoK DOS install → champions-of-krynn [skipped: required fixture Champions of Krynn/ is absent]');
  });

  it.skipIf(!hasCok)(
    optionalFixtureTitle('real CoK DOS install → champions-of-krynn', 'Champions of Krynn/', hasCok),
    () => {
      const r = fingerprintFolder(scanTop(cokDir));
      expect(r.best?.profileId).toBe('champions-of-krynn');
      expect(r.best?.platform).toBe('DOS');
    },
  );

  it.skipIf(!hasDok)(
    optionalFixtureTitle('real DoK DOS install → death-knights-of-krynn', 'Death Knights of Krynn/', hasDok),
    () => {
      const r = fingerprintFolder(scanTop(dokDir));
      expect(r.best?.profileId).toBe('death-knights-of-krynn');
      expect(r.best?.platform).toBe('DOS');
    },
  );

  // Uncommitted, git-ignored: a third party's CoAB reimplementation-project asset dump (real DAX
  // bytes, no .CFG/.EXE — see docs/engine/research/broader-roster-detection.md). Proves the
  // curse-of-the-azure-bonds signature against genuine files, not just an invented fixture.
  it.skipIf(!hasCoab)(
    optionalFixtureTitle('real CoAB data dump → curse-of-the-azure-bonds', 'coab_extracted/Data/', hasCoab),
    () => {
      const r = fingerprintFolder(scanTop(coabDir));
      expect(r.best?.profileId).toBe('curse-of-the-azure-bonds');
      expect(r.best?.platform).toBe('DOS');
    },
  );
});
