# GBBOOT DoK GBDJ direct-DAMAGE journal boot-time recovery flow.
#
# Plan: docs/engine/PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md section 28.5
# (normative design) and section 28.6 (the verbatim dispatch brief this
# script implements, step 9b). Spec: docs/engine/direct-damage-journal-v1.md
# "States and recovery" + amendments J and K.
#
# WHAT THIS PROVES
# -----------------
# native/src/gbboot.asm's run_native_preview now runs a boot-time `/R
# <roster>` recovery call against CCHOST for every DoK title, right after
# shrink_mem and before the checkpoint_load branch (gate 35). This is the
# ONLY place in the engine that can ever discover and recover a torn
# direct-DAMAGE journal left by a crashed prior `/D ... /J` write, because
# CCFLOW/CCECL (which would otherwise delete or advance the GBSL/effect the
# journal's G6 check depends on) has not run yet at that point in boot.
#
# This script is GBBOOT-driven throughout (never a CCHOST-direct session),
# because GM1/GM2 (see the mutation table in plan 28.5) mutate exactly the
# GBBOOT code that builds the `/N`/`/D ... /J`/boot `/R` tails -- a
# CCHOST-direct harness would bypass the code under test entirely.
#
# Five sessions:
#   0. Capture a REAL unflagged v9 GBSX effect (plan 29; 28.5 said v14) via
#      CCFLOW/CCECL on DoK ECL1 #17's short, picture-only terminal route,
#      then hand-inject one targeted DAMAGE record
#      into it (E1). This is the vehicle every later session replays via a
#      stub CCFLOW, so GBBOOT's own `.ecl_return` -> CCBIND `/N` bind ->
#      `/D ... /J` runs on a real, nonzero-mask, fixed-GBSX effect.
#   1. Baseline: E1 through the stub, real CCHOST. Producer witness: the
#      damage journal is written, applied, and committed in one boot.
#   2. Crash: E1 through the stub, a CCHOST built with
#      CCHOST_TEST_GBDJ_D_CRASH=6 (exits right after the roster write, before
#      damage_journal_commit) -- produces a genuine PREPARED journal plus a
#      real torn CHRDATA2.GAM post-image.
#   3. Recover: the same torn stage, the stub, the REAL CCHOST restored.
#      Boot-time gate 35's `/R` must recover before CCFLOW/CCHOST's own `/D`
#      re-applies -- proven by line order, not just the exit code.
#   4. Locked: recreate the tear fresh, restore real CCHOST, then flip one
#      byte of the just-torn `_GBECL.BIN` (which G6 streams and compares
#      against the copy retained inside the .GDJ at PREPARE time -- see
#      cchost_damage_journal.inc's damage_journal_validate_g6). Boot-time
#      `/R` must now fail closed at gate 35 with zero writes, proving the
#      stub -- and so the ECL step -- never got a chance to run. Session 3 is
#      this session's control: the identical tear, minus the tamper, is
#      green.
#
# GIT SAFETY (CLAUDE.md, and this task's own brief): this script never
# touches native/src/cchost*.asm/.inc (read via `nasm -f bin` only, never
# edited), never mounts or writes the retail "Death Knights of Krynn" folder
# itself (every DOSBox session mounts a New-RetailStage mirror), and never
# writes the tracked native/flow-status.json.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$nasm = 'C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK journal flow (DOSBox.exe absent)'
  exit 0
}

# Same required-file list as native/gbdok-flow-test.ps1's baseline route,
# which this script's own route (`C:\GBBOOT /E /X`) is taken from verbatim.
foreach ($name in @(
    'DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX',
    'SAVE\CHRDATA1.GAM', 'SAVE\CHRDATA2.GAM', 'SAVE\CHRDATA3.GAM',
    'SAVE\CHRDATA4.GAM', 'SAVE\CHRDATA5.GAM', 'SAVE\CHRDATA6.GAM')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DoK journal flow ($name absent)"
    exit 0
  }
}

if (-not (Test-Path $nasm)) {
  $g = Get-Command nasm -ErrorAction SilentlyContinue
  if ($g) { $nasm = $g.Source } else { throw 'NASM not found for the stub CCFLOW / crash CCHOST builds' }
}

. (Join-Path $native 'retail-stage.ps1')
. (Join-Path $native 'dosbox-smoke.ps1')

