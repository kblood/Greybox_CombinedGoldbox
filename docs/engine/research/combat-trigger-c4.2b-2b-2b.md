# DQK (Gen2) In-World Combat Trigger — Research Findings (C4.2b-2b-2b)

**Assigned task:** Reverse the DQK ECL combat-trigger path — from the per-step main loop
(vmRun1) and SearchLocation down to the actual `LOAD_MONSTER` / `COMBAT` opcodes. Produce
grounded findings with a concrete worked example and engine wiring proposal.

**Sources:** `DISK3/ECL.GLB` (DQK), `packages/engine/src/ecl/opcodes.ts`,
`packages/engine/src/ecl/vm.ts`, `packages/engine/src/ecl/disassemble.ts`,
`apps/web/src/ui/dqkExplore.ts`, hackdocs `OPCODES.TXT`. All ECL bytes decoded live via
offline probes (now deleted). No engine source was modified.

---

## 1. The combat-launch opcodes

| Opcode | Mnemonic | Operands | Function |
|---|---|---|---|
| `0x0b` | `LOAD_MONSTER` | 3 EclOpp: `(monsterId, count, picBlockId)` | Appends one group to the VM's pending encounter roster |
| `0x24` | `COMBAT` | 0 | Pops the pending roster and fires combat; returns `status:'combat'` to the host |
| `0x1c` | `CLEARMONSTERS` | 0 | Empties the pending roster without fighting |
| `0x1d` | `PARTYSTRENGTH` | Gen1: 1 EclOpp; DQK Gen2 Palanthas route: 0 | **Not a roster-filler.** DQK Gen2 live traces prove this opcode can be zero-operand; treating the following bytes as an operand can misread a later `PRINTCLEAR` string length as `COMBAT` (corrected; see §4) |
| `0x23` | `SURPRISE` | 4 EclOpp | Initiates surprise-check before combat (not always present) |

Source: `packages/engine/src/ecl/opcodes.ts` entries 0x0b, 0x1c, 0x1d, 0x23, 0x24 plus the DQK Gen2
dialect overrides in `packages/engine/src/ecl/disassemble.ts`. The `vm.ts` COMBAT handler (case
0x24) pushes `{ type: 'combat', monsters: this.encounter }` and returns `status: 'combat'`.
Runtime evidence for the DQK `0x1d` correction is in
`docs/engine/research/dqk-palanthas-palace-combat-route.md` and
`docs/engine/research/dqk-ca03-runtime-probe.md`; the area-23 guard lives in
`packages/engine/test/dqkEvents.test.ts`.

EclOpp operand encoding: code `0x00` = 8-bit immediate `#N`; code `0x02` = 16-bit immediate
`#N`; codes `0x01`/`0x03` = memory address `[addr]` (u16 LE at bytes 1-2). Multiple
`LOAD_MONSTER` calls before a single `COMBAT` build a multi-group encounter.

---

## 2. The per-step dispatch: vmRun1

### Header format (Gen2, 20 bytes, no magic, vbase 0x8000)

```
offset 0x00: uint16 lo  \  vmRun1 far pointer
offset 0x02: uint16 hi  /
offset 0x04: uint16 lo  \  searchLocation far pointer
offset 0x06: uint16 hi  /
offset 0x08: uint16 lo  \  preCampCheck far pointer
offset 0x0a: uint16 hi  /
offset 0x0c: uint16 lo  \  campInterrupted far pointer
offset 0x0e: uint16 hi  /
offset 0x10: uint16 lo  \  eclInitialEntry far pointer
offset 0x12: uint16 hi  /
```

Effective offset of a slot = stored vaddr − 0x8000.

### Standard vmRun1 dispatch pattern (area 18 example — "Hizden hamlet")

