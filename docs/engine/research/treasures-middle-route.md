# Treasures of the Savage Frontier — MIDDLE leg: `ECL1.DAX#33` / `GEO1.DAX#33`, the underground city of Fireshear

> **Status (2026-08-06): PROVEN.** The party spawns at `(6,15,north)` from block 33's *own*
> `initial_entry` byte literals, walks 36 legal directed steps over the real `GEO1.DAX#33`
> wall/door graph, and reaches the "occupied miner's quarters" encounter (`YETI CHIEF ×3` +
> `ORC CHIEF ×3`) by movement alone — no entry injection, nothing seeded on top of the retail
> boot except the one word that names the incoming area. 22 of the 36 route cells are proven
> **articulation points**: on *any* route from the arrival room to *any* of the six
> descriptor-`0xFF` cubicles the party must traverse every one of them, including the ransacked
> Great Hall of Fireshear at `(3,9)`.
>
> Engine golden: `packages/engine/test/treasuresMiddleRoute.test.ts` (12 cases, all passing, no
> skips with the GOG install present).
> Nothing below was hand-traced: every claim is either a byte read out of the retail file or an
> observation produced by running the real `EclVm` / `DialogueRunner`.
>
> **Revision note (same day, second pass).** An earlier draft of this document claimed the walk's
> persistent delta was two words and that the golden was green. Both were wrong: the golden had two
> failing cases (a mistyped spawn-hex literal, and a delta assertion that omitted the arrival-room
> one-shot `[0x0228]` while its `>= 0x0100` filter silently swept in three harness artifacts). Both
> are fixed, §6 now states the real three-word delta, and every structural claim below
> (descriptors, 36-step route, 22-cell articulation set, component sizes, the `[0x01C0]`/`[0x022D]`
> censuses, the block 27/35 `0x42` frames) was re-derived from the retail bytes in a second,
> independent pass rather than carried over.

Retail bytes used (read-only):

| file | bytes | sha1 |
|---|---|---|
| `ECL1.DAX` | 251,712 (30 blocks) | `264bc2f5cd05da859ebeb1a4ced881a8c59995f6` |
| `GEO1.DAX` | 29,983 (41 blocks) | `b941e79d29a907178935f8843ce5b9d31d39d5b1` |
| `MON1CHA.DAX` | 11,014 | — |

Prior work this leg builds on and does not re-derive: the `early` leg —
`docs/engine/research/treasures-natural-route.md` (PROVEN 2026-07-21) plus
`docs/engine/research/treasures-persistence-promotion-audit-2026-07-31.md`, engine golden
`packages/engine/test/dungeonEvents.test.ts` (`primeSearchLocation — golden Treasures of the
Savage Frontier ECL1 block 34 natural encounter`), browser route `?explore=treasures-natural`.
Leg-status definitions: `tools/goldbox_campaign_matrix.json`; the `middle` precedent is
`docs/engine/research/persistent-natural-routes.md § CoK's Second Route (Middle)`.

`ECL1.DAX#33` = 8,988 bytes. `GEO1.DAX#33` = 1,026 bytes (16×16). Dialect
`ECL_GEN1_SHORT_TREASURES` throughout (`{0x0C:4, 0x1D:0, 0x21:2, 0x22:0, 0x23:0, 0x2C:1}`);
vbase `0x7FFE`, so `offset = vaddr - 0x8000 + 2`.

---

## §1 — Why block 33 is mid-campaign (derived from script flow, not from the manual)

Four independent script-flow facts. (1)–(3) are derivations from retail bytes; only the
chapter *names* are narrative inference.

**1.1 — Entering area 33 from outside the Fireshear cluster happens in exactly one place
corpus-wide, and it is gated on a purchase made in Neverwinter.** (`NEWECL #33` = bytes
`20 00 21` occurs three times in the archive: block 28 `0xA14D`, block 34 `0x81E2` and block 35
`0x9214`. Blocks 34 and 35 are provably *local*: `NEWECL #34` (`20 00 22`) and `NEWECL #35`
(`20 00 23`) each occur **exactly once** corpus-wide, both inside block 33 — `0x84D9` and
`0x9ACE` — so neither can be entered from outside the Fireshear cluster. Block 28 is therefore
the sole outside entrance to the whole 33/34/35 cluster, **by measurement rather than by reading
the guards**. Corrected 2026-08-06: an earlier draft argued this from block 33's own entry
guards testing `[0x0016]` against 34 and 35, which does not by itself prove those blocks are
unreachable from elsewhere.)
Block 28 (Neverwinter) at `0xA14D`:

```
0xa0f5  COMPARE  [0x01c0] #1
0xa0fb  IF_NE
0xa0fc  GOTO     [0xa151]        ; "...YOU PAY YOUR MONEY OVER AT NORTHPIER SHIPPING."
0xa100  PRINTCLEAR "A SEAMAN TAKES YOUR TICKET. YOU CLIMB THE GANGPLANK, AND SOON SET SAIL
                    FOR FIRESHEAR."
0xa144  SAVE     #0  [0x01c0]     ; ticket consumed
0xa14a  PICTURE  #30
0xa14d  NEWECL   #33
```

A raw byte scan for an operand naming `0x01C0` (operand code ∈ {1,2,3}, low `c0`, high `01`)
finds **exactly three** occurrences in the whole 30-block archive, all inside block 28:
`0x9E51` (`SAVE #1 -> [0x01C0]`, the ticket purchase), `0xA0F5` (the gate above), `0xA144`
(the consume). So Fireshear is unreachable until the party has reached Neverwinter *and*
transacted there.

