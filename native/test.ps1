# test.ps1 -- serial native DOS smoke-test runner.
#
# `-FlowSmoke` IS IN NO STANDING GATE, and round 36's "registered in the standing
# suite" wiring clause is therefore satisfied on paper only. The narrow
# `-SelfTestRunnerSemantics` mode is run by tools/test_native_runner_semantics.py,
# but it creates only temporary child scripts; it neither names nor runs a native
# flow. No `scripts` entry in any of the repo's six package.json files invokes a
# flow mode, apps/web/test/e2e.mjs never spawns one, there is no .github/
# directory and .git/hooks holds only samples. The only flow-mode references are prose
# (native/README.md:1233-1241, tools/dosbot/README.md:37-38) recommending a
# human run it. docs/engine/research/native-cok-dok-compatibility-plan.md:194
# still lists "put native/test.ps1 -FlowSmoke behind a standing gate" as OPEN.
#
# It is deliberately NOT wired in yet. WHAT WOULD HAVE TO BE TRUE FIRST:
#   1. The flow tests that are red on HEAD independently of any current work
#      must be green or explicitly quarantined with a reason. A gate that is
#      red on arrival trains people to ignore it. MEASURED 2026-09-05, running
#      the $flowScripts list below one script at a time (this runner cannot
#      count them itself -- see point 2): 27 scripts, 16 PASS, 0 SKIP,
#      11 RED. The eleven are gbdqk-intro-flow-test.ps1,
#      gbdqk-playable-flow-test.ps1, gbdqk-create-test.ps1,
#      gbdqk-multistep-flow-test.ps1, ccecl-dqk-vmrun-test.ps1,
#      ccecl-dqk-combat-test.ps1, ccecl-dok-combat-gap-test.ps1,
#      ccecl-dok-thief-matrix-test.ps1, gbcoab-flow-test.ps1,
#      gbbroader-flow-test.ps1 and gbdqk-flow-test.ps1. All eleven were then
#      re-run with native/src/gbboot.asm replaced by `git show
#      HEAD:native/src/gbboot.asm` -- gbboot.asm being the only modified .asm
#      in the tree -- and all eleven failed with byte-identical messages, so
#      none of them is round 36's doing. The honest baseline is 11 reds, not
#      the 2 first reported nor the 4 the verifier found.
#      UPDATED 2026-09-05 (round 37): that 11 is now the CONTROL, not the
#      current number. native/run-flow-suite.ps1 reproduced it exactly -- 16
#      PASS / 0 SKIP / 11 RED, the same eleven names, on native/src content
#      hash 32d3cf22 -- and then measured 19 PASS / 8 FAIL after this round's
#      fixes, 27/27 classified with zero unclassified, over five full sweeps.
#      The three that flipped are gbdqk-playable-flow-test.ps1,
#      gbdqk-create-test.ps1 and gbdqk-multistep-flow-test.ps1. Quote the
#      artifact (native/flow-status.json), not this comment: it carries the
#      content hash the sweep ran against, so a reader can tell whether the
#      number is still about the tree in front of them. The reproduction is
#      what makes 8 meaningful; a number with no control is not a measurement.
#   2. $ErrorActionPreference = "Stop" plus &-invocation means the FIRST throw
#      aborts the whole run, so THIS runner still hides the status of every
#      script after the first red. A gate needs per-script pass/fail and a
#      summary count, not first-failure abort.
#      ADDRESSED ELSEWHERE 2026-09-05 (round 37), and deliberately not by
#      rewriting this file: native/run-flow-suite.ps1 runs each of the 27
#      scripts in its own `pwsh -NoProfile -File` child, so one red cannot
#      hide the next, and writes native/flow-status.json with per-script
#      status, exit code, verbatim throw text and a classification rule. It
#      AST-parses the $flowScripts list out of THIS file rather than copying
#      it -- this repo has twice been bitten by a hand-maintained parallel
#      list. So the counting problem is solved; what is still unsolved is
#      this runner's own semantics, which is why the item stays open here.
#   3. CLOSED 2026-09-11. Each script now runs in a child pwsh, so a child
#      `exit` cannot terminate this runner before its exit status is checked.
#      A nonzero exit throws; an exit-0 `SKIP:` line is counted separately from
#      PASS in the flow summary. -SelfTestRunnerSemantics proves both branches
#      with temporary scripts and tools/test_native_runner_semantics.py runs
#      that proof in the normal Python corpus.
#   4. -EngineSmoke runs gbdqk-playable-flow-test.ps1 immediately after the two
#      new round-36 tests (lines below), and that DQK test is red, so
#      -EngineSmoke exits 1 regardless of what the new tests did. Either the DQK
#      test goes green or it moves out of the smoke path.
#   5. LARGELY FIXED 2026-09-05 (round 37 R1). This item used to list ~20
#      unfixed offenders that mount a RETAIL game folder as a writable DOS
#      drive; 35 mount sites across 20 files have since been staged through
#      native/retail-stage.ps1, which mirrors a read-only source into
#      native\build\_retail\<slug> and mounts the mirror. Measured after the
#      fix: 19 of 20 files run, 19 of 19 produced ZERO retail-folder writes,
#      with the three retail folders byte- AND timestamp-identical to the
#      session baseline.
#      SAY THE NULL, because "19 of 19" is not the number it looks like. Of the
#      16 files measured BEFORE the fix, only 3 actually wrote (correction C7 --
#      the enumerated offender list overcounted, and the measuring agent
#      correctly claimed no credit for the other 13). So roughly 16 of those 19
#      clean results were already clean beforehand: they are a CONTROL showing
#      the harness does not itself write, not evidence that staging worked. The
#      discriminating figure is 3 of 3 formerly-writing files now clean; the
#      remaining 16 could not have moved in either direction. Quoting 19/19
#      without that denominator is how a control group gets counted as a result.
#      run-cok.ps1 and run-goldbox.ps1 have PrepareOnly session regressions as of 2026-09-13.
#      The test invokes its -PrepareOnly mode, so it can prove session-owned C:
#      and D: mounts, copied helpers, normal/resume/party-menu `/!` arguments,
#      and source/session preservation without opening a visible DOSBox window.
#      It intentionally does not claim an automated keyboard-playthrough; the
#      player-facing route remains a visible interactive DOSBox session.
#      THE DAMAGE WAS WORSE THAN THIS COMMENT USED TO SAY, and the reason is
#      worth keeping: one run of gbflow-test.ps1 created CCFP.MOV *and rewrote
#      six tracked Champions of Krynn/SAVE/CHRDATA{1..6}.SAV*. The saves came
#      back BYTE-IDENTICAL, so `git status` stayed clean and only mtimes moved.
#      A content-only oracle cannot see that class of write at all -- which is
#      why it went unreported for so long. Detect it with a listing that
#      carries size and mtime (find -printf '%p|%s|%T@'), not with git status.
#      STILL UNFIXED, outside round 37 R1's ownership, in rough risk order:
#      dqkdrive.ps1 (writes _drive.conf and _capture\ directly INSIDE $GameDir,
#      mounts it as C: and makes C: current -- and calls ForceFocus, a
#      host-level focus steal CLAUDE.md forbids while other DOSBox sessions
#      run), gbcoab-flow-test.ps1 (5 sites, coab_extracted\Data as D: current),
#      ccecl-buck-chained-step-scan.ps1:258 and
#      ccecl-nwn-chained-step-scan.ps1:227 (both mount never-vendored D:\
#      sources), and cc-games.ps1:52 (retail as D:, C: stays current, so lower
#      risk but still writable).
#      Unattributed: something creates and removes zero-byte
#      "The Dark Queen of Krynn/DOSBOX/stdout.txt" and "stderr.txt"
#      (gitignored). Proven NOT to be R1's scripts, which redirect elsewhere.
#      The pattern to follow for anything new is native/retail-stage.ps1, or
#      the inline scratch copy in gbcombat-icon-flow-test.ps1 /
#      gbscene-dos-flow-test.ps1.
#
# The native smoke scripts all rebuild tools under native\build. Run them
# serially through this wrapper; parallel execution can race on shared .COM
# outputs and produce false failures. The wrapper defaults to the shared
# headless/no-focus DOSBox launcher; pass -Visible to debug with windows.
param(
  [switch]$EngineSmoke,
  [switch]$FlowSmoke,
  [switch]$FlowOnly,
  [switch]$DokCombatAudit,
  [switch]$DokCombatAuditOnly,
  [switch]$RouteScan,
  [switch]$RouteScanOnly,
  [switch]$SelfTestRunnerSemantics,
  [ValidateRange(1, 256)]
  [int]$RouteScanSeedCount = 4,
  [switch]$Headless,
  [switch]$Visible
)
$ErrorActionPreference = "Stop"

