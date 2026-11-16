# Cold KRA reopening and Add Character to Party

Source-only Astra plan,2026-10-15. Follows headless readiness; no application, test, build or preparer was run for this plan. Original files and first-save evidence remain read-only. No new guest admission is authorized yet. Preserve the separate M2 candidate.

## Subsequent inventory validation

After Astra reviewed Sol's isolated preparer, Luna passed all 27 focused Python
controls and ran both the normal inventory and one-byte-cap control, all exit 0.
No application or native build ran. Source and original START/OVR/MIDI pins
matched before/after. Candidate directory:
`build/cok-recomp/cold-add-inventory-sol-20261015-a/`.

Actual inventory SHA256:
`ef9aeb0956ca8d44a26736d243cadf0bbfcce0051d57d7274fa3919728b84de5`.
Receipt `luna-validation/cold-add-final-validation.json` SHA256:
`03be87395f864900e10ceeb5e51a212a695054d6e2d3c98ad17aeb9aae5d19e9`.

The single A4:37A2 root reaches all five required helpers without independently
seeding them. It discovers 1,327 new tuples / 3,527 unique instruction bytes
against 32,845 / 84,012, for a proposed union of 34,172 / 87,539. The analysis
has no cap, pending work or missing extents. It still reports `complete=false`:
25 host-service interrupts and six computed transfers require explicit contract
classification. `runtime_admission_authorized=false` remains unchanged.

The separate WORLD candidate overlaps by 1,421 physical bytes; 2,106 bytes are
cold-Add-only. Combined new physical bytes would be 7,578, but WORLD is not
the integration baseline and neither candidate is admitted by this inventory.
The one-byte cap stops with A4:37A3 pending, demonstrating truthful incomplete
output. Search/no-match/order/DTA and actual file-record arguments remain
runtime evidence requirements. Next: review all unresolved guards and prepare
the isolated guest admission plus measured search service; no successful host
stub may stand in for an unresolved operation.

## Proven entry and original helpers

Current baseline is32,845 instructions/84,012 bytes, manifest SHA `eddcbf87a8134803917bbdda8ab90a47c9d1819c9715755e507848f562a154e0`.

Main A4:0419 compares selected command AL with41h (**A**), checks enabled byte DS:099D, and0425 calls A4:37A2. The shared selector returns the selected item's command byte at036C–0373; this does not prove that raw keyboard A activates it. In the subsequent cold headless run, A was consumed but the exact menu framebuffer remained unchanged after two bounded slices, with Create still selected. Use a fresh screenshot-bound Down to highlight the visible Add row, then review the resulting frame before Enter. Existing evidence establishes first Enter then P displays the character menu; the later Create Enter and race Select belong to creation and must not be retained in the cold Add schedule. Reuse only the exact first-two schedule entries, then select the observed menu item. No assumption that18.1M/old pause timing necessarily identifies the cold menu.

| Role | Proven source |
| --- | --- |
| Whole Add root | A4:37A2..3B09; normal RETF3B09 |
| Build character lists | A4:37C4 calls9E public25 → body0453; calls local008B |
| Select list item | A4:3835 callsFD:0034;383D/3843 accepts Enter0D or A41; selected name beginning `*` is rejected at384F |
| Allocate character | A4:385E requests199h=409 bytes through0A46:023F |
| Read character | A4:3892 calls9E public39 → body11E5, destination and filename from the selected parallel list; original booleans pushed0 then1 |
| Insert party | Empty-party branch38DD or accepted-existing-party branch3A0F calls9E public52 →1989; redraw uses public2A →0817 |
| Cleanup/exit | E45 or zero exits list at3ADB..3AFC; rejected new candidate frees409 bytes at3AD6; menu list cleanup throughFD:0043 |

**9E:0A80 is not the reader.** Its three paths append suffix literals0A71/0A76/0A7B and call069C:0154 for deletion. Retain its cleanup semantics if reached, but do not use it as a cold-load root.

Direct original-byte disassembly of three contiguous complete local bodies (not a transitive preparer run) gives:

| Body | Local rows/bytes | New vs current baseline |
| --- | ---: | ---: |
| A4:37A2..3B09 |321/872|321/872|
| 9E:0453..04D4 |58/132|58/132|
| 9E:008B..044A |377/962|377/962|

Subtotal756 rows/1,966 bytes is **not** the complete closure budget. Reader11E5 and insertion1989 also have known local bodies374/1034 and98/311; the isolated WORLD candidate already proposes these, but they are not in the current actual baseline. Deduplicate only after establishing the actual integration baseline.

## Search is now a measured dependency

