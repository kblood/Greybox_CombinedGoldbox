# CoK Throtl presentation paths — what the other four arrivals into ECL1#17 actually emit

Round 35, task R5. 2026-09-05.

**Headline.** The plan's null — that the unfixed paths into `openCokThrotlArrival` emit no picture,
so "fixing" them would only add a forwarding argument that changes nothing — is **falsified, 4 of 4**.
Every arrival path emits a PICTURE effect on its **first** VM turn, and the id is **not** the caravan
route's 58: arm 11 arrives on 58, arm 3 on **57** (after 58 in the same effect batch). Two shipped
e2e cases were observed RED on HEAD with `pictureId: null, native: false`, then green after a
structural fix, then RED again on revert. Secondarily, DoK's overland host hides nothing (0 of 570
per-cell dispatches), but **Pool's regional host does**: five real, disk-resolvable picture ids at
five coordinates, dropped because `openPoolTravel` opens its dialogues with no presentation at all.

---

## 1. Method

All byte reads go through `packages/engine`'s `readDaxDataBlocks` + `EclVm` (no hand-rolled DAX
reader). Each path is run **under the memory that path actually arrives with**, reconstructed by
replaying its own predecessor in the engine:

- `arriveViaTravelArm(block16, arm, seeds)` mirrors `chooseCokTravelCoordinate` (explore.ts:2709) —
  `dialogueForCell(block16, 0, {seedMemory: {0x4bc3: x, 0x4bc4: y}})` with the retail coordinate from
  ECL1#16's own GETTABLE bases `0x8e72`/`0x8e7e`, answering the YES/NO confirmation with YES. The
  memory it leaves behind *is* the arrival memory.
- `throtlTurns(block17, memory)` mirrors `openCokThrotlArrival` (explore.ts:2807) — a cold
  `EclVm(block17, {dialect: ECL_GEN1})` wrapped in `NarrativeDialogueMachine` + `DialogueRunner`,
  with the runner's `onEffects` hook recording every `{type:'picture'}` per turn.

Pinned in `packages/engine/test/cokThrotlPaths.test.ts` (9 tests). The fixture assertion
(`expect(block16).not.toBeNull()`) precedes every guard return, and the file was mutation-tested
(§6) before any of its numbers were used.

## 2. Stage-1 table — CoK ECL1#17 per arrival path

| Path (host site) | Arrival memory | Chain into 17 | Turn-0 batch | Turn-0 register | Later pictures | Terminal within 16 turns |
| --- | --- | --- | --- | --- | --- | --- |
| arm-11 fallback — `chooseCokTravelCoordinate` immediate chain / `onChain` (explore.ts:2725, 2732), driven by `__cokTravel.choose(11)` | `[4C26]=2` (written by arm 11) | yes, 17 | `[58]` | **58** | 58 at each menu re-entry | `say` (destination menu loop) |
| arm-3 landmark — same two sites, `?explore=cok-natural-6` seeds `[4C5C]=0xFF, [4C28]=6, [4C29]=0x03` | `[4C26]=1` + those seeds | yes, 17 | `[58, 57]` | **57** | none for turns 1–8; **58** at turn 9 (destination menu) | `say` |
| post-caravan — `openCokTravel.move` `onClose` (explore.ts:3262), round 34's already-fixed seam | `[4C2D]=1`, pose reset to (1,3) | n/a (direct call) | `[58]` | 58 | **57** at turn 2 (Sir Karl), 58 at turn 14 | `say` |
| block-17 re-entry after its own LEAVE chain | `[4C26]=2` | via block 16 | `[58]` | 58 | 58 at each menu | `say` |

Counts: **4 of 4 paths emit ≥ 1 picture effect. 0 of 4 emit none.** That count *is* the plan's null,
and it discriminated in the opposite direction from the plan's expectation.

Supporting detail, all measured:

- Arm 11 coordinate is (15,11), arm 3 is (13,5) — matching what `explore-cok6-landmark-outpost`
  already asserts from the live table.
