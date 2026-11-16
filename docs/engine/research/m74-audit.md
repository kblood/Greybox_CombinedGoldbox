# M74 audit — the next "computed but unwired" candidate

> Audit method per the brief: first re-read `tactical.ts:1144-1172`'s attack hit/miss branches and the
> `cast` resolver (`tactical.ts:1291-1356`) to look for a fresh "sibling if/else" gap in `logEvents()`
> the way M73 found one for `attack`. Found the `cast`/`hazard`/`turn`/`status`(morale) branches are all
> already exhaustive of their real construction sites (traced every real push site in
> `tactical.ts` and matched each against `combat.ts`'s corresponding case) — no new sibling-field gap
> there. Widening the net to the full `TacticalEventType` union (`tactical.ts:343-344`) against
> `logEvents()`'s `switch` (`combat.ts:602-671`) turned up something structurally deeper than a UI
> branch: **two of the union's members, `'regen'` and `'status'` (specifically its `expired` half), are
> real, engine-computed, mechanically-live events that can never reach `logEvents()` at all — not
> because the UI fails to read a field on the event object (M73/M69-71's pattern), but because the
> events themselves never survive the trip through `apply()`'s return value.** This is a new sub-shape:
> the drop happens one layer below the UI, in the engine's own action-dispatch plumbing.

## Headline finding

### `beginRound()`'s per-round tick events (`regen` heals, `status`-expiry) are pushed onto the engine's internal `log` array but are structurally never included in what `TacticalCombat.apply()` returns — so `apps/web/src/ui/combat.ts`'s `logEvents(c.apply(...))` call pattern, the ONLY channel the real UI ever drains, can never narrate them, even though `logEvents()` already has working `switch` cases that would show them correctly if they ever arrived

**The facts are real, engine-computed, and mechanically live.** Two per-round housekeeping ticks run at
the top of every round, inside `beginRound()` (`packages/engine/src/combat/tactical.ts:964-976`):

```ts
// tactical.ts:964-976 (current source)
function beginRound(): void {
  round++;
  delayedThisRound.clear();
  tickRegen();      // M23.S2 — regen_3_hp heals before this round's order is built
  tickStatuses();   // CT.5a — age temporary conditions before this round's order is built
  order = combatants
    .filter(isActive)
    .map((c) => ({ c, init: effectiveInitiative(c) }))
    .sort((a, b) => b.init - a.init || bySideThenId(a.c, b.c))
    .map((e) => e.c);
  oidx = 0;
}
```

`tickRegen()` (`tactical.ts:813-819`) heals a regenerating monster (troll/undead-style, M23.S2) and logs it:

```ts
// tactical.ts:813-819
function tickRegen(): void {
  for (const c of combatants) {
    if (!isActive(c) || !c.regenPerRound || c.hp >= c.maxHp) continue;
    c.hp = Math.min(c.maxHp, c.hp + c.regenPerRound);
    log.push({ round, type: 'regen', target: c.id, healed: c.regenPerRound, targetHpAfter: c.hp });
  }
}
```

`tickStatuses()` (`tactical.ts:822-839`) decrements every active status timer and, when one expires,
clears the flag and logs it:

```ts
// tactical.ts:822-839
function tickStatuses(): void {
  for (const c of combatants) {
    const m = statusTimers.get(c.id);
    if (!m) continue;
    for (const [status, left] of [...m]) {
      const next = left - 1;
      if (next <= 0) {
        m.delete(status);
        if (c.flags.has(status)) {
          c.flags.delete(status);
          log.push({ round, type: 'status', target: c.id, inflicted: status, expired: true });
        }
      } else {
        m.set(status, next);
      }
    }
  }
}
```

Both `log.push(...)` calls write to the SAME `log` array the whole engine instance shares
(`const log: TacticalEvent[] = []`, `tactical.ts:771`), which is exposed unfiltered as
`TacticalCombat.log` (`tactical.ts:624`, `1859`) — so the facts are genuinely computed and genuinely
retrievable, just not through the channel the real UI uses.

**`beginRound()` is called from exactly one place, `positionCursor()`, and every single caller of
`positionCursor()` discards its side effects — it is a `void` function, called for its mutation of
`round`/`order`/`oidx`, never for a return value:**

```ts
// tactical.ts:1019-1038 (positionCursor, current source)
function positionCursor(): void {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (over) return;
    if (oidx >= order.length) {
      const alive = sidesAlive();
      if (alive.party === 0 || alive.enemy === 0) return finalizeEnd();
      if (round >= roundCap) return finalizeEnd();
      beginRound();                                   // <- tickRegen/tickStatuses fire here
      if (order.length === 0) return finalizeEnd();
      beginTurn(order[0]!);
      continue;
    }
    ...
  }
}
```

Every call site (`current()` at `tactical.ts:1041`, `endTurn()` at `tactical.ts:1049`, the
guard-reaction turn-slide at `tactical.ts:1526`, `apply()`'s own fallthrough at `tactical.ts:1828`,
`applyFlee` at `tactical.ts:1838`, the constructor's initial kick at `tactical.ts:1854`, and
`isOver: () => { positionCursor(); return over; }` at `tactical.ts:1861`) calls it as a bare statement
and reads nothing back. **`apply()` itself (`tactical.ts:1779-1829`) builds its `events` return value
exclusively from the per-action resolver it dispatched to** (`applyMove`/`applyMelee`/`applyMissile`/
`applyCast`/`applyTurn`/`applyFlee`, or an inline push for `guard`/`wait`) — never from anything
`positionCursor()`/`beginRound()` pushed to `log` as a side effect of advancing the cursor at the tail
of the same call (`tactical.ts:1827-1828`: `if (acted && moveLeft <= 0) endTurn(); else
positionCursor();` — neither branch's return value is captured). The explicit `'endTurn'` action case is
even more direct proof of the same fact: `case 'endTurn': endTurn(); return [];` (`tactical.ts:1816-1818`)
— it **unconditionally returns an empty array**, no matter what round transition (and therefore what
regen/status-expiry ticking) `endTurn()`'s call to `positionCursor()` just performed.

**The real UI's only consumption pattern is `logEvents(c.apply(...))` — confirmed by grep, every call
site in `apps/web/src/ui/combat.ts`:**

```
combat.ts:699:  logEvents(c.apply(c.aiAction()));
combat.ts:799:  logEvents(events);              // events = c.apply({ type: 'move', ... }) at line 797
combat.ts:823:  logEvents(c.apply(action));
combat.ts:843:  logEvents(c.apply(c.aiAction()));
combat.ts:858:  logEvents(evs);                 // evs = c.apply(...) a few lines above
combat.ts:863:  logEvents(c.apply({ type }));
combat.ts:879:  logEvents(evs);
combat.ts:918:  logEvents(c.apply(action));
combat.ts:934:  logEvents(c.apply({ type: 'turn' }));
```

`endPartyTurn()` (`combat.ts:716-721`) is the exact call site that ends a party member's turn and can
cross a round boundary — and it **doesn't even pass `apply()`'s return to `logEvents` at all**:

```ts
// combat.ts:716-721 (current source)
function endPartyTurn(actorId: string): void {
  if (!state) return;
  const c = state.combat;
  if (!c.isOver() && c.current()?.id === actorId) c.apply({ type: 'endTurn' });
  advanceTurn();
}
```

`c.apply({ type: 'endTurn' })`'s return value is discarded outright (and, per the proof above, would
have been `[]` regardless). `advanceTurn()` (`combat.ts:687-713`) then loops `logEvents(c.apply(c.aiAction()))`
for each subsequent enemy turn — but by the time any of those calls run, `positionCursor()` has already
been invoked (inside `c.current()`, called both explicitly at `combat.ts:694` and internally by
`apply()` itself) and any `beginRound()` tick for the new round has already fired and been silently
discarded. **There is no code path anywhere in `apps/web/src/ui/combat.ts` that reads `TacticalCombat.log`
(the full array) directly** — confirmed by grep (`grep -n "\.log\b" apps/web/src/ui/combat.ts` returns
only the UI's own unrelated `state.log` text-line buffer, `combat.ts:529,565-566`, and the debug seams
`log()`/`logLen()`/`logTail()` at `combat.ts:1250,1260,1261`, none of which `logEvents()` or any real
gameplay code path calls).

**`logEvents()` already has working `switch` cases that would show these correctly if the events ever
arrived** — this is not a case of the UI needing new code, only of the events never reaching the code
that already exists:

```ts
// combat.ts:634-637 (current source — the 'status' case)
case 'status':
  if (e.morale && e.inflicted === 'feared') { pushLog(`${nameOf(e.target)}'s morale breaks — it flees!`); gameAudio.playAction('miss'); }
  else if (e.expired && e.inflicted) pushLog(`${nameOf(e.target)} ${statusEndVerb(e.inflicted)}.`);
  break;
```

The `e.expired && e.inflicted` branch (which calls `statusEndVerb()`, `combat.ts:587-596`, producing
lines like `"wakes up"`/`"breaks free"`/`"recovers nerve"`) is dead code in the real UI today — it is
only reachable if a `type:'status', expired:true` event is ever passed into `logEvents()`, and per the
trace above, none ever is.

**`'regen'` doesn't even have a `switch` case at all** — `logEvents()`'s cases are `move`, `attack`,
`cast`, `status`, `hazard`, `turn`, `slain`, `flee`, `guard`, `wait`, `delay`, `party-flee`, `default`
(`combat.ts:603,606,623,634,638,644,649,653,657,660,663,666,669`) — `'regen'` and `'end'` are the only
two members of the 14-member `TacticalEventType` union (`tactical.ts:343-344`) with no case at all, so
both fall through to `default: break` (`combat.ts:669-670`) even in the hypothetical world where they
did reach `logEvents()`.

**`'end'` is a genuine non-issue, for a different and instructive reason: it already has its own,
independent, correct read path that does NOT go through `apply()`'s return.** `finalize()`
(`combat.ts:723-784`) reads the outcome via `state.combat.result()` (`combat.ts:725`), and `result()`
(`tactical.ts:1842-1851`) reads `over`/`log.at(-1)?.outcome` directly off the engine's live internal
state, not off any per-call event array — so the outcome narration (`"Victory!"`/`"The party has
fallen..."`/etc., `combat.ts:747,777-779`) is unaffected by this gap. This is why the bug is real for
`'regen'`/`'status'`-expiry specifically and not a third, isomorphic case for `'end'` — flagged
explicitly so the wiring plan doesn't accidentally imply `'end'` needs the same fix.

## Why this matters mechanically, not just cosmetically

- **Regeneration is a real, named, currently-fought-against monster trait** (CoK's SKELETON/ZOMBIE, DoK's
  LICH — M43's audit independently verified these three by name from real `.DAX` bytes). A player
  fighting one today sees its HP creep back up round over round with **zero log explanation** — the
  Companion Panel's static bestiary sheet does say "Regen: 3/rd" (M43's fix, confirmed shipped — see
  "Why this wasn't already picked up" below), but the *live combat log*, the moment-to-moment narration
  of what actually happened this round, never mentions it actually ticking. A player who hasn't checked
  the bestiary has no idea why their damage isn't sticking.
- **Status-expiry narration (`statusEndVerb()`) is dead code for every real status the engine tracks** —
  Sleep/Hold Person/Fear/Slow/Haste all wear off via exactly this mechanism (`INFLICT` table,
  `combatSpells.ts:73-81`), and none of their "wakes up"/"breaks free"/"recovers nerve"/"shakes off the
  slow"/"returns to normal speed" lines can ever appear in a real game today. The player currently
  learns a hold/sleep/fear has ended only by noticing the figure can act again next turn — no textual
  confirmation, ever.
- This is a **plumbing** gap, not a **display** gap — the fix cannot be "read one more field in an
  `if`/`else`" the way M69-M73 all were; it requires `apply()` (or its callers) to actually surface what
  `beginRound()` pushed to `log`, a small but genuinely different shape of change for this loop.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m74_verify.test.ts` (created, run green — 3/3 passing; then deleted;
`git status --porcelain` confirmed clean afterward, this doc the only untracked file):

1. **Regen:** built a troll (`regenPerRound: 3`) and a lone party figure with no actions, drove the
   fight via `c.apply({ type: 'endTurn' })` twice (exactly `endPartyTurn()`'s own call shape,
   `combat.ts:719`) to cross a round boundary. Confirmed `troll.hp` genuinely rose (13 -> 16, matching
   `tactical.test.ts:504-516`'s existing golden) and that `c.log` contains **2** real `regen` events
   (`healed: 3` each) — but that **neither `apply()` call's own return value contains any `regen` event
   at all** (`ev1`/`ev2` both `[]`, matching the unconditional-empty-array proof from source reading).
2. **Status expiry:** reproduced `tactical.test.ts:469-487`'s own Hold Person fixture (2-round duration),
   but this time collected every event from **`apply()`'s own return values only** across the cast +
   two `endTurn` calls (`castEvents` + two more `apply({type:'endTurn'})` calls), instead of reading
   `c.log` the way the existing engine test does. Confirmed `e.flags.has('held')` genuinely becomes
   `false` (the expiry is real) and `c.log` genuinely contains the `type:'status', expired:true` event —
   but that event never once appeared among anything any `apply()` call actually returned.
3. **Sanity control (the working half):** confirmed a same-turn Sleep cast's **infliction** event (not an
   expiry) DOES appear directly in `apply({type:'cast',...})`'s own return value — proving the gap is
   specifically the round-boundary tick channel, not casting/status machinery in general.

Full `packages/engine` suite re-run clean at **135 files / 1354 tests** (1351 baseline + 3 scratch) via
`cd packages/engine && npx vitest run`, matching M73's own stated baseline exactly (no drift between
rounds). Scratch file then deleted; `git status --porcelain` confirmed empty except this doc.

## Why this wasn't already picked up (grep evidence against every prior round)

- **`regenPerRound`/`tickRegen`** — heavily mined by name (M23, M24, M25, M26, M28, M29, M31, **M43**, and
  passing mentions in ~20 more rounds per a `grep -li regen` sweep of every `m*-audit.md`). But
  **M43 is the only round that ever built anything for it, and M43's entire finding is about a
  DIFFERENT surface: the static Companion Panel bestiary sheet's "Regen: N/rd" row** (`referenceDb.ts`'s
  `monsterCategory()`, confirmed shipped — `grep -n "Regen" apps/web/src/ui/referenceDb.ts` finds the
  M43 fix live at `referenceDb.ts:147`). M43's own text is explicit that its target is "the Reference DB
  / Companion Panel Databases tab's monster **detail sheet**" (`m43-audit.md:16`) — a pre-hoc reference
  lookup, not the live per-round combat-log narration this round investigates. M43 never mentions
  `apply()`, `positionCursor()`, `beginRound()`, or `logEvents()`'s `'regen'`/`case` gap anywhere in its
  text (confirmed via `grep -n "apply(\|positionCursor\|beginRound\|logEvents" docs/engine/research/m43-audit.md`
  — zero hits). No overlap: M43 fixed the bestiary stat row; this round finds the live-fight log
  narration is separately, structurally broken.
- **`tickStatuses`/`beginRound`/`positionCursor`** — checked via
  `grep -niE "tickStatuses|beginRound|positionCursor" docs/engine/research/m*-audit.md`: three hits, all
  incidental. `m24-audit.md:85` mentions `tickRegen()`/`beginRound()` only as a size comparison for a
  different (half-damage) feature's wiring cost. `m29-audit.md:154` cites `tickStatuses()` only as
  precedent for how status-timer decay works, evaluating an unrelated candidate
  (`clear_movement`/`owlbear_hug_check`). `m68/m69`-audit.md's hits are about `inflictStatus()`, not the
  expiry/return-value plumbing. **None discuss `positionCursor()`'s callers discarding `beginRound()`'s
  events, or `apply()`'s return-value construction, at all.**
- **`statusEndVerb`/`(status) expired` narration — the single most directly relevant prior claim, and the
  one this round's finding partially overturns.** `m55-audit.md:366` explicitly asserts, evaluating
  `TacticalSpell.inflict` as a rejected candidate: *"it already has one [a UI surface] —
  `combat.ts:604-619` already narrates every `inflict`/status event via the message log
  (`statusVerb`/`statusEndVerb`). Confirmed wired, not a gap."* Per CLAUDE.md's discipline #3 ("verify a
  cited rationale against the ACTUAL current code, not just the comment text"), this round re-traced
  that exact claim and found it **only half true**: `statusVerb()` (the *infliction* narration, fired
  from the `cast` event's `e.inflicted` branch, `combat.ts:627`) genuinely is wired — infliction events
  are part of `applyCast()`'s own direct return value, so they reach `logEvents()` correctly (confirmed
  by this round's own sanity-control test). But `statusEndVerb()` (the *expiry* narration, the `status`
  event's `e.expired` branch, `combat.ts:636`) is NOT reachable, for the structural reason traced above.
  M55's check was a source-read ("does a switch case exist for this") rather than a live-fight trace of
  whether the triggering event can ever actually arrive at that case — exactly the gap this round's
  scratch test closes. **M55's "Confirmed wired" verdict for `inflict`/status narration was correctly
  half right (infliction) and silently wrong the other half (expiry) — not contradicted for infliction,
  corrected for expiry only.** M68 (which built the pre-hoc Reference-DB `Status` row for
  `TacticalSpell.inflict`) quotes and relies on this same M55 sentence (`m68-audit.md:94`,
  `"already narrated post-hoc in the combat log"`) without re-deriving it — its own fix (a `?refdb=1`
  preview row) is unaffected either way since it doesn't depend on live combat-log reachability, but the
  quoted rationale inherited M55's unverified half-claim forward one more round.
- **`TacticalEventType` union / `logEvents()`'s `switch`** — checked
  `grep -n "TacticalEventType" docs/engine/research/m*-audit.md`: no prior round enumerates the union's
  14 members against `logEvents()`'s cases directly; M73 is the closest prior work (re-reading one
  case's two branches), not a full-union sweep against the switch's case list. This round's full-union
  sweep (`'regen'` and `'end'` are the only two members with no case at all) has not been performed
  before under this name.

## Wiring plan

**This is an engine-side change, not a UI-only one** — unlike M73 (and every recent round back through
M67ish), the actual defect is in `packages/engine/src/combat/tactical.ts`'s action-dispatch plumbing, not
in `apps/web/src/ui/combat.ts`'s event-formatting switch (which is already correct and needs no new
`case` for `'status'`, only a new one for `'regen'`). Flagging this clearly per the round brief: research
rounds investigate and propose, the lead session implements.

**Recommended shape (smallest structural fix, additive):** capture what `positionCursor()` (and
therefore `beginRound()`) pushes to `log` during a call, and fold it into whatever `apply()` (and
`applyFlee`/any other action resolver that calls `endTurn()`/`positionCursor()`) returns, ordered
*before* the acting figure's own action events (since the round-boundary tick logically precedes the new
round's first action):

1. **`packages/engine/src/combat/tactical.ts`** — the least invasive approach: record `log.length` on
   entry to each public action method (`apply()`, and any other resolver that can cross a round boundary
   — tracing shows only `apply()`'s own `endTurn`-triggering tail and `applyFlee`'s use of
   `positionCursor()`, since `current()`'s calls inside those same methods share one round-boundary
   crossing per call), and after the call slice `log` from that recorded index to the end, folding any
   `'regen'`/`'status'` (or, generally, any event not already present in the resolver's own return array)
   into the final returned array. A structurally simpler alternative: make `apply()` **always** return
   `log.slice(<indexBeforeThisCall>)` instead of hand-assembling `events` from each case's own resolver
   — since every resolver already `log.push(...)`es everything it returns anyway (confirmed: every
   `events.push(...)` call site in `tactical.ts` is paired with a `log.push(...ev)`/`log.push(...events)`
   at the end of its function, e.g. `tactical.ts:1170,1354,1572`), this alternative could be a **single,
   very small, systemic fix** — record `log.length` at the top of `apply()`, and replace its own
   `return events;`-style endings with `return log.slice(startLen);` — rather than patching each
   resolver's return value individually. This second option is almost certainly the right shape but
   needs the lead session to check it doesn't accidentally change return contents for any case that
   currently intentionally returns fewer events than it logs (a spot-check while implementing, not found
   by this round's read but worth a defensive test sweep before shipping).
2. **`apps/web/src/ui/combat.ts`** — once `apply()` genuinely returns the tick events, add the missing
   `case 'regen':` to `logEvents()`'s `switch` (`combat.ts:602-671`), following the existing sibling
   shapes (e.g. matching `hazard`'s "chokes... for N" phrasing):
   ```ts
   case 'regen':
     pushLog(`${nameOf(e.target)} regenerates ${e.healed} HP.`);
     break;
   ```
   The existing `case 'status':`'s `e.expired && e.inflicted` branch (`combat.ts:636`) needs **no
   change at all** — it is already correct and will start firing for real the moment the events reach it.
3. **Tests to extend:** `packages/engine` needs a new `apply()`-return-value assertion mirroring
   `tactical.test.ts:504-516`/`:469-487`'s existing `c.log`-based assertions, but checking the returned
   array instead (the exact shape this round's scratch test used) — proving the fix closes the gap this
   round measured, not just that `c.log` still has the events (already proven). A new
   `apps/web/test/e2e.mjs` case would drive a real regenerating-monster fight (or a timed status) through
   several rounds and assert `window.__combat.log()`/the visible log text contains the new "regenerates"
   line or a `statusEndVerb()` phrase — mirroring the existing pattern of reading rendered log lines.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `cast` event's `if/else-if` chain (`healed`/`damage`/`inflicted`/generic) as a fresh M73-style sibling-branch gap | Traced `applyCast()` (`tactical.ts:1291-1356`) fully: a single event CAN in principle carry both `damage` and `inflicted` (the code doesn't prevent it), but cross-checked every real spell in `combatSpells.ts`'s `GEOMETRY`/`INFLICT` tables and confirmed **no current spell has both a damage effect and an inflict effect on the same id** (`isDamage`/`inflict` are populated from disjoint spell-id sets today) — so while structurally possible, this branch never actually collapses two real facts in practice today. A real but currently-unreachable gap, weaker than the regen/status finding (which fires in every real fight involving a named, shipped monster/spell), so not pursued as this round's headline. |
| `hazard`/`turn` event branches as sibling-gap candidates | Traced every real push site (`tactical.ts:859,865` for hazard; `tactical.ts:1563,1567,1570` for turn) against `combat.ts`'s corresponding cases (`combat.ts:638-643`,`644-648`) — each real construction site has a matching, correctly-differentiated UI branch. No gap found. |
| Fixing `'end'` the same way | Investigated and explicitly rejected: `'end'` already has an independent, correct read path via `c.result()`/`state.combat.result()` (`tactical.ts:1842-1851`, `combat.ts:725`) that does not depend on `apply()`'s return value at all — outcome narration works today. Including `'end'` in the same fix would be harmless but unnecessary; flagged so the wiring plan doesn't conflate the two. |
| A UI-only workaround (have `combat.ts` poll `c.log.length` each frame/draw and diff) | Considered as an alternative to an engine-side fix, since research rounds are constrained from modifying engine code and this shape could in principle be done UI-side only. Rejected as a worse design: it would require the UI to track its own "last seen log index" state in parallel with the engine's, duplicating bookkeeping the engine should own, and would still leave the "engine's public action API silently drops events" defect in place for any *other* future consumer (e.g. a future non-web host, or a test). The engine-side fix is smaller, fixes the defect at its source, and is explicitly permitted for this loop to *propose* (not build) per the M73 precedent for engine-side follow-ups. |
| Re-examining `MonsterCategory`/`Encumbrance`/`TurnOutcome`/`KnightOrder`/`RangeBracket` | Not re-opened — all already correctly checked and rejected/exhausted by M72/M73; re-litigating would violate the "don't re-pick an already-exhausted set" discipline. |
| Pursuing the `backstab`-on-miss follow-up M73 flagged | Considered as the brief's first-priority suggestion. Read `tactical.ts:1144-1145` again and confirmed M73's characterization is accurate (the miss push genuinely has no `backstab` key). Chose the regen/status-plumbing finding instead because it is a structurally different, previously-unexamined *class* of gap (dropped-in-transit vs. omitted-at-construction) affecting more real, named, shipped content (every regen monster + every timed status in the game, vs. one specific attack-flavor text on a rare backstab-then-miss roll) — a judgment call, not a rejection of the backstab candidate's validity. Still open, still available for a future round (see Open questions). |

## Open questions / unknowns

- **Should the engine-side fix be "capture `log.length` at the top of `apply()`/`applyFlee`, slice at the
  end" or "replace each resolver's own `events` accumulation with a single `log.slice(startLen)` at
  `apply()`'s outer boundary"?** This round's read suggests the latter is smaller and more systemic (every
  resolver already logs everything it returns), but the lead session should double check no resolver
  intentionally returns a strict subset of what it logs before adopting it wholesale — not verified
  exhaustively this round (a spot-check of ~6 resolvers found no counterexample, but not all ~10 were
  individually diffed line-by-line against their own `log.push` calls).
  **UNKNOWN**, flagged for implementation-time verification.
- **Exact wording for the new `case 'regen':` line.** `"${target} regenerates ${healed} HP."` above is
  original engine-status prose in the same register as the existing `hazard`/`slain` lines — **not**
  verified against any original CoK/DoK/DQK binary string (regeneration is a monster-only passive with no
  obvious player-facing original message to match; not searched in `hackdocs_extracted/` this round).
  Flagged, not fabricated as a claimed original string.
- **Whether `applyFlee` (and any other resolver reached through `endTurn()`) needs the same fix
  independently, or whether fixing `apply()`'s outer boundary alone covers every real call path.** This
  round traced `apply()`'s own tail (`tactical.ts:1827-1828`) and the explicit `'endTurn'`/`'flee'` cases
  in detail; `applyFlee`'s own body (`tactical.ts:1838` area) was confirmed to call `positionCursor()`
  too but its full internal event-assembly wasn't re-diffed line-by-line against `log` the way `apply()`'s
  was — **UNKNOWN** whether it needs its own independent slice-fix or is already covered if `apply()`'s
  fix is applied at the true outermost call boundary (likely, since `applyFlee` is itself invoked FROM
  `apply()`'s `case 'flee': return applyFlee(actor);`, `tactical.ts:1799` — so a fix at `apply()`'s true
  boundary should subsume it, but this wasn't independently proven this round).
- **The `backstab`-on-miss engine gap M73 flagged (`tactical.ts:1145`) remains open**, untouched by this
  round — a legitimate, smaller, independent follow-up, still available for whichever round picks it up
  next.
- All standing candidates from the M74 brief's backlog (surrendered marker, guarding-bar 5th signal,
  `TacticalCombatant.int`, feared/asleep colour tier, `panelRows()`/`visibleCells()` DRY cleanup, Abilities
  precedent, DoK Saves column, BASE_ITEMS thin catalogue, DoK xp/hitPoints byte-fields, DoK
  runItemPluses e2e, Class-label collision, dialogue/town day-wiring, saveStore listSlots, DetectionMatch
  fields, flat AC 10 pregens, wilderness moon-bar, DEMO_PARTY edge case, WILD_MENU decorative bar,
  dual-class reactivation, Con Save/Save Roll merge, conSaveBonus on DoK monsters, DexterityMods.reaction,
  DokEffect/.EFF crosswalk, CoK .STF/.SFX crosswalk, DRYDEN's Solamnic Plate Mail, create.ts preview
  echoes, Status row duration/HD-cap, itemCategory INFLICT preview, MonsterWizSpell.learning, hasted
  buff indicator) — **not re-investigated this round**, unchanged from prior rounds' standing status.

## Implications for our engine

- **A new sub-shape of "computed but dropped" exists below the UI-branch level: an engine's own public
  action-dispatch API can silently exclude side-effect events from its return value**, even when (a) the
  events are genuinely pushed to an internal log the caller *could* read if it knew to, and (b) the
  consuming UI already has fully correct, tested-looking code for exactly this event type. This is a
  distinct failure mode from M69-M73's "the UI has the object but doesn't read one of its fields" — here
  the UI never gets the object at all, despite doing everything right with the ones it does receive.
- **Engine-level tests can create false confidence about "real UI reachability" by checking the internal
  `log` array directly instead of the public method's return value.** `tactical.test.ts:486,515` (both
  pre-existing, unmodified) prove the facts are computed and real — and were almost certainly why no
  prior round doubted `regen`/`status`-expiry were "wired": the tests pass, the events objectively exist.
  But the *real* UI never reads `c.log` directly anywhere — only `apply()`'s return — so a passing
  engine test for "the event is on `c.log`" is necessary but not sufficient evidence that a real player
  will ever see it. Worth a standing suspicion for any future candidate whose only test evidence is a
  `c.log`/`.some(...)` assertion rather than a return-value or full-e2e assertion.
- **A prior round's "Confirmed wired" verdict (M55, re: `TacticalSpell.inflict`'s status narration) can be
  half right and half silently wrong, inherited forward uncritically by a later round (M68) that reused
  its wording without re-deriving it.** This reinforces CLAUDE.md's discipline #3 one level further: not
  only should a *doc comment in source* be checked against actual code, a *prior audit round's own
  verification claim* should be re-traced end-to-end (not just grepped for existence) before treating it
  as settled — especially when it covers two structurally different sibling code paths (infliction vs.
  expiry) under one summary sentence.
- **The full-union-vs-switch-cases sweep (do all N event-type union members have a `case`, and does each
  case's triggering event actually reach the switch) is a cheap, systematic check this loop hadn't run
  yet at this granularity** — worth remembering alongside M73's "re-read a function's two halves" and
  M72's "compare two parallel subsystems" as a fourth concrete technique: enumerate a discriminated
  union's full member list, confirm every member both (a) has a handler and (b) can structurally reach
  it, not just that a handler literally exists in the source text.
