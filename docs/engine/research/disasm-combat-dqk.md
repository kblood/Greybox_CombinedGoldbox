# DQK.EXE Combat Disassembly — The Dark Queen of Krynn (Gold Box "Gen2")

**Target:** `The Dark Queen of Krynn/DQK.EXE` (DOS / GOG release, 449,664 bytes, MZ).
**Tool:** `tools/disasm_dqk.py` (capstone 5.0.7, `CS_MODE_16` real-mode).
**Rosetta:** COAB (Gen1) decompile in `coab_extracted/`; distilled in
`docs/engine/research/combat-mechanics-coab.md`. **Method:** clean-room — only DQK's own
bytes are reported below; COAB used solely as a map of *what* to look for.

> Status of evidence: all file offsets, byte patterns, and disassembly below were produced
> directly from `DQK.EXE` via `tools/disasm_dqk.py` and the ad-hoc capstone scans recorded
> in this doc. Field-offset *semantics* (e.g. "0xB3 = status") are **inferred** from code
> behaviour and cross-checked against COAB's enum, and are labelled (inferred) where so.

---

## 1. DQK.EXE structure & how the code image was extracted

### 1.1 MZ header (verified — `disasm_dqk.py --info`)

| Field | Value |
|-------|-------|
| Signature | `MZ` |
| Header size | 576 paragraphs = **0x2400 (9216) bytes** |
| Pages / last-page | 269 / 213 → **MZ load image ends at file 0x218D5 (137,429 B)** |
| File size | **449,664 B** → **~312 KB tail beyond the MZ image** |
| Relocations | 2291 (table at 0x1E), target segs 0x0000–0x1EEF |
| CS:IP (entry) | 0x1D99:0x076C → file **0x204FC** |
| SS:SP | 0x3FE4:0x0400 |

### 1.2 It is a **Borland overlay** EXE — but NOT the INT 3Fh scheme

- **Proof of overlays:** Borland overlay-runtime error strings are present at file
  **0x1FDC0**: `eov0001: Cannot find overlay file "`, `eov0002: Open error on overlay file "`,
  `eov0003:` (Borland's `_OvrInitEms`/loader messages).
- **NOT classic INT 3Fh:** the whole file contains **zero `CD 3F` bytes** — none of the
  textbook Borland `INT 3Fh; dw entry; dw size` thunks. DQK uses the **far-call vector**
  overlay variant: each overlaid segment is stored *contiguously in the file tail* and is
  reached through per-segment tables of `(dw offset, dw runtime_seg)` records. Example: a
  174-entry table at file **0x218E0** whose records all carry segment **0x1F4E** (the first
  overlay code segment, mapping to file 0x218E0 = `hdr + 0x1F4E*16`). 60-plus such tables
  exist (one per overlaid segment). The `eov`/`overlay` strings + the absence of INT 3Fh are
  consistent with the **Borland overlay manager driven by patched far-call thunks**, not
  software interrupts.
- **No paging from DISK1/2/3:** combat *code* is wholly inside `DQK.EXE`. The `.GLB`/`.TLB`
  files hold *data* (TILE/DATA/DIG4); the `eov` strings refer to swapping overlay segments
  out of `DQK.EXE`'s own tail into an in-RAM (or EMS) buffer, not loading from the DAT/GLB.

### 1.3 Code-extraction method used here

`disasm_dqk.py` treats the file as a **flat image addressable by raw file offset** and lets
capstone disassemble any window. A segment `S` in the original load module maps to
`file_off = 0x2400 + S*16`; far-call targets in the disasm were resolved with that formula.
This is sufficient to read every routine because the overlaid code is **present verbatim in
the file tail** (no compression) — overlay swapping only relocates it at runtime.

### 1.4 Code-segment map (verified by code-density scan, prologue/`retf`/`les` counts)

| File region | Contents |
|-------------|----------|
| 0x02400–0x218D5 | MZ resident image: Borland C startup (entry 0x204FC), root code, DGROUP init, reloc table |
| ~0x06000–0x21000 | Resident library / engine helpers. **`roll_dice` = `0x48F:0x1968` (file 0x8658)**; **field-accessor `0x77E:0x2234` (file 0xBE14)** |
| **0x50000–0x62FFF** | **COMBAT OVERLAY CODE** (dense function prologues `55 8B EC`, `retf`, `les`) — initiative/turn loop, morale, status/death, attack resolution |
| **0x63000–0x6C800** | **Combat string pool** (data; near-zero code density) — all combat text |
| 0x6C800–EOF | further overlay data |

---

## 2. Located combat routines (offsets + anchors)

### 2.1 Combat string pool (anchors; verified via `--find`)

| File off | String |
|----------|--------|
| 0x68474 | `speed (0=fastest 9=slowest) = ` ← **initiative/speed prompt** |
| 0x68480 | `the party makes camp`, `attack ally? `, `Aim: range = `, `magic on/off` |
| 0x69206 | `dies from age`, `to the ground` |
| 0x6933F | `Your Teammate is Dying`, `Move/Attack, Move Left = ` |
| 0x6951A | `-Backstabs-`, `slays helpless`, `Attacks`, `(from behind) `, `with one cruel blow` |
| 0x69806 | `flees in panic`, `Move/Attack, Move Left = %s`, `Magic On/Off` |
| 0x6B18C | ` is hit FOR `, ` points of Damage`, ` dies` |

These confirm DQK's combat *vocabulary* matches the Gold Box family (Backstabs, from behind,
flees, "is hit FOR … points of Damage"). **Note:** strings are addressed via the overlay's
own data segment, *not* by stored far pointers (a brute-force far-pointer search found none),
so string→code xref is done structurally (by routine, not pointer table).

### 2.2 Central primitives (verified disassembly)

- **`roll_dice(count, sides)` — `0x48F:0x1968`, file 0x8658.** Loops `count` times; each
  iteration calls inner RNG `0xDF9:0x44D`, `inc ax` (→1..sides), sums in `si`. Returns the
  sum. **Called 127× across the binary** — the engine's universal dice source. (Matches the
  Gold Box `roll_dice` idiom; same shape as COAB.)
- **Combatant field accessor — `0x77E:0x2234`, file 0xBE14.** Reads
  `es:[bx + 0xA5]` for the combatant at `[bp+6]`+index `[bp+0xA]`, returns `max(field,0)`.
  Used by both the morale and the turn/speed routines → **field 0xA5 is a per-combatant
  combat attribute** (inferred: speed/initiative or an action counter; COAB's `initiative`
  sat at 0x1A5 — DQK's struct is re-based, see §4).

### 2.3 Morale / type routine — **file 0x62962–0x62B7F** (verified)

Walks the combatant linked list (`les bx,[bx+8]` = next pointer at struct off 8). Per node:

```
06297E  cmp byte ptr es:[bx+0x38], 0x80     ; gate: monster-under-AI test
062983  jbe  skip                            ; (PC if <= 0x80)
062985  cmp byte ptr es:[bx+0x32], 0         ; secondary gate (active?)
06298C  mov al, es:[bx+0x38]
062990  and al, 0x7F                          ; mask control/morale bits
062992  mov [bp-9], al
062995  cmp [bp-9], 6                          ; compare masked value to 6
```

Then indexes a **110-byte-stride table at `ds:0x13CC`** (`mov dx,0x6E; mul dx; add bx,0x13CC`)
with **5-byte sub-records**, and writes/clamps a counter at **`es:[bx+0x8B]`** to ≤ 0x15 (21),
seeded to 0x14 (20). A reaction/morale outcome is fetched via `0x77E:0x2234` (the `+0xA5`
accessor) and the per-monster table.

**Interpretation (inferred):** field **0x38** is DQK's `control_morale` analogue (high bit
= monster/AI flag, low 7 bits = morale, exactly the COAB `& 0x7F` idiom). But the **struct
offset is 0x38, not COAB's 0xF7**, and the masked value is compared to **6** and used to
*index a per-monster reaction table at `ds:0x13CC`* rather than COAB's inline
`(x&0x7F)*2`, clamp-to-102, vs-%HP-lost arithmetic. **This is a Gen2 divergence** (table-
driven reaction vs Gen1 inline percentage).

### 2.4 Status / death routine — **file ~0x624F8–0x625FF** (verified)

A per-combatant loop with a **CS jump table** (`jmp word ptr cs:[bx+0x89B]`) that writes a
**status/condition byte to `es:[bx+0xB3]`** based on damage/severity thresholds:

```
0625A2  cmp [bp-3], 0x0C        ; severity vs 12
0625A6  jbe ...
0625AB  mov byte ptr es:[bx+0xB3], 4     ; status := 4   (COAB enum: 4 = unconscious)
0625B3  cmp [bp-3], 7          ; vs 7
0625BC  mov byte ptr es:[bx+0xB3], 3     ; status := 3   (COAB enum: 3 = running/fleeing)
0625C2  cmp [bp-3], 0x0E        ; vs 14
```

Also reads `es:[bx+0x19B]` (==6 test) and `es:[bx+0x58]` (==3/4/5 tests) — additional
condition/type fields. **Field 0xB3 = combatant status byte** (inferred). The thresholds
(7, 12, 14) gate which status is written.

**Critical finding:** a whole-combat-code scan for the **COAB death buffer "+10"**
(`05 0A 00` / `04 0A` / `83 C0 0A` = `add ax,10`) returned **zero hits in 0x50000–0x63000**.
DQK does **not** use COAB's `damage >= hp_current + 10` literal. Its death/unconscious
decision is driven by the **threshold jump-table above** (constants 7/12/14 on a severity
value), not the Gen1 "+10 below zero" rule. **This is a Gen2 divergence** (see §3.3).

### 2.5 Turn / speed routine — **file ~0x5EDD0–0x5F017** (verified)

Reads combat globals `[0xAD67]/[0xAD69]` (current combatant far ptr) and `[0xAE57]`
(==5 underwater/special-mode test), calls the field accessor `0x77E:0x2234` with indices
5 and 6, and a percentage roll `roll(1,100)` via `0x48F:0x1968` with `cmp ax,0x4B` (75)
and `cmp al,9` bounds. This is the per-turn action dispatch tied to the
`speed (0=fastest 9=slowest)` prompt — i.e. DQK exposes a **0–9 speed scale** for ordering.

---

## 3. Per-mechanic verdicts (DQK's own code vs our COAB-grounded `tactical.ts`)

### 3.1 INITIATIVE — **DIFFERS (Gen2) / PARTIALLY UNLOCATED**

- DQK has an explicit **speed value on a 0–9 scale** (string 0x68474 `0=fastest 9=slowest`),
  and a per-combatant attribute read via `0x77E:0x2234` at **struct field 0xA5**. This is a
  **stored per-combatant value**, consistent with our engine's "stored initiative, not
  per-round d10" assumption.
- **UNLOCATED:** the explicit haste-`×2` / slow-`÷2` modification on this value was not
  pinned to a specific instruction in combat code (scans for `shl/shr al,1` on the speed
  field were inconclusive). The 0–9 *inverted* scale (0 = fastest) is itself a **Gen2
  presentation difference** from COAB's higher-is-faster `initiative` byte.
- **Verdict:** stored-value model **VERIFIED-MATCHES-COAB**; the *scale/encoding* (0–9,
  0=fastest) and the *modifier site* **DIFFER/UNLOCATED**.

### 3.2 DIAGONAL MOVEMENT — **UNLOCATED**

