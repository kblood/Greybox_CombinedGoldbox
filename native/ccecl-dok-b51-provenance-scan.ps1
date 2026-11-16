# ccecl-dok-b51-provenance-scan.ps1 -- DoK natural route memory provenance audit.
#
# The focused block-51 matrix proves the known queued tactical handoff needs
# vmRun1 descriptor 29 plus host-state 4CE9=1. This opt-in scan follows the same
# real-GEO chained route model as ccecl-dok-chained-step-scan.ps1, but records
# the host memory cells that can feed that gate after each natural vmRun1 and
# SearchLocation pass.
param(
  [switch]$Headless,
  [switch]$WithThiefMatrix,
  [ValidateRange(0, 255)]
  [int]$ThiefSkill = 100,
  [string[]]$Areas = @('1', '2', '3'),
  [int[]]$Blocks = @(),
  [switch]$AllDescriptors,
  [switch]$ProbeB51Selector
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
$summaryPath = Join-Path $build '_DOKB51PROV.TXT'
$csvPath = Join-Path $build '_DOKB51PROV.CSV'
$seedArg = ''

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($area in $Areas) {
  foreach ($prefix in @('ECL', 'GEO')) {
    $name = "$prefix$area.DAX"
    if (-not (Test-Path (Join-Path $game $name))) {
      Write-Output "SKIP: DoK block-51 provenance scan ($name absent)"
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
  foreach ($block in Get-DaxBlocks (Join-Path $game $GeoFile)) {
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

function Read-GbefSummary([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') { return $null }
  $enc = [BitConverter]::ToUInt16($b, 32)
  return [pscustomobject]@{
    Bytes = $b
    Flags = [BitConverter]::ToUInt16($b, 6)
    Status = [BitConverter]::ToUInt16($b, 8)
    Enc = $enc
    Pc = [BitConverter]::ToUInt16($b, 124)
  }
}

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

function Format-HexValue($Value) {
  if ($null -eq $Value) { return '' }
  return '{0:X4}' -f [int]$Value
}

function Format-MemMap([byte[]]$Bytes) {
  if ($Bytes.Length -lt 2246 -or [Text.Encoding]::ASCII.GetString($Bytes, 116, 4) -ne 'GBRS') {
    return ''
  }
  $count = [BitConverter]::ToUInt16($Bytes, 196)
  $pairs = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $count -and $i -lt 512; $i++) {
    $key = [BitConverter]::ToUInt16($Bytes, 198 + ($i * 2))
    $value = [BitConverter]::ToUInt16($Bytes, 1222 + ($i * 2))
    $pairs.Add(('{0:X4}={1:X4}' -f $key, $value))
  }
  return ($pairs -join ';')
}

function Has-GateMemory($Row) {
  return $Row.Vm4CE9 -eq '0001' -or $Row.Search4CE9 -eq '0001'
}

if ($WithThiefMatrix) {
  $seedPath = Join-Path $build 'P.GBP'
  Write-ThiefMatrixSeed $seedPath $ThiefSkill
  $seedArg = ' /G C:\P.GBP'
}

$areaMap = @{
  '1' = @{ Ecl = 'ECL1.DAX'; Geo = 'GEO1.DAX' }
  '2' = @{ Ecl = 'ECL2.DAX'; Geo = 'GEO2.DAX' }
  '3' = @{ Ecl = 'ECL3.DAX'; Geo = 'GEO3.DAX' }
}

$routes = New-Object System.Collections.Generic.List[object]
foreach ($area in $Areas) {
  if (-not $areaMap.ContainsKey($area)) { throw "Unsupported DoK area for provenance scan: $area" }
  foreach ($candidate in Get-GeoStepCandidates $areaMap[$area].Geo $Blocks ([bool]$AllDescriptors)) {
    $routes.Add([pscustomobject]@{
      Index = $routes.Count
      Area = [int]$area
      EclFile = $areaMap[$area].Ecl
      GeoFile = $areaMap[$area].Geo
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
  throw 'DoK block-51 provenance scan found no GEO descriptor candidates'
}

Remove-Item (Join-Path $build 'DP*.BIN'),
  (Join-Path $build 'P.BAT'),
  $summaryPath,
  $csvPath -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'P.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
foreach ($route in $routes) {
  $stem = ('DP{0:D4}' -f $route.Index)
  $evt = "C:\${stem}E.BIN"
  $fin = "C:\${stem}S.BIN"
  $probe = "C:\${stem}B.BIN"
  $searchProbe = "C:\${stem}C.BIN"
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /Q $($route.Descriptor) /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $evt > NUL")
  if ($ProbeB51Selector) {
    $lines.Add("C:\CCECL D:\ECL2.DAX 51 /P $evt /Q 29 /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $probe > NUL")
  }
  $lines.Add("C:\CCECL D:\$($route.EclFile) $($route.Block) /P $evt /J $($route.Descriptor) /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $fin > NUL")
  if ($ProbeB51Selector) {
    $lines.Add("C:\CCECL D:\ECL2.DAX 51 /P $fin /Q 29 /F $($route.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E $searchProbe > NUL")
  }
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_dok_b51_provenance_scan.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\P.BAT
exit
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 35000'
try {
  if (-not $p.WaitForExit(420000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'DoK block-51 provenance scan timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

$rows = New-Object System.Collections.Generic.List[object]
$missing = 0
$probeMissing = 0
foreach ($route in $routes) {
  $stem = ('DP{0:D4}' -f $route.Index)
  $evt = Read-GbefSummary (Join-Path $build "${stem}E.BIN")
  $fin = Read-GbefSummary (Join-Path $build "${stem}S.BIN")
  if ($null -eq $evt -or $null -eq $fin) {
    $missing++
    continue
  }
  $probe = $null
  if ($ProbeB51Selector) {
    $probe = Read-GbefSummary (Join-Path $build "${stem}B.BIN")
    if ($null -eq $probe) {
      $probeMissing++
    }
  }
  $searchProbe = $null
  if ($ProbeB51Selector) {
    $searchProbe = Read-GbefSummary (Join-Path $build "${stem}C.BIN")
    if ($null -eq $searchProbe) {
      $probeMissing++
    }
  }

  $rows.Add([pscustomobject]@{
    Index = $route.Index
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
    VmEnc = $evt.Enc
    Vm4CE9 = Format-HexValue (Get-MemValue $evt.Bytes 0x4ce9)
    Vm4CE8 = Format-HexValue (Get-MemValue $evt.Bytes 0x4ce8)
    Vm4CE5 = Format-HexValue (Get-MemValue $evt.Bytes 0x4ce5)
    Vm4C00 = Format-HexValue (Get-MemValue $evt.Bytes 0x4c00)
    Vm7F79 = Format-HexValue (Get-MemValue $evt.Bytes 0x7f79)
    VmC04F = Format-HexValue (Get-MemValue $evt.Bytes 0xc04f)
    VmC04E = Format-HexValue (Get-MemValue $evt.Bytes 0xc04e)
    VmAllMem = Format-MemMap $evt.Bytes
    ProbeFlags = if ($null -ne $probe) { ('{0:X4}' -f $probe.Flags) } else { '' }
    ProbeStatus = if ($null -ne $probe) { ('{0:X4}' -f $probe.Status) } else { '' }
    ProbePc = if ($null -ne $probe) { ('{0:X4}' -f $probe.Pc) } else { '' }
    ProbeEnc = if ($null -ne $probe) { $probe.Enc } else { '' }
    Probe4CE9 = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0x4ce9) } else { '' }
    Probe4CE8 = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0x4ce8) } else { '' }
    Probe4CE5 = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0x4ce5) } else { '' }
    Probe4C00 = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0x4c00) } else { '' }
    Probe7F79 = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0x7f79) } else { '' }
    ProbeC04F = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0xc04f) } else { '' }
    ProbeC04E = if ($null -ne $probe) { Format-HexValue (Get-MemValue $probe.Bytes 0xc04e) } else { '' }
    ProbeAllMem = if ($null -ne $probe) { Format-MemMap $probe.Bytes } else { '' }
    SearchFlags = ('{0:X4}' -f $fin.Flags)
    SearchStatus = ('{0:X4}' -f $fin.Status)
    SearchPc = ('{0:X4}' -f $fin.Pc)
    SearchEnc = $fin.Enc
    Search4CE9 = Format-HexValue (Get-MemValue $fin.Bytes 0x4ce9)
    Search4CE8 = Format-HexValue (Get-MemValue $fin.Bytes 0x4ce8)
    Search4CE5 = Format-HexValue (Get-MemValue $fin.Bytes 0x4ce5)
    Search4C00 = Format-HexValue (Get-MemValue $fin.Bytes 0x4c00)
    Search7F79 = Format-HexValue (Get-MemValue $fin.Bytes 0x7f79)
    SearchC04F = Format-HexValue (Get-MemValue $fin.Bytes 0xc04f)
    SearchC04E = Format-HexValue (Get-MemValue $fin.Bytes 0xc04e)
    SearchAllMem = Format-MemMap $fin.Bytes
    SearchProbeFlags = if ($null -ne $searchProbe) { ('{0:X4}' -f $searchProbe.Flags) } else { '' }
    SearchProbeStatus = if ($null -ne $searchProbe) { ('{0:X4}' -f $searchProbe.Status) } else { '' }
    SearchProbePc = if ($null -ne $searchProbe) { ('{0:X4}' -f $searchProbe.Pc) } else { '' }
    SearchProbeEnc = if ($null -ne $searchProbe) { $searchProbe.Enc } else { '' }
    SearchProbe4CE9 = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0x4ce9) } else { '' }
    SearchProbe4CE8 = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0x4ce8) } else { '' }
    SearchProbe4CE5 = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0x4ce5) } else { '' }
    SearchProbe4C00 = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0x4c00) } else { '' }
    SearchProbe7F79 = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0x7f79) } else { '' }
    SearchProbeC04F = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0xc04f) } else { '' }
    SearchProbeC04E = if ($null -ne $searchProbe) { Format-HexValue (Get-MemValue $searchProbe.Bytes 0xc04e) } else { '' }
    SearchProbeAllMem = if ($null -ne $searchProbe) { Format-MemMap $searchProbe.Bytes } else { '' }
    SearchDispatchFlags = ''
    SearchDispatchStatus = ''
    SearchDispatchPc = ''
    SearchDispatchEnc = ''
    SearchDispatch4CE9 = ''
    SearchDispatch4CE8 = ''
    SearchDispatch4CE5 = ''
    SearchDispatch4C00 = ''
    SearchDispatch7F79 = ''
    SearchDispatchC04F = ''
    SearchDispatchC04E = ''
    SearchDispatchAllMem = ''
  })
}

