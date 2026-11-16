# Death Knights of Krynn — per-monster kill experience

**Status: LOCATED (2026-08-19).** Verified independently by this synthesis pass against the
retail bytes; every offset below was re-read from disk, not inherited from the method agents.

| record offset | width | field | evidence |
| --- | --- | --- | --- |
| **108** (`0x6C`) | u8 | current / rolled hit points — the XP multiplicand | VERIFIED |
| **109..110** (`0x6D`) | u16 LE | **flat per-monster kill-XP term** | VERIFIED |
| **111** (`0x6F`) | u8 | **per-hit-point XP multiplier** | VERIFIED |

```
award(monster) = u16le(rec + 109) + rec[111] * rec[108]
```

accumulated in 32 bits over every enemy combatant, then pooled money and item plusses are
added and the total divided by the surviving party count — structurally identical to
Champions of Krynn.

This is **hypothesis (a)**: the fields are literal bytes of the shipped 216-byte record.
**Hypothesis (b) — computed from hit dice or hp by a formula or table — is falsified**, by
two independent code paths and by a direct counterexample in the data (§7).

The task brief's **leading hypothesis is also falsified, and in the opposite direction**:
DoK does not expand a 216-byte record into a ~409-byte CCH. DoK's runtime combatant record
*is* 216 bytes. The only 409↔216 conversion in the binary runs **409 → 216**, on the
CoK-character *import* path, and it is that conversion table which turned out to be the
single strongest piece of evidence in the whole investigation (§6).

---

## 1. The question

`Death Knights of Krynn/MON1CHA.DAX` decodes to 64 records of exactly 216 bytes. Every field
had been located except per-monster **kill experience** — see the block comment at the head of
`packages/engine/src/loaders/monster.ts`: name 0..15, abilities 16..27, THAC0 @31, category
@32, hp @40 (mirrored @214), combat size @41, saves @42..46, hit dice @48, morale @62, a
partial hd mirror @71.

## 2. What was already ruled out, and why that forced a code-side attack

Three statistical sweeps over MON1CHA had returned negatives:

1. exact byte / u16LE / u16BE match against the CoK cross-title anchors (GHOUL = 65,
   SIVAK = 350) at every one of the 216 offsets → **zero hits**;
2. a full Pearson correlation sweep of every u8/u16/u32 window against the located hp and
   hitDice columns → nothing beyond the located fields and their neighbours;
3. a Spearman rank sweep against hitDice → the same negative.

**Both negatives were real measurements, and both were wrong about the world.** The synthesis
pass re-ran them and found exactly why. This matters more than the field itself, because the
same two failure modes are live in the rest of this project's method:

**(2a) The exact-anchor sweep was poisoned by a conjunction.** Re-running it per-anchor rather
than jointly:

```
GHOUL == 65   : [(109,'u8'), (109,'u16LE')]        <- unique offset, and it is the answer
GHAST == 190  : [(60,'u8'), (109,'u8'), (59,'u16BE'), (109,'u16LE')]
SIVAK == 350  : []                                 <- appears NOWHERE, any width
RED DRAGON == 1950 : []                            <- likewise
joint u16LE (GHOUL==65 AND GHAST==190) : [109]     <- unique
```

GHOUL = 65 *does* hit, at exactly one of the 215 u16LE windows, and that window is the true
field. SIVAK = 350 hits nothing anywhere in DoK because **DoK re-costed SIVAK to 2000 flat /
0 per-hp** (same hd 6, same hp 27 as CoK). A sweep requiring both anchors at a common offset
is unsatisfiable by construction and returns zero regardless of where the field lives. *One
rebalanced anchor vetoed a correct, unique hit.*

**(2b) The rank sweep genuinely could not have found it, and this is quantified.** |Spearman|
of every varying u16LE window against hd@48, measured in this pass:

```
off  47  rho=0.990     off  44  rho=0.789     off 213  rho=0.646
off  43  rho=0.902     off  41  rho=0.743     off  39  rho=0.646
off  45  rho=0.896     off 109  rho=0.699 <-- off 107  rho=0.638
off  42  rho=0.854                            off  30  rho=0.605
```

Offset 109 ranks **7 of 101**, sitting directly on the shoulder of the six already-located
saves/hd windows at 41..47 — i.e. squarely inside the band the loader comment writes off as
"the located fields and their immediate neighbours". The multiplier at 111 is worse still:
rank **12 of 82, rho = 0.492** over all 64 records, because 13 monsters carry a deliberate
multiplier of 0. On the 51 records with a nonzero multiplier it rises to rho = 0.897, but no
blind sweep knows to take that subset.

**Conclusion that drove the attack:** the field is invisible to correlation and was hidden
from exact matching by a bad anchor. It had to come out of the code. *The negative was sound;
the inference drawn from it was not.*

## 3. The CoK oracle (given, and re-verified here)

`Champions of Krynn/GAME.OVR` file offset `0x6335` is CoK's `calc_battle_exp`; its core
arithmetic is at `0x640B..0x6441`. Re-read from disk in this pass:

