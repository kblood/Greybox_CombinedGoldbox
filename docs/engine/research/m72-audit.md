# M72 audit — the next "computed but unwired" candidate

> Audit method per the brief: first checked M71's own flagged cheapest follow-up (the `(Opportunity!)`
> combat-log tag) and found it **already resolved** — not a live gap (see "Candidate rejected first"
> below). Then swept the engine for OTHER small union/flag types not yet exhausted
> (`grep -rn "export type.*=.*'.*'.*|"` across `packages/engine/src`), and, following the "sibling
> field, one reaches the screen, one doesn't" method that has been productive since M69, found a
> **sibling *subsystem*** case rather than a sibling field on one struct: dungeon exploration's
> `Explorer.step()` and overland `WildernessTravel.step()` are two structurally parallel
> "attempt a one-tile move" functions that both return an optional `blocked` reason distinguishing
> *why* the step failed — and only one of the two ever reaches the player.

## Headline finding

### `Explorer.step()`'s `StepResult.blocked` ('wall' | 'edge') is a real, engine-computed, test-covered fact about every failed dungeon move — but BOTH web dungeon-exploration hosts (CoK/DoK's `explore.ts` and DQK's `dqkExplore.ts`) discard it, while the parallel overland-travel subsystem's identically-shaped `WildStep.blocked` ('edge' | 'impassable') already gets full player-facing text in `wilderness.ts`

**The fact is real and computed on every blocked step.** `packages/engine/src/world/explorer.ts:29`:

```ts
/** Why a step did not happen. */
export type BlockReason = 'wall' | 'edge';
```

`StepResult` (`explorer.ts:32-46`) carries `blocked?: BlockReason` alongside `moved`/`pose`/`event`/
`timeMinutes`. `Explorer`'s private `step()` (`explorer.ts:166-183`) sets it in exactly two places,
both currently reachable and both exercised by the engine's own test suite
(`packages/engine/test/explorer.test.ts:60-65` "is blocked by a wall on the leaving edge",
`:98`, `:101-105` "is blocked by the grid edge", `:139-146` "a blocked step costs no game-minutes"):

```ts
// explorer.ts:166-183
private step(dir: Direction): StepResult {
  const cell = this.currentCell();
  if (this.edgeBlocks(cell, dir)) {
    return { moved: false, blocked: 'wall', pose: this.getPose(), event: this.currentEvent(), timeMinutes: 0 };
  }
  const { dx, dy } = DELTA[dir];
  const nx = this.pose.x + dx;
  const ny = this.pose.y + dy;
  if (!this.inBounds(nx, ny)) {
    return { moved: false, blocked: 'edge', pose: this.getPose(), event: this.currentEvent(), timeMinutes: 0 };
  }
  ...
}
```

`forward()`/`backward()`/`stepLeft()`/`stepRight()` (`explorer.ts:224-238`) all funnel through this
same `step()`, so **every one of the four movement commands** the player can issue can produce a
`blocked` value.

**Neither web dungeon-exploration host reads it.** `apps/web/src/ui/explore.ts`'s `applyMove()`
(`explore.ts:1080-1111`, used by CoK/DoK — the `?explore=1` / `?explore=dok` routes):

```ts
// explore.ts:1080-1111 (current source)
function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  const ex = state.explorer;
  let res: StepResult | null = null;
  switch (action) {
    case 'forward': { ...; res = ex.forward(); break; }
    case 'back': { ...; res = ex.backward(); break; }
    case 'left': ex.turnLeft(); break;
    case 'right': ex.turnRight(); break;
  }
  if (res?.moved) {
    const prevDay = gameDay();
    state.clockMinutes += res.timeMinutes;
    if (gameDay() !== prevDay) renderMoons();
    stepDispatcher?.playEvent('step');
    stepCount++;
  }
  draw();
  return ex.getPose();
}
```

`res` is typed `StepResult | null` and DOES carry `.blocked` on a failed step — but the only field
ever read off it is `res?.moved` (the single `if` at line 1101), and the function's return type is
just `Pose` (`ex.getPose()`, line 1110) — `res` itself (and `.blocked` with it) is thrown away the
moment `applyMove()` returns. Confirmed by direct grep: `grep -n "res\.blocked\|res?\.blocked" apps/web/src/ui/explore.ts`
returns **zero** hits.

