# GBBOOT deterministic native party creation smoke.
#
# Runs the real native /E front door against a temporary CoK data fixture with
# no SAVE directory. Repeated /R name class requests drive CCPARTY /C through
# GBBOOT, then the boot chain must refresh GBPS from the created GBPR and
# continue through snapshot, exploration, and combat handoff.
param([switch]$GbslContractOnly)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
$run = Join-Path $build 'gbboot-create-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT CoK create flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'KRYNN.CFG',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX',
  'CPIC1.DAX'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT CoK create flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Assert-NativeGbprIdentity([byte[]]$Bytes) {
  if ($Bytes.Length -ne 1246 -or
      [Text.Encoding]::ASCII.GetString($Bytes, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($Bytes, 4) -ne 2 -or
      [BitConverter]::ToUInt16($Bytes, 6) -ne 3 -or
      [BitConverter]::ToUInt16($Bytes, 8) -ne 410 -or
      [BitConverter]::ToUInt16($Bytes, 10) -ne 0 -or
      [BitConverter]::ToUInt16($Bytes, 12) -ne 1 -or
      [BitConverter]::ToUInt16($Bytes, 14) -ne 1) {
    throw 'GBBOOT native-created GBPR identity check found an invalid header'
  }
  for ($i = 0; $i -lt $expected.Count; $i++) {
    $off = 16 + $i * 410
    $record = $off + 1
    $name = [Text.Encoding]::ASCII.GetString($Bytes, $record + 1, $Bytes[$record])
    if ($Bytes[$off] -ne $expected[$i].Slot -or
        $name -ne $expected[$i].Name -or
        $Bytes[$record + 90] -ne $expected[$i].Race -or
        $Bytes[$record + 91] -ne $expected[$i].Class) {
      throw "GBBOOT native-created GBPR identity changed at entry $i"
    }
  }
}

function Assert-GbprCombatWriteback([byte[]]$Before, [byte[]]$After, [byte[]]$Gbcr) {
  Assert-NativeGbprIdentity $After
  if ([Text.Encoding]::ASCII.GetString($Gbcr, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($Gbcr, 4) -ne 2) {
    throw 'GBBOOT persisted /R roster combat did not write a valid GBCR sidecar'
  }
  $count = [BitConverter]::ToUInt16($Gbcr, 10)
  if ($count -ne 3) {
    throw "GBBOOT persisted /R roster combat GBCR count expected 3, got $count"
  }
  $xpShare = 0
  if ([BitConverter]::ToUInt16($Gbcr, 6) -eq 0) {
    $xpShare = [int]([BitConverter]::ToUInt16($Gbcr, 8) / $count)
  }
  for ($i = 0; $i -lt $count; $i++) {
    $record = 16 + ($i * 410) + 1
    $gbcrRecord = 16 + ($i * 6)
    $finalHp = [BitConverter]::ToInt16($Gbcr, $gbcrRecord + 2)
    if ($finalHp -lt 0) { $finalHp = 0 }
    if ($finalHp -gt 255) { $finalHp = 255 }
    if ($After[$record + 407] -ne $finalHp) {
      throw "GBBOOT persisted /R roster combat HP writeback mismatch at entry $i"
    }
    if ($After[$record + 98] -ne $Before[$record + 98]) {
      throw "GBBOOT combat writeback changed maximum HP at entry $i"
    }
    $beforeXp = [BitConverter]::ToUInt16($Before, $record + 304)
    $afterXp = [BitConverter]::ToUInt16($After, $record + 304)
    $expectedXp = $beforeXp + $xpShare
    if ($expectedXp -gt 65535) { $expectedXp = 65535 }
    if ($afterXp -ne $expectedXp) {
      throw "GBBOOT persisted /R roster combat XP writeback mismatch at entry $i"
    }
  }
}

function ConvertTo-DaxLiteralRle([byte[]]$Raw) {
  $compressed = [System.Collections.Generic.List[byte]]::new()
  $offset = 0
  while ($offset -lt $Raw.Length) {
    $chunk = [Math]::Min(128, $Raw.Length - $offset)
    $compressed.Add([byte]($chunk - 1))
    for ($i = 0; $i -lt $chunk; $i++) {
      $compressed.Add($Raw[$offset + $i])
    }
    $offset += $chunk
  }
  return $compressed.ToArray()
}

function Write-SyntheticDaxBlocks([string]$Path, [hashtable[]]$Blocks) {
  $entries = @()
  $dataSize = 0
  foreach ($block in $Blocks) {
    [byte[]]$raw = $block.Raw
    [byte[]]$comp = ConvertTo-DaxLiteralRle $raw
    $entries += ,@{
      Id = [int]$block.Id
      Offset = $dataSize
      RawSize = $raw.Length
      Comp = $comp
    }
    $dataSize += $comp.Length
  }

  $tocBytes = 9 * $entries.Count
  [byte[]]$bytes = [byte[]]::new(2 + $tocBytes + $dataSize)
  [BitConverter]::GetBytes([uint16]$tocBytes).CopyTo($bytes, 0)
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    $entryBase = 2 + ($i * 9)
    $bytes[$entryBase] = [byte]$entry.Id
    [BitConverter]::GetBytes([uint32]$entry.Offset).CopyTo($bytes, $entryBase + 1)
    [BitConverter]::GetBytes([uint16]$entry.RawSize).CopyTo($bytes, $entryBase + 5)
    [BitConverter]::GetBytes([uint16]$entry.Comp.Length).CopyTo($bytes, $entryBase + 7)
    [Array]::Copy($entry.Comp, 0, $bytes, 2 + $tocBytes + $entry.Offset, $entry.Comp.Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticDamageEclDax([string]$Path, [byte]$BlockId = 34, [byte]$GeoBlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x2E,0x00,0xE0,0x00,0x01,0x00,0x02,0x00,0x01,0x00,0x04,
    0x00
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticSelectedDamageEclDax([string]$Path, [byte]$BlockId = 34, [byte]$GeoBlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x0A,0x00,0x02,
    0x2E,0x00,0x80,0x00,0x01,0x00,0x02,0x00,0x01,0x00,0x80,
    0x00
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticInvalidSelectedDamageEclDax([string]$Path, [byte]$BlockId = 34, [byte]$GeoBlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x0A,0x00,0x02,
    0x0A,0x00,0x09,
    0x2E,0x00,0x80,0x00,0x01,0x00,0x02,0x00,0x01,0x00,0x80,
    0x00
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticCombatEclDax([string]$Path, [byte]$BlockId = 34, [byte]$GeoBlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function ConvertTo-EclPackedString([string]$Value) {
  $sixBit = [System.Collections.Generic.List[int]]::new()
  foreach ($ch in $Value.ToCharArray()) {
    $code = [int][char]$ch
    if ($code -ge 65 -and $code -le 90) {
      $sixBit.Add($code - 64)
    } elseif ($code -ge 32 -and $code -le 63) {
      $sixBit.Add($code)
    } else {
      throw "Unsupported synthetic ECL string character: $ch"
    }
  }
  $sixBit.Add(0)
  $result = [System.Collections.Generic.List[byte]]::new()
  $acc = 0
  $bits = 0
  foreach ($part in $sixBit) {
    $acc = ($acc -shl 6) -bor $part
    $bits += 6
    while ($bits -ge 8) {
      $bits -= 8
      $result.Add([byte](($acc -shr $bits) -band 0xFF))
    }
  }
  if ($bits -gt 0) { $result.Add([byte](($acc -shl (8 - $bits)) -band 0xFF)) }
  return $result.ToArray()
}

function Add-EclPrint([System.Collections.Generic.List[byte]]$Code, [string]$Value) {
  [byte[]]$packed = ConvertTo-EclPackedString $Value
  $Code.Add(0x11)
  $Code.Add(0x80)
  $Code.Add([byte]$packed.Length)
  $Code.AddRange($packed)
}

function Write-SyntheticDamageCombatEclDax([string]$Path, [byte]$BlockId = 34, [byte]$GeoBlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x2E,0x00,0xE0,0x00,0x01,0x00,0x02,0x00,0x01,0x00,0x04,
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticSolidCombatGeoDax([string]$Path, [byte]$BlockId = 34) {
  [byte[]]$raw = [byte[]]::new(1026)
  [BitConverter]::GetBytes([uint16]1024).CopyTo($raw, 0)
  $plane0 = 2
  $plane1 = 2 + 256
  $solidCells = @(
    @(3, 4), @(4, 4), @(5, 4),
    @(3, 5),          @(5, 5),
    @(3, 6),          @(5, 6),
    @(3, 7), @(4, 7), @(5, 7)
  )
  foreach ($cell in $solidCells) {
    $i = ($cell[1] * 16) + $cell[0]
    $raw[$plane0 + $i] = 0x11
    $raw[$plane1 + $i] = 0x11
  }
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $raw })
}

# GBBOOT must consume CCFLOW's complete stream after the 64-record GBSX tail
# fills. The control and saturated scripts differ only by 63 CLEAR_BOX
# effects; PRINT before and after DAMAGE must render the same frame in both.
function Write-GbslContractEcl([string]$Path, [int]$Clears, [switch]$NoDamage) {
  $code = [System.Collections.Generic.List[byte]]::new()
  $code.AddRange([byte[]]::new(22))
  $code.AddRange([byte[]]@(0x21,0,34,0,2,0,255)) # LOAD_FILES
  if (-not $NoDamage) {
    for ($i = 0; $i -lt $Clears; $i++) { $code.Add(0x3D) } # CLEAR_BOX before either PRINT
    Add-EclPrint $code 'BEFORE'
    $code.AddRange([byte[]]@(0x2E,0,0xE0,0,1,0,2,0,1,0,4)) # automatic-party 1d2+1 = 3
    Add-EclPrint $code 'AFTER'
  } else {
    Add-EclPrint $code 'AFTER'
  }
  $code.Add(0) # EXIT
  Write-SyntheticDaxBlocks $Path @(@{ Id = 34; Raw = $code.ToArray() })
}

function New-GbslContractStage([string]$Name) {
  $stage = Join-Path $build $Name
  $stageFull = [IO.Path]::GetFullPath($stage)
  $buildFull = [IO.Path]::GetFullPath($build).TrimEnd('\') + [IO.Path]::DirectorySeparatorChar
  if (-not $stageFull.StartsWith($buildFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'GBSL fixture cleanup escaped the native build directory'
  }
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force (Join-Path $stage 'SAVE') | Out-Null
  foreach ($name in @('KRYNN.CFG','GEO1.DAX','WALLDEF1.DAX','8X8D1.DAX')) {
    Copy-Item -LiteralPath (Join-Path $game $name) -Destination (Join-Path $stage $name) -Force
  }
  $sources = @()
  for ($i = 1; $i -le 6; $i++) {
    $source = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$i.SAV"))
    if ($source.Length -ne 409) { throw "GBSL fixture requires a 409-byte source save in slot $i" }
    $source[98] = 60
    $source[407] = 60
    $source[392] = 0
    $source[393] = 1
    $sources += ,$source
    [IO.File]::WriteAllBytes((Join-Path $stage "SAVE\CHRDATA$i.SAV"), $source)
  }
  return @{ Path = $stage; Sources = $sources }
}

function Invoke-GbslContractBoot([string]$DataPath, [string]$Name, [switch]$KeepStaleGbsl) {
  $confPath = Join-Path $build "_$Name.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$DataPath"
D:
C:\GBBOOT /E /X /B 34 /C P > C:\$Name.TXT
exit
"@ | Set-Content $confPath -Encoding ASCII
  foreach ($file in @('_GBPARTY.GBP','_GBSEED.BIN','_GBECL.BIN','_GBECL.TXT','_GBVIEW.RAW',"$Name.TXT")) {
    Remove-Item -LiteralPath (Join-Path $build $file) -Force -ErrorAction SilentlyContinue
  }
  if (-not $KeepStaleGbsl) {
    Remove-Item -LiteralPath (Join-Path $build '_GBECL.GBS') -Force -ErrorAction SilentlyContinue
  }
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $confPath -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-DosBoxSmoke -Process $p
    throw "$Name GBBOOT GBSL contract timed out"
  }
  $log = Get-Content -LiteralPath (Join-Path $build "$Name.TXT") -Raw
  if ($log -like '*native preview failed*') { throw "$Name GBBOOT preview failed" }
  $raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
  if ($raw.Length -ne 64772 -or [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) { throw "$Name invalid CCFP 320x200 frame" }
  return @{ Raw = $raw; Party = [IO.File]::ReadAllBytes((Join-Path $build '_GBPARTY.GBP'));
    Effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN')) }
}

function Assert-GbslContractParty([hashtable]$Stage, [byte[]]$Party, [int]$Damage, [string]$Label) {
  if ($Party.Length -ne 2476 -or [Text.Encoding]::ASCII.GetString($Party,0,4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($Party,6) -ne 6 -or [BitConverter]::ToUInt16($Party,8) -ne 410) {
    throw "$Label invalid source-backed GBPR"
  }
  for ($i = 0; $i -lt 6; $i++) {
    if ($Party[16 + $i*410] -ne $i+1) { throw "$Label slot $($i+1) is not source-backed" }
    $source = [IO.File]::ReadAllBytes((Join-Path $Stage.Path "SAVE\CHRDATA$($i+1).SAV"))
    for ($j = 0; $j -lt 409; $j++) {
      $want = if ($j -eq 407) { [byte]($Stage.Sources[$i][407] - $Damage) } else { $Stage.Sources[$i][$j] }
      if ($source[$j] -ne $want -or $Party[17 + $i*410 + $j] -ne $want) {
        throw "$Label slot $($i+1) byte ${j}: source=$($source[$j]) roster=$($Party[17 + $i*410 + $j]) expected=$want"
      }
    }
  }
}

function Assert-GbslRecord([byte[]]$Bytes, [int]$Index, [int]$Opcode, [string]$Narration = '') {
  $offset = 8 + $Index*54
  $argc = if ($Opcode -eq 0x3D) { 0 } elseif ($Opcode -eq 0x11) { 1 } else { 7 }
  if ([BitConverter]::ToUInt16($Bytes,$offset) -ne $Opcode -or
      [BitConverter]::ToUInt16($Bytes,$offset+2) -ne $argc) {
    throw "GBSL event $($Index+1) expected opcode $Opcode"
  }
  $textLength = [BitConverter]::ToUInt16($Bytes,$offset+20)
  $textValue = [Text.Encoding]::ASCII.GetString($Bytes,$offset+22,$textLength)
  if ($textValue -ne $Narration) { throw "GBSL event $($Index+1) narration mismatch" }
  if ($Opcode -eq 0x3D) {
    for ($j = 4; $j -lt 54; $j++) {
      if ($Bytes[$offset+$j] -ne 0) { throw "GBSL CLEAR_BOX event $($Index+1) carried unexpected payload" }
    }
  }
}

function Assert-GbefContract([byte[]]$Bytes, [int]$Count, [string]$Label, [switch]$Sidecar) {
  $wantFlags = if ($Sidecar) { 0x0121 } else { 0x0021 }
  if ($Bytes.Length -ne 5750 -or [Text.Encoding]::ASCII.GetString($Bytes,0,4) -ne 'GBEF' -or
      [BitConverter]::ToUInt16($Bytes,4) -ne 9 -or
      ([BitConverter]::ToUInt16($Bytes,6) -band 0x0121) -ne $wantFlags -or
      [BitConverter]::ToUInt16($Bytes,8) -ne 0 -or
      [BitConverter]::ToUInt16($Bytes,10) -ne 34 -or
      [Text.Encoding]::ASCII.GetString($Bytes,2246,4) -ne 'GBSX' -or
      [BitConverter]::ToUInt16($Bytes,2250) -ne $Count) {
    throw "$Label invalid terminal GBEF status, GEO, or event count"
  }
}

function Assert-GbefEvent([byte[]]$Bytes, [int]$Index, [int]$Opcode, [string]$Narration = '') {
  $argc = if ($Opcode -eq 0x11) { 1 } else { 7 }
  if ([BitConverter]::ToUInt16($Bytes,2252+$Index*20) -ne $Opcode -or
      [BitConverter]::ToUInt16($Bytes,2254+$Index*20) -ne $argc) {
    throw "Terminal GBEF event $($Index+1) expected opcode $Opcode"
  }
  $textOffset = 3532 + $Index*34
  $textLength = [BitConverter]::ToUInt16($Bytes,$textOffset)
  $textValue = [Text.Encoding]::ASCII.GetString($Bytes,$textOffset+2,$textLength)
  if ($textValue -ne $Narration) { throw "Terminal GBEF event $($Index+1) narration mismatch" }
}

$gbslControl = New-GbslContractStage 'gbboot-gbsl-control'
$gbslSaturated = New-GbslContractStage 'gbboot-gbsl-saturated'
Write-GbslContractEcl (Join-Path $gbslControl.Path 'ECL1.DAX') 0
Write-GbslContractEcl (Join-Path $gbslSaturated.Path 'ECL1.DAX') 63
$gbslControlResult = Invoke-GbslContractBoot $gbslControl.Path 'GBSLCTRL'
Assert-GbslContractParty $gbslControl $gbslControlResult.Party 3 'GBSL compact control'
Assert-GbefContract $gbslControlResult.Effect 3 'GBSL compact control'
Assert-GbefEvent $gbslControlResult.Effect 0 0x11 'BEFORE'
Assert-GbefEvent $gbslControlResult.Effect 1 0x2E
Assert-GbefEvent $gbslControlResult.Effect 2 0x11 'AFTER'
if (Test-Path -LiteralPath (Join-Path $build '_GBECL.GBS')) { throw 'Compact control unexpectedly published GBSL' }
$gbslSaturatedResult = Invoke-GbslContractBoot $gbslSaturated.Path 'GBSLSAT'
Assert-GbslContractParty $gbslSaturated $gbslSaturatedResult.Party 3 'GBSL saturated'
Assert-GbefContract $gbslSaturatedResult.Effect 2 'GBSL saturated' -Sidecar
Assert-GbefEvent $gbslSaturatedResult.Effect 0 0x2E
Assert-GbefEvent $gbslSaturatedResult.Effect 1 0x11 'AFTER'
$gbslPath = Join-Path $build '_GBECL.GBS'
$gbslBytes = [IO.File]::ReadAllBytes($gbslPath)
if ($gbslBytes.Length -ne 3572 -or [Text.Encoding]::ASCII.GetString($gbslBytes,0,4) -ne 'GBSL' -or
    [BitConverter]::ToUInt16($gbslBytes,4) -ne 1 -or [BitConverter]::ToUInt16($gbslBytes,6) -ne 66) {
  throw 'GBBOOT/CCFLOW did not publish the complete 66-record GBSL stream'
}
for ($i = 0; $i -lt 63; $i++) { Assert-GbslRecord $gbslBytes $i 0x3D }
Assert-GbslRecord $gbslBytes 63 0x11 'BEFORE'
Assert-GbslRecord $gbslBytes 64 0x2E
Assert-GbslRecord $gbslBytes 65 0x11 'AFTER'
$damageOffset = 8 + 64*54
if ([BitConverter]::ToUInt16($gbslBytes,$damageOffset+2) -ne 7 -or
    [BitConverter]::ToUInt16($gbslBytes,$damageOffset+4) -ne 0xE0 -or
    [BitConverter]::ToUInt16($gbslBytes,$damageOffset+6) -ne 1 -or
    [BitConverter]::ToUInt16($gbslBytes,$damageOffset+8) -ne 2 -or
    [BitConverter]::ToUInt16($gbslBytes,$damageOffset+10) -ne 1) {
  throw 'GBSL event 65 lost the supported automatic-party DAMAGE operands'
}
$compactDamageOffset = 2252 + 20
for ($j = 0; $j -lt 20; $j++) {
  if ($gbslBytes[$damageOffset+$j] -ne $gbslControlResult.Effect[$compactDamageOffset+$j] -or
      $gbslSaturatedResult.Effect[2252+$j] -ne $gbslControlResult.Effect[$compactDamageOffset+$j]) {
    throw "GBSL event 65 or terminal DAMAGE differs from compact control at byte $j"
  }
}
if (([BitConverter]::ToUInt16($gbslSaturatedResult.Effect,6) -band 0x0100) -eq 0) {
  throw 'GBBOOT terminal effect did not flag the complete GBSL sibling'
}
if (-not [Linq.Enumerable]::SequenceEqual($gbslControlResult.Raw,$gbslSaturatedResult.Raw)) {
  throw 'GBBOOT saturated CCFP frame differs from compact BEFORE/DAMAGE/AFTER control'
}
Write-GbslContractEcl (Join-Path $gbslSaturated.Path 'ECL1.DAX') 0 -NoDamage
$gbslColdResult = Invoke-GbslContractBoot $gbslSaturated.Path 'GBSLCOLD' -KeepStaleGbsl
Assert-GbslContractParty $gbslSaturated $gbslColdResult.Party 3 'GBSL cold no-DAMAGE'
Assert-GbefContract $gbslColdResult.Effect 1 'GBSL cold no-DAMAGE'
Assert-GbefEvent $gbslColdResult.Effect 0 0x11 'AFTER'
if (Test-Path -LiteralPath $gbslPath) { throw 'Cold no-DAMAGE flow retained stale GBSL sibling' }
if ([Linq.Enumerable]::SequenceEqual($gbslSaturatedResult.Raw,$gbslColdResult.Raw)) {
  throw 'Cold no-DAMAGE CCFP frame reused stale BEFORE/AFTER narration'
}
Write-Output 'PASS: GBBOOT 66-event GBSL production contract, source-backed DAMAGE and cold stale cleanup'
if ($GbslContractOnly) { exit 0 }

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @(
  'KRYNN.CFG',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX',
  'CPIC1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbboot_create_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /R BOOT_CLERIC C /R BOOT_FIGHTER F /R BOOT_MAGE M > C:\GBCREATE.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'GBCREATE.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT /R create smoke timed out'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT /R did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 1246 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT /R created an invalid GBPR header'
}

$expected = @(
  @{ Slot = 0x80; Name = 'BOOT_CLERIC'; Race = 6; Class = 0 },
  @{ Slot = 0x81; Name = 'BOOT_FIGHTER'; Race = 6; Class = 2 },
  @{ Slot = 0x82; Name = 'BOOT_MAGE'; Race = 6; Class = 5 }
)
for ($i = 0; $i -lt $expected.Count; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $expected[$i].Slot) {
    throw "GBBOOT /R created the wrong native slot at entry $i"
  }
  $record = $off + 1
  $name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
  if ($name -ne $expected[$i].Name -or $gbpr[$record + 90] -ne $expected[$i].Race -or
      $gbpr[$record + 91] -ne $expected[$i].Class) {
    throw "GBBOOT /R created the wrong CoK native character at entry $i"
  }
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT /R did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -lt 1 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 3) {
  throw 'GBBOOT /R did not refresh GBPS from the created roster'
}

$raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'GBBOOT /R did not continue to a 320x200 native snapshot'
}

$beforeStep = [byte[]]$gbpr.Clone()
$stepConf = Join-Path $build '_gbboot_create_step_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 > C:\GBCSTEP.TXT
exit
"@ | Set-Content $stepConf -Encoding ASCII

# Re-open the no-save fixture without /R. CCPARTY must preserve the native
# high-bit GBPR entries, refresh GBPS from them, and let the first-person loop
# take one bounded step into the real CoK SearchLocation dialogue.
Set-Session 1 7 2
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'GBCSTEP.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $stepConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT persisted /R roster step smoke timed out'
}

$afterStep = [IO.File]::ReadAllBytes($gbprPath)
if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$beforeStep, [byte[]]$afterStep)) {
  throw 'GBBOOT did not preserve the native-created GBPR across the step launch'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ([BitConverter]::ToUInt16($session, 6) -ne 2 -or
    [BitConverter]::ToUInt16($session, 8) -ne 7 -or
    [BitConverter]::ToUInt16($step, 6) -ne 140 -or
    $effect -notlike '*PILES OF SKELETONS FILL THE ROOM*' -or
    $effect -notlike '*key=4C54 value=0001*') {
  throw 'GBBOOT persisted /R roster did not continue into persistent exploration'
}

$beforeCombat = [IO.File]::ReadAllBytes($gbprPath)
Set-Session 1 1 0
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBCSTEP.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $stepConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT persisted /R roster combat smoke timed out'
}

$afterCombat = [IO.File]::ReadAllBytes($gbprPath)

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$trace = Get-Content (Join-Path $build '_GBCOMB.TRC')
$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
$combatRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBCOMB.RAW'))
$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
Assert-GbprCombatWriteback $beforeCombat $afterCombat $gbcr
if ([BitConverter]::ToUInt16($session, 6) -ne 1 -or
    [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($step, 6) -ne 129 -or
    -not ($trace -match ' p2 ') -or
    $outcome -notin @('party','enemy','draw') -or
    $resume -notlike '*GBRS*' -or
    [BitConverter]::ToUInt16($combatRaw, 0) -ne 320 -or
    [BitConverter]::ToUInt16($combatRaw, 2) -ne 200) {
  throw 'GBBOOT persisted /R roster did not continue through combat/resume'
}

$combatWallRun = Join-Path $build 'gbboot-create-combat-wall-test'
if (Test-Path $combatWallRun) { Remove-Item -Recurse -Force $combatWallRun }
New-Item -ItemType Directory -Force $combatWallRun | Out-Null
foreach ($name in @(
  'KRYNN.CFG',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $combatWallRun $name) -Force
}
Write-SyntheticCombatEclDax (Join-Path $combatWallRun 'ECL1.DAX') 34 34
Write-SyntheticSolidCombatGeoDax (Join-Path $combatWallRun 'GEO1.DAX') 34

$combatWallConf = Join-Path $build '_gbboot_create_combat_wall_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$combatWallRun"
D:
C:\GBBOOT /E /X /B 34 /C P > C:\GBCWALL.TXT
exit
"@ | Set-Content $combatWallConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBCWALL.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatWallConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Gen1 combat WGRD terrain smoke timed out'
}

$wallBytes = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wallBytes.Length -lt (6 + (10 * 16 * 4)) -or
    [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne 'WGRD' -or
    $wallBytes[4] -ne 16 -or
    $wallBytes[5] -ne 16) {
  throw 'GBBOOT Gen1 combat WGRD terrain smoke did not bake a valid WGRD sidecar'
}
$solidOff = 6 + (((5 * 16) + 3) * 4)
if ($wallBytes[$solidOff] -eq 0 -or
    $wallBytes[$solidOff + 1] -eq 0 -or
    $wallBytes[$solidOff + 2] -eq 0 -or
    $wallBytes[$solidOff + 3] -eq 0) {
  throw 'GBBOOT Gen1 combat WGRD terrain smoke did not preserve the synthetic solid blocker cell'
}
$wallTrace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
$wallOutcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if (-not ($wallTrace -contains '1 party-flee - blocked - - - - - -') -or
    $wallOutcome.Length -eq 0) {
  throw 'GBBOOT Gen1 combat WGRD terrain smoke did not pass /W into CCCOMBAT'
}

# DAMAGE must be applied before CCCOMBAT imports the roster, even when the same
# source batch yields COMBAT.  Paired runs use the same party, command tape,
# encounter and RNG.  The only source difference is the fixed 1d2+1 automatic
# DAMAGE, so the completed route must retain exactly three fewer HP per member;
# a second application after cold resume would make the delta six.
$damageCombatControlRun = Join-Path $build 'gbboot-create-damage-combat-control'
$damageCombatRun = Join-Path $build 'gbboot-create-damage-combat-test'
foreach ($path in @($damageCombatControlRun, $damageCombatRun)) {
  if (Test-Path $path) { Remove-Item -Recurse -Force $path }
  New-Item -ItemType Directory -Force $path | Out-Null
  foreach ($name in @('KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX')) {
    Copy-Item (Join-Path $game $name) (Join-Path $path $name) -Force
  }
}
Write-SyntheticCombatEclDax (Join-Path $damageCombatControlRun 'ECL1.DAX') 34 34
Write-SyntheticDamageCombatEclDax (Join-Path $damageCombatRun 'ECL1.DAX') 34 34
$damageCombatSeed = [byte[]]$gbpr.Clone()
for ($i = 0; $i -lt 3; $i++) {
  $record = 16 + ($i * 410) + 1
  $damageCombatSeed[$record + 98] = 60
  $damageCombatSeed[$record + 407] = 60
}

function Invoke-DamageCombatBoot([string]$DataPath, [string]$LogName) {
  $conf = Join-Path $build ("_" + $LogName + ".conf")
  @"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$DataPath"
D:
C:\GBBOOT /E /X /B 34 /C P > C:\$LogName.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  Remove-Item (Join-Path $build '_GBPARTY.GBP'),
    (Join-Path $build '_GBSEED.BIN'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBRES.BIN'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build "$LogName.TXT") -Force -ErrorAction SilentlyContinue
  [IO.File]::WriteAllBytes($gbprPath, $damageCombatSeed)
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-Process -Id $p.Id -Force
    throw "GBBOOT DAMAGE-to-COMBAT $LogName smoke timed out"
  }
  return [IO.File]::ReadAllBytes($gbprPath)
}

$damageCombatControl = Invoke-DamageCombatBoot $damageCombatControlRun 'GBCDMGCTRL'
$damageCombatActual = Invoke-DamageCombatBoot $damageCombatRun 'GBCDMGCOMB'
for ($i = 0; $i -lt 3; $i++) {
  $record = 16 + ($i * 410) + 1
  $controlHp = $damageCombatControl[$record + 407]
  $actualHp = $damageCombatActual[$record + 407]
  if (($controlHp - $actualHp) -ne 3) {
    throw "GBBOOT DAMAGE-to-COMBAT HP mismatch at entry ${i}: control=$controlHp damaged=$actualHp (expected delta 3 exactly once)"
  }
}
Write-Output 'PASS: source-ordered fixed DAMAGE reaches combat import exactly once'

$damageRun = Join-Path $build 'gbboot-create-damage-test'
if (Test-Path $damageRun) { Remove-Item -Recurse -Force $damageRun }
New-Item -ItemType Directory -Force $damageRun | Out-Null
foreach ($name in @(
  'KRYNN.CFG',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $damageRun $name) -Force
}
Write-SyntheticDamageEclDax (Join-Path $damageRun 'ECL1.DAX') 34 34

$damageConf = Join-Path $build '_gbboot_create_damage_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$damageRun"
D:
C:\GBBOOT /E /X /B 34 /R DMG_CLERIC C /R DMG_FIGHTER F /R DMG_MAGE M > C:\GBCDAMAGE.TXT
exit
"@ | Set-Content $damageConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'GBCDAMAGE.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $damageConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT /R noncombat DAMAGE writeback smoke timed out'
}

$damageGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ([Text.Encoding]::ASCII.GetString($damageGbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($damageGbpr, 6) -ne 3) {
  throw 'GBBOOT /R noncombat DAMAGE smoke produced an invalid GBPR'
}
$damageExpectedHp = @(5, 7, 1)
for ($i = 0; $i -lt $damageExpectedHp.Count; $i++) {
  $record = 16 + ($i * 410) + 1
  if ($damageGbpr[$record + 407] -ne $damageExpectedHp[$i]) {
    throw "GBBOOT noncombat DAMAGE HP writeback mismatch at entry $i"
  }
}
$damageEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($damageEffect -notlike '*GBLF operands=0022 0002 00FF*' -or
    $damageEffect -notlike '*#00 OP=2E DAMAGE*DAMAGE=dice:0001D0002+0001*policy:automatic-party*') {
  throw 'GBBOOT noncombat DAMAGE smoke did not preserve the expected GBSX damage event'
}
$damageRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($damageRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($damageRaw, 2) -ne 200) {
  throw 'GBBOOT noncombat DAMAGE smoke did not continue to a 320x200 native snapshot'
}

$selectedDamageRun = Join-Path $build 'gbboot-create-selected-damage-test'
if (Test-Path $selectedDamageRun) { Remove-Item -Recurse -Force $selectedDamageRun }
New-Item -ItemType Directory -Force $selectedDamageRun | Out-Null
foreach ($name in @(
  'KRYNN.CFG',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $selectedDamageRun $name) -Force
}
Write-SyntheticSelectedDamageEclDax (Join-Path $selectedDamageRun 'ECL1.DAX') 34 34

$selectedDamageConf = Join-Path $build '_gbboot_create_selected_damage_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$selectedDamageRun"
D:
C:\GBBOOT /E /X /B 34 /R SEL_CLERIC C /R SEL_FIGHTER F /R SEL_MAGE M > C:\GBCSELD.TXT
exit
"@ | Set-Content $selectedDamageConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'GBCSELD.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $selectedDamageConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT /R selected DAMAGE writeback smoke timed out'
}

$selectedDamageGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ([Text.Encoding]::ASCII.GetString($selectedDamageGbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($selectedDamageGbpr, 6) -ne 3) {
  throw 'GBBOOT /R selected DAMAGE smoke produced an invalid GBPR'
}
$selectedDamageExpectedHp = @(8, 7, 4)
for ($i = 0; $i -lt $selectedDamageExpectedHp.Count; $i++) {
  $record = 16 + ($i * 410) + 1
  if ($selectedDamageGbpr[$record + 407] -ne $selectedDamageExpectedHp[$i]) {
    throw "GBBOOT selected DAMAGE HP writeback mismatch at entry $i"
  }
}
$selectedDamageEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($selectedDamageEffect -notlike '*#00 OP=2E DAMAGE ARGC=07 ARGS= 0080 0001 0002 0001 0080 0001 0002*policy:selected-no-save*') {
  throw 'GBBOOT selected DAMAGE smoke did not preserve selected-member context'
}
$selectedDamageRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($selectedDamageRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($selectedDamageRaw, 2) -ne 200) {
  throw 'GBBOOT selected DAMAGE smoke did not continue to a 320x200 native snapshot'
}

$invalidSelectedDamageRun = Join-Path $build 'gbboot-create-invalid-selected-damage-test'
if (Test-Path $invalidSelectedDamageRun) { Remove-Item -Recurse -Force $invalidSelectedDamageRun }
New-Item -ItemType Directory -Force $invalidSelectedDamageRun | Out-Null
foreach ($name in @(
  'KRYNN.CFG',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $invalidSelectedDamageRun $name) -Force
}
Write-SyntheticInvalidSelectedDamageEclDax (Join-Path $invalidSelectedDamageRun 'ECL1.DAX') 34 34

$invalidSelectedDamageConf = Join-Path $build '_gbboot_create_invalid_selected_damage_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$invalidSelectedDamageRun"
D:
C:\GBBOOT /E /X /B 34 /R STALE_CLERIC C /R STALE_FIGHTER F /R STALE_MAGE M > C:\GBCSTALD.TXT
exit
"@ | Set-Content $invalidSelectedDamageConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'GBCSTALD.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $invalidSelectedDamageConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT /R invalid-selected DAMAGE writeback smoke timed out'
}

$invalidSelectedDamageGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ([Text.Encoding]::ASCII.GetString($invalidSelectedDamageGbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($invalidSelectedDamageGbpr, 6) -ne 3) {
  throw 'GBBOOT /R invalid-selected DAMAGE smoke produced an invalid GBPR'
}
$invalidSelectedDamageExpectedHp = @(8, 10, 4)
for ($i = 0; $i -lt $invalidSelectedDamageExpectedHp.Count; $i++) {
  $record = 16 + ($i * 410) + 1
  if ($invalidSelectedDamageGbpr[$record + 407] -ne $invalidSelectedDamageExpectedHp[$i]) {
    throw "GBBOOT invalid-selected DAMAGE HP writeback mismatch at entry $i"
  }
}
$invalidSelectedDamageEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($invalidSelectedDamageEffect -notlike '*#00 OP=2E DAMAGE ARGC=07 ARGS= 0080 0001 0002 0001 0080 0000 0000*') {
  throw 'GBBOOT invalid-selected DAMAGE smoke did not clear stale selected-member context'
}
$invalidSelectedDamageRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($invalidSelectedDamageRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($invalidSelectedDamageRaw, 2) -ne 200) {
  throw 'GBBOOT invalid-selected DAMAGE smoke did not continue to a 320x200 native snapshot'
}

# Start from copied retail saves, including down, dying, dead, and newly down
# members. Rebuild GBPR from the written saves on each pass: no stale roster can
# hide missing source-save condition persistence.
$conditionRun = Join-Path $build 'gbboot-cok-condition-test'
New-Item -ItemType Directory -Force (Join-Path $conditionRun 'SAVE') | Out-Null
foreach ($name in @('KRYNN.CFG', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX', 'ECL1.DAX', 'GEO1.DAX')) {
  Copy-Item -LiteralPath (Join-Path $combatWallRun $name) -Destination (Join-Path $conditionRun $name) -Force
}
$initialStatus = @(4, 5, 6, 0, 0, 0)
$savedStatus = @(4, 5, 6, 4, 4, 4)
$resultCondition = @(1, 1, 2, 1, 1, 1)
$conditionSources = @()
for ($i = 0; $i -lt 6; $i++) {
  $bytes = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$($i + 1).SAV"))
  if ($bytes.Length -ne 409) { throw 'CoK condition fixture requires 409-byte saves' }
  $bytes[392] = $initialStatus[$i]
  $bytes[407] = 0
  $conditionSources += ,$bytes
  [IO.File]::WriteAllBytes((Join-Path $conditionRun "SAVE\CHRDATA$($i + 1).SAV"), $bytes)
}
$conditionConf = Join-Path $build '_gbboot_cok_condition_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$conditionRun"
D:
C:\GBBOOT /E /X /B 34 /C P > C:\COKCOND.TXT
exit
"@ | Set-Content $conditionConf -Encoding ASCII
for ($pass = 1; $pass -le 2; $pass++) {
  foreach ($name in @('_GBPARTY.GBP', '_GBCR.BIN')) {
    Remove-Item -LiteralPath (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
  }
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conditionConf -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-Process -Id $p.Id -Force
    throw "CoK condition save/reload pass $pass timed out"
  }
  $result = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
  $party = [IO.File]::ReadAllBytes($gbprPath)
  if ($result.Length -ne 52 -or [Text.Encoding]::ASCII.GetString($result, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($result, 4) -ne 2 -or [BitConverter]::ToUInt16($result, 10) -ne 6 -or
      $party.Length -ne 2476) { throw "CoK condition pass $pass invalid result/roster" }
  for ($i = 0; $i -lt 6; $i++) {
    if ($result[17 + ($i * 6)] -ne $resultCondition[$i]) {
      throw "CoK condition pass $pass member $i expected GBCR $($resultCondition[$i]), got $($result[17 + ($i * 6)])"
    }
    $source = [IO.File]::ReadAllBytes((Join-Path $conditionRun "SAVE\CHRDATA$($i + 1).SAV"))
    if ($source.Length -ne 409) { throw 'CoK condition writeback changed save length' }
    for ($j = 0; $j -lt 409; $j++) {
      $expectedByte = if ($j -eq 392) { $savedStatus[$i] } else { $conditionSources[$i][$j] }
      if ($source[$j] -ne $expectedByte -or $party[17 + ($i * 410) + $j] -ne $expectedByte) {
        throw "CoK condition pass $pass member $i source/roster byte $j expected $expectedByte, got $($source[$j])/$($party[17 + ($i * 410) + $j])"
      }
    }
  }
}

# A camp action must execute PreCampCheck without moving or executing either
# movement hook or CampInterrupted. Each synthetic entry writes a distinct key.
$campRun = Join-Path $build 'gbboot-camp-test'
if (Test-Path -LiteralPath $campRun) {
  if (-not [IO.Path]::GetFullPath($campRun).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
    throw 'Camp fixture cleanup escaped the native build directory'
  }
  Remove-Item -LiteralPath $campRun -Recurse -Force
}
New-Item -ItemType Directory -Force $campRun | Out-Null
foreach ($name in @('KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  Copy-Item -LiteralPath (Join-Path $game $name) -Destination (Join-Path $campRun $name) -Force
}
[byte[]]$campEcl = [byte[]]::new(64)
[byte[]]$initial = @(0x09,0,11,1,0x10,0x4C, 0x21,0,34,0,2,0,255, 0)
[Array]::Copy($initial, 0, $campEcl, 22, $initial.Length)
for ($i = 0; $i -lt 4; $i++) {
  $offset = 36 + ($i * 7)
  [BitConverter]::GetBytes([uint16](0x7FFE + $offset)).CopyTo($campEcl, 4 + ($i * 4))
  [byte[]]$hook = @(0x09,0,(22 + ($i * 11)),1,(0x11 + $i),0x4C,0)
  [Array]::Copy($hook, 0, $campEcl, $offset, 7)
}
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id = 34; Raw = $campEcl })
$campConf = Join-Path $build '_gbboot_camp_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$campRun"
D:
C:\GBBOOT /E /X /2 /4 /B 34 /R CAMPER F > C:\CAMPOUT.TXT
exit
"@ | Set-Content $campConf -Encoding ASCII
foreach ($name in @('_GBPARTY.GBP', '_GBSTEP.BIN', '_GBECL.TXT', 'CAMPOUT.TXT', 'CCFP.MOV')) {
  Remove-Item -LiteralPath (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
}
Set-Session 1 1 2
$campPose = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $campConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT camp entry timed out'
}
$campOut = Get-Content (Join-Path $build 'CAMPOUT.TXT') -Raw
if ($campOut -notmatch '(?m)^Camp\s*$' -or $campOut -like '*native preview failed*') {
  throw 'GBBOOT did not consume the explorer camp action and enter camp'
}
$campEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($campEffect -notlike '*key=4C10 value=000B*' -or $campEffect -notlike '*key=4C13 value=002C*' -or
    $campEffect -match 'key=4C1[124] ') {
  throw 'Camp did not preserve initial state and run only PreCampCheck'
}
$campAfter = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$nativeCheckpoint = [IO.File]::ReadAllBytes((Join-Path $campRun 'GREYBOX.GBS'))
if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$campPose, [byte[]]$campAfter)) {
  throw 'Entering camp moved or turned the party'
}
$campPacket = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($campPacket.Length -ne 14 -or [BitConverter]::ToUInt16($campPacket,8) -ne 1 -or
    [BitConverter]::ToUInt16($campPacket,10) -ne 1 -or [BitConverter]::ToUInt16($campPacket,12) -ne 2) {
  throw 'Camp yield did not retain the explorer pose'
}

# A halted pre-camp script must not be mistaken for permission to enter camp.
$campEcl[50] = 0xFF
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id = 34; Raw = $campEcl })
Remove-Item -LiteralPath (Join-Path $build 'CAMPOUT.TXT') -Force
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $campConf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT halted pre-camp probe timed out'
}
$haltedCamp = Get-Content (Join-Path $build 'CAMPOUT.TXT') -Raw
if ($haltedCamp -match '(?m)^Camp\s*$' -or $haltedCamp -notlike '*native preview failed*') {
  throw 'GBBOOT opened camp despite a halted PreCampCheck'
}

# CoK retail rest boundaries: 287 ticks do not heal, 288 do; a guaranteed
# first-tick encounter advances only five minutes and dispatches slot 3.
New-Item -ItemType Directory -Force (Join-Path $campRun 'SAVE') | Out-Null
$restStatus = @(0, 4, 5, 6, 0, 1)
foreach ($case in @(
  @{ Name='SHORT'; Ticks=287; Period=0; Chance=0; Heal=0; Minutes=1435 },
  @{ Name='DAY'; Ticks=288; Period=0; Chance=0; Heal=1; Minutes=1440 },
  @{ Name='INT'; Ticks=288; Period=1; Chance=100; Heal=0; Minutes=5 }
)) {
  [byte[]]$restEcl = [byte[]]::new(76)
  [byte[]]$restInitial = @(
    0x09,0,11,1,0x10,0x4C, 0x21,0,34,0,2,0,255,
    0x09,0,$case.Period,1,0xD2,0x7E, 0x09,0,$case.Chance,1,0xD3,0x7E, 0
  )
  [Array]::Copy($restInitial, 0, $restEcl, 22, $restInitial.Length)
  for ($i = 0; $i -lt 4; $i++) {
    $offset = 48 + ($i * 7)
    [BitConverter]::GetBytes([uint16](0x7FFE + $offset)).CopyTo($restEcl, 4 + ($i * 4))
    [byte[]]$hook = @(0x09,0,(22 + ($i * 11)),1,(0x11 + $i),0x4C,0)
    [Array]::Copy($hook, 0, $restEcl, $offset, 7)
  }
  Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$restEcl })
  $restSources = @()
  for ($i = 0; $i -lt 6; $i++) {
    $raw = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$($i + 1).SAV"))
    $raw[392] = $restStatus[$i]
    $raw[393] = 0
    $raw[407] = if ($i -eq 4) { $raw[98] } elseif ($i -in @(0,5)) { 1 } else { 0 }
    $restSources += ,$raw
    [IO.File]::WriteAllBytes((Join-Path $campRun "SAVE\CHRDATA$($i + 1).SAV"), $raw)
  }
  Remove-Item -LiteralPath $gbprPath -Force -ErrorAction SilentlyContinue
  $restConf = Join-Path $build '_gbboot_rest_test.conf'
  $saveArg = if ($case.Name -eq 'SHORT') { '/4' } else { '' }
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$campRun"
D:
C:\GBBOOT /E /2 $($case.Ticks) /B 34 /C P $saveArg > C:\RESTOUT.TXT
exit
"@ | Set-Content $restConf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $restConf -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-Process -Id $p.Id -Force
    throw "Rest $($case.Name) timed out"
  }
  $restOut = Get-Content (Join-Path $build 'RESTOUT.TXT') -Raw
  if ($restOut -like '*native preview failed*' -or $restOut -notlike "*Rest iterations: $([int]($case.Minutes / 5))*") {
    throw "Rest $($case.Name) did not complete the expected bounded iterations"
  }
  $effectFile = if ($case.Name -eq 'INT') { '_GBEVT.BIN' } else { '_GBECL.BIN' }
  $fx = [IO.File]::ReadAllBytes((Join-Path $build $effectFile))
  if ($fx.Length -ne 5750 -or [Text.Encoding]::ASCII.GetString($fx,5732,4) -ne 'GBCL') { throw 'Rest lost the clock state' }
  $minutes = [BitConverter]::ToUInt16($fx,5738) + 10 * [BitConverter]::ToUInt16($fx,5740) +
    60 * [BitConverter]::ToUInt16($fx,5742) + 1440 * [BitConverter]::ToUInt16($fx,5744)
  if ($minutes -ne $case.Minutes) { throw "Rest $($case.Name) clock expected $($case.Minutes), got $minutes" }
  $mem = @{}
  for ($i = 0; $i -lt [BitConverter]::ToUInt16($fx,196); $i++) {
    $mem[[int][BitConverter]::ToUInt16($fx,198 + 2*$i)] = [BitConverter]::ToUInt16($fx,1222 + 2*$i)
  }
  if ($mem[0x4C10] -ne 11 -or $mem[0x4C13] -ne 44 -or $mem.ContainsKey(0x4C11) -or $mem.ContainsKey(0x4C12) -or
      ($mem.ContainsKey(0x4C14) -ne ($case.Name -eq 'INT'))) { throw 'Rest dispatched the wrong ECL hooks' }
  $expectedRng = if ($case.Name -eq 'INT') { [uint32](([uint64]0x1234 * 0x08088405 + 1) -band 0xFFFFFFFFL) } else { [uint32]0x1234 }
  if ([BitConverter]::ToUInt32($fx,126) -ne $expectedRng) { throw 'Rest did not persist the expected RNG advance' }
  $restParty = [IO.File]::ReadAllBytes($gbprPath)
  if ($case.Name -eq 'SHORT') {
    $checkpointSeed = [IO.File]::ReadAllBytes((Join-Path $campRun 'GREYBOX.GBS'))
    $checkpointFx = [byte[]]$fx.Clone()
    $checkpointParty = [byte[]]$restParty.Clone()
    $checkpointEcl = [byte[]]$restEcl.Clone()
  }
  for ($i = 0; $i -lt 6; $i++) {
    $want = [byte[]]$restSources[$i].Clone()
    if ($case.Heal -eq 1 -and $restStatus[$i] -ne 6) {
      $want[407] = [Math]::Min([int]$want[407] + 1, [int]$want[98])
      if ($restStatus[$i] -in @(4,5)) { $want[392] = 0; $want[393] = 1 }
    }
    $saved = [IO.File]::ReadAllBytes((Join-Path $campRun "SAVE\CHRDATA$($i + 1).SAV"))
    for ($j = 0; $j -lt 409; $j++) {
      if ($saved[$j] -ne $want[$j] -or $restParty[17 + $i*410 + $j] -ne $want[$j]) {
        throw "Rest $($case.Name) member $i byte $j changed incorrectly"
      }
    }
  }
}

