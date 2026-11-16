# Secret WHO: original caller and native actor transport

Task 244 is verified on 2026-10-11. These findings concern original DOS
mechanics applied to compatible held Amiga GLIB scripts; they do not establish
original Amiga executable equivalence or arbitrary saved-party restoration.

The original dispatcher at GAME.OVR:458B maps opcode39h to descriptor3 file
3DEC..3E51. The caller executes the original one-operand prefetch, copies the
prompt at DS:90AC, and invokes descriptor26/file3B7F3 with the current actor
pointer at DS:7D38. `tools/secret_who_oracle.py` executes the complete caller,
selector, input parser and rendering procedures. Overlay relocation, BIOS16
keyboard delivery and deterministic DOS21/AH2C clock are declared device
boundaries. Parser, navigation and renderer computations are not substituted.
UI-safe relocation avoids VGA A0000..BFFFF, while legacy oracle relocation
remains unchanged by default. Actor bodies are loaded by the original player
loader and linked in the explicitly declared order.

Enter retains the current actor, including a null pointer. Down and digit2
advance; Up and digit8 retreat. Both directions wrap. From null, Down selects
the first member and Up selects the last. Escape continues waiting; it does
not cancel or select. A declared dead or condition-marked actor remains
navigable. This proves traversal of the supplied list, not the original
saved-party construction or every possible eligibility rule. Actor bytes and
unrelated comparison state remain unchanged in the controlled executions.

All 15 held WHO sites across areas49,50,51,64,65,66,96,97,98 are independently
read from the exact held archive SHA256
`8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12`
and execute the complete original DOS caller. The native compiled tests also
execute all 15 packed operands, preserving null/first/sixth actor, exact prompt
and roster labels, PC advance, comparison flags and sparse memory. The census
is conservative over 22 members from five entry roots, not computed-jump coverage.

## Owned names and durable identity

`CCPARTY /W owned.GBP reply.GWN` is a read-only capability query. Its strict
GBPR3/title4 reader admits complete actor/catalogue/STF/SFX ownership, rejects
pending transaction files, and never performs recovery or import. It publishes
a create-new GBWN3 record after checked write and close: a 16-byte `<4s6H>`
header followed by count 16-byte Pascal ASCII name rows and the closed GBSF
field suffix described below. Names contain1..15
printable characters with zero padding. Count is1..6 and physical P1 row order
is preserved, including duplicate display names and nonconsecutive source slots.
The capability grants names/count and seven read-only normal actor fields,
without combat or actor-write authority.

Each GBWN row is **Pascal**, not a plain 16-byte display string:
`row = body[:1 + body[0]] + zeroes(15 - body[0])`. GBMT is a separate
length-prefixed segment bank; its name segment copies the row's printable
characters. Consumers must compare the GBWN length byte as well as every
character and zero-padding byte against P1.

| GBWN header offset | Field |
| --- | --- |
| 0 | Four-byte magic GBWN |
| 4 | Version 3 |
| 6 | Exact total extent32 + count ×30 (212 bytes for six actors) |
| 8 | Physical admitted P1 count1..6 |
| 10 | Title 4 |
| 12 | Exact source GBPR3 physical extent |
| 14 | Reserved 0 |

## Bounded selected-actor fields

Task246 extends implementation `45f72151`'s six-field packet with a versioned
GBSF2 suffix immediately after the names. Its16-byte `<4s6H>` header contains
magic GBSF, version2, extent16 + count×14, the same physical actor count,
seven fields, flags0 and reserved0. Each actor contributes seven words:

| Selector | Normal actor byte | Word interpretation |
| --- | --- | --- |
| 7C15 | 19 | unsigned byte |
| 7C18 | 25 | unsigned byte |
| 7C19 | 27 | unsigned byte |
| 7C72 | 107 | signed byte, sign-extended |
| 7C73 | 108 | signed byte, sign-extended |
| 7C76 | 112 | unsigned normal maximum HP; distinct from current HP437 |
| 7CA7 | 245 | unsigned byte; held trap COMPARE uses this selector |

