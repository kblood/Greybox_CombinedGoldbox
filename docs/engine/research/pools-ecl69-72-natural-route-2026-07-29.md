# Pools ECL1#69 → #72 natural encounter audit (2026-07-29)

## Verified result

Pools of Darkness needs a title-specific ECL dialect. Retail `GAME.OVR` handler prologues pin
`SETUP_MONSTER (0x0c)=4`, `opcode 0x1f=1`, `LOAD_FILES (0x21)=2`, and the title-repurposed
`opcode 0x37=2` operand frames. The shared DoK short dialect remains unchanged.

With those frames, the old ECL1#69 nonlocal-GOTO/blockage is decoder drift. A finite retail-byte
route exists in the matching map and scripts:

```text
GEO1#69 (8,6), descriptor 0x97
  → SearchLocation selector 23
  → ordinary north/state guards
  → SAVE #38,[0x027b]
  → NEWECL #72
  → selector 38
  → DROW PRIEST ×8; DROW SORCERESS ×4;
    PET OF KALISTES ×2; PHASE SPIDER ×2
  → COMBAT at v0x9885
```

The machine-checked golden is `packages/engine/test/poolsNaturalRoute.test.ts`. It pins the retail
file/member hashes, handler byte fingerprints, corrected instruction boundaries, unique GEO cell,
three negative controls, predecessor propagation, and exact four-group roster. Scanner parity and
the 34-site `LOAD_FILES` successor census are pinned by
`tools/test_gen1_ecl_encounter_scan_pools.py`.

### 2026-07-31 outcome/persistence promotion

The same real-byte golden now continues ordinary victory instead of stopping at COMBAT. Victory
falls through at `v0x9886`, crosses the exact `72 → 69 → 72 → 69 → 72 → 69` continuation, writes
`[0x0276]|=2`, advances `[0x027B]` through selectors 27 and 28, and pauses at the genuine prompt
`THE ORACLE SAID TO DESTROY -`. Pools' `INPUT_STRING #6,[0x02EF]` stores at operand two; the VM
upper-cases/truncates the response and runtime string comparison accepts either `HANDS` or `ARMS`.
The successful `HANDS` branch writes `SAVE #1,[0x0278]` at block-69 `v0x9BEC`. This is the stronger
completion guard: `[0x0276]|=2` alone suppresses the battle but may repeat the Oracle, while
`[0x0278]=1` makes a legal descriptor-23 re-entry fully effect-free.

Retail `POOLS_FIND_CHARACTER` is now pinned as a synchronous ordered TeamList lookup: `0xFF` when
missing, the zero-based index when active, and `index|0x80` when inactive. Pools opcode `0x41` is a
two-operand scripted-XP award: operand one selects the current character (`0`) or party (nonzero),
and resolved operand two is multiplied by 100 for every eligible recipient, divided only by that
recipient's active-class count. The route operand is dynamic `[0x01F4]`; its clean VM value is zero,
so this promotion does not invent the formerly assumed 50,000 XP reward.

Browser acceptance walks the legal GEO route, wins the ordinary capped tactical overlay, enters
`HANDS` through the visible text field, observes `[0x0278]=1`, proves the legal revisit silent, and
round-trips exact party, inventory, XP, area, pose, clock, selector, and memory through Greybox
save-v2 restart/load. The full 16-actor retail request remains independently pinned at the VM layer.

## Retail identities

| Artifact | SHA-256 |
| --- | --- |
| `GAME.OVR` | `bac46d171d1f11584c94beeec4cda548aa797e0b25b899b199a2c49c6e63d402` |
| `ECL1.DAX` | `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af` |
| `GEO1.DAX` | `d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f` |
| ECL1#69 raw | `d5cfcd4c657731489f667e5a770e7980c0505b8b39eb09903dda23c9d10a8c0e` |
| ECL1#72 raw | `d3090581b2975ba1090c5349ed6edce90b6f7242ef1096f91a77050b0a9fd2b4` |
| GEO1#69 raw | `af96465c837b72aa28125043aa74a4a22232a9047c597817a4761d9f7e522ddc` |

The decisive handler fingerprint is `b0 NN 50 9a 2a 00 55 00` (`mov al,NN; push ax; lcall
0055:002a`). It occurs with `NN=4` at file offset `0x052c`, `NN=2` at `0x0ea4` and `0x1ed0`,
and `NN=1` at `0x264a`.

The corrected ECL1#69 boundary is:

```text
raw 0x003c  LOAD_FILES #69,#5              (5 bytes)
raw 0x0041  COMPARE #18,[0x0016]           (6 bytes)
raw 0x0047  IF_EQ
raw 0x0048  GOTO v0x8410                   (local)
```

Pools `CMD_NewECL` stores the departed ECL id at `Area+0x15`; ECL1#69 immediately copies and
compares logical `[0x0016]` as its predecessor. Together these strongly identify the one-based
logical mapping used by `ECL_GEN1_SHORT_POOLS.lastBlockIdAddr`. This is an evidence-backed address
identification, not a claim that every title shares it.

## Deliberate claim boundary

This work supports: **retail-byte-verified natural GEO1#69 combat, post-victory Oracle result, silent
completion guard, and Greybox save-v2 persistence**.

It does not establish original-DOS save interoperability, native tactical-board/full-roster
presentation parity, authentic Pools `PARTYSTRENGTH` or opcode `0x1f` semantics, the producer and
normal nonzero route value of `[0x01F4]`, selected-folder release acceptance, or broader campaign
coverage. A future native trace for those narrower semantics must use an exclusively owned GameLink
session.