# Cold-process checkpoint: initial and pre-camp entries now halt if replayed.
# Source saves contain the later INT state. They must not overwrite the checkpoint.
$checkpointEcl[22] = 0xFF
$checkpointEcl[62] = 0xFF
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$checkpointEcl })
$checkpointPath = Join-Path $campRun 'GREYBOX.GBS'
[IO.File]::WriteAllBytes($checkpointPath, $checkpointSeed)
function Invoke-Checkpoint([string]$Arguments) {
  $conf = Join-Path $build '_gbboot_checkpoint_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$campRun"
D:
C:\GBBOOT /5 $Arguments > C:\CHECKOUT.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-Process -Id $p.Id -Force
    throw 'Checkpoint DOS process timed out'
  }
  return Get-Content (Join-Path $build 'CHECKOUT.TXT') -Raw
}
function Assert-BytesEqual([byte[]]$Want, [byte[]]$Got, [string]$Label) {
  if (-not [Linq.Enumerable]::SequenceEqual($Want, $Got)) { throw "$Label bytes differ" }
}
foreach ($name in @('_GBPARTY.GBP', '_GBECL.BIN', '_GBSESS.GBS')) {
  Remove-Item -LiteralPath (Join-Path $build $name) -Force
}
$loaded = Invoke-Checkpoint '/X /4'
if ($loaded -notlike '*Camp restored from GREYBOX.GBS*' -or $loaded -like '*native preview failed*' -or
    $loaded -notlike '*Camp saved to GREYBOX.GBS*') { throw 'Cold checkpoint load/save failed' }
