# Gateway to the Savage Frontier — QUEST leg: `[0x4C21]` "Amanitas rescued" (2026-08-05)

**Status: PROVEN, engine-level, from static retail bytes only.** No DOSBox-X session, no emulator,
no native capture was used or is claimed. Engine golden:
`packages/engine/test/gatewayQuestFlag.test.ts`, every test reading the real retail files, guarded
by `describe.skipIf(!haveRetail)` at the suite level plus one `it.skipIf` for the `MONnCHA.DAX`
archives (corrected 2026-08-05: this line previously said "`it.skipIf` guarded", which did not match
the code).

This closes the `quest` leg of `tools/goldbox_campaign_matrix.json`'s six-leg matrix for
`gateway-to-the-savage-frontier`. It is a **cross-archive** dependency: the flag is written by
`ECL3.DAX#5` (Everlund — byte-supported: the block's own retail text names itself, "A BRASS PLATE ON
THE WALL HERE READS: EVERLUND TOWN HALL" at (6,8) and "YOU STEP INSIDE THE ANCIENT CITY GATES OF
EVERLUND" at (8,15)) and read by `ECL2.DAX#1` (Yartar), `ECL2.DAX#4` (**inferred** to be the Kraken
base under Yartar — this label is inference from surrounding fiction, not verified from that block's
own bytes) and `ECL3.DAX#14` (Secomber). It is not a fight, not a same-block consumed bit, and not
scratch-memory reuse — §3 proves the write set is a single instruction in the entire five-archive
corpus, and §5/§6 show the consumer's available content genuinely changes.

---

## 0. Files, dialect, addressing

Install: `C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/`

| File | What was read | Verified |
| --- | --- | --- |
| `ECL3.DAX` block 5 | decompressed 5690 bytes — Everlund | `tools/goldbox_corpus.read_dax_blocks`; ECL3 blocks present are 5/6/7/9/14/15 |
| `GEO3.DAX` block 5 | 1026 bytes, 16×16 | same blocks as ECL3 |
| `ECL2.DAX` block 1 | decompressed 7578 bytes — Yartar | blocks present are 1/2/3/4/82 |
| `GEO2.DAX` block 1 | 1026 bytes, 16×16 | blocks present are 1/2/3/4 |
| `MON3CHA.DAX` | 13 records × 422 bytes | names via the engine's own `decodeMonsterArchive(…, 'gateway-to-the-savage-frontier')` |
| `MON2CHA.DAX` | 15 records × 422 bytes | same |

Dialect: **`ECL_GEN1_SHORT_GATEWAY`** (`packages/engine/src/ecl/disassemble.ts`) —
`wordSetOverrides {0x1d: 0, 0x22: 0, 0x2c: 1}`, `headerLen 22`, `vbase 0x7FFE`, `hasMagic`, and
**no `cellDescAddr` override**, so the per-cell descriptor comes from `[0xC04F]`.

Addressing: address addend `0x8000`; file offset = `vaddr - 0x8000 + 2`.

`ECL3.DAX#5` header, raw bytes `88 13 | 01 01 89 81 | 01 01 7c 80 | 01 01 db 82 | 01 01 48 83 | 01 01 14 80`:

| Slot | Value |
| --- | --- |
| magic | `0x1388` |
| `vm_run_1` | `0x8189` |
| `search_location` | `0x807C` |
| `pre_camp_check` | `0x82DB` |
| `camp_interrupted` | `0x8348` |
| `ecl_initial_entry` | `0x8014` |

`ECL2.DAX#1`'s header is already published in
`docs/engine/research/gateway-ecl2-1-yartar-early-route.md` §0 and is not restated here.

---

## 1. The claim in one line

