# ccflow-dqk-area2-test.ps1 -- CCFLOW must not resume CCECL forever on DQK area 2:
# it publishes a loop-marked v15/status-4 saturation record + GBSL (exit 0).
param([switch]$Probe, [switch]$BangProbe, [int]$ProbeMs = 30000)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccflow-dqk-area2-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$glb = Join-Path $root 'The Dark Queen of Krynn\DISK3\ECL.GLB'
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')
if (-not (Test-Path -LiteralPath $dosbox) -or -not (Test-Path -LiteralPath $glb)) {
  Write-Output 'SKIP: CCFLOW DQK area-2 loop (DOSBox or DISK3\ECL.GLB absent)'; exit 0
}
& (Join-Path $native 'build.ps1') -Target ccecl | Out-Null
& (Join-Path $native 'build.ps1') -Target ccflow | Out-Null
$stage = New-RetailStage -Source (Join-Path $root 'The Dark Queen of Krynn') -Name 'ccflow-area2' -Files @('DISK3\ECL.GLB')
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build 'ccecl.com') (Join-Path $run 'CCECL.COM') -Force
Copy-Item (Join-Path $build 'ccflow.com') (Join-Path $run 'CCFLOW.COM') -Force
Copy-Item (Join-Path $stage 'DISK3\ECL.GLB') (Join-Path $run 'A2.GLB') -Force

function Invoke-Guest([string]$Name, [string]$Command, [int]$TimeoutMs) {
  $conf = Join-Path $run "_$Name.conf"
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
$Command
exit
"@ | Set-Content -Path $conf -Encoding ASCII
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  $timedOut = $false
  if (-not $p.WaitForExit($TimeoutMs)) { $timedOut = $true; try { $p.Kill() } catch {} }
  [pscustomobject]@{ TimedOut = $timedOut; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1) }
}
function P([string]$n) { Join-Path $run $n }
function U16B([byte[]]$a, [int]$o) { [BitConverter]::ToUInt16($a, $o) }

# Bound: a legitimate route finishes in tens of chunks; the state ring holds
# 128, so a deterministic repeat must be caught within one ring of chunks.  The
# backstop without detection is the u16 side_count overflow (~1005 chunks).
$MaxChunks = 130
$SidecarExts = 'GBS', 'GBT', 'GBP'

