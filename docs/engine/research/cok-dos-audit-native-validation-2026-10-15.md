# CoK DOS audit: isolated native validation

Date: 2026-10-15. Status: native/source controls passed; cold-route audit
acceptance and production integration are still pending.

## Frozen candidate and actual tools

Candidate: `build/cok-recomp/dos-audit-companion-sol-20261015-v2`, freeze
`f287c269bd708213e1d2cdaa74fcfd6b3b5b065123069626ded60202e212228c`.
Luna staged it at
`build/cok-recomp/staging/dos-audit-companion-luna-v2-20261015-a`.
The existing accepted WORLD C/manifest were reused without regeneration:
`d806268d574996cb0f534d40865a4af7dfcc4bcaee9f2d2b375a80fe3e4eab01`
and `d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114`.
Actual Cargo used Rust1.99.0, locked/offline, release, one build job and one test
thread, with VS2022 MSVC14.39.33519 and SDK10.0.22621.0.

## Actual results

| Run | Actual process | Result |
| --- | --- | --- |
| Focused native `dos_audit` controls | Cargo31228 | exit0;9 passed,0 failed,225 filtered |
| Offline independent fixture mutations | PowerShell child invocation | actual exit0; PASS, merged output retained |
| Replay v2 pure source controls | Python56812 | exit0; SOURCE_CONTROLS_PASS; no app execution |
| Full native union | Cargo65788 | exit0;233 passed,0 failed,1 ignored |
| Direct optimized release build | Cargo53568 | exit0 |

The full suite contains eight nested one-test child summaries and one parent
summary. Root read the actual final233/0/1 parent result and process receipt;
these are not nine parent suite runs. New controls cover real service-buffer
observations, off/on state parity, short/EOF/zero reads, handle reuse, protected
DTA, partial guest-copy cursor distinction, native fault priority, bounded
startup/device/BIOS journal parity, evidence caps and publication failures.
They do not establish universal host-backed write-failure or adversarial race
coverage.

Raw streams and actual process records are retained in the staging root and
`full-native/`. `execution-stream-hashes.json` indexes their sizes and SHA256.
Full-suite stdout SHA256:
`ba89173cb67837ae4c2a254cc446636514131489b6bd8bef7d2ca5edca801c76`;
stderr SHA256:
`abdbf24d1400533958f06671af24ab992d9eadb4e213aa31a33fada952a6437c`.
The offline mutation log used PowerShell stream merging; no dedicated child PID
or UTC start/stop receipt was recorded for that invocation. Its actual exit is
persisted in `focused.offline.exit`; do not describe it as separately captured
stdout/stderr.

Two earlier capture wrappers failed after launching Cargo53624 and8900 because
they attempted to read redirected streams twice. Their actual Cargo exits are
unknown, and they provide no test result. Both raw wrapper errors are retained.
Before the successful attempt finished, Root observed only its current Cargo,
build-script/compiler chain; no old compiler process remained. The successful
attempt reused this target and is not claimed as a wholly fresh compile.

## Source and executable binding

Final `complete-source-pin-audit.json` reports2000 checked path records and zero
mismatches: donor sources, exact fixture source/destination bindings,24 WORLD
generated inputs, staged files and frozen candidate replacements. Its SHA256 is
`f868f8881ab523bae1bf0eb298aa9e8150c11d80bb7a52278a0e226485a9f9f4`.
The initial assessment incorrectly compared changed staged audit files to
unmodified donor hashes. That receipt is retained; the corrected assessment
uses explicit frozen replacements, without ignoring arbitrary Rust changes.

Release executable:20,165,120 bytes, SHA256
`1a6e096ba8880ced1e91f65c87777540f0038d9ae801b0d8cced971460531139`.
Compiled audit-source roster SHA256:
`7814472a4abc74314790c59372fe4e30dce34547a2fdb3a2afe938f17755f212`.
This roster is manually frozen metadata; build.rs does not independently
recompute it. The source claim for this binary depends on the frozen source,
external pin audit and actual build/executable receipts together. A future
changed production build must verify or regenerate its roster before claiming
current source identity.

## Next bounded application gate

Root and Astra approved frozen off/on configurations for only the previously
observed seven-key cold Add read route. Off must pass its exact image/state
gates, actual guest exit0 and offline BIOS validator before on may start.
On additionally requires the externally bound DOS companion verifier and an
independent comparison of actual WHO/SFX transfers to accepted input bytes.
Compare off/on final RAM, registers, work, BIOS semantics and unchanged save
bytes. No View, Save Current Game or Begin Adventuring action is authorized by
this gate. Pure composed-proof work is independent and is not native View
acceptance. No M1–M7 completion follows from the233 tests.

## Explicit audit-window v3 native validation

The later isolated v3 candidate implements the reviewed explicit start-work
window, retaining the existing event and byte limits. Its source freeze is
`af0b2b54b9ec63cd6c8fede0f1a7f406929be0d89a012fd3757847d19abadaae`.
This supersedes the pending window implementation status, not the retained
v2 application failure or its incomplete pre-input audit.

Luna's actual processes in the isolated
`build/cok-recomp/staging/dos-audit-companion-luna-v3-20261015-a` stage:

| Check | Actual process | Result |
|---|---|---|
| Focused native audit controls | Cargo58044 | 16 passed, exit0 |
| Offline audit mutations | Python55220 | passed, exit0 |
| Full optimized native suite | Cargo25544 | 240 passed, zero failed, one ignored; exit0 |
| Optimized release build | Cargo64520 | exit0 |
| Corrected gate v3 pure controls | Python68360 | passed, exit0 |

The full parent summary is separate from eight nested one-test child summaries.
Root inspected the actual retained full stdout. No new gameplay coverage follows
from those unit controls alone. All of these test/build processes are terminal.

The 20,180,992-byte release binary has SHA256
`acb20d9b475b993e1a5d1fcefa5bf126442bca69a7b0f4519a3f89283cc01068`.
The manually frozen compiled source roster is
`63add8af18f534a80518964cdcd1231db4dff57adb32736dc2c6d6e65bf527a1`.
Original lifted C and manifest remain d806268d… and d8440aee… as pinned above.

Durable evidence under the stage's `luna-captures` directory:

- `execution-receipts.json`, SHA256
  `373826c9eb6c2134ca90c4c5fbd1e0775e927b7cf7ee229ddd50c9f56b93abdc`.
  Process metadata was reconstructed from captured execution transcripts;
  stream hashes were measured after completion. This is not a process-generated
  receipt or a newly repeated execution.
- `source-pin-map.json`, SHA256
  `2d27ce8f1a48c17d7f6aac650a7397e7434f2d1e28e826ee8f03885c82b375d7`.
  Its 1960 per-phase dependency/stage/replacement checks and source-freeze checks
  distinguish approved replacements from unchanged donor files. Before-stage
  attribution comes from the staging script; detailed after hashes are actual
  read-only measurements, not invented earlier measurements.
- Raw focused/full/offline/build/gate stdout and stderr remain alongside them.

Root and Astra reviewed fresh exact headless OFF and window-ON configurations.
Root's exclusive reviewed copies have SHA256 ffafa8c94f4b0afe6485460543f1892e32973b7c7d7b5f24eb8529b87a56f6fa
and ad1667f6c7a5796391d637fc3f924462cb0a5a67644d5abb5c4bd2eebe7ffefe.
OFF must pass and terminate before ON starts. ON explicitly begins observations
at work16000000 and requires the trusted DOS verifier with the same start-work,
current BIOS manifest, current evidence and pinned binary/identities. Earlier
work remains unobserved. Both use cloned accepted KRA saves and the known
seven-input route; neither authorizes View, Save or Begin. Their application
outcomes remain pending at this documentation checkpoint. Production integration
and M1–M7 acceptance remain open.

### Actual v3 headless cold Add comparison

The subsequent bounded application comparison passed, without runtime retries.
OFF gate37284 exited0; guest67704 exited0 and publication validator64952 exited0.
Only after those processes were terminal did ON gate63972 start; it exited0,
guest41552 exited0 and publication validator53384 exited0. Both reached the
accepted nine-action/seven-input endpoint at work17750000, fault0 and orderly
close, without forced termination. Root viewed both fresh original320x200
frame0017 BMPs: KRA, AC10, HP12. Signed DIB height−200 denotes top-down pixels;
an offline report-builder initially expected+200 and was corrected, without
rerunning either game.

The separately pinned audit verifier process61372 exited0. It validates integrity
and structural continuity, not transfer semantics by itself. Its explicit
start-work was16000000, with current binary, identities, BIOS manifest and evidence.
The complete companion contains2108 events/2577923 bytes, first callback16260369,
last16804450, final endpoint17750000. The preexisting GAME.OVR handle is explicitly
seeded with unknown original-open provenance; earlier callbacks remain unobserved.
The publication source sets `run_completed=false` for this live endpoint;
`complete=true` means complete audit coverage within the declared observation
window, not original program termination or campaign completion.

Luna independently compared service-owned transfer digests to pinned source-file
slices, including the full files:

| File/cursor | Requested | Actual | Independent source match |
|---|---:|---:|---|
| KRA.WHO/0, listing read |16|16|first16 bytes|
| KRA.WHO/247 |1|1|byte247|
| KRA.WHO/0, full character |409|409|full accepted WHO hash e9b3ea72…|
| KRA.SFX/0 |9|9|full accepted SFX hash2dc3ea97…|
| KRA.SFX/9 |9|0|empty SHA256, EOF, cursor remains9|

KRA.STF FindFirst returned AX18/CF1; no STF read occurred in the observed window.
Root inspected the actual full WHO/SFX and EOF ledger entries. OFF, ON and the
accepted reference agree in endpoint RAM hash3957c4c1…aae8d7, registers, work,
BIOS journal hash0568837b…44b0 (37419 logical events), and unchanged save rosters.
This establishes the bounded original cold Add transfer observations and that
this optional audit did not change the observed route's state.

Durable report:
`build/cok-recomp/staging/dos-audit-companion-luna-v3-20261015-a/luna-captures/runtime-window-v3-report.json`,
24340 bytes, SHA256
`7a42700d6ec9bc2f973312ff799e75cc53c21cc52e362331488cc20ec7ab1609`.
Root independently rehashed it. It retains process/raw-stream pins,1970 source
rehashes, trusted verifier invocation/result, slice comparisons and cleanup.
All owned processes are terminal. Production integration, View, subsequent
gameplay and M1–M7 completion remain open.
