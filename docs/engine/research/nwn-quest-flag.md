# Neverwinter Nights (DOS/AOL) — the QUEST leg: the Kraken Society dock password

**Profile:** `neverwinter-nights-dos`
**Retail root:** `D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint\`
**Date:** 2026-08-05
**Verdict:** `proven` — with three explicitly-scoped caveats in §9, one of which (the setter
cell's walk-unreachability) is a genuine negative result found by this investigation and is
*not* smoothed over.
**Engine golden:** `packages/engine/test/nwnQuestFlag.test.ts`

---

## 0. One-paragraph summary

NWN's cross-archive quest state is a **password index**. `ECL5.DAX#51` (the Neverwinter
"new docks" event overlay) and `ECL1.DAX#14` (a road/catacomb area in a *different archive*)
each carry a **byte-identical 26-entry password word table**. `ECL1.DAX#14` selects from that
table with `[0x32CA]` and *prints the word to the player* on a note looted from a corpse
("TELL THE MAN AT THE DOCK IN NEVERWINTER, THE PASSWORD IS '<word>' FOR TRAVEL TO THE PURPLE
ROCKS."). `ECL5.DAX#51` selects from the same table with `[0x32C8]` and uses it as the
**expected answer** to a live `INPUT_STRING` at the dock; a match takes the `FIND_ITEM #70`
arm, a mismatch takes the Kraken-Society refusal arm and bounces the party back to area 1.
There is exactly **one** write site in the whole 6-archive / 33-block corpus that puts a
password value into either cell, and it writes **both** cells to the same value, three
instructions apart: `ECL5.DAX#51 @0x9572` and `@0x9582`. That single setter is what wires
the hint-giver and the gate together.

---

## 1. Method and scope

Everything below was produced from the retail bytes by two independent paths:

1. **A control-flow-aware corpus scan.** All 6 ECL archives (`ECL0/1/2/3/5/7.DAX`), all 33
   script blocks, BFS'd from each block's five ECL header entries using the repo's own Gen1
   decode/BFS primitives (`tools/gen1_ecl_encounter_scan.py`'s `decode_one` / `header_entries`
   / `successors` **together with `scan_block`'s COMPARE-outcome reset** — see the correction
   below, the three primitives alone do *not* reproduce the figures in this bullet),
   decoded with the **long-frame** `GEN1_WORD_SETS` dialect. NWN is *not*
   one of the four short-frame titles (DoK / Gateway / Treasures / Pools of Darkness), so it
   correctly takes the default long dialect and there is no silent desync. Instruction-byte
   coverage of the reachable set is **93.6 % of the corpus** (157 182 / 167 958 bytes);
   30 of 33 blocks exceed 90 %, and the only real outlier is `ECL5.DAX#51` at 25.1 % (its
   bulk is the two 26-entry inline word tables and long narration, reached through GOSUBs
   the BFS does enter — the *instructions* are covered, the *inline string payloads* are not
   counted as instruction bytes).

   > **Correction (2026-08-05) — the recipe as originally stated does not reproduce its own
   > numbers.** This bullet named only `decode_one` / `header_entries` / `successors`. Driven with
   > just those three — i.e. threading each `IF_*`'s narrowed `compare_outcomes` straight into the
   > next `successors()` call, which is what the signature invites — `successors()` carries
   > `compare_outcomes` through `COMPARE` **unchanged**, so the second `IF_EQ` in
   > `ECL5.DAX#51`'s `initial_entry` has an empty passing set and the walk never reaches the console
   > at `0x951D`. Re-measured on the retail bytes: that model gives **64.2 %** corpus coverage
   > (107 913 / 167 958), **1** block over 90 %, and **`ECL5.DAX#51` at 12.3 %** (678 / 5 529) with
   > `0x951D` **not reached** — which would make §9.5's assurance that the console "is inside the
   > covered set" unverifiable from the named primitives. The published figures require, in addition,
   > **`scan_block()`'s COMPARE / COMPARE_AND / AND / OR / PARTYSTRENGTH / FIND_SPECIAL outcome
   > reset** (`gen1_ecl_encounter_scan.py:298-308`: opcode `0x03` re-widens to `ALL_COMPARE_OUTCOMES`
   > unless both operands are immediates, and `0x14`/`0x1D`/`0x2F`/`0x30`/`0x3F` re-widen
   > unconditionally). With that reset the numbers reproduce **exactly**: 93.6 % (157 182 / 167 958),
   > 30 of 33 blocks over 90 %, `ECL5.DAX#51` 25.1 % (1 386 / 5 529), `0x951D` reached. Read every
   > "reachable" figure in this document as belonging to that second model.
2. **A control-flow-free raw byte scan** for the exact operand encodings, which needs no
   model of the CFG at all and is what §3's counts rest on.

Where the two disagree, the raw scan wins and the disagreement is reported. They did not
disagree here.

Scanner scripts lived in the session scratchpad and are not checked in; every number below
is reproducible from the primitives named above plus the byte patterns printed in §3.

---

## 2. The mechanism, instruction by instruction

### 2a. The setter — `ECL5.DAX#51`, descriptor 37 (block size 5 529 bytes)

`ECL5.DAX#51` has one real entry: `initial_entry -> 0x8014`. (Its `vm_run_1` /
`search_location` / `pre_camp_check` / `camp_interrupted` header slots all point at `0x80FB`,
which is a bare `NEWECL #1` — this block is an **event overlay on area 1's map**, not an area
of its own.)

```
0x8014: AND #127, [0xc04f], [0x4c02]      ; masked cell descriptor
0x801d: COMPARE [0x4c02], #36             ; 03 01 02 4c 00 24
0x8023: IF_EQ
0x8024: GOTO [0x8bcc]                     ; -> the dock gate (§2b)
0x8028: COMPARE [0x4c02], #37             ; 03 01 02 4c 00 25
0x802e: IF_EQ
0x802f: GOTO [0x951d]                     ; -> the password console (below)
```

The console:

```
0x951d: SAVE #1, [0xc04d]
0x9523: GOSUB [0x9352]                    ; word table keyed on [0x32C8] (§2c)
0x9527: PRINTCLEAR "CURRENT: "
0x9531: PRINT [0x32c8]
0x9535: PRINT " '"
0x953a: PRINT [str:0x7b1e]                ; the word the table just selected
0x953e: PRINT "' SET NEW PASSWORD.'"
0x9550: GOSUB [0x8bb3]                    ; HORIZONTAL_MENU [0x7f79], #2, "YES", "NO"
0x9554: IF_EQ
0x9555: NEWECL #1                         ; answered NO -> leave
0x9558: SAVE #25, [0x7f79]                ; 09 00 19 01 79 7f
0x955e: INPUT_NUMBER [0x7f79], [0x7f79]   ; 0f 01 79 7f 01 79 7f
0x9565: COMPARE [0x7f79], #25             ; 03 01 79 7f 00 19
0x956b: IF_GT
0x956c: SAVE #25, [0x7f79]                ; clamp to 25
0x9572: SAVE [0x7f79], [0x32c8]           ; 09 01 79 7f 01 c8 32   <-- SETTER, cell A
0x9579: SAVE #14, [0x4bc5]                ; 09 00 0e 01 c5 4b
0x957f: PROGRAM #17                       ; 38 00 11
0x9582: SAVE [0x7f79], [0x32ca]           ; 09 01 79 7f 01 ca 32   <-- SETTER, cell B
0x9589: SAVE #1, [0x4bc5]                 ; 09 00 01 01 c5 4b
0x958f: PROGRAM #17                       ; 38 00 11
0x9592: GOTO [0x951d]                     ; re-display, loop
```

Gen1 `SAVE` operand order is **(source, destination) — destination last**, so `0x9572` and
`0x9582` both write the clamped `INPUT_NUMBER` result. The two writes are separated by
`SAVE #14, [0x4bc5]; PROGRAM #17` and closed by `SAVE #1, [0x4bc5]; PROGRAM #17` — see §9.2
for what that bracket is inferred to mean and what is *not* proven about it.

### 2b. Consumer B (the gate) — `ECL5.DAX#51`, descriptor 36

```
0x8bcc: COMPARE [0x4bc9], #5      ; [0x4bc9] is documented elsewhere in this repo
0x8bd2: IF_LT                     ;   (docs/engine/research/cok-improvement-loop.md) as
0x8bd3: GOTO [0x8d55]             ;   Area1's HOUR field
0x8bd7: COMPARE [0x4bc9], #20
0x8bdd: IF_GE
0x8bde: GOTO [0x8d55]             ; hour < 5 or >= 20  ->  the password scene
   ... daytime description, "THE DOCK NOW LIES EMPTY AND UNUSED. IT LOOKS LIKE THIS MIGHT
       BE A DANGEROUS PLACE TO GO ALONE AT NIGHT." ... NEWECL #1
0x8d55: PICTURE #30
0x8d58: PRINTCLEAR "AS YOU APPROACH THE END OF THE DOCK, A FIGURE MATERIALIZES OUT OF THE
                    SHADOWS. 'WHAT IS THE PASSWORD?' HE ASKS, ..."
0x8dcd: INPUT_STRING #8, [str:0x7b00]     ; 10 00 08 81 00 7b   (max 8 chars)
0x8dd3: GOSUB [0x9352]                    ; 02 01 52 93  -> expected word from [0x32C8]
0x8dd7: COMPARE [str:0x7b00], [str:0x7b1e]; 03 81 00 7b 81 1e 7b
0x8dde: IF_EQ                             ; 16
0x8ddf: GOTO [0x8e7c]                     ; 01 01 7c 8e
0x8de3: PRINTCLEAR "THE MAN GRUNTS AND SHAKES HIS HEAD, AND FOR A MOMENT YOU CAN SEE A SMALL
                    PURPLE SQUID TATTOOED ON HIS MUSCULAR NECK. 'THE DOCKS ARE DANGEROUS AT
                    NIGHT,' HE SAYS. 'STRANGERS SHOULD STAY AWAY.'"
0x8e76: PROGRAM #5
0x8e79: NEWECL #1                          ; refused -> bounced back to area 1
0x8e7c: FIND_ITEM #70                      ; 32 00 46
0x8e7f: EXIT                               ; 00       ; accepted -> the script ends here
```

This is the leg's **negative control in the retail bytes themselves**: the same instruction
stream produces two structurally different terminations (`exited` vs `chain to block 1`)
purely on the string comparison.

### 2c. The two word tables

`ECL5.DAX#51 @0x9352` and `ECL1.DAX#14 @0x9456` are the same 26-entry ladder, in the same
order, differing only in the cell they read:

| index | word | | index | word | | index | word |
| ---: | --- | - | ---: | --- | - | ---: | --- |
| 0 (default) | FUTURE | | 9 | TWAIN | | 18 | TEMPLE |
| 1 | TIME | | 10 | MOUNTAIN | | 19 | RAPTURE |
| 2 | FRONT | | 11 | WOODS | | 20 | EMPIRE |
| 3 | RIPE | | 12 | PALADIN | | 21 | VIOLIN |
| 4 | STORM | | 13 | BARDICHE | | 22 | FIEND |
| 5 | JUNGLE | | 14 | GNOME | | 23 | PENDENT |
| 6 | VISION | | 15 | STATUE | | 24 | OMINOUS |
| 7 | MATAGA | | 16 | GODDESS | | 25 | DUNGEON |
| 8 | BORK | | 17 | UNDOMIEL | | | |

Both ladders open with an unconditional `SAVE "FUTURE", [str:0x7b1e]` and then run 25
`COMPARE <cell>, #n / IF_EQ / SAVE "<word>", [str:0x7b1e]` triples. Index 0 (a fresh cell)
therefore resolves to **FUTURE on both sides**, so the quest is self-consistent with no
setter ever having run — see §9.1.

* `ECL5.DAX#51 @0x935d`: `COMPARE [0x32c8], #1` = `03 01 c8 32 00 01`
* `ECL1.DAX#14 @0x9461`: `COMPARE [0x32ca], #1` = `03 01 ca 32 00 01`

### 2d. Consumer A (the hint) — `ECL1.DAX#14`, descriptor 112 (block size 5 668 bytes)

`ECL1.DAX#14`'s `search_location` (`0x820a`) masks the descriptor with `#127`, clamps it at
104 and dispatches `index = descriptor - 104` through a 24-arm `ON_GOSUB` pre-gate at
`0x82a7` and a 24-arm `ON_GOTO` body at `0x830a`. Descriptor **112** is index **8**:

* pre-gate arm 8 = `0x843d` = `COMPARE #0, #1; RETURN` — an unconditional *not-equal*, i.e.
  this cell has **no time-of-day gate and no `[0x2AF8]` consumed-table check**; it always fires.
* body arm 8 = `0x8eed`:

```
0x8eed: PICTURE #94                                    ; 0e 00 5e
0x8ef0: LOAD_MONSTER #44, #2, #44
0x8ef7: LOAD_MONSTER #94, #4, #94
0x8efe: TREASURE #0,#0,#0,#0,#0,#0,#0,#212
0x8f0f: COMBAT
0x8f10: SAVE #0, [0x4c00]
0x8f16: COMPARE [0x7ec7], #128   ; defeat/flee escapes
0x8f21: COMPARE [0x7ec7], #129
0x8f2c: SAVE #3, [0x7f79]
0x8f32: PROGRAM #16
0x8f35: PRINTCLEAR "CRUMPLED IN THE MONSTER'S POCKET IS A NOTE THAT READS:"
0x8f63: PRINT "TELL THE MAN AT THE DOCK IN NEVERWINTER, THE PASSWORD IS '"
0x8f92: GOSUB [0x9456]                                 ; 02 01 56 94   <-- reads [0x32CA]
0x8f96: PRINT [str:0x7b1e]                             ; 11 81 1e 7b   <-- prints the word
0x8f9a: PRINT "' FOR TRAVEL TO THE PURPLE ROCKS."
0x8fb6: GOSUB [0x87a0]                                 ; "PRESS ENTER TO CONTINUE."
0x8fba: PRINTCLEAR "SEARCHING THE WALLS OF THE ROOM, YOU FIND A SERIES OF HAND-HOLDS ..."
0x9048: SAVE #1, [0xc04b]
0x904e: SAVE #10, [0xc04c]
0x9054: NEWECL #12
```

**This is the cross-archive half.** The write is in `ECL5.DAX`; all 25 `COMPARE` reads of
`[0x32CA]` that select a password word are in `ECL1.DAX`.

---

## 3. Corpus-wide write/read census (control-flow-free)

Raw byte-pattern occurrences across all 33 blocks of `ECL0/1/2/3/5/7.DAX`. A raw scan is an
*upper* bound on real instruction sites; every count below was then confirmed to fall on a
decoded instruction start (or rejected — see the `PROGRAM #17` row).

| Pattern | Meaning | Hits | Where |
| --- | --- | ---: | --- |
| `09 01 79 7f 01 c8 32` | `SAVE [0x7f79] -> [0x32c8]` | **1** | `ECL5.DAX#51 @0x9572` |
| `09 01 79 7f 01 ca 32` | `SAVE [0x7f79] -> [0x32ca]` | **1** | `ECL5.DAX#51 @0x9582` |
| `09 00 0e 01 c5 4b` | `SAVE #14 -> [0x4bc5]` | **1** | `ECL5.DAX#51 @0x9579` |
| `09 00 01 01 c5 4b` | `SAVE #1 -> [0x4bc5]` | **1** | `ECL5.DAX#51 @0x9589` |
| `38 00 11` | `PROGRAM #17` | 5 raw / **2 real** | `ECL5.DAX#51 @0x957f, @0x958f`; the 3 hits in `ECL2.DAX#26` (`0x8e62`, `0x928c`, `0x99f0`) are **byte coincidences inside other instructions' operands**, verified against the decoded instruction-start set |
| `09 01 ca 4b 01 c8 32` | `SAVE [0x4bca] -> [0x32c8]` | 28 | one per area block's `initial_entry` — the "already visited this period" cache. **This is the collision hazard; see §9.3** |
| `09 01 ca 4b 01 ca 32` | `SAVE [0x4bca] -> [0x32ca]` | 1 | `ECL1.DAX#17 @0x8caf` |
| `01 ca 32` | any `[0x32ca]` operand | 38 | `ECL1.DAX#14`: **25**, `ECL1.DAX#17`: 5, `ECL2.DAX#27`: 5, `ECL5.DAX#51`: 3 |
| `01 c8 32` | any `[0x32c8]` operand | 88 | 28 area blocks × 2 (the day cache), `ECL1.DAX#16`: 4, `ECL2.DAX#26`: 5, `ECL5.DAX#51`: **27**. **`ECL0.DAX#1` — area 1's own script — has zero** |

Shape versus Gateway's `[0x4C21]` gold standard: **one corpus-wide write site of a
password value; 25 `COMPARE` reads, all of them in a different archive; a named headline
consumer.** The match is structural, not rhetorical.

### 3a. Every writer of these two cells, not just the two interesting ones (added 2026-08-05)

The table above is a raw-byte census keyed on specific *patterns*, so it only shows the writers
somebody thought to look for. Below is the complete set, derived instead from the CFG-reachable
instruction stream with a destination-argument map: **37 reachable `SAVE` instructions corpus-wide
write into `[0x32C8]` or `[0x32CA]`.**

| shape | count | where |
|---|---:|---|
| `SAVE [0x4BCA] -> [0x32C8]` (day cache) | 28 | one per area block's `initial_entry` |
| `SAVE [0x4BCA] -> [0x32CA]` (day cache) | 1 | `ECL1#17 @0x8CAF` |
| `SAVE [0x7F79] -> [0x32C8]` / `-> [0x32CA]` (**the setter**) | 2 | `ECL5#51 @0x9572`, `@0x9582` |
| `SAVE [0x4BC9] -> [0x32C8]` (writes the **hour**) | 1 | `ECL1#16 @0x8AF6` |
| `SAVE #255 -> [0x32CA]` | 2 | `ECL1#17 @0x8DAD`, `@0x9153` |
| `SAVE #1 -> [0x32C8]` | 1 | `ECL2#26 @0x8CD0` |
| `SAVE #1 -> [0x32CA]` | 1 | `ECL2#27 @0x9336` |
| `SAVE #0 -> [0x32CA]` | 1 | `ECL2#27 @0x933D` |

> **Disclosure, because it enlarges §9.3's collision hazard.** The previous revision disclosed only
> the 28-site day cache and `ECL1#17 @0x8CAF`. There are **six further writers** — `ECL1#16`,
> `ECL1#17` (×2), `ECL2#26`, `ECL2#27` (×2) — and they are **not** day-cache shaped: they store the
> hour, or the literals 255 / 1 / 0. Under the "single global word" reading these clobber the
> password with values that are not even day stamps. This does not change any claim in §2 (the
> setter is still the only site that writes a *password index*, i.e. `[0x7F79]`), and it does not
> change the verdict, but it makes the banked reading of §9.2 more necessary rather than less, and a
> reader is entitled to see the full writer set rather than a filtered one.
>
> **Correction to a related statement.** §2d and the golden describe the 25 `COMPARE [0x32CA], #n`
> reads as being "all in a different archive" from the writer, which is true. It should not be read
> as "`ECL1.DAX` contains no writer of `[0x32CA]`" — it contains **three** (`ECL1#17 @0x8CAF`,
> `@0x8DAD`, `@0x9153`). The cross-archive property that matters is about the *reader block*
> `ECL1#14`, which has no local writer of either cell at all — see §3b.

### 3b. The load-bearing uniqueness claim, re-derived (2026-08-05)

An earlier revision put the corpus-wide operand census at "NWN writes only **51 distinct memory
words**". That figure is **method-dependent** and should not be quoted as a hard fact: it depends
entirely on which opcodes' arguments you count as destinations. Re-derived this round with an
explicit map (`SAVE`→arg1; `ADD`/`SUBTRACT`/`DIVIDE`/`AND`/`GETTABLE`→arg2; `RANDOM`→arg1;
`INPUT_NUMBER`/`HORIZONTAL_MENU`→arg0; `SAVE_TABLE` excluded because its destination is computed),
the count is **52**. The discrepancy is the map, not the bytes. **Neither number is load-bearing and
neither is asserted in the golden.**

What *is* load-bearing reproduces exactly, and more sharply than it was stated: over the whole
33-block corpus, **`[0x32CA]` is the only memory word whose reader set contains a block that never
writes it**, and there is exactly **one** such orphan reader — **`ECL1.DAX#14`**. Every other
written word in the game is read only inside blocks that also write it. That single fact is the
cross-block-flag argument; the "51 distinct words" sentence was decoration around it.

`[0x4BC5]` is written at exactly those two sites and read **nowhere** in the corpus —
consistent with a parameter the host consumes, not a script variable.

### The rest of the corpus, for context

A whole-corpus operand census (57 931 operand references from the reachable BFS, of which
30 725 are address-coded) found that NWN writes only ~**51** distinct memory words corpus-wide
(*see §3b — this count is method-dependent and a second, explicitly-specified destination map gives
**52**; it is not load-bearing and the golden does not assert it*), and that `[0x32CA]` is the
**only** word in the entire game whose read set includes a block with no local writer — i.e. NWN has
exactly one candidate for a cross-block flag and this is it. *(That uniqueness claim WAS re-derived
independently this round and holds exactly, with `ECL1.DAX#14` as the sole orphan reader — §3b.)*
Everything else NWN persists per-cell goes through a completely different mechanism:
a byte array based at `[0x2AF8]`, written by `SAVE_TABLE` (0x35) with a *runtime-computed*
offset (`index = maskedDescriptor - <per-block base>`, held in `[0x7F79]` or `[0x4C02]`),
and read back with `GETTABLE`. Corpus-wide there are exactly three `SAVE_TABLE` operand
shapes — `#1,[0x2af8],[0x7f79]` (38 sites), `#0,[0x2af8],[0x7f79]` (28 sites),
`#1,[0x2af8],[0x4c02]` (7 sites) — and **every** matching `GETTABLE` read is in the same
block as its writer. That is why the `[0x2AF8]` table (which the already-closed `early` leg
uses, at address 11002 / `0x2AFA`) is *not* the quest flag: it is per-area "this cell's event
is consumed" state, never a cross-area link.

---

## 4. A scanner false negative worth reporting

`tools/map_gen1_cross_area_flag_reads.py` cannot find this flag as-shipped, for two
independent reasons. Neither was worked around silently:

1. **No registry entry.** `FLAG_REGISTRY` has no `neverwinter-nights-dos` key, so
   `build_report()` skips the profile entirely. This is the same *shape* of scope bug as the
   `GEN1_PROFILE_IDS` omission fixed for the wilderness leg — the tool prints a total and
   exits 0 while having read nothing.
2. **The write/read classifier is masked-`SAVE`-only.** `scan_block_for_targets()` marks a
   hit as a write only when `ins.mnemonic == "SAVE" and arg_index == 1`. Under that rule
   **`SAVE_TABLE` (0x35) destinations are classified as reads** (its destination is
   `base + offset`, i.e. args 1 and 2, and it is not named `SAVE`), and so are `GETTABLE`
   (0x2A) destinations (arg 2), `ADD`/`SUBTRACT`/`AND`/`OR` destinations (arg 2),
   `RANDOM`/`INPUT_*` destinations (arg 1), `PARLAY` (arg 5), `CHECKPARTY` (args 2-5) and
   menu destinations. For NWN — the one title in the corpus whose persistence is
   `SAVE_TABLE`-based — that is a systematic false negative of the same family as the one
   fixed in `5febedb`.

The census in §3 was therefore built from a scratchpad scanner using a destination-operand
map derived from the engine's own `memory.set` call sites in
`packages/engine/src/ecl/vm.ts`. **Recommendation (not applied here — this investigation owns
only two files):** add a `neverwinter-nights-dos` entry to `FLAG_REGISTRY` and replace the
`mnemonic == "SAVE" && arg_index == 1` rule with an opcode→destination-arg table. Both are
tool changes another task should own.

Also worth recording for whoever does that: `tools/map_gen1_cross_area_flag_reads.py` and
`tools/gen1_ecl_encounter_scan.py` both **default their `--markdown` to a checked-in doc**
under `docs/engine/research/`. This investigation ran neither with default paths.

---

## 5. GEO ground truth

Gen1 GEO block = 1026 bytes, 16×16; descriptors at `raw[514:770]` indexed `y*16 + x`; the
scripts mask with `#127`.

| Cell | Block | Masked descriptor | Meaning |
| --- | --- | ---: | --- |
| (1,11) and (1,13) | `GEO0.DAX#1` (Neverwinter) | 36 | the dock gate — the doorman |
| (4,0) | `GEO0.DAX#1` | 37 | the "SET NEW PASSWORD" console |
| (15,6) | `GEO1.DAX#14` | 112 | the corpse-with-the-note encounter |

`ECL0.DAX#1`'s `search_location` splits at `0x81f1` on the **raw** descriptor byte
(`COMPARE [0xc04f], #129; IF_LT GOTO 0x827c`); both 36 and 37 are stored raw (high bit
clear), so both take the second 38-arm `ON_GOTO` at `0x8284`, whose arm 36 is `0x92b7` and
arm 37 is `0x92c2`:

```
0x92b7: COMPARE [0xc04d], #3      ; 03 01 4d c0 00 03  -> facing must be WEST
0x92bd: IF_NE
0x92be: EXIT
0x92bf: NEWECL #51
0x92c2: NEWECL #51                ; 20 00 33
```

So the dock gate is reachable only while **facing west** on (1,11)/(1,13); the console cell
has no facing gate.

### Walk reachability (GEO wall/door graph)

The golden test uses the engine's own step rule — `Explorer` blocks a move only when
`cell.walls[dir] !== 0 && (cell.doors?.[dir] ?? 0) === 0`
(`packages/engine/src/world/explorer.ts:163`), i.e. **every** door/gateway edge counts as
passable, with no bash/pick/knock requirement. That is the *permissive* rule, so the
"unreachable" verdict below is strictly stronger than one taken under a stricter door model.

* **Dock gate: reachable.** From `ECL0.DAX#1`'s own byte-grounded default spawn
  (`0x8138: SAVE #8,[0xc04b]; 0x8144: SAVE #7,[0xc04c]; 0x8150: SAVE #3,[0xc04d]` = (8,7)
  facing west) to (1,11) is an **11-step** legal walk:
  `south, west, south, west, west, west, west, south, south, west, west`.
* **Note encounter: reachable.** From `ECL1.DAX#12`'s own trapdoor hand-off
  (`0x9d20: SAVE #11,[0xc04b]; 0x9d26: SAVE #6,[0xc04c]; 0x9d2c: NEWECL #14` = (11,6)) to
  (15,6) is a **32-step** legal walk inside `GEO1.DAX#14`'s 81-cell component. (`GEO1.DAX#14`
  is a fragmented map — (15,11), the arrival cell from area 12's *other* hand-off, is in a
  different 68-cell component and cannot reach (15,6). Both are real; the map is stitched by
  scripted teleports.)
