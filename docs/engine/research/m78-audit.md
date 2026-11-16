# M78 audit — the next "computed but unwired" candidate

> Audit method per the brief: applied **priority 1** — hunted for another pair of "structurally
> parallel resolvers, one calls a shared post-action consequence check, its sibling doesn't"
> (M77's exact technique) inside `packages/engine/src/combat/tactical.ts`. Re-checked `applyMove()`
> vs `applyFlee()` first and confirmed M77's own fix (`triggerGuardReactions()` now called from both,
> `tactical.ts:1373` and `:1430`) is present and correct in current source — not re-flagging.
> Widened the search to every OTHER function in the file that can **kill** a combatant, since
> `checkMoraleSweep()`/`xpAwarded` are the two shared "a kill happened, do the bookkeeping" concerns
> a kill-producing resolver must honor. Found: `applyMoraleOutcome`/morale-sweep coverage is complete
> everywhere a kill can occur (see below), but **`xpAwarded` is not** — `applyTurn()`'s `'destroy'`
> branch is the one kill path in the whole file that skips it.

## Headline finding

### `applyTurn()`'s Turn Undead **`'destroy'`** outcome kills the undead (sets `hp = 0`, flags `'dead'`, emits a `slain` event) but never adds its `xp` to `xpAwarded` — every OTHER kill path in `tactical.ts` does, including the one other path that (like `destroy`) bypasses the shared death helper

**The shared invariant, honored everywhere else.** `tactical.ts` has exactly one shared "a blow
finished someone off" helper, `applyHpLoss()` (`tactical.ts:1186-1194`):

```ts
// tactical.ts:1186-1194 (current source)
  function applyHpLoss(target: TacticalCombatant, dmg: number): boolean {
    const hpBefore = target.hp;
    target.hp -= dmg;
    if (target.hp > 0) return false;
    const lethal = ruleset === 'gen2' ? false : dmg >= hpBefore + 10;
    target.flags.add(lethal ? 'dead' : 'unconscious');
    if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
    return lethal;
  }
```

Every ordinary kill — melee (`resolveHit`'s non-helpless branch, `tactical.ts:1166`), missile (same
function, `missile=true`), spell damage (`applyCast`, `tactical.ts:1335`), and hazard-zone damage
(`applyHazardTo`, `tactical.ts:858`) — routes through this one function, so `xpAwarded` is
incremented automatically. There is exactly **one** other kill path in the file that does **not**
call `applyHpLoss()`: the **coup de grace** instant-kill on a helpless target (CT.7j,
`resolveHit`'s `coupDeGrace` branch, bypassing `applyHpLoss` because a coup de grace is always lethal
regardless of the gen1 "`dmg ≥ hp+10`" overkill threshold `applyHpLoss` would otherwise apply). That
branch **manually replicates** the exact same bookkeeping line:

```ts
// tactical.ts:1146-1156 (current source, full branch)
    } else if (coupDeGrace) {
      // Slay outright, bypassing the hp+10 overkill check — a helpless foe gets no reprieve. The blow's
      // reported damage is the victim's remaining HP; it dies (the permadeath flag, carried to the roster
      // by CT.7h if it was a party member). A slept victim never wakes — it is finished.
      if (target.flags.has('asleep')) clearStatus(target, 'asleep');
      const dmg = Math.max(1, target.hp);
      target.hp = 0;
      target.flags.add('dead');
      if (target.side === 'enemy') xpAwarded += target.xp ?? 0;
      events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: 0, helpless: true, coupDeGrace: true, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
      events.push({ round, type: 'slain', actor: actor.id, target: target.id, dead: true, coupDeGrace: true });
    } else {
```

So the pattern established across the whole file is: **every kill-producing branch either calls
`applyHpLoss()`, or — when it must bypass that helper for its own reason — manually re-adds the
`xpAwarded += target.xp ?? 0` line.** `applyTurn()`'s `'destroy'` outcome (CT.5b, Turn Undead) is a
third kill-bypass branch, structurally identical in shape to the coup-de-grace one (both directly
set `hp = 0` / `flags.add('dead')` without going through `applyHpLoss`, both for the same reason — an
instant, unconditional kill that must not be gated by the gen1 `dmg ≥ hp+10` overkill check) — but it
is the **one** sibling that never got the XP line:

```ts
// tactical.ts:1547-1577 (current source, full function)
  function applyTurn(actor: TacticalCombatant): TacticalEvent[] {
    if (actor.turnLevel === undefined || actor.flags.has('feared')) { acted = true; endTurn(); return []; }
    const undead = turnableUndead(actor);
    acted = true;
    let hdBudget = rng.die(6) + rng.die(6); // 2d6 HD turned this attempt
    const roll = rng.die(20);               // one d20 for the attempt, applied to each "number-needed" undead
    const events: TacticalEvent[] = [];
    for (const u of undead) {
      const hd = Math.max(1, Math.floor(u.hd ?? 1));
      if (hdBudget < hd) break;             // not enough turning power left this attempt
      if (u.turnImmune) continue;           // Death Knights cannot be turned (no budget spent)
      const outcome = turnUndeadOutcome(actor.turnLevel, hd);
      const affected = outcome === 'destroy' || outcome === 'turn'
        || (typeof outcome === 'number' && roll >= outcome);
      if (!affected) continue;
      hdBudget -= hd;
      if (outcome === 'destroy') {
        u.hp = 0;
        u.flags.add('dead'); // destroyed undead are gone for good (no revive)
        events.push({ round, type: 'turn', actor: actor.id, target: u.id, destroyed: true });
        events.push({ round, type: 'slain', actor: actor.id, target: u.id, dead: true });
      } else {
        inflictStatus(u, 'feared', TURN_FLEE_ROUNDS); // turned undead flee (CT.5a status)
        events.push({ round, type: 'turn', actor: actor.id, target: u.id, turned: true });
      }
    }
    if (events.length === 0) events.push({ round, type: 'turn', actor: actor.id }); // attempt fizzled
    log.push(...events);
    endTurn();
    return events;
  }
```

`grep -n "xpAwarded" packages/engine/src/combat/tactical.ts` confirms there are only **two**
increment sites in the entire file — `tactical.ts:1154` (coup de grace) and `tactical.ts:1192`
(inside `applyHpLoss`) — `applyTurn()`'s body contains neither.

**Morale, by contrast, IS handled correctly for this same branch** — the dispatcher's `'turn'` case
explicitly re-sweeps morale right after `applyTurn()` returns:

```ts
// tactical.ts:1806-1809 (current source, apply()'s switch)
      case 'turn':
        applyTurn(actor);
        checkMoraleSweep();
        return log.slice(startLen);
```

So this round's initial hunt (does every kill-producing function correctly call the shared
"a kill happened" consequence checks?) found the morale side fully covered end-to-end, and the
**XP** side is the one gap — a narrower, but exactly analogous, sibling-consequence miss.

**Not a deliberate omission — a same-day sibling commit correctly replicated the very pattern this
one skipped, hours later, without ever being told to check the earlier branch.** `git show b14238e`
(`CT.5b: cleric turn undead in the tactical combat engine`, 2026-06-23 13:42:49 +0200) is the commit
that introduced `applyTurn()` and its `'destroy'` branch verbatim as it reads today — `git log
--oneline -L 1547,1577:packages/engine/src/combat/tactical.ts` shows this exact function body has
**never been touched since**, by any later commit. `git show 9845cd0` (`CT.7j: coup de grace — slays
the helpless in melee`, the **same day**, 2026-06-23 20:09:07 +0200 — about 6.5 hours later) is the
commit that added the coup-de-grace branch, and its own diff shows the
`if (target.side === 'enemy') xpAwarded += target.xp ?? 0;` line was written fresh as part of that
commit, correctly mirroring `applyHpLoss()`'s existing invariant for a NEW kill-bypass path. So the
"you must re-add the XP line when you bypass `applyHpLoss`" pattern was already established (by
`applyHpLoss` itself, from the very first `xpAwarded`-introducing commit, `9df23aa`) and was
correctly followed hours later for a brand-new sibling branch — while `applyTurn()`'s own
already-existing sibling bypass, written earlier that same day, was simply never revisited.

