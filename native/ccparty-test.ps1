# Lossless Krynn GBPR roster loader + CCCOMBAT import smoke.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$gameMount = if (Test-Path -LiteralPath $game -PathType Container) { New-RetailStage -Source $game } else { $game }
$dokGame = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$dokGame"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
$dokGameMount = if (Test-Path -LiteralPath $dokGame -PathType Container) { New-RetailStage -Source $dokGame } else { $dokGame }
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

& (Join-Path $native 'build.ps1') -Target ccparty
& (Join-Path $native 'build.ps1') -Target cccombat
& (Join-Path $native 'build.ps1') -Target ccecl
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($name in @(
  'SAVE\CHRDATA1.SAV',
  'SAVE\CHRDATA2.SAV',
  'SAVE\CHRDATA3.SAV',
  'SAVE\CHRDATA4.SAV',
  'SAVE\CHRDATA5.SAV',
  'SAVE\CHRDATA6.SAV'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCPARTY smoke ($name absent from Champions of Krynn)"
    exit 0
  }
}

foreach ($name in @(
  'SAVE\CHRDATA1.GAM',
  'SAVE\CHRDATA2.GAM',
  'SAVE\CHRDATA3.GAM',
  'SAVE\CHRDATA4.GAM',
  'SAVE\CHRDATA5.GAM',
  'SAVE\CHRDATA6.GAM'
)) {
  if (-not (Test-Path (Join-Path $dokGame $name))) {
    Write-Output "SKIP: CCPARTY smoke ($name absent from Death Knights of Krynn)"
    exit 0
  }
}

function Get-I16LE([byte[]]$Bytes, [int]$Offset) {
  return [BitConverter]::ToInt16($Bytes, $Offset)
}

function Test-DqkQsvCandidate([byte[]]$Bytes, [int]$Offset) {
  if ($Offset + 280 -ge $Bytes.Length) { return $false }
  if ($Bytes[$Offset] -gt 20 -or
      $Bytes[$Offset + 1] -ne 0 -or
      $Bytes[$Offset + 2] -ne 0 -or
      $Bytes[$Offset + 3] -ne 0 -or
      $Bytes[$Offset + 94] -gt 9 -or
      $Bytes[$Offset + 127] -lt 30 -or $Bytes[$Offset + 127] -gt 59 -or
      $Bytes[$Offset + 129] -lt 1 -or $Bytes[$Offset + 129] -gt 250 -or
      $Bytes[$Offset + 173] -lt 1 -or $Bytes[$Offset + 173] -gt 10 -or
      $Bytes[$Offset + 175] -lt 1 -or $Bytes[$Offset + 175] -gt 20) {
    return $false
  }
  $nameLen = 0
  for ($i = 0; $i -lt 15; $i++) {
    $c = $Bytes[$Offset + 96 + $i]
    if ($c -eq 0) { break }
    if ($c -eq 32) { continue }
    if (($c -ge 65 -and $c -le 90) -or ($c -ge 97 -and $c -le 122)) {
      $nameLen++
      continue
    }
    return $false
  }
  return $nameLen -ge 3
}

function Get-DqkQsvRecords([string]$Path, [int]$Count) {
  if (-not (Test-Path $Path)) { return @() }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $records = @()
  for ($off = 0; $off -le ($bytes.Length - 406) -and $records.Count -lt $Count; $off++) {
    if (Test-DqkQsvCandidate $bytes $off) {
      $record = New-Object byte[] 406
      [Array]::Copy($bytes, $off, $record, 0, 406)
      $records += ,$record
      $off += 405
    }
  }
  return $records
}

$partyEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$partyEcl.Add([byte]0) }
[byte[]]$partyEclBody = @(
  0x0B,0x00,0x09,0x00,0x02,0x00,0x05, # LOAD_MONSTER #9,#2,#5
  0x0B,0x00,0x13,0x00,0x01,0x00,0x02, # LOAD_MONSTER #19,#1,#2
  0x24                                      # COMBAT
)
$partyEcl.AddRange($partyEclBody)
[IO.File]::WriteAllBytes((Join-Path $build 'PARTYECL.BIN'), $partyEcl.ToArray())

Remove-Item (Join-Path $build 'PARTYFX.BIN') -Force -ErrorAction SilentlyContinue

$conf = Join-Path $build '_ccparty_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CCECL C:\PARTYECL.BIN /E C:\PARTYFX.BIN > NUL
C:\CCPARTY C:\ROSTER.GBP > C:\ROSTER.TXT
C:
CCCOMBAT /E PARTYFX.BIN 4660 PARTY.TRC PARTY.OUT PARTY.RAW /P ROSTER.GBP
exit
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCPARTY smoke timed out'
}

$gbpr = [IO.File]::ReadAllBytes((Join-Path $build 'ROSTER.GBP'))
$count = [BitConverter]::ToUInt16($gbpr, 6)
if ([Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or $count -ne 6 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or $gbpr.Length -ne 2476 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'Invalid GBPR header or length'
}
for ($i = 0; $i -lt $count; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $i + 1) { throw "GBPR slot mismatch at entry $i" }
  $source = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$($i + 1).SAV"))
  for ($j = 0; $j -lt 409; $j++) {
    if ($gbpr[$off + 1 + $j] -ne $source[$j]) {
      throw "GBPR byte mismatch at slot $($i + 1), offset $j"
    }
  }
}

$trace = Get-Content (Join-Path $build 'PARTY.TRC')
if (-not ($trace -match ' p5 ')) { throw 'CCCOMBAT did not import the sixth GBPR member' }
$raw = [IO.File]::ReadAllBytes((Join-Path $build 'PARTY.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'CCCOMBAT GBPR snapshot is not 320x200'
}

$cokDamageGbpr = Join-Path $build 'COKDMG.GBP'
$cokDamage = [IO.File]::ReadAllBytes((Join-Path $build 'ROSTER.GBP'))
$cokDamageBody = 16 + 3 * 410 + 1
$cokDamage[$cokDamageBody + 269] = 1
$cokDamage[$cokDamageBody + 270] = 8
$cokDamage[$cokDamageBody + 271] = 1
[IO.File]::WriteAllBytes($cokDamageGbpr, $cokDamage)
$cokDamageConf = Join-Path $build '_ccparty_cok_damage_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
CCCOMBAT /E PARTYFX.BIN 4660 COKDMG.TRC COKDMG.OUT /P COKDMG.GBP
exit
"@ | Set-Content $cokDamageConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $cokDamageConf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCCOMBAT CoK damage import smoke timed out'
}
$cokDamageTrace = Get-Content (Join-Path $build 'COKDMG.TRC')
if (-not ($cokDamageTrace -match '^1 attack p3 e2 \d+ 13 1 9 0 -$')) {
  throw 'CCCOMBAT did not consume CoK saved damage fields'
}

$cokStfConf = Join-Path $build '_ccparty_cok_stf_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CCCOMBAT /E C:\PARTYFX.BIN 4660 C:\COKSTF.TRC C:\COKSTF.OUT C:\COKSTF.RAW /P C:\ROSTER.GBP
exit
"@ | Set-Content $cokStfConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $cokStfConf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCCOMBAT CoK STF equipment import smoke timed out'
}
$cokStfTrace = Get-Content (Join-Path $build 'COKSTF.TRC')
if (-not ($cokStfTrace -contains '2 attack p5 e1 16 8 1 1 2 -')) {
  throw 'CCCOMBAT did not consume CoK Short Bow/Arrows STF equipment'
}
if (-not ($cokStfTrace -contains '1 attack p3 e2 16 13 1 4 3 -')) {
  throw 'CCCOMBAT did not consume CoK Houpak STF equipment'
}
$cokStfRaw = [IO.File]::ReadAllBytes((Join-Path $build 'COKSTF.RAW'))
if ([BitConverter]::ToUInt16($cokStfRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($cokStfRaw, 2) -ne 200) {
  throw 'CCCOMBAT CoK STF GBPR snapshot is not 320x200'
}

$dokConf = Join-Path $build '_ccparty_dok_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$dokGameMount"
D:
C:\CCPARTY /G C:\DOKROST.GBP > C:\DOKROST.TXT
C:
CCCOMBAT /E PARTYFX.BIN 4660 DOKPART.TRC DOKPART.OUT DOKPART.RAW /P DOKROST.GBP
exit
"@ | Set-Content $dokConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokConf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCPARTY DoK smoke timed out'
}

$dokGbpr = [IO.File]::ReadAllBytes((Join-Path $build 'DOKROST.GBP'))
$dokCount = [BitConverter]::ToUInt16($dokGbpr, 6)
# Retail CHRDATA1..6.GAM bytes 40 and 214 agree in the undamaged source records.
# The discriminating staged case below checks the combat-derived max/current mapping.
$dokHp = @(95, 102, 78, 52, 58, 53)
$dokAc = @(6, -1, 0, 1, -1, 0)
$dokLevel = @(7, 8, 10, 10, 7, 11)
$dokClass = @(1, 1, 2, 2, 2, 3)
$dokDamageSides = @(8, 8, 8, 8, 6, 8)
$dokDamageBonus = @(3, 3, 3, 3, 4, 2)
$dokThac0 = @(12, 11, 12, 11, 14, 13)
$dokMove = @(4, 2, 2, 2, 2, 2)
$dokNextThresholds = @(
  @(0, 0, 0, 0, 0, 0, 0, 220000),
  @(0, 0, 0, 350001, 0, 0, 0, 0),
  @(160000, 0, 0, 0, 150001, 0, 0, 0),
  @(90000, 0, 125001, 0, 0, 100000, 0, 0),
  @(160000, 0, 0, 0, 0, 0, 110001, 0),
  @(110000, 0, 125001, 0, 0, 90000, 0, 0)
)
if ([Text.Encoding]::ASCII.GetString($dokGbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($dokGbpr, 4) -ne 2 -or $dokCount -ne 6 -or
    [BitConverter]::ToUInt16($dokGbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($dokGbpr, 10) -ne 1 -or $dokGbpr.Length -ne 2476 -or
    [BitConverter]::ToUInt16($dokGbpr, 12) -ne 2 -or
    [BitConverter]::ToUInt16($dokGbpr, 14) -ne 1) {
  throw 'Invalid DoK GBPR header or length'
}
for ($i = 0; $i -lt $dokCount; $i++) {
  $off = 16 + $i * 410
  if ($dokGbpr[$off] -ne $i + 1) { throw "DoK GBPR slot mismatch at entry $i" }
  $source = [IO.File]::ReadAllBytes((Join-Path $dokGame "SAVE\CHRDATA$($i + 1).GAM"))
  for ($j = 0; $j -lt 216; $j++) {
    if ($dokGbpr[$off + 1 + $j] -ne $source[$j]) {
      throw "DoK GBPR byte mismatch at slot $($i + 1), offset $j"
    }
  }
  $meta = $off + 1 + 216
  if ([Text.Encoding]::ASCII.GetString($dokGbpr, $meta, 4) -ne 'GBD1' -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 4) -ne 5 -or
      (Get-I16LE $dokGbpr ($meta + 6)) -ne $dokHp[$i] -or
      (Get-I16LE $dokGbpr ($meta + 8)) -ne $dokAc[$i] -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 10) -ne 1 -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 12) -ne $dokDamageSides[$i] -or
      (Get-I16LE $dokGbpr ($meta + 14)) -ne $dokDamageBonus[$i] -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 16) -ne $dokLevel[$i] -or
      $dokGbpr[$meta + 18] -ne $dokClass[$i] -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 20) -ne $dokThac0[$i] -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 22) -ne $dokMove[$i] -or
      [BitConverter]::ToUInt16($dokGbpr, $meta + 26) -ne $dokHp[$i]) {
    throw "DoK GBPR GBD1 metadata mismatch at slot $($i + 1)"
  }
  for ($slot = 0; $slot -lt 8; $slot++) {
    if ([BitConverter]::ToUInt32($dokGbpr, $meta + 28 + $slot * 4) -ne $dokNextThresholds[$i][$slot]) {
      throw "DoK GBPR award-threshold cache mismatch at member $($i + 1), class slot $slot"
    }
  }
  for ($j = 276; $j -lt 409; $j++) {
    if ($dokGbpr[$off + 1 + $j] -ne 0) {
      throw "DoK GBPR tail padding byte was nonzero at slot $($i + 1), offset $j"
    }
  }
}

