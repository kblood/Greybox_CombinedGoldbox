# CoK Task 137 — fixed callsite audit for descriptor-12 procedure 0x0208

Task 136 ran descriptor-12 procedure `0x0208` directly with the range-3
fixture. That execution took the `0x10E7D` comparison's `JAE` arm, called
descriptor-23 procedure `0x1261` and descriptor-24 procedure `0x12F8`, then
returned `AL=0xFC`; it did not enter FDF2. Task 137 asked whether a fixed
retail far-call site supplies the production entry into this procedure.

## Public entry mapping

Using `tools/disasm_cok.py resolve 0x65 0x43` and the validated runtime
descriptor/stub geometry, selector `0x65` maps to descriptor 12 at
`GAME.OVR:0x10BE8`. Stub offset `0x43` is public stub index 7; the stub's
procedure offset is `0x0208`, giving `GAME.OVR:0x10DF0`. The containing
descriptor has 105 public stubs.

## Fixed far-call census

The source-backed `vroomm_layout.classify_lcall_routes` inventory over all
descriptor fixups found **zero** fixed far calls whose target is descriptor
12, stub index 7, or procedure `0x0208`. It found two fixed calls from
descriptor 11 into other descriptor-12 public entries:

| Caller | Retail callsite | Target |
| --- | --- | --- |
| descriptor 11, `GAME.OVR:0x10098` | `0x100B4`, `lcall 0x65:0x2A` | descriptor 12 stub 2, procedure `0x0082` |
| descriptor 11, `GAME.OVR:0x10098` | `0x108D2`, `lcall 0x65:0x25` | descriptor 12 stub 1, procedure `0x38EA` |

These routes establish that descriptor 11 calls sibling public entries, not
that either sibling dispatches to procedure `0x0208`. The mapped callsite
inventory accounts for statically relocated far calls; it does not identify
indirect function pointers, runtime callback tables, or loader-mediated
dispatch. Therefore this is a bounded negative result, not proof that the
production callback is unreachable.

## Callback table and indirect consumer (corrected Task 138)

The fixed call from descriptor 11 at `GAME.OVR:0x108D2` enters descriptor-12
procedure `0x38EA` (`GAME.OVR:0x144D2`). It writes selector-`0x65` far
pointers into `DS:6B98..6D76`. These AX immediates are **public stub offsets**,
not descriptor procedure offsets. At `GAME.OVR:0x14509..0x14513`, it writes
offset `0x43` and selector `0x65` to `DS:6BB0`. Runtime geometry maps
`0x65:0x43` to descriptor-12 procedure `0x0208` (`GAME.OVR:0x10DF0`).

Descriptor-23 procedure `0x01A8` (`GAME.OVR:0x34153`) consumes this table.
If `DS:0x713C` is zero, it reads the byte argument at `[BP+0x10]`, computes
`DI = 4 * [BP+0x10]`, and executes `lcall [DI+0x6B94]`. With input index 7,
the effective pointer address is `DS:6BB0`, which selects `0x65:0x43`.
Procedure `0x01A8` has fixed callers from descriptors 12, 19, and 22; however,
the production value of its index argument and the runtime DS identity have
not been captured. When `DS:0x713C` is nonzero, the alternative branch calls
the fixed pointer at `DS:6D74`, which procedure `0x38EA` initializes to
`0x65:0x228`.

This is a source-backed producer → table → indirect-consumer route to the
procedure from Task 136, but it does not prove that production execution takes
the index-7 branch. The earlier Task 138 interpretation confused stub offsets
with descriptor procedure offsets and is corrected here.

## Absolute indirect far-call candidate (Task 139)

Descriptor 12 procedure `0x26A5` contains an absolute indirect far call at
`GAME.OVR:0x1329F` (`lcall [0x6EDE]`). It reaches that call only when
`0xDB:0x4D` returns `AL=1`. `tools/disasm_cok.py xrefoff 0x6ede` reports the
call and one direct writer, at `GAME.OVR:0x3372D`. The writer stores
`AX=0x0101`, `DX=0x00BA` at `DS:6EDE`; `python tools/disasm_cok.py resolve
0xba 0x101` maps that far pointer to descriptor 22, public stub 45, procedure
`0x320F` (`GAME.OVR:0x30E1A`). The writer also places `0x00BA:0x0106` at
`DS:6EE2`.

This statically written pointer is not `0x65:0x43`, so it does not explain the
Task 136 entry. Both instructions address the same DS-relative slot, but no
runtime trace joined their DS values or captured the call-time contents; this
rejects the static candidate without proving a runtime identity or excluding
other computed writers.

