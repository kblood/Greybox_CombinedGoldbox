/**
 * DQK saved-game (`SAVGAMA.QSV`) global-header decode (E6.2a). The real shipped save is the ground truth;
 * a synthetic buffer covers the field offsets deterministically. Game data is git-ignored → SKIP when absent.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDqkSaveHeader,
  saveEnablesBeginAdventuring,
  DQK_SAVE_MIN_BYTES,
  decodeDqkSaveResume,
  patchDqkSaveResumeArea,
  DQK_SAVE_RESUME_MIN_BYTES,
  resumeCa03ForArea,
  DQK_QSV_ROSTER_OFFSET,
  DQK_QSV_ROSTER_OFFSET_AMIGA,
  readQsvLeadCharacterName,
  readQsvRoster,
  DQK_QSV_PARTY_SIZE_OFFSET,
  DQK_QSV_ITEM_COUNT_OFFSET,
  walkQsvRecords,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const savePath = resolve(repoRoot, 'The Dark Queen of Krynn', 'SAVGAMA.QSV');
const gogGamesRoot = 'C:/Program Files (x86)/GOG Galaxy/Games';
const dqkGogRoot = resolve(gogGamesRoot, 'The Dark Queen of Krynn');
const fruaGogRoot = resolve(gogGamesRoot, 'Unlimited Adventures');

/** Gate on declared sources, never on scan results or assertion outcomes. */
function corpusTest(requiredRoots: readonly string[]) {
  const missing = requiredRoots.filter((root) => !existsSync(root));
  return (title: string, run: () => void) => it.skipIf(missing.length > 0)(
    missing.length ? `${title} — missing source roots: ${missing.join(', ')}` : title,
    run,
  );
}

describe('decodeDqkSaveHeader — synthetic (field offsets)', () => {
  it('reads each documented byte field at its offset', () => {
    const buf = new Uint8Array(64);
    buf[1] = 1; // noMagic
    buf[5] = 2; // rounds
    buf[10] = 7; // years
    buf[16] = 3; // facing
    buf[17] = 4; // speed
    buf[18] = 2; // currentModule
    buf[21] = 4; // ECL member selector id
    buf[31] = 5; // partySize
    buf[36] = 9; // overland col
    buf[37] = 8; // overland row
    const h = decodeDqkSaveHeader(buf);
    expect(h.noMagic).toBe(1);
    expect(h.time.rounds).toBe(2);
    expect(h.time.years).toBe(7);
    expect(h.facing).toBe(3);
    expect(h.speed).toBe(4);
    expect(h.currentModule).toBe(2);
    expect(h.eclMemberId).toBe(4);
    expect(h.initiated).toBe(4);
    expect(h.partySize).toBe(5);
    expect(h.overlandPos).toEqual({ col: 9, row: 8 });
    expect(saveEnablesBeginAdventuring(h)).toBe(true);
  });

  it('treats an empty roster as not able to Begin, and rejects a too-short buffer', () => {
    const empty = decodeDqkSaveHeader(new Uint8Array(DQK_SAVE_MIN_BYTES));
    expect(empty.partySize).toBe(0);
    expect(saveEnablesBeginAdventuring(empty)).toBe(false);
    expect(() => decodeDqkSaveHeader(new Uint8Array(DQK_SAVE_MIN_BYTES - 1))).toThrow(/need ≥/);
  });
});

describe('decodeDqkSaveHeader — real shipped DQK SAVGAMA.QSV', () => {
  it.skipIf(!existsSync(savePath))('decodes the 6-character party the menu needs to enable Begin', () => {
    const h = decodeDqkSaveHeader(new Uint8Array(readFileSync(savePath)));
    expect(h.byteLength).toBe(7965); // the shipped save
    expect(h.partySize, 'DQK ships six pre-generated heroes').toBe(6);
    expect(h.speed).toBe(4);
    // A non-empty roster makes "Begin Adventuring" selectable (the E6.2 enabler).
    expect(saveEnablesBeginAdventuring(h)).toBe(true);
    // Gen2 drift, recorded as-shipped (NOT the value 4 the CoK-era SAVGAM.TXT predicts):
    expect(h.currentModule).toBe(0);
    expect(h.eclMemberId).toBe(0);
    expect(h.initiated).toBe(0);
  });
});