9E:0493 appends the original Pascal literal at044D, bytes `05 2A 2E 77 68 6F` (`*.who`), to configured DS:5784 save path. 008B:00C3 calls09C4:0112 FindFirst with attribute mask0. It loops through09C4:0150 at043F. Original resident0150 performs AH1A at0159 to restore that DTA, then AH4F at015E. These are concrete additional sites/services for this closure, not hypothetical generic DOS support.

09C4:016A converts successful DTA name at+1E from ASCIIZ to Pascal **in guest memory**, then stores zero atDS:8A58; carry error stores returned AX there. Preserve that conversion and do not cache search state in the filename area that it overwrites. AH1A changes the active guest DTA. Successful results must provide real filename/size/attributes; end-of-search must return truthful CF/AX18. Verify initial no-match DOS code against the held original oracle before claiming full compatibility. No invented successful result or raw host directory enumeration.

Smallest host extension, separately source-reviewed after closure inventory: bounded enumeration of imported mutable save-store entries for the measured final-component `*.WHO`, attributes0, using existing configured path routing. Keep wildcard syntax out of ordinary open/create normalization. Bind bounded search continuation to the guest DTA/search identity, preserving resumed search after AH1A and the original +1E conversion; explicitly specify invalid/lost context, exhaustion and mutation behavior. Do not expose undeclared host/assets or invent general wildcard/FindNext semantics. Determine order from original evidence; one-file KRA success alone cannot establish multi-file ordering. Test two matching names plus a nonmatching SFX, independent/interleaved DTAs, exhaustion, absent directory, invalid DTA, and unchanged registers/memory on rejected guard paths. Existing exact FindFirst directory checks remain intact.

## Original byte counts and reconstructed state

First-save artifacts: KRA.WHO409B SHA `e9b3ea72bcf349118268c3f0a2f864a24579630884106a1e2905f2f44ff851de`; KRA.SFX9B SHA `2dc3ea9719de5477dc6311837e0ff1502aacd91d2dd432c69a538ad89f64a5be`. Cold tests use a fresh cloned host save root, not the accepted evidence directory.

List builder008B opens the actual match, obtains size through0A46:1563, compares it with its original table argument, seeks by original table offsets, reads16 name bytes and one classification byte, and builds two allocated46-byte parallel list records. Capture the table arguments at0453→008B (DS0866/0869/086F indexed by original713E) and actual requested/returned counts; do not replace this with a host WHO parser.

Reader11E5 opens via069C:02A7, clears409 destination bytes at1291–129D, then requests199h records through original14B4 at12BE. Verify actual record-size initialization and returned count at runtime before identifying this as409 bytes solely from the immediate. It clears serialized pointers at character+143/145,+E3/E5,+183/185,+17F/181 before reconstruction. Optional sidecar paths use63-byte allocations/reads at135B/13B5 (STF path) and9-byte allocations/reads at14AD/1507 (SFX path); list nodes are copied by original9F8 and linked by original code. Do not reuse stale serialized host/guest pointers or assume absence/presence of STF from class alone.

1989 installs the first party pointer into DS609A/609C or appends through character+17F/181; sets current DS6096/6098 and rebuilds other original party state. Add root performs duplicate comparisons using the original name comparator plus+115, counts player entries using+E7, and checks limits/alignment/class-related fields+FC,+FD,+10A. Preserve original rejection logic instead of auto-adding every found file.

Acceptance records must connect the loaded allocation to name KRA and observed race/class/deity/alignment/HP/Wisdom through verified original field offsets, maintain exact persisted scalar/icon data where the original reader leaves it unchanged, and separately verify reconstructed pointer/list ownership. Record SFX node count/content, party order/count, current pointer, linked-list termination and actual enabled main-menu actions. Do not compare all409 bytes blindly after pointer fixups, and do not assign new field meanings from guesses.

## Next bounded Sol task

Prepare an isolated source inventory rooted at A4:37A2 with the original menu call as an entry witness. Traverse whole list0453/008B, reader11E5, insertion1989, redraw0817 and all discovered dependencies, including both new09C4 interrupt sites. Reuse the reviewed closure scanner with exact source pins, resource namespace separation, root-local call inventories, relocation attribution and unresolved edge retention. Analysis cap131072 new unique bytes; admission limit32768 per reviewed whole-helper batch. Do not seed arbitrary UI procedures, skip error branches, execute original code or admit bytes during preparation. Report exact total/delta against actual baseline and separately overlap with the preserved WORLD candidate; no guessed totals.

Produce source-proven file/search argument contracts and original interrupt return continuations for0159/015E, plus every newly reached computed transfer. Astra reviews before Luna executes preparer controls. Only then design the narrow measured search adapter and paired guest admission in isolated copies. Headless implementation remains first priority; reconcile its source changes before actual application/build.

