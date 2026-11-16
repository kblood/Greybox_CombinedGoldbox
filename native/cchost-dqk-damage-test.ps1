# cchost-dqk-damage-test.ps1 -- CCHOST /D on a DQK compact roster and CCFLOW's
# loop record (GBEF v15 status 4 + FX_HAVE_SIDECAR, GBHD reason 10).
#
# (a) /D on a DQK compact GBPR (title id 3) updates only the GBD1 cache: it must
#     not take DoK's retail-save path (SAVE\CHRDATA<slot>.GAM byte 214).
# (b) A reason-10 loop record is accepted by /D only with its GBSL and only for
#     a DQK roster; forged variants and a GBHR handoff are rejected unchanged.
# -ComPath lets the harness run an alternate CCHOST build (used to see RED).
param([switch]$Headless, [string]$Root = (Split-Path -Parent $PSScriptRoot), [string]$ComPath)
$ErrorActionPreference = 'Stop'
$native = Join-Path $Root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'cchost-dqk-damage-test'
$dosbox = Join-Path $Root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
if (-not (Test-Path $dosbox)) { Write-Output 'SKIP: retail DOSBox not present'; exit 0 }
. (Join-Path $native 'dosbox-smoke.ps1')
if (-not $ComPath) {
  & (Join-Path $native 'build.ps1') -Target cchost
  $ComPath = Join-Path $build 'cchost.com'
}
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $ComPath (Join-Path $run 'CCHOST.COM') -Force

function Set-U16([byte[]]$B, [int]$O, [int]$V) { [BitConverter]::GetBytes([UInt16]$V).CopyTo($B, $O) }
function Ascii([byte[]]$B, [int]$O, [string]$S) { [Text.Encoding]::ASCII.GetBytes($S).CopyTo($B, $O) }
function Same([byte[]]$A, [byte[]]$B) { return ([BitConverter]::ToString($A) -eq [BitConverter]::ToString($B)) }

# One compact member: slot byte, 216 raw bytes, GBD1 cache with cur/max HP 20.
function New-Roster([int]$Title, [int]$Slot) {
  $r = New-Object byte[] (16 + 410)
  Ascii $r 0 'GBPR'; Set-U16 $r 4 2; Set-U16 $r 6 1; Set-U16 $r 8 410
  Set-U16 $r 10 1; Set-U16 $r 12 $Title; Set-U16 $r 14 1
  $o = 16
  $r[$o] = $Slot
  Ascii $r ($o + 1 + 216) 'GBD1'
  Set-U16 $r ($o + 1 + 216 + 4) 5
  Set-U16 $r ($o + 1 + 216 + 6) 20
  Set-U16 $r ($o + 1 + 216 + 26) 20
  $r[$o + 1 + 0x45] = 1
  return ,$r
}
$hpOff = 16 + 1 + 216 + 6

