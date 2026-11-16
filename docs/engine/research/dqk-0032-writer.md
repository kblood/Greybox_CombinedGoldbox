# DQK ECL host word `[0x0032]` — what it is, where it lives, and what writes it

Follow-up to `docs/engine/research/dqk-ending-ingress.md`, which left the DQK `ending` leg
`blocked` on exactly one thing: *"no mechanism anywhere in the shipped 47-area ECL corpus, and no
`les bx,[0xb20f]`-idiom host write in `DQK.EXE`, ever arms host word `[0x0032]` to a nonzero
value."*

**Result: that framing was based on a false premise, and the blocker is dissolved.**
`[0x0032]` is not a story flag and is not stored in the `[0xb20f]` area record at all. The ECL
operand resolver intercepts address `0x0032` before it ever reaches that record and returns
**`DS:0xC9F3`, the wall type of the map edge the party is currently facing** — a value DQK.EXE
recomputes from the loaded GEO map on every step and every turn. Nothing "arms" it because it is
not a latch; it is live engine input, nonzero whenever the party faces a non-empty wall slot.

Everything below was re-derived this session from the retail bytes
(`The Dark Queen of Krynn\DQK.EXE`, `DISK3\ECL.GLB`, `DISK3\GEO.GLB`) with capstone 5.0.7 in
16-bit mode. No DOSBox-X, no Unicorn — pure static disassembly. Every claim is quoted with its
file offset. Nothing was written to any game directory.

Segment→file bases used (all independently re-validated this session, see §0):
`1d99` (resident CS) → `0x01FD90`; `2033` → `0x031D20`; `25a4` (overlay body) → `0x0402C0`;
`2f0d` (a sub-segment inside overlay index 11) → `0x0608E0`.

---

## 0. Segment base derivations (so the rest is auditable)

- **`1d99` = resident.** `DQK.EXE`'s MZ header (`file 0x00`) gives `hdrpara=0x240` → image starts
  at file `0x2400`, and `CS:IP = 1d99:076c`. So canonical `1d99:OFF` → file `0x2400 + 0x1d99*16 +
  OFF = 0x1FD90 + OFF`. Confirmed by the FBOV thunk table there decoding as a perfectly regular
  10-byte stride of `e8 <rel16> ea <off> <seg> <ovr16>` records (see §3).
- **`2033` → `0x031D20`** — already in `decompile-dqk-ecl-dispatch.md`; re-confirmed here because
  `0x031D20 + 0x0013` disassembles as exactly the documented operand prefetcher, including the
  `{1,2,3,0x80,0x81}` code table it is documented to carry.
- **`25a4` → `0x0402C0`** — the corrected base (NOT `0x0403d0`); re-confirmed because
  `0x0402C0 + 0x0897` and `+ 0x0377` both land on clean `55 8b ec` C prologues and the thunk
  targets resolve to them.
