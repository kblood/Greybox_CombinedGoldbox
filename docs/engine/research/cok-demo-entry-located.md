# CoK's real `Play Demo` ECL entry block -- LOCATED, decoded in full

> Pure static research (COAB source study + structural byte-level disassembly of
> `Champions of Krynn/GAME.OVR` + direct Gen1 ECL bytecode decode of `ECL2.DAX`/`ECL1.DAX`).
> **No DOSBox-X, no GameLink, no live trace of any kind.** Continues
> `docs/engine/research/cok-demo-decompile.md` sec 6/7, whose raw `A3 8D` byte-pattern xref
> scan for CoK's own `load_ecl_dax`-analogue call sites was a proven dead end (4/4 false
> positives, recorded there so it isn't retried). This round instead ports the
> **structural function-shape + value-sequence matching** technique
> `docs/engine/research/gateway-newgame-route.md` Part 1 used successfully for Gateway to
> the Savage Frontier, and strengthens it with one additional, fully general disambiguator
> (`struct_field_confirmed_target`, below) because CoK's own literal constants turned out
> not to collide-disambiguate the same simple way Gateway's did. Tooling:
> `tools/map_cok_demo_entry.py`. Machine-checked evidence: `build/cok-demo-entry.json`
> (regenerate with `python tools/map_cok_demo_entry.py` from `tools/`).

## TL;DR

1. **CoK's own literal `EclBlockId` constants are now located, byte-verified, and
   self-check-validated: demo = `57` (`0x39`), new-game = `36` (`0x24`).** This closes the
   open item `cok-demo-decompile.md` §6 left UNLOCATED.
2. **Block 36 (`ECL1.DAX`) is CONFIRMED to be CoK's ordinary new-game opening, not the
   demo.** This settles the (a)/(b) ambiguity `cok-demo-decompile.md` §7.6 could only argue
   about from content shape alone -- reading (b) is now **proven**, not just better
   supported.
3. **Block 57 (`ECL2.DAX`) is a brand-new find: a dedicated, self-contained, purely linear
   attract-mode script** -- narration text, three named temporary NPCs recruited via
   `ADD_NPC` (**Sir Ringwald**, **Lyn Swiftfoot**, **Varianna** -- not Sir Karl Gaardsen,
   who belongs only to the normal opening), a scripted "approach" animation, then a real
   `LOAD_MONSTER`x3 + `COMBAT` (2 Green Dragons + 4 Bozak draconians + 6 Zombies), then a
   closing tagline ("...TO BECOME THE CHAMPIONS OF KRYNN.") and `EXIT`. Its other 4 header
   slots (`vm_run_1`, `search_location`, `pre_camp_check`, `camp_interrupted`) are all
   trivial one-byte `EXIT` stubs -- the whole block is nothing but this one linear script,
   consistent with "a self-contained attract-mode cutscene," not an area players actually
   inhabit. **This is very close to the user's original memory**: an explicit scripted
   walkthrough (narration + a taste of "explore cities"/"find shops") ending in automatic
   combat.
4. **One genuine, honestly-flagged open question remains**: block 57 lives in `ECL2.DAX`
   (CoK's own "area 2" file, per the already-established file/block-range table), which
   means CoK's *own* resident boot-loop must set `game_area=2` before loading the demo --
   the exact opposite of the CoAB-family assumption this project inherited (`inDemo` forces
   `game_area=1`). That native assignment lives in `START.EXE`'s resident segment, which
   this project's tooling (`disasm_cok.py`, and this round's structural matcher) cannot
   reach -- **still UNLOCATED**, see §5.

---

## 1. Method: structural match, then a stronger disambiguator

### 1.1 Step 1 -- locate CoK's own `sub_29758` analogue by function shape

Reused unmodified: `map_gateway_ecl_runtime_candidates.function_shapes`/`best_match`
(instruction-mnemonic+operand-kind token sequences, `SequenceMatcher` ratio + trigram
Jaccard -- these helpers are generic over any FBOV `GAME.OVR` byte blob despite the module
name; nothing Gateway-specific in their logic). CoK's own `GAME.OVR` starts with the same
`FBOV`+`uint32 body_size` 8-byte header as CoAB's and Gateway's, so file offsets are
directly comparable, matching this project's existing convention
(`disasm_cok.py`'s own `COMBAT_OVERLAY_BASE` computation already assumes/uses raw file
offsets the same way).

