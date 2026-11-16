# Gateway to the Savage Frontier — EARLY natural-combat route: Yartar, `ECL2.DAX#1` arm 39 (2026-08-05)

**Status: PROVEN, engine-level, from static retail bytes only.** No DOSBox-X session, no emulator,
no native capture was used or is claimed. Engine golden:
`packages/engine/test/gatewayYartarEarly.test.ts` (8 tests, all reading the real retail files,
`it.skipIf` guarded).

This closes the `early` leg of `tools/goldbox_campaign_matrix.json`'s six-leg matrix for
`gateway-to-the-savage-frontier`. It is archive-distinct from Gateway's already-proven `town` leg
(`ECL5.DAX#19`, Sundabar) and `wilderness` leg (`ECL6.DAX#21`). It is explicitly **not** a plot
claim beyond what the retail text itself says.

---

## 0. Files, dialect, addressing

Install: `C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/`

| File | What was read | Verified |
| --- | --- | --- |
| `ECL2.DAX` block 1 | decompressed 7578 bytes | container TOC decoded via `tools/goldbox_corpus.read_dax_blocks`; blocks present are 1/2/3/4/82 |
| `GEO2.DAX` block 1 | 1026 bytes, 16×16 | blocks present are 1/2/3/4 |
| `MON2CHA.DAX` | 15 records, each 422 bytes | names decoded with the engine's own `decodeMonsterArchive(..., 'gateway-to-the-savage-frontier')` |

Dialect: **`ECL_GEN1_SHORT_GATEWAY`** (`packages/engine/src/ecl/disassemble.ts`) —
`wordSetOverrides {0x1d: 0, 0x22: 0, 0x2c: 1}`, `headerLen 22`, `vbase 0x7FFE`, `hasMagic`, and
**no `cellDescAddr` override**, so the per-cell descriptor is read from the CoK/DoK-family
`[0xC04F]`, not Treasures' `[0x002D]`.

Addressing: address addend `0x8000`; file offset = `vaddr - 0x8000 + 2`.

Real header, from `parseEclHeader` on the retail bytes
(`88 13 | 01 01 d3 84 | 01 01 a6 82 | 01 01 3b 85 | 01 01 85 85 | 01 01 14 80`):

| Slot | Value |
| --- | --- |
| magic | `0x1388` |
| `vm_run_1` | `0x84D3` |
| `search_location` | `0x82A6` |
| `pre_camp_check` | `0x853B` |
| `camp_interrupted` | `0x8585` |
| `ecl_initial_entry` | `0x8014` |

`0x8014 - 0x7FFE = 22`, i.e. `initial_entry` points at the instruction immediately after the
22-byte header. **It is the real boot leg, not a GOTO trampoline** (contrast NWN `ECL1#10`).

---

## 1. Spawn — grounded in the block's own `initial_entry` SAVEs

Cold-memory execution of `initial_entry` (all four incoming-area guards fail on a fresh campaign):

```
0x8014 SAVE #0  -> [0x4BFB]
0x801A SAVE #0  -> [0x4C00]
0x8020 SAVE #2  -> [0x4BFE]
0x8026 GOSUB 0x9A36
0x802A SAVE #60 -> [0x7EC6]
0x8030 SAVE #1  -> [0x4BE6]          inDungeon = 1 (local/tactical map mode)
0x8036 LOAD_FILES #1,#2,#255          operand 0 = GEO block id -> GEO2.DAX#1
0x803D LOAD_PIECES #36,#31,#15
0x8044 COMPARE [0x4BF2],#27 ; 0x804A IF_GE ; 0x804B GOTO 0x8343
0x804F COMPARE [0x4BF2],#1  ; 0x8055 IF_EQ ; 0x8056 GOTO 0x82A2
0x805A COMPARE [0x4BF2],#2  ; 0x8060 IF_EQ ; 0x8061 GOTO 0x82A2
0x8065 COMPARE [0x4BF2],#21 ; 0x806B IF_EQ ; 0x806C GOTO 0x8350
0x8070 SAVE #7 -> [0x4BC9]
0x8076 GOSUB 0x9A36
0x807A (file 124) 09 00 01 01 4b c0   SAVE #1  -> [0xC04B]   X      = 1
0x8080 (file 130) 09 00 0a 01 4c c0   SAVE #10 -> [0xC04C]   Y      = 10
0x8086 (file 136) 09 00 00 01 4d c0   SAVE #0  -> [0xC04D]   facing = 0 (north)
0x808C PICTURE #5, then the opening narration (§6), then:
0x8284 (file 646) 2f 00 7f 01 4f c0 01 02 4c   AND #127,[0xC04F],[0x4C02]
0x828D (file 655) 09 01 02 4c 01 01 4c         SAVE [0x4C02] -> [0x4C01]
```

