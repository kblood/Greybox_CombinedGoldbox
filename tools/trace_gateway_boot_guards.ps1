# trace_gateway_boot_guards.ps1 -- capture the real boot-time byte values at Gateway's ECL
# host-memory locations flagged by docs/engine/research/gateway-newgame-route.md's Hop 1
# ([0x7ED5], [0xC04D]) plus three further locations a static re-derivation
# (tools/simulate_gen1_ecl_path.py) found ALSO gate reachability once [0x7ED5] is nonzero
# ([0x4C20], [0x4C21], [0x4C22] -- the GOSUB-0x8665 flavor-text subroutine's own inner
# branch selector), during a genuine silent, zero-keypress, zero-save-file Gateway boot.
#
# Context: docs/engine/research/gateway-operand-parser-execution-probe.md already proved the
# ONLY execution stop reachable during silent startup with zero keypresses is 1B37:0000 (a
# per-frame title/input-wait helper, confirmed NOT the ECL operand parser, hit 30/30 times
# with STABLE DS=0CEB and an instruction `mov al,[8500]` -- an implicit-DS host-memory byte
# read at an address in the SAME numeric neighborhood as the ECL host addresses this script
# targets). Gateway's own DGROUP/ECL-host-memory-segment identity is not independently
# proven beyond that observation (gateway-descriptor9-runtime-bytematch.md explicitly flags
# 0CEB as "likely" DGROUP, "not proven yet"). This script does not attempt to resolve that
# further; it captures live memory at the SAME execution stop already proven silently
# reachable, using that stop's own live DS register (never a hardcoded assumption), and
# reports the DGROUP-identity caveat explicitly in its own JSON output.
#
# Method: identical BP 1B37:0000 polling loop as
# trace_gateway_operand_parser_execution.ps1 (proven to hit deterministically, ~30/30, with
# zero keypresses). At each hit, read the live DS register, then `D <DS>:<addr>` for each of
# the three target dump windows, decode the byte at the exact target offset from the printed
# hex, and continue (never a key). Captures multiple hits per run to check the values are
# stable over time (not a transient/racy read), and is meant to be invoked twice (two
# separate -OutDir runs) for the project's usual reproduction convention.

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(5,600)][int]$SilentWindowSeconds = 90,
  [ValidateRange(1,10)][int]$SamplesPerRun = 3,
  [ValidateRange(30,1200)][int]$GlobalTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$ExecutionBreakpoint = '1B37:0000'
