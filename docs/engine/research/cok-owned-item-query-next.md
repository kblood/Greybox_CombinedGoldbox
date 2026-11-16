# CoK owned inventory and ECL item operations

2026-09-08. Owned FIND_ITEM is implemented in `86b82db`; focused DOS checks and
the clean-source 27-script sweep pass at the existing 19 PASS /8 known FAIL baseline. Full item-removal side effects remain unimplemented.

## Query implementation

CCINV Q validates inventory against GBPR owner order, streams every 63-byte
record and publishes GBPS v6: the 3128-byte v5 prefix plus 32 item-presence bytes.
Each possible byte-sized type has a bit, including zero. Existing item seeds
remain a compatibility fallback for v1–v5. GBBOOT imports inventory before the
first ECL invocation and refreshes the map after scribing and on cold reload.
This fixes all four entries in the defect table below. Explicit diagnostic
party-count overrides do not change inventory membership.

The original query and immediate/variable operand readers now have 44 standing
execution cases plus two hash-mutation controls in `tools/test_cok_item_query.py`.
DOS helper checks cover all 256 types, 1101 records, absent/present-empty sources,
reordered/native/cloud owners, malformed envelopes/seeds, publication failure,
and the six native comparison flags. The integration test fails against the
three executables rebuilt from `d4c3450` and passes with the new executables.
Logs: `build/native-owned-query-{old-control,standing,helper,focused}.log`.

CCECL halts before owned DESTROY_ITEMS with GBHD reason 6 and a visible message.
Do not replace the original equipment/recalculation callbacks with bitmap-only
deletion. That behavior remains the next required inventory implementation.

Growth exposed a separate GBBOOT allocation defect: at 64501 resident bytes,
adding the 1024-byte allowance and 15-byte rounding term in BX wrapped to four,
then requested zero DOS paragraphs. A 20-byte-smaller control ran correctly.
The resize count is now calculated at assembly time, and
`tools/test_gbboot_allocation.py` executes the real routine with three padding
sizes plus the old-arithmetic mutation control. The creation and empty-party
terrain paths pass again. This fix preserves the existing safety allowance.

## Defect baseline before this implementation

`GBBOOT.auto_seed_party_items` runs before selected-party loading and collects
external STF item types through `collect_save_items_at`. It reads SAVE slots
first and only attempts cloud files when the aggregate item set is empty.
It deduplicates types through `add_seed_item`, stops at `AUTO_ITEM_MAX`, and
does not derive the result from the GBCP v5 owned GBIV inventory.

`CCECL.op_find_item` (opcode 32h) calls `seed_has_item`, which searches the
legacy party-wide item-type seed. `seed_remove_item` removes one type from that
set by moving the last entry into its place. The DESTROY_ITEMS implementation
calls it; it does not currently remove GBIV records or export changed STF files.
These are direct source observations at those symbols. They do not establish
which selected members, records or duplicates the original CoK opcodes affect.

## Original handler locations (static evidence)

The held GAME.OVR dispatch at 43B1h compares opcode 32h and its near call at
43B6h targets 34EAh. The handler through 359Eh traverses the party root at
DS:609A/609C, each body's inventory head at +323/+325, and item next links
at +42/+44. It compares the item type at +46, stops on the first match, and
sets the six-byte comparison state at DS:72E0 (EQ) /72E1 (NE). It does not read
the selected-body pointer in this handler. This supports party-wide presence,
subject to execution verification and operand-reader behavior.

Opcode 40h dispatch at 4435h calls 3F0Fh at 443Ah. The handler ends at 3FF7h.
It retains each item's successor before deletion and visits all party members.
For matching type +46, nonzero item +52 calls A8:43 before E6:70 removal;
after each member, it calls E6:43. It temporarily sets DS:6096/6098 to that
member and restores the previous pointer at the end. Those additional calls
mean simply deleting GBIV records would leave original behavior unimplemented.
Resolve and execute their item/stat effects before implementing DESTROY_ITEMS.
Disassembly artifacts: `build/cok-item-dispatch-disasm.txt` and
`build/cok-item-handlers-disasm.txt`; neither is a runtime parity test.

Before `86b82db`, scribing made the inconsistency visible: removing the last scroll record
can leave its type in the legacy seed, and cold resume can populate queries
from external files that differ from the saved inventory. The earlier scribing
tests checked SPELL queries and whole inventory bytes; the new query integration
test now checks FIND_ITEM before and after cold reload.

## Discriminating next work

Steps 1–2 have an initial two-case DOS measurement in
`build/probe-native-owned-query.py` / `build/native-owned-query-gap.json`:

| Case | Owned types | FIND_ITEM 39 | FIND_ITEM 77 |
| --- | --- | --- | --- |
| Charge-100 scroll consumed | empty | 1 (stale) | 0 |
| Same checkpoint, external type 77 on reload | empty | 0 | 1 (external) |
| Charge-101 scroll retained | 39 | 1 | 0 |
| Same checkpoint, external type 77 on reload | 39 | 0 (missing) | 1 (external) |

For step 3, `build/probe-cok-find-item.py` executes the original 34EAh handler,
4E:2A operand decoder, 4E:25 immediate reader and runtime FillChar unchanged.
Only unloaded-overlay stubs are mapped to copied original code; no gameplay
routine is replaced. The complete held image/overlay hashes are checked. All
22 cases pass: no party, empty inventories, types 0/255, early/later owners,
duplicates, 1101 records and selected-pointer present/absent. Every case checks
all six comparison bytes and unchanged complete bodies and item records. The
operand PC advances from 8000h to 8003h. Results:
`build/cok-find-item-execution.json`. This probe has now been promoted into
44 standing immediate/variable execution cases and two code-hash controls.

Static callback resolution: A8:43 is 28C12h..28EC4h; E6:43 is
372C6h..3776Ah. The latter rebuilds equipment pointers and several character
fields. `build/cok-item-removal-callbacks-disasm.txt` records this additional
surface; no callback execution parity is claimed yet.

1. Run a DOS fixture with one owned type-39 record, charge 100, queued spell 1.
   Scribe it, then query FIND_ITEM 39 in CCECL using GBBOOT's emitted GBPS.
   Compare against the now-empty owner's GBIV and a control retaining charge 101.
2. Repeat after cold reload with a poisoned external STF. Include a selected
   roster subset, per-owner cloud fallback, duplicates and more unique types
   than the old seed cap. Record exact query flags and unchanged source bytes.
3. Locate and execute the original CoK FIND_ITEM and DESTROY_ITEMS handlers.
   Pin code bytes and run selected-member, party-order, duplicate and quantity
   boundaries before choosing the native mutation interface. Do not infer CoK
   semantics from the existing COAB comments or the browser implementation.
4. Extend the existing owned-inventory helper boundary so queries and mutations
   use GBIV without a legacy seed cap. Preserve VM continuation around helper
   execution and validate a mutation before activation. Keep full records,
   source identity, cold persistence and failed-publication behavior.
5. Run focused differential tests and the required clean native flow/corpus
   gates. Do not claim complete inventory or item-stat parity from query support.

GBBOOT is 64491 resident bytes after the query/allocation changes; CCECL is
63399 and CCINV is 21802. Prefer the
existing streaming helper over adding another near inventory array. No native
source changes or builds may run while the release flow sweep is active.

## Removal continuation evidence

The exploratory work below is now superseded by 299 standing cases and an
equipment-list model. See `cok-item-removal-native-plan.md` for the current
implementation boundary and next steps.

`build/probe-cok-destroy-items.py` executes the original 3F0Fh handler, operand
readers, A8:43 equipment callback, E6:70 unlink/free routine, real FreeMem and
E6:43 character recalculation. Seventeen exploratory cases return correctly,
including twelve basic cases:
empty/no-match, single/duplicate matches and head/middle/tail removal, with
all records unequipped or equipped. The selected pointer is restored, the
surviving type order matches and actual free calls match the number removed.
Results: `build/cok-destroy-items-execution.json`. The body comes from the held
first SAVE character with inventory/party links reconstructed for the fixture.
These are preliminary execution checks, not a complete state-differential oracle.

Recalculation changes character fields even when no record matches, including
weight, equipment count and derived combat/movement bytes. A separate cursed
record case returns through the original display path and still deletes the
record (`build/cok-destroy-items-cursed.json`); synthetic screen memory and zero
delay limit this evidence to execution/state, not display parity.

The extended item-affect path initially stopped at an uninitialized callback.
The original initializer at GAME.OVR 14A78h installs 0065:0228 in DS:6D74;
mapping that original overlay and installing its verified pointer lets four
additional item bytes (128, 129, 140, 255) return through the real callback.
Together with the cursed case, the probe now passes 17 cases
(`build/cok-destroy-items-extended.log`). These fixtures do not yet reconstruct
active effect lists, so they do not establish removal of an owned timed effect.
Next, compare complete bodies, surviving records, global state
and effect lists across all selected owners; derive the native recalculation
model from those original instructions before enabling owned DESTROY_ITEMS.
