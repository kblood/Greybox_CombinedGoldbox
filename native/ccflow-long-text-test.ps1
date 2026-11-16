# Exact first DoK ECL1#16 PRINTCLEAR through CCECL/CCFLOW/GBSL/CCFP.
# The retail archive is read-only; only the disposable decoded block's opcode
# at 222 becomes EXIT, isolating the proven literal from unproven 0x1D logic.
param([switch]$Headless, [switch]$GameLinkPaging)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$run = Join-Path $build 'ccflow-long-text-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($name in @('ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'DKK.CFG')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: DoK packed-text transport ($name absent)"
    exit 0
  }
}
if (-not (Test-Path $dosbox)) {
  Write-Output 'SKIP: DoK packed-text transport (DOSBox absent)'
  exit 0
}
if ((Get-FileHash (Join-Path $game 'ECL1.DAX') -Algorithm SHA256).Hash.ToLowerInvariant() -ne
    'd2fe2c3937dfc71d692aa60e3e54d251a9a52dd708a457b04859090e2664dd44') {
  throw 'DoK source ECL1.DAX hash changed; fixture evidence needs rechecking'
}

function U16([byte[]]$Bytes, [int]$Offset) { [BitConverter]::ToUInt16($Bytes, $Offset) }
function U32([byte[]]$Bytes, [int]$Offset) { [BitConverter]::ToUInt32($Bytes, $Offset) }
function Set-U16([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  [BitConverter]::GetBytes([UInt16]$Value).CopyTo($Bytes, $Offset)
}
function Get-HexSha256([byte[]]$Bytes) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($hash.ComputeHash($Bytes)).ToLowerInvariant() }
  finally { $hash.Dispose() }
}

$archive = [IO.File]::ReadAllBytes((Join-Path $game 'ECL1.DAX'))
$tocLen = U16 $archive 0
if (($tocLen % 9) -ne 0) { throw 'DoK DAX TOC shape changed' }
function Get-DaxBlock([byte[]]$Archive, [int]$TocLength, [int]$BlockId) {
  $entry = -1
  for ($i = 0; $i -lt ($TocLength / 9); $i++) {
    $at = 2 + $i * 9
    if ($Archive[$at] -eq $BlockId) { $entry = $at; break }
  }
  if ($entry -lt 0) { throw "DoK DAX block $BlockId absent" }
  $rawLen = U16 $Archive ($entry + 5)
  $compLen = U16 $Archive ($entry + 7)
  $compAt = 2 + $TocLength + (U32 $Archive ($entry + 1))
  $out = [Collections.Generic.List[byte]]::new()
  $pos = $compAt
  while ($out.Count -lt $rawLen) {
    if ($pos -ge ($compAt + $compLen)) { throw "DoK block $BlockId compressed data truncated" }
    $flag = [int]$Archive[$pos++]
    if ($flag -lt 128) {
      $n = $flag + 1
      for ($j = 0; $j -lt $n; $j++) { $out.Add($Archive[$pos++]) }
    } else {
      $n = 256 - $flag
      $value = $Archive[$pos++]
      for ($j = 0; $j -lt $n; $j++) { $out.Add($value) }
    }
  }
  return ,$out.ToArray()
}
$sourceBlock = Get-DaxBlock $archive $tocLen 16
$sourceBlock17 = Get-DaxBlock $archive $tocLen 17
if ($sourceBlock.Length -ne 1809 -or
    (Get-HexSha256 $sourceBlock) -ne '35c39ef71e02771e2ff37475b93bc4c74019004488826a151cc53c88311945ea' -or
    $sourceBlock[60] -ne 0x12 -or $sourceBlock[61] -ne 0x80 -or $sourceBlock[62] -ne 159 -or
    $sourceBlock[222] -ne 0x1d) {
  throw 'DoK block 16 first-literal boundaries changed'
}
if ($sourceBlock17.Length -ne 7430 -or
    (Get-HexSha256 $sourceBlock17) -ne '706970e83b631939b99f46fd073d5f2b0a853283da6241982ff5fec57b9cf3bf' -or
    $sourceBlock17[110] -ne 0x12 -or $sourceBlock17[111] -ne 0x80 -or
    $sourceBlock17[112] -ne 108) {
  throw 'DoK block 17 unexecuted literal boundaries changed'
}

function Decode-Packed([byte[]]$Bytes, [int]$Offset, [int]$Length) {
  $text = [Text.StringBuilder]::new()
  $value = 0
  $bits = 0
  for ($i = $Offset; $i -lt ($Offset + $Length); $i++) {
    for ($bit = 7; $bit -ge 0; $bit--) {
      $value = (($value -shl 1) -bor (($Bytes[$i] -shr $bit) -band 1)) -band 63
      $bits++
      if ($bits -eq 6) {
        if ($value -eq 0) { return $text.ToString() }
        $ch = if ($value -le 31) { $value + 64 } else { $value }
        [void]$text.Append([char]$ch)
        $value = 0
        $bits = 0
      }
    }
  }
  return $text.ToString()
}
$expected = Decode-Packed $sourceBlock 63 159
if ($expected.Length -ne 212) { throw "DoK first literal decoded to $($expected.Length), expected 212" }

