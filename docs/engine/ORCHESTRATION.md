# Shared operating and coordination rules

This is the canonical cross-agent operating policy, reached from [AGENTS.md](../../AGENTS.md).
The [project overview](../../README.md) owns track descriptions. Tool-specific supplements
own CLI details, not shared policy. Higher-priority instructions and explicit task restrictions
win; a docs-only/no-execution or no-commit assignment does not authorize the steps it excludes.

The former June 2026 Sonnet-research/Opus-plan full-auto schedule is historical, superseded
by the user's continuous-task roles below. Dated plans and research remain evidence, not
standing permission to revive old deliverables, models or already-closed tasks.

## Continuous task loop and roles

**User reaffirmation, 2026-10-11:** discover an evidence-backed unfinished task, plan it,
implement it, and have it tested. After verification, documentation, commit and push, discover
and start the next task. Continue until the user explicitly pauses or stops. Native DOS work
is primary; web is secondary. A bounded delegated assignment ends at its assigned boundary;
the coordinator owns the continuing loop.

Unless an explicit user instruction or task-specific goal assigns models differently:

| AICC role | Model | Responsibility |
| --- | --- | --- |
| Astra | `gpt-6-astra` | Plan each bounded task before implementation: issue, current code, proposed change, byte budget and discriminating tests. |
| Sol | `gpt-6.1-sol` | Implement the approved plan and repair test failures. |
| Luna | `gpt-6-luna` | Own hands-on application testing: browser/DOSBox or other relevant runtime, screenshots and observed evidence. |
| Coordinator | Current coordinating agent | Verify plans/evidence, integrate scope, route repairs, document and complete required gates, commit/push and applicable deployment. |

These are **AICC assignments**, not Codex CLI model-support claims. The
`rust/cok-recomp/GOAL.md` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). records the explicit ongoing Luna-only exception
for that track. Do not substitute a different model silently if an assigned one is unavailable.

Autonomous authorization covers routine research, bounded implementation, tool/software setup,
verification and the existing private demo deployment without repeated permission requests.
Token cost is not a reason to weaken research or review. This does not override security holds,
harness permissions, task ownership or the decision boundaries below.

### Coordination and recovery

- Reconcile the assigned goal, recent commits, worktree and external evidence before choosing work.
  For native Greybox use [GOAL](../../GOAL.md), [HANDOFF](HANDOFF.md) and the
  [BUILD-QUEUE active pointer](BUILD-QUEUE.md), not the first unchecked historical entry.
  For Rust use its separate goal. Resume phrase: `resume goldbox full-auto`.
- Verify the plan against repository and runtime evidence; never treat another agent's memo as
  proof. External Codex/Claude consultations are advisory and must be checked locally.
- Parallelize independent research with distinct output paths; isolate parallel edits in
  worktrees. **Serialize work sharing native sources, generated artifacts, Cargo/build outputs
  or runtime devices.** Model parallelism and worktree isolation do not isolate those resources.
- Do not rebuild or mutate a source/build under an active sweep or live verification. Pin the
  source and executed binary, and record changes during a run rather than attributing a later
  build to an earlier screenshot.
- Preserve unrelated dirty/untracked work. Stage only owned, reviewed changes; never bulk-stage,
  reset, restore, stash away or delete another agent's/user's work to obtain a clean tree.
- Update the relevant goal/handoff/queue after each slice with exact evidence, failed hypotheses,
  limitations and the next actionable step. Keep outputs reproducible from checked-in tooling;
  do not make an ignored artifact the only record of how a result was produced.
- Pause the affected action for public engine releases, copyrighted-asset distribution,
  force-pushes, deletion of non-self-created data, licensing/distribution changes or genuine
  user-owned product decisions. Record the question in [DECISIONS-NEEDED](DECISIONS-NEEDED.md),
  use only reversible authorized defaults, and continue independent safe work. Routine pushes
  and deployment to the existing private demo are not new public-release authorization.

## Data, source and security boundaries