$searchDispatchMissing = 0
$searchDispatchCandidates = @()
if ($ProbeB51Selector) {
  $searchDispatchCandidates = @($rows | Where-Object { $_.Search7F79 -eq '001D' })
}
if ($searchDispatchCandidates.Count -gt 0) {
  $dispatchBat = Join-Path $build 'PD.BAT'
  $dispatchLines = New-Object System.Collections.Generic.List[string]
  $dispatchLines.Add('@echo off')
  foreach ($row in $searchDispatchCandidates) {
    $stem = ('DP{0:D4}' -f [int]$row.Index)
    $dispatchLines.Add("C:\CCECL D:\$($row.EclFile) $($row.Block) /P C:\${stem}S.BIN /J 29 /F $($row.Facing) /N 6 /H 1 /Z 240 /D 4$seedArg /E C:\${stem}D.BIN > NUL")
  }
  $dispatchLines.Add('exit')
  [IO.File]::WriteAllLines($dispatchBat, $dispatchLines, [Text.Encoding]::ASCII)

  $dispatchConf = Join-Path $build '_dok_b51_search_dispatch_probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\PD.BAT
exit
"@ | Set-Content $dispatchConf -Encoding ASCII

  $dp = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dispatchConf -Headless:$Headless -Cycles 'fixed 35000'
  try {
    if (-not $dp.WaitForExit(180000)) {
      Stop-DosBoxSmoke -Process $dp
      throw 'DoK block-51 search-dispatch probe timed out'
    }
  } finally {
    Stop-DosBoxSmoke -Process $dp
  }

  foreach ($row in $searchDispatchCandidates) {
    $stem = ('DP{0:D4}' -f [int]$row.Index)
    $dispatch = Read-GbefSummary (Join-Path $build "${stem}D.BIN")
    if ($null -eq $dispatch) {
      $searchDispatchMissing++
      continue
    }
    $row.SearchDispatchFlags = ('{0:X4}' -f $dispatch.Flags)
    $row.SearchDispatchStatus = ('{0:X4}' -f $dispatch.Status)
    $row.SearchDispatchPc = ('{0:X4}' -f $dispatch.Pc)
    $row.SearchDispatchEnc = $dispatch.Enc
    $row.SearchDispatch4CE9 = Format-HexValue (Get-MemValue $dispatch.Bytes 0x4ce9)
    $row.SearchDispatch4CE8 = Format-HexValue (Get-MemValue $dispatch.Bytes 0x4ce8)
    $row.SearchDispatch4CE5 = Format-HexValue (Get-MemValue $dispatch.Bytes 0x4ce5)
    $row.SearchDispatch4C00 = Format-HexValue (Get-MemValue $dispatch.Bytes 0x4c00)
    $row.SearchDispatch7F79 = Format-HexValue (Get-MemValue $dispatch.Bytes 0x7f79)
    $row.SearchDispatchC04F = Format-HexValue (Get-MemValue $dispatch.Bytes 0xc04f)
    $row.SearchDispatchC04E = Format-HexValue (Get-MemValue $dispatch.Bytes 0xc04e)
    $row.SearchDispatchAllMem = Format-MemMap $dispatch.Bytes
  }
}

