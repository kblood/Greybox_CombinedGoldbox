# DWF2 cold-process Add and observed sidecar reload plan

Date: 2026-10-15. Astra bounded runtime plan. This document authorizes source-only
launch-package preparation for Luna and Root review; no application has run under
this plan. Luna owns the actual test. The user-authorized coordinator fallback
was specific to the previous DWF2 creation test and is not needed here.

Subsequent outcome: Luna completed the bounded headless reload with both
validators passing; see [actual acceptance](cok-dwf2-cold-reload-acceptance-2026-10-15.md).
The remaining text preserves the original pre-execution plan.

## Scope and immutable inputs

Load the newly saved DWF2 in a fresh process through the original Add menu,
observe the actual WHO/SFX transfers with the accepted optional audit window,
return to the main menu with one character, then close. No View, Save Current
Game, Begin, new creation, second character, original-DOS comparison or campaign
claim is included. This adds a bounded cold-compatibility case if it passes;
it does not complete M1 or any later milestone.

Accepted source directory:
`build/cok-recomp/staging/second-character-prefix-luna-20261015-v3/isolated-save-root`.
Treat it as immutable. Clone only these two regular files into a fresh owned
writable save directory, with no KRA files or other saves:

| File | Bytes | SHA256 |
|---|---:|---|
| DWF2.WHO |409|2db0a9658d32ad63af17fbdcde418d6ecd7e9b7e2918f89f48a5760ff374d4e1|
| DWF2.SFX |27|0af2c5388cab0e03967604beef9d1e03298e4fbe1ee3968eb01ed59238a79ec0|

Creation evidence is [second-character save acceptance](cok-second-character-save-acceptance-2026-10-15.md).
Preserve its original reroll and corrected icon-selection account. The source
was created by audit-v2 with audit off; this reload uses the already accepted
audit-window-v3 executable, not a newly integrated production build.

Executable:
`build/cok-recomp/staging/dos-audit-companion-luna-v3-20261015-a/target/release/cok-recomp.exe`,
20,180,992 bytes, SHA256
`acb20d9b475b993e1a5d1fcefa5bf126442bca69a7b0f4519a3f89283cc01068`.
This hash was independently rechecked while writing this plan. Preserve its
accepted source/build/pin lineage from
[the v3 native and cold-route validation](cok-dos-audit-native-validation-2026-10-15.md).
Do not regenerate guest C or select the obsolete default generated directory.

Accepted WORLD generated directory:
`build/cok-recomp/world-after-cold-bootstrap-sol-20261015-a-v3/luna-source-controls-luna-v3-20261015-a/checkout-one/build/generated`.
Require lifted.c SHA256
`d806268d574996cb0f534d40865a4af7dfcc4bcaee9f2d2b375a80fe3e4eab01`
and manifest.json SHA256
`d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114`,
plus the accepted generated/source input roster. Audit compiled source-roster
hash remains `63add8af18f534a80518964cdcd1231db4dff57adb32736dc2c6d6e65bf527a1`.
This is the accepted binary's historical externally checked roster, not a claim
that production build.rs has acquired the pending integration verifier.

Use `build/cok-recomp/dos-audit-companion-sol-20261015-v3/expected-identities.json`,
SHA256 `de0ce0498a3f5e1156cde49ee88e29b2342fffb69a1f11da4bc7160ec3e59414`,
and its `verify_dos_audit.py`, SHA256
`30789474672c89b7c512e3e16357c25eb2b2e3c5efd8fd68b7ed41d060538d16`.
Both hashes were independently rechecked here. Trusted identities are selected
before launch; never obtain expected identities from the new audit manifest.

## Concrete package before launch

Luna may prepare a fresh named tree such as
`build/cok-recomp/staging/dwf2-cold-add-luna-20261015-a`, with distinct run,
process-log, command-input, publication-receipt and cloned-save directories.
Require absent output paths, regular files, no reparse ancestors and no nesting
or aliasing with retail inputs or accepted save/evidence directories. Retain
source and clone size/hash rosters before launch and after close. Retail inputs,
accepted KRA evidence, DWF2 originals, source pins and binary stay read-only.
Keep original game/repository protection-root bindings explicit.

Prepare a concrete config and reviewed launch supervisor that retains the direct
child handle and redirected streams until termination, with every post-start
operation under finally. Bind the exact binary, generated files, validators,
trusted identities, publisher and input/source rosters. Retain the config and
supervisor hashes. Do not reuse the DWF2 eighteen-command creation replay or the
KRA exact-image gate: those scripts encode different routes and save identities.
Any small launcher adaptation for the new clone roster and audit arguments must
be source-reviewed before launch; it changes no guest or generator code.

Exact guest arguments retain budget60000000, chunk4096, headless operation,
physical input disabled, `--dos-audit on --dos-audit-start-work 16000000` and the
fresh cloned-save path. Global wall limit remains900 seconds and all existing
audit/evidence/resource limits stay unchanged. The only scheduled words are
`[[14500121,7181],[15000000,6480]]`, raw schedule SHA256
`b6294162c00a434dbadd456d03c17917423d32d0d7d0ba5a3d9610ad8c41e3b5`.
No other prequeued input is allowed. Root reviews the complete config, launch
script, pins and fresh-path checks before granting the one-run launch.

For manual publication use the reviewed
`build/cok-recomp/staging/second-character-headless-luna-20261015-v2/publish-reviewed-command-v4.ps1`,
SHA256 `a326ddf6e4c93543da5ea099f6afea83582ac58287c7b387f86b536ebd667e10`.
Require actual owned PID, current frame SHA, schedule SHA, exact next sequence,
current unused capture token and native `command-NNNN.json.tmp` publication.
Tokens can coincide across identical runs by design; freshness is current
process/run publication plus unused within-run identity, not cross-run inequality.

