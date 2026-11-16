# Pools of Darkness — the wilderness leg

**Status: proven (static, byte-level).**

**Scope:** what selects wilderness mode in Pools of Darkness, what actually loads `WILDCOM.DAX`,
which script blocks are the overland maps, what coordinate space the party moves in while out
there, how a party gets into it, and that a wandering encounter on an overland map runs
end-to-end through the real `EclVm` on retail bytes.

**Evidence class:** retail file bytes + capstone disassembly of the retail `GAME.OVR` / `GAME.EXE`
+ real-VM execution in `packages/engine`. **No DOSBox-X / native trace was run** (the task
forbade it). Every claim below is either a byte assertion you can re-check or a VM run you can
re-execute; nothing is hand-simulated.

Golden test: `packages/engine/test/poolsWildernessRoute.test.ts` (all passing against the retail
install, no skip when the data is present).

Retail install used (read-only), resolved via `goldbox_corpus` / `binary_inventory`:
`C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\`

| file | bytes | SHA-256 |
|---|---|---|
| `GAME.OVR` | 264,086 | `bac46d171d1f11584c94beeec4cda548aa797e0b25b899b199a2c49c6e63d402` |
| `GAME.EXE` | 64,203 | `35ad635e558852925b7028a921aacafc2df8e84be24a8a1136c6267471948d69` |
| `ECL1.DAX` | 329,456 | `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af` |
| `GEO1.DAX` | 28,349 | `d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f` |
| `WILDCOM.DAX` | 48,523 | `975ef888397e52efae5abeeb367807265a9755c5cf27afb353094aea50a18421` |
| `DUNGCOM.DAX` | 65,353 | `90ebb12701dacc0ccc4bca47ae01b6fc9ab7f14fb6657c4f3bf146129534c32f` |
| `MON1CHA.DAX` | 13,428 | `dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef` |

Addressing convention: Gen1 `vbase = 0x7FFE`, so **file offset = vaddr − 0x8000 + 2**.
Dialect is `ECL_GEN1_SHORT_POOLS` — word sets `{12:4, 29:0, 31:1, 33:2, 34:0, 35:0, 44:1, 55:2}`,
obtained from `gen1_ecl_encounter_scan.word_sets_for_profile('pools-of-darkness')`.
Gen1 `SAVE` is **(source, destination) — destination last**.

`GAME.OVR` is a Borland **FBOV/VROOMM** overlay pool (`"FBOV"` at offset 0). Every `GAME.OVR`
address below is a **file offset**; where a segment-local is useful it is given alongside so the
disassembly can be reproduced.

| GAME.OVR segment base | contains |
|---|---|
| `0x065EB` | `vm_GetMemoryValueType`, `vm_SetMemoryValue` |
| `0x0B6E6` | `SetupGroundTiles` — the DungCom/WildCom loader |
| `0x0D577` | the movement dispatcher and both steppers |

---

## 0. Why the `0x4BE6` zero is not evidence of absence

The corpus-wide Gen1 area-mode scan (`tools/map_gen1_area_mode_writes.py`, which looks for
`SAVE <n>, 0x4BE6`) reports **zero** wilderness-mode writes for Pools even though the game ships
`WILDCOM.DAX`. That zero is a **model mismatch, not an absence**.

`0x4BE6` is the CoAB/Gateway host address of `Area1.inDungeon` (`Area1` struct offset `0x1CC`).
Pools does not expose host addresses to ECL at all. Its `vm_GetMemoryValueType` classifies an ECL
*location* into a type before any access. The ladder at file `0x06BA4` (capstone output, asserted
byte-for-byte in test B):

```
06ba4  c6 46 ff 04        mov  byte [bp-1], 4        ; default type 4
06ba8  83 7e 06 01        cmp  word [bp+6], 1
06bac  72 0d              jb   0x6bbb
06bae  81 7e 06 00 04     cmp  word [bp+6], 0x400
06bb3  77 06              ja   0x6bbb
06bb5  c6 46 ff 00        mov  byte [bp-1], 0        ; 1..0x400     -> type 0 = area struct
06bb9  eb 26              jmp  0x6be1
06bbb  81 7e 06 01 04     cmp  word [bp+6], 0x401
06bc0  72 0d              jb   0x6bcf
06bc2  81 7e 06 00 08     cmp  word [bp+6], 0x800
06bc7  77 06              ja   0x6bcf
06bc9  c6 46 ff 01        mov  byte [bp-1], 1        ; 0x401..0x800 -> type 1 = player
06bcd  eb 12              jmp  0x6be1
06bcf  81 7e 06 00 80     cmp  word [bp+6], 0x8000
06bd4  72 0b              jb   0x6be1
06bd6  81 7e 06 ff 9d     cmp  word [bp+6], 0x9dff
06bdb  77 04              ja   0x6be1
06bdd  c6 46 ff 02        mov  byte [bp-1], 2        ; 0x8000..0x9DFF -> type 2 = script buffer
06be1  8a 46 ff           mov  al, [bp-1]
```

**Pools' own bound differs from Treasures'**: Treasures' type-2 window is `0x8000..0xB6B0`, Pools'
is `0x8000..0x9DFF`. A *measured* difference between the two titles, recorded rather than assumed
away.

`0x4BE6` therefore lands in the **default type-4 bucket**, and `vm_SetMemoryValue`'s type dispatch
handles only types 0, 1 and 2 before falling through to a bare `retf 6` (file `0x06EBA`…`0x06F11`):

```
06eba  ...  8b 46 0a           mov  ax, [bp+0xA]         ; type 0 tail: location
06ec2       c4 3e f8 87        les  di, [0x87F8]         ; area_ptr
06ec6       03 f8              add  di, ax
06ec8       81 c7 ff ff        add  di, 0xFFFF           ; area_ptr + location - 1
06ed4       9a 5c 1a 25 08     lcall 0825:1A5C           ; ...store
06ed9       eb 33              jmp  0x6f0e
06edb  3c 01  75 0c            cmp  al,1 / jne           ; type 1 -> player setter (call 0x6c3f)
06eeb  3c 02  75 1f            cmp  al,2 / jne           ; type 2 -> les di,[0x87FC]; add di,ax; add di,0x8000
06f0e  89 ec 5d ca 06 00       mov sp,bp; pop bp; retf 6 ; types 3/4: NOTHING IS WRITTEN
```

So a script write to `0x4BE6` in Pools would be **silently discarded**. Consistently, scanning every
word-operand encoding this VM accepts (`0x01`/`0x02`/`0x03` three-byte forms and the `0x7F`
two-byte short form — see `packages/engine/src/ecl/vm.ts` `rvalue`) across all 56 blocks finds
**0** occurrences of `0x4BE6`.

## 1. Pools' ECL memory model: `location → area[location − 1]`

The type-0 tail above resolves an ECL location as `area_ptr + location − 1`, i.e. ECL location `L`
is area-struct byte `area[L−1]`. `area_ptr` lives at `DS:0x87F8`.

This is the same relation `ECL_GEN1_SHORT_POOLS` in `packages/engine/src/ecl/disassemble.ts`
already carries independently for Pools (`lastBlockIdAddr: 0x0016`, documented as "CMD_NewECL's
Area+0x15 store").

## 2. Pools' `inDungeon` **is** ECL location `0x0022` — and the corpus uses it constantly

`vm_SetMemoryValue` special-cases several area fields (compared against `location − 1`). The
`0x21` arm, at file `0x06E16` (test B pins all 54 bytes):

```
06e16  3d 21 00           cmp  ax, 0x21              ; ax = location-1  => ECL location 0x0022
06e19  75 33              jne  0x6e4e
06e1b  c4 3e f8 87        les  di, [0x87F8]
06e1f  26 8a 45 21        mov  al, es:[di+0x21]
06e23  30 e4              xor  ah, ah
06e25  3b 46 08           cmp  ax, [bp+8]            ; unchanged?
06e28  74 22              je   0x6e4c
06e2a  c6 06 f2 a9 00     mov  byte [0xA9F2], 0
06e2f  a0 0c 88           mov  al, [0x880C]          ; game_state
06e32  a2 0d 88           mov  [0x880D], al          ; previous game_state
06e35  83 7e 08 00        cmp  word [bp+8], 0
06e39  75 0c              jne  0x6e47
06e3b  c6 06 0c 88 03     mov  byte [0x880C], 3      ; game_state = WILDERNESS
06e40  31 c0              xor  ax, ax
06e42  a3 f8 a9           mov  [0xA9F8], ax
06e45  eb 05              jmp  0x6e4c
06e47  c6 06 0c 88 04     mov  byte [0x880C], 4      ; game_state = DUNGEON
```

**`area[0x21]` is effectively ECL-owned.** A census of every native access encoding in the whole
overlay pool:

| encoding | count | sites |
|---|---|---|
| `26 c6 45 21 imm` — `mov byte es:[di+0x21], imm` (write) | 2 | `0x1A4D1`, `0x1A836` |
| `26 88 45 21` — `mov es:[di+0x21], al` (write) | 0 | — |
| `26 8a 45 21` — `mov al, es:[di+0x21]` (read) | 1 | `0x06E1F` (the ECL setter itself) |
| `26 80 7d 21 imm` — `cmp byte es:[di+0x21], imm` (read) | 25 | pervasive |

Both native writes are field-initialiser runs (`les di,[0x87F8]` at `0x1A4CD` / `0x1A832`, then
`area[0x21] = 1`, `area[0x15] = 0`, `area[0x38] = 0x0A`) — i.e. the engine's own init sets
**dungeon** mode, and ECL is the only thing that ever lowers it. 26 native reads against 2
init-time writes.

**Recall-checked (2026-08-06):** the census above was re-run over **all 8 ModRM base-register forms**
× opcodes `0x88`/`0x8A`/`0xC6`/`0x80`/`0x38`/`0x3A`/`0x00`/`0x08`/`0x20`/`0x30`/`0xFE` with an ES
override and `disp8 = 0x21`, across `GAME.OVR` **and** `GAME.EXE`/`STARTUP.EXE`/`CONTROL.EXE`/
`VACE.EXE`. The result is unchanged.

**A THIRD independent engine consumer of the same flag (added 2026-08-06):** `vm_GetMemoryValue`'s
`loc−1 == 0x10` arm at `GAME.OVR` file `0x06FD4` does `cmp byte es:[di+0x21], 0` and returns the
**raw 8-way facing** `[0xA9F5]` when it is 0, the **halved 4-way ordinal** otherwise — i.e. the
retail engine itself ties `area[0x21] == 0` to 8-way overland movement, which is exactly what the
8-way delta table the route uses requires. The first draft reported only two consumers
(`SetupGroundTiles` and the `[0x880C]` setter arm).

**And Pools' 56-block corpus uses it heavily** — the sharpest single difference from Treasures,
where the equivalent location is never referenced at all. A raw `SAVE #imm → [0x0022]` census
(`09 00 vv 01 22 00`) over all 56 blocks finds **25 sites — 14 writing 1 (dungeon) and 11
writing 0 (wilderness)**:

