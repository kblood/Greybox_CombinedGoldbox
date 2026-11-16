# cchlib-dqk-art-test.ps1 -- headless DQK HLIB wall-art decode smoke.
#
# Builds CCHLIB.COM and CCFP.COM, validates DQK/FRUA-style 47-image wall-set
# groupings, writes decoded GBWS wall-set bundles, renders them through CCFP's
# GBWS preview path, verifies placement offsets and multi-set band selection,
# decodes representative DQK TILE libraries to explicit RAW output paths, and
# checks dimensions/payloads. This is the native prerequisite for wiring DQK
# HLIB wall art into CCFP.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native "build"
$run = Join-Path $build "cchlib-dqk-art-test"
$dqk = Join-Path $root "The Dark Queen of Krynn"
$dosbox = Join-Path $dqk "DOSBOX\DOSBox.exe"
# Mount a scratch mirror, never the retail release itself: `mount D "$dqk"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dqkMount = if (Test-Path -LiteralPath $dqk -PathType Container) { New-RetailStage -Source $dqk } else { $dqk }
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target cchlib
& (Join-Path $native "build.ps1") -Target ccfp

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "cchlib.com") (Join-Path $run "CCHLIB.COM") -Force
Copy-Item (Join-Path $build "ccfp.com") (Join-Path $run "CCFP.COM") -Force

