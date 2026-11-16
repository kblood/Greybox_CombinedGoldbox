# Gateway canonical-route combat/resume memo

> **Archived advisory memo.** Retained as the independent Sol planning pass, but superseded by the
> native trace. Its proposed curated start and `(9,7,N)` resume were wrong: the genuine captured
> arrival is `(15,2,W)`, and retail temporarily turns south, calls `movePositionForward`, then
> restores north at `(9,9,N)`. The final implementation follows those bytes and pixels.

## Recommendation

Implement a new `?explore=gateway-natural` route around retail `ECL5.DAX#19` and `GEO5.DAX#19`. Enter combat through the real GEO cell’s `SearchLocation` dispatch, not by jumping to virtual address `0x8C07`.

The smallest source-faithful scope is:

1. Mount Sundabar’s real ECL/GEO block.
2. Start one legal step from its unique descriptor-18 encounter cell.
3. Let normal explorer movement trigger `FIGHT / LEAVE`.
4. Resume after combat and honor the script’s `movePositionForward` host call.
5. Save and reload the resulting post-encounter position.

Do not attempt full ECL2→ECL6 wilderness travel in this leaf; that adds dynamic multi-GEO wilderness loading and an unresolved `CALL 0x080C` yes/no host prompt.

## Established facts

- The active goal is explicitly “Gateway canonical-route combat/resume promotion”: original DOS and browser must agree on encounter, choice, roster, tactical outcome, ECL resume, and persisted consumption, without a synthetic-start claim. See [`docs/engine/research/next-cycle-triage-2026-07-28.md:30`](next-cycle-triage-2026-07-28.md#L30).

- The canonical campaign chain is real:

  - `build/gateway-ecldump-20260729/ECL2_001.txt:177` (this local generated build artifact is not bundled). sets `game_area=6`; line 178 executes `NEWECL 21`.
  - `build/gateway-ecldump6-20260729/ECL6_021.txt:267` (this local generated build artifact is not bundled). asks `ENTER SUNDABAR?`; lines 272–273 set `game_area=5` and execute `NEWECL 19`.
  - That Sundabar gate requires area/block `24`, position `(0,4)`, facing west, as shown at ECL virtual addresses `0x87E3..0x8801`.

- The selected ECL5 branch is byte-pinned: `FIGHT / LEAVE`, choice zero, MON5CHA id 4 ×3, `COMBAT 0x8C34`. See [`docs/engine/research/gateway-ecl5-19-runtime-route.md:29`](gateway-ecl5-19-runtime-route.md#L29).

- The current engine golden starts directly at the menu, not at `SearchLocation`. It therefore proves only the local branch and a default-memory exit. See [`packages/engine/test/dungeonEvents.test.ts:3282`](../../../packages/engine/test/dungeonEvents.test.ts#L3282).

- The browser route has the same limitation. [`apps/web/src/ui/explore.ts:3681`](../../../apps/web/src/ui/explore.ts#L3681) explicitly calls it “dialogue-only” and constructs `EclVm` at `0x8C07`; its E2E similarly asserts only menu, roster, tactical UI, and end. See [`apps/web/test/e2e.mjs:2478`](../../../apps/web/test/e2e.mjs#L2478).

- Retail GEO5#19 contains one descriptor-18 cell, `(9,8)`. Its north edge is open, leading to descriptor-zero cell `(9,7)`. This was verified read-only with [`tools/find_geo_path.py`](../../../tools/find_geo_path.py) against the local retail `GEO5.DAX`.

- After combat, ECL5#19 goes to `0x8277`, which invokes operand `0xC01E`. The engine already identifies this as `movePositionForward` via `routineId=0x401F` in [`packages/engine/src/ecl/vm.ts:513`](../../../packages/engine/src/ecl/vm.ts#L513).

- The selected encounter path contains no persistent “consumed bit” write. Its source mechanism is the host-driven forward movement away from the trigger cell.

## Main implementation gap

`EclVm` currently emits a typed `call` effect but continues executing immediately; see [`packages/engine/src/ecl/vm.ts:1194`](../../../packages/engine/src/ecl/vm.ts#L1194). `DialogueRunner` then discards non-text/non-picture call effects when translating the result.

Consequently, a genuine `dialogueForCell(..., descriptor=18)` run cannot let the browser update position and `C04B/C04C/C04F` before the script searches the new cell. The direct menu test avoids this problem only because its descriptor memory defaults to zero.

## Actionable minimal changes

- `packages/engine/src/ecl/vm.ts`

  Add a synchronous host-call hook—or an explicit host-call pause/resume—for state-changing calls. For `movePositionForward`, the host must update position, facing registers, and the destination cell descriptor before VM execution continues. Retain the typed effect for auditability.

- `packages/engine/src/world/dialogue.ts`

  Preserve host-call information instead of dropping it. A generic call hook is preferable to a Gateway-specific post-combat special case.

- `apps/web/src/ui/explore.ts`

  Generalize the existing DoK pose/register synchronization around [`runStepEvent()`](../../../apps/web/src/ui/explore.ts#L642) to Gateway. Resolve `movePositionForward` through the live `Explorer` and destination `GameMap` cell.

- `apps/web/src/ui/gameData.ts`

  Add `gateway-natural` using `ECL5/GEO5/WALLDEF5/8X8D5/MON5CHA/ITEM5`, block 19, `gen1-short-gateway`, and source-derived start pose `(9,9,north)`. Keep the existing `gateway` ECL2#2 smoke route and `?gateway-fight=1` diagnostic.

- `apps/web/src/ui/main.ts`, `apps/web/src/ui/docs.ts`, `apps/web/src/ui/support.ts`

  Register and accurately label the new route. Describe `(9,9)` as a curated legal predecessor to the retail trigger—not as native startup or a completed wilderness journey. Disk-5 assets are already registered in [`apps/web/src/ui/gen1Disks.ts:318`](../../../apps/web/src/ui/gen1Disks.ts#L318).

- Existing quick-save already serializes pose and area memory in [`apps/web/src/ui/explore.ts:1626`](../../../apps/web/src/ui/explore.ts#L1626). Save after the scripted move to `(9,7)`; reload must not reset the party onto `(9,8)` or immediately replay the encounter.

## Focused tests

1. Extend [`packages/engine/test/dungeonEvents.test.ts`](../../../packages/engine/test/dungeonEvents.test.ts):

   - Decode GEO5#19 and assert the unique descriptor-18 cell is `(9,8)`.
   - Use `dialogueForCell`, not a raw `EclVm` menu entry.
   - Assert `FIGHT / LEAVE`, id 4 ×3, `COMBAT 0x8C34`.
   - Assert victory emits/applies exactly one `movePositionForward`.
   - Assert destination `(9,7)` has descriptor zero and the runner exits cleanly.

2. Add `gateway-natural-combat-persistence` to [`apps/web/test/e2e.mjs`](../../../apps/web/test/e2e.mjs):

   - Load `?explore=gateway-natural`.
   - Step `(9,9)→(9,8)`.
   - Select FIGHT, verify three decoded enemies, win, and dismiss.
   - Assert pose becomes `(9,7)` and no dialogue/combat remains.
   - Encamp/save, reload the page with `load=1`, and assert disk 5/block 19 plus pose `(9,7)` are restored without encounter replay.

3. Keep `gateway-ecl5-fight` as a byte-local regression, but remove it from any claim of campaign triggering or saved consumption.

## Native-capture pitfalls

- The cold-load evidence does prove a real campaign and a visual save/reload at `(6,12) E`; compare `build/gateway-campaign-coldload-20260729-c/world-06-save-slot.png` (this local generated build artifact is not bundled). with `build/gateway-campaign-coldload-20260729-c/world-reload-10-resumed.png` (this local generated build artifact is not bundled)..

- It does not reach Sundabar or ECL5#19. The final encounter is `ATTACK / FLEE` against random giant lizards, followed by failed flight and party destruction: `build/gateway-campaign-coldload-20260729-c/route3-sundabar-12.png` (this local generated build artifact is not bundled)., `build/gateway-campaign-coldload-20260729-c/route3-sundabar-16-combat.png` (this local generated build artifact is not bundled).. That is materially different from ECL5’s `FIGHT / LEAVE`, id 4 ×3 contract.

- `build/gateway-campaign-coldload-20260729-c/dos-files.log` is zero bytes. Thus filenames such as `block23`/`block24` are human annotations, not mechanical proof of loaded GEO/ECL members.

- Wilderness coordinates are local to the currently loaded GEO sector; treating them as one global 16×16 coordinate plane caused repeated overshoot and sector confusion.

- Random encounters consume time and party resources, FLEE can fail, and the final run destroyed the only live party. A better capture should save at the last verified sector boundary, reload after unrelated random fights, verify FILES logging is nonempty immediately, and record ordered checkpoints for `ECL5.DAX` open, `FIGHT / LEAVE`, board, victory, scripted forward movement, save, process termination, and cold reload.

## Inference boundary

The strongest source-backed interpretation is that the scripted forward move—not an ECL flag—is ECL5#19’s consumed state. Implement and persist that pose. Do not invent a one-shot memory bit or promise that manually walking back onto `(9,8)` will remain silent unless an original-DOS revisit proves that behavior.