# Keep the retail corpus and the shared game mirror untouched. Build a private
# disposable stage, damage one source record, and cold-import it through /G.
$dokHpFiles = @(1..6 | ForEach-Object { "SAVE\CHRDATA$_.GAM" })
$dokHpMount = New-RetailStage -Source $dokGame -Name ('ccparty-dok-hp-' + [guid]::NewGuid().ToString('N')) -Files $dokHpFiles
$dokHpSource = Join-Path $dokHpMount 'SAVE\CHRDATA1.GAM'
$dokHpOriginal = [IO.File]::ReadAllBytes($dokHpSource)
$dokHpFixture = [byte[]]$dokHpOriginal.Clone()
$dokHpFixture[40] = 93
$dokHpFixture[214] = 17
$dokHpConf = Join-Path $build '_ccparty_dok_hp_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$dokHpMount"
D:
C:\CCPARTY /G C:\DOKDIFF.GBP > C:\DOKDIFF.TXT
exit
"@ | Set-Content $dokHpConf -Encoding ASCII
try {
  [IO.File]::WriteAllBytes($dokHpSource, $dokHpFixture)
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokHpConf -Headless:$Headless
  if (-not $p.WaitForExit(15000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'CCPARTY distinct DoK HP import timed out'
  }
  $dokHpGbpr = [IO.File]::ReadAllBytes((Join-Path $build 'DOKDIFF.GBP'))
  $dokHpBody = 17
  $dokHpMeta = $dokHpBody + 216
  if ([BitConverter]::ToUInt16($dokHpGbpr, 6) -ne 6 -or
      [BitConverter]::ToUInt16($dokHpGbpr, 8) -ne 410 -or
      $dokHpGbpr[$dokHpBody + 40] -ne 93 -or
      $dokHpGbpr[$dokHpBody + 214] -ne 17 -or
      (Get-I16LE $dokHpGbpr ($dokHpMeta + 6)) -ne 17 -or
      (Get-I16LE $dokHpGbpr ($dokHpMeta + 26)) -ne 93) {
    throw 'CCPARTY /G did not preserve DoK source bytes and map current/max HP to GBD1'
  }
} finally {
  [IO.File]::WriteAllBytes($dokHpSource, $dokHpOriginal)
}

$dokTrace = Get-Content (Join-Path $build 'DOKPART.TRC')
if (-not ($dokTrace -match ' p5 ')) { throw 'CCCOMBAT did not import the sixth DoK GBPR member' }
if (-not ($dokTrace -contains '1 move p5 - - - - - - - 4 6')) {
  throw 'CCCOMBAT did not consume DoK GBD1 movement metadata'
}
$dokRaw = [IO.File]::ReadAllBytes((Join-Path $build 'DOKPART.RAW'))
if ([BitConverter]::ToUInt16($dokRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($dokRaw, 2) -ne 200) {
  throw 'CCCOMBAT DoK GBPR snapshot is not 320x200'
}

$dokCond = [byte[]]$dokGbpr.Clone()
$condMeta = 16 + 1 + 216
[BitConverter]::GetBytes([uint16]3).CopyTo($dokCond, $condMeta + 4)   # derived stats + condition
[BitConverter]::GetBytes([uint16]8).CopyTo($dokCond, $condMeta + 24)  # CF_FLED
[IO.File]::WriteAllBytes((Join-Path $build 'DOKCOND.GBP'), $dokCond)
$dokCondConf = Join-Path $build '_ccparty_dok_condition_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
CCCOMBAT /E PARTYFX.BIN 4660 DOKCOND.TRC DOKCOND.OUT /P DOKCOND.GBP
exit
"@ | Set-Content $dokCondConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokCondConf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCPARTY DoK condition-tail smoke timed out'
}
$dokCondTrace = Get-Content (Join-Path $build 'DOKCOND.TRC')
if ($dokCondTrace | Where-Object { $_ -match '^(?!1 init p0 )' -and ($_ -match ' p0 ' -or $_ -match '^\\d+ \\S+ p0 ') }) {
  throw 'CCCOMBAT ignored DoK GBD1 condition metadata for a fled party member'
}
if (-not ($dokCondTrace -match ' p1 ')) {
  throw 'CCCOMBAT DoK GBD1 condition smoke removed the wrong party members'
}

# Valid compact metadata with zero HP must not take the legacy 24-HP fallback.
# The companion fixture removes the metadata signature and must still use that fallback.
$zeroHpRoster = [byte[]]$dokGbpr.Clone()
$legacyRoster = [byte[]]$dokGbpr.Clone()
for ($i = 0; $i -lt 6; $i++) {
  $meta = 17 + ($i * 410) + 216
  [BitConverter]::GetBytes([uint16]0).CopyTo($zeroHpRoster, $meta + 6)
  [Array]::Clear($legacyRoster, $meta, 4)
}
[IO.File]::WriteAllBytes((Join-Path $build 'DOKZERO.GBP'), $zeroHpRoster)
[IO.File]::WriteAllBytes((Join-Path $build 'DOKOLD.GBP'), $legacyRoster)
foreach ($name in @('DOKZERO.GBR', 'DOKOLD.GBR', 'DOKZERO.TRC', 'DOKOLD.TRC')) {
  Remove-Item -LiteralPath (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
}
$zeroConf = Join-Path $build '_ccparty_zero_hp_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
CCCOMBAT /E PARTYFX.BIN 4660 DOKZERO.TRC DOKZERO.OUT /P DOKZERO.GBP /R DOKZERO.GBR
CCCOMBAT /E PARTYFX.BIN 4660 DOKOLD.TRC DOKOLD.OUT /P DOKOLD.GBP /R DOKOLD.GBR
exit
"@ | Set-Content $zeroConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $zeroConf -Headless:$Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCPARTY zero-HP/legacy fallback smoke timed out'
}
foreach ($name in @('DOKZERO', 'DOKOLD')) {
  $result = [IO.File]::ReadAllBytes((Join-Path $build "$name.GBR"))
  if ($result.Length -ne 52 -or [Text.Encoding]::ASCII.GetString($result, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($result, 4) -ne 1 -or [BitConverter]::ToUInt16($result, 10) -ne 6) {
    throw "$name invalid six-member combat result"
  }
  for ($i = 0; $i -lt 6; $i++) {
    $row = 16 + ($i * 6)
    $hp = Get-I16LE $result ($row + 2)
    $maxHp = Get-I16LE $result ($row + 4)
    $expectedMax = if ($name -eq 'DOKZERO') { $dokHp[$i] } else { 24 }
    if ($maxHp -ne $expectedMax) {
      throw "$name slot $i maximum HP expected $expectedMax, got $maxHp"
    }
    # GBCR serializes unconscious as condition 1 (distinct from the CF_UNCON bit 2).
    if ($name -eq 'DOKZERO' -and ($hp -ne 0 -or $result[$row + 1] -ne 1)) {
      throw "$name slot $i must stay at zero HP and unconscious; HP=$hp condition=$($result[$row + 1])"
    }
  }
}
$zeroTrace = Get-Content -LiteralPath (Join-Path $build 'DOKZERO.TRC')
if ($zeroTrace | Where-Object { $_ -match '^\d+ (?!init )\S+ p\d+ ' }) {
  throw 'Zero-HP compact party member took a combat action'
}

$dqkQsvPath = Join-Path $root 'The Dark Queen of Krynn\SAVGAMA.QSV'
$dqkQsvRecords = Get-DqkQsvRecords $dqkQsvPath 6
if ($dqkQsvRecords.Count -ge 6) {
  $expectedDqkClasses = @(1, 2, 1, 4, 1, 2)
  $dqkQchDir = Join-Path $build '_party_dqk_qch'
  if (Test-Path $dqkQchDir) { Remove-Item -Recurse -Force $dqkQchDir }
  New-Item -ItemType Directory -Force (Join-Path $dqkQchDir 'SAVE') | Out-Null
  for ($i = 0; $i -lt 6; $i++) {
    $qch = New-Object byte[] 414
    [Array]::Copy($dqkQsvRecords[$i], 0, $qch, 8, 406)
    [IO.File]::WriteAllBytes((Join-Path $dqkQchDir "SAVE\CHRDATA$($i + 1).QCH"), $qch)
  }

  $dqkQchConf = Join-Path $build '_ccparty_dqk_qch_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$dqkQchDir"
D:
C:\CCPARTY /Q C:\DQQCH.GBP > C:\DQQCH.TXT
C:
CCCOMBAT /E PARTYFX.BIN 4660 DQQCH.TRC DQQCH.OUT DQQCH.RAW /P DQQCH.GBP
exit
"@ | Set-Content $dqkQchConf -Encoding ASCII

  Remove-Item (Join-Path $build 'DQQCH.GBP'),
    (Join-Path $build 'DQQCH.TXT'),
    (Join-Path $build 'DQQCH.TRC'),
    (Join-Path $build 'DQQCH.OUT'),
    (Join-Path $build 'DQQCH.RAW') -Force -ErrorAction SilentlyContinue

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dqkQchConf -Headless:$Headless
  if (-not $p.WaitForExit(15000)) {
    Stop-Process -Id $p.Id -Force
    throw 'CCPARTY DQK QCH fallback smoke timed out'
  }

  $dqkQchGbpr = [IO.File]::ReadAllBytes((Join-Path $build 'DQQCH.GBP'))
  if ([Text.Encoding]::ASCII.GetString($dqkQchGbpr, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 4) -ne 2 -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 6) -ne 6 -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 8) -ne 410 -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 10) -ne 1 -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 12) -ne 3 -or
      [BitConverter]::ToUInt16($dqkQchGbpr, 14) -ne 1 -or
      $dqkQchGbpr.Length -ne 2476) {
    throw 'Invalid DQK QCH fallback GBPR header or length'
  }
  for ($i = 0; $i -lt 6; $i++) {
    $off = 16 + ($i * 410)
    $record = $off + 1
    $source = $dqkQsvRecords[$i]
    if ($dqkQchGbpr[$off] -ne ($i + 1)) {
      throw "DQK QCH fallback GBPR slot mismatch at entry $i"
    }
    $expectedName = [Text.Encoding]::ASCII.GetString($source, 96, 15).TrimEnd([char]0).ToUpperInvariant()
    $actualName = [Text.Encoding]::ASCII.GetString($dqkQchGbpr, $record + 1, $dqkQchGbpr[$record])
    $meta = $record + 216
    if ($actualName -ne $expectedName -or
        [Text.Encoding]::ASCII.GetString($dqkQchGbpr, $meta, 4) -ne 'GBD1' -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 4) -ne 1 -or
        (Get-I16LE $dqkQchGbpr ($meta + 6)) -ne $source[400] -or
        (Get-I16LE $dqkQchGbpr ($meta + 8)) -ne (60 - $source[179]) -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 10) -ne $source[173] -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 12) -ne $source[175] -or
        (Get-I16LE $dqkQchGbpr ($meta + 14)) -ne ([sbyte]$source[177]) -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 16) -ne $source[137] -or
        $dqkQchGbpr[$meta + 18] -ne $expectedDqkClasses[$i] -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 20) -ne (60 - $source[127]) -or
        [BitConverter]::ToUInt16($dqkQchGbpr, $meta + 26) -ne $source[129]) {
      throw "DQK QCH fallback GBD1 metadata mismatch at slot $($i + 1)"
    }
    if ($dqkQchGbpr[$meta + 18] -eq 0) {
      throw "DQK QCH fallback preserved the unusable zero class byte at slot $($i + 1)"
    }
  }

  $dqkQchText = Get-Content (Join-Path $build 'DQQCH.TXT') -Raw
  if ($dqkQchText -notlike '*CCPARTY: loaded 6 member(s)*') {
    throw 'CCPARTY DQK QCH fallback did not report six loaded members'
  }
  $dqkQchTrace = Get-Content (Join-Path $build 'DQQCH.TRC')
  if (-not ($dqkQchTrace -match ' p5 ')) {
    throw 'CCCOMBAT did not import the sixth DQK QCH fallback GBPR member'
  }
  $dqkQchRaw = [IO.File]::ReadAllBytes((Join-Path $build 'DQQCH.RAW'))
  if ([BitConverter]::ToUInt16($dqkQchRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($dqkQchRaw, 2) -ne 200) {
    throw 'CCCOMBAT DQK QCH fallback snapshot is not 320x200'
  }

  # The retail QSV records have variable inventory/affect tails.  Import the
  # original six-member save directly, rather than only its fixed-field QCH
  # projections, so CCPARTY must walk every tail to reach the later members.
  $dqkGame = Split-Path -Parent $dqkQsvPath
  $dqkQsvMount = New-RetailStage -Source $dqkGame -Name 'ccparty-dqk-qsv'
  $dqkQsvConf = Join-Path $build '_ccparty_dqk_qsv_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$dqkQsvMount"
D:
C:\CCPARTY /Q C:\DQQSV.GBP > C:\DQQSV.TXT
exit
"@ | Set-Content $dqkQsvConf -Encoding ASCII

  Remove-Item (Join-Path $build 'DQQSV.GBP'),
    (Join-Path $build 'DQQSV.TXT') -Force -ErrorAction SilentlyContinue
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dqkQsvConf -Headless:$Headless
  if (-not $p.WaitForExit(15000)) {
    Stop-Process -Id $p.Id -Force
    throw 'CCPARTY DQK QSV variable-tail smoke timed out'
  }

  $dqkQsvGbpr = [IO.File]::ReadAllBytes((Join-Path $build 'DQQSV.GBP'))
  if ([Text.Encoding]::ASCII.GetString($dqkQsvGbpr, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 4) -ne 2 -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 6) -ne 6 -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 8) -ne 410 -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 10) -ne 1 -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 12) -ne 3 -or
      [BitConverter]::ToUInt16($dqkQsvGbpr, 14) -ne 1 -or
      $dqkQsvGbpr.Length -ne 2476) {
    throw 'Invalid DQK QSV variable-tail GBPR header or length'
  }
  for ($i = 0; $i -lt 6; $i++) {
    $off = 16 + ($i * 410)
    $record = $off + 1
    $source = $dqkQsvRecords[$i]
    $expectedName = [Text.Encoding]::ASCII.GetString($source, 96, 15).TrimEnd([char]0).ToUpperInvariant()
    $actualName = [Text.Encoding]::ASCII.GetString($dqkQsvGbpr, $record + 1, $dqkQsvGbpr[$record])
    $meta = $record + 216
    if ($dqkQsvGbpr[$off] -ne ($i + 1) -or
        $actualName -ne $expectedName -or
        [Text.Encoding]::ASCII.GetString($dqkQsvGbpr, $meta, 4) -ne 'GBD1' -or
        [BitConverter]::ToUInt16($dqkQsvGbpr, $meta + 4) -ne 1 -or
        $dqkQsvGbpr[$meta + 18] -ne $expectedDqkClasses[$i]) {
      throw "DQK QSV variable-tail import mismatch at slot $($i + 1)"
    }
  }
  $dqkQsvText = Get-Content (Join-Path $build 'DQQSV.TXT') -Raw
  if ($dqkQsvText -notlike '*CCPARTY: loaded 6 member(s)*') {
    throw 'CCPARTY DQK QSV variable-tail import did not report six loaded members'
  }
} else {
  Write-Output "SKIP: CCPARTY DQK QCH fallback smoke ($dqkQsvPath absent or did not contain six QSV records)"
}