- **`2f0d` → `0x0608E0`** — newly derived this session. `2f0d` is a link-time sub-segment inside
  overlay **index 11** (`disasm_dqk.py OVERLAY_DESCS[11]`: file `0x05C4C0`, prefix `0x6f0` →
  paragraph base `0x05CBB0`, runtime seg `0x2B3A`). `(0x2f0d - 0x2b3a)*16 = 0x3D30`, so
  `2f0d:0000` → `0x05CBB0 + 0x3D30 = 0x0608E0`. **Proof it is right:** all three thunk targets
  that land in this segment (`0x0628`, `0x075b`, `0x0807`) simultaneously hit `55 8b ec`
  prologues at this base and at no other candidate base in overlays 9/10/11 (brute-forced every
  16-byte-aligned prefix from `0x400` to `0x1200` in all three overlays; the only other 3/3-style
  hit does not exist — overlay 9's two candidates fail on 2 of 3).

---

## 1. What `2033:007c` actually does — operand codes 1, 2, 3 decoded

### 1a. The prefetcher `2033:0013` (file `0x031D33`)

```
0013  55                push bp
0014  8bec              mov  bp,sp
0016  83ec06            sub  sp,6
0019  56                push si
001a  c646fb00          mov  byte [bp-5],0        ; string-slot counter
001e  be0100            mov  si,1                 ; operand index, 1-based
0021  e9d900            jmp  0xfd
0024  a1f9b7            mov  ax,[0xb7f9]          ; ECL PC
0027  40                inc  ax
0028  c41e5cae          les  bx,[0xae5c]          ; script base far ptr
002c  03d8              add  bx,ax
002e  268a07            mov  al,es:[bx]
0031  888415b2          mov  [si-0x4deb],al       ; codeArr[si]  @ DS:0xB215+si
0035  a1f9b7            mov  ax,[0xb7f9]
0038  40 40             inc ax; inc ax
003a  8b1e5cae          mov  bx,[0xae5c]
003e  03d8              add  bx,ax
0040  268a07            mov  al,es:[bx]
0043  888485b1          mov  [si-0x4e7b],al       ; highArr[si]  @ DS:0xB185+si
0047  8306f9b702        add  word [0xb7f9],2      ; PC += 2 per operand set
004c  8a8415b2          mov  al,[si-0x4deb]
0050  b400              mov  ah,0
0052  b90500            mov  cx,5
0055  bb6800            mov  bx,0x68
0058  2e3b07            cmp  ax,cs:[bx]           ; linear search of the code table
005b  7407              je   0x64
005d  43 43             inc bx; inc bx
005f  e2f7              loop 0x58
0061  e99800            jmp  0xfc                 ; unknown code -> consume nothing more
0064  2eff670a          jmp  word cs:[bx+0xa]
```

Raw table bytes, `file 0x031D88`:
`01 00 02 00 03 00 80 00 81 00` — codes `{1, 2, 3, 0x80, 0x81}`
Raw handler bytes, `file 0x031D92`:
`7c 00 7c 00 7c 00 91 00 c6 00` — handlers `{0x7c, 0x7c, 0x7c, 0x91, 0xc6}`

> Minor correction to `decompile-dqk-ecl-dispatch.md` §"The operand-count table": it prints the
> code table as `{1, 2, 3, 0, 0x81}`. The bytes say `0x80`, not `0`. (The task brief already had
> it right.)

### 1b. `2033:007c` — the shared handler for codes 1, 2 **and** 3 (file `0x031D9C`)

```
007c  ff06f9b7          inc  word [0xb7f9]        ; consume a THIRD stream byte
0080  c41e5cae          les  bx,[0xae5c]
0084  031ef9b7          add  bx,[0xb7f9]
0088  268a07            mov  al,es:[bx]
008b  88846aae          mov  [si-0x5196],al       ; valArr[si] @ DS:0xAE6A+si
008f  eb6b              jmp  0xfc
```

**That is the entire routine.** It does not differentiate codes 1, 2 and 3 in any way. Its only
job is: *"this operand form is a 3-byte frame; fetch and stash the third byte."* So the framing
answer is:

| code | frame | prefetch action |
| --- | --- | --- |
| `0x00` | **2 bytes** `00 nn` | not in the table → falls to `0xfc`, no third byte consumed |
| `0x01` | 3 bytes `01 lo hi` | `2033:007c` |
| `0x02` | 3 bytes `02 lo hi` | `2033:007c` |
| `0x03` | 3 bytes `03 lo hi` | `2033:007c` |
| `0x80` | 2 bytes `80 len` + inline packed string | `2033:0091` → `lcall 1d99:11e3` (decode inline string into slot `[bp-5]`, 40-byte slots at `DS:0xB45F`) |
| `0x81` | 3 bytes `81 lo hi` | `2033:00c6` → `lcall 1d99:11d9` (load string-table entry `(hi<<8)|lo`) |

This is a **byte-level confirmation of the engine's existing `EclOpp` model** in
`packages/engine/src/ecl/disassemble.ts` ("Third byte — present only when `code ∈ {1,2,3,0x81}`") —
now read out of the binary rather than inferred.

The loop tail (`2033:00fc`) is `inc si; if ([bp+6] < si) { inc [0xb7f9]; retf } else goto 0x24`,
i.e. `N` at `[bp+6]` really is the word-set count and the PC lands on the next opcode byte.

### 1c. Where codes 1/2/3 diverge: the read-back `2033:0112` (file `0x031E32`)

```
0112  55 8bec 83ec02
0118  8a4606 98 8bd8    mov al,[bp+6]; cwde; mov bx,ax     ; i
011e  8a8785b1          mov al,[bx-0x4e7b] -> [bp-2]       ; highArr[i]
012b  8a876aae          mov al,[bx-0x5196] -> [bp-1]       ; valArr[i]
0138  8a8715b2          mov al,[bx-0x4deb]                 ; codeArr[i]
013e  b90600            mov cx,6
0141  bb5301            mov bx,0x153
0144  2e3b07            cmp ax,cs:[bx]
014f  2eff670c          jmp word cs:[bx+0xc]
```

Raw tables, `file 0x031E73`:
`00 00 01 00 02 00 03 00 80 00 81 00 | 6b 01 72 01 96 01 72 01 72 01 96 01`

| code | read-back handler | body |
| --- | --- | --- |
| `0x00` | `2033:016b` | `mov al,[bp-2]; mov ah,0` → return `high` (1-byte immediate) |
| `0x01` | `2033:0172` | resolve **address** `(val<<8)+high` via `lcall 1d99:11cf` |
| `0x02` | `2033:0196` | `((val<<8) \| high)` → return **immediate word** |
| `0x03` | `2033:0172` | resolve **address** `(val<<8)+high` via `lcall 1d99:11cf` |
| `0x80` | `2033:0172` | same resolver (numeric read of a string operand; not meaningfully used) |
| `0x81` | `2033:0196` | immediate word |

`2033:0172` (file `0x031E92`) pushes **two** arguments: `codeArr[i]` (read as a word at
`DS:0xB215+i`) and the value `(val<<8)+high`, then `lcall 1d99:11cf`:

```
0172  8a4606 98 8bd8    mov bx, i
0178  ffb715b2          push word [bx-0x4deb]     ; 2nd C arg: the operand's own code byte
017c  8a46ff b400 b108 d3e0   ax = val<<8
0185  8a56fe b600 03c2       ax += high
018c  50                push ax                   ; 1st C arg: the ECL address
018d  9acf11991d        lcall 1d99:11cf
```

### 1d. **Answer to "do codes 1 and 3 select different address spaces?" — NO.**

`1d99:11cf` is an FBOV thunk (`file 0x01FF5F`: `e8 bb f3 ea 97 08 a4 25 06 00`) →
**`25a4:0897`**, file `0x040B57`. Its prologue is:

```
0897  55 8bec 83ec0e
089d  807e0801          cmp  byte [bp+8],1        ; [bp+8] = the operand's code byte
08a1  7606              jbe  0x8a9
08a3  c646f702          mov  byte [bp-9],2        ;   code > 1  -> WORD access
08a7  eb04              jmp  0x8ad
08a9  c646f701          mov  byte [bp-9],1        ;   code <= 1 -> BYTE access
```

The code byte's **only** effect is `[bp-9]` ∈ {1,2}, and `[bp-9]` is consulted at exactly three
places, all of them the *default* (non-special) tail:

```
09c9  807ef701          cmp byte [bp-9],1
09cd  7511              jne 0x9e0
09cf  c41e0fb2          les bx,[0xb20f]           ; BYTE form (code 1)
09d3  035e06            add bx,[bp+6]
09d6  268a07            mov al,es:[bx]
...
09e0  c41e0fb2          les bx,[0xb20f]           ; WORD form (code 3)
09e4  035e06            add bx,[bp+6]
09e7  268a07            mov al,es:[bx]
09ec  8b5606 42         dx = addr+1
09f0  8b1e0fb2 03da     bx = [0xb20f]+dx
09f6  268a17            mov dl,es:[bx]
09fb  b108 d3e2 03c2    ax = al + (dl<<8)
```

**Codes 1 and 3 hit the same `[0xb20f]`-based array at the same offset. Code 1 reads one byte,
code 3 reads two (little-endian). That is the whole difference.** The DIVIDE-remainder example in
the brief (`09 03 29 00 01 c2 00`, verified at area 31 vaddr `0xa444` / `ECL.GLB` file
`0x027CC8` — the brief's `0xA43B` is the preceding `DIVIDE`) is therefore *not* evidence of a
second address space; it is a 16-bit read of the very same `[0xb20f]+0x29`.

So the prior investigation's `les bx,[0xb20f]` search was in the right *space*. It missed
`[0x0032]` for a completely different reason, below.

---

## 2. Where `[0x0032]` lives — `DS:0xC9F3`, not `[0xb20f]+0x32`

Before `25a4:0897` reaches the `[0xb20f]` tail it does two dispatches.

**(i) Range classifier `25a4:0377`** (file `0x040637`):

```
037a  cmp word [bp+6],1        ; addr
037e  jb  0x38b
0380  cmp word [bp+6],0x400
0385  ja  0x38b
0387  mov al,0                 ; class 0 : 0x0001..0x0400  -> host/area variable space
...
0399  mov al,1                 ; class 1 : 0x0401..0x0800
...
03ab  mov al,2                 ; class 2 : 0x8000..0xAEE2  -> a literal inside the script stream
03af  mov al,4                 ; class 4 : everything else (incl. 0) -> returns 0
```

`0x32` → **class 0**.

**(ii) Class-0 special-address table.** Still inside `25a4:0897`:

```
08d9  8b4606 48         ax = addr - 1
08dd  b90800            mov cx,8
08e0  bbf308            mov bx,0x8f3
08e3  2e3b07            cmp ax,cs:[bx]
08e6  7407              je  0x8ef
08ea  e2f7              loop 0x8e3
08ec  e9da00            jmp 0x9c9              ; NOT special -> the [0xb20f] tail quoted above
08ef  2eff6710          jmp word cs:[bx+0x10]
```

Raw values table, `file 0x040BB3`: `0f 00 10 00 22 00 2c 00 31 00 33 00 34 00 3c 00`
Raw handler table, `file 0x040BC3`: `13 09 79 09 84 09 a7 09 9c 09 65 09 6f 09 b2 09`

| ECL addr | handler | file | body — what the read actually returns |
| ---: | --- | --- | --- |
| `0x0010` | `25a4:0913` | `0x040BD3` | boolean walk of the `[0xc6e5]` linked list, predicate `lcall 077e:1734(node, 5, &tmp)`; returns 0/1. *(semantics not further decoded here)* |
| `0x0011` | `25a4:0979` | `0x040C39` | `[0xc9f2]`, **halved** when `es:[[0xb20f]+0x22] != 0` |
| `0x0023` | `25a4:0984` | `0x040C44` | `[0xc9f2]` raw — **party facing** |
| `0x002d` | `25a4:09a7` | `0x040C67` | `[0xc9f4]` — **cell descriptor** |
| **`0x0032`** | **`25a4:099c`** | **`0x040C5C`** | **`a0 f3 c9` `mov al,[0xc9f3]` — the facing-direction wall type** |
| `0x0034` | `25a4:0965` | `0x040C25` | `[0xc9f0]` — **party X** |
| `0x0035` | `25a4:096f` | `0x040C2F` | `[0xc9f1]` — **party Y** |
| `0x003d` | `25a4:09b2` | `0x040C72` | `lcall 1d99:148b([0xc9f0],[0xc9f1])` → `2f0d:0807` → GEO plane 3 (door/flag byte) at the party's cell |

`25a4:099c` in full (file `0x040C5C`): `a0 f3 c9  b4 00  8946f4  e9ab00`
= `mov al,[0xc9f3]; mov ah,0; mov [bp-0xc],ax; jmp 0xa52 (return)`.

**`[0x0032]` therefore has no storage of its own. It is a read-only projection of `DS:0xC9F3`.**
`0xC9F3` sits in the middle of DQK's five-byte party-pose block —
`0xC9F0` X, `0xC9F1` Y, `0xC9F2` facing, **`0xC9F3` wall type**, `0xC9F4` cell descriptor — the
same X/Y/facing/wallType/cellDescriptor tuple this project already located for DoK.

This is exactly why the prior 242-site `les bx,[0xb20f]` sweep found nothing: it was looking for a
producer of a value that has no producer, because the value is intercepted one layer earlier.
(For completeness, the sweep also structurally could not have found the generic write path even if
it mattered — `25a4:0817` stores via `les bx,[0xb20f]; add bx,[bp+6]; mov es:[bx],al`, a
*computed* displacement, never a literal `es:[bx+0x32]`.)

---

## 3. What writes `[0xc9f3]`, with byte evidence

An exhaustive scan of `DQK.EXE` for **every** x86-16 form that can store to absolute `[0xc9f3]`
(`a2`, `88 /r`, `89 /r`, `c6 06`, `c7 06`, `fe /0-/1`, `ff /0-/1`, `80/81/83 /r`, all `alu ev,r`
opcodes, `d0-d3 /r`, `f6/f7 /r` — each anchored on the literal displacement `f3 c9`) returns
**exactly four sites**, all `a2 f3 c9` (`mov [0xc9f3],al`):

| file | canonical | context |
| --- | --- | --- |
| `0x041506` | `25a4:1246` | end of the move/step routine |
| `0x0419CA` | `25a4:170a` | area/state (re)entry routine |
| `0x043BC4` | `25a4:3904` | the wrap/step routine that also clamps `[0xc9f1]` against the map height |
| `0x044018` | `25a4:3d58` | the turn routine (`facing = (facing±2 or +4) mod 8`) |

**All four are the same three-line idiom**, e.g. at `25a4:123a` (file `0x0414FA`):

```
1232  ff36f2c9          push word [0xc9f2]        ; facing
1236  ff36f1c9          push word [0xc9f1]        ; Y
123a  ff36f0c9          push word [0xc9f0]        ; X
123e  9af310991d        lcall 1d99:10f3
1243  83c406            add  sp,6
1246  a2f3c9            mov  byte [0xc9f3],al
1249  c606f8b701        mov  byte [0xb7f8],1      ; redraw flag
```

and at `25a4:3d44` (the *turn* handler, file `0x044004`) the identical sequence runs immediately
after `[0xc9f2]` is changed. So `[0xc9f3]` is recomputed on **every move and every turn**.

`1d99:10f3` is an FBOV thunk (file `0x01FE83`: `e8 97 f4 ea 28 06 0d 2f 0b 00`) →
**`2f0d:0628`**, overlay index 11, file `0x060F08`.

### `2f0d:0628` = `GetFacingWallType(x, y, facing)`

```
0628  55 8bec 83ec02
062e  c41e08ca          les  bx,[0xca08]          ; loaded GEO map buffer
0632  268a4701          mov  al,es:[bx+1]         ; row stride
     ... wrap x into 0..stride-1, wrap y into 0..es:[bx+0]-1 ...
0686  8a460a            mov  al,[bp+0xa]          ; facing
068b  3d0600            cmp  ax,6
068e  7603/e9c100       ja -> default (return uninitialised [bp-1])
0693  8bd8 d1e3         bx = facing*2
0697  2effa79c06        jmp  word cs:[bx+0x69c]
```

Jump table, `file 0x060F7C`: `aa 06 54 07 d8 06 54 07 ff 06 54 07 2e 07`

| facing | target | body |
| ---: | --- | --- |
| 0 (N) | `0x06aa` | `es:[bx + 8 + stride*y + x]`, **high nibble** (`and 0xf0; sar 4`) |
| 1 | `0x0754` | (return, no computation) |
| 2 (E) | `0x06d8` | `es:[bx + 8 + …]`, **low nibble** (`and 0x0f`) |
| 3 | `0x0754` | — |
| 4 (S) | `0x06ff` | `es:[bx + 0x318 + …]`, **high nibble** |
| 5 | `0x0754` | — |
| 6 (W) | `0x072e` | `es:[bx + 0x318 + …]`, **low nibble** |

Facings are stored doubled (N=0, E=2, S=4, W=6) — confirmed by the four literal setters at
`25a4:078b/0793/079b/07a2` (file `0x040A4B`…`0x040A62`): `c6 06 f2 c9 00 / 02 / 04 / 06`.

### The GEO buffer `[0xca08]` — proven, not assumed

`2f0d:01cc` (file `0x060AAC`):

```
01cc  b8480c            mov ax,0xc48              ; 3144 bytes
01cf  50                push ax
01d0  9a6f26d700        lcall 00d7:266f           ; malloc
01d6  89160aca          mov [0xca0a],dx
01da  a308ca            mov [0xca08],ax
```

`0xC48 = 3144 = 8 + 4*784`, and `784 = 0x310` is **exactly the largest cell count across all 20
retail GEO members** (`GEO.GLB` areas 10/30/34/42/50/58/62 are 28×28 = 784; every member satisfies
`len == 8 + 4*W*H`, verified for all 20). So the buffer holds a fixed 8-byte header plus four
784-byte planes at `+8`, `+0x318`, `+0x628`, `+0x938`.

And `2f0d:1341` (file `0x061C21`) is the loader that **expands the packed on-disk member into that
fixed layout**, which removes the last possible ambiguity:

```
1341  les bx,[0xca08]; n = es:[bx+1] * es:[bx+0]         ; W*H
135c  ax = [0xca08]+0x938 ; src = [0xca08]+8+3n ; lcall 00d7:2776 (memmove, n bytes)
1386  ax = [0xca08]+0x628 ; src = [0xca08]+8+2n ; memmove
13af  ax = [0xca08]+0x318 ; src = [0xca08]+8+1n ; memmove
```

(preceded at `132b` by an `8 + 4*W*H == filesize` assertion that aborts via `1093:002d` on
mismatch). Plane 0 already sits at `+8`.

This matches, byte for byte, the model `packages/engine/src/loaders/geo.ts` already documents for
Gen2 — *"plane0 = (N<<4)|E walls, plane1 = (S<<4)|W walls, plane2 = backdrop, plane3 = door
flags"* — an independent cross-check derived from the file side rather than the code side.
`2f0d:075b` (`[0xc9f4]`, ECL `[0x002d]`) reads `es:[bx+0x628+…]` (plane 2) and `2f0d:0807`
(ECL `[0x003d]`) reads `es:[bx+0x938+…]` (plane 3), both consistent.

### The four ECL `SAVE #0,[0x0032]` writes are dead stores — proven

The numeric ECL write path is `2033:03c8` (the opcode-`0x09` `SAVE` handler, file `0x0320E8`),
which resolves the *source* through `2033:0112` but takes the *destination* address raw
(`([0xae6c]<<8)|[0xb187]` = `valArr[2]<<8|highArr[2]`) and calls `lcall 1d99:11a7` →
**`25a4:06d2`** (file `0x040992`).

`25a4:06d2` has its **own, different, six-entry** class-0 special table:

Raw values, `file 0x0409E8`: `10 00 19 00 21 00 33 00 34 00 39 00`
Raw handlers, `file 0x0409F4`: `70 07 40 07 be 07 60 07 68 07 ee 07`

| ECL addr | handler | writes |
| ---: | --- | --- |
| `0x0011` | `25a4:0770` | facing → `[0xc9f2]` (0/2/4/6) |
| `0x001a` | `25a4:0740` | clears `[0xca07]`, `lcall 1f4e:0000` |
| `0x0022` | `25a4:07be` | mode switch (`[0xae57]` ← 3 or 4) |
| `0x0034` | `25a4:0760` | `[0xc9f0]` — party X |
| `0x0035` | `25a4:0768` | `[0xc9f1]` — party Y |
| `0x003a` | `25a4:07ee` | `es:[[0xb20f]+0x3a]` + `lcall 10b2:047c` |

**`0x0032` is absent from the write table.** A write to it therefore falls through to the default
tail at `25a4:0817` and stores into `es:[[0xb20f]+0x32]` — a byte that the *read* path
(§2) never consults, because it intercepts `0x32` first.

The four corpus writes, verified byte-for-byte in `DISK3\ECL.GLB` this session:

| area | member | vaddr | ECL.GLB file offset | bytes |
| --- | --- | --- | --- | --- |
| 14 | 8 | `0x848b` | `0x00C19F` | `09 00 00 01 32 00` = `SAVE #0 -> [0x0032]` |
| 14 | 8 | `0x84af` | `0x00C1C3` | `09 00 00 01 32 00` |
| 15 | 9 | `0x9211` | `0x00FDB9` | `09 00 00 01 32 00` |
| 15 | 9 | `0x9232` | `0x00FDDA` | `09 00 00 01 32 00` |

All four are **no-ops with respect to `[0x0032]`'s value**. (`00 00` is a code-0 2-byte immediate
frame — which itself independently re-confirms §1b's framing, since the instruction lands exactly
6 bytes wide.)

### Search strategies run, and what each covered

1. **Every absolute-displacement store form to `0xC9F3`** in the whole 449 664-byte file (list in
   §3 above). Covers `mov`/`inc`/`dec`/`alu`/`shift`/`neg`-class writes through a literal
   displacement, in every segment, resident and overlay. → 4 hits, all the same recompute idiom.
   *Not covered:* a write through a register-held pointer (`mov bx,0xc9f3; mov [bx],al`) or a
   `rep stos` sweep. Given all four literal writers are the same 3-instruction recompute and the
   value is a pure function of `(X, Y, facing, GEO)`, a hidden pointer-based writer would be
   pathological; I label the exclusion of that case an **inference**, not a proof.
2. **The full read dispatch chain** `2033:0013 → 2033:0112 → 1d99:11cf → 25a4:0897 → 25a4:099c`,
   disassembled end to end, plus the range classifier and both special tables read as raw bytes.
   This is what makes the negative *structural* rather than statistical: `0x0032` cannot reach
   `[0xb20f]` on the read side at all.
3. **The full write dispatch chain** `2033:03c8 → 1d99:11a7 → 25a4:06d2`, incl. its own special
   table read as raw bytes. Establishes that ECL writes to `0x0032` are dead.
4. **`ECL.GLB` byte verification** of every citation in `dqk-ending-ingress.md` that touches
   `0x0032` (areas 14, 15, 66) plus a corpus-wide raw census of the operand pattern `01 32 00`:
   it occurs in **22 of the 47 areas** (10, 14, 15, 18, 26, 27, 28, 30, 31, 32, 34, 35, 38, 46,
   50, 52, 58, 59, 62, 65, 66, 67). A raw census over-counts (§ the method note in the prior doc),
   but that breadth is itself corroboration: a genuinely never-armed one-off flag would not be
   referenced across half the game.

---

## 4. Consequences for area 66

`[0x0032] != 0` means **"the party is facing a non-empty wall slot."** Measured against the real
`GEO.GLB` area-66 member (member 20, **34 wide × 22 tall**, 748 cells, packed length
3000 = `8 + 4*748`; header byte order is *height then width* — see §8):

- `229` of the `2992` `(cell, facing)` states have a nonzero wall type — i.e. the master gate is
  satisfied in `7.7 %` of all standing positions, across `150` distinct cells.
- Nonzero wall types present: 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15 (all four planes).

Area 66's 15-arm dispatcher is also now fully explained. At vaddr `0x8669`
(`ECL.GLB` file `0x06C3F5`) the bytes are:

```
2f 00 7f 01 2d 00 01 9b 00      AND #0x7F, [0x002d] -> [0x009B]
25 01 9b 00 00 0f  <15 targets> ON_GOTO [0x009B], #15
```

`[0x002d]` is the **cell descriptor** (§2). So area 66 dispatches on `cellDescriptor & 0x7F` and
each *content* arm additionally requires that you be facing a wall — the ordinary Gold Box
"you are standing on a special cell **and** facing the feature" idiom, not a story latch.

Two further facts, both checked against real bytes:

- **The terminal arm is NOT gated on `[0x0032]` at all.** Arm 14 at vaddr `0x9d18`
  (`ECL.GLB` file `0x06DAEC`) is `03 01 a0 00 00 ff 16 01 01 2a` =
  `COMPARE [0x00A0],#255 / IF_EQ / GOTO 0x9d2a`, then falls through to `GOSUB 0x9F03; NEWECL #67`.
  Its precondition is the `[0x00A0]` step counter, which `dqk-ending-ingress.md` already proved is
  an ordinary saturating in-area counter.
- Its dispatch value is `cellDescriptor & 0x7F == 14`, which occurs at **exactly one cell**,
  `(x=27, y=4)` (descriptor byte `0x8E`). That cell's West wall is type 14 (verified:
  `N=0 E=0 S=0 W=14`), so standing there facing West satisfies every content gate too.