No "half-steps (ortho=2, diag=3)" arithmetic was isolated in the combat code window in the
time budget. The "Move/Attack, Move Left = %s" UI (0x6933F/0x69806) confirms a **half-move
budget displayed to the player**, consistent with COAB's half-step accounting, but the
diagonal-cost constant (3 vs 2) is **UNLOCATED** in DQK. Treat the 1.5× diagonal rule as
**assumed-from-COAB, unverified for DQK**.

### 3.3 DEATH / UNCONSCIOUS — **DIFFERS (Gen2)**

- DQK writes a **status byte at struct offset 0xB3** via a **threshold jump table**
  (constants 7 / 12 / 14 on a severity value), with **status 4 = unconscious, 3 = fleeing/
  down** (COAB enum mapping; inferred).
- The **COAB literal `damage >= hp + 10` death rule is ABSENT** (zero `add …,10` in combat
  code). DQK resolves "down vs dead vs fleeing" through the threshold table, not the Gen1
  +10 buffer.
- **Verdict: DIFFERS.** The *concept* (a status byte with unconscious/dying/dead states)
  matches COAB; the *decision arithmetic* is Gen2-specific (table thresholds, no +10).
  The exact mapping of severity→status and where HP hits 0 vs negative needs a follow-up
  trace of the routine that feeds `[bp-3]` into 0x624F8.

### 3.4 ATTACKS PER ROUND (fractional 3/2) — **UNLOCATED**

The dice roller and attack-text anchors (`Attacks`, `-Backstabs-`, `with one cruel blow`,
` is hit FOR … points of Damage`) are present, but the **half-attack counter + round-parity
credit** (COAB's `attacksCount` in halves, `combat_round & 1`) was not isolated:
combat-code scans for `test al,1`/`and al,1` on a round counter found only map-tile code.
**Verdict: UNLOCATED** — neither confirmed nor refuted for DQK. The `and al,1` sites in
combat code (0x53A6D, 0x60EF6) are tile/parity-of-position, not attack fractions.

### 3.5 MORALE — **DIFFERS (Gen2)**

- DQK's morale gate uses **`field_0x38 & 0x7F`** (the COAB `control_morale & 0x7F` idiom,
  but at offset **0x38** not 0xF7) and the high bit as the monster/AI flag — **structurally
  the same masking** → the percentage-style morale family is **VERIFIED in spirit**.
- **But** DQK compares the masked value to **6** and drives the outcome through a
  **per-monster reaction table at `ds:0x13CC` (110-byte records, 5-byte sub-entries)** with
  a counter clamped to 21 at `es:[bx+0x8B]` — **not** COAB's inline `(x&0x7F)*2`, clamp-102,
  vs-%HP-lost computation. **This is a Gen2 divergence: table-driven reaction vs Gen1 inline
  percentage.**
- **Verdict: DIFFERS** (same mask idiom, different evaluation + struct offset).

---

## 4. Gen2-specific differences vs the Gen1/COAB model

1. **Combatant struct is re-laid-out and more compact.** Confirmed Gen2 offsets from DQK's
   own code: linked-list `next` at **+8**; morale/control byte at **+0x38** (COAB 0xF7);
   secondary gate **+0x32**; status byte **+0xB3**; condition fields **+0x58**, **+0x19B**;
   morale counter **+0x8B**; combat attribute (speed/init) **+0xA5** (COAB 0x1A5). The
   COAB offsets (0x1A4 HP, 0x19A AC, 0x11C attacksCount, 0xF7 morale) **do not transfer** —
   the engine must use a DQK-specific field map.
2. **Morale/reaction is table-driven** (`ds:0x13CC`, 110-byte per-type records), replacing
   COAB's inline percentage arithmetic.
3. **Death/status is jump-table + threshold-driven** (constants 7/12/14 on a severity
   value); **the COAB `+10` negative-HP buffer is absent**.
4. **Initiative is a 0–9 "speed" scale, 0 = fastest** (inverted vs COAB's higher-is-faster
   byte), surfaced to the player via a prompt string.
5. **Overlay delivery differs even from COAB-era SSI:** DQK is a single ~449 KB EXE with a
   Borland **far-call (non-INT-3Fh) overlay** tail, whereas CoK/DoK ship a separate
   `GAME.OVR`. Combat code is in an overlay segment at file 0x50000–0x63000.

(All other Gold Box constants — `roll_dice`, half-move UI, Backstab/from-behind text,
"is hit FOR … points of Damage" — are present and consistent with the family.)

---

## 5. Delta table: what `tactical.ts` needs for DQK

| Mechanic | Our engine's COAB-based assumption | DQK verdict | Action for `tactical.ts` (DQK ruleset) |
|----------|-----------------------------------|-------------|----------------------------------------|
| Initiative | stored value, ×2 haste ÷2 slow, high-first | DIFFERS: 0–9 speed, **0=fastest** | Use a 0–9 speed key, sort **ascending**; haste/slow modifier site UNLOCATED — keep COAB ×2/÷2 as provisional |
| Diagonals | ortho=2, diag=3 half-steps | UNLOCATED for DQK | Keep COAB rule provisionally; flag as unverified for DQK |
| Death/unconscious | dead iff `damage ≥ hp+10`; else unconscious | DIFFERS: threshold jump-table (7/12/14) → status@0xB3; **no +10** | Replace +10 rule with a DQK severity→status table; status enum 3=down/flee, 4=unconscious (inferred) |
| Attacks/round | half-attacks, parity credit | UNLOCATED for DQK | Keep COAB fractional model provisionally; verify before trusting |
| Morale | `(ctrl&0x7F)*2`, clamp 102, vs %HP-lost | DIFFERS: `field0x38&0x7F`, vs **6**, **table@ds:0x13CC** | Implement table-driven reaction (110-byte/type records) rather than inline % ; preserve the `&0x7F` + high-bit-monster gate |
| Struct field map | COAB offsets (HP 0x1A4, morale 0xF7, init 0x1A5 …) | DIFFERS | Use **DQK offsets** when loading DQK combatants: next +8, morale +0x38, status +0xB3, speed/attr +0xA5, gate +0x32, counter +0x8B |

---

## 6. Open questions / unknowns

| # | Question | Status |
|---|----------|--------|
| OQ-1 | Exact haste×2 / slow÷2 modification site for the 0–9 speed value | UNLOCATED |
| OQ-2 | Diagonal-cost constant in DQK (is it 3-vs-2 half-steps?) | UNLOCATED |
| OQ-3 | DQK severity→status mapping: what value feeds `[bp-3]` into the 0x624F8 status routine; where does HP reach 0 vs the "dies" branch | PARTIAL — routine found, inputs not fully traced |
| OQ-4 | Fractional attacks: how do the MONCHA half-attack bytes become attacks over two rounds? | PARTIAL — round-phase normalization established; execution consumer unresolved |
| OQ-5 | Full meaning of the `ds:0x13CC` 110-byte reaction records (5-byte sub-entries) | PARTIAL — layout seen, semantics inferred |
| OQ-6 | Confirm the DQK status enum values (is 4=unconscious, 3=fleeing as in COAB, or remapped?) | INFERRED from COAB enum, not proven in DQK |
| OQ-7 | Full combatant struct map for DQK (HP, AC, THAC0 offsets) — only morale/status/speed offsets pinned so far | OPEN |

---

## 7. Reproduce

```
python3 tools/disasm_dqk.py --info
python3 tools/disasm_dqk.py --find "flees in panic"
python3 tools/disasm_dqk.py --find "speed (0=fastest"
python3 tools/disasm_dqk.py --disasm 0x62962 --len 0x220   # morale/type routine
python3 tools/disasm_dqk.py --disasm 0x62560 --len 0x90     # status/death (writes +0xB3)
python3 tools/disasm_dqk.py --disasm 0x8658  --len 0x40     # roll_dice 0x48F:0x1968
python3 tools/disasm_dqk.py --disasm 0xbe14  --len 0x40     # field accessor 0x77E:0x2234 (+0xA5)
```

---

## 8. RE.2 follow-up traces (Q1-Q3)

> Second pass to pin OQ-1/OQ-3/OQ-5/OQ-6. Re-disassembly **corrects several
> first-pass inferences.** Every offset below is reproduced from `DQK.EXE` (see the
> commands at the end). Tags: **VERIFIED** = read directly from the bytes; **INFERRED**
> = behaviour-deduced; **UNLOCATED** = not found in budget.

### 8.0 The big correction: the "0x624E1 / 0x62760 / +0xB3" routine is an AFFLICTION TICKER, not the damage-death routine

Full function bounds: **0x624E1-0x62632** (prologue `push bp;mov bp,sp;sub sp,0xA` at
0x624E1). Args `[bp+6]`/`[bp+8]` = far ptr to combatant. Structure (VERIFIED):

```
0624ea mov byte es:[bx+0x87],0                 ; clear "worst severity" accumulator
0624f0 mov [bp-6],0                            ; index = 0
        loop body 0x624f8..0x625cb, index [bp-6] = 0..6 (cmp [bp-6],6; jg)
0624f8 lcall 0x77E:0x2234 (arg index=[bp-6])   ; al = max(combatant[0xA5+index], 0)
062509 mov [bp-3],al                           ; <<< [bp-3] = the AFFLICTION-COUNTER value
062528 add bx,0x6359 ; ... es:[bx+0x87]        ; ds:0x6359 table (0x16 stride) -> running max into +0x87
06257c dec ax; cmp ax,3; ja 0x625c8            ; dispatch on (index-1), 4 entries
062586 jmp word cs:[bx+0x89b]                  ; jump table @ file 0x6258b
```

Jump-table words at file 0x6258b = `08a3 08a3 08a3 08c3` (cs base = 0x6258b-0x89b =
**file 0x61CF0**), so index 1/2/3 -> file **0x62593**, index 4 -> file **0x625B3**
(both VERIFIED resolved). Targets:

```
; index 1,2,3  (0x62593), v=[bp-3]=affliction counter:
062593 cmp [bp-3],6  ; ja: es:[bx+0xB3]:=3
0625a2 cmp [bp-3],0xC; ja: es:[bx+0xB3]:=4
; index 4      (0x625B3):
0625b3 cmp [bp-3],7  ; ja: es:[bx+0xB3]:=3
0625c2 cmp [bp-3],0xE; ja: es:[bx+0xB3]:=4
```

The twin routine at **0x62765** is identical in shape but reads the **+0xAC** bank
(`field[0xAC+i]`), dispatches `jmp cs:[bx+0xa96]`, thresholds 7/15/8, writing the same
+0xB3 in {3,4}.

**Therefore `[bp-3]` is the magnitude of an affliction/condition DURATION counter from
the +0xA5 / +0xAC banks - NOT overkill, raw damage, current HP, or a to-hit roll.**
(VERIFIED.) The accessor `0x77E:0x2234` (file 0xBE14) is a **generic bank reader**:
`return max(combatant[0xA5 + index], 0)` (VERIFIED disasm 0xBE14). The first-pass claim
that 0xA5 is a single "speed" scalar is **wrong** - 0xA5..0xAB (and 0xAC..) are arrays
of per-condition counters. Confirmed by 0x56365/0x56388/0x563BB, which test
`+0xAA/+0xAB/+0xA9 != 0` and then `roll(1,sides)` - one saving-throw-style roll per
active condition.

### 8.1 Q1 - DEATH vs UNCONSCIOUS - status byte +0xB3 (PARTIAL / death-flag UNLOCATED)