# (target address, dump window start, byte offset within the 16-byte dump line)
$Targets = @(
  @{ name = '0x7ED5'; addr = 0x7ED5; dump_start = 0x7ED0; byte_offset = 0x05 },
  @{ name = '0xC04D'; addr = 0xC04D; dump_start = 0xC040; byte_offset = 0x0D },
  @{ name = '0x4C20'; addr = 0x4C20; dump_start = 0x4C18; byte_offset = 0x08 },
  @{ name = '0x4C21'; addr = 0x4C21; dump_start = 0x4C18; byte_offset = 0x09 },
  @{ name = '0x4C22'; addr = 0x4C22; dump_start = 0x4C18; byte_offset = 0x0A }
)

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway boot-guard probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}

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
  $samples = @()

  while ([DateTime]::UtcNow -lt $deadline -and [DateTime]::UtcNow -lt $globalDeadline -and $samples.Count -lt $SamplesPerRun) {
    Start-Sleep -Milliseconds 500
    $pollCount++
    $snapshot = Invoke-DebuggerInput -Command '' -Label ('poll-{0:D3}' -f $pollCount) -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if (-not $addr) { continue }
    if ($addr -ne $ExecutionBreakpoint) {
      Invoke-DebuggerInput -Command 'RUN' -Label ('continue-unexpected-{0:D3}' -f $samples.Count) | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($SilentWindowSeconds)
      if ($deadline -gt $globalDeadline) { $deadline = $globalDeadline }
      continue
    }
    $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
    if (-not $dsMatch.Success) { throw "hit at $ExecutionBreakpoint but no DS register in snapshot (sample $($samples.Count))" }
    $ds = $dsMatch.Groups[1].Value

    $readings = [ordered]@{}
    foreach ($target in $Targets) {
      $pointer = '{0}:{1:X4}' -f $ds, $target.dump_start
      $dumpSnapshot = Invoke-DebuggerInput -Command "D $pointer" -Label ('sample-{0:D2}-{1}-dump' -f $samples.Count, $target.name)
      $bytes = Get-DebuggerDataBytes $dumpSnapshot
      if ($bytes.Count -le $target.byte_offset) { throw "dump for $($target.name) returned only $($bytes.Count) bytes, need offset $($target.byte_offset)" }
      $value = $bytes[$target.byte_offset]
      $readings[$target.name] = [ordered]@{
        addr = $target.name
        dump_pointer = $pointer
        byte_offset_in_dump = $target.byte_offset
        value = $value
        value_hex = ('0x{0:X2}' -f $value)
      }
    }
    $sample = [ordered]@{
      index = $samples.Count
      poll_count_at_hit = $pollCount
      cs_ip = $addr
      ds = $ds
      readings = $readings
    }
    $samples += $sample
    Write-Host ("[gateway-boot-guards] sample {0}: ds={1} 7ED5={2} C04D={3} 4C20={4} 4C21={5} 4C22={6}" -f `
      $sample.index, $ds, $readings['0x7ED5'].value_hex, $readings['0xC04D'].value_hex, `
      $readings['0x4C20'].value_hex, $readings['0x4C21'].value_hex, $readings['0x4C22'].value_hex)

    if ($samples.Count -lt $SamplesPerRun) {
      Invoke-DebuggerInput -Command 'RUN' -Label ('continue-{0:D3}' -f $samples.Count) | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($SilentWindowSeconds)
      if ($deadline -gt $globalDeadline) { $deadline = $globalDeadline }
    }
  }

  $dsValues = @($samples | ForEach-Object { $_.ds } | Select-Object -Unique)
  $stableDs = $dsValues.Count -eq 1
  $stableAcrossSamples = $true
  if ($samples.Count -gt 1) {
    foreach ($target in $Targets) {
      $values = @($samples | ForEach-Object { $_.readings[$target.name].value } | Select-Object -Unique)
      if ($values.Count -gt 1) { $stableAcrossSamples = $false }
    }
  }

  $result = [ordered]@{
    schema_version = 1
    title = 'Gateway Hop 1 boot-time host-memory guard capture (silent startup)'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    execution_breakpoint = $ExecutionBreakpoint
    input_sent = $false
    sample_count = $samples.Count
    samples = $samples
    ds_values_observed = $dsValues
    ds_stable_across_samples = $stableDs
    readings_stable_across_samples = $stableAcrossSamples
    caveat = 'DS at this execution stop (a per-frame title/input-wait helper, NOT the ECL operand parser -- see gateway-operand-parser-execution-probe.md) is the best available candidate for Gateway''s shared ECL host-memory segment, corroborated by that routine''s own implicit-DS byte read at [0x8500] (same numeric neighborhood as the targets here), but is NOT independently proven to be the operand parser''s own DGROUP. Values here are read passively from live memory, not produced by executing the flagged ECL COMPARE instructions themselves.'
  }
  if ($samples.Count -gt 0) {
    $last = $samples[$samples.Count - 1]
    $result.final_readings = $last.readings
    $result.guard_7ed5_nonzero = ($last.readings['0x7ED5'].value -ne 0)
    $result.guard_c04d_equals_3 = ($last.readings['0xC04D'].value -eq 3)
    $result.guard_4c21_outside_0_1 = -not ($last.readings['0x4C21'].value -in @(0, 1))
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'gateway-boot-guards.json') -Encoding utf8
  Write-Host ("[gateway-boot-guards] RESULT: sample_count={0} ds_stable={1} readings_stable={2} out={3}" -f $samples.Count, $stableDs, $stableAcrossSamples, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
