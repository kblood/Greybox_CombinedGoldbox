/**
 * Adventurer's Journal (A5.4) — the in-game replacement for the Gold Box "journal entries".
 *
 * The original games print *"…and you record it in Journal Entry 23"* and the player reads entry 23
 * from a physical booklet (it doubles as copy-protection: some prompts quiz you on an entry). There
 * is **no journal opcode** — the engine just `PRINT`s the entry number; the text lives outside the
 * program. This module is the clean-room equivalent: a small, persistent log the party carries, into
 * which ECL events, town visits, and quest progress *record* numbered entries the player can read
 * back from a menu. (The bundled demo entries are original-authored — no copyrighted booklet text.)
 *
 * Pure / serialisable so a host can persist it (localStorage, a save file) and unit-test it without
 * any DOM. Entry `id` is the stable "journal entry number" an event references; recording the same id
 * twice is idempotent (an event re-firing does not duplicate the page).
 */

/** What kind of page an entry is — drives its list colour and lets the reader filter. */
export type JournalCategory = 'story' | 'quest' | 'rumour' | 'lore';

export interface JournalEntry {
  /** Stable entry number (the "Journal Entry N" an event records / references). */
  id: number;
  /** Short heading shown in the list. */
  title: string;
  /** The page body the player reads. */
  body: string;
  category: JournalCategory;
  /** 1-based game day the entry was recorded (0 = unknown / pre-dated). */
  day: number;
  /** Whether the player has opened this page yet (drives the unread marker). */
  read: boolean;
}

/** A record/replace request; `id` is optional — omit it to auto-number (max existing + 1). */
export interface JournalRecord {
  id?: number;
  title: string;
  body: string;
  category?: JournalCategory;
  day?: number;
  read?: boolean;
}

/** The serialisable shape (what `toJSON` emits and `fromJSON` accepts). */
export interface JournalData {
  entries: JournalEntry[];
}

/** Order entries by their journal-entry number, ascending — the way a booklet is paginated. */
function byId(a: JournalEntry, b: JournalEntry): number {
  return a.id - b.id;
}

export class Journal {
  private readonly byNumber = new Map<number, JournalEntry>();

  constructor(entries: readonly JournalEntry[] = []) {
    for (const e of entries) this.byNumber.set(e.id, { ...e });
  }

  /** How many pages the journal holds. */
  get size(): number {
    return this.byNumber.size;
  }

  /** All entries (optionally filtered by category), sorted by entry number. */
  list(category?: JournalCategory): JournalEntry[] {
    const all = [...this.byNumber.values()];
    const filtered = category ? all.filter((e) => e.category === category) : all;
    return filtered.sort(byId).map((e) => ({ ...e }));
  }

  /** The entry with this number, or null. */
  get(id: number): JournalEntry | null {
    const e = this.byNumber.get(id);
    return e ? { ...e } : null;
  }

  has(id: number): boolean {
    return this.byNumber.has(id);
  }

  /** The next auto-assigned entry number (max existing + 1, or 1 when empty). */
  nextId(): number {
    let max = 0;
    for (const id of this.byNumber.keys()) if (id > max) max = id;
    return max + 1;
  }

  /**
   * Record a page. With an `id` that already exists this is a **no-op** (idempotent — a re-firing
   * event will not duplicate it); pass `{ replace: true }` to overwrite. Without an `id`, the entry
   * is auto-numbered. Returns the stored entry (the existing one when a duplicate is ignored).
   */
  record(rec: JournalRecord, opts: { replace?: boolean } = {}): JournalEntry {
    const id = rec.id ?? this.nextId();
    const existing = this.byNumber.get(id);
    if (existing && !opts.replace) return { ...existing };
    const entry: JournalEntry = {
      id,
      title: rec.title,
      body: rec.body,
      category: rec.category ?? 'story',
      day: rec.day ?? 0,
      read: rec.read ?? false,
    };
    this.byNumber.set(id, entry);
    return { ...entry };
  }

  /** Mark a page read; returns true if it existed. */
  markRead(id: number): boolean {
    const e = this.byNumber.get(id);
    if (!e) return false;
    e.read = true;
    return true;
  }

  markAllRead(): void {
    for (const e of this.byNumber.values()) e.read = true;
  }

  /** How many pages the player has not opened yet. */
  unreadCount(): number {
    let n = 0;
    for (const e of this.byNumber.values()) if (!e.read) n++;
    return n;
  }

  toJSON(): JournalData {
    return { entries: this.list() };
  }

  static fromJSON(data: JournalData | null | undefined): Journal {
    if (!data || !Array.isArray(data.entries)) return new Journal();
    const clean = data.entries
      .filter((e): e is JournalEntry => e != null && typeof e.id === 'number' && typeof e.title === 'string')
      .map((e) => ({
        id: e.id,
        title: e.title,
        body: typeof e.body === 'string' ? e.body : '',
        category: (['story', 'quest', 'rumour', 'lore'] as const).includes(e.category) ? e.category : 'story',
        day: typeof e.day === 'number' ? e.day : 0,
        read: e.read === true,
      }));
    return new Journal(clean);
  }
}