## Original menu interaction

1. Verify fresh owner/PID, work0, paused state, fault0, exact resource limits and
   initial unsupported-display/no-image state. Root may then authorize the
   existing bootstrap-to16000000 command. Confirm the two scheduled words were
   consumed in order and inspect the fresh original-resolution menu BMP.
2. Root selects Add from the actual visible menu, one reviewed key at a time.
   Each command must receive a complete accepted/completion receipt and fresh
   healthy paused frame before the next command. Settle commands are also
   reviewed actions. Never substitute KRA's expected screenshots, work endpoints,
   seven-word route or character name for DWF2's observed result.
3. In the original Add list, verify that DWF2 is the only offered saved character.
   Select only DWF2 from the current prompt. Observe loading and the marked entry;
   record any actual prompt, fault or unexpected file request. Do not guess
   navigation or retry a failed command. The three-record sidecar may change
   timing, allocation or observed states from the earlier KRA route.
4. Select the visible Exit option to return to the original main menu. Inspect
   the DWF2 party row. Capture the final paused state, current endpoint/RAM and
   save roster, then use the reviewed controlled close. Leave enough wall time
   for publication and orderly shutdown; do not extend a cap after launch.

Luna presents each new original BMP to Root before requesting/publishing the
next key. Root must authorize that exact action after viewing the current frame.
On wrong name/list, stale/rejected token, nonzero fault, unexpected state,
input discrepancy, missing receipt, terminal guest or evidence cap, stop further
input. Preserve the failed attempt and maintain ownership through bounded
cleanup; forced termination makes the case incomplete. No automatic recovery.

## Discriminating transfer and memory evidence

The known original reader009E:11E5 requests0199 WHO bytes and subsequently
processes SFX records in9-byte units. See
[cold Add source reconstruction](cok-cold-add-source-reconstruction-2026-10-15.md)
for original coordinates and linkage writes; use the accepted manifest for any
additional9B allocation/node attribution. Do not derive ownership from relocated
runtime addresses alone or invent semantic field names.

The fresh audit must establish actual path/open/read/close ordering, request
sizes, returned counts, cursors, error/carry behavior and service-owned buffer
digests. Independently compare every observed DWF2 transfer with the pinned
file slice at its recorded cursor. Require a full409-byte WHO load matching its
accepted hash and account for all27 SFX bytes. The source predicts three full
9-byte iterations and a terminating short/EOF read; actual callback ordering,
requests, cursor values and EOF must be measured, not written into the verdict
in advance. Include listing/header reads, seeks, failed STF search or any other
actual service calls in the observations. A trusted integrity verifier alone
does not prove transfer semantics.

Locate the live party head/current-character and party structure from the
accepted original DS-relative roots and endpoint registers. Do not reuse KRA's
allocation addresses or confuse SS with DS. Require one inserted character,
head=current, null character-next pointer and party count1; record actual far
pointers, allocation bounds, raw bytes and the Pascal name DWF2. Compare all409
WHO bytes to live character RAM and enumerate every difference with exact
before/after offsets. Explain only source-supported rewrites: serialized list
pointers cleared/rebuilt, first-free slot assignment at0137 and conditional D6
signed maximum over priorD6/F9..100 are known rules. They are not a wildcard
allowance for unexplained differences or a fixed expected difference count.

Traverse E3/E5 as the original SFX-list head using bounds-checked far pointers,
9-byte nodes and next-pointer words at+5/+7; require no cycle, alias or truncated
node. Record the observed node count, order, addresses, raw bytes and terminal
null link. For three full source records the expected reconstruction is three
nodes, but measure it. Compare each node's payload bytes0..4 to the corresponding
source record and validate its rebuilt linkage separately. Raw serialized bytes
5..8 can differ because original code replaces links; do not demand nine-byte
node equality for every nonfinal node or classify linkage as payload corruption.
Full actual read-buffer digests still bind all27 original serialized bytes.
If evidence differs from this source expectation, retain it as a failure for
analysis rather than normalizing it away.

## Separate publication checks and acceptance

After real guest/helper termination, retain actual exits, UTC times, argv,
source/config/binary hashes, stdout/stderr bytes and hashes, drained-stream
status and forced-cleanup status. Verify expected input words equal all actual
host enqueues and successful AH00 callbacks in order, without imposing KRA's
seven-input count. Confirm every owned helper/guest/validator is terminal.

Run the independently pinned BIOS publication validator28bbb915… against this
run, recording its actual process receipt and streams. Prepare its required
terminal.json interface from actual terminal evidence: byte-copy an already
compatible terminal or explicitly label/hash a field projection, preserving
original receipts and all failures. Do not silently manufacture terminal fields.
Then run the trusted v3 DOS verifier with the exact current binary, trusted
expected-identities, new session evidence, current BIOS manifest and explicit
`--start-work 16000000`. Both validators must actually exit0; the independent
file-slice and memory comparisons above remain additional obligations.

The declared window omits earlier startup. Preserve initial-handle unknown-open
provenance and the distinction between complete window coverage and original
program termination: `run_completed=false` at controlled observation close is
not campaign completion. Rehash originals and clones; this Add-only case must
leave DWF2 save bytes unchanged and produce no new save files.

Acceptance requires the observed original menu path, singleton DWF2 state,
explained WHO differences, complete sidecar reconstruction/transfer evidence,
exact input accounting, orderly exits, both validations and unchanged inputs.
Record a durable report and artifact-pin index with all failed attempts retained.
After coordinator evidence review, document/commit/push this bounded case; keep
View, broader party behavior, world persistence and M1–M7 open.
