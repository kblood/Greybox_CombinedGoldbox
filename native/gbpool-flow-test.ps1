# GBBOOT Pool of Radiance real-data native preview flow.
#
# Optional local smoke for the Amiga/WHDLoad data dump. Pool's local files are
# big-endian 10-byte-TOC archives whose payloads are ByteKiller-compressed, not
# the DOS little-endian 9-byte-TOC DAX archives consumed by the current native
# readers. This test stages a scratch copy only: it unpacks each ByteKiller block
# and repacks it as DOS signed-byte literal RLE inside a DOS-style DAX container.
param(
  [switch]$Headless,
  [string]$PoolPath = $env:GOLDBOX_POOL_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbpool-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Pool flow (DOSBox.exe absent)'
  exit 0
}

if (-not $PoolPath) {
  $PoolPath = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\PoolOfRadiance\data'
}

if (-not (Test-Path $PoolPath)) {
  Write-Output "SKIP: GBBOOT Pool flow ($PoolPath absent; set GOLDBOX_POOL_PATH to run)"
  exit 0
}

$required = @(
  'geo.dax',
  'ecl.dax',
  'walldef.dax',
  '8x8d.dax',
  'moncha.dax'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $PoolPath $name))) {
    Write-Output "SKIP: GBBOOT Pool flow ($name absent under $PoolPath)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Read-U16BE([byte[]]$Bytes, [int]$Offset) {
  return (([int]$Bytes[$Offset] -shl 8) -bor [int]$Bytes[$Offset + 1])
}

