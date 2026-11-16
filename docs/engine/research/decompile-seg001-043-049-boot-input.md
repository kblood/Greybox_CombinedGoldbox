# Decompile — seg001/043/049: boot/init, input read & keyboard (Krynn Gen1)

> **Status reviewed 2026-10-11:** the pseudocode below is the CoAB boot reference.
> CoK's own demo/new-game constants are now recovered: `ECL2#57` / `ECL1#36`,
> respectively ([cok-demo-entry-located.md](cok-demo-entry-located.md)). The CoAB
> `inDemo → game_area=1` literal must not be applied to CoK. CoK/DoK RNG recovery is
> documented in [cok-rng-native.md](cok-rng-native.md) and [dok-rng.md](dok-rng.md).
> DQK's ECL dispatch table is also mapped; see [decompile-dqk-ecl-dispatch.md](decompile-dqk-ecl-dispatch.md).
> These findings supersede the final paragraph's old two-negative tally.

> Loop iteration 18 (final second-tier; upgrades the TODO seg001 / seg043 / seg049 rows to
> DONE). Subsystem: **the boot + input plumbing** — program init/main-loop (seg001), the
> high-level input-read wrapper (seg043 `GetInputKey`), and the INT 16h keyboard primitives
> (seg049 `READKEY`/`KEYPRESSED`). Primary source: COAB `seg001.cs`, `seg043.cs`, `seg049.cs`
> (study-only). Cross-checked against `packages/engine` boot/UI + the `?mainmenu`/`?demo` paths
> (memory `goldbox-cok-boot-sequence`). Mostly already realised in the engine; this pins the
> exact boot order and the two-step extended-key read.

## 1. Boot order — `PROGRAM` / `InitFirst` / main loop (seg001)

`PROGRAM` is the entry point; the init sequence is:

```
PROGRAM:
  alloc CombatMap[MaxCombatantCount+1]          // 1-based combat slot array
  ovr003.SetupCommandTable()                    // build the ECL opcode dispatch table
  InitFirst()                                   // see below
  ItemLibrary.Read()                            // load the item DB
  seg044.PlaySound(sound_0)                      // boot chime / silence reset
  [if !skip_copy_protection] ovr004.copy_protection()
  loop forever:
      game_area = inDemo ? 1 : 2;  game_speed_var = inDemo ? 9 : (unchanged)
      [if !inDemo] ovr018.startGameMenu()         // the main menu
      ovr003.sub_29758();  InitAgain();
      [if inDemo] ovr002.title_screen(); displayInput("Play Demo", …10s timeout 'D'); …

InitFirst (sub_39054):
  seg051.Randomize()                            // seed the RNG  (deferred unit)
  alloc area_ptr/area2_ptr/stru_1B2CA/ecl_ptr/geo_ptr(0x402)/dax_8x8d1_201[177,8]
  ovr016.BuildEffectNameMap()
  for cmd_opps[0..cmdOppsLimit): .getMemoryValue = ovr008.vm_GetMemoryValue   // wire ECL operand reader
  cursor / cursor_bkup = DaxBlock(1×8); FillChar(0x0F, cursor)                // white 8px cursor
  symbol_8x8_set = DaxBlock[5]
```