# ---------------------------------------------------------------------------
# Helpers. Every one is defined here, above its first call below.
# ---------------------------------------------------------------------------

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Set-U16([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  [BitConverter]::GetBytes([UInt16]$Value).CopyTo($Bytes, $Offset)
}

# Copied verbatim from native/cchost-test.ps1 (New-GbdpDamageEvent at :2874,
# New-GbdpEventRecordBytes at :2882), per plan 28.5's instruction to reuse
# them for the injected -Target 2 -Value 7 record. Provenance only; this
# script never sources cchost-test.ps1 itself (CLAUDE.md: that file must not
# be touched, and importing it would also pull in its own DOSBox-driving
# code, which this script does not want).
function New-GbdpDamageEvent {
  param([int]$Target = 0, [switch]$AllTarget, [Parameter(Mandatory)][int]$Value)
  return @{ Target = $Target; AllTarget = [bool]$AllTarget; Value = $Value }
}
function New-GbdpEventRecordBytes([hashtable]$Event) {
  $rec = New-Object byte[] 20
  $rec[0] = 0x2E
  if ($Event.AllTarget) {
    Set-U16 $rec 2 5
    Set-U16 $rec 4 0xE0
  } else {
    Set-U16 $rec 2 7
    Set-U16 $rec 4 0x80
  }
  Set-U16 $rec 6 $Event.Value
  Set-U16 $rec 8 1
  Set-U16 $rec 10 0
  if (-not $Event.AllTarget) {
    Set-U16 $rec 12 0x80
    Set-U16 $rec 14 1
    Set-U16 $rec 16 $Event.Target
  }
  return ,$rec
}

function Assert-BytesEqual([byte[]]$Want, [byte[]]$Got, [string]$Label) {
  if ($Want.Length -ne $Got.Length) { throw "$Label length differs: want $($Want.Length) got $($Got.Length)" }
  for ($i = 0; $i -lt $Want.Length; $i++) {
    if ($Want[$i] -ne $Got[$i]) { throw "$Label byte $i differs: want $($Want[$i]) got $($Got[$i])" }
  }
}

# Narrow, named-path snapshot (never a whole-directory listing): the whole
# $cbin directory accumulates a fresh OUT.TXT/.STA pair every session, so a
# directory-wide compare would spuriously see "entries appeared" on the very
# run under test. Bytes + Length + LastWriteTimeUtc together catch both a
# byte-identical rewrite (goldbox-write-oracle-vs-diff-oracle) and a
# create-then-delete of any named path.
function Get-FileSnapshot([string[]]$Paths) {
  $out = @{}
  foreach ($p in $Paths) {
    if (Test-Path -LiteralPath $p) {
      $fi = Get-Item -LiteralPath $p
      $out[$p] = [PSCustomObject]@{
        Length           = $fi.Length
        LastWriteTimeUtc = $fi.LastWriteTimeUtc
        Bytes            = [IO.File]::ReadAllBytes($p)
      }
    } else {
      $out[$p] = $null
    }
  }
  return $out
}
function Assert-FileSnapshotsEqual($Before, $After, [string]$Label) {
  foreach ($p in $Before.Keys) {
    $b = $Before[$p]; $a = $After[$p]
    if ($null -eq $b -and $null -eq $a) { continue }
    if ($null -eq $b -or $null -eq $a) { throw "$Label`: '$p' existence changed (before=$($null -ne $b) after=$($null -ne $a))" }
    if ($b.Length -ne $a.Length) { throw "$Label`: '$p' length changed ($($b.Length) -> $($a.Length))" }
    if ($b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) { throw "$Label`: '$p' mtime changed ($($b.LastWriteTimeUtc) -> $($a.LastWriteTimeUtc))" }
    Assert-BytesEqual $b.Bytes $a.Bytes "$Label '$p'"
  }
}

# Recursive size+mtime listing of the REAL retail folder, including directory
# mtimes (a create-then-delete inside a directory moves only the directory's
# own mtime -- goldbox-write-oracle-vs-diff-oracle). Used once at the very
# start and once at the very end of this script; every DOSBox session in
# between mounts a New-RetailStage mirror, never $game itself.
function Get-RetailSnapshot([string]$Rootdir) {
  $rootFull = (Resolve-Path -LiteralPath $Rootdir).Path
  return Get-ChildItem -LiteralPath $rootFull -Recurse -Force | ForEach-Object {
    [PSCustomObject]@{
      Path   = $_.FullName.Substring($rootFull.Length)
      IsDir  = $_.PSIsContainer
      Length = if ($_.PSIsContainer) { -1 } else { $_.Length }
      Mtime  = $_.LastWriteTimeUtc
    }
  }
}

# Deletes every native GBBOOT/CCHOST scratch artifact in $cbin so a prior
# session's state cannot leak into the next boot -- plan 28.5's own list,
# gbdok-flow-test.ps1's plus _GBECL.BIN, CCBIND's .DOP/.IDN sidecars, and the
# GBDJ journal plus its .GDN sibling. NEVER deletes _JSTUB.BIN: sessions 1-4
# all replay the same E1 payload the stub reads from it.
function Remove-JournalFlowState([string]$Dir) {
  foreach ($n in @(
      '_GBPARTY.GBP', '_GBSEED.BIN', '_GBECL.TXT', '_GBVIEW.RAW', '_GBSTEP.BIN', '_GBSESS.GBS',
      '_GBECL.BIN', '_GBECL.GBS', '_GBECL.GBT', '_GBECL.GBP',
      '_GBECL.IDN', '_GBECL.DOP', '_GBPARTY.GDJ', '_GBPARTY.GDN')) {
    Remove-Item -LiteralPath (Join-Path $Dir $n) -Force -ErrorAction SilentlyContinue
  }
}

# Route uses source ECL1 #17's cold picture/EXIT path
# (`C:\GBBOOT /E /X /A 1 /B 17` from D:), captured to C:\<Name>.TXT and
# followed by an `if errorlevel` chain
# that writes a numeric C:\<Name>.STA -- 0 (normal exit), 1 (CCHOST-only
# failure exit code, never seen at this top level) or 3 (GBBOOT's own
# `.nativefail` 4C03h, native/src/gbboot.asm :193-200, the SAME exit code
# for every failing gate; the gate number is legible only in OUT.TXT text).
function New-JournalFlowConf([string]$Path, [string]$Cbin, [string]$Stage, [string]$OutName) {
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$Cbin"
mount D "$Stage"
D:
C:\GBBOOT /E /X /A 1 /B 17 > C:\$OutName.TXT
if errorlevel 3 goto e3
if errorlevel 1 goto e1
echo 0>C:\$OutName.STA
goto done
:e3
echo 3>C:\$OutName.STA
goto done
:e1
echo 1>C:\$OutName.STA
:done
exit
"@ | Set-Content -Path $Path -Encoding ASCII
}

function Invoke-JournalFlowSession([string]$Cbin, [string]$Stage, [string]$Name) {
  $conf = Join-Path $run "_$Name.conf"
  New-JournalFlowConf -Path $conf -Cbin $Cbin -Stage $Stage -OutName $Name
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) {
    Stop-Process -Id $p.Id -Force
    throw "GBBOOT DoK journal flow session $Name timed out"
  }
  $outText = Get-Content (Join-Path $Cbin "$Name.TXT") -Raw -ErrorAction SilentlyContinue
  $staRaw = Get-Content (Join-Path $Cbin "$Name.STA") -Raw -ErrorAction SilentlyContinue
  $sta = if ($null -ne $staRaw) { $staRaw.Trim() } else { $null }
  return [PSCustomObject]@{ Out = $outText; Sta = $sta }
}