$wallBytes = New-Object byte[] (6 + 16 * 16 * 4)
[Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($wallBytes, 0)
$wallBytes[4] = 16
$wallBytes[5] = 16
for ($y = 0; $y -lt 16; $y++) {
  for ($x = 0; $x -lt 16; $x++) {
    $idx = 6 + (($y * 16 + $x) * 4)
    $slot = [byte]((($x + $y) % 15) + 1)
    $wallBytes[$idx + 0] = $slot
    $wallBytes[$idx + 1] = $slot
    $wallBytes[$idx + 2] = $slot
    $wallBytes[$idx + 3] = $slot
  }
}
[IO.File]::WriteAllBytes((Join-Path $run "WALLS.BIN"), $wallBytes)

$openWallBytes = New-Object byte[] (6 + 16 * 16 * 4)
[Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($openWallBytes, 0)
$openWallBytes[4] = 16
$openWallBytes[5] = 16
[IO.File]::WriteAllBytes((Join-Path $run "OPEN.BIN"), $openWallBytes)

$badGbw = New-Object byte[] (16 + 20)
[Text.Encoding]::ASCII.GetBytes("GBWS").CopyTo($badGbw, 0)
[BitConverter]::GetBytes([UInt16]1).CopyTo($badGbw, 4)
[BitConverter]::GetBytes([UInt16]47).CopyTo($badGbw, 8)
$badGbw[10] = 10
$badGbw[11] = 10
$badGbw[12] = 9
$badGbw[13] = 9
$badGbw[14] = 9
[Text.Encoding]::ASCII.GetBytes("GBWI").CopyTo($badGbw, 16)
[BitConverter]::GetBytes([UInt16]57).CopyTo($badGbw, 24)
[BitConverter]::GetBytes([UInt16]56).CopyTo($badGbw, 26)
[BitConverter]::GetBytes([UInt16]3137).CopyTo($badGbw, 28)
$badGbw[34] = 21
$badGbw[35] = 1
[IO.File]::WriteAllBytes((Join-Path $run "BADGBW.GBW"), $badGbw)

$badNpix = New-Object byte[] (16 + 24 + 3 + 768)
[Text.Encoding]::ASCII.GetBytes("GBWS").CopyTo($badNpix, 0)
[BitConverter]::GetBytes([UInt16]2).CopyTo($badNpix, 4)
[BitConverter]::GetBytes([UInt16]47).CopyTo($badNpix, 8)
$badNpix[10] = 10
$badNpix[11] = 10
$badNpix[12] = 9
$badNpix[13] = 9
$badNpix[14] = 9
[Text.Encoding]::ASCII.GetBytes("GBWI").CopyTo($badNpix, 16)
[BitConverter]::GetBytes([UInt16]2).CopyTo($badNpix, 24)
[BitConverter]::GetBytes([UInt16]2).CopyTo($badNpix, 26)
[BitConverter]::GetBytes([UInt16]3).CopyTo($badNpix, 28)
$badNpix[34] = 21
$badNpix[35] = 1
[IO.File]::WriteAllBytes((Join-Path $run "BADNPIX.GBW"), $badNpix)

function Clear-GbwsPlacementOffsets([string]$InPath, [string]$OutPath) {
  $bytes = [IO.File]::ReadAllBytes($InPath)
  if ($bytes.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBWS") {
    throw "GBWS zero-offset helper failed: bad source magic"
  }
  $version = [BitConverter]::ToUInt16($bytes, 4)
  if ($version -lt 2) {
    throw "GBWS zero-offset helper failed: version $version has no placement offsets"
  }
  $count = [BitConverter]::ToUInt16($bytes, 8)
  $offset = 16
  for ($i = 0; $i -lt $count; $i++) {
    if (($offset + 24) -gt $bytes.Length -or [Text.Encoding]::ASCII.GetString($bytes, $offset, 4) -ne "GBWI") {
      throw "GBWS zero-offset helper failed: bad GBWI record at image $i"
    }
    $npix = [BitConverter]::ToUInt16($bytes, $offset + 12)
    $bytes[$offset + 20] = 0
    $bytes[$offset + 21] = 0
    $bytes[$offset + 22] = 0
    $bytes[$offset + 23] = 0
    $offset += 24 + $npix + 768
  }
  if ($offset -ne $bytes.Length) {
    throw "GBWS zero-offset helper failed: parsed length $offset, actual $($bytes.Length)"
  }
  [IO.File]::WriteAllBytes($OutPath, $bytes)
}

function Add-U16([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [byte[]]$raw = [BitConverter]::GetBytes([UInt16]$Value)
  $Bytes.AddRange($raw)
}

function Add-I16([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [byte[]]$raw = [BitConverter]::GetBytes([Int16]$Value)
  $Bytes.AddRange($raw)
}

function Add-Ascii([System.Collections.Generic.List[byte]]$Bytes, [string]$Text) {
  $Bytes.AddRange([Text.Encoding]::ASCII.GetBytes($Text))
}

function Add-BE16([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [void]$Bytes.Add([byte](($Value -shr 8) -band 0xFF))
  [void]$Bytes.Add([byte]($Value -band 0xFF))
}

function Add-BE32([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [void]$Bytes.Add([byte](($Value -shr 24) -band 0xFF))
  [void]$Bytes.Add([byte](($Value -shr 16) -band 0xFF))
  [void]$Bytes.Add([byte](($Value -shr 8) -band 0xFF))
  [void]$Bytes.Add([byte]($Value -band 0xFF))
}

function Write-SyntheticGlibDataFixture([string]$Path) {
  [byte[][]]$members = @(
    [byte[]]@(1, 2, 3),
    [byte[]]@(4, 5, 6, 7, 8)
  )
  $ptrCount = $members.Count + 1
  $bytes = [System.Collections.Generic.List[byte]]::new()
  Add-Ascii $bytes "GLIB"
  Add-BE32 $bytes 0
  Add-BE16 $bytes ($ptrCount - 1)
  Add-BE16 $bytes 1
  Add-Ascii $bytes "DATA"
  $offset = 16 + ($ptrCount * 4)
  foreach ($member in $members) {
    Add-BE32 $bytes $offset
    $offset += $member.Length
  }
  Add-BE32 $bytes $offset
  foreach ($member in $members) {
    foreach ($b in $member) { [void]$bytes.Add($b) }
  }
  $raw = $bytes.ToArray()
  $raw[4] = [byte](($raw.Length -shr 24) -band 0xFF)
  $raw[5] = [byte](($raw.Length -shr 16) -band 0xFF)
  $raw[6] = [byte](($raw.Length -shr 8) -band 0xFF)
  $raw[7] = [byte]($raw.Length -band 0xFF)
  [IO.File]::WriteAllBytes($Path, $raw)
}

function Write-SyntheticGlibImageMasterFixture([string]$Path) {
  [byte[]]$leaf = [byte[]]@(0x47,0x4c,0x49,0x42, 0,0,0,16, 0,0,5,0, 0x54,0x49,0x4c,0x45)
  [byte[][]]$members = @([byte[]]@(0), $leaf)
  $ptrCount = $members.Count + 1
  $bytes = [System.Collections.Generic.List[byte]]::new()
  Add-Ascii $bytes "GLIB"
  Add-BE32 $bytes 0
  Add-BE16 $bytes ($ptrCount - 1)
  Add-BE16 $bytes 1
  Add-Ascii $bytes "GLIB"
  $offset = 16 + ($ptrCount * 4)
  foreach ($member in $members) {
    Add-BE32 $bytes $offset
    $offset += $member.Length
  }
  Add-BE32 $bytes $offset
  foreach ($member in $members) {
    foreach ($b in $member) { [void]$bytes.Add($b) }
  }
  $raw = $bytes.ToArray()
  $raw[4] = [byte](($raw.Length -shr 24) -band 0xFF)
  $raw[5] = [byte](($raw.Length -shr 16) -band 0xFF)
  $raw[6] = [byte](($raw.Length -shr 8) -band 0xFF)
  $raw[7] = [byte]($raw.Length -band 0xFF)
  [IO.File]::WriteAllBytes($Path, $raw)
}

function Get-GbwsGroup([int]$LocalInSet) {
  if ($LocalInSet -lt 10) { return 1 }
  if ($LocalInSet -lt 20) { return 2 }
  if ($LocalInSet -lt 29) { return 3 }
  if ($LocalInSet -lt 38) { return 4 }
  return 5
}

function Write-SyntheticGbwsOffsetFixture([string]$Path) {
  $count = 94
  $targetIndex = 64
  $targetColor = 42
  $bytes = [System.Collections.Generic.List[byte]]::new()
  Add-Ascii $bytes "GBWS"
  Add-U16 $bytes 2
  Add-U16 $bytes 0
  Add-U16 $bytes $count
  foreach ($g in @(10, 10, 9, 9, 9)) { [void]$bytes.Add([byte]$g) }
  [void]$bytes.Add([byte]0)

  $pal = [byte[]]::new(768)
  $pal[$targetColor * 3 + 0] = 252
  $pal[$targetColor * 3 + 1] = 252
  $pal[$targetColor * 3 + 2] = 252

  for ($i = 0; $i -lt $count; $i++) {
    Add-Ascii $bytes "GBWI"
    Add-U16 $bytes $i
    Add-U16 $bytes $i
    Add-U16 $bytes 1
    Add-U16 $bytes 1
    Add-U16 $bytes 1
    Add-U16 $bytes 0
    Add-U16 $bytes 256
    [void]$bytes.Add([byte]21)
    [void]$bytes.Add([byte](Get-GbwsGroup ($i % 47)))
    if ($i -eq $targetIndex) {
      Add-I16 $bytes 3
      Add-I16 $bytes 4
      [void]$bytes.Add([byte]$targetColor)
    } else {
      Add-I16 $bytes 0
      Add-I16 $bytes 0
      [void]$bytes.Add([byte]255)
    }
    $bytes.AddRange($pal)
  }
  [IO.File]::WriteAllBytes($Path, $bytes.ToArray())
}

function Write-SyntheticGbwsPaletteFixture([string]$Path) {
  $count = 94
  $targetIndex = 64
  $targetColor = 96
  $bytes = [System.Collections.Generic.List[byte]]::new()
  Add-Ascii $bytes "GBWS"
  Add-U16 $bytes 2
  Add-U16 $bytes 0
  Add-U16 $bytes $count
  foreach ($g in @(10, 10, 9, 9, 9)) { [void]$bytes.Add([byte]$g) }
  [void]$bytes.Add([byte]0)

  for ($i = 0; $i -lt $count; $i++) {
    $pal = [byte[]]::new(768)
    $palFirst = 0
    $palN = 0
    $pixel = 255
    if ($i -eq 0) {
      $palFirst = 32
      $palN = 37
      $pal[42 * 3 + 0] = 180
      $pal[42 * 3 + 1] = 20
      $pal[42 * 3 + 2] = 20
    } elseif ($i -eq $targetIndex) {
      $palFirst = $targetColor
      $palN = 1
      $pixel = $targetColor
      $pal[$targetColor * 3 + 0] = 12
      $pal[$targetColor * 3 + 1] = 200
      $pal[$targetColor * 3 + 2] = 36
    }

    Add-Ascii $bytes "GBWI"
    Add-U16 $bytes $i
    Add-U16 $bytes $i
    Add-U16 $bytes 1
    Add-U16 $bytes 1
    Add-U16 $bytes 1
    Add-U16 $bytes $palFirst
    Add-U16 $bytes $palN
    [void]$bytes.Add([byte]21)
    [void]$bytes.Add([byte](Get-GbwsGroup ($i % 47)))
    Add-I16 $bytes 0
    Add-I16 $bytes 0
    [void]$bytes.Add([byte]$pixel)
    $bytes.AddRange($pal)
  }
  [IO.File]::WriteAllBytes($Path, $bytes.ToArray())
}

function Write-SyntheticGbwsTransparentClipFixture([string]$Path) {
  $count = 94
  $targetIndex = 64
  $targetColor = 77
  $bytes = [System.Collections.Generic.List[byte]]::new()
  Add-Ascii $bytes "GBWS"
  Add-U16 $bytes 2
  Add-U16 $bytes 0
  Add-U16 $bytes $count
  foreach ($g in @(10, 10, 9, 9, 9)) { [void]$bytes.Add([byte]$g) }
  [void]$bytes.Add([byte]0)

  $pal = [byte[]]::new(768)
  $pal[$targetColor * 3 + 0] = 240
  $pal[$targetColor * 3 + 1] = 180
  $pal[$targetColor * 3 + 2] = 20

  for ($i = 0; $i -lt $count; $i++) {
    $width = 1
    $height = 1
    $pixels = [byte[]]@(255)
    $yoff = 0
    $xoff = 0
    if ($i -eq $targetIndex) {
      $width = 3
      $height = 2
      $pixels = [byte[]]@(255, 255, 255, 255, $targetColor, 255)
      $yoff = 3
      $xoff = 4
    }

    Add-Ascii $bytes "GBWI"
    Add-U16 $bytes $i
    Add-U16 $bytes $i
    Add-U16 $bytes $width
    Add-U16 $bytes $height
    Add-U16 $bytes ($width * $height)
    Add-U16 $bytes 0
    Add-U16 $bytes 256
    [void]$bytes.Add([byte]21)
    [void]$bytes.Add([byte](Get-GbwsGroup ($i % 47)))
    Add-I16 $bytes $yoff
    Add-I16 $bytes $xoff
    $bytes.AddRange($pixels)
    $bytes.AddRange($pal)
  }
  [IO.File]::WriteAllBytes($Path, $bytes.ToArray())
}

function Write-SyntheticTextEffect([string]$Path, [string]$Text) {
  # CCECL v6's GBSX reserves all 64 event records before its text records.
  # Keep this fixture coupled to CCFP's current 64-event reader layout.
  $textOffset = 2252 + (64 * 20)
  $bytes = [byte[]]::new($textOffset + 34)
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]6).CopyTo($bytes, 4)
  [Text.Encoding]::ASCII.GetBytes("GBSX").CopyTo($bytes, 2246)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 2250)
  $raw = [Text.Encoding]::ASCII.GetBytes($Text)
  # CCFP selects text only from a source-ordered PRINT/PRINTCLEAR event.
  # The old fixture wrote a detached text slot, which no longer describes a
  # valid producer after the narration-order contract changed.
  [BitConverter]::GetBytes([UInt16]0x11).CopyTo($bytes, 2252)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 2254)
  [BitConverter]::GetBytes([UInt16]$raw.Length).CopyTo($bytes, 2256)
  [BitConverter]::GetBytes([UInt16]$raw.Length).CopyTo($bytes, $textOffset)
  $raw.CopyTo($bytes, $textOffset + 2)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticClockEffect([string]$Path) {
  # GBCL follows the 64-slot GBSX text region and the 24-byte GBES tail.
  $clockOffset = 2252 + (64 * 20) + (64 * 34) + 24
  $bytes = [byte[]]::new($clockOffset + 18)
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]9).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]0x0080).CopyTo($bytes, 6)
  [Text.Encoding]::ASCII.GetBytes("GBCL").CopyTo($bytes, $clockOffset)
  $slots = @(0, 0, 0, 5, 0, 0, 0)
  for ($i = 0; $i -lt $slots.Count; $i++) {
    [BitConverter]::GetBytes([UInt16]$slots[$i]).CopyTo($bytes, $clockOffset + 4 + ($i * 2))
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Assert-TextOverlayRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid RAW header/length"
  }
  $lit = 0
  for ($y = 176; $y -lt 200; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 0; $x -lt 320; $x++) {
      if ($bytes[$row + $x] -ne 0) { $lit++ }
    }
  }
  if ($lit -lt 20) {
    throw "$Label failed: expected visible text pixels in the message band"
  }
}

