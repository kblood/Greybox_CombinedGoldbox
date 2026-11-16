# The Dark Queen of Krynn - Campaign Matrix Legs (Gen2/HLIB)

> **Date: 2026-08-07.** Method: five independent finder agents (one per un-investigated leg) followed
> by five independent adversarial refuter agents (one per finding), then this single writer agent.
> **All work is static/byte-only**: retail `ECL.GLB` / `GEO.GLB` / `MONCHA.GLB` / `DQK.EXE` bytes plus
> this repository's own TypeScript `EclVm` under `ECL_GEN2`. **There is explicitly NO native
> DOSBox-X, GameLink, emulator, save-state or screenshot evidence anywhere in this document.** No
> retail file was modified; the finders and refuters ran read-only, and this doc is the only file
> written by this workflow.
>
> ## Headline result: **DQK STILL DOES NOT PASS THE CAMPAIGN GATE.**
>
> Four of the five investigated legs survived adversarial refutation as `proven`
> (middle, town, wilderness, quest). **One leg - `ending` - was refuted and downgrades to
> `blocked`.** `blocked` counts as FAILING the gate (`tools/goldbox_campaign_matrix.json`
> -> `statuses`, and the "Campaign Award Rule (2026-07-17)" section of
> `docs/engine/research/persistent-natural-routes.md`). DQK therefore goes from 1/6 to 5/6 legs,
> which is real progress and still short of promotion. Do not round this up.

## How to read this document

Statuses are the matrix's own (`tools/goldbox_campaign_matrix.json` -> `statuses`):

- **`proven`** - engine-level byte-grounded proof (VM golden and/or CFG trace against the real
  retail disassembly). Live browser wiring is explicitly NOT required. **Passes** the gate.
- **`structurally-absent`** - investigated, proved it genuinely does not exist in retail content.
  **Passes** the gate.
- **`blocked`** - investigated with genuine effort, genuinely unresolved. **Fails** the gate.
- **`not-investigated`** - no work done. **Fails** the gate.

Where the finder and the refuter disagreed, **the refuter's surviving verdict is what this document
reports**, and the disagreement is shown in full rather than smoothed over (see
"Refuter corrections, verbatim" below).

This document does **not** edit `tools/goldbox_campaign_matrix.json`. The human operator updates the
matrix after reviewing this doc.

## Summary table

| Leg | Proposed status | Area ids | One-line basis |
| --- | --- | --- | --- |
| early | `proven` (pre-existing, untouched) | 5 | Already in the matrix: area 5 `campInterrupted` at 0x83FD, cell (30,3)=0xE5, ZOMBIE x4, `[0x003A]=1` consumed state. Not re-derived and not reused by any leg below as its own evidence. |
| middle | **`proven`** | 31 (with 30, 32) | ECL area 31 (Thenol city pane, GEO map 30, unique descriptor cell (22,10)=0xC4): scripted Thenol-guard encounter, `COMBAT` at 0x92EF with roster `{26x4, 30x5, 28x3, 90x1}`, consumed bit 28 written at 0x92F5/0x92FB (`[0x014F] |= 0x10`) suppresses the refire. |
| ending | **`blocked`** (finder said `proven`; refuted) | 66, 67 | The SAHUAGIN encounter at area 66 arm 6 (`COMBAT` 0x8DB9) genuinely reproduces, but the properties that make it an *ending* do not: the "closed 66<->67 loop" is false (arm 3 chains `NEWECL #64`), ingress to 66 is untraced, and the terminal scene needs two host gates (`[0x0032]!=0`, `[0x009A]==4`) that were seeded open, one with a fabricated provenance citation. |
| town | **`proven`** | 4 | ECL area 4 = Palanthas: retail `HORIZONTAL_MENU` PALACE/TEMPLE/HALL/SHOP/INN/BAR/LEAVE at 0x82D0 dispatched by `ON_GOTO` at 0x82FE; five services round-trip to the hub with persisted state; the LEAVE exit is gated on `[0x009A]` which only the PALACE audience sets. |
| wilderness | **`proven`** | 18 -> 5 -> 38 | Area 18's south-edge GEO cell (12,10) exit block writes the overland pose and `NEWECL #5`; area 5's arrival table at 0x833F resolves (3,4)/realm 11; 8-way movement over the inline 38x30 terrain table at 0xA97D is nibble-gated; the nine 0xFx cells cross to nine distinct areas, (5,4) -> `NEWECL #38` Kristophan. |
| quest | **`proven`** | 54, 55 | `[0x0187]` bit 0x20: the ONLY setter in all 47 areas is area 55 @0x80DD `OR [0x0187],#32,[0x0187]` (the BE FRIENDLY Hamhand branch); area 54 @0x977F reads it and diverts the descriptor-6 door cell from `NEWECL #55` to "THE HOUSE IS EMPTY AND DARK."; a second reader at 0x8A66 proves shared semantics with bit 0x10. |

**Gate arithmetic:** 5 legs pass, 1 fails -> `dark-queen-of-krynn` stays below `campaign` tier.

---

# Leg: MIDDLE - **proven** - ECL area 31 (Thenol city)

## Byte evidence

Retail identity (independently recomputed by the refuter): `DISK3/ECL.GLB` 456,526 B sha256
`40542071e42d3cd125eabcead11456a99942bf55a7736fdb79f66a3c27c3664d`; `DISK3/GEO.GLB` 48,114 B sha256
`fd8435610b936bdbce997182ddef9ff0bc9e662a760bac2542d4cad8c697a2d1`; `DISK2/MONCHA.GLB` 14,671 B
sha256 `43de18b224dde3786e223ae5d0af53afad2a8109981fd73c1e3e81bd87d6ac68`; `DQK.EXE` 449,664 B sha256
`6b0a9ac5c873997087f1f3f626334a71092fe7c8d1e92ce7f72869a59931f837`.

ECL area 31 = HLIB member 18, file base `0x025884`, 11,040 bytes. Gen2 header (20 B, five far
pointers, no magic): `vmRun1 0x8280`, `search_location 0x82D5`, `pre_camp 0x802D`,
`camp_interrupted 0x807D`, `initial_entry 0x8014`.

| vaddr | file | hex | decoded |
| --- | --- | --- | --- |
| 0x82D5 | 0x025B59 | `03 01 97 00 00 00 17 05 00 01 01 97 00 01 97 00 17 00` | `COMPARE [0x0097],#0 / IF_NE / SUBTRACT #1,[0x0097],[0x0097] / IF_NE / EXIT` - the one-step arrival cooldown (armed by `initial_entry` @0x8026 `09 00 01 01 97 00`, cleared by `vmRun1` 0x8280..0x8295) |
| 0xA500 | - | `2f 00 07 01 2d 00 01 cb 00 / 2f 00 78 01 2d 00 01 ca 00 / 03 01 ca 00 00 00 / 17 / 06 01 ca 00 00 08 01 ca 00 / 13` | `AND #7,[0x002D],[0x00CB]` ; `AND #120,[0x002D],[0x00CA]` ; `DIVIDE [0x00CA],#8,[0x00CA]` ; `RETURN` - zone = `([0x002D]&0x78)>>3`, sub-index = `[0x002D]&7` |
| 0x82EB | 0x025B6F | `25 01 ca 00 00 0d 01 18 83 ...` | `ON_GOTO [0x00CA],#13` -> index 8 = `0x8A61` |
| 0x8A61 | 0x0262E5 | `25 01 cb 00 00 08 01 80 8a ...` | `ON_GOTO [0x00CB],#8` -> index 4 = `0x9177`. Descriptor `(8<<3)|4 = 68 = 0x44` (0xC4 with bit 7) |
| 0x9177 | 0x0269FB | `03 01 32 00 00 00 / 17 / 00` | `COMPARE [0x0032],#0 / IF_NE / EXIT` - host gate |
| 0x9185 | 0x026A09 | `09 00 1c 01 bf 00` then `02 01 ad a4` / `17` / `01 01 ff 92` | `SAVE #28,[0x00BF]` ; `GOSUB 0xA4AD` (bit test) ; `IF_NE` ; `GOTO 0x92FF` - consumed-state gate |
| 0xA4AD | 0x027D31 | `06 01 bf 00 00 08 01 bf 00 / 09 03 29 00 01 c2 00 / 2a 01 4c 01 01 bf 00 01 c0 00 / 2a 01 dc a4 01 c2 00 01 bf 00 / 2f ... / 13` | bit TEST helper: `DIVIDE [0x00BF],#8` ; `SAVE [0x0029],[0x00C2]` ; `GETTABLE 0x014C,...` ; `GETTABLE 0xA4DC,...` ; `AND` ; `RETURN` |
| 0xA4DC | 0x027D60 | `01 02 04 08 10 20 40 80 fe fd fb f7 ef df bf 7f` | mask tables. Bit 28 -> byte `0x014C+3 = [0x014F]`, mask `0x10` |
| 0x92D0 | 0x026B54 | `2c 00 22` | `PARLAY #34` (one operand frame - see the DQK.EXE proof below) |
| 0x92D3..0x92E8 | 0x026B57.. | `0b 00 1a 00 04 00 1a` / `0b 00 1e 00 05 00 1e` / `0b 00 1c 00 03 00 1c` / `0b 00 5a 00 01 00 5a` | `LOAD_MONSTER #26,#4` / `#30,#5` / `#28,#3` / `#90,#1` |
| 0x92EF | 0x026B73 | `24 17 01 01 ec a4` | `COMBAT` ; `IF_NE` ; `GOTO 0xA4EC` (defeat/flee restore) |
| 0x92F5/0x92FB | 0x026B79/0x026B7F | `09 00 1c 01 bf 00` / `02 01 3b a4` | `SAVE #28,[0x00BF]` ; `GOSUB 0xA43B` (SET bit 28) - the consumed write |
| 0x9305 | 0x026B89 | `12 80 1c ...` | `PRINTCLEAR` "SLAIN TEMPLE INQUISITORS LIE NEARBY. " (0x92FF is the gate GOTO target; fresh and consumed paths converge) |

Encounter text: 0x91B9 `PRINTCLEAR` "THENOL ARMY GUARDS AND TEMPLE INQUISITORS ARE TORTURING AN OLD
MAN STRAPPED TO A RACK. "; 0x923C `PRINT` "HITH TEMPLE INQUISITORS DETECT YOUR GOODNESS AND
ATTACK!"; 0x91A9 `SETUP_MONSTER #29,#1,#255,[0x00C0]`.

**GEO pairing.** `GEO.GLB` member 9 = area 30, file base `0x0037EE`, header
`1c 1c 01 02 08 01 08 ff` = 28x28 (len 3144 = 8 + 4*784). Backdrop-plane byte for cell (22,10) at
member offset `0x0756` / file `0x003F44` = **0xC4** (context `80 80 80 c4 45 80 00`); it is the
**only** cell in all 784 with `(byte & 0x7F) == 68`. Zone values over the map span exactly
`{0,1,2,3,5,6,7,8,9,10,11,12}` (subset of the 13-entry table) and sub-indices exactly `{0..7}` (the
8-entry table) - a wrong plane would not fit both arities. Zone 8 is a ten-cell cluster using all
eight sub-indices. `GEO.GLB`'s id list contains 30 but not 31 or 32.

**Pane chain.** Areas 30/31/32 are three ECL panes sharing GEO map 30. Area 30 owns both
`LOAD_FILES` sites (`21 ... #30,#1` at 0x80AC and 0x81A1); areas 31 and 32 have **zero**
decoded `LOAD_FILES` under both the shipped and corrected dialects. Area 30 @0x8473
`ON_GOTO [0x00CA],#13` index 8 = 0xA3D5 = `GOSUB 0xA3E3` + `20 00 1f` `NEWECL #31`; area 31's own
defaults chain back (`0xA3C8` -> `NEWECL #30`, `0xA3CF` -> `NEWECL #32`). Entry-reachable
`NEWECL #31` sites corpus-wide: exactly `{(30, 0xA3D9), (32, 0xA9E6)}`.

**Roster names** (`MONCHA.GLB` id table -> member -> decompressed name): id 26 -> member 26
"THENOL FANATIC"; id 30 -> member 30 "THENOL WARRIOR"; id 28 -> member 28 "THENOL PRIEST"; id 90 ->
**member 86** "ENCHANTED SIVAK" (indexing the engine roster array by 90 gives the wrong creature -
the id table must be used).

> **Names corrected 2026-08-21 (fidelity-plan §29).** This paragraph originally read "THENOL FNATIC"
> and "THENOL WARIOR". Those were not SSI abbreviations, they were our own decoder dropping a
> character: every `MONCHA.GLB` member opens with a 2-byte big-endian uncompressed length that we
> were feeding to the RLE decompressor as control bytes, which left each record out of phase.
> The id-table point this paragraph actually makes - that id 90 resolves to member 86, so the roster
> array must be indexed through the id table - is unaffected and still holds.

**Three operand-frame corrections, taken from DQK.EXE's own dispatch handler prologues** (not from
inference), independently re-derived by the refuter:

- `0x2C PARLAY`: dispatch table 2033:0D34 / file 0x032A54 slot 0x2C -> stub 2033:0EB7
  (`0e e8 65 05` = push cs; call, 0x0EBB+0x0565 = 0x1420) -> 2033:1420 = file `0x033140`:
  `55 8b ec 83 ec 02 b0 01 50 0e e8 e6 eb 59` = **`mov al,1`** into the operand-frame parser
  2033:0013. **ONE** frame, not four.
- `0x1F`: stub 2033:0E59 = `9a f1 12 99 1d` -> 1d99:12F1 -> far 25a4:32B2 = file `0x043572`:
  `55 8b ec 83 ec 2c b0 01 ...` - **ONE** frame.
- `0x37`: 25a4:31E8 = file `0x0434A8` `b0 02` - **TWO** frames.
- `DIVIDE` remainder address: shared arithmetic handler 2033:02C2, DIV arm at file `0x03204E`
  contains `c4 1e 0f b2 / 26 88 57 29` = `les bx,[0xb20f]; mov byte ptr es:[bx+0x29],dl` at
  `0x032061..0x032068` - remainder lands at **ECL data offset 0x29**, exactly what helper 0xA4AD
  reads. The engine's `DIV_REMAINDER_ADDR = 0x7f3f` (vm.ts ~line 551) is the Gen1/CoAB address and
  is wrong for Gen2.
- `ON_GOTO` is 0-based: handler 2033:0991 / file `0x0326B1` has `c6 46 fe 00` at `0x0326E5` then
  `8a 46 fc / 3a 46 fe / 75 3e` at `0x0326EB` - the selector is compared against a counter starting
  at 0.

## Negative controls (all measured, not asserted)