```
0x640b  c4 7e fc              les di, [bp-4]
0x640e  26 8a 85 1b 01        mov al, es:[di+0x11b]     ; rolled HP
0x6413  30 e4                 xor ah, ah
0x6415  8b d0                 mov dx, ax
0x6417  c4 7e fc              les di, [bp-4]
0x641a  26 8a 85 32 01        mov al, es:[di+0x132]     ; per-HP XP multiplier
0x641f  30 e4                 xor ah, ah
0x6421  f7 e2                 mul dx
0x6423  99                    cwd                       ; see mnemonic caveat below
0x6424  8b c8 / 8b da         mov cx,ax / mov bx,dx
0x6428  c4 7e fc              les di, [bp-4]
0x642b  26 8b 85 30 01        mov ax, es:[di+0x130]     ; flat XP, u16 LE
0x6430  31 d2                 xor dx, dx
0x6432  03 46 f7 / 13 56 f9   add ax,[bp-9] / adc dx,[bp-7]
0x6438  03 c1 / 13 d3         add ax,cx / adc dx,bx
0x643c  89 46 f7 / 89 56 f9   mov [bp-9],ax / mov [bp-7],dx
```

**CoK static == CoK runtime.** VERIFIED here by reading CoK's own 409-byte records at the
oracle displacements:

```
CoK MON1CHA GHOUL      hp98=9   hd214=2   b283=9   u16@304=65    b306=2
CoK MON1CHA SIVAK      hp98=27  hd214=6   b283=27  u16@304=350   b306=6
CoK MON2/3CHA GHAST    hp98=18  hd214=4   b283=18  u16@304=190   b306=4
CoK MON1CHA RED DRAGON hp98=33  hd214=11  b283=33  u16@304=1950  b306=16
```

Both brief-supplied anchors reproduce at the oracle's own offsets, so CoK's static record
offsets equal its runtime CCH offsets and the oracle is sound.

> **Mnemonic caveat, applies throughout.** `tools/disasm_*.py` (capstone) prints bytes `98`
> and `99` as `cwde` / `cdq`. These are 16-bit real-mode overlays: the correct mnemonics are
> **`cbw` / `cwd`**. Every method agent copied the tool's output verbatim. The bytes and the
> memory operands are unaffected, but note the semantic consequence: `99` immediately after
> `f7 e2 mul dx` **overwrites DX with sign-extend(AX)**, discarding the multiply's high word.
> `mult * hp` is therefore truncated to a signed 16-bit int before the 32-bit accumulate.
> CoK does the identical thing at `0x6423`, so it is a shared Borland long-promotion artifact,
> not a DoK divergence. Largest retail product is UNDEAD ROC 25 x 81 = 2025, so it never
> bites — but a faithful re-implementation must reproduce it.

## 4. Method 1 — instruction-shape transfer (the primary route)

**Searched:** all 252,469 bytes of DoK `GAME.OVR` for the encoding-level signature of the
CoK core, `f7 e2 99 8b c8 8b da` (`mul dx; cwd; mov cx,ax; mov bx,dx`).

**Null (measured here):** the 7-byte idiom occurs **2x in CoK** (269,031 bytes; one of the two
is the known oracle) and **exactly 1x in DoK** (252,469 bytes), at `0x4D01`. This was not a
shortlist narrowed by fit — there was a single candidate site.

**Found**, verified byte-exact in this pass by raw read of `Death Knights of Krynn/GAME.OVR`
at `0x4CED` (`c4 7e fc 26 8a 45 6c 30 e4 8b d0 c4 7e fc 26 8a 45 6f 30 e4 f7 e2 99 8b c8 8b
da c4 7e fc 26 8b 45 6d 31 d2 03 46 f7 13 56 f9 03 c1 13 d3 89 46 f7 89 56 f9`):

```
004ced  c4 7e fc              les di, [bp-4]
004cf0  26 8a 45 6c           mov al, es:[di+0x6c]      ; rolled HP        <- CoK +0x11b
004cf4  30 e4                 xor ah, ah
004cf6  8b d0                 mov dx, ax
004cf8  c4 7e fc              les di, [bp-4]
004cfb  26 8a 45 6f           mov al, es:[di+0x6f]      ; per-HP mult      <- CoK +0x132
004cff  30 e4                 xor ah, ah
004d01  f7 e2                 mul dx
004d03  99                    cwd
004d04  8b c8 / 8b da         mov cx,ax / mov bx,dx
004d08  c4 7e fc              les di, [bp-4]
004d0b  26 8b 45 6d           mov ax, es:[di+0x6d]      ; flat XP u16 LE   <- CoK +0x130
004d0f  31 d2                 xor dx, dx
004d11  03 46 f7 / 13 56 f9   add ax,[bp-9] / adc dx,[bp-7]
004d17  03 c1 / 13 d3         add ax,cx / adc dx,bx
004d1b  89 46 f7 / 89 56 f9   mov [bp-9],ax / mov [bp-7],dx
```

The enclosing routine is DoK's `calc_battle_exp`, `0x4C1B..0x4F14`. Prologue verified byte-exact
at `0x4C1B`: `55 89 e5 83 ec 12 80 3e 64 db 00 74 1c c4 3e c2 a2 26 8a 45 30 98 ba 64 00 f7 e2`,
against CoK `0x6335`: `55 89 e5 83 ec 12 80 3e 3e 88 00 74 1d c4 3e 96 60 26 8a 85 d6 00 98 ba
64 00 f7 e2`. Epilogue verified at `0x4F0F`: `89 ec / 5d / ca 04 00` (`mov sp,bp; pop bp;
retf 4`), matching CoK `0x6671`.

**Null for the routine identification (measured by a refuter, and decisive).** Normalising
instructions to mnemonic + operand skeleton with immediates and displacements blanked, and
scoring CoK `0x6335` against **every** offset in DoK `GAME.OVR`: `0x4C1B` runs **90
consecutive matching instructions**; the second-best site in the entire file runs **6**. The
reverse sweep over all 269,031 CoK offsets finds no site above 5 except `0x6335` itself. A
separate refuter scored CoK's full 280-instruction routine against all 813 `55 89 e5`
prologues in DoK: `0x4C1B` = 0.9188, best rival 0.3236. The correspondence is strictly
one-to-one in both directions.

