# ccmenu-test.ps1 -- strict v14 GBMN -> GBMO helper smoke.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccmenu-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path $dosbox)) {
  Write-Output 'SKIP: CCMENU smoke requires The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
  exit 0
}

& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Path $run -Force | Out-Null
Copy-Item (Join-Path $build 'ccmenu.com') (Join-Path $run 'CCMENU.COM') -Force

function Set-Ascii([byte[]]$Bytes, [int]$Offset, [string]$Text) {
  [Text.Encoding]::ASCII.GetBytes($Text).CopyTo($Bytes, $Offset)
}
function Set-U16([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  [BitConverter]::GetBytes([UInt16]$Value).CopyTo($Bytes, $Offset)
}

function Write-QueuedNumericKeys([string]$Path, [string]$InputText) {
  $scan = @{ '0' = 0x0b; '1' = 0x02; '2' = 0x03; '3' = 0x04; '4' = 0x05; '5' = 0x06; '6' = 0x07; '7' = 0x08; '8' = 0x09; '9' = 0x0a }
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in $InputText.Split(',')) {
    foreach ($digit in $line.ToCharArray()) {
      $value = [int][char]$digit
      foreach ($b in [byte[]]@(0xb9, ($value -band 0xff), $scan[[string]$digit], 0xb4, 0x05, 0xcd, 0x16)) { [void]$bytes.Add($b) }
    }
    foreach ($b in [byte[]]@(0xb9, 0x0d, 0x1c, 0xb4, 0x05, 0xcd, 0x16)) { [void]$bytes.Add($b) }
  }
  foreach ($b in [byte[]]@(0xb8, 0x00, 0x4c, 0xcd, 0x21)) { [void]$bytes.Add($b) }
  [IO.File]::WriteAllBytes($Path, $bytes.ToArray())
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
function Set-MenuString([byte[]]$Bytes, [ref]$Offset, [string]$Text) {
  $raw = ConvertTo-EclPackedString $Text
  $Bytes[$Offset.Value] = [byte]$raw.Length
  $Offset.Value++
  [Array]::Copy($raw, 0, $Bytes, $Offset.Value, $raw.Length)
  $Offset.Value += $raw.Length
}
function Set-PlainString([byte[]]$Bytes, [ref]$Offset, [string]$Text) {
  $raw = [Text.Encoding]::ASCII.GetBytes($Text)
  $Bytes[$Offset.Value] = [byte]$raw.Length
  $Offset.Value++
  [Array]::Copy($raw, 0, $Bytes, $Offset.Value, $raw.Length)
  $Offset.Value += $raw.Length
}

$fx = [byte[]]::new(5920)
Set-Ascii $fx 0 'GBEF'
Set-U16 $fx 4 14
Set-U16 $fx 8 2
Set-Ascii $fx 116 'GBRS'
Set-U16 $fx 120 1
Set-U16 $fx 122 0x0056
Set-U16 $fx 124 0x1234
Set-Ascii $fx 2246 'GBSX'
Set-U16 $fx 2250 1
Set-U16 $fx 2252 0x15
Set-U16 $fx 2254 5
Set-U16 $fx 2256 0x0102
Set-U16 $fx 2258 4
Set-U16 $fx 2260 2
Set-U16 $fx 2262 1
Set-U16 $fx 2264 1
Set-U16 $fx 3532 4
Set-Ascii $fx 3534 'PICK'
Set-Ascii $fx 5750 'GBMN'
Set-U16 $fx 5754 1
Set-U16 $fx 5756 0x0102
Set-U16 $fx 5758 2
Set-U16 $fx 5760 0x15
Set-U16 $fx 5762 0
Set-U16 $fx 5764 0
Set-U16 $fx 5766 0x1234
Set-U16 $fx 5768 0x0056
Set-U16 $fx 5770 0x0102
Set-U16 $fx 5772 0x0015
Set-Ascii $fx 5774 'GBMS'
Set-Ascii $fx 5786 'GBMT'
Set-U16 $fx 5790 3
$menuOffset = 5792
Set-MenuString $fx ([ref]$menuOffset) 'PICK'
Set-MenuString $fx ([ref]$menuOffset) 'LEFT'
Set-MenuString $fx ([ref]$menuOffset) 'RIGHT'
[IO.File]::WriteAllBytes((Join-Path $run 'MENU.EFX'), $fx)
$who = [byte[]]$fx.Clone()
Set-U16 $who 2252 0x39
Set-U16 $who 2254 1
Set-U16 $who 2256 0x010A
Set-U16 $who 5756 0x010A
Set-U16 $who 5758 3
Set-U16 $who 5760 0x39
Set-U16 $who 5770 0x010A
Set-U16 $who 5772 0x39
Set-U16 $who 5790 3
[Array]::Clear($who, 5792, 128)
$whoOffset = 5792
Set-PlainString $who ([ref]$whoOffset) 'TIKA'
Set-PlainString $who ([ref]$whoOffset) 'TANIS'
Set-PlainString $who ([ref]$whoOffset) 'RAISTLIN'
[IO.File]::WriteAllBytes((Join-Path $run 'WHO.EFX'), $who)
$whoBad = [byte[]]$who.Clone()
Set-U16 $whoBad 2254 2
[IO.File]::WriteAllBytes((Join-Path $run 'WHO-BAD.EFX'), $whoBad)
$number = [byte[]]$fx.Clone()
Set-U16 $number 2252 0x0F
Set-U16 $number 2254 2
Set-U16 $number 2256 3
Set-U16 $number 2258 0x0102
Set-U16 $number 5758 0
Set-U16 $number 5760 0x0F
Set-U16 $number 5772 0x0F
Set-U16 $number 5790 0
[Array]::Clear($number, 5792, 128)
[IO.File]::WriteAllBytes((Join-Path $run 'NUMBER.EFX'), $number)
$numberBad = [byte[]]$number.Clone()
Set-U16 $numberBad 2258 26
[IO.File]::WriteAllBytes((Join-Path $run 'NUMBAD.EFX'), $numberBad)

# DQK's wall menu follows a visible caption in the fixed GBSX records.
$wall = [byte[]]$fx.Clone()
[Array]::Clear($wall, 2252, 64 * 20)
[Array]::Clear($wall, 3532, 64 * 34)
Set-U16 $wall 2250 3
Set-U16 $wall 2252 0x12
Set-U16 $wall 2254 1
Set-U16 $wall 2272 0x33
Set-U16 $wall 2292 0x2B
Set-U16 $wall 2294 8
Set-U16 $wall 2296 0x00BF
Set-U16 $wall 2298 6
Set-U16 $wall 122 2
Set-U16 $wall 124 0x855E
[Text.Encoding]::ASCII.GetBytes('SELECT THE COMBAT WALL TYPE:').CopyTo($wall, 3534)
Set-U16 $wall 3532 28
Set-U16 $wall 3566 0
Set-U16 $wall 3600 0
Set-U16 $wall 5754 1
Set-U16 $wall 5756 0x00BF
Set-U16 $wall 5758 6
Set-U16 $wall 5760 0x2B
Set-U16 $wall 5762 2
Set-U16 $wall 5764 0
Set-U16 $wall 5766 0x855E
Set-U16 $wall 5768 2
Set-U16 $wall 5770 0x00BF
Set-U16 $wall 5772 0x2B
Set-U16 $wall 5790 6
$wallOffset = 5792
foreach ($label in 'NORMAL', 'CAVE', 'WATER', 'SWAMP', 'ABYSS', 'FLAME') {
  Set-MenuString $wall ([ref]$wallOffset) $label
}
[IO.File]::WriteAllBytes((Join-Path $run 'WALL-V14.EFX'), $wall)
$wall15 = [byte[]]::new(5932)
[Array]::Copy($wall, $wall15, $wall.Length)
Set-U16 $wall15 4 15
Set-Ascii $wall15 5920 'GBRF'
[IO.File]::WriteAllBytes((Join-Path $run 'WALL-V15.EFX'), $wall15)

# PRINTCLEAR replaces prior output; subsequent PRINT and PRINT_RETURN remain
# ordered before the same horizontal menu.
$wallClear = [byte[]]$wall15.Clone()
[Array]::Clear($wallClear, 2252, 64 * 20)
[Array]::Clear($wallClear, 3532, 64 * 34)
Set-U16 $wallClear 2250 5
Set-U16 $wallClear 2252 0x11
Set-U16 $wallClear 2254 1
Set-U16 $wallClear 2272 0x12
Set-U16 $wallClear 2274 1
Set-U16 $wallClear 2292 0x11
Set-U16 $wallClear 2294 1
Set-U16 $wallClear 2312 0x33
Set-U16 $wallClear 2332 0x2B
Set-U16 $wallClear 2334 8
Set-U16 $wallClear 2336 0x00BF
Set-U16 $wallClear 2338 6
[Text.Encoding]::ASCII.GetBytes('OLD').CopyTo($wallClear, 3534)
Set-U16 $wallClear 3532 3
[Text.Encoding]::ASCII.GetBytes('CURRENT').CopyTo($wallClear, 3568)
Set-U16 $wallClear 3566 7
[Text.Encoding]::ASCII.GetBytes(' TITLE').CopyTo($wallClear, 3602)
Set-U16 $wallClear 3600 6
Set-U16 $wallClear 5762 4
[IO.File]::WriteAllBytes((Join-Path $run 'WCLR15.EFX'), $wallClear)

$wallBad = [byte[]]$wall.Clone()
Set-U16 $wallBad 3532 33
[IO.File]::WriteAllBytes((Join-Path $run 'WALL-BAD.EFX'), $wallBad)

$zeroCountMenu = [byte[]]$fx.Clone()
Set-U16 $zeroCountMenu 5758 0
[IO.File]::WriteAllBytes((Join-Path $run 'ZCOUNT.EFX'), $zeroCountMenu)
[IO.File]::WriteAllBytes((Join-Path $run 'SHORT.EFX'), $fx[0..5759])
$trailing = [byte[]]::new(5921)
[Array]::Copy($fx, $trailing, $fx.Length)
$trailing[5920] = 1
[IO.File]::WriteAllBytes((Join-Path $run 'TRAIL.EFX'), $trailing)
$bad = [byte[]]$fx.Clone()
Set-U16 $bad 5758 3
[IO.File]::WriteAllBytes((Join-Path $run 'COUNT.EFX'), $bad)
$old = [byte[]]$fx.Clone()
Set-U16 $old 4 13
[IO.File]::WriteAllBytes((Join-Path $run 'OLD.EFX'), $old)
$future = [byte[]]$fx.Clone()
Set-U16 $future 4 15
[IO.File]::WriteAllBytes((Join-Path $run 'FUTURE.EFX'), $future)

# Boundary and identity cases share the same valid menu records above. Keep
# each mutated source on disk so its exact bytes can be checked after DOSBox.
$numberCountOne = [byte[]]$number.Clone()
Set-U16 $numberCountOne 5758 1
$numberTextPadding = [byte[]]$number.Clone()
$numberTextPadding[5792] = 1
[IO.File]::WriteAllBytes((Join-Path $run 'NUMCNT1.EFX'), $numberCountOne)
[IO.File]::WriteAllBytes((Join-Path $run 'NUMPAD.EFX'), $numberTextPadding)

$identityInputs = [Collections.Generic.List[object]]::new()
foreach ($format in @(
    @{ Name = 'V14'; Base = $fx },
    @{ Name = 'V15'; Base = $wall15 }
  )) {
  foreach ($field in @(
      @{ Name = 'PC'; Offset = 5766 },
      @{ Name = 'AREA'; Offset = 5768 },
      @{ Name = 'DEST'; Offset = 5770 },
      @{ Name = 'OP'; Offset = 5772 }
    )) {
    $caseName = "I$($format.Name)$($field.Name)"
    $mutated = [byte[]]$format.Base.Clone()
    $prior = [BitConverter]::ToUInt16($mutated, $field.Offset)
    Set-U16 $mutated $field.Offset (($prior + 1) -band 0xffff)
    $casePath = Join-Path $run "$caseName.EFX"
    [IO.File]::WriteAllBytes($casePath, $mutated)
    $identityInputs.Add(@{ Name = $caseName; Path = $casePath; Hash = (Get-FileHash $casePath -Algorithm SHA256).Hash })
  }
}
$newInvalidInputs = @{}
foreach ($name in 'NUMCNT1', 'NUMPAD') {
  $path = Join-Path $run "$name.EFX"
  $newInvalidInputs[$name] = @{ Path = $path; Hash = (Get-FileHash $path -Algorithm SHA256).Hash }
}
$numberPath = Join-Path $run 'NUMBER.EFX'
$newInvalidInputs['NUMOVER'] = @{ Path = $numberPath; Hash = (Get-FileHash $numberPath -Algorithm SHA256).Hash }
$typedNumberCases = @(
  @{ Name = 'TYPZERO'; Keys = 'KZERO.COM'; Input = '0'; Expected = 0 },
  @{ Name = 'TYP1234'; Keys = 'K1234.COM'; Input = '1234'; Expected = 1234 },
  @{ Name = 'TYPMAX'; Keys = 'KMAX.COM'; Input = '65535'; Expected = 65535 },
  @{ Name = 'TYPOVR'; Keys = 'KOVR.COM'; Input = '65536,0'; Expected = 0 }
)
foreach ($case in $typedNumberCases) {
  Write-QueuedNumericKeys (Join-Path $run $case.Keys) $case.Input
}
foreach ($case in $identityInputs) { $newInvalidInputs[$case.Name] = @{ Path = $case.Path; Hash = $case.Hash } }

$conf = Join-Path $run '_ccmenu.conf'
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
CALL C:\MENU.BAT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

@"
@ECHO OFF
CCMENU C:\MENU.EFX C:\ZERO.GMO /S 0 > C:\ZERO.TXT
CCMENU C:\MENU.EFX C:\ONE.GMO /S 1 > C:\ONE.TXT
CCMENU C:\MENU.EFX C:\OUT.GMO /S 2 > C:\OUT.TXT
CCMENU C:\WHO.EFX C:\WHO.GMO /S 2 > C:\WHO.TXT
CCMENU C:\WHO-BAD.EFX C:\WHO-BAD.GMO /S 0 > C:\WHO-BAD.TXT
CCMENU C:\NUMBER.EFX C:\NUMBER.GMO /S 750 > C:\NUMBER.TXT
CCMENU C:\NUMBAD.EFX C:\NUMBAD.GMO /S 17 > C:\NUMBAD.TXT
CCMENU C:\NUMBER.EFX C:\NUMZERO.GMO /S 0 > C:\NUMZERO.TXT
CCMENU C:\NUMBER.EFX C:\NUMMAX.GMO /S 65535 > C:\NUMMAX.TXT
CCMENU C:\WALL-V14.EFX C:\WALL-V14.GMO /S 0 > C:\WALL-V14.TXT
CCMENU C:\WALL-V15.EFX C:\WALL-V15.GMO /S 0 > C:\WALL-V15.TXT
CCMENU C:\WCLR15.EFX C:\WCLR15.GMO /S 0 > C:\WCLR15.TXT
CCMENU C:\WALL-BAD.EFX C:\WALL-BAD.GMO /S 0 > C:\WALL-BAD.TXT
CCMENU C:\ZCOUNT.EFX C:\ZCOUNT.GMO /S 0 > C:\ZCOUNT.TXT
CCMENU C:\SHORT.EFX C:\SHORT.GMO /S 0 > C:\SHORT.TXT
CCMENU C:\TRAIL.EFX C:\TRAIL.GMO /S 0 > C:\TRAIL.TXT
CCMENU C:\COUNT.EFX C:\COUNT.GMO /S 0 > C:\COUNT.TXT
CCMENU C:\OLD.EFX C:\OLD.GMO /S 0 > C:\OLD.TXT
CCMENU C:\FUTURE.EFX C:\FUTURE.GMO /S 0 > C:\FUTURE.TXT
"@ | Set-Content -LiteralPath (Join-Path $run 'MENU.BAT') -Encoding ASCII

$addedBatch = [Collections.Generic.List[string]]::new()
foreach ($case in @(
    @{ Name = 'NUMCNT1'; Input = 'NUMCNT1.EFX'; Selection = 0 },
    @{ Name = 'NUMPAD'; Input = 'NUMPAD.EFX'; Selection = 0 },
    @{ Name = 'NUMOVER'; Input = 'NUMBER.EFX'; Selection = 65536 }
  )) {
  $name = $case.Name
  $addedBatch.Add("CCMENU C:\$($case.Input) C:\$name.GMO /S $($case.Selection) > C:\$name.TXT")
  $addedBatch.Add("IF ERRORLEVEL 1 GOTO REJECT_$name")
  $addedBatch.Add("ECHO ACCEPT>C:\$name.OK")
  $addedBatch.Add("GOTO DONE_$name")
  $addedBatch.Add(":REJECT_$name")
  $addedBatch.Add("ECHO REJECT>C:\$name.OK")
  $addedBatch.Add(":DONE_$name")
}
foreach ($case in $typedNumberCases) {
  $name = $case.Name
  $addedBatch.Add($case.Keys)
  $addedBatch.Add("CCMENU C:\NUMBER.EFX C:\$name.GMO > C:\$name.TXT")
  $addedBatch.Add("IF ERRORLEVEL 1 GOTO R$name")
  $addedBatch.Add("ECHO ACCEPT>C:\$name.OK")
  $addedBatch.Add("GOTO D$name")
  $addedBatch.Add(":R$name")
  $addedBatch.Add("ECHO REJECT>C:\$name.OK")
  $addedBatch.Add(":D$name")
}
foreach ($case in $identityInputs) {
  $name = $case.Name
  $addedBatch.Add("CCMENU C:\$name.EFX C:\$name.GMO /S 0 > C:\$name.TXT")
  $addedBatch.Add("IF ERRORLEVEL 1 GOTO REJECT_$name")
  $addedBatch.Add("ECHO ACCEPT>C:\$name.OK")
  $addedBatch.Add("GOTO DONE_$name")
  $addedBatch.Add(":REJECT_$name")
  $addedBatch.Add("ECHO REJECT>C:\$name.OK")
  $addedBatch.Add(":DONE_$name")
}
[IO.File]::WriteAllBytes((Join-Path $run 'EMPTY.TXT'), [byte[]]@())
[IO.File]::WriteAllBytes((Join-Path $run 'ANS.TXT'), [byte[]]@(0x32, 0x0D, 0x0A))
$pendingHashBefore = (Get-FileHash (Join-Path $run 'MENU.EFX') -Algorithm SHA256).Hash
foreach ($case in @(@{ Name = 'REOF'; In = 'EMPTY.TXT' }, @{ Name = 'RANS'; In = 'ANS.TXT' })) {
  $name = $case.Name
  $addedBatch.Add("CCMENU C:\MENU.EFX C:\$name.GMO < C:\$($case.In) > C:\$name.TXT")
  $addedBatch.Add("IF ERRORLEVEL 1 GOTO REJECT_$name")
  $addedBatch.Add("ECHO ACCEPT>C:\$name.OK")
  $addedBatch.Add("GOTO DONE_$name")
  $addedBatch.Add(":REJECT_$name")
  $addedBatch.Add("ECHO REJECT>C:\$name.OK")
  $addedBatch.Add(":DONE_$name")
}
[IO.File]::AppendAllLines((Join-Path $run 'MENU.BAT'), $addedBatch, [Text.Encoding]::ASCII)

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw 'DOSBox did not exit while running CCMENU smoke'
}

