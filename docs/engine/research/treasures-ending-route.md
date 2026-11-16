# Treasures of the Savage Frontier — the ENDING leg (2026-08-06)

> **Status: PROVEN.** Treasures' campaign ending is `ECL1.DAX` block **38**, reached from
> `GEO1.DAX#38`'s descriptor-`0xF9` cells **(2,6)** and **(3,6)** (the Freezefire lair on the Ice
> Peak). The chain runs: enter the hoard → blackrobe ambush combat → the gem / Amanitas cinematic →
> the revived white dragon **FREEZFIRE** (`MON1CHA.DAX` id 88, the archive's unique strongest
> record) → victory at `0x9F41` → a six-beat denouement → two treasure awards → the game's last
> line at `0xA31D` ("...IT HAS, INDEED, BEEN GLORIOUS!") → `NEWECL #51` back to the wilderness with
> a spawn quad of (facing 3, x 7, y 1, area 54). The whole chain runs end-to-end through the real
> `EclVm` and is pinned by `packages/engine/test/treasuresEndingRoute.test.ts`.
>
> **Closing this leg required correcting Treasures' ECL dialect twice more** (opcodes `0x27` and
> `0x37`). Under the dialect the engine currently ships, the VM desyncs mid-denouement and the
> last four beats of the game — including its final line — are unreachable. See §1 and §8. The
> correction is proven from the corpus and cross-checked against seven sibling titles, but it is
> **not** proven from Treasures' own `GAME.OVR` handler bytes; see §10.
>
> **Re-verified independently 2026-08-06** with a separately-written CFG walker: every decisive
> number reproduces exactly (§12). That pass also **corrected one overclaim** in the original §2a —
> the "one writer + three cross-block readers" latch shape is *not* unique in this corpus (seven
> addresses share it), so the campaign-terminal reading of `[0x025C]` now rests on what its readers
> **remove** (the `ICE PEAK` travel destination) rather than on the writer/reader count. See
> §2a-bis, and §2d for the corpus-wide "nothing else could be the ending" search.

Method continues `docs/engine/research/treasures-natural-route.md` (the already-proven `early`
leg), `gateway-quest-flag.md` and `dok-natural-route.md`.

---

## §0 — Ground truth, tools, and framing constants

Install resolved programmatically (`goldbox_corpus.choose_install` / `file_index`), not hardcoded:
`C:\Program Files (x86)\GOG Galaxy\Games\Treasures of the Savage Frontier`.

`ECL1.DAX` = 251,712 bytes, **30 blocks**: `4, 16…40, 47, 49, 50, 51`. This is the whole game;
there is no ECL0/ECL2/etc. `GEO1.DAX` = 29,983 bytes, 41 blocks (`16…40, 47…62`).

Gen1 addressing: `vbase = 0x7FFE`, file offset `= vaddr − 0x8000 + 2`, header 22 bytes with five
far pointers (`vm_run_1`, `search_location`, `pre_camp_check`, `camp_interrupted`,
`initial_entry`). Block 38's are `8548 / 85F9 / 8059 / 80C0 / 8014`.

Every number in this document was produced by walking the retail bytes with
`tools/gen1_ecl_encounter_scan.py`'s own `decode_one` / `successors` / `header_entries`, or by
running the real `packages/engine` VM. Nothing is hand-traced.

**One correction was made to the static walker for this work** and is used throughout: opcode
`0x24 COMBAT` sets the interpreter's compare flags (the universal `COMBAT; IF_NE; GOTO defeat`
idiom), so it must clear any constraint inherited from an earlier `COMPARE`. The shipped scanner
lists `{0x14, 0x1D, 0x2F, 0x30, 0x3F}` as flag-clobbering but not `0x24`, so the *defeat* arm of
every fight in the corpus is invisible to it. Concretely, block 38's `94D2 GOTO [A91F]` (the
ending fight's own defeat handler) is not in the shipped scanner's reachable set. This is recorded
here as an observation about the tool; `tools/` was not modified.

---

## §1 — Two more Treasures-only operand-frame corrections, and why the ending depends on them

The authoritative dialect for this title is
`ECL_GEN1_SHORT_TREASURES` / `gen1_ecl_encounter_scan.word_sets_for_profile(...)` =
`{0x0C:4, 0x1D:0, 0x21:2, 0x22:0, 0x23:0, 0x2C:1}`. Decoding block 38 with exactly that table
**halts the ending mid-denouement**:

```
a19c  1d                       PARTYSTRENGTH
a19d  09 00 01 01 56 00        SAVE #1 -> [0056]
a1a3  1c                       CLEARMONSTERS
a1a4  27 02 98 3a 00 fa 00 28 00 00 24 0e 00 f5 12 80 70 94
                               TREASURE  [3a98], #250, #40, #0, ?24:000e, #245, ?12:0080, ?70:0094
      ---- 523 bytes unreachable ----
```

Three of the eight decoded operands carry **impossible operand-code bytes** (`0x24`, `0x12`,
`0x70`; the only legal codes are `{0, 1, 2, 3, 0x80, 0x81}`), the instruction ends at `0xA1B6`,
and `raw[0xA1B6] = 0x61` is not an opcode, so the stream dies. Everything after
"...AFTER THE PARTY IS REWARDED!" is lost.

Two corrections resolve it:

| opcode | shipped frame | corrected frame |
|---|---|---|
| `0x27 TREASURE` | `wordSet 8`, no count | **`wordSet 4`, `countAt 3`** (3 fixed operands + a count + `count` more) |
| `0x37 LOAD_PIECES` | `wordSet 3` | **`wordSet 2`** — an inline name + a destination, i.e. the party-name lookup Pools of Darkness's own `GAME.OVR+0x1eca` handler is already proven to implement |

### 1a. The block-47 count ladder — decisive, and readable in raw bytes

`ECL1.DAX#47` contains eight consecutive `0x27` instructions at `0x9E4B, 0x9E57, 0x9E65, 0x9E75,
0x9E87, 0x9E9B, 0x9EB1, 0x9EC9`:

```
9e4b  27 00 00 00 00 00 00  00 01  00 9e                                              13
9e57  27 00 00 00 00 00 00  00 02  00 9e 00 9e                                        13
9e65  27 00 00 00 00 00 00  00 03  00 9e 00 9e 00 9e                                  13
9e75  27 00 00 00 00 00 00  00 04  00 9e 00 9e 00 9e 00 9e                            13
9e87  27 00 00 00 00 00 00  00 05  00 9e 00 9e 00 9e 00 9e 00 9e                      13
9e9b  27 00 00 00 00 00 00  00 06  00 9e ×6                                           13
9eb1  27 00 00 00 00 00 00  00 07  00 9e ×7                                           13
9ec9  27 00 00 00 00 00 00  00 08  00 9e ×8                                           13
```

Three `00 00` immediates, then `00 N` where N = 1…8, then **exactly N** copies of `00 9e`
(immediate 158), then `13 RETURN`. The 4th operand is a count field and it governs the operand
list that follows. That fixes `wordSet 4, countAt 3` and nothing else. No control-flow model is
needed to read this — it is visible in the raw bytes.

### 1b. Zero illegal operand codes, corpus-wide

Counting operand `code` bytes outside `{0,1,2,3,0x80,0x81}` over every CFG-reachable instruction
in all 30 blocks, and counting reached instructions whose byte span contains another reached
instruction's start (self-inconsistent boundaries):

| framing | reached ins | illegal codes | boundary overlaps | byte coverage | strings |
|---|---|---|---|---|---|
| shipped (`0x27=8`, `0x37=3`) | 17,937 | **105** (22 blocks) | **57** | 85.3 % | 2,771 |
| `0x27=4/countAt3`, `0x37=2` | **19,658** | **0** | **0** | **94.5 %** | **3,160** |
| `0x27=4` no count, `0x37=2` | 18,764 | 0 | 0 | 89.7 % | 2,920 |
| `0x27=3`, `0x37=2` | 18,679 | 0 | 0 | 89.1 % | 2,910 |

The illegal-code metric eliminates the shipped framing outright. The remaining three are separated
by §1a plus coverage: `countAt 3` is the only one that decodes the block-47 ladder, and it reaches
~900 more instructions and ~240 more strings than its nearest rival.

### 1c. Cross-title control — the metric is not just "more is better"

The same measurement run against every other Gen1 title's own ECL corpus and dialect:

| title | illegal codes @ `0x27=8` | illegal codes @ `0x27=4/c3`+`0x37=2` |
|---|---|---|
| Gateway to the Savage Frontier | **0** | 1 |
| Curse of the Azure Bonds | **0** | 259 |
| Champions of Krynn | **0** | 215 |
| Secret of the Silver Blades | **0** | 6 |
| **Treasures of the Savage Frontier** | **105** | **0** |
| Death Knights of Krynn | 548 | 480 |
| Pools of Darkness | 443 | 136 |

The metric correctly says "8 operands" for the four titles where 8 is already the accepted frame,
and inverts only for Treasures. (DoK and Pools are noisy under both — they have unrelated open
dialect questions and are not evidence either way here.)

**Corrected 2026-08-06.** An earlier draft called Gateway "the sharpest control" (same
developer, same year, same `.DAX` family, unambiguously 8-operand). On the illegal-code metric
that is backwards: **CoAB (0→259) and CoK (0→215) are the sharp controls; Gateway moves only
0→1 across 48 CFG-reachable `0x27` sites**, i.e. applying a frame that is definitely wrong for
Gateway produces almost no illegal codes at all. Gateway is therefore the *bluntest* case here
and is a **caveat on the illegal-code metric** (it can nearly fail to detect a wrong frame),
not support for it. The decisive cross-title control is **§1d's successor invariant**, which
inverts cleanly on both: Gateway shipped `37 COMBAT / 13 SETUP_MONSTER / 4 LOAD_MONSTER` vs
**48/48 EXIT** under the Treasures frame; CoAB shipped `59 COMBAT / 4 SAVE` vs `43 EXIT /
7 GOSUB / 1 RANDOM / 1 GOTO`.

### 1d. Structural invariant

Under the corrected frame, **all 99** reachable `0x27` sites in the corpus are immediately
followed by `COMBAT` (90) or `RETURN` (9) — zero exceptions. The instruction immediately before is
`LOAD_MONSTER` (63), `CLEARMONSTERS` (27), or a jump target (11). A desynced frame cannot produce
a 99/99 invariant.

*Inference (labelled):* `0x27` in Treasures is the same semantic command as CoAB's `TREASURE`
re-framed to 3 coin slots plus a variable-length item-id list, attached to the `COMBAT` that
follows. The `CLEARMONSTERS; TREASURE; COMBAT` shape (27 sites) is then "award loot with no
fight". The operand *names* are an inference; the *frame* is not.

### 1e. `0x37` corroborated locally

At `0x96BA`: `37 80 05 1c 15 48 3c b0 01 c0 00` = inline packed name `"GAUHOK"` + destination
`[0x00C0]`, and the very next instructions are `COMPARE [00C0], #7; IF_GT GOTO [9801]`. That is
exactly the Pools-proven contract (`0xFF` when the named character is absent, otherwise a
zero-based party ordinal ≤ 7). The engine's VM already implements it, keyed on the mnemonic
`POOLS_FIND_CHARACTER`.

---

## §2 — Which block is the ending, and why nothing else can be

All 30 blocks were enumerated and characterised (CFG walk from all five header entries; every walk
terminated, none hit the state cap). Three independent discriminators all select block 38.

### 2a. The campaign-terminal latch `[0x025C]` — exactly one writer

| | |
|---|---|
| writes | **1**, block 38 `0x9F3B`: `09 00 01 01 5c 02` = `SAVE #1 -> [0x025C]` |
| reads | 3, in three **other** blocks: 19 `0x890C`, 33 `0x975D`, 51 `0x8063` |