describe('patchDqkSaveResumeArea / decodeDqkSaveResume (E6.2b-2)', () => {
  // A minimal party-present save long enough to hold the DQK resume block.
  const baseSave = (partySize = 6) => {
    const s = new Uint8Array(DQK_SAVE_RESUME_MIN_BYTES + 8);
    s[31] = partySize; // Party Size gate
    return s;
  };

  it('writes the resume area + ECL member selector + init flags and reads them back', () => {
    const out = patchDqkSaveResumeArea(baseSave(), 16); // 16 = CoK overland; > 4 ⇒ not overland by default
    // Raw bytes match authentic nonzero-area DQK saves, not the older Gen1 recipe.
    expect(out[18]).toBe(16); // CurrentModule = resume area
    expect(out[21]).toBe(16); // loaded-save ECL member selector id
    expect(out[1029]).toBe(4); // area 16 > 4 → dungeon/other by default
    expect([out[1031], out[1033], out[1034], out[1035], out[1036]]).toEqual([2, 4, 0, 0, 0]);

    const r = decodeDqkSaveResume(out);
    expect(r).toEqual({ resumeArea: 16, eclMemberId: 16, initiated: true, overlandFlag: 4 });
  });

  it('can override the ECL member selector id when a fixture needs it', () => {
    const out = patchDqkSaveResumeArea(baseSave(), 58, { eclMemberId: 0x3a });
    expect(out[18]).toBe(58);
    expect(out[21]).toBe(0x3a);
    expect(decodeDqkSaveResume(out).eclMemberId).toBe(0x3a);
  });

  it('can stage a runtime position and DQK facing for movement/SearchLocation probes', () => {
    const out = patchDqkSaveResumeArea(baseSave(), 58, {
      eclMemberId: 0x3a,
      position: { x: 16, y: 15 },
      facing: 1,
    });
    expect(out[36]).toBe(16);
    expect(out[37]).toBe(15);
    expect(out[1024]).toBe(16);
    expect(out[1025]).toBe(15);
    expect(out[1026]).toBe(1);
  });

  it('requires the observed DQK second-block pattern for initiated=true', () => {
    const out = patchDqkSaveResumeArea(baseSave(), 16);
    out[1033] = 0;
    expect(decodeDqkSaveResume(out)).toEqual({ resumeArea: 16, eclMemberId: 16, initiated: false, overlandFlag: 4 });
  });

  it('defaults @1029 to the retail 4 for every area, and still honours the probe override', () => {
    // No retail save of any Gold Box title holds 3 here (see the dqkSave.ts header note), and the
    // byte does not vary with the overland/dungeon distinction it was named after: DQK areas
    // 4/58/66 and FRUA areas 5/14 all store 4. So the default no longer keys off the area id.
    expect(patchDqkSaveResumeArea(baseSave(), 1)[1029]).toBe(4);
    expect(patchDqkSaveResumeArea(baseSave(), 4)[1029]).toBe(4);
    expect(patchDqkSaveResumeArea(baseSave(), 16)[1029]).toBe(4);
    // The escape hatch survives, for reproducing the older probe builds byte-for-byte.
    expect(patchDqkSaveResumeArea(baseSave(), 16, { overland: true })[1029]).toBe(3);
  });

  it('does not mutate the input and rejects bad inputs', () => {
    const base = baseSave();
    const before = base.slice();
    patchDqkSaveResumeArea(base, 16);
    expect(Buffer.from(base).equals(Buffer.from(before))).toBe(true); // input untouched
    expect(() => patchDqkSaveResumeArea(base, 0)).toThrow(/out of the 1..255/);
    expect(() => patchDqkSaveResumeArea(base, 256)).toThrow(/out of the 1..255/);
    expect(() => patchDqkSaveResumeArea(base, 16, { eclMemberId: 0 })).toThrow(/ECL member id/);
    expect(() => patchDqkSaveResumeArea(base, 16, { eclMemberId: 256 })).toThrow(/ECL member id/);
    expect(() => patchDqkSaveResumeArea(base, 16, { position: { x: -1, y: 0 } })).toThrow(/position.x/);
    expect(() => patchDqkSaveResumeArea(base, 16, { position: { x: 0, y: 256 } })).toThrow(/position.y/);
    expect(() => patchDqkSaveResumeArea(base, 16, { facing: 256 })).toThrow(/facing/);
    expect(() => patchDqkSaveResumeArea(baseSave(0), 16)).toThrow(/empty roster/);
    expect(() => patchDqkSaveResumeArea(new Uint8Array(DQK_SAVE_RESUME_MIN_BYTES - 1), 16)).toThrow(/need ≥/);
  });

  it.skipIf(!existsSync(savePath))('turns the uninitiated shipped save into a CoK area-16 resume save', () => {
    const shipped = new Uint8Array(readFileSync(savePath));
    // The shipped save is uninitiated (fresh-start branch) — but note it already carries @1029=4,
    // which is why "4" cannot be read as "the dungeon value written when adventuring began".
    expect(decodeDqkSaveResume(shipped)).toEqual({ resumeArea: 0, eclMemberId: 0, initiated: false, overlandFlag: 4 });
    // Patch to resume CoK area 16; the roster (CCH records @1039+) is untouched.
    const resumed = patchDqkSaveResumeArea(shipped, 16);
    expect(decodeDqkSaveResume(resumed)).toEqual({ resumeArea: 16, eclMemberId: 16, initiated: true, overlandFlag: 4 });
    expect(resumed.byteLength).toBe(7965);
    // Roster bytes (the 6 embedded characters, from @1039) are byte-identical.
    expect(Buffer.from(resumed.subarray(1039)).equals(Buffer.from(shipped.subarray(1039)))).toBe(true);
    // Still a party-present save.
    expect(saveEnablesBeginAdventuring(decodeDqkSaveHeader(resumed))).toBe(true);
  });
});

/**
 * The second-block init values, pinned to every save this project holds rather than to
 * `hackdocs SAVGAM.TXT`.
 *
 * The hackdoc recipe `@1033=240, @1034=254, @1035=240, @1036=254` (and `@1029=3` for overland)
 * was carried in this loader's doc comment long after the code stopped writing it. It is not a
 * DQK pattern: it occurs in no retail save of any Gold Box title. The trap this test exists to
 * keep shut is circular evidence from generated saves. The scan below walks retail source
 * directories only and asserts the count is zero there; a synthetic positive control proves
 * the legacy-pattern search and byte-offset checks can detect the recipe.
 */