function Read-U32BE([byte[]]$Bytes, [int]$Offset) {
  return (([uint32]$Bytes[$Offset] -shl 24) -bor
    ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
    ([uint32]$Bytes[$Offset + 2] -shl 8) -bor
    [uint32]$Bytes[$Offset + 3])
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

function Convert-BitsReverse([uint32]$Value, [int]$Count) {
  [uint32]$ret = 0
  for ($i = 0; $i -lt $Count; $i++) {
    $ret = [uint32](($ret -shl 1) -bor ($Value -band 1))
    $Value = [uint32]($Value -shr 1)
  }
  return $ret
}

function Expand-ByteKillerBlock {
  param(
    [Parameter(Mandatory)][byte[]]$Packed,
    [Parameter(Mandatory)][int]$RawSize,
    [Parameter(Mandatory)][string]$Label
  )

  if ($Packed.Length -lt 12 -or (($Packed.Length - 8) % 4) -ne 0) {
    throw "Pool ByteKiller block has invalid length: $Label"
  }

  $streamEnd = $Packed.Length - 8
  [uint32]$wantChecksum = Read-U32BE $Packed $streamEnd
  [uint32]$sum = 0
  for ($i = 0; $i -lt $streamEnd; $i += 4) {
    $sum = [uint32]($sum -bxor (Read-U32BE $Packed $i))
  }
  if ($sum -ne $wantChecksum) {
    throw ("Pool ByteKiller checksum mismatch in {0}: got {1:X8}, expected {2:X8}" -f $Label, $sum, $wantChecksum)
  }

  $tailRawSize = Read-U32BE $Packed ($Packed.Length - 4)
  if ($tailRawSize -ne [uint32]$RawSize) {
    throw "Pool ByteKiller raw-size footer mismatch in $Label"
  }

  [byte[]]$out = [byte[]]::new($RawSize)
  $inputCur = $streamEnd
  $inputStart = 0
  [uint32]$bitBuf = 0
  $bitLen = 0
  $outCur = $RawSize

  function Read-BackwardByte {
    if ($script:inputCur -le $script:inputStart) {
      throw "Pool ByteKiller input underflow in $script:bkLabel"
    }
    $script:inputCur--
    return [byte]$script:bkPacked[$script:inputCur]
  }

  function Read-BackwardBE32 {
    [uint32]$b0 = Read-BackwardByte
    [uint32]$b1 = Read-BackwardByte
    [uint32]$b2 = Read-BackwardByte
    [uint32]$b3 = Read-BackwardByte
    return [uint32](($b3 -shl 24) -bor ($b2 -shl 16) -bor ($b1 -shl 8) -bor $b0)
  }

  function Read-BkRawBits([int]$Count) {
    [uint32]$ret = 0
    $pos = 0
    while ($Count -gt 0) {
      if ($script:bitLen -eq 0) {
        $script:bitBuf = Read-BackwardBE32
        $script:bitLen = 32
      }
      $take = [Math]::Min($Count, $script:bitLen)
      if ($take -eq 32) {
        [uint32]$mask = 0xFFFFFFFF
      } else {
        [uint32]$mask = [uint32]((1 -shl $take) - 1)
      }
      $ret = [uint32]($ret -bor (($script:bitBuf -band $mask) -shl $pos))
      $script:bitBuf = [uint32]($script:bitBuf -shr $take)
      $script:bitLen -= $take
      $Count -= $take
      $pos += $take
    }
    return $ret
  }

  function Read-BkBit {
    return [int](Read-BkRawBits 1)
  }

  function Read-BkBits([int]$Count) {
    return Convert-BitsReverse (Read-BkRawBits $Count) $Count
  }

  function Read-BkSymbol {
    $b1 = Read-BkBit
    $b2 = Read-BkBit
    if ($b1 -eq 0) {
      if ($b2 -eq 0) { return 0 }
      return 1
    }
    $b3 = Read-BkBit
    if ($b2 -eq 0) {
      if ($b3 -eq 0) { return 2 }
      return 3
    }
    if ($b3 -eq 0) { return 4 }
    return 5
  }

  function Write-BkByte([byte]$Value) {
    if ($script:outCur -le 0) {
      throw "Pool ByteKiller output overflow in $script:bkLabel"
    }
    $script:outCur--
    $script:bkOut[$script:outCur] = $Value
  }

  function Copy-BkBytes([int]$Distance, [int]$Count) {
    if ($Distance -le 0 -or $script:outCur -lt $Count -or ($script:outCur + $Distance) -gt $script:bkOut.Length) {
      throw "Pool ByteKiller bad copy in $script:bkLabel distance=$Distance count=$Count out=$script:outCur"
    }
    for ($i = 0; $i -lt $Count; $i++) {
      $script:bkOut[$script:outCur - 1] = $script:bkOut[$script:outCur + $Distance - 1]
      $script:outCur--
    }
  }

  $script:bkPacked = $Packed
  $script:bkOut = $out
  $script:bkLabel = $Label
  $script:inputCur = $inputCur
  $script:inputStart = $inputStart
  $script:bitBuf = $bitBuf
  $script:bitLen = $bitLen
  $script:outCur = $outCur

  $anchor = Read-BackwardBE32
  $foundAnchor = $false
  $mask = [uint32]2147483648
  for ($bits = 31; $mask -ne 0; $bits--) {
    if (($anchor -band $mask) -ne 0) {
      $script:bitBuf = [uint32]($anchor -band ($mask - 1))
      $script:bitLen = $bits
      $foundAnchor = $true
      break
    }
    $mask = [uint32]($mask -shr 1)
  }
  if (-not $foundAnchor) {
    throw "Pool ByteKiller anchor bit missing in $Label"
  }

  while ($script:outCur -gt 0) {
    switch (Read-BkSymbol) {
      0 {
        $count = [int](Read-BkBits 3) + 1
        for ($i = 0; $i -lt $count; $i++) {
          Write-BkByte ([byte](Read-BkBits 8))
        }
      }
      1 {
        Copy-BkBytes ([int](Read-BkBits 8)) 2
      }
      2 {
        Copy-BkBytes ([int](Read-BkBits 9)) 3
      }
      3 {
        Copy-BkBytes ([int](Read-BkBits 10)) 4
      }
      4 {
        $count = [int](Read-BkBits 8) + 1
        Copy-BkBytes ([int](Read-BkBits 12)) $count
      }
      5 {
        $count = [int](Read-BkBits 8) + 9
        for ($i = 0; $i -lt $count; $i++) {
          Write-BkByte ([byte](Read-BkBits 8))
        }
      }
    }
  }

  $availableBits = (($script:inputCur - $script:inputStart) * 8) + $script:bitLen
  if ($availableBits -ne 0) {
    throw "Pool ByteKiller stream ended with $availableBits unused bit(s) in $Label"
  }

  $inputCur = $script:inputCur
  $inputStart = $script:inputStart
  $bitBuf = $script:bitBuf
  $bitLen = $script:bitLen
  $outCur = $script:outCur
  Remove-Variable -Name bkPacked,bkOut,bkLabel,inputCur,inputStart,bitBuf,bitLen,outCur -Scope Script -ErrorAction SilentlyContinue
  return $out
}

function Convert-PoolDax10BeToDosDax {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Destination
  )

  [byte[]]$src = [IO.File]::ReadAllBytes($Source)
  if ($src.Length -lt 12) {
    throw "Pool DAX source too small: $Source"
  }

  $tocBytes10 = Read-U16BE $src 0
  if ($tocBytes10 -le 0 -or ($tocBytes10 % 10) -ne 0) {
    throw "Pool DAX source is not a BE 10-byte-TOC archive: $Source"
  }
  $count = [int]($tocBytes10 / 10)
  $dataBase10 = 2 + $tocBytes10
  if ($dataBase10 -gt $src.Length) {
    throw "Pool DAX TOC exceeds file length: $Source"
  }

  $entries = @()
  $payloads = [System.Collections.Generic.List[byte[]]]::new()
  $payloadOffset = 0
  for ($i = 0; $i -lt $count; $i++) {
    $off = 2 + ($i * 10)
    $id = Read-U16BE $src $off
    if ($id -gt 255) {
      throw "Pool DAX block id $id cannot fit DOS one-byte DAX id: $Source"
    }
    $dataOffset = Read-U32BE $src ($off + 2)
    $compSize = Read-U16BE $src ($off + 6)
    $rawSize = Read-U16BE $src ($off + 8)
    if ($compSize -le 0 -or $rawSize -le 0) {
      throw "Pool DAX invalid size at entry $i in $Source"
    }
    if (($dataBase10 + $dataOffset + $compSize) -gt $src.Length) {
      throw "Pool DAX entry $i exceeds file length: $Source"
    }

    [byte[]]$packed = [byte[]]::new($compSize)
    [Array]::Copy($src, $dataBase10 + $dataOffset, $packed, 0, $compSize)
    [byte[]]$raw = Expand-ByteKillerBlock $packed $rawSize "$([IO.Path]::GetFileName($Source)) block $id"
    [byte[]]$comp = ConvertTo-DaxLiteralRle $raw
    $entries += ,@{
      Id = $id
      Offset = [uint32]$payloadOffset
      RawSize = [uint16]$rawSize
      CompSize = [uint16]$comp.Length
    }
    $payloads.Add($comp)
    $payloadOffset += $comp.Length
  }

  $tocBytes9 = [uint16](9 * $count)
  $outLen = 2 + $tocBytes9 + $payloadOffset
  [byte[]]$out = [byte[]]::new($outLen)
  [BitConverter]::GetBytes($tocBytes9).CopyTo($out, 0)
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    $dst = 2 + ($i * 9)
    $out[$dst] = [byte]$entry.Id
    [BitConverter]::GetBytes([uint32]$entry.Offset).CopyTo($out, $dst + 1)
    [BitConverter]::GetBytes([uint16]$entry.RawSize).CopyTo($out, $dst + 5)
    [BitConverter]::GetBytes([uint16]$entry.CompSize).CopyTo($out, $dst + 7)
  }
  $dstPayload = 2 + $tocBytes9
  foreach ($payload in $payloads) {
    [Array]::Copy($payload, 0, $out, $dstPayload, $payload.Length)
    $dstPayload += $payload.Length
  }
  [IO.File]::WriteAllBytes($Destination, $out)
}

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 3) {
  if (-not (Test-Path $Path)) { throw "$Label was not created" }
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label was not a 320x200 RAW frame"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) { $nonzero++ }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Label appears blank or low-detail (nonzero=$nonzero colors=$colors)"
  }
}

