# ccecl-menu-resume-test.ps1 -- cold-process Gen1 v14 / Gen2 v15 menu-yield smoke.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-menu-resume-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path -LiteralPath $dosbox)) {
  throw "Required DOSBox executable is unavailable: $dosbox"
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }
& (Join-Path $native 'build.ps1') -Target ccefx
if ($LASTEXITCODE -ne 0) { throw 'CCEFX build failed' }

$resolvedMenuRun = [IO.Path]::GetFullPath($run)
$resolvedMenuBuild = [IO.Path]::GetFullPath($build).TrimEnd('\') + '\'
if (-not $resolvedMenuRun.StartsWith($resolvedMenuBuild, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Menu test cleanup escaped its build directory: $resolvedMenuRun"
}
if (Test-Path -LiteralPath $resolvedMenuRun) { Remove-Item -LiteralPath $resolvedMenuRun -Recurse -Force }
New-Item -ItemType Directory -Path $run -Force | Out-Null
Copy-Item (Join-Path $build 'ccecl.com') (Join-Path $run 'CCECL.COM') -Force
Copy-Item (Join-Path $build 'ccmenu.com') (Join-Path $run 'CCMENU.COM') -Force
Copy-Item (Join-Path $build 'ccefx.com') (Join-Path $run 'CCEFX.COM') -Force
$coabMenu = Join-Path $root 'coab_extracted\Data\ECL2.DAX'
if (-not (Test-Path -LiteralPath $coabMenu -PathType Leaf)) {
  throw "Required title-owned menu fixture is unavailable: $coabMenu"
}
Copy-Item $coabMenu (Join-Path $run 'ECL2.DAX') -Force
$cokMenu = Join-Path $root 'Champions of Krynn\ECL1.DAX'
if (-not (Test-Path -LiteralPath $cokMenu -PathType Leaf)) {
  throw "Required CoK title-owned menu fixture is unavailable: $cokMenu"
}
Copy-Item $cokMenu (Join-Path $run 'COK1.DAX') -Force
$dqkMenu = Join-Path $root 'The Dark Queen of Krynn\DISK3\ECL.GLB'
if (-not (Test-Path -LiteralPath $dqkMenu -PathType Leaf)) {
  throw "Required DQK title-owned menu fixture is unavailable: $dqkMenu"
}
Copy-Item $dqkMenu (Join-Path $run 'DQKECL.GLB') -Force

function Add-Byte($List, [int]$Value) { [void]$List.Add([byte]($Value -band 0xff)) }
function Add-Imm($List, [int]$Value) { Add-Byte $List 0; Add-Byte $List $Value }
function Add-WordImm($List, [int]$Value) { Add-Byte $List 2; Add-U16LE $List $Value }
function Add-U16LE($List, [int]$Value) { Add-Byte $List $Value; Add-Byte $List ($Value -shr 8) }
function Add-U32LE($List, [int]$Value) {
  Add-U16LE $List $Value
  Add-U16LE $List ($Value -shr 16)
}
function Add-Ref($List, [int]$Address) {
  Add-Byte $List 1; Add-Byte $List $Address; Add-Byte $List ($Address -shr 8)
}
function Add-VarRef($List, [int]$Address) {
  Add-Byte $List 3; Add-Byte $List $Address; Add-Byte $List ($Address -shr 8)
}
function ConvertTo-EclPackedString([string]$Text) {
  $bits = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in $Text.ToCharArray()) {
    $v = [int][char]$ch
    if ($v -gt 31) { $v -= 64 }
    for ($bit = 5; $bit -ge 0; $bit--) { [void]$bits.Add(($v -shr $bit) -band 1) }
  }
  1..6 | ForEach-Object { [void]$bits.Add(0) }
  while (($bits.Count % 8) -ne 0) { [void]$bits.Add(0) }
  $raw = [System.Collections.Generic.List[byte]]::new()
  for ($i = 0; $i -lt $bits.Count; $i += 8) {
    $value = 0
    for ($bit = 0; $bit -lt 8; $bit++) { $value = ($value -shl 1) -bor $bits[$i + $bit] }
    [void]$raw.Add([byte]$value)
  }
  return ,$raw.ToArray()
}
function Add-Str($List, [string]$Text) {
  $raw = ConvertTo-EclPackedString $Text
  Add-Byte $List 0x80; Add-Byte $List $raw.Length
  foreach ($b in $raw) { Add-Byte $List $b }
}
function New-Program {
  $p = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { Add-Byte $p 0 }
  return ,$p
}
function New-Gen2Program {
  $p = [System.Collections.Generic.List[byte]]::new()
  1..20 | ForEach-Object { Add-Byte $p 0 }
  return ,$p
}
function Write-PartyHlib([string]$Path, [System.Collections.Generic.List[byte]]$Block) {
  # Minimal HLIB master: one id-table entry (area 1 -> member 1), followed by
  # the synthetic 20-byte-header Gen2 ECL block and its EOF pointer.
  $idTable = [System.Collections.Generic.List[byte]]::new()
  Add-U16LE $idTable 1
  Add-U16LE $idTable 1
  Add-U16LE $idTable 1
  $firstMember = 28 + $idTable.Count
  $eof = $firstMember + $Block.Count
  $container = [System.Collections.Generic.List[byte]]::new()
  foreach ($b in [Text.Encoding]::ASCII.GetBytes('HLIB')) { Add-Byte $container $b }
  Add-U32LE $container $eof
  Add-U16LE $container 2
  Add-Byte $container 0
  Add-Byte $container 1
  foreach ($b in [Text.Encoding]::ASCII.GetBytes('HLIB')) { Add-Byte $container $b }
  Add-U32LE $container 28
  Add-U32LE $container $firstMember
  Add-U32LE $container $eof
  foreach ($b in $idTable) { Add-Byte $container $b }
  foreach ($b in $Block) { Add-Byte $container $b }
  if ($container.Count -ne $eof) { throw 'synthetic PARTY HLIB extent is inconsistent' }
  [IO.File]::WriteAllBytes($Path, $container.ToArray())
}
function Write-Outcome([string]$Path, [int]$Version, [int]$Selection, [int]$Count) {
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($c in [Text.Encoding]::ASCII.GetBytes('GBMO')) { Add-Byte $b $c }
  foreach ($n in @($Version, $Selection, $Count)) {
    Add-Byte $b $n; Add-Byte $b ($n -shr 8)
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}
function Write-Roster([string]$Path, [string[]]$Names) {
  if ($Names.Count -lt 1 -or $Names.Count -gt 6) { throw 'WHO roster fixture needs one through six members' }
  $b = New-Object byte[] (16 + (410 * $Names.Count))
  [Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($b, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($b, 4)
  [BitConverter]::GetBytes([uint16]$Names.Count).CopyTo($b, 6)
  [BitConverter]::GetBytes([uint16]410).CopyTo($b, 8)
  for ($i = 0; $i -lt $Names.Count; $i++) {
    $name = [Text.Encoding]::ASCII.GetBytes($Names[$i])
    if ($name.Length -lt 1 -or $name.Length -gt 15) { throw "invalid WHO roster name: $($Names[$i])" }
    $row = 16 + (410 * $i)
    $b[$row] = [byte]($i + 1)
    $b[$row + 1] = [byte]$name.Length
    [Array]::Copy($name, 0, $b, $row + 2, $name.Length)
  }
  [IO.File]::WriteAllBytes($Path, $b)
}

$vertical = New-Program
Add-Byte $vertical 0x03; Add-Imm $vertical 5; Add-Imm $vertical 5 # COMPARE, preserves EQ
Add-Byte $vertical 0x0A; Add-Imm $vertical 1                  # LOAD_CHARACTER member 1
Add-Byte $vertical 0x0B; Add-Imm $vertical 7; Add-Imm $vertical 2; Add-Imm $vertical 9 # LOAD_MONSTER
Add-Byte $vertical 0x15; Add-Ref $vertical 0x0102; Add-Str $vertical 'PICK'; Add-Imm $vertical 2; Add-Str $vertical 'LEFT'; Add-Str $vertical 'RIGHT'
Add-Byte $vertical 0x09; Add-Imm $vertical 7; Add-Ref $vertical 0x0103
Add-Byte $vertical 0
[IO.File]::WriteAllBytes((Join-Path $run 'VERT.BIN'), $vertical.ToArray())

$horizontal = New-Program
Add-Byte $horizontal 0x2B; Add-Ref $horizontal 0x0104; Add-Imm $horizontal 2; Add-Str $horizontal 'YES'; Add-Str $horizontal 'NO'
Add-Byte $horizontal 0x09; Add-Imm $horizontal 9; Add-Ref $horizontal 0x0105
Add-Byte $horizontal 0
[IO.File]::WriteAllBytes((Join-Path $run 'HORIZ.BIN'), $horizontal.ToArray())

$parlay = New-Program
Add-Byte $parlay 0x2C
foreach ($value in 11,22,33,44,55) { Add-Imm $parlay $value }
Add-Ref $parlay 0x0108
Add-Byte $parlay 0x09; Add-Imm $parlay 9; Add-Ref $parlay 0x0109
Add-Byte $parlay 0
[IO.File]::WriteAllBytes((Join-Path $run 'PARLAY.BIN'), $parlay.ToArray())

$who = New-Program
Add-Byte $who 0x39; Add-Ref $who 0x010A
Add-Byte $who 0x09; Add-Imm $who 9; Add-Ref $who 0x010B
Add-Byte $who 0
[IO.File]::WriteAllBytes((Join-Path $run 'WHO.BIN'), $who.ToArray())
Write-Roster (Join-Path $run 'WHO.GBP') @('TIKA', 'TANIS', 'RAISTLIN')
$whoCountSeed = New-Object byte[] 150
[Text.Encoding]::ASCII.GetBytes('GBPS').CopyTo($whoCountSeed, 0)
[BitConverter]::GetBytes([uint16]1).CopyTo($whoCountSeed, 4)
[BitConverter]::GetBytes([uint16]1).CopyTo($whoCountSeed, 6)
[BitConverter]::GetBytes([uint16]3).CopyTo($whoCountSeed, 8)
[IO.File]::WriteAllBytes((Join-Path $run 'WHOCOUNT.GBS'), $whoCountSeed)

# DQK/HLIB WHO carries an inline packed caption and updates selected-party
# context. Seed MEM[0015], the prompt's packed 21-byte length, as a regression trap,
# then prove it survives a cold resume while the selected member is retained.
$whoGen2 = New-Gen2Program
Add-Byte $whoGen2 0x09; Add-WordImm $whoGen2 0x0777; Add-Ref $whoGen2 0x0015
Add-Byte $whoGen2 0x03; Add-Imm $whoGen2 4; Add-Imm $whoGen2 5
Add-Byte $whoGen2 0x39; Add-Str $whoGen2 'WHO TRIES TO LIFT THE LID?'
Add-Byte $whoGen2 0x15; Add-Ref $whoGen2 0x0114; Add-Str $whoGen2 'NEXT?'; Add-Imm $whoGen2 2; Add-Str $whoGen2 'LEFT'; Add-Str $whoGen2 'RIGHT'
Add-Byte $whoGen2 0
Write-PartyHlib (Join-Path $run 'WHO2.GLB') $whoGen2

# Change both roster contents and size before an immediate count-only launch.
# No other executable may run between the pair: it could overwrite stale BSS.
foreach ($pair in @(
  @{ Id = 'A3'; Names = @('ALPHAONE', 'ALPHATWO', 'ALPHATHREE') },
  @{ Id = 'B3'; Names = @('BETTAONE', 'BETTATWO', 'BETTATHREE') },
  @{ Id = 'A6'; Names = @('A6ONE', 'A6TWO', 'A6THREE', 'A6FOUR', 'A6FIVE', 'A6SIX') },
  @{ Id = 'B6'; Names = @('B6ONE', 'B6TWO', 'B6THREE', 'B6FOUR', 'B6FIVE', 'B6SIX') }
)) {
  Write-Roster (Join-Path $run "$($pair.Id).GBP") $pair.Names
}

$number = New-Program
Add-Byte $number 0x0F; Add-Imm $number 3; Add-VarRef $number 0x010C
Add-Byte $number 0x09; Add-Imm $number 9; Add-Ref $number 0x010D
Add-Byte $number 0
[IO.File]::WriteAllBytes((Join-Path $run 'NUMBER.BIN'), $number.ToArray())

# DQK PARTY_SURPRISE is a real Yes/No yield. It clears EQ/NE/LT/GT while
# preserving LE/GE, then sets EQ for Yes or NE for No after the cold resume.
# Use an actual HLIB Gen2 container so this exercises DQK's zero-operand frame.
$party = New-Gen2Program
Add-Byte $party 0x03; Add-Imm $party 1; Add-Imm $party 2
Add-Byte $party 0x12; Add-Str $party 'KEEP LE?'
Add-Byte $party 0x22
Add-Byte $party 0x1A; Add-Byte $party 0x09; Add-Imm $party 0x55; Add-Ref $party 0x0101
Add-Byte $party 0x1B; Add-Byte $party 0x09; Add-Imm $party 0x66; Add-Ref $party 0x0102
Add-Byte $party 0x16; Add-Byte $party 0x09; Add-Imm $party 0x77; Add-Ref $party 0x0103
Add-Byte $party 0x17; Add-Byte $party 0x09; Add-Imm $party 0x88; Add-Ref $party 0x0104
Add-Byte $party 0x03; Add-Imm $party 2; Add-Imm $party 1
Add-Byte $party 0x12; Add-Str $party 'KEEP GE?'
Add-Byte $party 0x22
Add-Byte $party 0x1A; Add-Byte $party 0x09; Add-Imm $party 0x99; Add-Ref $party 0x0105
Add-Byte $party 0x1B; Add-Byte $party 0x09; Add-Imm $party 0xAA; Add-Ref $party 0x0106
Add-Byte $party 0x16; Add-Byte $party 0x09; Add-Imm $party 0xBB; Add-Ref $party 0x0107
Add-Byte $party 0x17; Add-Byte $party 0x09; Add-Imm $party 0xCC; Add-Ref $party 0x0108
Add-Byte $party 0
Write-PartyHlib (Join-Path $run 'PARTY.GLB') $party

$string = New-Program
# Retail INPUT_STRING is maxLength,destination. Cold resume must retain the
# bounded uppercase bytes and their NUL terminator, not a scalar test seed.
Add-Byte $string 0x10; Add-Imm $string 6; Add-Ref $string 0x0120
Add-Byte $string 0x03; Add-Byte $string 0x81; Add-Byte $string 0x20; Add-Byte $string 0x01; Add-Str $string 'HANDS'
Add-Byte $string 0x16
Add-Byte $string 0x09; Add-Imm $string 1; Add-Ref $string 0x0128
Add-Byte $string 0x09; Add-Imm $string 9; Add-Ref $string 0x0129
Add-Byte $string 0
[IO.File]::WriteAllBytes((Join-Path $run 'STRING.BIN'), $string.ToArray())
Write-Outcome (Join-Path $run 'BAD.GMO') 1 0 3
Write-Outcome (Join-Path $run 'OLD.GMO') 0 0 2
Write-Outcome (Join-Path $run 'OUT.GMO') 1 2 2
[IO.File]::WriteAllBytes((Join-Path $run 'SHORT.GMO'), [byte[]]@(0x47,0x42,0x4d,0x4f,1))

$conf = Join-Path $run '_menu-resume.conf'
# Keep the command list in a batch file: it exceeds DOSBox's autoexec limit.
@"
@ECHO OFF
CCECL C:\VERT.BIN /N 1 /! /E C:\VERT.EFX > C:\VERT0.TXT
CCEFX C:\VERT.EFX C:\VERTD.TXT
CCMENU C:\VERT.EFX C:\VERT.GMO /S 1 > C:\MENU1.TXT
CCECL C:\VERT.BIN /N 1 /R C:\VERT.EFX C:\VERT.GMO /E C:\VERT1.EFX > C:\VERT1.TXT
CCECL C:\VERT.BIN /R C:\VERT.EFX C:\VERT.GMO /E C:\REPLAY.EFX > C:\REPLAY.TXT
if errorlevel 1 echo REPLAYOK > C:\REPLAY.OK
CCECL C:\HORIZ.BIN /! /E C:\HORIZ.EFX > C:\HORIZ0.TXT
CCMENU C:\HORIZ.EFX C:\HORIZ.GMO /S 0 > C:\MENU2.TXT
copy C:\HORIZ.GMO C:\SWAP.GMO > NUL
CCECL C:\HORIZ.BIN /R C:\HORIZ.EFX C:\HORIZ.GMO /E C:\HORIZ1.EFX > C:\HORIZ1.TXT
CCECL C:\PARLAY.BIN /! /E C:\PARLAY.EFX > C:\PARLAY0.TXT
CCMENU C:\PARLAY.EFX C:\PARLAY.GMO /S 3 > C:\PM.TXT
CCECL C:\PARLAY.BIN /R C:\PARLAY.EFX C:\PARLAY.GMO /E C:\PARLAY1.EFX > C:\PARLAY1.TXT
CCECL C:\WHO.BIN /B C:\WHO.GBP /! /E C:\WHO.EFX > C:\WHO0.TXT
CCMENU C:\WHO.EFX C:\WHO.GMO /S 2 > C:\WHO-MENU.TXT
CCECL C:\WHO.BIN /B C:\WHO.GBP /R C:\WHO.EFX C:\WHO.GMO /E C:\WHO1.EFX > C:\WHO1.TXT
CCECL C:\NUMBER.BIN /! /E C:\NUMBER.EFX > C:\NUMBER0.TXT
CCMENU C:\NUMBER.EFX C:\NUMBER.GMO /S 750 > C:\NUMMENU.TXT
copy C:\NUMBER.GMO C:\NUMSAVE.GMO > NUL
CCECL C:\NUMBER.BIN /R C:\NUMBER.EFX C:\NUMBER.GMO /E C:\NUMBER1.EFX > C:\NUMBER1.TXT
CCECL C:\PARTY.GLB 1 /! /E C:\PARTY0.EFX > C:\PARTY0.TXT
CCMENU C:\PARTY0.EFX C:\PARTY0.GMO /S 0 > C:\PARTY0M.TXT
CCECL C:\PARTY.GLB 1 /! /R C:\PARTY0.EFX C:\PARTY0.GMO /E C:\PARTY1.EFX > C:\PARTY1.TXT
CCMENU C:\PARTY1.EFX C:\PARTY1.GMO /S 1 > C:\PARTY1M.TXT
CCECL C:\PARTY.GLB 1 /R C:\PARTY1.EFX C:\PARTY1.GMO /E C:\PARTY2.EFX > C:\PARTY2.TXT
CCECL C:\VERT.BIN /! /E C:\VERT2.EFX > C:\VERT2.TXT
CCECL C:\VERT.BIN /R C:\VERT2.EFX C:\SWAP.GMO /E C:\SWAP.EFX > C:\SWAP.TXT
if errorlevel 1 echo SWAPOK > C:\SWAP.OK
CCECL C:\VERT.BIN /R C:\VERT.EFX C:\BAD.GMO /E C:\BADRES.EFX > C:\BAD.TXT
if errorlevel 1 echo BADOK > C:\BAD.OK
CCECL C:\VERT.BIN /R C:\VERT.EFX C:\OLD.GMO /E C:\OLDRES.EFX > C:\OLD.TXT
if errorlevel 1 echo OLDOK > C:\OLD.OK
CCECL C:\VERT.BIN /R C:\VERT.EFX C:\OUT.GMO /E C:\OUTRES.EFX > C:\OUT.TXT
if errorlevel 1 echo OUTOK > C:\OUT.OK
CCECL C:\VERT.BIN /R C:\VERT.EFX C:\SHORT.GMO /E C:\SHORTRES.EFX > C:\SHORT.TXT
if errorlevel 1 echo SHORTOK > C:\SHORT.OK
CCECL C:\ECL2.DAX 3 /! /E C:\COAB0.EFX > C:\COAB0.TXT
CCMENU C:\COAB0.EFX C:\COAB.GMO /S 0 > C:\COABMENU.TXT
CCECL C:\ECL2.DAX 3 /R C:\COAB0.EFX C:\COAB.GMO /E C:\COAB1.EFX > C:\COAB1.TXT
CCECL C:\COK1.DAX 34 /@ 37659 /! /E C:\COKA0.EFX > C:\COKA0.TXT
CCMENU C:\COKA0.EFX C:\COKA0.GMO /S 0 > C:\CA0M.TXT
CCECL C:\COK1.DAX 34 /! /R C:\COKA0.EFX C:\COKA0.GMO /E C:\COKA1.EFX > C:\COKA1.TXT
CCMENU C:\COKA1.EFX C:\COKA1.GMO /S 0 > C:\CA1M.TXT
CCECL C:\COK1.DAX 34 /! /R C:\COKA1.EFX C:\COKA1.GMO /E C:\COKA2.EFX > C:\COKA2.TXT
CCEFX C:\COKA2.EFX C:\COKA2D.TXT
CCECL C:\COK1.DAX 34 /@ 37659 /! /E C:\COKL0.EFX > C:\COKL0.TXT
CCMENU C:\COKL0.EFX C:\COKL0.GMO /S 0 > C:\CL0M.TXT
CCECL C:\COK1.DAX 34 /! /R C:\COKL0.EFX C:\COKL0.GMO /E C:\COKL1.EFX > C:\COKL1.TXT
CCMENU C:\COKL1.EFX C:\COKL1.GMO /S 2 > C:\CL1M.TXT
CCECL C:\COK1.DAX 34 /! /R C:\COKL1.EFX C:\COKL1.GMO /E C:\COKL2.EFX > C:\COKL2.TXT
CCEFX C:\COKL2.EFX C:\COKL2D.TXT
CCECL C:\DQKECL.GLB 58 /@ 41807 /! /E C:\DQKP0.EFX > C:\DQKP0.TXT
CCMENU C:\DQKP0.EFX C:\DQKP0.GMO /S 0 > C:\DP0M.TXT
CCECL C:\DQKECL.GLB 58 /! /R C:\DQKP0.EFX C:\DQKP0.GMO /E C:\DQKP1.EFX > C:\DQKP1.TXT
CCEFX C:\DQKP1.EFX C:\DQKP1D.TXT
CCECL C:\DQKECL.GLB 58 /@ 41807 /! /E C:\DQKL0.EFX > C:\DQKL0.TXT
CCMENU C:\DQKL0.EFX C:\DQKL0.GMO /S 2 > C:\DL0M.TXT
CCECL C:\DQKECL.GLB 58 /! /R C:\DQKL0.EFX C:\DQKL0.GMO /E C:\DQKL1.EFX > C:\DQKL1.TXT
CCEFX C:\DQKL1.EFX C:\DQKL1D.TXT
CCECL C:\DQKECL.GLB 61 /@ 40949 /! /E C:\DQKS0.EFX > C:\DQKS0.TXT
CCMENU C:\DQKS0.EFX C:\DQKS0.GMO /S 0 > C:\DS0M.TXT
CCECL C:\DQKECL.GLB 61 /! /R C:\DQKS0.EFX C:\DQKS0.GMO /E C:\DQKS0R.EFX > C:\DQKS0R.TXT
CCEFX C:\DQKS0R.EFX C:\DQKS0D.TXT
CCECL C:\DQKECL.GLB 61 /@ 40949 /! /E C:\DQKS1.EFX > C:\DQKS1.TXT
CCMENU C:\DQKS1.EFX C:\DQKS1.GMO /S 1 > C:\DS1M.TXT
CCECL C:\DQKECL.GLB 61 /! /R C:\DQKS1.EFX C:\DQKS1.GMO /E C:\DQKS1R.EFX > C:\DQKS1R.TXT
CCMENU C:\DQKS1R.EFX C:\DQKS1R.GMO /S 0 > C:\DS1RM.TXT
CCECL C:\DQKECL.GLB 61 /! /R C:\DQKS1R.EFX C:\DQKS1R.GMO /E C:\DQKS1RR.EFX > C:\DQKS1RR.TXT
CCEFX C:\DQKS1RR.EFX C:\DQKS1RRD.TXT
"@ | Set-Content -LiteralPath (Join-Path $run 'MENU.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
call C:\MENU.BAT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw 'DOSBox did not exit while running the CCECL menu-resume smoke'
}

# Keep the primary fixture below DOSBox's autoexec size limit; text input gets
# its own cold process and still uses the same staged native executables.
$stringConf = Join-Path $run '_string-resume.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\STRING.BIN /! /E C:\STRING.EFX > C:\STRING0.TXT
copy C:\STRING.EFX C:\STRINGP.EFX > NUL
CCMENU C:\STRING.EFX C:\STRING.GMO /T hands > C:\STRMENU.TXT
CCECL C:\STRING.BIN /R C:\STRING.EFX C:\STRING.GMO /E C:\STRING1.EFX > C:\STRING1.TXT
exit
"@ | Set-Content -LiteralPath $stringConf -Encoding ASCII
$stringProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $stringConf -Headless:$Headless
if (-not $stringProcess.WaitForExit(60000)) {
  try { $stringProcess.Kill() } catch {}
  throw 'DOSBox did not exit while running the CCECL string-resume smoke'
}

$whoGen2Conf = Join-Path $run '_who-gen2-resume.conf'
@'
@echo off
copy C:\WHOSAVE.GMO C:\WHOCOK.GMO > NUL
CCECL C:\WHO2.GLB 1 /G C:\WHOCOUNT.GBS /ID1 /! /R C:\WHO2.EFX C:\WHOCOK.GMO /E C:\WHOCOK.EFX > C:\WHOCOK.TXT
if errorlevel 1 goto failed
copy C:\WHOSAVE.GMO C:\WHOCRJ.GMO > NUL
CCECL C:\WHO2.GLB 1 /G C:\WHOCOUNT.GBS /ID4 /! /R C:\WHO2.EFX C:\WHOCRJ.GMO /E C:\WHOCRJ.EFX > C:\WHOCRJ.TXT
if errorlevel 1 goto rejected
goto failed
:rejected
CCECL C:\WHO2.GLB 1 /G C:\WHOCOUNT.GBS /ID1 /! /E C:\WHOFOK.EFX > C:\WHOFOK.TXT
if errorlevel 1 goto failed
CCECL C:\WHO2.GLB 1 /G C:\WHOCOUNT.GBS /ID4 /! /E C:\WHOFRJ.EFX > C:\WHOFRJ.TXT
if errorlevel 1 goto failed
echo PASS > C:\WHOBOUND.OK
goto done
:failed
echo FAIL > C:\WHOBOUND.BAD
:done
'@ | Set-Content -LiteralPath (Join-Path $run 'WHOBOUND.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\WHO2.GLB 1 /BA3.GBP /! /E A3.EFX > A3.TXT
CCECL C:\WHO2.GLB 1 /N3 /! /E A3NONE.EFX > A3NONE.TXT
CCECL C:\WHO2.GLB 1 /BB3.GBP /! /E B3.EFX > B3.TXT
CCECL C:\WHO2.GLB 1 /N3 /! /E B3NONE.EFX > B3NONE.TXT
CCECL C:\WHO2.GLB 1 /BA6.GBP /! /E A6.EFX > A6.TXT
CCECL C:\WHO2.GLB 1 /N6 /! /E A6NONE.EFX > A6NONE.TXT
CCECL C:\WHO2.GLB 1 /BB6.GBP /! /E B6.EFX > B6.TXT
CCECL C:\WHO2.GLB 1 /N6 /! /E B6NONE.EFX > B6NONE.TXT
CCECL C:\WHO2.GLB 1 /B C:\WHO.GBP /! /E C:\WHO2.EFX > C:\WHO20.TXT
CCMENU C:\WHO2.EFX C:\WHO2.GMO /S 2 > C:\WHO2M.TXT
copy C:\WHO2.GMO C:\WHOSAVE.GMO > NUL
CCECL C:\WHO2.GLB 1 /B C:\WHO.GBP /! /R C:\WHO2.EFX C:\WHO2.GMO /E C:\WHO21.EFX > C:\WHO21.TXT
CCMENU C:\WHO21.EFX C:\WHO21.GMO /S 0 > C:\WHO21M.TXT
call C:\WHOBOUND.BAT
exit
"@ | Set-Content -LiteralPath $whoGen2Conf -Encoding ASCII
$whoGen2Process = Start-DosBoxSmoke -Dosbox $dosbox -Conf $whoGen2Conf -Headless:$Headless
if (-not $whoGen2Process.WaitForExit(60000)) {
  try { $whoGen2Process.Kill() } catch {}
  throw 'DOSBox did not exit while running the Gen2 WHO cold-resume smoke'
}

function U16([byte[]]$Bytes, [int]$Offset) { [BitConverter]::ToUInt16($Bytes, $Offset) }
function Get-Memory([byte[]]$Bytes, [int]$Address) {
  $count = U16 $Bytes 196
  for ($i = 0; $i -lt $count; $i++) {
    if ((U16 $Bytes (198 + ($i * 2))) -eq $Address) { return U16 $Bytes (1222 + ($i * 2)) }
  }
  return $null
}
function Assert-Gen2RawFlags([byte[]]$Bytes) {
  if ($Bytes.Length -ne 5932 -or (U16 $Bytes 4) -ne 15 -or
      [Text.Encoding]::ASCII.GetString($Bytes, 5920, 4) -ne 'GBRF' -or
      (U16 $Bytes 5930) -ne 0) { throw 'Gen2 pending record has an invalid v15 flag tail' }
  foreach ($offset in 5924..5929) {
    if ($Bytes[$offset] -gt 1) { throw 'Gen2 pending record has a nonboolean raw flag' }
  }
}
function Assert-Pending([string]$Path, [int]$Opcode, [int]$Destination, [int]$ExpectedEventArgc, [switch]$Stateful, [int]$ExpectedEvent = 0, $ExpectedDestinationValue = $null, [int]$ExpectedCount = 2, [switch]$Gen2) {
  $b = [IO.File]::ReadAllBytes($Path)
  $expectedLength = if ($Gen2) { 5932 } else { 5920 }
  $expectedVersion = if ($Gen2) { 15 } else { 14 }
  if ($Gen2) { Assert-Gen2RawFlags $b }
  $expectedTextCount = if ($Opcode -eq 0x15) { 3 } elseif ($Opcode -eq 0x2C) { 5 } elseif ($Opcode -eq 0x39) { 3 } elseif ($Opcode -eq 0x0F -or $Opcode -eq 0x10) { 0 } else { 2 }
  if ($b.Length -ne $expectedLength -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF' -or
      (U16 $b 4) -ne $expectedVersion -or (U16 $b 8) -ne 2 -or (U16 $b 120) -ne 1 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or (U16 $b 5754) -ne 1 -or
      (U16 $b 5756) -ne $Destination -or (U16 $b 5758) -ne $ExpectedCount -or (U16 $b 5760) -ne $Opcode -or
      (U16 $b 5762) -ne $ExpectedEvent -or (U16 $b 5764) -ne 0 -or
      [Text.Encoding]::ASCII.GetString($b, 5774, 4) -ne 'GBMS' -or
      [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or (U16 $b 5790) -ne $expectedTextCount -or
      [Text.Encoding]::ASCII.GetString($b, 2246, 4) -ne 'GBSX' -or (U16 $b 2250) -le $ExpectedEvent -or
      (U16 $b (2252 + ($ExpectedEvent * 20))) -ne $Opcode -or
      (U16 $b (2254 + ($ExpectedEvent * 20))) -ne $ExpectedEventArgc) {
    throw "pending menu record is malformed: $Path"
  }
  if ($Stateful -and ((U16 $b 32) -ne 1 -or (U16 $b 34) -ne 7 -or (U16 $b 36) -ne 2 -or
      (U16 $b 38) -ne 9 -or (U16 $b 5778) -ne 5 -or (U16 $b 5780) -ne 5 -or
      (U16 $b 5782) -ne 1 -or (U16 $b 5784) -ne 1)) {
    throw "pending menu record did not retain transient VM state: $Path"
  }
  $destinationValue = Get-Memory $b $Destination
  if ($null -eq $ExpectedDestinationValue -and $null -ne $destinationValue) {
    throw "pending menu mutated destination before selection: $Path"
  }
  if ($null -ne $ExpectedDestinationValue -and $destinationValue -ne $ExpectedDestinationValue) {
    throw "pending menu did not retain its prior destination selection: $Path"
  }
}
function Assert-Resumed([string]$Path, [int]$Destination, [int]$Choice, [int]$AfterAddress, [int]$AfterValue, [switch]$Stateful) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 5750 -or (U16 $b 4) -ne 9 -or (U16 $b 8) -ne 0 -or
      (Get-Memory $b $Destination) -ne $Choice -or (Get-Memory $b $AfterAddress) -ne $AfterValue -or
      (U16 $b 2250) -ne 0) {
    throw "menu continuation did not resume exactly after the yield: $Path"
  }
  if ($Stateful -and ((U16 $b 32) -ne 1 -or (U16 $b 34) -ne 7 -or (U16 $b 36) -ne 2 -or (U16 $b 38) -ne 9)) {
    throw "menu continuation did not restore queued encounter state: $Path"
  }
}
function Assert-StringResumed([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 5750 -or (U16 $b 4) -ne 9 -or (U16 $b 8) -ne 0 -or
      (Get-Memory $b 0x0120) -ne [int][char]'H' -or (Get-Memory $b 0x0121) -ne [int][char]'A' -or
      (Get-Memory $b 0x0122) -ne [int][char]'N' -or (Get-Memory $b 0x0123) -ne [int][char]'D' -or
      (Get-Memory $b 0x0124) -ne [int][char]'S' -or (Get-Memory $b 0x0125) -ne 0 -or
      (Get-Memory $b 0x0128) -ne 1 -or (Get-Memory $b 0x0129) -ne 9 -or (U16 $b 2250) -ne 0) {
    throw "string continuation did not retain normalized text through cold resume: $Path"
  }
}
function Assert-PartyPending([string]$Path, [int]$RetainedFlags) {
  $b = [IO.File]::ReadAllBytes($Path)
  Assert-Gen2RawFlags $b
  if ((U16 $b 8) -ne 2 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or
      (U16 $b 5754) -ne 3 -or (U16 $b 5756) -ne 0xffff -or
      (U16 $b 5758) -ne 2 -or (U16 $b 5760) -ne 0x22 -or
      (U16 $b 5762) -ne 1 -or (U16 $b 5764) -ne $RetainedFlags -or
      [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or (U16 $b 5790) -ne 3 -or
      (U16 $b 2250) -ne 2 -or (U16 $b 2252) -ne 0x12 -or
      (U16 $b 2272) -ne 0x22 -or (U16 $b 2274) -ne 0) {
    throw "PARTY_SURPRISE pending record lost its yes/no identity or retained flags: $Path"
  }
  $pos = 5792
  $promptLen = $b[$pos]
  $pos += 1 + $promptLen
  if ($b[$pos] -ne 3 -or $b[$pos + 1] -ne 0x64 -or $b[$pos + 2] -ne 0x54 -or $b[$pos + 3] -ne 0xc0 -or
      $b[$pos + 4] -ne 3 -or $b[$pos + 5] -ne 0x38 -or $b[$pos + 6] -ne 0xf0 -or $b[$pos + 7] -ne 0) {
    throw "PARTY_SURPRISE pending record did not carry the retail Yes/No labels: $Path"
  }
}
function Assert-PartyResumed([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  $expected = @{
    0x0101 = 0x0055; 0x0102 = $null; 0x0103 = 0x0077; 0x0104 = $null
    0x0105 = $null; 0x0106 = 0x00aa; 0x0107 = $null; 0x0108 = 0x00cc
  }
  if ($b.Length -ne 5750 -or (U16 $b 4) -ne 9 -or (U16 $b 8) -ne 0) {
    throw "PARTY_SURPRISE did not finish the source continuation: $Path"
  }
  foreach ($address in $expected.Keys) {
    $actual = Get-Memory $b $address
    if ($actual -ne $expected[$address]) {
      throw "PARTY_SURPRISE flags produced MEM[$('{0:X4}' -f $address)]=$actual, expected $($expected[$address])"
    }
  }
}
function Assert-TitleOwnedPending([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 5920 -or (U16 $b 4) -ne 14 -or (U16 $b 8) -ne 2 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or
      [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or (U16 $b 5790) -ne 1 -or
      (U16 $b 5760) -ne 0x2B -or (U16 $b 5758) -lt 1 -or (U16 $b 5758) -gt 255) {
    throw "CoAB area-2 block-3 did not yield a valid title-owned horizontal menu: $Path"
  }
  $eventIndex = U16 $b 5762
  if ($eventIndex -ge (U16 $b 2250) -or (U16 $b (2252 + ($eventIndex * 20))) -ne 0x2B) {
    throw "CoAB menu tail does not identify its GBSX event: $Path"
  }
}
function Assert-CokPending([string]$Path, [int]$ExpectedChoiceCount) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 5920 -or (U16 $b 4) -ne 14 -or (U16 $b 8) -ne 2 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or
      (U16 $b 5756) -ne 0x7F79 -or (U16 $b 5758) -ne $ExpectedChoiceCount -or
      (U16 $b 5760) -ne 0x2B -or [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or
      (U16 $b 5790) -ne $ExpectedChoiceCount) {
    throw "CoK pending menu record is malformed: $Path"
  }
  $eventIndex = U16 $b 5762
  if ($eventIndex -ge (U16 $b 2250) -or
      (U16 $b (2252 + ($eventIndex * 20))) -ne 0x2B -or
      (U16 $b (2254 + ($eventIndex * 20))) -ne (2 + $ExpectedChoiceCount)) {
    throw "CoK menu tail does not identify its source HORIZONTAL_MENU event: $Path"
  }
}
function Assert-DqkVerticalPending([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  Assert-Gen2RawFlags $b
  if ((U16 $b 8) -ne 2 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or
      (U16 $b 5756) -ne 0x00BF -or (U16 $b 5758) -ne 3 -or (U16 $b 5760) -ne 0x15 -or
      [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or (U16 $b 5790) -ne 4) {
    throw "DQK vertical pending menu record is malformed: $Path"
  }
  $eventIndex = U16 $b 5762
  if ($eventIndex -ge (U16 $b 2250) -or
      (U16 $b (2252 + ($eventIndex * 20))) -ne 0x15 -or
      (U16 $b (2254 + ($eventIndex * 20))) -ne 6) {
    throw "DQK vertical menu tail does not identify its source VERTICAL_MENU event: $Path"
  }
}
function Assert-Gen2WhoPending([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 5932 -or (U16 $b 4) -ne 15 -or (U16 $b 8) -ne 2 -or
      [Text.Encoding]::ASCII.GetString($b, 5750, 4) -ne 'GBMN' -or
      (U16 $b 5756) -ne 0xffff -or (U16 $b 5758) -ne 3 -or (U16 $b 5760) -ne 0x39 -or
      [Text.Encoding]::ASCII.GetString($b, 5786, 4) -ne 'GBMT' -or (U16 $b 5790) -ne 4 -or
      [Text.Encoding]::ASCII.GetString($b, 5920, 4) -ne 'GBRF') {
    throw "Gen2 WHO pending record lost its destination-free v15 shape: $Path"
  }
  $eventIndex = U16 $b 5762
  if ($eventIndex -ge (U16 $b 2250) -or
      (U16 $b (2252 + ($eventIndex * 20))) -ne 0x39 -or
      (U16 $b (2254 + ($eventIndex * 20))) -ne 1 -or
      (U16 $b (2256 + ($eventIndex * 20))) -ne 21 -or $b[5792] -ne 21) {
    # 26 caption characters plus NUL, at six bits each: ceil(27*6/8)=21.
    throw "Gen2 WHO event and caption do not agree on the complete 21-byte prompt: $Path"
  }
}
function Assert-Gen2WhoContinuation([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ((U16 $b 4) -ne 15 -or (U16 $b 5756) -ne 0x0114 -or (U16 $b 5760) -ne 0x15 -or
      (U16 $b 5778) -ne 4 -or (U16 $b 5780) -ne 5 -or
      (U16 $b 5782) -ne 3 -or (U16 $b 5784) -ne 1 -or
      (Get-Memory $b 0x0015) -ne 0x0777 -or
      $b[5924] -ne 0 -or $b[5925] -ne 1 -or $b[5926] -ne 1 -or $b[5927] -ne 0 -or
      $b[5928] -ne 1 -or $b[5929] -ne 0) {
    throw "Gen2 WHO cold resume lost selected member, flags, or MEM[0015]: $Path"
  }
}

# Cold LOAD_FILES context regression. CCMENU must produce the real v2 token;
# short legacy answers would reject before reaching the FF instruction.
$contextCases = [Collections.Generic.List[object]]::new()
$contextCommands = [Collections.Generic.List[string]]::new()
$contextCommands.Add('@ECHO OFF')
foreach ($context in @(-1, 0, 1, 2, 3, 4, 5, 6)) {
  $stem = if ($context -eq -1) { 'CTXF' } else { "CTX$context" }
  $operand = if ($context -eq -1) { 255 } else { $context }
  $tag = if ($context -eq -1) { 0 } else { 0xD000 + $context }
  $program = New-Gen2Program
  Add-Byte $program 0x21; Add-Imm $program 18; Add-Imm $program $operand
  Add-Byte $program 0x15; Add-Ref $program 0x0102; Add-Str $program 'PICK'
  Add-Imm $program 2; Add-Str $program 'LEFT'; Add-Str $program 'RIGHT'
  $pendingPc = $program.Count
  Add-Byte $program 0x21; Add-Imm $program 22; Add-Imm $program 255
  $finalPc = $program.Count
  Add-Byte $program 0
  $source = Join-Path $run "$stem.GLB"
  Write-PartyHlib $source $program
  $contextCases.Add(@{ Stem = $stem; Operand = $operand; Tag = $tag;
    PendingPc = $pendingPc; FinalPc = $finalPc; Source = $source; Hash = (Get-FileHash $source).Hash })
  $contextCommands.Add("CCECL C:\$stem.GLB 1 /! /E C:\$stem.PRE > C:\$stem.PRT")
  $contextCommands.Add('IF ERRORLEVEL 1 GOTO FAILED')
  $contextCommands.Add("COPY C:\$stem.PRE C:\$stem.SAV > NUL")
  $contextCommands.Add("CCMENU C:\$stem.PRE C:\$stem.GMO /S 0 > C:\$stem.MNU")
  $contextCommands.Add('IF ERRORLEVEL 1 GOTO FAILED')
  $contextCommands.Add("COPY C:\$stem.GMO C:\$stem.TOK > NUL")
  $contextCommands.Add("CCECL C:\$stem.GLB 1 /R C:\$stem.PRE C:\$stem.GMO /E C:\$stem.EFX > C:\$stem.TXT")
  $contextCommands.Add('IF ERRORLEVEL 1 GOTO FAILED')
}
$contextCommands.Add('ECHO passed>C:\CONTEXT.OK')
$contextCommands.Add('GOTO END')
$contextCommands.Add(':FAILED')
$contextCommands.Add('ECHO failed>C:\CONTEXT.ERR')
$contextCommands.Add(':END')
$contextCommands | Set-Content -LiteralPath (Join-Path $run 'CONTEXT.BAT') -Encoding ASCII
$contextConf = Join-Path $run '_context-resume.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
call C:\CONTEXT.BAT
exit
"@ | Set-Content -LiteralPath $contextConf -Encoding ASCII
$contextProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $contextConf -Headless:$Headless
if (-not $contextProcess.WaitForExit(60000)) {
  try { $contextProcess.Kill() } catch {}
  throw 'DOSBox did not exit during the LOAD_FILES cold-resume matrix'
}
if ((Test-Path (Join-Path $run 'CONTEXT.ERR')) -or
    (Get-Content (Join-Path $run 'CONTEXT.OK') -Raw).Trim() -ne 'passed') {
  throw 'LOAD_FILES cold-resume matrix did not complete all guest commands'
}
foreach ($case in $contextCases) {
  $stem = $case.Stem
  $pendingPath = Join-Path $run "$stem.PRE"
  Assert-Pending $pendingPath 0x15 0x0102 5 -Gen2
  $pending = [IO.File]::ReadAllBytes($pendingPath)
  $final = [IO.File]::ReadAllBytes((Join-Path $run "$stem.EFX"))
  $token = [IO.File]::ReadAllBytes((Join-Path $run "$stem.TOK"))
  if ((U16 $pending 12) -ne 18 -or (U16 $pending 14) -ne $case.Operand -or
      (U16 $pending 16) -ne $case.Tag -or (U16 $pending 122) -ne 1 -or
      (U16 $pending 124) -ne $case.PendingPc -or
      (U16 $pending 5766) -ne $case.PendingPc -or (U16 $pending 5768) -ne 1 -or
      (U16 $pending 5770) -ne 0x0102 -or (U16 $pending 5772) -ne 0x15) {
    throw "LOAD_FILES $stem lost its pending context or menu identity"
  }
  if ($token.Length -ne 18 -or [Text.Encoding]::ASCII.GetString($token, 0, 4) -ne 'GBMO' -or
      (U16 $token 4) -ne 2 -or (U16 $token 6) -ne 0 -or (U16 $token 8) -ne 2 -or
      (U16 $token 10) -ne $case.PendingPc -or (U16 $token 12) -ne 1 -or
      (U16 $token 14) -ne 0x0102 -or (U16 $token 16) -ne 0x15 -or
      (Test-Path (Join-Path $run "$stem.GMO"))) {
    throw "LOAD_FILES $stem did not consume the matching v2 menu answer"
  }
  if ($final.Length -ne 5750 -or [Text.Encoding]::ASCII.GetString($final, 0, 4) -ne 'GBEF' -or
      (U16 $final 4) -ne 9 -or (U16 $final 8) -ne 0 -or (U16 $final 12) -ne 22 -or
      (U16 $final 14) -ne 255 -or (U16 $final 16) -ne $case.Tag -or
      (U16 $final 120) -ne 0 -or (U16 $final 122) -ne 1 -or (U16 $final 124) -ne $case.FinalPc -or
      (Get-Memory $final 0x0102) -ne 0) {
    throw "LOAD_FILES $stem did not retain context after its cold FF continuation"
  }
  if ((Get-FileHash $case.Source).Hash -ne $case.Hash -or
      (Get-FileHash $pendingPath).Hash -ne (Get-FileHash (Join-Path $run "$stem.SAV")).Hash) {
    throw "LOAD_FILES $stem mutated its source or pending effect"
  }
}
Write-Output 'RESULT: LOAD_FILES cold FF resume preserves reset and D000-D006 with matching consumed GBMO v2 (8 cases) PASS'

Assert-Pending (Join-Path $run 'VERT.EFX') 0x15 0x0102 5 -Stateful
if ((Get-Content (Join-Path $run 'VERTD.TXT') -Raw) -notmatch 'GBEF v000E') { throw 'CCEFX did not accept the v14 menu record' }
Assert-Pending (Join-Path $run 'HORIZ.EFX') 0x2B 0x0104 4
Assert-Pending (Join-Path $run 'PARLAY.EFX') 0x2C 0x0108 6 -ExpectedCount 5
Assert-Pending (Join-Path $run 'WHO.EFX') 0x39 0x010A 1 -ExpectedCount 3
Assert-Gen2WhoPending (Join-Path $run 'WHO2.EFX')
Assert-Gen2WhoContinuation (Join-Path $run 'WHO21.EFX')
if (-not (Test-Path (Join-Path $run 'WHOBOUND.OK')) -or
    (Test-Path (Join-Path $run 'WHOBOUND.BAD')) -or
    (Test-Path (Join-Path $run 'WHOCOK.GMO')) -or
    (Test-Path (Join-Path $run 'WHOCRJ.EFX'))) {
  throw 'count-only WHO supported/Secret fresh and cold guest verdicts failed'
}
Assert-Gen2WhoContinuation (Join-Path $run 'WHOCOK.EFX')
$whoAnswer = [IO.File]::ReadAllBytes((Join-Path $run 'WHOSAVE.GMO'))
$whoRejectedAnswer = [IO.File]::ReadAllBytes((Join-Path $run 'WHOCRJ.GMO'))
if ([Convert]::ToBase64String($whoAnswer) -ne [Convert]::ToBase64String($whoRejectedAnswer) -or
    (Get-Content (Join-Path $run 'WHOCRJ.TXT') -Raw) -notmatch 'bad or unsupported resume state') {
  throw 'unsupported Secret WHO resume consumed or modified its valid answer token'
}
$whoSupported = [IO.File]::ReadAllBytes((Join-Path $run 'WHOFOK.EFX'))
$whoHalted = [IO.File]::ReadAllBytes((Join-Path $run 'WHOFRJ.EFX'))
if ($whoSupported.Length -ne 5932 -or (U16 $whoSupported 8) -ne 2 -or
    (U16 $whoSupported 5760) -notin @(0x15, 0x39) -or
    [Text.Encoding]::ASCII.GetString($whoHalted, 5720, 4) -ne 'GBHD' -or
    (U16 $whoHalted 5724) -ne 1 -or (U16 $whoHalted 5728) -ne 0x39) {
  throw 'count-only Secret WHO did not halt while the supported control progressed'
}
if ((U16 $whoSupported 5760) -ne 0x15) {
  throw 'count-only WHO retained roster names instead of progressing to NEXT'
}
foreach ($id in 'A3', 'B3', 'A6', 'B6') {
  $owned = [IO.File]::ReadAllBytes((Join-Path $run "$id.EFX"))
  $unowned = [IO.File]::ReadAllBytes((Join-Path $run "${id}NONE.EFX"))
  if ($owned.Length -ne 5932 -or (U16 $owned 5760) -ne 0x39 -or
      $unowned.Length -ne 5932 -or (U16 $unowned 8) -ne 2 -or
      (U16 $unowned 5760) -ne 0x15) {
    throw "$id immediate count-only launch retained the previous WHO roster"
  }
}
Write-Output 'RESULT: alternating three/six-member rosters cannot supply WHO names to the next count-only launch PASS'
Write-Output 'RESULT: count-only Secret WHO halts fresh and rejects cold without consuming the matched answer PASS'
if ((Get-Content (Join-Path $run 'WHO2M.TXT') -Raw) -notmatch 'WHO TRIES TO LIFT THE LID\?' -or
    (Get-Content (Join-Path $run 'WHO2M.TXT') -Raw) -notmatch '3\. RAISTLIN' -or
    (Get-Content (Join-Path $run 'WHO21M.TXT') -Raw) -notmatch 'NEXT\?') {
  throw 'Gen2 WHO did not render its retail inline prompt and imported roster names'
}
Assert-Pending (Join-Path $run 'NUMBER.EFX') 0x0F 0x010C 2 -ExpectedCount 0
Assert-Pending (Join-Path $run 'STRINGP.EFX') 0x10 0x0120 2 -ExpectedCount 6
Assert-PartyPending (Join-Path $run 'PARTY0.EFX') 1
Assert-PartyPending (Join-Path $run 'PARTY1.EFX') 2
foreach ($expected in 'KEEP LE?', '1. YES', '2. NO') {
  if ((Get-Content (Join-Path $run 'PARTY0M.TXT') -Raw) -notmatch [regex]::Escape($expected)) {
    throw "PARTY_SURPRISE menu did not render $expected"
  }
}
foreach ($expected in 'PICK', '1. LEFT', '2. RIGHT') {
  if ((Get-Content (Join-Path $run 'MENU1.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "vertical menu did not render $expected" }
}
foreach ($expected in '1. YES', '2. NO') {
  if ((Get-Content (Join-Path $run 'MENU2.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "horizontal menu did not render $expected" }
}
foreach ($expected in '1. HAUGHTY', '2. SLY', '3. NICE', '4. MEEK', '5. ABUSIVE') {
  if ((Get-Content (Join-Path $run 'PM.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "PARLAY menu did not render $expected" }
}
foreach ($expected in '1. TIKA', '2. TANIS', '3. RAISTLIN') {
  if ((Get-Content (Join-Path $run 'WHO-MENU.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "WHO menu did not render imported roster name: $expected" }
}
if ((Get-Content (Join-Path $run 'NUMMENU.TXT') -Raw) -notmatch 'NUMBER 0\.\.65535') { throw 'numeric menu did not render the free numeric input range' }
if ((Get-Content (Join-Path $run 'STRMENU.TXT') -Raw) -notmatch 'TEXT \(up to 6') { throw 'string menu did not render its source bound' }
Assert-Resumed (Join-Path $run 'VERT1.EFX') 0x0102 1 0x0103 7 -Stateful
Assert-Resumed (Join-Path $run 'HORIZ1.EFX') 0x0104 0 0x0105 9
Assert-Resumed (Join-Path $run 'PARLAY1.EFX') 0x0108 44 0x0109 9
Assert-Resumed (Join-Path $run 'WHO1.EFX') 0x010A 2 0x010B 9
Assert-Resumed (Join-Path $run 'NUMBER1.EFX') 0x010C 750 0x010D 9
Assert-StringResumed (Join-Path $run 'STRING1.EFX')
Assert-PartyResumed (Join-Path $run 'PARTY2.EFX')
Assert-TitleOwnedPending (Join-Path $run 'COAB0.EFX')
$coabMenuText = Get-Content (Join-Path $run 'COABMENU.TXT') -Raw
if ($coabMenuText -notmatch '1\. PRESS BUTTON OR RETURN TO CONTINUE\.' -or
    $coabMenuText -notmatch 'outcome written' -or
    -not (Test-Path (Join-Path $run 'COAB1.EFX'))) {
  throw 'CoAB title-owned menu did not render its complete label and cold-resume through CCMENU'
}
foreach ($path in @('COKA0.EFX', 'COKL0.EFX')) {
  Assert-CokPending (Join-Path $run $path) 1
}
foreach ($path in @('COKA1.EFX', 'COKL1.EFX')) {
  Assert-CokPending (Join-Path $run $path) 3
}
$cokFirstMenu = Get-Content (Join-Path $run 'CA0M.TXT') -Raw
if ($cokFirstMenu -notmatch '1\. PRESS BUTTON OR RETURN TO CONTINUE\.') {
  throw 'CoK title-owned lead-in prompt did not render its complete label'
}
$cokChoiceMenu = Get-Content (Join-Path $run 'CA1M.TXT') -Raw
foreach ($expected in '1. ATTACK', '2. WAIT', '3. LEAVE') {
  if ($cokChoiceMenu -notmatch [regex]::Escape($expected)) {
    throw "CoK title-owned choice prompt did not render $expected"
  }
}
$cokAttack = Get-Content (Join-Path $run 'COKA2D.TXT') -Raw
foreach ($expected in 'status=0003', 'GBEC groups=0003', 'id=000D count=0008 pic=000D',
  'id=0023 count=0005 pic=0023', 'id=0026 count=0002 pic=0026') {
  if ($cokAttack -notmatch [regex]::Escape($expected)) {
    throw "CoK ATTACK branch did not produce expected combat handoff: $expected"
  }
}
$cokLeave = Get-Content (Join-Path $run 'COKL2D.TXT') -Raw
foreach ($expected in 'status=0002', 'THE FORCES HOOT AND JEER AT YOUR', '@00 MEM key=7F79 value=0002') {
  if ($cokLeave -notmatch [regex]::Escape($expected)) {
    throw "CoK LEAVE branch did not retain its source-derived noncombat result: $expected"
  }
}
foreach ($path in @('DQKP0.EFX', 'DQKL0.EFX')) {
  Assert-DqkVerticalPending (Join-Path $run $path)
}
$dqkMenuText = Get-Content (Join-Path $run 'DP0M.TXT') -Raw
foreach ($expected in 'WHAT DO YOU DO?', '1.   PULL THE GNOME FREE.',
  '2.   PUSH THE OFF BUTTON.', '3.   LEAVE.') {
  if ($dqkMenuText -notmatch [regex]::Escape($expected)) {
    throw "DQK title-owned vertical prompt did not render $expected"
  }
}
$dqkPull = Get-Content (Join-Path $run 'DQKP1D.TXT') -Raw
$dqkLeave = Get-Content (Join-Path $run 'DQKL1D.TXT') -Raw
foreach ($expected in 'GBEF v0009', 'status=0000', 'HE STAGGERS AND THANKS YOU.') {
  if ($dqkPull -notmatch [regex]::Escape($expected)) {
    throw "DQK PULL branch did not retain its source-derived continuation: $expected"
  }
}
foreach ($expected in 'GBEF v0009', 'status=0000', 'THE GNOME SQUEALS FOR HELP') {
  if ($dqkLeave -notmatch [regex]::Escape($expected)) {
    throw "DQK LEAVE branch did not retain its source-derived continuation: $expected"
  }
}
if ($dqkPull -eq $dqkLeave) {
  throw 'DQK PULL and LEAVE selections produced the same cold-resumed transcript'
}
foreach ($path in @('DQKS0.EFX', 'DQKS1.EFX')) {
  Assert-Pending (Join-Path $run $path) 0x31 0x00BF 4 -Gen2
}
$dqkShortMenu = Get-Content (Join-Path $run 'DS0M.TXT') -Raw
foreach ($expected in '1. SLAM THE LID DOWN', '2. LOOK INSIDE COFFER') {
  if ($dqkShortMenu -notmatch [regex]::Escape($expected)) {
    throw "DQK title-owned SHORT_MENU did not render $expected"
  }
}
Assert-Pending (Join-Path $run 'DQKS1R.EFX') 0x31 0x00BF 4 -ExpectedEvent 7 -ExpectedDestinationValue 1 -Gen2
$dqkNestedShortMenu = Get-Content (Join-Path $run 'DS1RM.TXT') -Raw
foreach ($expected in '1. HELP THE MAN', '2. PUSH HIM OFF YOU') {
  if ($dqkNestedShortMenu -notmatch [regex]::Escape($expected)) {
    throw "DQK nested title-owned SHORT_MENU did not render $expected"
  }
}
$dqkSlam = Get-Content (Join-Path $run 'DQKS0D.TXT') -Raw
$dqkLook = Get-Content (Join-Path $run 'DQKS1RRD.TXT') -Raw
foreach ($expected in 'GBEF v0009', 'GBEC groups=0003', 'SMOKE POURS OUT OF THE BIN') {
  if ($dqkSlam -notmatch [regex]::Escape($expected)) {
    throw "DQK SLAM THE LID DOWN result did not retain title-owned combat output: $expected"
  }
}
foreach ($expected in 'GBEF v0009', 'GBEC groups=0003', 'HEARS HIM HISS AS HE SINKS HIS') {
  if ($dqkLook -notmatch [regex]::Escape($expected)) {
    throw "DQK LOOK INSIDE COFFER result did not retain its title-owned continuation: $expected"
  }
}
if ($dqkSlam -eq $dqkLook) {
  throw 'DQK SHORT_MENU choices produced the same cold-resumed transcript'
}
foreach ($name in 'BAD.OK', 'OLD.OK', 'OUT.OK', 'SHORT.OK', 'SWAP.OK') {
  if (-not (Test-Path (Join-Path $run $name))) { throw "$name did not observe a rejected malformed GBMO outcome" }
}
if (-not (Test-Path (Join-Path $run 'REPLAY.OK'))) { throw 'consumed GBMO outcome was accepted for a replay' }
if (Test-Path (Join-Path $run 'REPLAY.EFX')) { throw 'replayed GBMO outcome wrote an effect record' }
foreach ($name in 'BADRES.EFX', 'OLDRES.EFX', 'OUTRES.EFX', 'SHORTRES.EFX', 'SWAP.EFX') {
  if (Test-Path (Join-Path $run $name)) { throw "$name was written after a rejected GBMO outcome" }
}
function Assert-MatchingMenuOutcome([string]$PendingPath, [string]$OutcomePath, [int]$ExpectedVersion) {
  $pending = [IO.File]::ReadAllBytes($PendingPath)
  $outcome = [IO.File]::ReadAllBytes($OutcomePath)
  $pendingIdentity = @((5766, 5768, 5770, 5772) | ForEach-Object { U16 $pending $_ })
  $outcomeIdentity = @((10, 12, 14, 16) | ForEach-Object { U16 $outcome $_ })
  if ($outcome.Length -ne 18 -or [Text.Encoding]::ASCII.GetString($outcome, 0, 4) -ne 'GBMO' -or
      (U16 $outcome 4) -ne 2 -or (U16 $pending 4) -ne $ExpectedVersion -or
      ($pendingIdentity -join ',') -ne ($outcomeIdentity -join ',')) {
    throw "positive menu outcome did not identify its v$ExpectedVersion pending state: $OutcomePath"
  }
}

# Positive inputs are genuine CCECL/CCMENU products. Assert their tokens bind
# to the exact pending state whose continued VM results were checked above.
Assert-MatchingMenuOutcome (Join-Path $run 'NUMBER.EFX') (Join-Path $run 'NUMSAVE.GMO') 14
Assert-MatchingMenuOutcome (Join-Path $run 'WHO2.EFX') (Join-Path $run 'WHOSAVE.GMO') 15
foreach ($consumed in 'NUMBER.GMO', 'WHO2.GMO') {
  if (Test-Path (Join-Path $run $consumed)) { throw "positive continuation did not consume $consumed" }
}

# Mutate one identity field in each real pending record and set the matching
# GBMO field to the same value. The consumer must compare against the suspended
# GBRS/event identity, not merely accept a self-consistent token and menu tail.
$identityCases = @(
  @{ Prefix = 'V14P'; Pending = 'NUMBER.EFX'; Outcome = 'NUMSAVE.GMO'; Source = 'NUMBER.BIN'; PendingOffset = 5766; OutcomeOffset = 10; Field = 'PC'; Delta = 1 },
  @{ Prefix = 'V14A'; Pending = 'NUMBER.EFX'; Outcome = 'NUMSAVE.GMO'; Source = 'NUMBER.BIN'; PendingOffset = 5768; OutcomeOffset = 12; Field = 'area'; Replacement = 0 },
  @{ Prefix = 'V14D'; Pending = 'NUMBER.EFX'; Outcome = 'NUMSAVE.GMO'; Source = 'NUMBER.BIN'; PendingOffset = 5770; OutcomeOffset = 14; Field = 'destination'; Delta = 1 },
  @{ Prefix = 'V14O'; Pending = 'NUMBER.EFX'; Outcome = 'NUMSAVE.GMO'; Source = 'NUMBER.BIN'; PendingOffset = 5772; OutcomeOffset = 16; Field = 'opcode'; Replacement = 0x10 },
  @{ Prefix = 'V15P'; Pending = 'WHO2.EFX'; Outcome = 'WHOSAVE.GMO'; Source = 'WHO2.GLB'; PendingOffset = 5766; OutcomeOffset = 10; Field = 'PC'; Delta = 1; Roster = 'WHO.GBP' },
  @{ Prefix = 'V15A'; Pending = 'WHO2.EFX'; Outcome = 'WHOSAVE.GMO'; Source = 'WHO2.GLB'; PendingOffset = 5768; OutcomeOffset = 12; Field = 'area'; Delta = 1; Roster = 'WHO.GBP' },
  @{ Prefix = 'V15D'; Pending = 'WHO2.EFX'; Outcome = 'WHOSAVE.GMO'; Source = 'WHO2.GLB'; PendingOffset = 5770; OutcomeOffset = 14; Field = 'destination'; Replacement = 0x0100; Roster = 'WHO.GBP' },
  @{ Prefix = 'V15O'; Pending = 'WHO2.EFX'; Outcome = 'WHOSAVE.GMO'; Source = 'WHO2.GLB'; PendingOffset = 5772; OutcomeOffset = 16; Field = 'opcode'; Replacement = 0x15; Roster = 'WHO.GBP' }
)
$caseSnapshots = @{}
foreach ($case in $identityCases) {
  $pendingPath = Join-Path $run ($case.Prefix + '.EFX')
  $outcomePath = Join-Path $run ($case.Prefix + '.GMO')
  Copy-Item (Join-Path $run $case.Pending) $pendingPath -Force
  Copy-Item (Join-Path $run $case.Outcome) $outcomePath -Force
  $pending = [IO.File]::ReadAllBytes($pendingPath)
  $outcome = [IO.File]::ReadAllBytes($outcomePath)
  $oldValue = U16 $pending $case.PendingOffset
  $newValue = if ($case.ContainsKey('Replacement')) { [int]$case.Replacement } else { $oldValue + [int]$case.Delta }
  if ($newValue -eq $oldValue -or $newValue -gt 0xffff) { throw "invalid $($case.Field) mutation for $($case.Prefix)" }
  [BitConverter]::GetBytes([uint16]$newValue).CopyTo($pending, $case.PendingOffset)
  [BitConverter]::GetBytes([uint16]$newValue).CopyTo($outcome, $case.OutcomeOffset)
  [IO.File]::WriteAllBytes($pendingPath, $pending)
  [IO.File]::WriteAllBytes($outcomePath, $outcome)
  if ((U16 $pending $case.PendingOffset) -ne (U16 $outcome $case.OutcomeOffset)) {
    throw "mutated GBMO identity does not match the pending tail for $($case.Prefix)"
  }
  $caseSnapshots[$case.Prefix] = @{
    Pending = (Get-FileHash -LiteralPath $pendingPath -Algorithm SHA256).Hash
    Outcome = (Get-FileHash -LiteralPath $outcomePath -Algorithm SHA256).Hash
    Source = (Get-FileHash -LiteralPath (Join-Path $run $case.Source) -Algorithm SHA256).Hash
  }
}
$identityBat = [Text.StringBuilder]::new()
[void]$identityBat.AppendLine('@ECHO OFF')
foreach ($case in $identityCases) {
  $commandArgs = if ($case.ContainsKey('Roster')) { "C:\$($case.Source) 1 /B C:\$($case.Roster)" } else { "C:\$($case.Source)" }
  [void]$identityBat.AppendLine("CCECL $commandArgs /R C:\$($case.Prefix).EFX C:\$($case.Prefix).GMO /E C:\$($case.Prefix).OUT > C:\$($case.Prefix).TXT")
  [void]$identityBat.AppendLine("if errorlevel 1 echo REJECTED > C:\$($case.Prefix).OK")
}
[void]$identityBat.AppendLine('exit')
[IO.File]::WriteAllText((Join-Path $run 'IDENTITY.BAT'), $identityBat.ToString(), [Text.Encoding]::ASCII)
$identityConf = Join-Path $run '_menu-identity.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
call C:\IDENTITY.BAT
exit
"@ | Set-Content -LiteralPath $identityConf -Encoding ASCII
$identityProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $identityConf -Headless:$Headless
if (-not $identityProcess.WaitForExit(60000)) {
  try { $identityProcess.Kill() } catch {}
  throw 'DOSBox did not exit while running the menu identity mutation regressions'
}
foreach ($case in $identityCases) {
  $prefix = $case.Prefix
  $pendingPath = Join-Path $run ($prefix + '.EFX')
  $outcomePath = Join-Path $run ($prefix + '.GMO')
  $outputPath = Join-Path $run ($prefix + '.OUT')
  $logPath = Join-Path $run ($prefix + '.TXT')
  $pendingHash = (Get-FileHash -LiteralPath $pendingPath -Algorithm SHA256).Hash
  $outcomeHash = (Get-FileHash -LiteralPath $outcomePath -Algorithm SHA256).Hash
  $sourceHash = (Get-FileHash -LiteralPath (Join-Path $run $case.Source) -Algorithm SHA256).Hash
  $markerPath = Join-Path $run ($prefix + '.OK')
  if (-not (Test-Path $markerPath) -or (Get-Content $markerPath -Raw).Trim() -ne 'REJECTED' -or
      -not (Test-Path $logPath) -or (Get-Content $logPath -Raw) -notmatch 'CCECL: bad or unsupported resume state' -or
      (Test-Path $outputPath)) {
    throw "$prefix $($case.Field) identity mutation was not rejected cleanly with no output"
  }
  if (-not (Test-Path $outcomePath) -or $pendingHash -ne $caseSnapshots[$prefix].Pending -or
      $outcomeHash -ne $caseSnapshots[$prefix].Outcome -or $sourceHash -ne $caseSnapshots[$prefix].Source) {
    throw "$prefix rejection changed its pending input, matching GBMO token, or source program"
  }
}
Write-Output 'RESULT: v14 numeric and genuine v15 WHO resume identity rejection matrix (8 matched-token mutations) PASS'
Write-Output 'RESULT: CCECL Gen1 v14 / Gen2 v15 menu and PARTY_SURPRISE yield, retail CoK/DQK branches, and cold GBMO resume smoke PASS'