$gateRows = @($rows | Where-Object { Has-GateMemory $_ })
$descriptor29Rows = @($rows | Where-Object { $_.Area -eq 2 -and $_.Block -eq 51 -and $_.Descriptor -eq 29 })
$descriptor29GateRows = @($descriptor29Rows | Where-Object { Has-GateMemory $_ })
$probeGateRows = @($rows | Where-Object { $_.Probe4CE9 -eq '0001' })
$probeCombatRows = @($rows | Where-Object { $_.ProbeStatus -eq '0003' -and [string]$_.ProbeEnc -ne '' -and [int]$_.ProbeEnc -gt 0 })
$searchProbeGateRows = @($rows | Where-Object { $_.SearchProbe4CE9 -eq '0001' })
$searchProbeCombatRows = @($rows | Where-Object { $_.SearchProbeStatus -eq '0003' -and [string]$_.SearchProbeEnc -ne '' -and [int]$_.SearchProbeEnc -gt 0 })
$searchDispatchGateRows = @($rows | Where-Object { $_.SearchDispatch4CE9 -eq '0001' })
$searchDispatchCombatRows = @($rows | Where-Object { $_.SearchDispatchStatus -eq '0003' -and [string]$_.SearchDispatchEnc -ne '' -and [int]$_.SearchDispatchEnc -gt 0 })
$nonzeroRows = @($rows | Where-Object {
  $_.Vm4CE9 -or $_.Vm4CE8 -or $_.Vm4CE5 -or $_.Vm4C00 -or $_.Vm7F79 -or $_.VmC04F -or $_.VmC04E -or
  $_.Probe4CE9 -or $_.Probe4CE8 -or $_.Probe4CE5 -or $_.Probe4C00 -or $_.Probe7F79 -or $_.ProbeC04F -or $_.ProbeC04E -or
  $_.Search4CE9 -or $_.Search4CE8 -or $_.Search4CE5 -or $_.Search4C00 -or $_.Search7F79 -or $_.SearchC04F -or $_.SearchC04E -or
  $_.SearchProbe4CE9 -or $_.SearchProbe4CE8 -or $_.SearchProbe4CE5 -or $_.SearchProbe4C00 -or $_.SearchProbe7F79 -or $_.SearchProbeC04F -or $_.SearchProbeC04E -or
  $_.SearchDispatch4CE9 -or $_.SearchDispatch4CE8 -or $_.SearchDispatch4CE5 -or $_.SearchDispatch4C00 -or $_.SearchDispatch7F79 -or $_.SearchDispatchC04F -or $_.SearchDispatchC04E
})
$matrixSuffix = if ($WithThiefMatrix) { " with GBPS v2 thief matrix=$ThiefSkill" } else { '' }

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK block-51 natural-route host-state provenance scan')
$summary.Add("Areas=$($Areas -join ',')")
$summary.Add("Blocks=$($Blocks -join ',')")
$summary.Add("AllDescriptors=$([bool]$AllDescriptors)")
$summary.Add("ProbeB51Selector=$([bool]$ProbeB51Selector)")
$summary.Add("WithThiefMatrix=$([bool]$WithThiefMatrix)")
if ($WithThiefMatrix) { $summary.Add("ThiefSkill=$ThiefSkill") }
$summary.Add("Routes=$($routes.Count)")
$summary.Add("MissingInvalid=$missing")
$summary.Add("ProbeMissingInvalid=$probeMissing")
$summary.Add("Rows=$($rows.Count)")
$summary.Add("RowsWithTrackedMemory=$($nonzeroRows.Count)")
$summary.Add("RowsWith4CE9Gate=$($gateRows.Count)")
$summary.Add("Descriptor29Rows=$($descriptor29Rows.Count)")
$summary.Add("Descriptor29RowsWith4CE9Gate=$($descriptor29GateRows.Count)")
$summary.Add("ProbeRowsWith4CE9Gate=$($probeGateRows.Count)")
$summary.Add("ProbeRowsWithQueuedCombat=$($probeCombatRows.Count)")
$summary.Add("SearchProbeRowsWith4CE9Gate=$($searchProbeGateRows.Count)")
$summary.Add("SearchProbeRowsWithQueuedCombat=$($searchProbeCombatRows.Count)")
$summary.Add("SearchDispatchCandidates=$($searchDispatchCandidates.Count)")
$summary.Add("SearchDispatchMissingInvalid=$searchDispatchMissing")
$summary.Add("SearchDispatchRowsWith4CE9Gate=$($searchDispatchGateRows.Count)")
$summary.Add("SearchDispatchRowsWithQueuedCombat=$($searchDispatchCombatRows.Count)")
$summary.Add("Result=No natural route in this scan produced the block-51 4CE9=1 gate$matrixSuffix")
if ($gateRows.Count -gt 0) {
  $summary[$summary.Count - 1] = "Result=Natural route(s) produced 4CE9=1; inspect _DOKB51PROV.CSV before promoting a DoK flow$matrixSuffix"
}
if ($ProbeB51Selector -and $probeGateRows.Count -eq 0) {
  $summary.Add('ProbeResult=Re-entering ECL2 block 51 selector 29 from natural vmRun state still did not produce 4CE9=1 without a host seed')
} elseif ($ProbeB51Selector) {
  $summary.Add('ProbeResult=Re-entering ECL2 block 51 selector 29 from natural vmRun state produced 4CE9=1; inspect probe columns before changing GBBOOT')
}
if ($ProbeB51Selector -and $searchProbeGateRows.Count -eq 0) {
  $summary.Add('SearchProbeResult=Re-entering ECL2 block 51 selector 29 from natural SearchLocation state still did not produce 4CE9=1 without a host seed')
} elseif ($ProbeB51Selector) {
  $summary.Add('SearchProbeResult=Re-entering ECL2 block 51 selector 29 from natural SearchLocation state produced 4CE9=1; inspect search-probe columns before changing GBBOOT')
}
if ($ProbeB51Selector -and $searchDispatchCandidates.Count -gt 0 -and $searchDispatchGateRows.Count -eq 0) {
  $summary.Add('SearchDispatchResult=Following natural SearchLocation rows with 7F79=001D through /J 29 still did not produce 4CE9=1 without a host seed')
} elseif ($ProbeB51Selector -and $searchDispatchCandidates.Count -gt 0) {
  $summary.Add('SearchDispatchResult=Following natural SearchLocation rows with 7F79=001D through /J 29 produced 4CE9=1; inspect search-dispatch columns before changing GBBOOT')
}
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)
$rows |
  Sort-Object Area, Block, Descriptor, StartX, StartY, Facing |
  ConvertTo-Csv -NoTypeInformation |
  Set-Content -Path $csvPath -Encoding ASCII

