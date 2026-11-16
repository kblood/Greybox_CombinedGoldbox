# ccdat-test.ps1 -- focused CCDAT record parser smoke.
#
# Builds CCDAT.COM, runs it under DOSBox against a synthetic CoAB 422-byte
# MON*CHA.DAX record, and optionally checks real CoAB MON5CHA.DAX records when
# the local coab_extracted dump is present.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "ccdat-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccdat

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "ccdat.com") (Join-Path $run "CCDAT.COM") -Force

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

function Write-SingleBlockDax([string]$Path, [byte]$BlockId, [byte[]]$Raw) {
  [byte[]]$comp = ConvertTo-DaxLiteralRle $Raw
  [byte[]]$bytes = [byte[]]::new(11 + $comp.Length)
  $bytes[0] = 9
  $bytes[2] = $BlockId
  [BitConverter]::GetBytes([UInt16]$Raw.Length).CopyTo($bytes, 7)
  [BitConverter]::GetBytes([UInt16]$comp.Length).CopyTo($bytes, 9)
  [Array]::Copy($comp, 0, $bytes, 11, $comp.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

[byte[]]$coab = [byte[]]::new(422)
$name = [Text.Encoding]::ASCII.GetBytes("COAB TEST")
$coab[0] = [byte]$name.Length
[Array]::Copy($name, 0, $coab, 1, $name.Length)
foreach ($pair in @(
  @(0x10, 10), @(0x12, 12), @(0x14, 11), @(0x16, 14), @(0x18, 13), @(0x1A, 9)
)) {
  $off = [int]$pair[0]
  $val = [byte]$pair[1]
  $coab[$off] = $val
  $coab[$off + 1] = $val
}
$coab[0x74] = 0       # Race.monster
$coab[0x75] = 2       # fighter-like class code
$coab[0xDF] = 10
$coab[0xE0] = 11
$coab[0xE1] = 12
$coab[0xE2] = 12
$coab[0xE3] = 13
$coab[0xE5] = 8       # HitDice
$coab[0xF7] = 128     # control_morale = 128 + 0
$coab[0x11A] = 8      # MonsterType.fire
$coab[0x11C] = 3      # halfAttacks cadence: 2,1,2,1...
[BitConverter]::GetBytes([Int32]1234).CopyTo($coab, 0x127)
$coab[0x199] = 45     # thac0 = 60 - 45 = 15
$coab[0x19A] = 57     # ac = 60 - 57 = 3
$coab[0x19E] = 2
$coab[0x1A0] = 6
$coab[0x1A2] = 0
$coab[0x1A4] = 42
Write-SingleBlockDax (Join-Path $run "SYNMON.DAX") 57 $coab

$coabMon = Join-Path $root "coab_extracted\Data\MON5CHA.DAX"
$realAutoexec = ""
$hasRealCoab = Test-Path $coabMon
if ($hasRealCoab) {
  Copy-Item $coabMon (Join-Path $run "MON5CHA.DAX") -Force
  $realAutoexec = @"
CCDAT M C:\MON5CHA.DAX 9 > C:\SAL.TXT
CCDAT M C:\MON5CHA.DAX 1 > C:\ELF.TXT
"@
}

$conf = Join-Path $run "_ccdat.conf"
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
CCDAT M C:\SYNMON.DAX 0 > C:\SYN.TXT
$realAutoexec
exit
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCDAT smoke test"
}

function Assert-TextContains([string]$Path, [string[]]$Needles, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: output missing"
  }
  $text = Get-Content $Path -Raw
  foreach ($needle in $Needles) {
    if (-not $text.Contains($needle)) {
      throw "$Label failed: missing '$needle'"
    }
  }
}

Assert-TextContains (Join-Path $run "SYN.TXT") @(
  "== MONSTER (CoAB 422-byte) ==",
  "name: COAB TEST",
  "category: 7",
  "thac0: 15",
  "ac: 3",
  "dmgCount: 2",
  "dmgSides: 6",
  "morale%: 0",
  "hp: 42",
  "hitDice: 8",
  "halfAttacks: 3",
  "save_spell: 13",
  "xp: 1234"
) "CCDAT synthetic CoAB MON smoke"

if ($hasRealCoab) {
  Assert-TextContains (Join-Path $run "SAL.TXT") @(
    "name: SALAMANDER",
    "category: 7",
    "thac0: 15",
    "ac: 3",
    "dmgCount: 2",
    "dmgSides: 6",
    "hp: 42",
    "save_spell: 13"
  ) "CCDAT real CoAB SALAMANDER smoke"
  Assert-TextContains (Join-Path $run "ELF.TXT") @(
    "name: DK ELF FIGHTER",
    "category: 6",
    "thac0: 16",
    "ac: 4",
    "hp: 38",
    "hitDice: 5"
  ) "CCDAT real CoAB DK ELF FIGHTER smoke"
  Write-Output "[PASS] CCDAT: real CoAB MON5CHA 422-byte records"
} else {
  Write-Output "[SKIP] CCDAT: real CoAB MON5CHA 422-byte records (coab_extracted data not found)"
}

Write-Output "RESULT: CCDAT CoAB monster record smoke PASS"
