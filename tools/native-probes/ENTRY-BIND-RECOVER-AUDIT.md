# Private action2 journal recovery

Task254 builds a separate private diagnostic from the unchanged public CCNEXT
composition, not from the Task253 installer. `entry_bind_recover.py` first
reproduces public SHA-256
`73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14`
byte-for-byte, then generates private substitutions for action admission,
required GRC binding and internal token handling. Production source files,
checked public binary, dispatch and staging/build lists remain unchanged.
Invocation: `EBRECV.COM C:\BOOT.DSC`; descriptor is four canonical112-byte
owner/P1/ECL/ITEM anchors. Capture mode, owned CWD, bad segments/banks/extent
and insufficient512-byte stack are refused.

The input is actual native ENTRY stage -> install -> separate ENTRY recovery
-> adapter -> Task252 BIND staging -> Task253 GRT-to-GRJ installation.
The494,367-byte GRJ is pinned to SHA-256
`43a6f7fc9fcf1f8400289cedd9663777530fefbda07c3a46b50635176231ae80`.
No caller ready flag or host-created owner substitutes for this chain.

Private admission explicitly accepts only INTENT/action2/result1, phase0->1,
generation1->2. RR/RV independently replay the complete journal and nested
COMPLETED/kind1 GRC. Current P1/ECL/ITEM/workspace are bound by the existing
live checks. `rc_owner_class`/`ro_match` compare complete canonical pre/post
owner header/directory/EOF, raw paths/context and every section. A recovered
post owner is SETTLED phase1/generation2, action/result0 NONE PC6940, with equal
pre/post images, exact section2, and absent sections3/15. No P1 gameplay image
changes are written.

Each durable row requires the complete standalone GRC bytes and exact EOF to
equal the independently admitted nested J.section2. That equality carries the
nested KR/KV semantic admission to the standalone file without destroying J
proof through a second KR index. GRC must remain present and exact; it is never
created, written, renamed or deleted. Retired GBMO must be absent. Unrelated
GRA is never opened or retired. GRT/GRP/GRB, continuation transactions and
CAPTURE.GSK must be absent. Reserved names and aliases are reconstructed after
RV/live/owner scratch lifetimes, and whole GRC/token/namespace proof repeats
before retirement.

The existing checked publication protocol admits exactly these rows (A owner,
B backup, C candidate; pre means exact phase0, post exact phase1):

| A | B | C | Next operation |
|---|---|---|---|
| pre | absent | absent | write, close and exact-admit post C |
| pre | absent | post | checked A-to-B rename |
| absent | pre | post | checked C-to-A rename |
| post | pre | absent | reprove publication, delete B |
| post | absent | absent | delete J last |

The five rows above pass; the other22 combinations in the27-row table refuse
without mutation. Every operation
reindexes/replays before the next publication decision. A failed candidate
write retains its partial evidence and refuses cold recovery; a complete
canonical candidate resumes from its emitted row. Failed close retains its
owned handle and prevents warm invocation. An absent J is a disk no-op.

The full composition was compiled and measured before execution:64,151 raw +
PSP256 =64,407 resident including the final512-byte stack;873 bytes below the
65,280 ceiling. COM SHA-256:
`4f9630927cbd201a7576b8efd9847ea379d9c2ddd6051a208715dde1ce7e5c54`.
The builder records binary/listing/NASM/measurement evidence and refuses any
oversized composition. Existing path and replay scratch lifetime overlays are
preserved; no cap, stack or overlay requirement is relaxed.

The focused controls cover the entire publication row table, competing
artifacts, required exact GRC/GBMO/live-source binding on all five durable rows,
whole P1/ITEM/workspace/owner changes, malformed/foreign/partial C, malformed
intent metadata/nested GRC/EOF, descriptor aliases, and mutation/arriving
GRP/GRB/CAPTURE at the reindex after C has been written. Fault coverage includes
open/read/seek/create/write/rename/delete errors; short reads/writes and
bad-position seeks; later owner/GRC/J/ECL/ITEM chunks; writer/peer/probe/J and
final-retirement closes with retained ownership, warm refusal and cold
classification. Cold cuts before and after create, first/later/final write,
writer close, both renames, backup delete and final journal delete distinguish
partial refusal from exact row resume. Full disk manifests and GRC immutability
are compared throughout.

The final focused/export suite passes136 tests in105.11s, exit0. Command:
`pnpm exec python -m pytest tools/tests/test_secret_reward_entry_bind_recover.py tools/tests/test_secret_reward_entry_bind_recover_export.py -x -q`
with fresh `SECRET_ENTRY_BIND_RECOVER_OUT`. Log:
`C:/temp/GoldBox-task254-matrix-export-complete.log`. Final runtime pack:
`C:/temp/GoldBox-task254-entry-bind-recover-final-pack-20261016`.
Manifest SHA-256 `cb4094f80f87f0a0ca59c14547bdb1b72950f98b1f4cb83a788c9a5b61f28fc8`.
The canonical494,367-byte post owner SHA-256 is
`44d1029a6e64061f14e0a4b732ce2f6d2483b1f6d70431f9c571560dbe9396f9`.
Earlier118/119-case results predate the refined close selectors and before-step
cuts. A before-step test initially selected the preceding expected CF1
missing-file probe, which the successful-call cut mechanism deliberately does
not stop on; an explicit before-operation cut repairs that harness mistake.
No implementation failure required relaxing scope, semantics or capacity.
Luna's hidden SDL dummy/focusless GameLink v4 matrix passed all nine cases:
five publication rows, no-J no-op, valid-foreign GRC, retained partial C and
CAPTURE refusal. Every guest STATUS0/STATUS1 is visibly captured; complete C/D
trees matched, GRC retained its expected exact hash (including the foreign
case's expected hash), and GRA plus OWNER.BIN stayed unchanged. The three
refusals had zero mutation events. Final evidence is under
`C:/temp/GoldBox-task254-entry-bind-recover-final-pack-20261016`;
`runtime-final-verification.json` SHA-256
`10ab0e009ce838a83fc0b238fe4283ecc2f10c1aa55d0bd88a5c32f207f443cc`.
The first captures and corrected status redraws are retained in the pack. No
retail assets are mounted writable. DOSBox remained at the idle prompt after
COMMAND.COM; Luna stopped only test-owned PIDs after ten seconds and reports
host exit separately as null. No GameLink owner remains.

The full `pnpm test:corpus` passed14,369 tests,15 skipped,84 warnings, exit0 in
3,381.83s. Log:
`C:/temp/GoldBox-task254-full-corpus-20261016.log`, SHA-256
`ae774d9569e6657bf4345af03f8ef9a646a790a60ea73b0d73c3e478fb4c5c10`.

This milestone ends at private administrative phase1 recovery. It does not
admit action3, execute CAPTURE/children, publish READY/reward UI/gameplay,
enroll a public route or alter web behavior. Concurrent mutation after final
proof is outside the single-writer protocol's verified guarantee.