```
vmRun1 @ 0x833e:
  833eh  SAVE               #256, c99:0          ; reset step flag
  8344h  COMPARE            [0x0008], #6150      ; time-of-day check 1
  834bh  SAVE               #257, c99:0
  8351h  COMPARE            [0x0008], #6417      ; time-of-day check 2
  8358h  SAVE               #257, c99:0
  835eh  SAVE               [0x002d], [0x00cc]   ; save raw cell word
  8365h  AND                #383, c2d:0, [0x00bf] ; mask low 9 bits → cell type bits
  836eh  COMPARE_AND        [0x00bf], #257, c11:0, #5634  ; cell==257 AND facing==5634?
  837ah  GOTO               [0x8505]             ; yes → transition handler
  837eh  AND                #376, c2d:0, [0x00c0] ; alternative masking
  8387h  COMPARE            [0x00c0], #5672
  838eh  GOTO               [0x85ab]             ; cell-type branch
  8392h  COMPARE_AND        [0x00bf], #312, c11:0, #5633
  839eh  GOTO               [0x83a3]
  83a2h  EXIT
```

**The dispatch pattern in plain terms:**

1. `SAVE [0x002d], [0x00cc]` — preserve the packed GEO cell word.
2. `AND [0x002d], #MASK, [0x00bf]` — extract cell descriptor bits into a temp register (`[0x00bf]`).
3. `COMPARE_AND [0x00bf], #CELLBITS, [0x0011], #FACING` — test cell bits AND facing simultaneously.
4. Conditional `GOTO` to the fight or event subroutine.

Key ECL logical memory/register references confirmed by disassembly:
- `[0x002d]` — packed GEO cell descriptor word (wall bits + backdrop + flags).
- `[0x0011]` — current facing direction (0=N, 1=E, 2=S, 3=W).
- `[0x00bf]` — scratch temp (dual-used; also party X in some contexts).
- `[0x0097]` — encounter cooldown counter (see §3).
- `[0x0023]` — ECL/CCECL logical wandering-encounter selector key for the area 5 ON_GOTO dispatch,
  not a proven original DQK DGROUP offset.

### searchLocation dispatch pattern (area 23 — "Dargaard Keep")

```
searchLoc @ 0x8323:
  8323h  AND                [0x002d], #383, c9b:0   ; mask cell bits
  832ch  COMPARE            [0x009b], #5632          ; == 0? (empty cell)
  8333h  GOTO               [0x83a4]                 ; yes → exit path
  8337h  AND                #320, c9b:0, [0x00bf]   ; test wall-type sub-field
  8340h  COMPARE            [0x00bf], #5888
  8347h  GOTO               [0x9f27]                 ; specific wall type → event
  834bh  AND                #288, c9b:0, [0x00bf]
  8354h  COMPARE            [0x00bf], #5888
  835bh  GOTO               [0x9e54]
  835fh  SUBTRACT           #257, c9b:0, [0x00bf]   ; normalize cell-type index
  8368h  ON_GOTO            [0x00bf], #274, ...      ; jump table: 274 entries
                            ... [0] = c8a:134, [1] = [0x8e97], ..., [16] = [0x9c40], ...
```

The `ON_GOTO` dispatches on the normalized cell index. Entry `[16]` maps to `sub_9c40`; older notes
decoded that block as `PARTYSTRENGTH + COMBAT`, but the corrected DQK Gen2 zero-operand `0x1d` frame
shows descriptor 18 ends normally and is not a real combat handoff.

---

## 3. Encounter cooldown (addr 0x0097)

Several areas open vmRun1 / searchLocation with:

```
COMPARE  [0x0097], #0
IF_NE
SUBTRACT #1 → SAVE #255, [0x0003]
EXIT
```

When `[0x0097]` is non-zero, all event processing is skipped. This prevents immediate re-trigger
on the same cell after combat. The engine must preserve `[0x0097]` in `areaMemory` and decrement
it on each step.

Confirmed in areas 30, 34, and several others. The value `#255` written to `[0x0003]` after
decrement appears to signal "step consumed" to the host.

---

## 4. The two paths to `COMBAT`

### Path A: `LOAD_MONSTER` → `COMBAT` (explicit roster, scripted encounter)

