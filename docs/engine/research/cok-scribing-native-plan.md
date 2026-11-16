# Native CoK scribing integration

2026-09-08. Staged DOS implementation after the 223 original-code/model checks
in `tools/test_cok_scribing.py`. Implementation: `e86f6e5`. The full DOS
creation/rest suite passes, the clean flow sweep retains 19 PASS /8 known FAIL,
and the armed corpus reports 2197 passed /2 inherited browser failures /1 skip.
Final related gates are recorded in the handoff.

## Required behavior

Use `tools/cok_scribing.py` for the verified per-member scan and preparation
setter. Keep scrolls ahead of memorization. Share the completion/lookahead flag
between both scans: completing a scroll must not also complete a memorized
spell merely because the scroll scan returned level zero. Preserve original
countdown order, including later slots of an item removed during that scan.

Preparation uses separate byte-wrapped sums for memorization and scrolls.
Only memorization coerces level zero to one. A wrapped sum can eliminate the
four-hour preparation delay, while maximum level above two still forces six.
Keep the existing 12-tick hourly phase and three-ticks-per-level countdown.

GBIV record order is authoritative. Preserve opaque pointer bytes in surviving
stored records; the original STF loader rebuilds runtime links in file order.
Update the completed spell's known byte and the last matching masked scroll
slot, decrement charges with byte wrap, and remove the record below 100 charges.
Retain presence and SAVE/cloud source identity even when the last item is gone.

## Implemented helper boundary

`CCINV R inventory request response` uses GBLR v1: a 16-byte header, padded
2476-byte GBPR, eight learning-state bytes, six scribed ids and six memorized
ids, 2512 bytes total. Header words at 4/6/8 are version 1, mode 0 preparation
or 1 tick, and length. Request flags at 10 are zero. Response flags use bits
0..5 for changed inventory owners and 8..13 for remaining pending-scroll owners.
The u32 CRC at 12 covers the entire packet with that field zeroed. Private
request/response paths must be distinct from each other and the inventory/stage.
GBBOOT uses `_GBLEARN.INP`, `_GBLEARN.OUT`, `_GBINV.BIN` and `_GBINV.NEW`.

The pending-owner mask keeps ordinary countdown ticks in GBBOOT. CCINV is
called when a scroll owner reaches a due scan or finishes preparation.
`CCINV W inventory decimal-mask` stages changed retail STF files, then publishes
them with backups and attempts rollback if a later publication fails. The
existing `A` operation activates the validated learning inventory stage.

The staged learning operation's versioned request carries
the selected GBPR, eight learning-state bytes and preparation/tick mode.
The response carries updated learning fields and per-owner completion events.
Validate the entire inventory and request before publishing any response.
An inventory mutation produces an unpublished GBIV stage; no active party,
clock, inventory or external STF changes occur during planning.

Use a streaming pass to calculate per-owner results and capture at most one
changed 63-byte record per owner. If records changed, a second streaming pass
copies or removes those records into the stage. Avoid a new inventory cap and
avoid rewriting the inventory when there is no consumption.

Split native timer preflight from timer mutation. The tick order should be:
lunar capacity check, timer preflight, learning plan/response validation,
inventory activation, then the already-validated timer/clock/healing changes
and application of the planned learning fields. Merge only queue, known-spell,
preparation and learning counters; never overwrite HP or timer-derived changes
with the earlier request's complete character snapshot.

At persistence, export changed low-numbered owners to their recorded SAVE/cloud
STF location, including empty files. Native-created owners remain roster/GBIV
owned, matching existing SAV writeback scope. Whole-file temporaries and backups
must retain the previous file on failed publication. Cross-file crash atomicity
is separate from the existing single-file checkpoint guarantee and must not be
implied. Owned item-query seed synchronization remains a separate required
inventory integration task.

## Acceptance

Run exact DOS cases for completion/lookahead, zero-level and duplicate slots,
charge boundaries, owner isolation, lossless record removal, source export,
preparation wrap, and interrupted/cold continuation. Add discriminating
file-failure cases before mutation, including a timer-blocked tick that must
not activate a planned scroll consumption. Keep all fixtures in native/build.
Run the creation/rest suite, clean-source 27-flow sweep, full armed Python
corpus and final related/documentation gates; compare known failures exactly.
Commit, push and update the handoff. Website deployment is unnecessary unless
website assets change.
