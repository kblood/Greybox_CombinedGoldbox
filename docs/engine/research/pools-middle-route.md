# Pools of Darkness — MIDDLE leg: `ECL1.DAX#34` / `GEO1.DAX#34`, the dragon realm beyond the hub gate

> **Status (2026-08-06): PROVEN.**
> The party spawns at `(1,13,south)` from block 34's *own* `initial_entry` byte literals, walks
> **19 legal directed steps** over the real `GEO1.DAX#34` wall/door graph, and reaches the
> `UMBER HULK ×5` encounter at `(1,12)` by movement alone — no entry injection. **13 of the 19
> route cells are proven articulation points** for that encounter, and one of them, `(7,14)`, is the
> *single* cut vertex separating the 15-cell spawn pocket from the other 235 cells of the level: on
> **any** route to **anything** outside the pocket the party must step on it.
>
> Engine golden: `packages/engine/test/poolsMiddleRoute.test.ts` (13 cases).
> Everything below is either a byte read out of a retail file or an observation produced by running
> this repo's real `EclVm` / `DialogueRunner`. Nothing is hand-traced.

### Provenance note — read this first

An earlier draft of this document existed in the working tree, untracked, asserting the same verdict
and naming `poolsMiddleRoute.test.ts` as its "engine golden". **That test asserted nothing.** It was
a `describe('scratch')` probe file whose three cases all ended in `expect(true).toBe(true)`; it
printed exploration output and checked none of it. The "engine golden" claim was false when written.

