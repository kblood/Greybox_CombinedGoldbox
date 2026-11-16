# Neverwinter Nights (DOS/AOL) — `ending` leg

**Verdict: `structurally-absent`.** The retail DOS client of the AOL *Neverwinter Nights*
ships no terminal sequence: no final-confrontation block, no victory narration, no denouement,
and no script that ends the campaign rather than handing control back into the same 33-block
area graph. This is a proven negative of the same shape as Secret of the Silver Blades'
`wilderness` leg and NWN's own `wilderness` leg — a whole-corpus scanner zero from a scan that
demonstrably ran (with a positive control on four sibling titles that *do* have endings), plus a
file-inventory fact. §7 addresses the obvious counter-argument ("an ending exists and you simply
failed to find it") by enumerating **all 33 script blocks** and, via **two independent string
extractions** (§3), **111,316 decoded characters across 1,836 frames — 96,542 of them in the 1,409
unique strings — plus a second, instruction-aligned extraction of 1,980 frames** that recovers 258
strings the first one's shape filter rejects.

> **Correction (2026-08-05), after an independent reviewer re-measured this leg.** An earlier
> revision of this file claimed the string scan was **exhaustive**. It is not: it is a *filtered*
> scan, and its 85 %-letters filter demonstrably dropped a real hit (§3). The verdict
> `structurally-absent` is **unchanged and still holds** — the recovered hit is a villain
> congratulating another villain mid-campaign, not a player ending — but the word "exhaustive" was
> wrong and the claim "the substring `CONGRAT` occurs 0 times" was **false**. Both are corrected
> below rather than quietly dropped.

Everything below is static, byte-level work against the user's retail files. No DOSBox-X, no
native trace, no live browser wiring. Retail root:
`D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint\`
(`tools/goldbox_corpus.py` `NWN_ROOT` + `neverwinter-nights/neverwint`).

Engine golden: `packages/engine/test/nwnEndingRoute.test.ts`.

> **Revision history, corrected 2026-08-05 — this file previously got its own history backwards.**
>
> An earlier draft of this file asserted (a) that `ECL0#8` contains a `CONGRATULATIONS` at 0x94E6
> with a "MYTHKAR"/"dark prophecy" quotation, and (b) in §8 that the `GAME.OVR` victory prompt is
> "unreachable from any shipped script". The immediately preceding revision declared **both** false
> and stated as a hard fact that "NWN's script corpus contains **zero** occurrences of the substring
> `CONGRAT` anywhere".
>
> **Claim (a) was RIGHT and the retraction of it was WRONG.** `ECL0.DAX#8` really does carry
> `PRINT` @`0x94E6` (27 bytes, CFG-reachable from the block's own entries) whose inline operand at
> `0x94E7` decodes to **`"CONGRATULATIONS...  MYTHKAR...'"`**, and `0x9B15` carries
> `'CREATED THIS DARK PROPHECY, AND WHY.'`. The previous revision missed them because its string
> scanner requires ≥ 85 % letters-and-spaces and that string is 77.4 % (it is mostly ellipses and an
> apostrophe). The scanner never reported them, so the doc concluded they did not exist. **A
> negative produced by a filter is not a negative produced by the data**, and that is exactly the
> failure mode this leg exists to avoid. The `CONGRAT`-is-absent claim is **withdrawn** (§3).
>
> **Claim (b) was genuinely false** and its retraction stands: the victory prompt *is* reached, by
> `PROGRAM #7` / `PROGRAM #12`, which the shipped corpus executes 28 times each (§6).
>
> **The verdict does not change.** The recovered string is one villain congratulating another inside
> an overheard Zhentarim conversation in Luskan — its own neighbours in the same instruction stream
> are *"'GREETINGS, BAJYPH.  OUR CARAVANS GROW LARGER BY... TO PLAN... BELIEVE THAT"* /
> *"GREETH, THE GREEDY... WILL CONTINUE TO WIELD HIS POWERS ON OUR BEHALF."* — followed by
> `PROGRAM`, `CALL`, `EXIT` and then, from `0x9B57`, a run of `PICTURE`/`LOAD_MONSTER` ambush arms
> (67 reachable `LOAD_MONSTER` in the block). `ECL0#8`'s only reachable
> `NEWECL` target is block 6 (§2). It is a mid-campaign eavesdrop, not a denouement. But it is now
> counted as the **eleventh** predicate hit and quoted in full rather than being absent from the
> table.

---

## 1. Ground rules actually used (re-verified this pass, not assumed)

- **Addressing.** `vaddr = 0x7FFE + fileOffset`, i.e. `fileOffset = vaddr - 0x8000 + 2`.
  Every vaddr quoted below was produced by that rule and read back out of the retail bytes.
- **Dialect.** NWN is treated as a long-frame Gen1 title (`ECL_GEN1`). For this corpus the choice
  is **not discriminable and cannot affect this leg's result**: re-running the CFG walk of all 33
  blocks under `ECL_GEN1_SHORT` produces the *identical reachable-offset set for every block*,
  because **no CFG-reachable instruction in the whole NWN corpus is a `0x1D`, `0x22` or `0x2C`
  site** — the three opcodes the two dialects frame differently. Measured, not assumed: the
  reachable `0x1D`/`0x22`/`0x2C` census is empty. So a silent dialect desync is ruled out **as a
  cause of this leg's negative result**; it is not a proof that the long dialect is correct in
  general. That inherited claim comes from `neverwinter-nights-dos-eclinit.md`, not from here.
- **Text.** Gen1 inline ECL text is 6-bit packed (operand code `0x80`, one length byte, then `len`
  bytes of 6 bits/char MSB-first; value 0 terminates; 1–31 → ASCII+64; 32–63 verbatim). This is
  the engine's own `decodeEclString` (`packages/engine/src/ecl/disassemble.ts`) and is **not**
  NWN-specific — Pool of Radiance, CoAB, Secret and CoK all use it (§4 runs the same decoder on
  them). For this pass the decoder was re-implemented independently in Python and validated by
  re-encoding every recovered string and comparing bytes. **Corrected 2026-08-05:** the result is
  **1,827 of 1,836 byte-identical including the final partial byte, and 9 that match as a strict
  prefix** — the 9 are frames whose declared length byte is longer than the decoded text, i.e. the
  `0`-terminator lands before the end of the payload and the trailing bytes are not part of the
  string. **0 mismatches**, but "1,836 / 1,836 byte-identical" was the wrong way to say it and the
  golden asserted the same wrong number.
- **Descriptors.** `AND [0xC04F],#127 -> [0x4C02]` is a block's cell-descriptor mask (the two
  source operands appear in either order across the corpus — 32 of 33 blocks carry the idiom).
  The GEO descriptor plane is `raw[514:770]` indexed `y*16+x`.

  > **Corrected 2026-08-05 — the `128|d` rule as previously stated was too strong.** This bullet
  > read *"raw byte `128|d` means 'special cell, descriptor `d`'"*, which reads as if the high bit
  > were what makes a cell dispatchable. It is not, and §2's own overlay table contradicted it:
  > overlay `ECL5#51`'s descriptors **36 and 37 appear in `GEO0#1` as plain bytes** — 36 at (1,11),
  > 36 at (1,13), 37 at (4,0), no high bit at all — and in `GEO2#29` overlay `ECL7#79`'s descriptors
  > **7, 9 and 10 are the plain bytes 7, 9 and 10** at (15,7), (14,8), (14,5) while 8, 12, 15, 19,
  > 108, 114, 116, 121, 122, 124, 125 and 127 do carry the bit. **The honest rule is: any non-zero
  > descriptor-plane byte is dispatchable, and the high bit selects WHICH dispatch table a block
  > sends the cell to, not whether the cell dispatches at all.** `ECL0.DAX#1` is the worked example
  > — its `search_location` at `0x81F1` forks on the *raw* byte against `#129` (`COMPARE [0xC04F],
  > #129 / IF_LT GOTO 0x827C`): `< 129` runs the street-sign table at `0x8284`, `>= 129` runs the
  > doorway table at `0x8204`, and **both** index on the masked value `[0x4C02]`
  > (`docs/engine/research/nwn-town-route.md` §3). Golden test **C2** masks `v & 0x7f` on any
  > non-zero byte, which is correct under this rule and was *not* correct under the old one.

---

## 2. What the corpus actually is (all 33 blocks, exhaustively)

Six ECL archives, **33** script blocks; four GEO archives, **29** map blocks, every one 1026 bytes.

- ECL block ids present: **1–12, 14–30, 51, 59, 78, 79**.
- GEO block ids present: **1–12, 14–30**.
- There is no block 13, no 31–50, no 52–58, no 60–77, and **no `ECL4.DAX`, no `ECL6.DAX`, no
  `GEO4.DAX`–`GEO9.DAX` file at all** — checked by directory listing, not inferred.

**29 of the 33 blocks are ordinary areas**: each contains a self-referencing
`LOAD_FILES #<own id>,…` and a GEO block of the same id. The remaining four (**51, 59, 78, 79**)
contain **no `LOAD_FILES` at all**, which is exactly why no `GEO5`/`GEO7` exists.

> **This refutes the working hypothesis this leg was dispatched with.** `ECL5`/`ECL7` are *not*
> "non-map scripts, prime candidates for endgame or cutscene logic". Three of the four (51, 78, 79)
> are **map overlays for areas that ship their own GEO**. Each opens with the same descriptor-mask
> idiom a normal area uses and then dispatches on descriptors that exist in the *host* area's GEO
> — every dispatched descriptor, with no exceptions:
>
> | overlay | entered from (`NEWECL`) | hands back to | dispatches descriptors | all present in |
> | --- | --- | --- | --- | --- |
> | `ECL5#51` | `ECL0#1` @0x8798 / 0x92BF / 0x92C2 | `NEWECL #1` | 36, 37 | `GEO0#1` — 36 at (1,11) and (1,13); 37 at (4,0) |
> | `ECL7#78` | `ECL2#28` @0x910E / 0x91AC / 0x92C5 / 0x95BE | `NEWECL #28`, `#29` | 17, 19, 23, 26 | `GEO2#28` — 17@(7,11)=145, 19@(5,1)=147, 23@(14,4)=151, 26@(11,1)=154 |
> | `ECL7#79` | `ECL2#29`, 15 sites (e.g. @0x8ADC) | `NEWECL #28`, `#29` | 7,8,9,10,12,15,19,108,114,116,121,122,124,125,127 | `GEO2#29` — e.g. 114@(1,9)=242, 125@(1,3)=253, 108@(9,15)=236 |
>
> Both `ECL7` overlays additionally re-assert their host on entry: `ECL7#78 @0x801D
> COMPARE [0x4BF2],#28 / IF_EQ / GOTO 0x802B / NEWECL #28`, and `ECL7#79 @0x8014
> COMPARE [0x4BF2],#29 / IF_EQ / GOTO 0x8022 / NEWECL #29`. (`0x4BF2` = LastEclBlockId.)
>
> > **Retraction (2026-08-05) — the "all present in" column does NOT identify the host, and was
> > presented as if it did.** The claim *"every dispatched descriptor present in the host GEO"* is
> > true, and it is still worth having: it is what rules out these three blocks being free-standing
> > endgame scripts, and a single missing descriptor would have refuted the overlay reading. But it
> > is **non-discriminating for two of the three overlays**, because it gives the same answer under
> > the alternative it supposedly rules out. Re-measured against all **29** GEO blocks under the
> > `v & 0x7f` reading test C2 uses:
> >
> > | overlay | descriptors | GEO blocks that satisfy ALL of them |
> > | --- | ---: | --- |
> > | `ECL5#51` | 2 (36, 37) | **1 of 29** — `GEO#1` only (uniquely satisfied) |
> > | `ECL7#78` | 4 (17, 19, 23, 26) | **6 of 29** — `GEO#3, 12, 24, 25, 26, 28` |
> > | `ECL7#79` | 15 | **6 of 29** — `GEO#2, 3, 9, 10, 27, 29` |
> >
> > So only overlay 51's `{36, 37}` picks out its host, and even that only under the loose
> > (any-non-zero-byte) reading — under the strict `128|d` reading §1 used to state, **36 and 37 are
> > plain bytes and `GEO#1` satisfies neither**, i.e. the strict rule would have made the column say
> > 0 of 29 for the block whose host assignment is least in doubt. **What actually pins the host** is
> > not the descriptor sets: it is the on-entry `COMPARE [0x4BF2],#28 @0x801D` /
> > `COMPARE [0x4BF2],#29 @0x8014` guards quoted above, and the overlays' own `NEWECL #28`/`#29`
> > hand-backs (plus, for 51, `ECL0#1`'s `NEWECL #51` at `0x8798`/`0x92BF`/`0x92C2` and 51's
> > `NEWECL #1`). The descriptor column is corroboration — *consistent with* the host — not
> > identification, and golden test **C2** now says so and measures the 6 / 6 / 1 spread directly.
>
> Only **one** block in the entire corpus is *cutscene-shaped* — no `LOAD_FILES`, and the only
> block of the 33 with **no descriptor-mask idiom at all**: **`ECL5#59`**. Its `initial_entry` is
> **0x8018**, a `PRINTCLEAR` rather than a dispatch trampoline; it plays 30 consecutive
> `PRINT`/`PRINT_RETURN` beats beginning *"'I AM WILLO CLOVYR, AND I THANK YOU / FOR SAVING ME. …'"*
> and ends **@0x8440 `NEWECL #9`** — back to the block it was entered from (`ECL0#9 @0x9CE1
> NEWECL #59`). That is exactly the shape an ending block would take in this engine; there is
> exactly one of them; and it is a mid-campaign rescue scene, 24 blocks deep in a 33-block graph.

Per-block census. CFG-reachable from all five ECL header entries (`vm_run_1`, `search_location`,
`pre_camp_check`, `camp_interrupted`, `initial_entry`), both arms of every conditional explored;
**16,546 reachable instructions corpus-wide**:

| block | file | bytes | reach. ins | COMBAT | reachable `NEWECL` targets |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | ECL0 | 4808 | 452 | 6 | 2, 3, 4, 8, 12, 20, 27, 28, 51 |
| 2 | ECL0 | 4685 | 528 | 2 | 1, 5 |
| 3 | ECL0 | 5477 | 590 | 4 | 1, 24 |
| 4 | ECL0 | 4358 | 522 | 3 | 1, 9 |
| 5 | ECL0 | 5079 | 580 | 5 | 2, 6 |
| 6 | ECL0 | 4727 | 616 | 5 | 5, 7, 8 |
| 7 | ECL0 | 4150 | 473 | 6 | 6 |
| 8 | ECL0 | 7219 | 722 | 6 | 6 |
| 9 | ECL0 | 7547 | 707 | 12 | 4, 10, 59 |
| 10 | ECL1 | 6598 | 663 | 11 | 9, 11 |
| 11 | ECL1 | 3679 | 393 | 2 | 10, 12 |
| 12 | ECL1 | 7676 | 724 | 11 | 1, 11, 14, 15, 30 |
| 14 | ECL1 | 5668 | 620 | 8 | 10, 12 |
| 15 | ECL1 | 5639 | 546 | 7 | 12, 16 |
| 16 | ECL1 | 5858 | 532 | 6 | 15, 17, 21 |
| 17 | ECL1 | 6681 | 539 | 7 | 16 |
| 18 | ECL1 | 2844 | 419 | 2 | 19, 20 |
| 19 | ECL1 | 2392 | 374 | 2 | 18, 21 |
| 20 | ECL2 | 2474 | 398 | 2 | 18, 21, 22, 25 |
| 21 | ECL2 | 2408 | 388 | 2 | 16, 19, 20, 23 |
| 22 | ECL2 | 2604 | 377 | 2 | 20, 23 |
| 23 | ECL2 | 3061 | 412 | 2 | 21, 22 |
| 24 | ECL2 | 7662 | 590 | 4 | 3, 25 |
| 25 | ECL2 | 6113 | 506 | 6 | 20, 24, 26 |
| 26 | ECL2 | 7137 | 638 | 7 | 25 |
| 27 | ECL2 | 6939 | 802 | 7 | 1, 12 |
| 28 | ECL2 | 7676 | 656 | 2 | 1, 29, 78 |
| 29 | ECL2 | 7678 | 687 | 5 | 28, 79 |
| 30 | ECL3 | 4717 | 613 | 5 | 5, 12 |
| 51 | ECL5 | 5529 | 144 | 0 | 1 |
| 59 | ECL5 | 1124 | 67 | 0 | 9 |
| 78 | ECL7 | 2441 | 76 | 0 | 28, 29 |
| 79 | ECL7 | 5310 | 192 | 3 | 28, 29 |

**No block is a sink.** Every one of the 33 has at least one CFG-reachable `NEWECL`, every
`NEWECL` and `LOAD_FILES` operand is an **immediate** (zero dynamic targets corpus-wide), and every
target names a block id that ships. The shipped set is a deliberately self-contained subgraph, not
a truncated install with dangling exits.

**Block identities, read from each block's own decoded text** (place-name census over that block's
own strings, top hits; this is evidence, not an assumed ordering):

