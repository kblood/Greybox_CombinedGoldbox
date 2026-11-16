/**
 * Game clock (A1.2) — a tiny, pure model of elapsed in-game time for the Gold Box explorer.
 *
 * The original games track time as a running count of minutes/hours/days that advances when the
 * party rests (and, in the full games, as they travel the overland map). We keep the canonical
 * state as a single `totalMinutes` integer and derive the day/hour/minute from it, so there is one
 * source of truth and no drift. Day 0 hour 0 is the campaign epoch; the on-screen day is shown
 * 1-based ("Day 1") the way the games present it. The three Krynn moons phase off the whole-day
 * count (`moonPhasesForDay`), so advancing the clock by N days walks the moons N days forward.
 */

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

/** A point in game time, decomposed from the canonical `totalMinutes` count. */
export interface GameTime {
  /** Whole days since the epoch (0-based; the display adds 1). */
  day: number;
  /** Hour of the day, 0–23. */
  hour: number;
  /** Minute of the hour, 0–59. */
  minute: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Decompose a running minute count into day/hour/minute (negative inputs clamp to the epoch). */
export function timeFromMinutes(totalMinutes: number): GameTime {
  const t = Math.max(0, Math.floor(totalMinutes));
  return {
    day: Math.floor(t / MINUTES_PER_DAY),
    hour: Math.floor((t % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minute: t % MINUTES_PER_HOUR,
  };
}

/** Whole-day index for a minute count — what the moon engine keys its phases off. */
export function gameDayFromMinutes(totalMinutes: number): number {
  return Math.floor(Math.max(0, totalMinutes) / MINUTES_PER_DAY);
}

/** "HH:MM" time-of-day for the position/status line. */
export function formatTimeOfDay(totalMinutes: number): string {
  const t = timeFromMinutes(totalMinutes);
  return `${pad2(t.hour)}:${pad2(t.minute)}`;
}

/** "Day 3 14:30" — the 1-based day plus the time of day, for camp/journal display. */
export function formatGameTime(totalMinutes: number): string {
  const t = timeFromMinutes(totalMinutes);
  return `Day ${t.day + 1} ${pad2(t.hour)}:${pad2(t.minute)}`;
}

/**
 * Human-readable elapsed span, e.g. "3 days", "8 hours", "2 days 6 hours", "45 minutes". Minutes
 * are only shown when the whole span is under an hour (rest is always a multiple of a day, but
 * shorter activities use this too). Zero reads "no time".
 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'no time';
  const days = Math.floor(m / MINUTES_PER_DAY);
  const hours = Math.floor((m % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const mins = m % MINUTES_PER_HOUR;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (mins > 0 && days === 0) parts.push(`${mins} minute${mins === 1 ? '' : 's'}`);
  return parts.join(' ') || 'no time';
}

// ===========================================================================
// 7-slot mixed-radix calendar (ovr021 — step_game_time / NormalizeClock)
//
// The original engine keeps the clock as SEVEN slots [0..6], each carrying into
// the next when it reaches its radix. The flat `totalMinutes` model above is the
// minute-and-up projection of this calendar (slots 1..); the calendar adds the
// sub-minute tick (slot 0) plus months, years and party aging on year roll-over.
//
//   timeScales = { 10, 10, 6, 24, 30, 12, 0x100 }  (word_1A13C)
//
//   slot 0  tick   radix 10  (6-second tick)  -> minutes
//   slot 1  minute radix 10                   -> 10-minute unit
//   slot 2  10min  radix 6                     -> hours
//   slot 3  hour   radix 24                    -> days
//   slot 4  day    radix 30                    -> months
//   slot 5  month  radix 12                    -> years
//   slot 6  year   radix 256                   -> overflow ages the party
//
// Minute-and-up this is identical to the flat model: 10·6 = 60 min/hr, 24 hr/day
// = 1440 min/day, so `MINUTES_PER_DAY` is shared. Months are 30 days, years are
// 12 months (= 360 days).
// ===========================================================================

/** Per-slot radix; slot `i` carries into `i+1` when it reaches `TIME_SCALES[i]`. */
export const TIME_SCALES = [10, 10, 6, 24, 30, 12, 0x100] as const;

/** Named clock-slot indices (ovr021 `step_game_time` `time_slot` argument). */
export const SLOT_TICK = 0;
export const SLOT_MINUTE = 1;
export const SLOT_TEN_MINUTE = 2;
export const SLOT_HOUR = 3;
export const SLOT_DAY = 4;
export const SLOT_MONTH = 5;
export const SLOT_YEAR = 6;

/** The seven clock slots, low (tick) to high (year). */
export type ClockSlots = [number, number, number, number, number, number, number];

/** A decomposed calendar reading of the clock (named, for display). */
export interface Calendar {
  tick: number;
  minute: number;
  tenMinute: number;
  hour: number;
  /** Day-of-month, 0-based internally. */
  day: number;
  /** Month-of-year, 0-based internally. */
  month: number;
  year: number;
}

/** A fresh zeroed clock (campaign epoch). */
export function newClock(): ClockSlots {
  return [0, 0, 0, 0, 0, 0, 0];
}

/**
 * Mixed-radix carry (`NormalizeClock`, sub_58317). Each slot `i<6` carries its overflow
 * into slot `i+1`; the top slot (year) overflows at 256 and each overflow is reported as a
 * `yearRollovers` count — the caller ages the party by that many years. Returns a *new*
 * normalized clock (pure; does not mutate the input).
 */
export function normalizeClock(clock: ClockSlots): { clock: ClockSlots; yearRollovers: number } {
  const out = clock.slice() as ClockSlots;
  for (let i = 0; i < 6; i++) {
    const radix = TIME_SCALES[i];
    if (out[i] >= radix || out[i] < 0) {
      const carry = Math.floor(out[i] / radix);
      out[i] -= carry * radix;
      out[i + 1] += carry;
    }
  }
  // Top slot (year) overflows at 256 -> aging events.
  const yearRadix = TIME_SCALES[SLOT_YEAR];
  let yearRollovers = 0;
  if (out[SLOT_YEAR] >= yearRadix) {
    yearRollovers = Math.floor(out[SLOT_YEAR] / yearRadix);
    out[SLOT_YEAR] -= yearRollovers * yearRadix;
  }
  return { clock: out, yearRollovers };
}

/**
 * Minutes elapsed by adding `amount` to `slot` (`CheckAffectsTimingOut`'s
 * `timeSteps · Π timeScales[slot-1 .. 1]`). Slot 1 (minute) = 1 min/unit, slot 2 = 10
 * min/unit, slot 3 (hour) = 60, etc. Slot 0 (tick) is sub-minute and reports 0 whole
 * minutes per tick.
 */
export function minutesForStep(slot: number, amount: number): number {
  if (slot <= SLOT_MINUTE) {
    // tick (slot 0) is 1/10 minute; minute (slot 1) is exactly one minute.
    return slot === SLOT_MINUTE ? amount : 0;
  }
  let factor = 1;
  for (let i = SLOT_MINUTE; i < slot; i++) factor *= TIME_SCALES[i];
  return amount * factor;
}

/**
 * `step_game_time(time_slot, amount)` (sub_583FA): add `amount` to `clock[time_slot]`,
 * normalize the carry chain, and report the year roll-overs (for aging) plus the elapsed
 * whole minutes (for affect time-out). Pure — returns a new clock.
 *
 * Movement calls this per step: a normal step is `stepGameTime(clock, SLOT_MINUTE, 1)`
 * (+1 minute); a careful/search step is `stepGameTime(clock, SLOT_TEN_MINUTE, 1)`
 * (+10 minutes) — see ovr015 `step_game_time(search_flags&1 ? 2 : 1, 1)`.
 */
export function stepGameTime(
  clock: ClockSlots,
  slot: number,
  amount: number,
): { clock: ClockSlots; yearRollovers: number; elapsedMinutes: number } {
  const bumped = clock.slice() as ClockSlots;
  bumped[slot] += amount;
  const { clock: normalized, yearRollovers } = normalizeClock(bumped);
  return { clock: normalized, yearRollovers, elapsedMinutes: minutesForStep(slot, amount) };
}

/** Decompose a normalized clock into a named {@link Calendar} reading. */
export function calendarFromClock(clock: ClockSlots): Calendar {
  return {
    tick: clock[SLOT_TICK],
    minute: clock[SLOT_MINUTE],
    tenMinute: clock[SLOT_TEN_MINUTE],
    hour: clock[SLOT_HOUR],
    day: clock[SLOT_DAY],
    month: clock[SLOT_MONTH],
    year: clock[SLOT_YEAR],
  };
}

/**
 * Build a 7-slot clock from a flat whole-minute count (back-compat bridge: the flat
 * `totalMinutes` API is the minute-and-up projection of the calendar). Ticks are 0.
 */
export function clockFromMinutes(totalMinutes: number): ClockSlots {
  const m = Math.max(0, Math.floor(totalMinutes));
  // Seed the minute slot and let the carry chain distribute into 10-min/hour/day/month/year.
  return normalizeClock([0, m, 0, 0, 0, 0, 0]).clock;
}

/** Project a 7-slot clock back to a flat whole-minute count (ticks are dropped, sub-minute). */
export function minutesFromClock(clock: ClockSlots): number {
  const c = calendarFromClock(clock);
  const DAYS_PER_MONTH = TIME_SCALES[SLOT_DAY]; // 30
  const MONTHS_PER_YEAR = TIME_SCALES[SLOT_MONTH]; // 12
  const days = c.day + DAYS_PER_MONTH * (c.month + MONTHS_PER_YEAR * c.year);
  return (
    c.minute +
    c.tenMinute * TIME_SCALES[SLOT_MINUTE] +
    c.hour * MINUTES_PER_HOUR +
    days * MINUTES_PER_DAY
  );
}

// ---------------------------------------------------------------------------
// Party aging on year roll-over (ovr021: NormalizeClock year overflow -> age += 1)
// ---------------------------------------------------------------------------

/** Anything the clock can age — the minimum a party member exposes. */
export interface Ageable {
  age: number;
}

/**
 * Apply `years` of aging to every party member (`age += years`). Pure: returns shallow
 * copies with the new age, leaving the inputs untouched. `years` is the `yearRollovers`
 * reported by {@link stepGameTime} / {@link normalizeClock}.
 */
export function applyAging<T extends Ageable>(party: readonly T[], years: number): T[] {
  const add = Math.max(0, Math.floor(years));
  return party.map((m) => (add === 0 ? { ...m } : { ...m, age: m.age + add }));
}

// ---------------------------------------------------------------------------
// Affect time-out (CheckAffectsTimingOut, sub_5801E)
//
// Timed affects store their remaining duration in MINUTES (slot-1 units). A
// duration of 0 is permanent. The engine walks the elapsed time in chunks of <=10
// minutes, subtracting each chunk and removing the affect once a chunk reaches or
// exceeds the remaining duration. The chunking has no observable side effects beyond
// removal, so the net result equals "subtract elapsed; remove when <= 0"; we keep the
// faithful chunked walk so the behaviour matches the binary slot-for-slot.
// ---------------------------------------------------------------------------

/** A timed affect — `minutes === 0` means permanent. */
export interface TimedAffect {
  /** Remaining duration in minutes; 0 = permanent (never expires). */
  minutes: number;
}

/** Chunk size the engine counts affect time-out in (10-minute units). */
export const AFFECT_CHUNK_MINUTES = TIME_SCALES[SLOT_MINUTE]; // 10

/**
 * Age a list of timed affects by `elapsedMinutes` and drop the expired ones. Permanent
 * affects (`minutes === 0`) are kept. Pure: returns the surviving affects with reduced
 * durations plus the ones removed (so callers can fire "X wears off" messages).
 */
export function tickAffects<T extends TimedAffect>(
  affects: readonly T[],
  elapsedMinutes: number,
): { survivors: T[]; expired: T[] } {
  const elapsed = Math.max(0, Math.floor(elapsedMinutes));
  // Work on mutable copies so the chunked walk can decrement in place.
  const work = affects.map((a) => ({ ...a }));
  const removed = new Set<number>();
  let remaining = elapsed;
  while (remaining > 0) {
    const chunk = Math.min(AFFECT_CHUNK_MINUTES, remaining);
    for (let i = 0; i < work.length; i++) {
      if (removed.has(i)) continue;
      if (work[i].minutes === 0) continue; // permanent
      if (chunk >= work[i].minutes) {
        removed.add(i);
      } else {
        work[i].minutes -= chunk;
      }
    }
    remaining -= chunk;
  }
  const survivors: T[] = [];
  const expired: T[] = [];
  for (let i = 0; i < work.length; i++) {
    if (removed.has(i)) expired.push(work[i]);
    else survivors.push(work[i]);
  }
  return { survivors, expired };
}

// ---------------------------------------------------------------------------
// Natural rest healing (rest_heal) and rest-time spell learning
// (CheckForSpellLearning, sub_58B4D). Both are driven by "rest ticks"
// (rest_10_seconds): every 288 ticks the whole party heals +1 HP, and a player's
// spell-learn timer is the spell's level x 3 ticks (x 2 on the deferred path).
// ---------------------------------------------------------------------------

/** Rest ticks per +1-HP whole-party heal (`8 * 36`). */
export const REST_TICKS_PER_HEAL = 8 * 36; // 288

/** A member the rest-healer can touch. `dead` opts a member out of natural healing entirely
 *  (CT.7h permadeath, `dmg > hp+10` — NOT merely unconscious); omit/false for everyone else,
 *  including a member currently at 0 HP but merely unconscious, who DOES heal on rest per the
 *  original engine (disasm-spells-krynn.md §22: "a figure merely brought to 0 HP is unconscious
 *  and revives on rest / a cure"). */
export interface RestHealable {
  hp: number;
  maxHp: number;
  dead?: boolean;
}

/**
 * Advance natural rest healing by `ticks` rest ticks. Every {@link REST_TICKS_PER_HEAL}
 * ticks each non-{@link RestHealable.dead | dead} member gains +1 HP (capped at maxHp,
 * including a merely-unconscious member at 0 HP — CT.7h); permanently dead members are
 * skipped. `carry` is the leftover tick count from the previous call (so healing is
 * continuous across calls). Pure: returns new HP values and the new carry.
 */
export function advanceRestHealing<T extends RestHealable>(
  party: readonly T[],
  ticks: number,
  carry = 0,
): { party: T[]; carry: number; heals: number } {
  const total = Math.max(0, Math.floor(ticks)) + Math.max(0, Math.floor(carry));
  const heals = Math.floor(total / REST_TICKS_PER_HEAL);
  const newCarry = total - heals * REST_TICKS_PER_HEAL;
  const out = party.map((m) => {
    if (heals === 0 || m.dead) return { ...m };
    return { ...m, hp: Math.min(m.maxHp, m.hp + heals) };
  });
  return { party: out, carry: newCarry, heals };
}

/** Default rest-tick cost per spell level when committing a spell (memorize/scribe). */
export const LEARN_TICKS_PER_LEVEL = 3;
/** Deferred-path rest-tick cost per spell level (sub_58C03). */
export const LEARN_TICKS_PER_LEVEL_DEFERRED = 2;

/** Rest ticks to learn a level-`level` spell: `level * 3` (or `level * 2` deferred). */
export function learnTicksForLevel(level: number, deferred = false): number {
  return level * (deferred ? LEARN_TICKS_PER_LEVEL_DEFERRED : LEARN_TICKS_PER_LEVEL);
}

/** Progress of a player's rest-time spell-learning queue. */
export interface SpellLearnState {
  /** Ticks remaining until the spell at `index` is committed (0 = re-arm needed). */
  timeout: number;
  /** Index of the next spell to commit in the learn queue. */
  index: number;
}

/** A fresh learn state (nothing armed; starts at the front of the queue). */
export function newSpellLearnState(): SpellLearnState {
  return { timeout: 0, index: 0 };
}

/**
 * Advance a player's spell-learning by `ticks` rest ticks against a `queue` of spell
 * levels (in learn order). The current spell's timer counts down `level * 3` ticks
 * (`level * 2` on the deferred path); on reaching 0 the spell is committed and the timer
 * re-arms for the next. Pure: returns the new state plus the indices of spells committed
 * this call (so the caller runs `MarkLearnt` / scribe and prints "<name> has memorized").
 */
export function advanceSpellLearning(
  state: SpellLearnState,
  queue: readonly number[],
  ticks: number,
  opts: { deferred?: boolean } = {},
): { state: SpellLearnState; learned: number[] } {
  const deferred = opts.deferred ?? false;
  let { timeout, index } = state;
  const learned: number[] = [];
  let remaining = Math.max(0, Math.floor(ticks));
  // Lazily arm the timer for the spell currently at the front of the queue.
  if (timeout <= 0 && index < queue.length) {
    timeout = learnTicksForLevel(queue[index], deferred);
  }
  while (remaining > 0 && index < queue.length) {
    const step = Math.min(remaining, timeout);
    timeout -= step;
    remaining -= step;
    if (timeout <= 0) {
      learned.push(index);
      index += 1;
      timeout = index < queue.length ? learnTicksForLevel(queue[index], deferred) : 0;
    }
  }
  return { state: { timeout, index }, learned };
}
