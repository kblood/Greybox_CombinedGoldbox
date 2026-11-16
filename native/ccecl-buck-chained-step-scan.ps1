# ccecl-buck-chained-step-scan.ps1 -- Buck vmRun1 -> SearchLocation route audit.
#
# Optional real-data discovery probe for Buck Rogers Countdown. It scans real
# GEO descriptors as GBBOOT walking sees them: CCECL first runs vmRun1 (/Q),
# then a second invocation imports that state with /P and runs SearchLocation
# (/J). New queued combat hits should be promoted to gbbuck-flow-test.ps1;
# routes already covered by that flow are counted separately.
param(
  [switch]$Headless,
  [string]$BuckPath = $env:GOLDBOX_BUCK_PATH,
  [string[]]$Areas = @('1'),
  [int[]]$Blocks = @(),
  [switch]$AllDescriptors,
  [switch]$AllowPromotedBuckGuard,
  [int]$PartyCount = 5,
  [int[]]$Choices = @(0),
  [int[]]$Distances = @(4)
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_BUCKCHAIN.TXT'
$csvPath = Join-Path $build '_BUCKCHAIN.CSV'

if (-not $BuckPath) {
  $BuckPath = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\B\BuckRogersCountdownDday\data'
}

if (-not (Test-Path $BuckPath)) {
  Write-Output "SKIP: CCECL Buck chained step scan ($BuckPath absent; set GOLDBOX_BUCK_PATH to run)"
  exit 0
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')

$areaMap = @{
  '1' = @{ Ecl = 'ECL1.DAX'; Geo = 'GEO1.DAX' }
  '2' = @{ Ecl = 'ECL2.DAX'; Geo = 'GEO2.DAX' }
  '3' = @{ Ecl = 'ECL3.DAX'; Geo = 'GEO3.DAX' }
}

foreach ($area in $Areas) {
  if (-not $areaMap.ContainsKey($area)) { throw "Unsupported Buck area '$area' (use 1,2,3)" }
  foreach ($kind in @('Ecl', 'Geo')) {
    $name = $areaMap[$area][$kind]
    if (-not (Test-Path (Join-Path $BuckPath $name))) {
      Write-Output "SKIP: CCECL Buck chained step scan ($name absent under $BuckPath)"
      exit 0
    }
  }
}

# The scan reads retail bytes from $BuckPath while it decodes routes, but its
# DOS child makes D: current.  Mount a scratch mirror there so an unexpected
# DOS write cannot land in the never-vendored source tree.
$buckMount = New-RetailStage -Source $BuckPath -Name 'buck-chained-step-scan'

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

function Get-WallSlot([byte[]]$Raw, [int]$Index, [int]$Facing) {
  switch ($Facing) {
    0 { return ([int]$Raw[2 + $Index] -shr 4) -band 0x0f }
    2 { return ([int]$Raw[2 + $Index]) -band 0x0f }
    4 { return ([int]$Raw[258 + $Index] -shr 4) -band 0x0f }
    6 { return ([int]$Raw[258 + $Index]) -band 0x0f }
    default { throw "Unsupported facing $Facing" }
  }
}

function Get-DoorBits([byte[]]$Raw, [int]$Index, [int]$Facing) {
  $door = [int]$Raw[770 + $Index]
  switch ($Facing) {
    0 { return ($door -shr 0) -band 0x03 }
    2 { return ($door -shr 2) -band 0x03 }
    4 { return ($door -shr 4) -band 0x03 }
    6 { return ($door -shr 6) -band 0x03 }
    default { throw "Unsupported facing $Facing" }
  }
}

function Test-PassableEdge([byte[]]$Raw, [int]$Index, [int]$Facing) {
  $wall = Get-WallSlot $Raw $Index $Facing
  if ($wall -eq 0) { return $true }
  return (Get-DoorBits $Raw $Index $Facing) -ne 0
}

function Get-GeoStepCandidates([string]$GeoFile, [int[]]$EclBlockIds, [int[]]$WantedBlocks, [bool]$IncludeZero) {
  $rows = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  $wanted = @($WantedBlocks)
  foreach ($block in Get-DaxBlocks (Join-Path $BuckPath $GeoFile)) {
    if ([int]$block.Id -notin $EclBlockIds) {
      $script:SkippedUnpaired++
      continue
    }
    if ($wanted.Count -gt 0 -and [int]$block.Id -notin $wanted) { continue }
    $raw = [byte[]]$block.Raw
    if ($raw.Length -ne 1026) { continue }
    for ($target = 0; $target -lt 256; $target++) {
      $descriptor = [int]$raw[514 + $target]
      if (-not $IncludeZero -and $descriptor -eq 0) { continue }
      $tx = $target % 16
      $ty = [int][math]::Floor($target / 16)
      $inbound = @(
        @{ X = $tx;     Y = $ty + 1; Facing = 0 },
        @{ X = $tx - 1; Y = $ty;     Facing = 2 },
        @{ X = $tx;     Y = $ty - 1; Facing = 4 },
        @{ X = $tx + 1; Y = $ty;     Facing = 6 }
      )
      foreach ($start in $inbound) {
        if ($start.X -lt 0 -or $start.X -ge 16 -or $start.Y -lt 0 -or $start.Y -ge 16) { continue }
        $startIndex = ($start.Y * 16) + $start.X
        if (-not (Test-PassableEdge $raw $startIndex $start.Facing)) { continue }
        $key = "$GeoFile,$($block.Id),$descriptor,$($start.X),$($start.Y),$($start.Facing),$tx,$ty"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $rows.Add([pscustomobject]@{
          GeoFile = $GeoFile
          GeoBlock = [int]$block.Id
          Descriptor = $descriptor
          StartX = [int]$start.X
          StartY = [int]$start.Y
          TargetX = $tx
          TargetY = $ty
          Facing = [int]($start.Facing / 2)
          SessionFacing = [int]$start.Facing
        })
      }
    }
  }
  return $rows.ToArray()
}

$script:SkippedUnpaired = 0
$routes = New-Object System.Collections.Generic.List[object]
foreach ($area in $Areas) {
  $spec = $areaMap[$area]
  $eclBlockIds = @((Get-DaxBlocks (Join-Path $BuckPath $spec.Ecl)) | ForEach-Object { [int]$_.Id })
  foreach ($candidate in Get-GeoStepCandidates -GeoFile $spec.Geo -EclBlockIds $eclBlockIds -WantedBlocks $Blocks -IncludeZero ([bool]$AllDescriptors)) {
    $routes.Add([pscustomobject]@{
      Index = $routes.Count
      Area = [int]$area
      EclFile = $spec.Ecl
      GeoFile = $spec.Geo
      Block = [int]$candidate.GeoBlock
      Descriptor = [int]$candidate.Descriptor
      StartX = [int]$candidate.StartX
      StartY = [int]$candidate.StartY
      TargetX = [int]$candidate.TargetX
      TargetY = [int]$candidate.TargetY
      Facing = [int]$candidate.Facing
      SessionFacing = [int]$candidate.SessionFacing
    })
  }
}

if ($routes.Count -eq 0) {
  throw 'Buck chained step scan found no GEO descriptor candidates'
}

$jobs = New-Object System.Collections.Generic.List[object]
foreach ($route in $routes) {
  foreach ($choice in $Choices) {
    foreach ($distance in $Distances) {
      $jobs.Add([pscustomobject]@{
        Index = $jobs.Count
        Route = $route
        Choice = [int]$choice
        Distance = [int]$distance
      })
    }
  }
}

Remove-Item (Join-Path $build 'BCH*.BIN'),
  (Join-Path $build 'BE*.BIN'),
  (Join-Path $build 'BS*.BIN'),
  (Join-Path $build 'BUCKCHN.BAT'),
  $summaryPath,
  $csvPath -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'BUCKCHN.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
foreach ($job in $jobs) {
  $route = $job.Route
  $stem = ('{0:X6}' -f $job.Index)
  $evt = "C:\BE${stem}.BIN"
  $fin = "C:\BS${stem}.BIN"
  $common = "/F $($route.Facing) /N $PartyCount /O $($job.Choice) /D $($job.Distance)"
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /Q $($route.Descriptor) $common /E $evt > NUL")
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /P $evt /J $($route.Descriptor) $common /E $fin > NUL")
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_buck_chained_step_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$buckMount"
C:
CALL C:\BUCKCHN.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
try {
  if (-not $p.WaitForExit(420000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'Buck chained step scan timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

function Get-HaltReasonName([int]$Reason) {
  switch ($Reason) {
    1 { return 'BAD_OPCODE' }
    2 { return 'STEP_BUDGET' }
    3 { return 'MEM_FULL' }
    4 { return 'CHAIN' }
    default { return "UNKNOWN_$Reason" }
  }
}

function Read-GbefSummary([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') { return $null }
  $scriptCount = ''
  $scriptOps = ''
  if ($b.Length -ge 2252 -and [Text.Encoding]::ASCII.GetString($b, 2246, 4) -eq 'GBSX') {
    $scriptCountValue = [BitConverter]::ToUInt16($b, 2250)
    $scriptCount = $scriptCountValue
    $ops = New-Object System.Collections.Generic.List[string]
    $maxEvents = [Math]::Min($scriptCountValue, 16)
    for ($eventIndex = 0; $eventIndex -lt $maxEvents; $eventIndex++) {
      $eventOff = 2252 + ($eventIndex * 20)
      if (($eventOff + 2) -le $b.Length) {
        $ops.Add(('{0:X2}' -f [BitConverter]::ToUInt16($b, $eventOff)))
      }
    }
    $scriptOps = ($ops.ToArray() -join ',')
  }
  $haltReason = ''
  $haltReasonName = ''
  $haltPc = ''
  $haltOp = ''
  $haltArea = ''
  if ($b.Length -ge 3138 -and [Text.Encoding]::ASCII.GetString($b, 3128, 4) -eq 'GBHD') {
    $haltReasonValue = [BitConverter]::ToUInt16($b, 3132)
    if ($haltReasonValue -ne 0) {
      $haltReason = '{0:X4}' -f $haltReasonValue
      $haltReasonName = Get-HaltReasonName $haltReasonValue
      $haltPc = '{0:X4}' -f [BitConverter]::ToUInt16($b, 3134)
      $haltOp = '{0:X2}' -f [BitConverter]::ToUInt16($b, 3136)
      if ($b.Length -ge 3140) {
        $haltArea = '{0:X4}' -f [BitConverter]::ToUInt16($b, 3138)
      }
    }
  }
  $enc = [BitConverter]::ToUInt16($b, 32)
  $mon = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 34) } else { 0 }
  $count = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 36) } else { 0 }
  $pic = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 38) } else { 0 }
  return [pscustomobject]@{
    Flags = [BitConverter]::ToUInt16($b, 6)
    Status = [BitConverter]::ToUInt16($b, 8)
    Geo = [BitConverter]::ToUInt16($b, 10)
    Chain = [BitConverter]::ToUInt16($b, 30)
    Enc = $enc
    Mon = $mon
    Count = $count
    Pic = $pic
    Pc = [BitConverter]::ToUInt16($b, 124)
    ScriptCount = $scriptCount
    ScriptOps = $scriptOps
    HaltReason = $haltReason
    HaltReasonName = $haltReasonName
    HaltPc = $haltPc
    HaltOp = $haltOp
    HaltArea = $haltArea
  }
}

$rows = New-Object System.Collections.Generic.List[object]
$missing = 0
foreach ($job in $jobs) {
  $route = $job.Route
  $stem = ('{0:X6}' -f $job.Index)
  $evt = Read-GbefSummary (Join-Path $build "BE${stem}.BIN")
  $fin = Read-GbefSummary (Join-Path $build "BS${stem}.BIN")
  if ($null -eq $evt -or $null -eq $fin) {
    $missing++
    continue
  }
  $notable = $false
  if ($fin.Status -eq 3 -or $fin.Enc -gt 0 -or (($fin.Flags -band 8) -ne 0)) { $notable = $true }
  if ($evt.Status -eq 4 -or $fin.Status -eq 4 -or $evt.HaltReason -or $fin.HaltReason -or $evt.ScriptOps -or $fin.ScriptOps) { $notable = $true }
  if ($notable) {
    $rows.Add([pscustomobject]@{
      JobIndex = $job.Index
      RouteIndex = $route.Index
      Area = $route.Area
      EclFile = $route.EclFile
      GeoFile = $route.GeoFile
      Block = $route.Block
      Descriptor = $route.Descriptor
      StartX = $route.StartX
      StartY = $route.StartY
      TargetX = $route.TargetX
      TargetY = $route.TargetY
      Facing = $route.Facing
      SessionFacing = $route.SessionFacing
      Choice = $job.Choice
      Distance = $job.Distance
      VmFlags = ('{0:X4}' -f $evt.Flags)
      VmStatus = ('{0:X4}' -f $evt.Status)
      VmChain = ('{0:X4}' -f $evt.Chain)
      VmPc = ('{0:X4}' -f $evt.Pc)
      VmScriptCount = $evt.ScriptCount
      VmScriptOps = $evt.ScriptOps
      VmHaltReason = $evt.HaltReason
      VmHaltReasonName = $evt.HaltReasonName
      VmHaltPc = $evt.HaltPc
      VmHaltOp = $evt.HaltOp
      VmHaltArea = $evt.HaltArea
      SearchFlags = ('{0:X4}' -f $fin.Flags)
      SearchStatus = ('{0:X4}' -f $fin.Status)
      SearchChain = ('{0:X4}' -f $fin.Chain)
      SearchPc = ('{0:X4}' -f $fin.Pc)
      SearchScriptCount = $fin.ScriptCount
      SearchScriptOps = $fin.ScriptOps
      SearchHaltReason = $fin.HaltReason
      SearchHaltReasonName = $fin.HaltReasonName
      SearchHaltPc = $fin.HaltPc
      SearchHaltOp = $fin.HaltOp
      SearchHaltArea = $fin.HaltArea
      Enc = $fin.Enc
      Mon = ('{0:X4}' -f $fin.Mon)
      Count = ('{0:X4}' -f $fin.Count)
      Pic = ('{0:X4}' -f $fin.Pic)
    })
  }
}

$queuedCombat = @($rows | Where-Object { $_.SearchStatus -eq '0003' -and $_.Enc -gt 0 })
$promotedQueuedCombat = @($queuedCombat | Where-Object {
  $_.Area -eq 3 -and
  $_.Block -eq 98 -and
  $_.Descriptor -eq 142 -and
  $_.Choice -eq 0 -and
  $_.Distance -eq 4 -and
  $_.SearchPc -eq '1AA2' -and
  $_.Enc -eq 2 -and
  $_.Mon -eq '0017' -and
  $_.Count -eq '0001' -and
  $_.Pic -eq '0017'
})
$unpromotedQueuedCombat = @($queuedCombat | Where-Object {
  $row = $_
  -not (@($promotedQueuedCombat | Where-Object { $_.JobIndex -eq $row.JobIndex }).Count -gt 0)
})
$emptyCombat = @($rows | Where-Object { $_.SearchStatus -eq '0003' -and $_.Enc -eq 0 })
$queuedNoCombat = @($rows | Where-Object { $_.SearchStatus -ne '0003' -and $_.Enc -gt 0 })
$haltRows = @($rows | Where-Object { $_.VmStatus -eq '0004' -or $_.SearchStatus -eq '0004' -or $_.VmHaltReason -or $_.SearchHaltReason })
$chainRows = @($haltRows | Where-Object {
  ($_.VmHaltReasonName -eq 'CHAIN' -or $_.SearchHaltReasonName -eq 'CHAIN') -and
  ($_.VmHaltReasonName -in @('', 'CHAIN')) -and
  ($_.SearchHaltReasonName -in @('', 'CHAIN'))
})
$fatalHaltRows = @($haltRows | Where-Object {
  -not (
    ($_.VmHaltReasonName -eq 'CHAIN' -or $_.SearchHaltReasonName -eq 'CHAIN') -and
    ($_.VmHaltReasonName -in @('', 'CHAIN')) -and
    ($_.SearchHaltReasonName -in @('', 'CHAIN'))
  )
})
$scriptRows = @($rows | Where-Object { $_.VmScriptOps -or $_.SearchScriptOps })
$uniqueScriptOps = @($scriptRows | ForEach-Object {
  ([string]$_.VmScriptOps).Split(',')
  ([string]$_.SearchScriptOps).Split(',')
} | Where-Object { $_ } | Sort-Object -Unique)

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('Buck chained vmRun1 -> SearchLocation route scan')
$summary.Add("BuckPath=$BuckPath")
$summary.Add("Areas=$($Areas -join ',')")
$summary.Add("Blocks=$($Blocks -join ',')")
$summary.Add("AllDescriptors=$([bool]$AllDescriptors)")
$summary.Add("AllowPromotedBuckGuard=$([bool]$AllowPromotedBuckGuard)")
$summary.Add("PartyCount=$PartyCount")
$summary.Add("Choices=$($Choices -join ',')")
$summary.Add("Distances=$($Distances -join ',')")
$summary.Add("Routes=$($routes.Count)")
$summary.Add("Jobs=$($jobs.Count)")
$summary.Add("SkippedUnpairedGeoBlocks=$script:SkippedUnpaired")
$summary.Add("MissingInvalid=$missing")
$summary.Add("Notable=$($rows.Count)")
$summary.Add("QueuedCombat=$($queuedCombat.Count)")
$summary.Add("PromotedQueuedCombat=$($promotedQueuedCombat.Count)")
$summary.Add("UnpromotedQueuedCombat=$($unpromotedQueuedCombat.Count)")
$summary.Add("EmptyCombat=$($emptyCombat.Count)")
$summary.Add("QueuedNoCombat=$($queuedNoCombat.Count)")
$summary.Add("HaltRows=$($haltRows.Count)")
$summary.Add("UnresolvedChainRows=$($chainRows.Count)")
$summary.Add("FatalHaltRows=$($fatalHaltRows.Count)")
$summary.Add("ScriptRows=$($scriptRows.Count)")
$summary.Add("ScriptOps=$($uniqueScriptOps -join ',')")
if ($unpromotedQueuedCombat.Count -gt 0) {
  $summary.Add('Result=Found new Buck chained queued tactical combat handoff candidates; promote one to gbbuck-flow-test.ps1')
} elseif ($promotedQueuedCombat.Count -gt 0 -and -not $AllowPromotedBuckGuard) {
  $summary.Add('Result=Found promoted Buck chained queued tactical combat handoffs; rerun with -AllowPromotedBuckGuard to treat the covered route as baseline')
} elseif ($fatalHaltRows.Count -gt 0) {
  $summary.Add('Result=Buck chained scan still has fatal VM halts; inspect _BUCKCHAIN.CSV')
} elseif ($promotedQueuedCombat.Count -gt 0) {
  $summary.Add('Result=Only promoted Buck chained queued tactical combat handoffs found; covered by gbbuck-flow-test.ps1')
} else {
  $summary.Add('Result=No Buck chained queued tactical combat handoff found in scanned real GEO-derived routes')
}
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

if ($rows.Count -gt 0) {
  $rows |
    Sort-Object Area, Block, Descriptor, StartX, StartY, Facing |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $csvPath -Encoding ASCII
} else {
  Set-Content -Path $csvPath -Encoding ASCII -Value 'JobIndex,RouteIndex,Area,EclFile,GeoFile,Block,Descriptor,StartX,StartY,TargetX,TargetY,Facing,SessionFacing,Choice,Distance,VmFlags,VmStatus,VmChain,VmPc,VmScriptCount,VmScriptOps,VmHaltReason,VmHaltReasonName,VmHaltPc,VmHaltOp,VmHaltArea,SearchFlags,SearchStatus,SearchChain,SearchPc,SearchScriptCount,SearchScriptOps,SearchHaltReason,SearchHaltReasonName,SearchHaltPc,SearchHaltOp,SearchHaltArea,Enc,Mon,Count,Pic'
}

Write-Output ("[BUCKCHAIN] routes={0} jobs={1} missingInvalid={2} notable={3} queuedCombat={4} promotedQueuedCombat={5} unpromotedQueuedCombat={6} haltRows={7} unresolvedChainRows={8} fatalHaltRows={9}" -f $routes.Count, $jobs.Count, $missing, $rows.Count, $queuedCombat.Count, $promotedQueuedCombat.Count, $unpromotedQueuedCombat.Count, $haltRows.Count, $chainRows.Count, $fatalHaltRows.Count)
if ($missing -gt 0) {
  throw 'Buck chained step scan has incomplete route evidence; refusing to pass the route audit'
}
if ($promotedQueuedCombat.Count -gt 0) {
  Write-Output '[INFO] Buck chained queued tactical routes already covered by gbbuck-flow-test.ps1:'
  $promotedQueuedCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($unpromotedQueuedCombat.Count -gt 0) {
  Write-Output '[CANDIDATE] New Buck chained queued tactical combat routes found:'
  $unpromotedQueuedCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'Buck chained scan found new queued tactical candidates; promote one to a focused flow before treating this as baseline'
}
if ($promotedQueuedCombat.Count -gt 0 -and -not $AllowPromotedBuckGuard) {
  throw 'Buck chained scan found queued tactical candidates; pass -AllowPromotedBuckGuard only for the promoted area-3 block-98 descriptor-142 guard route'
}
if ($fatalHaltRows.Count -gt 0) {
  Write-Output '[HALT] Buck chained fatal VM halts found:'
  $fatalHaltRows | Select-Object -First 20 | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'Buck chained scan still found fatal VM halts; decode or handle the halted opcode before treating this as baseline'
}
if ($chainRows.Count -gt 0) {
  Write-Output '[INFO] Buck chained unresolved NEWECL transitions:'
  $chainRows | Select-Object -First 20 | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($emptyCombat.Count -gt 0) {
  Write-Output '[INFO] Buck chained empty COMBAT yields:'
  $emptyCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($queuedNoCombat.Count -gt 0) {
  Write-Output '[INFO] Buck chained queued-monster routes that exit before COMBAT:'
  $queuedNoCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}

if ($promotedQueuedCombat.Count -gt 0) {
  Write-Output ("RESULT: Buck chained vmRun1 -> SearchLocation scan found only promoted queued tactical combat handoffs across {0} real GEO-derived routes (promoted={1}; script ops: {2})" -f $routes.Count, $promotedQueuedCombat.Count, (($uniqueScriptOps -join ',') -replace '^$', 'none'))
} else {
  Write-Output ("RESULT: Buck chained vmRun1 -> SearchLocation scan found no queued tactical combat handoff across {0} real GEO-derived routes (script ops: {1})" -f $routes.Count, (($uniqueScriptOps -join ',') -replace '^$', 'none'))
}