| block | vaddrs writing 0 (wilderness) | vaddrs writing 1 (dungeon) |
|---|---|---|
| 1 | `0x87F4` | `0x8032`, `0x8811` |
| 3 | `0x8028` | `0x8412` |
| 17 | `0x801A`, `0x8722`, `0x91A6`, `0x9297` | `0x919F`, `0x9290`, `0x9659` |
| 18 | — | `0x8014`, `0x872D`, `0x8829` |
| 25 | `0x801A`, `0x8925`, `0x8A16` | `0x891E`, `0x8A0F`, `0x8BA8` |
| 51 | `0x801A` | `0x87B4` |
| 80 | `0x801A` | `0x8802` |

## 3. What actually loads `WILDCOM.DAX`: `SetupGroundTiles`, and **one** condition, not two

The archive names are Borland Pascal length-prefixed literals in segment `0x0B6E6`:

```
0x0C563: 07 44 75 6e 67 43 6f 6d      .DungCom     (segment-local cs:0x0E7D)
0x0C58B: 07 57 69 6c 64 43 6f 6d      .WildCom     (segment-local cs:0x0EA5)
```

**Mixed case** — a case-sensitive `WILDCOM` search over the binary finds nothing. **Unlike
Treasures the two literals are not adjacent**: Treasures packs them back-to-back; Pools separates
them by `0x28` bytes, and the `WildCom` literal is immediately followed by a routine prologue.
Measured difference, recorded.

Each literal is referenced from **exactly one** site in the entire overlay pool
(`mov di,0x0EA5` occurs once, at `0x0C5EF`; `mov di,0x0E7D` once, at `0x0C5A9`), so
`SetupGroundTiles` is the sole loader of either archive.

`SetupGroundTiles` starts at segment-local `0x0EAD` (file `0x0C593`). Its predicate:

```
0c593  55 89 e5 83 ec 0a          push bp; mov bp,sp; sub sp,0xA
0c599  c4 3e f8 87                les di,[0x87F8]
0c59d  26 80 7d 21 00             cmp byte es:[di+0x21], 0
0c5a2  74 20                      je  0xc5c4                 ; -> the WILDERNESS arm
0c5a4  ...                        (fall-through)             ; -> the DUNGEON arm
```

i.e. **`if (area[0x21] == 0) load WildCom; else load DungCom`. That is the whole predicate.**

**This is where Pools and Treasures genuinely differ.** Treasures' predicate is a three-way ladder
(`area[0x21]==0 || area[0x3F]!=0`, plus an `area[0x51]` DungCom variant) and its real selector is
the second flag `area[0x3F]` (ECL location `0x0040`), because Treasures' scripts never touch
`area[0x21]`.

**Pools' predicate is a single condition — that is the refutation**, verified by disassembling
`0x0C593..0x0C64B` end to end. As corroboration, Treasures' *specific field offsets* are absent from
Pools' engine: `cmp byte es:[di+0x3f], imm` and `cmp byte es:[di+0x51], imm` return **0 hits** in the
264,086-byte pool against **25** for `es:[di+0x21]` (this rules out **those offsets**, not the
abstract possibility of some other second flag), and Treasures' ECL selector `[0x0040]` has **0**
corpus occurrences.

> **Correction (2026-08-06).** The first draft framed this as "Pools has no `area[0x3F]` second flag
> and no `area[0x51]` test at all", i.e. it searched **Treasures' field offsets inside Pools' area
> struct** and read a zero hit as ruling out "a second flag". The two titles' area layouts are not
> shown to be the same, so the scan gives that framing more force than it has. The real refutation —
> the single-condition predicate — is unaffected.

The two arms:

```
0c5a4  8d 7e f7 16 57             lea di,[bp-9]; push ss; push di
0c5a9  bf 7d 0e  0e 57            mov di,0x0E7D("DungCom"); push cs; push di
0c5ae  9a 6f 0a 25 08             lcall 0825:0A6F              ; strcpy
0c5b3  a0 f8 a9  50               mov al,[0xA9F8]; push ax
0c5b7  b0 00 50  b0 19 50         push 0 ; push 0x19
0c5bd  9a 25 00 3e 01             lcall 013E:0025              ; the loader

0c5ea  8d 7e f7 16 57             lea di,[bp-9]; push ss; push di
0c5ef  bf a5 0e  0e 57            mov di,0x0EA5("WildCom"); push cs; push di
0c5f4  9a 6f 0a 25 08             lcall 0825:0A6F              ; strcpy
0c5f9  8a 46 ff  50               mov al,[bp-1]; push ax
0c5fd  b0 00 50  b0 27 50         push 0 ; push 0x27
0c603  9a 25 00 3e 01             lcall 013E:0025              ; the loader
```

The loader's third argument is **`0x27` for WildCom and `0x19` for DungCom — byte-identical to
Treasures'**. (What the argument *means* is not decoded; recorded as an observed constant, exactly
as in the Treasures writeup.)

Between the predicate and the WildCom call, Pools computes the loader's **first** argument from a
second area field (file `0x0C5C4`):

```
0c5c4  c4 3e f8 87 26 8a 45 39    les di,[0x87F8]; mov al,es:[di+0x39]   ; area[0x39]
0c5cc  50 bf 85 0e 0e 57          push ax; mov di,0x0E85; push cs; push di
0c5d2  9a 24 0d 25 08             lcall 0825:0D24
0c5d7  74 0d                      je  0xc5e6
0c5d9  ... mov al,es:[di+0x39]; mov [bp-1],al
0c5e6  c6 46 ff 00                mov byte [bp-1], 0
```

`area[0x39]` is ECL location **`0x003A`** — a field the ECL setter also special-cases (file
`0x06E4E`: `cmp ax,0x39`, values `>= 5` rejected). The corpus writes it with values `0..4`. So
`[0x003A]` is a **WildCom sub-bank / terrain-set selector, not the mode selector** — the mode
selector is `[0x0022]`.

**Independent 3-for-3 agreement, and one disclosed anomaly (added 2026-08-06).** `WILDCOM.DAX`
contains exactly **THREE** blocks, ids `0`/`1`/`2`, matching the `[0x003A]` sub-bank values written
by blocks 17 / 80 / 51 respectively. **ANOMALY, disclosed:** block 25 writes `[0x003A] = 4`, for
which **no `WILDCOM` block exists** (the `0825:0D24` lookup's failure path sets the loader's first
argument to 0); corpus-wide the field is written with 0 (×3), 1 (×4), 2 (×2), 3 (×1), 4 (×3). The
first draft left the sub-bank field wholly undecoded and reported neither the agreement nor the
anomaly.

The same one-condition predicate then picks the floor builder (file `0x0C633`):

```
0c633  c4 3e f8 87 26 80 7d 21 00  les di,[0x87F8]; cmp byte es:[di+0x21],0
0c63c  74 06                       je  0xc644
0c63e  0e e8 03 f7                 push cs; call 0xBD45 (cs:0x065F)   ; DUNGEON floor builder
0c642  eb 04                       jmp 0xc648
0c644  0e e8 d2 fe                 push cs; call 0xC51A (cs:0x0E34)   ; WILDERNESS floor builder
0c648  89 ec 5d cb                 mov sp,bp; pop bp; retf
```

## 4. The decisive corroboration: **two different steppers, two different coordinate spaces**

This is the part that has no Treasures analogue and that makes the leg self-checking.

### 4a. The movement dispatcher branches on `game_state`

Segment `0x0D577`, local `0x066E`, file `0x0DBE5`:

```
0dbe5 L066e  a0 0c 88  3c 04  75 3f      mov al,[0x880C]; cmp al,4; jne 0xdc2b
0dbec        c4 3e f8 87 26 80 7d 02 ff  73 29
0dbfc        ... push [0xA9F3]; push [0xA9F4]; push [0xA9F5]; lcall 012A:002F
0dc0d        3c 01 75 08                 cmp al,1; jne
0dc15        0e e8 02 fa                 push cs; call 0xD61B (L00A4)   -> DUNGEON step
0dc2b L06b4  3c 03  75 16                cmp al,3; jne 0xdc45
0dc2f        c4 3e f8 87 26 80 7d 02 ff  73 09
0dc3a        0e e8 8c fa                 push cs; call 0xD6CA (L0153)   -> WILDERNESS step
```