The three spawn SAVEs' bytes were read directly out of the decompressed block at file offsets
124/130/136 and are quoted above verbatim.

**`[0x4BF2]` freshness — corpus census, not an assumption.** A stack-aware CFG walk from all five
header entries of every `0x1388`-magic block in **all five** Gateway ECL archives
(`ECL2/3/4/5/6.DAX`) finds exactly **two** writers of `[0x4BF2]` in the entire ECL corpus:

- `ECL5.DAX#99 @0x8014  SAVE #0 -> [0x4BF2]`  (`09 00 00 01 f2 4b`)
- `ECL5.DAX#98 @0x801C  SAVE #1 -> [0x4BF2]`  (`09 00 01 01 f2 4b`)

Neither is on a fresh campaign's path, so `[0x4BF2] = 0` and `initial_entry` falls through all four
guards to the `0x807A` spawn.

Verified in the real `EclVm` (golden test A): running block 1 from entry 22 on an empty memory map
exits cleanly with `[0xC04B]=1`, `[0xC04C]=10`, `[0xC04D]=0`, `[0x4BE6]=1`, `[0x4BFE]=2`,
`[0x4BC9]=7`, emitting `loadFiles{geoBlockId:1, operands:[1,2,255]}` and
`loadPieces{setBlockIds:[36,31,15]}`.

**Host-modelling boundary (stated, not hidden).** The cold headless run leaves
`[0x4C01] = [0x4C02] = 0`, because `0x8284` reads `[0xC04F]` — the cell descriptor the *host*
populates — and a headless boot has no host. The retail engine has `[0xC04F] = 0x83` (the spawn
cell's own raw descriptor) at that point, so the real machine leaves `[0x4C01] = [0x4C02] = 3`. The
golden therefore boots the block for real and then applies exactly this one correction before
walking. Test H proves the correction is load-bearing rather than cosmetic: without it, the first
step is not silent — it opens the Inn's `'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'` prompt (string
at vaddr `0x8936`).

---

## 2. Per-step dispatch

`search_location @0x82A6` (file offset 680):

```
0x82A6 (680) 09 01 02 4c 01 01 4c          SAVE [0x4C02] -> [0x4C01]      (previous descriptor)
0x82AD (687) 2f 00 7f 01 4f c0 01 02 4c    AND #127,[0xC04F],[0x4C02]     <-- THE MASK IS &0x7F
0x82B6 (696) 02 01 e8 9b                   GOSUB 0x9BE8   (COMPARE [0x4C02],#97 ; IF_LT RETURN —
                                            an immediate no-op for any descriptor < 97; ours is 39)
0x82BA (700) 03 01 02 4c 00 29             COMPARE [0x4C02],#41
0x82C0 (706) 1b 00                         IF_GE ; EXIT
0x82C2 (708) 25 01 02 4c 00 29 <41 targets>  ON_GOTO [0x4C02],#41,...      (0-based, size 129)
```

Arm targets read off the real instruction's operand list (offset 714 + 3·i):

| Arm | Target | Role on this route |
| --- | --- | --- |
| 0 | `0x8404` | open-street step counter |
| 2 | `0x88F1` | the Inn of the Glowing Gem sign |
| 3 | `0x892A` | Inn interior / rest prompt (guarded by `[0x4C02] == [0x4C01]`) |
| **39** | **`0x9378`** | **the thug rescue — this route's encounter** |
| 40 | `0x98EB` | Krevish's house (see §9) |

---

## 3. Target descriptor and GEO cells

Descriptor plane = `GEO2.DAX#1` `raw[514:770]`, index `y*16 + x`. **Mask used: `&0x7F`** — the
script's own `AND #127` at `0x82AD`/`0x8284`, not `&0x3F`.

