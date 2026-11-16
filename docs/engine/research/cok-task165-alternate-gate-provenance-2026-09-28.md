# CoK Task 165 — alternate callback gate provenance

## Scope

Trace direct producers and resets of `DS:0x713C` around AEC9's
operation-`0x18` call to `0x342FD -> 0x34153`. Determine whether the known
nonzero producers can leave the gate set when AEC9 reaches that wrapper.
Static and retained headless evidence only; no DOSBox or GUI.

## Bounded direct-reference inventory

`python tools/disasm_cok.py xrefoff 0x713c` finds six immediate-reference
candidates in `GAME.OVR`:

- `0x106D6` and `0x10B0E` clear the byte to zero.
- `0x14476` clears it at entry to alternate target `0x14470`.
- `0x28B2B` and `0x31282` set it to one.
- `0x34156` reads it in wrapper `0x34153` to choose indexed dispatch or the
  fixed alternate target at `DS:0x6D74`.

The operation-`0x18` helper `0x342FD` calls `0x34153` at `0x34495` with mode
0 and callback index `0x52`. It does not itself write `DS:0x713C`. Task 164
shows that a set gate would redirect this mode-0 call to `0x14470`, whose
mode-0 path inserts a member effect record.

## Known set-and-dispatch pairs

The setter at `0x28B2B` follows checks of member byte `+0x3E`; its same
routine calls `DB:0x2A` at `0x28B4D`. The setter at `0x31282` follows checks
of member bytes `+0x36` and `+0x3E`; its same routine calls `DB:0x2A` at
`0x3129D`. Overlay resolution maps `DB:0x2A` to descriptor-23 procedure
`0x01A8`, `GAME.OVR:0x34153`. Both routines therefore consume their newly
set flag at the immediately following wrapper call. If the fixed target
`DS:0x6D74` reaches `0x14470`, that target clears the flag before returning.

This identifies two local set-and-dispatch pairs, not their order relative
to AEC9. The `0x10B0E` reset is statically ordered before the ECL switch on
Task 125's conditional Begin Adventuring route, but that branch was not
observed. Startup reset `0x106D6` has not been traced through a joined held-
party/combat run. The direct-reference inventory also does not exclude
indirect stores, copies, or a different runtime DS alias.

## Conditional held-party reset route

The held-party Begin Adventuring route in Task 125 supplies a static ordering
edge. Its selected-command branch returns to START, and the caller chain
includes `lcall 0x61:0x2A` before the ECL switch at `0x4594`. Validated VROOMM
geometry maps `0x61:0x2A` to descriptor-11 procedure `0x0843`,
`GAME.OVR:0x108DB`; this entry's initializer clears the same `DS:0x713C` at
`0x10B0E`. Thus the flag is reset before the ECL switch if that branch is
taken.

The branch is not observed in the retained held-party capture. Task 125's
START caller requires `DS:0x4B49==3`, while the Task 126 menu-boundary capture
has the first byte at `DS:0x4B49` equal to zero. Task 125 also remains gated:
the selected Begin Adventuring row has no safe source-backed transition from
the captured selector state. Therefore this is a source-mapped conditional
reset, not a combat-time gate value. No observed trace currently spans the
reset, ECL entry, and AEC9.

## Bounded result and next action

The exact source-backed predecessor chain to AEC9 is still unavailable at
the held-party selector/ECL boundary shared by Tasks 125, 148, and 150. No
captured AEC9 state supplies DS identity, `DS:0x713C`, or the selector-chosen
route. Task 165 closes bounded at this gate/route boundary: known
initialization and set-and-dispatch paths are mapped, but they do not capture
the combat-time value. The held-party `DS:0x4B49` value is zero at the retained
menu boundary, and the Begin Adventuring row remains gated under Task 125.
Task 150 resumes the held-party join through FDF2/AEC9, with Task 148 owning
the original ECL helper/output/cursor/dispatcher join. Do not infer a zero
combat gate from a reset in a different runtime segment.