| # | Control | Measured outcome |
| --- | --- | --- |
| NC1 | Re-ran the repo's own entry-reachable COMBAT scan over all 47 areas changing ONLY `0x1F`'s operand count 2 -> 1 | 35 rows -> 34; the single row that disappears is `area=034 combat=0x91C7`; zero rows added, area 31 @0x92EF unchanged |
| NC2 | Pre-set `[0x014F]=0x10` (bit 28) | Fresh -> `status:'combat'@0x92EF`, roster `[{26,4},{30,5},{28,3},{90,1}]`. Consumed -> zero combat, only the aftermath prints |
| NC3 | Set the identical 0x10 in the **neighbouring** byte `[0x014E]` | Combat fires again with the identical roster - bit 28 -> byte `0x014F` exactly |
| NC4 | Seed `[0x0032]=1` | ZERO effects, never reaches 0x917F |
| NC5 | Seed `[0x0097]=1` (arrival cooldown) | ZERO effects, exits at 0x82E6 before the descriptor unpack |
| NC6 | Vary descriptor inside zone 8 | 0xC3 -> a DIFFERENT encounter ("AN ANCIENT HUMAN EXAMINES YOU.", roster `[{26,14},{29,3},{28,8},{41,4}]`); 0xC5 -> `'CITY PRISON'` print only; 0xC6/0xC7 -> silent exits @0x956E/0x9576 |
| NC7 | Descriptor 0x44 (bit 7 clear) | Effect-for-effect identical to 0xC4 - confirms the &0x7F semantics |
| NC8 | Prime `vmRun1` (0x8280) instead of `search_location` with the same descriptor | `exited@0x8720`, no combat, no text - this is a search_location event |
| NC9 | Corpus decode health, PARLAY wordSet 1 vs 4 | 1: 38,942 reachable instructions / 38 decode failures. 4 (shipped): 36,333 / 103. 2.7x fewer desyncs with the byte-proven frame |
| NC10 | GEO/ECL table-arity fit | Over all 784 cells, zone set and sub-index set fit the 13- and 8-entry tables exactly |
| NC11 | BFS over GEO 30's wall/door planes from (22,10) | Reaches a connected component containing all ten zone-8 cells and cells of all twelve zone values; paths up to 64 steps |
| NC12 | Omit the `[0x0029]` divide-remainder shim | Still reaches `combat@0x92EF` with the identical roster (an all-zero bitmap ANDs to zero under any mask) - the shim does not manufacture the positive |

**Refuter-added robustness result (the finding underclaimed this):** under the **shipped**
`ECL_GEN2` (`0x2c: 4`) the VM still reaches `combat` at 0x92EF; only the first `LOAD_MONSTER` is
swallowed, giving a 3-group roster `[{30,5},{28,3},{90,1}]`. **The dialect fix is load-bearing for
the ROSTER only, not for the encounter.** The `ECL_GEN2_DQK_AREA5` reconciliation can therefore be
settled independently of whether this leg lands.

## Proposed golden test

New file `packages/engine/test/dqkMiddleRoute.test.ts`, `existsSync`-guarded on
`The Dark Queen of Krynn/DISK3/{ECL,GEO}.GLB` and `DISK2/MONCHA.GLB`, dialect passed explicitly at
every call site, no retail data touched.

Shared setup: a `DQK_GEN2_FIXED` dialect = `ECL_GEN2` with
`wordSetOverrides { ...ECL_GEN2.wordSetOverrides, 0x2c: 1, 0x1f: 1, 0x37: 2 }`; a zeroed
`[0x0140..0x0160]` bitmap seed; `DIV_REM = { 0x0029: 4 }`.

- **A. Container/identity.** `idToMember.get(31) === 18`; `area31.length === 11040`;
  `parseEclHeader` -> `{vmRun1:0x8280, searchLocation:0x82d5, preCampCheck:0x802d,
  campInterrupted:0x807d, initialEntry:0x8014}`.
- **B. Raw-byte pins.** `hex(area31[0x12EF..0x12F6]) === '24 17 01 01 ec a4 09'`;
  `hex(area31[0x12D3..0x12EF])` = the four `LOAD_MONSTER` frames;
  `hex(area31[0x24DC..0x24E4]) === '01 02 04 08 10 20 40 80'`.
- **C. Disassembly pins.** 0x82EB -> `ON_GOTO` 13 targets, `[8] === 0x8A61`; 0x8A61 -> `ON_GOTO`
  8 targets, `[4] === 0x9177`; 0x92D0 -> `{mnemonic:'PARLAY', size:3}`; 0x92D3/DA/E1/E8 ->
  `LOAD_MONSTER` args `[26,4,26] [30,5,30] [28,3,28] [90,1,90]`; 0x92EF -> `{COMBAT, size:1}`.
- **D. GEO pairing.** GEO ids contain 30 and not 31/32; 28x28; `backdropPlane[10*28+22] === 0xC4`;
  exactly one cell with `(b & 0x7f) === 68`; zone set and sub-index set as measured.
- **E. Pane chain.** Area 30 has 2 `LOAD_FILES` sites, area 31 has 0; area 30 @0xA3D9 =
  `NEWECL #31`; entry-reachable `NEWECL #31` census = `[{30,0xA3D9},{32,0xA9E6}]`.
- **F. FRESH run (core positive).** `primeSearchLocation(area31, 0xC4, ...)`, `run()` then
  `resume(0)` for the PARLAY pause -> `status === 'combat'`, `at.vaddr === 0x92EF`, roster deep-equals
  the four groups; print effects contain the RACK text then the HITH text in order.
- **G. Victory writes the consumed bit.** `resume(0, {combatOutcome:'victory'})` ->
  `memory.get(0x014F) === 0x10`, prints "SLAIN TEMPLE INQUISITORS LIE NEARBY. ", and
  `0x014E`/`0x0150` both still 0.
- **H. CONSUMED run.** Same seed + `{0x014F: 0x10}` -> no combat effect, first print is the aftermath,
  `0x014F` still 0x10.
- **I. Negative controls,** one `expect` each: `{0x014E:0x10}` -> combat still fires; `{0x0032:1}` ->
  `effects.length === 0`; `{0x0097:1}` -> `effects.length === 0`; descriptor 0xC3 -> the other roster
  and text; 0xC5 -> single `'CITY PRISON'` print; 0x44 -> identical to 0xC4; `primeVmRun1` 0xC4 ->
  `exited` @0x8720.
- **J. Dialect counterfactual.** With plain `ECL_GEN2` the instruction at 0x92D0 has `size === 9` and
  0x92D3 is not a `LOAD_MONSTER` boundary; with `0x1f: 2` area 34 @0x91C7 claims `COMBAT`, whereas
  with `0x1f: 1` the instruction at 0x91C5 is `PRINTCLEAR` decoding to "THE GUARDPOST IS NEW AND
  BUILT TO RESIST MAGIC." Assert both.
- **K. Roster names** via the `MONCHA.GLB` id table (id 90 -> member 86), substring assertions only.

## What is NOT claimed (middle)

- No native execution of any kind. The DOS host's own RNG, wandering-monster selection, combat
  resolution and screen output are not modelled or claimed.
- No live browser wiring: no `?explore=` profile, no e2e acceptance, no save/reload round trip.
- **No walked step path from a proven spawn pose to (22,10).** What is established: (22,10) is the
  unique descriptor cell, it sits in a large connected walkable component, and pane 30's zone-8
  handler chains to pane 31. DQK spawn poses were not investigated.
- The golden needs **three deviations from the shipped engine**, all byte-proved engine gaps rather
  than data fudges: the three `wordSetOverrides`; the `[0x0029]` seed (because `DIV_REMAINDER_ADDR`
  is the Gen1 address); and pre-seeding the `[0x014C..]` bitmap (because `EclVm`'s `GETTABLE` falls
  back to reading BLOCK bytes at the same numeric offset - unseeded it reads `raw[0x014F] = 0x43`,
  a string byte). The shipped engine cannot run this route correctly today.
- The `0x2c: 1` correction **contradicts** the existing doc comment on `ECL_GEN2_DQK_AREA5` in
  `disassemble.ts` (which calls the 1-operand PARLAY an area-5-only exception). Areas 66 and 5 were
  not individually re-audited under the corrected frame, and no check was made for existing tests
  depending on `0x2c: 4`. **This must be reconciled before landing.**
