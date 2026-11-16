# Champions of Krynn — Combat, Disassembled From CoK's OWN Binary

**Goal.** Our TS engine (`packages/engine/src/combat/tactical.ts`) currently grounds
its combat rules in the **COAB** ("Curse of the Azure Bonds") decompile and *assumes*
those rules match **Champions of Krynn (CoK)**. This document replaces that assumption
with evidence from **CoK's own machine code**: a real 16-bit real-mode disassembly of
`Champions of Krynn/GAME.OVR`.

**Tooling.** `tools/disasm_cok.py` (capstone 5.0.7, `CS_MODE_16`). Commands:
`info`, `routines`, `csfile`, `strings`, `xref`, `xrefoff`, `dis`, `prologues`.
All offsets below are **file offsets into `GAME.OVR`** unless written `cs:0x….`.

**Clean-room note.** COAB's GPL/C# source (`coab_extracted/`) was used *only as a map*
of what to look for. Nothing was copied. Every verdict below cites CoK's own bytes.

## CORRECTION 2026-09-07 — field `+0x198` is MOVEMENT, not initiative

**Everything this document says about `+0x198` is right about the bytes and wrong about
the name.** The reads, the `shl`/`shr`, the group min/max walk are all real and
re-verified below. The field they operate on is the per-combatant **movement rate**.
This matters more than a label, because §5's decision table turns it into a wiring
instruction, and following it would build the wrong mechanic.

The claims being retracted, quoted so they stay findable:

> `0xA9E2  26 8A 85 98 01      mov al,es:[di+0x198]   ; <-- per-combatant INITIATIVE byte`

> "The initiative value is **read from a stored per-combatant byte (struct `+0x198`)**"

> "INITIATIVE = stored per-combatant value, ×2 haste / ÷2 slow, group-resolved, **not**
> a per-round d10 | **VERIFIED-MATCHES-COAB**"

> "Initiative | (COAB doc says) per-round d10 — wrong | **stored byte, ×2 haste / ÷2
> slow, group min/max, descending; never re-rolled** | Confirmed for CoK. Use stored
> `initiative`; haste×2/slow÷2; do not d10."

**Three independent proofs, all re-derived for this correction.**

1. **The same byte is read by the movement calculator.** `CalcMoves` at `0x14EB7` reads
   `es:[di+0x198]` at `0x14EC0` — bytes `26 8a 85 98 01`, byte-for-byte identical to the
   read at `0xA9E2` quoted above. Its result is stored into `actions.move` and is later
   halved (`30 e4 d1 e8`, `xor ah,ah; shr ax,1` at `0x15B59`) and compared against a
   distance in squares. A field consumed as a movement budget is a movement rate.
2. **CoAB names the routine, and preserves the original error in its own comment.**
   `coab_extracted/engine/ovr008.cs:1370`:
   `internal static void calc_group_movement(out byte mov_min, out byte mov_max) /* calc_group_inituative */`
   — the misnomer this document inherited is sitting right there in the trailing comment,
   which is almost certainly where it came from. The decompiled routine's *name* is
   `calc_group_movement`; only its legacy comment says initiative.
3. **The haste/slow behaviour fits movement, not initiative.** Doubling under haste
   (`0x27`) and halving under slow (`0x2A`) is exactly AD&D's effect on movement rate.
   The group min/max walk at `0x20BB-0x20EB` is a party **marching rate**.

**What initiative actually is.** Retail's own Journals (CoK and DoK, near-verbatim) say
each round is divided into 10 segments and "Every character and foe acts on a specific
segment based on a random number. The random segment number is generated at the start of
each combat round and is modified by dexterity and random factors such as surprise." The
CoAB decompile agrees that it is not a stored byte: `ovr014.cs:30` computes
`action.delay = 1d6 + DexReactionAdj`. So initiative is **re-rolled every round** and
**DEX-modified**, and the die is 1d6 in CoAB while the Krynn Journals describe 10
segments — the exact die for CoK is **NOT** established here and is an open question.

**Consequences.**

- `+0x198` should be read as the movement rate wherever this document's §4 offset table
  is used. Note §4 separately lists "move-cost X/Y `0x18D`/`0x18E`" — those are a
  different pair of counters and are not the budget.
- **There is no inches-to-squares divisor**, which is the question this correction came
  out of. `CalcMoves` ends in a single `shl ax,1` (`d1 e0` at `0x14EFE`), so the budget
  is carried in half-squares; an orthogonal step is charged `cost*2` (`d1 e0` at
  `0x155AE`) and a diagonal `cost*3` (`d1 e0 01 f0` at `0x1557C`); display and
  reachability halve it back. The ×2 and ÷2 cancel: **squares per round equals the
  record's movement value, 1:1.**
- **RE.6's `diagCost = 4` against orthogonal 2 (a 2:1 ratio) is refuted — the ratio is
  3:2.** That reading searched for a literal `sub …,3` and missed a `cost*3` multiply.
  `native/src/cccombat.asm` now uses `MOVE_COST_ORTH 2` / `MOVE_COST_DIAG 3`, pinned by
  a mutation-tested fixture. `packages/engine/src/combat/tactical.ts:927` and
  `tactical.test.ts:53` still pin 4 and are **unfixed** — browser track, not touched here.
- Also unfixed, and named so they are not lost: `packages/engine/src/items/combatEquip.ts`
  computes `moveRateToCells = round(rate / 2.4)`, self-labelled an inference standing in
  for a table it calls UNLOCATED — that table is located and the function should be the
  identity; and `native/src/ccparty.asm` divides a DQK `.QSV` byte by 3 and clamps to
  `[1,4]`, which is a divisor of exactly the kind now shown not to exist (its source
  offset is a separate unverified guess).

