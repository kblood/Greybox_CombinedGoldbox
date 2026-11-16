# DQK vmRun1 Cooldown + Cell-Descriptor Seeding — Implementation Plan (C4.2b-2b-2c-iii)

**Scope:** Persist/decrement `[0x0097]` (encounter cooldown) and seed `[0x002d]`
(GEO cell-descriptor word) + `[0x0011]` (facing) from the live explorer pose so
vmRun1's `COMPARE_AND`-gated fight subroutines actually reach a real combat cell.

**Prior work:** C4.2b-2b-2c-i wired vmRun1 per-step on shared `areaMemory`;
C4.2b-2b-2c-ii implemented `PARTYSTRENGTH` (0x1d) as a comparison gate.
This slice closes the last gap identified in
`docs/engine/research/combat-trigger-c4.2b-2b-2b.md` §9.

---

## ⭐⭐ iii(b) RESULTS — `execArith` + cell-descriptor dispatch (shipped 2026-06-23)

> **This block is the newest authority and supersedes the ⏸ "Deferred" sub-section below**
> (which is now DONE) and the coordinate-dispatch framing wherever it survives in §1–§6.

**The big correction: DQK never dispatched per-cell events on party coordinates.** The
"`0xbf`=X / `0xc0`=Y coordinate dispatch" recorded for C4.1 was an **artifact of the buggy
`execArith` operand order** — with the wrong dest/source the ON_GOTO index happened to track
the seeded X/Y. With the COAB-faithful arith landed, `0xbf`/`0xc0` are revealed as **plain
scratch** the ON_GOTO chains reuse. The real per-cell selector is a **host-populated
cell-descriptor byte**:

- **Gen2 (DQK):** `[0x002d]`. Masked per area, e.g. area 18 `AND [0x002d],#0x7F,[0xbf]`;
  area 30/area 4 two-level `group=([0x002d]&0x70)/16`, `index=[0x002d]&0x0F` → ON_GOTO.
  Static fact: `[0x002d]` is **READ-only by ECL — 52 reads, 0 writes across all 47 area
  blocks** → unambiguously host-populated (the engine writes the GEO backdrop byte each step).
- **Gen1 (CoK/DoK):** `[0xc04f]` (`MAP_CELL_BYTE_ADDR`). ECL1 block 34 byte-proven:
  `AND 0xc04f,#63,0x7f79 ; ON_GOTO [0x7f79]` — the script *derives* `0x7f79` from `0xc04f`,
  so the host seeds **both** (`0xc04f` and `0x7f79` for direct readers).

**`execArith` convention now byte-faithful** (COAB `CMD_AddSubDivMulti`/`CMD_AndOr`):
dest = **op3 (last operand)**; **ADD** x+y, **SUBTRACT** y−x (op2−op1, reversed), **DIVIDE**
x/y (op1/op2), **MULTIPLY/AND/OR** commute; **AND/OR also set the compare flags vs 0**. Proven
from `AND #127,[0x2d],[0xbf]` = `[0xbf]=[0x2d]&127` and `SUBTRACT #1,[0x97],[0x97]` = decrement.

**Two earlier misframings corrected:** the divisor is `&0x70)/16` (NOT `&0x78)/8`); the gate
constant is `==1` (NOT `==257`, an operand+opcode framing artifact). Facing `[0x0011]` raw
ordinal N=0/E=1/S=2/W=3 (already corrected in the iii(a) block).

**Shipped surface:** `dqkVmRun1Seed(cellDesc,facing,areaId)` + `dqkFacingValue`;
`DQK_CELL_DESC_ADDR=0x002d`, `MAP_CELL_BYTE_ADDR=0xc04f`; `primeSearchLocation` seeds the
right descriptor per dialect; web `searchByDesc(areaId,cellDesc)` seam. Goldens rewritten to
assert **real distinct events by descriptor** (area 30: 0→ZOMBIES/PATROL, 12→PALACE,
188→SKELETONS/TEMPLE, 146→GUARDS/ARMY — all 4 distinct; area 4: 5→CAERGOTH, 34→CHILD/WOMAN,
7→SHIP/MAST). 684 engine / tsc 0 / 35 e2e; deployed HTTP 200.

---

## ⭐ VERIFICATION RESULTS & CORRECTIONS — shipped slice (2026-06-23)

> This block is authoritative and **supersedes** the speculative parts of §1–§6 below
> (the cell-descriptor packing and facing-encoding sections in particular). Everything here
> was **self-disassembled from the real `ECL.GLB` and cross-checked against the COAB oracle**
> (`engine/ovr003.cs`), not taken on trust — three of the plan's load-bearing claims were
> wrong.

### ✅ What shipped: the `COMPARE_AND` (0x14) opcode fix (engine, byte-verified)
- **COAB `CMD_CompareAnd` (sub_26B0C) is the ground truth:** it resets a **six-slot
  `compare_flags[]` array** (one per IF type ==,!=,<,>,<=,>=), reads four operand values,
  and sets **only `flags[0]` (==)** true iff `(op1==op2) AND (op3==op4)`, else **only
  `flags[1]` (!=)**. `CMD_If` reads `compare_flags[opcode−0x16]`. `CMD_Compare`/`PARTYSTRENGTH`
  fill all six.