| block | dominant place names in its own text |
| ---: | --- |
| 1 | NEVERWINTER ×10, NASHER ×3 |
| 2 | NEVERWINTER ×5 |
| 3 | NEVERWINTER ×8 |
| 4 | NEVERWINTER ×3 |
| 5 | WINDYCLIFFS ×11 |
| 6 | PORT LLAST ×8, GALLANT PRINCE ×2 |
| 7 | GALLANT PRINCE ×2 |
| 8 | LUSKAN ×8, NEVERWINTER ×5, CARAVAN ×3 |
| 9 | CLOVYR ×5, MINE ×3 |
| 10 | CARAVAN ×3, BANE ×2 |
| 11 | TRIBOAR ×2, NASHER ×2 |
| 12 | TRIBOAR ×15 |
| 14 | KRAKEN ×2, NEVERWINTER ×2 |
| 15 | LONGSADDLE ×4, TRIBOAR ×3 |
| 16 | LONGSADDLE ×9 |
| 17 | ZHENTARIM ×3, LONGSADDLE ×2, BANE ×2 |
| 18–22 | *(no place name — unnamed maze/dungeon levels)* |
| 23 | NEVERWINTER ×1 |
| 24 | NEVERWINTER ×4, NIGHTSEDGE ×4 |
| 25 | NIGHTSEDGE ×7 |
| 26 | NIGHTSEDGE ×3, MAZE, CATACOMB |
| 27 | SEWER ×10, NEVERWINTER ×8, CEMETERY |
| 28 | KRAKEN ×6, TRISK ×3, UTHERAAL ×2, FORTRESS OF THE NORTH WIND |
| 29 | NEVERWINTER, MAZE, TOWER, DOCK |
| 30 | PORT LLAST ×8, GALLANT PRINCE ×2 |
| 51 | LUSKAN ×7, ZHENTARIM ×4, NASHER ×4, DOCK ×4 |
| 59 | LUSKAN ×3, CLOVYR ×2, HOSTTOWER |
| 78 | TRISK ×6, KRAKEN ×6, FORTRESS OF THE NORTH WIND ×2 |
| 79 | KRAKEN ×3, NASHER ×2, MAZE |