- Arm 11's first turn is the retail destination menu itself
  (`WHERE DO YOU WISH TO GO?`, `INN/HALL/COMMANDANT/ARMOURY/NEXT/LEAVE`). Arm 3's is the courier
  scene (`OUR COURIER TO OUR SOUTHERN OUTPOST HAS FAILED…`).
- The arm-3 run reproduces the e2e case's existing text expectations turn for turn: turn 3
  `AND NERAKA.`, turn 7 `86.`, turn 9 the six-item menu. No picture is emitted on turns 1–8, so the
  retail current-picture register still reads **57** at both Continue stops.
- **Block 17's own onward chain target is block 16** (menu index 5, LEAVE). Block 16's host
  `openCokTravel` has built its own `DialoguePresentation` since round 34, so the two
  `remountCampaignChain` sites *inside* `openCokThrotlArrival` (explore.ts:2777, 2790) are **not**
  a defect and forwarding an argument through them would change nothing. That is the one place the
  plan's null held.

### 2b. The branch is not keyed on one word

Setting `[0x4C26]=1` **alone** does *not* reproduce arm 3's courier scene — block 17 opens the
destination menu on 58 instead. The courier branch needs the `cok-natural-6` landmark seeds as well.
This is why each path had to be replayed under its own arrival memory rather than probed with a
synthetic one, and it is pinned as a control in the test file.