## Boundary and next step

## Fixed caller argument census (Task 141)

The validated relocated-call route map identifies twelve fixed far calls to
descriptor-23 procedure `0x01A8` (`0xDB:0x2A`). Reading the first pushed word
at each caller gives the wrapper's `[BP+0x10]` index:

| Caller descriptor | Callsites | First-pushed index |
| --- | --- | --- |
| 12 | `0x11916`, `0x1192D`, `0x11AB6` | `0x2B`, `0x2C`, `0x4D` |
| 19 | `0x28B4D` | `0` or `1` from `[BP+6]`; this caller sets `DS:0x713C=1` first |
| 22 | `0x2FDBF`, `0x304BC`, `0x3129D`, `0x31E03`, `0x31E85`, `0x31F70`, `0x32492`, `0x324F2` | `0x0B`, `0x17`, `1`, `0x40`, `3`, `0x0B`, `0x1B`, `0x2A` |

None of these fixed callers selects table slot 7. Descriptor 19 takes the
fixed `DS:6D74` branch because it sets `DS:0x713C=1`; its `0/1` index does
not select the indexed table. The other listed calls use indices other than
7.

## Near-call route through mode-4 effect dispatch (Task 142 correction)

The far-call census above does not cover same-descriptor `E8 rel16` calls.
Descriptor 23's mode dispatcher at `GAME.OVR:0x34527` compares its mode
argument at `[BP+0x0A]`; the mode-4 arm at `0x34600` passes effect ID `7` to
helper `0x342FD` at callsite `0x3460D`.

Helper `0x342FD` has two near calls to wrapper `0x34153`. At `0x3420F`,
guarded by `byte ptr ES:[DI+4] != 0`, it passes the segment of its target far
pointer as wrapper argument `[BP+0x10]`, the callback-table index, and passes
mode 1. Its second call at `0x34495` passes helper `[BP+6]` there. `[BP+6]`
is the effect ID supplied by the dispatcher, so the mode-4 arm can pass index
7 at this callsite. This second call is conditional: helper local
`[BP-0xE1]` must be nonzero at `0x34479`; several checks and a target
traversal can set that flag.

The earlier `0x3420F` call can also affect the later gate. If its wrapper sees
nonzero `DS:0x713C`, it calls `DS:0x6D74`, initialized to `0x65:0x228`; that
resolves to procedure `0x3888`, which clears `DS:0x713C` at `0x14476`. If the
two calls use the same DS and no intervening code sets the byte again, this
first call could clear the alternate-branch gate before `0x34495`, allowing
the later effect-ID-7 call to select indexed slot 7. This is a plausible
two-call route, not a proven production execution: the first guard, initial
gate, DS identity/stability, any intervening writes, second local guard, and
table contents remain to be joined.

The other two direct near callers found in this bounded search are
`0x34EBC` and `0x34F6F`; they pass literal callback indices `0x1E` and
`0x1F`.

The existing focused Unicorn coverage in
`tools/test_cok_effect7_target_provenance.py` runs original `0x14F24` through
`0x34527 -> 0x342FD` and observes callback `0x10DF0` with the allocated owner
context. Its overlay, allocator, member, and DS setup are fixture-installed;
the callback result proves this code path can execute under those inputs, not
that the retail startup and attack caller supply the same guard or gate state.
Task 143 closes at that boundary. Active Task 144 sources the natural attack
entry and captures both wrapper calls' state, stopping at the first fixture-
installed producer.

A prologue-bounded 16-bit disassembly scan found eleven indirect far-call
instructions across descriptors 12, 22, and 23. Their operands are
`DS:6EDE`, `DS:6E3A` (including indexed `DI+6E3A` calls), `DS:6D74`, and
`DI+6B94`. Their direct writer/table mappings select descriptor 22 or 13
procedures, or descriptor-12 selector-`0x65` entries. None is an indirect
callsite to descriptor-23 procedure `0x01A8`; `[DI+6B94]` is its downstream
callback dispatch. Thus the bounded overlay far-call census exposes no fixed
or indirect far callsite which feeds index 7 to the wrapper. The mode-4
same-descriptor near-call route passes index 7 at `0x34495` when its local
flag is set. An earlier call at `0x3420F` could clear a nonzero
`DS:0x713C` through the installed `0x65:0x228` callback; whether both calls
execute with the same live DS and expected table remains unproven.

