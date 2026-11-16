# run-flow-suite.ps1 -- per-script status sweep over native/test.ps1's $flowScripts list.
#
# WHY THIS EXISTS
# ---------------
# `native/test.ps1` cannot report a count. It sets `$ErrorActionPreference = "Stop"` and
# `&`-invokes each flow script in its own runspace, so the FIRST `throw` aborts the whole
# run and every script after it has no recorded status; and it never checks
# `$LASTEXITCODE`, so a child that exits non-zero WITHOUT throwing is silently a pass.
# Measured 2026-09-05: the 27-script sweep had to be run one script per
# `pwsh -NoProfile -File` to learn it was 16 PASS / 0 SKIP / 11 RED.
#
# This runner does that properly and writes the result to a committed artifact
# (`native/flow-status.json`) that `tools/test_native_flow_status.py` gates. The artifact,
# not the README, is the source of truth for "is this script red"; the check exists to stop
# `native/README.md` narrating a red script as though it worked, which is how
# `gbdqk-multistep-flow-test.ps1` stayed red for 52 days with nothing going red anywhere.
#
# WHAT IT DOES NOT DO
# -------------------
# It does not fix any script and it does not write into the retail game folders. It DOES
# invoke scripts that currently do (`gbflow-test.ps1` and `gbdok-flow-test.ps1` both
# `mount D "<retail>"` then `D:`, which makes the retail folder the child's current drive
# and is how `CCFP.MOV` came to be written into "Champions of Krynn/" and "Death Knights of
# Krynn/"). This runner therefore snapshots all three retail folders before and after the
# sweep and records any new/changed file in the artifact's `retail_folder_writes` array, so
# the leak is measured rather than assumed. It deliberately does NOT delete what it finds:
# other agents may be running their own sessions against those folders, and silently
# deleting files under them would be a worse failure than reporting them.
#
# TWO ORACLES, BECAUSE ONE OF THEM IS STRUCTURALLY BLIND
# ------------------------------------------------------
# The file-level snapshot above cannot see a CREATE-THEN-DELETE: the file set and every
# file's bytes are identical afterwards, and only the containing DIRECTORY's mtime moved.
# That is not hypothetical here. Measured 2026-09-05: a `gbboot-test.ps1` run reported zero
# file changes while "The Dark Queen of Krynn/DOSBOX"'s own mtime moved, reproducibly, and
# the cause was isolated to the RETAIL DOSBox.exe itself -- running it bare, with a trivial
# conf, `-exit`, no staging and no mount, moves that directory's mtime too. So the runner
# also snapshots directory mtimes (`retail_dir_touches`), and the two arrays answer
# different questions: `retail_folder_writes` says which FILES changed, `retail_dir_touches`
# says which DIRECTORIES were written through.
#
# `retail_dir_touches` is `null`, never `[]`, when it was not collected -- with the reason
# in `retail_probe_reason`. `[]` is a measurement ("probed, found nothing"); `null` is an
# absence ("not probed"), and `tools/test_native_flow_status.py` FAILS the measured contract
# on the null so an un-probed artifact cannot be read as a measured zero. Prove the probe
# can fire with `-SelfTestDirProbe`, which mutation-tests it in both directions on a
# throwaway tree (never on the retail folders).
#
# It also does not decide `history.ever_green`. A single sweep cannot observe "this script
# has never passed"; that is a claim about the past. Values come from the cited
# $neverGreenEvidence table below (each entry records evidence_kind + source), else are
# carried forward from the previous artifact, else are $null -- and $null means UNKNOWN,
# not "green once".
#
# USAGE
#   pwsh -NoProfile -File native/run-flow-suite.ps1              # full sweep, headless
#   pwsh -NoProfile -File native/run-flow-suite.ps1 -Visible     # windowed, for debugging
#   pwsh -NoProfile -File native/run-flow-suite.ps1 -Only gbdqk-flow-test.ps1
#   pwsh -NoProfile -File native/run-flow-suite.ps1 -NoRun       # placeholder artifact only
#
# `-NoRun` writes an artifact with `measured=false` and every script `status="UNMEASURED"`.
# That artifact FAILS `tools/test_native_flow_status.py` on purpose. It exists so a
# placeholder can be honest instead of fabricating a green sweep -- never hand-edit a status
# into this file.