`[0x880C]` is exactly the byte the ECL `[0x0022]` setter arm writes: **3 = wilderness, 4 = dungeon**.
So the causal chain `ECL: SAVE #0 → [0x0022]` ⇒ `area[0x21] = 0` **and** `[0x880C] = 3` ⇒
WildCom is loaded **and** the wilderness stepper is used, is closed end to end in retail bytes.

### 4b. Dungeon step — 16×16, **wrapping**, on `[0xA9F3]`/`[0xA9F4]`

File `0x0D61B` (local `0x00A4`):

```
0d630  a0 f5 a9 30 e4 8b f8             mov al,ds:[0xA9F5] (facing); mov di,ax
0d637  8a 85 ac 3e  00 06 f3 a9         al = ds:[di+0x3EAC];  add [0xA9F3], al   ; X += dx
0d63f  a0 f5 a9 30 e4 8b f8
0d646  8a 85 b5 3e  00 06 f4 a9         al = ds:[di+0x3EB5];  add [0xA9F4], al   ; Y += dy
0d64e  80 3e f3 a9 00  7d 05  c6 06 f3 a9 0f   if X <  0    -> X = 0x0F   (WRAP)
0d65a  80 3e f3 a9 0f  7e 05  c6 06 f3 a9 00   if X >  0x0F -> X = 0      (WRAP)
0d666  80 3e f4 a9 00  7d 05  c6 06 f4 a9 0f   if Y <  0    -> Y = 0x0F
0d672  80 3e f4 a9 0f  7e 05  c6 06 f4 a9 00   if Y >  0x0F -> Y = 0
```

### 4c. Wilderness step — **38×15, clamping, on `area[0x24]`/`area[0x25]`**

File `0x0D6CA` (local `0x0153`):

```
0d6da  c4 3e f8 87 26 8a 45 24  ... 26 88 45 16   area[0x16] := area[0x24]   ; previous X
0d6ea  c4 3e f8 87 26 8a 45 25  ... 26 88 45 17   area[0x17] := area[0x25]   ; previous Y
0d6fa  a0 f5 a9 30 e4 8b f8 8a 85 ac 3e 98 8b d0  dx = (int8) ds:[0x3EAC + facing]
0d708  c4 3e f8 87 26 8a 45 24 30 e4 03 c2 88 46 fe   newX = area[0x24] + dx
0d717  a0 f5 a9 ... 8a 85 b5 3e 98 8b d0          dy = (int8) ds:[0x3EB5 + facing]
0d725  c4 3e f8 87 26 8a 45 25 30 e4 03 c2 88 46 fd   newY = area[0x25] + dy
0d734  80 7e fe 00 7d 04 c6 46 fe 00              if newX < 0    -> 0        (CLAMP)
0d73e  80 7e fe 25 7e 04 c6 46 fe 25              if newX > 0x25 -> 0x25     (CLAMP)
0d748  80 7e fd 00 7d 04 c6 46 fd 00              if newY < 0    -> 0
0d752  80 7e fd 0e 7e 04 c6 46 fd 0e              if newY > 0x0E -> 0x0E
0d75c  8a 46 fe ... 26 88 45 24                   area[0x24] := newX
0d767  8a 46 fd ... 26 88 45 25                   area[0x25] := newY
```

