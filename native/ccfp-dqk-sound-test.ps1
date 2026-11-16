# ccfp-dqk-sound-test.ps1 -- DQK walk sound from the first-person step (CCFP -> CCSND).
#
# DQK.EXE's exploration step (file 0x43B26, called near from 0x441F5 only after the
# passability test) does PlaySound(0x0B) BEFORE the party position advances; id 0x0B is
# SOUNDS.GLB member 8, header rate 7418 Hz (docs/engine/research/dqk-sound-triggers.md).
# CCFP mirrors that in try_step: on an ALLOWED step it execs CCSND /P 8 7418
# DISK1\SOUNDS.GLB (probed relative to the current/game directory) before committing the
# new pose.  Turns and blocked steps never reach it; with no DISK1\SOUNDS.GLB nothing runs.
#
# Proven here under retail DOSBox 0.74 (dummy video/audio): a GBSN v2 sidecar for an allowed
# step with status played / member 8 / 7418 Hz / CRC-32 equal to the retail payload; a
# member-8 mutation changes the CRC while a member-6 mutation does not; sbtype=none reports
# unavailable with the SAME pose trace, stdout and wall grid; a turn, a blocked step and a
# game dir without SOUNDS.GLB each leave no sidecar.  CCFP has no RNG or game state of its
# own, so "state" here is CCFP.MOV (pose trace), captured stdout and the wall-grid hash.
# Not claimed: audible output (dummy audio; "played" = the DSP answered and samples streamed).
# -CcfpPath lets the RED run point at a CCFP built from the pre-change source.
param([switch]$Headless, [string]$CcfpPath = '')
$ErrorActionPreference = "Stop"

$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native "build"
$dqk = Join-Path $root "The Dark Queen of Krynn"
$dosbox = Join-Path $dqk "DOSBOX\DOSBox.exe"
$glbSrc = Join-Path $dqk "DISK1\SOUNDS.GLB"
if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { Write-Output "SKIP: retail DOSBox absent: $dosbox"; return }
if (-not (Test-Path -LiteralPath $glbSrc -PathType Leaf)) { Write-Output "SKIP: retail SOUNDS.GLB absent: $glbSrc"; return }
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccfp | Out-Null
& (Join-Path $native "build.ps1") -Target ccsnd | Out-Null
$ccfpCom = if ($CcfpPath) { $CcfpPath } else { Join-Path $build "ccfp.com" }
$ccsndCom = Join-Path $build "ccsnd.com"
$work = Join-Path $build "ccfp-dqk-sound-test"

[byte[]]$glb = [IO.File]::ReadAllBytes($glbSrc)
$srcHash = (Get-FileHash -LiteralPath $glbSrc -Algorithm SHA256).Hash
$ptrs = for ($i = 0; $i -le 13; $i++) { [BitConverter]::ToUInt32($glb, 16 + 4 * $i) }
$crcTable = New-Object 'uint64[]' 256
for ($n = 0; $n -lt 256; $n++) { [uint64]$c = $n; for ($k = 0; $k -lt 8; $k++) { if ($c -band 1) { $c = 3988292384 -bxor ($c -shr 1) } else { $c = $c -shr 1 } }; $crcTable[$n] = $c }
function Get-Crc32([byte[]]$B, [int]$Start, [int]$Count) {
  [uint64]$crc = 4294967295
  for ($i = $Start; $i -lt $Start + $Count; $i++) { $crc = $crcTable[[int](($crc -bxor $B[$i]) -band 255)] -bxor ($crc -shr 8) }
  return [uint64]($crc -bxor 4294967295)
}
function Get-Member([byte[]]$Lib, [int]$M) {
  $s = [int]$ptrs[$M]; $len = ([int]$Lib[$s + 4] -shl 8) -bor [int]$Lib[$s + 5]
  [pscustomobject]@{ Start = $s; Rate = ([int]$Lib[$s] -shl 8) -bor [int]$Lib[$s + 1]; Length = $len; Crc = Get-Crc32 $Lib ($s + 6) $len }
}
$m8 = Get-Member $glb 8
if ($m8.Rate -ne 7418 -or $m8.Length -ne 167) { throw "member 8 retail facts drifted: $($m8.Rate) / $($m8.Length)" }
[byte[]]$mut8 = $glb.Clone(); $mut8[$m8.Start + 6 + 60] = $mut8[$m8.Start + 6 + 60] -bxor 0xFF
$m6 = Get-Member $glb 6
[byte[]]$mut6 = $glb.Clone(); $mut6[$m6.Start + 6 + 60] = $mut6[$m6.Start + 6 + 60] -bxor 0xFF
if ((Get-Member $mut8 8).Crc -eq $m8.Crc) { throw "member-8 mutation invisible to the CRC" }
if ((Get-Member $mut6 8).Crc -ne $m8.Crc -or (Get-Member $mut6 6).Crc -eq $m6.Crc) { throw "member-6 mutation control is wrong" }