**Displacement remap read straight off the aligned instructions:**

| role | CoK | DoK |
| --- | --- | --- |
| hit-dice byte (duel `x100` early-out) | +0x0D6 | +0x030 |
| money array base | +0x0EB | +0x037 |
| rolled HP | +0x11B | +0x06C |
| flat XP (u16 LE) | +0x130 | +0x06D |
| per-HP XP multiplier | +0x132 | +0x06F |
| item link far ptr | +0x143/+0x145 | +0x07D/+0x07F |
| owner/item struct ptr | +0x183 | +0x0BD |
| health/status test | +0x188 | +0x0C7 |
| enemy-team test (`== 1`) | +0x18A | +0x0C9 |
| next-combatant far ptr | +0x17F/+0x181 | +0x0B9/+0x0BB |
| record size | 0x199 = 409 | 0xD8 = 216 |

The deltas are **not constant** (0xA6, 0xAF, 0xB4, 0xC1, 0xC3, 0xC6) — this is a genuine
re-pack, not a rebasing. Non-combatant struct offsets are *identical* in both games as a
control (item `+0x13`, `+0x2A`, `+0x2C`, `+0x32`, `+0x34`), which is what you expect if only
the character/monster record was re-laid-out.

## 5. Method 2 — the string walk-back (dead end, bounded)

**Searched:** all 609 printable ASCII runs of length >= 4 in DoK `GAME.OVR` for
`experien|receiv|each char|has won|duel|rejoice|gains`. **One hit only**, `"Experience "` at
`0x23CE5`, and a hexdump there shows it is the character-sheet field label (`05 "Level" 01 "/"
01 "0" 0b "Experience " 04 "STR "`), identical to CoK's at `0x26DDC`.

**Why it dead-ended, and it is a structural fact worth recording:** CoK keeps the combat-results
text CS-relative *inside* `GAME.OVR` (`0x6D2C` `"You have won the duel."`, `0x6D43` `"The party
has won."`, `0x6DBD` `"The duelist receives "`, `0x6DD3` `"Each character receives "`, `0x6DEC`
`"experience points."`). **DoK keeps none of it in `GAME.OVR`.** DoK's are Pascal
length-prefixed, all-lowercase, in `START.EXE` DGROUP: `0xCF9E` `16 "you have won the duel."`,
`0xCFBC` `12 "the party has won."`, `0xD069` `15 "the duelist receives "`, `0xD086` `18 "each
character receives "`, `0xD0A5` `12 "experience points."`, plus `0xCF6A` `"the party has
fled."` and `0xE15D` `"the monsters rejoice for the party has been destroyed"`.

Two attempts to recover the DGROUP base and bind those strings to code both failed and are
recorded as bounded negatives: (a) counting how many of 303 Pascal-string offsets minus a
candidate base appear as an imm16 after `B8/BA/BB/B9/BE/BF/68` — peak 38 at base `0xC3CD`
against mean 6.3 and p99 25, too weak to accept; (b) a three-string offset-triple search
(V, V+0x1D, V+0x3C) within a 400-byte window — ~60 candidate bases in `GAME.OVR`, ~30 in
`START.EXE`, none discriminating. **No DGROUP base was recovered and `displayCombatResults`
was never reached.** This does not affect the result, which came from the arithmetic instead.

## 6. Method 3 — the loader/expansion hunt (which found the best evidence, by being wrong)

This method was tasked with finding a 216 → 409 expansion. **There is none** — but the search
turned up its mirror image, and it is the strongest single artifact in this investigation.

DoK `GAME.OVR` `0x12CAD` dispatches on a flag at `[0xC468]`:

```
012cad  3c 00                 cmp al, 0
012caf  74 03                 je 0x12cb4
012cb1  e9 34 03              jmp 0x12fe8
```

**The `== 1` (native) branch**, verified at `0x12FE8`, reads **216 bytes** straight into the
caller's out-param at `[bp+0x0A]`:

```
012fe8  3c 01                 cmp al, 1
012fea  75 5d                 jne 0x13049
012ff2  c4 7e 0a              les di, [bp+0xa]
012ff7  b8 d8 00              mov ax, 0xd8              ; 216
012ffb  50                    push ax
013001  9a 27 19 07 0a        lcall 0xa07, 0x1927       ; read
```

**The `== 0` (import) branch** allocates a **409-byte** scratch buffer, zero-fills the caller's
216-byte record, reads 409 bytes into the scratch, runs **ten explicit field-run copies** from
the 409 layout into the 216 layout, then **frees the scratch**:

```
012cb4  b8 99 01              mov ax, 0x199             ; 409
012cb8  9a 3f 02 07 0a        lcall 0xa07, 0x23f        ; far alloc -> [bp-0x3f0]
012cd7  c4 7e 0a              les di, [bp+0xa]          ; the 216-byte destination
012cdc  b8 d8 00              mov ax, 0xd8              ; memset 216 to 0
012ce3  9a d4 1a 07 0a        lcall 0xa07, 0x1ad4
012cfe  9a 27 19 07 0a        lcall 0xa07, 0x1927       ; read 409 bytes into scratch
  ... ten copies ...
012fdd  b8 99 01              mov ax, 0x199
012fe1  9a 54 02 07 0a        lcall 0xa07, 0x254        ; free the 409 scratch
```

Direction is fixed independently of the helper's argument convention: the 216-byte object is
memset **before** the copies and survives the call; the 409-byte buffer is allocated, filled
from disk, and **freed** at the end. 409 is the source, 216 the destination.