---

## 5. Recommended matrix status for DQK `ending`: **`proven`**

> DQK's `ending` leg was previously `blocked` on the claim that host word `[0x0032]` — the master
> gate on area 66's content — is never armed by anything in the game. That claim rests on a false
> premise. Static disassembly of DQK.EXE's ECL operand resolver
> (`2033:0013` → `2033:0112` → `1d99:11cf` → `25a4:0897`) shows address `0x0032` is intercepted by
> a class-0 special-address table at `25a4:08f3` (raw bytes `DQK.EXE:0x040BB3`) and dispatched to
> `25a4:099c` (`DQK.EXE:0x040C5C`: `a0 f3 c9` = `mov al,[0xc9f3]`), so it is not stored in the
> `[0xb20f]` area record at all — it is `DS:0xC9F3`, the wall type of the map edge the party is
> facing, recomputed from the loaded GEO map by `2f0d:0628` on every move and every turn (all four
> writers of `0xC9F3` in the binary — `DQK.EXE:0x041506`, `0x0419CA`, `0x043BC4`, `0x044018` — are
> that same recompute). The four ECL `SAVE #0,[0x0032]` sites in areas 14/15 are dead stores,
> because the write path (`25a4:06d2`, table at `DQK.EXE:0x0409E8`) has no special case for
> `0x0032` and targets a byte the read path never consults. Against retail `GEO.GLB` area 66,
> the gate is satisfied in 229 of 2992 `(cell, facing)` states; area 66 dispatches on
> `cellDescriptor & 0x7F` (`AND #0x7F,[0x002d]->[0x009B]` at ECL.GLB `0x06C3F5`), and its terminal
> arm (`0x9d18`, ECL.GLB `0x06DAEC`) is gated only on the `[0x00A0]` step counter, not on
> `[0x0032]`. Combined with the already byte-proven ingress chain area 5 → 62 → 64 → 66, the
> ending leg's content is reachable by ordinary play, by a mechanism proven against the retail
> disassembly.

