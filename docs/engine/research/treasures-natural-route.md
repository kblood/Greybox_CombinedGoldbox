# Treasures of the Savage Frontier Natural Encounter Route — PROVEN (2026-07-21)

> **Status: 2026-07-21 — Treasures' first natural-combat route is PROVEN and SHIPPED.**
> `?explore=treasures-natural` walks a real 9-step GEO-derived legal path from a
> fragmentation-aware `startPose` override (6,1,north) to `GEO1.DAX#34`'s unique
> descriptor-0xFF cell (two physically separate rooms, (7,7) and (8,9), both real retail
> bytes), the `search_location` chain fires naturally in the real engine VM ("YOU ENTER A
> LARGE CHAMBER... THE HORDE OF YETIS CHARGING FORWARD TO GREET YOU!" → YETI CHIEF ×4 + ICE
> HOUND ×14, `MON1CHA.DAX` ids 84/86, real sane stats), an engine golden test + browser e2e
> both pass. Getting a real hit needed **two genuine engine fixes**, not just data — see §2
> and §3 below.

This continues the evidence-factory method `docs/engine/research/dok-natural-route.md` and
`docs/engine/research/secret-natural-encounter-route.md` established, applied to Treasures
of the Savage Frontier's own `ECL1.DAX`/`GEO1.DAX` under its own further-split ECL dialect
(`ECL_GEN1_SHORT_TREASURES`, disassemble.ts). Treasures already had a walk-only route
(`?explore=treasures`, `eclInitBlock: 20`, shipped 2026-07-19) — this route is a SEPARATE
`GameId` (`treasures-natural`) over the SAME archives, isolating its own save/e2e state,
matching the convention every other `*-natural` leaf uses, but booting a DIFFERENT area
(`eclInitBlock: 34`, not 20).

## §1 — Finding the candidate: a real dialect-drift bug fix in the scanner itself

`tools/gen1_ecl_encounter_scan.py`'s static CFG scanner drives a per-title `PROFILE_WORD_SETS`
table to pick the right operand-count dialect before decoding. It previously mapped
`treasures-of-the-savage-frontier` to the shared `GEN1_SHORT_WORD_SETS` dict (the same one
DoK/Gateway/Pools of Darkness use). That is wrong for Treasures specifically: this title's
own `ECL1.DAX` corpus desyncs every reachable `LOAD_FILES` (`0x21`) site under the shared
3-operand short frame — Treasures decodes `0x21` as Gen2's own **2-operand** short form
instead. DoK/Gateway/Pools of Darkness are independently proven to boot correctly under the
plain 3-operand `0x21` frame, so this override is Treasures-only.

Fix (this round): added `GEN1_SHORT_TREASURES_WORD_SETS = {0x1D: 0, 0x21: 2, 0x22: 0, 0x2C: 1}`
and pointed `PROFILE_WORD_SETS["treasures-of-the-savage-frontier"]` at it. Re-running the
scanner (`python tools/gen1_ecl_encounter_scan.py --strict --json build/gen1-ecl-encounters.json
--markdown docs/engine/research/gen1-ecl-natural-encounters.md`) now finds **12 candidates / 6
rostered** for Treasures (previously desynced past every real site).

Of the 6 fully-immediate-roster `search_location` candidates, `ECL1.DAX` block 34 was chosen:
a single unique descriptor (`0xFF`) with a clean, short (2-branch-decision) static path and a
fully-immediate 2-monster-group roster. Other candidates (blocks 24/29/32/38, see the scan's
own JSON) were considered but block 34's descriptor-0xFF trigger is the cleanest and — unlike
several others — its target cells are provably reachable (§4).

## §2 — Engine fix #1: Treasures' own cell-descriptor address is `[0x002d]`, not `[0xc04f]`

