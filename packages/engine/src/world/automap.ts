/**
 * Automap (D1) — an engine-tracked record of which dungeon cells the party has walked, plus the
 * player's own pinned notes per cell.
 *
 * The DOS Gold Box games had **no** in-game map — players drew grids on graph paper (the manuals
 * even ship blank ones). Greybox's exploration screen already shades visited cells on a live canvas,
 * but that state lived only in the explore view's memory. This module lifts it into the engine as a
 * small, pure, serialisable model so it can be (a) persisted across sessions / into a save, (b) shown
 * in a dedicated **Automap panel**, and (c) unit-tested without a DOM — mirroring {@link Journal}.
 *
 * The model is scoped to one map's `width × height` grid; cells are addressed `index = y*width + x`
 * (the same row-major convention as {@link GameMap}). `visit` records a discovered cell; `setNote`
 * pins a short text label to a cell (a found key, a riddle, "trap here"). Everything round-trips
 * through {@link toJSON}/{@link fromJSON} so a host can stash it in localStorage or a save file.
 */

/** A player-pinned note at a cell. */
export interface AutomapNote {
  x: number;
  y: number;
  text: string;
}

/** The serialisable shape ({@link Automap.toJSON} emits / {@link Automap.fromJSON} accepts). */
export interface AutomapData {
  width: number;
  height: number;
  /** Linear indices (`y*width + x`) of every visited cell. */
  visited: number[];
  /** Pinned notes, `{ index, text }` per cell. */
  notes: Array<{ index: number; text: string }>;
}

export class Automap {
  readonly width: number;
  readonly height: number;
  private readonly visitedSet = new Set<number>();
  private readonly noteMap = new Map<number, string>();

  constructor(width: number, height: number, data?: Partial<AutomapData> | null) {
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    if (data?.visited) for (const i of data.visited) if (this.validIndex(i)) this.visitedSet.add(i);
    if (data?.notes) {
      for (const n of data.notes) {
        if (n && this.validIndex(n.index) && typeof n.text === 'string' && n.text.trim()) {
          this.noteMap.set(n.index, n.text.trim());
        }
      }
    }
  }

  private validIndex(i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < this.width * this.height;
  }

  /** Row-major cell index, or -1 if `(x,y)` is off the grid. */
  indexOf(x: number, y: number): number {
    return this.inBounds(x, y) ? y * this.width + x : -1;
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Record a discovered cell. Returns true only the **first** time a cell is seen (so a caller can
   * count "N new tiles this step"). Off-grid coordinates are ignored and return false. */
  visit(x: number, y: number): boolean {
    const i = this.indexOf(x, y);
    if (i < 0 || this.visitedSet.has(i)) return false;
    this.visitedSet.add(i);
    return true;
  }

  isVisited(x: number, y: number): boolean {
    const i = this.indexOf(x, y);
    return i >= 0 && this.visitedSet.has(i);
  }

  get visitedCount(): number {
    return this.visitedSet.size;
  }

  /** Visited cell indices, ascending. */
  visitedIndices(): number[] {
    return [...this.visitedSet].sort((a, b) => a - b);
  }

  /**
   * Pin (or replace) a note on a cell. An empty/whitespace `text` **clears** any existing note.
   * Returns true when a note was set or cleared, false when `(x,y)` is off-grid.
   */
  setNote(x: number, y: number, text: string): boolean {
    const i = this.indexOf(x, y);
    if (i < 0) return false;
    const t = (text ?? '').trim();
    if (t) this.noteMap.set(i, t);
    else this.noteMap.delete(i);
    return true;
  }

  getNote(x: number, y: number): string | null {
    const i = this.indexOf(x, y);
    return i >= 0 ? this.noteMap.get(i) ?? null : null;
  }

  clearNote(x: number, y: number): boolean {
    const i = this.indexOf(x, y);
    if (i < 0 || !this.noteMap.has(i)) return false;
    this.noteMap.delete(i);
    return true;
  }

  get noteCount(): number {
    return this.noteMap.size;
  }

  /** All pinned notes as `{x,y,text}`, ordered by cell index. */
  notes(): AutomapNote[] {
    return [...this.noteMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, text]) => ({ x: i % this.width, y: Math.floor(i / this.width), text }));
  }

  /** Forget all visited cells and notes (keeps the dimensions). */
  reset(): void {
    this.visitedSet.clear();
    this.noteMap.clear();
  }

  toJSON(): AutomapData {
    return {
      width: this.width,
      height: this.height,
      visited: this.visitedIndices(),
      notes: [...this.noteMap.entries()].sort((a, b) => a[0] - b[0]).map(([index, text]) => ({ index, text })),
    };
  }

  /**
   * Rebuild from serialised data. When `data` is missing/malformed, an empty map of the given
   * fallback dimensions is returned (so a fresh map still tracks). If `data` carries its own
   * dimensions they win, unless `fallbackWidth/Height` are supplied and `data` lacks them.
   */
  static fromJSON(
    data: AutomapData | null | undefined,
    fallbackWidth = 0,
    fallbackHeight = 0,
  ): Automap {
    const w = typeof data?.width === 'number' && data.width > 0 ? data.width : fallbackWidth;
    const h = typeof data?.height === 'number' && data.height > 0 ? data.height : fallbackHeight;
    return new Automap(w, h, data ?? null);
  }
}