This meets the matrix's own `proven` definition ("engine-level byte-grounded proof exists (VM
golden and/or CFG trace against the real retail disassembly) … live in-browser wiring is NOT
required"). It is emphatically **not** `structurally-absent` — the content is present and
reachable — and it is no longer `blocked`, because the thing that was unresolved is now resolved
with byte evidence rather than assumed away.

### PROVEN vs INFERRED — stated plainly

**Proven (byte-level, this session):**
- `2033:007c` handles codes 1, 2 and 3 identically and only fetches a third frame byte.
- Codes 1 and 3 address the **same** space; the difference is byte vs word width.
- ECL `[0x0032]` reads `DS:0xC9F3` via `25a4:099c`; it never reaches `[0xb20f]+0x32` on read.
- `DS:0xC9F3` is written at exactly four sites, all recomputing `GetFacingWallType(X, Y, facing)`
  from the GEO wall planes.
- The GEO runtime buffer layout (`+8` / `+0x318` / `+0x628` / `+0x938`, 784-byte planes) and its
  packed→fixed expansion loader.
- ECL writes to `0x0032` are dead stores (write-side special table verified, `0x32` absent).
- Area 66's `ON_GOTO` selector is `cellDescriptor & 0x7F`; its terminal arm is not `[0x0032]`-gated.
- All the ECL.GLB / GEO.GLB byte citations in §3 and §4.