**Reachable in real, ordinary play.** Turn Undead is a standard cleric action offered whenever a
turner has an undead foe in reach (`legalActions()`, `tactical.ts:1767`;
`canTurnUndead()`/`turnLevelForMember()`, wired to the real party in `apps/web/src/ui/combat.ts` per
the CT.5b commit). Destroying (not just turning) an undead is the **normal, better outcome** of a
successful turn attempt against a weak-enough undead relative to the cleric's level
(`turnUndeadOutcome()`, `tactical.ts:741-749`) — CoK/DoK's undead rosters (Skeletons, Zombies,
Wights, Ghouls, etc., see `classifyUndead()`) are exactly the kind of low-HD foe a mid-level cleric
routinely destroys outright rather than merely routs. Every one of those destroys silently withholds
that monster's `xp` from `TacticalResult.xpAwarded`.

**`xpAwarded` is a real, consumed field, not a dead one.** `TacticalResult.xpAwarded`
(`tactical.ts:408`, populated at `tactical.ts:1862`) is read by `apps/web/src/ui/combat.ts`'s
`asCombatResult()`:

```ts
// apps/web/src/ui/combat.ts:1030-1034 (current source)
/** Build a legacy `CombatResult` for the `onEnd` callback (callers read `outcome`/`xpAwarded`). */
function asCombatResult(): CombatResult {
  const tr = state!.combat.result();
  return { outcome: tr.outcome, rounds: tr.rounds, log: [], survivors: tr.survivors, xpAwarded: tr.xpAwarded };
}
```

...which flows through `dismissOverlay()` (`apps/web/src/ui/combat.ts:1036-1044`) into the `onEnd`
callback every real caller of `launchCombat()` supplies, and is **printed directly to the player** as
a status-bar number in three places: `apps/web/src/ui/explore.ts:481`
(`` `⚔ Victory +${res.xpAwarded} XP (${ordinal(res.rounds)})` ``), `explore.ts:513`, and the
wilderness/DQK equivalents `apps/web/src/ui/wilderness.ts:215` and `apps/web/src/ui/dqkExplore.ts:915`.
So whenever a fight that included a Turn-Undead destroy ends, the number shown to the player in that
specific status line is short by that undead's `xp`.

**Honest scope note — this does NOT under-award the party's real roster XP.** The actual XP that
lands on characters' sheets is computed independently, inside the overlay's own `finalize()`
(`apps/web/src/ui/combat.ts:727-780`), from **every** enemy combatant in the encounter regardless of
how each one left the fight:

```ts
// apps/web/src/ui/combat.ts:737-750 (current source, abridged)
  if (res.outcome === 'party') {
    const foes = state.combatants.filter((c) => c.side === 'enemy');
    ...
    const enemies: DefeatedEnemy[] = foes.map((c) => ({ flatXp: c.xp ?? 0 }));
    ...
    const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
    state.xp = xpResult.total;
    pushLog(`Victory! The party gains ${xpResult.total} experience.`);
```

