/**
 * Display scaling / aspect normalization tests. The core guarantee: every platform profile
 * that shares a display aspect (DOS/Amiga/C64 = 4:3) fits to the SAME on-screen rectangle, so
 * live mode-switching keeps the picture the same size — only the per-profile stretch differs.
 */
import { describe, it, expect } from 'vitest';
import {
  fitDisplayRect,
  pixelAspectRatio,
  DOS_EGA,
  AMIGA_PAL,
  C64,
  DISPLAY_PROFILES,
} from '../src/index.js';

describe('fitDisplayRect — platform normalization', () => {
  it('gives all 4:3 profiles the identical rectangle for a given container', () => {
    const dos = fitDisplayRect(DOS_EGA, 800, 600);
    const amiga = fitDisplayRect(AMIGA_PAL, 800, 600);
    const c64 = fitDisplayRect(C64, 800, 600);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(amiga[k]).toBeCloseTo(dos[k], 6);
      expect(c64[k]).toBeCloseTo(dos[k], 6);
    }
  });

  it('per-profile stretch differs even though the box is the same', () => {
    const dos = fitDisplayRect(DOS_EGA, 800, 600);
    const amiga = fitDisplayRect(AMIGA_PAL, 800, 600);
    expect(dos.scaleY).toBeCloseTo(600 / 200, 6); // 3.0
    expect(amiga.scaleY).toBeCloseTo(600 / 256, 6); // ~2.34
    expect(dos.scaleX).toBeCloseTo(800 / 320, 6); // 2.5 — same horizontal box
    expect(amiga.scaleX).toBeCloseTo(800 / 320, 6);
  });

  it('produces an aspect-correct box (square circles)', () => {
    const r = fitDisplayRect(DOS_EGA, 800, 600);
    expect(r.width / r.height).toBeCloseTo(4 / 3, 6);
  });

  it('pillarboxes a too-wide container (centres horizontally)', () => {
    const r = fitDisplayRect(DOS_EGA, 1000, 600);
    expect(r.height).toBeCloseTo(600, 6);
    expect(r.width).toBeCloseTo(800, 6);
    expect(r.x).toBeCloseTo(100, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('letterboxes a too-tall container (centres vertically)', () => {
    const r = fitDisplayRect(DOS_EGA, 800, 900);
    expect(r.width).toBeCloseTo(800, 6);
    expect(r.height).toBeCloseTo(600, 6);
    expect(r.y).toBeCloseTo(150, 6);
  });

  it('integer mode snaps height to whole native rows', () => {
    const r = fitDisplayRect(DOS_EGA, 800, 600, { integer: true });
    expect(r.height % DOS_EGA.nativeHeight).toBe(0);
    expect(r.width / r.height).toBeCloseTo(4 / 3, 6);
  });

  it('reports DOS 320×200@4:3 pixels as taller-than-wide (~0.833)', () => {
    expect(pixelAspectRatio(DOS_EGA)).toBeCloseTo(0.8333, 3);
    expect(pixelAspectRatio(AMIGA_PAL)).toBeCloseTo(1.0667, 3);
  });

  it('ships the three platform profiles in switch order', () => {
    expect(DISPLAY_PROFILES.map((p) => p.id)).toEqual(['dos-ega', 'amiga-pal', 'c64']);
  });
});
