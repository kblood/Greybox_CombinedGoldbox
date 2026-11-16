import { describe, it, expect } from 'vitest';
import {
  createEmptySlotMapping,
  assignSlot,
  unassignSlot,
  validateSlotMapping,
  serializeSlotMapping,
  deserializeSlotMapping,
  DQK_ART_LAYOUT,
  type AmigaSlotMapping,
} from '../src/index.js';

describe('createEmptySlotMapping (M8.S3)', () => {
  it('starts with no assignments — the correct default (a human must choose, nothing is auto-populated)', () => {
    const m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    expect(m).toEqual({ target: 'SPRIT.TLB', source: 'SPRIT1.DAA', assignments: [] });
  });
});

describe('assignSlot / unassignSlot (M8.S3)', () => {
  it('adds an assignment and is immutable (does not mutate the input)', () => {
    const base = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    const next = assignSlot(base, 5, 17, 2);
    expect(base.assignments).toEqual([]);
    expect(next.assignments).toEqual([{ slot: 5, sourceBlockId: 17, frameIndex: 2 }]);
  });

  it('replaces an existing assignment at the same slot rather than duplicating it', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 5, 17, 2);
    m = assignSlot(m, 5, 20, 0);
    expect(m.assignments).toEqual([{ slot: 5, sourceBlockId: 20, frameIndex: 0 }]);
  });

  it('keeps assignments sorted by slot', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 5, 1, 0);
    m = assignSlot(m, 2, 2, 0);
    m = assignSlot(m, 9, 3, 0);
    expect(m.assignments.map((a) => a.slot)).toEqual([2, 5, 9]);
  });

  it('rejects a negative or non-integer slot', () => {
    const base = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    expect(() => assignSlot(base, -1, 0, 0)).toThrow();
    expect(() => assignSlot(base, 1.5, 0, 0)).toThrow();
  });

  it('unassignSlot removes only the targeted slot and is a no-op if unassigned', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 1, 10, 0);
    m = assignSlot(m, 2, 11, 0);
    const removed = unassignSlot(m, 1);
    expect(removed.assignments).toEqual([{ slot: 2, sourceBlockId: 11, frameIndex: 0 }]);
    expect(unassignSlot(removed, 99)).toEqual(removed);
  });
});

describe('validateSlotMapping (M8.S3)', () => {
  it('accepts a valid mapping against real DQK_ART_LAYOUT data (SPRIT.TLB, shape-mismatch, 96 slots)', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 0, 17, 0);
    m = assignSlot(m, 95, 17, 50);
    const result = validateSlotMapping(m, DQK_ART_LAYOUT);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an unknown target', () => {
    const m = createEmptySlotMapping('NOPE.TLB', 'x.DAA');
    const result = validateSlotMapping(m, DQK_ART_LAYOUT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown target'))).toBe(true);
  });

  it('rejects a target whose verdict is not shape-mismatch (BIGPIC.TLB is portable-master)', () => {
    const m = createEmptySlotMapping('BIGPIC.TLB', 'BIGPIC1.DAA');
    const result = validateSlotMapping(m, DQK_ART_LAYOUT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not shape-mismatch'))).toBe(true);
  });

  it('rejects an out-of-range slot for the target real imageCount', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 96, 17, 0); // SPRIT.TLB has imageCount 96 -> valid slots are 0..95
    const result = validateSlotMapping(m, DQK_ART_LAYOUT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('out of range'))).toBe(true);
  });

  it('rejects a hand-built mapping with a duplicate slot (bypassing assignSlot)', () => {
    const m: AmigaSlotMapping = {
      target: 'SPRIT.TLB',
      source: 'SPRIT1.DAA',
      assignments: [
        { slot: 3, sourceBlockId: 1, frameIndex: 0 },
        { slot: 3, sourceBlockId: 2, frameIndex: 0 },
      ],
    };
    const result = validateSlotMapping(m, DQK_ART_LAYOUT);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate assignment'))).toBe(true);
  });
});

describe('serializeSlotMapping / deserializeSlotMapping (M8.S3)', () => {
  it('round-trips a mapping through JSON', () => {
    let m = createEmptySlotMapping('SPRIT.TLB', 'SPRIT1.DAA');
    m = assignSlot(m, 1, 17, 0);
    m = assignSlot(m, 2, 17, 1);
    const json = serializeSlotMapping(m);
    expect(deserializeSlotMapping(json)).toEqual(m);
  });

  it('throws on malformed JSON', () => {
    expect(() => deserializeSlotMapping('not json')).toThrow();
  });

  it('throws on well-formed JSON that is not AmigaSlotMapping-shaped', () => {
    expect(() => deserializeSlotMapping(JSON.stringify({ foo: 'bar' }))).toThrow();
    expect(() => deserializeSlotMapping(JSON.stringify({ target: 't', source: 's', assignments: [{ slot: 'x' }] }))).toThrow();
  });
});
