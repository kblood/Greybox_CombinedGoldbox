# ccecl-dok-b51-state-scan.ps1 -- focused DoK ECL2 block-51 host-state audit.
#
# The broad route scan proves no unseeded natural route reaches the known block-51
# tactical handoff in the local data. This focused probe keeps that gap concrete:
# it varies only the small host-owned state cells seen in the static audit and
# records which combinations actually turn vmRun1 descriptor 29 into a queued
# COMBAT yield.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$gameMount = if (Test-Path -LiteralPath $game -PathType Container) { New-RetailStage -Source $game } else { $game }
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_DOKB51STATE.TXT'
$csvPath = Join-Path $build '_DOKB51STATE.CSV'

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($name in @('ECL2.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: DoK block-51 state scan ($name absent)"
    exit 0
  }
}

function New-Seed([int]$Addr, [int]$Value) {
  return [pscustomobject]@{ Addr = $Addr; Value = $Value }
}

$cases = @(
  @{ Label = 'base-d29'; Cell = 29; Seeds = @() },
  @{ Label = 'd28-4ce9'; Cell = 28; Seeds = @((New-Seed 19689 1)) },
  @{ Label = 'd29-4c00'; Cell = 29; Seeds = @((New-Seed 19456 1)) },
  @{ Label = 'd29-4ce5'; Cell = 29; Seeds = @((New-Seed 19685 1)) },
  @{ Label = 'd29-4ce8-1'; Cell = 29; Seeds = @((New-Seed 19688 1)) },
  @{ Label = 'd29-4ce8-16'; Cell = 29; Seeds = @((New-Seed 19688 16)) },
  @{ Label = 'd29-4ce9'; Cell = 29; Seeds = @((New-Seed 19689 1)) },
  @{ Label = 'd29-4ce9-4ce8'; Cell = 29; Seeds = @((New-Seed 19689 1), (New-Seed 19688 16)) },
  @{ Label = 'd29-4ce9-4ce5'; Cell = 29; Seeds = @((New-Seed 19689 1), (New-Seed 19685 1)) }
)

function Get-MemValue([byte[]]$Bytes, [int]$Key) {
  if ($Bytes.Length -lt 2246 -or [Text.Encoding]::ASCII.GetString($Bytes, 116, 4) -ne 'GBRS') {
    return $null
  }
  $count = [BitConverter]::ToUInt16($Bytes, 196)
  for ($i = 0; $i -lt $count -and $i -lt 512; $i++) {
    $k = [BitConverter]::ToUInt16($Bytes, 198 + ($i * 2))
    if ($k -eq $Key) {
      return [BitConverter]::ToUInt16($Bytes, 1222 + ($i * 2))
    }
  }
  return $null
}

function Format-Seeds($Seeds) {
  if (-not $Seeds -or $Seeds.Count -eq 0) { return '' }
  return (($Seeds | ForEach-Object { '{0:X4}={1:X4}' -f $_.Addr, $_.Value }) -join ';')
}

Remove-Item (Join-Path $build 'B51S*.BIN'),
  (Join-Path $build 'B51S*.TRC'),
  (Join-Path $build 'B51S.BAT') -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'B51S.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