# Headless native creation, then a second no-save launch proving persistence.
# CoK's held START.EXE table is zero-based: byte +90 is race (Human=6), byte
# +91 is class (C/F/R/K/M/T = 0/2/4/7/5/6).  Create every offered native class
# in one DOSBox pass so this cannot regress into the old provisional layout
# where class was stored at +90 and +91 was left zero.
$empty = Join-Path $build '_party_empty'
New-Item -ItemType Directory -Force $empty | Out-Null
$nativeCreateCases = @(
  @{ Tag = 'C'; Name = 'NATIVE_CLERIC'; Choice = 'C'; Class = 0; Hp = 8; LevelSlot = 0; Capacity = @(3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0); Known = @(1,3,5,6,8) },
  @{ Tag = 'F'; Name = 'NATIVE_FIGHT'; Choice = 'F'; Class = 2; Hp = 10; LevelSlot = 2; Capacity = @(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0); Known = @() },
  @{ Tag = 'R'; Name = 'NATIVE_RANGER'; Choice = 'R'; Class = 4; Hp = 10; LevelSlot = 4; Capacity = @(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0); Known = @() },
  @{ Tag = 'K'; Name = 'NATIVE_KNIGHT'; Choice = 'K'; Class = 7; Hp = 12; LevelSlot = 7; Capacity = @(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0); Known = @() },
  @{ Tag = 'M'; Name = 'NATIVE_MAGE'; Choice = 'M'; Class = 5; Hp = 4; LevelSlot = 5; Capacity = @(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0); Known = @(11,12,15,18,21) },
  @{ Tag = 'T'; Name = 'NATIVE_THIEF'; Choice = 'T'; Class = 6; Hp = 6; LevelSlot = 6; Capacity = @(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0); Known = @() }
)
foreach ($case in $nativeCreateCases) {
  Remove-Item (Join-Path $build "NATIVE_$($case.Tag).GBP") -Force -ErrorAction SilentlyContinue
}
$createConf = Join-Path $build '_ccparty_create_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
C:\CCPARTY /C NATIVE_CLERIC C C:\NATIVE_C.GBP
C:\CCPARTY /C NATIVE_FIGHT F C:\NATIVE_F.GBP
C:\CCPARTY /C NATIVE_RANGER R C:\NATIVE_R.GBP
C:\CCPARTY /C NATIVE_KNIGHT K C:\NATIVE_K.GBP
C:\CCPARTY /C NATIVE_MAGE M C:\NATIVE_M.GBP
C:\CCPARTY /C NATIVE_THIEF T C:\NATIVE_T.GBP
exit
"@ | Set-Content $createConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $createConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY create timed out' }
foreach ($case in $nativeCreateCases) {
  $created = [IO.File]::ReadAllBytes((Join-Path $build "NATIVE_$($case.Tag).GBP"))
  if ($created.Length -ne 426 -or [BitConverter]::ToUInt16($created, 6) -ne 1 -or $created[16] -ne 0x80) {
    throw "Invalid native-created GBPR for class $($case.Choice)"
  }
  $record = 17
  $name = [Text.Encoding]::ASCII.GetString($created, $record + 1, $created[$record])
  if ($name -ne $case.Name -or $created[$record + 90] -ne 6 -or
      $created[$record + 91] -ne $case.Class -or $created[$record + 98] -ne $case.Hp -or
      $created[$record + 407] -ne $case.Hp) {
    throw "Native-created CoK race/class fields are wrong for $($case.Choice)"
  }
  for ($slot = 0; $slot -lt 8; $slot++) {
    $expectedLevel = if ($slot -eq $case.LevelSlot) { 1 } else { 0 }
    if ($created[$record + 249 + $slot] -ne $expectedLevel) {
      throw "Native-created CoK class-level slot is wrong for $($case.Choice) at slot $slot"
    }
  }
  if ($created[$record + 393] -ne 1) {
    throw "Native-created CoK camp eligibility is wrong for $($case.Choice)"
  }
  for ($offset = 0; $offset -lt 20; $offset++) {
    if ($created[$record + 284 + $offset] -ne $case.Capacity[$offset]) {
      throw "Native-created CoK cached capacity is wrong for $($case.Choice) at offset $offset"
    }
  }
  for ($spell = 1; $spell -le 107; $spell++) {
    $expectedKnown = if ($case.Known -contains $spell) { 1 } else { 0 }
    if ($created[$record + 98 + $spell] -ne $expectedKnown) {
      throw "Native-created CoK grimoire is wrong for $($case.Choice) at spell $spell"
    }
  }
}
$nativeParty = Join-Path $build 'NATIVE_F.GBP'
$before = [IO.File]::ReadAllBytes($nativeParty)
Remove-Item (Join-Path $build 'NPERS.TXT') -Force -ErrorAction SilentlyContinue
$persistConf = Join-Path $build '_ccparty_persist_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
C:\CCPARTY C:\NATIVE_F.GBP > C:\NPERS.TXT
exit
"@ | Set-Content $persistConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $persistConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY persist timed out' }
$persistOutput = Get-Content (Join-Path $build 'NPERS.TXT') -Raw
if ($persistOutput -notlike '*CCPARTY: loaded 1 member(s)*' -or
    $persistOutput -like '*prior roster is invalid*') {
  throw 'CCPARTY rejected its own native-created roster on reload'
}
$after = [IO.File]::ReadAllBytes($nativeParty)
if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$before, [byte[]]$after)) {
  throw 'Native-created GBPR did not persist byte-for-byte'
}

# Exercise every native ordinal through the real producer and a cold reload.
# A rejected reload leaves bytes unchanged, so byte equality alone is not proof.
$sequenceParty = Join-Path $build 'NSEQ.GBP'
Remove-Item $sequenceParty -Force -ErrorAction SilentlyContinue
foreach ($name in @('NSEQLOAD.TXT') + @(1..6 | ForEach-Object { "NSEQ$_.TXT" })) {
  Remove-Item (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
}
$sequenceCommands = @(1..6 | ForEach-Object {
  "C:\CCPARTY /C MEMBER$_ F C:\NSEQ.GBP > C:\NSEQ$_.TXT"
})
$sequenceConf = Join-Path $build '_ccparty_native_sequence.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
$($sequenceCommands -join "`r`n")
C:\CCPARTY C:\NSEQ.GBP > C:\NSEQLOAD.TXT
exit
"@ | Set-Content $sequenceConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $sequenceConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY six-member native sequence timed out' }
foreach ($count in 1..6) {
  $createdOutput = Get-Content (Join-Path $build "NSEQ$count.TXT") -Raw
  if ($createdOutput -notlike "*CCPARTY: loaded $count member(s)*") {
    throw "CCPARTY native sequence did not create member $count"
  }
}
if ((Get-Content (Join-Path $build 'NSEQLOAD.TXT') -Raw) -notlike '*CCPARTY: loaded 6 member(s)*') {
  throw 'CCPARTY rejected its complete six-member native roster'
}
$sequence = [IO.File]::ReadAllBytes($sequenceParty)
if ($sequence.Length -ne 2476 -or [BitConverter]::ToUInt16($sequence, 6) -ne 6) {
  throw 'CCPARTY native sequence has the wrong roster extent/count'
}
foreach ($ordinal in 0..5) {
  $offset = 16 + 410 * $ordinal
  $name = [Text.Encoding]::ASCII.GetString($sequence, $offset + 2, $sequence[$offset + 1])
  if ($sequence[$offset] -ne (0x80 + $ordinal) -or $name -ne "MEMBER$($ordinal + 1)") {
    throw "CCPARTY native sequence changed slot/name at ordinal $ordinal"
  }
}

# A valid high-bit native slot followed by EOF used to be treated as a whole
# 409-byte record because prevbuf was zero-filled. CCPARTY then overwrote the
# only copy with a zeroed character. Both a short body and a trailing byte must
# now fail before output creation, leaving the original bytes untouched.
$nativeNameEnd = 17 + 1 + $before[17]
$nativeTruncated = $before[0..($nativeNameEnd - 1)]
$nativeTrailing = New-Object byte[] ($before.Length + 1)
[Array]::Copy($before, $nativeTrailing, $before.Length)
$nativeTrailing[$nativeTrailing.Length - 1] = 0xA5
$nativeSlot86 = [byte[]]$before.Clone()
$nativeSlot86[16] = 0x86
$nativeSlotFF = [byte[]]$before.Clone()
$nativeSlotFF[16] = 0xFF
$nativeDuplicate = [byte[]]$sequence.Clone()
$nativeDuplicate[16 + 410] = $nativeDuplicate[16]
$nativeMalformedCases = @(
  @{ Name = 'NTRUNC'; Bytes = $nativeTruncated },
  @{ Name = 'NTRAIL'; Bytes = $nativeTrailing },
  @{ Name = 'NSLOT86'; Bytes = $nativeSlot86 },
  @{ Name = 'NSLOTFF'; Bytes = $nativeSlotFF },
  @{ Name = 'NDUP'; Bytes = $nativeDuplicate }
)
$nativeMalformedCommands = foreach ($case in $nativeMalformedCases) {
  [IO.File]::WriteAllBytes((Join-Path $build "$($case.Name).GBP"), $case.Bytes)
  Remove-Item (Join-Path $build "$($case.Name).RC") -Force -ErrorAction SilentlyContinue
  "C:\CCPARTY C:\$($case.Name).GBP > NUL"
  "if errorlevel 1 echo rejected>C:\$($case.Name).RC"
}
$nativeMalformedConf = Join-Path $build '_ccparty_native_malformed_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
$($nativeMalformedCommands -join "`r`n")
exit
"@ | Set-Content $nativeMalformedConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $nativeMalformedConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY malformed native reload timed out' }
foreach ($case in $nativeMalformedCases) {
  if ((Get-Content (Join-Path $build "$($case.Name).RC") -Raw).Trim() -ne 'rejected') {
    throw "CCPARTY accepted malformed existing roster $($case.Name)"
  }
  $actual = [IO.File]::ReadAllBytes((Join-Path $build "$($case.Name).GBP"))
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$case.Bytes, [byte[]]$actual)) {
    throw "CCPARTY changed malformed existing roster $($case.Name)"
  }
}

