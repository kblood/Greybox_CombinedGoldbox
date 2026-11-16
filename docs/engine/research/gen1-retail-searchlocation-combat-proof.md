# Gen1 Retail SearchLocation Combat Proof

Date: 2026-07-13

## Result

Greybox now has a real Krynn Gen1 retail cell proof for script-triggered combat:

- Game: `Champions of Krynn`
- ECL archive/block: `ECL1.DAX` block `34`
- GEO archive/block: `GEO1.DAX` block `34`
- Decoded GEO cell: `(x=1, y=0)`
- Cell backdrop / SearchLocation descriptor: `129`
- ECL path: `SearchLocation` via `dialogueForCell()` reaches `COMBAT`
- Decoded roster:

```text
monsterId 35, count 7, picBlockId 35
monsterId 38, count 2, picBlockId 38
```

The emitted event text starts:

```text
FIGHTERS SURGE FROM AROUND THE CORNER...
```

This is not the older `testFight()` fixed goblin seam. The descriptor comes from the decoded retail
GEO cell, and the monster roster comes from the retail ECL `LOAD_MONSTER` groups before `COMBAT`.

## Implementation Proofs

- Engine golden:
  `packages/engine/test/dungeonEvents.test.ts` decodes real `ECL1.DAX` and `GEO1.DAX`, asserts cell
  `(1,0)` has descriptor `129`, runs `dialogueForCell()` on block 34, and asserts the exact two-group
  roster above.
- Web e2e:
  `apps/web/test/e2e.mjs` uses `window.__explore.testRetailSearchLocationFight(1, 0, 'east', 0x5a)`.
  That seam moves the party to the real decoded GEO cell, calls the normal `runStepEvent()` path using
  the cell's own backdrop byte, marks `state.lastCell` to prevent a redraw from firing the same cell a
  second time, and waits for the normal combat overlay.
- Web walk e2e:
  `apps/web/test/e2e.mjs` also proves a no-teleport path from the current Greybox CoK default start
  `(14,10,north)` to a real combat cell in the same active `ECL1/GEO1` block 34. It drives only
  `window.__explore.move(action)`, so `draw()` fires the normal cell-enter `SearchLocation` hook.
  The reached cell is `(3,15)`, descriptor `156`, seed `0x10f3`, with decoded roster:

```text
monsterId 13, count 8
monsterId 35, count 5
monsterId 38, count 2
```

  Route:

```text
back back left back left forward left back back back
left back left forward forward left back left back left
forward left forward forward left forward left back back
left back back left forward forward
```

- Combat-area handoff:
  e2e compares the overlay's `window.__combat.backgroundSummary()` against
  `window.__explore.testRetailCellTerrain(1, 0, 'east', 0x5a)`, which directly summarizes
  `buildCoabDungeonCombatMap()` output for the same real pose and seed. This proves the retail
  SearchLocation combat launch receives recovered 50x25 `backgroundIds`, not the flat 13x9 fallback.
  The walk proof performs the same `backgroundSummary()` comparison against
  `window.__explore.testEncounterTerrain(0x10f3)` at the reached pose.

Verification commands:

```text
pnpm --filter @goldbox/engine exec vitest run test/dungeonEvents.test.ts test/dqkEvents.test.ts test/vm.test.ts --reporter=verbose
$env:GB_E2E_ONLY='create,explore'; pnpm --filter @goldbox/web e2e
```

Both commands passed on 2026-07-13.

## Scan Context

A temporary diagnostic scan over local CoK/DoK Gen1 `ECL*.DAX` + `GEO*.DAX` pairs found many CoK
SearchLocation combat descriptors with non-empty rosters. One additional representative hit:

- CoK `ECL1/GEO1` block `32`, descriptor `129`, cells `(8,4)`, `(15,5)`, `(7,15)`.
- Roster: `12x7`, `13x4`, `35x4`.
- Text: `'THROTL'S OFF LIMITS TO YOU. LEAVE AND NO ONE GETS HURT.' WHAT DO YOU DO?`

The block-34 proof was chosen for permanent web e2e because it is in the web boot block already loaded
by `?explore=1`. DoK's scanned natural hits in the same pass were empty-roster service/dialogue-like
`COMBAT` gates, so CoK block 34 is the current strongest Gen1 retail web proof.

## Remaining Boundaries

- The original CoK entry/start source is still not recovered. The walk proof starts from Greybox's
  current heuristic default `(14,10,north)`, not a verified SSI entrypoint.
- The `(1,0)` descriptor-129 golden cell is not reachable from that current heuristic start under the
  decoded movement graph; the no-teleport browser proof therefore uses the reachable block-34 combat
  cell `(3,15)`, descriptor `156`.
- Decoded GEO block 34 currently has no surfaced `entries[]`. A pure `Explorer.atEntry(map)` fallback
  would start at `(0,0,north)`, from which `right, forward` reaches `(1,0)`, but the web host does not
  use that fallback and pure `Explorer` does not run `SearchLocation`. Recovering the original entry
  source remains separate from the combat handoff proof.
- This proves Krynn Gen1 dungeon `SearchLocation` combat. It does not prove DQK Gen2 combat-area setup
  or DQK natural non-empty roster discovery.
- Screenshot-exact combat layout, RNG alignment for random furniture, wilderness/random combat setup,
  and cross-game binary equivalence remain separate source-recovery items.
