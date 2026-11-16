> **Archived advisory memo.** Retained to show the independent Opus reasoning, but superseded by
> the later native capture. The genuine incoming branch is `(15,2,W)`, not `(0,10,E)`; retail
> resume is `(9,9,N)`, and implementing it required synchronous host-CALL handling plus DIV's
> remainder alias. Treat the statements below as hypotheses, not final evidence.

Memo written to `{local-user-profile}\.claude\plans\you-are-a-read-only-virtual-lampson.md`. Key findings:

## The decisive discovery

**`?gateway-fight=1` (`apps/web/src/ui/explore.ts:3689`) cannot close the open P3.3 checkpoints even in principle** — it injects a `DialogueRunner` at vaddr `0x8C07` with no GEO map, no walk, and no persistent memory. More importantly, **descriptor 18 (the FIGHT/LEAVE branch) has no consumed flag at all**: its post-combat `GOTO 0x8277` only redraws (`0x826E CALL; EXIT`), so it re-arms on every revisit.

**But ECL5#19 is a full 16×16 town map (Sundabar), and descriptor 122 is exactly the missing piece.** Re-derived from retail bytes this session:

```
; GEO5#19 cell (6,14)
0x95D1 COMPARE [0x4C6C],1 / IF_EQ / EXIT   ; already consumed -> nothing
0x95D9 SAVE #1 -> [0x4C6C]                 ; marks itself consumed
0x95DF PRINTCLEAR "THE CEILING OF THIS OLD BUILDING HAS COLLAPSED..."
0x967F LOAD_MONSTER 42,3,42                ; GRIFFON x3
0x9686 COMBAT -> GOTO 0x826E               ; in-place resume
```

And the start pose is **byte-derived, not heuristic**: `ECL5#19`'s `initial_entry` at `0x8071` branches on `LastEclBlockId==21` (the `ECL6#21 ENTER SUNDABAR?` `NEWECL`) and writes `facing=east, y=10, x=0` — the west city gate. BFS over the real wall graph: **(0,10)E → 11 steps → (9,8) descriptor 18 → 9 steps → (6,14) descriptor 122**, crossing only print-only or cold-inert cells. `chooseStart` lands in a dead 32-cell component, so `startPose` is required — same as `treasures-natural`.

## Smallest implementation

Three small edits, **no engine changes** (Gateway uses the standard `[0xC04F]` `cellDescAddr`): one new `'gateway-natural'` `GameData` entry with `eclInitialMemory: [[0x4bf2, 21]]` + `startPose {0,10,east}`, one ternary arm in `main.ts:1515`, one `docs.ts` row. `explore.ts` already passes `state.areaMemory` **by reference** to `dialogueForCell`, and `quickLoad()` sets `lastCell = -1` to re-fire the step event — which is precisely the consumed-state assertion vehicle.

## Two things worth flagging

**`build/gateway-campaign-coldload-20260729-c` is a major undocumented win.** It reached real native campaign gameplay — 7-member party, native tactical combat, KREVISH recruited, exited Yartar, two wilderness submaps with a live `ATTACK/FLEE` goblin encounter. Critically, it **bypassed the disk-3 `LOAD GAME` gate** by using the character-sidecar + `BEGIN ADVENTURING` path. Nothing in `docs/` records any of this. Its `dos-files.log` stops at 432 lines (boot only), so there is no file-I/O corroboration of the gameplay.

**Live wilderness wiring is a bigger slice than it looks** — `ECL6#21` loads its GEO from a dynamic `word_248` (six swapping submaps), fires random encounters on a 3-step cooldown with a ~65% flee, blocks terrain silently, and gates Sundabar twice. Recommend encoding the crossing as arrival state rather than chaining it.
