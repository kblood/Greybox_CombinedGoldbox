# CoK Task 152 — AEC9 operation `0x18` callback edge audit

## Scope

Continue Task 151's transitive callback trace only far enough to classify
writes to AEC9's pointer cell, member links `+0x17F/+0x181`, active/kind bytes
`+0x189/+0x18A`, and context pointer/payload `+0x183`. Preserve runtime gates
and stop at unresolved dispatch or helper edges. No DOSBox or GUI.

## Resolved mode-1 effect callbacks

`0x360A2` uses its incoming effect ID, not a fixed ID. In Task 151's callback
`GAME.OVR:0x13C24`, the DB:7F calls pass IDs `0x6F` and `0x77`; if the queried
effect is present with positive duration, `0x34194` can dispatch its callback
in mode 1 when record byte `+4` is nonzero.

The callback initializer at `0x14880..0x14A86` stores mode-1 callback entries
in `DS:0x6B94+4*index`. Entry `0x6F` is `DS:0x6D50 = 0x65:0x1F6`, resolving
to `GAME.OVR:0x1427A`. With mode byte `[BP+6]` nonzero, this handler follows
the passed pointer cell to its member; if member `+0xE7 == 0xB3`, it clears
`+0xE7` and `+0x18B`, then always clears context payload byte `+0x10` through
member context pointer `+0x183`. It does not store the passed pointer cell,
member links, `+0x189`, `+0x18A`, or the context pointer itself.

Entry `0x77` is `DS:0x6D70 = 0x65:0x21E`, resolving to `GAME.OVR:0x1445E`.
That mode-1 body only decrements global byte `DS:0x6B3B`; it does not access
the member or context fields in scope.

These bodies apply only when `DS:0x713C==0`. If the gate is nonzero, wrapper
`0x34153` calls the fixed target stored at `DS:0x6D74`, initialized as
`0x65:0x228` / `GAME.OVR:0x14470`. That target clears `DS:0x713C` and routes
through DB:2F or DB:57 using the member's `+0x3D` byte and the passed pointer
cell. Those helpers change effect-list state; their full indirect behavior
is outside this pass. Do not assume the gate-zero targets from a production
capture.

## Operation-`0x0C` gate-zero callback map

`DB:0x48` calls `DB:0x34` operation `0x0C`. Its visible arm fans out through
`0x342FD` for effect IDs `5E,08,09,0A,11,14,21,24,2D,2E,31,3D,63,32,36`.
In order, their initialized callbacks resolve to `GAME.OVR` bodies:
`0x5E→0x13E90`; `0x08/0x2D→0x10F2C`; `0x09/0x2E→0x10F61`;
`0x0A→0x10F96`; `0x11→0x11214`; `0x14→0x11269`; `0x21→0x118D8`;
`0x24→0x11B27`; `0x31→0x122D7`; `0x3D→0x1265A`; `0x63→0x13F6E`;
`0x32→0x12322`; and `0x36→0x12353`.

The bodies update global counters. The `0x11` and `0x21` callbacks also write
member `+0x18D/+0x18E`, outside this audit's target fields. Callback `0x24`
reads context payload byte `+0x03` through member pointer `+0x183`, but writes
only global state. Callback `0x31` reads member `+0x18A`; its conditional
call to `0x10CFD` only increments global bytes `DS:0x6B2E/0x6B3B`. Callbacks
`0x3D` and `0x63` call `0x10C83`, which only clears global `DS:0x6B30/0x6B2F`
under its byte condition. None of these gate-zero bodies or traced helpers
writes the AEC9 pointer cell, member links, `+0x189/+0x18A`, or context
pointer/payload.

The nonzero `DS:0x713C` route through `0x14470` remains open beyond its
DB:2F/DB:57 effect-list helpers and their indexed callbacks. Task 153 follows
that alternate route and stops at the first unresolved transitive write path.

No runtime capture establishes `DS:0x713C`, whether any queried records have
positive duration, or which callbacks run on the held-party combat route.