# ---------------------------------------------------------------------------
# Setup: isolated tool dir ($run/$cbin, never native\build itself), engine
# build, stub CCFLOW, PK6 crash CCHOST.
# ---------------------------------------------------------------------------
$retailBefore = Get-RetailSnapshot $game

$run = Join-Path $build 'gbdok-journal'
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

& (Join-Path $native 'build.ps1') -Target engine
if ($LASTEXITCODE -ne 0) { throw 'engine build failed' }

# Isolated tool dir: mount C: at $cbin, never at native\build. Every other
# DoK flow mounts native\build as C:, so a PREPARED _GBPARTY.GDJ left there
# by this script would make every one of them recover at boot, or fail at
# gate 35 (plan 28.5).
$cbin = Join-Path $run 'cbin'
New-Item -ItemType Directory -Force $cbin | Out-Null
Get-ChildItem (Join-Path $build '*.COM') | ForEach-Object { Copy-Item $_.FullName (Join-Path $cbin $_.Name) -Force }

$realCcflowBackup = Join-Path $run 'CCFLOW.REAL.COM'
Copy-Item (Join-Path $cbin 'CCFLOW.COM') $realCcflowBackup -Force
$realCchostBackup = Join-Path $run 'CCHOST.REAL.COM'
Copy-Item (Join-Path $cbin 'CCHOST.COM') $realCchostBackup -Force
$realCchostSha = Get-Sha256 $realCchostBackup
Write-Output "engine build OK; real CCFLOW.COM and CCHOST.COM backed up (CCHOST SHA-256 $realCchostSha)"

