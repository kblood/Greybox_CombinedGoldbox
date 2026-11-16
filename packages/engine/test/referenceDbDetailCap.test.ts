/**
 * The Reference DB detail sheet TRUNCATES: `composeReferenceDb` renders only
 * `Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length)` rows (render/referenceDb.ts), with no
 * scrollbar, no ellipsis, and no warning anywhere in the panel or the status line. A record whose
 * flattened stat sheet is longer than the cap therefore loses its tail SILENTLY — the row simply
 * is not drawn, and nothing tells the player or the developer.
 *
 * Headroom is currently zero, and not for one exotic record: 17 real records already emit exactly
 * `REFERENCE_DB_DETAIL_ROWS` rows — CoK MON1CHA's SKELETON and ZOMBIE, CoK MON2CHA's ZOMBIE,
 * SKELETAL KNIGHT and SKELETAL DRAGON, and 12 DoK MON1CHA records including LICH, VAMPIRE MAGE,
 * TANAR and FLAVIUS (measured by running this test with the cap temporarily set to 12).
 * `apps/web/src/ui/referenceDb.ts`'s `monsterCategory` builds 10 unconditional rows
 * (AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class/Int) plus up to 7 conditional ones (Level, Save,
 * Save Roll, Regen, Half Dmg, Spells, Bonus XP), and every conditional row added since M38.S1 has
 * eaten into the margin. The next one to fire on any of those 17 disappears with no symptom.
 *
 * This test converts that invisible future data-loss bug into a loud gate: it builds the SAME
 * category rows the panel builds — by calling `apps/web`'s own `monsterCategory`/`itemCategory`/
 * `spellCategory`, not a reimplementation — over the real retail archives, with the same side
 * tables `explore.ts`'s dungeon-load pipeline joins on (SPC affects, ITM carried items, WIZ
 * prepared spells), and fails if any entry would exceed the cap.
 *
 * If this test goes red, the fix is to RAISE `REFERENCE_DB_DETAIL_ROWS` deliberately (and give the
 * sheet the screen rows to match — the detail column starts at row 5, and the status line sits at
 * row 22), or to drop a row from the builder. It is NOT to widen this assertion: the whole point is
 * that truncation is currently unobservable at runtime.
 *
 * Data-dependent parts skip cleanly when the retail folders are absent (repo convention); the
 * spell category is a static ruleset table and is always checked.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  REFERENCE_DB_DETAIL_ROWS,
  decodeMonsterArchive,
  decodeItemArchive,
  decodeMonsterSpcArchive,
  decodeMonsterItmArchive,
  decodeMonsterWizArchive,
  applyRegenAffect,
  applyHalfDamageAffect,
  applyConSavingBonus,
  applyItemPluses,
  applyCarriedItems,
  applyPreparedSpellIds,
  type MonsterRecord,
} from '../src/index.js';
import type { RefCategory } from '../../../apps/web/src/ui/referenceDb.js';

// `apps/web/src/ui/referenceDb.ts` transitively pulls in `render.ts`, which constructs a module-
// scope `IntersectionObserver` (its lazy-canvas painter). That global does not exist in this
// package's `environment: 'node'` Vitest config, and switching the whole engine suite to jsdom for
// one test would be a far bigger change than stubbing the one API. The stub is never called: this
// test only uses the pure table -> row builders, which touch no DOM. Import dynamically so the stub
// is installed before the module graph is evaluated (static imports hoist above it).
(globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ??=
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] { return []; }
  };
const { monsterCategory, itemCategory, spellCategory } =
  await import('../../../apps/web/src/ui/referenceDb.js');

const repo = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const bytesOf = (rel: string): Uint8Array | null => {
  const p = repo(rel);
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
};

/**
 * One archive family: the CHA bestiary plus the optional side tables that decide the conditional
 * rows. Mirrors the join order in `apps/web/src/ui/explore.ts`'s dungeon load.
 */
interface Family {
  label: string;
  cha: string;
  spc?: string;
  itm?: string;
  wiz?: string;
  profileId?: string;
}

const FAMILIES: Family[] = [
  {
    label: 'CoK MON1CHA',
    cha: 'Champions of Krynn/MON1CHA.DAX',
    spc: 'Champions of Krynn/MON1SPC.DAX',
    itm: 'Champions of Krynn/MON1ITM.DAX',
  },
  {
    label: 'CoK MON2CHA',
    cha: 'Champions of Krynn/MON2CHA.DAX',
    spc: 'Champions of Krynn/MON2SPC.DAX',
    itm: 'Champions of Krynn/MON2ITM.DAX',
  },
  {
    label: 'DoK MON1CHA',
    cha: 'Death Knights of Krynn/MON1CHA.DAX',
    spc: 'Death Knights of Krynn/MON1SPC.DAX',
    itm: 'Death Knights of Krynn/MON1ITM.DAX',
    wiz: 'Death Knights of Krynn/MON1WIZ.DAX',
  },
];