- Treat game-data directories and external holdings as read-only source. Do not reformat or
  bulk-rewrite them. Explicit asset-conversion work writes owned outputs, not the originals.
  Keep extraction output under ignored `*_extracted/`; prefer new tooling under `tools/`.
- Consult [holdings](../goldbox-versions-holdings.md) before declaring assets missing. For C64
  sources, enumerate each title's disk images non-recursively and case-insensitively; recursive
  traversal reintroduces damaged dumps in `superseded/`. Strip the C64 load address, but derive
  any DOS-side header skip per asset family, not by a universal two-byte rule.
- Check local `hackdocs_extracted/` and the [verified findings](../findings.md) before speculative
  disassembly. DaxDump/EclDump are Windows tools; the Python header inspectors are portable.
- Clean-room Greybox ships its own engine/tools with user-supplied data. Do not commit or
  distribute copyrighted assets, extracted original code, generated game images or raw recovery
  archives/logs. Study third-party implementations as references, not source to copy into the
  MIT engine. No third-party outreach without authorization. The Rust lift has a separate
  original-byte provenance contract; it does not authorize redistributing those bytes.
- Existing local game folders and the private verification demo are not precedents for adding
  assets to source control or a public package. Public distribution must use user-owned inputs;
  resolve legal/distribution decisions with the user first.
- **Security rejection stops the affected workflow.** Generic access-denied/OS5 or an antivirus
  rejection requires preservation of the exact command/error, security-log review and coordinator
  consultation. Do not split, rewrite, re-encode or retry a rejected command to get through.
  Keep Defender enabled and unchanged: no exclusions, suppression or quarantine restoration
  merely to continue. Do not upload local scripts/assets/diagnostic bundles without authorization.
- The [Defender investigation](research/cok-defender-detection-review-2026-10-15.md) and
  [command-source review](research/cok-defender-command-source-review-2026-10-15.md) retain the
  evidence. The `rust/cok-recomp/GOAL.md` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). records execution holds and bounded
  reviewed continuations. A later successful bounded run is not a blanket lifting of a hold;
  unresolved scope means source-only work until reviewed authorization is clear. Neither a
  source audit nor a build receipt proves compiler consumption or executable provenance.

## Native execution and application testing

Read [native/README](../../native/README.md) and the task's runtime contract before execution.
For Rust, read its `rust/cok-recomp/README.md` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). and current goal/hold first.

- **All DOSBox-X automation uses focusless GameLink** for guest input, screenshots and memory.
  Never use host `SendKeys`, `SetForegroundWindow` or `SendInput`. State this explicitly in
  every DOSBox-X agent brief. Use [dosbox_gamelink.py](../../tools/dosbox_gamelink.py) or
  [dosbox_x_debugbox_probe.ps1](../../tools/dosbox_x_debugbox_probe.ps1) with `-GameLink`.
- Default to hidden/headless tests. The probe uses hidden launch, SDL dummy video/audio and
  `output=gamelink`; `-ShowGameLinkWindow` is an explicit visible/minimized opt-in, not fallback.
  Input being focusless does **not** prove launch is focus-safe: verify that path in an isolated
  Windows desktop/session. Follow the [GameLink runbook](research/dosbox-x-gamelink-automation.md).
- GameLink's named shared memory is a machine-wide singleton: one owned driving session at a
  time. Verify process ownership and stop on foreign-session interference. Stop only the exact
  PID you launched, never every process with the same name.
- Upstream DOSBox-X 2026.07.02 loses held-key/button release history across video-mode changes.
  For GameLink runs changing modes, use the pinned minimal fix from
  [build_dosbox_gamelink.py](../../tools/build_dosbox_gamelink.py), selecting the manifest's
  `candidateExe` explicitly via `-DosBoxPath` or `Start-DosBoxSmoke -Dosbox`. Preserve the
  original executable and record the candidate hash. Extra injected make/break sequences are
  not ordinary application acceptance. The public launcher's retail DOSBox default is unchanged.