```
; Area 66 (Zhaman / Palace district), shipped encounter subroutine @ 0x8398:
  8398h  LOAD_MONSTER       #24, #4, #3
  839fh  LOAD_MONSTER       #36, #1, #3
  83a6h  LOAD_MONSTER       #24, #3, #3
  83adh  LOAD_MONSTER       #61, #2, #2
  83b4h  LOAD_MONSTER       #63, #4, #10
  83bbh  SAVE               #1, [0x001e]
  83c1h  PARLAY             #35, c29:9, #0, [0x0022]   ; DQK Gen2 short form: 3 values + dest
  83cbh  COMBAT                                      ; fire queued 14-monster roster
  83cch  SAVE               #1, [0x0022]
  83d2h  GOTO               [0x8251]
```

**Correction, 2026-07-13:** earlier notes parsed area 66's `PARLAY` with the Gen1 six-operand
frame. That consumed the following `0x24` `COMBAT` byte as operand data and produced a false
`GOTO c34:0` desync. DQK Gen2 `PARLAY` is byte-proven as a four-operand frame here. Greybox now
has a golden in `packages/engine/test/dqkEvents.test.ts` that decodes `0x83c1`, asserts the next
byte is `COMBAT`, then runs the real subroutine through `EclVm`: `run()` pauses on PARLAY and
`resume(0)` reaches `status:'combat'` with the five queued groups above.

Also confirmed in area 2 (debug arena — `LOAD_MONSTER [0x0099], [0x009a], [0x0099]` × 4 →
`COMBAT`) and area 5 (overland wandering encounter `ON_GOTO` → per-encounter `LOAD_MONSTER`
stubs). Arguments are fully runtime: `monsterId`, `count`, and `picBlockId` can all be
immediate (`#N`) or memory references (`[addr]`), enabling the engine to look them up from
the GEO or a rolled random table.