**The transferable lesson, which is why this is a section and not a one-line edit:** the
error did not come from misreading CoK's bytes. Every byte in §3.1 is correct. It came
from adopting a *name* out of a sibling decompile's stale comment and then treating the
correctly-read bytes as confirmation of it — the document even scores it
`VERIFIED-MATCHES-COAB`, which is true and is the problem: it matched CoAB's comment,
not CoAB's routine name. **A verification that only checks the bytes cannot catch a
wrong label**, and this repo has now hit that class repeatedly.

---


## 1. Container format: how CoK ships its code (FBOV / Borland VROOMM)

| Binary | Role | Evidence |
|---|---|---|
| `START.EXE` | MZ stub / loader. 61 607 bytes, `MZ`, `e_crlc=0` relocs in primary table, CS:IP=0E88:0012. Holds **542 `int 3Fh` (CD 3F) VROOMM call thunks** — the overlay call stubs. | `tools/disasm_cok.py` scan |
| `GAME.OVR` | The overlay **code/data pool** — where combat lives. 269 031 bytes. | header below |

`GAME.OVR` is **not** the textbook "FBOV-appended-after-the-MZ-image" layout. It is a
**standalone overlay file** with a tiny wrapper:

```
0x00  char[4]  'FBOV'                       (46 42 4F 56)
0x04  uint32   body_size = 269023 (= filelen - 8)
0x08  …        the overlay segment pool: concatenated 16-bit far code+data
               segments, each a Borland overlay unit ending in 'retf' (CB / CA).
               A small ascending word table (28 entries, max 0x2F3) trails the
               final segment (its local entry/fixup table). No global directory
               at EOF; the FBOV segment descriptors live in START.EXE.
```

Confirmation it is a flat real-mode code image:
- `0` occurrences of `CD 3F` inside `GAME.OVR` (the thunks are resident in `START.EXE`).
- `827` Borland function prologues `55 89 E5` (`push bp; mov bp,sp`), spanning
  `0x4A … 0x41AAA`; `429` far returns `CB`. Capstone decodes the byte streams cleanly
  as 16-bit code (see §3).

### How GAME.OVR was unpacked for disassembly

We do **not** need to emulate the VROOMM loader to read combat. The overlay pool from
`0x08` onward is treated as a **flat 16-bit code image addressed by file offset**.
Each individual overlay segment has its own `CS`; absolute data references (e.g.
`mov ax,[0x609A]`) go to the resident **`DS` data group** (the same shared data segment
COAB labels `seg600`), and **near-data strings are referenced as `push cs; push offset`
far pointers into the overlay's own code segment**. That last fact gives us a way to pin
an overlay's file base (next section).

> Cross-overlay *calls* (`lcall <seg>,<ofs>` / the `int 3Fh` thunks) are **not** fully
> resolved by this tool — that requires reconstructing START.EXE's FBOV segment table.
> It was unnecessary for the five mechanics, but is the main limitation (see Unknowns).
> RE.3 (§8) inspected START.EXE's 542 `CD 3F` stubs but did **not** rebuild the
> `_SEGTABLE_` selector→file-offset map; the `lcall 0x116/0xDB/0xE6,…` targets the
> movement/attack code reaches remain unflattened.

---

## 2. Pinning the combat overlay (the key to everything else)

The damage routine prints a death message via a far pointer `push cs; mov di,0x2058;
push di`. Computing the file offset of that string for a trial base and matching ASCII:

```
combat_overlay_base (file) = 0x8A46
=> cs:0x2058  ->  file 0x8A46+0x2058 = 0xAA9E  ->  ASCII "dies"      ✓
   cs:0x2063  ->  file 0xAAA9                  ->  " is hit FOR "      ✓
   cs:0x2070  ->  file 0xAAB6                  ->  " points of Damage" ✓
```

So **the combat overlay's code segment begins at file offset `0x8A46`**, and for that
overlay `file_ofs = 0x8A46 + cs_offset` (tool: `disasm_cok.py csfile 0x2058`).
Initiative, damage/death and morale all live in this one overlay (file `0x8A46`–`~0x18000`).

The **movement** code (the "Move/Attack, Move Left = " handler family, strings at
`0xBABF`/`0xCE66`) and the **to-hit / attack-resolution** code (strings `Attacks`
`0x14FFD`, `with one cruel blow` `0x15014`, `and Misses` `0x15050`) live in *the same
overlay region* and were reached by RE.3 (§8) without resolving the cross-overlay thunks.

---

## 3. Located combat routines (CoK's own code)

Run `python tools/disasm_cok.py routines`. Disassembly excerpts cited are reproducible
with `disasm_cok.py dis <ofs> <len>`.

| Routine (our name) | File ofs | cs:ofs | Anchor that found it |
|---|---|---|---|
| `calc_group_initiative` | `0xA9CC` | `cs:0x1F86` | struct field `+0x198`, haste/slow `shl/shr` |
| `apply_damage_and_death` | `0xAAE7` | `cs:0x20A1` | strings `dies` / `is hit FOR` / `points of Damage` |
| `morale_check` | `0xD83D` | `cs:0x4DF7` | strings `is forced to flee` / `Surrenders`, `and al,0x7F` |
| `move_step_orthoX_a` (dirs 2/5/8) | `0x10F30` | — | `add [0x6b2e],2; sub [0x6b3b],2` (RE.3) |
| `move_step_orthoX_b` (dirs 0/3/6) | `0x10F61` | — | `add [0x6b2e],2; sub [0x6b3b],2` (RE.3) |
| `move_step_ortho_Y` | `0x11720` | — | single-axis `sub [di+0x18e],2` (RE.3) |
| `move_step_diagonal` | `0x118D8` | — | both axes `sub [di+0x18d],4; sub [di+0x18e],4; sub [0x6b3b],4; sub [0x6b2e],4` (RE.3) |
| `move_budget_dec` | `0x12314` | — | `dec [0x6b3b]; dec [0x6b2e]` (RE.3) |
| `attack_dice_calc` (×2 copies) | `0x14F24`, `0x3AB30` | — | damage `= field0x107*dice + field0xFF` (RE.3; **`0xFF`=dmg bonus, NOT half-attacks**) |
| `tohit_has_attack_gate` | `0x1785A` | — | gates on `es:[di+0xFF]>0 \|\| es:[di+0x107]>0` (RE.3) |

