# ccecl-pool-menu-capacity-test.ps1 -- largest installed Gen1 GBMT menu.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-pool-menu-capacity-test'
$retail = 'C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { throw "Required DOSBox executable is unavailable: $dosbox" }
foreach ($name in 'ECL1.DAX', 'POOL.CFG') {
  if (-not (Test-Path -LiteralPath (Join-Path $retail $name) -PathType Leaf)) {
    throw "Required Pool of Radiance fixture is unavailable: $(Join-Path $retail $name)"
  }
}
foreach ($target in 'ccecl', 'ccmenu') {
  & (Join-Path $native 'build.ps1') -Target $target
  if ($LASTEXITCODE -ne 0) { throw "$target build failed" }
}

if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
foreach ($name in 'ccecl.com', 'ccmenu.com') {
  Copy-Item (Join-Path $build $name) (Join-Path $run $name.ToUpperInvariant()) -Force
}
foreach ($name in 'ECL1.DAX', 'POOL.CFG') {
  Copy-Item (Join-Path $retail $name) (Join-Path $run $name) -Force
}

function Add-Byte($List, [int]$Value) { [void]$List.Add([byte]($Value -band 0xff)) }
function Add-Imm($List, [int]$Value) { Add-Byte $List 0; Add-Byte $List $Value }
function Add-Ref($List, [int]$Address) {
  Add-Byte $List 1; Add-Byte $List $Address; Add-Byte $List ($Address -shr 8)
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
function Write-BoundaryMenu([string]$Path, [string]$First, [string]$Second) {
  # This deliberately exercises cumulative accounting. Two 83-character
  # labels pack to 63 bytes each, so their two length prefixes consume all
  # 128 GBMT bytes. Growing only the second label by one character must reject
  # the entire menu rather than truncate either label.
  $firstRaw = ConvertTo-EclPackedString $First
  $secondRaw = ConvertTo-EclPackedString $Second
  $program = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { Add-Byte $program 0 }
  Add-Byte $program 0x2B; Add-Ref $program 0x0104; Add-Imm $program 2
  Add-Byte $program 0x80; Add-Byte $program $firstRaw.Length
  foreach ($b in $firstRaw) { Add-Byte $program $b }
  Add-Byte $program 0x80; Add-Byte $program $secondRaw.Length
  foreach ($b in $secondRaw) { Add-Byte $program $b }
  Add-Byte $program 0x09; Add-Imm $program 9; Add-Ref $program 0x0105
  Add-Byte $program 0
  [IO.File]::WriteAllBytes($Path, $program.ToArray())
}
$limitFirst = 'A' * 83
$limitSecond = 'B' * 83
$limitFirstRaw = ConvertTo-EclPackedString $limitFirst
$limitSecondRaw = ConvertTo-EclPackedString $limitSecond
if ($limitFirstRaw.Length -ne 63 -or $limitSecondRaw.Length -ne 63) { throw '128-byte boundary fixture no longer packs to two 63-byte segments' }
Write-BoundaryMenu (Join-Path $run 'L128.BIN') $limitFirst $limitSecond
Write-BoundaryMenu (Join-Path $run 'L129.BIN') $limitFirst ('B' * 84)

# ECL1#18 at file offset 0x0138 is Pool's observed largest four-segment
# inline menu.  Pool's 0x98FE virtual base makes it /@ decimal 39478.
$conf = Join-Path $run '_pool-menu-capacity.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
@echo off
mount C "$run"
C:
CCECL C:\ECL1.DAX 18 /@ 39478 /! /E C:\POOL0.EFX > C:\POOL0.TXT
CCMENU C:\POOL0.EFX C:\POOL.GMO /S 2 > C:\POOLM.TXT
CCECL C:\ECL1.DAX 18 /@ 39478 /R C:\POOL0.EFX C:\POOL.GMO /E C:\POOL1.EFX > C:\POOL1.TXT
CCECL C:\L128.BIN /! /E C:\L128P.EFX > C:\L128P.TXT
CCMENU C:\L128P.EFX C:\L128O.GMO /S 1 > C:\L128M.TXT
CCECL C:\L128.BIN /R C:\L128P.EFX C:\L128O.GMO /E C:\L128R.EFX > C:\L128R.TXT
CCECL C:\L129.BIN /! /E C:\L129.EFX > C:\L129.TXT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out running the Pool capacity menu' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }

function U16([byte[]]$Bytes, [int]$Offset) { [BitConverter]::ToUInt16($Bytes, $Offset) }
function Get-Memory([byte[]]$Bytes, [int]$Address) {
  $count = U16 $Bytes 196
  for ($i = 0; $i -lt $count; $i++) {
    if ((U16 $Bytes (198 + ($i * 2))) -eq $Address) { return U16 $Bytes (1222 + ($i * 2)) }
  }
  return $null
}

$pending = [IO.File]::ReadAllBytes((Join-Path $run 'POOL0.EFX'))
if ($pending.Length -ne 5920 -or [Text.Encoding]::ASCII.GetString($pending, 0, 4) -ne 'GBEF' -or
    (U16 $pending 4) -ne 14 -or (U16 $pending 8) -ne 2 -or
    (U16 $pending 5756) -ne 0x6E79 -or (U16 $pending 5758) -ne 3 -or (U16 $pending 5760) -ne 0x15 -or
    [Text.Encoding]::ASCII.GetString($pending, 5786, 4) -ne 'GBMT' -or (U16 $pending 5790) -ne 4) {
  throw 'Pool maximum menu did not yield its expected v14 pending contract'
}
$pos = 5792
foreach ($expectedLength in 48,17,21,18) {
  if ($pending[$pos] -ne $expectedLength) { throw "Pool GBMT segment length at $pos is $($pending[$pos]), expected $expectedLength" }
  $pos += 1 + $expectedLength
}
if ($pos -ne 5900 -or ($pending[$pos..5919] | Where-Object { $_ -ne 0 }).Count -ne 0) {
  throw 'Pool GBMT did not retain exactly 108 bytes followed by zero padding'
}

$menu = Get-Content (Join-Path $run 'POOLM.TXT') -Raw
foreach ($text in 'THE PLAZA AHEAD IS CROWDED WITH MONSTERS. HOW WILL YOU PROCEDE?',
  '1. STRIDE BOLDLY FORWARD!', '2. DISGUISE PARTY AS MONSTERS.', '3. SNEAK, REMAINING UNSEEN') {
  if ($menu -notmatch [regex]::Escape($text)) { throw "Pool maximum menu did not render complete text: $text" }
}
$resumed = [IO.File]::ReadAllBytes((Join-Path $run 'POOL1.EFX'))
if ($resumed.Length -ne 5750 -or (U16 $resumed 8) -eq 2 -or (Get-Memory $resumed 0x6E79) -ne 2) {
  throw 'Pool maximum menu did not cold-resume selected branch exactly once'
}

$atLimit = [IO.File]::ReadAllBytes((Join-Path $run 'L128P.EFX'))
if ($atLimit.Length -ne 5920 -or (U16 $atLimit 4) -ne 14 -or (U16 $atLimit 8) -ne 2 -or
    (U16 $atLimit 5756) -ne 0x0104 -or (U16 $atLimit 5758) -ne 2 -or (U16 $atLimit 5760) -ne 0x2B -or
    [Text.Encoding]::ASCII.GetString($atLimit, 5786, 4) -ne 'GBMT' -or (U16 $atLimit 5790) -ne 2 -or
    $atLimit[5792] -ne 63 -or $atLimit[5856] -ne 63 -or
    [Convert]::ToBase64String([byte[]]$atLimit[5793..5855]) -ne [Convert]::ToBase64String($limitFirstRaw) -or
    [Convert]::ToBase64String([byte[]]$atLimit[5857..5919]) -ne [Convert]::ToBase64String($limitSecondRaw)) {
  throw '128-byte GBMT boundary menu did not yield its complete two-segment payload'
}
$atLimitMenu = Get-Content (Join-Path $run 'L128M.TXT') -Raw
if ($atLimitMenu -notmatch ('1\. ' + ('A' * 80)) -or $atLimitMenu -notmatch ('2\. ' + ('B' * 80))) {
  throw '128-byte GBMT boundary menu did not render its packed labels'
}
$atLimitResumed = [IO.File]::ReadAllBytes((Join-Path $run 'L128R.EFX'))
if ($atLimitResumed.Length -ne 5750 -or (U16 $atLimitResumed 8) -ne 0 -or
    (Get-Memory $atLimitResumed 0x0104) -ne 1 -or (Get-Memory $atLimitResumed 0x0105) -ne 9) {
  throw '128-byte GBMT boundary menu did not cold-resume its selected branch'
}

$overLimit = [IO.File]::ReadAllBytes((Join-Path $run 'L129.EFX'))
if ($overLimit.Length -ne 5750 -or (U16 $overLimit 4) -ne 9 -or (U16 $overLimit 8) -ne 4 -or
    [Text.Encoding]::ASCII.GetString($overLimit, 5720, 4) -ne 'GBHD' -or (U16 $overLimit 5724) -ne 2 -or
    (U16 $overLimit 5728) -ne 0x2B) {
  throw '129-byte GBMT boundary menu was not rejected as a controlled menu-text capacity halt'
}
Write-Output 'RESULT: Pool 108-byte retail and synthetic 128-byte GBMT boundary menus PASS'
