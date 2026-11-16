# Gateway to the Savage Frontier — MIDDLE natural-combat route: the shipwreck island, `ECL4.DAX#12` (2026-08-05)

**Status: PROVEN, engine-level, from static retail bytes only.** No DOSBox-X session, no emulator,
no native capture was used or is claimed. Engine golden:
`packages/engine/test/gatewayMiddleRoute.test.ts`, every test reading the real retail files behind
an `it.skipIf` guard.

This closes the `middle` leg of `tools/goldbox_campaign_matrix.json`'s six-leg matrix for
`gateway-to-the-savage-frontier`. It is archive-distinct and block-distinct from all three
already-proven Gateway legs — `early` (`ECL2.DAX#1`, Yartar), `town` (`ECL5.DAX#19`, Sundabar) and
`wilderness` (`ECL6.DAX#21`, overland).

The route is **two** natural encounters, not one, because the second is only reachable *through* the
first: `(12,10)` is a genuine articulation point of this map's wall graph (§5).

---

## 0. Files, dialect, addressing

Install: `C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/`

| File | What was read | Verified |
| --- | --- | --- |
| `ECL4.DAX` block 12 | decompressed **3464** bytes | container TOC via `tools/goldbox_corpus.read_dax_blocks`; blocks present are 8/10/11/12/13 |
| `GEO4.DAX` block 12 | **1026** bytes, 16×16 | blocks present are 8/10/11/12/13 |
| `MON4CHA.DAX` | records decoded with the engine's own `decodeMonsterArchive(..., 'gateway-to-the-savage-frontier')` | ids 54/69/70/71/77 resolve to `OTYUGH` / `SCRAG` / `PIRATE` / `MARGOYLE` / `KRAKEN GUARD` |

Dialect: **`ECL_GEN1_SHORT_GATEWAY`** (`packages/engine/src/ecl/disassemble.ts`) —
`wordSetOverrides {0x1d: 0, 0x22: 0, 0x2c: 1}`, `headerLen 22`, `vbase 0x7FFE`, `hasMagic`, and
**no `cellDescAddr` override**, so the per-cell descriptor is read from `[0xC04F]`.

Addressing: address addend `0x8000`; file offset = `vaddr - 0x8000 + 2`.

Real header, read straight out of the decompressed block
(`88 13 | 01 01 83 83 | 01 01 1a 83 | 01 01 7e 84 | 01 01 e2 84 | 01 01 14 80`):

| Slot | Value |
| --- | --- |
| magic | `0x1388` |
| `vm_run_1` | `0x8383` |
| `search_location` | `0x831A` |
| `pre_camp_check` | `0x847E` |
| `camp_interrupted` | `0x84E2` |
| `ecl_initial_entry` | `0x8014` |

`0x8014 - 0x7FFE = 22` — `initial_entry` is the instruction immediately after the 22-byte header,
i.e. the block's real boot leg, not a GOTO trampoline.

---

## 1. Spawn — grounded in the block's own `initial_entry` SAVEs

Cold-memory disassembly of `initial_entry` (bytes quoted verbatim from the decompressed block; the
leading number is the file offset):

```
   22 0x8014  SAVE        #0  -> [0x4BFB]                09000001fb4b
   28 0x801A  SAVE        #0  -> [0x4C00]                09000001004c
   34 0x8020  SAVE        #9  -> [0x4BFE]                09000901fe4b
   40 0x8026  GOSUB       0x83A7                         0201a783
   44 0x802A  SAVE        #60 -> [0x7EC6]                09003c01c67e
   50 0x8030  SAVE        #1  -> [0x4BE6]                09000101e64b   inDungeon = 1 (local map)
   56 0x8036  LOAD_FILES  #12,#2,#255                    21000c000200ff  operand 0 = GEO block id -> GEO4.DAX#12
   63 0x803D  LOAD_PIECES #8,#15,#9                      370008000f0009
   70 0x8044  COMPARE     [0x4BF2],#12                   0301f24b000c
   76 0x804A  IF_EQ                                      16
   77 0x804B  GOTO        0x8308                         01010883
   81 0x804F  SAVE        #13 -> [0xC04C]                09000d014cc0   Y      = 13
   87 0x8055  SAVE        #13 -> [0xC04B]                09000d014bc0   X      = 13
   93 0x805B  SAVE        #0  -> [0xC04D]                090000014dc0   facing = 0 (north)
   99 0x8061  CALL        [0x0809]                       2d010908
  103 0x8065  PRINTCLEAR  <the shipwreck narration, §7>
  ...
  777 0x8307  EXIT                                       00
```