### 3.1 `calc_group_initiative` @ 0xA9CC

```
0xA9CC  55 89 E5            push bp; mov bp,sp
0xA9D2  A1 9A 60            mov ax,[0x609A]        ; head of combatant list (far ptr in DS)
0xA9D5  8B 16 9C 60         mov dx,[0x609C]
0xA9E2  26 8A 85 98 01      mov al,es:[di+0x198]   ; <-- per-combatant INITIATIVE byte
        … seeds group max [bp+0xA] and group min [bp+6] with it …
0xAA17  b0 27 … lcall       (check affect 0x27 == HASTE)  -> AL
0xAA26  74 0C               je  (no haste)
0xAA2D  D1 E0               shl ax,1               ; INITIATIVE x2 if hasted
0xAA3A  b0 2A … lcall       (check affect 0x2A == SLOW)   -> AL
0xAA50  D1 E8               shr ax,1               ; INITIATIVE /2 if slowed
0xAA5B  26 3A 05 … 26 88 05 cmp/update group max ([bp+0xA]) and min ([bp+6])
0xAA80  26 8B 85 7F 01      mov ax,es:[di+0x17F]   ; advance to next combatant (next-ptr)
0xAA96  CA 08 00            retf 8
```

The initiative value is **read from a stored per-combatant byte (struct `+0x198`)**, not
rolled here. Haste **doubles**, slow **halves**, and the function computes a **group
min/max**. No `rand`/d10 anywhere in this function.

### 3.2 `apply_damage_and_death` @ 0xAAE7

```
0xAAE7  55 89 E5 … sub sp,0x206
0xAAF1  26 80 BD 88 01 06   cmp es:[di+0x188],6    ; status field +0x188; 6 == already dead -> skip
0xAB1D  26 8A 85 97 01      mov al,es:[di+0x197]   ; <-- current HP byte
0xAB22  30 E4               xor ah,ah
0xAB24  05 0A 00            add ax,0x0A            ; HP + 10
0xAB27  3B 46 0A            cmp ax,[bp+0xA]        ; vs incoming damage
0xAB2A  73 35               jae not_killed         ; if (HP+10) >= damage -> SURVIVES
        … death path …                            ; else prints "dies"
not_killed (0xAB61):
0xAB67  bf 58 20 push cs/di  ; "dies"/name
0xAB7B  bf 63 20            ; " is hit FOR "
0xAB90  bf 70 20            ; " points of Damage"
```

**Death only when `damage > HP + 10`** (i.e. `damage >= HP_current + 11`); otherwise the
target survives the blow (and the "is hit FOR N points of Damage" message is printed).
Status enum value `6 == dead` matches the Gold Box `Status` enum.

### 3.3 `morale_check` @ 0xD83D

```
0xD83D  55 89 E5
0xD84A  26 C4 BD 83 01      les di,es:[di+0x183]   ; the per-combatant 'actions' sub-struct
0xD84F  26 C6 45 14 00      mov es:[di+0x14],0     ; clear actions.moral_fail flag
0xD867  26 80 7D 10 00      cmp es:[di+0x10],0     ; actions.fleeing already set?  (forced flee)
…
0xD8A1  26 80 BD E7 00 7F   cmp es:[di+0xE7],0x7F  ; control_morale gate (monsters: byte > 0x7F)
0xD8A7  77 03               ja  compute
0xD8AF  26 8A 85 E7 00      mov al,es:[di+0xE7]
0xD8B4  24 7F               and al,0x7F            ; control_morale & 0x7F
0xD8B6  30 E4 D1 E0         xor ah,ah; shl ax,1    ; * 2  -> morale_score
0xD8BA  A2 3E 6B            mov [0x6B3E],al        ; store morale_score
0xD8BD  80 3E 3E 6B 66      cmp [0x6B3E],0x66      ; clamp > 102 -> 0
0xD8E4  26 8A 85 97 01      mov al,es:[di+0x197]   ; current HP
0xD8EB  ba 64 00 f7 e2      mov dx,100; mul dx     ; HP*100
0xD8F1  f7 f9               idiv cx                ; / maxHP   (cx = es:[di+0x62])
0xD8F8  2b c2               sub ax,dx -> 100 - pct ; = percent wounded
0xD901  3B C2 7C ..         cmp morale_score, percent_wounded; jl -> (pass)
        … fail: second test vs enemy-team health (100 - es:[di+0x58C]) …
        … flee ("is forced to flee") / surrender ("Surrenders") …
```

Morale is a **percentage** = `(control_morale & 0x7F) * 2`, clamped to `0x66 (102)`,
compared against **percent HP lost** = `100 - (HP*100/maxHP)`. It is **not** a 2d6 roll.
The monster-only gate is `control_morale > 0x7F`.

### 3.4 Movement / step-cost (RE.3) — `0x10F30`–`0x12314`

CoK tracks tactical movement in **half-steps** against a budget global **`[0x6B3B]`**
(analogue of DoK `[0xBE6C]`) plus an accumulator **`[0x6B2E]`**, and additionally tracks
per-combatant **X/Y pixel-cost fields `[di+0x18D]` (X) and `[di+0x18E]` (Y)**. Two
near-identical orthogonal-axis stubs and one diagonal stub establish the cost unit:

```
; orthogonal step (one axis), dirs {2,5,8}  @0x10F30  (twin @0x10F61 for dirs {0,3,6})
0x10F53  80 06 2E 6B 02     add byte [0x6B2E],2     ; +2 half-steps used
0x10F58  80 2E 3B 6B 02     sub byte [0x6B3B],2     ; -2 from move budget

; single-axis Y step  @0x11720
0x11747  26 80 AD 8E 01 02  sub byte es:[di+0x18E],2 ; one axis only = 2

; DIAGONAL step (both axes)  @0x118D8
0x118DB  80 2E 3B 6B 04     sub byte [0x6B3B],4     ; -4 from budget
0x118E6  26 80 AD 8D 01 04  sub byte es:[di+0x18D],4 ; X axis -4
0x118F2  26 80 AD 8E 01 04  sub byte es:[di+0x18E],4 ; Y axis -4
0x118F8  80 2E 2E 6B 04     sub byte [0x6B2E],4     ; -4 half-steps (this stub is a refund/undo path)

; per-step budget decrement  @0x12314
0x12314  FE 0E 3B 6B        dec byte [0x6B3B]
0x12318  FE 0E 2E 6B        dec byte [0x6B2E]
```

**Interpretation.** Orthogonal = **2 half-steps** (cost on a single axis). A **diagonal
move pays both axes**, i.e. **4 half-steps = 2 + 2** (the `…,4` deductions act on *both*
`0x18D` and `0x18E`, and on the budget). CoK therefore uses a **Manhattan/2× diagonal
cost (4), NOT a 1.5× / "3 half-step" diagonal**. No `sub [budget],3` or
"`+1`-when-both-axes-nonzero" site exists for movement — see §6. `[0x6B3B]` is seeded to
`0xFF` (255 = "unlimited/sentinel") at setup (`0x11F82`, `0x13E27`) and decremented per
step; `0x6B30`/`0x6B31` that appear adjacent are the **damage** running-value and a
**damage-modifier flag bitfield**, not movement (they are `shl`/`shr`-ed by affect bits).

---

## 4. CoK vs COAB struct-field map (recovered from CoK's own code)

CoK's per-combatant struct uses **different offsets** than COAB (CoK is the earlier/other
build). Several fields are shifted by a consistent `-0x0D`:

| Field | COAB offset | **CoK offset (this disasm)** | Source |
|---|---|---|---|
| current HP | 0x1A4 | **0x197** | 0xAB1D, 0xD8E4 |
| initiative | 0x1A5 | **0x198** | 0xA9E2 |
| next-combatant ptr | (list) | **0x17F** | 0xAA80 |
| status (dead==6) | (Status) | **0x188** | 0xAAF1 |
| control_morale | 0xF7 | **0xE7** | 0xD8A1/0xD8B4 |
| max HP | — | **0x62** | 0xD8F1 (divisor) |
| actions sub-struct ptr | — | **0x183** | 0xD84A |
| actions.fleeing | 0x10 | **0x10** (within actions) | 0xD867 |
| actions.moral_fail | 0x14 | **0x14** (within actions) | 0xD84F |
| haste affect id | — | **0x27** | 0xAA17 |
| slow affect id | — | **0x2A** | 0xAA3A |
| **move-cost X (pixel/half-step)** | — | **0x18D** | 0x118E6, 0x11766 (RE.3) |
| **move-cost Y (pixel/half-step)** | — | **0x18E** | 0x11747, 0x118F2 (RE.3) |
| **direction/facing** | — | **0x10A** | 0x10F33/0x10F68 dispatch on values 0..8 (RE.3) |
| **damage dice count** | — | **0x107** | 0x14FB0, 0x3AB48 (multiplier in `dice*N`) (RE.3) |
| **damage bonus** | — | **0xFF** | 0x14FBD, 0x3AB55 (added to dice product) — **NOT half-attacks** (RE.3) |

Movement globals (DS data group): **`0x6B3B`** = move budget (half-steps; DoK `0xBE6C`),
**`0x6B2E`** = half-steps-used accumulator, **`0x6B30`** = damage running value,
**`0x6B31`** = damage-modifier flag bitfield. CoK's **half-attacks** field and any
**split/recombine** of fractional attacks were **NOT located** (see §6).

---

## 5. Verdicts — the five mechanics tactical.ts assumes

| # | Mechanic (as assumed from COAB) | **Verdict vs CoK's own code** | CoK evidence |
|---|---|---|---|
| 1 | INITIATIVE = stored per-combatant value, ×2 haste / ÷2 slow, group-resolved, **not** a per-round d10 | **VERIFIED-MATCHES-COAB** | `calc_group_initiative` @0xA9CC; field **0x198**; `shl/shr ax,1`; group min/max; list-walk |
| 2 | DIAGONAL move costs 1.5× (half-steps: orth=2, diag=3) | **PARTIAL** — half-step **unit VERIFIED** (orthogonal = **2**); but CoK's diagonal pays **both axes = 4** (2× / Manhattan), **NOT 3 (1.5×)**. The COAB "diag=3" cost is **REFUTED-for-CoK / UNLOCATED as a literal** | `move_step_diagonal` @0x118D8 (`sub [0x6b3b],4`, `sub [di+0x18d],4`, `sub [di+0x18e],4`); orthogonal stubs @0x10F30/0x10F61/0x11720 (`…,2`) |
| 3 | DEATH: 0 HP = down; truly dead only when one hit's damage ≥ hp + ~10 | **VERIFIED-MATCHES-COAB** (exact: dead iff **damage > HP+10**) | `apply_damage_and_death` @0xAAE7: `HP(+0x197)+10`, `cmp ax,damage / jae not_killed`; status `+0x188==6` |
| 4 | ATTACKS: fractional 3/2 stored in half-units, alternating per round | **UNLOCATED** | the DoK `field/2 → g1`, `field&1 → g2`, recombine `g1<<1+g2` idiom is **absent** from GAME.OVR's overlays (exhaustive byte scan: 0 windows with both `/2` and `&1` storing to two globals). CoK field `0xFF` = **damage bonus**, not half-attacks. The swing-count loop is reached via cross-overlay `lcall 0x116/0xDB/0xE6,…` not in this file |
| 5 | MORALE: % = (control_morale & 0x7F)·2, clamp 102, fail when below %HP-lost; flee | **VERIFIED-MATCHES-COAB** | `morale_check` @0xD83D: `and al,0x7F; shl ax,1`; clamp `0x66`; `100-(HP*100/maxHP)`; flee/surrender strings |

