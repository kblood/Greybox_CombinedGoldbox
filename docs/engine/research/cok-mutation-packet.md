# Native CoK combined mutation packet

Source `e35ecd0`, 2026-09-08. `CCINV M inventory request response` now creates a
single combined item-removal candidate. It does not activate live game state or
resume CCECL. Owned DESTROY_ITEMS still halts. The native helper is checked
against `tools/cok_party_removal.py` through the packet reference in
`tools/cok_mutation_packet.py`.

## Binary layout

All integers are little-endian. A request is exactly 13224 bytes. A response has
the same fixed core followed by one complete GBIV envelope. CRC32 covers the
whole file with bytes 28–31 treated as zero. Sharing offsets with GBCP avoids
another roster/effect buffer in CCINV; GBMR is not a GBCP camp checkpoint and must
never be passed off as one.

| Offset | Size | Meaning |
| --- | --- | --- |
| 0 | 4 | `GBMR` |
| 4 | 2 | Version 1 or 2 |
| 6 | 2 | CoK game ID 1 |
| 8 | 2 | Phase: request 0, completed candidate 1 |
| 10 | 2 | Active ECL area/block |
| 12 | 2 | Failure PC, still pointing at DESTROY_ITEMS |
| 14 | 2 | Checked successor PC |
| 16 | 2 | Target item type, 0–255 |
| 18 | 2 | Reserved zero |
| 20 | 2 | Actual GBPR length, 16 + 410 × owner count |
| 22 | 2 | GBEF length, 5750 |
| 24 | 2 | Fixed core length, 13224 |
| 26 | 2 | Reserved zero |
| 28 | 4 | Whole-file CRC32 |
| 32 | 16 | Version 1 reserved zero; version 2 execution context (below) |
| 48 | 5750 | Paused GBEF v9 |
| 5798 | 2476 | CoK GBPR, zero padded after its actual length |
| 8274 | 258 | Owned-effect flag word and eight 32-byte owner bitmaps |
| 8532 | 2572 | Canonical timer state, including owner/source metadata |
| 11104 | 8 | Opaque learning state, preserved |
| 11112 | 32 | GBMC continuation frame below |
| 11144 | 2048 | 128 CoK item definitions, excluding the ITEMS file header |
| 13192 | 32 | Exact inventory type bitmap, including type zero |
| 13224 | variable | Response only: GBIV, with its own length and owner rows |

The GBMC frame is deliberately separate from GBEF's existing GBHD words:

| Relative offset | Size | Meaning |
| --- | --- | --- |
| 0 | 4 | `GBMC` |
| 4 | 2 | Version 1 |
| 6 | 2 | Frame length 32 |
| 8 | 2 | Comparison left operand |
| 10 | 2 | Comparison right operand |
| 12 | 6 | EQ, NE, LT, GT, LE, GE boolean bytes, preserved verbatim |
| 18 | 1 | Selected character valid |
| 19 | 1 | Selected character not found |
| 20 | 2 | Selected one-based party ordinal, or zero |
| 22 | 2 | Active block length, 22–16384 |
| 24 | 4 | Original GBIV CRC32, covering every unmodified input byte |
| 28 | 4 | Original GBIV byte length |

The response retains the original GBMC inventory digest and length, failure PC,
successor, GBEF, definitions and learning bytes. Its mutated sections are GBPR,
timers, owned-effect matrix, inventory-type bitmap and appended GBIV; phase and
whole-file CRC change. Equipment/list pointers in bodies and surviving records
are zero. Runtime equipment pointers must be reconstructed from the surviving
inventory, not interpreted as DOS addresses from the packet.

## Native validation and staging

Before creating output, CCINV checks exact request length/CRC, header and frame
versions, CoK roster shape and padding, unique owner IDs, selection consistency,
boolean flag bytes and PC bounds. GBEF must be v9/status 4, with GBRS flag zero,
matching area/PC, GBHD reason 6/opcode 40h, bounded stack/memory/event counts and
expected extension magics. Timer state must be canonical, at most 256 entries,
with valid one-based owner ordinals and source metadata, and its nonzero effect
IDs must exactly reproduce the supplied owned-effect matrix. GBIV must validate
against the roster and match the supplied original length, raw CRC and type bitmap.

