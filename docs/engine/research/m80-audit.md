# M80 audit — the next "computed but unwired" candidate

> Audit method: applied the brief's priority-1 technique fresh (M79's newest scope (h) — a
> broadly-worded state invariant in a doc comment, checked against every function that touches that
> state) to a DIFFERENT clause of `combat/tactical.ts`'s own top-level `TacticalStatusFlag` doc comment
> (lines 99-111) than the one M79 already closed. M79 exhausted the **`asleep`-wakes-on-damage**
> clause (line 109) across all three damage sources. This round instead checked the **`feared`**
> clause (line 101: *"`feared` figures can't attack and flee toward the nearest edge on their
> turn"*) against every code path that drives a `feared` actor's own turn — not just the ones that
> mutate `target.flags`, but the two *control paths* (the engine's built-in AI vs. the real player-facing
> UI) that can each end up driving that turn.
>
> **Verdict: the forced-flee half of the invariant is honored by exactly ONE of the two control paths.**
> The engine's own `aiAction()` (`tactical.ts:1598`) correctly forces a `flee` for ANY actor — party or
> enemy — carrying the `feared` flag, side-agnostically. But the real web UI's turn dispatcher,
> `advanceTurn()` (`apps/web/src/ui/combat.ts:690-717`), decides whether to route a turn through
> `aiAction()` using **only** `actor.side === 'enemy'` (`combat.ts:700`) — it never also checks
> `actor.flags.has('feared')`. So a real PARTY member who is feared by a real, production DoK monster's
> Fear spell does not get forced to flee at all: the player is simply handed the ordinary six-item
> menu (Move/Attack/Cast/Guard/Wait/Flee) for that turn, and every option except Attack/Cast is silently
> accepted by the engine (`legalActions()`/`apply()` place no `feared` gate on `move`/`guard`/`wait`),
> letting the "feared" character calmly Guard, Wait, or walk anywhere it likes — the exact opposite of
> what the engine's own type comment says a `feared` figure does "on their turn."

## Headline finding

### `advanceTurn()`'s AI-vs-player dispatch gate checks only `side === 'enemy'`, never `flags.has('feared')` — so a real, production Fear spell cast on a party member never triggers the engine's own (already-correct, already side-agnostic) forced-flee mechanism for that member's own turn

### The invariant, as the engine's own type doc-comment states it (broadly, unconditional on who controls the figure)

```ts
// packages/engine/src/combat/tactical.ts:99-102 (current source)
/**
 * `asleep`/`held` skip the turn (the figure is **helpless** — attacks against it auto-hit; CT.5a);
 * `feared` figures can't attack and flee toward the nearest edge on their turn. `fled` removes the
 * figure (escaped off-edge). `hasted`/`slowed` modify the initiative value (×2 / ÷2).
 */
```

`TacticalStatusFlag` and `TacticalCombatant` are engine-neutral types — a party member and a monster
are represented identically, and nothing in the comment scopes "flee toward the nearest edge on their
turn" to AI-controlled figures only. It reads as the engine's stated design for *any* `feared` figure.

### Where the invariant IS honored — the engine's own `aiAction()`, called for the enemy side

```ts
// packages/engine/src/combat/tactical.ts:984-991 (beginTurn, current source)
    // A monster whose morale has broken — or ANY figure that is `feared` (CT.5a) — is forced to flee
    // this turn and cannot attack (party morale is otherwise the player's call). A monster that breaks
    // exactly as its turn opens routs/surrenders now (covers a figure wounded before any sweep ran).
    applyMoraleOutcome(actor);
    ...
    forcedFlee = actor.flags.has('feared');
```

```ts
// packages/engine/src/combat/tactical.ts:1594-1598 (aiAction, current source)
  function aiAction(): TacticalAction {
    const actor = current();
    if (!actor) return { type: 'endTurn' };
    // 0) Morale broke → rout toward the nearest edge (CT.6).
    if (forcedFlee) return { type: 'flee' };
```

Note `forcedFlee = actor.flags.has('feared')` is computed at `beginTurn()` (line 991) for **every**
actor whose turn begins, party or enemy — `beginTurn()` itself has no side check. `aiAction()`
consumes it identically for whichever actor happens to be `current()`. The apps-side UI drives every
**enemy** turn through this exact function:

```ts
// apps/web/src/ui/combat.ts:690-717 (advanceTurn, current source, full function)
/** Advance to the next actor: auto-resolve enemy turns through the engine AI, stop on a party turn. */
function advanceTurn(): void {
  if (!state) return;
  const c = state.combat;
  let guard = 0;
  // eslint-disable-next-line no-constant-condition
  while (guard++ < 2000) {
    if (c.isOver()) return finalize();
    const actor = c.current();
    if (!actor) return finalize();
    if (actor.side === 'enemy') {
      setActive(actor.id);
      recenterOn(actor.pos);
      logEvents(c.apply(c.aiAction()));
      continue; // keep driving this enemy (move→attack) and then the next one
    }
    // A party unit is up — hand control to the player.
    setActive(actor.id);
    recenterOn(actor.pos);
    state.phase = 'party-menu';
    state.menuSelected = 0; // Move
    state.banner = '';
    pushLog(`${nameOf(actor.id)}'s turn.`);
    draw();
    return;
  }
  finalize();
}
```

This is confirmed correct and already-tested for a `feared` **enemy**:
`tactical.test.ts:505-513` — `"a feared figure cannot attack and the AI makes it flee"` — asserts
`c.aiAction().type === 'flee'` for an enemy-side combatant, and every real fight routes every enemy
turn through exactly this `advanceTurn()` branch (`combat.ts:700-704`).

### Where the invariant is NOT honored — the party branch of the exact same function

The `if (actor.side === 'enemy')` check at `combat.ts:700` is the **entire** gate. There is no
`|| actor.flags.has('feared')` (or any other check of `feared`) anywhere in `advanceTurn()`. So when
`actor.side === 'party'` — regardless of whether that actor is `feared` — control falls straight
through to the `else`-equivalent tail (lines 706-714): `state.phase = 'party-menu'` and the function
returns, handing the player the ordinary menu.

The menu itself has no `feared` awareness either:

```ts
// apps/web/src/ui/combat.ts:95 (current source)
const MENU_ITEMS = ['Move', 'Attack', 'Cast', 'Guard', 'Wait', 'Flee'] as const;
```

```ts
// apps/web/src/ui/combat.ts:1159-1170 (activateMenu, current source, full function)
function activateMenu(item: (typeof MENU_ITEMS)[number]): void {
  switch (item) {
    case 'Move': enterMoveMode(); break;
    case 'Attack': enterTargetMode(); break;
    case 'Guard': partyGuardWait('guard'); break;
    case 'Wait': partyGuardWait('wait'); break;
    case 'Flee': partyFlee(); break;
    case 'Cast':
      partyCast();
      break;
  }
}
```

None of these five branches checks `actor.flags.has('feared')`. `Attack`/`Cast` end up producing no
targets anyway (the engine's own `meleeTargets()`/`missileTargets()`/`applyCast()` each independently
reject a feared actor — `tactical.ts:1204`, `:1230`, `:1292`, all `if (actor.flags.has('feared'))
return [];`), so those two are effectively (if silently) blocked. But **`Move`, `Guard`, and `Wait`
are not blocked anywhere**:

```ts
// packages/engine/src/combat/tactical.ts:1798-1830 (apply, current source, the relevant three cases)
      case 'move':
        if (action.to) applyMove(actor, action.to);
        break;
      ...
      case 'guard': {
        // CT.7d — readying a GUARD: the figure holds its action; the first foe to move into its melee
        // reach takes a free strike (see triggerGuardReactions). Models CoK's own Guard/Guarding stance.
        actor.flags.add('guarding');
        const ev: TacticalEvent = { round, type: 'guard', actor: actor.id, guarding: true };
        log.push(ev);
        acted = true;
        endTurn();
        return log.slice(startLen);
      }
      case 'wait':
        log.push({ round, type: 'wait', actor: actor.id });
        endTurn();
        return log.slice(startLen);