**3 of 5 confirmed directly against CoK's own bytes; #2 upgraded to PARTIAL (half-step
unit ortho=2 VERIFIED; diag=3 refuted/unlocated — CoK uses diag=4); #4 remains UNLOCATED
(swing-count is cross-thunked; the DoK split idiom is provably not in this file).**

---

## 6. Open questions / unknowns

- **UNLOCATED-4 (fractional attacks).** RE.3 exhaustively scanned `GAME.OVR` for DoK's
  split idiom (`field0xFF/2 → [g1]`, `&1 → [g2]`, recombine `[g1]<<1+[g2]`): **zero**
  matches. CoK's struct field `0xFF` is the **damage bonus** (used as `dice*0x107 + 0xFF`
  at `0x14FBD` and `0x3AB55`), **not** half-attacks. The to-hit gate `0x1785A` reads
  `0xFF`/`0x107` only to test "has any attack". The per-round **swing-count loop** is
  reached through cross-overlay `lcall 0x116,…` / `lcall 0xDB,…` / `lcall 0xE6,…` whose
  targets are not present in this overlay file. **CoK's half-attacks field offset and its
  split/recombine remain UNLOCATED.** (DoK confirms the 3/2 half-unit model for the shared
  Gen1 engine — `disasm-combat-dok.md` §3.4, field `0xFF`, globals `0x8C52/0x8C54` — so the
  *rule* is known for the generation even though CoK's own listing does not show it.)
- **UNLOCATED-2 (diagonal = 3).** The half-step **unit is now VERIFIED for CoK**
  (orthogonal = 2; `move_step_*` @0x10F30/0x11720). But CoK's diagonal **costs 4**
  (`move_step_diagonal` @0x118D8 deducts 4 on *both* axes and on the budget), i.e. a **2×
  Manhattan diagonal, not the 1.5× "3 half-step" COAB rule**. No `sub [budget],3` or
  `+1-if-both-axes-nonzero` movement site exists. So the **explicit diagonal=3 cost is
  UNLOCATED for CoK** — and the byte evidence actually **points to diag=4**, consistent
  with DoK leaving diag=3 unlocated (DoK only showed the uniform per-axis deduction too).
  Whether CoK ever applies a 1.5× diagonal at a higher path-cost layer (reached via the
  cross-overlay `lcall 0x116`) is **UNKNOWN**.
- **Cross-overlay call resolution.** RE.3 inspected START.EXE's 542 `CD 3F` stubs but did
  **not** rebuild the FBOV `_SEGTABLE_` (selector→file map). Doing so would let the tool
  follow `lcall 0x116/0xDB/0xE6,…` into the swing-count and any higher movement-path code.
- **`maxHP` field (0x62) vs status fields.** 0x62 confirmed only as the morale divisor;
  whether it is "max HP" vs "max HP this combat" is inferred from context **(inferred)**.
- **Affect-id table.** Haste=0x27, slow=0x2A are read by the initiative routine; the full
  affect-id enumeration for CoK was not dumped.

---

## 7. Implications for our engine — delta table "what tactical.ts needs for CoK"

| Mechanic | tactical.ts today (per COAB doc) | CoK-confirmed requirement | Action |
|---|---|---|---|
| Initiative | (COAB doc says) per-round d10 — wrong | **stored byte, ×2 haste / ÷2 slow, group min/max, descending; never re-rolled** | Confirmed for CoK. Use stored `initiative`; haste×2/slow÷2; do not d10. Affect ids haste=0x27, slow=0x2A. |
| Death | `hp<=0 => slain` | **survive unless `damage > HP+10`; HP=0 is down/unconscious; status 6 = dead** | Confirmed for CoK. Add unconscious/dying band; dead iff `damage > hp+10`. |
| Morale | "2d6 vs 12" | **percent: `(ctrl_morale & 0x7F)*2` clamp 102, fail if `< 100-(hp*100/maxHP)`** | Confirmed for CoK. Replace 2d6 with this %; monster-only gate `ctrl_morale>0x7F`; flee vs surrender. |
| Diagonal move | Chebyshev (cost 1) | **Half-step unit VERIFIED (orthogonal = 2). CoK diagonal = 4 (both axes), i.e. 2× — the 1.5× "diag=3" rule is NOT present in CoK's listed code** | Use half-step units (ortho=2). For CoK's *located* behaviour, diagonal = 4 (2×). Keep COAB's 1.5× only if a higher path-cost layer (cross-thunk, UNLOCATED) is later shown to override; flag this. |
| Fractional attacks | integer attacksPerRound | **UNLOCATED in CoK's own listing** — DoK confirms half-units + round parity for the shared Gen1 engine | Use the DoK-confirmed Gen1 rule (half-units, alternate extra swing by round parity); flag CoK's own swing-count site as UNLOCATED (cross-thunk). |
| Struct loader | COAB offsets (HP 0x1A4, init 0x1A5, morale 0xF7…) | **CoK offsets differ**: HP 0x197, init 0x198, status 0x188, ctrl_morale 0xE7, maxHP 0x62, actions ptr 0x183, move-cost X/Y 0x18D/0x18E, facing 0x10A, dmg dice/bonus 0x107/0xFF | When a CoK-specific save/combatant loader is built, use the CoK offsets in §4, not COAB's. |

> Bottom line: where CoK's own code was reachable (initiative, death, morale, **and now the
> movement half-step unit**) it **matches COAB's *rules*** but uses **different struct
> offsets**. The diagonal **cost literal** in CoK's listed code is **4 (2×), not the COAB
> 1.5×**, and the **fractional-attack swing-count** remains cross-thunked/UNLOCATED in CoK
> (confirmed for the Gen1 generation by DoK). tactical.ts should treat CoK's higher-layer
> diagonal cost and its swing-count site as provisional until the START.EXE thunk table is
> reconstructed.

