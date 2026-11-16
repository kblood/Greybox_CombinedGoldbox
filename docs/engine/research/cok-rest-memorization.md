# CoK rest memorization: next native boundary

CCECL reads all 58 CoK queue bytes from each selected GBPR record and answers
SPELL using the retail zero-based slot/member convention. GBBOOT now advances
pending memorization during rest, with preparation, hourly phase and per-member
countdowns. GBCP v4 appends eight bytes to persist the latter two across bounded
cold continuations. CoK camp M now provides queue selection/cancellation with
known-spell, eligibility and capacity checks. Rest also completes queued scroll
scribing against GBCP v5 owned inventory; see `cok-scribing-native-plan.md`.
See `cok-memorization-menu-next.md` for the menu's separate execution evidence.

2026-09-08. Read-only observations from the held DOS GAME.OVR and unpacked
START.EXE. No live retail rest trace is claimed; native behavior is checked in
isolated DOSBox fixtures against these static instructions and whole input bodies.
`hackdocs_extracted/CCHFORM.TXT` explicitly describes FRUA in its introduction;
its memorized-spell offsets must not be reused for CoK.

## Native gap

GBBOOT's `auto_seed_party_spells` only handles DoK `.WIZ` files. CoK's existing
409-byte GBPR body supplies CCECL's roster-backed spell queries. GBBOOT schedules
pending memorization but does not yet expose a native memorization menu.
The retained full character body provides storage for the queue; do not invent
a CoK `.WIZ` file or reuse the old small global spell-seed caps as its canonical
representation.

### CoK SPELL return values, independently verified

Dispatch at GAME.OVR `0x4403` compares opcode 0x3B and calls `0x3AF7` at
`0x4408`. The handler reads three operands, walks the party, resets each member's
slot to zero (`0x3B5B`) and compares raw character +30+slot with the requested
byte (`0x3B69`). The bound is slot 57 (`0x3B78`). It stores the slot byte
directly (`0x3BCA`) and the zero-based member byte directly (`0x3BD8`). A miss
sets slot 255; member remains the last scanned member, or zero for an empty
party. It does not clear a pending bit or compact holes. Querying a normal id
does not find its pending high-bit counterpart; querying that exact high byte
does match it. Zero likewise matches an empty queue slot. This is a lookup,
not evidence that the opcode itself casts or consumes a spell.

The old native SPELL implementation's one-based slot convention came from the
CoAB model. CoK roster-backed queries now use this retail-specific convention;
explicit /S and /V probes keep their existing synthetic behavior. DoK compact
rosters are excluded. The standing CCECL effects test checks synthetic and retail
rosters, reordered owners, last slot 57, empty parties, pending bytes, DoK,
legacy seeds, and a count-only seed that must not overwrite actual roster rows.

## Retail fields and order

The rest loop calls `0x2B4FA` at `0x2B7E7`, after the five-minute clock advance
and healing check. It then calls `0x2B5B0` at `0x2B7F0`, before encounter checks.

- `0x2B4FA` walks the party and uses DS:712D+one-based-member as a countdown
  byte. Positive counters decrement (`0x2B531`). When zero, and character byte
  +88 is zero (`0x2B546`), it tries `0x2B3CF` first, then `0x2B30D` if the first
  returns zero. The returned byte is multiplied by three at `0x2B57E..0x2B58F`
  and stored as the member's next countdown.
- `0x2B30D` scans indices 0..57 (`0x2B31B`) at character +30+index
  (`0x2B337`). Values above 127 are pending. In completion mode it subtracts
  0x80 (`0x2B372`), displays the Pascal text **"has memorized"** at `0x2B2FF`,
  and switches to look-ahead mode. Look-ahead masks bit 7 and reads the byte at
  DS:31B4 + id*16 (`0x2B35B..0x2B35F`), returning the next pending spell's value.
- `0x2B3CF` traverses the item list at character +323/+325. It inspects three
  item bytes (+60..+62) above 0x80 after BA:3E's predicate. Its completion path
  writes one at character +98+spell-id (`0x2B48B`), calls BA:43, and displays
  **"has scribed"** at `0x2B3C3`. This is a separate scribing path, not simply
  another range of the memorized-spell queue. Its item predicate and consumption
  helper still need verification before native scribing is implemented.
- `0x2B5B0` increments a rest-local counter. At 12 (`0x2B5BF`) it resets that
  counter and decrements positive character +88 (`0x2B5F5`). When +88 reaches
  zero, it calls those two helpers in look-ahead mode and seeds the per-member
  countdown with three times the returned value (`0x2B631..0x2B645`). Thus +88
  behaves as a whole-hour preparation delay, separate from per-spell ticks.
- On starting the rest routine, `0x2B6CA` zeroes the per-member countdowns.
  Therefore already-zero +88 is a distinct first-tick boundary: do not assume
  every memorization requires a newly imposed fixed delay. Verify the caller
  that establishes +88 and any menu preprocessing before choosing UI behavior.
- `0x1AC6B` clears pending (>127) queue entries and sets character +88 to zero
  (`0x1ACA3`). Its caller/meaning remains to be resolved.