The static table route can reach `0x65:0x43` only when the wrapper receives
index 7 and `DS:0x713C==0`; fixed and indirect far callers do not show a
producer, but the guarded mode-4 near call at `0x34495` can supply index 7,
possibly after its earlier `0x3420F` call clears the gate through `0x65:0x228`.
Task 144 traces both guards, original dispatcher inputs, intervening gate
writes, DS/table identity, and natural reachability; FDF2 remains a separate
join unless the trace supplies it. The descriptor-12
`[DS:6EDE]` candidate remains distinct: its direct writer stores
`0xBA:0x0101` (descriptor 22 procedure `0x320F`), with the runtime DS join
unproven. Map bytes, party records,
positions, workspaces, and allocator state in Tasks 134–136 remain fixture
inputs unless separately sourced from original code. No DOSBox or GUI was
used.

### Task 145 fixture provenance check

The standing `test_mode4_callback_receives_originally_allocated_owner_context`
fixture calls F273 to allocate a context, then invokes `0x14F24` directly;
its held CoK party records are inputs to `Member`, not a retail caller trace.
The run previously recorded above reaches `0x34495` but does not enter
`0xC572`, `0xD270`, or the natural `0x3420F` branch.

The available `tools/probe_cok_combat_setup.py` is another distinct route. It
starts at `0xAEC9`, explicitly labels its party chain as a synthetic held
CHRDATA4 member, and installs the source-proven startup clear for
`DS:6DA2..6DE3`. Running it headlessly with `python -m
tools.probe_cok_combat_setup` stopped at the first uninitialized read: START
image `0xAF43` executes `LES DI,[BP+6]` and reads linear `0x5EEAA` (`DS=0x5000`,
offset `0xEEAA`). The call frames lead through descriptor 105 procedure 3
(`GAME.OVR:0x3CEBC`) and descriptor 94 procedure 1 (`GAME.OVR:0xFDF2`) back to
the manually entered `0xAEC9` procedure. It recorded no attack helper entries
and no wrapper calls. This result identifies a missing input in that setup
probe; it does not show that FDF2 is on the natural attack route. Task 145
therefore remains active at the caller-entry provenance boundary. No DOSBox
was launched.

Static caller tracing also identifies a more direct candidate root for Task
145. In descriptor 8, the routine beginning at `0x0BF73` reaches the action
byte at `[BP-0x2A]`, filled from the prompt
selection result at `0xC09A`; when it equals `'A'`, the branch at `0xC1A3` calls
local helper `0xC35B`, then reaches descriptor 9 procedure `0xC572` through
`0x5B:0x25` at `0xC1D1`, passing `[BP+0xA]` and `[BP+0xC]` (far-pointer
words). This is a candidate user-selected combat-action entry, not runtime
evidence that the prompt returns A for a natural attack or that the pointers
are initialized retail members. The descriptor-8 public procedure table has
entries at `0xAD57`, `0xAEC9`, and `0xC3AA`; `0xBF73` is private. A broader
corrected scan found the direct near call at `0x0B452`: its preceding branch
tests action byte AL for `'D'` at `0x0B442`, then passes `[BP+6]`, `[BP+8]`, and
a local result pointer into the private routine. The prior note that a whole-
overlay scan found no E8 caller was wrong: it scanned for `0xBF72`/`0xBF74`,
not the actual prologue at `0xBF73`, and is retracted. This direct edge fixes
the immediate dispatch question but does not source the command byte or far
pointer values. The parent chain is statically present: descriptor 2 calls
descriptor-8 public procedure `0xAEC9` at `0x24CA`; its list builder `0xAFF7`
clears `DS:0x71AE..0x72CD` and seeds `DS:0x71AE` from active pointer
`DS:0x609A`. Procedure `0xAEC9` then calls private iterator `0xB162` at
`0xAFA6` for each nonzero list entry. `0xB162` calls menu routine `0xB2CA` at
`0xB27F` unless the target's context byte `(body+0x183)+3 > 0` and body
`+0x18B != 0`,
in which case it instead calls descriptor-9 procedure `0xC572` at `0xB271`.
Within `0xB2CA`, selected action `'D'` at `0xB442` calls `0xBF73`; that
routine's later action-`A` branch at `0xC1A3` calls `0xC572` at `0xC1D1`.
Thus both fixed routes to `0xC572` have a static parent chain from `0xAEC9`.
The existing `0xAEC9` Unicorn probe uses a synthetic held party and stops in
FDF2 support at the first uninitialized read before it reaches `0xAFA6`; it
does not supply the member-list pointer or execute either `0xC572` call.
Task 145 closes the static caller-chain audit at this explicit fixture
boundary. It does not source live member/list values or reach either wrapper;
Task 148 owns the remaining runtime event-frame and setup-state join.

