# Treasures of the Savage Frontier opcode 0x31 (item 53, Phase A, static only)

Date 2026-10-07. Verdict: **by code, Treasures' `0x31` is a counted menu with the
same operand frame as `0x2B` (dest, count, inline labels), unlike Pool's
zero-operand `SPRITE_OFF`. But the retail corpus contains ZERO CFG-reachable
`0x31` sites, so there is no route to prove two answers diverge. Leave it
recorded-only; no `native/src` change is warranted.**

## Evidence

1. **Dispatch arms** (`GAME.OVR` `0x319e` dispatcher, capstone 16-bit):
   `0x333e cmp al,0x2b ... mov al,0 / push ax / call 0x16b7` and
   `0x337c cmp al,0x31 ... mov al,1 / push ax / call 0x16b7`. Both opcodes call
   ONE handler, `0x16b7`; they differ only in a pushed flag (0 vs 1). This is the
   Buck Rogers shape (shared handler `0x1adf`), not Pool's (distinct handlers).
2. **Handler `0x16b7`.** Prologue, then `mov al,2 / push / lcall 0x58:0x2a`
   (operand parser, exactly 2 operands), loads `[a7e0]`/`[a820]`, then
   `mov al,2 / push / lcall 0x58:0x25` (reads operand 2 = the label count into
   `[bp-1]`), then `push [bp-1] / lcall 0x58:0x2a` (parses that many label
   operands) and loops them into a text buffer. So the frame is
   `dest, count, count x label`, i.e. DoK/PoD `count_at=1`, NOT a plain
   2-operand frame and NOT zero-operand. The flag (`cmp [bp+6],0` at `0x16c6`)
   only gates a one-time boxed-prompt draw (`0x16cc..0x16f0`) before the shared
   menu body; it does not alter operand parsing.
3. **Corpus null.** `ECL1.DAX` is the only ECL file (30 blocks). Under the
   profile's own decode, 10,427 CFG-reachable instructions, 52 distinct opcodes,
   `0x31` reached **0** times. Raw `0x31` bytes: 690, all inside operand/text
   data. Scan repeated with `0x31` decoded as compact (2 operands, count_at=1),
   plain 2-operand, zero-operand, and a wrong count slot (count_at=0): **0
   reachable sites under every frame**, so the result is not frame-dependent.
   Positive control: the same decoder reaches **64** `0x2B` menus and reads
   64/64 as non-empty labels (e.g. `ATTACK|FLEE`, `HELP DWARVES|RETREAT`).
   Instrument control: relabelling a real `0x2B` site as `0x31` makes the
   compact frame see it at identical size, and a wrong count slot breaks it.
4. Consistent with `gen1_ecl_encounter_scan.py` ("Gateway and Treasures have
   none") and the dispatch map row `0x31 = 2` operands (which is the measured
   operand count without the count slot; the count-slot half comes from the
   `0x58:0x25` read above).

## What this does and does not settle

- Settled statically: operand frame and label boundary (label operands follow
  the count; each is a `0x80`-coded inline string).
- NOT settled, and cannot be from this data: a title-marker route, a retail
  menu route, or two-answer continuation divergence. Item 53 requires all of
  those, so Treasures stays recorded-only. The shared handler also means the
  engine already behaves correctly for the only reachable menu opcode (`0x2B`).

## Phase B (not implemented): what a CCECL change would need

Only if a future corpus (Treasures save/mod ECL, or another install) shows a
reachable `0x31`:

- Add a Treasures title-marker entry that sets the existing compact-frame
  switch (`short_menu_opframes`, as for DoK/PoD) so `0x31` routes to the same
  menu capture as `0x2B` (`dest, count, labels`) instead of zero-operand
  `SPRITE_OFF`; reject the frame under any other marker (Pool must stay 0).
- The label payload goes through the existing GBMT capture; the budget is the
  same 128-byte store check (packed + 1 length byte per segment). Treasures'
  largest measured `0x2B` menu is far below that.
- Code budget: the brief gives 284 usable bytes. The marker bit plus an extra
  compare in the opcode-frame selection is a few dozen bytes; the flag-1
  boxed-prompt draw has no native counterpart and should be ignored (as the
  Buck `0x31` is), so no new presentation code is needed.
- Gate: a two-answer continuation test and rejection controls (wrong marker,
  truncated frame, count over the cap), all of which require a real reachable
  site to exist first.

Test: `tools/test_treasures_short_menu.py` (8 tests, skips when data absent;
setting `HANDLER = 0x16B8` turns 2 of them RED).
