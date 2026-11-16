# M73 audit — the next "computed but unwired" candidate

> Audit method per the brief: swept `packages/engine/src` for small discriminated unions not yet
> exhausted (`grep -rn "export type.*=.*'.*'.*|"`), checked `EclCombatOutcome` (fully wired — all three
> branches reachable via `moduleExplore.ts`'s combat-outcome buttons) and `RangeBracket` (the type
> M44/M48/M49/M50/M51/M52 have all separately touched). Rather than stopping there, re-read every one
> of `RangeBracket`'s real call sites end-to-end and found that the loop's own heavily-mined
> `rangeTag()`/`RangeBracket` territory still has one un-mined corner: **`logEvents()`'s `attack`-miss
> branch never reads `rangeBracket` (or `rear`, or `opportunity`) at all**, even though `tactical.ts`
> already puts all three facts on a missed-attack event exactly as it does on a hit. This is the same
> "sibling field, one reaches the screen, one doesn't" method M69–M71 used, applied inside a single
> `if/else` block instead of across a struct — the narrowest-scoped instance of the pattern this loop
> has found yet, but a real, previously-unexamined gap.

## Headline finding

### `apps/web/src/ui/combat.ts`'s `logEvents()` fully differentiates a **hit** attack event by `coupDeGrace`/`opportunity`/`backstab`/`rear`/`rangeBracket` — but its sibling `else` (miss) branch collapses ALL of them into one undifferentiated `"X misses Y."`, even though `tactical.ts`'s `resolveHit()` (and `triggerGuardReactions()`) already put `rear`, `rangeBracket`, and `opportunity` on the miss event too

**The facts are real and engine-computed identically on a hit or a miss.** `packages/engine/src/combat/tactical.ts`'s `resolveHit()` pushes exactly one `attack` event per resolved swing/shot, and the miss branch (`!hit`, **line 1144-1145**) already carries the same contextual fields the two hit branches (**lines 1146-1155** coup-de-grace, **1157-1167** ordinary hit) carry:

```ts
// tactical.ts:1144-1145 (current source, the miss branch)
if (!hit) {
  events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: false, missile, targetHpAfter: target.hp, rear: fromRear || undefined, rangeBracket: bracket });
} else if (coupDeGrace) {
  ...
  // tactical.ts:1155 — the coup-de-grace hit push, for contrast:
  events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: 0, helpless: true, coupDeGrace: true, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
} else {
  ...
  // tactical.ts:1167 — the ordinary hit push:
  events.push({ round, type: 'attack', actor: actor.id, target: target.id, roll, needed, hit: true, missile, damage: dmg, targetHpAfter: Math.max(0, target.hp), helpless: helpless || undefined, backstab: backstab || undefined, rear: fromRear || undefined, rangeBracket: bracket });
}
```

`rear` and `rangeBracket` are computed **before** the hit/miss roll is even resolved (`tactical.ts:1116-1133`, the `fromRear`/`bracket` locals used to adjust `needed`), so by construction they are exactly as valid on a miss as on a hit — the miss branch's inclusion of `rear:`/`rangeBracket:` at line 1145 is not a leftover/copy-paste accident, it is the same object shape deliberately carried through all three branches.

`TacticalEvent`'s doc comments (`tactical.ts:379-382`) confirm these are general "Attack:" facts, not hit-only facts:

```ts
// tactical.ts:379-382 (current source)
/** Attack: true when the (melee) blow came from the target's rear arc — rear/flank AC applied (CT.7a). */
rear?: boolean;
/** Attack: the missile shot's range band (short/medium/long) whose to-hit modifier was applied (CT.7c). */
rangeBracket?: RangeBracket;
```