# GBEF v15 / status 4 with an optional sidecar flag and GBHD reason. One 1d2+1
# DAMAGE (value 3) to the whole party sits in the GBSX bridge and the GBSL row.
$damageRow = New-Object byte[] 20
Set-U16 $damageRow 0 0x2e; Set-U16 $damageRow 2 5; Set-U16 $damageRow 4 0xe0
Set-U16 $damageRow 6 1; Set-U16 $damageRow 8 2; Set-U16 $damageRow 10 1
function New-Effect([int]$Version, [bool]$Sidecar, [int]$Reason) {
  $len = if ($Version -eq 15) { 5932 } else { 5750 }
  $e = New-Object byte[] $len
  Ascii $e 0 'GBEF'; Set-U16 $e 4 $Version
  if ($Sidecar) { Set-U16 $e 6 0x0100 }
  Ascii $e 2246 'GBSX'; Set-U16 $e 2250 1
  $damageRow.CopyTo($e, 2252)
  Ascii $e 5720 'GBHD'; Set-U16 $e 5724 $Reason
  if ($Version -eq 15) {
    Set-U16 $e 8 4
    Ascii $e 5774 'GBMS'
    Ascii $e 5920 'GBRF'
  }
  return ,$e
}
# Status-2 v15 menu yield in CCECL's real layout (GBMN at V9_LEN, GBRF magic at
# V14_LEN=5920, three raw flag words, reserved word): event 0 is the DAMAGE and
# event 1 the menu opcode.  validate_damage_v15_menu used to read the GBRF magic
# at 5924 and a flag word past EOF, so it rejected every real record.
function New-Menu([int]$Flags, [int]$RawFlag0) {
  $e = New-Object byte[] 5932
  Ascii $e 0 'GBEF'; Set-U16 $e 4 15; Set-U16 $e 8 2
  Ascii $e 2246 'GBSX'; Set-U16 $e 2250 2
  $damageRow.CopyTo($e, 2252); Set-U16 $e (2252 + 20) 0x30
  Ascii $e 5750 'GBMN'; Set-U16 $e 5754 $Flags; Set-U16 $e 5760 0x30; Set-U16 $e 5762 1
  Ascii $e 5920 'GBRF'; Set-U16 $e 5924 $RawFlag0
  return ,$e
}
$side = New-Object byte[] 62
Ascii $side 0 'GBSL'; Set-U16 $side 4 1; Set-U16 $side 6 1
$damageRow.CopyTo($side, 8)

