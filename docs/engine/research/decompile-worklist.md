# Krynn Decompile Worklist — source files yet to decompile

## Current status — 2026-10-11

This index covers the targeted subsystem research loop, not a complete source decompilation
or proof that every title plays faithfully. The iteration log below is historical; its
dated negatives and engine-gap descriptions are superseded where later evidence exists.
This review reconciles tracked evidence and current source callers; it records no new live
runtime measurements or full-title parity result.

- **CoK RNG recovered, 2026-09-08:** resident `B628h` uses
  `state = state * 0x08088405 + 1` modulo 2^32. `B5D9h` advances first and returns the
  high word modulo the bound. ECL/dice boundary behavior and native continuation are
  documented in [cok-rng-native.md](cok-rng-native.md), with original-code oracles in
  `tools/test_cok_rng.py`. The July contiguous-constant scan did not exclude this algorithm.
- **DoK RNG recovered, 2026-10-07:** the same recurrence and ECL/dice semantics at different
  addresses, verified by `tools/test_dok_rng.py`; see [dok-rng.md](dok-rng.md).
  Current `native/src/ccecl.asm` sets `use_cokrng` on DKK.CFG admission and uses it for
  ECL RANDOM/d6. Seeding and full combat draw-order/continuity parity remain outside that
  source-selection fact; DQK RNG is not established by either title's result.
- **DQK dispatch recovered:** 66 slots (`0x00`–`0x41`) at canonical `2033:0d34`,
  retail file `0x032a54`. See [decompile-dqk-ecl-dispatch.md](decompile-dqk-ecl-dispatch.md)
  for corrected operand counts, `0x31 SHORT_MENU`, and the bounded `0x41` XP-write proof.
  A live DQK `0x24 COMBAT` handoff and safe native QSV writeback remain unverified.
- **CoK demo entry recovered:** demo is `ECL2.DAX` block 57; normal new-game opening is
  `ECL1.DAX` block 36. See [cok-demo-entry-located.md](cok-demo-entry-located.md) and the
  later original-loader trace in
  [Task 198](cok-task198-original-demo-combat-boundary-2026-09-28.md).
- **Engine helpers and product wiring are separate:** XP, pricing, recalc, movement, AI,
  calendar/rest, imports, sky and sound helpers exist. The subsystem notes now describe
  actual callers and remaining limits. In particular, geometry helpers do not replace
  every tactical range/LOS path, and the web rest cadence is not the recovered CoK retail cadence.

Use [decompiler-project-inputs.md](decompiler-project-inputs.md) for reproducible import
packages, [rtlink-map-dqk-ckit.md](rtlink-map-dqk-ckit.md) for Gen2 mapping, and the
title-local notes for semantic proof. A same-family match alone is not cross-title verification.

## Original loop charter — 2026-06-26

> **Goal (set 2026-06-26):** systematically decompile the remaining subsystems of the three
> Krynn game binaries, one overlay/segment "source file" per iteration, verifying each against
> the real game bytes (via `tools/disasm_{cok,dok,dqk}.py` string-xref anchoring) and the COAB
> Rosetta Stone (`coab_extracted/engine/*.cs`, study-only). Each iteration produces or extends
> an RE doc under `docs/engine/research/` and commits. This is **static-analysis only** — no
> game-testing required. Driven autonomously as a self-loop.

## The binary "source files"

| Game | Binary(s) | Container | Disassembler |
| --- | --- | --- | --- |
| CoK | `Champions of Krynn/START.EXE` + `GAME.OVR` | FBOV pool, 35 overlay segs, 542 INT 3Fh thunks | `tools/disasm_cok.py` |
| DoK | `Death Knights of Krynn/START.EXE` + `GAME.OVR` | FBOV pool (`ovrsize 0x3da2d`) | `tools/disasm_dok.py` |
| DQK | `The Dark Queen of Krynn/DQK.EXE` | MZ + custom overlay tail (9 banks, no OVR) | `tools/disasm_dqk.py` |

The natural decompile unit is the **overlay / segment**, mirroring COAB's `ovrNNN.cs` /
`segNNN.cs` split. The table below maps each COAB unit → subsystem → status against our
existing RE docs. "DONE" = the original loop produced a subsystem specification;
"PARTIAL" = touched but not fully mapped; "TODO" = not yet decompiled. These are research
coverage labels; COAB-backed descriptions still need title-local proof where the notes say so.

## Decompile units (status)