## 8. RE.3 follow-up — pinning movement + fractional attacks

**Scope.** Close the two CoK UNLOCATEDs (§6 items 2 and 4) by tracing the movement handler
(`0xBAF3` region) and searching all `GAME.OVR` overlays for the DoK split idiom.

**Result.** (A) Fractional attacks: **UNLOCATED** — the DoK `field/2 + &1 → two globals`
split is provably absent from `GAME.OVR`; CoK field `0xFF` is the *damage bonus*, the
swing-count loop is cross-thunked. (B) Movement: **half-step unit VERIFIED (ortho=2)**;
**diagonal=3 UNLOCATED** (CoK's located diagonal costs **4** = 2×, both axes); haste×2 on
movement was already confirmed in §3.1 (initiative `shl/shr`), and no separate movement-only
`shl/shr [budget]` modifier gated by an affect bit was located in CoK's overlay (the
haste/slow movement scaling, if separate from initiative, is **UNLOCATED for CoK** — DoK has
it at `0x1D826`/`0x1DB55`).

**Reproduce.**
```
python tools/disasm_cok.py dis 0x10f30 0x90    # orthogonal step stubs (ortho = 2 half-steps)
python tools/disasm_cok.py dis 0x11720 0x60    # single-axis Y step (sub [di+0x18e],2)
python tools/disasm_cok.py dis 0x118a0 0x80    # DIAGONAL step (sub …,4 on both axes + budget)
python tools/disasm_cok.py dis 0x12300 0x90    # per-step budget dec ([0x6b3b]/[0x6b2e])
python tools/disasm_cok.py dis 0x1785a 0x140   # to-hit gate: tests field 0xFF/0x107 > 0
python tools/disasm_cok.py dis 0x14f24 0xB0    # damage dice calc: dice*0x107 + 0xFF (0xFF = bonus, NOT attacks)
python tools/disasm_cok.py strings "and Misses"# attack-segment string anchor (file 0x15050)
# Negative result (fractional-attack split absent): byte scan in §6 — no window in GAME.OVR
# has both a /2 and an &1 storing to two distinct globals (the DoK 0x13E2E idiom).
```

## 9. RE.5 — FBOV call-table reconstruction + RE.6 diagonal verdict

This section reconstructs the Borland VROOMM cross-overlay call table so the
disassembler can follow `lcall`/`INT 3Fh` calls between overlays, then uses it to
settle RE.6 (the real tactical diagonal-movement cost). **All evidence is CoK's own
bytes** (`Champions of Krynn/START.EXE`, `…/GAME.OVR`); the cited third-party docs
were used only as a map. New tool commands: `overlays`, `resolve`, `thunk`.

### 9.1 The VROOMM stub format (verified against CoK's bytes)

START.EXE holds **542 `CD 3F` (INT 3Fh) records**. They are of **two kinds**, both
seen in the byte stream and disambiguated by the word at +0x02:

**(a) Overlay descriptor header — 0x10 bytes** (`saveret`/word@+2 == 0):

| Off | Width | Field | Meaning |
|---|---|---|---|
| +0x00 | 2 | `0x3FCD` | the `CD 3F` opcode (little-endian) |
| +0x02 | 2 | `saveret` | 0 in the header |
| +0x04 | 4 | `fileofs` | **the overlay's CODE base as a GAME.OVR file offset** |
| +0x08 | 2 | `codesz` | overlay code size |
| +0x0A | 2 | `fixupsz` | fixup-table size |
| +0x0C | 2 | `jmpcnt` | number of public-entry stubs that follow |

…immediately followed by `jmpcnt` entry stubs of kind (b).

