/**
 * Magic — spell memorization overlay (A2.1). The Encamp → Magic → Memorize flow: for each spell
 * caster in the party it shows the original Champions of Krynn bordered spellbook page (engine
 * {@link composeSpellbook}) listing the known spells grouped by spell level with a "used/total"
 * slot header and the memorized count beside each spell. A cursor walks the spells; Memorize fills
 * a slot, Forget frees one; Next/Prev cycle casters. Memorized sets persist per character.
 *
 * Slot counts come straight from the ruleset (`spellSlots` for mages, `clericSpellSlots` — which
 * folds in the Wisdom bonus — for clerics). Mounts as a modal overlay over the explorer like the
 * character sheet, with its own EGA surface; a `window.__magic` seam drives it from headless e2e.
 */
import {
  composeSpellbook,
  makeEgaPalette,
  DOS_EGA,
  spellSlots,
  clericSpellSlots,
  knownSpells,
  maxCastableLevel,
  memorize as memorizeSpell,
  forget as forgetSpell,
  memorizedAt,
  memorizedCount,
  freeSlots,
  spellEffect,
  rollSpellAmount,
  prayerGrant,
  chanceToLearnSpell,
  maxSpellsPerLevel,
  moonPhaseForDay,
  moonPhaseMods,
  type SpellbookRow,
  type SpellClass,
  type SpellDef,
  type Memorization,
  type CharacterSheet,
  type IndexedImage,
  type BitmapFont,
  type Palette,
  type ExploreFrameLayout,
} from '@goldbox/engine';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import {
  getParty,
  getMemorization,
  setMemorization,
  classLabel,
  healMember,
  reviveMemberWithRules,
  mostWoundedName,
  firstDeadName,
  scribeToSpellbook,
  spellbookCount,
  enqueueLearn,
} from './party.js';
import { playCastSfx, castSfxCount } from '../audio/castSfx.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const LIST_MAX = 16;

/** The command bar for a caster — mages get **Scribe** (copy into spellbook), clerics **Pray**. */
function menuFor(kind: SpellClass): string[] {
  const contextVerb = kind === 'magicUser' ? 'Scribe' : 'Pray';
  return ['Memorize', 'Cast', contextVerb, 'Forget', 'Next', 'Exit'];
}

interface CasterInfo {
  kind: SpellClass;
  /** Caster level in that class. */
  level: number;
  /** Memorizable slots per spell level [L1..L5]. */
  slots: number[];
  /** Highest castable spell level (1–5). */
  maxLevel: number;
}

/**
 * Detect the caster track of a sheet (mage takes precedence if somehow both), or null. For a
 * magic-user with a chosen {@link CharacterSheet.robe}, `day` (the current game day) folds in the
 * Three Moons' phase effect (Journal pp. 15-16, `moonPhaseMods`): the mage's effective casting
 * level shifts ±1 (raising or lowering which spell levels they can prepare at all) and High
 * Sanction (full moon) grants extra memorizable spells. A robe-less "Rogue mage" (or a cleric,
 * whose magic is deity-granted, not moon-governed) gets no phase adjustment. The Journal notes
 * additional spells "can be of any level the mage can cast" — with no spell-level picker yet, they
 * land on the caster's lowest available level (1st, always castable for any active mage).
 */
function casterInfo(sheet: CharacterSheet, day: number): CasterInfo | null {
  const mu = sheet.classes.magicUser ?? 0;
  const cl = sheet.classes.cleric ?? 0;
  if (mu > 0) {
    const mods = sheet.robe
      ? moonPhaseMods(moonPhaseForDay(sheet.robe, day), { level: mu, int: sheet.abilities.int })
      : { saveMod: 0, additionalSpells: 0, effectiveLevelMod: 0 };
    const effLevel = Math.max(1, mu + mods.effectiveLevelMod);
    const slots = spellSlots('magicUser', effLevel);
    if (mods.additionalSpells > 0) {
      const idx = slots.findIndex((n) => n > 0);
      if (idx >= 0) slots[idx] += mods.additionalSpells;
    }
    return { kind: 'magicUser', level: mu, slots, maxLevel: maxCastableLevel(slots) };
  }
  if (cl > 0) {
    const slots = clericSpellSlots(cl, sheet.abilities.wis);
    return { kind: 'cleric', level: cl, slots, maxLevel: maxCastableLevel(slots) };
  }
  return null;
}

interface Caster {
  sheet: CharacterSheet;
  info: CasterInfo;
}

interface SelectableRef {
  rowIndex: number;
  level: number;
  spell: SpellDef;
}

