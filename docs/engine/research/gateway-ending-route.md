# Gateway to the Savage Frontier — ENDING / late-area natural-combat route: Ascore, `ECL6.DAX#20`, the three tapestry mirrors (2026-08-05)

Companion golden: `packages/engine/test/gatewayEndingRoute.test.ts` (8 tests, all reading the retail
files, all guarded with `describe.skipIf`).

Sibling rounds for the same title: `docs/engine/research/gateway-ecl2-1-yartar-early-route.md`
(early leg) and the town / wilderness legs already recorded in
`tools/goldbox_campaign_matrix.json`.

**Result: the `ending` leg is closed.** The route is a genuine three-stage chained gauntlet whose
terminal flag is written by the per-step `vm_run_1` handler, and *only* after the third stage —
exactly the multi-stage shape the leg spec asked to be proved rather than assumed.

Everything below is either raw retail bytes, output of `tools/find_geo_path.py`, or behaviour
observed by executing the real block through the engine's own `EclVm`. Where something is an
inference it says so. No emulator, DOSBox-X, or native trace was used at any point in this round.

---

## 0. Files, dialect, addressing

| | |
|---|---|
| Script | `ECL6.DAX` block **20**, 7644 bytes |
| Map | `GEO6.DAX` block **20**, 1026 bytes (16x16) |
| Monsters | `MON6CHA.DAX` |
| Retail root | `C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier` |
| Dialect | `ECL_GEN1_SHORT_GATEWAY` — `wordSetOverrides {0x1d:0, 0x22:0, 0x2c:1}`, `headerLen 22`, `vbase 0x7FFE`, `hasMagic`, **no `cellDescAddr` override** (the cell descriptor is read from `[0xC04F]`, unlike Treasures' `[0x002D]`) |
| Addressing | addend `0x8000`; `file_offset = vaddr - 0x8000 + 2` |

Gateway ships `ECL2..ECL6.DAX` / `GEO2..GEO6.DAX` — there is no `ECL1`/`GEO1`.

Header of `ECL6.DAX#20`, in the Gen1 order (magic, `vm_run_1`, `search_location`, `pre_camp_check`,
`camp_interrupted`, `initial_entry`):

```
magic           0x1388
vm_run_1        0x8161
search_location 0x809a
pre_camp_check  0x818d
camp_interrupted 0x81d7
initial_entry   0x8014      (= vbase 0x7FFE + 22, i.e. the byte right after the 22-byte header)
```

`initial_entry` landing on offset 22 matters: it is real boot code, not a `GOTO` trampoline that
would have to be followed before any spawn claim could be made.

---

## 1. Why this is the ENDING leg — evidence, not vibes

Four independent pieces of retail evidence, no two of which depend on each other:

**(a) Block-id topology.** Enumerating every `0x1388`-magic block in `ECL2..ECL6.DAX`:

```
ECL2.DAX  1, 2, 3, 4, 82
ECL3.DAX  5, 6, 7, 9, 14, 15
ECL4.DAX  8, 10, 11, 12, 13
ECL5.DAX  16, 17, 18, 19, 98, 99
ECL6.DAX  20, 21, 27, 28
```

The campaign's **local-map (dungeon/town) areas — the blocks that write `SAVE #1 -> [0x4BE6]`** —
run 1..20 and are laid out in ascending order across the archives.
**20 is the highest of those, and it is alone in the last archive with the endgame blocks.**
(Precision added 2026-08-05 after review: 21 *is* also explorable — it is this game's already-proven
`wilderness` leg — so the accurate statement is "highest-numbered local map", not "highest-numbered
explorable area". 21 is the
river/overland travel block — `"YOU SHOVE OFF FROM THE DOCK AND PREPARE TO SET OUT ON THE RIVER."`;
98/99 are the developer JUMPER debug pair, see the REJECTED table.)

**(b) The quest gate that sends you here.** `ECL3.DAX#14` @0x8F3A:

> `YOU HAVE ALL THE STATUETTES! NOW YOU MUST HURRY TO ASCORE. FIND THE ANCIENT PLAZA OF THE PYRAMIDS AND SET THEM ON THE ALTAR AT ITS CENTER. LEAVE NOW, FOR EVERY MOMENT COUNTS!`

Ascore is the *final* destination the campaign names.

**(c) Block 20 is the doorway into the endgame, and the endgame's only way back.**
`ECL6.DAX#20` descriptor 107 (cell `(12,15)`) dispatches to `0x89EE`:

```
0x89ee  03 01 4d c0 00 01     COMPARE [0xc04d], #1        ; facing east
0x89f4  17                    IF_NE
0x89f5  00                    EXIT
0x89f6  09 00 03 01 4b c0     SAVE #3,  [0xc04b]
0x89fc  09 00 0f 01 4c c0     SAVE #15, [0xc04c]
0x8a02  20 00 1b              NEWECL #27
```

and `ECL6.DAX#27` — Vaalgamon's endless-combat maze,
`'WHAT YOU ARE ABOUT TO FACE IS DIFFERENT FROM ANY BATTLE YOU HAVE EVER FOUGHT! THERE WILL BE NO REST
BETWEEN EACH COMBAT!'` — returns to block 20 via its own `NEWECL #20`. Block 20's own boot has a
dedicated re-entry arm for that case (`COMPARE [0x4BF2],#27 IF_EQ GOTO 0x8071` → spawn at `(11,15)`
facing west). `ECL6.DAX#28` is the finale cinematic (Vaalgamon dragged under the soil of Ascore).

**(d) The block's own fiction.** `ECL6.DAX#20` @0x894F:

> `A STONE FACE CARVED IN THE WALL HERE COMES TO LIFE AS YOU PASS THROUGH THE SECRET DOOR. 'WELCOME TO CENTRAL ASCORE!' IT SAYS, PLEASANTLY. 'PLEASE CONSULT THE TAPESTRIES OPPOSITE EACH WALL FOR DETAILED MAPS.`

and @0x9668:

> `AMONG THE MAGE'S EFFECTS YOU FIND A HANDWRITTEN NOTE: 'HAVE YOU BROKEN THE MIRRORS' SPELL YET? WE HAVE NO TIME TO DEAL WITH THE CONSTANT ATTACKS OF THESE PETTY UNDEAD WOULD-BE MASTERS OF ASCORE. FINISH NOW! V.'`

"the tapestries opposite each wall" *is* this route, and 'V.' is Vaalgamon.

---

## 2. Spawn — grounded in the block's own `initial_entry` SAVEs

Not `chooseStart`. The cold-boot path, byte for byte:

```
0x8014  09 00 63 01 c6 7e        SAVE #99, [0x7ec6]
0x801a  09 00 00 01 fb 4b        SAVE #0,  [0x4bfb]
0x8020  09 00 00 01 00 4c        SAVE #0,  [0x4c00]
0x8026  09 00 0d 01 fe 4b        SAVE #13, [0x4bfe]
0x802c  02 01 fa 81              GOSUB 0x81fa                 ; -> SAVE #8 -> [0x4bfd]
0x8030  09 00 01 01 e6 4b        SAVE #1,  [0x4be6]           ; local/tactical map, not overland
0x8036  21 00 14 00 02 00 ff     LOAD_FILES  #20, #2, #255    ; GEO block id 20
0x803d  37 00 05 00 1e 00 1e     LOAD_PIECES #5, #30, #30
0x8044  03 01 f2 4b 00 14        COMPARE [0x4bf2], #20        ; re-entry from itself
0x804a  16 / 0x804b 01 01 88 80  IF_EQ ; GOTO 0x8088
0x804f  03 01 f2 4b 00 1b        COMPARE [0x4bf2], #27        ; return from the endgame maze
0x8055  16 / 0x8056 01 01 71 80  IF_EQ ; GOTO 0x8071
0x805a  09 00 07 01 4c c0        SAVE #7, [0xc04c]            ; Y = 7
0x8060  09 00 00 01 4b c0        SAVE #0, [0xc04b]            ; X = 0
0x8066  09 00 01 01 4d c0        SAVE #1, [0xc04d]            ; facing 1 = EAST
0x806c  2d 01 10 2e              CALL [0x2e10]
0x8070  00                       EXIT
```

**Cold spawn = `(0, 7)` facing east.** `GEO6.DAX#20` cell `(0,7)` has floor byte `0x01` — a plain
walkable corridor cell, consistent with a spawn.

The two `[0x4BF2]` (`LastEclBlockId`) guards both fail on a cold campaign. That is provable, not
assumed: a corpus-wide census (§6 method) finds **exactly two ECL writers of `[0x4BF2]` in all of
`ECL2..ECL6.DAX`** — `ECL5.DAX#99 @0x8014 SAVE #0` and `ECL5.DAX#98 @0x801C SAVE #1` — and both
belong to the developer JUMPER debug pair (REJECTED table, row 1). Nothing in normal play writes it
from ECL; the retail value comes from the native `NEWECL` handler, which the engine harness does not
model. So on a cold boot `[0x4BF2] = 0`, both compares fail, and control reaches `0x805A`.

Test **A** runs the real block from `entry: 22` and asserts every one of these stores.

---

## 3. Per-step dispatch

`search_location @0x809a`:

```
0x809a  09 01 02 4c 01 01 4c        SAVE [0x4c02], [0x4c01]      ; remember previous descriptor
0x80a1  2f 00 7f 01 4f c0 01 02 4c  AND #127, [0xc04f], [0x4c02] ; mask is &0x7F, from the script
0x80aa  02 01 ad 9c                 GOSUB 0x9cad                 ; secret-door detection sub
0x80ae  03 01 02 4c 00 6b           COMPARE [0x4c02], #107
0x80b4  1b / 0x80b5 01 01 13 81     IF_GE ; GOTO 0x8113
0x80b9  25 ...                      ON_GOTO [0x4c02], #28, [...] ; descriptors 0..27
0x8113  05 00 6b 01 02 4c 01 79 7f  SUBTRACT #107, [0x4c02], [0x7f79]   ; = [0x4c02] - 107
0x811c  25 ...                      ON_GOTO [0x7f79], #21, [...]        ; descriptors 107..127
```

Second table, index = descriptor − 107:

```
idx  0  0x89ee   (desc 107, NEWECL #27)
idx  1..9        0x8a05  (bare EXIT)
idx 10  0x8a06   (desc 117)
idx 11  0x8bbd   idx 12  0x8c4a   idx 13  0x8ec3   idx 14  0x9032   idx 15  0x93c2
idx 16  0x977b   (desc 123 — MIRROR 1)
idx 17  0x9799   (desc 124 — MIRROR 2)
idx 18  0x97b7   (desc 125 — MIRROR 3)
idx 19  0x9b9e   (desc 126)
idx 20  0x83a3   (desc 127 — the forced undead checkpoint)
```

`vm_run_1 @0x8161` — this runs **before** `SearchLocation` on every walk step (documented in
`packages/engine/src/world/dungeonEvents.ts`; the golden follows that order):

```
0x8161  2f 00 7f 01 4f c0 01 02 4c  AND #127, [0xc04f], [0x4c02]
0x816a  03 01 d5 7e 00 00           COMPARE [0x7ed5], #0
0x8170  17 / 0x8171 01 01 99 8e     IF_NE ; GOTO 0x8e99
0x8175  02 01 01 85                 GOSUB 0x8501    ; the BASH/PICK/KNOCK door menu, only if [0x4c02]==8
0x8179  02 01 d2 9a                 GOSUB 0x9ad2    ; <-- the mirrors' terminal payoff
0x817d  02 01 fa 81                 GOSUB 0x81fa
0x8181  00                          EXIT
```

---

## 4. Target descriptors and GEO cells

From `GEO6.DAX#20`'s descriptor plane (`raw[514:770]`, index `y*16 + x`), masked with the script's
own `&0x7F`:

| descriptor | raw byte | cells | role |
|---|---|---|---|
| 123 | `0xFB` | `(4,9)`, `(5,9)` | mirror wall 1 |
| 124 | `0xFC` | `(4,6)`, `(5,6)` | mirror wall 2 |
| 125 | `0xFD` | `(6,7)`, `(6,8)` | mirror wall 3 |
| 4 | `0x84` | `(3,7) (4,7) (5,7) (6,6) (3,8) (4,8) (5,8) (6,9)` | chamber interior, bare `EXIT` @0x84A4 |
| 27 | `0x9B` | `(3,6)`, `(3,9)` | the "WELCOME TO CENTRAL ASCORE" stone face, behind a **flag-2** secret door |
| 127 | `0x7F` | `(7,10)` | forced undead checkpoint on the legal approach |
| 107 | `0xEB` | `(12,15)` | `NEWECL #27` into the endgame maze |
| 1 | `0x01` | many, incl. `(0,7)` | 5%-chance wandering ambush (§9) |

Note the top bit is set on most of these raw bytes; the script's `AND #127` is what makes 251 -> 123.
The golden derives all of this from the GEO bytes with that same mask rather than hardcoding it
(test **B**).

Each mirror is a wall, so each occupies the **two** floor cells that face it. The consumed bit is
keyed to the descriptor, not the cell — proved in test **F** by revisiting the twin cell the walk
never entered.

---

## 5. Reachability over the real wall/door graph

`tools/find_geo_path.py`, real `GEO6.DAX`, real wall planes and door flags:

```
python tools/find_geo_path.py --geo GEO6.DAX --block 20 \
  --start 0,7 --target 5,9 --facing east --event-mask 127 --avoid-event-index 27
```

> `step_count 27`, `final_facing west`, `blocked_cell_count 2`, **`required_interactions []`**
>
> `east south east south south west west south south south south east east north north east south east east east east north north north north west west`

Only two non-plain edges on the whole 27-step walk, and both are **door flag 1 =
`automatic-door`**, i.e. they open by walking into them:

```
(7,10) -> (7,9)  north  wall_slot 2  door_flag 1  automatic-door
(7,9)  -> (6,9)  west   wall_slot 3  door_flag 1  automatic-door
```

**Why `--avoid-event-index 27` is the honest choice, not a convenience.** Without it the tool finds
a 9-step path, but it goes through cell `(3,6)` and needs

```
(2,6) -> (3,6)  east  wall_slot 2  door_flag 2  locked-door:bash-or-pick-or-knock
```

— a required BASH/PICK/KNOCK interaction (the very menu `vm_run_1`'s `GOSUB 0x8501` puts up), which
this leg deliberately does not lean on. Blocking the two descriptor-27 cells forces the long way
around, and that long way passes through `(7,10)` — so **the descriptor-127 undead checkpoint is a
genuinely forced fight on any flag-0/1-only route into the chamber**, not an optional detour.

Continuation legs, same tool, same map, both `required_interactions []`:

```
5,9 -> 5,6   step_count 3   north north north
5,6 -> 6,7   step_count 2   south east
```

---

## 6. Persistence — corpus-wide census, not an assumption

Method: a stack-aware CFG walk from all five header entries of every `0x1388`-magic block in
`ECL2..ECL6.DAX`, decoded with `ECL_GEN1_SHORT_GATEWAY`'s word sets, with compare outcomes
**deliberately not propagated** (inclusive model) so no reachable writer can be pruned by an
unmodelled flag source. Writes are identified by a per-opcode destination-slot map (`SAVE` slot 1 —
Gen1 operand order is `(source, dest)`; `AND`/`OR` slot 2). Scratch script only; nothing was written
into the repo.

```
=== [0x4c45]  WRITERS (4)
    ECL6.DAX#20 @0x97f1 SAVE slot1 bytes=09 00 01 01 45 4c      ; = 1
    ECL6.DAX#20 @0x990f SAVE slot1 bytes=09 00 02 01 45 4c      ; = 2
    ECL6.DAX#20 @0x9a17 SAVE slot1 bytes=09 00 03 01 45 4c      ; = 3
    ECL6.DAX#20 @0x9ada SAVE slot1 bytes=09 00 04 01 45 4c      ; = 4  (terminal)
    READS (4)
    ECL6.DAX#20 @0x97d3 COMPARE  03 01 45 4c 00 01
    ECL6.DAX#20 @0x97de COMPARE  03 01 45 4c 00 02
    ECL6.DAX#20 @0x97e9 COMPARE  03 01 45 4c 00 00
    ECL6.DAX#20 @0x9ad2 COMPARE  03 01 45 4c 00 03

=== [0x4c46]  WRITERS (3)
    ECL6.DAX#20 @0x978c OR slot2  30 01 46 4c 00 01 01 46 4c    ; |= 1
    ECL6.DAX#20 @0x97aa OR slot2  30 01 46 4c 00 02 01 46 4c    ; |= 2
    ECL6.DAX#20 @0x97c8 OR slot2  30 01 46 4c 00 04 01 46 4c    ; |= 4
    READS (6)  — the three AND probes and the three OR sources, all in #20
```

**Every writer and every reader of both words lives in `ECL6.DAX#20`.** No other block in the game
can set, clear, or observe them, so the golden's memory assertions are complete rather than
representative.

The **same-word-different-bit** trap the leg spec warns about is present and is exactly the point:
`[0x4C46]` is one word carrying three independent per-wall bits, OR'd at three different sites. Test
**G** proves the bits are independent in both directions (bit 1 set alone still lets 124 and 125
fire; bit 4 set alone still lets 123 fire).

The **eager-write** trap is also present: both the `[0x4C46]` bit and the `[0x4C45]` counter are
written *before* that stage's `COMBAT`. The golden therefore asserts them at the combat pause and
again after `afterCombat('victory')`, rather than assuming a post-victory write.

---

## 7. The encounter — byte-exact

### 7.1 The three arms are structurally identical

```
0x977b  2f 01 46 4c 00 01 01 79 7f   AND [0x4c46], #1, [0x7f79]
0x9784  03 01 79 7f 00 01            COMPARE [0x7f79], #1
0x978a  16                           IF_EQ
0x978b  00                           EXIT                       ; already consumed -> silent
0x978c  30 01 46 4c 00 01 01 46 4c   OR [0x4c46], #1, [0x4c46]
0x9795  01 01 d3 97                  GOTO 0x97d3
```

`0x9799` is the same with bit **2**, `0x97B7` the same with bit **4**. (Minor curiosity, harmless:
arm 3 has no `GOTO` — it falls through a dead `IF_EQ`/`EXIT` pair at `0x97D1`/`0x97D2` whose flag
comes from the already-failed `COMPARE` at `0x97C0`, and lands on `0x97D3` anyway. The engine agrees:
mirror 3 fires.)

### 7.2 The shared stage selector at `0x97D3`

```
0x97d3  COMPARE [0x4c45], #1 ; IF_EQ ; GOTO 0x990f     -> stage 2
0x97de  COMPARE [0x4c45], #2 ; IF_EQ ; GOTO 0x9a17     -> stage 3
0x97e9  COMPARE [0x4c45], #0 ; IF_NE ; EXIT
0x97f1  SAVE #1, [0x4c45]                              -> stage 1
```

**The battle a wall serves is chosen by the counter, not by which wall it is.** Whichever mirror you
touch first gives stage 1. Test **G** pins this explicitly: with `[0x4C45] = 1` pre-set, the 123 wall
serves *stage 2's* roster.

### 7.3 Stage 1 — `0x97F1`

```
0x97f1  09 00 01 01 45 4c        SAVE #1, [0x4c45]
0x97f7  PRINTCLEAR <str:96>  "YOU STAND BY THE WALL, BUT ONLY SHREDS OF THE ANCIENT TAPESTRY NOW
                              HANG FROM THE CEILING. THE MAP IT ONCE CONTAINED HAS ROTTED."
0x985e  PRINTCLEAR <str:40>  "THE WALL ITSELF IS COVERED WITH A TREMENDOUS MIRROR. "
0x9889  PRINT      <str:60>  "SQUINTING, YOU THINK YOU SEE YOUR FACES REFLECTED AS THOSE OF
                              LEERING SKELETONS!"
0x98c8  0e 00 19               PICTURE #25
0x98cf  1c                     CLEARMONSTERS
0x98d0  0c 00 ff 00 01 00 ff   SETUP_MONSTER #255, #1, #255
0x98d7  0b 00 5b 00 02 00 5b   LOAD_MONSTER #91, #2, #91
0x98de  0b 00 5a 00 05 00 5a   LOAD_MONSTER #90, #5, #90
0x98e5  24                     COMBAT
0x98e6  PRINTCLEAR <str:30>  "'LOOK! THE MIRROR! THERE'S A MAP ON IT!'"
0x9907  02 01 2c 97            GOSUB 0x972c            ; journal beat
0x990b  01 01 30 82            GOTO 0x8230
```

### 7.4 Stage 2 — `0x990F`

```
0x990f  09 00 02 01 45 4c        SAVE #2, [0x4c45]
0x9915  PRINTCLEAR <str:45>  "THE TAPESTRY BESIDE THIS WALL, TOO, HAS CRUMBLED INTO DUST. "
0x9945  PRINT      <str:90>  "BEFORE YOU CAN EXAMINE THE BROAD MIRROR, THE SOUND OF BONES RATTLING
                              BEHIND YOU SIGNALS THE BEGINNING OF ANOTHER BATTLE."
0x99a2  PICTURE #25 ; 0x99a9 CLEARMONSTERS ; 0x99aa SETUP_MONSTER #255,#1,#255
0x99b1  0b 00 5b 00 03 00 5b   LOAD_MONSTER #91, #3, #91
0x99b8  0b 00 5a 00 03 00 5a   LOAD_MONSTER #90, #3, #90
0x99bf  24                     COMBAT
0x99c0  PRINTCLEAR <str:76>  "CLOSE EXAMINATION OF THE MIRROR ON THIS WALL SHOWS THAT IT, TOO,
                              HOLDS THE FAINT REFLECTION OF A MAP."
```

### 7.5 Stage 3 — `0x9A17`

```
0x9a17  09 00 03 01 45 4c        SAVE #3, [0x4c45]
0x9a1d  PRINTCLEAR <str:101> "YOU ARE ON YOUR GUARD AGAINST FURTHER UNDEAD ATTACKS. THE ASCOREAN
                              HOSTS DO NOT DISAPPOINT YOU, CHARGING FEARLESSLY TOWARDS THE PARTY."
0x9a85  PICTURE #25 ; 0x9a8c CLEARMONSTERS ; 0x9a8d SETUP_MONSTER #255,#1,#255
0x9a94  0b 00 5b 00 01 00 5b   LOAD_MONSTER #91, #1, #91
0x9a9b  0b 00 5a 00 05 00 5a   LOAD_MONSTER #90, #5, #90
0x9aa2  24                     COMBAT
0x9aa3  PRINTCLEAR <str:36>  "THIS MIRROR, TOO, HOLDS A FAINT IMAGE OF A MAP."
```

### 7.6 Rosters, cross-referenced to `MON6CHA.DAX`

| stage | roster (`monsterId`, `count`, `picBlockId`) | names from `MON6CHA.DAX` |
|---|---|---|
| 1 | `{91,2,91}`, `{90,5,90}` | 2x `ASCORIAN MUMMY`, 5x `ASCORE SKELETON` |
| 2 | `{91,3,91}`, `{90,3,90}` | 3x `ASCORIAN MUMMY`, 3x `ASCORE SKELETON` |
| 3 | `{91,1,91}`, `{90,5,90}` | 1x `ASCORIAN MUMMY`, 5x `ASCORE SKELETON` |

Three *different* rosters — this is not the same encounter replayed. `SETUP_MONSTER #255,#1,#255`
is identical in all three (sprite 255, maxDistance 1, pic 255): the fights start adjacent, no
approach phase. `MON6CHA.DAX` id 92 is `VAALGAMON`, who is not part of this route — he waits behind
descriptor 107's `NEWECL #27`.

### 7.7 The journal sub `0x972C` — and an engine gap it exposes

```
0x972c  PRINT <str:41>  " YOU COPY THE FADED IMAGE INTO YOUR JOURNAL AS ENTRY #"
0x9758  COMPARE [0x4c02], #123 ; IF_EQ ; 0x975f  11 00 01   PRINT #1
0x9762  COMPARE [0x4c02], #124 ; IF_EQ ; 0x9769  11 00 3a   PRINT #58
0x976c  COMPARE [0x4c02], #125 ; IF_EQ ; 0x9773  11 00 3d   PRINT #61
0x9776  PRINT <str:1>  "."
```

So each wall names a different **Journal Entry: 1, 58, 61** — three distinct map fragments, more
corroboration that the three walls are three distinct scripted beats. The engine's `PRINT`
(`packages/engine/src/ecl/vm.ts`, `case 0x11/0x12/0x33`) only attaches `text` for inline (`0x80`) or
runtime-string (`0x81`) operands, so numeric `PRINT #1` emits a `print` effect carrying a
`stringRef` but no text. See §9.

### 7.8 The terminal payoff — `vm_run_1`'s `GOSUB 0x9AD2`

```
0x9ad2  03 01 45 4c 00 03        COMPARE [0x4c45], #3
0x9ad8  17                       IF_NE
0x9ad9  13                       RETURN                    ; <-- fires only after ALL THREE stages
0x9ada  09 00 04 01 45 4c        SAVE #4, [0x4c45]         ; terminal
0x9ae9  02 01 80 82              GOSUB 0x8280
0x9aed  0a 01 79 7f              LOAD_CHARACTER [0x7f79]
0x9af1  PRINT <str:48>  " STEPS ON A LOOSE STONE AND FALLS INTO A HIDDEN PIT, SUFFERING "
0x9b24  08 00 02 01 7f 7f        RANDOM #2, [0x7f7f]
0x9b2a  04 01 7f 7f 00 02 ...    ADD [0x7f7f], #2, [0x7f7f]
0x9b33  11 01 7f 7f              PRINT [0x7f7f]
0x9b37  PRINT <str:48>  " POINTS OF DAMAGE. YOU SEARCH THE TRAP, AND FIND A BAG OF ITEMS!"
0x9b7a  2e ...                   DAMAGE #1, #129, #1, [0x7f7f], #100
0x9b86  1c                       CLEARMONSTERS
0x9b87  27 00 00 00 00 00 00 02 58 02 00 00 ..   TREASURE ... <c2:0x0258> ... #30
0x9b99  24                       COMBAT                    ; rosterless -> treasure award idiom
0x9b9a  01 01 82 81              GOTO 0x8182
```

**This is the load-bearing multi-stage proof.** The terminal flag `[0x4C45] = 4` is written by the
per-step main-loop handler, guarded on `[0x4C45] == 3`, so it can only fire on the walk step *after*
the third mirror. The golden proves the negative twice — `dialogueForVmRun1` is silent and
`[0x4C45]` is unchanged on the steps following stages 1 and 2 — before proving the positive.

`TREASURE`'s last operand `#30` is the item block id and `<c2:0x0258>` is word 600; the trailing
rosterless `COMBAT` after `CLEARMONSTERS` is Gold Box's standard treasure-award idiom, not a fight.

---

## 8. The forced checkpoint at `(7,10)`, descriptor 127 — `0x83A3`

```
0x83a3  03 01 09 4c 00 01     COMPARE [0x4c09], #1
0x83a9  17 / 0x83aa 01 01 c5 83   IF_NE ; GOTO 0x83c5      ; not yet consumed -> fight
0x83ae  00                    EXIT
0x83c5  PRINTCLEAR <str:28>  "UNDEAD GUARDS COME AROUND THE CORNER."
0x83e4  0e 00 19              PICTURE #25
0x83ed  02 01 4b 9c           GOSUB 0x9c4b                  ; HORIZONTAL_MENU "ATTACK" / "FLEE"
0x83fb  0c 00 ff 01 0d 4c 00 ff   SETUP_MONSTER #255, [0x4c0d], #255
0x8433  0b 00 5a 01 7f 7f 00 5a   LOAD_MONSTER #90, [0x7f7f], #90   ; randomised count
0x8448  0b 00 5b 01 7f 7f 00 5b   LOAD_MONSTER #91, [0x7f7f], #91   ; conditional
0x8450  24                    COMBAT
0x8451  2f 01 4f c0 00 7f 01 02 4c   AND [0xc04f], #127, [0x4c02]
0x845a  03 01 02 4c 00 7f     COMPARE [0x4c02], #127
0x8460  17 / 0x8461 01 01 30 82   IF_NE ; GOTO 0x8230
0x8465  09 00 01 01 09 4c     SAVE #1, [0x4c09]             ; consumed, once
```

The golden walks this for real (test **C**): the ATTACK/FLEE menu is answered with choice 0
(`ATTACK`), the fight resolves, and it is the **only** combat on the 27-step approach.

This checkpoint is *not* the leg's encounter — its rosters are randomised (`LOAD_MONSTER #90,
[0x7F7F]`) and so are unsuitable for a byte-exact roster assertion. It is included because the
reachability analysis says it is unavoidable, and an honest walk cannot pretend it is not there.

---

## 9. Honest boundaries

1. **No native/emulator corroboration.** By assignment constraint this round used static retail
   bytes plus the engine VM only. Nothing here has been observed running in DOSBox-X or on real
   hardware.
2. **Engine `PRINT` models only inline/strref strings.** Numeric operands (`PRINT #1`,
   `PRINT [0x7F7F]`) emit a `print` effect with a `stringRef` but no `text`. So the golden's expected
   strings legitimately read `"... AS ENTRY # ."` and `"... SUFFERING POINTS OF DAMAGE."` — the
   journal number and the damage roll are missing *in the harness*, not in the data. `LOAD_CHARACTER`
   likewise contributes no party-member name. This is an engine modelling gap worth closing
   separately; it does not affect any dispatch, roster, flag or reachability claim.
3. **Per-step VM re-seeding.** Each `dialogueForCell` / `dialogueForVmRun1` call constructs a fresh
   `EclVm` re-seeded with `0x1234`, so the first `RANDOM #100` of every step is 31. On the approach
   this makes the 5% wandering-undead arms deterministic: descriptor 1 (`0x82DE RANDOM #100` then
   `COMPARE ,#5 IF_GE EXIT`) and descriptor 3 (`0x83AF`, same shape) never fire, because 31 >= 5. On
   retail hardware they would occasionally fire on those cells. **None of the mirror-gauntlet arms
   contain a `RANDOM` at all**, so no load-bearing claim depends on the seed — but a walk transcript
   recorded here is not a claim about a specific retail playthrough.
4. **`[0x4BF2]` is not modelled.** The engine harness never sets `LastEclBlockId`, so the two
   re-entry arms at `0x8071` and `0x8088` are documented (disassembled) but not exercised. This is
   the correct behaviour for a *cold* boot and it is what the leg asserts, but a re-entry from the
   endgame maze is unproved here.
5. **Not live-wired in the browser.** The leg is proved at the engine layer with a golden reading
   retail bytes. No `?explore=` route was added and no e2e run was made this round.
6. **The damage/treasure economics are unverified.** `DAMAGE #1,#129,#1,[0x7F7F],#100` and
   `TREASURE ... #30` are asserted structurally (effect emitted, `itemBlockId 30`); what items block
   30 actually contains was not decoded.

---

## 10. Candidates considered and REJECTED

| # | Candidate | Why rejected |
|---|---|---|
| 1 | **`ECL5.DAX#98` / `#99`** — offered as the round's strong lead, being the only two writers of `[0x4BF2]` corpus-wide | Decoding them shows `#99` is the **developer JUMPER debug menu**, not content: `"DO YOU WANT TO START FROM SCRATCH OR USE THE JUMPER?"`, menu `JUMPER`/`START`, `"WHERE DO YOU WISH TO GO?"` with `JUMP/ARENA/CAMP/TREASURE/DEMO/PREV/NEXT`, `TRAINER/STORE/ADD NPC/DROP NPC`, `EXP/SPRITE/BOXPIC/CMD/TEMPLE`, `"WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)"`, `"WHAT DO YOU WANT TO SET CURDISK TO?"`, `"TOO HIGH!!!"`. `#98` is its two-instruction companion (`COMPARE #1,[0x4BF2] ; IF_EQ ; EXIT ; SAVE #1,[0x4BF2]`). Neither is a campaign leg. Useful negative result: it also explains why a cold campaign has `[0x4BF2] = 0` — the real value is written by the native `NEWECL` handler, not by any ECL `SAVE`. |
| 2 | **`ECL6.DAX#28`** — the true finale (`"ONE BY ONE, YOUR PARTY MEMBERS SCRAMBLE FROM THE BUILDING AND ENTER THE PLAZA, SURROUNDED BY GREAT PYRAMIDS..."`, Vaalgamon dragged beneath the soil, the four approaching armies, ending in `NEWECL #1` @0x8E5F) | All five of its header entries except `initial_entry` point at `0x8014`, which is a bare `EXIT` — so `search_location` never dispatches on a cell and no `COMBAT` is reachable from a walk step. It is a linear cinematic, and cannot meet the leg bar (which requires a walked, cell-dispatched encounter). |
| 3 | **`ECL6.DAX#27`** — Vaalgamon's Ascore gauntlet (`"THERE WILL BE NO REST BETWEEN EACH COMBAT!"`) | Also `search_location = 0x8014 = EXIT` (its five header entries are `vm_run_1 = search_location = pre_camp_check = camp_interrupted = 0x8014`, `initial_entry = 0x806A`). It is a facing-driven chained script run from `initial_entry`, not per-cell dispatch — its rosters (ids 8/41/57/80/5/55 and 92 `VAALGAMON`) are reached without any GEO cell. Same failure mode as #28. It does contain the `NEWECL #20` @0x8622 return arm and the `NEWECL #28` @0x8A7F hand-off, both cited as lateness evidence in §1c. |
| 4 | `ECL6.DAX#20` descriptor 121 (arm 14, `0x9032`) — the fire-room two-stage `[0x4C48]` chain | Correct multi-stage shape (`SAVE #1 -> [0x4C48]` @0x90B4, `SAVE #2` @0x9252), but every `LOAD_MONSTER` count is `RANDOM`-derived (`0x919B`, `0x91B2`, `0x9249`, `0x939E`, `0x93B5`), so no byte-exact roster assertion is possible without promoting the harness seed to a load-bearing position. It is also menu-gated (`PUT OUT FIRE` / `SEARCH ROOM` / `REST` / `LEAVE`), so the encounter is not forced by the walk. The mirror chain has fixed counts and no menu, and is strictly better evidence. |
| 5 | The 9-step path `(0,7) -> (5,9)` through cell `(3,6)` | Requires a `door_flag 2` `locked-door:bash-or-pick-or-knock` edge at `(2,6)->(3,6)`. Rejected in favour of the 27-step route with `required_interactions []`. Its rejection is itself load-bearing: it is what proves the `(7,10)` checkpoint is forced. |
| 6 | Masking cell descriptors with `&0x3F` | The script's own mask is `AND #127` at `0x80A1` and `0x8161`. `&0x3F` would fold 123/124/125 onto 59/60/61 and silently pick the wrong arms. |
| 7 | `chooseStart` for the spawn | A heuristic that has been wrong twice on this project. The spawn here is taken from the block's own `initial_entry` SAVEs to `[0xC04B]`/`[0xC04C]`/`[0xC04D]` and asserted by running the block. |
| 8 | Descriptor 107's `NEWECL #27` arm as the leg | It is a transition, not an encounter — no `COMBAT`, and it is additionally gated on facing east (`COMPARE [0xC04D],#1`). It is cited as *evidence for lateness* (§1c), not used as the route. |

---

## 11. Reproduction

```powershell
cd C:\Modding\GoldBox\packages\engine
npx vitest run test/gatewayEndingRoute.test.ts
```

Reachability (read-only; the tool prints JSON to stdout and has no default output file):

```powershell
python tools/find_geo_path.py `
  --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO6.DAX" `
  --block 20 --start 0,7 --target 5,9 --facing east --event-mask 127 --avoid-event-index 27
```

The block-20 disassembly and the `[0x4C45]`/`[0x4C46]` census were produced by throwaway scratch
scripts built on `tools/gen1_ecl_encounter_scan.py`'s decoder and `tools/goldbox_corpus.py`'s DAX
reader; they wrote only into the session scratchpad and left no repo artifacts.