These are structural and consistency checks. The helper does not read the active
ECL block, decode its operand, or prove that its supplied definitions came from the
held ITEMS file. CCECL/the host must supply and validate those before invoking it.
The byte bounds alone do not prove the successor is an instruction boundary.

The helper streams one owner's item records into a distinct GBIW scratch file,
with stable 32-bit next indices. It gathers that owner's effects and invokes
`cokremove.inc`. A completed owner's live records may be compacted into the
unpublished output; subsequent owners cannot reference those records. Any later
failure discards the entire staged output. No earlier owner's changes are activated.
After all owners succeed, surviving effects are compacted in their original global
order, owner query bitmaps are rebuilt, and the header and CRC are completed.

The response must not already exist. `.NEW` and `.IWK` scratch paths are derived
from its three-character extension and created with DOS create-new, never truncate.
Existing files and response paths using those reserved extensions reject. Only
scratch files created by this invocation are removed on failure. The final DOS
rename refuses an existing target, so a late collision cannot overwrite it. There
is no cross-file activation here and no retail STF/SFX export.

## Verification and remaining bridge

`native/cokmutation-test.ps1` passes **128 real DOS cases**. The standing wrapper
and combined-reference suite pass **50 tests in 9.85 seconds**
(`build/native-mutation-tests.log`). Successful response bytes match the independent
party reference completely, including unchanged queued VM events and continuation.
Cases cover zero to six owners, nested order permutations, supported ability
effects, retail and native-created owner IDs, 1101-item streams crossing a 64-KiB
file offset, late-owner and self-deletion rejection, malformed re-sealed requests,
stale/truncated inventory, existing files and reserved-extension aliases. Request
and inventory hashes stay unchanged; rejected cases leave no candidate or new scratch.

The engine build passes (`build/native-mutation-build.log`): CCINV uses 32279
resident bytes; GBBOOT and CCECL remain at 64503 and 63491. The helper has room for
response validation/activation work while the host segment remains constrained.

The remaining live bridge must produce the checked yield/frame, invoke M with a
fresh response path, require a successful child exit, validate the returned candidate
against the still-pending request and live state, and activate party/inventory/effects
together. It must preserve selection/comparisons and apply queued host effects exactly
once. Do not reuse combat resume's comparison reset. Do not consume an old response
after a failed invocation. Cold checkpoint round trips and failure-PC preservation
remain required before removing the live owned-inventory halt.

The clean-source flow sweep finished **2026-09-08T11:40:36Z**, **19 PASS /8 known
FAIL /0 SKIP**; all 27 exact status/needle tuples match the preceding kernel sweep.
No retail files changed; only the known DOSBox directory timestamp moved.
The full armed corpus reports **4799 passed /2 inherited failed /1 skipped of
4802** in 452.41 seconds (`build/native-mutation-corpus.log`). The inherited
browser export audits are the only failures. See `native/flow-status.json` and
`build/native-mutation-compare.log` for the native comparison.

## Checked CCECL yield export — 2026-09-08

Source `b7ed79c` adds `native/src/cokyield.inc`. Owned CoK DESTROY_ITEMS now checks
the complete operand frame before reading it, resolves the byte target, and keeps
PC at the failure opcode. Truncated CoK operands produce the existing bad-opcode
halt reason 1, without a yield sidecar. DoK/generic owned halts and legacy seed
removal retain their previous paths. Live removal is still not activated.

A successful CoK inventory halt with effect output also writes a **52-byte GBIY**
companion, replacing the effect filename's final extension with `.YLD` or appending
it when absent. It uses DOS create-new: the companion must not already exist.
An existing file/directory or an alias with the effect filename fails the child
operation. The host must consume/clean its own prior sidecar before reusing that
output name and must require a successful CCECL exit before consuming the pair.

| Offset | Size | Meaning |
| --- | --- | --- |
| 0 | 4 | `GBIY` |
| 4 | 2 | Version 1 |
| 6 | 2 | Length 52 |
| 8 | 2 | Failure PC |
| 10 | 2 | Checked successor PC |
| 12 | 2 | Resolved byte target |
| 14 | 2 | Active area/block, FFFFh for raw block fixtures |
| 16 | 32 | GBMC frame, with original-inventory CRC/length initially zero |
| 48 | 4 | CRC32 of every byte of the paired 5750-byte GBEF |

