# Whole creation root admission after the helper batch

2026-10-15, Astra source-only plan. Begin implementation after the helper GUI
lease closes and its accepted sources/evidence are committed. Durable host
storage has separate ownership and acceptance; do not interleave its runtime
integration with this build lease. No application test or generation was run
for this plan.

## Frozen scope and original return

Admit the complete non-call CFG rooted at original descriptorA4:06DD, using
the final reviewed inventory `creation-closure-inventory-final-20261015-a.json`
(SHA256cfaa070f9ee30fb33a4b83bf1fbc9296fdf3f5c07752f819bb29c2322b49d04c).
Follow fallthrough, branch and reviewed-interrupt-return edges; direct callees
remain dependencies already covered by the helper batch. The root has2938
rows including164 inherited CreateRace rows. No newly selected row may enter
the Pascal data before06DD. Original GAME.OVR body base20209h makes the root
file offset208E6h and its return257B file offset22784h.

Relative to the accepted helper baseline30071 instructions/76596 bytes, the
exact delta remains2774 instructions/7416 bytes, yielding32845/84012.
Root new-tuple identity is
`bac41c2b7a0f840526f2c43c18997dbd0e44cee5cd4eeb2b911974ab7ab1c6d8`.
Read-only traversal of the pinned final inventory finds99 distinct new-row
relocation intersections, SHA256
`ff0090eb022cd8c861d1d9a8b1a508b9aee0834a6aeb62895b141432edec8857`.
Encoding is compact JSON of sorted `(originalCS,offset)` pairs, identical to
the helper proof. Rederive these intersections from original descriptors before
acceptance; the inventory alone is not an allowlist.

There is one local return site, A4:257B. Normal acceptance stores the resulting
character far pointer into DS:6096/6098 at256B..2574; cancellation cleanup
reaches2578 (MOV SP,BP),257A (POP BP),257B (RETF). Whole root admission covers
these paths together, including backtracking and the9E:0BED persistence call
at255D. Do not stop the implementation at the next menu.

## Sol source changes and ancestry

Add a focused `prepare_creation_root.py` and root admission hook immediately
after `creation_helpers`. Capture the entire current baseline at this new hook,
so existing continuation/module46/CreateRace/helper preparers retain their
current capture points, fixture formats and historical results. Chain the
accepted helper preparer, then capture, then independently recover root tuples
from original START/GAME.OVR and descriptor metadata. Reuse closure/local-CFG
logic; do not introduce another traversal framework or read generated C as the
source of truth.

Require exact equality of every baseline `(module,IP,source_offset,bytes)` and
the frozen new delta. Keep module46 ownership forA4 and existing original
relocation/owner/generation/source guards. Reject new instructions overlapping
existing boundaries, midpoint roots, changed bytes, missing/duplicate tuples,
missing fixups, extra data admission and any unreviewed direct dependency.
Recheck all32 distinct root direct callees against the admitted helper union;
an entry's presence is not a substitute for its recorded whole-body proof.

Preserve `create_race` and `creation_helpers` manifest objects byte-for-byte as
ancestry, including their historical stop atA4:0884. The NEW root phase has its
own effective stop ledger, derived from its parent's current ledger with only
that now-admitted boundary removed. Record its original normal return257B and
remaining deferred dependencies/services. Do not mutate the old ledgers to
pretend earlier phases covered creation. Do not add a synthetic success stop or
change host callback semantics. Rejected/exceptional host boundaries remain
honest faults; existing AH06/AH4C/INT23 limitations are not solved by this phase.

Publish ignored root baseline/tuple/reference fixtures with conflict rejection,
source hashes and a proof. Extend current portable controls to verify the
entire30071/76596 baseline, final32845/84012 totals, root/fixup identities,
unchanged parent manifest objects, exact protection union and mutation rejection.
Update the normal build's preparer chain only after portable source acceptance.
Coordinator owns serialized main/test-module integration.

## Proven missing creation assets