A representative copy, and **it is the one that answers the question** — `0x12DA3..0x12DBA`:

```
012da3  c4 be 10 fc           les di, [bp-0x3f0]        ; 409-byte side
012da7  81 c7 30 01           add di, 0x130             ; <- CoK CCH flat-XP offset
012dab  06 57                 push es / push di
012dad  c4 7e 0a              les di, [bp+0xa]          ; 216-byte side
012db0  81 c7 6d 00           add di, 0x6d              ; <- DoK record offset 109
012db4  06 57                 push es / push di
012db6  b8 03 00              mov ax, 3                 ; three bytes: u16 XP + u8 mult
012db9  50                    push ax
012dba  9a b1 1a 07 0a        lcall 0xa07, 0x1ab1       ; block move
```

**The full ten-entry table, extracted programmatically in this pass:**

```
409[0x000..0x01d] <-> 216[0x000..0x01d]  len 30   (  0.. 29 <->   0.. 29)
409[0x058..0x062] <-> 216[0x01e..0x028]  len 11   ( 88.. 98 <->  30.. 40)
409[0x0cf..0x0d6] <-> 216[0x029..0x030]  len  8   (207..214 <->  41.. 48)
409[0x0da..0x0e5] <-> 216[0x031..0x03c]  len 12   (218..229 <->  49.. 60)
409[0x0f3..0x119] <-> 216[0x03f..0x065]  len 39   (243..281 <->  63..101)
409[0x11a..0x11b] <-> 216[0x06b..0x06c]  len  2   (282..283 <-> 107..108)
409[0x130..0x132] <-> 216[0x06d..0x06f]  len  3   (304..306 <-> 109..111)   <== THE ANSWER
409[0x135..0x140] <-> 216[0x070..0x07b]  len 12   (309..320 <-> 112..123)
409[0x142..0x187] <-> 216[0x07c..0x0c1]  len 70   (322..391 <-> 124..193)
409[0x188..0x198] <-> 216[0x0c7..0x0d7]  len 17   (392..408 <-> 199..215)
```

**Why this is the strongest evidence in the file.** It is a field-correspondence table written
by SSI's own programmers, and it reproduces **five independently-located anchors it was never
fitted to**:

- `409[0..29] ↔ 216[0..29]` — name 0..15 + abilities 16..27, identity mapping. OK
- `409[98] ↔ 216[40]` — CoK hp @98 ↔ DoK hp @40. OK
- `409[208..212] ↔ 216[42..46]` — CoK saves ↔ DoK saves. OK
- `409[214] ↔ 216[48]` — CoK hit dice ↔ DoK hit dice. OK
- `409[283] ↔ 216[108]` — CoK rolled HP ↔ DoK 108, the byte `monster.ts` calls a
  "ruled-out impostor … different, unidentified field". OK

and *then* asserts `409[304..306] ↔ 216[109..111]`. The XP identification is therefore
established by a code path that has **nothing to do with `calc_battle_exp`**, and whose
correctness is independently attested by four anchors located earlier by other methods. The
two routes agree exactly.

The table also explains three gaps: `216[61..62]` (morale) is **deliberately not imported**
(CoK morale @231 sits in the matching gap `409[230..231]`); `216[102..106]` and `216[194..198]`
are runtime-only slots (far pointers, status), zero in all 64 shipped records.

**Bounded negative on expansion.** Searched every immediate equal to 216 and 409 in DoK
`GAME.OVR`: `mov ax,0xd8` occurs **21x** vs `mov ax,0x199` **4x**; CoK inverts this exactly
(`0x199` 15x, `0xd8` 4x). All four DoK 409-sites are inside the import routine above. The
combatant allocator and its chain link, verified at `0x0E9F`:

```
000e9f  b8 d8 00              mov ax, 0xd8              ; 216
000ea2  50                    push ax
000ea3  9a 3f 02 07 0a        lcall 0xa07, 0x23f
000eb4  c4 7e f8              les di, [bp-8]
000eb7  26 89 85 b9 00        mov es:[di+0xb9], ax      ; next-link
000ebc  26 89 95 bb 00        mov es:[di+0xbb], dx
```

CoK's positional twin at `0x0FD9` is byte-for-byte the same instruction stream with `0x199`
and `+0x17F/+0x181`. And the link `0x0E9F` writes is exactly the one `calc_battle_exp` walks,
verified at `0x4E26`:

```
004e26  c4 7e fc              les di, [bp-4]
004e29  26 8b 85 b9 00        mov ax, es:[di+0xb9]
004e2e  26 8b 95 bb 00        mov dx, es:[di+0xbb]
004e33  89 46 fc / 89 56 fe   mov [bp-4],ax / mov [bp-2],dx
004e39  e9 21 fe              jmp 0x4c5d                ; loop head
```

## 7. Method 4 — corpus cross-check, and the direct falsification of hypothesis (b)

A wildcarded 27-byte template of the CoK core, scanned across **133 held DOS Gold Box
binaries totalling 134,671,488 bytes**, matched exactly 4 distinct routines and **zero false
positives in 134 MB**:

| title | core at | rolled HP | flat XP | mult | record |
| --- | --- | --- | --- | --- | --- |
| Champions of Krynn | 0x6421 | 0x11B | 0x130 | 0x132 | 409 |
| Death Knights of Krynn | 0x4D01 | 0x06C | 0x06D | 0x06F | 216 |
| Curse of the Azure Bonds | 0x5D91 | 0x12C | 0x13C | 0x13E | 422 |
| Gateway to the Savage Frontier | 0x6C8A | 0x12C | 0x13C | 0x13E | 422 |