function Assert-SkyBackdropRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid RAW header/length"
  }
  if ($bytes[4 + (12 * 320) + 12] -ne 11) {
    throw "$Label failed: expected blue sky band"
  }
  if ($bytes[4 + (70 * 320) + 12] -ne 8) {
    throw "$Label failed: expected floor below sky horizon"
  }
  $sun = 0
  for ($y = 24; $y -lt 32; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 88; $x -lt 96; $x++) {
      if ($bytes[$row + $x] -eq 14) { $sun++ }
    }
  }
  if ($sun -lt 64) {
    throw "$Label failed: expected 8x8 sunrise body, found $sun yellow pixels"
  }
}

# --- CCHLIB S master-leaf export: engine-pinned end-exclusive TLB ranges ----
# Source of truth: packages/engine/test/dqkCombatCluster.test.ts
# ('pins DQK combat TLB master set-id tables'): {id, leafBase, leafEnd}.
$leafRanges = @(
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 1; Base = 0x0046; End = 0x3f2e },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 5; Base = 0x0046; End = 0x3f2e },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 2; Base = 0x3f2e; End = 0x7e16 },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 3; Base = 0x7e16; End = 0xbd02 },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 4; Base = 0xbd02; End = 0xfbea },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Id = 6; Base = 0xfbea; End = 0x1489e },
  @{ Label = "WILDCOM"; File = "WILDCOM.TLB"; Id = 1; Base = 0x003a; End = 0x5f4a },
  @{ Label = "WILDCOM"; File = "WILDCOM.TLB"; Id = 2; Base = 0x5f4a; End = 0xbe5a },
  @{ Label = "WILDCOM"; File = "WILDCOM.TLB"; Id = 4; Base = 0xbe5a; End = 0x11d6a },
  @{ Label = "WILDCOM"; File = "WILDCOM.TLB"; Id = 5; Base = 0x11d6a; End = 0x17c7a }
)
$srcBytes = @{}
foreach ($f in @("DUNGCOM.TLB", "WILDCOM.TLB")) {
  $srcBytes[$f] = [IO.File]::ReadAllBytes((Join-Path $dqk "DISK2\$f"))
}
function Get-LeafSlice([byte[]]$Bytes, [int]$Base, [int]$End) {
  $n = $End - $Base
  $out = New-Object byte[] $n
  [Array]::Copy($Bytes, $Base, $out, 0, $n)
  , $out
}
# Returns the index of the first differing byte, -1 when equal, -2 on length mismatch.
function Compare-Leaf([byte[]]$Expected, [byte[]]$Actual) {
  if ($Expected.Length -ne $Actual.Length) { return -2 }
  for ($i = 0; $i -lt $Expected.Length; $i++) {
    if ($Expected[$i] -ne $Actual[$i]) { return $i }
  }
  return -1
}
# Staged mutation: a private copy of DUNGCOM.TLB with ONE byte flipped in the
# middle of leaf id 2. CCHLIB S on it must NOT match the pristine slice.
$mutOffset = 0x3f2e + 0x1000
$mutBytes = [byte[]]$srcBytes["DUNGCOM.TLB"].Clone()
$mutBytes[$mutOffset] = $mutBytes[$mutOffset] -bxor 0xFF
[IO.File]::WriteAllBytes((Join-Path $run "MUT.TLB"), $mutBytes)
foreach ($d in @("SD", "SW", "SM")) { New-Item -ItemType Directory -Force (Join-Path $run $d) | Out-Null }

