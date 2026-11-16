# Pools of Darkness — `eclInitBlock` bootability sweep (found)

> **Dialect correction (2026-07-29):** block 18 remains the selected walkable boot block, but the
> plain `ECL_GEN1_SHORT` assignment below is superseded by `ECL_GEN1_SHORT_POOLS`. Retail
> `GAME.OVR` proves Pools-specific frames for opcodes `0x1f`, `0x21`, and `0x37`; see
> [`pools-ecl69-72-natural-route-2026-07-29.md`](pools-ecl69-72-natural-route-2026-07-29.md).

Follow-up to `docs/engine/research/treasures-pools-darkness-scoping.md` §3.4, which
identified this as the one missing piece for a real, walkable `GameData` entry for Pools
of Darkness (`apps/web/src/ui/gameData.ts`), and pointed at that file's own `treasures`
entry (around line 960) as the precedent method to reuse.

**Result: `eclInitBlock: 18` (`ECL1.DAX` block 18), dialect `'gen1-short'` (plain
`ECL_GEN1_SHORT`, NOT the Treasures-only `gen1-short-treasures` split), with an explicit
`eclFallbackPieces: [1, 0xff, 0xff]`** — corroborated by real narration text, a map shape
that matches the narration, and a clean single-pass `EclVm` run to a genuine `EXIT`. A
second, weaker candidate (block 16) is documented in §4 for completeness; it is NOT
recommended as the primary pick.

