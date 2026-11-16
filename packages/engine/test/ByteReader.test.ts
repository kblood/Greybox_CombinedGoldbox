import { describe, expect, it } from 'vitest';
import { ByteReader } from '../src/util/ByteReader';

describe('ByteReader contract', () => {
  it('uses offsets relative to a typed-array subview', () => {
    const backing = Uint8Array.of(0xee, 0xff, 0x12, 0x34, 0x56, 0x78, 0xdd);
    const reader = new ByteReader(backing.subarray(2, 6));

    expect(reader.length).toBe(4);
    expect(reader.remaining()).toBe(4);
    expect(reader.u8()).toBe(0x12);
    expect(reader.u16()).toBe(0x5634);
    expect(reader.u8At(3)).toBe(0x78);
    expect(reader.u16At(1)).toBe(0x5634);
    expect(reader.u32At(0)).toBe(0x78563412);
    expect([...reader.sliceAt(1, 2)]).toEqual([0x34, 0x56]);
    expect(reader.offset).toBe(3);
    expect(reader.remaining()).toBe(1);
  });

  it('decodes sequential u16/u32 as little-endian by default', () => {
    const reader = new ByteReader(Uint8Array.of(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc));

    expect(reader.u16()).toBe(0x3412);
    expect(reader.u32()).toBe(0xbc9a7856);
  });

  it('decodes sequential u16/u32 as explicit big-endian', () => {
    const reader = new ByteReader(Uint8Array.of(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc));

    expect(reader.u16(false)).toBe(0x1234);
    expect(reader.u32(false)).toBe(0x56789abc);
  });

  it('advances offset and reduces remaining after each sequential read', () => {
    const reader = new ByteReader(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
    const expectPosition = (offset: number, remaining: number) => {
      expect(reader.offset).toBe(offset);
      expect(reader.remaining()).toBe(remaining);
    };

    expectPosition(0, 9);
    expect(reader.u8()).toBe(1);
    expectPosition(1, 8);
    expect(reader.u16()).toBe(0x0302);
    expectPosition(3, 6);
    expect(reader.u32()).toBe(0x07060504);
    expectPosition(7, 2);
    expect([...reader.slice(2)]).toEqual([8, 9]);
    expectPosition(9, 0);
  });

  it('preserves the cursor after every random-access read', () => {
    const reader = new ByteReader(Uint8Array.of(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc));
    reader.u8();
    const expectPosition = () => {
      expect(reader.offset).toBe(1);
      expect(reader.remaining()).toBe(5);
    };

    expect(reader.u8At(3)).toBe(0x78);
    expectPosition();
    expect(reader.u16At(2)).toBe(0x7856);
    expectPosition();
    expect(reader.u16At(2, false)).toBe(0x5678);
    expectPosition();
    expect(reader.u32At(2)).toBe(0xbc9a7856);
    expectPosition();
    expect(reader.u32At(2, false)).toBe(0x56789abc);
    expectPosition();
    expect([...reader.sliceAt(3, 2)]).toEqual([0x78, 0x9a]);
    expectPosition();
    expect(reader.u8()).toBe(0x34);
  });

  it('returns shared views from slice and sliceAt, not copies', () => {
    const backing = Uint8Array.of(0xee, 1, 2, 3, 4, 0xff);
    const reader = new ByteReader(backing.subarray(1, 5));
    reader.u8();
    const sequential = reader.slice(2);
    const random = reader.sliceAt(1, 2);

    for (const view of [sequential, random]) {
      expect(view.buffer).toBe(backing.buffer);
      expect(view.byteOffset).toBe(backing.byteOffset + 2);
      expect(view.byteLength).toBe(2);
      expect([...view]).toEqual([2, 3]);
    }
    sequential[0] = 0x42;
    expect(backing[2]).toBe(0x42);
    expect(random[0]).toBe(0x42);
    backing[3] = 0x99;
    expect(sequential[1]).toBe(0x99);
    expect(random[1]).toBe(0x99);
    random[1] = 0x77;
    expect(backing[3]).toBe(0x77);
    expect(reader.offset).toBe(3);
    expect(reader.remaining()).toBe(1);
  });
});