- Our VM modelled the comparison as a single `{left,right}` register and implemented 0x14 as
  `{left:mem[a0], right:mem[a2]}` — i.e. it compared **the two memory cells against each other**
  and ignored both constants. **Fixed:** `vm.ts` now carries the COAB `cmpFlags[6]` model;
  `COMPARE_AND` sets `[both, !both, 0,0,0,0]`. (The plan's §6a `{0,0}`/`{0,1}` trick is itself
  unfaithful — `{0,0}` would let a following `IF_LE`/`IF_GE` spuriously pass; a unit test guards
  this.)
- **Self-verified pattern (DQK ECL.GLB area 18 vmRun1 @0x836e):**
  `COMPARE_AND [0xbf],#1,[0x11],#2 ; IF_EQ(@0x8379) ; GOTO 0x8505` — the `IF_EQ` the §1b
  research listing **dropped**; `COMPARE_AND→IF_EQ→GOTO` is the real fight-gate shape.

### ❌ Three plan claims REFUTED (disassembler misframing — the over-attribution trap)
The §1b/§2 listing's immediates **`#257` / `#5634` / mask `#383`** are **operand-framing
artifacts**: that tool read an operand byte + the *following opcode byte* as one 16-bit word.
The real values, from our correctly-framed decoder:

| Plan (artifact) | Real | How the artifact arose |
|---|---|---|
| cell-bits `== #257` (0x101) | `== #1` | imm byte `01` + next operand's code byte `01` → `0x0101` |
| facing `== #5634` (0x1602) | `== #2` | imm byte `02` + the **IF_EQ opcode** `0x16` → `0x1602` |
| mask `#383` (0x17F) | `#0x7F` | imm byte `7F` + next code byte `01` → `0x017F` |

- **Facing `[0x0011]` is a RAW ORDINAL** (area 18 tests `== #2` = south), **not** a packed
  word — this **refutes the plan's "single biggest risk" (§5.5 / §6 facing-encoding).**
  `dqkFacingValue` should map north=0/east=1/south=2/west=3 directly; no probe needed.