A control-flow-free raw byte scan for the 3-byte operand pattern `{01|02|03|81} 5C 02` over all 30
blocks finds exactly four candidate slots corpus-wide — `blk19@0x890D`, `blk33@0x975E`,
`blk38@0x9F3E`, `blk51@0x8064` — i.e. the one write and the three reads, and nothing hidden by the
CFG model.

The write sits between `COMBAT / IF_NE / GOTO [A91F]` and the victory text, so it latches "the
dragon is dead". What the three readers do when it is set:

* **block 19** (`COMPARE [025C],#0; IF_NE GOTO [8B36]`) skips Amanitas's offer
  *"ARE YOU READY TO TAKE ON THE BURDEN OF CARRYING A MAGICAL ITEM OF GREAT POWER?"*
* **block 33** drops a destination from the ship menu: `HORIZONTAL_MENU` becomes
  `"NEVERWINTER" | "STAY"` instead of `"NEVERWINTER" | "ICE PEAK" | "STAY"` — the endgame area is
  no longer offered.
* **block 51** (the wilderness) skips the two `GETTABLE`s that seed `[0042]`/`[0057]`, the
  region's random-encounter group.

One writer, three cross-block consumers, all of which *remove* content.

### 2a-bis — the honest strength of that argument (correction, 2026-08-06 re-verification)

An earlier draft of this section asserted that "one writer + three cross-block readers" is *itself*
the signature of a campaign-completed latch. **That overclaims, and the census refutes it.**
Enumerating every address in the corpus with exactly one CFG-reachable `SAVE` writer and two or
more *other* reader blocks yields **seven** candidates, not one:

| address | written | read by blocks | what it is |
|---|---|---|---|
| `[0008]` | blk49 `8F39` `SAVE #18` | 18,21,25,26,27,28,29,35,38,51 | not a 0/1 flag (stores 18) |
| `[0104]` | blk17 `804A` `SAVE [0567]` | 26,27,31 | a copy, not a latch |
| `[0208]` | blk31 `A6C5` `SAVE #1` | 26,27,28 | **nearest rival — see below** |
| **`[025C]`** | **blk38 `9F3B` `SAVE #1`** | **19,33,51** | **the campaign-terminal latch** |
| `[0138]` | blk20 `8D12` `SAVE #1` | 21,51 | |
| `[01F8]` | blk30 `8EDD` `SAVE #255` | 28,31 | |
| `[0129]` | blk40 `8EFA` `SAVE #1` | 21,28 | |

So the *shape* is common in this corpus and selects nothing on its own. Two things do discriminate,
and both were read from bytes:

1. **What the readers remove.** `[025C]` is the only one whose readers delete a *travel
   destination*. Block 33's `HORIZONTAL_MENU` literally decodes to `['NEVERWINTER','ICE PEAK','STAY']`
   when the latch is clear and `['NEVERWINTER','STAY']` when it is set — with `ON_GOTO` dropping the
   middle target `0x9917` (the Ice Peak voyage). After block 38 runs, the game will no longer carry
   the party to the endgame map. Block 33 is the only place in the corpus where a latch removes
   a **travel destination** — established 2026-08-06 by enumerating every CFG-reachable
   `HORIZONTAL_MENU`/`VERTICAL_MENU` in all 30 blocks and looking for same-block strict-subset
   pairs. Other menu-item removals **do** exist (blk22's `BASH`/`PICK`/`KNOCK`/`DISPELL`
   variants, blk23's `FIGHT`/`EAT`/`TALK`/`LEAVE` variants, blk30 `0x8E4C`→`0x8EB7` dropping
   `'INTRODUCE SELVES'`), but none of them is a destination and none is gated on a campaign
   latch. (An earlier draft asserted a flat "nothing else in the corpus removes a destination"
   without citing the search that establishes it; that flat form is false for menu removals in
   general.)