function Read-Gbsn([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "no GBSN.BIN sidecar at $Path (no sound status was produced)" }
  [byte[]]$b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 22 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBSN' -or [BitConverter]::ToUInt16($b, 4) -ne 2) { throw "bad GBSN sidecar $Path" }
  [pscustomobject]@{ Status = [BitConverter]::ToUInt16($b, 6); Member = [BitConverter]::ToUInt16($b, 8); Req = [BitConverter]::ToUInt16($b, 10)
    Rate = [BitConverter]::ToUInt16($b, 12); Length = [BitConverter]::ToUInt16($b, 14); Crc = [BitConverter]::ToUInt32($b, 16); Sb = [BitConverter]::ToUInt16($b, 20) }
}

# Run CCFP in /M mode in a private game-dir copy; returns the directory.
function Invoke-Case([string]$Name, [string]$SbType, [string]$Pose, [string]$Script, $Lib) {
  $dir = Join-Path $work $Name
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  New-Item -ItemType Directory -Force $dir | Out-Null
  Copy-Item $ccfpCom (Join-Path $dir "CCFP.COM"); Copy-Item $ccsndCom (Join-Path $dir "CCSND.COM")
  [IO.File]::WriteAllBytes((Join-Path $dir "WALL.BIN"), (New-Object byte[] 1024))   # open 16x16 grid
  if ($null -ne $Lib) { New-Item -ItemType Directory -Force (Join-Path $dir "DISK1") | Out-Null; [IO.File]::WriteAllBytes((Join-Path $dir "DISK1\SOUNDS.GLB"), [byte[]]$Lib) }
  $conf = Join-Path $dir "_run.conf"
  @"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[sblaster]
sbtype=$SbType
sbbase=220
irq=7
dma=1
hdma=5
[autoexec]
@echo off
mount C "$dir"
C:
CCFP C:\WALL.BIN $Pose /M $Script > C:\OUT.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch {}; throw "DOSBox ($Name) did not exit" }
  return $dir
}
function Get-State($Dir) {
  foreach ($f in 'CCFP.MOV', 'OUT.TXT') { if (-not (Test-Path (Join-Path $Dir $f))) { throw "$Dir missing $f (CCFP did not run)" } }
  [pscustomobject]@{ Mov = (Get-Content (Join-Path $Dir 'CCFP.MOV') -Raw); Out = (Get-Content (Join-Path $Dir 'OUT.TXT') -Raw)
    Wall = (Get-FileHash (Join-Path $Dir 'WALL.BIN')).Hash; HasSc = (Test-Path (Join-Path $Dir 'GBSN.BIN')) }
}

$stepDir = Invoke-Case 'step' 'sb16' '8 8 0' 'F' $glb
$step = Get-State $stepDir
if ($step.Mov -notmatch "8 8 0\r?\n8 7 0") { throw "step trace wrong: $($step.Mov)" }
$sc = Read-Gbsn (Join-Path $stepDir 'GBSN.BIN')
if ($sc.Status -ne 1) { throw "allowed step: GBSN status $($sc.Status), expected 1 (played)" }
if ($sc.Member -ne 8 -or $sc.Req -ne 7418 -or $sc.Rate -ne 7418 -or $sc.Length -ne 167) { throw "allowed step: member/rate/length wrong ($($sc.Member)/$($sc.Req)/$($sc.Rate)/$($sc.Length))" }
if ($sc.Crc -ne $m8.Crc) { throw ("allowed step: CRC {0:X8} != retail member 8 {1:X8}" -f $sc.Crc, $m8.Crc) }
if ($sc.Sb -ne 0x220) { throw "allowed step: SB base $($sc.Sb)" }
Write-Output ("[PASS] allowed step 8,8 -> 8,7: GBSN v2 played, member 8, 7418 Hz, len 167, crc32 {0:X8} == retail payload; pose advanced" -f $sc.Crc)

$d = Invoke-Case 'mut8' 'sb16' '8 8 0' 'F' $mut8
$s8 = Read-Gbsn (Join-Path $d 'GBSN.BIN')
if ($s8.Crc -eq $m8.Crc -or $s8.Crc -ne (Get-Member $mut8 8).Crc) { throw "member-8 mutation not reflected in the step sidecar (probe cannot fail)" }
$d = Invoke-Case 'mut6' 'sb16' '8 8 0' 'F' $mut6
$s6 = Read-Gbsn (Join-Path $d 'GBSN.BIN')
if ($s6.Crc -ne $m8.Crc -or $s6.Status -ne 1) { throw "member-6 mutation changed the step sidecar" }
Write-Output ("[PASS] member-8 mutation: crc {0:X8} != retail {1:X8} (RED); member-6 mutation: crc unchanged (green)" -f $s8.Crc, $m8.Crc)