**`opportunity` is even more clearly hit/miss-agnostic by construction.** `triggerGuardReactions()` (CT.7d, a guard's readied reaction strike) calls `resolveHit()` and then tags **every** event `resolveHit()` returned, unconditionally:

```ts
// tactical.ts:1393-1394 (current source)
const strikes = resolveHit(g, mover, defaultWeapon(g), false);
for (const e of strikes) if (e.type === 'attack') e.opportunity = true;
```

There is no `if (e.hit)` guard here — a guard reaction that **misses** still gets `opportunity: true` on its event, exactly like one that hits.

**The UI consumer (`logEvents()`) only reads any of these three fields inside `if (e.hit)`.** `apps/web/src/ui/combat.ts:606-619` (current source):

```ts
// combat.ts:606-619
case 'attack':
  if (e.hit) {
    if (e.coupDeGrace) pushLog(`${nameOf(e.actor)} slays the helpless ${nameOf(e.target)} with one cruel blow!`); // CT.7j
    else if (e.opportunity) pushLog(`${nameOf(e.actor)} strikes the advancing ${nameOf(e.target)} for ${e.damage}!`);
    else if (e.backstab) pushLog(`${nameOf(e.actor)} backstabs ${nameOf(e.target)} (from behind) for ${e.damage}!`);
    else if (e.rear) pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} from behind for ${e.damage}.`);
    else if (e.missile) pushLog(`${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.`);
    else pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} for ${e.damage}.`);
    soundDispatcher.playEvent(e.missile ? 'missile' : 'hit');
  } else {
    pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}.`);
    soundDispatcher.playEvent('miss');
  }
  break;
```

The `else` (miss) branch at **lines 615-618** is a single unconditional `pushLog`/`playEvent` pair — it never reads `e.rear`, `e.rangeBracket`, or `e.opportunity`, even though all three can be (and, per the reasoning above, routinely are) set on the very event object it is holding. `rangeTag()` (**combat.ts:582-585**, the exact formatter the hit branch already calls) is never invoked from the miss branch at all. This is the single combat-log host used by every real fight — CoK/DoK/DQK flat encounters, wilderness encounters, and ECL/dialogue-triggered fights all funnel through `launchCombat()`/`logEvents()` in this one file (confirmed by grep: `logEvents` and the literal `misses ${nameOf(e.target)}` line have no other occurrence anywhere in `apps/web/src`).

## Why this matters mechanically, not just cosmetically

- **`rangeBracket` on a miss is genuinely informative, not decorative.** `rangeBracketToHit()` (`tactical.ts:596-...`, short +1/medium 0/long −2) is a real to-hit modifier that was already folded into `needed` before the roll that produced this very miss (`tactical.ts:1131`: `needed -= rangeBracketToHit(bracket);`). A player who keeps missing at long range currently gets no textual explanation why — the same class of "silent, uninformative failure" M72 flagged for `Explorer.step()`'s `'edge'` case, just for combat instead of movement.
- **`opportunity` on a miss is a distinct in-fiction moment the player currently can't tell apart from an ordinary swing.** A guard's readied reaction spends the guard's action (`g.flags.delete('guarding')`, `tactical.ts:1391`) whether or not the reaction connects — the player has already seen the "Guarding" indicator disappear (M69-M71's grid work) but the combat log gives zero indication *why* that reaction fired if it whiffs; it reads exactly like the guard chose to swing at nothing.
- **`rear` on a miss is the least consequential of the three** (a from-behind miss is still just a miss — no separate mechanical consequence beyond the to-hit math already applied) but is included here because it is the same code shape, the same branch, and the same one-line diff location as the other two; treating it separately would just mean re-discovering the identical `else` branch in a future round.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m73_verify.test.ts` (created, run green — 3/3 passing; then deleted; `git status --porcelain` confirmed clean afterward, this doc the only untracked file):

1. **A long-range missile miss carries `rangeBracket: 'long'` exactly like a hit does.** Built an archer
   (thac0 15) vs. a target at long range (AC 8, `needed = 15-8+2 = 9`, a genuine mixed hit/miss spread —
   not relying on the always-hits nat-20 rule alone) and swept seeds 1-60 via `createTacticalCombat`'s
   real `apply({ type: 'missile', ... })` path until both a hit and a miss were observed; every resulting
   `attack` event — hit or miss — had `rangeBracket === 'long'`.
2. **A guard reaction strike that misses still carries `opportunity: true`.** Reproduced
   `tactical.test.ts`'s own "guard readied reactions (CT.7d)" fixture shape (guardian readies, an
   advancer steps adjacent) but tuned thac0/AC for a mixed spread instead of the suite's own
   "near-certain hit" fixture; swept seeds 1-100 until a genuine miss (`op.hit === false`) with
   `op.opportunity === true` was found — confirming the fact is real and present on a miss in actual
   engine output, not merely inferable from source reading.