Assert-BytesEqual $checkpointSeed ([IO.File]::ReadAllBytes($checkpointPath)) 'Cold checkpoint round trip'
Assert-BytesEqual $checkpointSeed ([IO.File]::ReadAllBytes((Join-Path $campRun 'GREYBOX.BAK'))) 'Previous checkpoint backup'
Assert-BytesEqual $checkpointFx ([IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))) 'Cold script/clock/RNG'
Assert-BytesEqual $checkpointParty ([IO.File]::ReadAllBytes($gbprPath)) 'Cold party'

$loaded = Invoke-Checkpoint '/2 1 /4'
if ($loaded -like '*native preview failed*' -or $loaded -notlike '*Rest iterations: 1*') { throw 'Cold camp did not continue resting' }
$continued = [IO.File]::ReadAllBytes($checkpointPath)
if ($continued.Length -ne $checkpointSeed.Length -or [BitConverter]::ToUInt16($continued,16) -ne 0 -or
    [BitConverter]::ToUInt16($continued,48+5744) -ne 1) { throw 'Cold camp lost its 287 ticks of healing credit/clock' }
for ($i = 0; $i -lt 6; $i++) {
  $record = 17 + $i*410
  $wantHp = if ($i -eq 3) { 0 } else { [Math]::Min($checkpointParty[$record+407]+1,$checkpointParty[$record+98]) }
  if ($continued[48+5750+$record+407] -ne $wantHp) { throw "Cold camp healing failed for member $i" }
}