### Task 145 bounded caller-chain result and Task 146 static trace

The descriptor-2 byte dispatcher around `0x42D6..0x4447` selects private
routine `0x2288` when AL is `0x24` (`0x4325..0x432A`). Routine `0x2288` calls
descriptor-8 public procedure `0xAEC9` at `0x24CA` after setup calls and state
checks. This is a candidate real caller frame; the event-byte producer and
setup-global values have not been sourced. The existing probe starts directly
at `0xAEC9` and cannot decide whether `SS:0xEEAA` is merely a fixture artifact.
Task 145 closes the static caller-chain audit at that boundary. Task 146
closes the static caller/resource contract; Task 148 follows the runtime event
byte `0x24` and `0x2288 -> 0xAEC9` frame, recording list and pointer inputs
only where headless fixtures provide provenance.

Task 146's initial static pass ties the event byte to the `0x2288` dispatch.
Routine `0x4449` reads `DS:0x4B43` as an index, loads the far pointer at
`DS:0x4B34`, reads the selected byte at `ES:(DI-0x8000)`, stores it in
`DS:0x72E7`, and calls local dispatcher `0x41D9` (`0x4474..0x4486`). The
dispatcher compares `DS:0x72E7` against `0x24` at `0x4325` and calls `0x2288`
at `0x432A`. `0x4449` also passes the selected byte and a stack buffer through
descriptor `0x124` procedures, and is called from routines at `0x3D83`,
`0x3D9F`, and `0x44FD`. The pointer at `DS:0x4B34` is assigned at `0x10220`
from allocator procedure `0x0A46:0x023F` after requesting `0x1E00` bytes; the
buffer is zeroed by setup at `0x104EC`. Descriptor-4E public procedure `0x52`
resolves to helper `0x9847`. Its operation lookup at `0x9159` can return 3;
that branch writes caller byte `[BP+6]` into the far buffer at index `[BP+8]`
through `DS:0x4B34` (`0x98F4..0x9909`). This locates a byte setter, not its
runtime callers or data source. The cursor/data producer and setup-global
lifecycle remain open. Continue tracing setter callers and their arguments
before a Unicorn replay; do not assume a `0x24` byte or retail frame. No DOSBox
or GUI was launched.

Further static tracing shows `0x9159` classifies addresses `0x8000..0x9DFF`
as the `DS:0x4B34` buffer region (class 3). There are 36 encoded calls to
descriptor-4E procedure `0x52` in descriptor 2. In routine `0x2D51`, helper
`0x4E:0x4D` constructs a 16-bit candidate address from bytes at
`DS:0x73B1`/`DS:0x73F1` (`0x2DB4..0x2DB9`); later calls at `0x30A5` and nearby
sites pass that local address to the setter with values 1, 2, or 3. A separate
routine at `0x1EA9` also builds candidate addresses from adjacent
`DS:0x73AE..0x73B3` and `DS:0x73EE..0x73F3` pairs. The indexed writer is now
identified: descriptor-2 opcode-29 dispatch at `0x4355` calls handler
`0x2D51`; that handler requests 14 operands through `4E:2A`, which resolves
to parser `0x8A73`. The parser writes operand type to `DS:[0x736D+i]` at
`0x8AAB`, its second encoded byte to `DS:[0x73ED+i]` at `0x8AC6`, and its
third encoded byte to `DS:[0x73AD+i]` at `0x8B02` for types 1/2/3 or `0x8B66`
for type `0x81`. Thus index 4 directly populates `DS:0x73F1` and
`DS:0x73B1` when the relevant operand uses a three-byte form. Handler
`0x2D51` consumes the pair through `4E:4D` at `0x2DB4..0x2DB9`, saves the
result at `[BP-0x43D]`, and passes it to `4E:52` at `0x30A5` and nearby sites.
The setter's `0x9159` classifier can distinguish event-buffer class 3, but
the retail opcode-29 occurrence, operand-4 bytes, actual destination class,
and downstream combat reader are not yet joined. The held START data image
still ends at DS offset `0x43BF`; these lanes belong to runtime cache state,
not that static image region. Task 149 traces the operand/cache-to-setter
contract; Task 148 owns runtime loader, cursor, and dispatcher evidence.

### Descriptor-2 event-buffer loader caller