2. **The write is not self-guarded.** `[0208]`'s write site is immediately preceded by
   `A6BD COMPARE [0208],#1; A6C3 IF_EQ; A6C4 EXIT` — the classic do-once re-entry guard of a
   "you have already seen this scene" flag, and its text is a mid-campaign prisoner/pirate scene
   (`A6CB` *"A SINGLE FIGURE SITS DEJECTEDLY IN A FAR CORNER OF THIS ROOM…"*, `A64B` *"PIRATES
   ATTACK!"*). `[025C]`'s write at `9F3B` carries no such guard: it is written unconditionally on
   the instruction after the boss fight resolves.

The corrected reading: §2a is *supporting* evidence whose force comes from reader **semantics**, not
from the writer/reader arithmetic. The load-bearing discriminators for "block 38 is the ending"
remain §2b (cinematic length) and §2c (the boss record), plus the text itself (§2d).

### 2b. The two longest cinematics in the game are both in block 38

Longest branch-free stretch of reached instructions containing `PRINT`/`PRINTCLEAR` (branches,
menus, inputs, `CALL` and `NEWECL` all terminate a stretch), by decoded text characters:

| rank | chars | prints | block | range |
|---|---|---|---|---|
| 1 | **1217** | 10 | **38** | `99A5..9D7D` — the gem / Amanitas cinematic |
| 2 | **1155** | 9 | **38** | `9F38..A305` — the victory and denouement |
| 3 | 949 | 7 | 30 | `90CF..93CE` |
| 4 | 708 | — | 29 | `8AD5..8D0B` |
| 5 | 666 | 4 | 47 | `A739..A944` |

(Row 4 added 2026-08-06 on re-measurement; block 29's best stretch is 708 chars, so the longest
stretch in any block **other than 38** is block 30's 949 — block 38 leads its best rival block
1217:949 = 1.28×, not the 1.7× an earlier §12 row implied.)

The runner-up (block 30) is a mid-campaign beat, not an ending: it is the Mirabar council scene
(*"KING STEELFIST STANDS AND SAYS, 'I, TOO, WOULD LIKE TO REWARD YOU…'"*) and it ends by *starting*
a fight (*"'IMPOSTER!' RAURYM SHOUTS. 'HE'S A KRAKEN SPY! STOP HIM!'"*), not by resolving the
campaign. This is the strongest counter-candidate on the "longest cinematic" axis and it does not
survive reading.

### 2c. The boss record is the archive's unique extreme

`MON1CHA.DAX` holds 102 records. `FREEZFIRE` (id 88) is the **unique minimum in both AC (−4) and
THAC0 (4)** across all 102 — no other record ties either. HD 14, 1d10 damage, `combatSize 2`
(large). It is loaded exactly once in the corpus, by block 38 at `0x9F2B`.

### 2d. Corpus-wide terminal-text search — the "nothing else could be it" check

All **3,160** CFG-reachable inline strings across all 30 blocks (primary walker; see §12 on the
~2–3 % spread between the three walkers — corrected 2026-08-06, this said 3,164) were extracted
structurally (§9)
and searched for ending vocabulary. Counting *every* hit, not a sample:

| needle | hits | where |
|---|---|---|
| `GLORIOUS` | **1** | blk38 `A31D` — the last line |
| `HEROES OF THE NORTH` | **1** | blk38 `A282` |
| `THE END` | 2 | blk19 `8B6C`, blk34 `87AA` — both *"at the end of the street/mine"*, not terminal |
| `CONGRATUL` | 2 | blk17 `8B14`, blk29 `8385` |
| `VICTORY` | 5 | blks 17, 29, 34, 36, 38 |
| `FAREWELL` | 6 | blks 23, 26, 27 — NPC goodbyes |
| `YOUR QUEST IS` / `ADVENTURE IS OVER` | 0 | — |

**The strongest counter-candidate is block 17** `8B14`: *"'CONGRATULATIONS!' SAYS MILZORR, THE
LEADER OF THE DWARVES. 'YOU HAVE DEFEATED LORD GEILDARR, AND OUR VICTORY IS WON!…'"* — a genuine
boss-defeat celebration. It is not the ending, and three independent facts say so: block 17 ends by
`NEWECL`-ing to block **16** (the campaign continues — established by a decoded CFG walk: block
17's sole CFG-reachable `NEWECL` target is the immediate `#16`, **not** by a raw `20 00 ??` byte
scan, which also yields 24 and 27 in that block; corrected 2026-08-06); its longest cinematic is
530 characters against block 38's 1,217; and it writes no campaign latch — `[025C]` still has exactly one writer
corpus-wide, in block 38. Geildarr is a mid-campaign antagonist, and this is a chapter victory.

No block other than 38 contains text that resolves the campaign.

---

## §3 — The trigger cell and its dispatch arithmetic

Block 38's `search_location` (`0x85F9`):

```
85f9  09 00 02 01 53 00              SAVE #2 -> [0053]
85ff  2f 01 2d 00 00 80 01 bf 00     AND [002d], #128 -> [00bf]      ; high bit of the descriptor
8608  16                             IF_EQ
8609  09 …                           SAVE [02be] -> [0053]
8610  2f 00 7f 01 2d 00 01 9a 00     AND #127, [002d] -> [009a]      ; descriptor & 0x7F
8619  02 …                           GOSUB [90ed]
861d  03 …                           COMPARE [009a], #21
8623  1b                             IF_GE
8624  01 …                           GOTO [866d]
8628  25 …                           ON_GOTO [009a], #21, …          ; indices 0..20
866d  05 00 79 01 9a 00 01 bf 00     SUBTRACT #121, [009a] -> [00bf] ; = [009a] − 121
8676  25 01 bf 00 00 07 01 27 92 …   ON_GOTO [00bf], #7, [9227], [a41a], [a5b6], [a6c1],
                                                       [a789], [a7a9], [a849]
```

`SUBTRACT` is `op2 − op1` (COAB `CMD_AddSubDivMulti`), and `ON_GOTO` is 0-based with
out-of-range falling through. So the ending is index 0, i.e. **`descriptor & 0x7F == 121` (0x79)**.
Treasures reads its cell descriptor from `[0x002D]`, not `[0xC04F]` — already established by the
`early` leg and encoded as `EclDialect.cellDescAddr`.

`GEO1.DAX#38` (1026 bytes, 16×16, descriptors at `raw[514:770]`, index `y*16+x`): exactly **two**
cells carry `desc & 0x7F == 121`, both with the raw byte **`0xF9`**:

```
(x=2, y=6) = 0xF9        (x=3, y=6) = 0xF9
```

No other value in the map's descriptor histogram masks to 121.

**Reachability.** The map's own re-entry cell is `(7,8)`, descriptor `0x8C` → masked index 12,
which the 0-based `ON_GOTO` at `0x8628` dispatches to **`[0x8B95]`** (`COMPARE [0011],#1 ;
IF_NE ; EXIT`, then the `PRINTCLEAR` at ~`0x8B9C` *"AT YOUR FEET IS A STAIRWAY THAT LEADS DOWN
INTO A TUNNEL. YOU RECALL THAT THIS IS THE OPENING THROUGH WHICH YOU ENTERED THIS CAVERN."* —
i.e. the narration is facing-gated). **Corrected 2026-08-06:** an earlier draft paired that text
with `[0x88DA]`. `[0x88DA]` is `ON_GOTO` index **11**, a different cell whose text is *"THE
PATHWAY ENDS HERE, COVERED BY AN AVALANCHE OF ROCKS AND BOULDERS."* The conclusion — that
`(7,8)` is the re-entry cell — is unaffected; only the vaddr/text pairing was wrong. (Index
20 → `[0x9010]` was and remains correct.)
`tools/find_geo_path.py --geo GEO1.DAX --block 38 --start 7,8 --target 3,6 --facing north
--event-mask 127` returns a **6-step** legal path with `blocked_cell_count 0` and no required
interactions:

```
(7,8) -west-> (6,8) -west-> (5,8) -north-> (5,7) -west-> (4,7) -north-> (4,6) -west-> (3,6)
 idx 12         idx 0         idx 0         idx 0         idx 0         idx 20        idx 121
final facing: west
```

The only non-zero intermediate descriptor is `(4,6)` index 20 → `[9010]`, a benign narration
(*"THE CEILING OF THE CAVERN RISES HIGH OVER YOUR HEADS…"*). No doors, no locks, no combat en
route.

---

## §4 — The chain, beat by beat

All vaddrs are in `ECL1.DAX#38`.

| vaddr | what |
|---|---|
| `9227` | *"ENTERING THE CHAMBER, YOU ARE STUNNED INTO SILENCE."* + `PICTURE #243` |
| `9286`–`9326` | the hoard description (three beats) |
| `9363` | `ON_GOSUB [00b0], #2, [A3C1], [A3F0]` — light-source-dependent phrase ("SHAFTS OF LIGHT GLEAMING OFF THE FANTASTIC TREASURE" / "MULTITUDE OF PINPOINT GLEEMS IN THE DARKNESS") |
| `93A3` | *"YOUR ENEMIES HAVE BEATEN YOU TO THE TREASURE! YOU DRAW YOUR WEAPONS; THEY ATTACK!"* |
| `93EB`–`9444` | placement words, forked on `COMPARE [0034], #2` — i.e. on which of the two lair cells you entered from |
| `944A`–`94D0` | `SETUP_MONSTER`, the roster loop, and **COMBAT #1** |
| `94D1`/`94D2` | `IF_NE` → `GOTO [A91F]` (defeat/flee handler) |
| `94D6`–`963B` | victory, the gem, the mummified white dragon, *"FREEZEFIRE!"* |
| `96BA`/`96C5` | `FIND_CHARACTER "GAUHOK" -> [00C0]`, `FIND_CHARACTER "KRIIADOR" -> [00C7]` |
| `96D1`–`98E6` | four-way fork on which of the two NPCs is in the party (§6) |
| `99C3`–`9C95` | the light → globe → **Amanitas** projection cinematic (5 beats) |
| `9D21`–`9E08` | the "POP" comes from the dragon; a party member seizes the gem |
| `9E2D`–`9EA7` | *"ITS GEM STOLEN, THE WITHERED DRAGON HAS RETURNED TO LIFE!"* |
| `9F07`–`9F32` | `SETUP_MONSTER #255,#0,#255,#0`; `LOAD_MONSTER #28×5`, `#28×3`, `#88×1`; **COMBAT #2** |
| `9F33`/`9F34` | `IF_NE` → `GOTO [A91F]` |
| `9F38` | `PICTURE #241` |
| **`9F3B`** | **`SAVE #1 -> [0x025C]`** — the campaign-terminal latch (§2a) |
| `9F41` | *"FREEZEFIRE'S DEAD BODY LIES AT YOUR FEET! …AS YOU SAVOR VICTORY."* |
| `9FB3`, `A021`, `A0A0`, `A10A`, `A180` | the five-beat denouement (dwarves, Icewolf, the feast, the hoard shared, *"...AFTER THE PARTY IS REWARDED!"*) |
| `A19D` | `SAVE #1 -> [0056]` |
| `A1A3`–`A1AE` | `CLEARMONSTERS`; `TREASURE [3A98], #250, #40, #0`; `COMBAT` — award #1 |
| `A1B2`, `A226` | Waterdeep emissaries, Luskan withdraws, no war; the gem escorted to Waterdeep |
| `A274`–`A27E` | `CLEARMONSTERS`; `TREASURE #0, #20, #20, #0`; `COMBAT` — award #2 |
| `A282` | Lord Piergeiron names the party *"THE HEROES OF THE NORTH"* |
| `A2F2`–`A319` | `SAVE #0 -> [0056]`; `CLEAR_BOX`; final picture chosen as `#167` unless `[0106] < 100` or `[0107] < 100`, in which case `#2` |
| **`A31D`** | **the game's last line** — *"ON A HILLSIDE OUTSIDE WATERDEEP YOU RECALL YOUR MANY QUESTS. THE MONSTERS SLAIN, THE TREASURES WON, THE THOUSANDS OF INNOCENT LIVES YOU'VE SAVED. IT HAS, INDEED, BEEN GLORIOUS!"* |
| `A3A5`–`A3B7` | `09 00 07 01 ec 02` / `09 00 01 01 ed 02` / `09 00 03 01 eb 02` / `09 00 36 01 ee 02` → `[02EC]=7, [02ED]=1, [02EB]=3, [02EE]=54` |
| **`A3BD`** | `20 00 33` = **`NEWECL #51`** |

The defeat handler at `A91F` restores position (`SAVE [0017]->[0034]`, `SAVE [0018]->[0035]`),
`PARLAY #10`, `CALL [0001]`, then `GOTO [85F9]` — back into `search_location`.

**Why `NEWECL #51` and not a "THE END" screen.** Block 51 is the wilderness/overland block. Its
`initial_entry` **routine** — header entry `0x8014`, which runs `SAVE #10->[004e]` /
`SAVE #0x26->[004f]` / `COMPARE #51,[0x0016]` / `IF_EQ` / `EXIT`, then a `GETTABLE` loop, then
the `[0x025C]` read at `0x8063` — reaches `0x809A`, which consumes exactly the quad block 38
wrote. (Anchor corrected 2026-08-06: `0x809A` is *downstream inside* that routine, **not**
block 51's `initial_entry` header pointer, which is `0x8014`.)

```
809a  21 …    LOAD_FILES [02ee], [02ee]      ; GEO block 54
80a1  09 …    SAVE [02ed] -> [0035]          ; y = 1
80a8  09 …    SAVE [02ec] -> [0034]          ; x = 7
80af  09 …    SAVE [02eb] -> [0011]          ; facing = 3
```

*Inference (labelled):* `[0034]`/`[0035]` are this title's party X/Y. Support: block 38's own
`vm_run_1` saves `[0034]/[0035]` into `[02EC]/[02ED]`; the defeat handler restores them from
`[0017]/[0018]`; the `[0034] == 2` fork at `0x9415` distinguishes the two lair cells, which differ
only in x; and 21 of the 30 blocks write the same `[02EB..02EE]` quad before their own `NEWECL`.
This is not a byte-level proof from `GAME.OVR`.

So the ending returns the party to the overland map with the terminal latch set — the standard
Gold Box "the campaign is over, your characters persist" ending, not a credits roll. Block 51 then
behaves differently forever after (§2a).

---

## §5 — The two combats, from the real VM

Driven through `dialogueForCell(ECL1#38, backdrop 0xF9, …)` with the corrected dialect. Rosters
are what the real `EclVm` emitted, not hand-derived.

**Combat 1 — the blackrobe ambush.** `SETUP_MONSTER` = `{spriteId 112, picId 255, extra 11}` when
entered from (3,6); `{… extra 15}` from (2,6). Roster (with `[0x0239] = 0`): `(28×3, 127×1,
112×1, 126×1)` **twice** from the `[0044]` loop, then `28×3`, then `127×5, 112×4, 126×4` —
**twelve groups**. (Corrected 2026-08-06: an earlier draft said the four-tuple appears "three
times over", which is sixteen groups and contradicted the golden's own assertion of twelve.
Decoding the loop at `0x9454..0x9493`: `[0044]` starts at 5; each pass emits `28×3`, then checks
`[0044]==1` and exits to `0x9497`, otherwise decrements, emits `127×1`/`112×1`/`126×1`,
decrements again and loops — so the third pass contributes only its `28×3` before the scaled
groups.)

**Combat 2 — Freezefire.** `SETUP_MONSTER {spriteId 255, picId 255}`; roster `28×5, 28×3, 88×1`.

`MON1CHA.DAX` records (real retail decode, `TREASURES_LAYOUT`):

| id | name | AC | THAC0 | HD | note |
|---|---|---|---|---|---|
| 28 | DWARF HERO | 10 | 12 | 9 | *inference:* an allied-NPC template — its `xp` field decodes to 499,999, a character-record shape, and the epilogue has dwarves present at the fight |
| 88 | **FREEZFIRE** | **−4** | **4** | 14 | archive's unique best AC and THAC0; `combatSize 2` |
| 112 | BLACKROBED SPY | 10 | 16 | 9 | |
| 126 | BLACKROBED MAGE | 10 | 16 | 11 | |
| 127 | BLKROBED MASTER | 10 | 10 | 12 | |

**Difficulty scaling.** `0x949D`: `DIVIDE [0239], #5 -> [00C8]`; `ADD #5,[00C8] -> [00C7]`;
`ADD #4,[00C8] -> [00C8]`; then `LOAD_MONSTER 127×[00C7], 112×[00C8], 126×[00C8]`. Verified live:

| `[0x0239]` | final group counts (127 / 112 / 126) |
|---|---|
| 0 | 5 / 4 / 4 |
| 25 | 10 / 9 / 9 |
| 60 | 17 / 16 / 16 |
| 99 | 24 / 23 / 23 |

`[0x0239]` is written only by blocks 35/36/37 (`ADD #5`, `ADD #1`, `ADD #2`, `SUBTRACT #1`) and
read only by blocks 36, 37 and 38 — *inference:* a mid-campaign progress/attrition counter that
sizes the final ambush.

---

## §6 — Four NPC-conditioned variants of the confrontation

`FIND_CHARACTER "GAUHOK" -> [00C0]`, `FIND_CHARACTER "KRIIADOR" -> [00C7]`, then
`COMPARE [00C0],#7; IF_GT GOTO [9801]` and `COMPARE [00C7],#7; IF_GT GOTO [98E6]`. Driven live
through the real VM. **Disclosure (added 2026-08-06):** three of the four rows are driven with a
`findCharacter` host bridge; the fourth (both present) is driven with **no** bridge, so `0x37`
writes nothing and `[00C0]`/`[00C7]` read as the memory default `0` (≤ 7), which takes the same
arm a real both-present answer would. The outcome is unchanged if a genuine both-present bridge
is supplied — any index ≤ 7 selects that arm — but the earlier wording presented a harness
property as a retail one.

| GAUHOK | KRIIADOR | branch | opening line |
|---|---|---|---|
| in party | in party | `96E7` | *"EACH SETTING HIS HAND TO THE HILT OF HIS WEAPON, GAUHOK AND KRIIADOR EYE EACH OTHER WARILY."* |
| absent | in party | `980C` | *"'WE ARE HERE! THE LEGENDARY HOARD OF FREEZEFIRE! MY LORD RAURYM SHALL BE PLEASED!…'"* |
| in party | absent | `98E6` | *"'MY ANCESTORS, I CAN FEEL THEM HERE! …I SHALL REMAIN WITH THE HOARD…'"* |
| absent | absent | `99A5` | (blank) → *"SUDDENLY, BEFORE YOUR VERY EYES,"* |

All four converge at `99C3`.

---

## §7 — Terminal memory writes (real VM, whole chain)

Driving the full chain and answering `victory` to all four `COMBAT` turns:

```
turn kinds : combat, combat, combat, combat, chain(51)
isDone     : true
[0x025C] = 1     campaign-terminal latch (one writer corpus-wide, three cross-block readers)
[0x0056] = 0     set 1 at A19D, cleared at A2F2 — a local "epilogue in progress" gate
[0x02EB] = 3     facing
[0x02EC] = 7     x
[0x02ED] = 1     y
[0x02EE] = 54    destination GEO/area for block 51
```

Turns 3 and 4 are the two empty-roster `COMBAT`s that follow `CLEARMONSTERS; TREASURE` — the
retail loot-award idiom (§1d). Their `monsters` arrays are empty and `setup` is undefined.

---

## §8 — Negative control: what the shipped dialect actually does

Same cell, same seeds, same driver, only the dialect changed:

| | shipped `ECL_GEN1_SHORT_TREASURES` | corrected |
|---|---|---|
| turn kinds | `combat, combat, end` | `combat, combat, combat, combat, chain` |
| chains to | — | **block 51** |
| narration characters | 3,899 | **4,469** |
| `[0x025C]` | 1 | 1 |
| `[0x0056]` | **1** (never cleared) | **0** |
| `[0x02EB..02EE]` | **unwritten** | 3 / 7 / 1 / 54 |
| last text reached | *"...AFTER THE PARTY IS REWARDED!"* | *"...IT HAS, INDEED, BEEN GLORIOUS!"* |

The shipped dialect gets far enough to look like a complete ending — it plays both fights, sets
the terminal latch, and prints **all six** beats up to *"...AFTER THE PARTY IS REWARDED!"*
(`0x9F41`, `0x9FB3`, `0xA021`, `0xA0A0`, `0xA10A`, `0xA180` — every beat §4 lists before the
first `TREASURE`; the desync is at `0xA1A4`, strictly after them) — and then silently stops. It
loses the last four narration beats (`A1B2`, `A226`, `A282`, `A31D`), both treasure awards, the
`[0x0056]` clear, the spawn quad, and the chain to block 51. This is exactly the failure mode a
wrong dialect produces: no exception, no bad-opcode report at the API level, just a truncated
story. It is the reason §1's correction is load-bearing rather than cosmetic.

---

## §9 — Extraction method, and the measured recall of the filtered alternative

Strings were extracted **structurally**: every operand with `code == 0x80` on every CFG-reachable
instruction, decoded with the shared 6-bit packing (`decodeEclString`). Under the corrected
framing that is **3,160** strings across the 30 blocks (2,771 under the shipped framing — i.e. the
shipped framing has 87.7 % recall of the reachable string set, and the strings it misses are not
random: four of them are the ending's last four beats).

A shape-filtered scan was *also* run, purely to measure how much it would have hidden. Filter:
length ≥ 8 and (letters + spaces) / length ≥ *t*.

| *t* | keeps corpus-wide | ending-chain strings dropped (of 34) |
|---|---|---|
| 0.75 | 2563 / 3160 = 81.1 % | 0 |
| 0.80 | 2545 / 3160 = 80.5 % | 0 |
| 0.85 | 2467 / 3160 = 78.1 % | **3** — incl. `A180` *"%E...AFTER THE PARTY IS REWARDED!"* |
| 0.90 | 2278 / 3160 = 72.1 % | **8** — incl. `93A3` *"%7YOUR %5ENEMIES %7HAVE BEATEN YOU TO THE TREASURE!…"* |
| 0.95 | 1520 / 3160 = 48.1 % | **19** |

Treasures' narration is dense with `%X` colour escapes, so a "looks like prose" filter starts
deleting the *climactic* lines first — they are the ones with the most colour changes. Nothing in
this document depends on a filtered scan; the filter numbers are reported only to quantify the
trap.

### 9a. A second recall asymmetry, found while writing test N

The §2d uniqueness search in `treasuresEndingRoute.test.ts` deliberately uses an even blunter
instrument than the structural extraction: it re-reads each block's bytes as packed 6-bit text from
**every byte offset**, with no instruction decode and no CFG at all. That scan has *higher* recall
than the CFG-reachable extraction, and the gap is real and measurable:

| needle | CFG-reachable extraction | raw byte scan |
|---|---|---|
| `FAREWELL` | blocks 23, 26, 27 | blocks 23, 26, 27, **31, 37** |
| `PIRATES ATTACK!` | block 31 | blocks **29**, 31 |

Blocks 31 and 37 carry `FAREWELL` in bytes the control-flow walk never reaches — dead or
conditionally-unreachable script. This matters for the honesty of §2d: the claim "`BEEN GLORIOUS`
and `'THE HEROES OF THE NORTH'` occur in exactly one block" is asserted against the **higher-recall**
instrument, so it is not an artifact of the CFG model hiding a rival ending somewhere unreachable.
Both controls are pinned in the test precisely so a future bug that made the search return `[38]`
for everything, or `[]` for everything, cannot masquerade as proof.

---

## §10 — What is NOT established

* **The `0x27` frame is not proven from Treasures' own executable.** The evidence is (a) the
  block-47 count ladder in raw bytes, (b) zero illegal operand codes and zero boundary overlaps
  corpus-wide, (c) a 99/99 structural invariant, and (d) a seven-title cross-check in which the
  metric behaves correctly on four controls. Pools of Darkness's analogous `0x37` correction was
  additionally pinned to a `GAME.OVR` handler offset; no equivalent handler-level pass was done
  here. Someone should run `tools/map_pool_ecl_dispatch.py`'s method against Treasures' `GAME.OVR`
  to close this properly.
* **Operand *semantics* of `0x27` are inferred**, not proven: "3 coin slots + item-id list" fits
  every site but was not confirmed against a handler or a save-file diff. The engine's existing
  `case 0x27` is written for the 8-operand CoAB frame and will read `operands[7]` as `undefined`
  under the 4-operand frame; the test therefore asserts the *decoded instruction*, not the VM's
  `treasure` effect payload.
* **`[0034]`/`[0035]` = party X/Y is an inference** (§4), well supported but not byte-proven from
  `GAME.OVR`.
* **`[0x0239]` is described as a progress counter by inference** from its writers and readers.
* **`DWARF HERO` (id 28) as an ally rather than an enemy is an inference** from its
  character-record-shaped `xp` field and the epilogue text. The ECL loads it with the same
  `LOAD_MONSTER` opcode as the blackrobes; nothing here settles side assignment.
* **The route into GEO1#38 itself is not proven here.** §3 proves a legal 6-step path from the
  map's own re-entry cell to the lair. How the party arrives on the Ice Peak in the first place
  (block 33's `"ICE PEAK"` menu entry and the dynamic `NEWECL [00C8]` chains in blocks 35/36/37)
  belongs to the `middle` leg and was not run end-to-end.
* **No live retail run.** This leg is entirely static bytes + the project's own VM, per the
  no-DOSBox-X rule. The pictures (`#241..#245`, `#167`) were not rendered or verified.
* **`[0x0106]`/`[0x0107]`**, which choose the final picture at `0xA2F9`, were not identified.

---

## §11 — Verification

`packages/engine/test/treasuresEndingRoute.test.ts` — a golden against the real retail bytes,
`describe.skipIf(!haveRetail)` only (never skipped when the GOG install is present):

* **A** — `GEO1.DAX#38` ground truth: exactly two `desc & 0x7F == 121` cells, both raw `0xF9`, at
  (2,6) and (3,6).
* **B** — the `search_location` dispatch bytes at `0x866D`/`0x8676` (SUBTRACT #121 and the 7-way
  `ON_GOTO` whose index 0 is `0x9227`).
* **C** — the block-47 count ladder: eight `0x27` instructions whose 4th operand is 1…8 and which
  are followed by exactly that many operands, asserted from raw bytes.
* **D** — dialect discrimination at `0xA1A4`: shipped frame → size 18, lands on `0xA1B6` which is
  not an opcode; corrected frame → size 10, lands on `COMBAT`.
* **E** — the real VM drives the whole chain to `chain → 51` with the exact terminal writes.
* **F** — the required negative control: the shipped dialect ends at
  *"...AFTER THE PARTY IS REWARDED!"* with `[0x02EE]` unwritten.
* **G** — both combats' rosters and `SETUP_MONSTER`, and the (2,6)-vs-(3,6) placement fork.
* **H** — `[0x0239]` difficulty scaling at three values.
* **I** — the four NPC-conditioned branches.
* **J** — `FREEZFIRE` is the unique AC/THAC0 extreme of `MON1CHA.DAX`.
* **K** — `[0x025C]` has exactly one writer and three reader blocks, asserted by a raw byte scan
  that uses no control-flow model.
* **L** — the game's last line and the `NEWECL #51` spawn quad.
* **M** — §2a-bis: the latch-shape census (the one-writer/multi-reader shape is *not* unique), the
  `ICE PEAK` menu removal that does discriminate, and the `[0208]` rival's self-guard.
* **N** — §2d: `GLORIOUS` and `HEROES OF THE NORTH` each occur exactly once corpus-wide, both in
  block 38, and the block-17 counter-candidate chains onward via `NEWECL #16` — established by a
  decoded CFG walk over all five header entries (corrected 2026-08-06; the earlier raw
  `20 00 ??` byte scan also yields 24 and 27 in that block and proved nothing).
* **O** — NEGATIVE CONTROL, added 2026-08-06: driving the VM at `(7,8)`'s descriptor `0x8C` (a
  non-`0xF9` cell of `GEO1#38`, read from the GEO plane) never reaches `0x9227`'s "ENTERING THE
  CHAMBER" text, never reaches "BEEN GLORIOUS", and never writes `[0x025C]`. Tests **A**/**B**
  established the descriptor arithmetic statically only; nothing previously ran the VM at a
  non-trigger cell to show the ending stays shut.

---

## §12 — Independent re-verification (2026-08-06)

Every load-bearing number above was re-derived a second time by a **separately written CFG walker**
(not `gen1_ecl_encounter_scan.scan_block`, and without its compare-outcome pruning), reading the
same retail bytes. Exact agreement on the decisive metrics:

| claim | doc | independent walker |
|---|---|---|
| illegal operand codes, shipped frame | 105 (22 blocks) | **105 (22 blocks)** |
| illegal operand codes, corrected frame | 0 | **0** |
| block-47 ladder, 8 rungs, raw bytes | match | **match, and contiguous rung-to-rung** |
| block 17's CFG-reachable `NEWECL` targets | `#16` only | **`#16` only (a raw `20 00 ??` scan also yields 24 and 27 — decode, don't scan)** |
| `0x27` sites followed by `COMBAT`/`RETURN` | 99/99 (90+9) | **99/99 (90+9)** |
| `[025C]` raw operand sites, all 30 blocks | 4 (1 write, 3 reads) | **4, same vaddrs** |
| `GEO1#38` cells masking to 121 | (2,6),(3,6) both `0xF9` | **identical; only `0xF9` masks to 121** |
| GEO path (7,8)→(3,6) | 6 steps, 0 blocked | **6 steps, 0 blocked, final facing west** |
| longest cinematic | blk38, 1217 ch | **blk38 holds BOTH of the corpus's two longest branch-free cinematics: 1,217 chars at `0x99A5` and 1,155 chars at `0x9F38`. The longest stretch in any other block is block 30's 949 chars at `0x90CF..0x93CE` (the Mirabar council scene, which ends by starting a fight); block 29's best is 708.** (Corrected 2026-08-06 — an earlier draft of this row said "1,218 ch; runner-up blk29 at 710", contradicting §2b and inflating block 38's lead over its best rival block from the real 1217:949 = 1.28× to 1218:710 = 1.7×.) |
| cross-title control | inverts only for Treasures | **inverts only for Treasures** |

Counts that differ slightly and why: reachable-instruction totals (17,995 / 19,922 vs the doc's
17,937 / 19,658) and string totals (2,766 / 3,164 vs 2,771 / 3,160) diverge by well under 2 %
because the independent walker does not prune branches by compare outcome, so it explores a
strictly larger state space. It is the **more permissive** walker and still finds **zero** illegal
operand codes under the corrected frame — which strengthens rather than weakens §1b.

The engine test was executed against the live GOG install: **15/15 passing**, no skips. (Count
corrected 2026-08-06: this line still said 12/12 after cases **M** and **N** were added — §11
already listed 14 — and the 2026-08-06 review added case **O**, the missing
gate-does-not-fire negative control, bringing the file to 15.)

**One walker total, quoted consistently (added 2026-08-06).** Three independently written
walkers were run over the same bytes. Their *string totals* differ by ~2–3 % — primary **3,160**,
second **3,164**, third **3,237** under the corrected frame — because they prune branches
differently, and earlier drafts mixed the primary's 3,160 (§1b, §9) with the second's 3,164
(§2d) as if they were one number. The **decisive** counts are identical across all three: 105
illegal operand codes across 22 blocks under the shipped frame, **0** under the corrected frame.
Where this document quotes a string total it means the primary walker's **3,160**.