The current generated directory has22 artifacts, not22 guest assets. Its virtual
asset list contains GAME.OVR/KRYNN.CFG/font plus COMSPR.DAX,SKY.DAX,CURSOR.DAX,
ITEMS and intro MIDI/SOUND/TITLE. **CHEAD.DAX and CBODY.DAX are absent.**

Original A4:408B calls9E stub002A at40A2/40E3, resolving to9E:0817. That helper
copies Pascal strings `CHEAD` at9E:080B and `CBODY` at0811, appends the original
DS:0875 selector byte indexed by character+138, and calls11F stub0034 at086D
and08B5. Its head/body selectors come from character+135/+136/+137. The held
resident DS table at0875 begins00/53/54 (zero,S,T). Original11F:01D0 recognizes
the CHEAD/CBODY prefixes, strips the selector, adds40h to the block selector for
T, and uses the shared image/resource reader027F:0111 twice, including the
original +80h variant. Preserve these names, selectors and resource calls.

Held file hashes:

- CHEAD.DAX: `8e61d8cf23b7094353425224f02be4423b880c5e8a7e168d478ec851bfaea568`
- CBODY.DAX: `0c93206b020e30eecc1f761a9408b5befc20113fde18a8b401ae2ddad2c103bd`

Add these two exact immutable assets to generation and the existing virtual
asset registration, with input/output provenance and startup hash validation.
Keep legacy read/mode2 behavior and deny create/write/delete through all aliases.
Do not add HEAD2/BODY2 or ITEM1/2/3 merely because those files exist. ITEMS is
already present; actual creation call/file traces must establish any further
archive requirement. If the original reader requests another name, record its
source construction/block and add the evidence-backed dependency within the
whole-creation task. Do not fabricate a successful read or character equipment.

## Tests and runtime acceptance

First Luna runs portable generation/mutation/protection controls. Then serialize
optimized C/Rust build, focused root tests and the existing full Rust suite.
Add whole-entry root controls using a normal far-call frame and source-valid
runtime state, including exact original RETF/stack cleanup. Retain negative
source/owner/generation and guest-memory guard controls. Seed no final character
record and never inject an epilogue as a substitute for full-entry execution.

The existing real startup/party route must execute creation through completion
with BIOS input consumption recorded. Choose legal cases from original menus
and tables, not presumed AD&D options:

- Complete two materially different race/class paths. At least one uses a
  nondefault race; include a restricted or multiclass choice if the original
  offers it. Show character+5A and+109 writes, the DS:3A50 race table at15-byte
  stride determining class membership/count, generated attributes/alignment,
  actual name entry, icon selection and original acceptance.
- Exercise cancellation at race, a later selection and final acceptance, plus
  a backtrack. Check DS:6096/6098, allocations/list ownership, stack and ability
  to create again. An intermediate prompt or root-only RETF is insufficient
  evidence of restored party workflow.
- Trace original A4:255D->9E:0BED and raw WHO/STF/SFX operations, including fresh
  name, existing-name decision and a real adapter write failure. Corroborate
  original199h/3Fh/9-byte writes when their actual lists exist, never populate
  attachment lists merely to make expected sizes appear. Inspect original
  DS:43AC/8A58 handling and successful or failed return behavior.
- Demonstrate resulting party insertion through the original caller. If that
  caller crosses another unadmitted complete function, identify and inventory
  that function explicitly; continue the same acceptance goal with a separate
  bounded dependency batch, not a guessed return or host list insertion.

Use focusless GameLink with the pinned patched DOSBox-X for original comparison
and mode changes. Lifted GUI frames need accompanying input/state/file evidence.
Use finite evidence-led instruction budgets and stop/review unexpected faults;
do not increase limits to conceal a stuck input or incorrect return.

Memory-only save success establishes original helper behavior in one process.
After the separately accepted durable module is integrated under a serialized
lease, repeat original create/save, terminate the process, reopen and execute
original load before claiming persistent character acceptance. Host binary-byte
round trips alone cannot establish a valid WHO format or game-load success.

Report root admission, completed creation/party behavior and durable cold-load
acceptance separately. Commit/push the verified bounded result, then continue
the paired M2 persistence closure from the post-creation roadmap.