Multiple `LOAD_MONSTER` calls before a single `COMBAT` create a multi-group encounter
(confirmed by area 66's five-group shipped subroutine and other multi-group scripts).

### Path B: `PARTYSTRENGTH` → `COMBAT` (retracted for DQK area 23 descriptor 18)

```
; Stale decode of area 23 sub_9c40 (cell index 16 in searchLoc ON_GOTO):
  9cceh  PARTYSTRENGTH      c12:128   ; false Gen1-style one-operand frame
  9cd1h  IF_GE
  9cd2h  COMBAT                        ; false COMBAT handoff under corrected DQK Gen2 framing
```

> **CORRECTED, 2026-07-13.** The area-23 descriptor-18 claim above is stale. The Palanthas runtime
> route proves DQK Gen2 opcode `0x1d` is zero-operand there; with that frame, byte `0x24` at stream
> offset `0x8439` is a `PRINTCLEAR` inline string length, not top-level `COMBAT`. The same correction
> is guarded in `packages/engine/test/dqkEvents.test.ts`: area 23 descriptor 18 now ends normally, and
> a previously queued descriptor-90 roster remains queued instead of being consumed by a fake combat.
> See also `docs/engine/research/dqk-palanthas-palace-combat-route.md` and
> `docs/engine/research/dqk-ca03-runtime-probe.md`.
>
> The older "engine auto-populates the roster, scaling to party level" reading is also still refuted.
> `PARTYSTRENGTH` is not a roster-filler; real monster rosters come from `LOAD_MONSTER` or host
> wandering-encounter state, not from `0x1d`.
>
> **Implementation (`packages/engine/src/ecl/vm.ts`):** `case 0x1d` sets
> `cmp = {left: hostPartyStrength, right: rvalue(operand)}` when an operand is present, and uses
> threshold `0` when the corrected DQK Gen2 frame supplies none. Do not infer a real combat handoff from
> stale one-operand `0x1d` decodes.

### Which path fires from vmRun1 vs searchLocation?

From the probe data:

| Entry point | Fight path | Confirmed areas |
|---|---|---|
| `searchLocation` | `ON_GOTO` -> `LOAD_MONSTER` -> `COMBAT` (Path A) | No current DQK area-23 proof; area 66 direct-subroutine proof is not SearchLocation-reachable |
| `searchLocation` | `ON_GOTO` -> stale `PARTYSTRENGTH` -> false `COMBAT` (retracted Path B) | Area 23 descriptor 18 is now negative under corrected DQK Gen2 `0x1d` framing |
| `vmRun1` | `COMPARE_AND` → `GOTO` → subroutine (both paths) | 18, 5, 30 |
| `vmRun1` (area 5) | `ON_GOTO [0x0023]` logical selector → 8 wandering-encounter stubs (each `LOAD_MONSTER`→`COMBAT`) | 5 |
| `vmRun1` (area 66) | `GOSUB [0x9f6f]` → cooldown check → `EXIT` (thin wrapper) | 66 |

**Conclusion:** vmRun1 can reach real DQK combat (area 5 has a native natural-step proof), and
SearchLocation still needs per-area proof after the `0x1d` correction. A full per-step execution must
call both. Area 66's vmRun1 is almost empty (just a shared cooldown GOSUB), while subroutine `0x8398`
is only a direct shipped-script proof unless a real caller is found.

---

## 5. Corrected worked example — Area 66 direct shipped combat subroutine

**Area 66** = DISK3/ECL.GLB member 46 (size 8142 bytes, vbase 0x8000).
Entry points: vmRun1 @ 0x8592, searchLoc @ 0x8629, eclInit @ 0x8014.

**Correction, 2026-07-13:** area 66 subroutine `0x8398` is a real shipped combat subroutine, but
current CFG scanning does **not** find it reachable from area 66 `vmRun1` or `SearchLocation`.
See `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`. The old "SearchLocation dispatches to
`0x8398`" note came from bad/over-broad scanning and is superseded.

Current real SearchLocation opening:

```
1.  searchLoc @ 0x8629 executes
2.  GOSUB [0x9f6f]           — shared cooldown check (runs [0x0097] decrement logic)
3.  SAVE #0, [0x0097]        — reset cooldown
4.  COMPARE [0x00a0], #255
5.  ADD #1, [0x00a0], [0x00a0]
6.  COMPARE [0x00a9], #1
7.  IF/GOTO gate             — either skip to descriptor dispatch or branch elsewhere
8.  RANDOM #5, [0x00bf]
9.  ...
10. AND #127, [0x002d], [0x009b]
11. ON_GOTO [0x009b], #15,
    0x86ce, 0x88e7, 0x890d, 0x8933, 0x895c,
    0x89b5, 0x8cc6, 0x8dcb, 0x90e0, 0x90fd,
    0x8879, 0x88e2, 0x911a, 0x914c, 0x9d18
```

The direct subroutine remains engine-verified and browser-wired as a shipped-script combat proof:

```
8398h  LOAD_MONSTER #24, #4, #3
839fh  LOAD_MONSTER #36, #1, #3
83a6h  LOAD_MONSTER #24, #3, #3
83adh  LOAD_MONSTER #61, #2, #2
83b4h  LOAD_MONSTER #63, #4, #10
83bbh  SAVE #1, [0x001e]
83c1h  PARLAY #35, c29:9, #0, [0x0022]
83cbh  COMBAT
```

Do not treat this direct subroutine proof as proof that live walking into an area-66 cell is fully
recovered. A descriptor-only scan of `vmRun1` + `SearchLocation` over all decoded DQK GEO descriptors,
with blank area memory and partyStrength values 122/9999, found **0 non-empty rosters**.

---

## 6. Concrete worked example — Area 5 (overland), vmRun1 path

**Update, 2026-07-13:** the area-5 path now has a native natural-step combat/resume proof. See
`docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md`: `native/gbdqk-combat-flow-test.ps1`
with `-Headless` drives `GBBOOT /E /T 1 /A 5` from `(0,1,north)` to `(0,0)`, queues the dragon
encounter `0x002E x2`, writes `_GBCOMB.RAW` / `_GBCR.BIN`, and resumes native script state. The notes
below remain the ECL/host-state rationale for why area 5 is a `vmRun1` combat source.

vmRun1 @ 0x8429:

```
  8429h  COMPARE  [0x009c], #5633     ; check "first step on area" flag
  8430h  SAVE     #256, c9c:0
  8436h  IF_EQ / GOTO [0xa76a]        ; first step → encounter init sub
  843bh  ON_GOTO  [0x0023], #264, ...  ; logical wandering encounter dispatch (8 main slots):
         [0] = ... [0xa5dd] [0xa5f3] [0xa607] [0xa61d] [0xa631] [0xa647] [0xa65b]
         each pointing to a stub like:
           a9a3h: LOAD_MONSTER [0x00c0], [0x00bf], c13:42
                  COMBAT
           (coords loaded into monster args from party position registers [0xc0]/[0xbf])
```

`[0x0023]` is the area's ECL/CCECL logical random encounter ticker key (incremented each step or
rolled on encounter check in the recovered native path). Do not read it as a confirmed original
`DQK.EXE` DGROUP offset. When it reaches the target index, the corresponding stub fires
`LOAD_MONSTER` + `COMBAT` with monster id and count taken from logical runtime keys.