**1.2 — Block 28 is itself deep in the flag graph.** Its CFG-reachable instructions read six
persistent words whose writers are other area blocks: `[0x0129]`←40, `[0x0137]`←20,
`[0x01F8]`←30, `[0x0208]`←31, `[0x0218]`←26/27/31, `[0x04AE]`←40 — **six** distinct writer
blocks {20, 26, 27, 30, 31, 40}. Block 33 therefore sits behind a chapter that is itself behind
at least six others. (Re-derived 2026-08-06 by a CFG walk over all five header entries; the
first pass's `[0x0202]`←30 and `[0x0203]`←32 entries are WITHDRAWN — block 28 references
neither address in any decoded instruction, and `[0x0203]` does not occur in its bytes at all.)

**1.3 — Block 33 is the sole gateway to the already-proven `early` leg's area.** Corpus-wide,
`NEWECL #34` occurs once: block 33 `0x84D9`, at the bottom of the "A WIDE, WELL-BRACED MINE
SHAFT LEADS DOWN INTO THE DARKNESS." / `DESCEND`/`AVOID` menu. Conversely block 34's only
`NEWECL` is `#33` ("A WIDE, WELL-BRACED MINE SHAFT HERE LEADS UP TO THE MAIN LEVEL OF
FIRESHEAR"). The proven early leg hangs off this block.

**1.4 — Block 33's per-cell dispatch is gated on a word whose sole corpus writer is the early
leg's own terminal chain.** Block 33 `0xA188`/`0xA18F` (bytes `03 01 2d 02 00 00 | 13 | 02 01
88 a1 | 17 | 00 | 13`):

```
0xa188  COMPARE  [0x022d] #0
0xa18e  RETURN                    ; leaf: publishes the compare flag to the caller
0xa18f  GOSUB    [0xa188]
0xa193  IF_NE
0xa194  EXIT                      ; [0x022d] != 0  -> abandon this cell's script entirely
0xa195  RETURN
```

A raw byte scan for an operand naming `0x022D` finds **four** occurrences corpus-wide: two
COMPAREs in block 33 (`0x81FC`, `0xA188`) and two in block 34 (`0x8DF9` `SAVE #1 -> [0x022D]`,
`0x8E7F` COMPARE). Block 34's `0x8DF9` — the write the proven early leg already asserts — is
the only writer. §7 shows this gate is *live*, not decorative: the same cell, same seed, fires
a wandering encounter with `[0x022D]==0` and goes silent with `[0x022D]==1`.

**Honest limitation on the word "middle".** Fact 1.4 cuts both ways. The two fixed encounters
this leg walks to (`0xFE`, `0xFF`) require `[0x022D]==0`, i.e. they are available only *before*
the early leg's yeti-chamber victory. In strict chronology, block 33's pre-yeti state therefore
precedes block 34. "Middle" here is a **matrix leg label for a distinct mid-campaign area
traversal**, and the claim being made is 1.1–1.3 (Fireshear is deep in the campaign), *not*
"block 33 comes after block 34". Anyone reading this as a chronological ordering claim is
reading more than the bytes support. The narrative names ("Neverwinter", "Fireshear", chapter
depth) are inference from the block's own printed strings.

---

## §2 — The spawn is byte-grounded in block 33's own `initial_entry`

`initial_entry` = far pointer slot 4 = `0x8014` = byte offset 22 (immediately after the 22-byte
Gen1 header — real code, not a trampoline). The incoming-area guards, bytes at offset 54
(`0x8034`):

```
0x8034  COMPARE  #34 [0x0016]     03 00 22 01 16 00
0x803a  IF_NE                     17
0x803b  GOTO     [0x8051]         01 01 51 80
0x803f  SAVE     #0  [0x001a]     09 00 00 01 1a 00
0x8045  SAVE     #33 [0x0016]     09 00 21 01 16 00
0x804b  LOAD_FILES #33 #12        21 00 21 00 0c
0x8050  SURPRISE                  23
0x8051  COMPARE  #35 [0x0016]     03 00 23 01 16 00
0x8057  IF_EQ                     16
0x8058  GOTO     [0x8072]         01 01 72 80
0x805c  COMPARE  #28 [0x0016]     03 00 1c 01 16 00
0x8062  IF_NE                     17
0x8063  GOTO     [0x815e]         01 01 5e 81
0x8067  COMPARE  [0x0231] #1      03 01 31 02 00 01
0x806d  IF_NE                     17
0x806e  GOTO     [0x8092]         01 01 92 80
```

`[0x0016]` is Treasures' "currently-loaded area id": **29 of the 30** blocks carry the
guard/latch pair — a `COMPARE`-against-`[0x0016]`-with-its-own-id / `IF_EQ` / `EXIT` near
`initial_entry` (operand order varies — block 33 `0x802C` is `COMPARE #33,[0x0016]`, block 16
`0x803E` is `COMPARE [0x0016],#16`) and a later `SAVE #self -> [0x0016]`. The one exception,
block 4, is not an area block — it is the pregen/attract block (`CLEAR_BOX` + six `ADD_NPC`s)
and its only `[0x0016]` write is `SAVE #16 -> [0x0016]` @`0x8048`, handing off to the first real
area. That exception corroborates rather than weakens the reading. (Corrected 2026-08-06: an
earlier draft said "every one of the 30 blocks" and implied a single fixed operand order.) That
read/write shape is the basis for treating a seeded `[0x0016]=28` as "the previously loaded
area was Neverwinter" — an **inference from the corpus-wide pattern**, not from a traced host
write.

The `LOAD_FILES #33 #12` at `0x804B` is itself dialect corroboration: under the *shared* Gen1
short dialect `0x21` takes three operands and would swallow the `0x23` `SURPRISE` byte at
`0x8050`. Under Treasures' own two-operand `0x21` the instruction ends exactly on it.

