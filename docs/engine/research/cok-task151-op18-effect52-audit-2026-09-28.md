# CoK Task 151 — AEC9 operation `0x18` / effect `0x52` mutation audit

## Scope

Trace the unconditional per-member `DB:0x34` operation-`0x18` traversal in
AEC9 (`GAME.OVR:0xAF09..0xAF31`) into its effect-`0x52` helper. Determine
whether this path can change AEC9's pointer-to-pointer local, member links,
active/kind bytes `+0x189/+0x18A`, or combat-context pointer `+0x183`, and
whether those mutations affect the later recount and writer loop. Preserve
Task 118's six-member held-save capture only as the earlier runtime identity;
do not splice that snapshot into a direct combat call and label it natural.

## Source-backed entry chain

AEC9 passes operation byte `0x18` and the address of its local far pointer
`SS:[BP-5]` to `DB:0x34` at `0xAF19`. The local contains the current member
pointer; after the helper returns, AEC9 dereferences that same local at
`0xAF1E` and follows member `+0x17F/+0x181`. Therefore writes through the
argument can change which node AEC9 visits next.

Validated resolver geometry maps `DB:0x34` to descriptor-23 procedure
`0x057C` at `GAME.OVR:0x34527`. Its operation-`0x18` arm at `0x34C2A..0x34C37`
passes the member-pointer-cell argument to helper `0x342FD` with effect ID
`0x52`. The mode helper's first query is `0xE6:0xA2` at `0x3432C`, using the
current member pointer and effect ID; a nonzero result sets local
`[BP-0xE1]` and jumps to the guarded callback path at `0x34479`.

## Callback target and direct writes

`0x342FD` calls wrapper `0x34153` at `0x34495` with mode 0, effect ID 52 as
the callback index, and the pointer-cell handle from `[BP+8]`. The table
initializer stores `0x65:0x183` at `DS:0x6CDC` (`GAME.OVR:0x148D1..0x148D4`),
the `4 * 0x52` slot. Resolver geometry maps that entry to descriptor-12 stub
71, procedure `0x303C`, body `GAME.OVR:0x13C24`, provided the wrapper's
`DS:0x713C` gate is zero; a nonzero gate calls the alternate `DS:0x6D74`
callback instead. No production gate value is known.

The first `E6:0xA2` query resolves to `GAME.OVR:0x389ED`. It obtains the
member's effect-list head from body `+0xE3/+0xE5`, writes the matching effect
record pointer to the query's local output cell, and returns its match flag;
this query does not itself write the AEC9 pointer cell.

Callback `0x13C24` walks the party list from `DS:0x609A`, compares each
candidate's `+0x18A` with the member referenced by the passed pointer cell,
and queries effects `0x5C`, `0x6F`, and `0x77`. On the direct `0x6F`-match
branch it writes candidate body `+0x18B=1`, conditionally changes `+0xE7` to
`0xB3`, and through candidate context pointer `+0x183` clears context words
`+0x0A/+0x0C` and sets byte `+0x10=1` (`0x13D09..0x13D40`). Its visible loop
advances by reading candidate links `+0x17F/+0x181`; the disassembled body
does not directly store the passed pointer cell, links, `+0x189`, or `+0x18A`.

## Transitive helper boundary

On its effect-`0x6F` path, the callback calls `DB:0x7F` /
`GAME.OVR:0x360A2` with operation 9. That route enters `DB:0x34` mode 9 and
`GAME.OVR:0x35230`, which allocates an effect record and links it into the
target member's `+0xE3/+0xE5` effect list (or appends to that list). The
effect-record link words are at record `+5/+7`. This helper's visible stores
do not target the AEC9 pointer cell, member links `+0x17F/+0x181`, active/kind
bytes `+0x189/+0x18A`, or context pointer `+0x183`.

`0x360A2` queries the effect ID passed by its caller; on callback `0x13C24`'s
shown DB:7F paths these IDs are `0x6F` and `0x77`. If the queried effect is
found and its duration is positive, `0x360A2` calls `0x34194`. That routine
can remove/relink an effect record, and if the record's callback byte is
nonzero it calls wrapper `0x34153` in mode 1 with the effect index. The
wrapper dispatches through runtime table `DS:0x6B94+4*index` when
`DS:0x713C==0`, or through `DS:0x6D74` otherwise. At Task 151's stopping
boundary, the mode-1 `0x6F/0x77` callbacks and nonzero-gate target were not
yet classified; see Task 152 for those static mappings. Separately, callback
`0x13C24` can reach `DB:0x48` when candidate `+0xD6` is outside 0..3; that
helper updates global `DS:0x6B44/0x6B2E` and calls `DB:0x34` operation `0x0C`
on the candidate. The operation-`0x0C` effects remain unclassified.

Therefore the direct body and op-9 effect-list stores are bounded findings,
not a complete proof that the full callback leaves traversal inputs alone.
Task 152 follows the indexed mode-1 effect-`0x6F`/`0x77` callbacks and the
operation-`0x0C` branch only far enough to classify writes to the AEC9 pointer
cell, member links, active/kind bytes, and context pointer/payload. No Unicorn
replay, DOSBox, or GUI has been used for this task.
