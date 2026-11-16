# M85 audit — the next "computed but unwired" candidate

> Audit method: per requirement #4, checked the carried-forward backlog first — no fresh angle on
> any of M81-M84's own listed items survived re-reading (all still correctly parked for the reasons
> already given). Per M84's own newly-flagged angle, ran `git show 1551717 --stat` and swept the
> commit's OTHER delta items (`combat/deploy.ts` formation, `world/gameClock.ts` calendar,
> `world/explorer.ts` step time, `render/sky.ts` colours, `audio/soundDispatch.ts` dispatch, `save/`
> import field-map) for the same "isolated-tested mechanism, real-caller starved" shape M81/M84 found
> in `tactical.ts`/`combatSpells.ts`. `deploy.ts` and `soundDispatch.ts` both have real, direct
> production callers in `apps/web/src/ui/combat.ts` (confirmed by grep, not re-investigated further).
> `gameClock.ts` (the calendar) and `explorer.ts` (the step-time cost) turned out to be the SAME
> finding from two sides: `Explorer.forward()`/`backward()` (ovr015) compute a real per-step
> `StepResult.timeMinutes` cost for every game, but only ONE of this engine's two real
> dungeon-exploration hosts ever accumulates it into `gameClock.ts`'s already-real, already-tested
> calendar (ovr021). Checked this specific angle against the backlog first: `m63-audit.md:358`
> already looked at "`dqkExplore.ts` gaining a day/clock/moon system" and declined it as **"an entire
> missing subsystem... far bigger than a same-day wiring slice,"** and `m81-audit.md:443` separately
> re-confirmed "DQK's missing rest UI" as **"weak"** in a one-line aside. This round found a
> materially narrower, fresher angle neither of those passes took: the exact **one already-computed
> scalar field** (`StepResult.timeMinutes`) that a structurally-parallel sibling function
> (`explore.ts`'s own `applyMove()`) already consumes with a **single line**
> (`state.clockMinutes += res.timeMinutes`) — not a request to build calendar/rest/moon-bar UI from
> scratch, which is the (correctly out-of-scope) framing both prior passes evaluated and declined.
> Also traced the *exact* wiring commit sequence: `1551717` (2026-06-30 20:29, engine-only) added the
> field; `c67a98d` (2026-06-30 21:28, **one hour later**) is the dedicated UI follow-up commit that
> wires it into `explore.ts` — and its own diff touches ONLY `explore.ts`/`magic.ts`/`party.ts`/
> `e2e.mjs`, never `dqkExplore.ts`, even though `dqkExplore.ts` already existed (created 8 days
> earlier, commit `5e49e28`, "C1") and already used the identical `Explorer` class.

## Headline finding

### `Explorer.forward()`/`backward()` — the ONE shared, engine-neutral movement primitive both of this engine's real dungeon-exploration hosts call on every real player move — computes a real, non-zero, decompile-verified per-step game-time cost (`StepResult.timeMinutes`, 1 normal / 10 careful) that CoK/DoK's `explore.ts` already accumulates into a real, tested game clock (day/hour/minute, moon phases, rest healing, spell-learn timers) — but DQK's structurally-parallel sibling `dqkExplore.ts`, which drives the exact same class on every one of its own real per-step moves, never reads this field at all: `DqkState` has no clock field, no commit has ever touched the word "clock" in this file, and the game's own decompiled engine (per this project's own COAB cross-checks) confirms the mechanic is not CoK/DoK-specific — it is identical across all three Krynn games, including DQK itself

## The real, decoded/computed fact: `StepResult.timeMinutes`, decompile-grounded, identical across all three Krynn games

`packages/engine/src/world/explorer.ts:40-51`:

```ts
export interface StepResult {
  moved: boolean;
  blocked?: BlockReason;
  pose: Pose;
  event: number;
  /**
   * In-game minutes this step cost: 0 if blocked, 1 for a normal step, 10 for a
   * careful/search step (ovr015 `step_game_time(search_flags&1 ? 2 : 1, 1)`). The caller
   * advances `gameClock` by this (see `stepGameTime`).
   */
  timeMinutes: number;
}

/** Minutes a normal step costs (ovr015 / ovr021 slot-1 = minute). */
export const STEP_MINUTES_NORMAL = 1;
/** Minutes a careful/search step costs (ovr015 / ovr021 slot-2 = 10-minute unit). */
export const STEP_MINUTES_CAREFUL = 10;
```

`explorer.ts:166-183` (private `step()`, the single implementation `forward()`/`backward()`/
`stepLeft()`/`stepRight()` all funnel through, `explorer.ts:224-238`) sets `timeMinutes` to
`STEP_MINUTES_CAREFUL` or `STEP_MINUTES_NORMAL` on every successful move, `0` on a blocked one.

**This is a real, decompile-verified, cross-generation mechanic, not an engine invention:**
`docs/engine/research/decompile-ovr015-movement.md:31-33` (the primary COAB source for this exact
subsystem): *"Game-time cost: a normal step advances the clock by 1 unit; when the area's
`search_flags & 1` is set (careful/searching movement) it advances by 2 — the
`step_game_time(amount, 1)` call (ovr021)."* And the same doc's own cross-generation section
(`decompile-ovr015-movement.md:65-69`): **"Movement model is identical across CoK/DoK/DQK (16×16
wrap, 8-direction deltas). DQK relocates the code into its overlay tail; the GEO cell `x3` door-bit
layout is shared (the GEO format is common to the trilogy per `loaders/geo.ts`)."** The companion
research doc for the clock itself, `docs/engine/research/decompile-ovr021-time-learning.md:103-107`,
states the same thing from the other side: **"The clock radices, affect-minute model, rest-heal
cadence, and N×3 learn timer are identical across CoK/DoK/DQK... DQK (Gen2) relocates ovr021 into its
overlay tail and the area-record clock base offset differs (Gen2 layout), but the time model is
engine-generation-independent."** Both source docs agree: this is DQK's own real, original mechanic,
not something borrowed from CoK/DoK for parity's sake.