The default arm — taken on a cold boot **and** on arrival from Neverwinter — is at `0x815E`
(offset 352). Bytes `09 00 00 01 11 00 | 09 00 06 01 34 00 | 09 00 0f 01 35 00 | 09 00 00 01 40 00`:

```
0x815e  SAVE  #0  [0x0011]     ; facing = north
0x8164  SAVE  #6  [0x0034]     ; X = 6
0x816a  SAVE  #15 [0x0035]     ; Y = 15
0x8170  SAVE  #0  [0x0040]
0x8176  SAVE  #33 [0x0016]
0x817c  LOAD_FILES #33 #12     ; 21 00 21 00 0c
0x8181  SURPRISE               ; 23
```

**Running the real `EclVm` from entry 22** (nothing seeded) exits cleanly with
`[0x0034]=6`, `[0x0035]=15`, `[0x0011]=0`, `[0x0016]=33`, and one `loadFiles` effect
`{geoBlockId: 33, operands: [33, 12]}`. Seeding only `[0x0016]=28` first yields the **same**
pose plus the arrival narration:

> "THE PASSAGE FROM NEVERWINTER IS VERY DIFFICULT, THE WEATHER FIERCE, THE SEA ROUGH. THE
> CAPTAIN IS JUST ABLE TO PUT IN SOMEWHAT SOUTH OF THE FIRESHEAR DOCK."
> "UPON LANDING, YOU THANK HIM FOR HIS SKILL, AND MAKE YOUR WAY DOWN INTO THE UNDERGROUND CITY
> OF FIRESHEAR."

The spawn cell corroborates itself: `GEO1.DAX#33` descriptor at `(6,15)` is `0x86`, whose
`search_location` arm prints "DESCENDING A SHORT FLIGHT OF STEPS, YOU ENTER A LOW-CEILINGED
ROOM… THE TWISTED BODIES OF DEAD MINERS". The spawn literal and the map's own arrival text
agree without either being derived from the other.

### 2b — Treasures' register map (needed to read any of the above)

Treasures does **not** use the CoK/DoK `0xC04x` host registers; it uses the same low-address
convention DQK's Gen2 scripts use. Established here by pattern, then confirmed by execution:

| addr | meaning | evidence |
|---|---|---|
| `[0x0034]` | party X | block 20 `COMPARE_AND [0x0034],#12,[0x0035],#13` at `0x805B`; the `[0x02EC]→[0x0034]` restore in blocks 16/20/22/24/25/40 |
| `[0x0035]` | party Y | same |
| `[0x0011]` | facing (0=N,1=E,2=S,3=W) | `[0x02EB]→[0x0011]` restore; block 33 `0x9B84` `COMPARE [0x0011] #3` gates a west-facing-only encounter (§8) |
| `[0x002D]` | cell descriptor | `AND #127,[0x002d],[0x009a]` at `0x83DE` (already in `EclDialect.cellDescAddr`) |
| `[0x0016]` | currently-loaded area id | the 30-block guard/latch pattern above |
| `[0x02EB/EC/ED]` | persisted facing/X/Y | the restore triple |

A census of every `SAVE` destination across all 30 blocks finds **zero** writes to `0xC04B`,
`0xC04C` or `0xC04D`. Note that `primeSearchLocation` still seeds `0xC04D`/`0xC04F`/`0x7F79`
for every Gen1 dialect — those are harness artifacts on this title, which is why the golden
seeds `[0x0011]` explicitly through `seedMemory` and why the post-walk memory delta contains
`0x7F79`/`0xC04D`/`0xC04F` entries that the retail script never reads.

---

## §3 — The dispatch: descriptors located from the GEO bytes with the script's own mask

`search_location` = far pointer slot 1 = `0x83D8` (offset 986). Head bytes
`09 00 02 01 53 00 | 2f 00 7f 01 2d 00 01 9a 00 | 03 01 9a 00 00 22 | 1b | 01 01 5e 84`:

```
0x83d8  SAVE     #2 [0x0053]
0x83de  AND      #127 [0x002d] [0x009a]     ; the mask
0x83e7  COMPARE  [0x009a] #34
0x83ed  IF_GE
0x83ee  GOTO     [0x845e]
0x83f2  ON_GOTO  [0x009a] #34 <34 arms>     ; masked 0..33
0x845e  COMPARE  [0x009a] #90
0x8464  IF_GE
0x8465  GOTO     [0x84dd]
0x8469  SUBTRACT #70 [0x009a] [0x00bf]      ; masked 70..89 -> mine-shaft index 0..19
0x8472  PRINTCLEAR "A WIDE, WELL-BRACED MINE SHAFT LEADS DOWN INTO THE DARKNESS."
0x84a2  HORIZONTAL_MENU [0x00c0] #2 "DESCEND" "AVOID"
0x84c5  GETTABLE [0xa301] [0x00bf] [0x0034] ; landing X in area 34
0x84cf  GETTABLE [0xa30d] [0x00bf] [0x0035] ; landing Y in area 34
0x84d9  NEWECL   #34
0x84dd  SUBTRACT #125 [0x009a] [0x00bf]     ; masked 125/126/127 -> 0/1/2
0x84e6  ON_GOTO  [0x00bf] #3 [0x9b84] [0x9f5d] [0xa073]
```

The three fixed encounters of the area are the top three descriptors:

| raw desc | masked | cells | arm | encounter |
|---|---|---|---|---|
| `0xFD` | 125 | `(1,1) (1,4)` | `0x9B84` | sea-cavern yeti horde → BEHOLDER (§8) |
| `0xFE` | 126 | `(9,13) (11,13) (9,14) (11,14) (9,15) (11,15)` | `0x9F5D` | blocked door: `ICE HOUND ×3`, `ORC CHIEF ×2`, `YETI CHIEF ×1` |
| `0xFF` | 127 | `(13,13) (14,13) (13,14) (14,14) (13,15) (14,15)` | `0xA073` | **occupied miner's quarters: `YETI CHIEF ×3`, `ORC CHIEF ×3`** ← this leg's target |

