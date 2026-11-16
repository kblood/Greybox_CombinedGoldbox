# Native CoK inventory persistence and scribing boundary

2026-09-08. The native memorization menu is implemented in `5c1ac4c`.
Inventory checkpoint storage is implemented in `29e1579`; staged scroll
consumption and changed STF export are now implemented in CCINV/GBBOOT.
See `cok-scribing-native-plan.md` for the protocol and the current handoff for
gate details. Item-derived stat changes and owned item-query synchronization
remain open.

## Inventory storage implementation

`native/src/ccinv.asm` streams complete 63-byte records through a 4096-byte buffer.
The fixed checkpoint core stays 11112 bytes. External GBCP v5 appends a GBIV v1
envelope, and the existing CRC32 field at 28 covers the entire file with those
four checksum bytes zeroed. The 16-bit core-length field remains 11112; inventory
lengths are 32-bit. DOS signed seeking limits supported file lengths to below
2 GiB; there is no 256-node limit.

GBIV has a 16-byte header: magic, u16 version 1, u16 owner count, u32 total
length, u32 reserved zero. Each owner has an eight-byte row (u8 source id,
u8 presence flags, u16 reserved zero, u32 record-byte length), immediately
followed by its records. Flags are 0 absent, 1 SAVE, or 3 cloud. Present empty
files are distinct from absent files. Sources must match the checkpoint roster
in order, be unique, and fall in 1..6 or 128..133. Serialized pointer bytes are
preserved opaquely; this is storage, not runtime pointer reconstruction.

The helper imports SAVE before cloud per owner, including an empty SAVE file.
Old v1-v4 checkpoints have no inventory and import current external files when
loaded. V5 loads stage the saved inventory, validate the core/map through GBBOOT,
then activate it. Rest checks that owned inventory for pending scrolls. Saving
extends the unpublished checkpoint temporary file before its existing rename
and backup sequence.

Focused evidence: `build/native-inventory-owned.ps1` first upgrades a v4 camp to
v5 with empty inventories, introduces an external pending scroll, then resumes
one rest tick successfully. Both checkpoints contain the same empty inventory.
The memorization fixture now retains this regression alongside cold learning.
`native/ccinv-test.ps1` passed 21 helper cases including a checkpoint over 64 KiB,
exact record round trips, malformed envelopes, v1-v4 migration, failed-import
preservation, CRC rejection and empty SAVE precedence over cloud.
`tools/test_cok_inventory.py` adds 20 storage-boundary cases.

The storage change alone did not implement scribing or source STF export;
the subsequent staged learning integration adds those. Item-derived stat changes
and reconciliation of the older GBPS item-query seed with checkpoint inventory
remain required follow-up work.

## Scribing caller follow-up

The display/allocator boundary is now executed by
`tools/test_cok_scribing.py`, against `tools/cok_scribing.py`:

- 168 caller cases run the original caller, predicate, consumer, unlink,
  FreeMem, string and display routines. Only unloaded overlay dispatch stubs
  are mapped to their original code copies. Display delay is zero, game-state
  byte 4B49 is 2 and video-setting byte 4B76 is 1; screen memory is synthetic.
  These are state-mutation tests, not pixel or display-cadence parity claims.
  There are no GetMem calls, including through its near allocation entry.
  Every body/item byte is compared, including the removed node's free-list
  header; stored links are normalized to the runtime allocation addresses for
  this comparison. Completion/lookahead, types 39/40 versus other items,
  duplicate masked ids, zero levels and charge wrap are covered.
- 18 original STF load/save loop cases run real GetMem and Move, substituting
  only in-memory BlockRead/BlockWrite files. They prove file order and runtime
  link reconstruction through 256 nodes, with zero/one/62-byte trailing
  fragments. The outer file-open/path code is outside this loop test. The
  original discards trailing fragments; the native importer rejects them.
- 35 original preparation-setter cases verify whole-body preservation,
  estimated minutes, four/six-hour thresholds, zero levels and byte-sum wrap.
  Scroll level zero remains zero; memorization level zero becomes one. With
  256 level-one scroll entries and no memorization, the wrapped sum is zero
  and preparation is zero. A maximum level above two still forces six hours.
- Two model preflight cases reject out-of-range pending scroll ids before
  completing an earlier valid entry. This is the native 1..107 grimoire bound,
  not a claim that the original helper validates those malformed ids.

The 223 focused tests pass (`build/native-scribing-oracle.log`). The full armed
corpus reports 2180 passed, the same two inherited browser export failures and
one skipped case (`build/native-scribing-corpus.log`, 333.40 seconds). They pin the
complete held unpacked image and overlay hashes. The earlier omitted-display
probes below are retained as investigation history; their uncertainty is now
resolved for the explicitly configured display path above. The original
caller does inspect later slots of a removed item before reaching its cleared
next link. The native model retains that ordering rather than rescanning only
surviving records. Native rest integration and source STF writeback are next;
this model alone does not enable DOS scribing. The implemented integration boundary
and required failure-before-mutation order are in `cok-scribing-native-plan.md`.

`tools/test_cok_inventory_retail.py` promotes the 15 removal and 84 consumption
cases below into four pytest cases (including two code-hash mutation controls).
Only FreeMem bookkeeping is stubbed; complete character/node bytes are checked.

`build/probe-cok-scribing-caller.py` additionally executes the original caller
at 0x2B3CF with the original predicate, consumer and unlink helper in 12 cases.
It verifies the known-spell write, balanced return, one presentation event and
an unchanged successor node. The display/string-call span 0x2B4A5..0x2B4CA is
skipped explicitly. FreeMem checks its arguments but does not free/reuse memory.
The results are in `build/cok-scribing-caller-execution.json`.