# CRC is independently computed using the standard library, including valid-CRC
# malformed sections so the checksum cannot mask missing structural validation.
$checkpointMutator = Join-Path $build '_checkpoint_mutate.py'
@'
import pathlib, struct, sys, zlib
p = pathlib.Path(sys.argv[1]); b = bytearray(p.read_bytes()); kind = sys.argv[2]
changes = {'version':(4,6), 'game':(6,2), 'archive':(8,4), 'pose':(38,65535),
           'ownership':(8274,2),
           'timerflag':(8532,2), 'timercount':(8534,257), 'timersource':(8536,3),
           'geometry':(44,15), 'map':(12,254), 'slot':(48+5750+16,0),
           'party':(48+5750+6,7), 'clock':(48+5738,10), 'credit':(16,288),
           'script':(48+196,513), 'state':(48+8,3)}
if kind in changes:
    off, value = changes[kind]; struct.pack_into('<H', b, off, value)
    b[28:32] = bytes(4); struct.pack_into('<I', b, 28, zlib.crc32(b))
elif kind == 'crc': b[48+126] ^= 1
elif kind == 'short': b = b[:-1]
elif kind == 'long': b += b'!'
elif kind == 'v1':
    b = b[:8274]; struct.pack_into('<H', b, 4, 1); struct.pack_into('<H', b, 24, 8274)
    b[28:32] = bytes(4); struct.pack_into('<I', b, 28, zlib.crc32(b))
