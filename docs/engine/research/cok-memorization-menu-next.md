# CoK native memorization menu: next boundary

## Native menu implementation — 2026-09-08

GBBOOT now exposes CoK camp M and headless `/6 member spell`. It lists named
known spells with remaining allowance, confirms additions/cancellation, and
persists full character records. Additions use the first empty slot and original
pairwise sort; cancellation preserves ready spells and holes. A successful edit
clears the eight-byte rest-action continuation. Spell 56 retains its level-seven
index, group-two duplicate checks retain the slot-zero omission, and the mage
bonus uses the persistent lunar words. This supersedes the missing-menu notes
below, which record the earlier investigation.

`tools/cok_memorization.py` guards the held code and tables before supplying
fixture expectations. `tools/test_cok_memorization.py` runs the original
eligibility routine and F7 helper across 1392 cases, compares whole-body queue
operations and remaining capacity, pins native names/metadata, and includes
code/table mutation controls. No menu/helper behavior is stubbed in these
isolated executions. The capacity helper's inactive-cleric group-two branch
really does depend on previous stack bytes; native admission rejects that
undefined case. This is an explicit bounded difference, not a reconstructed
fixed retail allowance.

The separate DOS harness covers 32 cases, including three actual interactive
confirmation paths, plus cold learning, cancellation, lunar exhaustion and
resetting an active countdown. BIOS typeahead drives camp; a one-shot in-DOS
timer sends Escape after the explorer deliberately drains stale keys. It never
uses host keyboard input. The initial UI timeout was in that test exit path,
after the queue and checkpoint had already been saved. A second fixture error
used a nine-character directory name; the corrected fixtures enforce DOS 8.3
directory limits. The old executable leaves LEARN unchanged on the same bounded
command for which the new executable passes whole-body verification.

The menu uses imported caches/known flags and sequential source/roster writes.
New-character grimoire initialization, complete inventory checkpointing and
scroll consumption remain work; they are not supplied by this menu.

## Earlier investigation

2026-09-08. Rest learning is implemented in `d05d8b9`; queue selection and
scribing remain required. The following are read-only retail disassembly
observations, not a completed native menu or a live retail trace.

The M branch at GAME.OVR `0x1C324` enters `0x1B706`. After selecting a spell,
`0x1B7FE` reads its level at DS:31B4+id*16 and `0x1B80E` reads its group at
DS:31B3+id*16. These feed the remaining-capacity helper `0x1AD6E`.

For groups other than two, that helper counts all nonempty entries in the
58-byte queue whose masked id has the requested group and level. Ready and
pending copies both count (`0x1AE03..0x1AE4E`). It returns the nonnegative
remainder of the cached character byte at **283 + 5*group + level** after
subtracting this count (`0x1AE60..0x1AED0`). The six held SAVs corroborate
nonzero cached capacities at the expected indexed positions. The producer is
located below; execution comparison and a checked model remain required. Group two has a separate path:
it consults character bytes 249 and 93 and counts masked ids 101..107. Do not
treat its zero-level spells as ordinary level-zero entries in the capacity table.

Queue insertion scans for the first empty byte (`0x1B857..0x1B870`), writes
id+128 (`0x1B872..0x1B887`), then calls `0x1B620`. That routine sorts all 58
entries by masked id, swapping the complete raw bytes when the later masked
id is smaller (`0x1B649..0x1B6A4`). Thus zeros move to the front, and pending
bits travel with their entries. The comparisons ignore bit 7. Imported queues
and SPELL queries must retain their current raw order until a menu operation
actually invokes this sorting behavior.

Grimoire candidates require the +98+id known flag and the predicate at
`0x2DC8E`. That predicate branches on the spell group and consults character
bytes 19/21, race byte 90, level-related bytes 249..264, a pointer at 335/337,
and F7:48. All nine F7 stubs resolve to unique overlay base `0x39F10`, putting
F7:48 at `0x3AE0B`; it calls `0x3ADBB` and compares that result with character
byte 215. `0x3ADBB` returns zero unless race byte 90 is six; otherwise it scans
bytes 249..256 and returns the first nonzero level (or the last byte). F7:48
returns whether this signed byte exceeds byte 215. This is a candidate dual-class
regained-abilities predicate; its field setters still need verification. These
conditions also need byte guards. A second
predicate at `0x2DC29` filters group-two duplicates, scanning slots 1..57 with
masked-id comparisons. The omission of slot zero is an observed retail detail,
not a reason to silently compact or renumber the native queue.