The worker recalculates normal actors from the current owned P1 body/catalogue/
STF inputs and preserves their physical row order. GBBOOT and CCNEXT require
exact names, extents, matching counts and canonical word widths before accepting
the refreshed reply. CCECL grants field access only after the checked file close.
Legacy GBWN1 still grants names. CCECL also accepts closed GBWN2/GBSF1 packets
for their original six fields, using their admitted12-byte row stride. They
cannot authorize7CA7. GBBOOT and CCNEXT require the current3/2/seven-column
schema from each refreshed worker query. An unavailable selected-actor field halts the
whole instruction before arithmetic/store effects instead of supplying a sparse
default. Known getters take precedence over sparse variables and GETTABLE.

Original executable tests execute the getter and complete SUBTRACT/GETTABLE/COMPARE
callers after original WHO. A valid current actor supplies its admitted row.
A null actor reads the original getter offset in live DOS low memory, using
the original signedness; it never aliases actor1. Oracle null runs require an
explicit low-memory image rather than silently treating that device state as zero.
Task245's six-field focused compiled/original/transport set passed447 tests. A separate hidden
GameLink run verified actual GBWN2 output, two selected actors, live-memory null
behavior and names-only field rejection. Final clean, unchanged-source sweeps
pass44/44 flows and46/46 components at implementation `45f72151`; the full
corpus passes9,899 /1 skip, exit0. This is bounded field recovery, not arbitrary
actor-field or saved-party support.

Secret GBEF v16 extends the 5932-byte v15 prefix with GBSI v1, a 16-byte `<4s6H>`
identity record, making the closed extent5948. Flags0 means unknown/null,
1 means a valid current actor and2 means not-found/null. A valid selected actor
is one-based1..count; a null selected value is0. GBSI and GBMS must agree.
Owned continuation count matches admitted P1; standalone unowned diagnostics
may retain count0 and cannot run WHO without the typed names capability.
All Secret terminal, combat, menu and private capacity effects carry identity.
Genuine older non-WHO authorities remain readable; absent old identity stays
unknown. No old halted WHO effect is promoted to a supported menu.

WHO yields GBMN with destinationFFFF, opcode39, count equal to admitted P1,
one event operand containing prompt metadata, and GBMT containing the packed
prompt followed by exact plain ASCII names. Frontends must commit both GBMS
and GBSI identity fields before publishing the bound GBMO2 answer token. The
only permitted edit is the8 identity bytes; unrelated VM, prompt and comparison
bytes remain unchanged. Manual frontends show the current one-based row and name (or null) on entry
and after movement, so duplicate display names remain visibly distinct.
Token choice is the final zero-based actor ordinal;
FFFF represents unchanged null selection. It is accepted only for Secret WHO
when committed identity is null. Explicit `/W` or frontend `/S` is a diagnostic
absolute ordinal. Absent `/W` preserves the live actor and never invents row0.

CCNEXT refreshes names from current settled P1 before each producer transition,
including explicit diagnostic overrides. Private aliases O.EFX/A.OUT/W.GWN
keep the complete frozen-context producer tail within its114-byte replay
limit; legacy and new aliases remain protected. READY repeat does not launch
a new producer. This is a checked owned child/ordinal binding, not a
cryptographic names identity or filesystem race guarantee.

## INITIAL and source-directory transport

The first pending menu can occur before a physical battle. Explicit INITIAL
resume kind3 stores immutable pre-input state under a distinct GBIR1 request,
with origin1 for a menu or2 for an empty encounter. It binds original paused
GBEF, admitted P1, exact GBID/source, seed, frozen context and any actual GBSL.
No combat request or HP result is fabricated. A closed answer must prove its
sanctioned state edit and token binding before durable answered publication and
token consumption. Existing combat/menu/empty kinds0/1/2 retain their meaning.