This probe exposes a boundary requiring more evidence: after consumption the
caller scans later spell slots in the same node and then reads its next link,
even if the consumer removed that node. With charge 100, `[129,0,0]` returns
level zero although the successor holds pending spell 22; `[129,150,0]` returns
level two from the removed node. Charge 101 retains the node and reaches the
successor. These are emulator results with freed bytes retained, not proof of
live allocator behavior. A second probe, `build/probe-cok-scribing-real-free.py`, now uses original
FreeMem at 0xA6B4 with normalized pointers and a valid heap boundary. All 12
results are identical; complete body/node comparisons include FreeMem replacing
the freed node's first eight bytes with its free-list header. Display calls are
still omitted. Verify display-time allocation before deciding how native
countdown selection should handle removal. Do not silently
replace this with a convenient scan of the surviving list.

## Evidence now available

Static STF I/O evidence is now located in the overlay at descriptor segment
0x9E (file base 0x1D6DB). The load loop at 0x1EA84..0x1EB3B reads 63 bytes,
allocates a node, appends it to the character's head/list, copies the record and
clears its next link. The save loop at 0x1E75C..0x1E7AD writes 63 bytes and follows
the next pointer at 42..45. This supports file-order preservation with runtime
link reconstruction. The original load stops on a partial record; the new owned
envelope deliberately rejects partial input. Routine-start disassemblies are in
`build/cok-inventory-load-disasm.txt` and `build/cok-inventory-save-disasm.txt`.
These I/O loops still need executable oracle coverage; the evidence here is
static, unlike the removal and scroll-consumer probes below.

The six held `Champions of Krynn/SAVE/CHRDATA*.STF` files contain 26 complete
63-byte records: 3/5/5/4/4/5 per member, with no trailing fragments. All six
last records have zero link words at offsets 42..45. Other records contain
serialized far pointers. The inventory-shape report is
`build/cok-held-inventory-shape.json`. This does not establish loader ordering
or a maximum inventory size.

E6:70 resolves through the checked overlay descriptor to GAME.OVR `0x37C3D`.
`build/probe-cok-item-remove.py` executes that original routine in 15 cases:
head, middle and tail positions in lists of 1/2/3/8/32/256 nodes. It checks
every byte of the 409-byte character and every 63-byte node. Removal updates
the character's head at 323..326 or the preceding node's links at 42..45,
clears the removed node's links and calls Pascal FreeMem for exactly 63 bytes.
Only external allocation bookkeeping is stubbed; its pointer/size arguments
are checked. Results and the code hash are in
`build/cok-item-remove-execution.json`. Missing-node/error paths are not covered.

`build/probe-cok-scroll-consume.py` executes the scroll consumer at `0x33368`
and the original E6:70 helper together in 84 whole-list cases. It clears the
last matching masked id among item bytes 60..62, decrements byte 47 and invokes
E6:70 when the unsigned result is below 100. Cases cover head/middle/tail,
absent ids, duplicates, and charge bytes 0/1/99/100/101/102/255. The decrement
wraps zero to 255, retaining that item. A later ready copy wins over an earlier
pending copy with the same masked id: `[129,2,1]` becomes `[129,2,0]`.
Only FreeMem bookkeeping is stubbed. Results and the consumer code hash are
in `build/cok-scroll-consume-execution.json`. Promote these exploratory probes
to guarded tests before implementing consumption; they do not yet prove the
rest caller's ordering or serialized STF rewriting.

`build/native-inventory-gap.ps1` reproduces the missing checkpoint ownership
in DOS: copy a completed LEARN checkpoint whose STF inventories were empty,
introduce a pending scroll into the external member-three STF, then load `/5`
and request one rest tick. Rest is blocked by the newly introduced external
scroll and the previous checkpoint is retained. Output:
`build/native-inventory-gap.log`; assertions: `build/native-inventory-gap.json`.
This is an observed defect baseline, not a passing inventory-persistence test.

## Original implementation requirements (storage and scribing now implemented)

- Verify original STF load/save order and the surrounding scribing caller,
  including known-spell writes, preparation/countdowns and any item-derived
  stat changes. Preserve complete records and owner/order identity.
- Give the native session authoritative owned inventory state. After a cold
  checkpoint load, rest must use that saved state even if external STF files
  have changed. The pre-v5 `rest_learn_prepare` reread source files instead.
- Version the checkpoint inventory section, preserve old checkpoint readers,
  and validate every length/count/owner plus CRC before replacing active state.
  Empty and absent source inventories need explicit, tested handling; retain
  SAVE/cloud lookup precedence when importing.
- Avoid assuming the 256-node execution case is a retail limit. The current
  checkpoint length field and contiguous near buffer are 16-bit; GBBOOT is
  already 62986 resident bytes. Establish valid capacity before choosing
  streaming, far buffers or a separate DOS helper and defining the new format.
- Test exact unchanged records, cold reload after source poisoning, malformed
  records, duplicate scroll ids, head/middle/tail consumption, charge boundaries,
  interruption/resume and failure before mutation. Keep retail directories
  read-only by using disposable copies.

## Separate creation gap

CCPARTY's CoK constructor still writes provisional class values into byte 90,
which the retail record uses for race, and does not populate level, known-spell,
capacity or menu-eligibility fields. The menu currently operates on imported
records. Canonical native character creation and starting grimoire selection
need their own original-code investigation; granting arbitrary known spells
would not resolve that gap.