if ($FlowOnly) {
  $FlowSmoke = $true
}
if ($DokCombatAuditOnly) {
  $DokCombatAudit = $true
}
if ($RouteScanOnly) {
  $RouteScan = $true
}

$useHeadless = -not $Visible
if ($Headless) {
  $useHeadless = $true
}

$native = $PSScriptRoot

function Get-RequiredDosBoxPath {
  if ($env:GOLDBOX_DOSBOX_EXE) { return $env:GOLDBOX_DOSBOX_EXE }
  return (Join-Path (Split-Path -Parent $native) 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe')
}

function Assert-RequiredDosBox {
  $dosbox = Get-RequiredDosBoxPath
  if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) {
    throw "Required DOSBox executable is unavailable: $dosbox"
  }
}

$scripts = @(
  "ccecl-ack-resume-test.ps1",
  "ccecl-effects-test.ps1",
  "ccflow-test.ps1",
  "ccflow-long-text-test.ps1",
  "ccecl-menu-resume-test.ps1",
  "ccecl-pool-menu-capacity-test.ps1",
  "ccecl-dok-short-menu-test.ps1",
  "ccecl-pod-short-menu-test.ps1",
  "ccecl-buck-short-menu-test.ps1",
  "ccecl-matrix-short-menu-test.ps1",
  "ccefx-test.ps1",
  "ccbind-test.ps1",
  "cchost-test.ps1",
  "cchost-npc-test.ps1",
  "ccdat-test.ps1",
  "ccdatwiztest.ps1",
  "ccfp-effects-test.ps1",
  "ccgeo-bridge-test.ps1",
  "cchlib-dqk-art-test.ps1",
  "ccmusic-test.ps1",
  "ccsnd-play-test.ps1",
  "cccombat-test.ps1",
  "cccombat-glib-moncha-test.ps1",
  "cccombat-moncha-bounds-test.ps1",
  "cccombat-hlib-moncha-consumer-test.ps1",
  "ccmenu-test.ps1",
  "ccparty-test.ps1",
  "ccsession-test.ps1",
  "player-session-test.ps1",
  "run-cok-session-test.ps1",
  "run-goldbox-session-test.ps1",
  "gbboot-memorization-test.ps1",
  "gbboot-learn-test.ps1",
  "gbboot-lunar-test.ps1",
  "gbboot-item-query-test.ps1",
  "ccinv-test.ps1",
  "ccinv-learning-test.ps1",
  "ccinv-item-query-test.ps1",
  "ccecl-clock-effects-test.ps1",
  "ccecl-spell-test.ps1",
  # Enrolled 2026-10-07, not yet swept: four focused CC* DOSBox scripts, each prints an early SKIP:.
  "ccecl-matrix-op4c-test.ps1",
  "ccparty-dqkdice-test.ps1",
  "cccombat-dokinit-test.ps1",
  "cccombat-dqkai-test.ps1",
  "cccombat-party8-test.ps1",
  "cchost-dqk-damage-test.ps1"
)