---

## 7. Raw byte scan vs walk-reachable discrepancy

Most areas show high counts of raw `0x24` bytes that are **not reachable from entry points** by
a static walker. Example: area 34 has 65 raw `0x24` bytes but 0 confirmed by walk. This is
explained by **0x24 appearing as data bytes inside 6-bit-encoded strings** (the Gold Box string
encoding places arbitrary byte values in the packed text payload). The raw byte scan is therefore
unreliable; only the disassembler-based walk is trustworthy.

Current DQK combat evidence should be read conservatively: area 5 has a native natural-step
`vmRun1` proof, and area 66 has a direct shipped subroutine proof (`0x8398` -> `LOAD_MONSTER` x5 ->
Gen2 `PARLAY` -> `COMBAT`) but is not proved reachable from area 66 `vmRun1`/`SearchLocation`.
Area 23 descriptor 18 is no longer a confirmed `COMBAT` after the corrected DQK Gen2 `0x1d` frame.
Many areas have walk-confirmed `LOAD_MONSTER` opcodes, but the `COMBAT` that consumes them may be
deeper in a subroutine chain not fully traced in this pass.

---

## 8. Open questions / unknowns

| Item | Status |
|---|---|
| Exact DQK Gen2 `0x1d` semantics outside the Palanthas/area-23 correction | UNKNOWN — the Palanthas runtime route proves a zero-operand frame there; do not infer a monster table or roster source from stale one-operand decodes |
| Meaning of `[0x0023]` in area 5 ON_GOTO | UNKNOWN — ECL/CCECL logical wandering encounter selector key, likely incremented per step by the engine runtime **(inferred)**; not a proven original DGROUP offset |
| Exact meaning of `[0x002d]` bits after masking | UNKNOWN — GEO cell descriptor word; mask values `#383` (0x17F) and `#376` (0x178) extract sub-fields **(inferred)** |
| What GEO data produces which cell-type index for ON_GOTO dispatch | UNKNOWN — requires cross-referencing GEO map format with cell descriptor bit layout |
| Whether `SURPRISE` (0x23) must be handled before `COMBAT` or if COMBAT can fire without it | UNKNOWN — `SURPRISE` seen in area 34 searchLoc but not in the confirmed combat chains above; likely optional |
| Monster `#24` in LOAD_MONSTER for area 66 | UNKNOWN — MONCHA id table not correlated here |
| vmRun1 and searchLocation interaction: can both fire a COMBAT in the same step? | UNKNOWN — engine should probably fire vmRun1 first, then searchLocation, and stop after the first COMBAT effect **(inferred from Gen1 pattern)** |
| Whether any DQK Gen2 `0x1d` path still gates a real later `COMBAT` under corrected framing | UNKNOWN — area 23 descriptor 18 is a negative guard, not positive combat evidence |

---

## 9. Implications for the engine

### What the current engine (`dqkExplore.ts`) is missing