| COAB unit | Subsystem | Status | RE doc / note |
| --- | --- | --- | --- |
| ovr003 | ECL command table (`CMD_*`) | MAPPED (Gen1 and DQK Gen2) | `ecl-krynn-gen1-opcodes.md` + `decompile-dqk-ecl-dispatch.md`; DQK has exactly 0x00–0x41, corrected per-opcode framing; live DQK COMBAT remains open |
| ovr008 | ECL compressed-string decode | DONE | `decompile-ovr008-ecl-strings.md` (6-bit 4⇄3 packing + char remap, round-trip verified; typed string-memory map) |
| ovr005,013,016,023 | Spells / affects / memorize / healing | DONE | `disasm-spells-krynn.md` |
| ovr009,014,024,025 | Tactical combat loop / to-hit / attack / damage | DONE | `disasm-combat-{cok,dok,dqk}.md` + SUMMARY |
| ovr032,033 | Combat map / LOS / combatant sort | DONE | `decompile-ovr032-combat-map.md` (SteppingPath asym-Bresenham: orth=2/diag=3 half-steps; wall-HEIGHT occlusion; CanSeeCombatant 8-octant cone; footprint reach + SortedCombatant sort) |
| **ovr006** | **After-combat XP + treasure award, cleanup** | **DONE** | `decompile-ovr006-xp-treasure.md` (award helpers and web callers exist; title-local loot/divisor parity remains scoped) |
| **ovr026** | **Class/level, dual-class, stat bonuses** | **DONE** | `decompile-ovr026-class-recalc.md` (recalc/skills/class-mask helpers exist; class-mask caller and Krynn skill recomputation remain open) |
| **ovr015** | **Party movement / step-forward / doors** | **DONE** | `decompile-ovr015-movement.md` (normal/careful steps 1/10 minutes; model door state exists, byte-exact persistence remains scoped) |
| **ovr007** | **City shop economy (buy/sell/value)** | **DONE** | `decompile-ovr007-economy.md` (value×field_6DA tier pricing; engine DELTAS) |
| **ovr010** | **Monster combat AI (target/flee/item use)** | **DONE** | `decompile-ovr010-monster-ai.md` (turn ladder, random target, spell/wand/weapon pick, surrender; engine DELTAS) |
| **ovr011** | **Battle setup / combatant placement / city info** | **DONE** | `decompile-ovr011-battle-setup.md` (CoAB source-placement oracle and web path exist; fallback/footprint/wall wiring limits remain) |
| **ovr020** | **Item identify / sell / cure-disease** | **DONE** | `decompile-ovr007-economy.md` (sell value/2 + stack penalty, identify 200, coin payout) |
| **ovr021** | **Affect timing-out / spell learning / clock** | **DONE** | `decompile-ovr021-time-learning.md` (calendar/rest helpers and web callers exist; CoK retail heal cadence differs) |
| **ovr022** | **Money (coins pickup/drop), party count, num input** | **DONE** | `decompile-ovr007-economy.md` (7 coin slots plat=5×, gem/jewel appraisal d100, randomBonus) |
| **ovr017** | **Player file load + PoolRad/HillsFar import/convert** | **DONE** | `decompile-ovr017-save-import.md` (3-file save, field-map import +300pp, full field inventory) |
| **ovr018** | **Party management (Add/Free player)** | **DONE** | `decompile-ovr017-save-import.md` (≤6 PC/≤8 total, paladin↔evil, ≤3 rangers in the current helper, dup gate) |
| **ovr019** | **Animation (pixel/show)** | **DONE** | `decompile-ovr019-034-038-draw.md` (procedural 3-emitter spell-FX particle burst, RNG+trig; decorative, engine-optional) |
| **ovr028,029** | **Sprite draw/restore, RedrawView** | **DONE** | `decompile-ovr028-029-view-refresh.md` (MapCursor save-under sprite; RedrawView dungeon/bigpic dispatch + per-area sky_colours 16-EGA table, per-cell >0x7F indoor/outdoor — sky helper/caller exist; real area/roof values remain scoped) |
| **ovr030,031** | **3D world renderer (Draw3dWorld*)** | **DONE** | `decompile-ovr030-3d-renderer.md` (far→near walk + 8×8 piece tables corroborate wallview.ts/CCFP; sky composition exists with default-data/body limits) |
| **ovr034,038** | **24x24 iso tiles, 8x8D symbols** | **DONE** | `decompile-ovr019-034-038-draw.md` (24×24 combat tiles >0x7F 2nd bank; combat icons 'T'→+0x40/±0x80/recolour; draw at (tileY*3+1,tileX*3+1); Put8x8Symbol 5-set ranges, 0x11e=set4) |
| **seg001** | **Main program / init / config** | **DONE** | `decompile-seg001-043-049-boot-input.md` (boot order: cmd table→item lib→sound0→copy-prot→menu; cmd_opps→ovr008.vm_GetMemoryValue; CoAB demo area literal superseded by CoK ECL2#57) |
| **seg037,040,041** | **Frame draw, DAX load, palette, status text** | **DONE** | `decompile-seg037-frame-text-blit.md` (40×25 EGA grid; DAX blit transparent index 17 + recolour; 8×8 mono font block 201 ToUpper%0x40; frame chrome 0x11e symbol bank; mostly already in cokFont.ts/combatScreen.ts — 3 pins) |
| **seg043** | **Debug dumps / input** | **DONE** | `decompile-seg001-043-049-boot-input.md` (GetInputKey: demo non-blocking, 0x13→sound, key 3→quit, type-ahead drain; rest = .NET debug dumpers, no Krynn analogue) |
| **seg044** | **Sound driver (PlaySound/SetPicture/SoundInit)** | **DONE** | `decompile-seg044-sound.md` (command map + 13-slot effect bank; event dispatcher and web combat callers exist, original driver/step parity remains scoped) |
| **seg049** | **Keyboard (READKEY/KEYPRESSED)** | **DONE** | `decompile-seg001-043-049-boot-input.md` (INT 16h AH=00/01; two-step extended key: ascii then scan; scan==0⇒key 3 Ctrl-Break; SysDelay=ms sleep) |
| **seg051** | **File/block IO + `Random` (RNG)** | **RNG RECOVERED: CoK/DoK; DQK OPEN** | `cok-rng-native.md`, `dok-rng.md`; recurrence/bounding/ECL/dice recovered, native DoK selects the recovered ECL recurrence; full draw-order/seeding parity remains open |

## Loop order (highest verifiable value first)

1. **seg051 RNG** — the pseudo-random generator every dice roll depends on. Decisive, tiny,
   validates engine determinism. *(iteration 1)*
2. **ovr006** — after-combat XP award + split + treasure roll (mechanics).
3. **ovr026** — class/level/dual-class & stat-bonus tables (char mechanics).
4. **ovr015** — exploration movement / doors / wall-step (engine core).
5. **ovr011** — battle setup / combatant placement.
6. **ovr010** — monster combat AI.
7. **ovr007 + ovr020 + ovr022** — economy & item mechanics cluster.
8. **ovr021** — affect timing + spell learning + clock.
9. **ovr017 + ovr018** — save/import + roster.
10. **ovr030/031** — 3D world renderer (cross-check CCFP).
11. **seg044** — sound driver (feeds #13).
12. **DQK ECL dispatch table** — the §3.4 unlocated Gen2 opcode table.

Each unit is decompiled for **all three games** where it exists (CoK first, then DoK delta,
then DQK delta), noting Gen1↔Gen2 divergences. Output: one RE doc section per unit with the
exact Krynn file offset, the disassembled function, the COAB cross-reference, and a verified
formula/table (reproduced in Python or matched to existing engine code).

## Historical iteration log

**2026-10-11 string-helper correction:** the historical `strncpy`/`fstrncpy` labels
for live 126A:0ADE below describe a bounded **Pascal-string** copy, not a NUL-terminated
C string operation. The image-relative routine is 0A46:0ADE (AF3Eh); it copies the length
byte plus `min(length, bound & 255)` payload bytes and returns with RETF 0Ah.
Its neighboring length getter is 0A46:0B02 (AF62h). Original-code/Rust-C differentials
and the real resource caller are recorded in
[the reconstruction goal](cok-c-rust-reconstruction-goal.md).

The June/July RNG failures below document the searches attempted then. They are not current
RNG status. CoK's resident image is packed; readable overlay thunks do not prove otherwise.
The recovered multiplier is implemented by a low-word constant plus shift/add arithmetic,
so absence of its contiguous four-byte encoding cannot rule it out. See the current-status
section above before repeating any candidate search.

### seg051 RNG — DEFERRED (needs dynamic trace), but a real negative result (2026-06-26)
COAB replaced the original generator with .NET `System.Random` (`seg051.Random(n) =
random_number.Next() % n`), so it is **not** an oracle for the algorithm. Byte scans of all
three binaries rule out the common library generators:
- **Borland C `rand()` LCG multiplier `0x015A4E35` — ABSENT** in CoK/DoK START.EXE+GAME.OVR and
  DQK.EXE (and START.EXE is *not* packed: 542/511 plaintext `INT 3Fh` thunks, readable Borland
  strings — so the RTL would be visible if used).
- MS C (`0x343FD`), glibc (`0x41C64E6D`), Numerical-Recipes (`0x19660D`), Knuth (`0x08088405`)
  32-bit multipliers — all ABSENT.
- The clustered `AND AX,0x7FFF` at DQK `0x5828–0x58a4` are **INT 21h return-value masks** (the
  Borland DOS API wrapper idiom `clc; int 21h; jb err; and ax,0x7fff [; neg ax]`), NOT the RNG.
**Conclusion:** SSI used a custom RNG with no string/constant anchor. Locating it headlessly via
static scan is infeasible; the cheap path is a **DOSBox-X watchpoint** on the seed variable during
a known dice roll (e.g. a fixed-seed combat), then back-trace the writer. Deferred until a dynamic
session; the loop proceeds with string-anchored units where `disasm_*.py` xref is decisive.

### seg051 RNG — DEFERRED, dynamic-trace round 2 (2026-07-17): live pipeline proven, 3 candidates ruled out, blocker narrowed

**Not cracked this round.** A live DOSBox-X trace pipeline was built and proven fully
deterministic for CoK specifically (three independent fresh boots reproduce the 35-descriptor
VROOMM preload byte-identically — same runtime segments, same `cc` tick counters — matching
`disasm_cok.py overlays`'s static table exactly), but the specific roll_dice/to-hit call site was
**not** located. This is a real, narrowed negative result, not a stall.

**What was tried:**
- Static candidate search (scan every CALL/LCALL in `GAME.OVR` for an immediately-preceding
  `mov al, 0x14` — a d20-roll shape) found 9 candidates. The two highest-confidence — file
  `0x129cb` and `0x13296`, both `lcall 0xdb, 0x4d` inside overlay descriptor 12 (codesz `0x3ea4`)
  — plus a third found this round, `0x32834` (`lcall 0xdb, 0x7a`), which `disasm_cok.py resolve`
  reveals is descriptor 24's own entry dispatcher (`proc_off=0`, calls out to five other
  overlays), not a leaf routine.
- `disasm_cok.py resolve 0xdb 0x4d` independently votes selector `0xdb`'s overlay base as
  descriptor 24 (file `0x365a6`, "18/18 stub entries hit Borland prologues" — solid static
  confidence), landing offset `0x4d` on file `0x395b5`. Reading that function's body shows it
  never touches its incoming stack parameters — it operates on a fixed global pointer at
  `DS:[0x6a2e]` and calls two *other* still-unresolved selectors (`0x116`, `0x128`). That is not
  the shape of `roll_dice(dice_size, dice_count)`, so this specific resolution is doubted despite
  the overlay-base vote being sound.
- Live-armed simultaneous execution breakpoints at all 3 candidates' boot-time VROOMM-relocated
  addresses (`3524:1DE3`, `3524:22AE`, `3887:300F`) and let the demo/attract mode free-run for
  ~230s of real wall-clock time. Confirmed via a `PrintWindow` screenshot of the actual render
  window (see methodology note below — the debugger console itself is not a valid progress signal
  while free-running) that real combat resolution executed during this window: *"SIR RINGWALD
  ATTACKS GREEN DRAGON HITTING FOR 75 POINTS OF DAMAGE. GREEN DRAGON GOES DOWN. GREEN DRAGON IS
  KILLED."* — an unambiguous to-hit + damage-roll + kill sequence. **None of the 3 breakpoints
  fired.** None of the 3 candidates is the routine that actually executed.
- Ruled out a confound before concluding the above: overlay reloading. CoK's VROOMM is confirmed
  to be a genuine *dynamic* overlay manager, not a load-once cache — a follow-up session captured
  90 sequential `INT 21h AH=42h` (lseek) events past the initial 35-descriptor boot preload and
  found two *other* overlays (codesz `0x18f8` and `0x05cd`) reloaded to new runtime segments
  mid-session (`3604`→`490b`, `31cb`→`4acb`). But neither descriptor 12 (codesz `0x3ea4`) nor
  descriptor 24 (codesz `0x37b4`) — the overlays hosting all 3 candidates — reloaded in that
  window, so the boot-time breakpoint addresses should still have been valid when combat fired.
  The candidates are very likely just the wrong call sites, not stale addresses.

**Methodology finding worth preserving:** DOSBox-X's debugger console (driven via
`tools/dosbox_debugger_input`) does not refresh its displayed register/output text while the CPU
is in free-run (`RUN`); commands sent during free-run (`BPLIST`, `D`, …) are silently dropped
rather than queued, only taking effect after a genuine break. The `cc=` tick counter and the
`Output` scrollback both stay byte-identical across repeated queries even while the guest is
genuinely executing and rendering new frames — polling the console is **not** a valid "is it still
running" signal. The only reliable live progress check during free-run is a `PrintWindow`
screenshot of the actual render window (title *without* the `DEBUGGER` suffix), independent of the
debugger console.

**Precise remaining blocker:** the static "immediate-`0x14`-near-a-call" heuristic used to
generate the 9 candidates is too narrow and evidently misses the real call. Two concrete next
steps, both using the now-proven live pipeline: (a) broaden the static scan to catch word-sized
`mov ax, 0x14` / any push of a small dice-shaped constant (1–12, 20, 100) regardless of the
preceding mnemonic, including calls reached only through the still-unresolved selectors `0x116` /
`0x128` / `0xa46` / `0xe6` / `0x111`, then re-run the same live-multi-breakpoint check against the
larger set; or (b) work backward from the on-screen combat text — find CoK's draw call for
`"HITTING FOR %d POINTS OF DAMAGE"`, breakpoint it live, and trace backward through the
register/stack state at that point to the routine that produced the damage value, which leads
directly to the real dice primitive without guessing the call site in advance. Route (b) is
probably higher-yield: it needs no static candidate list at all.

### seg051 RNG — DEFERRED, dynamic-trace round 3 (2026-07-18): 4th candidate ruled out live, selector-resolution limit identified

**Not cracked.** Route (b) (backward-trace from the on-screen `"HITTING FOR %d POINTS OF
DAMAGE"` text) was attempted first per the prior round's recommendation, but stalled: driving
the boot-time BPINT-gated RUN sequence deep enough to reach on-screen combat text, while keeping
the debugger able to take a fresh `MEMDUMPBIN`, proved impractically slow (`INT 21h AH=42`
lseek fires on every file read, so 220 BPINT-gated `RUN`s only advanced the game from boot to
the title's "LOADING...PLEASE WAIT" screen — nowhere near combat). Pivoted to route (a)
(broaden the static candidate scan) instead, which produced a real result:

- **Broadened static scan** (`scan_dice_calls.py`, ad hoc): instead of round 2's single
  immediately-preceding `mov al,0x14`, scanned every intra/cross-overlay `CALL`/`LCALL` in
  `GAME.OVR` (disassembled per-overlay using the verified `DESCS` table so capstone starts
  aligned on a real code boundary) for **two or more distinct dice-shaped immediates
  (∈{1,2,3,4,5,6,8,10,12,20,100}) within the preceding 24 bytes** — a `roll_dice(sides, count)`
  argument shape, not just a lone "20" (which is common for unrelated reasons). Found 21 call
  sites across 8 overlays. The strongest pattern: **`lcall 0xdb, 0x4d`** (file `0x395b5`,
  overlay 24, `disasm_cok.py resolve` confirms 18/18 stub entries hit Borland prologues — high
  static confidence) is called from **3 different overlays** (2, 12, 13) with varying dice pairs
  (20+100, 20+10, 12+20 respectively) — a repeated shared-utility signature, stronger than any
  round-2 candidate (all of which were single-call-site).
- **This is the SAME function round 2 had already found and doubted** (`0x395b5`: no incoming
  stack args, reads a fixed global struct at `DS:[0x6a2e]`, calls two further selectors). Full
  body disassembly this round: `lcall 0x116,0x2a`; `lcall 0x128,0x4c1`; then twice reads
  `es:[di+2]`/`es:[di+3]` off that global pointer, `cwde; add ax,3; push ax` each, then
  `push 0xff; push 8; lcall 0x116,0x52`. The repeated-caller pattern from the new scan raised
  confidence enough to re-test it live despite round 2's doubt.
- **Live-verified and ruled out, more thoroughly than any prior candidate.** Fresh deterministic
  boot capture (same 35-descriptor BPINT/RUN pipeline; overlay 24 this boot loaded to runtime
  segment `0x2845`, confirmed via the established `es:[0x10]=segment`/`es:[0x08]=codesz` pattern
  at the boot RUN step where `EDX` low16 matched descriptor 24's fileofs `0x365a6`). Armed
  `BP 2845 300F` (the function's entry, `cs:0x300f` = `file 0x395b5 - overlay_base 0x365a6`),
  deleted the boot BPINT, and free-ran for **~285s of real wall-clock time**, polling via
  `PrintWindow` screenshots of the render window (not the debugger console, per the established
  methodology). This single free-run window covered the **entire canonical demo sequence**: the
  party roster/narration screen, a full zombie kill (*"ZOMBIE HITPOINTS 9 AC 8 ... ZOMBIE IS
  DESTROYED"*), and through to the post-dragon-fight ending narration (*"EVEN WITH THE DEFEAT OF
  THE DRAGONARMIES, EVIL NEVER RESTS..."*, Sir Ringwald's HP reset to 75 — matching round 2's own
  dragon-kill screenshot's aftermath). **The breakpoint never fired once** across at least two
  separate monster kills with real damage/death resolution. `0xdb:0x4d` (file `0x395b5`) is ruled
  out as the real call site, joining round 2's 3 candidates — 4 static candidates now
  live-disproven.
- **New methodology/architecture finding:** the scan surfaced two more strong repeated-pattern
  candidates — `lcall 0xa46, 0xac4` and `lcall 0x521, 0x353` (called together, back-to-back, at
  the same dice-preceded sites in overlays 1, 19, and 22) — but **neither selector resolves**
  under `disasm_cok.py resolve`'s `0x200 + sel*16` static approximation (same for `0x116`, the
  selector round 2's now-4th-ruled-out candidate itself calls into). Only 1 of the 5 previously
  "unresolved" selectors from round 2 (`0xe6`) resolves to an overlay base at all, and even that
  one has no valid stub for the specific offset this scan found (`0xe6:0x52` — "off out of this
  overlay's stub table"). This is consistent with VROOMM selectors being **dynamically
  reassigned to different overlays at different points in the game**, not statically 1:1 with an
  overlay — meaning the current static toolchain has a real, structural resolution ceiling for
  these selectors, not a scanning gap. Reaching `0xa46:0xac4` / `0x521:0x353` live requires either
  reversing the per-descriptor FIXUP TABLE (flagged as the correct-but-unstarted fix in
  `disasm_cok.py`'s own comments, see `disasm-spells-krynn.md` §25.5) or finding their live
  runtime segment empirically via a fresh boot capture the way overlay 24's was found this round
  (boot-time BPINT/RUN + `es:[0x10]` census) rather than via static selector resolution at all.
- **Reconfirmed standing blocker:** attempted a post-run `MEMDUMPBIN` to check whether overlay 24
  silently reloaded to a different segment mid-session (the confound round 2 explicitly ruled out
  for its 3 candidates, but hadn't yet checked for this one) — the command was silently dropped
  because the guest was still free-running (no stop point was ever reached), reconfirming round
  2's finding that debugger commands do not queue during free-run. This confound is therefore
  **not yet ruled out** for this specific candidate, though it is already disproven on grounds
  independent of that question (the breakpoint didn't fire regardless of what caused that).
- **Precise next steps**, ranked: (1) empirically locate `0xa46:0xac4` and `0x521:0x353`'s live
  runtime segments via a fresh boot capture (same method as this round's overlay-24 lookup,
  just needs the right overlay index/fileofs identified first — likely overlays 1, 19, or 22
  themselves since that's where the calls originate, not necessarily a new overlay) and
  live-test them the same way; (2) if that also comes back negative, the "immediate dice-shaped
  constant near a call" heuristic family (both round 2's and this round's broadened version) may
  simply be the wrong shape entirely — e.g. real dice rolls might load `sides`/`count` from a
  data table or a caller-supplied register rather than an inline immediate, in which case a
  genuinely different heuristic (e.g. scanning for the arithmetic shape of an LCG itself —
  `imul`/`mul` by a 16-bit odd constant followed by `add` and a mask/shift — directly, without
  any call-site anchor at all) is likely the more productive route left.
- Session hygiene: sole DOSBox-X session this round (policy: 1 concurrent), all PIDs killed by
  exact PID (`63544`; an earlier session `66568` from the immediately-prior round was found still
  running at the start of this round and was also killed by exact PID), `Get-Process dosbox-x`
  confirmed empty at both checkpoints and at the end.

### seg051 RNG — DEFERRED, dynamic-trace round 4 (2026-07-18): both round-3-remaining candidates live-resolved and RULED OUT; static-resolution ceiling independently reconfirmed; RNG still UNLOCATED

**Not cracked.** Followed round 3's own instructed next step "(b) empirically locate the live
segments for `lcall 0xa46,0xac4` and `lcall 0x521,0x353` via a fresh boot capture, break on the
overlay-load call itself and read the resulting segment register live" to completion — both are
now live-resolved, live-traced instruction-by-instruction, and **both ruled out** as the RNG.

- **Route (a) re-checked and closed off for good.** Before starting the live trace, re-verified
  round 3's claim that static FIXUP-TABLE reversal was the alternative route by running an
  existing, more rigorous tool this round discovered was already in the tree —
  `tools/vroomm_layout.py` (real per-descriptor FIXUP TABLE parser, not the `0x200+sel*16`
  approximation `disasm_cok.py resolve` uses). Fresh run (`vroomm_layout.py "../Champions of
  Krynn" --json build/scratch-cok-vroomm-r4.json`) confirms `stub_selector_base=0x38`,
  `strict_status=verified`, and — critically — selectors `0xa46`, `0x521`, and `0x614` are ALL
  still classified `unresolved_relocated_segment` even by this stronger resolver. Cross-checked
  DoK too (`vroomm_layout.py "../Death Knights of Krynn"`): DoK's own structurally-analogous
  highest-call-count selector (`0xa07`) is likewise entirely `unresolved_relocated_segment`. This
  confirms route (a) was never a live option for these selectors with the tooling that exists —
  not a scanning gap, a genuine structural ceiling (these selectors are dynamically reassigned at
  runtime, consistent with round 3's own conclusion) — so route (b) (live capture) was correctly
  the only remaining path, and is what the rest of this round pursued.

- **Fresh, more complete boot capture.** Launched a new DOSBox-X debugger-console session
  (`tools/dosbox_x_debugbox_probe.ps1`, no `-GameLink` — this session used the DEBUGBOX
  debugger-console + `tools/dosbox_debugger_input` `.dotnet` helper exclusively, never
  SendKeys/SetForegroundWindow/SendInput) with `BPINT 21 42` + 40× `RUN` (vs. the prior
  round's 36-action capture), successfully recording **all 35 descriptors'** live runtime
  segments this time, including **descriptor index 1** (fileofs `0xda`, codesz `0x7d6`) → live
  segment **`0x383E`** — the overlay hosting both of round 3's remaining candidate call sites.
  Session left running post-boot (`-NoActionScreenshots -NoInitialScreenshots`, process not
  auto-killed) so it could keep being driven interactively.

- **`0x521` (offset `0x9ba`) — live-traced, ruled out.** Single-stepped (F10/F11 special-key
  input, not typed text — see methodology note below) into `lcall 0x521,0x353`'s sibling call at
  `383E:000B` → live `0D45:09BA`. Full instruction trace: calls a far routine at `11E8:00A2`
  (reads 4 words, DOS-`GetTime`-shaped: hour/min/sec/hundredths), then combines them via repeated
  calls to a Borland-runtime 32×16 multiply helper at `126A:0A14` (`si:di × cx` cross-multiply,
  `retf`) with multipliers 100 and 6000 — the standard `hour*360000 + minute*6000 + second*100 +
  hundredths` "clock as one 32-bit hundredths-since-midnight scalar" idiom. **This is a clock
  reader, not the RNG.** Its caller, `383E:0000` (the file-`0xda` overlay-1 wrapper, static
  selector `0x614`, live segment **`0x0E38`**), was traced and characterized as a generic
  timed-delay/busy-wait utility: takes a `[bp+6]` seconds-to-wait parameter (observed both `0`
  and `10` across separate invocations during boot), computes `threshold = clock + param*100`,
  loops re-reading the clock until passed. **Also not the RNG** — a title-screen wait/blink
  utility (fired 3+ times naturally during boot: once at "LOADING...PLEASE WAIT", at least twice
  more at the title screen). This closes out selector `0x521` at offset `0x9ba` specifically
  (leaving offset `0x353`, the actual round-3-flagged pairing, to be resolved separately — see
  below; same selector, same live segment `0x0D45`, different offset).

- **`0xa46:0xac4` — live-resolved, ruled out on segment-identity grounds.** Free-ran (F5) from
  the title screen forward and hit the actual flagged call site `383E:0288` (`lcall 0xa46,0xac4`)
  live — resolves to **`126A:0AC4`**. `126A` is the *same segment* already characterized above
  as hosting the generic Borland-runtime multiply helper (`126A:0A14`), and (see next bullet) a
  `strncpy`-shaped copy helper (`126A:0ADE`) — i.e. this round independently confirmed `126A` is
  a **shared low-level runtime-library segment** hosting at least 2 distinct generic helpers at
  different offsets, fully consistent with `0xa46` being CoK's single highest-call-count selector
  project-wide (2268 sites per `docs/engine/research/vroomm-fixup-layout.md`) — the signature of a
  shared utility segment, not one game-specific RNG routine. Not stepped into byte-for-byte at
  this specific offset (`0xac4`) for lack of remaining time budget, but ruled out with high
  confidence on segment-identity + call-frequency grounds, matching the same reasoning class
  round 2/3 used to accept/reject prior candidates.

- **`0x521:0x353` (round 3's actual originally-flagged "dice-preceded" candidate) — live-traced
  in full, ruled out.** Immediately after the `0xa46:0xac4` call site, stepped into
  `383E:028D`'s target directly: resolves to **`0D45:0353`** (same segment as the clock reader
  above, confirming the segment hosts multiple distinct helper functions, not just one). Full
  instruction-by-instruction trace of the prologue and body:
  - `push bp; mov bp,sp; sub sp,0x104` — allocates a **260-byte local stack buffer**.
  - `les di,[bp+06]; push es; push di` — loads and re-pushes a **far pointer parameter** (first
    argument, a `far char*`).
  - `lea di,[bp-0100]; push ss; push di; mov ax,0xFF; push ax` — pushes a pointer to a local
    256-byte buffer and a max-length of 255, then `call 126A:0ADE` (a **`strncpy`/`fstrncpy`-shaped
    helper**, matching the exact calling convention: `src_far_ptr, dest_local_ptr, maxlen`).
  - `call 0F67:0051` — a second, not-yet-identified far helper call.
  - `cmp byte [bp+10],0x27` / `cmp byte [bp+0E],0x27` — checks two parameter bytes against
    **`0x27` = ASCII apostrophe `'`**, with a conditional branch.
  - Then (on the non-branch path) a byte-by-byte **string-shift-right loop**: `mov al,[bp-0100];
    mov [bp-0101],al; mov al,[bp-0101]; ...` — classic "insert a character, shift the rest of the
    buffer right by one" pattern.
  - **Verdict: this is a text/grammar formatting routine** (shape: `far char* fn(far char* str)`,
    copies into a local 256-byte buffer, checks for a trailing apostrophe, and shifts bytes to
    insert a character) — most plausibly a **pluralization or possessive-suffix formatter** (e.g.
    "point" → "points", or a possessive `'s`), used when building game text. This is fully
    consistent with *why* round 2's original backward-trace from `"HITTING FOR %d POINTS OF
    DAMAGE"` flagged this call site in the first place — it sits adjacent to the damage-message
    text-building code — but it is the **string formatter for the message, not the value
    computation or the dice roll itself**. **Definitively NOT the RNG.**

- **Net result: both of round 3's remaining candidates are now closed.** Combined with rounds
  1–3's earlier candidates, **every currently-identified static candidate for the RNG has now
  been live-disproven.** The RNG itself remains genuinely **UNLOCATED**.

- **New reusable methodology findings** (for future rounds / other subsystems):
  - **Typed text debugger commands can get permanently wedged for the rest of a session.** Early
    in this round, sending an invalid one-character command (`"T"`, intending "trace") caused
    `*** Debugger command not recognized`, and every subsequent typed `--command` (including
    otherwise-valid ones like `BPDEL`/`BPLIST`) kept failing the same way — the debugger console's
    on-screen Output/scrollback history shows an ever-growing concatenated tail
    (`I-> TTTHELPBPLISTBPDEL 3...`) that makes it look like commands are jamming together. **Do
    not attempt further diagnosis or recovery mid-session** — the `--key ENTER/F5/F10/F11`
    special-key inputs remain fully reliable and independent of this issue (verified via
    register/CS:IP state changes across dozens of calls even after text commands broke), so the
    practical fix is to **avoid all typed `--command` text after the first invalid one** and do
    all further breakpoint/step control via the special keys only. For a future session, simply
    never send an unvalidated command string (check against a known-good allowlist first).
  - **A `RUN`/F5 "continue" issued while CS:IP sits exactly at an armed breakpoint's own address
    re-triggers instantly (0 cycles elapse) and looks identical to "the guest is frozen."** Six
    consecutive F5+wait(10s) polls all showed byte-identical `cc=73877809`/`73877832` and
    unmoved EIP before this was diagnosed — the fix is to single-step **once** (F10/F11) to move
    off the exact breakpoint address before issuing another F5 continue. This is a distinct,
    previously-undocumented failure mode from the two already known (guest paused = drops
    keypresses; `BPINT` doesn't hook hardware IRQ) — a third reusable DOSBox-X automation
    gotcha worth remembering for any future trace.
  - **`vroomm_layout.py`'s FIXUP-TABLE resolver is real prior art** for this exact static-ceiling
    problem and should be checked/re-run at the *start* of any future selector-resolution attempt
    (it was not mentioned in round 3's notes despite already existing in the tree).

- **Recommended next steps for round 5** (the RNG source is now the *only* open question in this
  entire subsystem-decompile program, all other candidates from all 4 rounds being exhausted):
  1. **Trace forward, not backward, from the damage number's origin**, one level higher in the
     call chain than round 3's `353`/`0xa46` block: since `0D45:0353` is now confirmed to be the
     *string formatter* for the damage message (not the value computation), the actual dice-roll
     computation almost certainly happens **earlier in the same caller function** (the one making
     the `0288`/`028D` call pair), likely just before the `%d` value is pushed as a formatting
     argument. A fresh single-step trace starting a few dozen bytes *before* `383E:0288`, in the
     same caller, watching for where the damage integer itself is first computed (not just
     formatted), is the most promising concrete lead.
  2. If that still comes up empty, pursue round 3's own fallback: scan directly for the
     **arithmetic shape of an LCG** (`imul`/`mul` by a 16-bit odd constant, `add`, mask/shift)
     without any call-site anchor at all, now that `126A` (Borland runtime helpers) and `0D45`
     (a shared "utility functions incl. clock + text-grammar" segment) are both known-negative
     segments that can be excluded from the scan to cut noise.
  3. Reaching real combat/dice-roll code from a cold boot via the debugger-console-only pipeline
     remains genuinely slow (title screen idle-loop dominates); a `-GameLink`-enabled launch
     (adding legitimate focusless keypress delivery to advance past the title screen into the
     demo/combat sequence) would very likely unblock reaching gameplay code far faster than
     free-running and hoping the attract-mode timer advances on its own — worth trying first in
     round 5 instead of a pure debugger-console session.

- **Session hygiene:** sole DOSBox-X session this round (policy: 1 concurrent, confirmed no other
  `dosbox-x.exe` process existed before launch), PID `53372`, killed by exact PID
  (`taskkill /F /PID 53372`) at the end of the round, `Get-Process dosbox-x` confirmed empty
  both immediately after kill and at final wrap-up.

### seg051 RNG -- DEFERRED, dynamic-trace round 5 (2026-07-18): selector 0xa46 fully closed (proven Borland soft-math library, not RNG); reopened + narrowed a live-real dice-roll caller chain (0x395b5 via treasure generation); GameLink route recommended for round 6

**Not cracked.** Followed this round's assigned order: (b) a prologue-anchored static
LCG-arithmetic-shape scan first (new tool `tools/scan_lcg_shape.py`), THEN (a) live tracing.
Produced a genuine new static lead, definitively closed selector `0xa46` via live memory
proof (stronger than round 4's inference), and found real evidence that reopens round 3's
"ruled out" verdict on `0x395b5` -- but the live re-test could not be completed this round.

- **(b) Static scan, done properly this time.** Round 2-4's static scans used raw linear
  disassembly from an overlay's file start, which -- discovered and fixed this round --
  walks straight through inline ASCII string/data tables mixed into the code and produces
  overwhelming false `imul`/`mul` hits (byte `0x69` collides with printable text; e.g. the
  ASCII fragment "...ent " misdecodes as a spurious `imul esp,[bp+di+0x69],0x20746e65`).
  Rewrote the scan to be **prologue-anchored** (only disassemble from real Borland `55 89 E5`/
  `55 8B EC` prologues, capped at the next prologue) -- the same validation idiom
  `disasm_cok.py resolve` already uses for call targets. 827 prologue-anchored functions
  scanned across all 35 CoK overlays. Direct-opcode `imul`/`mul`-by-immediate scan: 249 raw
  hits, but every genuine (non-text-collision) `mul`/`imul` instance found was either a
  variable-times-variable percentage scale, a fixed-point trig conversion (two constants
  `0x26a`/`0x6a` roughly matching 256*tan(67.5deg)/tan(22.5deg), repeated in
  `ovr24/fn@0x39a8f`), or 2-D table-index address arithmetic (`row*stride+col`) --
  **no isolated odd-large-constant multiply + additive constant + mask/shift LCG shape found
  anywhere** in prologue-validated code. A tightened mov-imm16-pair-then-call scan (32-bit
  odd constant assembled from two `mov reg,imm16` within 2 instructions, call within 4) found
  exactly **one** hit (`ovr02/fn@0x2c0a`, file `0x2c40`/`0x2c45`: `mov cx,0x87` +
  `mov di,0x4800` -> `lcall 0xa46,0x1145`) -- this became the entry point for the rest of the
  round.

- **Selector `0xa46` -- now DEFINITIVELY CLOSED, live-proven (not just inferred).** Chasing
  the one movpair hit and a second, much more frequent sibling shape (`ovr07/fn@0xa6bd`, in
  the same file region as `COMBAT_OVERLAY_BASE`, looping the identical 3-call sequence
  `lcall 0xa46,0x1153` -> `lcall 0xa46,0x113f` -> `lcall 0xa46,0x1157` across **7 sequential
  struct word fields** `0xEB..0xF7` off a far pointer parameter) led back into selector
  `0xa46` at 5 new, previously-unexamined offsets (`0x1092`, `0x1139/0x113f`, `0x1145`,
  `0x1153`, `0x1157/0x115f`, `0x1179`). Round 4 had only inferred `0xa46` was a "shared
  low-level runtime-library segment" from 2 offsets (`0xac4` multiply, `0xade` strncpy)
  without disassembling `0xac4`'s body. This round **captured it live and proved it**: a
  fresh DOSBox-X DEBUGBOX session (`BPINT 21 42` + 60x `RUN`, same methodology as round 4)
  landed at `CS=126A` -- the **exact same live segment round 4 found**, confirming it is
  boot-deterministic -- and `MEMDUMPBIN 126A:0E00 0x800` + `126A:1100 0x400` pulled ~2 KB of
  real code that disassembles cleanly (no text-collision risk on a direct capstone read of
  real memory). The result is unambiguous: this segment is **Borland's software long/
  floating-point arithmetic runtime** -- recognizable named algorithm shapes present:
  sign/exponent alignment via `cmp cl,8`/byte-shift loops and an `0x8000`-bit sign mask, a
  **byte-wise partial-product multiply** (`mul ch`/`mul si`/`mul di` -- 8x8-bit partial
  products summed into a wider result, the classic software-multiply-without-a-real-32x32-op
  pattern), a **divide entry that checks its divisor for zero before dividing** (`or cl,cl;
  je <error>`), and a shared **error-code trampoline** (`mov ax,0xC8/0xCD/0xCF; jmp 0xe2`).
  Every entry point examined operates purely on its register/stack arguments --
  **zero absolute/fixed-address memory references found anywhere in the ~2 KB dumped**, i.e.
  this segment provably holds **no persistent state of its own** and structurally cannot
  itself be the seed-holding core of an LCG (though it is very plausibly what a hand-written
  LCG's own 32-bit multiply-add step would call through, if SSI's RNG uses this library
  instead of an inline `imul`). This selector is now closed for good, at the standard this
  project holds itself to (live-proven, not inferred).

- **A genuine new lead, reopening round 3's "0x395b5 ruled out" verdict.** Backtracking
  `ovr07/fn@0xa6bd`'s only two callers (found via `tools/vroomm_layout.py`'s real
  per-descriptor fixup table, not `disasm_cok.py resolve`'s historical `0x200+sel*16`
  approximation -- that approximation is independently shown wrong here: it maps selector
  `0x4e` to descriptor 9, but the real fixup table shows selector `0x4e`'s actual live target
  at this call site is descriptor 7 / file `0x8a41`, i.e. the confirmed combat overlay) led
  to `ovr02/fn@0x2c0a`, which computes a `100 - x` percentage complement. Independently, the
  exact same `lcall 0xa46,0x1153`/`0x1157` pair recurs (16/15 call sites total
  project-wide) inside a **classic percentile-bracketed treasure/reward table** at file
  `0x2d765` in `ovr21` (`cmp al,1..10 -> base 0x1c2(450)+d50`, `cmp al,11..20 -> base
  0x1f4(500)+d100`, `cmp al,21..40 -> base 0x2ee(750)+d150`, `cmp al,41..50 -> base
  0x4e2(1250)+...`, more brackets follow) -- and the **die roll that produces the
  bracket-selecting value `al` is `lcall 0xdb,0x4d`, i.e. file `0x395b5`** -- **the exact
  function round 3 live-tested and "ruled out"** (breakpointed its entry, free-ran ~285s
  through a real zombie kill + dragon kill, breakpoint never fired). Walking one level
  further out, this treasure-bracket function's own caller (file `0x2d21b`,
  prologue-verified, called from **descriptor 6** -- the overlay immediately preceding the
  combat overlay itself, `codesz 0xa45`, file `0x7f62`..`0x89a7` -- via selector `0xb3`, and
  also from descriptor 4) opens with an explicit **"is there anything to award"
  short-circuit**: it reads a global encounter/area pointer at `DS:[0x6096]` (a struct
  already seen at offsets `0xEB..0xF7`, the same 7-slot coin/treasure array
  `ovr07/fn@0xa6bd` iterates), checks fields `+0xF5`/`+0xF7` for `== 0`, and if **both** are
  already zero it prints a message (via `lcall 0xa46,0xac4` copy + `lcall 0xe6,0x7a` display)
  and returns without ever reaching the dice-roll/bracket-table code at all. **This is a
  coherent, fully-static-traced candidate call chain for SSI's actual treasure dice-roll
  primitive** (`descriptor-6 award entry 0x2d21b` -> `bracket table 0x2d765` -> `roll
  0xdb:0x4d = file 0x395b5` -> `scale via 0xa46`'s arithmetic library), and it gives a
  concrete, benign explanation for round 3's negative that does **not** require `0x395b5` to
  be a non-candidate: **the specific demo/attract-mode kills round 3's breakpoint sat through
  may simply have had pre-zeroed treasure fields** (a very plausible authoring choice for a
  short attract-mode loop), so the award entry's own short-circuit would skip the dice roll
  before it's ever reached -- round 3's negative proves `0x395b5` isn't the **to-hit/damage**
  roll (which is what that trace was actually anchored to via the on-screen "HITTING FOR"
  text), not that it isn't a roll primitive used elsewhere. This is genuinely new evidence,
  not a re-litigation of round 3's result on the same grounds.

- **Live re-test of the reopened hypothesis: attempted, did not complete this round.**
  Reused the same DEBUGBOX+`BPINT 21 42`+`RUN` session that resolved `0xa46`->`126A` (see
  above) and pushed it a further 60 continues (120 total this round) hoping to reach the
  title/demo screen where a scripted kill could be observed. A `PrintWindow` screenshot after
  the full 60-continue batch still showed only "LOADING...PLEASE WAIT" -- **independently
  reconfirming round 3's own finding** that the pure debugger-console `BPINT`-gated `RUN`
  loop is far too slow to reach real gameplay (round 3: 220 continues only reached the same
  loading screen). Did not reach a state where the reopened `0x2d21b`/`0x395b5` hypothesis
  could be tested live this round; this is an honest incomplete, not a negative result for
  the hypothesis itself.

- **Precise next steps for round 6, ranked:**
  1. **Use a GameLink-enabled launch** (`tools/dosbox_x_debugbox_probe.ps1 -GameLink`, or
     `tools/dosbox_gamelink.py` directly) to drive the guest past the title screen and into
     the demo/combat sequence via real focusless keypress delivery, instead of free-running
     and hoping the attract-mode timer advances on its own -- round 4 already recommended
     this and it was not tried yet (both round 4 and this round used the debugger-console-only
     path). This is very likely the actual unblocking step, independent of which specific
     candidate is being chased.
  2. Once past boot, set a breakpoint at the **outer** treasure-award entry (file `0x2d21b`,
     resolved to its live runtime segment via the same boot-census method round 4 and this
     round both used successfully -- descriptor 6, `codesz 0xa45`) rather than jumping
     straight to `0x395b5`. If it fires but returns early (short-circuit branch taken), that
     **confirms** the "demo kills have pre-zeroed treasure" explanation and points future
     work at finding/forcing an encounter with real treasure instead. If it fires and proceeds
     past the short-circuit, single-step through the bracket table into `0x395b5` live
     (segment already known to resolve reliably per round 3's own methodology) and watch for
     a persistent-seed read/write -- this would settle the multi-round question definitively
     either way.
  3. If `0x2d21b` never fires either (even across a real kill), that is real, valuable
     evidence that descriptor 6's award path isn't reached by the demo loop at all (a
     different subsystem must own treasure-on-kill, or the demo skips post-combat entirely) --
     redirect the search to whatever function `ovr006`'s already-documented
     `calc_battle_exp`/XP-award routine (`decompile-ovr006-xp-treasure.md`, GAME.OVR
     `~0x3cfa0`) itself calls for treasure, which may be a distinct call chain from the one
     found this round.
  4. New reusable tool: `tools/scan_lcg_shape.py` (prologue-anchored `imul`/`mul` and
     mov-pair-then-call static scanner) -- kept in the tree for reuse; the prologue-anchoring
     fix (vs. blind linear disassembly) is itself a durable methodology improvement worth
     applying to any future static scan of this codebase.

- **Session hygiene:** sole DOSBox-X session this round (confirmed `Get-Process dosbox-x`
  empty before launch), PID `11900`, killed by exact PID (`Stop-Process -Id 11900 -Force`) at
  the end of the round, `Get-Process dosbox-x` confirmed empty immediately after kill.


### seg051 RNG -- DEFERRED, dynamic-trace round 6 (2026-07-18): GameLink route unblocked real gameplay; treasure-award chain LIVE-DISPROVEN across 2 independent full demo cycles with real combat; RNG still UNLOCATED

**Not cracked, but the round's assigned GameLink route is now proven and a real, well-verified
negative was produced for round 5's reopened `0x2d21b`/`0x395b5` hypothesis.**

- **The GameLink route recommendation (round 4 and round 5 both flagged, never tried before this
  round) worked, and worked well.** New script `tools/trace_cok_treasure_rng.ps1`. The key fix
  vs. rounds 2-5's debugger-console-only approach: `BPINT 21 42` was armed for a SHORT boot
  census only (resolving the two target overlays' live runtime segments, ~15 `RUN` continues),
  then explicitly cleared (`BPDEL *`) before arming the two real execution breakpoints, so the
  guest free-runs at full real-time speed afterward instead of stopping on every disk read. A
  single `python tools/dosbox_gamelink.py press d` (focusless GameLink keypress, never
  SendKeys/SetForegroundWindow/SendInput) at the title screen reached real gameplay -- full
  party roster, real tactical combat with actual damage rolls, and a post-combat narrative
  screen -- within about 30-45 real seconds, vs. round 5's 120 debugger-only continues that
  never got past "LOADING...PLEASE WAIT". This is the fix promised since round 4; it is now
  proven and reusable for any future CoK dynamic trace.
- **Boot-time census reconfirmed determinism, and gave a new segment.** Fresh `BPINT 21
  42`-driven boot capture, run twice independently (two full sessions this round), both times
  resolved descriptor 24 (file `0x365a6`, hosting `0x395b5`) to runtime segment **`2845`** --
  byte-identical to round 3's independently-captured value, a third confirmation of CoK's
  boot-determinism claim. Descriptor 21 (file `0x2b8f2`, hosting both the treasure-award entry
  `0x2d21b` and the percentile-bracket table `0x2d765`) resolved to runtime segment **`3403`**,
  identically in both sessions -- a new data point, not previously captured in any prior round.
- **Live entry-byte-match validation (new this round, not just address-only trust).** Before
  arming, dumped both target addresses' live memory and compared to the exact retail `GAME.OVR`
  file bytes at the same relative offset:
  - `3403:1929` (treasure-award entry, file `0x2d21b`): **exact 16-byte match**, `True`.
  - `2845:300F` (roll primitive, file `0x395b5`): first 6 bytes match exactly
    (`55 89 E5 9A 2A 00` -- `push bp; mov bp,sp; lcall <offset=0x2a, selector=...>`), then the
    2-byte far-call SEGMENT SELECTOR field itself differs (live `093A` vs. file-raw `0116`), then
    the pattern repeats identically for a second far call (`9A C1 04 <sel>`, live `094C` vs.
    file-raw `0128`). This is **not a mismatch** -- it is exactly VROOMM's fixup-table mechanism
    caught in the act: the file stores selector placeholders (`0x116`, `0x128`, matching round
    5's own static disassembly `lcall 0x116,0x2a` / `lcall 0x128,0x4c1` verbatim), and the loader
    patches them to real runtime segments (`093A`, `094C`) in place once the overlay is resident.
    Every non-selector byte matches exactly, which is itself strong independent confirmation that
    round 5's disassembly of `0x395b5`'s body was correct and that this is genuinely the same
    function, correctly relocated -- not a stale/wrong segment.
- **Both breakpoints armed correctly (confirmed via `BPLIST`: `00. BP 2845:300F` /
  `01. BP 3403:1929`), then two independent full free-run sessions (~240s wall-clock each, no
  `BPINT` obstruction) each showed a complete demo cycle with REAL combat resolution -- and
  NEITHER breakpoint fired in either session.**
  - Session A: party roster (Sir Ringwald/Varianna/Lyn Swiftfoot) -> dungeon combat, on-screen
    "SIR RINGWALD ATTACKS BOZAK HITTING FOR 20 POINTS OF DAMAGE. BOZAK GOES DOWN AND IS DYING." ->
    (no breakpoint hit) -> back to CoK title screen.
  - Session B (independent boot, same script): party roster -> different combat instance, on-
    screen "BOZAK TAKES 12 POINTS OF DAMAGE FROM MAGIC MISSILE" (spell-cast damage, not a melee
    hit this time -- confirms the demo's RNG-driven combat varies run to run, not a fixed
    replay) -> a **post-combat NARRATIVE screen** ("BEAUTY AND DANGER ABOUND IN THE LANDS OF
    KRYNN...") showing the party's HP already reduced from the fight (75->68, 48->40) -- i.e.
    this session is confirmed to have passed all the way through combat resolution into the
    game's own post-battle flow, not just mid-fight -- -> (still no breakpoint hit) -> back to
    title screen.
  - Both sessions polled the debugger every 5s for the entire ~240s free-run window (not just at
    screenshot checkpoints), so a hit anywhere in that window would have been caught; polling
    continued to the full timeout in both cases with zero stops.
- **Interpretation: this is real, valuable evidence for round 5's own anticipated outcome #3**
  ("if `0x2d21b` never fires either, even across a real kill, that is real, valuable evidence
  that [the file `0x2d21b`] award path isn't reached by the demo loop at all -- a different
  subsystem must own treasure-on-kill, or the demo skips post-combat entirely"). With Session B
  now confirmed to reach an actual post-combat narrative screen (not just mid-fight) and still no
  hit, the "demo skips post-combat award processing entirely" reading is the best-supported one
  this program has produced so far -- more direct than round 5's "pre-zeroed treasure fields"
  guess, which would still require the entry `0x2d21b` itself to be CALLED (and immediately
  short-circuit); this round's result shows the entry is never called at all during the demo's
  own post-combat flow. This does **not** rule out `0x2d21b`/`0x2d765`/`0x395b5` as the real
  treasure/roll chain for **ordinary interactive play** (party-menu Load -> Begin Adventuring ->
  real dungeon combat, the non-demo route) -- only for the scripted demo/attract sequence
  specifically, which `decompile-worklist.md`'s own `cok-demo-decompile.md` finding already
  established discards its temporary party and skips normal post-battle prompts
  (`sub_29758`/`inDemo` skip of "Continue Battle?").
- **A post-run reload-confound check was attempted but did not complete.** After the free-run
  timeout, the script tried to force a brief stop via `BPINT 8` (18.2 Hz timer tick, expected to
  fire almost instantly) to re-verify both target segments still held the expected code
  (ruling out a very-late mid-session overlay reload as an alternative explanation for the null
  result) -- this specific check timed out at 5s in both runs and was skipped, an honest gap, not
  a disproven concern. Given the PRE-arm byte-match already independently proved correct
  residency before combat started, and CoK's overlay reloading (per round 2's own finding) has
  only ever been observed for two much-smaller overlays (codesz `0x18f8`/`0x05cd`, neither
  matching descriptor 21's `0x21c3` or descriptor 24's `0x37b4`), this gap is judged low-risk but
  is recorded honestly rather than silently assumed closed.
- **Precise next steps for round 7, ranked:**
  1. **Reuse the now-proven GameLink route to reach the NON-demo path instead** -- press `p`
     (Play) instead of `d` at the title, navigate the real party menu (`L` Load -> save slot `A`,
     the shipped `Champions of Krynn/SAVE/CHRDATA1-6.SAV` + `SAVGAMA.DAT` pregen party -- COAB
     `ovr018.startGameMenu`/`ovr017.loadGameMenu` keys verified this round by reading
     `coab_extracted/engine/ovr018.cs`/`ovr017.cs` directly, not yet live-tested -- then `B`
     Begin Adventuring), then move the party into a real wandering encounter and fight it to
     conclusion with the same two breakpoints armed. This is the single highest-value untried
     lever: it tests the exact same hypothesis chain on the actual party/inventory/treasure-field
     code path the demo is now shown to bypass, using infrastructure this round already built and
     proved (the GameLink+short-census+free-run pattern, entry-byte-match validation).
  2. If ordinary play ALSO never hits `0x2d21b`, escalate to route (b) from round 5's own
     plan: find whatever function `ovr006`'s documented `calc_battle_exp`/XP-award routine
     (`decompile-ovr006-xp-treasure.md`, `GAME.OVR ~0x3cfa0`) itself calls for treasure --
     a distinct call chain from the one chased across rounds 3-6, reached by tracing forward
     from that already-known anchor rather than backward from the percentile-bracket table.
  3. If `0x2d21b` DOES fire under ordinary play, single-step through immediately (using the
     `--key F10/F11` special-key mechanism, NOT a typed `T`/`TRACE` command -- round 4 already
     found typing `T` alone permanently wedges the debugger's text-command channel for the rest
     of the session) and capture the short-circuit check + bracket table + `0x395b5` call with
     full register/memory state, exactly as this round's task originally specified.
- **Reusable artifact:** `tools/trace_cok_treasure_rng.ps1` -- a general-purpose
  "BPINT-census -> BPDEL -> arm real breakpoints -> GameLink keypress -> timed free-run poll ->
  optional post-run reload check" harness, parameterized enough to retarget at any two CoK file
  offsets + a different GameLink key sequence. Worth reusing directly for round 7's Play-Demo
  route instead of writing a new script from scratch (swap the `press d` line for the
  `p`/`l`/`a`/`b` sequence derived from `ovr018.cs`/`ovr017.cs` above).
- **Note:** `tools/dosbox_gamelink.py screenshot` PNGs come back with **alpha=0 on every pixel**
  while the probe window is minimized (matches the same issue already flagged in
  `trace_dok_position_telemetry.ps1`'s header comment) -- the RGB channels are correct and
  contain real EGA-16 game graphics, but most image viewers (including this agent's own `Read`
  tool) render zero-alpha as blank/white. Any future script that wants to actually inspect these
  screenshots should strip/ignore the alpha channel (e.g. `Image.merge('RGB', im.split()[:3])`)
  before viewing -- this round lost some time to that before noticing.
- **Session hygiene:** sole DOSBox-X session at a time for both runs this round (`Get-Process
  dosbox-x` confirmed empty before each launch), PIDs `46516` and `75040` (an intermediate
  `55424` run failed on a PowerShell-5.1-incompatible `[Convert]::ToHexString` call before
  reaching the free-run phase and was also cleanly killed by exact PID from the script's own
  `finally` block), all killed by exact PID via the script's `finally` block, `Get-Process
  dosbox-x` confirmed empty after the final run.



### ovr006 after-combat XP + treasure — DONE (2026-06-26)
`decompile-ovr006-xp-treasure.md`. Extracted the exact XP-earn formula (`calc_battle_exp`:
`Σ field_13E*rolledHP + field_13C + goldXP + Σ plus*400`, then `/ living party`) and the
+10% prime-requisite bonus + ×½/×⅓ multiclass split (`addExp`), cross-referenced to the CoK
combat-results function at GAME.OVR ~0x3cfa0 (prints "experience points."). **Method note:**
data-string→code anchoring needs the overlay DGROUP base (methodology §3.2), so COAB is used as
the primary decompile source and the binary as the anchor — per methodology §6.1, full byte-
static decompile is corroboration, not the deliverable. **Engine GAP found:** XP tables exist
but no post-combat award/split/bonus routine — spec handed to the engine team in the doc.

### Loop framing (refined 2026-06-26)
After the RNG (no anchor) and ovr006 (DGROUP wall) iterations, the loop's per-unit product is a
**verified subsystem spec**: algorithm extracted from COAB (primary), anchored to the Krynn
binary region via `disasm_*.py`, cross-checked against `packages/engine` (flagging gaps/deltas),
with Gen1↔Gen2 notes. Byte-level disasm confirms where DGROUP binding allows; otherwise the COAB
decompile + binary anchor is the authoritative result (methodology §6.1).

### ovr026 class/level recalc — DONE (2026-06-26)
`decompile-ovr026-class-recalc.md`. `ReclacClassBonuses` (sub_6A3C6): THAC0 = max over class
slots, HitDice = max level, multi-attack at fighter/paladin≥7 / ranger≥8 (+ dual-class old-level
variant), classFlags item gating + UndreadyAll, dual-class ability reactivation; plus
`SaveVersePoisonBonus` (dwarf/halfling Con-scaled poison save +1..+4). **Engine GAP:**
`combatTables.ts` has single-class table lookups but no multiclass `recalcCharacter` compositing
— spec handed off. Pattern now consistent across iterations: the engine has the *tables*, the
decompile supplies the *compositing rules* the engine is missing.

### ovr015 movement/doors — DONE (2026-06-26)
`decompile-ovr015-movement.md`. `MovePartyForward` (sub_43813): 16×16 toroidal wrap via `&0x0F`,
8-direction deltas (corroborates `wallview.ts` from the binary), door-permission reset per tile,
and `step_game_time(search_flags&1 ? 2 : 1, 1)` careful-move 2× time cost. `MapSetDoorUnlocked`
(sub_43148): per-cell per-direction door-unlocked bits `x3_dir_{0,2,4,6}` in the GEO cell.
Engine: deltas+wrap already present (now binary-confirmed); the careful-move time cost and the
persisted door bits are the two items to verify against `geo.ts`/explorer step.

### ovr011 battle setup/placement — DONE (2026-06-26)
`decompile-ovr011-battle-setup.md`. `BattleSetup` (battle_begins): banner "A battle begins..."
(CoK GAME.OVR file 0xfde0), `combat_round=0`, ground-tile setup, `SetupCombatActions`,
`PlaceCombatants`, `game_state=Combat`. `PlaceCombatants` (sub_387FE): 11×6 deploy region;
team0 party at corner (0,0) facing `mapDirection/2`; team1 enemy at `encounter_distance *
MapDirectionDelta[mapDirection]` facing `((mapDirection+4)%8)/2`; front rank `(count+1)/2`.
`place_combatant` (sub_38380): tri-state L/R column expansion, first row=half_team_count then
12/row, bounds `cur_x>10||cur_y>5` (→row_scale++), boxed-in alternate-direction fallback (≤3).
**Engine GAP:** `tactical.ts` has battle mechanics but takes pre-positioned combatants — no
`deployCombatants()` formation generator. Same shape as prior gaps (engine has battlefield,
decompile supplies placement glue).

### ovr010 monster combat AI — DONE (2026-06-26)
`decompile-ovr010-monster-ai.md`. `PlayerQuickFight` (sub_3504B) turn ladder: re-roll
movement-style field_15 → FleeCheck → wand(anti-magic only) → queued spell → turn-undead →
spell → weapon+move+attack → guard. **Random** target pick (`roll_dice(nearTargets.Count,1)`,
NOT focus-fire). `data_2B8` 11×6 weave table; CanMove diag×3/ortho×2 + cloud-save gating.
`sub_3560B`/`ShouldCastSpellX`: priority-descending, save-aware spell pick. `CalcItemPowerRating`
weapon auto-select. `FleeCheck_001`: morale=(control_morale&0x7F)<<1; break→ Int>5 Surrender
else rout. Anchors: "flees in panic"@0xc564, "is forced to flee"/"Surrenders"@0xd821/0xd833,
"Magic On/Off"@0xb2a6. **Engine: NOT a missing-AI gap** — tactical.ts aiAction() is capable;
DELTAS = random-vs-weakest target, field_15 weave, save-aware spell priority, Int>5 surrender,
anti-magic wand, turn-undead-first, CalcItemPowerRating weapon pick.

### ovr007/020/022 economy & item cluster — DONE (2026-06-26)
`decompile-ovr007-economy.md`. Currency = **steel pieces** (binary-confirmed). Buy price =
`item._value` shifted by shop tier `area2_ptr.field_6DA` (0x01→>>4 … 0x80→<<3, default ×1).
Sell = `value/2`; stacks (non-ammo) `(count*value/2)/20`, ammo `(value/2)*count`; payout
`plat=offer/5, gold=offer%5` (**platinum=5×steel**). Identify flat **200**. Coin slots 0..6
(Copper/Silver/Electrum/Gold/Platinum/Gems/Jewelry). Gem appraisal d100 (10/50/100/500/1000/
5000); jewelry d100 random bands (rand(900)+100 … rand(10000)+2000). `randomBonus` d20 (1-14→+1,
15-20→+2). Anchors: "Not enough Money."@0x83d5, "Is It a Deal?/Sold!"@0x29551, "I'll identify
your"@0x2974f, "The Gem is Valued at"@0x2d1cc. **Engine DELTAS:** shop.ts uses fixed CANDIDATE
ITEM_PRICE + single gold scalar — replace with value×tier pricing, stack-sell penalty, coin
denominations, gem/jewel appraisal tables.

### ovr021 clock / affect time-out / spell learning — DONE (2026-06-26)
`decompile-ovr021-time-learning.md`. 7-slot **mixed-radix clock** `timeScales={10,10,6,24,30,12,
256}` = 6s/min/10min/hr/day/month/year; top-slot overflow **ages the party**. `step_game_time`
(sub_583FA): normal step +1 slot1 (=1min), careful +1 slot2 (=10min). `CheckAffectsTimingOut`:
affect durations are in **minutes**, decremented in ≤10 chunks, expired at 0. `rest_heal`: +1 HP/
member per 8*36=288 ticks. `CheckForSpellLearning`: memorize/scribe a level-N spell costs **N×3**
rest ticks (N×2 deferred). Anchors: "The Whole Party Is Healed"@0x2b235, "has memorized"@0x2b300,
"has scribed"@0x2b3c4. **Engine GAPS:** gameClock.ts is flat minutes only — add months/years +
aging, wire affect-minute expiry + N×3 learn timer to clock advance.

### ovr017/018 save / import / roster — DONE (2026-06-26)
`decompile-ovr017-save-import.md`. Save = **3 files**: `.sav`/`.guy` Player record (name@0..15),
`.swg` items, `.fx` affects. Import (`ConvertPoolRadPlayer`/`TransferHillsFarCharacter`) = per-field
semantic map Pool/Curse/Hillsfar→Krynn (offsets drift per game); grants **300 platinum**, clears
`animate_dead`, re-caps stats via EnforceRaceSexLimits; Hillsfar only raises improved stats. Full
Player field inventory enumerated (8-slot ClassLevel[], spellBook[0x38], thief_skills[8], dual
attack profiles, icon block). `AddPlayer` roster gates: **≤6 PC / ≤8 total**, paladin↔evil,
**≤3 rangers in the current helper**, dup name+mod_id. Anchors: "paladins do not join with evil scum"@0x23956, "too many
rangers in party"@0x2397a, "will tolerate no evil!"@0x23995. **Engine GAPS:** savedCharacter.ts
decodes the 409-byte CoK record but lacks cross-game import conversion, the 3-file split, and the
roster gates.

### ovr030/031 first-person 3-D renderer — DONE (2026-06-26)
`decompile-ovr030-3d-renderer.md`. `Draw3dWorld` (sub_71820): far→mid→near depth walk (drawStep
2→1→0, painter order, Near overpaints), rel dirs left=(d+6)%8/behind=(d+4)%8/right=(d+2)%8; Far
band = 4-cell L+R fans + side walls. `draw_3D_8x8_titles` (sub_71434) pinned piece tables
idxOffset/colCount/rowCount (seg600:0ADA/0AE4/0AEE), id→wallset=(id-1)/5 slice=(id-1)%5 (5
slices/set). 16×16 toroidal wrap; getMap_wall_type reads wall_type_dir_{0,2,4,6}; WallDoorFlagsGet
reads x3_dir_N (shares ovr015 door bits). **Sky time-of-day:** Draw3dWorldBackground overlays
sun/moon (sky_dax_250/251/252) by area_ptr.time_hour + mapDirection (sunrise 1-5 E/N, sunset
13-18 W/N). GEO block=0x402, WALLDEF rec=0x30C, ≤4 wall sets. Anchors: "WALLDEF"@0x3e26f, "Unable
to load geo in Load3DMap."@0x3e583. **Engine: geometry already DONE** — wallview.ts is a declared
1:1 transcription + CCFP /T matches oracle; this corroborates + pins piece tables. **GAP:** the
time-of-day sun/moon sky overlay is not in the FP renderer.

### seg044 sound driver — DONE (2026-06-26)
`decompile-seg044-sound.md`. COAB is NOT a faithful low-level oracle (replaced the driver with
.NET WAV — like seg051 RNG); it pins the **command interface**: SoundType {None,PC};
`PlaySound` dispatch (0/0xFF=stop-all, 1/f=noop, 2..e=play `sounds[arg-1]`); 13-slot effect bank
[1]missile [2]magic_hit [4]death [6]hit [8]miss [9]step [12]start. Gen1 CoK/DoK = PC-speaker
(resident port-I/O, no strings, dynamic-trace TODO). Gen2 DQK = digitized, **already codec-decoded**:
SFXDQ.VOC (voc.ts, DQK_SFX_NAMES cast/walk/hit/swing/bow/die…), SOUNDS.GLB DIG4 (dig.ts/CCSND),
XMI music (xmi.ts/opl2). Gen1↔Gen2 bank correspondence (step↔walk, hit↔hit, miss↔swing, missile↔bow,
magic_hit↔cast, death↔die). **Engine GAP (= the #13 hand-off):** all codecs exist but there's NO
event→sound dispatch layer (no SetSound toggle, no event→effect table, no playSound w/ stop-all).

### DQK Gen2 ECL dispatch table — CHARACTERIZED + documented negative (2026-06-26); **SOLVED 2026-07-18 (dynamic trace)**
`decompile-dqk-ecl-dispatch.md`. DQK stores ECL in **HLIB `DATA`** (`DISK3/ECL.GLB`, magic HLIB
tag DA), not DAX. Byte histogram: 56.8% in the Gen1 0x00–0x40 band, with the most-frequent low
bytes = exactly Gen1's most-used opcodes in the same roles (0x00 EXIT, 0x01 GOTO, 0x05 SUB, 0x09
SAVE, 0x03 COMPARE, 0x12 PRINTCLEAR) → **core numbering preserved**; frequent 0x41/0x42/0x4E →
**command set extended past 0x40**. Exact dispatch table = **dynamic-trace target** (no ECL
strings in DQK.EXE; CS-relative `jmp word[bx+base]` needs the live overlay segment per §3.2;
EclDump is Gen1-only) — recorded with the precise DOSBox-X breakpoint recovery procedure (same
outcome class as seg051 RNG).
**2026-07-18 UPDATE — SOLVED.** The dynamic trace ran (Unicorn tracer, no DOSBox-X needed):
live table = **canonical `2033:0d34` / file `0x032a54` / 0x42 direct-indexed slots
(opcodes 0x00–0x41)**, byte-identical live↔file, dispatch `jmp` + the single extended opcode
`0x41` both witnessed executing live (area-65 retail script). Gen1 numbering preserved 1:1
through 0x40 with the Gen1 shared-handler idioms intact; exactly ONE Gen2-added opcode
(`0x41`, handler `25a4:2719`/file `0x0429d9`, party-award-shaped, semantics still unproven);
opcodes >0x41 are range-checked no-ops (the static census's 85 other "extended" values were
decode-drift, as its own tiering predicted). Full handler map (all 66 slots with file
offsets) + fired-opcode logs: `decompile-dqk-ecl-dispatch.md` "2026-07-18 DYNAMIC TRACE —
SOLVED". Slot 0x24 confirms the `2033:081b` COMBAT handler candidate (live 0x24 fire itself
still undemonstrated).
**2026-07-18 UPDATE — WIRED INTO THE ENGINE (static-only follow-up, no DOSBox-X).** `0x41`
is now live in `packages/engine`: `EclDialect.opcodeOverrides` (new field, `disassemble.ts`)
lets a dialect add a whole new opcode definition rather than just re-frame a shared one;
`ECL_GEN2.opcodeOverrides[0x41]` sets `wordSet: 2, mnemonic: 'GEN2_EXT_41', uncertain: true`;
`vm.ts` gained `case 0x41` emitting a `scriptEffect{kind:'gen2Ext41'}` with the raw operands
(no invented "award" math). A new golden test (`test/eclGen2.test.ts`) decodes real retail
`ECL.GLB` area 65 and reproduces the live trace's exact fired-opcode sequence and operand
values (`[1, 100]`) byte-for-byte. `>0x41` stays `badOpcode`/halted — confirmed as the
engine's existing, deliberate decode-drift-detection convention (pinned by a new regression
test), not something to relax into silent continuation. See `decompile-dqk-ecl-dispatch.md`'s
"Engine cross-check (updated policy)" and `HANDOFF.md` for the full writeup.

### Historical running tally — targeted loop complete (2026-06-26)
DONE: ovr006 (XP/treasure), ovr026 (class recalc), ovr015 (movement/doors), ovr011 (battle
setup/placement), ovr010 (monster AI), ovr007/020/022 (economy & item cluster), ovr021 (clock/
affect-timeout/spell-learning), ovr017/018 (save/import/roster), ovr030/031 (3-D renderer),
seg044 (sound driver), DQK ECL dispatch (characterized 2026-06-26; **SOLVED by dynamic trace
2026-07-18** — table `2033:0d34`/file `0x032a54`, see the unit section above).
At that July update, seg051 RNG was the remaining trace target. This was superseded by
CoK's 2026-09-08 and DoK's 2026-10-07 recoveries; see the current-status section.

### ovr008 ECL string codec — DONE (2026-06-27, second-tier)
`decompile-ovr008-ecl-strings.md`. ECL text = **6-bit packed** (4 chars ⇄ 3 bytes, ~0.75 ratio):
`deflate` folds ch≥0x40 by −0x40 &0x3F (A→1..Z→0x1A; space/digits passthrough), `inflate`
reverses (v≤0x1F→+0x40); value 0 = terminator. 4-state bit packer
([c0:6|c1hi:2][c1lo:4|c2hi:4][c2lo:2|c3:6]). **Round-trip VERIFIED** in Python on real strings
("A BATTLE BEGINS","PALADINS DO NOT JOIN WITH EVIL SCUM"). `LoadCompressedEclString` reads inline
`[len][packed]` from ecl_ptr+0x8000. Typed string-memory map (vm_GetMemoryValueType): 0x4B00-4EFF
area, 0x7C00-7FFF area2 (0x7C00=player name), 0x7A00-7BFF global table, 0x8000-9DFF ECL block.
Shared Gen1/Gen2 (DQK packs identically, in HLIB DATA). Upgrades ovr008 PARTIAL→DONE.

## Historical loop completion summary

All 12 units of the loop order are worked. **11 produced verified subsystem specs**; **2 items**
(RNG, DQK ECL table base) were documented negatives bounded to a single dynamic-trace step each
— of which the **DQK ECL table base was closed 2026-07-18** (dynamic trace; unit section above),
leaving seg051 RNG as the sole open negative.
Output: 9 new `decompile-*.md` specs (ovr006, ovr026, ovr015, ovr011, ovr010, ovr007-economy,
ovr021, ovr017-save-import, ovr030-3d-renderer, seg044-sound, dqk-ecl-dispatch) covering combat
reward, character mechanics, movement, encounter setup, monster AI, economy, time/learning,
save/import/roster, the 3-D renderer, sound, and the Gen2 ECL command set.

**June implementation report:** many table helpers and web callers landed after the loop.
The list below records that batch, not complete title-local fidelity. Current limits are in
the subsystem notes: some helpers remain uncoupled from tactical paths, import and money
semantics vary by title, and the web rest cadence differs from CoK's recovered retail contract.

- ✅ **post-combat XP award/split** (ovr006) — `ruleset/addnd1e/experience.ts` + `test/experience.test.ts`, 17 tests. Commit `f603bfd`.
- ✅ **value×tier shop pricing + coins + appraisal** (ovr007) — `town/pricing.ts` + `test/pricing.test.ts`, 12 tests. Commit `408e9b7`.
- ✅ **multiclass `recalcCharacter`** (ovr026) — `ruleset/addnd1e/recalc.ts` + `test/recalc.test.ts`, 10 tests. Commit `4054fe1`. `reclac_thief_skills` done 2026-07-02 (`thiefSkills.ts`); **`classFlags`/`UndreadyAll` done 2026-07-02** (`ruleset/addnd1e-dragonlance/classFlags.ts` + `test/classFlags.test.ts`, 16 tests) — the multiclass recalc's compositing glue is now fully ported.
- ✅ **careful-move time + persisted door bits** (ovr015) — `world/explorer.ts` (`MapCell.doorsOpen`). Engine commit `1551717`; UI-wired `c67a98d`.
- ✅ **`deployCombatants` formation** (ovr011) — `combat/deploy.ts` 11×6 formation generator. Engine `1551717`; UI-wired (combat-setup) `aefe40a`.
- ✅ **AI fidelity deltas** (random-target default / save-aware spells / Int>5 surrender; SteppingPath 1.5×-diag + height-occlusion reach; SortedCombatant ordering) (ovr010/ovr032-033) — `combat/geometry.ts` + `tactical.ts`, `combatFormation.test.ts` (27 tests). Commit `1551717`.
- ✅ **7-slot calendar + aging + affect/learn timers** (ovr021) — `world/gameClock.ts` (radix `{10,10,6,24,30,12,256}`, year-rollover aging, rest-heal 288 ticks, spell-learn N×3 ticks), `gameClockCalendar.test.ts` (16 tests). Engine `1551717`; UI-wired (Encamp→Rest, 48 min/HP cadence) `c67a98d`.
- ✅ **cross-game import conversion + roster gates** (ovr017/018) — `save/` import field-map + `addPlayer` gates, `saveImportRoster.test.ts` (15 tests). Engine `1551717`; UI-wired `aefe40a` (binary-verbatim reject strings, stipend display-only — STEEL pool conversion still deferred).
- ✅ **time-of-day + per-area sky overlay** (ovr028/029/030) — `render/sky.ts` (`SKY_COLOURS[16]` per roof-bit + injected sun/moon), `sky.test.ts` (15 tests). Engine `1551717`; UI-wired `c67a98d` (first-person band; `roofByteOf` defaults INDOOR until the GEO per-cell roof bit is decoded — combat-screen sky stays latent behind the full-tile backdrop).
- ✅ **event→sound dispatch layer** (seg044, = the input side of audio task #13) — `audio/soundDispatch.ts` (13-slot bank), `soundDispatch.test.ts` (15 tests). Engine `1551717`; UI-wired (combat 5 SFX, explore step) `aefe40a`/`c67a98d`.

Gates on the full batch: `pnpm -r exec tsc --noEmit` 0 · engine vitest 1009/1009 (110 files) ·
web e2e 41/41 · `build:app` ok. Fanned out across 7 async subagents (worktree-isolated via the
agent-db shared store), integrated serially, then 4 follow-on "ultracode lane" UI-wiring passes
with adversarial verification (each finding marked CONFIRMED or PLAUSIBLE). Known faithful-latent
deferrals carried forward, not regressions: GEO per-cell roof bit not yet decoded (sky defaults
indoor), party.ts is a single shared STEEL pool (import stipend display-only), combat sky hidden
behind the backdrop tile until an outdoor-encounter path supplies a roof byte, `rearAc` stays
unlocated in both binary formats (RE.5/FBOV territory).

## RE.5 follow-up batch — DONE (2026-07-01)

A second, smaller wave dispatched after a doc audit surfaced 4 more open threads (not part of
the original 12-unit loop above). All 4 landed and verified this session:

- **DGROUP-base dynamic trace feasibility** — `docs/engine/research/dgroup-dynamic-trace.md`.
  Rigorous documented negative: DOSBox-X's debugger is real (`MEMDUMPBIN`/`BP`/`BPINT`,
  zero-keypress `-break-start`/`DEBUGBOX`) but has no script/autoexec input in shipped software
  (confirmed against 3 independent sources incl. an unmerged classic-DOSBox patch for exactly
  this feature); a live-fire attempt also hit an unrelated `MOUNT` regression in the only
  debug-capable build reachable. Static relocation-table alternative investigated and gives free
  partial wins (confirms DQK's `0x1D99` dispatch segment with zero execution) but doesn't replace
  the trace. Manual procedure + one untried automation angle (`WriteConsoleInput` into the
  debugger's own console) documented for whoever picks this up next.
- **Gen1 combat/spell magnitude cluster (DoK FBOV resolver)** — ported the FBOV/VROOMM resolver
  to DoK (`tools/disasm_dok.py`), validated on 4 native selectors (23/23, 17/17, 12/12, 4/4). DoK
  save-throw selector `0xcf` stays UNLOCATED with a rigorous negative. Along the way, re-tested
  CoK's `0xE6` against its full 47-site sample (not the small one that originally produced a false
  "10/12 resolves" claim) and found it's noise (2/47) — corrected in `disasm-combat-cok.md`. New
  cross-game hypothesis: CoK `0xE6` and DoK `0xcf` share one routine (identical call-offset stride
  fingerprint, CoK's set an exact subset of DoK's).
- **DQK resident-code combat unlocated items** — `disasm-combat-dqk.md` §10. OQ-1 (haste/slow)
  mechanism **RESOLVED**: not x2/÷2 arithmetic anywhere in the binary — DQK uses a discrete
  turn-priority-class system (`+0x37` duration slot, two-stage ID remap into classes `0x7F-0x89`).
  Exact spell-ID-to-class mapping still open (needs the spell-definition table). OQ-4 (fractional
  attacks) and OQ-6 (DEAD constant) remain UNLOCATED, now on exhaustive whole-file negatives
  instead of partial-range ones, each with a named next step.
- **MIDI.DAX / MUSIC.DAX DOS music format** — `docs/midi-dax-format.md`. CoK's format SOLVED:
  each song block is real 8086 code (not data), targeting a dual-SAA1099 Game Blaster/CMS pair —
  a genuinely new finding not in any prior doc or hackdoc. DoK's container + 6-way hardware
  dispatch SOLVED (PC speaker confirmed at index 1); the GLBR event body format is open.

Net effect: every currently-identified decompile thread in this project is now either DONE or a
rigorous documented negative with a named next step. No further decompile units are queued as of
this note — new ones would come from a fresh audit, not this loop.

## Follow-up: `reclac_thief_skills` (ovr026) — DONE (2026-07-02)

A gap flagged inline in the ovr026 write-up ("Still TODO... `reclac_thief_skills`") but never
closed. The full routine (`sub_6AAEA`) was already sitting in `coab_extracted/engine/ovr026.cs`
lines 482-555, uninspected — no dynamic trace needed, real-data-backed (the tables are the shared
engine's own compiled data). Ported to `packages/engine/src/ruleset/addnd1e/thiefSkills.ts`; see
`decompile-ovr026-class-recalc.md`'s new "`reclac_thief_skills` IMPLEMENTED" note for the full
write-up, including the two honestly-flagged unresolved pieces (magic-item bonus branches; the
race-row/dex-row table-index mapping to CoK's actual races/Dex scores). 15 new tests, full suite
1158/1158, tsc clean, apps/web e2e 44/44 (engine-only, not yet UI-wired).

**Current follow-up:** CoK/DoK RNG recovery supersedes the July seed-watchpoint negative.
Remaining work is title-specific: native DoK RNG sequencing/continuity proof, DQK RNG and live COMBAT proof,
seeding/draw-order parity, and the implementation limits listed in each subsystem note.
