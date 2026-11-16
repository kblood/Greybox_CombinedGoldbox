/**
 * Compose the **ECL inspector** screen (D4) into one indexed 320×200 framebuffer — a live debugger
 * view of the Gold Box event-script VM: a disassembly listing on the left (virtual address +
 * mnemonic + operands, the current program-counter row highlighted), and a state panel on the right
 * (PC, step count, run status, the six COAB compare flags, GOSUB call depth, and a few watched memory
 * cells). A bottom line shows the last emitted effect; a command bar offers Step / Run / Reset / Close.
 *
 * The compositor is dumb: the caller disassembles the block (engine `disassembleEclBlock` /
 * `formatInstruction`) and drives the VM (`EclVm.step`), then hands a window of formatted lines + the
 * VM state in. Pure / DOM-free, mirroring {@link composeJournalScreen}.
 */
import {
  createFramebuffer,
  fillRectIndexed,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  type IndexedFramebuffer,
} from './screen.js';
import { drawText, type BitmapFont } from './textmode.js';
import { drawHorizontalMenu } from './menuBar.js';
import { COK_FRAME_LAYOUT, drawOuterBorder, type ExploreFrameLayout } from './exploreScreen.js';
import type { IndexedImage } from '../model/index.js';

const C_BLACK = 0;
const C_GREEN = 10;
const C_WHITE = 15;
const C_YELLOW = 14;
const C_GREY = 8;
const C_RED = 12;
const C_CYAN = 11;

/** One disassembly row in the listing window. */
export interface EclDisasmLine {
  /** Virtual address of the instruction. */
  vaddr: number;
  /** Formatted "MNEMONIC operands" text (caller uses `formatInstruction`). */
  text: string;
  /** True for the current program-counter row (drawn highlighted with a '>'). */
  current?: boolean;
  /** True for an uncertain/undefined opcode (drawn in red). */
  uncertain?: boolean;
}

/** A watched memory cell shown in the state panel. */
export interface EclWatch {
  addr: number;
  value: number;
}

/** The VM state shown in the right-hand panel. */
export interface EclInspectorState {
  /** Current virtual address (PC). */
  vaddr: number;
  /** Steps executed so far. */
  step: number;
  /** Run status text, e.g. "running" / "exited" / "combat". */
  status: string;
  /** The six COAB compare flags (==, !=, <, >, <=, >=). */
  flags: readonly boolean[];
  /** GOSUB call-stack depth. */
  callDepth: number;
  /** Optional watched memory cells. */
  watches?: EclWatch[];
}

export interface EclInspectorView {
  /** Screen title; defaults to "ECL INSPECTOR". */
  title?: string;
  /** Block label, e.g. "ECL1 #18 GEN1". */
  label?: string;
  /** The disassembly window (already sliced to fit), in address order. */
  lines: EclDisasmLine[];
  /** The VM state panel. */
  state: EclInspectorState;
  /** Last emitted effect summary (bottom line). */
  effect?: string;
  /** Status / prompt line. */
  status?: string;
}

export interface EclInspectorInput {
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  view: EclInspectorView;
  menu?: { items: readonly string[]; selected: number } | null;
}

/** Visible disassembly rows (rows 4..16). */
export const ECL_INSPECTOR_LIST_ROWS = 13;
/** The six compare-flag glyphs, in COAB slot order. */
const FLAG_GLYPHS = ['=', '<>', '<', '>', '<=', '>='];

function hex4(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Build the ECL inspector screen as a 320×200 indexed framebuffer. Layout (8×8 cell grid):
 *   row 2  title (white)                    · row 2 col 24 block label (cyan)
 *   rows 4..16  disassembly (left cols 2..24; current row white '>'; uncertain red)
 *   rows 4..16  state panel (right cols 26..38: PC/STEP/STATUS/FLAGS/CALL/MEM)
 *   row 22 last effect                       · row 24 command bar
 */
export function composeEclInspector(input: EclInspectorInput): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_WIDTH, SCREEN_HEIGHT, C_BLACK);
  fillRectIndexed(fb, 8, 8, SCREEN_WIDTH - 16, 176, C_BLACK);

  const tiles = input.frameTiles ?? null;
  if (tiles) drawOuterBorder(fb, tiles, input.frameLayout ?? COK_FRAME_LAYOUT);

  const font = input.font ?? null;
  if (!font) return fb;

  const v = input.view;
  const cell = (col: number) => col * 8;
  const rowY = (r: number) => r * 8;

  drawText(fb, font, (v.title ?? 'ECL Inspector').toUpperCase(), cell(2), rowY(2), C_WHITE);
  if (v.label) drawText(fb, font, v.label.toUpperCase().slice(0, 14), cell(24), rowY(2), C_CYAN);

  // Disassembly listing (left column).
  const rows = Math.min(ECL_INSPECTOR_LIST_ROWS, v.lines.length);
  for (let i = 0; i < rows; i++) {
    const ln = v.lines[i]!;
    const r = 4 + i;
    const color = ln.current ? C_WHITE : ln.uncertain ? C_RED : C_GREEN;
    drawText(fb, font, ln.current ? '>' : ' ', cell(2), rowY(r), C_WHITE);
    drawText(fb, font, hex4(ln.vaddr), cell(3), rowY(r), ln.current ? C_YELLOW : C_GREY);
    drawText(fb, font, ln.text.toUpperCase().slice(0, 14), cell(8), rowY(r), color);
  }

  // State panel (right column).
  const sx = 26;
  const st = v.state;
  drawText(fb, font, `PC ${hex4(st.vaddr)}`, cell(sx), rowY(4), C_WHITE);
  drawText(fb, font, `STEP ${st.step}`, cell(sx), rowY(5), C_GREEN);
  drawText(fb, font, `ST ${st.status.toUpperCase().slice(0, 9)}`, cell(sx), rowY(6), C_YELLOW);
  drawText(fb, font, 'FLAGS', cell(sx), rowY(8), C_GREY);
  // Render the six compare-flag glyphs; set ones in white, clear ones grey.
  let fx = cell(sx);
  for (let i = 0; i < FLAG_GLYPHS.length; i++) {
    const g = FLAG_GLYPHS[i]!;
    drawText(fb, font, g, fx, rowY(9), st.flags[i] ? C_WHITE : C_GREY);
    fx += (g.length + 1) * 8;
  }
  drawText(fb, font, `CALL ${st.callDepth}`, cell(sx), rowY(11), C_GREEN);
  if (st.watches && st.watches.length > 0) {
    drawText(fb, font, 'MEM', cell(sx), rowY(13), C_GREY);
    st.watches.slice(0, 3).forEach((w, i) => {
      drawText(fb, font, `${hex4(w.addr)}=${w.value}`, cell(sx), rowY(14 + i), C_CYAN);
    });
  }

  if (v.effect) drawText(fb, font, v.effect.toUpperCase().slice(0, 36), cell(2), rowY(18), C_CYAN);
  if (v.status) drawText(fb, font, v.status.toUpperCase().slice(0, 36), cell(2), rowY(22), C_WHITE);

  if (input.menu && input.menu.items.length > 0) {
    drawHorizontalMenu(fb, font, input.menu.items, {
      x: cell(1),
      y: rowY(24),
      selected: input.menu.selected,
      idleColor: C_GREEN,
      selColor: C_WHITE,
    });
  }

  return fb;
}