3. **Reproduced the exact current UI reduction verbatim** (the `if(e.hit){...} else {'misses.'}` shape
   copied from `combat.ts:606-618`) and confirmed all three facts (`rangeBracket`, `rear`, `opportunity`)
   are silently dropped by the current miss branch while the identical facts DO change the logged line
   when `hit` is true — i.e., the gap is a genuine "computed, then discarded" pattern, not hypothetical.

Full `packages/engine` suite re-run clean at **135 files / 1354 tests** (1351 baseline + 3 scratch) via
`cd packages/engine && npx vitest run` both before and after adding the scratch file; scratch file then
deleted and `git status --porcelain` confirmed empty. (Per standing guidance, a repo-root `npx vitest
run` also sweeps stale `.claude/worktrees/*` copies with pre-existing unrelated failures — scoping to
`packages/engine` is the correct, clean baseline used here.)

## Why this wasn't already picked up (grep evidence against every prior round)

- **`RangeBracket`/`rangeTag`/`missileRangeBracket`** — heavily mined by **M25, M44, M48, M49, M50,
  M51, M52** (see full grep output below), but every one of those rounds examined either (a) whether the
  to-hit modifier itself was applied (M25/M44 — yes, wired into `needed`), or (b) whether the **pre-hoc**
  target-picker banner shows the band before a shot is fired (M48 melee/M49 missile/M50 thrown-weapon
  extension). **None of them examined the post-hoc miss branch of `logEvents()`** — M44's own finding was
  specifically that the **hit** branch's `rangeTag()` call already existed and was the thing to imitate
  elsewhere; it never states or implies the miss branch also reads it (confirmed: M44-M52 contain zero
  occurrences of the word "miss" anywhere near a `rangeTag`/`rangeBracket` discussion — checked via
  `grep -niE "rangeBracket.*miss|miss.*rangeBracket|rangeTag.*miss|miss.*rangeTag"` across all
  `m*-audit.md`, **zero hits**).
- **`opportunity`/`(Opportunity!)` tag** — examined by **M71** (flagged as apparently missing) and
  **M72** (found already resolved — the **hit** branch's `else if (e.opportunity)` line, git-blamed to
  the original CT.7d commit). Checked specifically via `grep -niE "opportunity.*miss|miss.*opportunity"`
  across every `m*-audit.md` — **zero hits**. Both M71 and M72's examinations were entirely about whether
  a *successful* reaction strike gets distinct phrasing (yes, since the mechanic's introduction); neither
  round considered what happens when the reaction strike **misses** — a case M72's own git-blame evidence
  doesn't cover, since the phrasing it found only fires inside `if (e.hit)`.
- **`rear`/`fromRear`/"from behind"** — appears in **M48** (the pre-hoc melee targeting banner) and in
  passing in **M49/M50** (as a sibling precedent, not examined itself). Checked
  `grep -niE "\.rear\b|fromRear|from behind"` across all `m*-audit.md` — hits are all about the **hit**
  phrasing (`combat.ts:611`'s "hits ... from behind") or the pre-hoc banner; none examine the miss branch.
- **`logEvents`/`combat.ts:6\d\d`** (the exact function and line range) — no prior round's grep for this
  exact function name returns a discussion of its `else` (miss) branch specifically; every prior mention
  of `logEvents` is about a **hit**-branch addition (M44's `rangeTag` origin, M48's `rear`/`backstab`,
  M71's `opportunity`, M72's confirmation of the same).

This candidate — the systematic under-differentiation of `logEvents()`'s **miss** branch for `rear`,
`rangeBracket`, and `opportunity`, as opposed to its already-fully-wired **hit** branch — has never been
examined by any prior round under any of these names.

## Wiring plan

Small, additive, single-file, mirrors the exact cascading `if/else if` shape the hit branch already
uses (same fields, same `rangeTag()` helper, same priority order minus the two hit-only cases —
`coupDeGrace` cannot occur on a miss since a helpless target always auto-hits, and `backstab` is not
recorded on the miss event at all — see "Rejected alternatives" for why that's a different, engine-side
gap, not fixed here).

**`apps/web/src/ui/combat.ts`**, replacing the current miss branch (lines 615-618):

```ts
} else {
  if (e.opportunity) pushLog(`${nameOf(e.actor)}'s readied strike misses the advancing ${nameOf(e.target)}.`);
  else if (e.rear) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)} (from behind).`);
  else if (e.missile) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}${rangeTag(e.rangeBracket)}.`);
  else pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}.`);
  soundDispatcher.playEvent('miss');
}
```