$cases = @(
  @{ Label = "8X8DB"; File = "8X8DB.TLB"; Width = 8; Height = 8 },
  @{ Label = "8X8DC"; File = "8X8DC.TLB"; Width = 8; Height = 1 },
  @{ Label = "DUNGCOM"; File = "DUNGCOM.TLB"; Width = 24; Height = 24 },
  @{ Label = "WILDCOM"; File = "WILDCOM.TLB"; Width = 24; Height = 24 }
)
$wallCases = @(
  @{ Label = "8X8DB"; File = "8X8DB.TLB"; Images = 423; Sets = 9; Remainder = 0 },
  @{ Label = "8X8DC"; File = "8X8DC.TLB"; Images = 376; Sets = 8; Remainder = 0 }
)

Write-SyntheticTextEffect (Join-Path $run "TEXT.EFX") "DQKTXT"
Write-SyntheticClockEffect (Join-Path $run "CLOCK.EFX")
Write-SyntheticGbwsOffsetFixture (Join-Path $run "OFFSETS.GBW")
Write-SyntheticGbwsPaletteFixture (Join-Path $run "PALETTE.GBW")
Write-SyntheticGbwsTransparentClipFixture (Join-Path $run "CLIP.GBW")
Write-SyntheticGlibDataFixture (Join-Path $run "GLIBDATA.GLB")
Write-SyntheticGlibImageMasterFixture (Join-Path $run "GLIBIMG.TLB")

$lines = @(
  "@echo off",
  ('mount C "{0}"' -f $run),
  ('mount D "{0}"' -f $dqkMount),
  "C:"
)
foreach ($w in $wallCases) {
  $lines += ('CCHLIB W D:\DISK2\{0} 0 C:\{1}0.GBW > C:\{1}W.TXT' -f $w.File, $w.Label)
}
$lines += 'CCHLIB W D:\DISK2\8X8DB.TLB 0 C:\8X8DB3.GBW 3 > C:\8X8DB3W.TXT'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DB3.GBW /P > C:\GBWPLAN.TXT'
$lines += 'ren PLAN.TXT GBWPLAN.PLT'
$lines += 'CCFP C:\8X8DB0.GBW /Q /R > C:\GBWPREV.TXT'
$lines += 'ren GBWVIEW.RAW GBWQ.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DB0.GBW /R > C:\GBWFP.TXT'
$lines += 'ren GBWVIEW.RAW GBWF.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\OFFSETS.GBW /R > C:\GBWOFF.TXT'
$lines += 'ren GBWVIEW.RAW GBWOFF.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\PALETTE.GBW /R > C:\GBWPAL.TXT'
$lines += 'ren GBWVIEW.RAW GBWPAL.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\CLIP.GBW /R > C:\GBWCLIP.TXT'
$lines += 'ren GBWVIEW.RAW GBWCLIP.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DC0.GBW /R > C:\GBWFPC.TXT'
$lines += 'ren GBWVIEW.RAW GBWFC.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DB0.GBW /E C:\TEXT.EFX /R > C:\GBWFPTE.TXT'
$lines += 'ren GBWVIEW.RAW GBWFTE.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DB0.GBW /E C:\TEXT.EFX /S > C:\GBWFPS.TXT'
$lines += 'ren CCFPVIEW.RAW GBWFS.RAW'
$lines += 'CCFP C:\OPEN.BIN 8 13 2 /F C:\8X8DB0.GBW /E C:\CLOCK.EFX /S > C:\GBWCLK.TXT'
$lines += 'ren CCFPVIEW.RAW GBWCLK.RAW'
$lines += 'CCFP C:\WALLS.BIN /F C:\8X8DB3.GBW /R > C:\GBWFP3.TXT'
$lines += 'ren GBWVIEW.RAW GBWF3.RAW'
$lines += 'CCFP C:\BADGBW.GBW /Q /R > C:\BADGBW.TXT'
$lines += 'CCFP C:\BADNPIX.GBW /Q /R > C:\BADNPXQ.TXT'
$lines += 'CCFP C:\WALLS.BIN /F C:\BADNPIX.GBW /R > C:\BADNPXF.TXT'
$lines += 'CCHLIB L C:\GLIBDATA.GLB > C:\GLIBDATA.TXT'
$lines += 'CCHLIB W C:\GLIBIMG.TLB 0 C:\GLIBIMG.GBW 1 > C:\GLIBIMG.TXT'
foreach ($c in $cases) {
  $lines += ('CCHLIB /D D:\DISK2\{0} 0 C:\{1}.RAW > C:\{1}.TXT' -f $c.File, $c.Label)
}
foreach ($r in $leafRanges) {
  $sub = if ($r.Label -eq "DUNGCOM") { "SD" } else { "SW" }
  $lines += ('CCHLIB S D:\DISK2\{0} {1} C:\{2} > C:\{2}\{3}{1}.TXT' -f $r.File, $r.Id, $sub, $r.Label.Substring(0,1))
}
$lines += 'CCHLIB S C:\MUT.TLB 2 C:\SM > C:\SM\M2.TXT'
$lines += 'CCHLIB S D:\DISK2\DUNGCOM.TLB 101 C:\SD > C:\SD\BAD101.TXT'
$lines += "exit"

$conf = Join-Path $run "_cchlib_dqk_art.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
$($lines -join "`r`n")
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCHLIB DQK art smoke test"
}