elif kind == 'v2':
    b = b[:8532]; struct.pack_into('<H', b, 4, 2); struct.pack_into('<H', b, 24, 8532)
    b[28:32] = bytes(4); struct.pack_into('<I', b, 28, zlib.crc32(b))
elif kind == 'encounter':
    struct.pack_into('<H', b, 18, 1)
    for i in range(struct.unpack_from('<H', b, 48+196)[0]):
        key = struct.unpack_from('<H', b, 48+198+2*i)[0]
        if key in (0x7ed2, 0x7ed3):
            struct.pack_into('<H', b, 48+1222+2*i, 2 if key == 0x7ed2 else 100)
    b[28:32] = bytes(4); struct.pack_into('<I', b, 28, zlib.crc32(b))
p.write_bytes(b)
'@ | Set-Content $checkpointMutator -Encoding ASCII
$activePaths = @('_GBPARTY.GBP','_GBECL.BIN','_GBSESS.GBS') | ForEach-Object { Join-Path $build $_ }
$activeBefore = @($activePaths | ForEach-Object { ,([IO.File]::ReadAllBytes($_)) })
$savePaths = @(1..6 | ForEach-Object { Join-Path $campRun "SAVE\CHRDATA$_.SAV" })
$savesBefore = @($savePaths | ForEach-Object { ,([IO.File]::ReadAllBytes($_)) })
foreach ($kind in @('version','game','archive','pose','geometry','map','slot','party','clock','credit','script','state','ownership','timerflag','timercount','timersource','crc','short','long')) {
  [IO.File]::WriteAllBytes($checkpointPath, $checkpointSeed)
  python $checkpointMutator $checkpointPath $kind
  if ($LASTEXITCODE -ne 0) { throw 'Checkpoint mutation tool failed' }
  $bad = [IO.File]::ReadAllBytes($checkpointPath)
  $rejected = Invoke-Checkpoint '/X'
  if ($rejected -notlike '*native preview failed*' -or $rejected -like '*Camp restored*') { throw "Accepted invalid checkpoint $kind" }
  Assert-BytesEqual $bad ([IO.File]::ReadAllBytes($checkpointPath)) "Rejected $kind checkpoint"
  for ($i=0; $i -lt $activePaths.Count; $i++) {
    Assert-BytesEqual $activeBefore[$i] ([IO.File]::ReadAllBytes($activePaths[$i])) "Rejected $kind active state $i"
  }
  for ($i=0; $i -lt 6; $i++) {
    Assert-BytesEqual $savesBefore[$i] ([IO.File]::ReadAllBytes($savePaths[$i])) "Rejected $kind source save $i"
  }
}
# Carry the partial encounter counter across process restart: period 2, count 1
# must interrupt after one tick, not two, with exactly one RNG draw.
[IO.File]::WriteAllBytes($checkpointPath, $checkpointSeed)
python $checkpointMutator $checkpointPath encounter
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint encounter mutation failed' }
$encounterSaved = [IO.File]::ReadAllBytes($checkpointPath)
$encounterOut = Invoke-Checkpoint '/2 10'
if ($encounterOut -like '*native preview failed*' -or $encounterOut -notlike '*Rest iterations: 1*') {
  throw 'Cold checkpoint lost encounter counter'
}
$encounterFx = [IO.File]::ReadAllBytes((Join-Path $build '_GBEVT.BIN'))
$wantRng = [uint32](([uint64]0x1234 * 0x08088405 + 1) -band 0xFFFFFFFFL)
if ([BitConverter]::ToUInt32($encounterFx,126) -ne $wantRng -or
    [BitConverter]::ToUInt16($encounterFx,5744) -ne 1) { throw 'Cold interrupted camp lost clock/RNG' }