## The real, already-implemented, already-tested, already-shipped consumer — for ONE of the two real hosts

`packages/engine/src/world/gameClock.ts` (added by commit `1551717`, see "deliberateness" below) is a
real, pure, fully-tested module: `timeFromMinutes`, `gameDayFromMinutes`, `formatTimeOfDay`,
`formatGameTime`, the 7-slot mixed-radix `calendarFromClock`/`stepGameTime`/`normalizeClock`, party
aging on year rollover, natural rest healing, and rest-time spell-learning timers — all unit-tested
in isolation, `packages/engine/test/gameClockCalendar.test.ts:33-106` (calendar carry/round-trip,
`step_game_time` slot semantics, year-rollover aging), with hand-built literals (`normalizeClock([0,
65, 0, 0, 0, 0, 0])`, `stepGameTime(newClock(), SLOT_MINUTE, 1)`), matching this loop's recurring
"isolated-tested mechanism" shape.

`apps/web/src/ui/explore.ts:1092-1129` (`applyMove`, CoK/DoK's real, shipped `?explore=1`/
`?explore=dok` handler, current source, full):

```ts
function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  const ex = state.explorer;
  let res: StepResult | null = null;
  state.lastBlocked = undefined;
  switch (action) {
    case 'forward': {
      const dir = ex.getPose().facing;
      if ((ex.currentCell().doors?.[dir] ?? 0) !== 0 && !ex.isDoorOpen(dir)) ex.openDoor(dir);
      res = ex.forward();
      break;
    }
    case 'back': {
      const dir = OPPOSITE_DIR[ex.getPose().facing];
      if ((ex.currentCell().doors?.[dir] ?? 0) !== 0 && !ex.isDoorOpen(dir)) ex.openDoor(dir);
      res = ex.backward();
      break;
    }
    case 'left': ex.turnLeft(); break;
    case 'right': ex.turnRight(); break;
  }
  if (res?.moved) {
    // Advance the game clock by the step cost (1 normal / 10 careful) and walk the moons on rollover.
    const prevDay = gameDay();
    state.clockMinutes += res.timeMinutes;
    if (gameDay() !== prevDay) renderMoons();
    stepDispatcher?.playEvent('step');
    stepCount++;
  } else if (res?.blocked) {
    state.lastBlocked = res.blocked;
  }
  draw();
  return ex.getPose();
}
```

`ExploreState.clockMinutes: number` (`explore.ts:277`) is the accumulator; it seeds at `6 * 60`
(`explore.ts:1728`, 6am) and is read by `formatGameTime`/`formatTimeOfDay`/`calendarFromClock`
throughout the file (status bar, CAMP screen, save/load round-trip at `explore.ts:960`) and by the
`__explore` e2e seam (`explore.ts:1806-1810`: `clockMinutes()`, `clock()`, `calendar()`). This is a
real, live, player-visible mechanic — CoK/DoK's status line genuinely shows the clock advancing as
the party walks, and a long Rest visibly walks the day counter and the three-moons reading forward
(`m47-audit.md:321`, `m62-audit.md:64-65,129,292`, both already confirming this exact machinery is
fully wired end-to-end for this one host).

