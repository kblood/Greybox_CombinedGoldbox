# Pools of Darkness — the ENDING route (`ECL1.DAX#75`)

**Verdict: PROVEN** (engine-level; static retail bytes + this repo's real `EclVm`). No DOSBox-X, no
GameLink, no emulator, no screenshots were used at any point.

**Golden test:** `packages/engine/test/poolsEndingRoute.test.ts` — 10 cases, 132 `expect()` calls,
10/10 passing against the live GOG install.

**Matrix row:** `tools/goldbox_campaign_matrix.json` → `pools-of-darkness` → `legs.ending`.

Every number in §§1–8 below was measured in this pass from the retail files. §9 records a real,
byte-proven **dialect defect that is deliberately NOT shipped**. §10 is the honest limits list. §11
carries the six adversarial refuter citations verbatim.

---

## 0. Method, and the one trap that must not be repeated

All static work goes through `tools/gen1_ecl_encounter_scan.py`'s own state machine — `scan_block`,
`decode_one`, `successors`, `header_entries` — called with **both** `word_sets_for_profile` and
`opcodes_for_profile` for `pools-of-darkness`. The 0x41 extended opcode (`POOLS_AWARD_XP`) is
load-bearing: without it, block 75 truncates at vaddr 0x8A8C and the entire finale is invisible.

```
scan_block(ECL1#75, address_addend=0x8000,
           word_sets=word_sets_for_profile('pools-of-darkness'),
           opcodes=opcodes_for_profile('pools-of-darkness'))
  -> decoded_instruction_offsets = 512
     truncated_offsets           = 0
     explored_states             = 617
     state_limit_reached         = False
```

A walker that drops `scan_block`'s own `next_compare_outcomes` reset reports **84**. A BFS that
dedupes on offset alone and drops the GOSUB return stack reports **244**. Both are wrong; the 244
figure was produced confidently earlier in this project and is recorded in
`docs/engine/research/gen1-ecl-extended-opcodes.md`. **Any future walk of this block that does not
reproduce 512 / 0 / 617 is wrong.**

Where a corpus-wide census is needed, this pass used an instrumented **mirror** of `scan_block`
(same state key, same compare narrowing, same successor rules) that also returns the decoded offset
set. It was validated against the real `scan_block` on **all 56 blocks** — decoded count, truncated
count, `explored_states` and `state_limit_reached` identical on every block, **zero mismatches** —
before any of its output was used.

Addressing: `vbase 0x7FFE`, file offset `= vaddr - 0x8000 + 2`. Gen1 `SAVE` puts the **destination
last**. Dialect `ECL_GEN1_SHORT_POOLS`, word sets `{12:4, 29:0, 31:1, 33:2, 34:0, 35:0, 44:1, 55:2}`,
`cellDescAddr 0x002D`, `lastBlockIdAddr 0x0016`.

---

## 1. Retail identity

Resolved through `goldbox_corpus.choose_install` / `file_index`; install
`C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`.

| File | Bytes | sha256 |
| --- | ---: | --- |
| `ECL1.DAX` | 329,456 | `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af` |
| `GEO1.DAX` | 28,349 | `d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f` |
| `MON1CHA.DAX` | 13,428 | `dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef` |

Pools ships exactly **one** script archive, 56 blocks:
`{1-4, 16-27, 32-42, 48-55, 64-77, 80-86}`. Decompressed blocks used here:

| Block | Bytes | sha256 |
| ---: | ---: | --- |
| 75 | 6,233 | `0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2` |
| 24 | 7,625 | `9c2b7f8f730ab3d3c3af417c34f344c7c8274c9b1fc6c6a4ad0a9d02a6d3c89b` |
| 23 | 7,617 | `1f29e34f251fac429ed3c6b5daef4b3a1f293da2ab9842834a5418bd71eff4a9` |
| 65 | 6,567 | `0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425` |
| 67 | 6,473 | `4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347` |
| 73 | 7,660 | `2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3` |
| 74 | 7,368 | `efbf09a9173e4c81532357df6bb6e579000dcf2c890b7cec976c536cbea6e3cb` |
| 39 | 6,446 | `20edfda5fcdf0fc726984d0e29d2a4811ba1a89fd5788567cd7583da9018a005` |
| 18 | 6,141 | `0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357` |

Block 18's hash is **identical to the value this game's already-proven `middle` citation records** —
an independent cross-check that this pass resolved the same install.

`GEO1.DAX` ships 32 map blocks: `{1, 16-22, 32-37, 39, 48-50, 52, 53, 64-71, 81-84}`. **There is no
GEO block for 73, 74 or 75** — the three endgame script blocks are cutscenes, not maps.

---

## 2. Block 75 is a cutscene block, not a map area

Header bytes 0..21 = `88 13 01 01 a8 97 01 01 a8 97 01 01 a8 97 01 01 a8 97 01 01 14 80`.

- magic `0x1388`
- `vm_run_1` = `search_location` = `pre_camp_check` = `camp_interrupted` = **0x97A8**, and the byte at
  0x97A8 is `0x00` — a bare `EXIT`. Entering block 75 as a *map* does literally nothing.
- `initial_entry` = **0x8014** (= byte offset 22).

Measured over the whole block:

- **exactly one** `ON_GOTO` — 0x89BD, on the combat-tier word `[0x025C]`, not on a cell descriptor;
- **zero** references to the dialect's `cellDescAddr` `0x002D`;
- **exactly one** reference to `lastBlockIdAddr` `0x0016`, and it is the *destination* operand of
  0x8014 `SAVE #75 -> [0x0016]` (`09 00 4b 01 16 00`). Block 75 **writes** the last-block-id slot and
  never reads it.

Entry is therefore by `NEWECL` only, and **block 75 does not branch on which block called it**. The
fork is on persistent story flags:

| vaddr | bytes | meaning |
| --- | --- | --- |
| 0x801A | `03 01 ee 02 00 ff` `16` `01 01 6f 96` | `COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F` |
| 0x8025 | `03 01 54 02 00 ff` `16` `01 01 9a 85` | `COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A` |
| 0x8030 | `03 01 d0 01 00 ff` `16` `01 01 dd 85` | `COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD` |
| 0x803B | `0e 00 74` | else `PICTURE #116` — the mid-campaign arm |

### 0x859A is a prefix, not a third denouement

Decoding forward from 0x859A gives exactly four instructions —
`SAVE #0->[0x0039]`; `PICTURE #12`; `PRINTCLEAR "SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE
RUINOUS SUBJECTS OF BANE!"`; `PARTYSTRENGTH` (0x85DC, byte `1d`) — and the fourth **ends exactly on
0x85DD**. Block 75 has **two** destinations: the finale (0x85DD) and the epilogue (0x966F), and the
epilogue is also the finale's own fall-through end.

The un-flagged fall-through arm is the **MID-campaign** Shal / Petra / Vessel-of-Moander scene
(0x80D9 `"YOU LEAP THE GAP TO THE TEETERING CUP. BENEATH IS AN ABYSS."`; 0x8289 `"SUDDENLY, A SCREAM!
AND PETRA HURTLES PAST YOU INTO THE CATACLYSM BELOW."`; 0x8578 `"REVEALING A POOL OF DARKNESS!"`)
ending 0x8591 `SAVE #1->[0x000E]`; 0x8597 `NEWECL #18` (`20 00 12`).

**The ending claim is pinned to the 0x85DD arm, not to the block.**

---

## 3. Coverage of block 75 — the honest inventory

6,036 of 6,233 bytes are covered by decoded instructions; 22 bytes are the header; **175 bytes remain
uncovered in FIVE runs** (95 + 57 + 4 + 18 + 1 = 175, and 6,036 + 22 + 175 = 6,233):

| run | size | contents |
| --- | ---: | --- |
| 0x8079..0x80D7 | 95 B | alternate Shal narration. Unreached because its callee at 0x97A9 ends `SPRITE_OFF; GOTO <operand code 0xBF>; EXIT` with no `RETURN` — see §9, this is the 0x31 framing defect. |
| 0x824F..0x8287 | 57 B | the WAIT-too-long party-wipe arm, reachable only from inside the first run. |
| 0x87CC..0x87CF | 4 B | **ON THE ENDING ARM.** `01 01 04 89` = `GOTO 0x8904`, the taken branch of the 0x87CB `IF_NE` that follows 0x87CA `PARTY_SURPRISE`. Pruned by an inherited compare-outcome constraint. Opens no new destination — 0x8904 is already reached from 0x8A88. |
| 0x97D0..0x97E1 | 18 B | the `MENU [0x00BF] #2 "JUMP" "WAIT"` bytes (§9). |
| 0x9856 | 1 B | trailing `0x00`. |

An earlier draft of this analysis said "three runs, none on the ending arm." Both halves of that were
wrong: there are five runs, and 0x87CC is on the ending arm. It is benign, but it is recorded here
rather than smoothed over.

---

## 4. The guard-word census — no hidden writer exists

The corpus-wide aligned CFG walk over all 56 blocks yields **29,356 decoded instructions plus 15
truncated offsets** (one each in blocks 16, 18, 20, 22, 23, 36, 37, 41, 48, 52, 69, 74, 77, 81, 83 —
e.g. blk23@0x99D1 byte `0x60`, blk74@0x9B6F byte `0x9C`). An earlier figure of "29,371 reachable
instructions" was decoded + truncated reported as decoded.

Because two of those truncating blocks (23, 74) are load-bearing below, **each census is also run as
an alignment-free raw operand sweep** over codes `{1, 2, 3, 0x81}`, which a decode hole cannot
defeat.

| word | aligned refs | aligned writes | raw sites | notes |
| --- | ---: | ---: | ---: | --- |
| `[0x02EE]` | 19, over 12 blocks {1,2,3,17,19,21,23,24,26,52,66,75} | **1** | 21 | The single write is blk75@0x9666 `09 00 ff 01 ee 02` `SAVE #255->[0x02EE]`. The 2 extra raw sites (blk32@0x9707, blk66@0x9BA6) are CFG-unreachable READ operands of `POOLS_AWARD_XP #1,[0x02EE]`. |
| `[0x0254]` | 9 | 3 | 9 | blk65@0x868F `SAVE #1`; blk73@0x8400 `SAVE #255`; blk73@0x8603 `ADD #1`. |
| `[0x01D0]` | 4 | 2 | 5 | blk73@0x86A5 and blk74@0x86B0, both `SAVE #255`, never cleared. The 1 raw extra (blk65@0x9910) is a CFG-unreachable READ. |
| `[0x01CF]` | 9 | 2 | 10 | Block 65's own handoff gate; both writers are in block 73 (0x836A `SAVE #0`, 0x8398 `SAVE #255`). |

**`[0x02EE]` is the campaign-completion latch: one writer, eighteen readers, twelve blocks.** Its
sole writer is on the ending arm of block 75.

*Limit on that negative:* it covers writes whose destination operand names the address literally.
Indirect `SAVE_TABLE` (0x35) writes `base + offset`; a census of all table sites finds ten distinct
bases `{0x0001, 0x0097, 0x0098, 0x009A, 0x00B5, 0x02EF, 0x0385, 0x03E9, 0x041F, 0x9B33}`, none equal
to 0x02EE and the nearest below it (0x00B5) requiring a runtime offset of 569 — implausible, but not
formally excluded.

### Entrances to block 75

`NEWECL #75` has **exactly three** aligned sites, and the alignment-free `20 00 4b` sweep returns
**exactly the same three** — so there is no unaligned immediate entrance:

- `blk65@0x8488` — endgame, arrives with `[0x01D0]` already 0xFF
- `blk73@0x8484` — endgame, arrives with `[0x0254]` already 0xFF
- `blk67@0x8A19` — **mid-campaign**, gated by 0x89D0 `COMPARE [0x0250],#0`, arrives with all three
  flags clear

Four *dynamic*-operand `NEWECL`s exist corpus-wide: blk1@0x829A `NEWECL [0x00C0]`, blk18@0x8746
`NEWECL [0x009A]`, blk18@0x8851 `NEWECL [0x009B]`, and blk83@0x8BCB `20 02 01 bf`. The last is a
**mis-parse proven by overlap** — the same walk also decodes an `AND` at 0x8BC7 spanning
0x8BC7..0x8BCF, so 0x8BCB is interior to another decoded instruction. blk1's is this project's
already-documented shipped **developer JUMPER** (0x8063 menu `['JUMPER','START']`, 0x81C6 `"WHAT ECL
DO YOU WISH TO GO TO? (IN DECIMAL)"`, 0x81EA `INPUT_NUMBER #2,[0x00C0]`) and can reach any block id,
so "exactly three" is exact for *campaign* entrances and a lower bound overall. **Nothing in the
ending claim depends on the entrance census** — which arm runs is decided solely by block 75's own
guards at 0x801A / 0x8025 / 0x8030.

---

## 5. The approach chain

```
blk73@0x86A5  SAVE #255 -> [0x01D0]      (09 00 ff 01 d0 01)
blk73@0x86AB  NEWECL #65                        ─┐
blk74@0x86B0  SAVE #255 -> [0x01D0]              ├─► block 65 (the palace map)
blk74@0x86B6  NEWECL #65                        ─┘

block 65  0x8022  COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4   ← armed re-entry skips the spawn
          0x8171  COMPARE [0x01CF],#255 / IF_NE / GOTO 0x848B   ← the FOURTH gate (crystal held)
          0x8488  NEWECL #75                                    ← the endgame entrance
          0x868F  SAVE #1 -> [0x0254] ; 0x8695 NEWECL #73        ← the alternate (limbo) route

block 73  0x8603  ADD #1 -> [0x0254]
          0x860C  COMPARE [0x0254],#6                            ← run out of turns…
          0x865E  DAMAGE #224,#10,#10,#255,#0  (2e 00 e0 00 0a 00 0a 00 ff 00 00)  ← …party wipe
          0x83F9  COMPARE [0x0254],#0 / 0x83FF IF_NE / 0x8400 SAVE #255 -> [0x0254]
          0x8484  NEWECL #75
```

The endgame word set is therefore **four** words, not three: `[0x01CF]` (block-65 handoff enable,
written only by block 73), `[0x01D0]` and `[0x0254]` (finale arm selectors), `[0x02EE]` (completion
latch).

### The physical approach exists

Block 65 **is** a real map area — distinct header entries (`vm_run_1` 0x8776, `search_location`
0x880F, `pre_camp_check` 0x8722, `camp_interrupted` 0x876C) and a genuine cell dispatch:

```
0x8822  2f 00 3f 01 2d 00 01 9b 00   AND #63,[0x002D] -> [0x009B]
0x8836  ON_GOTO [0x009B],#12 -> 0x8861 0x8ACD 0x8B34 0x8C26 0x8F6E 0x9049
                                 0x9122 0x913F 0x91ED 0x9302 0x9348 0x95DD
0x95DD  09 00 01 01 5d 02 20 00 4a   SAVE #1 -> [0x025D] ; NEWECL #74
```

Arm 11 (0-based) is the **only** one of the twelve that reaches any `NEWECL`, and it starts the
endgame arming chain. In `GEO1#65` (1,026 B, sha256 `b032a6b0559a5df054550d72675e8666373244296c4a3a431123e42767588772`)
exactly **three** cells satisfy `descriptor & 63 == 11` — **(9,7), (8,8), (7,9)**, all raw `0x8B`.
Over the real wall/door graph, 248 of 256 cells are connected and all three are **36 steps** from
block 65's own spawn (0x8044/0x804A `SAVE #0 -> [0x0034]/[0x0035]` = (0,0)).

What is *not* done: a `find_geo_path`-grade VM walk of those 36 steps. The map facts are proven; the
walk is not claimed.

---

## 6. The finale (0x85DD)

Verbatim 6-bit inline strings at their instruction vaddrs, in script order:

| vaddr | text |
| --- | --- |
| 0x85E6 | `YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH.` |
| 0x8611 | `THE DARK FLUID BEGINS TO BOIL. FELL CREATURES EMERGE!` |
| 0x8640 | `WITH A CLATTER OF SKELETAL WINGS DRACOLICHES SOAR UP FROM THE POOL, SHRIEKING THEIR HATE!` |
| 0x868A | `GIANT BITS OF MOANDER BOB TO THE SURFACE AND CLAMBER UP THE SIDES. BEHIND COME BANE MINIONS!` |
| 0x86D6 | `THEN THE GLEAMING BLACK PETS OF KALISTES HOIST THEMSELVES FROM THE HORRIPILATING LIQUID.` |
| 0x871F | `THERE SEEMS TO BE NO END TO THEM.` |
| 0x876A | `THE CRYSTAL GLOWS WITH EVIL POWER!` |
| 0x879C | `" COUNTERMAND THE SUMMONS? IT COULD BE DEADLY TO TRY THIS."` |
| 0x890D | `THE LOYAL MINIONS ADVANCE ON YOU. THE BEHOLDER XOHAM GOADS THEM ON FROM BEHIND!` |
| 0x8B9F | `EYES FULL OF HATRED, XOHAM ASSAILS YOU!` |
| 0x8C90 | `EXHAUSTED, THE MAGE STUMBLES, AND THE BALOR'S WHIP SWEEPS HIM INTO THE POOL!` |
| 0x8CCD | `IN THE BLINK OF AN EYE HE SLIPS UNDER THE SURFACE, AND IS GONE.` |
| 0x8D42 | `HIS EYE TRAVELS OVER THE MOUNTAINS OF RUIN YOU HAVE LEFT, AND A SPECTRE OF DOUBT PASSES OVER HIS FACE.` |
| 0x8E45 | `'WITH IT YOU CAN RULE THE REALMS! I WILL TEACH YOU THE WORD TO COMMAND IT, IF YOU WILL LET ME GO.' ` |
| 0x8F0E | `'TO CONTROL BANE'S CRYSTAL, SAY...` |
| 0x8F2E | `          'PANAJUXID'` |
| 0x9261 | `'PREPARE FOR THE ENDLESS COLD, YOU INSECTS. I WILL NOW SEND YOU STRAIGHT TO THE ICY BOSOM OF LORD BANE!'` |
| 0x9426 | `EMBOLDENED, THE BALOR CLOSES FOR A DUEL TO THE DEATH!` |
| 0x958B | `THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES.` |
| 0x9603 | `" HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN "` |
| 0x963D | `" FINGERS, AND BLOWS AWAY ON A FRESHENING WIND."` |

### The PANAJUXID puzzle is real input, and saying the word LOSES

```
0x8F7A  09 80 00 81 3f 03                        SAVE "" -> memstr[0x033F]
0x8F80  10 00 0f 81 3f 03                        INPUT_STRING #15, memstr[0x033F]
0x8F86  03 81 3f 03 80 07 40 13 81 29 56 09 10   COMPARE memstr[0x033F],"PANAJUXID"
0x8F93  IF_EQ / 0x8F94 GOTO 0x8FE2               → the LOSING ending
0x90EC  2e 00 e0 00 0a 00 0a 00 ff 00 00         DAMAGE #224,#10,#10,#255,#0
0x90F7  00                                       EXIT
```

Driven through the real VM, resuming the `INPUT_STRING` with `"PANAJUXID"` returns status `exited`
carrying one `damage` effect: `dice {count 10, sides 10, bonus 255}`, policy
`{mode automatic, target party, reason noSaveFlag}`, operands `[224,10,10,255,0]`. Any other word
takes 0x8FA3 `'WRONG! BUT MY BLACK HEART LEAPS TO SEE YOUR WEAKNESS FOR POWER!'` and the script
continues; empty input goes to 0x90F8.

### Combats

Pose written by the script itself at 0x89A5/0x89AB/0x89B1/0x89B7:
`SAVE #8->[0x0034]`, `SAVE #8->[0x0035]`, `SAVE #2->[0x0011]`, `SAVE #100->[0x001B]`.

`0x89BD  25 01 5c 02 00 03 01 cc 89 01 f5 89 01 1e 8a` = `ON_GOTO [0x025C],#3 -> 0x89CC, 0x89F5,
0x8A1E`; the tier is set at 0x880E/0x8815 from 0x8801 `RANDOM #25,[0x00BF]` against `[0x0416]`, and
reset to 0 at 0x8A82 on defeat.

Rosters reproduced by running the real `EclVm` from each arm's own vaddr. **Monster ids in
`LOAD_MONSTER` are 1-BASED**: id *N* is `decodeMonsterArchive(...)[N-1]`, the record whose `blockId`
is *N*. (`records[77]` is `MARCUS`; `records[76]` is `DRACOLICH`.)

| arm | roster | names |
| --- | --- | --- |
| 0x89CC (tier 0) | 77×11, 3×9, 9×13, 7×7 | DRACOLICH, BIT O MOANDER, MINION OF BANE, PET OF KALISTES |
| 0x89F5 (tier 1) | 77×7, 3×5, 9×13, 7×9 | " |
| 0x8A1E (tier 2) | 77×5, 3×4, 9×11, 7×9 | " |
| 0x8BC0 (Xoham) | 95×2, 94×1, 31×`[0x00C4]` | DEATH TYRANT, ELDER ORB, BEHOLDER |
| 0x9252 (agreed / wrong word) | 12×1, 28×3, 9×8, 4×3 | GOTHMENES, GREEN DRAGON, MINION OF BANE, BIT O MOANDER |
| 0x941D (refused) | 12×1, 28×2, 9×8, 3×2 | " |

Scripted XP via the extended opcode: 0x8A8C `41 00 01 00 96` `POOLS_AWARD_XP #1,#150`;
0x8C41 `41 00 01 00 fa` `POOLS_AWARD_XP #1,#250`.

---

## 7. Terminus and epilogue

```
0x94D1  the winning terminus
0x9666  09 00 ff 01 ee 02   SAVE #255 -> [0x02EE]   ← the ONLY write of the latch in all 56 blocks
0x966C  38 00 01            PROGRAM #1              ← byte fact; host semantics NOT traced
0x966F  the epilogue (PICTURE #131)
          0x9678 "AS IF FROM FAR AWAY, ELMINSTER SPEAKS."
          0x969F "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'"
          0x96CD "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'"
          0x970D "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK.
                   I SHALL NOT FORGET YE.'"
          0x9763 "THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS..."
0x9793  09 00 04 01 3a 00  09 00 09 01 25 00  09 00 04 01 26 00  20 00 18
        SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24
0x97A8  00                 EXIT
```

The 0x801A guard makes the epilogue the **replay path**: once `[0x02EE] = 255`, any later entry to
area 75 jumps straight to 0x966F.

### `NEWECL #24` is neither a credits roll nor a restart

`ECL1#24` is a **completion-gated post-victory Phlan**: a full playable town block with its own
`vm_run_1` 0x8211 / `search_location` 0x8A0B / `pre_camp_check` 0x815B / `camp_interrupted` 0x81C8,
`LOAD_FILES #17,#1` at 0x8061 and a spawn triple at 0x8066/0x806C/0x8072 — whose **first instruction**
is

```
0x8014  03 01 ee 02 00 00  16  20 00 10    COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16
```

i.e. it refuses to run and re-routes to the ordinary Phlan block unless the latch is set. Its own
text: 0x809C `"YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND
CHILDREN PLAY IN THE STREETS."`; 0x80F1 `"FROM ALL APPEARANCES, PHLAN IS THE SAME AS IT WAS THE DAY
YOU FIRST ARRIVED."`

Two more blocks agree on the polarity of the same latch: blk23@0x84BF
`03 01 ee 02 00 00 17 20 00 18 20 00 10` (`COMPARE [0x02EE],#0 / IF_NE / NEWECL #24, else NEWECL
#16`), and block 26 uses it to swap the **world**, not just a destination (0x80D6 / 0x8480 select
`NEWECL #25` vs `#17`; 0x8123 swaps the whole 27-arm cell-dispatch table). Nothing but block 75's
0x9666 can flip any of that.

---

## 8. Live engine verification

All runs use this repo's own `EclVm` on the retail bytes, dialect `ECL_GEN1_SHORT_POOLS`, seed 1.

| run | result |
| --- | --- |
| `ECL1#75` entry 22, empty memory | the MID-campaign Petra / Vessel scene, `awaiting-input`, `PICTURE #116`, no chain |
| `ECL1#75` entry 22, `[0x01D0]=255` | the six finale opening beats verbatim, then **`halted` / `step-budget exceeded`** |
| `ECL1#75` entry 22, `[0x0254]=255` | the *identical* six beats **prefixed** by the Gothmenes-summons line, then the same halt |
| `ECL1#75` entry 22, `[0x02EE]=255` | the five epilogue beats alone, `chain` → block **24**, `[0x003A]=4 / [0x0025]=9 / [0x0026]=4` |
| `ECL1#75` from 0x9252, victory | full crystal-to-dust narration, `[0x02EE]=255`, `chain` → block **24**, same triple |
| `ECL1#75` from 0x941D, victory | ditto, with the refused-arm roster |
| `ECL1#75` from 0x8F7A, resume `"PANAJUXID"` | `exited` carrying the party-wipe `damage` effect |
| `ECL1#75` from 0x8F7A, resume `"BANANA"` | the taunt arm, not `exited`, zero `damage` effects |
| `ECL1#24` entry 22, no latch | `chain` → block **16**, zero text |
| `ECL1#24` entry 22, `[0x02EE]=255` | the post-victory Phlan narration, `exited` |

### DISCLOSED HARNESS STOP

The two seeded finale arms **do not run to a clean pause**. The crystal-bearer scan at 0x9817 is

```
0x9817  SAVE #0 -> [0x00BF]
0x981D  LOAD_CHARACTER [0x00BF]
0x9821  03 81 2b 03 81 01 04   COMPARE memstr[0x032B], memstr[0x0401]
0x9828  IF_EQ / GOTO 0x983A
0x982D  ADD #1,[0x00BF] -> [0x00BF]
0x9836  GOTO 0x981D
```

In a headless VM neither string cell is ever populated, and `EclVm.rvalue` for a `0x81` operand
returns **the pointer itself** — so the compare is `0x032B` vs `0x0401` forever and the loop cannot
terminate. Raising the step budget does not help; seeding numeric memory does not help (both operands
are string cells). Those two runs therefore prove **arm selection only**. The terminus is proven
separately, by entering at each balor arm's own vaddr.

### Cross-block continuity

Executed through **one shared memory map**:

- `ECL1#65` entry 22, `{[0x01D0]=255, [0x01CF]=255}` → prints `'I WILL OCCUPY THE BALOR!'` and
  `HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE.`, returns `chain` → **75**.
  - negative control: with `{[0x01D0]=255}` only → `chain` → **73** (not 75).
  - negative control: with nothing seeded → `exited` after the antechamber line, no chain.
- `ECL1#75` from 0x9252 with that same map → `chain` → **24**, `[0x02EE]=255`.
- `ECL1#24` entry 22 with that same map → post-victory Phlan, `exited`.

**Not claimed:** no *single* VM run crosses a `NEWECL` boundary, and the block-75 leg of the chain is
re-entered at a balor arm rather than at block 75's own entry, for the reason above.

---

## 9. A real dialect defect — SHIPPED 2026-08-06, see the update at the end of this section

> **STATUS UPDATE (2026-08-06).** The heading below and its "Why it is not shipped here" paragraph
> are superseded. `0x31 = MENU` **is now shipped** for the Gen1-SHORT family, scoped exactly as this
> section recommended. See §9.1 and `docs/engine/research/gen1-ecl-extended-opcodes.md` §8. The
> analysis in the rest of this section is retained unchanged because it is what motivated the fix and
> it predicted the outcome correctly.

The Gen1-**short** family's opcode `0x31` is a **MENU** (`wordSet 2`, `countAt 1` — the
`HORIZONTAL_MENU` 0x2B frame), not the shared table's zero-operand `SPRITE_OFF` that
`packages/engine/src/ecl/opcodes.ts:89` and `tools/dqk_ca03_stream_decode.py` both carry and that
`ECL_GEN1_SHORT_POOLS` does not override.

