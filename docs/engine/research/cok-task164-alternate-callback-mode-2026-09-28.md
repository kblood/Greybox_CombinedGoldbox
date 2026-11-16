# CoK Task 164 — alternate callback mode and effect lifetime

## Scope

Trace the mode passed from AEC9 operation `0x18` through wrapper `0x34153` to
the alternate target `0x14470`, then classify whether that insertion can be
removed by the retail effect-lifetime routines. Keep menu-boundary field
values distinct from combat-time values. Static source tracing only; no
DOSBox or GUI.

## AEC9 calls the alternate target in mode 0

Task 151 maps AEC9's operation-`0x18` helper to `0x342FD`. Its guarded callback
edge at `0x34495` calls `0x34153` with mode 0 and callback index/effect ID
`0x52`. Wrapper `0x34153` at `0x34156` checks `DS:0x713C`; when nonzero, it
forwards the mode and remaining arguments through `DS:0x6D74`. Task 152 maps
that target to `0x14470`. Thus, if the runtime gate is nonzero on this AEC9
edge, `0x14470` receives mode 0 and takes its insertion branch at
`0x144AC..0x144C7`.

The branch calls `DB:0x57` with member body `+0x3D` as record ID, duration word
`0x0000`, lifetime byte `0xFF`, and callback byte `+4=1`. Constructor
`0x35230` stores the ID at record `+0`, duration at `+1`, callback byte at
`+4`, and lifetime byte at `+3` (`0x352C0..0x352DD`). With the held-save/menu
value `+0x3D=0`, this source path would insert a permanent, callback-enabled
ID-zero record if that value and gate also hold at combat time. That final
condition remains unobserved.

## Known expiry routines skip this insertion

The all-party duration routine at `0x2A9CF` walks each member's effect list
(`+0xE3/+0xE5`). For each record it checks duration word `+1` at `0x2AB48`;
when the word is zero, it advances to the next record at `0x2AB4F` without
calling removal. It calls `DB:0x2F` at `0x2ABC0` only on its nonzero-duration
branch. The constructor-specified zero duration therefore bypasses this
expiry path.

The active-member lifetime routine at `0x30E1A` also walks the effect list.
At `0x30E8C`, it compares record byte `+3` to `0xFF`; that sentinel branches
to `0x30F20`, which advances to the next record. Its `DB:0x2F` call at
`0x30F17` occurs only for non-`0xFF` lifetime bytes. The constructor's `+3`
value therefore bypasses this expiry path as well.

Another dynamic-ID candidate occurs in the party walk at `0x6872`. It loops
member ordinals 1 through 10, reads a removal ID from `DS:[0x38F+ordinal]`
(`0x6A1E`), then calls `DB:0x2F` (`0x6A29`). The retained title-renderer
snapshot has bytes `00 03 0B 15 17 1B 23 28 33 34 35` at
`DS:0x038F..0x0399`; the ten entries actually indexed by this loop are all
nonzero, while the zero at ordinal 0 is skipped. The bounded 827-prologue
store census found no direct instruction writing displacement `0x38F`, but
does not cover indirect/bulk writes or all data initialization. This
checkpoint does not establish combat-time table contents.

A second dynamic-ID cleanup table is read by two roster procedures. The
routine at `0x5458` checks effects for member ordinals 1 through 6 using IDs
from `DS:[0x1C5+ordinal]` and removes them through `DB:0x2F` at `0x551C`; a
related procedure at `0x5581` reads the same table and removes through
`DB:0x2F` at `0x574D`. The title-renderer snapshot has bytes
`00 1F 22 2B 2C 32 39` at `DS:0x01C5..0x01CB`; all six visited entries are
nonzero and entry 0 is skipped. The bounded 827-prologue store census finds
reads of the two cleanup tables at `0x5489`, `0x5511`, `0x5742`, and `0x6A1E`,
with no direct stores to those displacements. The snapshot is not combat state,
and indirect or bulk initialization remains outside this census.

## Remaining removal boundary

The two aging routines do not remove the constructed zero-duration,
`0xFF`-lifetime record. The table-driven cleanup paths have no zero ID in
their visited ordinals at the captured checkpoint. This does not prove the
record can never be removed:
the alternate target's separate nonzero-mode branch at `0x1448D..0x144A5`
explicitly calls `DB:0x2F` using member `+0x3D`, and other direct removal
callers exist. A raw byte-pattern census finds 36 candidates for direct
`DB:0x2F` calls in `GAME.OVR`; both list-walking expiry candidates and both
table-driven cleanup paths above were checked here. Other candidates pass
fixed nonzero IDs in their decoded setup windows. This closes Task 164 at the
combat-time gate/table boundary, not at proven reachability or dispatch.

If an ID-zero record with callback byte `+4=1` is selected for removal,
`0x34194` calls `0x34153` in mode 1 with the selected record ID as callback
index (`0x341F2..0x3420F`). The subsequent runtime gate/slot-zero state and
any callback mutation remain unresolved. No combat-time member value, gate,
inserted record, or removal has been captured.

Task 165 traces the `DS:0x713C` producer/reset chain around AEC9's
operation-`0x18` mode-0 call, and checks whether source-backed order and inputs
allow the alternate target `0x14470` to run. It must keep the title-snapshot
table values separate from combat evidence and stop at the first unsourced
selector, member byte, or gate.