$dokNativeParty = Join-Path $build 'DOKNATIV.GBP'
Remove-Item $dokNativeParty -Force -ErrorAction SilentlyContinue
$dokCreateConf = Join-Path $build '_ccparty_dok_create_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
C:\CCPARTY /G /C DOK_HERO K C:\DOKNATIV.GBP
exit
"@ | Set-Content $dokCreateConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokCreateConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY DoK create timed out' }
$dokCreated = [IO.File]::ReadAllBytes($dokNativeParty)
if ($dokCreated.Length -ne 426 -or [BitConverter]::ToUInt16($dokCreated, 6) -ne 1 -or
    [BitConverter]::ToUInt16($dokCreated, 10) -ne 1 -or $dokCreated[16] -ne 0x80) {
  throw 'Invalid native-created DoK GBPR'
}
$dokRecord = 17
$dokName = [Text.Encoding]::ASCII.GetString($dokCreated, $dokRecord + 1, $dokCreated[$dokRecord])
if ($dokName -ne 'DOK_HERO' -or $dokCreated[$dokRecord + 31] -ne 42 -or
    $dokCreated[$dokRecord + 32] -ne 6 -or $dokCreated[$dokRecord + 41] -ne 1 -or
    $dokCreated[$dokRecord + 40] -ne 24 -or $dokCreated[$dokRecord + 214] -ne 24) {
  throw 'Native-created DoK character fields are wrong'
}
$dokMeta = $dokRecord + 216
if ([Text.Encoding]::ASCII.GetString($dokCreated, $dokMeta, 4) -ne 'GBD1' -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 4) -ne 1 -or
    (Get-I16LE $dokCreated ($dokMeta + 6)) -ne 24 -or
    (Get-I16LE $dokCreated ($dokMeta + 8)) -ne 4 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 10) -ne 1 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 12) -ne 2 -or
    (Get-I16LE $dokCreated ($dokMeta + 14)) -ne 0 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 16) -ne 3 -or
    $dokCreated[$dokMeta + 18] -ne 1 -or $dokCreated[$dokMeta + 19] -ne 6 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 20) -ne 18 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 22) -ne 4 -or
    [BitConverter]::ToUInt16($dokCreated, $dokMeta + 26) -ne 24) {
  throw 'Native-created DoK GBD1 metadata is wrong'
}
for ($j = 244; $j -lt 409; $j++) {
  if ($dokCreated[$dokRecord + $j] -ne 0) {
    throw "Native-created DoK tail padding byte was nonzero at offset $j"
  }
}

$dokBefore = [byte[]]$dokCreated.Clone()
Remove-Item (Join-Path $build 'DOKPERS.TXT') -Force -ErrorAction SilentlyContinue
$dokPersistConf = Join-Path $build '_ccparty_dok_persist_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$empty"
D:
C:\CCPARTY /G C:\DOKNATIV.GBP > C:\DOKPERS.TXT
exit
"@ | Set-Content $dokPersistConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokPersistConf -Headless:$Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY DoK persist timed out' }
if ((Get-Content (Join-Path $build 'DOKPERS.TXT') -Raw) -notlike '*CCPARTY: loaded 1 member(s)*') {
  throw 'CCPARTY rejected its own native-created DoK roster on reload'
}
if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$dokBefore, [IO.File]::ReadAllBytes($dokNativeParty))) {
  throw 'Native-created DoK GBPR did not persist byte-for-byte'
}