[CmdletBinding()]
param(
  [string]$Out,
  [string]$Only,
  [ValidateSet('flow', 'scripts')]
  [string]$Roster = 'flow',
  [switch]$NoRun,
  [switch]$Visible,
  [switch]$KeepLogs,
  [switch]$SelfTestDirProbe,
  [switch]$SelfTestExitCapture,
  [ValidateRange(30, 7200)]
  [int]$TimeoutSeconds = 1200
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$native = $PSScriptRoot
$root = Split-Path -Parent $native
$rosterVar = if ($Roster -eq 'scripts') { 'scripts' } else { 'flowScripts' }
if (-not $Out) {
  $Out = Join-Path $native $(if ($Roster -eq 'scripts') { 'scripts-status.json' } else { 'flow-status.json' })
}
$logDir = Join-Path $native 'build\flow-status-logs'

$SCHEMA = if ($Roster -eq 'scripts') { 'goldbox-native-scripts-status/1' } else { 'goldbox-native-flow-status/1' }

# ---------------------------------------------------------------------------
# 1. The script list comes from native/test.ps1, parsed. Never duplicated here.
#    A hand-copied list is a second thing to keep in sync, and this repo has been
#    bitten twice by exactly that (the e2e case registry vs. the full-run list).
# ---------------------------------------------------------------------------
function Get-FlowScriptList {
  param([Parameter(Mandatory)][string]$TestScriptPath, [string]$VarName = 'flowScripts')

  $tokens = $null; $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $TestScriptPath, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) {
    throw "Could not parse $TestScriptPath : $($parseErrors[0].Message)"
  }
  $assign = $ast.FindAll({
      param($n)
      $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and
      $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
      $n.Left.VariablePath.UserPath -eq $VarName
    }, $true)
  if ($assign.Count -ne 1) {
    throw "Expected exactly one `$$VarName assignment in $TestScriptPath, found $($assign.Count)"
  }
  $arr = $assign[0].Right.FindAll({
      param($n) $n -is [System.Management.Automation.Language.ArrayLiteralAst]
    }, $true)
  if ($arr.Count -lt 1) { throw "`$$VarName in $TestScriptPath is not an array literal" }
  $names = @()
  foreach ($el in $arr[0].Elements) {
    if ($el -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) {
      throw "Non-literal element in `$${VarName}: $($el.Extent.Text)"
    }
    $names += $el.Value
  }
  if ($names.Count -eq 0) { throw "`$$VarName is empty in $TestScriptPath" }
  return , $names
}

# ---------------------------------------------------------------------------
# 2. Hashes. Two of them, on purpose.
#    - native_src_commit / native_src_tree_hash answer "which committed tree".
#    - native_src_content_hash answers "which BYTES", so an uncommitted edit to
#      native/src invalidates the artifact too. A date would answer neither.
# ---------------------------------------------------------------------------
function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$GitArgs)
  $out = & git -C $root @GitArgs 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($out -join "`n").Trim()
}

