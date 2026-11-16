# ccflow-test.ps1 -- lossless CCECL GBSX sidecar transport regression.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccflow-test'
$otherDrive = Join-Path $run 'other-drive'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

& (Join-Path $native 'build.ps1') -Target ccecl
& (Join-Path $native 'build.ps1') -Target ccflow
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
New-Item -ItemType Directory -Force $otherDrive | Out-Null
Copy-Item (Join-Path $build 'ccecl.com') (Join-Path $run 'CCECL.COM') -Force
Copy-Item (Join-Path $build 'ccflow.com') (Join-Path $run 'CCFLOW.COM') -Force

function Add-Byte([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [void]$Bytes.Add([byte]($Value -band 0xff))
}
function Add-Imm([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  Add-Byte $Bytes 0
  Add-Byte $Bytes $Value
}
function New-Block {
  $b = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { Add-Byte $b 0 }
  return ,$b
}

# Prefix ownership plus 129 records forces two 64-record replays and one final
# record. The final EFX must retain the native prefix while GBSL retains all
# player-visible host effects in their original order.
$full = New-Block
Add-Byte $full 0x21; Add-Imm $full 34; Add-Imm $full 2; Add-Imm $full 255
1..129 | ForEach-Object { Add-Byte $full 0x0e; Add-Imm $full $_ }
Add-Byte $full 0
[IO.File]::WriteAllBytes((Join-Path $run 'FULL.BIN'), $full.ToArray())

# A v1-only stream may exceed the 16-bit row-seek extent used by v2.  It
# remains sequential and must retain the established u16 count contract.
$largeV1 = New-Block
1..1214 | ForEach-Object { Add-Byte $largeV1 0x0e; Add-Imm $largeV1 ($_ % 255) }
Add-Byte $largeV1 0
[IO.File]::WriteAllBytes((Join-Path $run 'LARGE.BIN'), $largeV1.ToArray())

$plain = New-Block
Add-Byte $plain 0x0e; Add-Imm $plain 7
Add-Byte $plain 0
[IO.File]::WriteAllBytes((Join-Path $run 'PLAIN.BIN'), $plain.ToArray())

function Invoke-Guest([string]$Name, [string]$Command) {
  $conf = Join-Path $run "_$Name.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$otherDrive"
D:
$Command
exit
"@ | Set-Content -Path $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "DOSBox did not exit during CCFLOW $Name"
  }
}

foreach ($stale in @('FLOW.GBS', 'FLOW.GBT', 'FLOW.GBP')) {
  if (Test-Path (Join-Path $run $stale)) { throw "CCFLOW cold-start control unexpectedly has $stale" }
}
Invoke-Guest 'full' 'C:\CCFLOW C:\FULL.BIN /E C:\FLOW.EFX > C:\FLOW.TXT'

$effect = [IO.File]::ReadAllBytes((Join-Path $run 'FLOW.EFX'))
$side = [IO.File]::ReadAllBytes((Join-Path $run 'FLOW.GBS'))
function U16([byte[]]$Bytes, [int]$Offset) { [BitConverter]::ToUInt16($Bytes, $Offset) }
if (
  $effect.Length -ne 5750 -or
  [Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
  (U16 $effect 4) -ne 9 -or
  ((U16 $effect 6) -band 0x0121) -ne 0x0121 -or
  (U16 $effect 8) -ne 0 -or
  (U16 $effect 10) -ne 34 -or
  (U16 $effect 12) -ne 34 -or
  (U16 $effect 14) -ne 2 -or
  (U16 $effect 16) -ne 255 -or
  [Text.Encoding]::ASCII.GetString($effect, 2246, 4) -ne 'GBSX' -or
  (U16 $effect 2250) -ne 1 -or
  (U16 $effect 2252) -ne 0x000e -or
  (U16 $effect 2256) -ne 129
) { throw 'CCFLOW full replay did not preserve terminal GBEF prefix/tail' }
if (
  $side.Length -ne (8 + 129 * 54) -or
  [Text.Encoding]::ASCII.GetString($side, 0, 4) -ne 'GBSL' -or
  (U16 $side 4) -ne 1 -or
  (U16 $side 6) -ne 129
) { throw 'CCFLOW full replay did not publish the exact GBSL v1 shape' }
for ($i = 0; $i -lt 129; $i++) {
  $offset = 8 + $i * 54
  if ((U16 $side $offset) -ne 0x000e -or (U16 $side ($offset + 2)) -ne 1 -or (U16 $side ($offset + 4)) -ne ($i + 1)) {
    throw "CCFLOW sidecar record $i lost source ordering or operands"
  }
  if ((U16 $side ($offset + 20)) -ne 0) { throw "CCFLOW sidecar record $i carried unexpected text" }
}

Invoke-Guest 'large-v1' 'C:\CCFLOW C:\LARGE.BIN /E C:\LARGE.EFX > C:\LARGE.TXT'
$largeSide = [IO.File]::ReadAllBytes((Join-Path $run 'LARGE.GBS'))
if ($largeSide.Length -ne (8 + 1214 * 54) -or (U16 $largeSide 4) -ne 1 -or (U16 $largeSide 6) -ne 1214) {
  throw 'CCFLOW truncated or rejected a v1 sidecar beyond 64 KiB'
}
foreach ($i in @(0, 63, 64, 1213)) {
  if ((U16 $largeSide (8 + $i * 54)) -ne 0x0e) { throw "CCFLOW large v1 row $i lost source order" }
}

# A fresh non-saturated call using the same effect path must erase the old
# sibling. Otherwise a later normal event could replay a previous route.
Invoke-Guest 'plain' 'C:\CCFLOW C:\PLAIN.BIN /E C:\FLOW.EFX > C:\PLAIN.TXT'
if (Test-Path (Join-Path $run 'FLOW.GBS')) { throw 'CCFLOW retained a stale GBSL sibling after a normal call' }
$plainEffect = [IO.File]::ReadAllBytes((Join-Path $run 'FLOW.EFX'))
if (((U16 $plainEffect 6) -band 0x0100) -ne 0 -or (U16 $plainEffect 2250) -ne 1 -or (U16 $plainEffect 2256) -ne 7) {
  throw 'CCFLOW marked an ordinary terminal effect as sidecar-backed'
}

# ---- HLIB (DQK ECL.GLB) replay ------------------------------------------------
# CCECL loads the Gen2 member itself and CCFLOW only forwards its tail, so the
# same transport must carry a real HLIB route.  DQK area 26 saturates direct
# CCECL at SCRIPTCAP (GBSX count 64, v15 status 4); CCFLOW must report the true
# count in a GBSL sidecar.  The retail file is only copied, never written.
$dqkGlb = Join-Path $root 'The Dark Queen of Krynn\DISK3\ECL.GLB'
if (-not (Test-Path -LiteralPath $dqkGlb)) {
  Write-Host 'SKIP: CCFLOW HLIB case (DQK DISK3\ECL.GLB absent)'
} else {
  Copy-Item -LiteralPath $dqkGlb (Join-Path $run 'DQKECL.GLB') -Force
  # Corrupt copies. BADID: area 26's id-table entry no longer names area 26.
  # BADMAG: the HLIB magic is damaged.
  $glb = [IO.File]::ReadAllBytes($dqkGlb)
  if ([Text.Encoding]::ASCII.GetString($glb, 0, 4) -ne 'HLIB') { throw 'DQK ECL.GLB is not HLIB' }
  $idOff = [BitConverter]::ToUInt32($glb, 16)
  $idCount = [BitConverter]::ToUInt16($glb, $idOff)
  $hit = -1
  for ($i = 0; $i -lt $idCount; $i++) {
    if ([BitConverter]::ToUInt16($glb, $idOff + 2 + 4 * $i) -eq 26) { $hit = $idOff + 2 + 4 * $i }
  }
  if ($hit -lt 0) { throw 'DQK ECL.GLB id table has no area 26' }
  $badId = $glb.Clone(); $badId[$hit] = 0xFE; $badId[$hit + 1] = 0x7F
  [IO.File]::WriteAllBytes((Join-Path $run 'BADID.GLB'), $badId)
  $badMag = $glb.Clone(); $badMag[3] = [byte][char]'X'
  [IO.File]::WriteAllBytes((Join-Path $run 'BADMAG.GLB'), $badMag)
  # Stale sibling that a rejected run must remove rather than leave readable.
  foreach ($n in 'BADID', 'BADMAG') { [IO.File]::WriteAllBytes((Join-Path $run "$n.GBS"), [byte[]](1, 2, 3)) }

  Invoke-Guest 'hlib' 'C:\CCECL C:\DQKECL.GLB 26 /E C:\D26.EFX > C:\D26.TXT
C:\CCFLOW C:\DQKECL.GLB 26 /E C:\H26.EFX > C:\H26.TXT
C:\CCFLOW C:\BADID.GLB 26 /E C:\BADID.EFX > C:\BADID.TXT
C:\CCFLOW C:\BADMAG.GLB 26 /E C:\BADMAG.EFX > C:\BADMAG.TXT'

  $direct = [IO.File]::ReadAllBytes((Join-Path $run 'D26.EFX'))
  if ((U16 $direct 4) -ne 15 -or (U16 $direct 8) -ne 4 -or (U16 $direct 2250) -ne 64 -or
      [Text.Encoding]::ASCII.GetString($direct, 2246, 4) -ne 'GBSX') {
    throw "direct CCECL DQK area 26 is not the saturated v15 status-4 control (ver $(U16 $direct 4) status $(U16 $direct 8) count $(U16 $direct 2250))"
  }
  $heff = [IO.File]::ReadAllBytes((Join-Path $run 'H26.EFX'))
  $hside = [IO.File]::ReadAllBytes((Join-Path $run 'H26.GBS'))
  $hcount = U16 $hside 6
  if ([Text.Encoding]::ASCII.GetString($hside, 0, 4) -ne 'GBSL' -or (U16 $hside 4) -ne 1 -or
      $hside.Length -ne (8 + $hcount * 54)) { throw 'CCFLOW HLIB sidecar is not a well-formed GBSL v1' }
  if ($hcount -le 64) { throw "CCFLOW HLIB GBSL count $hcount does not exceed SCRIPTCAP" }
  if (((U16 $heff 6) -band 0x0100) -eq 0) { throw 'CCFLOW HLIB terminal effect lacks FX_HAVE_SIDECAR' }
  if ((U16 $heff 8) -ne 0) { throw "CCFLOW HLIB terminal status $(U16 $heff 8) is not a completed run" }
  # Loop-marker control: a genuinely terminating long stream must NOT carry the
  # CCFLOW loop reason (GBHD reason 10) that a repeated-state publish sets.
  $hdAt = -1; for ($i = 0; $i -lt $heff.Length - 6; $i++) { if ($heff[$i] -eq 0x47 -and $heff[$i+1] -eq 0x42 -and $heff[$i+2] -eq 0x48 -and $heff[$i+3] -eq 0x44) { $hdAt = $i } }
  if ($hdAt -lt 0) { throw 'CCFLOW HLIB terminal effect has no GBHD' }
  if ((U16 $heff ($hdAt + 4)) -eq 10) { throw 'CCFLOW area 26 (terminating) carries the loop-detected GBHD reason' }
  for ($i = 0; $i -lt 64; $i++) {
    $ev = [byte[]]$direct[(2252 + 20 * $i)..(2252 + 20 * $i + 19)]
    $tx = [byte[]]$direct[(3532 + 34 * $i)..(3532 + 34 * $i + 33)]
    $row = [byte[]]$hside[(8 + 54 * $i)..(8 + 54 * $i + 53)]
    if ([Convert]::ToBase64String($row) -ne [Convert]::ToBase64String([byte[]]($ev + $tx))) {
      throw "CCFLOW HLIB GBSL record $i differs from direct CCECL's saturated GBSX"
    }
  }
  foreach ($n in 'BADID', 'BADMAG') {
    foreach ($ext in 'GBS', 'GBT', 'GBP') {
      if (Test-Path (Join-Path $run "$n.$ext")) { throw "CCFLOW wrote or kept $n.$ext for a corrupted HLIB" }
    }
    $txt = Get-Content (Join-Path $run "$n.TXT") -Raw
    if ($txt -notmatch 'CCFLOW: CCECL (child failed|returned failure)') { throw "CCFLOW did not reject corrupted $n (output: $txt)" }
  }
  Write-Host "HLIB area 26: direct GBSX 64 (saturated, status 4) -> CCFLOW GBSL count $hcount, flags $('{0:X4}' -f (U16 $heff 6)), first 64 records identical"
}

Write-Host 'RESULT: CCFLOW lossless v1 GBSL replay, >64 KiB extent, cold-start, stale-sidecar rejection and HLIB (DQK area 26) true-count sidecar PASS'