**None of these 33 is an ending.** The narrative apex of the shipped content is the Trisk /
Kraken-fortress cluster `{28, 29, 78, 79}`, and it points explicitly *past* the shipped data. At
`GEO2#29` cell **(1,9)** (raw descriptor byte **242** = `128|114`, dispatched by
`ECL7#79 @0x8083 COMPARE [0x4C02],#114 / IF_EQ / GOTO 0x8446`) two chained dragons are freed and
say, verbatim:

- **@0x8533** — *"'HE IS!' AGREES THE OTHER. 'THEY'VE BUILT A LARGE BASE BENEATH HIS CITY!'"*
- **@0x85F6** — *"THE DRAGONS THANK YOU, AND THE LARGER ONE ADDS, 'IF YOU WISH TO HELP LORD NASHER,
  YOU'D BEST HURRY. THE KRAKENS SAY THEY ARE ALMOST READY TO LAUNCH AN ATTACK FROM THEIR BASE
  BENEATH NEVERWINTER!'"*

and a beholder in the same block names it a third time, **@0x81A0** — *"'IT'S NOT LIKE WE HANDED
THEM BADGES TO OUR SECRET COMPLEX BENEATH NEVERWINTER, YOU KNOW!'"*

**That base is not in the shipped corpus.** No block depicts it, no descriptor leads to it, no
`NEWECL` names an id outside the shipped 33. The only outward edge from the Trisk cluster is
`ECL2#28`'s `NEWECL #1` — the ship home to Neverwinter. The end of the deepest chain is a return
ticket.