Write-Output ("[B51PROV] routes={0} missingInvalid={1} probeMissing={2} trackedMemoryRows={3} gateRows={4} descriptor29GateRows={5} probeGateRows={6} probeCombatRows={7} searchProbeGateRows={8} searchProbeCombatRows={9} searchDispatchCandidates={10} searchDispatchGateRows={11} searchDispatchCombatRows={12}" -f $routes.Count, $missing, $probeMissing, $nonzeroRows.Count, $gateRows.Count, $descriptor29GateRows.Count, $probeGateRows.Count, $probeCombatRows.Count, $searchProbeGateRows.Count, $searchProbeCombatRows.Count, $searchDispatchCandidates.Count, $searchDispatchGateRows.Count, $searchDispatchCombatRows.Count)
if ($missing -gt 0) {
  throw 'DoK block-51 provenance scan has incomplete route evidence'
}
if ($probeMissing -gt 0) {
  throw 'DoK block-51 provenance probe has incomplete selector evidence'
}
if ($searchDispatchMissing -gt 0) {
  throw 'DoK block-51 SearchLocation dispatch probe has incomplete selector evidence'
}
if ($gateRows.Count -gt 0) {
  Write-Output '[CANDIDATE] natural routes that produced 4CE9=1:'
  $gateRows | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($probeGateRows.Count -gt 0) {
  Write-Output '[CANDIDATE] B51 selector probes from natural vmRun state that produced 4CE9=1:'
  $probeGateRows | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($searchProbeGateRows.Count -gt 0) {
  Write-Output '[CANDIDATE] B51 selector probes from natural SearchLocation state that produced 4CE9=1:'
  $searchProbeGateRows | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($searchDispatchGateRows.Count -gt 0) {
  Write-Output '[CANDIDATE] SearchLocation /J 29 probes from natural 7F79=001D state that produced 4CE9=1:'
  $searchDispatchGateRows | Sort-Object Area, Block, Descriptor, StartX, StartY, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($nonzeroRows.Count -gt 0) {
  Write-Output '[INFO] first tracked-memory rows:'
  $nonzeroRows |
    Select-Object -First 20 Area, Block, Descriptor, StartX, StartY, TargetX, TargetY, Facing, Vm4CE9, Vm4CE8, Vm4CE5, Vm4C00, Vm7F79, VmC04F, VmC04E, Probe4CE9, Probe4CE8, Probe4CE5, Probe4C00, Probe7F79, Search4CE9, Search4CE8, Search4CE5, Search4C00, Search7F79, SearchC04F, SearchC04E, SearchProbe4CE9, SearchProbe4CE8, SearchProbe4CE5, SearchProbe4C00, SearchProbe7F79 |
    Format-Table -AutoSize |
    Out-String -Width 240 |
    Write-Output
}

Write-Output ("RESULT: DoK block-51 provenance scan completed across {0} real GEO-derived routes{1}" -f $routes.Count, $matrixSuffix)