# Returns the list of violations for one CCFLOW area-2 run (empty = GREEN).
function Assess-Loop([string]$Exe, [string]$Tag) {
  foreach ($f in @('A2.EFX', 'A2.TXT', 'GBR.EFX', 'A2.ERR', 'DIR2.EFX') + ($SidecarExts | ForEach-Object { "A2.$_" })) {
    if (Test-Path (P $f)) { Remove-Item -Force (P $f) }
  }
  $r = Invoke-Guest $Tag "CCECL C:\A2.GLB 2 /E C:\DIR2.EFX > C:\DIR2.TXT`n$Exe C:\A2.GLB 2 /E C:\A2.EFX > C:\A2.TXT`nif errorlevel 1 echo EXIT-NONZERO > C:\A2.ERR" 60000
  $v = @()
  if ($r.TimedOut) { $v += 'did not finish in 60 s' }
  $txt = if (Test-Path (P 'A2.TXT')) { Get-Content (P 'A2.TXT') -Raw } else { '' }
  $chunks = ([regex]::Matches($txt, 'script-effect capacity reached')).Count
  if ($chunks -gt $MaxChunks) { $v += "$chunks chunks resumed (> $MaxChunks)" }
  if ($txt -notmatch 'CCFLOW: CCECL script state repeated') { $v += 'no loop-detected message' }
  if ((Test-Path (P 'A2.ERR')) -and (Get-Item (P 'A2.ERR')).Length -gt 0) { $v += 'exit status was nonzero (loop must publish a record, not abort)' }
  foreach ($f in 'GBR.EFX', 'GBR.GBS', 'GBR.GBT', 'GBR.GBP', 'A2.GBT', 'A2.GBP') { if (Test-Path (P $f)) { $v += "left private file $f" } }
  if (-not (Test-Path (P 'A2.EFX')) -or -not (Test-Path (P 'A2.GBS')) -or -not (Test-Path (P 'DIR2.EFX'))) {
    $v += 'no published A2.EFX/A2.GBS (or direct control missing)'
  } else {
    $e = [IO.File]::ReadAllBytes((P 'A2.EFX')); $d = [IO.File]::ReadAllBytes((P 'DIR2.EFX'))
    $sd = [IO.File]::ReadAllBytes((P 'A2.GBS'))
    $hd = -1; for ($i = 0; $i -lt $e.Length - 4; $i++) { if ($e[$i] -eq 0x47 -and $e[$i+1] -eq 0x42 -and $e[$i+2] -eq 0x48 -and $e[$i+3] -eq 0x44) { $hd = $i } }
    if ((U16B $e 4) -ne 15) { $v += "version $(U16B $e 4) is not 15" }
    if ((U16B $e 8) -ne 4) { $v += "status $(U16B $e 8) is not 4 (saturated)" }
    if (((U16B $e 6) -band 0x0100) -eq 0) { $v += 'FX_HAVE_SIDECAR clear' }
    if ($hd -lt 0) { $v += 'no GBHD' } elseif ((U16B $e ($hd + 4)) -ne 10) { $v += "GBHD reason $(U16B $e ($hd + 4)) is not the loop marker 10" }
    if ((U16B $e 2250) -ne 64) { $v += "GBSX count $(U16B $e 2250) is not 64" }
    if ((U16B $d 8) -ne 4 -or (U16B $d 4) -ne 15) { $v += 'direct CCECL control is not v15/status 4' }
    $cnt = U16B $sd 6
    if ([Text.Encoding]::ASCII.GetString($sd, 0, 4) -ne 'GBSL' -or $sd.Length -ne (8 + 54 * $cnt)) { $v += 'A2.GBS is not a well-formed GBSL v1' }
    elseif ($cnt -lt 64 -or $cnt % 64 -ne 0) { $v += "GBSL count $cnt is not a whole number of 64-record chunks" }
    elseif ($d.Length -gt 3532 + 34 * 64) {
      for ($i = 0; $i -lt 64; $i++) {
        $row = [byte[]]($d[(2252 + 20 * $i)..(2252 + 20 * $i + 19)] + $d[(3532 + 34 * $i)..(3532 + 34 * $i + 33)])
        if ([Convert]::ToBase64String($row) -ne [Convert]::ToBase64String([byte[]]$sd[(8 + 54 * $i)..(8 + 54 * $i + 53)])) { $v += "GBSL record $i differs from direct CCECL"; break }
      }
    }
    if ($e.Length -ne $d.Length) { $v += "record length $($e.Length) != direct $($d.Length)" }
  }
  [pscustomobject]@{ Violations = $v; Chunks = $chunks; Seconds = $r.Seconds; Text = $txt }
}

if ($Probe) {
  $r = Assess-Loop 'CCFLOW' 'probe'
  "chunks=$($r.Chunks) sec=$($r.Seconds) violations=$($r.Violations -join '; ')"
  return
}

# ---- RED control: the same CCFLOW with the loop check removed ---------------
# Assemble a mutant (the `jc loop_publish` branch replaced by NOPs) and require
# this very assessment to reject it, so the test is seen able to fail.
$src = Join-Path $native 'src\ccflow.asm'
$asm = [IO.File]::ReadAllText($src)
if ($asm -notmatch '(?m)^        jc      loop_publish\r?$') { throw 'mutation anchor `jc loop_publish` not found in ccflow.asm' }
$mut = [regex]::Replace($asm, '(?m)^        jc      loop_publish(\r?)$', "        nop`$1`n        nop`$1")
$mutAsm = Join-Path $run 'ccflow_mut.asm'
[IO.File]::WriteAllText($mutAsm, $mut)
$nasm = 'C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe'
if (-not (Test-Path $nasm)) { $nasm = (Get-Command nasm).Source }
& $nasm -f bin -I ((Join-Path $native 'src') + '/') $mutAsm -o (Join-Path $run 'CCFLOWM.COM')
if ($LASTEXITCODE -ne 0) { throw 'mutant CCFLOW failed to assemble' }
$m = Assess-Loop 'CCFLOWM' 'mutant'
if ($m.Violations.Count -eq 0) { throw 'mutant CCFLOW (loop check removed) passed the area-2 assessment: test cannot fail' }
Write-Host "RED seen: mutant without loop check: $($m.Violations -join '; ')"

# ---- GREEN: real CCFLOW ------------------------------------------------------
$g = Assess-Loop 'CCFLOW' 'real'
if ($g.Violations.Count -ne 0) { throw "CCFLOW area 2: $($g.Violations -join '; ')" }
Write-Host "GREEN: CCFLOW area 2 stopped after $($g.Chunks) chunks in $($g.Seconds) s: exit 0, v15/status-4 record, GBHD reason 10, GBSL first 64 == direct CCECL, no private files"

