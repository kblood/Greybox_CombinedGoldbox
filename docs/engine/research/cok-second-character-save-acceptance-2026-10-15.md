# CoK second original character: bounded headless save acceptance

Date: 2026-10-15. Scope: one additional legal creation/save case, not M1
completion. The coordinator performed this specific application test after the
user explicitly authorized a fallback from Luna; both direct and nested Luna
dispatch failed with `agent thread limit reached`. Astra reviewed the plan,
repaired harness and actual pure-control evidence before this run.

## Original route and observations

The fresh empty-save process replayed the exact18-command verified prefix,
checking original BMP/state/work/input receipts at every step. It reproduced
the early creation cancellation, reentry, Mountain Dwarf/Male/Fighter/Lawful Good
choices and one original YES reroll. Its fresh frame37 matched the earlier
recorded image, with NO selected. Root then accepted those new stats, typed
DWF2, retained the default icon, confirmed the original Save DWF2 prompt and
returned to the original main menu. Root viewed each manual action's fresh
320x200 BMP at original resolution. No View, Begin or cold Add was pressed.

Observed character: age69, level2, HP19/19, EXP2001, STR16/INT14/WIS16/DEX17/
CON15/CHA14, Steel18. This retains the newly rerolled stats; it does not rewrite
the first run as having retained its original roll.

Two icon navigation reasons initially named the selection one item early.
Raw captures remain unchanged; per-word native RGB counts establish the actual
sequence1ST-COLOR →2ND-COLOR →SIZE →EXIT. Only Right navigation occurred,
followed by Enter on the verified EXIT and confirmation YES. No icon component,
color or size edit was applied. Final main-menu frame81 SHA256:
`02bf5912ec004b6d63be99395af7b7485a3df1509ee901545bbf2ee458d1e001`.

## Process ownership and input accounting

Runtime base:
`build/cok-recomp/staging/second-character-prefix-luna-20261015-v3`.
The pinned audit-v2 executable1a6e096b… ran with auditOFF, budget60000000,
chunk4096 and unchanged900-second wall cap. Guest55596 and retained owning
Python helper68240 both exited0, without forced termination. The retained exec
session8112 completed0. Helper UTC18:38:35.526–18:46:57.022, elapsed501.275s;
the earlier native orderly-close checkpoint reports476.631s before publication
and process shutdown finished. Neither time is campaign playtime.

Endpoint: work24637715, fault0,30 inputs, empty BIOS queue, main menu.
All41 command/accepted/completion sequences are retained. Thirty expected BIOS
words (bootstrap2 plus28 individual key commands) equal the actual30 host
enqueues and30 successful AH00 callback words in order. The18-command automatic
prefix stopped at frame37; all later actions were individually reviewed.
All291 consumed source/input/artifact pins were rehashed unchanged afterward,
including original assets and previous KRA evidence. All guest/helper/validator
PIDs were independently confirmed absent after completion.

## Save files

| File | Bytes | SHA256 |
|---|---:|---|
| DWF2.WHO |409|2db0a9658d32ad63af17fbdcde418d6ecd7e9b7e2918f89f48a5760ff374d4e1|
| DWF2.SFX |27|0af2c5388cab0e03967604beef9d1e03298e4fbe1ee3968eb01ed59238a79ec0|

The directory was empty immediately before original save confirmation. The
27-byte SFX is an observed result; do not assume every character's sidecar must
equal KRA's9-byte file. No complete sidecar-semantic or cold-reload claim follows
from these sizes or hashes.

## Publication validation and preserved interface failure

The first offline validator11924 exited1 because its expected external
`terminal.json` interface file was absent. The game was already cleanly closed;
no application retry occurred. Its raw stdout/stderr/process receipt remain.
Root staged an explicitly labeled metadata projection from the actual guest
and helper terminal receipts: actual_exit→exit_code and closed/drained stream
facts→outputs_drained, binding both source hashes. The original receipts,
manifest, report, journal and endpoint were not modified. The projection and
field-mapping annotation remain alongside them; it is not described as a
byte-identical native-runner terminal.

The same pinned validator28bbb915… then ran as55588 and exited0. It independently
decoded the compact BIOS journal and checked manifest/report/endpoint/RAM hashes,
111275 logical events,15378 encoded records,3702571 journal bytes and no temporary
publication files. Journal SHA256:
`7ef7eb78946dbfc7cb7e8c2ccb388420608ddad0dab6a84c10b7f9ccfd028357`.
Endpoint RAM SHA256:
`97ee31186de8500a6d0e1af0e9e2f6cef2e045e7f4948b756fc24b55be3b0169`.
Its generic `creation_acceptance=false` means that codec/publication tool does
not itself establish creation semantics. This bounded case combines that
publication evidence with observed original UI, saved files and exact input
accounting. It does not claim the whole creation milestone passed.

Durable coordinator evidence directory:
`build/cok-recomp/staging/second-character-prefix-controls-coordinator-20261015-v3`.

- `runtime-acceptance-report.json`, SHA256
  `f1c9afd44e2fe429fc3db9535885ededd045445ffe52ef5115cc9b4646c79b9e`.
- `runtime-artifact-pins.json`, SHA256
  `618a15b5f52d69a87319e07845c3d2f9ab041570671219f671e5809b664fd3ed`.
- User authorization, helper start/terminal and both validator invocations/raw
  streams are retained, with the first failure preserved.

## Remaining work

This adds a second distinct legal creation/save case and an observed early
cancellation/reroll. Original-DOS comparison, DWF2 cold reload, complete format
semantics, invalid-combination rejection, broader party operations, View and
campaign gameplay remain unproved. Audit wasOFF, so this run claims no DOS read
ledger. M1–M7 remain open.