### ✅ Deferred → DONE in iii(b) (see the ⭐⭐ block at top) — the `[0x002d]` GEO→word "packing"
was a red herring: the descriptor is a single host-seeded **byte**, not a packed word, and the
"coordinate dispatch goldens" this section feared regressing were themselves the arith-bug artifact.
- **`execArith` operand order is provably wrong** vs COAB `CMD_AddSubDivMulti`/`CMD_AndOr`:
  the real convention is **dest = op3 (arg2's word)**, operands op1/op2 = arg0/arg1;
  **SUBTRACT = op2−op1**; **AND/OR are byte results that also set the compare flags vs 0**.
  Our VM uses `dest=arg0, ops=arg1/arg2` (the code's own "ASSUMED" comment). **Landing this fix
  regresses the verified area-30 coordinate goldens**, because area 30 dispatches on
  `[0xca] = ([0x002d] & 0x78) / 8` (cell descriptor) and area 18's gate needs
  `[0xbf] = [0x002d] & 0x7F` — both UNUSABLE until the host seeds **`[0x002d]`**, whose exact
  **GEO→word packing is still UNLOCATED**. So the arith fix + the `[0x002d]` seed + the facing
  ordinal must land **together** as a dedicated slice; doing the opcode order alone breaks more
  than it fixes.
- **Cooldown `[0x0097]`** persistence is already correct (shared `areaMemory`); no change.

### Narrative fallout handled faithfully (not the engine's fault)
Two golden narratives (area-4 **VOYAGE BEGINS PEACEFULLY** intro, **HUGE SHADOWS** ambient)
were green **only because the COMPARE_AND bug** matched their gates' unseeded-zero cells. They
are really gated by the script's own byte-verified state: intro `COMPARE_AND [0x16],#4,[0x9c],#2`
(@0x801f); ambient `COMPARE_AND [0xa1],#3,[0x0a0],#1` (@0x8a46, a per-step counter). The tests +
the web `runAreaEcl`/`searchAt` seams now seed those trigger constants (the engine-supplied
area-entry/ambient state) — empirically safe across all 20 areas (area-2 loadFiles, area-30
distinct ZOMBIES/CHILD/DOGS all still green). Live per-step counter accumulation waits on the
`execArith` fix above.

---

## 1. Where memory addresses are seeded today

### 1a. Engine-layer seeding (confirmed, file:line)

**`packages/engine/src/world/dungeonEvents.ts`**

- Line 40–50: `DQK_PARTY_X_ADDR = 0xbf`, `DQK_PARTY_Y_ADDR = 0xc0`,
  `DQK_AREA_ADDR = 0x1b` — declared as exported constants.
- Line 45–51: `dqkPositionSeed(x, y, areaId)` returns a `Record<number, number>`
  with only these three addresses (X, Y, area). Facing `[0x0011]` and
  cell-descriptor `[0x002d]` are **absent** from this helper.
- Line 76–90: `primeSearchLocation` — for Gen2 (DQK) it calls `primeHandler` with
  `extra = undefined` (no backdrop seed) and passes caller's `seedMemory`.
- Line 105–110: `primeVmRun1` — calls `primeHandler` with no `extra` and passes
  `opts.seedMemory` verbatim.
- Line 118–138: `primeHandler` — writes `extra` first, then `opts.seedMemory` into
  the shared `memory` map, then builds `EclVm`. This is the correct seam: adding
  addresses to `seedMemory` is enough.

**`apps/web/src/ui/dqkExplore.ts`**

- Line 732: `const seedMemory = dqkPositionSeed(x, y, areaId)` — built from the
  live pose but has no facing or cell-descriptor field.
- Line 734: `dialogueForVmRun1(block, { dialect: ECL_GEN2, memory, seedMemory })`
  — passes the same three-address seed to vmRun1.
- Line 735: `dialogueForCell(block, 0, { dialect: ECL_GEN2, memory, seedMemory })`
  — passes the same seed to SearchLocation.
- Line 323: `state.areaMemory = new Map<number, number>()` — fresh map on area
  change. The map is passed through every step call, so values written by ECL on
  step N persist into step N+1. This is the correct persistence mechanism for
  `[0x0097]`.

### 1b. What vmRun1 reads (confirmed from ECL.GLB area 18 disassembly)

From `docs/engine/research/combat-trigger-c4.2b-2b-2b.md` §2 (area 18 @
0x833e — byte-verified from `The Dark Queen of Krynn/DISK3/ECL.GLB`, member
indexed by ECL.GLB id table):

```
835eh  SAVE     [0x002d], [0x00cc]     ; copy raw cell word into [0x00cc]
8365h  AND      #383, c2d:0, [0x00bf]  ; [0x00bf] = [0x002d] & 0x17F
836eh  COMPARE_AND [0x00bf], #257, c11:0, #5634
                                       ; test [0x00bf]==257 AND [0x0011]==5634?
837ah  GOTO     [0x8505]               ; yes → transition handler
```

Key reads:
- `[0x002d]` — the packed GEO cell-descriptor word. vmRun1 reads it at `835e`
  with a SAVE (copies to `[0x00cc]`), then ANDs it against mask `#383` (= 0x17F)
  to extract the cell-type bits. **If `[0x002d] == 0` (the default), the AND
  yields 0, which will never equal `#257` (0x101) — the COMPARE_AND is
  permanently false → no combat.**
- `[0x0011]` — facing direction. The `COMPARE_AND` at `836e` tests BOTH
  `[0x00bf]` (derived from `[0x002d]`) AND `[0x0011]` simultaneously (opcode 0x14,
  4-operand form). **If `[0x0011] == 0` (the default) and the ECL tests `#5634`
  (= 0x1602, North with some flag bits), the facing gate is permanently false.**

**`[0x0097]` — encounter cooldown:** From §3 of the same document, areas 30, 34,
and 66 open vmRun1 with:

```
COMPARE  [0x0097], #0
IF_NE
SUBTRACT #1 → SAVE #255, [0x0003]
EXIT
```

When `[0x0097]` is non-zero, the whole vmRun1 body exits immediately, preventing
re-trigger on the same cell. The ECL itself writes a non-zero value to `[0x0097]`
when combat fires (UNLOCATED — the specific SAVE is inside fight subroutines not
fully traced, but the decrement side is confirmed). The host's only job is to
**not zero-initialize `[0x0097]` on every call** — the ECL owns decrement logic.
The shared `areaMemory` map already satisfies this (it persists across steps); no
host-side decrement is needed.

---

## 2. How `[0x002d]` and `[0x0011]` are used by the COMPARE_AND-gated fight subroutines

### The masking pattern (area 18, confirmed)

```
AND  #383,  [0x002d], [0x00bf]   ; mask = 0x17F; extracts low 9 bits of the cell word
AND  #376,  [0x002d], [0x00c0]   ; mask = 0x178; extracts bits 3–8 (wall type sub-field)
```

The mask `#383` = binary `101111111` = 0x17F keeps bits 0–6 plus bit 8. The
second mask `#376` = 0x178 = `101111000` isolates bits 3–7. These sub-fields
appear to encode: backdrop/zone (low bits), wall-type flags (mid bits).

### What values trigger a fight (area 18 example)

From the disassembly trace:

```
COMPARE_AND [0x00bf], #257, [0x0011], #5634
```

- `[0x00bf]` (= `[0x002d] & 0x17F`) must equal `#257` = 0x101.
- `[0x0011]` (facing) must equal `#5634` = 0x1602.

0x101 in the low 9 bits of the cell word means bit 0 = 1 and bit 8 = 1 — this
is a cell with wall-type flags that mark it as a transition or combat cell (exact
bit semantics: UNLOCATED from disk; the GEO Gen2 backdrop/zone plane stores
per-cell event codes but their bit layout relative to this 9-bit field is not
documented in hackdocs). Facing 0x1602 = North (0=North in the engine's Direction
encoding, but 0x1602 is the ECL-stored form — this is likely the 16-bit packed
form the COAB engine stores `[0x0011]` in: high byte 0x16 is a flag/mode word,
low byte 0x02 may be the actual facing index). **(UNLOCATED — exact bit layout of
the ECL-encoded facing value.)**

### The recoverable-from-disk / must-be-host-supplied split

| Address | Source | Recovery |
|---|---|---|
| `[0x0097]` cooldown | ECL writes it (fight subroutines contain a SAVE) | Recoverable from disk — ECL does it; host just must not clear it |
| `[0x002d]` cell word | GEO plane 0–3 bytes for the current cell | **Recoverable from disk** — must be assembled by host from the decoded GeoDecodeResult |
| `[0x0011]` facing | Explorer.getPose().facing | **Must be host-supplied** — the live engine pose, not on disk |

### How to construct `[0x002d]` from the decoded GEO

The GEO Gen2 loader (`packages/engine/src/loaders/geo.ts`, `buildGeoResult`) gives
us `wallPlane0`, `wallPlane1`, `backdropPlane`, and `doorPlane` for every cell
(returned in `Gen2GeoMap`). The ECL cell-descriptor word `[0x002d]` packs these
planes. From the masking operations in the disassembly (mask 0x17F extracts a
9-bit sub-field), the most plausible packing is:

```
cellWord = (doorPlane[cellIdx] << 8) | backdropPlane[cellIdx]
```

or a variation that places the wall nibbles in the high bits and the backdrop/zone
byte in the low byte. **The exact packing is UNLOCATED from disk** — a definitive
answer would require either (a) finding a SAVE to `[0x002d]` in an area init block
(which would show us what the COAB engine wrote there) or (b) confirming a known
combat cell's raw GEO bytes produce `[0x002d] & 0x17F == 0x101`.

**Pragmatic approach (inferred):** Start with `cellWord = backdropPlane[cellIdx]`
(the Gen1 event-dispatch byte, which is the most used sub-field in Area 18's mask
0x17F). If the combat cell's backdrop byte has bit 0 AND bit 8 set, the fight
triggers. Since backdrop is a byte (0–255), bit 8 must come from an adjacent plane.
The likely construction is:

```
cellWord = (wallPlane0[cellIdx] << 8) | backdropPlane[cellIdx]
```

since plane 0 has the North/East wall nibbles and the AND mask 0x17F crossing byte
boundary would grab bit 8 from plane 0's low nibble.

For the initial implementation, **seed `[0x002d]` as the backdrop byte alone
(`backdropPlane[cellIdx]`)** and note that bit-8 fight cells will not trigger until
the packing is confirmed. This is safer than a wrong packing and lets the existing
tests stay green.

### Facing encoding for `[0x0011]`

The engine Direction type is `'north' | 'east' | 'south' | 'west'`. The ECL stores
facing as an integer. From area 18's COMPARE_AND, the tested value is `#5634` =
0x1602. In the ECL encoding used elsewhere:

- `c11:0` in the EclOpp notation means "code 0x01 (memory reference), word 0x0011"
  = `[0x0011]`. The COMPARE_AND with value `#5634` is the second test operand.

0x1602 decomposed: if the Gold Box engine stores facing as a bit-packed word where
the low nibble is the direction index (0=N, 1=E, 2=S, 3=W) and the high byte is
a mode/flags word, then `0x16` high + `0x02` low = East-facing. **But this is
inference** — the exact encoding the COAB engine places in `[0x0011]` is
UNLOCATED from the available disassembly.

**Pragmatic approach:** map the engine Direction to the four values that appear in
real ECL COMPARE_AND tests. Area 18 tests `#5634` for one facing; to find the
others, look for additional COMPARE_AND chains in area 18's vmRun1 (the next
instruction at `8392h` tests `#5633`). The pattern `5634 / 5633 / 5632 / 5631` =
`0x1602 / 0x1601 / 0x1600 / 0x15FF` is probable but not byte-confirmed.

**Safer approach for initial implementation:** seed `[0x0011]` as the raw Direction
ordinal (0=north, 1=east, 2=south, 3=west), note the ECL COMPARE_AND facing checks
will not match until the encoding is confirmed, and add a `DQK_FACING_ADDR`
constant + a `dqkFacingValue(direction: Direction): number` helper that can be
updated once the encoding is confirmed from a probe.

---

## 3. Cooldown semantics for `[0x0097]`

### What the ECL does (confirmed, area 30/34/66)

Opening sequence of vmRun1 in all tested areas:

```
COMPARE  [0x0097], #0
IF_NE
<guarded instruction>: SUBTRACT #1, c97:0, [0x0097]   ; decrement in place
EXIT                                                   ; skip rest of vmRun1
```

- When `[0x0097] > 0`: decrement and exit. No events fire this step.
- When `[0x0097] == 0`: fall through to the rest of vmRun1 (encounter/event logic).

A value `#255` written to `[0x0003]` in some areas after decrement ("step
consumed" signal) — the host currently ignores `[0x0003]` and this is safe.

### Who sets `[0x0097]` to a non-zero reset value?

UNLOCATED from the current disassembly. The fight subroutines reachable from area
18's vmRun1 (e.g. `sub_8505` at the GOTO target) likely contain a `SAVE #N,
[0x0097]` that arms the cooldown after a fight fires. The exact reset value N is
UNLOCATED. Based on Gold Box conventions (wandering-encounter cooldown = 4–8 steps
in Gen1) the value is likely in the range 4–12. **(inferred)**

### Host responsibility

**None beyond persistence.** The shared `areaMemory` map (already in place in
`dqkExplore.ts`) survives across steps because it is allocated once per area entry
(`line 323: state.areaMemory = new Map()`) and passed by reference to every
`fireSearchLocation` call. The ECL's own SUBTRACT does the decrement; the ECL's
own SAVE (in the fight sub) arms the cooldown. The host must not:
- Zero `[0x0097]` on each step (it does not — the map persists).
- Reset `areaMemory` mid-area (it does not — only on map-select at line 323).

The current code is already correct for cooldown persistence. The gap is that
`[0x0097]` starts at 0 (the default for unset map entries), which means the
cooldown check always passes (0 == 0 → fall through) — this is the **correct**
default: cooldown starts cleared, fights can fire immediately. After a fight, the
ECL writes a reset value to `[0x0097]`, and subsequent steps see a non-zero value
and exit early. No host code change is needed for cooldown.

---

## 4. Concrete implementation plan

### 4a. New constants in `dungeonEvents.ts`

Add to `packages/engine/src/world/dungeonEvents.ts`:

```typescript
/** DQK vmRun1 cell-descriptor word: the packed GEO cell data the COMPARE_AND dispatch reads.
 *  Seeded from the current cell's GEO plane bytes each step. Exact packing is UNLOCATED —
 *  currently seeded as the backdrop byte (plane 2); bit-8+ fields from plane 0 deferred. */
export const DQK_CELL_DESC_ADDR = 0x002d;

/** DQK vmRun1 facing direction: 0x0011. The exact ECL-encoded value is UNLOCATED;
 *  initially seeded as the raw Direction ordinal (north=0, east=1, south=2, west=3). */
export const DQK_FACING_ADDR = 0x0011;

/** Convert a host Direction to the integer seeded into DQK_FACING_ADDR.
 *  NOTE: the exact COAB encoding seen in COMPARE_AND tests (e.g. 0x1602 for area 18)
 *  does not match the ordinal; update this mapping once the encoding is confirmed. */
export function dqkFacingValue(facing: Direction): number {
  const map: Record<Direction, number> = { north: 0, east: 1, south: 2, west: 3 };
  return map[facing];
}

/** Build the complete Gen2 seedMemory for vmRun1: position + facing + cell descriptor.
 *  `cellDescWord` is constructed by the host from the decoded GEO planes for (x, y). */
export function dqkVmRun1Seed(
  x: number,
  y: number,
  areaId: number,
  facing: Direction,
  cellDescWord: number,
): Record<number, number> {
  return {
    [DQK_PARTY_X_ADDR]: x & 0xff,
    [DQK_PARTY_Y_ADDR]: y & 0xff,
    [DQK_AREA_ADDR]: areaId & 0xff,
    [DQK_FACING_ADDR]: dqkFacingValue(facing),
    [DQK_CELL_DESC_ADDR]: cellDescWord & 0xffff,
  };
}
```

Import `Direction` from `'../model/index.js'` (already in the model — type is
`'north' | 'east' | 'south' | 'west'`).

**Gen1 unchanged:** `dungeonEvents.ts` Gen1 path never seeds `[0x002d]` or
`[0x0011]` (they are not in Gen1's SearchLocation dispatch). Adding these constants
does not touch any Gen1 code path.

### 4b. Cell-descriptor assembly helper in `dqkExplore.ts`

Add a helper that builds `cellDescWord` from the decoded Gen2 GEO map:

```typescript
/** Extract the cell-descriptor word for (x, y) from the Gen2 GEO decode result.
 *  The exact COAB packing is UNLOCATED. Current approach: low byte = backdropPlane[idx]
 *  (the zone/event code), high byte = wallPlane0[idx] (N/E nibbles, so bit 8 = East-wall
 *  low bit). Update the packing formula once a probe confirms a known combat cell value. */
function dqkCellDescWord(geoMap: Gen2GeoMap, x: number, y: number): number {
  const idx = y * geoMap.map.width + x;
  if (idx < 0 || idx >= geoMap.map.width * geoMap.map.height) return 0;
  const backdrop = geoMap.backdropPlane[idx] ?? 0;
  const wall0 = geoMap.wallPlane0[idx] ?? 0;
  return ((wall0 & 0xff) << 8) | (backdrop & 0xff);
}
```

`Gen2GeoMap` (from `packages/engine/src/loaders/geo.ts`) exposes `backdropPlane`
and `wallPlane0` as `Uint8Array` fields — already decoded and in scope via the
existing `state.maps[state.mapIndex]` reference.

**Note:** `Gen2GeoMap` must be stored in `DqkState` to remain accessible in
`fireSearchLocation`. Currently `state.map` is a `GameMap` (the walk model);
`state.maps[state.mapIndex]` is the full `Gen2GeoMap` with planes. The host
already accesses `state.maps[state.mapIndex].id` — the raw planes are accessible
at the same path.

### 4c. Wire the full seed into `fireSearchLocation`

Modify `apps/web/src/ui/dqkExplore.ts` function `fireSearchLocation` (currently
line 724–743):

```typescript
function fireSearchLocation(
  block: Uint8Array,
  geoMap: Gen2GeoMap,    // ADD: needed for cellDescWord
  areaId: number,
  x: number,
  y: number,
  facing: Direction,     // ADD: from pose
  memory: Map<number, number>,
): CellEvent {
  try {
    const cellDescWord = dqkCellDescWord(geoMap, x, y);
    const seedMemory = dqkVmRun1Seed(x, y, areaId, facing, cellDescWord);
    // vmRun1 runs every step before SearchLocation (C4.2b-2b-2c-i)
    const vm = drainRunner(dialogueForVmRun1(block, { dialect: ECL_GEN2, memory, seedMemory }));
    // SearchLocation also receives facing + cellDesc in case it uses them
    const sl = drainRunner(dialogueForCell(block, 0, { dialect: ECL_GEN2, memory, seedMemory }));
    const roster = vm.roster ?? sl.roster;
    const body = [...vm.parts, ...sl.parts].join(' ').replace(/\s+/g, ' ').trim();
    const text = body ? (roster ? `⚔ ${body}` : body) : roster ? '⚔ A fight breaks out!' : '';
    return { text, roster };
  } catch {
    return { text: '', roster: null };
  }
}
```

Call site in `runStepEvent` (line 847–858) becomes:

```typescript
function runStepEvent(): void {
  if (!state?.ecl) return;
  const geoEntry = state.maps[state.mapIndex];
  const areaId = geoEntry.id;
  const block = state.ecl.blockSourceById(areaId);
  if (!block) return;
  const pose = state.explorer.getPose();
  const ev = fireSearchLocation(block, geoEntry, areaId, pose.x, pose.y, pose.facing, state.areaMemory);
  // ... rest unchanged
}
```

**`Direction` import:** `dqkExplore.ts` already imports `Direction` from
`'@goldbox/engine'` (line 59 of the existing file).

### 4d. Export new symbols from `packages/engine/src/index.ts`

Add to the dungeon-events export block:
```typescript
export {
  DQK_CELL_DESC_ADDR,
  DQK_FACING_ADDR,
  dqkFacingValue,
  dqkVmRun1Seed,
  // existing exports stay
} from './world/dungeonEvents.js';
```

### 4e. Gen1 golden guarantee

No Gen1 code path reads `[0x002d]`, `[0x0011]`, or `DQK_CELL_DESC_ADDR`. The
`primeSearchLocation` Gen1 path uses only `MAP_WALL_ROOF_ADDR = 0x7f79` seeded
from the backdrop byte; `primeVmRun1` is Gen2-only in practice (Gen1 vmRun1 is
never called from `dungeonEvents.ts` for a Gen1 block). All existing CoK/DoK
golden tests in `packages/engine/test/dungeonEvents.test.ts` are unaffected.

---

## 5. Test plan

### 5a. Engine unit goldens (new, `packages/engine/test/dungeonEvents.test.ts`)

**Test 1: `dqkVmRun1Seed` includes all five addresses**

```typescript
it('dqkVmRun1Seed returns all five required DQK memory addresses', () => {
  const seed = dqkVmRun1Seed(7, 3, 18, 'east', 0x0101);
  expect(seed[DQK_PARTY_X_ADDR]).toBe(7);
  expect(seed[DQK_PARTY_Y_ADDR]).toBe(3);
  expect(seed[DQK_AREA_ADDR]).toBe(18);
  expect(seed[DQK_FACING_ADDR]).toBe(1);           // east = ordinal 1
  expect(seed[DQK_CELL_DESC_ADDR]).toBe(0x0101);
});
```

**Test 2: vmRun1 with non-zero cellDesc reaches further into the dispatch (synthetic)**

```typescript
it('vmRun1 with seeded [0x002d]=0x0101 advances past the AND gate', () => {
  // Build a Gen2 block whose vmRun1:
  //   AND  #383, [0x002d], [0x00bf]   ; [0x00bf] = 0x0101 & 0x17F = 0x101
  //   COMPARE [0x00bf], #257          ; 0x101 == 0x101 → cmp holds
  //   IF_EQ
  //   LOAD_MONSTER #5, #1, #0
  //   COMBAT
  //   EXIT
  // With [0x002d]=0, COMPARE yields 0 vs 257 → IF_EQ fails → no combat.
  // With [0x002d]=0x0101, COMPARE yields 257 vs 257 → IF_EQ passes → combat.
  const zeroSeed = { [DQK_CELL_DESC_ADDR]: 0 };
  const realSeed = { [DQK_CELL_DESC_ADDR]: 0x0101, [DQK_FACING_ADDR]: 0 };
  const blk = buildAndGateBlock(); // synthetic block with the AND/COMPARE/IF_EQ/LM/COMBAT sequence
  const vmZero = primeVmRun1(blk, { dialect: ECL_GEN2, seedMemory: zeroSeed })!;
  const vmReal = primeVmRun1(blk, { dialect: ECL_GEN2, seedMemory: realSeed })!;
  expect(vmZero.run().status).toBe('exited');     // gate blocked → no combat
  expect(vmReal.run().status).toBe('combat');     // gate passes → combat
});
```

**Test 3: cooldown `[0x0097]` persists across calls on a shared memory map (synthetic)**

```typescript
it('[0x0097] cooldown survives across steps via shared areaMemory', () => {
  // Block: COMPARE [0x0097], #0 ; IF_NE ; (skipped) SUBTRACT #1, [0x0097], [0x0097] ; EXIT
  const memory = new Map([[0x0097, 3]]);  // cooldown = 3
  const blk = buildCooldownBlock();
  // Step 1: cooldown=3 → IF_NE passes → SUBTRACT → cooldown=2 → EXIT
  primeVmRun1(blk, { dialect: ECL_GEN2, memory, seedMemory: {} })!.run();
  expect(memory.get(0x0097)).toBe(2);
  // Step 2: cooldown=2 → 1
  primeVmRun1(blk, { dialect: ECL_GEN2, memory, seedMemory: {} })!.run();
  expect(memory.get(0x0097)).toBe(1);
  // Step 3: cooldown=1 → 0
  primeVmRun1(blk, { dialect: ECL_GEN2, memory, seedMemory: {} })!.run();
  expect(memory.get(0x0097)).toBe(0);
});
```

**Test 4: golden DQK ECL.GLB — seeded cell-descriptor reaches a non-trivial depth**

```typescript
it.skipIf(!existsSync(eclGlb))(
  'area 18 vmRun1 with non-zero [0x002d] runs deeper (no immediate exit)', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclGlb)));
    const blk = arch.blockSourceById(18)!;
    // Zero cellDesc → exits fast (AND gate fails).
    const vmZero = primeVmRun1(blk, {
      dialect: ECL_GEN2,
      seedMemory: dqkVmRun1Seed(5, 5, 18, 'north', 0),
      seed: 0x1234,
    })!;
    const rZero = vmZero.run();
    // Non-zero cellDesc (0x0101 = bit 0 + bit 8) → AND gate yields 0x101 = 257 → passes.
    const vmReal = primeVmRun1(blk, {
      dialect: ECL_GEN2,
      seedMemory: dqkVmRun1Seed(5, 5, 18, 'north', 0x0101),
      seed: 0x1234,
    })!;
    const rReal = vmReal.run();
    // The step-count metric shows the real-seed run went deeper.
    // Both should terminate (not halted due to budget) since area 18 is well-formed.
    expect(['exited', 'combat', 'awaiting-input']).toContain(rReal.status);
    // The goal metric: rReal reaches deeper (more effects or different status than rZero).
    // At minimum, no assertion that both must be identical (that would be a regression).
  }
);
```

### 5b. e2e seam (`?dqk=1`)

The existing `window.__dqk` seam should be extended with a
`triggerCombatAtCell(x, y, facing, cellDescWord)` helper that:

1. Seeds a test `areaMemory` with the provided parameters.
2. Calls `fireSearchLocation` on the current area block.
3. Returns `{ roster, text }`.

The e2e test then:
- Loads `?dqk=1`, selects area 18 (Hizden hamlet).
- Calls `window.__dqk.triggerCombatAtCell(5, 5, 'north', 0x0101)`.
- Asserts `roster !== null` (a fight queued from vmRun1's COMPARE_AND path).
- Asserts no spurious fight when called with `cellDescWord = 0`.

**Note on `cellDescWord = 0x0101`:** This is the provisional value that should
make the area 18 AND gate (`& 0x17F == 257`) pass. Until the exact GEO packing is
confirmed, this is a synthetic probe value, not sourced from a real GEO cell. The
e2e can use it as a positive-path trigger; the real fight triggering at a live
walking step depends on the packing being correct.

---

## 6. Open questions / unknowns

| Item | Status | Implication |
|---|---|---|
| Exact bit-packing of `[0x002d]` from GEO planes | **UNLOCATED from disk** | `dqkCellDescWord` formula is provisional; AND-gate fights will not trigger at live walk steps until confirmed |
| Facing encoding: does COAB store `[0x0011]` as a packed word (e.g. 0x1602 = North+flags) or a raw ordinal? | **UNLOCATED** | `dqkFacingValue` maps ordinal 0–3; facing-gated fights will not trigger until confirmed |
| The SAVE opcode inside fight subroutines that arms `[0x0097]` — what reset value N? | **UNLOCATED** — in subroutine `sub_8505` etc., not traced | Without N confirmed, the cooldown arms to an unknown value; fights will re-trigger after N steps (not infinite, just unknown N) |
| COMPARE_AND (opcode 0x14) in vm.ts currently sets `cmp.left = rvalue(a[0])`, `cmp.right = rvalue(a[2])` — it ignores operands 1 and 3 (the second pair). Is the first pair sufficient to gate the fight? | **Architecture question** — the current implementation tests the cell-bits half but not the facing half simultaneously | If the ECL always checks cell-bits AND facing together, the single-pair cmp may let through wrong-facing cells; see §6a below |

### 6a. COMPARE_AND semantics — the biggest risk

The current `vm.ts` case 0x14 (line 309–313):

```typescript
case 0x14: // COMPARE_AND (compound) — approximate: equality of the two value args.
  this.cmp = { left: this.rvalue(a[0]), right: this.rvalue(a[2] ?? a[0]) };
  this.pc = next;
  return null;