for ($i = 0; $i -lt $cases.Count; $i++) {
  $case = $cases[$i]
  $stem = ('B51S{0:D2}' -f $i)
  $seedArgs = (($case.Seeds | ForEach-Object { '/X {0} {1}' -f $_.Addr, $_.Value }) -join ' ')
  $cmd = "C:\CCECL D:\ECL2.DAX 51 /E C:\$stem.BIN /Q $($case.Cell) /F 0 /N 6 /H 1 /Z 240 /D 4"
  if ($seedArgs.Length -gt 0) { $cmd = "$cmd $seedArgs" }
  $cmd = "$cmd /T > NUL"
  $lines.Add($cmd)
  $lines.Add("REN C:\CCECL.TRC $stem.TRC")
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_dok_b51_state_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\B51S.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 25000'
try {
  if (-not $p.WaitForExit(120000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'DoK block-51 state scan timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

$rows = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $cases.Count; $i++) {
  $case = $cases[$i]
  $path = Join-Path $build ('B51S{0:D2}.BIN' -f $i)
  if (-not (Test-Path $path)) {
    $rows.Add([pscustomobject]@{
      Label = $case.Label; Cell = $case.Cell; Seeds = (Format-Seeds $case.Seeds)
      Status = 'MISSING'; Flags = ''; Enc = ''; Pc = ''; Mon = ''; Count = ''; Pic = ''
      Mem4CE9 = ''; Mem4CE8 = ''; Mem4CE5 = ''
    })
    continue
  }
  $b = [IO.File]::ReadAllBytes($path)
  if ($b.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') {
    $rows.Add([pscustomobject]@{
      Label = $case.Label; Cell = $case.Cell; Seeds = (Format-Seeds $case.Seeds)
      Status = 'INVALID'; Flags = ''; Enc = ''; Pc = ''; Mon = ''; Count = ''; Pic = ''
      Mem4CE9 = ''; Mem4CE8 = ''; Mem4CE5 = ''
    })
    continue
  }
  $enc = [BitConverter]::ToUInt16($b, 32)
  $rows.Add([pscustomobject]@{
    Label = $case.Label
    Cell = $case.Cell
    Seeds = (Format-Seeds $case.Seeds)
    Status = ('{0:X4}' -f [BitConverter]::ToUInt16($b, 8))
    Flags = ('{0:X4}' -f [BitConverter]::ToUInt16($b, 6))
    Enc = $enc
    Pc = ('{0:X4}' -f [BitConverter]::ToUInt16($b, 124))
    Mon = if ($enc -gt 0) { '{0:X4}' -f [BitConverter]::ToUInt16($b, 34) } else { '' }
    Count = if ($enc -gt 0) { '{0:X4}' -f [BitConverter]::ToUInt16($b, 36) } else { '' }
    Pic = if ($enc -gt 0) { '{0:X4}' -f [BitConverter]::ToUInt16($b, 38) } else { '' }
    Mem4CE9 = $( $v = Get-MemValue $b 0x4ce9; if ($null -eq $v) { '' } else { '{0:X4}' -f $v } )
    Mem4CE8 = $( $v = Get-MemValue $b 0x4ce8; if ($null -eq $v) { '' } else { '{0:X4}' -f $v } )
    Mem4CE5 = $( $v = Get-MemValue $b 0x4ce5; if ($null -eq $v) { '' } else { '{0:X4}' -f $v } )
  })
}

$queued = @($rows | Where-Object { $_.Status -eq '0003' -and $_.Enc -gt 0 })
$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK ECL2 block-51 vmRun1 host-state matrix')
$summary.Add("Cases=$($rows.Count)")
$summary.Add("QueuedCombat=$($queued.Count)")
foreach ($row in $rows) {
  $summary.Add(("{0}: cell={1} seeds={2} status={3} flags={4} enc={5} pc={6} mem4CE9={7} mem4CE8={8} mem4CE5={9}" -f $row.Label, $row.Cell, $row.Seeds, $row.Status, $row.Flags, $row.Enc, $row.Pc, $row.Mem4CE9, $row.Mem4CE8, $row.Mem4CE5))
}
$summary.Add('Result=Only descriptor 29 with host-state 4CE9=1 is expected to yield the known queued tactical handoff in this matrix')
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)
$rows | ConvertTo-Csv -NoTypeInformation | Set-Content -Path $csvPath -Encoding ASCII

$base = $rows | Where-Object { $_.Label -eq 'base-d29' } | Select-Object -First 1
$gate = $rows | Where-Object { $_.Label -eq 'd29-4ce9' } | Select-Object -First 1
$wrongDescriptor = $rows | Where-Object { $_.Label -eq 'd28-4ce9' } | Select-Object -First 1
if ($base.Status -eq '0003' -and $base.Enc -gt 0) {
  throw 'DoK block-51 base descriptor 29 unexpectedly yielded queued tactical combat without host state'
}
if (-not ($gate.Status -eq '0003' -and $gate.Enc -eq 2 -and $gate.Mem4CE9 -eq '0001')) {
  throw 'DoK block-51 4CE9 gate no longer yields the known two-group tactical handoff'
}
if ($wrongDescriptor.Status -eq '0003' -and $wrongDescriptor.Enc -gt 0) {
  throw 'DoK block-51 descriptor 28 unexpectedly reached the descriptor-29 tactical handoff'
}

Write-Output '[B51] DoK block-51 host-state matrix:'
$rows | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
Write-Output 'RESULT: DoK block-51 host-state matrix PASS'