`area[0x24]` / `area[0x25]` are **ECL locations `0x0025` and `0x0026`** (plain type-0 fields — the
setter's special-case ladder does not cover them, so they fall through to `area_ptr + loc − 1`).

**The clamps are the map dimensions: X ∈ 0..0x25 (38 columns), Y ∈ 0..0x0E (15 rows).** They are
*clamps*, not the dungeon stepper's *wraps* — a second structural difference between the two modes.

Both steppers index the **same** 8-way delta tables at `DS:0x3EAC` (dx) and `DS:0x3EB5` (dy), nine
bytes apart. The exact 18 bytes occur **once** in `GAME.EXE`, at file `0x0C7C5`, and **not at all**
in `GAME.OVR`:

```
dx: 00 01 01 01 00 ff ff ff 00        ; N NE E SE S SW W NW (none)
dy: ff ff 00 01 01 01 00 ff 00
```

so facing 0 = N `(0,−1)`, 2 = E `(+1,0)`, 4 = S `(0,+1)`, 6 = W `(−1,0)`.

**The `DS:0x3EAC` → file-offset mapping is NOT resolved (corrected 2026-08-06).** The 18 delta bytes
occur exactly once in `GAME.EXE` (file `0x0C7C5`) and not at all in `GAME.OVR`. But `GAME.EXE`
declares **zero relocations** (`e_crlc = 0`) and a `0x200`-byte header (`e_cparhdr = 32`), and
`0x0C7C5 − 0x200 − 0x3EAC = 0x8719` is **not paragraph-aligned** (remainder 9), so no simple segment
decomposition confirms it and the check is inconclusive in both directions.

**The table's IDENTITY is instead corroborated from Pools' own engine:** `vm_GetMemoryValue` at file
`0x06FD4` returns the raw 8-way facing `[0xA9F5]` when `area[0x21] == 0` and `[0xA9F5] >> 1` (the
4-way dungeon ordinal) otherwise, and the setter's `0x10` arm writes `[0xA9F5] = 0/2/4/6` for ECL
facing `0..3` — so even indices are N/E/S/W and facing 6 = W `(−1,0)`, exactly the table's shape.

> **Correction (2026-08-06).** The first draft correctly labelled the mapping an inference but did
> not mention that the arithmetic **fails to resolve**, and it omitted the getter-side corroboration
> that actually settles the table's identity.

## 5. Pools' wilderness is **not GEO-backed** — the overland maps live inside the ECL blocks

Four blocks write `[0x0022] = 0` **unconditionally as the second instruction of their
`initial_entry`** — no `COMPARE`/`IF` before it: **`ECL1.DAX#17`, `#25`, `#51`, `#80`**. The first
four instructions are byte-identical in all four (block 51 shown; test E asserts all four):

```
0x8014  09 00 01 01 24 00   SAVE #1  -> [0x0024]
0x801A  09 00 00 01 22 00   SAVE #0  -> [0x0022]     ; inDungeon = 0  => WILDERNESS
0x8020  09 00 00 01 1a 00   SAVE #0  -> [0x001A]
0x8026  09 00 00 01 0f 00   SAVE #0  -> [0x000F]
0x802C  09 00 02 01 3a 00   SAVE #2  -> [0x003A]     ; WildCom sub-bank (17->0, 80->1, 51->2, 25->4)
0x8032  3d                  CLEAR_BOX
0x8033  0e 00 f2            PICTURE #0xF2
0x8036  03 00 33 01 16 00   COMPARE #51,[0x0016]     ; own-block re-entry guard
0x803C  16 / 0x803D 00      IF_EQ / EXIT
```

`GEO1.DAX` holds **32** blocks, all 1026 bytes (the standard Gen1 16×16 GEO). Of the four
wilderness blocks, **only `#17` has a same-id GEO block — `#25`, `#51` and `#80` have none at
all.** They cannot be GEO-backed because there is no GEO to back them.

Each wilderness block instead carries **its own 38×15 terrain map as in-block data**, and resolves
position → terrain identically:

```
ON_GOTO [0x00C1], #15, <15 row handlers>          ; Y selects the row
  row_h:  2a 01 <base_lo> <base_hi> 01 c0 00 01 bf 00 13
          GETTABLE [row_base], [0x00C0] -> [0x00BF] ; X indexes the row
          RETURN
```

and the fifteen row bases are contiguous with stride **`0x26` = 38**:

| block | `ON_GOTO` vaddr | row-table span | rows | stride |
|---|---|---|---|---|
| 17 | `0x98B3` | `0x99B0`…`0x9BEA` | 15 | `0x26` |
| 25 | `0x8CC3` | `0x8DA7`…`0x8FE1` | 15 | `0x26` |
| 51 | `0x8A3F` | `0x8B23`…`0x8D5D` | 15 | `0x26` |
| 80 | `0x8A61` | `0x8B45`…`0x8D7F` | 15 | `0x26` |

**15 rows × 38 columns, in all four blocks, exactly matching the retail stepper's `0x0E` / `0x25`
clamps.** Two entirely different artifacts — a compiled 8086 routine and a script data table —
agree on the same two numbers. That is the second independent line of evidence this leg rests on.

*(Block 17's row-0 handler is not a bare `GETTABLE`: it starts `2f 00 40 01 34 01 …`, a guarded
variant. Its rows 1..14 are regular with the same `0x26` stride, so its row-0 base `0x99B0` is the
arithmetic continuation, not a directly-read operand. Recorded, not smoothed over.)*

Block 51's map, read straight out of the retail block (test F asserts every row):

```
y= 0  01 01 01 01 00 00 00 00 00 00 00 00 00 00 00 00 01 01 01 00 00 00 00 00 00 02 02 02 00 02 02 00 00 00 00 00 00 00
y= 1  01 01 01 01 01 00 00 00 00 00 00 00 00 00 01 01 01 01 01 00 00 00 00 00 02 02 02 02 02 02 02 02 00 00 00 00 00 00
y= 2  00 01 01 01 21 01 01 00 00 00 00 00 01 01 01 01 01 03 03 03 03 03 03 03 02 02 02 02 02 02 02 02 00 00 00 00 00 00
y= 3  00 01 01 00 01 01 01 01 01 01 01 01 01 01 01 01 03 03 03 03 03 26 03 03 03 03 03 03 02 02 02 02 02 00 00 00 00 00
y= 4  00 00 00 00 00 00 01 01 01 01 01 01 23 01 01 01 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 02 02 02 00 00 00 00
y= 5  00 00 00 00 00 00 00 01 01 01 01 01 01 01 01 01 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 02 02 02 00 00 00
y= 6  00 00 00 00 00 00 00 01 01 01 01 01 01 01 01 01 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 03 02 02 02 00 00
y= 7  00 00 02 02 02 02 02 00 00 00 00 01 01 01 01 01 03 03 03 03 03 03 03 03 03 03 03 03 04 20 04 04 03 02 02 02 00 00
y= 8  02 02 02 02 02 02 02 02 00 00 00 00 01 01 01 01 03 03 03 03 03 03 03 03 03 03 03 03 04 04 04 04 22 03 02 02 02 00
y= 9  02 02 02 02 02 02 02 02 02 02 00 00 00 01 01 01 03 03 03 03 03 03 03 03 03 03 03 04 04 04 04 04 04 04 02 02 02 00
y=10  00 02 02 02 02 00 02 02 02 02 02 00 00 00 00 00 00 03 02 02 02 02 03 03 03 03 03 04 04 04 04 04 04 05 05 02 02 00
y=11  00 00 00 02 00 00 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 03 03 25 04 04 04 04 05 05 05 05 02 00
y=12  00 00 00 00 00 00 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 02 03 03 05 05 05 05 05 05 05 05 05 05 00
y=13  00 00 00 00 00 00 00 02 02 02 02 02 02 02 02 1f 02 02 02 02 02 02 02 02 00 00 00 05 05 05 05 05 05 05 24 05 05 05
y=14  00 00 00 00 00 00 00 00 00 00 00 02 02 02 02 02 02 02 02 02 02 02 00 00 00 00 05 05 05 05 05 05 05 05 05 05 05 05
```

Codes `< 10` are terrain; codes `>= 10` are scripted sites.

### 5a. The site-table cross-check (the strongest single check in this leg)

`ECL1#52` hands the party onto this map from a pair of retail byte tables at `0x9C57` (X) and
`0x9C61` (Y), indexed by `[0x0224]`:

```
0x851E  GETTABLE [0x9C57],[0x0224] -> [0x00C0]
0x8528  GETTABLE [0x9C61],[0x0224] -> [0x00C1]
0x8532  SAVE [0x00C0] -> [0x0025]        ; wilderness X
0x8539  SAVE [0x00C1] -> [0x0026]        ; wilderness Y
0x8540  SAVE #4      -> [0x000E]
0x8546  20 00 33     NEWECL #51
```

Block 51's own site dispatch computes `site index = code − 10 − 20 = code − 30` — literally two
retail `SUBTRACT`s:

```
0x814A  05 00 0a 01 bf 00 01 bf 00   SUBTRACT #10,[0x00BF] -> [0x00BF]
0x8159  03 00 14 01 bf 00  1a  GOTO 0x8165
0x8165  05 00 14 01 bf 00 01 24 02   SUBTRACT #20,[0x00BF] -> [0x0224]
```

Reading block 52's two tables at indices **1..8** and looking each `(x, y)` up in block 51's 38×15
map gives:

| index | (X,Y) from `ECL1#52` | map code at that cell | `code − 30` |
|---|---|---|---|
| 1 | (15,13) | `0x1F` = 31 | 1 |
| 2 | (29, 7) | `0x20` = 32 | 2 |
| 3 | ( 4, 2) | `0x21` = 33 | 3 |
| 4 | (32, 8) | `0x22` = 34 | 4 |
| 5 | (12, 4) | `0x23` = 35 | 5 |
| 6 | (34,13) | `0x24` = 36 | 6 |
| 7 | (27,11) | `0x25` = 37 | 7 |
| 8 | (21, 3) | `0x26` = 38 | 8 |

**Eight for eight.** Every index lands on the map's own site cell for that index, and those eight
codes are exactly the eight site codes present in the map (31..38, one each). This simultaneously
fixes (a) that `[0x0025]` is the column and `[0x0026]` the row, (b) that the ON_GOTO/GETTABLE
ladder is that map's terrain lookup, and (c) that `code − 30` is the site index. The transposed
reading is not merely worse, it is **impossible**: the X values reach 34 while the map has only 15
rows.

## 6. The retail bytes that hand a pose to `ECL1#51`

> **Correction (2026-08-06).** This section was headed "How a party enters the wilderness". That
> claimed campaign-level entry; the evidence is byte-level. What is shown is **which retail bytes
> hand a pose to block 51**, not that a party can reach those bytes. Neither `ECL1#53`'s reachability
> from a game start nor the reachability of the `0x8345` handoff within `#53` was examined.

`ECL1#53`'s handoff is all immediates (test G):

```
0x8345  09 00 14 01 25 00   SAVE #20 -> [0x0025]    ; X
0x834B  09 00 03 01 26 00   SAVE  #3 -> [0x0026]    ; Y
0x8351  09 00 01 01 0e 00   SAVE  #1 -> [0x000E]
0x8377  20 00 33            NEWECL #51
```

`(20,3)` is terrain `0x03`, **immediately west of the site cell `(21,3)` = `0x26`** — which is
block 52's table index 8. The exit pose and the map agree. *(That `ECL1#53` is the location at
site 8 is an inference from this coincidence; it is not separately proven.)*

