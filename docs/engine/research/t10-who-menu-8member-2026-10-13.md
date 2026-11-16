# T10 design: 8-member WHO menu vs the 128-byte GBMT text cap (2026-10-13)

Read-only study. Nothing was built, no DOSBox was run, no tracked file was touched. Every fact below was
re-read from `native/src` on 2026-10-13; the working tree is dirty (another session), so line numbers are
this tree's and will drift. Prefer the symbol names.

## 1. Facts re-derived from source

| Fact | Where (symbol, this tree) |
|---|---|
| Cap is 128 bytes, defined three times (ccecl, ccfp, ccmenu) plus `ccfp_secret_menu.inc` users | `MENU_TEXT_CAP equ 128` (`ccecl.asm:352`, `ccfp.asm:77`, `ccmenu.asm:25`) |
| GBMT payload = `MT_DATA_OFF` + 128, fixed, zero padded | `FX_V14_LEN`, `start_menu_text` zeroes `menu_textbuf` |
| GBPR rows accepted: 8 | `PARTY_ROWS_MAX equ 8` (`ccecl.asm:212`); WHO gates `1 <= party_count <= 8` in both `op_who` arms |
| Name store: 16-byte rows, `u8 len` + up to 15 ASCII | `party_names resb PARTY_ROWS_MAX*PARTY_NAME_BYTES` |
| Name append rule | `capture_who_text`: len must be 1..15; fails if `used + 1 + len > 128` (`ja`, so exactly 128 fits) |
| Gen1 WHO (CoK/DoK): no prompt, names only | `op_who` -> `start_menu_text`; `capture_who_text` |
| Gen2 WHO (DQK): inline packed prompt first via `capture_menu_text`, then names | `op_who .supported_who` |
| Validators re-check the same layout | `who_validate_labels` in `ccmenu.asm` and `ccfp.asm` (prompt len byte, then `MN_COUNT` names of 1..15 printable bytes, zero padding to 128); `ccfp .who_event` also bounds prompt len 1..128 |
| UI: plain line-printed list, `2`/`8`/arrows move a cursor over `SI_COUNT` entries | `who_show_labels`, `who_manual_choice` (`ccfp.asm`). No row limit besides the text screen. |

### How many rows the menu shows today
Rows shown = `party_count` (1..8) **iff** the whole name list fits the 128-byte buffer; otherwise zero rows
(see below). The UI itself has no 6-row limit.

### Fit arithmetic (worst case = 15-letter names; each costs 1 + len)
- Gen1 (no prompt): 8 x 16 = 128 = cap. Always fits, exactly. Nothing to fix.
- Gen2: budget for names = 128 - (1 + packed prompt bytes). The only DQK prompt in the repo's tests is
  `'WHO TRIES TO LIFT THE LID?'` which `ccecl-dqk`-style fixtures describe as 21 packed bytes -> 22 bytes
  used -> 106 left. 8 names fit iff `sum(1+len) <= 106`, i.e. average name length <= 12.25 (8 x 13 = 104 fits,
  8 x 14 = 112 does not). 6 members of up to 15 (96) still fit.
- So the T10 caveat is real but conditional: it needs a Gen2 prompt of ~20+ packed bytes AND long names.

### What the player sees on overflow (the unmeasured part, now read from source)
`capture_who_text` returns CF with `menu_text_overflow=1`.
- Gen1: `op_who` `jc .headless` -> writes `who_choice` (default 0) to the destination and continues.
- Gen2: `jc .gen2_headless` -> `set_who_party_selection` with `who_choice` (default 0 => member 1 selected).
In both cases: no yield, **no menu is shown, a member is chosen silently, no halt reason, no marker.**
The memory is not corrupted (the cap check precedes the copy), but the failure is silent and only the
interactive path is affected (`/C` interactive_menu). That is the behaviour T10b must replace with a
defined, disclosed one. Note also `menu_text_active` stays set after a failed capture; not verified whether
anything later reads it (could not trace without a run).

## 2. Design

### T10a (tests only, 0 resident bytes)
Do not edit any tracked file in this step. Add `native/ccecl-dqk-who8-test.ps1` (T10 names it), modelled on
`native/ccecl-menu-resume-test.ps1`, whose helpers (`Add-Str`, `New-Gen2Program`, `Write-PartyHlib`) already
build a Gen2 WHO program; its `Write-Roster` throws for >6 names (line 127), so the new script needs its own
8-row GBPR writer (216-byte-record compact GBPR, 8 rows). Cases, all via `CCECL ... /C` then CCMENU/CCFP as
the sibling does:
1. 8 names with real CCHOST `/N` NPC names + real DQK WHO prompt: expect yield, GBMT count = 9, every name present.
2. Forced overflow: 8 x 15-char names + the same prompt: expect today's behaviour recorded as a *measured
   fact* (no yield, member 1 selected, no GBMT effect), asserted so that T10b flips it RED -> GREEN.
