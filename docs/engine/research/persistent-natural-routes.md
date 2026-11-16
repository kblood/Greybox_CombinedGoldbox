# Persistent Natural Route Proofs

> Status: Greybox snapshot persistence complete for Pool, CoAB, and Secret, 2026-07-15. CoAB's
> second (middle-area) natural route added 2026-07-16 — see "CoAB's Second Route" below. CoAB's
> third route, a real **cross-archive** wilderness crossing (ADR-0009), added 2026-07-16 — see
> "CoAB's Third Route (Cross-Archive Wilderness Crossing)" below. Secret's own second (middle-area)
> natural route added 2026-07-16 — see "Secret's Second Route" below. Pool's own second (middle-area)
> natural route added 2026-07-16 — see "Pool's Second Route" below. Pool's own third route, the
> ending/late-area leaf, added 2026-07-16 — see "Pool's Third Route (Ending/Late-Area)" below. Pool's
> own fourth route, the town enter/exit leaf, added 2026-07-16 — see "Pool's Fourth Route
> (Town/Temple)" below. Pool's own fifth route, a real **cross-archive** wilderness/overland crossing
> (architecturally distinct from CoAB's ADR-0009 mechanism), added 2026-07-16 — see "Pool's Fifth
> Route (Wilderness/Overland Crossing)" below. Secret's own sixth route, the **quest** leg — a
> genuine cross-block persistent-flag dependency, the last leaf of BUILD-QUEUE item 6's matrix and
> never attempted for any Gen1 game before this pass — added 2026-07-16, see "Secret's Sixth Route
> (Quest — Cross-Block Persistent Alert Flag)" below. Pool's own quest leg was investigated with the
> same method and found genuinely unproven; documented honestly rather than forced, see "Pool's
> Quest Leg (Investigated, Unresolved)" below. Champions of Krynn's own first natural route — the
> CoK/DoK P2 prerequisite `docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf
> named — was proven end to end (engine golden, browser wiring, and save v2 persistence) 2026-07-16,
> see "CoK's First Route" below. CoK's own sixth route, the **quest** leg completing its six-leg
> matrix (early/middle/ending/town/wilderness/quest), a genuine cross-block persistent-flag
> dependency between the wilderness hub's own landmark-discovery block and its already-proven
> Fifth Route, added 2026-07-17, see "CoK's Sixth Route (Quest)" below. Death Knights of Krynn's
> own first natural route — the other half of that same "Blocked prerequisite for CoK/DoK" leaf,
> and the last first-wave holdout — was proven end to end (engine golden, browser wiring, and
> save v2 persistence) 2026-07-18, with one honestly-modeled retail deviation (revisit re-fires
> with SURPRISE armed instead of consuming), see "DoK's First Route" below. Original DOS save
> import/export parity remains a separate open proof.

## Contract

Greybox save schema version 2 adds `areaMemory`, keyed by stable map name and then decimal ECL
address string. This keeps per-area script state separate from host-level `flags` and allows a save
to carry several areas without address collisions.

Version-1 JSON remains loadable. Missing `areaMemory` normalizes to `{}`; the explorer applies saved
memory only when the saved position names the currently loaded map. Consequently, loading an old
save does not clear a route profile's required initial seeds.

## Proven Routes

| Game | Saved target | Consumed state | Browser proof |
| --- | --- | --- | --- |
| Pool of Radiance | ECL1#18 `(14,8)` east | `[0x4A38]=2` | ORC LEADER cannot refire |
| Curse of the Azure Bonds | ECL4#37 `(5,3)` west | exact walked value `[0x4CF4]=0x4C`; target mask `0x08` | MEDUSA/GRIFFON cannot refire |
| Secret of the Silver Blades | ECL3#97 `(12,3)` west | `[0x4CCD]=0x24`; target mask `0x04` | hydras cannot refire |
| Champions of Krynn | ECL1#34 `(3,15)` west | exact walked value `[0x4C55]=0x30`; target mask `0x20` | HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE cannot refire |
| Death Knights of Krynn | ECL1#34 `(11,1)` north | `[0x4C5F]=0x08` | SIVAK ×15 **re-fires with SURPRISE armed** (retail deviation — see § DoK's First Route) |

DoK is the one deliberate exception to the "cannot refire" column: its retail bytes arm an
`IF_NE`-guarded SURPRISE with the persisted bit instead of gating the encounter body, so the
browser proof asserts persistence **and** the re-fire (step 7 below runs in the opt-in
`revisitRefires` mode of the shared helper; all other routes keep the consumed-semantics check).

CoAB's direct engine golden starts with zero and produces `0x08`. The normal 26-step browser route
also visits legitimate events that set other bits, so the post-walk value is `0x4C`. Persistence
stores and compares the exact runtime word while separately requiring the selected encounter mask.

For each route, Edge now:

1. walks normal controls to the retail encounter and finishes tactical combat;
2. captures the post-combat party, target pose, game time, and full ECL memory;
3. writes the version-2 quick-save and checks its canonical JSON;
4. empties the party store and restarts the same route without auto-load;
5. verifies the profile's fresh memory, then loads the slot;
6. requires exact party store plus live-cache, pose, clock, and ECL word restoration; and
7. runs the target SearchLocation handler again and requires that combat does not relaunch.

## CoAB's Second Route

BUILD-QUEUE item 6's second leaf: "Campaign-grade Gen1" work requires a **middle-area** natural
route in a distinct `ECLn.DAX`/`GEOn.DAX` major area from each proven anchor, promoted with the
same rigor. The campaign-route target map (`build/gen1-campaign-route-map.json`, built by
`tools/build_gen1_campaign_route_map.py`) ranked CoAB's `ECL2.DAX#4` middle candidate closest to
actionable and named area-2 selector 7, cell `(3,13)`, descriptor `0x87` as the target. That
tool's reachability check is walls-only (a directed-edge BFS over `Explorer.canMove`) and blind to
scripted triggers on intermediate cells, so this promotion re-derived reachability against the real
engine before trusting the JSON's literal cell.

**Finding: selector 7 / cell (3,13) is not legally reachable fresh.** Every walk from
`chooseStart (1,1,north)` that can reach it is forced through area-2 selector 4, cell `(4,12)`,
descriptor `0x84` first — a "SURRENDER Y/N" Fire Knives checkpoint. Both cells decode to the exact
same tail once the checkpoint's YES branch is taken: `SETUP_MONSTER` → two `LOAD_MONSTER` groups →
`TREASURE` → `COMBAT` at vaddr `0x838e`, resume `0x838f`, byte-verified by tracing both prefixes to
the identical offset. So selector 4's checkpoint, not selector 7's own cell, is CoAB's real,
legally-reachable middle-area natural route; selector 7 remains valid retail content but is only
ever reached pre-consumed, after the checkpoint has already fired. The static target map's
`ecl2-dax-4` candidate entry is left unmodified (`route_proven: false`) — it is correct as a
byte-decoded candidate list, just not as a claim about which cell in that block is the reachable
entry point, and this promotion does not retroactively claim selector 7 itself.

| Saved target | Consumed state | Browser proof |
| --- | --- | --- |
| ECL2#4 `(4,12)` west (selector 4 checkpoint, not the JSON's selector-7 cell) | `[0x4CFF]=1` | FIRE KNIFE/MAGE cannot refire |

- Roster: `FIRE KNIFE ×20` (monster id 1, pic block 1) + `MAGE ×1` (monster id 3, pic block 3),
  decoded straight from the two `LOAD_MONSTER` groups — verified at the VM/`DialogueRunner` layer
  (`packages/engine/test/dungeonEvents.test.ts`). The browser's tactical combat screen caps both
  sides to their first 6 combatants (`apps/web/src/ui/combat.ts`, `tryCoabSourceTacticalPlacement`/
  `toTactical`, a pre-existing engine-wide constant unrelated to this route), so the *browser* e2e
  proof observes 6 FIRE KNIFE and asserts against that reality rather than the full 21-strong ECL
  roster; the full roster is what the engine golden proves.
- Checkpoint prompt: an explicit two-choice `YES`/`NO` "SURRENDER" menu — not a degenerate
  one-choice continue, satisfying item 5's "explicit player combat choice" step. YES walks the
  party to the Fire Knives' leader and merges into the shared combat tail; the post-victory story
  chain (several fixed `say` beats) ends in a clean `chain` to block 80.
- Browser route: `?explore=coab-natural-2` (`apps/web/src/ui/gameData.ts`'s `coab-natural-2`
  profile, `eclInitBlock: 4`, same `ECL2.DAX`/`GEO2.DAX` archives as the plain `coab` profile,
  whose own `eclInitBlock` targets a different, wilderness-adjacent dungeon entry). It does not
  auto-select a preview monster.

**Corpus-promotion note.** `tools/goldbox_corpus_routes.json`'s route declarations and
`tools/goldbox_corpus.py`'s evidence builder are keyed **one route per `profile_id`**
(`load_routes()` builds a `{profile_id: route}` dict; `PROFILES` has one row per game). CoAB's
existing `curse-of-the-azure-bonds` entry already declares its first (early-anchor, `ECL4#37`)
route and remains the corpus's single machine-checked "declared natural route" for that profile —
changing that schema to hold two simultaneous routes per profile would be a new promotion
mechanism, out of scope for this leaf. This second route's promotion therefore lives entirely in
this doc plus its own engine golden, save round-trip row, and e2e coverage (below), the same
doc-layer mechanism this file has always used to record "CoAB route complete and promoted to
Combat" — it is proven by the identical automated-evidence contract, just not additionally
mirrored into the singular corpus JSON slot.

## CoAB's Third Route (Cross-Archive Wilderness Crossing)

BUILD-QUEUE item 6's wilderness-transition leaf: prove the ADR-0009 cross-archive `NEWECL`
crossing (`docs/engine/adr/0009-cross-archive-ecl-area-switching.md`) as a **real browser route**,
not just the engine golden it was built on
(`packages/engine/test/dungeonEvents.test.ts`, "runEclChain — golden ADR-0009 cross-archive
crossing"), and prove multi-area quest-state persistence across the crossing without the two
areas' `areaMemory` save keys colliding.

**Route.** `ECL4.DAX#37` (game_area 4, the same early-anchor block as CoAB's first route) →
two real menu choices (index 0 both times: "SHOP"/"EXPLORE" then "RETURN TO DAGGER
FALLS"/"GO TO THE TOWER") → `SAVE 1,0x7F12; NEWECL 80` into `ECL1.DAX#80`, the wilderness hub
(game_area 1, no `GEO1.DAX`/`WALLDEF1.DAX` — verified directly against the real GOG folder: those
two files are absent while `8X8D1.DAX`/`MON1CHA.DAX`/`ITEM1.DAX` all exist, matching the ADR's
"menu/`ON_GOTO` dispatch, not a walkable grid" description) → the hub's pre-seeded destination
selector (`mem[0x4C9C]=9`, `mem[0x4C0C]=1`) dispatches `SAVE 1,0x4BE6; SAVE 5,0x7F12; NEWECL 49`
into `ECL5.DAX#49` (game_area 5) → one more "press on" continue prompt lands in `ECL5.DAX#49`'s
real, walkable `GEO5.DAX` town.

| Saved targets | Consumed state | Browser proof |
| --- | --- | --- |
| Departed `Curse of the Azure Bonds game_area 4` snapshot + landed `Curse of the Azure Bonds ECL5#49 (game_area 5)` walked position | `[0x4C20]=0x2A` in BOTH area buckets, two distinct save keys | quest flag survives both real archive crossings; save-slot `areaMemory` never collides the two areas |

- **The quest flag.** `0x4C20` is the same synthetic, otherwise-untouched cell the engine golden
  seeds (Area1's persistent `0x4B00..0x4EFF` quest-flag range) — seeded via
  `GameData.eclInitialMemory` on the new profile so the real browser boot reaches the identical
  real path the golden proved, exactly like every other CoAB natural route reuses a seeded host
  cell to reach a specific scripted branch without reimplementing unrelated engine surface (the
  overworld-map destination picker, `mem[0x4C9C]`/`mem[0x4C0C]`, and the "empty roadside ambush"
  auto-resolved via `autoCombat: true`, both deferred the same way the golden defers them).
- **Browser route:** `?explore=coab-natural-3` (`apps/web/src/ui/gameData.ts`'s `coab-natural-3`
  profile). Unlike every earlier natural route, this profile sets `archiveSet: { dir, areas: [1,
  4, 5], startGameArea: 4 }` instead of one hard-coded `game_area`'s archive paths — `startExplore`
  in `apps/web/src/ui/explore.ts` detects `gd.archiveSet` and routes through
  `startCrossArchiveExplore` (eager-loads all three areas via the ADR-0009 infrastructure
  `loadArchiveSet`/`archiveSetToAreaSource`, then drives the start block through a new
  `ChainDialogueMachine` — an `EclMachine` adapter over `runEclChain`'s pause/resume — presented
  through the SAME interactive `window.__dialogue` overlay every other natural route's checkpoint
  uses, so a real player or e2e drives the crossing with ordinary menu clicks) instead of the
  single-archive fetch every other profile uses. Once the chain reaches `status: 'exited'`,
  `mountCrossedDungeon` decodes the landed area's real GEO/WALLDEF/8X8D/MON/ITEM archives and hands
  off to the same shared `mountDungeonView` tail every route (single- or cross-archive) now uses.
- **No save-key collision (the leaf's explicit acceptance requirement).** `ChainDialogueMachine`
  snapshots the chain's shared memory once, immediately before the resume call that turns out to
  cross an archive (i.e. the last snapshot taken while still definitely in the start area), keyed
  by a label distinct from the landed area's own `state.map.name` (`"<title> game_area 4"` vs.
  `"<title> ECL5#49 (game_area 5)"`). `quickSave()` merges this `priorAreaMemory` bucket in
  alongside the live current-area bucket. Verified directly (not assumed) at two layers:
  - Engine unit test: `packages/engine/test/saveGame.test.ts` — "round-trips two distinct
    areaMemory keys from a cross-archive crossing without collision (ADR-0009)" round-trips a save
    with both labelled buckets through `serializeSave`/`deserializeSave` and asserts exactly two
    keys, both present, both distinct, both still `0x2A` at `'19488'` (`0x4C20 & 0xffff`).
  - Browser e2e: `apps/web/test/e2e.mjs::runExploreCoab3CrossArchive` walks the real crossing,
    saves, reads the raw `localStorage` slot JSON, and asserts `Object.keys(slot.areaMemory)` is
    exactly the two labelled keys (not one, not three) with matching values in both, then clears
    the party, reloads, re-drives the crossing from scratch, and requires `load()` to restore the
    exact walked-to pose (not just the crossing's own deterministic landing cell) plus the quest
    flag.

## CoAB Town Leg (Regional Current-City Round Trip)

**Proven 2026-07-31.** This closes CoAB's campaign-matrix town leg through the retail game's actual
regional-city composition, not through a synthetic Town mode. The legal browser route is
`?coab-regional=1` and remains continuous across the regional selector, village action,
save/reload, boundary exit, and returned selector.

| Phase | Retail contract | Browser assertion |
| --- | --- | --- |
| Regional city | `ECL5.DAX#48 -> ECL1.DAX#80`; `current_city=9`, edge 36, `BIGPIC1.DAX#121`, source cursor `(31,15)` | `ENTER CITY / JOURNEY ON / CAMP` appears on the real regional picture |
| Enter village | `ENTER CITY -> ECL5.DAX#49`; `LOAD_FILES(50,2,255)` loads `GEO5.DAX#50`; landing `(3,0,S)` | Exact run-down-village narration and byte-grounded pose are visible |
| Village action | Walk south, south, west to `(2,2,W)`; descriptor 0 / cell 34 / seed `0x1022` | `A DARK ELF PATROL ARRIVES`; COMBAT has exactly two `DK ELF FIGHTER`s; victory increments `[0x4C47]` from 0 to 1 |
| Persist | Move west once to the safe cell `(1,2,W)`, then save and reload | Disk 5 / area 49, party, pose, facing, and `[0x4C47]=1` restore without an artificial refire |
| Exit and return | Move west to `(0,2,W)`, step outward, accept the `vm_run_1` wilderness prompt; `ECL5#49 -> ECL5#48 -> ECL1#80` | `NO` stays in the village; `YES` restores node/snapshot/city 9, edge 36, BIGPIC 121, cursor `(31,15)`, and the regional action menu |

The patrol's `[0x4C47]` word is a victory counter, not a consumed-event bit. Re-entering `(2,2)`
can legitimately produce the patrol again; the persistence assertion therefore saves from
`(1,2)` and proves that reload itself does not manufacture a trigger.

Engine coverage lives in `packages/engine/test/coabRegionalTravel.test.ts`, including the exact
entry state, GEO operands, patrol roster and counter, boundary `NO`, boundary `YES`, and final
regional state. The continuous user-facing proof is
`apps/web/test/e2e.mjs::runCoabRegionalTownRoundTrip`.

**Claim boundary.** This is an authentic town/city leg because it proves the game's own city
selection, entry, in-location action, persistence, exit, and return contract. It does not establish
a distinct Town renderer: the selector is a WildernessMap BIGPIC surface and the village remains
`inDungeon=1`, DungeonMap/DUNGCOM content. It also does not claim a global destination picker or
free-walking regional map. CoAB's separately audited quest leg was subsequently proven through the
distinct Tilverton `[0x4C28]` dependency in "CoAB's Sixth Route" below.

## CoAB's Fourth Route (Ending/Late-Area, Cross-Archive)

BUILD-QUEUE item 6's ending/late-area leaf: a natural encounter -> combat -> resume -> persist
route further along CoAB's real campaign progression than the early (`ECL4#37`), middle
(`ECL2#4`), and wilderness-crossing (`ECL5#49`) routes, in a distinct major area. The campaign-
route target map (`build/gen1-campaign-route-map.json`) named `ECL6.DAX#64` (area 6), GEO cell
`(6,14)` descriptor `0x82`, `COMBAT 0x880c`, GIANT SPIDER x4 as CoAB's "ending/late" candidate.
Unlike the middle route's own JSON candidate (selector 7, rejected — forced through a different
cell first), this one's re-derivation against the real engine **confirms** the candidate cell
itself as the legally-reachable entry point, and finds it is actually a two-stage boss encounter,
not a single fight.

**Reachable via a real `NEWECL` target, not guessed.** `ECL1.DAX#80` (the wilderness hub,
already proven as CoAB's real menu/`ON_GOTO` dispatch for every inter-area transition) has a
14-target `ON_GOTO` on `mem[0x4C9B]` (copied from the destination selector `mem[0x4C9C]` at
vaddr `0x8098`). Index 9 is ADR-0009's already-proven `SAVE 1,0x4BE6; SAVE 5,0x7F12; NEWECL 49`
(area 5). **Index 13** is `SAVE 1,0x4BE6; SAVE 6,0x7F12; NEWECL 64` (vaddr `0x85c8-0x85d5`) —
area 6, byte-identical mechanism, found by a BFS over the block's decoded CFG that tracks the
last immediate value written to `0x7F12` before every reachable `NEWECL`
(`tools/scratch_scan_hub_newecl.py`, deleted after use).

**The encounter itself.** `ECL6.DAX#64`'s own `search_location` entry ANDs the loaded cell's raw
floor byte with `0x7F` (a 7-bit mask — not every CoAB block in this doc's other routes uses
`0x3F`) before a 23-way `ON_GOTO`. Masked value `2` (`0x82 & 0x7F`) is cell `(6,14)`'s own unique
descriptor and the sole cell in `GEO6.DAX#64` that masks to it. Landing there (vaddr `0x8768`)
gates entry on `[0x4CBF]!=1` (not yet consumed), then a genuine four-choice `HORIZONTAL_MENU` —
choice 0 runs `SETUP_MONSTER`/`LOAD_MONSTER(66,4,65)` into `COMBAT` at `0x880c`: **GIANT SPIDER
x4** (`MON6CHA.DAX` id 66). On a fresh visit (`[0x4CBE]` unset) the resume at `0x880d` takes an
unconditional `GOTO 0x8858` — skipping "you recall the earlier battle" flavour text — straight
into a **second** `SETUP_MONSTER`/`LOAD_MONSTER(67,1,67)` `COMBAT` at `0x886d`: **RAKSHASA x1**
(`MON6CHA.DAX` id 67, a classic AD&D "final guardian"-style foe, fitting for CoAB's late-game
content). Only after the RAKSHASA fight resolves does the script set the consumed bit
`[0x4CBF]=1` and exit.

**Reachability, re-verified against the real engine (not the JSON's walls-only BFS).** The
middle route's own promotion found its JSON candidate cell forced through a different checkpoint
first; the same caution applied here finds the OPPOSITE result — a clean path exists.
`tools/find_geo_path.py --geo GEO6.DAX --block 64 --start 12,6 --target 6,14 --facing north
--avoid-event-index <every other masked descriptor 1..22>` (the browser-style `chooseStart`
spawn for `GEO6#64` is independently `(12,6)` facing north, matching the route-map's own
derivation) finds a real 14-step wall-legal path that touches only the ambient descriptor-0
floor and the target cell itself — no forced detour through any other area-6 script.

| Saved target | Consumed state | Roster |
| --- | --- | --- |
| ECL6#64 `(6,14)` west | `[0x4CBF]=1` (only after both fights) | GIANT SPIDER x4, then RAKSHASA x1 |

**Automated evidence.**

- Engine golden (per-cell): `packages/engine/test/dungeonEvents.test.ts` ("golden CoAB ECL6 block
  64 (ending/late-area route)") — `dialogueForCell` on the real block/floor byte, asserts the
  four-choice menu, the GIANT SPIDER roster, the unconditional chain straight into the RAKSHASA
  combat with no interactive beat between them, `[0x4CBE]=1` after the first fight, and
  `[0x4CBF]=1` only after the second.
- Engine golden (cross-archive chain): `packages/engine/test/dungeonEvents.test.ts` ("golden
  ending/late-area cross-archive crossing") — a second `runEclChain` golden mirroring ADR-0009's
  own (`ECL4#37 -> hub ECL1#80 -> ECL6#64`), reusing the identical `areaSource`/`startGameArea`
  infrastructure with destination selector `13` instead of `9`. Proves `result.visited === [37,
  80, 64]` and the `setGameArea` effects fire `[1, 6]` in order — the hub dispatch into area 6 is
  real, not asserted from static analysis alone.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'CoAB ECL6#64'` row (`(6,14)` west, `0x4cbf`, mask `1`), reusing the existing
  `areaMemory` contract proven by every other route in this file.

**Claim boundary — browser wiring not yet done.** Unlike CoAB's first three routes, this one has
no `?explore=coab-natural-4` `GameData` profile, no `docs.ts`/`support.ts`/`main.ts` route-list
entry, and no `e2e.mjs` case yet. The engine-level route (both the per-cell dispatch and the real
hub crossing) and the save v2 round-trip are proven with the same rigor every other route in this
file uses; a live-controls browser replay of the full 14-step walk plus two chained tactical
combats is deferred, the same way CoK's P2 slice (`docs/engine/research/cok-natural-route.md`)
explicitly deferred its own browser wiring rather than risk a rushed, under-verified UI path
sharing files with concurrent agent work.

## Secret's Second Route

BUILD-QUEUE item 6's "repeat the middle/ending/town/wilderness/quest matrix for the remaining two
already-Persistent games" leaf: Secret's own **middle-area** natural route, in a distinct GEO cell
from Secret's proven early anchor (`ECL3.DAX#97`, `docs/engine/research/secret-natural-encounter-
route.md`). The campaign-route target map (`build/gen1-campaign-route-map.json`) named
`ECL1.DAX#16` (area 1), GEO cell `(14,11)` descriptor `0x82`, selector 2, `COMBAT 0x892a`, BC LORD
x7 as the middle candidate. **Unlike CoAB's own middle route** (whose literal target-map cell was
NOT legally reachable and needed an earlier checkpoint substituted), Secret's literal candidate
here **holds up** — the same outcome as CoAB's Fourth (ending) Route, not its Second (middle) Route.

**Reachability, re-verified against the real engine.** `tools/find_geo_path.py --geo GEO1.DAX
--block 16 --start 5,3 --facing north --target 14,11` finds a clean 17-step directed-edge path
(7 east, 8 south, 2 east) from the browser's own `chooseStart (5,3,north)` spawn for `GEO1#16`,
with zero blocked cells. Two intermediate cells crossed en route carry their own nonzero
descriptors (selector 18 at `(8,3)` and `(10,3)`; selector 14 at `(13,11)`); neither forces
resolution of a different COMBAT before reaching the target cell, so the reachability finding
itself stands.
>
> **Correction (2026-07-16, Secret's Fourth Route leaf).** This paragraph originally also claimed
> both intermediate descriptors were "harmless one-shot flavour-text branches." Re-verified against
> the REAL engine (`dialogueForCell`, not a hand-traced bytecode read) rather than assumed: selector
> 14 at `(13,11)` genuinely is harmless one-shot text ("A SIGN OVER THIS DOOR READS ' .'"). Selector
> 18 at `(8,3)`/`(10,3)` is **not** — with the SAME `[0x4c4d]=1` seed this route itself uses, it is a
> real, interactive two-choice prompt ("THE ROOM CONTAINS A SIMPLE ARCHWAY...") that chains into a
> different area on `YES`. This route's own e2e case (`runExploreSecret2NaturalCombat`) still passes
> because it drives `window.__explore.move()` directly rather than simulating keyboard-gated
> dialogue, so it silently plows through the prompt without answering it — a pre-existing gap in
> that e2e case's coverage (not a behavior change), left as-is since fixing it is out of scope for
> this leaf. See "Secret's Fourth Route" below for the full archway trace and the real destination.

**The encounter itself.** `ECL1.DAX#16`'s own `search_location` entry (vaddr `0x8513`) ANDs the
loaded cell's floor byte with `0x3f`, then dispatches a multi-way `ON_GOTO` on the masked value.
Masked value `2` (`0x82 & 0x3f`) is cell `(14,11)`'s own unique descriptor in `GEO1.DAX#16`. The
route requires **one runtime seed** (`[0x4c4d] != 0` — matching the target map's own
`requires_runtime_seed: true` flag) and then a genuine "MARCUS door scene that escalates into a
guard confrontation": three sequential two-choice checkpoints, each needing the **second** option
to stay on the combat path — "MARCUS IS INVOLVED..." `YES`/`NO` -> NO; "WHAT DO YOU DO?"
`LEAVE`/`STAY` -> STAY; "MORE GUARDS RUSH OUT... DO YOU LEAVE?" `YES`/`NO` -> NO, which runs
`SETUP_MONSTER`/`LOAD_MONSTER(69,7,69)` into `COMBAT` at `0x892a`: **BC LORD x7** (`MON1CHA.DAX`
id 69). Victory sets the consumed bit `OR [0x4c2e], #1` at `0x8936` and the runner ends cleanly
(`kind: 'end'`) — no further story beats chain afterward, unlike CoAB's middle route.

| Saved target | Consumed state | Roster |
| --- | --- | --- |
| ECL1#16 `(14,11)` east | `[0x4c2e]=1` | BC LORD x7 |

**Automated evidence.**

- Engine golden (per-cell): `packages/engine/test/dungeonEvents.test.ts` ("golden Secret ECL1
  block 16 (middle-area route)") — `dialogueForCell` on the real block/floor byte, asserts the
  unique selector-2 match, all three checkpoint prompts and their exact choice labels in order,
  the BC LORD roster, and `[0x4c2e]` going from `0` to `1` only after victory.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'Secret ECL1#16'` row (`(14,11)` east, `0x4c2e`, mask `1`), reusing the existing
  `areaMemory` contract proven by every other route in this file.
- Browser route: `?explore=secret-natural-2` (`apps/web/src/ui/gameData.ts`'s `secret-natural-2`
  profile, `eclInitBlock: 16`, same `ECL1.DAX`/`GEO1.DAX` archives as the `secret`/`secret-natural`
  profiles, seeded with `eclInitialMemory: [[0x4c4d, 1], [0x4c2e, 0]]` matching the engine golden).
- Browser e2e: `apps/web/test/e2e.mjs::runExploreSecret2NaturalCombat` walks the real 17-step GEO
  path, drives all three real `window.__dialogue` checkpoints (choice index 1 each time — a
  genuine three-decision player path, not a degenerate auto-drain), asserts the BC LORD roster
  (capped to the first 6 combatants by the tactical placement cap, `apps/web/src/ui/combat.ts`,
  the same pre-existing engine-wide constant CoAB's own middle route hits), resolves combat, checks
  the resume flag, and reuses `verifyNaturalPersistence` for the save/reload/no-refire proof.

**Corpus-promotion note.** As with CoAB's Second Route, this promotion lives entirely in this doc
plus its own engine golden, save round-trip row, and e2e coverage — `tools/goldbox_corpus_routes
.json`'s one-route-per-`profile_id` schema keeps Secret's existing `secret-of-the-silver-blades`
entry pointed at the first (early-anchor, `ECL3#97`) route; changing that schema to hold two
routes per profile is out of scope for this leaf.

**Scope note.** This proves Secret's middle area only. Ending/town routes for Secret are proven
separately below ("Secret's Third Route", "Secret's Fourth Route"); wilderness/quest routes remain
open — see "Secret's Wilderness/Overland Classification" below for wilderness specifically. Pool's
equivalent matrix entries are separate, concurrent work and are not covered here.

## Secret's Third Route (Ending/Late-Area)

BUILD-QUEUE item 6's ending/late-area leaf for Secret: a natural encounter -> combat -> resume ->
persist route further along Secret's real campaign progression than the early (`ECL3#97`) and
middle (`ECL1#16`) routes, in a distinct major area. The campaign-route target map
(`build/gen1-campaign-route-map.json`) named `ECL2.DAX#68` (area 2), GEO cell `(6,8)` descriptor
`0x82` (masked selector 2), `COMBAT 0x856b`, "BC VETERAN x8" as the literal ending/late candidate —
re-verified here against the real engine, not trusted from the JSON, the same rigor CoAB's and
Pool's own middle-route leaves used.

**Finding: like CoAB's and Pool's middle routes, the literal `(6,8)`/selector-2 cell does NOT hold
up as the reachable entry point — and the real blocker here is more extreme than either of those.**
`chooseStart`'s own algorithm spawns the party at `(4,4)` facing north, inside a tiny 3x3 room
(`x:3..5, y:3..5`); a directed BFS shows the room has exactly ONE exit cell, `(5,4)` (masked
descriptor `42`, raw `0xaa`) — blocking it strands the party in an 8-cell pocket with `(6,8)`
unreachable. Past that door, TWO MORE masked descriptors on the shortest route individually gate
off `(6,8)` the same way: `41` at `(8,4)` and `43` at `(10,7)` (`tools/find_geo_path.py --geo
GEO2.DAX --block 68 --start 4,4 --target 6,8 --facing north --event-mask 0x3f --avoid-event-index
N`, run once per index, fails "target (6, 8) is not reachable" for every `N` in `{42, 41, 31, 43,
23, 46}` — every nonzero descriptor on the walk, not only some of them). `GEO2#68` is effectively a
single-file gauntlet corridor from spawn, not an open room with alternate paths.

**The encounter itself.** Descriptor `42`'s own branch (vaddr `0x9575`) is real, substantial
content, not a dead end: gated on `[0x4c9e]&0x40==0` (fresh/default `0`), it is a genuine TWO-STAGE
boss fight — the same "chained `SETUP_MONSTER`/`LOAD_MONSTER`/`COMBAT` pair, consumed bit set only
after both" shape CoAB's own ending/late-area route (`ECL6#64`) and Pool's own ending/late-area
route (`ECL8#29`) use. `SETUP_MONSTER`/`PRINTCLEAR`/a one-choice `GOSUB 0x9949` "press on"
continue/`CLEARMONSTERS`/`LOAD_MONSTER(0xd,9,0xd)` into `COMBAT` at vaddr `0x95e1`: **FIRE GIANT x9**
(`MON1CHA.DAX` id `0xd` — Secret ships ONE shared monster catalogue for the whole game, unlike
CoAB's per-area files, so there is no "MONnCHA.DAX absent" fallback here, just the game's own
single-file convention). On victory (not defeat — the shared `COMPARE [0x7ec7],0x80;IF_GT;GOTO
0x9923` death branch every combat in this block reuses), execution falls straight through to a
second `SETUP_MONSTER`/`PRINTCLEAR`/another one-choice `GOSUB 0x9949` continue/
`CLEARMONSTERS`/`LOAD_MONSTER(0x1b,4,0x1b)` into `COMBAT` at vaddr `0x9626`: **12HD PYROHYDRA x4**
(`MON1CHA.DAX` id `0x1b`). Only after BOTH fights resolve does the script set the consumed bit
(`OR [0x4c9e],#0x40 -> [0x4c9e]` at vaddr `0x9632`) and `EXIT` cleanly — no further chain, matching
every other Secret/Pool/CoAB route's shape.

This checkpoint needs no runtime seed at all (simpler than either of Secret's own other two
routes): reaching it is nothing but walking one step east from `chooseStart`. `(6,8)`/selector 2
(`BC VETERAN x8`) remains valid retail content but is only ever reached pre-consumed, well past
this checkpoint (and the two further checkpoints at `(8,4)`/`(10,7)`) — the static target map's
`ecl2-dax-68` candidate entry is left unmodified (`route_proven: false`), correct as a byte-decoded
candidate, not as a claim about which cell in that block is the actual reachable entry point.

| Saved target | Consumed state | Roster |
| --- | --- | --- |
| ECL2#68 `(5,4)` east (masked selector 42, not the JSON's selector-2 cell `(6,8)`) | `[0x4c9e]=0x40` (only after BOTH waves) | FIRE GIANT x9, then 12HD PYROHYDRA x4 (two chained fights) |

**Automated evidence.**

- Engine golden (per-cell): `packages/engine/test/dungeonEvents.test.ts` ("golden Secret ECL2 block
  68 (ending/late-area route)") — confirms the JSON's literal `(6,8)`/selector-2 cell is unreachable
  without first crossing three gating descriptors, decodes the real reachable `(5,4)` cell, drives
  `dialogueForCell` through the opening continue into the FIRE GIANT combat, asserts `[0x4c9e]` stays
  `0` after that victory, chains into the PYROHYDRA combat via `runner.afterCombat('victory')` ->
  `runner.choose(0)` -> combat, and asserts `[0x4c9e]=0x40` only after the second victory.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'Secret ECL2#68'` row (`(5,4)` east, `0x4c9e`, mask `0x40`), reusing the existing
  `areaMemory` contract proven by every other route in this file.
- Browser route: `?explore=secret-natural-3` (`apps/web/src/ui/gameData.ts`'s `secret-natural-3`
  profile, single-archive shape loading Secret's `ECL2.DAX`/`GEO2.DAX`/`WALLDEF2.DAX`/`8X8D2.DAX`
  directly at block 68 — a fresh archive from `secret`/`secret-natural`/`secret-natural-2`, all area
  1 or 3 — seeded with `eclInitialMemory: [[0x4c9e, 0]]` matching the engine golden).
- Browser e2e: `apps/web/test/e2e.mjs::runExploreSecret3NaturalCombat` walks the real 1-step GEO path
  from `chooseStart (4,4,north)` to `(5,4,east)`, drains the opening one-choice continue, asserts the
  first FIRE GIANT roster (capped to the first 6 combatants by the tactical placement cap,
  `apps/web/src/ui/combat.ts`, the same pre-existing engine-wide constant every other capped route in
  this file hits), resolves the first combat, checks `[0x4c9e]` is still `0`, drains the second
  one-choice continue, asserts the 12HD PYROHYDRA roster (all 4, under the cap), resolves the second
  combat, checks the resume flag (`0x40`), and reuses `verifyNaturalPersistence` for the
  save/reload/no-refire proof.

**Corpus-promotion note.** As with Secret's Second Route, this promotion lives entirely in this doc
plus its own engine golden, save round-trip row, and e2e coverage — `tools/goldbox_corpus_routes
.json`'s one-route-per-`profile_id` schema is unchanged by this leaf.

**Scope note.** This proves Secret's ending/late area only. Town/wilderness/quest routes for Secret
are covered separately (see "Secret's Fourth Route" and "Secret's Wilderness/Overland
Classification" below).

## Secret's Fourth Route (Town Enter/Exit)

BUILD-QUEUE item 6's town-enter/exit leaf for Secret, following the exact method CoAB's and Pool's
own agents used for this leaf: find every reachable dungeon/wilderness engine-mode toggle write via
`tools/map_gen1_area_mode_writes.py` (**zero hits anywhere in Secret's full ECL corpus** — unlike
CoAB's 39 hits on `SAVE …,0x4BE6`, Secret's engine does not use that fixed-address toggle, or any
other ECL-visible fixed-address dungeon/wilderness flag, at all), then determine from Secret's OWN
data whether a discrete GEO-backed town exists, rather than assuming either way.

**Finding, unlike CoAB: Secret DOES have a real, named, GEO-backed town.** `ECL1.DAX#16`/
`GEO1.DAX#16` — the SAME block Secret's already-shipped `secret-natural-2` middle-area route uses —
is "New Verdigris": Mayor Priam's opening greeting names it directly ("I AM PRIAM, MAYOR OF NEW
VERDIGRIS AND YOUR HOST"), the block has named shop/service buildings (Marcus's "PRIVATE RESIDENCE"
among them — the middle route's own checkpoint), and its own `vm_run_1` handler has a dedicated
"YOU ARE LEAVING THE TOWN. DO YOU CONTINUE?" prompt gated on `[0x7ED5]==1`. This is a genuinely
different, more positive outcome than CoAB's own leaf (`docs/engine/research/
coab-town-classification.md`), whose closest candidate needed cross-archive infrastructure that did
not yet exist and was left an honest, well-evidenced block.

**Entry and the in-town action are both already fully proven — reusing Secret's Second Route as-is,
not rebuilt here.** "Normal-controls entry" is the Second Route's own 17-step `chooseStart
(5,3,north)` -> `(14,11)` walk; "an in-town action that sets host state" is that same route's MARCUS
door-scene -> guard-confrontation -> **BC LORD x7** combat, which sets `[0x4c2e]=1`. Both are live
today at `?explore=secret-natural-2`. This route continues from that exact post-victory state to
prove the third leg the method calls for: "exit back to dungeon."

**The exit mechanism — a real interactive archway, not the `vm_run_1` "LEAVING THE TOWN" prompt.**
Two mechanisms exist in `ECL1.DAX#16` that could plausibly serve as a town exit: (a) `vm_run_1`'s own
`[0x7ED5]==1`-gated "YOU ARE LEAVING THE TOWN" prompt (an edge-of-map condition the live `Explorer`
has no hook for — `BlockReason = 'wall' | 'edge'` in `packages/engine/src/world/explorer.ts` treats
a map-edge step as a hard block with no ECL dispatch at all, a genuine engine gap distinct from this
leaf's own scope), and (b) `search_location`'s own selector-18 archway prompt, reachable through the
ALREADY-FULLY-SUPPORTED per-cell dialogue path every other route in this project uses. This route
uses (b).

**Correction to Secret's Second Route's own write-up** (also noted inline there): that section
originally characterized the two selector-18 cells crossed en route to Marcus (`(8,3)`/`(10,3)`) as
"harmless one-shot flavour-text branches," derived from reading the bytecode rather than running it.
Re-verified against the real engine (`dialogueForCell`) with the SAME `[0x4c4d]=1` seed that route
uses: selector 18 is a real, interactive two-choice prompt — "THE ROOM CONTAINS A SIMPLE ARCHWAY
THAT BURSTS INTO SHIMMERING ENERGY. DO YOU STEP THROUGH?" / `['YES','NO']`. `NO` (index 1) stays on
the Second Route's own walk with no side effect; `YES` (index 0) runs `NEWECL 33` — a same-archive
chain (no `SAVE …,0x7F12`/`setGameArea` effect), the identical shape Pool's own `ECL1#18 -> ECL4#2`
town-exit leg uses.

**Reachability of the exit cell.** `tools/find_geo_path.py --geo GEO1.DAX --block 16 --start 14,11
--facing east --target 10,3` finds a clean 12-step directed-edge return path from the Marcus
checkpoint (2 west, 8 north, 2 west), crossing selector 14 at `(13,11)` first — confirmed harmless
("A SIGN OVER THIS DOOR READS ' .'", the SAME descriptor the Second Route's write-up already
correctly identified) — before reaching `(10,3)`, one of the two selector-18 archway cells. Selector
18 recurs at nine `GEO1.DAX#16` cells total (unlike every other checkpoint cell in this project's
goldens), so the engine golden pins the SPECIFIC reachable cell `(10,3)`, not "the only one."

**The chain.** `ECL1.DAX#33`'s own `initial_entry` prints `"YOU'VE ENTERED THE DOMAIN OF THE WELL OF
KNOWLEDGE."` / `"YOU HEAR THE CLASH OF ARMS."` — a genuinely different, dungeon-flavoured GEO-backed
area (`GEO1.DAX#33` exists and has its own `search_location`/`vm_run_1` handlers: real walkable
content, not a text-only dead end), then pauses on one shared "press on" continue before exiting
cleanly. Both of the town leg's own memory cells (`[0x4c4d]`, `[0x4c2e]`) survive the chain
untouched — the same cross-block persistence proof CoAB's and Pool's own area-crossing goldens use.

| Saved target | Consumed state | Landing |
| --- | --- | --- |
| ECL1#16 `(10,3)` west, archway `YES` | `[0x4c2e]=1` (carried from the Second Route's own checkpoint, untouched by the chain) | `NEWECL 33` -> ECL1#33 "The Well of Knowledge" (real GEO-backed area) |

**Automated evidence.**

- Engine golden (chain): `packages/engine/test/dungeonEvents.test.ts` ("golden Secret ECL1 block 16
  archway -> block 33 (town-exit route, no ADR-0009 game_area register)") — decodes the real
  `(13,11)`/`(10,3)` cells, drives `dialogueForCell` through the sign (confirmed harmless) and the
  archway prompt (confirmed interactive, exact choice labels), chains via `runner.choose(0)` into
  `chained.blockId === 33`, then continues with `runEclChain` carrying the SAME memory into block
  33's `initial_entry`, asserting both real narration strings and that `[0x4c4d]`/`[0x4c2e]` survive
  untouched.
- Save v2 persistence: covered by the EXISTING `'Secret ECL1#16'` row in
  `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix (`(14,11)` east, `0x4c2e`,
  mask `1`) — this leaf's own "in-town action that sets host state" is the identical mechanism, so
  no new row was needed; the chain's own memory-persistence proof lives in the engine golden above
  instead (matching how CoAB's and Pool's own cross-block/cross-archive goldens prove persistence
  through their chain's own `memory` Map assertion rather than a dedicated save-matrix row per leg).
- Browser route: entry + the in-town action are live today at the ALREADY-SHIPPED
  `?explore=secret-natural-2` (no new `GameData` profile added by this leaf).

**Scope note (browser wiring for the exit itself) — UPDATED 2026-07-16, now LIVE.** This proves the
archway crossing at the engine level, byte-for-byte against the real disassembly — the same rigor as
every other golden in this file. The "mid-walk chain re-mount" capability this note originally
deferred (the web host's per-cell dialogue path discarding a `dialogueForCell` `'chain'` result
instead of re-mounting into the new block's own GEO/walls) now exists:
`apps/web/src/ui/dialogue.ts`'s `present()` grew an `onChain` hook fired when a `'chain'` turn's
`chainTo` returns null, and `apps/web/src/ui/explore.ts`'s new `remountChainedArea(blockId,
carriedMemory)` implements it — fetching the chained block's own full archive set (a new
`GameData.chainTargets` profile field, same-archive here since it just repeats `secret-natural-2`'s
own `eclPath`/`geoPath`/…), `loadDungeon`-ing it with the carried live `areaMemory` Map, and
re-mounting the shared `mountDungeonView` pipeline in place. Wired live via `secret-natural-2`'s
`chainTargets: { 33: {...} }`. Proven end-to-end by `runExploreSecret4TownExit`
(`apps/web/test/e2e.mjs`, id `explore-secret4-town-exit`): real GEO walk to the archway, the real
YES prompt, real post-crossing narration ("WELL OF KNOWLEDGE"/"CLASH OF ARMS") and a real walkable
`ECL1.DAX#33` GEO, plus save/reload persistence across the chain boundary (redriving the full
deterministic sequence after a real page reload, mirroring CoAB's own `driveCoab3Crossing`
reload-then-redrive pattern). Entry and the in-town action remain live via `secret-natural-2` as
before. See `docs/engine/BUILD-QUEUE.md`'s 2026-07-16 "town-exit LIVE browser wiring" entry for full
gate numbers.

## Secret's Wilderness/Overland Classification

BUILD-QUEUE item 6's wilderness/overland leaf for Secret. Unlike the town leaf above, this one
resolves negatively — a different, and more clear-cut, root cause than CoAB's own wilderness/town
leaf (`docs/engine/research/coab-town-classification.md`), but the same class of honest, evidenced
block, not a synthetic seam.

**Two independent, mutually-reinforcing pieces of evidence.**

1. **Zero statically-reachable ECL writes to any dungeon/wilderness engine-mode toggle.**
   `tools/map_gen1_area_mode_writes.py` — the same BFS-over-every-ECL-block-in-every-archive scanner
   that found CoAB's 39 hits on `SAVE …,0x4BE6` (`Area1.inDungeon`) — finds **zero** hits anywhere in
   Secret's full ECL corpus (`ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX`, every block, both direct and
   `[event index]`-indirected NEWECL targets). Secret's engine does not use that fixed address, or
   apparently any other ECL-visible fixed-address dungeon/wilderness flag, at all.
2. **Secret's retail GOG install ships no `WILDCOM.DAX` file at all.** Both Pool and CoAB ship a
   `WILDCOM.DAX` (the wilderness-mode command-table archive) alongside their `DUNGCOM.DAX`
   (dungeon-mode command table); Secret's install directory (`C:/Program Files (x86)/GOG
   Galaxy/Games/Secret of the Silver Blades/`) contains ONLY `DUNGCOM.DAX` — confirmed by a direct
   directory listing, not inferred. A game with no wilderness command-table archive at all has no
   wilderness UI mode to enter in the first place, independent of whatever ECL scripting might or
   might not gate it.

Together these point at a structural absence, not a reachability gap this project's tooling merely
failed to find: Secret's setting (three isolated dwarven/gnomish underground holds — New Verdigris
among them — reached by teleportation between adventures per the module's own premise) has no
overland travel between areas at all, unlike Pool's and CoAB's city-and-countryside settings. This
matches `docs/engine/research/gen1-campaign-route-map.md`'s own prior note that Secret's archive set
lacks the wilderness-mode assets — that doc's claim that "both WILDCOM.DAX/DUNGCOM.DAX exist in this
game's archive set" is corrected here: only `DUNGCOM.DAX` does.

**Scope note.** Per this project's own "UNLOCATED beats invention" convention
(`docs/engine/HANDOFF.md` §5), this is left an honest, well-evidenced block rather than a forced or
synthetic wilderness route. Combined with the town leaf above, Secret's early/middle/ending/town
matrix legs are all now proven at the engine level (town's live exit wiring deferred as its own
scope note); wilderness is structurally absent, not merely unproven, and quest remains open. Secret
is **not** promoted to Campaign by this leaf (matching CoAB's own honestly-unpromoted precedent) —
no corpus/support-matrix change was made to claim otherwise.

## Pool's Second Route

BUILD-QUEUE item 6's "repeat the middle/ending/town/wilderness/quest matrix for the remaining two
already-Persistent games" leaf: Pool's own **middle-area** natural route, in a distinct
`ECL2.DAX`/`GEO2.DAX` major area from Pool's proven early anchor (`ECL1.DAX#18`, `docs/engine/
research/pool-natural-encounter-route.md`). The campaign-route target map (`build/gen1-campaign-
route-map.json`) named `ECL2.DAX#20` (area 2), GEO cell `(1,5)` descriptor `0x8e`, masked selector
14, `COMBAT 0xabf7`, OGRE x1 + GNOLL x2 + HOBGOBLIN LDR x2 as the middle candidate. **Like CoAB's
own middle route** (and unlike Secret's own middle route, which held up as-is), Pool's literal
target-map candidate does **not** hold up under real-engine re-verification — the same "UNLOCATED
beats invention" caution CoAB's own promotion required.

**Finding: the literal (1,5)/selector-14 cell is not legally reachable fresh.** `ECL2.DAX#20`'s
`search_location` entry computes the masked descriptor once (`AND [0xc04f], #0x7f -> [0x6e82]`),
then walks a manual linear-search loop (`[0x9800]` `0..20`, `COMPARE [0x9800],[0x6e82]` / `IF_EQ`,
else `[0x9800]+=1` and retry, `EXIT` past index 20) before its 21-way `ON_GOTO [0x9800]` — a
different shape from the simpler direct `AND`+`ON_GOTO` pattern Pool's own early anchor uses, and
one the static scanner's branch exploration jumps straight past (it walks directly to any
`ON_GOTO` target without validating the loop actually reaches that index). A directed BFS replay
from `chooseStart (12,6,north)` to `(1,5)` is forced, in all 28 legal steps, through **three**
cells with masked descriptor `13` first — `(0,7)` (25 steps), then `(0,6)`, then `(0,5)`,
immediately before the final `east` step onto `(1,5)` itself. `tools/find_geo_path.py --geo
GEO2.DAX --block 20 --start 12,6 --target 1,5 --facing north --avoid-event-index 13` (mask `0x7f`)
**fails** — "target (1, 5) is not reachable from (12, 6)" — proving there is no way to reach `(1,5)`
without first stepping onto a masked-13 cell, exactly mirroring CoAB's "every walk is forced
through the checkpoint first" finding.

**The checkpoint itself.** Descriptor `13`'s own `ON_GOTO` branch (vaddr `0xab49`) is real content,
not a dead end: gated on `[0x4acf]!=0xff` (fresh/default `0`, so the guard's `EXIT` is skipped), it
runs `SETUP_MONSTER`, `APPROACH`, a `PRINTCLEAR` ("GUARDS RUN TO INTERCEPT YOU."), the SAME shared
`GOSUB 0xb6bc` one-choice "press on" menu subroutine the target map's own (1,5)/selector-14 branch
also calls, then `CLEARMONSTERS` / `LOAD_MONSTER(4,30,4)` / `LOAD_MONSTER(5,4,5)` into `COMBAT` at
vaddr `0xab90` — **ORC x30** (`MON2CHA.DAX` id 4) + **ORC LEADER x4** (id 5). Resume (`0xab91`)
runs a `GOSUB 0xb69c` (shared treasure/victory narration, also reused by the (1,5) branch) then
`SAVE 0xff,[0x4acf]` (the consumed flag) and an in-block `EXIT` — no further chain. Two other
nonzero descriptors on the same walk (`21` at several cells, `7` at `(1,8)`/`(2,8)`/`(3,8)`) are
byte-traced harmless: masked value `21` exceeds the `ON_GOTO`'s own 21-entry bound (`0..20`) and
hits the loop's `IF_GT #0x14; EXIT` guard immediately; masked value `7` is a guarded one-shot
`DELAY`/`RANDOM` three-way flavour-text branch (`[0x4a0a]` one-shot flag) with no
`COMBAT`/`SETUP_MONSTER` on either arm. So descriptor 13's checkpoint — not `(1,5)`'s own cell — is
Pool's real, legally-reachable middle-area natural route; `(1,5)`/selector 14 remains valid retail
content but is only ever reached pre-consumed, after the checkpoint has already fired (its own
`[0x4ad0]` guard is a DIFFERENT word than this checkpoint's `[0x4acf]`, so the two encounters do
not share consumed state). The static target map's `ecl2-dax-20` middle candidate entry is left
unmodified (`route_proven: false`) — correct as a byte-decoded candidate, not as a claim about
which cell in that block is the reachable entry point.

| Saved target | Consumed state | Roster |
| --- | --- | --- |
| ECL2#20 `(0,7)` north (selector 13 checkpoint, not the JSON's selector-14 cell) | `[0x4acf]=0xff` | ORC x30, ORC LEADER x4 |

**Automated evidence.**

- Engine golden (per-cell): `packages/engine/test/dungeonEvents.test.ts` ("golden Pool ECL2 block
  20 (middle-area route)") — confirms the JSON's literal (1,5)/selector-14 cell is unique but only
  reachable post-checkpoint, decodes the real selector-13 checkpoint cells, drives
  `dialogueForCell` through the "GUARDS RUN TO INTERCEPT YOU." one-choice continue, asserts the
  ORC/ORC LEADER roster, and `[0x4acf]` going from `0` to `0xff` only after victory.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'Pool ECL2#20'` row (`(0,7)` north, `0x4acf`, mask `0xff`), reusing the existing
  `areaMemory` contract proven by every other route in this file.
- Browser route: `?explore=pool-natural-2` (`apps/web/src/ui/gameData.ts`'s `pool-natural-2`
  profile, `eclInitBlock: 20`, same `ECL2.DAX`/`GEO2.DAX` archives as the plain `pool` profile,
  whose own `eclInitBlock: 18` is a different, area-1 dungeon entry, seeded with
  `eclInitialMemory: [[0x4acf, 0]]` matching the engine golden).
- Browser e2e: `apps/web/test/e2e.mjs::runExplorePoolNatural2Combat` walks the real 25-step GEO
  path from `chooseStart (12,6,north)` to the checkpoint cell `(0,7)`, asserts the "GUARDS RUN TO
  INTERCEPT YOU." checkpoint text, drains its one-choice continue beat(s), asserts the ORC roster
  (capped to the first 6 combatants by the tactical placement cap, `apps/web/src/ui/combat.ts`, the
  same pre-existing engine-wide constant CoAB's and Secret's own middle routes hit — ORC is loaded
  first, so all 6 surviving slots are ORC, not ORC LEADER), resolves combat, checks the resume
  flag, and reuses `verifyNaturalPersistence` for the save/reload/no-refire proof.

**Corpus-promotion note.** As with CoAB's and Secret's Second Routes, this promotion lives entirely
in this doc plus its own engine golden, save round-trip row, and e2e coverage —
`tools/goldbox_corpus_routes.json`'s one-route-per-`profile_id` schema keeps Pool's existing
`pool-of-radiance` entry pointed at the first (early-anchor, `ECL1#18`) route; changing that schema
to hold two routes per profile is out of scope for this leaf.

**Scope note.** This proves Pool's middle area only. Ending/town/wilderness/quest routes for Pool
remain open, matching this leaf's own explicit "middle" framing.

## Pool's Third Route (Ending/Late-Area)

BUILD-QUEUE item 6's ending/late-area leaf for Pool: a natural encounter -> combat -> resume ->
persist route further along Pool's real campaign progression than the early (`ECL1#18`) and middle
(`ECL2#20`, checkpoint cell `(0,7)`) routes, in a distinct major area. The campaign-route target map
(`build/gen1-campaign-route-map.json`) named `ECL8.DAX#29` (area 8), GEO cell `(7,8)` descriptor
`0x02`, as Pool's "ending/late" candidate. Re-deriving it against the real engine finds the literal
JSON cell is real content but NOT the combat trigger — a third, previously undocumented
`search_location` dispatch shape routes the real fight through a different, adjacent cell.

**Finding: a `GETTABLE`-indirected `ON_GOTO`, not a direct mask or a linear-search loop.**
`ECL8.DAX#29`'s `search_location` entry ANDs the loaded cell's floor byte with `0x7F` (`AND
[cell],#0x7F -> [tmp]`), same as Pool's own early/middle routes' mask width, but then — unlike
either of them — feeds that masked value through a `GETTABLE` read against an embedded byte table
(base vaddr `0xafce`) before the `ON_GOTO`, i.e. the dispatch index is `table[masked_descriptor]`,
not `masked_descriptor` itself. Decoding the table shows masked value `2` (the JSON's own `(7,8)`
cell) maps to `ON_GOTO` arm 3, a SHARED "you sense a growing danger" flavour branch with no
`SETUP_MONSTER`/`COMBAT` on it at all — harmless, not the real fight. Masked value `1` is the
table's ONLY preimage for arm 2, the arm that actually reaches `COMBAT 0xa337`. `GEO8.DAX#29`
confirms `(7,8)` is the map's sole `floor & 0x7F == 2` cell and `(7,7)` — one step north — is the
sole `floor & 0x7F == 1` cell, so the real trigger is `(7,7)`, not `(7,8)`. This is a genuinely new
dispatch shape for this project's ECL corpus: Pool's early anchor and CoAB/Secret's own routes use a
direct mask-then-`ON_GOTO`; Pool's own middle route uses a manual linear-search loop; this is the
first `GETTABLE`-indirected case found.

**Reachability, re-verified against the real engine.** `tools/find_geo_path.py --geo GEO8.DAX
--block 29 --start 11,2 --target 7,7 --facing north` (the browser-style `chooseStart` spawn for
`GEO8#29` is `(11,2)` facing north) finds a clean 9-step directed-edge path (south, south, west,
south, south, south, west, west, west) ending at `(7,7)` facing west. Four intermediate cells carry
nonzero masked descriptors (`4` at four cells, `18` and `16` at one each) rather than the ambient
`0` floor; tracing their own `GETTABLE`-indexed arms confirms none of them is `COMBAT` or a
detour-forcing checkpoint (unlike Pool's own middle route, where every walk was genuinely forced
through a checkpoint first) — they resolve to the same class of harmless flavour/"sense of danger"
branches as masked value `2`'s own arm, so no forced substitution was needed here, the same outcome
as CoAB's own ending-route leaf (its literal JSON candidate held up) rather than its middle-route one
(which needed an earlier checkpoint substituted). One of those harmless arms independently calls the
engine's `SURPRISE`/`PARTY_SURPRISE` opcodes; this build's VM writes their roll result to a
CoAB-derived fixed address (`SURPRISE_RESULT_ADDR = 0x02cb` in `packages/engine/src/ecl/vm.ts`) that
does not match Pool's own script-referenced memory cell — a pre-existing engine simplification (not
introduced by this leaf) that happens to make this particular branch deterministically harmless
rather than a real ambush in the current engine.

**The encounter itself.** Landing on `(7,7)` (vaddr reached via `ON_GOTO` arm 2) opens with a
`PRINTCLEAR` ("MONSTERS FROM THE SURROUNDING BUILDINGS ATTACK YOU.") behind a degenerate ONE-choice
"press to continue" menu (not a genuine branching decision), then `SETUP_MONSTER`/`LOAD_MONSTER`
into `COMBAT` at vaddr `0xa337`: **KOBOLD x6** (`MON8CHA.DAX` id 0) + **KOBOLD LEADER x3** (id 1).
Victory's resume does not set the consumed flag yet — it runs a second flavour beat ("A BAND OF
KOBOLDS CLIMBS FROM THE WELL AND ATTACKS.") straight into an IDENTICAL second `COMBAT` (same
roster, same monster ids/counts). Only after that SECOND fight resolves does the script set
`[0x4a23]=1` and exit — the same two-wave shape as CoAB's Fourth Route (GIANT SPIDER then RAKSHASA)
and Secret's Third Route (FIRE GIANT then PYROHYDRA), except here both waves share one roster
rather than escalating to a different boss.

**Booting the block needed its own `eclEntryOffset`, independently re-derived.** Like the previously
flagged (and reverted) concern for the `pool-natural-2` profile, `ECL8.DAX#29`'s default VM entry
(`vm_run_1`, the dialect's `headerLen`) does not emit a `LOAD_FILES`/`LOAD_PIECES` effect on a fresh
(non-crossing) boot, so `loadDungeon()` throws. Tracing the block's own disassembly (not copying the
earlier reverted diff) finds a straight-line "normal in-area boot" leaf at file offset `0x35d`
(vaddr `0x9c5b`): `LOAD_FILES(29,2,0xff)` / `LOAD_PIECES(3,0x14,1)` / `EXIT`, unconditional, no
memory-state compares before it. `loadDungeon(..., { entry: 0x35d })` succeeds (`geoBlockId=29`,
`pieces=[3,20,1]`); the `pool-natural-3` profile sets `eclEntryOffset: 0x35d`.

**A real engine-code fix was needed to demonstrate the second wave through actual player movement.**
Unlike CoAB4/Secret3, this checkpoint's opening prompt is a degenerate ONE-choice continue (not a
real >=2-choice menu), so `apps/web/src/ui/explore.ts`'s `runStepEvent` takes the non-interactive
auto-drain path (`resolveCombat`/`drainAfterCombat`) rather than the interactive
`openDialogueAt`/`present()` path that already recursively chains combats. `drainAfterCombat`
previously discarded a chained second `combat` turn reached via `runner.afterCombat()` on that
path — the first wave fought fine, but the second wave's roster and consumed-flag write never
happened when driven by real `window.__explore.move()` calls, only when calling the engine runner
directly. Fixed by extending `drainAfterCombat` to return its terminal turn alongside the drained
text, and `resolveCombat`'s `onEnd` to relaunch the tactical overlay with the SAME runner when that
terminal turn is another `combat` — mirroring `dialogue.ts`'s own recursive combat-chain handling,
just for the non-interactive path. Every other existing route's drained terminal turn is always
`'end'`, so this is a zero-behavior-change addition for them (confirmed: engine test suite unchanged
at 145 files / 1622 tests before and after).

| Saved target | Consumed state | Roster |
| --- | --- | --- |
| ECL8#29 `(7,7)` west (masked selector 1, not the JSON's selector-2 cell `(7,8)`) | `[0x4a23]=1` (only after BOTH waves) | KOBOLD x6, KOBOLD LEADER x3 (fought twice, identical roster) |

**Automated evidence.**

- Engine golden (per-cell): `packages/engine/test/dungeonEvents.test.ts` ("golden Pool ECL8 block 29
  (ending/late-area route)") — confirms the JSON's literal `(7,8)`/masked-2 cell is unique but
  reaches only the shared "sense of danger" arm, decodes the real masked-1 `(7,7)` cell, drives
  `dialogueForCell` through the opening one-choice continue into the first KOBOLD/KOBOLD LEADER
  combat, asserts `[0x4a23]` stays `0` after the first victory, chains into the identical second
  combat via `runner.afterCombat('victory')` -> `runner.choose(0)` -> combat, and asserts
  `[0x4a23]=1` only after the second victory.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'Pool ECL8#29'` row (`(7,7)` west, `0x4a23`, mask `1`), reusing the existing
  `areaMemory` contract proven by every other route in this file.
- Browser route: `?explore=pool-natural-3` (`apps/web/src/ui/gameData.ts`'s `pool-natural-3`
  profile, single-archive shape loading `ECL8.DAX`/`GEO8.DAX`/`WALLDEF8.DAX`/`8X8D8.DAX`/
  `MON8CHA.DAX`/`MON8SPC.DAX`/`MON8ITM.DAX`/`ITEM8.DAX` directly at block 29, `eclEntryOffset:
  0x35d`, seeded with `eclInitialMemory: [[0x4a23, 0]]`), plus the matching `docs.ts`/`support.ts`/
  `main.ts` route wiring.
- Browser e2e: `apps/web/test/e2e.mjs::runExplorePoolNatural3Combat` walks the real 9-step GEO path
  from `chooseStart (11,2,north)` to `(7,7,west)`, asserts the "MONSTERS FROM THE SURROUNDING
  BUILDINGS ATTACK YOU." checkpoint text via `window.__explore.lastEvent()` (this checkpoint never
  opens `window.__dialogue` — it is a degenerate one-choice continue, drained inline), asserts the
  first KOBOLD/KOBOLD LEADER roster (capped to the first 6 combatants by the pre-existing tactical
  placement cap, `apps/web/src/ui/combat.ts` — KOBOLD loads first, so all 6 surviving slots are
  KOBOLD, same shape as Pool's own middle route hitting the identical cap), resolves the first
  combat, waits on the SECOND wave's roster actually being present (not a bare `!!window.__combat`
  check, which races against the module-level combat state briefly going empty between the two
  overlay launches — see the function's own comment), asserts the "A BAND OF KOBOLDS CLIMBS FROM THE
  WELL AND ATTACKS." status text and the identical capped roster, resolves the second combat, checks
  the resume flag, and reuses `verifyNaturalPersistence` for the save/reload/no-refire proof. Uses a
  dedicated `prepareNaturalRouteFreshParty` helper that unconditionally reseeds the pristine
  500-HP elite party rather than reusing whatever `greybox.party.cok` an earlier route left in
  localStorage (all `run*NaturalCombat` functions share one browser origin) — fighting the same
  roster twice back-to-back is enough cumulative damage that inheriting an already-battered party
  from a full suite run intermittently lost the first wave, the exact order-dependent-flake class
  flagged for Pool's middle route earlier in this project; confirmed by re-running the full suite
  twice after the fix with no flake recurrence.

**Corpus-promotion note.** As with Pool's Second Route, this promotion lives entirely in this doc
plus its own engine golden, save round-trip row, and e2e coverage —
`tools/goldbox_corpus_routes.json`'s one-route-per-`profile_id` schema keeps Pool's existing
`pool-of-radiance` entry pointed at the first (early-anchor, `ECL1#18`) route; changing that schema
to hold multiple routes per profile is out of scope for this leaf.

**Scope note.** This proves Pool's ending/late area only. Town/wilderness/quest routes for Pool
remain open. Combined with the early and middle routes, Pool's early/middle/ending-late matrix legs
are all now proven at the engine level with browser replay; town/wilderness/quest legs being open
means Pool is **not** promoted to Campaign by this leaf (matching CoAB's own honestly-unpromoted
precedent above) — no corpus/support-matrix change was made to claim otherwise.

## Pool's Fourth Route (Town/Temple)

BUILD-QUEUE item 6's town-enter/exit leaf for Pool, following the exact method CoAB's and Secret's
own agents used for this leaf: find every statically-reachable dungeon/wilderness engine-mode toggle
write via `tools/map_gen1_area_mode_writes.py` (**zero hits anywhere in Pool's full ECL corpus**,
re-run for this leaf — the same negative result Secret's own town leaf found; Pool's engine does not
use a fixed-address `Area1.inDungeon`-style toggle either), then determine from Pool's OWN data
whether a discrete GEO-backed town exists, rather than assuming either way from CoAB's honestly-blocked
precedent (`docs/engine/research/coab-town-classification.md`).

**Finding, unlike CoAB: Pool DOES have a real, named, GEO-backed town — and it is the SAME block
every other Pool route already anchors on.** `ECL1.DAX#18`/`GEO1.DAX#18` is New Phlan's Slums ward,
the very first area the `pool` GameData profile boots into. Scanning `GEO1.DAX#18` for every cell
whose masked descriptor (`floor & 0x7f`) equals `4` finds exactly one hit: `(1,15)`, raw floor byte
`0x84`. Its `search_location` dispatch is a hidden Temple of Ilmater: an "ARE YOU IN NEED OF HEALING"
prompt with a real two-choice `['YES','NO']` menu (not a degenerate continue), gated behind ordinary
town-ward walking — a genuinely different, positive outcome from CoAB's own leaf, whose closest
candidate needed cross-archive infrastructure that did not yet exist at the time and was left an
honest, well-evidenced block.

**Entry, the in-town action, and exit are all provable from this one block — no separate checkpoint
route needed, unlike Secret's leaf.** "Normal-controls entry" is the ordinary `pool`/`pool-natural-4`
boot into `ECL1.DAX#18`/`GEO1.DAX#18` at its standard `initial_entry` (`eclEntryOffset: 0x73`).
"An in-town action that sets host state" is the Temple's own healing offer: choosing `NO` (index 1)
— the clean real path; `YES` chains into an empty-roster `COMBAT` this leaf does not otherwise
exercise — ends the dialogue and writes `[0x4a1a]=4`, the masked descriptor value itself, matching
this project's own established masked-descriptor-as-discovery-flag convention used by every other
Gen1 golden in this file. "Exit back to dungeon/overland" is proven by the separate crossing route
below (Pool's Fifth Route), which departs from this identical block via its `vm_run_1` hook — the two
routes share one seed area by design, the same way Secret's town and wilderness leaves are two facets
of one finding rather than two unrelated blocks.

**Reachability, re-verified against the real engine.** `tools/find_geo_path.py --geo GEO1.DAX
--block 18 --start <chooseStart> --target 1,15 --avoid-event-index 8` finds a clean 21-step
directed-edge path. The first (unfiltered) result crossed cell `(3,14)` (masked descriptor `8`),
which disassembly shows is a REAL interactive checkpoint — `PRINTCLEAR "A DECAYED BUILDING LEFT TO
THE RATS."` behind a one-choice continue menu — not a silent pass-through; avoiding it with
`--avoid-event-index 8` finds an alternate 21-step path crossing only benign cells (selectors `10`
and `11`, both routing to a shared no-op `SPRITE_OFF; PICTURE #255; EXIT` handler, confirmed by
disassembly), which the browser e2e case uses so the walk is pure movement with no extra dialogue
checkpoint to drive.

| Saved target | Consumed state | Landing |
| --- | --- | --- |
| ECL1#18 `(1,15)` (Temple of Ilmater, decline healing) | `[0x4a1a]=4` | stays in ECL1#18, resumes the town ward |

**Automated evidence.**

- Engine golden: `packages/engine/test/dungeonEvents.test.ts` ("golden Pool ECL1 block 18
  (town-ward Temple route)") — confirms `(1,15)`/raw `0x84` is the unique masked-4 cell, drives
  `dialogueForCell` through the real `['YES','NO']` healing prompt, chooses `NO`, and asserts
  `[0x4a1a]=4` after `runner.isDone()`.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix
  gained a `'Pool ECL1#18 (Temple)'` row (`(1,15)` north, `0x4a1a`, mask `4`).
- Browser route: `?explore=pool-natural-4` (`apps/web/src/ui/gameData.ts`'s `pool-natural-4`
  profile, single-archive shape identical to the plain `pool` profile's own archive set,
  `eclInitBlock: 18`, `eclEntryOffset: 0x73`, seeded with `eclInitialMemory: [[0x4a1a, 0]]`), plus
  the matching `docs.ts`/`support.ts`/`main.ts` route wiring.
- Browser e2e: `apps/web/test/e2e.mjs::runExplorePoolNatural4Temple` walks the real 21-step
  event-avoiding GEO path to `(1,15)`, asserts the healing prompt text/choices, chooses `NO`, waits
  for `window.__dialogue.kind() === 'end'` (the overlay does not auto-close on `'end'` — it shows a
  "Continue ▶" button and stays open until `.close()` is called explicitly), asserts
  `areaMemory(0x4a1a) === 4`, closes the dialogue, and reuses `verifyNaturalPersistence` for the
  save/reload/no-refire proof.

**Scope note.** This proves Pool's town enter/exit only in the sense the method calls for: real
normal-controls entry into a discrete GEO-backed town ward, a real in-town action that sets host
state, and (via the Fifth Route below) a real exit back out through the retail `vm_run_1` crossing
mechanism. It does not add a second town block beyond the one every other Pool route already shares.

## Pool's Fifth Route (Wilderness/Overland Crossing)

BUILD-QUEUE item 6's wilderness/overland-transition leaf for Pool. Unlike Secret's own leaf (which
resolved negatively — no `WILDCOM.DAX` shipped at all), Pool's retail install ships BOTH
`DUNGCOM.DAX` and `WILDCOM.DAX` (confirmed by a direct directory listing of
`C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/`), so this leaf resolves
positively — a real, provable cross-archive area crossing, architecturally distinct from CoAB's own
ADR-0009 mechanism.

**Pool's crossing mechanism is NOT CoAB's `game_area` register.** CoAB writes a `game_area` value via
`SAVE <value>, 0x7F12`, which the VM surfaces as a `setGameArea` effect that `runEclChain`'s
`areaSource` callback consumes to rebind the active `BlockSource` (ADR-0009). Pool's own NEWECL
crossings never write to that address, or to any fixed-address toggle at all
(`tools/map_gen1_area_mode_writes.py`: zero hits, same scan used for the town leaf above). The real
mechanism is `vm_run_1` itself — the "you have arrived, check for a pending travel selection" hook
every Gen1 area runs BEFORE `search_location` (confirmed against CoAB's own decompiled retail source,
`coab_extracted/engine/ovr003.cs sub_29677`, which calls `initial_entry` -> `vm_run_1` ->
`search_location` in that order on every area load).

**The dispatch, byte-verified.** `ECL1.DAX#18`'s own `vm_run_1` (vaddr `0x99b9`, file offset `0xbb`
— distinct from the block's `eclEntryOffset: 0x73` `initial_entry`, the every-day per-step boot the
`pool`/`pool-natural-4` profiles use): `COMPARE 0x6dd5,#0; IF_EQ; GOTO 0x9a1a` gates a native "pending
travel selection" flag; nonzero falls through to `ON_GOTO 0xc04d,#4,[0x99e6,0x99f0,0x99fa,0x9a04]` —
a 4-way destination-selector dispatch, each arm doing `SAVE <val>,0x6e12; NEWECL <target>`. Arm index
2 (`0x99fa`) is `SAVE #4,0x6e12; NEWECL #2`. Pool's block-id space is globally unique across all 8
ECL archives (re-verified directly: block id 2 exists ONLY in `ECL4.DAX`), so `NEWECL #2`'s operand
alone resolves the cross-archive target — no per-block "game_area" register needed, unlike CoAB.
`ECL4.DAX#2`'s own `initial_entry` sits at the standard file offset (`0x16`) and runs an
unconditional `LOAD_FILES(2,2,255); LOAD_PIECES(1,3,20)` before any compare — real, walkable
`GEO4.DAX#2` content, not a stub.

**A real engine change was needed to prove this: `runEclChain` had no way to start the first block at
an offset other than its own `initial_entry`.** Added `entry?: number` to `RunChainOptions`
(`packages/engine/src/ecl/program.ts`), applied ONLY to the first block's `EclVm` construction (every
chained block after it still boots at its own `initial_entry`, matching how the real engine only
takes an explicit entry point for the block the host itself loads — every subsequent block it chains
into on its own runs the normal `initial_entry -> vm_run_1 -> search_location` sequence).

**Diagnosing a dialect/vbase bug along the way.** The first golden attempt omitted `dialect: ECL_POOL`
from `runEclChain`'s options, silently defaulting to `ECL_GEN1` (`vbase: 0x7ffe`) instead of Pool's
real `vbase: 0x98fe`. Since `ON_GOTO`/`GOTO` branch targets embed real absolute vaddrs resolved via
`w - dialect.vbase`, the wrong vbase pushed every arm target out of range, producing an
`{type:'unhandled', mnemonic:'ON_GOTO(nonlocal)'}` effect and a silent fallthrough into arm 0's raw
bytes (`NEWECL #9`) regardless of the seeded selector — manifesting as `chained block 9 not found`.
Diagnosed by logging the captured `ON_GOTO` instruction's raw vaddr/args and noticing it didn't match
the expected `~0x9989` range; fixed by adding `dialect: ECL_POOL` explicitly.

| Saved target | Consumed state | Landing |
| --- | --- | --- |
| ECL1#18 `vm_run_1` crossing, selector `2` | `[0x4a1a]` (Temple flag) survives the crossing untouched | `NEWECL 2` -> ECL4#2 `LOAD_FILES(2,2,255)`/`LOAD_PIECES(1,3,20)` (real, walkable GEO4#2) |

**Automated evidence.**

- Engine golden (chain): `packages/engine/test/dungeonEvents.test.ts` ("golden Pool vm_run_1 area
  crossing (ECL1#18 -> ECL4#2, no ADR-0009 game_area register)") — merges `ECL1.DAX` and `ECL4.DAX`
  into one flat `BlockSource` via `blockSourceFrom`, seeds `[0x6dd5]=1` (pending travel),
  `[0xc04d]=2` (destination selector), and `[0x4a1a]=4` (the town leg's own flag, to prove it
  survives), calls `runEclChain(18, merged, { entry: 0xbb, dialect: ECL_POOL, maxBlocks: 4, ... })`,
  and asserts `status==='exited'`, `visited===[18,2]`, no `setGameArea` effect, the real
  `loadFiles`/`loadPieces` effects, and `memory.get(0x4a1a)===4` after the crossing.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts` gained a dedicated test round-tripping
  two distinct `areaMemory` keys (`'Pool of Radiance ECL1#18 (town ward)'` and
  `'Pool of Radiance ECL4#2'`, both keyed on decimal `'18970'` = `0x4a1a`) with no collision, proving
  the save schema handles Pool's own crossing shape (two areas, one shared address, no `game_area`
  register) the same way it already handles CoAB's ADR-0009 shape.
- Browser route: `?explore=pool-natural-5` (`apps/web/src/ui/gameData.ts`'s `pool-natural-5` profile,
  single-archive shape loading `ECL4.DAX`/`GEO4.DAX`/`WALLDEF4.DAX`/`8X8D4.DAX`/`MON4CHA.DAX`/
  `MON4SPC.DAX`/`MON4ITM.DAX`/`ITEM4.DAX` directly at block 2), plus the matching
  `docs.ts`/`support.ts`/`main.ts` route wiring.
- Browser e2e: `apps/web/test/e2e.mjs::runExplorePoolNatural5Wilderness` boots `?explore=pool-natural-5`
  directly, asserts a valid start pose, `cellCount>=1`, performs a few real moves, asserts a valid
  pose afterward, and asserts `mapName` matches `/Pool of Radiance/i` — proving the crossing's real
  destination area loads and is walkable in-browser.

**Scope note (browser wiring) — UPDATED 2026-07-16, now LIVE.** This proves the crossing at the
engine level, byte-for-byte against the real disassembly — the same rigor as every other golden in
this file. The "mid-walk NEWECL-only crossing" capability this note originally deferred now exists,
sharing the SAME general mechanism built for Secret's town-exit leaf
(`apps/web/src/ui/dialogue.ts`'s `onChain` hook + `apps/web/src/ui/explore.ts`'s
`remountChainedArea`), here wired to a genuinely cross-archive target via a new
`pool-natural-4.chainTargets: { 2: {...} }` entry naming the SAME `ECL4.DAX`/`GEO4.DAX`/… archive set
`pool-natural-5` already proves is real and walkable. Honest scope note on the TRIGGER (not the
crossing itself): unlike Secret's fully organic GEO walk into its archway, there is no in-browser
wilderness-edge GEO trigger to walk into for this leg (a separately-tracked `Explorer` edge-of-map ECL
dispatch gap, plus Greybox has no wilderness-travel UI at all) — so a new
`window.__explore.crossWilderness()` seam invokes the SAME real `dialogueForVmRun1` entry point the
engine golden above byte-verifies (file offset `0xbb`), seeded with the golden's own exact values
(`[0x6dd5]=1`, `[0xc04d]=2`) — a direct seam call standing in for the retail travel menu, the
identical honest characterization ADR-0009's own crossing dialogue already uses for CoAB. The dispatch
and its destination are both real; only the trigger is seam-driven. Proven end-to-end by
`runExplorePool6WildernessCrossing` (`apps/web/test/e2e.mjs`, id `explore-pool6-wilderness-crossing`):
boots `pool-natural-4` into `ECL1.DAX#18`, calls `crossWilderness()`, asserts the re-mounted area is
the real `ECL4.DAX#2`/`GEO4.DAX#2` content (matching `pool-natural-5`'s own independent proof), plus
save/reload persistence across the chain boundary (redriving the same deterministic seam call after a
real page reload, mirroring CoAB's own `driveCoab3Crossing` reload-then-redrive pattern). See
`docs/engine/BUILD-QUEUE.md`'s 2026-07-16 "wilderness-crossing LIVE browser wiring" entry for full
gate numbers.

**Corpus-promotion note.** As with Pool's Second and Third Routes, this promotion lives entirely in
this doc plus its own engine goldens, save round-trip test, and e2e coverage —
`tools/goldbox_corpus_routes.json`'s one-route-per-`profile_id` schema keeps Pool's existing
`pool-of-radiance` entry pointed at the first (early-anchor, `ECL1#18`) route; changing that schema
to hold multiple routes per profile remains out of scope for this leaf. Combined with the early,
middle, ending-late, town, and wilderness legs, Pool's full BUILD-QUEUE item-6 matrix (all five legs)
is now proven at the engine level with browser replay for every leg except the wilderness crossing's
own live cross-archive re-mount (deliberately deferred, per the scope note above) — quest remains the
only leg not attempted by this pass. Pool is **not** promoted to Campaign by this leaf (matching
CoAB's and Secret's own honestly-unpromoted precedent) — no corpus/support-matrix change was made to
claim otherwise.

## Secret's Sixth Route (Quest — Cross-Block Persistent Alert Flag)

BUILD-QUEUE item 6's **quest** leaf: a story-relevant flag SET in one already-proven route's block
that is genuinely READ by a DIFFERENT, non-adjacent block's script, changing that other block's
available content. This has never been attempted for any of the three Gen1 games before this
pass — no template existed, so the definition and evidence bar below are derived from first
principles (a static cross-reference scan narrowed the search; every hit still needed a manual
byte-level disassembly read before being trusted, the same "UNLOCATED beats invention" discipline
(`docs/engine/HANDOFF.md` §5) every other route in this file already follows).

**Method.** New tool `tools/map_gen1_cross_area_flag_reads.py` takes the registry of already-known
consumed/precondition words from each game's OWN proven routes (Secret: `[0x4ccd]` early anchor,
`[0x4c2e]` middle route, `[0x4c9e]` ending route, `[0x4c4d]` the middle route's own unresolved
runtime-seed precondition, `[0x7ed5]` the town `vm_run_1` exit gate) and BFS-walks EVERY block in
EVERY `ECLn.DAX` archive for any instruction referencing one of those words, classifying each hit as
same-block / cross-block-same-archive / cross-archive. Output:
`docs/engine/research/gen1-cross-area-flag-reads.md` (generated; regenerate with `python
tools/map_gen1_cross_area_flag_reads.py --profile secret-of-the-silver-blades --profile
pool-of-radiance`).

**The finding.** `[0x4c4d]` — Secret's Second Route's own previously-unresolved runtime-seed
precondition (that route's write-up said the middle route "requires `[0x4c4d]!=0`" without a
located setter) — turns out to have a real, in-corpus setter: **`ECL1.DAX` block 34's `vm_run_1`**
(the "runs on every step, before per-cell `search_location`" handler every Gen1 area has). Byte-
decoded: `AND [0xc04f],#0x3f -> [0x7f79]` (the same masked-descriptor compute this file's own CoK
block-34 golden already uses), then `COMPARE [0x7ed5],#1` / `IF_NE` (skip unless the town-exit gate
flag is exactly 1), then on the masked-descriptor-45 arm: `SAVE #0xff,[0x4c4d]` ("Black Circle full
alert"). Descriptor 45 belongs to `GEO1.DAX#34` cell `(15,8)` (confirmed against both the `&0x3f`
and `&0x7f` masks, since 45 < 64 they agree). `ECL1.DAX` block 16 — New Verdigris, Marcus's
residence, the SAME `search_location` cell `(14,11)` Secret's Second Route already proves — reads
`[0x4c4d]` at its very first branch: unset/0 takes the peaceful "YOU LEAVE THE BUILDING" exit with
no combat; `0xff` escalates into the guard confrontation and the BC LORD x7 fight the Second Route's
own golden proves. **Block 34's write literally gates whether block 16's already-proven middle route
escalates to combat at all — a genuine cross-block quest dependency**, not a same-block consumed
bit and not scratch-memory reuse (the value written, `0xff`, is exactly the value the reading branch
checks for; both blocks treat the word with the SAME semantic, "Black Circle is on alert").

**Corroborating context (not proof on its own).** `[0x7ed5]` is not an arbitrary gate: Secret's
Fourth Route (above) independently found that `ECL1.DAX#16`'s OWN `vm_run_1` uses the SAME word
(`[0x7ed5]==1`) to gate its "YOU ARE LEAVING THE TOWN. DO YOU CONTINUE?" prompt. Both usages are
consistent with `[0x7ed5]` meaning something like "the party has triggered a town-wide alert /
departure state" — a coherent narrative role for a word that also unlocks block 34's own escalation
write, not two unrelated scripts colliding on the same address.

**Honest caveat: `[0x7ed5]`'s own natural setter is UNLOCATED.** The full corpus scan
(`gen1-cross-area-flag-reads.md`) finds only READS of `[0x7ed5]` — `ECL1.DAX` blocks 16/33/34,
`ECL2.DAX` blocks 52/68, `ECL3.DAX` blocks 81/96/97/98 — zero `SAVE`-to-`[0x7ed5]` writes anywhere
in Secret's ECL corpus. This matches the project's existing `requires_runtime_seed` convention
(Pool's Second Route's `[0x4acf]` precondition and others in this file carry the same kind of
caveat): the engine proof below seeds `[0x7ed5]` directly rather than proving how a real playthrough
sets it. The write/read round trip itself — block 34 genuinely computing and writing `[0x4c4d]`,
block 16 genuinely branching on the value that write produced — is a real VM-executed proof, not an
inferred or synthetic claim.

**Scope note (reachability audit).** This write-up does not exhaustively re-walk all 13 remaining
unique intermediate GEO descriptors along a full `chooseStart`-to-`(15,8)` route through
`GEO1.DAX#34` the way, e.g., Pool's Second Route audits every intermediate descriptor on its own
walk; only 4 of the 17 unique nonzero descriptors crossed were spot-checked and found to be the
shared harmless fallthrough. The direct VM-priming proof (seed the cell, run `vm_run_1`, observe the
write; seed the flag, run block 16, observe the branch) is the load-bearing evidence here and does
not depend on that walk being audited — reachability of `(15,8)` itself is plausible (it is an
ordinary interior cell of an already-walkable block) but not re-proven step-by-step in this pass.

| Setter | Consumed state | Reader (different block) |
| --- | --- | --- |
| ECL1#34 `vm_run_1`, descriptor `45` (`(15,8)`), requires `[0x7ed5]==1` (runtime seed, setter unlocated) | `[0x4c4d]` 0 -> `0xff` | ECL1#16 `search_location` `(14,11)`: `0xff` escalates the Marcus door scene to BC LORD x7 combat; unset ends peacefully with none |

**Automated evidence.**

- Scanner tool: `tools/map_gen1_cross_area_flag_reads.py` (regression test
  `tools/test_map_gen1_cross_area_flag_reads.py`, 4 cases against synthetic ECL blocks) narrowed the
  search from Secret's full corpus to the `[0x4c4d]`/`[0x7ed5]` cross-block hits above; every hit
  quoted in this section was then independently confirmed by manual disassembly and by the engine
  goldens below, not trusted from the scan alone.
- Engine goldens: `packages/engine/test/dungeonEvents.test.ts` — "golden Secret ECL1 block 34
  vm_run_1 (quest-flag setter, descriptor 45)" (proves the guarded write: unseeded `[0x7ed5]` leaves
  `[0x4c4d]` untouched, `[0x7ed5]=1` produces `[0x4c4d]=0xff`) and "golden Secret ECL1 block 16 quest
  gate (cross-block persistence of [0x4c4d])" (proves the read: `[0x4c4d]=0` ends the Marcus scene
  peacefully with no combat, `[0x4c4d]=0xff` — exactly what the setter golden produces — escalates to
  the SAME BC LORD x7 combat the existing "golden Secret ECL1 block 16 (middle-area route)" test
  proves).
- Save v2 persistence: no new row was added. `[0x4c4d]` and `[0x7ed5]` are both already covered by
  this game's existing area-crossing/save-matrix precedent in spirit (they live in the SAME map's
  `areaMemory` bucket the Second Route's own `'Secret ECL1#16'` row already round-trips), and this
  leaf's own proof is a same-load cross-block dependency rather than a save/reload boundary crossing
  — the two goldens above are the load-bearing proof for this leaf, matching how Secret's Fourth
  Route (chain crossing) also relied on its engine golden rather than a dedicated save-matrix row.
- Browser wiring: deliberately deferred, matching every other leaf's "Scope note" precedent in this
  file (Secret's Fourth Route, Pool's Fifth Route). The proof above is at the engine/VM level,
  byte-for-byte against the real retail disassembly — the same rigor as every other golden in this
  document. Both blocks involved (`ECL1.DAX#34`/`#16`) already load together under the SAME live
  `?explore=secret-natural-2` archive set, so no new cross-archive re-mount capability is needed to
  wire this leaf into the browser; it is future browser-UI work (seeding `[0x7ed5]` from some real
  in-game trigger once one is located, or exposing block 34's own cell as a reachable step) rather
  than an engine gap.

**Corpus-promotion note.** This promotion lives entirely in this doc plus its own engine goldens —
no `tools/goldbox_corpus_routes.json` or support-matrix change was made to claim otherwise. Combined
with the early, middle, ending-late, town, and wilderness-absent legs, Secret's full BUILD-QUEUE
item-6 matrix (five applicable legs — wilderness is structurally absent, see "Secret's
Wilderness/Overland Classification" above) is now proven at the engine level, with the quest leg
being the sixth and final piece. Secret is **not** promoted to Campaign by this leaf (matching
CoAB's own honestly-unpromoted precedent) — no corpus/support-matrix change claims otherwise.

## Pool's Quest Leg (Investigated, Unresolved)

BUILD-QUEUE item 6's **quest** leaf for Pool, investigated with the exact same method that found
Secret's Sixth Route above. Documented honestly as unresolved rather than forcing a weak or
synthetic claim, per this project's "UNLOCATED beats invention" convention
(`docs/engine/HANDOFF.md` §5) and this leaf's own explicit task instructions.

**Registry scan (Pool's own 5 proven-route flags): zero genuine cross-block hits.**
`tools/map_gen1_cross_area_flag_reads.py --profile pool-of-radiance` finds only same-block hits for
`[0x4a38]` (early anchor), `[0x4acf]`/`[0x4ad0]` (middle route), and `[0x4a23]` (ending route) — each
word is referenced only inside its own setting block, nowhere else in the corpus. `[0x4a1a]` (the
town Temple-of-Ilmater discovery flag, value `4`) is the one exception: 32 cross-archive hits across
`ECL3.DAX#0`/`#14`, `ECL6.DAX#1`/`#25`/`#28`, and `ECL8.DAX#29`. **Manually decoded, these are a
false positive.** `ECL8.DAX#29`'s own hits, for example, are `SAVE #0,[0x4a1a]` and
`COMPARE [0x4a1a],#200` — value `0`/`200`, nothing to do with the Temple's specific value `4`; the
other blocks' hits show the same pattern (values `0`, `1`, `200`, `255`, never `4`). This is
consistent with `[0x4a1a]` being generic scratch space reused by Pool's wandering-monster/random-
encounter subsystem (each block/table slot claiming the same free word for its own unrelated
bookkeeping), not a deliberate narrative link to the Temple flag.

**Broader address-range scan: noisy, and every promising-looking narrow pairing resolved to the same
non-finding.** A second, unscoped pass compared every `SAVE`-of-an-immediate and `COMPARE`-against-
an-immediate across the whole `0x4900`-`0x4fff` range, matching `(address, value)` pairs written in
one block and compared in another: 443 raw candidate matches across 29 blocks. Most involve the
value `0`, `1`, `254`, or `255` — the universal "unset"/"consumed" sentinel convention nearly every
Gen1 encounter block uses for its OWN private flag — so raw `(address, value)` matching alone is not
discriminating: two unrelated blocks independently choosing `255` as their own "already fired"
sentinel on two different addresses that happen to fall in the same scratch range produces the exact
same shape of "hit" as a genuine shared flag. Filtering to the narrowest, most plausible-looking
candidates (exactly two blocks involved, touching already-proven-route blocks) and manually decoding
them — `0x4a00` (written/compared `255` in both `ECL2.DAX#20` and `ECL4.DAX#21`) and `0x4a13`
(written/compared `255` in both `ECL4.DAX#21` and `ECL8.DAX#29`) — found each block reads and writes
its candidate address entirely within its OWN control flow (e.g. `ECL2.DAX#20` writes `[0x4a00]=255`
at vaddr `0x9b24` and only that block's own earlier `COMPARE`s at `0x9a99`/`0x9ab1` ever read it back;
`ECL4.DAX#21` independently does the identical shape on the SAME address for its own unrelated
purpose). No genuine cross-block read of a value written by a DIFFERENT block's own logic was found
among the candidates checked.

**Conclusion.** After genuine, thorough effort — the same registry-driven method that succeeded for
Secret, plus a broader exploratory pass to compensate for Pool's registry not turning up a hit — no
well-evidenced cross-block quest dependency was found among Pool's already-proven routes' own
consumed/precondition flags. This is documented here as a genuine, honest negative result, not as
"not yet tried." Pool's BUILD-QUEUE item-6 matrix therefore has five proven legs (early, middle,
ending-late, town, wilderness) and one leaf — quest — left honestly unresolved. Should a genuine
lead surface later (e.g. from further ECL corpus work elsewhere in the project), this section should
be revisited rather than the absence of a finding being treated as a permanent verdict.

**Automated evidence.** `tools/map_gen1_cross_area_flag_reads.py`'s Pool section in
`docs/engine/research/gen1-cross-area-flag-reads.md` (the registry scan); the broader address-range
scan was exploratory and is not itself checked into a permanent tool (its own findings are fully
described above; nothing about the finding depends on rerunning it, since the finding is "no genuine
link," not a specific claim requiring reproducible tooling).

## CoK's First Route

`docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf: before either CoK's or
DoK's own P4 campaign matrix can start, each game needs its own P2-level natural encounter ->
combat -> resume -> persist vertical slice, the same deliverable Pool/CoAB/Secret already have.
CoK's engine-level slice (byte-grounded GEO selector cell, exact ECL roster, combat trigger, resume
sequence, and save v2 round-trip) was promoted 2026-07-16 — full byte trace in
`docs/engine/research/cok-natural-route.md`. This section records the browser-side wiring half,
landed the same day.

**Selector 28 of the SAME `ECL1.DAX#34`/`GEO1.DAX#34` block CoK's plain `?explore=1` boot already
loads.** Unlike every other game's promoted route, CoK's own default `eclInitBlock` (34) already IS
the block the natural encounter lives in — no separate area needed. The unique GEO cell is `(3,15)`,
descriptor `0x9C` (low six bits `28`), reached in 22 legal directed-edge steps from `chooseStart`'s
own `(14,10,north)` spawn for this block (`tools/find_geo_path.py`).

| Saved target | Consumed state | Browser proof |
| --- | --- | --- |
| ECL1#34 `(3,15)` west | exact walked value `[0x4C55]=0x30`; target mask `0x20` | HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE cannot refire |

- Roster: `HOBGOBLIN LDR ×8` (monster id 13) + `WARRIOR ×5` (monster id 35) + `BLACK ROBE MAGE ×2`
  (monster id 38), decoded straight from three `LOAD_MONSTER` groups — verified at the VM layer
  (`packages/engine/test/dungeonEvents.test.ts`, "golden CoK ECL1 block 34 natural encounter
  (descriptor 28)"). The browser's tactical combat screen caps both sides to their first 6
  combatants (`apps/web/src/ui/combat.ts`, the same pre-existing engine-wide constant CoAB's and
  Secret's own routes already hit), and the HOBGOBLIN LDR group alone (8) already exceeds that cap,
  so the browser e2e proof observes 6 HOBGOBLIN LDR rather than the full 15-strong retail roster.
- **Same-word, different-bit interaction (new to this route).** The 22-step walk legitimately
  crosses selector 27's cell `(11,14)`, a harmless one-shot flavour beat that sets a *different* bit
  (`0x10`) of the *same* `[0x4c55]` word this encounter's own bit (`0x20`) lives in. The engine
  golden primes the target cell directly with blank memory (so it observes `0x0` -> `0x20`); the
  live browser walk observes `0x10` -> `0x30` instead. This is the identical "a real walk picks up
  other legitimate bits" shape CoAB's own natural route already documented for `[0x4CF4]` (`0x0`
  engine golden vs. `0x4C` browser walk) — not a bug, just something only the live walk surfaces.
- **Interactive lead-in/menu correction (2026-07-27).** The retail script's real three-way
  ATTACK/WAIT/LEAVE menu is preceded by a one-choice "PRESS BUTTON OR RETURN TO CONTINUE." flavour
  beat. CoK's `runStepEvent` now opens that first menu turn rather than auto-draining it, so the
  player advances the source text and then sees the real ATTACK/WAIT/LEAVE choices. The same dialogue
  controller leaves post-combat choices interactive. `apps/web/test/e2e.mjs::runExploreCokNaturalCombat`
  asserts the exact one-choice lead-in followed by that three-choice menu before taking ATTACK.
- Browser route: `?explore=cok-natural` (`apps/web/src/ui/gameData.ts`'s `cok-natural` profile,
  same `ECL1.DAX`/`GEO1.DAX` archives and `eclInitBlock: 34` as the plain `cok` profile, a separate
  `GameId` purely to isolate this route's own save/e2e state, the same convention as every other
  `*-naturalN` leaf). No `eclInitialMemory` seeding is needed — the two flavour-text cells crossed
  en route never gate movement or collide with this encounter's own consumed bit.

**Corpus promotion.** `tools/goldbox_corpus_routes.json`'s `champions-of-krynn` entry now carries a
`persistence` block (`memory_address: 19541`, `consumed_mask: 32`, `browser_marker:
"cok-persistent"`), matching Pool/CoAB/Secret's own promoted entries. `python
tools/goldbox_corpus.py --strict` reports `level = "persistent"` for this profile with zero failed
checks and zero gaps. `apps/web/src/ui/supportClaims.json`'s `web_level` is raised to
`"persistent"` to match.

## CoK's Second Route (Middle)

`docs/engine/BUILD-QUEUE.md`'s "Blocked prerequisite for CoK/DoK" leaf, continued: CoK's own
middle-area leg, in a distinct `ECLn.DAX`/`GEOn.DAX` major area from the first/anchor route
(`ECL1.DAX#34`), promoted with the same rigor CoAB/Secret/Pool's own "Second Route" sections used.
DoK is explicitly out of scope for this leaf (genuinely blocked elsewhere; not attempted here).
`build/gen1-campaign-route-map.json`/`tools/build_gen1_campaign_route_map.py` do not carry a
`champions-of-krynn` entry in `GEN1_PROFILE_IDS`/`ANCHORS` (only the three already-Persistent
Pool/CoAB/Secret profiles are wired up there), so this promotion reused the tool's own internal
functions (`build_game_candidates`, `resolve_candidate`, `decode_geo_cells`, `choose_start`,
`bfs_reachable`, `selector_for_candidate`) against `build/gen1-ecl-encounters.json`'s
`champions-of-krynn` CFG scan results (`ECL2.DAX`/`ECL3.DAX` COMBAT paths) via throwaway scripts,
rather than editing the shared tool for a one-off investigation.

**Rejected candidate: `ECL2.DAX#48` selector 45 — its prerequisite remains unproven, not a
walking failure.** The selector reads the cross-file word `[0x4c5c]`. An earlier note claimed that
`ECL1.DAX#34` wrote it through an unknown opcode `0x41`. A direct raw-block audit on 2026-07-27
corrects that claim: bytes at raw offset `0x16d2` do decode as `SAVE #255,[0x4c5c]` (vaddr
`0x96d0`), but no ECL header entry, `ON_GOTO` table, or direct `GOTO` operand targets that code;
the ordinary `SearchLocation` table instead enters at `0x96e0`, after it. The surrounding
`0x41` byte belongs to an undecoded/data-adjacent region and is not proof that the write executes.
The current full-corpus CFG therefore correctly reports **no statically reachable ECL setter**.
Leave this candidate unclaimed until an original-runtime trace observes the field change or a
validated dynamic dispatcher reaches the bytes. This is a real reachability boundary, rather than
license to seed the flag in Greybox.

**Deprioritized candidate: `ECL2.DAX#64` selector 4.** Self-contained (no cross-file gate), but the
only legal walk from `chooseStart` to its target cell is 41 directed-edge steps long and crosses at
least 6 other combat-triggering cells along the way — a dense "wandering monster corridor" that
would make the e2e proof fragile and slow for no rigor benefit over a cleaner candidate. Set aside
rather than formally rejected: it remains valid, reachable retail content, just not the leg chosen
for promotion.

**Winning candidate: `ECL2.DAX#49` selector 28, `GEO2.DAX#49` cell `(6,10)`.** One legal directed-
edge step from `chooseStart`'s own `(6,9,north)` spawn for this block —
`find_geo_path.py --geo GEO2.DAX --block 49 --start 6,9 --target 6,10 --facing north` returns
`step_count: 1`, `directions: ["south"]`, `dos_keys: "{RIGHT}{RIGHT}{UP}"` (two 90-degree turns,
there is no single-action 180, then one forward step), `final_facing: "south"` — matching the
target cell's own descriptor-28 low-six-bits encoding exactly (`event_index: 28` at `(6,10)` in the
tool's own coordinate trace).

| Saved target | Consumed state | Browser proof |
| --- | --- | --- |
| ECL2#49 `(6,10)` south | `[0x4c6e]=0x20`, written eagerly (see below) | Myrtani/BAAZ/KAPAK cannot refire |

- Opening beat: a "MYRTANI LAUGHS AT YOU..." one-choice "PRESS BUTTON OR RETURN TO CONTINUE."
  flavour turn, decoded straight from the VM (`packages/engine/test/dungeonEvents.test.ts`,
  "golden CoK ECL2 block 49 natural encounter (descriptor 28, middle route)").
- Roster: `BAAZ ×5` (monster id 1, pic block 1) + `KAPAK ×4` (monster id 14, pic block 14), decoded
  from two `LOAD_MONSTER` groups and cross-referenced against `MON2CHA.DAX`'s decoded names. The
  earlier browser acceptance report recorded a six-enemy tactical cap and observed 5 BAAZ + 1 KAPAK;
  that is historical evidence for the then-tested build. Current source changed to preserve the full
  requested roster, and the current e2e source asserts nine combatants and nine CPIC bindings. The
  engine golden proves the full 5+4 roster. The updated browser assertion has not been rerun because
  the Vite `spawn EPERM` acceptance hold remains; no current browser observation of all nine icons is
  claimed.
- **The consumed bit is written BEFORE combat, not after victory (new to this route).** Every other
  proven Gen1 natural route sets its consumed bit only once combat resolves. Here `[0x4c6e]` is
  already `0x20` the instant the fresh branch is taken — before the opening flavour text is even
  shown — so both the engine golden and the browser e2e assert the bit is `0x20` going into combat
  AND still `0x20` coming out, rather than observing a `0x0 -> 0x20` transition. `fresh: 0` in the
  e2e's `verifyNaturalPersistence` call still holds for a genuinely fresh boot (no walk performed
  yet); it only jumps to `0x20` the moment the cell is stepped onto.
- Resume: a clean, genuine two-choice "...CIRCULAR STAIRS GOING UP... NO/YES" menu after victory
  (not a degenerate one-choice continue). Choosing NO (index 0, the auto-drain default) ends the
  chain cleanly.
- **Scope note — the YES branch is out of scope for this leaf.** Choosing YES at the post-combat
  stairs prompt loops back to the same prompt rather than transitioning floors in Greybox's engine;
  Greybox's `EclVm` doesn't yet model whatever operand this stairs-up dispatch uses (it isn't a
  plain `NEWECL`). This mirrors DoK's own already-documented "genuinely blocked, not invented"
  precedent elsewhere in this file — noted here as an honest gap, not attempted or claimed.
- Browser route: `?explore=cok-natural-2` (`apps/web/src/ui/gameData.ts`'s `cok-natural-2` profile,
  `ECL2.DAX`/`GEO2.DAX` archives, `eclInitBlock: 49`). No `eclInitialMemory` seeding is needed — the
  single step from `chooseStart` never crosses any other scripted cell.

**Corpus-promotion note.** As with CoAB's own middle route, `tools/goldbox_corpus_routes.json`'s
route declarations are keyed one route per `profile_id`; `champions-of-krynn`'s existing entry
already declares the first/anchor route (`ECL1#34`) and remains the corpus's single machine-checked
route for this profile. This second route's promotion lives entirely in this doc plus its own
engine golden (`packages/engine/test/dungeonEvents.test.ts`), save round-trip row
(`packages/engine/test/saveGame.test.ts`), and e2e coverage
(`apps/web/test/e2e.mjs::runExploreCok2NaturalCombat`) — the same doc-layer mechanism used for
every other game's second route, not additionally mirrored into the singular corpus JSON slot.

## CoK's Third Route (Ending)

BUILD-QUEUE.md's CoK ending/late-area leaf, extending the First (`ECL1.DAX#34`) and Second/Middle
(`ECL2.DAX#49`) routes above into CoK's own late-game archive. Block-id numbering alone identifies
`ECL3.DAX` (blocks 80-99) as the later area file relative to `ECL1.DAX` (16-36) and `ECL2.DAX`
(48-68); `build/gen1-ecl-encounters.json`'s `champions-of-krynn` entry lists `ECL3.DAX#82` as the
richest ECL3 block (14 rostered CFG candidates).

**Reachability, cross-archive.** `ECL1.DAX#18` (a clean 144-byte hub block, unrelated to either
earlier CoK route's own block) has a real `SAVE 5,0x7F12 ; NEWECL 80` transition (hand-traced from
its decoded bytecode, then confirmed live against the real engine: `runEclChain(18, ...)` with
`mem[0x4cb1]=1` seeded emits `{type:'setGameArea',gameArea:5}` then chains straight into
`ECL3.DAX#80`'s own `LOAD_FILES(80,2,255)` — `geoBlockId 80` matching `GEO3.DAX#80`, confirming the
crossing lands in the correct real area rather than a coincidental halt). This is corroborated by
`ECL1.DAX#16`'s own 12-destination travel menu, whose index-9 entry encodes the identical
`dest_area=5,dest_block=80` pair. `ECL3.DAX#82` itself boots cleanly from its own default
`initial_entry` (file offset 22, this engine's default VM entry point) — no `eclEntryOffset`
override or `eclInitialMemory` seeding is required, unlike Pool's own ECL8#29 ending leaf.

**The encounter is a forced two-stage gauntlet, not a single fight.** `GEO3.DAX#82`'s selector-15
cells (the JSON's own richest literal candidate — EVIL CHAMPION ×5, ENCHANTER ×2, EVIL PRIEST ×2,
and **SKYLA ×1**, a genuine named/unique monster record) sit at `(6,1)`, `(5,3)`, and `(10,3)`; the
nearest, `(5,3)`, is a real 22-step walk from `chooseStart`'s own `(1,1,north)` spawn
(`tools/find_geo_path.py --geo GEO3.DAX --block 82 --start 1,1 --target 5,3 --facing north`).
**Every one of those three cells is unreachable without first crossing a selector-25 cell**
(GHAST ×2, ZOMBIE ×4, SKELETAL KNIGHT ×4, GHOUL ×3 — an "undead legion" checkpoint): re-running
`find_geo_path.py` with `--avoid-event-index 25` fails for all three selector-15 targets, confirmed
independently by hand-tracing `GEO3.DAX#82`'s own directed-edge topology (four cells share
descriptor 25 — `(0,2)`, `(1,2)`, `(2,2)`, `(3,2)` — and every path into the selector-15 side of the
map funnels through one of them). This mirrors the "chained combat, consumed bit set only after
both fights" shape CoAB's Fourth, Secret's Third, and Pool's Third routes established, except here
the two stages are two SEPARATE forced GEO cells rather than one intra-script chain — the engine
golden drives them as two independent `dialogueForCell` calls sharing one `memory` Map, matching a
real walk that crosses both cells in sequence.

| Saved target | Consumed state | Browser proof |
| --- | --- | --- |
| ECL3#82 checkpoint `(2,2)` south | `[0x4CC3] \|= 0x08`, written eagerly | Undead legion cannot refire |
| ECL3#82 `(5,3)` west | `[0x4CC2] += 0x10` after victory (0x40 from selector 17 already set en route) | SKYLA cannot refire |

- **Stage 1 (checkpoint, selector 25, `(2,2)`)** starts DIRECTLY in combat — no flavour/menu beat
  precedes it, unlike every other CoK route in this file. Its consumed bit
  (`OR [0x4CC3],#8 -> [0x4CC3]`) is written EAGERLY, matching the Middle route's own precedent; both
  the engine golden and the e2e proof confirm it already reads `8` before `afterCombat` resolves.
- **Stage 2 (the promoted ending encounter, selector 15, `(5,3)`)** opens with THREE sequential
  one-choice flavour beats — "A FAMILIAR FACE LOOMS UP BEFORE YOU...", then by name "SKYLA GRINS
  WITH EVIL DELIGHT...", then a SIR LEBAUM undead-army taunt (the same SIR LEBAUM named in the
  rejected candidate below) — before SKYLA's own combat line ("SKYLA AND HIS EVIL FORCES ATTACK!").
  No ATTACK/WAIT/LEAVE menu. All four turns/beats across both stages are single-choice, so the
  browser's `runStepEvent` auto-drain path (the same mechanism the First/Middle routes rely on)
  never opens an interactive `window.__dialogue` overlay for either fight — both launch
  automatically once the party steps onto the respective cell.
- Its own consumed bit (`[0x4CC2]`, a DIFFERENT word from stage 1's `[0x4CC3]`) is written to `0x10`
  immediately after victory, before a final "JOURNAL ENTRY 61" flavour beat that ends the runner
  cleanly. Selector 17, a harmless one-shot flavour cell legitimately crossed mid-walk (at `(6,9)`),
  sets a DIFFERENT bit (`0x40`) of this SAME `[0x4CC2]` word — the "same-word-different-bit" pattern
  already documented for the First route's selectors 27/28 and CoAB's own natural route. Because the
  real walk crosses selector 17 before reaching SKYLA's cell, the live e2e proof observes `[0x4CC2]`
  already `0x40` going into the SKYLA fight and `0x50` (`0x40 | 0x10`) coming out — not `0x0 -> 0x10`
  as the blank-memory engine golden shows.
- Roster: the tactical combat screen's pre-existing 6-combatant-per-side cap
  (`apps/web/src/ui/combat.ts`) truncates both fights' full retail rosters. Stage 1's GHAST ×2 +
  ZOMBIE ×4 alone (2+4=6) fill the cap, dropping SKELETAL KNIGHT and GHOUL entirely from the visible
  grid. Stage 2's EVIL CHAMPION ×5 + the first ENCHANTER (5+1=6) fill the cap — SKYLA HIMSELF, the
  named antagonist this route was promoted for, is truncated from the on-screen grid despite being a
  real part of the retail encounter. The full untruncated roster for both fights is what the engine
  golden (`dungeonEvents.test.ts`) proves directly against the VM.
- Browser route: `?explore=cok-natural-3` (`apps/web/src/ui/gameData.ts`'s `cok-natural-3` profile,
  `ECL3.DAX`/`GEO3.DAX` archives, `eclInitBlock: 82`). No `eclInitialMemory` seeding is needed.

**Investigated and REJECTED: selector 30 (SIR LEBAUM ×1, MINOTAUR ×3, GHAST ×4).** Its cell sits at
`(0,13)`/`(0,14)`, inside a 14-cell component of `GEO3.DAX#82`'s FOUR disconnected components
(sizes 156/80/14/6) — the same "two-wall-set dungeon" shape the First route's own rejected
selector-5 candidate had. `chooseStart` lands in the 156-cell component; no directed edge reaches
the 14-cell one. This gate blocks the whole "SIR LEBAUM -> BLUE DRAGON (selector 22, gated on
`[0x4CC5]==255`) -> draconian squad" storyline at its entry point, not just the SIR LEBAUM fight
itself — SIR LEBAUM's own undead-army taunt still surfaces as flavour text in the promoted SKYLA
encounter above, so this rejected thread is not entirely absent from the proven route, just its own
combat is unreachable.

**Investigated but NOT pursued: `ECL3.DAX#98` selector 5 (MYRTANI ×1, SIVAK ×3, BOZAK ×4,
BAAZ ×5).** A hand-trace of the post-battle bytecode shows this fight chaining into what appears to
be a RED DRAGON encounter setup afterward — compelling "true final boss" content (MYRTANI is CoK's
own antagonist, already named in the Middle route's own flavour text above). `GEO3.DAX` contains
blocks `[80, 81, 82, 96, 97, 99]` only — **no block 98** — so this candidate's GEO-cell reachability
cannot be established with the same rigor every other route in this project uses. Left honestly
unproven rather than forced, per this project's "UNLOCATED beats invention" ethic.

**Corpus-promotion note.** As with the Second/Middle route, this third route's promotion lives
entirely in this doc plus its own engine golden (`packages/engine/test/dungeonEvents.test.ts`'s
"golden CoK ECL3 block 82 (ending/late-area route)" and the accompanying ECL1#18 hub-crossing
golden), save round-trip row (`packages/engine/test/saveGame.test.ts`), and e2e coverage
(`apps/web/test/e2e.mjs::runExploreCok3NaturalCombat`) — not additionally mirrored into
`tools/goldbox_corpus_routes.json`'s singular per-profile slot.

**Campaign-matrix status.** With the Early, Middle, and Ending natural-encounter legs all now
proven, CoK's dungeon-combat matrix is complete for this project's purposes. Town (below,
entry/action live, exit engine-proven only), wilderness, and quest legs remain open (matching every
other game's own "not promoted to Campaign" caveat in this file), so CoK is NOT promoted to a full
Campaign entry by this leaf alone.

## CoK's Fourth Route (Town)

BUILD-QUEUE item 6's CoK town leaf, following the same investigate-first method as CoAB (negative —
`docs/engine/research/coab-town-classification.md`), Secret ("CoK's Fourth Route" above — New
Verdigris), and Pool ("Pool's Fourth Route" above — the hidden Temple of Ilmater).

**Finding: CoK has real, GEO-backed towns — more of them than any other game in this project so
far.** CoK's own plot visits actual Dragonlance settlements, and its ECL corpus reflects that:

- **Gargath**, a three-block civilian complex: `ECL2.DAX#48` ("YOU STAND WITHIN THE GATES OF
  GARGATH", a gate district with a disguise-infiltration mechanic and a Sir Karl questline),
  `ECL2.DAX#49` ("YOU HAVE ENTERED GARGATH KEEP", already the Second/Middle route's own promoted
  block), and `ECL2.DAX#50` (this leaf's target — a walkable civilian district with four named shop
  signs: RED DAGGER INN, JARLKRAND'S ALE HOUSE, JELEK ARMOURY, WILGARTEN'S MAGIC SHOP).
- **Sanction** (`ECL3.DAX#80`/`GEO3.DAX#80`) — the richest named-shop content in the whole corpus:
  Horgathindorn's Training Hall, Gusmarken's Magic Shop, Sanction Weaponsmith, and the Southern
  Sanction Inn. **Investigated and REJECTED as a live browser-wiring target.** `chooseStart`
  (`apps/web/src/ui/explore.ts`'s own most-open-edges heuristic, unmodified — every prior
  `*-naturalN` profile relies on it as-is) picks `(0,0)` on this map: a fully-open 4-edge cell, but
  one that sits in a 44-cell all-descriptor-0 water/dock pocket **structurally disconnected** (BFS
  over the same directed-edge model `find_geo_path.py` uses, confirmed independently) from the
  211-cell main walkable component that holds the Training Hall and every other named shop. This is
  the same class of rejection CoK's own Third Route already applied to selector 30 ("a disconnected
  14-cell GEO component, unreachable from `chooseStart`") — just fatal here rather than merely
  inconvenient, since the stranded pocket has zero interactive cells of its own. Because `chooseStart`
  is also what `remountChainedArea`/`mountCrossedDungeon` calls on every live chain re-mount (not
  just profile boot), there is currently no way to reach Sanction's interactive content live in this
  engine's browser host, regardless of entry mechanism — a genuine, documented gap, not a scope choice.
- **Neraka** (`ECL2.DAX#64`/`GEO2.DAX#64`) — a Sir Karl rescue cutscene. Investigated; its own content
  is a linear one-shot scene, not a repeatable in-town action with its own persisted state, so it was
  not pursued as a promotion candidate.

`ECL2.DAX#50` — Gargath's civilian district — is the promotion target: real walkable content, a
working `chooseStart` spawn `(14,4,north)` (4 open edges, descriptor 0) that IS inside the map's main
211-cell walkable component (BFS-confirmed), and a genuine in-town action with persistent state.

**The in-town action.** The Ale House (masked descriptor 11, GEO cell `(3,12)`, raw floor byte
`0x8b`) is a clean 23-step directed-edge walk from `chooseStart`
(`tools/find_geo_path.py --geo GEO2.DAX --block 50 --start 14,4 --target 3,12 --facing north
--event-mask 0x3f`), crossing only harmless flavour/sign cells (descriptors 0, 7, 21, 22 — none
forces combat or a blocking menu; descriptors 20-22 are the WILGARTEN'S/JELEK/JARLKRAND'S signs
themselves, each a harmless one-shot `PRINTCLEAR`). Choosing YES to "DO YOU WISH A DRINK?" performs a
genuine persistent host-state write — `ADD #1,[0x4c84],[0x4c84]` (`area1.word_308`, a tavern-tale
index counter, vaddr `0x9371`) — but only AFTER an intermediate single-choice "PRESS BUTTON OR RETURN
TO CONTINUE." pause (a real `GOSUB`, `0x9CEB`) is answered; the tale text itself prints before the
SAVE fires. The prompt then loops back on itself, so a second visit can decline ("THEN YOU MUST
LEAVE.", a clean end).

**The exit — engine-proven, AND now live-wired in the browser (UPDATED 2026-07-17; was:
"engine-proven only, browser wiring deferred, matching Pool's own precedent").** CoK's `vm_run_1`
per-step main loop (not `SearchLocation`) drives the real "DO YOU WISH TO LEAVE?" prompt, reached
whenever the retail engine sets `area2.tried_to_exit_map` (`[0x7ed5]`) on an edge-of-map walk
attempt — the same host-computed-condition convention this project already models via
`dialogueForVmRun1`'s `seedMemory` (matching `crossWilderness`'s own precedent). Choosing YES
performs the exact same cross-archive exit mechanism as CoK's own Third Route's own hub crossing:
`SAVE #1,[0x7f12]` (`area2.game_area`) then `NEWECL 16` — CoK's `ECL1.DAX#16` wilderness/travel hub,
the identical dispatch-only block the First/Second/Third Routes already proved reachable. This was
already engine-golden-proven end-to-end (including the full `runEclChain` cross-archive round trip,
driven by overriding the block's VM entry to `vm_run_1` the same way `primeVmRun1` does).

**What closed the gap.** The blocker named here and in Secret's Fourth Route's own note — `Explorer`'s
`BlockReason = 'wall' | 'edge'` had no ECL dispatch hook for a map-edge step at all — is now a general
engine mechanism, not a CoK-specific patch: `packages/engine/src/model/index.ts` gained an `EdgeExit`
type (`{ kind: string; meta?: Record<string, unknown> }`) and `MapCell.edgeExits?:
Partial<Record<Direction, EdgeExit>>`; `packages/engine/src/world/explorer.ts`'s `Explorer.step()`
now attaches `StepResult.edgeExit` whenever a bounds-blocked step's leaving cell declares one on that
direction, and a new exported helper `markMapEdgeExits(map, exit)` bulk-decorates a WHOLE map's
perimeter in one call — matching how the retail `tried_to_exit_map` check fires on ANY edge-of-map
attempt, not one named gate cell. Neither `Explorer` nor the model layer knows anything about ECL:
`kind`/`meta` are opaque payloads the host defines and reads back. `apps/web/src/ui/gameData.ts`'s
`GameData` gained a matching `edgeExit?: { kind: string; seedMemory?: Record<number, number> }` field;
`apps/web/src/ui/explore.ts`'s `mountDungeonView` calls `markMapEdgeExits` once at mount time when a
profile declares it, and a new `triggerEdgeExit()` function (mirroring `crossWilderness`'s own
three-way shape: interactive ask → overlay, `chain` → `remountChainedArea`, anything else →
auto-drain) fires from `applyMove` whenever a REAL walked step returns `blocked: 'edge'` with an
`edgeExit` attached — driven by ordinary `window.__explore.move()` calls, not a seam standing in for
unbuilt UI (contrast `crossWilderness`/`crossCokWilderness`, which ARE seam calls). Only
`cok-natural-4` sets `edgeExit` today (`{ kind: 'vm_run_1', seedMemory: { 0x7ed5: 1 } }`, matching the
engine golden's own seed exactly); Pool's Fifth (wilderness) route was NOT touched by this leaf — its
own `crossWilderness` seam call is unchanged, so its "engine-proven; live crossing deferred" scope
note below still stands as its own honest, separate claim.

**`GEO2.DAX#50`'s real map-edge gates, confirmed against the actual GEO data.** A directed-edge BFS
over the block's own wall/door planes (the same walls-only model `Explorer.canMove` uses) finds
exactly TWO boundary cells with an open outward edge in this 16×16 map — `(0,0)` facing north and
`(2,15)` facing south — every other boundary cell is walled. Both are confirmed silent on entry
(`dialogueForCell` returns `{ kind: 'end', text: '' }` for each), so walking onto either never opens
an interactive overlay of its own; only the FURTHER step off the grid triggers `triggerEdgeExit`. The
live e2e route below targets `(2,15)` via a clean 33-step walk from `chooseStart (14,4,north)`
crossing only descriptor-0 cells plus the same harmless shop-sign descriptors (`7`/`19`/`20`/`21`/`22`
— confirmed `kind: 'end'`, one-shot flavour text, e.g. descriptor 19 = "YOU SEE A SIGN. THE RED
DAGGER INN.") already proven harmless by this route's own Ale House walk above.

| Saved target | Consumed state | Browser proof |
| --- | --- | --- |
| ECL2#50 `(3,12)` north, Ale House YES then NO | `[0x4c84] += 1` (fires between the tale's continue prompt and the repeat drink prompt) | entry + action live at `?explore=cok-natural-4`; consumed word cannot refire |
| ECL2#50 `vm_run_1`, leave prompt YES, reached by a REAL walked step off `(2,15)` south | `SAVE #1,[0x7f12]` then `NEWECL 16` into `ECL1.DAX#16` | live at `?explore=cok-natural-4` via the general `Explorer.edgeExit` hook (see below) |

**Automated evidence.**

- Engine goldens (`packages/engine/test/dungeonEvents.test.ts`):
  - "primeSearchLocation — golden CoK ECL2 block 50 town action (descriptor 11, Ale House, town
    route)" — decodes the real Ale House cell, drives the drink/tale/repeat/decline sequence through
    `dialogueForCell`, and asserts `[0x4c84]` is still 0 through the tale's own continue pause and
    becomes 1 only once that pause is answered.
  - "primeVmRun1 — golden CoK ECL2 block 50 town exit (tried_to_exit_map, town route)" — both the
    NO-stays and YES-leaves branches of the `vm_run_1` leave prompt, via `dialogueForVmRun1`.
  - "runEclChain — golden CoK ECL2 block 50 town exit round trip (into ECL1 block 16)" — the full
    cross-archive round trip, entering the block at `vm_run_1`'s own offset and following the real
    `setGameArea`/`NEWECL` chain into `ECL1.DAX#16`.
- Engine unit tests (general mechanism, game-agnostic): `packages/engine/test/explorer.test.ts`'s
  "Explorer — edge-of-map ECL exit hook" describe block (5 cases) — a plain edge bump with no
  declared exit stays `edgeExit: undefined` (no behavior change for every other profile); a directly
  set `MapCell.edgeExits` entry surfaces only on its own declared direction, not other directions off
  the same cell; a `'wall'` block never surfaces `edgeExit` even if the cell also declares one
  (edge-only hook, matching `Explorer`'s existing wall-vs-edge distinction); `markMapEdgeExits`
  decorates every boundary cell/direction (corners get two, edges get one, the interior gets none)
  and a live walk off all four sides of a 3×3 room confirms it; a second `markMapEdgeExits` call
  overwrites the prior descriptor (idempotent/overwritable for re-mounts).
- Save v2 persistence: `packages/engine/test/saveGame.test.ts`'s natural-route `it.each` matrix, row
  `'CoK ECL2#50 (town)'` (`(3,12)` north, `0x4c84`, mask `1`) — unchanged by this leaf; `[0x7f12]`
  itself was already covered by the Third Route's own hub-crossing proof and this leaf adds no new
  save-matrix row (the live write is proven directly by the e2e case below instead, matching how
  Pool's Fifth Route's own memory proof relies on its engine golden rather than a dedicated row).
- Browser route: `?explore=cok-natural-4` (`apps/web/src/ui/gameData.ts`'s `cok-natural-4` profile,
  `ECL2.DAX`/`GEO2.DAX` archives, `eclInitBlock: 50`, now also `edgeExit: { kind: 'vm_run_1',
  seedMemory: { 0x7ed5: 1 } }`), proven end-to-end by TWO e2e cases: `runExploreCok4NaturalTown`
  (`explore-cok4-natural-town`, unchanged — the real 23-step GEO walk, the real
  drink/tale/repeat/decline dialogue sequence, the real `[0x4c84]` write timing, and a full
  save/reload/consumed-cannot-refire persistence proof via `verifyNaturalPersistence`) and the NEW
  `runExploreCok4EdgeExit` (`explore-cok4-edge-exit`): a real 33-step walk from `chooseStart` to the
  open southern gate `(2,15)`, one further real `forward()` step that returns `blocked: 'edge'` with
  a real `edgeExit`, the real "DO YOU WISH TO LEAVE?" prompt via `window.__dialogue`, and — on a real
  YES click — `window.__explore.areaMemory(0x7f12)` reading back `1`, proving the SAVE executed for
  real against the live `state.areaMemory`, not a seam/synthetic value.

**Scope note (why block 16 itself still doesn't render).** `ECL1.DAX#16` remains genuinely
dispatch-only content — no `LOAD_PIECES`/WALLDEF effect at all (see CoK's Fifth Route's own note
below) — so `cok-natural-4`'s `chainTargets` deliberately does NOT register block 16: attempting to
`loadDungeon` it would throw. `triggerEdgeExit`'s `onChain` hook therefore reaches
`remountChainedArea`'s existing "not wired yet" fail-soft path (a status message, not a crash) after
the real SAVE has already landed in `state.areaMemory` — an honest reflection of retail data, not an
UI limitation this leaf introduced. This is a narrower, more precise claim than the old "browser wiring
deferred" note: the EXIT (the ECL dispatch, the SAVE, the real player interaction) is fully live; only
the (structurally unrenderable) LANDING block's own view is not. Pool's Fifth (wilderness) route below
is UNCHANGED by this leaf — it still uses its own `crossWilderness` seam call, not the new
`Explorer.edgeExit` hook, and its own scope note still accurately says so; this leaf did not attempt to
also wire Pool's case.

**Corpus-promotion note.** As with the Second/Third routes, this fourth route's promotion lives
entirely in this doc plus its own engine goldens, save round-trip row, and e2e coverage — not
additionally mirrored into `tools/goldbox_corpus_routes.json`'s singular per-profile slot.

## CoK's Fifth Route (Wilderness/Overland Crossing)

BUILD-QUEUE item 6's wilderness/overland-transition leaf for CoK. The regenerated
`tools/map_gen1_area_mode_writes.py` report finds 61 reachable `SAVE …,0x4BE6`
(`inDungeon`) sites, all in `ECL1.DAX` blocks 16/17/18. Contrary to this section's
older stale scanner result, many are literal `SAVE 0` sites: original-runtime
GameLink evidence now proves ECL1#17's Throtl sequence reaches that zero state
at its destination menu. The selector is therefore a genuine `WildernessMap`
presentation, while still being a menu-driven coordinate picker rather than a
proven free-step terrain map. The browser route must preserve that distinction.

**The dispatch, byte-verified.** `ECL1.DAX#16`'s `search_location` entry (vaddr `0x82be`, file offset
`0x82be - 0x7ffe`, distinct from the block's own `initial_entry` the First/Fourth Routes use) is exactly
this picker: a manual linear search over a 12-arm table (`GETTABLE` bases `0x8e72`/`0x8e7e`, read
straight off the block's own raw bytes — a **static lookup table embedded in the ECL bytecode itself**,
not host-populated) matching `[0x4bc3]`/`[0x4bc4]` (a world-map coordinate pair) against each arm's
`(x,y)` entry:

| idx | table1 (`0x4bc3`) | table2 (`0x4bc4`) | destination |
| --- | --- | --- | --- |
| 0 | 0 | 0 | no-match sentinel (string id 3) |
| 1 | 2 | 1 | area2/block32 |
| 2 | 1 | 3 | area1/block17 |
| 3 | 13 | 5 | area1/block17 |
| 4 | 14 | 3 | area3/block48 |
| 5 | 12 | 7 | area3/block50 |
| 6 | 17 | 8 | area4/block64 |
| 7 | 11 | 3 | area4/block67 — conditional **AN ANCIENT TOMB** (`[0x4c31]==1`), otherwise `WILD` |
| 8 | 16 | 3 | area6/block99 — conditional **AN OGRE BASE** (`[0x4c30]==1`), otherwise `WILD` |
| 9 | 10 | 13 | area5/block80 (Sanction) |
| 10 | 31 | 3 | KERNEN special patrol/celebration branch |
| 11 | 15 | 11 | area4/block68 — **PROMOTED** |

The old promotion-target probe left the persistent-memory gates unset, so arms 7 and 8 fell through
to `WILD`; this did not establish that their script locations were blank or invalid. Their conditional
handlers explicitly label AN ANCIENT TOMB and AN OGRE BASE when their respective flags are set.
The earlier BFS investigation still establishes that the tested `chooseStart` poses in those staged
areas are disconnected; that finding is limited to promotion through those default starts and does
not erase the conditional ECL branches. The arm-8 coordinate is `(16,3)`; the former `(16,8)` prose
was a transcription error.

- **Arm 7** (area4/block67, table match `(11,3)`): with `[0x4c31]==1`, ECL labels the location
  AN ANCIENT TOMB and stages block67. The default unseeded probe fell through to `WILD`.
  `chooseStart` lands at `(9,1,north)`, but the
  walkable component reachable from it is only 10 of 256 cells; the map's largest actual components are
  35/22/11/10/9/9/9/8 cells, and every real descriptor except one is unreachable from `chooseStart`.
- **Arm 8** (area6/block99, table match `(16,3)`): with `[0x4c30]==1`, ECL labels the location
  AN OGRE BASE and stages block99. The default unseeded probe fell through to `WILD`.
  `chooseStart` lands at `(3,5,north)`, walkable
  component from it only 9 of 256 cells; largest components 63/55/11/9/9/8/6/6; only one descriptor
  reachable.

These default-start reachability results remain relevant to admission of a *walkable* promoted route,
not to the existence or artwork semantics of the two conditional labels.

Index 10 at `(31,3)` is also a real location, not a blank/pagination arm. Its handler stores KERNEN;
the ECL dispatch sends it to a patrol/flee/combat branch when `[0x4c3a]!=1`, and to cleanup
celebration text when `[0x4c3a]==1`. The source map's Kernen ring at this cell is therefore expected.
Index 7 and 8 are conditional hidden locations and have no source-map marker; their lack of an icon
is also expected. The source-backed travel-map Restyle review is recorded in the
[runtime coverage register](cok-restyle-runtime-coverage-2026-10-26.md).

**Arm 11 (area4/block68) is the promotion target.** Its own table values are `(15,11)`, plus an extra
gate `[0x4c37]==1` (a "this outpost has been discovered" flag — the same seed-one-memory-cell convention
this project's other routes already use for their own unlocated preconditions; none of the other 11 arms
check it). On a match, the arm prints `"YOU ARE NEAR ... . DO YOU ENTER?"` — a real 2-choice confirm
(`HORIZONTAL_MENU`, `["YES","NO"]`) — **unlike every other menu-confirm in this project's CoK routes,
index 0 is YES here**, verified directly against the VM via a manual instruction-by-instruction trace
(an initial attempt assumed `resume(1)` was YES, following a different route's own convention, and
produced a dead-end `status='exited'` with no crossing at all; switching to `resume(0)` produced the
expected `status='chain'`, `setGameArea:4`, `mem[0x4be6]=1`). Choosing YES runs `SAVE #1,[0x4be6]`
(inDungeon); `SAVE #4,[0x7f12]` (`game_area`, the usual ADR-0009 `setGameArea` effect); `NEWECL
[0x4c25]` (`#68`).

**The destination is real, walkable content.** `ECL2.DAX#68`/`GEO2.DAX#68`, "THE OUTPOST", a military
checkpoint never claimed by any earlier CoK route: `chooseStart (2,2,north)` sits inside a
158-of-256-cell connected component — by far the map's largest, and matching the map's own largest
component (BFS-confirmed). `initial_entry` opens on a scripted "THE OUTPOST GUARDS STOP YOU AT THE
ENTRANCE ... WHEN YOU TELL THEM WHO SENT YOU, THEY ESCORT YOU TO THE COMMANDANT" cutscene (picture id
35). Nearby reachable cells are real interactive content too: masked descriptors 33 (`(5,8)`, floor
`0x21`) and 34 (`(6,6)`, floor `0x22`) both open "YOU HAVE COME ACROSS A CHECKPOINT. THE LEAD GUARD ASKS
YOU TO MOVE AWAY. WHAT DO YOU DO?" guard confrontations (choices `['LEAVE','ATTACK']`); descriptor 1
(`(14,8)`, floor `0x1`) opens "THE GUARDS WATCH YOU AS YOU PASS." The checkpoint's own LEAVE/ATTACK
choices were investigated but found to write only ephemeral scratch registers (the `0x7f79`/`0xc04e`-ish
range, not the stable `0x4cXX` quest-flag range), so they were not used for an in-block consumed-state
save-v2 row — the crossing's own `[0x4c37]` gate (arm 11's precondition) already serves that role.

**A genuine engine limitation, not a design choice: block 16 cannot be the mounted dungeon.** Unlike
Pool's own wilderness leaf (Pool's Fifth Route above), whose `vm_run_1` dispatch lives INSIDE the SAME
block (`ECL1.DAX#18`) as a real walkable town scene — so `pool-natural-4` boots directly into that block
and `crossWilderness()` simply re-enters it at a different vaddr — `ECL1.DAX#16` is dispatch-only at
EVERY entry point. Its `initial_entry` emits only `LOAD_FILES(127,127,127)` (a sentinel geoBlockId) plus
a title picture, with **no `LOAD_PIECES`/WALLDEF effect at all** — confirmed live: `loadDungeon` throws
`"ECL init block emitted no LOAD_PIECES (WALLDEF) effect"` for it, so `startExplore`'s normal
single-archive mount path cannot render it as a live dungeon. (This was discovered the hard way: an
earlier version of this leaf's browser wiring tried booting `cok-natural-5` straight into block 16, which
failed exactly this way in a live headless run.) The fix: `cok-natural-5` boots into `ECL1.DAX#34`
instead — the SAME real walkable dungeon the plain `cok` profile already anchors on, same archive as
block 16, purely so the browser view has something to render — and `window.__explore.crossCokWilderness()`
does NOT reuse the mounted block's own bytes (`state.areaEcl`); it independently fetches `ECL1.DAX` and
pulls block 16 itself, then drives the real `search_location` dispatch on those bytes.

**A second, related wrinkle: the interactive confirm closes the dialogue overlay before the mid-walk
chain re-mount runs.** Unlike CoAB's own cross-archive crossing (which supplies a `chainTo` resolver
that keeps the SAME dialogue overlay open across a `chain` turn), `crossCokWilderness()` — like
`crossWilderness()` before it — only supplies `onChain`, so `dialogue.ts`'s `present()` calls `finish()`
(closing the overlay and resetting `window.__dialogue` to `undefined`) BEFORE invoking `onChain`. The
e2e driver (`driveCokWildernessCrossing`) has to check `window.__dialogue`'s existence before each
`.kind()` read, not just loop on `.choose()`/`.kind()` blindly — the first attempt crashed with `Cannot
read properties of undefined (reading 'kind')` on the loop iteration immediately after choosing YES.

| Saved target | Consumed state | Landing |
| --- | --- | --- |
| ECL1#16 `search_location` arm 11, coordinate match `(15,11)` | `[0x4c37]==1` gate (outpost discovered), `[0x4be6]=1` (inDungeon) survive the crossing | `SAVE #4,[0x7f12]` (`setGameArea`) then `NEWECL 68` -> ECL2#68 "THE OUTPOST" (real, walkable, 158/256-cell component) |

**Automated evidence.**

- Engine golden: `packages/engine/test/dungeonEvents.test.ts` ("golden CoK ECL1 block 16
  search_location wilderness crossing into ECL2 block 68 (THE OUTPOST)") — merges `ECL1.DAX` and
  `ECL2.DAX` into areaSource game_area 1/4, seeds `[0x4bc3]=15`, `[0x4bc4]=11`, `[0x4c37]=1`, enters at
  `search_location`'s own offset (`0x82be - 0x7ffe`), resumes the confirm menu with index 0 (YES), and
  asserts `status==='exited'`, `visited===[16,68]`, a single `setGameArea:4` effect,
  `memory.get(0x4be6)===1`, `memory.get(0x4c24)===4`, `memory.get(0x4c25)===68`, and a real
  `loadFiles{geoBlockId:68}` effect.
- Save v2 persistence: `packages/engine/test/saveGame.test.ts` gained a dedicated test round-tripping
  two distinct `areaMemory` keys (`'Champions of Krynn ECL1#16 (game_area 1)'` and `'Champions of Krynn
  ECL2#68 (game_area 4)'`, both keyed on decimal `'19511'` = `0x4c37`) with no collision — the same
  CoAB-style two-key pattern (unlike Pool's single-key shape) since this crossing DOES write
  `SAVE …,0x7F12`.
- Browser route: `?explore=cok-natural-5` (`apps/web/src/ui/gameData.ts`'s `cok-natural-5` profile,
  boots `ECL1.DAX#34` for a renderable anchor, `chainTargets: { 68: {...} }` naming the real
  `ECL2.DAX`/`GEO2.DAX`/… "THE OUTPOST" archive set), plus the matching `docs.ts`/`support.ts`/`main.ts`
  route wiring.
- Browser wiring (live): `window.__explore.crossCokWilderness()` (`apps/web/src/ui/explore.ts`)
  independently fetches `ECL1.DAX`, pulls block 16, and drives the real `search_location` dispatch on
  those bytes — seeded with the golden's own exact values — landing via the SAME "mid-walk chain
  re-mount" mechanism (`remountChainedArea`) CoK's own Third/Fourth Routes already use. Proven
  end-to-end by `runExploreCok5WildernessCrossing` (`apps/web/test/e2e.mjs`, id
  `explore-cok5-wilderness-crossing`): drives the real 2-choice confirm via `window.__dialogue`, asserts
  the re-mounted area is real `ECL2.DAX#68`/`GEO2.DAX#68` content (`mapName` matches
  `/Champions of Krynn/i`, `cellCount>0`, a valid landed pose), performs a real move, saves (v2),
  reloads the page, re-drives the same deterministic crossing, and verifies pose restoration.

**2026-07-24 closure of the former UI scope gap.** Greybox now has a real CoK overland selector.
`openCokTravel()` renders `BIGPIC1.DAX#121`, the exact picture selected by ECL1#16's own initial-entry
`PICTURE 121`, and reads the ten actionable coordinates directly from the block's embedded 12-entry
GETTABLE arrays (discarding only sentinel arm 0 and blank/pagination arm 10). Clicking a point seeds
only the selected `(x,y)` host registers, then hands control to the ordinary `DialogueRunner`; the
retail location text, `HORIZONTAL_MENU`, `SAVE game_area`, and `NEWECL` remain script-owned. The
visible Travel button opens this screen from the base `?explore=cok` profile, and a real Gargath
map-edge exit now opens it after the retail "DO YOU WISH TO LEAVE?" prompt. The older
`crossCokWilderness()` fixed arm-11 seam remains for its deterministic Outpost regression, but is no
longer the only browser route.

Two browser regressions pin the new boundary. `cok-retail-travel` verifies picture id 121, all ten
byte-derived coordinates, the arm-1 confirmation/SAVE/NEWECL, and a real ECL1#32 landing.
`cok-campaign-continuity` begins at the ordinary base ECL1#34 boot (no `cok-natural-*` profile), walks
the 37-action natural HOBGOBLIN/WARRIOR/BLACK ROBE MAGE route, resolves and resumes combat with
`[0x4c55]=0x30`, clicks the visible Travel and destination buttons, lands in ECL1#32 with that flag
still live, saves, restarts the page, and restores disk/area, pose, clock, and flag. Electron's e2e
also boots a native-selected CoK folder and repeats the picture-121 selector through the ECL1#32
landing; the sibling corrupted-folder negative control continues to prove selected-folder bytes do
not silently fall back to the bundled copy.

**Corpus-promotion note.** As with CoK's Third/Fourth Routes, this fifth route's promotion lives
entirely in this doc plus its own engine golden, save round-trip test, and e2e coverage — not
additionally mirrored into `tools/goldbox_corpus_routes.json`'s singular per-profile slot. CoK is
**not** promoted to Campaign by this leaf (matching every other game's own honestly-unpromoted
precedent) — no corpus/support-matrix change was made to claim otherwise.

## CoK's Sixth Route (Quest)

BUILD-QUEUE item 6's **quest** leaf for CoK, following the exact method Secret's Sixth Route
established: `tools/map_gen1_cross_area_flag_reads.py` extended with a `champions-of-krynn`
`FLAG_REGISTRY` entry covering all seven candidate words from CoK's five already-proven routes —
`[0x4c55]` (Early, mask `0x20`, plus its own selector-27 flavour bit `0x10` on the SAME word),
`[0x4c44]` (the Early route's own selector-30 flavour-cell write, mask `0x1`), `[0x4c6e]` (Middle),
`[0x4cc2]`/`[0x4cc3]` (Ending's two stages), `[0x4c84]` (Town), and `[0x4c37]` (the Fifth Route's
own "outpost discovered" precondition — a READ, not a write, in that route; its own setter was
UNLOCATED when that route was promoted, making it exactly the kind of word a cross-block quest
flag would be). `python tools/map_gen1_cross_area_flag_reads.py --profile champions-of-krynn`
found **zero** cross-block hits for the first six words (all same-block-only — 24/12/23/21/15/9
same-block hits respectively) but **five cross-archive hits, all on `[0x4c37]`** — the strongest
possible outcome, on the one word this project's own precedent flagged as most promising (an
unlocated-setter precondition, the same shape that produced Secret's own hit).

**The finding.** `ECL1.DAX` block 17 — a genuinely different block from both the setter's
candidate pool and the reader (`ECL1.DAX#16`, the Fifth Route's own promoted block) — contains a
"landmark discovery" loop inside its `initial_entry`. Past an unrelated counter-driven preamble
(vaddr `0x8014`-`0x80b3`: a compare/increment chain against words `[0x4c26]`/`[0x4c27]`/`[0x4c3a]`
that reads like a "steps travelled in this region before anything new appears" gate — out of scope
for this leaf, and bypassed here the same way Pool's ECL8#29 and CoK's own Fifth Route bypass an
unrelated preamble by entering directly at the mechanism's own vaddr), the loop at vaddr `0x80b5`
checks successive bits of `[0x4c29]` (a "which landmarks has the party found" bitmask) in a fixed
order — masks `1`, `2`, `16`, `4`, ... — revealing the FIRST bit not yet set: `AND [0x4c29],
<mask> -> [0x7f79]` (the same masked-descriptor scratch register this project's other CoK routes
already use), `IF_NE` skips to the next mask if already revealed, otherwise falls through to `ADD
<mask>,[0x4c29]`, two real "PRESS BUTTON OR RETURN TO CONTINUE." `HORIZONTAL_MENU` continue prompts
(`GOSUB 0x9d78`, byte-decoded: a genuine 1-choice pause, not a no-op), narration text, and a
mask-specific per-landmark flag write. **Mask `16`'s own write, at vaddr `0x830e`, is `SAVE
#1,[0x4c37]`** — literally the Fifth Route's own "outpost discovered" flag, decoded straight off
the block's raw bytes (word `19511` = `0x4c37`, the exact address the Fifth Route's own golden has
always had to seed directly).

**The gate, byte-verified in the reader.** `ECL1.DAX` block 16's own `search_location` — the SAME
12-arm coordinate picker the Fifth Route golden already drives — arm 11's own handler (vaddr
`0x8522`, immediately following the `dest_area=1/dest_block=17` staging block for a DIFFERENT,
adjacent arm) opens with `COMPARE [0x4c37],#1 ; IF_NE ; GOTO 0x842a`: unset/non-1 skips the outpost
branch entirely and falls into a SHARED fallback at vaddr `0x842a` that stages `SAVE #1,[0x4c24]`
(`dest_area=1`), `SAVE #17,[0x4c25]` (`dest_block=17`) — routing the party right back into block
17, the SETTER's own block, a closed loop with its own "you haven't found anything new here yet"
narrative logic. Only `[0x4c37]==1` (plus a second, unrelated gate `[0x4c3a]!=1` this leaf does not
otherwise exercise — a plausible "temporarily closed" flag, left uninvestigated as out of scope)
lets arm 11 proceed to stage `dest_area=4, dest_block=68` — THE OUTPOST, exactly the crossing the
Fifth Route's own golden proves. So block 17's landmark-discovery narration — not the destination
picker at all — is what a real playthrough would use to earn the precondition the Fifth Route has
always had to seed directly: a genuine cross-block quest dependency, matching Secret's Sixth
Route's own definition exactly (a flag SET by one block, genuinely READ by a different block,
gating that different block's already-proven content).

| Setter | Consumed state | Reader (different block) |
| --- | --- | --- |
| ECL1#17 landmark-discovery loop (vaddr `0x80b5`), mask `0x10`, requires masks `0x1`/`0x2` already found | `[0x4c37]` 0 -> `1` | ECL1#16 `search_location` arm 11 (vaddr `0x8522`): `1` clears the gate into `dest_area=4/dest_block=68` (THE OUTPOST); unset/other falls back to `dest_area=1/dest_block=17` — the setter's own block |

**Automated evidence.**

- Scanner tool: `tools/map_gen1_cross_area_flag_reads.py`'s `champions-of-krynn` `FLAG_REGISTRY`
  entry (7 candidate words) narrowed the search to the `[0x4c37]` cross-archive hits above
  (`docs/engine/research/gen1-cross-area-flag-reads.md`); every hit quoted in this section was then
  independently confirmed by manual disassembly and by the engine goldens below, not trusted from
  the scan alone.
- Engine goldens: `packages/engine/test/dungeonEvents.test.ts` — "golden CoK ECL1 block 17
  landmark-discovery loop (quest-flag setter, `[0x4c37]`)" (enters the loop directly at vaddr
  `0x80b5` with `[0x4c29]=0x03` seeded — masks `0x1`/`0x2` already found, so the loop's own fixed
  check order reaches the mask-`16` branch on this call — drives the two real continue prompts, and
  asserts `[0x4c37]` goes from unset to `1` and `[0x4c29]` gains bit `0x10`) and "golden CoK ECL1
  block 16 quest gate (cross-block persistence of `[0x4c37]`)" (drives the SAME arm-11 coordinate
  match `[0x4bc3]=15,[0x4bc4]=11` the Fifth Route golden uses, twice: with `[0x4c37]` unset the real
  `runEclChain` visits `[16, 17]` and stages `dest_area=1/dest_block=17`, no `loadFiles{geoBlockId:
  68}` effect anywhere; with `[0x4c37]=1` — exactly what the setter golden produces — the SAME
  coordinate match now visits `[16, 68]`, fires `setGameArea:4`, and stages `dest_area=4/
  dest_block=68`, the identical crossing the Fifth Route's own golden proves).
- Save v2 persistence: no new row was added, matching Secret's own Sixth Route precedent — both
  blocks involved (`ECL1.DAX#16`/`#17`) already live in the SAME archive (`ECL1.DAX`) and the SAME
  `areaMemory` bucket every CoK route sharing that archive already round-trips; this leaf's own
  proof is a same-load cross-block dependency (two blocks, one already-loaded archive), not a
  save/reload boundary crossing.
- Browser wiring: `openCokTravel()` now drives the real map selector and, when the unavailable
  Outpost arm falls back to block 17, hosts ECL1#17's own non-GEO `initial_entry` as paged retail
  dialogue over the live view. Cold VM execution identifies that normal entry as the Throtl
  Commandant sequence, not the separate landmark loop at `0x80b5`; the focused browser regression
  `cok-throtl-fallback` proves the real ECL1#16 confirmation reaches that host. This closes the
  earlier "no host for block 17" browser gap; it does **not** claim that the original
  movement/time/cadence trigger that reaches the landmark loop has been recovered. Static trace
  locates that trigger precisely: it requires `[0x4c26] == 1`, `[0x4c5c] != 0`, and either
  `[0x4c28] > 6` (the block increments it) or `[0x4c7d] != 0`; no CoK ECL writer exists for the
  other three words, so their source must be measured in the original runtime.
  `window.__explore.crossCokWilderness()` remains the deterministic seeded arm-11 regression until
  that separate contract is known.

**Corpus-promotion note.** This promotion lives entirely in this doc plus its own engine
goldens — no `tools/goldbox_corpus_routes.json` or support-matrix change was made to claim
otherwise, matching Secret's Sixth Route's own precedent.

**Campaign-matrix status.** With the Early, Middle, Ending, Town, Wilderness, and now Quest legs
all proven at the engine level, **CoK's full six-leg BUILD-QUEUE item-6 matrix is now proven** —
the same milestone Secret reached with its own Sixth Route (five applicable legs there; CoK is the
first game in this project to prove all six, since none of the other games has a positive result on
every leg: CoAB is blocked on town, Secret's wilderness is structurally absent, Pool's quest leg is
unresolved). Matching every other game's own honestly-unpromoted precedent in this file, **CoK is
still NOT promoted to Campaign by this leaf** — town's exit half and the wilderness crossing's
organic in-browser trigger both remain engine-proven-only (their own scope notes above), and no
corpus/support-matrix change was made to claim otherwise. Whether "all six legs engine-proven, some
without full live-browser triggers" satisfies BUILD-QUEUE item 6's own Campaign-promotion gate
wording is a judgment call for that item's own exit-gate step, not asserted here.

## DoK's First Route

**Landed 2026-07-18 — the long-blocked first-wave holdout closes; DoK is promoted route →
persistent.** Full investigation history (six blocked/partial rounds, the operand-dialect fix that
unblocked it, and the wiring round itself) lives in `dok-natural-route.md` (Updates 8–10); this
section records the route against this file's contract.

**Route.** `?explore=dok-natural` — Death Knights of Krynn `ECL1.DAX#34` (Cekos town, 16×16,
`GEO1.DAX#34`), dialect `ECL_GEN1_SHORT` (mandatory — DoK is a short-frame 1991+ title; long
frames desync this exact chain). Spawn = `chooseStart` on the real GEO bytes → `(2,1)` facing
north. The unique descriptor-12 cell `(11,1)` (byte `0x8C`, event-active) dispatches
`search_location` ON_GOTO index 12 → `0x92B7`: "SIVAKS ARE GATHERED AROUND A TABLE." →
`LOAD_MONSTER #33,#15,#33` (SIVAK ×15; a second group `{97 IGORF, 1, 97}` loads only when
`[0x4C5E]=1`, which a fresh game does not set — the fresh roster is exactly SIVAK ×15) → COMBAT
at `0x9327` → victory resume at `0x9328`: `OR #8,[0x4C5F]` + "A SILVER KEY LIES ON THE TABLE."

**Legal walk.** 17 directed steps (25 turn/step actions), derived from the GEO wall/door data by
`tools/find_geo_path.py --avoid-event-index 22` — descriptor 22 at `(8,1)` (the BLUE DRAGON
town-guard chain) must be avoided; the forced descriptor-11 crossing at `(10,4)` was VM-proven a
silent no-op (writes only scratch cells `0x7F79/0xC04E/0xC04F/0x7EC6/0x4BFD/0x4C0C`, no collision
with the route's `0x4C5F`/`0x4C5E` words).

**Persistence.** Save v2 `areaMemory` under map key `"Death Knights of Krynn ECL1#34"`; consumed
state `[0x4C5F]=0x08` (fresh `0`). **Retail deviation from every prior route in this file:** the
victory bit does not consume the encounter. Block 34's own bytes guard only the single SURPRISE
instruction (`AND #8,[0x4C5F] ; IF_NE ; SURPRISE` at `0x92B7–0x92C1`), so a revisit **re-fires
the full ambush with SURPRISE armed**. Greybox models the bytes: the shared
`verifyNaturalPersistence` helper gained an opt-in `revisitRefires: true` mode asserting the
persisted word AND the re-fire AND the armed SURPRISE; every previously proven route keeps the
default cannot-refire check.

**Proof artifacts.**
- Engine golden: `packages/engine/test/dungeonEvents.test.ts` "golden DoK ECL1 block 34"
  (unique-cell assertion, direct combat turn, exact roster, seed-swept, victory write, IGORF arm,
  revisit re-fire).
- Save matrix row: `packages/engine/test/saveGame.test.ts` `['DoK ECL1#34', 11, 1, 'north',
  0x4c5f, 0x08]`.
- Browser: `apps/web/test/e2e.mjs::runExploreDokNaturalCombat` (id `explore-dok-natural-combat`)
  — spawn pose, full walk, dispatch text, 6-of-15 SIVAK display roster (same display-cap
  precedent as CoK's route), fresh-null SURPRISE, `0 → 0x08`, then persistence + re-fire.
- Corpus: `tools/goldbox_corpus_routes.json` (full `natural_encounter` + `persistence` byte
  contract), `python tools/goldbox_corpus.py --strict` → DoK `level: "persistent"`.

**Campaign promotion matrix (DoK).** Early = this route (proven); wilderness = also proven, see
§ DoK's Second Route below; town = also proven, see § DoK's Third Route below; middle = also
proven (2026-07-22), see § DoK's Fourth Route below. Ending/quest are `blocked` (investigated,
concrete root causes documented) in `tools/goldbox_campaign_matrix.json` — DoK honestly fails the
campaign gate until those 2 legs are worked, matching every other game's unpromoted precedent in
this file.

**Not proven here:** the `0x79` operand at `0x9B28` (block 33's shared builder — not on this
route), block 33's own route, DoK original-DOS save write-back parity, and the optional
literal-16 boot-block live reconciliation (`dok-natural-route.md` Updates 7–8).

## DoK's Second Route (Wilderness — Unconditional Area-Mode Entry)

**Landed 2026-07-18, static-only follow-up round.** A different mechanism from every other route
in this file: not a combat encounter, but a proof that DoK's own retail content genuinely drives
the engine's `WildernessMap` mode, matching this project's binary town/dungeon-vs-wilderness
classifier (`tools/map_gen1_area_mode_writes.py`'s module docstring: CoAB's `ovr008.cs
vm_SetMemoryValue` SAVE-opcode special-case on host location `0x4BE6` → `Area1.inDungeon`, 0 =
`GameState.WildernessMap`).

**Why it was missed before.** The scanner reported "0 hits" for DoK prior to this round — a false
negative from two stacked bugs, not a real absence: (1) `death-knights-of-krynn` was missing
from the tool's own `GEN1_PROFILE_IDS` tuple, so `--profile death-knights-of-krynn` silently
scanned zero games; (2) even with the profile added, the tool's `decode_one()` call did not pass
DoK's `GEN1_SHORT_WORD_SETS` operand dialect, which desyncs DoK's decode stream — the exact same
bug class Update 9 (`dok-natural-route.md`) already root-caused for the P2/combat scanner. Both
fixed in `tools/map_gen1_area_mode_writes.py` this round (thread `word_sets_for_profile()`
through `scan_block_for_save`/`decode_one`; add DoK to `GEN1_PROFILE_IDS`). Rerunning against
real retail bytes surfaces 25 genuine `SAVE`-to-`0x4BE6` hits across DoK's ECL1/2/3.DAX.

**Route.** `Death Knights of Krynn/ECL1.DAX#17`, dialect `ECL_GEN1_SHORT`. Its `initial_entry`
(vaddr `0x8014` — ALWAYS the cold entry point of a freshly loaded block, per `disassemble.ts`'s
header doc) executes `SAVE #1, [0x4cf7]` then, as its very next instruction with zero
`COMPARE`/`IF` in between, `SAVE #0, 0x4BE6` at vaddr `0x801a` — clearing `inDungeon`
unconditionally. No memory seeding of any kind is required; a cold `new EclVm(block17raw, {
dialect: ECL_GEN1_SHORT })` reaches it on the second `.step()`. Execution continues to
`LOAD_FILES #127,#127,#127` (GEO block 127) and `PICTURE #112`, then exits cleanly via a
`COMPARE #255,[…]`/`IF_NE`/`EXIT` tail.

**Proof artifacts.**
- Engine golden: `packages/engine/test/dungeonEvents.test.ts` "EclVm cold run — golden DoK ECL1
  block 17 wilderness-mode entry (campaign matrix, wilderness leg)" — asserts the exact two-SAVE
  unconditional prefix by vaddr/mnemonic/operand, then the full cold run's memory + effects.
- Scanner: `tools/map_gen1_area_mode_writes.py --profile death-knights-of-krynn` (post-fix), 25
  hits across ECL1/2/3.DAX; `docs/engine/research/gen1-area-mode-writes.md` (regenerated).

**Evidentiary bar.** Matches this project's own "proven" precedent for engine-golden-only legs
(CoK's and Secret's Sixth/quest routes): live in-browser wiring is not required for `proven`
status. `tools/goldbox_campaign_matrix.json`'s DoK `wilderness` leg is updated `not-tracked` →
`proven`, citing this section.

**Not proven here:** which GEO area(s) actually render on the WILDCOM tileset once `inDungeon`
clears (live in-browser wilderness walk — deferred, same precedent as CoK's Sixth Route deferring
its own block-17 narration trigger); whether any of the scanner's other 24 hits (ECL1#16/#36,
ECL2#50/#64, ECL3#81/#98/#99) split cleanly into town vs. dungeon; a second *combat*-shaped
natural-encounter leg (swept ECL1#17/#33, ECL2#67, ECL3#99 across the full backdrop range with
default memory — zero reached combat; ECL2#67's static CFG witness path needs an unproven
cross-block flag `[0xC00D]==1`, the same "needs an unproven flag" shape this file's CoK
middle-route section documents rejecting, so this stays genuinely open rather than forced).
**[2026-07-22 correction: that "`[0xC00D]`" was a transcription slip for `[0xC04D]` — the host
FACING register, deterministic and player-controllable, not a cross-block flag. ECL2#67 is now
DoK's proven middle leg; see § DoK's Fourth Route (Middle) below and `dok-natural-route.md`
Update 14.]**

## DoK's Third Route (Town — Real VM Bug Fix Unlocks Two Named Towns)

**Landed 2026-07-18, static-only follow-up round.** Investigating the wilderness leg's own
leftover "which of the other 24 `SAVE`-to-`0x4BE6` hits are town vs. dungeon" question surfaced a
real, general VM fidelity gap that had been silently blocking every DoK `PARLAY` (attitude-select
menu) resume — not a DoK-only data quirk, a genuine engine bug.

**The bug.** `packages/engine/src/ecl/vm.ts`'s `case 0x2c` (PARLAY) builds a `valueMap` from all
but the last operand: `values = a.slice(0, destIndex)`. DoK's Gen1-SHORT dialect encodes PARLAY
with a *single* operand (just `destAddr`; no remap table, unlike the long dialect's up-to-6-operand
form), so `destIndex = 0` and `values = []` — empty, but still a real array, hence *truthy*. The
resume path (`pending.valueMap[index] ?? pending.valueMap[0] ?? 0`) then resolves every chosen
attitude to `undefined ?? undefined ?? 0 = 0`, so **all 5 attitude choices produced byte-identical
effects and memory state**, discovered by resuming `ECL1.DAX#36`'s ("Cekos Main Gate") own PARLAY
with each of the 5 choices and finding identical output regardless of choice.

**The fix.** `valueMap: values.length > 0 ? values : undefined` — a table-less PARLAY now falls
through to the same passthrough convention the engine already uses for MENU/ASK (`if
(!pending.valueMap) return value & 0xffff`), so the raw chosen index (0–4) is written directly to
`destAddr` instead of a bogus all-zero map. General fix, not gated on dialect — any Gen1-SHORT
title's single-operand PARLAY benefits.

**Route (two independent proofs, two archives).**
- `Death Knights of Krynn/ECL3.DAX#81` ("Dulcimer"), dialect `ECL_GEN1_SHORT`. `initial_entry`
  opens with a self-identity guard (`COMPARE [0x4BF2],81` / `IF_EQ` — jumps away only on a
  *match*; cold, all-zero memory never matches, so a fresh game falls straight through, no
  seeding needed) into `SAVE #1, 0x4BE6` (`inDungeon=1`, the local/town area-mode mirror of the
  wilderness leg's `inDungeon=0`), `LOAD_FILES(80,...)`, `LOAD_PIECES(5,...)`, a `PARLAY`, then a
  real arrival text ("THIS MAIN STREET LEADS INTO DULCIMER... ZOMBIES FILL A MARKET TO THE
  EAST...") and a clean `exited` status — identical across all 5 attitude choices post-fix.
- `Death Knights of Krynn/ECL2.DAX#64` ("Cerberus"), same shape, independent archive: a
  mayor's-funeral NPC-dialogue arrival text, same `inDungeon=1` write, same choice-independent
  clean exit.

**Proof artifacts.**
- Engine goldens: `packages/engine/test/dungeonEvents.test.ts` "EclVm cold run — golden DoK ECL3
  block 81 town entry (campaign matrix, town leg)" (all 5 attitude choices asserted, text +
  `inDungeon=1` checked) and "...golden DoK ECL2 block 64 town entry (...second archive)".
- Regression check: full `packages/engine` vitest suite (149 files / 1761 tests) passes with the
  fix applied, confirming no other opcode-0x2c caller depended on the old empty-valueMap behaviour.

**Evidentiary bar.** Matches this project's own "proven" precedent for engine-golden-only legs
(CoK's/Secret's quest routes, and this file's own DoK Second Route above): live in-browser wiring
is not required. `tools/goldbox_campaign_matrix.json`'s DoK `town` leg: `not-tracked` → `proven`.

**Historical boundary, superseded 2026-07-31:** Updates 16–17 of
`docs/engine/research/dok-natural-route.md` now prove the nested Gargath parlay, selector-15 native
host call, and live browser walk. Whether the remaining un-swept `0x4BE6` hits (`ECL1#16`,
`ECL2#50`) are also towns remains outside that verified slice.
Full investigation trail, including the middle/ending/quest legs that were investigated the same
round and stayed genuinely blocked (RNG gate; an unresolved bad-opcode desync with one hypothesis
decisively falsified; no cross-block flag evidence): `docs/engine/research/dok-natural-route.md`
Update 12.

## DoK's Fourth Route (Middle)

**Landed 2026-07-22, static + browser round (no DOSBox-X — that slot was owned elsewhere).**
`docs/engine/BUILD-QUEUE.md`'s "Repeat the middle/ending/town/wilderness/quest matrix" leaf, DoK
half: the campaign matrix's `middle` leg, previously `blocked`, promoted to `proven` after the
blocking verdict itself was found to rest on a **transcription slip**. Update 11
(`dok-natural-route.md`) recorded ECL2#67's combat gate as an unprovable cross-block flag
"`[0xC00D]==1`"; a fresh scan for `0xC00D` readers across all of DoK's ECL archives returned
**zero hits**, and re-decoding the actual witness path shows the gate is `COMPARE #1,[0xC04D]` —
the retail host **FACING register**, deterministic and fully player-controllable. Nothing was
ever blocked except the address in the notes.

**The facing-register semantic (and a real engine fidelity fix).** Retail ground truth
(`gen1-dosbox-runtime-trace.md`; DoK's own write-side remap in
`tools/trace_dok_position_setter.ps1`): the DGROUP *storage* value at the facing slot is the even
code 0/2/4/6, but the **ECL-visible read of `[0xC04D]` is the half-direction ordinal 0=N, 1=E,
2=S, 3=W**. A 5-title corpus census (all Gen1 DAX games, via
`tools/map_gen1_cross_area_flag_reads.py`'s `scan_block_for_targets` machinery) confirms it from
the content side: **every** `SAVE`-immediate and `COMPARE`-immediate against `[0xC04D]` in the
entire corpus is in 0..3, and Pool/CoAB both dispatch `ON_GOTO [0xC04D], #4` — a 4-way jump
that is impossible under a 0/2/4/6 encoding. Greybox's `gen1MapDirectionValue`
(`packages/engine/src/world/dungeonEvents.ts`) was seeding `MAP_DIRECTION_ADDR` with the *stored*
even codes — a genuine general fidelity bug (every prior proven route's gate happened not to read
facing, so it was latent). Fixed to the ordinal encoding; full engine suite green post-fix, zero
regressions.

**Route.** `?explore=dok-natural-2` — Death Knights of Krynn `ECL2.DAX#67` (a town square, 16×16,
`GEO2.DAX#67`), dialect `ECL_GEN1_SHORT` (mandatory, Update 9). A 2×2 square of masked-3 floor
cells `(8,7)/(9,7)/(8,8)/(9,8)` (raw byte `0x03` — no `0x80` bit; the dispatch masks `& 0x3F`)
feeds `search_location`'s 23-arm `ON_GOTO` → arm 3 at `0x8735`: `AND #0x10,[0x4C65]` → `IF_NE` →
guarded `SURPRISE` (revisit arming, see below), then `COMPARE #1,[0xC04D]` / `IF_EQ` / `GOTO
0x8851`. Entering a square cell moving **east** → `SAVE #2,[0x7ECB]`, "YOU HAVE GOTTEN BEHIND THE
AMBUSH.", `GOTO 0x87D0` → `PARTYSTRENGTH`/`CLEARMONSTERS`/`LOAD_MONSTER` groups `70×6, 43×10,
66×6` (PATRIARCH ×6, CRAZED DWARF ×10, BLACK MAGE ×6 — DoK ships a single `MON1CHA.DAX` for all
areas) → `COMBAT` at `0x87E7` → victory resume `OR #0x10,[0x4C65]` + "THE REST RUN AWAY." Any
**other** facing takes the warning arm at `0x8754` ("AS YOU ENTER THE SQUARE... AN AMBUSH!") and
exits cleanly — nothing consumed, nothing seeded.

**Legal walk.** The `startPose` is **byte-grounded, not the `chooseStart` heuristic**: block 67's
own `initial_entry` `SAVE`s x=10, y=0, facing=south at vaddrs `0x805E–0x8076`. From that scripted
arrival, `tools/find_geo_path.py` returns a 13-directed-step walk (22 turn/step actions,
`dos_keys` cross-validated) ending at `(8,7)` facing west — it enters the square at `(9,7)`
moving *south* (warning arm fires, proven harmless) and continues west into `(8,7)` (warning
again), then two right turns and one forward step re-enter `(9,7)` moving **east** → combat. The
walk crosses exactly two nonzero intermediate descriptors — `(11,5)` and `(9,6)`, both masked 9.
*(2026-07-23 correction, Update 15: the original "VM-proven silent no-ops" claim was a decode
artifact of the then-wrong 3-operand `SETUP_MONSTER` frame — the arm-9 stream desynced right
after `SETUP_MONSTER #70,#1,#255` and appeared to exit. Under the byte-proven 4-operand frame
the FIRST masked-9 crossing is a real consumable retail encounter: guard `AND #4,[0x4C03] ;
IF_NE ; EXIT`, then "YOU SURPRISE MAGES AND CLERICS PRACTICING THEIR SPELLS." → PATRIARCH 70×4 +
BLACK MAGE 66×4 → `COMBAT 0x9017` → victory `OR #4,[0x4C03]`. The second crossing at `(9,6)` is
then silent via the consumed bit, and `[0x4C65]` is untouched throughout — no collision with the
ambush leg. The route is unchanged and still legal; the e2e replay now fights this encounter
honestly at the 8th forward step and asserts the second crossing stays silent.)*

**Persistence.** Save v2 `areaMemory` under map key `"Death Knights of Krynn ECL2#67"`; consumed
state `[0x4C65]=0x10` (fresh `0`). *(2026-07-23 correction, Update 15: the original "victory bit
ARMS the guarded SURPRISE and the ambush re-fires" reading is REFUTED — DoK's short-dialect
`SURPRISE` (0x23) is the byte-proven 0-operand script-TERMINAL form (GAME.OVR handler `0x3076`
tail-calls `CMD_Exit`), so `AND #0x10,[0x4C65] ; IF_NE ; SURPRISE` is the standard Gen1
consumed-bit suppressor: a revisit with bit 4 set exits silently, same as every other proven
Gen1 route. `verifyNaturalPersistence`'s `revisitRefires` inverse mode is deleted; both DoK
routes use the standard consumed check.)*

**Wall-set note (a real loader lesson).** ECL2#67's `LOAD_PIECES` requests wall set **1** — DoK
numbers wall sets *globally across disks* (`WALLDEF1.DAX`=[block 1], `WALLDEF2.DAX`=[3,4],
`WALLDEF3.DAX`=[5,6]), so this disk-2 area mounts disk 1's `WALLDEF1.DAX`/`8X8D1.DAX` pair, not
the same-numbered disk-2 archives.

**Proof artifacts.**
- Engine goldens: `packages/engine/test/dungeonEvents.test.ts` "golden DoK ECL2 block 67
  middle-area ambush (descriptor 3, facing-gated)" — 4-cell census, east-facing combat via the
  production `facing` option, exact roster, victory write, non-east warning arm (nothing
  consumed), consumed-revisit silence (2026-07-23 semantics), and the corrected
  descriptor-9 intermediates golden (first crossing fights, second is consumed-silent). Plus the
  updated pinned `gen1MapDirectionValue` encoding test (north=0/east=1/west=3).
- Save matrix row: `packages/engine/test/saveGame.test.ts` `['DoK ECL2#67', 9, 7, 'east',
  0x4c65, 0x10]`.
- Browser: `apps/web/test/e2e.mjs::runExploreDokNatural2Combat` (id
  `explore-dok-natural-2-combat`) — byte-grounded spawn pose, split walk with the honest
  descriptor-9 spell-practice fight at the 8th forward (roster 4 PATRIARCH + 2 BLACK MAGE under
  the display cap, `[0x4C03]` `0 → 0x04`, `[0x4C65]` untouched), silent second crossing,
  warning-arm assertion (no combat, `[0x4C65]` untouched), east-entry dispatch text,
  6-PATRIARCH display roster (same display-cap precedent as CoK/DoK first routes), fresh-null
  SURPRISE, `0 → 0x10`, then standard consumed persistence via `verifyNaturalPersistence`.
- Matrix: `tools/goldbox_campaign_matrix.json` DoK `middle`: `blocked` → `proven`, citing this
  section. DoK's failing legs narrow 3 → 2 (`ending`, `quest`).

**Not proven here:** live original-DOS validation of the facing gate under DOSBox-X (out of
scope this lane — the retail semantic rests on the already-proven runtime-trace docs + the
5-title content census); ECL3#99's RNG wandering-monster gate (Update 12's root cause stands —
this route replaces it as the middle-leg candidate rather than disproving it). *(DoK's
ending/quest legs, "still genuinely blocked" when this section landed, were both proven
2026-07-23 — see the Fifth and Sixth Routes below.)*

## DoK's Fifth Route (Ending — Dargaard Keep Top Floor)

**Landed 2026-07-23, static + engine round (no DOSBox-X — that slot was owned elsewhere).** The
campaign matrix's `ending` leg, previously `blocked` on Update 13's "the trigger cell (8,14)
sits in a different connected component than the spawn (8,0)" verdict — which turns out to have
been computed from the **wrong spawn**: `(8,0)` was the `chooseStart` heuristic, but
`ECL3.DAX#98`'s own `initial_entry` byte-grounds the real spawn with `SAVE #8,[0xC04B]; SAVE
#14,[0xC04C]; SAVE #3,[0xC04D]` — **(8,14) facing west, ON the `GEO3.DAX#98` descriptor-1
spiral-staircase cell**, in the same wall-graph component as everything the leg needs. Full
derivation: `dok-natural-route.md` Update 15 §15.5.

**The area.** Dargaard Keep's top floor — DoK's finale. Cold `initial_entry` also SAVEs area id
98 (`[0x4BF2]`), `inDungeon=1` (`[0x4BE6]`), `LOAD_FILES(98,127,255)` (GEO3#98), prints the
Dargaard arrival text, and GOTOs (`0x80FD → 0x8246`) straight into the staircase arm's "GO DOWN
THE STAIRS?" — the short dialect's 0-operand `PARTY_SURPRISE` yes/no prompt (semantics
byte-proven from DoK's GAME.OVR handler `0x23BB`, Update 15 §15.2): **NO exits, YES chains
`NEWECL(#97)`** (the stair pair 98↔97).

**The gauntlet.** `search_location` (`0x81E0`) masks the cell byte with 63, resets the
flash-door latch `[0x4C07]` on every non-4 descriptor, EXITs above 18, then dispatches 19 arms.
A min-descriptor-crossing Dijkstra walk over GEO3#98's own wall/door edges from (8,14) to the
Soth door (12,6) — 60 steps, 13 crossings — hits the arms in exactly the script's designed
order: the `[0x4CCF]`-chained taunting voices d2→d5→d6 (1→2→3), the d7 Lady Lenore join
(`[0x4CCF]`=4, `PICTURE(79)`, terminal SURPRISE), three facing-compatible d4 flash-door
crossings, the d8 corner room, silent d20/d22, the d9 statue door (menu IGNORE/TALK/ATTACK;
IGNORE → `[0x4C02]=1`), the d10 Durfey fight (SIR DURFEY 75×1 + SPECTRE 18×4 + the ignored
statues joining as IRON STATUE 30×2; victory → `PARLAY(#134)` → `SAVE #1,[0x4C03]`), and
finally d13 (12,6): **`SAVE #1,[0x4CD0]` as its first instruction** (the campaign-completion
flag — see the Sixth Route), `PARLAY(#133)`, LORD SOTH 78×1 + 26×4 + 30×5, victory → the Rod of
Omniscience yes/no → whirlpool `PICTURE(115)` → the Lenore=Kitiara reveal yes/no → `SAVE
#0,[0x4CFF]; SAVE #0,[0x4BFB]; SAVE #3,[0x7F12]` → `NEWECL(#48)` epilogue chain.

**Proof artifacts.**
- Engine goldens: `packages/engine/test/dungeonEvents.test.ts` "golden DoK ECL3 block 98
  Dargaard Keep top floor" — (a) cold `initial_entry` boots the byte-grounded spawn pose on the
  descriptor-1 staircase cell (GEO ground truth asserted), pauses at the stair yes/no (`style:
  'yesno'`, items YES/NO), NO → `exited`, YES → `chain` blockId 97; (b) the full 60-step walk's
  descriptor sequence replayed against ONE shared memory through `dialogueForCell` (GEO bytes
  asserted for all 13 crossings, `[0x4C07]` latch resets modeled via descriptor-0 cells,
  `[0x4CCF]` 1→2→3→4, statue IGNORE, Durfey roster + statues-join text + `[0x4C03]`, Soth
  roster, `[0x4CD0]=1` written at the parlay pause BEFORE any fight outcome, rod + Kitiara
  yes/nos, final `chain` to #48 with `[0x4CFF]=0`/`[0x4BFB]=0`/`[0x7F12]=3`).
- Matrix: `tools/goldbox_campaign_matrix.json` DoK `ending`: `blocked` → `proven`, citing this
  section.

**Not proven here:** live in-browser wiring (explicitly deferred — `statuses.proven` does not
require it; same precedent as DoK's town leg and CoK/Secret's quest legs); `ECL3.DAX#97`'s own
content (the stairs-down target — natural candidate for a future `?explore=dok-natural-3`);
Durfey/Soth flee-path behavior (`[0x7EC7] > 128` re-fight loops decoded but not golden-pinned).

## DoK's Sixth Route (Quest — [0x4CD0] Campaign-Completion Flag)

**Landed 2026-07-23, same round.** The campaign matrix's `quest` leg, previously `blocked` on
Update 12's honest "no cross-block dependency found among the then-proven legs' flags" — a scan
that could not have found this flag, because its writer sits in the then-unreachable ending leg.
Full derivation: `dok-natural-route.md` Update 15 §15.6.

**The flag.** `[0x4CD0]` has **exactly one write site in DoK's entire three-archive ECL corpus**:
`ECL3.DAX#98` `search_location` vaddr `0x8CAB` — `SAVE #1,[0x4CD0]`, the first instruction of
the Lord Soth door arm the Fifth Route walks to. It has **25 read sites across eight blocks in
all three archives** (ECL1#17 camp-interrupt ×7 + vm_run_1 + search_location; ECL1#36;
ECL2#48 the epilogue; ECL2#50; ECL2#64; ECL3#80/#81/#82) — a genuine cross-archive world-state
dependency, structurally identical to CoK's `[0x4C37]` and Secret's `[0x4C4D]` quest legs.

**The headline reader.** `ECL2.DAX#64` — the Cerberus graveyard, the same block whose cold
funeral branch DoK's Third (Town) Route already pins — `initial_entry` at `0x807C`:
`COMPARE [0x4CD0],#1 ; IF_EQ SAVE #5,[0x4C89] ; IF_EQ GOTO 0x8236` → "THE GRAVEYARD LIES BEFORE
YOU, RESTORED TO ITS PRIOR SERENITY." and a clean exit **without** the funeral `PARLAY` pause.
With the flag clear, the same cold entry pauses at the funeral parlay and plays the haunted
graveyard content. The world visibly changes state after the Dargaard finale, and `[0x4C89]=5`
marks the graveyard subplot resolved (`0x81D2` converges the mid-quest `[0x4C89]==5` path onto
the same serenity text).

**Proof artifacts.**
- Engine golden: `packages/engine/test/dungeonEvents.test.ts` "golden DoK ECL2 block 64 quest
  gate" — seeded `[0x4CD0]=1` → `exited` with the restored-serenity text, no Cerberus funeral
  content, `[0x4C89]=5`; flag clear → `awaiting-input` at the funeral parlay, `[0x4C89]` unset.
- Matrix: `tools/goldbox_campaign_matrix.json` DoK `quest`: `blocked` → `proven`, citing this
  section. **DoK's failing legs are now empty; computed tier promotes `persistent` →
  `campaign`** (`python tools/goldbox_corpus.py --strict`), the third campaign-tier title after
  CoK and Secret.

**Not proven here:** live in-browser wiring (same deferral precedent as CoK's and Secret's quest
legs); the remaining 24 read sites' individual behaviors (enumerated and archived, one headline
reader golden-pinned — same claim boundary as CoK's Sixth Route).

## Automated Evidence

- Engine schema/migration and three-route matrix: `packages/engine/test/saveGame.test.ts`
- Browser proofs: `apps/web/test/e2e.mjs::verifyNaturalPersistence`
- Corpus declarations: `tools/goldbox_corpus_routes.json::persistence`
- Corpus gate: `tools/goldbox_corpus.py::verify_dax_gen1_route` and `evidence_level`
- Generated evidence: `build/goldbox-corpus.json` and
  `apps/web/src/generated/support-evidence.json` award `persistent` only when all persistence checks
  pass.

Current gates: 28 Python tests, 1,579 engine tests, production static smoke, and 90 Edge cases.
Production bundle `index-sJsG0tcM.js` is live at `/greybox/`. A live Secret persistence replay
walked to `(12,3)`, completed combat, saved version 2 with six party members and `[0x4CCD]=36`,
restarted the page, and restored the same party, pose, time `377`, and ECL word without console or
network errors.

## Claim Boundary

This proves Greybox's own migration-safe snapshot format and natural-route outcome persistence. It
does not prove where these ECL words live in Pool, CoAB, or Secret's original DOS save files, nor
that Greybox can write a retail-compatible save. Those are per-title format and round-trip tasks.

## Campaign Award Rule (2026-07-17)

Every "Campaign promotion matrix" paragraph in this document (CoAB's Fourth Route above, Secret's
Sixth Route, Pool's Quest Leg, CoK's Sixth Route) has, until now, been a **prose-only, manually
scored judgment call** — `docs/engine/BUILD-QUEUE.md`'s item 6 always said the corpus "awards
Campaign only when the full per-game matrix passes," but `tools/goldbox_corpus.py`'s
`evidence_level()` had no code path that could ever return `"campaign"`. This section (and its
companion mechanism, `tools/goldbox_campaign_matrix.json` + `evidence_level()`'s new
`campaign_matrix` check) is that mechanism's design record. Generated per-run detail lives in
`docs/engine/research/goldbox-corpus.md`'s own "Campaign Matrix" table (regenerate with `python
tools/goldbox_corpus.py`); this section is the hand-authored rationale that table doesn't carry.

**The rule.** A game reaches `"campaign"` only when it already sits at `"persistent"` (its declared
anchor route passes `verified-byte-contract` AND `verified-contract` persistence — the existing,
independently byte-checked tier) **and** every one of the six early/middle/ending/town/wilderness/
quest legs carries one of two statuses:

- **`proven`** — engine-level, byte-grounded proof against the real retail disassembly (a VM golden
  and/or CFG trace), the same rigor every route in this document already uses. **Live in-browser
  wiring is explicitly NOT required for this status.** Several legs counted as `proven` in the
  checked-in matrix are engine-proven only, by this document's own precedent — Secret's Sixth Route
  (quest) and CoK's Sixth Route (quest) both say so in as many words ("Browser wiring: deliberately
  deferred"), and CoK's own Fourth Route (town exit) and Fifth Route (wilderness's organic in-browser
  trigger) carry the identical caveat. Demanding full browser wiring would have disqualified CoK
  itself, the game this task's background section names as the intended first positive case — so the
  bar this project has actually been applying, consistently, is the engine-level one.
- **`structurally-absent`** — investigated with genuine effort and found to **genuinely not exist**
  in the game's own retail content (e.g. Secret ships no `WILDCOM.DAX` at all and has zero
  `tools/map_gen1_area_mode_writes.py` hits anywhere in its ECL corpus). This is a **proven negative**,
  not an open question.

`blocked` (investigated with genuine effort, found genuinely unresolved or unreachable — CoAB's town,
Pool's quest) and `not-applicable`/`not-tracked` (never part of that game's own BUILD-QUEUE matrix
scope at all — CoAB's quest leg) do **not** count as passing. Both represent a real, undischarged gap
rather than proven coverage, even though they are different in kind from each other (and both are
different in kind from `structurally-absent`): `blocked` is "we looked, it's stuck"; `not-tracked` is
"this was never in scope, so it's not evidence of anything"; `structurally-absent` is "we looked, and
it provably isn't there." Collapsing any of these three into "counts as done" would misrepresent a
real gap as closed evidence — exactly the failure mode this project's "UNLOCATED beats invention"
ethic (`docs/engine/HANDOFF.md` §5) exists to prevent.

**Why `structurally-absent` counts as passing and `blocked` doesn't.** A leg whose content
demonstrably does not exist in the retail game has nothing left to prove — the investigation reached
a definite, negative, well-evidenced conclusion, the same epistemic status as a `proven` positive
finding (both are *resolved*). A `blocked` leg, by contrast, is an open question: the game plausibly
has this content, but this project has not yet located or proven it. Treating `blocked` the same as
`structurally-absent` would let an unfinished investigation quietly pass as "done." This distinction
is not new to this leaf — `docs/engine/research/coab-town-classification.md` already drew it
explicitly ("CoAB has no discrete GEO-backed town... concept... does not hold... what would be needed
to close the gap" — a description of a blocked, not absent, leg), and CoAB's own BUILD-QUEUE.md entry
already said "CoAB does not get promoted to Campaign while the town check is unmet." This rule simply
makes that existing, hand-applied distinction machine-checkable.

**Computed result (honest, not adjusted to fit an expectation).** Running the rule above against the
matrix transcribed into `tools/goldbox_campaign_matrix.json` from this document's own sections
produces **two** Campaign-tier games, not one: `champions-of-krynn` (all six legs literally `proven`)
**and** `secret-of-the-silver-blades` (five legs `proven`, one — wilderness — `structurally-absent`).
`curse-of-the-azure-bonds` (town `blocked`) and `pool-of-radiance` (quest `blocked`) remain
`"persistent"`. Secret's own promotion is a direct, faithful consequence of applying this document's
own prior findings, not an invented or forced result: "Secret's Sixth Route" above closes with "Secret's
full BUILD-QUEUE item-6 matrix (five applicable legs — wilderness is structurally absent)... is now
proven," withholding promotion only because "no corpus/support-matrix change was made" — i.e. because
this exact mechanism did not exist yet. Now that it does, both games' `web_level` in
`apps/web/src/ui/supportClaims.json` were raised to `"campaign"` to match what
`tools/goldbox_corpus.py --strict` proves; nothing was claimed ahead of the tool's own computation.

**Process risk.** `tools/goldbox_campaign_matrix.json` is a hand-maintained transcription of this
document's prose, not independently re-derived from bytes the way each game's single anchor route
already is in `tools/goldbox_corpus_routes.json`. A future finding that changes a leg's status here
(a DoK P2 slice landing, Pool's quest leg resolving, a CoAB town breakthrough) will not automatically
update the matrix JSON — whoever lands that finding must also edit the matching entry, or the
corpus's `"campaign"` tier will silently drift out of sync with the actual research state. No
automated cross-check between this document and the matrix JSON exists yet.

## CoK clean-input Verified route (2026-07-24)

The earlier six-leg matrix remains byte-grounded breadth evidence, but CoK now also has one joined,
user-facing release route that does not start from a `cok-natural-*` profile, direct ECL entry, area
picker, or hand-seeded encounter. From `?explore=cok`, Play, or a Library-selected retail folder it:

1. runs retail ECL1 blocks `36 -> 16 -> 17 -> 16`, rendering picture ids 112/121 and the intervening
   PIC portraits on the native dialogue surface;
2. invokes block 17's Commandant service and observes the literal Throtl mission assignment;
3. selects ECL1#16 table arm 1 through the visible BIGPIC1#121 travel screen, accepts the retail
   confirmation, and carries the script's `(2,1)`, `game_area=2`, and shared memory into area 32;
4. walks `forward,right,forward,forward` to GEO1#32 selector 16, declines the Soldier, enters the
   natural six-Hobgoblin-plus-Soldier combat, resolves it, and resumes ECL with `[0x4c4b]=0x08`;
5. saves, restarts, and restores disk/area/pose/clock/consumed state without refiring the encounter.

`packages/engine/test/cokNewGameRoute.test.ts`, browser `cok-campaign-continuity` plus the selected-
folder graphics/Companion cases, and Electron `electron-cok-retail-travel` reproduce the declared
checkpoints. `tools/goldbox_corpus_routes.json::verification` names thirteen required source markers;
`verify_release_contract()` rejects the promotion when any disappears. `goldbox_capabilities.json`
separately forces incomplete save/audio/wilderness/quest behavior to stay visible.

Claim boundary: the Commandant-issued patrol is the naturally live quest checkpoint. The older
ECL1#17 `[0x4c37]` landmark-discovery setter still requires wilderness counters that Greybox does
not yet advance. Re-entering block 17 does not earn it, so the live route does not seed or claim it;
continuous wilderness stepping and that deeper quest graph remain explicit capability gaps. The old
ECL1#34 natural route remains a useful low-level byte/persistence anchor, not the new-game front door.

## CoAB's Sixth Route (Quest — Tilverton Help to Temple Diversion)

**Proven 2026-07-31.** The earlier audit below was an honest negative over the four state words
written by CoAB's already-proven combat routes. It was not an exhaustive census of every quest
word, and a different retail dependency closes the leg cleanly: helping a Knight of Myth Drannor
in Tilverton writes `[0x4C28]=1` in `ECL2.DAX#3`; a Knights encounter in the distinct
`ECL6.DAX#64` archive reads that word, recognizes the party's deed, promises to divert troops from
the temple, and writes `[0x4CBC]=1`.

**Producer.** `ECL2#3`'s `search_location` header entry is `0x82CC`. GEO2#3's sole masked
descriptor-3 cell is `(13,10)`, raw backdrop `0x83`; the dispatch at `0x82F4` reaches the slain
Fire Knife checkpoint and a Knight of Myth Drannor. With `[0x4C2B]&2` clear, continuing and choosing
`PRINCESS NACACIA` at the three-way allegiance menu enters `0x86F4`. The Knight warns the party not
to kill the hammer-bearing cleric who is also trying to rescue her, then executes
`ADD #2,[0x4C2B]` at `0x877A` and `SAVE #1,[0x4C28]` at `0x8783`. This branch has no combat and
requires no synthetic quest-state seed.

**Consumer and discriminator.** `ECL6#64`'s camp-interruption path reaches its Knights encounter;
PARLAY leads to the reader at `0x854F`. With the producer word set, the script says that reports
from Tilverton describe how the party "helped a brother," promises a temple diversion, then writes
`SAVE #1,[0x4CBC]` at `0x85D5`. The real-byte golden in
`packages/engine/test/coabQuest.test.ts` drives the natural GEO2#3 producer cell and its exact
`PRINCESS NACACIA` choice, carries the same Area1 memory into the separate ECL6 archive, and proves
the reader text plus the new diversion word. Its negative control enters the identical reader with
`[0x4C28]=0`, chooses the haughty response, receives "YOU ARE OFFENSIVE. WE LEAVE YOU TO YOUR
FATE," and leaves `[0x4CBC]` clear. This is the same engine-proven cross-block/cross-archive standard
used for Secret's and CoK's quest legs; browser wiring of the much wider Tilverton-to-temple journey
is not required for matrix status and remains explicitly deferred.

**Campaign promotion.** All six CoAB legs are now passing, so the campaign matrix promotes CoAB
from `persistent` to `campaign`. This does not claim a Verified selected-folder release contract,
original DOS save write-back, exhaustive campaign coverage, or a continuous browser walk between
these two distant encounters.

### Superseded bounded audit of the four proven-route words

CoAB was originally scoped with five campaign legs, so its sixth matrix cell was marked
`not-tracked`, rather than silently treated as satisfied. The 2026-07-28 audit makes that absence
explicit and repeatable. `tools/map_gen1_cross_area_flag_reads.py --profile
curse-of-the-azure-bonds` now scans every decoded instruction reachable from every header entry in
all six retail `ECLn.DAX` archives. Its registry contains the real state written by each proven
route: early `0x4CF4` (ECL4#37), middle `0x4CFF` (ECL2#4), and the two-stage ending flags
`0x4CBE`/`0x4CBF` (ECL6#64). The cross-archive persistence demonstration's `0x4C20` is included
only as a labelled synthetic probe, never misrepresented as a retail quest setter.

The generated audit is `docs/engine/research/coab-cross-area-flag-reads.md`. Its result remains
negative for a quest dependency **through those four words**:

- `0x4CF4`, `0x4CBE`, and `0x4CBF` occur only in their own source blocks.
- The only cross-archive references to the genuine middle flag `0x4CFF` are six **writes** in
  ECL3#18, ECL4#34, and ECL5#51. There is no read, comparison, or branch gated by ECL2#4's
  consumed outcome, so they cannot prove a persistent quest consequence.
- The four cross-archive `0x4C20` references are likewise writes in ECL2#1. Since no retail route
  sets that word, they are unrelated to the intentionally seeded persistence probe.

This was never a claim that CoAB has no quest content: it is a bounded, source-backed negative for
dependencies through the four route-state words. The Tilverton `[0x4C28]` dependency above is the
different byte-grounded mechanism that audit explicitly required, so this older blocked verdict is
superseded without weakening or rewriting its negative evidence.