# Stub CCFLOW: a here-string source, assembled into $run, NEVER placed under
# native/src (that would move the capacity manifest and flow-status
# native-source hashes -- plan 28.5). It ignores its own command tail
# entirely and always copies C:\_JSTUB.BIN over C:\_GBECL.BIN.
$stubAsm = @'
; Stub CCFLOW for native/gbdok-journal-flow-test.ps1 sessions 1-4 (plan
; docs/engine/PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md section 28.5).
; Deliberately NOT under native/src. Ignores its command tail; always copies
; C:\_JSTUB.BIN to C:\_GBECL.BIN, standing in for a real CCFLOW/CCECL run
; whose GBEF/GBSX payload this test controls exactly. Exits 4C00h on
; success, 4C01h on any DOS error.
org 100h
section .text
start:
        mov     ax, 3D00h
        mov     dx, jstubname
        int     21h
        jc      fail
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 6000
        mov     dx, buf
        int     21h
        jc      fail
        mov     [readlen], ax
        mov     ah, 3Eh
        int     21h
        jc      fail
        mov     dx, gbeclname
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      fail
        mov     bx, ax
        mov     ah, 40h
        mov     cx, [readlen]
        mov     dx, buf
        int     21h
        jc      fail
        mov     ah, 3Eh
        int     21h
        mov     ax, 4C00h
        int     21h
fail:
        mov     ax, 4C01h
        int     21h
jstubname db 'C:\_JSTUB.BIN', 0
gbeclname db 'C:\_GBECL.BIN', 0
readlen   dw 0
buf:      times 6000 db 0
'@
$stubAsmPath = Join-Path $run 'ccflow_stub.asm'
Set-Content -Path $stubAsmPath -Value $stubAsm -NoNewline -Encoding ASCII
$stubCom = Join-Path $run 'CCFLOW_STUB.COM'
& $nasm -f bin $stubAsmPath -o $stubCom
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $stubCom)) { throw 'nasm failed to assemble the stub CCFLOW' }
Write-Output "stub CCFLOW assembled: $stubCom ($((Get-Item $stubCom).Length) bytes)"

# Crash CCHOST: the PK6 build (cchost-test.ps1:3913's own recipe), output
# into $run. native/src/cchost.asm is only ever READ by nasm here -- never
# written.
$cchostSrc = Join-Path $native 'src\cchost.asm'
$cchostSrcSha = Get-Sha256 $cchostSrc
$srcInclude = (Join-Path $native 'src') + '\'
$crashCom = Join-Path $run 'CCHOST_CRASH.COM'
& $nasm -f bin -I $srcInclude -D CCHOST_TEST_GBDJ_D_CRASH=6 $cchostSrc -o $crashCom
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $crashCom)) { throw 'nasm failed to assemble the PK6 crash CCHOST' }
if ((Get-Sha256 $cchostSrc) -ne $cchostSrcSha) { throw 'native/src/cchost.asm changed during the crash-CCHOST build -- this must never happen' }
Write-Output "crash CCHOST (PK6, CCHOST_TEST_GBDJ_D_CRASH=6) assembled: $crashCom ($((Get-Item $crashCom).Length) bytes); native/src/cchost.asm SHA-256 unchanged ($cchostSrcSha)"

$dokHp = @(95, 102, 78, 52, 58, 53)   # undamaged retail byte 40/214 values, equal in these samples