- Stage retail sources through [retail-stage.ps1](../../native/retail-stage.ps1) and mount the
  owned mirror. Detect source writes using hashes, sizes, file **and directory** timestamps;
  clean Git status cannot detect identical-byte rewrites or create-then-delete activity.
  Report the known bundled DOSBox directory-mtime effect separately from game-file writes.
- Native `.COM` clients have a 65,280-byte resident limit. Plan byte reclamation/state extraction
  before growth. Use the source-bound `native/build/native-capacity.json` regenerated by
  [build.ps1](../../native/build.ps1), including per-tool minimum-headroom floors; never relax
  floors or input bounds to buy a passing build. Do not copy old prose counts or infer a size
  for a target absent from that manifest.
- For screenshot-heavy DOSBox work, prefer [dosbox_ollama_agent.py](../../tools/dosbox_ollama_agent.py)
  for bounded live triage and [describe_screenshots.py](../../tools/describe_screenshots.py) for
  offline batches; [dosbot helpers](../../tools/dosbot/lib.ps1) support owned launches. Inspect
  milestone frames yourself. Model descriptions are advisory, never substitutes for exact
  route, RAM/debugger, file-open, hash or save/reload assertions.

## Evidence, gates and repository completion

- Distinguish source inspection, static analysis, compiled tests, actual runtime observation and
  deployment. Never claim a runtime result from prose or a screenshot alone. State dates,
  source/binary identities, denominator, skips, failures and claim limits; rederive stale counts.
- Show discriminating negative/mutation controls fail. Use independent byte/pixel goldens for
  format work; do not merely recapture outputs to fix a pin. For a failing assertion, establish
  whether it ever passed and whether its input/payload still justifies it. A zero exit without
  an earned verdict is not a pass; missing prerequisites are explicit SKIPs, not successes.
- Keep comparisons on the same roster or explain denominator/membership changes. Quarantines
  remain loud, named, owned and time-boxed; never relabel a quarantined FAIL as PASS.
- Update documentation that describes changed behavior in the same slice. Bind each claim to
  the correct subject; a true result attributed to the wrong script is still false evidence.
  Prefer stable symbols over drifting line numbers for concurrently edited code.
- Run relevant focused tests during iteration and full required regression/release gates before
  completion. The native flow and component sweeps are produced by
  [run-flow-suite.ps1](../../native/run-flow-suite.ps1): its default `-Roster flow` writes
  `native/flow-status.json`; `-Roster scripts` writes `native/scripts-status.json`, using
  the corresponding lists in [test.ps1](../../native/test.ps1). Consult the runner's actual
  parameters and the native README. Source-bound artifacts must be fresh after native changes; do not hand-edit
  measured status to green. The corpus checks freshness/disclosure and runs selected native
  behavior gates; it is not a substitute for the complete native sweeps or boot engine-smoke.
- `pnpm test:corpus` runs the whole `tools/` pytest suite (13610 tests as measured 2026-10-13;
  retained baseline, not a new collection). Re-measure with `python -m pytest tools/ --collect-only -q`
  before quoting a current total; the documentation gate retains its 15% drift band.
  Run the suite when tools or JSON ledgers change.
  External never-vendored prerequisites may skip when absent; disclose that limitation. Use the
  actual exit code and counts. The documented Unicorn `mem_map` access-violation traceback in
  `test_unicorn_gateway_pic.py` has occurred with passing tests/exit zero; do not assume either
  regression or success from the traceback alone.
- Before completing an authorized implementation slice, document the verified scope, inspect
  diff/status, commit only owned source/docs and push. Verify the intended local/remote revision
  and report residual dirty work rather than claiming an unrelated worktree is clean. Do not
  force-push. Explicit no-stage/no-commit/no-push tasks remain uncommitted and reported as such.
  No recovery archives, runtime game data, generated reviews or secret keys belong in commits.

### Native flow-gate coverage and remaining sweep gap