`ECL3.DAX#5` (Everlund's undercity, `GEO3.DAX#5` cell `(5,13)`) executes
`SAVE #1 -> [0x4C21]` after the Amanitas rescue combat. Afterwards, `GEO2.DAX#1` cell `(14,2)` in
**Yartar** — a different town, in a different ECL/GEO archive pair, reached only by leaving Everlund
for the `ECL6#21` overland and walking back in — stops being a tavern and becomes a
**KRAKEN SPY ×6 ambush**.

---

## 2. The setter — `ECL3.DAX#5`, descriptor 121, byte-exact

### 2a. Dispatch

`search_location @0x807C`:

```
0x807C (126) 09 01 02 4c 01 01 4c          SAVE [0x4C02] -> [0x4C01]
0x8083 (133) 2f 00 7f 01 4f c0 01 02 4c    AND #127,[0xC04F],[0x4C02]     <-- THE MASK IS &0x7F
0x808C (142) 02 01 0b 95                   GOSUB 0x950B
0x8090 (146) 03 01 02 4c 00 76             COMPARE [0x4C02],#118
0x8096 (152) 1b                            IF_GE
0x8097 (153) 01 01 e9 80                   GOTO 0x80E9
0x809B (157) 25 ... #24 ...                ON_GOTO [0x4C02],#24,<24 targets>    (descriptors 0..23)
0x80E9 (235) 05 00 76 01 02 4c 01 79 7f    SUBTRACT #118,[0x4C02],[0x7F79]
0x80F2 (244) 25 01 79 7f 00 0a
             01 8e 8c | 01 f3 8c | 01 70 8d | 01 3b 8e | 01 71 92 | 01 34 93
             | 01 b6 93 | 01 d8 93 | 01 34 94 | 01 6c 94
                                           ON_GOTO [0x7F79],#10,…            (descriptors 118..127)
```

Descriptor **121** → second table, index `121 - 118 = 3` → operand bytes `01 3b 8e` → **`0x8E3B`**.

### 2b. The rescue arm `@0x8E3B`

```
0x8E3B (3645) 03 01 32 4c 00 01   COMPARE [0x4C32],#1
0x8E41 (3651) 16                  IF_EQ
0x8E42 (3652) 00                  EXIT                       <-- silent-revisit exit
0x8E43 (3653) 12 80 9e …          PRINTCLEAR (packedLen 0x9E)
0x8EE4 (3814) 0e 00 15            PICTURE #21
0x8EE7 (3817) 2d 01 09 08         CALL [0x0809]               (retail "press a key")
0x8EEB (3821) 1c                  CLEARMONSTERS
0x8EEC (3822) 27 00 00 00 00 00 00 00 00 00 00 00 01 00 ff   TREASURE (jewelry 1)
0x8EFD (3839) 0c 00 ff 00 01 00 ff  SETUP_MONSTER #255,#1,#255
0x8F04 (3846) 0b 00 04 00 02 00 04  LOAD_MONSTER #4,#2,#4
0x8F0B (3853) 0b 00 17 00 02 00 17  LOAD_MONSTER #23,#2,#23
0x8F12 (3860) 24                  COMBAT
0x8F13 (3861) 09 00 01 01 32 4c   SAVE #1 -> [0x4C32]         (this fight's own consumed bit)
0x8F19 (3867) 0e 00 26            PICTURE #38
0x8F1C (3870) 02 01 01 92         GOSUB 0x9201                ("is EREK in the party" name scan)
0x8F20 (3874) 17                  IF_NE
0x8F21 (3875) 01 01 8c 8f         GOTO 0x8F8C
0x8F25 (3879) 12 80 60 …          PRINTCLEAR  "EREK RUSHES TO THE OLD MAN AND EMBRACES HIM. …"
0x8F88 (3978) 2d 01 09 08         CALL [0x0809]
0x8F8C (3982) 12 80 97 …          PRINTCLEAR  "'WELL, WELL, WELL,' … JOURNAL ENTRY #29."
0x9026 (4136) 09 00 01 01 21 4c   SAVE #1 -> [0x4C21]         <-- THE QUEST FLAG
0x902C (4142) 2d 01 09 08         CALL [0x0809]
0x9030 (4146) 0e 00 7d            PICTURE #125
0x9033 (4149) 12 80 9d …          PRINTCLEAR  "AMANITAS REACHES DEEP WITHIN HIS ROBES …"
0x90D3 (4309) 2d 01 09 08         CALL [0x0809]
0x90D7 (4313) 3d                  CLEAR_BOX
0x90D8 (4314) 02 01 01 92         GOSUB 0x9201
0x90DC (4318) 17 01 01 4e 91      IF_NE ; GOTO 0x914E
0x914E (4432) 0e 00 26            PICTURE #38
0x9151 (4435) 12 80 a5 …          PRINTCLEAR  "'GO NOW,' SAYS AMANITAS. … YARTAR SHOULD BE YOUR
                                              FIRST DESTINATION--WE KNOW THE KRAKEN HAVE A BASE
                                              THERE. …"
0x91F9 (4603) 2d 01 09 08         CALL [0x0809]
0x91FD (4607) 01 01 13 82         GOTO 0x8213    (CALL [0x2E10] ; EXIT)
```

**The `[0x4C21]` write is unconditional given a victory.** `0x8F8C`'s PRINTCLEAR carries
`packedLen 0x97 = 151`, so `3982 + 3 + 151 = 4136 = 0x9026`: the flag write is literally the next
instruction after the "'WELL, WELL, WELL,'" text, on the path both branches of the EREK party scan
converge on. A partyless engine run reaches it (golden test D).

**Roster, decoded from the real `MON3CHA.DAX`:**

| Instruction | Resolves to |
| --- | --- |
| `LOAD_MONSTER #4,#2,#4` | `MON3CHA.DAX#4` = **`ZHENTIL FIGHTER`** ×2 |
| `LOAD_MONSTER #23,#2,#23` | `MON3CHA.DAX#23` = **`OWLBEAR`** ×2 |

which matches the arm's own narration verbatim:

> `ON THE FAR SIDE OF THE ROOM AN OLD MAN STANDS CHAINED TO THE WALL, A DROOLING OWLBEAR FACING HIM ON EITHER SIDE. TWO MEN WATCH, AND ONE OF THEM IS SAYING '...HIM TRY TO CAST A SPELL--THEY'LL TEAR HIS ARMS OFF!'`

### 2c. GEO ground truth for the setter cell

`GEO3.DAX#5` descriptor plane `raw[514:770]`, index `y*16 + x`, mask **`&0x7F`** (the script's own
`AND #127` at `0x8083`). Cells whose `(raw & 0x7F) == 121`: exactly **one**, `(5,13)`, raw floor
byte **`0xF9`**.

**Here the mask is genuinely discriminating** (unlike the early leg, where it was not): `0xF9 & 0x3F`
is `57`, not `121`. Golden test K feeds the VM a synthetic floor byte `0x39` (masked 57 either way)
and the same block returns `{kind:'end', text:''}` — no encounter, no flag write. `&0x7F` is
load-bearing, and it is the script's own mask.

### 2d. Reachability of the setter cell

`ECL3.DAX#5`'s own `initial_entry` re-entry arm `[0x4BF2]==21` (arriving from the ECL6#21 overland)
spawns the party at `0x8121 SAVE #0 -> [0xC04D]`, `0x8127 SAVE #15 -> [0xC04C]`,
`0x812D SAVE #8 -> [0xC04B]` — `(8,15)` facing north. Verified by running `initial_entry` in the
real `EclVm` (golden test D emits `loadFiles{geoBlockId: 5}` and lands `(8,15,north)`).

```
python tools/find_geo_path.py --geo "<install>/GEO3.DAX" --block 5 \
    --start 8,15 --target 5,13 --facing north --event-mask 127
```

`step_count 29`, `blocked_cell_count 0`, `required_interactions []` — **no** door-flag-2/3
bash/pick/knock edge anywhere. Directions:
`north ×7, west ×3, north, west, north, west ×4, south ×7, east ×5`.
Seven edges carry **door flag 1 (automatic)** — six reported as `automatic-door`, one on a
wall-slot-0 edge that the tool classifies as `none`. **No flag-2/flag-3 edge anywhere.**

All 29 intermediate cells were executed through the real VM (`dialogueForCell`, Gateway dialect).
Two are themselves combats — `(0,7)` descriptor 123 `OWLBEAR ×3`, `(1,13)` descriptor 122
`OWLBEAR ×2 + ZHENTIL FIGHTER ×1` — and the rest are silent or pure sign text (Everlund's bridge,
boat rentals, the Inn of the Well-Marked Path, the town hall, the stable). None of them writes
`[0x4C21]`, and none blocks. This walk is **reported, not asserted in the golden**: it is the
`middle`-leg's territory, and the quest claim does not rest on it.

---

## 3. The write set — exhaustive, two independent methods

### 3a. Stack-aware CFG census

A stack-aware CFG walk from all five header entries of **every** `0x1388`-magic block of
`ECL2/3/4/5/6.DAX` (26 blocks: ECL2#1/2/3/4/82, ECL3#5/6/7/9/14/15, ECL4#8/10/11/12/13,
ECL5#16/17/18/19/98/99, ECL6#20/21/27/28), decoding with `ECL_GEN1_SHORT_GATEWAY`'s word sets,
classifying every operand of every decodable instruction as a WRITE (the opcode's destination slot,
for `SAVE`/`ADD`/`SUBTRACT`/`DIVIDE`/`MULTIPLY`/`RANDOM`/`AND`/`OR`/`GETTABLE`/`INPUT_*`) or a read.
No block hit the state cap; no block failed to decode.

Result for `[0x4C21]`:

| Kind | Sites |
| --- | --- |
| **write** | **exactly one — `ECL3.DAX#5 @0x9026`** |
| gating read (`COMPARE` arg 0) | `ECL2.DAX#1` `0x845E`, `0x8629`, `0x863F`, `0x8665`, `0x867B`, `0x8C97`, `0x917D`, `0x9378`; `ECL2.DAX#4` `0x96FB`, `0x992F`; `ECL3.DAX#14` `0x85B9` |
| other read | none |

### 3b. Raw byte scan (no control-flow modelling at all)

The Gen1 operand encoding for the word `[0x4C21]` is the three bytes `01 21 4c`. Searching every
decompressed block of all five archives for that literal sequence finds **exactly 12** occurrences —
the same 12 sites, at the same offsets — of which exactly one is preceded by `09 00 01`
(`SAVE #1 -> …`) and eleven by `03` (`COMPARE`, argument 0):

```
ECL2.DAX#1  off 1121 → 0x845E   03 01 21 4c 00 00
ECL2.DAX#1  off 1580 → 0x8629   03 01 21 4c 00 01
ECL2.DAX#1  off 1602 → 0x863F   03 01 21 4c 00 00
ECL2.DAX#1  off 1640 → 0x8665   03 01 21 4c 00 01
ECL2.DAX#1  off 1662 → 0x867B   03 01 21 4c 00 00
ECL2.DAX#1  off 3226 → 0x8C97   03 01 21 4c 00 00
ECL2.DAX#1  off 4480 → 0x917D   03 01 21 4c 00 00
ECL2.DAX#1  off 4987 → 0x9378   03 01 21 4c 00 00
ECL2.DAX#4  off 5886 → 0x96FB   03 01 21 4c 00 01
ECL2.DAX#4  off 6450 → 0x992F   03 01 21 4c 00 01
ECL3.DAX#5  off 4139 → 0x9026   09 00 01 01 21 4c   <-- the only write
ECL3.DAX#14 off 1468 → 0x85B9   03 01 21 4c 00 00
```

The two methods agree exactly, so the CFG walk did not prune a reachable site and the byte scan did
not invent one. Golden test B asserts the byte scan (it needs no control-flow model to be true):
one write, eleven `COMPARE` reads, zero references of any other kind; **ten of the eleven reads are
in a different archive** from the writer, the eleventh (`ECL3.DAX#14`, Secomber) in a different
block of the same archive.

---

## 4. The consumer cell — `GEO2.DAX#1 (14,2)`, `ECL2.DAX#1` ON_GOTO arm 30

`ECL2.DAX#1`'s `search_location` masks with `AND #127` at `0x82AD` and dispatches
`ON_GOTO [0x4C02],#41,…` at `0x82C2` (operand list at file offset 714 + 3·i). Arm **30**'s operand
bytes are at offset `714 + 90 = 804` and read `01 7d 91` → **`0x917D`**.

`GEO2.DAX#1` cells whose `(raw & 0x7F) == 30`: exactly **one**, `(14,2)`, raw floor byte **`0x9E`**.
(Here `&0x3F` and `&0x7F` agree — `0x9E & 0x3F == 30` too — so the mask is *not* discriminating on
this particular cell; `&0x7F` is used because it is the script's own mask.)

The adjacent cell `(13,2)`, raw `0x1D`, masked 29 → arm 29 `@0x9122`, is the sign:
`A BRIGHT, MULTICOLORED BANNER FLIES OVER THIS DOOR. ON IT ARE STITCHED THE WORDS: THREE RIVERS FESTHALL`.
Calling `(14,2)` "the Three Rivers Festhall interior" is therefore an **inference from map
adjacency** — arm 30 itself never names the building. It is labelled as inference everywhere below.

---

## 5. The fork — byte-exact

```
0x917D (4479) 03 01 21 4c 00 00   COMPARE [0x4C21],#0
0x9183 (4485) 16                  IF_EQ
0x9184 (4486) 01 01 d2 89         GOTO 0x89D2        <-- FLAG CLEAR: fall into arm 5's tavern
0x9188 (4490) 03 01 03 4c 00 01   COMPARE [0x4C03],#1
0x918E (4496) 16                  IF_EQ
0x918F (4497) 00                  EXIT               <-- already-fought exit
0x9190 (4498) 12 80 0f …          PRINTCLEAR "KRAKEN SPIES ATTACK!"
0x91A2 (4516) 0e 00 0e            PICTURE #14
0x91A5 (4519) 2d 01 09 08         CALL [0x0809]
0x91A9 (4523) 1c                  CLEARMONSTERS
0x91AA (4524) 0c 00 ff 00 00 00 ff  SETUP_MONSTER #255,#0,#255
0x91B1 (4531) 0b 00 00 00 06 00 00  LOAD_MONSTER #0,#6,#0
0x91B8 (4538) 24                  COMBAT
0x91B9 (4539) 09 00 01 01 03 4c   SAVE #1 -> [0x4C03]   <-- the encounter's consumed bit
0x91BF (4545) 01 01 6c 9a         GOTO 0x9A6C           (CALL [0x2E10] ; EXIT)
```

`GOTO 0x89D2` lands in **arm 5**'s body — the shared tavern handler, also reached from
`GEO2.DAX#1 (1,6)`:

```
0x89D2 (2516) 09 00 08 01 e1 7e   SAVE #8 -> [0x7EE1]
0x89D8 (2522) 0e 00 06            PICTURE #6
0x89E1 (2531) 12 80 0c …          PRINTCLEAR "'WHAT'LL IT BE?'"
0x89F0 (2546) 2b 01 79 7f 00 02 … HORIZONTAL_MENU [0x7F79],#2,"FIGHT","LEAVE"
0x8A02 (2564) 25 01 79 7f 00 02 01 0e 8a 01 71 9a   ON_GOTO [0x7F79],#2,0x8A0E,0x9A71
```

**Roster, decoded from the real `MON2CHA.DAX`:** `LOAD_MONSTER #0,#6,#0` →
`MON2CHA.DAX#0` = **`KRAKEN SPY`** ×6 — matching the arm's own retail line `KRAKEN SPIES ATTACK!`
and Amanitas's own briefing, *"WE KNOW THE KRAKEN HAVE A BASE THERE"*.

### What the real VM actually produces at `(14,2)`

| `[0x4C21]` | Turn from `dialogueForCell(ECL2#1, 0x9E, …)` |
| --- | --- |
| **0 / unset** | `{kind:'say', text:"'WHAT'LL IT BE?'", choices:['FIGHT','LEAVE'], awaiting:'menu', pictureId:6}`; `[0x4C03]` untouched |
| **1** | `{kind:'combat', text:'KRAKEN SPIES ATTACK!', monsters:[{monsterId:0,count:6,picBlockId:0}], setup:{spriteId:255,maxDistance:0,picId:255}, pictureId:14}` |

Effect stream in the flag-set case, in script order:
`print → picture → call → encounterSetup → combat`.
After `afterCombat('victory')`: `{kind:'end', text:''}`, `runner.isDone()`, and `[0x4C03] = 1`.

This is the required **positive golden plus flag-clear negative control**: the same retail cell,
the same block, the same dialect, the same seed — one flag word decides between a menu turn and a
combat turn.

---

## 6. Reachability of the consumer in the quest state

The quest state is: the party rescued Amanitas in Everlund, left to the overland (`ECL6#21`) and
walked back into Yartar. `ECL2.DAX#1`'s `initial_entry` handles exactly that:

```
0x8065 (103) 03 01 f2 4b 00 15   COMPARE [0x4BF2],#21
0x806B (109) 16                  IF_EQ
0x806C (110) 01 01 50 83         GOTO 0x8350
0x8350 (850) 03 00 01 01 f5 4c   COMPARE #1,[0x4CF5]      ([0x4CF5]=0 on this path: no rented boat)
0x835B (861) 09 01 b2 03 01 4d c0  SAVE [0x03B2] -> [0xC04D]   (host-carried entry facing)
0x8372 (884) 03 01 4d c0 00 02   COMPARE [0xC04D],#2
0x8378 (890) 16                  IF_EQ
0x8379 (891) 01 01 8d 83         GOTO 0x838D
0x838D (911) 09 00 00 01 4c c0   SAVE #0  -> [0xC04C]     Y = 0
0x8393 (917) 09 00 0b 01 4b c0   SAVE #11 -> [0xC04B]     X = 11
```

so entering Yartar from the north (`[0x03B2] = 2`) spawns the party at **`(11,0)` facing south** —
all four wilderness-entry arms are byte-grounded in this block's own `initial_entry`:
`0x83AD/0x83B3` → `(8,15)`, `0x839D/0x83A3` → `(0,7)`, `0x838D/0x8393` → `(11,0)`,
`0x837D/0x8383` → `(15,5)`, plus `0x83F4/0x83FA` → `(9,4)` when `[0x4CF5]==1`.

```
python tools/find_geo_path.py --geo "<install>/GEO2.DAX" --block 1 \
    --start 11,0 --target 14,2 --facing north --event-mask 127
```

`step_count 5`, `final_facing east`, `blocked_cell_count 0`, `required_interactions []`.
Directions: **south, south, east, east, east**.
DOS keys: `{RIGHT}{RIGHT}{UP}{UP}{LEFT}{UP}{UP}{UP}`
One door edge — `(13,2) east -> (14,2)`, wall slot 1, **door flag 1 (automatic)**. The other four
edges are wall slot 0 / door flag 0. **No flag-2/flag-3 bash/pick/knock edge on this route.**

Every intermediate cell run through the real VM, on the memory the setter actually left behind:

| Step | Cell | raw | `&0x7F` | Arm | Result with `[0x4C21]=1` | Result with `[0x4C21]=0` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `(11,1)` | `0x00` | 0 | `0x8404` | `{end, ''}` (step counter 0→1) | `{end, ''}` |
| 2 | `(11,2)` | `0x27` | 39 | `0x9378` | **`{end, ''}` — silenced** | **thug-rescue combat, `BANDIT ×5`** |
| 3 | `(12,2)` | `0x00` | 0 | `0x8404` | `{end, ''}` (1→2) | `{end, ''}` |
| 4 | `(13,2)` | `0x1D` | 29 | `0x9122` | the Festhall sign text | identical |
| 5 | `(14,2)` | `0x9E` | 30 | `0x917D` | **`KRAKEN SPY ×6` combat** | **`'WHAT'LL IT BE?'` menu** |

The wandering-monster tail of arm 0 (`0x8429`, gated on `[0x4C00] > 5`) is **not** reached on this
route: `initial_entry`'s `0x801A SAVE #0 -> [0x4C00]` leaves the counter at 0 and only two
descriptor-0 cells are crossed, so `[0x4C00]` ends at 2. That removes the `RANDOM #100` at `0x843C`
from the route entirely, which is why this walk is seed-independent (checked: identical with seeds
`0x1234` and `0x5678`).

For completeness, `(14,2)` is also reachable from the block's **cold-boot** spawn `(1,10)` (the
early leg's byte-grounded `0x807A/0x8080/0x8086`): `step_count 23`, `blocked_cell_count 0`,
`required_interactions []`, three automatic doors. That longer route also necessarily passes
`(11,2)` — descriptor 39 is the only way into the row-2 corridor, confirmed by
`--avoid-event-index 39` reporting *"target (14,2) is not reachable from (1,10)"*.

---

## 7. Persistence

| Word | Role | Writers, whole ECL corpus |
| --- | --- | --- |
| `[0x4C21]` | the quest flag | **one**: `ECL3.DAX#5 @0x9026` |
| `[0x4C32]` | the Amanitas fight's own consumed bit | `ECL3.DAX#5 @0x8F13` (plus in-block re-reads) |
| `[0x4C03]` | the Kraken ambush's consumed bit — **and shared per-area scratch** | `ECL2#1 @0x91B9`, `ECL2#2 @0x8E6A`, `ECL3#5 @0x848F`, `ECL3#14 @0x9136`, `ECL4#11 @0x8349/@0x83DE/@0x8444`, `ECL5#16 @0x8626`, `ECL5#17 @0x92DA`, `ECL5#19 @0x82B4/@0x8CAF` |

- **Consumed-word transition (positive golden):** `[0x4C03]` is unset at the ambush's combat pause
  and becomes `1` after `afterCombat('victory')` — `SAVE #1 -> [0x4C03]` at `0x91B9`, immediately
  after `COMBAT`, unconditional.
- **Silent legal revisit:** re-dispatching `(14,2)` on the same memory yields
  `{kind:'end', text:''}` — `0x9188`'s `COMPARE [0x4C03],#1` now passes and `0x918F` EXITs before
  any PRINTCLEAR. `[0x4C21]` stays 1 and `[0x4C03]` stays 1.
- **The quest flag is never cleared:** it has no other writer at all (§3), so once Amanitas is
  rescued Yartar keeps its Kraken content for the rest of the campaign.

### Honest hazard: `[0x4C03]` is not a private word

`[0x4C03]` is reused as an area-local wandering-encounter counter by eight other blocks. In
`ECL3.DAX#5` specifically, `0x848F ADD #1,[0x4C03],[0x4C03]` increments it on Everlund's own
street cells (descriptor 2, behind `RANDOM #100 < 3`). Because `0x9188` tests **equality with 1**,
a party that happened to trigger exactly one Everlund street ambush and carried `[0x4C03] == 1`
into Yartar would find the Festhall ambush suppressed; `[0x4C03]` of 0 or 2..5 would not suppress
it. Whether the retail engine zeroes this range on an area change is **NOT proven here** — the
golden discloses the behaviour instead of hiding it (test J asserts that `[0x4C03] = 1` alone
silences the cell even with `[0x4C21] = 1`). The quest claim does not depend on it: the load-bearing
fork is `0x917D`'s `[0x4C21]` test, which runs *before* `0x9188`.

The end-to-end golden (test G) carries the setter's real memory map into the consumer block and
asserts `[0x4C03]` is still unset there, because on the seed used the Everlund street rolls did not
fire. That is stated as an observed outcome of a seeded run, not as a guarantee.

---

## 8. Three further consumers (corroboration, all cross-block)

Each was run through the real VM at `[0x4C21] = 0` and `= 1`.

1. **`ECL2.DAX#1` arm 39 `@0x9378` — the early leg's own thug rescue.**
   `COMPARE [0x4C21],#0 ; IF_NE ; EXIT`. Once Amanitas is rescued the Yartar thug encounter
   (`BANDIT ×5`, the scene that introduces `KREVISH`) is permanently switched off. Asserted in the
   golden (test H) at cell `(11,2)`.
2. **`ECL2.DAX#1` arm 14 `@0x8C50` — the Waterbaron.** Cells `(10,7)` and `(10,8)`:
   `THE WATERBARON GREETS YOU, AND YOU RECORD YOUR CONVERSATION AS JOURNAL ENTRY #9.` when the flag
   is clear, `… AS JOURNAL ENTRY #32.` when it is set (`0x8C97 COMPARE [0x4C21],#0 ; IF_EQ GOTO
   0x8CB1`, with `PRINT "ENTRY #32."` at `0x8CA2` and `PRINT "ENTRY #9."` at `0x8CB1`). Asserted as
   `toContain`, because this arm ends `GOTO 0x9A71`, a routine whose `CALL [0xC01E]` (the host's
   "back out of the shop" turn-around) the engine does not model, so the collected text repeats.
   That repetition is a **known host-model artifact of this repo's VM**, not retail behaviour, and
   is why the assertion is a substring test.
3. **`ECL2.DAX#1` `vm_run_1` `@0x8665` — the Yartar city gate.** `[0x4C21]==1 && [0x4C22]==0` runs
   the Kraken Society abduction (`A WAGON WITH A BROKEN WHEEL BLOCKS THE STREET BEFORE YOU.` →
   `… YOU ARE PULLED THROUGH A HIDDEN DOOR AND DOWN A NARROW STAIRWAY.` → `NEWECL #2`), versus
   `THE GUARDS STOP YOUR PARTY … JOURNAL ENTRY #6.` when the flag is clear. **Documented, not
   asserted:** `vm_run_1` is entered only when the host sets `[0x7ED5] != 0`, a word with **zero**
   ECL writers in the whole corpus (it is written by the native engine's "leaving the town" path).
   Asserting it would require an unproven host seed, so it is recorded here as the narrative
   pay-off and left out of the golden.

Two more cross-archive reads, decoded but not asserted:

- `ECL2.DAX#4` `@0x96FB` / `@0x992F` (the Kraken base beneath Yartar) — both
  `COMPARE [0x4C21],#1 ; IF_EQ ; EXIT`, i.e. the "shouting man chained to the wall" / JOURNAL #28
  scenes are switched off once Amanitas is already free.
- `ECL3.DAX#14` `@0x85B9` (Secomber) — `COMPARE [0x4C21],#0 ; IF_EQ ; GOTO 0x817E`, gating the
  bizarre multi-spired house, which is exactly where Amanitas says he will be
  (*"VISIT ME IN SECOMBER FROM TIME TO TIME"*).

---

## 9. Candidates considered and rejected

Method: a corpus-wide census (scratch script, output redirected to the session scratchpad) of every
word referenced by any decodable instruction in all 26 Gateway ECL blocks, keeping only words in the
persistent bands `0x4900-0x4FFF` and `0x7E00-0x7FFF` that have at least one writer **and** at least
one `COMPARE`/`ON_GOTO` read in a *different* block. That produced **12** candidates — not Pool's
443 — because the filter demands a gating read, not a raw (address, value) match.

The table below covers all 12, plus three more (`0x4C22`, `0x7ED5`, and the early leg's `0x4C20`)
that the filter deliberately excluded but that had to be examined anyway before the leg could be
called: `0x4C20`/`0x4C22` fail the "different block" test outright, `0x7ED5` has no writer at all.

| Candidate | Verdict |
| --- | --- |
| **`0x4C21`** — writer `ECL3#5`, gating readers `ECL2#1` ×8, `ECL2#4` ×2, `ECL3#14` ×1 | **ACCEPTED.** Single writer corpus-wide, cross-archive readers, and the consumer's turn kind changes (menu ↔ combat). |
| `0x4C32` — writer `ECL3#5 @0x8F13`, readers `ECL3#5` ×4, `ECL3#6 @0x8EF5`, `ECL2#4` ×2 | **Rejected as the leg.** It is the Amanitas *fight's* consumed bit — the matrix explicitly excludes "a fight" and "a same-block consumed bit"; nine of its eleven reads are inside its own block. Kept in the registry as context. |
| `0x4C93` — writer `ECL2#3 @0x96B1`, readers `ECL2#1` ×2 | **Rejected.** Same archive, and it only *suppresses* the already-proven early-leg thug arm (`0x9380 COMPARE [0x4C93],#1 ; IF_EQ EXIT`) — it adds no new content and would re-litigate the early leg. |
| `0x4C25` — writer `ECL2#2 @0x8EFF`, reader `ECL2#1 @0x8466` | **Rejected.** Same archive, and the read sits inside the wandering-monster tail that is itself gated by `[0x4C21]`; it selects an encounter *cap*, not different content. |
| `0x4C22` — writer `ECL2#1 @0x86E7`, readers `ECL2#1 @0x8634/@0x8670` | **Rejected.** Same block. |
| `0x4BCA` — writer `ECL4#10 @0x8FB3` (ADD), gating reader `ECL4#13 @0x9236` | **Rejected.** An accumulator, not a flag; also same archive, and its other references are plain arithmetic reads in four unrelated blocks — the documented scratch-reuse failure mode. |
| `0x4D02` — writer `ECL6#28 @0x8DB8`, gating reader `ECL6#20 @0x8AAD` | **Rejected.** Same archive; ECL6#28/#20 are the overland pair, so this is a wilderness-internal selector, and the `wilderness` leg is already proven by other evidence. |
| `0x4C27` — four writer blocks, five reader blocks | **Rejected as scratch.** Multi-writer across four archives is the exact "same-numbered word reused as scratch" pattern the tool's own limitations section warns about. |
| `0x4C08`, `0x4C0A` — nine writer blocks each, one reader block | **Rejected as scratch**, same reason. |
| `0x4C01` — 22 writer blocks | **Rejected.** It is the *previous* masked cell descriptor, written by every block's `search_location`. |
| `0x4BC9` / `0x4BF2` | **Rejected as engine plumbing.** `[0x4BC9]` is the area/wall-set selector, `[0x4BF2]` is `LastEclBlockId` (also host-written). Neither is story state. |
| `0x7ED5` | **Rejected — no ECL writer exists.** Host-owned. See §8.3. |
| Claiming the city-gate abduction (`@0x8665`) as the leg | **Rejected.** It is the best *story* beat, but reaching it needs `[0x7ED5] != 0`, which nothing in the ECL corpus writes. Asserting it would smuggle in an unproven host seed. |
| Claiming the early leg's `[0x4C20]` → Krevish's house `(13,13)` | **Rejected** (and already rejected by the early leg itself): the reader is in the same block. |
| `ECL_GEN1_SHORT` (DoK's table) | **Rejected, and here it discriminates.** Run on the consumer cell it desyncs and returns `{kind:'end', text:'KRAKEN SPIES ATTACK!'}` with **no combat at all** — `SETUP_MONSTER`'s 4-operand frame swallows `LOAD_MONSTER`. Asserted in golden test L. |
| Plain long `ECL_GEN1` | **Not discriminating here** — it produces the identical result. Stated for honesty: this route does not by itself prove the Gateway dialect split; that split's justification remains the `0x0C` operand census in `ECL_GEN1_SHORT_GATEWAY`'s doc comment. |
| `&0x3F` descriptor mask | **Rejected, and here it *does* discriminate** — on the setter cell (`0xF9`), unlike the early leg's cells. See §2c and golden test K. |
| A save-file byte offset for `[0x4C21]` | **Rejected as unproven.** Same reasoning as the early leg §8: one Gateway ECL-word→save-offset datapoint exists in this repo and one point does not establish a linear map. Not claimed. |

---

## 10. Honest boundaries

- **No native/DOSBox evidence.** Everything here is static retail bytes plus this repo's own
  `EclVm`. The matrix's `proven` status explicitly does not require native capture or live browser
  wiring; this leg uses that allowance and says so.
- **"The Three Rivers Festhall interior" is an inference** from the adjacent sign cell `(13,2)`, not
  something arm 30 states. Everything load-bearing is stated in terms of the cell coordinate and the
  descriptor.
- **Cross-block memory continuity is modelled, not observed.** The end-to-end golden carries one
  flat `Map` from `ECL3#5` into `ECL2#1`, which is what a single flat DGROUP implies, but no native
  capture of Gateway's inter-block memory retention exists in this repo. Every *other* test states
  `[0x4C21]` explicitly rather than relying on the carry, so the leg does not rest on it.
- **`[0x4BF2] = 21` and `[0x03B2] = 2` are host inputs.** They are used only to select which of the
  block's own byte-grounded `initial_entry` spawn arms runs. The consumer fork itself is asserted
  independently of the spawn (tests E/F dispatch the cell directly).
- **`[0x4C03]` is shared scratch**, not a private consumed bit — see §7's hazard note, disclosed by
  test J rather than smoothed over.
- **The Waterbaron text repeats** in this repo's VM because `CALL [0xC01E]` is unmodelled; the
  golden therefore asserts a substring. This is a known engine gap, not retail behaviour, and it is
  not fixed here.
- **The city-gate abduction is documented, not asserted** (§8.3), because it needs `[0x7ED5]`.
- **Not wired into the browser.** No `?explore=` route was added; this is an engine-level proof.

---

## 11. Reproduction

```powershell
pnpm --filter @goldbox/engine test          # includes packages/engine/test/gatewayQuestFlag.test.ts
python tools/find_geo_path.py --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO2.DAX" `
    --block 1 --start 11,0 --target 14,2 --facing north --event-mask 127
python tools/find_geo_path.py --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO3.DAX" `
    --block 5 --start 8,15 --target 5,13 --facing north --event-mask 127
# NOTE: redirect the flag-registry scan away from its checked-in default paths.
python tools/map_gen1_cross_area_flag_reads.py --profile gateway-to-the-savage-frontier `
    --json <scratch>/gw-quest-flags.json --markdown <scratch>/gw-quest-flags.md
```

---

## 12. Browser route (R3, 2026-09-02)

**Status: wired.** `apps/web/src/ui/gameData.ts`'s `'gateway-quest'` `GameData` entry and three small
`apps/web/src/ui/explore.ts` additions promote §2–§8's engine proof to a live `?explore=gateway-quest`
route (the `?explore=` dispatcher token itself is a Phase B one-liner — this route is reachable today
by calling `startExplore('gateway-quest')` directly, e.g. from a dev-server console or a test harness
that imports `explore.ts`). `explore.ts` is the sole R3-owned file; `gen1Profiles.ts` needed no change
(it backs the unrelated intro/demo/title-menu pipeline, not `?explore=` routing).

### 12a. Phase 1 — the setter, mounted one step short

The `'gateway-quest'` profile boots `ECL3.DAX#5`/`GEO3.DAX#5` (`eclInitBlock: 5`) at `startPose:
{x:5, y:14, facing:'north'}` — **not** on the descriptor-121 cell itself. Measured directly (not
copied from §2d, which is a different, 29-step, unasserted walk from the block's own retail
re-entry arrival):

```powershell
python tools/find_geo_path.py --geo ".../GEO3.DAX" --block 5 --start 5,14 --target 5,13 \
    --facing north --event-mask 127
# -> step_count 1, blocked_cell_count 0, directions ["north"], target event_index 121
```

One legal `forward` move reaches `(5,13)` with the SAME dispatch facing (`'north'`) golden test D
primes, so the live walk and the engine golden dispatch the identical VM state. No `eclInitialMemory`
is seeded (test D primes from a fresh empty `Map`); `startPose` overrides whatever pose `ECL3.DAX#5`'s
own `initial_entry` would otherwise write, which is fine because the golden's own reachability note
(§2d) already disclaims that 29-step walk as "reported, not asserted."

### 12b. The handover — modelled, not observed, and said so in the code

`resolveCombat`'s `onEnd` callback in `explore.ts` (next to the existing chained-wave/prompt-
preservation branches) adds one more: when `activeGame.id === 'gateway-quest'`, the party is standing
in `{disk:3, areaId:5}` (Everlund), and the just-updated `state.areaMemory.get(0x4c21) === 1` — i.e.
the SAME value golden test D's `afterCombat('victory')` proves gets written — it re-mounts Yartar via
`switchGen1Area('gateway', <disk 2 spec>, 1, { carriedMemory, pose: {x:11,y:0,facing:'south'} })`,
first seeding the carried memory with `[0x4BF2]=21` / `[0x03B2]=2`, the exact two host inputs golden
test G seeds before booting `ECL2.DAX#1`'s own `initial_entry` (`LastEclBlockId` / entry facing).
`switchGen1Area` then runs that `initial_entry` for real through the live `EclVm`, so the (11,0,south)
spawn is the block's OWN `0x838D`/`0x8393` `SAVE` writes, not a hand-picked coordinate — matching test
G's `[0xC04B]=11, [0xC04C]=0` assertion — with an explicit `pose` override only because
`switchGen1Area`'s generic `retailPose` inference reads CoK/DoK-style `[0x4BC3]/[0x4BC4]` addresses,
not Gateway's own `[0xC04B]/[0xC04C]` host registers (a pre-existing, unrelated gap in that shared
helper, sidestepped here rather than fixed, since fixing it is outside R3's file scope).

**This crossing is explicitly a model, not a native or engine-observed transition.** The retail path
from Everlund's undercity back to Yartar runs through the overland wilderness (`ECL6.DAX#21`), which
this route never walks — exactly the boundary §10 already discloses ("Cross-block memory continuity
is modelled, not observed") and exactly what test G itself does at the engine level (it seeds
`[0x4BF2]`/`[0x03B2]` directly rather than deriving them from a real wilderness crossing). The browser
route does not add a new claim here; it reproduces the same modelled seam the golden already disclosed,
now reachable from a mounted UI instead of only from a unit test.

### 12c. The one real engineering decision: `onCall`, not `applyGatewayHostCall`

Both the rescue (test D) and the ambush (test E) scripts execute one retail `CALL` immediately before
their `COMBAT` (`effects` lists both show a lone `'call'` between `'picture'` and the fight). Neither
is `movePositionForward` — this route has no host-CALL resumption tail like the OTHER Gateway routes'
descriptor-18 tavern (`applyGatewayHostCall`'s narrow guard only understands `movePositionForward` and
is a no-op for anything else, leaving VM compare flags untouched). Left as a no-op, a subsequent
branch that reads those flags could diverge from the golden's own `yesCall` outcome
(`{comparison:{left:0,right:1}}`, "keeps every branch on its YES arm"). `explore.ts` therefore supplies
a dedicated `applyGatewayQuestYesCall` — the identical `{comparison:{left:0,right:1}}` result,
reproduced verbatim — for `activeGame.id === 'gateway-quest'`'s `dialogueForCell` dispatch, in both
Everlund and Yartar. This is the one place the browser route's wiring had to make a choice the golden
didn't already answer for browser dispatch; it resolves that choice by copying the golden's own proven
answer rather than inventing new behavior.

### 12d. The negative-arm entry: `?explore=gateway-quest&yartar=1`

The shipped route can only ever reach Yartar with `[0x4C21]=1` (the handover only fires on that exact
value). To exercise test F's "Amanitas never rescued" precondition in the browser without fabricating
a loss in the rescue fight, `startExplore` special-cases `gameId === 'gateway-quest' && query.has
('yartar')` (the same query-flag convention `?explore=gateway&wilderness=1` already uses) and mounts
`ECL2.DAX#1`/`GEO2.DAX#1` directly via `switchGen1Area`, seeded with the same `[0x4BF2]=21`/
`[0x03B2]=2` but no `[0x4C21]` at all — i.e. golden test F's "fully unset memory" case, which the
golden itself proves takes the identical branch as an explicit `0`.

### 12e. What the walked route does and does not touch

The five-step `S,S,E,E,E` walk from `(11,0)` crosses `(11,1)`, `(11,2)`, `(12,2)`, `(13,2)`, `(14,2)` —
the SAME cells golden test G walks and asserts. It does **not** reach the Waterbaron cells `(10,7)`/
`(10,8)` (test I, the `CALL [0xC01E]` host-model gap §8.2 discloses) or exercise the `[0x4C03]` shared-
scratch hazard from any OTHER writer (§7's hazard note): this route never visits Everlund's own street
cells (descriptor 2, `0x848F`'s `[0x4C03]` increment), so `[0x4C03]` starts and stays `0` until the
ambush's own `0x91B9` write, exactly like test G's own seed. Both of those are pre-existing, disclosed
gaps in the underlying golden/engine, not something this route newly introduces or newly avoids;
R3 does not touch either.

### 12f. Verification performed for R3 (no DOSBox-X, no emulator)

Driven with a throwaway Node/Playwright harness (`GOLDBOX_LOCAL_GAMES_ROOT`-aware Vite dev server +
headless Edge, the same stack `apps/web/test/e2e.mjs` uses) that dynamically imports `explore.ts` and
calls `startExplore('gateway-quest')`/`startExplore('gateway-quest', undefined)` with `?yartar=1`
directly — bypassing the `?explore=` dispatcher token, which is Phase B's to add. Both arms were
observed with real turn payloads (roster names, tavern text) and two named mutations were watched red
then restored: forcing `[0x4C21]=0` in the handover collapses arm (4) to the tavern; forcing
`[0x4C21]=1` on the negative-control mount collapses arm (5) to combat. See the handoff report for the
exact observed payloads and the `explore-gateway-quest` e2e case text (not yet applied — Phase B).
