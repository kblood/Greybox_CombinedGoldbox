# ccsnd-play-test.ps1 -- DQK DIG4 sound-effect playback slice (CCSND /P).
#
# SOURCE-GROUNDED EVENT (derived from DQK.EXE, see native/README.md "CCSND /P"):
# the combat/party move routine at DQK.EXE file 0x43B26 does `PlaySound(0x0B)`
# then a 50 ms delay.  PlaySound (file 0x12636; far 0x1023:6) maps ids 3..15 to
# SOUNDS.GLB member id-3 on the digitized path (sound command 0x122A6 -> `di =
# id-3` -> 0x18FC:0x16), and id 0x0B is the one it rewrites for creature type 3
# (-> 0x0E, member 11) and 6 (-> 0x0F, member 12).  Default step = member 8, whose
# header rate is 0x1CFA = 7418 Hz and whose payload is 167 bytes = 334 four-bit samples.
# The rate is the member's own big-endian u16 (the engine converts it to a PIT divisor
# 0x1234DD/rate at 0x1B4EE).  Unrelated control = member 3 (11127 Hz, 3542 bytes = 7084 samples).
#
# CODEC (settled 2026-10-07 from retail bytes): a DIG4 member is a 6-byte header
# (u16be rate, u16 0, u16be payload bytes) then 4-bit unsigned samples, two per byte,
# LOW nibble first, centre 8 -- the same reading packages/engine/src/audio/dig.ts uses.
# Until then CCSND read a 4-byte header + 8-bit PCM (played the length word as samples
# and the stream at half length); sidecar version 1 -> 2 marks the correction.
#
# What this proves, all under retail DOSBox 0.74 with a Sound Blaster 16:
#   * CCSND /P publishes a GBSN.BIN sidecar whose member/rate/length/CRC-32 equal
#     values this script derives independently from the retail SOUNDS.GLB bytes;
#   * with sbtype=none the sidecar says "unavailable" (status 0, no SB port) and
#     still carries the same retail member evidence;
#   * a rate that disagrees with the member header is refused (status 2);
#   * CCSND /D decodes member 8 to exactly 2x payload-bytes samples whose first 32 equal an
#     independent low-nibble-first decode of the retail bytes (and NOT the old 8-bit reading);
#   * a staged one-byte mutation of member 8 makes the retail comparison go RED
#     while an unrelated member of the same mutated library stays green.
# It does NOT claim audible output: the headless run has dummy audio, so "played"
# means the DSP answered the reset and every sample byte was streamed to it.
param([switch]$Headless)
$ErrorActionPreference = "Stop"

$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native "build"
$run = Join-Path $build "ccsnd-play-test"
$dqk = Join-Path $root "The Dark Queen of Krynn"
$dosbox = Join-Path $dqk "DOSBOX\DOSBox.exe"
$glbSrc = Join-Path $dqk "DISK1\SOUNDS.GLB"

if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { Write-Output "SKIP: retail DOSBox absent: $dosbox"; return }
if (-not (Test-Path -LiteralPath $glbSrc -PathType Leaf)) { Write-Output "SKIP: retail SOUNDS.GLB absent: $glbSrc"; return }

. (Join-Path $native 'retail-stage.ps1')
. (Join-Path $native "dosbox-smoke.ps1")
$dqkMount = New-RetailStage -Source $dqk -Name 'dqk-sounds' -Files @('DISK1\SOUNDS.GLB')

& (Join-Path $native "build.ps1") -Target ccsnd
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "build ccsnd failed" }

# ---- independent retail expectations -------------------------------------
$srcHashBefore = (Get-FileHash -LiteralPath $glbSrc -Algorithm SHA256).Hash
[byte[]]$glb = [IO.File]::ReadAllBytes($glbSrc)
if ([Text.Encoding]::ASCII.GetString($glb, 0, 4) -ne 'HLIB' -or [Text.Encoding]::ASCII.GetString($glb, 12, 4) -ne 'DIG4') {
  throw "SOUNDS.GLB is not an HLIB DIG4 library"
}
$ptrCount = [BitConverter]::ToUInt16($glb, 8) + 1
$ptrs = for ($i = 0; $i -lt $ptrCount; $i++) { [BitConverter]::ToUInt32($glb, 16 + 4 * $i) }