The upstream caller for one buffer-load path is now static-source-backed.
Descriptor-2 public procedure `0x3C28` resolves to file offset `0x4594`.
When its state checks take the zero-result branch, it sets
`DS:0x8846=0x24` as ECL block ID 36 (`0x45E1..0x45F4`), then calls descriptor-4E procedure
`0x34` at `0x4629`. Procedure `0x34` resolves to file offset `0x8DA2`: it
clears the `0x1E00`-byte buffer at `DS:0x4B34`, calls resident START helper
`0x069C:0x088E`, and copies the returned payload into the buffer at
`0x8E45..0x8E5A`. It then calls `0x4E:0x2F` and starts event processing at
`DS:0x4B41` through `0x4449` (`0x462E..0x4638`). The resident helper address
maps to unpacked START image offset `0x724E` (physical `0x1724E` after
relocation at load segment `0x1000`). The caller passes ECL block ID 36. Its
preceding `A46:0x0AC4` calls prepare helper name arguments from descriptor-4E's
segment-relative offsets `0x358` and `0x35C`, whose length-prefixed bytes are
`ECL` and `.dax`; the resolved helper ABI places the name pointers at
`[BP+0x14]` and `[BP+0x10]`, ID at `[BP+0x0E]`, and output pointers at
`[BP+6]` and `[BP+0x0A]`. CoK's new-game initializer sets area selector
`DS:0x5782=1`, and this loader sets path selector `DS:0x5884=0`, giving the
source-derived candidate `ECL1.DAX#36`; the actual filename lookup remains
unverified. Task 146 closes at this static
caller/resource contract; Task 148 owns the runtime helper read and
buffer/cursor identity.
the existing direct-entry probe still cannot distinguish caller-frame effects
at `SS:0xEEAA`.

### Task 148 opening headless probe

The existing full-START Unicorn harness was run with its DOS file shim, first
to 8,000,000 and then 40,000,000 instructions, using an 80-Enter input script
and its default key rearm. It applied no event-buffer patches and did not call
`0xAEC9` directly. It opened and read retail assets including `8X8D1.DAX`,
`COMSPR.DAX`, `SKY.DAX`, `CURSOR.DAX`, `MIDI.DAX`, `SOUND.DAX`, and
`TITLE.DAX`; the keyboard shim consumed only the first Enter. The 40-million
run stopped at `CS:IP=0x127F:0x1220` in repeated title-art rendering. A
separate 10-million-instruction run with `key-rearm-after=1` consumed all 80
Enter values in the BIOS read loop at `0x1962:0x031D` and stopped in the same
title renderer at `0x127F:0x06DC`. A 10-million-instruction Escape-plus-Enter
run also stayed in that loop. None opened or read `ECL1.DAX`; these bounded
runs do not execute or falsify the new-game loader path. Logs were written
outside the repository under `C:\temp\goldbox-task148-*.log`.

Further full-startup retries with the same key shim are not useful: its key
cadence either supplies one key or drains the whole queue in one input loop.
A direct helper fixture then applied the resident initializer, invoked original
`0x169C:0x088E`, and supplied length-prefixed `ECL`/`.dax` strings, ID 36, and
area/path selectors `1/0` through a manually constructed ABI frame. The helper
attempted `ECL.DAX` twice, then reached the BIOS input loop before returning;
the output slots remained at their initial zero values. It did not preserve
descriptor-4E's caller frame or prove the
name-pointer ordering and call-specific path state, so this is a failed fixture
and does not confirm or reject the `ECL1.DAX#36` candidate. No payload bytes were
read. Its log is `C:\temp\goldbox-task148-helper-fixture.log`.

The next bounded step must recover descriptor-4E `0x34`'s exact caller frame,
including its stack-resident string buffers and call-specific DS/path-table
state, before repeating the helper read. Neither a helper fixture nor this
failed lookup proves that the event dispatcher or combat route was naturally
reached. The existing direct-entry `0xAEC9` probe still stops at `0xAF43` on
unresolved `SS:0xEEAA` before list iteration.

### Task 147: combat context byte lifecycle

The turn-order and attack guards use byte `+3` of the per-member context
pointed to by body `+0x183`. In `0xAFF7`, the list builder dereferences the
active member's context at `0xB02E..0xB036`, saves context `+3`, and compares
it with already inserted members' context `+3` at `0xB069..0xB076`; ties use
the `0xDB:0x4D` helper at `0xB08F..0xB09C`. The iterator `0xB162` checks the
same context byte at `0xB19C..0xB1A9` and `0xB251..0xB25E`. Its later attack
branch at `0xC737..0xC741` repeats that context check before testing body
`+0x189` and calling `0xD270`. These are static consumers; they do not source
the byte's value.