(a) **What feeds `[bp-3]`** = an **affliction-duration counter** (`max(combatant[0xA5+i],0)`),
clamped to 0x15 (21) at 0x6250C. **VERIFIED.** It is *not* damage and not HP.

(b) **+0xB3 enum actually written by DQK:** only **3 and 4** are ever stored to +0xB3
in the entire combat overlay (writers at 0x6259C, 0x625AB, 0x625BC, 0x6279F, 0x627B0 -
VERIFIED by exhaustive scan; default/unset = 0). So +0xB3 is a **transient
condition/display status**, with the worse magnitude -> **4**, the milder -> **3**.
Mapping a +0xB3 value to "permanently DEAD" is **UNLOCATED**: DQK never writes a
distinct "dead" constant to +0xB3, and the COAB enum (4=unconscious) is the only basis
for reading 4 as "unconscious" - **INFERRED, not proven in DQK's bytes.**

The genuine multi-state status enum is the **word at +0x58**, compared against
`0,1,3,4,5,6,7` across combat (0x5C1FF `==7`, 0x62A72 `==3/5/4`, 0x515CC `==6`, etc. -
VERIFIED reads). But +0x58 receives **no `mov [reg+0x58],imm` write anywhere in
0x40000-0x6C000** (VERIFIED null scan) and is *also* dereferenced as a pointer
(`mov bx,es:[bx+0x58]`, `lds si,[si+0x58]`) - so +0x58 is **context-dependent** (status
in some structs, a link/handle in others) and the precise numeric DEAD code is
**UNLOCATED** in this budget.

(c) **Concrete DQK rule we can prove:**
- A combatant's **transient condition status +0xB3** is set per affliction tick:
  `+0xB3 := 4` when an affliction-bank counter exceeds the high threshold
  (12 for the +0xA5 bank / 15 for the +0xAC bank), `:= 3` when it exceeds the low
  threshold (6 / 7 / 8). **VERIFIED.** Reading 4~="unconscious/down-hard",
  3~="impaired/fleeing-class" is **INFERRED from COAB**.
- The HP<=0 -> **permanently DEAD** decision was **NOT located** in the combat overlay in
  this pass. Candidate HP/word field is **+0x4c** (12 `cmp word [bx+0x4c],0` sites,
  heaviest around the turn/action region 0x5D000-0x5F800; written via add/sub) - but
  this is **INFERRED/UNVERIFIED** as HP. **Q1(b/c) death-flag: UNLOCATED.** Do **not**
  hard-code a DQK "dead == N" constant from this trace.

### 8.2 Q2 - HASTE / SLOW direction (UNLOCATED; premise corrected)

The string at file 0x68474 is **"Game Speed (0=fastest 9=slowest)"** (VERIFIED via
`--find`), adjacent to "party order"/"game speed" config text at 0x6889D. This is a
**global game/animation-speed preference (0-9)** - a UI setting - **not** a per-combatant
initiative scalar. The first-pass association of "0-9 speed" with struct +0xA5 was a
**conflation**: +0xA5 is the affliction bank (8.0), not a turn-order speed.

A dedicated per-combatant initiative field, and any haste-x2 / slow-/2 (or additive)
modification of it, was **NOT located**. The turn routine (0x5EDD0-0x5F017) reads the
+0xA5 bank at indices 0/5/6 (0x5EEB6/0x5EED1/0x5EEEB) purely as **condition checks**
(`index 6 > 9 -> roll(1,100)`), not as a speed sort key. No `shl/shr`/x2//2 on a
speed field was isolated. **Direction of haste/slow: UNLOCATED.** Keep the engine's
provisional COAB model and flag it unverified for DQK.

### 8.3 Q3 - MORALE / FLEE (refined; mechanism VERIFIED, flee-emit UNLOCATED)

Routine **0x62962-0x62B8B** is the **morale-counter accumulator**, not the flee emitter.
Decoded behaviour (VERIFIED):

- **Pre-scan** (0x6297B-0x629BD): walk the combatant list; for each **monster**
  (`+0x38 > 0x80`, 0x6297E) that is **active** (`+0x32 != 0`, 0x62985), compute
  `masked = +0x38 & 0x7F` (0x62990). The `cmp masked,6` at **0x62995 is an EQUALITY
  test** - `jne` at 0x62999 sets a one-shot flag `[bp-3]` to **1 iff masked == 6**, else
  0. So **6 is a specific control/disposition value** (an enum slot, e.g. a particular
  AI/allegiance state), **not** a "morale < 6" threshold. The first-pass "< 6 vs <= 6"
  framing is **wrong** - it is `== 6`. (VERIFIED.)
- **Main loops:** `[bp-0xe]` = party-member index 0..4, `[bp-0xc]` = condition index
  0..6. Per member it **seeds `+0x8b := 0x14 (20)`** (0x629CD), then reads
  `field[0xA5 + idx]` via the accessor, clamps to 0x15 (21), indexes the
  **`ds:0x13CC` table, 0x6E(110)-byte records, 5-byte sub-records** (`mul 0x6E`,
  `mul 5`, 0x62A0A-0x62A24), reads a byte and **clamps the counter DOWN** to it
  (`cmp tbl,+0x8b; jae skip; +0x8b := tbl`, 0x62A2C-0x62A61). Then, dispatching on
  **`+0x81`** (two jump tables: `cs:[bx+0xdbb]` after `sub 4;cmp 0xe`, and
  `cs:[bx+0xe3d]` after `sub 0x13;cmp 6`), it **ADDS 1..5 to +0x8b** (0x62ACE..0x62B07
  and 0x62B40..0x62B6B). Net: `+0x8b` is a **morale/"resolve" pool**, seeded 20, pulled
  down by a per-monster-type reaction table and pushed up by the monster's
  type/affliction state (`+0x81`). (VERIFIED.)
- The `+0x58 == 3/5/4` test at 0x62A72 gates whether the party-target branch applies
  (combatant already in a fleeing/charmed-class status) - INFERRED.

**Flee-emit site:** the counter **+0x8b is only ever WRITTEN in this routine** - a
whole-overlay scan shows **no read/compare of +0x8b** that would convert it into the
"flees in panic" action (string 0x69806). So the actual *break/flee decision* that
consumes +0x8b lives **outside the combat overlay** (resident AI code) and is
**UNLOCATED** here.

**Concrete rule a TS engine can implement (faithful-simplified, parts INFERRED):**
- Maintain a per-monster morale pool `M`, **seed 20** at the start of a morale check.
- For each condition slot, **clamp `M` down** to a per-monster-type reaction value
  (the `ds:0x13CC` 110-byte / 5-byte-subrecord table - exact field semantics still
  INFERRED), then **add a type-dependent penalty of 1-5** based on the monster's state
  field (`+0x81`).
- A monster is in the **morale-check population only if** it is AI-controlled
  (`+0x38 > 0x80`) and active (`+0x32 != 0`); disposition value `(+0x38 & 0x7F) == 6`
  is handled specially. (VERIFIED gates.)
- **Break/flee when the resolved pool falls below the monster's hold threshold** -
  exact comparison **INFERRED** (the consuming compare is outside the traced overlay);
  lower `M` = closer to fleeing. Treat the numeric break point as a tunable until the
  resident-code consumer is located.

### 8.4 Updated open-question status

| OQ | New status |
|----|-----------|
| OQ-1 (haste/slow on speed) | **UNLOCATED** + premise corrected: the 0-9 "speed" is a **global Game-Speed UI setting** (0x68474), not per-combatant initiative. No per-combatant initiative field or x2//2 site found. |
| OQ-3 (severity->status input) | **RESOLVED (partial):** `[bp-3]` = affliction-bank **duration counter** (`max(combatant[0xA5+i],0)`), not damage/HP. +0xB3 thresholds: low 6/7/8 -> 3, high 12/15 -> 4. **HP<=0 death site still UNLOCATED.** |
| OQ-5 (ds:0x13CC table) | **Refined:** table is a per-monster-type **morale-reaction** table (110-byte records, 5-byte sub-records) that clamps a seed-20 morale pool at +0x8b; +0x81 drives +1..+5 penalties. Flee-emit consumer UNLOCATED. |
| OQ-6 (status enum 4=unconscious / 3=fleeing) | **Still INFERRED from COAB.** DQK writes only 3 and 4 to +0xB3; no distinct DEAD constant; numeric meaning not proven from DQK bytes. The word **+0x58** is the multi-value status enum but is also used as a pointer and has no imm writes -> precise DEAD code **UNLOCATED**. |

### 8.5 Reproduce (RE.2)

```
python3 tools/disasm_dqk.py --disasm 0x624e1 --len 0x160   # affliction ticker (+0xA5 bank -> +0xB3)
python3 tools/disasm_dqk.py --disasm 0x62593 --len 0x40    # +0xB3 threshold targets (clean decode)
python3 tools/disasm_dqk.py --disasm 0x62765 --len 0x80    # twin ticker (+0xAC bank)
python3 tools/disasm_dqk.py --disasm 0xbe14  --len 0x40    # accessor: max(combatant[0xA5+i],0)
python3 tools/disasm_dqk.py --disasm 0x62962 --len 0x220   # morale accumulator (seed 20, +0x8b)
python3 tools/disasm_dqk.py --disasm 0x62b0c --len 0x80    # morale +0x8b penalty jump table
python3 tools/disasm_dqk.py --disasm 0x5edd0 --len 0x140   # turn routine (+0xA5 idx 0/5/6 = conditions)
python3 tools/disasm_dqk.py --find  "fastest"              # "Game Speed (0=fastest 9=slowest)" @0x68474
```


---

## 9. RE.4 -- resident-code combat trace

> Pass RE.4 (2026-06-23). Targets: the four mechanics left UNLOCATED by RE.2 in the
> resident image (file 0x02400-0x218D5) and combat overlay (0x50000-0x63000). Tool:
> `tools/disasm_dqk.py` -- flat-file capstone disassembly, same method as RE.1/RE.2.
> All offsets are raw file offsets. Tags: **VERIFIED** = read from bytes; **INFERRED**
> = behaviour-deduced; **UNLOCATED** = not found after real scan.

---

### 9.1 Target 1 -- REAL DEATH TRIGGER (HP field + kill condition)

#### 9.1.1 HP field: +0x4c confirmed **VERIFIED**

The field **`es:[bx+0x4c]`** (word, per combatant slot) is the current-HP value.
Evidence:

**Write site** -- routine at **file 0x5F776** (near-call within the combat overlay):

```
05f783  mov ax, word ptr es:[bx + 0x4c]   ; load HP
05f787  sub ax, word ptr [bp + 0xa]        ; subtract damage (argument)
05f794  mov word ptr es:[bx + 0x4c], ax   ; write new HP
05f7a2  call 0x5f319                       ; update party-total field +0x56
```

**Read + pre-attack guard** -- at **file 0x5FAFB**:

```
05fafb  mov ax, word ptr es:[bx + 0x4c]   ; read HP before attack
05fb04  call 0x5f136                       ; determine attack disposition
```

**Overkill gate** -- at **file 0x5F35C**: compares `damage` (32-bit) against `+0x56`
(group-total HP); if `damage >= +0x56` branches to **file 0x5F402** (no HP write;
calls `0x77E:0x153C` and `0xa62:0x949` for status/XP handling). Otherwise subtracts
and writes the individual HP slot at `+0x4c + index*2`.