# CCFLOW's real area-2 loop record is the oracle for reason 10: reuse the area-2
# test's -Probe output (real CCECL+CCFLOW under DOSBox on retail DISK3\ECL.GLB).
$a2dir = Join-Path $build 'ccflow-dqk-area2-test'
if (-not (Test-Path (Join-Path $a2dir 'A2.EFX')) -and (Test-Path (Join-Path $Root 'The Dark Queen of Krynn\DISK3\ECL.GLB'))) {
  & pwsh -NoProfile -File (Join-Path $native 'ccflow-dqk-area2-test.ps1') -Probe | Out-Null
}
if (-not (Test-Path (Join-Path $a2dir 'A2.EFX'))) { throw 'no real CCFLOW reason-10 record (needs DQK DISK3\ECL.GLB + DOSBox)' }
$real = [IO.File]::ReadAllBytes((Join-Path $a2dir 'A2.EFX'))
$realGbs = [IO.File]::ReadAllBytes((Join-Path $a2dir 'A2.GBS'))
if ($real.Length -ne 5932 -or [BitConverter]::ToUInt16($real,4) -ne 15 -or [BitConverter]::ToUInt16($real,8) -ne 4 -or [BitConverter]::ToUInt16($real,5724) -ne 10 -or ([BitConverter]::ToUInt16($real,6) -band 0x100) -eq 0) { throw 'A2.EFX is not a reason-10 v15/status-4 sidecar record' }
function Real([int]$Reason, [bool]$Sidecar) { $e = [byte[]]$real.Clone(); Set-U16 $e 5724 $Reason; if (-not $Sidecar) { Set-U16 $e 6 ([BitConverter]::ToUInt16($e,6) -band 0xFEFF) }; return ,$e }
# CCFLOW's real DQK /A 3 loop record: 34 chunks = 2,176 GBSL rows (> the old
# 1,213 cap).  Reproduced here through CCFLOW on retail DISK3\ECL.GLB.
$a3efx = Join-Path $a2dir 'A3.EFX'; $a3gbs = Join-Path $a2dir 'A3.GBS'
foreach ($f in $a3efx, $a3gbs) { if (Test-Path $f) { Remove-Item -Force $f } }
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$a2dir"
C:
CCFLOW C:\A2.GLB 3 /E C:\A3.EFX > C:\A3.TXT
exit
"@ | Set-Content -Path (Join-Path $a2dir '_a3.conf') -Encoding ASCII
$p3 = Start-DosBoxSmoke -Dosbox $dosbox -Conf (Join-Path $a2dir '_a3.conf') -Headless:$Headless
if (-not $p3.WaitForExit(180000)) { Stop-DosBoxSmoke -Process $p3; throw 'CCFLOW /A 3 did not finish' }
if (-not (Test-Path $a3efx) -or -not (Test-Path $a3gbs)) { throw 'CCFLOW area 3 published no record' }
$real3 = [IO.File]::ReadAllBytes($a3efx); $real3Gbs = [IO.File]::ReadAllBytes($a3gbs)
$rows3 = [BitConverter]::ToUInt16($real3Gbs, 6)
if ($rows3 -ne 2176 -or $real3Gbs.Length -ne 8 + 54 * 2176 -or [BitConverter]::ToUInt16($real3, 5724) -ne 10) { throw "area 3 record is not the 2,176-row loop record (rows=$rows3)" }
# GBSL v1 row i starts at 8+54*i.  A row carrying one party-wide 1d2+1 DAMAGE
# (value 3) is the 20-byte $damageRow; a DECOY is the same shape with value 9.
$decoyRow = [byte[]]$damageRow.Clone(); Set-U16 $decoyRow 10 8
function New-Gbs([byte[]]$Base, [int]$Rows, [int[]]$DamageAt, [bool]$Decoys) {
  $n = New-Object byte[] (8 + 54 * $Rows)
  Ascii $n 0 'GBSL'; Set-U16 $n 4 1; Set-U16 $n 6 $Rows
  if ($Base) { [Array]::Copy($Base, 8, $n, 8, [Math]::Min($Base.Length, $n.Length) - 8) }
  foreach ($i in $DamageAt) {
    if ($Decoys) {   # what a u16-wrapped offset would read for this row
      $w = (8 + 54 * $i) % 65536; if ($w -gt $n.Length - 20) { $w = 0 }
      $decoyRow.CopyTo($n, $w)
    }
  }
  foreach ($i in $DamageAt) { $o = 8 + 54 * $i; $damageRow.CopyTo($n, $o); Set-U16 $n ($o + 20) 0 }
  return ,$n
}
function Real3([int]$Reason) { $e = [byte[]]$real3.Clone(); Set-U16 $e 5724 $Reason; return ,$e }
$wrapPast = New-Gbs $real3Gbs 2176 @(1300, 2175) $true      # rows beyond the old cap, offsets > 64 KiB
$truncRow = [byte[]]($wrapPast[0..($wrapPast.Length - 55)])   # header says 2176, file holds 2175
$longBy1 = New-Object byte[] ($wrapPast.Length + 1); $wrapPast.CopyTo($longBy1, 0)
$cntLow = [byte[]]$wrapPast.Clone(); Set-U16 $cntLow 6 2175  # header 2175, file holds 2176
$maxRows = New-Gbs $null 65535 @(40000, 65534) $true         # u16 count ceiling, extent 3,538,898 bytes
$maxShort = [byte[]]($maxRows[0..($maxRows.Length - 55)])
$v2big = New-Object byte[] (8 + 54 * 1214); Ascii $v2big 0 'GBSL'; Set-U16 $v2big 4 2; Set-U16 $v2big 6 1214
$decoy = New-Object byte[] 216
for ($i = 0; $i -lt 216; $i++) { $decoy[$i] = [byte](($i * 7 + 3) -band 0xff) }
$decoy[214] = 0x5A; $decoy[40] = 0x66