Original setup `0xF273` allocates `0x16` bytes per member, installs the far
pointer at body `+0x183`, and clears the 22-byte payload (`0xF2A3..0xF2CA`),
so the initialized context byte is zero. A separate routine beginning at
`0x14D6A` directly obtains that context pointer from `[BP+6]+0x183`; when body
`+0x189` is nonzero, it writes context `+3` at `0x14E40` from the `0xDB:0x4D`
result plus an `0xE6:0x57` result, first floors the value at 1, then may
subtract 6 based on `DS:4B2C+0x596` and clamps it to `0..20`
(`0x14E20..0x14E91`). When body `+0x189` is
zero, it clears context `+3` at `0x14E96`. The validated relocated-call map
finds one fixed public-stub caller: descriptor-8 routine `0xAEC9` calls
`0x88:0x25` at `0xAF5C`, which resolves to descriptor-13 procedure 0 at
`0x14D6A`. It passes the current far-linked member pointer from local
`[BP-5]/[BP-3]`; the list head comes from `DS:0x609A`, and the next member is
read at body `+0x17F`. The loop at `0xAF4E..0xAF74` ends on a null pointer,
then clears the adjustment mask at `0x4B2C+0x596` and calls `0xAFF7` at
`0xAF82`. Thus the writer is statically ordered before this list build. Task
118 independently captured the original held-party head at `DS=0x1BC6`,
`DS:0x609A/0x609C=0x6109:0x0000`, with six source-matched linked records.
The separate `probe_cok_combat_setup.py` fixture installs a synthetic
`DS=0x5000` party and stops at **START.EXE:0xAF43**, where a bounded-copy
helper reads an unresolved null source pointer at `SS:0xEEAA`; that stop is
not the OVR instruction at `0xAF43` (the OVR head load begins at `0xAF41`),
and it does not show an unset `DS:0x609A`. The fixture reaches neither the
writer nor list builder with retail continuity. Other direct
mutations include the `0x14` assignment at `0xB4F8`, action-`D` assignment to
1 at `0xC0CC`, and clear at `0xD2BD`; these occur later in the statically
mapped menu/attack paths. The four previously attributed descriptor-12 calls
(`0x1134A`, `0x12510`, `0x127FE`, `0x1443B`) are `DB:25` callsites, but
`python tools/disasm_cok.py resolve 0xdb 0x25` resolves that stub to descriptor-
23 procedure `0x34096`, not the context writer. Task 147 closes this static
caller/ordering correction; Task 150 traces held-party continuity and the
runtime writer-to-list sequence. Do not seed a positive byte to pass these
guards. Stop at the first fixture-installed producer if the source-backed
route cannot reach a writer. Task 148 separately owns the runtime event/ECL
dispatch frame; neither task alone proves natural attack reachability. Static
disassembly reviewed with `tools/disasm_cok.py`; no DOSBox or GUI was used.

### Task 147 fixed-caller correction

The earlier survey correctly identified four `DB:25` sites and their local
guards, but incorrectly assigned the target to `0x14D6A`. The validated
resolver reports `DB:25` as descriptor 23 stub index 1, procedure offset
`0xEB`, target `GAME.OVR:0x34096`. The context writer at `0x14D6A` is
descriptor 13 procedure 0, reached instead by descriptor-8 `0x88:0x25` at
`0xAF5C`. The writer's two arguments are the current list node far pointer
from `[BP-5]/[BP-3]` in `0xAEC9`; the loop follows member `+0x17F` and runs
before `0xAFF7` at `0xAF82`. Task 118 separately captured the original
held-party chain at `DS=0x1BC6`, head `0x6109:0x0000`, with all six linked
records. The direct-entry `probe_cok_combat_setup.py` run instead installs a
synthetic member at `DS=0x5000` and stops in a START bounded-copy helper at
`START.EXE:0xAF43` on a null stack source pointer at `SS:0xEEAA`; this is not
an unset party-head observation, and its CS:IP must not be conflated with OVR
`0xAF43`. Task 150 joins the captured held-party state to combat setup,
context allocation, and the writer-to-`0xAFF7` path. The four unrelated
`DB:25` callsite predicate notes above remain valid descriptions of those
callers, but provide no evidence about the context writer.

### Task 150 opening census — `DS:0x609A` producer

Direct retail-byte stores to the far-pointer words are now classified. Reset
paths clear `DS:0x609A/0x609C` at `0x10609/0x1060C` and
`0x10A46/0x10A49`. List-management paths replace the head at
`0x1C41A/0x1C41D`, `0x1C48F/0x1C492`, `0x1C53B/0x1C53E`,
`0x1C58B/0x1C58E`, and `0x23E0D/0x23E10`. The first-member insertion is
`0x1F064`: when the head pair is zero it copies argument `[BP+6]/[BP+8]` to
`DS:0x609A/0x609C` at `0x1F082/0x1F085`; otherwise it traverses member
`+0x17F/+0x181` and links the new pointer at the tail. It also sets the
current-tail pointer `DS:0x6096/0x6098` from that argument. This is the direct
head producer, not the startup reset.

