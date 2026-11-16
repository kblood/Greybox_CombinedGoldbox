# CoK Task 154 — effect-index producer identity

## Scope

Determine whether the direct `GAME.OVR:0x11481` store to `ES:[DI+0x3D]`
feeds the held-party member byte consumed by Task 153 at `0x1449A/0x144B9`,
or belongs to a separate allocated record. Follow only the allocation,
initialization, insertion, and aliases needed to establish that identity and
whether this producer can supply the index used by the AEC9 alternate callback.
Stop at the first unresolved indirect mapping or runtime-only alias.

## Source trace and limits

`0x1143E..0x11447` requests a `0x3F`-byte block through `A46:0x23F` and saves
the returned far pointer in `[BP-4]/[BP-2]`. The code initializes that block
through `A46:0x1661`, writes byte `0x17` at `+0x3D` (`0x11481`), then writes
`0x80` at `+0x3E`. It passes this temporary record and the owner pointer read
from the caller's pointer cell to `E6:0x75` (`0x1148E..0x1149E`).

The `E6` descriptor procedure table resolves stub `0x75` (slot 17) to
`GAME.OVR:0x37D31`. This helper allocates a second `0x3F`-byte block, passes
the temporary and new far pointers with length `0x3F` to `A46:0x163E`, clears
the new record's link words at `+0x2A/+0x2C`, and reads the owner member's
`+0x143/+0x145` head. If empty, it stores the new pointer as the head;
otherwise it follows each record's `+0x2A/+0x2C` links and appends the new
record at the tail. Thus the `+0x3D=0x17` byte is copied into a linked
`+0x143/+0x145` subrecord. It is not a store to the member body's own `+0x3D`
byte read by `0x14470`.

This closes only the identity of this producer. It does not enumerate all
possible member `+0x3D` writers, capture the combat-time member value, prove
whether an index-0 effect record has callback byte `+4` nonzero, or resolve
runtime contents of callback table slot 0. Those remain in Task 153. No
DOSBox or GUI was used.

## Acceptance

- Resolved `E6:0x75` to `0x37D31` and traced its copy and linked-list writes.
- Classified the `+0x3D=0x17` byte as part of a linked subrecord, not the
  held-member byte consumed by `0x14470`.
- Keep the member's combat-time `+0x3D` producer/value and callback dispatch
  edge open under Task 153.