The `0xFF` arm, bytes at `0xA073` (`02 01 8f a1 | 03 01 30 02 00 00 | 17 | 00`) and `0xA0E3`
(`0b 00 54 00 03 00 54 | 0b 00 59 00 03 00 59 | 24 | 17 | 01 01 97 a1 | 09 …`):

```
0xa073  GOSUB    [0xa18f]        ; the [0x022d] gate of §1.4
0xa077  COMPARE  [0x0230] #0
0xa07d  IF_NE
0xa07e  EXIT                     ; already consumed -> silent
0xa07f  PRINTCLEAR "LIKE ALL THE REST, THIS A JUST A SMALL CUBICLE--ANOTHER MINER'S QUARTERS.
                    UNLIKE ALL THE REST, THIS ONE IS OCCUPIED!"
0xa0d9  SETUP_MONSTER #255 #0 #150 #0
0xa0e3  LOAD_MONSTER  #84 #3 #84
0xa0ea  LOAD_MONSTER  #89 #3 #89
0xa0f1  COMBAT
0xa0f2  IF_NE
0xa0f3  GOTO     [0xa197]        ; NOT a victory -> the parlay tail
0xa0f7  SAVE     #1 [0x0230]     ; consumed, victory only
0xa0fd  PRINTCLEAR "ON ONE OF THE ORCS THE PARTY FINDS A CRUDELY SCRAWLED NOTE …'GHOGH'"
```

`MON1CHA.DAX` under `TREASURES_LAYOUT`: id 84 = `YETI CHIEF`, 86 = `ICE HOUND`,
89 = `ORC CHIEF`, 31 = `BEHOLDER`, 83 = `YETI GUARD`. Ids 84/86 match the early leg's own
decode of the same archive.

Each of the six `0xFF` cells is a **one-cell room**: all four edges carry wall slot 1 except a
single wall-slot-5 / door-flag-1 automatic door (west for x=13, east for x=14). They really are
miners' cubicles.

---

## §4 — The route: 36 legal directed steps over the real wall/door graph

Edges decoded exactly as `tools/find_geo_path.decode_edges` does it — wall planes at
`raw[2:258]` / `raw[258:514]`, door flags at `raw[770:1026]`; an edge is passable when the wall
slot is 0 **or** a door flag is set. BFS from the byte-grounded spawn `(6,15)` to the `0xFF`
cubicle `(13,14)` — one of the six, at 36 steps. (`(13,13)` is marginally closer at 35 steps;
the 36-step route to `(13,14)` is the one this leg walks and asserts, and the §5 articulation
argument is over **all six** cubicles, so the choice does not affect any claim. Corrected
2026-08-06: an earlier draft called `(13,14)` the *nearest* cubicle — measured BFS distances
from `(6,15)` are `(13,13)`=35, `(14,13)`=36, `(13,14)`=36, `(14,14)`=37, `(13,15)`=37,
`(14,15)`=38.)

```
(6,15) N (6,14) E (7,14) N (7,13) E (8,13) N (8,12) N (8,11) W (7,11) N (7,10) W (6,10)
       N (6, 9) W (5, 9) W (4, 9) W (3, 9) N (3, 8) N (3, 7) E (4, 7) E (5, 7) N (5, 6)
       E (6, 6) E (7, 6) E (8, 6) S (8, 7) E (9, 7) E (10,7) S (10,8) E (11,8) S (11,9)
       S (11,10) S (11,11) W (10,11) S (10,12) E (11,12) E (12,12) S (12,13) S (12,14)
       E (13,14)
```

36 steps, final facing east. Independently reproduced by the repo's own tool:

```
python tools/find_geo_path.py --geo ".../GEO1.DAX" --block 33 --start 6,15 --target 13,14 --facing north
  -> step_count 36, final_facing "east", required_interactions 0
```

Exactly four of the 36 edges are doors and all four are **flag 1 (automatic)** — no bash, pick
or knock anywhere: `(3,8)→north`, `(11,10)→south`, `(10,11)→south`, `(12,14)→east`. The other
32 edges have wall slot 0.

---

## §5 — The articulation-point argument: 22 of the 36 route cells are forced

Full connectivity of `GEO1.DAX#33`: 17 components, sizes
`[197, 29, 7, 4, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]`. The spawn `(6,15)` sits in the
197-cell component together with every `0xFE` and `0xFF` cell. (The two `0xFD` sea-cavern cells
do **not** — see §8.)

Removing one cell at a time and re-running BFS from `(6,15)`, **22 cells strand *all six*
`0xFF` cubicles**, and every one of the 22 lies on the route above:

| cut | cells still reachable | cut | cells still reachable |
|---|---|---|---|
| `(7,14)` desc `0x80` | 5 | `(6,6)` desc `0x81` | 66 |
| `(7,13)` desc `0x8A` | 6 | `(10,7)` desc `0x82` | 145 |
| `(8,13)` desc `0x80` | 7 | `(10,8)` desc `0x82` | 146 |
| `(8,12)` desc `0x80` | 8 | `(11,8)` desc `0x81` | 147 |
| `(8,11)` desc `0x80` | 10 | `(11,9)` desc `0x82` | 148 |
| `(7,11)` desc `0x80` | 11 | `(11,10)` desc `0x83` | 149 |
| `(7,10)` desc `0x80` | 13 | `(11,11)` desc `0x82` | 150 |
| `(6,10)` desc `0x80` | 14 | `(4,7)` desc `0x82` | 62 |
| `(6,9)` desc `0x80` | 15 | `(5,7)` desc `0x83` | 63 |
| `(5,9)` desc `0x8B` | 17 | `(3,8)` desc `0x80` | 58 |
| `(4,9)` desc `0x80` | 18 | `(3,9)` desc `0x8C` | 19 |