describe('DQK save second block, against every retail save we hold', () => {
  const retailRoots = [
    resolve(repoRoot, 'Champions of Krynn'),
    resolve(repoRoot, 'Death Knights of Krynn'),
    resolve(repoRoot, 'The Dark Queen of Krynn'),
    'C:/Program Files (x86)/GOG Galaxy/Games',
  ].filter((d) => existsSync(d));

  /** Every distinct `SAVGAM*` save file under `roots`, deduplicated by content. */
  function collectSaves(roots: readonly string[]): Uint8Array[] {
    const byHash = new Map<string, Uint8Array>();
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (ent.name.toUpperCase().startsWith('SAVGAM') && !ent.name.toUpperCase().endsWith('.TXT')) {
          const buf = new Uint8Array(readFileSync(full));
          if (buf.length >= DQK_SAVE_RESUME_MIN_BYTES) {
            byHash.set(createHash('sha1').update(buf).digest('hex'), buf);
          }
        }
      }
    };
    for (const r of roots) walk(r);
    return [...byHash.values()];
  }

  const retailSaves = (): Uint8Array[] => collectSaves(retailRoots);
  const retailIt = corpusTest([dqkGogRoot, fruaGogRoot]);
  const dqkIt = corpusTest([dqkGogRoot]);

  /** Does `b` contain the Gen1 `F0 FE F0 FE` init-flag pattern anywhere? */
  function holdsGen1Needle(b: Uint8Array): boolean {
    for (let i = 0; i + 4 <= b.length; i++) {
      if (b[i] === 0xf0 && b[i + 1] === 0xfe && b[i + 2] === 0xf0 && b[i + 3] === 0xfe) return true;
    }
    return false;
  }

  retailIt('holds 4 at @1029 in every save that has a second block — never 3', () => {
    const saves = retailSaves();
    expect(saves.length, 'the retail scan must actually find saves').toBeGreaterThanOrEqual(20);
    const withBlock = saves.filter((b) => b[1029] || b[1031] || b[1033]);
    expect(withBlock.length, 'saves carrying a nonzero second block').toBeGreaterThanOrEqual(10);
    // The named semantic ("3 = overland, 4 = dungeon") would need this byte to vary. It does not.
    expect([...new Set(withBlock.map((b) => b[1029]))]).toEqual([4]);
    // …across genuinely different resume areas, in two different games (DQK and FRUA).
    expect([...new Set(withBlock.map((b) => b[18]))].sort((x, y) => x - y).length).toBeGreaterThanOrEqual(4);
  });

  retailIt('never carries the Gen1 240/254 recipe, at the offsets or anywhere else', () => {
    const saves = retailSaves();
    expect(saves.filter((b) => b[1033] === 240).length).toBe(0);
    expect(saves.filter((b) => b[1034] === 254).length).toBe(0);
    expect(saves.filter(holdsGen1Needle).length).toBe(0);
  });

  /** Synthetic positive control, independent of generated-save availability or provenance. */
  it('finds the legacy recipe in a synthetic positive control at the documented offsets', () => {
    const legacy = new Uint8Array(DQK_SAVE_RESUME_MIN_BYTES);
    expect(holdsGen1Needle(legacy)).toBe(false);
    legacy[1029] = 3;
    legacy.set([240, 254, 240, 254], 1033);
    expect([legacy[1033], legacy[1034], legacy[1035], legacy[1036]]).toEqual([240, 254, 240, 254]);
    expect(holdsGen1Needle(legacy)).toBe(true);
    expect(legacy[1029]).toBe(3);
    legacy[1034] = 0;
    expect(holdsGen1Needle(legacy)).toBe(false);
  });

  dqkIt('shows @1033 varying by area while @1034..@1036 stay zero in DQK', () => {
    // Initiated DQK saves only (`@1031 = 2`); FRUA's own saves leave @1031 at 0.
    const initiated = retailSaves().filter((b) => b[1031] === 2);
    expect(initiated.length).toBeGreaterThanOrEqual(6);
    // Not a constant — so the 4 this loader writes is the commonest retail value, not a decode.
    expect([...new Set(initiated.map((b) => b[1033]))].sort((x, y) => x - y)).toEqual([1, 4, 5]);
    for (const b of initiated) expect([b[1034], b[1035], b[1036]]).toEqual([0, 0, 0]);
  });
});

/**
 * The `DS:ca03` word (`@1033`) — SOLVED 2026-08-22.
 *
 * It is the second operand of ECL opcode `0x21` (`LOAD_FILES`), whose `DQK.EXE` handler at file
 * offset `0x0420ac` writes operand 2 straight into `DS:ca03`. Each area's entry script opens
 * with a self-referential `LOAD_FILES #<own area>, #n`, and `n` is what the save stores.
 *
 * This test pins the corpus result AND its null. The null matters here more than usual: `1` is
 * the modal operand-2 value across DQK's areas, so a match to `1` alone would prove very little.
 */
describe('DQK save @1033 is the resume area\u2019s LOAD_FILES operand 2', () => {
  corpusTest([dqkGogRoot])('agrees with every retail save that names a resume area', () => {
    const roots = [
      resolve(repoRoot, 'The Dark Queen of Krynn'),
      'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    ].filter((r) => existsSync(r));
    const saves: Buffer[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.toLowerCase().endsWith('.qsv')) saves.push(readFileSync(full));
      }
    };
    for (const r of roots) walk(r);

    let hits = 0;
    let misses = 0;
    let degenerate = 0;
    const pairs = new Map<number, number>();
    for (const b of saves) {
      if (b.length < 1035) continue;
      const area = b.readUInt16LE(18);
      const ca03 = b.readUInt16LE(1033);
      // Zero-on-zero: an uninitiated save matches any rule and is evidence for none.
      if (area === 0 && ca03 === 0) {
        degenerate++;
        continue;
      }
      const expected = resumeCa03ForArea(area);
      if (expected === null) continue;
      pairs.set(area, ca03);
      if (expected === ca03) hits++;
      else misses++;
    }

    expect(misses).toBe(0);
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(degenerate).toBeGreaterThan(0); // the excluded class really exists
    // Three DISTINCT resume areas, not fifteen copies of one save.
    expect([...pairs.entries()].sort()).toEqual([
      [4, 4],
      [58, 1],
      [66, 5],
    ]);
  });

  it('NULL: 1 is the modal operand, so only area 66 is discriminating on its own', () => {
    // Derived from DISK3/ECL.GLB. If the table were noise, the observed areas would mostly land
    // on the modal value; area 66's 5 is unique across every area that states one.
    const values = [2, 4, 10, 18, 22, 30, 34, 38, 42, 46, 50, 54, 58, 62, 66].map(
      (a) => resumeCa03ForArea(a)!,
    );
    const count = (v: number) => values.filter((x) => x === v).length;
    expect(count(1)).toBe(8); // modal
    expect(count(4)).toBe(3);
    expect(count(5)).toBe(1); // area 66 alone
    expect(resumeCa03ForArea(66)).toBe(5);
  });

  it('returns null rather than guessing for areas whose script states no value', () => {
    // Area 14 issues two self-referential LOAD_FILES with different operands; area 26 passes the
    // 0xFF "leave ca03 alone" sentinel. Neither states a value, so neither may be invented.
    expect(resumeCa03ForArea(14)).toBeNull();
    expect(resumeCa03ForArea(26)).toBeNull();
    expect(resumeCa03ForArea(999)).toBeNull();
  });
});