| | CoAB (`GAME.OVR`, oracle symbol `sub_29758`) | CoK (`GAME.OVR`, structural match) |
| --- | --- | --- |
| Function offset | `0x4061` (16481) | `0x4594` (17812) |
| Function size | -- | 776 bytes |
| Sequence similarity | -- | `0.8869` |
| Trigram Jaccard | -- | `0.7785` |

### 1.2 Step 2 -- why plain value-sequence matching (Gateway's disambiguator) is
### ambiguous for CoK, and the stronger fix

`map_gateway_newgame_route.boot_dispatch_constants` disambiguates the right
`mov byte ptr [addr], imm8` write-group inside the matched function by requiring its
value *sequence* to equal CoAB's own literal `(0x52, 1)`. Run as-is against CoK, this
returns `gateway_ambiguous_matches: true` -- CoK's own compiled values are (correctly,
expectedly) **not** `(0x52, 1)` (title-specific literal data), and three *different*
2-write groups inside the matched function happen to share that same shape:

```
byte ptr [0x8856] -> (1, 0)
byte ptr [0x4b49] -> (4, 3)
byte ptr [0x8846] -> (57, 36)      <-- the real one
```

So this round adds a second, fully independent, **value-content-free** disambiguator
(`tools/map_cok_demo_entry.py`'s `struct_field_confirmed_target`): both CoAB's own
`sub_29758` and the CoK candidate open with the identical idiom

```
les di, ptr [P]
cmp word ptr es:[di + X], 0
jne <continuing-game path>
```

(testing `gbl.area_ptr.LastEclBlockId == 0` -- CoAB source,
`coab_extracted/engine/seg001.cs:2230-2299`), and later, in the "continuing game" arm,
repeat the *same* `P`/`X` pair to copy that one struct field into the target address:

```
les di, ptr [P]
mov al, byte ptr es:[di + X]
mov byte ptr [ADDR], al
```

`ADDR` recovered this way is provably the `EclBlockId` location, independent of any
assumption about the literal values written elsewhere in the function. Applied to CoAB
first as a **self-check** (does this reproduce the already-known `0x8b78`/`(0x52,1)`
answer before trusting it on CoK?):

| | CoAB oracle | CoK candidate |
| --- | --- | --- |
| `P` (struct pointer) | `[0x4fb2]` | `[0x4b28]` |
| `X` (field offset) | `es:[di + 0x1e4]` | `es:[di + 0x1e4]` (identical numeric offset) |
| Confirmed `ADDR` | `byte ptr [0x8b78]` | `byte ptr [0x8846]` |
| Instruction index of the confirming idiom | 29 | 29 (identical position) |
| Value sequence at `ADDR` | `(0x52, 1)` | `(57, 36)` |
| Self-check: reproduces known CoAB pair | **`true`** | n/a |

The self-check passes exactly (`coab_self_check_reproduces_0x52_1_pair: true` in
`build/cok-demo-entry.json`), and the field offset `0x1e4` is byte-identical between CoAB
and CoK (the shared `area_ptr`/party struct layout is apparently compiled identically
across at least these two `gen1-fbov` titles, a side observation not otherwise needed
here) -- strong corroboration this is the same struct field, not a coincidental match.
`ADDR=0x8846`'s write-group is the **only** one of CoK's 14 candidate groups gated behind
this exact idiom, so the result is unambiguous by construction (no threshold/heuristic
tie-break needed).

**Result: CoK's own literal `EclBlockId` constants are `57` (demo) and `36` (new-game),
in program order matching CoAB's own `(demo, new-game)` ordering exactly** (same
`cmp [inDemoFlagCandidate],0 / je <new-game-write>` shape -- see full disassembly excerpt
below).

### 1.3 Full disassembly excerpt (CoK, `GAME.OVR+0x4594`, instructions 7-31 of 235)