The export reuses dead decompression scratch and the completed dialect-detection
path buffer. Fresh-block comparison operands are initialized to zero alongside
the already-zero comparison flags. The native build measures CCECL at **63967
resident bytes**, leaving 1313 bytes under the build guard; GBBOOT is unchanged.

The GBMC selection state is explicitly **before operand consumption**. The native
7D00h selected-status getter clears `selected_not_found`. Yield preparation saves
and restores that byte while resolving the target. After successful activation,
continuation must validate and consume the original operand exactly once before
advancing to the recorded successor; skipping straight to the successor would
omit that getter side effect. A failed mutation must retain the pre-operand state.

`tools.cok_mutation_packet.from_yield` validates the paired GBEF CRC and frame bounds,
then fills the original inventory digest and constructs the GBMR request. The DOS
test uses this host reference constructor between actual CCECL and CCINV processes;
this is not a native GBBOOT request constructor or live activation path.

The continuation audit also finds that GBEF contains runtime encounter context:
`op_approach` reads `FX_HAVE_SETUP` and decrements `fx_setup_dist`; repeated file and
piece loads compare previous values and `bridge_repeat_count`. Preserve this
context while avoiding replay of completed host actions. The current GBMC does not
serialize step/chain/repeat counters; resume integration must address those limits
rather than assuming the existing combat reset preserves an in-block continuation.

The standing yield and combined-helper wrappers pass **2 tests in 16.22 seconds**
(`build/native-yield-tests.log`), verifying **307 DOS yield cases and 26 DOS
native yield-to-mutation candidates**. Cases include all immediate byte targets,
variable and inline framing, nonzero values in every comparison flag position,
signed comparisons, stateful selection reads, truncation and output collisions.
Successful pipeline candidates include actual item deletion and agree byte-for-byte
with the combined reference. Input hashes remain unchanged; mismatched GBEF bytes
reject in the host constructor. This demonstrates the two native endpoints with
a host reference between them, not a live native host bridge.

The engine build passes; the clean-source sweep finished **2026-09-08T12:14:16Z**,
**19 PASS /8 known FAIL /0 SKIP**, with all 27 exact status/needle tuples unchanged
from the helper sweep. No retail files changed; the known DOSBox directory timestamp
touch remains. Evidence: `build/native-yield-engine-build.log`,
`build/native-yield-compare.log` and `native/flow-status.json`.

The full armed yield corpus reports **4800 passed /2 inherited failed /1 skipped
of 4803** in 420.87 seconds (`build/native-yield-corpus.log`). The same two browser
export audits are the only failures. Native source remains clean and unchanged
from the measured sweep while the additional comparison cases extend the DOS fixture.

## Native request construction — 2026-09-08

Source `bd2d0fd` adds `CCINV B manifest request` in `cokrequest.inc`. The native
constructor now replaces the host reference between CCECL's yield and CCINV M.
It emits a GBMR request; it does not invoke M, activate the resulting candidate,
export retail saves or resume CCECL. GBBOOT still needs manifest production and
coordination of these stages.

The **GBMB v1 manifest is exactly 672 bytes**, with a 32-byte header followed by
five fixed 128-byte DOS ASCIIZ path slots. Each path must be nonempty, terminated
inside its slot and zero padded after the terminator. Header layout:

| Offset | Size | Meaning |
| --- | --- | --- |
| 0 | 4 | `GBMB` |
| 4 | 2 | Version 1 |
| 6 | 2 | Length 672 |
| 8 | 8 | Reserved zero |
| 16 | 8 | Current host learning state, preserved in the request |
| 24 | 4 | Reserved zero |
| 28 | 4 | CRC32 of the entire manifest, with this field zeroed |
| 32 | 128 | Owned GBIV input path |
| 160 | 128 | Paired GBEF output path |
| 288 | 128 | Current CoK GBPR path |
| 416 | 128 | Current GBPS v6 seed path |
| 544 | 128 | Active ECL source path, used to locate sibling ITEMS |

