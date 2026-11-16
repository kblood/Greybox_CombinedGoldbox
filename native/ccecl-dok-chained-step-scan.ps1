# ccecl-dok-chained-step-scan.ps1 -- DoK vmRun1 -> SearchLocation route audit.
#
# This is an opt-in discovery probe for the remaining DoK natural tactical gap.
# Unlike ccecl-dok-route-scan.ps1, it scans real GEO plane-2 descriptors as the
# normal GBBOOT walking loop sees them: CCECL first runs vmRun1 (/Q), then a
# second CCECL invocation imports that GBEF state with /P and runs
# SearchLocation (/J). A queued COMBAT hit should be promoted to a GBBOOT flow.
param(
  [switch]$Headless,
  [switch]$WithThiefMatrix,
  [ValidateRange(0, 255)]
  [int]$ThiefSkill = 100,
  [string[]]$Areas = @('1', '2', '3'),
  [int[]]$Blocks = @(),
  [switch]$AllDescriptors
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
$summaryPath = Join-Path $build '_DOKCHAIN.TXT'
$csvPath = Join-Path $build '_DOKCHAIN.CSV'
$seedArg = ''

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($area in $Areas) {
  foreach ($prefix in @('ECL', 'GEO')) {
    $name = "$prefix$area.DAX"
    if (-not (Test-Path (Join-Path $game $name))) {
      Write-Output "SKIP: DoK chained step scan ($name absent)"
      exit 0
    }
  }
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

function Get-WallSlot([byte[]]$Raw, [int]$Index, [int]$Facing) {
  $plane0 = 2
  $plane1 = 258
  switch ($Facing) {
    0 { return ([int]$Raw[$plane0 + $Index] -shr 4) -band 0x0f }
    2 { return ([int]$Raw[$plane0 + $Index]) -band 0x0f }
    4 { return ([int]$Raw[$plane1 + $Index] -shr 4) -band 0x0f }
    6 { return ([int]$Raw[$plane1 + $Index]) -band 0x0f }
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
  foreach ($block in Get-DaxBlocks (Join-Path $game $GeoFile)) {
    if ($WantedBlocks.Count -gt 0 -and [int]$block.Id -notin $WantedBlocks) { continue }
    $raw = [byte[]]$block.Raw
    if ($raw.Length -ne 1026) { continue }
    $plane2 = 514
    for ($target = 0; $target -lt 256; $target++) {
      $descriptor = [int]$raw[$plane2 + $target]
      if (-not $IncludeZero -and $descriptor -eq 0) { continue }
      $tx = $target % 16
      $ty = [int][math]::Floor($target / 16)
      $inbound = @(
        @{ X = $tx;     Y = $ty + 1; Facing = 0; Edge = 0 },
        @{ X = $tx - 1; Y = $ty;     Facing = 2; Edge = 2 },
        @{ X = $tx;     Y = $ty - 1; Facing = 4; Edge = 4 },
        @{ X = $tx + 1; Y = $ty;     Facing = 6; Edge = 6 }
      )
      foreach ($start in $inbound) {
        if ($start.X -lt 0 -or $start.X -ge 16 -or $start.Y -lt 0 -or $start.Y -ge 16) { continue }
        $startIndex = ($start.Y * 16) + $start.X
        if (-not (Test-PassableEdge $raw $startIndex $start.Edge)) { continue }
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

function Write-ThiefMatrixSeed([string]$Path, [int]$SkillValue) {
  $seed = New-Object byte[] 216
  [Text.Encoding]::ASCII.GetBytes('GBPS').CopyTo($seed, 0)
  [BitConverter]::GetBytes([uint16]2).CopyTo($seed, 4)
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 6)
  [BitConverter]::GetBytes([uint16]6).CopyTo($seed, 8)
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 10)
  [BitConverter]::GetBytes([uint16]4).CopyTo($seed, 12)
  $seed[150] = 6
  for ($member = 0; $member -lt 6; $member++) {
    for ($skill = 0; $skill -lt 8; $skill++) {
      $seed[152 + ($member * 8) + $skill] = [byte]$SkillValue
    }
  }
  [IO.File]::WriteAllBytes($Path, $seed)
}

if ($WithThiefMatrix) {
  $seedPath = Join-Path $build 'DOKCHAIN.GBP'
  Write-ThiefMatrixSeed $seedPath $ThiefSkill
  $seedArg = ' /G C:\DOKCHAIN.GBP'
}

$areaMap = @{
  '1' = @{ Ecl = 'ECL1.DAX'; Geo = 'GEO1.DAX' }
  '2' = @{ Ecl = 'ECL2.DAX'; Geo = 'GEO2.DAX' }
  '3' = @{ Ecl = 'ECL3.DAX'; Geo = 'GEO3.DAX' }
}

$routes = New-Object System.Collections.Generic.List[object]
foreach ($area in $Areas) {
  if (-not $areaMap.ContainsKey($area)) { throw "Unsupported DoK area for chained scan: $area" }
  $geoFile = $areaMap[$area].Geo
  foreach ($candidate in Get-GeoStepCandidates $geoFile $Blocks ([bool]$AllDescriptors)) {
    $eclFile = $areaMap[$area].Ecl
    $routes.Add([pscustomobject]@{
      Index = $routes.Count
      Area = [int]$area
      EclFile = $eclFile
      GeoFile = $geoFile
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
  throw 'DoK chained step scan found no GEO descriptor candidates'
}

Remove-Item (Join-Path $build 'DC*.BIN'),
  (Join-Path $build 'DC*.TXT'),
  (Join-Path $build 'DOKCHAIN.BAT'),
  $summaryPath,
  $csvPath -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'DOKCHAIN.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
foreach ($route in $routes) {
  $stem = ('DC{0:D4}' -f $route.Index)
  $evt = "C:\${stem}E.BIN"
  $fin = "C:\${stem}S.BIN"
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /Q $($route.Descriptor) /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $evt > NUL")
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /P $evt /J $($route.Descriptor) /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $fin > NUL")
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_dok_chained_step_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\DOKCHAIN.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 35000'
try {
  if (-not $p.WaitForExit(420000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'DoK chained step scan timed out'
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
  $stem = ('DC{0:D4}' -f $route.Index)
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
$matrixSuffix = if ($WithThiefMatrix) { " with GBPS v2 thief matrix=$ThiefSkill" } else { '' }

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK chained vmRun1 -> SearchLocation route scan')
$summary.Add("Areas=$($Areas -join ',')")
$summary.Add("Blocks=$($Blocks -join ',')")
$summary.Add("AllDescriptors=$([bool]$AllDescriptors)")
$summary.Add("WithThiefMatrix=$([bool]$WithThiefMatrix)")
if ($WithThiefMatrix) { $summary.Add("ThiefSkill=$ThiefSkill") }
$summary.Add("Routes=$($routes.Count)")
$summary.Add("MissingInvalid=$missing")
$summary.Add("Notable=$($rows.Count)")
$summary.Add("QueuedCombat=$($queuedCombat.Count)")
$summary.Add("EmptyCombat=$($emptyCombat.Count)")
$summary.Add("QueuedNoCombat=$($queuedNoCombat.Count)")
$summary.Add("Result=No chained natural queued tactical combat handoff found in scanned real GEO descriptors$matrixSuffix")
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

if ($rows.Count -gt 0) {
  $rows |
    Sort-Object Area, Block, Descriptor, StartX, StartY, Facing |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $csvPath -Encoding ASCII
} else {
  Set-Content -Path $csvPath -Encoding ASCII -Value 'Area,EclFile,GeoFile,Block,Descriptor,StartX,StartY,TargetX,TargetY,Facing,SessionFacing,VmFlags,VmStatus,VmPc,SearchFlags,SearchStatus,SearchPc,Enc,Mon,Count,Pic'
}

Write-Output ("[CHAIN] routes={0} missingInvalid={1} notable={2}" -f $routes.Count, $missing, $rows.Count)
if ($missing -gt 0) {
  throw 'DoK chained step scan has incomplete route evidence; refusing to pass a no-combat audit'
}
if ($queuedCombat.Count -gt 0) {
  Write-Output '[CANDIDATE] chained natural queued tactical combat routes found:'
  $queuedCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'DoK chained step scan found a natural queued tactical route; promote it to a GBBOOT flow test'
}
if ($emptyCombat.Count -gt 0) {
  Write-Output '[INFO] chained empty COMBAT yields:'
  $emptyCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($queuedNoCombat.Count -gt 0) {
  Write-Output '[INFO] chained queued-monster routes that exit before COMBAT:'
  $queuedNoCombat | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}

Write-Output ("RESULT: DoK chained vmRun1 -> SearchLocation scan found no natural queued tactical combat handoff across {0} real GEO-derived routes{1}" -f $routes.Count, $matrixSuffix)