$interruptSeen = $false
for ($i=0; $i -lt [BitConverter]::ToUInt16($encounterFx,196); $i++) {
  if ([BitConverter]::ToUInt16($encounterFx,198+2*$i) -eq 0x4C14 -and
      [BitConverter]::ToUInt16($encounterFx,1222+2*$i) -eq 55) { $interruptSeen = $true }
}
if (-not $interruptSeen) { throw 'Cold rest did not dispatch CampInterrupted' }
Assert-BytesEqual $encounterSaved ([IO.File]::ReadAllBytes($checkpointPath)) 'Rest without save'

# An unwritable temporary destination must preserve the last completed save.
[IO.File]::WriteAllBytes($checkpointPath, $checkpointSeed)
$backupBefore = [IO.File]::ReadAllBytes((Join-Path $campRun 'GREYBOX.BAK'))
$blockedTemp = Join-Path $campRun 'GREYBOX.TMP'
New-Item -ItemType Directory -Path $blockedTemp | Out-Null
try {
  $failedSave = Invoke-Checkpoint '/X /4'
  if ($failedSave -notlike '*native preview failed*' -or $failedSave -like '*Camp saved to*') {
    throw 'Checkpoint save claimed success despite unwritable temporary destination'
  }
  Assert-BytesEqual $checkpointSeed ([IO.File]::ReadAllBytes($checkpointPath)) 'Failed save retained checkpoint'
  Assert-BytesEqual $backupBefore ([IO.File]::ReadAllBytes((Join-Path $campRun 'GREYBOX.BAK'))) 'Failed save retained backup'
} finally { Remove-Item -LiteralPath $blockedTemp -Force }
# Native-created slot 0x80 is also a valid party identity and requires no SAV.
[IO.File]::WriteAllBytes($checkpointPath, $nativeCheckpoint)
$nativeLoaded = Invoke-Checkpoint '/X /4'
if ($nativeLoaded -like '*native preview failed*' -or $nativeLoaded -notlike '*Camp saved to*') {
  throw 'Native-created checkpoint did not reload'
}
Assert-BytesEqual $nativeCheckpoint ([IO.File]::ReadAllBytes($checkpointPath)) 'Native-created checkpoint'
[IO.File]::WriteAllBytes($checkpointPath, $checkpointSeed)
$walkLoaded = Invoke-Checkpoint '/T 1'
if ($walkLoaded -like '*native preview failed*' -or $walkLoaded -notlike '*Camp restored*') {
  throw 'Cold checkpoint failed to leave camp and explore'
}
$walkFx = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
$walkMem = @{}
for ($i=0; $i -lt [BitConverter]::ToUInt16($walkFx,196); $i++) {
  $walkMem[[int][BitConverter]::ToUInt16($walkFx,198+2*$i)] = [BitConverter]::ToUInt16($walkFx,1222+2*$i)
}
if ($walkMem[0x4C10] -ne 11 -or $walkMem[0x4C11] -ne 22 -or $walkMem[0x4C12] -ne 33 -or
    $walkMem[0x4C13] -ne 44 -or $walkMem.ContainsKey(0x4C14)) { throw 'Cold exploration lost saved memory or ran wrong hooks' }
Assert-BytesEqual ([byte[]]$checkpointFx[5732..5749]) ([byte[]]$walkFx[5732..5749]) 'Cold exploration clock'
Write-Output 'PASS: cold camp checkpoint, backup/failure recovery, partial rest/encounter counters, and 19 invalid-state rejections'