The constructor validates manifest length, version, CRC and padding; reads the
exact GBEF and its derived `.YLD` companion; checks their pairing and unbound
GBMC inventory fields; and copies the checked target, PCs, area and frame into
GBMR. It reads the actual roster and the required fields of an exact-length GBPS
v6 seed: flags/count, owned-effect state, timers and inventory bitmap. Seed owner
count must equal the roster count, and all sixteen pending age-delta bytes must
be zero. The host must synchronize those deltas first; silently dropping them
would lose character aging. This does not claim validation of every unused seed
prefix field.

GBIV is streamed against roster ownership and the seed's type bitmap, and its
full original byte length/CRC are bound into GBMC. The supplied ECL source must
exist. B locates ITEMS beside that path, skips two header bytes and reads the
first 2048 definition bytes; trailing data is allowed. It does not decompress the
ECL source or independently prove operand identity against its contents. Actual
source validation remains required at continuation.

B invokes the same in-memory request validator as M before writing output, so
selection/PC/GBEF and timer-matrix checks do not drift into a second weaker copy.
Learning bytes come from the manifest's current host state, not a stale learning
request or a zero substitute. The constructor stages the complete request through
create-new `.NEW` output and a final rename that refuses an existing destination.
A three-character output extension is required, and `.NEW` is reserved. Existing
manifest/input/output files remain intact on collisions; only newly created staging
is cleaned up on failure.

The DOS tests now run **26 CCECL → native B → native M candidates**, with complete
request and response bytes checked against the host reference and all pipeline
input hashes rechecked afterward. An additional **65 constructor controls** include
62 expected rejections and three successful requests. They cover re-sealed malformed
manifests, unterminated paths, stale yield pairs, malformed frames, owner/seed/timer
inconsistency, pending ages, missing/truncated input, existing-file/directory aliases,
and definition lookup in a dotted subdirectory with deliberately different root
ITEMS bytes. The positive trailing-data case checks the first-definition-block rule.
The yield and existing M wrappers pass **2 tests in 18.57 seconds**
(`build/native-request-tests.log`), retaining the 307 yield and 128 standalone M cases.

The full native build passes (`build/native-request-engine-build.log`): CCINV is
**34125 resident bytes**; CCECL remains 63967 and GBBOOT 64503. The native host
manifest producer can use existing `fxbuf` and `buffer_crc`; larger activation and
validation work belongs in the helper. Live activation/continuation and cold
checkpoint verification remain outstanding.

The clean-source flow sweep at `bd2d0fd` finished 2026-09-08T12:46:02Z:
**19 PASS /8 known FAIL /0 SKIP**, with all 27 exact status/needle tuples unchanged
from `b7ed79c`. No retail files changed; only the known DOSBox directory timestamp
touch was observed. The full armed corpus reports **4800 passed /2 inherited
failed /1 skipped of 4803** in 426.63 seconds. The two failures remain the browser
export audits. Logs: `build/native-request-sweep.log`,
`build/native-request-compare.log`, `build/native-request-corpus.log`.

## Execution context for continuation — 2026-09-08

Source `18357b3` replaces the emitted GBIY v1 sidecar with **GBIY v2, 72 bytes**.
Offsets 8–51 retain the earlier meanings; the version/length words become 2/72.
The added 16-byte execution context is copied into GBMR v2 at offset 32, replacing
its reserved area without shifting any body, timer or inventory offsets:

| GBIY offset | GBMR offset | Size | Meaning |
| --- | --- | --- | --- |
| 52 | 32 | 2 | Current block instruction count, including the yielding instruction |
| 54 | 34 | 2 | Completed NEWECL chain transitions |
| 56 | 36 | 2 | Stable LOAD_FILES/LOAD_PIECES repeat count |
| 58 | 38 | 2 | Host damage-event watermark; initially zero |
| 60 | 40 | 4 | CRC32 of the entire loaded, decompressed ECL block |
| 64 | 44 | 4 | Reserved zero |
| 68 | — | 4 | CRC32 of the preceding 68 GBIY bytes |