function Assert-GbprMember([byte[]]$Bytes, [int]$Index, [int]$Slot, [string]$Name) {
  $off = 16 + ($Index * 410)
  if ($Bytes[$off] -ne $Slot) {
    throw "GBBOOT Pool /R created wrong slot at entry $Index"
  }
  $record = $off + 1
  $actual = [Text.Encoding]::ASCII.GetString($Bytes, $record + 1, $Bytes[$record])
  if ($actual -ne $Name) {
    throw "GBBOOT Pool /R created wrong name at entry ${Index}: '$actual'"
  }
}

function Set-Session([int]$x, [int]$y, [int]$facing, [int]$w = 16, [int]$h = 16) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]$w).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]$h).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

Convert-PoolDax10BeToDosDax (Join-Path $PoolPath 'geo.dax') (Join-Path $run 'GEO1.DAX')
Convert-PoolDax10BeToDosDax (Join-Path $PoolPath 'ecl.dax') (Join-Path $run 'ECL1.DAX')
Convert-PoolDax10BeToDosDax (Join-Path $PoolPath 'walldef.dax') (Join-Path $run 'WALLDEF1.DAX')
Convert-PoolDax10BeToDosDax (Join-Path $PoolPath '8x8d.dax') (Join-Path $run '8X8D1.DAX')
Convert-PoolDax10BeToDosDax (Join-Path $PoolPath 'moncha.dax') (Join-Path $run 'MON1CHA.DAX')
Set-Content -Path (Join-Path $run 'POOL.CFG') -Value '' -Encoding ASCII