Gateway `MON3CHA` GHOUL at `0x13C..0x13E` reads `41 00 02` = 65 / +2 — **byte-identical to
CoK's and DoK's GHOUL, in a third title**.

**Hypothesis (b) falsified directly from the data.** Grouping the 64 DoK records by `hd@48`,
**11 of 15 distinct hit-dice values carry more than one `(flat, mult)` pair**. `hd = 12` alone
carries ten distinct pairs: (1250,15) (1300,16) (1400,16) (1500,16) (2000,16) (2150,16)
(3500,18) (4000,14) (4500,0) (5000,0). No function of hit dice can produce that. The identical
test on the CoK oracle — where the field is byte-located by disassembly — fails the same way
(`hd = 5` → seven distinct pairs), so the failure is a property of the game design, not of the
decode. The **null here is the hypothesis's own prediction** (every bucket must contain exactly
one pair), and the data misses it by a mile.

**The only hit-dice-driven XP arithmetic anywhere in either routine** is the duel shortcut,
`hitDice x 100`, gated on a global — DoK `0x4C2C` (`mov al, es:[di+0x30]; cbw; mov dx,0x64;
mul dx`, gated on `[0xDB64]`) and CoK `0x6346` (`es:[di+0xd6]`, gated on `[0x883E]`). CoK has
it too, so it is not a DoK-specific compensation for a missing field.

## 8. Data confirmation — all 64 records (VERIFIED in this pass)

Decoded with `tools/dax_decode.py` (`parse_container` + `decompress_block`): 64 blocks, all
exactly 216 bytes.

```
 22 GHOUL           hp40= 12 hd= 2  b108= 12  flat=    65  mult= 2   team=1
 23 GHAST           hp40= 18 hd= 4  b108= 18  flat=   190  mult= 4   team=1
 44 UNDEAD RAT      hp40= 18 hd= 4  b108= 18  flat=    60  mult= 4   team=1
 17 WIGHT           hp40= 21 hd= 4  b108= 21  flat=   540  mult= 5   team=1
 16 WRAITH          hp40= 28 hd= 5  b108= 28  flat=   575  mult= 6   team=1
 18 SPECTRE         hp40= 35 hd= 7  b108= 35  flat=  1650  mult=10   team=1
 19 VAMPIRE         hp40= 39 hd= 8  b108= 39  flat=  3800  mult=12   team=1
 33 SIVAK           hp40= 27 hd= 6  b108= 27  flat=  2000  mult= 0   team=1
 14 LICH            hp40= 81 hd=18  b108= 81  flat= 10500  mult=14   team=1
 30 IRON GOLEM      hp40= 80 hd=18  b108= 80  flat= 14550  mult= 0   team=1
  4 DEATH DRAGON    hp40=120 hd=15  b108=120  flat=  9000  mult= 0   team=1
 42 SKOMP           hp40= 81 hd=12  b108= 61  flat=  1300  mult=16   team=0   <-- see below
 48 SIR DRYDEN      hp40=134 hd=14  b108=134  flat=  4000  mult=14   team=0
 64 SOLAMNIC KNIGHT hp40= 70 hd=12  b108= 70  flat=  1250  mult=15   team=0
 65 SOLAMNIC KNIGHT hp40= 70 hd=12  b108= 70  flat=  1250  mult=15   team=1
```

Range: flat 60..14550, nonzero on **64/64**; mult 0..25, nonzero on 51/64.

**Cross-title agreement is 2 of 7, and that must be stated plainly** — the method agents cited
only the two that matched. Of the 7 names shared between DoK `MON1CHA` and CoK `MON*CHA`:

| monster | CoK (flat, mult) | DoK (flat, mult) | |
| --- | --- | --- | --- |
| GHOUL | 65, 2 | 65, 2 | **exact** |
| GHAST | 190, 4 | 190, 4 | **exact** |
| BLACK DRAGON | 825, 10 | 1500, 10 | rebalanced |
| BLUE DRAGON | 2850, 16 | 3000, 15 | rebalanced |
| RED DRAGON | 1950, 16 / 4250, 20 | 3000, 15 | rebalanced |
| SPECTRAL MINION | 900, 14 | 1400, 0 | rebalanced |
| SIVAK | 350, 6 | 2000, 0 | rebalanced |

**Use GHOUL and GHAST as anchors. Do not use the other five.**

### Semantic corroboration the disassembly did not need

- **`+0x6C` is the live HP slot, not a static mirror.** VERIFIED: the six retail
  `SAVE/CHRDATA{1..6}.GAM` are each **216 bytes** and every one has `b108 < hp@40`
  (SIR DRYDEN 74/95, LILLITH 70/102, TANAR 59/78, FLAVIUS 46/52, NEACAIL 51/58,
  CELESTE 41/53) — current below maximum. In `MON1CHA` the shipped default equals `hp@40`
  on **63/64** records; the sole exception is SKOMP (61 vs 81), which is now explained in kind
  rather than anomalous. **This retires the `monster.ts` note calling byte 108 "a ruled-out
  impostor … a different, unidentified field": it is CoK `+0x11B`'s analogue.**
- **PCs award no kill XP.** All six `.GAM` records read `xp@109 = 0`, `mult@111 = 0`,
  `team@201 = 0`. Monsters show the mirror-image pattern.
