# Pools of Darkness Natural Encounter Route — genuinely blocked, held back (2026-07-21)

> **Superseded 2026-07-29.** Pools' own `GAME.OVR` proves that `LOAD_FILES` takes two
> operands and opcode `0x37` is a separate two-operand party-name lookup. With the corrected
> title-specific dialect, the apparent nonlocal GOTO below disappears and retail GEO1#69 cell
> `(8,6)` naturally reaches ECL1#72's four-group Drow combat. Preserve this file as the history of
> the disproven decoder-drift diagnosis; use
> [`pools-ecl69-72-natural-route-2026-07-29.md`](pools-ecl69-72-natural-route-2026-07-29.md)
> for the current result and claim boundary.

> **Status: 2026-07-21 — investigated and honestly held back.** Unlike Treasures'
> `treasures-natural` route (proven the same session, see `treasures-natural-route.md`), no
> `search_location`-triggered Pools of Darkness combat candidate could be reached from a real
> placed GEO cell descriptor through the production `dialogueForCell`/`runStepEvent` call
> shape. **No new `GameId`/`GameData` route was wired.** This matches the project's
> "UNLOCATED beats invention" ethic and the existing Gateway precedent (`?explore=gateway`'s
> own doc note: "combat is held back pending its distinct monster tail") — real research is
> recorded here rather than shipping a synthetic or unproven encounter.

## What was tried

`tools/gen1_ecl_encounter_scan.py`'s static CFG scanner already used the correct plain
`'gen1-short'` word-set dialect for `pools-of-darkness` (unlike Treasures, no dialect-drift bug
was found here). The corpus scan (`build/gen1-ecl-encounters.json`) finds **70 candidates / 36
rostered** across Pools' `ECL1.DAX`. Filtering to fully-immediate-roster `search_location`
candidates leaves 18 across blocks 19, 20, 21, 33, 35, 48, 64, 68, 70, 74 — every one with a
real, named, sanely-statted `MON1CHA.DAX` roster (CLOUD GIANT, FIRE GIANT, WHITE/GREEN/BLACK/RED
DRAGON, DROW PRIEST/SORCEROR/SORCERESS, CADORNA, DARK LORD, EVIL CHAMPION — genuine Pools of
Darkness lore, not junk decode output; see `_scratch_pools_survey.mts`'s own printed stat table,
AC -4..10, THAC0 4..19, all in-range).

For each of the 9 blocks with a paired `GEO1.DAX` map (block 74 has ECL but no GEO — dead end),
every DISTINCT floor byte actually placed on that block's real map was driven through
`dialogueForCell(eclBlock, floor, { memory: new Map(), facing: 'north', dialect: ECL_GEN1_SHORT
})` — the exact production call shape `runStepEvent` uses on every step. **Zero of the ~300
distinct (block, floor-byte) pairs sampled across all 9 areas produced a `combat` turn** — every
one resolved to `'end'` immediately. This directly mirrors the method that worked for Treasures
(§4 of that doc): there, the real trigger descriptor (0xFF) genuinely existed as placed GEO data;
here, no placed floor byte anywhere in these 9 areas' own maps reaches any of the 18 statically-
found combat candidates.

## A second lead investigated: `initial_entry`-triggered combat (block 72)

One candidate stood out structurally: `ECL1.DAX` block 72's `initial_entry` handler (the same
header slot `eclInitBlock` boots — i.e. the encounter would fire on AREA LOAD, not on a specific
per-cell descriptor) reaches a 4-monster-group COMBAT (DROW PRIEST ×8, DROW SORCERESS ×4, two
more groups) after only 2 static branch decisions — the simplest candidate found.

Running the real `EclVm` directly from this block's own `initial_entry` offset (not the static
scanner) produced genuine, rich, in-character Pools of Darkness narration —

> "THIS ROOM IS HEAVILY GUARDED. SLAVES ARE HELD IN PENS PATROLLED BY A PET OF KALISTES."
> ... "ONE GUARD SHAKES HIS HEAD. 'KALISTES NEEDS TO FATTEN THEM UP BEFORE HER CHILDREN WILL
> EVEN TOUCH THEM.'" ... "ANOTHER SHRUGS. 'WHAT WOULD THEY EAT IN THE WEB? DRIDERS?'"