interface MagicSession {
  casters: Caster[];
  cur: number;
  cursor: number; // index into the current caster's selectable spell rows
  mem: Memorization;
  overlay: HTMLElement;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  frameLayout: ExploreFrameLayout | undefined;
  font: BitmapFont | null;
  onClose: (() => void) | null;
  /** Transient one-line result of the last cast (shown in the subtitle), or ''. */
  flash: string;
  /** Last cast description (for the e2e seam). */
  lastCast: string;
  /** M98 — a cleric's deity-granted "Extra spells" (Pray only), shown on the previously-blank row
   * under the subtitle; '' for a mage, or a deity with no extra-spells grant (e.g. Reorx). Cleared
   * the same way `flash` is (moveCursor/cycleCaster), so it doesn't linger under a different caster. */
  note: string;
  /** Per-overlay cast counter → a varying deterministic seed per cast. */
  castSeq: number;
}

let session: MagicSession | null = null;

/** Build the full row list + the parallel selectable-spell map for a caster's current memorization. */
function buildRows(info: CasterInfo, mem: Memorization): { rows: SpellbookRow[]; selects: SelectableRef[] } {
  const rows: SpellbookRow[] = [];
  const selects: SelectableRef[] = [];
  for (let level = 1; level <= info.maxLevel; level++) {
    const slots = info.slots[level - 1] ?? 0;
    if (slots <= 0) continue;
    const used = memorizedAt(mem, level).length;
    rows.push({ text: `Level ${level}   ${used}/${slots}`, header: true });
    for (const spell of knownSpells(info.kind, level).filter((s) => s.level === level)) {
      selects.push({ rowIndex: rows.length, level, spell });
      rows.push({ text: spell.name, count: memorizedCount(mem, spell.id, level) });
    }
  }
  return { rows, selects };
}

function currentCaster(): Caster | null {
  return session ? session.casters[session.cur] ?? null : null;
}

function paint(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { rows, selects } = buildRows(caster.info, session.mem);

  // Clamp the cursor and mark the selected spell row.
  if (selects.length === 0) session.cursor = 0;
  else session.cursor = Math.max(0, Math.min(selects.length - 1, session.cursor));
  const selRowIndex = selects[session.cursor]?.rowIndex ?? -1;
  if (selRowIndex >= 0) rows[selRowIndex] = { ...rows[selRowIndex], selected: true };

  // Scroll a window of LIST_MAX rows so the cursor stays visible.
  let start = 0;
  if (rows.length > LIST_MAX && selRowIndex >= 0) {
    start = Math.max(0, Math.min(rows.length - LIST_MAX, selRowIndex - Math.floor(LIST_MAX / 2)));
  }
  const windowRows = rows.slice(start, start + LIST_MAX);

  const totalSlots = caster.info.slots.reduce((a, b) => a + b, 0);
  const usedSlots = caster.info.slots.reduce((a, _b, i) => a + memorizedAt(session!.mem, i + 1).length, 0);
  const kindLabel = caster.info.kind === 'magicUser' ? 'Mage' : 'Cleric';
  const subtitle = session.flash
    ? session.flash
    : `${kindLabel} Spells   ${usedSlots}/${totalSlots} prepared`;
  const fb = composeSpellbook({
    frameTiles: session.frameTiles,
    frameLayout: session.frameLayout,
    font: session.font,
    view: {
      title: `${caster.sheet.name} — ${classLabel(caster.sheet.classes)}`,
      subtitle,
      note: session.note || undefined,
      rows: windowRows,
    },
    menu: { items: menuFor(caster.info.kind), selected: -1 },
  });
  session.surface.paint(fb, EGA_PALETTE);
}

function moveCursor(delta: number): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  if (selects.length === 0) return;
  session.cursor = (session.cursor + delta + selects.length) % selects.length;
  session.flash = '';
  session.note = '';
  paint();
}

function cycleCaster(delta: number): void {
  if (!session || session.casters.length === 0) return;
  const n = session.casters.length;
  session.cur = ((session.cur + delta) % n + n) % n;
  session.cursor = 0;
  session.flash = '';
  session.note = '';
  session.mem = getMemorization(session.casters[session.cur].sheet.name);
  paint();
}

function doMemorize(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  const slots = caster.info.slots[ref.level - 1] ?? 0;
  if (freeSlots(session.mem, ref.level, slots) <= 0) return;
  session.mem = memorizeSpell(session.mem, ref.spell.id, ref.level, slots);
  setMemorization(caster.sheet.name, session.mem);
  // Feed the faithful rest-time learn timer (ovr021 CheckForSpellLearning): the slot is committed
  // instantly above (keeps magic e2e green); this only drains at level×3 rest ticks on the next Rest
  // and emits the "<name> has memorized <spell>" flavour line, proving the original learn cadence.
  enqueueLearn(caster.sheet.name, ref.level, ref.spell.name);
  session.note = ''; // M99 — Memorize is a new action; a lingering Pray note is now stale
  paint();
}