- **The `+0xC9` team gate is semantically exact.** `0x4C7C`
  `26 80 bd c9 00 01  cmp byte es:[di+0xc9], 1` — and MON1CHA byte 201 is 1 on 57 records and
  0 on exactly 7: SKOMP, SIR DRYDEN, TANAR, FLAVIUS, SOLAMNIC KNIGHT (id 64), DURFEY, IGORF.
  Designer control: `SOLAMNIC KNIGHT` ships as a **duplicate pair** — id 64 with `201 = 0` and
  id 65 with `201 = 1`, identical hp/hd/XP — and `DURFEY (0)` / `UNDEAD DURFEY (1)` likewise.
  **Null:** offset 201 is the only column of 216 reproducing that partition; under a
  random-7-of-64 null the exact set has p = 1/C(64,7) = 1.6e-9.
- **Runtime displacement == static record offset.** Independently confirmed on morale, a field
  located by an unrelated method: DoK `cmp byte es:[reg+0x3e], 0x7f` occurs **17x** and
  `+0xE7` **0x**; CoK `cmp byte es:[reg+0xe7], 0x7f` occurs **15x** and `+0x3E` 3x (incidental
  disp8 collisions). DoK morale is record byte 62 = `0x3E`; CoK's is 231 = `0xE7`. Each binary
  uses only its own offset.

## 9. Nulls, gathered

| statistic | real | null |
| --- | --- | --- |
| `f7 e2 99 8b c8 8b da` in DoK `GAME.OVR` | 1 site (0x4D01) | 2 in CoK's 269 KB; single candidate, not a shortlist |
| normalised-instruction run vs CoK 0x6335, swept over all 252,469 DoK offsets | 90 instrs at 0x4C1B | best rival 6; >=10 → 1 site, >=50 → 1 site |
| CoK routine vs all 813 DoK `55 89 e5` prologues | 0.9188 | best rival 0.3236; mean 0.1004, sigma 0.0508 |
| 27-byte wildcard template over 133 binaries / 134.7 MB | 4 routines | 0 false positives |
| u16LE windows where DoK GHOUL == 65 | **1** (offset 109) | 1 of 215; u16BE 0 |
| u16LE windows where GHOUL == 65 **and** GHAST == 190 | **1** (offset 109) | column-permutation null (5000 trials, exact multisets preserved): 0 trials produced even one matching offset |
| ES-disp refs to CoK's 0x11B / 0x130 / 0x132 / 0x188 / 0x18A / 0x17F in DoK | **0 / 0 / 0 / 0 / 0 / 0** | CoK control fires: 20 / 3 / 3 / 111 / 82 / 149 |
| ES-disp8 refs in DoK to 0x6C / 0x6D / 0x6E / 0x6F / 0x70 | 14 / **1** / 0 / **1** / 16 | neighbourhood baseline ~10-16 |
| offsets equal to hp@40 on >= 63/64 records | 3 of 216 (40, 108, 214) | next best 1/64 |
| `hd@48` buckets containing >1 `(flat,mult)` pair | 11 of 15 | hypothesis (b) predicts 0; CoK oracle fails identically |
| Spearman rank of u16LE@109 vs hd@48 | **7 of 101**, rho 0.699 | six above it are the located saves/hd band 41..47 |
| Spearman rank of u8@111 vs hd@48 | **12 of 82**, rho 0.492 | rises to 0.897 only on the 51 nonzero-mult subset |

**The finding does not rest on any of the data-side numbers.** It rests on two independent code
paths (§4, §6). The corpus numbers are confirmation, and the two rank statistics are reported
precisely because they show the field was *unfindable* by the method that had been tried.

**One honest ambiguity, stated rather than buried.** On the data alone the *multiplier* is not
uniquely pinned: offsets `{48, 71, 111}` all satisfy GHOUL = 2 and GHAST = 4, because those
monsters' hit dice happen to equal their multiplier. 48 is the located hit-dice byte and 71 its
partial mirror. **Only the disassembly selects 111.** The u16 flat term at 109 stands on its
own; the multiplier stands on the code.

## 10. Refutation record — including the claims that died

Fifteen candidate claims went through three adversarial refuters each (bytes / alternative /
prediction). **Twelve survived; three were refuted.** The kills are part of the record.

### KILLED — "Nothing in either DoK binary WRITES the XP fields"

The claim asserted `0x6D` and `0x6F` are referenced exactly once each in `GAME.OVR`, both
reads, therefore pure file data. **The reference counts are correct** — this pass reproduced
them (1 site each, both in `calc_battle_exp`) — **but the inference and its corroboration are
both broken:**

- **There IS a write**, at `0x12DBA`, and the claim's search method was structurally incapable
  of seeing it: the import path writes `+0x6D..0x6F` via a **block copy through a pointer**
  (`add di, 0x6d` then a `movmem` call), which emits no displacement constant a ModRM scan can
  match. §6 is that write.
- **The CoK corroboration offered was false.** The claim stated CoK's `+0x130`/`+0x132` "appear
  only twice each … reads only". VERIFIED here: **three** sites each, and the third is a
  **store** — CoK has an ECL get/set-field-by-selector dispatcher:
  ```
  009711  3d f7 00              cmp ax, 0xf7
  00971d  26 89 85 30 01        mov word ptr es:[di+0x130], ax    ; WRITE
  009725  3d f9 00              cmp ax, 0xf9
  009731  26 88 85 32 01        mov byte ptr es:[di+0x132], al    ; WRITE
  ```
  with the matching getter at `0x943B`/`0x944F`. So on the claim's own oracle, "no write" is
  neither true nor a valid discriminator for "file data".
- **The instrument was demonstrably blind**, proven on the sibling field: `+0x6C`, read by a
  byte-identical instruction two instructions earlier, is written in at least 8 places using
  opcodes absent from the claim's search set (`26 28 45 6c sub` at `0x19E45`/`0x27024`,
  `26 00 45 6c add` at `0x26FC5`/`0x2C0FE`). A test returning the same verdict for a written
  and an unwritten field cannot settle (a) vs (b).
