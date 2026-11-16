# ccgeo-bridge-test.ps1 -- focused CCGEO in-viewer first-person bridge test.
#
# Runs CCGEO /F GEO2.DAX in DOSBox and uses GBMARK.COM copied as CCFP.COM to
# assert the exact command tail CCGEO EXECs for area-2 textured art. It also
# checks HLIB GEO.GLB logical id-table selection. This covers the same
# first-person bridge as the in-viewer F hotkey without foreground keyboard
# automation.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "ccgeo-bridge-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

function Write-SyntheticGeoDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 1
  )

  $compressed = [System.Collections.Generic.List[byte]]::new()
  $remaining = 1026
  while ($remaining -gt 0) {
    $chunk = [Math]::Min(128, $remaining)
    $compressed.Add([byte](256 - $chunk))
    $compressed.Add([byte]0)
    $remaining -= $chunk
  }

  [byte[]]$comp = $compressed.ToArray()
  [byte[]]$bytes = [byte[]]::new(11 + $comp.Length)
  $bytes[0] = 9
  $bytes[2] = $BlockId
  $bytes[7] = 0x02
  $bytes[8] = 0x04
  $bytes[9] = [byte]($comp.Length -band 0xFF)
  $bytes[10] = [byte](($comp.Length -shr 8) -band 0xFF)
  [Array]::Copy($comp, 0, $bytes, 11, $comp.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function New-GeoGlbMap {
  param(
    [Parameter(Mandatory)][int]$Width,
    [Parameter(Mandatory)][int]$Height
  )

  [byte[]]$map = [byte[]]::new(8 + (4 * $Width * $Height))
  $map[0] = [byte]$Width
  $map[1] = [byte]$Height
  return $map
}

function New-GeoGlibMap {
  [byte[]]$map = [byte[]]::new(1024)
  return $map
}

function Write-BE16([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  $Bytes[$Offset] = [byte](($Value -shr 8) -band 0xff)
  $Bytes[$Offset + 1] = [byte]($Value -band 0xff)
}

function Write-BE32([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  $Bytes[$Offset] = [byte](($Value -shr 24) -band 0xff)
  $Bytes[$Offset + 1] = [byte](($Value -shr 16) -band 0xff)
  $Bytes[$Offset + 2] = [byte](($Value -shr 8) -band 0xff)
  $Bytes[$Offset + 3] = [byte]($Value -band 0xff)
}

function Write-SyntheticGeoGlbWithIds {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[]]$idtab = [byte[]]::new(10)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 2)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 4)
  [BitConverter]::GetBytes([UInt16]26).CopyTo($idtab, 6)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 8)

  $map10 = New-GeoGlbMap 10 10
  $map22 = New-GeoGlbMap 22 22
  $map10[8 + (2 * 10 * 10)] = 0x80
  $map10[8 + (3 * 10 * 10)] = 0x01
  $map22[8 + (2 * 22 * 22)] = 0x7f
  $map22[8 + (3 * 22 * 22)] = 0x80

  [byte[][]]$members = @(
    $idtab,
    $map10,
    $map22
  )

  $ptrCount = $members.Count + 1
  $dataStart = 16 + ($ptrCount * 4)
  $fileSize = $dataStart
  foreach ($m in $members) { $fileSize += $m.Length }

  [byte[]]$bytes = [byte[]]::new($fileSize)
  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt32]$fileSize).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]($ptrCount - 1)).CopyTo($bytes, 8)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)

  $offset = $dataStart
  for ($i = 0; $i -lt $members.Count; $i++) {
    [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($i * 4))
    [Array]::Copy($members[$i], 0, $bytes, $offset, $members[$i].Length)
    $offset += $members[$i].Length
  }
  [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($members.Count * 4))
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticGeoGlibWithIds {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[]]$idtab = [byte[]]::new(14)
  Write-BE16 $idtab 0 3
  Write-BE16 $idtab 2 16
  Write-BE16 $idtab 4 1
  Write-BE16 $idtab 6 32
  Write-BE16 $idtab 8 2
  Write-BE16 $idtab 10 44
  Write-BE16 $idtab 12 3

  $map16 = New-GeoGlibMap
  $map32 = New-GeoGlibMap
  $map44 = New-GeoGlbMap 12 13
  $map16[2 * 16 * 16] = 0x81
  $map16[(3 * 16 * 16)] = 0x02
  $map32[2 * 16 * 16] = 0x7e
  $map32[(3 * 16 * 16)] = 0x40
  $map44[8 + (2 * 12 * 13)] = 0x55
  $map44[8 + (3 * 12 * 13)] = 0x11

  [byte[][]]$members = @(
    $idtab,
    $map16,
    $map32,
    $map44
  )

  $ptrCount = $members.Count + 1
  $dataStart = 16 + ($ptrCount * 4)
  $fileSize = $dataStart
  foreach ($m in $members) { $fileSize += $m.Length }

  [byte[]]$bytes = [byte[]]::new($fileSize)
  [Text.Encoding]::ASCII.GetBytes("GLIB").CopyTo($bytes, 0)
  Write-BE32 $bytes 4 $fileSize
  Write-BE16 $bytes 8 ($ptrCount - 1)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)

  $offset = $dataStart
  for ($i = 0; $i -lt $members.Count; $i++) {
    Write-BE32 $bytes (16 + ($i * 4)) $offset
    [Array]::Copy($members[$i], 0, $bytes, $offset, $members[$i].Length)
    $offset += $members[$i].Length
  }
  Write-BE32 $bytes (16 + ($members.Count * 4)) $offset
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticFruaGeo {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  # GEODATA.TXT: direct FORM/AMOD GEOxxx.DAT, 6-byte N/E/S/W/event/backdrop
  # cells from offset 322; MAP/ENCR/STRG are the documented fixed markers.
  [byte[]]$bytes = [byte[]]::new(6200)
  [Text.Encoding]::ASCII.GetBytes("FORM").CopyTo($bytes, 0)
  Write-BE32 $bytes 4 ($bytes.Length - 8)
  [Text.Encoding]::ASCII.GetBytes("AMOD").CopyTo($bytes, 8)
  Write-BE32 $bytes 12 ($bytes.Length - 16)
  [Text.Encoding]::ASCII.GetBytes("HDR ").CopyTo($bytes, 16)
  $bytes[26] = 2 # height
  $bytes[27] = 3 # width
  [Text.Encoding]::ASCII.GetBytes("MAP ").CopyTo($bytes, 314)
  [Text.Encoding]::ASCII.GetBytes("ENCR").CopyTo($bytes, 3778)
  [Text.Encoding]::ASCII.GetBytes("STRG").CopyTo($bytes, 5786)

  # First cell exercises blocked, locked, secret, and false-door high nibbles.
  # Low nibbles remain the source wall slots; byte 5 is the preserved backdrop/zone.
  $bytes[322] = 0xe6
  $bytes[323] = 0x21
  $bytes[324] = 0x13
  $bytes[325] = 0xf4
  $bytes[327] = 0x1c
  # A second cell proves ordinary open/locked-key wall conversion independently.
  $bytes[328] = 0x00
  $bytes[329] = 0x75
  $bytes[330] = 0xd2
  $bytes[331] = 0x00
  $bytes[333] = 0x0b
  [IO.File]::WriteAllBytes($Path, $bytes)
}