$glibDataList = Get-Content (Join-Path $run "GLIBDATA.TXT") -Raw
if (-not $glibDataList.Contains("3 D0000.HTD") -or
    -not $glibDataList.Contains("5 D0001.HTD")) {
  throw "CCHLIB GLIB DATA listing failed. Output: $glibDataList"
}
$glibImageOut = Get-Content (Join-Path $run "GLIBIMG.TXT") -Raw
if ($glibImageOut -notlike "*not an image HLIB library*") {
  throw "CCHLIB GLIB image-master guard failed. Output: $glibImageOut"
}
if (Test-Path (Join-Path $run "GLIBIMG.GBW")) {
  throw "CCHLIB GLIB image-master guard unexpectedly wrote GLIBIMG.GBW"
}

# --- verify DOS-extracted leaves against the engine-pinned ranges ----------
$totalLeafBytes = 0
foreach ($r in $leafRanges) {
  $sub = if ($r.Label -eq "DUNGCOM") { "SD" } else { "SW" }
  $path = Join-Path $run ("{0}\S{1:D4}.HLB" -f $sub, $r.Id)
  if (-not (Test-Path $path)) { throw ("CCHLIB S {0} id {1}: S{1:D4}.HLB not written" -f $r.Label, $r.Id) }
  $got = [IO.File]::ReadAllBytes($path)
  $want = Get-LeafSlice $srcBytes[$r.File] $r.Base $r.End
  $cmp = Compare-Leaf $want $got
  if ($cmp -eq -2) { throw ("CCHLIB S {0} id {1}: length {2}, expected end-exclusive range [0x{3:x},0x{4:x}) = {5}" -f $r.Label, $r.Id, $got.Length, $r.Base, $r.End, $want.Length) }
  if ($cmp -ge 0) { throw ("CCHLIB S {0} id {1}: first byte mismatch at leaf offset {2}" -f $r.Label, $r.Id, $cmp) }
  $totalLeafBytes += $got.Length
  Write-Output ("[PASS] CCHLIB S {0} id {1}: {2} bytes == TLB[0x{3:x},0x{4:x})" -f $r.Label, $r.Id, $got.Length, $r.Base, $r.End)
}
if (Test-Path (Join-Path $run "SD\S0101.HLB")) {
  throw "CCHLIB S unknown id 101 unexpectedly wrote S0101.HLB"
}
# Probe-can-fail control: the staged one-byte-mutated TLB must go RED.
$mutOut = Join-Path $run "SM\S0002.HLB"
if (-not (Test-Path $mutOut)) { throw "CCHLIB S mutated-staging control: S0002.HLB not written" }
$mutGot = [IO.File]::ReadAllBytes($mutOut)
$pristine = Get-LeafSlice $srcBytes["DUNGCOM.TLB"] 0x3f2e 0x7e16
$mutIdx = Compare-Leaf $pristine $mutGot
if ($mutIdx -ne 0x1000) {
  throw "CCHLIB S mutated-staging control did NOT go red: first diff at $mutIdx, expected 4096 (probe cannot fail)"
}
$diffs = 0
for ($i = 0; $i -lt $pristine.Length; $i++) { if ($pristine[$i] -ne $mutGot[$i]) { $diffs++ } }
if ($diffs -ne 1) { throw "CCHLIB S mutated-staging control: expected exactly 1 differing byte, got $diffs" }
Write-Output "[PASS] CCHLIB S: staged one-byte leaf change detected (leaf offset 4096, 1 differing byte of $($pristine.Length))"
Write-Output "[PASS] CCHLIB S: $($leafRanges.Count) DQK DUNGCOM/WILDCOM leaves byte-exact, $totalLeafBytes bytes"

Clear-GbwsPlacementOffsets (Join-Path $run "8X8DB0.GBW") (Join-Path $run "8X8DB0Z.GBW")

$zeroLines = @(
  "@echo off",
  ('mount C "{0}"' -f $run),
  "C:",
  "CCFP C:\WALLS.BIN /F C:\8X8DB0Z.GBW /R > C:\GBWFPZ.TXT",
  "ren GBWVIEW.RAW GBWFZ.RAW",
  "exit"
)
$zeroConf = Join-Path $run "_cchlib_dqk_art_zero_offsets.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
$($zeroLines -join "`r`n")
"@ | Set-Content -Path $zeroConf -Encoding ASCII

$zp = Start-DosBoxSmoke -Dosbox $dosbox -Conf $zeroConf -Headless:$Headless
if (-not $zp.WaitForExit(60000)) {
  try { $zp.Kill() } catch {}
  throw "DOSBox did not exit while running CCFP zero-offset GBWS smoke test"
}

foreach ($w in $wallCases) {
  $path = Join-Path $run "$($w.Label)W.TXT"
  if (-not (Test-Path $path)) {
    throw "$($w.Label) wall summary failed: output missing"
  }
  $text = Get-Content $path
  $expected = @(
    "images: $($w.Images)",
    "wallSets47: $($w.Sets)",
    "remainder: $($w.Remainder)",
    "method21: $($w.Images)",
    "badMethods: 0",
    "groups: 10,10,9,9,9"
  )
  foreach ($line in $expected) {
    if ($text -notcontains $line) {
      throw "$($w.Label) wall summary failed: expected '$line', got: $($text -join '; ')"
    }
  }
  Write-Output "[PASS] $($w.Label): $($w.Sets)x47 wall-set groups"

  $bundlePath = Join-Path $run "$($w.Label)0.GBW"
  if (-not (Test-Path $bundlePath)) {
    throw "$($w.Label) wall bundle failed: GBWS output missing"
  }
  $bundle = [IO.File]::ReadAllBytes($bundlePath)
  if ([Text.Encoding]::ASCII.GetString($bundle, 0, 4) -ne "GBWS") {
    throw "$($w.Label) wall bundle failed: bad GBWS magic"
  }
  $version = [BitConverter]::ToUInt16($bundle, 4)
  $setIndex = [BitConverter]::ToUInt16($bundle, 6)
  $count = [BitConverter]::ToUInt16($bundle, 8)
  $groups = @($bundle[10], $bundle[11], $bundle[12], $bundle[13], $bundle[14])
  if ($version -ne 2 -or $setIndex -ne 0 -or $count -ne 47 -or (($groups -join ",") -ne "10,10,9,9,9")) {
    throw "$($w.Label) wall bundle failed: unexpected GBWS header"
  }
  $offset = 16
  $sawPlacementOffset = $false
  for ($i = 0; $i -lt 47; $i++) {
    if ([Text.Encoding]::ASCII.GetString($bundle, $offset, 4) -ne "GBWI") {
      throw "$($w.Label) wall bundle failed: bad GBWI magic at image $i"
    }
    $local = [BitConverter]::ToUInt16($bundle, $offset + 4)
    $global = [BitConverter]::ToUInt16($bundle, $offset + 6)
    $width = [BitConverter]::ToUInt16($bundle, $offset + 8)
    $height = [BitConverter]::ToUInt16($bundle, $offset + 10)
    $npix = [BitConverter]::ToUInt16($bundle, $offset + 12)
    $method = $bundle[$offset + 18]
    $group = $bundle[$offset + 19]
    $yoff = [BitConverter]::ToInt16($bundle, $offset + 20)
    $xoff = [BitConverter]::ToInt16($bundle, $offset + 22)
    if ($yoff -ne 0 -or $xoff -ne 0) { $sawPlacementOffset = $true }
    $expectedGroup = if ($i -lt 10) { 1 } elseif ($i -lt 20) { 2 } elseif ($i -lt 29) { 3 } elseif ($i -lt 38) { 4 } else { 5 }
    if ($local -ne $i -or $global -ne $i -or $method -ne 21 -or $group -ne $expectedGroup -or $npix -ne ($width * $height)) {
      throw "$($w.Label) wall bundle failed: bad image header at image $i"
    }
    $offset += 24 + $npix + 768
  }
  if ($offset -ne $bundle.Length) {
    throw "$($w.Label) wall bundle failed: parsed length $offset, actual $($bundle.Length)"
  }
  if ($w.Label -eq "8X8DB" -and -not $sawPlacementOffset) {
    throw "$($w.Label) wall bundle failed: expected non-zero HLIB placement offsets"
  }
  Write-Output "[PASS] $($w.Label): GBWS wall-set bundle"
}