$flowScripts = @(
  "gbintro-flow-test.ps1",
  "gbcok-playable-flow-test.ps1",
  "gbcombat-icon-flow-test.ps1",
  "gbscene-dos-flow-test.ps1",
  "gbdok-intro-flow-test.ps1",
  "gbdok-playable-flow-test.ps1",
  "gbdqk-intro-flow-test.ps1",
  "gbdqk-playable-flow-test.ps1",
  "gbdqk-create-test.ps1",
  "gbdqk-multistep-flow-test.ps1",
  "gbdqk-dispatch-flow-test.ps1",
  "ccecl-dqk-vmrun-test.ps1",
  "ccecl-dqk-combat-test.ps1",
  "ccecl-dok-combat-gap-test.ps1",
  "ccecl-dok-thief-matrix-test.ps1",
  "ccecl-dok-static-combat-scan.ps1",
  "gbdqk-combat-flow-test.ps1",
  "gbboot-create-test.ps1",
  "gbdok-create-test.ps1",
  "gbcoab-flow-test.ps1",
  "gbnwn-flow-test.ps1",
  "gbbuck-flow-test.ps1",
  "gbbroader-flow-test.ps1",
  "gbdqk-flow-test.ps1",
  "gbsecret-glib-combat-flow-test.ps1",
  "gbdqk-amiga-glib-flow-test.ps1",
  "gbpool-flow-test.ps1",
  "gbsecret-hlib-flow-test.ps1",
  "gbsecret-glib-flow-test.ps1",
  "gbgateway-glib-flow-test.ps1",
  "gbflow-test.ps1",
  "gbdok-flow-test.ps1",
  "gbdok-camp-rest-flow-test.ps1",
  # Enrolled here 2026-09-23, plan step 9b GBBOOT boot-time GBDJ /R recovery
  # caller. Denominator 35 -> 36. See native/gbdok-journal-flow-test.ps1 and
  # docs/engine/PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md section 28.5.
  "gbdok-journal-flow-test.ps1",
  # Enrolled 2026-10-07, swept the same day: DQK ADD_NPC join. Flow denominator 37 -> 38.
  "gbdqk-npc-join-test.ps1",
  # Enrolled 2026-10-07, swept the same day: Matrix Cubed area 19 flow and the Pools and Treasures short-frame CCECL flows. Flow denominator 38 -> 41.
  "gbmatrix-flow-test.ps1",
  # Enrolled 2026-10-07: retail first-map starts for Pools of Darkness, Treasures and Gateway DOS. Flow denominator 41 -> 44.
  "gbpools-flow-test.ps1",
  "gbtreasures-flow-test.ps1",
  "gbgateway-dos-flow-test.ps1",
  "ccecl-pools-flow-test.ps1",
  "ccecl-treasures-flow-test.ps1",
  # Enrolled 2026-09-10. Until now these two were in ZERO runners -- see the
  # disclosure comment near the top of this file. Adding them here also enrols
  # them in native/run-flow-suite.ps1, which AST-parses THIS array rather than
  # duplicating it, and hence in native/flow-status.json. Denominator 28 -> 30;
  # neither has a measured status yet, so either may come back RED.
  # PREDICTION, derived statically 2026-09-10 and NOT measured at the time --
  # BOTH HALVES HAVE SINCE BEEN MEASURED, and the comment is retracted in place
  # rather than deleted so the reading can be compared with the result.
  # It said: cgb-gbim-test.ps1 ends with `RESULT: ... PASS` and should classify
  # PASS or, without DoK BIGPIC1.DAX, SKIP -- that half HELD, it classifies
  # PASS. And it said ccecl-dok-b51-watch-test.ps1 ends with `RESULT: DoK
  # block-51 CCECL trace-watch scan completed` -- no PASS word -- so
  # run-flow-suite.ps1 will classify a clean exit 0 as FAIL under its
  # `zero-exit-without-verdict` rule; that half ALSO held, and its first-ever
  # measured verdict was exactly that FAIL. It then ENDED on 2026-09-10: the
  # script was given 19 assertion throws under $ErrorActionPreference = 'Stop',
  # with no try/catch below its assertion banner and the RESULT line last in
  # the file, so the PASS word is now reachable only if all 19 clear. Six
  # mutations were each seen RED before it was believed. Full derivation,
  # per-assertion justification and the nine REJECTED candidates: the status
  # note in native/README.md.
  # THE RULE ITSELF DID NOT END and still binds every script here: do NOT make
  # a script green by appending the word PASS to a line that asserts nothing.
  # What changed is that this one now asserts something. The sibling scan
  # already in this list, ccecl-dok-static-combat-scan.ps1, earns its
  # `RESULT: ... PASS` the same way -- by asserting first.
  # NOTE, and these lines are deliberately parenthesis-free:
  # tools/test_native_flow_status.py's flow_scripts_from_test_ps1 reads this
  # array with a NON-GREEDY regex that stops at the first close-paren after the
  # opening `@`. A literal close-paren anywhere inside this array -- comments
  # included -- therefore truncates its match and silently drops every entry
  # after it. Caught here the hard way: the first draft of this very comment
  # quoted that regex verbatim, and the quoted close-paren dropped both entries
  # below while the array still parsed fine as PowerShell.
  "ccecl-dok-b51-watch-test.ps1",
  "cgb-gbim-test.ps1",
  "ccfp-encounter-art-test.ps1",
  "gbfp-encounter-dos-test.ps1",
  "gbdqk-area2-menu-flow-test.ps1"
)