```
 7 0x0045a8: mov byte ptr [0x713a], 1
 8 0x0045ad: mov byte ptr [0x884c], 0
...
13 0x0045c6: mov byte ptr [0x8856], 1
14 0x0045cb: mov byte ptr [0x4b49], 4
...
16 0x0045d5: les di, ptr [0x4b28]
17 0x0045d9: cmp word ptr es:[di + 0x1e4], 0
18 0x0045df: jne 0x4608                     -- "continuing game" (area_ptr->LastEclBlockId != 0)
19 0x0045e1: mov byte ptr [0x8856], 0
20 0x0045e6: cmp byte ptr [0x4b4b], 0        -- CoK's own inDemo-candidate flag
21 0x0045eb: je 0x45f4                       -- [0x4b4b]==0 (not demo) -> jump to new-game write
22 0x0045ed: mov byte ptr [0x8846], 0x39     -- [0x4b4b]!=0 (demo) -> EclBlockId = 57
23 0x0045f2: jmp 0x4606
24 0x0045f4: mov byte ptr [0x8846], 0x24     -- EclBlockId = 36 (new game)
25 0x0045f9: push word ptr [0x6098]
26 0x0045fd: push word ptr [0x6096]
27 0x004601: lcall 0xe6, 0x2a
28 0x004606: jmp 0x4614
29 0x004608: les di, ptr [0x4b28]            -- "continuing game": reuse stored area_ptr field
30 0x00460c: mov al, byte ptr es:[di + 0x1e4]
31 0x004611: mov byte ptr [0x8846], al       -- EclBlockId = area_ptr->LastEclBlockId
```

This is structurally byte-for-byte the same shape as CoAB's own `sub_29758` (compare
`gateway-newgame-route.md` Part 1's CoAB excerpt, or `build/cok-demo-entry.json`'s
`coab_struct_field_confirm`), differing only in the compiled addresses and the two
title-specific literal bytes `0x39`/`0x24`.

---

## 2. Where the two literal block IDs actually live