$multiBundlePath = Join-Path $run "8X8DB3.GBW"
if (-not (Test-Path $multiBundlePath)) {
  throw "8X8DB multi wall bundle failed: GBWS output missing"
}
$multi = [IO.File]::ReadAllBytes($multiBundlePath)
if ([Text.Encoding]::ASCII.GetString($multi, 0, 4) -ne "GBWS") {
  throw "8X8DB multi wall bundle failed: bad GBWS magic"
}
$multiCount = [BitConverter]::ToUInt16($multi, 8)
if ([BitConverter]::ToUInt16($multi, 4) -ne 2 -or [BitConverter]::ToUInt16($multi, 6) -ne 0 -or $multiCount -ne 141) {
  throw "8X8DB multi wall bundle failed: unexpected GBWS header"
}
$offset = 16
for ($i = 0; $i -lt $multiCount; $i++) {
  if ([Text.Encoding]::ASCII.GetString($multi, $offset, 4) -ne "GBWI") {
    throw "8X8DB multi wall bundle failed: bad GBWI magic at image $i"
  }
  $local = [BitConverter]::ToUInt16($multi, $offset + 4)
  $global = [BitConverter]::ToUInt16($multi, $offset + 6)
  $width = [BitConverter]::ToUInt16($multi, $offset + 8)
  $height = [BitConverter]::ToUInt16($multi, $offset + 10)
  $npix = [BitConverter]::ToUInt16($multi, $offset + 12)
  $method = $multi[$offset + 18]
  $group = $multi[$offset + 19]
  $localInSet = $i % 47
  $expectedGroup = if ($localInSet -lt 10) { 1 } elseif ($localInSet -lt 20) { 2 } elseif ($localInSet -lt 29) { 3 } elseif ($localInSet -lt 38) { 4 } else { 5 }
  if ($local -ne $i -or $global -ne $i -or $method -ne 21 -or $group -ne $expectedGroup -or $npix -ne ($width * $height)) {
    throw "8X8DB multi wall bundle failed: bad image header at image $i"
  }
  $offset += 24 + $npix + 768
}
if ($offset -ne $multi.Length) {
  throw "8X8DB multi wall bundle failed: parsed length $offset, actual $($multi.Length)"
}
Write-Output "[PASS] 8X8DB: 3x47 GBWS multi-wall-set bundle"

function Assert-PreviewRaw([string]$Path, [int]$MinNonzero, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $preview = [IO.File]::ReadAllBytes($Path)
  $previewWidth = [BitConverter]::ToUInt16($preview, 0)
  $previewHeight = [BitConverter]::ToUInt16($preview, 2)
  $expectedPreviewLen = 4 + (320 * 200) + 768
  if ($previewWidth -ne 320 -or $previewHeight -ne 200 -or $preview.Length -ne $expectedPreviewLen) {
    throw "$Label failed: got ${previewWidth}x${previewHeight} length $($preview.Length), expected 320x200 length $expectedPreviewLen"
  }
  $nonzero = 0
  for ($i = 4; $i -lt (4 + 320 * 200); $i++) {
    if ($preview[$i] -ne 0) { $nonzero++ }
  }
  if ($nonzero -lt $MinNonzero) {
    throw "$Label failed: rendered framebuffer looks empty ($nonzero nonzero pixels)"
  }
}

function Assert-GbwsOffsetDirectionRaw([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCFP GBWS offset direction failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 320 * 200 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "CCFP GBWS offset direction failed: invalid RAW header/length"
  }

  $hits = @()
  for ($y = 8; $y -lt 176; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 8; $x -lt 176; $x++) {
      if ($bytes[$row + $x] -eq 42) {
        $hits += @{ X = $x; Y = $y }
      }
    }
  }
  if ($hits.Count -ne 1) {
    throw "CCFP GBWS offset direction failed: expected one sentinel pixel, got $($hits.Count)"
  }

  $hit = $hits[0]
  if ($hit.X -ne 36 -or $hit.Y -ne 92) {
    throw "CCFP GBWS offset direction failed: expected sentinel at 36,92, got $($hit.X),$($hit.Y)"
  }
  $reversed = $bytes[4 + (98 * 320) + 44]
  if ($reversed -eq 42) {
    throw "CCFP GBWS offset direction failed: old reversed offset position 44,98 is still lit"
  }
}

function Assert-GbwsPaletteCompositionRaw([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCFP GBWS palette composition failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 320 * 200 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "CCFP GBWS palette composition failed: invalid RAW header/length"
  }

  $hits = @()
  for ($y = 8; $y -lt 176; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 8; $x -lt 176; $x++) {
      if ($bytes[$row + $x] -eq 96) {
        $hits += @{ X = $x; Y = $y }
      }
    }
  }
  if ($hits.Count -ne 1) {
    throw "CCFP GBWS palette composition failed: expected one palette sentinel pixel, got $($hits.Count)"
  }
  $hit = $hits[0]
  if ($hit.X -ne 40 -or $hit.Y -ne 95) {
    throw "CCFP GBWS palette composition failed: expected sentinel at 40,95, got $($hit.X),$($hit.Y)"
  }

  $pal = 4 + (320 * 200) + (96 * 3)
  if ($bytes[$pal + 0] -ne 12 -or $bytes[$pal + 1] -ne 200 -or $bytes[$pal + 2] -ne 36) {
    throw "CCFP GBWS palette composition failed: palette slot 96 was not merged from the later GBWI"
  }
}

