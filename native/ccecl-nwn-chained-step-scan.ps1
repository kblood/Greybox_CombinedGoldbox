# ccecl-nwn-chained-step-scan.ps1 -- NWN vmRun1 -> SearchLocation route audit.
#
# Optional real-data discovery probe for Neverwinter Nights (DOS/AOL). It scans
# the boot-mapped NWN GEO blocks as GBBOOT walking sees them: a successful CCFP
# step yields a GBST descriptor/facing, CCECL first runs vmRun1 (/Q), and the
# SearchLocation pass (/J) imports that state with /P.
param(
  [switch]$Headless,
  [string]$NwnPath = $env:GOLDBOX_NWN_PATH,
  [string[]]$Areas = @('0', '1', '2', '3'),
  [switch]$AllBlocks,
  [switch]$AllDescriptors
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_NWNCHAIN.TXT'
$csvPath = Join-Path $build '_NWNCHAIN.CSV'

if (-not $NwnPath) {
  $NwnPath = 'D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint'
}

if (-not (Test-Path $NwnPath)) {
  Write-Output "SKIP: NWN chained step scan ($NwnPath absent; set GOLDBOX_NWN_PATH to run)"
  exit 0
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')

$areaMap = @{
  '0' = @{ Ecl = 'ECL0.DAX'; Geo = 'GEO0.DAX'; Entry = 1 }
  '1' = @{ Ecl = 'ECL1.DAX'; Geo = 'GEO1.DAX'; Entry = 10 }
  '2' = @{ Ecl = 'ECL2.DAX'; Geo = 'GEO2.DAX'; Entry = 20 }
  '3' = @{ Ecl = 'ECL3.DAX'; Geo = 'GEO3.DAX'; Entry = 30 }
}

foreach ($area in $Areas) {
  if (-not $areaMap.ContainsKey($area)) { throw "Unsupported NWN area '$area' (use 0,1,2,3)" }
  foreach ($kind in @('Ecl', 'Geo')) {
    $name = $areaMap[$area][$kind]
    if (-not (Test-Path (Join-Path $NwnPath $name))) {
      Write-Output "SKIP: NWN chained step scan ($name absent under $NwnPath)"
      exit 0
    }
  }
}

# The scan decodes source bytes directly, then makes its DOS mount current.
# Stage that mount so transient DOS files cannot modify the never-vendored NWN
# source tree.
$nwnMount = New-RetailStage -Source $NwnPath -Name 'nwn-chained-step-scan'

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

function Get-GeoStepCandidates([string]$GeoFile, [int[]]$WantedBlocks, [bool]$IncludeZero) {
  $rows = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($block in Get-DaxBlocks (Join-Path $NwnPath $GeoFile)) {
    if ($WantedBlocks.Count -gt 0 -and [int]$block.Id -notin $WantedBlocks) { continue }
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

$routes = New-Object System.Collections.Generic.List[object]
foreach ($area in $Areas) {
  $spec = $areaMap[$area]
  $wanted = if ($AllBlocks) { @() } else { @([int]$spec.Entry) }
  foreach ($candidate in Get-GeoStepCandidates $spec.Geo $wanted ([bool]$AllDescriptors)) {
    $routes.Add([pscustomobject]@{
      Index = $routes.Count
      Area = $area
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
  throw 'NWN chained step scan found no GEO descriptor candidates'
}

Remove-Item (Join-Path $build 'NC*.BIN'),
  (Join-Path $build 'NWNCHAIN.BAT'),
  $summaryPath,
  $csvPath -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'NWNCHAIN.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
foreach ($route in $routes) {
  $stem = ('NC{0:D4}' -f $route.Index)
  $evt = "C:\${stem}E.BIN"
  $fin = "C:\${stem}S.BIN"
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /Q $($route.Descriptor) /F $($route.Facing) /N 3 /H 1 /Z 240 /D 4 /E $evt > NUL")
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /P $evt /J $($route.Descriptor) /F $($route.Facing) /N 3 /H 1 /Z 240 /D 4 /E $fin > NUL")
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_nwn_chained_step_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$nwnMount"
C:
CALL C:\NWNCHAIN.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 35000'
try {
  if (-not $p.WaitForExit(420000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'NWN chained step scan timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

function Read-GbefSummary([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') { return $null }
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
  }
}

$rows = New-Object System.Collections.Generic.List[object]
$missing = 0
foreach ($route in $routes) {
  $stem = ('NC{0:D4}' -f $route.Index)
  $evt = Read-GbefSummary (Join-Path $build "${stem}E.BIN")
  $fin = Read-GbefSummary (Join-Path $build "${stem}S.BIN")
  if ($null -eq $evt -or $null -eq $fin) {
    $missing++
    continue
  }
  if ($fin.Status -eq 3 -or $fin.Enc -gt 0 -or (($fin.Flags -band 8) -ne 0)) {
    $rows.Add([pscustomobject]@{
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
      VmFlags = ('{0:X4}' -f $evt.Flags)
      VmStatus = ('{0:X4}' -f $evt.Status)
      VmPc = ('{0:X4}' -f $evt.Pc)
      SearchFlags = ('{0:X4}' -f $fin.Flags)
      SearchStatus = ('{0:X4}' -f $fin.Status)
      SearchPc = ('{0:X4}' -f $fin.Pc)
      Enc = $fin.Enc
      Mon = ('{0:X4}' -f $fin.Mon)
      Count = ('{0:X4}' -f $fin.Count)
      Pic = ('{0:X4}' -f $fin.Pic)
    })
  }
}

$queuedCombat = @($rows | Where-Object { $_.SearchStatus -eq '0003' -and $_.Enc -gt 0 })
$emptyCombat = @($rows | Where-Object { $_.SearchStatus -eq '0003' -and $_.Enc -eq 0 })
$queuedNoCombat = @($rows | Where-Object { $_.SearchStatus -ne '0003' -and $_.Enc -gt 0 })

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('NWN chained vmRun1 -> SearchLocation route scan')
$summary.Add("NwnPath=$NwnPath")
$summary.Add("Areas=$($Areas -join ',')")
$summary.Add("AllBlocks=$([bool]$AllBlocks)")
$summary.Add("AllDescriptors=$([bool]$AllDescriptors)")
$summary.Add("Routes=$($routes.Count)")
$summary.Add("MissingInvalid=$missing")
$summary.Add("Notable=$($rows.Count)")
$summary.Add("QueuedCombat=$($queuedCombat.Count)")
$summary.Add("EmptyCombat=$($emptyCombat.Count)")
$summary.Add("QueuedNoCombat=$($queuedNoCombat.Count)")
if ($queuedCombat.Count -gt 0) {
  $summary.Add('Result=Found chained natural queued tactical combat handoff candidates; area 1 descriptor 229 is one promoted candidate in gbnwn-flow-test.ps1')
} else {
  $summary.Add('Result=No chained natural queued tactical combat handoff found in scanned NWN boot-mapped GEO descriptors')
}
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

if ($rows.Count -gt 0) {
  $rows |
    Sort-Object Area, Block, Descriptor, StartX, StartY, Facing |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $csvPath -Encoding ASCII
} else {
  Set-Content -Path $csvPath -Encoding ASCII -Value 'Area,EclFile,GeoFile,Block,Descriptor,StartX,StartY,TargetX,TargetY,Facing,SessionFacing,VmFlags,VmStatus,VmPc,SearchFlags,SearchStatus,SearchPc,Enc,Mon,Count,Pic'
}

Write-Output ("[NWNCHAIN] routes={0} missingInvalid={1} notable={2}" -f $routes.Count, $missing, $rows.Count)
if ($missing -gt 0) {
  throw 'NWN chained step scan has incomplete route evidence; refusing to pass the route audit'
}
if ($queuedCombat.Count -gt 0) {
  Write-Output '[CANDIDATE] NWN chained natural queued tactical combat routes found:'
  $queuedCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($emptyCombat.Count -gt 0) {
  Write-Output '[INFO] NWN chained empty COMBAT yields:'
  $emptyCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($queuedNoCombat.Count -gt 0) {
  Write-Output '[INFO] NWN chained queued-monster routes that exit before COMBAT:'
  $queuedNoCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}

if ($queuedCombat.Count -gt 0) {
  Write-Output ("RESULT: NWN chained vmRun1 -> SearchLocation scan found {0} natural queued tactical routes across {1} real GEO-derived routes; area 1 descriptor 229 is one promoted candidate in gbnwn-flow-test.ps1" -f $queuedCombat.Count, $routes.Count)
} else {
  Write-Output ("RESULT: NWN chained vmRun1 -> SearchLocation scan found no natural queued tactical combat handoff across {0} real GEO-derived routes" -f $routes.Count)
}