Determined empirically from each install's own DAX table-of-contents (`goldbox_corpus.
read_dax_blocks`), not assumed from file numbering:

| Block ID | File | Content |
| ---: | --- | --- |
| `36` (new-game) | `ECL1.DAX` | CoK's real opening narration ("AT THE INN OF THE LAST HOME IN SOLACE..."), already decoded in `cok-demo-decompile.md` §2.4/§7.3 -- **now proven to be the literal new-game entry, not merely plausible.** |
| `57` (demo) | `ECL2.DAX` | **New this session** -- a dedicated, self-contained attract script, decoded in full below. |

---

## 3. The real demo script, decoded in full (`ECL2.DAX` block 57, `initial_entry`)

Block 57 is 1096 bytes. Its header has 5 entry slots; **4 of the 5 are trivial one-byte
`EXIT` instructions** (`vm_run_1`@1093, `search_location`@1094, `pre_camp_check`@1091,
`camp_interrupted`@1092) -- this block has no other reachable content besides
`initial_entry`@22, confirming it is a one-shot linear cutscene, not a persistent area a
player can re-enter or search. `initial_entry` itself has **zero conditional branches** --
one straight-line path from start to `EXIT`, decoded completely below (offsets are file
offsets into the raw block; `vaddr` is the ECL-VM virtual address
`offset_to_vaddr(offset, 0x8000)`, per `gen1_ecl_encounter_scan`'s established convention).

```
   22 (0x8014) SAVE #1 -> [1:0x4be7]
   28 (0x801a) SAVE #1 -> [1:0x4be8]
   34 (0x8020) LOAD_FILES #64, #2, #255
   41 (0x8027) LOAD_PIECES #19, #20, #255
   48 (0x802e) SAVE #2 -> [1:0x4bfc]
   54 (0x8034) SAVE #10 -> [1:0x4bfe]
   60 (0x803a) SAVE #13 -> [1:0xc04b]
   66 (0x8040) SAVE #5 -> [1:0xc04c]
   72 (0x8046) SAVE #3 -> [1:0xc04d]
   78 (0x804c) SAVE #22 -> [1:0x4bc9]
   84 (0x8052) SAVE #8 -> [1:0x4bfd]
   90 (0x8058) SAVE #5 -> [1:0x03de]
   96 (0x805e) CLEAR_BOX
   97 (0x805f) PICTURE #70
  100 (0x8062) PRINTCLEAR "EVEN WITH THE DEFEAT OF THE DRAGONARMIES,"
  134 (0x8084) PRINT " EVIL NEVER RESTS ..."
  153 (0x8097) DELAY
  154 (0x8098) DELAY
  155 (0x8099) ADD_NPC #60, #100          -- creature id 60 = SIR RINGWALD (MON2CHA.DAX), control_morale=100
  160 (0x809e) ADD_NPC #62, #100          -- creature id 62 = VARIANNA
  165 (0x80a3) ADD_NPC #61, #100          -- creature id 61 = LYN SWIFTFOOT
  170 (0x80a8) PRINTCLEAR "YOUR HEARTY BAND OF ADVENTURERS HAVE BEEN "
  205 (0x80cb) PRINT "SUMMONED TO RID THE LAND OF THIS EVIL AND PREVENT THE "
  249 (0x80f7) PRINT "DARK QUEEN FROM BECOMING THE UNDISPUTED RULER OF KRYNN."
  294 (0x8124) DELAY x4
  298 (0x8128) CALL [1:0x2e10]            -- native "system call", semantics not decoded this session
  302 (0x812c) PRINTCLEAR "EXPLORE CITIES ..."
  319 (0x813d) GOSUB [1:0x8420]           -- local subroutine at 0x8420 (see body below)
  323 (0x8141) SUBTRACT #1, [1:0xc04b] -> [1:0xc04b]
  332 (0x814a) GOSUB [1:0x8420]
  336 (0x814e) SAVE #0 -> [1:0xc04d]
  342 (0x8154) GOSUB [1:0x843b]           -- sibling subroutine at 0x843b (see body below)
  346 (0x8158) SUBTRACT #1, [1:0xc04c] -> [1:0xc04c]
  355 (0x8161) GOSUB [1:0x8420]
  359 (0x8165) SAVE #3 -> [1:0xc04d]
  365 (0x816b) GOSUB [1:0x843b]
  369 (0x816f) SUBTRACT #1, [1:0xc04b] -> [1:0xc04b]
  378 (0x8178) GOSUB [1:0x8420]
  382 (0x817c) SUBTRACT #1, [1:0xc04b] -> [1:0xc04b]
  391 (0x8185) GOSUB [1:0x8420]
  395 (0x8189) SAVE #69 -> [1:0x7ee1]
  401 (0x818f) PICTURE #68
  404 (0x8192) SAVE #255 -> [1:0x7ee1]
  410 (0x8198) PRINTCLEAR "FIND SHOPS WHERE YOU MAY PURCHASE"
  438 (0x81b4) PRINT "EQUIPMENT TO AID IN YOUR ADVENTURE."
  468 (0x81d2) DELAY x4
  472 (0x81d6) SAVE #11 -> [1:0x4bfd]
  478 (0x81dc) SAVE #4 -> [1:0x4bc9]
  484 (0x81e2) CALL [1:0x2e10]
  488 (0x81e6) DELAY
  489 (0x81e7) SAVE #1 -> [1:0xc04d]
  495 (0x81ed) GOSUB [1:0x843b]
  499 (0x81f1) ADD #1, [1:0xc04b] -> [1:0xc04b]
  508 (0x81fa) GOSUB [1:0x8420]
  512 (0x81fe) ADD #1, [1:0xc04b] -> [1:0xc04b]
  521 (0x8207) GOSUB [1:0x8420]
  525 (0x820b) ADD #1, [1:0xc04d] -> [1:0xc04d]
  534 (0x8214) GOSUB [1:0x843b]
  538 (0x8218) ADD #1, [1:0xc04c] -> [1:0xc04c]
  547 (0x8221) GOSUB [1:0x8420]
  551 (0x8225) ADD #1, [1:0xc04c] -> [1:0xc04c]
  560 (0x822e) GOSUB [1:0x8420]
  564 (0x8232) ADD #1, [1:0xc04d] -> [1:0xc04d]
  573 (0x823b) GOSUB [1:0x843b]
  577 (0x823f) SUBTRACT #1, [1:0xc04b] -> [1:0xc04b]
  586 (0x8248) GOSUB [1:0x8420]
  590 (0x824c) PICTURE #116
  593 (0x824f) PRINTCLEAR "HOWEVER, YOUR GOAL IS TO FIND EVIL AND STOP ITS "
  632 (0x8276) PRINT "PLANS FOR THE DOMINATION OF KRYNN."
  661 (0x8293) DELAY x4
  665 (0x8297) SAVE #6 -> [1:0x4bc9]
  671 (0x829d) SAVE #7 -> [1:0xc04b]
  677 (0x82a3) SAVE #8 -> [1:0xc04c]
  683 (0x82a9) SAVE #0 -> [1:0xc04d]
  689 (0x82af) CLEAR_BOX
  690 (0x82b0) PICTURE #59
  693 (0x82b3) PRINTCLEAR "BE EVER WATCHFUL, BECAUSE YOU NEVER KNOW WHEN EVIL "
  735 (0x82dd) PRINT "WILL STRIKE."
  747 (0x82e9) DELAY x4
  751 (0x82ed) CALL [1:0x2e10]
  755 (0x82f1) SETUP_MONSTER #10, #2, #10       -- creature id 10 (MON2CHA.DAX) = GREEN DRAGON, count 2, pic 10
  762 (0x82f8) GOSUB [1:0x8424]                 -- second entry point into the SAME subroutine block as 0x8420 (see body below)
  766 (0x82fc) APPROACH
  767 (0x82fd) GOSUB [1:0x8424]
  771 (0x8301) APPROACH
  772 (0x8302) CALL [1:0x6803]   x12          -- 12x, one per "approach" animation frame (inferred)
  820 (0x8332) CLEARMONSTERS
  821 (0x8333) SAVE #95 -> [1:0x7ec6]
  827 (0x8339) SAVE #2 -> [1:0x7ecb]
  833 (0x833f) LOAD_MONSTER #10, #2, #10        -- 2x GREEN DRAGON
  840 (0x8346) LOAD_MONSTER #4, #4, #4          -- 4x BOZAK (MON2CHA.DAX #4)
  847 (0x834d) LOAD_MONSTER #31, #6, #31        -- 6x ZOMBIE (MON2CHA.DAX #31)
  854 (0x8354) COMBAT
  855 (0x8355) PICTURE #23
  858 (0x8358) PRINTCLEAR "BEAUTY AND DANGER ABOUND IN THE LANDS OF KRYNN ..."
  899 (0x8381) CALL [1:0x6803]   x12
  947 (0x83b1) PRINTCLEAR "THE DRAGONARMIES AWAIT."
  968 (0x83c6) PRINT_RETURN
  969 (0x83c7) PRINT_RETURN
  970 (0x83c8) PRINT "SO GO FORWARD AND DEFEAT THIS NEW THREAT "
 1004 (0x83ea) PRINT "TO BECOME THE CHAMPIONS OF KRYNN."
 1032 (0x8406) DELAY x4
 1036 (0x840a) SAVE #1 -> [1:0x7f12]           -- game_area = 1 (see §5 -- written by the SCRIPT, not native code)
 1042 (0x8410) SAVE #0 -> [1:0x4be7]
 1048 (0x8416) SAVE #0 -> [1:0x4be8]
 1054 (0x841c) PROGRAM #3                       -- native "PROGRAM" opcode 0x38, semantics not decoded this session
 1057 (0x841f) EXIT