function Get-NativeSrcFileHash {
  param([Parameter(Mandatory)][string]$Path)
  # NASM source is textual. Normalize CRLF and legacy CR to LF so a clean
  # checkout with another core.autocrlf setting does not invalidate a sweep.
  # Every non-newline byte remains part of the source-content anchor.
  [byte[]]$raw = [IO.File]::ReadAllBytes($Path)
  $canonical = [System.Collections.Generic.List[byte]]::new()
  for ($i = 0; $i -lt $raw.Length; $i++) {
    if ($raw[$i] -eq 13) {
      if (($i + 1 -lt $raw.Length) -and ($raw[$i + 1] -eq 10)) { $i++ }
      $canonical.Add(10)
    } else {
      $canonical.Add($raw[$i])
    }
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (($sha.ComputeHash($canonical.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { $sha.Dispose() }
}

function Get-NativeSrcContentHash {
  $srcDir = Join-Path $native 'src'
  if (-not (Test-Path $srcDir)) { throw "native/src not found at $srcDir" }
  # ORDINAL sort, explicitly. PowerShell's Sort-Object is CULTURE-aware and ordered
  # ccdat/ccdemo/ccdaa differently from Python's byte-ordinal sort, which silently made
  # this hash disagree with the implementation in tools/test_native_flow_status.py.
  # Per-file canonical newlines make the remaining hash independent of checkout
  # mechanics; two-sided mutation coverage lives in that test module.
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($f in (Get-ChildItem -Path $srcDir -Recurse -File -Force)) {
    $rel = $f.FullName.Substring($srcDir.Length).TrimStart('\', '/').Replace('\', '/').ToLowerInvariant()
    $h = Get-NativeSrcFileHash -Path $f.FullName
    $lines.Add("$rel $h")
  }
  $lines.Sort([System.StringComparer]::Ordinal)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $acc = [System.Text.StringBuilder]::new()
    foreach ($l in $lines) { [void]$acc.Append($l).Append("`n") }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($acc.ToString())
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { $sha.Dispose() }
}

# ---------------------------------------------------------------------------
# 3. Retail-folder snapshot (listing only -- never a write, never a delete).
# ---------------------------------------------------------------------------
$retailFolders = @('Champions of Krynn', 'Death Knights of Krynn', 'The Dark Queen of Krynn')

# The roots are resolved once so the file and directory oracles cannot silently disagree
# about WHICH folders they measured. Both take an override so the self-test below runs the
# shipped code on a throwaway tree instead of a copy of it.
function Get-RetailRoots {
  $roots = [ordered]@{}
  foreach ($name in $retailFolders) {
    $dir = Join-Path $root $name
    if (Test-Path $dir) { $roots[$name] = $dir }
  }
  return $roots
}

function Get-RetailSnapshot {
  param($Roots)
  if ($null -eq $Roots) { $Roots = Get-RetailRoots }
  $snap = @{}
  foreach ($name in @($Roots.Keys)) {
    $dir = $Roots[$name]
    foreach ($f in Get-ChildItem -Path $dir -Recurse -File -ErrorAction SilentlyContinue) {
      $rel = "$name/" + $f.FullName.Substring($dir.Length).TrimStart('\', '/').Replace('\', '/')
      # The DQK retail DOSBox executable creates its own stdout/stderr logs
      # beside the executable, then removes them. They are not game assets;
      # the directory oracle records that process write. Keeping these two
      # volatile files out of the file oracle prevents a stale pre-sweep log
      # from being misreported as a flow-induced retail-data deletion.
      if ($rel -in @(
        'The Dark Queen of Krynn/DOSBOX/stdout.txt',
        'The Dark Queen of Krynn/DOSBOX/stderr.txt'
      )) { continue }
      # sha256 as well as mtime: a same-content rewrite is still a WRITE into a folder
      # this project treats as read-only source, but calling it "modified" would overstate
      # it. The two are recorded as different changes. The retail DOSBox process
      # itself can create and delete stderr.txt between enumeration and hashing;
      # skip only a file that has vanished in that narrow window. The directory
      # snapshot below remains the oracle for that create-then-delete write.
      try {
        $hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      } catch {
        if (-not (Test-Path -LiteralPath $f.FullName)) { continue }
        throw
      }
      $snap[$rel] = [ordered]@{
        len   = $f.Length
        ticks = $f.LastWriteTimeUtc.Ticks
        sha   = $hash
      }
    }
  }
  return $snap
}

# Directory mtimes, including each retail root's own. This is the oracle that sees a
# create-then-delete; the file oracle above cannot, by construction.
function Get-RetailDirSnapshot {
  param($Roots)
  if ($null -eq $Roots) { $Roots = Get-RetailRoots }
  $snap = @{}
  foreach ($name in @($Roots.Keys)) {
    $dir = $Roots[$name]
    $snap[$name] = (Get-Item -LiteralPath $dir).LastWriteTimeUtc.Ticks
    foreach ($d in Get-ChildItem -Path $dir -Recurse -Directory -ErrorAction SilentlyContinue) {
      $rel = "$name/" + $d.FullName.Substring($dir.Length).TrimStart('\', '/').Replace('\', '/')
      $snap[$rel] = $d.LastWriteTimeUtc.Ticks
    }
  }
  return $snap
}

# Both comparators return with a leading comma so an EMPTY result stays an array through
# PowerShell's pipeline unrolling and lands in the artifact as `[]` -- a measured zero --
# rather than collapsing to $null, which the schema reserves for "not probed".
function Compare-FileSnapshots {
  param([Parameter(Mandatory)]$Before, [Parameter(Mandatory)]$After)
  $writes = @()
  foreach ($k in @($After.Keys)) {
    if (-not $Before.ContainsKey($k)) {
      $writes += [ordered]@{ path = $k; change = 'created' }
    }
    elseif ($Before[$k].sha -ne $After[$k].sha) {
      $writes += [ordered]@{ path = $k; change = 'content-modified' }
    }
    elseif ($Before[$k].ticks -ne $After[$k].ticks) {
      $writes += [ordered]@{ path = $k; change = 'touched-content-identical' }
    }
  }
  foreach ($k in @($Before.Keys)) {
    if (-not $After.ContainsKey($k)) { $writes += [ordered]@{ path = $k; change = 'deleted' } }
  }
  return , $writes
}

function Compare-DirSnapshots {
  param([Parameter(Mandatory)]$Before, [Parameter(Mandatory)]$After)
  $touches = @()
  foreach ($k in @($After.Keys)) {
    if (-not $Before.ContainsKey($k)) {
      $touches += [ordered]@{ path = $k; change = 'dir-created' }
    }
    elseif ($Before[$k] -ne $After[$k]) {
      $touches += [ordered]@{
        path         = $k
        change       = 'dir-mtime-moved'
        before_ticks = $Before[$k]
        after_ticks  = $After[$k]
      }
    }
  }
  foreach ($k in @($Before.Keys)) {
    if (-not $After.ContainsKey($k)) { $touches += [ordered]@{ path = $k; change = 'dir-removed' } }
  }
  return , $touches
}

# ---------------------------------------------------------------------------
# 3b. -SelfTestDirProbe: the probe must be seen firing AND seen staying quiet.
#     Both directions, on a throwaway tree under $env:TEMP. It never touches a
#     retail folder, never runs a flow script, and never writes the artifact.
# ---------------------------------------------------------------------------
function Invoke-DirProbeSelfTest {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('gb-dirprobe-' + [guid]::NewGuid().ToString('n'))
  $sub = Join-Path $tmp 'DOSBOX'
  New-Item -ItemType Directory -Path $sub -Force | Out-Null
  Set-Content -Path (Join-Path $sub 'KRYNN.CFG') -Value 'resident' -Encoding ASCII
  $roots = [ordered]@{ 'synthetic-retail' = $tmp }
  $failures = @()
  try {
    # SETTLE FIRST, and this is a real property of the instrument, not self-test scaffolding.
    # NTFS updates a directory's mtime LAZILY: building the tree above landed its update
    # ~185 ms after the create returned, which the first version of this self-test then
    # attributed to its own quiet window and reported as a spurious touch. A baseline taken
    # while an earlier write is still settling makes the probe report the PREVIOUS activity
    # as the sweep's. Waiting for two agreeing snapshots is how the baseline is made honest.
    # The sweep path does NOT do this (it would be untested code on a path this session is
    # not permitted to re-run); the same caveat therefore applies to a real
    # `retail_dir_touches`, and is stated with it in the header above.
    $settled = $false
    $d1 = Get-RetailDirSnapshot -Roots $roots
    for ($try = 0; $try -lt 40; $try++) {
      Start-Sleep -Milliseconds 50
      $d0 = $d1
      $d1 = Get-RetailDirSnapshot -Roots $roots
      # Assign, never `@(Compare-... )`. These comparators `return , $array` so an empty
      # result survives as an array; wrapping the CALL in @() re-wraps that single object
      # and yields Count 1 for an empty diff. That is not hypothetical -- it is what made
      # the first version of this loop never settle while the check after it read clean.
      $delta = Compare-DirSnapshots -Before $d0 -After $d1
      if ($delta.Count -eq 0) { $settled = $true; break }
    }
    if (-not $settled) { $failures += 'SETUP: the synthetic tree never settled; the quiet direction cannot be judged.' }
    $f1 = Get-RetailSnapshot -Roots $roots

    # DIRECTION B (quiet): nothing happens between two snapshots. Without this half, a
    # comparator that returned every directory every time would look like a working probe.
    Start-Sleep -Milliseconds 60
    $quiet = Compare-DirSnapshots -Before $d1 -After (Get-RetailDirSnapshot -Roots $roots)
    if ($quiet.Count -ne 0) {
      $failures += "QUIET direction: an untouched tree produced $($quiet.Count) touch(es): " +
      (($quiet | ForEach-Object { "$($_.change) $($_.path)" }) -join '; ')
    }
    else { Write-Host '  quiet direction OK: untouched tree -> 0 dir touches' }

    # DIRECTION A (fires): create-then-delete inside $sub. Afterwards the file set and every
    # file's bytes are exactly as before -- this is the shape that defeated the file oracle
    # in the real DQK/DOSBOX case -- so only the directory mtime can report it.
    Start-Sleep -Milliseconds 40
    $transient = Join-Path $sub 'CCFP.MOV'
    Set-Content -Path $transient -Value 'transient' -Encoding ASCII
    Remove-Item -LiteralPath $transient -Force
    $d2 = Get-RetailDirSnapshot -Roots $roots
    $f2 = Get-RetailSnapshot -Roots $roots

    $fileDiff = Compare-FileSnapshots -Before $f1 -After $f2
    if ($fileDiff.Count -ne 0) {
      $failures += "FIRE direction: the FILE oracle saw $($fileDiff.Count) change(s), so this " +
      'case does not isolate what it claims to isolate (a write no file oracle can see).'
    }
    else { Write-Host '  fire direction: file oracle correctly saw nothing (0 file changes)' }

    $fired = Compare-DirSnapshots -Before $d1 -After $d2
    $hit = @($fired | Where-Object { $_.path -eq 'synthetic-retail/DOSBOX' -and $_.change -eq 'dir-mtime-moved' })
    if ($hit.Count -ne 1) {
      $failures += "FIRE direction: expected exactly one 'dir-mtime-moved' on " +
      "synthetic-retail/DOSBOX, got $($hit.Count) (total touches: $($fired.Count))."
    }
    else {
      Write-Host ("  fire direction OK: dir probe reported {0} on {1} ({2} -> {3})" -f `
          $hit[0].change, $hit[0].path, $hit[0].before_ticks, $hit[0].after_ticks)
    }
    # And the control on the CONTROL: the root itself must NOT be reported, because nothing
    # was created or deleted directly in it. A probe that flags every ancestor is noise.
    if (@($fired | Where-Object { $_.path -eq 'synthetic-retail' }).Count -ne 0) {
      $failures += 'FIRE direction: the probe also flagged the untouched root, so it does not localise.'
    }
  }
  finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($failures.Count -gt 0) {
    foreach ($f in $failures) { Write-Host "SELFTEST FAIL: $f" }
    Write-Host 'RESULT: dir-probe self-test FAIL'
    return 1
  }
  Write-Host 'RESULT: dir-probe self-test PASS (fires on a dir-only touch, quiet on an untouched tree)'
  return 0
}

if ($SelfTestDirProbe) { exit (Invoke-DirProbeSelfTest) }

# ---------------------------------------------------------------------------
# 4. Per-script execution. One child process each, so a throw cannot abort the
#    sweep, and $LASTEXITCODE is actually read.
# ---------------------------------------------------------------------------
function Invoke-FlowScript {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][bool]$Headless
  )

  $path = Join-Path $native $Name
  if (-not (Test-Path $path)) {
    return [ordered]@{
      status              = 'FAIL'
      exit_code           = $null
      needle              = "flow script absent from disk: native/$Name"
      needle_source       = 'runner'
      classification_rule = 'script-missing'
      duration_s          = 0.0
      stdout_tail         = ''
      stderr_tail         = ''
    }
  }

  # Does it take -Headless? test.ps1 asks the same question the same way.
  $tokens = $null; $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
  $hasHeadless = $false
  if ($parseErrors.Count -eq 0 -and $ast.ParamBlock) {
    foreach ($p in $ast.ParamBlock.Parameters) {
      if ($p.Name.VariablePath.UserPath -eq 'Headless') { $hasHeadless = $true; break }
    }
  }

  $stem = [IO.Path]::GetFileNameWithoutExtension($Name)
  $outFile = Join-Path $logDir "$stem.out.txt"
  $errFile = Join-Path $logDir "$stem.err.txt"
  foreach ($f in @($outFile, $errFile)) { if (Test-Path $f) { Remove-Item $f -Force } }

  # The child is wrapped so a `throw` yields ONE clean line we can quote verbatim,
  # instead of pwsh's ConciseView multi-line rendering with its caret art.
  $argExpr = if ($hasHeadless) { " -Headless:`$$($Headless.ToString().ToLowerInvariant())" } else { '' }
  $bootstrap = @"
`$ErrorActionPreference = 'Stop'
try {
  & '$($path.Replace("'", "''"))'$argExpr
  `$code = 0
  if (`$null -ne `$LASTEXITCODE) { `$code = `$LASTEXITCODE }
  exit `$code
} catch {
  [Console]::Error.WriteLine('GBFLOW-NEEDLE: ' + `$_.Exception.Message)
  exit 1
}
"@
  $bootFile = Join-Path $logDir "$stem.boot.ps1"
  Set-Content -Path $bootFile -Value $bootstrap -Encoding UTF8

  $sw = [Diagnostics.Stopwatch]::StartNew()
  # Do not use Start-Process here. Windows PowerShell 5.1 returns a Process
  # whose ExitCode is $null after redirected output, even after WaitForExit
  # reports success. Let cmd own the file redirections and use ProcessStartInfo
  # only for its exit status; this preserves the child's actual zero/nonzero
  # result under both installed PowerShell hosts.
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $pwshPath = (Get-Command pwsh -CommandType Application -ErrorAction Stop).Source
  $psi.FileName = $env:ComSpec
  $psi.Arguments = ('/d /s /c ""{0}" -NoProfile -NonInteractive -File "{1}" 1>"{2}" 2>"{3}""' -f `
    $pwshPath, $bootFile, $outFile, $errFile)
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = [Diagnostics.Process]::new()
  $proc.StartInfo = $psi
  if (-not $proc.Start()) { throw "could not start child PowerShell for $Name" }
  $timedOut = $false
  if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
    $timedOut = $true
    try { taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null } catch { }
    try { $proc.WaitForExit(15000) | Out-Null } catch { }
  }
  $sw.Stop()
  $exit = if ($timedOut) { $null } else { $proc.ExitCode }
  $stdout = if (Test-Path $outFile) { Get-Content -Path $outFile -Raw -ErrorAction SilentlyContinue } else { '' }
  $stderr = if (Test-Path $errFile) { Get-Content -Path $errFile -Raw -ErrorAction SilentlyContinue } else { '' }
  if ($null -eq $stdout) { $stdout = '' }
  if ($null -eq $stderr) { $stderr = '' }

  # ---- classification. Every branch assigns a status; UNCLASSIFIED is unreachable. ----
  $status = $null; $needle = ''; $needleSource = ''; $rule = ''

  if ($timedOut) {
    $status = 'FAIL'; $rule = 'timeout'
    $needle = "TIMEOUT: no exit after $TimeoutSeconds s"
    $needleSource = 'runner'
  }
  else {
    $skipLine = ($stdout -split "`r?`n" | Where-Object { $_ -match '^\s*SKIP\s*:' } | Select-Object -First 1)
    $passLine = ($stdout -split "`r?`n" | Where-Object { $_ -match 'RESULT:.*\bPASS\b' } | Select-Object -First 1)
    if ($exit -eq 0 -and $skipLine) {
      $status = 'SKIP'; $rule = 'exit0-skip-line'
      $needle = $skipLine.Trim(); $needleSource = 'stdout'
    }
    elseif ($exit -eq 0 -and $passLine) {
      $status = 'PASS'; $rule = 'exit0-result-pass'
      $needle = ''; $needleSource = ''
    }
    elseif ($exit -eq 0) {
      # test.ps1's blind spot, made visible: exited clean with no verdict line.
      $status = 'FAIL'; $rule = 'zero-exit-without-verdict'
      $last = ($stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
      $needle = "exit 0 but no 'RESULT: ... PASS' and no 'SKIP:' line; last stdout line: " +
      $(if ($last) { $last.Trim() } else { '(no stdout)' })
      $needleSource = 'runner'
    }
    else {
      $status = 'FAIL'
      $n = ($stderr -split "`r?`n" | Where-Object { $_ -match '^GBFLOW-NEEDLE: ' } | Select-Object -First 1)
      if ($n) {
        $rule = 'nonzero-exit-with-throw'
        $needle = $n.Substring('GBFLOW-NEEDLE: '.Length).Trim()
        $needleSource = 'throw'
      }
      else {
        $rule = 'nonzero-exit-no-throw'
        $lastErr = ($stderr -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
        if ($lastErr) {
          $needle = $lastErr.Trim(); $needleSource = 'stderr'
        }
        else {
          $lastOut = ($stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
          $needle = "exit $exit with no throw message; last stdout line: " +
          $(if ($lastOut) { $lastOut.Trim() } else { '(no stdout)' })
          $needleSource = 'runner'
        }
      }
    }
  }

  $tail = {
    param($text, $n)
    $lines = @($text -split "`r?`n" | Where-Object { $_.Trim() })
    if ($lines.Count -gt $n) { $lines = $lines[($lines.Count - $n)..($lines.Count - 1)] }
    return ($lines -join "`n")
  }

  if (-not $KeepLogs) {
    foreach ($f in @($outFile, $errFile, $bootFile)) {
      if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
    }
  }

  return [ordered]@{
    status              = $status
    exit_code           = $exit
    needle              = $needle
    needle_source       = $needleSource
    classification_rule = $rule
    duration_s          = [math]::Round($sw.Elapsed.TotalSeconds, 2)
    stdout_tail         = (& $tail $stdout 6)
    stderr_tail         = (& $tail $stderr 6)
  }
}

function Invoke-ExitCaptureSelfTest {
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  $name = '__flow-exit-capture-probe.ps1'
  $path = Join-Path $native $name
  try {
    Set-Content -Path $path -Encoding UTF8 -Value @'
Write-Output 'RESULT: synthetic flow PASS'
exit 0
'@
    $pass = Invoke-FlowScript -Name $name -Headless $true
    if ($pass.status -ne 'PASS' -or $pass.exit_code -ne 0) {
      throw "exit-0 child classified $($pass.status), exit=$($pass.exit_code)"
    }
    Set-Content -Path $path -Encoding UTF8 -Value @'
Write-Output 'synthetic controlled failure'
exit 7
'@
    $fail = Invoke-FlowScript -Name $name -Headless $true
    if ($fail.status -ne 'FAIL' -or $fail.exit_code -ne 7) {
      throw "exit-7 child classified $($fail.status), exit=$($fail.exit_code)"
    }
  }
  finally {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  }
  return 0
}

if ($SelfTestExitCapture) {
  $selfTestExit = Invoke-ExitCaptureSelfTest
  Write-Output 'RESULT: flow runner exit-capture self-test PASS'
  exit $selfTestExit
}


# ---------------------------------------------------------------------------
# 4b. NEVER-GREEN EVIDENCE.
#
# "Red today" and "has never passed" are different claims and the second is strictly
# stronger, so the schema carries it separately (history.ever_green) and this table is the
# only place a false value can enter. A single sweep CANNOT observe never-greenness -- it is
# a claim about the past -- so every entry below records its `evidence_kind` and its
# `source`, and nothing here is presented as a measurement made by this runner.
#
# MEASURED HERE (by git, in this script): every one of these files has exactly one commit,
# 23ba497 of 2026-07-15, and has never been edited since. That is consistent with
# never-green; it does not prove it.
#
# RESOLVED 2026-09-05 BY DIRECT READ OF BOTH SCRIPTS (round 36 coordinator), not by any
# sweep. CLAUDE.md's "STATED GAP" was right and native/README.md:571-585 was wrong: the
# 52-day never-green finding belongs to gbdqk-multistep-flow-test.ps1.
#   * native/gbdqk-multistep-flow-test.ps1:203-212 says so in its own comment ("This test
#     shipped in 23ba497 pinning v1 and has therefore never passed; the pin was wrong on
#     the day it was written, not stale"), and :214-218 is the GBPS assertion the README
#     block describes -- count word at offset 8 == 6.
#   * native/gbdqk-create-test.ps1:157-162 is a DIFFERENT assertion: it fails only on
#     version -lt 2 (so it never demanded version 1) and pins the count word to 4, not 6,
#     because that script creates four members. It cannot be the script that "requires the
#     GBPS seed header's version word to equal 1".
# The misattribution is systematic, not a one-off: all three round-36 status blocks in
# README.md:536-585 are attached one paragraph too early (540-549 is playable's, 567-569 is
# create's, 577-585 is multistep's), and both misplaced blocks say "the description below",
# which a note following its own description cannot mean.
$neverGreenEvidence = @{
  'gbdqk-multistep-flow-test.ps1'  = [ordered]@{
    ever_green        = $false
    never_green_since = '2026-07-15'
    evidence_kind     = 'resolved-by-direct-read'
    evidence          = 'Committed already-red in 23ba497 on 2026-07-15 and red 52 days later. The script pins a GBPS seed version word of 1 and a count word of 6 (native/gbdqk-multistep-flow-test.ps1:214-218) while the engine emits version 2 -- and the version-2 select path was already present in gbboot.asm at 23ba497, the commit that added the test, so the pin was wrong on the day it was written.'
    source            = 'CLAUDE.md "STATED GAP (2026-09-05)"; confirmed by reading native/gbdqk-multistep-flow-test.ps1:203-212 and :214-218 against native/gbdqk-create-test.ps1:157-162'
    disputed          = $false
    superseded_attribution = 'native/README.md:571-585 attached this same 52-day never-passed finding to gbdqk-create-test.ps1. That is wrong: create fails only on version -lt 2 and pins count 4, so it never demanded version 1. Both files landed in commit 23ba497 on 2026-07-15 with exactly one commit each.'
  }
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
$flowScripts = Get-FlowScriptList (Join-Path $native 'test.ps1') $rosterVar
Write-Output "run-flow-suite: $($flowScripts.Count) scripts from native/test.ps1 `$$rosterVar"

$requiredDosbox = if ($env:GOLDBOX_DOSBOX_EXE) {
  $env:GOLDBOX_DOSBOX_EXE
} else {
  Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
}
# The `$scripts roster mixes DOSBox and non-DOSBox scripts; each script carries its own
# prerequisite verdict (SKIP:/throw), so the blanket capability failure is flow-only.
$dosboxUnavailable = ($Roster -eq 'flow') -and -not (Test-Path -LiteralPath $requiredDosbox -PathType Leaf)

# Carry `history` forward -- a sweep cannot observe the past.
$priorHistory = @{}
if (Test-Path $Out) {
  try {
    $prior = Get-Content $Out -Raw | ConvertFrom-Json
    foreach ($s in $prior.scripts) {
      if ($s.PSObject.Properties.Name -contains 'history' -and $s.history) {
        $priorHistory[$s.name] = $s.history
      }
    }
  }
  catch { Write-Warning "could not read prior artifact $Out : $_" }
}

$headless = -not $Visible
$oldHeadless = $env:GOLDBOX_DOSBOX_HEADLESS
if ($headless) { $env:GOLDBOX_DOSBOX_HEADLESS = '1' }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$before = @{}
$results = [ordered]@{}
$srcHashAtRun = @{}
$srcHashStart = $null
$capabilityFailure = $null
$startedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

try {
  if ($NoRun) {
    foreach ($name in $flowScripts) {
      $results[$name] = [ordered]@{
        status              = 'UNMEASURED'
        exit_code           = $null
        needle              = 'not measured: -NoRun placeholder'
        needle_source       = 'runner'
        classification_rule = 'no-run-placeholder'
        duration_s          = 0.0
        stdout_tail         = ''
        stderr_tail         = ''
      }
    }
  }
  elseif ($dosboxUnavailable) {
    $capabilityFailure = "required DOSBox executable is unavailable: $requiredDosbox"
    Write-Warning "run-flow-suite: $capabilityFailure"
    foreach ($name in $flowScripts) {
      if ($Only -and $name -ne $Only) { continue }
      $results[$name] = [ordered]@{
        status              = 'FAIL'
        exit_code           = $null
        needle              = $capabilityFailure
        needle_source       = 'runner'
        classification_rule = 'required-dosbox-unavailable'
        duration_s          = 0.0
        stdout_tail         = ''
        stderr_tail         = ''
      }
    }
  }
  else {
    $before = Get-RetailSnapshot
    $beforeDirs = Get-RetailDirSnapshot
    $srcHashStart = Get-NativeSrcContentHash
    $i = 0
    foreach ($name in $flowScripts) {
      $i++
      if ($Only -and $name -ne $Only) { continue }
      Write-Output ("[{0,2}/{1}] {2}" -f $i, $flowScripts.Count, $name)
      $srcHashAtRun[$name] = Get-NativeSrcContentHash
      $r = Invoke-FlowScript -Name $name -Headless $headless
      Write-Output ("        -> {0} exit={1} {2}s {3}" -f $r.status, $r.exit_code, $r.duration_s, $r.needle)
      $results[$name] = $r
    }
  }
}
finally {
  $env:GOLDBOX_DOSBOX_HEADLESS = $oldHeadless
}

# Retail-folder leak detection (report only), on BOTH oracles.
#
# $null, not @(), when the probe did not run. An empty array is a measurement -- "I looked
# at every file and directory under the three retail folders and nothing changed" -- and
# emitting one for a run that never looked would be inventing a status. The reason string is
# carried beside it, exactly like `placeholder_reason` does for `measured=false`, and
# tools/test_native_flow_status.py fails the measured contract on either null.
$retailWrites = $null
$retailDirTouches = $null
$retailProbeReason = $null
if ($capabilityFailure) {
  $retailProbeReason = "$capabilityFailure; no flow script was executed, so the retail folders were not probed. null is an absence, not a measured zero."
}
elseif (-not $NoRun -and -not $Only) {
  $retailWrites = Compare-FileSnapshots -Before $before -After (Get-RetailSnapshot)
  $retailDirTouches = Compare-DirSnapshots -Before $beforeDirs -After (Get-RetailDirSnapshot)
}
elseif ($NoRun) {
  $retailProbeReason = '-NoRun: no flow script was executed, so the retail folders were never probed. null is an absence, not a measured zero.'
}
else {
  $retailProbeReason = "-Only ${Only}: one script's footprint cannot stand for the sweep's, so the before/after diff was not taken. null is an absence, not a measured zero."
}

# Assemble.
$scripts = @()
foreach ($name in $flowScripts) {
  $r = if ($results.Contains($name)) { $results[$name] } else {
    [ordered]@{
      status = 'UNMEASURED'; exit_code = $null
      needle = 'not measured: -Only sweep did not include this script'
      needle_source = 'runner'; classification_rule = 'only-filter-skipped'
      duration_s = 0.0; stdout_tail = ''; stderr_tail = ''
    }
  }
  $hist = if ($neverGreenEvidence.ContainsKey($name)) { $neverGreenEvidence[$name] }
  elseif ($priorHistory.ContainsKey($name)) { $priorHistory[$name] }
  else {
    [ordered]@{
      ever_green = $null; never_green_since = $null
      evidence_kind = 'unmeasured'
      evidence = 'no evidence either way; null means UNKNOWN, not "green once"'
      source = 'none'
    }
  }
  # A PASS is DIRECT evidence of green, and it outranks any cited claim about the past.
  # If a script the evidence table calls never-green is observed passing, the claim has
  # just expired -- record that it did, with the prior claim kept beside it, rather than
  # letting the artifact keep asserting a falsified "has never passed".
  if ($r.status -eq 'PASS') {
    $promoted = [ordered]@{
      ever_green           = $true
      first_observed_green = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
      evidence_kind        = 'measured'
      evidence             = 'this runner observed the script exit 0 with a RESULT: ... PASS line'
      source               = 'native/run-flow-suite.ps1'
    }
    if ($hist -and $hist.ever_green -eq $false) {
      $promoted['previously_claimed_never_green_since'] = $hist.never_green_since
      $promoted['superseded_claim_source'] = $hist.source
      $promoted['note'] = 'A never-green claim ENDED on this run; the cited claim above described the past, not the present.'
    }
    $hist = $promoted
  }
  $scriptPath = Join-Path $native $name
  $entry = [ordered]@{ name = $name }
  foreach ($k in $r.Keys) { $entry[$k] = $r[$k] }
  # Per-script provenance. The suite-wide hash is not enough when the sweep takes minutes
  # and another agent may be editing native/src or the scripts underneath it: this records
  # which BYTES of this script, and which native/src, produced this needle.
  $entry['script_sha256'] = if (Test-Path $scriptPath) {
    (Get-FileHash -Path $scriptPath -Algorithm SHA256).Hash.ToLowerInvariant()
  } else { $null }
  $logAll = (Invoke-Git @('log', '--format=%H', '--', "native/$name"))
  $entry['script_commit_count'] = if ($logAll) { @($logAll -split "`n" | Where-Object { $_ }).Count } else { 0 }
  $logFirst = (Invoke-Git @('log', '--reverse', '--format=%h %ad', '--date=short', '--', "native/$name"))
  $entry['script_first_commit'] = if ($logFirst) { @($logFirst -split "`n" | Where-Object { $_ })[0] } else { $null }
  $entry['script_dirty'] = [bool](Invoke-Git @('status', '--porcelain', '--', "native/$name"))
  $entry['native_src_content_hash_at_run'] = if ($srcHashAtRun.ContainsKey($name)) { $srcHashAtRun[$name] } else { $null }
  $entry['history'] = $hist
  $scripts += $entry
}

$counts = [ordered]@{
  total        = $scripts.Count
  pass         = @($scripts | Where-Object { $_.status -eq 'PASS' }).Count
  fail         = @($scripts | Where-Object { $_.status -eq 'FAIL' }).Count
  skip         = @($scripts | Where-Object { $_.status -eq 'SKIP' }).Count
  unclassified = @($scripts | Where-Object { $_.status -notin @('PASS', 'FAIL', 'SKIP') }).Count
}

$doc = [ordered]@{
  schema                 = $SCHEMA
  generator              = 'native/run-flow-suite.ps1'
  measured               = (-not $NoRun)
  measured_partial       = [bool]$Only
  placeholder_reason     = $(if ($NoRun) { '-NoRun: artifact emitted without executing any flow script' } else { $null })
  run_started_utc        = $startedAt
  run_finished_utc       = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  run_date               = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  host                   = $env:COMPUTERNAME
  headless               = $headless
  # Requested Start-DosBoxSmoke policy; GameLink uses its separate launcher.
  dosbox_smoke_priority_policy = $(if (-not $env:GOLDBOX_DOSBOX_PRIORITY -or $env:GOLDBOX_DOSBOX_PRIORITY -ieq 'BelowNormal') { 'BelowNormal' } elseif ($env:GOLDBOX_DOSBOX_PRIORITY -ieq 'Normal') { 'Normal' } else { $env:GOLDBOX_DOSBOX_PRIORITY })
  roster                 = $Roster
  source_of_script_list  = "native/test.ps1 `$$rosterVar (AST-parsed, never duplicated)"
  repo_head              = (Invoke-Git @('rev-parse', 'HEAD'))
  native_src_tree_hash   = (Invoke-Git @('rev-parse', 'HEAD:native/src'))
  native_src_commit      = (Invoke-Git @('log', '-1', '--format=%H', '--', 'native/src'))
  native_src_commit_date = (Invoke-Git @('log', '-1', '--format=%ad', '--date=short', '--', 'native/src'))
  native_src_dirty       = [bool](Invoke-Git @('status', '--porcelain', '--', 'native/src'))
  native_src_content_hash = (Get-NativeSrcContentHash)
  native_src_content_hash_start = $(if ($NoRun -or $capabilityFailure) { $null } else { $srcHashStart })
  native_src_changed_during_sweep = $(if ($NoRun -or $capabilityFailure) { $false } else { $srcHashStart -ne (Get-NativeSrcContentHash) })
  retail_folder_writes   = $retailWrites
  retail_dir_touches     = $retailDirTouches
  retail_probe_reason    = $retailProbeReason
  counts                 = $counts
  scripts                = $scripts
}

$json = $doc | ConvertTo-Json -Depth 12
Set-Content -Path $Out -Value $json -Encoding UTF8
Write-Output ''
Write-Output ("wrote {0}" -f $Out)
Write-Output ("counts: total={0} pass={1} fail={2} skip={3} unclassified={4}" -f `
    $counts.total, $counts.pass, $counts.fail, $counts.skip, $counts.unclassified)
if ($null -eq $retailWrites) {
  Write-Output "retail probe: NOT COLLECTED -- $retailProbeReason"
}
else {
  if ($retailWrites.Count -gt 0) {
    Write-Output "WARNING: $($retailWrites.Count) retail-folder file change(s) observed during the sweep:"
    foreach ($w in $retailWrites) { Write-Output "  $($w.change): $($w.path)" }
  }
  if ($retailDirTouches.Count -gt 0) {
    # Not necessarily OUR write: the retail DOSBox.exe moves its own DOSBOX/ directory mtime
    # when run bare. Reported, not diagnosed -- the artifact records what moved.
    Write-Output "NOTE: $($retailDirTouches.Count) retail DIRECTORY mtime change(s) with no file change to match:"
    foreach ($d in $retailDirTouches) { Write-Output "  $($d.change): $($d.path)" }
  }
  if ($retailWrites.Count -eq 0 -and $retailDirTouches.Count -eq 0) {
    Write-Output 'retail probe: 0 file changes, 0 directory touches (measured, both oracles)'
  }
}
# The runner's own exit status reports whether it PRODUCED an artifact, not whether the
# suite is green -- the gate on greenness is tools/test_native_flow_status.py. Exiting
# non-zero here would make "the sweep ran" indistinguishable from "the sweep found reds".
exit 0
