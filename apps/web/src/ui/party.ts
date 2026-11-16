/**
 * Party roster store (M2.S4d) — holds the player's created Champions of Krynn characters, persists
 * them to localStorage, and bridges a `CharacterSheet` into the combat `Combatant` the explore view
 * fights with. This replaces the hard-coded demo party in `explore.ts`: once you create characters,
 * encounters are fought by *your* party.
 *
 * The sheet already carries the rules-derived THAC0/AC/HP (computed by the addnd1e-dragonlance
 * `createCharacter`), so the combatant uses those directly; only the melee weapon (which the sheet
 * doesn't model yet) is assigned here from the character's best martial class, with the Strength
 * damage bonus folded in.
 */
import {
  ADND1E_ABILITIES,
  encumbrance,
  inventoryWeightTenths,
  tacticalWeaponsFor,
  moveRateToCells,
  planRest,
  advanceRestHealing,
  applyCombatRosterCarryOver,
  healRosterMember,
  raiseRosterMemberWithRules,
  applyAging,
  advanceSpellLearning,
  newSpellLearnState,
  type SpellLearnState,
  emptyMemorization,
  normalizeMemorization,
  memorizedAt,
  spellById,
  tacticalSpellFor,
  deityTurnUndeadBonus,
  deityHealDieBonus,
  inventoryFromIds,
  useItem,
  thac0 as classThac0,
  savingThrows as classSaves,
  computeArmorClass,
  hitDie,
  levelHpGain,
  checkTraining,
  maxLevel,
  dqkMaxLevel,
  buyItem,
  sellStack,
  baseItem,
  healCost,
  raiseCost,
  coreClass,
  calcBattleExp,
  awardCombatExperience,
  warriorMultipleAttacks,
  attemptScribe,
  maxSpellsPerLevel,
  moonPhaseForDay,
  moonPhaseMods,
  type CharacterSheet,
  type DefeatedEnemy,
  type BattleLoot,
  type XpRecipient,
  type Combatant,
  type DamageDice,
  type DragonlanceClassId,
  type RestOptions,
  type RestOutcome,
  type Memorization,
  type Inventory,
  type InventoryEntry,
  type TreasureItem,
  type TacticalSpell,
  type Weapon,
  type CombatRosterCondition,
  type RaiseDeadFailureReason,
  type RaiseDeadRosterMember,
  type RaiseDeadRulesOptions,
} from '@goldbox/engine';

const STORAGE_KEY = 'greybox.party.cok';
const MEMORIZE_KEY = 'greybox.memorize.cok';
const SPELLBOOK_KEY = 'greybox.spellbook.cok';
const INVENTORY_KEY = 'greybox.inventory.cok';
const GOLD_KEY = 'greybox.gold.cok';
const DEAD_KEY = 'greybox.dead.cok';
const MAX_PARTY = 6;

/** Default melee weapon dice by class (best martial class wins). Clerics use a mace (blunt). */
const CLASS_WEAPON: Record<DragonlanceClassId, DamageDice> = {
  fighter: { count: 1, sides: 8, bonus: 0 }, // long sword
  knight: { count: 1, sides: 8, bonus: 0 }, // long sword
  ranger: { count: 1, sides: 8, bonus: 0 }, // long sword
  thief: { count: 1, sides: 6, bonus: 0 }, // short sword
  cleric: { count: 1, sides: 6, bonus: 0 }, // mace
  magicUser: { count: 1, sides: 4, bonus: 0 }, // dagger
};

/** Priority for choosing which class's weapon a multi-classed character wields (most martial first). */
const WEAPON_PRIORITY: DragonlanceClassId[] = ['fighter', 'knight', 'ranger', 'thief', 'cleric', 'magicUser'];

function bestWeapon(classes: Partial<Record<DragonlanceClassId, number>>): DamageDice {
  for (const c of WEAPON_PRIORITY) {
    if ((classes[c] ?? 0) > 0) return { ...CLASS_WEAPON[c] };
  }
  return { count: 1, sides: 4, bonus: 0 };
}

let roster: CharacterSheet[] = load();

// ── Calendar side-stores (ovr021 rest-calendar lane) ────────────────────────────────────────
// The ruleset `CharacterSheet` has no `age` field and the roster stores HP as a plain number, so
// the calendar's three new pieces of per-member state live in parallel name-keyed stores (mirrors
// the dead/memorize/xp pattern — keeps the sheet a pure ruleset value):
//   • ageStore     — character age in years (seeded to DEFAULT_AGE on first read; bumped by aging).
//   • restCarry    — leftover rest ticks below REST_TICKS_PER_HEAL, so healing is continuous.
//   • learnQueues  — per-caster spell-learn timer + the queued spell levels/names (level×3 ticks).
// All three persist to their own localStorage keys so they survive a page reload; the quick-save
// bundle does NOT yet carry them (documented gap — out-of-lane saveStore edit).
const AGE_KEY = 'greybox.ages.cok';
const RESTCARRY_KEY = 'greybox.restcarry.cok';
const LEARNQ_KEY = 'greybox.learnq.cok';
/** Starting age (years) seeded for a member with no recorded age. */
const DEFAULT_AGE = 20;

interface LearnQueue {
  state: SpellLearnState;
  /** Spell levels in learn order (fed to engine `advanceSpellLearning`). */
  levels: number[];
  /** Display names parallel to `levels`, for the "<name> has memorized <spell>" message. */
  names: string[];
}

function loadAges(): Map<string, number> {
  try {
    const raw = localStorage.getItem(AGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj).filter(([, v]) => typeof v === 'number'));
  } catch {
    return new Map();
  }
}

let ageStore = loadAges();

