/**
 * A2.1 — the spell list, the pure memorization state machine, and the spellbook compositor.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  COK_SPELLS,
  knownSpells,
  spellsAtLevel,
  spellById,
  maxCastableLevel,
  emptyMemorization,
  memorize,
  forget,
  freeSlots,
  memorizedAt,
  memorizedCount,
  totalMemorized,
  composeSpellbook,
  type SpellbookView,
} from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) => fb.indices[y * fb.width + x];

describe('CoK spell list', () => {
  it('has unique ids and only levels 1–5', () => {
    const ids = new Set(COK_SPELLS.map((s) => s.id));
    expect(ids.size).toBe(COK_SPELLS.length); // no duplicate ids
    expect(COK_SPELLS.every((s) => s.level >= 1 && s.level <= 5)).toBe(true);
    expect(COK_SPELLS.every((s) => s.class === 'cleric' || s.class === 'magicUser')).toBe(true);
  });

  it('lists the iconic spells in the right class/level', () => {
    const mm = COK_SPELLS.find((s) => s.name === 'Magic Missile');
    expect(mm).toMatchObject({ class: 'magicUser', level: 1 });
    const fb = COK_SPELLS.find((s) => s.name === 'Fireball');
    expect(fb).toMatchObject({ class: 'magicUser', level: 3 });
    const cure = COK_SPELLS.find((s) => s.name === 'Cure Light Wounds');
    expect(cure).toMatchObject({ class: 'cleric', level: 1 });
  });

  it('caps known spells at the caster max level', () => {
    const mage3 = knownSpells('magicUser', 3);
    expect(mage3.every((s) => s.level <= 3)).toBe(true);
    expect(mage3.some((s) => s.level === 3)).toBe(true);
    expect(knownSpells('magicUser', 1).every((s) => s.level === 1)).toBe(true);
    expect(spellsAtLevel('cleric', 1).length).toBeGreaterThan(0);
  });

  it('maxCastableLevel reads the highest non-empty slot', () => {
    expect(maxCastableLevel([4, 2, 1, 0, 0])).toBe(3);
    expect(maxCastableLevel([0, 0, 0, 0, 0])).toBe(0);
    expect(maxCastableLevel([1])).toBe(1);
  });

  it('spellById resolves a known id', () => {
    const id = COK_SPELLS[0].id;
    expect(spellById(id)?.id).toBe(id);
    expect(spellById('nope')).toBeUndefined();
  });
});

describe('memorization model (immutable)', () => {
  it('memorizes up to the slot count and no further', () => {
    let mem = emptyMemorization();
    expect(freeSlots(mem, 1, 2)).toBe(2);
    mem = memorize(mem, 'm1-magic-missile', 1, 2);
    mem = memorize(mem, 'm1-magic-missile', 1, 2); // 2nd copy allowed
    expect(memorizedCount(mem, 'm1-magic-missile', 1)).toBe(2);
    const full = memorize(mem, 'm1-sleep', 1, 2); // no slot left
    expect(memorizedAt(full, 1).length).toBe(2);
    expect(freeSlots(full, 1, 2)).toBe(0);
  });

  it('forget removes exactly one copy', () => {
    let mem = emptyMemorization();
    mem = memorize(mem, 'm1-magic-missile', 1, 3);
    mem = memorize(mem, 'm1-magic-missile', 1, 3);
    mem = forget(mem, 'm1-magic-missile', 1);
    expect(memorizedCount(mem, 'm1-magic-missile', 1)).toBe(1);
    expect(totalMemorized(mem)).toBe(1);
  });

  it('does not mutate the input state', () => {
    const mem = emptyMemorization();
    const after = memorize(mem, 'x', 1, 1);
    expect(totalMemorized(mem)).toBe(0); // original untouched
    expect(totalMemorized(after)).toBe(1);
  });
});

describe('composeSpellbook', () => {
  const view: SpellbookView = {
    title: 'Raistlin — Mage 5',
    subtitle: 'Memorize Spells',
    rows: [
      { text: 'Level 1   1/4', header: true },
      { text: 'Magic Missile', selected: true, count: 2 },
      { text: 'Sleep' },
    ],
  };

  it('composes a full 320×200 framebuffer with a selected row in white', () => {
    const fb = composeSpellbook({ font: solidFont(), view, menu: { items: ['Memorize', 'Exit'], selected: 0 } });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
    // The selected spell ("Magic Missile") is on list row index 1 → cell row 6, drawn at col 4 white.
    expect(px(fb, 4 * 8, 6 * 8)).toBe(15);
  });

  it('skips text without a font', () => {
    const fb = composeSpellbook({ view });
    expect(px(fb, 16, 16)).toBe(0);
  });

  it('M98 — draws an optional note on row 4, between the subtitle and the spell list, in green', () => {
    const withNote: SpellbookView = { ...view, note: 'Charm Person, Remove Curse, Bless' };
    const fb = composeSpellbook({ font: solidFont(), view: withNote });
    expect(px(fb, 2 * 8, 4 * 8)).toBe(10); // C_GREEN, same colour as the subtitle
    // With no note (the pre-M98 shape), row 4 stays untouched/black.
    const fbNoNote = composeSpellbook({ font: solidFont(), view });
    expect(px(fbNoNote, 2 * 8, 4 * 8)).toBe(0);
  });
});
