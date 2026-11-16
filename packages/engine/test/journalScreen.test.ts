/**
 * composeJournalScreen + wrapText (A5.4). Solid-font pixel asserts on the title, the entry list
 * (cursor white '>', unread '*' red marker, category colour, yellow entry number), the reading
 * pane header/body, and the command bar; plus word-wrap behaviour.
 */
import { describe, it, expect } from 'vitest';
import { makeBitmapFont } from '../src/render/textmode.js';
import { composeJournalScreen, wrapText, type JournalView } from '../src/index.js';

function solidFont() {
  const glyphs = new Uint8Array(256 * 8).fill(0xff);
  return makeBitmapFont(glyphs, 8, 8, 0, 256);
}
const px = (fb: { width: number; indices: Uint8Array }, x: number, y: number) =>
  fb.indices[y * fb.width + x];

const VIEW: JournalView = {
  title: 'Adventurer\'s Journal',
  entries: [
    { id: 1, title: 'Setting Out', category: 'story', read: false },
    { id: 7, title: 'A Quest', category: 'quest', read: true },
  ],
  cursor: 0,
  reading: { id: 1, title: 'Setting Out', body: 'The party leaves Solace at dawn.', category: 'story', day: 1 },
};

describe('composeJournalScreen', () => {
  it('composes a full 320×200 indexed framebuffer', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    expect(fb.width).toBe(320);
    expect(fb.height).toBe(200);
  });

  it('draws the title (white) at row 2', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 16)).toBe(15);
  });

  it('marks the cursor row white with a > and an unread * (red)', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    // cursor row 0 → screen row 5: '>' at col 2 (16,40) white; '*' at col 3 (24,40) red.
    expect(px(fb, 16, 40)).toBe(15);
    expect(px(fb, 24, 40)).toBe(12);
  });

  it('shows the entry number in yellow', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    // number at col 4 → pixel (32,40) yellow.
    expect(px(fb, 32, 40)).toBe(14);
  });

  it('renders the reading-pane header (white) and body (green)', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 13 * 8)).toBe(15); // header row 13 col 2 white
    expect(px(fb, 16, 14 * 8)).toBe(10); // body row 14 col 2 green
  });

  it('shows the recorded day (grey) at row 12 when the reading entry has one (M41.S1)', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: VIEW });
    expect(px(fb, 16, 12 * 8)).toBe(8); // "RECORDED — DAY 1" row 12 col 2 grey
  });

  it('omits the recorded-day row when day is 0/undefined (M41.S1 negative control)', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: { ...VIEW, reading: { ...VIEW.reading!, day: undefined } } });
    expect(px(fb, 16, 12 * 8)).toBe(0); // background, no fabricated day
  });

  it('shows the empty-pane hint when nothing is selected', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: { ...VIEW, reading: null } });
    expect(px(fb, 16, 14 * 8)).toBe(8); // grey hint
  });

  it('renders the command bar on the bottom row', () => {
    const fb = composeJournalScreen({
      font: solidFont(),
      view: VIEW,
      menu: { items: ['Read', 'Filter', 'Exit'], selected: 0 },
    });
    expect(px(fb, 8, 192)).toBe(15);
  });

  it('says the journal is empty when there are no entries', () => {
    const fb = composeJournalScreen({ font: solidFont(), view: { entries: [], cursor: -1 } });
    expect(px(fb, 24, 48)).toBe(8); // grey "THE JOURNAL IS EMPTY." at row 6 col 3
  });

  it('skips text when no font is provided', () => {
    const fb = composeJournalScreen({ view: VIEW });
    expect(px(fb, 16, 16)).toBe(0);
  });
});

describe('wrapText', () => {
  it('greedy-wraps to the column width on word boundaries', () => {
    const lines = wrapText('the quick brown fox jumps', 9);
    expect(lines).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('hard-breaks a word longer than the width', () => {
    const lines = wrapText('antidisestablishmentarianism', 10);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
    expect(lines.join('')).toBe('antidisestablishmentarianism');
  });

  it('preserves explicit newlines as paragraph breaks', () => {
    const lines = wrapText('a\n\nb', 20);
    expect(lines).toEqual(['a', '', 'b']);
  });
});