$conf = Join-Path $build '_gbpool_flow_test.conf'
$eclConf = Join-Path $build '_gbpool_ecl_flow_test.conf'
$stepConf = Join-Path $build '_gbpool_step_flow_test.conf'
$combatConf = Join-Path $build '_gbpool_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 1 /R POOL_CLERIC C /R POOL_FIGHTER F /R POOL_MAGE M > C:\GBPOOL.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X > C:\GBPOOL2.TXT
exit
"@ | Set-Content $eclConf -Encoding ASCII

@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 > C:\GBPOOL3.TXT
exit
"@ | Set-Content $stepConf -Encoding ASCII

@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /B 15 /@ 33208 > C:\GBPOOL4.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'GBPOOL.TXT'),
  (Join-Path $build 'GBPOOL2.TXT'),
  (Join-Path $build 'GBPOOL3.TXT'),
  (Join-Path $build 'GBPOOL4.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Pool native preview flow timed out'
}

$out = Get-Content (Join-Path $build 'GBPOOL.TXT') -Raw
foreach ($needle in @(
  'game:   Pool of Radiance',
  'exec:   (native /E only)',
  'data-only broader Gen1 marker',
  'native: CCGEO /B GEO1.DAX map 0',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Pool flow output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Pool native preview failed'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT Pool flow did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne (16 + (3 * 410)) -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT Pool flow created an invalid GBPR roster'
}
Assert-GbprMember $gbpr 0 0x80 'POOL_CLERIC'
Assert-GbprMember $gbpr 1 0x81 'POOL_FIGHTER'
Assert-GbprMember $gbpr 2 0x82 'POOL_MAGE'

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT Pool flow did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 8) -ne 3) {
  throw 'GBBOOT Pool flow did not refresh GBPS from the created roster'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Pool flow did not create a valid 16x16 WGRD wall bridge'
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Pool real-data GEO preview' 2

foreach ($name in @('_GBECL.BIN', '_GBECL.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Pool raw preview unexpectedly wrote tactical/ECL artifact $name"
  }
}

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build 'GBPOOL2.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $eclConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Pool ECL-backed native preview flow timed out'
}