function doForget(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  session.mem = forgetSpell(session.mem, ref.spell.id, ref.level);
  setMemorization(caster.sheet.name, session.mem);
  session.note = ''; // M99
  paint();
}

/**
 * Cast the spell under the cursor from camp. Only memorized, camp-castable spells fire; casting
 * consumes that memorized copy (you re-memorize on rest), plays the cast cue, and resolves the
 * effect through the ruleset's {@link spellEffect}: heals restore the most-wounded ally, Raise Dead
 * lifts a fallen member, cures/buffs are acknowledged (their full status model lands with combat in
 * A3.x). Attack spells are inert in camp ("nothing to target"). Sets a one-line `flash` result.
 */
function doCast(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  session.note = ''; // M99 — Cast is a new action; clear before any exit path (not memorized/not in camp too)

  // Must actually have it memorized to cast it.
  if (memorizedCount(session.mem, ref.spell.id, ref.level) <= 0) {
    session.flash = `${ref.spell.name}: not memorized`;
    paint();
    return;
  }

  const eff = spellEffect(ref.spell.id);
  if (!eff.campCastable) {
    session.flash = `${ref.spell.name}: not in camp`;
    paint();
    return;
  }

  // A deterministic but varying seed per cast (no Math.random in the engine path).
  const seed = (session.castSeq + 1) * 2654435761 + ref.spell.id.length * 97 + caster.info.level;
  session.castSeq += 1;

  let result = `${ref.spell.name} cast`;
  switch (eff.kind) {
    case 'heal': {
      const target = mostWoundedName();
      if (!target) {
        result = `${ref.spell.name}: all hale`;
      } else {
        const amount = eff.dice ? rollSpellAmount(eff, caster.info.level, seed) : 0;
        const healed = healMember(target, amount);
        result = healed > 0 ? `${ref.spell.name}: ${target} +${healed} HP` : `${ref.spell.name}: ${target} full`;
      }
      break;
    }
    case 'revive': {
      const target = firstDeadName();
      if (!target) {
        result = `${ref.spell.name}: none fallen`;
      } else {
        const revived = reviveMemberWithRules(target, { source: 'spell' });
        result = revived.raised
          ? `${ref.spell.name}: ${target} revived`
          : `${ref.spell.name}: ${target} ${revived.reason === 'elf' || revived.reason === 'no-con' ? 'cannot be raised' : 'not raised'}`;
      }
      break;
    }
    case 'cure':
      result = `${ref.spell.name}: affliction cured`;
      break;
    case 'buff':
      result = `${ref.spell.name}: party blessed`;
      break;
    case 'damage':
      result = `${ref.spell.name}: nothing to target`;
      break;
    default:
      result = `${ref.spell.name} cast`;
      break;
  }

  // Consume the memorized copy and cue the sound.
  session.mem = forgetSpell(session.mem, ref.spell.id, ref.level);
  setMemorization(caster.sheet.name, session.mem);
  playCastSfx();
  session.flash = result;
  session.lastCast = result;
  paint();
}

/**
 * Context action — **Scribe** for a magic-user, **Pray** for a cleric. Scribe rolls the AD&D 1e
 * "Chance to Know Each Listed Spell" table (`attemptScribe`, Intelligence-scaled d100) to copy the
 * spell under the cursor into the caster's persisted spellbook; a miss leaves the book unchanged so
 * the caster can try again later. A book already holding {@link maxSpellsPerLevel} spells of that
 * level is full — no room regardless of the roll. Pray petitions the cleric's deity, acknowledging
 * the granted spells — M98: including the deity's own "Extra spells" grant, shown on the note row
 * beneath the flash message (blank when the deity grants none, e.g. Reorx). Both set a one-line
 * `flash`.
 */
function doContext(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  if (caster.info.kind === 'magicUser') {
    const { selects } = buildRows(caster.info, session.mem);
    const ref = selects[session.cursor];
    if (!ref) return;
    const int = caster.sheet.abilities.int;
    const chance = chanceToLearnSpell(int);
    const status = scribeToSpellbook(caster.sheet.name, ref.spell.id, int);
    session.flash =
      status === 'scribed'
        ? `Scribed ${ref.spell.name} (${chance}% chance, book: ${spellbookCount(caster.sheet.name)})`
        : status === 'known'
          ? `${ref.spell.name} already in spellbook`
          : status === 'full'
            ? `Spellbook full at level ${ref.level} (max ${maxSpellsPerLevel(int)})`
            : `Failed to learn ${ref.spell.name} (${chance}% chance)`;
    session.lastCast = session.flash;
    session.note = '';
  } else {
    const grant = prayerGrant(caster.sheet.deity ?? null);
    session.flash = grant.message;
    session.lastCast = grant.message;
    // No "Grants:" label: Mishakal's 3-name list (33 chars) already sits at this row's ~35-36
    // character budget (M40) with the label it'd overflow it; the subtitle above already frames
    // this as a divine answer, so the bare spell list reads clearly as what was granted.
    session.note = grant.bonusSpells.length ? grant.bonusSpells.join(', ') : '';
  }
  paint();
}