Menu entry also calls `0x1AF46` with mode two. The inspected branch rejects
character status byte 392 equal to one, or character **byte 393 equal to zero**
(`0x1AF79..0x1AF94`). All six held SAVs have byte 393 equal to one. Previous
rest notes called this an "in-combat byte", but the evidence does not establish
that name: the healer sets it to one when waking a character, while the global
combat-state test uses DS:4B49. Preserve the raw flag and verify its producers
before assigning UI semantics. This does not alter the already pinned healer
stores or the rest learning loop, which does not call this menu-entry predicate.

Next: resolve the cached-capacity producer and F7 helper, pin these selection
rules, then add a visible native M menu with per-member known spells, remaining
slots, queue confirmation/cancellation and full-body persistence. Scribing
additionally requires owned inventory checkpoints and E6:70 item-removal behavior;
the current rest implementation stops before queued scribing rather than consuming
unmodeled inventory.

## Direct overlay descriptors resolve E6

The unpacked START image carries the file offset directly in each inspected
overlay descriptor: at `segment*16`, `CD 3F 00 00` precedes a u32 file base
at +4, code-byte count at +8, relocation-byte count at +10, procedure count
at +12 and previous descriptor segment at +14. Procedure stubs start at +32,
five bytes each (`CD 3F`, u16 procedure offset, zero byte). The file base plus
procedure offset yields the target; no prologue-voting heuristic is needed.

A bounded scan found 34 full descriptors and 504 procedure stubs. Every stub
offset is within its descriptor's code range. Sorted by file position, code
length plus relocation length reaches the next descriptor's file base with
no gaps, from `0xDA` through GAME.OVR EOF `0x41AE7`. The earlier descriptor
at segment 0x38 has a zeroed header and is outside this claim. AF/A8/BA/DB/F7
bases exactly match their independently resolved prologue intersections.

E6's descriptor at unpacked `0xE60` stores file base **`0x365A6`**, code size
`0x37B4`, relocation size `0x1B6`, and 48 stubs. Its extent ends at F7's base
`0x39F10`. E6:70 has stub procedure offset `0x1697`, resolving to **`0x37C3D`**.
The routine unlinks the item from character +323/+325, following item +42/+44
links, zeros the removed node's links and frees **63 bytes** (`0x37D22..0x37D26`).
This closes the item-removal call used by scribing at `0x333D6`.

E6:D9 resolves to `0x391BD` (procedure offset `0x2C17`). Its inspected branches
dispatch screen refresh by global state and call `0x36D60`; do not assume it is
the capacity recalculation routine merely because the memorization menu calls it.
Older notes' unresolved E6/prologue-voting result is superseded by these explicit
descriptor fields. `tools/borland_overlay.py` now reads these unloaded descriptors,
checks stub/relocation bounds and follows an explicit tail/root chain, rejecting
cycles, gaps, overlaps and zeroed intermediate headers. The CoK contract checker
uses it and cross-checks AF/A8 against their independent prologue resolutions.
It does not emulate relocation or accept rewritten runtime descriptors. Tests
cover 34 descriptors, 504 stubs and 5529 relocation words in the held CoK image,
plus synthetic malformed inputs and a valid RET-only procedure with no prologue.

The reader resolves F7:2A to `0x3A632`. This routine uses character byte 249
as a level and byte 93 to select one of two progressions. It initializes capacity
bytes 284..288, adds rows from DS:3C8E using a 99-byte progression stride and a
five-byte level stride, then adds bonuses for byte 21 thresholds 12..17. Entry
F7:25 is `0x3A343`; F7:2F is `0x3A7B6`. Follow those companion routines before
porting capacity initialization. The store at `0x238EE` writes byte 283 itself
from an HP calculation; it is not a spell-capacity producer. This is why the
indexed capacity formula must retain its spell-level term rather than treating
byte 283 as the start of a flat spell-count array.

The main capacity producer is now located at **`0x39F1F`**, called by F7:25
at `0x3A440`. It clears exactly 20 bytes at character +284 (`0x39F31..0x39F3E`)
and visits the eight level slots at +249..+256. Its observed branches are:

- Slot zero: cleric progression and the `0x3A632` bonus routine, then known-spell
  flags from DS:4230 for available levels.