The sidecar checksum now protects the target/frame/context as well as binding the
paired GBEF. B requires v2 and validates that checksum before construction. M
still stages v1 requests with the original zero-reserved rule; v2 requires an
instruction count in 1–59999, at most 32 chain transitions, fewer than 16 bridge
repeats, a damage watermark no larger than the script-event count, and zero final
reserved bytes. Both helpers preserve the context through the complete candidate.
The actual source checksum comparison and advancing the host damage watermark
remain work for the live continuation consumer. Merely carrying these fields
does not yet prevent replay or enable resume. Successful resume must continue
after the already-counted instruction without charging it again.

The focused wrappers pass **2 tests in 19.05 seconds**
(`build/native-context-focused.log`): **310 DOS yields, 72 constructor controls,
29 complete native pipeline candidates**, plus the existing 128 standalone M cases.
Added real scripts reach 32 NEWECL transitions and 15 stable bridge repeats;
checks distinguish the decompressed final block from its archive bytes. Re-sealed
out-of-range contexts reject, and a changed source digest with a stale sidecar
checksum rejects. Complete candidate bytes still match the reference.
The full engine build passes (`build/native-context-engine-build.log`), with
CCECL at 64016 resident bytes and CCINV at 34247; GBBOOT remains 64503.

The clean-source sweep finished **2026-09-08T13:09:48Z** at `18357b3`, with
**19 PASS /8 known FAIL /0 SKIP**. All 27 exact status/needle tuples match
`bd2d0fd`; creation/camp passes in 176.34 seconds. Retail files remain unchanged;
the known DOSBox directory timestamp touch remains. Evidence:
`build/native-context-sweep.log`, `build/native-context-compare.log`.

The full armed corpus reports **4800 passed /2 inherited failed /1 skipped of
4803** in 441.27 seconds (`build/native-context-corpus.log`). Only the two inherited
browser export audits fail; no new native regression was detected.

## Native VM validation and continuation — 2026-09-08

Source `c20ab5d` adds two reserved uppercase outcome tokens to CCECL's existing
`/R` option, with the source file/archive and `/B` roster and `/G` seed still
supplied normally:

```
CCECL CODE.BIN /B PARTY.GBP /G SEED.BIN /R RES.BIN CHECK
CCECL CODE.BIN /B ACT.GBP /G ACT.BIN /R RES.BIN MUTATE /E NEXT.EFX
```

`CHECK` reads the complete candidate CRC and validates its v2/phase-1 VM header,
GBMC flags and selection, bounded counts, active return addresses, paired halt
metadata and actual loaded block length/CRC. It re-evaluates the operand using
the supplied original party, matching both target and successor. Archive input
selects the yielded block and reloads the candidate after decompression reuses
its buffer. Successful CHECK exits before trace/effect output or seed writeback;
even `/T` and `/E` do not create output in this mode.

`MUTATE` performs those checks again and requires the supplied active roster to
match the candidate bytes exactly. Owned item bits, owned effects, timer state
and party count must match too; pending age deltas reject. This verifies the
state the VM reads, not the active inventory file, whose path is not a CCECL
argument. Complete GBIV validation and combined publication remain the host/helper
activation layer's responsibility. CHECK is therefore a VM/source check, not a
claim that every byte of an arbitrary candidate is semantically valid.

The restore path retains full GBEF encounter/NPC/script/setup state, RNG, clock,
call stack, sparse memory, exact comparison operands/flags and selected-member
state. It consumes the checked operand once, clears the pending-yield marker and
continues at the successor without charging DESTROY_ITEMS again. Step, chain and
bridge-repeat counts survive. A later DESTROY_ITEMS can produce another fresh
yield. Existing combat resume behavior remains separate.

For DAMAGE entries below the supplied host watermark, continuation zeroes their
argument count, which makes the existing host reader skip them. Queue length and
all other entries remain intact. Entries above the watermark remain pending.
The ordinary host does not yet produce this acknowledgement; the fixture supplies
it explicitly. This tests consumption of acknowledged events, not a full host
HP-writeback transaction.