> **Superseded, 2026-07-13:** current `apps/web/src/ui/dqkExplore.ts` runs `vmRun1` before
> `SearchLocation`, passes host `partyStrength`, and carries a shared pending `encounterRoster`
> across per-cell invocations. Keep this section as historical design context only; use
> `dqk-combat-entrypoint-cfg-scan.md` and `combat-ecl-to-combat-flow.md` for the current DQK state.
>
> Area 18/58's loaded-GEO natural empty-roster `COMBAT` gates have also been reclassified as
> temple/service dispatches because they explicitly run `CLEARMONSTERS` immediately before `COMBAT`;
> they are not evidence that `PARTYSTRENGTH` fills a monster roster.

Historical note: at the time this section was written, `runStepEvent` called only `fireSearchLocation`
and the vmRun1 handler was **never called per step**. That meant:

1. Area-exit triggers (e.g., area 18's hamlet departure prompt) do not fire.
2. vmRun1-only combat triggers (area 18, area 5 wandering encounters) never launch.
3. The encounter cooldown (`[0x0097]`) is not maintained across steps.

### Proposed wiring (architecture-level; no code changes here)

```
function runStepEvent(areaId, x, y, facing, cellDescWord, areaMemory):
  // 1. Seed shared memory
  areaMemory[0x002d] = cellDescWord   // raw GEO cell word for vmRun1
  areaMemory[0x0011] = facing         // 0=N,1=E,2=S,3=W
  areaMemory[0x0034] = x
  areaMemory[0x0035] = y
  areaMemory[0x001b] = areaId

  // 2. Run vmRun1 via EclVm
  vmResult = runEclUntilStop(block, 'vmRun1', areaMemory)
  if vmResult.status === 'combat':
    return launchDqkCombat(vmResult.roster, ...)  // stop; don't run searchLoc

  // 3. Run searchLocation
  slResult = runEclUntilStop(block, 'searchLocation', areaMemory)
  if slResult.status === 'combat':
    return launchDqkCombat(slResult.roster, ...)

  // 4. Surface any text events
  return { text: [...vmResult.effects, ...slResult.effects].filter(e=>e.type==='print') }
```

**Critical implementation note:** `areaMemory[0x0097]` (encounter cooldown) must be
persisted in the area state between steps, not reset on each call. The ECL itself
decrements it; the host must store/restore it from `areaMemory`.

### `PARTYSTRENGTH` handling

**DONE (C4.2b-2b-2c-ii), amended 2026-07-13.** `PARTYSTRENGTH` (0x1d) is **not** a roster-filler.
The earlier "populate `this.encounter[]` before `COMBAT`" suggestion was based on the refuted Path-B
reading; the roster comes from `LOAD_MONSTER`, not `0x1d`. Current `vm.ts` keeps the
comparison-register behavior when an operand is decoded, but the DQK Gen2 Palanthas route proves
`0x1d` can be zero-operand and must not be allowed to consume following bytes into a fake `COMBAT`.
See the §4 correction box for full detail.

### `SURPRISE` handling

The engine's `SURPRISE` (0x23) handler path should be verified. If a fight sub calls
`SURPRISE` before `COMBAT`, the VM returns `status: 'surprise'` (or similar) and the host
must resolve the surprise check before resuming the VM into `COMBAT`. The combat flow in
`launchDqkCombat` should accept a `surprised: boolean` parameter.

---

## 10. File paths

- ECL source: `The Dark Queen of Krynn/DISK3/ECL.GLB`
- ECL loader: `packages/engine/src/loaders/eclGlb.ts`
- ECL disassembler: `packages/engine/src/ecl/disassemble.ts`
- ECL VM: `packages/engine/src/ecl/vm.ts`
- Opcode table: `packages/engine/src/ecl/opcodes.ts`
- Explore wiring: `apps/web/src/ui/dqkExplore.ts`
- Gen2 header doc: `docs/engine/research/ecl-gen2-dqk.md`
- SearchLocation prior research: `docs/engine/research/dqk-search-location.md`
- Bestiary / combat wiring: `docs/engine/research/moncha-dqk.md`