Cells whose `(raw & 0x7F) == 39` — all four have raw floor byte `0x27`:

`(4,0)`, `(11,2)`, `(2,12)`, `(11,12)`

All four were run through the real VM and produce the **identical** turn: the same picture 4, the
same verbatim prompt, the same roster `[{monsterId:1, count:5, picBlockId:1}]`, and the same
`[0x4C20] = 4` pre-write. `(2,12)` is the nearest to the spawn and is the one this route walks.

Route cells, straight from the GEO plane:

| Cell | raw | `&0x7F` |
| --- | --- | --- |
| `(1,10)` spawn | `0x83` | 3 |
| `(0,10)`, `(0,9)`, `(1,9)` | `0x83` | 3 |
| `(1,8)` | `0x02` | 2 |
| `(2,8)`, `(2,9)`, `(2,10)`, `(2,11)` | `0x00` | 0 |
| `(2,12)` target | `0x27` | 39 |

---

## 4. Reachability over the real wall/door graph

```
python tools/find_geo_path.py --geo "<install>/GEO2.DAX" --block 1 \
    --start 1,10 --target 2,12 --facing north
```

`step_count 9`, `final_facing south`, `event_mask 127`, `blocked_cell_count 0`.

Directions: **west, north, east, north, east, south, south, south, south**
DOS keys: `{LEFT}{UP}{RIGHT}{UP}{RIGHT}{UP}{LEFT}{UP}{RIGHT}{UP}{RIGHT}{UP}{UP}{UP}{UP}`

Door edges — **both flag 1 (automatic; no prompt, no check)**:

- `(0,10) north -> (0,9)`: wall slot 5, door flag 1
- `(1,9)  north -> (1,8)`: wall slot 2, door flag 1

The other seven edges are wall slot 0 / door flag 0. `required_interactions` is **empty** — there
is no flag-2/flag-3 bash/pick/knock edge anywhere on this route.

The spawn is forced: the edges at `(1,10)` are north wall 4, east wall 4, south wall 4, west wall 0
(all door flags 0), so **west is the only legal first move** out of the starting room.

---

## 5. Every intermediate descriptor executed through the real VM

Run with `dialogueForCell(ECL2#1 raw, rawFloorByte, { memory, facing, dialect: ECL_GEN1_SHORT_GATEWAY })`
— not hand-traced.

| Step | Cell | Arm | Result |
| --- | --- | --- | --- |
| 1-3 | `(0,10)`, `(0,9)`, `(1,9)` | 3 `@0x892A` | `{kind:'end', text:''}` — arm 3 opens with `COMPARE [0x4C02],[0x4C01] ; IF_EQ ; EXIT`, so a step that does not change the masked descriptor is silent |
| 4 | `(1,8)` | 2 `@0x88F1` | `{kind:'end'}`, text `"A SIGN HANGING ABOVE THE DOOR HERE READS: 'THE INN OF THE GLOWING GEM'"` — a single PRINTCLEAR then EXIT; writes no state |
| 5-8 | `(2,8)`…`(2,11)` | 0 `@0x8404` | `{kind:'end', text:''}` ×4; a pure step counter |
| 9 | `(2,12)` | **39** `@0x9378` | the encounter (§6) |

Arm 0 disassembled from the real bytes:

```
0x8404 COMPARE [0x4C00],#5
0x840A IF_GT
0x840B GOTO   0x8429                (the wandering-monster tail)
0x840F ADD    [0x4C00],#1 -> [0x4C00]
0x8418 COMPARE [0x7ECA],#1
0x841E IF_EQ
0x841F ADD    [0x4C00],#1 -> [0x4C00]
0x8428 EXIT
```

`initial_entry` leaves `[0x4C00] = 1`, and `[0x7ECA]` is 0 on a cold campaign, so the four
open-street cells take it 1 → **5**. The wandering tail at `0x8429` is unreachable on a fresh
campaign because `0x845E` is `COMPARE [0x4C21],#0 ; IF_EQ EXIT`, and `[0x4C21] = 0` (§7).

---

## 6. The encounter — arm 39 `@0x9378`, byte-exact