The four fixed entries into `0x1F064` are local calls at `0x1F01A` and
`0x1F674`, plus validated `0x9E:0x52` calls at `0x23AE6` and `0x23C18`.
`0x1F674` follows a successful `0x69C:0x4C1` check, allocates a `0x199`-byte
record through `A46:0x23F`, calls original record loader `0x1E8C0` with that
buffer and the selected input, then appends it. The existing held-save route
shows this is part of original character-data loading; it should not be
reduced to an unqualified template copy. At `0x23AE6`, the far pointer in `[BP-0x14]` is appended only in the
empty-list branch; at `0x23C18`, it is appended after the routine's candidate
and count checks. The caller identities/input provenance and their connection
to the source-backed `0x2288 -> 0xAEC9` event path remain unresolved. Thus the
head's retail producer is located statically, while its first runtime member
and the Task-150 writer-to-`0xAFF7` trace are not yet captured. The local xref
and resolver commands were `python tools/disasm_cok.py xrefoff 0x609a`,
`xrefoff 0x609c`, and `resolve 0x9e 0x52`; no DOSBox/GUI was used. Task 118
already captured the original held-save route at `DS=0x1BC6`: head and tail
both `0x6109:0x0000`, followed by six linked nodes matching `CHRDATA1.SAV`-
`CHRDATA6.SAV`. The remaining gap is continuity from that saved-party/menu
state into combat setup and its context writer, not discovery of a runtime
list head. The separate manual `0xAEC9` probe uses a synthetic `DS=0x5000`
party; it stops at START.EXE `0xAF43` on `SS:0xEEAA`, not on an unset list
head. Task 150 now owns the held-party-to-combat-context continuity join.

### Task 150 — source-level `DS:0x6B2C/0x6B2D` reducer

The `0xF991` placement routine calls `0xE6:0xB6` at `0xF997`, resolved to
`GAME.OVR:0x38C30`. That helper clears bytes `DS:0x6B2C` and `DS:0x6B2D`
at `0x38C36/0x38C3B`, then walks the current far-linked member chain rooted at
`DS:0x609A/0x609C`. For each non-null member it checks body byte `+0x189`; if
nonzero, it loads body byte `+0x18A` and increments
`DS:[0x6B2C + signed(value)]` at `0x38C55..0x38C6B`: instruction `0x38C68`
is `CBW`, which sign-extends AL. It follows each member's next pointer at
`+0x17F/+0x181` and returns at a null link. Values `+0x18A==0` and `==1`
increment `DS:0x6B2C` and `DS:0x6B2D` respectively. The routine does not
constrain the category byte to 0/1; other values address surrounding DS bytes,
and the routine clears only `0x6B2C/0x6B2D`. Do not interpret these two bytes
as complete category counts without source-backed member values.

This gives Task 150 a byte-backed reducer for the gate inputs, but not their
values on the held-party combat invocation. The held-save list snapshot proves
six nodes at an earlier point; the synthetic direct-entry probe does not carry
that chain through `FDF2/F273/F991`. Preserve each node's original `+0x189`
and `+0x18A` values and capture the resulting indexed count bytes only when a
source-backed held-party route reaches this call. No value is inferred from
the six-node snapshot, and no DOSBox/GUI was used.

AEC9 consumes these bytes after its `FDF2` call. At `0xAEEA..0xAEF8`, it sets
local `[BP-1]` to 1 when `DS:0x6B2C==0` **or** `DS:0x6B2D==0`; that arm
later branches to `0xAFEA`, bypassing the context-writer loop. The writer loop
is reached only when **both** precheck bytes are nonzero. Before testing this
saved gate, AEC9 always walks the member chain and calls `DB:0x34` with
operation `0x18` for each member (`0xAF09..0xAF31`). Only after the walk, if
the saved gate permits continuation, it calls `0xE6:0xB6` again at `0xAF3C`
to rebuild the indexed bytes before walking the chain through writer
`0x88:0x25` at `0xAF5C`. This second reducer does not re-test the gate; the
precheck decides whether the writer loop runs, while refreshed state may feed
the writer. Both count snapshots and the exact writes performed by operation
`0x18` remain unresolved. Task 151 follows that operation's effect-`0x52`
processing and possible member-pointer/context mutations. Do not treat the
precheck alone as proof that the per-member writer ran.

