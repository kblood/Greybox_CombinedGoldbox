# Cold Add headless attempt: volume-query frontier

The first fresh-process Add attempt did **not** load a character. It reached
an original volume-label request outside the reviewed host profile and stopped
with fault9. The process closed cleanly and publication validation passed;
those results do not establish successful Add or completed M1.

Run: `build/cok-recomp/staging/intro-compare/cold-add-headless-run-luna-20261015-a/`.
Executable SHA256:
`6d890b5bb4e4d55894acfd06eb9e52b74815085c87609d0a5d41fa9eabc79bcc`.
Luna used the reviewed seeded headless helper v2, whose parser, prelaunch and
independent writable/source-inventory controls had passed. No game window,
physical keyboard input or DOSBox run was requested for this application test.

## Observed inputs and menu

Root inspected fresh framebuffer BMPs at original detail. The initial menu
selected Create; Add was the second visible row. Raw A was consumed but did
not change the menu. The three frame files0003/0005/0007 are byte-identical,
SHA256 `02bf5912ec004b6d63be99395af7b7485a3df1509ee901545bbf2ee458d1e001`.
An initial preview interpretation of a cleared menu was wrong and is superseded
by the byte comparison and original-detail images. Down selected Add in white
on frame0009; Root then authorized Enter.

The offline decoded AH00 callbacks match all five host enqueues:

| Action | BIOS word, decimal | Enqueue work | AH00 work |
| --- | ---: | ---: | ---: |
| Initial Enter | 7181 | 14,500,121 | 14,500,289 |
| Play, P | 6480 | 15,000,000 | 15,000,247 |
| A, ignored by selector | 7745 | 16,000,000 | 16,000,085 |
| Down, select Add | 20480 | 16,500,000 | 16,500,068 |
| Enter, activate Add | 7181 | 16,750,000 | 16,750,059 |

One intervening settle changed no input. All callback statuses are0 and the
ring drained after each. The source's selected-command AL41 comparison did not
prove a raw A hotkey; the [cold plan](cok-cold-character-add-plan-2026-10-15.md)
now states this distinction. No later input was sent after the source stop.

## Exact stopped request

At work16,760,358 the guest stopped with status/fault9 at CS19C4:IP0143.
Final registers: AX4E00, CX0008, DS2491, DX3594. Root read the corresponding
ASCIIZ string from the published full RAM: `C:\*.*`. The RAM SHA256 is
`fb79d00a3dceadda3fb475f2e7e0865769f5c45581010eb51042f33ee3effda3`.
This is distinct from configured-directory `*.WHO` with CX0.

Astra traced the actual saved frames, original caller bytes and current
catalog: helper069C:0219 calls09C4:0112 at0267 with attribute8, from9E:057F.
The wrapper's INT21 is at0141, so0143 is the post-callback IP. Its volume label
comparison can prompt only for a matching CHAMP label on drives below C;
the C: path still must execute the query. See the
[volume-service plan](cok-cold-add-volume-query-plan-2026-10-15.md).

The existing narrow adapter correctly rejects this unimplemented request.
No directory/WHO listing, original character reader, reconstructed party or
View acceptance is established. Missing later int-opcode records in the compact
journal cannot prove absence of DOS services; the stopped registers/RAM and
original call frames establish this request.

## Publication and preserved saves

Owned PID54132 exited0 with drained output and no forced termination. Both
writable seed files retained their exact initial hashes: KRA.WHO409B
`e9b3ea72bcf349118268c3f0a2f864a24579630884106a1e2905f2f44ff851de`
and KRA.SFX9B
`2dc3ea9719de5477dc6311837e0ff1502aacd91d2dd432c69a538ad89f64a5be`.
The separately pinned accepted source files were independently unchanged.

The generic offline publication validator exited0 and checked actual report,
endpoint,1MiB RAM, journal/footer/reducer hashes and absent temporary outputs.
It decoded36,296 logical events /9,532 records, journal1,653,487B,
report131,073B and endpoint29,734B. Its scope remains publication only;
`run_completed=false`, close reason source-stop and fault9 are retained.
The actual sibling launcher terminal was copied byte-for-byte to the validator's
expected run-local path with provenance; it was not edited to assert success.
Receipt: `offline-validator-execution.json`; validator stdout SHA256
`74ef4262f0bae453aab1d2ae4a938717e09d8bb0ab1888a4bb9b73f55b48944b`.

Next: measure the pinned DOSBox default C: volume query and continuation effects
with owned fixtures, implement that exact separate service, then retry headless
Add from fresh clones. View is also a known unadmitted original boundary; its
whole-function inventory is being prepared separately. The current host adapter
remains isolated, with no production host integration claimed.
