# CoK Task 191 — selector coordinate-input producer

**Status: CLOSED BOUNDED, source audit only — 2026-09-28.** This follow-up supports
Task 125's held function-menu route gate. No key or mouse input was sent, and
no DOSBox session was launched.

## Located selector path

The outer caller at `GAME.OVR:0x2056D` invokes descriptor `FD:0x34`; after it
returns, `0x20578` reads the selected list node's command byte. Task 190
disassembled the selector's coordinate path:

- At `0x3B4D3`, a nonzero `DS:0x8858` jumps to `0x3B5BC`.
- `0x3B5BC..0x3B6B8` checks mouse-mode flags `DS:0x71A5/0x71A6`, mode byte
  `DS:0x4B49`, and selector coordinate locals `[BP-0x62]/[BP-0x64]`.
- The hit path around `0x3B6C2..0x3B752` tests coordinates and maps them
  through descriptor `0x743:0x167` or the selector's table. It sets the
  selector's returned flag and proceeds to the common result path.
- `0x3BA58..0x3BAB7` copies the selected value to AL and returns it. The outer
  caller then reads the linked node's command byte and dispatches it.

These bytes establish the shared result/dispatch edge but not the producer of
the input flag or the exact event timing (hover versus button activation).

## Flag writer boundary

An immediate-reference sweep with `python tools/disasm_cok.py xrefoff 0x8858`
found one apparent non-wrapper store in the selector area: `0x25CE` writes
AL to `DS:0x8858`. The enclosing routine starts at `0x2288`; its first
instructions save the entry byte to `[BP-4]` at `0x2293`, clear
`DS:0x8858` at `0x2299`, then restore that saved value at `0x25CE`. This is
preservation, not a new input producer.

Two other direct stores near the selector are also restores. The wrapper at
`0x3A22` saves `DS:0x8858`, clears it while it calls other routines, and
restores it at `0x3A81`; the wrapper at `0x3DDF` does the same at `0x3DE5`,
`0x3DED`, and `0x3E7B`.

START setup also clears the byte at images `0x106FE` and `0x10B28`. The routine
at `0x2288` calls `0x96:0x25` at `0x25C6`, but restores the saved entry byte
at `0x25CE` immediately afterward; a write by that callee would not persist
through the restore. The direct-reference sweep therefore identifies
initialization and preservation sites, not the event that supplies a nonzero
value. An indirect alias or external input producer is not excluded.

The true upstream producer and hover/button timing remain unresolved beyond
this source boundary. An accepted coordinate hit returns AL through the
caller that immediately dispatches the selected command, so it is not a safe
way to capture row 8. Task 191 closes bounded at the unresolved input
producer; Task 125 remains gated. No route action was taken.