Note the ordering quirk versus `ECL2.DAX#1`: this block writes **Y before X**.

Verified in the real `EclVm` (golden test A): running block 12 from entry 22 on an empty memory map
exits cleanly with `[0xC04B]=13`, `[0xC04C]=13`, `[0xC04D]=0`, `[0x4BE6]=1`, `[0x4BFE]=9`,
`[0x4BFD]=8`, `[0x4C00]=0`, emitting `loadFiles{geoBlockId:12, operands:[12,2,255]}` and
`loadPieces{setBlockIds:[8,15,9]}`.

**The single incoming-area guard at `0x8044` does not fire on a cold boot.** A stack-aware,
all-outcomes CFG walk from all five header entries of every `0x1388`-magic block in **all five**
Gateway ECL archives finds exactly **two** writers of `[0x4BF2]` corpus-wide:

- `ECL5.DAX#99 @0x8014  SAVE #0 -> [0x4BF2]`  (`09000001f24b`)
- `ECL5.DAX#98 @0x801C  SAVE #1 -> [0x4BF2]`  (`09000101f24b`)

Neither can produce 12, so within the ECL corpus the `== #12` test can never pass.
**Stated honestly:** the same census finds 41 *read* sites comparing `[0x4BF2]` against area ids
`0x08 … 0x1b` across 17 blocks, which is strong evidence that the **native host** also writes this
word (it is `LastEclBlockId` in this repo's register table). So the defensible claim is the narrow
one — *on a cold headless boot `[0x4BF2] = 0` and the guard falls through to the `0x804F` spawn* —
not the broad one that the retail engine can never set it to 12.

**No host-model seed is used anywhere in this leg.** Unlike the `early` leg, this walk needs no
`[0x4C01]`/`[0x4C02]` correction: golden test D runs it with *nothing* seeded on top of the retail
boot and reaches both encounters, both rosters and both consumed-word transitions unchanged
(step 1's cell `(13,12)` dispatches ON_GOTO arm 2, which is a bare `EXIT`, so the previous-descriptor
word cannot matter there).

---

## 2. Per-step dispatch

`search_location @0x831A` (file offset 796):

```
  796 0x831A  SAVE      [0x4C02] -> [0x4C01]              0901024c01014c   (previous descriptor)
  803 0x8321  AND       #127,[0xC04F] -> [0x4C02]         2f007f014fc001024c   <-- THE MASK IS &0x7F
  812 0x832A  COMPARE   [0x4C02],#124                     0301024c007c
  818 0x8330  IF_GE                                       1b
  819 0x8331  GOTO      0x8368                            01016883
  823 0x8335  ON_GOTO   [0x4C02],#15, <15 targets>        2501024c000f01fa8401328501e48501e58501e68501e78501e88501378601e286013187013287018187010f8801828801e888
  874 0x8368  SUBTRACT  #124,[0x4C02] -> [0x7F79]         05007c01024c01797f    (i.e. [0x7F79] = desc - 124)
  883 0x8371  ON_GOTO   [0x7F79],#4, 0x8978 0x8A97 0x8B6E 0x8C3C   2501797f000401788901978a016e8b013c8c
```

So the block has **two** dispatch tables: descriptors `0…14` through the `0x8335` table, and
descriptors `124…127` through the `0x8371` table after the subtraction. Descriptors `15…123` fall
through both and are inert. `GEO4.DAX#12` only ever uses descriptors in those two live ranges.

Low-table arms used by this route (targets read off the real operand list at file offset 829 + 3·i):

| Arm | Target | Role |
| --- | --- | --- |
| 0 | `0x84FA` | bare `EXIT` |
| 1 | `0x8532` | open terrain — the wandering-monster roll (§8) |
| 2 | `0x85E4` | bare `EXIT` |
| 5 | `0x85E7` | bare `EXIT` (the spawn cell) |
| 11 | `0x8781` | "across the strait … the fortress" (`PICTURE #57`) |
| 12 | `0x880F` | lighthouse-tower description — **gated on `[0x4C0B]`** (§9) |
| 13 | `0x8882` | "the party stands before the lighthouse" — **gated on facing north** (§9) |

High-table arms:

| Descriptor | Index | Target | Encounter |
| --- | --- | --- | --- |
| 124 | 0 | `0x8978` | **the ruined lighthouse — this route's main encounter** |
| 125 | 1 | `0x8A97` | coastal-fortress guards (JOURNAL #36) — not on this route |
| 126 | 2 | `0x8B6E` | **the beach scrags — the forced en-route encounter** |
| 127 | 3 | `0x8C3C` | fortress interior (JOURNAL #49) — not on this route |

---

## 3. Target descriptors and GEO cells

Descriptor plane = `GEO4.DAX#12` `raw[514:770]`, index `y*16 + x`. **Mask used: `&0x7F`** — the
script's own `AND #127` at `0x8321`.

| Masked descriptor | Cells | Raw floor byte |
| --- | --- | --- |
| 124 | `(14,4)`, `(14,5)`, `(15,5)` | `0xFC` |
| 125 | `(10,6)`, `(11,6)`, `(10,7)`, `(11,7)`, `(11,8)` | `0xFD` |
| 126 | `(12,10)` — **exactly one cell** | `0x7E` |
| 127 | `(7,11)`, `(6,12)`, `(7,12)`, `(8,12)`, `(6,13)`, `(7,13)`, `(8,13)`, `(7,14)`, `(8,14)` | `0xFF` |

**The mask choice is load-bearing here, and it discriminates.** 18 of this block's 256 descriptor
bytes differ between `&0x3F` and `&0x7F` — every high-descriptor encounter cell. Under `&0x3F` the
lighthouse cell would dispatch descriptor **60** and the beach cell descriptor **62**, both of which
land in the inert `15…123` gap. Golden test I runs exactly that counterfactual through the real VM:
both cells return `{kind:'end', text:''}`. Contrast the `early` leg, where `&0x3F` and `&0x7F` were
indistinguishable on `GEO2.DAX#1`.

Route cells, straight from the GEO plane (`raw[514+y*16+x]`):

| Cell | raw | `&0x7F` | Arm |
| --- | --- | --- | --- |
| `(13,13)` spawn | `0x05` | 5 | `0x85E7` EXIT |
| `(13,12)` | `0x02` | 2 | `0x85E4` EXIT |
| `(13,11)`,`(14,11)`,`(15,11)`,`(15,10)`,`(15,9)`,`(14,9)`,`(14,10)`,`(13,10)` | `0x01` | 1 | `0x8532` wandering roll |
| **`(12,10)`** | `0x7E` | **126** | `0x8B6E` **beach scrags** |
| `(12,9)`,`(12,8)`,`(13,8)`,`(14,8)`,`(15,8)` | `0x01` | 1 | `0x8532` |
| `(15,7)` | `0x0C` | 12 | `0x880F` lighthouse tower text |
| `(14,7)` | `0x01` | 1 | `0x8532` |
| `(14,6)` | `0x0D` | 13 | `0x8882` "stands before the lighthouse" |
| **`(14,5)`** | `0xFC` | **124** | `0x8978` **lighthouse keeper's quarters** |

---

## 4. Reachability over the real wall/door graph

```
python tools/find_geo_path.py --geo "<install>/GEO4.DAX" --block 12 \
    --start 13,13 --target 14,5 --facing north
```

`step_count 19`, `final_facing north`, `event_mask 127`, `blocked_cell_count 0`,
`required_interactions []`.

Directions:
**north, north, east, east, north, north, west, south, west, west, north, north, east, east, east,
north, west, north, north**

DOS keys:
`{UP}{UP}{RIGHT}{UP}{UP}{LEFT}{UP}{UP}{LEFT}{UP}{LEFT}{UP}{RIGHT}{UP}{UP}{RIGHT}{UP}{UP}{RIGHT}{UP}{UP}{UP}{LEFT}{UP}{LEFT}{UP}{RIGHT}{UP}{UP}`

Door edges — **exactly one**, and it is flag 1 (automatic; no prompt, no check):

- `(14,6) north -> (14,5)`: wall slot 15, door flag 1 (door byte at `raw[770 + 6*16 + 14] = 0x01`)

The other eighteen edges are wall slot 0 / door flag 0. **There is no flag-2/flag-3 bash/pick/knock
edge anywhere on this route.**

`(14,5)` is the nearest of the three descriptor-124 cells: `(14,5)` = 19 steps, `(14,4)` = 20,
`(15,5)` = 20.

---

## 5. `(12,10)` is an articulation point — the beach fight is structurally forced

A plain BFS over the same decoded edge graph (`tools/find_geo_path.decode_edges`), rooted at the
byte-grounded spawn `(13,13)`:

| Blocked set | Cells reachable from `(13,13)` |
| --- | --- |
| `{}` | **70** |
| `{(12,10)}` | **28** |

Blocking the single descriptor-126 cell removes the lighthouse cells `(14,4)/(14,5)/(15,5)`, the
fortress-guard cells `(10,6)/(11,6)`, the fortress-interior cell `(7,11)` and the boat cell `(9,7)`
from the reachable set. `tools/find_geo_path.py --avoid-event-index 126` fails outright with
`target (14, 5) is not reachable from (13, 13)`.

So the walk cannot reach the lighthouse without stepping on the beach. This leg therefore proves
**two** encounter→combat→resume→persist cycles in one continuous route, because the map leaves no
alternative — not because two were cherry-picked. Golden test C asserts both BFS counts.

---

## 6. The two encounters, byte-exact

### 6a. `(12,10)` — beach scrags, arm 126 `@0x8B6E`

```
 2928 0x8B6E  COMPARE       [0x4C09],#1              0301094c0001
 2934 0x8B74  IF_EQ                                  16
 2935 0x8B75  EXIT                                   00            <-- silent-revisit exit
 2936 0x8B76  PRINTCLEAR    <inline 6-bit string, packedLen 0xA2>
 3101 0x8C1B  PICTURE       #41                      0e0029
 3104 0x8C1E  CALL          [0x0809]                 2d010908      (press-any-key host call)
 3108 0x8C22  CLEARMONSTERS                          1c
 3109 0x8C23  SETUP_MONSTER #255,#0,#255             0c00ff000000ff
 3116 0x8C2A  LOAD_MONSTER  #69,#3,#69               0b004500030045
 3123 0x8C31  COMBAT                                 24
 3124 0x8C32  SAVE          #1 -> [0x4C09]           09000101094c  <-- THE CONSUMED WORD
 3130 0x8C38  GOTO          0x83DD                   0101dd83      (CALL [0x2E10] ; EXIT)
```

Roster: `LOAD_MONSTER #69,#3,#69` → `{monsterId:69, count:3, picBlockId:69}` → `MON4CHA.DAX#69` =
**`SCRAG`** ×3.

Real VM effect stream at the combat pause:
`print → picture{id:41} → call → encounterSetup{spriteId:255,maxDistance:0,picId:255} → combat`.

Verbatim retail narration (decoded from the inline 6-bit packed string at `0x8B76`):

> `THREE TALL, FOUL-SMELLING CREATURES ARE KNEELING IN THE CENTER OF THIS BEACH, TEARING STRIPS OF MEAT FROM A SINGLE SMALL FISH THEY'VE CAUGHT. WHEN THEY SEE THE PARTY THEY CRY OUT IN HARSH, HIGH TONES AND THEN ATTACK!`

### 6b. `(14,5)` — the ruined lighthouse, arm 124 `@0x8978`

```
 2426 0x8978  COMPARE       [0x4C0B],#1              03010b4c0001
 2432 0x897E  IF_EQ                                  16
 2433 0x897F  EXIT                                   00            <-- silent-revisit exit
 2434 0x8980  PRINTCLEAR    <inline 6-bit string, packedLen 0x51>
 2518 0x89D4  PICTURE       #40                      0e0028
 2521 0x89D7  CALL          [0x0809]                 2d010908
 2525 0x89DB  CLEARMONSTERS                          1c
 2526 0x89DC  SETUP_MONSTER #255,#0,#255             0c00ff000000ff
 2533 0x89E3  LOAD_MONSTER  #70,#5,#70               0b004600050046
 2540 0x89EA  LOAD_MONSTER  #69,#1,#69               0b004500010045
 2547 0x89F1  COMBAT                                 24
 2548 0x89F2  SAVE          #1 -> [0x4C0B]           090001010b4c  <-- THE CONSUMED WORD
 2554 0x89F8  PRINTCLEAR    <empty>                  128000
 2557 0x89FB  SAVE          #0 -> [0x7F79]           09000001797f
 2563 0x8A01  GOSUB         0x8429                   02012984      (party-member name picker)
 2567 0x8A05  PRINT         <inline string, packedLen 0x7C>
 2694 0x8A84  CALL          [0x080C]                 2d010c08      (retail yes/no host handler)
 2698 0x8A88  IF_EQ                                  16
 2699 0x8A89  GOTO          0x83DD                   0101dd83      (NO -> tail, nothing written)
 2703 0x8A8D  SAVE          #1 -> [0x4C36]           09000101364c  <-- YES -> the light is doused
 2709 0x8A93  GOTO          0x83DD                   0101dd83
```

Roster:

| Instruction | Resolves to |
| --- | --- |
| `LOAD_MONSTER #70,#5,#70` | `{monsterId:70, count:5, picBlockId:70}` → `MON4CHA.DAX#70` = **`PIRATE`** ×5 |
| `LOAD_MONSTER #69,#1,#69` | `{monsterId:69, count:1, picBlockId:69}` → `MON4CHA.DAX#69` = **`SCRAG`** ×1 |

Real VM effect stream across the whole arm (asserted in the golden):

```
print → picture{id:40} → call → encounterSetup{spriteId:255,maxDistance:0,picId:255} → combat
  → print → print → print → call → call
```

Verbatim retail narration:

- Encounter (`0x8980`): `SEVERAL MEN ARE IN THE LIGHTHOUSE KEEPER'S QUARTERS, RUMMAGING THROUGH ITS CABINETS AND CHESTS. THEY ATTACK!`
- Post-combat (`0x8A05`, preceded by the `GOSUB 0x8429` party-member name — empty in a partyless
  headless run):
  `LOOKS AROUND THE RUINED LIGHTHOUSE AND SAYS, 'IF THOSE PIRATES WERE TENDING THE LIGHT, MAYBE WHOEVER PLANS TO USE IT IS AN ENEMY, NOT A FRIEND. SHOULD WE DOUSE IT?'`

`CALL [0x080C]`: per this repo's `EclCallHostResult` contract (`packages/engine/src/ecl/vm.ts`), the
native handler compares the choice index against 1, so answering with `{comparison:{left:0,right:1}}`
(index 0 = YES) makes `IF_EQ` at `0x8A88` fail and control falls into `0x8A8D`, writing
`[0x4C36] = 1`; `{left:1,right:1}` (index 1 = NO) takes `GOTO 0x83DD` and leaves `[0x4C36]` unwritten.
This is the same modelling the `early` leg used for the same host call.

---

## 7. Retail boot narration (verbatim, in order)

`initial_entry`'s own `PRINTCLEAR`/`PRINT` chain — this is the campaign's shipwreck.

**Placement caveat (added 2026-08-05):** calling the block "a genuine mid-campaign area" is
*inference*, not something the bytes carry. What IS byte-grounded, from cold-booting the ECL4
siblings, is the ordering: `#12` follows a sea voyage (`#8` ships-to-Tuern, `#10` arrival in
UTTERSEA) and precedes `#13` ("YOU PULL YOUR SMALL, BATTERED BOAT ONTO THE NARROW BEACH"), so it is
provably **not** the campaign start. Whether it is *middle* rather than *late* is not established
here.

1. `CRASH!!! A YARDARM FALLS TO THE DECK, INCHES FROM ` *(party-member name inserted here)*
2. `! YOU LOOK UP TO SEE HUGE TENTACLES WRAPPING THEMSELVES AROUND THE BOW. THE WHOLE SHIP GROANS AS A GIANT KRAKEN TIGHTENS ITS INEXORABLE GRIP!`
3. `MOMENTS LATER YOU'RE IN THE WATER AS THE SHIP DISINTEGRATES BENEATH THE TWISTING TENTACLES. 'SWIM AWAY FROM THE WRECK!' ` *(name)*
4. ` CALLS OUT. BONE-CHILLING SCREAMS REACH YOUR EARS, BUT YOU DON'T DARE LOOK BACK.`
5. `SOON THE TRAGEDY IS OVER, AND ALL YOU HEAR IS THE SPLASHING OF THE PARTY IN THE GENTLE SEAS. YOU PULL TOGETHER A MASS OF BOARDS AND BARRELS TO RIG A CRUDE RAFT, AND THE WAITING BEGINS. FOR 3 DAYS, NO TRACE OF SHIP OR LAND.`
6. `HUNGRY AND EXHAUSTED, YOU FINALLY SPOT A TINY ISLAND. PADDLING WITH YOUR LAST OUNCE OF STRENGTH, YOU PROPEL THE MAKESHIFT RAFT TO SHORE, WHERE IT IS DASHED TO BITS MOMENTS AFTER YOU CRAWL UP THE ROCKS TO SAFETY.`

---

## 8. The fourteen open-terrain steps carry a live wandering roll — disclosed, not hidden

Arm 1 `@0x8532`, the descriptor-1 handler that **fourteen** of this route's twenty walked cells
(the spawn plus nineteen steps) dispatch — corrected 2026-08-05: earlier drafts of this heading and
sentence said "eight" and "thirteen"; the golden's own assertion
(`expect(routeFloors.filter((f) => f === 0x01).length).toBe(14)`) and a recount of
`find_geo_path.py`'s `coordinates` array both give **14**:

```
 1332 0x8532  COMPARE   [0x4C0C],#5           03010c4c0005
 1338 0x8538  IF_GE                            1b
 1339 0x8539  EXIT                             00
 1340 0x853A  RANDOM    #100 -> [0x7F7F]       080064017f7f
 1346 0x8540  COMPARE   [0x7F7F],#3            03017f7f0003
 1352 0x8546  IF_GE                            1b
 1353 0x8547  EXIT                             00
 1354 0x8548  CLEARMONSTERS                    1c
 1355 0x8549  SAVE      #1 -> [0x4C17]         09000101174c
 ...
```

So every open cell rolls `RANDOM #100` and only proceeds when the result is `< 3` (a 3% wandering
encounter), capped at five per area by `[0x4C0C]`.

**What the golden actually claims about this:** at `seed 0x1234` every descriptor-1 step returns
`{kind:'end', text:''}`. That is an RNG outcome, not a structural silence. Golden test J proves the
arm is genuinely live by finding the first seed that trips it — **seed 2003 rolls 1 and produces
`{kind:'say'}` with the retail text `SCRAG ATTACK!` and `[0x4C17] = 1`.** (The engine's PRNG first
draw has period 4 over the seed: seeds ≡1,2,3,0 (mod 4) give 48, 73, 98, 23 — all ≥ 3 — which is why
no wandering fight fires anywhere in 1…2002.)

The two **scripted** encounters at `(12,10)` and `(14,5)` are not RNG-gated: they contain no
`RANDOM`, and they fire deterministically at every seed tested.

---

## 9. Persistence

### `[0x4C0B]` — the lighthouse consumed word

- Written `SAVE #1` at `0x89F2`, immediately after `COMBAT`, **unconditionally** and before the
  post-combat question. Victory, not the offer, is what consumes it.
- Guards its own encounter at `0x8978` (`COMPARE [0x4C0B],#1 ; IF_EQ ; EXIT`) — the silent legal
  revisit.
- **Also gates a different cell.** Arm 12 `@0x880F` (`COMPARE #1,[0x4C0B] ; IF_EQ ; EXIT`,
  `030001010b4c 16 00`) is the tower description at `(15,7)`, four steps back down the route.
  Run through the real VM:

  | `[0x4C0B]` | `(15,7)` result |
  | --- | --- |
  | 0 | `THE DELICATE TOWER OF A SMALL LIGHTHOUSE RISES TO THE NORTH. ITS POWERFUL LAMP IS VISIBLE, BURNING THROUGH A THIN MANTLE OF WHIRLING FOG.` |
  | 1 | `{kind:'end', text:''}` — silent |

  The lamp stops being described once the lighthouse has been cleared. This is in the *same block*,
  so — exactly as the `early` leg did with Krevish's house — it is recorded as corroboration, **not**
  claimed as the `quest` leg.

- **Honest limitation, stated up front:** `[0x4C0B]` is a *recycled per-area* DGROUP slot, not a
  globally unique world-state word. The corpus census finds **42 distinct operand sites** naming it
  across 12 blocks in all five archives (writers in `ECL2#2/#3/#4`, `ECL3#6/#15`, `ECL4#8/#10/#11/#12/#13`,
  `ECL5#17/#19`), and only one site anywhere writes it back to zero (`ECL3.DAX#15 @0x9C81`,
  `090000010b4c`). Within `ECL4.DAX#12` it has exactly **one** writer (`0x89F2`) and two readers
  (`0x8978`, `0x880F`). Whether the retail engine keeps these per-area slots separate across area
  transitions cannot be settled from static bytes and is **not** claimed here.

### `[0x4C09]` — the beach consumed word

Same shape: `SAVE #1` at `0x8C32` right after `COMBAT`, guarded by `COMPARE [0x4C09],#1 ; IF_EQ ; EXIT`
at `0x8B6E`. Same recycling caveat — 28 distinct sites across 11 blocks corpus-wide; one writer and
one reader inside `ECL4.DAX#12`.

### `[0x4C36]` — corpus-unique doused-light flag

The census finds exactly **two** sites for `[0x4C36]` in the entire five-archive corpus:

| Kind | Site | Bytes |
| --- | --- | --- |
| WRITE | `ECL4.DAX#12 @0x8A8D  SAVE #1 -> [0x4C36]` | `09000101364c` |
| read | `ECL4.DAX#13 @0x9295  SUBTRACT [0x4C36],[0x7F79] -> [0x7F79]` | `0501364c01797f01797f` |

So this route's post-combat YES answer sets a flag whose only other appearance anywhere is a read
**in a different block** (`ECL4.DAX#13`, the neighbouring island). That is a genuine cross-block
world-state word.

**It is deliberately NOT claimed as Gateway's `quest` leg here.** The `ECL4#13` site was found by a
static header-rooted CFG walk; no concrete cell/route into it was proven, and the surrounding
subroutine's own entry point was not pinned. It is recorded as a concrete, byte-addressed lead for
whoever takes the `quest` leg, nothing more.

### Save-file byte offsets

**Not proven, deliberately not published.** The single known Gateway ECL-word→save-offset datapoint
in this repo is `[0x4C6C]` → `SAVGAMA.DAT` offset `0x02D9`
(`gateway-sundabar-native-evidence.json`, 2026-07-29 native capture). Extrapolating a constant delta
from one sample is inference, not evidence; confirming it needs a native save capture, which is out
of scope for a static pass. No save offset is cited for `[0x4C09]`, `[0x4C0B]` or `[0x4C36]`.

---

## 10. Candidates considered and rejected

| Candidate | Verdict |
| --- | --- |
| `ECL3.DAX#5` (Everlund) descriptor 121 `@(5,13)` — the chained-old-man / Amanitas rescue | **Rejected.** Its post-combat writes include `[0x4C21]`, whose only corpus-wide writer is `ECL3.DAX#5 @0x9026` and which is *read* by `ECL2.DAX#1`'s already-claimed `early` arm. That is textbook `quest`-leg material and belongs to another agent's leg; taking it here would collide. |
| Any `ECL3.DAX` block (5/6/7/9/14/15) | **Rejected as a spawn source.** None of the six writes `[0xC04B]/[0xC04C]/[0xC04D]` on a cold `initial_entry` run (verified: all six exit with those three words undefined), so no spawn could be grounded in the block's own bytes — the matrix's requirement. Only `ECL4#8/#10/#11/#12/#13`, `ECL2#1/#2/#82`, `ECL5#16/#17/#19` and `ECL6#20` do. |
| `ECL4.DAX#8` (Luskan), spawn `(15,15)` | **Rejected.** Its one-shot room encounters (descriptors 121-127) re-print their flavour text on a *consumed* revisit (e.g. `(3,10)` still prints `THIS ABANDONED PIER IS PERMEATED BY THE SMELL OF DECAYING FISH.`), so "silent legal revisit" would have been a weaker claim. Its 116-120 arms also pause a second time post-combat (`done=false`) on an item hand-off. |
| `ECL4.DAX#10` (Uttersea) / `ECL4.DAX#11` (*labelled* "Gundarlun" here, but that name is **unsourced** — this block emits no print effects at all on a cold `initial_entry`, so the label is not byte-grounded; flagged 2026-08-05) / `ECL4.DAX#13` | **Valid but not used.** All three have byte-grounded spawns and clean one-shot encounters. `#12` was chosen because it is the smallest block (3464 bytes, fully disassembled here), its whole descriptor set fits the two live dispatch ranges, its consumed word additionally gates a *second* cell, and it is the only one of the five whose post-combat branch writes a corpus-unique word. `#13` is deliberately left alone since it holds the only read of `[0x4C36]`. |
| `ECL4.DAX#12` descriptor 125 `(10,6)…` or 127 `(7,11)…` | **Valid but not used.** Both are reachable and both consume a word (`[0x4C0A]`, `[0x4C08]`). Descriptor 124 was chosen for the corpus-unique `[0x4C36]` follow-on and because `(14,5)` is the shortest of the four. |
| Making `(12,10)` the *only* target (10 steps) | **Rejected.** It is a legal, shorter route, but the beach cell is an articulation point (§5), so the longer route proves strictly more — two forced cycles — for nine extra steps. |
| `&0x3F` descriptor mask | **Rejected, and here it is discriminating.** The script masks with `AND #127` at `0x8321`. 18 of 256 descriptor bytes differ between the masks, and under `&0x3F` *both* of this route's encounters go silent (golden test I). |
| `ECL_GEN1_SHORT` (DoK's table) / `ECL_GEN1_SHORT_TREASURES` | **Rejected, and here the choice is discriminating.** Both desync at `0x0C SETUP_MONSTER` (4-operand framing) and degrade both encounter cells to `{kind:'end'}` with `monsters: null`. `ECL_GEN1_SHORT_GATEWAY` is the title's declared dialect and its 3-operand framing is what makes `0c00ff000000ff` at `0x89DC`/`0x8C23` frame correctly ahead of `LOAD_MONSTER`. |
| plain long `ECL_GEN1` | **Rejected as the dialect to pass, but NOT discriminating on this block** (row split and corrected 2026-08-05 after a reviewer re-measured it). Re-running both encounter cells under plain `ECL_GEN1` gives results *identical* to `ECL_GEN1_SHORT_GATEWAY` — same `kind: 'combat'`, same text, same `pictureId` 41/40, same rosters — because `0x0C` already defaults to 3 operands in the long table. Passing the Gateway dialect explicitly is correct hygiene and does protect against the `SHORT` family above, but this route alone does not prove the Gateway split. |
| `chooseStart` heuristic for the spawn | **Rejected as a source.** The spawn used here is the block's own `SAVE`s at `0x804F/0x8055/0x805B`. |
| Claiming this leg as `quest` as well | **Rejected.** §9's `ECL4#13` read is a static lead, not a proven route; and §9's `(15,7)` reader is in the same block. |

### A correction this round produced

An earlier pass in this session mis-indexed the `0x8335` `ON_GOTO` operand list by one and reported
that cell `(14,6)` (descriptor 13) was gated on `[0x4C0B]`. It is not: descriptor 13 dispatches
`0x8882`, which is gated on **facing** (`COMPARE [0xC04D],#0 ; IF_NE ; EXIT`, `03014dc00000 17 00`)
— the text only appears when the party faces north. The `[0x4C0B]`-gated cell is `(15,7)`,
descriptor 12, arm target `0x880F`. Both facts were then re-verified through the real VM (golden
test H) rather than left as disassembly reading.

---

## 11. Honest boundaries

- **No native/DOSBox evidence.** Everything here is static retail bytes plus this repo's own
  `EclVm`. The matrix's `proven` status explicitly does not require native capture or live browser
  wiring; this leg uses that allowance and says so.
- **How the party *arrives* in `ECL4.DAX#12` is not proven.** The spawn is grounded in the block's
  own `initial_entry`, which is what the matrix asks for, but the transition from whatever area
  precedes it was not traced. Same boundary as the `early` leg.
- **Party-model dependency.** The post-combat line at `0x8A05` is prefixed by a party-member name
  supplied by `GOSUB 0x8429`; a partyless headless run yields an empty prefix. This does not affect
  the consumed-state proof — `0x89F2` runs before `0x8A01`.
- **`[0x4C0B]`/`[0x4C09]` are recycled per-area slots** (§9). Their *within-block* one-shot behaviour
  is proven; cross-area independence is not.
- **The `ECL4#13` read of `[0x4C36]`** is a static operand match on a header-reachable instruction,
  not a proven executable route (§9).
- **The wandering roll at descriptor-1 cells is real** (§8); the walk's silence there is an RNG
  outcome at the documented seed, not a structural guarantee.
- **Not wired into the browser.** No `?explore=` route was added; this is an engine-level proof.

---

## 12. Reproduction

```powershell
pnpm --filter @goldbox/engine test     # includes packages/engine/test/gatewayMiddleRoute.test.ts
python tools/find_geo_path.py --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO4.DAX" `
    --block 12 --start 13,13 --target 14,5 --facing north
python tools/find_geo_path.py --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO4.DAX" `
    --block 12 --start 13,13 --target 14,5 --facing north --avoid-event-index 126   # fails: unreachable
```