```
0x9378 (4986) 03 01 21 4c 00 00   COMPARE [0x4C21],#0
0x937E (4992) 17                  IF_NE
0x937F (4993) 00                  EXIT
0x9380 (4994) 03 01 93 4c 00 01   COMPARE [0x4C93],#1
0x9386 (5000) 16                  IF_EQ
0x9387 (5001) 00                  EXIT
0x9388 (5002) 03 01 20 4c 00 00   COMPARE [0x4C20],#0
0x938E (5008) 16                  IF_EQ
0x938F (5009) 01 01 9b 93         GOTO 0x939B
0x9393 (5013) 03 01 20 4c 00 04   COMPARE [0x4C20],#4
0x9399 (5019) 17                  IF_NE
0x939A (5020) 00                  EXIT                 <-- the silent-revisit exit
0x939B (5021) 09 00 04 01 20 4c   SAVE #4 -> [0x4C20]  (the OFFER, written BEFORE the prompt)
0x93A1 (5027) 0e 00 04            PICTURE #4
0x93A4 (5030) 12 80 54 ...        PRINTCLEAR, inline 6-bit packed string, packedLen 0x54 = 84 bytes
0x93FB (5117) 2d 01 0c 08         CALL [0x080C]        (retail yes/no host handler)
0x93FF (5121) 17                  IF_NE
0x9400 (5122) 01 01 2f 94         GOTO 0x942F          (index 0 = YES -> fight)
0x9404        PRINTCLEAR "THE LITTLE MAN CONTINUES TO DODGE HIS ATTACKERS."
0x942B        GOTO 0x9A6C                              (NO branch; leaves [0x4C20]=4)
0x942F (5169) 36 00 3c 00 63      ADD_NPC #60,#99
0x9434 (5174) 1c                  CLEARMONSTERS
0x9435 (5175) 0c 00 ff 00 01 00 ff  SETUP_MONSTER #255,#1,#255
0x943C (5182) 0b 00 01 00 05 00 01  LOAD_MONSTER #1,#5,#1
0x9443 (5189) 24                  COMBAT
0x9444 (5190) 09 00 01 01 20 4c   SAVE #1 -> [0x4C20]  <-- THE CONSUMED WORD
0x944A (5196) 02 01 1e 9d         GOSUB 0x9D1E         (the "is KREVISH in the party" name scan)
0x944E        17 00               IF_NE ; EXIT
```

Every byte sequence above was read out of the decompressed block at the quoted file offset.

`CALL [0x080C]`: the native handler compares the choice index against 1 (see `EclCallHostResult`'s
doc comment in `packages/engine/src/ecl/vm.ts`), so answering the host call with
`{comparison:{left:0,right:1}}` (index 0 = YES) makes the `IF_NE` at `0x93FF` take its
`GOTO 0x942F` into the fight; `{left:1,right:1}` (NO) falls through to the decline text.

**Roster, decoded from the retail `MON2CHA.DAX` (not assumed):**

| Instruction | Resolves to |
| --- | --- |
| `LOAD_MONSTER #1,#5,#1` | `{monsterId:1, count:5, picBlockId:1}` → `MON2CHA.DAX#1` = **`BANDIT`** ×5 |
| `ADD_NPC #60,#99` | `MON2CHA.DAX#60` = **`KREVISH`** |

`KREVISH` is independently corroborated by this same block's own inline strings — `0x94A8`
`"'GOSH, THANKS!' THE SMALL MAN STAMMERS. 'MY NAME IS KREVISH, …'"` — and by the literal string
compare inside `GOSUB 0x9D1E`.

**Actual VM effect stream at the combat pause** (real bytes, real VM, asserted in the golden):

```
picture{id:4} -> print{…} -> call{operand:0x080C} -> addNpc{npcId:60, morale:99}
  -> encounterSetup{spriteId:255, maxDistance:1, picId:255}
  -> combat{monsters:[{monsterId:1, count:5, picBlockId:1}]}
```

**Verbatim retail narration** (decoded from the inline 6-bit packed strings):