**Inferred (labelled as such):**
- That no *pointer-based* (register-held-address) writer of `0xC9F3` exists. The literal-displacement
  scan is exhaustive; a `mov bx,0xc9f3`-style writer would not be caught. Judged pathological given
  the value's pure-function nature, but not proven.
- Semantics of `[0x0010]`'s list predicate (`077e:1734` with selector 5) — not decoded.
- That the terminal *damnation* variant (`[0x009A]==4` at `0x9d2a`/area 67 `0x965b`) is reachable.
  Area 66 contains only **two** `(cell, facing)` states with wall type exactly 4 — `(26,4)` and
  `(26,15)`, both facing East — and neither is the descriptor-14 cell `(27,4)`. `[0x009A]` is
  refreshed by `vmRun1` (`SAVE [0x0032],[0x009A]` at `0x859e`, guarded by `COMPARE [0x0097],#1`),
  so this depends on how often that guard is open. **This is a scene-selection question inside an
  already-reachable ending, not a reachability blocker**, and it is explicitly *not* claimed here.

---

## 6. Single next experiment (confirmation, not rediscovery)

Static analysis is complete for the `[0x0032]` question; the remaining item is the damnation
variant. The cheapest decisive experiment is **static + engine-side, no DOSBox-X**:

Run the project's own CFG-aware Gen2 walker over `ECL.GLB` member 46 (area 66) and member 47
(area 67) with the corrected operand table, and determine the reachable value set of `[0x0097]`
(area 66's `vmRun1` guard at `0x8596`) and `[0x00A0]` (the saturating step counter at
`0x8633`/`0x8639`). Specifically answer: *can `vmRun1` reach its `SAVE [0x0032],[0x009A]` at
`0x859e` while the party stands at `(26,4)` or `(26,15)` facing East, and does anything reset
`[0x009A]` between then and the `[0x00A0]==255` terminal arm at `0x9d18`?* If yes, the damnation
scene is proven too; if no, it is a `[0x0097]`-gated dead variant and should be recorded as such.

