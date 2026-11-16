# ccecl-buck-entry-scan.ps1 -- Buck Rogers ECL entrypoint combat probe.
#
# Optional discovery probe for the local Amiga/WHDLoad Buck Countdown data. The
# normal Buck smoke proves data-only detection, /R party creation, and raw GEO
# preview. This scan asks the next combat question: do any real ECL blocks yield
# queued tactical combat when entered through any of the five Gen1 far-pointer
# header entries with representative ENCOUNTER_MENU and distance host seeds?
param(
  [switch]$Headless,
  [string]$BuckPath = $env:GOLDBOX_BUCK_PATH,
  [int[]]$Choices = @(0, 1, 2, 3, 4),
  [int[]]$Distances = @(0, 4, 8, 12, 18)
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-buck-entry-scan'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_BUCKENTRY.TXT'
$csvPath = Join-Path $build '_BUCKENTRY.CSV'

if (-not $BuckPath) {
  $BuckPath = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\B\BuckRogersCountdownDday\data'
}

if (-not (Test-Path $BuckPath)) {
  Write-Output "SKIP: CCECL Buck entry scan ($BuckPath absent; set GOLDBOX_BUCK_PATH to run)"
  exit 0
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$required = @('ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX')
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $BuckPath $name))) {
    Write-Output "SKIP: CCECL Buck entry scan ($name absent under $BuckPath)"
    exit 0
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($name in $required) {
  Copy-Item (Join-Path $BuckPath $name) (Join-Path $run $name) -Force
}

function Expand-DaxRle([byte[]]$Comp, [int]$Expected) {
  $out = New-Object byte[] $Expected
  $i = 0
  $o = 0
  while ($i -lt $Comp.Length -and $o -lt $Expected) {
    $c = [int]$Comp[$i]
    $i++
    if ($c -lt 0x80) {
      $cnt = $c + 1
      for ($k = 0; $k -lt $cnt -and $i -lt $Comp.Length -and $o -lt $Expected; $k++) {
        $out[$o] = $Comp[$i]
        $o++; $i++
      }
    } else {
      $cnt = 256 - $c
      if ($i -lt $Comp.Length) {
        $v = $Comp[$i]
        $i++
        for ($k = 0; $k -lt $cnt -and $o -lt $Expected; $k++) {
          $out[$o] = $v
          $o++
        }
      }
    }
  }
  return $out
}

function Get-DaxBlocks([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 2) { throw "DAX file too short: $Path" }
  $tocBytes = [BitConverter]::ToUInt16($bytes, 0)
  if ($tocBytes -le 0 -or ($tocBytes % 9) -ne 0 -or $bytes.Length -lt (2 + $tocBytes)) {
    throw "DAX TOC has invalid length in $Path"
  }
  $base = 2 + $tocBytes
  $count = [int]($tocBytes / 9)
  $blocks = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $count; $i++) {
    $off = 2 + ($i * 9)
    $id = [int]$bytes[$off]
    $dataOff = [BitConverter]::ToUInt32($bytes, $off + 1)
    $rawSize = [BitConverter]::ToUInt16($bytes, $off + 5)
    $compSize = [BitConverter]::ToUInt16($bytes, $off + 7)
    $comp = New-Object byte[] $compSize
    [Array]::Copy($bytes, $base + [int]$dataOff, $comp, 0, $compSize)
    $blocks.Add([pscustomobject]@{
      Id = $id
      Raw = (Expand-DaxRle $comp $rawSize)
    })
  }
  return $blocks.ToArray()
}

function Get-Gen1EntryPoints([byte[]]$Raw) {
  if ($Raw.Length -lt 22) { return @() }
  $slots = @(
    @{ Name = 'vmRun1'; Offset = 4 },
    @{ Name = 'SearchLocation'; Offset = 8 },
    @{ Name = 'PreCampCheck'; Offset = 12 },
    @{ Name = 'CampInterrupted'; Offset = 16 },
    @{ Name = 'Initial'; Offset = 20 }
  )
  $out = New-Object System.Collections.Generic.List[object]
  foreach ($slot in $slots) {
    $vaddr = [BitConverter]::ToUInt16($Raw, $slot.Offset)
    if ($vaddr -ge 0x8014 -and ($vaddr - 0x7ffe) -lt $Raw.Length) {
      $out.Add([pscustomobject]@{ Name = $slot.Name; Vaddr = $vaddr })
    }
  }
  return $out.ToArray()
}

