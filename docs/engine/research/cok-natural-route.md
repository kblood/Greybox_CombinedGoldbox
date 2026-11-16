# Champions of Krynn Natural Encounter Route

> Status: P2 CoK slice complete at the engine level, 2026-07-16. Browser-side wiring (a
> `cok-natural` `GameData` profile, `explore.ts`/`main.ts` routing, a docs.ts/support.ts entry, and
> an `apps/web/test/e2e.mjs` `verifyNaturalPersistence('cok-persistent', ...)` case) landed the same
> day — see "Claim Boundary" (now proven, not deferred). This is the first CoK/DoK evidence-factory
> promotion — `docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf.

## Decision Unblocked

Promote one CFG-scanned CoK candidate encounter from `build/gen1-ecl-encounters.json` to a
byte-grounded, three-times-proven natural-combat route, matching the shape Pool of Radiance,
Curse of the Azure Bonds, and Secret of the Silver Blades already carry:

```text
retail GEO cell/search -> ECL monster setup -> COMBAT
                       -> outcome -> exact ECL resume -> save v2 persistence
```

## Candidate Selection

`build/gen1-ecl-encounters.json`'s `champions-of-krynn` entry lists 221 CFG-decoded `COMBAT`
paths across `ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX` (183 carry a local `LOAD_MONSTER` roster). Almost
every `search_location` candidate is flagged `requires_runtime_seed: true` — as with Pool's own
proven route, this just means the static scan crossed a branch decision (a menu choice or a
consumed-flag check), not that it needs an unrecoverable RNG seed; Pool/CoAB/Secret's promoted
routes all carry the same flag.

`ECL1.DAX` block **34** was chosen because it is not an arbitrary block: it is the **same block
CoK's web boot already loads** (`apps/web/src/ui/gameData.ts`'s `cok` profile has
`eclInitBlock: 34`, and `packages/engine/test/dungeon.test.ts`'s "golden CoK ECL1 block 34"
already proves `GEO1.DAX#34` is a real two-wallset 16×16 dungeon). A prior research pass
(`docs/engine/research/gen1-retail-searchlocation-combat-proof.md`, 2026-07-13) had already found
one reachable combat cell in this exact block — `(3,15)`, descriptor `156` — while proving the
general SearchLocation-combat handoff; that finding is the anchor this promotion completes with a
full resume/persistence proof, rather than reaching for an unverified alternative. (An earlier,
higher-confidence-looking candidate — selector 5, cell `(4,3)` in the same block — was checked
first and rejected: see "Rejected Candidate" below.)

## Address Model