function persistAges(): void {
  try {
    localStorage.setItem(AGE_KEY, JSON.stringify(Object.fromEntries(ageStore)));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

function loadRestCarry(): number {
  try {
    const raw = localStorage.getItem(RESTCARRY_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

let restCarry = loadRestCarry();

function persistRestCarry(): void {
  try {
    localStorage.setItem(RESTCARRY_KEY, String(restCarry));
  } catch {
    /* storage disabled */
  }
}

function loadLearnQueues(): Map<string, LearnQueue> {
  try {
    const raw = localStorage.getItem(LEARNQ_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, LearnQueue>;
    const out = new Map<string, LearnQueue>();
    for (const [name, q] of Object.entries(obj)) {
      if (q && Array.isArray(q.levels) && Array.isArray(q.names) && q.state) {
        out.set(name, { state: { timeout: q.state.timeout | 0, index: q.state.index | 0 }, levels: q.levels.map((n) => n | 0), names: q.names.map((s) => String(s)) });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

let learnQueues = loadLearnQueues();

function persistLearnQueues(): void {
  try {
    localStorage.setItem(LEARNQ_KEY, JSON.stringify(Object.fromEntries(learnQueues)));
  } catch {
    /* storage disabled */
  }
}

/**
 * Current age (years) of `name`, seeding {@link DEFAULT_AGE} on first read (and persisting the seed
 * so it is stable). Surfaced by {@link partyStatus} and aged by {@link agePartyYears}.
 */
export function memberAge(name: string): number {
  const have = ageStore.get(name);
  if (typeof have === 'number') return have;
  ageStore.set(name, DEFAULT_AGE);
  persistAges();
  return DEFAULT_AGE;
}

/**
 * Age every roster member by `years` (the calendar-year count elapsed during a rest, computed by the
 * caller from {@link advanceRestHealing}'s clock step). Uses the engine's pure {@link applyAging} on
 * a `{age}` projection, writes the new ages back into {@link ageStore}, and persists.
 */
export function agePartyYears(years: number): void {
  const add = Math.max(0, Math.floor(years));
  if (add === 0 || roster.length === 0) return;
  const aged = applyAging(
    roster.map((s) => ({ age: memberAge(s.name) })),
    add,
  );
  roster.forEach((s, i) => ageStore.set(s.name, aged[i].age));
  persistAges();
}

/**
 * Natural rest healing by `ticksNeeded` rest ticks (a rest tick = 10 s) via the engine's pure
 * {@link advanceRestHealing} (+1 HP per non-{@link deadStore}-member every
 * {@link REST_TICKS_PER_HEAL}=288 ticks — a merely-unconscious member at 0 HP heals too (M89.S1,
 * CT.7h), only the permanently dead are skipped — capped at maxHp). Carries leftover ticks across
 * calls (module {@link restCarry}), writes the recovered HP back into the roster, and returns the
 * total HP healed plus the heal-event count. This is the calendar-faithful Encamp → Rest path
 * (replaces the old 1-HP-per-day planRest).
 */
export function restPartyTicks(ticksNeeded: number): { totalHealed: number; heals: number } {
  const res = advanceRestHealing(
    roster.map((s) => ({ hp: s.hp, maxHp: s.maxHp, dead: deadStore.has(s.name) })),
    ticksNeeded,
    restCarry,
  );
  restCarry = res.carry;
  persistRestCarry();
  let totalHealed = 0;
  let changed = false;
  roster.forEach((s, i) => {
    const after = res.party[i]?.hp;
    if (typeof after === 'number' && after !== s.hp) {
      totalHealed += after - s.hp;
      s.hp = after;
      changed = true;
    }
  });
  if (changed) persist();
  return { totalHealed, heals: res.heals };
}

/**
 * Queue a freshly-memorized spell into `name`'s rest-time learn timer (ovr021 CheckForSpellLearning).
 * The slot-commit happens instantly elsewhere (magic.ts) so this timer is the faithful flavour layer:
 * on the next Rest it drains at level×3 rest ticks and emits "<name> has memorized <spell>".
 */
export function enqueueLearn(name: string, spellLevel: number, spellName: string): void {
  let q = learnQueues.get(name);
  if (!q) {
    q = { state: newSpellLearnState(), levels: [], names: [] };
    learnQueues.set(name, q);
  }
  q.levels.push(Math.max(1, Math.floor(spellLevel)));
  q.names.push(spellName);
  persistLearnQueues();
}

/**
 * Drain every caster's spell-learn queue by `ticks` rest ticks via the engine's pure
 * {@link advanceSpellLearning}. Returns one "<name> has memorized <spell>" message per spell whose
 * level×3-tick timer completed this rest. Persists the advanced timer state.
 */
export function advancePartySpellLearning(ticks: number): string[] {
  const msgs: string[] = [];
  let changed = false;
  for (const [name, q] of learnQueues) {
    if (q.state.index >= q.levels.length) continue;
    const r = advanceSpellLearning(q.state, q.levels, ticks);
    if (r.state.timeout !== q.state.timeout || r.state.index !== q.state.index) changed = true;
    q.state = r.state;
    for (const idx of r.learned) msgs.push(`${name} has memorized ${q.names[idx] ?? 'a spell'}.`);
  }
  if (changed) persistLearnQueues();
  return msgs;
}

function load(): CharacterSheet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CharacterSheet[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
  } catch {
    /* storage disabled / full — keep the in-memory roster */
  }
}

/** The current party (a copy; mutate via the helpers). */
export function getParty(): CharacterSheet[] {
  return [...roster];
}

/**
 * Re-read every persisted store from localStorage into the module caches. A Load writes the slot's
 * data straight into the store keys (via the save bridge) and then calls this so the live views see
 * the restored party / spells / packs / gold / XP without a page reload.
 */
export function reloadStores(): void {
  roster = load();
  memorizeStore = loadMemorize();
  spellbookStore = loadSpellbook();
  inventoryStore = loadInventories();
  goldPool = loadGold();
  xpStore = loadXp();
  ageStore = loadAges();
  restCarry = loadRestCarry();
  learnQueues = loadLearnQueues();
}

export function partySize(): number {
  return roster.length;
}

/**
 * Add a created character; returns false if the party is already full or a member with the same
 * name is already present. Every persisted per-character store (XP, spellbook, memorization,
 * inventory, dead-flag, age) is keyed on the bare name with no secondary key, so two same-named
 * members would silently alias each other's state (e.g. `addXp()`'s read-modify-write would sum
 * both members' combat awards onto one shared bucket) — this guard is what makes "party members are
 * unique by name in practice" (see the stores below) actually true instead of just asserted.
 */
export function addToParty(sheet: CharacterSheet): boolean {
  if (roster.length >= MAX_PARTY) return false;
  if (roster.some((m) => m.name === sheet.name)) return false;
  roster.push(sheet);
  persist();
  return true;
}

export function removeFromParty(index: number): void {
  if (index >= 0 && index < roster.length) {
    roster.splice(index, 1);
    persist();
  }
}

export function clearParty(): void {
  roster = [];
  persist();
}

/** Build a battle-ready `Combatant` from a created character sheet. */
export function sheetToCombatant(sheet: CharacterSheet, id: string): Combatant {
  const str = ADND1E_ABILITIES.strength(sheet.abilities.str, sheet.abilities.strPct);
  const dex = ADND1E_ABILITIES.dexterity(sheet.abilities.dex);
  const weapon = bestWeapon(sheet.classes);
  return {
    id,
    name: sheet.name,
    side: 'party',
    ...(sheet.appearance ? {
      cokAppearance: { ...sheet.appearance, paletteBytes: [...sheet.appearance.paletteBytes] },
    } : {}),
    hp: sheet.hp,
    maxHp: sheet.maxHp,
    thac0: sheet.thac0,
    ac: sheet.ac,
    damage: { ...weapon, bonus: weapon.bonus + str.damage },
    // M25.S1 — COAB DexReactionAdj: a missile-only to-hit bonus, applied in tactical.ts's resolveHit.
    missileHitBonus: dex.missile || undefined,
  };
}

/** The whole party as combatants (fresh objects each call — runCombat mutates them). */
export function partyCombatants(): Combatant[] {
  return roster.map((sheet, i) => sheetToCombatant(sheet, `p${i + 1}`));
}

/** Short class/level label, e.g. "FTR 3" or "F/M 3/3" (most-martial class first). */
const CLASS_ABBR: Record<DragonlanceClassId, string> = {
  fighter: 'FTR',
  knight: 'KNT',
  ranger: 'RGR',
  thief: 'THF',
  cleric: 'CLR',
  magicUser: 'MU',
};

export function classLabel(classes: Partial<Record<DragonlanceClassId, number>>): string {
  const present = WEAPON_PRIORITY.filter((c) => (classes[c] ?? 0) > 0);
  if (present.length === 0) return '';
  if (present.length === 1) return `${CLASS_ABBR[present[0]]} ${classes[present[0]]}`;
  // Multi-class: slash-joined abbreviations + slash-joined levels (classic Gold Box style).
  return `${present.map((c) => CLASS_ABBR[c]).join('/')} ${present.map((c) => classes[c]).join('/')}`;
}

/** A member's current condition for the explore HUD / party panel. */
export interface PartyMemberStatus {
  name: string;
  hp: number;
  maxHp: number;
  /** Armour class (lower is better, AD&D). */
  ac: number;
  /** Short class/level label, e.g. "FTR 3". */
  cls: string;
  /** At/below 0 HP — fallen this fight (unconscious OR dead). */
  down: boolean;
  /**
   * Permanently slain (gen1 `dmg ≥ hp+10` — CT.7h/RE.1): needs a Raise Dead, not bed rest or a cure.
   * Always implies {@link down}; a `down && !dead` member is merely unconscious and revives on rest/heal.
   */
  dead: boolean;
  /** Character age in years (ovr021 calendar; seeded to {@link DEFAULT_AGE}, bumped by aging). */
  age: number;
}

export function partyStatus(): PartyMemberStatus[] {
  return roster.map((s) => ({
    name: s.name,
    hp: s.hp,
    maxHp: s.maxHp,
    ac: s.ac,
    cls: classLabel(s.classes),
    down: s.hp <= 0,
    dead: deadStore.has(s.name),
    age: memberAge(s.name),
  }));
}

// ── Dead (permadeath) carry-over (CT.7h) ────────────────────────────────────────────────────
// Combat marks a slain figure with the engine's `dead` flag (10+ HP below zero in gen1) vs a
// merely recoverable `unconscious`/`dying` one. The roster stores HP as a plain number, so the dead-vs-
// down distinction is carried in a parallel name-keyed set (mirrors the memorize/xp stores — keeps
// the CharacterSheet a pure ruleset value). A dead member needs a temple Raise Dead; an unconscious
// one revives on rest/cure. Combatant condition is `'ok' | 'unconscious' | 'dead'`.
type CombatCondition = CombatRosterCondition;

function loadDead(): Set<string> {
  try {
    const raw = localStorage.getItem(DEAD_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

let deadStore = loadDead();

function persistDead(): void {
  try {
    localStorage.setItem(DEAD_KEY, JSON.stringify([...deadStore]));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

type RecoverableSheet = CharacterSheet & RaiseDeadRosterMember;

function recoverableRoster(): RecoverableSheet[] {
  return roster.map((s) => ({
    ...s,
    abilities: { ...s.abilities },
    dead: deadStore.has(s.name),
    con: s.abilities.con,
  }));
}

function applyRecoveredRoster(next: readonly RecoverableSheet[]): boolean {
  let changed = false;
  let deadChanged = false;
  next.forEach((s, i) => {
    const current = roster[i];
    if (!current) return;
    if (current.hp !== s.hp) {
      current.hp = s.hp;
      changed = true;
    }
    if (s.con !== undefined && current.abilities.con !== s.con) {
      current.abilities = { ...current.abilities, con: s.con };
      changed = true;
    }
    const isNowDead = s.dead === true;
    if (isNowDead && !deadStore.has(current.name)) {
      deadStore.add(current.name);
      deadChanged = true;
    } else if (!isNowDead && deadStore.delete(current.name)) {
      deadChanged = true;
    }
  });
  if (changed) persist();
  if (deadChanged) persistDead();
  return changed || deadChanged;
}

/** True when `name` is permanently slain (awaiting Raise Dead). */
export function isDead(name: string): boolean {
  return deadStore.has(name);
}

/**
 * Write combat-end HP back into the saved roster so damage carries across fights. Combatants are
 * matched to roster members by their `p{i+1}` id (the same scheme `partyCombatants` assigns); HP is
 * clamped to `[0, maxHp]`. Members that didn't fight (no matching combatant) are left untouched.
 *
 * Pass `conditionOf` (the engine's `conditionOf(id)` seam) to also carry the **dead-vs-unconscious**
 * distinction to the roster (CT.7h): a `'dead'` figure is recorded permadead (needs Raise Dead); a
 * `'unconscious'` one stays merely down. Omit it (legacy callers) and only HP is persisted.
 */
export function applyCombatHp(
  combatants: readonly Combatant[],
  conditionOf?: (id: string) => CombatCondition,
): void {
  const next = applyCombatRosterCarryOver(recoverableRoster(), combatants, conditionOf);
  applyRecoveredRoster(next);
}

// ── Spell memorization persistence (A2.1) ───────────────────────────────────────────────────
// Memorized spell sets live alongside the roster, keyed by the character's stable name (party
// members are unique by name in practice). Stored separately so the CharacterSheet type — a pure
// ruleset value — stays unchanged.
type MemorizeStore = Record<string, Memorization>;

function loadMemorize(): MemorizeStore {
  try {
    const raw = localStorage.getItem(MEMORIZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: MemorizeStore = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = normalizeMemorization(v);
    return out;
  } catch {
    return {};
  }
}

let memorizeStore: MemorizeStore = loadMemorize();

function persistMemorize(): void {
  try {
    localStorage.setItem(MEMORIZE_KEY, JSON.stringify(memorizeStore));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

/** Heal a member (not permanently dead) by `amount` (capped at maxHp); returns HP actually restored.
 * M91.S1 — an unconscious-but-not-dead member (hp<=0, not in {@link deadStore}) IS healable here
 * (CT.7h; the original engine's own decompile note: "revives on rest / a cure") — only the truly
 * dead are excluded; they need a revive, not a cure spell. Persists when HP changes. */
export function healMember(name: string, amount: number): number {
  const idx = roster.findIndex((s) => s.name === name);
  if (idx < 0) return 0;
  const { roster: next, healed } = healRosterMember(recoverableRoster(), idx, amount);
  if (healed) applyRecoveredRoster(next);
  return healed;
}

/** Raise a fallen member to 1 HP (Raise Dead). Returns false if no such dead member. */
export function reviveMember(name: string): boolean {
  return reviveMemberWithRules(name).raised;
}

export interface ReviveMemberResult {
  raised: boolean;
  reason?: RaiseDeadFailureReason;
}

/** Raise a fallen member through source-shaped spell/temple rules. Spell mode rejects elves and CON<=0. */
export function reviveMemberWithRules(
  name: string,
  options: RaiseDeadRulesOptions = { source: 'spell' },
): ReviveMemberResult {
  const idx = roster.findIndex((s) => s.name === name);
  if (idx < 0) return { raised: false, reason: 'missing' };
  const { roster: next, raised, reason } = raiseRosterMemberWithRules(recoverableRoster(), idx, options);
  if (raised) applyRecoveredRoster(next); // a Raise Dead lifts the permadeath flag (CT.7h)
  return { raised, reason };
}

/** Name of the most-wounded member eligible for a Cure spell (largest HP deficit); the truly dead
 * ({@link deadStore}) are excluded — an unconscious-but-not-dead member IS eligible (CT.7h, M91.S1).
 * Null if nobody eligible is wounded. */
export function mostWoundedName(): string | null {
  let best: string | null = null;
  let bestMissing = 0;
  for (const s of roster) {
    if (deadStore.has(s.name)) continue;
    const missing = s.maxHp - s.hp;
    if (missing > bestMissing) {
      bestMissing = missing;
      best = s.name;
    }
  }
  return best;
}

/** Name of the first permanently dead member, or null. Merely-unconscious members heal by cure/rest. */
export function firstDeadName(): string | null {
  return roster.find((s) => deadStore.has(s.name))?.name ?? null;
}

// ── Magic-user spellbook persistence (A2.3) ─────────────────────────────────────────────────
// The set of spell ids a magic-user has scribed into their spellbook, keyed by character name.
// A mage may only memorize spells that are in their book; scribing (the Scribe verb) grows it.
// Stored separately from the roster so the CharacterSheet ruleset value stays unchanged.
type SpellbookStore = Record<string, string[]>;

function loadSpellbook(): SpellbookStore {
  try {
    const raw = localStorage.getItem(SPELLBOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: SpellbookStore = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = Array.isArray(v) ? (v as string[]) : [];
    return out;
  } catch {
    return {};
  }
}

let spellbookStore: SpellbookStore = loadSpellbook();

function persistSpellbook(): void {
  try {
    localStorage.setItem(SPELLBOOK_KEY, JSON.stringify(spellbookStore));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

/** The spell ids a character has scribed into their spellbook (a copy; empty if none yet). */
export function getSpellbook(name: string): string[] {
  return [...(spellbookStore[name] ?? [])];
}

export function spellbookCount(name: string): number {
  return spellbookStore[name]?.length ?? 0;
}

export function hasScribed(name: string, id: string): boolean {
  return (spellbookStore[name] ?? []).includes(id);
}

/** Advancing LCG state feeding {@link attemptScribe}'s seed — deterministic, same recurrence as
 * `wilderness.ts`'s `foeSeed` (not persisted; a fresh app session gets a fresh scribing sequence). */
let scribeSeed = 0x5c3a11;

/**
 * Attempt to scribe a spell into a character's book (A2.3, the AD&D 1e Intelligence learn-chance
 * table). Returns 'known' if already present (no roll), 'full' if the book already holds
 * {@link maxSpellsPerLevel} spells of that level (the PHB cap — no roll, the mage has no room left
 * regardless of luck), 'scribed' on a successful d100 roll against {@link chanceToLearnSpell}, or
 * 'failed' when the roll misses (not added — the caster may try again later). `minSpellsPerLevel`
 * (the PHB's guaranteed-minimum column) is a level-up freebie mechanic, not a scribing rule — left
 * unwired here.
 */
export function scribeToSpellbook(name: string, id: string, int: number): 'scribed' | 'known' | 'failed' | 'full' {
  const book = spellbookStore[name] ?? (spellbookStore[name] = []);
  if (book.includes(id)) return 'known';
  const level = spellById(id)?.level;
  if (level !== undefined) {
    const knownAtLevel = book.filter((bid) => spellById(bid)?.level === level).length;
    if (knownAtLevel >= maxSpellsPerLevel(int)) return 'full';
  }
  scribeSeed = (Math.imul(scribeSeed, 1664525) + 1013904223) >>> 0;
  if (!attemptScribe(int, scribeSeed).learned) return 'failed';
  book.push(id);
  persistSpellbook();
  return 'scribed';
}

/** The memorized-spell set for a party member (by name); an empty set if none saved yet. */
export function getMemorization(name: string): Memorization {
  return memorizeStore[name] ? normalizeMemorization(memorizeStore[name]) : emptyMemorization();
}

/** Persist a member's memorized-spell set. */
export function setMemorization(name: string, mem: Memorization): void {
  memorizeStore[name] = normalizeMemorization(mem);
  persistMemorize();
}

/**
 * The combat-castable spells a party member currently has MEMORIZED, as engine `TacticalSpell`s
 * (CT.4b). Maps the `p{i+1}` combatant id back to the roster member, reads their memorized set, and
 * builds one spell per distinct id with `usesLeft` = how many copies are prepared (cast through the
 * level for the caster class, so per-level dice like Fireball scale). Spells with no modelled tactical
 * effect (status/utility — sleep/hold/stinking cloud) are skipped until CT.5. Returns `[]` for a
 * non-caster, an unmatched id, or the demo party (no roster member at that index).
 *
 * M18.S1: folds in the caster's deity healing-die grant (Mishakal = +1 die on every heal spell) via
 * `deityHealDieBonus` — a no-op for non-Mishakal clerics and for damage/status spells.
 */
export function combatSpellsForMember(id: string): TacticalSpell[] {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return [];
  const sheet = roster[idx];
  const mem = getMemorization(sheet.name);
  const healBonus = deityHealDieBonus(sheet.deity);
  const out: TacticalSpell[] = [];
  for (let level = 1; level <= 5; level++) {
    const counts = new Map<string, number>();
    for (const spellId of memorizedAt(mem, level)) counts.set(spellId, (counts.get(spellId) ?? 0) + 1);
    for (const [spellId, uses] of counts) {
      const def = spellById(spellId);
      if (!def) continue;
      const casterLevel = sheet.classes[def.class as DragonlanceClassId] ?? 1;
      const spell = tacticalSpellFor(spellId, def.name, casterLevel, uses, healBonus);
      if (spell) out.push(spell);
    }
  }
  return out;
}

export interface CombatUseItem {
  inventoryIndex: number;
  name: string;
  baseTypeId: number;
  count: number;
  consumes: boolean;
  spell: TacticalSpell;
}

function rosterMemberForCombatId(id: string): CharacterSheet | null {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return null;
  return roster[idx];
}

/**
 * Readied combat-use items for the active tactical member. CoAB `Use` gates on a readied scroll or
 * magic item effect and then routes that effect through the spell resolver; the item-format affect
 * bytes are not fully decoded here, so this consumes only catalogue entries with explicit
 * `combatUseSpellId` metadata.
 */
export function combatUseItemsForMember(id: string): CombatUseItem[] {
  const sheet = rosterMemberForCombatId(id);
  if (!sheet) return [];
  const inv = getInventory(sheet);
  const out: CombatUseItem[] = [];
  inv.entries.forEach((entry, inventoryIndex) => {
    if (!entry.equipped) return;
    const base = baseItem(entry.baseTypeId);
    const spellId = base?.combatUseSpellId;
    if (!spellId) return;
    const def = spellById(spellId);
    if (!def) return;
    const casterLevel = Math.max(1, ...Object.values(sheet.classes).filter((v): v is number => typeof v === 'number' && v > 0));
    const healBonus = deityHealDieBonus(sheet.deity);
    const spell = tacticalSpellFor(spellId, def.name, casterLevel, 1, healBonus);
    if (!spell) return;
    out.push({
      inventoryIndex,
      name: entry.name,
      baseTypeId: entry.baseTypeId,
      count: entry.count,
      consumes: base.combatUseConsumes !== false,
      spell,
    });
  });
  return out;
}

/** Consume one stack unit after a successful combat item use. */
export function consumeCombatUseItem(id: string, inventoryIndex: number): boolean {
  const sheet = rosterMemberForCombatId(id);
  if (!sheet) return false;
  const res = useItem(getInventory(sheet), inventoryIndex);
  if (!res.consumed) return false;
  setInventory(sheet.name, res.inventory);
  return true;
}

/**
 * The d20 save-vs-spell target for a party member (CT.4b) — the value the figure must roll ≥ to save
 * against a spell, from the character's own verified saving throws. `undefined` for an unmatched id
 * (the engine then treats the figure as never saving rather than inventing a number).
 *
 * A robed magic-user's own moon phase on `day` (M22.S2, `moonPhaseMods`'s `saveMod` — the table's
 * "Saving Throws" column) shifts this: High Sanction (full moon) improves it, Low Sanction worsens
 * it. Lower is better, matching {@link conPoisonSaveBonus}'s sign convention, so the mod subtracts.
 * A Rogue mage (no robe) or non-caster is unaffected regardless of `day`.
 */
export function spellSaveForMember(id: string, day = 0): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const base = sheet.savingThrows.spell;
  const robe = sheet.robe;
  const level = robe ? sheet.classes.magicUser : undefined;
  if (!robe || !level) return base;
  const mods = moonPhaseMods(moonPhaseForDay(robe, day), { level, int: sheet.abilities.int });
  return base - mods.saveMod;
}

/**
 * The effective **turn-undead level** for a party member (CT.5b) — their cleric level plus any deity
 * bonus (Majere = +2). `undefined` for a non-cleric (or unmatched id), so the engine offers no Turn
 * action. Knights of Solamnia gain turning only as a high-level grant; that refinement is deferred.
 */
export function turnLevelForMember(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const clericLevel = sheet.classes.cleric;
  if (!clericLevel || clericLevel < 1) return undefined; // only clerics turn undead
  return clericLevel + deityTurnUndeadBonus(sheet.deity);
}

/**
 * The **thief level** for backstab (CT.5c) — a thief (or multi-class with thief) backstabs at their thief
 * level; `undefined` for a non-thief (or unmatched id), so the engine grants no backstab. The level bands
 * the damage multiplier (×2..×5, {@link backstabMultiplier}); the to-hit-from-behind bonus is fixed (+4).
 */
export function backstabLevelForMember(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const thiefLevel = roster[idx].classes.thief;
  if (!thiefLevel || thiefLevel < 1) return undefined; // only thieves backstab
  return thiefLevel;
}

/**
 * Warrior **multiple attacks** in COAB half-attack units (`ovr026` `ReclacClassBonuses` breakpoint —
 * see {@link warriorMultipleAttacks}): `3` (the "3 attacks per 2 rounds" alternation) for a fighter or
 * paladin at level ≥7, or a ranger at level ≥8 (checked across all of a multiclass member's class
 * slots, mapped to their core 1e class via {@link coreClass}). `undefined` for a member who doesn't
 * qualify (or an unmatched id), so the engine keeps its plain 1/round default. Dual-class reactivation
 * (`dualClassWarriorReactivates`) is out of scope — `CharacterSheet` doesn't model a dual-classed
 * character's frozen old-class slot yet.
 */
export function multiAttackHalfSteps(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const slots = Object.entries(sheet.classes)
    .filter(([, level]) => (level ?? 0) >= 1)
    .map(([cls, level]) => ({ classId: coreClass(cls as DragonlanceClassId), level: level! }));
  return warriorMultipleAttacks(slots) ? 3 : undefined;
}

/**
 * The tactical **weapons** a party member fights with (CT.7k-1) — their readied weapon (damage dice,
 * melee-vs-missile, range, ammo) from their pack, with the Strength damage bonus folded into the dice,
 * falling back to an unarmed strike when nothing is readied. Replaces combat's old placeholder
 * "first hero +bow / base-damage melee" synthesis. `undefined` for an unmatched id (the combat layer
 * then keeps its placeholder for that figure — e.g. the demo party that has no roster behind it).
 */
export function weaponsForMember(id: string): Weapon[] | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const str = ADND1E_ABILITIES.strength(sheet.abilities.str, sheet.abilities.strPct);
  const inv = getInventory(sheet);
  const readied = inv.entries.find((e) => e.equipped && baseItem(e.baseTypeId)?.kind === 'weapon');
  const base = readied ? baseItem(readied.baseTypeId) : undefined;
  // Fold the Strength damage adjustment into the readied weapon's dice (missiles get no STR-to-damage,
  // 1e — a bow's pull, not the archer's arm, drives the damage), then let the engine map base→Weapon.
  const dmg = base?.damage
    ? { ...base.damage, bonus: base.damage.bonus + (base.ranged === 'missile' ? 0 : str.damage) }
    : undefined;
  return tacticalWeaponsFor(inv, dmg);
}

/**
 * A party member's **movement allowance** in tactical grid cells per round (CT.7k-1) — derived from their
 * carried-weight encumbrance move-rate (12" unencumbered down to 0" overloaded) via the engine's
 * 1e-inferred `moveRateToCells` map. Replaces combat's flat "move 5" placeholder. `undefined` for an
 * unmatched id (the combat layer keeps its placeholder for that figure).
 */
export function moveRateForMember(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const enc = encumbrance(inventoryWeightTenths(getInventory(sheet)), sheet.abilities.str, sheet.abilities.strPct);
  return moveRateToCells(enc.moveRate);
}

// ── Inventory persistence (A4.1) ────────────────────────────────────────────────────────────
// Each character's pack is stored separately from the roster (CharacterSheet stays a pure ruleset
// value), keyed by character name. A new character is seeded a class-appropriate starter kit the
// first time their inventory is opened. Base-type ids index the engine BASE_ITEMS catalogue.
type InventoryStore = Record<string, InventoryEntry[]>;

/** Starter gear per class (base-type ids): readied on seed so AC/THAC0 reflect it immediately. */
const CLASS_STARTER_KIT: Record<DragonlanceClassId, number[]> = {
  fighter: [10, 14, 81], // long sword, shield, chain mail
  knight: [10, 14, 81], // long sword, shield, chain mail
  ranger: [10, 14, 15], // long sword, shield, leather
  thief: [64, 15], // dagger, leather
  cleric: [12, 14, 15], // mace, shield, leather
  magicUser: [64, 5], // dagger, vial
};

function starterKit(classes: Partial<Record<DragonlanceClassId, number>>): Inventory {
  const cls = WEAPON_PRIORITY.find((c) => (classes[c] ?? 0) > 0) ?? 'fighter';
  const inv = inventoryFromIds(CLASS_STARTER_KIT[cls].map((id) => ({ id })));
  // Ready the starter weapon + armour + shield so the sheet/inventory show worn AC from the start.
  return { entries: inv.entries.map((e) => ({ ...e, equipped: true })) };
}

function loadInventories(): InventoryStore {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: InventoryStore = {};
    for (const [k, v] of Object.entries(parsed)) if (Array.isArray(v)) out[k] = v as InventoryEntry[];
    return out;
  } catch {
    return {};
  }
}

let inventoryStore: InventoryStore = loadInventories();

function persistInventories(): void {
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryStore));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

/** The pack for a character, seeding a class starter kit (and persisting it) on first access. */
export function getInventory(sheet: CharacterSheet): Inventory {
  const stored = inventoryStore[sheet.name];
  if (stored) return { entries: stored.map((e) => ({ ...e })) };
  const seeded = starterKit(sheet.classes);
  inventoryStore[sheet.name] = seeded.entries.map((e) => ({ ...e }));
  persistInventories();
  return seeded;
}

/**
 * Replace a character's pack (after ready/drop/use/sell/give/import) and persist. (M105.S1) Also
 * recomputes and persists `ac` from the new gear via `computeArmorClass` (which mirrors
 * `createCharacter`'s own `baseAc + defensiveAc` formula exactly) -- previously `ac` was frozen at
 * creation/import time forever, even though `sheetToCombatant()` (real combat) and `charSheet.ts`'s
 * View screen both read it directly.
 */
export function setInventory(name: string, inv: Inventory): void {
  inventoryStore[name] = inv.entries.map((e) => ({ ...e }));
  persistInventories();
  const s = roster.find((m) => m.name === name);
  if (s) {
    s.ac = computeArmorClass(inv, ADND1E_ABILITIES.dexterity(s.abilities.dex).defensiveAc);
    persist();
  }
}

/**
 * Append treasure items to a character's pack (A4.3 — collecting combat loot). Stackable items
 * (same base type, not yet equipped) merge their counts; everything else is added as a new entry.
 * Persists and returns how many distinct stacks were added/merged.
 */
export function giveItemsToMember(name: string, items: readonly TreasureItem[]): number {
  if (items.length === 0) return 0;
  const entries: InventoryEntry[] = (inventoryStore[name] ?? []).map((e) => ({ ...e }));
  for (const it of items) {
    const stack = entries.find((e) =>
      e.baseTypeId === it.baseTypeId && e.itemTypeId === it.itemTypeId && !e.equipped && e.count > 1,
    );
    if (stack) stack.count += it.count;
    else entries.push({
      name: it.name,
      baseTypeId: it.baseTypeId,
      ...(it.itemTypeId !== undefined ? { itemTypeId: it.itemTypeId } : {}),
      count: it.count,
      equipped: false,
      value: it.value,
    });
  }
  inventoryStore[name] = entries;
  persistInventories();
  return items.length;
}

// ── Party gold pool (A4.3) ──────────────────────────────────────────────────────────────────
// A single shared steel-piece pool for the party (the Gold Box convention), persisted on its own.
let goldPool = loadGold();

function loadGold(): number {
  try {
    const raw = localStorage.getItem(GOLD_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function getGold(): number {
  return goldPool;
}

/** Add (or, with a negative delta, spend) gold; clamps at zero. Returns the new total. */
export function addGold(delta: number): number {
  goldPool = Math.max(0, goldPool + Math.round(delta));
  try {
    localStorage.setItem(GOLD_KEY, String(goldPool));
  } catch {
    /* storage disabled — keep in-memory */
  }
  return goldPool;
}

// ── Experience points (A5.2) ─────────────────────────────────────────────────────────────────
// Per-character XP, persisted separately from the roster (the CharacterSheet stays a pure ruleset
// value). Combat victories award XP (split among the living); the training hall spends it on levels.
const XP_KEY = 'greybox.xp.cok';
type XpStore = Record<string, number>;

function loadXp(): XpStore {
  try {
    const raw = localStorage.getItem(XP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: XpStore = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && v >= 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

let xpStore: XpStore = loadXp();

function persistXp(): void {
  try {
    localStorage.setItem(XP_KEY, JSON.stringify(xpStore));
  } catch {
    /* storage disabled — keep in-memory */
  }
}

export function getXp(name: string): number {
  return xpStore[name] ?? 0;
}

export function setXp(name: string, xp: number): void {
  xpStore[name] = Math.max(0, Math.round(xp));
  persistXp();
}

export function addXp(name: string, amount: number): void {
  setXp(name, getXp(name) + amount);
}

export interface PartyXpAward {
  /** Battle XP total (`calcBattleExp`): per-enemy XP + gold's XP worth + magic-item pluses. */
  total: number;
  /** Retail results-page value: the pre-bonus, per-character share printed by CoK before
   * `addExp` applies an individual prime-requisite or multiclass adjustment. */
  baseShare: number;
  /** Per-member awards actually applied (already added to each member's `exp`); members who sat
   * the fight out (`hp <= 0`) or whose split rounded to 0 are omitted. */
  perMember: { name: string; awarded: number }[];
}

/**
 * Award a combat's real AD&D-1e XP to the party (`ovr006` `calc_battle_exp`/`addExp`, wired via
 * `ruleset/addnd1e/experience.ts` — see `docs/engine/research/decompile-ovr006-xp-treasure.md`):
 * battle XP = Σ per-enemy XP + gold's XP worth + Σ magic-item pluses·400, split among the living
 * with a single-class +10% prime-requisite bonus or a multiclass ÷N split. Replaces the previous
 * flat even-split, which ignored gold/item XP and the prime-requisite/multiclass rules entirely.
 * Applies each member's award directly (via `addXp`) and returns the resolved total + breakdown.
 */
export function awardPartyXp(enemies: DefeatedEnemy[], loot: BattleLoot = {}): PartyXpAward {
  const total = calcBattleExp(enemies, loot);
  if (total <= 0 || roster.length === 0) return { total, baseShare: 0, perMember: [] };
  const recipients: XpRecipient[] = roster.map((s) => ({
    abilities: s.abilities,
    classes: Object.keys(s.classes).map((c) => coreClass(c as DragonlanceClassId)),
    inCombat: s.hp > 0,
  }));
  const awards = awardCombatExperience(recipients, total);
  // CoK's `displayCombatResults(exp)` prints this raw split, while `addExp`
  // separately applies each character's prime-requisite/multiclass adjustment.
  // Greybox has no animated-party state yet, so every roster slot is in the
  // same divisor the current award model passes to `awardCombatExperience`.
  const baseShare = Math.floor(total / Math.max(1, roster.length));
  const perMember = awards
    .map((a, i) => ({ name: roster[i]!.name, awarded: a.awarded }))
    .filter((m) => m.awarded > 0);
  for (const m of perMember) addXp(m.name, m.awarded);
  return { total, baseShare, perMember };
}

/** Distinct retail `Item.type` ids currently carried by the party, for ECL FIND_ITEM. */
export function carriedItemTypeIds(): number[] {
  const types = new Set<number>();
  // Inventory persistence is name-keyed and may retain packs for characters no longer in the
  // active roster. FIND_ITEM examines the current party only, so stale off-roster packs must not
  // satisfy a quest gate.
  for (const member of roster) {
    const entries = inventoryStore[member.name] ?? [];
    for (const entry of entries) {
      if (entry.itemTypeId !== undefined) types.add(entry.itemTypeId & 0xff);
    }
  }
  return [...types].sort((a, b) => a - b);
}

export interface DestroyPartyItemsResult {
  itemTypeIds: number[];
  stacksRemoved: number;
  unitsRemoved: number;
  membersAffected: number;
}

/** Remove every matching runtime item type from the active party in one durable inventory commit. */
export function destroyPartyItemsByTypes(itemTypeIds: readonly number[]): DestroyPartyItemsResult {
  const wanted = new Set(itemTypeIds.map((itemTypeId) => itemTypeId & 0xff));
  const next: InventoryStore = { ...inventoryStore };
  const affected = new Set<string>();
  let stacksRemoved = 0;
  let unitsRemoved = 0;
  let removedEquipped = false;

  for (const member of roster) {
    const entries = inventoryStore[member.name] ?? [];
    const kept: InventoryEntry[] = [];
    for (const entry of entries) {
      if (entry.itemTypeId !== undefined && wanted.has(entry.itemTypeId & 0xff)) {
        stacksRemoved++;
        unitsRemoved += Math.max(1, entry.count);
        removedEquipped ||= entry.equipped;
        affected.add(member.name);
      } else {
        kept.push({ ...entry });
      }
    }
    if (affected.has(member.name)) next[member.name] = kept;
  }

  if (stacksRemoved > 0) {
    inventoryStore = next;
    persistInventories();
    if (removedEquipped) {
      for (const member of roster) {
        if (!affected.has(member.name)) continue;
        member.ac = computeArmorClass(
          { entries: inventoryStore[member.name] ?? [] },
          ADND1E_ABILITIES.dexterity(member.abilities.dex).defensiveAc,
        );
      }
      persist();
    }
  }

  return {
    itemTypeIds: [...wanted].sort((a, b) => a - b),
    stacksRemoved,
    unitsRemoved,
    membersAffected: affected.size,
  };
}

/** Single-opcode convenience wrapper around the atomic batch remover. */
export function destroyPartyItemsByType(itemTypeId: number): DestroyPartyItemsResult {
  return destroyPartyItemsByTypes([itemTypeId]);
}

// ── Town: training hall + shop + temple (A5.2) ────────────────────────────────────────────────
/** The most-martial class a character carries (drives weapon, training, and label). */
function primaryClass(classes: Partial<Record<DragonlanceClassId, number>>): DragonlanceClassId {
  return WEAPON_PRIORITY.find((c) => (classes[c] ?? 0) > 0) ?? 'fighter';
}

/** Steel the party leader carries the burden of (roster[0]); null when there is no party. */
export function leaderName(): string | null {
  return roster[0]?.name ?? null;
}

export interface TrainResult {
  ok: boolean;
  reason?: string;
  name: string;
  newLevel?: number;
  hpGain?: number;
  cost?: number;
}

const SAVE_KEYS = ['paralyzePoisonDeath', 'petrifyPolymorph', 'rodStaffWand', 'breath', 'spell'] as const;

/**
 * Train a member into their next level at the training hall: requires their XP to have reached the
 * threshold and the party to afford the fee (both checked by the engine `checkTraining`). On success
 * it spends the fee, bumps the primary class level, adds the hit-die-average HP plus the character's
 * Constitution per-level bonus (M87.S1 — `levelHpGain()`'s own doc comment: "if modelled, is added by
 * the host on top" — mirrors `create.ts`'s `estimateHp()`, which already applies this same bonus per
 * level at character creation) (and fully heals from the rest), and improves THAC0 by the core attack
 * table's level delta — preserving the existing Strength/deity to-hit offset baked into the sheet, and
 * (M104.S1) applies the same delta to the five saving throws so they don't stay frozen at the
 * creation-time level.
 */
export function trainMember(name: string, levelCapRuleset: 'cok' | 'dqk' = 'cok'): TrainResult {
  const s = roster.find((m) => m.name === name);
  if (!s) return { ok: false, name, reason: 'no such character' };
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  // M92.S1/M93.S1 — the same race/class level ceiling createCharacter() already enforces at creation
  // (Journal p. 56) for CoK/DoK; DQK's own manual prints a materially more permissive, but NOT
  // uncapped, table (`dqkMaxLevel()`) — a DQK session must enforce ITS OWN real ceiling, not none.
  const cap = levelCapRuleset === 'dqk' ? dqkMaxLevel(s.race, cls) : maxLevel(s.race, cls, s.abilities.str);
  const chk = checkTraining(core, level, getXp(name), getGold(), cap);
  if (!chk.eligible) return { ok: false, name, reason: chk.reason, cost: chk.cost };
  addGold(-chk.cost);
  // M87.S1 — coreClass() already folds knight->fighter, so core is one of fighter/ranger/thief/
  // cleric/magicUser here; mirrors create.ts's own warrior set (fighter/knight/ranger) post-mapping.
  const isWarrior = core === 'fighter' || core === 'ranger';
  const conBonus = ADND1E_ABILITIES.constitution(s.abilities.con, isWarrior).hp;
  const gain = levelHpGain(hitDie(core)) + conBonus;
  s.maxHp += gain;
  s.hp = s.maxHp;
  // Attack table improves as level rises (lower THAC0 = better); apply the delta to the sheet's value.
  const thac0Delta = classThac0(core, level) - classThac0(core, chk.targetLevel);
  s.thac0 = s.thac0 - thac0Delta;
  // M104.S1 — saves improve with level too; delta (not recompute) preserves any baked-in offset
  // (e.g. conPoisonSaveBonus on paralyzePoisonDeath) the same way thac0Delta preserves the to-hit offset.
  const savesBefore = classSaves(core, level);
  const savesAfter = classSaves(core, chk.targetLevel);
  for (const k of SAVE_KEYS) s.savingThrows[k] -= savesBefore[k] - savesAfter[k];
  s.classes = { ...s.classes, [cls]: chk.targetLevel };
  persist();
  return { ok: true, name, newLevel: chk.targetLevel, hpGain: gain, cost: chk.cost };
}

/** Training eligibility for a member without performing it (drives the hall's stock list).
 * `levelCapRuleset` mirrors {@link trainMember}'s own default/override (M92.S1/M93.S1). */
export function trainingStatus(name: string, levelCapRuleset: 'cok' | 'dqk' = 'cok'): { level: number; needXp: number; haveXp: number; cost: number; eligible: boolean; reason?: string } | null {
  const s = roster.find((m) => m.name === name);
  if (!s) return null;
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  const cap = levelCapRuleset === 'dqk' ? dqkMaxLevel(s.race, cls) : maxLevel(s.race, cls, s.abilities.str);
  const chk = checkTraining(core, level, getXp(name), getGold(), cap);
  return { level, needXp: chk.needXp, haveXp: chk.haveXp, cost: chk.cost, eligible: chk.eligible, reason: chk.reason };
}

export interface ShopResult {
  ok: boolean;
  reason?: string;
  gold: number;
  price: number;
  item?: string;
}

/** Buy one item into the leader's pack, paying the list price from the party pool. */
export function buyForLeader(id: number): ShopResult {
  const leader = roster[0];
  if (!leader) return { ok: false, reason: 'no party', gold: getGold(), price: 0 };
  const txn = buyItem(getGold(), id);
  if (!txn.ok) return { ok: false, reason: txn.reason, gold: getGold(), price: txn.price };
  addGold(-txn.price);
  const it = baseItem(id);
  giveItemsToMember(leader.name, [{ baseTypeId: id, name: it?.name ?? `Item ${id}`, count: 1 }]);
  return { ok: true, gold: getGold(), price: txn.price, item: it?.name };
}

/** The leader's pack as displayable entries (for the shop's Sell list). */
export function leaderInventory(): InventoryEntry[] {
  const leader = roster[0];
  return leader ? getInventory(leader).entries.map((e) => ({ ...e })) : [];
}

/**
 * Sell the leader's WHOLE pack entry at `index` in one transaction (M19.S1) — the shop's real
 * bulk-sale formula (`sellStack`, ovr020): a stack of non-ammo items takes the steep bulk
 * penalty in one offer rather than a full half-price per unit; ammo sells at full per-unit rate.
 */
export function sellFromLeader(index: number): ShopResult {
  const leader = roster[0];
  if (!leader) return { ok: false, reason: 'no party', gold: getGold(), price: 0 };
  const inv = getInventory(leader);
  const entry = inv.entries[index];
  if (!entry) return { ok: false, reason: 'no item', gold: getGold(), price: 0 };
  const txn = sellStack(getGold(), entry.baseTypeId, entry.count, entry.value);
  addGold(txn.price);
  const entries = inv.entries.map((e) => ({ ...e }));
  entries.splice(index, 1); // the whole stack just sold
  setInventory(leader.name, { entries });
  return { ok: true, gold: getGold(), price: txn.price, item: entry.name };
}

export interface TempleHealResult {
  ok: boolean;
  reason?: string;
  healed: number;
  cost: number;
}

/**
 * Fully heal every wounded, non-permadead member, paying per missing hit point (all-or-nothing).
 * M90.S1 — a merely-unconscious member (hp<=0 but not in {@link deadStore}) IS wounded-and-healable
 * here (CT.7h); only the permanently dead are excluded — they need {@link templeRaiseFirstDead}, not
 * this.
 */
export function templeHealAll(): TempleHealResult {
  const missing = roster
    .filter((s) => !deadStore.has(s.name))
    .reduce((sum, s) => sum + (s.maxHp - s.hp), 0);
  if (missing <= 0) return { ok: false, reason: 'nobody is wounded', healed: 0, cost: 0 };
  const cost = healCost(missing);
  if (getGold() < cost) return { ok: false, reason: 'not enough steel', healed: 0, cost };
  addGold(-cost);
  let healed = 0;
  for (const s of roster) {
    if (!deadStore.has(s.name) && s.hp < s.maxHp) {
      healed += s.maxHp - s.hp;
      s.hp = s.maxHp;
    }
  }
  persist();
  return { ok: true, healed, cost };
}

export interface TempleRaiseResult {
  ok: boolean;
  reason?: string;
  cost: number;
  name?: string;
  ruleReason?: RaiseDeadFailureReason;
}

/**
 * Raise the first PERMANENTLY DEAD member to 1 HP, paying the level-scaled fee. M90.S1 — a merely-
 * unconscious member is never eligible here (CT.7h; the original engine's own "is not dead" Raise
 * Dead refusal) — they heal via {@link templeHealAll}/rest/a cure instead.
 */
export function templeRaiseFirstDead(): TempleRaiseResult {
  const dead = roster.find((s) => deadStore.has(s.name));
  if (!dead) return { ok: false, reason: 'nobody to raise', cost: 0 };
  const level = dead.classes[primaryClass(dead.classes)] ?? 1;
  const cost = raiseCost(level);
  if (getGold() < cost) return { ok: false, reason: 'not enough steel', cost, name: dead.name };
  const idx = roster.indexOf(dead);
  const raised = raiseRosterMemberWithRules(recoverableRoster(), idx, { source: 'temple' });
  if (!raised.raised) return { ok: false, reason: raised.reason ?? 'cannot be raised', ruleReason: raised.reason, cost, name: dead.name };
  addGold(-cost);
  applyRecoveredRoster(raised.roster);
  return { ok: true, cost, name: dead.name };
}

/**
 * Full rest: restore every member to maximum HP (simplified — no per-spell/turn memorisation yet).
 * The **permadead** are left untouched (CT.7h) — only a Raise Dead brings them back, never bed rest.
 */
export function restParty(): void {
  let changed = false;
  for (const s of roster) {
    if (deadStore.has(s.name)) continue;
    if (s.hp !== s.maxHp) {
      s.hp = s.maxHp;
      changed = true;
    }
  }
  if (changed) persist();
}

/**
 * Rest the party with **natural healing** (AD&D bed rest, 1 HP per living member per day) via the
 * engine's pure {@link planRest}. By default the party rests just long enough to fully heal; pass
 * `{ days }` to rest a fixed span. Writes the recovered HP back into the roster (dead members are
 * left down) and returns the outcome (days/minutes/HP) so the caller can advance the game clock and
 * report elapsed time. This is the real wiring behind Encamp → Rest.
 */
export function restPartyNatural(opts?: RestOptions): RestOutcome {
  const outcome = planRest(roster.map((s) => ({ hp: s.hp, maxHp: s.maxHp })), opts);
  let changed = false;
  roster.forEach((s, i) => {
    const after = outcome.results[i]?.after;
    if (typeof after === 'number' && s.hp !== after) {
      s.hp = after;
      changed = true;
    }
  });
  if (changed) persist();
  return outcome;
}