`apps/web/src/ui/dqkExplore.ts`'s `applyMove()` (`dqkExplore.ts:324-336`, DQK's `?dqk=1` route) is
even more truncated — it never even keeps the full `StepResult`, only the boolean:

```ts
// dqkExplore.ts:324-336 (current source)
function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  const ex = state.explorer;
  let moved = false;
  if (action === 'forward') { moved = ex.forward().moved; }
  else if (action === 'back') { moved = ex.backward().moved; }
  else if (action === 'left') ex.turnLeft();
  else ex.turnRight();
  draw();
  runStepEvent();
  if (moved) stepDispatcher?.playEvent('step');
  return ex.getPose();
}
```

`ex.forward().moved`/`ex.backward().moved` extract the boolean and drop the rest of the
`StepResult` object (including `.blocked`) inline, in the same expression — there is no
intermediate variable to even grep for; the discard is total. `grep -n "\.blocked\b" apps/web/src/ui/dqkExplore.ts`
returns zero hits.

**Neither status line, nor the persistent automap widget's causal link, nor either e2e seam ever
surfaces WHY a move failed.** `draw()` in `explore.ts` (`explore.ts:1046-1076`) recomputes the bottom
status text from `state.lastEvent`/pose/facing only — no reference to `blocked` anywhere. Both
`explore.ts`'s and `dqkExplore.ts`'s e2e seams expose `move: (a: MoveAction) => applyMove(a)`
(`explore.ts:1757`, `dqkExplore.ts:1223`) — and since `applyMove()`'s own return type is `Pose`, the
seam **structurally cannot** report `blocked` even to a headless test without a signature change.

The always-visible automap panel (`composeAutomapPanel`, `render/automapPanel.ts:158-159`, painted
alongside the main view per `explore.ts:1066-1067`/`dqkExplore.ts:305-314`) DOES draw a line for any
`cell.walls[dir] > 0` on a **visited** cell — so a `'wall'`-blocked bump is *spatially* re-derivable
after the fact by reading the automap grid, and the first-person 3-D view itself typically shows a
wall graphic directly ahead (so the player has *some* independent visual cue for the `'wall'` case).
But **the `'edge'` case has no such fallback at all**: it fires exactly when `cell.walls[dir] === 0`
(no wall byte is set on that edge in the real GEO data) yet the destination coordinate is outside the
decoded map's `width`×`height` bounds — so the automap draws **no** wall line there (nothing to draw)
and the first-person renderer has no special "map boundary" graphic either. In that case the player
gets **zero** signal of any kind: the screen looks unchanged, no wall appears in view, no line appears
on the automap, and no status text changes — the move attempt simply, silently, does nothing.

## Why this matters mechanically, not just cosmetically

