/**
 * ECL inspector (D4) — two halves:
 *   1) EclVm.step() single-stepping over a synthetic block: mnemonic sequence, per-step status
 *      (running → chain → exited), the done flip at EXIT, a SAVE memory write, and the six
 *      compare flags / call depth getters used by the inspector panel.
 *   2) composeEclInspector pixel asserts on a solid font: title, the current-PC row (white '>'),
 *      a non-current row (green), and a set compare flag (white) vs a clear one (grey).
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import {
  EclVm,
  ECL_HEADER_LEN,
  composeEclInspector,
  type EclDisasmLine,
} from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const C_GREEN = 10;
const C_WHITE = 15;
const C_GREY = 8;

function makeBlock(body: number[]): Uint8Array {
  const header = new Uint8Array(ECL_HEADER_LEN);
  header[0] = 0x88;
  header[1] = 0x13; // magic = 0x1388
  return new Uint8Array([...header, ...body]);
}

describe('EclVm.step — single-step the inspector drives', () => {
  it('walks SAVE → EXIT: running then exited, with the done flip and a SAVE write', () => {
    // SAVE #7 → mem[0x0050]; EXIT.
    const vm = new EclVm(makeBlock([0x09, 0x00, 0x07, 0x01, 0x50, 0x00, 0x00]));

    const s1 = vm.step();
    expect(s1.instruction?.mnemonic).toBe('SAVE');
    expect(s1.status).toBe('running');
    expect(s1.done).toBe(false);
    expect(vm.memory.get(0x0050)).toBe(7); // SAVE wrote the immediate

    const s2 = vm.step();
    expect(s2.instruction?.mnemonic).toBe('EXIT');
    expect(s2.status).toBe('exited');
    expect(s2.done).toBe(true);

    // Stepping a finished VM is a no-op that stays exited.
    const s3 = vm.step();
    expect(s3.instruction).toBeNull();
    expect(s3.done).toBe(true);
  });

  it('reports NEWECL as a chain that finishes this block', () => {
    // SAVE #7 → mem[0x0050]; NEWECL #5 (terminates the block, host loads block 5).
    const vm = new EclVm(makeBlock([0x09, 0x00, 0x07, 0x01, 0x50, 0x00, 0x20, 0x00, 0x05]));

    expect(vm.step().instruction?.mnemonic).toBe('SAVE');

    const chain = vm.step();
    expect(chain.instruction?.mnemonic).toBe('NEWECL');
    expect(chain.status).toBe('chain');
    expect(chain.chainBlockId).toBe(5);
    expect(chain.done).toBe(true); // NEWECL ends this block's VM
  });

  it('exposes the six compare flags and the call depth', () => {
    const vm = new EclVm(makeBlock([0x00]));
    expect(vm.compareFlags).toHaveLength(6);
    expect(vm.compareFlags.every((f) => f === false)).toBe(true);
    expect(vm.callDepth).toBe(0);
  });
});

describe('composeEclInspector', () => {
  const lines: EclDisasmLine[] = [
    { vaddr: 0x8014, text: 'SAVE #7, 0050', current: true },
    { vaddr: 0x801a, text: 'NEWECL #5' },
  ];
  const view = {
    title: 'ECL Inspector',
    label: 'ECL1 #18',
    lines,
    state: {
      vaddr: 0x8014,
      step: 1,
      status: 'running',
      flags: [true, false, false, false, false, false] as const,
      callDepth: 0,
    },
    effect: 'save 7 -> 0050',
    status: 'S=STEP  R=RESET',
  };

  it('draws the title and a 320×200 framebuffer', () => {
    const fb = composeEclInspector({ font: solidFont(), view });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
    // Title at col 2 row 2 → white glyph block.
    expect(px(fb, 2 * 8 + 1, 2 * 8 + 1)).toBe(C_WHITE);
  });

  it('highlights the current PC row white and a non-current row green', () => {
    const fb = composeEclInspector({ font: solidFont(), view });
    // Current row (i=0 → row 4): '>' marker at col 2 is white, and the body text is white.
    expect(px(fb, 2 * 8 + 1, 4 * 8 + 1)).toBe(C_WHITE);
    expect(px(fb, 8 * 8 + 1, 4 * 8 + 1)).toBe(C_WHITE);
    // Non-current row (i=1 → row 5): body text green.
    expect(px(fb, 8 * 8 + 1, 5 * 8 + 1)).toBe(C_GREEN);
  });

  it('renders a set compare flag white and a clear one grey', () => {
    const fb = composeEclInspector({ font: solidFont(), view });
    const sx = 26;
    // Flags row is row 9. First glyph '=' is set → white at col sx.
    expect(px(fb, sx * 8 + 1, 9 * 8 + 1)).toBe(C_WHITE);
    // Second glyph '<>' (2 chars) starts at sx + (1+1) cols → clear → grey.
    expect(px(fb, (sx + 2) * 8 + 1, 9 * 8 + 1)).toBe(C_GREY);
  });
});