# Effect ownership: six members, nine distinct effects each (beyond both old
# seed caps), plus id 255 to exercise the last bit.
$ownedOrder = @(0,1,2,3,4,5)
$ownedRoster = [byte[]]$checkpointParty.Clone()
for ($i=0; $i -lt 6; $i++) {
  [Array]::Copy($checkpointParty,16+410*$ownedOrder[$i],$ownedRoster,16+410*$i,410)
  $sfx = [Collections.Generic.List[byte]]::new()
  foreach ($id in @((1..9 | ForEach-Object { 10*$i+$_ })) + $(if ($i -eq 5) { @(255) } else { @() })) {
    $sfx.AddRange([byte[]]@($id,0,0,255,0,0,0,0,0))
  }
  [IO.File]::WriteAllBytes((Join-Path $campRun "SAVE\CHRDATA$($i+1).SFX"),$sfx.ToArray())
}
[IO.File]::WriteAllBytes($gbprPath,$ownedRoster)
$ownedCode = [Collections.Generic.List[byte]]::new()
$ownedCode.AddRange([byte[]]::new(22))
$ownedCode.AddRange([byte[]]@(0x21,0,34,0,2,0,255))
for ($i=0; $i -lt 6; $i++) {
  for ($j=0; $j -lt 6; $j++) {
    $ownedCode.AddRange([byte[]]@(0x09,0,0,1,($i*6+$j),0x50))
    $ownedCode.AddRange([byte[]]@(0x0A,0,($i+1),0x3F,0,(10*$j+9),0x16,0x09,0,1,1,($i*6+$j),0x50))
  }
}
# CoK CHECKPARTY selector zero must find the union, including the highest effect id.
$ownedCode.AddRange([byte[]]@(0x1E,0,0,0,255,1,0,0x60,1,1,0x60,1,2,0x60,1,3,0x60,0))
$ownedEcl = $ownedCode.ToArray()
for ($i=0; $i -lt 4; $i++) {
  [BitConverter]::GetBytes([uint16](0x7FFE+29)).CopyTo($ownedEcl,4+4*$i)
}
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$ownedEcl })
$ownedConf = Join-Path $build '_gbboot_owned_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$campRun"
D:
C:\GBBOOT /E /2 /4 /B 34 /C P > C:\OWNEDOUT.TXT
exit
"@ | Set-Content $ownedConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $ownedConf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'Owned effect boot timed out' }
if ((Get-Content (Join-Path $build 'OWNEDOUT.TXT') -Raw) -like '*native preview failed*') { throw 'Owned effect boot failed' }
$loadedOwnedRoster = [IO.File]::ReadAllBytes($gbprPath)
for ($i=0; $i -lt 6; $i++) {
  if ($loadedOwnedRoster[16+410*$i] -ne ($i+1)) { throw 'Owned effect fixture did not select expected source slots' }
}
function Assert-OwnedEffectQueries {
  $fx = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
  $mem = @{}
  for ($k=0; $k -lt [BitConverter]::ToUInt16($fx,196); $k++) {
    $mem[[int][BitConverter]::ToUInt16($fx,198+2*$k)] = [BitConverter]::ToUInt16($fx,1222+2*$k)
  }
  for ($i=0; $i -lt 6; $i++) {
    for ($j=0; $j -lt 6; $j++) {
      if ($mem[0x5000+$i*6+$j] -ne [int]($ownedOrder[$i] -eq $j)) {
        throw "Effect ownership leaked/lost at roster member $i source $j"
      }
    }
  }
  if ($mem[0x6003] -ne 1) { throw 'Party-wide query lost effect 255' }
}
Assert-OwnedEffectQueries
$ownedSeed = [IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN'))
if ($ownedSeed.Length -ne 3160 -or [BitConverter]::ToUInt16($ownedSeed,4) -ne 6 -or
    [BitConverter]::ToUInt16($ownedSeed,282) -ne 1 -or $ownedSeed[15] -ne 0) {
  throw 'Owned effects were not passed in the GBPS v6 timer/inventory seed without a global union'
}
$ownedSave = [IO.File]::ReadAllBytes($checkpointPath)
Assert-BytesEqual ([byte[]]$ownedSeed[282..539]) ([byte[]]$ownedSave[8274..8531]) 'Checkpoint effect ownership'
# Local roster members may have their SFX in the cloud path. Preserve their
# ownership there too; this does not claim cloud-only SAV party import.
$ownedCloud = Join-Path $campRun 'cloud_saves\SAVE'
New-Item -ItemType Directory -Force $ownedCloud | Out-Null
for ($i=1; $i -le 6; $i++) {
  Move-Item -LiteralPath (Join-Path $campRun "SAVE\CHRDATA$i.SFX") -Destination (Join-Path $ownedCloud "CHRDATA$i.SFX")
}
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $ownedConf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'Cloud-owned effect boot timed out' }
Assert-OwnedEffectQueries
Assert-BytesEqual ([byte[]]$ownedSeed[282..539]) ([byte[]]([IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN')))[282..539]) 'Cloud-owned seed'
# The fresh process must use saved ownership even when all source SFX disappear.
for ($i=1; $i -le 6; $i++) { Remove-Item -LiteralPath (Join-Path $ownedCloud "CHRDATA$i.SFX") -Force }
$ownedEcl[22] = 0xFF
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$ownedEcl })
$ownedReload = Invoke-Checkpoint '/T 1'
if ($ownedReload -like '*native preview failed*') { throw 'Owned effects did not cold resume' }
Assert-OwnedEffectQueries
Assert-BytesEqual ([byte[]]$ownedSeed[282..539]) ([byte[]]([IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN')))[282..539]) 'Cold-owned seed'
Write-Output 'PASS: CoK effect ownership across six members, 55 ids and cold checkpoint'
[IO.File]::WriteAllBytes($checkpointPath,$nativeCheckpoint)
python $checkpointMutator $checkpointPath v1
if ($LASTEXITCODE -ne 0) { throw 'Legacy checkpoint fixture failed' }
$v1Load = Invoke-Checkpoint '/X'
if ($v1Load -like '*native preview failed*' -or $v1Load -notlike '*Camp restored*') { throw 'Legacy GBCP v1 did not load' }
$ownedEcl[22] = 0x21
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$ownedEcl })
foreach ($size in @(10,9)) {
  # The preceding legacy-checkpoint control restored CAMPER, a native row.
  # These probes import six retail rows. Reset their source-only roster so
  # the no-loss capacity guard cannot reject before SFX validation runs.
  [IO.File]::WriteAllBytes($gbprPath,$ownedRoster)
  $sfx = [byte[]]::new($size)
  $sfx[0] = 42
  [IO.File]::WriteAllBytes((Join-Path $campRun 'SAVE\CHRDATA1.SFX'),$sfx)
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $ownedConf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'SFX length probe timed out' }
  $text = Get-Content (Join-Path $build 'OWNEDOUT.TXT') -Raw
  if (($text -like '*native preview failed*') -ne ($size -eq 10)) { throw "Wrong SFX length verdict for $size bytes" }
  if ($size -eq 10 -and $text -notlike '*native preview failed; gate 6*') {
    throw 'Partial SFX record did not reach the owned-affect validation gate'
  }
  if ($size -eq 9 -and $text -notlike '*Camp saved to*') { throw 'Whole SFX record control did not reach camp save' }
}
# Lossless duration storage and five-minute expiry. The independent Python
# oracle derives expected bytes from the input nodes, not native output fields.
function Invoke-TimerBoot {
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $ownedConf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'Timed effect boot timed out' }
  return Get-Content (Join-Path $build 'OWNEDOUT.TXT') -Raw
}
$timerOracle = Join-Path $build '_timer_oracle.py'
@'
import pathlib, struct, sys, zlib
root, build = map(pathlib.Path, sys.argv[1:3]); mode = sys.argv[3]
def node(i, duration, flags=0xa5, applied=0):
    return struct.pack('<BHBB4s', i, duration, flags, applied, b'\xef\xbe\xad\xde')
original = [
    [node(70,0),node(71,1),node(72,5),node(73,6),node(74,10),node(75,65535),node(70,5)],
    [node(39,5,0xa5,1)], [node(39,5,0xb5,1)], [node(42,5,0xff,1)],
    [node(75,0,0x78,1)], []]
if mode == 'prepare':
    for owner, records in enumerate(original,1):
        (root/f'SAVE/CHRDATA{owner}.SFX').write_bytes(b''.join(records))
        (build/f'_timer_body{owner}.bin').write_bytes((root/f'SAVE/CHRDATA{owner}.SAV').read_bytes())
elif mode in ('0','1','2'):
    ticks = int(mode); cp = (root/'GREYBOX.GBS').read_bytes()
    assert len(cp)>11112 and struct.unpack_from('<H',cp,4)[0]==5
    assert cp[11112:11116]==b'GBIV'
    crc = bytearray(cp); crc[28:32]=bytes(4)
    assert zlib.crc32(crc)==struct.unpack_from('<I',cp,28)[0]
    expected = bytearray(); bits = bytearray(256)
    for owner, records in enumerate(original,1):
        survivors = bytearray()
        for raw in records:
            record = bytearray(raw); duration = struct.unpack_from('<H',record,1)[0]
            if duration and duration <= ticks*5: continue
            if duration: struct.pack_into('<H',record,1,duration-ticks*5)
            survivors += record; expected += bytes([owner])+record
            bits[(owner-1)*32+record[0]//8] |= 1 << (record[0]%8)
        if ticks: assert (root/f'SAVE/CHRDATA{owner}.SFX').read_bytes()==survivors, owner
        body = bytearray((build/f'_timer_body{owner}.bin').read_bytes())
        if ticks and owner==2:
            struct.pack_into('<H',body,96,(struct.unpack_from('<H',body,96)[0]+1)&65535)
        off=5798+17+(owner-1)*410
        assert cp[off:off+409]==body, ('checkpoint body',owner)
        if ticks: assert (root/f'SAVE/CHRDATA{owner}.SAV').read_bytes()==body, ('source body',owner)
    assert cp[8532:8544]==struct.pack('<HH8B',1,len(expected)//10,1,1,1,1,1,1,0,0)
    assert cp[8544:11104]==expected+bytes(2560-len(expected)), 'duration records/padding'
    assert cp[8276:8532]==bits, 'owned bits'
    assert (build/'_GBSEED.BIN').read_bytes()[284:540]==bits, 'live query seed'
elif mode.startswith('blocked'):
    ident, applied, duration = map(int,sys.argv[4:7])
    for owner in range(1,7): (root/f'SAVE/CHRDATA{owner}.SFX').write_bytes(b'')
    (root/'SAVE/CHRDATA1.SFX').write_bytes(node(70,5))
    (root/'SAVE/CHRDATA2.SFX').write_bytes(node(ident,duration,0,applied))
elif mode.startswith('cap'):
    for owner in range(1,7): (root/f'SAVE/CHRDATA{owner}.SFX').write_bytes(b'')
    (root/'SAVE/CHRDATA1.SFX').write_bytes(node(70,0)*int(sys.argv[4]))
elif mode in ('ownerbad','bitsbad','sourcebad'):
    cp=bytearray((root/'GREYBOX.GBS').read_bytes())
    if mode=='ownerbad': cp[8544]=7
    elif mode=='bitsbad': cp[8276]^=1
    else: cp[8536]=0
    cp[28:32]=bytes(4); struct.pack_into('<I',cp,28,zlib.crc32(cp))
    (root/'GREYBOX.GBS').write_bytes(cp)
'@ | Set-Content $timerOracle -Encoding ASCII
python $timerOracle $campRun $build prepare
if ($LASTEXITCODE -ne 0) { throw 'Timer fixture failed' }
$timerBoot = Invoke-TimerBoot
if ($timerBoot -like '*native preview failed*' -or $timerBoot -notlike '*Camp saved to*') { throw 'Timer import failed' }
python $timerOracle $campRun $build 0
if ($LASTEXITCODE -ne 0) { throw 'Lossless timer import failed' }
$timerInitial = [IO.File]::ReadAllBytes($checkpointPath)
foreach ($kind in @('ownerbad','bitsbad','sourcebad')) {
  [IO.File]::WriteAllBytes($checkpointPath,$timerInitial)
  python $timerOracle $campRun $build $kind
  if ($LASTEXITCODE -ne 0) { throw 'Timer malformed fixture failed' }
  $rejected = Invoke-Checkpoint '/X'
  if ($rejected -notlike '*native preview failed*' -or $rejected -like '*Camp restored*') { throw "Accepted invalid timer $kind" }
}
[IO.File]::WriteAllBytes($checkpointPath,$timerInitial)
foreach ($i in 1..6) { Remove-Item -LiteralPath (Join-Path $campRun "SAVE\CHRDATA$i.SFX") -Force }
foreach ($ticks in 1..2) {
  $restored = Invoke-Checkpoint '/2 1 /4'
  if ($restored -like '*native preview failed*' -or $restored -notlike '*Rest iterations: 1*') { throw "Timer rest $ticks failed" }
  python $timerOracle $campRun $build $ticks
  if ($LASTEXITCODE -ne 0) { throw "Timer oracle failed after $ticks ticks" }
}
$timerAfter = [IO.File]::ReadAllBytes($checkpointPath)
$restored = Invoke-Checkpoint '/X /4'
Assert-BytesEqual $timerAfter ([IO.File]::ReadAllBytes($checkpointPath)) 'Timed checkpoint exact round trip'
# Query the cold-restored post-expiry matrix through CCECL, not only the seed
# bytes: every owner checks every fixture id, including absent former effects.
$timerIds = @(70,71,72,73,74,75,39,42)
$queryCode = [Collections.Generic.List[byte]]::new()
$queryCode.AddRange([byte[]]::new(22))
$queryCode.Add(255) # initial entry must not run on cold restore
for ($owner=1; $owner -le 6; $owner++) {
  for ($j=0; $j -lt $timerIds.Count; $j++) {
    $key = ($owner-1)*8+$j
    $queryCode.AddRange([byte[]]@(0x09,0,0,1,$key,0x51))
    $queryCode.AddRange([byte[]]@(0x0A,0,$owner,0x3F,0,$timerIds[$j],0x16,0x09,0,1,1,$key,0x51))
  }
}
$queryCode.Add(0)
$queryEcl = $queryCode.ToArray()
foreach ($i in 0..3) { [BitConverter]::GetBytes([uint16](0x7FFE+23)).CopyTo($queryEcl,4+4*$i) }
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$queryEcl })
$queried = Invoke-Checkpoint '/T 1'
if ($queried -like '*native preview failed*') { throw 'Post-expiry ECL query failed' }
$queryFx = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
$queryMem = @{}
for ($i=0; $i -lt [BitConverter]::ToUInt16($queryFx,196); $i++) {
  $queryMem[[int][BitConverter]::ToUInt16($queryFx,198+2*$i)] = [BitConverter]::ToUInt16($queryFx,1222+2*$i)
}
for ($owner=1; $owner -le 6; $owner++) {
  for ($j=0; $j -lt $timerIds.Count; $j++) {
    $present = ($owner -eq 1 -and $timerIds[$j] -in @(70,75)) -or ($owner -eq 5 -and $timerIds[$j] -eq 75)
    if ($queryMem[0x5100+($owner-1)*8+$j] -ne [int]$present) { throw "Post-expiry ECL owner $owner id $($timerIds[$j])" }
  }
}
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$ownedEcl })
# Legacy ownership is retained but cannot invent duration records from v2.
[IO.File]::WriteAllBytes($checkpointPath,$timerInitial)
python $checkpointMutator $checkpointPath v2
if ($LASTEXITCODE -ne 0) { throw 'Legacy v2 fixture failed' }
$restored = Invoke-Checkpoint '/X /4'
if ($restored -like '*native preview failed*') { throw 'Legacy v2 load failed' }
$legacy = [IO.File]::ReadAllBytes($checkpointPath)
Assert-BytesEqual ([byte[]]$timerInitial[8274..8531]) ([byte[]]$legacy[8274..8531]) 'Legacy ownership'
Assert-BytesEqual ([byte[]]::new(2572)) ([byte[]]$legacy[8532..11103]) 'Legacy unknown durations'

