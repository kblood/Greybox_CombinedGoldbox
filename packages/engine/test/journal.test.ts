/**
 * Adventurer's Journal model (A5.4) — recording (auto-number + fixed-id idempotency + replace),
 * listing/filtering by category, read/unread tracking, and JSON round-trip persistence.
 */
import { describe, it, expect } from 'vitest';
import { Journal, type JournalData } from '../src/index.js';

describe('Journal', () => {
  it('auto-numbers entries from 1 and keeps them ordered', () => {
    const j = new Journal();
    const a = j.record({ title: 'Setting Out', body: 'The party leaves Solace.', category: 'story', day: 1 });
    const b = j.record({ title: 'A Rumour', body: 'Draconians muster east.', category: 'rumour', day: 1 });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(j.size).toBe(2);
    expect(j.list().map((e) => e.id)).toEqual([1, 2]);
  });

  it('records a fixed entry number and ignores a duplicate (idempotent)', () => {
    const j = new Journal();
    j.record({ id: 23, title: 'The Oath', body: 'You swear the oath.', category: 'quest', day: 2 });
    const again = j.record({ id: 23, title: 'CHANGED', body: 'different', category: 'story' });
    expect(j.size).toBe(1);
    expect(again.title).toBe('The Oath'); // duplicate ignored → existing returned
    expect(j.get(23)?.body).toBe('You swear the oath.');
  });

  it('overwrites when replace is set', () => {
    const j = new Journal();
    j.record({ id: 5, title: 'Draft', body: 'old', category: 'story' });
    j.record({ id: 5, title: 'Final', body: 'new', category: 'quest' }, { replace: true });
    expect(j.size).toBe(1);
    expect(j.get(5)).toMatchObject({ title: 'Final', body: 'new', category: 'quest' });
  });

  it('auto-id continues from the max existing number', () => {
    const j = new Journal();
    j.record({ id: 10, title: 'Ten', body: '...' });
    const next = j.record({ title: 'Auto', body: '...' });
    expect(next.id).toBe(11);
    expect(j.nextId()).toBe(12);
  });

  it('filters by category', () => {
    const j = new Journal();
    j.record({ title: 'S1', body: '', category: 'story' });
    j.record({ title: 'Q1', body: '', category: 'quest' });
    j.record({ title: 'Q2', body: '', category: 'quest' });
    expect(j.list('quest').map((e) => e.title)).toEqual(['Q1', 'Q2']);
    expect(j.list('story')).toHaveLength(1);
  });

  it('tracks unread and marks pages read', () => {
    const j = new Journal();
    j.record({ id: 1, title: 'A', body: '' });
    j.record({ id: 2, title: 'B', body: '' });
    expect(j.unreadCount()).toBe(2);
    expect(j.markRead(1)).toBe(true);
    expect(j.markRead(99)).toBe(false);
    expect(j.unreadCount()).toBe(1);
    j.markAllRead();
    expect(j.unreadCount()).toBe(0);
  });

  it('round-trips through JSON', () => {
    const j = new Journal();
    j.record({ id: 1, title: 'Setting Out', body: 'Line one.\nLine two.', category: 'story', day: 1, read: true });
    j.record({ id: 7, title: 'A Quest', body: 'Find the keep.', category: 'quest', day: 3 });
    const data = j.toJSON();
    const round = Journal.fromJSON(JSON.parse(JSON.stringify(data)) as JournalData);
    expect(round.size).toBe(2);
    expect(round.get(7)).toMatchObject({ title: 'A Quest', category: 'quest', day: 3, read: false });
    expect(round.get(1)?.read).toBe(true);
    expect(round.unreadCount()).toBe(1);
  });

  it('fromJSON tolerates junk and defaults missing fields', () => {
    const j = Journal.fromJSON({ entries: [
      { id: 1, title: 'OK', body: 'b', category: 'lore', day: 2, read: false },
      // @ts-expect-error — malformed entries must be dropped, not throw
      { title: 'no id' },
      // @ts-expect-error — bad category coerces to 'story'
      { id: 2, title: 'Bad cat', category: 'nonsense' },
    ] });
    expect(j.size).toBe(2);
    expect(j.get(2)?.category).toBe('story');
    expect(j.get(2)?.body).toBe('');
  });
});