(baseline reachable from `(6,15)` with nothing removed: **197**.)

So this is not "one path among many": on **any** route from the arrival room to **any** of the
six occupied-cubicle cells, the party is forced through all 22 of these cells — including the
three narrative cells `(7,13)` ("…THE ONLY SOUNDS YOU HEAR ARE THE RAPS OF THE PARTY'S
FOOTFALLS AND THEIR ECHOES."), `(5,9)` ("TO THE WEST, YOU SEE A FLICKERING, BARELY VISIBLE GLOW
OF FIRELIGHT.") and `(3,9)`, the ransacked **Great Hall of Fireshear**. The map's own story
beats are structurally unavoidable, not merely on one chosen path.

---

## §6 — The walk through the real VM

Fresh `EclVm` at entry 22 with `[0x0016]=28` seeded and **nothing else**; then one
`dialogueForCell` per step against the same persistent `memory`, with `[0x0011]` seeded to the
facing the party carries into the cell (§2b explains why `opts.facing` alone is not enough on
this title). Seed `0x1234` throughout. Result — four non-silent steps out of 36:

| step | cell | desc | masked → arm | outcome |
|---|---|---|---|---|
| 0 (standing) | `(6,15)` | `0x86` | 6 → `0x8535` | the arrival narration (§2). **One-shot: writes `[0x0228]=1`** |
| 3 | `(7,13)` | `0x8A` | 10 → `0x8920` | "AS YOU ADVANCE DOWN THE CORRIDOR… THE RAPS OF THE PARTY'S FOOTFALLS AND THEIR ECHOES." One-shot on `[0x022C]`, reached through the `0xA18F` EXIT-wrapper: writes `[0x022C]=1` |
| 11 | `(5,9)` | `0x8B` | 11 → `0x89B4` | "TO THE WEST, YOU SEE A FLICKERING, BARELY VISIBLE GLOW OF FIRELIGHT." (no write) |
| 13 | `(3,9)` | `0x8C` | 12 → `0x8A3F` | "YOU STEP INTO THE GREAT HALL OF FIRESHEAR. IT HAS BEEN RANSACKED…" — **facing-gated west**, see below (no write) |
| 36 | `(13,14)` | `0xFF` | 127 → `0xA073` | **combat**: `YETI CHIEF ×3` (84) + `ORC CHIEF ×3` (89), `setup {spriteId:255, maxDistance:0, picId:150, distance:0}` |

The masked→arm column is read off the `ON_GOTO [0x009a] #34 <34 arms>` table at `0x83F2`
(108 bytes; arms 0/4/5 all point at the bare `EXIT` at `0x84F5`).

**The one-shot arms, transcribed in full (corrected 2026-08-06).** An earlier draft described
arm `0x8535` as opening straight onto its one-shot check; it does not — it first forks on
`[0x022D]`:

```
0x8535  GOSUB    [0xa188]        ; the bare [0x022d] leaf, NOT the 0xa18f EXIT-wrapper
0x8539  IF_NE
0x853a  GOTO     [0x8659]        ; post-yeti fork to an alternate narration
0x853e  COMPARE  [0x0228] #0
0x8544  IF_NE
0x8545  EXIT
0x8546  SAVE     #1 [0x0228]
0x854c  PRINTCLEAR "DESCENDING A SHORT FLIGHT OF STEPS…"
```

Arm `0x8920` (masked 10, the corridor) uses the **same one-shot idiom on `[0x022C]`, but
reached through the `0xA18F` EXIT-wrapper rather than `0x8535`'s bare `0xA188` leaf +
`GOTO`** — the earlier draft called the two "the same shape", which they are not.

**The Great Hall beat is facing-gated, and the route satisfies the gate by construction.**
Arm `0x8A3F` opens `COMPARE [0x0011],#3 ; IF_NE ; EXIT` — descriptor `0x8C` is silent unless the
party is heading **west**. The route enters `(3,9)` westbound (step 13 of §4), so this is not an
incidental text: it is reachable only because the walk approaches the Great Hall from the east.
Measured in the real VM: `[0x0011]` = 0/1/2 → `{kind:'end', text:''}`, `[0x0011]` = 3 → the
narration. This is a second, independent corroboration of §2b's facing register (the first is
`0x9B84`, §8.1).

`afterCombat('victory')` then resolves to the retail continuation and the consumed write:

> "ON ONE OF THE ORCS THE PARTY FINDS A CRUDELY SCRAWLED NOTE THAT READS: 'FALLO THE MONSTRS.
> FIND OUT WOT'S GOING ON. HOOS IN COMAND. AINT THOS BIG DUM FRCLAWS. GHOGH'"

Memory delta across the whole walk, inside Treasures' own persistent word band
(`0x0100`–`0x0FFF`): **exactly three words — `[0x0228]=1`, `[0x022C]=1`, `[0x0230]=1`.**

Three further addresses also carry values afterwards — `[0x7F79]=0x3F`, `[0xC04D]=1`,
`[0xC04F]=0xFF` — and they are **not** script writes. `primeSearchLocation` seeds the CoK/DoK
Gen1 host registers for every Gen1 dialect (§2b), so these are the final cell's descriptor
(`0xFF`, and `0xFF & 0x3F = 0x3F`) and facing (east = 1) leaking out of the harness. The golden
asserts them explicitly rather than filtering them away, precisely so the three-word claim above
cannot be accused of hiding them. A corpus-wide census of `SAVE` destinations across all 30
blocks finds zero writes to `0xC04B`/`0xC04C`/`0xC04D`, so no Treasures script reads or maintains
them.