This document was therefore **re-derived from the retail bytes, not inherited**. Every structural
claim repeated from the prior draft was independently re-measured this session (§1, §2, §3, §4, §5,
§6, §7). Two of the prior draft's sections were **not** re-verified and have been dropped rather
than carried forward: its §1.4 ("the gate is behind a first-visit briefing whose text names the
prior chapter") and its §10 `TREASURE`-frame byproduct. Their absence is not a refutation — it means
nobody has checked them. The prior draft also named the area "THORNE"; this pass found no byte
evidence for that name and does not use it.

---

## §0 — Retail bytes

Resolved programmatically through `goldbox_corpus.choose_install` / `file_index`, not hardcoded.
Install: `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness`.

| file | bytes | sha256 |
|---|---|---|
| `ECL1.DAX` | 329,456 (56 blocks) | `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af` |
| `GEO1.DAX` | 28,349 (32 blocks) | `d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f` |
| `MON1CHA.DAX` | 13,428 (122 records) | `dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef` |

Decompressed blocks this leg reads:

| block | bytes | sha256 |
|---|---|---|
| `ECL1#34` | 7,644 | `8b77dc7d77f4717ffd408cbc497226c83420db49d1d0cfd7b061cdc91ff6b795` |
| `ECL1#18` | 6,141 | `0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357` |
| `GEO1#34` | 1,026 | `0cb389ea820ea38fd8db42ac6cea1515e504711b00cb92b1c8cb4e8e7ae1e2a7` |

`ECL1.DAX`'s 56 block ids are realm-grouped, not contiguous:
`1-4, 16-27, 32-42, 48-55, 64-77, 80-86`. Block 34 = `0x22`. `GEO1.DAX` has 32 blocks; block 34 is
present and is what `ECL1#34` loads.

**Dialect: `ECL_GEN1_SHORT_POOLS`** — Pools' own split, obtained from
`gen1_ecl_encounter_scan.word_sets_for_profile('pools-of-darkness')` and measured this session as
`{12:4, 29:0, 31:1, 33:2, 34:0, 35:0, 44:1, 55:2}` (decimal opcode → word count). Gen1 addressing:
vbase `0x7FFE`, file offset = vaddr − `0x8000` + 2. Gen1 `SAVE` operand order is
**(source, destination) — destination LAST**. `ON_GOTO` is 0-based and falls through when the index
is out of range — §3 demonstrates that fall-through on this very block rather than assuming it.

Prior work this leg builds on and does **not** re-derive: the `early` leg
(`docs/engine/research/pools-ecl69-72-natural-route-2026-07-29.md`, golden
`packages/engine/test/poolsNaturalRoute.test.ts`) — `GEO1#69` descriptor `0x97` → `ECL1#72`'s
four-group Drow combat. This leg uses a different ECL block, a different GEO block, a different
monster family and a different flag word. It shares only the archive and the dialect.

---

## §1 — Why block 34 is mid-campaign

1.1–1.4 are measurements. The narrative word "middle" is dealt with honestly in §1.5.

### 1.1 — `NEWECL #34` does not exist anywhere in the game

An **alignment-checked recursive-descent** census over all 56 decompressed `ECL1.DAX` blocks,
decoding each under `ECL_GEN1_SHORT_POOLS` and collecting every `NEWECL` (opcode `0x20`), finds
**154 aligned `NEWECL` sites**. Their immediate operands cover 54 distinct block ids, and **34 is not
one of them.** Zero hits.

> **Correction (2026-08-06).** A first draft of this section quoted **171** sites over **47** distinct
> immediate targets, from a census that decoded at *unaligned* offsets and therefore reported inline
> string payload as instructions (see the retraction in §1.2). Those totals are withdrawn. The
> 154 / 54 figures above come from an alignment-checked recursive-descent census re-derived from the
> retail bytes on 2026-08-06. The headline — **zero** `NEWECL #34` — is unaffected and was
> independently reproduced by the byte superset sweep below.

For contrast the same census finds `NEWECL #18` at **10 sites across 9 distinct blocks** (17
@`0x8AC1`, 33 @`0x96A5`, 34 @`0x9B43`, 38 @`0x81BA`, 52 @`0x8860`, 64 @`0x8672`, 69 @`0x9C35`, 75
@`0x8597`, 83 @`0x97EA` and `0x983A`), and `NEWECL #72` — the *early* leg's block — at one site.

Doing this by decode rather than by scanning for the three bytes `20 00 22` matters: the byte
pattern would also match operand bytes and string payloads, and would miss nothing only by luck.

The golden re-checks the same claim with a deliberately *different* method — a superset sweep of
every byte offset, which counts misaligned coincidences too. It also finds **zero**, which is the
strongest available form of the claim. **Watch the operand width when repeating this:** Gen1 encodes
an immediate operand (code `0x00`) as a **single** byte and a register operand (code `0x01`) as a
2-byte little-endian address. Reading a 16-bit word in both cases is the obvious mistake, it reports
near-zero immediates for *everything*, and it produced a false pass in the first draft of this
golden before the `NEWECL #18` control assertion caught it.

### 1.2 — The only campaign way in is a computed `NEWECL` in block 18

An alignment-checked recursive-descent census over all 56 blocks finds 3 dynamic (register-operand)
`NEWECL` sites corpus-wide: block 1 @`0x829A` `NEWECL [0x00C0]` (the JUMPER), and two in block 18 —
`0x8746 NEWECL [0x009A]` and `0x8851 NEWECL [0x009B]`. A prior draft also listed `0x8E87`
"`NEWECL [0x0022]`"; that is retracted — those bytes are payload inside the inline string of
`0x8E70 PRINT str[43]`, and operand code `0x09` is not a valid `EclOpp` code.

```
block  1  0x829A  NEWECL [0x00C0]   <- ECL1#1's developer JUMPER (see §1.3)
block 18  0x8746  NEWECL [0x009A]
block 18  0x8851  NEWECL [0x009B]
```

> **Correction (2026-08-06).** The first draft of this section claimed "18 dynamic sites corpus-wide"
> and listed `0x8E87 NEWECL [0x0022]` as the third block-18 site. Both are withdrawn. The bytes
> `20 09 22 4e` at `0x8E87` lie inside the inline 6-bit packed payload of `0x8E70 PRINT str[43]`
> (`11 80 2b` + 43 payload bytes, spanning `0x8E70..0x8E9D`), and operand code `0x09` is not a valid
> `EclOpp` code at all — this repo's own `classify()` calls it `flag`, and
> `docs/engine/research/treasures-middle-route.md` records `0x09`/`0x34` as *not* valid `EclOpp`
> codes. The draft's census was therefore **not** alignment-checked: it decoded at unaligned offsets
> and reported string payload as instructions, which is exactly the failure mode §1.1 congratulates
> itself for avoiding. Note that had `0x8E87` been real it would have *refuted* the sole-entry claim
> rather than supported it (under `gen1_ecl_encounter_scan.read_operand` code `0x09` is a one-byte
> operand of value `0x22`; under this repo's `EclVm.rvalue()` default branch it resolves as the
> literal 34).

### 1.3 — `[0x009B]` receives 34 from exactly one table row, in a four-realm hub

`ECL1#18` @ `0x926D`:

```
0x926D  SUBTRACT  #1 [0x0099] -> [0x00BF]
0x9276  ON_GOTO   [0x00BF] #4  [0x9288] [0x92C8] [0x9312] [0x935C]
```

A 1-based realm selector in `[0x0099]`, decremented into a 0-based `ON_GOTO`. The four rows:

| sel | row @ | `[0x009A]` | `[0x009B]` | `[0x00A1]` bit |
|---|---|---|---|---|
| 1 | `0x9288` | 33 | **34** | 1 |
| 2 | `0x92C8` | 69 | 83 | 2 |
| 3 | `0x9312` | 17 | 52 | 4 |
| 4 | `0x935C` | 38 | 64 | 8 |

Row 1's `SAVE #34 -> [0x009B]` at `0x92A3` is the only instruction in the corpus that stores the
LITERAL 34 into `[0x009B]`. `[0x009B]` is otherwise a reused scratch word (~70 writes across ~28
blocks, including `AND #63,[0x002D]->[0x009B]` in blocks 65/73/74, `GETTABLE` destinations in
17/25/51/64/80, `RANDOM` in 53 and `INPUT_NUMBER` in 2/3), so the sole-entry argument rests on
`0x8851` being reached only after block 18's own `0x926D` realm table has run, not on corpus-wide
uniqueness of the value. Confirmed dynamically by running the real `EclVm` on `ECL1#18` from entry
`0x926D` with `[0x0099]` seeded 1..4 — the four rows reproduce the table above exactly.

> **Correction (2026-08-06).** The first draft wrote that `0x92A3` is "the **only** instruction in
> the whole 56-block corpus that puts 34 into `[0x009B]`". That is false as stated, and the
> distinction matters: `[0x009B]` is a heavily-reused scratch word — ~70 aligned writes across ~28 of
> the 56 blocks — and three of those writes are `AND #63,[0x002D] -> [0x009B]` (block 65 @`0x8822`,
> block 73 @`0x86F3`, block 74 @`0x8709`), i.e. a *masked cell descriptor*, which **is** 34 whenever
> the descriptor's low six bits are 34. This is concrete, not theoretical: `GEO1#65` does contain a
> cell masking to 34, so walking it writes 34 into `[0x009B]`. Other writers include seven
> `GETTABLE ... -> [0x009B]` in block 17 alone plus more in 25/51/64/80, `RANDOM [0x00A0] -> [0x009B]`
> (block 53 @`0x81E2`), `INPUT_NUMBER #3 -> [0x009B]` (block 2 @`0x81F0`, block 3 @`0x81FF`) and
> `ADD [0x0216],[0x009B] -> [0x009B]` (block 83 @`0x9AB0`, @`0x9C47`). §1.5 makes exactly this
> "reused scratch word" argument for `[0x0099]` and the draft failed to apply it to `[0x009B]`.

**Sole entry, CORRECTED.** Block 34 has no static (immediate-operand) `NEWECL` entry anywhere in the
corpus, and its only campaign-script entry is `0x8851 NEWECL [0x009B]` after block 18's realm table
has taken row 1. The one other way to reach it is `ECL1#1`'s shipped developer JUMPER
(`0x81C6` `"WHAT ECL DO YOU WISH TO GO TO? (IN DECIMAL)"` -> `0x81EA INPUT_NUMBER #2` -> `[0x00C0]`
-> `0x829A NEWECL [0x00C0]`), which can reach any block id and is not a campaign path; the campaign
opening is block 1's `"START"` arm at `0x807D NEWECL #16`.

> **Correction (2026-08-06).** The first draft's bolded conclusion read "**the sole entry into block
> 34 is `0x8851 NEWECL [0x009B]`, after block 18 has taken realm row 1**", stated corpus-wide. That
> is false as stated. `ECL1#1` — the shipped developer JUMPER block — contains an
> arbitrary-destination `NEWECL`. Aligned disassembly of block 1: `0x8039 PRINTCLEAR "DO YOU WANT TO
> START FROM SCRATCH OR USE THE JUMPER?"`; `0x80E6 HORIZONTAL_MENU 'JUMP'|'ARENA'|'CAMP'|'TREAS'|
> 'DEMO'|'PRV'|'NXT'`; `0x8111 ON_GOTO [0x00BF] #7` arm 0 -> `0x81C6`; `0x81C6 PRINTCLEAR "WHAT ECL
> DO YOU WISH TO GO TO? (IN DECIMAL)"`; `0x81EA INPUT_NUMBER #2 -> [0x00C0]`;
> `0x8269`/`0x827B`/`0x828A INPUT_NUMBER -> [0x0034]`/`[0x0035]`/`[0x0011]` under `'X POSITION:'` /
> `'Y POSITION:'` / `'FACING:'`; `0x829A NEWECL [0x00C0]`. `[0x00C0]`'s **only** writer in block 1 is
> that `INPUT_NUMBER`. That reaches ANY block id, including 34, with no hub involvement. The draft
> reported dynamic `NEWECL` sites corpus-wide and then drew a corpus-wide sole-entry conclusion after
> analysing only the ones inside block 18 — a gap it created for itself.

**Additional placement evidence (measured 2026-08-06).** Block 18's return router at `0x82D4..` keys
on `[0x00E7]`, the block the party arrived **FROM**, with cases 33, 34, 69, 83, 75, 52, 17, 38 and a
default. Realm 1 delivers `[0x009A] = 33` through `0x8746` and `[0x009B] = 34` through `0x8851`, so
**within realm 1 block 34 is the SECOND area and 33 the first.**

Block 18 also carries a realm-completion accumulator, `[0x00EC]`, written **exactly once
corpus-wide** (`0x8840  OR [0x00A1] [0x00EC] -> [0x00EC]`) and read twice, both inside block 18
(`0x8835`, `0x9674`). At `0x9674` the `AND [0x00A1] [0x00EC]` selects a short revisit message over a
long first-visit one.

### 1.4 — Block 34 is a traversal, not a terminus

`ECL1#34` contains exactly **one** outgoing `NEWECL` — `0x9B43 NEWECL #18`, back to the hub — plus
its own `0x8034 LOAD_FILES #34 #2`. It has 13 `COMBAT` sites and loads monster ids
`{11, 26, 27, 28, 29, 69, 76}`. The block is a self-contained realm level: entered only from the
hub, exiting only to the hub, chaining to no ending block.

### 1.5 — Honest limitation on the word "middle"

What is **proven** is narrower than the word:

* **Not the opening** — proven. No static entry (1.1); at least two script hops behind a hub
  (1.2/1.3); the block's own boot guard (§2) assumes arrival by `NEWECL`; and the campaign opening is
  demonstrably block 1's `"START"` arm at `0x807D NEWECL #16`, not block 34.
* **Not a terminus** — proven. Its only exit returns to the hub (1.4).
* **Second within realm 1** — proven. Block 18's `[0x00E7]` return router and the realm-1 row give
  `[0x009A] = 33` first, `[0x009B] = 34` second (§1.3).

What is **INFERENCE**: that realm 1 of 4 is played second, third or fourth rather than first, and any
chapter mapping. This document does **not** claim an ordering between block 34 and the `early` leg's
block 72. Block 72 *has* a static `NEWECL #72` entry and block 34 has none, which is suggestive of
34 being deeper — that is a contrast, not a proof.

**A caveat that actively weakens any stronger reading, recorded rather than buried:** `[0x0099]` is
a *reused scratch word*, not a dedicated realm register. Corpus-wide it is written by 14 different
blocks, and blocks 65, 73 and 74 use it as an unrelated **bitmask** (`OR #1`/`#2`/`#4`/`#8`/`#16`/
`#32`/`#64`/`#128`). Its "realm index 1..4" meaning holds **only** inside block 18's own `0x926D`
subroutine, and block 18 sets it itself (`0x82DF`/`0x8306`→1, `0x8338`/`0x835F`→2,
`0x8391`/`0x83B8`/`0x83EA`→3, `0x8403`/`0x841F`→4). The realm choice is made *inside the hub*, and
this leg does not establish what gates that choice.

---

## §2 — The spawn is byte-grounded in block 34's own `initial_entry`

`parseEclHeader(ECL1#34, ECL_GEN1_SHORT_POOLS)` → magic `0x1388` (5000), `vm_run_1` `0x8171`,
`search_location` `0x819F`, `pre_camp_check` `0x8134`, `camp_interrupted` `0x8170`, `initial_entry`
`0x8014`. `0x8014 − 0x7FFE = 22` = the instruction immediately after the 22-byte header: real code,
not a trampoline into somewhere else.

```
0x8014  COMPARE       [0x0016] #34            ; 030116000022   <- already-here guard
0x801A  IF_EQ
0x801B  EXIT
0x801C  SAVE          #34   -> [0x0016]       ; 090022011600
0x8022  SAVE          #100  -> [0x001B]
0x8028  SAVE          #0    -> [0x001A]
0x802E  SAVE          #0    -> [0x00A0]
0x8034  LOAD_FILES    #34 #2                  ; 2100220002     <- GEO1.DAX#34
0x8039  SAVE          #1    -> [0x0034]       ; 090001013400   <- X = 1
0x803F  SAVE          #13   -> [0x0035]       ; 09000d013500   <- Y = 13
0x8045  SAVE          #2    -> [0x0011]       ; 090002011100   <- facing = 2 (south)
0x804B  CALL          [0x0001]
0x804F  AND           #1 [0x0150] -> [0x00BF]
0x8058  IF_NE
0x8059  EXIT
0x805A  SETUP_MONSTER #255 #2 #26 #0
0x8063  PRINTCLEAR    "THRUST THROUGH THE DIMENSIONAL DOOR, YOU FIND YOURSELF IN THE MIDST OF DRAGONS."
0x80A2  SAVE          #14   -> [0x0039]
0x80A8  PRINT         "'PREPARE TO FLY! WE ATTACK ON THE THIRD BLAST OF THE HORN!'"
0x80D8  PARTYSTRENGTH
0x80DF  OR            #1 [0x0150] -> [0x0150] <- arrival marker
0x80E8  LOAD_MONSTER  #26 #2 #26              <- RED DRAGON x2
0x80EF  COMBAT
```

The `0x8014` guard is why the block cannot re-initialise on top of itself: arriving with
`[0x0016] == 34` exits before the spawn writes. On a cold boot `[0x0016]` is unset, the compare
fails, and control falls into the spawn — the arrival narration is a *dimensional door*, consistent
with entry by the hub's computed `NEWECL`.

Running the real `EclVm` from entry 22 on empty memory reproduces exactly this: status `combat`,
effects `loadFiles(geoBlockId 34) → call → encounterSetup → print → print → partyStrength →
combat[RED DRAGON ×2]`, memory
`{0x16:34, 0x1B:100, 0x1A:0, 0xA0:0, 0x34:1, 0x35:13, 0x11:2, 0xBF:0, 0x39:0, 0x150:1}`.
`vm.resume(0, {combatOutcome:'victory'})` then runs the block out to `exited`.

### 2b — Pools' register map differs from the CoK/Gateway family

Stated loudly because the standing project note lists the CoAB/Gateway host registers, and they are
**not** what this title uses:

| meaning | CoK / DoK / Gateway | **Pools of Darkness** |
|---|---|---|
| party X | `[0xC04B]` | **`[0x0034]`** |
| party Y | `[0xC04C]` | **`[0x0035]`** |
| facing | `[0xC04D]` | **`[0x0011]`** |
| cell descriptor | `[0xC04F]` | **`[0x002D]`** |
| current area id | `[0x4BF2]` | **`[0x0016]`** |

The descriptor and area-id rows are already encoded in `ECL_GEN1_SHORT_POOLS` (`cellDescAddr:
0x002d`, `lastBlockIdAddr: 0x0016`); the X / Y / facing rows are confirmed here by block 34's own
spawn literals and by the facing gate in §8. Pools follows the Treasures/DQK low-address convention.
Nothing on this route reads `0x4BE6` (`inDungeon`) or `0x7F12`.

---

## §3 — The dispatch

`search_location` @ `0x819F`:

```
0x819F  SAVE     #0   -> [0x0097]
0x81A5  SAVE     #0   -> [0x0039]
0x81AB  SAVE     #100 -> [0x001B]
0x81B1  ADD      #1 [0x009E] -> [0x009E]     <- per-step counter (see §7b)
0x81BA  AND      #63 [0x002D] -> [0x00BF]    <- THE MASK: &0x3F, on [0x002D]
0x81C3  AND      #255 [0x0152] -> [0x00C7]
0x81CC  IF_NE
0x81CD  GOTO     0x8256
0x81D1  ON_GOTO  [0x00BF] #42  <42 targets>
```

42 arms, 0-based. The arms this leg touches:

| masked | arm @ | cell(s) | role |
|---|---|---|---|
| 0 | `0x8265` | 201 cells (`0x80`) | open floor + wandering-encounter tail |
| 1 | `0x833B` | (4,13) `0x81` | facing-gated `TREASURE` narration |
| 8 | `0x83DC` | (4,15) `0x88` | one-shot narration, gated on `[0x0150]` bit 2 |
| 12 | `0x89F7` | (6,4) `0x8C` | **unique setter of `[0x0150]` bit 4** (§7) |
| 13 | `0x9731` | (7,14) `0x8D` | the dragon bottleneck |
| 41 | `0x9C46` | (1,12) `0xA9` | **the UMBER HULK target** |

**`ON_GOTO` fall-through, demonstrated on this block rather than assumed:** descriptor `0xAA` and
the bare value `42` both mask to 42, out of the 42-entry range (indices 0..41), and both run
silently to `{kind:'end', text:''}`. Descriptor `0x29` masks to 41 and fires the *same* UMBER HULK
arm as `0xA9` — proving the arm is selected by the **masked** value, not by the raw byte.

**Mask honesty:** `&0x3F` vs `&0x7F` is **not** discriminating on this map. Every descriptor present
lies in `0x80..0xA9` and none has bit 6 (`0x40`) set, so the two masks agree on all 256 cells. The
`&0x3F` above is quoted because it is what the script's own `0x81BA` byte says — **not** because a
counterfactual distinguished it. (The opposite of the Gateway shipwreck map, where the mask choice
was load-bearing; the golden therefore does *not* include a mask counterfactual for this leg,
because it would prove nothing.)

### The target arm, `0x9C46` (descriptor `0xA9` at `(1,12)`)

```
0x9C46  AND           #2 [0x0154] -> [0x00BF]   <- consumed gate, bit 1
0x9C4F  IF_NE
0x9C50  EXIT
0x9C51  SETUP_MONSTER #76 #0 #255 #8
0x9C5A  PRINTCLEAR    "UMBER HULKS CRASH THROUGH THE WALLS!"
0x9C78  PARTYSTRENGTH
0x9C79  LOAD_MONSTER  #76 #5 #76                <- UMBER HULK x5
0x9C80  COMBAT
0x9C81  OR            #2 [0x0154] -> [0x0154]   <- consumed, AFTER combat
```

Monster names resolved against the real `MON1CHA.DAX` (122 records): **76 = `UMBER HULK`**;
26/27/28/29 = `RED` / `WHITE` / `GREEN` / `BLUE DRAGON`; 90 = `ROGUE`.

---

## §4 — The route: 19 legal directed steps

Graph decoded exactly as `tools/find_geo_path.decode_edges` does it: wall planes `raw[2:258]` and
`raw[258:514]`, descriptors `raw[514:770]`, door flags `raw[770:1026]`. An edge is passable when the
wall slot is 0 **or** a door flag is set.

The route is the **BFS shortest path** from the byte-grounded spawn `(1,13)` to `(1,12)` — 19 steps,
with the facing carried into each cell:

```
(1,14)S (1,15)S (2,15)E (3,15)E (4,15)E (4,14)N (5,14)E (6,14)E (7,14)E (7,13)N
(7,12)N (6,12)W (5,12)W (5,13)S (4,13)W (4,12)N (3,12)W (2,12)W (1,12)W
```

Every step is a legal directed edge. **Four of the nineteen cross a door, and all four are flag 1 =
automatic** — the party walks through without a bash, pick or knock check (no flag 2 or 3 anywhere
on the route):

| step | edge | wall slot | door flag |
|---|---|---|---|
| 3 | `(1,15) → east` | 9 | 1 |
| 10 | `(7,14) → north` | 10 | 1 |
| 15 | `(5,13) → west` | 9 | 1 |
| 19 | `(2,12) → west` | 9 | 1 |

Note that the bottleneck cell `(7,14)` is itself a doorway — the party leaves the spawn pocket
through an automatic door.

> **Correction (2026-08-06).** A first draft of this section — and of the golden's test D — claimed
> "no step crosses a door at all". That was wrong: the assertion `doorCrossings === 0` failed against
> the retail GEO bytes, which is how the error was found. The four automatic doors above are the
> measured result. The route's *legality* is unaffected (flag 1 needs no check), but the stronger
> "no doors" phrasing was false and is retracted.

The route is deliberately not monotone: south to `y=15`, east along the bottom, north through the
`(7,14)` bottleneck to `y=12`, then **west** all the way back across the map. That shape is forced
by the walls — and it is precisely why 13 of the 19 cells are articulation points.

---

## §5 — The articulation-point argument

BFS over the real wall/door graph:

* Reachable from the spawn `(1,13)`: **250** of 256 cells. The 6 unreachable cells are exactly the 6
  whose descriptor byte is `0x00`.
* Remove `(7,14)`: reachable collapses to **15**, and `(1,12)` is no longer among them.

So `(7,14)` is a genuine cut vertex, splitting the 15-cell spawn pocket

```
(0,13) (0,14) (0,15) (1,13) (1,14) (1,15) (2,15) (3,15)
(4,14) (4,15) (5,14) (5,15) (6,14) (6,15) (7,15)
```

from the other 235 cells (234 far-side cells plus `(7,14)` itself). **On any route to anything
outside that pocket, the party must step on `(7,14)`.**

Exhaustive single-cell removal — testing all 250 reachable cells one at a time — gives exactly
**13** articulation points for spawn → `(1,12)`, and every one lies on the 19-step route:

```
(1,14) (1,15) (2,15) (3,15) (4,15) (7,14) (7,13) (7,12) (6,12) (5,12) (5,13) (4,13) (2,12)
```

This is the strong form: not "here is one path that works", but "no path avoids these 13 cells".

---

## §6 — The walk through the real VM

Boot from entry 22 on empty memory → resume the arrival combat with `victory` → then walk the 19
steps through `dialogueForCell` on the **shared** memory map, with nothing seeded on top of what the
retail boot left behind except the party pose (disclosed in §8):

| step | result |
|---|---|
| (4,15) `0x88` | `end` + `"DRAGONS HERD CAPTIVES AROUND THE CORNER. …"` |
| (7,14) `0x8D` | **silent** — prerequisite unmet (§7) |
| (4,13) `0x81` | `end` + `"DUMPED IN THE CORNER IS THE ROTTING CORPSE OF A KI-RIN. …"` |
| (1,12) `0xA9` | **`combat`**, `"UMBER HULKS CRASH THROUGH THE WALLS!"`, `[{monsterId:76, count:5, picBlockId:76}]` |
| the other 15 | `{kind:'end', text:''}` |

`SETUP_MONSTER` surfaces as `{spriteId:76, maxDistance:0, picId:255, distance:0, extra:8}`.
`[0x0154]` is **undefined** at the combat pause and becomes **2** only after `afterCombat` — matching
`0x9C81`'s position after `COMBAT`, not before it.

**The walk is seed-independent.** Re-running the whole boot-plus-19-steps at seeds
`0x1234, 1, 2, 3, 7, 11, 99, 2003` gives a bit-identical result every time: the same
`....T.........T...C` outcome pattern, the same terminal `[0x009E] = 19`, `[0x0154] = 2`, and
`[0x00BF] = 0`. §7b explains why this is structural rather than lucky.

**Consumed / fresh / defeat controls:**

* Fresh memory → fires, UMBER HULK ×5.
* `[0x0154] = 2` pre-seeded → `{kind:'end', text:''}` (the `0x9C46` gate).
* `afterCombat('defeat')` **also** sets `[0x0154] = 2`: the `OR` at `0x9C81` is unconditional on
  outcome, so losing does not leave the encounter re-armed. (Contrast the `(7,14)` arm, whose
  `0x981B IF_NE ; GOTO` *does* branch away before its consume.)

---

## §7 — The ordering theorem: the bottleneck can only arm itself from beyond itself

Arm 13, the descriptor-`0x8D` dragon hall at the bottleneck cell `(7,14)`:

```
0x9731  AND #1   [0x0154] -> [0x00BF] ; IF_NE ; EXIT   <- already fought
0x973C  AND #16  [0x0150] -> [0x00BF] ; IF_EQ ; EXIT   <- PREREQUISITE: bit 4 must be SET
0x9747  AND #255 [0x0152] -> [0x00BF] ; IF_NE ; EXIT   <- global suppressor
0x9752  SETUP_MONSTER #255 #0 #26 #0
0x975B  PRINTCLEAR "DRAGONS STAND WING TO WING IN THE HALL AS THEY AWAIT THE THIRD BLAST FROM THE
                    HORN OF DOOM. YOU COUNT AT LEAST SIX, BUT CANNOT SEE BEYOND THEM.
                    DO YOU TRY TO LEAVE QUIETLY?"
0x97DF  PARTY_SURPRISE
0x97E0  IF_EQ ; GOTO 0x832C                            <- YES -> slip past, silent
0x97E5  PRINTCLEAR "THE DRAGONS NOTICE YOU!"
0x97FA  GOSUB 0x9C8B                                   <- "THEY ATTACK!"
0x97FE  LOAD_MONSTER #26 #6 #26    ; RED DRAGON   x6
0x9805  LOAD_MONSTER #27 #3 #27    ; WHITE DRAGON x3
0x980C  LOAD_MONSTER #28 #3 #28    ; GREEN DRAGON x3
0x9813  LOAD_MONSTER #29 #4 #29    ; BLUE DRAGON  x4
0x981A  COMBAT
0x981B  IF_NE ; GOTO 0x832C                            <- not a victory -> no consume
0x9820  OR #1 [0x0154] -> [0x0154]
```

`PARTY_SURPRISE` (`0x22` @ `0x97DF`) is one of the opcodes this profile's dialect frames with **zero**
words. A wrong dialect desyncs here silently rather than raising.

`[0x0150]` is written **only inside block 34** — 9 sites, corpus-wide, all in this one block
(`OR #1` @`0x80DF`, `#4` @`0x8470`, `#2` @`0x84D0`, `#8` @`0x86F6`, **`#16` @`0x8A62`**, `#32`
@`0x8C05`, `#64` @`0x8C77`, `#128` @`0x8CF3`, `#96` @`0x9247`). It is a block-local 8-bit flag word.

The **unique** setter of bit 4 is `0x8A62`, inside **arm 12**, written out in full rather than
summarised:

```
0x89F7  AND #16,[0x0150] -> [0x00BF]
0x8A00  IF_NE
0x8A01  SURPRISE                      (terminal — the actual one-shot guard body)
0x8A02  PRINTCLEAR
0x8A61  PARTYSTRENGTH
0x8A62  OR  #16,[0x0150] -> [0x0150]
```

> **Correction (2026-08-06).** The first draft compressed this to "head `0x89F7`: one-shot guard →
> narration → `PARTYSTRENGTH` → `OR #16 [0x0150]`", silently omitting `0x8A00 IF_NE` and
> `0x8A01 SURPRISE` — the actual one-shot guard body. Both listings in this document
> (§2's boot listing and this one) presented as contiguous address dumps while omitting instructions;
> §2's `0x80A2 SAVE #14 -> [0x0039]` has been restored above for the same reason.

Arm 12 is selected by masked
descriptor 12, and **exactly one cell on the map carries it: `(6,4)`** (descriptor `0x8C`).

`(6,4)` is **not** in the 15-cell spawn pocket.

Therefore, on a first entry into block 34:

1. the party spawns inside the pocket at `(1,13)`;
2. reaching `(6,4)` — the only cell that can arm `(7,14)` — requires leaving the pocket;
3. leaving the pocket requires stepping on `(7,14)` (§5);
4. but at that moment bit 4 is still clear, so `(7,14)` is **silent**.

> The party cannot arm the dragon hall without first crossing the dragon hall's own cell.

Both halves are demonstrated in the real VM. At `(7,14)` with `[0x0150] = 1` (the boot value) the
turn is `{kind:'end', text:''}`. With bit 4 additionally set the same cell raises a `say` turn with
choices `["YES","NO"]`; `choose(0)` (YES, leave quietly) → `{kind:'end', text:''}`, and `choose(1)`
(NO) → `combat "THE DRAGONS NOTICE YOU! THEY ATTACK!"` with
`[{26,×6},{27,×3},{28,×3},{29,×4}]` — sixteen dragons in four groups.

**This route deliberately takes the silent pass.** It reaches `(1,12)` without ever arming `(7,14)`,
which is why §6 records that cell as silent rather than as a fight.

### 7b — Why no `RANDOM` runs on this route (structural, not lucky)

Arm 0 (raw descriptor `0x80`, the 201 open-floor cells — 15 of the 19 route steps) is Pools'
wandering-monster arm:

```
0x8265  SAVE     #0 -> [0x00A2]
0x826B  COMPARE  [0x009F] #4  ; IF_GE ; EXIT      <- encounter budget spent
0x8273  COMPARE  [0x009E] #25 ; IF_LT ; EXIT      <- fewer than 25 steps: EXIT BEFORE THE ROLL
0x827B  COMPARE  [0x009F] #0  ; IF_GT ; GOTO 0x82E1
0x8286  RANDOM   #99 -> [0x00BF]
0x828C  COMPARE  [0x00BF] #5  ; IF_GT ; EXIT      <- ~6% per step
0x8294  SETUP_MONSTER #90 #0 #255 #0
0x829D  PRINTCLEAR "YOU STUMBLE UPON A GROUP OF ROGUES."
```

`search_location` increments `[0x009E]` once per step at `0x81B1`. The walk's 19 steps take it from
0 to 19, so `0x8273` exits **before** `RANDOM` on every open-floor cell. That is why the eight-seed
re-run in §6 is bit-identical: the roll never executes. A structural guarantee, not an RNG outcome.

> **Correction (2026-08-06).** The first draft added "and why `[0x00BF]` ends at 0" as part of this
> argument. That sub-argument is withdrawn: it is **not** discriminating. `[0x009E]` ends at 19,
> below `0x8273`'s threshold of 25, so `0x8286 RANDOM` is never reached on any of the 19 steps —
> that, and test F3's same-seed above/below-threshold control, is the real evidence. `[0x00BF]` is
> NOT usable as evidence here: it is a general scratch register rewritten every step by
> `0x81BA AND #63,[0x002D] -> [0x00BF]` and again by the target arm's own
> `0x9C46 AND #2,[0x0154] -> [0x00BF]`, and it ends at 0 whether or not a roll executed. Verified by
> re-running the identical 19-step walk with `[0x009E]` preset to 30 so the roll DOES execute on
> every open-floor step (per-step `[0x00BF]` = 40 each time): the terminal `[0x00BF]` is still 0, the
> outcome pattern is still `....T.........T...C` and `[0x0154]` is still 2. The **conclusion**
> survives untouched; only this sub-argument was bogus.

The arm is nevertheless **live**, and the golden proves both directions:

* `[0x009E] = 30` (past the threshold): seeds `0x1234`/8/3/99 roll `[0x00BF]` = 40/86/94/79, all
  `> 5`, all silent — and **seed 11 rolls 2** and prints `"YOU STUMBLE UPON A GROUP OF ROGUES."`
* `[0x009E] = 5` (below the threshold) **at that same seed 11**: silent, and `[0x00BF]` is never
  written. This is the discriminating control — it shows the threshold, not the RNG, is what
  silences the route.

**Disclosure.** `[0x009E]` and `[0x009F]` are shared low scratch cells, not block-34-private, and
block 34 only ever *increments* them (`0x81B1`, `0x82D7`) — it does **not** reset them on entry. The
claim above therefore holds "from a fresh memory". A party entering with `[0x009E] ≥ 6` would begin
rolling before step 19. Block 18's own writes to `[0x009E]` are `SAVE #0` / `SAVE #1` (six sites),
so a real arrival through the hub satisfies the condition — but that is a statement about the writes
read, not a traced hand-off.

---

## §8 — Controls, and an honest qualification of "nothing seeded"

The walk in §6 passes `seedMemory: {0x0011: facing, 0x0034: x, 0x0035: y}` per step. That is the
**harness emulating the host**: on a real move the engine updates the party pose registers before
running `search_location`. It is not script state and it is not entry injection — but it *is*
something the test writes, so it is disclosed rather than described as "nothing seeded".

**Control — is the target encounter sensitive to it?** No. Re-running the identical 19-step walk with
`seedMemory` removed entirely gives a byte-identical outcome at `(1,12)`: same `combat`, same
`UMBER HULK ×5`, same terminal `[0x0154] = 2`, same silence on every open-floor cell. Arm `0x9C46`
reads only `[0x0154]`; it never reads the pose.

**The one cell that does depend on it:** `(4,13)`, arm `0x833B`, opens with
`COMPARE [0x0011] #3 ; IF_NE ; EXIT` — **facing-gated on west**. Sweeping all four facings, only
`west` produces the KI-RIN narration; north/east/south are silent. The route enters `(4,13)` heading
west, so it fires; with pose seeding removed `[0x0011]` retains the boot value 2 (south) and that one
narration disappears. **That is the only difference between the seeded and unseeded walks**, and it
is why the golden asserts it explicitly instead of quietly relying on it.

**HARNESS (disclosed 2026-08-06).** `step()` builds a fresh `DialogueRunner` per cell with the same
seed, so every step draws the same first PRNG value (verified: 15 consecutive rolling steps all yield
40). This route is unaffected because `0x8273` exits before `0x8286 RANDOM` on all 19 steps, but the
harness must not be used to argue anything probabilistic. (Demonstrated: with `[0x009E]` preset to 30
all fifteen rolling steps produced `[0x00BF] = 40`, and a 19-step open-floor walk starting the
counter at 20 produced zero encounters with terminal `[0x00BF] = 40`.) The first draft disclosed the
pose seeding but not the per-cell reseeding.

---

## §9 — Verification

```
cd packages/engine; npx vitest run test/poolsMiddleRoute.test.ts
```

13 cases, all passing against the real retail files. The suite does not skip when the data is
present; it fails loudly if the install cannot be resolved.

---

## §10 — What this leg does **NOT** establish

* **No native / DOSBox-X trace was run** (standing rule for this batch: static byte-level work only).
  Every engine-side claim is retail bytes plus this repo's TypeScript `EclVm`. If that VM mis-models
  an opcode, the walk inherits the error. `EclVm` is not the retail interpreter, and no claim here is
  a claim about observed DOS behaviour.
* **The "middle" label is inference.** Proven: not the opening, not a terminus (§1.5). Not proven:
  that realm 1 is played second/third/fourth, or any chapter mapping. No ordering is claimed against
  the `early` leg's block 72.
* **What gates the realm choice is unknown.** `[0x0099]` is set inside block 18 itself and is a
  reused scratch word elsewhere in the corpus (§1.5). This leg does not show what makes the hub offer
  realm 1, so "you must have progressed to reach block 34" is *not* established — only "you must
  have reached block 18 and taken row 1".
* **`[0x0152]` is not investigated.** A global suppressor tested at `0x81C3` (the whole dispatch), at
  `0x9747` ((7,14)) and elsewhere. It is 0/absent throughout this route so it never suppressed
  anything here; its writers and meaning were not traced.
* **`[0x00EC]`'s first-visit polarity was not settled.** On a literal reading of "IF_xx executes the
  next instruction when the condition holds", the `0x8835 AND / IF_NE / 0x8840 OR` sequence appears
  to re-set an already-set bit and to skip the OR on a true first visit, which would leave `[0x00EC]`
  permanently 0. That reading is suspicious and was **not** resolved. Nothing in this leg depends on
  it; it is flagged so the next reader does not assume it was checked.
* **The `&0x3F` mask is quoted from the script, not proven by counterfactual** — on this map `&0x3F`
  and `&0x7F` are indistinguishable (§3), so no mask counterfactual is included.
* **The 13-articulation-point result is specific to spawn → `(1,12)`.** The `(7,14)` cut-vertex
  result (§5) is the general one; the other 12 are not claimed to be bottlenecks for other targets.
* **`(6,4)`'s arm-12 narration was not read for content**, only for its `OR #16 [0x0150]` effect and
  its reachability. §7's ordering theorem needs only those.
* **No browser wiring.** No `?explore=` route id, no e2e acceptance, no live-site claim, and no
  campaign-matrix edit (a later step owns `tools/goldbox_campaign_matrix.json`).
* **The prior draft's §1.4 and §10 were not re-verified** and are absent here (see the provenance
  note), as is its "THORNE" area name.