This is the same class of gap as M69-M71's `impaired`/`guarding` findings — a fact the engine already
computes and already differentiates, discarded before it reaches the one place a player could act on
it — but for a **movement-feedback**, not combat-status, mechanic, and (per the "why wasn't this
already picked up" section) confirmed fresh. The `'edge'` half in particular can look like a silent
soft-lock: a player walking toward what they (from the automap/3-D view) believe is open space gets no
explanation at all for why they can't proceed, which is a worse player experience than a wrong-but-
present message would be.

**A note on the wraparound question (flagged, not pursued this round):** `coab_extracted/engine/ovr015.cs`'s
own `MovePartyForward` (`sub_43813`, lines 318-345) wraps position with `& 0x0F` (`mapPosX &= 0x0f;
mapPosY &= 0x0f; // wrap via masking`, line 326-327) — i.e., the *original* CoK/DoK engine's main
per-step movement is **toroidal** on its native 16×16 grid, per `docs/engine/research/decompile-ovr015-movement.md`'s
own "Maps are 16×16 and wrap by `& 0x0F`" verified finding. A **different** function in the same file,
`TryStepForward` (`sub_43765`, lines 278-315), is the one that actually **clamps** to the edge and
sets an `area2_ptr.tried_to_exit_map` flag (`Area2.cs:61`, field `0x5aa`) instead of wrapping — this
looks like the mechanism that detects "the party is trying to leave this map" (likely feeding an
area-transition/ECL check), a separate code path from the ordinary in-bounds step. Our engine's
`Explorer` never wraps (`inBounds()` rejects any out-of-range coordinate outright) and has no
`tried_to_exit_map`-equivalent flag at all. **This is a separate, deeper, rules-fidelity question
(does our engine need toroidal wrap + an area-exit signal, matching `TryStepForward`'s role, rather
than a flat reject?) that this round does NOT attempt to resolve or fix** — it would change movement
*behavior*, not just add a display of an existing fact, and is out of scope for this loop's
"additive, never fabricate" display-gap remit. It is noted here only because it explains *why* `'edge'`
may be under-exercised by real, intentionally-authored level geometry (a real dungeon's outer ring is
likely fully walled in the original data, making `'wall'` the common case and `'edge'` the rare
edge-of-bounds case) — flagged as an open question below, not a claim this round verifies either way.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m72_verify.test.ts` (created, run green — 3/3 passing; full
`packages/engine` suite re-run clean at **135 files / 1354 tests** via `cd packages/engine && npx
vitest run` — then deleted; `git status --porcelain` confirmed clean afterward, this doc the only
untracked file). Notes: a repo-root `npx vitest run` also picks up several stale, unrelated
`.claude/worktrees/*/packages/engine` copies with their own missing-asset failures (pre-existing,
unrelated to this change — those files reference `amiga_extracted/...` paths that don't exist in that
worktree checkout); scoping to the actual `packages/engine` directory is the correct, clean baseline
and is what this round's verification used.

1. **`Explorer.step()` genuinely distinguishes `'wall'` from `'edge'`, and both differ from a clean
   move.** Built a 2×2 room (mirroring `explorer.test.ts`'s own `room()` helper) with one real wall on
   `(0,0)`'s east edge. Facing east and calling `forward()` returned `{moved:false, blocked:'wall',
   timeMinutes:0}`; turning to face off-grid west and calling `forward()` returned `{moved:false,
   blocked:'edge', timeMinutes:0}`; turning to face an open, in-bounds direction and calling
   `forward()` returned `{moved:true, blocked:undefined}`.
2. **Reproduced the exact "moved-only" reduction both real `applyMove()` functions perform**, inline:
   captured a wall-blocked `StepResult`, extracted only `.moved` (mirroring `explore.ts:1101`'s
   `res?.moved` test and `dqkExplore.ts:328`'s `ex.forward().moved`), and confirmed the richer
   `.blocked` fact is present on the original object but unreachable from what survives the
   reduction — i.e., the gap is a genuine "computed, then discarded" pattern, not a hypothetical one.
3. **Confirmed the sibling `WildernessTravel.step()` has the parallel shape AND already gets the
   text treatment `Explorer` lacks.** Built a 2-tile map (plains + water) and drove `step('west')`
   (off the edge: `{moved:false, blocked:'edge'}`) and `step('east')` (into impassable water:
   `{moved:false, blocked:'impassable'}`), then reproduced `wilderness.ts:229`'s real reduction
   (`step.blocked === 'impassable' ? "You cannot cross the ${terrain}." : "The road ends here."`)
   verbatim in shape and confirmed it produces two genuinely different, informative strings — the
   exact machinery `Explorer`'s callers never built.

## Why this wasn't already picked up (grep evidence against every prior round)

- **`BlockReason`** (the exact type name) — **zero hits** in any `docs/engine/research/m*-audit.md`.
- **`StepResult`** — exactly one hit, **M41** (`m41-audit.md:235`), which examined a **different**
  field on the same interface: `MapCell.event`/`StepResult.event`, and rejected it on **grounding**
  grounds (real CoK/DoK/DQK GEO decoders never populate `.event`; it's FRUA-authoring-only). M41 never
  looked at `.blocked` at all — a different field on the same struct, examined for a different reason.
- **`applyMove`** (the exact function name in both `explore.ts` and `dqkExplore.ts`) — **zero hits**.
- **`WildStepResult`/`WildStep`** — **zero hits** (the wilderness subsystem's own step-result type has
  never been examined by name in this loop before).
- **`edgeBlocks`/`Explorer.step`** — one hit, **M40** (`m40-audit.md:245`), which examined `edgeBlocks()`
  from an entirely different angle: whether it (correctly) ignores `doorsOpen`/lock state, and whether
  the door bash/pick/knock attempt-tracking API is wired to any UI (it isn't — M40 flagged that as a
  structurally-incomplete subsystem, a bigger follow-on, not a display fix). M40 never mentions
  `blocked`, `'wall'`, or `'edge'` — its finding is entirely about the **door-lock** side of
  `MapCell`, not the **wall/map-boundary** distinction this round examines.
- **Generic word "blocked"** — searched case-insensitively across every `m*-audit.md`; every hit
  (M26-M38) concerns the unrelated "item-instance subsystem is blocked" (developer-facing "this
  feature can't be built yet" sense), not `StepResult.blocked`/`WildStep.blocked` in any occurrence.
- **`wilderness.ts`** — appears in prior audits only in passing (module inventories), never with a
  claim about its `blocked`-branching `setStatus()` calls at lines 229/330 specifically.

This candidate — the movement-blocked-reason asymmetry between `Explorer` and `WildernessTravel` — has
never been examined by any prior round under any of these names.

## Wiring plan

Small, additive, mirrors the exact treatment `wilderness.ts` already gives its own `blocked` field —
a `setStatus()` branch plus one e2e-seam field, touching only the two dungeon-exploration UI hosts
(no engine changes; `Explorer`/`StepResult` are already correct and unchanged).

**1. `apps/web/src/ui/explore.ts`** — keep `res` on `state` (a new optional `lastBlocked?: BlockReason`
field, cleared on a successful move) and fold it into the existing status line construction
(`draw()`, `explore.ts:1070-1075`) as a distinct, honestly-omitted-when-absent clause:

```ts
// applyMove(), replacing the plain `if (res?.moved)` gate:
if (res?.moved) {
  state.lastBlocked = undefined;
  const prevDay = gameDay();
  state.clockMinutes += res.timeMinutes;
  if (gameDay() !== prevDay) renderMoons();
  stepDispatcher?.playEvent('step');
  stepCount++;
} else if (res?.blocked) {
  state.lastBlocked = res.blocked;
}
```

```ts
// draw(), appended to the existing status-line concatenation:
const blockedText = state.lastBlocked === 'wall' ? ' · A wall blocks your way.'
  : state.lastBlocked === 'edge' ? ' · You can go no further this way.' : '';
setStatus(
  `Exploring ${map.name} — (${pose.x},${pose.y}) facing ${pose.facing}` +
    (evText ? ` · ${evText}` : '') + blockedText +
    ` · ↑ forward ↓ back ← → turn`,
);
```

**2. `apps/web/src/ui/dqkExplore.ts`** — same shape: keep the full `StepResult` (not just `.moved`)
in `applyMove()`, track a `state.lastBlocked` field, fold into `draw()`'s existing status line
(`dqkExplore.ts:316-319`) the same way.

**3. Both files' e2e seams** — widen `move()`'s return value from `Pose` to `Pose & { blocked?:
BlockReason }` (or add a sibling `blocked: () => state?.lastBlocked` accessor), mirroring
`wilderness.ts:333`'s `{ ...step, clockBefore, clockAfter }` pattern, so e2e can assert the new
behaviour the same way `runWilderness()`'s existing `edge.blocked === 'edge'` assertion
(`e2e.mjs:3512`) already does for the wilderness side.

**4. Tests to extend:**
- `packages/engine` needs no changes (the fact is already correctly computed/tested there).
- A new `apps/web/test/e2e.mjs` case mirroring `runWilderness()`'s edge-block assertion: drive
  `window.__explore.move('forward')` into a known-walled direction and a known map-boundary direction
  in a real loaded dungeon, and assert the widened seam reports `blocked: 'wall'`/`'edge'`
  respectively; repeat for `window.__dqk.move(...)`.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| The `(Opportunity!)` combat-log tag (M71's flagged cheapest follow-up) | **Already resolved, not a live gap.** `apps/web/src/ui/combat.ts:609` (current source): `else if (e.opportunity) pushLog(\`${nameOf(e.actor)} strikes the advancing ${nameOf(e.target)} for ${e.damage}!\`);` — a guard's reaction strike already gets its own distinct, full-sentence phrasing in the primary combat-log renderer (`logEvents()`), one branch above `backstab` and below `coupDeGrace`, git-blamed to the ORIGINAL `CT.7d` commit (`97597737`, 2026-06-23) that introduced the `guard`/`opportunity` mechanic itself — it has never been generic "hits X for Y" text. M71's claim that "a guard's reaction strike currently logs identically to an ordinary attack" describes a *different*, pre-attack targeting-banner tag mechanism (`highlightTarget()`'s `coupDeGrace`/`backstab`/`flank`/range tags, `combat.ts:962-985`) that only fires while the player is manually choosing a target — `opportunity` cannot appear there at all, since a guard reaction is AI-triggered by `triggerGuardReactions()` after a *move*, never a player-selected attack target. So the one real consumer (the post-hoc combat log) already narrates it distinctly; there is no live `(Opportunity!)`-style tag gap left to wire. |
| A fresh full-union sweep of `MonsterCategory` ('monster'/'humanoid'/'npc'/'unknown'/'sub') | Checked all 5 branches' consumers: `'npc'` drives the real Class/Level rows in `referenceDb.ts:97,125` (M37/M38's own work); `'sub'` (dragon HEAD/breath sub-entries) is already counted and narrated in `dqkExplore.ts:1020-1021`'s load-summary note; `'monster'`/`'humanoid'`/`'unknown'` fall through to `m.category` itself as the literal displayed Class-row string (`referenceDb.ts:97`) when no `npcClass` is set — not hidden, just plainly rendered as-is. No genuine gap found; not pursued. |
| `petitionableOrder()`/`KnightOrder` ('crown'/'sword'/'rose') | Already fully wired per **M66** (`m66-audit.md:320`: "`petitionableOrder` already shown on `charSheet.ts`/`create.ts`"). The `KnightOrder`/`KNIGHT_ORDERS` type-name grep alone returned zero prior hits (a trap — the *type* name was never searched by a prior round, only the *function* `petitionableOrder` was, under a different framing), which is why this round re-derived and then correctly re-rejected it, rather than presenting it as fresh. |
| `Encumbrance`/`EncumbranceLevel` (5-level union) | Exhaustively re-confirmed already-mined territory: `.label` shown in `inventory.ts`, `.moveRate` shown in `charSheet.ts` (a deliberate **M63** split-screen decision, not an oversight), `.allowanceTenths`/`.maxLoadTenths` explicitly rejected by **M48** ("no natural single-line display slot"). Not re-litigated (per **M68**'s own restatement of the same verdict). |
| `TurnOutcome` ('destroy'/'turn'/'none'/`number`) | Traced `applyTurn()`'s full branch coverage (`tactical.ts:1544-1574`): `destroy`→`{destroyed:true}` event, `turn`/a made numeric roll→`{turned:true}` event, a failed/`'none'` roll→a targetless `{type:'turn'}` "fizzle" event. `combat.ts:641-644` already has all three branches covered (`e.destroyed`/`e.turned`/`e.target === undefined` → "The turning has no effect."). Fully wired; not a gap. |
| `MoraleBreak`/`surrendered`/`guarding`/the rest of `TacticalStatusFlag` | Not re-opened — **M71** shipped `guarding` and the `surrendered` grid-skip fix in the immediately preceding round; re-litigating the same union this round would violate the "don't re-pick a sibling of an already-exhausted set" discipline this loop has learned. |
| Fixing the toroidal-wrap / `tried_to_exit_map` discrepancy directly | Rejected as **this round's fix** (though real and interesting — see "A note on the wraparound question" above): it is a movement-*behavior* change (whether the engine should wrap instead of reject), not a "surface an already-computed fact" display fix, and would need its own dedicated verification pass (does any real CoK/DoK/DQK dungeon actually rely on wraparound, or is every real map's outer ring fully walled, making this moot in practice?) that this round did not attempt. Flagged as an open question instead. |

## Open questions / unknowns

- Whether any *real* CoK/DoK/DQK dungeon level actually has an un-walled outer-ring edge that would
  exercise `'edge'` in real play (as opposed to only being reachable from a hand-authored test map or
  a FRUA-authored custom module) — **UNKNOWN**, not checked this round; would require scanning decoded
  real `GEO`/`GEO.GLB` cell data for a `walls[dir] === 0` cell on the map's literal boundary row/column.
- Whether the engine should eventually model `TryStepForward`'s clamp-and-flag behavior (or the
  toroidal `& 0x0F` wrap `MovePartyForward` uses for an in-bounds step) rather than `Explorer`'s
  current flat reject — **UNKNOWN**, a genuine rules-fidelity question flagged but not investigated in
  depth this round (see "A note on the wraparound question" above); if pursued, it would likely also
  resolve *why* a real area transition is supposed to trigger (an ECL check on `tried_to_exit_map`-
  equivalent state), which is a bigger, separate research task.
- Whether the wording proposed above ("A wall blocks your way." / "You can go no further this way.")
  should instead try to match a specific string from the original games' own binaries — **UNKNOWN**;
  no such string was found in `hackdocs_extracted/` or the disassembly docs searched this round
  (`decompile-ovr015-movement.md`, `coab_extracted/engine/ovr015.cs`), so the proposed wording is
  original engine-status prose (in the same style as the existing "No movement left."/"No foe in
  reach." banners elsewhere), not a byte-grounded reproduction — flagged, not fabricated as a claimed
  original string.
- Whether `stepDispatcher` should also play a distinct "bump" SFX on a blocked move (mirroring
  `wilderness.ts`'s treatment, which plays no distinct SFX either — it only changes status text) —
  **UNKNOWN**, out of scope; no such SFX asset currently exists in `soundDispatch.ts`, and adding a new
  sound is a bigger asset-sourcing question than this round's display-text fix.

## Implications for our engine

- **"Sibling field on the same struct" generalizes to "sibling subsystem with a parallel-shaped return
  type."** M69-M71 all worked within one struct (`TacticalCombatant`/`CombatCellState`); this round's
  gap sits across two *different but structurally parallel* subsystems (dungeon movement vs. overland
  travel) that happen to share the exact same `{moved, blocked?, ...}` result shape — one already fully
  wired, the other not. Worth checking, for any future "does X have a UI consumer" question, whether a
  *sibling subsystem* (not just a sibling field) already solved the identical UI problem and can be
  copied almost verbatim, the way this round copies `wilderness.ts`'s `setStatus()` branch shape.
- **A type name and a function name can each independently have "zero prior hits" while a THIRD,
  related name (`petitionableOrder`) was already checked under a different search term** — reinforces
  the standing discipline note that the *exact* name searched matters: this round's own first attempt
  (grepping `KnightOrder`) returned zero hits and looked fresh, until grepping the actual consuming
  *function* name (`petitionableOrder`) surfaced M66's real, prior, correct rejection. Any future round
  should grep the type name, the constructing function name(s), AND the concrete union member string
  literals before concluding a union is unexamined.
- **Git-blaming a suspicious "M71 said it's missing" claim against the actual commit history caught a
  stale claim before it was re-shipped as a duplicate fix** — `git log -p -L` on the exact log line
  showed the `opportunity` full-sentence phrasing has existed, unchanged, since the very commit that
  introduced the `guard`/`opportunity` mechanic (`97597737`, CT.7d, 2026-06-23) — a full 7+ weeks and
  many rounds before M71 examined it and (incorrectly, if read as "identical to an ordinary attack")
  flagged it as still-open. Cross-checking a flagged follow-up against `git log -p` for the exact line
  in question, not just re-reading the current file, is a cheap, high-value verification step before
  building on top of a predecessor's stated "not done yet."