$cases = @(
  @{ N='A1'; Title=3; Slot=1; Eff=(New-Effect 9 $false 0);  Side=$false; Save=$true;  Expect='apply' }
  @{ N='A2'; Title=3; Slot=1; Eff=(New-Effect 9 $false 0);  Side=$false; Save=$false; Expect='apply' }
  @{ N='A3'; Title=3; Slot=1; Eff=(New-Effect 9 $true 0);   Side=$true;  Save=$true;  Expect='apply' }
  @{ N='B1'; Title=3; Slot=1; Eff=(Real 10 $true); Side=$true;  Save=$true;  Expect='apply' }
  @{ N='B2'; Title=3; Slot=1; Eff=(Real 7 $true);  Side=$true;  Save=$true;  Expect='reject' }
  @{ N='B3'; Title=3; Slot=1; Eff=(Real 10 $false);Side=$false; Save=$true;  Expect='reject' }
  @{ N='B4'; Title=2; Slot=1; Eff=(Real 10 $true); Side=$true;  Save=$true;  Expect='reject' }
  @{ N='B5'; Title=3; Slot=1; Eff=(Real 0 $true);  Side=$true;  Save=$true;  Expect='reject' }
  @{ N='B6'; Title=3; Slot=1; Eff=(Real 10 $true); Side=$false; Save=$true;  Expect='reject' }
  @{ N='R1'; Title=3; Slot=1; Eff=(Real 10 $true); Side=$true; Gbs=$realGbs; Save=$true; Expect='noop' }
  @{ N='L1'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$real3Gbs; Save=$true; Expect='noop' }
  @{ N='L2'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$wrapPast; Save=$true; Expect='apply'; Hp=14 }
  @{ N='L3'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$truncRow; Save=$true; Expect='reject' }
  @{ N='L4'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$longBy1; Save=$true; Expect='reject' }
  @{ N='L5'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$cntLow; Save=$true; Expect='reject' }
  @{ N='L6'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$maxRows; Save=$true; Expect='apply'; Hp=14 }
  @{ N='L7'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$maxShort; Save=$true; Expect='reject' }
  @{ N='L8'; Title=3; Slot=1; Eff=(Real3 10); Side=$true; Gbs=$v2big; Save=$true; Expect='reject' }
  @{ N='U1'; Title=3; Slot=1; Eff=(New-Menu 1 0); Side=$false; Save=$true; Expect='apply' }
  @{ N='U2'; Title=3; Slot=1; Eff=(New-Menu 1 0x0200); Side=$false; Save=$true; Expect='reject' }
  @{ N='D1'; Title=2; Slot=1; Eff=(New-Effect 9 $false 0);  Side=$false; Save=$true;  Expect='apply'; Dok=$true }
  @{ N='H1'; Title=3; Slot=1; Eff=(Real 10 $true); Side=$true;  Save=$true;  Expect='gbhr' }
  @{ N='H2'; Title=3; Slot=1; Eff=(Real 7 $true);  Side=$true;  Save=$true;  Expect='gbhr-ok' }
)
New-Item -ItemType Directory -Force (Join-Path $run 'SAVE') | Out-Null
[IO.File]::WriteAllBytes((Join-Path $run 'SAVE\CHRDATA1.GAM'), $decoy)
[IO.File]::WriteAllBytes((Join-Path $run 'DECOY.GAM'), $decoy)
# DoK control needs a retail-shaped 216-byte source; reuse the decoy bytes.
$bat = New-Object Text.StringBuilder
foreach ($c in $cases) {
  $n = $c.N
  $ros = New-Roster $c.Title $c.Slot
  $c.Roster = $ros
  [IO.File]::WriteAllBytes((Join-Path $run "$n.GPR"), $ros)
  [IO.File]::WriteAllBytes((Join-Path $run "$n.EFX"), [byte[]]$c.Eff)
  if ($c.Side) { $g = if ($c.Gbs) { $c.Gbs } else { $side }; [IO.File]::WriteAllBytes((Join-Path $run "$n.GBS"), $g) }
  [void]$bat.AppendLine('copy C:\DECOY.GAM C:\SAVE\CHRDATA1.GAM > nul')
  if (-not $c.Save) { [void]$bat.AppendLine('ren C:\SAVE SAVEX') }
  if ($c.Expect -like 'gbhr*') {
    $rq = New-Object byte[] 346
    Ascii $rq 0 'GBHR'; Set-U16 $rq 4 1; Set-U16 $rq 6 3
    Ascii $rq 10 "C:\$n.GCR"; Ascii $rq 122 "C:\$n.GPR"; Ascii $rq 234 "C:\$n.EFX"
    [IO.File]::WriteAllBytes((Join-Path $run "$n.GHR"), $rq)
    [void]$bat.AppendLine("echo FAIL> C:\$n.STA")
    [void]$bat.AppendLine("CCHOST /H C:\$n.GHR > C:\$n.LOG")
  } else {
    [void]$bat.AppendLine("echo FAIL> C:\$n.STA")
    [void]$bat.AppendLine("CCHOST /D C:\$n.EFX C:\$n.GPR > C:\$n.LOG")
  }
  [void]$bat.AppendLine("if not errorlevel 1 echo OK> C:\$n.STA")
  if (-not $c.Save) { [void]$bat.AppendLine('ren C:\SAVEX SAVE') }
  [void]$bat.AppendLine("copy C:\SAVE\CHRDATA1.GAM C:\$n.SAV > nul")
}
[void]$bat.AppendLine('exit')
$bat.ToString() | Set-Content -Path (Join-Path $run 'RUN.BAT') -Encoding ASCII
$conf = Join-Path $run '_t.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$run"
C:
call C:\RUN.BAT
"@ | Set-Content -Path $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(240000)) { Stop-DosBoxSmoke -Process $p; throw 'DOSBox did not exit' }

