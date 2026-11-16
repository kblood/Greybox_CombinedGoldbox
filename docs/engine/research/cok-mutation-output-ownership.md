# CoK staged mutation output ownership — versioned design (2026-09-08)

Handoff task 2 (`docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md`): "Define versioned
input/output ownership for RNG, damage and required context before changing the
mutation contract. Keep the effect-7 rejection until these prerequisites are
established." This document is that definition. **It is a design plus a Python
reference model and standing tests, not a native (.asm) engine change.** GBBOOT,
CCINV and CCECL are unmodified by this document; the live mutation contract (GBMR
v1/v2, GBMC, GBIY v1/v2, GBMB v1/v2, all specified in
[cok-mutation-packet.md](cok-mutation-packet.md)) behaves exactly as it did before
this document, including its existing effect-7 rejection at the structural layer
(`tools/cok_item_removal.py`'s `remove_effect` raises `RemovalError` for any applied
kind not in `(0x0C, 0x0E, 0x17, 0x26)`, so effect 7 is rejected before this design's
layer would ever run).

## Why the existing contract cannot carry RNG/damage output today

Every mutation packet field is documented in `cok-mutation-packet.md`. The fixed
13224-byte core has exactly two 2-byte reserved words (offsets 18 and 26) and the
16-byte v2 execution context at offset 32 is already fully assigned by
`native/src/cokyield.inc`'s GBIY v2 fields. There is no spare room in the existing
layout for a versioned RNG/damage output record, and task 1
(`cok-item-removal-native-plan.md`'s "Effect-7 target provenance and output
ownership" section) established that the only currently-verified applied
callbacks (0x0C/0x0E/0x17/0x26) never touch RNG or write damage — they are pure
structural recalculations. Effect 7 is the first callback class this project has
found that consumes RNG (confirmed recurrence `state = (state*0x08088405+1) mod
2^32`, `tools/cok_rng.py:step`) and computes but does not itself write a damage
value (`docs/engine/research/cok-item-removal-native-plan.md`, "Consumer,
confirmed dynamically": `14F24h` writes `DS:56B30` but never the HP field at
struct offset `0x197`; its caller/consumer chain, located 2026-09-08, is
`0150A8h` -> `E6:0xA7` (file `038A7Dh`) — see "What remains before this is
native" item 1 below).

"Current mutation validation keeps paused GBEF/RNG unchanged" (handoff task 2's
own framing) is therefore not an oversight — the contract has never needed an
output slot because nothing authorized to run through it produces one. Adding
RNG/damage support means extending the format, not patching a bug.

## GBOC v1 — the output record

A new, separately versioned, fixed 40-byte record, `tools/cok_mutation_output.py`:

| Offset | Size | Meaning |
| --- | --- | --- |
| 0  | 4 | `GBOC` |
| 4  | 2 | Version 1 |
| 6  | 2 | Length 40 |
| 8  | 2 | Callback id claiming this output |
| 10 | 1 | Write flag: 0 no RNG/damage output, 1 present |
| 11 | 1 | Reserved zero |
| 12 | 2 | RNG draws consumed since the paused GBEF state |
| 14 | 2 | Reserved zero |
| 16 | 4 | RNG state before — must equal the paused GBEF's stored state exactly |
| 20 | 4 | RNG state after — must equal folding `draws` `cok_rng.step` calls over state-before |
| 24 | 2 | Target one-based party ordinal for the pending damage event, 0 if write flag clear |
| 26 | 1 | Damage byte value, 0-255, 0 if write flag clear |
| 27 | 1 | Reserved zero |
| 28 | 2 | Pending DAMAGE queue slot descriptor, 0 if write flag clear |
| 30 | 6 | Reserved zero |
| 36 | 4 | CRC32 of bytes 0..35 |

This is deliberately shaped like the existing GBIY sidecar (magic + version +
length + payload + trailing self-CRC over the preceding bytes) rather than like
GBMR's in-place zeroed-CRC-field convention, because it is a small appended
record, not a resealed multi-kilobyte packet.

**Where it would attach**: appended after the existing 13224-byte core (and, in a
response, before the appended GBIV), gated on a new GBMR header version 3 so that
every existing v1/v2 request/response — the entire shipped, verified subset — is
byte-for-byte unaffected. No existing offset moves. `tools/cok_mutation_output.py`
does not itself attach the record to a `GBMR` buffer; that composition step (and
the corresponding native GBMR-header-version-3 branch in `cokrequest.inc`/CCINV's
`M`/`C`) is unbuilt native work, listed under "What remains before this is native"
below.

## Enforcement rules (implemented, tested at the Python-reference level)

`tools.cok_mutation_output.validate(record, *, gbef_rng, roster_owner_count)`:

1. Exact length (40), magic, version, length field, and trailing self-CRC.
2. All reserved bytes zero.
3. `rng_before` must equal the caller-supplied `gbef_rng` — binds the record to
   one specific paused state so it cannot be replayed against a different
   checkpoint or a resumed-and-advanced VM.
4. If the write flag is clear, every output field (`draws`, `target_ordinal`,
   `damage`, `queue_slot`, and `rng_after` vs `rng_before`) must be exactly zero
   — a "no output" record cannot smuggle a nonzero value past validation by
   simply not setting the flag.
5. If the write flag is set: `callback_id` must be a member of
   `AUTHORIZED_OUTPUT_CALLBACKS`, which **is the empty `frozenset()`** in shipped
   code. No callback — not effect 7, not any other id — is authorized today.
   This is the actual enforcement point for "keep the effect-7 rejection": it is
   not a special case for id 7, it is the absence of *any* id from an empty set,
   which is a stronger and simpler invariant to keep correct than an explicit
   id-7 blocklist would be.
6. `rng_after` must equal folding `draws` (`1..0xFFFF`) applications of
   `cok_rng.step` over `rng_before` — recomputed independently by the validator,
   not trusted from the record, so a record cannot claim an arbitrary RNG
   advance disconnected from the documented recurrence.
7. `target_ordinal` must be a live one-based roster member (`1..roster_owner_count`).

Any failure raises `ValueError` before any state is touched; `validate` never
mutates its inputs and never returns a partial result.

`tools.cok_mutation_output.apply(gbef, parsed)` only ever replaces the 4-byte RNG
field at GBEF offset 126 (`GBEF_RNG_OFFSET`, matching the same offset every other
GBEF fixture in this repo uses — `tools/cok_native_mutation.py:26`,
`tools/cok_mutation_packet.py`'s `area, pc = struct.unpack_from('<HH', effects,
122)` immediately followed by the RNG word). It re-checks that the live GBEF's
current RNG still matches the validated record's `rng_before` (stale-state
guard) and returns the damage/target/queue fields **unapplied**, as a `pending`
dict, rather than writing HP anywhere. See "Why damage is not written here" below.

## Why damage is not written here

Task 1 proved `14F24h` computes damage into `DS:56B30` but never writes the HP
field itself. Its caller/consumer chain (`0150A8h` -> `E6:0xA7`, file
`038A7Dh`) is now located and dynamically confirmed — see "What remains
before this is native" item 1 below and
`docs/engine/research/cok-item-removal-native-plan.md`'s 2026-09-08
continuation section — and its arithmetic is now known exactly:
`clamp(hp-damage, 0)`, with a status/active-flag transition on lethal damage.
That resolves the "which byte, subtract-and-floor vs. some other arithmetic"
half of the open question.

**Queue-vs-direct question, RESOLVED 2026-09-09.** The paragraph that stood
here said the DAMAGE-queue-append half was unresolved and speculatively
proposed deferring GBOC's HP write to "the same mechanism already shipped for
combat damage: the GBMB v2 `damage_watermark` / GBEF DAMAGE-queue-
acknowledgment path" — while flagging, correctly, that this had not been
verified precisely enough to reuse safely. It has now been checked, both
statically and dynamically, and the answer is sharper than "not documented
precisely enough": **that queue is the wrong mechanism to reuse, because it
is not the same subsystem at all.**

`tools/test_cok_effect7_damage_queue.py` (12 tests, new this round) traces
the complete original-binary chain from `14F24h`'s `DS:56B30` write through
`0150A8h` to the `E6:0xA7` HP write and finds **no queue on that side**:

- **Static.** The entire 42-byte instruction span between `call 0x14f24`
  returning (file `0165FAh`) and `call 0x150a8` being reached (`016621h`) is
  pinned and exhaustively accounted for: one `les`, one flag compare/skip,
  and eight `push`-family instructions — two of which are
  `mov al,[0x6b30]` (absolute `0x56B30`) immediately followed by `push ax`.
  There is no write instruction, no call to any other subroutine, and no
  loop anywhere in this span: nothing that could append a record, advance an
  index, or check a watermark. `0150A8h`'s own final dispatch (previously
  disassembled in full, see the plan doc's "located and confirmed
  dynamically" section) forwards straight to `E6:0xA7` the same way.
- **Dynamic.** Running the real `0150A8h -> E6:0xA7` chain three times in a
  row, same target/other/damage, touches the byte-for-byte **identical**
  address set every time, while the target's HP keeps decreasing
  cumulatively (a real, repeated effect with no advancing state anywhere —
  an append-based queue's write pointer would have to move to a new slot on
  the second and third call, and it does not). Restricted to each combat
  participant's own 512-byte struct, the **only** byte ever written by this
  whole chain is the documented HP field — nothing else lands on either
  struct. A companion test proves this identical-set check is not vacuous:
  a damage value with a different ASCII digit count (which the "compose
  combat message" text formatting renders with measurably more transient
  stack scratch) produces a genuinely different write-address set.

So `E6:0xA7`'s direct `clamp(hp-damage,0)` write is not merely "the only
mechanism this project has located" — it is now dynamically shown to be the
**only** mechanism in the traced chain, for this original-binary callback
path, **restricted to `[0x4B49] != 5` and to each combat participant's own
512-byte struct** (narrowed 2026-09-09 by adversarial review, correcting an
earlier "full stop" phrasing here that dropped that scope). `E6:0xA7` also
contains two write blocks gated on `[0x4b49]==5` that land OUTSIDE either
512-byte struct — an overkill-amount write at file `0x038AF7` and a
decrementing counter at file `0x038B45` — which this project's dynamic check
could not see (its write-set scan was bounded to the two 512-byte structs)
and did not investigate further: whether `[0x4b49]==5` is reachable in
ordinary play, and what those two writes do, are both still open. GBOC
therefore must synchronize a future native callback with the direct HP write
site (or an equivalent host-side reimplementation of it) for the scope this
project HAS verified, not with any append/watermark queue, because no such
queue exists on this side to append to — but that verified scope is narrower
than "full stop" claimed.

**The GBMB v2 `damage_watermark` queue is real, but it is a different,
unrelated subsystem — not the one that needed checking here.** Reading
`native/src/ccecl.asm`'s `op_damage` (the ECL opcode `0x2E` "DAMAGE" handler)
and `native/src/gbboot.asm`'s `apply_effect_damage_roster`/
`apply_damage_value_to_roster` shows exactly what that queue is: a native
(clean-room), append-based, multi-entry record array (`fx_script_events`,
20-byte records tagged `002Eh`, drained by GBBOOT reading the exported GBEF
file directly off disk and subtracting `count*sides+bonus` from a GBPR roster
HP byte with clamping to zero). It is populated **only** by the ECL VM's own
opcode dispatch when a script executes a `DAMAGE` statement, and consumed
**only** by GBBOOT's own DOS file I/O, entirely outside any live VM
execution. It has **no relationship** to `14F24h`/`0150A8h`/`E6:0xA7`, which
live entirely inside the original CoK executable's overlay code and never
read or write `fx_script_events`, GBEF's script-event region, or any GBMB
field. Conflating the two — as the retracted paragraph above implicitly did
by calling the ECL queue "the same mechanism already shipped for combat
damage" for an item-removal-triggered effect callback — would have pointed a
future GBMR v3 implementer at the wrong consumer entirely: appending a
GBOC-sourced record to `fx_script_events` would do nothing for effect 7's
target, because nothing reads that array except the ECL-DAMAGE-specific drain
loop, and that loop's own consumer (`apply_damage_value_to_roster`) does not
reproduce `E6:0xA7`'s status/death-transition semantics (it clamps HP but
never sets the status byte at struct offset `0x188` or clears the active flag
at `0x189` the way `E6:0xA7` does on lethal damage) — so even a deliberate,
disclosed reuse of that queue would still need new native code to close that
semantic gap, not just a new record-append call.

**Implication for the GBMR v3 hook point.** Since there is no queue to
append to, a native effect-7 callback's output has exactly two honest shapes,
neither of which this round implements: (1) interpose at the native
reimplementation's own equivalent of `0150A8h`'s call into `E6:0xA7` — i.e.
give the native combat/inventory-mutation path a directly-callable
`clamp(hp-damage,0)` + status/active-transition primitive matching `E6:0xA7`
exactly, and have GBOC's `apply()` call that primitive once validation
passes, rather than writing to any queue; or (2) extend
`apply_damage_value_to_roster` itself with the missing status/death-
transition writes and reuse it, accepting that this widens an existing
native primitive rather than reusing it unchanged. Recording this as an open
design choice, not a solved one: this round establishes only that the queue
option is foreclosed, not which of (1)/(2) the next round should build.
GBOC continues to record damage **provenance** only — callback, target,
value — and does not write HP anywhere; `AUTHORIZED_OUTPUT_CALLBACKS` remains
the empty `frozenset()`.

## What "unsupported/malformed context leaves active state unchanged" means here

Reused, not reinvented: the existing `tools.cok_mutation_packet.response()` /
`tools.cok_party_removal.stage()` pipeline already rejects effect 7 with
`RemovalError` before producing any output, and every existing standing test in
`tools/test_cok_item_removal.py`, `tools/test_cok_party_removal.py`, and
`tools/test_cok_native_mutation.py` already checks input-byte identity on
rejection. `tools/test_cok_mutation_output_ownership.py` (new, see below) adds
the same discipline for the GBOC layer specifically: every rejection case
constructs the record and/or GBEF fixture, asserts `validate`/`apply` raises,
then re-reads the original bytes objects and asserts they are unchanged (trivial
for Python immutable `bytes`, but the test also confirms `apply` never touches
its `bytearray`-backed callers by checking identity before/after a raised
exception path, and — the sharper case — that a well-formed record naming
callback id 7 with **arithmetically correct** RNG-before/after values is still
rejected, proving the block is the authorization set, not the arithmetic check).

## Resume and cold-checkpoint survival — what is proven and what is not

**Proven** (`tools/test_cok_mutation_output_ownership.py`): `apply()`'s RNG write
lands at the exact offset (126) that every other GBEF fixture and consumer in
this repo already reads/writes for the paused RNG state, and a serialize/reload
round trip of the resulting GBEF bytes preserves that field exactly (the
"cold checkpoint" claim in the acceptance criterion, modeled as: a checkpoint
already stores the complete GBEF blob byte-for-byte per `a42459b`'s fix, so a
value at a fixed, already-load-bearing GBEF offset survives serialization by
construction — this is not a new checkpoint mechanism, it is confirmation that
GBOC's chosen offset is the one everything else already treats as durable). The
"resume" half is modeled the same way: CCECL's existing resume path reads the
RNG from this same offset (matching `a42459b`'s GBCR v2 fix, which is exactly
"read/write the RNG at its documented GBEF location across a resume/checkpoint
boundary" for the combat case), so GBOC's `apply()` writing that offset is
consistent with what a resume would already read.

**Not proven, and not claimed**: no native code executes any of this. No DOSBox
session, no `.asm` build, and no native flow-test script exercises GBOC. The
damage/target/queue fields are not threaded through any checkpoint at all in
this design, because there is nowhere in the live checkpoint format
(`GBPS`/`GBCP`) that owns them yet — see "Why damage is not written here." Do not
read this document as evidence that effect 7, or any callback, can be safely
activated; only `AUTHORIZED_OUTPUT_CALLBACKS` (empty) governs that, and no code
change in this document adds to it.

## GBMR v3 hook-point decision and native implementation — 2026-09-09

**Decision: Option 1** (native call-site interposition), landed inside CCINV's
`cokremove.inc` at the `cm_remove_effect` boundary — **not** Option 2
(widening `apply_damage_value_to_roster` in `gbboot.asm`). Reasoning, derived
from reading the actual native code (not the abstract description above):

1. **Byte budget, re-measured before any edit** via
   `pwsh -NoProfile -File native/build.ps1 -Target engine`: GBBOOT
   64,803/65,280 resident (477 bytes free, unchanged from the 2026-09-08
   handoff measurement), CCECL 64,167/65,280 (1,113 free), CCCOMBAT
   63,880/65,280 (1,400 free), CCINV 52,796/65,280 (~12,484 free) before this
   round's edits. CCINV had roughly 25-27x more headroom than GBBOOT, ruling
   out squeezing a new record parser plus RNG-fold/CRC routine into GBBOOT's
   already-tight 477 bytes.
2. **Subsystem mismatch, confirmed by reading `gbboot.asm`, not by this
   document's earlier prose about it.** `apply_damage_value_to_roster` /
   `apply_effect_damage_roster` are a disk-file-driven ECL `DAMAGE` opcode
   (0x2E) queue (`fx_script_events`), populated only by the ECL VM's own
   script dispatch and drained by GBBOOT's own DOS file I/O against the GBPR
   roster file. There is no code path connecting this subsystem to
   `14F24h`/`0150A8h`/`E6:0xA7` at all — "Why damage is not written here"
   above already established this; this round's reading additionally
   confirms it structurally forecloses Option 2 as effect 7's hook point,
   since widening a routine with zero call-graph relationship to the actual
   supplier chain would not authorize anything real, only something
   adjacent-looking.
3. **`cm_body`'s struct layout is the ORIGINAL retail character-body struct,
   not a repacked format** — confirmed by `cm_destroy`'s pre-existing
   `.finish` clears at struct offsets 227/323, which match
   `tools.cok_item_removal.destroy`'s own normalization of those same ranges,
   and by `native/cokremove-driver.asm`'s test fixture sourcing a real
   409-byte `Champions of Krynn/SAVE/CHRDATA1.SAV` body. This means the RE'd
   `E6:0xA7` offsets (HP `+407`, status `+392`, active `+393`) transfer into
   `cokremove.inc` with **zero translation cost** — a property that holds
   only at the `cm_remove_effect` boundary. `apply_damage_value_to_roster`
   operates on a different on-disk GBPR record shape (16-byte header +
   410-byte records) and would need its own offset re-derivation even if it
   were otherwise wireable.

**Explicit scope-down, disclosed rather than hidden.** The full GBMR v3
envelope this document describes elsewhere (a versioned request/response
header carrying an appended GBOC block through the 13,224-byte
`MR_LEN`-fixed CCINV pipeline that `tools/cok_native_mutation.py` drives,
requiring `cokrequest.inc`/`cokyield.inc`/`cokmutation.inc` changes and a
whole-file CRC re-scope) is **not** what this round built. That remains open
— see the revised numbered list below. What **is** built and dynamically
proven this round is authorization at the narrower `cm_remove_effect`
boundary inside `cokremove.inc`, driven directly by the standalone
`native/cokremove-driver.asm` harness (the same harness style already used
for the rest of `cm_destroy`), not through the full `CCINV.COM` GBMR
pipeline. `tools/cok_mutation_output.py`'s `AUTHORIZED_OUTPUT_CALLBACKS` is
**unchanged** (still the empty `frozenset()`) — it models the different,
still-unbuilt full GBMR v3 contract, and this round's narrower authorization
must not be read as having lifted it.

**What was implemented, in `native/src/cokremove.inc`:**

- Two new caller inputs, defaulting to zero/absent: `cm_gboc` (word, 0 or a
  pointer to a 40-byte GBOC v1 record) and `cm_gbef_rng` (dword, the paused
  RNG state the record's `rng_before` must match). Every existing caller —
  the real CCINV.COM pipeline via `cokmutation.inc`, the pre-existing
  369-case `cokremove-driver.asm`/`tools.cok_native_removal` suite, and the
  fast Unicorn-based `tools.cok_native_removal.destroy()` cross-check used by
  other test files — leaves both at their defaults, so an applied kind-7
  effect still falls straight to `cm_bad` exactly as before this change,
  byte for byte.
- `cm_remove_effect`'s `.found:` dispatch grew one new arm: `cmp al,7 / je
  .damage`, where `.damage:` checks `cm_gboc != 0` (else `cm_bad`, preserving
  the default-rejects-everything behavior) and calls the new
  `cm_authorize_output` routine, rejecting on CF exactly like every other
  kind's failure path. Every existing kind (0x0C/0x0E/0x17/0x26) and every
  still-unsupported kind falls through to `cm_bad` exactly as before —
  unchanged.
- `cm_authorize_output`: a full GBOC v1 validator (magic/version/length/
  self-CRC/reserved-zero/rng-before-match/write-flag branch) plus, only on a
  fully-validated write-flag-present record, the HP write itself:
  `clamp(hp-damage, 0)` at `+407`, with the status/active-flag transition
  `E6:0xA7` documents (exact-lethal remainder==0: status=4, active=0;
  overkill<=9: status=5, active=0; overkill>9: status=6, active=0) at
  `+392`/`+393`. Single-owner scope this round: `target_ordinal` must equal
  exactly 1.
- `cm_output_crc`: a CRC32 helper (bytewise, poly `0xEDB88320`, init -1,
  final NOT), reusing `cokyield.inc`'s existing `iy_crc` pattern.

**Byte cost, measured**: CCINV grew from 52,796 to 53,150 bytes resident
(+354 bytes total this round, including the bugfix described below), leaving
roughly 12,130 bytes of headroom below the 65,280-byte ceiling. GBBOOT,
CCECL and CCCOMBAT rebuilt byte-identical (64,803 / 64,167 / 63,880) — this
round touches only CCINV.

**A real bug the dynamic test caught, not merely a clean pass to report.**
The first implementation of the overkill branch in `cm_authorize_output` set
the status byte at `+392` (5 or 6) but never cleared the active flag at
`+393`, unlike the exact-lethal branch, which does both — contradicting the
E6:0xA7 semantics documented in `cokremove.inc`'s own header comment (every
lethal outcome clears the active flag). The new DOS driver case for
overkill<=9 (damage 36 against the real fixture's hp 27, expecting status 5
and active 0) failed against real DOSBox output with a body mismatch before
this was fixed; adding `mov byte [bx+393],0` to the `.overkill:` block fixed
it, and the same 394-case suite went green afterward, unchanged elsewhere.
This is exactly the class of defect the task's evidentiary bar exists to
catch, and it was caught by the new test, not asserted away.

**Mutation-tested.** The CRC self-check (`cmp eax,[si+36] / jne cm_bad`) was
temporarily replaced with `cmp eax,eax / jne cm_bad` (always-equal,
disabling the check). Rebuilding and re-running the 394-case DOS suite
failed at exactly the "bad CRC" reject case, confirming the new test can
fail. Reverting (verified by SHA-256 match against the pre-mutation file,
and `git diff` showing only this round's intended net change from the
committed baseline) and rebuilding reproduced the exact same resident byte
count as before the mutation (53,150), and the full 394-case suite passed
again.

**Dynamic proof, exact commands and results:**

```
pwsh -NoProfile -File native/build.ps1 -Target engine
pwsh -NoProfile -File native/cokremove-test.ps1
```

`native/cokremove-test.ps1` builds `REMOVE.COM` from
`native/cokremove-driver.asm` (which statically includes the real,
unmodified `native/src/cokremove.inc`), runs it under real headless DOSBox
against `INPUT.BIN`, and diffs `OUTPUT.BIN`/`FREES.BIN` against a Python
reference. Output: `PASS: 394 DOS removal cases; I/O rejection and recovery;
input unchanged` (25 new GBOC cases plus the pre-existing 369, all real DOS
execution, not synthetic). The 25 new cases cover:

- 5 accepted write-flag-present cases at every HP-write boundary the real
  `CHRDATA1.SAV` fixture (hp=27, status=0, active=1) exercises: non-lethal
  remainder (damage 10 -> hp 17, status/active unchanged), exact lethal
  (damage 27 -> hp 0, status 4, active 0), overkill<=9 (damage 36 -> hp 0,
  status 5, active 0), overkill>9 (damage 37 -> hp 0, status 6, active 0),
  and zero damage (damage 0 -> unchanged, still a validated write-present
  record).
- 1 accepted write-flag-clear no-op (fields all zero, `rng_after ==
  rng_before`), proving a validated "no output" record still removes the
  effect/item pair without touching HP/status/active or the RNG state.
- A chained pair approximating "preserved through resume": case B's
  `rng_before` equals case A's accepted `rng_after`; each `REMOVE.COM` case
  independently reloads `cm_gboc`/`cm_gbef_rng` fresh from `INPUT.BIN`
  (`native/cokremove-driver.asm`), so this proves the folded RNG state a
  caller reads back from one authorization threads correctly into a wholly
  separate authorization call. **This is explicitly not a claim about the
  CCECL/GBEF checkpoint file format** (still unbuilt — see the revised list
  below); it is the narrower claim that `cm_gbef_rng` round-trips correctly
  across independent `cm_destroy` invocations, which is the actual boundary
  this round wired.
- 15 rejection cases, each isolating exactly one malformed/unauthorized
  field (bad magic, bad version, bad length, bad CRC, four separate
  reserved-byte violations, RNG-before mismatch against the supplied paused
  state, invalid write-flag value, write-flag-clear with a nonzero output
  field, an unauthorized callback id, an RNG-fold arithmetic mismatch,
  `target_ordinal != 1`, and a write-flag-present record with zero draws) —
  output confirms `rejected=1` and `cm_gbef_rng` unchanged (equal to the
  input paused state) for every one, i.e. failure never partially mutates
  state.
- 2 controls proving the pre-existing baseline is undisturbed: an applied
  kind-7 effect with no `cm_gboc` supplied still rejects exactly as before;
  an *unapplied* kind-7 effect with no `cm_gboc` supplied still succeeds
  exactly as before (this path never needed authorization).

Python-side reference: `tools.cok_item_removal.authorize_effect7` (new
function) mirrors `cm_authorize_output` field-for-field and is deliberately
a distinct, narrower model from `tools.cok_mutation_output.validate()`/
`apply()` — it is **not** a relaxation of that module's
`AUTHORIZED_OUTPUT_CALLBACKS` (still empty); it is the reference for the
different, narrower contract this round actually wired.
`tools.cok_item_removal.destroy()` gained three new, all-default-preserving
optional parameters (`gboc=None, gbef_rng=0, rng_out=None`) so every
existing caller/test is unaffected; passing `gboc` routes an applied kind-7
effect through `authorize_effect7` instead of unconditionally raising
`RemovalError`.

## GBBOOT pipeline vs GBMR wire format — continuation, 2026-09-09

This continuation was asked to make GBBOOT's *live* mutation-host pipeline
(not the standalone `cokremove-driver.asm` harness) populate `cm_gboc`/
`cm_gbef_rng` with real values and actually reach `cm_authorize_output`, so a
real gameplay session or a flow test standing in for one exercises the new
boundary end-to-end. Re-reading the actual call graph first (not this
document's own prior prose about it) produces one correction and one
concrete, previously-only-qualitative blocker.

**Correction: GBBOOT itself is not the resource under pressure here.**
`cokhost.inc` (`mutation_bridge`/`mutation_helper`/`mutation_vm`) is included
into `gbboot.asm` and IS GBBOOT's real orchestration of the mutation host —
it builds the `GBMB` manifest, shells `CCINV.COM B` then `CCINV.COM M`, then
`CCECL.COM ... CHECK`/`MUTATE` — but it never touches `cm_gboc`, `cm_gbef_rng`,
`cm_destroy`, or `cm_remove_effect` directly. Those live entirely inside
`cokmutation.inc`/`cokremove.inc`, which are `%include`d only by `ccinv.asm`
— a separate child `.COM` with its own 64 KB segment. Re-measured this
session (`pwsh -NoProfile -File native/build.ps1 -Target engine`, clean
`native/src`): GBBOOT 64,803/65,280 (477 free, unchanged), CCECL
64,167/65,280 (1,113 free), CCCOMBAT 63,880/65,280 (1,400 free), CCINV
53,150/65,280 (12,130 free). So GBBOOT's tight 477-byte ceiling — repeatedly
cited in the roadmap and prior rounds as *the* native budget risk — is simply
not in the call path for this feature at all; CCINV's headroom is what would
matter, and it is ample.

**The real blocker, mapped exactly instead of asserted qualitatively.** The
prior round's item 2 below said extending the wire format "needs `MR_LEN`'s
hardcoded exact-length check widened and the whole-file CRC scope
re-derived" without pinning where. Reading `cokmutation.inc`'s `mr_request`
shows the exact-length gate is unconditional and independent of version:
`mov dx, arg2 / call open_in / call get_length / cmp dword [file_len], MR_LEN
/ jne .bad` — any request file longer than exactly 13,224 bytes is rejected
before a single header byte is inspected, so a GBOC block cannot simply be
appended after the existing structure without widening this comparison (and,
because `file_crc` CRCs the *entire* file from byte 0, retargeting the
compare value alone is not sufficient — the length feeding that CRC loop
would also need to change consistently on both the writer (`cokrequest.inc`'s
`mutation_request_mode`) and every reader).

The alternative — reusing a currently-reserved span *inside* the existing
13,224 bytes, which would need no length-check or CRC-scope change at all,
since `file_crc` already covers the whole buffer — turns out not to have
room either. Every reserved/zero-checked field within the structure was
enumerated directly from `mr_request.validate`'s comparisons this session:
header word +8 (2 bytes, must be 0 at request time), +18 (2 bytes), +26 (2
bytes), and the 16-byte block at +32..+47, which v1 requires all-zero but v2
(the version GBBOOT actually emits per `cokrequest.inc:85`,
`mov dword [core+4], 00010002h`) already fully occupies with its own step/
chain/repeat/damage-watermark words, a loaded-block CRC32, and one trailing
reserved dword. Total free space across the whole 13,224-byte structure: 6
scattered bytes (+8, +18, +26), none contiguous, none anywhere near a 40-byte
GBOC record.

**CORRECTED by the design round below (same day).** This count is wrong in
two small but precise ways, re-derived directly against `mr_request.validate`
in "GBMR v3 design — 2026-09-09": +8 is the load-bearing phase field, not
spare capacity, and should not have been counted; the "one trailing reserved
dword" this same paragraph names (offsets 44-47) IS free, IS contiguous (4
bytes in a row), and applies in **both** v1 and v2, not only "consumed by
v2's own fields" as implied here — yet it was left out of the "6 scattered"
total despite being named in the sentence right before it. Corrected total:
**8** bytes (+18, +26, +44-47), still far short of 40, so the practical
conclusion ("needs a genuine GBMR v3") is unchanged. See that section for the
full re-derivation and the byte-budget finding is not even the larger
blocker it identifies.

A real carrier therefore needs a genuine GBMR v3 — a longer or
restructured request, not a reinterpretation of what already exists — which
in turn means coordinated changes to the exact-length gate and CRC scope in
`cokmutation.inc`, the writer in `cokrequest.inc`, the response consumer in
`cokcommit.inc`, and (for a callback's output to mean anything on resume)
CCECL's own `cokyield.inc`. Four coordinated call sites across two separate
`.COM` executables is not something this continuation attempted partially;
doing so without being able to dynamically prove every hop would be exactly
the kind of premature/overclaimed wiring this repository's evidence
discipline forbids. This sharpens, and does not overturn, the prior round's
"too large/risky to land safely in the same round" judgment — item 2 below
is updated with this exact map rather than left as a qualitative assessment.

**What this continuation built instead, per this task's own explicit
fallback for a genuinely infeasible full wire-up:** real-pipeline-shaped
`tools/cok_native_mutation.py` coverage that gets closer to production shape
than the single-owner reject/ok pair the prior round added, entirely without
touching the wire format or any `.asm`/`.inc` source. 11 new cases, all
driven through the actual `CCINV.COM M` pipeline (real headless DOSBox, not
the standalone `cm_remove_effect` driver):

- A 6-case per-owner sweep placing the applied kind-7 item/effect pair on
  each of owners 0..5 in turn (the other five owners carry an inert,
  effect-free item), mirroring the pre-existing kind-35 per-owner sweep but
  for kind 7 specifically — proving the real owner loop's `cm_body`/
  `cm_target` routing still isolates the correct owner when the unsupported
  callback is not on owner 0.
- A 3-case cross-owner mix: an already-authorized, successfully-unlinking
  kind (12, i.e. `0Ch`, STR drain) on one owner and the rejecting kind-7 pair
  on a *different* owner in the same multi-owner candidate ((0,1), (2,5),
  (5,0)) — proving "CF rejects whole stage... never publish on CF" holds even
  when another owner's mutation in the same real candidate would have
  succeeded on its own, which the prior single-effect-only kind-7 cases could
  not exercise.
- A 2-case same-owner ordering pair: one owner holds *two* type-39 items,
  one kind 12 (authorized, succeeds) and one kind 7 (rejects), in both
  orders. This is the sharpest of the three: with kind 12 first, `cm_destroy`
  actually performs a real `cm_write`/`cm_unlink` for that item before
  reaching the kind-7 item and failing — proving the whole owner's (and
  whole candidate's) staged work is discarded even after genuine partial
  in-memory progress, not merely before any work began.

Total suite: 130 -> 141 real DOS cases. Dynamic proof:

```
pwsh -NoProfile -File native/cokmutation-test.ps1
```
`PASS: 141 DOS combined mutation cases`.

**Mutation-tested.** Temporarily duplicating the existing kind-7 dispatch arm
in `cokremove.inc` as `cmp al, 7 / je .unlink` (accepting kind 7
unconditionally, the same technique the prior round used for its own
mutation test) and rebuilding CCINV (53,150 -> 53,154 bytes) flipped exactly
12 of 141 cases from FAIL to PASS: the pre-existing single-owner reject case
(`C0057`) plus all 11 new cases (`C0065`..`C0075`), confirmed by comparing
every one of the 141 `(stem, expected, status)` tuples against
`expected.json` rather than trusting `verify()`'s first-mismatch abort. Zero
of the 11 new cases were spared, so none is vacuous. Reverting
`cokremove.inc` reproduced a byte-identical `git diff` (empty) and rebuilt
CCINV back to exactly 53,150 bytes; the full 141-case suite passed again,
and the pre-existing standalone 394-case `native/cokremove-test.ps1` suite
was independently reconfirmed unaffected (`PASS: 394 DOS removal cases; I/O
rejection and recovery; input unchanged`).

`tools/test_cok_native_mutation.py`'s standing pin was updated from 130 to
141 (a real, intentional count change, not a drift); the full `tools/` gate
with `GB_NATIVE_FLOW_GATE=1` reports `5237 passed`, the same two pre-existing
inherited browser-audit failures as every prior round (757 vs 754 unconsumed
exports, 1655 vs 1662 barrel surface — both unrelated to this native work),
`1 skipped`. No `native/*.asm`/`*.inc` source changed in the committed
result of this continuation (the mutation test's temporary edit was reverted
and verified byte-identical); only `tools/cok_native_mutation.py` and
`tools/test_cok_native_mutation.py` changed, so no native flow sweep is
required by this round's own stated trigger ("if you touch gbboot.asm or any
file the sweep depends on").

**What is explicitly NOT claimed.** `cm_gboc` still never becomes nonzero
anywhere in the real GBBOOT-triggered pipeline; `cm_authorize_output` is
still reachable only from the standalone `cokremove-driver.asm` harness, not
from an actual gameplay session or from `CCINV.COM M`. This continuation
closes none of item 2's prerequisites below — it sharpens the evidence for
why they are still open and adds real coverage of the pipeline's existing
(fully-rejecting) behavior around kind 7 under more production-realistic
multi-owner/multi-effect combinations.

## GBMR v3 design — 2026-09-09 (design round; no `.asm`/`.inc` byte changed)

**Status of this section, stated up front.** Everything below is a *design*,
re-derived by reading `native/src/cokmutation.inc`, `cokrequest.inc`,
`cokcommit.inc`, `cokyield.inc` and `cokremove.inc` in full this session (not
by trusting the summaries in the sections above, though they are corroborated
where they overlap). No native source was built, assembled, or run this round.
Nothing here is "validated" or "proven" in this document's own established
sense of those words (see "Resume and cold-checkpoint survival" above) — it is
a byte-exact map plus a proposed extension, offered so the next round can
implement against it rather than re-derive it. Where this section corrects an
earlier claim in this same document, that is called out explicitly rather than
silently overwritten, per this repository's own discipline against letting a
stale claim stand uncorrected.

### 1. The exact current `MR_LEN` (GBMR v1/v2) layout, re-derived from source

All offsets below are absolute byte offsets from `core` (declared
`core resb MR_LEN` at `native/src/ccinv.asm:1643`; `MR_LEN equ 13224` at
`native/src/cokmutation.inc:15`). Every row is backed by an actual comparison
or move instruction read this session in `mr_request.validate`
(`native/src/cokmutation.inc:406-598`) unless marked "structural only" (no
runtime check exists, but the byte range is consumed as a named block by
another field's arithmetic).

| Offset | Size | Field | Evidence |
| --- | --- | --- | --- |
| 0 | 4 | `'GBMR'` magic | `cokmutation.inc:411` `cmp dword [core],'GBMR' / jne .bad` |
| 4 | 2 | Version: 1 or 2 | `cokmutation.inc:413-418` |
| 6 | 2 | Game id, must be 1 | `cokmutation.inc:413` `cmp word [core+6],1` |
| 8 | 2 | **Phase** (not reserved — see correction below): 0 required on any file passed to `mr_request` (both a fresh request and, after `mutation_commit_mode` normalizes it, a re-validated candidate); `mr_finish` sets it to 1 when writing a completed M-stage response | `cokmutation.inc:420` (`.version_ok:` gate, checked unconditionally); `cokmutation.inc:312` `mov word [core+8],1`; `cokcommit.inc:126-128` `cmp word [core+8],1 / jne mc_fail / mov word [core+8],0` |
| 10 | 2 | Active ECL area/block | `cokrequest.inc:136` (written from `mb_yield+14`); checked against paused GBEF's own area at `cokmutation.inc:522-523` (`cmp ax,[MR_FX+122]`) |
| 12 | 2 | Failure PC (DESTROY_ITEMS opcode) | `cokmutation.inc:503-507` bounds `[22,core+14)` |
| 14 | 2 | Checked successor PC | `cokmutation.inc:496-501` bounds `[22,16384]` and `<=` frame block length |
| 16 | 2 | Target item type, 0-255 | `cokmutation.inc:422-423` |
| 18 | 2 | **Reserved, zero, unconditional, both versions** | `cokmutation.inc:424-425` `cmp word [core+18],0 / jne .bad` |
| 20 | 2 | Roster length (`16 + 410*owners`) | `cokmutation.inc:454-456` |
| 22 | 2 | GBEF length, must be 5750 | `cokmutation.inc:426-427` |
| 24 | 2 | Core length, must equal `MR_LEN` | `cokmutation.inc:428-429` |
| 26 | 2 | **Reserved, zero, unconditional, both versions** | `cokmutation.inc:430-431` |
| 28 | 4 | Whole-file CRC32 (file bytes with 28..31 read as the file's own written value, computed over the actual on-disk length via `file_crc`, not the `MR_LEN` constant — see §2b) | `cokmutation.inc:401-404`; `ccinv.asm:787-825` (`file_crc`, loops `read_some` to EOF, zeroes only the in-memory copy of bytes 28-31 of the *first* chunk before folding, `ccinv.asm:806`) |
| 32..47 | 16 | Version-dependent context block (below) | `cokmutation.inc:432-453` |
| 48 | 5750 | Paused GBEF v9 (`MR_FX equ core+48`) | `cokmutation.inc:16`; GBEF's own RNG dword lives at GBEF offset 126 = **core+174** (`tools/cok_mutation_output.py:52`, cross-checked against `cokmutation.inc:508-526`'s GBEF structural checks, which validate `MR_FX+122/124` as area/PC immediately adjacent to the RNG word but never read or constrain offset 126 itself — RNG is carried through unvalidated and unchanged by every currently-authorized callback) |
| 5798 | 2476 | CoK GBPR (roster header + up to 6*410-byte bodies), zero-padded after actual length | `cokmutation.inc:460-470` (padding-is-zero check); body base is **`core+5815`** per-owner stride 410 (`cokmutation.inc:180`: `imul ax,[mr_owner],410 / add ax,core+5815`, matching `cokcommit.inc:188` `core+5814+1+408` for the movement-byte read — `core+5814` is the last roster-header byte, `core+5815` is body-record 0) |
| 8274 | 258 | Owned-effect flag word + eight 32-byte owner bitmaps (`MR_TIMER` region begins at 8532, so this is `core+8274`..`core+8531`) | `cokmutation.inc:17,592-596` |
| 8532 | 2572 | Canonical timer state (`MR_TIMER equ core+8532`) | `cokmutation.inc:17` |
| 11104 | 8 | Opaque learning state | `cokrequest.inc:80-83`, `cokcommit.inc:21-25` |
| 11112 | 32 | GBMC continuation frame (`MR_FRAME equ core+11112`) | `cokmutation.inc:18` |
| 11144 | 2048 | ITEMS definitions (`MR_TABLE equ core+11144`) | `cokmutation.inc:19` |
| 13192 | 32 | Inventory type bitmap (`MR_TYPES equ core+13192`) | `cokmutation.inc:20`; ends at **13224 = `MR_LEN`**, confirming the fixed core's very last byte is `core+13223` |
| 13224 | variable | Response-only appended GBIV | `cokmutation.inc:96` (`mr_position` starts at `MR_LEN+16`), `cokcommit.inc:113-117` (`mc_inv_len = file_len - MR_LEN`) |

**Context block, offsets 32..47 (16 bytes), exact per-version breakdown**
(`cokmutation.inc:432-453`):

| Version | 32 | 34 | 36 | 38 | 40 | 44 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | reserved zero | reserved zero | reserved zero | reserved zero | reserved zero | reserved zero |
| 2 | instruction count, `1..59999` | NEWECL chain transitions, `<=32` | bridge repeat count, `<16` | host DAMAGE watermark, `<=` script-event count at `MR_FX+2250` | loaded-block CRC32 | **reserved zero, unconditionally, in BOTH v1 and v2** |

The v2 branch (`cokmutation.inc:436-448`) validates offsets 32/34/36/38/40-43
by name and then falls through to `mov si,core+44 / mov cx,4` — the *same*
4-byte reserved-zero loop the v1 branch enters directly with `cx=16` from
offset 32. This is the source for the correction in §2a below.

**Supporting envelope formats, confirmed by reading `cokrequest.inc` this
session (not re-derived from `cok-mutation-packet.md`'s table, though it
agrees):** GBMB v1/v2 manifest, `MB_LEN equ 672` (`cokrequest.inc:7`), header
at `mb_manifest+0..31` then five fixed 128-byte ASCIIZ path slots
(`MB_INV`/`MB_FX`/`MB_PARTY`/`MB_SEED`/`MB_ECL`, `cokrequest.inc:8-12`), all
five required nonempty by the uniform loop at `cokrequest.inc:54-78`. GBIY v2
sidecar, 72 bytes, magic/version/length at `compbuf+0..7`
(`cokyield.inc:69-70`), self-CRC over the first 68 bytes at `compbuf+68`
(`cokyield.inc:111-114`).

### 2. Growth-room analysis, ranked

**2a. Reuse existing reserved bytes — corrected count: 8, not 6, one span
IS contiguous.** The "GBBOOT pipeline vs GBMR wire format" section above
(2026-09-09, same day, earlier in this document) states: "Total free space
across the whole 13,224-byte structure: 6 scattered bytes (+8, +18, +26),
none contiguous." Re-deriving this independently this session, directly
against `mr_request.validate`, finds **two things wrong with that sentence**,
both in the direction of *more* room than claimed, though still nowhere near
enough:

- **Offset +8 is not reserved/free space.** It is the phase field (0
  request, 1 completed candidate), which `mr_finish` writes and
  `mutation_commit_mode` reads and depends on (`cokcommit.inc:126-128`). A
  v3 design cannot repurpose it without breaking phase discrimination between
  a request and a candidate. It should not have been counted toward "free
  space" even though `mr_request.validate` does check it equals zero on read
  — that check enforces the phase invariant, it does not mark spare capacity.
- **A fourth reserved field was under-counted: offsets 44..47 (4 bytes),
  reserved zero in BOTH v1 and v2** (see the per-version table in §1;
  `cokmutation.inc:444-453`). The prior sentence's own prose acknowledges "one
  trailing reserved dword" in the same paragraph that then omits it from the
  "6 scattered bytes" total — an internal inconsistency in that sentence, not
  a disagreement about the underlying bytes. And this span **is** contiguous
  (4 bytes in a row), contradicting "none contiguous."

  Corrected true reserved-and-unused total: **8 bytes** — offset 18 (2),
  offset 26 (2), offsets 44-47 (4, contiguous, and universal across both
  currently-valid versions rather than version-specific). This does not
  change the practical conclusion (8 is nowhere near 40), but the earlier
  count and its "none contiguous" claim were both imprecise, and precision is
  the standard this document sets for itself elsewhere.

  **Repurposing 44-47 would not disturb anything reading them today**: no
  code in the four `.inc` files read this session ever reads or writes
  offsets 44-47 for any purpose other than the reserved-zero check itself —
  confirmed by reading every reference to `core+4x` literals across
  `cokmutation.inc`, `cokrequest.inc`, and `cokcommit.inc`. A v3-aware reader
  could begin treating 44-47 as meaningful only when version==3, while a
  v1/v2 file (which the existing check already forces to leave these bytes
  zero) is unaffected either way.

  **This is still not enough room.** Even the corrected 8 bytes (or, for a
  design that only needs to support v1's original all-reserved 16-byte block,
  the full 16 bytes at 32-47) fall far short of the 40 a GBOC v1 record needs
  intact. A shrunk, transport-specific record (dropping GBOC's own magic/
  version/length/self-CRC on the theory that GBMR's own version number and
  whole-file CRC already cover integrity) could in principle get as small as
  ~13 bytes (callback_id + draws + rng_before + rng_after + target_ordinal +
  damage, no self-describing header, no padding) — still bigger than 8, and
  this micro-option is rejected anyway: it would discard the already-built,
  already-mutation-tested `cm_authorize_output` validator's exact record
  contract (394 DOS cases against the 40-byte layout), trading a proven
  boundary for a new, unproven, narrower one to save 5 bytes it still
  wouldn't have.

**2b. Grow `MR_LEN` (append after the fixed core) — the direction this
design recommends.** Append exactly one 40-byte GBOC v1 record (unchanged
layout from "GBOC v1 — the output record" above) immediately after the
current last core byte (`core+13223`), i.e. at absolute offset 13224, so
`MR_LEN_V3 = 13264`. This is chosen over inserting the block anywhere earlier
in the structure because every existing internal pointer (`MR_FX`,
`MR_TIMER`, `MR_FRAME`, `MR_TABLE`, `MR_TYPES`) is defined as `core+N` for a
fixed literal `N` (`cokmutation.inc:16-20`), and `mr_request.validate`
additionally uses bare numeric offsets in dozens of places
(`cokmutation.inc:411-598`) rather than routing every access through those
equates — inserting earlier would require re-deriving and shifting every one
of those literals for v3 while somehow keeping v1/v2's literals unshifted in
the same routine, which is a much larger and more error-prone change than
appending at the existing boundary. Appending disturbs **zero** existing
offsets.

Every hardcoded use of the `MR_LEN` constant found this session, each of
which needs to become version-conditional (`MR_LEN` for v1/v2, `MR_LEN_V3`
for v3) — this is the exhaustive checklist, not a partial one:

- `cokmutation.inc:15` — `MR_LEN equ 13224` itself; needs a second constant
  (`MR_LEN_V3 equ 13264`) plus a runtime "effective length for this version"
  helper, since the constant alone can no longer answer "how long is this
  file" without knowing the version word first.
- `cokmutation.inc:395-396` (`mr_request`) — `cmp dword [file_len], MR_LEN /
  jne .bad` runs **before** any header byte is read, so it cannot yet know
  the version. This needs restructuring: read/verify the length against
  *both* accepted lengths first (`file_len == MR_LEN || file_len ==
  MR_LEN_V3`), read the full (larger) buffer up to whichever length matched,
  then let `.validate` reject a mismatched combination of "declared version"
  vs. "actual file length" once the version word is available — a
  version-3-declared file that is only 13224 bytes long, or a version-1/2
  file that is 13264 bytes long, must both be rejected explicitly, not
  silently truncated or over-read.
- `cokmutation.inc:428-429` — `cmp word [core+24], MR_LEN / jne .bad` (the
  header's own self-declared "core length" field). Must become
  version-conditional: `MR_LEN` for v1/2, `MR_LEN_V3` for v3.
- `cokmutation.inc:88-90` (`mutation_mode`, initial placeholder write of the
  whole core to the new response file) — `mov cx, MR_LEN` must become the
  effective length, or the appended GBOC bytes are silently dropped from the
  staged response file before `mr_finish` ever computes its CRC.
- `cokmutation.inc:96` — `mov dword [mr_position], MR_LEN+16` (the running
  write cursor for GBIV owner rows, set to "just past core, plus GBIV's
  16-byte header"). Must become `MR_LEN_V3+16` for a v3 request/response.
- `cokmutation.inc:314-318` (`mr_finish`) — `mov eax,[mr_position] / sub
  eax, MR_LEN / mov [inv_header+8], eax` (computes GBIV's own byte length by
  subtraction) and `mov eax, MR_LEN / call mr_seek` (seeks to where GBIV's
  header belongs) — both must use the effective length.
- `cokmutation.inc:329-331` (`mr_finish`, final full-core rewrite after CRC
  is known) — `mov cx, MR_LEN / call write_exact` must become the effective
  length, for the same reason as the initial placeholder write.
- `cokrequest.inc:16-18` (`mutation_request_mode`) — `mov di, core / mov cx,
  MR_LEN / rep stosb` zeroes the core buffer before population; must zero
  the effective (larger, for v3) region so the appended GBOC area does not
  contain stale scratch-buffer bytes from a prior request in the same
  process.
- `cokrequest.inc:86-87` (`mutation_request_body`) — `mov word [core+22],
  5750 / mov word [core+24], MR_LEN` sets the self-declared core length;
  needs the same version-conditional treatment as the `.validate` check
  above, and is the actual site that would write `MR_LEN_V3` into the
  request it constructs.
- `cokrequest.inc:84-85` — `mov dword [core], 'GBMR' / mov dword [core+4],
  00010002h` hardcodes version 2 (and game id 1) unconditionally for every
  request `mutation_request_mode` builds. A v3-capable constructor needs a
  caller-supplied flag ("attach a GBOC record") that selects `00010003h`
  instead, and, on that branch, copies the 40-byte GBOC payload from wherever
  the caller supplies it into `core+13224..13263` before writing the file.
  This is also where a new caller input (analogous to `cm_gboc`/
  `cm_gbef_rng`'s "default zero, existing callers unaffected" convention in
  `cokremove.inc`) belongs: e.g. a `mb_has_gboc`/`mb_gboc_source` pair
  defaulting to "absent," so every existing v2-only call site is unaffected
  byte-for-byte.
- `cokcommit.inc:113-117` (`mutation_commit_mode`) — `cmp dword [file_len],
  MR_LEN+16 / jb mc_fail` (candidate must be at least core-plus-a-GBIV-header
  long) and `sub eax, MR_LEN / mov [mc_inv_len], eax` (derives GBIV's byte
  count from the candidate's actual length) both need the effective length
  for the version the *candidate* declares — importantly, this cannot simply
  reuse whatever version the *original request* (`mc_request`, loaded first
  in this same function) declared, because a v3 request could in principle
  produce a v3 candidate only if the M-stage that produced it also
  understood v3; the safest rule is "candidate version must equal request
  version exactly," which needs its own new comparison (currently absent —
  see §3 below for why this exact equality matters for more than just length
  bookkeeping).
- `cokcommit.inc:118-120` — `mov dx, core / mov cx, MR_LEN / call read_exact`
  reads only the first (fixed v1/2) `MR_LEN` bytes of the candidate file
  before the immutability comparisons run; for a v3 candidate this must read
  `MR_LEN_V3` bytes so the appended GBOC block is actually loaded into `core`
  for comparison (see §3 — the appended block needs its own immutability
  check, symmetric with the existing three).
- `cokcommit.inc:5-6` (`mutation_commit_mode`'s very first two calls, `call
  mb_load` then `call mr_request`) — `mr_request` itself loads and validates
  the *original* request (`arg2`) using the same version-aware length logic
  as above, so this call site inherits every fix listed for `mr_request`
  without further local changes, other than the new "candidate version must
  equal request version" comparison noted above.
- `native/src/ccinv.asm:1643` — `core resb MR_LEN` must grow to
  `core resb MR_LEN_V3` (or a distinct, larger constant) so the buffer itself
  has room for the appended 40 bytes in every mode, not just v3-aware
  branches; this is a one-line, low-risk change but is listed because
  forgetting it would corrupt adjacent static data during any v3 read.

**2c. Out-of-band record (a new GBMB path slot / a sidecar file), instead of
growing `MR_LEN`.** Evaluated as an alternative to 2b, since the manifest
(GBMB) already carries five file paths and has grown once before by
repurposing a header word (v1->v2's DAMAGE watermark at manifest offset 8,
`cokrequest.inc:5,43-48` — precedent for *a* growth, though at word scale,
not block scale). A GBMB v3 could add a sixth 128-byte path slot naming a
standalone GBOC record file (`MB_LEN` 672 -> 800), read directly into a small
transient buffer by `mutation_request_mode`'s `mb_load`/`mb_read_file`
machinery it already has, without ever storing the record inside `core` at
all.

This **is** genuinely feasible for getting the record's *bytes* into CCINV's
address space (`mb_read_file` already reads an arbitrary exact-length file
into an arbitrary buffer, `cokrequest.inc:278-295`), and it is smaller and
more self-contained than growing `MR_LEN`: it touches only `cokrequest.inc`
(the manifest is B/C-only; `mutation_mode`, the 'M' stage, never opens the
manifest at all — confirmed by reading `cokmutation.inc` in full, which has
no `mb_` reference anywhere). `mb_load`'s uniform "every path slot must be
nonempty" loop (`cokrequest.inc:54-78`) would need a carve-out for a sixth,
*optional* slot, since every existing slot is currently mandatory by
construction.

**But this does not avoid the harder problem this design round actually
found (§3).** Whichever transport carries the GBOC record, the RNG value it
authorizes must still end up somewhere CCECL's resume can read it back from,
and the only place that currently exists for a paused GBEF's RNG state is
`core`'s embedded copy at offset 174 — which is exactly the field §3 shows is
already covered by an existing byte-identity gate between request and
candidate. An out-of-band GBOC file would still need either (a) the same
narrow immutability carve-out at that one offset once the value lands inside
`core` for the candidate, or (b) an entirely separate out-of-band RNG-update
sidecar for the *response* side too, mirrored on the same GBMB-path
convention, applied by `mutation_commit_mode` as a new, explicit,
independently-verified exception when publishing the active GBEF file. Option
(b) avoids touching `MR_LEN` at all, at the cost of inventing a second new
sidecar convention (request-side GBOC input, response-side RNG-delta output)
instead of one. Neither 2b nor 2c is free of the §3 problem; 2c only makes
the *wire-format-capacity* half of the problem cheaper, which per §3's
finding was already the easier half.

**Recommendation:** 2b (append to `MR_LEN`) for the record's transport, since
it keeps a single self-describing request/response file consistent with
every other field this pipeline already handles this way (the execution
context at offsets 32-47 is the closest precedent: also copied in by 'B' from
an external sidecar, also carried through unchanged inside `core` for 'M' and
'C' to see without reopening any other file). 2c remains a documented,
smaller-footprint alternative if a future round decides the manifest-path
convention is preferable once §3's carve-out is designed either way.

### 3. The load-bearing finding this round adds: `cokcommit.inc`'s GBEF
immutability check does not yet permit an RNG-authorized candidate

`mutation_commit_mode` (the 'C' stage) requires the M-stage's output
candidate to reproduce several ranges of the *original* request byte-for-byte,
to prove the candidate was not tampered with beyond the mutations 'M' is
allowed to make. Read directly this session, `cokcommit.inc:131-145`:

```
mov si, core          ; candidate, just loaded from arg3
mov di, mc_request     ; original request, loaded earlier in this function
mov cx, 28
repe cmpsb
jne mc_fail
mov si, core+32
mov di, mc_request+32
mov cx, 5798-32        ; = 5766 bytes: the context block (32-47) + full GBEF (48-5797)
repe cmpsb
jne mc_fail
mov si, core+11104
mov di, mc_request+11104
mov cx, 13192-11104
repe cmpsb
jne mc_fail
```

The three checked ranges are `[0,28)`, `[32,5798)`, `[11104,13192)`. Everything
outside them — `[28,32)` (the CRC, expected to differ), `[5798,11104)`
(GBPR/owned-effects/timers, the intentionally mutable regions every currently
-authorized callback touches), and `[13192,13224)` (the inventory type
bitmap) — is deliberately left unconstrained, matching
`cok-mutation-packet.md`'s "mutated sections are GBPR, timers, owned-effect
matrix, inventory-type bitmap" line exactly.

**The `[32,5798)` range includes the paused GBEF's RNG dword at absolute
offset 174** (`core+48` + GBEF offset 126). Every callback authorized today
(0x0C/0x0E/0x17/0x26) is a pure structural recalculation that never touches
GBEF, so this has never mattered before. A GBOC-authorized effect-7 removal
is the first feature that needs the candidate's GBEF RNG dword to
*legitimately differ* from the request's — that is the entire point of
`cm_authorize_output`'s RNG-fold check — and **as this comparison is written
today, that legitimate difference would make `mutation_commit_mode` reject
every single GBOC-authorized candidate**, independent of anything this
design does to `MR_LEN`.

This is a real, previously-undisclosed blocker distinct from the "6 (now 8)
reserved bytes" byte-budget finding in the "GBBOOT pipeline vs GBMR wire
format" section above: that section mapped whether the GBOC record's *bytes*
have anywhere to live in the request; this finding is about whether the
record's *effect* (an RNG dword that must be allowed to change) survives the
response's own re-validation gate. Solving 2b/2c without also solving this
does not produce a working feature — the candidate would simply always fail
at `mc_fail`.

**What everything else GBOC touches is fine, precisely because it is fine.**
`cm_authorize_output`'s HP/status/active-flag writes land in `[cm_body]`,
which resolves to `core+5815 + 410*owner` (§1) — squarely inside the
`[5798,11104)` range this check does **not** constrain. Only the RNG dword is
a problem; the check does not need a broad rewrite, only a 4-byte carve-out.

**Proposed carve-out (design only, not implemented):** split the single
5766-byte comparison into three pieces when the request/candidate pair is
version 3 with a write-flag-present GBOC record present: `[32,174)` (142
bytes, unconditionally identical, unchanged from today), `[178,5798)` (5620
bytes, unconditionally identical, unchanged from today), and `[174,178)` (the
RNG dword) checked by *re-deriving* the expected value rather than by
skipping it — i.e. `mutation_commit_mode` independently folds
`draws` applications of the documented RNG recurrence
(`state*0x08088405+1`) over `mc_request`'s own RNG dword (the immutable
original) and requires the candidate's RNG dword to equal that fold exactly,
using `draws`/`rng_before`/`rng_after` read from the (also byte-identity-
checked, per the next paragraph) appended GBOC block — not merely accepting
whatever value the candidate happens to contain. This reuses the identical
fold arithmetic already implemented and DOS-verified in
`cokremove.inc`'s `cm_authorize_output` (`.write_present:`/`.fold:` block,
`cokremove.inc:433-441`); because `ccinv.asm` `%include`s `cokmutation.inc`
(which pulls in `cokremove.inc`), `cokrequest.inc`, and `cokcommit.inc` into
one translation unit in that order (`ccinv.asm:1588-1590`), a shared fold
subroutine is directly callable from `cokcommit.inc` without restructuring
the include graph — confirmed by reading that include list, not assumed.

**The appended GBOC block itself also needs a new, fourth immutability
check**, symmetric with the three that already exist: nothing in `cm_write`,
`cm_authorize_output`, or anywhere else in `cokmutation.inc`'s owner loop
mutates the GBOC record's own bytes (`cm_authorize_output` only ever writes
`[cm_gbef_rng]`, a scratch dword, and `[cm_body]` fields — it never writes
back through `[cm_gboc]`, confirmed by reading every `mov [si+...]`/`mov
[bx+...]` destination in `cokremove.inc:382-471`). So the record at
`core+13224..13263` should be byte-for-byte identical between request and
candidate, exactly like the three existing checked ranges, and
`mutation_commit_mode` needs a fourth `repe cmpsb` over `[13224,13264)` to
enforce that (a version-3-only addition; absent for v1/v2 since that range
does not exist there).

**Also newly identified, not previously documented anywhere in this file:**
`cm_gboc`/`cm_gbef_rng` are process-lifetime static variables
(`cokremove.inc:492-493`), not per-owner state, and nothing in
`mutation_mode`'s owner loop (`cokmutation.inc:106-286`) resets `cm_gboc` to
zero between owners. If a future implementation sets `cm_gboc` to a nonzero
pointer for the one owner the appended record targets, it must **explicitly
clear it back to zero before or after every other owner's `cm_destroy` call**
in the same combined candidate, or a stale nonzero `cm_gboc` from an earlier
owner would let a later owner's unrelated kind-7 effect wrongly reach
`cm_authorize_output` (which would then itself reject on `target_ordinal`
mismatch in the single-owner design, so this is not a silent-authorization
hazard today, but it is exactly the kind of latent bug this document's own
mutation-testing discipline exists to catch before it becomes one, e.g. if a
future round relaxes the single-owner restriction). This is a genuinely new
finding from reading `cokmutation.inc`'s owner loop against
`cokremove.inc`'s variable declarations side by side this session, not
present in any prior dated section of this document.

### 4. Proposed concrete GBMR v3 layout

- **Bytes 0..13223: byte-identical to v1/v2** in field meaning and position.
  Only the version word at offset 4 changes, to 3.
- **Bytes 13224..13263 (new, 40 bytes): one GBOC v1 record**, unchanged
  layout from "GBOC v1 — the output record" above (magic/version/length/
  callback id/write flag/reserved/draws/reserved/rng-before/rng-after/
  target-ordinal/damage/reserved/queue-slot/reserved/self-CRC). GBOC keeps
  its own internal version field (1) independent of the GBMR envelope
  version (3) — the same "independently versioned sidecar nested in a
  differently-versioned envelope" pattern GBIY v2 already uses inside GBMR
  v2's context block.
- **`MR_LEN_V3 = 13264`.** A v3 file is *exactly* this length; there is no
  variable-length or optional-GBOC-absent v3 (a request with nothing to
  authorize should simply stay v1 or v2, matching how `mutation_request_mode`
  already always emits v2 today rather than v1). This keeps the "exact length
  for this version" rule simple: `13224` for v1/v2, `13264` for v3, no third
  case.
- **Scope matches, and does not exceed, what `cm_authorize_output` already
  implements**: exactly one GBOC record, one targeted owner
  (`target_ordinal == 1`, i.e. still single-owner scope as of the
  2026-09-09 native landing). A GBMR v3 request cannot authorize more than
  one owner's output in the same combined candidate. Multi-owner GBOC output
  is out of scope for "v3" as designed here and would need either an array of
  appended records or a per-owner slot — not attempted, since the native
  authorization primitive it would carry does not exist for more than one
  owner yet either.
- **Backward/forward compatibility, stated precisely, not as "handles it
  gracefully":**
  - A v1 or v2 file presented to v3-aware code: read and validated exactly
    as today; the effective length is 13224; no GBOC block is looked for,
    read, or referenced. `mr_request.validate`'s per-version branch already
    has a clean seam at `cmp word [core+4],1 / je .version_ok` /
    `cmp word [core+4],2 / jne .bad` (`cokmutation.inc:415-418`) — a third
    arm (`cmp word [core+4],3`) is added beside these, not instead of them.
  - A v3 file presented to v1/v2-only (unmodified) code: **rejected**, not
    silently truncated or read-as-v2. The existing `cmp word [core+4],2 /
    jne .bad` (`cokmutation.inc:417-418`) already rejects any version other
    than 1 or 2 today; unmodified code needs no change at all to reject v3 —
    this is a free, already-correct default that a v3 implementation must
    not weaken while adding the new arm.
  - A v3-declared file whose actual on-disk length is 13224 (missing its
    GBOC tail): rejected at the length-vs-version cross-check in §2b's
    restructured `mr_request` (an explicit new check, not implied by
    anything existing).
  - A v1/v2-declared file whose actual on-disk length is 13264 (has 40 extra
    trailing bytes it doesn't declare): also rejected by that same
    cross-check — the extra bytes are never silently ignored as padding.
  - A well-formed v3 candidate whose appended GBOC record has its write flag
    clear (a validated "no output" record, same rule as the existing
    Python-level `validate()`): accepted, and produces a candidate whose RNG
    dword is required to be **unchanged** from the request (fold of zero
    `draws`, or the existing "all output fields zero, rng_after==rng_before"
    rule from "Enforcement rules" above) — i.e. §3's carve-out degenerates to
    "still exactly equal" rather than a separate code path.

### 5. File-by-file, function-by-function implementation checklist

This consolidates §2b and §3 into one ordered list for a future
implementation round. Every citation is to a location read this session.

1. `native/src/cokmutation.inc:15` — add `MR_LEN_V3 equ 13264` beside the
   existing `MR_LEN equ 13224`.
2. `native/src/cokmutation.inc:389-405` (`mr_request`) — restructure the
   length gate to accept either exact length, defer the final
   length-vs-declared-version cross-check into `.validate` once the version
   word is legible, and size the initial `read_exact` to the larger of the
   two so a v3 file's tail is actually loaded into `core`.
3. `native/src/cokmutation.inc:406-598` (`mr_request.validate`) — add a
   `cmp word [core+4],3` arm alongside the existing 1/2 arms
   (`:415-418`); on that arm, additionally validate the appended block's
   magic/version/length/self-CRC (structural only, mirroring `cm_authorize_
   output`'s own header checks) at `core+13224..13263`; leave the
   RNG-fold/callback-id/target-ordinal semantic checks to `cm_authorize_
   output` at owner-dispatch time, unchanged, per this design's separation
   of "well-formed envelope" from "authorized removal."
4. `native/src/cokmutation.inc:88-90, 96, 314-318, 329-331` (`mutation_mode`,
   `mr_finish`) — replace every literal `MR_LEN` used for "how much of core
   to write/seek past" with the effective length for the request's own
   version.
5. `native/src/cokmutation.inc:178-192` (`.run:`/`.invoke:`, the per-owner
   dispatch immediately before `call cm_destroy`) — new logic: if this
   request is version 3 and the appended GBOC record's `target_ordinal`
   equals `[mr_owner]+1`, set `cm_gboc` to `core+13224` and `cm_gbef_rng`
   from `[core+174]` (`MR_FX+126`); otherwise explicitly set `cm_gboc` to 0
   (per §3's newly-identified stale-static-variable hazard) before calling
   `cm_destroy` for that owner.
6. `native/src/cokmutation.inc:190-192` (immediately after `call cm_destroy`
   succeeds for the GBOC-targeted owner) — copy `[cm_gbef_rng]`'s
   (possibly-updated) value back into `core+174` so the response candidate's
   embedded GBEF reflects the fold; this write does not exist today (checked:
   nothing in `cokmutation.inc` references `cm_gbef_rng` or `core+174`
   anywhere in the current source).
7. `native/src/cokrequest.inc:16-18` (`mutation_request_mode`) — zero the
   effective (version-appropriate) region, not the fixed `MR_LEN`.
8. `native/src/cokrequest.inc:84-87` (`mutation_request_body`) — add the new
   caller input (default absent) that selects version 3 plus supplies the
   40-byte GBOC payload; on that branch, write `00010003h` and copy the
   payload into `core+13224..13263`, matching the "existing callers
   unaffected" convention `cokremove.inc`'s `cm_gboc`/`cm_gbef_rng` already
   established.
9. `native/src/cokrequest.inc:54-78` (`mb_load`'s path-validation loop) — only
   if the manifest-path alternative (§2c) is chosen instead of (or alongside)
   a direct caller-supplied buffer in step 8: add a sixth, optional path slot
   with its own (not the uniform mandatory) validation rule.
10. `native/src/cokcommit.inc:113-120` (`mutation_commit_mode`) — use the
    effective length for both the minimum-length check and the `mc_inv_len`
    subtraction; add the new "candidate version must equal request version"
    comparison; size the candidate `read_exact` to the effective length so
    the appended block is actually loaded.
11. `native/src/cokcommit.inc:131-145` — split the `[32,5798)` comparison
    into `[32,174)` + `[178,5798)` (both unconditionally byte-identical) plus
    the new re-derived-fold check over `[174,178)` (§3); add the new fourth
    `repe cmpsb` over `[13224,13264)` for version-3 candidates.
12. `native/src/ccinv.asm:1643` — grow the `core` buffer declaration to fit
    `MR_LEN_V3`.
13. **Not read this session, and explicitly flagged as unresolved by this
    design round:** `native/src/cokresume.inc` and `native/src/cokhost.inc`
    (GBBOOT's own orchestration, per the "GBBOOT pipeline vs GBMR wire
    format" section above) — whether CCECL's resume path reads the restored
    GBEF's RNG from the same `core+174`-equivalent location in whatever
    format it consumes at resume time, and whether GBBOOT's own manifest
    construction would need a new caller-facing decision point ("does this
    inventory yield's DESTROY_ITEMS call warrant offering a GBOC record at
    all, and where would that record's actual RNG-draw/damage values come
    from at runtime") are both open questions this design round did not
    investigate. Both must be answered before implementation, not assumed.
14. Python reference parity: `tools/cok_mutation_packet.py` and
    `tools/cok_mutation_output.py` would need a `GBMR_V3`/`pack_v3`
    counterpart mirroring whatever the assembly implements, and
    `tools/cok_native_mutation.py`'s DOS fixtures would need v3 cases,
    following this project's existing convention of a Python reference model
    alongside every native format. Not started this round.

### 6. Feasibility/risk verdict

**Bigger and riskier than the 2026-09-09 "GBBOOT pipeline vs GBMR wire
format" assessment, not smaller — and for a reason that assessment did not
identify at all, not merely a re-confirmation of the reason it gave.** That
section's case rested entirely on wire-format *capacity*: 6 (corrected here
to 8) free bytes against a 40-byte need, therefore `MR_LEN` must grow, four
files must change. That framing, on its own, somewhat understates the work,
because it stops at "the bytes have nowhere to go" without following what
happens once they do. This round's reading of `cokcommit.inc` found a second,
independent blocker that exists regardless of which growth option (2b or 2c)
is chosen: the 'C' stage's existing byte-identity gate over `[32,5798)`
would reject every legitimate GBOC-authorized candidate outright, because
that range includes the one field (`core+174`, GBEF's RNG dword) a GBOC
output is specifically designed to change. This is not a variant of the
byte-budget problem — it is a correctness/security gate that must be
*narrowed with a re-derivation, not merely widened*, or a malformed or
malicious candidate could smuggle an arbitrary RNG value past `C` once the
blanket check is loosened. Getting that narrowing exactly right (§3's
three-way split plus an independently-recomputed fold, not a skip) is new
design and new assembly that no prior section of this document, and no prior
round's byte-budget framing, accounted for.

Combined with the fourteen-item checklist in §5 spanning four files and one
buffer declaration in a fifth, two of which (`cokresume.inc`/`cokhost.inc`)
this round did not even read and therefore cannot yet scope, the honest
verdict is: **this remains too large for one implementation round**, and is
somewhat larger than round 9's own "four coordinated call sites across two
separate `.COM` executables" framing suggested, because that framing counted
files, not the qualitatively different kind of change `cokcommit.inc` turns
out to need (a security-relevant carve-out with its own re-verification
arithmetic, not a length/offset update like the other three). Round 9's
conclusion to defer rather than attempt this partially is reconfirmed, and
sharpened: the next round should treat §3 (the immutability carve-out) as
its own design/review checkpoint distinct from §2b's mechanical length
plumbing, precisely because it is the one piece of this feature that is
about *loosening a correctness guarantee* rather than *widening a buffer*.

Item 2 in "What remains before this is native" below is updated to point
here; items 1, 3, and 4 are unaffected by this design round.

## What remains before this is native

1. **CLOSED 2026-09-08.** `14F24h`'s caller/consumer chain is now located and
   dynamically confirmed: `0167AFh` -> `0162E3h` (calls `14F24h` at `0165F7h`)
   -> `0150A8h` (a shared "compose combat message" dispatcher, called at
   `016621h` with `DS:56B30` pushed twice) -> `E6:0xA7` = file `038A7Dh`
   (overlay `0xE6`, procedure index 27), which reads the target's HP byte at
   `es:[di+0x197]`, computes `clamp(hp-damage, 0)`, sets a death-transition
   status byte at `es:[di+0x188]` (4/5/6) and clears the active flag at
   `es:[di+0x189]` on lethal/overflow damage, and writes the final value back
   to `es:[di+0x197]`. Full derivation, the dynamic confirmation (including a
   mutation control proving the pin can fail), and the disclosed-unexplored
   `0xDB`/`0340F2h` side-path: `docs/engine/research/cok-item-removal-native-plan.md`'s
   "14F24h's caller and consumer, located and confirmed dynamically —
   2026-09-08 (continuation)" section; standing test:
   `tools/test_cok_effect7_damage_consumer.py` (9 tests). **This closes the
   RE prerequisite only.** It does not derive a DAMAGE-queue-append contract
   — `E6:0xA7` writes the HP field directly and does not touch any queue
   structure this project has located — so GBOC's design (below) still defers
   queue-append semantics as unbuilt work, and `AUTHORIZED_OUTPUT_CALLBACKS`
   is unchanged (still the empty `frozenset()`; no callback is authorized by
   this finding).
2. **STILL OPEN; re-derived and sharpened 2026-09-09 (continuation).** Extend
   `native/src/cokyield.inc`/`cokrequest.inc`/`cokmutation.inc`/`cokcommit.inc`
   to emit a real GBMR header version 3 carrying a GBOC block through the
   live 13,224-byte `MR_LEN`-fixed CCINV request/response pipeline that
   `tools/cok_native_mutation.py` drives (141 DOS cases as of this
   continuation, up from 130), without moving any existing v1/v2 offset.
   This needs `MR_LEN`'s hardcoded exact-length check in `mr_request`
   (`cmp dword [file_len], MR_LEN / jne .bad`) widened and the whole-file CRC
   scope re-derived on both the writer and every reader — assessed
   2026-09-09 as too large/risky to land safely alongside the
   `cm_remove_effect` wiring in the same round, so it was deliberately
   deferred rather than attempted partially. **Re-confirmed and mapped
   exactly, same day, continuation round:** the alternative of reusing
   already-reserved bytes inside the existing 13,224-byte structure (which
   would need no length/CRC-scope change at all) was checked field-by-field
   against `mr_request.validate` and does not work either — only 6 scattered,
   non-contiguous reserved bytes exist (header words +8/+18/+26; the v1
   16-byte block at +32..+47 is fully consumed by v2's own fields), nowhere
   near the 40 bytes a GBOC record needs. See the "GBBOOT pipeline vs GBMR
   wire format" section above for the full derivation. GBBOOT's 477-byte
   budget (unchanged as of 2026-09-09) is not the blocker here and never was
   — `cokhost.inc` (GBBOOT's real orchestration of this pipeline) never
   touches `cm_gboc`/`cm_gbef_rng`/`cm_destroy` at all; those live entirely
   inside CCINV.COM, which has ~12,130 bytes free after the prior round's
   edits.

   **RE-DERIVED AND SHARPENED AGAIN, SAME DAY, DESIGN ROUND.** The "6
   scattered, non-contiguous" reserved-byte count above is corrected by the
   "GBMR v3 design — 2026-09-09 (design round; no `.asm`/`.inc` byte
   changed)" section below: it is **8** bytes (offsets 18, 26, and a
   genuinely contiguous 4-byte span at 44-47 present in both v1 and v2, not
   only "consumed by v2's own fields" as stated here), and offset 8 was
   miscounted as reserved when it is the load-bearing phase field. This does
   not change the conclusion (8 is still far short of 40). What the design
   round adds beyond a corrected count is a full proposed v3 layout, an
   exhaustive file/function/line checklist, and — the actually new
   finding — that `cokcommit.inc`'s existing byte-identity check over
   `core+32..5797` already forbids the one field (the embedded GBEF's RNG
   dword at `core+174`) a GBOC-authorized candidate must be allowed to
   change, independent of where the 40 bytes live. See that section for the
   full derivation, the proposed narrow carve-out, and the revised
   feasibility verdict (bigger than this item's own framing suggested, not
   smaller).
3. **PARTIALLY DONE, 2026-09-09, at a narrower boundary.** The native
   RNG-fold and CRC-self-check now exist as real assembly
   (`cm_authorize_output`/`cm_output_crc` in `native/src/cokremove.inc`) and
   a DOS test driver in the style of `native/cokmutation-test.ps1`/
   `cokremove-driver.asm` dynamically proves them (394 DOS cases, see the
   dated section above). What item 3 originally meant by "the mutation
   contract" — the full GBMR v3 request/response envelope — is **not** done;
   that is item 2, unchanged.
4. **STILL OPEN, and sharper than before.** This round's authorization is
   narrower than "any callback in `AUTHORIZED_OUTPUT_CALLBACKS`" — it is a
   single-owner (`target_ordinal == 1`), `cm_remove_effect`-boundary-only
   authority with no GBMR/GBEF-file wiring at all, proven only at the
   standalone driver boundary, not through a live CCECL/GBEF checkpoint or
   resume. `AUTHORIZED_OUTPUT_CALLBACKS` stays the empty `frozenset()` on
   purpose; adding to it would claim the full contract is authorized when
   only this narrower one is. Before that set gains a first entry, item 2's
   full envelope has to exist and this callback's target/consumer contract
   has to be re-verified running through it, the way task 1 verified
   `14F24h`'s supplier and non-consumption — not merely because the
   `cm_remove_effect`-boundary RNG arithmetic happens to check out.

Until item 2 lands, `tools.cok_mutation_output`'s effect-7 rejection (and
every other callback's non-authorization for RNG/damage output through the
full GBMR v3 contract) remains exactly as strict as it was before this
document. What changed 2026-09-09 is a real, dynamically-proven, narrower
authorization at the `cm_remove_effect` boundary — not a change to that
contract or that frozenset.

## C-stage stage->validate->commit->resume, real DOS, end to end — 2026-09-09 (continuation)

Item 2's real GBMR v3 wire path is now dynamically proven through **every**
stage on real DOSBox execution, not just B/M as before: real `CCECL /D`
(genuine yield) -> real `CCINV B` (v3 GBOC-copy manifest branch) -> real
`CCINV M` (owner-loop routing + `cm_authorize_output`) -> real `CCECL CHECK`
-> real `CCINV C` (`cokcommit.inc`'s v3 carve-out, the one leg with no prior
dynamic proof at all) -> real `CCECL MUTATE` (resume from the published
active state). Harness: `tools/cok_native_commit_v3.py` +
`native/cokcommit-test.ps1`. One case (`CVALID`) drives the full six-step
pipeline to a genuine kind-7 damage RNG-fold authorization and a clean
resume (`memory[0x90EE]==42`, i.e. the resumed VM executes past the removal
opcode); four sibling cases reuse its genuine request/candidate pair to
prove the carve-out is exactly as narrow as designed:

- `CRNGBAD` — candidate's `core+174` changed to a value that does not
  re-derive from the request's own GBOC draws/rng_before -> **REJECT**.
- `CGBOCBAD` — candidate's appended GBOC block `[13224,13264)` has one byte
  flipped (the request/candidate GBOC block-identity check) -> **REJECT**.
- `CSMUGGLE` — candidate's `core+174` is the *correct* fold (byte-identical
  to `CVALID`'s) but one FX-region byte at offset 300, well inside the
  unconditionally-checked `[178,5798)` span, is also flipped -> **REJECT**.
  This is task 5(e): the carve-out only ever widens to admit the one RNG
  dword, never anything else.
- `CREQBAD` — the *request's own* `core+174` is corrupted, so the request's
  embedded `GBOC.rng_before` no longer matches its own paused RNG, with an
  otherwise-untouched valid candidate -> **REJECT** (the
  `.req_gboc_rng_ok:` hand-forged-request check).

Every rejection case additionally asserts the untouched activation files
(`ACT.GBP`/`ACT.BIN`/`ACT.IV`) are byte-identical before and after the
DOSBox run (`mc_fail`'s rollback contract), so a REJECT is proven to mean
"nothing was published," not merely "the exit code was nonzero."

**Mutation-tested, 2026-09-09.** Both new `cokcommit.inc` checks were
independently proven load-bearing by temporarily replacing their `jne
mc_fail` with an unconditional fallthrough, rebuilding, and re-running the
harness: weakening the RNG re-derivation check (`.rng_expected:`'s `cmp eax,
[core+174] / jne mc_fail`) made `CRNGBAD` wrongly commit, and
`cok_native_commit_v3.finish()`'s `assert ... == ['FAIL']` caught it
immediately (`AssertionError: CRNGBAD`). Weakening the 4th, GBOC
block-identity check (`core+13224` vs `mc_request+13224`, 40 bytes)
similarly made `CGBOCBAD` wrongly commit and the harness caught that too
(`AssertionError: CGBOCBAD`). Both mutations were reverted to
byte-identical source (confirmed by re-reading the diff before reassembling)
and the harness reconfirmed green afterward.

**Four real bugs found and fixed getting here, three of them harness bugs
and one a genuine fixture-format bug — recorded because each one produced a
misleading symptom that pointed away from its actual cause:**

1. **DOS 8.3 filename truncation**, misdiagnosed in the previous session as
   "CCINV C hangs." Variant folder/log names longer than 8 characters
   (`CRNGWRONG`, `CGBOCTAMPER`, `CREQMISMATCH`) silently mis-resolved both
   `cd \{name}` (leaves execution in the wrong directory) and `C:\{name}.LOG`
   (silently truncates), producing a cascading wrong-directory batch run that
   read as a hang from outside DOSBox-X's own automation timeout. Fixed by
   shortening every variant name to <=8 characters
   (`CRNGWRONG`->`CRNGBAD`, `CGBOCTAMPER`->`CGBOCBAD`,
   `CREQMISMATCH`->`CREQBAD`).
2. **Missing per-variant `ITEMS` file.** `mb_items_path`
   (`native/src/cokrequest.inc`) derives the "ITEMS" lookup path from the
   manifest's own code-path entry's directory component; since that entry is
   a bare filename, CCINV looks for `ITEMS` in its own *current* directory,
   not the shared fixture folder. Every C-stage variant subfolder needed its
   own copy.
3. **Missing per-variant `KRYNN.CFG` file** — same shape as (2), different
   file. `sniff_dialect` (`native/src/ccecl.asm`) sets `[is_cok]` by probing
   for `KRYNN.CFG` (Gen1 CoK) vs `DKK.CFG` in CCECL's current directory, and
   `cokresume.inc`'s `ir_read` (the real GBMR-v3-aware `/R` candidate
   validator behind `CHECK`/`MUTATE`) requires `[is_cok]==1` as its very
   first check. Without a per-variant copy, `CVALID`'s own `CCECL MUTATE`
   resume leg found `[is_cok]==0` and rejected immediately with "CCECL: bad
   or unsupported resume state" — a message that names none of the ~50
   structural/GBOC-adjacent checks that follow it. Diagnosed by temporarily
   instrumenting `ir_read`/`ir_apply`/`ir_active` with a debug tag dumped to
   a file on failure (reverted afterward, confirmed byte-identical to the
   pre-instrumentation source): the tag isolated the failure to `ir_read`'s
   opening `cmp byte [is_cok],1`, immediately ruling out every later check.
4. **The genuine fixture bug: `SEED.BIN` never encoded real per-owner
   timer/effect state**, so M-stage's `cm_remove_effect` had nothing to
   authorize even though `cm_gboc` was correctly routed. Two sub-bugs, both
   in `tools/cok_native_commit_v3.py`'s `_seed()`:
   - The OWNED bitmap ([282,540) of the seed) and raw GBPT timers blob
     ([540,3112)) were essentially all-zero instead of being derived from
     `tools.test_cok_party_removal.packets()`'s own item/effect fixture data,
     using the same `owned[2+32*(owner-1)+(kind>>3)] |= 1<<(kind&7)`
     derivation `tools.cok_mutation_packet.request()` already used.
   - Even after deriving that correctly, real `CCECL /D` rejected the seed
     outright with "CCECL: bad or unsupported party seed sidecar." Reading
     `read_seed_file`'s version-6 branch (`native/src/ccecl.asm:5420-5425`)
     located the cause: when the copied timer count is nonzero it requires
     `word [seedbuf+PS_V3_LEN]` (seed offset 282 — this OWNED region's own
     first word) to equal exactly `1`, a sentinel distinct from the 256-byte
     self-consistency array that follows it at offset 284
     (`PS_V3_LEN+2`). `_seed()` never wrote that sentinel, leaving it 0.
     Setting `seed[282:284] = 1` (matching `cok_party_removal.stage()`'s own
     `expected_owned[0] = 1` convention, already relied on elsewhere) fixed
     it; the 256-byte self-consistency region was already correct.

**Byte budgets, re-measured 2026-09-09 (before figures from
`docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md`; both `pwsh -NoProfile -File
native/build.ps1 -Target engine`):**

| Executable | Before (resident bytes) | After (resident bytes) | Delta |
| --- | --- | --- | --- |
| GBBOOT.COM  | 64,803 | 64,803 | +0 (byte-identical; unaffected by this work) |
| CCECL.COM   | 64,167 | 64,253 | +86 (`cokresume.inc`'s v3-aware `ir_read`: `IR_LEN_V3` tail read/CRC-scope widening) |
| CCCOMBAT.COM | 63,880 | 63,880 | +0 (byte-identical; unaffected by this work) |
| CCINV.COM   | 53,150 | 53,809 | +659 (`cokcommit.inc`'s v3 carve-out: RNG re-derivation, GBOC block-identity check, `.v3_middle_split:` branch) |

GBBOOT and CCECL both remain comfortably under the 65,280-byte `.COM`
segment ceiling (477 and 1,027 bytes of headroom respectively).

**Net effect on the task-brief's numbered requirements.** Task 2 (integrity
carve-out) is now proven both positively (`CVALID`) and negatively
(`CRNGBAD`/`CGBOCBAD`/`CSMUGGLE`/`CREQBAD`), with the two new checks
mutation-tested. Task 3 (wire a real path) is done — B/M/C/resume all run
for real, on real DOSBox, from a real `CCECL /D` yield. Task 4 (byte
budgets) is done, table above. Task 5(a)-(e) are all proven: (a)/(b)/(c)/(d)
via the existing 158-case suite plus this harness's `CRNGBAD`, (e) via
`CSMUGGLE`. Task 6 (mutation-test the new checks) is done, above.

**Task 7 (full 27-script flow sweep, diffed against the committed
`flow-status.json`) is now done too.** `native/run-flow-suite.ps1
-KeepLogs` was run twice: once against the still-uncommitted v3 source and
once more after committing it (`6e93796`), so the artifact ultimately
committed reflects a clean tree. All three artifacts — the pre-existing
committed baseline (`c3342f28`) and both new runs — agree to the byte:
**19 PASS / 8 FAIL / 0 SKIP of 27**, every one of the 27
`(name, status, needle)` tuples identical. The 8 reds are the same
pre-existing, already-documented set (`gbdqk-intro-flow-test`,
`ccecl-dqk-vmrun-test`, `ccecl-dqk-combat-test`,
`ccecl-dok-combat-gap-test`, `ccecl-dok-thief-matrix-test`,
`gbdqk-combat-flow-test` [quarantined], `gbcoab-flow-test`,
`gbdqk-flow-test`) — zero regressions anywhere in the flow suite from this
GBMR v3 work. All seven numbered requirements in the task brief are now
complete; `AUTHORIZED_OUTPUT_CALLBACKS` remains the intentionally empty
`frozenset()`, so effect 7 (or any callback) is still not authorized to
reach a real player through ordinary play — that is a separate, deliberate
decision, not an open item of this brief.