The level-like table is in unpacked START at `0xBC60 + 0x31B4 = 0xEE14`.
Observed row-leading bytes include id 1 ->1, id 40 ->3, id 57 ->6. Its apparent
end is adjacent to the clock table at DS:3874 (108 sixteen-byte rows); verify
the valid spell-id bounds and table initialization before embedding a table.
The six held SAVs have byte +88 zero and no high-bit pending queue entries.
Several contain low-byte ready ids in +30..+87, including repeats; these are
independent corpus evidence that spell counts/order must be retained.

Further inspection located the preparation-delay setter at `0x1A6A0`, called
from `0x1B59A`. It scans pending memorized/scroll entries and their table values.
It sets a four-hour delay when queued work exists (`0x1A7B3`), raises this to
six if either queue's maximum level exceeds two (`0x1A7B7..0x1A7C3`), then
writes character +88 (`0x1A7CD`). Pending memorized entries with a zero table
value are treated as level one in this estimator. This closes the origin of
the 4/6-hour value; the surrounding menu's commit/cancel timing still needs
verification before implementing queue selection. `analyze_cok_rest.py` now
pins the query, queue, countdown and setter instructions, with mutation tests.

### Rest action caller boundary

Further read-only disassembly resolves AF:2A to `0x2B69C`: all three AF
overlay stubs intersect at the unique GAME.OVR base `0x2A85E`. The other two
targets are AF:25 -> `0x2ADA7` (clock) and AF:2F -> `0x2A85E`.

The party helper at `0x1B573` calls the preparation setter for every member
(`0x1B59A`) and takes the maximum returned duration. The setter returns
15 times the sum of queued memorization and scribing levels, plus 60 times
the preparation hours (`0x1A7D1..0x1A800`). The caller splits that maximum
into hours at DS:7126, tens of minutes at DS:7124 and minutes at DS:7122,
then invokes AF:2A at `0x1B5F9`. On return it clears 14 bytes at DS:7120.
Two inspected menu branches compare the input with ASCII R (`0x1C342`,
`0x1D422`) before calling this party helper (`0x1C34C`, `0x1D431`).

Thus the observed R paths recalculate preparation before entering rest;
the setter is not just a queue-selection commit operation. At rest entry,
`0x2B6A6` clears the local hourly phase and `0x2B6CA` clears each member's
countdown. A native cold checkpoint continuing an interrupted action must
be distinguished from the player starting a fresh R action. Menu labels,
all alternate callers, spell-table bounds and scroll consumption still
require verification. These new caller observations are static evidence,
not an executed retail trace or new native behavior.

The M branch at `0x1C324` enters `0x1B706`. Its spell selector calls A8:5C
at `0x1B738` and `0x1B7DA`; all 14 observed A8 stubs resolve to unique base
`0x26D6B`, placing this selector at `0x2A257`. Its mode strings include
"in Grimoire" (`0x2A20E`) and "to Memorize" (`0x2A239`). It delegates list
construction to BA:2A (`0x2E72C`) and selection to BA:25 (`0x2DE85`). Follow
those list builders to establish allowed ids and availability, rather than
inferring a valid-id range from the neighboring clock table.

## Next implementation and probes

The grimoire builder is now pinned: mode one scans ids 1..107 (`0x2E832`,
`0x2E87D`), consulting character +98+id (`0x2E846`). The 108 level bytes from
DS:31B4+id*16 are compared against the native table and a fixed corpus hash.
Native tests include level seven and ids with level zero. The latter matter:
`0x2B324` continues scanning while the looked-ahead level is zero, so a zero-level
pending entry can wait for a later nonzero entry's countdown before it completes.
Completion itself always selects the first pending byte. The estimator's
zero-to-one coercion does not apply to this countdown helper.

BA:3E resolves to `0x33333`: item byte 46 must be 39 or 40. BA:43 resolves to
`0x33368`; it finds the last matching masked id among item +60..+62, clears
that byte, decrements item +47 and calls E6:70 if the result is below 100.
The staged CCINV consumer now implements this operation. Original unlink/free and consumer
execution are now guarded by `tools/test_cok_inventory_retail.py` (15 whole-list
removal cases and 84 consumption cases). Native rest plans scribing before
time or timer mutation. GBCP v5 embeds complete owned inventory;
fresh sessions and legacy v1-v4 loads import STF files with cloud fallback.
See `cok-inventory-checkpoint-next.md` for storage evidence and remaining gaps.

Pending-to-ready transitions and GBCP v4 phase/count persistence are implemented.
Fresh camp/interactive R resets the action; `/5 /2 N` continues a saved bounded
action. The native memorization menu now uses the verified grimoire predicate
and class/level capacity rules. Scribing consumption now uses the owned
inventory, retaining complete item records and verified removal behavior.
Synchronizing item queries with that inventory remains open.

Tests should cover +88 one-hour boundary (11/12 ticks), spell-level countdown,
already-zero preparation delay, consecutive pending entries, repeated ready
copies, owner isolation, scribing priority and interruption/resume. Require
full-body preservation outside verified changes, and a native spell query after
completion. UI selection, known-spell flags and memorized spell consumption are
separate required behavior, not established by clearing one pending bit.