`foes` here is **every** enemy combatant object in the encounter (dead, turned-and-fled, or
surrendered — this is itself a pre-existing, separate design fact: the roster-XP award already treats
a won battle's flatXp total as flowing from every foe present, not gated on kill-vs-flee at all,
independent of this round's finding), computed entirely separately from the engine's own `xpAwarded`
accumulator. So `xpAwarded` is best understood as a narrower **"how many enemies were killed outright
during this battle" internal tally**, not the authoritative roster-XP total — but it IS the exact
number the dismiss-time status line reads and displays as `+N XP`, so the undercounted value is
genuinely visible to the player in that one specific place, even though the party's real XP gain
(shown moments earlier, inside the overlay, as `"Victory! The party gains {xpResult.total}
experience."`) is unaffected by this bug.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m78_verify.test.ts` (created, run — **2/2 passing** — then deleted;
`git status --porcelain` confirmed clean before and after, this doc the only untracked file):

1. **The bug, proven directly**: a level-7 cleric (`turnLevel: 7`) vs. a 1-HD skeleton with `xp: 10`
   — `turnUndeadOutcome(7, 1)` is `'destroy'` (matches the existing `tactical.test.ts:678-687` "a
   high-level cleric destroys a weak undead outright" fixture exactly). `c.apply({ type: 'turn' })`
   correctly kills the skeleton (`sk.hp === 0`, `sk.flags.has('dead') === true`), but
   `c.result().xpAwarded` is **`0`** — even though the skeleton carries `xp: 10` — confirming the
   drop.
2. **Control, same fixture shape, via `melee` instead of `turn`**: an otherwise-identical cleric/
   skeleton pair, killed via an ordinary overkill melee blow (which routes through `applyHpLoss()`)
   instead. `c.result().xpAwarded` is correctly **`10`** — proving the only difference between the
   two outcomes is which kill path produced the identical death.

Full `packages/engine` suite re-run clean at **135 files / 1357 tests** (134 files / 1355 tests
baseline after M77's own scratch cleanup + its 1 new permanent test — plus this round's 1 new scratch
file / 2 scratch tests), no regressions, via `cd packages/engine && npx vitest run`. Scratch file
then deleted; `git status`/`git status --porcelain` confirmed the working tree clean except for this
doc.

(This finding is entirely inside `packages/engine`, so the scoped scratch test above fully covers it
— no separate UI-layer test was needed, since the downstream display of `xpAwarded` in
`explore.ts`/`dqkExplore.ts`/`wilderness.ts` already works correctly for whatever number `apply()`/
`result()` produce; the gap is upstream of the UI entirely, in which kills the engine ever tallies.)

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -rn "xpAwarded" docs/engine/research/m*-audit.md` (every prior file): the **only** hit anywhere
in the 77-file corpus is `m77-audit.md`'s own unrelated mention of `checkMoraleSweep()`'s internal
call inside `triggerGuardReactions()` (a different mechanic, a different bug). No prior round ever
examined `xpAwarded`'s parity across `tactical.ts`'s kill paths.

`grep -rniE "turn.?undead|TurnOutcome"` across the corpus: hits in `m64` (a `turnLevelForMember`
redundancy question, unrelated to XP), `m66` (an unrelated `deities.ts` sweep), and — most
importantly — **`m72-audit.md:272`**:

> `TurnOutcome` ('destroy'/'turn'/'none'/`number`) | Traced `applyTurn()`'s full branch coverage
> (`tactical.ts:1544-1574`): `destroy`→`{destroyed:true}` event, `turn`/a made numeric roll→
> `{turned:true}` event, a failed/`'none'` roll→a targetless `{type:'turn'}` "fizzle" event.
> `combat.ts:641-644` already has all three branches covered... Fully wired; not a gap.

**M72 genuinely read this exact function, branch by branch — but for a different consumer.** Its
question was narrowly "does every `TurnOutcome` branch have a matching **combat-log narration**
case" (event-display completeness), and the answer to *that* question is correctly "yes." M72 never
asked the orthogonal question this round asks — "does every kill-producing branch maintain the
shared `xpAwarded` bookkeeping invariant" — a completely different consumer of the same branches.
`m73-audit.md:196` and `m74-audit.md:342` both explicitly declined to re-open `TurnOutcome` at all,
citing M72's closure — correctly, for the question M72 actually answered. This is the exact same
shape M77 itself flagged as a productive pattern (its own headline notes: "investigating one prior
round's own flagged-but-unresolved question... is a productive way to find a *different*, fresh
bug" — and, symmetrically, a prior round's *confident, correct* closure of one narrow question about
a function doesn't cover an entirely different question about the same function's OTHER
side effects). This round is not a re-litigation of M72/M73/M74's question; it is a fresh question
about a different real consumer (`xpAwarded`) of the same already-examined branches.

**Independently re-verified via `git show`/`git log -L`** (discipline #4): `git show b14238e` (the
CT.5b commit) proves the `'destroy'` branch has read exactly as shown above since 2026-06-23,
13:42:49 +0200; `git log -L 1547,1577:packages/engine/src/combat/tactical.ts` proves nothing has
touched it since. `git show 9845cd0` (the CT.7j commit, 20:09:07 +0200 the same day) proves the
sibling coup-de-grace bypass branch correctly added the `xpAwarded` line as part of its own new code,
~6.5 hours later — establishing that the pattern was known and followed for a *newer* sibling while
the *earlier* one was never revisited.

## Wiring plan

**This is an engine-side change** — the fix lives entirely inside
`packages/engine/src/combat/tactical.ts`'s `applyTurn()` function, not in any `apps/web` file.
Flagging per discipline #9: the lead session should re-run the full `packages/engine` test suite
(not just `tsc`) before and after applying this.

**Recommended shape — smallest, additive, mirrors the coup-de-grace precedent exactly (NOT a
refactor to call `applyHpLoss()`):**

```ts
// sketch, not applied this round — tactical.ts:1563-1567 area
      if (outcome === 'destroy') {
        u.hp = 0;
        u.flags.add('dead'); // destroyed undead are gone for good (no revive)
        if (u.side === 'enemy') xpAwarded += u.xp ?? 0; // matches applyHpLoss()/coupDeGrace's award
        events.push({ round, type: 'turn', actor: actor.id, target: u.id, destroyed: true });
        events.push({ round, type: 'slain', actor: actor.id, target: u.id, dead: true });
      } else {
```

**Explicitly do NOT replace this with a call to `applyHpLoss(u, u.hp)`** — that would be a *behavior*
regression, not a fix: `applyHpLoss()`'s own lethality gate is `dmg >= hpBefore + 10` (the gen1
overkill rule); calling it with `dmg = u.hp` (`hpBefore`) can never satisfy `hpBefore >= hpBefore +
10`, so it would always classify the kill as `'unconscious'` (revivable) rather than `'dead'`
(permanent) — silently breaking the "destroyed undead are gone for good (no revive)" invariant the
existing comment states and `conditionOf()` depends on. This is exactly why the coup-de-grace branch
also manually sets `hp`/`flags`/`xpAwarded` instead of calling `applyHpLoss()` — both are true
unconditional instant-kills that must bypass the overkill gate entirely, not merely feed it a specific
damage number. The one-line addition above is the correct, minimal, non-regressing fix.