## Where the severance happens: `dqkExplore.ts`'s structurally-identical `applyMove()` never reads `res.timeMinutes` at all

`apps/web/src/ui/dqkExplore.ts:336-352` (`applyMove`, DQK's real, shipped `?dqk=1` handler, current
source, full):

```ts
function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  const ex = state.explorer;
  let res: StepResult | null = null;
  state.lastBlocked = undefined;
  if (action === 'forward') { res = ex.forward(); }
  else if (action === 'back') { res = ex.backward(); }
  else if (action === 'left') ex.turnLeft(); else ex.turnRight();
  const moved = res?.moved ?? false;
  if (!moved && res?.blocked) state.lastBlocked = res.blocked;
  draw();
  runStepEvent(); // C4.1 — fire the cell's Gen2 SearchLocation event on each move
  if (moved) stepDispatcher?.playEvent('step');
  return ex.getPose();
}
```

Same function name, same `MoveAction` shape, same shared `Explorer`/`StepResult` types (both files
import `Explorer`/`StepResult` from `@goldbox/engine`), same two fields actually read off `res`
(`.moved`, `.blocked`) — but `res.timeMinutes` is never referenced anywhere in this function, or
anywhere else in the file: `grep -n "timeMinutes" apps/web/src/ui/dqkExplore.ts` → **zero hits**.

`DqkState` (`dqkExplore.ts:185-222`) — the file's entire state shape — has no `clockMinutes` (or any
clock/calendar/day) field at all; confirmed exhaustively: `grep -n "clock\|Clock\|calendar\|Calendar\|
gameDay\|moonPhase" apps/web/src/ui/dqkExplore.ts` → **zero hits** for the whole file. The
`window.__dqk` e2e seam (`dqkExplore.ts:1246-1246+`) mirrors this: it has `getPose`, `move`,
`blocked` (M72's fix), `partyStrength` (M82's fix, already shipped as `dqkPartyStrengthEstimate()`,
`dqkExplore.ts:1306`) — but no `clockMinutes`/`clock`/`calendar` getter, unlike `explore.ts`'s
equivalent seam (`explore.ts:1806-1810`).

## Why this is not "the same as M63/M72/M81's" — a fresh, narrower angle

This is the third round to touch this specific corner of the engine, so the distinction matters:

- **`m63-audit.md:358`** investigated *"dqkExplore.ts gaining a day/clock/moon system to match
  explore.ts/wilderness.ts"* and declined it: *"this isn't a display gap, it's an entire missing
  subsystem (DQK's own game clock has never been modelled). Far bigger than a same-day wiring slice;
  not pursued."* That framing evaluated full parity — calendar display, moon-bar widget, Rest/Camp UI
  — as one unit. This round's finding is narrower: it is not a proposal to build calendar/rest/moon UI
  for DQK (DQK's exploration screen has no Rest/Camp feature at all to hook natural healing or
  spell-learn timers into — confirmed by grep, `grep -n "rest\|camp\|Rest\|Camp" apps/web/src/ui/
  dqkExplore.ts` finds no camping mechanic, only unrelated substring matches like "restoreAutomap"),
  and this round does **not** propose adding one. The narrower claim is that ONE already-computed
  scalar (`res.timeMinutes`) that a sibling function already accumulates with a single line is
  silently dropped by this file's own `applyMove()` — the same "one more line, mirroring an existing
  precedent" shape as M81's/M84's fixes, not "build a subsystem."
- **`m81-audit.md:443`** re-confirmed, in a one-line aside while investigating a different question,
  that *"DQK's missing rest UI"* is *"weak"* as a candidate — a passing dismissal of the same
  subsystem-level framing M63 already covered, not a re-investigation of the narrower field-level
  question this round asks.
- **`m72-audit.md`** dissected this EXACT pair of functions (`explore.ts`'s and `dqkExplore.ts`'s
  `applyMove()`) field-by-field for `StepResult.blocked` — and found (and this loop confirmed, via
  `git show 1551717`/subsequent commits, is now fixed) that both siblings read `.blocked` today. M72
  explicitly did not examine `.timeMinutes` as a separate finding — it appears only in M72's quoted
  code blocks, in service of the `.blocked` argument, never discussed on its own terms. `grep -rn
  "timeMinutes" docs/engine/research/m*-audit.md` confirms only `m72-audit.md` mentions the string at
  all, and only in that supporting-quote capacity.
- **`m82-audit.md`** dissected the SAME `dqkExplore.ts` file (a different function, `fireSearchLocation`,
  called from the same `applyMove`'s `runStepEvent()`) for `partyStrength` — confirming this file has
  now been individually re-mined for two OTHER dropped fields since M63's broad rejection (`.blocked` by
  M72, `.partyStrength` by M82, both now fixed — the `dqkPartyStrengthEstimate()` getter is live at
  `dqkExplore.ts:1306`, tagged "M82.S1" in its own comment). `.timeMinutes` is the one field of
  `StepResult` still unread by this file, after two rounds of exactly this kind of incremental,
  single-field wiring already landed on it.

## Was this a deliberate design decision? — `git log -S`/`git show` evidence

`git log --oneline -S "timeMinutes" -- packages/engine/src/world/explorer.ts` → one commit,
`1551717` ("engine: implement 7 decompile engine-gaps..."), 2026-06-30 20:29 — this is the commit
that introduced the field (and `STEP_MINUTES_CAREFUL`/`STEP_MINUTES_NORMAL`) in the first place;
`git show 1551717 --stat` confirms it touched only `packages/engine/*` files — no `apps/web` file at
all, so it could not have wired either UI host.

`git log --oneline -S "clockMinutes += res.timeMinutes" -- apps/web/src/ui/explore.ts` → one commit,
`c67a98d` ("web: wire explore movement/doors/sky + rest/calendar/aging/spell-learn into UI"),
**2026-06-30 21:28 — one hour after `1551717`**, explicitly the dedicated UI-wiring follow-up
("Batch 2 of the decompile-gap UI wiring... Two ultracode lanes that both edit
apps/web/src/ui/explore.ts"). `git show c67a98d --stat`:

```
apps/web/src/ui/explore.ts | 185 +++++++++++++++++++++++++++++++++++++-----
apps/web/src/ui/magic.ts   |   5 ++
apps/web/src/ui/party.ts   | 194 +++++++++++++++++++++++++++++++++++++++++++++
apps/web/test/e2e.mjs      |  12 ++-
4 files changed, 375 insertions(+), 21 deletions(-)
```

**`apps/web/src/ui/dqkExplore.ts` is not in this list at all** — despite already existing at the time
(created 2026-06-22 by commit `5e49e28`, "C1 — DQK Gen2/HLIB boot + GEO map decode," 8 days earlier)
and already constructing `Explorer`/consuming `StepResult` for its own real per-step dispatch.
`git log --oneline -S "STEP_MINUTES\|timeMinutes" -- apps/web/src/ui/dqkExplore.ts` → **zero commits**
— this file has never, at any point in its history, been touched with respect to this field, in
either direction. `grep -n "TODO\|FIXME" apps/web/src/ui/dqkExplore.ts` → zero hits — no in-code
marker flags this as a known, deferred gap, matching M84's own "silent omission, not a flagged
follow-up" finding for `TacticalSpell.priority`.

**Conclusion: this is a scoping gap in the UI-wiring follow-up commit, not a deliberate choice.**
`c67a98d`'s own commit message frames its scope as "explore movement/doors/sky" and
"rest/calendar/aging/spell-learn" — both headings describing CoK/DoK's `explore.ts` specifically, with
no mention of DQK or `dqkExplore.ts` at all, positive or negative. This reads as: the commit's author
was wiring the *engine's* new ovr015/ovr021 mechanisms into the *one* UI host they were actively working
on that hour, and the second, structurally-parallel host simply wasn't in scope for that pass — not
that anyone decided DQK's clock should stay unmodelled.

## Reachable in real, ordinary, shipped play — traced end to end, dynamically verified against real DQK bytes

1. **A real player reaches `dqkExplore.ts` via the shipped `?dqk=1` route** — confirmed a real,
   ordinary top-level route: `apps/web/src/ui/main.ts:921-922` (`params.get('dqk') !== null`), reached
   from at least three real in-app navigation points (`main.ts:589,710,872`, each doing
   `history.replaceState(null, '', '?dqk=1')` from a menu/library action) — not a hidden debug flag.
2. **Every real forward/back move calls `Explorer.forward()`/`.backward()`**, which computes a real,
   non-zero `timeMinutes` (1 or 10) on every successful step — verified this round with REAL DQK game
   data, not a synthetic fixture (see "Verification evidence" below): the real
   `The Dark Queen of Krynn/DISK3/GEO.GLB` archive, decoded through the exact production
   `decodeHlib`/`decodeGen2GeoArchive` pipeline `dqkExplore.ts:402-406` itself uses, yields real,
   walkable cells where `Explorer.forward()` returns `timeMinutes: 1` (normal) / `10` (careful).
3. **`dqkExplore.ts`'s `applyMove()` receives this exact `StepResult` and discards `.timeMinutes`
   unconditionally** — traced above, confirmed by direct source reading (not inference): the only two
   fields ever read off `res` in this function are `.moved` and `.blocked`.
4. **The consequence is total, not partial: DQK sessions carry no notion of elapsed time at all.**
   `DqkState` has no clock field to even be wrong or approximate — it is simply absent. A player who
   walks 500 careful steps through Dargaard Keep and a player who walks 500 normal steps have
   identically absent "elapsed time" state; the status line (`dqkExplore.ts:328`, `Dark Queen of Krynn
   — {map.name} ({w}×{h}) · ({x},{y}) facing {facing}`) never shows a clock, unlike `explore.ts`'s
   equivalent (`formatTimeOfDay`/`formatGameTime`, threaded through the CAMP status line at
   `explore.ts:869-870`).
5. **This is not a hypothetical parity nice-to-have — it is DQK's own documented, original mechanic,
   never modelled for DQK at all**, per the two cross-generation-verified COAB research docs quoted
   above (`decompile-ovr015-movement.md`, `decompile-ovr021-time-learning.md`), both explicit that the
   step-cost-and-clock-advance mechanic is engine-generation-independent, not a CoK/DoK-only feature
   ported over for cosmetic consistency.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m85_verify.test.ts` (created, run — **1/1 passing** — then deleted;
`git status --porcelain` confirmed clean both before and after, this doc the only untracked file):

Decoded the real `The Dark Queen of Krynn/DISK3/GEO.GLB` archive via the exact production functions
`decodeHlib`/`decodeGen2GeoArchive` (not a fixture), scanned every real cell of every real decoded
DQK dungeon map for an open, in-bounds direction, and ran the real, unmodified `Explorer` class
against it:

- `Explorer.forward()` on a real DQK cell/direction that actually moves returns
  `timeMinutes === STEP_MINUTES_NORMAL` (1) — confirmed by direct assertion.
- The same cell/direction with `setCareful(true)` first returns `timeMinutes === STEP_MINUTES_CAREFUL`
  (10) — confirmed by direct assertion.

This proves the "fact is real" half of this finding with real DQK bytes (not just
`explorer.test.ts`'s hand-authored 3×3 synthetic room, `packages/engine/test/explorer.test.ts:15-30`)
— DQK's own shipped dungeon data really does produce this real, non-zero, game-time cost on every
step, the exact value `dqkExplore.ts`'s `applyMove()` silently discards. The "severance" half (that
`dqkExplore.ts` never reads it) is established by direct source reading, per the citations above —
this is deterministic, non-ECL UI code with no VM guard-semantics ambiguity to re-check dynamically
the way M82/M83 had to for ECL-VM findings.

Full `packages/engine` suite: **134 files / 1359 tests** with the scratch file absent (this round's
baseline — up from M84's own stated 134/1358, consistent with M82's `partyStrength` fix having since
shipped, tagged "M82.S1" in `dqkExplore.ts:1303-1306`) and **135 files / 1360 tests** with the scratch
file present, both green, via `cd packages/engine && npx vitest run`. Scratch file then deleted;
`git status --porcelain` confirmed the working tree clean except this doc.

## Wiring plan (proposed, not applied this round) — deliberately scoped to the numeric fact only

**Minimal, additive change, entirely inside `apps/web/src/ui/dqkExplore.ts`**, mirroring
`explore.ts`'s own exact precedent (the same file this round's finding contrasts against):

```ts
// sketch, not applied this round — apps/web/src/ui/dqkExplore.ts

interface DqkState {
  // ...existing fields...
  /** NEW — mirrors ExploreState.clockMinutes (explore.ts:277): accumulated in-game minutes since
   * the session's epoch, fed by Explorer.forward()/backward()'s real StepResult.timeMinutes
   * (ovr015/ovr021 — see decompile-ovr015-movement.md/decompile-ovr021-time-learning.md, both
   * confirming this mechanic is engine-generation-independent, i.e. real for DQK too). */
  clockMinutes: number;
}

function applyMove(action: MoveAction): Pose {
  // ...unchanged...
  const moved = res?.moved ?? false;
  if (moved && state) state.clockMinutes += res!.timeMinutes; // NEW — one line, mirrors explore.ts:1119
  if (!moved && res?.blocked) state.lastBlocked = res.blocked;
  // ...unchanged...
}
```

Plus a `clockMinutes`/`clock` getter on the `__dqk` seam (mirroring `explore.ts:1806-1807`) so this is
independently testable the same way `.blocked()`/`.partyStrength()` already are.

**This is deliberately scoped to the accumulation only — NOT a proposal to build calendar/rest/moon
UI for DQK**, matching M63's own valid concern about a same-day slice being too large: DQK's
exploration screen has no Rest/Camp menu today, so there is no real call site yet for natural rest
healing or the spell-learn timer to hook into (building that IS the larger subsystem M63 correctly
declined). The accumulation alone is safe and immediately useful on its own terms: it makes
`formatGameTime`/`calendarFromClock` — both already real, tested, and used elsewhere in this engine —
usable for DQK for the first time, and is a strict prerequisite for any future round that DOES want to
add DQK Rest/Camp (this round does not attempt that).

**This is safe** because: (a) `clockMinutes` is a new field with no existing reader to disturb;
(b) it does not touch `Explorer`/`gameClock.ts` (both already correct and untouched); (c) every
existing DQK e2e assertion (`apps/web/test/e2e.mjs:1885-2030`-ish, the `explore-dqk` block) asserts
`getPose()`/`blocked()`/`partyStrength()` and similar, never anything clock-shaped, so nothing needs
updating for the new field to appear; (d) it mirrors an already-shipped, already-tested precedent
line-for-line, not new plumbing.

**Test to add** (beyond this round's scratch, which was deleted): an `apps/web` e2e assertion that
`window.__dqk.clockMinutes()` (once added) increases by 1 after a normal forward move and by 10 after
a careful one — the direct DQK-side mirror of `explore.ts`'s own existing clock assertions.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Building the full DQK Rest/Camp/calendar/moon-phase UI in the same slice as the clock accumulation | This is exactly what M63 already correctly declined as too large for one round — re-confirmed this round: DQK's exploration screen has zero Rest/Camp entry point today (`grep -n "rest\|camp\|Rest\|Camp"` finds none beyond unrelated substrings), so wiring natural healing/spell-learn timers would mean designing a new menu, not adding one line. This round's fix is deliberately narrower — see "Wiring plan." |
| `combat/deploy.ts` (`deployCombatants`, ovr011) as this round's headline | Checked per M84's own instruction to sweep `1551717`'s other delta items: `deployCombatants` is called from `apps/web/src/ui/combat.ts:429` (`packages/engine/src/index.ts:560`/`combat.ts:196` re-export), a real, live production call site in the shared interactive combat screen used by CoK/DoK/DQK alike — no starved caller found; not pursued further. |
| `audio/soundDispatch.ts` (`SoundDispatcher`, seg044) as this round's headline | Checked similarly: `apps/web/src/ui/combat.ts:89,614,621,633,649,655` instantiates and calls `soundDispatcher.playEvent(...)` for real combat events (hit/miss/death/magic_hit) — a real, live production consumer; not pursued further. |
| `save/` import field-map (ovr017/018) as this round's headline | Grep shows `apps/web/src/ui/importParty.ts` and `main.ts` both reference the save/import roster machinery; a full re-audit of every one of `save/character.ts`/`import.ts`/`roster.ts`'s individual fields against `importParty.ts`'s actual call shape was not attempted this round (would be its own full pass) — flagged as a standing candidate below, not ruled out, just not this round's pick once the gameClock/explorer angle proved out. |
| `render/sky.ts` (ovr028-030) as a second, combined headline alongside the clock gap | `dqkExplore.ts` also never imports `sky.ts` at all (`grep -n "sky\|Sky"` → zero hits) — DQK's first-person view has no time-of-day sky backdrop either, a second real consequence of the same "DQK never got the ovr021 UI-wiring pass" root cause. Noted as a related, downstream-of-the-same-cause gap in "Implications," but not folded into this round's headline to keep the fix (and this doc) focused on one field — bundling two separate rendering subsystems (clock accumulation + sky backdrop wiring) into one "minimal, additive" fix would no longer be minimal. |
| Treating this as a rediscovery of M63's or M72's findings | Considered in depth per requirement #1 (see "Why this is not the same as M63/M72/M81's" above) — concluded this is a fresh, narrower finding: M63 evaluated and declined an entire subsystem; M72 examined the identical function pair for a *different* field (`.blocked`, since fixed); M81 gave the subsystem-level framing a one-line "weak" dismissal without re-deriving the narrower field-level question. No prior audit doc's headline names `StepResult.timeMinutes` in a `dqkExplore.ts` context (confirmed by grep: only `m72-audit.md` mentions the string at all, purely as supporting-quote for its own, different finding). |

## Open questions / unknowns

- **Should `dqkExplore.ts` seed `clockMinutes` at `6 * 60` (matching `explore.ts`'s dawn-start
  convention) or `0`?** Not decided this round — either is a reasonable, arbitrary epoch choice; the
  original engine's true DQK campaign start time is not established by any research doc read this
  round.
- **Once DQK gains a working clock, should its status line show it (mirroring CoK/DoK's CAMP line),
  or should this stay a headless accumulator until a future round adds a Rest/Camp menu?** Left open;
  the minimal fix proposed above only needs the accumulator and an e2e-visible getter, not a status-
  line change, to be verifiably correct.
- **DQK's missing `sky.ts` (time-of-day dungeon backdrop) wiring** — a second, related consequence of
  the same root cause (the ovr021/ovr028-030 UI-wiring pass never touched `dqkExplore.ts`) — flagged as
  a natural follow-up once a real clock value exists to feed `selectSkyColour`'s `hour` parameter, but
  explicitly not this round's fix (see "Rejected alternatives").
- **A full field-by-field audit of `save/character.ts`/`import.ts`/`roster.ts` (ovr017/018) against
  `importParty.ts`'s real call shape** — not attempted this round; flagged as the one delta item of
  commit `1551717` this round did not fully clear (deploy.ts and soundDispatch.ts were spot-checked and
  found to have real callers; save/import's individual fields were not exhaustively re-verified).
- Standing backlog, re-confirmed untouched this round (carried forward verbatim from M84, condensed):
  the rejected ECL `resume()`/`combatOutcome` lead (M83, unreachable in DQK's real areas 2/3) +
  `hasScribed`/`getSpellbook` gating Memorize (needs a spellbook-seeding design decision) +
  `TacticalCombatant`'s other five ability scores (no consumer) + `AuthoredMonster`'s Int gap (no
  caller) + `surrendered`'s distinct marker (open team-preference question) + the guarding-bar 5th
  signal + the feared/asleep colour tier + `panelRows()`/`visibleCells()`'s duplicated `impaired` check
  (DRY cleanup) + DoK's Saves column (declined M62) + BASE_ITEMS' thin catalogue + DoK's xp/hitPoints
  byte-fields + DoK's runItemPluses e2e follow-up + the Class-label collision (42+ rounds unpicked) +
  dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/`SaveSummary` +
  `DetectionMatch.series`/`.ruleset`/`.engineGen` + flat AC-10 CoK pregens + the wilderness moon-bar +
  the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con
  Save/Save Roll merge + `conSaveBonus` on DoK monsters (fully wired, not a gap) + `DexterityMods.reaction`
  + the `DokEffect`/`.EFF` crosswalk (its `minutes` field is display-only, `charEditor.ts:369`, see
  "Rejected — a related dead end" note below) + CoK's missing `.STF`/`.SFX` crosswalk + DRYDEN's
  Solamnic Plate Mail gap + `create.ts`'s preview-echo gaps + the Status row's duration/HD-cap +
  `itemCategory()`'s INFLICT preview + `MonsterWizSpell.learning` + the `hasted` positive-buff
  indicator + `addToParty()`'s rejection-reason UX gap + case-folding for the name check + the bigger
  `addPlayer()`-reuse option + the missed-backstab wording/SFX/colour follow-ups + `createCharacter()`'s
  permanently-unreachable import-path warnings + the "can't escape ⇒ flee regardless of Int" morale
  gate + `SURPRISE`(0x23) unimplemented ECL opcode + the best party-strength proxy formula refinement
  (now shipped as `dqkPartyStrengthEstimate()`, M82.S1 — a specific heuristic choice remains open) +
  whether `RunChainOptions` (Gen1) should be widened for type-consistency (confirmed inert either way).
  Item-instance subsystem still 31-for-31 blocked. ECL-ally morale% remains RETIRED (M61).
  `classFlags.ts`'s dual-class item-gating remains correctly dead. `combat.ts`/`combatStepper.ts`'s
  positionless engine remains dead code. `render/combatScreen.ts` (a separate sky-capable combat
  renderer) noted this round as having **zero consumers anywhere in `apps/web/src`** (`grep -rln
  "combatScreen" apps/web/src` → none) — a fresh, unpicked dead-code observation, not investigated
  further this round.

**A related dead end investigated and explicitly rejected this round:** `world/gameClock.ts`'s
`tickAffects()` (`CheckAffectsTimingOut`, the affect-duration countdown) has **zero production callers
anywhere** (`grep -rn "tickAffects" apps/web/src` → none) — a stronger gap than "starved of real data"
(there is no real call site at all, not even an under-fed one). The one real byte-decoded fact shaped
like its `TimedAffect` input — DoK's real `.EFF` active-effect records, `DokEffect.minutes`
(`packages/engine/src/loaders/dokSavedCharacter.ts:116-117`) — reaches exactly one place,
`apps/web/src/ui/charEditor.ts:369` (`` `type ${e.type} · ${e.minutes === 0 ? 'permanent' : `${e.minutes}min`}` ``),
a static, read-only character-file viewer (`?charEditor=1`-style standalone tool) that never imports
or calls `tickAffects` — it just prints the raw stored value once, with no live ticking. Rejected as
this round's headline because it does not meet the loop's "has a real mechanical consumer somewhere"
bar in the same way the clock-accumulation gap does — there is no real, shipped call site (starved or
otherwise) for `tickAffects` at all, matching the `thiefSkills`/`AuthoredMonster` shape M81 already
ruled out of scope ("no real consumer exists yet at all... does not qualify under this loop's
mandate"). Flagged as a standing candidate only if a future round ever wires DoK `.EFF` import into
live party state (it currently is not — `grep -n "\.JNK\|\.EFF" apps/web/src/ui/importParty.ts` → no
hits), not pursued further here.

## Implications for our engine

- **Commit `1551717`'s "7 decompile engine-gaps" and its dedicated UI-wiring follow-up `c67a98d`
  (one hour later, same evening) are a matched pair — and the follow-up's own scope note
  ("explore movement/doors/sky", "rest/calendar/aging/spell-learn") describes CoK/DoK's `explore.ts`
  by name, silently leaving its structurally-identical Gen2 sibling untouched.** This is a *third*
  distinct sub-shape of the same root cause M81/M84 already found twice in `1551717` itself: M81 found
  a field the origin commit itself never threaded through a shared constructor; M84 found a field the
  origin commit shipped with no populated table; this round finds that the origin commit's own
  **dedicated same-evening UI-wiring companion commit** wired its new engine mechanism into exactly one
  of two structurally-parallel real hosts, leaving the other a byte-for-byte identical gap with no
  in-code marker at all. A single evening's "engine gap, then UI wiring" pair is worth checking against
  *every* real host the engine mechanism could apply to, not just the one the wiring commit happened to
  touch that session.
- **A function that has already been incrementally re-wired by two prior rounds for two other fields
  on the same return type (`m72`'s `.blocked`, `m82`'s `.partyStrength`, both on `dqkExplore.ts`'s
  `applyMove()`/`fireSearchLocation()`) is not thereby "done" — it is evidence the function is a known,
  repeatedly-productive seam for exactly this kind of one-field, minimal-additive fix.** Any function
  visited twice already by this loop for "one more field of a shared struct" is worth checking for a
  third, rather than assuming two passes exhausted it.
- **A broad, correctly-declined "build the whole subsystem" rejection (M63) does not retire the
  narrower question of whether one already-computed scalar within that subsystem is separately, cheaply
  wireable.** M63's own words ("far bigger than a same-day wiring slice") were accurate for the full
  calendar/rest/moon-bar ask it evaluated, and remain accurate today — but the minimal accumulation
  step this round proposes is a genuinely different, much smaller unit of work that the broad rejection
  never separately considered. This is a fresh variant of M83's "a rejection's premise can expire
  silently" lesson: here the premise didn't expire over time, it was *never separately evaluated* at
  the narrower grain in the first place, because the broad framing subsumed it.