If a live confirmation of §2/§3 is ever wanted, it is now a one-shot Unicorn watch rather than an
open-ended hunt: `tools/unicorn_dqk_trace.py --run … --watch-exec 0x25a4:0x099c:ecl-0032-read
--watch-exec 0x25a4:0x1246:wallType-recompute` plus a DGROUP read/write watch on offset `0xc9f3`.
The prediction is unambiguous — `0xc9f3` changes on every step and every turn, and `25a4:099c`
fires on every ECL `[0x0032]` reference — so a single boot-to-dungeon run either confirms or
refutes the whole model.

---

## 7. Corrections to existing docs (bytes win)

- `docs/engine/research/dqk-ending-ingress.md` §(c)/(d): *"no mechanism … ever arms host word
  `[0x0032]`"* — **superseded**. `[0x0032]` is not armed by anything because it is not a latch.
  Its §(d) `blocked` recommendation should be revisited per §5 above. (Its byte citations for
  areas 14/15/66 are all correct and were re-verified here; only the interpretation changes.)
- `docs/engine/research/decompile-dqk-ecl-dispatch.md`, "The operand-count table" section: the
  operand-code table is printed as `{1, 2, 3, 0, 0x81}`; the real bytes at `DQK.EXE:0x031D88` are
  `01 00 02 00 03 00 80 00 81 00`, i.e. `{1, 2, 3, 0x80, 0x81}`.