$blocks = New-Object System.Collections.Generic.List[object]
foreach ($area in 1..3) {
  $file = "ECL$area.DAX"
  foreach ($block in Get-DaxBlocks (Join-Path $run $file)) {
    foreach ($entry in Get-Gen1EntryPoints $block.Raw) {
      $blocks.Add([pscustomobject]@{
        File = $file
        Area = $area
        Block = $block.Id
        Entry = $entry.Name
        Vaddr = $entry.Vaddr
        Raw = $block.Raw
      })
    }
  }
}

if ($blocks.Count -eq 0) {
  throw 'Buck entry scan found no Gen1 far-pointer entries'
}

Remove-Item (Join-Path $build 'BKEN*.BIN'),
  (Join-Path $build 'BKEN.BAT'),
  $summaryPath,
  $csvPath -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'BKEN.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$map = New-Object System.Collections.Generic.List[object]
$lines.Add('@echo off')
$idx = 0
foreach ($block in $blocks) {
  foreach ($choice in $Choices) {
    foreach ($distance in $Distances) {
      $stem = ('BKEN{0:D4}' -f $idx)
      $vaddrHex = ('{0:X4}' -f $block.Vaddr)
      $lines.Add("C:\CCECL D:\$($block.File) $($block.Block) /@ $vaddrHex /E C:\$stem.BIN /N 5 /O $choice /D $distance > NUL")
      $map.Add([pscustomobject]@{
        Index = $idx
        File = $block.File
        Area = $block.Area
        Block = $block.Block
        Entry = $block.Entry
        Vaddr = $vaddrHex
        Choice = $choice
        Distance = $distance
      })
      $idx++
    }
  }
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_buck_entry_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$run"
C:
CALL C:\BKEN.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(180000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'CCECL Buck entry scan timed out'
}

$rows = New-Object System.Collections.Generic.List[object]
foreach ($item in $map) {
  $path = Join-Path $build ('BKEN{0:D4}.BIN' -f $item.Index)
  $status = 'missing'
  $flags = ''
  $groups = ''
  $pc = ''
  $haltReason = ''
  $haltPc = ''
  $haltOp = ''
  $haltBytes = ''
  $scriptCount = ''
  $scriptOps = ''
  if (Test-Path $path) {
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -ge 34 -and [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -eq 'GBEF') {
      $status = '{0:X4}' -f [BitConverter]::ToUInt16($bytes, 8)
      $flags = '{0:X4}' -f [BitConverter]::ToUInt16($bytes, 6)
      $pc = '{0:X4}' -f [BitConverter]::ToUInt16($bytes, 14)
      $groups = [BitConverter]::ToUInt16($bytes, 32)
      if ($bytes.Length -ge 2252 -and [Text.Encoding]::ASCII.GetString($bytes, 2246, 4) -eq 'GBSX') {
        $scriptCountValue = [BitConverter]::ToUInt16($bytes, 2250)
        $scriptCount = $scriptCountValue
        $ops = New-Object System.Collections.Generic.List[string]
        $maxEvents = [Math]::Min($scriptCountValue, 16)
        for ($eventIndex = 0; $eventIndex -lt $maxEvents; $eventIndex++) {
          $eventOff = 2252 + ($eventIndex * 20)
          if (($eventOff + 2) -le $bytes.Length) {
            $ops.Add(('{0:X2}' -f [BitConverter]::ToUInt16($bytes, $eventOff)))
          }
        }
        $scriptOps = ($ops.ToArray() -join ',')
      }
      $gbhd = [Text.Encoding]::ASCII.GetString($bytes, 3128, 4)
      if ($gbhd -eq 'GBHD') {
        $haltReason = '{0:X4}' -f [BitConverter]::ToUInt16($bytes, 3132)
        $haltPcValue = [BitConverter]::ToUInt16($bytes, 3134)
        $haltPc = '{0:X4}' -f $haltPcValue
        $haltOp = '{0:X2}' -f [BitConverter]::ToUInt16($bytes, 3136)
        $sourceBlock = $blocks | Where-Object {
          $_.File -eq $item.File -and $_.Block -eq [int]$item.Block -and $_.Entry -eq $item.Entry -and ('{0:X4}' -f $_.Vaddr) -eq $item.Vaddr
        } | Select-Object -First 1
        if ($sourceBlock) {
          $rawBlock = $sourceBlock.Raw
          $start = [Math]::Max(0, $haltPcValue - 4)
          $end = [Math]::Min($rawBlock.Length - 1, $haltPcValue + 11)
          if ($end -ge $start) {
            $haltBytes = (($rawBlock[$start..$end] | ForEach-Object { $_.ToString('X2') }) -join ' ')
          }
        }
      }
    } else {
      $status = 'bad'
    }
  }
  $rows.Add([pscustomobject]@{
    File = $item.File
    Area = $item.Area
    Block = $item.Block
    Entry = $item.Entry
    Vaddr = $item.Vaddr
    Choice = $item.Choice
    Distance = $item.Distance
    Status = $status
    Flags = $flags
    Groups = $groups
    Pc = $pc
    ScriptCount = $scriptCount
    ScriptOps = $scriptOps
    HaltReason = $haltReason
    HaltPc = $haltPc
    HaltOp = $haltOp
    HaltBytes = $haltBytes
  })
}

$rows | Export-Csv -NoTypeInformation -Path $csvPath
$combatRows = @($rows | Where-Object { $_.Status -eq '0003' -or ([string]$_.Groups) -match '^\d+$' -and [int]$_.Groups -gt 0 })
$haltRows = @($rows | Where-Object { $_.Status -eq '0004' })
$scriptRows = @($rows | Where-Object { $_.ScriptOps })
$uniqueScriptOps = @($scriptRows | ForEach-Object { ([string]$_.ScriptOps).Split(',') } | Where-Object { $_ } | Sort-Object -Unique)

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("BuckPath=$BuckPath")
$summary.Add("Rows=$($rows.Count)")
$summary.Add("Blocks=$($blocks.Count)")
$summary.Add("Choices=$($Choices -join ',')")
$summary.Add("Distances=$($Distances -join ',')")
$summary.Add("CombatRows=$($combatRows.Count)")
$summary.Add("HaltRows=$($haltRows.Count)")
$summary.Add("ScriptRows=$($scriptRows.Count)")
$summary.Add("ScriptOps=$($uniqueScriptOps -join ',')")
if ($combatRows.Count -gt 0) {
  $summary.Add('Result=Candidate Buck queued tactical handoff found; inspect _BUCKENTRY.CSV')
} elseif ($haltRows.Count -gt 0) {
  $summary.Add('Result=Buck scan still halted; inspect _BUCKENTRY.CSV')
} else {
  $summary.Add('Result=No Buck queued tactical handoff or VM halt found across scanned far-pointer entries/choices/distances')
}
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

Write-Output ("[BUCKENTRY] rows={0} combatRows={1} haltRows={2}" -f $rows.Count, $combatRows.Count, $haltRows.Count)
if ($combatRows.Count -gt 0) {
  $combatRows | Select-Object -First 20 File,Block,Entry,Vaddr,Choice,Distance,Status,Flags,Groups,Pc | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
  throw 'Buck entry scan found a queued tactical candidate; promote it to a focused flow before treating this as baseline'
}
if ($haltRows.Count -gt 0) {
  $haltRows | Select-Object -First 20 File,Block,Entry,Vaddr,Choice,Distance,Status,Flags,ScriptOps,HaltReason,HaltPc,HaltOp,HaltBytes | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'Buck entry scan still found VM halts; decode or handle the halted opcode before treating this as baseline'
}
Write-Output ("RESULT: Buck entrypoint scan found no queued tactical handoff or VM halt across {0} far-pointer/choice/distance probes (script ops: {1})" -f $rows.Count, (($uniqueScriptOps -join ',') -replace '^$', 'none'))