# Unknown applied callbacks and the three extra post-removal callbacks stop
# before the whole due tick, including an earlier owner's otherwise safe expiry.
foreach ($case in @(@(7,1,6),@(12,0,5),@(14,0,5),@(38,0,5))) {
  python $timerOracle $campRun $build blocked $case[0] $case[1] $case[2]
  if ($LASTEXITCODE -ne 0) { throw 'Unsupported effect fixture failed' }
  $timerBoot = Invoke-TimerBoot
  if ($timerBoot -like '*native preview failed*') { throw 'Unsupported effect import failed' }
  $before = [IO.File]::ReadAllBytes($checkpointPath)
  $stopped = Invoke-Checkpoint '/2 2'
  $elapsed = if ($case[2] -eq 6) { 1 } else { 0 }
  if ($stopped -notlike "*unsupported effect expiry $($case[0])*" -or
      $stopped -notlike "*Rest iterations: $elapsed*" -or $stopped -notlike '*native preview failed*') {
    throw 'Unknown effect expiry silently succeeded or advanced too far'
  }
  $active = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
  if ($active[5738] -ne $elapsed*5) { throw 'Unsupported expiry advanced the blocked tick clock' }
  $first = [IO.File]::ReadAllBytes((Join-Path $campRun 'SAVE\CHRDATA1.SFX'))
  if ($first.Length -ne $(if ($elapsed) { 0 } else { 9 })) { throw 'Preflight partly mutated a blocked tick' }
  $second = [IO.File]::ReadAllBytes((Join-Path $campRun 'SAVE\CHRDATA2.SFX'))
  if ([BitConverter]::ToUInt16($second,1) -ne $case[2]-5*$elapsed) { throw 'Blocked timer lost its remainder' }
  Assert-BytesEqual $before ([IO.File]::ReadAllBytes($checkpointPath)) 'Unsupported expiry retained prior checkpoint'
}
foreach ($count in @(256,257)) {
  python $timerOracle $campRun $build cap $count
  if ($LASTEXITCODE -ne 0) { throw 'Timer capacity fixture failed' }
  $result = Invoke-TimerBoot
  if (($result -like '*native preview failed*') -ne ($count -eq 257)) { throw "Timer record capacity verdict $count" }
}
Write-Output 'PASS: lossless timed effects, five-minute boundaries, duplicate ids, haste age-once, slow, cold resume, callback preflight, v2 compatibility and capacity rejection'
# CLOCK must update the VM queries before returning to GBBOOT, then transfer
# complete timer state and age deltas to the host before the camp checkpoint.
python $timerOracle $campRun $build prepare
if ($LASTEXITCODE -ne 0) { throw 'ECL clock host fixture failed' }
$clockCode = [Collections.Generic.List[byte]]::new()
$clockCode.AddRange([byte[]]::new(22))
$clockCode.AddRange([byte[]]@(0x21,0,34,0,2,0,255,0x0A,0,1,3,0,7,0,7,0x34,0,5,0,1))
$clockCode.AddRange([byte[]]@(0x16,9,0,1,1,0,0x54,0x3F,0,71,0x16,9,0,1,1,1,0x54,0))
$clockEcl = $clockCode.ToArray()
foreach ($i in 0..3) { [BitConverter]::GetBytes([uint16](0x7FFE+$clockEcl.Length-1)).CopyTo($clockEcl,4+4*$i) }
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$clockEcl })
$hostClock = Invoke-TimerBoot
if ($hostClock -like '*native preview failed*' -or $hostClock -notlike '*Camp saved to*') { throw 'ECL clock host exchange failed' }
python $timerOracle $campRun $build 1
if ($LASTEXITCODE -ne 0) { throw 'ECL clock host lost timer/age writeback' }
$clockSave = [IO.File]::ReadAllBytes($checkpointPath)
$clockFx = [byte[]]$clockSave[48..5797]
$clockMem = @{}
for ($i=0; $i -lt [BitConverter]::ToUInt16($clockFx,196); $i++) {
  $clockMem[[int][BitConverter]::ToUInt16($clockFx,198+2*$i)] = [BitConverter]::ToUInt16($clockFx,1222+2*$i)
}
if ($clockMem[0x5400] -ne 1 -or $clockMem.ContainsKey(0x5401) -or $clockFx[5738] -ne 5) {
  throw 'ECL CLOCK lost comparison/selection or did not expire before FIND_SPECIAL'
}
$coldClock = Invoke-Checkpoint '/2 1 /4'
if ($coldClock -like '*native preview failed*') { throw 'ECL timer state did not cold continue into rest' }
python $timerOracle $campRun $build 2
if ($LASTEXITCODE -ne 0) { throw 'Cold rest repeated ECL aging or lost remaining duration' }
# A blocked clock is an explicit native failure, never a new camp checkpoint.
python $timerOracle $campRun $build blocked 7 1 6
$clockCode = [Collections.Generic.List[byte]]::new()
$clockCode.AddRange([byte[]]::new(22))
$clockCode.AddRange([byte[]]@(0x21,0,34,0,2,0,255,0x34,0,2,0,1,0x34,0,5,0,1,9,0,1,1,3,0x54,0))
$clockEcl = $clockCode.ToArray()
foreach ($i in 0..3) { [BitConverter]::GetBytes([uint16](0x7FFE+$clockEcl.Length-1)).CopyTo($clockEcl,4+4*$i) }
Write-SyntheticDaxBlocks (Join-Path $campRun 'ECL1.DAX') @(@{ Id=34; Raw=$clockEcl })
$checkpointBeforeHalt = [IO.File]::ReadAllBytes($checkpointPath)
$blockedClock = Invoke-TimerBoot
if ($blockedClock -notlike '*ECL CLOCK stopped: unsupported effect expiry*' -or
    $blockedClock -notlike '*native preview failed*' -or $blockedClock -like '*Camp saved to*') { throw 'Unsupported ECL clock silently continued' }
Assert-BytesEqual $checkpointBeforeHalt ([IO.File]::ReadAllBytes($checkpointPath)) 'ECL timer halt retained camp checkpoint'
$haltFx = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([BitConverter]::ToUInt16($haltFx,8) -ne 4 -or [BitConverter]::ToUInt16($haltFx,5724) -ne 5 -or $haltFx[5738] -ne 2) {
  throw 'Unsupported clock advanced beyond its instruction boundary'
}
$haltSfx = [IO.File]::ReadAllBytes((Join-Path $campRun 'SAVE\CHRDATA2.SFX'))
if ([BitConverter]::ToUInt16($haltSfx,1) -ne 4) { throw 'Unsupported clock lost earlier completed timer changes' }
Write-Output 'PASS: synchronous ECL timer queries, age/source writeback, cold rest continuation and explicit clock halt'
& (Join-Path $PSScriptRoot 'gbboot-learn-test.ps1')
& (Join-Path $PSScriptRoot 'gbboot-lunar-test.ps1')
& (Join-Path $PSScriptRoot 'gbboot-memorization-test.ps1')
& (Join-Path $PSScriptRoot 'ccinv-test.ps1')
& (Join-Path $PSScriptRoot 'ccinv-learning-test.ps1')
& (Join-Path $PSScriptRoot 'ccinv-item-query-test.ps1')
& (Join-Path $PSScriptRoot 'gbboot-item-query-test.ps1')
Write-Output "RESULT: GBBOOT /E repeated /R native create, reload, bounded step, combat, and noncombat all-party/selected DAMAGE writeback flow PASS ($outcome)"