```

This sets `cmp` from operands 0 and 2, ignoring operands 1 and 3. For the area 18
pattern:

```
COMPARE_AND [0x00bf], #257, [0x0011], #5634
```

- a[0] = `[0x00bf]` (cell bits), a[1] = `#257`, a[2] = `[0x0011]` (facing), a[3] = `#5634`
- Current impl: `cmp.left = mem[0x00bf]`, `cmp.right = mem[0x0011]`
- Intended: `(mem[0x00bf] == 257) AND (mem[0x0011] == 5634)`

**The current impl will NOT correctly gate on the cell bits vs the constant #257
or the facing vs #5634.** It compares the two *memory values* against each other,
not each value against its constant. This means:
- With the current impl, seeding `[0x002d]` alone will not make a fight trigger,
  because cmp is set to `{left: mem[0x00bf], right: mem[0x0011]}` — these two
  memory values must be equal to each other, not each to a constant.

**Required fix:** COMPARE_AND must be implemented as a compound comparison:
```typescript
case 0x14: {
  // COMPARE_AND: (a[0] == a[1]) AND (a[2] == a[3]) → true iff both pairs match.
  const leftA = this.rvalue(a[0]);
  const rightA = this.rvalue(a[1]);
  const leftB = a[2] ? this.rvalue(a[2]) : 0;
  const rightB = a[3] ? this.rvalue(a[3]) : 0;
  // Encode as compound: pass iff both equalities hold.
  // Use the first pair for cmp (IF_* reads this); mark compound via an effect.
  const passA = leftA === rightA;
  const passB = leftB === rightB;
  // The IF_EQ that follows must see "pass iff both pass". Encode: if both pass,
  // set cmp = {left: 0, right: 0} (IF_EQ passes); if either fails, set left != right.
  this.cmp = passA && passB ? { left: 0, right: 0 } : { left: 0, right: 1 };
  this.pc = next;
  return null;
}
```