Negative controls, all in the golden:
- Re-entering `(13,14)` on the same memory is silent (`0xA07D` `IF_NE ; EXIT`).
- On a **fresh** memory the same cell re-fires the identical roster — the suppression is the
  retail word, not runner state.
- `afterCombat('defeat')` does **not** write `[0x0230]`; it falls to `0xA197`/`0xA1A5` and
  raises the retail `PARLAY` menu (`HAUGHTY / SLY / NICE / MEEK / ABUSIVE`).

---

## §7 — The cross-leg `[0x022D]` gate is live and discriminating

Descriptor 1 (raw `0x81`, four of this route's cells) is a wandering-monster arm at `0x84F6`
(bytes `08 00 81 01 bf 00 | 03 01 bf 00 00 09 | 1b | 00`):

```
0x84f6  RANDOM   #129 [0x00bf]
0x84fc  COMPARE  [0x00bf] #9
0x8502  IF_GE
0x8503  EXIT                     ; roll >= 9 -> silent
0x8504  GOSUB    [0xa18f]        ; the [0x022d] gate
0x8508  SUBTRACT #1 [0x009a] [0x00c6]
0x8511  GOTO     [0x822d]        ; randomized-roster encounter
```

Descriptor 2's arm (`0x8515`) and descriptor 3's (`0x8525`) are the same shape with thresholds
8 and 7, both tail-jumping into `0x8502`.

Measured, in the real VM, on a single descriptor-`0x81` cell:

- seeds `0x1234 / 2003 / 7 / 99 / 5 / 12345` roll `16 / 73 / 93 / 106 / 17 / 71` — all `>= 9`,
  all silent.
- seed **8** rolls **2** and the arm fires for real:
  > "A TALL, WHITE-FURRED MONSTER AND ITS GREAT WHITE DOGS APPEAR UP AHEAD!"
  with the retail `ATTACK`/`FLEE` encounter menu; choosing `ATTACK` yields a genuine roster
  `ICE HOUND ×3` + `YETI CHIEF ×1`.
- **seed 8 again, with `[0x022D]=1` pre-seeded**: `[0x00BF]` is still `2` (the roll happens
  before the gate) but the turn is `{kind:'end', text:''}`.

That last line is the point of this leg. The early leg's proven terminal write
(`ECL1#34 0x8DF9 SAVE #1 -> [0x022D]`) demonstrably pacifies block 33's wandering encounters —
two independently proven legs meeting at one byte.

**Disclosure (the honest counterpart of §6).** 21 of the 36 route cells carry descriptor 1, 2
or 3 and therefore a live 5–7 % roll each. The golden builds a **fresh runner per step at one
fixed seed**, so those 21 cells all draw the *same* first value; §6's silence is
"this roll is silent, 21 times", **not** "21 independent rolls all came up silent". On a real
playthrough at least one wandering fight is likely (≈1−0.94²¹). This affects none of §6's four
asserted events: `(7,13)`/`(5,9)`/`(3,9)` are flag/descriptor-gated and `(13,14)` is
flag-gated, with no `RANDOM` on any of their paths.

---

## §8 — Two more discriminating controls

**8.1 Facing gate.** The `0xFD` sea-cavern arm at `0x9B84` (bytes
`03 01 11 00 00 03 | 17 | 00 | 03 01 31 02 00 00 | 16 | 01 01 0c 9c`):

```
0x9b84  COMPARE  [0x0011] #3      ; west
0x9b8a  IF_NE
0x9b8b  EXIT
0x9b8c  COMPARE  [0x0231] #0
0x9b92  IF_EQ
0x9b93  GOTO     [0x9c0c]         ; "THIS CAVERN ON THE SEA IS FILLED WITH YETI AND ICE
                                  ;  HOUNDS… THEY SEE YOU AND ATTACK!"  84×8 + 86×10
0x9b97  PRINTCLEAR "THE ROOF OF THE CAVERN HERE OPENS OUT TO THE SKY…"
```

In the real VM: `[0x0011]` = 0/1/2 → `{kind:'end', text:''}`; `[0x0011]` = 3 → the combat.
`[0x0231]=1` → the scenic text instead. This corroborates §2b's facing register from a second,
independent direction, and the map does **not** force the gate: each `0xFD` cell has three
passable edges — `(1,1)` east door `[5,1]`→`(2,1)`, south open→`(1,2)`, west open→`(0,1)`;
`(1,4)` east door `[5,1]`→`(2,4)`, north open→`(1,3)`, west open→`(0,4)` — all six neighbours
inside the same 29-cell pocket. A party can therefore enter either cell heading north, south or
east, in which case the encounter is silent. Block 33's own sea-cavern spawn arm (`0x8072`)
lands at `(1,2)` or `(1,3)` facing west, from which the natural single step into a `0xFD` cell
is north/south and the gate does **not** fire. `0x9B84` is a genuine facing gate (case I proves
it silent at three facings and loud at west); how a real playthrough satisfies it is NOT
established here. (Corrected 2026-08-06: an earlier draft claimed each `0xFD` cell is entered
only through an east door and so is always approached facing west — refuted by the same GEO
bytes.) The whole sea-cavern pocket is the 29-cell component, disconnected from the 197-cell
city — and
block 33's *other* spawn arm (`0x8072`: `RANDOM #1 -> [0x0035]`, `ADD #2`, `X=1`, `facing=3`)
lands inside that pocket, taken only when `[0x0016]==35` or when `[0x0016]==28 && [0x0231]==1`.
`[0x0231]`'s sole writer is `0x9E36`, immediately after the beholder dies. So the sea cavern
becomes the party's dock once the chapter's climax is over. (Byte-verified; the *reading* of it
as "dock" is inference.)

**8.2 Mask counterfactual.** The script's `AND #127` is load-bearing and its failure mode is
not silence. Dispatching the same three encounter descriptors under a `& 0x3F` mask
(`0xFF→63`, `0xFE→62`, `0xFD→61`) sends **all three** into the `0x8469` mine-shaft arm — the
`DESCEND`/`AVOID` menu whose `DESCEND` branch is `NEWECL #34`. A wrong mask on this block does
not lose the encounter; it silently teleports the party into the early leg's area.

---

## §9 — Byproduct finding: Treasures' extra opcode `0x42` takes FOUR operands, not one

Not used by this leg (block 33 contains no reachable `0x42`), but found while surveying and
worth recording because the engine currently models it differently.

`packages/engine/src/ecl/disassemble.ts` declares
`opcodeOverrides: { 0x42: { wordSet: 1, trailingBytes: 1, … } }` — 4 bytes total — on the
evidence of block 4 byte 80, where "the following two bytes form one valid EclOpp and re-land
exactly on SAVE". Block 4 does not discriminate: the five bytes after that also happen to
decode as one `SAVE`, so both framings re-sync.

Blocks 27 and 35 **do** discriminate. The two worked examples below were re-read byte-for-byte
out of the retail archive in this document's second pass and are solid. The three-bullet *census*
that follows them was **not** re-derived in that second pass — it is carried over from the first
pass and should be treated as an unverified survey claim until someone re-runs it:

Enumerating every reachable `0x42` in the archive under a four-operand frame (`1 + 4×2 = 9`
bytes) gives 24 sites, and at every one:

- operand 0 equals **the block's own area id** (`#16` in 4/16, `#26` in 26, `#27` in 27, `#35`
  in 35 …; the one exception, block 29 `0x8EA6`, names `#48`);