$fail = @()
foreach ($c in $cases) {
  $n = $c.N
  $sta = [IO.File]::ReadAllText((Join-Path $run "$n.STA")).Trim()
  $log = Get-Content (Join-Path $run "$n.LOG") -Raw
  $after = [IO.File]::ReadAllBytes((Join-Path $run "$n.GPR"))
  $hp = [BitConverter]::ToUInt16($after, $hpOff)
  switch -Wildcard ($c.Expect) {
    'apply' {
      if ($sta -ne 'OK' -or $log -notlike '*effect damage applied*') { $fail += "$n expected exit 0 + applied (got $sta / $log)" }
      else { $want = if ($c.Hp) { $c.Hp } else { 17 }; if ($hp -ne $want) { $fail += "$n GBD1 HP expected $want got $hp" } }
    }
    'reject' {
      if ($sta -eq 'OK') { $fail += "$n was accepted (forged/unsafe loop record)" }
      if (-not (Same $after $c.Roster)) { $fail += "$n changed the roster on rejection" }
    }
    'noop' {
      if ($sta -ne 'OK' -or $log -notlike '*effect damage applied*') { $fail += "$n real loop record + real GBSL expected exit 0 (got $sta / $log)" }
      elseif (-not (Same $after $c.Roster)) { $fail += "$n real GBSL holds no DAMAGE: roster must be unchanged" }
    }
    'gbhr' {
      if ($sta -eq 'OK' -or $log -notlike '*loop-detected effect*') { $fail += "$n GBHR with reason-10 effect not rejected by name ($sta / $log)" }
      if (-not (Same $after $c.Roster)) { $fail += "$n changed the roster on rejection" }
    }
    'gbhr-ok' {
      if ($log -like '*loop-detected effect*') { $fail += "$n reason-7 effect wrongly named loop-detected" }
    }
  }
  $sav = [IO.File]::ReadAllBytes((Join-Path $run "$n.SAV"))
  if ($c.Dok) {
    $di = @(0..215 | Where-Object { $decoy[$_] -ne $sav[$_] })
    if ($di.Count -ne 1 -or $di[0] -ne 214 -or $sav[214] -ne 17) { $fail += "$n DoK control must write only byte 214 = 17 (changed: $($di -join ','))" }
  } elseif (-not (Same $sav $decoy)) {
    $di = @(0..215 | Where-Object { $decoy[$_] -ne $sav[$_] })
    $fail += "$n modified SAVE\CHRDATA1.GAM at byte(s) $($di -join ',')"
  }
}
if ($fail.Count) { $fail | ForEach-Object { Write-Output "FAIL: $_" }; throw "cchost-dqk-damage: $($fail.Count) violation(s)" }
Write-Output "RESULT: CCHOST /D DQK compact roster leaves SAVE\CHRDATA1.GAM untouched (DoK control still writes 214=17), reason-10 loop record accepted only with GBSL for DQK rosters, the real 2,176-row /A 3 sidecar and a 65,535-row (u16 ceiling) sidecar with DAMAGE rows past 64 KiB applied at the right rows, count/extent mismatches and v2 > 1,213 rows rejected, forged/DoK/no-sidecar variants and GBHR rejected with rosters unchanged PASS"