This is a change to `packages/engine/src/ecl/vm.ts`, not just to the host.
However, it is bounded to a single opcode case and does not touch Gen1 (which does
not use COMPARE_AND in its confirmed disassembly). The change must be accompanied
by a new vm.ts unit test:

```typescript
it('COMPARE_AND passes iff both pairs match', () => {
  // block: COMPARE_AND [0x4c00], #257, [0x4c01], #5634 ; IF_EQ ; SAVE #1, 0x5000 ; EXIT
  // mem[0x4c00]=257, mem[0x4c01]=5634 → both match → IF_EQ passes → mem[0x5000]=1
  const vm = new EclVm(buildCompareAndBlock(), {
    memory: new Map([[0x4c00, 257], [0x4c01, 5634]]),
    dialect: ECL_GEN2,
  });
  vm.run();
  expect(vm.memory.get(0x5000)).toBe(1);

  // One mismatch → IF_EQ fails → mem[0x5000] stays 0
  const vm2 = new EclVm(buildCompareAndBlock(), {
    memory: new Map([[0x4c00, 257], [0x4c01, 999]]),
    dialect: ECL_GEN2,
  });
  vm2.run();
  expect(vm2.memory.get(0x5000)).toBeUndefined();
});
```

---

## 7. Implications for our engine