# ---------------------------------------------------------------------------
# Session 0: capture a real v9 GBSX effect via the real CCFLOW, then inject
# one targeted DAMAGE record (-Target 2 -Value 7) to build E1.
# ---------------------------------------------------------------------------
Remove-JournalFlowState $cbin
Copy-Item $realCcflowBackup (Join-Path $cbin 'CCFLOW.COM') -Force
Copy-Item $realCchostBackup (Join-Path $cbin 'CCHOST.COM') -Force
$stage = New-RetailStage -Source $game -Name 'dok-journal' -Fresh
$r0 = Invoke-JournalFlowSession $cbin $stage 'S0'
if ($r0.Sta -ne '0') { throw "session 0 (capture) did not exit 0: STA=$($r0.Sta) OUT=$($r0.Out)" }
$e0Path = Join-Path $cbin '_GBECL.BIN'
if (-not (Test-Path $e0Path)) { throw 'session 0 (capture) did not produce _GBECL.BIN' }
[byte[]]$e0 = [IO.File]::ReadAllBytes($e0Path)
# Plan section 29 (checkpoint 17): this real short-text `/E /X` route's terminal effect
# is CCFLOW's FIXED v9 envelope (5750 bytes, fxstatus 0, FX_HAVE_SIDECAR 0100h
# clear), not a v14 menu-yield record. CCHOST's apply_effect_damage_roster
# accepts exactly that shape on its `.v9_terminal` -> `.fixed` path and scans
# the in-file GBSX at 2246/2250/2252 -- the same offsets v14 uses -- and
# damage_journal_produce journals a v9 extent (GBEF_V9_LEN). So only the
# envelope constants change; the record layout and every later session do not.
if ($e0.Length -ne 5750) { throw "STOP AND REPORT: session 0 E0 length is $($e0.Length), plan 29 requires 5750 (GBEF v9)" }
if ([Text.Encoding]::ASCII.GetString($e0, 0, 4) -ne 'GBEF') { throw 'STOP AND REPORT: session 0 E0 has no GBEF magic' }
$e0Version = [BitConverter]::ToUInt16($e0, 4)
if ($e0Version -ne 9) { throw "STOP AND REPORT: session 0 E0 version is $e0Version, plan 29 requires 9" }
$e0Flags = [BitConverter]::ToUInt16($e0, 6)
if (($e0Flags -band 0x0100) -ne 0) { throw ("STOP AND REPORT: session 0 E0 fxflags 0x{0:X4} has FX_HAVE_SIDECAR set; plan 29 requires the fixed in-file GBSX path" -f $e0Flags) }
if (Test-Path (Join-Path $cbin '_GBECL.GBS')) { throw 'STOP AND REPORT: session 0 unexpectedly published a GBSL sidecar' }
$e0Status = [BitConverter]::ToUInt16($e0, 8)
if ($e0Status -ne 0) { throw "STOP AND REPORT: session 0 E0 fxstatus is $e0Status, plan 29 requires 0 (terminal)" }
if ([Text.Encoding]::ASCII.GetString($e0, 2246, 4) -ne 'GBSX') { throw 'STOP AND REPORT: session 0 E0 has no GBSX magic at offset 2246' }
$e0Count = [BitConverter]::ToUInt16($e0, 2250)
if ($e0Count -ge 64) { throw "STOP AND REPORT: session 0 E0 GBSX count is $e0Count, plan 29 requires < 64" }
# The null that makes session 1's journal attributable to the injection
# alone: the natural route's own GBSX carries NO DAMAGE (op 2Eh) record, its
# `/D /J` therefore journals a zero mask (damage_journal_produce's `.none`),
# and "CCHOST: effect damage applied" in S0.TXT is the zero-mask success line
# (cchost.asm .journal_success), NOT a live damage application.
for ($i = 0; $i -lt $e0Count; $i++) {
  if ($e0[2252 + 20 * $i] -eq 0x2E) { throw "STOP AND REPORT: session 0 E0 already carries a DAMAGE record at GBSX index $i" }
}
if (Test-Path (Join-Path $cbin '_GBPARTY.GDJ')) { throw 'session 0: _GBPARTY.GDJ exists after a zero-mask natural route' }
for ($i = 1; $i -le 6; $i++) {
  Assert-BytesEqual ([IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$i.GAM"))) ([IO.File]::ReadAllBytes((Join-Path $stage "SAVE\CHRDATA$i.GAM"))) "session 0 zero-mask CHRDATA$i.GAM"
}
if ($r0.Out -notmatch [regex]::Escape('CCHOST: effect damage journal absent')) { throw "session 0: missing boot /R 'journal absent' line. OUT=$($r0.Out)" }
Write-Output ("session 0 (capture) OK: E0 is GBEF v9, 5750 bytes, fxflags 0x{0:X4} (no sidecar), fxstatus 0, GBSX at 2246, count=$e0Count, no DAMAGE record; zero-mask /D /J left no .GDJ and every CHRDATA*.GAM unchanged" -f $e0Flags)

[byte[]]$e1 = $e0.Clone()
Set-U16 $e1 2250 ($e0Count + 1)
$injected = New-GbdpEventRecordBytes (New-GbdpDamageEvent -Target 2 -Value 7)
[Array]::Copy($injected, 0, $e1, 2252 + 20 * $e0Count, 20)
$jstubPath = Join-Path $cbin '_JSTUB.BIN'
[IO.File]::WriteAllBytes($jstubPath, $e1)
Write-Output "E1 built: E0 plus one injected DAMAGE record (-Target 2 -Value 7) at offset $(2252 + 20*$e0Count), count $e0Count -> $($e0Count+1); written to _JSTUB.BIN"

# Sessions 1-4 all replay E1 through the stub CCFLOW.
Copy-Item $stubCom (Join-Path $cbin 'CCFLOW.COM') -Force

# ---------------------------------------------------------------------------
# Session 1: baseline (producer witness). Fresh stage, stub + E1, real CCHOST.
# ---------------------------------------------------------------------------
Remove-JournalFlowState $cbin
Copy-Item $realCchostBackup (Join-Path $cbin 'CCHOST.COM') -Force
$stage = New-RetailStage -Source $game -Name 'dok-journal' -Fresh
$r1 = Invoke-JournalFlowSession $cbin $stage 'S1'
if ($r1.Sta -ne '0') { throw "session 1 (baseline) did not exit 0: STA=$($r1.Sta) OUT=$($r1.Out)" }
if ($r1.Out -notmatch [regex]::Escape('CCHOST: effect damage journal absent')) {
  throw "session 1: missing boot /R 'journal absent' line. OUT=$($r1.Out)"
}
if ($r1.Out -notmatch [regex]::Escape('CCHOST: effect damage applied')) {
  throw "session 1: missing 'damage applied' line. OUT=$($r1.Out)"
}
if (-not (Test-Path (Join-Path $cbin '_GBECL.DOP'))) { throw 'session 1: _GBECL.DOP (CCBIND /N identity sidecar) not present' }
$gdj1Path = Join-Path $cbin '_GBPARTY.GDJ'
if (-not (Test-Path $gdj1Path)) { throw 'session 1: _GBPARTY.GDJ not present' }
[byte[]]$gdj1 = [IO.File]::ReadAllBytes($gdj1Path)
if ([Text.Encoding]::ASCII.GetString($gdj1, 0, 4) -ne 'GBDJ' -or [BitConverter]::ToUInt16($gdj1, 6) -ne 1) {
  throw "session 1: _GBPARTY.GDJ is not COMMITTED (state=$([BitConverter]::ToUInt16($gdj1,6)))"
}
for ($i = 1; $i -le 6; $i++) {
  $src = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$i.GAM"))
  $dst = [IO.File]::ReadAllBytes((Join-Path $stage "SAVE\CHRDATA$i.GAM"))
  if ($i -eq 2) {
    $wantCurrentHp = $src[214] - 7
    if ($dst[40] -ne $src[40] -or $dst[214] -ne $wantCurrentHp) {
      throw "session 1: CHRDATA2.GAM must preserve max HP at 40 and drop current HP at 214 by 7 (got $($dst[40])/$($dst[214]), want $($src[40])/$wantCurrentHp)"
    }
  } else {
    for ($j = 0; $j -lt 216; $j++) {
      if ($src[$j] -ne $dst[$j]) { throw "session 1: CHRDATA$i.GAM byte $j unexpectedly changed (retail source is read-only via New-RetailStage, so this compares the STAGE copy)" }
    }
  }
}
Write-Output "session 1 (baseline) OK: journal absent -> applied -> committed in one boot; CHRDATA2.GAM max HP byte 40 preserved at $($dokHp[1]), current HP byte 214 dropped by 7; CHRDATA1,3-6.GAM unchanged"

# Snapshot S1: the converged post-damage state every later session's
# recovery must reproduce byte-for-byte.
$s1Paths = @((Join-Path $cbin '_GBPARTY.GBP')) + (1..6 | ForEach-Object { Join-Path $stage "SAVE\CHRDATA$_.GAM" })
$s1Snapshot = Get-FileSnapshot $s1Paths

# ---------------------------------------------------------------------------
# Session 2: crash, produced by GBBOOT's own tail. Fresh stage, stub + E1,
# the PK6 crash CCHOST.
# ---------------------------------------------------------------------------
Copy-Item $crashCom (Join-Path $cbin 'CCHOST.COM') -Force
Remove-JournalFlowState $cbin
$stage = New-RetailStage -Source $game -Name 'dok-journal' -Fresh
$r2 = Invoke-JournalFlowSession $cbin $stage 'S2'
if ($r2.Sta -ne '3') { throw "session 2 (crash) expected errorlevel 3, got $($r2.Sta). OUT=$($r2.Out)" }
if ($r2.Out -notmatch [regex]::Escape('GBBOOT: native preview failed; gate 11')) {
  throw "session 2: missing 'gate 11' line. OUT=$($r2.Out)"
}
$gdj2Path = Join-Path $cbin '_GBPARTY.GDJ'
if (-not (Test-Path $gdj2Path)) { throw 'session 2: _GBPARTY.GDJ not present after the crash' }
[byte[]]$gdj2 = [IO.File]::ReadAllBytes($gdj2Path)
if ([BitConverter]::ToUInt16($gdj2, 6) -ne 0) { throw "session 2: _GBPARTY.GDJ is not PREPARED (state=$([BitConverter]::ToUInt16($gdj2,6)))" }
$torn2 = [IO.File]::ReadAllBytes((Join-Path $stage 'SAVE\CHRDATA2.GAM'))
$src2 = [IO.File]::ReadAllBytes((Join-Path $game 'SAVE\CHRDATA2.GAM'))
if ($torn2[40] -ne $src2[40] -or $torn2[214] -ne ($src2[214] - 7)) {
  throw "session 2: torn CHRDATA2.GAM does not show the PK6 post-image (got $($torn2[40])/$($torn2[214]), want $($src2[40])/$($src2[214]-7))"
}
Write-Output "session 2 (crash) OK: gate 11, errorlevel 3, _GBPARTY.GDJ PREPARED, CHRDATA2.GAM already carries the damaged post-image (the PK6 torn state)"

# Session 3 is the recovery of THIS exact torn stage: delete no file, do not
# refresh the stage.
$stage2 = $stage

# ---------------------------------------------------------------------------
# Session 3: recover. Same torn stage. Real CCHOST restored (by copy + SHA
# check, never git). Stub + E1 unchanged.
# ---------------------------------------------------------------------------
Copy-Item $realCchostBackup (Join-Path $cbin 'CCHOST.COM') -Force
if ((Get-Sha256 (Join-Path $cbin 'CCHOST.COM')) -ne $realCchostSha) { throw 'session 3: restored CCHOST.COM SHA-256 mismatch' }
$r3 = Invoke-JournalFlowSession $cbin $stage2 'S3'
if ($r3.Sta -ne '0') { throw "session 3 (recover) expected errorlevel 0, got $($r3.Sta). OUT=$($r3.Out)" }
$recIdx = $r3.Out.IndexOf('CCHOST: effect damage recovered')
$appIdx = $r3.Out.IndexOf('CCHOST: effect damage applied')
if ($recIdx -lt 0) { throw "session 3: missing 'effect damage recovered' line. OUT=$($r3.Out)" }
if ($appIdx -lt 0) { throw "session 3: missing 'effect damage applied' line. OUT=$($r3.Out)" }
if ($recIdx -ge $appIdx) { throw "session 3: 'recovered' must precede 'applied' (recIdx=$recIdx appIdx=$appIdx). OUT=$($r3.Out)" }
$gdj3Path = Join-Path $cbin '_GBPARTY.GDJ'
[byte[]]$gdj3 = [IO.File]::ReadAllBytes($gdj3Path)
if ([BitConverter]::ToUInt16($gdj3, 6) -ne 1) { throw "session 3: _GBPARTY.GDJ is not COMMITTED after recover (state=$([BitConverter]::ToUInt16($gdj3,6)))" }
$s3Paths = @((Join-Path $cbin '_GBPARTY.GBP')) + (1..6 | ForEach-Object { Join-Path $stage2 "SAVE\CHRDATA$_.GAM" })
$s3Snapshot = Get-FileSnapshot $s3Paths
foreach ($p in $s1Paths) {
  Assert-BytesEqual $s1Snapshot[$p].Bytes $s3Snapshot[$p].Bytes "session 3 vs S1 '$p'"
}
Write-Output "session 3 (recover) OK: 'recovered' precedes 'applied', errorlevel 0, .GDJ finally COMMITTED, roster + all CHRDATA*.GAM byte-identical to S1"

# ---------------------------------------------------------------------------
# Session 4: locked. Fresh stage, recreate the tear exactly as session 2
# (4a). Restore real CCHOST. Flip one byte of the just-torn _GBECL.BIN, then
# re-affirm _JSTUB.BIN = E1 (which now differs from the tampered file). Run:
# boot-time gate 35 must fail closed, with zero writes.
# ---------------------------------------------------------------------------
Copy-Item $crashCom (Join-Path $cbin 'CCHOST.COM') -Force
Remove-JournalFlowState $cbin
$stage = New-RetailStage -Source $game -Name 'dok-journal' -Fresh
$r4a = Invoke-JournalFlowSession $cbin $stage 'S4A'
if ($r4a.Sta -ne '3') { throw "session 4a (tear recreation) expected errorlevel 3, got $($r4a.Sta). OUT=$($r4a.Out)" }
if ($r4a.Out -notmatch [regex]::Escape('GBBOOT: native preview failed; gate 11')) {
  throw "session 4a: missing 'gate 11' line. OUT=$($r4a.Out)"
}
Write-Output 'session 4a (tear recreation) OK: reproduces session 2 exactly (gate 11, errorlevel 3)'

Copy-Item $realCchostBackup (Join-Path $cbin 'CCHOST.COM') -Force
if ((Get-Sha256 (Join-Path $cbin 'CCHOST.COM')) -ne $realCchostSha) { throw 'session 4: restored CCHOST.COM SHA-256 mismatch' }

# Snapshot the post-4a-setup state (roster, journal, every CHRDATA*.GAM)
# BEFORE the tamper and BEFORE the locked run -- this is what must be
# byte- and mtime-identical afterward.
$s4Paths = @((Join-Path $cbin '_GBPARTY.GBP'), (Join-Path $cbin '_GBPARTY.GDJ')) +
           (1..6 | ForEach-Object { Join-Path $stage "SAVE\CHRDATA$_.GAM" })
$s4Before = Get-FileSnapshot $s4Paths

$eclBinPath = Join-Path $cbin '_GBECL.BIN'
[byte[]]$tampered = [IO.File]::ReadAllBytes($eclBinPath)
if ($tampered.Length -ne 5750) { throw "session 4: pre-tamper _GBECL.BIN is $($tampered.Length) bytes, expected 5750 (GBEF v9, plan 29)" }
$tamperOffset = 100   # inside the 5750-byte v9 extent
$tampered[$tamperOffset] = $tampered[$tamperOffset] -bxor 0xFF
[IO.File]::WriteAllBytes($eclBinPath, $tampered)
$tamperedSha = Get-Sha256 $eclBinPath

# Re-affirm _JSTUB.BIN = E1, which now differs from the tampered _GBECL.BIN
# on disk -- if the stub ran, it would overwrite the tamper with E1.
[IO.File]::WriteAllBytes($jstubPath, $e1)

$r4 = Invoke-JournalFlowSession $cbin $stage 'S4'
if ($r4.Sta -ne '3') { throw "session 4 (locked) expected errorlevel 3, got $($r4.Sta). OUT=$($r4.Out)" }
if ($r4.Out -notmatch [regex]::Escape('GBBOOT: native preview failed; gate 35')) {
  throw "session 4: missing 'gate 35' line. OUT=$($r4.Out)"
}
if ($r4.Out -notmatch [regex]::Escape('CCHOST: invalid host request (result)')) {
  throw "session 4: missing CCHOST /R failure line ('invalid host request (result)'). OUT=$($r4.Out)"
}

$s4After = Get-FileSnapshot $s4Paths
Assert-FileSnapshotsEqual $s4Before $s4After 'session 4 (locked): roster/journal/CHRDATA*.GAM'

if ((Get-Sha256 $eclBinPath) -ne $tamperedSha) {
  throw 'session 4: _GBECL.BIN no longer matches the tampered bytes -- the stub (and so the ECL step) ran when gate 35 should have aborted first'
}
Write-Output "session 4 (locked) OK: gate 35 + CCHOST 'invalid host request (result)' (G6 stream mismatch), errorlevel 3, roster/journal/CHRDATA*.GAM byte- and mtime-identical to the post-4a state, _GBECL.BIN still holds the tampered byte at offset $tamperOffset (proves the stub never ran)"

# ---------------------------------------------------------------------------
# Final retail-folder write proof: size+mtime (including directory mtimes)
# identical before and after every session above. Every DOSBox mount used a
# New-RetailStage mirror; $game itself was never mounted.
# ---------------------------------------------------------------------------
$retailAfter = Get-RetailSnapshot $game
$retailDiff = Compare-Object $retailBefore $retailAfter -Property Path, IsDir, Length, Mtime
if ($retailDiff) {
  foreach ($d in $retailDiff) { Write-Output "retail DoK folder changed: $($d.Path) side=$($d.SideIndicator)" }
  throw 'retail "Death Knights of Krynn" folder changed during this script -- CLAUDE.md forbids writing into game folders'
}
Write-Output "retail DoK folder unchanged: $($retailBefore.Count) filesystem entries, size+mtime (including directory mtimes) identical before/after"

Write-Output 'RESULT: GBBOOT DoK journal flow PASS'