$crcTable = New-Object 'uint64[]' 256
$poly = [uint64]3988292384   # 0xEDB88320 (PowerShell hex literals above 0x7FFFFFFF are negative ints)
for ($n = 0; $n -lt 256; $n++) {
  [uint64]$c = $n
  for ($k = 0; $k -lt 8; $k++) { if ($c -band 1) { $c = $poly -bxor ($c -shr 1) } else { $c = $c -shr 1 } }
  $crcTable[$n] = $c
}
function Get-Crc32([byte[]]$Bytes, [int]$Start, [int]$Count) {
  [uint64]$crc = 4294967295
  for ($i = $Start; $i -lt ($Start + $Count); $i++) {
    $crc = $crcTable[[int](($crc -bxor $Bytes[$i]) -band 255)] -bxor ($crc -shr 8)
  }
  return [uint64]($crc -bxor 4294967295)
}
function Get-Expected([byte[]]$Lib, [int]$Member) {
  $start = [int]$ptrs[$Member]; $end = [int]$ptrs[$Member + 1]
  [pscustomobject]@{
    Member = $Member
    Rate   = ([int]$Lib[$start] -shl 8) -bor [int]$Lib[$start + 1]
    Length = ([int]$Lib[$start + 4] -shl 8) -bor [int]$Lib[$start + 5]   # payload BYTES, declared
    Samples = 2 * (([int]$Lib[$start + 4] -shl 8) -bor [int]$Lib[$start + 5])
    Crc    = Get-Crc32 $Lib ($start + 6) (([int]$Lib[$start + 4] -shl 8) -bor [int]$Lib[$start + 5])
    Start  = $start
    Span   = $end - $start
  }
}
$stepMember = 8          # PlaySound(0x0B) -> member 0x0B-3
$ctlMember = 3           # unrelated control: PlaySound(6), "die"
$step = Get-Expected $glb $stepMember
$ctl = Get-Expected $glb $ctlMember
# The declared length is an identity with the member span (span - 6, or - 7 for an odd-payload pad).
foreach ($m in 0..12) {
  $e = Get-Expected $glb $m
  if ($e.Span - $e.Length -ne 6 -and $e.Span - $e.Length -ne 7) { throw "member $m declared length $($e.Length) vs span $($e.Span): 6-byte header identity broken" }
}
if ($step.Rate -ne 7418 -or $step.Length -ne 167 -or $step.Samples -ne 334) { throw "member 8 retail facts drifted: rate $($step.Rate) len $($step.Length)" }
if ($ctl.Rate -ne 11127 -or $ctl.Length -ne 3542 -or $ctl.Samples -ne 7084) { throw "member 3 retail facts drifted: rate $($ctl.Rate) len $($ctl.Length)" }

# Staged mutation: ONE payload byte of member 8 flipped in a private copy.
[byte[]]$mut = $glb.Clone()
$mut[$step.Start + 6 + 60] = $mut[$step.Start + 6 + 60] -bxor 0xFF

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "ccsnd.com") (Join-Path $run "CCSND.COM") -Force
[IO.File]::WriteAllBytes((Join-Path $run "MUT.GLB"), $mut)