- Slot seven: level greater than five, a byte-92 condition and progression rows
  four/five, then the same known-spell list. Held Sir Strongsword's sole level
  is slot seven; his independently identified class is Knight.
- Slot four: level greater than seven, DS:3EE0 progression split between
  character +289..+291 and +299..+300; it also enables group-one known spells.
  Held Istan Horbin's sole level is slot four (Ranger).
- Slot five: base mage level-one capacity at +299 and progression seven/eight
  selected by byte 94. Held Garin, Kal and Sirrion all have their mage level here.

At `0x3A2D0` it walks inventory nodes. Every node whose byte 62 is `0x81` and
byte 52 is nonzero doubles mage capacities +299..+301 (`0x3A2EE..0x3A31F`).
Thus native capacity recalculation needs equipped inventory as well as the
character's class/level data; a fixed slot table alone is incomplete. These are
static observations pending a checked model and execution comparisons. F7:2F
at `0x3A7B6` instead writes saving-throw bytes +208..+212, so it is not another
capacity helper. F7:25 also refreshes non-spell stats and equipment restrictions;
do not port that entire routine as if it only updated memorization slots.


## Executed capacity model — 2026-09-08

`tools/cok_spell_capacity.py` models the whole-body changes made by `0x39F1F`
and `0x3A632`, using code/table SHA-256 guards for the held retail build.
`tools/test_cok_spell_capacity.py` compares it with isolated Unicorn execution
of those original x86 routines. Only the external Pascal FillChar call is
substituted, with its arguments and destination checked; execution outside the
two routines and writes outside stack, one global loop counter, known flags,
and capacities fail. The oracle restores fixture-only inventory pointers before
comparing complete 409-byte characters. Source files and caller inputs are read-only.

The 26 tests cover six held saves, all eight level slots, progression selectors,
level and signed-byte boundaries, all cleric bonus thresholds, 60 deterministic
mixed-class bodies, equipment qualification, 0..256 qualifying items and byte
wrap. A changed mage store yields a different oracle result; changed code/tables
are rejected by the model loader. The six held saved capacity arrays match
recalculation with an empty inventory. This does not prove their inventories are
irrelevant in other states. A level-10 mage yields `4/3/3/2/0`, one qualifying
item `8/6/6/2/0`, and two `16/12/12/2/0`.

Two precise details matter for the native port. The divine known-flag loop visits
only levels **1..4**, even though five capacity bytes exist. The cleric helper
replaces the producer's preliminary cleric calculation, starts first-level
capacity at one/two by progression, and applies bonuses only to nonzero capacity
bytes. Level branches use signed bytes; Wisdom bonuses use unsigned comparisons.
The model preserves those raw semantics without declaring malformed characters
legal or validating menu eligibility. It does not load/save inventories, implement
the native menu, or claim a complete retail DOS session. These execution results
replace the earlier static-only limitation for capacity production specifically.


## Selection follow-up: lunar bonus is separate from cached capacity

The next boundary is now located. `0x1B192` resets DS:7144, then for an active
mage (signed character +254 > 0) with nonzero robe byte +94 reads the Area1 word
at ECL address **0x4CF8 + robe** (`0x1B337..0x1B34C`). The equivalent physical
field is Area1 +0x3F0 +2*robe after 16-bit address arithmetic. Values one/two
initialize a shared bonus pool of one/two; other values give zero. The loop at
`0x1B375..0x1B3E1` subtracts already-used mage copies above each of the five
cached capacities from this shared pool, stopping it at zero if excess is larger.
Menu insertion at `0x1B81C..0x1B837` accepts positive normal capacity **or** group
three with a positive pool. Therefore cached capacity alone is insufficient.

This is the lunar phase state: `0x2A87C` increments/wraps the phase at counter
address minus three, and `0x2A9A1` supplies counters 0x4CFC/0x4CFD/0x4CFE with
thresholds 8/1/6. The helper compares the old counter with the threshold before
incrementing; do not substitute periods 8/1/6 without that boundary behavior.
The phase words are exactly 0x4CF9..0x4CFB, also used to choose the three top-row
moon tiles. The clock normalization calls it at `0x2AD30` when slot three carries.
These are static instruction observations; isolated execution and native
clock/checkpoint integration of the lunar words still need verification.