(INFERRED) The combatant struct for a monster group stores individual HPs in a
sub-array at `+0x4c[index*2]`. Field `+0x56` is the group HP total. If a single hit
exceeds the group total, the overkill path fires; otherwise the individual slot HP is
decremented.

#### 9.1.2 Death threshold: HP <= 0 (unsigned) **VERIFIED**

Three `cmp word es:[bx+0x4c], 0 / jbe` sites in the combat overlay:

```
05d741  cmp word ptr es:[bx + 0x4c], 0
05d746  jbe 0x5d74c                  ; sight-range guard: skip if HP=0

05f733  cmp word ptr es:[bx + 0x4c], 0
05f738  jbe 0x5f742                  ; inner loop: mark slot as dead

05fb39  cmp word ptr es:[bx + 0x4c], 0   ; post-attack all-dead scan
05fb3e  jbe 0x5fb44
05fb40  mov byte ptr [bp - 0x56], 0  ; clear "all alive" flag only if HP > 0
```

The loop at **0x5FB27-0x5FB4B** scans 3 combatant slots after each attack. If ANY slot
has HP (unsigned) > 0, `[bp-0x56]` is cleared. If all slots have HP <= 0, `[bp-0x56]`
stays 1 and the outer loop exits at **0x5FB65 -> 0x5FB6A retf** (combat resolved).

All three comparisons use `jbe` (unsigned). The overkill gate at 0x5F35C prevents
underflow (sub below 0 would wrap to a large unsigned number), so HP=0 is the death
condition in practice with no underflow risk.

**Verdict: VERIFIED.** DQK death rule = **HP (unsigned word at +0x4c) == 0 after
damage**. No "+10 negative-HP buffer" (confirmed absent, consistent with RE.2). The
affliction ticker at +0xB3 (RE.2 section 8.1) handles unconscious/impaired conditions
separately; these are NOT driven by HP < 0.

**What tactical.ts gen2 should do:** Track HP at `+0x4c` (unsigned word, per slot).
Combatant dies when its slot HP hits 0. Implement the group-total gate: if
`damage >= +0x56`, route through the overkill/status path rather than decrementing.

---

### 9.2 Target 2 -- TURN-ORDER + HASTE/SLOW

#### 9.2.1 Per-monster speed field: +0x37 **VERIFIED**

Turn-dispatch routine at **file 0x5ED25**:

```
05ed99  cmp byte ptr es:[bx + 0x37], 0    ; speed field non-zero?
05eda0  cmp byte ptr es:[bx + 0x38], 0x80 ; high bit = monster/AI flag
05eda5  jae 0x5eddb                        ; if PC (+0x38 < 0x80), skip monster path
05edac  mov al, byte ptr es:[bx + 0x37]   ; read speed byte
05edb0  mov byte ptr [bp - 5], al          ; priority key for queue insertion
```

Priority `[bp-5]` passed to `lcall 0x1D99:0x100D` (turn-queue insertion, at 0x5EFCF).
Field +0x37 written once at struct-init **file 0xb84d** from monster-data argument
`[bp+0x20]`; compared to 0x96 (150) at 0x52dfa, consistent with AD&D DEX 0-18 or
0-150 scaled range. Special value +0x37 == 0x40 (64) checks `+0x3C` of the party
record (INFERRED: an AI-override disposition flag).

#### 9.2.2 PC turn priority **INFERRED**

For PCs (`+0x28 == 0x49`), `[bp-5]` stays 0 (set at 0x5ED35, never updated in PC
branch). The PC branch at 0x5EE98 runs condition checks via the +0xA5 affliction bank
(indices 0, 5, 6 via `0x77E:0x2234`) and gates queue insertion on those passing.
Result: PCs queue at priority 0 (highest/fastest); monsters queue at priority = +0x37.
Lower priority value = earlier in turn (consistent with "0=fastest 9=slowest" display).

#### 9.2.3 Haste / Slow modifier: **UNLOCATED**

Exhaustive scan: **zero writes to `es:[bx+0x37]`** anywhere in the combat overlay
(0x50000-0x63000). The only write to +0x37 in the entire binary is the struct-init at
0xb84d. Haste/Slow display strings exist ("is Hasted" at 0x6C366, "is Slowed" at
0x6C373, "Hastened" at 0x6A50D, "Slowed" at 0x6A535) -- confirming these effects exist
-- but the field modified and the magnitude are **UNLOCATED** in this budget. Either
Haste/Slow modifies a field not in the known struct map (and not +0x37), or the
modifier is applied inside the turn-queue overlay code that is opaque to flat-file
disassembly.

**What tactical.ts gen2 should do:** Use +0x37 as monster turn-priority; sort
ascending. PCs go at priority 0. For Haste/Slow: keep gen1 COAB model (x2 / div2 on
initiative), still UNLOCATED for DQK.

---

### 9.3 Target 3 -- FRACTIONAL ATTACKS (3/2 per round): **UNLOCATED**

Exhaustive scan of combat overlay (0x50000-0x63000) and resident (0x2400-0x218D5):

- `and al,1` at 0x53A6D and 0x60EF6: both are **map tile parity bits** (read from
  `es:[bx+0x938]` map-tile data, not a round counter). Verified at 0x60EF6:

```
060ef1  mov al, byte ptr es:[bx + 0x938]   ; map tile data
060ef6  and al, 1                            ; tile parity, NOT round parity
```

- `dec es:[bx+N]` for small N in attack region: only +0x29 (compared to 0x64=100,
  a position/distance counter) and +0x35 (list-position). Neither is an attack counter.
- No half-attack accumulator field found in the known struct map.
- No `and [global_var], 1` round-parity pattern found.

The outer attack loop at 0x5F7E2-0x5FB6E processes one attack per iteration, looping
until all HP slots reach 0. Per-round attack-count dispatch appears to reside in the
turn-queue overlay code (`0x1D99:0x100D` et al.) in an overlay segment not directly
disassemblable by flat-file method.

**Verdict: UNLOCATED.** Cannot confirm or refute 3/2 fractional attacks for DQK.

**What tactical.ts gen2 should do:** Keep gen1 COAB fractional model (half-attacks,
round-parity credit) as provisional. Flag as unverified for DQK.

---

### 9.4 Target 4 -- MORALE FLEE-EMIT (consumer of +0x8b)

#### 9.4.1 Flee-check routine **VERIFIED**

Routine at **resident file 0x8576** (`0x48F:0x1886`; 51 call sites in resident and
overlay code):

```
008576  push bp
008577  mov bp, sp
008579  sub sp, 8
00857c  mov byte ptr [0xb182], 1      ; default = BRAVE (1)
008581  mov al, 0x14                   ; sides = 20
008583  push ax
008584  mov al, 1                      ; count = 1
008586  push ax
008587  lcall 0x48f, 0x1968           ; roll_dice(1, 20) -> al
00858e  mov byte ptr [0xb2e7], al     ; [0xb2e7] = d20 result (1..20)
```

Extreme-result shortcuts:

```
0085b5  cmp ax, 1
0085b8  je 0x85c4                      ; roll=1  -> FLEE immediately
0085ba  cmp ax, 0x14
0085bd  jne 0x85c2
0085bf  jmp 0x8646                     ; roll=20 -> STAY immediately
```

After condition-weight adjustment via `es:[bx+0xcb]` and `es:[bx+0x19D]`:

```
008638  mov al, byte ptr es:[bx + 0x8b]   ; load morale pool (+0x8b)
00863d  cmp al, byte ptr [0xb2e7]         ; compare pool vs adjusted d20 roll
008641  jbe 0x8646                         ; pool <= roll -> STAY (brave)
008643  jmp 0x85c4                         ; pool >  roll -> FLEE
008646  mov byte ptr [0xb182], 1           ; set STAY flag
...
0085c4  mov byte ptr [0xb182], 0           ; set FLEE flag
00864b  mov al, byte ptr [0xb182]
008657  retf                               ; returns: 1=stay, 0=flee
```

**Flee decision rule (VERIFIED):**

1. Roll `1d20` -> `[0xb2e7]`.
2. If roll == 1 -> FLEE immediately; if roll == 20 -> STAY immediately.
3. Else: adjust `[0xb2e7]` by `+0xcb` (condition weight) and `+0x19D` status modifier.
4. If `morale_pool (+0x8b) <= adjusted_roll` -> STAY; else -> FLEE.

**Polarity (corrected, VERIFIED from the `jbe` direction):** `pool > roll → FLEE`, so a
**higher +0x8b value = MORE likely to flee** — i.e. +0x8b is a **fear/panic accumulator**,
not a "resolve/bravery" score. Consistent with §8.3: the pool is seeded to 20 and **pulled
DOWN** by the per-type reaction table (a *low* pool = brave) and **pushed UP** by state
modifiers (`+0x81`). (An earlier draft here said "higher = harder to flee"; that is backwards —
the bytes show the opposite. This inverted polarity vs our engine's `morale` field is exactly
why the gen2 morale formula is **not yet faithfully encodable** — see §9.5.)

#### 9.4.2 Flee consumer call sites **VERIFIED**

Primary AI dispatcher at **file 0x80BA**:

```
0080ba  lcall 0x48f, 0x1886    ; call flee-check (0x8576)
0080c5  cmp byte ptr [bp - 7], 0
0080c9  jne 0x80ce              ; BRAVE -> continue attack
0080cb  jmp 0x819b              ; FLEE -> flee action
```

Flee action at **0x819b**: calls `0x48F:0x252C` (move in random flee direction,
uses `roll_dice`), then `0x77E:0x1734` (display combatant name), then `lcall
0x1D99:0xE7D` (overlay dispatch -> prints flee message). The "flees in panic" string
at file 0x697FE is the only such string in the binary; this overlay call is the only
flee-print path (INFERRED).

Additional call sites: **0x826D**, **0x8285**, **0x834D**, **0x6D5B** -- all in
resident AI code, all return the same 0/1 flee/stay value.

**What tactical.ts gen2 should do:** Replace fixed-threshold morale with: roll 1d20;
if 1 -> flee; if 20 -> stay; else adjust by `+0xcb` condition weight; if
`morale_pool (+0x8b) <= adjusted_roll` -> stay, else -> flee. This is a **concrete
gen2 change** from the gen1 COAB model.

---

### 9.5 Updated open-question status after RE.4

| OQ | New status |
|----|-----------|
| OQ-1 (haste/slow modifier) | **UNLOCATED.** No write to +0x37 in combat overlay. Haste/Slow strings confirmed (0x6C366/0x6C373). Field modified and magnitude UNLOCATED. |
| OQ-3 (HP field + death site) | **RESOLVED.** +0x4c = HP word (unsigned). HP=0 (jbe) = dead. Overkill gate at 0x5F35C. Write at 0x5F794. |
| OQ-4 (fractional 3/2 attacks) | **UNLOCATED.** No half-attack counter or round-parity check. May live in turn-queue overlay code. |
| OQ-5 (morale flee consumer) | **RESOLVED.** File 0x8576 (0x48F:0x1886): roll 1d20 vs morale pool +0x8b. Pool > roll -> flee. Primary call at 0x80BA; flee action at 0x819b. |
| OQ-6 (status enum DEAD constant) | **STILL UNLOCATED.** HP=0 at +0x4c is the combat-end signal; no separate DEAD constant written to +0xB3 at HP=0. +0xB3 writes only 3 and 4 (affliction severity). |
| OQ-7 (full struct map extended) | **EXTENDED.** Confirmed new: +0x37 speed/DEX; +0x4c HP word (per-slot, stride 2); +0x56 group HP total; +0xcb condition weight; +0x19D status modifier. Full list: +0x28 type; +0x32 active; +0x37 speed; +0x38 morale/control; +0x4c HP array; +0x56 group HP; +0x81 morale type; +0x87 severity; +0x8b morale pool; +0xA5..+0xAB affliction bank; +0xAC+ secondary affliction; +0xB3 condition; +0xC8 flags; +0xcb cond-weight; +0x18B, +0x18C, +0x191, +0x193, +0x19B, +0x19D misc fields. HP, AC, THAC0 offsets (beyond +0x4c) still OPEN. |