---

## 3. Evidence 1 — the corpus-wide text scan, and what it does and does not cover

### 3a. Two extractions, because one of them is filtered (corrected 2026-08-05)

**Extraction A — byte-position scan.** For **every byte position of every one of the 33
decompressed blocks** (not just CFG-reachable code) the scanner attempts a `0x80 <len>`
inline-string frame, 6-bit-unpacks it, and keeps frames that decode to English-shaped uppercase
text (≥6 chars, charset `[A-Z0-9 ,.'!?\-:;()/"&+*$%#@]`, **≥85 % letters/spaces**).

Result: **1,836 framed strings, 1,409 unique, 111,316 decoded characters in total** (96,542 of them
in the 1,409 unique strings — the earlier revision printed only the unique-string figure and
labelled it "all shipped script text", which double-undercounts).

**That last filter is not neutral, and it is why this section had to be rewritten.** A ≥85 % letters
threshold rejects any line that is mostly punctuation, and NWN's script is full of ellipses. It
rejected the corpus's one genuine `CONGRATULATIONS` (77.4 % letters). So extraction A is
**filtered, not exhaustive**, and any "zero occurrences" claim built on it alone is unsafe.

**Extraction B — instruction-aligned scan.** Independently: walk each block's CFG from all five
header entries (both arms of every conditional, no comparison ever evaluated) and take the `0x80`
operand that **terminates** each reachable instruction, applying **no shape filter at all**.

Result: **1,980 frames**, of which **258 are not accepted by extraction A** (78 of those 258 are
≥ 12 characters). Concrete examples of text that extraction A silently drops:
`"IT'S A FIGHT!"`, `"'DANGER!  DO NOT ENTER!'"`, `"SAYS 'IMPOUND AREA'."`,
`"WHICH CANDLE DO YOU BLOW OUT? (1-13)"`,
`"'DO YOU WISH TO BUY A GEM FOR 250 GOLD OR A JEWEL FOR 2200 GOLD?'"`.

The predicate below is applied to the **union of A and B**. Neither extraction subsumes the other:
A reaches bytes no CFG walk enters, B reaches strings A's shape filter rejects.

The ending-language predicate is a fixed list of **44 case-insensitive substrings** drawn from the
actual denouement vocabulary of this project's other Gold Box titles plus generic end-of-story
language (`CONGRATULATIONS`, `YOU HAVE WON`, `YOU WIN`, `VICTORY IS YOURS`, `TRIUMPHANT`, `THE END`,
`YOUR QUEST IS`, `QUEST IS COMPLETE`, `QUEST IS OVER`, `ADVENTURE IS OVER`, `IS AT AN END`,
`AT LAST`, `FOREVER`, `PEACE RETURNS`, `SAVED THE CITY`, `SAVED NEVERWINTER`, `CELEBRATION`,
`BANQUET`, `FEAST IN YOUR`, `IN YOUR HONOR`, `HAILED AS`, `HEROES OF`, `REWARD YOU`, `YOUR REWARD`,
`GRATEFUL`, `FAREWELL`, `GOODBYE`, `SONGS WILL BE SUNG`, `LEGEND`, `IS NO MORE`, … — the full list
is duplicated verbatim in the golden test).