The focused wrappers pass **2 tests in 26.78 seconds**
(`build/native-resume-focused.log`): **314 native yields, 72 constructor controls,
33 candidate/continuation paths, 27 rejected continuations, one consecutive-removal
round trip**, and the existing 128 standalone M cases. The tests verify selected
7D00 status is consumed once, signed comparison flags survive a second yield,
a live subroutine return executes its caller, and retained encounter setup drives
APPROACH from distance five to four. Pending/acknowledged damage is distinguished.
Source changes outside the operand, re-sealed wrong opcodes/targets, malformed
frames, invalid return addresses and mismatched active files reject without
changing input files or creating effect output. Fixture Python stages active
roster/seed/inventory files between native processes; GBBOOT does not yet do so.

The full engine build passes (`build/native-resume-engine-build.log`). CCECL is
**64186 resident bytes**, after reclaiming 1152 bytes by sharing DAX and HLIB/GLIB
directory scratch without reducing either capacity. CCINV remains 34247 and
GBBOOT 64503. Next: native combined activation, host coordination and damage
acknowledgement, derived party-state refresh, and a cold checkpoint round trip.

The clean-source sweep finished **2026-09-08T13:41:37Z** at `c20ab5d`, with
**19 PASS /8 known FAIL /0 SKIP**. All 27 exact status/needle tuples match
`18357b3`; creation/camp passes in 173.96 seconds. Retail files remain unchanged;
the known DOSBox directory timestamp touch remains. Logs:
`build/native-resume-sweep.log`, `build/native-resume-compare.log`.

The full armed corpus reports **4800 passed /2 inherited failed /1 skipped of
4803** in 457.23 seconds (`build/native-resume-corpus.log`). The two failures are
the inherited browser export audits; no new native regression was detected.


## Native combined activation — 2026-09-08

Source `11945a5` adds `CCINV C manifest original-request candidate`. Run CCECL
CHECK against the original party first. C validates the manifest, original GBMR
v2, current complete inventory digest/ownership, roster, GBEF, owned seed/timers,
learning bytes and sibling ITEMS definitions. It checks candidate CRC, ownership,
structure and type bitmap, and compares immutable VM/context/frame/definition
fields and owner identities to the original request. C does not itself inspect
source opcodes; successful CHECK remains a caller ordering requirement.

All three new files are staged before any active file is renamed. Indexed sibling
`.MS0` through `.MS2` stages and `.MB0` through `.MB2` backups avoid collisions
when input files share a basename. Existing files or directories at any scratch
path reject without deletion. Ordinary failures roll back completed renames;
if rollback itself fails, backups remain recoverable. This is not power-failure
atomicity. Successful activation can leave a backup if its cleanup fails.

The GBPS prefix is preserved except movement count/words: these are rebuilt from
each candidate body's byte 408. Owned effects, timers and all 256 item-type bits
are replaced together. Thief overrides remain in the prefix: supported removal
callbacks do not change those skills. No retail SAV/STF export happens here.

The pipeline fixture now runs CHECK, native C, then MUTATE, including a second
removal against the same active files. Python computes expectations and prepares
initial inputs; it no longer publishes active state between the native steps.
There are 316 yields, 72 constructor controls, 35 candidate/continuation paths,
27 continuation rejections, one consecutive-removal round trip, 39 activation
controls and 128 standalone M cases. Activation controls include zero through
six owners, 1101 inventory nodes, stale inputs, occupied stage/backup paths, and
test-only faults before each of the six publication renames. Complete active
bytes and preserved inputs are checked. The focused tests pass 14 cases in
32.60 seconds (`build/native-activation-focused.log`); clock/timer and generic
CCECL effect wrappers pass separately.

Twelve original-code tests execute CoK CHECKPARTY. The unmodified movement loop
reads byte 408 without scaling and divides the sum only by party count. Full
handler execution with the actual operand reader verifies 7C9Fh movement and
7CA5h thief queries; the old generic 809Eh encoding leaves output sentinels
untouched. Native CoK decoding now subtracts 7C00h, retaining the existing generic
base for other profiles. Raw selector zero selects the CoK party-affect query.
The clock fixture now supplies KRYNN.CFG so this path is actually selected.
Resumed native queries check movement and nonzero, unequal thief values.