export function isMagicOpen(): boolean {
  return session !== null;
}

export function closeMagic(): void {
  if (!session) return;
  const onClose = session.onClose;
  session.surface.dispose();
  session.overlay.remove();
  window.removeEventListener('keydown', onMagicKey, true);
  session = null;
  onClose?.();
}

function onMagicKey(e: KeyboardEvent): void {
  if (!session) return;
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); e.stopPropagation(); moveCursor(1); break;
    case 'ArrowUp': e.preventDefault(); e.stopPropagation(); moveCursor(-1); break;
    case 'ArrowRight': case 'n': case 'N': e.preventDefault(); e.stopPropagation(); cycleCaster(1); break;
    case 'ArrowLeft': case 'p': case 'P': e.preventDefault(); e.stopPropagation(); cycleCaster(-1); break;
    case 'Enter': case 'm': case 'M': e.preventDefault(); e.stopPropagation(); doMemorize(); break;
    case 'c': case 'C': e.preventDefault(); e.stopPropagation(); doCast(); break;
    case 's': case 'S': e.preventDefault(); e.stopPropagation(); doContext(); break;
    case 'f': case 'F': case 'Backspace': e.preventDefault(); e.stopPropagation(); doForget(); break;
    case 'Escape': case 'x': case 'X': e.preventDefault(); e.stopPropagation(); closeMagic(); break;
  }
}

/**
 * Open the spell-memorization overlay. Returns false (showing nothing) when the party has no spell
 * caster. `tiles`/`font` are the explorer's 8X8D frame tiles + text font so the page matches the
 * emulated screen exactly. `day` is the current game day (moon-phase effects, see {@link casterInfo}).
 */
export function openMemorize(opts: {
  frameTiles: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font: BitmapFont | null;
  day?: number;
  onClose?: () => void;
}): boolean {
  closeMagic();
  const casters: Caster[] = [];
  for (const sheet of getParty()) {
    const info = casterInfo(sheet, opts.day ?? 0);
    if (info && info.maxLevel > 0) casters.push({ sheet, info });
  }
  if (casters.length === 0) return false;

  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  panel.appendChild(emu);

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mkBtn('▲', () => moveCursor(-1));
  mkBtn('▼', () => moveCursor(1));
  mkBtn('Memorize', () => doMemorize());
  mkBtn('Cast', () => doCast());
  mkBtn('Scribe/Pray', () => doContext());
  mkBtn('Forget', () => doForget());
  mkBtn('◀ Prev', () => cycleCaster(-1));
  mkBtn('Next ▶', () => cycleCaster(1));
  mkBtn('✕ Exit', () => closeMagic());
  panel.appendChild(bar);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeMagic(); });
  document.body.appendChild(overlay);

  session = {
    casters,
    cur: 0,
    cursor: 0,
    mem: getMemorization(casters[0].sheet.name),
    overlay,
    surface,
    frameTiles: opts.frameTiles,
    frameLayout: opts.frameLayout,
    font: opts.font,
    onClose: opts.onClose ?? null,
    flash: '',
    lastCast: '',
    note: '',
    castSeq: 0,
  };
  window.addEventListener('keydown', onMagicKey, true);
  paint();
  surface.refresh();

  // Headless e2e seam.
  (window as unknown as { __magic?: Record<string, unknown> }).__magic = {
    isOpen: () => isMagicOpen(),
    casterCount: () => session?.casters.length ?? 0,
    casterName: () => currentCaster()?.sheet.name ?? '',
    casterKind: () => currentCaster()?.info.kind ?? '',
    cursor: () => session?.cursor ?? -1,
    move: (d: number) => moveCursor(d),
    nextCaster: () => cycleCaster(1),
    memorize: () => doMemorize(),
    cast: () => doCast(),
    context: () => doContext(),
    forget: () => doForget(),
    lastCast: () => session?.lastCast ?? '',
    note: () => session?.note ?? '',
    spellbookCount: () => (currentCaster() ? spellbookCount(currentCaster()!.sheet.name) : 0),
    slots: () => currentCaster()?.info.slots ?? [],
    castSfx: () => castSfxCount(),
    totalMemorized: () =>
      session ? session.mem.byLevel.reduce((n, r) => n + r.length, 0) : 0,
    close: () => closeMagic(),
  };
  return true;
}