- Correcting the frames changes the entry-reachable COMBAT census from 35 to ~144 sites (the finder
  said 146; the refuter measured 144 through the repo's own walker). Those were NOT validated
  individually; several are certainly still false positives. Treat as "the corrected scanner's
  output", not as "DQK has 144 real combats".
- Opcode `0x1F`'s **semantics** remain unknown - only its frame count is proven.
- `PARLAY`'s Gen2 semantics are NOT proven; the engine models it as a Gen1 five-way attitude menu
  writing to a destination, which here resolves to a spurious write to `[0x0022]`. The golden's
  `resume(0)` there is a modelling convenience.
- **Persistence across save/reload is NOT proven** (refuter correction - see below). What is proven
  is that the flag lives in the ECL data segment, not in the script image.
- The "middle" **label** is an inference (NEWECL-graph depth 3, downstream of area 5) not a byte
  fact. No narrative/manual source was consulted.
- Classification risk: area 31 is an occupied CITY map. It is not DQK's town *pattern* (that is
  area 4's service menu), but a reviewer could argue overlap. Area 4 is used for `town` below, so
  the two do not collide.

---

# Leg: ENDING - **blocked** (finder proposed `proven`; refuter refuted it)

**This is the leg that keeps DQK below the gate.** The finder's SAHUAGIN encounter in area 66
reproduces exactly and its dead-code refutation of a competing site is correct and valuable. What
does not survive is everything that made it an *ending* rather than just another combat.

## Byte evidence (the parts that DID survive independent re-verification)

ECL area 66, member file base `0x06BDD4`. Header (20 B) = `01 01 92 85 | 01 01 29 86 |
01 01 51 81 | 01 01 93 81 | 01 01 14 80` -> `vmRun1 0x8592`, `searchLocation 0x8629`,
`preCamp 0x8151`, `campInterrupted 0x8193`, `initialEntry 0x8014`.

| vaddr | file | hex | decoded |
| --- | --- | --- | --- |
| 0x8633 | - | `03 01 a0 00 00 ff` / `18` / `04 00 01 01 a0 00 01 a0 00` | `COMPARE [0x00A0],#255 / IF_LT / ADD #1,[0x00A0],[0x00A0]` - a step counter saturating at 255 |
| 0x8669 | 0x06C43D | `2f 00 7f 01 2d 00 01 9b 00` | `AND #127,[0x002D],[0x009B]` |
| 0x8672 | 0x06C446 | `25 01 9b 00 00 0f ...` | `ON_GOTO [0x009B],#15` -> `{0x86CE, 0x88E7, 0x890D, 0x8933, 0x895C, 0x89B5, 0x8CC6, 0x8DCB, 0x90E0, 0x90FD, 0x8879, 0x88E2, 0x911A, 0x914C, 0x9D18}`; arm 6 = 0x8CC6, arm 14 = 0x9D18 |
| 0x8CC6 | 0x06CA9A | `03 01 32 00 00 00 / 16 00` then `2f 00 20 01 9c 00 01 bf 00 / 17 00` | host gate `[0x0032]`, then already-consumed gate on `[0x009C]` bit 0x20 |
| 0x8CD9 | 0x06CAAD | `30 00 20 01 9c 00 01 9c 00` | `OR #32,[0x009C],[0x009C]` - the **eager** consumed bit, set before the fight |
| 0x8CE2 | - | `0c 00 12 00 00 00 ff 00 00` | `SETUP_MONSTER #18,#0,#255,#0` |
| 0x8D8E/95/9C | - | `0b 00 12 00 08 00 12` / `0b 00 3b 00 04 00 3b` / `0b 00 40 00 02 00 40` | `LOAD_MONSTER #18,#8` / `#59,#4` / `#64,#2` |
| 0x8DB9 | 0x06CB8D | `24` | `COMBAT` |
| 0x9D18 | 0x06DAEC | `03 01 a0 00 00 ff / 16 01 01 2a 9d / 02 01 03 9f` then `20 00 43` @0x9D27 | terminal arm: counter-saturated -> 0x9D2A, else `NEWECL #67` |
| 0x9D2A | - | `03 01 9a 00 00 04` + `17 00` | `COMPARE [0x009A],#4 / IF_NE / EXIT` - **the gate the finder missed** |
| 0x9D3D | 0x06DB11 | `30 00 20 01 9d 00 01 9d 00` | `OR #32,[0x009D],[0x009D]` - one-shot for the terminal scene |

Area 67 (file base `0x06DDA2`): header's four live slots all point at 0x9654; 0x9654 `GOSUB 0x9946`;
0x9658 `20 00 42` `NEWECL #66`. Area 67 @0x8043 `09 00 ff 01 a0 00` = `SAVE #255,[0x00A0]`.

GEO member 20 = area 66, file base `0x00B03A`, 3000 B, 22x34, 748 cells. Backdrop plane =
base + 8 + 2*748 = `0x0B61A`. Descriptor 134 at (19,20)/`0x00B7E5` and (20,20)/`0x00B7E6`; 142 at
(9,7)/`0x00B6BD`; 133 at (3,13)/`0x00B73B` and (15,14)/`0x00B75D`. All offsets recompute exactly.
Flood fill = 748/748 connected.

> CORRECTION (R4, round 29): the five `(x,y)` labels in the paragraph above were computed under
> the pre-`dc12cd1` `(width, height)` byte order; the "22x34" shape is stated in the CORRECT
> `(height, width)` sense (h=22, w=34, matching `tools/dqk_geo_shape_census.py`) but the coordinate
> math that follows still divides by the OLD stride. Every cited file offset is correct and
> unchanged; only the `(x,y)` label attached to each is stale. Re-derived from `idx = offset -
> 0x0B61A` against the real stride w=34: offset `0x00B7E5` -> idx 459 -> `(17,13)` (was `(19,20)`);
> `0x00B7E6` -> idx 460 -> `(18,13)` (was `(20,20)`); `0x00B6BD` -> idx 163 -> `(27,4)` (was
> `(9,7)`); `0x00B73B` -> idx 289 -> `(17,8)` (was `(3,13)`); `0x00B75D` -> idx 323 -> `(17,9)`
> (was `(15,14)`). Each stale label matches exactly what the OLD, pre-fix stride (w=22) would have
> produced from the same offset, confirming this is the transposition bug and not an independent
> transcription error. See `docs/engine/research/dqk-geo-shape-audit.md` for the full audit and
> `tools/dqk_geo_claim_audit.py` for the mechanical re-derivation (offset-anchored, independent of
> which area a paragraph claims to be about).

## Negative controls and their measured outcomes

Reproduced by the refuter: replay after victory -> `end`; pre-set `[0x009C]=0x20` -> `end`, no combat;
`[0x009C]=0x10` (a different bit of the same word) -> combat still fires and `[0x009C]` becomes 0x30
(bit-specific, not "any nonzero"); host gate `[0x0032]=0` -> exits at 0x8CCC without writing
`[0x009C]`; descriptor 133 -> a different arm (THENOLIANS, 6 groups, bit 0x10 at 0x89C8, COMBAT at
0x8B0F); descriptor 135 -> `end`; PARLAY choice independence (all five attitudes reach the same
roster for 134, whereas 133's YES/NO prompt discriminates - only index 0 reaches combat); area 67
round trip -> `chain 66`.

**Arm-0 dead-code refutation (correct, and independently confirmed).** 0x86CE `COMPARE_AND
[0x00A4],#1,[0x00A1],#0` / 0x86D9 `IF_EQ` / 0x86DA `GOTO 0x874E` / 0x86DE `RANDOM #140,[0x00BF]` /
0x86E4 `IF_NE` / 0x86E5 `EXIT`. `COMPARE_AND` sets exactly one of EQ/NE and `RANDOM` does not touch
the compare flags, so one of the two IFs always diverts and 0x86E6 onward is unreachable. All four
`(0x00A4, 0x00A1)` pre-states return `end`. The refuter additionally ran an exhaustive scan of area
66 for `01 lo hi` operand words landing in `0x86E6..0x8760` and found only `0x86DB -> 0x874E` -
nothing jumps into the tail. **The COMBAT at 0x8746 reported by the scanner is genuinely dead code**,
and the brief's "35 entry-reachable COMBAT sites" figure is over-inclusive here.

**The controls that FAILED to reproduce** (this is why the leg is blocked):

- The finder's `TERMINAL-ARM GATE` control claims descriptor 142 with `[0x00A0]=254` takes the
  terminal branch and prints "TOO LATE! ... WELCOME TO THE ABYSS!". Run on retail bytes with
  `dqkVmRun1Seed(142,'south',66)` + `{0x32:4, 0xa0:254}` the runner returns `{kind:'end', text:''}`
  and never writes `[0x009D]`. The branch at 0x9D2A is **additionally** gated by
  `COMPARE [0x009A],#4 / IF_NE / EXIT`. Only with `[0x009A]=4` also seeded does the 527-char scene
  fire. **Proposed golden Case 9 would fail as written.**

## Proposed golden test (as submitted - NOT to be landed as-is)

The finder proposed `packages/engine/test/dqkEndingRoute.test.ts` with 11 cases: header pin,
descriptor-dispatch pin, GEO placement + flood fill, the SAHUAGIN encounter, consumed-state replay,
bit-specificity, host gate, PARLAY choice independence, the ending gate, the 66<->67 loop, and the
dead-code refutation. **Cases 1-8, 10 and 11 reproduce.** Case 9 (the ending gate) is wrong as
written and must be rewritten with the `[0x009A]=4` seed made explicit, and Case 10's "closed loop"
framing must be dropped (area 66 also chains `NEWECL #64`).

If a writer wants the surviving material anyway, the honest framing is "area 66's SAHUAGIN arm-6
encounter with eager consumed state" - a valid Gen2 encounter golden, not an *ending* proof.

## What is NOT claimed (ending)

- **Not claimed: that area 66 is DQK's terminal region.** The "closed two-node loop" is false; area
  66 arm 3 (@0x8933 -> @0x8959 `20 00 40` `NEWECL #64`) is CFG-reachable, and area 64's entry tests
  `COMPARE [0x0016],#66` and returns via `NEWECL [0x01A1]`. The late region is at minimum
  {62,63,64,65,66,67}.
- **Not claimed: an ingress to area 66.** Areas 63/64 chain through variable operands
  (`NEWECL [0x00A5]`, `NEWECL [0x01A1]`) whose runtime values were not resolved.
- **Not claimed: that DQK ships a victory epilogue.** The pinned scene is the failure/damnation
  ending. A winning finale may live outside `ECL.GLB` (executable cinematics, `FINAL.TLB`) - not
  looked at.
- **Not claimed: the PARLAY operand split at 0x8DA9** (one byte shorter than this block's six other
  PARLAY sites). Both candidate parses converge on COMBAT at 0x8DB9.
- **Not claimed: the meaning or provenance of `[0x0032]` or `[0x009A]`.** A corpus-wide scan finds
  ZERO ECL writes to `[0x0032]` in all 47 blocks (read only, in areas 14/15/35/66). `[0x009A]` is
  written only as area-local scratch elsewhere and compared against 0/2/3/4/9/15 in six areas;
  `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md` already lists it as an address without
  confirmed host semantics. Both were seeded open to make the route run.
- No live browser wiring, no save-schema round trip, no native trace.
- The other 12 ON_GOTO arms of area 66 and the other seven combat sites in the corrected
  disassembly were not examined.

---

# Leg: TOWN - **proven** - ECL area 4 (Palanthas)

## Byte evidence

ECL area 4 = member 4, `block_len` 10,100, file base `0x0030EC`. Gen2 header:
`vmRun1 0x89DF`, `searchLocation 0x8A27`, `preCampCheck 0x89A8`, `campInterrupted 0x897C`,
`eclInitialEntry 0x8014`.

| vaddr | file | hex | decoded |
| --- | --- | --- | --- |
| 0x82D0 | 0x0033BC | `2b 01 bf 00 00 07 80 05 40 13 ...` | `HORIZONTAL_MENU [0x00BF],#7` -> "PALACE","TEMPLE","HALL","SHOP","INN","BAR","LEAVE" |
| 0x82FE | 0x0033EA | `25 01 bf 00 00 07 01 19 83 01 0f 86 01 48 86 01 55 86 01 d6 85 01 89 86 01 cb 87` | `ON_GOTO [0x00BF],#7` -> `0x8319`(PALACE) `0x860F`(TEMPLE) `0x8648`(HALL) `0x8655`(SHOP) `0x85D6`(INN) `0x8689`(BAR) `0x87CB`(LEAVE) |
| 0x850F | 0x0035FB | `09 00 01 01 9a 00` | `SAVE #1,[0x009A]` - the PALACE audience, the only entry-reachable writer of `[0x009A]=1` |
| 0x87CB | 0x0038B7 | `03 01 9a 00 00 00 / 17 / 01 01 3a 88` | `COMPARE [0x009A],#0 / IF_NE / GOTO 0x883A` - the exit gate; fall-through prints "THE GUARD STOPS YOU, " / "'EXCUSE ME. THE GENERAL REQUESTS YOUR PRESENCE AT THE PALACE. IT IS MOST URGENT.'" then `GOTO 0x8296` |
| 0x894A..0x8975 | 0x003A61 | `SAVE #3,[0x0034]` / `SAVE #2,[0x0035]` / `SAVE #1,[0x0011]` / `CALL 0x0001` / `SAVE #0,[0x0097]` / `ADD [0x0009],#15,[0x0009]` / `SAVE #11,[0x0008]` / `09 00 01 01 9c 00` `SAVE #1,[0x009C]` then `00` EXIT | the town -> field phase latch and clock advance |
| 0x8014 | 0x003100 | `03 01 16 00 00 0a` then `COMPARE_AND [0x0016],#4,[0x009C],#2 -> GOTO 0xA15F`; `...,#1 -> EXIT (0x803D)`; `...,#0 -> GOTO 0x8296 (0x804A)` | phase-gated re-entry |
| 0x8605 | 0x0036F1 | `38 00 09` | `PROGRAM #9` (INN); full branch: `PICTURE #132`, "'GREETINGS. THE COMMON ROOM IS FREE.'", `SAVE #1,[0x0097]`, `GOTO 0x8296` |
| 0x8648 | 0x003734 | `09 00 ff 01 30 00 38 00 00` | `SAVE #255,[0x0030]` ; `PROGRAM #0` (HALL/training), then `GOTO 0x8296` |
| 0x863C/3D/43/44 | 0x00372F | `1c` / `09 00 01 01 14 00` / `24` / `01 01 96 82` | TEMPLE OF PALADINE: `CLEARMONSTERS` ; `SAVE #1,[0x0014]` ; `COMBAT` (empty roster) ; `GOTO 0x8296` |
| 0x89A8 | 0x003A94 | `03 01 9c 00 00 00 / 16 / 09 00 00 01 2c ...` | `preCampCheck` - camping disallowed in town phase, allowed in field phase |
| 0x8A6C/0x8A75 | - | `2f 01 2d 00 00 7f 01 bf 00` then `25 01 bf 00 00 30 ...` | `AND [0x002D],#127,[0x00BF]` ; `ON_GOTO [0x00BF],#48`; index 5 = 0x8F30 |
| 0x8F30 | 0x00401C | `03 01 11 00 00 02 / 17 / 00 / 09 00 01 01 bf 00 / 02 01 ac a4 / 17 / 00` | Caergoth field cell: facing gate, one-shot bit test, then the journal-65 print |
| 0x8FA4 | 0x004090 | `09 00 02 01 9a 00` | `SAVE #2,[0x009A]` - field state fed back into the hub's `ON_GOTO [0x009A],#3` at 0x835F |

The identical 4 bytes `01 01 96 82` (`GOTO 0x8296`) terminate INN (0x860B), TEMPLE (0x8644), HALL
(0x8651), SHOP (0x8685) and PALACE (0x8515); BAR returns via `ON_GOTO 0x86B7` index 2. One-shot bit
machinery at 0xA43A (set) / 0xA473 (clear) / 0xA4AC (test) with mask tables at 0xA4DB
(`01 02 04 08 10 20 40 80`) and 0xA4E3 (`fe fd fb f7 ef df bf 7f`).

`GEO.GLB` id table maps area 4 -> member 2, header `11 11 09 03 11 11 07 04` = a real 17x17 Gen2
walkable map with 25 distinct masked cell descriptors.

## Negative controls and their measured outcomes

| Control | Measured outcome |
| --- | --- |
| LEAVE three times without the palace audience | Every attempt prints "THE GUARD STOPS YOU" / "'EXCUSE ME...'" and returns to the hub at 0x82D0; `[0x009C]` stays 0, `[0x009D]` unset. The exit never fires |
| Seed ONLY `[0x009A]=1` (no palace visit) and LEAVE | Journey narration runs, exits at 0x897B, `[0x009C]=1`, `[0x009D]=1`, `[0x0008]` 9->11, `[0x0009]` 23->38 |
| Phase discriminator, three-way | `[0x009C]=1` -> immediate `exited` @0x803D, ZERO effects; `=0` -> hub, no arrival narration; `=2` -> a different script entirely (shipwreck voyage, DAMAGE 3d7, `LOAD_FILES` GEO 14, `status=chain`) |
| `preCampCheck` @0x89A8 per phase | 0 -> `[0x002C]=0, [0x002B]=255` (no camping in town); 1 -> `1, 16` (camping allowed in field); 2 -> `0, 255` |
| One-shot journey narration with `[0x009D]=1` | Skips "YOU MOUNT THE STEEDS..." entirely, prints only "AFTER SEVERAL DAYS, YOU APPROACH CAERGOTH..." |
| Field cell, four-way | (a) first visit -> journal print, `[0x009A]=2`, bit vector 1, exits 0x8FAA; (b) bit carried -> exits 0x8F43 BEFORE the print, no write; (c) facing 1 instead of 2 -> exits 0x8F37; (d) descriptor 6 -> a different handler ("YOU SEE A LONE SHIP ANCHORED IN THE HARBOR BEFORE YOU.") |
| Return carrying `[0x009A]=2` with `[0x0016]=11` | Full arrival re-init, `[0x009C]=0`, PALACE gives "'THIS CONFIRMS MY WORST FEARS! QUICKLY, RETURN TO CAERGOTH...'"; identical run without `[0x009A]` gives "'AH, MY CHAMPIONS...'" |
| Round-trip state preservation (PALACE, SHOP, HALL then a fresh VM on the same memory) | `[0x009A]=1, [0x0028]=16, [0x0004]=1, [0x0030]=255` all intact; PALACE now yields its SECOND text |

## Proposed golden test

New file `packages/engine/test/dqkPalanthasTown.test.ts` (skips if the retail file is absent), with
11 cases: header + menu + ON_GOTO pins (raw bytes `2b 01 bf 00 00 07` at 0x02D0 and
`25 01 bf 00 00 07` at 0x02FE); fresh arrival to the hub (`loadFiles geoBlockId 4`, `picture 150`,
"YOU ARRIVE IN PALANTHAS", the seven menu items, `[0x0016]=4`, `[0x009C]=0`, `[0x0008]=9`,
`[0x0009]=23`); exit refusal x3 then PALACE then successful exit; the `[0x009A]`-only single-variable
control; all five services round-tripping with their persisted state; the TEMPLE empty-roster
`status:'combat'` @0x8643; the three-way phase gate; `preCampCheck` per phase; the GEO-backed exit
target; the Caergoth field cell one-shot; and the return-carrying-state palace-text discrimination.

**Two implementation bugs in the submitted golden must be fixed before landing** (refuter-found, not
evidentiary): `decodeGen2GeoBlock` returns `{ map: { width, height, cells, ... }, wallPlane0, ... }`
so the 17x17 assertions must go through `.map`; and `decodeInstructionAt(raw, offset, vbase, dialect)`
takes the dialect as the **fourth** argument, so `decodeInstructionAt(block, 0x02D0, ECL_GEN2.vbase,
ECL_GEN2)` is correct, not the three-argument form submitted.

## What is NOT claimed (town)

- **Not a distinct Town renderer.** Palanthas's town phase is menu-composed
  (`PRINT`/`PICTURE`/`HORIZONTAL_MENU`/`ON_GOTO`); there is no GEO walking *inside* the town. This is
  the same claim boundary CoAB's own town leg states, and it is deliberate.
- **Host semantics of the services are not proven** - only their ECL-level dispatch. `PROGRAM #0`,
  `PROGRAM #9`, `PROTECTION #9` and the TEMPLE's empty-roster `COMBAT` are captured as effects; what
  `DQK.EXE` does with them (training UI, rest, merchant inventory, temple healing) was not proven.
  The engine currently no-ops `PROTECTION` and emits `program` as an unhandled effect.
- The 0-based menu-index convention is the shipped VM's model, corroborated narratively but NOT
  verified against DQK.EXE's own form handler.
- Two real Gen2 VM modelling gaps were found, both affecting the field half only: `DIV_REMAINDER_ADDR`
  is the Gen1 address (so the one-shot mask index is always 0 - the byte index is unaffected, so the
  consumed-state proof stands structurally, but the exact bit differs from retail); and `GETTABLE`'s
  code-byte fallback reads `block[0xB8] = 129` as bit-vector data when `[0x00B8]` is unseeded. The
  golden works around the second by seeding the vector.
- `[0x009C]` is NOT a globally-scoped town flag - other areas reuse the word with different meanings.
  Every `[0x009C]` claim is scoped strictly to area 4.
- **The exact host mechanism returning the party from the Caergoth field to the town hub is not
  proven.** (Refuter note: area 4's own `searchLocation` ON_GOTO index 1 -> 0x8C2B contains an
  in-block return prompt - "THE ROAD WEST LEADS BACK TO THE CITY OF PALANTHAS. " / "DO YOU WANT TO
  RETURN TO PALANTHAS?" / `PARTY_SURPRISE` at 0x8C82 - whose YES continuation is still untraced. Cite
  that rather than describing the mechanism as wholly unlocated.)
- No live browser wiring, no `?explore=` profile, no save-v2 persistence row, no e2e case.
- The three PALACE audience stages are proven to be selected by `[0x009A]`, but no claim is made that
  a real playthrough reaches stages 2 and 3 in that narrative order under the game's own pacing.
- Area 5's competing hub at 0x9D08 (INN/TEMPLE/HALL/SHOP/PUB/LEAVE) was deliberately left untouched
  per the reserved-early-leg constraint.

---

# Leg: WILDERNESS - **proven** - area 18 -> area 5 overland -> area 38

## Byte evidence

DQK ships exactly one overland map, and it is **not** a GEO map: ECL area 5 carries a 38x30 terrain
byte table inline in its own `ECL.GLB` member (base vaddr `0xA97D`, file `0x0081DD`, 1,140 bytes),
walked with 8-way compass movement. `GEO.GLB` has no area-5 member at all (its id table is
`{2,4,10,14,18,22,24,26,30,34,38,42,46,47,50,54,58,62,63,66}`).

| area | vaddr | file | hex | decoded |
| --- | --- | --- | --- | --- |
| 18 | 0x8365 | 0x014563 | `2f 00 7f 01 2d 00 01 bf 00` | `AND #127,[0x002D],[0x00BF]` |
| 18 | 0x836E | - | `14 01 bf 00 00 01 01 11 00 00 02` `16` `01 01 05 85` | `COMPARE_AND [0x00BF],#1,[0x0011],#2 / IF_EQ / GOTO 0x8505` - descriptor 1 AND facing south |
| 18 | 0x8505/0x851D | 0x014703/0x01471B | `12 80 15 ...` then `22 17 00` | `PRINTCLEAR` "LEAVE THE HAMLET OF HIZDEN? " ; `PARTY_SURPRISE` (Gen2 zero-operand) ; `IF_NE` ; `EXIT` |
| 18 | 0x8584..0x85AA | 0x014782.. | `09 00 04 01 26 00` / `09 00 03 01 25 00` / `09 00 03 01 11 01` / `09 00 04 01 12 01` / `09 00 00 01 23 00` / `09 00 f0 01 3e 00` / `20 00 05` | overland pose (3,4), direction latch cleared, backdrop page 240, `NEWECL #5` |
| 5 | 0x809C | 0x0058FC | `2a 01 3f 83 01 bf 00 01 c0 00` ... loop | 9-entry linear search of the source-area table by the previous ECL id in `[0x0016]` |
| 5 | 0x833F | 0x005B9F | `12 16 26 1e 2e 32 36 3d 33` / `03 04 05 18 15 1f 23 1e 1d` / `04 01 04 16 17 17 1b 00 00` / `0b 0b 02 01 01 07 0a 08 08` | source ids `[18,22,38,30,46,50,54,61,51]`, arrival X, arrival Y, realm/wall-set. Index 0 (area 18) -> (3,4) realm 11, byte-identical to what area 18 writes |
| 5 | 0x843B | 0x005C9B | `25 01 23 00 00 08 ...` | `ON_GOTO [0x0023],#8` -> eight compass arms 0xA5C9..0xA65B - an overland movement mode, not the 4-way GEO dungeon mode |
| 5 | 0xA66D.. | 0x007ECD | `03 01 c0 00 00 25 / 19 / 01 01 6a a7` and `03 01 c1 00 00 1d / 19 / ...` | bounds 37 x 29 -> a 38x30 world |
| 5 | 0xA7D3 | 0x008033 | `25 01 c1 00 00 1e ...`; arm 0 @0xA833 = `2a 01 7d a9 01 c0 00 01 bf 00` | 30-row `ON_GOTO`, each arm `GETTABLE` with the row base advancing by 0x26 = 38 |
| 5 | 0x845A | 0x005CBA | `09 00 01 01 9d 00` then `26 01 cb 00 00 10 ...` | impassable handler: sets the refusal latch, `ON_GOSUB` over 16 terrain arms ("THE MOUNTAINS BLOCK YOUR WAY.", "YOU NEED A SHIP TO TRAVEL ON THE OCEAN.", ...), then `GOTO 0xA76A` |
| 5 | 0xA76A | 0x007FCA | `09 00 00 01 9c 00 09 00 ff 01 03 00 00` | reject tail - never reaches the commit at 0xA6E1/0xA6E8, so a refused move leaves the pose untouched |
| 5 | 0x88D2 | 0x006132 | `03 01 ca 00 00 0f 16 01 01 82 a3` | `COMPARE [0x00CA],#15 / IF_EQ / GOTO 0xA382` inside `searchLocation` - only high nibble 15 reaches the location dispatch |
| 5 | 0xA388 | - | `25 01 cb 00 00 10 ...` | ten named destinations; arm 2 @0xA3E9 prints "THE CITY OF KRISTOPHAN." and @0xA40C `20 00 26` `NEWECL #38` |

Overland cells: (3,4)=0xF0 @`0x008278`, (4,4)=0xC0, (5,4)=0xF2, (2,4)=0xDF. The nine 0xFx cells:
(30,0)=0xF7, (4,1)=0xF1, (3,4)=0xF0, (5,4)=0xF2, (17,7)=0xF3, (24,22)=0xF4, (21,23)=0xF5,
(31,23)=0xF6, (35,27)=0xF9. **No 0xF8 cell exists.**

`GEO.GLB` area 18 = member 5 (base `0x001F5E`, header `10 0b 01 08 09 08 09 20` = 16x11); plane 2
starts at file `0x0020C6` and contains **exactly one** byte with low-7-bits 1: cell (12,10) at file
`0x002172` - the south edge of the map, matching the facing-south guard.

> CORRECTION (R4, round 29): the "16x11" shape is stated backwards. `packages/engine/src/loaders/
> geo.ts`'s corrected `decodeGen2GeoBlock` (commit `dc12cd1`) reads header byte 0 as height and byte
> 1 as width, so header `10 0b ...` decodes to h=16, w=11 -- i.e. the real shape is **11 wide x 16
> tall**, not "16x11" read as (width, height). The file offsets and the byte value (low-7-bits 1,
> exactly one hit) are unaffected and still correct. The `(12,10)` label was computed against the
> wrong stride (w=16): plane-2 idx = `0x002172 - 0x0020C6` = 172; under the real stride w=11, idx
> 172 -> `(172 % 11, 172 // 11)` = **`(7,15)`**, still the south edge (y=15 is the last row of a
> 16-row map) -- the "matching the facing-south guard" conclusion survives, only the label was
> stale. This same offset (`0x002172`) and byte are cited again, and re-confirmed at the byte level
> but not re-derived to `(x,y)`, in this document's own "WILDERNESS - refuter verdict" section
> below (the area-18 Hizden exit is this doc's `wilderness` leg's own first hop, per the leg table
> above: "18 -> 5 -> 38"); that restatement carries the same stale `(12,10)` label and needs the
> identical fix. See `docs/engine/research/dqk-geo-shape-audit.md`.

## Negative controls and their measured outcomes

| Control | Measured outcome |
| --- | --- |
| Area 18 trigger specificity | descriptor 1 + facing SOUTH -> `chain`, `chainBlockId 5`, pose (3,4), backdrop 240, the Hizden prompt. Descriptor 1 with north/east/west -> `exited`, no text, no chain. Descriptors 0,2,3,9,33 facing south -> `exited` |
| Prompt polarity | answering NO -> `exited`, pose undefined, backdrop undefined, no chain |
| Arrival-table selectivity | source 18 -> (3,4)/realm 11/240; source 46 -> (21,23)/realm 1/`[0x0026]=8`/241 (the Y>14 second-page remap at 0x80FC/0x8103); **source 7 (an area that exists but is not in the 9-entry table) -> none of the six addresses written at all** |
| Terrain gating from (3,4) | west -> (2,4)=0xDF, `[0x00CA]=13`, "YOU NEED A SHIP TO TRAVEL ON THE OCEAN.", pose still (3,4). south -> same refusal. north -> (3,3)=0xB0, `[0x00CA]=11`, no text, pose commits |
| Strait gate (east onto 0xC0) | VM pauses: "A FISHERMAN VOLUNTEERS TO SAIL YOU ACROSS THE STRAITS..."; `resume(0)` commits (4,4) + "YOU SAIL ACROSS THE STRAITS."; `resume(1)` leaves (3,4) |
| High-nibble specificity | (5,4)=0xF2 -> chain 38; (37,26)=0xB2 (same LOW nibble, high 11) -> `exited`, no chain; (37,29)=0x92 -> `exited`; plain cells (3,3),(10,5),(20,18) -> `exited` |
| All nine 0xFx cells | Nine cells, nine **distinct** `chainBlockId`s: (3,4)->18, (4,1)->22, (5,4)->38, (17,7)->26, (24,22)->30, (21,23)->46, (31,23)->50, (30,0)->58, (35,27)->54 |
| Retail state gates on the crossings | (17,7): `[0x0072]=0` -> chain 26; `=1` -> `exited`; `[0x0106]=1` -> `exited`. (24,22): `[0x0106]=0` -> chain 30; `=1` -> "THE FORTRESS CITY OF NEW AURIM." + "YOU CAN NOT ENTER", no chain. (30,0): `[0x0113]=0` -> silent chain 58; `=1` -> "THE GNOME CITADEL OF ALDINANACHRU. DO YOU ENTER?" then chain 58 |
| Refused-move latch | (5,4) with `[0x009D]=1` -> `searchLocation` exits immediately at 0x8847, no text, no chain |
| Dialect independence | Identical under plain `ECL_GEN2` and `ECL_GEN2_DQK_AREA5` |
| Continuous route on ONE shared memory map | leave Hizden -> chain 5 -> arrival (loadFiles GEO 2 + picture 240, realm 11, `[0x009C]=1`/`[0x009D]=1`) -> first step swallowed by the arrival latch -> west/south ocean refusals -> north (3,3) -> south (3,4) chains 18 (Hizden re-offered) -> east + accept boat (4,4) -> east (5,4) chains 38 with "THE CITY OF KRISTOPHAN. DO YOU ENTER?" |

## Proposed golden test

New file `packages/engine/test/dqkWilderness.test.ts` (**do NOT extend
`dqkArea5Overland.test.ts`**, which owns the early leg's `campInterrupted` proof). Seven cases: the
Hizden trigger matrix + the unique GEO descriptor-1 cell; accept/decline chain behaviour; the arrival
table for sources 18/46/7; terrain gating in four directions incl. the fisherman prompt; the nine
0xFx crossings + the non-0xFx controls + "no 0xF8 cell"; the retail flag gates; and the continuous
single-memory route asserting the exact committed-pose chain
`[(3,4),(3,4),(3,4),(3,4),(3,3),(3,4),(4,4),(5,4)]` with an explicit assertion that the first
post-arrival `vmRun1` is swallowed by the `[0x009C]` arrival latch.

**Framing correction the writer must apply** (refuter): the genuinely NEW proof is (1) area 18's exit
block, (2) area 5's arrival table, (3) area 5's 0xFx region dispatch. Case 4 and the grid-dimension
half of case 5 substantially duplicate what `packages/engine/src/world/dqkArea5Overland.ts` and
`packages/engine/test/dqkArea5Overland.test.ts` already ship and pin; cite the movement machinery as
already-proven support rather than re-proving it.

## What is NOT claimed (wilderness)

- **Area 5 is NOT avoided, because it cannot be.** DQK ships exactly one overland map and it is area
  5's inline table. What IS claimed is that this leg is byte- and handler-disjoint from the proven
  early leg: early = area 5's `campInterrupted` far pointer (0x83FD) at cell (30,3)=0xE5 with the
  ZOMBIE x4 encounter; this leg = area 18's own vmRun1/exit block, area 5's `eclInitialEntry` (0x8014)
  arrival table, and area 5's `searchLocation` (0x8847) dispatch at 0xA382, at cells
  (3,4)/(3,3)/(4,4)/(5,4). They share area 5's movement machinery (0x8429) at different cells with no
  overlapping instruction reached. **If the reviewing standard is "no shared area id at all", this leg
  must be downgraded** - flagged, not hidden.
- No live browser wiring; Greybox has no overland UI mode and no `?explore=dqk-*` wilderness profile.
- **The terrain-driven RANDOM ENCOUNTER path is NOT proven** (searchLocation -> `GOSUB 0x8A47` ->
  `RANDOM #2`/`RANDOM #100` -> 16 terrain arms with thresholds 10/10/11/11/11/11/40/40/40/18/10/70 ->
  encounter table at 0x8C29). Deliberately excluded because that table is **shared with the early
  leg's** `campInterrupted` entry. Note that every other game's wilderness leg in this corpus
  (notably Gateway's) includes retail wandering combat; DQK's passes on the *crossing* precedent
  (CoK/Pool/CoAB), not on encounter parity.
- The memory addresses used are the clean-room VM's logical ECL keys (as `dqkArea5Overland.ts`
  already documents), **not** proven original DQK.EXE DGROUP offsets.
- Arm 8 of the destination dispatch ("THE TOWER OF FLAME" -> `NEWECL #62`) has **no** corresponding
  cell in the retail table (no 0xF8 byte exists). How the Tower of Flame is reached was not
  investigated.
- The realm/wall-set values and the meaning of backdrop pictures 240/241 are described from the bytes;
  no art was decoded and no claim is made about how the overland map is drawn.
- Only sources 18, 46 (positive) and 7 (negative) were executed; the other table entries are strongly
  implied but not individually run.
- Area 18's descriptor-1 cell was verified to exist and be unique, but **full walkability of area 18's
  interior to (12,10) was not traced.**
- `tools/dqk_ecl_combat_scan.py`'s Gen2 opcode table differs from the engine's for 0x0C (3 vs 4),
  0x22 (2 vs 0) and 0x23 (4 vs 0). Every instruction cited was re-derived with the engine's own
  disassembler, but the python tool's framing for those three opcodes should be treated as suspect.

---

# Leg: QUEST - **proven** - `[0x0187]` bit 0x20, areas 55 (setter) -> 54 (reader)

## Byte evidence

`ECL.GLB` (456,526 B, sha256 `40542071...c3664d`), 48 members, 47 area ids. Area 54 -> member 36
(file base `0x051D60`, 11,824 B); area 55 -> member 37 (file base `0x054B90`, 3,136 B).

Area 55 header: `01013c8c 01013d8c 01013a8c 01013b8c 01011480` -> `vmRun1 0x8C3C`,
`searchLocation 0x8C3D`, `preCampCheck 0x8C3A`, `campInterrupted 0x8C3B`, `eclInitialEntry 0x8014`.
The first four are one-byte `EXIT` stubs (all four bytes at 0x8C3A..0x8C3D are 0x00) - area 55 is a
chained interior-scene block with no walkable map, and correspondingly has no `GEO.GLB` entry.

Area 54 header: `01014a81 01019783 01016f80 0101fa80 01011480` -> `vmRun1 0x814A`,
`searchLocation 0x8397`, `preCampCheck 0x806F`, `campInterrupted 0x80FA`, `eclInitialEntry 0x8014`.

| area | vaddr | file | hex | decoded |
| --- | --- | --- | --- | --- |
| 55 | 0x8014 | 0x054BA4 | `09 0037 0116 00` then `25 018d01 0004 011384 012c80 01908a 01308b` | `SAVE #55,[0x0016]` ; `ON_GOTO [0x018D],#4 -> {0x8413, 0x802C, 0x8A90, 0x8B30}`. Selector 1 = the Hamhand house |
| 55 | 0x80CE | 0x054C5E | `0201198c` `0301bf000001` `1b` `0101e282` | `GOSUB 0x8C19` (the menu) ; `COMPARE [0x00BF],#1 / IF_GE / GOTO 0x82E2` |
| 55 | 0x8C19 | 0x0557A9 | `2b 01bf00 0003 80 09 .. 80 05 .. 80 06 ..` | `HORIZONTAL_MENU [0x00BF],#3` -> "BE FRIENDLY","COERCE","THREATEN" |
| 55 | **0x80DD** | **0x054C6D** | **`30 018701 0020 018701`** | **`OR [0x0187],#32,[0x0187]` - the sole bit-0x20 setter in the entire corpus** |
| 55 | 0x82DF | 0x054E6F | `20 0036` | `NEWECL #54` back to town (after "...EASTERN EDGE OF THE HARBOR.'" and three more paragraphs ending "PLACE.'") |
| 54 | 0x83B6 | 0x052116 | `2f 012d00 007f 019b00` | `AND [0x002D],#127,[0x009B]` - the Gen2 packed cell descriptor |
| 54 | 0x83CA / 0x83D3 / 0x83E7 | - | `03019b00019a00 16 00` / `2f018701000101bf00` / `2f0040019b0001bf00` | same-cell guard ; `AND [0x0187],#1` diversion ; `AND #64,[0x009B]` diversion |
| 54 | 0x8404 | - | `2501bf000014 ...` | `ON_GOTO [0x00BF],#20`, arm[5] = 0x977F (descriptor 6 - 1 = index 5) |
| 54 | **0x977F** | **0x0534DF** | **`2f018701002001bf00 0301bf000000 17 01019c97 090001018d01 200037 128015`** | **`AND [0x0187],#32,[0x00BF]` ; `COMPARE [0x00BF],#0` ; `IF_NE` ; `GOTO 0x979C` ; `SAVE #1,[0x018D]` ; `NEWECL #55` ; `PRINTCLEAR` "THE HOUSE IS EMPTY AND DARK."** |
| 54 | 0x8A66 | 0x0527C6 | `2f018701003001bf00 0301bf000030 17` | `AND [0x0187],#48,[0x00BF] ; COMPARE [0x00BF],#48 ; IF_NE` - only with BOTH bits does 0x8A7A print the "YOU RECOGNIZE JENNIFER AND OLEG HAMHAND, AND ERIC STRONGBOND." recognition text |
| 54 | 0x92CF | 0x05302F | `30 018701 0010 018701` | `OR [0x0187],#16,[0x0187]` - bit 0x10's only setter, area 54's own Eric Strongbond scene |

**Uniqueness, three independent sweeps.**
Pass 1 (CFG-reachable stores with literal destination 0x0187, all 47 areas): area 54 @0x92CF (0x10),
@0x9B36 (0x80), @0xA114 (0x40), @0xA7D1 (0x04), @0xAA73 (0x08); area 55 @0x80DD (0x20). Exactly one
site touches bit 0x20.
Pass 2 (linear decode at **every** byte offset, reachable or not): five extra decodes, all inside
area 54, none setting bit 0x20.
Pass 3 (raw byte scan, decoder-independent): the three-byte operand encodings of address 0x0187
(`01 87 01`, `02 87 01`, `03 87 01`, `81 87 01`) occur **36 times** in the whole corpus - 33 in area
54, 3 in area 55, **zero in the other 45 areas**.
Refuter-added pass 4: a scan for any `SAVE` (0x09) whose destination operand is 0x0187 finds **none**
anywhere - so no wholesale word write can set bit 0x20 either. A re-run of the `SAVE_TABLE` (0x35)
census over CFG-reachable boundaries in all 47 areas finds 105 sites, **none** in area 54 or 55.

**GEO grounding.** `GEO.GLB` (48,114 B, sha256 `fd843561...7a2d1`), 20 maps. Area 54 -> member 16,
23x21, 1,940 B (= 8 + 4*23*21), header `17 15 09 11 08 08 01 0c`. The backdrop plane starts at file
`0x00919C` and contains exactly six cells with byte `0x86` (`0x86 & 0x7F = 6` -> ON_GOTO arm 5 ->
0x977F): (12,6)/`0x009232`, (13,6)/`0x009233`, (10,7)/`0x009247`, (11,7)/`0x009248`,
(8,8)/`0x00925C`, (9,8)/`0x00925D`. Planes 0/1/3 contain zero 0x86 bytes. Descriptor `0x01` appears
57 times. **The VM proofs feed the literal retail byte 0x86, not a synthesised 6.**

> CORRECTION (R4, 2026-09-02): the "23x21" shape and the six (x,y) labels above used the wrong byte
> order (width/height swapped against `packages/engine/src/loaders/geo.ts`'s corrected, corroborated
> `(height, width)` reading). The file offsets, the descriptor value 0x86, and the six-cell count are
> all still correct; the real shape is 21 wide x 23 tall and the real cells are
> (3,7)/(4,7)/(3,8)/(4,8)/(3,9)/(4,9). See "Browser route (`?dqk=quest` Phase A, R4, 2026-09-02)"
> below for the full diagnosis. This does not affect any setter/reader byte pin in this section.

**Area reachability.** All four area-54 `NEWECL #55` sites write the selector first: 0x857B
`SAVE #2`, **0x9793 `SAVE #1`**, 0xA11D `SAVE #0`, 0xAA18 `SAVE #3` - matching area 55's four ON_GOTO
arms. **Selector 1 (the Hamhand house) is written at exactly ONE site in the corpus, 0x9793, sitting
directly under the bit-0x20 gate** - the house scene has a single entrance and it is the gated one.
Area 55 chains back to 54 at 0x82DF/0x8410/0x8423/0x8B2D/0x8BA9/0x8C16.

## Negative controls and their measured outcomes

| Control | Measured outcome |
| --- | --- |
| READ, flag clear, descriptor 0x86 | `status 'chain'`, `chainBlockId 55`, `[0x018D]=1`, zero print effects |
| READ, `{0x0187: 0x20}` | `status 'exited'`, no chain, `[0x018D]` never written, prints exactly `['THE HOUSE IS EMPTY AND DARK.']` |
| **Bit-specificity** - `{0x0187: 0x10}` (a DIFFERENT bit of the SAME word, one area 54 itself sets) | Still `chain`/55/`[0x018D]=1`. The divert is caused by bit 0x20 specifically, not "the word is nonzero" |
| Bit dominance - `{0x0187: 0x30}` | `exited` + the empty-house text. Bit 0x20 alone decides |
| Descriptor-specificity - 0x07 with the flag clear | `exited`, "A DARK AND EMPTY ROOM.", no chain, `[0x018D]` never written |
| Prologue guard - `{0x009A: 6}` (same-cell latch armed) | `exited`, **zero** print effects, no chain |
| WRITE side | The VM pauses at the retail `HORIZONTAL_MENU` with items `['BE FRIENDLY','COERCE','THREATEN']`, `destAddr 0x00BF`; `resume(0)` sets `[0x0187]=0x20` and chains to 54 |
| WRITE-side control (a real terminal branch through the SAME NPC) | THREATEN then vertical-menu item 0 "DEMAND TO KNOW WHAT GODS THEY WORSHIP." -> ends "...YOU CAN GET NO MORE OUT OF THEM." and `memory.has(0x0187) === false` |
| Selector control - `{0x018D: 0}` | ON_GOTO arm 0 (0x8413, a different building), "A SMALL, STRANGELY DEFORMED DRAGON DRAGS ITSELF OUT OF THE BRUSH.", never touches `[0x0187]` |
| END TO END over one shared memory Map | (1) town descriptor 0x86 -> chain 55, `[0x018D]=1`; (2) area 55 from 0x8014, answer 0 -> `[0x0187]=0x20`, chain back to 54; (3) a street cell then area 54's own `vmRun1` @0x814A `SAVE [0x009B],[0x009A]` latches `[0x009A]=1` (no hand-poked memory); (4) descriptor 0x86 again -> `exited`, prints exactly `['THE HOUSE IS EMPTY AND DARK.']`, no chain |

**A control that FAILED, reported by the finder itself:** the first write-side control (COERCE then
vertical-menu item 1 "ASK WHAT IS GOING ON IN BAI'OR.") DID set the bit, because area 55 @0x83B0
`GOTO 0x80DD` re-converges that branch onto the same OR site. That control was invalid and was
replaced by the item-0 terminal branch above.

**A method note the finder recorded:** the corpus-wide census initially used a *word-granular* filter
("readers in areas that never write the word"), which **hides bitfield flags** because the owning
areas both read and write the byte - that filter returned 0x0187 as a non-candidate. Only the
per-**bit** re-run surfaced it. The earlier project convention is insufficient for Gen2 bitfields.

## Proposed golden test

New file `packages/engine/test/dqkQuest.test.ts` (no existing test touches areas 54/55 or `[0x0187]`).
Six cases: (1) raw-byte pins for the setter `[0x30,0x01,0x87,0x01,0x00,0x20,0x01,0x87,0x01]` at
a55 offset 0x00DD and the reader prefix at a54 offset 0x177F, plus the two header assertions;
(2) GEO area 54 is 21 wide x 23 tall with 0x86 at the six corrected cells; (3) read/flag-clear -> chain 55;
(4) read/flag-set -> the empty-house text; (5) the four negative controls (bit 0x10, bit 0x30,
descriptor 0x07, same-cell latch); (6) the write side plus the end-to-end run over one persistent
memory map, including the separate-memory THREATEN control asserting `memory.has(0x0187) === false`.
Every assertion was measured green against the retail files by both the finder and the refuter.

## What is NOT claimed (quest)

- **Not claimed: that the retail DOS engine physically preserves `[0x0187]` across its own `NEWECL`
  or across a `SAVGAMA.QSV` save/reload.** That needs a native trace, which this task forbids. *(The
  refuter argues this limit is too conservative - see the verbatim correction below: the retail
  script itself writes `[0x018D]` and then immediately `NEWECL #55`, whose first instruction is
  `ON_GOTO [0x018D]`, so the shipping game would be broken if that sub-0x8000 region did not survive
  the area change. That is an in-corpus structural argument, still not a native measurement.)*
- **Not claimed: that the 98 `SAVE_TABLE` sites with a RUNTIME index can never alias into 0x0187.**
  Only 7 of 105 have a literal index and none hits 0x0187. The literal bases in play are 0x0001,
  0x0006, 0x006F, 0x0097, 0x00B5, 0x00B8, 0x014C, 0x0164, 0x0169, 0x0191, 0x02BD, 0x0348, 0x0359,
  0x0390, 0x0398, 0x041F, 0xAE37, 0xAE6A; every one sits in a bit-array helper of shape
  `DIVIDE [0x00BF],#8 / GETTABLE base / OR / SAVE_TABLE`, so the offset is a flag-ordinal/8; the
  nearest base that could reach 0x0187 is 0x0169, needing a flag ordinal near 240. **No caller's
  ordinal was symbolically bounded.** None of these sites is in area 54 or 55.
- **Not claimed: a step-by-step legal walk from a DQK game start to Bai'Or cell (12,6).**
- Not claimed: correctness of the CFG walker's reachability model. The raw byte evidence, passes 2
  and 3, and the VM runs do not depend on it.
- Not claimed: the narrative label. The mechanical claim does not depend on it.
- Not claimed: browser/live wiring; nothing was wired into `apps/web`, no explore route, no save-v2
  row.
- Not claimed: that `[0x0187]` bit 0x20 is the only viable DQK quest candidate. The bit-level census
  surfaced ~35 single-setter-area cross-area bits; several look equally real (`[0x0158]` bit 0x02 set
  only by area 36 @0x8548, tested only by area 34 @0x904B; `[0x0176]` bits 0x08/0x40 area 47 -> 46;
  `[0x00B9]` six bits area 48 -> 46; `[0x013A]` bit 0x01 area 23 -> 22). Those are **unverified leads,
  not findings.**
- **Taxonomy caveat (refuter):** Secret's Sixth Route - the cited precedent - requires the reader to
  be a "DIFFERENT, non-adjacent block". Areas 54 and 55 are directly adjacent, and reader #1 is the
  door cell of the very house the setter lives in. Defensible (the bit is knowledge-conditional, not
  a plain visited marker, and reader #2 is a genuinely different scene) and better grounded than the
  precedent on GEO evidence and controls - but the adjacency delta must be stated, not left implicit.
- **Reader #2 is cosmetic-only** (refuter): both branches of 0x8A66 converge at 0x8AC8
  `SETUP_MONSTER #255,#0,#64`; the flag-set path adds only three PRINT lines and a `PARTYSTRENGTH`
  pause. The **only load-bearing content change** is reader #1 at 0x977F.

### Browser route (`?dqk=quest` Phase A, R4, 2026-09-02)

`apps/web/src/ui/dqkExplore.ts` now ships a QUEST-leg driver (`runDqkQuest`, `questSearchLocation`,
`questVmRun1`, `questArea55`, `questRunStreetStep`, `driveQuestTurn`) exposed as
`window.__dqk.startQuest()` / `.memory(addr)` / `.lastChain()` / `.lastTexts()`. It is a direct,
line-for-line mirror of `packages/engine/test/dqkQuest.test.ts` (necessarily a separate copy — this
repo's engine tests never import UI code) and drives the SAME `dialogueForCell` / `dialogueForVmRun1`
/ `EclVm` / `DialogueRunner` primitives against the same retail `ECL.GLB` bytes described above. No
GEO map is mounted for this leg and no `Explorer`/wall-walking is involved — the house/street cell
descriptors (0x86, 0x01) are fed directly into the VM, exactly as this document's own byte evidence
names them, per the round's instruction that "the chain must not try to mount a map." **What remains
host-modelled, stated explicitly:** (1) the auto-answer of menu index 0 at area 55's `HORIZONTAL_MENU`
(BE FRIENDLY) — a choice, not a measurement; (2) the two entry-state seeds `dqkVmRun1Seed` always
supplies, `[0x16]=4` (area 4/Palanthas convention reused here, unrelated to areas 54/55's own logic)
and `[0x9c]=2`, carried over unchanged from the sibling `dqkEvents`/`dqkCampaignLegs` driving
convention rather than independently re-derived for this leg; (3) the decision NOT to run area 54's
own default `eclInitialEntry` after the chain back from 55, and NOT to follow the street SearchLocation
step's own offered chain to area 5 (the "DO YOU LEAVE BAI'OR?" town-exit prompt) — both are host
choices about which of several real, byte-grounded branches to take, not inventions of a branch that
does not exist. Everything else in the sequence below is an observed VM-run byte, not a model.

**A second data-correction found while wiring this** (independent of the setter/reader byte
evidence above, which stands unchanged): this document's "GEO area 54 is 23x21" claim and its six
named cells `(12,6)/(13,6)/(10,7)/(11,7)/(8,8)/(9,8)` are **wrong in a specific, diagnosed way**.
`packages/engine/src/loaders/geo.ts` decodes the on-disk header as `(height, width)` — a fix already
made and corroborated against all 8 non-square retail Gen2 maps — and this document's cell math was
done against the opposite convention. (R4's first draft of this paragraph blamed a stale
"byte 0 = width, byte 1 = height" comment left standing in `geo.ts`. **There is no such comment.**
`decodeGen2GeoBlock` states the HEIGHT-then-WIDTH order outright and carries its derivation from
DQK.EXE's `GetFacingWallType` at `2f0d:0628`; the only "W×H" text in the file is a descriptive size
phrase, not a byte-order claim. The decoder was never stale — the error is this document's alone,
and inventing an accomplice for it in correct code was itself a second error.) The real decoded shape is **21 wide x 23 tall**,
and the real six 0x86 cells are **(3,7)/(4,7)/(3,8)/(4,8)/(3,9)/(4,9)** — the SAME underlying backdrop
bytes and file offsets the finder cited (plane offsets 150/151/171/172/192/193 from base 0x00919C),
decoded with the real stride (21) instead of the assumed one (23); `150 = 7*21+3`, matching. The
descriptor value (0x86), the count (exactly six), and every setter/reader byte pin above are
unaffected — only the (x,y) labels were wrong. `packages/engine/test/dqkQuest.test.ts` case B pins
the corrected shape and coordinates directly from `Gen2GeoMap`, not from this document's prose.

**Both arms, actually driven and observed** (not merely asserted for one), against the real retail
bytes, two independent memory Maps:

| Arm | Steps | Observed |
| --- | --- | --- |
| B (fresh memory, flag clear) | `questSearchLocation(a54, 0x86, freshMemory)` | `chain=55`, `memory[0x018D]=1`, zero print effects |
| A (fresh memory, full route, flag set) | (1) house 0x86 -> `chain=55`, `[0x018D]=1`; (2) area 55 body, auto-answer 0 -> `[0x0187]=0x20`, `chain=54`; (3) street SearchLocation on descriptor 0x01 -> recomputes `[0x009B]=1`, itself offers `chain=5` (declined) and prints "DO YOU LEAVE BAI'OR?"; (4) area 54 vmRun1 on the same descriptor -> `SAVE [0x009B],[0x009A]` latches `[0x009A]=1`; (5) house 0x86 again -> `end`, `chain=null`, texts exactly `['THE HOUSE IS EMPTY AND DARK.']` |

Step (3)'s two-call shape (SearchLocation, THEN vmRun1) is load-bearing, not incidental: `[0x009B]`
(the masked cell descriptor) is recomputed ONLY inside SearchLocation's own prologue
(`AND [0x002D],#127,[0x009B]` @0x83B6); vmRun1 only copies whatever is ALREADY in `[0x009B]` into
`[0x009A]`. Skipping the SearchLocation call and running vmRun1 alone leaves `[0x009B]` holding the
HOUSE cell's stale masked descriptor (6) from step (1), so the latch sets `[0x009A]=6` too — which is
byte-for-byte this leg's own "prologue guard armed" negative control, and the final house re-entry
then guards out silently (`end`, zero texts) instead of printing the empty-house line. This was
caught live while wiring the browser route (an initial one-call version of step 3 produced exactly
that false negative) and is recorded here so it is not rediscovered the hard way.

**Not yet done (Phase B, out of this round's scope):** the `?dqk=quest` URL parameter itself is not
wired into `apps/web/src/ui/main.ts`; the seam is reachable only via `window.__dqk.startQuest()` after
`startDqkExplore()` has mounted normally. No e2e case exists yet. Verification of the above table was
done by running `apps/web/src/ui/dqkExplore.ts`'s logic (confirmed via `tsc --noEmit` and a full
`pnpm build:app`) mirrored 1:1 against `packages/engine/test/dqkQuest.test.ts`, which DOES execute
against the real retail bytes under Vitest; the browser build itself was not driven through an actual
browser session in this round (the full e2e run was out of scope), so the exact numbers above are
engine-side-verified and browser-side-compiled, not browser-side-executed.

---

# Refuter corrections, verbatim

Every refuter's `correctedClaims` is reproduced below **verbatim**, including for the leg whose
verdict was downgraded. Where a refuter says the finder was right, that is kept too.

## MIDDLE - refuter verdict: NOT refuted, surviving verdict `proven`

> OVERSTATED (label rationale, not the leg): 'area 31 sits at depth 3 of a maximum depth 5 ... 2 of 47 areas are unreachable in that graph.' Building the NEWECL edge graph with the repo's own dqk_ecl_combat_scan.collect_boundaries and BFS from area 1, I get max depth 5 and area 31 = depth 3 (area 5 = 1, area 30 = 2) under EVERY dialect variant, but the unreachable set is never 2: baseline {7,10,27,28,34,35,36,51,65,66,67} = 11; the finding's own {0x1f:1,0x2c:1,0x37:2} = 10; adding 0x0c:4 = 8 ({7,27,28,34,35,36,51,65}). Its 'depth-4/5 tail (35, 36, 42, 66, 43, 67)' is also wrong: 35 and 36 are unreachable in every variant, and 66/67 are unreachable under the finding's own three-fix dialect. Only 42/66/43/67 (with 0x0c:4) are genuine depth 4/5. Corrected: area 31 is depth 3 and strictly downstream of area 5 via area 30 - that part reproduces - but the 'strictly upstream of the tail' framing and the unreachable count do not.

> IMPRECISE CITATION: 'PRINT 25a4:1cd3 = file 0x041F93 `b0 01` (one).' DQK.EXE 0x041F93 actually holds `55 8b ec 83 ec 02 c4 1e 0f b2 26 8a 47 39 88 46 ff 80 7e ff 00 74 06 c6 46 ff 03 eb 04 c6 46 ff 07` and only THEN `b0 01 50 9a 13 00 33 20 59` at 0x041FB3 (+0x20). The offset is the function entry, not the `b0 01` site. The substance (PRINT parses one operand frame) is correct.

> OFF BY TWO: 'Correcting these frames changes the entry-reachable COMBAT census from 35 sites to 146.' Through the repo's own scanner with {0x1f:1, 0x2c:1, 0x37:2, 0x0c:4} I measure 144, not 146 (baseline 35, 0x1f-only 34 - that one reproduces exactly). Cosmetic; the finding already disclaims the number as 'the corrected scanner's output', and area 31 @0x92ef is present in all variants.

> UNDER-QUALIFIED: 'Corpus-wide the only ECL writers of NEWECL #31 are area 30 @0xa3d9 and area 32 @0xa9e6.' True for ENTRY-REACHABLE code (I confirmed exactly those two by CFG walk over all 47 areas). But a raw scan finds a third `20 00 1f` at area 1 @0x9614, and `--inspect-area 1 --inspect-vaddr 0x9614` decodes it as 'NEWECL #31' with header-cfg-reachable=False and direct-branch-xrefs=0, sitting between an EXIT and a garbage-looking 'CHECKPARTY #29,#28,#27,#26,#25,#24' (i.e. data). It is not a real writer, but the claim should read 'the only entry-reachable NEWECL #31 sites'. (Immaterial to the GEO-pairing argument either way: area 1 has no GEO map of its own.)

> OVER-LABELLED: 'persistent flag bit 28'. Persistence across save/reload is NOT proven - no round trip was run. What IS proven: the DIVIDE handler's `c4 1e 0f b2 / 26 88 57 29` (les bx,[0xb20f]; mov es:[bx+0x29],dl at DQK.EXE 0x032061..0x032068) shows ECL data space is a separate far buffer from the script stream ([0xae5c:0xae5e]+[0xb7f9]), so [0x014c..] is data-segment rather than script-image storage; and corpus-wide only areas 30/31/32 reference table base 0x014c (3 GETTABLE/SAVE_TABLE refs each), consistent with a per-city bitmap. Call it 'consumed state in the ECL data segment', not 'persistent', until a save round trip exists.

> UNSTATED ASSUMPTION worth recording: the `[0x0032]` gate at 0x9177 has NO ECL writer anywhere in areas 30, 31 or 32 (I scanned all three under the corrected dialect: three COMPAREs in area 31 at 0x9029/0x9145/0x9177, one in area 30 at 0x8c42, zero SAVEs). It is host-populated and read-only from script, so the assumption that its fresh value is 0 is unverified. NC4 is honest about the effect of setting it, but not about where it comes from.

> REPO-DOC ERROR the writer agent must not propagate (the finding is RIGHT and the checked-in doc is wrong): docs/engine/research/decompile-dqk-ecl-dispatch.md states the 25a4 overlay body file base is 0x0403d0, making its whole 'handler file offset' column off by 0x110. The correct base is 0x0402c0, which the finding uses. Independent derivation: the `jmp far 25a4:YYYY` thunk targets for 1d99:1297/12dd/12f1/1305/132d sit at DQK.EXE 0x2102b/0x21071/0x21085/0x21099/0x210c1 (each preceded by 0xEA), all consistent with one thunk base 0x1FD8F; and only base 0x0402c0 lands the handlers on `55 8b ec 83 ec NN` prologues (0x11 -> 0x041f93, 0x20 -> 0x04204d, 0x21 -> 0x0420ac, 0x27 -> 0x0423e7, 0x1f -> 0x043572, 0x37 -> 0x0434a8, 0x39 -> 0x0432a0), whereas 0x0403d0 lands mid-instruction every time.

> STRENGTH THE FINDING UNDERSELLS (not an error): the leg is NOT hostage to the contested `0x2c: 1` correction. Re-running the same retail block through the shipped `ECL_GEN2` (0x2c: 4) still reaches status 'combat' at 0x92ef; the decoder merely swallows the first LOAD_MONSTER, yielding a 3-group roster [{30,5},{28,3},{90,1}] instead of 4. The dialect fix is load-bearing for the ROSTER only, so the ECL_GEN2_DQK_AREA5 reconciliation the finding flags can be settled independently of whether this leg lands.

## ENDING - refuter verdict: **REFUTED**, surviving verdict `blocked`

The finder claimed `proven`. The refuter's summary of why it does not survive, in the refuter's own
words: *"the SAHUAGIN encounter itself is genuinely and reproducibly proven at engine level, and the
arm-0 dead-code refutation is a real, correct negative. But the two properties that make this an
ENDING leg rather than just another combat - (a) that area 66 is the terminal region, and (b) that
the ending/terminal mechanism is byte-traced - rest on a false topology claim, an untraced ingress,
and two unresolved host/cross-area gates (`[0x0032] != 0` and `[0x009A] == 4`) that were seeded open,
one of them with a fabricated provenance citation. Under this project's rubric that is inference, not
proof."*

Corrections, verbatim:

> FALSE: 'area 66 plus its paired area 67 form a closed two-node loop.' Area 66 has a CFG-reachable outbound chain at v0x8959 `20 00 40` NEWECL #64 (ON_GOTO arm 3, masked descriptor 3, GEO cells (16,18) and (6,20)), gated by the same COMPARE [0x0032],#0 / IF_EQ EXIT prologue at v0x8933 that the finding itself quotes for arm 6. Area 64's entry at v0x8014 does SAVE [0x16],[0x1a1] / COMPARE [0x16],#66 / IF_EQ / GOTO 0x84fc, and returns via NEWECL [0x01a1] at v0xa1a5. The late region is at minimum {62,63,64,65,66,67}.

> FALSE AS STATED: 'No literal NEWECL #65/#66/#67 exists anywhere else in the 47-area ECL.GLB corpus.' Literal `20 00 42` (NEWECL #66) also occurs at area 64 v0x84f9 (immediately before 0x84fc, which IS a live GOTO target from area 64's own 'came from area 66' branch at v0x8028) and at area 67 v0x8251; literal `20 00 41` (NEWECL #65) occurs at area 67 v0x93c6. A conservative CFG walk does not reach any of the three, so the weaker claim 'the only CFG-reachable inbound edge to 66 is area 67 v0x9658' survives - but the literal-byte claim as written does not.

> NOT REPRODUCIBLE AS STATED: negative control 'TERMINAL-ARM GATE: descriptor 142 ... with [0x00a0]=254 ... instead takes the terminal branch and prints the TOO LATE ... WELCOME TO THE ABYSS narration', and proposed golden Case 9 ('with memory {0xa0:254} -> text contains TOO LATE'). Run on retail bytes with dqkVmRun1Seed(142,'south',66) + {0x32:4, 0xa0:254} the runner returns {kind:'end', text:''} and never writes [0x9d]. The branch at v0x9d2a is additionally gated by `03 01 9a 00 00 04` COMPARE [0x009a],#4 / `17 00` IF_NE EXIT. Only with [0x009a]=4 also seeded does the 527-char scene fire (ending "'WELCOME TO THE ABYSS!'", mem[0x9d]=0x20, [0xa4]=255). The proposed Case 9 would fail as written.

> FALSE PROVENANCE: limits claim that the seeded host values '[0x0032] (the arm's admission gate) and [0x002d]/[0x0011]/[0x001b] ... are taken from the repo's existing, previously-validated DQK host contract in dungeonEvents.ts'. `grep -rn 0x0032 packages/engine/src/` returns nothing and dqkVmRun1Seed seeds only DQK_CELL_DESC_ADDR 0x002d, DQK_FACING_ADDR 0x0011, DQK_AREA_ADDR 0x001b. [0x0032] is an invented seed with no repo or retail grounding.

> UNDISCLOSED SEED: [0x009a]=4 is required for the entire terminal/ending scene (v0x9d2a in area 66 and the identical v0x965b in area 67) but is not listed anywhere in `limits`. A corpus scan shows area 66 and 67 never write [0x009a]; it is written only as area-local scratch elsewhere (areas 22/23 copy the masked cell descriptor [0x009b] into it, area 48 zeroes it, areas 14/15 copy [0x0032] into it) and is compared against 0, 2, 3, 4, 9 and 15 in six different areas. Its value on entry to area 66 is untraced.

> OVERSTATED: 'a natural, entry-reachable SAHUAGIN encounter'. The encounter fires only when host word [0x0032] is non-zero. A corpus-wide scan finds ZERO ECL writes to [0x0032] across all 47 blocks (reads only, in areas 14, 15, 35, 66), so it is host state whose meaning was not determined; the finding's own HOST GATE control shows [0x0032]=0 makes the arm exit before touching [0x009c]. 'Naturally reachable' is therefore assumed, not proven. (A supporting argument the finding never made: seven of area 66's ON_GOTO arms and its post-dispatch fallthrough at v0x86a5 all presuppose [0x0032]!=0 / [0x009a]==4, so an area 66 with them unset would be wholly inert - suggestive, still not proof.)

> CORRECT AND CONFIRMED (credit where due, do not re-litigate): the arm-6 disassembly, roster [{18,8,18},{59,4,59},{64,2,64}], eager consumed bit [0x009c]|=0x20 at v0x8cd9, COMBAT at v0x8db9, and six of the eleven controls all reproduce exactly on retail bytes; every GEO citation is exact (member 20, 22x34, 748 cells, floor 134 at (19,20)/(20,20), 142 at (9,7), 133 at (3,13)/(15,14), and the file offsets 0x0B7E5/0x0B7E6/0x0B6BD/0x0B73B/0x0B75D all recompute from base 0x0B03A + 8 + 2*748); and the arm-0 dead-code refutation of COMBAT 0x8746 holds - an exhaustive scan of area 66 for operand words landing in 0x86e6..0x8760 finds only 0x86db->0x874e, so nothing jumps into the tail.

> CORRECTION (R4, round 29): every `(x,y)` label in the two entries above is stale -- both the arm-3
> "GEO cells (16,18) and (6,20)" (masked descriptor 3) a few paragraphs up, and this entry's "floor
> 134 at (19,20)/(20,20), 142 at (9,7), 133 at (3,13)/(15,14)" (the SAME six cells the "middle" leg's
> "GEO pairing" paragraph cites above, already corrected there). The offsets and byte values in both
> entries are exact and unaffected -- this entry's own "the file offsets ... all recompute" claim is
> literally true, it is only the coordinate labels attached to those offsets that used the pre-fix
> stride. Re-derived against the real w=34: masked-descriptor-3 cells `(16,18)`/`(6,20)` ->
> `(4,12)`/`(4,13)`; floor-134 cells `(19,20)`/`(20,20)` -> `(17,13)`/`(18,13)`; floor-142 cell
> `(9,7)` -> `(27,4)`; floor-133 cells `(3,13)`/`(15,14)` -> `(17,8)`/`(17,9)`. See
> `docs/engine/research/dqk-geo-shape-audit.md`.

> SEPARATE, CONFIRMED: the leg does not silently reuse area 5 (the proven early leg) and does not duplicate packages/engine/test/dqkEvents.test.ts, which pins area 66's campInterrupted subroutine at 0x8398 - a different entry with a different five-group roster.

## TOWN - refuter verdict: NOT refuted, surviving verdict `proven`

> OVERSTATED: 'every one returns to the hub with GOTO 0x8296 -- a genuine in-town round trip.' TEMPLE does not complete a round trip inside a VM run: the VM pauses with status 'combat' at 0x8643 and the `01 01 96 82` GOTO 0x8296 at 0x8644 is only reached after a host-resolved combat. Five of the seven branches (PALACE 0x8515, INN 0x860b, HALL 0x8651, SHOP 0x8685, BAR via ON_GOTO 0x86b7 index 2) return within the run; TEMPLE's return is conditional on host resume. The finding's own golden case 6 handles this correctly, so this is a summary-prose imprecision only.

> UNPROVEN AS STATED: 'The 17x17 GEO area-4 map belongs to the post-exit Caergoth field phase.' The block contains exactly two LOAD_FILES #4,#4 -- at 0x8066, inside the Palanthas ARRIVAL init that runs BEFORE the town hub, and at 0x9e33 on the area-10 return path. The town->field transition at 0x894a-0x8975 performs NO load; it changes only resource sets ([0x0034]=3, [0x0035]=2) and facing ([0x0011]=1). GEO 4 is the area's single map, loaded on arrival in Palanthas. That the walkable phase is Caergoth is a well-supported interpretation (the field searchLocation handlers print Caergoth/harbour text, and selector 1 says the road WEST leads back to Palanthas), but it is not established by a phase-specific load, as the wording implies.

> LOOSE CENSUS: 'an entry-reachable menu scan over all 47 ECL.GLB areas shows town-shaped service hubs in areas 4, 5, 31, 32, 38, 40, 49 and 61.' My own entry-reachable HORIZONTAL_MENU census finds menus in 28 of the 47 areas (1,2,3,4,5,16,22,23,30,31,32,34,35,36,38,40,46,48,49,50,51,52,54,55,59,61,64,66). Of the eight named, only 4, 5 and 61 are settlement-shaped multi-service hubs; 31 is BLESS/HEAL/SPECIAL BLESS/LEAVE, 32 is REST/TALK/LEAVE and HEAL/REST/LEAVE, 38 is CITY/STAY/LEAVE, 40 is ASK ABOUT ORACLE/GET READING/LEAVE, 49 is GEMS/JEWELRY/NEITHER and BUY/SELL/NEITHER. The control's direction is right (area 4 is the richest unreserved hub) but the figure as stated is a judgment call presented as a scan result.

> UNDERSTATED (finding is more pessimistic than the bytes require): the limit 'I did NOT prove the exact host mechanism by which the party gets from the Caergoth field phase back into area 4's town hub' omits that area 4's OWN searchLocation dispatch contains one. ON_GOTO index 1 -> 0x8c2b: COMPARE 0x0011,#3 / IF_NE / EXIT / SAVE #0,0x0039 / PRINTCLEAR 'THE ROAD WEST LEADS BACK TO THE CITY OF PALANTHAS. ' / PRINT_RETURN / PRINT 'DO YOU WANT TO RETURN TO PALANTHAS?' / PARTY_SURPRISE c16:4,0x0009 at 0x8c82 (the short-dialect YES/NO prompt, per vm.ts's SURPRISE_RESULT_ADDR contract) / EXIT. The YES continuation is still untraced, so the limit is not wrong -- but the in-block return prompt should be cited rather than the mechanism described as wholly unlocated.

> VERIFIED-CORRECT, NOT A CORRECTION, but worth recording: the two disclosed VM modelling gaps are real. vm.ts:551 does read `const DIV_REMAINDER_ADDR = 0x7f3f;` (a COAB/Gen1 address) while DQK's 0xa43a/0xa473/0xa4ac all do `DIVIDE 0x00bf,#8,0x00bf` immediately followed by `SAVE 0x0029, 0x00c2`. Consequence: under the shipped VM the mask index is always 0, so the descriptor-5 one-shot lands on bit 0 instead of retail's bit 1 (0x8f30 seeds [0x00bf]=1). The byte INDEX is unaffected (both 0), so the consumed-state proof stands structurally; only the exact bit differs from retail.

> PROPOSED-GOLDEN IMPLEMENTATION BUG (not evidentiary): case 9's assertions `map.width === 17 && map.height === 17` and `map.cells.map(...)` will not compile/run. `decodeGen2GeoBlock` returns `{ map: { name, width, height, cells, entries, sharedEdges }, wallPlane0, wallPlane1, backdropPlane, doorPlane, id, member, header }` -- the width/height/cells assertions must go through `.map`. The asserted VALUES (17x17, header (9,3,17,17,7,4), 25 distinct masked descriptors including 5 and 6) are all correct.

> PROPOSED-GOLDEN IMPLEMENTATION BUG (not evidentiary): case 1's `decodeInstructionAt(block, 0x82d0 - 0x8000, ECL_GEN2)` passes the dialect into the `vbase` parameter. The real signature is `decodeInstructionAt(raw, offset, vbase = ECL_VBASE, dialect?)`, so this must be `decodeInstructionAt(block, 0x02d0, ECL_GEN2.vbase, ECL_GEN2)` (or the disassembleEcl path the other Gen2 tests use).

> MISSING CITATION (strengthens, not weakens): docs/engine/research/dqk-palanthas-palace-combat-route.md already records a live retail Unicorn trace reaching this exact hub (`b7f9=0x82d0`, decoding the same HORIZONTAL_MENU and ON_GOTO) from a loaded save slot, plus the standing correction that 0x8439 in this same block is a PRINTCLEAR length byte and not a COMBAT. The finding should cite it: it is independent evidence that area 4's town hub is reachable in genuine retail play, and it pre-empts the obvious false-positive objection to the 0x8643 COMBAT.

## WILDERNESS - refuter verdict: NOT refuted, surviving verdict `proven`

> "(30,3) = 0xE5 at file 0x008247" - the file offset is wrong. With the map base at 0x0081DD and stride 38, (30,3) is at 0x00826D (I read 0xE5 there). 0x008247 is cell (30,2) and holds 0xD7. The coordinate and the value are right; the offset is not.

> "(10,5)=0x2E" (negative control) - the byte at (10,5) is 0x21, at file 0x0082A5. The control's conclusion is unaffected (I re-ran it: exited, no chain, [0x00cb]=1), but the cited value is wrong.

> "GEO.GLB area 18 (member 5, file base 0x001EDE)" - the member base is 0x001F5E (`10 0b 01 08 09 08 09 20` starts there; 0x001EDE holds `00 00 08 08 00 00 ...`). The two offsets derived from it in the same sentence, plane 2 at 0x0020C6 and cell (12,10) at 0x002172, ARE correct - I read 0x01 at 0x002172 - so this is a typo in the base, not in the conclusion.

> CORRECTION (R4, round 29): the refuter's own re-confirmation above verified the FILE OFFSET
> (`0x002172` does hold `0x01`) but not the `(x,y)` LABEL derived from it, which is the same stale
> "(12,10)" this document's own earlier area-18 paragraph carries (see the correction attached
> there). Header `10 0b ...` is `(height, width)` = 16 tall x **11** wide, not "16x11" read as
> (width, height); plane-2 idx = `0x002172 - 0x0020C6` = 172; under the real stride w=11 that is
> `(172 % 11, 172 // 11)` = **`(7,15)`**. The byte-level conclusion ("this is a typo in the base,
> not in the conclusion") stands; the coordinate quoted alongside it does not.

> "Only the (1, south) pair fires" - over-scoped. The guard is `AND #127, [0x002d], [0x00bf]` at 0x8365, so EVERY descriptor whose low seven bits equal 1 fires; I verified descriptor 129 facing south also pauses with "LEAVE THE HAMLET OF HIZDEN? ". Area 18's vmRun1 also carries triggers the control set never covered: 0x837E `AND #120,[0x002d],[0x00c0]` / `COMPARE [0x00c0],#40` / IF_EQ / GOTO 0x85AB, and 0x8392 `COMPARE_AND [0x00bf],#56,[0x0011],#1` / IF_EQ / GOTO 0x83A3 (descriptor 56 facing east prints "THE DOOR IS LOCKED."). The correct claim is: within GEO area 18's actual descriptor plane, whose only descriptor-1 cell is (12,10), only facing south fires the Hizden exit.

> CORRECTION (R4, round 29): "(12,10)" in the sentence directly above is the same stale label
> corrected two paragraphs up — real cell **(7,15)**. The claim's substance ("only facing south
> fires the Hizden exit") is unaffected; only the coordinate is stale.

> The byteEvidence entry labelled "vaddr 0xA66D-0xA6CE" presents non-contiguous fragments as one stream. Between the two ANDs and the DIVIDE the retail code also has 0xA699 `COMPARE [0x00ca],#0` / 0xA69F IF_NE; between the DIVIDE and the hi==12 test it has 0xA6A9 `GOSUB 0xA777` / IF_EQ / `GOTO 0x85BB` and 0xA6B2 `SAVE [0x00bf],[0x00cc]`. Each quoted hex fragment is individually correct; the implied contiguity is not.

> "Arm 2 at 0xA3E9 prints 'THE CITY OF KRISTOPHAN.' and at 0xA408 GOSUB 0xa568; NEWECL #38" - incomplete attribution for the prompt. The "DO YOU ENTER?" half comes from `GOSUB 0xA576` at 0xA3FE (0xA579 PRINT "DO YOU ENTER?", 0xA586 PARTY_SURPRISE, 0xA587 IF_NE). 0xA568 is the post-accept `SAVE #1,[0x0022]` / CLEAR_BOX / `SAVE #0,[0x0024]` helper. The quoted prompt text and the NEWECL #38 at 0xA40C are correct.

> "There is no second overland map in DQK" rests on three hand-picked byte greps, which is weaker than the claim. A structural census I ran over all 47 members (every ON_GOTO/ON_GOSUB with >=6 arms where every arm begins with GETTABLE, checking row-base strides) finds a SECOND inline row-table the greps miss: area 46 @0x94AF, `ON_GOSUB [0x009c], #11`, row bases 0xA927 + k*73. It is a Hawkbluff puzzle grid (cells 0..3 and 0x63; the sibling `ON_GOSUB [0x00c1],#8` at 0xA365 names KEYHOLE/LANTERN/SWORD/QUILL/SWAMP), not a walked terrain map - so the conclusion holds, but it should be cited to the structural census, not to the three signatures.

> Scope, not evidence: the leg is NOT area-disjoint from the already-proven early leg, and its terrain-gating / 8-way-movement material substantially duplicates shipped code and tests. `packages/engine/src/world/dqkArea5Overland.ts` already decodes the 38x30 table and drives 0x8429/0x843B, and `packages/engine/test/dqkArea5Overland.test.ts` already pins the [0x00ca]/[0x00cb] derivation. Proposed golden Case 4 and the grid-dimension half of Case 5 are near-duplicates of existing assertions. The genuinely NEW proof is: area 18's exit block (0x8365 -> 0x8505 -> 0x8584 -> NEWECL #5), area 5's arrival table (0x809C loop + 0x833F rows + 0x80D7 apply), and area 5's 0xFx region dispatch (0x88D2 -> 0xA382). The write-up should be framed on those three, with the area-5 movement machinery cited as already-proven support rather than re-proved.

> Coverage caveat the finding discloses but which should be carried into the matrix citation: the wandering/random-encounter path (searchLocation -> GOSUB 0x8A47 -> per-terrain thresholds -> encounter table 0x8C29) is deliberately NOT proven here, and that table is shared with the early leg's campInterrupted entry at 0x83FD. Every other game's wilderness leg in this corpus (notably Gateway's) includes retail wandering combat, so DQK's wilderness leg passes on the crossing precedent (CoK/Pool/CoAB) and not on encounter parity.

**Refuter method note worth preserving:** *"my first pass appeared to REFUTE the [0x0113] gnome-citadel
control - it was a bug in MY harness (I overwrote result.effects on resume() instead of accumulating
across pauses). After fixing, it reproduced exactly. Flagging it so nobody re-derives the false
refutation."*

## QUEST - refuter verdict: NOT refuted, surviving verdict `proven`

> FALSE AS WRITTEN: 'NEWECL #54 appears exactly once outside area 55: ECL area 5 at vaddr 0xA551.' There is a SECOND genuine occurrence - ECL area 1, vaddr 0x90A9, offset 0x10A9, file 0x00123B, bytes `20 00 36`, which the project decoder resolves as `NEWECL #54`. It sits in what is plainly a developer debug-warp table (the adjacent linear decode emits the string "GOING TO THE GNOME CITADEL OF ALDINANACHRU IN ECL58?" and a run of SAVE-to-position writes), and the tool reports it as header-cfg-reachable=False. This ADDS an entry point rather than removing one, so it does not weaken the finding, but the stated exhaustiveness is wrong. Correct wording: 'NEWECL #54 occurs outside area 55 exactly twice: area 5 @0xA551 (the proven early leg) and area 1 @0x90A9 (a non-CFG-reachable developer debug-warp table).'

> MISCHARACTERIZED: uniqueness pass 2 calls a54 0x8B24 `2f01870100bf018701` and 0x8B2D `300187010001018701` 'operand-alignment artifacts of the reachable PARLAY at 0x8B1B.' They are not artifacts. The linear forward decode from 0x8B24 is fully coherent retail content: AND [0x0187],#191,[0x0187] (clears bit 0x40); OR [0x0187],#1,[0x0187]; SAVE #0,[0x002E]; SAVE #0,[0x001A]; PRINTCLEAR "A DELEGATION OF TOWN ELDERS, LED BY " / "ANTHELA, COMES OUT OF HIDING. " / "'THANK YOU, BRAVE NEWCOMERS. YOU HAVE SAVED BAI'OR FROM THE SHARKMEN.'" - the post-victory Bai'Or celebration. The misdecode is the PARLAY at 0x8B1B, not the AND at 0x8B24. Immaterial to the headline (AND #191 and OR #1 both leave bit 0x20 untouched, so the bit-0x20 setter is still unique), but it means [0x0187] bit 0x01 has a REAL setter, and bit 0x01 is what the search_location prologue at 0x83D3 uses to divert ALL of area 54's per-cell dispatch to 0xA722. That is worth stating rather than dismissing as an alignment artifact.

> IMPRECISE: 'resume(0) ... runs to chain with chainBlockId 54, after emitting the retail Hamhand exposition ending "...EASTERN EDGE OF THE HARBOR."' The string at 0x8256 is emitted, but it is NOT the end of the run. Three more paragraphs follow - 0x826F PRINTCLEAR "'I THINK YOU BETTER LEAVE NOW, IN CASE " , 0x8290 "A PATROL COMES BY. THEY NEVER LIKE IT ", 0x82B0 "WHEN THEY FIND TOO MANY PEOPLE IN ONE ", 0x82D0 "PLACE.'" - then 0x82D9 SAVE #0,[0x0039] and only then 0x82DF NEWECL #54. Measured on my own run: the final print effect is "PLACE.'". A golden written from the summary's wording would fail; the proposedGolden itself does not assert it, so this is non-load-bearing.

> MISLABELED: the write-side control is described as 'answering COERCE (menu index 2)'. The HORIZONTAL_MENU destination [0x00BF] is 0-based - my resume(0) selects BE FRIENDLY and is the branch that sets the bit. Index 2 is therefore THREATEN, not COERCE. Mechanically irrelevant: 0x80D2 COMPARE [0x00BF],#1 / 0x80D8 IF_GE / 0x80D9 GOTO 0x82E2 routes indices 1 and 2 identically, so the control's observed behaviour (never touches 0x0187) is unchanged. Only the label is wrong.

> NEEDS EXPLICIT STATING: reader #2 at 0x8A66 is COSMETIC-ONLY. Both branches converge at 0x8AC8 SETUP_MONSTER #255,#0,#64; the flag-set path adds only three PRINT lines (0x8A7A/0x8A96/0x8AB5, the JENNIFER AND OLEG HAMHAND / ERIC STRONGBOND recognition text) plus a PARTYSTRENGTH pause before falling into the same 0x8AC8. The finding states this accurately and uses reader #2 only as a shared-semantics argument, so this is not an over-claim - but the write-up should say plainly that the ONLY load-bearing content change is reader #1 at 0x977F (an entire multi-paragraph three-choice NPC interior scene becomes unavailable), so a later reader does not mistake reader #2 for a second content gate.

> OVER-CONSERVATIVE (should be strengthened, not weakened): the limit 'NOT CLAIMED: that the retail DOS engine physically preserves [0x0187] across its own NEWECL area change.' The corpus itself demonstrates that this memory region survives NEWECL. All four area-54 chains into area 55 write the building selector first - 0x857B SAVE #2,[0x018D]; 0x9793 SAVE #1,[0x018D]; 0xA11D SAVE #0,[0x018D]; 0xAA18 SAVE #3,[0x018D] - and area 55's very first instruction after 0x8014 SAVE #55,[0x0016] is ON_GOTO [0x018D],#4. If sub-0x8000 data did not survive the area change, the shipped game's building dispatch would be broken. Same argument, same address region, retail-internal. Also worth adding as positive evidence: selector 1 (the Hamhand house) is written at exactly ONE site in the whole corpus, 0x9793, directly under the bit-0x20 gate - so the gated cell is the house's only entrance.

> TAXONOMY CAVEAT the write-up should carry explicitly: Secret's Sixth Route (the cited precedent) requires the reader to be a 'DIFFERENT, non-adjacent block'. Areas 54 and 55 are directly adjacent - 54 chains into 55 and 55 chains straight back - and reader #1 is the door cell of the very house the setter lives in, which is structurally closer to a cross-member consumed-state marker for one location than to Secret's world-state alert flag spanning two separate map locations. The finding is defensible on this point (the bit is knowledge-conditional, set only on the BE FRIENDLY and 'ASK WHAT IS GOING ON IN BAI'OR' branches and not on the THREATEN terminal branch; and reader #2 is a genuinely different scene reading it jointly with bit 0x10) and it is better grounded than the precedent on GEO descriptor evidence, uniqueness rigor and measured negative controls - but the adjacency delta versus the precedent should be stated in the write-up rather than left implicit.

---

# Open items

## To move the `ending` leg from `blocked` to `proven` (the only leg blocking the gate)

The blocker is not the encounter - it is the two host words that gate essentially all of area 66,
plus an untraced ingress. Concretely, in decreasing order of leverage:

1. **Pin `[0x0032]`'s producer.** Corpus-wide there are ZERO ECL writes to it in all 47 blocks; it is
   read by areas 14, 15, 35 and 66 only (areas 14/15 do `SAVE [0x0032],[0x009A]`). It must be
   host-populated by `DQK.EXE`. A static disassembly pass over the DQK.EXE ECL-data initialisation
   (the `les bx,[0xb20f]` data-segment buffer already located for the `DIVIDE` remainder proof gives
   the right base) should be able to find who writes ECL data offset 0x32 and with what - **no
   emulator required**, which is why this is the first item.
2. **Pin `[0x009A]`'s value on entry to area 66.** Same argument: areas 66 and 67 never write it;
   areas 22/23 copy the masked cell descriptor into it, area 48 zeroes it, areas 14/15 copy
   `[0x0032]` into it, and six areas compare it against 0/2/3/4/9/15. The terminal scene needs
   exactly 4. If `[0x009A]` is simply a copy of `[0x0032]`, item 1 closes item 2 too.
3. **Trace an ingress to area 66.** Areas 63/64 chain through variable operands
   (`NEWECL [0x00A5]`, `NEWECL [0x01A1]`). Resolving `[0x01A1]` is tractable statically: area 64's
   entry does `SAVE [0x0016],[0x01A1]` and `COMPARE [0x0016],#66`, so the operand is the *previous*
   area id - which means a 62/63 -> 64 -> 66 walk should be reconstructible from the ECL alone.
4. **Rewrite the terminal-arm control and Case 9** with `[0x009A]=4` seeded explicitly, and drop the
   "closed two-node loop" framing (area 66 arm 3 chains `NEWECL #64`).
5. **Fallback if 1-3 stay unresolved:** the surviving material is still worth landing as an *encounter*
   golden (area 66 arm 6 SAHUAGIN, eager consumed bit, plus the arm-0 dead-code refutation), and the
   `ending` leg should then be recorded honestly as `blocked` with this list attached - precisely the
   shape of "Pool's Quest Leg (Investigated, Unresolved)" in `persistent-natural-routes.md`.
6. **Alternative site, not investigated:** nobody looked at whether DQK's *victory* finale exists at
   all (executable cinematics / `FINAL.TLB`). If it does and it is script-driven, it may be a cleaner
   ending leg than area 66's damnation scene.

## Engine gaps that must be resolved before any of the four proposed goldens can land

These are real engine defects found by the finders, byte-proven, and NOT fixed (all work was
read-only):

- **`DIV_REMAINDER_ADDR = 0x7f3f`** (`packages/engine/src/ecl/vm.ts` ~line 551) is the Gen1/CoAB
  address. DQK's own arithmetic handler stores the remainder at ECL data offset `0x29`
  (`DQK.EXE` file `0x032061..0x032068`, `les bx,[0xb20f]; mov es:[bx+0x29],dl`). Consequence: every
  Gen2 one-shot bit helper computes mask index 0, so all one-shot bits alias onto bit 0. The
  middle-leg golden works around it with a `[0x0029]` seed; the town leg's field-phase bit lands on
  the wrong bit (right byte).
- **`GETTABLE`'s code-byte fallback** (`vm.ts` case 0x2a): when a data-space table base is absent from
  the memory map, the VM reads BLOCK bytes at the same numeric offset. Unseeded, area 31 reads
  `raw[0x014F] = 0x43` (a string byte) and area 4 reads `block[0xB8] = 129` as bit-vector data. Both
  goldens work around it by pre-seeding; the engine should be fixed instead.
- **`ECL_GEN2.wordSetOverrides` are wrong for `0x2C`, `0x1F` and `0x37`** per DQK.EXE's own handler
  prologues (`0x2c: 1`, `0x1f: 1`, `0x37: 2`). This **contradicts** the `ECL_GEN2_DQK_AREA5` doc
  comment in `disassemble.ts`, which calls the 1-operand PARLAY an area-5-only exception. **Reconcile
  before landing**, and check whether any existing test depends on `0x2c: 4`. Note the middle leg does
  not depend on the fix (only its roster does).
- **`docs/engine/research/decompile-dqk-ecl-dispatch.md` has a wrong overlay body base** (`0x0403d0`;
  correct is `0x0402c0`), making its whole handler-file-offset column off by 0x110. Independently
  re-derived by the middle-leg refuter. Fixing that doc is a separate, small task.
- **`tools/dqk_ecl_combat_scan.py` / `tools/dqk_ca03_stream_decode.py` carry a stale Gen2 opcode
  table** (0x0C, 0x22, 0x23 disagree with the engine's `ECL_GEN2`). Two independent finders hit this.
  Any figure derived from those tools - including the brief's "35 entry-reachable COMBAT sites" - is
  both over-inclusive (area 34 @0x91C7 and area 66 @0x8746 are not COMBATs) and under-inclusive.

## Things the human operator must check before touching the matrix

1. **Do not promote DQK.** With `ending` at `blocked`, the campaign gate still fails. If the matrix is
   updated to `middle/town/wilderness/quest = proven` and `ending = blocked`, `goldbox_corpus.py`
   should continue to compute `persistent`, not `campaign`. Verify that it does.
2. **Decide the wilderness scope question.** The wilderness leg necessarily transits area 5, which is
   also the proven `early` leg. The finder argues (and the refuter confirms) that it is
   handler-disjoint and cell-disjoint, and that DQK ships exactly one overland map so it cannot be
   avoided. If your reviewing standard is "no shared area id at all", this leg must be downgraded -
   which would leave DQK at 4/6 and would not change the gate outcome either way.
3. **Decide the quest adjacency question.** Areas 54 and 55 are directly adjacent, unlike Secret's
   Sixth Route precedent. The evidence is stronger than the precedent's on every other axis; the
   adjacency is the one place it is weaker.
4. **None of the four proposed goldens has been written or run in-repo.** They were measured in
   throwaway probes by the finders and re-measured independently by the refuters, but nothing is
   checked in. Do not cite a test file that does not exist yet.
5. **No native / DOSBox-X corroboration exists for any leg in this document.** One piece of
   independent live evidence does exist for the town leg and is worth citing:
   `docs/engine/research/dqk-palanthas-palace-combat-route.md` already records a live retail Unicorn
   trace reaching area 4's hub (`b7f9=0x82d0`) from a loaded save.
6. **A shared-scratchpad hazard was flagged** by the quest finder: it had to write a `vitest.config.ts`
   into the session scratchpad shared with sibling agents (which already contained another agent's
   probe files). If a sibling agent's run behaved oddly during this window, that is a plausible cause.
