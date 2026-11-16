# CoK Task 153 — nonzero callback-gate audit

## Scope

Trace wrapper `0x34153` when `DS:0x713C!=0`, classifying direct writes to
AEC9's pointer cell, member links `+0x17F/+0x181`, active/kind bytes
`+0x189/+0x18A`, and context pointer/payload `+0x183`. Static audit only; no
runtime gate values are inferred.

## Alternate target and branches

The wrapper's nonzero-gate indirect call through `DS:0x6D74` resolves from the
initializer to `0x65:0x228`, `GAME.OVR:0x14470`. Its entry clears
`DS:0x713C`, copies the callback target pointer, then branches on mode byte
`[BP+6]`.

For mode 0, it calls `DB:0x57` / `GAME.OVR:0x35230`. That helper allocates an
effect record and inserts it into the target member's `+0xE3/+0xE5` effect
list, linking records with `+5/+7`. Its visible stores do not write the AEC9
pointer cell, member links, active/kind bytes, or context pointer/payload.

For nonzero mode, it reads the target member's `+0x3D` byte and calls
`DB:0x2F` / `GAME.OVR:0x34194` with the passed pointer-cell handle. That
helper can relink/remove effect records through the member's effect-list
head. If the selected record has a nonzero callback byte at `+4`, it calls
`0x34153` again in mode 1 using the `+0x3D` effect index. The wrapper gate has
already been cleared, so this second dispatch uses the indexed table at
`DS:0x6B94+4*index`.

Task 118's earlier post-load menu capture contains full record bytes for the
same six held members; each has `+0x3D=0x00` at that menu boundary. This is
not a capture of the later combat invocation and does not establish whether
the field changes before this callback. The combat-time `+0x3D` value and
selected effect record therefore remain uncaptured. The initializer at
`0x144D2` writes the indexed callback table beginning at slot 1
(`DS:0x6B98`); it does not write slot 0 (`DS:0x6B94`). The only direct
`0x6B94` xref is the indexed dispatch at `0x3418E`, so this static slice does
not establish slot 0's runtime contents or whether a zero-index record can
carry callback byte `+4` nonzero. If it does, that is the first unresolved
mode-1 edge; it may write fields in scope, so the effect-list-only
observation above does not close the nonzero-mode branch. No DOSBox or GUI
was used. Task 154 resolves the nearby `0x11481` store of `0x17` to a linked
`+0x143/+0x145` subrecord through `E6:0x75` / `0x37D31`; that subrecord byte is
not a producer for the member body's `+0x3D` consumed here.

## Bounded result — effect-list helpers stop before the indexed callback

The alternate wrapper clears `DS:0x713C` before entering `0x14470`. Its mode-0
arm calls `DB:0x57` / `0x35230`, which inserts an effect record through member
`+0xE3/+0xE5` and record links `+5/+7`. The caller passes the member's `+0x3D`
as the record ID and passes `1` for `[BP+6]`, which `0x35230` stores at record
`+4`; this route can therefore create a callback-enabled record. Its
nonzero-mode arm calls `DB:0x2F` / `0x34194`, which removes the matching
record, relinks the same effect-list head/next fields, and frees the record.
These helpers do not write AEC9's
pointer cell, member links `+0x17F/+0x181`, `+0x189/+0x18A`, or context pointer
`+0x183` and its payload. The special follow-up at `0x356EE` updates other
member statistics (including conditional `+0x197` writes); it does not touch
those fields in this audit.

Before unlinking a matching record, `0x34194` checks record byte `+4`. The
mode-0 insertion above sets this byte to 1; if the corresponding record is
later selected for removal, `0x34194` dispatches mode 1 through `0x34153`
using the member's `+0x3D` byte as callback index. The callback table
initializer at `0x144D2` begins at slot 1 (`DS:0x6B98`); the direct-reference
scan finds `DS:0x6B94` only at the indexed call instruction `0x3418E`. The
existing 40M composed-startup snapshot samples bytes `0000:0000` at slot 0 and
a relocated callback pointer at slot 1 after initialization, but the capture
is in the title renderer, not the AEC9 combat route. The combat-time `+0x3D`,
selected record's `+4`, and slot-0 contents at AEC9 remain unknown, so this is
the first unresolved transitive edge. No effects from that indirect target
are attributed. Task 153 closes
bounded at that gate/index boundary; Task 163 traces the member-byte and
record-byte producers and the slot-0 initialization/dispatch contract. Static
only; no DOSBox or GUI.

## Task 163 opening census — callback record can be enabled

The `0x35230` record constructor stores `[BP+6]` into effect-record byte `+4`
at `0x352D3`. The `0x14470` mode-0 caller pushes `1` for that argument and
passes the member's `+0x3D` as the record ID. Therefore, if the alternate
wrapper takes this mode-0 route, it inserts a record whose ID is the member
index and whose callback gate is enabled. A later matching removal can reach
the indexed callback even though Task 118's six earlier menu-boundary member
records each showed `+0x3D=0`.

A bounded direct-store census seeded at all 827 `55 89 E5` prologues in
`GAME.OVR`, decoding each window to a return or at most `0x300` bytes, found
one instruction writing displacement `+0x3D`: `0x11481`, which Task 154
already mapped to a temporary subrecord copied under member `+0x143/+0x145`.
This does not prove the member body's `+0x3D` has no indirect or non-prologued
writer. The callback table's only direct `0x6B94` reference remains its
indexed read at `0x3418E`; initialization starts at slot 1. The 40M composed
startup memory snapshot has zero at `DS:0x6B94` and a valid relocated pointer
at `DS:0x6B98`, confirming the table was initialized by that title-renderer
checkpoint. It does not capture the AEC9 route or prove the later slot-0
value. The next pass must
trace member construction/copy paths and the runtime data-segment initialization
before deciding whether index 0 is reachable or what target it contains.
Static only; no DOSBox or GUI. The documentation claims/prose gate passes 37
tests in 76.47s after the startup-memory evidence was added.