**Test to add (beyond this round's scratch, which should be deleted per the loop's own discipline and
replaced with a permanent version):** extend the existing `describe('turn undead (CT.5b)')` block's
`'a high-level cleric destroys a weak undead outright'` case (`tactical.test.ts:678-687`) with one
more assertion — `expect(c.result().xpAwarded).toBe(sk's xp)` — right alongside its existing
`sk.hp`/`sk.flags.has('dead')`/event assertions, since the fixture already exists and already carries
the default `xp: 10` from the `fighter()` helper; no new scenario needs to be built.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Re-litigating the `applyMove`/`applyFlee` guard-reaction gap (M77) | Re-checked first per priority 1's instruction to look at this exact pair fresh — confirmed M77's fix (`triggerGuardReactions()` now called from both `tactical.ts:1373` and `:1430`) is present and correct in current source. Not re-flagged; this round's search moved on to other kill-producing functions instead. |
| A hazard-caused kill during `move`/`flee` skipping `checkMoraleSweep()` | Investigated in real depth first: `apply()`'s common post-switch code (`tactical.ts:1836-1838`) only calls `checkMoraleSweep()` for `action.type === 'melee'\|'missile'\|'cast'` — `'move'` falls through without it, and `'flee'` returns early and never reaches it at all. A hazard death during either action would, in isolation, miss an immediate sweep (only picked up later via another action's sweep or the dying side's own members' next `beginTurn()`). **Rejected as this round's headline** on reachability grounds: `buildEncounterTerrain()` (`packages/engine/src/combat/encounterMap.ts:126-131`), the ONLY production terrain builder, never sets `TerrainGrid.hazard` at all (only `blocked`/`blocksSight`); the sole production caller that *does* supply a hazard is the standalone `?combat=1` demo strip (`apps/web/src/ui/combat.ts:443-455`), and it only lays a non-lethal `'held'`-status web, never a damaging `'cloud'` — so a hazard-inflicted **kill** currently cannot occur via any reachable, shipped path, only in engine unit tests. The Turn Undead XP gap above is reachable in ordinary play today; this one is presently a real internal asymmetry with no live trigger, so it was set aside as a standing candidate instead of the headline (see below). |
| `attemptPartyFlee()` missing a consequence check | Not re-examined this round — already traced fully by M77 (`tactical.ts:1478-1490`: no per-cell relocation at all, so there is no "reaches a guard's reach" moment to gate; independently confirmed accurate there). |
| `applyDelay()`/`applyTurn()`'s "turned" (non-destroy) branch missing a consequence check | `applyDelay()` never relocates on the grid (it only reorders `order[]`), so `applyHazardTo`/`triggerGuardReactions` don't apply. `applyTurn()`'s `'turn'` (flee, not destroy) branch doesn't kill anyone — it inflicts `feared` via `inflictStatus()`, so there is no XP or morale-sweep obligation for that branch specifically (morale IS still swept once, generically, right after the whole `applyTurn()` call via `tactical.ts:1808`, covering both branches together). No gap found in either. |
| Extending the fix to also correct the pre-existing `foes`-vs-`xpAwarded` conceptual mismatch in `apps/web/src/ui/combat.ts`'s `finalize()`/`dismissOverlay()` (making the status-line number source from the real `xpResult.total` instead of the engine's narrower `xpAwarded`) | Explicitly **not** recommended as part of the minimal fix — that mismatch is a broader, pre-existing design fact (the roster-XP total already includes fled/surrendered foes' `xp`, plus gold/item bonuses `xpAwarded` never tracks at all) that exists independently of this round's specific bug and would need its own scoped investigation; conflating the two would risk overclaiming what this round's fix actually changes. Flagged as an open question instead. |

## Open questions / unknowns

- **Should `explore.ts`/`dqkExplore.ts`/`wilderness.ts`'s dismiss-time status line read the real
  roster-XP total (`xpResult.total`, computed in `finalize()`) instead of the engine's narrower
  `xpAwarded`?** Not investigated further this round — this is a separate, broader, pre-existing
  design tension (see "Honest scope note" above) that exists for reasons beyond this round's specific
  bug (fled/surrendered foes, gold/item bonuses). Flagged for a future round or the lead session's
  judgment; NOT part of this round's minimal recommended fix.
- **Should the `foes`-includes-fled/surrendered-monsters behavior in `finalize()`
  (`apps/web/src/ui/combat.ts:738`) be considered correct/faithful, or its own separate gap?** Noticed
  as a byproduct of tracing `xpAwarded`'s real consumer chain, not investigated on its own merits this
  round — it may well be intentional/faithful (a won battle's XP award not gated on individual-foe
  fate is plausible for the original games), but this was not verified either way. Flagged as a
  standing candidate, not concluded.
- **The hazard-kill/`checkMoraleSweep()` asymmetry in `move`/`flee`** (see "Rejected alternatives"
  above) remains a real, provable internal inconsistency in `apply()`'s dispatcher — just not
  currently reachable via any shipped production path (no real encounter today ever constructs a
  damaging `TerrainHazard`). Worth revisiting if/when a real spell (Stinking Cloud, Cloudkill, Ice
  Storm) is ever wired to leave a persistent damaging zone on the grid — at that point this would
  become live and should be fixed the same way M77 fixed `applyFlee`.
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle): the
  `applyFlee`/`applyMove` guard-reaction parity gap RESOLVED (M77, do not re-flag) + the `backstab`-
  on-miss gap RESOLVED (M76, do not re-flag) + the `addToParty()`/`addPlayer()` roster-gate gap
  RESOLVED (M75, do not re-flag) + the `apply()` return-value plumbing gap RESOLVED (M74, do not
  re-flag) + `logEvents()`'s miss-branch gap RESOLVED (M73, do not re-flag) + the `(Opportunity!)`
  combat-log tag CONFIRMED ALREADY SHIPPED (M72, do not re-flag) + `surrendered`'s distinct marker
  (M71, open team-preference question) + the guarding-bar 5th signal (M71) + `TacticalCombatant.int`
  (rules-fidelity gap, not pursued) + the feared/asleep colour tier (undecided) +
  `panelRows()`/`visibleCells()`'s duplicated `impaired` check (DRY cleanup) + the Abilities-panel
  precedent (none found) + DoK's Saves column (declined M62) + BASE_ITEMS' thin catalogue + DoK's
  xp/hitPoints byte-fields + DoK's runItemPluses e2e follow-up + the Class-label collision (38+
  rounds unpicked) + dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/`SaveSummary` +
  `DetectionMatch` fields + flat-AC-10 CoK pregens + the wilderness moon-bar + the `DEMO_PARTY` edge
  case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con Save/Save Roll merge +
  `conSaveBonus` on DoK monsters + `DexterityMods.reaction` + the `DokEffect`/.EFF crosswalk + CoK's
  missing `.STF`/`.SFX` crosswalk + DRYDEN's Solamnic Plate Mail gap + `create.ts`'s preview-echo gaps
  + the Status row's duration/HD-cap + `itemCategory()`'s INFLICT preview + `MonsterWizSpell.learning`
  + the `hasted` buff indicator + `addToParty()`'s rejection-reason UX gap + case-folding for the name
  check + the bigger `addPlayer()`-reuse option + the missed-backstab wording/SFX/color follow-ups +
  `createCharacter()`'s permanently-unreachable import-path warnings. Item-instance subsystem still
  31-for-31 blocked. ECL-ally morale% remains RETIRED (M61).