* **Console: NOT reachable — a genuine negative result.** A forward BFS from (8,7) never
  reaches (4,0), and a reverse BFS over the same graph finds that **only four cells can ever
  step into (4,0)**: `{(1,0), (2,0), (3,0), (4,0)}` — a dead pocket along the top edge that
  is disjoint from the entire walkable component. None of `ECL0.DAX#1`'s seven declared entry
  poses — (7,0), (10,5), (15,7), (7,15), (2,6), (1,11), (8,7) — lies in it. The password
  console is a **walk-unreachable developer cell**. Both BFS runs are asserted in the golden
  test (case J). See §9.1.

---

## 6. End-to-end, both directions (what the golden test runs)

All of the following runs the **real `EclVm`** over the **real retail bytes**; nothing is
hand-traced.

**Direction 1 — setter → hint.** Run `ECL5.DAX#51` from `initial_entry` (offset 22 =
vaddr `0x8014`) with `[0xC04F] = 37`. The console prints `CURRENT: <n> '<word>' SET NEW
PASSWORD.'`; answer the YES/NO menu with 0 (YES), answer `INPUT_NUMBER` with `N`. On the
loop-back the console re-prints with the *new* word, proving the table read the value just
written. `memory[0x32C8] === N` and `memory[0x32CA] === N`. Carry that same memory map into
`dialogueForCell(ECL1.DAX#14, 112)`: the descriptor-112 cell yields a `combat` turn
(`44 ×2`, `94 ×4`), and `afterCombat('victory')` yields the note text containing
`THE PASSWORD IS '<W(N)>'`.