```

`applyMove()` itself (`tactical.ts:1362-1377`) has no `feared` check either — a feared figure can walk
to **any** reachable cell, not just toward a map edge. And even the engine's own public
`legalActions()` — the API whose own doc comment claims otherwise — still lists `guard`/`wait`/`endTurn`
unconditionally for a feared actor:

```ts
// packages/engine/src/combat/tactical.ts:1754-1782 (legalActions, current source)
  function legalActions(): TacticalAction[] {
    const actor = current();
    if (!actor) return [];
    const actions: TacticalAction[] = [];
    // A `feared` figure (CT.5a) cannot attack or cast this turn — only move/flee.
    if (!acted && !actor.flags.has('feared')) {
      for (const t of meleeTargets(actor)) actions.push({ type: 'melee', targetId: t.id });
      ...
    }
    if (moveLeft > 0) {
      const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
      for (const k of reach.keys()) {
        if (k === posKey(actor.pos)) continue;
        const [c, r] = k.split(',').map(Number) as [number, number];
        actions.push({ type: 'move', to: { col: c, row: r } });
      }
    }
    actions.push({ type: 'flee' }, { type: 'guard' }, { type: 'wait' }, { type: 'endTurn' });
    if (canDelay()) actions.push({ type: 'delay' });
    return actions;
  }