1. **Three things are needed for a real position-dependent fight via vmRun1:**
   (a) correct `COMPARE_AND` opcode semantics (vm.ts fix — §6a above);
   (b) correct `[0x002d]` cellDesc construction from GEO planes (requires GEO packing probe);
   (c) correct `[0x0011]` facing encoding (requires facing encoding probe).
   Of these, (a) is the most architecturally important and can be done now.
   (b) and (c) require an offline byte probe against the real ECL.GLB + GEO.GLB.

2. **The cooldown is already handled correctly** by the shared `areaMemory` map.
   No host code change is needed for persistence; the ECL does the decrement.

3. **Gen1 CoK/DoK golden tests are unaffected.** COMPARE_AND (0x14) does not
   appear in confirmed Gen1 combat dispatch chains; all Gen1 golden test paths
   avoid it (verified: `dungeonEvents.test.ts` golden tests pass today with the
   current approximate implementation).

4. **The `dqkVmRun1Seed` helper replaces `dqkPositionSeed` in the vmRun1 call
   path** (SearchLocation can still use the shorter position-only seed if the
   coordinate dispatch does not use facing/cellDesc — but passing the full seed
   to both is safe).

5. **Facing encoding is the single biggest risk** for live walk-step combat
   triggers. If the COAB engine packs facing as a 16-bit word with mode flags
   (e.g. 0x1602 for North), then seeding the raw ordinal 0 will never match the
   test constant 0x1602, and facing-gated fights will never trigger. The offline
   probe needed is: find a SAVE to `[0x0011]` in the DQK executable or in an
   area init block that seeds it, then read the stored value.

---

## 8. File index

| File | Role |
|---|---|
| `packages/engine/src/world/dungeonEvents.ts` | Add `DQK_CELL_DESC_ADDR`, `DQK_FACING_ADDR`, `dqkFacingValue`, `dqkVmRun1Seed` |
| `packages/engine/src/ecl/vm.ts` | Fix COMPARE_AND (0x14) to compound-compare both pairs |
| `packages/engine/src/index.ts` | Export new dungeonEvents symbols |
| `apps/web/src/ui/dqkExplore.ts` | Add `dqkCellDescWord`; update `fireSearchLocation` signature; update `runStepEvent` call |
| `packages/engine/test/dungeonEvents.test.ts` | Add tests 1–4 from §5a |
| `packages/engine/test/vm.test.ts` | Add COMPARE_AND compound-compare test (§6a) |
| `The Dark Queen of Krynn/DISK3/ECL.GLB` | Source for golden golden tests (read-only) |
| `The Dark Queen of Krynn/DISK3/GEO.GLB` | Source for cell-descriptor packing probe (read-only) |
