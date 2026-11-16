import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScreenSurface } from '../../ui-kit/src/screenSurface.js';
import { createFramebuffer, makeEgaPalette } from '../src/index.js';

interface FakeCanvas {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  className: string;
  getContext: () => {
    createImageData: (w: number, h: number) => { data: Uint8ClampedArray };
    putImageData: (data: { data: Uint8ClampedArray }, x: number, y: number) => void;
    drawImage: (...args: unknown[]) => void;
    fillRect: (...args: unknown[]) => void;
    imageSmoothingEnabled: boolean;
    fillStyle: string;
  };
  lastPixels?: Uint8ClampedArray;
  blits: number;
}

function canvas(): FakeCanvas {
  const element: FakeCanvas = {
    width: 0, height: 0, clientWidth: 320, clientHeight: 200, className: '', blits: 0,
    getContext: () => context,
  };
  const context = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (data: { data: Uint8ClampedArray }) => { element.lastPixels = new Uint8ClampedArray(data.data); },
    drawImage: () => { element.blits++; },
    fillRect: () => {}, imageSmoothingEnabled: true, fillStyle: '',
  };
  return element;
}

afterEach(() => vi.unstubAllGlobals());

describe('shared ScreenSurface RGBA path (web + author)', () => {
  it('keeps high-resolution colors on resize and can return to ordinary indexed rendering', () => {
    const created: FakeCanvas[] = [];
    vi.stubGlobal('document', { createElement: () => {
      const next = canvas(); created.push(next); return next;
    } });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', undefined);
    const surface = createScreenSurface({ nativeWidth: 2, nativeHeight: 1, displayAspect: 2 });
    const off = created[1];
    surface.paintRgba({ width: 4, height: 2, pixels: new Uint8ClampedArray([
      ...Array.from({ length: 8 }, (_, i) => [i * 20 + 3, 8, 9, 255]).flat(),
    ]) });
    expect([off.width, off.height]).toEqual([4, 2]);
    expect([...off.lastPixels!.slice(0, 4)]).toEqual([3, 8, 9, 255]);
    expect([...off.lastPixels!.slice(28, 32)]).toEqual([143, 8, 9, 255]);
    const before = created[0].blits;
    surface.setFitOptions({ integer: true });
    surface.refresh();
    expect(created[0].blits).toBe(before + 2);
    expect([off.width, off.height]).toEqual([4, 2]);
    surface.paint(createFramebuffer(2, 1, 15), makeEgaPalette());
    expect([off.width, off.height]).toEqual([2, 1]);
    expect([...off.lastPixels!.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    surface.dispose();
  });

  it('rejects invalid RGBA screen geometry before touching the canvas', () => {
    const created: FakeCanvas[] = [];
    vi.stubGlobal('document', { createElement: () => {
      const next = canvas(); created.push(next); return next;
    } });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', undefined);
    const surface = createScreenSurface({ nativeWidth: 2, nativeHeight: 1, displayAspect: 2 });
    expect(() => surface.paintRgba({ width: 2, height: 1, pixels: new Uint8ClampedArray(4) }))
      .toThrow(/invalid RGBA screen/);
    expect(created[0].blits).toBe(0);
    surface.dispose();
  });
});