$out = Get-Content (Join-Path $build 'GBPOOL2.TXT') -Raw
foreach ($needle in @(
  'game:   Pool of Radiance',
  'native: CCECL ECL1.DAX entry 2 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Pool ECL flow output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Pool ECL-backed native preview failed'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0003 status=0000 geo=0002',
  'GBLF operands=0002 0002 00FF',
  'GBLP raw=0001 0003 0014 sets=0001 0003 0014',
  'GBRS flags=0000 area=0002'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT Pool ECL flow effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Pool real-data ECL/GEO preview' 2
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Pool ECL preview unexpectedly wrote tactical/resume artifact $name"
  }
}

Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBPOOL3.TXT') -Force -ErrorAction SilentlyContinue

# Pool entry 2's WGRD has a verified open south edge from (4,0) to (4,1).
# This proves the default ECL/GEO bridge can enter CCFP's persistent GBSN path.
Set-Session 4 0 4
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $stepConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Pool persistent movement flow timed out'
}

$stepOut = Get-Content (Join-Path $build 'GBPOOL3.TXT') -Raw
foreach ($needle in @(
  'game:   Pool of Radiance',
  'native: CCECL ECL1.DAX entry 2 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($stepOut -notlike "*$needle*") {
    throw "GBBOOT Pool movement output missing: $needle"
  }
}
if ($stepOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Pool persistent movement flow failed'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 0 -or
    [BitConverter]::ToUInt16($step, 8) -ne 4 -or
    [BitConverter]::ToUInt16($step, 10) -ne 1 -or
    [BitConverter]::ToUInt16($step, 12) -ne 4) {
  throw 'GBBOOT Pool movement flow did not write the expected GBST destination'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 4 -or
    [BitConverter]::ToUInt16($session, 8) -ne 1 -or
    [BitConverter]::ToUInt16($session, 10) -ne 4) {
  throw 'GBBOOT Pool movement flow did not persist the post-step first-person pose'
}

# The stepped route enters Pool's source-owned frog encounter at the destination.
# This used to be asserted as a no-combat walk, which made the test red when the
# native movement continuation began executing its real combat handoff.
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (-not (Test-Path (Join-Path $build $name))) {
    throw "GBBOOT Pool movement-to-combat route did not write $name"
  }
}
$stepEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0168 status=0003 geo=FFFF',
  'GBSL count=0003',
  'TEXT=EVIL LOOKING FROGS BOIL UP FROM BELOW.',
  '@00 MONSTER id=0026 count=0008 pic=0025'
)) {
  if ($stepEffect -notlike "*$needle*") {
    throw "GBBOOT Pool movement-to-combat effect dump missing: $needle"
  }
}
$stepResult = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($stepResult.Length -lt 4 -or [Text.Encoding]::ASCII.GetString($stepResult, 0, 4) -ne 'GBCR') {
  throw 'GBBOOT Pool movement-to-combat route did not write a GBCR result'
}

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBPOOL4.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Pool direct tactical probe timed out'
}

$combatOut = Get-Content (Join-Path $build 'GBPOOL4.TXT') -Raw
foreach ($needle in @(
  'game:   Pool of Radiance',
  'native: CCECL ECL1.DAX entry 15 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($combatOut -notlike "*$needle*") {
    throw "GBBOOT Pool combat output missing: $needle"
  }
}
if ($combatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Pool direct terminal probe failed'
}

$combatDump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=000F pc=01EC rng=00001234 callsp=0000 mem=0004',
  '#00 OP=31 SPRITE_OFF ARGC=00',
  '#01 OP=2D CALL ARGC=02 ARGS= 2C90 AC91 CALL=operand:2C90 routine:AC91'
)) {
  if ($combatDump -notlike "*$needle*") {
    throw "GBBOOT Pool direct terminal effect dump missing: $needle"
  }
}

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Pool direct terminal route unexpectedly wrote combat/resume artifact $name"
  }
}

Write-Output 'RESULT: GBBOOT Pool of Radiance Amiga ByteKiller staged native /E party + raw GEO preview + ECL entry-2 map bridge + movement/combat/resume + direct terminal ECL branch PASS'