- the next byte is a valid opcode (20/24 are `0x09 SAVE`, the rest `EXIT`/`GOTO`/`SURPRISE`);
- in 8 blocks it lands **exactly** on the canonical pose-restore triple
  `SAVE [0x02EB]→[0x0011]`, `SAVE [0x02EC]→[0x0034]`, `SAVE [0x02ED]→[0x0035]` — the same
  triple that follows a plain `LOAD_FILES` in blocks 20/22/24/25/40.

Worked example, block 27 offset 92 (`0x805A`) — re-read this pass, the archive's actual bytes are
`42001b000a000b000709000301110009000d01340009000b013500`, i.e. `42 00 1b 00 0a 00 0b 00 07 |
09 00 03 01 11 00 | 09 00 0d 01 34 00 | 09 00 0b 01 35 00`:

| framing | decode |
|---|---|
| 4 operands (9 bytes) | `EXT42 #27,#10,#11,#7` → `SAVE #3→[0x0011]` (facing west), `SAVE #13→[0x0034]`, `SAVE #11→[0x0035]` — a coherent spawn triple, and `0x8075` (the `GOTO` target from `0x8056`) lands exactly on the following `SAVE #27→[0x0016]` |
| 1 operand + 1 trailing (4 bytes) | `EXT42 #27` → `LOAD_CHARACTER #11` → `EXIT` → `MULTIPLY <code9:0>,[0x1101],#9` → `EXIT` → `APPROACH` → `GOTO <code52:0>` — operand codes 0x09/0x34 are not valid EclOpp codes |