- `tools/disasm_dqk.py OVERLAY_PREFIX_BYTES[6] = 1640 (0x668)` yields paragraph base `0x0403D0`,
  which the campaign-legs doc already flagged as wrong. The base that works is `0x0402C0`, i.e. an
  effective prefix of `0x550`. Not changed here (this session is doc-only), but it is a real,
  reproducible discrepancy in a checked-in table.

---

## 8. Operator follow-up (2026-08-07) — verification result, and one engine bug it exposed

Everything in §1–§4 above was re-derived independently from the retail bytes before any of it was
acted on. **The core finding holds**: `[0x0032]` is `DS:0xC9F3`, the facing wall type, and the
ending arm does not consult it. Three things changed on the way, all recorded here rather than
silently patched into the text above.

**1. The decisive cross-check the memo did not make.** The same special-address table maps ECL
`[0x002d]` → `[0xc9f4]`, and `0x002d` is the Gen2 `cellDescAddr` this project established years
earlier from an entirely unrelated direction. That pins the whole `[0xc9f0..f4]` block
(X / Y / facing / wallType / cellDescriptor) without relying on any judgement call in the
disassembly — and it is the same 5-tuple already located for DoK.

**2. `packages/engine/src/loaders/geo.ts` had Gen2 GEO width and height swapped.** The memo's §3
calls `es:[bx+1]` the "row stride" and is right; the engine had `width = raw[0]`. Proven from
`2f0d:0628` itself: it clamps the X argument against `es:[buf+1] - 1`, clamps Y against
`es:[buf+0] - 1`, and indexes `es:[buf+1] * Y + X`. Corroborated three ways — all 8 non-square
retail Gen2 maps score higher wall-edge symmetry under `(height, width)` (mean **0.877** vs
**0.660**, 8/8), that is the only order that reproduces the "sym_E 0.85–1.00" figure the file's own
comment already claimed, and area 66's ECL writes `X = 29`, which is out of range under the
transposed reading. Fixed in `geo.ts`, `geoEncode.ts` and the synthetic fixture in `geo.test.ts`;
8 of the 20 Gen2 maps were being transposed. This is a real user-visible bug that the `[0x0032]`
investigation surfaced by accident.