**NWN: 11 hits** (corrected 2026-08-05 — the previous revision said 10 and was missing the last row,
because that row is only visible in extraction B), each quoted so a reader can check:

| block | byte off | term | the actual sentence |
| --- | --- | --- | --- |
| ECL0#1 | 0x0d5e | THE END | "…ITS WARM WATERS FLOW INTO **THE END**LESS, ICE-COLD SEA OF SWORDS." |
| ECL0#2 | 0x0d97 | GRATEFUL | "THERE.  WE'RE **GRATEFUL** FOR YOUR" |
| **ECL0#8** | **0x14e9** (vaddr `0x94E7`) | **CONGRATULATIONS** | **"CONGRATULATIONS…  MYTHKAR…'"** — a villain congratulating a villain; read in place below, and in the revision-history note at the top of this file |
| ECL1#12 | 0x13b0 | GRATEFUL | "'WELCOME TO TRIBOAR, ADVENTURERS. WE ARE **GRATEFUL** FOR YOUR HELP. …'" |
| ECL1#12 | 0x1bff | THE END | "…A SMALL WIRE WITH A RING ON **THE END** OF IT PROTRUDING FROM THE WALL…" |
| ECL1#15 | 0x13d2 | GRATEFUL | "…IN MOMENTS YOU'VE FREED THE **GRATEFUL** CAPTIVES." |
| ECL1#17 | 0x153a | THE END | "YOU ASCEND THE STAIRWAY AT **THE END** OF THE ROOM…" |
| ECL1#17 | 0x1687 | IS NO MORE | "…ALTHOUGH IT **IS NO MORE** THAN 3 FEET HIGH…" |
| ECL2#29 | 0x1151 | THE END | "…STICK TO THE PATH, OR THE MAZE WILL BE **THE END** OF YOU…" |
| ECL5#51 | 0x0332 | YOUR REWARD | "'YOU HAVE DONE WELL TO BRING THIS TO ME… HERE IS **YOUR REWARD**.'" |
| ECL5#51 | 0x0d5b | THE END | "AS YOU APPROACH **THE END** OF THE DOCK…" |

**Withdrawn 2026-08-05.** This paragraph previously read: *"Stated as an independent hard fact:
across all 1,409 unique strings the substring `CONGRAT` occurs 0 times."* **That is false and is
withdrawn.** `CONGRAT` occurs **once**, in `ECL0.DAX#8` at vaddr `0x94E7`, reached by a
CFG-reachable `PRINT` at `0x94E6` (27-byte instruction). Extraction A missed it because the string
is 77.4 % letters-and-spaces and A's shape filter demands ≥85 %.

What survives, and what it is worth:

- `YOU HAVE WON` **0**, `YOUR QUEST IS` **0**, `VICTORY IS YOURS` **0**, `QUEST IS COMPLETE` **0**,
  `QUEST IS OVER` **0** — re-verified over the **union** of A and B, so these are not filter
  artefacts.
- `CONGRATULATIONS` **1**, and it is **not** addressed to the party. Read in place, the surrounding
  `ECL0#8` frames are an overheard Zhentarim conversation in Luskan:
  `'GREETINGS, BAJYPH.  OUR CARAVANS GROW LARGER BY… TO PLAN… BELIEVE THAT'` →
  `'CONGRATULATIONS…  MYTHKAR…'` → `'GREETH, THE GREEDY… WILL CONTINUE TO WIELD HIS POWERS ON OUR
  BEHALF.'` → `'CREATED THIS DARK PROPHECY, AND WHY.'` (`0x9B15`). Immediately after the
  conversation, from `0x9B57` on, the block turns into `PICTURE` + `LOAD_MONSTER` ambush arms
  separated by `GOTO` — 67 reachable `LOAD_MONSTER` in this block — i.e. the scene ends in a
  *fight*, not a curtain call. `MYTHKAR` and `DARK PROPHECY` each occur exactly once corpus-wide,
  both here.
- `ECL0#8`'s only CFG-reachable `NEWECL` target is block **6** — it does not hand off to any
  terminal block, and no block in the corpus is terminal (§2).

So the honest statement is not "the corpus contains no congratulation" but **"the corpus contains
no congratulation directed at the player, and no victory/quest-completion language at all."**

---

## 4. The positive control (the predicate is not silently too narrow)

The **identical scanner and identical 44-term predicate**, run over four sibling Gen1 titles that
do have endings. All four store inline text in exactly the same 6-bit packing, so the same decoder
applies unchanged:

| title | strings scanned | predicate hits | representative real hit |
| --- | ---: | ---: | --- |
| Pool of Radiance | 1,937 | 17 | `ECL3.DAX#8` @0x0b24 "CONGRATULATIONS! YOUR QUEST IS OVER! TYRANTHRAXUS IS DEFEATED! PHLAN IS FREE! …" |
| Curse of the Azure Bonds | 2,495 | 12 | `ECL4.DAX#35` @0x095e "CONGRATULATIONS, YOU HAVE WON"; `ECL1.DAX#81` @0x1391 "AS A REWARD YOU ARE GIVEN THE KEYS TO THE CITY," / @0x13b8 "AND A GREAT FEAST AND PARADE ARE HELD IN YOUR HONOR." |
| Secret of the Silver Blades | 1,687 | 7 | `ECL1.DAX#16` @0x1135 "'YOU HAVE DONE ALL WE WISHED THAT YOU WOULD. YOU WILL BE HEROES HERE FOREVER. JOIN THE CELEBRATIONS. …'" |
| Champions of Krynn | 2,333 | 8 | `ECL1.DAX#17` @0x13b8 "CONGRATULATIONS ON RECOVERING THE DRAGON EGGS"; `ECL3.DAX#98` @0x0ca8 "YOU WILL BE HONORED IN SONG AND LEGEND FOREVER.'" |

