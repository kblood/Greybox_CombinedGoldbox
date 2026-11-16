# trace_gateway_operand_parser_execution.ps1 — test whether Gateway's confirmed VROOMM
# destination segment 1B37 (see docs/engine/research/gateway-descriptor9-runtime-bytematch.md)
# is ever actually EXECUTED (CS:IP fetch, not just data-copied into) during ordinary silent
# startup, with zero keypresses, AND whether the code resident there at any such stop is really
# the byte-matched operand parser (GAME.OVR+0x9471) rather than some other routine that happens
# to share the same shared physical overlay buffer.
#
# This targets BUILD-QUEUE.md line 474: "At the reached operand parser, derive Gateway's own
# DGROUP, archive/member selector, ECL cursor address, body far pointer, virtual-address
# conversion, and Area1 base." That requires the operand parser to actually RUN, not merely be
# resident. This script is the controlled, non-guessed-key experiment: arm an execution
# breakpoint at 1B37:0000 from process start, RUN with GameLink attached but NO synthetic
# keyboard input, and observe every stop within a bounded window/hit cap covering title/attract
# sequencing. It deliberately does NOT drive the front-end menu with guessed keys
# (docs/engine/HANDOFF.md explicitly warns: "Do not return to host input, inspect screenshots
# directly, or expand an unbounded guessed-key search" — written for Secret, applies equally here
# since Gateway has no save/route-ready stage to anchor a scripted key sequence).
#
# First run (2026-07-16, single-hit version): the breakpoint DID fire at 1B37:0000 after ~61s of
# silent polling, proving the segment is genuinely executed, not just data-copied into, during
# silent startup -- but the resident bytes at that stop did NOT match the retail operand parser
# (push bp; mov bp,sp; xor ax,ax; call far 0B67:04DF; ...), disproving the earlier assumption that
# any execution at 1B37:0000 is necessarily descriptor 9. This revision loops over every hit at
# that address (re-arming/continuing, never sending a key) so the natural sequence of whichever
# routines cycle through the shared buffer during silent startup can be observed and each
# byte-validated independently.

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(5,600)][int]$SilentWindowSeconds = 90,
  [ValidateRange(1,200)][int]$MaxHits = 40,
  [ValidateRange(30,1200)][int]$GlobalTimeoutSeconds = 240
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$ExecutionBreakpoint = '1B37:0000'
$TargetFileOffset = 0x9471   # GAME.OVR descriptor 9 (operand_parser), file offset of the same
                              # role byte-matched at runtime segment 1B37 in
                              # gateway-descriptor9-runtime-bytematch.md

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway execution probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null

function Invoke-DebuggerInput {
  param([string]$Command, [string]$Label, [switch]$SnapshotOnly)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed: $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper failed: $Label ($($status.Error))" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-DebuggerAddress {
  param([string]$Snapshot)
  $match = [regex]::Match($Snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $match.Success) { return $null }
  return '{0}:{1}' -f $match.Groups[1].Value, $match.Groups[2].Value.Substring(4)
}

function Get-DebuggerDataBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @("BP $ExecutionBreakpoint", 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Gateway DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  $globalDeadline = [DateTime]::UtcNow.AddSeconds($GlobalTimeoutSeconds)
  $deadline = [DateTime]::UtcNow.AddSeconds($SilentWindowSeconds)
  if ($deadline -gt $globalDeadline) { $deadline = $globalDeadline }
  $pollCount = 0
  $hits = @()
  $matchedHit = $null
  while ([DateTime]::UtcNow -lt $deadline -and [DateTime]::UtcNow -lt $globalDeadline -and $hits.Count -lt $MaxHits) {
    Start-Sleep -Milliseconds 500
    $pollCount++
    $snapshot = Invoke-DebuggerInput -Command '' -Label ('silent-poll-{0:D3}' -f $pollCount) -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if (-not $addr) { continue }
    if ($addr -ne $ExecutionBreakpoint) {
      # Some other breakpoint/exception stopped us; record and keep going rather than assume failure.
      $hits += [ordered]@{ index = $hits.Count; unexpected_address = $addr }
      Invoke-DebuggerInput -Command 'RUN' -Label ('continue-unexpected-{0:D3}' -f $hits.Count) | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($SilentWindowSeconds)
      if ($deadline -gt $globalDeadline) { $deadline = $globalDeadline }
      continue
    }
    [IO.File]::WriteAllText((Join-Path $out ('hit-{0:D3}-console.txt' -f $hits.Count)), $snapshot, [Text.UTF8Encoding]::new($false))
    $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
    $dumpSnapshot = Invoke-DebuggerInput -Command "D $ExecutionBreakpoint" -Label ('hit-{0:D3}-dump' -f $hits.Count)
    $bytes = Get-DebuggerDataBytes $dumpSnapshot
    $expectedBytes = $overlayBytes[$TargetFileOffset..($TargetFileOffset + $bytes.Count - 1)]
    $observedHex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $expectedHex = ($expectedBytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $isMatch = ($observedHex -eq $expectedHex)
    $hitRecord = [ordered]@{
      index = $hits.Count
      poll_count_at_hit = $pollCount
      cs_ip = $addr
      ds = if ($dsMatch.Success) { $dsMatch.Groups[1].Value } else { $null }
      observed_hex_prefix32 = $observedHex.Substring(0, [Math]::Min(64, $observedHex.Length))
      resident_bytes_match_retail_parser = $isMatch
    }
    $hits += $hitRecord
    Write-Host ("[gateway-exec-loop] hit {0}: cs_ip={1} ds={2} match={3}" -f $hitRecord.index, $addr, $hitRecord.ds, $isMatch)
    if ($isMatch) {
      $matchedHit = $hitRecord
      $matchedHit.observed_hex = $observedHex
      $matchedHit.expected_hex = $expectedHex
      break
    }
    # Not the operand parser this time -- continue past it (no key input) to see what else the
    # shared buffer carries during the rest of silent startup.
    Invoke-DebuggerInput -Command 'RUN' -Label ('continue-{0:D3}' -f $hits.Count) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($SilentWindowSeconds)
    if ($deadline -gt $globalDeadline) { $deadline = $globalDeadline }
  }

  $result = [ordered]@{
    schema_version = 1
    title = 'Gateway operand-parser silent-execution probe (looped)'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    execution_breakpoint = $ExecutionBreakpoint
    silent_window_seconds_per_stage = $SilentWindowSeconds
    global_timeout_seconds = $GlobalTimeoutSeconds
    max_hits = $MaxHits
    input_sent = $false
    hit_count = $hits.Count
    hits = $hits
    matched_retail_parser = [bool]$matchedHit
  }
  if ($matchedHit) {
    $result.claim = 'genuine CS:IP execution reached 1B37:0000 with zero keypresses during silent startup, and at hit index ' + $matchedHit.index + ' the resident bytes exactly matched the retail operand parser (GAME.OVR+0x9471).'
  } else {
    $result.claim = "execution reached $ExecutionBreakpoint $($hits.Count) time(s) with zero keypresses, and every observed occupant's resident bytes differed from the retail operand parser (GAME.OVR+0x9471). This proves segment 1B37 is a shared physical overlay buffer executed by many different routines during silent startup, not a buffer dedicated to descriptor 9; it does not prove descriptor 9 itself ever executes without further (non-key-input) evidence. The probe stopped because it exhausted its bounded hit cap or time window, not because it detected true idling."
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'gateway-operand-parser-execution-probe.json') -Encoding utf8
  Write-Host ("[gateway-exec-loop] RESULT: hit_count={0} matched={1} out={2}" -f $hits.Count, [bool]$matchedHit, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