---

### 9.6 Reproduce (RE.4)

```
python tools/disasm_dqk.py --disasm 0x5f776 --len 0x40    # HP subtract: es:[bx+0x4c] -= damage
python tools/disasm_dqk.py --disasm 0x5fb27 --len 0x30    # all-dead scan: cmp es:[bx+0x4c],0 / jbe
python tools/disasm_dqk.py --disasm 0x5ed25 --len 0x80    # turn-dispatch: +0x37 speed -> queue priority
python tools/disasm_dqk.py --disasm 0x5ee98 --len 0x60    # PC branch: condition gates, priority=0
python tools/disasm_dqk.py --disasm 0x8576  --len 0x90    # flee-check: roll_dice(1,20) vs +0x8b pool
python tools/disasm_dqk.py --disasm 0x8090  --len 0x50    # AI dispatcher: flee-check call at 0x80ba
python tools/disasm_dqk.py --disasm 0x819b  --len 0x50    # flee action (move + print path)
python tools/disasm_dqk.py --disasm 0x60ef0 --len 0x18    # tile-parity (NOT round parity): and al,1
```

---

### 9.7 Independent spot-verification + engine decision (lead, RE.4)

The four targets' **VERIFIED** offsets were re-disassembled independently from `DQK.EXE`
before accepting them (not taken on the researcher's word):

| Target | Spot-check | Result |
|--------|-----------|--------|
| 1 HP/death | `0x5F784` (`mov ax,es:[bx+0x4c]; sub ax,[bp+0xa]; …; mov es:[bx+0x4c],ax`) + `0x5F733` (`cmp es:[bx+0x4c],0; jbe`) | ✅ confirmed: +0x4c is the damage-decremented HP word; HP≤0 is checked |
| 2 turn key | `0x5EDAC` (`mov al,es:[bx+0x37]; mov [bp-5],al`) | ✅ +0x37 read confirmed (cmp 0x40 gate); turn-order *role* INFERRED, haste/slow UNLOCATED |
| 4 morale | `0x8576` (`roll_dice(1,20)` via `lcall 0x48f,0x1968`) + `0x8638`/`0x863d` (`mov al,es:[bx+0x8b]; cmp al,[0xb2e7]; jbe→stay`) | ✅ confirmed: genuine 1d20-vs-+0x8b-pool decision, nat-1/nat-20 edges; the +0x8b read proves it is the morale routine, not a generic save |

**Engine decision for this slice: NO `tactical.ts` behavioral change. Document only.** Reasons,
per the "decompile, don't approximate" standard and the RE.2 over-attribution lesson:

- **Target 1 (death):** the HP≤0 *down* trigger is verified, and it **corroborates the existing
  gen2 behavior** (no `+10` overkill literal — already shipped in RE.2). But the **dead-vs-
  unconscious** resolution for an HP≤0 combatant is **still open** (DQK writes no distinct DEAD
  constant; `+0xB3`/`+0x58` status are RE.2-UNLOCATED). So there is nothing new to *change* — only
  to confirm. gen2 stays `lethal=false` (downed=unconscious) until the dead-state write is pinned.
- **Target 2 (turn-order):** +0x37 is a verified per-monster key, but PCs-at-0 is INFERRED and
  **haste/slow is UNLOCATED**. Not enough to faithfully replace the initiative model.
- **Target 3 (fractional attacks):** **UNLOCATED.** Keep gen1 model.
- **Target 4 (morale):** the **decision shape is VERIFIED probabilistic** (1d20 vs +0x8b) — a real
  divergence from gen1's deterministic `(ctrl&0x7F)*2` vs %HP-lost. **But it is not yet faithfully
  encodable:** (a) the +0x8b pool's value derivation (`ds:0x13CC` reaction table) is still
  **INFERRED** (§8.3), and (b) its **polarity is inverted** vs our engine's `morale` field
  (higher +0x8b = more likely to flee). Mapping our `morale` onto +0x8b now would be *approximation*
  — exactly what the user forbade. Documented as "known-different, pool derivation pending"; gen2
  keeps the gen1 morale model until the reaction-table semantics are pinned (a follow-up trace).

**Net:** RE.4 closes OQ-3 (HP/death field) and OQ-5 (morale flee consumer) as **located/verified**,
extends the DQK struct map, and leaves OQ-1/OQ-4/OQ-6 honestly UNLOCATED. The `gen2` ruleset is
**unchanged** (still differs from `gen1` only in dropping the `+10` overkill-death rule), now with a
*verified* basis for that one divergence and a *verified, not-yet-implementable* basis for a future
probabilistic-morale fork.

---

## 10. RE.5 -- resident-dispatch chase + full-file field scans (haste/slow mechanism, status-enum extension)

> Pass RE.5 (2026-07-01). Targets: the 4 items left open after RE.4 (OQ-1 haste/slow, OQ-4
> fractional attacks, OQ-6 DEAD constant, OQ-2 diagonal cost). Method: same static
> flat-file capstone disassembly (`tools/disasm_dqk.py`), extended in two ways that turned
> out to matter a great deal:
> (a) **followed the resident-segment lead** -- `1D99:0x100D` and `1D99:0xE7D` (the two
> opaque overlay calls cited in RE.4 9.2.3/9.4.2) are ordinary FBOV dispatch stubs, resolved
> with the existing `--thunk`/`resolve_ljmp` machinery, no new tooling needed;
> (b) **removed an unintentional scan-range bug from RE.4**: RE.4's OQ-1/OQ-4 field scans
> were bounded to file `0x50000-0x63000` ("the combat overlay"), but overlay 9's code
> actually **starts at file `0x4EE90`** (blob at `0x4D4A0`) -- *before* `0x50000` -- and
> Haste/Slow-class effects turn out to be applied from **overlays 3 and 6, nowhere near
> the combat range at all**. A full-file scan (resident `0x2400-0x218D5` + entire overlay
> tail `0x218E0-EOF`) was required and changed the outcome materially for OQ-1 and OQ-6.

All offsets are raw file offsets, re-derived independently in this session (not copied from
a prior claim). Tags: **VERIFIED** = read from bytes; **INFERRED** = behaviour-deduced;
**UNLOCATED** = not found after a real scan.

### 10.1 Resident-segment arithmetic (confirms the task's lead, corrects the estimate)

File base of segment `0x1D99` = `HDR + 0x1D99*16 = 0x2400 + 0x1D990 = 0x1FD90` (cross-checked
against `disasm_dqk.py --info`'s `ovrmgr_file_off = 0x2031D` for `1D99:0x058D`: `0x1FD90 +
0x58D = 0x2031D` [OK]). So:

| Symbolic addr | File offset |
|---|---|
| `1D99:0x100D` | `0x20D9D` |
| `1D99:0xE7D`  | `0x20C0D` |

Both addresses are **ordinary FBOV dispatch stubs** (`E8 disp16 EA off16 seg16 idx 00`), not
raw code -- `tools/disasm_dqk.py --thunk` resolves them directly:

- `1D99:0x100D` -> overlay 10, LJMP `0x2FFC:0x145B` -> **file `0x5B73C`** (turn-queue
  insertion / per-priority display+asset dispatch, see 10.2).
- `1D99:0xE7D` -> overlay 9, LJMP `0x2B3A:0x58E5` -> **file `0x53775`** (a thin
  argc-forwarding trampoline that vectors through `[0xc0e4]` or `[bx-0x4118]` depending on
  a flag at `[0xbd91]`; not pursued further -- it is the "flee message print" plumbing
  already characterised in RE.4 9.4.2, not new).

No new tool flags were needed; `--thunk` already does exactly this resolution.

### 10.2 OQ-1 (haste/slow) -- mechanism VERIFIED as a discrete priority-class table, NOT arithmetic x2/(2

#### 10.2.1 The scan-range bug and its fix

RE.4 9.2.3 scanned only `0x50000-0x63000` for writes to `+0x37` and found just the one
struct-init at `0xB84D`. Re-running the identical write-pattern scan (any `mov/add/sub/
inc/dec/and/or/xor` with a memory destination at displacement `0x37`) over **the whole
file** (resident `0x2400-0x218D5` + full overlay tail `0x218E0-EOF`) finds **10 sites**,
9 of them previously invisible:

```
00b84d  mov  byte ptr es:[bx+0x37], al        (resident struct-init, already known)
0325da  mov  byte ptr es:[bx+0x37], al        (overlay 3 -- clamp-to-max, see 10.2.3)
034c2b  mov  byte ptr es:[bx+0x37], al        (overlay 3 -- generic per-round decay)
034c6c  mov  byte ptr es:[bx+0x37], al        (overlay 3 -- SPECIAL per-round decay, +0x38==0x80 case)
034c92  mov  byte ptr es:[bx+0x37], al        (overlay 3 -- generic per-round decay, other branch)
0430c6  mov  byte ptr es:[bx+0x37], al        (overlay 6 -- APPLY duration, see 10.2.2)
0430d8  mov  byte ptr es:[bx+0x37], al        (overlay 6 -- clamp duration <= +0x38)
0430e9  mov  byte ptr es:[bx+0x37], al        (overlay 6 -- special-case forced duration=2)
04311a  dec  byte ptr es:[bx+0x37]            (overlay 6 -- PER-ROUND DECREMENT, see 10.2.2)
04e2f2  mov  byte ptr es:[bx+0x37], 0x17      (overlay 9 -- one hardcoded literal, see 10.2.4)
```

Overlay bounds used (from `OVERLAY_DESCS`/`overlay_code_end`): overlay 3 = `[0x304B0,
0x37430)`; overlay 6 = `[0x3FD70, 0x442C0)`; overlay 9 = `[0x4D4A0, 0x54DD0)`. **Neither
overlay 3 nor overlay 6 is combat code** -- they are outside the previously-assumed
"combat overlay" range entirely. **VERIFIED**, by direct byte re-scan of the whole file
(script logic: capstone-disassemble every file offset in the two regions, keep
instructions whose first operand is `mem` with `disp&0xFFFF==0x37`).

#### 10.2.2 Overlay 6 (`0x3FD70-0x442C0`) is a generic timed-spell-effect applicator -- VERIFIED

Function at file `0x043071` (no `push bp` frame -- a leaf-ish Borland routine) reads four
fields of the *currently active spell record* via a **field accessor `lcall 0x2033,
0x112`** (`get_spell_field(field_index)` called with index 1, then 2, then 3, then 4),
plus one call to `lcall 0x2033, 0x13` up front:

```
043071  mov al,4; push ax; lcall 0x2033,0x13      ; accessor #1 (spell ID?)
04307a  mov al,1; push ax; lcall 0x2033,0x112      ; field[1] -> unused here
04308f  les bx,[0xb20f]                             ; bx = CURRENT TARGET COMBATANT (far ptr; same
                                                       global used throughout combat & this overlay)
043093  mov es:[bx+0x38], al                        ; field[2] -> combatant.+0x38  (effect TYPE/max-dur)
0430a0  mov [0xb1ca], al                             ; field[3] -> UI/message global
0430ac  mov [0xc2e7], al                             ; field[4] -> UI/message global
0430af  push [0xc9f2]; push [0xc9f1]; push [0xc9f0]  ; push the 3-word "active spell" record ptr
0430bc  call 0x40483                                 ; near-call: compute actual duration (rolls dice
                                                        scaled by caster level -- not traced further)
0430c6  mov es:[bx+0x37], al                        ; WRITE:  combatant.+0x37 := computed duration (rounds)
0430ca  mov al, es:[bx+0x38]
0430ce  cmp al, es:[bx+0x37]
0430d2  jae 0x430dc
0430d4  mov al, es:[bx+0x38]
0430d8  mov es:[bx+0x37], al                        ; CLAMP: duration can't exceed +0x38 (max-duration cap)
0430dc  cmp byte ptr es:[bx+0x38], 0x10              ; SPECIAL CASE: effect type == 0x10 (16)
0430e5  jne 0x430f1
0430e7  mov al,2
0430e9  mov es:[bx+0x37], al                        ; force duration := 2 rounds  (unconditionally)
0430ed  mov es:[bx+0x38], al
0430f1  ...                                          ; display "N rounds" message (string pool 0xc6f6)
```

A **second, separate routine at file `0x04310F`** ticks that duration down **once per
round**:

```
04310f  les bx,[0xb20f]
043113  cmp byte ptr es:[bx+0x37], 0
043118  jbe 0x43137                                  ; duration already 0 -> nothing to do
04311a  dec byte ptr es:[bx+0x37]                    ; DECREMENT -- one round elapses
04311e  ...                                          ; display "N rounds remaining" (same string 0xc6f6)
043137  inc word ptr [0xb7f9]                        ; round-tick global
04313b  retf
```

**VERIFIED, unambiguously the combatant struct**: `[0xb20f]` is the same "current
combatant" far-pointer global already established in combat code (RE.4 9.2's turn-queue
insertion function at `0x5B73C`/`0x5BA1D`/`0x5BA54`/`0x5BA85` reads it the same way). So
`+0x37` here is the **same struct field** RE.4 already found being read as a "speed
byte" for turn ordering (9.2.1) -- this reconciles the two prior observations: **`+0x37`
is a generic active-timed-effect DURATION counter (rounds remaining)**, and `+0x38` is
that effect's **type/max-duration**, not a raw DEX/speed scalar. A third parallel field
`+0x36` is processed identically in overlay 3 (10.2.3) -- the combatant has (at least)
**three parallel "active effect" slots** at `+0x36/+0x37/+0x38`.

**Interpretation of the special case:** an effect whose type byte equals `0x10` (16)
*always* gets a fixed, short 2-round duration, overriding whatever `0x40483` computed.
A short, fixed-length, high-priority timed buff/debuff is exactly the shape of a
Haste/Slow-class effect in these rulesets. This is the strongest concrete lead found for
"where Haste/Slow lives," but the type-ID-to-spell-name mapping itself was not resolved
(see 10.2.5 for what would close it).

#### 10.2.3 Overlay 3 (`0x304B0-0x37430`) -- per-round decay dispatcher for the same 3 fields -- VERIFIED

Function at file `0x034BF0` processes `+0x36`, then `+0x37`, then `+0x38` with an
identical idiom: `masked = field & 0x7F; masked = decay(masked); field = masked |
(field & 0x80)` -- i.e. **the high bit of each byte is a persistent flag, preserved
across the decay call**, exactly the same "mask 0x7F, preserve bit 7" idiom RE.2 already
found for the *morale* control byte `+0x38&0x7F` (a different semantic use of the same
byte, confirmed context-dependent). `decay()` is `lcall`ed as **file `0x035003`**.

A second branch (guarded by `cmp es:[bx+0x38],0x80; je/jne`) processes **only `+0x37`**,
through either the generic `0x035003` decay or a **different, special transform at file
`0x034E27`** when `+0x38==0x80` exactly (i.e. the effect-type byte's masked value is 0
and only the persistent/monster-flag bit is set).

Both `0x035003` and `0x034E27` are **large sparse-value switch tables** (Borland
`cmp/je` linear-search-then-jump idiom), decoded with cs_base recovered by brute-forcing
candidate bases and requiring the compare array to be all `<=0xFF` plus all jump targets
to land in-file (the same technique that resolved `dqk-overlay-map.md`'s sub-segment
addressing, just automated):

- **`0x035003`** (cs_base = `0x30F35` = overlay 3's own code_start): **37 explicit cases**
  --  compare values `{2,4,7,17,40,53,56,57,59,60,61,62,63,64,65,66,72,90,95,96,97,98,99,
  101,102,103,104,105,106,107,108,109,110,111,112,113,114}` -- each case is a 5-byte
  `mov si,<new_value>; jmp 0x3517C` (e.g. case `101` -> `si:=0x39`(57); case `102` ->
  `si:=0x3B`(59); case `2` -> `si:=0x5A`; case `4` -> `si:=0x60`; ...). **Default** (no
  match, `jmp 0x3517C` with `si` unchanged) returns the input unmodified. **Verdict: this
  is a remap/lookup table (input effect-ID -> output effect/asset-ID), not arithmetic.**
  VERIFIED by direct disassembly of every one of the 37 targets plus the default.
- **`0x034E27`**: a **120-entry direct jump table** (`(si-2)` in `0..119`, no compare
  step) -- not fully enumerated (120 cases), but its shape (huge dense per-value table)
  is consistent with a **per-spell-effect-ID individual handler bank**, i.e. a much larger
  companion table to `0x035003`'s sparse 37-case one.

**Why this matters for OQ-1:** the 37 output values from `0x035003`'s cases *are the same
set of numbers* that overlay 11's turn-priority table (10.2.4) treats specially (`57, 59,
60..65, 95, 97, 99` all appear on both sides). This is a **two-stage ID pipeline**:
`spell/effect-ID -> (0x035003 in overlay 3) -> category-ID -> (overlay 11's turn-priority
table) -> discrete priority class`. VERIFIED as a structural fact (the value sets
overlap exactly); the *semantic* labels ("which category-ID is Haste") are not proven.

#### 10.2.4 Overlay 11 (`0x5C4C0-0x62C30`) -- raw `+0x37` value remapped into 11 discrete turn-priority classes -- VERIFIED

RE.4 9.2.1's turn-dispatch routine (file `0x5ED25`) is physically stored in overlay 11
(not overlay 10 as a naive file-range read would suggest -- overlay 10 ends at `0x5C4C0`
and `0x5ED25 > 0x5C4C0`, so it is `overlay_code_start(11) = 0x5CBB0`-relative). Inside it,
for **monsters not classified as "PC-type"** (gated by the resident stub `1D99:0xE69` ->
file `0x59AB8`, which VERIFIED tests `+0x28 in {0x27,0x28,0x49}` and returns true only for
those three combatant-type IDs), the raw `+0x37` byte is read directly into the priority
key `[bp-5]` (RE.4's already-verified `0x5ED99-0x5EDAC`). What RE.4 did **not** trace is
what happens to that key next: at file `0x5EF39`, `[bp-5]` is looked up in an **11-entry
compare-then-jump table** at (recovered) `cs_base = overlay_code_start(11) = 0x5CBB0`,
compare array at `+0x23A3` (file `0x5EF53`), jump array at `+0x23B9` (file `0x5EF69`):

| raw `+0x37` value | remapped priority class (`[bp-5]`) |
|---|---|
| 57 (`0x39`) | `0x7F` |
| 59 (`0x3B`) | `0x80` |
| 60 | `0x81` |
| 61 | `0x82` |
| 62 | `0x83` |
| 63 | `0x84` |
| 64 | `0x85` |
| 65 | `0x86` |
| 95 (`0x5F`) | `0x87` |
| 97 (`0x61`) | `0x88` |
| 99 (`0x63`) | `0x89` |
| *(any other value)* | unchanged -- treated as a plain 0-150ish priority number |

VERIFIED by disassembling every one of the 11 jump targets (`0x5EF7F` through `0x5EFBB`,
each a 5-byte `mov [bp-5],<const>; jmp 0x5EFBF`). **This is a discrete re-bucketing of 11
specific "special" `+0x37` values into a dense, sequential class range `0x7F-0x89`**,
which then flows into the turn-queue-insertion stub `1D99:0x100D` (10.1) as the priority
argument.

#### 10.2.5 Verdict for OQ-1

**RESOLVED (mechanism), UNLOCATED (exact spell-ID labels).** DQK does **not** implement
Haste/Slow via `x2`/`(2` arithmetic on a numeric initiative field anywhere in the binary
-- an exhaustive scan (this pass, whole file) for that pattern again found nothing, which
is now much better explained: **there is no such arithmetic because the engine uses a
discrete priority-CLASS system instead.** Concretely, VERIFIED:

1. `+0x37` (and parallel slots `+0x36`, `+0x38`) are **timed-effect duration/type
   counters**, applied by overlay 6 (`0x043071`, reading a spell record via
   `lcall 0x2033,0x112`) and decremented once per round by overlay 6 (`0x04310F`).
2. One effect **type ID (`0x10`=16) is hardcoded to always last exactly 2 rounds**
   (`0x430E0-0x430ED`) -- the shape of a short, powerful timed buff/debuff.
3. Overlay 3 (`0x035003`) remaps 37 specific raw `+0x36/+0x37/+0x38` values into a
   second ID space; overlay 11's turn-priority code (`cs:0x23A3`, file `0x5EF53`)
   remaps 11 of those same values into a dense priority-class range `0x7F-0x89` that
   participates directly in turn-queue ordering.
4. **Not resolved:** which of the 11 (or 37, or 120) numeric effect-IDs specifically
   corresponds to the "Haste" vs "Slow" spells (the display strings "is Hasted"/"is
   Slowed"/"Hastened"/"Slowed" exist per RE.4 9.2.3 but were not connected to a specific
   numeric ID by string-xref, since -- per this doc's established convention -- string
   references are structural/indirect, not pointer-table based). **Next concrete step:**
   locate the spell-definition table (`lcall 0x2033,*` accessor's backing data, or the
   GLB `DATA`/ECL spell-cast opcode that supplies the spell-ID argument for the Haste and
   Slow spells specifically) and read off which numeric type-ID each produces; that
   single fact would fully close OQ-1.
5. **Engine-decision implication (unchanged from RE.4's stance):** do not encode a
   provisional x2/(2 rule for DQK; if/when gen2 Haste/Slow is implemented, it should use
   the **priority-class bucket model** verified above, not a multiply/divide.

### 10.3 OQ-4 (fractional attacks) -- phase normalization located; execution count still UNLOCATED

RE.4 9.3 scanned only the combat overlay window `0x50000-0x63000` for `and/test reg,1`
round-parity idioms. This pass repeated the scan **over the entire file** (resident +
full overlay tail): **38 total hits**, but only **two** fall inside the actual combat
overlays 9/10/11 (`[0x4EE90, 0x62C30)`) -- `0x53A6D` and `0x60EF6`, both **already
identified and ruled out in RE.4 as map-tile parity bits**, not round/attack parity. No
new candidate turned up even with the expanded scan. The remaining 36 hits are resident
C-runtime/string code or unrelated overlays (e.g. `0x043BE3` in overlay 6, part of the
same duration-effect code from 10.2 -- inspected, it is an unrelated odd/even check on a
display-column counter, not attacks).

Also inspected this pass: the "attack disposition" function RE.4 named at `0x5F136`
(called just before the HP-subtract site `0x5FAFB`). It contains **another 11-entry
compare-and-jump dispatch** (cs table at file `0x5F1A2`+`0x2605`-ish, same Borland idiom
as 10.2.4), keyed off a monster-type accessor (`lcall 0x1093,0x78`) -- this is a
per-monster-type **attack-approach/behaviour** dispatch (melee vs. ranged vs. special),
not an attack-count loop. No counter, table, or field resembling COAB's `attacksCount`
(half-attack units, offset `0x11C`) or `attack1/2_AttacksLeft` (COAB offsets `0x19C`/
`0x19D`) was found anywhere in the newly-scanned regions either.

The earlier parity scan's negative is limited to that `and/test reg,1` idiom: it did not
rule out phase handling implemented through a helper call and integer division. A follow-up
static trace resolved the four resident stubs previously listed as leads. Overlay 10's
function at file `0x5B73C` directly calls `1D99:0x1067`
(`0x5B940`), `1D99:0x1021` (`0x5B961` and later sites), `1D99:0xF3B` (`0x5B9FE` and
later sites), and `1D99:0xECD` (`0x5BAAA`). The shared overlay manager resolves those
stubs into overlay 0 at file offsets `0x24B98`, `0x2ACCB`, `0x249BF`, and `0x2A946`,
respectively. The inspected bodies operate on grid, coordinate, drawing, and input
records; this queue slice found no MONCHA rate-byte load, attacks-left decrement, or
per-round requeue counter. The direct helper calls from this function (`A62:0x46`,
`BDB:0x424`, `77E:0x1346`, and `77E:0x153C`) likewise did not expose such a counter.

**2026-09-25 LOAD_MONSTER population trace.** The ECL handler at file `0x042C63`
reads the three `LOAD_MONSTER` operands into pending group arrays. The builder at
`0x043042` iterates those groups and calls `0x042CBC`; that routine passes its
member id to `0x040415`, which allocates a `0x19E`-byte record buffer and calls
`0x2177:0x257C` to resolve the record. `0x042CBC` then copies a `0x19E` span from
that record buffer into the linked combat roster node using `0xD7:0x2B69`. It
clears the node's link words at `+0..+0x0A`, not offsets `+0xB3/+0xB4`. Both
rate bytes therefore enter the per-creature roster node at their original
offsets on this `LOAD_MONSTER` path. The node's `+0x66` flag is also checked as
the monster discriminator before insertion, consistent with the decoded
MONCHA layout. The byte transfer is source-grounded; the backing HLIB group
selection is not established at this builder. Follow-up code below proves that
both fields are subsequently read and normalized into runtime counters.

The execution consumer is now located in overlay 0 at `0x26177`, reached from
`0x26636` at `0x2682C`. It indexes the allowance pair using the attack-kind
byte at `(combatant+0x40)+5`: index 1 addresses `+0x190`, and index 2 addresses
`+0x191`. The loop decrements the selected allowance before resolving that
attack, retries while the same indexed allowance remains, and then decrements
the kind to visit the other slot. This proves that the normalized pair feeds
per-kind attack resolution. The initial attack-kind value, exact ordering in
the full actor turn, and two-round execution trace still need to be pinned.
`--thunk`'s caller listing only scans the MZ image (`find_callers_of_stub`); overlay
callers require `--lcallers`, which scans the full file. Keep caller and callee overlay
IDs distinct because combat overlays share runtime segment `0x2B3A`. Further work must
prove how the `+0x40` action record selects attack kind and how its allowance is
replenished across round transitions before implementing Task 29.

**2026-09-25 follow-up byte-flow candidates.** In overlay 0, file `0x25C54`
reads combatant `+0xB3` and copies it to `+0x190` before calling helpers at
`0x20CB:0x0CBF` and `0x20CB:0x10C3`; the routine later computes and writes a
value back to `+0x190`. In a separate routine at `0x24E53`, `+0xB4` is read
into global `0xAE61`, passed to `0x21E4:0x0FFC`, and the helper's `AL` result
is written to `+0x191` at `0x24E80`. The transfer and round-phase
normalization are proven. The generic per-kind attack loop is now located in
§10.3 below; its initial kind and complete per-round ordering still need tracing.

The transform at `0x21E4:0x0FFC` resolves to overlay 0 file `0x25D5C`. It
returns `(input + (AE4C & 1)) / 2`: it calls resident `0x0DF9:0x0428` with
`AE4C`, and that helper returns the argument's low bit. Overlay 0 routine
`0x2336C` increments `AE4C` at `0x23389`; overlay 1 initialization clears it
at `0x2DAE1`. The `+0xB3` path at `0x25C3F` also feeds the same normalization
helper after its conditional adjustment, while the `+0xB4` path reaches it at
`0x24E77`. The `0x25C3F` routine is reached by far calls at `0x22F0A`,
`0x24E4C`, and `0x2F6CD`; the shared half converter at `0x25D5C` is called at
`0x24E77` and `0x25CDC`. Routine `0x2336C`, which increments `AE4C`, is called
from `0x22B50` in the combat-loop transition path. This establishes
round-phase-dependent half-rate normalization into the two runtime bytes and
ties the phase increment to the combat loop. §10.3 now confirms those bytes are
consumed as per-kind attack allowances. The remaining gap is exact phase
alignment and attack ordering across a full two-round route.

To pin concrete two-round inputs, the shipped `DISK2/MONCHA.GLB` was decoded
read-only with `tools/hlib_decode.py` and `tools/moncha_rle.py`. Member 12
(`UMBER HULK`, ID 12, `isMonster=1`) has rates `4/2`; the shared helper yields
`2/1` on either phase, i.e. 4 primary plus 2 secondary half-attacks across two
rounds. Member 60 (`PRINCE TALHOOK`, ID 60, `isMonster=1`) has rates `3/6`;
the helper yields `1/3` when `AE4C` is even and `2/3` when it is odd, totaling
3 primary plus 6 secondary across two rounds. This pins the retail data and
normalization result, including an odd-rate counterexample. The consumer loop
decrements the corresponding per-kind allowances; full-turn traces remain open.

The encounter-side control is DQK `DISK3/ECL.GLB` area 23 (member 13, file
base `0x186A4`): entry-reachable `LOAD_MONSTER #12,#1,#12` at file `0x1A730`
is followed by `COMBAT` at `0x1A747`. The ECL id table maps monster ID 12 to
MONCHA member 12, the UMBER HULK above. Thus the example is not just a detached
record: the retail encounter script queues that multi-attack creature for
combat. The complete execution trace through both rounds remains open.
The odd-rate counterexample is likewise encountered in retail: ECL area 15
(member 9, base `0x0EBA8`) queues ID 60 at `0x107D7` and reaches `COMBAT` at
`0x107F7`; the id table maps 60 to the `PRINCE TALHOOK` MONCHA member 60.

**2026-09-25 consumer trace.** Overlay 9 candidate `0x537B9` is indirectly
entered through selector 3 in the far-pointer table at `DS:BEE8`: initialization
stores `30CC:0009` at `0x52E60/0x52E66`, and trampoline `0x53775` dispatches via
`[BEE8+selector*4]` at `0x537A5–0x537B0`. Address mapping resolves that alias to
file `0x537B9`. Its concrete caller at `0x576F7` passes the combatant and an
effect-list node returned by `077E:1734`; the second record is a 9-byte effect
node, not an attack allowance. It subtracts the rate sum from that node's `+3`
and, on depletion, removes effect id 3. The path emits the `is fighting with
snakes` message at `0x6C07C`. Therefore this candidate is not the generic
attack scheduler. The alternate trampoline branch uses the callback at
`DS:C0E4` (`2B3A:4F34`, file `0x52DC4`), not selector-table entry 3.

The generic consumer is instead overlay-0 function `0x26177`. At `0x2682C`,
caller `0x26636` invokes it after the direct gates at `0x267EA/0x267F2` require
at least one of combatant `+0x190/+0x191` to be positive. Function `0x26177`
reads `(combatant+0x40)+5` as the starting attack kind at `0x263B9–0x263C4`.
At `0x263DA`, it decrements `combatant[0x18F+kind]`; it calls attack-resolution
helper `048F:1771` at `0x26407`, passes the same kind to damage routine
`0x24F3D` at `0x26440–0x26450`, and repeats while that allowance remains at
`0x264EA–0x26502`. It then decrements kind and continues for kinds 2 and 1
through `0x26514–0x2651B`. This establishes that kind 1 consumes `+0x190` and
kind 2 consumes `+0x191`, but does not yet establish the initial kind, early
exit effects, or a two-round trace for either retail example.

**Task 29 phase/order completion — static, 2026-09-25.** Per-round setup at
file `0x24E41` writes kind 2 to `(combatant+0x40)+5`; encounter initialization
clears `AE4C`, and the round transition increments it after actors. Thus the
ordinary route starts with phase 0 and advances to phase 1 for round two. The
retail examples resolve as follows: UMBER HULK `4/2` attempts kind 2 once then
kind 1 twice in both rounds; PRINCE TALHOOK `3/6` attempts kind 2 three times
then kind 1 once in round one, and kind 2 three times then kind 1 twice in
round two. The snake-effect callback `0x537B9` is not this scheduler.

Native source now applies this ordinary schedule only to validated HLIB
monsters carried by the CCECL `D0xx` DQK marker. It reuses `C_HALFATT` for
kind 1, a tagged `C_ATTACKS` value for kind 2, and existing secondary damage
arrays. A positive kind-2 rate with an invalid damage profile rejects that
trusted DQK encounter; a zero rate is accepted and remains zero. Three records
with a populated secondary profile and zero rate remain valid no-secondary
cases. Three mirror records with positive secondary rate but no valid profile
are rejected on the trusted DQK route instead of receiving an invented cadence.
GLIB, NPC, placeholder, and other title paths remain outside the feature.

The CCCOMBAT image builds at 64,892 emitted / 65,148 resident bytes, leaving
132 bytes above the 128-byte floor. Five offline source contracts pass, and the
expanded `cccombat-test.ps1` now contains exact first-two-round traces for 4/2,
3/6, 1/0, 0/2, 0/0, and independent mutations of both source rate bytes. The
PowerShell file parses, but those encounter traces have not been observed in a
runtime. Task 29 remains open for a hands-on trace when runtime testing can
proceed without taking desktop focus.

### 10.4 OQ-6 (DEAD status constant) -- expanded scan finds a third `+0xB3` value, still no death-linked write; negative reconfirmed

#### 10.4.1 Full-file `+0xB3` scan -- a third value (`2`) found, outside the combat overlay

RE.2/RE.4 only scanned the combat overlay for writes to `+0xB3` and found values `{3,4}`.
A full-file scan (same method as 10.2.1) finds **one additional site outside the combat
range**:

```
03c0b8  mov byte ptr es:[bx+0xb3], 2      (overlay 5, [0x39FE0,0x3FD70))
06259c  mov byte ptr es:[bx+0xb3], 3      (combat overlay, RE.2-known)
0625ab  mov byte ptr es:[bx+0xb3], 4      (combat overlay, RE.2-known)
0625bc  mov byte ptr es:[bx+0xb3], 3      (combat overlay, RE.2-known)
06279f  mov byte ptr es:[bx+0xb3], 3      (combat overlay, RE.2-known)
0627b0  mov byte ptr es:[bx+0xb3], 4      (combat overlay, RE.2-known)
```

The new site (file `0x3C0B8`, inside a function starting at file `0x3BF50`) is **VERIFIED
to operate on the real combatant struct**: the same function reads `+0xA5` at file
`0x3BF64` through the global `[0xAD67]` far pointer -- the identical "current combatant"
global and the identical affliction-bank field (`+0xA5`) that RE.2/RE.4 already
established. So `+0xB3` genuinely has (at least) **three** distinct written values in
DQK: `2, 3, 4`.

#### 10.4.2 What the `2`-writing function actually does -- INFERRED, not "death"

The function at `0x3BF50` iterates an index `0..6` over an `+0x79`/`+0x78` byte-array pair
(shift/clamp of an affliction-severity sub-array, similar in shape to the `+0xA5` bank),
then -- once, after the loop -- sets **four fields together**:
`+0xB3:=2`, `+0xB5:=1`, `+0xB7:=2`, `+0x90:=0xC`. Its two callers (file `0x3C629` and
`0x3C663`, both inside overlay 5) are part of a routine (`0x3C5C0-0x3C668`) that: computes
a class/level-indexed stat into `+0x52` (table stride `0x1C`, base `ds:0x3F3`), sets the
"current combatant" globals, and then -- gated on an **outcome code `[0xC774]` (compared
to `1` and `2`)** -- calls `0x3BF50` either once (baseline) or a second time, alongside
sound-effect calls (`lcall 0xBDB,0x21D2` with arg 0/1). This has the shape of a **saving
throw / spell-resistance resolution** (roll -> outcome code 0/1/2 -> apply consequence),
**not** a "combatant just reached 0 HP" handler. **Verdict: `+0xB3:=2` is most likely a
"reset/baseline" write as part of resolving a save-or-effect check, not a DEAD marker;
this is INFERRED from control flow, not proven from a string or an HP check in the same
function.**

#### 10.4.3 Death-transition code re-examined with wider context -- still writes no status field (re-confirmed)

Re-disassembled both HP==0 death-detection sites from RE.4 9.1.2 with more surrounding
context (file `0x5F726-0x5F776` and `0x5FB20-0x5FB6F`). In both cases the **only** effect
of `HP<=0` (`jbe`) is to leave a **local stack flag** (`[bp-3]`/`[bp-2]` in one case,
`[bp-0x56]` in the other) at its initial value, used purely for **combat-loop control
flow** (deciding whether to continue attacking / whether the encounter has ended). No
write to `+0xB3`, `+0x58`, or any other field occurs in either death-check block.
**VERIFIED (re-confirmed on a wider disassembly window than RE.4 used).**

#### 10.4.4 `+0x58` full-file scan -- the two hits found belong to an unrelated struct (ruled out with evidence)

A full-file scan for writes to `+0x58` (RE.2 had only scanned `0x40000-0x6C000` and found
none) finds exactly **two** hits, both in overlay 5:

```
03ca4f  mov word ptr es:[bx+0x58], ax     ; bx from [0xC757]
03cf68  mov word ptr es:[bx+0x58], 6      ; bx from [0xC757]
```

Both are keyed off **global `[0xC757]`**, not the combatant global `[0xAD67]`/`[0xB20F]`
used everywhere else in this doc. Cross-checking neighbouring field accesses on the same
pointer in the same functions (`+0x52` used as a `*0x1D`-stride menu-table index right
after the first write; `+0x5A:=2`, `+0x60:=0`, `+0x62:=0` initialised together with the
second write, alongside obviously UI-only globals `[0xC763]`, `[0xC785]`, `[0xC787]`,
`[0xC789]`, `[0xC78B]`, `[0xC78D]`) shows this is a **menu/dialog-widget record** (a
"selected item index" field, later used as a `*0x1D`-stride lookup into a text/asset
table), **not the combatant struct** -- the shared offset `0x58` is coincidental (two
different Borland structs independently laid out by the compiler). **Ruled out with
positive evidence, not just assumed.** The genuine combatant `+0x58` field (RE.2's
"multi-value status enum, compared against 0,1,3,4,5,6,7 but never `mov`-written")
therefore **still has zero confirmed immediate/register writes anywhere in the 449 KB
file**, now checked exhaustively rather than over a sub-range. The important caveat
(carried over from RE.2, still true): the scan pattern only catches instructions whose
*encoded displacement* is exactly `0x58`; a compiler idiom that pre-adds the offset into
a register before storing (`add bx,0x58` then `mov [bx],ax`) would not be caught. This is
a real methodological limitation, not closed by this pass.

#### 10.4.5 Verdict for OQ-6

**Still UNLOCATED as a positive claim, but now a stronger, better-evidenced negative.**
Restated precisely: DQK's combat engine represents "no longer able to act" purely via
`HP<=0` at `+0x4C` (RE.4, re-confirmed 10.4.3); there is **no** distinct numeric constant
written to `+0xB3`, `+0x58`, or any other scanned field specifically *because* HP reached
0. `+0xB3` is now known to carry **three** values (`2, 3, 4`), all of which are
transient affliction/condition-severity or reset-baseline markers unrelated to permanent
death (10.4.1-10.4.2). **This is a valid documented negative per this project's
convention**: DQK does not have a separate DEAD status byte; "dead" is represented
entirely by the HP field reaching zero, checked directly wherever the engine needs to
know if a combatant is still capable of acting.

### 10.5 OQ-2 (diagonal movement cost) -- briefly checked, unchanged, deprioritized per instructions

A quick string search (`--find "diagonal"`, `--find "Diagonal"`) returned **zero hits** in
`DQK.EXE`. No further disassembly time was spent on this item this pass, per its stated
lower priority relative to OQ-1/OQ-4/OQ-6. **Status unchanged from RE.2 §3.2: UNLOCATED.**

### 10.6 Updated open-question status after RE.5

| OQ | New status |
|----|-----------|
| OQ-1 (haste/slow modifier) | **Mechanism RESOLVED, spell-ID labels UNLOCATED.** No arithmetic x2/(2 exists anywhere in the binary (re-confirmed, whole-file). Instead: `+0x37`/`+0x36`/`+0x38` are timed-effect duration/type slots (VERIFIED, overlay 6 `0x043071` applies, `0x04310F` decrements/round); effect type `0x10` is hardcoded to a fixed 2-round duration (VERIFIED); a two-stage ID remap (overlay 3 `0x035003`, 37 cases; overlay 11 `cs:0x23A3`, 11 cases) converts specific `+0x37` values into discrete turn-priority classes `0x7F-0x89` (VERIFIED, every case disassembled). Which numeric type-ID is "Haste" vs "Slow" specifically is UNLOCATED -- needs the spell-definition table, not further disassembly of this control flow. |
| OQ-2 (diagonal cost) | **UNLOCATED**, not pursued this pass (string search only, per stated low priority). |
| OQ-3 (HP field + death site) | Unchanged from RE.4: RESOLVED. |
| OQ-4 (fractional attacks) | **PARTIAL.** Retail MONCHA `+0xB3/+0xB4` transfer into runtime `+0x190/+0x191`; both are normalized by `(input + (AE4C & 1))/2`, with `AE4C` advanced on the combat-loop round transition. UMBER HULK `4/2` therefore yields `2/1` each round; PRINCE TALHOOK `3/6` yields `1/3` then `2/3`. DQK ECL area 23 queues the UMBER HULK before COMBAT. Still no proven execution edge from those fields to attack actions: overlay9 `0x537B9` sums them and adjusts another record's `+3`, but no direct caller or `+3` semantics is known. `--thunk` caller search is MZ-only; use `--lcallers` for overlay sites. |
| OQ-5 (morale flee consumer) | Unchanged from RE.4: RESOLVED. |
| OQ-6 (status enum DEAD constant) | **Still UNLOCATED as a positive claim; negative reconfirmed and strengthened.** `+0xB3` now has 3 known values (`2,3,4`), all transient/reset markers (INFERRED), none death-linked. Death-detection code re-examined with wider context: writes no status field at all (VERIFIED). `+0x58`'s two whole-file hits belong to an unrelated UI-widget struct, ruled out with cross-field evidence (VERIFIED); the real combatant `+0x58` still has zero confirmed direct writes anywhere in the file. Conclusion stands: DQK has no separate DEAD constant; death is HP-only. |
| OQ-7 (full struct map extended) | **Extended further:** `+0x36` confirmed as a third parallel "active effect" slot alongside `+0x37`/`+0x38` (same 0x7F-mask/high-bit-preserve idiom, overlay 3 `0x034BF0`). `+0x52` (class/level-indexed derived stat, overlay 5) and `+0xB5`/`+0xB7`/`+0x90` (written together with `+0xB3:=2`, overlay 5) newly noted but not semantically pinned. |

### 10.7 Reproduce (RE.5)

```
python tools/disasm_dqk.py --thunk 0x20d9d                # 1D99:0x100D -> overlay10 file 0x5b73c
python tools/disasm_dqk.py --thunk 0x20c0d                # 1D99:0xE7D  -> overlay9  file 0x53775
python tools/disasm_dqk.py --disasm 0x5ed25 --len 0x2c0    # turn-priority routine, full body (overlay 11)
python tools/disasm_dqk.py --disasm 0x5ef39 --len 0x20     # +0x37 raw-value -> priority-class dispatch head
python tools/disasm_dqk.py --disasm 0x5ef7f --len 0x40     # the 11 priority-class targets (0x7F..0x89)
python tools/disasm_dqk.py --disasm 0x59ab8 --len 0x20     # 1D99:0xE69 gate: is combatant type in {0x27,0x28,0x49}?
python tools/disasm_dqk.py --disasm 0x42fc0 --len 0x120    # overlay6: apply-timed-effect function (0x043071)
python tools/disasm_dqk.py --disasm 0x4310f --len 0x30     # overlay6: per-round duration decrement
python tools/disasm_dqk.py --disasm 0x34bf0 --len 0x120    # overlay3: per-round decay dispatcher (+0x36/+0x37/+0x38)
python tools/disasm_dqk.py --disasm 0x35003 --len 0x20     # overlay3: 37-case remap table head
python tools/disasm_dqk.py --disasm 0x3bf50 --len 0x180    # overlay5: function that writes +0xB3:=2
python tools/disasm_dqk.py --disasm 0x3c5c0 --len 0xb0     # overlay5: caller (save/effect resolution shape)
python tools/disasm_dqk.py --disasm 0x5f726 --len 0x60     # HP==0 death check, re-examined wider context
python tools/disasm_dqk.py --disasm 0x5fb20 --len 0x60     # HP==0 all-dead scan, re-examined wider context
```

Full-file field scans (`+0x37`, `+0xB3`, `+0x58`, round-parity `and/test reg,1`) used a
one-off Python script (capstone, same disassembler the tool already depends on) rather
than a new `disasm_dqk.py` flag, since each scan's filter criteria (target displacement,
value-range plausibility for cs_base recovery) differed per query; they are recorded here
for reproducibility rather than checked in as a subcommand:

```python
import capstone
data = open("The Dark Queen of Krynn/DQK.EXE","rb").read()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16); md.detail = True
regions = [(0x2400, 0x218D5), (0x218E0, len(data))]   # resident + full overlay tail
# ... disassemble linearly through each region, filter ins.operands[0] for
#     X86_OP_MEM with (mem.disp & 0xFFFF) == <target>, mnemonic in the write set.
```