function Set-PackedChar([byte[]]$Bytes, [int]$Offset, [int]$Index,
                        [int]$OldCode, [int]$NewCode) {
  $bitAt = $Index * 6
  $old = 0
  for ($bit = 0; $bit -lt 6; $bit++) {
    $byteAt = $Offset + [int][Math]::Floor(($bitAt + $bit) / 8)
    $mask = 1 -shl (7 - (($bitAt + $bit) % 8))
    $old = ($old -shl 1) -bor [int](($Bytes[$byteAt] -band $mask) -ne 0)
  }
  if ($old -ne $OldCode) { throw "packed character $Index changed before mutation" }
  for ($bit = 0; $bit -lt 6; $bit++) {
    $byteAt = $Offset + [int][Math]::Floor(($bitAt + $bit) / 8)
    $mask = 1 -shl (7 - (($bitAt + $bit) % 8))
    if ((($NewCode -shr (5 - $bit)) -band 1) -ne 0) {
      $Bytes[$byteAt] = [byte]($Bytes[$byteAt] -bor $mask)
    } else {
      $Bytes[$byteAt] = [byte]($Bytes[$byteAt] -band (0xff -bxor $mask))
    }
  }
}

function New-PrivateDax([object[]]$Entries) {
  $packedBlocks = @()
  $total = 0
  foreach ($entry in $Entries) {
    $packed = [Collections.Generic.List[byte]]::new()
    for ($offset = 0; $offset -lt $entry.Bytes.Length; $offset += 128) {
      $n = [Math]::Min(128, $entry.Bytes.Length - $offset)
      $packed.Add([byte]($n - 1))
      for ($i = 0; $i -lt $n; $i++) { $packed.Add($entry.Bytes[$offset + $i]) }
    }
    $packedBlocks += ,($packed.ToArray())
    $total += $packed.Count
  }
  $dax = [byte[]]::new(2 + 9 * $Entries.Count + $total)
  Set-U16 $dax 0 (9 * $Entries.Count)
  $compressedOffset = 0
  for ($i = 0; $i -lt $Entries.Count; $i++) {
    $row = 2 + 9 * $i
    $dax[$row] = [byte]$Entries[$i].Id
    [BitConverter]::GetBytes([UInt32]$compressedOffset).CopyTo($dax, $row + 1)
    Set-U16 $dax ($row + 5) $Entries[$i].Bytes.Length
    Set-U16 $dax ($row + 7) $packedBlocks[$i].Length
    $packedBlocks[$i].CopyTo($dax, 2 + 9 * $Entries.Count + $compressedOffset)
    $compressedOffset += $packedBlocks[$i].Length
  }
  return ,$dax
}

# A one-entry DAX wraps the exact decoded source block; its only changed byte
# is the first instruction after the proven literal.
$privateBlock = [byte[]]$sourceBlock.Clone()
$privateBlock[222] = 0
$privateDax = New-PrivateDax @(@{ Id = 16; Bytes = $privateBlock })

# Character 126 is T, on page 2 at row 22 / column 10. Changing its six-bit
# symbol to X preserves both packed extent and every instruction boundary.
$changedAt = 126
if ($expected[$changedAt] -cne 'T') { throw 'DoK mutation target changed' }
$changedExpected = $expected.Substring(0, $changedAt) + 'X' + $expected.Substring($changedAt + 1)
$changedBlock = [byte[]]$privateBlock.Clone()
Set-PackedChar $changedBlock 63 $changedAt 20 24
if ((Decode-Packed $changedBlock 63 159) -cne $changedExpected -or
    $changedBlock[222] -ne 0 -or $changedBlock.Length -ne $privateBlock.Length) {
  throw 'selected-block mutation moved the literal or EXIT boundary'
}
$changedDax = New-PrivateDax @(@{ Id = 16; Bytes = $changedBlock })

# A real second source block is present but never selected by CCFLOW. Vary its
# first PRINTCLEAR character in a separate two-entry archive.
$unrelatedBlock = [byte[]]$sourceBlock17.Clone()
$unrelatedChanged = [byte[]]$sourceBlock17.Clone()
if ((Decode-Packed $unrelatedBlock 113 108)[0] -cne 'A') {
  throw 'DoK block 17 isolation character changed'
}
Set-PackedChar $unrelatedChanged 113 0 1 24
if ((Decode-Packed $unrelatedChanged 113 108)[0] -cne 'X' -or
    $unrelatedChanged.Length -ne $unrelatedBlock.Length) {
  throw 'unrelated block mutation changed its literal boundary'
}
$twoBlockDax = New-PrivateDax @(
  @{ Id = 16; Bytes = $privateBlock }, @{ Id = 17; Bytes = $unrelatedBlock })
