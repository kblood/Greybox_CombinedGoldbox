/**
 * Automap model (D1) — engine-tracked visited cells + per-cell notes, serialisable.
 */
import { describe, it, expect } from 'vitest';
import { Automap } from '../src/world/automap.js';

describe('Automap — visited tracking', () => {
  it('records visited cells idempotently and reports newly-seen', () => {
    const m = new Automap(5, 4);
    expect(m.visitedCount).toBe(0);
    expect(m.isVisited(1, 1)).toBe(false);
    expect(m.visit(1, 1)).toBe(true); // newly seen
    expect(m.visit(1, 1)).toBe(false); // already seen
    expect(m.isVisited(1, 1)).toBe(true);
    expect(m.visitedCount).toBe(1);
    expect(m.indexOf(1, 1)).toBe(1 * 5 + 1);
  });

  it('ignores out-of-bounds coordinates', () => {
    const m = new Automap(3, 3);
    expect(m.visit(-1, 0)).toBe(false);
    expect(m.visit(3, 0)).toBe(false);
    expect(m.visit(0, 3)).toBe(false);
    expect(m.inBounds(2, 2)).toBe(true);
    expect(m.inBounds(3, 2)).toBe(false);
    expect(m.visitedCount).toBe(0);
    expect(m.indexOf(9, 9)).toBe(-1);
  });
});

describe('Automap — notes', () => {
  it('pins, reads, replaces and clears a note', () => {
    const m = new Automap(4, 4);
    expect(m.getNote(2, 1)).toBeNull();
    expect(m.setNote(2, 1, '  trap here  ')).toBe(true); // trimmed
    expect(m.getNote(2, 1)).toBe('trap here');
    expect(m.noteCount).toBe(1);
    m.setNote(2, 1, 'secret door'); // replace
    expect(m.getNote(2, 1)).toBe('secret door');
    expect(m.noteCount).toBe(1);
    expect(m.setNote(2, 1, '   ')).toBe(true); // empty clears
    expect(m.getNote(2, 1)).toBeNull();
    expect(m.noteCount).toBe(0);
  });

  it('clearNote and off-grid handling', () => {
    const m = new Automap(4, 4);
    expect(m.setNote(9, 9, 'x')).toBe(false); // off grid
    m.setNote(0, 0, 'start');
    expect(m.clearNote(0, 0)).toBe(true);
    expect(m.clearNote(0, 0)).toBe(false); // already gone
    expect(m.notes()).toEqual([]);
  });

  it('lists notes ordered by cell index with x,y', () => {
    const m = new Automap(5, 5);
    m.setNote(4, 0, 'east'); // index 4
    m.setNote(0, 2, 'south'); // index 10
    expect(m.notes()).toEqual([
      { x: 4, y: 0, text: 'east' },
      { x: 0, y: 2, text: 'south' },
    ]);
  });
});

describe('Automap — serialisation', () => {
  it('round-trips visited + notes through toJSON/fromJSON', () => {
    const m = new Automap(6, 5);
    m.visit(0, 0);
    m.visit(5, 4);
    m.setNote(2, 2, 'altar');
    const data = m.toJSON();
    expect(data).toEqual({
      width: 6,
      height: 5,
      visited: [0, 29],
      notes: [{ index: 14, text: 'altar' }],
    });
    const r = Automap.fromJSON(data);
    expect(r.width).toBe(6);
    expect(r.isVisited(0, 0)).toBe(true);
    expect(r.isVisited(5, 4)).toBe(true);
    expect(r.getNote(2, 2)).toBe('altar');
  });

  it('fromJSON tolerates null/garbage and uses fallback dimensions', () => {
    const a = Automap.fromJSON(null, 8, 8);
    expect(a.width).toBe(8);
    expect(a.visitedCount).toBe(0);
    // garbage indices / notes are dropped; a valid one survives
    const b = Automap.fromJSON({
      width: 4,
      height: 4,
      visited: [0, 999, -3, 5],
      notes: [{ index: 3, text: 'ok' }, { index: 99, text: 'drop' }, { index: 1, text: '   ' }],
    } as never);
    expect(b.visitedIndices()).toEqual([0, 5]);
    expect(b.noteCount).toBe(1);
    expect(b.getNote(3, 0)).toBe('ok');
  });

  it('reset clears everything but keeps dimensions', () => {
    const m = new Automap(3, 3);
    m.visit(1, 1);
    m.setNote(1, 1, 'x');
    m.reset();
    expect(m.visitedCount).toBe(0);
    expect(m.noteCount).toBe(0);
    expect(m.width).toBe(3);
  });
});