**Pins:** (a) the **boot order** — command table → item lib → sound-0 → copy-protection → main
menu — is the shape the engine's boot path should follow; (b) `cmd_opps[].getMemoryValue =
ovr008.vm_GetMemoryValue` is the seam tying the ECL operand decoder (the typed string/var memory
map from `decompile-ovr008-ecl-strings.md`) into every command operation; (c) demo mode forces
`game_area=1, game_speed_var=9` and runs a 10-second-timeout `displayInput` that falls through to
the title loop. The COAB strings ("Curse of the Azure Bonds v1.3", "Play Demo") are CoAB-specific;
Krynn's START.EXE boot strings are byte-verified separately (memory `goldbox-cok-boot-sequence`:
`?mainmenu`, `?demo`). **Copy protection** (`ovr004.copy_protection`) is the Krynn journal-word
check the engine already **bypasses** (memory `goldbox-protection-bypass`) — here it sits exactly
where the bypass must no-op it: after item load, before the menu, and again after declining demo.

## 2. Keyboard primitives — INT 16h, two-step extended key (seg049) — PIN

`READKEY`/`KEYPRESSED` model the PC BIOS keyboard:

- `KEYPRESSED()` = **INT 16h AH=01h** (peek, non-destructive) — true if a key is buffered.
- `READKEY()` = **INT 16h AH=00h** (blocking get). The 16-bit BIOS result is `(scan<<8)|ascii`.
  The clever bit — the **two-step extended-key read**:
  ```
  if skipReadFlag != 0:  return skipReadFlag (the stashed scan code), clear it
  else: r = INT16_get()
        lastCode = ascii (low byte)
        if ascii == 0:            // extended / function key (no ASCII)
            skipReadFlag = scan   // stash scan; NEXT READKEY returns it
            if scan == 0: lastCode = 3   // Ctrl-Break → 3
  ```
  So function/arrow keys (ASCII 0) are delivered as **two successive `READKEY` calls**: first the
  0 then the scan code — the classic Gold Box keyboard idiom. `SysDelay(ms)` = a millisecond
  sleep/busy-wait (used by the teletype text crawl, seg041 `displayStringSlow`).

**Engine pin:** input handling must reproduce the **ascii-then-scancode two-step** for extended
keys and the **`scan==0 ⇒ key 3` (Ctrl-Break)** mapping if it wants the original menu/hotkey feel
(e.g. arrows vs letters routed identically to the original).

## 3. High-level input wrapper — `GetInputKey` (seg043)

The game's "read one command key" entry on top of seg049:

```
GetInputKey:
  key = inDemo ? (KEYPRESSED() ? READKEY() : 0)   // demo never blocks
              : READKEY()                          // normal: block for a key
  if key == 0x13 (Ctrl-S / XOFF): PlaySound(sound_0)   // sound toggle
  if Cheats.allow_keyboard_exit && key == 3: print_and_exit()   // Ctrl-Break quit
  if key != 0: drain remaining buffered keys (while KEYPRESSED) READKEY)   // debounce
  return key
```

So a real keypress **flushes the type-ahead buffer** (anti-double-step) and demo mode is
non-blocking (any key aborts demo). The rest of `seg043` (`DumpPlayerAffects`,
`DumpTreasureItems`, `DumpMonstersFiltered`, `Html/TxtDumpPlayer`) is **COAB's .NET debug
tooling** — HTML/text data-dump diagnostics, **not an engine subsystem** (study-only; no Krynn
analogue to port). Only `GetInputKey` / `clear_keyboard` / `clear_one_keypress` are real engine
input plumbing.

## 4. Krynn-binary anchor & Gen1↔Gen2

seg049 maps to the resident INT 16h keyboard ISR in START.EXE/DQK.EXE (BIOS calls, no string
anchors). seg001's boot is anchored by the byte-verified Krynn menu strings (memory
`goldbox-cok-boot-sequence`) and the copy-protection call site (`goldbox-protection-bypass`).
`GetInputKey`'s `0x13`/`3` constants and the buffer-drain are COAB-authoritative.

**Gen1↔Gen2:** boot shape and keyboard idiom are generation-invariant — DQK (Gen2) boots through
the same init→menu→copy-protection→play loop (its protection is the already-bypassed
`0x212E3` dispatch stub, memory `goldbox-content-port`) and uses the same INT 16h two-step key
read. The engine already implements the boot/menu/demo flow (`?mainmenu`, `?demo`); this spec
pins the **exact ordering** and the **two-step extended-key semantics** as the remaining fidelity
details. No new subsystem gap.

---

**This completed the original targeted static loop.** It did not establish complete
title-local boot/input parity. CoK/DoK RNG and DQK dispatch recovery subsequently closed
the two negatives recorded here; current follow-up is tracked in
[decompile-worklist.md](decompile-worklist.md).