- Encounter (`0x93A4`): `SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN IN AN ALCOVE OF THIS NARROW STREET. DO YOU WANT TO HELP HIM?`
- Decline (`0x9404`): `THE LITTLE MAN CONTINUES TO DODGE HIS ATTACKERS.`
- En-route sign (`0x88F1`): `A SIGN HANGING ABOVE THE DOOR HERE READS: 'THE INN OF THE GLOWING GEM'`
- Inn prompt (`0x8936`): `'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'`
- Opening narration on the cold `initial_entry`, in order:
  1. `IT IS A NIGHT OF CELEBRATION! YOUR PARTY HAS SUCCESSFULLY PROTECTED THE CARAVAN FROM CITADEL ADBAR ALL THE WAY TO YARTAR! BETTER YET, YOU'VE GOTTEN PAID! CAN ` (party-member name inserted by `GOSUB 0x9B2B`)
  2. ` REALLY EAT FIVE BIG STEAKS IN ONE SITTING?`
  3. ` TELLS EVERYONE IN THE TAVERN ABOUT YOUR TRIP, AND YOU RECORD THE HIGHLIGHTS OF THE EVENING AS THE INTRODUCTION TO YOUR JOURNAL.`
  4. `BUT THE NEXT DAY YOU AWAKEN TO DESPAIR. THE MERRY-MAKING AT THE TAVERN MADE ONE TOO MANY FRIENDS IN A TOWN FAMOUS FOR THE DEXTERITY OF ITS THIEVES, AND NOW EVERYTHING IS GONE.`
  5. `LOOKING AROUND THE ROOM, FILLED WITH ANGER, YOU RECORD YOUR FEELINGS AS JOURNAL ENTRY #5.`

---

## 7. Guard-flag freshness — corpus-wide census, not an assumption

Method: stack-aware CFG walk from all five header entries of every `0x1388`-magic block of
`ECL2/3/4/5/6.DAX`, decoding with `ECL_GEN1_SHORT_GATEWAY`'s word sets
(`tools/gen1_ecl_encounter_scan.decode_one`/`successors`, reused unchanged), collecting every
operand slot that names a target address and classifying it as WRITE (the opcode's destination
slot) or read. Constrained compare outcomes are propagated **only** from a `COMPARE` to the `IF_*`
that immediately consumes them; every other opcode resets to "all outcomes possible", so no
reachable writer can be pruned by an unmodelled flag source (see §10 — this exact detail matters).

| Word | Writers, whole ECL corpus |
| --- | --- |
| `[0x4C20]` (the consumed word) | **6, all inside `ECL2.DAX#1`**: `0x939B #4`, `0x9444 #1`, `0x959A #2`, `0x98E1 #3`, `0x9A23 #3`, `0x9D6A #3` |
| `[0x4C21]` | **exactly one**: `ECL3.DAX#5 @0x9026  SAVE #1 -> [0x4C21]` (`09 00 01 01 21 4c`), immediately after the Amanitas rescue |
| `[0x4C93]` | **exactly one**: `ECL2.DAX#3 @0x96B1  SAVE #1 -> [0x4C93]` (`09 00 01 01 93 4c`) |
| `[0x4BF2]` | **exactly two**: `ECL5.DAX#99 @0x8014 #0`, `ECL5.DAX#98 @0x801C #1` |

So both `0x9378`'s and `0x9380`'s guards pass on a genuinely cold campaign. **Nothing had to be
seeded** to reach this encounter.

---

## 8. Persistence

Persistence address: ECL word **`[0x4C20]`** (Gateway DGROUP). Complete write set in §7.

- At the combat pause `[0x4C20] = 4` — written at `0x939B`, before the prompt and before `COMBAT`.
- After `afterCombat('victory')`, `[0x4C20] = 1` — written at `0x9444`, unconditionally, *before*
  the Krevish party scan at `0x944A`, and the runner is done.
- **Silent legal revisit** on the same memory map: re-dispatching the same cell yields
  `{kind:'end', text:''}` and `[0x4C20]` stays 1. `0x9388`'s `==0` fails, `0x9393`'s `==4` fails,
  `0x939A` EXITs before the PRINTCLEAR — no narration, no roster.
- **Negative control**: a genuinely fresh memory map re-fires the whole encounter with the same
  narration and the same `BANDIT ×5` roster and re-writes `[0x4C20] = 4`. The suppression is caused
  by the retail word, not by runner state.
- **Decline control**: taking the NO branch leaves `[0x4C20] = 4`; a subsequent visit re-offers the
  encounter and a YES still reaches `COMBAT` and still lands `[0x4C20] = 1`. Only victory consumes it.