- **The stated null was wrong.** "A typical displacement occurs ~10-14 times" — measured, 19%
  of disp8 values occur <= 1 time in that opcode subset, so "occurs exactly once" is an
  unremarkable 19th-percentile event.

**Conclusion unchanged, evidence replaced.** Hypothesis (a) holds — but on §6 and §7, not on
"nothing writes it".

### KILLED — "instruction-for-instruction isomorph, differing only in struct displacements and DGROUP addresses"

True at the mnemonic level for the first 90 instructions, **false as a global statement**, and
dangerous to port on. DoK decodes to **262 instructions vs CoK's 280**, and the -18 accounts
exactly:

- **DoK drops four of CoK's seven money→XP terms.** CoK `0x655C..0x65AD` converts seven
  accumulators (/100, /20, /10 via helper `0xA2F`; one unscaled; then x2, x250, x2200 via
  helper `0xA14`). DoK `0x4E3C..0x4E80` has only the last three (x2, x250, x2200). **-25
  instructions.**
- **Root cause is a loop-start immediate, not a displacement:** DoK `0x4CB7` `c6 46 fb 04`
  (`mov byte [bp-5], 4`) vs CoK `0x63D4` `c6 46 fb 00`. Both exit on `cmp byte [bp-5], 6`, so
  CoK pools 7 money slots and DoK 3.
- **Two fixed word reads become runtime-indexed byte reads:** CoK `0x6442`
  `les di,[0x4b2c]; cmp WORD es:[di+0x5c6],1` (2 instrs) vs DoK `0x4D21`
  `mov ax,[0x852]; add ax,0x7c00; les di,[0x8c31]; add di,ax; cmp BYTE es:[di-0x7c00],1`
  (5 instrs). Same again at the party-count read (CoK `0x664F` word; DoK `0x4EEC` byte +
  `xor ah,ah`). **+7.**
- **Sign handling differs:** CoK `0x6656` `31 d2 xor dx,dx` vs DoK `0x4EF5` `99 cwd`.

-25 + 7 = -18. Exact. **Anyone porting the treasure→XP conversion on the strength of "only
displacements differ" would get it wrong.**

### KILLED — "the static record loaded verbatim … there is NO 216→409 expansion" (as worded)

The **size** half is right and is better supported than the claim argued (§6). The wording is
wrong twice: offsets are *renumbered* between the two layouts, not "verbatim"; and a
409↔216 field correspondence **does exist in DoK's own code** — it simply runs the other way,
409 → 216, on the import path. The claim's verdict would have closed the only line of enquiry
that produced the decisive artifact.

### Surviving claims with caveats attached

- **"+0x37 is the money array base"** — imprecise. `0x37` is a folded displacement; the loop
  runs `i = 4..6`, so the bytes actually read are `+0x3F/+0x41/+0x43` (record 63/65/67, zero in
  all 64 shipped records). Notional slot 3 would straddle morale @62; no executed instruction
  touches it.
- **"divided by 2, 250 and 2200"** — the operation is **multiplication**, not division. Two
  distinct helpers exist at the same in-segment offsets in both games: `0xA2F` is the divider
  (it is what the final `total / (party - animated)` uses at DoK `0x4F00`), and the 2/250/2200
  terms call the *other* entry, `0xA14`. 250 gp/gem and 2200 gp/jewelry are the standard Gold
  Box treasure valuations, so `0xA14` multiplies.
- **"item plus +0x32 x 400"** — correct, but it is an **item-record** offset, not a combatant
  offset; CoK uses `+0x32` too. It must not be listed in a MON1CHA field map.
- **"the seven `team=0` records are precisely DoK's joinable NPC allies"** — 3 of 7 are
  byte-attested (SIR DRYDEN, TANAR, FLAVIUS appear in the retail `SAVE/` roster). The other
  four rest on outside game knowledge; DoK's ECL text is encoded and contains none of these
  names. What the bytes prove is an **include-in-XP-award gate requiring `== 1`**. Soften
  "precisely … joinable NPC allies" to "seven records the engine places on the party side by
  default".
- **"`+0xC9` is an immutable property"** — no. `GAME.OVR` writes `+0xC9` at 9 sites
  (`0x7710`, `0x7732`, `0x1D9FF` store immediates; `0x1BFA5`, `0x1C01B`, `0x1D9B4`, `0x1E26D`,
  `0x1E299` store `al`), and at `0x1BF9B` the stored value is `ax >> 6`, a 2-bit field. MON1CHA
  byte 201 is the **initial** side, not an invariant.

## 11. Verdict

**VERIFIED**

- DoK `calc_battle_exp` is `GAME.OVR 0x4C1B..0x4F14`; its XP core is `0x4CED..0x4D20`.
- It reads combatant `+0x6C` (u8), `+0x6F` (u8), `+0x6D` (u16 LE) and accumulates
  `total += mult * hp; total += flat` in 32 bits, gated on `+0xC9 == 1` and `+0xC7` not in
  `{0, 3}`.
- DoK's runtime combatant record is **216 bytes**, allocated at `0x0E9F`, chained at
  `+0xB9/+0xBB`. No displacement in the routine exceeds `0xC9` = 201.
- Runtime displacement == static MON1CHA offset (morale, hit dice, hp all confirm).
- **MON1CHA 109..110 = flat kill XP (u16 LE); 111 = per-hit-point multiplier (u8);
  108 = current/rolled HP.**