On a corpus that contains an ending, the scanner lands on the ending. On NWN's — a corpus of
comparable size, 1,409 unique strings — it lands on nothing addressed to the party.

**Scope of this control, stated exactly (2026-08-05).** It establishes **one** thing: that the
44-term predicate is not too narrow to recognise a Gold Box ending when one is present. It does
**not** establish that extraction A is exhaustive — the sibling runs use extraction A only, with the
same ≥85 % shape filter, so their hit counts (17 / 12 / 7 / 8) are lower bounds too. That is
tolerable here because the control only has to fire, not to be complete — each sibling's *actual*
ending text is prose-shaped and does pass the filter, as the quoted hits show. The claim
"NWN's corpus contains no player-facing ending text" rests on the **union** of A and B (§3a), not on
this table.

> Honest note on how this control was obtained: the first attempt used a *plain-ASCII* string
> reader for the sibling titles and returned **zero strings for all four**, which would have been a
> broken control silently reported as a broken predicate. The cause was the reader, not the data
> (CoAB's ECL blocks contain no ASCII runs of length ≥12 at all). Re-running with the same 6-bit
> decoder NWN uses produced the table above. The failure is recorded because a control that returns
> zero is exactly the kind of thing that can be mistaken for a result.

---

## 5. Evidence 2 — file inventory: no `FINAL*.DAX`, in an engine that still knows the name

The install directory holds **36 entries, of which 35 are shipped game files** (corrected
2026-08-05 — the previous revision said "ships 36 files" and the golden asserted `length === 36`).
The 36th is **`CCFP.MOV`**, 16 bytes, contents `b'14 4 1\r\n15 4 1\r\n'`, mtime **2026** — an
ASCII config scribble written by the *runtime* on this machine, not part of the release. Nothing in
this section's argument turns on the difference, but a golden that pins 36 is pinning one local
side-effect file, so both the count and its composition are now stated explicitly.

There is **no `FINAL.DAX`, no `FINAL5.DAX`, no endgame archive of
any name.** `FINAL*` is the Gold Box convention for terminal artwork, and it is present in the
sibling installs on this machine (checked by `rglob`, not memory):

- Pool of Radiance — `POOLRAD\FINAL5.DAX`
- Pools of Darkness — `FINAL.ACF`, `FINAL.BMA`
- The Dark Queen of Krynn — `DISK3\FINAL.TLB`

And NWN's own overlay still contains the name. In `GAME.OVR` (375,300 bytes):

- file offset **0x4631F**: Pascal literal `\x03PIC`
- file offset **0x46323**: Pascal literal `\x05FINAL`
- file offset **0x46329**: Pascal literal `\x04.dax`

Counted over the whole overlay: **`\x03PIC` occurs 5 times; `\x05FINAL` occurs exactly once**, and
the byte sequence `FINAL` occurs exactly once anywhere in `GAME.OVR` and **zero times** in
`GAME.EXE`. The three literals sit 4 and 6 bytes apart, the spacing of an
`if (name=="PIC" || name=="FINAL") …; append ".dax"` comparison chain.

**Honest limit on this evidence.** Curse of the Azure Bonds, Secret of the Silver Blades and
Champions of Krynn all have endings and all ship **no** `FINAL*` file — they draw their endings
from ordinary `PIC*.DAX` / `BIGPIC*.DAX`. So "no `FINAL*.DAX`" is **not on its own** proof that
there is no ending, and it is not offered as such. It is the second, independent, inventory-level
corroboration, occupying exactly the role that "Secret's retail install ships no `WILDCOM.DAX` at
all" occupies in Secret's wilderness leg — and it is stronger than that precedent in one respect:
here the engine's own bytes still name the file that is missing.

---

## 6. The `GAME.OVR` victory prompt: located, reached, and shown not to be an ending

`GAME.OVR` contains one string that reads like a campaign-victory prompt:
**Pascal length byte 0x22 at file offset 0x4307, text at 0x4308: `"You've won. Save before quitting? "`.**
Its apparent counterparts `"You have been killed!"` / `"press enter to continue"` sit at 0x36D0.

The previous draft of this document claimed this string was unreachable from any shipped script.
**That is wrong.** The full path was disassembled this pass (16-bit x86, Capstone):

1. **ECL opcode dispatcher — `GAME.OVR` @0x48EF.** `mov al,[0xB577]` then a flat compare chain over
   ids **0x00 … 0x41** — exactly the Gen1/Gen2 ECL opcode range, one arm per opcode.
2. **@0x4B02: `3c 38  75 06  0e  e8 20 f8`** — `cmp al,0x38 / jne / push cs / call 0x432A`. Opcode
   **0x38 is `PROGRAM`**, so **`PROGRAM`'s handler is the function at 0x432A**.
3. **0x432A** evaluates its single ECL operand (`lcall 0x81:0x2a(1)` then `lcall 0x81:0x25(1)` —
   the operand-fetch pair, 45 and 65 call sites respectively across the handler region) into `al`,
   then dispatches ids 0x00…0x11.
4. Four of those arms funnel into one function:
   - **@0x43DF `3c 07 75 0a b0 00 50 0e e8 5a fe`** — `cmp al,7 → 0x4244(kind 0)`
   - **@0x44CB `3c 0c 75 09 b0 01 50 0e e8 6e fd`** — `cmp al,0x0C → 0x4244(kind 1)`
   - **@0x44D8 `cmp al,0x0D → 0x4244(kind 2)`**, **@0x44E5 `cmp al,0x0E → 0x4244(kind 3)`**
5. **0x4244(kind)** calls `0x4182(kind)`, which scans the kind's byte table for any non-zero entry
   (tables at DGROUP `0xE6D4`, `0xE7BC`, `0xE748`, `0xE830`; 115 = 0x73 entries each, 1-based; kind
   0's bound is the dynamic count at `[0xE578]`). If the table is entirely zero it **returns
   immediately**. Otherwise it zeroes the table and calls `0x404C(kind)`.
6. **0x404C(kind)** copies the kind's 115-byte table to the stack, polls a pointer device
   (`lcall 0x172:0x39` / `lcall 0x172:0x25` on an `FFFF,FFFF` struct), sends host messages
   (`lcall 0x403:0x203` with opcode 4, then opcode 7 on success), and when
   `lcall 0x98:0x34(kind, buffer)` returns non-zero it assigns the string at `cs:0x3637`
   (**@0x416E `bf 37 36 0e 57 9a c4 0e a5 06`** — the segment base for this function is 0xCD0, and
   `0xCD0 + 0x3637 = 0x4307`, the victory string) and calls `[0xE0BC]`.

So the prompt **is** reachable — and that makes the case *stronger*, not weaker, because of what
the ECL side does with it:

- `PROGRAM #7` occurs **28 times** in the CFG-reachable corpus; `PROGRAM #12` occurs **28 times**.
- **28 of 28** `PROGRAM #7` sites are immediately followed by `PROGRAM #12`.
- The pair occurs **exactly once in each of the 28 ordinary map blocks 2–30** (block 1 and the four
  overlays have none), inside the area-entry preamble.
- **26 of 28** are immediately preceded by `SAVE [0x4BCA],[0x32C8]`, itself guarded by
  `COMPARE [0x4BCA],[0x32C8] / IF_EQ / GOTO <past>` — the "the area id changed, resynchronise"
  idiom. The two exceptions (`ECL2#28` @0x812D, `ECL2#29` @0x80EA) are preceded by
  `SAVE #0,[0x32C9]`, the adjacent byte of the same variable.
- `PROGRAM #13` and `#14` (kinds 2 and 3) are **never** used by the shipped corpus. The corpus's
  complete `PROGRAM` immediate census is `{0:2, 2:4, 4:131, 5:39, 6:21, 7:28, 11:2, 12:28, 16:62,
  17:2}`.

A campaign ending cannot be something the engine attempts **once per map block, in 28 different
blocks, on every ordinary area transition**. Structurally this is the AOL shared-state/host-sync
layer — the same neighbourhood of `GAME.OVR` that carries `" opened a door."`,
`" doesn't wish to be followed."` and `"No host response"`, and whose five parallel 115-byte tables
are compared-and-broadcast by a common setter at 0x1EC07. *(That it is specifically the multiplayer
layer is an **inference**; what is proven is the call graph, the 28×2 ECL sites, their position in
the area-entry preamble, and the fact that the tables are all-zero-gated.)*

And even on the least favourable reading, the branch that prints `"You've won."` prints **only**
that one prompt: no narration, no `PICTURE`, no roster, no epilogue text. `GAME.OVR` and `GAME.EXE`
between them contain **zero** occurrences of `CONGRATULAT`/`congratulat`, `epilogue`/`Epilogue`,
`victory`/`Victory` or `THE END`; the three `Congratulations` strings that do exist are
`"Congratulations the party gains experience!"` (text at 0x46F3), `"Congratulations "` (0x471F) and
`"Congratulations..."` (0x2967C) — the post-combat XP award — and `"You have won the duel."` /
`"You have won."` (0x825C / 0x8273) are members of the combat-result string pool that also contains
`"You have fled."` and `"You have lost the fight."`. There is a *victory prompt*; there is no
*ending*.

**What remains genuinely unresolved:** what the four 115-entry activities *are*, and what
`lcall 0x98:0x34` decides. That could not be settled from static bytes and is not guessed here. It
does not change the verdict, because the verdict rests on there being no terminal sequence anywhere
— not on this prompt being unreachable.

---

## 7. The counter-argument, taken seriously

> *"An ending exists and you failed to find it."*

Five ways it could hide, and what closes each:

1. **A block I didn't look at.** All 33 are enumerated in §2 with size, reachable-instruction
   count, COMBAT count, `NEWECL` targets and an identity read from their own text. There is no
   34th block: `readDaxDataBlocks` over the six ECL archives yields exactly 33 entries, and no
   `ECL4`/`ECL6` file exists on disk.
2. **Text I couldn't read.** *(Rewritten 2026-08-05 — the previous version of this item was the
   single weakest claim in the document, and it was wrong.)* The 6-bit decoder is proven exact by a
   re-encode round-trip: **1,827 of 1,836 frames byte-identical, 9 strict-prefix, 0 mismatches**
   (§1). The byte-position scan covers **every byte offset**, not just reachable code, so dead and
   unreachable text is included — **but it applies an ≥85 % letters-and-spaces shape filter and
   therefore is not exhaustive.** It demonstrably dropped 258 strings that the instruction-aligned
   extraction recovers, including the corpus's one `CONGRATULATIONS`. This hole is closed by
   scanning the **union** of both extractions (§3a); 111,316 characters were read in extraction A
   alone. What remains genuinely open is text that is neither shape-passing nor terminating a
   CFG-reachable instruction — bounded, but not zero.
3. **A predicate too narrow to fire.** The same 44 terms fire on the genuine endings of four
   sibling Gen1 titles (§4). It is not a predicate that would miss "CONGRATULATIONS, YOU HAVE WON".
   Indeed on NWN it *did* fire on a `CONGRATULATIONS` — which is the point: the predicate works, and
   the one thing it caught is a villain's line inside an ambush scene, not a denouement.
4. **A block that ends the game by falling off the end of the graph.** There is no sink: all 33
   blocks have a reachable `NEWECL`, all targets are immediates, all targets ship (§2).
5. **An ending in the native binary rather than the scripts.** The one candidate string in the
   binary was found, its full call chain disassembled, and its 56 ECL call sites located and
   counted (§6). It is invoked once per map block on ordinary area entry, and carries no ending
   sequence.

---

## 8. What "the ending" would have been

For the record, so a future pass knows what is missing rather than merely that something is: the
shipped plot converges on the Kraken Society's *"large base beneath his city"* / *"secret complex
beneath Neverwinter"* (`ECL7#79` @0x81A0, @0x8533, @0x85F6). Three separate speakers name it, two
of them in the deepest area of the game. It is the obvious site of the final confrontation. **It
does not exist in this data set** — no GEO, no ECL, no descriptor, no `NEWECL`. If a fuller AOL
data set ever surfaces, that is where to look, and the absent id ranges 13, 31–50, 52–58, 60–77
are where its blocks would sit. *(That those slots were ever authored is an inference. What is
proven is only that they are absent and unreferenced.)*

---

## 9. Reproduce

```powershell
# corpus enumeration + extraction A (filtered byte scan) + ending predicate + per-block census
python <scratchpad>\nwnend\endscan.py
# positive control on POR / CoAB / Secret / CoK (6-bit decoder) + NWN round-trip
python <scratchpad>\nwnend\control2.py
# structural re-verification (graph closure, dialect non-discrimination, overlays, PROGRAM census)
python <scratchpad>\nwnend\verify.py ; python <scratchpad>\nwnend\verify2.py ; python <scratchpad>\nwnend\verify3.py
# extraction B (instruction-aligned, unfiltered) + A/B union predicate + the ECL0#8 scene
python <scratchpad>\nwn\endverify3.py
# engine golden (real retail bytes, not skipped when the data is present)
pnpm --filter @goldbox/engine test -- nwnEndingRoute
```

The scratchpad scripts are throwaway. The durable form of every structural assertion above is
`packages/engine/test/nwnEndingRoute.test.ts`, which reads the retail files directly.

**Two-implementation cross-check.** The per-block census in §2 was produced twice, independently:
once in Python via `tools/gen1_ecl_encounter_scan.py`'s `decode_one`/`successors`, and once in
TypeScript via the engine's own `decodeInstructionAt` inside the golden test. The two agree
**exactly** — 16,546 reachable instructions, identical per-block `NEWECL` target sets, identical
COMBAT counts, identical `PROGRAM` immediate census, identical `PROGRAM #7`/`#12` site counts. A
shared bug is still possible in principle (both walkers implement the same successor rules), but a
transcription or framing error in either is not.

---

## 10. Caveats

- **Static only.** No DOSBox-X, no native trace, no live browser route. Nothing here claims the
  game *runs* a particular way; it claims what the shipped bytes do and do not contain.
- **The string scan is filtered, not exhaustive** (added 2026-08-05). See §3a: extraction A's ≥85 %
  shape filter drops 258 real strings, and only the union with the instruction-aligned extraction B
  closes that. Any future re-use of `scanStrings` for an absence argument must scan the union.
- **The overlays' descriptor sets do not identify their host GEO** (added 2026-08-05). §2's
  "all present in" column is consistent with the host but non-discriminating: overlay 78's four
  descriptors are satisfied by 6 of 29 GEO blocks and overlay 79's fifteen by 6 of 29; only overlay
  51's `{36, 37}` is uniquely satisfied, and then only if the special-cell bit is ignored. The host
  assignment rests on the `COMPARE [0x4BF2],#28/#29` entry guards and the `NEWECL` targets. See the
  retraction box in §2.
- **GEO cell descriptors do not discriminate an ending** (added 2026-08-05). It is tempting to read
  "no distinguished terminal cell" off the map data, but descriptor bytes are dense and reused
  across every map — e.g. GEO0#1 uses 33 distinct descriptors, GEO2#28 uses 45, GEO2#29 uses 40 —
  and there is no descriptor value reserved corpus-wide for a campaign end. The map layer is
  therefore *silent* on this leg, neither supporting nor opposing it, and no claim in this document
  rests on it.
- **The dialect is not discriminated by this corpus** (§1). The negative result is dialect-proof
  because zero `0x1D`/`0x22`/`0x2C` sites are reachable, but "NWN is long-frame" remains inherited,
  not re-proven here.
- **The CFG walk explores both arms of every conditional** and does not evaluate comparisons. It is
  therefore an over-approximation of what actually runs: it may include instructions the real game
  never reaches. For a *negative* result that is the safe direction — a bigger reachable set can
  only make it harder to prove absence — but the per-block instruction counts are not "the
  instructions the game executes".
- **§6's "this is the AOL multiplayer layer" is an inference.** The byte facts are the call chain,
  the 115-byte all-zero-gated tables, the 28+28 ECL sites and their position in the area-entry
  preamble. What `lcall 0x98:0x34` decides is genuinely unresolved.
- **The `FINAL*.DAX` argument is corroborative, not decisive**, and §5 says so: three sibling
  titles have endings without shipping one.
- **§8's "the AOL world was larger" reading is an inference**, not a byte fact. The byte facts are
  the id-space gaps and the graph closure.
- **Block identities in §2 are read from each block's own text**, but the *ordering* of the campaign
  (which area is "late") is an inference from the `NEWECL` graph plus narrative content. The verdict
  does not depend on it: it depends on there being no ending anywhere, not on knowing which block
  is last.
- **Three dangling `PICTURE` ids.** Re-verified this pass: the CFG-reachable corpus issues 80
  distinct `PICTURE` immediates; `PIC.DAX` ships 78 blocks; the set difference is exactly
  `{50, 51, 52, 255}`, and 255 is the engine's own "no picture / clear" sentinel. So 50, 51 and 52
  are genuinely dangling. They are used for townsfolk portraits alongside a `[0x7EE1]` head-id
  write, so they most likely resolve against a different portrait family (`HEAD.DAX`/`CHEAD.DAX`)
  rather than indicating missing endgame art — that last part is an **inference**, not tested.
  Recorded because it is the one place the shipped art side is not self-contained; not used as
  evidence for the verdict.