`[0x000E]` is written by handoffs with block-specific values; its meaning is **not** decoded here.

## 7. The per-step wandering-encounter chain, on real bytes

`ECL1#51` `search_location` (`0x80F1` — the 2nd far pointer of the retail header), all vaddrs
asserted in test H:

```
0x80F1  SAVE #0 -> [0x0097]                     ; clear the per-area gates
0x8109  09 00 4b 01 1b 00   SAVE #0x4B -> [0x001B]   ; combat backdrop / city id
0x8115  COMPARE #0x0E,[0x0008] ; IF_LT ; SAVE #1 -> [0x0099]
0x8122  09 01 25 00 01 c0 00 SAVE [0x0025] -> [0x00C0]  ; wilderness X
0x8129  09 01 26 00 01 c1 00 SAVE [0x0026] -> [0x00C1]  ; wilderness Y
0x8130  02 01 3f 8a          GOSUB 0x8A3F                ; [0x00BF] = map[Y][X]
0x8134  COMPARE #0x0A,[0x00BF] ; IF_LE ; GOTO 0x814A     ; code >= 10 -> scripted site
0x813F  SAVE [0x00BF] -> [0x0222] ; GOTO 0x81C5          ; else terrain -> wandering roll
0x81C5  04 00 01 01 23 02 01 23 02   ADD #1,[0x0223] -> [0x0223]   ; step counter
0x81CE  COMPARE #4,[0x0223] ; IF_GT ; EXIT               ; only every 4th step rolls
0x81D6  08 00 63 01 bf 00   RANDOM #99 -> [0x00BF]
0x81DC  COMPARE #0x14,[0x00BF] ; IF_LE ; EXIT            ; miss when roll >= 20  (20% chance)
0x81E4  SAVE #0 -> [0x0223]                              ; reset the counter
0x81EA  RANDOM #9 -> [0x00BF] ; 0x81FD RANDOM #3 -> [0x00A1]
0x8203  ON_GOTO [0x00A1], #4, 0x8215/0x826D/0x82AD/0x82ED   ; four roster groups
        (each: six GETTABLEs -> [0x009B]..[0x00A0], the monster id/count triples)
0x8360  RANDOM #9 -> [0x00C4]
0x8366  COMPARE #7,[0x00C4] ; 0x836C IF_LE ; GOTO 0x8597  ; 7 <= roll -> the ATTACK arm
0x8597  ON_GOSUB [0x00A1], #4 ; -> 0x84B4 -> SETUP_MONSTER / COMBAT
```

Note what is **not** there: no read of the cell-descriptor `[0x002D]`. Pools' wilderness dispatch is
purely `(X, Y) → in-block map`, whereas Treasures' is `cellDesc & 15 → terrain table`.

**That `[0x002D]` IS the cell descriptor in Pools is established in Pools' own engine, not assumed
from sibling titles (added 2026-08-06):** `vm_GetMemoryValue` special-cases `loc−1 == 0x2C` at
`GAME.OVR` file `0x07009` and returns the host byte `[0xA9F7]` rather than `area[0x2C]`. The first
draft stated the identification as fact with no in-doc evidence — an unlabelled inference carried
over from sibling titles, which happens to be correct.

**The load-bearing negative is a RAW ALL-ENCODING SCAN, not the reachability walker below.** A scan
over operand codes `0x01`/`0x02`/`0x03` plus the `0x7F` short form — full recall, no reachability
filter — finds **ZERO** references to `[0x002D]` in each of blocks 17/25/51/80, against **106**
corpus-wide, and zero to `0xC04F`.

**Reachability census** (a worklist walk from all five retail header entries, following only the
control-transfer opcodes `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB` — the walker is reproduced in test L):