/**
 * The inline character roster at {@link DQK_QSV_ROSTER_OFFSET}.
 *
 * A DQK save carries its party inline (VAULTA.DAT is the vault, not a character store), and the
 * record reuses MONCHA's own layout — name at `record + 0x68`. This test pins record 0's offset
 * against the whole retail save corpus, with a byte-granular offset scan as the null, and pins
 * the part that is NOT solved so the gap does not quietly get papered over.
 */
describe('DQK .QSV inline roster — record 0 is addressable, the stride is not', () => {
  const it = corpusTest([dqkGogRoot]);
  function allSaves(): { path: string; bytes: Buffer }[] {
    const roots = [
      resolve(repoRoot, 'The Dark Queen of Krynn'),
      'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    ].filter((r) => existsSync(r));
    const out: { path: string; bytes: Buffer }[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.toLowerCase().endsWith('.qsv')) out.push({ path: full, bytes: readFileSync(full) });
      }
    };
    for (const r of roots) walk(r);
    return out;
  }

  it('every standard-size retail save names its party leader at 1039 + 0x68', () => {
    const std = allSaves().filter((s) => s.bytes.length === 7965);
    expect(std.length).toBeGreaterThanOrEqual(20);

    const named = std.filter((s) => readQsvLeadCharacterName(new Uint8Array(s.bytes)) !== null);
    expect(named.length).toBe(std.length); // 28/28 at time of writing

    // NULL: the same predicate at every byte offset 0..300. A field boundary shows as a plateau
    // with a cliff, not as a lone spike — 104..107 all score full (a 1..3 byte shift still leaves
    // ≥3 printable chars of a longer name), then it collapses.
    const score = (off: number) =>
      std.filter((s) => readQsvLeadCharacterName(new Uint8Array(s.bytes), 1039 + off - 0x68) !== null)
        .length;
    expect(score(0x68)).toBe(std.length);
    expect(score(0x68 + 4)).toBeLessThan(std.length * 0.6); // the cliff
    expect(score(0x68 - 1)).toBe(0); // nothing before the field starts
    let bestElsewhere = 0;
    for (let off = 0; off <= 300; off++) {
      if (off >= 0x68 && off <= 0x68 + 3) continue;
      bestElsewhere = Math.max(bestElsewhere, score(off));
    }
    expect(bestElsewhere).toBeLessThan(std.length * 0.6);
  });

  it('the Amiga-native save shifts the roster by a constant 9 bytes, same in-record layout', () => {
    const odd = allSaves().filter((s) => s.bytes.length === 8188);
    expect(odd.length).toBeGreaterThan(0);
    for (const s of odd) {
      // The platform's pre-roster header length differs; the record layout does not.
      expect(readQsvLeadCharacterName(new Uint8Array(s.bytes))).toBeNull();
      expect(
        readQsvLeadCharacterName(new Uint8Array(s.bytes), DQK_QSV_ROSTER_OFFSET_AMIGA),
      ).toBe('CALDOR');
    }
  });

  it('UNSOLVED, pinned: the MONCHA tail formula does not explain the record stride', () => {
    // Recorded so the gap stays visible. In these live records the MONCHA count byte at 0x19e
    // reads far outside the 0..10 range real MONCHA members use, which is why
    // dqkRecordLength(affects, items) cannot be used to walk to record 1.
    const std = allSaves().filter((s) => s.bytes.length === 7965);
    expect(std.length).toBeGreaterThan(0);
    const counts = std.map((s) => s.bytes[DQK_QSV_ROSTER_OFFSET + 0x19e]!);
    expect(Math.max(...counts)).toBeGreaterThan(10);
    // And the reader deliberately exposes only record 0.
    expect(readQsvLeadCharacterName(new Uint8Array(std[0]!.bytes))).not.toBeNull();
  });
});

/**
 * The scan that replaces the stride we could not find.
 *
 * Reading a roster normally means "record 0 + stride". That is unavailable here (see
 * {@link readQsvRoster}'s note), so the records are located by a three-signal conjunction instead.
 * This test pins the agreement number AND all three nulls, because a scanner that finds things is
 * worthless without evidence that it does not find things everywhere.
 */