$noneDir = Invoke-Case 'none' 'none' '8 8 0' 'F' $glb
$none = Get-State $noneDir
$sn = Read-Gbsn (Join-Path $noneDir 'GBSN.BIN')
if ($sn.Status -ne 0 -or $sn.Sb -ne 0 -or $sn.Member -ne 8 -or $sn.Crc -ne $m8.Crc) { throw "sbtype=none: expected unavailable with member-8 evidence, got status $($sn.Status)" }
foreach ($k in 'Mov', 'Out', 'Wall') { if ($none.$k -ne $step.$k) { throw "sbtype=none changed $k versus the sound run" } }
Write-Output "[PASS] sbtype=none: unavailable (status 0, SB base 0); pose trace, stdout and wall grid identical to the sound run"

$turn = Get-State (Invoke-Case 'turn' 'sb16' '8 8 0' 'L' $glb)
if ($turn.HasSc) { throw "turning in place produced a sound sidecar" }
if ($turn.Mov -notmatch "8 8 0\r?\n8 8 3") { throw "turn trace wrong: $($turn.Mov)" }
$blocked = Get-State (Invoke-Case 'blocked' 'sb16' '8 0 0' 'F' $glb)
if ($blocked.HasSc) { throw "a blocked step (grid edge) produced a sound sidecar" }
$nosnd = Get-State (Invoke-Case 'nosounds' 'sb16' '8 8 0' 'F' $null)
if ($nosnd.HasSc) { throw "a game dir without DISK1\SOUNDS.GLB produced a sidecar" }
if ($nosnd.Mov -ne $step.Mov) { throw "missing SOUNDS.GLB changed the pose trace" }
Write-Output "[PASS] turn in place, blocked step and a dir without SOUNDS.GLB each leave no sidecar; traces unaffected"

# ---- resident GBIM scene art must survive a step with sound (CCFP walk mode, scripted keys) --------
# Scene art lives in scene_seg (cs+7000h), read on every redraw.  step_sound must not EXEC over it,
# so with a scene resident it skips the sound.  Keys come from a test-only INT 16h TSR (Up Up Left Up,
# then Esc) that also dumps the mode-13h framebuffer to FB.RAW when Esc is requested.
$nasm = 'C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe'
if (-not (Test-Path $nasm)) { throw "NASM absent: the live-art case cannot run" }
$tools = Join-Path $work "_tools"; New-Item -ItemType Directory -Force $tools | Out-Null
@'
        cpu 386
        org 100h
        jmp init
old     dd 0
qptr    dw queue
queue   dw 4800h, 4800h, 4B00h, 4800h, 0
fbname  db 'FB.RAW',0
isr:    cmp ah, 1
        je .none
        or ah, ah
        jne .chain
        push bx
        mov bx, [cs:qptr]
        mov ax, [cs:bx]
        or ax, ax
        jz .esc
        add word [cs:qptr], 2
        pop bx
        iret
.esc:   call dump
        pop bx
        mov ax, 011Bh
        iret
.none:  push bp
        mov bp, sp
        or word [bp+6], 40h
        pop bp
        xor ax, ax
        iret
.chain: jmp far [cs:old]
dump:   pusha
        push ds
        push cs
        pop ds
        mov ah, 3Ch
        xor cx, cx
        mov dx, fbname
        int 21h
        jc .x
        mov bx, ax
        push ds
        mov ax, 0A000h
        mov ds, ax
        xor dx, dx
        mov cx, 64000
        mov ah, 40h
        int 21h
        pop ds
        mov ah, 3Eh
        int 21h
.x:     pop ds
        popa
        ret
init:   mov ax, 3516h
        int 21h
        mov [old], bx
        mov [old+2], es
        mov dx, isr
        mov ax, 2516h
        int 21h
        mov dx, init
        add dx, 15
        shr dx, 4
        mov ax, 3100h
        int 21h
'@ | Set-Content (Join-Path $tools 'keys.asm') -Encoding ASCII
@'
        cpu 386
        org 100h
        mov ax, cs
        add ax, 1000h
        mov es, ax
.l:     xor di, di
        xor ax, ax
        mov cx, 8000h
        rep stosw
        mov ax, es
        add ax, 1000h
        mov es, ax
        cmp ax, 9000h
        jb .l
        mov ax, 4C00h
        int 21h