```

Line 1781 unconditionally pushes `flee`/`guard`/`wait`/`endTurn` regardless of `feared` — contradicting
its own comment on the line directly above the `if`, which says "only move/flee." So even the engine's
own public API for "what can this actor legally do right now" disagrees with its own stated design for
this one flag, on top of the UI never even routing a `feared` party turn through the mechanism
(`aiAction()`) that would otherwise get this right regardless.

### This is reachable in real, ordinary, shipped play — traced end to end, not a fixture

1. **A real DoK monster's real, decoded memorized-spell list contains Fear.** `docs/engine/research/
   m31-audit.md`'s independent byte-level probe of `Death Knights of Krynn/MON1WIZ.DAX` (its own table,
   line 86) found **monster id 20**'s real record decodes to raw spell ids `84×2,34×3,15×4` = **Fear×2**,
   Stinking Cloud×3, Magic Missile×4 — not a synthetic fixture, the game's own shipped data file.
2. **That raw id is crosswalked to a real, geometried, castable `TacticalSpell`:**
   `packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts:38`: `84: 'm4-fear'`, and
   `combatSpells.ts:62,78`: `'m4-fear': { range: 1, area: 'cone', radius: 3, save: 'negate' }` /
   `{ status: 'feared', rounds: 4 }`.
3. **This crosswalk is fully wired into the real dungeon-encounter path, not just proposed.**
   `apps/web/src/ui/gameData.ts:109`: `wizPath: 'Death Knights of Krynn/MON1WIZ.DAX'` (set for DoK);
   `apps/web/src/ui/explore.ts:1567,1604`: the file is fetched and decoded
   (`decodeMonsterWizArchive`) and joined onto monster records (`applyPreparedSpellIds`) during real
   dungeon load — the same production pipeline `applyItemPluses`/`applyCarriedItems` use. Every
   real DoK monster encounter that includes monster id 20 (or one of the 13 other real WIZ-bearing
   monsters `m31-audit.md` catalogued) carries this spellbook into combat.
4. **The real combatant builder wires it into `preparedSpells`.** `apps/web/src/ui/combat.ts:325-358`
   (`makeTC`, the function that builds every `TacticalCombatant` for a real encounter, not the demo
   strip): line 328, `preparedSpellsFromDokIds(c.preparedSpellIds, c.hd ?? MONSTER_NOMINAL_CASTER_LEVEL)`
   for every enemy.
5. **The AI will really pick it.** `chooseOffensiveCast()` (`tactical.ts:1688-1703`), called from
   `aiAction()` (`tactical.ts:1606`), scans `actor.preparedSpells` and casts the highest-priority
   offensive spell with a valid target — Fear qualifies (`s.target === 'enemy' && s.inflict`, no
   `.damage` needed).
6. **`target:'enemy'` resolves relative to the caster, so the party is the actual target.**
   `combatSpells.ts:112-115` sets `m4-fear`'s `target` to `'enemy'`; `spellAffected()`
   (`tactical.ts:1262-1282`, `wantSide = foeSideOf(actor)`) and `foeSideOf()` (`tactical.ts:695`:
   `c.side === 'party' ? 'enemy' : 'party'`) mean a monster (side `'enemy'`) casting a `target:'enemy'`
   spell hits the **party** — this exact mechanism (for a different spell/monster pair, `c2-hold-person`
   on TANAR) is independently proven end-to-end by M69's own scratch test
   (`m69-audit.md:190-197`, `aiAction()` really returning a cast at a party member and really setting
   `flags.has('held')`).
7. **A real party member can genuinely fail the save.** `inflictStatus(t, spell.inflict.status,
   spell.inflict.rounds)` (`tactical.ts:1349`) fires whenever `!saved && capOk` — `m4-fear` has no HD
   cap and a real, ordinary d20 saving throw (`tactical.ts:1318`), so any party member without an
   unusually high save can be feared by this cast in an entirely ordinary fight.
8. **The moment that member's own turn comes up, `advanceTurn()` (traced above) hands it a free
   menu instead of forcing a flee.** This is the exact gap: steps 1-7 are the real, ordinary production
   path that PRODUCES a `feared` party member; the `advanceTurn()` dispatch gap is what happens next.

### The consequence is a real, player-visible mechanical/behavioral gap, not cosmetic

A `feared` party member, per the engine's own stated design, should be forced to retreat toward the
map edge and unable to fight this turn. Instead, today, the player can simply select **Guard** (holding
position, even readying a counter-strike stance) or **Wait**, or **Move** the character anywhere at all
(including deeper into the fight, the opposite of fleeing) — the character behaves as if nothing were
wrong except that its Attack/Cast options happen to be greyed out. This silently discards the entire
"forced retreat" mechanic Fear is supposed to enforce on a real, player-facing turn, even though the
identical flag, on the identical function (`beginTurn()`), already correctly forces exactly this
behavior for the enemy side one code path away.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m80_verify.test.ts` (created, run — **3/3 passing** — then deleted;
`git status --porcelain` confirmed clean both before and after, this doc the only untracked file):