`pnpm test:corpus` runs [test_native_flow_status.py](../../tools/test_native_flow_status.py)
as a standing gate. Its `LiveGateTests` unconditionally check the committed
`native/flow-status.json` against `native/README.md`, require freshness against `native/src`,
and reject retail source writes (with the measured bundled DOSBox directory-mtime exception).
Synthetic controls separately prove the checker can fail; these are not sweep reruns.

The corpus also runs a nonempty set of native DOSBox behaviour scripts, disjoint from
`native/test.ps1`'s `$flowScripts` roster. [test_native_gate_coverage.py](../../tools/test_native_gate_coverage.py)
derives and pins the exact set, distinguishing build/infrastructure invocations from behaviour
gates. Re-derive membership rather than copying a dated count. Neither these selected runs nor
the committed-artifact checks execute the complete `$flowScripts` sweep; regenerate both sweep
artifacts with [run-flow-suite.ps1](../../native/run-flow-suite.ps1) using the rosters above.

## Website build and deployment

The live private verification website is `https://dionysus.dk/greybox/`. A Git push does **not**
deploy it. User-visible `apps/web` or engine changes are incomplete until the production bundle
is built, **atomically deployed**, and checked live. Docs/test-only changes after an unchanged
web bundle do not require another upload. A task prohibiting deployment must report that boundary,
not claim a release.

From the repository root, run the relevant gates and build:

```powershell
pnpm --filter @goldbox/engine test
pnpm test:corpus
pnpm -r exec tsc --noEmit
pnpm build:app
pnpm --filter @goldbox/web e2e
pnpm e2e:intros
```

Run affected authoring/Electron gates as required by their task contracts as well. The full
browser harness is [apps/web/test/e2e.mjs](../../apps/web/test/e2e.mjs); consult its local-data
contract. The static registry count is `apps/web/test/e2e.mjs`, 195 cases (158 `runners`
rows + 36 `CASES` rows + the coverage case); this counts registrations, not passing runs.
`GB_E2E_ONLY` scopes iteration, but never land on a scoped run alone. Intro tests do
not replace full e2e. Add new cases to both the full-run list and the focused runner registry,
with the matching registry key as `id`; the coverage case checks agreement. The corpus parser
also anchors on `const runners = new Map([`; changing that structure requires its guard review.

Output is `apps/web/dist-app/`. Existing warnings for the placeholder `C:/...` path and optional
`Death Knights of Krynn/SAVE/CHRDATA1.EFF` are tolerated; new missing assets are not.

Use the existing generic `deploy-static.ps1` from the locally installed deploy-static skill.
Supply `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` and `DEPLOY_REMOTE_BASE` through the environment
(the existing remote base is `/var/www/html`). Keep the private key outside the repository.
From the repository root:

```powershell
# DEPLOY_SCRIPT is the local path to the existing deploy-static.ps1.
Set-Location apps/web
& $env:DEPLOY_SCRIPT -Name greybox -Dir ./dist-app -Htaccess ./deploy/.htaccess
Set-Location ../..
```

The script uploads into a unique temporary directory, moves the current site to
`/var/www/html/.greybox.bak`, then atomically swaps the upload into `/var/www/html/greybox`.
**Do not replace this with an in-place upload.** A missing local deploy tool/configuration is
an environment blocker, not permission to invent an alternate deployment path.

After deployment, prove live HTML names the same hashed JS bundle as local
`apps/web/dist-app/index.html`; exercise affected routes, require root HTTP 200 and check for
browser console errors and 4xx asset responses. Report the deployed bundle filename.

```powershell
$env:GB_INTRO_BASE_URL='https://dionysus.dk/greybox/'
pnpm e2e:intros
Remove-Item Env:GB_INTRO_BASE_URL

$env:GB_E2E_BASE_URL='https://dionysus.dk/greybox'
$env:GB_E2E_ONLY='cok-campaign-continuity' # choose the affected production route
pnpm --filter @goldbox/web e2e
Remove-Item Env:GB_E2E_BASE_URL
Remove-Item Env:GB_E2E_ONLY
```

Keep production-route selection narrow: production has no repository `/@fs` development asset
paths. This focused live check supplements, not replaces, the full local browser gate.
