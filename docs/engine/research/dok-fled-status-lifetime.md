# DoK / DQK fled-status lifetime — static trace (2026-09-25)

## Scope and verdict

This is a source-only trace of the native flee handoff and the next-encounter
import. It identifies where the compact fled bit persists and how DoK and DQK
party reconstruction differ. It does **not** establish the retail regroup point,
so no behavior change is authorized by this note yet. No DOSBox, GUI, or runtime
was launched.

## Native active-session path

1. In `native/src/cccombat.asm`, a successful party-wide escape calls
   `mark_party_fled`; the map-edge escape path also sets `CF_FLED` on the
   escaping combatant. `fill_result_rec` serializes that bit as GBCR condition
   `3` (fled), independently of HP.
2. `native/src/gbboot.asm` dispatches the combat child, calls
   `apply_combat_result_roster`, then resumes the yielded CCECL continuation.
   There is no party rebuild between result application and exploration resume.
3. `native/src/cchost.asm` maps GBCR condition `3` to GBD1 condition bit `8`
   and writes it into the current GBPR row. The original DoK `.GAM` body is not
   given a fled enum by this patcher.
4. On the next combat yield, `load_gbpr_party` reads the current GBPR. The
   DoK/DQK path imports the GBD1 condition into `C_FLAGS`; `is_active_si`
   rejects `CF_FLED`, so that member is absent from active-party counts and
   turn processing.

This proves persistence across consecutive encounters in the same GBBOOT
session. Existing focused tests prove the import/exclusion contract with
pre-seeded GBPR rows; they do not prove a flee, exploration return, and second
encounter in one route.

## Cold party reconstruction differs by title

- **DoK:** `derive_dok_meta` reaches `write_dok_meta`, which initializes the
  GBD1 flags word to the derived-stats bit (`1`) and does not copy the previous
  GBD1 condition. A cold CCPARTY rebuild from `.GAM` therefore drops the old
  fled bit. This is distinct from the uninterrupted GBBOOT session above.
- **DQK:** `build_dqk_qsv_member` calls `overlay_dqk_previous_meta`. For a
  matching source slot with prior GBD1 combat metadata, that helper copies the
  previous metadata flags and condition into the new row. A cold rebuild can
  therefore preserve `CF_FLED` as well.

These statements are native source facts; they do not establish when the retail
games make an escaped survivor eligible again. In particular, the rebuild-time
difference does not prove that either title regroups at exploration return.

## Retail DoK morale flag is a different field

DoK `GAME.OVR:0xB4D2` is the morale check. Its failure path at `0xB591` obtains
the context pointer from combatant `+0xBD` and writes `1` to context `+0x14`.
This is not the native GBD1 `CF_FLED` bit and is not evidence that a whole-party
escape is saved in the retail `.GAM` record. Do not use the morale-failure field
as the regroup/reset boundary.

## Additional retail lead: combatant status value 8

A flat overlay disassembly scan found `GAME.OVR:0x20060` writing `8` to
`es:[di+0xC7]`; the nearby routine at `0x1F0FC` compares that field with `8`.
The write is in the routine beginning at `0x1FEAA`, after calls using the
combatant pointer in `[bp-0xA]`, and it clears that record's `+0xC8` byte.
This is evidence for a retail combatant status-8 state, separate from the
morale context byte at `+0x14`.

The scan did not establish that status 8 represents a player-controlled
whole-party escape, identify the routine's actor side, or show how the record
is reconstructed after combat. Do not equate this value with native `CF_FLED`
yet.

## Task 75 static continuation — bounded call and consumer findings

The DoK overlay descriptor table places `GAME.OVR:0x1FEAA` in descriptor 18,
whose code begins at file offset `0x1ED0F`; the routine-relative entry is
`0x119B` and begins with `PUSH BP; MOV BP,SP`. START stub bytes at `0x9F2`
contain `CD 3F 9B 11`; `python tools/disasm_dok.py thunk 0x9f2` maps that
procedure offset to `0x1FEAA` under descriptor base `0x1ED0F`. This confirms a
resident thunk candidate for the function, but not its segment-selector
callers: the current resolver cannot bind the corresponding selector, and the
bounded instruction-boundary scan found no direct near-call target
`0x119B` within the descriptor's decoded code. Do not treat a raw immediate
search or the thunk candidate alone as a complete caller graph.

The status-8 store is reached after the far call at `0x20058` (`0x102:0x7F`)
with the local far pointer `[BP-0x0A]`; at `0x20060`, the routine writes 8 to
that record's `ES:[DI+0xC7]`, then clears `+0xC8` at `0x20069`. These bytes
confirm a status mutation on the routine's selected combatant record, but do
not identify the actor's party/enemy side or the callee's semantics.

The only direct decoded status-8 comparison found in the retail overlay
instruction scan is `GAME.OVR:0x1F0FC` (`CMP ES:[DI+0xC7],8`). It belongs to
the larger routine containing `0x1EF3F`; its loop obtains the combatant pointer
from `[BP+0x0E]`, and the equality branch skips the immediate output/helper
sequence at `0x1F104..0x1F125`. This establishes a consumer-side branch on 8,
not a teardown or reconstruction. In this pass, no direct incoming near call
to `0x1FEAA`, no status-8 party-record writeback, and no edge changing this
same field at encounter reconstruction were established. Thus this does not
rule status 8 in or out as a party-escape state.

Task 75 remains active at a narrower unresolved edge: map the START/VROOMM
selector and procedure-table route to thunk `0x9F2`/procedure `0x119B`, then
trace the selected combatant pointer through the call to `0x1FEAA` and the
record writer/reset path after combat. The attempted selector-resolution
commands report unresolved geometry, so no selector is guessed here. Static
analysis only; no emulator, DOSBox, or GUI was used.

## Remaining source trace before a fix

Trace a retail DoK or DQK successful party escape through combat teardown,
exploration return, and entry into another encounter. The missing evidence is
the exact retail state reconstruction or reset that makes escaped survivors
eligible again while preserving dead and unconscious conditions. Then put the
same two-encounter route into a focused native fixture, with a null/control that
keeps dead and unconscious members inactive. Runtime observation remains
deferred under the desktop-focus constraint.