# Exercise the actual DOS buffered-input calls; /C bypasses both of them.
# A short guest BIOS queue covers console input without host keyboard focus.
# Longer creation conversations use redirected stdin and a fresh scratch SAVE.
$menuRoot = Join-Path $build ('ccparty-menu-' + [Guid]::NewGuid().ToString('N'))
foreach ($title in @('COK','DOK')) {
  foreach ($case in @(
    @{ Tag='upper'; Begin="`rX`rB`r"; Input="C`rAB`nCD`rC`r`rC`rABCDEFGHIJKLMNO`rX`rF`rB`r" },
    @{ Tag='lower'; Begin="b`r"; Input="cc`rc`rABCDEFGHIJKLMNOP`rc`rABCDEFGHIJKLMNO`rff`rf`rb`r" }
  )) {
    $dir = Join-Path $menuRoot "$title-$($case.Tag)"
    $save = Join-Path $dir 'SAVE'
    New-Item -ItemType Directory -Force $save | Out-Null
    Copy-Item -LiteralPath (Join-Path $build 'ccparty.com') -Destination (Join-Path $dir 'CCPARTY.COM')
    $retail = if ($title -eq 'COK') { Join-Path $game 'SAVE\CHRDATA1.SAV' } else { Join-Path $dokGame 'SAVE\CHRDATA1.GAM' }
    $source = Join-Path $save (Split-Path $retail -Leaf)
    Copy-Item -LiteralPath $retail -Destination $source
    $sourceHash = (Get-FileHash -LiteralPath $source).Hash
    $flags = if ($title -eq 'COK') { '/ID 1' } else { '/G /ID 2' }
    $identity = if ($title -eq 'COK') { 1 } else { 2 }
    $menuInput = if ($case.Tag -eq 'upper') { $case.Input.Replace("`r", "`r`n") } else { $case.Input }
    [IO.File]::WriteAllText((Join-Path $dir 'INPUT.TXT'), $menuInput, [Text.Encoding]::ASCII)
    $keys = [Collections.Generic.List[byte]]::new()
    foreach ($ch in $case.Begin.ToCharArray()) {
      $scan = switch ([string]$ch) { "`r" { 0x1c } 'X' { 0x2d } default { 0x30 } }
      $keys.AddRange([byte[]]@(0xb9, [byte][char]$ch, $scan, 0xb4, 0x05, 0xcd, 0x16))
    }
    $keys.AddRange([byte[]]@(0xb8, 0, 0x4c, 0xcd, 0x21))
    [IO.File]::WriteAllBytes((Join-Path $dir 'KEYS.COM'), $keys.ToArray())
    $commands = @(
      "CCPARTY $flags ROSTER.GBP > SEED.TXT",
      'COPY ROSTER.GBP BEFORE.GBP > NUL',
      'KEYS.COM',
      "CCPARTY $flags /M ROSTER.GBP > BEGIN.TXT",
      'COPY ROSTER.GBP BEGUN.GBP > NUL',
      "CCPARTY $flags /M ROSTER.GBP < INPUT.TXT > CREATE.TXT",
      'COPY ROSTER.GBP CREATED.GBP > NUL',
      'COPY BEFORE.GBP EXPECT.GBP > NUL',
      "CCPARTY $flags /C ABCDEFGHIJKLMNO F EXPECT.GBP > EXPECT.TXT"
    )
    $batch = @('@echo off')
    foreach ($command in $commands) { $batch += $command; $batch += 'IF ERRORLEVEL 1 GOTO FAIL' }
    $batch += @('ECHO PASS>STATUS.TXT','GOTO DONE',':FAIL','ECHO FAIL>STATUS.TXT',':DONE','EXIT')
    [IO.File]::WriteAllLines((Join-Path $dir 'RUN.BAT'), $batch, [Text.Encoding]::ASCII)
    $conf = Join-Path $dir 'dosbox.conf'
    [IO.File]::WriteAllLines($conf, @('[sdl]','fullscreen=false','autolock=false','[autoexec]','@echo off',"mount C `"$dir`"",'C:','RUN.BAT'), [Text.Encoding]::ASCII)
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(15000)) { Stop-Process -Id $p.Id -Force; throw "CCPARTY natural menu timed out: $title/$($case.Tag)" }
    if ((Get-Content (Join-Path $dir 'STATUS.TXT') -Raw).Trim() -ne 'PASS') { throw "CCPARTY natural menu failed: $dir" }
    $before = [IO.File]::ReadAllBytes((Join-Path $dir 'BEFORE.GBP'))
    $begun = [IO.File]::ReadAllBytes((Join-Path $dir 'BEGUN.GBP'))
    $created = [IO.File]::ReadAllBytes((Join-Path $dir 'CREATED.GBP'))
    $expected = [IO.File]::ReadAllBytes((Join-Path $dir 'EXPECT.GBP'))
    if (-not [Linq.Enumerable]::SequenceEqual($before, $begun)) { throw 'Begin changed the imported party' }
    if (-not [Linq.Enumerable]::SequenceEqual($expected, $created)) { throw 'Interactive and argument creation differ' }
    if ((Get-Content (Join-Path $dir 'CREATE.TXT') -Raw) -notlike '*Invalid character name.*') { throw 'Empty/overlength name was not rejected' }
    if ($created.Length -ne 836 -or [BitConverter]::ToUInt16($created,6) -ne 2 -or
        [BitConverter]::ToUInt16($created,12) -ne $identity -or $created[426] -ne 0x80 -or
        $created[427] -ne 15 -or [Text.Encoding]::ASCII.GetString($created,428,15) -ne 'ABCDEFGHIJKLMNO') {
      throw 'Interactive creation lost its full name, native slot, count or title'
    }
    if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$before[16..425], [byte[]]$created[16..425])) { throw 'Create changed an imported row' }
    if ($title -eq 'COK') {
      if ($created[427+90] -ne 6 -or $created[427+91] -ne 2) { throw 'Interactive CoK Fighter has wrong race/class' }
    } elseif ([Text.Encoding]::ASCII.GetString($created,427+216,4) -ne 'GBD1' -or $created[427+234] -ne 1) {
      throw 'Interactive DoK Fighter has wrong compact class'
    }
    # Start a new DOSBox process, with no queued input, to check cold reload.
    [IO.File]::WriteAllLines((Join-Path $dir 'RUN.BAT'), @('@echo off',"CCPARTY $flags ROSTER.GBP > COLD.TXT",'IF ERRORLEVEL 1 GOTO FAIL','ECHO PASS>COLD.RC','GOTO DONE',':FAIL','ECHO FAIL>COLD.RC',':DONE','EXIT'), [Text.Encoding]::ASCII)
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCPARTY natural-menu cold reload timed out' }
    if ((Get-Content (Join-Path $dir 'COLD.RC') -Raw).Trim() -ne 'PASS' -or
        -not [Linq.Enumerable]::SequenceEqual($created, [IO.File]::ReadAllBytes((Join-Path $dir 'ROSTER.GBP')))) {
      throw 'Interactive roster failed exact cold reload'
    }
    if ((Get-FileHash -LiteralPath $source).Hash -ne $sourceHash -or (Get-FileHash -LiteralPath $retail).Hash -ne $sourceHash) { throw 'Natural menu changed source character bytes' }
  }
}
Write-Output 'PASS: CCPARTY natural Begin/Create, blank and invalid choices, 15-character names, and cold reload (CoK/DoK)'

# Synthetic high-bit rows below borrow imported bodies only to exercise GBPR
# preservation. They are not evidence of retail DQK character creation.
# Each case runs in a fresh GUID directory; original retail files are read-only.
if (Test-Path -LiteralPath $dqkQsvPath -PathType Leaf) {
  & {
    $BinaryPath = Join-Path $build 'ccparty.com'
    $OutputRoot = Join-Path $build 'ccparty-preservation'
    $GoldBoxRoot = $root
    $ErrorActionPreference='Stop'
    $BinaryPath=(Resolve-Path -LiteralPath $BinaryPath).Path
    $OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
    $Dqk=Join-Path $GoldBoxRoot 'The Dark Queen of Krynn'
    $Cok=Join-Path $GoldBoxRoot 'Champions of Krynn'
    $DosBox=Join-Path $Dqk 'DOSBOX\DOSBox.exe'
    $QsvPath=Join-Path $Dqk 'SAVGAMA.QSV'
    $RunRoot=Join-Path $OutputRoot ('{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'),[Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $RunRoot|Out-Null
    if(!(Test-Path $DosBox)-or !(Test-Path $QsvPath)-or !(Test-Path (Join-Path $Cok 'SAVE\CHRDATA1.SAV'))){
      throw 'Required bundled DOSBox or retail source missing'
    }

    $preservationChecks=New-Object System.Collections.Generic.List[object]
    $preservationSessions=New-Object System.Collections.Generic.List[object]
    if(-not ([System.Management.Automation.PSTypeName]'PartyPreservationWin').Type){
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PartyPreservationWin {
 public delegate bool EnumProc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public static int VisibleFor(uint target){int n=0;EnumWindows(delegate(IntPtr h,IntPtr l){uint p;GetWindowThreadProcessId(h,out p);if(p==target&&IsWindowVisible(h))n++;return true;},IntPtr.Zero);return n;}
}
"@
    }

    function Check($case,$name,[bool]$ok,$detail){
      $preservationChecks.Add([ordered]@{case=$case;name=$name;ok=$ok;detail=$detail})
    }

    function EqualBytes([byte[]]$e,[byte[]]$a,$case,$name){
      if($null -eq $a){
        Check $case $name $false 'actual absent'
        return
      }

      if($e.Length -ne $a.Length){
        Check $case $name $false "length $($a.Length), expected $($e.Length)"
        return
      }

      for($i=0;$i -lt $e.Length;$i++){
        if($e[$i] -ne $a[$i]){
          Check $case $name $false ("byte {0} expected {1:X2}, got {2:X2}" -f $i,$e[$i],$a[$i])
          return
        }

      }

      Check $case $name $true "exact $($e.Length)-byte match"
    }

    function Rows([byte[]]$b){
      if($b.Length-lt16-or[Text.Encoding]::ASCII.GetString($b,0,4)-ne'GBPR'){
        throw 'bad GBPR magic'
      }

      $n=[BitConverter]::ToUInt16($b,6)
      if([BitConverter]::ToUInt16($b,8)-ne410-or$b.Length-ne16+$n*410){
        throw 'bad GBPR extent'
      }

      $r=New-Object System.Collections.Generic.List[byte[]]
      for($i=0;$i-lt$n;$i++){
        $x=New-Object byte[] 410
        [Array]::Copy($b,16+410*$i,$x,0,410)
        $r.Add($x)
      }
      return ,$r.ToArray()
    }

    function Roster([byte[][]]$rows,[int]$title=3,[int]$flags=1,[int]$version=2){
      $b=New-Object byte[](16+$rows.Count*410)
      [Array]::Copy([Text.Encoding]::ASCII.GetBytes('GBPR'),0,$b,0,4)
      [BitConverter]::GetBytes([uint16]$version).CopyTo($b,4)
      [BitConverter]::GetBytes([uint16]$rows.Count).CopyTo($b,6)
      [BitConverter]::GetBytes([uint16]410).CopyTo($b,8)
      [BitConverter]::GetBytes([uint16]$flags).CopyTo($b,10)
      [BitConverter]::GetBytes([uint16]$(if($version-eq1){0}else{$title})).CopyTo($b,12)
      [BitConverter]::GetBytes([uint16]$(if($version-eq1){0}else{1})).CopyTo($b,14)
      for($i=0;$i-lt$rows.Count;$i++){
        [Array]::Copy($rows[$i],0,$b,16+$i*410,410)
      }
      return ,$b
    }

    function WithId([byte[]]$row,[byte]$id){
      $x=[byte[]]$row.Clone()
      $x[0]=$id
      return ,$x
    }

    function PackRows([byte[]]$a,[byte[]]$b=$null,[byte[]]$c=$null,[byte[]]$d=$null,[byte[]]$e=$null,[byte[]]$f=$null){
      $l=New-Object System.Collections.Generic.List[byte[]]
      foreach($x in @($a,$b,$c,$d,$e,$f)){
        if($null-ne$x){
          $l.Add($x)
        }

      }

      return ,$l.ToArray()
    }

    function ValidQsvName([byte[]]$b,[int]$o){
      $n=0
      for($j=0;$j-lt15;$j++){
        $c=$b[$o+96+$j]
        if($c-eq0){
          break
        }
        if($c-eq32){
          continue
        }

        if(($c-ge65-and$c-le90)-or($c-ge97-and$c-le122)){
          $n++
          continue
        }

        return $false
      }

      return ($n-ge3)
    }

    function QsvRecords([byte[]]$b){
      $r=New-Object System.Collections.Generic.List[byte[]]
      for($o=0;$o-le$b.Length-406-and$r.Count-lt6;$o++){
        if($b[$o]-le20-and$b[$o+1]-eq0-and$b[$o+2]-eq0-and$b[$o+3]-eq0-and$b[$o+94]-le9-and$b[$o+127]-ge30-and$b[$o+127]-le59-and$b[$o+129]-ge1-and$b[$o+129]-le250-and$b[$o+173]-ge1-and$b[$o+173]-le10-and$b[$o+175]-ge1-and$b[$o+175]-le20-and(ValidQsvName $b $o)){
          $x=New-Object byte[] 406
          [Array]::Copy($b,$o,$x,0,406)
          $r.Add($x)
          $o+=405
        }

      }

      return ,$r.ToArray()
    }

    function InvokeCase($name,$command,[switch]$qsv,[byte[]]$qsvBytes,[byte[][]]$qch,[string[]]$cokSlots,[byte[]]$prior,[ValidateSet('ZERO','NONZERO')][string]$ExpectedStatus='ZERO',[string]$InputText,[hashtable]$extra,[switch]$saveDir,[string]$Binary){

      $dir=Join-Path $RunRoot ('{0}-{1}'-f$name,[Guid]::NewGuid().ToString('N'))
      $c=Join-Path $dir 'C'
      New-Item -ItemType Directory -Force $c|Out-Null
      Copy-Item -LiteralPath $(if($Binary){$Binary}else{$BinaryPath}) -Destination (Join-Path $c 'CCPARTY.COM')
      if($saveDir){
        New-Item -ItemType Directory -Force (Join-Path $c 'SAVE')|Out-Null
      }
      if($null-ne$extra){
        foreach($k in @($extra.Keys)){
          [IO.File]::WriteAllBytes((Join-Path $c $k),[byte[]]$extra[$k])
        }
      }
      if($qsv){
        $in=if($null-ne$qsvBytes){
          $qsvBytes
        }
        else{
          [IO.File]::ReadAllBytes($QsvPath)
        }
        [IO.File]::WriteAllBytes((Join-Path $c 'SAVGAMA.QSV'),$in)
      }

      if($null-ne$qch){
        $s=Join-Path $c 'SAVE'
        New-Item -ItemType Directory -Force $s|Out-Null
        for($i=0;$i-lt$qch.Count;$i++){
          # Permit deliberate short records for rejection controls.
          $x=New-Object byte[] (8+$qch[$i].Length)
          [Array]::Copy($qch[$i],0,$x,8,$qch[$i].Length)
          [IO.File]::WriteAllBytes((Join-Path $s ('CHRDATA{0}.QCH'-f($i+1))),$x)
        }

      }

      if($null-ne$cokSlots){
        $s=Join-Path $c 'SAVE'
        New-Item -ItemType Directory -Force $s|Out-Null
        foreach($slot in $cokSlots){
          Copy-Item -LiteralPath (Join-Path $Cok "SAVE\CHRDATA$slot.SAV") -Destination $s
        }

      }

      if($null-ne$prior){
        [IO.File]::WriteAllBytes((Join-Path $c 'ROSTER.GBP'),$prior)
      }

      if($InputText){
        [IO.File]::WriteAllText((Join-Path $c 'INPUT.TXT'),$InputText,[Text.Encoding]::ASCII)
      }

      $bat=@('@echo off',$command,'IF ERRORLEVEL 1 GOTO ERR','ECHO ZERO>STATUS.TXT','GOTO DONE',':ERR','ECHO NONZERO>STATUS.TXT',':DONE','EXIT')-join[Environment]::NewLine
      [IO.File]::WriteAllText((Join-Path $c 'RUN.BAT'),$bat,[Text.Encoding]::ASCII)
      $conf=@('[sdl]','fullscreen=false','autolock=false','[cpu]','cycles=fixed 25000','[autoexec]','@echo off',('mount C "{0}"'-f$c),'C:','RUN.BAT')-join[Environment]::NewLine
      $confPath=Join-Path $dir 'dosbox.conf'
      [IO.File]::WriteAllText($confPath,$conf,[Text.Encoding]::ASCII)
      $pre=if(Test-Path (Join-Path $c 'ROSTER.GBP')){
        [IO.File]::ReadAllBytes((Join-Path $c 'ROSTER.GBP'))
      }
      else{
        $null
      }

      $sourceHashes=@{}
      foreach($sourceFile in @(Get-ChildItem -LiteralPath $c -Recurse -File | Where-Object { $_.Extension -in '.QCH','.QSV' })){
        $sourceHashes[$sourceFile.FullName]=(Get-FileHash -LiteralPath $sourceFile.FullName).Hash
      }
      $oldv=$env:SDL_VIDEODRIVER
      $olda=$env:SDL_AUDIODRIVER
      try{
        $env:SDL_VIDEODRIVER='dummy'
        $env:SDL_AUDIODRIVER='dummy'
        $p=Start-Process -FilePath $DosBox -ArgumentList @('-noconsole','-conf',('"{0}"'-f$confPath)) -WorkingDirectory $dir -WindowStyle Hidden -PassThru
      }
      finally{
        $env:SDL_VIDEODRIVER=$oldv
        $env:SDL_AUDIODRIVER=$olda
      }

      $visible=0
      $end=[DateTime]::UtcNow.AddSeconds(20)
      while(!$p.HasExited-and[DateTime]::UtcNow-lt$end){
        $v=[PartyPreservationWin]::VisibleFor([uint32]$p.Id)
        if($v-gt$visible){
          $visible=$v
        }

        Start-Sleep -Milliseconds 75
        $p.Refresh()
      }
      $timeout=!$p.HasExited
      if($timeout){
        Stop-Process -Id $p.Id -Force
        try{
          $p.WaitForExit(2000)|Out-Null
        }
        catch{

        }

      }

      $status=if(Test-Path (Join-Path $c 'STATUS.TXT')){
        ([IO.File]::ReadAllText((Join-Path $c 'STATUS.TXT'))).Trim()
      }
      else{
        'MISSING'
      }

      $text=if(Test-Path (Join-Path $c 'RUN.TXT')){
        Get-Content (Join-Path $c 'RUN.TXT')-Raw
      }
      else{
        ''
      }

      $out=Join-Path $c 'ROSTER.GBP'
      $res=if(Test-Path $out){
        [IO.File]::ReadAllBytes($out)
      }
      else{
        $null
      }

      $obj=[pscustomobject]@{
        name=$name
        path=$dir
        pid=$p.Id
        timeout=$timeout
        exitCode=if($p.HasExited){
          $p.ExitCode
        }
        else{
          $null
        }

        status=$status
        text=$text
        prior=$pre
        result=$res
        visibleWindows=$visible
      }

      $light=[ordered]@{
        name=$name
        path=$dir
        command=$command
        pid=$p.Id
        timeout=$timeout
        exitCode=$obj.exitCode
        status=$status
        text=$text.Trim()
        expectedStatus=$ExpectedStatus
        visibleWindows=$visible
        priorSha256=if($null-ne$pre){
          (Get-FileHash -InputStream ([IO.MemoryStream]::new($pre)) -Algorithm SHA256).Hash
        }
        else{
          $null
        }

        resultSha256=if($null-ne$res){
          (Get-FileHash -InputStream ([IO.MemoryStream]::new($res)) -Algorithm SHA256).Hash
        }
        else{
          $null
        }

      }

      $light|ConvertTo-Json -Depth 4|Set-Content (Join-Path $dir 'result.json') -Encoding utf8
      $preservationSessions.Add($light)
      Check $name 'DOSBox bounded exit' (!$timeout) "PID=$($p.Id), exit=$($obj.exitCode)"
      Check $name 'no visible DOSBox windows' ($visible-eq0) "max visible windows during run=$visible"
      Check $name "DOS ERRORLEVEL is $ExpectedStatus" ($status-eq$ExpectedStatus) "marker=$status $($text.Trim())"
      foreach($sourcePath in $sourceHashes.Keys){
        Check $name ('source unchanged: '+[IO.Path]::GetFileName($sourcePath)) ((Get-FileHash -LiteralPath $sourcePath).Hash-eq$sourceHashes[$sourcePath]) $sourcePath
      }
      return $obj

    }

    function ExpectRows($c,[byte[][]]$src,[byte[][]]$nat,$name){

      if($null-eq$c.result){
        Check $name 'output exists' $false 'absent'
        return
      }
      try{
        $rows=Rows ([byte[]]$c.result)
      }
      catch{
        Check $name 'GBPR valid' $false $_.Exception.Message
        return
      }

      $ok=([BitConverter]::ToUInt16([byte[]]$c.result,4)-eq2-and[BitConverter]::ToUInt16([byte[]]$c.result,6)-eq$src.Count+$nat.Count-and[BitConverter]::ToUInt16([byte[]]$c.result,10)-eq1-and[BitConverter]::ToUInt16([byte[]]$c.result,12)-eq3-and[BitConverter]::ToUInt16([byte[]]$c.result,14)-eq1)
      Check $name 'DQK v2 flags/title/schema/count header' $ok "rows=$($rows.Count), expected=$($src.Count+$nat.Count)"
      $i=0
      foreach($s in $src){
        if($i-lt$rows.Count){
          EqualBytes $s $rows[$i] $name "source row $i"
        }
        else{
          Check $name "source row $i" $false 'missing'
        }

        $i++
      }

      foreach($n in $nat){
        $f=$null
        foreach($r in $rows){
          if($r[0]-eq$n[0]){
            $f=$r
            break
          }

        }

        if($null-eq$f){
          Check $name ('native ID {0:X2} exists'-f$n[0]) $false 'missing'
        }
        else{
          EqualBytes $n $f $name ('native ID {0:X2} exact'-f$n[0])
        }

      }

      $ids=@()
      foreach($r in $rows){
        $ids+= [int]$r[0]
      }

      Check $name 'unique slot IDs' (@($ids|Group-Object|Where-Object{$_.Count-gt1}).Count-eq0) ("ids="+($ids-join','))

    }

    $qsv=[IO.File]::ReadAllBytes($QsvPath)
    $qrecs=QsvRecords $qsv
    if($qrecs.Count-ne6-or$qsv[31]-ne6-or$qsv[0x40d]-ne6){
      throw 'Expected six-row retail QSV'
    }

    $qsv5=[byte[]]$qsv.Clone()
    $qsv5[31]=5
    $qsv5[0x40d]=5
    $seed=InvokeCase 'qsv-seed-six' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv
    $seedRows=Rows ([byte[]]$seed.result)
    if($seedRows.Count-ne6){
      throw 'QSV seed was not six rows'
    }

    Check 'qsv-seed-six' 'six retail source rows' ($seedRows.Count-eq6) 'retail SAVGAMA.QSV'
    $qBegin=InvokeCase 'dqk-menu-begin' 'CCPARTY /Q /M ROSTER.GBP < INPUT.TXT > RUN.TXT' -qsv -prior ([byte[]]$seed.result) -InputText "b`r"
    EqualBytes ([byte[]]$seed.result) ([byte[]]$qBegin.result) $qBegin.name 'DQK Begin preserves imported party'
    $qMenuSeed=InvokeCase 'dqk-menu-seed-five' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5
    # Seventh member: a full six-row party refuses `C` before any prompt, writes no QCH.
    $qCreate=InvokeCase 'dqk-menu-create-full' 'CCPARTY /Q /M ROSTER.GBP < INPUT.TXT > RUN.TXT' -qsv -saveDir -prior ([byte[]]$seed.result) -InputText "c`rb`r"
    EqualBytes ([byte[]]$seed.result) ([byte[]]$qCreate.result) $qCreate.name 'DQK Create on a full party leaves the roster unchanged'
    Check $qCreate.name 'full party response, no prompt' ($qCreate.text-like'*Party is full (6).*' -and $qCreate.text-notlike'*Name (3-8 letters)*') 'seventh member refused'
    Check $qCreate.name 'full party writes no QCH' (@(Get-ChildItem -LiteralPath (Join-Path $qCreate.path 'C\SAVE') -Filter *.QCH -ErrorAction SilentlyContinue).Count-eq0) 'no SAVE\*.QCH'
    $qArg=InvokeCase 'dqk-argument-create-rejected' 'CCPARTY /Q /C NEWNAME F ROSTER.GBP > RUN.TXT' -qsv -prior ([byte[]]$seed.result) -ExpectedStatus NONZERO
    EqualBytes ([byte[]]$seed.result) ([byte[]]$qArg.result) $qArg.name 'unsupported argument creation leaves output unchanged'
    Check $qArg.name 'full party writes no QCH' (-not (Test-Path -LiteralPath (Join-Path $qArg.path 'C\SAVE\NEWNAME.QCH'))) 'party-full rejection precedes every output'
    $qArgEmpty=InvokeCase 'dqk-argument-create-no-output' 'CCPARTY /Q /C NEWNAME X ROSTER.GBP > RUN.TXT' -saveDir -ExpectedStatus NONZERO
    Check $qArgEmpty.name 'unsupported creation creates no output' ($null-eq$qArgEmpty.result -and -not (Test-Path -LiteralPath (Join-Path $qArgEmpty.path 'C\SAVE\NEWNAME.QCH'))) 'Unknown class letter X: no roster, no QCH'
    # ---- DQK character creation (Task 7): native result == Python rules model ----
    # The native dice are NOT the retail random generator; the dice file feeds
    # both the native engine and the model, so equality proves the RULES.
    $py=(Get-Command python -ErrorAction SilentlyContinue).Source
    $modelTool=Join-Path $GoldBoxRoot 'tools\dqk_character_rules.py'
    if(-not $py -or -not (Test-Path -LiteralPath $modelTool)){
      Write-Output 'SKIP: DQK creation model comparison (python or tools/dqk_character_rules.py absent)'
    }
    else{
      $dice=[byte[]](5,9,3,7,2,8,6,4,1,0,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101)
      $diceHex=($dice|ForEach-Object{$_.ToString('x2')})-join''
      function Model([string]$name,[string]$cls,[int]$race,[int]$con,[string]$hex){
        $o=Join-Path $RunRoot ('model-{0}-{1}-{2}.qch'-f$name,$cls,$race)
        $j=& $py -I $modelTool --create $name --class $cls --race $race --con $con --dice $hex --out $o
        if($LASTEXITCODE-ne0){
          throw "model failed for $name/$cls/$race"
        }
        return [pscustomobject]@{bytes=[IO.File]::ReadAllBytes($o);summary=(($j-join'')|ConvertFrom-Json)}
      }

      function ExpectCreated($case,$cls,$race,$con,$name){
        $m=Model $name $cls $race $con $diceHex
        $f=Join-Path $case.path ('C\SAVE\{0}.QCH'-f$name)
        $qch=if(Test-Path -LiteralPath $f){
          [IO.File]::ReadAllBytes($f)
        }
        else{
          $null
        }
        EqualBytes $m.bytes $qch $case.name 'native QCH == Python rules model (all 414 bytes)'
        if($null-ne$qch-and$qch.Length-eq414){
          Check $case.name 'XP +0x44' ([BitConverter]::ToUInt32($qch,0x44)-eq1000001) ([BitConverter]::ToUInt32($qch,0x44))
          Check $case.name 'class levels +0xA5..0xAB' ((($qch[0xA5..0xAB])-join',')-eq(($m.summary.levels)-join',')) (($qch[0xA5..0xAB])-join',')
          Check $case.name 'max HP +0x89 / rolled +0xC0 / current +0x198' ($qch[0x89]-eq$m.summary.max_hp-and$qch[0xC0]-eq$m.summary.rolled_hp-and$qch[0x198]-eq$m.summary.current_hp) ('{0}/{1}/{2}'-f$qch[0x89],$qch[0xC0],$qch[0x198])
        }
        $rows=if($null-ne$case.result){
          Rows ([byte[]]$case.result)
        }
        else{
          @()
        }
        return [pscustomobject]@{model=$m;qch=$qch;rows=$rows}
      }

      $cr=InvokeCase 'dqk-create-fighter' 'CCPARTY /Q /C LUNA F /R 6 /N 15 /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice}
      $crx=ExpectCreated $cr 'fighter' 6 15 'LUNA'
      Check $cr.name 'one native row, slot 80h, title id 3, version 2' ($crx.rows.Count-eq1-and$crx.rows[0][0]-eq0x80-and[BitConverter]::ToUInt16([byte[]]$cr.result,12)-eq3-and[BitConverter]::ToUInt16([byte[]]$cr.result,4)-eq2) 'GBPR header/row'
      if($crx.rows.Count-eq1){
        $b=$crx.rows[0]
        Check $cr.name 'row HP/maxHP project the created record' ([BitConverter]::ToUInt16($b,1+222)-eq$crx.model.summary.current_hp-and[BitConverter]::ToUInt16($b,1+242)-eq$crx.model.summary.max_hp) ('hp={0} max={1}'-f[BitConverter]::ToUInt16($b,1+222),[BitConverter]::ToUInt16($b,1+242))
        Check $cr.name 'row carries name LUNA and GBD1 meta' ($b[1]-eq4-and[Text.Encoding]::ASCII.GetString($b,2,4)-eq'LUNA'-and[Text.Encoding]::ASCII.GetString($b,1+216,4)-eq'GBD1') 'name/meta'
        # Cold reload through the EXISTING QCH importer: stage the created file as
        # CHRDATA1.QCH (InvokeCase prefixes 8 bytes, so hand it the view bytes).
        $view=New-Object byte[] 406
        [Array]::Copy($crx.qch,8,$view,0,406)
        $cold=InvokeCase 'dqk-create-cold-reload-importer' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qch @(,$view)
        $coldRows=Rows ([byte[]]$cold.result)
        $bodyEqual=$coldRows.Count-eq1
        if($bodyEqual){
          for($i=1;$i-lt410;$i++){
            if($coldRows[0][$i]-ne$b[$i]){
              $bodyEqual=$false
              break
            }
          }
        }
        Check $cold.name 'importer row body byte-identical to the created native row' $bodyEqual 'bytes 1..409; only the slot id differs'
        $again=InvokeCase 'dqk-create-cold-reload-roster' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -prior ([byte[]]$cr.result)
        EqualBytes ([byte[]]$cr.result) ([byte[]]$again.result) $again.name 'native row survives a cold reload byte-for-byte'
        # A second creation takes the next free native id and leaves the first row alone.
        $second=InvokeCase 'dqk-create-second-member' 'CCPARTY /Q /C ALDA M /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -prior ([byte[]]$cr.result)
        $secondRows=Rows ([byte[]]$second.result)
        Check $second.name 'second member gets slot 81h, first row unchanged' ($secondRows.Count-eq2-and$secondRows[1][0]-eq0x81-and([Linq.Enumerable]::SequenceEqual([byte[]]$secondRows[0],[byte[]]$b))) 'append-only native ids'
      }

      # Headless DQK creation (what GBBOOT /R emits): `/G /ID 3 /C` with NO /Q must
      # use the title-owned DQK rules, i.e. be byte-identical to the /Q /C case and
      # to the Python model (expected QCH derived from tools/dqk_character_rules.py).
      $hl=InvokeCase 'dqk-headless-create-fighter' 'CCPARTY /G /ID 3 /C LUNA F /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice}
      $hlx=ExpectCreated $hl 'fighter' 6 15 'LUNA'
      EqualBytes ([byte[]]$cr.result) ([byte[]]$hl.result) $hl.name 'headless /G /ID 3 /C GBPR == /Q /C GBPR (DQK rules, title 3)'
      $hl2=InvokeCase 'dqk-headless-create-second-member' 'CCPARTY /G /ID 3 /C ALDA M /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -prior ([byte[]]$hl.result)
      $hl2x=ExpectCreated $hl2 'mage' 6 15 'ALDA'
      Check $hl2.name 'headless second member takes slot 81h, first row preserved' ($hl2x.rows.Count-eq2-and$hl2x.rows[0][0]-eq0x80-and$hl2x.rows[1][0]-eq0x81) 'native ids'
      $hl3=InvokeCase 'dqk-headless-create-bad-name' 'CCPARTY /G /ID 3 /C DQK_FIGHTER F /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -ExpectedStatus NONZERO
      Check $hl3.name 'headless DQK rejects a non-letter name before writing' ($null-eq$hl3.result) 'dq_check_name'
      $kn=InvokeCase 'dqk-create-kender-cap' 'CCPARTY /Q /C KENDRA F /R 5 /N 15 /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice}
      $knx=ExpectCreated $kn 'fighter' 5 15 'KENDRA'
      Check $kn.name 'kender fighter stops at its racial cap of 5' ($null-ne$knx.qch-and$knx.qch[0xA7]-eq5) 'level +0xA7'
      $hd=InvokeCase 'dqk-create-halfelf-mage' 'CCPARTY /Q /C ELWYN M /R 2 /N 9 /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice}
      $hdx=ExpectCreated $hd 'mage' 2 9 'ELWYN'
      $kk=InvokeCase 'dqk-create-kender-knight-rejected' 'CCPARTY /Q /C KENDRA K /R 5 /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -ExpectedStatus NONZERO
      Check $kk.name 'kender cannot be a knight: no roster, no QCH' ($null-eq$kk.result-and-not(Test-Path -LiteralPath (Join-Path $kk.path 'C\SAVE\KENDRA.QCH'))) 'racial cap 0'
      # Mutation control: the same case under a binary whose fighter hit die is
      # d4 instead of d10 must NOT match the model (the comparison can fail).
      $bin=[IO.File]::ReadAllBytes($BinaryPath)
      $pat=[byte[]](8,10,10,10,8,4,6)
      $hits=@()
      for($i=0;$i-le$bin.Length-7;$i++){
        $ok=$true
        for($k=0;$k-lt7;$k++){
          if($bin[$i+$k]-ne$pat[$k]){
            $ok=$false
            break
          }
        }

        if($ok){
          $hits+=$i
        }

      }

      Check 'dqk-create-mutation' 'dice-sides table appears exactly once in CCPARTY.COM' ($hits.Count-eq1) "hits=$($hits.Count)"
      if($hits.Count-eq1){
        $mut=[byte[]]$bin.Clone()
        $mut[$hits[0]+2]=4
        $mutPath=Join-Path $RunRoot 'ccparty-mutant-sides.com'
        [IO.File]::WriteAllBytes($mutPath,$mut)
        $mc=InvokeCase 'dqk-create-mutant-sides' 'CCPARTY /Q /C LUNA F /R 6 /N 15 /D DICE.BIN ROSTER.GBP > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -Binary $mutPath
        $mf=Join-Path $mc.path 'C\SAVE\LUNA.QCH'
        $mq=if(Test-Path -LiteralPath $mf){
          [IO.File]::ReadAllBytes($mf)
        }
        else{
          $null
        }
        $differs=$null-eq$mq-or-not[Linq.Enumerable]::SequenceEqual([byte[]]$mq,[byte[]]$crx.model.bytes)
        Check 'dqk-create-mutation' 'a changed dice-table constant no longer equals the model' $differs 'fighter d10 -> d4 in the native table'
      }

      $bad=InvokeCase 'dqk-create-bad-dice-file' 'CCPARTY /Q /C LUNA F /D MISSING.BIN ROSTER.GBP > RUN.TXT' -saveDir -ExpectedStatus NONZERO
      Check $bad.name 'missing dice file rejects before any output' ($null-eq$bad.result-and-not(Test-Path -LiteralPath (Join-Path $bad.path 'C\SAVE\LUNA.QCH'))) 'no roster, no QCH'
      # ---- normal /Q /M menu creation == /Q /C with the same inputs ----
      $menuIn="c`rluna`rf`r6`r15`rb`r"
      $mn=InvokeCase 'dqk-menu-create-fighter' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -InputText $menuIn
      EqualBytes ([byte[]]$cr.result) ([byte[]]$mn.result) $mn.name 'menu GBPR (row body, header, slot 80h) == /Q /C GBPR'
      $mnq=Join-Path $mn.path 'C\SAVE\LUNA.QCH'
      EqualBytes ([byte[]]$crx.qch) $(if(Test-Path -LiteralPath $mnq){[IO.File]::ReadAllBytes($mnq)}else{$null}) $mn.name 'menu QCH == /Q /C QCH (414 bytes)'
      # Bad name / class / race / CON each re-prompt without output, then the same character results.
      $badIn="c`rab`rlu na`r1234`rabcdefghij`rluna`rx`rf`r9`r6`r30`rzz`r15`rb`r"
      $mb=InvokeCase 'dqk-menu-create-reprompt' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -InputText $badIn
      EqualBytes ([byte[]]$cr.result) ([byte[]]$mb.result) $mb.name 'after re-prompts the GBPR equals the clean /Q /C GBPR'
      Check $mb.name 'four bad names reported' (([regex]::Matches($mb.text,'Invalid character name')).Count-eq4) ([regex]::Matches($mb.text,'Invalid character name')).Count
      $mbq=Join-Path $mb.path 'C\SAVE\LUNA.QCH'
      EqualBytes ([byte[]]$crx.qch) $(if(Test-Path -LiteralPath $mbq){[IO.File]::ReadAllBytes($mbq)}else{$null}) $mb.name 'QCH after re-prompts equals the clean one'
      # Different input must change the bytes (the equality above can fail).
      $mc14=InvokeCase 'dqk-menu-create-con14' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -InputText "c`rluna`rf`r6`r14`rb`r"
      Check $mc14.name 'CON 14 differs from CON 15 (comparison is input-sensitive)' ($null-ne$mc14.result-and-not[Linq.Enumerable]::SequenceEqual([byte[]]$mc14.result,[byte[]]$cr.result)) 'roster bytes differ'
      # Mutant dice-sides binary through the MENU path must not match the model.
      if($hits.Count-eq1){
        $mm=InvokeCase 'dqk-menu-create-mutant-sides' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -InputText $menuIn -Binary $mutPath
        $mmq=Join-Path $mm.path 'C\SAVE\LUNA.QCH'
        $mmb=if(Test-Path -LiteralPath $mmq){[IO.File]::ReadAllBytes($mmq)}else{$null}
        Check $mm.name 'mutant dice table through the menu no longer equals the model' ($null-eq$mmb-or-not[Linq.Enumerable]::SequenceEqual([byte[]]$mmb,[byte[]]$crx.model.bytes)) 'fighter d10 -> d4'
      }
      # Sixth creation then seventh refused, in one session.
      $six=InvokeCase 'dqk-menu-create-sixth-then-full' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -qsv -qsvBytes $qsv5 -saveDir -extra @{'DICE.BIN'=$dice} -InputText "c`rluna`rf`r6`r15`rc`rb`r"
      $sixRows=if($null-ne$six.result){Rows ([byte[]]$six.result)}else{@()}
      Check $six.name 'five imported + one created = six rows; seventh refused' ($sixRows.Count-eq6-and$sixRows[5][0]-eq0x80-and$six.text-like'*Party is full (6).*') "rows=$($sixRows.Count)"
      # Kender knight: rejected message, back to the menu, nothing written.
      $kk2=InvokeCase 'dqk-menu-kender-knight' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -ExpectedStatus NONZERO -InputText "c`rkendra`rk`r5`r15`rb`r"
      Check $kk2.name 'kender knight: rejected, no roster, no QCH' ($null-eq$kk2.result-and$kk2.text-like'*creation was rejected*'-and-not(Test-Path -LiteralPath (Join-Path $kk2.path 'C\SAVE\KENDRA.QCH'))) 'racial cap 0'
      # EOF mid-way: nonzero, no roster, no QCH.
      foreach($cut in @(@('name',"c`r"),@('class',"c`rluna`r"),@('race',"c`rluna`rf`r"),@('con',"c`rluna`rf`r6`r"))){
        $eo=InvokeCase ('dqk-menu-eof-'+$cut[0]) 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -ExpectedStatus NONZERO -InputText $cut[1]
        Check $eo.name "EOF at $($cut[0]) writes no roster and no QCH" ($null-eq$eo.result-and-not(Test-Path -LiteralPath (Join-Path $eo.path 'C\SAVE\LUNA.QCH'))) 'exit nonzero'
      }
      # Control for the EOF check: EOF after a COMPLETE creation does leave the QCH, so the predicate can fail.
      $eoc=InvokeCase 'dqk-menu-eof-after-create' 'CCPARTY /Q /M /D DICE.BIN ROSTER.GBP < INPUT.TXT > RUN.TXT' -saveDir -extra @{'DICE.BIN'=$dice} -ExpectedStatus NONZERO -InputText "c`rluna`rf`r6`r15`r"
      Check $eoc.name 'control: EOF after completed creation leaves QCH (no-QCH predicate is falsifiable)' (Test-Path -LiteralPath (Join-Path $eoc.path 'C\SAVE\LUNA.QCH')) 'QCH present'
    }

    # Empty source: the menu now opens (creation is possible); Begin is refused
    # until a member exists, and EOF there exits nonzero having written no roster.
    $qMenuEmpty=InvokeCase 'dqk-menu-empty-begin-refused' 'CCPARTY /Q /M ROSTER.GBP < INPUT.TXT > RUN.TXT' -ExpectedStatus NONZERO -InputText "b`r"
    Check $qMenuEmpty.name 'empty DQK menu creates no output' ($null-eq$qMenuEmpty.result) 'Begin with zero members writes no roster'
    Check $qMenuEmpty.name 'empty DQK menu refuses Begin' ($qMenuEmpty.text-like'*Create at least one character before beginning.*') 'no import-only gate'
    # Original DQK heals physical +198h and clamps it to maximum +89h.
    # Read both fields independently; full-health retail fixtures cannot
    # distinguish the former max-HP-for-both importer from the correct one.
    function ExpectHp($case,[int[]]$current,[int[]]$maximum){
      $rows=Rows ([byte[]]$case.result)
      Check $case.name 'HP fixture row count' ($rows.Count-eq$current.Count) "rows=$($rows.Count)"
      for($i=0;$i-lt$current.Count-and$i-lt$rows.Count;$i++){
        $hp=[BitConverter]::ToUInt16($rows[$i],1+216+6)
        $maxhp=[BitConverter]::ToUInt16($rows[$i],1+216+26)
        Check $case.name "member $i current/max HP" ($hp-eq$current[$i]-and$maxhp-eq$maximum[$i]) "HP=$hp/$maxhp expected=$($current[$i])/$($maximum[$i])"
      }
    }
    $hurtQsv=[byte[]]$qsv.Clone()
    $hurtQsv[0x40f+0x198]=0
    $hurtQsv[0x60b+0x198]=9
    $qsvHp=InvokeCase 'qsv-current-hp' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $hurtQsv
    $maxima=@($qrecs | ForEach-Object { [int]$_[129] })
    $currents=@($qrecs | ForEach-Object { [int]$_[400] })
    $currents[0]=0
    $currents[1]=9
    ExpectHp $qsvHp $currents $maxima
    $qsvHpCold=InvokeCase 'qsv-current-hp-cold' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $hurtQsv -prior ([byte[]]$qsvHp.result)
    EqualBytes ([byte[]]$qsvHp.result) ([byte[]]$qsvHpCold.result) $qsvHpCold.name 'cold reload keeps imported HP'
    $hurtQch=[byte[]]$qrecs[0].Clone()
    $hurtQch[129]=220
    $hurtQch[400]=200
    $zeroQch=[byte[]]$qrecs[1].Clone()
    $zeroQch[400]=0
    $qchHp=InvokeCase 'qch-current-hp' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qch (PackRows $hurtQch $zeroQch)
    ExpectHp $qchHp @(200,0) @(220,[int]$zeroQch[129])
    $qchHpCold=InvokeCase 'qch-current-hp-cold' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qch (PackRows $hurtQch $zeroQch) -prior ([byte[]]$qchHp.result)
    EqualBytes ([byte[]]$qchHp.result) ([byte[]]$qchHpCold.result) $qchHpCold.name 'cold reload keeps unsigned and zero HP'
    # A prior native combat result intentionally overrides the source save.
    $combatPrior=[byte[]]$qsvHp.result.Clone()
    [BitConverter]::GetBytes([uint16]3).CopyTo($combatPrior,16+1+216+4)
    [BitConverter]::GetBytes([uint16]4).CopyTo($combatPrior,16+1+216+6)
    [BitConverter]::GetBytes([uint16]80).CopyTo($combatPrior,16+1+216+26)
    $combatReload=InvokeCase 'qsv-combat-hp-override' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $hurtQsv -prior $combatPrior
    EqualBytes $combatPrior ([byte[]]$combatReload.result) $combatReload.name 'combat HP override retained'
    foreach($shortLength in @(300,400,405)){
      $shortQch=[byte[]]$hurtQch[0..($shortLength-1)]
      $shortCase=InvokeCase "qch-short-$shortLength" 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qch (PackRows $zeroQch $shortQch) -prior ([byte[]]$qchHp.result) -ExpectedStatus NONZERO
      EqualBytes ([byte[]]$qchHp.result) ([byte[]]$shortCase.result) $shortCase.name 'short record rejects before output truncation'
    }
    $src5=[byte[][]]@($seedRows[0..4])
    $n80=WithId $seedRows[0] 0x80
    $n82=WithId $seedRows[1] 0x82
    $n84=WithId $seedRows[2] 0x84
    $prev80=Roster (PackRows $n80)
    $qsvKeep=InvokeCase 'qsv5-native80' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $prev80
    ExpectRows $qsvKeep $src5 (PackRows $n80) 'qsv5-native80'
    $qchKeep=InvokeCase 'qch5-native80' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qch $qrecs[0..4] -prior $prev80
    ExpectRows $qchKeep $src5 (PackRows $n80) 'qch5-native80'
    $prev82=Roster (PackRows $n82)
    # DQK reaches the retail 8-member cap: six source rows plus one native row, and five plus
    # two, now fit as 7 rows.  Overflow is nine rows (six source + three native, five + four).
    $ov6=InvokeCase 'qsv6-native1-fits-cap8' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -prior $prev82
    ExpectRows $ov6 $seedRows (PackRows $n82) 'qsv6-native1-fits-cap8'
    $prev802=Roster (PackRows $n80 $n82)
    $ov5=InvokeCase 'qsv5-native2-fits-cap8' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $prev802
    ExpectRows $ov5 $src5 (PackRows $n80 $n82) 'qsv5-native2-fits-cap8'
    $n86=WithId $seedRows[3] 0x86
    $n87=WithId $seedRows[4] 0x87
    $prev8=Roster (PackRows $n80 $n82 $n84)
    $ov9a=InvokeCase 'overflow-qsv6-native3' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -prior $prev8 -ExpectedStatus NONZERO
    EqualBytes $prev8 ([byte[]]$ov9a.result) 'overflow-qsv6-native3' 'output unchanged'
    $prev9=Roster (PackRows $n80 $n82 $n84 $n86)
    $ov9b=InvokeCase 'overflow-qsv5-native4' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $prev9 -ExpectedStatus NONZERO
    EqualBytes $prev9 ([byte[]]$ov9b.result) 'overflow-qsv5-native4' 'output unchanged'
    # Eight rows exactly (6 source + the two NPC slots 0x86 and 0x87) reload byte-for-byte.
    $prev87=Roster (PackRows $n86 $n87)
    $fit8=InvokeCase 'qsv6-npc-slots-fit-8' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -prior $prev87
    ExpectRows $fit8 $seedRows (PackRows $n86 $n87) 'qsv6-npc-slots-fit-8'
    $mix=Roster (PackRows $n80 (WithId $seedRows[4] 5) (WithId $seedRows[3] 4))
    $exact=InvokeCase 'exact-six-native-first' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $mix
    ExpectRows $exact $src5 (PackRows $n80) 'exact-six-native-first'
    $srcPrior=Roster (PackRows $seedRows[0] $seedRows[2] $seedRows[4] $seedRows[1] $seedRows[3] $seedRows[5])
    $srcCtl=InvokeCase 'qsv6-prior-source-only' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -prior $srcPrior
    ExpectRows $srcCtl $seedRows ([byte[][]]@()) 'qsv6-prior-source-only'
    $nativeOnly=Roster (PackRows $n80 $n82 $n84)
    $cold=InvokeCase 'no-source-cold-reload' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -prior $nativeOnly
    EqualBytes $nativeOnly ([byte[]]$cold.result) 'no-source-cold-reload' 'exact cold reload'
    $wrong=Roster (PackRows $n82) 2 1 2
    $wc=InvokeCase 'wrong-title-id2' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $wrong -ExpectedStatus NONZERO
    EqualBytes $wrong ([byte[]]$wc.result) 'wrong-title-id2' 'unchanged'
    $legacy=Roster (PackRows $n82) 0 1 1
    $lc=InvokeCase 'legacy-v1-native' 'CCPARTY /Q ROSTER.GBP > RUN.TXT' -qsv -qsvBytes $qsv5 -prior $legacy -ExpectedStatus NONZERO
    EqualBytes $legacy ([byte[]]$lc.result) 'legacy-v1-native' 'unchanged'
    $cseed=InvokeCase 'cok-seed-six' 'CCPARTY /ID 1 ROSTER.GBP > RUN.TXT' -cokSlots @('1','2','3','4','5','6')
    $cr=Rows ([byte[]]$cseed.result)
    if($cr.Count-ne6){
      throw 'CoK seed was not six'
    }

    $cEof=InvokeCase 'cok-menu-input-eof' 'CCPARTY /ID 1 /M ROSTER.GBP < INPUT.TXT > RUN.TXT' -cokSlots @('1','2','3','4','5','6') -prior ([byte[]]$cseed.result) -InputText 'X' -ExpectedStatus NONZERO
    EqualBytes ([byte[]]$cseed.result) ([byte[]]$cEof.result) $cEof.name 'EOF rejects without replacing prior roster'
    $cInputSeed=InvokeCase 'cok-menu-seed-one' 'CCPARTY /ID 1 ROSTER.GBP > RUN.TXT' -cokSlots @('1')
    foreach($inputCase in @(
      @{ Name='cok-name-input-eof'; Text="C`rUNFINISHED" },
      @{ Name='cok-class-input-eof'; Text="C`rEOF_HERO`r" }
    )){
      $inputEof=InvokeCase $inputCase.Name 'CCPARTY /ID 1 /M ROSTER.GBP < INPUT.TXT > RUN.TXT' -cokSlots @('1') -prior ([byte[]]$cInputSeed.result) -InputText $inputCase.Text -ExpectedStatus NONZERO
      EqualBytes ([byte[]]$cInputSeed.result) ([byte[]]$inputEof.result) $inputEof.name 'Incomplete creation input leaves prior roster unchanged'
    }

    $c80=WithId $cr[0] 0x80
    $c82=WithId $cr[2] 0x82
    $shp=Roster (PackRows $cr[0] $cr[1] $c82) 1 0 2
    $sh=InvokeCase 'cok-shrink-id82' 'CCPARTY /C NEWMAGE M ROSTER.GBP > RUN.TXT' -cokSlots @('1') -prior $shp
    Check 'cok-shrink-id82' 'creation completes' ($sh.status-eq'ZERO') "marker=$($sh.status)"
    if($null-ne$sh.result){
      $rr=Rows ([byte[]]$sh.result)
      $ids=@()
      foreach($r in $rr){
        $ids += [int]$r[0]
      }

      Check 'cok-shrink-id82' 'count3 and allocate free80 preserving82' ($rr.Count-eq3-and$ids-contains0x80-and@($ids|Where-Object{$_-eq0x82}).Count-eq1) ("ids="+($ids-join','))
      foreach($n in @($cr[0],$c82)){
        $f=$null
        foreach($r in $rr){
          if($r[0]-eq$n[0]){
            $f=$r
            break
          }

        }

        EqualBytes $n $f 'cok-shrink-id82' ('preserve ID {0:X2}'-f$n[0])
      }
      $new=$rr[$rr.Count-1]
      $newName=[Text.Encoding]::ASCII.GetString($new,2,$new[1])
      Check 'cok-shrink-id82' 'created character name NEWMAGE' ($newName-eq'NEWMAGE') "name=$newName"
    }

    $shc=InvokeCase 'cok-shrink-cold' 'CCPARTY ROSTER.GBP > RUN.TXT' -cokSlots @('1') -prior ([byte[]]$sh.result)
    EqualBytes ([byte[]]$sh.result) ([byte[]]$shc.result) 'cok-shrink-cold' 'cold reload exact'
    $gp=Roster (PackRows $cr[0] $cr[1] $c80 $c82) 1 0 2
    $gap=InvokeCase 'cok-gap-80-82' 'CCPARTY /C NEWCLERIC C ROSTER.GBP > RUN.TXT' -cokSlots @('1') -prior $gp
    if($null-ne$gap.result){
      $rr=Rows ([byte[]]$gap.result)
      $ids=@()
      foreach($r in $rr){
        $ids += [int]$r[0]
      }

      $new=$rr[$rr.Count-1]
      $newName=[Text.Encoding]::ASCII.GetString($new,2,$new[1])
      Check 'cok-gap-80-82' 'count4 fills gap with ID81' ($rr.Count-eq4-and$ids-contains0x81) ("ids="+($ids-join','))
      Check 'cok-gap-80-82' 'created character name NEWCLERIC' ($newName-eq'NEWCLERIC') "name=$newName"
      foreach($n in @($cr[0],$c80,$c82)){
        $f=$null
        foreach($r in $rr){
          if($r[0]-eq$n[0]){
            $f=$r
            break
          }

        }

        EqualBytes $n $f 'cok-gap-80-82' ('preserve ID {0:X2}'-f$n[0])
      }

    }

    $gc=InvokeCase 'cok-gap-cold' 'CCPARTY ROSTER.GBP > RUN.TXT' -cokSlots @('1') -prior ([byte[]]$gap.result)
    EqualBytes ([byte[]]$gap.result) ([byte[]]$gc.result) 'cok-gap-cold' 'cold reload exact'
    $failed=@($preservationChecks|Where-Object{-not $_.ok})
    $summary=[ordered]@{
      runId=$RunRoot
      binary=$BinaryPath
      binarySha256=(Get-FileHash $BinaryPath -Algorithm SHA256).Hash
      expectedMode='required'
      root=$RunRoot
      retailQsvHash=(Get-FileHash $QsvPath -Algorithm SHA256).Hash
      checks=$preservationChecks.ToArray()
      sessions=$preservationSessions.ToArray()
      failed=$failed
      result=if($failed.Count){
        'FAIL'
      }
      else{
        'PASS'
      }

    }

    $summary|ConvertTo-Json -Depth 7|Set-Content (Join-Path $RunRoot 'summary.json') -Encoding utf8
    "RUN_ROOT: $RunRoot"
    "BINARY_SHA256: $($summary.binarySha256)"
    "CHECKS: $($preservationChecks.Count)"
    "FAILURES: $($failed.Count)"
    foreach($f in $failed){
      "FAIL $($f.case)/$($f.name): $($f.detail)"
    }

    if($failed.Count){
      throw "CCPARTY preservation: $($failed.Count) failed assertions"
    }

    Write-Output "PASS: CCPARTY QSV/QCH merge, overflow preservation, identity and slot allocation ($($preservationChecks.Count) checks)"

  }
} else {
  Write-Output 'SKIP: CCPARTY QSV/QCH preservation (retail QSV absent)'
}

Write-Output "RESULT: CCPARTY CoK/DoK load/create/persist + six-member combat import PASS"