describe('DQK .QSV roster scan — located by signal, not by stride', () => {
  const it = corpusTest([dqkGogRoot]);
  function standardSaves(): Buffer[] {
    const roots = [
      resolve(repoRoot, 'The Dark Queen of Krynn'),
      'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    ].filter((r) => existsSync(r));
    const seen = new Map<string, Buffer>();
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.toLowerCase().endsWith('.qsv')) {
          const b = readFileSync(full);
          if (b.length === 7965) seen.set(createHash('sha1').update(b).digest('hex'), b);
        }
      }
    };
    for (const r of roots) walk(r);
    return [...seen.values()];
  }

  it('returns exactly partySize records in 11 of the 12 distinct retail saves', () => {
    const saves = standardSaves();
    expect(saves.length).toBe(12);

    const agree = saves.filter(
      (b) => readQsvRoster(new Uint8Array(b)).length === b[DQK_QSV_PARTY_SIZE_OFFSET],
    ).length;
    expect(agree).toBe(11);

    // The disagreement is a specific, named case — not "roughly one".
    const odd = saves.filter(
      (b) => readQsvRoster(new Uint8Array(b)).length !== b[DQK_QSV_PARTY_SIZE_OFFSET],
    );
    expect(odd.length).toBe(1);
    expect(odd[0]![DQK_QSV_PARTY_SIZE_OFFSET]).toBe(1);
    const names = readQsvRoster(new Uint8Array(odd[0]!)).map((e) => e.name);
    expect(names).toEqual(['CALDOR', 'CALDOR']); // one live record and, most likely, one stale one

    // And it finds real names, not printable noise that happens to satisfy the filter.
    const all = saves.flatMap((b) => readQsvRoster(new Uint8Array(b)).map((e) => e.name));
    expect(all).toContain('CAIN BLOODBANE');
    expect(all).toContain('ALARIC THE BOLD');
    expect(all).toContain('JORIS THE WISE');
    // No party record is flagged as a monster.
    expect(saves.every((b) => readQsvRoster(new Uint8Array(b)).every((e) => !e.isMonster))).toBe(true);
  });

  it('NULL: finds nothing in the pre-roster header, and nothing in shuffled bytes', () => {
    const saves = standardSaves();
    expect(saves.length).toBeGreaterThan(0);

    // NULL 1 — the same filter, run over the 1039 bytes BEFORE the roster.
    for (const b of saves) {
      const head = new Uint8Array(b.subarray(0, DQK_QSV_ROSTER_OFFSET + 0x1a0));
      expect(readQsvRoster(head, 0).filter((e) => e.offset + 0x84 < DQK_QSV_ROSTER_OFFSET)).toEqual([]);
    }

    // NULL 2 — a deterministic shuffle of the roster region destroys every hit. Same bytes, same
    // histogram, no structure.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const b of saves.slice(0, 4)) {
      const copy = new Uint8Array(b);
      const region = copy.subarray(DQK_QSV_ROSTER_OFFSET);
      for (let i = region.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = region[i]!; region[i] = region[j]!; region[j] = t;
      }
      expect(readQsvRoster(copy)).toEqual([]);
    }
  });

  it('NULL: the conjunction is what selects — each signal alone matches far more', () => {
    const saves = standardSaves();
    expect(saves.length).toBeGreaterThan(0);
    // Pick deterministically by content, not by directory order: the six-member save.
    const b = new Uint8Array(saves.find((x) => readQsvRoster(new Uint8Array(x)).length === 6)!);
    const end = b.length - 0x1a0;

    let flagAlone = 0, abilityAlone = 0;
    for (let off = DQK_QSV_ROSTER_OFFSET; off < end; off++) {
      const f = b[off + 0x66]!;
      if (f === 0 || f === 1) flagAlone++;
      let ok = true;
      for (let i = 0; i < 12 && ok; i++) {
        const v = b[off + 0x78 + i]!;
        if (v < 1 || v > 25) ok = false;
      }
      if (ok) abilityAlone++;
    }
    // Reported rather than assumed: the three signals are NOT equally strong.
    //   - the is-monster byte alone is nearly useless — thousands of offsets satisfy it;
    //   - the 12-byte ability window is the one doing the discriminating, but its strength varies
    //     a lot by save: across the 12 it matches 2, 6, 14, 14, 18, 19, 19, 19, 19, 31, 31 and 34
    //     offsets, so on two of them it happens to isolate the answer alone;
    //   - the padded name is what keeps the scan honest on the other eleven.
    // Saying "three signals" without this breakdown would overstate how much each contributes.
    expect(flagAlone).toBeGreaterThan(3000);
    expect(abilityAlone).toBeGreaterThanOrEqual(readQsvRoster(b).length);
    // …and on 10 of the 12 it is strictly looser than the answer, which is the point.
    const looser = saves.filter((x) => {
      const bb = new Uint8Array(x);
      let n = 0;
      for (let off = DQK_QSV_ROSTER_OFFSET; off < bb.length - 0x1a0; off++) {
        let ok = true;
        for (let i = 0; i < 12 && ok; i++) {
          const v = bb[off + 0x78 + i]!;
          if (v < 1 || v > 25) ok = false;
        }
        if (ok) n++;
      }
      return n > readQsvRoster(bb).length;
    });
    expect(looser.length).toBe(10);
    expect(readQsvRoster(b).length).toBe(6);

    const seven = saves.find((x) => x[DQK_QSV_PARTY_SIZE_OFFSET] === 7);
    if (seven) expect(readQsvRoster(new Uint8Array(seven)).length).toBe(7);
  });

  it('the NUL-padding requirement is load-bearing, not cosmetic', () => {
    const saves = standardSaves();
    expect(saves.length).toBeGreaterThan(0);
    const b = new Uint8Array(saves.find((x) => readQsvRoster(new Uint8Array(x)).length === 6)!);
    const roster = readQsvRoster(b);
    expect(roster.length).toBe(6);
    // Overwrite one record's name padding with a printable byte: that record must drop out.
    const mutated = new Uint8Array(b);
    mutated[roster[0]!.offset + 0x68 + 15] = 0x41;
    expect(readQsvRoster(mutated).length).toBe(5);
  });
});