Standard Krynn Gen1 (`ECL_GEN1`, `vbase = 0x7FFE`, 22-byte header). No title-specific addend is
needed (unlike Pool's `0x6700`): `file_offset = ((vaddr + 0x8000) & 0xFFFF) + 2`, matching
`tools/gen1_ecl_encounter_scan.py`'s default `DEFAULT_ADDRESS_ADDEND = 0x8000`.

## Selected Candidate

| Field | Retail value |
| --- | --- |
| Archive/member | `ECL1.DAX#34` |
| Entry | `search_location`, `0x81DE` (member offset `0x1E0`) |
| Selector | `mapWallRoof & 0x3F == 28` (`AND 0xc04f, #63, [0x7f79]` at `0x81EF`/`0x81F8`) |
| GEO archive/member | `GEO1.DAX#34` |
| Unique matching cell | `(3,15)`, raw descriptor `0x9C` (`156`) |
| Combat | `0x9404` (member offset `0x9406`) |
| Roster | `LOAD_MONSTER (13,8,13)`, `(35,5,35)`, `(38,2,38)` |
| Roster provenance | Three immediate-operand `LOAD_MONSTER`s directly before `COMBAT`, same decoded path after `CLEARMONSTERS` |
| Monster names | id 13 = `HOBGOBLIN LDR`, id 35 = `WARRIOR`, id 38 = `BLACK ROBE MAGE` (`MON1CHA.DAX`, 409-byte records) |
| Resume (next instruction) | `0x9405`: `COMPARE [0x7ec7], #128` (an unrelated day-count check — both branches converge) |
| Consumed-bit write | `0x9450`: `ADD #0x20, [0x4c55] -> [0x4c55]` |
| Static confidence | decoded static path with local roster (`decoded-static-path-with-roster`) |
| Runtime status | engine golden proven (`packages/engine/test/dungeonEvents.test.ts`); browser wiring + save v2 persistence also proven (`apps/web/test/e2e.mjs::runExploreCokNaturalCombat`) |

Decoded path (selector target for index 28, `0x931B`):

```text
931B  AND [4C55], #32 -> [7F79]
9324  IF_NE                              guarded GOTO 0x8287 only when already consumed
9325  GOTO 0x8287
9329  SETUP_MONSTER #35, #2, #35
9330  PRINTCLEAR "YOU SEE A MASS OF HOBGOBLINS AND HUMANS STANDING..."
9351  PRINT "OTHERS, LADEN WITH SACKS, ARE RUNNING UP THE CORRIDOR..."
9375  GOSUB 98C3                          approach subroutine
9379  PRINTCLEAR <flavour text>
939E  PRINT <flavour text>
93C3  GOSUB 98E7                          menu-prep subroutine
93C7  HORIZONTAL_MENU [7F79], 3, "ATTACK", "WAIT", "LEAVE"
93DF  ON_GOTO [7F79], 3, 0x93EE, 0x945D, 0x9479
93EE  CLEARMONSTERS                       choice 0 = ATTACK
93EF  LOAD_MONSTER #13, #8, #13           8x HOBGOBLIN LDR
93F6  LOAD_MONSTER #35, #5, #35           5x WARRIOR
93FD  LOAD_MONSTER #38, #2, #38           2x BLACK ROBE MAGE
9404  COMBAT
9405  COMPARE [7EC7], #128                resume: unrelated day-count branch
940B  IF_GT
940C  GOTO 0x9450                         (both branches converge here)
9410  PRINTCLEAR <flavour text>           (only on the "not GT" branch)
9436  PRINT "HYSTERICAL SOUNDS OF PANIC AND FEAR COME FROM THE CORRIDOR TO THE WEST."
944C  GOSUB 98C3
9450  ADD #32, [4C55] -> [4C55]           consumed-bit write (deterministic either branch)
9459  GOTO 0x827B
```

Choice 1 (`WAIT`) prints flavour text and loops back into the same menu via `APPROACH`/`DELAY`.
Choice 2 (`LEAVE`) prints text and exits without combat or a consumed-bit write.

Unlike Pool/CoAB/Secret, the consumed-bit write is **not** the instruction immediately after
`COMBAT` — a day-count `COMPARE`/`IF_GT` and a second flavour-text beat run first, and both of
that branch's arms converge on the same `ADD` at `0x9450` before returning to the shared re-entry
point `0x827B`. This is deterministic regardless of `[0x7EC7]`'s value, so the corpus route
declares `resume_vaddr: 0x9450` (the actual write site, opcode `ADD` = `0x04`) rather than the
next-instruction convention the other three games happen to share. The engine golden documents
this by draining one extra `say` turn after `afterCombat()` before asserting the final memory
word.

## Rejected Candidate

Selector **5**, cell `(4,3)` (descriptor `0x85`) in the same block was checked first — it has an
explicit two-choice combat/leave menu (closer to Pool's shape) and a clean immediate roster
(`35,5,35` / `41,2,41` / `38,1,38`). It was rejected on reachability grounds: `find_geo_path.py`'s
walls-only directed-edge BFS (`decode_edges`/`find_path`, the same rule as
`packages/engine/src/world/explorer.ts`'s `canMove`) proves `(4,3)` is **not** reachable from the
current default CoK spawn `(14,10,north)` — it sits in a disconnected 38-cell component (GEO1#34
is a genuine "two-set dungeon" per `dungeon.test.ts`'s existing label: two separate wall-piece
sets covering physically disjoint regions of the same 16×16 grid, not just two wall styles in one
connected map). Per the UNLOCATED-beats-invention ethic, this candidate is left undeclared rather
than fabricating a reachability path; selector 28 replaces it as the honest, reachable choice.

## GEO and Reachability Proof

`GEO1.DAX#34` has exactly one plane-2 descriptor whose low six bits equal 28: cell `(3,15)`, raw
byte `0x9C`. It is reachable from Greybox's current CoK default spawn `(14,10,north)` — the same
"most-open-edges" heuristic cell `chooseStart()` already computes for this block — in **22** legal
directed-edge steps:

```text
E S S S W W S W W W N W N W W S W S W S W W
```

```text
tools/find_geo_path.py --geo "Champions of Krynn/GEO1.DAX" --block 34 \
  --start 14,10 --target 3,15 --facing north
```

The shortest route crosses two harmless one-shot flavour-text cells: selector 27 at `(11,14)`
(`AND [0x4c55], #16` — sets `[0x4c55] |= 0x10`, prints a line, no combat) and selector 30 at
`(8,12)` (`AND [0x4c44], #1` — sets `[0x4c44] |= 0x1`, prints a line, no combat). Neither collides
with selector 28's own `[0x4c55]` bit `0x20`, and neither gates movement or triggers combat, so no
memory seeding is required to walk the route cleanly — a cleaner story than Secret's route, which
needed two explicit intermediate seeds.

## Proven Replay Inputs

- `MON1CHA.DAX` records: id 13 = `HOBGOBLIN LDR`, id 35 = `WARRIOR`, id 38 = `BLACK ROBE MAGE`
  (409-byte records, matching every other CoK monster record).
- The opening turn is a one-choice flavour beat ("YOU SEE A MASS OF HOBGOBLINS AND HUMANS...");
  choosing it reveals the real three-way menu `["ATTACK", "WAIT", "LEAVE"]`; choice 0 (`ATTACK`)
  reaches combat with the exact roster above.
- Victory resumes at `0x9405`, prints one more flavour beat, and sets `[0x4C55] = 0x20` at
  `0x9450` after that beat is acknowledged.
- Regression: `packages/engine/test/dungeonEvents.test.ts`, "golden CoK ECL1 block 34 natural
  encounter (descriptor 28)".

## Save v2 Persistence

`packages/engine/test/saveGame.test.ts`'s natural-route round-trip table gains a `CoK ECL1#34`
row: `areaMemory['CoK ECL1#34']['19541'] = 32` (`0x4c55 = 32`) round-trips through
`serializeSave`/`deserializeSave` exactly like the Pool/CoAB/Secret rows.

`tools/goldbox_corpus_routes.json`'s `champions-of-krynn` entry was promoted in place (the same
one profile-keyed slot used for the prior exploration-tier declaration) to
`surface: "natural-combat"` with a `natural_encounter` block, and now also a `persistence` block
(`memory_address: 19541`, `consumed_mask: 32`, `browser_marker: "cok-persistent"`, mirroring
Pool/CoAB/Secret's own promoted entries). `python tools/goldbox_corpus.py --strict` reports
`route.status = "verified-byte-contract"`, `persistence.status = "verified-contract"`, and
`level = "persistent"` for this profile with zero failed checks and zero gaps — see
`docs/engine/research/goldbox-corpus.md`'s "Champions of Krynn" row/section.

## Claim Boundary

**What is proven:** the byte-grounded GEO selector cell, its reachability from the current default
spawn, the exact ECL roster, the combat trigger, the exact resume instruction sequence and
consumed-bit write, and Greybox's own save v2 schema round-tripping that consumed state — all at
the engine level (`packages/engine/test/dungeonEvents.test.ts` and `saveGame.test.ts`), plus the
corpus's mechanical byte-contract verification (`tools/goldbox_corpus.py --strict`).

**Browser-side wiring is now also proven** (landed 2026-07-16, the same day as the engine slice,
once the concurrent CoAB cross-archive work had settled): a `cok-natural` `GameData` profile
(`apps/web/src/ui/gameData.ts`), `explore.ts`/`main.ts` routing for `?explore=cok-natural`, a
docs.ts/support.ts entry, and an `apps/web/test/e2e.mjs::runExploreCokNaturalCombat` test that
walks the real 22-step route, fights the real roster, saves, reloads, and proves the consumed ECL
word survives and cannot refire (`verifyNaturalPersistence('cok-persistent', ...)`).
`tools/goldbox_corpus_routes.json`'s `champions-of-krynn` entry now carries a `persistence` block
and `python tools/goldbox_corpus.py --strict` reports `level = "persistent"` with zero failed
checks and zero gaps. `apps/web/src/ui/supportClaims.json`'s `web_level` is raised to
`"persistent"` to match.

**One honest wrinkle found during browser wiring:** the real 22-step walk crosses selector 27's
cell `(11,14)` — a harmless one-shot flavour beat, per the "GEO and Reachability Proof" section
above — which sets a *different* bit (`0x10`) of the *same* `[0x4c55]` word this encounter's own
bit (`0x20`) lives in. The engine golden primes `dialogueForCell` directly at the target cell with
blank memory, so it never observes this; the live browser route does, so its pre-combat value is
`0x10` (not `0`) and its post-resume value is `0x30` (not `0x20`). This is the identical "a real
walk picks up other legitimate bits" pattern CoAB's own natural route already documented for its
`[0x4CF4]` word — not a bug, just something only the live walk surfaces.

**Choice-flow correction — 2026-07-27.** The former browser wiring auto-drained this route because
its first turn was the one-choice "PRESS BUTTON OR RETURN TO CONTINUE." lead-in, silently selecting
the later menu's index 0 (`ATTACK`). `runStepEvent` now treats CoK's first menu turn as interactive
even when it has one button. The user advances the source text, then sees the verified
`ATTACK / WAIT / LEAVE` menu and chooses the branch; dialogue-owned post-combat prompts are likewise
not auto-selected. `runExploreCokNaturalCombat` proves the exact two-turn sequence before choosing
ATTACK, completing combat, and retaining the consumed bit through a save/reload.

This does not prove original DOS `CS:IP` execution, screenshot-exact combat layout, or that CoK's
original save format stores this same word — the same boundary Pool/CoAB/Secret's docs already
draw.

## Next Substeps

1. Death Knights of Krynn's own P2 natural-route slice (`build/gen1-ecl-encounters.json`'s
   `death-knights-of-krynn` entry has far fewer candidates — 14 total, 4 rostered) — explicitly out
   of scope for this task per `docs/engine/BUILD-QUEUE.md`'s stated CoK-before-DoK order.
2. Once both P2 baselines exist, build CoK/DoK's early/middle/ending + town + wilderness + quest
   campaign matrices per the BUILD-QUEUE leaf's next bullet.

**Update (2026-07-16):** step 2's first leg is now underway — CoK's own middle-area natural route
(`ECL2.DAX#49`, selector 28, distinct from this doc's `ECL1.DAX#34` anchor) is proven with the same
rigor; see `docs/engine/research/persistent-natural-routes.md`'s "CoK's Second Route (Middle)"
section for the full byte trace. DoK's P2 slice remains untouched and out of scope.