```

### 3.0a The two shared local subroutines (`GOSUB` targets), decoded

Two `GOSUB` targets are reused several times above; both are ordinary local subroutines
inside the same block (not cross-file), and one of them (`0x8420`/`0x8424`) is entered at
*two different points* -- the same "multiple entry points into one shared bytecode blob"
convention `cok-demo-decompile.md` sec 7.2 already documented for block 16's 5 header
slots, just used here for a local subroutine instead of header-level entries:

```
0x8420: CALL [1:0x2e10]
0x8424: CALL [1:0xb203]            -- GOSUB 0x8424 enters HERE, skipping the CALL 0x2e10 above
        SAVE #0 -> [1:0x4bfc]
        DELAY
        SAVE #2 -> [1:0x4bfc]
        CALL [1:0xb203]
        DELAY
        RETURN

0x843b: CALL [1:0x2e10]
        DELAY
        RETURN
```

**Every `PRINT`/`PRINTCLEAR` string above was decoded from the actual packed 6-bit text
bytes** (the same codec `dqk_ca03_stream_decode.decode_ecl_string`/`cok-demo-decompile.md`
§7.1 already verified), not inferred or guessed.

### 3.1 NPC/monster identity, decoded from CoK's own `MON2CHA.DAX`

`ADD_NPC`'s first operand and `LOAD_MONSTER`'s first operand are both creature-record IDs
into that area's `MON{n}CHA.DAX` (block-id-indexed, length-prefixed ASCII name at the
record's first byte -- `goldbox_corpus.decode_record_name`, an existing, already-used
project primitive, not new this session):

| Opcode | Operands | `MON2CHA.DAX` id | Decoded name |
| --- | --- | ---: | --- |
| `ADD_NPC` | `#60, #100` | 60 | **SIR RINGWALD** |
| `ADD_NPC` | `#62, #100` | 62 | **VARIANNA** |
| `ADD_NPC` | `#61, #100` | 61 | **LYN SWIFTFOOT** |
| `LOAD_MONSTER` | `#10, #2, #10` | 10 | **GREEN DRAGON** x2 |
| `LOAD_MONSTER` | `#4, #4, #4` | 4 | **BOZAK** x4 |
| `LOAD_MONSTER` | `#31, #6, #31` | 31 | **ZOMBIE** x6 |