/**
 * R2 — the roster's combat stats (THAC0/HP/level/AC/class code), reused from moncha.ts's
 * `decodeNpcRecord` at the SAME `+0x78` ability offset rather than re-derived. Pinned against the
 * one real shipped `SAVGAMA.QSV` — DQK's six pre-generated heroes (NOT the hand-authored
 * "Heroes of the Lance" `?dqk=1` roster: SIR DRYDEN, JORIS THE WISE, LENDUIRA, neacail, ALARIC THE
 * BOLD, MAIGUREIGNE).
 *
 * The class code is only checked against `referenceDb.ts`'s `NPC_CLASS_LABEL` enum
 * (`{2:'Fighter',5:'Mage',6:'Thief',8:'Cleric'}`, M37) as a REPORT, not a requirement: only
 * `neacail`'s code (6 -> Thief) lands inside it, and this test says so rather than silently
 * accepting or inventing a mapping for the other five (9, 11, 16, 130, 3) — see
 * `docs/engine/research/dqk-save-format.md` §6 and `importDqkParty.ts`'s own doc comment for how the
 * importer discloses this.
 */
describe('DQK .QSV roster — combat stats reused from moncha.ts (R2)', () => {
  const NPC_CLASS_LABEL: Record<number, string> = { 2: 'Fighter', 5: 'Mage', 6: 'Thief', 8: 'Cleric' };

  // `abilities` is the stored 12-byte (current, max) block in that order (str,int,wis,dex,con,cha).
  // LENDUIRA is the one case where current != max (STR 14 current vs 18 max — a drained stat, read
  // as-stored rather than smoothed to a single number).
  const EXPECTED = [
    { name: 'SIR DRYDEN', race: 6, abilities: [18, 18, 16, 16, 18, 18, 17, 17, 18, 18, 17, 17], thac0: 12, hp: 140, level: 11, ac: 10, classCode: 16 },
    { name: 'JORIS THE WISE', race: 0, abilities: [18, 18, 15, 15, 18, 18, 19, 19, 17, 17, 16, 16], thac0: 12, hp: 101, level: 10, ac: 10, classCode: 130 },
    { name: 'LENDUIRA', race: 1, abilities: [14, 18, 18, 18, 18, 18, 17, 17, 18, 18, 16, 16], thac0: 11, hp: 85, level: 9, ac: 10, classCode: 11 },
    { name: 'neacail', race: 5, abilities: [16, 16, 14, 14, 16, 16, 19, 19, 16, 16, 9, 9], thac0: 16, hp: 87, level: 12, ac: 10, classCode: 6 },
    { name: 'ALARIC THE BOLD', race: 1, abilities: [18, 18, 18, 18, 13, 13, 19, 19, 18, 18, 15, 15], thac0: 12, hp: 84, level: 10, ac: 10, classCode: 9 },
    { name: 'MAIGUREIGNE', race: 0, abilities: [18, 18, 18, 18, 18, 18, 18, 18, 17, 17, 16, 16], thac0: 14, hp: 73, level: 10, ac: 10, classCode: 3 },
  ];

  it('pins name, race, abilities and the new stat block for all six shipped records', () => {
    if (!existsSync(savePath)) return;
    const b = new Uint8Array(readFileSync(savePath));
    const roster = readQsvRoster(b);
    expect(roster.length).toBe(6);
    expect(roster.map((e) => e.name)).toEqual(EXPECTED.map((e) => e.name));

    const mappedCodes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const e = roster[i]!;
      const exp = EXPECTED[i]!;
      expect(e.race).toBe(exp.race);
      expect(e.abilities).toEqual(exp.abilities);
      expect(e.stats).not.toBeNull();
      const s = e.stats!;
      expect(s.thac0).toBe(exp.thac0);
      expect(s.hitPoints).toBe(exp.hp);
      expect(s.npcLevel).toBe(exp.level);
      expect(s.armorClass).toBe(exp.ac);
      expect(s.npcClass).toBe(exp.classCode);
      if (NPC_CLASS_LABEL[exp.classCode]) mappedCodes.push(exp.classCode);
    }
    // Only neacail's code (6) lands in the referenceDb enum — report the count, don't hide it.
    expect(mappedCodes).toEqual([6]);
  });

  it('MUTATION: moving the ability-block constant by one byte breaks the pinned stats', () => {
    if (!existsSync(savePath)) return;
    const b = new Uint8Array(readFileSync(savePath));
    const roster = readQsvRoster(b);
    const dryden = roster.find((e) => e.name === 'SIR DRYDEN')!;
    // Re-derive with the ability block shifted by +1 (0x79 instead of 0x78) using the same
    // decodeNpcRecord path this file's own reader uses — done here without importing an internal,
    // by hand-shifting the bytes the reader looks at: shift the whole record view by -1 so the
    // reader's fixed +0x78 lands on 0x79 of the true record.
    const shifted = b.slice();
    // Shift record content left by one (drop byte 0, append a filler byte) so any fixed-offset
    // reader now reads what used to be one byte later.
    const region = shifted.subarray(dryden.offset, dryden.offset + 0x1a0);
    region.set(shifted.subarray(dryden.offset + 1, dryden.offset + 0x1a0 + 1));
    const rerostered = readQsvRoster(shifted);
    const mutatedDryden = rerostered.find((e) => e.offset === dryden.offset);
    // The pinned THAC0/HP/level/AC no longer match: either the record drops out of the roster
    // scan entirely (name/ability window desyncs) or its stats no longer equal the true values.
    const stillMatches =
      mutatedDryden &&
      mutatedDryden.stats &&
      mutatedDryden.stats.thac0 === 12 &&
      mutatedDryden.stats.hitPoints === 140 &&
      mutatedDryden.stats.npcLevel === 11 &&
      mutatedDryden.stats.armorClass === 10 &&
      mutatedDryden.stats.npcClass === 16;
    expect(stillMatches).toBeFalsy();
  });

  it('NULL: shifting every record start by +1/-1 byte fails the ruleset range gates', () => {
    if (!existsSync(savePath)) return;
    const b = new Uint8Array(readFileSync(savePath));
    const roster = readQsvRoster(b);
    expect(roster.length).toBe(6);

    // True offset: all six clear the gates (thac0 0..30, hp 1..255, level 1..40, ac -12..16).
    const trueAccept = roster.filter((e) => e.stats !== null).length;
    expect(trueAccept).toBe(6);

    // Re-read the SAME six record starts, shifted by +1/-1, through the identical decode used above
    // (readQsvRosterStats is not exported, so this re-applies the documented deltas directly —
    // the exact null the R2 plan calls for).
    const TO_HIT_BASE = 60;
    const A = 0x78;
    const DELTA = { thac0: 15, hp: 17, level: 25, ac: 67, classCode: 71 };
    const acceptAt = (shift: number) => {
      let n = 0;
      for (const e of roster) {
        const base = e.offset + shift + A;
        const thac0raw = b[base + DELTA.thac0]!;
        const hp = b[base + DELTA.hp]!;
        const level = b[base + DELTA.level]!;
        const acRaw = b[base + DELTA.ac]!;
        const thac0 = TO_HIT_BASE - thac0raw;
        const ac = TO_HIT_BASE - acRaw;
        const ok = thac0 >= 0 && thac0 <= 30 && hp >= 1 && hp <= 255 && level >= 1 && level <= 40 && ac >= -12 && ac <= 16;
        if (ok) n++;
      }
      return n;
    };
    expect(acceptAt(0)).toBe(6);
    const plusOne = acceptAt(1);
    const minusOne = acceptAt(-1);
    // Report both counts: measured 0/6 at each shift (stricter than the plan's "≥5 of 6 rejected"
    // floor), not assumed.
    expect(plusOne).toBeLessThanOrEqual(1);
    expect(minusOne).toBeLessThanOrEqual(1);
  });
});