1. **The mechanism IS side-agnostic when actually invoked**: a `'party'`-side combatant `p` with
   `flags: new Set(['feared'])` is `current()`; `c.aiAction().type` is `'flee'` — proving `aiAction()`
   would force exactly the right behavior for this party actor, mirroring the existing enemy-side
   test (`tactical.test.ts:505-513`) verbatim, just with the sides swapped.
2. **But without `aiAction()` in the loop (today's real party-turn path), nothing stops the alternative**:
   for the identical `feared` party actor, `c.legalActions()` still includes `{type:'guard'}` and
   `{type:'wait'}` (while correctly excluding `{type:'melee'}`); `c.apply({type:'guard'})` succeeds,
   producing a real `guard` event, setting `p.flags.has('guarding') === true`, while
   `p.flags.has('fled')` stays `false` and `p.pos` is unchanged — the actor neither fled nor moved
   toward any edge, contradicting the type comment's stated invariant.
3. **`apply({type:'wait'})` is equally accepted** for the same feared actor — a second, independent
   control-path confirmation of the same gap.

Full `packages/engine` suite: **134 files / 1356 tests** with the scratch file absent (confirmed
baseline, matching M79's own post-fix count exactly) and **135 files / 1359 tests** with the scratch
file present (134+1 file, 1356+3 tests) — both green, via `cd packages/engine && npx vitest run`.
Scratch file then deleted; `git status --porcelain` confirmed the working tree clean except this doc.

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -rn "advanceTurn|party-menu|activateMenu|legalActions" docs/engine/research/m*-audit.md`:

- **`advanceTurn`** — only hit is `m74-audit.md:144,149`, which quotes `advanceTurn()`'s loop
  (`logEvents(c.apply(c.aiAction()))`) purely to prove that call site correctly passes `apply()`'s
  return to `logEvents()` — an entirely different question (event/log **plumbing**, since fixed) from
  this round's question (whether the `side === 'enemy'` **dispatch condition itself** should also
  cover a `feared` party actor). M74 never examines the condition on `combat.ts:700`, only the body of
  the branch it already takes.
- **`party-menu`** — only hits are `m48-audit.md`/`m49-audit.md`, both about `enterTargetMode()`'s own
  phase-guard for the *targeting-banner* preview feature (an unrelated UI mode-entry bug, since fixed),
  never about whether a `feared` actor should ever reach `party-menu` at all.
- **`legalActions`** — `m69-audit.md:112-115,164,205,297` is the one substantive prior discussion, and
  it explicitly frames the current behavior as the accepted mechanism to make *visible* (**"Feared party
  members lose Attack/Cast this turn... they still become active (get a turn), but the command menu
  silently offers fewer options, with no on-screen explanation of why"** — M69's own words, treating
  "still gets a turn" as a given, not a defect) — M69's fix was adding a status icon
  (`impaired`) to `panelRows()`/`visibleCells()`, a pure *visibility* fix, not a *behavior* fix. It never
  asks whether the character should have been forced to flee instead of getting a menu at all — a
  different question about the same underlying flag and the same screen, per discipline #4's
  "narration/visibility gap vs. underlying state/behavior gap" distinction (the exact M74-vs-M79
  precedent cited in this loop's own brief, applied here one more level: M69 was about the panel
  *displaying* the fact; this round is about the turn *dispatcher* never acting on it).
  `m77-audit.md:132` and `m78-audit.md:137` each quote one unrelated line of `legalActions()` (the
  unconditional `flee` push, and the turn-undead reach check) in service of their own different findings
  — neither examines the `guard`/`wait`/`endTurn` push against the `feared` gate.

`grep -rn "forcedFlee" docs/engine/research/m*-audit.md`: only `m77-audit.md:121-132`, which traces
`forcedFlee`/`aiAction()` in full detail but for a **different** question — whether `applyFlee()`
(the resolver `aiAction()` dispatches to) triggers `triggerGuardReactions()` like its sibling
`applyMove()` does. M77 explicitly narrates the *enemy*-routs-past-a-party-guard direction
("any time a **party member** has readied a Guard... and an **enemy's** morale subsequently breaks");
it never considers the reverse direction (a **party member** itself becoming `feared` and never being
routed through `aiAction()` at all). Re-read `m77-audit.md` in full (already quoted at length above)
to confirm this — it is a genuinely different bug about a genuinely different pair of functions
(`applyMove`/`applyFlee`, not `advanceTurn`'s dispatch condition).

`grep -rn "84: 'm4-fear'\|m4-fear\|monster id 20\|MON1WIZ" docs/engine/research/m*-audit.md`: hits in
`m31-audit.md` (the original decode, Part 1(a)/(b)/(c), building the crosswalk + wiring plan) and
`m69-audit.md` (citing the same crosswalk table for its own *panel-visibility* finding, discussed
above). Neither traces the dispatch-gate question this round investigates.

## Wiring plan

**This is a UI-only change** — the fix lives entirely inside `apps/web/src/ui/combat.ts`'s
`advanceTurn()` function. It requires **zero engine changes**: the mechanism it needs
(`aiAction()` correctly returning `{ type: 'flee' }` for any `feared` actor) already exists, is already
tested (`tactical.test.ts:505-513`), and is already called by this very function for the enemy side —
this is a pure "route the identical existing call through one more condition" fix, lower-risk than any
recent round's engine-side changes.

**Recommended shape — extend the existing dispatch condition, reusing the exact same call the enemy
branch already makes:**

```ts
// sketch, not applied this round — apps/web/src/ui/combat.ts:700 area
    if (actor.side === 'enemy' || actor.flags.has('feared')) {
      setActive(actor.id);
      recenterOn(actor.pos);
      logEvents(c.apply(c.aiAction()));
      continue; // keep driving this enemy (move→attack) and then the next one
    }
```

This is safe for the party side because: (a) `aiAction()`'s very first check (`if (forcedFlee) return
{ type: 'flee' }`, `tactical.ts:1598`) fires before any side-specific logic runs, so a `feared` party
actor is routed straight to `{ type: 'flee' }` without ever reaching the AI's targeting/movement
heuristics meant for monsters; (b) `feared` can only be set on an actor by another actor's cast or a
morale sweep, both of which happen on a DIFFERENT actor's turn, and `beginTurn()` (which computes
`forcedFlee`) always runs fresh at the top of the newly-current actor's own turn — so there is no
race where the currently-acting party member becomes `feared` mid-turn and needs to be interrupted;
(c) once fled or once the flee attempt completes, `applyFlee()` calls `endTurn()` itself
(`tactical.ts:1436` per its own body), so the `continue` loop correctly advances to the next actor
exactly as it does for a routed enemy today.

**Also worth a one-line comment fix while in the area (very low risk, does not change behavior for the
production path once the UI fix above ships, but keeps the engine's own public API honest):**
`legalActions()`'s comment ("only move/flee") could be made to match its own code, or the code changed
to match the comment — **not proposed as part of this round's fix** (see "Rejected alternatives"): once
the UI fix ships, a `feared` party actor is auto-flee'd via `aiAction()` before `legalActions()` is ever
consulted for a manual menu, so this mismatch becomes unreachable from the real UI either way. Flagged
as an open question, not fixed.

**Test to add** (beyond this round's scratch, which should be deleted): `apps/web` has no vitest harness
of its own (the same standing constraint M67/M68/M69 note) — verification for a UI-side change here
would be the existing e2e harness (`tools/dosbot` or the Playwright/browser e2e suite, whichever the
lead session uses for `apps/web` changes), asserting that a scripted DoK encounter with monster id 20's
spellbook, after a Fear cast lands on a party member (fails its save), automatically flees that member
on its own next turn without the `party-menu` phase ever being entered for it — mirroring how the
existing engine test proves `aiAction()` alone behaves.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Fixing `legalActions()`'s own `guard`/`wait`/`endTurn` push to respect `feared` (engine-side fix instead of/in addition to the UI fix) | Considered as the "more root-cause" fix, but rejected as this round's headline: the concrete, reachable, player-visible defect is entirely inside the UI's `advanceTurn()` never invoking the existing, correct, already-tested `aiAction()` mechanism for this case — a zero-engine-risk fix. Changing `legalActions()`/`apply()` themselves would touch engine dispatch code for a benefit (defense-in-depth against some *other*, currently-nonexistent caller) that isn't needed to fix the real reachable bug, and would need the fuller pre/post regression run discipline #12 calls for on any `packages/engine/src/**` control-flow change. Left as an explicit open question instead. |
| Treating `triggerGuardReactions()`'s own `feared` exclusion (`tactical.ts:1392`) as part of this finding | Investigated directly — `triggerGuardReactions()` DOES correctly check `g.flags.has('feared')` before letting a Guarding figure react, so a party member that (today) selects Guard while feared will NOT actually land a reaction strike while still feared, even though `apply({type:'guard'})` itself accepted the action. This sub-detail is therefore already correct and NOT part of the bug — the bug is that Guard/Wait/Move are offered and accepted at all, not that Guard's own downstream reaction mechanic is broken. |
| Re-litigating M77's `applyFlee`/`applyMove` guard-reaction parity finding | Not re-examined — read `m77-audit.md` in full (discipline #4) and confirmed it is a different, already-closed question (whether `applyFlee()` itself chains `triggerGuardReactions()`), orthogonal to whether `advanceTurn()` ever calls `applyFlee()` (via `aiAction()`) for a feared PARTY actor in the first place. |
| Re-litigating M69's "feared should be visible on the panel" finding | Not re-examined — M69's fix (the `impaired` flag on `panelRows()`/`visibleCells()`) is a real, shipped, correct visibility fix for a *different* question (can the player SEE the state) than this round's question (does the game correctly ACT on the state for the party's own turn). Both stand independently; M69 does not need to be touched or revisited. |
| Checking `hasted`/`slowed`'s initiative-multiplier clause (this round's other assigned candidate from the brief) for a similar gap | Checked: `effectiveInitiative()` (`tactical.ts:700-705`) is the ONLY function that reads `c.initiative`/`hasted`/`slowed` for ordering purposes, and it is called from exactly one site, `beginRound()`'s sort (`tactical.ts:972`), which re-sorts fresh every round from live combatant flags — no stale-order or bypass gap found; this clause of the invariant is fully and consistently honored everywhere initiative is used. Not pursued further as a candidate. |
| Checking whether `fled` is excluded from every subsequent turn-order/targeting computation, not just some | Checked: `isActive()` (`tactical.ts:696`, `hp>0 && !fled && !surrendered`) is the single shared predicate behind `living()`, `sidesAlive()`, `occupied()`, `positionCursor()`'s turn-order walk, `applyHazardTo()`, `spellAffected()`'s target pool, `castAimPoint()`'s target lookup, and `triggerGuardReactions()`'s candidate pool — every one of the 13 call sites found via `grep -n "isActive("` routes through the same predicate; no sibling call site was found that reimplements an inconsistent, `fled`-blind version of "is this figure still in the fight." Not pursued further. |

## Open questions / unknowns

- **Should `legalActions()`'s `guard`/`wait`/`endTurn` push (and `apply()`'s corresponding cases) also
  be gated behind `!actor.flags.has('feared')`, as a defense-in-depth measure independent of the UI
  fix?** Not fixed this round (see "Rejected alternatives") — worth doing if a future UI or headless
  caller ever drives party turns without going through `advanceTurn()`'s proposed extended gate.
- **Should `endTurn` remain legal for a feared actor even under a stricter `legalActions()`?** Almost
  certainly yes — `applyFlee()` itself calls `endTurn()` internally, and a figure that cannot reach any
  cell closer to an edge (fully boxed in) still needs a way to complete its turn. Not resolved in
  detail; flagged for whoever eventually tightens `legalActions()`.
- **Does the player ever see any log line at all when their own character becomes feared and is then
  auto-flee'd (once this round's fix ships)?** `combat.ts:636` already logs `"X's morale breaks — it
  flees!"` only for the `e.morale && e.inflicted === 'feared'` case (a monster's own morale-break
  status event) — a `feared` inflicted by a spell's `cast` event has no equivalent narration line
  checked this round; `logEvents()`'s `'cast'` case would need to be re-read to confirm whether
  `ev.inflicted === 'feared'` on a `cast` event already produces any message. Not investigated further —
  a separate, smaller follow-up if the lead wants full narration parity.
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle): the
  `asleep`-wake-on-spell-damage gap RESOLVED (M79, do not re-flag) + the Turn-Undead `xpAwarded` gap
  RESOLVED (M78, do not re-flag) + the `applyFlee`/`applyMove` guard-reaction parity gap RESOLVED (M77,
  do not re-flag) + the `backstab`-on-miss gap RESOLVED (M76, do not re-flag) + the `addToParty()`/
  `addPlayer()` roster-gate gap RESOLVED (M75, do not re-flag) + the `apply()` return-value plumbing gap
  RESOLVED (M74, do not re-flag) + `logEvents()`'s miss-branch gap RESOLVED (M73, do not re-flag) + the
  `(Opportunity!)` combat-log tag CONFIRMED ALREADY SHIPPED (M72, do not re-flag) + `surrendered`'s
  distinct marker (M71, open team-preference question) + the guarding-bar 5th signal (M71) +
  `TacticalCombatant.int` (rules-fidelity gap, not pursued) + the feared/asleep colour tier (undecided,
  though this round's fix would make `feared` even more transient for the party side — a figure would
  flee the very turn it's inflicted rather than sit `impaired` for several rounds, slightly reducing but
  not eliminating the value of a distinct colour) + `panelRows()`/`visibleCells()`'s duplicated
  `impaired` check (DRY cleanup) + the Abilities-panel precedent (none found) + DoK's Saves column
  (declined M62) + BASE_ITEMS' thin catalogue + DoK's xp/hitPoints byte-fields + DoK's runItemPluses e2e
  follow-up + the Class-label collision (38+ rounds unpicked) + dialogue/town day-wiring +
  `saveStore.ts`'s `listSlots()`/`SaveSummary` + `DetectionMatch` fields + flat-AC-10 CoK pregens + the
  wilderness moon-bar + the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class
  reactivation + the Con Save/Save Roll merge + `conSaveBonus` on DoK monsters + `DexterityMods.reaction`
  + the `DokEffect`/.EFF crosswalk + CoK's missing `.STF`/`.SFX` crosswalk + DRYDEN's Solamnic Plate Mail
  gap + `create.ts`'s preview-echo gaps + the Status row's duration/HD-cap + `itemCategory()`'s INFLICT
  preview + `MonsterWizSpell.learning` + the `hasted` buff indicator + `addToParty()`'s rejection-reason
  UX gap + case-folding for the name check + the bigger `addPlayer()`-reuse option + the missed-backstab
  wording/SFX/color follow-ups + `createCharacter()`'s permanently-unreachable import-path warnings +
  the hazard-kill/`checkMoraleSweep()` `move`/`flee` asymmetry (M78, unreachable) +
  `applyHazardTo()`'s `asleep`-wake gap (M79, unreachable) + a "wakes up" log event for spell-caused
  wake (M79, deliberately deferred). Item-instance subsystem still 31-for-31 blocked. ECL-ally morale%
  remains RETIRED (M61).

## Implications for our engine

- **The same "broadly-worded invariant, honored inconsistently" shape (M79's scope (h)) recurs across
  DIFFERENT clauses of the SAME doc comment, and can hide behind a CONTROL-PATH split rather than a
  per-function split.** M79 found `asleep`'s wake-on-damage clause enforced by only one of three
  *damage-application functions*. This round found `feared`'s forced-flee clause enforced by only one
  of two *turn-driving control paths* (the built-in AI vs. the real player-facing UI) for the very same
  flag, on the very same `beginTurn()`-computed variable (`forcedFlee`). A single doc comment can hide
  more than one distinct gap, at more than one distinct scope, simultaneously — worth re-reading the
  SAME comment block again in a future round for its remaining un-audited clauses (this round did not
  find a fresh angle on `hasted`/`slowed`'s initiative clause or `fled`'s removal clause — both checked
  clean, see "Rejected alternatives" — so the doc comment's clauses are now fully exhausted: `asleep`
  M79, `feared` M80, `hasted`/`slowed`/`fled` clean).
- **A prior round's finding that a state IS VISIBLE (M69's `impaired` icon) is a different question from
  whether the game correctly ACTS on that state** — the exact M74-vs-M79 lesson, applied one more time
  to a THIRD pair of rounds. M69 made `feared` visible on screen; this round found the turn dispatcher
  underneath that same visible icon still lets the player freely act as if nothing were restricting
  movement, only attack/cast. "The player can see it" and "the engine enforces it" are independent
  facts that must each be checked separately, even for a flag a prior round already gave a full
  visibility treatment to.
- **The lowest-risk fix in this loop's history so far**: because the correct behavior (`aiAction()`
  forcing a flee) already exists, is already tested, and is already called from the exact function that
  needs to call it more often, this round's proposed fix touches zero engine code and reuses an
  existing call verbatim under a wider condition — a useful reminder that not every "sibling call site"
  gap needs a new mechanism; sometimes the mechanism is sitting right there and the gate just needs
  widening by one boolean.