The decisive site is inside the subroutine three of block 75's `GOSUB`s call:

```
0x97A9  SAVE #14 -> [0x0039] ; 0x97AF PRINT " 'JUMP ON, YOU FOOLS!' "
0x97CB  31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54
        = MENU [0x00BF] #2 "JUMP" "WAIT"   (16 B)
0x97DB  03 00 01 01 bf 00    COMPARE #1,[0x00BF]
0x97E1  13                   RETURN
```

Under the shipped frame those same bytes read as `SPRITE_OFF` + a `GOTO` whose operand code is `0xBF`
— not one of the six legal `EclOpp` codes `{0,1,2,3,0x80,0x81}` — and the routine appears to end in
`EXIT`, destroying its callers' fall-through.

Corpus metric, all 56 Pools blocks, **only** 0x31's frame changed (re-measured this pass):

| | shipped `SPRITE_OFF` | `0x31 = MENU` |
| --- | ---: | ---: |
| CFG-reachable instructions | 29,356 | **32,516** |
| illegal operand codes | 448 | **335** |
| truncated bytes | 15 | 16 |
| reachable 0x31 sites | 135 | **141** |
| successor histogram | `GOTO` 135/135, every one the same bogus `01 bf 00` | `ON_GOTO` 85 / `COMPARE` 43 / `RETURN` 4 / `PRINTCLEAR` 2 / 7 singletons |
| inline menu items decoding to legal English | 0 | **403 / 403** |

Sample decoded items: `['ATTACK','FLEE','TALK','WAIT']`, `['FORCE THE DOOR','PICK','KNOCK','NOTHING']`,
`['PUT IT ON','EXAMINE IT','THROW IT AWAY']`. Count operand is always 2–5.

**Cross-title control** (reported by the reach-angle refuters; not re-measured in this pass): DoK
improves identically (12,443 → 13,571 reachable, 548 → 515 illegal, 135/135 legal items), Gateway /
Treasures / Champions have zero reachable 0x31 sites (no signal), and **CoAB — the Gen1-*long*
dialect — REGRESSES** (illegal operand codes 0 → 67, only 10/17 items legal). So the fix must be
scoped to the short family.

**Why it is not shipped here.** This leg's verdict does not depend on it: the `NEWECL #75` entrance
census is identical under both frames, and the ending arm's only casualty is the 4-byte
0x87CC `GOTO 0x8904`, whose target is reached anyway. Shipping a dialect change touching 141 Pools +
63 DoK sites is a separate, larger change with its own gates. It is recorded here as an open item and
asserted at its one ending-arm cost site in the golden (case B) so the gap is visible rather than
silent.

**Residual anomaly, recorded not smoothed:** of the 141 sites, 138 write a low scratch word
(`[0x00BF]` ×103, `[0x00C1]` ×12, `[0x00C0]` ×11, `[0x00AB]` ×6, `[0x0098]` ×5, `[0x009F]` ×1); the
other three are blk81@0x8B86 → `[0x00C2]`, blk82@0x8B1F → `[0x009D]`, and blk65@0x9481 → `[0x01D1]`,
which sits in the persistent story-flag range next to `[0x01D0]`.

### 9.1 Shipped (2026-08-06)

Committed as `683248b`, scoped to the Gen1-SHORT family exactly as recommended above — the LONG
dialects (Pool of Radiance, CoAB, Secret) keep `SPRITE_OFF`, so the CoAB-style regression this
section warned about cannot occur. Post-ship measurement confirms it: CoAB truncations stay 0 and
Pool of Radiance stays 1.

Two further pieces of evidence were found while shipping it, neither available to this section:

1. **The phantom operand code IS the menu destination.** Under the old frame the bogus `GOTO`'s
   operand *code* byte is the low byte of the destination the new frame reads (`0xBF` here; `0x79`
   of `0x7f79` in DoK `ECL2#67`; `0x98` in Pools `ECL1#51`).
2. **The next instruction reads that same cell.** At both newly-examined sites the byte after the
   menu is `0x25 ON_GOTO` whose selector is the identical address and whose arm count equals the
   menu's count operand. Menu-then-dispatch is a mutual reference the `SPRITE_OFF` frame cannot
   produce.

Two engine goldens turned out to have encoded the mis-framing and were corrected with the byte
evidence recorded inline (DoK's non-east ambush asserted `end` where retail offers `RETREAT`/`ATTACK`;
`poolsWildernessRoute` case J(f) asserted an "unresolved GOTO" that *was* the mis-framing). Neither
changed to make a suite green. **No verdict in this document depends on the change**, as the section
above already established.

**Correction to a claim quoted in this section.** The cross-title control above attributes the
regression to CoAB (0 → 67 illegal operand codes), sourced from the refuters rather than
re-measured. Re-measured corpus-wide, the regressing title is **Pool of Radiance**, not CoAB — CoAB
moves by −8 instructions. This does not change the conclusion (scope the fix to the short family);
it corrects which title is the evidence for it.

---

## 10. What is NOT claimed

1. **No native evidence.** No DOSBox-X, GameLink, emulator or screenshot was used. Every engine-side
   claim is retail bytes plus this repo's TypeScript `EclVm`; a VM opcode mis-model would be
   inherited silently.
2. **No single-run `NEWECL` crossing.** §8's continuity chains three blocks through one shared memory
   map, but each hop is a fresh VM, and the block-75 hop re-enters at a balor arm because of the
   headless party-scan stop.
3. ~~**No GEO walk.**~~ **CLOSED 2026-08-06 — golden case K.** The 36 steps from block 65's own
   spawn (0,0) to the arm-11 cell (9,7) are now walked one step at a time with the engine's real
   `Explorer`, every step asserted legal, and the arrival cell's descriptor `0x8B` handed to block
   65's own `search_location` in the real `EclVm`: it sets `[0x009B] = 11`, writes the arming word
   `[0x025D] = 1` and **chains to block 74**. Two negative controls on the same block, handler and
   seed — arm 10 (`0x8A`) exits with no chain and no write, arm 0 (`0x00`) is an ordinary combat —
   establish that the CELL DESCRIPTOR causes the handoff, not the act of priming the handler.
   The walk is also an **independent control on §5**: the engine's own `Explorer.canMove` rule
   reproduces the 248-cell component that §5's separate hand-rolled wall/door graph computed.

   Two limits remain, and case K asserts both rather than narrating them:
   - It is **geometric reachability, not an uninterrupted playthrough**. The shortest path crosses
     nine other masked descriptors, one of which is descriptor 0 — proved in the same case to be a
     combat arm. A live party would fight there. (Same limitation as the accepted
     `poolsQuestFlag.test.ts` walk.)
   - Block 75 itself still has **no** cell dispatch at all, so "reach the ending by movement" is
     proven for the *approach* (block 65 → 74), not for block 75, and is not claimed for it.
4. **`PROGRAM #1` (0x966C, `38 00 01`) is a byte fact only.** Its host semantics were not traced. The
   `EclVm` treats it as a fall-through, which is what makes the 0x9666 → 0x966F continuity work here.
   If retail `PROGRAM #1` terminates the process, the epilogue would still be reachable on replay
   through the 0x801A guard, but the single-run continuity would not hold.
5. **Register semantics are inference.** `[0x0025]`/`[0x0026]` are read corpus-wide through a
   four-neighbour cursor idiom in blocks 17/25/51/80, and `[0x003A]` has 15 writes of which 13 are
   immediates from `{0,1,2,3,4}`. Reading them as "overland cursor X/Y" and "region selector" is
   INFERENCE; only the byte-exact write set is proven.
6. **Which combat tier a real playthrough gets is unresolved.** `[0x025C]` derives from 0x8801
   `RANDOM #25,[0x00BF]` against `[0x0416]`, whose producer was not traced. All three rosters are
   proven reachable.
7. **Wave 2's beholder count is host-dependent.** `LOAD_MONSTER #31,[0x00C4],#31` reads a register
   set to 4 at 0x8B96 only when the 0x8B65 `LOAD_CHARACTER` loop's `[0x00C1]` is ≥ 1; it was seeded,
   not derived.
8. **Reach from the game's own start is not proven, and is a pre-existing corpus-wide gap.** The
   Phlan starting cluster `{16,23,24,25,39,40}` is a sink in the immediate-`NEWECL` graph; BFS from
   boot block 1 reaches only `{1,2,3,16,23,24,25,39,40}`. Reach to block 75 is proven **from the
   17/18 hubs forward**. The first hop out of Phlan is engine/GEO-driven or routed through one of the
   seven in-degree-zero blocks `{4,26,27,34,37,54,66}`; block 26 (`"YOU ARE ABOUT TO LEAVE.
   CONTINUE?"`, `NEWECL #17/#25/#36`) is the strongest untested candidate. This same gap already sits
   under the already-`proven` `middle` leg, whose ECL1#34 is likewise in-degree-zero.

   **Adjudicated 2026-08-06 — `middle` is NOT over-promoted, and stays `proven`.** The question was
   raised because this limit applies to `middle` verbatim. It does not demote it: the campaign
   matrix defines `proven` as *"Engine-level byte-grounded proof exists (VM golden and/or CFG trace
   against the real retail disassembly)… Live in-browser wiring is NOT required"* — a standard about
   the leg's own byte grounding, which `middle` meets abundantly, not a boot-reachability standard.
   Demoting on this basis would also be inconsistent, since the gap is **corpus-wide** and would
   equally demote legs across other titles that were promoted under the same charter. The honest
   framing is the one already used here: boot reachability is a *separate, pre-existing, shared*
   open item, tracked as this limit rather than folded into any single leg's status. If the project
   later decides boot reachability is required for `proven`, that is a **charter change** to be
   applied uniformly across every game, not a one-off adjustment to Pools.
9. **175 of 6,233 bytes of block 75 are outside the CFG walk** (§3). Four of the five runs are
   explained; the fifth is the 0x97A9 routine's `GOTO <operand code 0xBF>`. **RESOLVED 2026-08-06:**
   that run was the `0x31` framing defect, and the fix is now shipped (§9.1), so those bytes decode
   as the `JUMP`/`WAIT` menu plus its `COMPARE`/`RETURN` tail. The §3 byte census itself has not been
   recomputed against the corrected frame, so treat the "175 bytes / five runs" figure as
   pre-fix.
10. **Indirect writes of `[0x02EE]` are not formally excluded** (§4).
11. **No browser wiring.** No `?explore=` route id, no e2e acceptance, no rendering verified.

### Rejected alternative readings

- *"Block 75 is a mid-campaign cutscene."* Refuted — the un-flagged arm **is** the mid-campaign
  cutscene, and it is a different arm with a different terminus (`NEWECL #18`). The 0x85DD arm
  destroys Bane's crystal and is the sole writer of the world-state latch.
- *"Block 75 is a defeat or attract-mode sequence."* Refuted — it runs `LOAD_CHARACTER` party scans
  (0x8B65, 0x8D99, 0x9817), a real `INPUT_STRING`, real `COMBAT` pauses and a per-character HIS/HER
  pronoun sub (0x9841 on `[0x0567]`). The losing branches (0x90EC, blk73@0x865E) are separate
  `DAMAGE` + `EXIT` terminals that write nothing.
- *"`NEWECL #24` is a continuation, so block 75 is not a terminus."* Correct that it is a
  continuation — and that is the finding, not a refutation: the campaign narrative concludes at block
  75 and the game continues in a latch-gated post-victory world.
- *The one alternative worth naming:* `ECL1#39` (the optional trial area) holds 0x853A `"YOU HAVE
  SURVIVED AND OVERCOME THE GREATEST CHALLENGE IN YOUR CAREER. YOU MAY RETIRE CONTENT."`, then 0x8584
  `41 00 01 02 58 1b` (`POOLS_AWARD_XP #1, <operand code 2, word 0x1B58 = 7000>` — note the operand is
  code 2, not an immediate) and 0x858A `NEWECL #24` — a genuine competing "retirement" beat, and the
  third of the three aligned `NEWECL #24` sites (`blk23@0x84C6`, `blk39@0x858A`, `blk75@0x97A5`). It
  does **not** displace block 75: block 39 writes no latch (a raw `[0x02EE]` sweep over block 39
  returns zero sites), changes no world state, and its `NEWECL #24` is degraded back to block 16 by
  block 24's own 0x8014 gate whenever `[0x02EE] = 0`. It reads as the trial area's exit reward.

---

## 11. Adversarial refuter citations (verbatim)

Two independent finder passes (`route` and `reach`) were each reviewed by three adversarial lenses
(correctness / sufficiency / alternative). All six returned **stands-with-caveats**; none refuted the
`proven` verdict. Their `correctedCitation` strings are reproduced **verbatim and unedited** below,
including their disagreements with each other and with earlier drafts. Where this document's own
§§1–8 differ from one of them, this document's measurement was re-derived in this pass and is the one
carried into the golden test.

### 11.1 Route pass, correctness lens

*source:* `pools_ending_refute_route_correctness.json` — assessment `stands-with-caveats`, `correctedCitation` 19056 chars, reproduced verbatim.