function loadFamily(f: Family): MonsterRecord[] | null {
  const cha = bytesOf(f.cha);
  if (!cha) return null;
  let records = decodeMonsterArchive(cha);
  if (records.length === 0) return null;
  const spcBytes = f.spc ? bytesOf(f.spc) : null;
  if (spcBytes) {
    const affects = decodeMonsterSpcArchive(spcBytes);
    records = applyHalfDamageAffect(applyRegenAffect(records, affects), affects);
    records = applyConSavingBonus(records, affects);
  }
  const itmBytes = f.itm ? bytesOf(f.itm) : null;
  if (itmBytes) {
    const itm = decodeMonsterItmArchive(itmBytes, f.profileId);
    records = applyItemPluses(records, itm);
    records = applyCarriedItems(records, itm);
  }
  const wizBytes = f.wiz ? bytesOf(f.wiz) : null;
  if (wizBytes) records = applyPreparedSpellIds(records, decodeMonsterWizArchive(wizBytes));
  return records;
}

/** Every entry whose detail sheet would be silently clipped, worst first. */
function overCap(cat: RefCategory): { name: string; rows: number }[] {
  return cat.details
    .map((rows, i) => ({ name: cat.entries[i]?.name ?? `#${i}`, rows: rows.length }))
    .filter((e) => e.rows > REFERENCE_DB_DETAIL_ROWS)
    .sort((a, b) => b.rows - a.rows);
}

const complaint = (label: string, over: { name: string; rows: number }[]) =>
  `${label}: ${over.length} entr${over.length === 1 ? 'y' : 'ies'} exceed ` +
  `REFERENCE_DB_DETAIL_ROWS=${REFERENCE_DB_DETAIL_ROWS}, so composeReferenceDb would silently ` +
  `truncate them (no scroll, no ellipsis, no warning): ` +
  `${over.slice(0, 8).map((e) => `${e.name}=${e.rows}`).join(', ')}. ` +
  `Raise the cap deliberately (and the screen rows with it) or drop a detail row — do not relax ` +
  `this assertion.`;

describe('Reference DB detail sheet fits inside REFERENCE_DB_DETAIL_ROWS', () => {
  let checkedAnyMonsterFamily = false;

  for (const family of FAMILIES) {
    it(`${family.label}: no monster entry exceeds the cap`, (ctx) => {
      const records = loadFamily(family);
      if (!records) {
        ctx.skip();
        return;
      }
      checkedAnyMonsterFamily = true;
      const cat = monsterCategory(records);
      expect(cat.details.length).toBe(records.length);
      const over = overCap(cat);
      expect(over, complaint(family.label, over)).toEqual([]);
    });
  }

  it('CoK ITEM1: no item entry exceeds the cap', (ctx) => {
    const bytes = bytesOf('Champions of Krynn/ITEM1.DAX');
    if (!bytes) {
      ctx.skip();
      return;
    }
    const items = decodeItemArchive(bytes).map((it) => ({
      name: it.name,
      baseTypeId: it.baseTypeId,
      count: it.count,
    }));
    expect(items.length).toBeGreaterThan(0);
    const cat = itemCategory(items);
    const over = overCap(cat);
    expect(over, complaint('CoK ITEM1', over)).toEqual([]);
  });

  it('COK_SPELLS: no spell entry exceeds the cap (static ruleset table, never skipped)', () => {
    const cat = spellCategory();
    expect(cat.entries.length).toBeGreaterThan(0);
    const over = overCap(cat);
    expect(over, complaint('COK_SPELLS', over)).toEqual([]);
  });

  // The point of the gate is HEADROOM, so record how much is left. This asserts nothing about the
  // cap's value; it fails only if the corpus produced no measurable rows at all, which would mean
  // the checks above passed vacuously.
  it('reports the corpus worst case, so a zero-headroom cap is visible in the log', (ctx) => {
    const worst: { name: string; rows: number; from: string }[] = [];
    for (const family of FAMILIES) {
      const records = loadFamily(family);
      if (!records) continue;
      for (const [i, rows] of monsterCategory(records).details.entries()) {
        worst.push({
          name: monsterCategory(records).entries[i]?.name ?? `#${i}`,
          rows: rows.length,
          from: family.label,
        });
      }
    }
    if (worst.length === 0) {
      expect(checkedAnyMonsterFamily).toBe(false); // every family really was absent
      ctx.skip();
      return;
    }
    worst.sort((a, b) => b.rows - a.rows);
    const top = worst[0]!;
    // eslint-disable-next-line no-console
    console.log(
      `[refdb cap] worst detail sheet: ${top.from} ${top.name} = ${top.rows} rows; ` +
      `cap = ${REFERENCE_DB_DETAIL_ROWS}; headroom = ${REFERENCE_DB_DETAIL_ROWS - top.rows}`,
    );
    expect(top.rows).toBeGreaterThan(0);
  });
});