# ---- /! control: stops at the prompt, byte-identical to direct CCECL /! -----
foreach ($f in 'D2.EFX', 'F2.EFX', 'F2.GBS', 'F2.GBT', 'F2.GBP', 'GBR.EFX') { if (Test-Path (P $f)) { Remove-Item -Force (P $f) } }
$r = Invoke-Guest 'bang' "CCECL C:\A2.GLB 2 /! /E C:\D2.EFX > C:\D2.TXT`nCCFLOW C:\A2.GLB 2 /! /E C:\F2.EFX > C:\F2.TXT`nCCECL C:\A2.GLB 2 /! /E C:\D3.EFX > C:\D3.TXT" 60000
if ($BangProbe) { 'D2','F2','D3' | ForEach-Object { "$_ " + (Get-FileHash (P "$_.EFX") -Algorithm MD5).Hash }; return }
if ($r.TimedOut) { throw '/! control did not finish in 60 s' }
foreach ($f in 'D2.EFX', 'F2.EFX') { if (-not (Test-Path (P $f))) { throw "/! control produced no $f" } }
$d = [IO.File]::ReadAllBytes((P 'D2.EFX')); $f2 = [IO.File]::ReadAllBytes((P 'F2.EFX'))
# Direct CCECL leaves DOS-memory residue (e.g. font glyph bytes) in DEAD padding
# -- stack words above callsp, memory rows above memcount, GBSX rows above
# count -- while CCFLOW's child gets zeroed memory.  Direct CCECL is itself
# deterministic run-to-run (D2 == D3 checked below), so the residue is not
# state.  Compare every LIVE byte exactly: all fixed fields, the live stack
# words, the live memory key/value rows, the live GBSX events/text, and the
# trailing v8..v15 sections.
function B64([byte[]]$a, [int]$o, [int]$n) { [Convert]::ToBase64String($a[$o..($o + $n - 1)]) }
function U16B([byte[]]$a, [int]$o) { [BitConverter]::ToUInt16($a, $o) }
if ((Get-FileHash (P 'D2.EFX') -Algorithm MD5).Hash -ne (Get-FileHash (P 'D3.EFX') -Algorithm MD5).Hash) { throw 'direct CCECL /! is not deterministic run-to-run' }
if ($d.Length -ne $f2.Length) { throw "/! effect length differs ($($f2.Length) vs $($d.Length))" }
$live = @()
$live += ,@(0, 132)                                   # header .. RS callsp
$sp = U16B $d 130; if ($sp -gt 32) { throw "implausible callsp $sp" }
if ($sp -gt 0) { $live += ,@(132, 2 * $sp) }          # live call-stack words
$mc = U16B $d 196; if ($mc -gt 512) { throw "implausible memcount $mc" }
$live += ,@(196, 2)
if ($mc -gt 0) { $live += ,@(198, 2 * $mc); $live += ,@((198 + 1024), (2 * $mc)) }
$live += ,@(2246, 6)                                  # GBSX magic + count
$sx = U16B $d 2250; if ($sx -gt 64) { throw "implausible GBSX count $sx" }
if ($sx -gt 0) { $live += ,@(2252, 20 * $sx); $live += ,@((2252 + 1280), (34 * $sx)) }
$live += ,@(5708, ($d.Length - 5708))                   # v7..v15 tail sections
$liveBytes = 0
foreach ($seg in $live) {
  if ((B64 $d $seg[0] $seg[1]) -ne (B64 $f2 $seg[0] $seg[1])) { throw "/! CCFLOW effect differs from direct CCECL /! in live bytes [$($seg[0]),+$($seg[1]))" }
  $liveBytes += $seg[1]
}
if ((U16B $d 8) -ne 2 -or (U16B $f2 8) -ne 2) { throw "/! control is not the pending status-2 prompt record (direct $(U16B $d 8), CCFLOW $(U16B $f2 8))" }
Write-Host "/! live bytes compared: $liveBytes of $($d.Length) (GBSX rows $sx, call-stack words $sp, memory rows $mc)"
foreach ($e in $SidecarExts) { if (Test-Path (P "F2.$e")) { throw "/! control left F2.$e" } }
Write-Host "/! control: CCFLOW == direct CCECL on every live byte ($($d.Length)-byte record), no sidecar"

Write-Output 'RESULT: CCFLOW DQK area 2 deterministic-loop publish (bounded chunks, exit 0, loop-marked v15/status-4 record + GBSL, no private files, /! live-byte-identical, mutant RED) PASS'