$oldHeadless = $env:GOLDBOX_DOSBOX_HEADLESS
if ($useHeadless) {
  $env:GOLDBOX_DOSBOX_HEADLESS = "1"
}

function Invoke-SmokeScript {
  param(
    [Parameter(Mandatory)][string]$Script,
    [string]$Path
  )

  if (-not $Path) { $Path = Join-Path $native $Script }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Smoke script is absent: $Script"
  }
  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) {
    throw "Could not parse ${Script}: $($parseErrors[0].Message)"
  }
  $hasHeadless = $false
  if ($ast.ParamBlock) {
    foreach ($param in $ast.ParamBlock.Parameters) {
      if ($param.Name.VariablePath.UserPath -eq "Headless") {
        $hasHeadless = $true
        break
      }
    }
  }
  # Run each script in a child pwsh. A called .ps1 can execute `exit`, which
  # terminates this host before a direct & invocation can inspect
  # $LASTEXITCODE. Exit status wins over a SKIP line: a script that says SKIP
  # and then exits nonzero is a broken script, not an optional pass.
  $logRoot = Join-Path ([IO.Path]::GetTempPath()) ('gb-smoke-child-' + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $outFile = Join-Path $logRoot 'stdout.txt'
  $errFile = Join-Path $logRoot 'stderr.txt'
  $proc = $null
  if ($hasHeadless) {
    $arguments = @('-NoProfile', '-NonInteractive', '-File', $Path, "-Headless:$useHeadless")
  } else {
    $arguments = @('-NoProfile', '-NonInteractive', '-File', $Path)
  }
  try {
    # Windows PowerShell 5.1 exposes $null for Start-Process.ExitCode when the
    # child has redirected streams. Put those redirections under cmd and retain
    # a ProcessStartInfo exit code instead; run-flow-suite.ps1 uses the same
    # pattern and its cross-host smoke pins this exact failure mode.
    $hostPath = (Get-Command pwsh -CommandType Application -ErrorAction Stop).Source
    $childArgs = $arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $env:ComSpec
    $psi.Arguments = ('/d /s /c ""{0}" {1} 1>"{2}" 2>"{3}""' -f `
      $hostPath, ($childArgs -join ' '), $outFile, $errFile)
    $psi.WorkingDirectory = $native
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    if (-not $proc.Start()) { throw "Could not start smoke child: $Script" }
    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
    $childOutput = if (Test-Path -LiteralPath $outFile) { @(Get-Content -LiteralPath $outFile) } else { @() }
    $childError = if (Test-Path -LiteralPath $errFile) { @(Get-Content -LiteralPath $errFile) } else { @() }
  } finally {
    if ($null -ne $proc) { $proc.Dispose() }
    Remove-Item -LiteralPath $logRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  foreach ($line in $childOutput) { Write-Host $line }
  foreach ($line in $childError) { Write-Host $line }
  if ($exitCode -ne 0) {
    throw "$Script exited $exitCode"
  }
  $skipLine = @($childOutput | Where-Object { ([string]$_) -match '^\s*SKIP\s*:' } | Select-Object -First 1)
  return [pscustomobject]@{
    status = if ($skipLine.Count -gt 0) { 'SKIP' } else { 'PASS' }
    skip_line = if ($skipLine.Count -gt 0) { ([string]$skipLine[0]).Trim() } else { '' }
  }
}

function Invoke-RunnerSemanticsSelfTest {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('gb-runner-semantics-' + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  try {
    $skip = Join-Path $tmp 'skip.ps1'
    $nonzero = Join-Path $tmp 'nonzero.ps1'
    Set-Content -LiteralPath $skip -Encoding ASCII -Value @'
param([switch]$Headless)
Write-Output 'SKIP: synthetic optional retail data is absent'
exit 0
'@
    Set-Content -LiteralPath $nonzero -Encoding ASCII -Value @'
param([switch]$Headless)
Write-Output 'synthetic child reached its controlled failure'
exit 7
'@
    $skipResult = Invoke-SmokeScript -Script 'synthetic-skip.ps1' -Path $skip
    if ($skipResult.status -ne 'SKIP' -or $skipResult.skip_line -notmatch '^SKIP:') {
      throw 'runner self-test did not classify an exit-0 SKIP line as SKIP'
    }
    $nonzeroCaught = $false
    try {
      Invoke-SmokeScript -Script 'synthetic-nonzero.ps1' -Path $nonzero | Out-Null
    } catch {
      if ($_.Exception.Message -notmatch 'synthetic-nonzero\.ps1 exited 7') { throw }
      $nonzeroCaught = $true
    }
    if (-not $nonzeroCaught) {
      throw 'runner self-test let an exit-7 child continue as a pass'
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'RESULT: native runner child-exit and SKIP classification self-test PASS'
  return 0
}

if ($SelfTestRunnerSemantics) { exit (Invoke-RunnerSemanticsSelfTest) }

# Every normal native lane invokes DOS programs. A missing emulator is an
# unavailable required capability, not an optional-data SKIP.
Assert-RequiredDosBox

try {
  if (-not $FlowOnly -and -not $RouteScanOnly -and -not $DokCombatAuditOnly) {
    foreach ($script in $scripts) {
      Write-Output "== $script =="
      Invoke-SmokeScript $script
    }

    Write-Output "== build.ps1 -Target all =="
    & (Join-Path $native "build.ps1") -Target all

    Write-Output "== gbboot-test.ps1$($(if ($EngineSmoke) { ' -EngineSmoke' } else { '' })) =="
    & (Join-Path $native "gbboot-test.ps1") -EngineSmoke:$EngineSmoke -Headless:$useHeadless

    if ($EngineSmoke -and -not $FlowSmoke) {
      Write-Output "== gbcok-playable-flow-test.ps1 =="
      Invoke-SmokeScript "gbcok-playable-flow-test.ps1"

      Write-Output "== gbcombat-icon-flow-test.ps1 =="
      Invoke-SmokeScript "gbcombat-icon-flow-test.ps1"

      Write-Output "== gbscene-dos-flow-test.ps1 =="
      Invoke-SmokeScript "gbscene-dos-flow-test.ps1"

      Write-Output "== gbdqk-playable-flow-test.ps1 =="
      Invoke-SmokeScript "gbdqk-playable-flow-test.ps1"

      Write-Output "== gbdqk-multistep-flow-test.ps1 =="
      Invoke-SmokeScript "gbdqk-multistep-flow-test.ps1"

      Write-Output "== gbdqk-dispatch-flow-test.ps1 =="
      Invoke-SmokeScript "gbdqk-dispatch-flow-test.ps1"

      Write-Output "== gbdqk-combat-flow-test.ps1 =="
      Invoke-SmokeScript "gbdqk-combat-flow-test.ps1"

      Write-Output "== gbdok-playable-flow-test.ps1 =="
      Invoke-SmokeScript "gbdok-playable-flow-test.ps1"

      Write-Output "== gbnwn-flow-test.ps1 =="
      Invoke-SmokeScript "gbnwn-flow-test.ps1"

      Write-Output "== gbcoab-flow-test.ps1 =="
      Invoke-SmokeScript "gbcoab-flow-test.ps1"

      Write-Output "== gbbuck-flow-test.ps1 =="
      Invoke-SmokeScript "gbbuck-flow-test.ps1"

      Write-Output "== gbbroader-flow-test.ps1 =="
      Invoke-SmokeScript "gbbroader-flow-test.ps1"
    }
  }

  if ($FlowSmoke) {
    $flowPassed = 0
    $flowSkipped = 0
    foreach ($script in $flowScripts) {
      Write-Output "== $script =="
      $flowResult = Invoke-SmokeScript $script
      if ($flowResult.status -eq 'SKIP') {
        $flowSkipped++
        Write-Output "== $script classified SKIP: $($flowResult.skip_line) =="
      } else {
        $flowPassed++
      }
    }
  }

  if ($DokCombatAudit) {
    Write-Output "== ccecl-dok-b51-state-scan.ps1 =="
    Invoke-SmokeScript "ccecl-dok-b51-state-scan.ps1"

    Write-Output "== ccecl-dok-static-combat-scan.ps1 =="
    Invoke-SmokeScript "ccecl-dok-static-combat-scan.ps1"

    Write-Output "== ccecl-dok-route-scan.ps1 -SeedCount $RouteScanSeedCount -WithThiefMatrix =="
    & (Join-Path $native "ccecl-dok-route-scan.ps1") -Headless:$useHeadless -SeedCount $RouteScanSeedCount -WithThiefMatrix

    Write-Output "== ccecl-dok-chained-step-scan.ps1 -WithThiefMatrix (all areas/all blocks/nonzero descriptors) =="
    & (Join-Path $native "ccecl-dok-chained-step-scan.ps1") -Headless:$useHeadless -WithThiefMatrix

    Write-Output "== ccecl-dok-b51-provenance-scan.ps1 -WithThiefMatrix (all areas/all blocks/nonzero descriptors) =="
    & (Join-Path $native "ccecl-dok-b51-provenance-scan.ps1") -Headless:$useHeadless -WithThiefMatrix
  } elseif ($RouteScan) {
    Write-Output "== ccecl-dok-route-scan.ps1 -SeedCount $RouteScanSeedCount =="
    & (Join-Path $native "ccecl-dok-route-scan.ps1") -Headless:$useHeadless -SeedCount $RouteScanSeedCount
  }

  $modes = @()
  if ($EngineSmoke) { $modes += "EngineSmoke" }
  if ($FlowSmoke) { $modes += "FlowSmoke" }
  if ($FlowOnly) { $modes += "FlowOnly" }
  if ($DokCombatAudit) { $modes += "DokCombatAudit" }
  if ($DokCombatAuditOnly) { $modes += "DokCombatAuditOnly" }
  if ($RouteScan) { $modes += "RouteScan" }
  if ($RouteScanOnly) { $modes += "RouteScanOnly" }
  if ($modes.Count -gt 0) {
    $flowSummary = if ($FlowSmoke) { "; $flowPassed PASS / $flowSkipped SKIP flow scripts" } else { '' }
    Write-Output "RESULT: native serial smoke PASS ($($modes -join ', ')$flowSummary)"
  } else {
    Write-Output "RESULT: native serial smoke PASS"
  }
} finally {
  $env:GOLDBOX_DOSBOX_HEADLESS = $oldHeadless
}