function Assert-GbwsTransparentClipRaw([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCFP GBWS transparent clip failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 320 * 200 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "CCFP GBWS transparent clip failed: invalid RAW header/length"
  }

  $hits = @()
  $transparentPainted = 0
  for ($y = 8; $y -lt 176; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 8; $x -lt 176; $x++) {
      $pixel = $bytes[$row + $x]
      if ($pixel -eq 77) {
        $hits += @{ X = $x; Y = $y }
      } elseif ($pixel -eq 255) {
        $transparentPainted++
      }
    }
  }
  if ($hits.Count -ne 1) {
    throw "CCFP GBWS transparent clip failed: expected one visible sentinel pixel, got $($hits.Count)"
  }
  $hit = $hits[0]
  if ($hit.X -ne 37 -or $hit.Y -ne 92) {
    throw "CCFP GBWS transparent clip failed: expected sentinel at 37,92, got $($hit.X),$($hit.Y)"
  }
  if ($transparentPainted -ne 0) {
    throw "CCFP GBWS transparent clip failed: transparent key 255 painted $transparentPainted pixels"
  }
}

function Assert-RawDifferent([string]$LeftPath, [string]$RightPath, [int]$MinDifferent, [string]$Label) {
  if (-not (Test-Path $LeftPath)) {
    throw "$Label failed: left RAW output missing"
  }
  if (-not (Test-Path $RightPath)) {
    throw "$Label failed: right RAW output missing"
  }
  $left = [IO.File]::ReadAllBytes($LeftPath)
  $right = [IO.File]::ReadAllBytes($RightPath)
  if ($left.Length -ne $right.Length) {
    throw "$Label failed: RAW lengths differ ($($left.Length) vs $($right.Length))"
  }
  $leftWidth = [BitConverter]::ToUInt16($left, 0)
  $leftHeight = [BitConverter]::ToUInt16($left, 2)
  $rightWidth = [BitConverter]::ToUInt16($right, 0)
  $rightHeight = [BitConverter]::ToUInt16($right, 2)
  if ($leftWidth -ne $rightWidth -or $leftHeight -ne $rightHeight) {
    throw "$Label failed: RAW dimensions differ (${leftWidth}x${leftHeight} vs ${rightWidth}x${rightHeight})"
  }
  $different = 0
  $pixelEnd = 4 + ($leftWidth * $leftHeight)
  for ($i = 4; $i -lt $pixelEnd; $i++) {
    if ($left[$i] -ne $right[$i]) { $different++ }
  }
  if ($different -lt $MinDifferent) {
    throw "$Label failed: outputs differ at only $different pixels, expected at least $MinDifferent"
  }
}

function Get-ExpectedGbwsIndex([int]$Piece, [int]$Slot, [int]$Count) {
  $groupBase = @(0, 0, 10, 20, 29, 38)
  $pieceExtra = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 0)
  $piecePlain = @(0, 1, 2, 3, 4, 5, 6, 7, 8, 0)
  if ($Piece -lt 0 -or $Piece -ge 10) {
    throw "bad CCFP piece index in GBWS plan: $Piece"
  }
  $s = $Slot -band 0x0f
  if ($s -le 0) {
    throw "bad CCFP wall slot in GBWS plan: $Slot"
  }
  $set = [Math]::Floor(($s - 1) / 5)
  $group = (($s - 1) % 5) + 1
  if ($group -gt 2 -and $Piece -eq 9) {
    return -1
  }
  $local = $groupBase[$group]
  if ($group -le 2) {
    $local += $pieceExtra[$Piece]
  } else {
    $local += $piecePlain[$Piece]
  }
  $global = ($set * 47) + $local
  if ($set -lt 3 -and $global -lt $Count) {
    return $global
  }
  return $local
}

function Assert-GbwsPlanIndexes([string]$Path, [int]$Count) {
  if (-not (Test-Path $Path)) {
    throw "CCFP GBWS /F /P plan failed: PLAN.TXT missing"
  }
  $lines = Get-Content $Path
  $seen = 0
  $sawSet1 = $false
  $sawSet2 = $false
  $sawSkippedCap = $false
  foreach ($line in $lines) {
    if ($line -notmatch '^\s*piece=(-?\d+) slot=(-?\d+) colStart=(-?\d+) rowStart=(-?\d+) gbwIndex=(-?\d+)\s*$') {
      throw "CCFP GBWS /F /P plan failed: malformed line '$line'"
    }
    $piece = [int]$Matches[1]
    $slot = [int]$Matches[2]
    $idx = [int]$Matches[5]
    $expected = Get-ExpectedGbwsIndex $piece $slot $Count
    if ($idx -ne $expected) {
      throw "CCFP GBWS /F /P plan failed: piece $piece slot $slot expected gbwIndex $expected, got $idx"
    }
    if ($idx -eq -1) { $sawSkippedCap = $true }
    if ($idx -ge 47 -and $idx -lt 94) { $sawSet1 = $true }
    if ($idx -ge 94) { $sawSet2 = $true }
    $seen++
  }
  if ($seen -lt 10) {
    throw "CCFP GBWS /F /P plan failed: expected a rich placement plan, got $seen lines"
  }
  if (-not $sawSet1 -or -not $sawSet2) {
    throw "CCFP GBWS /F /P plan failed: did not exercise all three GBWS wall-set bands"
  }
  if (-not $sawSkippedCap) {
    throw "CCFP GBWS /F /P plan failed: did not exercise skipped far-cap images for groups 3-5"
  }
}

Assert-GbwsPlanIndexes (Join-Path $run "GBWPLAN.PLT") $multiCount
Write-Output "[PASS] CCFP: GBWS /F /P image-index plan"

$previewPath = Join-Path $run "GBWQ.RAW"
if (-not (Test-Path $previewPath)) {
  throw "CCFP GBWS contact preview failed: GBWQ.RAW missing"
}
Assert-PreviewRaw $previewPath 1000 "CCFP GBWS contact preview"
Write-Output "[PASS] CCFP: GBWS /Q /R preview RAW"