The first sweep returned 18 PASS /9 FAIL because the CoK creation fixture still
encoded its party-affect query with generic 9F40h. Source `4675100` corrects that
fixture to selector zero. The complete creation/camp wrapper then passes
(`build/native-activation-creation.log`); the failed sweep is retained in
`build/native-activation-stale-fixture-sweep.log` and
`build/native-activation-stale-fixture-flow.json`. The final sweep is a new run.

GBBOOT still needs manifest production, helper orchestration, reliable host
DAMAGE acknowledgement and a cold checkpoint round trip. The fixture-supplied
watermark demonstrates VM consumption only, not actual host HP writeback.

The clean-source sweep at `4675100` finished **2026-09-08T14:42:33Z**:
**19 PASS /8 known FAIL /0 SKIP**. All 27 exact status/needle tuples match
`c20ab5d`; creation/camp passes in 172.84 seconds. No retail files changed;
the known DOSBox directory timestamp touch remains. Evidence:
`build/native-activation-sweep.log`, `build/native-activation-compare.log`,
`native/flow-status.json`.


The full armed corpus reports **4812 passed /2 inherited failed /1 skipped of
4815** in 444.28 seconds (`build/native-activation-corpus.log`). The two failures
are the unchanged browser export audits: 757 vs 754 names and 1655 vs 1662 entries.
Collection independently confirms 4815 tests. This native/tools/docs release
requires no website deployment. Browser WIP remains untouched.

## Live GBBOOT integration — 2026-09-08

Source `84e5156` wires the actual DOS host through B -> M -> CHECK -> C -> MUTATE.
GBBOOT builds a GBMB v2 manifest in existing scratch, acknowledges DAMAGE only
after a successful complete scan and file close, and loops over later inventory
yields. It also rejoins this path after CoK combat continuation, preserving the
existing combat-resume transcript. C's movement refresh is imported before the
host rewrites GBPS; owned effects, timers and inventory survive cold checkpoints.

GBMB remains 672 bytes; version 2 adds the host DAMAGE watermark at word 8.
B places it at GBMR word 38 and validates the event-count bound. C requires it
to match the original request. Version 1 remains accepted with reserved word 8
zero. Constructor controls now number 75, including valid v2, excessive watermark,
and reserved-field rejection. Damage I/O/malformed-input failures no longer report
success; partial scans are never acknowledged. Existing deterministic damage
policy is unchanged. Consumed DAMAGE entries are skipped on subsequent resumes.

The real-host fixture covers 12 DOS cases and four cold reloads: one/two removals,
an empty-combat handoff, an applied effect with nested marker deletion, changed
source, missing owned-effect metadata and all six publication rename failures.
It checks complete candidate/unchanged-on-failure rosters, earlier HP damage once,
subroutine return/comparison flags, RNG draws/state including cold reload, clock,
movement, FIND_ITEM and retained owned-effect timers. Restored external STF files
cannot overwrite checkpoint inventory. This is a cold native checkpoint test,
not proof of every retail SAV/STF export path or arbitrary combat callbacks.

The focused group passed 15 tests in 40.17 seconds
(`build/native-host-focused-all.log`); subsequent expanded host coverage passes
one wrapper in 8.42 seconds (`build/native-host-effects-focused.log`). The full
creation/camp regression passes (`build/native-host-creation.log`). That regression
caught the lost combat-resume transcript during refactoring; the output path was
restored before the passing run. Earlier constructor controls also correctly
failed when v2 became valid; their invalid-version case now uses v3.

The engine build passes (`build/native-host-engine-build.log`): GBBOOT 64528,
CCINV 52796, CCECL 64167 resident bytes. The host reuses two temporary buffers
for save-spell/roster import as effect scratch, reclaiming 630 bytes without
reducing capacity.

Remaining: applied callback coverage, unknown/missing effect metadata policy
and broader original campaign behavior. Effect 7 already has 32 range and 72
ability experiments in a synthetic original context; these need standing tests
and coverage of disabled modifiers/footprints before production context and
staged RNG/global outputs are designed. See `build/native-applied-callback-next.md`.
Do not confuse successful supported callbacks with general parity.