A second, incidental finding from the same control: **block 17 writes its own progress words back
into the shared campaign memory**, so re-running it over the same `Map` takes a different branch.
(Found by the control failing: arm 3's map returned 58 on its second drive.) The host runs block 17
once per arrival, so this is a test-hygiene fact, not a product bug — but any future probe that
reuses an arrival `Map` must copy it.

## 3. Stage 2 — the host defect, red then green then red

`mount()` (apps/web/src/ui/dialogue.ts:504) creates the `.gb-dlg-panel-native` surface **only** under
`if (opts.presentation)`, and `renderPresentation()` returns immediately without one — so
`currentPictureId` stays `null` forever on a path that mounts art-less.

Assertions added to the two existing cases in `apps/web/test/e2e.mjs` (`window.__dialogue.pictureId()`
plus `!!document.querySelector('.gb-dlg-panel-native canvas')`):

| Case | Stage | Expected (from §2, VM-derived) | HEAD | After fix | After revert |
| --- | --- | --- | --- | --- | --- |
| `cok-throtl-fallback` | Throtl Commandant arrival | `pictureId 58`, native canvas | **FAIL** `cok-throtl-picture: {"title":"Champions of Krynn · Throtl Commandant","kind":"say","text":"WHERE DO YOU WISH TO GO?","pictureId":null,"native":false}` | PASS | **FAIL** (same line) |
| `explore-cok6-landmark-outpost` | first landmark Continue | `pictureId 57`, native canvas | **FAIL** `cok6-landmark-first-picture: {"pictureId":null,"native":false}` | PASS | — |
| `explore-cok6-landmark-outpost` | Throtl destination menu | `pictureId 58`, native canvas | **FAIL** `cok6-landmark-menu-picture: {"pictureId":null,"native":false}` | PASS | — |

The live arm-11 arrival text in the browser (`WHERE DO YOU WISH TO GO?`) is the same branch the
engine measurement predicted for that arrival memory, so the browser and the VM agree on which
branch runs — only the picture was being dropped.

The 57/58 pair inside one case matters: a host that merely forwarded a single picture, or a test that
pinned one id everywhere, cannot satisfy both.

### The fix (structural, not four forwarded arguments)

`apps/web/src/ui/explore.ts` gains `cokThrotlPresentation()`, which builds ECL1#17's own presentation
from `BIGPIC1.DAX` + `PIC1.DAX` + `8X8D1.DAX` the way `openCokTravel` does, and
`openCokThrotlArrival` now uses `presentation ?? await cokThrotlPresentation()`. A caller that
already owns the art (the caravan route) keeps handing its own instance down, so round 34's exact
behaviour on `cok-retail-travel` is preserved; every other path stops depending on its caller.

Both emitted ids resolve in the shipped archive: `PIC1.DAX` block ids are
`[23, 57, 58, 34, 18, 59, 60, 1, 8, 12, 15, 30, 34, 35, 41, 61, 62, 63]` — 57 and 58 are both real
frames, not sentinels.

Deliberately **narrower** than `openCokTravel`'s presentation:

- no `combatReturnPictureId` — 121 is the overland map frame, not a Throtl backdrop;
- no `combatVictoryPerCharacterXp: 108` — that is the caravan encounter's own observed native
  golden and is not evidence for the ARMOURY arm (which does reach a `combat` turn under a bare
  arrival memory, so the omission is load-bearing, not cosmetic).

It returns `undefined` if an asset is missing, so a data-less environment still opens the
conversation text-only.

## 4. Secondary, stated-NOT-wired: DoK and Pool

No host change for either this round (the plan scopes R5 to CoK and forbids touching
`openDokTravel`/`openPoolTravel`). Both numbers come from the same instrument as §2.

**DoK ECL1#17 — nothing hidden.** Positive control on DoK's own bytes and dialect: the block's
initial entry emits exactly `[112]`, which is the very id `openDokTravel` hardcodes as
`DOK_TRAVEL_PICTURE_ID` and paints itself with `paintDokTravel`. The negative, over the retail 38×15
overland grid driven exactly as `openDokTravel.move` drives it: **0 pictures across 570 cells**. The
plan predicted 0 for DoK and it holds — and it holds against a probe demonstrated able to return
non-zero one line above.

**Pool ECL6#25 / ECL7#26 / ECL8#27 — five real frames are being dropped.** The plan left Pool
unpredicted. Measured:

| Probe (host site) | Result |
| --- | --- |
| sector initial entry (`initializeSector`, entries `0x15cf`/`0x1814`/`0x135a`) | 0 pictures, all three sectors |
| `openPoolTravel.move` → `dialogueForVmRun1`, 8 directions × 16×16 grid = 2048 probes/sector | **0 pictures**, all three sectors (6144 probes) |
| `openPoolTravel.presentLocation` → `dialogueForCell(block, 0)` at each of 256 coordinates | **5 non-sentinel ids**, one coordinate each |

The five, with the text they arrive with, each resolving in that sector's **own** disk archive:

| Sector | Coord | Picture | In archive | Scene text |
| --- | --- | --- | --- | --- |
| ECL6#25 | (10,9) | 32 | PIC6 has 32 | `AS YOU HIKE THROUGH THE MOUNTAINS, A LARGE DRAGON FLYS ABOVE` |
| ECL7#26 | (12,11) | 30 | PIC7 has 30 | `YOU HAVE STUMBLED UPON A LARGE NOMAD CAMP. WILL YOU ENTER IT` |
| ECL7#26 | (6,14) | 36 | PIC7 has 36 | `YOU ARE IN FRONT OF A MAGNIFICENT PYRAMID. YOU HAVE FOUND A` |
| ECL8#27 | (11,8) | 24 | PIC8 has 24 | `YOU FIND A RUINED CASTLE SURROUNDED BY QUICKSAND. AN OLD WOR` |
| ECL8#27 | (6,15) | 27 | PIC8 has 27 | `YOU SEE A SMALL GROUP OF KOBOLDS ENTERING A SMALL, CONCEALED` |

`0xFF` (255) appears at 240–244 of the 256 coordinates in every sector and resolves in **no** PIC
archive — it is the clear/no-picture sentinel and is filtered out of the count above.

Three independent reasons to believe these five are real rather than probe noise: each id exists in
the *matching* disk's PIC archive (a 5/5 coincidence otherwise); each arrives with a scene text that
names the thing the picture would show; and removing the coordinate seeds from the probe erases all
five (mutation 4, §6), so they are coordinate-dispatched, not a constant.

**What is NOT claimed:** that a player can stand on those five coordinates in a live campaign. The
probe seeds `[0x49C3]/[0x49C4]` directly; reachability through GEO5's collision map was not tested.
The honest scope is "the regional host would drop these frames if reached".

## 5. Predictions

**P12** — *"Of the four unfixed paths, at least 2 emit a block-17 picture; at least one of the two
existing e2e cases goes RED once a picture assertion is added; DoK ECL1#17's 15 dispatcher rows emit
0 picture effects."* → **HOLDS**, and more strongly than written: **4 of 4** paths emit (not 2), and
**both** e2e cases went RED (not one). DoK measured 0 across all 570 cells.

## 6. Mutation tests (every new pin was seen failing)

| # | Mutation | Expected | Observed |
| --- | --- | --- | --- |
| 1 | `Champions of Krynn/ECL1.DAX` → `ECL1.NOPE` in the test's own path constant | must FAIL, not skip or pass vacuously | **7 of 9 tests FAIL** (the DoK and Pool cases, on other fixtures, correctly stay green) |
| 2 | arm 11 → arm 1 in the arm-11 test | FAIL | FAIL: `expected 'YOU ARE NEAR THROTL . DO YOU ENTER?' to match /YOU ARE NEAR AN OUTPOST/i` |
| 3 | DoK per-cell probe replaced by the initial-entry runner (which does emit 112) | the 0-of-570 negative must FAIL | FAIL: `expected [ Array(570) ] to deeply equal []` — the collection code is live |
| 4 | Pool `presentLocation` coordinate seeds removed | the 5-id claim must FAIL | FAIL: `expected [ [], [], [] ] to deeply equal [ [ [ 32, 1 ] ], …(2) ]` |
| 5 | the explore.ts fix reverted, e2e assertions kept | `cok-throtl-fallback` RED | FAIL, identical line to the HEAD run |

The Pool case uses `it.skipIf` on the never-vendored GOG install, so an absent fixture reports SKIP
rather than a silent green.

## 7. Gates

- `pnpm --filter @goldbox/engine exec vitest run test/cokThrotlPaths.test.ts test/cokThrotlChain.test.ts` — **12 passed, 0 failed**.
- `pnpm --filter @goldbox/engine test` — 2 failed of 2934 (the 2932-pass run also carried this
  task's since-deleted scratch probes); both failures are in other agents' in-flight files
  (`secretSavedCharacter.test.ts` race-label table, `phaseBAmigaManifests.test.ts`
  `expected 1500 to be 1497`) and are untouched by this task.
- `pnpm --filter @goldbox/web exec tsc --noEmit` — clean. The workspace-wide `pnpm -r exec tsc
  --noEmit` currently stops in another agent's file (`packages/engine/src/loaders/glib.ts(850,44):
  error TS2304: Cannot find name 'buildCompositeImage'`).
- `pnpm --filter @goldbox/web e2e` — **full run, 181/187**. Every CoK case passes, including all four
  that reach block 17: `cok-retail-travel`, `cok-campaign-continuity`, `cok-throtl-fallback`,
  `explore-cok6-landmark-outpost`. Scoped runs were used only for the red/green/red iteration, never
  as the landing gate.
- The 6 full-run failures belong to other round-35 tasks in flight in this shared tree: DQK-Amiga
  frame census 1500 vs 1497 / FRAME 43 vs 40 (composites), the CoK+DoK SOUND.DAX "3700 events"
  dashboard rows (song framing), the Pools and Treasures pregen imports (race table), plus
  `asset-source-wiring` and `dqk-town-leave`. The last two were checked for attribution rather than
  assumed: both PASS scoped, **identically with and without this task's explore.ts change**, so they
  fail only in the full run's ordering and are not caused by it.
- `python -m pytest tools/test_docs_claims.py -q` — 25 passed (this memo is in scope of that gate).
  `tools/test_e2e_probe_audit.py` — 10 passed; `tools/test_goldbox_corpus.py` — 101 passed (the e2e
  case count is unchanged: assertions were added to existing cases, no new case).