**These are a distinct, purpose-built demo party -- not Sir Karl Gaardsen** (who is named
only in block 36's narration text, with zero `ADD_NPC` calls anywhere in that block, per
`cok-demo-decompile.md` §7.6). This cleanly resolves the doc's own open question: the demo
party and the normal-game opening companion are two different, non-overlapping pieces of
authored content, exactly as reading (b) implied but could not prove.

The scripted battle (2 Green Dragons + 4 Bozak draconians + 6 Zombies against a 3-person
party) is a large, dramatic showcase fight -- consistent with "attract-mode spectacle,"
not a fair/winnable-by-design encounter. Per `cok-demo-decompile.md` §2.3 (already COAB-
sourced, unchanged by this session), `inDemo` skips post-combat XP/treasure bookkeeping and
the "Continue Battle?" prompt, and the same `control_morale`/`quick_fight` AI dispatch
(§3 of that doc) governs how these three temporary PCs and 12 monsters fight -- nothing
about that mechanism needed to change; this session only supplies the *actual* roster
lines and narration text it was missing.

### 3.2 What's still not decoded (native/system calls)

Several instructions call into native (non-ECL) engine code rather than continuing in
this block's own bytecode: `CALL [1:0x2e10]` (repeats through the sequence -- looks like a
generic "flush/redraw and pause" system call given its placement right before/around
`DELAY`s), `CALL [1:0x6803]` (issued 12 times in a row, twice -- almost certainly one
"advance the approach animation one frame" call per invocation, an **inference** from
placement/repetition, not from decoding the call target itself), `CALL [1:0xb203]` (inside
the two `GOSUB 0x8424`/`0x8420` helper subroutines, alongside `SAVE`s to `[0x4bfc]`
toggling between values `0`/`2`), and the final `PROGRAM #3` (opcode `0x38`, whose
semantics were not investigated this session). None of these are opaque in a way that
blocks understanding the script's *content* (narration, roster, combat) -- they are almost
certainly presentation/pacing helpers -- but their exact native behavior is honestly
**UNLOCATED** and would need either a CoAB switch_var cross-reference pass or a live trace
to pin down precisely.

---

## 4. Cross-check: `ECL1.DAX` block 36 (new-game) reproduces prior findings exactly

Re-running the same decode pipeline against block 36 reproduces
`cok-demo-decompile.md` §2.4/§7.3's already-published content byte-for-byte (same text,
same `NEWECL 16` chain target, same offsets) -- included here as a self-consistency check
on this session's own tooling, not a new finding:

```
   22 LOAD_FILES #127, #127, #127
   29 PICTURE #112
   32 PRINTCLEAR "AT THE INN OF THE LAST HOME IN SOLACE, A BRAVE "
   71 PRINT "BAND GATHERS IN PREPARATION FOR A GRIM JOURNEY. "
  110 PRINT "THE LANDS RECONQUERED FROM THE DRAGONARMIES ARE TO "
  152 PRINT "BE SCOURED OF THE LAST VESTIGES OF EVIL..."
  187 GOSUB [1:0x815c]
  191 PRINTCLEAR "JOINING YOU ON THE TRIP IS AN OLDER KNIGHT OF "
  229 PRINT "THE ROSE. HE IS INTRODUCED AS SIR KARL GAARDSEN. "
  269 PRINT "HIS MISSION IS TO EVALUATE THE OUTPOSTS FOR THE "
  308 PRINT "COUNCIL OF KNIGHTS."
  326 GOSUB [1:0x815c]
  330 SAVE #36 -> [1:0x4bf2]
  336 SAVE #1  -> [1:0x7f12]        -- game_area = 1 (matches ECL1.DAX's own area number)
  342 CLEAR_BOX
  343 NEWECL #16
```