**Direction 2 — setter → gate, with the required negative control.** Run `ECL5.DAX#51` from
`initial_entry` with `[0xC04F] = 36` and `[0x4BC9] = 2` (night). The `INPUT_STRING` pause is
answered with:

* `W(N)` → the VM terminates `exited` at `0x8e7f` after `FIND_ITEM #70`, and the refusal
  text never appears.
* **anything else** (the negative control) → the VM terminates `chain` to block **1** and
  the refusal text ("A SMALL PURPLE SQUID TATTOOED ON HIS MUSCULAR NECK") *is* emitted.

Both directions are asserted for every index 0…25, so the hint and the gate are proven to
agree on all 26 table entries, not just one.

**Daytime control.** With `[0x4BC9] = 12` the same descriptor-36 cell never reaches
`INPUT_STRING` at all — it prints the empty-dock description and chains to block 1. The
password scene is genuinely night-gated.

---

## 7. Why this is the QUEST leg and not something else

* It is a **per-area persistent slot**, not per-step scratch: the same word carries the "already
  visited this period" day cache in **28** blocks' `initial_entry` (`COMPARE [0x4BCA],[0x32C8]` then,
  12 bytes later, `SAVE [0x4BCA],[0x32C8]` — re-measured 2026-08-05: exactly 28 sites of each, one
  pair per block, in the same 28 blocks), an idiom that only works if the slot **survives area
  changes** *and* **is not shared between areas**. The dock password is one use of that slot among
  several unrelated ones. The value linking the two areas lives in two different archives and is the
  only thing linking them.

  > **Corrected 2026-08-05.** This bullet read *"It is **persistent state**, not per-step scratch."*
  > That overstates it given the corpus: `[0x32C8]` and `[0x32CA]` are demonstrably reused as
  > ordinary per-area scratch by at least four other blocks (`ECL1#16`, `ECL1#17`, `ECL2#26`,
  > `ECL2#27`) for unrelated booleans, day caches and the hour (§3a). What is defensible is the
  > narrower statement above — *per-area* persistent slots — and even their retention across area
  > changes is **inferred**, from the day-cache idiom rather than proven. Recorded also because that
  > idiom is real positive evidence for per-area storage that this document's own banking inference
  > (§9.2) never invoked and should have.