Fresh Secret execution uses the verified source directory and basename ECL.GLB
while retaining the canonical original source for binding. Scratch and replay
paths are host-qualified; complete maximum context fits111 bytes. Source drive
and working directory restore after child execution. Root shortening applies
only to the verified tool drive: the coupled READY→real CCBIND regression
covers actual D:\DISK2 recovery from a C: host root.

Original INPUT at3DE88 drains pending BIOS keys after accepting each input.
A declared queued Enter/Down pair after the first Down is discarded by the
complete original helper; two future Down inputs followed by Enter select the
third actor. Both native frontends reproduce that drain. CCFP also marks empty
WHO narration as no page and drains buffered manual page acknowledgements
before entering WHO. A separate visible-page trace records two ACK reads and
a fresh WHO read returning Enter after an empty queue; it does not prove stale
AX reuse or justify removing deliberate null confirmation.

## Task 244 verification (before GBWN2)

Implementation `6f37cc08`, path repair `5160f641` and profile repair `5010ffb4`
are verified. Original WHO, all15 packed operands, owned names, streaming,
flags and native frontend controls pass. All2037 admitted members from138 held
DAX archives match the old decoder, retaining the14500-byte packed acceptance
bound. All17 tools build; CCECL24,393 emitted/64,750 resident/530 free and
GBBOOT64,315/64,571/709 free retain their64/128-byte floors.

Actual ordered names query, malformed preservation, null/wrap/Escape/duplicate
menus and genuine CCFLOW-backed CCFP capacity/empty-narration controls pass.
The standing Secret harness retains its original normalized legacy VM golden
and checks the complete v16 suffix, numeric widths, cold/repeat and frozen
context. Original-source controlled no-ID comparison preserves active VM/traces;
whole unused legacy padding is not claimed byte-identical.

True INITIAL cold recovery visibly restores null and first-current prompts
without inventing an answer. An authentic token advances the saved state;
changing only its bound PC rejects, creates no response and preserves13 checked
files. The held-WHO→real owned combat→WHO→terminal route retains hero6 at HP0.
Its independent fresh reference and cold branch match13 artifacts exactly,
including strength74→62, party, seed, trace and authority; repeat does not replay.

Maximum-context numeric and70-PRINT terminal cases pass with all17 executed
binary hashes verified and all15 source-drive files unchanged. Strict read-only
CCNEXT `/D effect roster source` validates complete P1/HP, closed v16 identity,
same-stem GBID and independently opened source bytes, complete optional GBSL
and retained-row binding. NPC headers and27/28/2E/36/41 reject across every row,
including rows before the final64. It grants no durable authority, publishes
or consumes no files, and leaves generic CCHOST unchanged. Targeted IO faults,
valid WHO/v2 text, malformed preservation and captured actual stream controls pass.

Final gates exposed and corrected AX clobber in the path-length predicate and
explicit `/ID4` WHO on incompatible HLIB. The latter now rejects resume before
opening the token and retains fresh unsupported status4 diagnostic behavior.
Genuine Secret GLIB v16 WHO and older non-WHO records remain supported. The
original menu-resume script passes its complete fresh/cold and identity matrix.
Stale-binary and missing-owner fixture attempts are preserved separately.

Final clean serial44/44 flows and46/46 components pass at5010ffb4 with unchanged
canonical source SHA256
`a617748872f6d9d0727064324743a05c7b28c68f49bc6ee8c1839b2d10d3b599`.
The full corpus passes9,672 /14 skips /84 warnings in964.79s, exit0;9,686 tests
were collected. No retail files changed; only DOSBOX directory timestamps.
Evidence remains external at `C:\temp\GoldBox-task244-20261010`.

Original Amiga execution, arbitrary saved-party construction, full party
mutation support and crash-atomic frontend response publication are not
established by this bounded DOS-mechanics/compatible-Amiga-data contract.
