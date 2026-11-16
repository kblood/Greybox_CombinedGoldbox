# ccflow-coab-count-test.ps1 -- measure the TRUE host-effect count of CoAB
# /A 4 /B 34 through CCFLOW's GBSL v1 sidecar (docs/engine/NATIVE-TASKS item 25).
#
# gbboot-test.ps1 only pins this route as SATURATED at SCRIPTCAP (64): direct
# CCECL stops before a recordable 65th effect, so 64 is a ceiling, not a count.
# CCFLOW replays past that boundary into <effect>.GBS; the sidecar record count
# N is the measurement.
#
# Method: (1) run the real GBBOOT /E /X /A 4 /B 34 with a stand-in CCFLOW.COM
# (hand-assembled, no native/src edit) that only writes its own command tail to
# TAIL.TXT -- that tail IS GBBOOT's CCECL tail for the route.  (2) run the real
# CCFLOW and the real direct CCECL with that tail (effect path swapped).
# (3) CCEFX the CCFLOW result and two truncated-sidecar mutations.
# Assertions throw; the RESULT line is last and unreachable unless all hold.
# Coab data: $env:GOLDBOX_COAB_DATA, else <root>\coab_extracted\Data; SKIP if absent.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccflow-coab-count-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')

$coabData = $env:GOLDBOX_COAB_DATA
if (-not $coabData) { $coabData = Join-Path $root 'coab_extracted\Data' }
$need = @('ECL4.DAX', 'GEO4.DAX', 'WALLDEF4.DAX', '8X8D1.DAX', '8X8D4.DAX')
if (-not (Test-Path $dosbox)) { Write-Output 'SKIP: CCFLOW CoAB count (DOSBox.exe absent)'; return }
foreach ($f in $need) {
  if (-not (Test-Path (Join-Path $coabData $f))) {
    Write-Output "SKIP: CCFLOW CoAB /A 4 /B 34 count (coab_extracted\Data $f absent)"
    return
  }
}

& (Join-Path $native 'build.ps1') -Target engine | Out-Null
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
$t1 = Join-Path $run 'tools1'
$t2 = Join-Path $run 'tools2'
New-Item -ItemType Directory -Force $t1, $t2 | Out-Null
foreach ($c in (Get-ChildItem (Join-Path $build '*.com'))) {
  Copy-Item $c.FullName (Join-Path $t1 $c.Name.ToUpper()) -Force
}
# Stand-in CCFLOW: create TAIL.TXT, write [81h .. 81h+len), close, exit 0.
[byte[]]$fake = @(
  0xB4,0x3C, 0x31,0xC9, 0xBA,0x20,0x01, 0xCD,0x21, 0x89,0xC3,
  0x0F,0xB6,0x0E,0x80,0x00, 0xBA,0x81,0x00, 0xB4,0x40, 0xCD,0x21,
  0xB4,0x3E, 0xCD,0x21, 0xB8,0x00,0x4C, 0xCD,0x21) + [Text.Encoding]::ASCII.GetBytes("TAIL.TXT`0")
[IO.File]::WriteAllBytes((Join-Path $t1 'CCFLOW.COM'), $fake)
foreach ($n in @('CCECL.COM', 'CCFLOW.COM', 'CCEFX.COM')) {
  Copy-Item (Join-Path $build $n.ToLower()) (Join-Path $t2 $n) -Force
}

$mount = New-RetailStage -Source $coabData -Name 'coab-count' -Fresh
function Invoke-Guest([string]$Name, [string]$ToolDir, [string]$Cmds) {
  $conf = Join-Path $run "_$Name.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$ToolDir"
mount D "$mount"
D:
$Cmds
exit
"@ | Set-Content -Path $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(240000)) { try { $p.Kill() } catch {}; throw "DOSBox did not exit during $Name" }
}
function U16([byte[]]$b, [int]$o) { [BitConverter]::ToUInt16($b, $o) }

# --- stage 1: capture GBBOOT's tail -----------------------------------------
Invoke-Guest 'capture' $t1 'C:\GBBOOT /E /X /A 4 /B 34'
$tailFile = Join-Path $mount 'TAIL.TXT'
if (-not (Test-Path $tailFile)) { throw 'GBBOOT never launched CCFLOW: no TAIL.TXT captured' }
$tail = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($tailFile)).TrimEnd("`r", "`n")
if ($tail -notmatch '\b34\b') { throw "captured tail does not name block 34: [$tail]" }
if ($tail -notmatch ' /E \S+\s*$') { throw "captured tail has no trailing /E effect path: [$tail]" }
$tailFlow = $tail -replace ' /E \S+\s*$', ' /E _CF.EFX'
$tailCtrl = $tail -replace ' /E \S+\s*$', ' /E _CT.EFX'
foreach ($s in '_CF.EFX', '_CF.GBS', '_CT.EFX', '_CT.GBS', '_M1.EFX', '_M1.GBS', '_M2.EFX', '_M2.GBS') {
  Remove-Item (Join-Path $mount $s) -ErrorAction SilentlyContinue
}

# --- stage 2: real CCFLOW and direct CCECL on the same tail ------------------
Invoke-Guest 'replay' $t2 ("C:\CCFLOW$tailFlow > C:\FLOW.TXT`r`nC:\CCECL$tailCtrl > C:\CTRL.TXT")
$cf = Join-Path $mount '_CF.EFX'; $gs = Join-Path $mount '_CF.GBS'
$ct = Join-Path $mount '_CT.EFX'
if (-not (Test-Path $cf)) { throw 'CCFLOW produced no effect file' }
if (-not (Test-Path $gs)) { throw 'CCFLOW produced no GBSL sidecar for /A 4 /B 34' }
if (-not (Test-Path $ct)) { throw 'direct CCECL control produced no effect file' }
if (Test-Path (Join-Path $mount '_CT.GBS')) { throw 'direct CCECL control unexpectedly produced a sidecar' }