**3. The reachability claim needed the landing pose, and the memo's phrasing would have misled.**
Area 66's `initial_entry` writes the party pose *twice*: `0x8055` sets `(29,21)` only to stage the
17-frame "YOU FIND YOURSELVES FALLING BETWEEN WORLDS" loop, then `0x80B1` sets `(6,21)` — the real
landing, immediately before "WELCOME TO THE ABYSS." The map's wall graph is **directed** (Gold Box
wall slots are one-sided) and area 66 is not one connected region:

- from the landing pose `(6,21)`: **629** cells reachable, ending cell `(27,4)` at **38 steps** ✔
- from the transient animation pose `(29,21)`: only 110 cells, ending cell **unreachable** ✘

So the leg is proven, but it is proven *because* `(6,21)` is the landing pose — not because the
map is open. An earlier reverse-direction search of mine reported "reachable from all 748 cells";
that was wrong twice over (transposed map, and searching *from* the target rather than *to* it),
and is corrected here rather than left standing.

All of §1–§4's byte citations that bear on the verdict were checked and are accurate. Anchored in
`packages/engine/test/dqkCampaignLegs.test.ts` cases **G** and **H**, including the negative
control for the transient pose. The §6 damnation-variant question is untouched and remains open —
it is scene selection inside an already-reachable ending, not a reachability question.
