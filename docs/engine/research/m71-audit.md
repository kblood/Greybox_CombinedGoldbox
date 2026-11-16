# M71 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/research/m70-audit.md` in full (headline finding,
> verification evidence, "why this wasn't already picked up" grep evidence, wiring plan, rejected
> alternatives, open questions, implications) and skimmed M63–M69 for the established "sibling field
> on the same object" / "second consumer of the same fact" methods. Per M70's own closing
> "Implications" ("worth checking, for any future 'extend X to the other side' follow-up, whether the
> target function already naturally spans both sides"), this round re-opened `combat/tactical.ts`'s
> full `TacticalStatusFlag` union (nine values: `asleep | held | feared | fled | surrendered | hasted |
> slowed | unconscious | dead | guarding` — note the union header itself lists 10 tokens across two
> lines, tactical.ts:112-114) and cross-checked, one by one, which of the nine now has a UI consumer
> after M69/M70 shipped `impaired` for `asleep/held/feared/slowed`. Eight of nine are now accounted
> for (`fled`→skipped in `visibleCells()`; `unconscious`/`dead`→`down`; `asleep/held/feared/slowed`→
> `impaired`, M69/M70). **`guarding` is the one flag with zero persistent UI consumer anywhere** — it
> only ever reaches the player as a single scrolling combat-log line. `surrendered` turned out to be a
> *second*, smaller, adjacent finding (see Part 2) — the shipped code's own doc comment already claims
> it's handled, but the actual code doesn't do what the comment says.
>
> Before finalizing, grepped every `docs/engine/research/m*-audit.md` for `guarding`, `isGuarding`,
> `Guarding`, `triggerGuardReactions`, and `surrendered` — see "Why this wasn't already picked up"
> below. `isGuarding` has exactly two prior hits (M50, M51), both in a **different** framing that this
> round's finding does not re-litigate. `surrendered` has zero prior hits anywhere in the corpus.

## Headline finding (Part 1 — the primary candidate)

### `TacticalCombatant.flags.has('guarding')` — a real, player- AND AI-invokable, mechanically consequential combat stance (grants a free "opportunity" strike against anyone who moves adjacent) — has never been wired into either persistent combat UI surface (the sidebar party panel, or the battle-grid icon), only a single scrolling combat-log line and an e2e-only test accessor

**The mechanic is real and byte-grounded.** `packages/engine/src/combat/tactical.ts:1376-1400`'s own
doc comment:

```
* CT.7d — readied **GUARD** reactions. After `mover` finishes a move, every foe that is **Guarding**
* (readied its action via the guard command) and now within its melee reach gets ONE free strike at the
* mover, then spends the readied action. Models Champions of Krynn's own **Guard/Guarding** stance (the
* `Guard ` command @0xbf28 and the `Guarding` state string @0x38f51 are byte-located in `GAME.OVR`).
```

The `guarding` value lives in `TacticalStatusFlag` (`tactical.ts:112-114`), is set by the player (or
the AI)-invoked `guard` action (`tactical.ts:1800-1804`):

```ts
case 'guard': {
  // ... reach takes a free strike (see triggerGuardReactions). Models CoK's own Guard/Guarding stance.
  actor.flags.add('guarding');
  const ev: TacticalEvent = { round, type: 'guard', actor: actor.id, guarding: true };
```

and consumed by `triggerGuardReactions()` (`tactical.ts:1384-1400`), which runs after **every** move in
the battle (`tactical.ts:1373`, inside the same function that applies a move's hazard/regen ticks):

```ts
function triggerGuardReactions(mover: TacticalCombatant): TacticalEvent[] {
  if (!isActive(mover)) return [];
  const events: TacticalEvent[] = [];
  for (const g of living(foeSideOf(mover))) {
    if (!g.flags.has('guarding')) continue;
    if (g.flags.has('asleep') || g.flags.has('held') || g.flags.has('feared')) continue;
    if (figureDistance(g, mover) > (defaultWeapon(g).reach ?? 1)) continue;
    g.flags.delete('guarding');             // the readied action is spent
    g.facing = facingTo(g.pos, mover.pos);  // turn to face the advancing foe
    const strikes = resolveHit(g, mover, defaultWeapon(g), false);
    for (const e of strikes) if (e.type === 'attack') e.opportunity = true;
    events.push(...strikes);
```

This is a **state that persists across other combatants' turns** — it survives until the guardian's
own next turn begins, at which point it lapses if never triggered (`tactical.ts:978-983`):

```ts
function beginTurn(actor: TacticalCombatant): void {
  moveLeft = actor.move * 2;
  acted = false;
  // CT.7d — a readied guard that never triggered lapses when the figure's own turn comes round again,
  // so it takes a fresh action instead of staying frozen in the guard stance.
  actor.flags.delete('guarding');
```

**It's reachable from real play on BOTH sides, not just a synthetic test fixture:**
- The **player** sets it via the live "Guard" command — a first-class entry in the actual combat menu,
  `apps/web/src/ui/combat.ts:95` (`const MENU_ITEMS = ['Move', 'Attack', 'Cast', 'Guard', 'Wait',
  'Flee'] as const;`), selectable by mouse/arrow-keys+Enter or the `G` hotkey
  (`apps/web/src/ui/combat.ts:1134`: `case 'g': case 'G': claim(); partyGuardWait('guard'); break;`),
  routed through `partyGuardWait('guard')` (`combat.ts:836-844`) → `c.apply({ type: 'guard' })`.
- The **built-in enemy AI** sets it autonomously too, with no player action at all —
  `tactical.ts:1587-1628`'s `aiAction()` falls back to `{ type: 'guard' }` whenever a combatant has
  nothing better to do this turn (no foes in reach/range, no useful move left):
  ```ts
  if (foes.length === 0) return acted ? { type: 'endTurn' } : { type: 'guard' };   // line 1593
  ...
  return acted ? { type: 'endTurn' } : { type: 'guard' };                          // line 1628
  ```
  So an **enemy** can be sitting in ambush-ready Guarding stance purely from the AI's own decision
  process, with the player having done nothing to cause it.

**The only place any of this reaches the player today** is a single line pushed onto a log that is
capped to the **last 5 entries** shown on screen (`apps/web/src/ui/combat.ts:519`: `const lines =
[...state.log.slice(-5), state.banner]...`), emitted once at `combat.ts:644-645`:

```ts
case 'guard':
  pushLog(e.guarding ? `${nameOf(e.actor)} takes a guarding stance.` : `${nameOf(e.actor)} guards.`);
```

(The `e.guarding ? ... : ...` ternary's else-branch is in fact unreachable — the only place a `'guard'`
event is ever constructed, `tactical.ts:1804`, always sets `guarding: true` — a harmless pre-existing
dead branch, not part of this round's finding, not touched.)

There is exactly **one** other consumer, and it is test-only:
`apps/web/src/ui/combat.ts:1197`'s e2e seam, `isGuarding: (id: string) => state?.combat.isGuarding(id)
?? false,` — wired to nothing the player can see, only `window.__combat.isGuarding(id)` for headless
tests. The underlying `TacticalCombat.isGuarding(id)` accessor (`tactical.ts:661-662`) is a full
first-class member of the public combat interface, documented as "it will strike the first foe to
enter reach" — i.e. the engine's own author already flagged this as something the UI *should* be able
to show, but no display consumer was ever built.

**Neither persistent combat screen reads it.** `apps/web/src/ui/combat.ts`'s `visibleCells()`
(`combat.ts:474-495`, the battle-grid icon compositor) and `panelRows()` (`combat.ts:497-515`, the
sidebar party panel) — the exact same two functions M69/M70 already extended once each for
`asleep/held/feared/slowed` — build their per-figure view models from `c.flags` but never test for
`'guarding'`:

```ts
// combat.ts:482-492 (visibleCells(), current source)
cells.push({
  combatantId: c.id, side: c.side, col: sc, row: sr,
  icon: c.side === 'enemy' ? state.assets.enemyIcon : null,
  down: c.hp <= 0,
  active: c.id === state.activeId,
  size: state.combat.sizeOf(c.id),
  impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
});
```

```ts
// combat.ts:501-514 (panelRows(), current source)
.map((c) => ({
  name: state!.names.get(c.id) ?? c.id,
  ac: c.ac,
  hp: Math.max(0, c.hp),
  active: c.id === state!.activeId,
  down: state!.combat.conditionOf(c.id) !== 'ok',
  impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
}));
```

The underlying view-model **types** have no field for it either:
`packages/engine/src/render/combatScreen.ts`'s `CombatCellState` (`combatScreen.ts:111-139`) has
`combatantId, side, col, row, icon, hpFraction?, down?, active?, size?, impaired?` — no `guarding`.
`packages/engine/src/render/exploreScreen.ts`'s `ExploreParty` (`exploreScreen.ts:144-168`) has
`name, ac, hp, active?, down?, impaired?` — no `guarding`.

### Why this matters mechanically, not just cosmetically

A player deciding whether to move a party member adjacent to a specific enemy has **no way to tell**,
from either the battle-grid or the sidebar, that stepping into that enemy's reach will provoke a free,
undodgeable strike (the reaction attack is a plain `resolveHit()` call with the normal to-hit roll, but
the player gets no warning it's coming at all, unlike an ordinary attack they choose to make). This is
the exact class of "the engine already tracks a fact that changes the right tactical decision, but the
decision screen doesn't show it" gap this loop rewards — directly analogous to M69/M70's `impaired`
fix, but for a **positive/tactical-hazard** fact (an ambush readied against the mover) rather than a
disabling condition, and unlike M69/M70's fix, it applies to a status that can be entered by AI
decision-making alone, with no player action as the trigger.

## Why `isGuarding` was already looked at twice (M50, M51) but this is still a fresh finding

`grep -rn "isGuarding" docs/engine/research/m*-audit.md` returns exactly two hits:

- **M50** (`m50-audit.md:305`): re-grepped the full `TacticalCombat` interface doc-comment by
  doc-comment, looking specifically for "a fourth candidate beyond `slaysHelpless()`" in the **narrow
  shape of a pre-attack targeting-banner hint** (the `highlightTarget()` mechanism M50.S1 itself
  shipped, which only fires while the player is mid-target-selection on one specific enemy). Its
  verdict: *"`isGuarding`/`canDelay` already have live UI affordances (guard/delay actions in the menu,
  not a hint format)"* — i.e., M50 was asking **"can the player invoke this?"** (yes, trivially, via
  the Guard menu command) and stopped there.
- **M51** (`m51-audit.md:362`): explicitly declined to re-open the same interface, deferring entirely
  to M50's read.

Neither round asked the question this round asks: **"does the player have any way to see that an
OPPONENT (or a not-yet-approached ally) is currently in this state, before deciding whether to move
next to it?"** That question didn't even have an available answer mechanism at M50's time (April... —
chronologically, M50) — the `impaired`-style persistent status marker on `panelRows()`/`visibleCells()`
is machinery M69/M70 built **19 rounds later**. M50's rejection was correct on its own narrower
question (does Guard need a new way to be *invoked* — no) and simply never asked the different
question this round asks (does Guard need a new way to be *seen*, on a status marker mechanism that
didn't exist yet). `canDelay` is a genuinely different kind of predicate from `guarding` and is
correctly excluded from this round's fix: `canDelay()` answers "can the **current** actor legally
Delay right now" (a menu-gating fact about the acting figure, already visible because Delay either
does or doesn't appear as a legal action) — it has no persistent-status shape at all, nothing
comparable to a `TacticalStatusFlag` a bystander/opponent could usefully be shown. `guarding` is the
odd one out among M50's eight candidates precisely because it — alone among them — is a flag stored
**on the combatant** (`TacticalCombatant.flags`), exactly like `asleep/held/feared/slowed`, not a
computed one-shot predicate about the current actor's own turn.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m71_verify.test.ts` (created, run green — 4/4 passing, full engine
suite re-run clean at 1351/1351 across 135 files — then deleted; `git status --porcelain` confirmed
clean afterward, this doc the only untracked file):

1. **The mechanic is real and produces a real state transition.** Built a 2-combatant tactical scenario
   (`createTacticalCombat`) with a guardian (`initiative: 20`, acts first) and an advancing enemy
   (`move: 6`, `initiative: 1`). Called `c.apply({ type: 'guard' })`, asserted the resulting event has
   `guarding === true`, `g.flags.has('guarding') === true`, and `c.isGuarding('g') === true` (the one
   existing, e2e-only accessor). Then called `c.apply({ type: 'move', to: {...} })` for the advancer,
   moving it adjacent — and confirmed a real `'attack'` event fired with `opportunity === true`,
   `actor === 'g'`, `target === 'm'`, AND that `g.flags.has('guarding')` flipped back to `false`
   (the readied reaction was consumed) — a genuine, observable state machine, not a cosmetic flag.
2. **The view-model types genuinely have no field for it.** Constructed object literals matching
   `CombatCellState`'s exact current shape (`{ combatantId, side, col, row, icon, down, active, size,
   impaired }`) and `ExploreParty`'s exact current shape (`{ name, ac, hp, active, down, impaired }`)
   and asserted `'guarding' in cell === false` / `'guarding' in row === false` for both — confirming
   the gap is in the type itself, not just an unread field on an existing one.

## Headline finding (Part 2 — a smaller, adjacent finding: a wrong rationale claim already sitting in shipped code)

While tracing every `TacticalStatusFlag` value's UI consumer (the sweep that surfaced Part 1), one flag
came up with a **consumer that contradicts its own doc comment**: `surrendered`.

`CombatCellState.impaired`'s own doc comment (`packages/engine/src/render/combatScreen.ts:130-137`,
written when M70 shipped the field) says:

```ts
/**
 * M70.S1 — currently under a disabling status (asleep/held/feared/slowed) this fight, mirroring
 * `ExploreParty.impaired` (M69.S1) but for the on-grid figure rather than the sidebar row. Applies to
 * either side (an enemy the player hasn't targeted yet, or the player's own hero). A top-of-footprint
 * bar, distinct from `down`'s bottom-of-footprint prone bar so the two never collide visually.
 * Intentionally excludes `hasted` (a buff) and `fled`/`surrendered`/`unconscious`/`dead` (already
 * covered by `down`/the `fled` skip in `visibleCells()`).
 */
impaired?: boolean;
```

This claims a `surrendered` figure is "already covered by ... the `fled` skip in `visibleCells()`."
**It is not.** The actual, current `visibleCells()` (`apps/web/src/ui/combat.ts:474-495`) only skips
`fled`:

```ts
for (const c of state.combatants) {
  if (c.flags.has('fled')) continue; // left the field
  ...
  cells.push({
    ...,
    down: c.hp <= 0,
    ...
    impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
  });
}
```

A `surrendered` enemy (`tactical.ts:914-928`, set by `applyMoraleOutcome()` when a monster's side
collapses while it personally isn't bloodied — a real, already-engine-tested path, see
`packages/engine/test/tactical.test.ts:797-806`, *"a personally-sound monster surrenders when its side
collapses"*) is `isActive() === false` (excluded from targeting, `meleeTargets()`/`missileTargets()`,
and the turn order — confirmed by `isActive`'s own definition at `tactical.ts:696`: `c.hp > 0 &&
!c.flags.has('fled') && !c.flags.has('surrendered')`), but it keeps **full HP** (surrender is not a
defeat) and is **not** `fled`. So today it draws through `visibleCells()`/`drawCombatant()`
pixel-identically to a fully active, untouched enemy: `down` is false (hp > 0), `impaired` is false
(`surrendered` isn't one of the four checked flags), and there is no third signal. A player has no
visual cue that this particular enemy is permanently out of the fight and cannot be targeted or act
again — they might try to attack it (silently absent from the target list, `meleeTargets()`/
`missileTargets()` already correctly exclude it — this is **not** a rules bug, only a **display**
inconsistency) or simply be confused about why the battle ended while an apparently-unhurt enemy is
still standing there.

**Verification:** the scratch test's 4th case reproduced the real "side collapses" scenario from
`tactical.test.ts:797-806` (one enemy overkilled, its ally left at full HP, both sharing `morale: 50`)
and confirmed `e1.flags.has('surrendered') === true` while `down === false` and `impaired === false`
using `visibleCells()`'s own exact derivation — i.e., the gap is real, not hypothetical, for a
mechanism the engine already exercises in its own test suite.

This is a smaller, secondary finding (a stale/incorrect rationale in a doc comment, in the spirit of
the "note on rigor" this loop has been warned about — an incidental claim that turned out not to match
the code it was describing) rather than the round's primary candidate, but it's cheap to fix alongside
Part 1 since both touch the same two functions.

## Why this wasn't already picked up (grep evidence against every prior round)

- **`guarding`** (lower-case, the flag value / field name) — hits only in M27 (unrelated: a different
  "guard" — an `undefined`-for-DoK code guard clause, not this mechanic), M35/M36 (both about a
  "VILLAGE GUARD" ECL dialogue NPC in DoK's own game text — a different subsystem entirely, not the
  combat stance), M45 (an unrelated "single guard" code-style remark), M47 (an unrelated `?:` null
  guard), M48 (an unrelated `if` guard clause), M50/M51 (the `isGuarding` predicate, addressed above —
  different question, different era of the codebase). None of these hits concern
  `TacticalStatusFlag`'s `'guarding'` value or its UI wiring.
- **`isGuarding`** — exactly M50 and M51, both fully addressed above (a different question: "can the
  player invoke Guard," not "can the player see who's guarding").
- **`surrendered`** — zero hits in any prior `m*-audit.md`. This flag has never been individually
  examined by this loop before.
- **`TacticalStatusFlag`'s full 9/10-token union** — M69/M70 each grepped and fixed exactly
  `asleep/held/feared/slowed`; neither round's own text claims to have swept the *entire* union
  looking for a flag with zero consumer (M69's scope was explicitly "does `.flags` reach the sidebar,"
  M70's was "does `.flags` reach the grid" — both already scoped to the same four values from the
  start, inherited from M68's `.inflict` work, never re-derived from the flag union itself). This
  round is the first to enumerate all nine/ten values and check each one's consumer status
  individually.

## Wiring plan

Small, additive, and reuses the exact three-part shape M69/M70 already established (new optional
view-model field → one apps/web mapping line per compositor → one render branch), landing in the
same four files both those rounds touched.

**1. `packages/engine/src/render/combatScreen.ts`** — add `guarding?: boolean` to `CombatCellState`
(after `impaired`), plus a new EGA colour constant distinct from the existing `C_YELLOW`
(caution/impaired) and `C_GRAY` (down):

```ts
const C_CYAN = 11; // M71.S1 — guarding (readied ambush stance); a cool "on watch" tone, distinct
                    // from C_YELLOW (impaired/caution) and C_GRAY (down)
```

```ts
export interface CombatCellState {
  ...
  impaired?: boolean;
  /**
   * M71.S1 — this figure has a readied Guard reaction (`TacticalCombatant.flags.has('guarding')`,
   * CT.7d): the first foe to move within its melee reach takes a free "opportunity" strike
   * (`triggerGuardReactions()`). Set by the player's own Guard command OR the built-in AI (which
   * guards autonomously when it has nothing better to do this turn) — so an ENEMY can show this with
   * no player action at all. Applies to either side. A LEFT-edge vertical bar, distinct from
   * `impaired`'s top bar and `down`'s bottom bar so no two markers can ever collide.
   */
  guarding?: boolean;
}
```

**2. `combatScreen.ts`'s `drawCombatant()`** — one more unconditional branch (guarded by the same
early-`return` on `cell.down` the `impaired` bar already relies on):

```ts
if (cell.impaired) fillRectIndexed(fb, rect.x, rect.y, fw, 2, C_YELLOW);
// M71.S1 — a left-edge bar for a readied Guard stance; a distinct edge from impaired's top bar and
// down's bottom bar, so a (rare, transient) figure that is briefly both guarding and impaired
// (e.g. put to sleep before its reaction triggers — inflictStatus() doesn't clear 'guarding') never
// visually conflicts.
if (cell.guarding) fillRectIndexed(fb, rect.x, rect.y, 2, fh, C_CYAN);
```

**3. `apps/web/src/ui/combat.ts`'s `visibleCells()`** — one new line, mirroring the `impaired` line
directly below it:

```ts
cells.push({
  combatantId: c.id, side: c.side, col: sc, row: sr,
  icon: c.side === 'enemy' ? state.assets.enemyIcon : null,
  down: c.hp <= 0,
  active: c.id === state.activeId,
  size: state.combat.sizeOf(c.id),
  impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
  // M71.S1 — mirrors `impaired`'s wiring, for the one TacticalStatusFlag it doesn't cover: a readied
  // ambush that will strike the next foe to approach (CT.7d). Real for either side.
  guarding: c.flags.has('guarding'),
});
```

**4. `packages/engine/src/render/exploreScreen.ts`** — add `guarding?: boolean` to `ExploreParty`
(after `impaired`, same doc-comment style as `impaired`'s own M69.S1 entry), and
**`combatScreen.ts`'s** sidebar-panel colour line (`combatScreen.ts:326`) gets one more tier, below
`impaired` (since a figure that's both impaired and (rarely, transiently) guarding should show the more
urgent "can't act" signal first — matching the existing `active > down > impaired > … > default`
priority ladder):

```ts
const color = p.active ? C_WHITE : p.down ? C_GRAY : p.impaired ? C_YELLOW : p.guarding ? C_CYAN : C_GREEN;
```

**5. `apps/web/src/ui/combat.ts`'s `panelRows()`** — one new line:

```ts
.map((c) => ({
  name: state!.names.get(c.id) ?? c.id,
  ac: c.ac,
  hp: Math.max(0, c.hp),
  active: c.id === state!.activeId,
  down: state!.combat.conditionOf(c.id) !== 'ok',
  impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
  // M71.S1 — a party member who chose Guard this fight; a reminder that they'll strike back if a foe
  // closes, since the only other trace is a single scrolling combat-log line.
  guarding: c.flags.has('guarding'),
}));
```

**6. The `surrendered` fix (Part 2)** — one-line addition to `visibleCells()`'s skip condition, making
the shipped doc comment's existing claim actually true:

```ts
for (const c of state.combatants) {
  if (c.flags.has('fled') || c.flags.has('surrendered')) continue; // left the field / gave up
  ...
```

(No `CombatCellState`/`ExploreParty` field needed for this half — it's a "stop drawing it" fix, the
same treatment `fled` already gets, not a new marker.)

**7. Tests to extend:**
- `packages/engine/test/combatScreen.test.ts` — new cases mirroring the existing `impaired`-bar tests
  (see `it('draws an impaired caution bar...')`): assert a left-edge `C_CYAN` bar appears for
  `guarding: true`, that it coexists with (doesn't overwrite) the `impaired` top bar and `down`'s
  early-return still suppresses it, and that a `surrendered`-only cell is never constructed by
  `visibleCells()` (or, at the `combat.ts` level, that a surrendered enemy's id no longer appears in
  `visibleCells()`'s output).
- `apps/web/test/e2e.mjs` — the existing `guard()`/`isGuarding()` seams (`combat.ts:1180`, `:1197`)
  already exist; extend with an assertion that after `window.__combat.guard()`, the drawn frame (or a
  new `window.__combat.cellGuarding(id)` seam) reflects `guarding: true` for that combatant's grid cell,
  and that surviving a side-collapse-surrender scenario removes that combatant's id from
  `window.__combat` cell state.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Re-picking `isGuarding` under M50/M51's own already-answered question ("does Guard have a UI entry point") | Not this round's claim at all — M50/M51 correctly answered a different question (can the player invoke Guard — yes). This round's claim is the mirror: can the player/opponent **see** who is currently guarding, on either persistent status-marker surface that didn't exist until M69/M70. Explicitly distinguished in "Why isGuarding was already looked at twice" above. |
| Extending `canDelay` the same way | Rejected: `canDelay()` is a "can the **current actor** legally do this right now" predicate (already visible via the legal-actions/menu list), not a persisted per-combatant flag comparable to `TacticalStatusFlag`. There is nothing analogous to show about a bystander. |
| Treating `guarding` as a 5th tier folded into the existing `impaired` colour/flag instead of a new one | Rejected: conflating "can't act, in danger" (impaired) with "chose to ready an ambush" (guarding) would misrepresent a defensive/tactical-advantage state as a warning, and the two CAN (rarely, transiently) co-occur (a guarding figure can be put to sleep before its reaction triggers, since `inflictStatus()` never clears `'guarding'` — only `beginTurn()`/a successful trigger does) — a single boolean can't carry both. A distinct field + distinct bar edge keeps them unambiguous, exactly the reasoning M70 already used to justify putting `impaired` at the *top* and `down` at the *bottom*. |
| Showing the surrendered figure with a NEW marker (e.g. a "flag" icon) instead of simply not drawing it | Considered, not chosen as the primary recommendation: `fled` already gets the "stop drawing it" treatment for a conceptually similar "no longer part of the fight" case, and the combat log already narrates the surrender event distinctly from a kill/flee ("X surrenders!"). Skipping it is the minimal-diff fix that also makes the existing (currently false) doc-comment claim true. Flagged as an open question below in case a lead reviewer prefers a distinct "surrendered, out of the fight" marker instead of invisibility — both are compatible with the finding; only the specific rendering choice is up for debate. |
| Chasing the unreachable `e.guarding ? ... : 'guards.'` ternary in `combat.ts:645` | Out of scope — a harmless dead branch (the only `'guard'` event constructor always sets `guarding: true`), a code-quality nit rather than a data-gap of this loop's shape. Noted in Part 1, not pursued as a fix. |
| A full sweep of `TacticalEvent.opportunity` for other UI uses | Checked: `opportunity` is only read by the combat-log formatter's default case (falls through with no special phrasing) — i.e., a guard's reaction strike currently logs identically to an ordinary attack, with no "(opportunity!)" tag the way `backstab`/`coupDeGrace` get one. This is a real, smaller, related gap (the ONE-TIME log line for an opportunity attack doesn't even distinguish itself from a normal attack) but was left unpicked in favour of the stronger, persistent-marker finding above; flagged as an open question, not built this round. |

## Open questions / unknowns

- Whether a `(Opportunity!)` tag should be added to the attack combat-log line when `e.opportunity` is
  true, mirroring the existing `(Backstab!)`/`(Coup de Grace!)` tags (`combat.ts:967-972`) — flagged
  above, not built this round; a natural, very small follow-up.
- Whether `surrendered` should get a distinct "gave up, harmless" marker instead of simply
  disappearing from the grid like `fled` — this round recommends the minimal-diff "stop drawing it"
  fix (matching `fled`'s existing treatment and making the current doc comment's claim true), but a
  lead reviewer may prefer a visible "no longer a threat" indicator instead of invisibility; **UNKNOWN**
  which the team prefers, both are compatible with this finding.
- Whether the left-edge-bar geometry choice for `guarding` (vs., say, a right-edge bar, distinguishing
  it from a hypothetical FUTURE fourth marker) leaves enough room if a future round wants a fifth
  persistent per-figure signal — **UNKNOWN**, not pursued; the four cardinal edges of a footprint
  rectangle (top/impaired, bottom/down, left/guarding, right/unused) leave exactly one edge spare.
- Whether the sidebar's new `C_CYAN` "guarding" tier should also apply to an ENEMY somehow surfaced on
  a future "enemy status" panel (no such panel exists today — `panelRows()` is party-only by
  construction) — **UNKNOWN**, out of scope; the grid fix (item 3 above) already covers enemies, since
  `visibleCells()`, unlike `panelRows()`, iterates both sides (the same asymmetry M70 already
  documented for `impaired`).

## Standing candidates checked and ruled back out this round

- **`hasted` as a positive buff indicator** — not re-examined; still the same M69/M70 judgement call
  (a buff, not a warning/hazard), and this round's `guarding` finding is a genuinely different shape
  (a hazard-to-the-mover, not a self-buff) so it doesn't reopen that debate.
- **`referenceDb.ts`'s Class-label collision** — still unpicked, still lower-value than this round's
  finding; not re-litigated.
- **ECL-ally morale%** — untouched, per its M61 retirement.
- **Sleep's `hdCap` fidelity gap for party members** (`TacticalCombatant.hd` undefined for PCs) — still
  a different class of finding (rules-fidelity, not display-gap); not pursued, a stronger display-gap
  candidate (this round's) was available.
- **`slaysHelpless()`'s `(Coup de Grace!)` banner interaction with the persistent grid marker** — still
  not investigated (M70's own flagged-but-undecided question); not re-opened this round.
- **`itemCategory()`/`DqkItemRecord`/`DokItemRecord.value` item-instance subsystem** — still correctly
  dead per every prior round back through M27; not re-litigated.
- **`TacticalCombatant.int`** (the morale surrender-vs-flee smart/dumb split, `tactical.ts:906-909`) —
  investigated in the course of tracing `surrendered`'s real trigger path. Confirmed still genuinely
  unset by every real construction site (`apps/web/src/ui/combat.ts`'s `makeTC()` never sets `int:` on
  a `TacticalCombatant`, and the base `Combatant` interface in `combat/combat.ts` has no `int` field at
  all for `monsterCombatant()` to populate) — so `moraleBreakOf()`'s `c.int !== undefined` branch stays
  dead code for every real monster, and the engine always falls through to the legacy split
  (`personallyBroken ? 'flee' : 'surrender'`). This is the SAME class of finding as the Sleep `hdCap`
  gap above (a rules-fidelity gap sitting behind an always-false guard, not a display gap) — noted,
  not pursued as this round's primary candidate, since `surrendered`'s real (non-`int`-gated) trigger
  path is already exercised by the engine's own test suite (`tactical.test.ts:797-806`) and by this
  round's own scratch verification, so the *display* gap (Part 2) stands on solid ground independent
  of whether `int` is ever wired up.

## Implications for our engine

- **Enumerating a small union type's full member list against its consumers, one member at a time, is
  a productive and under-used variant of the "sibling field" method** — M69/M70 both worked from a
  pre-selected subset of `TacticalStatusFlag` (the four inherited from M68's `.inflict` work) without
  ever writing out and checking the *entire* union. Doing that exhaustively here immediately surfaced
  the one flag (`guarding`) with genuinely zero UI consumer, plus a bonus finding (`surrendered`) that
  a previous round's own shipped rationale comment doesn't match the code it describes.
- **A prior round's rejection can be correct on the question it actually asked, and still leave a
  materially different question about the exact same field unexamined** — M50 asked "can this be
  invoked" and correctly said yes; this round asks "can this be *seen* by someone other than the actor
  who set it," a question that had no available answer mechanism until 19 rounds later. Worth checking,
  for any earlier round's rejected `TacticalCombat` predicate, whether it was evaluated only against
  the UI machinery that existed *at the time*, not against machinery a much later round built.
- **A doc comment's own stated rationale for *excluding* something from a fix ("already covered by X")
  is exactly the kind of claim that needs independent re-verification against the current, actual code**
  — not just claims made in an audit doc (the standing "note on rigor"), but claims baked directly into
  shipped source comments by the very round that wrote them. `combatScreen.ts:135-136`'s "`fled`/
  `surrendered`/... already covered by `down`/the `fled` skip in `visibleCells()`" reads as authoritative
  and was almost certainly copy-checked against `fled`, `unconscious`, and `dead` (all genuinely true) —
  but `surrendered` slipped through as an assumption never actually tested against the real
  `visibleCells()` source at the moment the comment was written.