* It **gates different content** in both directions — a printed hint on one side, a hard
  yes/no passage gate with two structurally different terminations on the other.
* It has a **named headline consumer**: the Kraken Society doorman at the Neverwinter docks,
  granting travel to the Purple Rocks.
* It is **not** the `[0x2AF8]` consumed-table mechanism the `early` leg already uses (§3), so
  this leg is not a restatement of an already-closed one.

---

## 8. What was checked and rejected

| Candidate | Why rejected |
| --- | --- |
| `[0x2AF8]` + `SAVE_TABLE`/`GETTABLE` (NWN's own persistence mechanism, used by the proven `early` leg) | Every `GETTABLE [0x2af8]` read is in the same block as its `SAVE_TABLE` writer. Per-area consumed-cell state, no cross-area link. |
| `[0x36B0]` | The *only* word in the corpus with exactly one write site **and** exactly one read site, but both are inside `ECL1.DAX#16` (Longsaddle). It is an arrival-suppression flag: set at `0x8122` when `initial_entry` sees `[0x4BF2] == 17` (arrived from area 17) at (15,9), read at `0x8AEB` to silence the market-square speech. Real, but same-block. |
| `[0x32C8]` as a stand-alone flag | It is *also* the per-area "already visited this period" cache in 28 blocks (`SAVE [0x4bca], [0x32c8]`). Only the `[0x7f79]`-sourced write is password state. Disclosed as a hazard in §9.3 rather than hidden. |
| `[0x32C9]`, `[0x32CB]` | Shared scratch reused by `ECL1.DAX#15/#17`, `ECL2.DAX#27/#28/#29` for unrelated per-area purposes. Textbook collision, no consistent semantics. |
| `[0x7ED5]`, `[0x7EC7]`, `[0x7ECA]`, `[0x4BC9]`, `[0x4BCA]`, `[0x0067]` | Read-only host-owned words (zero ECL writers corpus-wide). No ECL setter exists to wire. |
| `FIND_ITEM #70` as a quest item | Appears at 6 sites, always immediately before `EXIT`, and the engine models 0x32 as a *query* that only sets compare flags. Its NWN-specific meaning is unresolved; no claim is made about it beyond "the accept arm executes it". |

---

## 9. Caveats — everything not proven

### 9.1 The ECL setter is on a walk-unreachable developer cell

Proven in §5: (4,0) can be entered only from (3,0), and nothing in `GEO0.DAX#1` can reach
(1,0)/(2,0)/(3,0) from any of `ECL0.DAX#1`'s own declared spawns. So a player walking the
retail map cannot run `0x9572`/`0x9582`. **This is the strongest counter-argument to the leg
and it is not dismissed.**

> **Enumerated 2026-08-05, because "any of its own declared spawns" was never spelled out.**
> `ECL0.DAX#1` declares **seven** entry poses in its preamble, as `SAVE #imm -> [0xC04B]` /
> `[0xC04C]` pairs (the pair order varies — some write Y first, which is why a naive X-then-Y scan
> finds only five):
>
> | vaddrs | cell | facing also set? |
> |---|---|---|
> | `0x809A` Y#0, `0x80A0` X#7 | **(7,0)** | — |
> | `0x80AA` Y#5, `0x80B0` X#10 | **(10,5)** | `0x80B6` F#0 |
> | `0x80CB` X#15, `0x80D1` Y#7 | **(15,7)** | — |
> | `0x80E6` Y#15, `0x80EC` X#7 | **(7,15)** | — |
> | `0x8101` X#2, `0x8107` Y#6 | **(2,6)** | `0x810D` F#0 |
> | `0x8122` X#1, `0x8128` Y#11 | **(1,11)** | `0x812E` F#1 |
> | `0x8138` X#8, `0x8144` Y#7 | **(8,7)** | `0x8150` F#3 (the cold-boot default, §5) |
>
> The unreachability result in §5 is quantified over all seven, not just the cold-boot one. Note
> that **(1,11) — the dock gate itself — is one of the declared spawns**, i.e. the game can place the
> party directly on the consumer cell; it just cannot place them on the setter cell.

Three things blunt the counter-argument, and all three are stated as what they are:

* **The quest still functions with the setter never run — but only under one of the two live
  readings of §9.2, and this leg does not discriminate between them.** *(Corrected 2026-08-05: the
  previous revision stated this bullet as a flat fact. It is an inference, and it is the entire
  rescue argument for the leg surviving the setter's walk-unreachability, so it must not be stated
  as a fact.)*
  * **Under the (unproven) per-area-bank reading of the `PROGRAM #17` bracket** the quest is
    self-consistent with the setter never run: area 1's `[0x32C8]` and area 14's `[0x32CA]` are then
    both untouched, both ladders default to index 0 = `FUTURE`, so the note says FUTURE and the
    doorman accepts FUTURE. The wiring — *the note always names exactly the word the doorman
    expects* — then holds for every value of the index including the untouched one.
  * **Under the alternative single-global-word reading — which §9.3 concedes is live — neither cell
    is ever "untouched" by the time the party reaches the dock.** Re-measured from the reachable
    instruction stream: `[0x32C8]` takes the day counter (`SAVE [0x4BCA]`) on entry to **28** blocks,
    plus the **hour** in `ECL1#16 @0x8AF6` and `#1` in `ECL2#26 @0x8CD0`; `[0x32CA]` takes the day
    counter in `ECL1#17 @0x8CAF`, `#255` in `ECL1#17 @0x8DAD` and `@0x9153`, and `#1` / `#0` in
    `ECL2#27 @0x9336` / `@0x933D`. The note lives in area **14** and the gate in area **1**, and the
    28 day-cache blocks are every ordinary area block *except* block 1 — **including `ECL1#14`
    itself**, whose own `initial_entry` writes `SAVE [0x4BCA] -> [0x32C8]` at `0x81F6` (guarded by
    `COMPARE [0x4BCA],[0x32C8]` at `0x81EA`). So the player cannot even reach the note without
    crossing a clobbering block; under the global reading the note and the gate desync
    **generically**, not merely "for arbitrary transits".
  * **The leg does not discriminate between the two readings.** §9.3's collision list previously
    named only the 28 day-cache sites and `ECL1#17 @0x8CAF`, which under-disclosed how bad the global
    case is (§3a now lists all 37 writers). What the golden asserts is the *wiring* — setter value →
    both consumers' words — never that arbitrary area transits preserve it.
* The console's presence is consistent with the title's AOL origin (a sysop-rotatable
  password so players could not simply share it), but that is **interpretation, not
  evidence**.
* Whether the retail host (`GAME.EXE`/`GAME.OVR`) seeds `[0x32C8]`/`[0x32CA]` at new-game
  time, or restores them from a save, is **UNLOCATED**. No host disassembly was done for this
  leg. If it does seed them, the console is redundant; if it does not, the shipped game runs
  the FUTURE/FUTURE default. Both are consistent with everything measured here.

### 9.2 `PROGRAM #17` / `[0x4BC5]` bank semantics is an INFERENCE

The reading that `SAVE #14, [0x4bc5]; PROGRAM #17` swaps a per-area persistent data bank
(so the `[0x32CA]` write lands in **area 14's** copy and the following `SAVE #1, [0x4bc5];
PROGRAM #17` restores area 1's) is an inference from three facts, not a proof:

* `PROGRAM #17` occurs at exactly two real instruction sites in the entire game, both here,
  both immediately after a `SAVE …, [0x4bc5]` (§3).
* `[0x4BC5]` is written only at those two sites and read nowhere.
* `14` is exactly the block/area id of the consumer, `ECL1.DAX#14`; `1` is exactly the area
  the overlay runs on.

**Not done:** disassembling NWN's own `PROGRAM` dispatch in `GAME.OVR`. Until that is read,
"bank" is a label for an observed bracket, not a proven mechanism.

### 9.3 Under the alternative "single global word" reading, the cells collide

If `[0x32C8]`/`[0x32CA]` are one global word each rather than per-area banked, then the 28
`SAVE [0x4bca] -> [0x32c8]` day-cache writes (one per area block) would overwrite the dock's
expected password on every area entry, and `ECL1.DAX#17 @0x8caf` would overwrite the note's
index. **Widened 2026-08-05:** §3a shows six *further* writers that are not day-cache shaped at all
— `ECL1#16 @0x8AF6` stores the hour into `[0x32C8]`, and `ECL1#17 @0x8DAD`/`@0x9153`,
`ECL2#26 @0x8CD0`, `ECL2#27 @0x9336`/`@0x933D` store the literals 255 / 1 / 0. So the global reading
is worse than the previous revision admitted: 35 non-password writers against 2 password writers.
The two would then desync, and the quest would be inconsistent.
That inconsistency is itself an argument *for* the banked reading — an argument, not a proof.
Two supporting observations, both measured: `ECL0.DAX#1` (area 1's own script) references
`[0x32C8]` **zero** times, so nothing in area 1 clobbers the dock's cell from inside; and the
console's bracket in §9.2 would be pointless under the global reading. The golden test
therefore asserts the *wiring* (setter value → both consumers' words) and does **not** assert
that arbitrary area transits preserve it.

### 9.4 Static reachability only

Every "reachable" claim is static CFG reachability from the five ECL header entries plus the
GEO wall/door graph. No DOSBox-X run was made (project rule). The `[0x4BC9]` = hour label is
taken from this repo's existing CoK documentation, not re-derived here; the leg does not
depend on it beyond "some engine word gates day vs night".

### 9.5 Coverage

`ECL5.DAX#51`'s instruction coverage under the BFS is 25.1 % of its 5 529 bytes (1 386 bytes).
Both the console (`0x951d`…`0x9592`) and the gate (`0x8bcc`…`0x8e7f`) and the word ladder
(`0x9352`…`0x951c`) are inside the covered set — verified by the disassembly above being
produced *from* that set. The uncovered bulk is inline narration payload. No claim here rests
on an uncovered byte.

> **The 25.1 % and the "console is covered" claim are both model-dependent (added 2026-08-05).**
> They hold only under the BFS model named in §1 bullet 1 — `successors()` **plus** `scan_block()`'s
> COMPARE-outcome reset. Without that reset the same block covers **12.3 %** (678 bytes) and
> `0x951D` is **not** in the covered set at all, so this section is not reproducible from the three
> primitives the previous revision named. Nothing about the leg changes — the console's disassembly
> in §2a is byte-anchored and the golden reaches it by *executing* the block through the real
> `EclVm`, not by BFS — but the coverage figure must be quoted with its model.

---

## 10. Reproduce

```powershell
cd packages/engine; npx vitest run test/nwnQuestFlag.test.ts
```

*(Note: `pnpm --filter @goldbox/engine test -- nwnQuestFlag` runs the **whole** engine suite — pnpm
consumes the `--`, so the name is never applied as a vitest filter.)*

**The BFS coverage figures in §1 and §9.5** need `scan_block`'s COMPARE-outcome reset in addition to
`decode_one` / `header_entries` / `successors`; with the three primitives alone the corpus figure is
64.2 % and `ECL5.DAX#51` is 12.3 % with the console unreached. See the correction box in §1.
Reconstruct the walk in a scratch script — do **not** run either scanner's CLI, whose `--markdown` /
`--json` defaults point at checked-in files.

Raw-byte census (no repo files written; run from an arbitrary scratch directory):

```python
import sys; sys.path.insert(0, r'C:\Modding\GoldBox\tools')
import goldbox_corpus as gc
inv = gc.binary_inventory.inventory(gc.inventory_roots([]), recursive=False, max_depth=3,
                                    include_unprofiled=False)
routes = gc.load_routes()
files = gc.file_index(gc.choose_install(inv, 'neverwinter-nights-dos',
                                        routes.get('neverwinter-nights-dos')))
pat = bytes.fromhex('0901797f01c832')          # SAVE [0x7f79] -> [0x32c8]
for n in sorted(x for x in files if x.startswith('ECL')):
    for b in gc.read_dax_blocks(files[n]):
        i = b['raw'].find(pat)
        while i >= 0:
            print(n, b['block_id'], hex((i - 2 - 0x8000) & 0xffff))
            i = b['raw'].find(pat, i + 1)
```