& (Join-Path $native "build.ps1") -Target ccgeo
& (Join-Path $native "build.ps1") -Target gbmark

if (Test-Path $run) {
  $resolvedRun = [IO.Path]::GetFullPath($run)
  $resolvedBuild = [IO.Path]::GetFullPath($build)
  if (-not $resolvedRun.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test directory: $resolvedRun"
  }
  Remove-Item -Recurse -Force $run
}
New-Item -ItemType Directory -Force $run | Out-Null

Copy-Item (Join-Path $build "ccgeo.com") (Join-Path $run "CCGEO.COM") -Force
Copy-Item (Join-Path $build "gbmark.com") (Join-Path $run "CCFP.COM") -Force
Write-SyntheticGeoDax (Join-Path $run "GEO2.DAX")
Write-SyntheticGeoGlbWithIds (Join-Path $run "GEO.GLB")
Write-SyntheticGeoGlibWithIds (Join-Path $run "GEOG.GLB")
Write-SyntheticFruaGeo (Join-Path $run "FRUA.DAT")
Copy-Item (Join-Path $run "FRUA.DAT") (Join-Path $run "BADFRUA.DAT") -Force
$badFrua = [IO.File]::ReadAllBytes((Join-Path $run "BADFRUA.DAT"))
$badFrua[314] = [byte][char]'X'
[IO.File]::WriteAllBytes((Join-Path $run "BADFRUA.DAT"), $badFrua)
New-Item -ItemType File -Force (Join-Path $run "8X8D1.DAX") | Out-Null
New-Item -ItemType File -Force (Join-Path $run "8X8D2.DAX") | Out-Null
New-Item -ItemType File -Force (Join-Path $run "WALLDEF2.DAX") | Out-Null

$conf = Join-Path $run "_ccgeo_bridge.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$run"
C:
CCGEO /F GEO2.DAX 0
CCGEO L GEO.GLB > C:\GEOLIST.TXT
CCGEO /B GEO.GLB 0 C:\GEO0.WAL > C:\GEO0.TXT
CCGEO /B GEO.GLB 26 C:\GEO26.WAL > C:\GEO26.TXT
CCGEO L GEOG.GLB > C:\GLIBLIST.TXT
CCGEO /B GEOG.GLB 16 C:\GLIB16.WAL > C:\GLIB16.TXT
CCGEO /B GEOG.GLB 32 C:\GLIB32.WAL > C:\GLIB32.TXT
CCGEO /B GEOG.GLB 44 C:\GLIB44.WAL > C:\GLIB44.TXT
CCGEO L FRUA.DAT > C:\FRUALIST.TXT
CCGEO /B FRUA.DAT 0 C:\FRUA.WAL > C:\FRUA.TXT
CCGEO /B BADFRUA.DAT 0 C:\BADFRUA.WAL > C:\BADFRUA.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(30000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCGEO /F bridge smoke test"
}