```text
ENDING leg, pools-of-darkness -- verdict: PROVEN (engine-level, static + real `EclVm`; no DOSBox-X).

RETAIL (resolved via `goldbox_corpus.choose_install`/`file_index`; install `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`): ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks {1-4,16-27,32-42,48-55,64-77,80-86}; MON1CHA.DAX 13,428 B sha256 dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef, 122 records. Decompressed: ECL1#75 6,233 B sha256 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; ECL1#24 7,625 B 9c2b7f8f730ab3d3c3af417c34f344c7c8274c9b1fc6c6a4ad0a9d02a6d3c89b; ECL1#65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; ECL1#73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; ECL1#74 7,368 B efbf09a9173e4c81532357df6bb6e579000dcf2c890b7cec976c536cbea6e3cb; ECL1#67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; ECL1#18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357 (identical to the value this file's already-proven `middle` citation records -- an independent cross-check that this pass resolved the same install). Dialect ECL_GEN1_SHORT_POOLS, word sets {12:4,29:0,31:1,33:2,34:0,35:0,44:1,55:2} plus extended opcode 0x41 POOLS_AWARD_XP (wordSet 2); vbase 0x7FFE, offset = vaddr - 0x8000 + 2; SAVE dest LAST. Monster ids in LOAD_MONSTER are 1-BASED: id N is `decodeMonsterArchive(...)[N-1]`, the record whose `blockId` is N.

SCAN INTEGRITY (load-bearing). `scan_block(ECL1#75, address_addend=0x8000, word_sets=word_sets_for_profile('pools-of-darkness'), opcodes=opcodes_for_profile('pools-of-darkness'))` returns decoded_instruction_offsets=512, truncated_offsets=0, state_limit_reached=False, explored_states=617. A linearizer that omits `scan_block`'s own `next_compare_outcomes` reset reports 84 -- this pass hit that exact under-report before fixing it, so any future walk of this block that does not reproduce 512 is wrong. Coverage: 6,036 of 6,233 bytes decoded; 22 B header; 175 B uncovered in FIVE runs -- 0x8079..0x80D7 (95 B, alternate Shal narration, unreached because its callee 0x97A9 ends `SPRITE_OFF; GOTO <invalid operand code 0xBF>; EXIT` with no RETURN), 0x824F..0x8287 (57 B failed-jump death arm, reachable only from inside the first gap), 0x87CC..0x87CF (4 B), 0x97D0..0x97E1 (18 B `GOSUB "JUMP"` filler, not an instruction stream) and 0x9856 (1 B trailing EXIT). All five were decoded by hand. Note honestly that ONE of them, 0x87CC..0x87CF = `01010489` GOTO 0x8904, is ON THE ENDING ARM, not the mid-campaign arm: it is the taken branch of the 0x87CB IF_NE that follows 0x87CA PARTY_SURPRISE, pruned only by a compare-outcome constraint the scanner inherited, and its target 0x8904 is already reached from 0x8A88 -- so it opens no new destination.

BLOCK 75 IS A CUTSCENE BLOCK, NOT A MAP AREA. Header magic 0x1388; vm_run_1 = search_location = pre_camp_check = camp_interrupted = 0x97A8, which is a single EXIT byte (raw 0x00); initial_entry 0x8014 (= offset 22). The block contains exactly one ON_GOTO (0x89BD, on [0x025C]) and ZERO references to the dialect's cellDescAddr 0x002d -- there is no cell dispatch; entry is by NEWECL only. Entry guards, byte-exact: 0x8014 `09004b011600` SAVE #75->[0x0016]; 0x801A `0301ee0200ff` + `1601016f96` COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F; 0x8025 `0301540200ff` + `1601019a85` COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A; 0x8030 `0301d00100ff` + `160101dd85` COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD; else 0x803B PICTURE #116. CORRECTION to the earlier three-variant reading: 0x859A is NOT a third denouement -- it is a 3-instruction prefix (SAVE #0->[0x0039]; PICTURE #12; PRINTCLEAR "SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE RUINOUS SUBJECTS OF BANE!"; PARTYSTRENGTH at 0x85DC, byte `1d`) that falls straight through into 0x85DD. Block 75 has exactly TWO destinations: the finale (0x85DD) and the epilogue (0x966F), and the epilogue is also the finale's own fall-through end. The un-flagged fall-through arm is the MID-campaign Shal/Petra Vessel-of-Moander scene ("YOU LEAP THE GAP TO THE TEETERING CUP. BENEATH IS AN ABYSS." @0x80D8; "SUDDENLY, A SCREAM! AND PETRA HURTLES PAST YOU INTO THE CATACLYSM BELOW." @0x8288; "REVEALING A POOL OF DARKNESS!" @0x8577) ending 0x8591 SAVE #1->[0x000E]; 0x8597 NEWECL #18 -- so the ending claim is pinned to the 0x85DD arm only, not to the block.

GUARD-WORD CENSUS (aligned CFG walk over all 56 blocks = 29,356 decoded instructions plus 15 truncated offsets, one each in blocks 16/18/20/22/23/36/37/41/48/52/69/74/77/81/83; those 15 holes are the reason the census is ALSO cross-checked by an alignment-free raw operand sweep for codes 1/2/3/0x81, which cannot be defeated by a decode hole). [0x02EE]: 19 aligned refs, EXACTLY ONE write corpus-wide -- 0x9666 in block 75, `0900ff01ee02` SAVE #255->[0x02EE]; raw sweep finds 21 sites, the 2 extras (blk32@0x9707, blk66@0x9BA6) are CFG-unreachable READ operands `410001 02ee 02 1d` = POOLS_AWARD_XP #1,[0x02EE]. [0x0254]: 9 aligned refs / 9 raw, 3 writes -- blk65@0x868F SAVE #1, blk73@0x8400 SAVE #255, blk73@0x8603 ADD #1. [0x01D0]: 4 aligned refs / 5 raw, 2 writes -- blk73@0x86A5 and blk74@0x86B0, both SAVE #255, never cleared; the 1 raw extra (blk65@0x9910, `0301d00100ff17`) is a CFG-unreachable READ. NO HIDDEN WRITER EXISTS. NEWECL #75 census: aligned = exactly three (blk65@0x8488, blk67@0x8A19, blk73@0x8484) and the alignment-free `20 00 4b` sweep finds exactly the same three, so there is no unaligned entrance. blk67@0x8A19 is the mid-campaign entrance (gated 0x89D0 COMPARE [0x0250],#0, "THE VESSEL REELS IN SPACE, SHAKING ALL THE TOWER. SLICK FLUID SPLASHES ALL OVER." @0x89D9) and arrives with all three flags clear; blk65@0x8488 and blk73@0x8484 are the endgame entrances and each arrives with a finale flag already 0xFF. Approach chain, byte-grounded: blk73@0x86A5/blk74@0x86B0 SAVE #255->[0x01D0] then NEWECL #65 (0x86AB / 0x86B6); block 65 = "IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS. THE SMALL SOUNDS YOU MAKE SEEM TO CURL UP AND DIE." (0x805A), opens 0x8022 COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4, and reaches 0x8488 NEWECL #75 after "'I WILL OCCUPY THE BALOR!'" (0x8430) / "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE." (0x844E); separately blk65@0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73, where the limbo block increments it (0x8603 ADD #1) and, once the 0x860C COMPARE [0x0254],#6 guard stops passing IF_LT, kills the party -- "SUDDENLY GOTHMENES IS AMONG YOU, BANE'S CRYSTAL ON HIS BROW!" (0x861A) / "YOU HAVEN'T A CHANCE." (0x864B) / 0x865E `2e00e0000a000a00ff0000` DAMAGE #224,#10,#10,#255,#0 -- and arms 0xFF at 0x8400 under the 0x83F9 COMPARE [0x0254],#0 / 0x83FF IF_NE guard before 0x8484 NEWECL #75.

THE FINALE (0x85DD), verbatim inline 6-bit strings with their vaddrs: 0x85E6 "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH."; 0x8611 "THE DARK FLUID BEGINS TO BOIL. FELL CREATURES EMERGE!"; 0x8640 "WITH A CLATTER OF SKELETAL WINGS DRACOLICHES SOAR UP FROM THE POOL, SHRIEKING THEIR HATE!"; 0x868A "GIANT BITS OF MOANDER BOB TO THE SURFACE AND CLAMBER UP THE SIDES. BEHIND COME BANE MINIONS!"; 0x86D6 "THEN THE GLEAMING BLACK PETS OF KALISTES HOIST THEMSELVES FROM THE HORRIPILATING LIQUID."; 0x871F "THERE SEEMS TO BE NO END TO THEM."; 0x876A "THE CRYSTAL GLOWS WITH EVIL POWER!"; 0x879C " COUNTERMAND THE SUMMONS? IT COULD BE DEADLY TO TRY THIS."; 0x890D "THE LOYAL MINIONS ADVANCE ON YOU. THE BEHOLDER XOHAM GOADS THEM ON FROM BEHIND!"; 0x8B9F "EYES FULL OF HATRED, XOHAM ASSAILS YOU!"; 0x8C90 "EXHAUSTED, THE MAGE STUMBLES, AND THE BALOR'S WHIP SWEEPS HIM INTO THE POOL!"; 0x8CCD "IN THE BLINK OF AN EYE HE SLIPS UNDER THE SURFACE, AND IS GONE."; 0x8D42 "HIS EYE TRAVELS OVER THE MOUNTAINS OF RUIN YOU HAVE LEFT, AND A SPECTRE OF DOUBT PASSES OVER HIS FACE."; 0x8E45 "'WITH IT YOU CAN RULE THE REALMS! I WILL TEACH YOU THE WORD TO COMMAND IT, IF YOU WILL LET ME GO.' "; 0x8F0E "'TO CONTROL BANE'S CRYSTAL, SAY..."; 0x8F2E "          'PANAJUXID'"; 0x9261 "'PREPARE FOR THE ENDLESS COLD, YOU INSECTS. I WILL NOW SEND YOU STRAIGHT TO THE ICY BOSOM OF LORD BANE!'"; 0x9426 "EMBOLDENED, THE BALOR CLOSES FOR A DUEL TO THE DEATH!"; 0x958B "THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES."; 0x9603 " HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN "; 0x963D " FINGERS, AND BLOWS AWAY ON A FRESHENING WIND." The word puzzle is real input, not flavour: 0x8F7A `098000813f03` SAVE ""->memstr[0x033F]; 0x8F80 `10000f813f03` INPUT_STRING #15,memstr[0x033F]; 0x8F86 `03 813f03 8007 40138129560910` COMPARE memstr[0x033F],"PANAJUXID"; IF_EQ -> 0x8FE2 = the LOSING ending ("AS YOU SPEAK THE WORD, SOMETHING ERUPTS OUT OF THE POOL! " / "IT TAKES A LONG MOMENT TO REALIZE THAT THE TWISTED THING IS ELMINSTER. AND THAT'S ALL THE TIME YOU HAVE." / "'FOOLS, YOU HAVE OPENED THE CRYSTAL! WELCOME YOUR NEW MASTER!'") terminating 0x90EC `2e00e0000a000a00ff0000` DAMAGE #224,#10,#10,#255,#0 / 0x90F7 EXIT, which the engine models as an unconditional party-wide 10d10+255 with policy {automatic, party, noSaveFlag}; empty input -> 0x90F8; anything else -> 0x8FA3 "'WRONG! BUT MY BLACK HEART LEAPS TO SEE YOUR WEAKNESS FOR POWER!'".

COMBAT CONTRACT. Pose written by the script itself at 0x89A5/0x89AB/0x89B1/0x89B7: SAVE #8->[0x0034], SAVE #8->[0x0035], SAVE #2->[0x0011], SAVE #100->[0x001B]. 0x89BD `25015c02000301cc8901f589011e8a` ON_GOTO [0x025C],#3,[0x89CC],[0x89F5],[0x8A1E], the tier set at 0x880E/0x8815 from 0x8801 RANDOM #25,[0x00BF] vs [0x0416] and reset to 0 at 0x8A82 on defeat. Rosters decoded AND reproduced by running the real EclVm from each arm's own vaddr, with MON1CHA names read 1-based (index id-1): wave 1 tier 0 = 77x11, 3x9, 9x13, 7x7; tier 1 = 77x7, 3x5, 9x13, 7x9; tier 2 = 77x5, 3x4, 9x11, 7x9 (77 DRACOLICH, 3 BIT O MOANDER, 9 MINION OF BANE, 7 PET OF KALISTES -- the roster and the narration corroborate each other without either deriving the other); wave 2 = 95x2, 94x1, 31x[0x00C4] (DEATH TYRANT, ELDER ORB, BEHOLDER -- 0x890D names "THE BEHOLDER XOHAM"); its flee arm 0x8BF1 = 10x3, 9x7, 10x3 then re-fights via 0x8C3D GOTO 0x8BC0; final balor agreed/wrong-word arm 0x9252 = 12x1, 28x3, 9x8, 4x3 and refused arm 0x941D = 12x1, 28x2, 9x8, 3x2 (12 GOTHMENES, 28 GREEN DRAGON). Scripted XP via the extended opcode: 0x8A8C `4100010096` POOLS_AWARD_XP #1,#150 and 0x8C41 `41000100fa` POOLS_AWARD_XP #1,#250.

TERMINUS AND EPILOGUE. Winning terminus 0x94D1 runs straight-line to 0x9666 `0900ff01ee02` SAVE #255->[0x02EE] (the unique corpus-wide write) -> 0x966C `380001` PROGRAM #1 -> fall-through into the epilogue 0x966F (PICTURE #131): 0x9678 "AS IF FROM FAR AWAY, ELMINSTER SPEAKS."; 0x969F "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'"; 0x96CD "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'"; 0x970D "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK. I SHALL NOT FORGET YE.'"; 0x9763 "THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS..."; then 0x9793 `090004013a00 090009012500 090004012600 200018` = SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24; 0x97A8 EXIT. The 0x801A guard makes the epilogue the replay path: once [0x02EE]=255, any later entry to area 75 jumps straight to 0x966F.

WHAT ECL1#24 (NEWECL #0x18) ACTUALLY IS -- neither a credits roll nor a restart. It is a COMPLETION-GATED POST-VICTORY PHLAN: a full 589-instruction playable town block with its own vm_run_1 0x8211 / search_location 0x8A0B / pre_camp_check 0x815B / camp_interrupted 0x81C8, LOAD_FILES #17,#1 at 0x8061 and spawn SAVE #5->[0x0035] / SAVE #0->[0x0034] / SAVE #1->[0x0011] at 0x8066/0x806C/0x8072, whose FIRST instruction is 0x8014 `0301ee020000 16 200010` COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16 -- i.e. it refuses to run and re-routes to the ordinary Phlan block unless the completion latch is set. Its own text: 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND CHILDREN PLAY IN THE STREETS."; 0x80F1 "FROM ALL APPEARANCES, PHLAN IS THE SAME AS IT WAS THE DAY YOU FIRST ARRIVED." A second, independent block agrees: blk23@0x84BF COMPARE [0x02EE],#0 / 0x84C5 IF_NE / 0x84C6 NEWECL #24, else 0x84C9 NEWECL #16.

LIVE ENGINE VERIFICATION (repo's own EclVm on the retail bytes, dialect ECL_GEN1_SHORT_POOLS, seed 1). ECL1#75 from entry 22: empty memory -> the mid-campaign Petra/Vessel text, status awaiting-input at 0x819C, [0x0016]=75, [0x02EE] untouched; {[0x01D0]=255} -> the finale opening at "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH." through "THERE SEEMS TO BE NO END TO THEM.", then status halted / haltReason `step-budget exceeded` at 0x9821 -- the 0x9817 crystal-bearer LOAD_CHARACTER loop cannot terminate without host party data, so this seeding proves the ARM SELECTION, not the arm's completion; {[0x0254]=255} -> the identical six lines PREFIXED by the Gothmenes-summons line (7 texts), proving the 0x859A fall-through, then the same step-budget halt at 0x9836; {[0x02EE]=255} -> the epilogue alone, status 'chain', chainBlockId 24 at the 0x97A5 NEWECL, memory [0x003A]=4, [0x0025]=9, [0x0026]=4. The terminus is instead proven from the combat arms: from entry 0x914D and from entry 0x9314, driving past the parlay menus, each pauses at COMBAT with its own roster above, and resume(victory) runs the crystal-to-dust narration, sets [0x02EE]=255, and returns status 'chain' with chainBlockId 24 and [0x003A]=4 / [0x0025]=9 / [0x0026]=4. From entry 0x8F7A, resuming the INPUT_STRING with "PANAJUXID": status 'exited' carrying the damage effect {dice 10d10+255, policy {automatic, party, noSaveFlag}, operands [224,10,10,255,0]}. ECL1#24 from entry 22: with no [0x02EE] -> status 'chain', chainBlockId 16 at 0x801B, zero text; with [0x02EE]=255 -> the post-victory Phlan narration, status 'exited'. The [0x0025]/[0x0026] pair is read corpus-wide through the four-neighbour cursor idiom (SAVE [0x0025]->[0x00C0]; ADD/SUBTRACT #1,[0x0025]->[0x00C0]; same for [0x0026]->[0x00C1]) in exactly blocks 17/25/51/80 (12 hits each, nowhere else), and [0x003A] has 15 writes of which 13 are immediates drawn from {0,1,2,3,4} (blk2@0x8544 and blk3@0x8547 write a dynamic operand); reading them as "overland cursor X/Y" and "region id" is INFERENCE from that idiom -- what is PROVEN is the byte-exact write set and that block 24 sets the same three words to adjacent values (0x805A SAVE #4->[0x003A], 0x82AC SAVE #10->[0x0025], 0x82A6 SAVE #4->[0x0026]).

LIMITS, stated plainly: no DOSBox-X, GameLink, emulator or screenshot evidence -- every engine-side claim is retail bytes plus this repo's TypeScript EclVm, and a VM opcode mis-model would be inherited. The corpus-wide walk has 15 truncated (undecodable) offsets across 15 blocks; each guard-word conclusion is therefore additionally backed by an alignment-free raw sweep that a decode hole cannot defeat. Block 75 has no GEO cell dispatch at all (zero references to cellDescAddr 0x002d), so there is no "walk to the ending cell" leg to prove and none is claimed; the physical approach through block 65's palace map was not walked. The finale runs are entered by seeding a guard word or by entering at the arm's own vaddr; the producer-to-consumer link from blocks 65/73/74 is proven STRUCTURALLY (unique writers, unique NEWECL edges, alignment-free recall checks) but was not executed end-to-end across the NEWECL boundary in a single VM run. PROGRAM #1 at 0x966C is quoted as a byte fact (`380001`); its host semantics were not traced. Wave 2's LOAD_MONSTER #31,[0x00C4],#31 count is a register, set to 4 at 0x8B96 only when the 0x8B65 LOAD_CHARACTER loop's [0x00C1] count is >= 1, so the beholder count is host-dependent. The wave-1 difficulty tier [0x025C] derives from 0x8801 RANDOM #25,[0x00BF] compared against [0x0416], whose producer was not traced -- all three rosters are proven reachable, but which one a real playthrough gets is unresolved. No browser wiring, no `?explore=` route id and no e2e acceptance is claimed or implied.

Key addresses: ECL1#75 0x8014 SAVE #75->[0x0016] (09004b011600) -- area latch, ECL1#75 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F (0301ee0200ff 1601016f96) -- completion replay guard, ECL1#75 0x8025 COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A (0301540200ff 1601019a85), ECL1#75 0x8030 COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD (0301d00100ff 160101dd85), ECL1#75 0x859A prefix (SAVE #0->[0x0039]; PICTURE #12; PRINTCLEAR Gothmenes-summons; PARTYSTRENGTH @0x85DC byte 1d) -- falls through into 0x85DD, ECL1#75 0x85DD -- THE CAMPAIGN FINALE entry, ECL1#75 0x85E6 PRINTCLEAR "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH.", ECL1#75 0x87CC GOTO 0x8904 (01010489) -- the one uncovered ending-arm run, IF_NE-taken branch after 0x87CA PARTY_SURPRISE, ECL1#75 0x89BD ON_GOTO [0x025C],#3,[0x89CC],[0x89F5],[0x8A1E] (25015c02000301cc8901f589011e8a) -- wave-1 tier dispatch and the block's ONLY ON_GOTO, ECL1#75 0x8A43 COMBAT (wave 1); 0x8A8C POOLS_AWARD_XP #1,#150, ECL1#75 0x8BC0 SETUP_MONSTER #255,#1,#31,#15 / 0x8BE0 COMBAT (Xoham); 0x8C41 POOLS_AWARD_XP #1,#250, ECL1#75 0x8F80 INPUT_STRING #15,memstr[0x033F]; 0x8F86 COMPARE memstr[0x033F],"PANAJUXID" (03 813f03 8007 40138129560910), ECL1#75 0x8FE2 losing ending -> 0x90EC DAMAGE #224,#10,#10,#255,#0 -> 0x90F7 EXIT, ECL1#75 0x9252 (agreed arm) / 0x941D (refused arm) SETUP_MONSTER #255,#2,#12,#15 -- final balor combats, ECL1#75 0x94D1 winning terminus, ECL1#75 0x9666 SAVE #255->[0x02EE] (0900ff01ee02) -- THE ONLY write of the completion latch in all 56 blocks, ECL1#75 0x966C PROGRAM #1 (380001) -- falls through into the epilogue, ECL1#75 0x966F epilogue entry (PICTURE #131, Elminster's four speeches), ECL1#75 0x9793 SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24 (090004013a00 090009012500 090004012600 200018), ECL1#75 0x97A8 EXIT -- the target of all four map/camp header entries, ECL1#75 0x9817 crystal-bearer party scan sub (the step-budget stall point in a partyless VM run); 0x9841 HIS/HER pronoun sub on [0x0567], ECL1#75 0x8597 NEWECL #18 -- the MID-campaign terminus of the non-ending arm, ECL1#24 0x8014 COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16 (0301ee020000 16 200010) -- post-victory Phlan gate, ECL1#24 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN...", ECL1#23 0x84BF COMPARE [0x02EE],#0 / IF_NE / 0x84C6 NEWECL #24 else 0x84C9 NEWECL #16 -- second independent completion gate, ECL1#73 0x8400 SAVE #255->[0x0254] (armed under 0x83F9/0x83FF); 0x8484 NEWECL #75; 0x8603 ADD #1->[0x0254]; 0x860C COMPARE [0x0254],#6; 0x865E DAMAGE #224,#10,#10,#255,#0, ECL1#73 0x86A5 SAVE #255->[0x01D0]; 0x86AB NEWECL #65, ECL1#74 0x86B0 SAVE #255->[0x01D0]; 0x86B6 NEWECL #65, ECL1#65 0x8022 COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4; 0x8488 NEWECL #75; 0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73, ECL1#67 0x8A19 NEWECL #75 -- the MID-campaign entrance (gated 0x89D0 COMPARE [0x0250],#0)
```

### 11.2 Route pass, sufficiency lens

*source:* `pools_ending_refute_route_sufficiency.json` — assessment `stands-with-caveats`, `correctedCitation` 24665 chars, reproduced verbatim.

```text
ENDING leg, pools-of-darkness -- verdict: PROVEN (engine-level; static CFG trace over the retail bytes plus the repo's real `EclVm`; no DOSBox-X). Every number below was RE-DERIVED from the retail files by a second, adversarial pass on 2026-08-06, not transcribed from the originating pass; the corrections that pass forced are marked CORRECTED.

RETAIL (resolved via `goldbox_corpus.choose_install`/`file_index`; install `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`): ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks {1-4,16-27,32-42,48-55,64-77,80-86} -- Pools ships exactly ONE script archive. GEO1.DAX 28,349 B sha256 d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f, 32 blocks (no GEO for 73/74/75; GEO1#65 EXISTS, 1,026 B sha256 b032a6b0559a5df054550d72675e8666373244296c4a3a431123e42767588772). MON1CHA.DAX 13,428 B sha256 dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef, 122 records of 510 B. Decompressed ECL blocks: #75 6,233 B 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; #24 7,625 B 9c2b7f8f730ab3d3c3af417c34f344c7c8274c9b1fc6c6a4ad0a9d02a6d3c89b; #23 7,617 B 1f29e34f251fac429ed3c6b5daef4b3a1f293da2ab9842834a5418bd71eff4a9; #65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; #73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; #74 7,368 B efbf09a9173e4c81532357df6bb6e579000dcf2c890b7cec976c536cbea6e3cb; #67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; #18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357 (identical to the value this file's already-proven `middle` citation records -- an independent cross-check that both passes resolved the same install). Dialect ECL_GEN1_SHORT_POOLS, word sets {12:4,29:0,31:1,33:2,34:0,35:0,44:1,55:2} plus extended opcode 0x41 POOLS_AWARD_XP (wordSet 2); vbase 0x7FFE, offset = vaddr - 0x8000 + 2; SAVE destination LAST.

SCAN INTEGRITY (load-bearing). `scan_block(ECL1#75, address_addend=0x8000, word_sets=word_sets_for_profile('pools-of-darkness'), opcodes=opcodes_for_profile('pools-of-darkness'))` returns decoded_instruction_offsets=512, truncated_offsets=0, state_limit_reached=False, explored_states=617. Reproduced exactly by an independent walker that replicates `scan_block`'s `next_compare_outcomes` bookkeeping. A linearizer that omits that reset reports 84; any future walk of this block that does not reproduce 512 is wrong. Sibling blocks, same call: #65 576/0, #73 662/0, #74 691/1, #24 589/0, #23 565/1, #67 819/0. CORRECTED: the corpus-wide figure is 29,356 DECODED instructions over all 56 blocks plus 15 TRUNCATED offsets (one each in blocks 16,18,20,22,23,36,37,41,48,52,69,74,77,81,83 -- e.g. blk23@0x99D1 byte 0x60, blk74@0x9B6F byte 0x9C). The earlier "29,371 CFG-reachable instructions" was decoded+truncated reported as decoded. Two of the truncating blocks (23, 74) are load-bearing below, so the aligned census alone is NOT complete; the alignment-free raw sweeps quoted below are what close it, and they were independently re-run.

COVERAGE OF BLOCK 75 (CORRECTED). 6,036 of 6,233 bytes are covered by decoded instructions; 22 bytes are the header; the remaining 175 uncovered bytes are FIVE runs, not three: 0x8079..0x80D7 (95 B), 0x824F..0x8287 (57 B), 0x87CC..0x87CF (4 B), 0x97D0..0x97E1 (18 B), 0x9856 (1 B, the block's trailing byte). 95+57+18 = 170, so the earlier "three runs = 175 bytes" did not add up, and the earlier "none on the ending arm" was false: 0x87CC IS on the ending arm. It is benign -- bytes `0101 0489` = GOTO 0x8904, the conditional target of 0x87CB IF_NE, which `successors` resolves without decoding the GOTO byte itself; the target 0x8904 IS explored. The two large runs are mid-campaign only: 0x8079 is alternate Shal narration whose callee 0x97A9 ends `SPRITE_OFF; GOTO <operand code 0xBF>; EXIT` with no RETURN (0xBF is not a valid EclOpp code -- either a dynamic-goto idiom the scanner cannot model or a framing error in that one routine, unresolved), and 0x824F is a failed-jump death arm reachable only from inside the first run. 0x97D0 is `GOSUB "JUMP"` filler, not an instruction stream.

BLOCK 75 IS A CUTSCENE BLOCK, NOT A MAP AREA. Header magic 0x1388; vm_run_1 = search_location = pre_camp_check = camp_interrupted = 0x97A8, a single EXIT byte (`00`); initial_entry 0x8014 (file offset 22). No ON_GOTO cell dispatch anywhere in the block; entry is by NEWECL only. Entry guards, byte-exact: 0x8014 `09004b011600` SAVE #75->[0x0016]; 0x801A `0301ee0200ff` + `1601016f96` COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F; 0x8025 `0301540200ff` + `1601019a85` COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A; 0x8030 `0301d00100ff` + `160101dd85` COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD; else 0x803B `0e0074` PICTURE #116. 0x859A is NOT a third denouement: it is a FOUR-instruction prefix (0x859A SAVE #0->[0x0039]; 0x85A0 PICTURE #12; 0x85A3 PRINTCLEAR "SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE RUINOUS SUBJECTS OF BANE!"; 0x85DC PARTYSTRENGTH `1d`) that falls straight through into 0x85DD. Block 75 has exactly TWO destinations -- the finale (0x85DD) and the epilogue (0x966F) -- and the epilogue is also the finale's own fall-through end. The un-flagged fall-through arm is the MID-campaign Shal/Petra Vessel-of-Moander scene ("YOU LEAP THE GAP TO THE TEETERING CUP. BENEATH IS AN ABYSS." @0x80D8; "SUDDENLY, A SCREAM! AND PETRA HURTLES PAST YOU INTO THE CATACLYSM BELOW." @0x8288; "REVEALING A POOL OF DARKNESS!" @0x8577) ending 0x8591 SAVE #1->[0x000E]; 0x8597 `200012` NEWECL #18. The ending claim is pinned to the 0x85DD arm, not to the block.

GUARD-WORD CENSUS (aligned CFG walk over all 56 blocks, cross-checked by an alignment-free raw operand sweep for codes 1/2/3/0x81; both re-run independently). [0x02EE]: 19 aligned refs, EXACTLY ONE write corpus-wide -- 0x9666 in block 75, `0900ff01ee02` SAVE #255->[0x02EE]; raw sweep finds 21 sites, the 2 extras (blk32@0x9707, blk66@0x9BA6) are CFG-unreachable READ operands = POOLS_AWARD_XP #1,[0x02EE]. [0x0254]: 9 aligned / 9 raw, 3 writes -- blk65@0x868F `090001015402` SAVE #1, blk73@0x8400 `0900ff015402` SAVE #255, blk73@0x8603 ADD #1. [0x01D0]: 4 aligned / 5 raw, 2 writes -- blk73@0x86A5 and blk74@0x86B0, both `0900ff01d001` SAVE #255, never cleared; the 1 raw extra (blk65@0x9910) is a CFG-unreachable READ. NO HIDDEN WRITER OF ANY OF THE THREE EXISTS.

THE FOURTH GATE [0x01CF] (ADDED by this pass; the originating citation omitted it). The blk65 -> NEWECL #75 edge is NOT unconditional. blk65 0x8171 `0301cf0100ff` COMPARE [0x01CF],#255 / 0x8177 `17` IF_NE / 0x8178 `01018b84` GOTO 0x848B jumps PAST 0x8488. [0x01CF] has 9 aligned refs / 10 raw sites across blocks 65/73/74 and exactly two writers, both in block 73: 0x836A `09000001cf01` SAVE #0 and 0x8398 `0900ff01cf01` SAVE #255. So the endgame word set is FOUR words, not three: [0x01CF] (block-65 handoff enable, written only by block 73), [0x01D0] and [0x0254] (finale arm selectors), [0x02EE] (completion latch).

ENTRANCES TO BLOCK 75 (CORRECTED, and narrower than it looks). Immediate-operand NEWECL #75 has EXACTLY THREE sites -- blk65@0x8488, blk67@0x8A19, blk73@0x8484 -- and the alignment-free `20 00 4b` sweep finds the same three, so there is no unaligned immediate entrance. This is NOT the same as "block 75 has exactly three entrances": the corpus also contains FOUR dynamic-operand NEWECLs -- blk1@0x829A `2001c000` NEWECL [0x00C0], blk18@0x8746 `20019a00` NEWECL [0x009A], blk18@0x8851 `20019b00` NEWECL [0x009B], blk83@0x8BCB `200201bf` -- and blk1's is this repo's already-documented shipped developer JUMPER (0x81EA INPUT_NUMBER -> [0x00C0]), which can reach any block id. (poolsMiddleRoute.test.ts was corrected for exactly this on 2026-08-06.) Nothing in the ending claim depends on the entrance census: which arm runs is decided solely by block 75's own guards at 0x801A/0x8025/0x8030, not by the caller. Of the three immediate entrances, blk67@0x8A19 is the mid-campaign one (gated 0x89D0 COMPARE [0x0250],#0, "THE VESSEL REELS IN SPACE, SHAKING ALL THE TOWER...") and arrives with all flags clear; blk65@0x8488 and blk73@0x8484 are the endgame entrances and each arrives with a finale flag already 0xFF.

APPROACH CHAIN, byte-grounded. blk73@0x86A5 / blk74@0x86B0 SAVE #255->[0x01D0] then NEWECL #65 (0x86AB `200041` / 0x86B6 `200041`). Block 65 is the walkable palace map: initial_entry 0x8014 COMPARE #65,[0x0016] / IF_EQ / EXIT (already-here guard), 0x801C SAVE #65->[0x0016], then 0x8022 `0300ff01d001` COMPARE #255,[0x01D0] / 0x8028 IF_EQ / 0x8029 GOTO 0x80B4 -- the armed re-entry skips 0x803F LOAD_FILES #65,#4 and the 0x8044/0x804A/0x8050 spawn and goes straight into the cutscene ("IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS." @0x805A on the unarmed path), passes the [0x01CF] gate at 0x8171, and reaches 0x8488 NEWECL #75 after "'I WILL OCCUPY THE BALOR!'" / "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE." Separately blk65@0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73, where the limbo block increments it (0x8603) and kills the party at 6 (0x860C, "SUDDENLY GOTHMENES IS AMONG YOU, BANE'S CRYSTAL ON HIS BROW!" / "YOU HAVEN'T A CHANCE." / DAMAGE #224,#10,#10,#255,#0) and arms 0xFF at 0x8400 under the 0x83F9 COMPARE [0x0254],#0 / 0x83FF IF_NE guard before 0x8484 NEWECL #75.

THE WALKABLE APPROACH EXISTS (ADDED by this pass; the originating citation wrongly said "no GEO map walk exists for this leg by construction"). That is true only of block 75. Block 65 IS a map area: distinct header entries vm_run_1 0x8776 / search_location 0x880F / pre_camp_check 0x8722 / camp_interrupted 0x876C, and a cell dispatch at 0x8822 `2f003f012d00019b00` AND #63,[0x002D]->[0x009B] followed by 0x8836 ON_GOTO [0x009B],#12 -> [0x8861,0x8ACD,0x8B34,0x8C26,0x8F6E,0x9049,0x9122,0x913F,0x91ED,0x9302,0x9348,0x95DD] (0-based). Arm 11 = 0x95DD `090001015d02` SAVE #1->[0x025D]; 0x95E3 `20004a` NEWECL #74 -- i.e. stepping on that cell is what starts the endgame arming chain, and it is the ONLY one of the twelve arms that reaches any NEWECL. In GEO1#65 exactly three cells satisfy descriptor&63 == 11: (9,7), (8,8), (7,9), all raw 0x8B (descriptors at raw[514:770], index y*16+x). All three are reachable over the real wall/door graph (wall planes raw[2:258]/raw[258:514], door flags raw[770:1026]): 248 of 256 cells are connected, and a BFS from block 65's own unarmed spawn (0x8044 SAVE #0->[0x0034], 0x804A SAVE #0->[0x0035] = (0,0)) reaches (9,7), (8,8) and (7,9) in 36 steps. What is NOT yet done is the Treasures-grade `find_geo_path` + real-VM walk of those steps; the map facts above are proven, the walk is owed (see ARTIFACT DEBT).

THE FINALE (0x85DD), verbatim inline 6-bit strings decoded with the project's own decoder, at their own vaddrs: 0x85E6 "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH."; 0x8611 "THE DARK FLUID BEGINS TO BOIL. FELL CREATURES EMERGE!"; 0x8640 "WITH A CLATTER OF SKELETAL WINGS DRACOLICHES SOAR UP FROM THE POOL, SHRIEKING THEIR HATE!"; 0x868A "GIANT BITS OF MOANDER BOB TO THE SURFACE AND CLAMBER UP THE SIDES. BEHIND COME BANE MINIONS!"; 0x86D6 "THEN THE GLEAMING BLACK PETS OF KALISTES HOIST THEMSELVES FROM THE HORRIPILATING LIQUID."; 0x871F "THERE SEEMS TO BE NO END TO THEM."; 0x876A "THE CRYSTAL GLOWS WITH EVIL POWER!"; 0x879C " COUNTERMAND THE SUMMONS? IT COULD BE DEADLY TO TRY THIS."; 0x890D "THE LOYAL MINIONS ADVANCE ON YOU. THE BEHOLDER XOHAM GOADS THEM ON FROM BEHIND!"; 0x8B9F "EYES FULL OF HATRED, XOHAM ASSAILS YOU!"; 0x8C90 "EXHAUSTED, THE MAGE STUMBLES, AND THE BALOR'S WHIP SWEEPS HIM INTO THE POOL!"; 0x8CCD "IN THE BLINK OF AN EYE HE SLIPS UNDER THE SURFACE, AND IS GONE."; 0x8D42 "HIS EYE TRAVELS OVER THE MOUNTAINS OF RUIN YOU HAVE LEFT, AND A SPECTRE OF DOUBT PASSES OVER HIS FACE."; 0x8E45 "'WITH IT YOU CAN RULE THE REALMS! I WILL TEACH YOU THE WORD TO COMMAND IT, IF YOU WILL LET ME GO.' "; 0x8F0E "'TO CONTROL BANE'S CRYSTAL, SAY..."; 0x8F2E "          'PANAJUXID'"; 0x9261 "'PREPARE FOR THE ENDLESS COLD, YOU INSECTS. I WILL NOW SEND YOU STRAIGHT TO THE ICY BOSOM OF LORD BANE!'"; 0x9426 "EMBOLDENED, THE BALOR CLOSES FOR A DUEL TO THE DEATH!"; 0x958B "THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES."; 0x9603 " HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN "; 0x963D " FINGERS, AND BLOWS AWAY ON A FRESHENING WIND." The word puzzle is real input, not flavour: 0x8F7A `098000813f03` SAVE ""->memstr[0x033F]; 0x8F80 `10000f813f03` INPUT_STRING #15,memstr[0x033F]; 0x8F86 `03813f03800740138129560910` COMPARE memstr[0x033F],"PANAJUXID"; 0x8F93 IF_EQ / 0x8F94 GOTO 0x8FE2 = the LOSING ending ("AS YOU SPEAK THE WORD, SOMETHING ERUPTS OUT OF THE POOL! " @0x8FEB / "IT TAKES A LONG MOMENT TO REALIZE THAT THE TWISTED THING IS ELMINSTER. AND THAT'S ALL THE TIME YOU HAVE." @0x902D / "'FOOLS, YOU HAVE OPENED THE CRYSTAL! WELCOME YOUR NEW MASTER!'" @0x90B9) terminating 0x90EC `2e00e0000a000a00ff0000` DAMAGE #224,#10,#10,#255,#0 / 0x90F7 EXIT, which the engine models as an unconditional party-wide 10d10+255 with policy {automatic, party, noSaveFlag}; empty input (0x8F98 COMPARE memstr[0x033F],"") -> 0x90F8; anything else -> 0x8FA3 "'WRONG! BUT MY BLACK HEART LEAPS TO SEE YOUR WEAKNESS FOR POWER!'".

COMBAT CONTRACT. Pose written by the script itself at 0x89A5/0x89AB/0x89B1/0x89B7: SAVE #8->[0x0034], SAVE #8->[0x0035], SAVE #2->[0x0011], SAVE #100->[0x001B]. 0x89BD `25015c02000301cc8901f589011e8a` ON_GOTO [0x025C],#3 -> [0x89CC,0x89F5,0x8A1E]; the tier is set at 0x880E/0x8815 from 0x8801 RANDOM #25,[0x00BF] compared against [0x0416], and reset to 0 at 0x8A82 on defeat. Rosters read from the block's own LOAD_MONSTER bytes and reproduced by running the real EclVm from each arm's own vaddr, with MON1CHA names independently re-decoded (record 77 "DRACOLICH", 3 "BIT O MOANDER", 9 "MINION OF BANE", 7 "PET OF KALISTES", 95 "DEATH TYRANT", 94 "ELDER ORB", 31 "BEHOLDER", 12 "GOTHMENES", 28 "GREEN DRAGON"): wave 1 tier 0 (0x89CC, SETUP_MONSTER #255,#0,#12,#6) = 77x11, 3x9, 9x13, 7x7; tier 1 (0x89F5) = 77x7, 3x5, 9x13, 7x9; tier 2 (0x8A1E) = 77x5, 3x4, 9x11, 7x9; all three converge on 0x8A43 COMBAT, victory -> 0x8A8C `4100010096` POOLS_AWARD_XP #1,#150. Wave 2 (0x8BC0 SETUP_MONSTER #255,#1,#31,#15) = 95x2, 94x1, 31x[0x00C4], COMBAT 0x8BE0, then 0x8C41 `41000100fa` POOLS_AWARD_XP #1,#250; its flee arm 0x8BF1 = 10x3, 9x7, 10x3 then re-fights via GOTO 0x8BC0. Final balor: agreed/wrong-word arm 0x9252 SETUP_MONSTER #255,#2,#12,#15 = 12x1, 28x3, 9x8, 4x3, COMBAT 0x92CE, 0x92CF IF_EQ / 0x92D0 GOTO 0x94D1; refused arm 0x941D = 12x1, 28x2, 9x8, 3x2, COMBAT 0x94CB, 0x94CC IF_NE / 0x94CD GOTO 0x92D4 (defeat) with victory falling through to 0x94D1.

TERMINUS AND EPILOGUE. Winning terminus 0x94D1, then a straight-line cinematic (its only branch is the 0x95BE..0x95E1 party-scan loop) to 0x9666 `0900ff01ee02` SAVE #255->[0x02EE] -- the unique corpus-wide write -- then 0x966C `380001` PROGRAM #1, then fall-through into the epilogue 0x966F: 0x9678 "AS IF FROM FAR AWAY, ELMINSTER SPEAKS."; 0x969F "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'"; 0x96CD "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'"; 0x970D "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK. I SHALL NOT FORGET YE.'"; 0x9763 "THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS..."; then 0x9793 `090004013a00 090009012500 090004012600 200018` = SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24; 0x97A8 EXIT. The 0x801A guard makes the epilogue the replay path: once [0x02EE]=255, any later entry to area 75 jumps straight to 0x966F. The party-scan sub at 0x9817 (SAVE #0->[0x00BF]; 0x981D LOAD_CHARACTER [0x00BF]; 0x9821 COMPARE memstr[0x032B],memstr[0x0401]; IF_EQ -> 0x983A; else ADD #1 -> GOTO 0x981D) picks the crystal bearer, and 0x9841 (COMPARE [0x0567],#0) supplies the HIS/HER pronoun.

WHAT ECL1#24 (NEWECL #0x18) ACTUALLY IS -- neither a credits roll nor a restart. It is a COMPLETION-GATED POST-VICTORY PHLAN: a full 589-instruction playable town block with its own vm_run_1 0x8211 / search_location 0x8A0B / pre_camp_check 0x815B / camp_interrupted 0x81C8, 0x8061 LOAD_FILES #17,#1 and spawn 0x8066 SAVE #5->[0x0035] / 0x806C SAVE #0->[0x0034] / 0x8072 SAVE #1->[0x0011], whose FIRST instruction is 0x8014 `0301ee020000` + `16` + `200010` COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16 -- it refuses to run and re-routes to the ordinary Phlan block unless the completion latch is set. Its own text: 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND CHILDREN PLAY IN THE STREETS."; 0x80F1 "FROM ALL APPEARANCES, PHLAN IS THE SAME AS IT WAS THE DAY YOU FIRST ARRIVED." A second, independent block agrees: blk23@0x84BF `0301ee020000` COMPARE [0x02EE],#0 / 0x84C5 IF_NE / 0x84C6 `200018` NEWECL #24, else 0x84C9 `200010` NEWECL #16.

LIVE ENGINE VERIFICATION (repo's own EclVm on the retail bytes, dialect ECL_GEN1_SHORT_POOLS, seed 1 -- RE-RUN independently by this pass). ECL1#75 from entry 22: empty memory -> the mid-campaign Petra/Vessel text, status awaiting-input at 0x819C, [0x0016]=75, [0x02EE] untouched; {[0x01D0]=255} -> the finale opening at "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH."; {[0x0254]=255} -> the identical finale PREFIXED by the Gothmenes-summons line, proving the 0x859A fall-through; {[0x02EE]=255} -> the epilogue alone, status 'chain', chainBlockId 24, memory [0x003A]=4, [0x0025]=9, [0x0026]=4. DISCLOSED HARNESS STOP: the two seeded finale runs end status 'halted', haltReason "step-budget exceeded", NOT a clean pause -- with no host character bridge the 0x981D LOAD_CHARACTER / 0x9821 COMPARE / 0x982D ADD / 0x9836 GOTO party scan never terminates. So those two runs prove WHICH ARM OPENS, nothing further. The terminus is proven separately: from entry 0x9252 and from entry 0x941D, resuming COMBAT with combatOutcome 'victory' and then the one following prompt, each run returns status 'chain', chainBlockId 24, with [0x02EE]=255, [0x003A]=4, [0x0025]=9, [0x0026]=4 and the crystal-to-dust narration. From entry 0x8F7A, resuming the INPUT_STRING with "PANAJUXID": status 'exited' carrying effect {type:'damage', dice:{count:10,sides:10,bonus:255}, policy:{mode:'automatic',target:'party',reason:'noSaveFlag'}, operands:[224,10,10,255,0]}. ECL1#24 from entry 22: with no [0x02EE] -> status 'chain', chainBlockId 16, zero text; with [0x02EE]=255 -> the post-victory Phlan narration, status 'exited'. The [0x0025]/[0x0026] pair is read corpus-wide through a four-neighbour cursor idiom (SAVE [0x0025]->[0x00C0]; ADD/SUBTRACT #1,[0x0025]->[0x00C0]; same for [0x0026]->[0x00C1]) in blocks 17/25/51/80, and [0x003A] takes one of 5 values across 15 writes; reading them as "overland cursor X/Y" and "region id" is INFERENCE from that idiom -- what is PROVEN is the byte-exact write set and that block 24 sets the same three words to adjacent values (0x805A SAVE #4->[0x003A], 0x82AC SAVE #10->[0x0025], 0x82A6 SAVE #4->[0x0026]).

LIMITS, stated plainly. No DOSBox-X, GameLink, emulator or screenshot evidence -- every engine-side claim is retail bytes plus this repo's TypeScript EclVm, and a VM opcode mis-model would be inherited. PROGRAM #1 at 0x966C is quoted as a byte fact (`380001`); its host semantics were not traced, and the VM treats it as a fall-through, which is what makes the 0x9666 -> 0x966F continuity work here. If retail PROGRAM #1 terminates the process, the epilogue would still be reachable on replay through the 0x801A [0x02EE] guard, but the single-run continuity would not hold. No single VM run crosses a NEWECL boundary: the producer->consumer link from blocks 65/73/74 into block 75 and on into block 24 is proven STRUCTURALLY (unique writers, immediate-NEWECL census, alignment-free recall checks), not executed as one continuous chain. The physical approach through GEO1#65 is proven to EXIST (arm-11 cells (9,7)/(8,8)/(7,9), 36-step BFS from spawn) but was not walked through the VM. The wave-1 difficulty tier [0x025C] derives from 0x8801 RANDOM #25,[0x00BF] vs [0x0416], whose producer was not traced -- all three rosters are reachable, but which one a real playthrough gets is unresolved. Wave 2's LOAD_MONSTER #31,[0x00C4],#31 count is a register set to 4 at 0x8B96 only when the 0x8B65 LOAD_CHARACTER loop's [0x00C1] is >= 1, so the beholder count is host-dependent. 175 of 6,233 bytes of block 75 remain outside the CFG walk (see COVERAGE); one of them, the 0x97A9 routine's `GOTO <operand code 0xBF>`, is genuinely unexplained. No browser wiring, no `?explore=` route id and no e2e acceptance is claimed or implied.

VERIFICATION AND ARTIFACT DEBT (stated, not hidden). Reproduce the static half with: `scan_block(ECL1#75, address_addend=0x8000, word_sets=word_sets_for_profile('pools-of-darkness'), opcodes=opcodes_for_profile('pools-of-darkness'))` -> 512/0/617; the raw sweeps `{01|02|03|81} EE 02` -> 21 sites, `{01|02|03|81} 54 02` -> 9, `{01|02|03|81} D0 01` -> 5, `{01|02|03|81} CF 01` -> 10, `20 00 4B` -> 3; GEO1#65 raw[514:770] descriptor&63==11 -> {(9,7),(8,8),(7,9)}. Reproduce the dynamic half with `EclVm(ECL1#75, {dialect: ECL_GEN1_SHORT_POOLS, entry: 0x9252-0x8000+2, seed: 1})`, resume(0,{combatOutcome:'victory'}) then resume(0) -> status 'chain', chainBlockId 24, [0x02EE]=255. UNLIKE every other investigated leg in this matrix (poolsMiddleRoute / poolsTownRoute / poolsWildernessRoute / poolsQuestFlag, and even neverwinter-nights-dos's `structurally-absent` ending via nwnEndingRoute.test.ts), THIS LEG HAS NO COMMITTED GOLDEN. `packages/engine/test/poolsEndingRoute.test.ts` and `docs/engine/research/pools-ending-route.md` are OWED and not yet written; until they land, the evidence above is reproducible only by re-running the commands quoted here. The golden should assert, at minimum: the retail hashes; scan_block 512/0/617; the four entry-guard byte strings; the [0x02EE]/[0x0254]/[0x01D0]/[0x01CF] aligned+raw censuses; the 0x8F86 PANAJUXID compare and its two outcomes; both balor arms reaching chain 24 with [0x02EE]=255; block 24's gate in both polarities; and the GEO1#65 arm-11 cells plus a find_geo_path walk to one of them.

Key addresses: ECL1#75 0x8014 SAVE #75->[0x0016] (09004b011600); 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F (0301ee0200ff 1601016f96) -- completion replay guard; 0x8025 COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A (0301540200ff 1601019a85); 0x8030 COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD (0301d00100ff 160101dd85); 0x859A four-instruction prefix falling through into 0x85DD; 0x85DD THE CAMPAIGN FINALE entry; 0x85E6 "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH."; 0x8801 RANDOM #25,[0x00BF] with 0x880E/0x8815 tier writes to [0x025C]; 0x89BD ON_GOTO [0x025C],#3 -> [0x89CC,0x89F5,0x8A1E] (25015c02000301cc8901f589011e8a); 0x8A43 COMBAT (wave 1); 0x8A8C POOLS_AWARD_XP #1,#150; 0x8BC0 SETUP_MONSTER #255,#1,#31,#15 / 0x8BE0 COMBAT (Xoham); 0x8C41 POOLS_AWARD_XP #1,#250; 0x8F80 INPUT_STRING #15,memstr[0x033F]; 0x8F86 COMPARE memstr[0x033F],"PANAJUXID" (03813f03800740138129560910); 0x8FE2 losing ending -> 0x90EC DAMAGE #224,#10,#10,#255,#0 -> 0x90F7 EXIT; 0x9252 / 0x941D final balor combats; 0x94D1 winning terminus; 0x9666 SAVE #255->[0x02EE] (0900ff01ee02) -- THE ONLY write of the completion latch in all 56 blocks; 0x966C PROGRAM #1 (380001); 0x966F epilogue entry; 0x9793 SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24 (090004013a00 090009012500 090004012600 200018); 0x97A8 EXIT -- the target of all four map/camp header entries; 0x9817 crystal-bearer party scan; 0x8597 NEWECL #18 -- the MID-campaign terminus of the non-ending arm. ECL1#24 0x8014 COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16 (0301ee020000 16 200010); 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN...". ECL1#23 0x84BF COMPARE [0x02EE],#0 / IF_NE / 0x84C6 NEWECL #24 else 0x84C9 NEWECL #16. ECL1#65 0x8022 COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4; 0x8171 COMPARE [0x01CF],#255 / IF_NE / GOTO 0x848B (0301cf0100ff 17 01018b84) -- the fourth gate; 0x8488 NEWECL #75; 0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73; 0x8822 AND #63,[0x002D]->[0x009B] / 0x8836 ON_GOTO [0x009B],#12; 0x95DD arm 11 -> 0x95E3 NEWECL #74. ECL1#73 0x836A SAVE #0->[0x01CF]; 0x8398 SAVE #255->[0x01CF]; 0x8400 SAVE #255->[0x0254] (armed under 0x83F9/0x83FF); 0x8484 NEWECL #75; 0x86A5 SAVE #255->[0x01D0]; 0x86AB NEWECL #65. ECL1#74 0x86B0 SAVE #255->[0x01D0]; 0x86B6 NEWECL #65. ECL1#67 0x8A19 NEWECL #75 -- the MID-campaign entrance (gated 0x89D0 COMPARE [0x0250],#0).
```

### 11.3 Route pass, alternative-explanation lens

*source:* `pools_ending_refute_route_alternative.json` — assessment `stands-with-caveats`, `correctedCitation` 24674 chars, reproduced verbatim.

```text
ENDING leg, pools-of-darkness -- verdict: PROVEN (engine-level, static CFG + real `EclVm`; no DOSBox-X). Independently re-derived from the retail bytes 2026-08-06 by a second pass; the numbers below are that pass's own, and where they differ from an earlier draft the draft was wrong.

RETAIL (resolved via `goldbox_corpus.choose_install`/`file_index`; install `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`): ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks {1-4,16-27,32-42,48-55,64-77,80-86}; MON1CHA.DAX 13,428 B sha256 dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef, 122 records. Decompressed: ECL1#75 6,233 B sha256 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; ECL1#24 7,625 B 9c2b7f8f730ab3d3c3af417c34f344c7c8274c9b1fc6c6a4ad0a9d02a6d3c89b; ECL1#65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; ECL1#73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; ECL1#74 7,368 B efbf09a9173e4c81532357df6bb6e579000dcf2c890b7cec976c536cbea6e3cb; ECL1#67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; ECL1#39 6,446 B 20edfda5fcdf0fc726984d0e29d2a4811ba1a89fd5788567cd7583da9018a005; ECL1#26 6,397 B ed17849a8d9b7aab7eb0e12529af0ef9d1b39d3b4b4bd8b43b990409b8f92ea0; ECL1#23 7,617 B 1f29e34f251fac429ed3c6b5daef4b3a1f293da2ab9842834a5418bd71eff4a9; ECL1#18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357 (identical to the value this file's already-proven `middle` citation records -- an independent cross-check that this pass resolved the same install). Dialect ECL_GEN1_SHORT_POOLS, word sets {12:4,29:0,31:1,33:2,34:0,35:0,44:1,55:2} plus extended opcode 0x41 POOLS_AWARD_XP (wordSet 2); vbase 0x7FFE, offset = vaddr - 0x8000 + 2; SAVE dest LAST.

SCAN INTEGRITY (load-bearing). `scan_block(ECL1#75, address_addend=0x8000, word_sets=word_sets_for_profile('pools-of-darkness'), opcodes=opcodes_for_profile('pools-of-darkness'))` returns decoded_instruction_offsets=512, truncated_offsets=0, state_limit_reached=False, explored_states=617. A linearizer that omits `scan_block`'s own `next_compare_outcomes` reset reports 84; a BFS that dedupes on offset alone and drops the GOSUB return stack reports 244. Any future walk of this block that does not reproduce 512 is wrong. Coverage: 6,036 of 6,233 bytes. The 197 remaining bytes are FIVE runs -- 0x8079..0x80D7 (95 B), 0x824F..0x8287 (57 B), 0x87CC..0x87CF (4 B), 0x97D0..0x97E1 (18 B), 0x9856 (1 B, the block's trailing 0x00). All five were decoded by hand. FOUR are off the ending arm: 0x8079..0x80D7 is alternate Shal narration, unreached because its callee 0x97A9 ends `SPRITE_OFF; GOTO <operand code 0xBF>; EXIT` with no RETURN, so the GOSUB at 0x8075 never returns; 0x824F..0x8287 is a failed-jump death arm reachable only from inside that first gap; 0x97D0..0x97E1 is dead filler after the 0x97CF EXIT; 0x9856 is padding. The FIFTH, 0x87CC..0x87CF, IS on the ending arm and is a scanner artifact, not dead code: its bytes are `01 01 04 89` = `GOTO 0x8904`, the condition-true arm of `0x87CB IF_NE` immediately after `0x87CA PARTY_SURPRISE`. `scan_block` does not list opcode 0x22 among the flag-clobbering opcodes (0x14/0x1D/0x2F/0x30/0x3F), so the pinned `(0,)` outcome inherited from the preceding failed IF_NE prunes the true arm. Nothing is lost -- 0x8904 is reached by the false arm anyway -- but the pruning is a real modelling gap in the shared scanner and should be fixed rather than restated as "unreachable".

BLOCK 75 IS A CUTSCENE BLOCK, NOT A MAP AREA. Header bytes 0..21 = `88130101a8970101a8970101a8970101a89701011480`: magic 0x1388; vm_run_1 = search_location = pre_camp_check = camp_interrupted = 0x97A8, which is a single EXIT byte; initial_entry 0x8014 (= offset 22). There is no ON_GOTO cell dispatch anywhere in the block; entry is by NEWECL only. Entry guards, byte-exact: 0x8014 `09004b011600` SAVE #75->[0x0016]; 0x801A `0301ee0200ff` COMPARE [0x02EE],#255 / 0x8020 `16` IF_EQ / 0x8021 `01016f96` GOTO 0x966F; 0x8025 `0301540200ff` COMPARE [0x0254],#255 / IF_EQ / `01019a85` GOTO 0x859A; 0x8030 `0301d00100ff` COMPARE [0x01D0],#255 / IF_EQ / `0101dd85` GOTO 0x85DD; else 0x803B PICTURE #116. CORRECTION to any three-variant reading: 0x859A is NOT a third denouement -- it is a four-instruction prefix (0x859A SAVE #0->[0x0039]; 0x85A0 PICTURE #12; 0x85A3 PRINTCLEAR "SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE RUINOUS SUBJECTS OF BANE!"; 0x85DC PARTYSTRENGTH byte `1d`) that falls straight through into 0x85DD. Block 75 has exactly TWO destinations: the finale (0x85DD) and the epilogue (0x966F), and the epilogue is also the finale's own fall-through end. The un-flagged fall-through arm is the MID-campaign Shal/Petra Vessel-of-Moander scene (0x8049 "AMID THE CONFUSION BEHIND, SHAL STRUGGLES TO JOIN YOU."; 0x81C9 "ASTRIDE THE GUSHING VESSEL, PETRA GAZES ON YOU WITH INSANE HATRED."; 0x80D8 "YOU LEAP THE GAP TO THE TEETERING CUP. BENEATH IS AN ABYSS."; 0x8288 "SUDDENLY, A SCREAM! AND PETRA HURTLES PAST YOU INTO THE CATACLYSM BELOW."; 0x8577 "REVEALING A POOL OF DARKNESS!") ending 0x8591 SAVE #1->[0x000E]; 0x8597 `200012` NEWECL #18 -- so the ending claim is pinned to the 0x85DD arm only, not to the block.

GUARD-WORD CENSUS. Aligned CFG walk over all 56 blocks = 29,356 decoded instructions. That walk is NOT clean: 15 blocks -- 16,18,20,22,23,36,37,41,48,52,69,74,77,81,83 -- each have exactly ONE `truncated_offset`, on bytes {0x80 x5, 0x48, 0x52, 0x5C, 0x60, 0x86, 0x87, 0x9B, 0x9C, 0x9D, 0xB5}, i.e. dynamic-GOTO fall-throughs landing in string data, not undiscovered opcodes. Blocks 23 and 74 are among the 15, so the aligned walk alone cannot claim completeness for them; the alignment-free raw sweep below is truncation-immune and is what carries the negative result. Counts, both methods, over operand codes 1/2/3/0x81 (codes 0 and 0x80 carry a byte only and cannot address 0x02EE): [0x02EE] 19 aligned refs = 18 reads + 1 write across 12 blocks (1,2,3,17,19,21,23,24,26,52,66,75), EXACTLY ONE write -- 0x9666 in block 75, `0900ff01ee02` SAVE #255->[0x02EE]; raw sweep finds 21 sites, the 2 extras (blk32@0x9707, blk66@0x9BA6) being CFG-unreachable READ operands of `41 0001 02ee02` POOLS_AWARD_XP #1,[0x02EE]. [0x0254]: 9 aligned / 9 raw, 3 writes -- blk65@0x868F `090001015402` SAVE #1, blk73@0x8400 `0900ff015402` SAVE #255, blk73@0x8603 `040001015402015402` ADD #1. [0x01D0]: 4 aligned / 5 raw, 2 writes -- blk73@0x86A5 and blk74@0x86B0, both `0900ff01d001` SAVE #255, never cleared; the 1 raw extra (blk65@0x9910) is a CFG-unreachable READ. NO DIRECT-ADDRESS WRITER OTHER THAN THESE EXISTS. LIMIT ON THAT NEGATIVE: it covers writes whose destination operand names the address literally. Indirect `SAVE_TABLE` (0x35) writes base+offset; a census of all 434 table sites finds 10 distinct SAVE_TABLE bases {0x0001,0x0097,0x0098,0x009A,0x00B5,0x02EF,0x0385,0x03E9,0x041F,0x9B33}, none equal to 0x02EE and the nearest below it (0x00B5) requiring a runtime offset of 569, so an indirect write is implausible but is not formally excluded.

NEWECL #75 census: aligned = exactly three (blk65@0x8488, blk67@0x8A19, blk73@0x8484) and the alignment-free `20 00 4b` sweep finds exactly the same three, so there is no unaligned entrance. blk67@0x8A19 is the mid-campaign entrance (gated 0x89D0 COMPARE [0x0250],#0) and arrives with all three flags clear; blk65@0x8488 and blk73@0x8484 are the endgame entrances and each arrives with a finale flag already 0xFF. Approach chain, byte-grounded: blk73@0x86A5 / blk74@0x86B0 SAVE #255->[0x01D0] then NEWECL #65 (0x86AB `200041` / 0x86B6); block 65 = "IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS." (0x805A), opens 0x8022 `0300ff01d001` COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4, forks at 0x8171 COMPARE [0x01CF],#0xFF / IF_NE / GOTO 0x848B (the crystal-holder gate), and reaches 0x8488 NEWECL #75 after 0x8430 "'I WILL OCCUPY THE BALOR!'" / 0x844E "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE."; separately blk65@0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73, where the limbo block increments it (0x8603), kills the party once it reaches 6 (0x860C COMPARE [0x0254],#6 / 0x8612 IF_LT / GOTO 0x866A, else 0x861A "SUDDENLY GOTHMENES IS AMONG YOU, BANE'S CRYSTAL ON HIS BROW!" / 0x864B "YOU HAVEN'T A CHANCE." / 0x865E DAMAGE #224,#10,#10,#255,#0 / 0x8669 EXIT), and arms 0xFF at 0x8400 under the 0x83F9 COMPARE [0x0254],#0 / 0x83FF IF_NE guard before 0x8484 NEWECL #75.

THE FINALE (0x85DD), verbatim inline 6-bit strings with their vaddrs: 0x85E6 "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH."; 0x8611 "THE DARK FLUID BEGINS TO BOIL. FELL CREATURES EMERGE!"; 0x8640 "WITH A CLATTER OF SKELETAL WINGS DRACOLICHES SOAR UP FROM THE POOL, SHRIEKING THEIR HATE!"; 0x868A "GIANT BITS OF MOANDER BOB TO THE SURFACE AND CLAMBER UP THE SIDES. BEHIND COME BANE MINIONS!"; 0x86D6 "THEN THE GLEAMING BLACK PETS OF KALISTES HOIST THEMSELVES FROM THE HORRIPILATING LIQUID."; 0x871F "THERE SEEMS TO BE NO END TO THEM."; 0x876A "THE CRYSTAL GLOWS WITH EVIL POWER!"; 0x879C " COUNTERMAND THE SUMMONS? IT COULD BE DEADLY TO TRY THIS."; 0x890D "THE LOYAL MINIONS ADVANCE ON YOU. THE BEHOLDER XOHAM GOADS THEM ON FROM BEHIND!"; 0x8B9F "EYES FULL OF HATRED, XOHAM ASSAILS YOU!"; 0x8C90 "EXHAUSTED, THE MAGE STUMBLES, AND THE BALOR'S WHIP SWEEPS HIM INTO THE POOL!"; 0x8CCD "IN THE BLINK OF AN EYE HE SLIPS UNDER THE SURFACE, AND IS GONE."; 0x8D42 "HIS EYE TRAVELS OVER THE MOUNTAINS OF RUIN YOU HAVE LEFT, AND A SPECTRE OF DOUBT PASSES OVER HIS FACE."; 0x8E45 "'WITH IT YOU CAN RULE THE REALMS! I WILL TEACH YOU THE WORD TO COMMAND IT, IF YOU WILL LET ME GO.' "; 0x8F0E "'TO CONTROL BANE'S CRYSTAL, SAY..."; 0x8F2E "          'PANAJUXID'"; 0x9261 "'PREPARE FOR THE ENDLESS COLD, YOU INSECTS. I WILL NOW SEND YOU STRAIGHT TO THE ICY BOSOM OF LORD BANE!'"; 0x9426 "EMBOLDENED, THE BALOR CLOSES FOR A DUEL TO THE DEATH!"; 0x958B "THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES."; 0x9603 " HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN "; 0x963D " FINGERS, AND BLOWS AWAY ON A FRESHENING WIND." The word puzzle is real input, not flavour: 0x8F7A `098000813f03` SAVE ""->memstr[0x033F]; 0x8F80 `10000f813f03` INPUT_STRING #15,memstr[0x033F]; 0x8F86 `03 813f03 8007 40138129560910` COMPARE memstr[0x033F],"PANAJUXID"; 0x8F93 IF_EQ / 0x8F94 GOTO 0x8FE2 = the LOSING ending ("AS YOU SPEAK THE WORD, SOMETHING ERUPTS OUT OF THE POOL! " / "IT TAKES A LONG MOMENT TO REALIZE THAT THE TWISTED THING IS ELMINSTER. AND THAT'S ALL THE TIME YOU HAVE." / "'FOOLS, YOU HAVE OPENED THE CRYSTAL! WELCOME YOUR NEW MASTER!'") terminating 0x90EC `2e00e0000a000a00ff0000` DAMAGE #224,#10,#10,#255,#0 / 0x90F7 EXIT, which the engine models as an unconditional party-wide effect; empty input -> 0x90F8; anything else -> 0x8FA3 "'WRONG! BUT MY BLACK HEART LEAPS TO SEE YOUR WEAKNESS FOR POWER!'".

COMBAT CONTRACT. Pose written by the script itself at 0x89A5/0x89AB/0x89B1/0x89B7: SAVE #8->[0x0034], SAVE #8->[0x0035], SAVE #2->[0x0011], SAVE #100->[0x001B]. 0x89BD `25015c02000301cc8901f589011e8a` ON_GOTO [0x025C],#3,[0x89CC],[0x89F5],[0x8A1E], the tier set at 0x880E/0x8815 from 0x8801 RANDOM #25,[0x00BF] compared against [0x0416] and reset to 0 at 0x8A82 on defeat. Rosters decoded AND reproduced by running the real EclVm from each arm's own vaddr, with MON1CHA names from decodeMonsterArchive(...,'pools-of-darkness'): wave 1 arm 0x89CC = 77x11, 3x9, 9x13, 7x7; arm 0x89F5 = 77x7, 3x5, 9x13, 7x9; arm 0x8A1E = 77x5, 3x4, 9x11, 7x9 (77 DRACOLICH, 3 BIT O MOANDER, 9 MINION OF BANE, 7 PET OF KALISTES -- roster and narration corroborate each other without either deriving the other). Wave 2 at 0x8BC0 = 95x2, 94x1, 31x[0x00C4] (DEATH TYRANT, ELDER ORB, BEHOLDER -- 0x890D names "THE BEHOLDER XOHAM"); its flee arm 0x8BF1 = 10x3, 9x7, 10x3 then re-fights via GOTO 0x8BC0. Final balor combats: agreed/wrong-word arm 0x9252 SETUP_MONSTER #255,#2,#12,#15 with 12x1, 28x3, 9x8, 4x3, and refused arm 0x941D with 12x1, 28x2, 9x8, 3x2 (12 GOTHMENES, 28 GREEN DRAGON). Scripted XP via the extended opcode: 0x8A8C `4100010096` POOLS_AWARD_XP #1,#150 and 0x8C41 `41000100fa` POOLS_AWARD_XP #1,#250.

TERMINUS AND EPILOGUE. Winning terminus 0x94D1 -> 0x9666 `0900ff01ee02` SAVE #255->[0x02EE] (the unique corpus-wide direct write) -> 0x966C `380001` PROGRAM #1 -> fall-through into the epilogue 0x966F (PICTURE #131): 0x9678 "AS IF FROM FAR AWAY, ELMINSTER SPEAKS."; 0x969F "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'"; 0x96CD "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'"; 0x970D "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK. I SHALL NOT FORGET YE.'"; 0x9763 "THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS..."; then 0x9793 `090004013a00 090009012500 090004012600 200018` = SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24; 0x97A8 EXIT. The 0x801A guard makes the epilogue the replay path: once [0x02EE]=255, any later entry to area 75 jumps straight to 0x966F.

WHAT ECL1#24 (NEWECL #0x18) ACTUALLY IS -- neither a credits roll nor a restart. It is a COMPLETION-GATED POST-VICTORY PHLAN: a full 589-instruction playable town block with its own vm_run_1 0x8211 / search_location 0x8A0B / pre_camp_check 0x815B / camp_interrupted 0x81C8, LOAD_FILES #17,#1 at 0x8061 and spawn SAVE #5->[0x0035] / SAVE #0->[0x0034] / SAVE #1->[0x0011] at 0x8066/0x806C/0x8072, whose FIRST instruction is 0x8014 `0301ee020000` COMPARE [0x02EE],#0 / `16` IF_EQ / `200010` NEWECL #16 -- i.e. it refuses to run and re-routes to the ordinary Phlan block unless the completion latch is set. Its own text: 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND CHILDREN PLAY IN THE STREETS."; 0x80F1 "FROM ALL APPEARANCES, PHLAN IS THE SAME AS IT WAS THE DAY YOU FIRST ARRIVED." A second block agrees: blk23@0x84BF COMPARE [0x02EE],#0 / IF_NE / 0x84C6 NEWECL #24, else 0x84C9 NEWECL #16. A third, stronger consumer: block 26 uses the latch to swap the world, not just a destination -- 0x80D6 and 0x8480 COMPARE [0x02EE],#0 select NEWECL #25 vs NEWECL #17, and 0x8123 COMPARE [0x02EE],#0 / IF_NE / GOTO 0x8185 swaps the whole 27-arm cell-dispatch table (post-victory 0x8185 vs ordinary 0x812E, 11 of 27 arms different). Nothing but block 75's 0x9666 can flip any of that.

REJECTED ALTERNATIVE READINGS (adversarial pass). (a) "Block 75 is a mid-campaign cutscene": refuted -- the un-flagged arm IS the mid-campaign cutscene and it is a different arm with a different terminus (NEWECL #18); the 0x85DD arm destroys Bane's crystal and is the sole writer of the world-state latch. (b) "Block 75 is a defeat or attract-mode sequence": refuted -- it runs LOAD_CHARACTER party scans (0x8B65, 0x8D99, 0x9817), real INPUT_STRING, real COMBAT pauses, and a per-character HIS/HER pronoun sub (0x9841 on [0x0567]); the losing branches (0x90EC, blk73@0x865E) are separate DAMAGE+EXIT terminals that write nothing. (c) "NEWECL #24 is a continuation, so block 75 is not a terminus": correct that it is a continuation -- and that is the finding, not a refutation: the campaign narrative concludes at block 75 and the game continues in a latch-gated post-victory world. (d) THE ONE ALTERNATIVE WORTH NAMING: ECL1#39 (area 0x27, the optional trial -- "'YOU HAVE ENTERED MY DOMAIN. ONLY THE BEST WILL LEAVE.'" at 0x8087) contains at 0x853A "YOU HAVE SURVIVED AND OVERCOME THE GREATEST CHALLENGE IN YOUR CAREER. YOU MAY RETIRE CONTENT.", then 0x8584 POOLS_AWARD_XP #1,#7000 and 0x858A NEWECL #24 -- a genuine competing "retirement" beat, and a THIRD aligned NEWECL #24 site (the full aligned set is blk23@0x84C6, blk39@0x858A, blk75@0x97A5). It does NOT displace block 75: block 39 writes no completion latch, changes no world state, and its NEWECL #24 is degraded by block 24's own 0x8014 gate back to block 16 whenever [0x02EE]=0. It reads as the trial area's exit reward, reachable independently of the real ending.

LIVE ENGINE VERIFICATION (repo's own EclVm on the retail bytes, dialect ECL_GEN1_SHORT_POOLS, seed 1), with its failure modes disclosed. ECL1#75 from entry 22: empty memory -> the mid-campaign Petra/Vessel text, status `awaiting-input` at a PARLAY menu (pc 0x819F), [0x02EE] untouched. {[0x01D0]=255} -> the finale opening through 0x871F "THERE SEEMS TO BE NO END TO THEM.", then status `halted`, haltReason `step-budget exceeded`, pc 0x9821. {[0x0254]=255} -> the identical sequence PREFIXED by the Gothmenes-summons line (proving the 0x859A fall-through), then the same halt at pc 0x9836. THAT HALT IS EXPECTED AND MUST BE STATED: the 0x9817 crystal-bearer sub loops `0x981D LOAD_CHARACTER [0x00BF]` / `0x9821 03812b03810104` COMPARE memstr[0x032B],memstr[0x0401] / ADD #1 [0x00BF] / GOTO 0x981D with no bound on [0x00BF], and a headless VM has no party string state for either operand, so it never exits. Seeding numeric memory cannot break it (both operands are 0x81 string cells, not words); raising stepBudget to 200,000 does not either. Consequently the two finale arms are proven at their ENTRY only when driven from entry 22, and everything downstream was proven by entering at the arm's own vaddr instead. From 0x89BD -> COMBAT with roster 77x11/3x9/9x13/7x7; from 0x8BC0 (with [0x00C4]=4) -> COMBAT with 95x2/94x1/31x4; from 0x914D -> COMBAT with 12x1/28x3/9x8/4x3; from 0x9314 -> COMBAT with 12x1/28x2/9x8/3x2. resume(victory) from each of those four runs the crystal-to-dust narration and the Elminster epilogue, sets [0x02EE]=255, and returns status `chain` with chainBlockId 24 and memory [0x003A]=4 / [0x0025]=9 / [0x0026]=4. From entry 0x8F7A, resuming the INPUT_STRING with "PANAJUXID": status `exited` at 0x90F7 carrying the party-wipe DAMAGE effect. {[0x02EE]=255} from entry 22 -> the epilogue alone, status `chain`, chainBlockId 24, memory [0x003A]=4 / [0x0025]=9 / [0x0026]=4. ECL1#24 from entry 22: with no [0x02EE] -> status `chain`, chainBlockId 16, zero text; with [0x02EE]=255 -> the post-victory Phlan narration, status `exited`.

CROSS-BLOCK HOP, EXECUTED. `EclVm(ECL1#65, entry 22, memory {[0x01D0]=255, [0x01CF]=255})` runs the antechamber, prints "'I WILL OCCUPY THE BALOR!'" and "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE.", and returns status `chain` with chainBlockId 75, pc 0x8488. The same run with only {[0x01D0]=255} chains to block 73 at 0x8695 instead ("YOU KNOW YOU HAVE ONLY MOMENTS TO FIND THE CRYSTAL!"); with nothing seeded it exits at 0x80B3 after the antechamber line. So the block 65 -> block 75 producer-to-consumer edge is EXECUTED, not merely structural; [0x01CF]=255 is block 65's own crystal-holder gate at 0x8171.

REGISTER SEMANTICS, flagged as inference. [0x0025]/[0x0026] are read corpus-wide through a four-neighbour cursor idiom -- SAVE [0x0025]->[0x00C0]; ADD/SUBTRACT #1,[0x0025]->[0x00C0]; the same for [0x0026]->[0x00C1] -- present at 18 sites each in blocks 17 (0x816D/0x8174/0x97A4...), 25 (0x80C0/0x80C7/0x8BB0...), 51 (0x8122/0x8129/0x894F...) and 80 (0x8128/0x812F/0x8926...). [0x003A] takes one of five immediate values (0,1,2,3,4) across 15 writes corpus-wide. Reading them as "overland cursor X/Y" and "region selector" is INFERENCE from that idiom; what is PROVEN is the byte-exact write set and that block 24 sets the same three words to adjacent values (0x805A SAVE #4->[0x003A], 0x82AC SAVE #10->[0x0025], 0x82A6 SAVE #4->[0x0026]).

LIMITS, stated plainly: no DOSBox-X, GameLink, emulator or screenshot evidence -- every engine-side claim is retail bytes plus this repo's TypeScript EclVm, and a VM opcode mis-model would be inherited. Block 75 has no GEO cell dispatch at all, so there is no "walk to the ending cell" leg to prove and none is claimed; the physical approach through block 65's palace map was not walked, and no continuous VM chain from block 73 through 65 and 75 to 24 was run (only the single 65 -> 75 hop above). PROGRAM #1 at 0x966C is quoted as a byte fact (`380001`); its host semantics were not traced, and the EclVm treats it as a fall-through, which is what makes the 0x9666 -> 0x966F continuity work here. The wave-1 tier word [0x025C] derives from 0x8801 RANDOM #25,[0x00BF] against [0x0416], whose producer was not traced; all three rosters are reachable but which one a real playthrough gets is unresolved. Wave 2's beholder count is the register [0x00C4], set to 4 at 0x8B96 only when the 0x8B65 LOAD_CHARACTER loop's [0x00C1] count is >= 1, and was seeded rather than derived. No browser wiring, no `?explore=` route id and no e2e acceptance is claimed or implied. PROMOTION PREREQUISITE, unmet at the time of writing: unlike every other proven Pools leg (pools-natural-route.md, pools-middle-route.md, pools-town-route.md, pools-wilderness-route.md, pools-quest-flag.md), this leg has no `docs/engine/research/pools-ending-route.md` and no `packages/engine/test/poolsEndingRoute.test.ts`; this file's own charter forbids setting a status without updating the cited doc first, so the doc and the golden must land before the status is written.

Key addresses: ECL1#75 0x8014 SAVE #75->[0x0016] (09004b011600) -- area latch, ECL1#75 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F (0301ee0200ff 16 01016f96) -- completion replay guard, ECL1#75 0x8025 COMPARE [0x0254],#255 / IF_EQ / GOTO 0x859A (0301540200ff 16 01019a85), ECL1#75 0x8030 COMPARE [0x01D0],#255 / IF_EQ / GOTO 0x85DD (0301d00100ff 16 0101dd85), ECL1#75 0x859A four-instruction prefix (SAVE #0->[0x0039]; PICTURE #12; PRINTCLEAR Gothmenes-summons; PARTYSTRENGTH @0x85DC byte 1d) -- falls through into 0x85DD, ECL1#75 0x85DD -- THE CAMPAIGN FINALE entry, ECL1#75 0x85E6 PRINTCLEAR "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH.", ECL1#75 0x87CA PARTY_SURPRISE / 0x87CB IF_NE / 0x87CC GOTO 0x8904 (01010489) -- the countermand fork; 0x87CC is the one CFG-uncovered instruction on the ending arm, pruned by a scanner flag-model gap, ECL1#75 0x89BD ON_GOTO [0x025C],#3,[0x89CC],[0x89F5],[0x8A1E] (25015c02000301cc8901f589011e8a) -- wave-1 tier dispatch, ECL1#75 0x8A43 COMBAT (wave 1); 0x8A8C POOLS_AWARD_XP #1,#150, ECL1#75 0x8BC0 SETUP_MONSTER #255,#1,#31,#15 / 0x8BE0 COMBAT (Xoham); 0x8C41 POOLS_AWARD_XP #1,#250, ECL1#75 0x8F80 INPUT_STRING #15,memstr[0x033F]; 0x8F86 COMPARE memstr[0x033F],"PANAJUXID" (03 813f03 8007 40138129560910), ECL1#75 0x8FE2 losing ending -> 0x90EC DAMAGE #224,#10,#10,#255,#0 -> 0x90F7 EXIT, ECL1#75 0x9252 (agreed arm) / 0x941D (refused arm) SETUP_MONSTER #255,#2,#12,#15 -- final balor combats, ECL1#75 0x94D1 winning terminus, ECL1#75 0x9666 SAVE #255->[0x02EE] (0900ff01ee02) -- THE ONLY direct-address write of the completion latch in all 56 blocks, ECL1#75 0x966C PROGRAM #1 (380001) -- falls through into the epilogue, ECL1#75 0x966F epilogue entry (PICTURE #131, Elminster's four speeches), ECL1#75 0x9793 SAVE #4->[0x003A]; SAVE #9->[0x0025]; SAVE #4->[0x0026]; NEWECL #24 (090004013a00 090009012500 090004012600 200018), ECL1#75 0x97A8 EXIT -- the target of all four map/camp header entries, ECL1#75 0x9817 crystal-bearer party scan sub (unbounded without host string state -- the headless VM's step-budget halt lives here); 0x9841 HIS/HER pronoun sub on [0x0567], ECL1#75 0x97A9 orphan sub ending SPRITE_OFF; GOTO <code 0xBF>; EXIT with no RETURN -- why 0x8079..0x80D7 is unreachable, ECL1#75 0x8597 NEWECL #18 -- the MID-campaign terminus of the non-ending arm, ECL1#24 0x8014 COMPARE [0x02EE],#0 / IF_EQ / NEWECL #16 (0301ee020000 16 200010) -- post-victory Phlan gate, ECL1#24 0x809C "YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN...", ECL1#23 0x84BF COMPARE [0x02EE],#0 / IF_NE / 0x84C6 NEWECL #24 else 0x84C9 NEWECL #16 -- second completion gate, ECL1#26 0x8123 COMPARE [0x02EE],#0 / IF_NE / GOTO 0x8185 -- latch-swapped 27-arm cell-dispatch table (vs 0x812E), plus 0x80D6 / 0x8480 selecting NEWECL #25 vs #17, ECL1#39 0x853A "YOU HAVE SURVIVED AND OVERCOME THE GREATEST CHALLENGE IN YOUR CAREER. YOU MAY RETIRE CONTENT." / 0x8584 POOLS_AWARD_XP #1,#7000 / 0x858A NEWECL #24 -- the rejected competing "retirement" beat, ECL1#73 0x8400 SAVE #255->[0x0254] (armed under 0x83F9/0x83FF); 0x8484 NEWECL #75; 0x860C..0x8669 the limbo party wipe, ECL1#73 0x86A5 SAVE #255->[0x01D0]; 0x86AB NEWECL #65, ECL1#74 0x86B0 SAVE #255->[0x01D0]; 0x86B6 NEWECL #65, ECL1#65 0x8022 COMPARE #255,[0x01D0] / IF_EQ / GOTO 0x80B4; 0x8171 COMPARE [0x01CF],#0xFF / IF_NE / GOTO 0x848B; 0x8488 NEWECL #75; 0x868F SAVE #1->[0x0254] then 0x8695 NEWECL #73, ECL1#67 0x8A19 NEWECL #75 -- the MID-campaign entrance (gated 0x89D0 COMPARE [0x0250],#0)
```

### 11.4 Reach pass, correctness lens

*source:* `pools_ending_refute_reach_correctness.json` — assessment `stands-with-caveats`, `correctedCitation` 14304 chars, reproduced verbatim.

```text
REACH, pools-of-darkness ENDING (ECL1.DAX#75) - measured 2026-08-06, static bytes + tools/gen1_ecl_encounter_scan.py only, no DOSBox-X. Independently re-derived end to end by an adversarial correctness pass on the same date; every address, byte string and count below was recomputed from the retail file, and the corrections that pass produced are folded in.

RETAIL: install C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness (goldbox_corpus.choose_install, high confidence). ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks (1-4,16-27,32-42,48-55,64-77,80-86). Decompressed blocks: #75 6,233 B sha256 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; #65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; #67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; #73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; #18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357. Dialect: word_sets_for_profile('pools-of-darkness') = {0x0C:4,0x1D:0,0x1F:1,0x21:2,0x22:0,0x23:0,0x2C:1,0x37:2}, opcodes_for_profile adds 0x41 POOLS_AWARD_XP(2); vbase 0x7FFE, offset = vaddr-0x8000+2. METHOD AND ITS CONTROL: scan_block's own BFS state machine (identical state key, identical compare-outcome narrowing), calling decode_one/successors/header_entries directly, instrumented to record every instruction and edge. The instrumented mirror was validated against the real scan_block on all 56/56 blocks - decoded-offset count, truncated count, explored_states and state_limit_reached identical on every block, zero mismatches - so these numbers are the scanner's, not a hand-rolled walk's. state_limit_reached is False for all 56 blocks at the DEFAULT max_states=50000.

ENTRY CENSUS. A CFG-reachable NEWECL census over ALL 56 blocks finds EXACTLY THREE NEWECL #75 in the whole corpus: blk65 @0x8488, blk67 @0x8A19, blk73 @0x8484, each `20 00 4b`. RECALL CONTROL: an alignment-free raw byte sweep for `20 00 4B` at every offset in all 56 blocks also returns exactly those 3, and all 3 are CFG-aligned - zero recall gap. The sweep demonstrably over-collects rather than echoing the walk: for `20 00 12` (NEWECL #18) it returns 11 sites of which only 8 are CFG-aligned (17@0x8AC1, 52@0x8860, 83@0x830F are raw-only). Dynamic (register-operand) NEWECL sites corpus-wide: exactly four - blk1@0x829A `20 01 c0 00` NEWECL [0x00C0] (the developer JUMPER: block 1's 0x8063 HORIZONTAL_MENU ['JUMPER','START'], 0x81C6 "WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)", 0x81EA INPUT_NUMBER #2,[0x00C0]); blk18@0x8746 [0x009A] and blk18@0x8851 [0x009B] (the Limbo hub already resolved by the shipped `middle` citation); blk83@0x8BCB `20 02 01 bf` (operand code 2, word 0xBF01 - out of block-id range, a mis-parse, not an edge). None of the four can produce 75.

THE THREE CALLERS, decoded with their own retail text. blk73 ("AHEAD, IN A WILD ROCK GARDEN, LIES A SINISTER DARK POOL." @0x80F4, entry vm_run_1 0x809F): 0x8374 PRINTCLEAR [0x0401] + 0x8378 PRINT "'S HAND CLOSES ON THE CRYSTAL OF BANE!"; 0x8398 SAVE #255->[0x01CF] (`09 00 ff 01 cf 01`); 0x839E SAVE #0->[0x0258]; 0x83B5 OR #4,[0x01D4]->[0x01D4]; 0x83BE "ACROSS THE REALMS, EVIL BEINGS FALTER, THEIR THOUGHT DRAWN TO "; 0x842B "THE OUTPOUR OF HATE IS ALMOST UNBEARABLE. BUT "; 0x8484 NEWECL #75. blk65 ("IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS. THE SMALL SOUNDS YOU MAKE SEEM TO CURL UP AND DIE." @0x805A, entry initial_entry 0x8014 `03 00 41 01 16 00` COMPARE #65,[0x0016]): 0x826E PRINT "DO IT?" / PARTY_SURPRISE / IF_EQ -> 0x8698 "YOU BRING THE CRYSTAL FORWARD. GOTHMENES LICKS HIS LIPS, AND EXTENDS A FIERY HAND."; 0x86DD "ELMINSTER CRIES, "; 0x83BA "FREED FROM THE FLAIL, THE WIZARD ABLY DODGES A DECAPITATING BLOW. "; 0x8430 "'I WILL OCCUPY THE BALOR!'"; 0x844E "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE."; 0x8487 CLEAR_BOX; 0x8488 NEWECL #75. blk67 ("THE WIZARD GATE SLAMS BEHIND YOU." @0x805D, entry search_location 0x829E): 0x82D8 AND #63,[0x002D]->[0x00AA] (`2f 00 3f 01 2d 00 01 aa 00`), 0x82FF ON_GOTO [0x00AA] #31 -> arm 0x895F "YOU STAND IN SICK AWE BEFORE THE VESSEL OF MOANDER."; 0x8997 OR #2,[0x024F]; 0x89A0 "A VILE FLOOD STOPS ANYONE FROM ENTERING ITS ELDRICH ORIFICE."; 0x89D0 COMPARE [0x0250],#0 / IF_EQ false arm -> 0x89D9 "THE VESSEL REELS IN SPACE, SHAKING ALL THE TOWER. SLICK FLUID SPLASHES ALL OVER."; 0x8A19 NEWECL #75.

75 DOES NOT BRANCH ON THE CALLER. 0x8014 SAVE #75->[0x0016] (`09 00 4b 01 16 00`) WRITES the last-block-id slot; that SAVE's destination operand is the ONLY reference to [0x0016] anywhere in block 75 - there is no COMPARE against it in the block (contrast blk65, whose 0x8014 entry IS `COMPARE #65,[0x0016]`). The three-way fork reads persistent story flags instead: 0x801A COMPARE [0x02EE],#255 / 0x8020 IF_EQ / 0x8021 GOTO 0x966F (`03 01 ee 02 00 ff` / `16` / `01 01 6f 96`), 0x8025 COMPARE [0x0254],#255 -> 0x859A, 0x8030 COMPARE [0x01D0],#255 -> 0x85DD; else 0x803B PICTURE #116 (`0e 00 74`), 0x803E COMPARE #1,[0x0250] / IF_NE / GOTO 0x81C3, else 0x8049 PRINTCLEAR "AMID THE CONFUSION BEHIND, SHAL STRUGGLES TO JOIN YOU." One block serves all three callers, variant-selected by flag.

GRAPH POSITION. Immediate-NEWECL edges (corrected 0x31 frame, below): 18 -0x874A-> 17 -0x8857-> 70 -0x8365-> 67 -0x8A19-> 75 is the shortest path from the Limbo hub (blk18 = "YOU ARRIVE AT ELMINSTER'S CAMP IN LIMBO." @0x8086); it is provably shortest because 18's sole out-edge is 17. Also 70 -0x8D00-> 67, 77 -0x808B-> 67, 73 -0x8484-> 75, 65 -0x8488-> 75, with 65->73 (0x8695) / 73->65 (0x86AB), 74->65 (0x86B6), 74->73 (0x846C, 0x8508), 64->65 (0x8290), 65->74 (0x95E3), 73->74 (0x8DF8), 67->77 (0x97D9), 70->76 (0x96FA), 76->70 (0x809A). BFS from 17 reaches 17 blocks {16,17,18,20,22,23,24,25,33,39,40,50,67,70,75,76,77}, including 18 and 75; BFS from 18 reaches 75. OUT of 75: 0x8597 NEWECL #18 (`20 00 12`, the pre-finale branch, immediately after 0x8577 PRINTCLEAR "REVEALING A POOL OF DARKNESS!") and 0x97A5 NEWECL #24 (`20 00 18`) - the denouement's return to Phlan, contiguously preceded by 0x9793 SAVE #4->[0x003A], 0x9799 SAVE #9->[0x0025], 0x979F SAVE #4->[0x0026]; and, in the same denouement, 0x9666 SAVE #255->[0x02EE] / 0x966C PROGRAM #1 (`09 00 ff 01 ee 02 38 00 01`) sets the very flag the 0x801A fork tests, making the 0x966F denouement re-entrant.

DIALECT DEFECT FOUND AND PROVEN: Pools' opcode 0x31 is a MENU (wordSet 2, countAt 1 - the HORIZONTAL_MENU 0x2b frame), NOT the shared table's zero-operand SPRITE_OFF that both tools/dqk_ca03_stream_decode.py OPCODES[0x31] and packages/engine/src/ecl/opcodes.ts:89 carry, and that ECL_GEN1_SHORT_POOLS (disassemble.ts:203-214) does not override. Decisive site, the subroutine three of block 75's GOSUBs call: 0x97CB `31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54` = MENU [0x00BF] #2 "JUMP" "WAIT" (exactly 16 B), then 0x97DB `03 00 01 01 bf 00` COMPARE #1,[0x00BF], then 0x97E1 `13` RETURN. Under the shipped frame the same bytes read as SPRITE_OFF + GOTO with operand code 0xBF - not one of the six legal EclOpp codes {0,1,2,3,0x80,0x81} - and the routine appears to end in EXIT, destroying its callers' fall-through. Corpus metric, all 56 blocks, only 0x31's frame changed: CFG-reachable instructions 29,356 -> 32,516; illegal operand codes 448 -> 335; reachable 0x31 sites 135 -> 141; successor-of-0x31 histogram GOTO 135/135 (every one the same bogus `01 bf 00`) -> ON_GOTO 85 / COMPARE 43 / RETURN 4 / PRINTCLEAR 2 / 7 singletons (GOTO, SAVE, RANDOM, GOSUB, CALL, AND, OR); and all 403 inline menu items across the 141 sites decode to legal English menu words, 403/403, zero exceptions (e.g. blk17 0x8DEB ['ATTACK','FLEE','TALK','WAIT']; blk21 0x841E ['FORCE THE DOOR','PICK','KNOCK','NOTHING']; blk32 0x846F ['PUT IT ON','EXAMINE IT','THROW IT AWAY']). The count operand is always 2-5 (2:43, 3:77, 4:19, 5:2). The destination operand spans nine variables across all 141 sites: [0x00BF] x103, [0x00C1] x12, [0x00C0] x11, [0x00AB] x6, [0x0098] x5, [0x009F] x1, [0x00C2] x1 (blk81 0x8B86, 'TAKE BASIN'/'GRAB WAND'/'RETREAT'), [0x009D] x1 (blk82 0x8B1F, 'RESCUE'/'IGNORE'), [0x01D1] x1 (blk65 0x9481, 'ALLOW'/'DECLINE'/'FIGHT'). 140 of the 141 land in the low scratch range 0x0098-0x00C2; the single exception, [0x01D1] at blk65 0x9481, sits in the same persistent story-flag region as [0x01D0] and [0x01D4] (both treated as story flags elsewhere in this citation), i.e. that one site writes a menu result straight into a story flag. This is a real residual anomaly in the 0x31=MENU inference, recorded rather than smoothed over; block 75's own MENU at 0x97CB writes [0x00BF] and is unaffected.

THE TWO UNREACHED RUNS ARE ARTEFACTS OF THAT DEFECT, NOT DEAD CODE. Block 75 shipped-frame: 512 reached, exactly 1 illegal operand code (the 0x97CC GOTO with operand code 0xBF - precisely the artefact above), uncovered runs >=48 B = exactly {0x8079..0x80D7 (95 B), 0x824F..0x8287 (57 B)}. Corrected frame: 527 reached, 0 illegal operand codes, uncovered runs >=48 B = EMPTY; truncated reachable bytes 0 in both. Contents: 0x8079 IF_NE; 0x807A GOTO 0x80D8; 0x807E PRINTCLEAR "SHE DRAWS NEAR."; 0x808D GOSUB 0x97A9; 0x8091 IF_NE; 0x8092 GOTO 0x80D8; 0x8096 SAVE #1->[0x00C8]; 0x809C PRINTCLEAR "SHE RACES PAST YOU AND FLINGS HERSELF ONTO THE GYRATING VESSEL!"; 0x80CF GOSUB 0x97A9; 0x80D3 IF_EQ; 0x80D4 GOTO 0x824F - the repeated JUMP/WAIT prompt; and 0x824F GOSUB 0x97E2 (0x97E2 PRINTCLEAR "WITH A JARRING THUD THE VESSEL RAMS THE TOWER, AND SHATTERS IT."); 0x8253 PRINTCLEAR "THE TOWER SLIDES INTO UTTER RUIN, AND YOU WITH IT."; 0x827C DAMAGE #224 #0 #0 #255 #0 (`2e 00 e0 00 00 00 00 00 ff 00 00`); 0x8287 SURPRISE - the WAIT-too-long party-wipe branch. The corrected frame does not change the #75 entry census: still exactly three NEWECL #75.

THE 0x9817 LOOP IS A NAMED-CHARACTER SEARCH, NOT AN END-OF-GAME ROSTER WALK. 0x873C SAVE [0x0303]str->[0x032B]str (`09 81 03 03 81 2b 03`) stores the crystal-bearer's name; 0x8743 GOSUB 0x9817 (`02 01 17 98`). Body: 0x9817 SAVE #0->[0x00BF] (`09 00 00 01 bf 00`); 0x981D LOAD_CHARACTER [0x00BF] (`0a 01 bf 00`); 0x9821 COMPARE [0x032B]str,[0x0401]str (`03 81 2b 03 81 01 04`); IF_EQ -> GOTO 0x983A; 0x982D ADD #1,[0x00BF]->[0x00BF] (`04 00 01 01 bf 00 01 bf 00`); GOTO 0x981D; 0x983A COMPARE [0x05EE],#0 (`03 01 ee 05 00 00`); 0x9840 RETURN. It walks party slots until the loaded character's name field [0x0401] matches the stored name [0x032B], then returns with the flags set from that character's status word [0x05EE]. Callers: 0x8743 (followed by 0x8747 COMPARE [0x05EE],#8, `03 01 ee 05 00 08`) and 0x8788 (followed by IF_NE / GOTO 0x8904). It writes no character data, displays nothing, and exports nothing - no final-roster display, no save/export. The real end-of-game roster walk is a different loop, 0x95BE..0x95E1: `3a 0a 01 c4 00 09 01 b3 04 01 fd 05 09 00 00 01 ee 05 04 00 01 01 c4 00 01 c4 00 03 01 c4 00 01 20 00 18 01 01 be 95` = DELAY; LOAD_CHARACTER [0x00C4]; SAVE [0x04B3]->[0x05FD]; SAVE #0->[0x05EE]; ADD #1,[0x00C4]; COMPARE [0x00C4],[0x0020]; IF_LT; GOTO 0x95BE - a full-party restore (max HP [0x04B3] -> current HP [0x05FD], status [0x05EE] cleared) over party size [0x0020], run immediately before the 0x969F PRINTCLEAR "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'" denouement. Two further loops of the same shape (0x8B65 and 0x8D99: LOAD_CHARACTER [0x00C3]; COMPARE [0x05EE],#0; IF_NE; ADD #1,[0x00C1]) count casualties into [0x00C1] to select the "MANY LOSSES" wording and the reinforcement count [0x00C4].

DISCREPANCIES WITH THE SHIPPED `middle` CITATION (two, both re-verified independently; both need reconciling there, neither bears on #75). (1) NEWECL #18 alignment: `middle` lists 10 aligned sites including 17@0x8AC1 and 52@0x8860. Under this walk only 8 are CFG-aligned under the shipped 0x31 frame and 9 under the corrected one; 17@0x8AC1 and 52@0x8860 are raw-only under BOTH frames, while 83@0x830F - which `middle` omits - IS aligned once 0x31 is framed correctly. (2) Dynamic NEWECL count: `middle` states THREE corpus-wide; this walk finds FOUR under both frames, the extra being blk83@0x8BCB (`20 02 01 bf`).

HONEST GAP (the one real hole in reach). The Phlan starting cluster {16,23,24,25,39,40} is a strict SINK in the immediate-NEWECL graph, with zero escaping edges: 16->23 (0x87D9), 23->{16 (0x84C9), 24 (0x84C6)}, 24->{16 (0x801B), 23 (0x82BB), 25 (0x82B2), 39 (0x8755, the ship to the arena island)}, 25->{}, 39->{24 (0x858A), 40 (0x852A)}, 40->39 (0x8100) - and nothing in that set emits an immediate NEWECL into 17/18/32+/48+/64+/80+. None of the four dynamic NEWECL sites can supply the missing hop either (block 1's is the developer jumper; block 18's two are downstream of 18 itself; block 83's is a mis-parse). So the FIRST transition out of Phlan is engine/GEO-driven or routed through one of the seven in-degree-zero blocks {4, 26, 27, 34, 37, 54, 66}; 34 is already proven hub-entered by the shipped `middle` citation, and 26 (0x80A2 "YOU ARE ABOUT TO LEAVE. CONTINUE?", NEWECL #17/#25/#36 at 0x80E0/0x848A/0x80DD/0x8487/0x8E1C) is the strongest remaining candidate but is NOT proven here. Everything from 17 and 18 onward to 75 IS proven; consequently this citation establishes reach ONLY from the 17/18 hubs forward, not start-to-finish, and cannot on its own carry the `ending` leg. NOT ESTABLISHED beyond that: no live retail run; no VM replay of 75 in this pass; the flag semantics of [0x02EE]/[0x0254]/[0x01D0]/[0x0250] beyond their literal COMPAREs; and the corrected 0x31 frame is NOT shipped in packages/engine (opcodes.ts:89 still has 0x31 wordSet 0), so the browser VM cannot currently execute block 75's JUMP/WAIT beat or any of the corpus's 141 menu sites correctly. Also still open: 16 reachable bytes corpus-wide fail decode_one under the corrected frame (blk16 0x9470, blk18 0x8E0D, blk20 0x93B4, blk22 0x9217, blk23 0x99D1, blk36 0x9256, blk37 0x86BC, blk41 0x8416, blk48 0x8F9E, blk49 0x8696, blk52 0x8934, blk69 0x8AFE, blk74 0x9B6F, blk77 0x85AA, blk81 0x99CD, blk83 0x8F3A; 15 under the shipped frame) - none in blocks 65/67/73/75, so they do not affect this verdict, but they mark further Pools dialect gaps.
```

### 11.5 Reach pass, sufficiency lens

*source:* `pools_ending_refute_reach_sufficiency.json` — assessment `stands-with-caveats`, `correctedCitation` 16187 chars, reproduced verbatim.

```text
REACH ANGLE ONLY, pools-of-darkness ENDING (ECL1.DAX#75) — measured 2026-08-06, independently re-derived 2026-08-06 by a second walker; static bytes + tools/gen1_ecl_encounter_scan.py only, no DOSBox-X. THIS ANGLE ALONE DOES NOT CLOSE THE LEG — see WHAT THIS DOES NOT ESTABLISH at the end.

RETAIL: install C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness (goldbox_corpus.choose_install, high confidence). ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks (1-4,16-27,32-42,48-55,64-77,80-86). Decompressed blocks: #75 6,233 B sha256 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; #65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; #67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; #73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; #18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357; #17 7,595 B 1861db9328cb8769bd7c6b85cfa281f7da379d79aa576cbe49198e98dd2c5d6f. Dialect: word_sets_for_profile('pools-of-darkness') = {0x0C:4,0x1D:0,0x1F:1,0x21:2,0x22:0,0x23:0,0x2C:1,0x37:2}, opcodes_for_profile adds 0x41 POOLS_AWARD_XP(2); vbase 0x7FFE, offset = vaddr-0x8000+2 (Pools of Darkness is NOT the 0x6700 exception; that is Pool of Radiance). Method: scan_block's own BFS state machine — identical state key (entry, offset, roster, stack[-8:], compare_outcomes), identical compare-outcome narrowing, identical successor rules — calling decode_one/successors/header_entries directly, instrumented to record every instruction and edge. A hand-rolled BFS that dedupes by offset alone or drops the GOSUB return stack under-reports this block badly (244 vs 512); see docs/engine/research/gen1-ecl-extended-opcodes.md.

ENTRY CENSUS. A CFG-reachable NEWECL census over ALL 56 blocks (every block completes, state_limit_reached False for all 56; corpus totals under the shipped frame: 29,356 reachable instructions, 448 illegal operand codes, 15 truncated bytes) finds EXACTLY THREE NEWECL #75 in the whole corpus: blk65 @0x8488, blk67 @0x8A19, blk73 @0x8484, each `20 00 4b` (verified in the raw block bytes: 65 `20 00 4b 11 80 26`, 67 `20 00 4b 03 01 9b`, 73 `20 00 4b 12 80 27`). RECALL CONTROL: an alignment-free raw byte sweep for `20 00 4B` at every offset >= 22 in all 56 blocks also returns exactly those 3, and all 3 are CFG-aligned — zero recall gap in both directions. The sweep demonstrably over-collects rather than echoing the walk: for `20 00 12` (NEWECL #18) it returns 11 sites of which only 8 are CFG-aligned under the shipped frame (17@0x8AC1, 52@0x8860, 83@0x830F are raw-only). NOTE, CONTRADICTING THE SHIPPED `middle` CITATION AND UNRESOLVED: that citation lists 17@0x8AC1 and 52@0x8860 as aligned NEWECL #18 sites — this walk finds them raw-only — and omits 83@0x830F, which this walk finds aligned once opcode 0x31 is framed correctly (below). The two rows must be reconciled. DYNAMIC (register-operand) NEWECL sites corpus-wide: exactly four — blk1@0x829A `20 01 c0 00` NEWECL [0x00C0]; blk18@0x8746 [0x009A] and blk18@0x8851 [0x009B] (the Limbo hub already resolved by the shipped `middle` citation); blk83@0x8BCB `20 02 01 bf` (operand code 2, word 0xBF01 — out of block-id range, a mis-parse, not an edge). None of these is a legitimate campaign edge into 75. Stated precisely, because the loose form is false: blk1@0x829A CAN emit any block id including 75 — it is the developer JUMPER, [0x00C0] being filled by 0x81EA INPUT_NUMBER #2 after 0x81C6 "WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)", reached from block 1's 0x8039 "DO YOU WANT TO START FROM SCRATCH OR USE THE JUMPER?" / 0x8063 menu ['JUMPER','START'] — so it is excluded as a debug path, not as an arithmetic impossibility.

THE THREE CALLERS, decoded with their own retail text. blk73 ("AHEAD, IN A WILD ROCK GARDEN, LIES A SINISTER DARK POOL.", entry vm_run_1 0x809F): 0x8374 PRINTCLEAR [0x0401] + "'S HAND CLOSES ON THE CRYSTAL OF BANE!"; 0x8398 SAVE #255->[0x01CF] (`09 00 ff 01 cf 01`); 0x839E SAVE #0->[0x0258]; 0x83B5 OR #4,[0x01D4]->[0x01D4]; 0x83BE "ACROSS THE REALMS, EVIL BEINGS FALTER, THEIR THOUGHT DRAWN TO " + PRINT [0x0303]; 0x842B "THE OUTPOUR OF HATE IS ALMOST UNBEARABLE. BUT " + [0x0303] + " KEEPS THE CRYSTAL IN A DEATH'S GRIP."; 0x8484 NEWECL #75. blk65 ("IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS.", entry initial_entry 0x8014 `03 00 41 01 16 00` COMPARE #65,[0x0016]): 0x826E "DO IT?" / PARTY_SURPRISE / IF_EQ -> 0x8698 "YOU BRING THE CRYSTAL FORWARD. GOTHMENES LICKS HIS LIPS, AND EXTENDS A FIERY HAND."; 0x86DD "ELMINSTER CRIES, " "'NO!'" " SUDDENLY THERE IS A FLASH OF LIGHT."; 0x83BA "FREED FROM THE FLAIL, THE WIZARD ABLY DODGES A DECAPITATING BLOW."; 0x8430 "'I WILL OCCUPY THE BALOR!'"; 0x844E "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE."; 0x8487 CLEAR_BOX; 0x8488 NEWECL #75. blk67 ("THE WIZARD GATE SLAMS BEHIND YOU.", entry search_location 0x829E): 0x82D8 AND #63,[0x002D]->[0x00AA] (`2f 00 3f 01 2d 00 01 aa 00`), 0x82FF ON_GOTO [0x00AA] #31 -> arm 0x895F "YOU STAND IN SICK AWE BEFORE THE VESSEL OF MOANDER."; 0x8997 OR #2,[0x024F]; 0x89A0 "A VILE FLOOD STOPS ANYONE FROM ENTERING ITS ELDRICH ORIFICE."; 0x89D0 COMPARE [0x0250],#0 / IF_EQ false arm -> 0x89D9 "THE VESSEL REELS IN SPACE, SHAKING ALL THE TOWER. SLICK FLUID SPLASHES ALL OVER."; 0x8A19 NEWECL #75. NOTE that blk67's arm is CELL-DISPATCHED off [0x002D]&63 — no GEO evidence is offered here that a party can legally stand on the cell whose descriptor masks to 31.

75 DOES NOT BRANCH ON THE CALLER. 0x8014 SAVE #75->[0x0016] (`09 00 4b 01 16 00`) WRITES the last-block-id slot and never reads it; the three-way fork reads persistent story flags: 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F (`03 01 ee 02 00 ff` / `16` / `01 01 6f 96`), 0x8025 COMPARE [0x0254],#255 -> 0x859A (`03 01 54 02 00 ff`), 0x8030 COMPARE [0x01D0],#255 -> 0x85DD (`03 01 d0 01 00 ff`); else 0x803B PICTURE #116, 0x803E COMPARE #1,[0x0250] / IF_NE / GOTO 0x81C3, else 0x8049 PRINTCLEAR "AMID THE CONFUSION BEHIND, SHAL STRUGGLES TO JOIN YOU." One block serves all three callers, variant-selected by flag.

GRAPH POSITION, AND THE LIMIT OF WHAT IT PROVES. Immediate-NEWECL edges (corrected 0x31 frame, below): 18 -0x874A-> 17 -0x8857-> 70 -0x8365-> 67 -0x8A19-> 75 is the shortest path from the Limbo hub (blk18 = "YOU ARRIVE AT ELMINSTER'S CAMP IN LIMBO"); also 70 -0x8D00-> 67, 77 -0x808B-> 67, 73 -0x8484-> 75, 65 -0x8488-> 75, with 65->73 (0x8695), 73->65 (0x86AB), 74->65 (0x86B6), 74->73 (0x846C, 0x8508), 64->65 (0x8290), 65->74 (0x95E3), 73->74 (0x8DF8), 67->77 (0x97D9), 70->76 (0x96FA), 76->70 (0x809A). BFS from 17 or from 18 reaches the same 17 blocks {16,17,18,20,22,23,24,25,33,39,40,50,67,70,75,76,77}, 75 included. OUT of 75: 0x8597 NEWECL #18 (`20 00 12`) and 0x97A5 NEWECL #24 (`20 00 18`) — the denouement's return to Phlan, immediately preceded by 0x9793 SAVE #4->[0x003A], 0x9799 SAVE #9->[0x0025], 0x979F SAVE #4->[0x0026], and by 0x9666 SAVE #255->[0x02EE] / 0x966C PROGRAM #1 (`09 00 ff 01 ee 02 38 00 01`), which sets the very flag the 0x801A fork tests, making the 0x966F denouement re-entrant. REACH IS THEREFORE CONDITIONAL, NOT ABSOLUTE: BFS over the same immediate-NEWECL graph from the game's real boot block 1 reaches only 9 of 56 blocks — {1,2,3,16,23,24,25,39,40} — and reaches neither 75 nor any of its three callers. What is proven is "75 is reachable FROM 17/18", and 17/18 are not themselves proven reachable from the start (see HONEST GAP).

DIALECT DEFECT FOUND, BYTE-PROVEN, AND SHOWN NON-LOAD-BEARING FOR THIS VERDICT: Pools' opcode 0x31 is a MENU (wordSet 2, countAt 1 — the HORIZONTAL_MENU 0x2b frame), NOT the shared table's zero-operand SPRITE_OFF that tools/dqk_ca03_stream_decode.py OPCODES[0x31] and packages/engine/src/ecl/opcodes.ts:89 carry and that ECL_GEN1_SHORT_POOLS does not override. Decisive site, the subroutine three of block 75's GOSUBs call: 0x97CB `31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54` = MENU [0x00BF] #2 with two inline 6-bit items decoding to "JUMP" and "WAIT" (16 B), then 0x97DB `03 00 01 01 bf 00` COMPARE #1,[0x00BF], then 0x97E1 `13` RETURN. Under the shipped frame the same bytes read as SPRITE_OFF followed by a GOTO whose operand code is 0xBF — not one of the six legal EclOpp codes {0,1,2,3,0x80,0x81} — whose target resolves outside the block, so the routine dead-ends and its callers' fall-through is destroyed. Corpus metric, all 56 blocks, only 0x31's frame changed: CFG-reachable instructions 29,356 -> 32,516; illegal operand codes 448 -> 335; truncated bytes 15 -> 16; reachable 0x31 sites 135 -> 141; successor-of-0x31 histogram GOTO 135/135 (every one the same bogus `01 bf 00`) -> ON_GOTO 85 / COMPARE 43 / RETURN 4 / PRINTCLEAR 2 / GOTO 1 / SAVE 1 / RANDOM 1 / GOSUB 1 / CALL 1 / AND 1 / OR 1; count operand always 2-5 (2:43, 3:77, 4:19, 5:2, summing to the 403 inline items), and all 403 items decode to legal English menu words, 403/403, zero exceptions (e.g. blk17 0x8DEB ['ATTACK','FLEE','TALK','WAIT']; blk21 0x841E ['FORCE THE DOOR','PICK','KNOCK','NOTHING']; blk32 0x846F ['PUT IT ON','EXAMINE IT','THROW IT AWAY']). Destination operand is a low scratch word at 138 of the 141 sites ([0x00BF] x103, [0x00C1] x12, [0x00C0] x11, [0x00AB] x6, [0x0098] x5, [0x009F] x1); the remaining three are blk65@0x9481 MENU [0x01D1] #3 (successor ON_GOTO), blk81@0x8B86 MENU [0x00C2] #3 (ON_GOTO) and blk82@0x8B1F MENU [0x009D] #2 (COMPARE) — [0x01D1] sits in the story-flag range, so "always a scratch word" would be false. CRITICALLY, THE #75 ENTRY CENSUS IS FRAME-ROBUST: under BOTH the shipped and the corrected 0x31 frame the census returns exactly the same three NEWECL #75 sites, so this leg's reach conclusion does not depend on an unshipped decoder correction. Only the surrounding graph decoration does (83@0x830F -> 18 appears only under the corrected frame).

THE TWO UNREACHED RUNS IN BLOCK 75 ARE ARTEFACTS OF THAT DEFECT, NOT DEAD CODE. Shipped frame: 512 reached, 0 truncated, 1 illegal operand code, uncovered runs >=48 B = exactly {0x8079..0x80D7 (95 B), 0x824F..0x8287 (57 B)}. Corrected frame: 527 reached, 0 truncated, 0 illegal operand codes, uncovered runs >=48 B = EMPTY. Contents: 0x8079 IF_NE; 0x807A GOTO 0x80D8; 0x807E PRINTCLEAR "SHE DRAWS NEAR."; 0x808D GOSUB 0x97A9; 0x8091 IF_NE; 0x8092 GOTO 0x80D8; 0x8096 SAVE #1->[0x00C8]; 0x809C PRINTCLEAR "SHE RACES PAST YOU AND FLINGS HERSELF ONTO THE GYRATING VESSEL!"; 0x80CF GOSUB 0x97A9; 0x80D3 IF_EQ; 0x80D4 GOTO 0x824F — the repeated JUMP/WAIT prompt; and 0x824F GOSUB 0x97E2 ("WITH A JARRING THUD THE VESSEL RAMS THE TOWER, AND SHATTERS IT."); 0x8253 PRINTCLEAR "THE TOWER SLIDES INTO UTTER RUIN, AND YOU WITH IT."; 0x827C DAMAGE #224 #0 #0 #255 #0 (`2e 00 e0 00 00 00 00 00 ff 00 00`); 0x8287 SURPRISE (`23`) — the WAIT-too-long party-wipe branch.

THE 0x9817 LOOP IS A NAMED-CHARACTER SEARCH, NOT AN END-OF-GAME ROSTER WALK. 0x873C SAVE [0x0303]str->[0x032B]str (`09 81 03 03 81 2b 03`) stores the crystal-bearer's name; 0x8743 GOSUB 0x9817 (`02 01 17 98`). Body: 0x9817 SAVE #0->[0x00BF] (`09 00 00 01 bf 00`); 0x981D LOAD_CHARACTER [0x00BF] (`0a 01 bf 00`); 0x9821 COMPARE [0x032B]str,[0x0401]str (`03 81 2b 03 81 01 04`); IF_EQ -> GOTO 0x983A; 0x982D ADD #1,[0x00BF]->[0x00BF]; GOTO 0x981D; 0x983A COMPARE [0x05EE],#0 (`03 01 ee 05 00 00`); 0x9840 RETURN. Callers 0x8743 (followed by 0x8747 COMPARE [0x05EE],#8) and 0x8788 (followed by IF_NE / GOTO 0x8904). It writes no character data, displays nothing and exports nothing. The real end-of-game roster walk is a different loop, 0x95BE..0x95E1: `3a 0a 01 c4 00 09 01 b3 04 01 fd 05 09 00 00 01 ee 05 04 00 01 01 c4 00 01 c4 00 03 01 c4 00 01 20 00 18 01 01 be 95` = DELAY; LOAD_CHARACTER [0x00C4]; SAVE [0x04B3]->[0x05FD]; SAVE #0->[0x05EE]; ADD #1,[0x00C4]; COMPARE [0x00C4],[0x0020]; IF_LT; GOTO 0x95BE — a full-party restore (max HP -> current HP, status cleared) over party size [0x0020], run immediately before the denouement beats 0x969F "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'" and 0x96CD "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'". Two further loops of the same shape (0x8B65, 0x8D99) count casualties into [0x00C1].

HONEST GAP (the real hole in reach). The Phlan starting cluster {16,23,24,25,39,40} is a SINK in the immediate-NEWECL graph: 16->23 (0x87D9), 23->{16 (0x84C9), 24 (0x84C6)}, 24->{16 (0x801B), 23 (0x82BB), 25 (0x82B2), 39 (0x8755)}, 39->{24 (0x858A), 40 (0x852A)}, 40->39 (0x8100), 25 emits no NEWECL at all — and nothing in that set emits an immediate NEWECL into 17/18/32+/48+/64+/80+. Adding boot block 1 (-> 2, 3, 16) extends the boot-reachable set only to 9 blocks. So the FIRST transition out of Phlan is engine/GEO-driven or routed through one of the seven in-degree-zero blocks {4,26,27,34,37,54,66} (independently recomputed); 34 is already proven hub-entered by the shipped `middle` citation, and 26 ("YOU ARE ABOUT TO LEAVE. CONTINUE?", NEWECL #17 at 0x80E0/0x848A, #25 at 0x80DD/0x8487, #36 at 0x8E1C) is the strongest remaining candidate but is NOT proven here. This gap is pre-existing and corpus-wide rather than specific to this leg — the already-`proven` `middle` leg rests on ECL1#34, which is in-degree-zero in the same graph.

WHAT THIS ANGLE DOES NOT ESTABLISH — the leg is NOT closed by this citation alone. (1) NO GEO REACHABILITY: GEO1.DAX is never opened; there is no find_geo_path walk, no step count, no required-interaction list and no blocked-cell control, unlike the passing Gateway (step_count 27) and Treasures (6 steps, (7,8)->(3,6)) `ending` citations — and blk67's entry into 75 is cell-dispatched, so this is precisely the missing link. (2) NO VM REPLAY and NO GOLDEN TEST: packages/engine/test/ has gatewayEndingRoute.test.ts, treasuresEndingRoute.test.ts and nwnEndingRoute.test.ts but no poolsEndingRoute.test.ts. (3) NO RESEARCH DOC: docs/engine/research/pools-ending-route.md does not exist, so this row currently transcribes nothing, contrary to the matrix charter. (4) NO TERMINALITY ARGUMENT: that #75 is THE ending is assumed, not argued — there is no Treasures-grade nothing-else-could-be-it pass (cinematic-length ranking, exhaustive multi-phase text scan, rival-block and rival-latch refutation). (5) The corrected 0x31 frame is NOT shipped (opcodes.ts:89 still SPRITE_OFF, ECL_GEN1_SHORT_POOLS has no override), so the browser VM cannot execute block 75's JUMP/WAIT beat or any of the 141 corpus menu sites, and the Python scanner under-reports Pools by 3,160 reachable instructions corpus-wide. (6) No live retail run; flag semantics of [0x02EE]/[0x0254]/[0x01D0]/[0x0250] are known only from their literal COMPAREs. (7) 16 reachable bytes corpus-wide still fail decode_one under the corrected frame (none in blocks 65/67/73/75, so this verdict is unaffected).

Key addresses, all re-verified byte-exact against the retail blocks: ECL1#65 0x8488 NEWECL #75 (`20 00 4b`), ECL1#67 0x8A19 NEWECL #75 (`20 00 4b`), ECL1#73 0x8484 NEWECL #75 (`20 00 4b`), ECL1#75 0x8014 SAVE #75->[0x0016] (`09 00 4b 01 16 00`), ECL1#75 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F, ECL1#75 0x8025 COMPARE [0x0254],#255 -> 0x859A, ECL1#75 0x8030 COMPARE [0x01D0],#255 -> 0x85DD, ECL1#75 0x8597 NEWECL #18 (`20 00 12`), ECL1#75 0x97A5 NEWECL #24 (`20 00 18`), ECL1#75 0x9666 SAVE #255->[0x02EE] / 0x966C PROGRAM #1, ECL1#75 0x9793/0x9799/0x979F SAVE #4->[0x003A] / #9->[0x0025] / #4->[0x0026], ECL1#75 0x97CB MENU [0x00BF] #2 'JUMP' 'WAIT' (`31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54`), ECL1#75 0x97DB COMPARE #1,[0x00BF] / 0x97E1 RETURN, ECL1#75 0x9817..0x9840 named-character search, ECL1#75 0x873C SAVE [0x0303]->[0x032B] (`09 81 03 03 81 2b 03`), ECL1#75 0x95BE..0x95E1 full-party restore loop, ECL1#75 0x8079..0x80D7 (95 B) JUMP/WAIT beat, ECL1#75 0x824F..0x8287 (57 B) WAIT party-wipe branch, ECL1#18 0x874A NEWECL #17, ECL1#17 0x8857 NEWECL #70, ECL1#70 0x8365 NEWECL #67, ECL1#1 0x8063 menu ['JUMPER','START'] / 0x81C6 "WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)" / 0x81EA INPUT_NUMBER #2,[0x00C0] / 0x829A NEWECL [0x00C0] (developer JUMPER).
```

### 11.6 Reach pass, alternative-explanation lens

*source:* `pools_ending_refute_reach_alternative.json` — assessment `stands-with-caveats`, `correctedCitation` 18467 chars, reproduced verbatim.

```text
ENDING leg, pools-of-darkness (ECL1.DAX#75) - verdict PROVEN. Static retail bytes + tools/gen1_ecl_encounter_scan.py only; no DOSBox-X, no emulator, no live run. Originally measured 2026-08-06 and independently re-derived the same day by a second, adversarial pass that reproduced every load-bearing number below from the bytes and corrected six points of the first pass (marked CORRECTED).

RETAIL. Install C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness (goldbox_corpus.choose_install/file_index). ECL1.DAX 329,456 B sha256 46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af, 56 blocks (1-4,16-27,32-42,48-55,64-77,80-86). Decompressed: #75 6,233 B sha256 0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2; #65 6,567 B 0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425; #67 6,473 B 4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347; #73 7,660 B 2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3; #18 6,141 B 0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357.
DIALECT. word_sets_for_profile('pools-of-darkness') = {0x0C:4,0x1D:0,0x1F:1,0x21:2,0x22:0,0x23:0,0x2C:1,0x37:2}; opcodes_for_profile adds 0x41 POOLS_AWARD_XP (wordSet 2). vbase 0x7FFE, file offset = vaddr-0x8000+2, SAVE dest LAST. METHOD: scan_block's own BFS state machine (identical state key (entry,offset,roster,stack[-8:],compare_outcomes), identical COMPARE narrowing), calling decode_one/successors/header_entries directly and instrumented to record every instruction and edge. A hand-rolled BFS that dedupes by offset alone under-reports this block by ~50% and must not be used.

WHY #75 IS THE ENDING, NOT A CUTSCENE. [0x02EE] is the endgame flag. It has EXACTLY ONE writer in all 56 blocks - #75 @0x9666 SAVE #255->[0x02EE] (09 00 ff 01 ee 02), immediately followed by 0x966C PROGRAM #1 - and ELEVEN COMPARE readers across six blocks: 17@0x8032, 19@0x801C, 23@0x84BF+0x850F, 24@0x8014, 26@0x80D6+0x80E3+0x8123+0x8202+0x8480, 75@0x801A. Block 24's very FIRST instruction is 0x8014 COMPARE [0x02EE],#0 / 0x801A IF_EQ / 0x801B NEWECL #16 - it bounces straight out to block 16 unless the flag is set - so #75's exit NEWECL #24 enters a POST-VICTORY Phlan state, not ordinary play. Block 26 gates identically (0x80D6 COMPARE [0x02EE],#0 / IF_NE / NEWECL #25; 0x80E3 / IF_EQ / EXIT). 0x966C PROGRAM #1 is unique among all 26 reachable PROGRAM sites corpus-wide (#0 x16, #9 x6, #2 x1, #3 x1, dynamic [0x00C0] x1). Denouement text at 0x966F: PICTURE #131; "AS IF FROM FAR AWAY, ELMINSTER SPEAKS."; "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'"; "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'"; "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK. I SHALL NOT FORGET YE.'"; "THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS...". Alternative readings tested and refuted: ATTRACT/DEMO OUTRO - four of five header entries (vm_run_1, search_location, pre_camp_check, camp_interrupted) all resolve to 0x97A8, a bare EXIT (0x00), so the block is inert outside initial_entry 0x8014; Pools' developer jumper is block 1 (0x8063 HORIZONTAL_MENU ['JUMPER','START'], 0x81C6 "WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)", 0x81EA INPUT_NUMBER #2,[0x00C0], 0x829A NEWECL [0x00C0]), not 75. DEATH/DEFEAT SEQUENCE - only the 57-byte arm 0x824F..0x8287 is a wipe, one branch of the JUMP/WAIT menu.

ENTRY CENSUS. A CFG-reachable NEWECL census over ALL 56 blocks (every block completes; state_limit_reached False for all 56) finds EXACTLY THREE NEWECL #75: blk65 @0x8488, blk67 @0x8A19, blk73 @0x8484, each 20 00 4b. RECALL CONTROL: an alignment-free raw byte sweep for 20 00 4B at every offset in all 56 blocks returns exactly those 3 and all 3 are CFG-aligned - zero recall gap. The sweep is a strict SUPERSET of the walk, demonstrated on 20 00 12 (NEWECL #18): 11 raw sites vs 9 CFG-aligned. CORRECTED, and contradicting the shipped `middle` citation's list of 10: the aligned #18 set is 33@0x96A5, 34@0x9B43, 38@0x81BA, 64@0x8672, 69@0x9C35, 75@0x8597, 83@0x830F+0x97EA+0x983A. 17@0x8AC1 and 52@0x8860 are NOT CFG-aligned under this walk, and 83@0x830F - which that citation omits - IS aligned once opcode 0x31 is framed correctly (below). The two raw-only sites are NOT noise: 0x8AC1 is preceded by 02 01 53 96 (GOSUB 0x9653) and 0x8860 by 09 00 02 01 0e 00 (SAVE #2->[0x000E]); neither lies inside any decoded instruction span or inline string, so they are genuine code this walk does not reach - a coverage gap in blocks 17 and 52, not a false positive. Needs reconciling in the `middle` citation.
DYNAMIC (register-operand) NEWECL sites corpus-wide: exactly four - blk1@0x829A 20 01 c0 00 (the developer jumper above); blk18@0x8746 20 01 9a 00 and blk18@0x8851 20 01 9b 00 (the Limbo hub resolved by the shipped `middle` citation); blk83@0x8BCB 20 02 01 bf. CORRECTED, the last is a MIS-PARSE proven by OVERLAP, not by its operand value (code 2 is a legal EclOpp code): the same walk also decodes AND at 0x8BC7 spanning 9 bytes (0x8BC7..0x8BCF), so 0x8BCB is interior to another decoded instruction - two paths reaching the same bytes at different alignments. SCOPE OF EXCLUSIVITY, CORRECTED: the hub's [0x009A]/[0x009B] are general-purpose scratch words with ~38 and ~45 reference sites across 20+ blocks, including COMPUTED writes (blk51 0x830E ADD #8,[0x00BF]->[0x009B] = 04 00 08 01 bf 00 01 9b 00; blk83 0x9AB0/0x9C47 ADD [0x0216],[0x009B]->[0x009B]; blk81 0x82B7 and blk82 0x8683 SAVE [0x0132]->[0x009B]). What the bytes prove is (a) NO literal write of 75 to either slot exists anywhere in the corpus and (b) block 18's own hub GOSUB writes only {33,69,17,38} to [0x009A] and {34,83,52,64} to [0x009B] (0x929D/0x92A3 AERIE/THORNE, 0x92E7/0x92ED DROW TEMPLE/KALISTES LAND, 0x9331/0x9337 DOWN ROPE/MOANDER, 0x937A/0x9380 ARCAM'S CAVE/BANE'S LAND). A computed hub value is therefore not excluded by inspection; the count of three IMMEDIATE callers is exact, the count of all possible callers is a lower bound. Reachability of #75 is unaffected either way.

THE THREE CALLERS, decoded with their own retail text. blk73 ("AHEAD, IN A WILD ROCK GARDEN, LIES A SINISTER DARK POOL."): 0x8374 PRINTCLEAR [0x0401]str + 0x8378 "'S HAND CLOSES ON THE CRYSTAL OF BANE!"; 0x8398 SAVE #255->[0x01CF] (09 00 ff 01 cf 01); 0x839E SAVE #0->[0x0258]; 0x83AF POOLS_AWARD_XP; 0x83B5 OR #4,[0x01D4]->[0x01D4]; 0x83BE "ACROSS THE REALMS, EVIL BEINGS FALTER, THEIR THOUGHT DRAWN TO " + PRINT [0x0303]str; 0x83F9 COMPARE [0x0254],#0 / IF_NE / 0x8400 SAVE #255->[0x0254]; 0x842B "THE OUTPOUR OF HATE IS ALMOST UNBEARABLE. BUT " + [0x0303]str + " KEEPS THE CRYSTAL IN A DEATH'S GRIP."; 0x847F IF_EQ / 0x8480 GOTO 0x84B2, condition-false arm -> 0x8484 NEWECL #75. blk65 (entry initial_entry 0x8014 03 00 41 01 16 00 COMPARE #65,[0x0016] / IF_EQ / EXIT): 0x8430 "'I WILL OCCUPY THE BALOR!'"; 0x844E "HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE."; 0x8487 CLEAR_BOX; 0x8488 NEWECL #75. blk67 ("THE WIZARD GATE SLAMS BEHIND YOU."): 0x82D8 AND #63,[0x002D]->[0x00AA] (2f 00 3f 01 2d 00 01 aa 00), 0x82FF ON_GOTO [0x00AA] #31 -> arm 0x895F "YOU STAND IN SICK AWE BEFORE THE VESSEL OF MOANDER."; 0x8997 OR #2,[0x024F]->[0x024F]; 0x89A0 "A VILE FLOOD STOPS ANYONE FROM ENTERING ITS ELDRICH ORIFICE."; 0x89D0 COMPARE [0x0250],#0 / 0x89D6 IF_EQ / 0x89D7 EXIT / 0x89D8 PARTYSTRENGTH / 0x89D9 "THE VESSEL REELS IN SPACE, SHAKING ALL THE TOWER. SLICK FLUID SPLASHES ALL OVER."; 0x8A18 PARTYSTRENGTH; 0x8A19 NEWECL #75.

75 DOES NOT BRANCH ON THE CALLER. 0x8014 SAVE #75->[0x0016] (09 00 4b 01 16 00) is block 75's ONLY reference to the last-block-id slot - it writes and never reads it (other blocks do read it: blk65 0x8014, blk16 0x8014, blk24 0x801E). The three-way fork reads persistent story flags instead: 0x801A COMPARE [0x02EE],#255 / 0x8020 IF_EQ / 0x8021 GOTO 0x966F (03 01 ee 02 00 ff / 16 / 01 01 6f 96); 0x8025 COMPARE [0x0254],#255 -> 0x859A; 0x8030 COMPARE [0x01D0],#255 -> 0x85DD; else 0x803B PICTURE #116, 0x803E COMPARE #1,[0x0250] / IF_NE / GOTO 0x81C3, else 0x8049 "AMID THE CONFUSION BEHIND, SHAL STRUGGLES TO JOIN YOU.". One block serves all three callers, variant-selected by flag. NOTE the arms are NOT three denouements: 0x966F is the denouement; 0x859A is "SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE RUINOUS SUBJECTS OF BANE!" and 0x85DD is "YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH." -> dracoliches, Bane minions, pets of Kalistes - both are final-battle escalation arms. Their gate flags have real producers: [0x0254] <- blk73 0x8400 and blk65 0x868F; [0x01D0] <- blk73 0x86A5 and blk74 0x86B0. [0x02EE] is written ONLY at 0x9666, so on a first visit the 0x966F arm is reached by FALL-THROUGH from 0x9663 DELAY / 0x9666 SAVE / 0x966C PROGRAM, and the 0x8021 GOTO exists to make a re-entry land straight on the denouement.

GRAPH POSITION. Immediate-NEWECL edges (corrected 0x31 frame): 18 -0x874A-> 17 -0x8857-> 70 -0x8365-> 67 -0x8A19-> 75 is the shortest path from the Limbo hub (blk18 = "YOU ARRIVE AT ELMINSTER'S CAMP IN LIMBO"). Predecessor detail: 0x874A is reachable ONLY as a selector-target from 0x85A3, never by fall-through, because 0x8746 NEWECL is terminal; 0x8857 falls through from 0x8851; 0x8365 is the condition-false arm of 0x8363; 0x8A19 falls through from 0x8A18; 0x8488 from 0x8487; 0x8484 is the condition-false arm of 0x847F. Other edges: 70->{17,67 @0x8D00,76 @0x96FA}, 77 -0x808B-> 67, 65->{75 @0x8488, 73 @0x8695, 64 @0x880C, 74 @0x95E3}, 73->{75 @0x8484, 65 @0x86AB, 74 @0x8DF8}, 74->{73 @0x846C+0x8508, 64 @0x8677, 65 @0x86B6}, 64->{65 @0x8290, 74 @0x8293, 18 @0x8672}, 67->77 @0x97D9, 76->70 @0x809A. BFS over immediate NEWECL edges from 17 reaches 17 blocks {16,17,18,20,22,23,24,25,33,39,40,50,67,70,75,76,77} including 18 and 75; BFS from 18 reaches the same set. OUT of 75: 0x8597 NEWECL #18 (20 00 12, taken after 0x8577 "REVEALING A POOL OF DARKNESS!" and 0x8591 SAVE #1->[0x000E]) and 0x97A5 NEWECL #24 (20 00 18) preceded by 0x9793 SAVE #4->[0x003A], 0x9799 SAVE #9->[0x0025], 0x979F SAVE #4->[0x0026], with 0x97A8 EXIT immediately after.

DIALECT DEFECT FOUND, PROVEN, AND CROSS-CONTROLLED. The Gen1-SHORT family's opcode 0x31 is a MENU (wordSet 2, countAt 1 - the HORIZONTAL_MENU 0x2b frame), NOT the shared table's zero-operand SPRITE_OFF that tools/dqk_ca03_stream_decode.py:88 and packages/engine/src/ecl/opcodes.ts:89 both carry and that ECL_GEN1_SHORT_POOLS (disassemble.ts:203-214) does not override. Decisive site, inside the subroutine at 0x97A9 that three of block 75's GOSUBs call (0x97A9 SAVE #14->[0x0039]; 0x97AF PRINT "'JUMP ON, YOU FOOLS!'"; 0x97C4 SAVE #0->[0x0039]; 0x97CA DELAY): 0x97CB 31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54 = MENU [0x00BF] #2 "JUMP" "WAIT" (16 B; 6-bit MSB-first packing, decode_ecl_string(29 53 50)='JUMP', (5c 12 54)='WAIT'), then 0x97DB 03 00 01 01 bf 00 COMPARE #1,[0x00BF], then 0x97E1 13 RETURN. Under the shipped frame the same bytes read as SPRITE_OFF + GOTO with operand code 0xBF - not one of the six legal EclOpp codes {0,1,2,3,0x80,0x81} - and the routine appears to end in EXIT, destroying its callers' fall-through. POOLS METRIC, all 56 blocks, only 0x31's frame changed: CFG-reachable instructions 29,356 -> 32,516; illegal operand codes 448 -> 335; reachable 0x31 sites 135 -> 141; successor-of-0x31 histogram GOTO 135/135 (every one the same bogus 01 bf 00) -> ON_GOTO 85 / COMPARE 43 / RETURN 4 / PRINTCLEAR 2 / 7 singletons (GOTO, SAVE, RANDOM, GOSUB, CALL, AND, OR); all 403 inline menu items across the 141 sites decode to legal English (153 unique), 403/403, zero exceptions (blk17 0x8DEB ['ATTACK','FLEE','TALK','WAIT']; blk21 0x841E ['FORCE THE DOOR','PICK','KNOCK','NOTHING']; blk32 0x9264 ['FIGHT','ACCEPT','DEMAND MORE MONEY','REFUSE']); count operand always 2-5 (2:43, 3:77, 4:19, 5:2 = 141); dest a scratch word at 138 of 141 sites ([0x00BF] x103, [0x00C1] x12, [0x00C0] x11, [0x00AB] x6, [0x0098] x5, [0x009F] x1) - CORRECTED, the three exceptions are [0x01D1] x1, [0x00C2] x1, [0x009D] x1, and [0x01D1] sits in the persistent story-flag range next to [0x01D0]. CROSS-TITLE CONTROL (run, and decisive): DoK improves identically - reachable 12,443 -> 13,571, illegal 548 -> 515, 55 -> 63 sites, 135/135 legal English items ('ATTACK CORPSE','ATTACK PATROL','BALANCE') - so this is a Gen1-SHORT-FAMILY framing, not a Pools-only one. Gateway, Treasures and Champions have ZERO reachable 0x31 (no signal either way). CoAB, the Gen1-LONG dialect, REGRESSES under the same change - reachable 14,169 -> 14,161, illegal operand codes 0 -> 67, only 10/17 items legal - so 0x31 genuinely is not a menu there and the fix must be scoped to the short family.

THE TWO UNREACHED RUNS ARE ARTEFACTS OF THAT DEFECT, NOT DEAD CODE. Block 75 shipped frame: 512 reached, 0 truncations, 1 illegal operand code, uncovered runs >=48 B = exactly {0x8079..0x80D7 (95 B), 0x824F..0x8287 (57 B)}. Corrected frame: 527 reached, 0 truncations, 0 illegal operand codes, uncovered runs >=48 B = EMPTY. Contents: 0x8079 IF_NE; 0x807A GOTO 0x80D8; 0x807E PRINTCLEAR "SHE DRAWS NEAR."; 0x808D GOSUB 0x97A9; 0x8091 IF_NE; 0x8092 GOTO 0x80D8; 0x8096 SAVE #1->[0x00C8]; 0x809C PRINTCLEAR "SHE RACES PAST YOU AND FLINGS HERSELF ONTO THE GYRATING VESSEL!"; 0x80CF GOSUB 0x97A9; 0x80D3 IF_EQ; 0x80D4 GOTO 0x824F - the repeated JUMP/WAIT prompt; and 0x824F GOSUB 0x97E2 ("WITH A JARRING THUD THE VESSEL RAMS THE TOWER, AND SHATTERS IT."); 0x8253 PRINTCLEAR "THE TOWER SLIDES INTO UTTER RUIN, AND YOU WITH IT."; 0x827C DAMAGE #224 #0 #0 #255 #0 (2e 00 e0 00 00 00 00 00 ff 00 00); 0x8287 SURPRISE (23) - the WAIT-too-long party-wipe branch. The corrected frame does not change the #75 entry census: still exactly three immediate NEWECL #75.

THE 0x9817 LOOP IS A NAMED-CHARACTER SEARCH, NOT AN END-OF-GAME ROSTER WALK. 0x873C SAVE [0x0303]str->[0x032B]str (09 81 03 03 81 2b 03) stores the crystal-bearer's name; 0x8743 GOSUB 0x9817 (02 01 17 98). Body: 0x9817 SAVE #0->[0x00BF] (09 00 00 01 bf 00); 0x981D LOAD_CHARACTER [0x00BF] (0a 01 bf 00); 0x9821 COMPARE [0x032B]str,[0x0401]str (03 81 2b 03 81 01 04); 0x9828 IF_EQ / GOTO 0x983A; 0x982D ADD #1,[0x00BF]->[0x00BF]; 0x9836 GOTO 0x981D; 0x983A COMPARE [0x05EE],#0 (03 01 ee 05 00 00); 0x9840 RETURN. It walks party slots until the loaded character's name field [0x0401] matches the stored name [0x032B], then returns flags set from that character's status word [0x05EE]. Callers: 0x8743 (followed by 0x8747 COMPARE [0x05EE],#8) and 0x8788. It writes no character data, displays nothing, exports nothing. The real end-of-game roster walk is a different loop, 0x95BE..0x95E1: 3a 0a 01 c4 00 09 01 b3 04 01 fd 05 09 00 00 01 ee 05 04 00 01 01 c4 00 01 c4 00 03 01 c4 00 01 20 00 18 01 01 be 95 = DELAY; LOAD_CHARACTER [0x00C4]; SAVE [0x04B3]->[0x05FD]; SAVE #0->[0x05EE]; ADD #1,[0x00C4]->[0x00C4]; COMPARE [0x00C4],[0x0020]; IF_LT; GOTO 0x95BE - a full-party restore (max HP [0x04B3] -> current HP [0x05FD], status [0x05EE] cleared) over party size [0x0020], run immediately before the denouement, preceded by 0x958B "THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES." and followed by 0x95E6 [0x0303]str + " LOOKS DOWN, AND OPENS " + GOSUB 0x9841 (a HIS/HER gender helper on [0x0567]) + " HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN " + " FINGERS, AND BLOWS AWAY ON A FRESHENING WIND.".

OPEN GAPS, stated honestly. (1) The FIRST hop out of the Phlan starting cluster {16,23,24,25,39,40} is not proven: that set is a closed sink in the immediate-NEWECL graph (16->23 @0x87D9; 23->{16 @0x84C9, 24 @0x84C6}; 24->{16 @0x801B, 23 @0x82BB, 25 @0x82B2, 39 @0x8755}; 25 -> nothing; 39->{24 @0x858A, 40 @0x852A}; 40->39 @0x8100) and the hub-value analysis above does not supply the hop. Candidates are an engine/GEO-driven area transition or one of the seven in-degree-zero blocks {4,26,27,34,37,54,66}; 34 is already proven hub-entered by the shipped `middle` citation, and 26 ("YOU ARE ABOUT TO LEAVE. CONTINUE?", NEWECL #25/#17/#36 at 0x80DD/0x80E0/0x8487/0x848A/0x8E1C) is the strongest untested candidate. Everything from 17 and 18 onward to 75 IS proven. (2) No live retail run and no VM replay of block 75 in this pass - static CFG only; flag semantics of [0x0254]/[0x01D0]/[0x0250] are known only from their literal COMPARE/SAVE sites. (3) The corrected 0x31 frame is NOT shipped: opcodes.ts:89 and dqk_ca03_stream_decode.py:88 still carry SPRITE_OFF wordSet 0 and ECL_GEN1_SHORT_POOLS has no override, so the browser VM cannot execute block 75's JUMP/WAIT beat or any of the 141 Pools / 63 DoK menu sites, and the Python scanner under-reports Pools by 3,160 and DoK by 1,128 reachable instructions. (4) 16 reachable bytes corpus-wide still fail decode_one under the corrected frame (blk16 0x9470, blk18 0x8E0D, blk20 0x93B4, blk22 0x9217, blk23 0x99D1, blk36 0x9256, blk37 0x86BC, blk41 0x8416, blk48 0x8F9E, blk49 0x8696, blk52 0x8934, blk69 0x8AFE, blk74 0x9B6F, blk77 0x85AA, blk81 0x99CD, blk83 0x8F3A) - none in blocks 65/67/73/75, so they do not affect this verdict, but they mark further Pools dialect gaps.

KEY ADDRESSES. ECL1#65 0x8488 NEWECL #75 (20 00 4b); ECL1#67 0x8A19 NEWECL #75 (20 00 4b); ECL1#73 0x8484 NEWECL #75 (20 00 4b); ECL1#75 0x8014 SAVE #75->[0x0016] (09 00 4b 01 16 00, write-only); ECL1#75 0x801A COMPARE [0x02EE],#255 / IF_EQ / GOTO 0x966F; ECL1#75 0x8025 -> 0x859A; ECL1#75 0x8030 -> 0x85DD; ECL1#75 0x8597 NEWECL #18 (20 00 12); ECL1#75 0x9666 SAVE #255->[0x02EE] (sole writer corpus-wide) / 0x966C PROGRAM #1 (unique among 26 PROGRAM sites); ECL1#75 0x966F..0x9792 Elminster denouement; ECL1#75 0x97A5 NEWECL #24 (20 00 18) / 0x97A8 EXIT; ECL1#75 0x97A9 JUMP/WAIT subroutine entry, 0x97CB MENU [0x00BF] #2 'JUMP' 'WAIT' (31 01 bf 00 00 02 80 03 29 53 50 80 03 5c 12 54), 0x97DB COMPARE #1,[0x00BF], 0x97E1 RETURN; ECL1#75 0x9817..0x9840 named-character search; ECL1#75 0x873C SAVE [0x0303]str->[0x032B]str (09 81 03 03 81 2b 03); ECL1#75 0x95BE..0x95E1 full-party restore loop; ECL1#75 0x8079..0x80D7 (95 B) JUMP/WAIT beat; ECL1#75 0x824F..0x8287 (57 B) WAIT party-wipe; ECL1#24 0x8014 COMPARE [0x02EE],#0 / 0x801B NEWECL #16 (post-victory gate); ECL1#18 0x874A NEWECL #17 (selector-target from 0x85A3); ECL1#17 0x8857 NEWECL #70; ECL1#70 0x8365 NEWECL #67; ECL1#83 0x8BC7 AND (9 B) overlapping the 0x8BCB NEWECL mis-parse; ECL1#1 0x81EA INPUT_NUMBER #2,[0x00C0] / 0x829A NEWECL [0x00C0] (developer JUMPER).
```