Notes on the shape:
- `rangeTag()` (`combat.ts:582-585`) is reused verbatim — no new formatter, no new field, nothing
  invented; it already honestly returns `''` for `'medium'` (so a medium-range miss is unchanged:
  `"X misses Y."`), matching the hit branch's own "silent when unremarkable" convention noted by prior
  rounds (M49's "Wording" note).
  `e.rangeBracket`/`e.rear`/`e.opportunity` are all `undefined` on a melee/no-context miss, so every
  existing test/e2e case that currently asserts a generic `"X misses Y."` line for an ordinary attack is
  unaffected (confirmed no such assertion exists at all via
  `grep -n "misses" apps/web/test/e2e.mjs`, **zero hits**, so nothing to update there either — this is a
  pure addition, not a text change to an existing assertion).
- Priority order mirrors the hit branch (`opportunity` before `rear` before `missile`) for consistency,
  though in practice `opportunity` reactions are always melee (`triggerGuardReactions()` calls
  `resolveHit(g, mover, defaultWeapon(g), false)` — the 4th arg is `missile`, always `false` there), so
  `opportunity` and `rangeTag()` can never both apply to the same event; the ordering is defensive/
  future-proofing only, not load-bearing today.

**Tests to extend:**
- `packages/engine` needs no changes — the facts are already correctly computed and (per this round's
  verification) already reachable on real `!hit` events via the public API.
- A new `apps/web/test/e2e.mjs` case: drive a real `?combat=1` fight, force a long-range missile miss
  (or sweep a small seed range as this round's scratch test did) and a missed guard reaction, and assert
  `window.__combat.log()` (`combat.ts:1247`, already exposed) contains the new differentiated miss text
  instead of the generic line — mirroring the existing pattern at `e2e.mjs:299` that already reads
  `window.__combat.log()` for other assertions.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `EclCombatOutcome` ('victory'/'defeat'/'flee') | Checked all three branches' UI consumers in `apps/web/src/ui/moduleExplore.ts`: `mkOutcomeBtn('Victory', 'victory')` / `('Defeat', 'defeat')` / `('Flee', 'flee')` (lines 357-359) all wire to real, distinct buttons calling `answerCombat()`, which calls `vm.resume(0, { combatOutcome: outcome })`. Fully wired; not a gap. |
| `backstab` on a missed attack | **A different, deeper, engine-side gap, not pursued.** Unlike `rear`/`rangeBracket`/`opportunity`, the miss-branch event push (`tactical.ts:1145`) does **not** include a `backstab:` key at all — it is not merely unread by the UI, it is never written to the event object in the first place. Fixing this would require an *engine* change (adding `backstab: backstab || undefined` to the miss push), which is out of this research-only round's remit (`CLAUDE.md`: "Do not modify engine/source code") and is a different class of finding (an omission in what's computed, not in what's displayed) — flagged as an open question below instead. |
| A dedicated `(Reaction!)` bracket tag for the miss line (instead of the full-sentence phrasing chosen above) | Considered mirroring `rangeTag()`'s "conditionally-empty bracketed suffix" shape uniformly (e.g. `misses ${target}${tag}.` for all three cases) rather than a full alternate sentence for `opportunity`. Chose the full-sentence form for `opportunity` specifically because the **hit** branch already uses a full distinct sentence for it (`"strikes the advancing ... for ..."`, not a suffix tag) — matching that precedent's *shape*, not just its *content*, seemed more consistent than inventing a new suffix-tag convention for the one case that already has a sentence-level precedent. `rear`/`missile` do stay in the cheaper suffix-tag shape since `rangeTag()` already established that convention and the hit branch's own `rear` line is arguably closer to "hits ... from behind" (a fuller phrase) than a bare suffix — a debatable stylistic call, flagged as an open question below rather than treated as settled. |
| Re-examining `MonsterCategory`, `Encumbrance`, `TurnOutcome`, `KnightOrder` | Not re-opened — all four already correctly checked and rejected by **M72**; re-litigating would violate the "don't re-pick an already-exhausted set" discipline. |
| The toroidal-wrap / `tried_to_exit_map` movement question (M72's flagged follow-up) | Not pursued — M72 already correctly scoped this as a rules-fidelity *behavior* question requiring its own dedicated investigation, not a display-gap fix; nothing new to add this round. |
| Whether any real dungeon exercises `StepResult.blocked === 'edge'` (M72's other open question) | Not investigated this round — orthogonal to this round's combat-log finding; left for whichever future round picks up M72's own flagged follow-up. |

## Open questions / unknowns

- **Exact wording.** The three proposed miss-line phrasings above ("readied strike misses the
  advancing...", "misses ... (from behind)", "misses ... " + `rangeTag()`) are original engine-status
  prose in the same register as the existing hit-branch lines and M72's proposed movement-status text —
  **not** verified against any original CoK/DoK/DQK binary string (no miss-specific range/rear/reaction
  string was searched for in `hackdocs_extracted/` this round). Flagged, not fabricated as a claimed
  original string, exactly per M72's own precedent for its analogous wording question.
- **Should `backstab` also be recorded (engine-side) on a missed attempt?** Per the rejected-alternatives
  entry above, this is a real, adjacent gap but a different class (an engine omission, not a display
  gap) and genuinely out of this round's scope. **UNKNOWN** whether the team wants a follow-up round (or
  a lead-session change) to add `backstab: backstab || undefined` to `tactical.ts:1145`'s miss push and
  then a fourth `else if (e.backstab)` branch ("X's backstab attempt misses Y.") to `logEvents()`'s miss
  case — flagged as the most natural next step in this exact area, not built this round.
- **Stylistic consistency between the hit and miss branches' phrasing shapes** (full sentence for
  `opportunity`/`backstab`/`rear` on a hit, vs. this round's mix of full-sentence-for-`opportunity`-only
  and suffix-tag-for-`rear`/`missile` on a miss) is a debatable call, not a settled team preference —
  **UNKNOWN** whether the team would rather have all three miss cases use full alternate sentences (more
  verbose, more consistent with the hit branch) or all three use suffix tags (terser, cheaper to write
  and to keep in sync as new fields are added). Both are additive and equally "never fabricate" — a
  wording/style choice for the lead session, not a grounding question.
- Whether a distinct miss SFX should vary by `opportunity`/`rear`/range (mirroring `soundDispatcher`'s
  existing single generic `'miss'` cue for every miss today) — **UNKNOWN**, out of scope; no such
  differentiated SFX asset currently exists, and adding one is a bigger asset-sourcing question than this
  round's log-text fix, the same reasoning M72 used for its own "bump SFX" open question.

## Implications for our engine

- **The "sibling field" method generalizes one level further: down to a single `if/else` block inside
  one function**, not just across a struct (M69-M71) or across two different subsystems (M72). Any
  branch that differentiates a discriminated event on one side of a boolean gate (`if (e.hit) {...}
  else {...}`) is worth checking for whether the *other* side quietly has access to the same
  differentiating fields and simply never reads them — a cheap, systematic check that doesn't require
  finding a new struct or subsystem at all, just re-reading a function's two halves side by side.
- **A field being "heavily mined" by name (`RangeBracket`/`rangeTag`, 6+ prior rounds) does not mean
  every call site of its consumer has been examined** — M44-M52 all correctly advanced `rangeTag()`'s
  reach (to melee banners, to missile banners, to thrown weapons) but every one of those extensions
  targeted the **pre-hoc** banner or the **hit** branch of the **post-hoc** log; the untouched **miss**
  branch of the exact same already-famous function sat unexamined through six rounds of work on its
  immediate neighbors. Worth remembering: "this type/function has been discussed a lot" is not the same
  signal as "every branch that touches it has been checked."
- **`opportunity`'s "already resolved" status (M72) was correctly scoped to the hit case only** — M72's
  verification was rigorous and its conclusion (a successful reaction strike is narrated distinctly) is
  still correct and not contradicted here; this round found an adjacent, non-overlapping gap (the same
  fact on the *miss* outcome) rather than reopening or correcting M72's claim. A "confirmed already
  shipped" verdict from a prior round should be read as scoped to the specific code path that round
  actually traced, not as a blanket clearance of every event carrying that same boolean field.