**(b) Public-entry stub — 5 bytes:** `CD 3F <word proc_off> 00`. `proc_off` is the
entry's **CS-relative offset inside that overlay's code**. (This matches the GeReV
`BorlandOverlayHeaderRecord` map: opcode, saveret, fileofs(4), codesz, fixupsz,
jmpcnt, then `jmpcnt` 5-byte traps — confirmed here field-for-field on CoK's bytes.)

> The 5-byte samples in the task brief decode cleanly under (b):
> `0x591: CD 3F B2 00 00` → entry `proc_off=0x00B2`; `0x596: CD 3F 42 08 00` →
> `proc_off=0x0842`. The brief's tentative "`<word off><byte overlay_id>`" reading is
> **corrected**: the trailing byte is the stub's `00` padding, **not** an overlay id;
> the overlay is identified by the *descriptor* the stub belongs to, not a byte field.

Scanning START.EXE for kind-(a) headers with a sane `fileofs`/`codesz`/`jmpcnt`
yields **35 overlay descriptors** whose `fileofs` ascend monotonically and tile the
entire GAME.OVR pool (`0x8 … 0x417af+0x300 ≈ EOF 0x41ae7`). Run
`python tools/disasm_cok.py overlays`. (Descriptor #7, `fileofs=0x8a41`,
`jmpcnt=25`, is the combat overlay — consistent with the independently pinned combat
code base `0x8A46`, §2.)

### 9.2 overlay_id → file_base (how `lcall` is resolved)

**Correction, 2026-09-08:** the packed-image `0xDB` resolution below is
superseded. All 25 distinct DB call offsets resolve through the EXEPACK-unpacked
resident stubs to one prologue-consistent base, **`0x33FAB`**, with no `-1`
adjustment. DB:2A resolves to `0x34153` (procedure `0x1A8`), and DB:84 to
the healing routine `0x36195` (procedure `0x21EA`). The earlier base
`0x365A6` does not resolve that healing call. Reproduce with
`tools/analyze_cok_rest.py`; see `cok-retail-rest-contract.md`. The historical
formula/table below must not be used as current DB target evidence.

A cross-overlay call is `lcall <sel>:<off>` (opcode `9A off2 sel2`), e.g. the
diagonal handler at `0x118D8` issues `lcall 0xDB:0x2A` (bytes `9a 2a00 db00`). `sel`
is a **VROOMM virtual overlay segment**; `off` indexes that overlay's **resident stub
table** in START.EXE. The resolution is two hops:

```
1) resident stub  = START.EXE[ 0x200 (MZ hdr) + sel*16 + off - 1 ]   = CD 3F <proc_off> 00
2) real target    = overlay_base(sel) + proc_off       (a GAME.OVR file offset)
```

The `-1` skew is the resident image's load-base adjustment (calibrated and held
constant). `overlay_base(sel)` is recovered **empirically and self-validatingly**:
it is the unique descriptor `fileofs` under which **every** stub `proc_off` reached
through `sel` lands on a Borland prologue (`55 89 E5` / `55 8B EC`). That prologue
agreement *is* the validation.

**Validation examples (reproducible):**

| Call | resident stub | proc_off | overlay_base(sel) | target (GAME.OVR) | check |
|---|---|---|---|---|---|
| `lcall 0xDB:0x2A` | START.EXE 0x0FD9 | 0x2888 | **0x365A6** | **0x38E2E** | 18/18 stubs → prologues; target = `55 89 E5` ✓ |
| `lcall 0xA8:0x43` | START.EXE 0x0CC2 | 0x57EB | **0x2DC0B** | **0x333F6** | 14/14 stubs → prologues; target = `55 89 E5` ✓ |
| ~~`lcall 0xE6:…`~~ | (sel*16 region) | — | ~~0x3AE3F~~ | — | **CORRECTED 2026-07-01 (see `disasm-spells-krynn.md` §25.4): the "10/12" figure was from a small, non-representative sample of `0xe6`'s call sites. Re-tested with the full 47-site sample harvested from every `lcall 0xe6:…` in `GAME.OVR`, the vote is 2/47 — statistically indistinguishable from noise, not a resolution. `0xe6` is RECLASSIFIED UNRESOLVED, joining `0x111`/`0x116`/`0x128`/`0xA46`.** |

```
python tools/disasm_cok.py resolve 0xdb 0x2a     # -> base 0x365a6, target 0x38e2e + disasm
python tools/disasm_cok.py resolve 0xa8 0x43     # -> base 0x2dc0b, target 0x333f6
python tools/disasm_cok.py thunk   0xfd9         # decode one resident stub
python tools/disasm_cok.py overlays              # the 35-descriptor table
```

**Honesty / scope.** Only selectors whose stub table actually lives at
`0x200 + sel*16` resolve (the **first** VROOMM stub segment, `sel ≲ 0x109`).
**Larger virtual segments — `0x111`, `0x116`, `0x128`, `0xA46`, and (corrected
2026-07-01) `0xE6`** — do not resolve via this formula. This does **not** affect
RE.6: the movement handler's cost-bearing calls that RE.6 actually relies on go to
`0xDB`/`0xA8` (both resolve, high-confidence, §9.2 table); `0xE6` was never part of
the RE.6 evidence chain (§9.3 below uses only `0xDB` and the located `0x118D8` cost
site), so RE.6's verdict is unaffected by the `0xE6` reclassification.

> **Update (2026-07-01, `docs/engine/research/disasm-spells-krynn.md` §25).** The
> "2nd VROOMM stub segment" framing above turned out to be imprecise: there is no
> evidence of a second *clean, uniformly-strided* table anywhere in `START.EXE`.
> Diagnosis from CoK's own validated 35-descriptor list: each descriptor's true
> header+fixup+stub-array byte span is **variable** (~22–28 bytes for the
> header/fixup region alone, correlating with each descriptor's own nonzero
> `fixupsz` field, not a flat 16-byte "paragraph slot"), so `0x200+sel*16` is only
> an **approximation** whose accumulated drift stays tolerable for low/early
> selectors (`0xDB`, `0xA8`) and exceeds it for others (`0x111`/`0x116`/`0x128`/
> `0xA46`/`0xE6`) — at which point the formula lands **inside a different,
> unrelated descriptor's own real stub array** by file-position coincidence,
> which is why weak/spurious votes (2/47, etc.) still turn up without ever
> converging on one high-confidence base. `0xE6`'s call-offset fingerprint (47
> stride-5 offsets `0x25`-`0x10b`) was also found to be an exact subset of DoK's
> own unresolved selector `0xcf` (the §12.2 saving-throw call in
> `disasm-spells-krynn.md`) — strong evidence CoK's §15 rear-arc gate and DoK's
> save-throw resolver invoke the *same* shared Gen1 routine. The
> resident-RTL/graphics hypothesis for `0x116`/`0xA46` was tested directly
> (reading START.EXE as resident code, no stub indirection) and did **not**
> produce plausible code — remains an unconfirmed hypothesis, not a working
> explanation. **DoK's own 35-descriptor FBOV table has now been reconstructed
> from DoK's own bytes (35, not 34 — the earlier "34 vs 35" note undercounted)
> and `overlays`/`resolve`/`thunk` ported into `tools/disasm_dok.py`**, validated
> with a positive control on 4 DoK-native selectors (`0xc5` 23/23, `0x92` 17/17,
> `0x5a` 12/12, `0xe5` 4/4). See `disasm-spells-krynn.md` §25 for the full
> writeup, evidence, and the concrete next static step (reverse the per-descriptor
> fixup-table record format, whose existence — nonzero `fixupsz` fields — is now
> confirmed but whose layout is not).