Luna's eventual headless acceptance: cold import exact held files; first-two-key main menu; observed A; actual KRA listing; original Enter/A selection; original reader and insertion; return to observed party/main menu and View of the loaded character; subsequent action confirming live state. Negative cases include no matching WHO, wrong/truncated length, missing/truncated sidecar, duplicate Add, cancellation, full party and failure without leaked allocations or fabricated party membership. Original DOS comparison and a second legal character flow remain M1 gates. WORLD roundtrip remains separate.

## Supersession and current M1 status — 2026-10-16

The initial “no new guest admission,” “next bounded Sol task,” and pending cold
Add statements above are historical planning state; they are superseded by the
later accepted admission and runtime records. The bounded original Add closure
and measured WHO search support were integrated and validated; see [cold Add
admission validation](cok-cold-add-admission-validation-2026-10-15.md), [WHO
adapter validation](cok-who-search-adapter-validation-2026-10-15.md), and the
[measured search contract](cok-character-search-adapter-plan-2026-10-15.md).

Two bounded guest workflows are accepted, each producing a **singleton** party:

* **KRA:** cold Add of the previously saved KRA character produced a visible
  party row with AC10/HP12, party count1, and linked KRA.SFX data. See [KRA cold
  Add state acceptance](cok-cold-add-state-acceptance-2026-10-15.md).
* **DWF2:** a fresh cold Add of the saved Mountain Dwarf Fighter produced a
  visible singleton row, AC7/HP19, with source-explained WHO rewrites and three
  rebuilt SFX nodes. See [DWF2 cold reload acceptance](cok-dwf2-cold-reload-acceptance-2026-10-15.md).

These records do not establish adding a **second distinct character to an
already populated in-memory party**. The next discriminating M1 route is one
process that begins with the accepted KRA or DWF2 party member, adds a different
saved character, and verifies party count, order, links and current-character
ownership after insertion. Removal/reordering, additional legal race/class
combinations, invalid-combination rejection, and cancellation/backtracking
remain open plan requirements. Do not infer those behaviors from singleton
success or from static code admission. Original-DOS comparison and WORLD
save/load remain separate open milestones.

## 9E:1989 append-branch source audit — 2026-10-16

The retained original-source reconstruction establishes both insertion paths:
when the party head at DS:609A/609C is null, 9E:1989 installs the new far
pointer; otherwise it appends through the existing character's +17F/+181
next-pointer fields. The routine updates the current-character pointer,
assigns a free slot, and increments the party count at structure +67C. See
[the source reconstruction](cok-cold-add-source-reconstruction-2026-10-15.md).

KRA and DWF2 cold-Add acceptance each observes party count1 and therefore does
not exercise the existing-party append branch. The available
`build/cok-recomp/generated/lifted.c` cannot be bound to the accepted cold-Add
executable through its current manifest; generated-C append semantics are not
verified. No source defect is justified by this audit. The next check must bind
generated source to the accepted binary/generation, then observe a distinct
second character appended in one process and verify count2, link/order,
termination, and current-character ownership.

The retained local generated manifest also lacks the top-level `cold_add`
section emitted by the current `lift.py` path. Current lifter source calls the
frozen cold-Add admission and lists `(9E,1989)` among its expected helper
functions, but the retained manifest/C pair is not evidence that this current
source path produced those artifacts. Similar numeric IPs in other modules do
not identify 9E:1989. The opt-in provenance path now contains a pre-Cargo JSON
gate for its freshly generated `cold_add` proof, A4:37A2 entry witness, and
9E:1989 function coverage, and records the validation with the manifest
identity. That gate remains source-only. Run it once permitted and verify its
receipt binds that `lifted.c` to Cargo's executable before the runtime append
discriminator.

## Combined KRA + DWF2 append discriminator — Luna source-only plan, 2026-10-16

The accepted singleton workflows use separate cloned save roots and executables;
no combined fixture or harness configuration is currently accepted. For the
count-2 check, create one newly owned writable save clone containing exactly
`KRA.WHO`, `KRA.SFX`, `DWF2.WHO`, and `DWF2.SFX`, copied from the accepted
evidence. Keep those source evidence directories untouched. Pin one exact
executable for the entire run; do not switch between the KRA and DWF2 binaries.

Before launch, review a fresh combined-fixture configuration and verify that
the selected executable is bound to its generation receipt and current lifted
source. The previously used cold-start BIOS words
`7181,6480,20480,7181,7181,19712,7181` are only an initial reference. Inspect a
fresh frame after every action: bind Down to the visible Add row, inspect that
selection, then Enter. Add KRA first and inspect its loading and marked-entry
frames. Return to or reopen Add only if the screen shows that route; select
DWF2 only when it is visibly unadded. Do not invoke View, Save, or Begin.
Capture the party screen and final RAM state, then close the process under
control. Observe multi-file search ordering rather than assuming it.

The runtime acceptance record must establish all of the following from the
current executable:

* Party count2 at DS:4B2C/4B2E; a two-node party chain at +67C with KRA first,
  DWF2 second, and a null final link; current pointer DS:6096/6098 targeting
  DWF2 and party head DS:609A/609C targeting KRA.
* Distinct accepted character fields and slots 0 then 1; KRA's one-record SFX
  chain and DWF2's three-record chain with expected payloads and links, with no
  overlap or cycles.
* Both entries visibly marked added, and the cloned save files unchanged by
  the run. Preserve any per-file transfer ledger needed to tie guest reads to
  these four exact inputs.

This is a plan, not runtime evidence or authorization to run a build, generator,
test, or application. The current Defender execution hold remains in force.

## Combined harness source audit — Luna, 2026-10-16

Static inspection found only one current headless replay harness:
`build/cok-recomp/cold-add-gated-replay-sol-20261015-v3/`. Its replay manifest
pins exactly `KRA.WHO`/`KRA.SFX` and the seven accepted input words; its launcher
and Python gate enforce that same two-file KRA roster. Its
`reviewed-binary-config.TEMPLATE.json` explicitly has `reviewed:false` and null
executable, manifest, and generated-C paths. The accepted DWF2 singleton used a
separate harness/evidence root and executable identity beginning
`acb20d9b`; that identity alone does not prove current generated-C provenance.

The accepted save records do provide the four immutable source-file pins needed
for a future combined clone:

| File | Bytes | SHA256 | Evidence |
|---|---:|---|---|
| `KRA.WHO` | 409 | `e9b3ea72bcf349118268c3f0a2f864a24579630884106a1e2905f2f44ff851de` | First-save inventory above |
| `KRA.SFX` | 9 | `2dc3ea9719de5477dc6311837e0ff1502aacd91d2dd432c69a538ad89f64a5be` | First-save inventory above |
| `DWF2.WHO` | 409 | `2db0a9658d32ad63af17fbdcde418d6ecd7e9b7e2918f89f48a5760ff374d4e1` | [DWF2 save acceptance](cok-second-character-save-acceptance-2026-10-15.md) |
| `DWF2.SFX` | 27 | `0af2c5388cab0e03967604beef9d1e03298e4fbe1ee3968eb01ed59238a79ec0` | [DWF2 save acceptance](cok-second-character-save-acceptance-2026-10-15.md) |

Do not mutate or reuse the KRA v3 harness or its unreviewed template for the
combined case. The required source-only next step is a new ignored, owned
run-root design with this four-file roster, plus one executable pinned through a
successful build-provenance receipt binding it to `lifted.c` and `manifest.json`.
That receipt does not yet exist because the opt-in build path remains unrun
under the Defender hold. The combined route and frame-bound input schedule also
need separate review; singleton input schedules do not prove the two-character
route. No files were changed by this audit and no command or application was
run.

## Build-provenance race verification gate — source-only design, 2026-10-16

Microsoft documents that a Windows open handle's sharing mode remains active
until the handle closes, and that directory handles require
`FILE_FLAG_BACKUP_SEMANTICS`. A handle chain for all non-reparse ancestors and
read-only source inputs, opened without write/delete sharing before Cargo and
held through process completion, is a candidate guard only. The API references
do not prove that this prevents every namespace swap relevant to Cargo's later
path lookups. Do not represent the receipt as proven until the target-Windows
tests below have observed the actual behavior.

| Case | Controlled action | Required result |
|---|---|---|
| Baseline | Build from a fresh isolated source/target tree with no concurrent mutation | Clean Cargo exit; drained outputs; receipt binds captured path, file identity, length, digest, and executable identity |
| Source-file mutation | Attempt write, rename, replacement, and reparse substitution of `lifted.c` and `manifest.json` after pin acquisition and during Cargo | Mutation is denied or the build fails closed; never publish success on path-hash equality alone |
| Ancestor mutation | Attempt rename/replacement and reparse substitution for each opened ancestor, including rename-away/restore ABA | Mutation is denied or build rejects; report the exact failed mutation and no success receipt |
| Build source mutation | Attempt replacement of the `rust/cok-recomp` build inputs while Cargo reads them | Mutation is denied or the full build-input snapshot check fails; no success receipt |
| Output replacement | Attempt to replace/delete the built executable between Cargo exit, identity capture, receipt publication, and launch | Mutation is denied through the capture/launch window, or the launcher detects identity mismatch and refuses to launch |
| Rejected path | Supply a missing component, reparse component, or path whose handle cannot be opened with required sharing | Fail before Cargo; retain a precise failure record and launch nothing |

The launcher must verify and use the same executable object: preferably through
a supported handle-based process-creation API, otherwise from a locked,
identity-checked staging copy kept protected through process creation. A
hash-then-launch-by-path sequence is not sufficient. This matrix is a future
verification gate, not authorization to execute while the Defender hold is
active.