## `DS:0x713C` direct-reference inventory

The immediate-reference scan finds three direct zero writes at
`0x106D4`, `0x10B0C`, and `0x14476`; direct one writes at `0x28B2B` and
`0x31282`; and the wrapper's compare at `0x34158`. The first two zero writes
are in separate reset/setup paths; `0x14476` is descriptor-12 procedure
`0x3888`. This is the callback installed at `DS:0x6D74` as `0x65:0x228`;
when the wrapper sees a nonzero gate, it calls that pointer, and procedure
`0x3888` clears the gate at entry before dispatching onward to `DB:0x2F` or
`DB:0x57`. The one writes occur in descriptor 19 and descriptor 22 callers
before their calls to `0x01A8`. This inventory bounds direct immediate
references only: it does not yet show which setup path is active for the
mode-4 attack, whether aliases/computed writes exist, or the runtime DS value
at the wrapper. Task 144 must join the applicable lifecycle rather than infer
the gate from any one initializer.

## Natural attack-entry callers located for Task 144

The validated relocated-call map resolves `0x88:0x5C` to descriptor 13,
procedure `0x1A45` at `GAME.OVR:0x167AF`. It finds two fixed far callers:
descriptor 8 at `0x0BF1C` and descriptor 9 at `0x0D67D`. The first passes a
far pointer sourced from its `[BP+6]` argument and zero candidate-pair
words. The second passes a stack-local far pointer and a candidate pair that
is computed and gated earlier in that caller. Descriptor 9 is the stronger
attack-resolution candidate, but neither fixed callsite is yet joined to a
natural mode-4 invocation. Task 144 follows both entry routes into `0x167AF`
and the relevant one through `0x162E3` and `0x14F24`. These are static fixed-
call edges; no live DS or `DS:0x713C` value has been recorded for either.

### Direct-call fixture dispatch observation

A one-off Unicorn hook was added to the existing direct-`0x14F24` fixture call
(`call_14f24(m, A, B)` after its synthetic allocator/setup). It observed the
helper's `0x34495` callsite with local `[BP-0xE1]=1`, `DS=0x5000`, and
`DS:0x713C=0`; no event at `0x3420F` occurred in this run. At wrapper entry
`0x34153`, the low-byte mode was zero and the low-byte table index was 7. The
stack word was `0x7307` because the caller left a nonzero high byte, but the
wrapper zero-extends the index byte before scaling it. Reading the selected
table entry gave little-endian bytes `43 00 65 00`, i.e. `0x65:0x43`; the
existing callback hook then observed procedure `0x10DF0`. This confirms the
guarded second-call argument/table calculation under the fixture. It does not
capture either static `0x88:0x5C` caller, the natural `0x3420F` branch, startup
DS state, or retail allocator/member inputs; Task 145 closes at this bounded
fixture boundary and Task 148 owns the runtime dispatcher-state join.

### Descriptor-9 attack caller gates (Task 144, closed bounded)

The descriptor-9 public procedure at `0xC572` enters the combat processing
loop at `0xC716`. After its `0x88:0x84` call at `0xC72B`, it enters the
descriptor-9 helper `0xD270` at `0xC755` only when that call returns nonzero,
the context byte at `+3` is signed-positive, and the member body byte at
`+0x189` is nonzero (`0xC730..0xC755`). At `0xC737`, `LES DI, ES:[DI+0x183]`
loads the context pointer; `0xC73C` tests `ES:[DI+3]`. The code reloads the
member body and separately tests `+0x189` at `0xC743..0xC746`. Otherwise it uses
the alternate helper at `0xD6B5`.
The `0xD270` path calls `0x88:0x5C` at `0xD67D` after calculating a candidate
pair and passing E6:`0xED`; an E6:`0xC0` result can clear that pair before the
call. This is the stronger of the two statically identified callers for an
attack-resolution route, but the disassembly does not prove that its predicates
or pair values occur on a natural retail invocation.

The other fixed caller is descriptor 8 at `0x0BF1C`; it passes a target far
pointer sourced from `[BP+6]` and zero candidate-pair words. Both calls resolve
to descriptor 13 procedure `0x1A45` at `0x167AF`, which can reach
`0x162E3 -> 0x14F24`. Task 144 closes this caller-gate census at the static
boundary. Task 145 closes the static caller-chain audit at the direct-entry
fixture boundary. Task 148 follows the runtime event-frame and setup-state path to
determine whether existing headless fixtures can source combat/member
pointers and DS before tracing the effect-7 wrapper gate. No DOSBox or GUI
was used.