Block 35 offset 60 is the same story — re-read this pass as
`4200230010000f000b0901eb020111000901ec020134000901ed02`, i.e. `EXT42 #35,#16,#15,#11` followed
by exactly `SAVE [0x02EB]→[0x0011]`, `SAVE [0x02EC]→[0x0034]`, `SAVE [0x02ED]→[0x0035]`, the
canonical pose-restore triple, versus a nonsensical `INPUT_STRING #15,#11` at area init under the
4-byte framing. Reading operands 1–3 as resource-set ids
(the `#255` = none convention, matching `LOAD_FILES`' second operand) is **inference**; the
9-byte frame is not.

**Consequence, stated plainly:** any block whose `initial_entry` traverses a `0x42` is
mis-decoded by the current engine dialect by 5 bytes. The affected-block list given by the first
pass was blocks 4, 16, 17, 18, 19, 21, 23, 26, 27, 28, 29, 30, 31, 32, 35, 36, 37, 38, 39, 47, 49,
50 — i.e. most of the archive — and that list is part of the un-re-verified census above, not a
second-pass result. What *is* second-pass verified is narrower and sufficient for this leg: block
33's `initial_entry` reaches `LOAD_FILES` rather than a `0x42` — the golden's case A runs the real
`EclVm` from entry 22 and it exits cleanly emitting `loadFiles {geoBlockId: 33, operands: [33,12]}`,
which a 5-byte desync would not survive — and block 34's entry path was checked directly for this
doc: a CFG walk from all five of block 34's header entries under `ECL_GEN1_SHORT_TREASURES`
reaches **no** `0x42` instruction (same result for block 33). Note that the early leg's golden,
`packages/engine/test/dungeonEvents.test.ts`, does **not** cover this — it enters block 34 at
`search_location` via `dialogueForCell` and never runs its `initial_entry`. (Corrected
2026-08-06: an earlier draft cited that golden as covering block 34's entry path; it does not.)
Neither leg is affected either way. **No
engine file was changed by this leg** (it owns only its doc and its test); the fix belongs to
whoever owns `disassemble.ts`.

---

## §10 — Verification

`packages/engine/test/treasuresMiddleRoute.test.ts` — 12 cases, all passing, no skips when the
GOG install is present:

```
cd packages/engine && npx vitest run test/treasuresMiddleRoute.test.ts
```

Observed result: `Test Files 1 passed (1) / Tests 12 passed (12)`.

**A.** header + cold `initial_entry` byte-grounds `(6,15,north)`, byte-exact spawn literals, and
`loadFiles {33,12}` — **B.** arrival from area 28 gives the same pose plus the Neverwinter
narration — **C.** the three encounter descriptors located from the GEO with the script's own
`&0x7F` — **D.** the 36-step legality and the four automatic doors — **E.** the 22-cell
articulation proof, including an exhaustive 16×16 sweep showing those 22 are the *only* single-cell
cuts — **F.** the full walk with exact texts, roster and the corrected three-word persistent delta
plus the explicitly-asserted harness artifacts — **G.** consumed word `[0x0230]`: silent revisit,
fresh-memory re-fire, defeat control (no write, parlay menu), and the sibling `0xFE` encounter on
`[0x022F]` — **H.** the `[0x022D]` cross-leg gate (seed 8 fires; same seed + `[0x022D]=1` silent)
— **I0.** the Great Hall's west-only facing gate — **I.** facing gate on `0xFD` plus its
component isolation — **J.** the `&0x3F` mask counterfactual — **K.** monster names from
`MON1CHA.DAX`.

## §11 — What this leg does NOT establish

- Nothing was traced in DOSBox-X. Every dynamic observation comes from this repo's own
  `EclVm`, so it inherits that VM's semantics (compare-flag model, `RANDOM` implementation,
  `GOSUB`/`ON_GOTO` handling). A retail-engine divergence in any of those would not be visible
  here.
- The route is walked cell-by-cell through `dialogueForCell`; the browser `Explorer`/
  `?explore=` host is **not** wired to a `treasures-middle` route, and no `apps/web` file was
  touched. This is an engine-level leg only.
- `[0x0016]=28` is *seeded*, not produced by running block 28. The claim "this models arrival
  from Neverwinter" rests on the 30-block guard/latch pattern (§2), which is an inference.
- Each step also seeds `[0x0011]` to the facing the route carries into that cell, because
  `primeSearchLocation` seeds the CoK/DoK `0xC04D` for every Gen1 dialect and Treasures reads
  `[0x0011]` instead (§2b). That is the harness standing in for a host register the retail engine
  maintains; the *values* come from the route's own geometry, not from picking whatever makes an
  arm fire. Two arms are facing-gated (`0x8A3F` west, `0x9B84` west) and both are shown silent at
  the other three facings, so the seed is discriminating rather than permissive.
- The walk is per-step `dialogueForCell` dispatch against one carried-forward memory, driven by
  the route's coordinates. No encounter is reached by injecting an entry point — but equally, no
  `Explorer` instance is doing the moving, so nothing here proves the *host's* step loop would
  produce this same cell sequence.
- The wandering-arm silence of §6 is an RNG outcome at one seed, per §7's disclosure.
- `vm_run_1` (`0x83A8`) was not exercised. Gen1 hosts run it every step before
  `search_location`; anything it contributes to per-step behaviour is outside this leg.
- Byte scans for a word operand cover operand codes 1/2/3 only. A write through
  `SAVE_TABLE`/indirection could in principle touch `[0x022D]`/`[0x0230]`/`[0x01C0]` without
  matching the pattern; none was seen, but "sole writer" is bounded by that method.
- Chapter names and the "mid-campaign" reading of §1 beyond facts 1.1–1.4 are inference from
  the block's own printed strings, and §1's honest limitation about `[0x022D]` chronology
  stands.
- §9's `0x42` census (24 sites, the 8-block pose-restore tally, the affected-block list) is a
  first-pass survey that was **not** re-derived in the second pass. Only the block 27 / block 35
  byte frames and the block 33 / block 34 non-involvement were re-verified.
- The articulation argument is over the GEO wall/door graph only. It proves no *walking* route to
  a cubicle avoids those 22 cells; it does not rule out the engine placing the party past them by
  some non-walking means (a `NEWECL` arrival, a teleport arm, a save restored mid-area). Block
  33's own entry arms land at `(6,15)` or in the disconnected sea-cavern pocket (§8.1), neither of
  which bypasses the cut set toward a cubicle, but that is a statement about the two arms read,
  not an exhaustive proof over every possible engine entry.
- §9's four-operand `0x42` frame is proven as a *frame*; the *semantics* of its three extra
  operands are inferred, not traced.
- **Coverage caveat.** Block 33 is the *immediate parent* of the `early` leg's block 34:
  `NEWECL #34` occurs exactly once corpus-wide (block 33 `0x84D9`, the mine-shaft `DESCEND`
  branch), so block 34 is reachable only through block 33, and both sit behind the same single
  outside gate (block 28's `[0x01C0]` ticket). The two proven legs are two levels of one
  location, not independent regions. They are distinct areas by every mechanical measure the
  matrix uses — distinct ECL block, distinct GEO block, distinct encounters, distinct consumed
  words `[0x0230]`/`[0x022F]` vs `[0x022D]`/`[0x0232]` — and Treasures ships only one script
  archive so a distinct-archive split (CoK's `ECL2.DAX` precedent) is impossible here; but the
  breadth this leg adds is smaller than that precedent's. (Added 2026-08-06.)
- The per-cell runner also passes `onCall: () => ({ comparison: { left: 0, right: 1 } })`, a
  blanket host stub that forces NE after any `0x2D CALL`. Block 33 contains exactly one `0x2D`,
  at `0xA1A8` (after `PARLAY #10` on the defeat tail, immediately before `GOTO 0x83D8`), and
  case G pauses at the `PARLAY` menu before reaching it — so the stub is inert for every
  assertion here. It is disclosed rather than removed so no assertion rests on an unexamined
  host stub. (Added 2026-08-06.)