| needle | reachable refs | blocks |
|---|---|---|
| `[0x002D]` (cell descriptor) | 54 | 30 blocks — **none of 17/25/51/80** |
| `LOAD_FILES` (opcode `0x21`) | 3 | blocks 4, 16, 24 — **none of 17/25/51/80** |
| `[0x0022]` (Pools' mode flag) | 8 | blocks 1, 17, 18, 25, 51, 80 |
| `[0x4BE6]` (CoAB's host word) | **0** | — |
| `[0x0040]` (Treasures' selector) | **0** | — |

*(This walker does not follow computed/indirect jumps, so its positive counts are lower bounds and
**its zeros prove nothing on their own**. All of the load-bearing negatives rest on the raw
full-recall scans above and in §0/§3, not on this walker.)*

> **Correction (2026-08-06).** The first draft cited "the execution-level sweep in §8 control (d)"
> as independent backing for the cell-descriptor negative. It is not independent and it is not a
> control — see the §8 correction. The full-recall raw scan is the evidence.

## 8. The route, and the encounter actually firing

**Route.** From the pose `ECL1#53` hands over — `(20,3)` on block 51's map — four steps **west**
(host facing 6, `dx = −1`, `dy = 0` from the retail delta table, bounded by the retail wilderness
stepper's own clamps) reach `(16,3)`:

```
(20,3) -> (19,3) -> (18,3) -> (17,3) -> (16,3)
```

Every cell crossed is terrain `0x03` (row 3, columns 16–20 are `03 03 03 03 03`), so no
scripted-site arm and no clamp is involved anywhere on the route. Test I re-derives each step from
the retail `dx`/`dy` bytes and the retail clamp bounds rather than hard-coding the coordinates.

**Firing it (test J, real `EclVm`, not a hand-trace).** Seeding only what the handoff wrote, running
`ECL1#51` `initial_entry` first (which leaves `[0x0022] = 0`, `[0x003A] = 2`, `[0x0016] = 51`), then
`primeSearchLocation` once per step with `[0x0025]`/`[0x0026]` set to that step's cell and the step
counter `[0x0223]` threaded between calls:

* steps 1–3 (`(19,3)`, `(18,3)`, `(17,3)`) — counter 1, 2, 3, each run `exited` with **no**
  `encounterSetup`, **no** `combat`, **no** `print`;
* step 4 (`(16,3)`) — counter reaches 4, and with every `RANDOM` forced to
  `max === 99 ? 0 : max === 9 ? 9 : 0` the run reaches `status: 'combat'` having emitted, in order,
  `print "YOU STUMBLE UPON A GROUP OF MONSTERS."`, two blank `print`s, `print "THEY ATTACK!"`, an
  `encounterSetup` (`spriteId 255`, `picId 129`), and a `combat` effect carrying three real groups:
  **monsterId 76 ×2, 42 ×2, 43 ×2**.

**Negative controls — THREE discriminating, not four (test J):**

1. **Roll control.** Counter at 3, but the `RANDOM #99` forced to **20** (the first losing value) →
   `exited`, no `encounterSetup`, and `[0x00BF]` shows `20`. Forced to **19** → fires. Positive and
   negative differ in exactly one rolled value, at the exact table boundary.
2. **Site-cell control.** Counter at 3, roll 0, but the party placed on `(21,3)` — the map's own
   `0x26` site cell one column east — the run takes the scripted-site arm and emits **no**
   `encounterSetup`. The gate is the map byte, not the roll.
3. **Step-gate control** — counter seeded at 0/1/2 instead of 3 → `exited`, no `encounterSetup`.
   Listed for completeness, but this is **the SAME fact as walk steps 1–3**, not an additional
   control.

> **Correction (2026-08-06), two parts.**
>
> (a) The first draft said "four independent negative controls". Control (a)/(3) is not independent
> of the walk it is supposed to control: walk steps 1–3 already exit at the 4-step counter gate, and
> the control re-runs the same gate at `(16,3)` with counters 0/1/2. Two presentations of one fact.
>
> (b) The first draft's fourth item, the **256-value backdrop sweep**, is a **CONSISTENCY CHECK, NOT
> A CONTROL**, and its §7/§8 framing as independent backing for the coordinate-driven conclusion is
> withdrawn. It **cannot fail**: a raw all-encoding scan (operand codes `0x01`/`0x02`/`0x03` plus the
> `0x7F` short form) finds **ZERO** references to `[0x002D]` in blocks 17/25/51/80 (106 corpus-wide)
> and zero to `0xC04F`, so the sweep is arithmetically incapable of changing anything. It also
> compares only the effect-**TYPE** sequence (`t.effects.map(e => e.type).join(',')`), not payloads —
> a changed print string, monster id or `picId` would pass. **THAT full-recall scan, not the sweep
> and not the reachability walker, is the evidence that Pools' wilderness dispatch is
> coordinate-driven.**

**Per-step harness modelling (disclosed 2026-08-06).** The step counter `[0x0223]` and the pose are
threaded between calls, and **every other memory cell is reset to the post-`initial_entry` state each
step** — `search_location` clears its own gates at `0x80F1` anyway, but the run *models* rather than
*proves* host state continuity. The first draft disclosed only the counter threading.

**Dialect: an honest negative.** An earlier draft of this document claimed a fifth "dialect control"
— that the identical run under the shared `ECL_GEN1_SHORT` would fail to reproduce the combat.
**That claim is false and has been removed.** This route is dialect-insensitive: test J(e) runs the
identical route under `ECL_GEN1_SHORT` and gets the same effect-type sequence and the same three
monster groups. *(The two tables differ only on opcodes `0x1F`/`0x21`/`0x37`/`0x41`; **no claim is
made here about whether those bytes occur as decoded instructions in blocks 17/25/51/80** — that was
not measured, and the map data itself contains those byte values as terrain/site codes.)* **This leg
is NOT evidence for `ECL_GEN1_SHORT_POOLS`** — that split stands on its own handler-level derivation
in `disassemble.ts`, not on this leg.

> **Correction (2026-08-06).** The stated *reason* in the first draft — "`0x1F`/`0x21`/`0x37`/`0x41`
> do not occur anywhere in blocks 17/25/51/80" — is literally false at byte level and was asserted by
> no test: block 51's own map data contains `0x1F` and `0x21..0x26` as terrain/site codes. The claim
> that would be needed is about *decoded instructions on reachable paths*, which nothing checks. What
> test J(e) actually establishes is the empirical equality of the two runs.

**Roster reality check (test K).** Each requested `monsterId` resolves in the retail `MON1CHA.DAX`
through `decodeMonsterArchive(bytes, 'pools-of-darkness')` to a record with a non-empty name and
non-zero hit points.

## 9. Wilderness combat backdrop: the same flag, flipped around `COMBAT`

Independent of the overland maps, `ECL1#1` shows the flag being used purely as a **combat backdrop**
switch (test E asserts the bytes):

```
0x87F4  09 00 00 01 22 00   SAVE #0  -> [0x0022]   ; inDungeon = 0  => WildCom backdrop
0x87FA  09 00 4b 01 1b 00   SAVE #0x4B -> [0x001B]
0x8800  0c 00 24 00 00 00 ff 00 07   SETUP_MONSTER #0x24,#0,#0xFF,#7
0x8809  0b 00 24 00 03 00 24         LOAD_MONSTER  #0x24,#3,#0x24
0x8810  24                           COMBAT
0x8811  09 00 01 01 22 00   SAVE #1  -> [0x0022]   ; restore dungeon mode
```

That is exactly the CoAB/Gateway "wilderness combat floor" idiom
(`gateway-wilderness-combat-floor-2026-07-31.md`), expressed through Pools' own ECL location.
`[0x001B]` = `area[0x1A]`, written `0x4B` here and in all four wilderness blocks'
`search_location`; it is **not** decoded further in this leg.

---

## What this does NOT establish

* **No native/DOSBox-X trace.** The task forbade it. Engine-side claims are capstone disassembly of
  the retail `GAME.OVR`/`GAME.EXE` plus byte assertions; runtime claims are our own `EclVm`
  executing retail block bytes. Neither observes the shipped DOS binary running.
* **No browser wiring.** There is no `?explore=` route id, no live-site check and no e2e acceptance
  claimed for this leg. Data/VM level only.
* **The host→ECL call edge is not traced.** What *is* proven is that the retail wilderness stepper
  writes `area[0x24]`/`area[0x25]` and that block 51's `search_location` reads ECL `[0x0025]`/
  `[0x0026]` — the *same two bytes*. That the host calls `search_location` once per wilderness step
  is the standard Gen1 model this project's sibling goldens all assume; the `lcall 00FF:0025`
  immediately after the stepper's stores was **not** decoded to confirm it.
* **This route is dialect-insensitive** (§8) — it is not evidence for `ECL_GEN1_SHORT_POOLS`.
* The WildCom loader's third argument (`0x27`, vs DungCom's `0x19`) is an **observed constant**, not
  decoded. Likewise `[0x880D]`, `[0xA9F2]`, `[0xA9F8]` in the `[0x0022]` setter arm, `[0x001B]`, and
  `[0x000E]` in the handoffs are transcribed, not interpreted.
* `area[0x39]` (ECL `[0x003A]`) is shown to be the WildCom loader's **first** argument and to be
  written with values 0..4. What sub-bank each value selects inside `WILDCOM.DAX`, and what the
  `0825:0D24` lookup against the literal at `cs:0x0E85` decides, are **not** established. No claim
  is made that `area[0x39]` has no further effects.
* The `DS:0x3EAC` → `GAME.EXE:0x0C7C5` mapping for the delta tables is an **inference** from the
  byte pattern, its uniqueness and its 9-byte stride. The segment fixup was not resolved.
* The wilderness stepper itself performs **no** terrain or passability test — it only clamps.
  Whether terrain code `0x00` is walkable is therefore **not** established here. The route in §8
  stays entirely on terrain `0x03` precisely so the question does not arise; it is *a*
  legal-by-arithmetic path, not a claim about what a player would do.
* Blocks `#17`, `#25` and `#80` are shown to have the *same* structure as `#51` (same entry stanza,
  same 15×38 map geometry, same row-table stride). Their maps' site tables were **not**
  cross-checked the way §5a checks block 51's, and no route was run on them. `#17` in particular is
  **not** a pure wilderness block: it alone has a same-id `GEO1.DAX` block, its row-0 handler is a
  guarded variant, and it writes `[0x0022] = 1` at three further vaddrs.
* Block 51 itself writes `[0x0022] = 1` at `0x87B4` (`SAVE #0 -> [0x0024]` then `SAVE #1 ->
  [0x0022]`, then `CLEAR_BOX`), i.e. it re-enters dungeon mode somewhere in its own site handling.
  That transition is **not** decoded.
* The block-51 map's terrain semantics (which of codes 0–5 is forest/hill/water/…) are **not**
  decoded — only that codes `< 10` take the wandering-roll path and codes `>= 10` take a scripted
  arm.
* The **"monsters in the distance" arm is NOT part of the proven route.** Driving the same cell with
  every `RANDOM` forced to 0 takes block 51's other branch: it prints
  `"YOU SEE MONSTERS IN THE DISTANCE."`, two blanks, emits `spriteOff`, and then hits an
  **`unhandled` effect on opcode `0x01` (GOTO)** — a jump target our VM does not resolve — and
  `exited`. Disclosed, not smoothed over. *(An earlier draft attributed this to a specific `GOTO` at
  `0x8386`/`0x8385` with operand `[0x0098]`; that byte-level attribution did not survive
  re-checking — the byte at `0x8385` is `0x31`, not a `GOTO` opcode — so no vaddr is claimed here.
  What is asserted is only the observed run, which test J pins.)*
* `ECL1#52`'s pose table has entries outside 1..8 (index 0 and index 9 both repeat index 5's
  `(12,4)`). Only indices 1..8 are claimed.
* The claim that `ECL1#53` is the location occupying site 8 at `(21,3)` is an **inference** from its
  exit pose landing one cell west of that site.
* **No reachability from a game start is shown for `ECL1#53`, nor for the `0x8345` handoff within
  it** (added 2026-08-06); this leg is data/VM-level only and asserts **no campaign continuity**.
* **The 256-value descriptor sweep is a consistency check, not a control** (added 2026-08-06), and
  it compares effect **types** only, not payloads. See the §8 correction.
* **The per-step harness resets every memory cell except `[0x0223]` and the pose between steps**
  (added 2026-08-06) — it models host state continuity rather than proving it.

## Corrections to the first draft of this document (2026-08-06)

The first draft was written before its companion test was run. Five of its numeric claims did not
survive re-measurement and are corrected above; they are listed here so the diff is auditable:

| claim in draft 1 | measured |
|---|---|
| 25 `SAVE #imm → [0x0022]` sites: **15** write 1, **10** write 0 | 25 sites: **14** write 1, **11** write 0 |
| **14** reachable `[0x0022]` references | **8** (control-transfer-only worklist walk) |
| **37** `LOAD_FILES` sites in **33** blocks | **3** sites in blocks 4, 16, 24 (negative for 17/25/51/80 holds) |
| **96** reachable `[0x002D]` references | **54** in 30 blocks (negative for 17/25/51/80 holds) |
| movement dispatcher at file `0x0DBDB`, local `0x0664` | file `0x0DBE5`, local `0x066E` |
| "dialect control: the run does not reproduce under `ECL_GEN1_SHORT`" | **false** — byte-identical under both; claim withdrawn (§8) |

Every *structural* conclusion of the draft survived independent re-derivation: the range ladder, the
type-4 discard, the one-condition `SetupGroundTiles` predicate, the absence of Treasures'
`area[0x3F]`/`area[0x51]`, both steppers, the 38×15 geometry match, and the 8-for-8 site
cross-check.