— genuinely real content (Kalistes is a canonical Pools of Darkness drider-queen villain), proving
this block is real, in-context retail data. But under a fresh/default `partyStrength: 0` state the
live VM took a **different branch than the static scanner assumed** (a `PARTYSTRENGTH` check the
scanner's model didn't reproduce) and issued a `NEWECL` chain into block 69 instead of reaching
COMBAT. Following that chain (`runEclChain(72, source, { dialect: ECL_GEN1_SHORT, maxBlocks: 16
})`) produced more real narration —

> "A CORRIDOR LEADS TO A DOOR WHERE DROW STAND, DRESSED IN CEREMONIAL ROBES. THEY SPEAK IN
> VOICES TOO FAINT TO DECIPHER."

— then hit an `unhandled GOTO(nonlocal)` and the chain exited without ever reaching combat. This
is a genuine unresolved-instruction dead end at this depth, not a scanner artifact: the live VM
ran further than the static scanner's assumed path and diverged from it.

Separately, even if this branch problem were resolved, `initial_entry`-triggered combat is not a
mechanism the current explore-boot code path (`loadDungeon`, `apps/web/src/ui/explore.ts`)
surfaces at all: `loadDungeon` calls `vm.run()` once to extract `LOAD_FILES`/`LOAD_PIECES`/
`ADD_NPC` effects and discards everything else, including a live `'combat'`-status pause — the VM
instance itself isn't even returned to the caller, so there is no way to resume a mid-script fight
that occurs during area boot with the engine's current plumbing. Wiring this would be new,
unproven engine capability (how would the REAL retail engine actually present a fight that starts
before the player has taken a single step? no other shipped Gen1 title does this), not a minimal
additive change like Treasures' `cellDescAddr`/`startPose` — so it was not attempted this round.

## Why this is a genuine, not a lazy, stop

- Every one of the 18 fully-immediate-roster candidates carries `requires_runtime_seed: true` in
  the scanner's own output (same as Treasures' winning candidate) — that field alone does not
  predict reachability; the empirical per-floor-byte sweep is what actually distinguishes them,
  and it came back negative across every sampled area.
- The monster rosters are real, named, and sanely statted — this is not a "the data doesn't
  decode" gap, it is a "the trigger condition isn't a placed GEO descriptor the way every other
  proven Gen1 route's trigger is" gap. These encounters most likely depend on quest-flag / party-
  state variables set by earlier plot progression (a fresh/synthetic boot has no way to supply),
  or are genuine wandering-monster rolls gated behind `vm_run_1`'s per-step RNG rather than a
  fixed cell — neither of which this session's tooling can drive without inventing state.
- The `initial_entry` lead is real, in-character, byte-verified content — but proving it end-to-end
  would require BOTH resolving a genuinely unhandled non-local GOTO AND a nontrivial new engine
  capability (surfacing a combat pause that occurs during area boot, before any step). Both are
  legitimate future work items, not something to force through with a workaround this round.

## What would unblock this

1. Resolve the `initial_entry` block-72 → block-69 chain's `GOTO(nonlocal)` handling in `EclVm` —
   likely needs the same kind of live DOSBox-X cross-check the DoK `0x79` GOTO investigation used
   (`dok-natural-route.md`'s "2026-07-17/18" updates), given `PARTYSTRENGTH`-gated branches are
   exactly the pattern that investigation resolved for DoK.
2. If (1) resolves to a real COMBAT, decide how "combat during area boot" should surface through
   `loadDungeon`/`explore.ts` — a new, deliberate engine capability, not a one-off hack.
3. Alternatively, investigate whether any of the 18 `search_location` candidates' trigger
   descriptors are placed on a DIFFERENT block's GEO map than the one paired by block id (Gateway/
   Treasures/Pools sometimes reuse rooms across areas) — not attempted this round due to time.

## No production code changed for this title

`apps/web/src/ui/gameData.ts`'s `GameId` union and `GAME_DATA` map contain **no** `pools-natural`
entry; `apps/web/src/ui/main.ts`'s `?explore=` ternary and `apps/web/src/ui/docs.ts`'s `DEMOS`
list have no reference to it either. The existing walk-only `?explore=pools` route
(`eclInitBlock: 18`) is unaffected.