**Save-file byte offset — NOT PROVEN, deliberately not published as fact.** The one known Gateway
ECL-word→save-offset datapoint in this repo is `[0x4C6C]` → `SAVGAMA.DAT` offset `0x02D9`
(`gateway-sundabar-native-evidence.json`, from the 2026-07-29 native capture). Treating that single
sample as a constant delta of `-0x4993` would *predict* `[0x4C20]` → `0x028D`. That is inference
from one point; no linear ECL-word→save-offset mapping is documented anywhere in this repo, and
confirming it needs a native save capture, which is out of scope for a static pass. Recorded here
as a **candidate only**. The matrix row does not cite it.

---

## 9. Cross-cell consumption corroboration (bonus, not the quest leg)

Cell `(13,13)` has raw floor byte `0xA8`, masked 40 → `ON_GOTO` arm 40 `@0x98EB` — **Krevish's
house**. Run through the real VM at each `[0x4C20]` value:

| `[0x4C20]` | Arm 40 result |
| --- | --- |
| 0 (before the rescue) | `{kind:'end', text:''}` — silent |
| 4 (offered, unresolved) | `{kind:'end', text:''}` — silent |
| **1** (this route's victory value) | `KREVISH GREETS YOU AT THE DOOR. 'YOU CAME TO SEE ME!' HE PROCLAIMS WITH DELIGHT. 'WOULD YOU LIKE TO MEET MY BOSS AFTER ALL?' …` |
| 2 | `KREVISH GREETS YOU AT THE DOOR. 'YOU CAME BACK FOR ME!' HE SCREECHES HAPPILY. 'DOES THIS MEAN I GET TO COME WITH YOU? PLEEEEEEASE?'` |

`(2,12) → (13,13)` is 20 legal directed steps over the real wall/door graph (one automatic door,
`required_interactions` empty).

**This is deliberately NOT claimed as Gateway's `quest` leg.** The matrix's `quest` definition
requires the flag to be read by a *different, non-adjacent block*; arm 40 lives in the same block
(`ECL2.DAX#1`). It is recorded here as corroboration that `[0x4C20]` is a genuine world-state word
with observable downstream effect, and as a concrete lead for whoever takes the `quest` leg.

---

## 10. Why the standing corpus scanner never surfaced this route

`tools/gen1_ecl_encounter_scan.scan_block` on `ECL2.DAX#1` reports COMBAT candidates at `0x84C8`,
`0x85DB`, `0x8A1D`, `0x8AC0`, `0x8C1C`, `0x8D40`, `0x8E4D`, `0x91B8`, `0x9210` — and **not**
`0x9443`, this route's combat.

Root cause, found while building §7's census: the scanner carries a constrained compare-outcome set
across `0x2D CALL`. On this arm the last real `COMPARE` is `0x9393 COMPARE [0x4C20],#4`, whose
`IF_NE` false-branch narrows the outcome set to `{0}`; the intervening `CALL [0x080C]` is not in the
scanner's flag-reset list, so `0x93FF IF_NE`'s true branch (`GOTO 0x942F`) is pruned as impossible
and `0x9443` never enters the graph. The retail interpreter *does* load the host call's result into
the compare flags (`EclVm` models this via `EclCallHostResult`), so the pruning is a scanner
modelling gap, not a property of the game.

This is recorded as an observation about the tool, **not** fixed here — changing
`gen1_ecl_encounter_scan.py`'s flag model would alter the checked-in corpus-wide
`gen1-ecl-natural-encounters.md` report and is out of scope for this leg. The scratch census used
for §7 applied the inclusive model in a throwaway script instead.

---

## 11. Candidates considered and rejected

| Candidate | Verdict |
| --- | --- |
| Descriptor-39 cells `(4,0)`, `(11,2)`, `(11,12)` | **Valid but not used.** All three dispatch the same arm 39 and produce a byte-identical turn and `[0x4C20]` write. `(2,12)` was chosen solely because it is the nearest legal cell to the byte-grounded spawn (9 steps), which keeps the intermediate-cell VM verification short and complete. |
| `chooseStart` heuristic for the spawn | **Rejected as a source.** The spawn used here comes from the block's own `initial_entry` SAVEs at `0x807A/0x8080/0x8086`, per the matrix's own requirement (the heuristic has been wrong twice before in this project). |
| `&0x3F` descriptor mask | **Rejected as the stated mask, though indistinguishable here.** This block masks with `AND #127` at `0x82AD`/`0x8284`, so `&0x7F` is what the doc and the golden state. Checked, not assumed: **zero** of `GEO2.DAX#1`'s 256 descriptor bytes differ between `&0x3F` and `&0x7F`, so the choice cannot change any result on this map — `&0x7F` is used because it is the script's own mask, not because it discriminates. |
| `ECL_GEN1_SHORT` (DoK's table) instead of `ECL_GEN1_SHORT_GATEWAY` | **Rejected.** Gateway is affirmatively 3-operand for `0x0C SETUP_MONSTER` (1/238 reachable sites admit a 4th operand) — see `ECL_GEN1_SHORT_GATEWAY`'s doc comment. Using DoK's 4-operand frame would desync `0x9435` silently. **How far this actually discriminates, stated precisely (adversarial re-check, 2026-08-05):** the Gateway dialect is load-bearing *against `ECL_GEN1_SHORT`*, which desyncs and never reaches `COMBAT` at all — but it is **not** discriminating against the plain long `ECL_GEN1` default, which was run on this same route and produces an identical result. So this route alone does not prove the Gateway split; it is used because it is the correct declared dialect for the title, and the split's independent justification is the `0x0C` operand census above, not this walk. |
| Claiming this leg as `quest` as well | **Rejected.** §9's downstream reader is in the same block. |
| A save-file byte offset for `[0x4C20]` | **Rejected as unproven.** See §8. |

### Corrections to the pre-implementation spec this round produced

Three claims in the selection-phase spec did not survive re-verification and are corrected above:

1. **`[0x4C00]` ends at 4.** It ends at **5**. The spec computed the counter from a zero start; the
   real `initial_entry` leaves `[0x4C00] = 1`, and four open-street cells add one each.
2. **Arm 40's text is `"… I LIVE IN THE SOUTHEAST PART OF TOWN"`.** That string is at vaddr
   `0x955B`, inside **arm 39's own** post-victory Krevish scene (the offer-declined branch). Arm 40's
   own strings are `0x990F` / `0x99B4` (`KREVISH GREETS YOU AT THE DOOR …`), as §9 shows.
3. **The decline turn's text is only `"THE LITTLE MAN CONTINUES TO DODGE HIS ATTACKERS."`** When the
   host `CALL` is answered synchronously there is no VM pause between the prompt and the reply, so
   `collectText` joins both retail strings into one turn. The golden asserts the joined string.

---

## 12. Honest boundaries

- **No native/DOSBox evidence.** Everything here is static retail bytes plus the project's own
  `EclVm`. The matrix's `proven` status explicitly does not require native capture or live browser
  wiring; this leg exercises that allowance and says so.
- **The post-victory Krevish scene is party-gated.** `0x9450` onward (`'GOSH, THANKS!' … MY NAME IS
  KREVISH`, the JOURNAL #21/#24/#25 beats, the `DO YOU ACCEPT KREVISH'S OFFER?` fork) sits behind
  `GOSUB 0x9D1E`, which string-scans the live party for `"KREVISH"`. A partyless engine golden ends
  cleanly at `0x944F`. This is a host/party-model dependency, **not** a gap in the consumed-state
  proof: `0x9444` runs before `0x944A`, so `[0x4C20] = 1` is unconditional.
- **One host-modelled seed.** `[0x4C01]`/`[0x4C02] = 3`, justified byte-for-byte in §1 and proven
  load-bearing by golden test H.
- **ROADMAP's "unobserved `ECL2#1` entrance"** refers to the native DOSBox transition into this
  block never having been captured. It does not affect this leg, whose spawn is grounded in the
  block's own `initial_entry` rather than in that transition.
- **Not wired into the browser.** No `?explore=` route was added; this is an engine-level proof.

---

## 13. Reproduction

```powershell
pnpm --filter @goldbox/engine test          # includes packages/engine/test/gatewayYartarEarly.test.ts
python tools/find_geo_path.py --geo "C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO2.DAX" `
    --block 1 --start 1,10 --target 2,12 --facing north
```