Cancellation is also precise: `0x1AC6B` clears every queue byte greater than 127
and resets preparation byte 88, retaining ready spells and the remaining holes.
It does not sort. Group-two remaining capacity is a wrapping byte subtraction,
with an uninitialized local when active cleric level is nonpositive; the menu
uses an unsigned nonzero test. Do not describe this helper as universally clamped
or turn stack-dependent retail behavior into a fixed native rule. The ordinary
groups do clamp to zero and report the full used count through an output pointer.


Native integration sites were inspected: GBBOOT `run_cok_rest` normalizes
`rest_fx` using `rest_radices`, and CCECL `normalize_clock` normalizes
`clock_slots`; both currently carry the hours into days without the lunar helper.
Neither source mentions the phase addresses. The next implementation therefore
needs both clock paths, script-visible Area1 words, and checkpoint/resume tests,
not just an M-menu display bonus. Large CLOCK steps must preserve the retail
number/order of carries; rest's five-minute step normally has at most one day carry.


A first isolated execution probe (`build/probe-cok-lunar.py`, results
`build/cok-lunar-execution.json`) now passes 36 phase/counter boundary cases
across all three moons. It executes `0x2A87C` with only the external tile draw
stubbed and checks phase wrap, reset/increment, and draw-call count. This confirms
9/2/7 helper invocations per phase from counter zero. It does not yet test the
clock caller, script reads/writes, or native persistence; promote it to a guarded
regression before changing the engine. Existing GBEF sparse memory already has
space for the six ECL keys in ordinary cases, but `mem_set` can halt on its
512-entry limit. A lunar update must preflight capacity before mutating time;
do not silently lose an update when the sparse map is full.


## Native lunar state implemented — 2026-09-08

GBBOOT and CCECL now advance the six lunar sparse-memory keys on hour carries.
The read-only planner computes the carry count and checks capacity for missing
keys before time or effect-timer mutation; apply materializes defaults and
performs each day update. Existing GBEF/GBCP memory carries the words through
resumes. CCECL scopes this to a KRYNN.CFG sibling without DKK.CFG. These updates
supersede the earlier missing-native-integration observations above. Retail
Area1 save import and moon-icon drawing are not added by this change.

`tools/test_cok_lunar_clock.py` promotes the exploratory helper to 73 guarded
execution tests, including raw phase/counter values and repeated full cycles.
The original helper's external draw is stubbed; its tile and byte arguments are
checked. `native/gbboot-lunar-test.ps1` supplies the separate DOS evidence for
script reads, multi-carry CLOCK, direct-day behavior, VM resume, transcript
capacity, title scoping, full-map rejection before timers, rest, exact bodies and
cold checkpoint continuation. The prior CCECL fails DAY's script-visible values;
the prior GBBOOT fails R288's checkpoint phases.

Next is the actual menu admission/queue work: use the now-persistent phase word
for the separate mage pool, verify 2DC8E/F7:48 and group-two edge cases, and port
selection, cancellation and sorting. Capacity reconstruction is already modeled
and execution-checked; inventory persistence/scribing remain outstanding.


The next menu implementation now has two further exploratory execution controls.
`build/probe-cok-eligibility.py` runs 2DC8E and the original F7:48/3ADBB helper,
matching a Boolean model in 1392 cases (six held bodies across every id plus
constructed group/ability/race/level/armor/state cases). Its claim is only the
predicate, not known-flag filtering or selection. `build/probe-cok-queue.py`
compares 60 complete random bodies through original sort/cancel functions. An
explicit `[129,1,0]` tail sorts to `[0,1,129]`, proving that a stable language
sort is not an exact replacement. These probes currently live under build;
guard and promote them when adding the actual native menu.


Menu-port bounds need to follow the actual spell table. Most eligible ordinary
spells have levels 1..5, but held id **56** is group zero, level **7**. The retail
remaining-capacity helper still uses its indexed character byte (283+7=290).
Do not add a blanket level<=5 eligibility filter or flatten these fields into
five slots and silently change that case. The model/queue probes retain raw ids;
known-flag eligibility and this indexed-capacity behavior require explicit menu
fixtures. Group-four spells remain excluded by 2DC8E.


`build/probe-cok-remaining.py` adds 200 isolated comparisons of 1AD6E, including
raw queue values and used-count output. It also directly demonstrates the
inactive-cleric group-two dependency: identical zeroed characters return zero
or seven when only the helper's prior local-stack byte differs. The used-count
output remains untouched on that group-two path. This is an observed undefined
input/state boundary, not an established fixed allowance to copy into the UI.