The clean-source sweep finished **2026-09-08T15:22:57Z** at `84e5156`:
**19 PASS /8 known FAIL /0 SKIP**. All 27 exact status/needle tuples match
`4675100`; creation/camp passes in 172.84 seconds. No retail files changed;
the known DOSBox directory timestamp touch remains. Evidence:
`build/native-host-sweep.log`, `build/native-host-compare.log`,
`native/flow-status.json`.

The full armed corpus reports **4813 passed /2 inherited failed /1 skipped of
4816** in 472.44 seconds (`build/native-host-corpus.log`). Only the unchanged
browser export audits fail: 757 vs 754 names and 1655 vs 1662 entries. Collection
independently confirms 4816 tests. This native/tools/docs release requires no
website deployment; inherited browser WIP remains untouched.

## Output ownership (RNG/damage) design — 2026-09-08, handoff task 2

Nothing above carries a callback's RNG or damage output through the packet:
the verified applied callbacks (0x0C/0x0E/0x17/0x26) are pure structural
recalculations, and effect 7 (which does consume RNG and compute damage) is
rejected before reaching this contract at all
(`tools/cok_item_removal.py`'s `remove_effect` raises for any kind outside
that set). `docs/engine/research/cok-mutation-output-ownership.md` defines a
versioned 40-byte `GBOC` output record and its enforcement rules, backed by a
Python reference module (`tools/cok_mutation_output.py`) and standing tests
(`tools/test_cok_mutation_output_ownership.py`, 23 cases, mutation-tested).
This is a design plus a Python-level reference/enforcement layer only: no
native source changed, `AUTHORIZED_OUTPUT_CALLBACKS` is empty in shipped code,
and every format in this document is unaffected — GBOC would attach under a
new GBMR header version 3, not any offset used by v1/v2. Effect 7 stays
rejected exactly as before. Read the design doc before extending this packet
with RNG/damage fields.


## 2026-10-02: bound active-roster continuation reads

The resumed C0000 fixture successfully passed CHECK and native activation,
then timed out before writing the next effect file. A diagnostic that closed
its stage file after every write located the stall at `ir_active`'s roster
read. Redirected stdout alone was inconclusive when DOSBox was terminated.

`rbuf` aliases the 14,500-byte compressed-input buffer. The old read placed
up to 2,477 roster bytes at offset 13,224, ending at 15,701: 1,201 bytes past
that buffer, including stack memory. This was a runtime overflow even though
the assembled image itself satisfied the capacity limit.

The comparison now uses 1,024-byte chunks at offset 13,264, after the largest
GBMR header. Each chunk must read exactly its requested extent and match the
corresponding embedded roster bytes. A final one-byte read must return EOF.
The scratch ends at 14,288, leaving 212 bytes inside the shared buffer; a NASM
assertion rejects larger footprints. V2 and V3 retain their existing identity,
CRC, owned-state, and exact-file-length checks.

The focused DOS gate passes 35 continuations and 30 continuation rejections,
including mismatches at roster offsets 1,023, 1,024, and 2,475. It also passes
316 yields, 75 constructors, 35 candidates, 39 activation controls, and one
consecutive mutation round trip. The generated first and second continuation
batches now skip dependent stages after a prerequisite failure. Eight isolated
DOS cases and ten unit cases verify that routing and status alignment. Assembly
controls accept the normal 1,024-byte scratch and exact 1,236-byte available
extent, then reject a 1,237-byte scratch. The engine build leaves CCECL at
23,351 emitted / 64,900 resident bytes with 380 bytes of operating headroom.

The genuine GBMR v3 pipeline also passes: native B, M, CHECK, C, and MUTATE,
plus four commit-stage carve-out rejection controls. Its previously separate
`cokcommit-test.ps1` is now enrolled in the standing Python corpus through
`test_cok_native_commit_v3.py`; the coverage registry counts ten runtime gates
and one separate build gate. The post-fix 36-script flow sweep at `c5740034`
retains 11 PASS / 22 FAIL / 3 SKIP with no status or failure-needle changes.

Full corpus verification at `cec996b8` completed successfully: 5,707 passed,
14 skipped, exit 0. This includes both the repaired v2 continuation gate and
the newly enrolled genuine v3 pipeline; the separate flow sweep still has
the 22 failures disclosed above.