'@ | Set-Content (Join-Path $tools 'wipe.asm') -Encoding ASCII
& $nasm -f bin (Join-Path $tools 'keys.asm') -o (Join-Path $tools 'KEYS.COM'); if ($LASTEXITCODE) { throw "keys.asm failed" }
& $nasm -f bin (Join-Path $tools 'wipe.asm') -o (Join-Path $tools 'WIPE.COM'); if ($LASTEXITCODE) { throw "wipe.asm failed" }
[byte[]]$gbi = New-Object byte[] (14 + 64 * 48 + 768)
[Text.Encoding]::ASCII.GetBytes('GBIM').CopyTo($gbi, 0); $gbi[4] = 1; $gbi[6] = 1; $gbi[8] = 1; $gbi[10] = 64; $gbi[12] = 48
for ($y = 0; $y -lt 48; $y++) { for ($x = 0; $x -lt 64; $x++) { $gbi[14 + $y * 64 + $x] = [byte](1 + (($x * 3 + $y * 5) % 60)) } }
for ($i = 0; $i -lt 256; $i++) { $gbi[14 + 3072 + 3 * $i] = [byte]($i % 64); $gbi[15 + 3072 + 3 * $i] = [byte](63 - ($i % 64)); $gbi[16 + 3072 + 3 * $i] = [byte](($i * 7) % 64) }

function Invoke-Live([string]$Name, [string]$Ccfp, [string]$SndCom, $Lib) {
  $dir = Join-Path $work $Name
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  New-Item -ItemType Directory -Force $dir | Out-Null
  Copy-Item $Ccfp (Join-Path $dir "CCFP.COM"); Copy-Item $SndCom (Join-Path $dir "CCSND.COM"); Copy-Item (Join-Path $tools 'KEYS.COM') $dir
  [IO.File]::WriteAllBytes((Join-Path $dir "WALL.BIN"), (New-Object byte[] 1024))
  [IO.File]::WriteAllBytes((Join-Path $dir "SCENE.GBI"), $gbi)
  if ($null -ne $Lib) { New-Item -ItemType Directory -Force (Join-Path $dir "DISK1") | Out-Null; [IO.File]::WriteAllBytes((Join-Path $dir "DISK1\SOUNDS.GLB"), [byte[]]$Lib) }
  $conf = Join-Path $dir "_run.conf"
  @"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[sblaster]
sbtype=sb16
sbbase=220
irq=7
dma=1
hdma=5
[autoexec]
@echo off
mount C "$dir"
C:
KEYS
CCFP C:\WALL.BIN 8 8 0 /K C:\SCENE.GBI /W
exit
"@ | Set-Content -Path $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch {}; throw "DOSBox ($Name) did not exit" }
  $fb = Join-Path $dir 'FB.RAW'
  if (-not (Test-Path $fb) -or (Get-Item $fb).Length -ne 64000) { throw "$Name : no 64000-byte framebuffer dump (CCFP walk mode did not reach Esc)" }
  [pscustomobject]@{ Dir = $dir; Fb = (Get-FileHash $fb).Hash; HasSc = (Test-Path (Join-Path $dir 'GBSN.BIN')) }
}
$wipe = Join-Path $tools 'WIPE.COM'
$ctl = Invoke-Live 'live-control' $ccfpCom $ccsndCom $null
$live = Invoke-Live 'live-sound' $ccfpCom $ccsndCom $glb
$liveWipe = Invoke-Live 'live-wipe-guarded' $ccfpCom $wipe $glb
if ($live.Fb -ne $ctl.Fb) { throw "scene resident + SOUNDS.GLB changed the framebuffer versus the no-sound control" }
if ($liveWipe.Fb -ne $ctl.Fb) { throw "memory-wiping child ran or damaged the frame despite the resident-scene guard" }
if ($live.HasSc -or $liveWipe.HasSc) { throw "sound ran with a GBIM scene resident (guard did not engage)" }
Write-Output ("[PASS] resident GBIM scene + 4 scripted keys: framebuffer hash {0} identical to the no-SOUNDS.GLB control (real CCSND and a memory-wiping CCSND); no sidecar = sound skipped" -f $ctl.Fb.Substring(0, 12))
# Mutation: the pre-guard CCFP (shrinks to 64 KiB and EXECs regardless) with the memory-wiping child must go RED.
$unguarded = $env:CCFP_UNGUARDED_COM
if ($unguarded -and (Test-Path $unguarded)) {
  $mutant = Invoke-Live 'live-wipe-unguarded' $unguarded $wipe $glb
  if ($mutant.Fb -eq $ctl.Fb) { throw "unguarded mutant did NOT change the frame: the live-art probe cannot fail" }
  Write-Output ("[PASS] mutation (no scene guard + wiping child): framebuffer {0} != control {1} (RED)" -f $mutant.Fb.Substring(0, 12), $ctl.Fb.Substring(0, 12))
} else { Write-Output "[INFO] mutation case skipped: set CCFP_UNGUARDED_COM to a pre-guard ccfp.com" }

if ($srcHash -ne (Get-FileHash -LiteralPath $glbSrc -Algorithm SHA256).Hash) { throw "retail SOUNDS.GLB changed during the run" }
Write-Output "RESULT: ccfp-dqk-sound-test PASS"