/**
 * The stride, solved: `walkQsvRecords` parses a `.QSV` roster forward with no scanning.
 *
 * The load-bearing assertion is not "it returns records" — it is that it returns the SAME record
 * boundaries as `readQsvRoster`, which locates records by content and shares no predicate with it.
 * Two independent methods agreeing on 61 boundaries is the evidence; either one alone is not.
 * Every perturbation below must therefore break the agreement, or the walk is not being tested.
 */
describe('DQK .QSV record stride — an exact forward walk, cross-checked against the scan', () => {
  const it = corpusTest([dqkGogRoot]);
  function distinctSaves(): Buffer[] {
    const roots = [
      resolve(repoRoot, 'The Dark Queen of Krynn'),
      'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    ].filter((r) => existsSync(r));
    const seen = new Map<string, Buffer>();
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.toLowerCase().endsWith('.qsv')) {
          const b = readFileSync(full);
          if (b.length === 7965) seen.set(createHash('sha1').update(b).digest('hex'), b);
        }
      }
    };
    for (const r of roots) walk(r);
    return [...seen.values()];
  }

  it('reproduces every boundary the independent content scan finds, in all 12 DOS saves', () => {
    const saves = distinctSaves();
    expect(saves.length).toBe(12);

    let files = 0;
    let records = 0;
    for (const buf of saves) {
      const b = new Uint8Array(buf);
      const spans = walkQsvRecords(b);
      expect(spans).not.toBeNull();
      const scanned = readQsvRoster(b).map((e) => e.offset);
      expect(spans!.map((r) => r.offset)).toEqual(scanned.slice(0, spans!.length));
      expect(spans!.length).toBe(b[DQK_QSV_PARTY_SIZE_OFFSET]);
      files++;
      records += spans!.length;
    }
    expect(files).toBe(12);
    expect(records).toBe(69);
  });

  it('the record really is fixed + items + affect nodes + terminator', () => {
    const saves = distinctSaves();
    expect(saves.length).toBeGreaterThan(0);
    for (const buf of saves) {
      const b = new Uint8Array(buf);
      for (const r of walkQsvRecords(b)!) {
        expect(r.length).toBe(0x1a1 + 17 * r.itemCount + 9 * r.affectNodes + 6);
        // the terminator: two data bytes, then a NULL far pointer, then the next record
        expect([...b.subarray(r.offset + r.length - 4, r.offset + r.length)]).toEqual([0, 0, 0, 0]);
        // the item count is mirrored, which is what lets the walk detect a bad start
        expect(b[r.offset + 0xc9]).toBe(b[r.offset + DQK_QSV_ITEM_COUNT_OFFSET]);
      }
    }
  });

  it('the walk is not trivially right — each ingredient, perturbed, must break it', () => {
    const saves = distinctSaves();
    expect(saves.length).toBeGreaterThan(0);
    // A save with a party of one passes any tail model (its only record start is fixed), so the
    // null is measured on the multi-character saves alone.
    const multi = saves.filter((b) => b[DQK_QSV_PARTY_SIZE_OFFSET]! > 1);
    expect(multi.length).toBe(11);

    const agrees = (b: Uint8Array) => {
      const spans = walkQsvRecords(b);
      if (spans === null) return false;
      const scanned = readQsvRoster(b).map((e) => e.offset);
      return JSON.stringify(spans.map((r) => r.offset)) === JSON.stringify(scanned.slice(0, spans.length));
    };
    expect(multi.every((b) => agrees(new Uint8Array(b)))).toBe(true);

    // Starting one byte off in either direction must fail everywhere: 0x40D is the party-size
    // word, not record 0, and 0x410 is one byte into the record.
    for (const start of [DQK_QSV_ROSTER_OFFSET - 2, DQK_QSV_ROSTER_OFFSET + 1]) {
      const hits = multi.filter((b) => {
        const spans = walkQsvRecords(new Uint8Array(b), start);
        return spans !== null && spans.length === b[DQK_QSV_PARTY_SIZE_OFFSET];
      }).length;
      expect(hits).toBe(0);
    }

    // Corrupting the item count must desynchronise the walk from the scan, not be absorbed.
    const b0 = new Uint8Array(multi[0]!);
    const first = walkQsvRecords(b0)![0]!;
    const bumped = new Uint8Array(b0);
    bumped[first.offset + DQK_QSV_ITEM_COUNT_OFFSET] = first.itemCount + 1;
    bumped[first.offset + 0xc9] = first.itemCount + 1;
    expect(agrees(bumped)).toBe(false);
  });

  it('the party-size word at 0x40D duplicates the header byte at 31', () => {
    const saves = distinctSaves();
    expect(saves.length).toBeGreaterThan(0);
    for (const b of saves) {
      expect(b.readUInt16LE(DQK_QSV_ROSTER_OFFSET - 2)).toBe(b[DQK_QSV_PARTY_SIZE_OFFSET]);
    }
    // The null: no other word in the 16 bytes before the roster does this in every save.
    const alsoMatches = [];
    for (let d = 2; d <= 16; d++) {
      if (saves.every((b) => b.readUInt16LE(DQK_QSV_ROSTER_OFFSET - d) === b[DQK_QSV_PARTY_SIZE_OFFSET])) {
        alsoMatches.push(d);
      }
    }
    expect(alsoMatches).toEqual([2]);
  });

  it('byte 0x08 is a count, not the low byte of a pointer', () => {
    const saves = distinctSaves();
    expect(saves.length).toBeGreaterThan(0);
    // The record DOES carry far pointers in its first bytes (0x5112:xxxx at +0x00, and the heap
    // pointer at +0x04), so "0x08 is just a pointer's low byte, and the item count is a
    // coincidence" is a live alternative. It is ruled out by the three bytes after it: a far
    // pointer's segment cannot be zero, and these are zero in every record.
    let checked = 0;
    for (const buf of saves) {
      const b = new Uint8Array(buf);
      for (const r of walkQsvRecords(b)!) {
        expect([b[r.offset + 9], b[r.offset + 0xa], b[r.offset + 0xb]]).toEqual([0, 0, 0]);
        checked++;
      }
    }
    expect(checked).toBe(69);
  });

  it('the affect nodes live in the heap block the record points at from +0x06', () => {
    const saves = distinctSaves();
    expect(saves.length).toBeGreaterThan(0);
    const word = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);

    let withNodes = 0;
    let matched = 0;
    const pairs: { rec: Uint8Array; seg: number }[] = [];
    for (const buf of saves) {
      const b = new Uint8Array(buf);
      for (const r of walkQsvRecords(b)!) {
        if (r.affectNodes === 0) continue;
        withNodes++;
        const rec = b.subarray(r.offset, r.offset + r.length);
        const listStart = 0x1a1 + 17 * r.itemCount;
        const segs: number[] = [];
        for (let k = 0; k < r.affectNodes; k++) segs.push(word(rec, listStart + 9 * k + 4));
        if (segs.every((v) => v === word(rec, 6))) {
          matched++;
          pairs.push({ rec, seg: segs[0]! });
        } else {
          // The one exception, named rather than smoothed over: the party-of-one save's record
          // was never fully written. Its whole +0x00..+0x07 pointer block is zero and its "nodes"
          // are 0xFF filler that the walk terminates on by accident. It is the same save whose
          // header claims a party of 1 while the scan finds two records both named CALDOR.
          expect(word(rec, 6)).toBe(0);
          expect(segs[0]).toBe(0xffff);
        }
      }
    }
    expect(withNodes).toBe(58);
    expect(matched).toBe(57);

    // The null: +0x06 is the ONLY offset in the whole 416-byte fixed part that does this, so the
    // match is a real pointer field rather than one of many bytes that happen to agree.
    const all: number[] = [];
    for (let o = 0; o < 0x1a0 - 1; o++) {
      if (pairs.every((x) => word(x.rec, o) === x.seg)) all.push(o);
    }
    expect(pairs.length).toBe(57);
    expect(all).toEqual([6]);
  });

  it('refuses the Amiga-native variant rather than guessing at it', () => {
    const roots = [
      resolve(repoRoot, 'The Dark Queen of Krynn'),
      'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    ].filter((r) => existsSync(r));
    let amiga: Buffer | null = null;
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.toLowerCase().endsWith('.qsv')) {
          const b = readFileSync(full);
          if (b.length === 8188) amiga = b;
        }
      }
    };
    for (const r of roots) walk(r);
    expect(amiga).not.toBeNull();
    // Its pointer fields are 32-bit big-endian 68000 addresses on a 10-byte stride, so the DOS
    // constants do not apply and the walk must say so.
    expect(walkQsvRecords(new Uint8Array(amiga!), DQK_QSV_ROSTER_OFFSET_AMIGA)).toBeNull();
  });
});