$eff = [IO.File]::ReadAllBytes($cf); $side = [IO.File]::ReadAllBytes($gs); $ctl = [IO.File]::ReadAllBytes($ct)
if ([Text.Encoding]::ASCII.GetString($eff, 0, 4) -ne 'GBEF') { throw 'CCFLOW effect is not GBEF' }
if (((U16 $eff 6) -band 0x0100) -eq 0) { throw 'FX_HAVE_SIDECAR (0100h) not set on the CCFLOW effect' }
if (((U16 $ctl 6) -band 0x0100) -ne 0) { throw 'direct CCECL control has FX_HAVE_SIDECAR set' }
# The route prints long PRINT text, so CCFLOW publishes GBSL v2 (v1's fixed
# records plus a packed-text extension); the u16 record count at +6 is the same
# field in both versions, and the fixed records always occupy 8+54*N bytes.
if ([Text.Encoding]::ASCII.GetString($side, 0, 4) -ne 'GBSL') { throw 'sidecar is not GBSL' }
$ver = U16 $side 4
if ($ver -ne 1 -and $ver -ne 2) { throw "unexpected GBSL version $ver" }
$N = U16 $side 6
if ($ver -eq 1 -and $side.Length -ne 8 + 54 * $N) { throw "GBSL v1 extent $($side.Length) != 8+54*$N" }
if ($ver -eq 2 -and $side.Length -le 8 + 54 * $N) { throw "GBSL v2 has no extension after the $N fixed records" }
if ($N -le 64) { throw "GBSL count N=$N is not beyond SCRIPTCAP 64 -- route not saturated or replay dropped records" }
# Control: direct CCECL stopped at the cap with exactly 64 retained records.
$sx = 2246
if ([Text.Encoding]::ASCII.GetString($ctl, $sx, 4) -ne 'GBSX') { throw 'control has no GBSX at offset 2246' }
if ((U16 $ctl ($sx + 4)) -ne 64) { throw "control GBSX count $((U16 $ctl ($sx+4))) != 64 (cap)" }
$drefRows = 0
for ($i = 0; $i -lt 64; $i++) {
  $ev = $sx + 6 + $i * 20; $tx = $sx + 6 + 64 * 20 + $i * 34
  $so = 8 + $i * 54
  for ($b = 0; $b -lt 20; $b++) { if ($ctl[$ev + $b] -ne $side[$so + $b]) { throw "GBSL record $i event byte $b differs from direct-CCECL GBSX" } }
  $textDiff = $false
  for ($b = 0; $b -lt 34; $b++) { if ($ctl[$tx + $b] -ne $side[$so + 20 + $b]) { $textDiff = $true } }
  if ($textDiff) {
    # The ONLY sanctioned difference: a long PRINT/PRINTCLEAR (0x11/0x12) whose
    # CCFLOW-marked child stored a bounded DREF (FF FF 'GBPX') where direct
    # CCECL keeps the historical inline 32-character prefix.
    $op = U16 $side $so
    $isDref = ($side[$so + 20] -eq 0xFF -and $side[$so + 21] -eq 0xFF -and [Text.Encoding]::ASCII.GetString($side, $so + 22, 4) -eq 'GBPX')
    if (($op -ne 0x11 -and $op -ne 0x12) -or -not $isDref -or $ctl[$tx + 2] -eq 0) {
      throw "GBSL record $i text differs from direct-CCECL GBSX and is not a long-text DREF (op=$op)"
    }
    $drefRows++
  }
}
if ($drefRows -lt 1) { throw 'expected at least one long-text DREF row in the first 64 (control would be vacuous about text)' }
for ($i = 64; $i -lt $N; $i++) { if ((U16 $side (8 + $i * 54)) -eq 0) { throw "GBSL record $i has a zero opcode" } }

# --- stage 3: CCEFX accepts the whole sidecar, rejects truncations -----------
Copy-Item $cf (Join-Path $mount '_M1.EFX'); Copy-Item $cf (Join-Path $mount '_M2.EFX')
[IO.File]::WriteAllBytes((Join-Path $mount '_M1.GBS'), $side[0..($side.Length - 28)])
[IO.File]::WriteAllBytes((Join-Path $mount '_M2.GBS'), $side[0..(8 + 54 * $N - 28)])
Invoke-Guest 'efx' $t2 "C:\CCEFX D:\_CF.EFX C:\GOOD.TXT > C:\GOODO.TXT`r`nC:\CCEFX D:\_M1.EFX C:\M1.TXT > C:\M1O.TXT`r`nC:\CCEFX D:\_M2.EFX C:\M2.TXT > C:\M2O.TXT"
function Slurp([string]$n) { $p = Join-Path $t2 $n; if (Test-Path $p) { Get-Content $p -Raw } else { '' } }
$good = (Slurp 'GOODO.TXT') + (Slurp 'GOOD.TXT')
$want = 'GBSL count={0:X4}' -f $N
if ($good -notmatch [regex]::Escape($want)) { throw "CCEFX on the intact sidecar did not report '$want'" }
foreach ($m in 'M1', 'M2') {
  $out = (Slurp "${m}O.TXT") + (Slurp "$m.TXT")
  if ($out -notmatch 'CCEFX: bad or truncated') { throw "CCEFX did not reject truncated sidecar $m" }
}
Write-Output "MEASURED: CoAB /A 4 /B 34 true host-effect count N=$N (GBSL v$ver; direct CCECL cap 64); tail=[$tail]"
Write-Output "RESULT: CCFLOW CoAB /A 4 /B 34 GBSL count N=$N > 64, first 64 == direct GBSX, truncated sidecar rejected PASS"