- DoK's own import table at `0x12D0E..0x12E0E` independently asserts
  `409[0x130..0x132] ↔ 216[0x6D..0x6F]`, reproducing five anchors it was never fitted to.
- Hypothesis **(a)** confirmed; hypothesis **(b)** falsified by 11 of 15 hd buckets carrying
  multiple `(flat, mult)` pairs.

**INFERRED**

- The 216-byte MON1CHA record is copied into the runtime combatant slot at offset identity.
  Strongly supported (size identity, every displacement < 216, the morale/hd/hp anchors, the
  import table, stale far-pointer values with plausible DOS segments at 125/127) but the
  specific MON1CHA→combatant copy call site was **never disassembled**.
- The label "rolled HP" for `+0x6C` is inherited from the CoK writeup. Mechanically it is the
  **current/live HP** field (mutated by damage, healing, level drain and restore-from-`+0x28`).

**OPEN**

- `displayCombatResults` in DoK is unlocated; the DGROUP base for `START.EXE`'s strings was
  not recovered (§5).
- The three money globals at `0xBE58 / 0xBE5C / 0xBE60` are not individually mapped to
  platinum / gems / jewelry — the same gap CoK's writeup carries at its `0x6555`.
- The whole result is **static**. No emulator was run, per the brief. A single DOSBox-X memory
  read at combat-end would convert the largest INFERRED item to VERIFIED.
- SKOMP's shipped `b108 = 61` against `hp@40 = b214 = 81` is explained *in kind* (108 is a
  mutable slot) but nothing was traced that wrote it.
- Pools of Darkness, Treasures of the Savage Frontier and Secret of the Silver Blades did not
  match even the relaxed template — different codegen for the same routine — so their
  510/510/439-byte records contributed no ground truth. Anchor-sweeping Treasures' GHOUL for
  `u16LE == 65` returned **zero** offsets over all 509 windows; whether Treasures rebalanced
  GHOUL or uses a non-u16 field was **not settled**.

## 12. Next step (concrete)

**Extract the full DoK↔CoK record field map from the import table at `GAME.OVR 0x12CB4..0x12E12`
and use it as a byte-level oracle to re-derive every 216-byte field, then commit it as a test.**

The ten copy runs cover **207 of the 216 bytes**, and each one asserts a correspondence with
CoK's 409-byte layout — which this project has already mapped in far more detail. That makes
the table a free, complete, SSI-authored translation key: every remaining uncertainty in
`monster.ts`'s DoK layout can be resolved by reading across it rather than by another
correlation sweep. Concretely:

1. Parse the table mechanically (the extractor used in §6 is ~20 lines: match
   `c4 be 10 fc [81 c7 imm16] 06 57 c4 7e 0a [81 c7 imm16] 06 57 b8 imm16 50 9a b1 1a 07 0a`).
2. Cross-apply the known CoK 409-byte field map to produce a derived DoK 216-byte map.
3. Diff that against `packages/engine/src/loaders/monster.ts`'s `DOK_LAYOUT`. Any disagreement
   is either a loader bug or an unlocated field — both worth knowing.
   *(Integration note, 2026-08-19: this section originally claimed one such disagreement was
   "already visible" — that `DOK_LAYOUT` maps `iconSize`/`coabSourceSize` to 108. That is a
   misreading and was NOT adopted: `DOK_LAYOUT` maps both to **41**, which is the offset this
   note itself says the icon encoding lives at, so loader and note already agree. 108 was never
   claimed as the icon byte by anything. The rest of the recommendation stands, and the diff is
   still worth running — it just has no known disagreement to start from.)*
4. Add the table to `tools/test_goldbox_corpus.py` as a standing assertion, so a future edit
   that breaks the XP offsets goes red. Per the project's standing rule, update the thing that
   *checks* the claim in the same commit that records it.

Also worth the small effort, and cheap: the **four gaps** the table does not copy —
`216[61..62]`, `216[102..106]`, `216[194..198]`, and the `216[0xD8]` tail — are exactly the
fields DoK does *not* inherit from a CoK character. Morale sitting in that set is a real design
fact and should be recorded in the port notes.

## 13. Corrections this note implies for other files

*(Listed for the integrating agent; nothing outside this note was edited.)*

- `packages/engine/src/loaders/monster.ts`: "XP: UNLOCATED" closes; byte 108 is not an
  "impostor"; the claim that an exact anchor sweep produced "ZERO hits at every one of the 216
  offsets" is **false as written** (GHOUL = 65 hits uniquely at 109 — the sweep required both
  anchors jointly and SIVAK was rebalanced); the note that bytes 96-111 are "populated
  inconsistently … zero for most pure monsters" is false for 108..111 (nonzero on 64/64 at 108
  and 109); the working hypothesis that DoK computes XP from hitDice/hp via a formula or table
  is falsified.
- **Memory note correction:** "DoK `CHRDATA{n}.SAV` = same 409-byte `.CCH` record" is wrong.
  DoK's `SAVE/` contains no `.SAV`. DoK's native character record is `CHRDATA{n}.GAM` at
  **216 bytes** (plus `.WIZ` 220 and `.JNK` 252). The 409-byte `.SAV` is **CoK's**, consumed by
  DoK's importer at `0x12CB4` — which is exactly the shipped `?import=cok` path.
- Engine behaviour delta for the port: **CoK's ECL can read *and write* monster kill XP**
  (selectors `0xF7`/`0xF9`, getter `0x943B`/`0x944F`, setter `0x971D`/`0x9731`). **DoK's ECL
  cannot touch it at all** — zero references outside `calc_battle_exp`.