$fpPreviewPath = Join-Path $run "GBWF.RAW"
if (-not (Test-Path $fpPreviewPath)) {
  throw "CCFP GBWS first-person preview failed: GBWF.RAW missing"
}
Assert-PreviewRaw $fpPreviewPath 1000 "CCFP GBWS first-person preview"
Write-Output "[PASS] CCFP: GBWS /F /R first-person RAW"

$offsetDirectionPath = Join-Path $run "GBWOFF.RAW"
Assert-GbwsOffsetDirectionRaw $offsetDirectionPath
Write-Output "[PASS] CCFP: GBWS signed placement offsets move up/left"

$paletteCompositionPath = Join-Path $run "GBWPAL.RAW"
Assert-GbwsPaletteCompositionRaw $paletteCompositionPath
Write-Output "[PASS] CCFP: GBWS palette windows compose across images"

$transparentClipPath = Join-Path $run "GBWCLIP.RAW"
Assert-GbwsTransparentClipRaw $transparentClipPath
Write-Output "[PASS] CCFP: GBWS transparent-key clipping exact pixel"

$fpCPreviewPath = Join-Path $run "GBWFC.RAW"
if (-not (Test-Path $fpCPreviewPath)) {
  throw "CCFP 8X8DC GBWS first-person preview failed: GBWFC.RAW missing"
}
Assert-PreviewRaw $fpCPreviewPath 20 "CCFP 8X8DC GBWS first-person preview"
Assert-RawDifferent $fpPreviewPath $fpCPreviewPath 20 "CCFP 8X8DC first-person source selection"
Write-Output "[PASS] CCFP: 8X8DC GBWS /F /R first-person RAW"

$fpTextPreviewPath = Join-Path $run "GBWFTE.RAW"
if (-not (Test-Path $fpTextPreviewPath)) {
  throw "CCFP GBWS /E first-person preview failed: GBWFTE.RAW missing"
}
Assert-PreviewRaw $fpTextPreviewPath 20 "CCFP GBWS /E first-person preview"
Assert-TextOverlayRaw $fpTextPreviewPath "CCFP GBWS /E text overlay"
Assert-RawDifferent $fpPreviewPath $fpTextPreviewPath 20 "CCFP GBWS /E text overlay"
Write-Output "[PASS] CCFP: GBWS /F /E /R text overlay RAW"

$fpSnapPreviewPath = Join-Path $run "GBWFS.RAW"
if (-not (Test-Path $fpSnapPreviewPath)) {
  throw "CCFP GBWS /E /S first-person snapshot failed: GBWFS.RAW missing"
}
Assert-PreviewRaw $fpSnapPreviewPath 20 "CCFP GBWS /E /S first-person snapshot"
Assert-TextOverlayRaw $fpSnapPreviewPath "CCFP GBWS /E /S text overlay"
Assert-RawDifferent $fpPreviewPath $fpSnapPreviewPath 20 "CCFP GBWS /E /S text overlay"
Write-Output "[PASS] CCFP: GBWS /F /E /S CCFPVIEW.RAW snapshot"

$fpClockPreviewPath = Join-Path $run "GBWCLK.RAW"
if (-not (Test-Path $fpClockPreviewPath)) {
  throw "CCFP GBWS /E clock first-person snapshot failed: GBWCLK.RAW missing"
}
Assert-PreviewRaw $fpClockPreviewPath 20 "CCFP GBWS /E clock first-person snapshot"
Assert-TextOverlayRaw $fpClockPreviewPath "CCFP GBWS /E GBCL clock overlay"
Assert-SkyBackdropRaw $fpClockPreviewPath "CCFP GBWS /E GBCL sky backdrop"
Write-Output "[PASS] CCFP: GBWS /F /E /S GBCL sky backdrop RAW"

$fpZeroPreviewPath = Join-Path $run "GBWFZ.RAW"
if (-not (Test-Path $fpZeroPreviewPath)) {
  throw "CCFP GBWS zero-offset first-person preview failed: GBWFZ.RAW missing"
}
Assert-PreviewRaw $fpZeroPreviewPath 1000 "CCFP GBWS zero-offset first-person preview"
Assert-RawDifferent $fpPreviewPath $fpZeroPreviewPath 100 "CCFP GBWS placement offsets"
Write-Output "[PASS] CCFP: GBWS placement offsets affect first-person RAW"

$fpMultiPreviewPath = Join-Path $run "GBWF3.RAW"
if (-not (Test-Path $fpMultiPreviewPath)) {
  throw "CCFP GBWS multi-set first-person preview failed: GBWF3.RAW missing"
}
Assert-PreviewRaw $fpMultiPreviewPath 1000 "CCFP GBWS multi-set first-person preview"
Assert-RawDifferent $fpPreviewPath $fpMultiPreviewPath 1000 "CCFP GBWS multi-set first-person band selection"
Write-Output "[PASS] CCFP: GBWS /F /R multi-set first-person RAW"

$badGbwText = Join-Path $run "BADGBW.TXT"
if (-not (Test-Path $badGbwText) -or ((Get-Content $badGbwText -Raw) -notmatch "cannot open walls file")) {
  throw "CCFP oversized GBWS image guard failed"
}
Write-Output "[PASS] CCFP: oversized GBWS image rejected"

$badNpixQText = Join-Path $run "BADNPXQ.TXT"
if (-not (Test-Path $badNpixQText) -or ((Get-Content $badNpixQText -Raw) -notmatch "cannot open walls file")) {
  throw "CCFP malformed GBWS npix contact guard failed"
}
$badNpixFText = Join-Path $run "BADNPXF.TXT"
if (-not (Test-Path $badNpixFText) -or ((Get-Content $badNpixFText -Raw) -notmatch "cannot open walls file")) {
  throw "CCFP malformed GBWS npix first-person guard failed"
}
Write-Output "[PASS] CCFP: malformed GBWS pixel-count rejected"

foreach ($c in $cases) {
  $path = Join-Path $run "$($c.Label).RAW"
  if (-not (Test-Path $path)) {
    throw "$($c.Label) failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($path)
  $width = [BitConverter]::ToUInt16($bytes, 0)
  $height = [BitConverter]::ToUInt16($bytes, 2)
  $expectedLen = 4 + ($c.Width * $c.Height) + 768
  if ($width -ne $c.Width -or $height -ne $c.Height -or $bytes.Length -ne $expectedLen) {
    throw "$($c.Label) failed: got ${width}x${height} length $($bytes.Length), expected $($c.Width)x$($c.Height) length $expectedLen"
  }
  Write-Output "[PASS] $($c.Label): ${width}x${height} RAW"
}

Write-Output "RESULT: CCHLIB DQK HLIB art smoke PASS"