function Read-Gbsn([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "sidecar missing: $Path" }
  [byte[]]$b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -ne 22) { throw "sidecar $Path length $($b.Length), expected 22" }
  if ([Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBSN') { throw "sidecar $Path bad magic" }
  if ([BitConverter]::ToUInt16($b, 4) -ne 2) { throw "sidecar $Path bad version" }
  [pscustomobject]@{
    Status = [BitConverter]::ToUInt16($b, 6)
    Member = [BitConverter]::ToUInt16($b, 8)
    ReqRate = [BitConverter]::ToUInt16($b, 10)
    HdrRate = [BitConverter]::ToUInt16($b, 12)
    Length = [BitConverter]::ToUInt16($b, 14)
    Crc = [BitConverter]::ToUInt32($b, 16)
    SbBase = [BitConverter]::ToUInt16($b, 20)
  }
}
# True when the sidecar's member/rate/length/CRC equal the retail bytes.
function Test-MatchesRetail($Sidecar, $Expected) {
  return ($Sidecar.Member -eq $Expected.Member -and $Sidecar.HdrRate -eq $Expected.Rate -and
    $Sidecar.Length -eq $Expected.Length -and $Sidecar.Crc -eq $Expected.Crc)
}

function Invoke-Dos([string]$Tag, [string]$SbType, [string[]]$Commands) {
  $conf = Join-Path $run "_$Tag.conf"
  $lines = @("@echo off", ('mount C "{0}"' -f $run), ('mount D "{0}"' -f $dqkMount), "C:") + $Commands + @("exit")
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
$($lines -join "`r`n")
"@ | Set-Content -Path $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { try { $p.Kill() } catch {}; throw "DOSBox ($Tag) did not exit" }
}

$glbD = 'D:\DISK1\SOUNDS.GLB'
Invoke-Dos 'sb16' 'sb16' @(
  "CCSND /P $stepMember $($step.Rate) $glbD > C:\STEP.TXT", "ren GBSN.BIN STEP.BIN",
  "CCSND /P $ctlMember $($ctl.Rate) $glbD > C:\CTL.TXT", "ren GBSN.BIN CTL.BIN",
  "CCSND /P $stepMember $($step.Rate) C:\MUT.GLB > C:\MSTEP.TXT", "ren GBSN.BIN MSTEP.BIN",
  "CCSND /P $ctlMember $($ctl.Rate) C:\MUT.GLB > C:\MCTL.TXT", "ren GBSN.BIN MCTL.BIN",
  "CCSND /P $stepMember 7000 $glbD > C:\BADRATE.TXT", "ren GBSN.BIN BADRATE.BIN",
  "CCSND L $glbD > C:\LIST.TXT",
  "CCSND /D $glbD $stepMember", "ren CCSND.RAW DSTEP.RAW",
  "CCSND /D $glbD $ctlMember", "ren CCSND.RAW DCTL.RAW",
  "CCSND /D C:\MUT.GLB $stepMember", "ren CCSND.RAW DMUT.RAW"
)
Invoke-Dos 'nosb' 'none' @(
  "CCSND /P $stepMember $($step.Rate) $glbD > C:\NSTEP.TXT", "ren GBSN.BIN NSTEP.BIN"
)

$stepSc = Read-Gbsn (Join-Path $run "STEP.BIN")
$ctlSc = Read-Gbsn (Join-Path $run "CTL.BIN")
$mStep = Read-Gbsn (Join-Path $run "MSTEP.BIN")
$mCtl = Read-Gbsn (Join-Path $run "MCTL.BIN")
$bad = Read-Gbsn (Join-Path $run "BADRATE.BIN")
$nosb = Read-Gbsn (Join-Path $run "NSTEP.BIN")

# 0. The pre-existing lister still parses after the /P argument branch was added.
$list = Get-Content (Join-Path $run "LIST.TXT") -Raw
if ($list -notmatch '7418Hz 334 S0008\.RAW' -or $list -notmatch '11127Hz 7084 S0003\.RAW') { throw "CCSND L regression: $list" }
Write-Output "[PASS] CCSND L still lists member 8 (7418Hz 334 samples) and member 3 (11127Hz 7084 samples)"

# 1. Retail step event played, sidecar equals independently-derived retail facts.
if ($stepSc.Status -ne 1) { throw "sb16 step: status $($stepSc.Status), expected 1 (played)" }
if ($stepSc.SbBase -ne 0x220) { throw "sb16 step: SB base $($stepSc.SbBase)" }
if ($stepSc.ReqRate -ne $step.Rate) { throw "sb16 step: requested rate $($stepSc.ReqRate)" }
if (-not (Test-MatchesRetail $stepSc $step)) { throw "sb16 step: sidecar != retail member 8 (crc $('{0:X8}' -f $stepSc.Crc) vs $('{0:X8}' -f $step.Crc))" }
if ((Get-Content (Join-Path $run "STEP.TXT") -Raw) -notmatch 'GBSN status=played member=8 rate=7418 len=167 samples=334 crc32=') { throw "sb16 step: stdout line wrong" }
Write-Output ("[PASS] /P 8 7418: played, len {0}, crc32 {1:X8} == retail SOUNDS.GLB member 8 payload" -f $stepSc.Length, $stepSc.Crc)

# 2. Unrelated member plays and matches too.
if ($ctlSc.Status -ne 1 -or -not (Test-MatchesRetail $ctlSc $ctl)) { throw "sb16 control member 3 did not match retail" }
Write-Output ("[PASS] /P 3 11127: played, len {0}, crc32 {1:X8} == retail member 3 payload" -f $ctlSc.Length, $ctlSc.Crc)

# 3. sbtype=none: unavailable, no SB port, retail evidence still published.
if ($nosb.Status -ne 0) { throw "sbtype=none: status $($nosb.Status), expected 0 (unavailable)" }
if ($nosb.SbBase -ne 0) { throw "sbtype=none: SB base $($nosb.SbBase), expected 0" }
if (-not (Test-MatchesRetail $nosb $step)) { throw "sbtype=none: sidecar lost retail member evidence" }
if ((Get-Content (Join-Path $run "NSTEP.TXT") -Raw) -notmatch 'GBSN status=unavailable') { throw "sbtype=none: stdout not 'unavailable'" }
Write-Output "[PASS] sbtype=none: status unavailable, SB base 0, member 8 evidence still equals retail"

# 4. Wrong rate is refused, not played.
if ($bad.Status -ne 2 -or $bad.HdrRate -ne $step.Rate -or $bad.ReqRate -ne 7000) { throw "rate mismatch: status $($bad.Status) hdr $($bad.HdrRate) req $($bad.ReqRate)" }
Write-Output "[PASS] /P 8 7000: header says 7418 -> status 2 (rate-mismatch), not played"

# 5. Mutation control: member 8 goes RED against retail, unrelated member 3 stays green.
if (Test-MatchesRetail $mStep $step) { throw "mutation control did NOT go red: mutated member 8 still matches retail (probe cannot fail)" }
$mutExpect = Get-Expected $mut $stepMember
if ($mStep.Crc -ne $mutExpect.Crc -or $mStep.Length -ne $step.Length) { throw "mutated member 8 sidecar does not describe the mutated bytes" }
if ($mStep.Crc -eq $step.Crc) { throw "mutation not visible in CRC" }
if (-not (Test-MatchesRetail $mCtl $ctl)) { throw "unrelated-member control went red under a member-8-only mutation" }
Write-Output ("[PASS] staged 1-byte mutation of member 8: crc {0:X8} != retail {1:X8} (RED); member 3 of the same file still == retail (green)" -f $mStep.Crc, $step.Crc)

# 6. Decoded samples: CCSND /D must emit rate, 2*payload sample count and low-nibble-first x16 samples.
function Get-Decoded([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "decode dump missing: $Path" }
  [byte[]]$b = [IO.File]::ReadAllBytes($Path)
  [pscustomobject]@{ Rate = [BitConverter]::ToUInt16($b, 0); Count = [BitConverter]::ToUInt32($b, 2); Total = $b.Length; Bytes = $b }
}
function Get-ExpectedSamples([byte[]]$Lib, $E, [int]$N) {
  $o = New-Object 'System.Collections.Generic.List[int]'
  for ($i = 0; $i -lt $N; $i++) {
    $byte = [int]$Lib[$E.Start + 6 + [math]::Floor($i / 2)]
    if ($i % 2 -eq 0) { $o.Add(($byte -band 15) * 16) } else { $o.Add(($byte -shr 4) * 16) }
  }
  return $o
}
foreach ($case in @(@('DSTEP.RAW', $step), @('DCTL.RAW', $ctl))) {
  $d = Get-Decoded (Join-Path $run $case[0]); $e = $case[1]
  if ($d.Rate -ne $e.Rate -or $d.Count -ne $e.Samples) { throw "$($case[0]): rate $($d.Rate) count $($d.Count), expected $($e.Rate) / $($e.Samples)" }
  if ($d.Total -ne 6 + $e.Samples) { throw "$($case[0]): file size $($d.Total), expected $(6 + $e.Samples)" }
  $exp = Get-ExpectedSamples $glb $e $e.Samples
  for ($i = 0; $i -lt $e.Samples; $i++) { if ($d.Bytes[6 + $i] -ne $exp[$i]) { throw "$($case[0]): sample $i is $($d.Bytes[6 + $i]), expected $($exp[$i])" } }
}
$dStep = Get-Decoded (Join-Path $run "DSTEP.RAW")
$first = ($dStep.Bytes[6..21]) -join ','
# member 8 payload begins with nibbles 9,9,... -> 144 each.  The OLD 8-bit reading would give half the count
# (167 or 170), so both the count and the first samples discriminate.
if ($dStep.Bytes[6] -ne 144 -or $dStep.Bytes[7] -ne 144) { throw "member 8 first samples not 144,144: $first" }
if ($dStep.Count -eq $step.Length -or $dStep.Count -eq $step.Length + 3) { throw "decode count equals the 8-bit reading" }
$dMut = Get-Decoded (Join-Path $run "DMUT.RAW")
if ($dMut.Bytes[6 + 120] -eq $dStep.Bytes[6 + 120] -or $dMut.Bytes[6 + 121] -eq $dStep.Bytes[6 + 121]) { throw "mutation not visible in decoded samples (probe cannot fail)" }
for ($i = 0; $i -lt 120; $i++) { if ($dMut.Bytes[6 + $i] -ne $dStep.Bytes[6 + $i]) { throw "mutation leaked into samples before the mutated byte" } }
Write-Output ("[PASS] CCSND /D member 8: {0} samples (= 2 x {1} payload bytes), first 16 = {2}, == independent low-nibble-first decode of retail; member 3: {3} samples all equal; mutated byte flips samples 120/121" -f $dStep.Count, $step.Length, $first, $ctl.Samples)

$srcHashAfter = (Get-FileHash -LiteralPath $glbSrc -Algorithm SHA256).Hash
if ($srcHashBefore -ne $srcHashAfter) { throw "retail SOUNDS.GLB changed during the run" }
Write-Output "RESULT: ccsnd-play-test PASS"