function Assert-Gbmo([string]$Path, [int]$ExpectedSelection, [string]$Label, [int]$ExpectedCount = 2, [int]$ExpectedDestination = 0x0102, [int]$ExpectedOpcode = 0x0015, [int]$ExpectedPc = 0x1234, [int]$ExpectedArea = 0x0056) {
  if (-not (Test-Path $Path)) { throw "${Label}: outcome was not written" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne 18 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBMO' -or
      [BitConverter]::ToUInt16($bytes, 4) -ne 2 -or [BitConverter]::ToUInt16($bytes, 6) -ne $ExpectedSelection -or
      [BitConverter]::ToUInt16($bytes, 8) -ne $ExpectedCount -or [BitConverter]::ToUInt16($bytes, 10) -ne $ExpectedPc -or
      [BitConverter]::ToUInt16($bytes, 12) -ne $ExpectedArea -or [BitConverter]::ToUInt16($bytes, 14) -ne $ExpectedDestination -or
      [BitConverter]::ToUInt16($bytes, 16) -ne $ExpectedOpcode) {
    throw "${Label}: malformed outcome"
  }
}

Assert-Gbmo (Join-Path $run 'ZERO.GMO') 0 'zero selection'
Assert-Gbmo (Join-Path $run 'ONE.GMO') 1 'one selection'
Assert-Gbmo (Join-Path $run 'WHO.GMO') 2 'WHO selection' 3 0x010A 0x0039
Assert-Gbmo (Join-Path $run 'NUMBER.GMO') 750 'number selection' 0 0x0102 0x000F
Assert-Gbmo (Join-Path $run 'NUMZERO.GMO') 0 'numeric zero selection' 0 0x0102 0x000F
Assert-Gbmo (Join-Path $run 'NUMMAX.GMO') 65535 'numeric maximum selection' 0 0x0102 0x000F
foreach ($case in $typedNumberCases) {
  Assert-Gbmo (Join-Path $run "$($case.Name).GMO") $case.Expected "$($case.Name) typed numeric selection" 0 0x0102 0x000F
  $statusPath = Join-Path $run "$($case.Name).OK"
  if (-not (Test-Path $statusPath) -or (Get-Content $statusPath -Raw).Trim() -ne 'ACCEPT') {
    throw "$($case.Name) typed numeric input did not complete successfully"
  }
}
Assert-Gbmo (Join-Path $run 'WALL-V14.GMO') 0 'wall caption v14' 6 0x00BF 0x002B 0x855E 2
Assert-Gbmo (Join-Path $run 'WALL-V15.GMO') 0 'wall caption v15' 6 0x00BF 0x002B 0x855E 2
Assert-Gbmo (Join-Path $run 'WCLR15.GMO') 0 'wall text clear' 6 0x00BF 0x002B 0x855E 2
foreach ($name in 'OUT.GMO', 'WHO-BAD.GMO', 'NUMBAD.GMO', 'WALL-BAD.GMO', 'ZCOUNT.GMO', 'SHORT.GMO', 'TRAIL.GMO', 'COUNT.GMO', 'OLD.GMO', 'FUTURE.GMO', 'NUMCNT1.GMO', 'NUMPAD.GMO', 'NUMOVER.GMO') {
  if (Test-Path (Join-Path $run $name)) { throw "$name was written for invalid input" }
}
foreach ($case in $identityInputs) {
  if (Test-Path (Join-Path $run "$($case.Name).GMO")) { throw "$($case.Name).GMO was written for a mismatched pending identity" }
}
foreach ($expected in 'PICK', '1. LEFT', '2. RIGHT') {
  if ((Get-Content (Join-Path $run 'ZERO.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "MENU.EFX did not render $expected" }
}
foreach ($expected in '1. TIKA', '2. TANIS', '3. RAISTLIN') {
  if ((Get-Content (Join-Path $run 'WHO.TXT') -Raw) -notmatch [regex]::Escape($expected)) { throw "WHO.EFX did not render $expected" }
}
if ((Get-Content (Join-Path $run 'NUMBER.TXT') -Raw) -notmatch 'NUMBER 0\.\.65535') { throw 'NUMBER.EFX did not render the free numeric input range' }
$typedOverflowTranscript = Get-Content (Join-Path $run 'TYPOVR.TXT') -Raw
if ($typedOverflowTranscript -notmatch '65536' -or $typedOverflowTranscript -notmatch 'choice is outside this menu') {
  throw 'TYPOVR did not reject 65536 and reprompt before accepting 0'
}
foreach ($name in 'TYPZERO', 'TYP1234', 'TYPMAX', 'TYPOVR') {
  if ((Get-Content (Join-Path $run "$name.TXT") -Raw) -notmatch 'Choose 1\.\.N:') { throw "$name typed input prompt missing" }
}
foreach ($version in 'WALL-V14', 'WALL-V15', 'WCLR15') {
  $transcript = Get-Content (Join-Path $run "$version.TXT") -Raw
  $caption = if ($version -eq 'WCLR15') { 'CURRENT TITLE' } else { 'SELECT THE COMBAT WALL TYPE:' }
  $captionAt = $transcript.IndexOf($caption, [StringComparison]::Ordinal)
  $choiceAt = $transcript.IndexOf('1. NORMAL', [StringComparison]::Ordinal)
  if ($captionAt -lt 0 -or $captionAt -ge $choiceAt -or $transcript.Split($caption).Length -ne 2) {
    throw "$version did not render the source caption exactly once before its choices"
  }
}
$clearTranscript = Get-Content (Join-Path $run 'WCLR15.TXT') -Raw
if ($clearTranscript.Contains('OLD') -or -not $clearTranscript.Contains("CURRENT TITLE`r`n")) {
  throw 'WALL-CLEAR-V15 did not apply PRINTCLEAR and preserve following text order'
}
foreach ($text in 'OUT.TXT', 'WHO-BAD.TXT', 'NUMBAD.TXT', 'WALL-BAD.TXT', 'ZCOUNT.TXT', 'SHORT.TXT', 'TRAIL.TXT', 'COUNT.TXT', 'OLD.TXT', 'FUTURE.TXT', 'NUMCNT1.TXT', 'NUMPAD.TXT') {
  if ((Get-Content (Join-Path $run $text) -Raw) -notmatch 'CCMENU:') {
    throw "$text did not report a reject"
  }
}
foreach ($text in 'NUMBAD.TXT', 'ZCOUNT.TXT') {
  if ((Get-Content (Join-Path $run $text) -Raw) -notmatch 'CCMENU: invalid pending menu state') {
    throw "$text did not report an invalid pending menu state"
  }
}
foreach ($text in 'NUMCNT1.TXT', 'NUMPAD.TXT') {
  if ((Get-Content (Join-Path $run $text) -Raw) -notmatch 'CCMENU: invalid pending menu state') {
    throw "$text did not report an invalid pending menu state"
  }
}
if ((Get-Content (Join-Path $run 'NUMOVER.TXT') -Raw) -notmatch 'CCMENU <pending\.gbef> <out\.gbmo> \[/S zeroBasedChoice\]') {
  throw 'NUMOVER.TXT did not report the out-of-range command usage'
}

foreach ($name in 'NUMCNT1', 'NUMPAD', 'NUMOVER') {
  $statusPath = Join-Path $run "$name.OK"
  if (-not (Test-Path $statusPath) -or (Get-Content $statusPath -Raw).Trim() -ne 'REJECT') {
    throw "$name did not return a failure status to the DOS batch"
  }
}
foreach ($case in $identityInputs) {
  $statusPath = Join-Path $run "$($case.Name).OK"
  $logPath = Join-Path $run "$($case.Name).TXT"
  if (-not (Test-Path $statusPath) -or (Get-Content $statusPath -Raw).Trim() -ne 'REJECT') {
    throw "$($case.Name) did not return a failure status to the DOS batch"
  }
  if ((Get-Content $logPath -Raw) -notmatch 'CCMENU: invalid pending menu state') {
    throw "$($case.Name) did not report an invalid pending menu state"
  }
}
foreach ($entry in $newInvalidInputs.GetEnumerator()) {
  if ((Get-FileHash $entry.Value.Path -Algorithm SHA256).Hash -ne $entry.Value.Hash) {
    throw "$($entry.Key) pending effect bytes changed during CCMENU validation"
  }
}

# Redirected stdin: EOF must fail fast (a spin shows up as the DOSBox timeout above).
if (-not (Test-Path (Join-Path $run 'REOF.OK')) -or (Get-Content (Join-Path $run 'REOF.OK') -Raw).Trim() -ne 'REJECT') {
  throw 'CCMENU < EMPTY.TXT did not exit nonzero'
}
if (Test-Path (Join-Path $run 'REOF.GMO')) { throw 'CCMENU wrote an outcome at stdin EOF' }
if ((Get-FileHash (Join-Path $run 'MENU.EFX') -Algorithm SHA256).Hash -ne $pendingHashBefore) { throw 'pending checkpoint changed at stdin EOF' }
if ((Get-Content (Join-Path $run 'RANS.OK') -Raw).Trim() -ne 'ACCEPT') { throw 'CCMENU < ANS.TXT did not succeed' }
Assert-Gbmo (Join-Path $run 'RANS.GMO') 1 'redirected answer 2'
if ((Get-FileHash (Join-Path $run 'RANS.GMO') -Algorithm SHA256).Hash -ne (Get-FileHash (Join-Path $run 'ONE.GMO') -Algorithm SHA256).Hash) {
  throw 'redirected answer outcome differs from /S 1'
}

Write-Output 'PASS: CCMENU typed numeric 0/1234/65535; overflow 65536 rejected then 0 accepted with EFX unchanged'
Write-Output 'RESULT: CCMENU v14 GBMN/GBMT validation and GBMO outcome smoke PASS'