$unrelatedDax = New-PrivateDax @(
  @{ Id = 16; Bytes = $privateBlock }, @{ Id = 17; Bytes = $unrelatedChanged })

# The same long literal followed by an interactive input yields v14. CCFLOW
# must restore the historical 32-character inline prefix and leave it unflagged.
$menuBlock = [byte[]]$sourceBlock.Clone()
$menuBytes = [byte[]]@(0x0f, 0, 3, 0, 1, 0xC1, 0) # INPUT_NUMBER unused=3, dest=00C1, EXIT
[Array]::Copy($menuBytes, 0, $menuBlock, 222, $menuBytes.Length)
$menuDax = New-PrivateDax @(@{ Id = 16; Bytes = $menuBlock })

& (Join-Path $native 'build.ps1') -Target engine
if (Test-Path $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach ($name in @('CCECL', 'CCFLOW', 'CCEFX', 'CCFP', 'CCGEO', 'CCHOST')) {
  Copy-Item (Join-Path $build "$name.COM") (Join-Path $run "$name.COM") -Force
}
foreach ($name in @('GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'DKK.CFG')) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}
[IO.File]::WriteAllBytes((Join-Path $run 'ECL1.DAX'), $privateDax)
[IO.File]::WriteAllBytes((Join-Path $run 'MUT.DAX'), $changedDax)
[IO.File]::WriteAllBytes((Join-Path $run 'UBASE.DAX'), $twoBlockDax)
[IO.File]::WriteAllBytes((Join-Path $run 'UMUT.DAX'), $unrelatedDax)
[IO.File]::WriteAllBytes((Join-Path $run 'MENU.DAX'), $menuDax)
foreach ($name in @('INTRO.GBS', 'INTRO.GBT', 'INTRO.GBP')) {
  if (Test-Path (Join-Path $run $name)) { throw "cold-start control found stale $name" }
}

$conf = Join-Path $run '_long_text.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
C:
CCFLOW C:\ECL1.DAX 16 /E C:\INTRO.EFX > C:\FLOW.TXT
CCFLOW C:\MUT.DAX 16 /E C:\MUT.EFX > C:\MUTFLOW.TXT
CCFLOW C:\UBASE.DAX 16 /E C:\UBASE.EFX > C:\UBFLOW.TXT
CCFLOW C:\UMUT.DAX 16 /E C:\UMUT.EFX > C:\UMFLOW.TXT
CCFLOW C:\MENU.DAX 16 /! /E C:\MENU.EFX > C:\MENU.TXT
CCECL C:\ECL1.DAX 16 /E C:\DIRECT.EFX > C:\DIRECT.TXT
CCEFX C:\INTRO.EFX C:\DUMP.TXT > C:\EFX.TXT
CCEFX C:\MUT.EFX C:\MUTDUMP.TXT > C:\MUTEFX.TXT
CCEFX C:\UMUT.EFX C:\UMDUMP.TXT > C:\UMEFX.TXT
CCEFX C:\DIRECT.EFX C:\DIRECTD.TXT > C:\DIRECTF.TXT
CCGEO /B C:\GEO1.DAX 34 C:\WALL.BIN > C:\GEO.TXT
CCFP C:\WALL.BIN /E C:\INTRO.EFX /T /S C:\PAGE1.RAW > C:\FP.TXT
CCFP C:\WALL.BIN /E C:\MUT.EFX /T /S C:\MUTPAGE.RAW > C:\MUTFP.TXT
CCFP C:\WALL.BIN /E C:\UBASE.EFX /T /S C:\UBPAGE.RAW > C:\UBFP.TXT
CCFP C:\WALL.BIN /E C:\UMUT.EFX /T /S C:\UMPAGE.RAW > C:\UMFP.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw 'DoK packed-text DOSBox smoke timed out'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $run 'INTRO.EFX'))
$side = [IO.File]::ReadAllBytes((Join-Path $run 'INTRO.GBS'))
if ($effect.Length -ne 5750 -or (U16 $effect 4) -ne 9 -or ((U16 $effect 6) -band 0x0100) -eq 0) {
  throw 'DoK long-text terminal effect was not a flagged v9 GBEF'
}
$count = U16 $side 6
$tail = 8 + 54 * $count
if ($count -lt 1 -or (U16 $side 4) -ne 2 -or
    [Text.Encoding]::ASCII.GetString($side, $tail, 4) -ne 'GBPX' -or
    (U16 $side ($tail + 4)) -ne 1 -or (U16 $side ($tail + 6)) -ne 1 -or
    (U32 $side ($tail + 8)) -ne 159 -or
    $side.Length -ne ($tail + 12 + 8 + 159)) {
  throw 'DoK long-text GBSL v2 header/directory/payload extent is invalid'
}
$entryAt = $tail + 12
$textRow = U16 $side $entryAt
if ($textRow -ge $count -or (U16 $side ($entryAt + 2)) -ne 0 -or
    (U16 $side ($entryAt + 4)) -ne 159 -or (U16 $side ($entryAt + 6)) -ne 212 -or
    (U16 $side (8 + $textRow * 54)) -ne 0x12 -or
    (U16 $side (8 + $textRow * 54 + 20)) -ne 0xffff -or
    [Text.Encoding]::ASCII.GetString($side, 8 + $textRow * 54 + 22, 4) -ne 'GBPX') {
  throw 'DoK long-text directory did not bind the PRINTCLEAR source row'
}
for ($i = 0; $i -lt 159; $i++) {
  if ($side[$entryAt + 8 + $i] -ne $sourceBlock[63 + $i]) { throw "packed byte $i changed" }
}
$dump = Get-Content (Join-Path $run 'DUMP.TXT') -Raw
if (-not $dump.Contains($expected)) { throw 'CCEFX did not stream all 212 decoded source characters' }
$page = [IO.File]::ReadAllBytes((Join-Path $run 'PAGE1.RAW'))
if ($page.Length -ne 64772) { throw 'CCFP did not publish the first visible RAW frame' }
$changedSide = [IO.File]::ReadAllBytes((Join-Path $run 'MUT.GBS'))
$changedEffect = [IO.File]::ReadAllBytes((Join-Path $run 'MUT.EFX'))
$unrelatedBaseSide = [IO.File]::ReadAllBytes((Join-Path $run 'UBASE.GBS'))
$unrelatedChangedSide = [IO.File]::ReadAllBytes((Join-Path $run 'UMUT.GBS'))
$unrelatedBaseEffect = [IO.File]::ReadAllBytes((Join-Path $run 'UBASE.EFX'))
$unrelatedChangedEffect = [IO.File]::ReadAllBytes((Join-Path $run 'UMUT.EFX'))
if ((Get-HexSha256 $effect) -ne (Get-HexSha256 $changedEffect) -or
    (Get-HexSha256 $effect) -ne (Get-HexSha256 $unrelatedBaseEffect) -or
    (Get-HexSha256 $effect) -ne (Get-HexSha256 $unrelatedChangedEffect)) {
  throw 'source mutation changed GBEF pose, picture, RNG, event descriptors, or state'
}
if ($changedSide.Length -ne $side.Length -or
    (Get-HexSha256 $side) -ne (Get-HexSha256 $unrelatedBaseSide) -or
    (Get-HexSha256 $side) -ne (Get-HexSha256 $unrelatedChangedSide)) {
  throw 'unselected block mutation changed selected-block GBSL output'
}
for ($i = 0; $i -lt $side.Length; $i++) {
  $want = if ($i -ge ($entryAt + 8) -and $i -lt ($entryAt + 8 + 159)) {
    $changedBlock[63 + $i - ($entryAt + 8)]
  } else { $side[$i] }
  if ($changedSide[$i] -ne $want) {
    throw "selected-block mutation changed GBSL outside the exact packed source byte at $i"
  }
}
if (-not (Get-Content (Join-Path $run 'MUTDUMP.TXT') -Raw).Contains($changedExpected) -or
    -not (Get-Content (Join-Path $run 'UMDUMP.TXT') -Raw).Contains($expected) -or
    (Get-HexSha256 $page) -ne (Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'MUTPAGE.RAW')))) -or
    (Get-HexSha256 $page) -ne (Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'UBPAGE.RAW')))) -or
    (Get-HexSha256 $page) -ne (Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'UMPAGE.RAW'))))) {
  throw 'source mutations changed first-page text or picture pixels'
}
if ((Test-Path (Join-Path $run 'INTRO.GBT')) -or (Test-Path (Join-Path $run 'INTRO.GBP'))) {
  throw 'CCFLOW retained an unpublished private spool'
}
$menuEffect = [IO.File]::ReadAllBytes((Join-Path $run 'MENU.EFX'))
if ((U16 $menuEffect 4) -ne 14 -or ((U16 $menuEffect 6) -band 0x0100) -ne 0 -or
    (Test-Path (Join-Path $run 'MENU.GBS'))) {
  throw 'long-text v14 menu yield was incorrectly published as a sidecar bridge'
}
$menuCount = U16 $menuEffect 2250
$menuText = $null
for ($i = 0; $i -lt $menuCount; $i++) {
  if ((U16 $menuEffect (2252 + $i * 20)) -eq 0x12) {
    $slot = 3532 + $i * 34
    $menuText = [Text.Encoding]::ASCII.GetString($menuEffect, $slot + 2, (U16 $menuEffect $slot))
    break
  }
}
if ($menuText -ne $expected.Substring(0, 32)) {
  throw 'long-text v14 menu yield did not restore the historical 32-character inline prefix'
}
$directEffect = [IO.File]::ReadAllBytes((Join-Path $run 'DIRECT.EFX'))
$directDump = Get-Content (Join-Path $run 'DIRECTD.TXT') -Raw
if ((U16 $directEffect 4) -ne 9 -or ((U16 $directEffect 6) -band 0x0100) -ne 0 -or
    (U16 $directEffect (3532 + 34)) -ne 32 -or
    -not $directDump.Contains("TEXT=$($expected.Substring(0, 32))") -or
    $directDump.Contains('<bad-text-len>') -or
    (Test-Path (Join-Path $run 'DIRECT.GBS'))) {
  throw 'direct CCECL did not preserve the historical 32-character inline prefix'
}