> **Correction (2026-09-25).** The preceding “Only selectors whose stub table actually lives
> at `0x200 + sel*16` resolve” statement is historical and no longer describes the current
> resolver. `tools/vroomm_layout.py` now validates the CoK selector base (`0x38`, score 1891,
> runner-up 730), sorted-u16 fixups, and paragraph-rounded public-stub geometry. The CoK
> `resolve` command uses that geometry and maps selectors such as `DB:34`, `65:43`, and
> `E6:C0` to their verified `GAME.OVR` targets. Segment words without a descriptor-owned
> public stub remain unresolved. See `vroomm-fixup-layout.md` and the 2026-09-25 entry in
> `cok-item-removal-native-plan.md` for this continuation’s concrete examples.

### 9.3 RE.6 — the diagonal movement-cost verdict

**Verdict: VERIFIED 2× (Manhattan, 4 half-steps).** CoK's tactical diagonal pays the
full cost of **both** axes; there is **no** 1.5× / "5-10-15" / `diag=3` layer anywhere
in CoK's code — neither at the located step site nor up the cross-overlay path now
that the path is resolvable.

Evidence, three independent strands:

1. **The cost site (located, §3.4).** `move_step_diagonal` @ `0x118D8` deducts **4**
   on both per-combatant axis fields and on the budget:
   `sub [0x6B3B],4` · `sub es:[di+0x18D],4` · `sub es:[di+0x18E],4`. Orthogonal steps
   pay **2** on one axis (`0x10F30`/`0x11720`). So diagonal = 2+2 = ortho×2.

2. **The cross-overlay path is now followed and is non-cost.** The diagonal handler's
   `lcall 0xDB:0x2A` resolves to **`0x38E2E`** (overlay base `0x365A6`). Disassembly
   shows a **path-build / step-animation** routine: it allocates a 0x300-byte path
   buffer, builds 3-byte path records `(x,y,dir)` indexed by `shl di,1; add di,si`
   (a **×3 array stride**, *not* a ×1.5 cost), and draws via `lcall 0xA46:0x163E`
   (combat-overlay blit) and screen-coord helpers `lcall 0x116:0x5C/0x61/0x66`. **No
   budget/cost arithmetic occurs here** — the cost was already paid at `0x118D8`
   before the call.

3. **Exhaustive cost census (negative result).** A full byte-census of immediate
   add/sub on the movement quantities across all of GAME.OVR:
   - budget `[0x6B3B]`: only `−2` (×3), `−4` (×4), `+2` refund (×1); seed `=0xFF`.
   - accumulator `[0x6B2E]`: `+2`/`+4`/`−4`, **and `+3` (×2)** — but both `+3` sites
     (`0x10FAC`, `0x11285`) are **damage-resist** code, gated on the damage-flag
     bitfield `[0x6B31] & {1,2}` and halving the damage value `[0x6B30]` (`shr ax,1`);
     they are **not** movement.
   - per-combatant axis fields `es:[di+0x18D]`/`[di+0x18E]`: immediates are **only**
     `2` and `4` (plus position `cmp`s 0x34/0x39/0x3C). **No `3` anywhere.**

   There is **no `sub [budget],3`**, no `+1-when-both-axes-nonzero`, and no
   `ortho*3/2` site in CoK's code. The only `×3` near movement is the path-record
   stride in (2).

**Implication for `tactical.ts`.** CoK's tactical diagonal cost is **2× (cost 4,
half-step unit = 2)** — a Manhattan diagonal, *not* the COAB "diag=3 / 1.5×" rule.
The earlier §5/§6 "UNLOCATED-2 (diagonal=3)" and the "UNKNOWN: higher path-cost layer"
caveat are now **closed**: the higher layer was located (`0x38E2E`) and applies **no**
diagonal cost multiplier. If `tactical.ts` currently carries the COAB 1.5× diagonal
for CoK, it should be corrected to 2× (the engine change is the lead's call).

---

## Sources
- CoK binaries: `Champions of Krynn/START.EXE`, `Champions of Krynn/GAME.OVR` (user-owned).
- Tool: `tools/disasm_cok.py` (this repo).
- FBOV/VROOMM format: GeReV `LoadBorlandOverlays.java`
  (https://github.com/GeReV/ghidra_scripts/blob/main/LoadBorlandOverlays.java);
  Ghidra issue #5543 (https://github.com/NationalSecurityAgency/ghidra/issues/5543);
  reWolf "Reverse engineering Might and Magic III compression" (http://blog.rewolf.pl/blog/?p=1202).
- Map-only reference (not copied): `coab_extracted/` (Simeon Pilgrim COAB decompile, GPL),
  distilled in `docs/engine/research/combat-mechanics-coab.md`.
- DoK cross-check (same Gen1 engine): `docs/engine/research/disasm-combat-dok.md`
  (fractional-attack split `0x13E2E`, base step cost `0x1E2A2`).