All work below is pure research: one-off `.mts` scripts run via `npx tsx` against the real
engine library (`packages/engine/src/index.ts`), executed from the repo root and deleted
after use (`_scratch_pod_sweep.mts`, `_scratch_pod_detail.mts`, `_scratch_pod_geo18.mts` —
none committed). No file under `apps/web/src/**` or `packages/engine/src/**` was modified.
Source install: `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\` (real GOG
install on the user's machine, not vendored, same convention as every other non-CoK/DoK/DQK
title this project already uses).

---

## 1. Method (reproducing Treasures' own sweep)

`gameData.ts`'s `treasures` entry (comment above `eclPath`, ~line 960) describes the method
this session replicated:

1. Enumerate every id that has BOTH a real GEO map and a real ECL script — the engine's own
   `listPairedGen1Areas(geoBytes, eclBytes)` helper (`packages/engine/src/loaders/gen1AreaIndex.ts`,
   exported from `index.ts`), the same criterion `buildDqkGame.ts`'s content-port pipeline
   uses. This is "decodes", not "boots".
2. For each paired id, run that id's `ECL1.DAX` block through the real `EclVm` under the
   dialect `disassemble.ts`'s own doc comments assign this title (`ECL_GEN1_SHORT` — Pools
   of Darkness is grouped with DoK/Gateway, explicitly NOT with Treasures' own further split,
   see `disassemble.ts` lines 101-123: *"DoK/Gateway/Pools of Darkness's own corpora are
   independently proven to boot correctly under the plain 3-operand frame"*).
3. Attempt the real production path, `loadDungeon(initEcl, sources, opts)`
   (`packages/engine/src/world/dungeon.ts`) — the exact function `explore.ts` calls on every
   other title's dungeon entry. It throws unless the single, un-resumed `vm.run()` emits a
   `loadFiles` effect AND either a `loadPieces` effect or a supplied `fallbackPieces`
   default. This is the load-bearing "does it actually boot" gate, not just "does it decode".
4. Separately, resume through any `awaiting-input`/menu pauses (auto-answer `0`, the same
   convention `EclVm.step()` and every prior Gen1 demo verification in this project already
   use) until the block reaches a terminal `EclStatus` — keep only blocks whose real `EclVm`
   run reaches `'exited'` (a genuine `EXIT` opcode), not `'halted'` (bad opcode / crash) or
   stuck forever in `'awaiting-input'`.
5. Among the ids that pass both gates, corroborate with real content (narration text,
   sane GEO geometry) the same way this project's own demo-entry verifications do, rather
   than mechanically trusting "lowest id" blind — see §3's discussion of why this session
   diverged from a pure lowest-id pick.

`tileBlock: () => null` was used for every `DungeonSources` (art-free geometry-only probe —
the same convention `apps/web/src/ui/automapPanel.ts` already uses; `loadDungeonWalls`
tolerates a null tile block, it only throws on a genuinely missing WALLDEF block).

## 2. Sweep results

32 paired GEO+ECL ids in `ECL1.DAX`/`GEO1.DAX`: `1, 16, 17, 18, 19, 20, 21, 22, 32, 33, 34,
35, 36, 37, 39, 48, 49, 50, 52, 53, 64, 65, 66, 67, 68, 69, 70, 71, 81, 82, 83, 84`.

| Outcome | ids |
| --- | --- |
| `loadDungeon` throws (`no LOAD_FILES` in the un-resumed first `run()`) | 1, 17, 49, 71, 84 |
| Real `EclVm` run **halts** on a bad opcode a few bytes past `LOAD_FILES` | 20, 21, 33, 34, 37, 52, 53, 64, 68, 81, 83 (`haltReason` in every case: `"bad opcode at <49-115>"`) |
| Real `EclVm` run never terminates within 100 auto-answered resume hops | 22 |
| Chains to another block (`NEWECL`-style, not a terminal `EXIT`) | 32 |
| **Reaches a real `'exited'` status AND `loadDungeon` succeeds** | **16, 18, 19, 35, 36, 39, 48, 50, 65, 66, 67, 69, 70, 82** |

The 11 "halted" ids are a genuinely distinct, structurally-different family from the 14
"exited" ids — not corroboration noise. This mirrors this project's own precedent for
Treasures (which also split its paired-id sweep into a clean-EXIT group and a halt group)
and is independent evidence the dialect choice itself (`ECL_GEN1_SHORT`, unmodified) is
correct: `LOAD_FILES` decodes to the right self-referencing GEO id in every single case
(e.g. block 18's `LOAD_FILES` loads GEO block 18), so the halts are a real per-area content
boundary, not a systematic operand-frame desync (which would show up as `LOAD_FILES` itself
pointing at nonsense ids).

No block in the entire 32-id corpus ever emits a `loadPieces` effect — exactly the same
situation Treasures' own `ECL1.DAX` has (`disassemble.ts` lines 113-118: *"even under this
fix, no block in ECL1.DAX ever emits a loadPieces effect... the web host's loadDungeon call
for this profile supplies an explicit fallbackPieces default"*). Pools of Darkness ships its
own `WILDCOM.DAX`/`DUNGCOM.DAX` wall-set archives alongside `WALLDEF1.DAX`, consistent with
the same "host loads one wall/tile set once outside the ECL VM" convention. This session
supplies the identical fallback Treasures uses: `eclFallbackPieces: [1, 0xff, 0xff]`
(WALLDEF1 block 1, the only non-degenerate wall set on this disk — not independently
verified beyond "it's present and non-empty"; if a future pass finds evidence of a different
intended default, this is the value to revisit).

## 3. Choosing among the 14 clean-`EXIT` candidates: content beats "lowest id"

Treasures' own sweep (§ of `treasures-pools-darkness-scoping.md`, `gameData.ts` comment)
picked the **lowest** id among its clean-`EXIT` group with no additional reasoning recorded.
Applying that same rule mechanically here would pick **id 16** (the lowest of the 14). This
session went one step further and inspected the actual decoded content of the two lowest
candidates (16 and 18) before committing, because block 16's shape raised real doubts that
block 18 resolves cleanly — recorded here so a future pass can re-derive the same judgment
call rather than re-litigate it blind.

### 3.1 Block 18 — the recommended `eclInitBlock`

Real `EclVm` run (`ECL_GEN1_SHORT`, single `run()` call, **zero resume hops needed** — it
reaches `exited` in one pass, no mid-script pause at all):

```
picture #133
loadFiles → geoBlockId 18 (self-referencing, operands [18, 1, 0])
[unhandled: GOTO(nonlocal) — a cross-block subroutine jump this standalone-block VM can't
 follow; the SAME documented graceful-degrade every other title's blocks already use, not
 a Pools-specific bug — see vm.ts's GOTO/GOSUB "nonlocal" handling]
print: "YOU STEP FROM THE POOL ONTO SOLID GROUND. WHILE YOU WERE GONE, ELMINSTER HAS
        CREATED A SMALL ISLAND OF MATTER IN LIMBO."
partyStrength ×4 (interleaved with the narration beats below)
print: "AS YOU WATCH, HE GESTURES AT A PASSING BOULDER. IT STOPS, PIVOTS, AND THEN
        SETTLES TO THE GROUND. ELMINSTER SENSES YOUR PRESENCE AND TURNS."
picture #131
print: "'WHILE YE WERE GONE, I WAS BUSY, AS YE CAN SEE. AND I FOUND OUT SOME THINGS THAT
        YE SHOULD KNOW.' HE TELLS YOU."
scriptEffect (UNKNOWN_1F, operands [3, 0] — uncharacterized, inert for bootability)
picture #0
print: "'HERE IS SOME MAGIC THAT I HAVE SAVED FOR SUCH AN OCCASION AS THIS. BUT REMEMBER!
        DO NOT TAKE THESE TO THE OUTER DIMENSIONS, LEST THEY BE DESTROYED!'"
treasure: {gold:5, platinum:153, gems:146, jewelry:146, itemBlockId:233, ...}
→ exited
```

This is unmistakably real Pools of Darkness plot content, not a plausible-looking
placeholder: **"you step from the pool onto solid ground... Elminster has created a small
island of matter in limbo"** is a direct, specific match to this game's own title and
premise (Elminster is a recurring Forgotten Realms mentor NPC; the game is literally titled
*Pools of Darkness*). This reads as the party's arrival at a safe hub after whatever
teleportation/plane-crossing event opens the game, matching the narrative shape (arrival →
mentor exposition → a magic-item gift) every other shipped Gen1 `eclInitBlock` in this
project also has (CoK 34, DoK 34, Gateway 82, Secret 97 all open on an arrival/mentor/
narration beat, not a bare unlabeled room).

**The map geometry corroborates the narration, independently.** `GEO1.DAX` block 18 decodes
to a **16×16 grid with zero walls anywhere (all 256 cells have every edge open) and zero
doors** — i.e. one large, featureless, open room. That is exactly what a "small island of
matter conjured in limbo" should look like: no walls, no rooms, no doors, just open floor
(a single uniform floor-tile id, `128`, across the whole map — not a degenerate/blank GEO
block: 258 of the block's 1026 raw bytes are non-zero, real intentional map data, just
simple by design). This cross-check (ECL narration text vs. independently-decoded GEO
geometry, decoded by two different code paths, agreeing) is the strongest evidence this
session found for any candidate.

`loadDungeon` succeeds cleanly with the fallback pieces (`setBlockIds: [1, 255, 255]`), map
`16×16`, `introText` non-empty (the narration above), zero VM errors.

**Caveat, honestly noted:** `map.entries` is empty (no `MapEntry`/start-square markers
decoded from this GEO block, same as every other Pools of Darkness area probed this
session — see §5). A `GameData` profile for this title will need its own start
position/facing the way other profiles get one (`chooseStart`-style, out of band), not from
`GameMap.entries`. This is a pre-existing project-wide gap for this title, not new evidence
against block 18 specifically — every candidate in the 14-id clean-`EXIT` set shares it.

### 3.2 Block 16 — the mechanically-"lowest id" candidate (documented, not recommended)

```
loadFiles → geoBlockId 16 (self-referencing, operands [16, 1, 0])
input (mode 'string', destAddr 22, INPUT_STRING opcode)      ← auto-answered with 0
[unhandled: GOSUB(nonlocal)]
clearBox
call (routineId 32770, operand 1)
encounterSetup (spriteId 27, picId 255, distance 0)           ← staged, never triggered
→ exited (after 1 resume hop)
```

Two things make this a weaker candidate than block 18:

1. **It genuinely needs an interactive pause answered before it reaches `LOAD_FILES`'s own
   downstream `EXIT`** — no, more precisely: `LOAD_FILES` itself DOES appear in the very
   first `run()` (which is why `loadDungeon` succeeds without a resume loop, matching what
   production code actually calls), but the block then pauses on `INPUT_STRING` — an
   opcode that expects a genuine typed string, not a menu choice — before it can reach
   `EXIT`. Auto-answering it with the generic "menu default 0" convention this project uses
   for `PARLAY`/menu pauses is semantically odd for a *string* input; it happens to still
   reach `exited`, but the fit is worse than block 18's clean, pause-free single pass.
2. **Zero narration.** No `print` effect anywhere in the trace — nothing to corroborate
   against, unlike block 18's specific, plot-matching text.

Its GEO map (16×16, 254/256 cells with an open edge, 49 doors) is a normal, non-degenerate
dungeon layout — not evidence against it, just not the additional corroboration block 18
gets from its geometry-matches-narration coincidence.

**Verdict: block 16 passes the same mechanical gate block 18 does, but block 18 has
independent corroborating evidence (real, specific narration; matching map geometry;
zero-pause single-run boot) that block 16 lacks.** Recording both honestly rather than
picking 16 by rote "lowest id" and leaving the stronger candidate undocumented.

## 4. Other clean-`EXIT` ids, briefly

`19, 35, 36, 39, 48, 50, 65, 66, 67, 69, 70, 82` all pass the mechanical `loadDungeon`+
`exited` gate too. Spot-checked ids 19/35/36 disassemble/run to bare `loadFiles` → `exited`
with **no narration and no other effects** — plausible ordinary sub-area entrances (the kind
of area a party reaches mid-dungeon, not the game's own opening), consistent in shape with
CoK/DoK's own plain "just a room" areas. Not investigated further since block 18 already
satisfies the task (a proven, corroborated, non-degenerate candidate) and none of these
showed richer evidence than 18 in the initial pass. Id 82's `LOAD_FILES` targets GEO block
**84**, not 82 (a non-self-referencing area, same as some other titles' documented
`newgame_block` vs. `eclInitBlock` distinctions) — noted for completeness, not chased.

## 5. Open questions / unknowns

- **No `GameMap.entries` (start squares) decoded for ANY probed Pools of Darkness area**,
  including block 18. A real `GameData` profile needs a start x/y/facing from some other
  source (hand-located via a DOSBox-X trace, or a `chooseStart`-style convention borrowed
  from another title) — **UNKNOWN**, not solved this session.
- **The `eclFallbackPieces: [1, 0xff, 0xff]` default is unverified beyond "block 1 exists
  and is non-degenerate on `WALLDEF1.DAX`"** — whether it's the actual retail default wall
  set for area 18 specifically is **UNKNOWN** (same honesty level Treasures' own identical
  fallback already carries).
- **The `UNKNOWN_1F`/`scriptEffect` opcode (0x1F) in block 18's trace is uncharacterized**
  — inert for bootability (doesn't block reaching `EXIT`), but its real semantics are
  **UNKNOWN**, a pre-existing project-wide gap (`disassemble.ts` already flags Gen1 `0x1F`
  as `uncertain`).
- **Whether block 18 is really the game's literal opening scene, vs. a later checkpoint
  reached after some earlier "how did the party get to limbo" sequence, is inferred, not
  proven** — **(inferred)** from the narration content and lack of any lower-numbered
  candidate with comparable richness; no DOSBox-X trace of the real retail boot sequence
  was run this session to confirm block 18 is literally the first block the real `GAME.EXE`
  chains to.
- The `PICTURE` ids block 18 references (`133`, `131`, `0`) were not resolved to real image
  data this session (same open per-title picture-format gaps as every other Gen1 title's
  demo scripts — `CPIC1.DAX`/`BIGPIC1.DAX`/`PIC1.DAX` format status is unchanged, see
  `treasures-pools-darkness-scoping.md` §4.3).

## Implications for our engine

- A `GameData`/`GameId` entry for Pools of Darkness (e.g. `'pools-of-darkness'`) is now
  unblocked on the one piece `treasures-pools-darkness-scoping.md` flagged as missing:
  `eclInitBlock: 18`, `eclDialect: 'gen1-short'`, `eclFallbackPieces: [1, 0xff, 0xff]`,
  mirroring the `treasures` entry's own shape (this file's task explicitly says NOT to add
  that entry — pure research, no production-code changes were made).
- This session's divergence from a pure "lowest paired id" rule is worth generalizing: the
  mechanical bootability gate (`loadDungeon` succeeds + real `EclVm` reaches `'exited'`) is
  necessary but not sufficient to identify the *intended* opening block among several
  candidates that all pass it. A follow-up sweep tool could bake in the same two extra
  signals used here (non-empty narration; GEO geometry that isn't a trivially bare/empty
  grid) as a ranking heuristic, rather than leaving every future sweep to re-derive this by
  hand.
- The "no `loadPieces` ever, needs `eclFallbackPieces`" finding for Treasures generalizes to
  a second, independent 1991+-era title (Pools of Darkness) — worth treating as an expected
  property of this game generation/dialect family rather than a Treasures-specific
  peculiarity if a third such title is investigated later.