Following `NEWECL 16` continues into block 16 (already fully decoded in
`cok-demo-decompile.md` §7.3: "did we arrive from block 36?" branch -> "AN OUTPOST... THE
PARTY TRAVELS THROUGH SOLAMNIA AND ARRIVES NEAR THROTL" -> `NEWECL 17`), and from there
into block 17 (the outpost/Throtl script), which loops back toward block 16 -- the tool
detects and stops at that revisit, matching the earlier hand-traced chain exactly.

---

## 5. Open question: the demo's `game_area` value (native code, still UNLOCATED)

Block 57 lives in `ECL2.DAX` (area 2), so **something** must set `game_area=2` natively
before `load_ecl_dax(57)` runs, or the loader would look in `ECL1.DAX` and fail to find
block 57. `cok-demo-decompile.md` (following the CoAB-family assumption) previously
recorded "`inDemo` forces `game_area=1`" -- that was a **COAB-source-only** claim
(`coab_extracted/engine/seg001.cs PROGRAM()`), never independently confirmed for CoK, and
this session's new evidence makes clear it **cannot** be literally true for CoK's demo
(area 1 doesn't contain block 57).

The necessary resolution -- **(inferred, not disassembled)** -- is that CoK's own resident
boot loop (the `PROGRAM()` analogue) must set `game_area=2` for `inDemo` and `game_area=1`
for the normal new-game path, i.e. **the reverse of CoAB's own literal `1`/`2` assignment**,
consistent with everything directly observed this session:
- New-game block 36 lives in `ECL1.DAX` and its own bytecode confirms/re-asserts
  `SAVE #1 -> [0x7f12]` (game_area=1) right before its `NEWECL 16` (§4).
- Demo block 57 lives in `ECL2.DAX`, and its own bytecode explicitly re-asserts
  `SAVE #1 -> [0x7f12]` (game_area=**1**, not 2) right at the very end, just before `EXIT`
  (§3, offset 1036) -- i.e. the *script itself* resets `game_area` back to 1 once it's
  done, which only makes sense if it started at something other than 1 (almost certainly
  2, to have been loadable at all).

This is a strong, self-consistent inference, but the actual native assignment lives in
`START.EXE`'s resident segment (not `GAME.OVR`'s FBOV overlay pool), which neither
`disasm_cok.py` nor this session's structural matcher can reach (documented limitation,
`cok-demo-decompile.md` §1.2's caveat and §5 item 3). **Genuinely UNLOCATED**; a follow-up
would need a generic 16-bit real-mode disassembler pointed at `START.EXE`'s own resident
code (not its FBOV thunk table), or a live DOSBox-X trace capturing `game_area`'s value at
the moment `load_ecl_dax` is called during a demo boot.

---

## 6. Cross-check against the live reimplementation (`apps/web/src/ui/demo.ts`, read but
## not edited per this task's scope)

`demo.ts`'s doc comment currently says: "the original's exact walked path... is not
proven -- the doc left the literal demo-entry `EclBlockId` constant UNLOCATED... so this
stays a representative auto-walk of the genuine map, not a byte-replay." That premise is
now **outdated** -- the constant is located and the full script is decoded. Concretely,
the current implementation differs from the real mechanism in every load-bearing way:

| Aspect | `demo.ts` today | Real mechanism (this doc) |
| --- | --- | --- |
| Driving mechanism | Generic wall-follower (`autoStep`) over the live-explored real GEO map, turning on collision | A **dedicated, purely linear ECL script** (block 57) with no map-walking at all -- no `GEO` cell traversal, just `PRINT`/`PICTURE`/`DELAY` narration beats |
| Party | Whatever party is already loaded into the explore view (real player state) | **Exactly 3 named temporary NPCs** added by the script itself: Sir Ringwald, Lyn Swiftfoot, Varianna (`ADD_NPC`, `control_morale=100`) -- no player-created party involved at all |
| Combat | Whatever encounter the wall-follower happens to wander into (real GEO-driven random encounter), explicitly dismissed if the demo mode dismisses on trigger (current code instead resolves it via `driveCombat()`) | **One specific, scripted encounter**: `LOAD_MONSTER`x3 (2 Green Dragons, 4 Bozak, 6 Zombies) immediately followed by `COMBAT` -- fixed roster, not random |
| Text/narration | None (silent walk + a static "DEMO — PRESS ANY KEY" banner) | Six distinct `PRINT`/`PRINTCLEAR` narration beats with real, decoded marketing-copy text ("EVEN WITH THE DEFEAT OF THE DRAGONARMIES, EVIL NEVER RESTS...", "...TO BECOME THE CHAMPIONS OF KRYNN.") |
| Pacing | Fixed 650ms JS interval per step | Real `DELAY` opcodes interleaved with text/pictures (matches `cok-demo-decompile.md` §3's already-established `game_speed_var=9` slowest-pacing finding -- unchanged, still relevant) |
| End state | Any keypress/click exits to the title menu | Block 57's own `EXIT` (after resetting `game_area` to 1) returns control to `sub_29758`'s caller, which (per `cok-demo-decompile.md` §2.2) discards the temporary party and shows the title screen again |

None of this is a criticism of the existing placeholder -- its own doc comment already
says exactly what it is and isn't, and it correctly declined to invent detail beyond what
was proven at the time. This session removes the reason for that caveat: a follow-up
implementation pass (explicitly out of scope here) could run block 57 through the
browser engine's real `EclVm` -- the engine already has everything the script needs
(`ADD_NPC`/opcode `0x36` is DONE per `BUILD-QUEUE.md` M35, `LOAD_MONSTER`+`COMBAT` are the
same combat entry every other encounter uses, `PICTURE`/`PRINT`/`PRINTCLEAR`/`DELAY` are
all pre-existing ECL VM opcodes) -- and would no longer need to fabricate a walked path or
a random encounter at all.

---

## 7. What's confirmed vs. still open

**Confirmed this session (byte-verified, self-check-validated):**
- CoK's own literal `EclBlockId` constants: demo = `57`, new-game = `36`, located via a
  structural-function-match + struct-field-idiom disambiguator that first reproduces
  CoAB's own already-known answer (`0x8b78`, `(0x52,1)`) before being trusted on CoK.
- `36` -> `ECL1.DAX` (matches already-decoded new-game opening content, `cok-demo-decompile
  .md` §2.4/§7.3) -- settles that doc's (a)/(b) ambiguity definitively in favor of (b).
- `57` -> `ECL2.DAX`, a brand-new, fully decoded, self-contained linear attract script:
  narration, 3 named `ADD_NPC` temporary party members (Sir Ringwald, Lyn Swiftfoot,
  Varianna, all distinct from Sir Karl Gaardsen), a scripted `LOAD_MONSTER`x3 + `COMBAT`
  (2 Green Dragons, 4 Bozak, 6 Zombies), and a closing tagline before `EXIT`.
- Block 57 has no reachable content in its other 4 header slots (all one-byte `EXIT`
  stubs) -- it is definitively a one-shot cutscene block, not a persistent area.

**Genuinely open:**
1. **CoK's native `game_area` assignment for `inDemo`** -- strongly, self-consistently
   inferred to be `2` (opposite of the CoAB-family assumption), but not disassembled;
   lives in `START.EXE`'s resident segment, outside this project's current GAME.OVR-only
   tooling reach. See §5 for the precise next step.
2. **Semantics of the native `CALL`s inside block 57** (`0x2e10`, `0x6803`, `0xb203`) and
   the `PROGRAM #3` opcode at the very end -- plausible-but-unconfirmed inferences only
   (§3.2). Not blocking for reimplementation (they read as presentation/pacing helpers),
   but not proven.
3. **Character stats for Sir Ringwald / Lyn Swiftfoot / Varianna** were not pulled from
   `MON2CHA.DAX`'s full record this session (only the length-prefixed name field was
   decoded) -- a byte-faithful reimplementation would need their full stat blocks (HP,
   AC, class, etc.), decodable with the same `MON{n}CHA.DAX` record format already used
   elsewhere in this project's monster/NPC tooling.
4. The exact 30s/10s title-screen idle-timeout durations remain unconfirmed for CoK's own
   compiled `START.EXE` (unchanged from `cok-demo-decompile.md` §1.2/§5 item 3 -- out of
   this session's scope, which focused on the ECL-side entry point).

---

## Reproduction

```
python tools/map_cok_demo_entry.py --json build/cok-demo-entry.json
```

Requires the repo's own `Champions of Krynn/` install (already present, see
`docs/dos-inventory.md`), a local Curse of the Azure Bonds GOG install (default
`C:\Program Files (x86)\GOG Galaxy\Games\Curse of the Azure Bonds`, override with
`--coab`), and `build/coab-oracle-map.json` (851-symbol CoAB oracle map; regenerate per
its own existing tooling if missing). Source hashes for this run: CoK `GAME.OVR`
sha256 `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`; CoAB `GAME.OVR`
sha256 `a894282513c2af0a99081c5f888451af14d5ccca686a4a09b4057749a1da51ef`.