# Independently corrupt each exact v2 boundary; the native diagnostic must
# reject the whole sidecar rather than print the GBPX descriptor as text.
$badCases = @{}
$badCases['TRUNC'] = $side[0..($side.Length - 2)]
$badCases['TAIL'] = [byte[]]($side + [byte]0)
$badOp = [byte[]]$side.Clone()
Set-U16 $badOp (8 + $textRow * 54) 0x2e
$badCases['OP'] = $badOp
$badRef = [byte[]]$side.Clone()
Set-U16 $badRef ($entryAt + 2) 1
$badCases['REF'] = $badRef
foreach ($name in $badCases.Keys) {
  Copy-Item (Join-Path $run 'INTRO.EFX') (Join-Path $run "$name.EFX") -Force
  [IO.File]::WriteAllBytes((Join-Path $run "$name.GBS"), [byte[]]$badCases[$name])
}
$badConf = Join-Path $run '_bad_text.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
C:
CCEFX C:\TRUNC.EFX > C:\TRUNC.TXT
CCEFX C:\TAIL.EFX > C:\TAIL.TXT
CCEFX C:\OP.EFX > C:\OP.TXT
CCEFX C:\REF.EFX > C:\REF.TXT
exit
"@ | Set-Content -Path $badConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $badConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw 'DoK packed-text corruption DOSBox smoke timed out'
}
foreach ($name in $badCases.Keys) {
  $badOut = Get-Content (Join-Path $run "$name.TXT") -Raw
  if (-not $badOut.Contains('CCEFX: bad or truncated')) {
    throw "$name malformed GBSL v2 was not rejected"
  }
}
# Boundary regression: four short PRINT rows fill 116 columns, then the same
# 212-character packed literal is a PRINT (not PRINTCLEAR). Its leading space
# would fill column 117 with no room for a character. The first Enter must
# therefore start that long row at offset zero; the second finishes it.
$edgePrefixParts = @(('A' * 32), ('B' * 32), ('C' * 32), ('D' * 17))
$edgePrefix = $edgePrefixParts -join ' '
if ($edgePrefix.Length -ne 116) { throw 'long PRINT boundary prefix changed' }
$edgeCount = 5
$edgeRecordsEnd = 8 + 54 * $edgeCount
$edgePayloadAt = $edgeRecordsEnd + 12 + 8
$edgeSide = New-Object byte[] ($edgePayloadAt + 159)
[Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($edgeSide, 0)
Set-U16 $edgeSide 4 2; Set-U16 $edgeSide 6 $edgeCount
for ($i = 0; $i -lt 4; $i++) {
  $at = 8 + 54 * $i
  Set-U16 $edgeSide $at 0x11
  Set-U16 $edgeSide ($at + 20) $edgePrefixParts[$i].Length
  [Text.Encoding]::ASCII.GetBytes($edgePrefixParts[$i]).CopyTo($edgeSide, $at + 22)
}
$edgeLongAt = 8 + 54 * 4
Set-U16 $edgeSide $edgeLongAt 0x11
Set-U16 $edgeSide ($edgeLongAt + 20) 0xffff
[Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($edgeSide, $edgeLongAt + 22)
[Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($edgeSide, $edgeRecordsEnd)
Set-U16 $edgeSide ($edgeRecordsEnd + 4) 1
Set-U16 $edgeSide ($edgeRecordsEnd + 6) 1
[BitConverter]::GetBytes([UInt32]159).CopyTo($edgeSide, $edgeRecordsEnd + 8)
Set-U16 $edgeSide ($edgeRecordsEnd + 12) 4
Set-U16 $edgeSide ($edgeRecordsEnd + 16) 159
Set-U16 $edgeSide ($edgeRecordsEnd + 18) 212
[Array]::Copy($sourceBlock, 63, $edgeSide, $edgePayloadAt, 159)
[IO.File]::WriteAllBytes((Join-Path $run 'EDGE.EFX'), $effect)
[IO.File]::WriteAllBytes((Join-Path $run 'EDGE.GBS'), $edgeSide)
if ($GameLinkPaging) {
  # /S exits after its first frame. Run the same real CCFP child with /W in a
  # fresh focusless DOSBox-X process and advance with GameLink's Enter edge.
  $dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
  $probe = Join-Path $root 'tools\dosbox_x_debugbox_probe.ps1'
  $link = Join-Path $root 'tools\dosbox_gamelink.py'
  foreach ($path in @($dbx, $probe, $link)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "GameLink paging tool absent: $path" }
  }
  Add-Type -AssemblyName System.Drawing
  $foreign = @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue)
  if ($foreign.Count -ne 0) { throw 'GameLink paging requires an exclusive DOSBox-X process slot' }
  $pagingOut = Join-Path $run '_paging'
  New-Item -ItemType Directory -Path $pagingOut -Force | Out-Null
  $page1Text = $expected.Substring(0, 117)
  $page2Text = $expected.Substring(117)
  if ($page2Text.Length -ne 95 -or ($page1Text + $page2Text) -cne $expected) {
    throw 'DoK expected paging partition changed'
  }
  $beforeFx = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'INTRO.EFX')))
  $beforeSide = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'INTRO.GBS')))
  $beforeRng = U32 $effect 126
  # This isolated literal has no imported party or damage action. Preserve
  # their absence as well as the effect's embedded RNG word across paging.
  $persistentNames = @('_GBPARTY.GBP', '_GBSEED.BIN', 'INTRO.GDJ', 'INTRO.GDN')
  $beforePersistent = @{}
  foreach ($name in $persistentNames) {
    $path = Join-Path $run $name
    $beforePersistent[$name] = if (Test-Path -LiteralPath $path) {
      Get-HexSha256 ([IO.File]::ReadAllBytes($path))
    } else { $null }
  }
  $owned = $null
  try {
    & $probe -DbxExe $dbx -GameDir $run -Exe 'CCFP WALL.BIN /E INTRO.EFX /T /W' `
      -OutDir $pagingOut -RunDirect -GameLink -Cycles 'fixed 25000' `
      -NoInitialScreenshots -NoActionScreenshots
    if (-not $?) { throw 'focusless CCFP /W probe failed' }
    $metadata = Get-Content -LiteralPath (Join-Path $pagingOut 'probe-process.json') -Raw | ConvertFrom-Json
    $owned = Get-Process -Id ([int]$metadata.process_id) -ErrorAction Stop
    $foreign = @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessId -ne $owned.Id })
    if ($foreign.Count -ne 0) { throw 'foreign DOSBox-X appeared during GameLink paging' }
    function Capture-PagingRam([string]$Label) {
      $path = Join-Path $pagingOut "$Label.ram"
      & python $link dump-memory $path --start 0 --length 0x100000 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "GameLink RAM capture failed: $Label" }
      return [Text.Encoding]::Latin1.GetString([IO.File]::ReadAllBytes($path))
    }
    $ramBefore = Capture-PagingRam 'page1'
    if (-not $ramBefore.Contains($page1Text + [char]0) -or
        $ramBefore.Contains($page2Text + [char]0)) {
      throw 'CCFP first page did not contain exactly the first 117 decoded characters'
    }
    & python $link screenshot (Join-Path $pagingOut 'page1.png') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'GameLink first-page frame capture failed' }
    & python $link press enter --pace 0.2 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'GameLink Enter delivery failed' }
    $ramAfter = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      $ramAfter = Capture-PagingRam 'page2'
      if ($ramAfter.Contains($page2Text + [char]0)) { break }
    }
    if (-not $ramAfter.Contains($page2Text + [char]0) -or
        $ramAfter.Contains($page1Text + [char]0)) {
      throw 'CCFP Enter did not advance to exactly the final 95 characters without a repeated prefix'
    }
    & python $link screenshot (Join-Path $pagingOut 'page2.png') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'GameLink second-page frame capture failed' }
    $shot1 = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $pagingOut 'page1.png')))
    $shot2 = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $pagingOut 'page2.png')))
    if ($shot1 -eq $shot2) { throw 'CCFP graphics frame did not change on Enter' }
  } finally {
    if ($owned -and -not $owned.HasExited) {
      Stop-Process -Id $owned.Id -Force
      $owned.WaitForExit(5000) | Out-Null
    }
  }
  $afterFxBytes = [IO.File]::ReadAllBytes((Join-Path $run 'INTRO.EFX'))
  if ((Get-HexSha256 $afterFxBytes) -ne $beforeFx -or
      (Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'INTRO.GBS')))) -ne $beforeSide -or
      (U32 $afterFxBytes 126) -ne $beforeRng) {
    throw 'CCFP page advancement changed the effect, RNG, or sidecar'
  }
  foreach ($name in $persistentNames) {
    $path = Join-Path $run $name
    $after = if (Test-Path -LiteralPath $path) { Get-HexSha256 ([IO.File]::ReadAllBytes($path)) } else { $null }
    if ($after -ne $beforePersistent[$name]) { throw "CCFP page advancement changed $name" }
  }

  function Assert-PagePixels([string]$Baseline, [string]$Variant,
                             [bool]$AllowChangedGlyph) {
    $left = [System.Drawing.Bitmap]::new($Baseline)
    $right = [System.Drawing.Bitmap]::new($Variant)
    try {
      if ($left.Width -ne 640 -or $left.Height -ne 400 -or
          $right.Width -ne $left.Width -or $right.Height -ne $left.Height) {
        throw 'GameLink screenshot dimensions changed; text-cell mapping needs review'
      }
      $changed = 0
      for ($y = 0; $y -lt 400; $y++) {
        for ($x = 0; $x -lt 640; $x++) {
          if ($left.GetPixel($x, $y).ToArgb() -eq $right.GetPixel($x, $y).ToArgb()) { continue }
          $changed++
          # BIOS teletype row 22, column 10 in mode 13h. DOSBox-X's 640x400
          # GameLink screenshot doubles the 320x200 framebuffer.
          if (-not $AllowChangedGlyph -or $x -lt 160 -or $x -gt 175 -or
              $y -lt 338 -or $y -gt 351) {
            throw "GameLink pixel changed outside the selected page-2 glyph at ($x,$y)"
          }
        }
      }
      if ($AllowChangedGlyph -and $changed -eq 0) {
        throw 'selected source character did not change its visible glyph pixels'
      }
    } finally {
      $left.Dispose()
      $right.Dispose()
    }
  }

  function Capture-VariantPaging([string]$Stem, [string]$ExpectedText) {
    $variantOut = Join-Path $run "_paging_$($Stem.ToLowerInvariant())"
    New-Item -ItemType Directory -Path $variantOut -Force | Out-Null
    $fxPath = Join-Path $run "$Stem.EFX"
    $sidePath = Join-Path $run "$Stem.GBS"
    $fxHash = Get-HexSha256 ([IO.File]::ReadAllBytes($fxPath))
    $sideHash = Get-HexSha256 ([IO.File]::ReadAllBytes($sidePath))
    $rng = U32 ([IO.File]::ReadAllBytes($fxPath)) 126
    $ownedVariant = $null
    try {
      & $probe -DbxExe $dbx -GameDir $run -Exe "CCFP WALL.BIN /E $Stem.EFX /T /W" `
        -OutDir $variantOut -RunDirect -GameLink -Cycles 'fixed 25000' `
        -NoInitialScreenshots -NoActionScreenshots
      if (-not $?) { throw "focusless $Stem CCFP /W probe failed" }
      $metadata = Get-Content -LiteralPath (Join-Path $variantOut 'probe-process.json') -Raw | ConvertFrom-Json
      $ownedVariant = Get-Process -Id ([int]$metadata.process_id) -ErrorAction Stop
      $foreign = @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $ownedVariant.Id })
      if ($foreign.Count -ne 0) { throw "foreign DOSBox-X appeared during $Stem paging" }
      $ram1Path = Join-Path $variantOut 'page1.ram'
      & python $link dump-memory $ram1Path --start 0 --length 0x100000 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$Stem first-page RAM capture failed" }
      $ram1 = [Text.Encoding]::Latin1.GetString([IO.File]::ReadAllBytes($ram1Path))
      $first = $ExpectedText.Substring(0, 117)
      $second = $ExpectedText.Substring(117)
      if (-not $ram1.Contains($first + [char]0) -or $ram1.Contains($second + [char]0)) {
        throw "$Stem first-page text differs from its source"
      }
      $shot1 = Join-Path $variantOut 'page1.png'
      & python $link screenshot $shot1 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$Stem first-page screenshot failed" }
      & python $link press enter --pace 0.2 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$Stem Enter delivery failed" }
      $ram2Path = Join-Path $variantOut 'page2.ram'
      $ram2 = ''
      for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        & python $link dump-memory $ram2Path --start 0 --length 0x100000 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "$Stem second-page RAM capture failed" }
        $ram2 = [Text.Encoding]::Latin1.GetString([IO.File]::ReadAllBytes($ram2Path))
        if ($ram2.Contains($second + [char]0)) { break }
      }
      if (-not $ram2.Contains($second + [char]0) -or $ram2.Contains($first + [char]0)) {
        throw "$Stem second-page text differs from its source or repeats page 1"
      }
      $shot2 = Join-Path $variantOut 'page2.png'
      & python $link screenshot $shot2 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$Stem second-page screenshot failed" }
    } finally {
      if ($ownedVariant -and -not $ownedVariant.HasExited) {
        Stop-Process -Id $ownedVariant.Id -Force
        $ownedVariant.WaitForExit(5000) | Out-Null
      }
    }
    if ((Get-HexSha256 ([IO.File]::ReadAllBytes($fxPath))) -ne $fxHash -or
        (Get-HexSha256 ([IO.File]::ReadAllBytes($sidePath))) -ne $sideHash -or
        (U32 ([IO.File]::ReadAllBytes($fxPath)) 126) -ne $rng) {
      throw "$Stem paging changed effect, GBSL, or RNG"
    }
    foreach ($name in $persistentNames) {
      $path = Join-Path $run $name
      $after = if (Test-Path -LiteralPath $path) { Get-HexSha256 ([IO.File]::ReadAllBytes($path)) } else { $null }
      if ($after -ne $beforePersistent[$name]) { throw "$Stem paging changed $name" }
    }
    return @{ First = $shot1; Second = $shot2 }
  }

  $mutPages = Capture-VariantPaging 'MUT' $changedExpected
  $unrelatedBasePages = Capture-VariantPaging 'UBASE' $expected
  $unrelatedPages = Capture-VariantPaging 'UMUT' $expected
  $baselineFirst = Join-Path $run '_paging\page1.png'
  $baselineSecond = Join-Path $run '_paging\page2.png'
  Assert-PagePixels $baselineFirst $mutPages.First $false
  Assert-PagePixels $baselineSecond $mutPages.Second $true
  foreach ($other in @($unrelatedBasePages, $unrelatedPages)) {
    Assert-PagePixels $baselineFirst $other.First $false
    Assert-PagePixels $baselineSecond $other.Second $false
  }

  $edgeBeforeFx = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'EDGE.EFX')))
  $edgeBeforeSide = Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'EDGE.GBS')))
  $pagingOut = Join-Path $run '_paging_edge'
  New-Item -ItemType Directory -Path $pagingOut -Force | Out-Null
  $owned = $null
  try {
    & $probe -DbxExe $dbx -GameDir $run -Exe 'CCFP WALL.BIN /E EDGE.EFX /T /W' `
      -OutDir $pagingOut -RunDirect -GameLink -Cycles 'fixed 25000' `
      -NoInitialScreenshots -NoActionScreenshots
    if (-not $?) { throw 'focusless boundary CCFP /W probe failed' }
    $metadata = Get-Content -LiteralPath (Join-Path $pagingOut 'probe-process.json') -Raw | ConvertFrom-Json
    $owned = Get-Process -Id ([int]$metadata.process_id) -ErrorAction Stop
    $foreign = @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessId -ne $owned.Id })
    if ($foreign.Count -ne 0) { throw 'foreign DOSBox-X appeared during boundary paging' }
    $edgeRam1 = Capture-PagingRam 'edge-page1'
    if (-not $edgeRam1.Contains($edgePrefix + [char]0)) {
      throw '116-column PRINT prefix was not the first boundary page'
    }
    & python $link press enter --pace 0.2 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'boundary first Enter delivery failed' }
    $edgeRam2 = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      $edgeRam2 = Capture-PagingRam 'edge-page2'
      if ($edgeRam2.Contains($page1Text + [char]0)) { break }
    }
    if (-not $edgeRam2.Contains($page1Text + [char]0) -or
        $edgeRam2.Contains($edgePrefix + [char]0)) {
      throw '116-column boundary skipped or duplicated the first long PRINT page'
    }
    & python $link press enter --pace 0.2 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'boundary second Enter delivery failed' }
    $edgeRam3 = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      $edgeRam3 = Capture-PagingRam 'edge-page3'
      if ($edgeRam3.Contains($page2Text + [char]0)) { break }
    }
    if (-not $edgeRam3.Contains($page2Text + [char]0) -or
        $edgeRam3.Contains($page1Text + [char]0)) {
      throw '116-column boundary did not finish the long PRINT at the final 95 characters'
    }
  } finally {
    if ($owned -and -not $owned.HasExited) {
      Stop-Process -Id $owned.Id -Force
      $owned.WaitForExit(5000) | Out-Null
    }
  }
  if ((Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'EDGE.EFX')))) -ne $edgeBeforeFx -or
      (Get-HexSha256 ([IO.File]::ReadAllBytes((Join-Path $run 'EDGE.GBS')))) -ne $edgeBeforeSide) {
    throw 'CCFP boundary page advancement changed its effect or sidecar'
  }
  Write-Output 'PASS: GameLink Enter advanced 117+95 DoK characters across two distinct frames; effect/RNG/sidecar and party/journal file state unchanged'
  Write-Output 'PASS: 116-column short PRINT prefix resumes the long PRINT at character zero, then reaches its final 95 characters'
}
Write-Output 'RESULT: DoK exact 159-byte GBSL v2, 212-character diagnostic, CCFP paging, v14 fallback, and four corruption gates PASS'
