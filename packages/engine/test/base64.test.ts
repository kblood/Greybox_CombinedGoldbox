/**
 * Base64 codec tests (M11.S4) — `module/base64.ts`, the pure DOM/Node-free `btoa`/`atob`
 * replacement `serialize.ts` uses to embed `IndexedImage.indices` in the portable `.gbmod` format.
 */
import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from '../src/module/base64.js';

describe('bytesToBase64 / base64ToBytes (M11.S4)', () => {
  it('round-trips the empty array', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 100, 257])('round-trips %d random bytes', (n) => {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips all-zero and all-0xff bytes', () => {
    const zeros = new Uint8Array(9);
    const ones = new Uint8Array(9).fill(255);
    expect(base64ToBytes(bytesToBase64(zeros))).toEqual(zeros);
    expect(base64ToBytes(bytesToBase64(ones))).toEqual(ones);
  });

  it('matches the known base64 encoding of a fixed byte sequence', () => {
    // "Man" -> "TWFu" is the textbook base64 worked example.
    const bytes = Uint8Array.from([0x4d, 0x61, 0x6e]);
    expect(bytesToBase64(bytes)).toBe('TWFu');
    expect(base64ToBytes('TWFu')).toEqual(bytes);
  });

  it('pads single/double trailing bytes correctly', () => {
    expect(bytesToBase64(Uint8Array.from([0x4d]))).toBe('TQ==');
    expect(bytesToBase64(Uint8Array.from([0x4d, 0x61]))).toBe('TWE=');
  });
});