3. Gen1 8 x 15: exact-fit control (must yield; proves the `ja` boundary is inclusive).
4. Instrument-present controls (per this repo's rule): case 2 must show the WHO event in GBSX and a parsable
   GBEF/GBPR, otherwise "no menu" is vacuously true of a dead run.

No-DOSBox complement: a Python test (`tools/test_who_menu_cap.py`) that (a) regex-extracts
`MENU_TEXT_CAP`/`PARTY_ROWS_MAX`/the `ja .bad` boundary from the three `.asm` files and asserts the three
caps agree and the compare is `ja` (inclusive fit), and (b) pure-Python fit model over the 8-row cases.
This guards the *contract*, not the assembled code; label it so. A real no-DOSBox execution via the repo's
unicorn harness may be possible (`tools/test_unicorn_*`) - not verified.

### T10b (only if case 2 shows silent fallback is unacceptable)
File: `native/src/ccecl.asm`, routine `capture_who_text` only. The cap cannot be raised: it is baked into
the GBMT sidecar layout across ccecl/ccfp/ccmenu/ccfp_secret_menu (`FX_V14_LEN`, validators, resume
frames) - a format change, rejected.
Preferred behaviour: **truncate names with a marker, keep every member selectable.**
- Before the loop compute `L = min(15, (128 - menu_text_used - party_count) / party_count)` (one `div`);
  if `L < 1` keep today's `.bad`.
- In the loop emit `min(len, L)` bytes; when truncated, overwrite the last emitted byte with `.`.
- Advance by the source stride (rows are 16 bytes, so no pointer arithmetic change).
This keeps `who_validate_labels` valid (names stay 1..15 printable) and selection index == GBPR row, so
no downstream change. Alternative (cheaper, worse): on overflow raise `halt_at_current` with a new halt
reason - visible but ends the script.

### Byte cost
- T10a: 0.
- T10b: my estimate ~30-45 bytes of 8086 code (div, two compares, min, marker store). The round-10 list
  says 10-40; I think 40 is optimistic once the marker is included. Estimate, not assembled.

## 3. Headroom (read-only from `native/build/native-capacity.json`)
Built from a **dirty** tree (source hash `32023cab...`, not a clean commit; may not match the other
session's current edits). Tool list had 27 entries here (not the 16 quoted in CLAUDE.md - the manifest has
grown; not reconciled).
- `ccecl`: emitted 24,854, resident 65,215, **headroom 65**, floor 64 -> **1 spare byte above the floor.**
- `ccfp`: headroom 3,786. `ccmenu`: 51,828 (validators unchanged by this design, so neither is needed).
- `gbboot` 449 (floor 128), `ccnext` 117 (no floor), `cccombat` 24,692.

### Can it be done without growing CCECL?
**No for T10b as designed**: +30-45 B against 1 spare byte. T10a needs no bytes and can proceed now.
Ways to fund T10b: (a) after T2 (CCECL +~15.7 KB) as the round-10 list already schedules; (b) find >=45 B of
reclaim inside CCECL first (e.g. `capture_who_text` shares the append body with `capture_menu_text` /
`append_static_menu_text`, which are three near-identical copies of the cap check + copy loop - folding them
would likely *save* bytes; not measured); (c) the minimal alternative (halt reason on overflow) is probably
<= 15 B and might fit in 1+ reclaimed bytes - still unverified.

## 4. Risks
- Silent-fallback behaviour is pinned by T10a case 2; T10b changes it, so the pin must flip in the same commit.
- Truncating names changes what is shown, not what is stored: GBPR stays intact. But anything that
  compares GBMT names to GBPR names byte-for-byte would reject truncated labels - none found in
  `who_validate_labels` (it checks only length 1..15 and printable), but Secret paths
  (`secretwhostate.inc`, `secret_who_oracle.py`, "closed name capability") were NOT audited; T10b must not
  touch Secret (`is_gen2 == 2`) behaviour without that audit.
- Both interactive arms share `capture_who_text`; the Gen1 arm cannot overflow, so T10b is effectively DQK-only.
- Dirty tree: the line numbers and the capacity manifest may not match the other session's final state.

## 5. Not verified
- No assembly, no DOSBox, no tests run. Overflow behaviour is read from code, not observed.
- The 21-byte packed length of the real DQK WHO prompt is taken from the fixture comment in
  `ccecl-menu-resume-test.ps1`/related docs, not re-derived from DQK's ECL; other DQK WHO sites may carry
  longer prompts. Real CCHOST `/N` NPC name lengths were not enumerated (so "average > 12.25" is a
  threshold, not a prediction).
- Whether `menu_text_active` left set after a failed capture matters.
- Denominators: 1 prompt (22 B) x 8 rows; the manifest's tool count (27) vs CLAUDE.md's 16.
