# M77 audit — the next "computed but unwired" candidate

> Audit method per the brief: pursued **priority 1** first — re-reading `applyFlee()`
> (`packages/engine/src/combat/tactical.ts:1403-1432`) in full to confirm/deny whether it has its
> own version of M74's "internal return richer than what the caller surfaces" bug, a question M74
> explicitly left **UNKNOWN** (`m74-audit.md:360-368`: *"`applyFlee`'s own body... wasn't re-diffed
> line-by-line against `log` the way `apply()`'s was — UNKNOWN whether it needs its own independent
> slice-fix or is already covered"*).
>
> **Verdict on that specific question: no bug there — fully covered.** Traced `applyFlee()`'s own
> local `events` accumulator line-by-line: every entry ever pushed into it (the `flee` event at
> `tactical.ts:1419-1421`, and whatever `applyHazardTo(actor)` returns at `tactical.ts:1427`) is
> **also** `log.push()`ed at the same call site (the `flee` event directly; the hazard events inside
> `applyHazardTo()` itself, `tactical.ts:867`) — so `applyFlee()`'s own return value is always an
> exact subset of what lands on the shared `log` array during that call. Since `apply()`'s `case
> 'flee'` (`tactical.ts:1807-1809`) already discards `applyFlee()`'s direct return and instead
> returns `log.slice(startLen)` (M74's fix, `140832b`), and `applyFlee` is invoked from nowhere else
> in the whole engine (confirmed: `grep -n "applyFlee" packages/engine/src` returns exactly one
> call site, `tactical.ts:1808`), M74's fix already fully subsumes `applyFlee` — closing that open
> question for good. Proof: `packages/engine/test/_scratch_m77_verify.test.ts`'s first case (run
> green, see "Verification evidence" below).
>
> That closed the specific question priority 1 posed without turning up a live gap — but reading
> `applyFlee()` and its sibling `applyMove()` side by side for that exercise surfaced a **different,
> fresh, structurally clean gap** in the same neighborhood: `applyMove()` (the engine's *other*
> combatant-relocation resolver) calls **two** post-move consequence checks after every relocation —
> `applyHazardTo()` **and** `triggerGuardReactions()` (`tactical.ts:1373`) — while `applyFlee()`
> (which relocates the exact same way, onto the exact same grid, using the exact same
> `reachableCells()` machinery) calls only the first of the two. `git show 97597737` (the original
> CT.7d commit that introduced `triggerGuardReactions()`) confirms this was never a deliberate,
> considered omission for `applyFlee` — the commit only touched `applyMove`'s return line; `applyFlee`
> is untouched by that diff and every commit since. This is this round's headline: a real, tested,
> already-shipped combat mechanic (a readied Guard's free reaction strike) that fires for one
> relocation resolver and silently never fires for its structurally-parallel sibling.

## Headline finding

### `applyFlee()` never calls `triggerGuardReactions()` after relocating a fleeing combatant, even though its sibling relocation resolver `applyMove()` always does — so a monster (or party member) routing past a readied Guard escapes its free strike for free, purely because it fled instead of moved

**The mechanic is real, tested, and already fires correctly from the *other* movement path.**
`applyMove()` (`tactical.ts:1359-1374`) relocates the actor, then unconditionally chains both
post-move consequence checks:

```ts
// tactical.ts:1368-1373 (current source)
    const ev: TacticalEvent = { round, type: 'move', actor: actor.id, path: [{ ...to }] };
    log.push(ev);
    void from;
    // CT.7b — ending the move in a hazard cell (web/cloud) subjects the figure to it.
    // CT.7d — advancing into a Guarding foe's reach provokes its readied strike.
    return [ev, ...applyHazardTo(actor), ...triggerGuardReactions(actor)];
```

`triggerGuardReactions()` (`tactical.ts:1384-1400`) is a real, self-contained mechanic: any living
foe of the mover that is in the `guarding` stance, not disabled (`asleep`/`held`/`feared`), and now
within its weapon's reach of the mover's new position gets one free `resolveHit()` strike, tagged
`opportunity: true`, and even runs a morale sweep afterward if the strike killed someone
(`tactical.ts:1398`, `if (events.length) events.push(...checkMoraleSweep());`). It is byte-grounded
— CoK's own `GAME.OVR` has the `Guard ` command string @0xbf28 and the `Guarding` state string
@0x38f51 (`tactical.ts:1379-1380`) — and is exercised end to end by the existing `describe('guard
readied reactions (CT.7d)')` block (`tactical.test.ts:1097-1153`), all via the `'move'` action only.

**`applyFlee()` relocates the actor through the identical mechanism (`reachableCells()`, the same
grid) but only calls the hazard half of the pair:**

```ts
// tactical.ts:1403-1432 (current source, full function)
  function applyFlee(actor: TacticalCombatant): TacticalEvent[] {
    const reach = reachableCells(actor.pos, moveLeft, terrain, occupied(actor), diagCost, actor.size ?? 1);
    // Prefer the reachable cell nearest a border (distance to the closest edge), then farthest moved.
    const edgeDist = (p: GridPos): number => Math.min(p.col, p.row, terrain.width - 1 - p.col, terrain.height - 1 - p.row);
    let best: GridPos | null = null;
    let bestScore = Infinity;
    for (const k of reach.keys()) {
      const [c, r] = k.split(',').map(Number) as [number, number];
      const p = { col: c, row: r };
      const score = edgeDist(p);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    const events: TacticalEvent[] = [];
    if (best && !samePos(best, actor.pos)) {
      actor.facing = facingTo(actor.pos, best);
      actor.pos = best;
      const ev: TacticalEvent = { round, type: 'flee', actor: actor.id, path: [{ ...best }] };
      log.push(ev);
      events.push(ev);
    }
    if (edgeDist(actor.pos) === 0) {
      actor.flags.add('fled'); // reached the border → escapes the field
    } else {
      // CT.7b — a figure that flees into (and stops in) a hazard cell is still caught by it.
      events.push(...applyHazardTo(actor));
    }
    acted = true;
    endTurn();
    return events;
  }
```

`triggerGuardReactions(actor)` is never called anywhere in this function — not in the `if
(best...)` relocation block, not in the `else` (still-on-field) branch beside `applyHazardTo`, not
anywhere. `grep -n "triggerGuardReactions" packages/engine/src/combat/tactical.ts` confirms exactly
**one** call site in the entire file: `tactical.ts:1373`, inside `applyMove()` alone.

**This is not a deliberate design choice — the original commit simply never touched `applyFlee`.**
`git show 97597737` (`CT.7d: Guard readied reactions...`, the commit that introduced the whole
mechanic) shows the diff touches `applyMove()`'s return statement (adding
`...triggerGuardReactions(actor)`), adds the `triggerGuardReactions()` function itself, adds the
`guarding` flag/`isGuarding()` seam, and updates the `guard` action — **`applyFlee()` does not
appear anywhere in that diff.** No commit since (`9df23aa` → `78be0861` → `5e2253e3` → `46fd181c`,
`applyFlee`'s full edit history via `git log -p -L 1403,1432:packages/engine/src/combat/tactical.ts`)
touches this either. The omission has been there, unexamined, since the mechanic's very first
commit (2026-06-23), through every later refactor of both functions.

**Reachable in real, ordinary play, not a contrived edge case.** The single-figure `flee` action
(distinct from the whole-party `attemptPartyFlee()`/"Got Away" withdraw, `tactical.ts:1462-1487`,
which the player's UI "Flee" menu item actually invokes, `apps/web/src/ui/combat.ts:882`) is the
mechanism the built-in AI uses for **every morale-broken monster's rout**:

```ts
// tactical.ts:1591 (current source, inside aiAction())
    if (forcedFlee) return { type: 'flee' };
```

`forcedFlee` is set from the `feared` status flag at the top of every actor's turn
(`tactical.ts:991`, `forcedFlee = actor.flags.has('feared');`), and `feared` is exactly the flag a
monster gets when its morale breaks (`applyMoraleOutcome()`'s `'flee'` branch, `tactical.ts:917-921`)
— itself a real, byte-grounded CoK mechanic (`morale_check @0xD83D`, `tactical.ts:880-886`). Every
routed monster in every real fight takes this exact path: `combat.ts:703`/`combat.ts:847`
(`logEvents(c.apply(c.aiAction()))`) apply it and log `"X flees!"` (`combat.ts:657-660`). It is
also a generically **legal** action for any current actor, player-controlled or not
(`legalActions()`, `tactical.ts:1774`, unconditionally pushes `{ type: 'flee' }` for whoever's turn
it is). So: any time a party member has readied a Guard (a completely ordinary, single-hotkey
tactical choice, `apps/web/src/ui/combat.ts:1151`/`:1163`) and an enemy's morale subsequently breaks
and it tries to rout past that guard's position on its way to the map edge, the guard's readied
strike — which would have fired if the monster had simply *moved* there instead of fleeing there —
never fires. The monster gets a completely free pass specifically because the engine routed its
retreat through `applyFlee` instead of `applyMove`, even though both relocate the combatant onto
the identical grid using the identical `reachableCells()` machinery.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m77_verify.test.ts` (created, run green — **3/3 passing** — then
deleted; `git status --porcelain` confirmed clean before and after, this doc the only untracked
file):

1. **Priority 1's question, answered (no bug here):** a plain flee-to-edge scenario asserts the
   `'flee'` event is present in `apply()`'s *returned* array (not just `c.log`), and that the
   returned array's tail is byte-identical to the corresponding slice of `c.log` — proving
   `applyFlee`'s own internal accounting has no unreturned event that the M74 `log.slice(startLen)`
   wrapper fails to surface.
2. **The fresh gap, proven directly:** guardian `g` (party, reach 1) readies Guard; fleeing
   combatant `f` (enemy, `move: 1` ⇒ exactly one reachable orthogonal step) is positioned so its
   *only* strictly-improving (nearest-edge) reachable cell is the single cell adjacent to `g`. A
   third, otherwise-inert combatant `z` with the lowest initiative in the encounter is included
   solely so that ending `f`'s turn advances to `z` (still round 1) rather than immediately
   wrapping back around to `g`'s own next turn — which would otherwise clear `g`'s `guarding` flag
   via the *unrelated*, already-correct "a stale guard lapses at the guardian's own next turn" rule
   (`tactical.ts:981-983`) and falsely look like the reaction fired. With that confound removed:
   `c.apply({ type: 'flee' })` relocates `f` into `g`'s reach (`f.pos` asserted equal to the
   adjacent cell), yet **no `'attack'` event of any kind appears in the returned events**, and `g`
   is still `isGuarding('g') === true` afterward — its readied action was never spent.
3. **Control, same destination, via `'move'` instead of `'flee'`:** identical start positions,
   identical destination cell, `g` guarding — `c.apply({ type: 'move', to: {...} })` produces a
   genuine `'attack'` event with `opportunity: true`, `actor: 'g'`, `target: 'f'`, and `g` is
   correctly no longer guarding afterward (`isGuarding('g') === false`) — proving the *only*
   difference between the two outcomes is which action type produced the identical relocation.

Full `packages/engine` suite re-run clean at **135 files / 1357 tests** (1354 baseline — 1353 +
M76's own new permanent test — plus this round's 3 scratch tests), no regressions, via `cd
packages/engine && npx vitest run`. Scratch file then deleted; `git status`/`git status --porcelain`
confirmed the working tree clean except for this doc.

(Both the "no bug" finding and the fresh gap are entirely inside `packages/engine`, so both are
fully covered by the scoped scratch test above — no UI-layer verification was needed this round,
since the log-narration side (`case 'flee':`/`case 'attack':` in `apps/web/src/ui/combat.ts`)
already works correctly for whatever events `apply()` returns; the gap is upstream of the UI
entirely, in which events the engine ever produces to narrate.)

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -n "triggerGuardReactions" docs/engine/research/m*-audit.md` (run this round, every file):
hits only in `m71-audit.md` (the `guarding` **status-flag UI-visibility** finding — whether
`guarding` reaches a persistent HUD indicator, a completely different question about *displaying*
the stance, not about *whether the reaction itself fires*) and `m73-audit.md` (the `opportunity`
field's hit/miss log-differentiation, i.e. what happens *after* a reaction has already fired). No
prior round examined whether `triggerGuardReactions()` is called from every resolver that can
relocate a combatant.

`grep -niE "flee.*guard|guard.*flee"` across every `m*-audit.md`: zero hits anywhere in the entire
73-file corpus (M71 through M76 checked individually above by name; earlier rounds' index terms
were also swept and returned nothing).

`grep -n "applyFlee"` across the corpus: hits only in `m74-audit.md` (three mentions, all being the
exact "UNKNOWN, not diffed line-by-line" open question this round resolves) and this file's own
`m77` (new). M74 read `applyFlee`'s call to `positionCursor()`/`endTurn()` but never diffed its
`events`-accumulator against `applyMove`'s sibling call to `triggerGuardReactions()` — its own scope
was narrowly the M74-shaped log-drop bug, not a cross-function feature-parity sweep. This round's
finding is a genuinely different bug class from what M74 was looking for.

**Independently re-verified via `git show 97597737`** (discipline #4): the CT.7d commit that
created `triggerGuardReactions()` shows, in its own diff, that only `applyMove()`'s return statement
was edited to add the new call; `applyFlee()` does not appear in that diff at all. `git log -p -L
1403,1432:packages/engine/src/combat/tactical.ts` shows `applyFlee`'s three subsequent edits
(`78be0861`, `5e2253e3`, `46fd181c`) never introduce a `triggerGuardReactions` call either. The gap
has been open, unexamined, and unchanged for the mechanic's entire history (since 2026-06-23).

## Wiring plan

**This is an engine-side change, not a UI-only one** — the fix lives entirely inside
`packages/engine/src/combat/tactical.ts`'s action-resolution code (`applyFlee()`), not in
`apps/web/src/ui/combat.ts`. Flagging per discipline #8: the lead session should re-run the full
`packages/engine` test suite (not just `tsc`) before and after applying this, exactly as for M73's
backstab fix and M74's regen/status-plumbing fix.

**Recommended shape — smallest, additive, mirrors the existing `applyHazardTo` precedent exactly:**

```ts
// sketch, not applied this round — tactical.ts:1423-1428 area
    if (edgeDist(actor.pos) === 0) {
      actor.flags.add('fled'); // reached the border → escapes the field
    } else {
      // CT.7b — a figure that flees into (and stops in) a hazard cell is still caught by it.
      events.push(...applyHazardTo(actor));
      // CT.7d — fleeing past (or into) a Guarding foe's reach provokes its readied strike too,
      // exactly as an ordinary move does (applyMove, tactical.ts:1373).
      events.push(...triggerGuardReactions(actor));
    }
```

This is a **single added line**, in the exact same conditional scope as the already-shipped hazard
check it sits beside — a fleeing figure that hasn't (yet) escaped the field this turn now also
risks a guarding foe's reaction, identically to what would happen had it reached the same cell via
an ordinary move. No existing field, event shape, or return contract changes: `triggerGuardReactions()`
already returns `TacticalEvent[]` (spreadable exactly like `applyHazardTo()`'s return, which the
`else` branch already spreads into the same `events` array one line above), and its own internal
`checkMoraleSweep()` call (`tactical.ts:1398`) means a guard-inflicted kill during a flee is handled
with zero extra plumbing. The UI needs **no changes at all**: `apps/web/src/ui/combat.ts`'s
`'attack'` case already differentiates `opportunity` strikes (`combat.ts:609`, shipped since the
original CT.7d commit) — the moment `applyFlee` starts producing these events, they narrate
correctly with zero additional wiring.

**Tests to add (beyond this round's scratch, which should be deleted per the loop's own discipline
and replaced with a permanent version):** a version of this round's scratch test 2/3 pair, added to
the existing `describe('guard readied reactions (CT.7d)')` block in `tactical.test.ts` (right after
the existing `'a foe that moves into reach provokes the readied strike (opportunity)'` case,
`tactical.test.ts:1114-1125`) — proving a fleeing foe provokes the same reaction a moving foe does.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Extending the fix to fire even when the fleeing figure *reaches the edge* this turn (the `actor.flags.add('fled')` branch) | Deliberately **not** recommended as part of the minimal fix — the existing code already treats "reached the border" as a hard boundary where `applyHazardTo` is skipped entirely (the figure is considered to have left the field), so extending guard reactions to that exact instant would be a *new* design decision (does a guard get one last swing as a figure disappears over the horizon, or has it already left?), not a parity fix mirroring existing, already-decided behavior. Flagged as an open question below instead of silently deciding it. |
| A fresh typed accept/reject gate function (priority 2) | Not reached this round — priority 1's investigation immediately surfaced a strong, well-evidenced, previously-unexamined fresh gap (this finding) before priority 2 needed to be tried. `shop.ts`/`character.ts`'s gate functions were already fully re-checked as recently as M76 with no new gap found; re-litigating without a new angle was judged lower value than pursuing this lead. |
| A fresh discriminated-union sweep (priority 3) | Same reasoning — not needed once priority 1's read produced a strong candidate. |
| Checking whether `attemptPartyFlee()` (the whole-party withdraw) has the same gap | Traced fully (`tactical.ts:1462-1487`): it performs **no per-cell relocation at all** — it's a pure eligibility check (`partyCanEscape()`) plus a bulk `fled` flag-set on every living party member, with no grid movement whatsoever. There is no "reaches a cell adjacent to a guard" moment to gate in the first place; not a sibling of this bug, already correctly noted as mechanically `Distinct from the single-figure {@link applyFlee} action` in its own doc comment (`tactical.ts:1472`), independently confirmed accurate by reading the function body, not just trusting the comment (per discipline #3). |
| Also checking spell-driven relocation (e.g., a hypothetical future teleport/blink spell) as a third sibling | Grepped `applyCast()` (`tactical.ts:1291-1356`) in full: no current spell relocates a combatant (`GEOMETRY`/`INFLICT` tables have no movement-effect spells today); a purely hypothetical future gap, not a live one, so not pursued. |

## Open questions / unknowns

- **Should a guard's reaction also apply in the exact instant a fleeing figure reaches the border
  and escapes?** Deliberately left to the lead session's judgment (see "Rejected alternatives"
  above) — the minimal fix mirrors the already-decided `applyHazardTo` precedent (no reaction check
  once `edgeDist(actor.pos) === 0`), but a case could be made either way. **UNKNOWN / design call.**
- **Should `triggerGuardReactions()` also fire when `best` equals the actor's current position** (a
  fleeing figure that is completely boxed in and cannot move at all this turn, `if (best &&
  !samePos(best, actor.pos))` false)? The existing `applyHazardTo()` call already fires
  unconditionally in the `else` branch regardless of whether real movement occurred this turn (it's
  gated only on `edgeDist(actor.pos) !== 0`, not on movement having happened) — so the recommended
  fix above, which places `triggerGuardReactions` in the same `else` branch, would inherit the same
  behavior for consistency. Not separately verified with a dedicated test this round (the scratch
  test's scenario always involves genuine relocation); flagged for the lead session to consider
  when writing the permanent test.
- **Whether the AI ever chooses to `guard` in a position that would make this gap matter in
  practice for enemy-vs-enemy or player-vs-AI-guard interactions beyond the "party guards, monster
  routs past it" scenario already demonstrated** — not investigated further; the demonstrated
  scenario (any morale-broken monster routing near a guarding party member) is already a normal,
  frequent occurrence, so this is sufficient grounds for the fix regardless of rarer variants.
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle):
  M72's un-walled dungeon-edge/`TryStepForward` rules-fidelity question, the `surrendered` marker,
  the guarding-bar 5th signal, `TacticalCombatant.int`, the feared/asleep colour tier,
  `panelRows()`/`visibleCells()`'s duplicated `impaired` check, the Abilities-panel precedent, DoK's
  Saves column, BASE_ITEMS' thin catalogue, DoK's xp/hitPoints byte-fields, DoK's runItemPluses e2e,
  the Class-label collision, dialogue/town day-wiring, `saveStore.ts`'s `listSlots()`/`SaveSummary`,
  `DetectionMatch` fields, flat-AC-10 CoK pregens, the wilderness moon-bar, the `DEMO_PARTY` edge
  case, `WILD_MENU`'s decorative bar, dual-class reactivation, the Con Save/Save Roll merge,
  `conSaveBonus` on DoK monsters, `DexterityMods.reaction`, the `DokEffect`/.EFF crosswalk, CoK's
  missing `.STF`/`.SFX` crosswalk, DRYDEN's Solamnic Plate Mail gap, `create.ts`'s preview-echo
  gaps, the Status row's duration/HD-cap, `itemCategory()`'s INFLICT preview, `MonsterWizSpell.learning`,
  the `hasted` buff indicator, the missed-backstab wording/SFX/color follow-ups (M76), and
  `createCharacter()`'s permanently-unreachable `warnings` array for the two non-interactive import
  paths (M76). Item-instance subsystem still 31-for-31 blocked. ECL-ally morale% remains RETIRED
  (M61). `addToParty()`'s name-uniqueness gate is RESOLVED (M75), the `apply()` return-value
  plumbing gap is RESOLVED (M74), and the `backstab`-on-miss gap is RESOLVED (M76) — none re-flagged.
  `applyFlee`'s own independent test-coverage question (M74) is now RESOLVED by this round (no
  M74-shaped bug there) — but its *sibling* gap (this round's headline) remains open until the lead
  session applies the fix above.

## Implications for our engine

- **"Structurally parallel resolvers, one wired for a consequence check, one not" can persist from a
  mechanic's very first commit.** This gap is not a regression introduced by a later refactor — `git
  show 97597737` proves it was already there the day `triggerGuardReactions()` was born, simply
  because the commit's author reached for `applyMove` (the resolver being tested in that session)
  and never circled back to check `applyFlee` (a resolver that predates the guard mechanic by a full
  CT-phase, `9df23aa`, CT.1). Any future "figure relocates on the grid" resolver (a knockback effect,
  a forced-move spell, a charge mechanic) should be checked against this exact list of two
  post-relocation consequence calls (`applyHazardTo` + `triggerGuardReactions`) rather than assumed
  to inherit them automatically just because it uses `reachableCells()` under the hood.
- **Investigating one prior round's own flagged-but-unresolved question ("is X fully covered by Y's
  fix?") is a productive way to find a *different*, fresh bug** — the act of reading `applyFlee` and
  its sibling `applyMove` side by side to answer M74's narrow question is what surfaced this
  round's actual headline, which has nothing to do with log-slicing at all. Worth remembering as a
  search technique independent of whether the original question resolves to "yes, covered" or "no,
  gap": reading two structurally-parallel functions closely enough to answer one question tends to
  surface unrelated asymmetries between them for free.
- **A game mechanic's "byte-proven the feature exists, 1e-inferred the exact trigger rule" status
  (per `triggerGuardReactions()`'s own doc comment) doesn't reduce the engine's own obligation for
  internal consistency** — regardless of whether "does fleeing past a guard provoke its reaction"
  is knowable from the original CoK binary, the engine's *own* rule (as written) should apply
  identically to every relocation path it defines, or it creates an arbitrary, undocumented
  asymmetry a player could learn to exploit (flee instead of move, past a guard, for free).