## Implications for our engine

- **"One kill-bypass branch correctly replicates a shared invariant, an earlier sibling
  kill-bypass branch doesn't" is the same failure shape as M77's guard-reaction gap, one level more
  specific**: not two functions that both call a shared helper (where one simply forgets the call),
  but two functions that both **intentionally bypass** the same shared helper for the same underlying
  reason (an unconditional instant-kill that must skip the helper's own internal gating logic) — and
  only one of the two remembered to manually re-add every side effect the helper would otherwise have
  provided. Any future third "instant kill, bypass `applyHpLoss`" branch (a hypothetical death spell,
  an execute-style ability) should be checked against the **full** list of what `applyHpLoss()` does
  (set the flag, AND award XP) rather than just the flag-setting half that's visually obvious from the
  kill itself.
- **A prior round's confident, correct closure of one narrow question about a function does not
  cover every other consumer of that same function's branches.** M72 correctly answered "does every
  `TurnOutcome` branch have a matching combat-log case" — and NOT "does every `TurnOutcome` branch
  maintain the `xpAwarded` invariant," a question it never asked. `m73`/`m74`'s deference to M72's
  closure was correct for the question M72 actually answered; it should not be read as blanket
  cover for a completely different consumer of the same code. Worth remembering when a future round
  sees a function name in the "already exhausted" list — check *which specific question* was
  exhausted before assuming the whole function is closed territory.
- **A same-day, hours-later sibling commit correctly following an established pattern is strong
  evidence an earlier omission was an oversight, not a deliberate design choice** — `9845cd0`
  re-deriving `applyHpLoss()`'s XP-award line from scratch for its own new bypass branch, the same
  day as `b14238e`'s untouched one, shows the convention was live and known; it just never got
  back-applied to the branch that predated it by a few hours.
