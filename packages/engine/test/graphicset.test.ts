/**
 * GraphicSetManager tests (M1.S2) — the live-switch + per-frame-fallback core.
 * Pure, no game data: builds tiny synthetic sets and asserts resolution order,
 * per-frame fallback, bounds-safe has(), switch events, and validation.
 */
import { describe, it, expect } from 'vitest';
import {
  createGraphicSetManager,
  type GraphicSet,
  type IndexedImage,
  type AssetKind,
} from '../src/index.js';

// Tiny 1×1 image tagged by a recognizable index value so we can assert provenance.
function img(tag: number): IndexedImage {
  return {
    width: 1,
    height: 1,
    indices: new Uint8Array([tag]),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  };
}

function frameMap(entries: [AssetKind, number, number][]): GraphicSet['frames'] {
  const m = new Map<AssetKind, Map<number, IndexedImage>>();
  for (const [cat, idx, tag] of entries) {
    if (!m.has(cat)) m.set(cat, new Map());
    m.get(cat)!.set(idx, img(tag));
  }
  return m;
}

const display = { width: 320, height: 200, pixelAspect: 1, defaultZoom: 2 };

// EGA has bigpic 0 and 1; Amiga has bigpic 0 and an exclusive sprite 5.
const ega: GraphicSet = {
  id: 'DOS-EGA',
  label: 'DOS EGA',
  display,
  frames: frameMap([
    ['bigpic', 0, 100],
    ['bigpic', 1, 101],
  ]),
  complete: true,
};
const amiga: GraphicSet = {
  id: 'Amiga',
  label: 'Amiga (32 colors)',
  display,
  frames: frameMap([
    ['bigpic', 0, 200],
    ['sprite', 5, 205],
  ]),
  complete: false,
};

describe('createGraphicSetManager', () => {
  it('exposes available/active/fallback', () => {
    const m = createGraphicSetManager([ega, amiga], { active: 'Amiga', fallback: ['Amiga', 'DOS-EGA'] });
    expect(m.available).toEqual(['DOS-EGA', 'Amiga']);
    expect(m.active).toBe('Amiga');
    expect(m.fallback).toEqual(['Amiga', 'DOS-EGA']);
    expect(m.activeSet().label).toBe('Amiga (32 colors)');
  });

  it('resolves the active set first', () => {
    const m = createGraphicSetManager([ega, amiga], { active: 'Amiga', fallback: ['Amiga', 'DOS-EGA'] });
    // bigpic 0 exists in both → active (Amiga, tag 200) wins.
    expect(m.resolve({ category: 'bigpic', index: 0 })?.indices[0]).toBe(200);
    expect(m.resolveSet({ category: 'bigpic', index: 0 })).toBe('Amiga');
  });

  it('falls back PER-FRAME when the active set lacks the index', () => {
    const m = createGraphicSetManager([ega, amiga], { active: 'Amiga', fallback: ['Amiga', 'DOS-EGA'] });
    // bigpic 1 is EGA-only → Amiga active misses → fall back to DOS-EGA (tag 101).
    expect(m.resolve({ category: 'bigpic', index: 1 })?.indices[0]).toBe(101);
    expect(m.resolveSet({ category: 'bigpic', index: 1 })).toBe('DOS-EGA');
  });

  it('returns null when no set has the frame', () => {
    const m = createGraphicSetManager([ega, amiga]);
    expect(m.resolve({ category: 'bigpic', index: 99 })).toBeNull();
    expect(m.resolveSet({ category: 'bigpic', index: 99 })).toBeNull();
  });

  it('has() is bounds-safe and set-specific (no fallback)', () => {
    const m = createGraphicSetManager([ega, amiga]);
    expect(m.has('Amiga', { category: 'sprite', index: 5 })).toBe(true);
    expect(m.has('DOS-EGA', { category: 'sprite', index: 5 })).toBe(false);
    expect(m.has('DOS-EGA', { category: 'bigpic', index: 1 })).toBe(true);
    // Unknown category / index never throws.
    expect(m.has('DOS-EGA', { category: 'cpic', index: 0 })).toBe(false);
  });

  it('setActive swaps the pointer and emits change; redraw resolves differently', () => {
    const m = createGraphicSetManager([ega, amiga], { active: 'DOS-EGA', fallback: ['DOS-EGA', 'Amiga'] });
    const seen: string[] = [];
    const off = m.on('change', (id) => seen.push(id));

    // Active EGA → bigpic 0 is EGA (100).
    expect(m.resolve({ category: 'bigpic', index: 0 })?.indices[0]).toBe(100);
    m.setActive('Amiga');
    expect(m.active).toBe('Amiga');
    expect(seen).toEqual(['Amiga']);
    // After switch → bigpic 0 now Amiga (200) with NO reload.
    expect(m.resolve({ category: 'bigpic', index: 0 })?.indices[0]).toBe(200);

    // No-op switch to the same id does not re-emit.
    m.setActive('Amiga');
    expect(seen).toEqual(['Amiga']);

    off();
    m.setActive('DOS-EGA');
    expect(seen).toEqual(['Amiga']); // unsubscribed
  });

  it('validates inputs', () => {
    expect(() => createGraphicSetManager([])).toThrow(/at least one/);
    expect(() => createGraphicSetManager([ega, ega])).toThrow(/duplicate/);
    expect(() => createGraphicSetManager([ega], { active: 'Nope' })).toThrow(/unknown set/);
    expect(() => createGraphicSetManager([ega], { fallback: ['Nope'] })).toThrow(/unknown set/);
    const m = createGraphicSetManager([ega]);
    expect(() => m.setActive('Nope')).toThrow(/unknown set/);
  });
});