$out = Join-Path $run "GBEXEC.TXT"
if (-not (Test-Path $out)) {
  throw "CCFP recorder did not run"
}
$text = Get-Content $out -Raw
$tailLine = ($text -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
$expected = "TAIL= _FPWALK.BIN /T /A 2 /W"
if ($tailLine -ne $expected) {
  throw "Unexpected CCFP tail. Expected '$expected', got '$tailLine'. Full recorder output: $text"
}
if (-not (Test-Path (Join-Path $run "_FPWALK.BIN"))) {
  throw "CCGEO bridge did not create _FPWALK.BIN"
}

$list = Get-Content (Join-Path $run "GEOLIST.TXT") -Raw
if (-not $list.Contains("M0002.GEO") -or -not $list.Contains("M0026.GEO")) {
  throw "CCGEO HLIB list did not use logical ids. Output: $list"
}

$glibList = Get-Content (Join-Path $run "GLIBLIST.TXT") -Raw
if (-not $glibList.Contains("M0016.GEO") -or
    -not $glibList.Contains("M0032.GEO") -or
    -not $glibList.Contains("M0044.GEO")) {
  throw "CCGEO GLIB list did not use big-endian logical ids. Output: $glibList"
}

function Assert-WgrdDims {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][int]$Width,
    [Parameter(Mandatory)][int]$Height,
    [Parameter(Mandatory)][string]$Label,
    [int]$ExpectedBackdrop0 = -1,
    [int]$ExpectedDoor0 = -1
  )
  if (-not (Test-Path $Path)) {
    throw "$Label was not created"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $cellCount = $Width * $Height
  $expectedLength = 6 + ($cellCount * 4) + $cellCount + $cellCount
  if (
    $bytes.Length -ne $expectedLength -or
    [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "WGRD" -or
    $bytes[4] -ne $Width -or
    $bytes[5] -ne $Height
  ) {
    throw "$Label expected ${Width}x${Height} WGRD, got $($bytes[4])x$($bytes[5]) length $($bytes.Length)"
  }
  if ($ExpectedBackdrop0 -ge 0) {
    $backdrop0 = $bytes[6 + ($cellCount * 4)]
    if ($backdrop0 -ne $ExpectedBackdrop0) {
      throw ("$Label expected backdrop byte 0x{0:x2}, got 0x{1:x2}" -f $ExpectedBackdrop0, $backdrop0)
    }
  }
  if ($ExpectedDoor0 -ge 0) {
    $door0 = $bytes[6 + ($cellCount * 4) + $cellCount]
    if ($door0 -ne $ExpectedDoor0) {
      throw ("$Label expected door byte 0x{0:x2}, got 0x{1:x2}" -f $ExpectedDoor0, $door0)
    }
  }
}

Assert-WgrdDims (Join-Path $run "GEO0.WAL") 10 10 "CCGEO HLIB map 0 fallback" 0x80 0x01
Assert-WgrdDims (Join-Path $run "GEO26.WAL") 22 22 "CCGEO HLIB logical map 26" 0x7f 0x80
Assert-WgrdDims (Join-Path $run "GLIB16.WAL") 16 16 "CCGEO GLIB logical map 16" 0x81 0x02
Assert-WgrdDims (Join-Path $run "GLIB32.WAL") 16 16 "CCGEO GLIB logical map 32" 0x7e 0x40
Assert-WgrdDims (Join-Path $run "GLIB44.WAL") 12 13 "CCGEO GLIB Gen2 logical map 44" 0x55 0x11
Assert-WgrdDims (Join-Path $run "FRUA.WAL") 3 2 "CCGEO FRUA FORM/AMOD map" 0x1c 0xa4

$fruaList = Get-Content (Join-Path $run "FRUALIST.TXT") -Raw
if (-not $fruaList.Contains("M0000.GEO")) {
  throw "CCGEO FRUA list did not emit its direct map. Output: $fruaList"
}
$fruaWgr = [IO.File]::ReadAllBytes((Join-Path $run "FRUA.WAL"))
if (@($fruaWgr[6..9]) -join ',' -ne '6,1,3,4') {
  throw "CCGEO FRUA wall-slot normalization is wrong: $(@($fruaWgr[6..9]) -join ',')"
}
$badFruaText = Get-Content (Join-Path $run "BADFRUA.TXT") -Raw
if (-not $badFruaText.Contains("not an HLIB, DAX, or FRUA GEO record")) {
  throw "CCGEO accepted malformed FRUA marker. Output: $badFruaText"
}

Write-Output "RESULT: CCGEO DAX/HLIB/GLIB/FRUA bridge smoke PASS"