The first live attempt to fire block 34's `search_location` through the real production call
shape (`dialogueForCell`, mirroring `runStepEvent`'s own call in `explore.ts`) silently took a
non-combat branch. Disassembling block 34's own bytes around the dispatch point found:

```
AND #127, 0x002d, 0x009a
```

This masks the descriptor byte held at **`[0x002d]`** — not the CoK/DoK-family
`MAP_CELL_BYTE_ADDR` (`0xc04f`) `primeSearchLocation` seeds by default
(`packages/engine/src/world/dungeonEvents.ts`). Address `0x002d` is the SAME low address DQK's
own Gen2 `DQK_CELL_DESC_ADDR` uses — Treasures' "Stormfront"-era engine generation evidently
shares DQK's later data-segment convention, not the older FTL-derived CoK/DoK layout. This is a
genuinely new, byte-verified finding (not previously documented for any Gen1-DAX title).

**Fix:** added a new optional `cellDescAddr?: number` field to `EclDialect`
(`packages/engine/src/ecl/disassemble.ts`), set on `ECL_GEN1_SHORT_TREASURES` to `0x002d`, and
wired it into `primeSearchLocation`'s `extra` seeding construction
(`packages/engine/src/world/dungeonEvents.ts`):

```ts
const extra: Record<number, number> = dialect.hasMagic
  ? {
      [MAP_DIRECTION_ADDR]: gen1MapDirectionValue(opts.facing ?? 'north'),
      [MAP_CELL_BYTE_ADDR]: backdrop & 0xff,
      [MAP_WALL_ROOF_ADDR]: backdrop & EVENT_INDEX_MASK,
      ...(dialect.cellDescAddr !== undefined ? { [dialect.cellDescAddr]: backdrop & 0xff } : {}),
    }
  : { [DQK_CELL_DESC_ADDR]: backdrop & 0xff };
```

This is additive and a no-op for every other Gen1 dialect (`cellDescAddr` undefined everywhere
else). With this fix, running the exact production call shape against block 34's descriptor-0xFF
cell fires the real combat dispatch:

```
YOU ENTER A LARGE CHAMBER. TORCHES SET IN BRACKETS HIGH ON THE WALLS ILLUMINATE THE HORDE OF
YETIS CHARGING FORWARD TO GREET YOU!
monsters: [{ monsterId: 84, count: 4, picBlockId: 84 }, { monsterId: 86, count: 14, picBlockId: 86 }]
setup: { spriteId: 255, maxDistance: 0, picId: 150, distance: 0 }
```

## §3 — Engine fix #2: `chooseStart` reachability gap (`startPose`)

`GEO1.DAX#34` is **not** one connected region: a full BFS connected-component analysis over
`Explorer.canMove()`'s own real walkable-graph semantics found **21 disconnected components**
(sizes `[118, 23, 18, 17, 15, 13, 9, 7, 7, 6, 5, 4, 3, 3, 2, 1, 1, 1, 1, 1, 1]`). The target cell
(7,7)/(8,9) lives in the 118-cell component. `explore.ts`'s existing `chooseStart(map)` heuristic
(pick the cell with the most open edges, first found in row-major scan order) has no connectivity
awareness — it lands at `(0,0)`, in a 13-cell pocket with no path at all to either yeti-chamber
cell.

This is a real, narrow gap in the heuristic, not a Treasures-specific hack — every other shipped
`*-natural` route was deliberately picked to already be reachable from `chooseStart`'s own spawn.
Rather than teach `chooseStart` general graph-component awareness (a much larger change with a
wide blast radius across every other route), an additive, opt-in `startPose?: { x, y, facing }`
field was added to `GameData` (`apps/web/src/ui/gameData.ts`), consulted in `explore.ts`:

```ts
const explorer = new Explorer(map, activeGame.startPose ?? chooseStart(map));
```

`treasures-natural`'s own `startPose` is `{ x: 6, y: 1, facing: 'north' }` — the best-open-edges
cell within the SAME 118-cell component as the target (computed the same way `chooseStart` itself
would, just restricted to the reachable component). Absent for every other profile ⇒ unchanged
behavior.

## §4 — The walk: 9 legal directed-edge steps, zero intermediate events

BFS from `(6,1,north)` to `(7,7)` over the real `Explorer.canMove()` semantics:

```
(6,1) -south-> (6,2) -east-> (7,2) -east-> (8,2) -south-> (8,3) -south-> (8,4)
      -south-> (8,5) -south-> (8,6) -west-> (7,6) -south-> (7,7)
```

Every intermediate cell is plain floor (`0x81`) — no doors, no intermediate `search_location`
dispatch, no `eclInitialMemory` seeding needed. (A second, 12-step path from the same start
reaches the sibling cell (8,9) via (7,7) — both cells share the descriptor and either one fires
the same dispatch; the shipped route walks to (7,7).)

As relative turn/forward actions (starting facing north, matching `explore.ts`'s `move()` API):
`right, right, forward, left, forward, forward, right, forward, forward, forward, forward, right,
forward, left, forward` — 15 actions total (9 forward steps + 6 turns), verified by simulating
the real `Explorer` class (not hand-derived) and cross-checked against the e2e test's own
assertion of the final pose `{ x: 7, y: 7, facing: 'south' }`.

## §5 — Monster roster corroboration

`MON1CHA.DAX` ids 84/86 decode to real, sane, named records under `TREASURES_LAYOUT`
(`packages/engine/src/loaders/monster.ts`):

| id | name       | AC | THAC0 | HP |
|----|------------|----|-------|----|
| 84 | YETI CHIEF | 5  | 13    | 12 |
| 86 | ICE HOUND  | 5  | 13    | 12 |

Both plausible, in-range D&D values consistent with every other decoded record in this
archive — not junk/degenerate output. The tactical combat screen caps both sides to their first
6 combatants (a pre-existing engine-wide cap, same as every other `*-natural` route documents),
so 4 YETI CHIEF + 2 ICE HOUND survive truncation in the shipped UI.

## §6 — Post-victory two-wave resume and persistent revisit behavior

Calling `runner.afterCombat('victory')` after the first fight resolves to a real, in-character
post-victory beat **and an immediate second COMBAT effect**:

> "AS THE PARTY MEMBERS LOOK AT EACH OTHER AND BREATHE A SIGH OF RELIEF AFTER YOUR VICTORY IN
> BATTLE, YOU HEAR HUMAN-SOUNDING VOICES SHOUTING WARNINGS. LOOKING TOWARDS THE SOUNDS, YOU SEE A
> SECOND PACK OF YETI AND ICE HOUNDS CHARGING TOWARDS YOU, SPURRED BY A SINGLE HUGE YETI!"

The turn contains the second roster: YETI CHIEF ×2 (id 84), ICE HOUND ×12 (id 86), and one
huge YETI (id 85). Calling `afterCombat('victory')` for that second battle then ends with the
rescued miners' journal-entry #20 text and writes the room's persistent result: `[0x0054] = 0`,
`[0x022d] = 1`, and `[0x0232] = 1`. `[0x002d]` remains the per-step descriptor seed, not the
consumed marker. A revisit after both battles therefore reaches `end`, not the original horde.
The earlier claimed unconditional re-fire was a false positive: its test dismissed wave one and
moved immediately, mistaking the asynchronously-mounted retail second wave for a new visit. The
shipped browser test now uses the seeded elite route party to win both waves through ordinary
combat, proves `[0x022d]`/`[0x0232]` are still zero at the second-wave boundary, then observes both
writes after the real continuation. It steps legally off and back onto the room, proves the consumed
branch stays silent, and round-trips exact party, inventory, pose, clock, and area memory through a
cold restart and Greybox v2 load. The engine golden independently preserves the uncapped retail
rosters and resolves both victory continuations without relying on the browser's six-enemy display
cap.

## §7 — Verification

- **Engine golden** (`packages/engine/test/dungeonEvents.test.ts`, `describe('primeSearchLocation
  — golden Treasures of the Savage Frontier ECL1 block 34 natural encounter')`): pins the two
  descriptor-0xFF cells, the first and second exact rosters, the terminal rescued-miners text,
  the consumed revisit and its exact persistent writes after the complete chain, and the `[0x002d]`
  seed write.
  Guarded by `existsSync` (skips cleanly on a fresh clone with no local GOG install).
- **Browser e2e** (`apps/web/test/e2e.mjs`, `runExploreTreasuresNaturalCombat` /
  `explore-treasures-natural-combat`): walks the real 15-action sequence through
  `window.__explore.move()`, asserts the dispatch text, the capped 6-combatant roster
  composition, ordinary victories in both capped tactical waves, locked movement/save while wave two
  is open, both consumed words still zero at that boundary, the rescued-miners result and exact
  writes, a legal silent consumed revisit, and exact save/restart/load restoration. The full first
  and second retail roster requests remain an engine-golden claim because the tactical presentation
  deliberately displays at most six actors per side.
- The focused golden and browser routes pass; the normal full engine-suite gate guards the wider
  regression surface before publication.

## §8 — Rejected/deferred candidates

- Block 24 (descriptor 34/32 in the earlier un-fixed scan): investigated and rejected —
  its dispatch is reached via `vm_run_1`, not `search_location`; `vm_run_1` only fires through
  the manual wilderness-crossing UI (`crossWilderness`), not automatically per step, so it is not
  a natural per-step encounter the way block 34's is.
- Blocks 29/32/38 (the other fully-immediate-roster candidates from the corrected scan): not
  pursued once block 34 proved out cleanly — left as future natural-route candidates if a second
  Treasures leg is wanted later (the same "-2/-3/..." numbering convention other titles use).
