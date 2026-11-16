# tools/cok-m4-memory-signature-route.ps1 — CoK M4 fidelity plan, round 9.
#
# Implements round 8's own top-ranked recommendation (cok-m4-fidelity-plan.md §16.8 item 1):
# ABANDON the uniform load-segment-shift arithmetic model entirely (six independently-derived
# live addresses computed that way, across rounds 6+8, never fired) and instead find the
# crashing routine's TRUE live address via a LIVE MEMORY SIGNATURE SEARCH — dump the running
# guest's real conventional memory and search it for the exact machine-code bytes Ghidra
# already proved (round 7, §15.2) live at DQK.EXE file offset 0x356DC (combat-setup-entry) and
# 0x359E6 (its one true caller, AddCombatantToActiveRoster). Wherever those bytes are actually
# found live IS the correct live address — no shift-hypothesis guessing.
#
# Why this sidesteps the whole address-translation puzzle: reading DOSBox-X's own debugger
# source (build/tools/dosbox-x-source-2026.07.02/src/debug/debug.cpp) shows `CBreakpoint::
# CheckBreakpoint` stores a breakpoint's location as a resolved PHYSICAL address at `BP seg:off`
# SET time (`SetAddress`: `location = GetAddress(seg,off)`) and compares physical addresses at
# check time — real-mode `GetAddress` is the plain `(seg<<4)+off` formula. This means ANY
# seg:off decomposition of the correct physical address will fire the breakpoint; the six prior
# misses were not "the wrong decomposition", they were the wrong PHYSICAL address, because the
# uniform load_seg-shift formula (calibrated only against the trivial identity case) does not
# generalize to this overlay region (§16.7's own conclusion). A byte-for-byte memory search
# finds the real physical address directly, with zero arithmetic.
#
# One nuance handled explicitly (not present in Ghidra's static-only proof): overlay code
# *could* have far-call targets patched by a relocation/fixup pass when loaded, which would
# make a full-signature byte match fail even though the routine is genuinely present. To guard
# against this we search on a short PREFIX (16 bytes: prologue + immediate constants only, no
# embedded far-call segment words) and separately report how many of the following 80 bytes
# still match the file's raw copy — itself a new, on-topic data point for this doc's standing
# "does this overlay relocate at load time" question.
#
# PAUSE-MECHANISM EVOLUTION WITHIN THIS ROUND (kept here, not smoothed away, because it is
# itself load-bearing evidence — see cok-m4-fidelity-plan.md §17 for the full writeup):
#   Attempt 1-3: bare `BPINT 21` (any AH) after reaching the boot main menu — never fired.
#                Sharpens rounds 6-8's "zero INT21 AH=42/3F from party-menu through crash" into
#                "DQK.EXE issues ZERO INT 21h calls of any kind once past initial disk loading."
#   Attempt 3:   `BPINT 8` (IRQ0 timer) — never fired. Self-identified mistake: BPINT only hooks
#                *software* `INT` opcodes, never hardware-delivered IRQs (a documented
#                project-level gotcha this round briefly forgot to consult first).
#   Attempt 4-5: re-arm `BPINT 21 42` (lseek, proven-reliable during the pre-boot loading burst)
#                and drive it through the ESC-skip intro loop — never fires a SECOND time. The
#                entire disk-loading burst is front-loaded into one very-early stretch, with
#                genuinely zero further lseek/read activity for the rest of execution.
#   Attempt 6:   tested whether `MEMDUMPBIN` (a data-producing command) works when issued to a
#                genuinely RUNNING (non-stopped) guest, with no pause at all — it does NOT: the
#                console snapshot immediately after issuing it was a byte-for-byte stale repaint
#                of the LAST stopped state, and MEMDUMP.BIN never appeared on disk. This means
#                the debug console's command dispatcher only actually executes commands while
#                the CPU core is genuinely halted in `DEBUG_Loop` — NOT while `RUN` has switched
#                it into `DOSBOX_SetNormalLoop()`. (This also retroactively explains why rounds
#                6-8's BPINT arms "worked while running": they were always issued from the
#                -DebuggerAction pre-boot array, executed by the probe BEFORE the guest's first
#                `RUN` even starts spinning — never truly concurrent with a running CPU.)
#   Attempt 7:   `BPINT 16` (keyboard, all AH) armed via `Invoke-DebuggerInput` AFTER the guest
#                was already running post-boot-menu — never fired within 12s. Consistent with
#                Attempt 6's finding: a command sent to an already-running guest is not actually
#                processed at all, so the arm itself likely never took effect.
#   WORKING TECHNIQUE (this round's actual solution, folding in the Attempt-6/7 lesson): arm
#   `BPINT 16` (keyboard) WHILE GENUINELY STOPPED — piggybacking on the pre-boot calibration
#   stop (from `BPINT 21 42`, which DOES reliably fire once, early) — so the arm command is
#   guaranteed to be processed. Then thread every subsequent wait in the boot sequence (Phase
#   1-3 sleeps, and the Phase 4-5 Load-Saved-Game polling) through a generic
#   "poll-for-a-stop-and-opportunistically-handle-it" helper: on the FIRST genuine stop seen
#   anywhere in the session (wherever in the route INT 16h actually first gets hit — plausibly
#   during the boot main menu's key-polling idle loop, or possibly not until an actual blocking
#   keyboard read during Load Saved Game), take the memory dump and run the signature search
#   right there, since we cannot know in advance exactly where the first INT 16h will land.
#
# Session structure (single DOSBox-X/GameLink session, no reboot between stages):
#   Stage A — reach the boot main menu and beyond (same proven §7-§9 route), transparently
#             capturing the conventional-memory dump + signature search on whichever stop comes
#             first via BPINT 16.
#   Stage B — once live addresses are found: arm REAL `BP` breakpoints there (done immediately,
#             while already stopped, inside the same handler), and continue the rest of the
#             proven route (journal-word protection solve, the 2 movement keys that trigger the
#             documented crash), watching for a hit by comparing LIVE physical addresses
#             (cs*16+ip), not seg:off text — deliberately robust to the CPU reporting some other
#             real seg:off pair for the same physical location.
#
# ROUND 10 ADDITIONS (cok-m4-fidelity-plan.md §18): round 9 only ever dumped-and-searched ONCE,
# at the first genuine stop after Phase 4 (Load Saved Game) -- which found `combat_setup_entry`
# NOT resident that early. This round adds: (1) a second (and, if needed, third) forced
# dump-and-search re-armed right before/between the scripted movement keys, i.e. as close to the
# "MONSTERS ATTACK!"/"DISK READ ERROR" crash as a real halt can get (see the Phase-7 comment for
# why halting literally INSIDE the freeze is architecturally impossible with this technique); (2)
# bounded post-freeze stop-polling, direct live evidence for/against the Unicorn-trace claim that
# the freeze itself has zero interrupt activity; (3) a dump-attempt history (`$script:dumpAttempts`
# / report.json `dump_attempts`) instead of round 9's single overwritten result, and de-duplicated
# BP arming so re-finding an already-armed address doesn't re-issue a redundant `BP` command.
#
# Usage:
#   pwsh tools/cok-m4-memory-signature-route.ps1 -MountDir build/cok-on-dqk-m4fidelity `
#     -OutDir build/cok-m4-memsig-run1 -MovementKeys right,up

param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$OutDir,
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
  [string[]]$MovementKeys = @('right','up'),
  [ValidateRange(1,120)][int]$StopPollTriesPerKey = 30,
  [ValidateRange(50,2000)][int]$StopPollMs = 300,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  # Conventional-memory dump size for the signature search. 0xA0000 (640 KiB) covers all of
  # real-mode conventional memory, where DOS EXE/overlay code must reside to execute directly.
  [string]$DumpSizeHex = '0xA0000',
  # ROUND 10: round 9's own §17.4 next step -- don't stop at ONE dump-and-search (taken at the
  # first genuine stop, which round 9 found landed during Load Saved Game, well before combat).
  # When true, the idempotence guard is deliberately re-armed once the dungeon is reached (right
  # before the scripted movement keys) so a SECOND dump-and-search happens at the closest real
  # halt point to the "MONSTERS ATTACK!"/"DISK READ ERROR" crash a BPINT-based technique can
  # reach (see the Phase-7 comment below for why halting INSIDE the freeze itself is not
  # possible). If `combat_setup_entry` still isn't found after the first movement key, it is
  # re-armed again before the second key too.
  [bool]$RedumpNearCombat = $true,
  # ROUND 10: bounded extra stop-polling after the scripted movement completes with no hit, to
  # gather direct DOSBox-X-side evidence on whether the freeze ever produces a genuine debugger
  # stop at all (the Unicorn trace says no interrupts fire once inside it -- this is the live
  # confirmation/refutation of that claim, not just another dump attempt).
  [ValidateRange(0,60)][int]$PostFreezeExtraPollTries = 20
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mount = Resolve-Path (Join-Path $repo $MountDir)
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$fastClickScript = Join-Path $out '_fast_play_click.py'
. (Join-Path $repo 'tools\dosbot\lib.ps1')  # Invoke-Vision only

if (-not (Test-Path $dbx)) { throw "DOSBox-X build not found: $dbx" }
if (-not (Test-Path $helperDll)) {
  & dotnet build $helperProject --configuration Release
  if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }
}

# --- Reference signatures, read directly from the retail/ported DQK.EXE (byte-identical in
# this region per this round's own pre-flight check — see the plan doc §17). ---------------
$dqkExePath = Join-Path $mount 'DQK.EXE'
if (-not (Test-Path $dqkExePath)) { throw "DQK.EXE not found under mount: $dqkExePath" }
$dqkBytes = [IO.File]::ReadAllBytes($dqkExePath)
function Get-Sig([int]$fileOffset, [int]$len) {
  return $dqkBytes[$fileOffset..($fileOffset + $len - 1)]
}
$sigTargets = @(
  [ordered]@{ name = 'combat_setup_entry'; file_offset = 0x356DC; full = (Get-Sig 0x356DC 96); prefix_len = 16 }
  [ordered]@{ name = 'add_combatant_to_active_roster'; file_offset = 0x359E6; full = (Get-Sig 0x359E6 96); prefix_len = 16 }
)
foreach ($t in $sigTargets) {
  $t.prefix = $t.full[0..($t.prefix_len - 1)]
  $t.full_hex = (($t.full | ForEach-Object { '{0:X2}' -f $_ }) -join '')
  $t.prefix_hex = (($t.prefix | ForEach-Object { '{0:X2}' -f $_ }) -join '')
  Write-Host ("[cok-m4-memsig] signature '{0}' file_offset=0x{1:X} prefix={2}" -f $t.name, $t.file_offset, $t.prefix_hex)
}

# --- Host-side signature-search Python script + targets JSON, written ONCE up front so the
# --- live handler (Invoke-MemDumpAndSignatureSearch, defined below) can invoke it from
# --- whichever stop happens to be the first one this run. ----------------------------------
$sigTargetsForPy = $sigTargets | ForEach-Object {
  [ordered]@{ name = $_.name; file_offset = $_.file_offset; prefix_hex = $_.prefix_hex; full_hex = $_.full_hex }
}
$sigTargetsJsonPath = Join-Path $out 'signature-targets.json'
$sigTargetsForPy | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $sigTargetsJsonPath -Encoding utf8
$searchPy = Join-Path $out '_search_signatures.py'
@'
import json, sys
mem_path, targets_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(mem_path, 'rb') as f:
    mem = f.read()
with open(targets_path, 'r') as f:
    targets = json.load(f)
results = []
for t in targets:
    prefix = bytes.fromhex(t['prefix_hex'])
    full = bytes.fromhex(t['full_hex'])
    matches = []
    start = 0
    while True:
        idx = mem.find(prefix, start)
        if idx < 0:
            break
        # byte-diff of the full reference window against live memory at this offset
        live_full = mem[idx:idx + len(full)]
        diffs = [i for i in range(min(len(live_full), len(full))) if live_full[i] != full[i]]
        matches.append({
            'linear_offset': idx,
            'linear_offset_hex': f'{idx:06X}',
            'full_window_diff_byte_count': len(diffs),
            'full_window_diff_positions': diffs[:16],
        })
        start = idx + 1
    results.append({'name': t['name'], 'file_offset': t['file_offset'], 'match_count': len(matches), 'matches': matches})
with open(out_path, 'w') as f:
    json.dump(results, f, indent=2)
print(json.dumps(results, indent=2))
'@ | Set-Content -LiteralPath $searchPy -Encoding utf8

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
function Wait-ExclusiveDosboxSlot {
  Write-Host '[cok-m4-memsig] waiting for an empty dosbox-x.exe process list (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-DosboxPids).Count -eq 0) { return }
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}
function Assert-ExclusiveOwnership {
  $foreign = @(Get-DosboxPids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) ($($foreign -join ',')) while own pid is $($process.Id)"
  }
}

$dbgStep = 0
function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  if (-not $Label) { $Label = "dbg{0:D5}" -f $script:dbgStep }
  $script:dbgStep++
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for $Label`: $($status.Error)" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}
function Get-Stopped([string]$Snapshot) { return $Snapshot -notmatch '(?m)^\(Running\)\s*$' }
function Get-Reg([string]$Snapshot, [string]$Name) {
  $m = [regex]::Match($Snapshot, '\b' + $Name + '=([0-9A-Fa-f]+)\b')
  if (-not $m.Success) { return $null }
  return [Convert]::ToUInt32($m.Groups[1].Value, 16)
}
function Get-CsIp([string]$Snapshot) {
  $cs = Get-Reg $Snapshot 'CS'
  $eip = Get-Reg $Snapshot 'EIP'
  if ($null -eq $cs -or $null -eq $eip) { return $null }
  $ip = $eip -band 0xFFFF
  return [ordered]@{ cs = $cs; ip = $ip; phys = ($cs * 16 + $ip) }
}
function Get-DataBytes([string]$Snapshot) {
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}\s+((?:[0-9A-Fa-f]{2}\s+){15}[0-9A-Fa-f]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}
function Get-AsciiText([byte[]]$Bytes) {
  $sb = [Text.StringBuilder]::new()
  foreach ($b in $Bytes) {
    if ($b -ge 0x20 -and $b -le 0x7E) { $sb.Append([char]$b) | Out-Null }
    elseif ($b -eq 0) { $sb.Append('.') | Out-Null }
    else { $sb.Append('?') | Out-Null }
  }
  return $sb.ToString()
}
function Get-Word16([byte[]]$b, [int]$i) {
  if ($b.Length -ge ($i + 2)) { return [int]$b[$i] -bor ([int]$b[$i + 1] -shl 8) }
  return $null
}

function Save-ViewablePng([string]$rawPng) {
  $viewPng = [System.IO.Path]::ChangeExtension($rawPng, $null) + '-view.png'
  & python -c @"
from PIL import Image
im = Image.open(r'$rawPng').convert('RGBA')
r,g,b,a = im.split()
Image.merge('RGB',(r,g,b)).save(r'$viewPng')
"@ 2>$null | Out-Null
}
$timeline = [Collections.Generic.List[object]]::new()
function Shoot([string]$name) {
  Assert-ExclusiveOwnership
  $png = Join-Path $out "$name.png"
  & python $gameLink screenshot $png | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "[cok-m4-memsig] WARN: screenshot failed for $name"; return $null }
  Save-ViewablePng $png
  $rec = $null
  try {
    $v = Invoke-Vision -Png $png
    $rec = [pscustomobject]@{ name = $name; screen = $v.screen; text = "$($v.visible_text)"; png = "$name.png" }
    Write-Host ("  [{0,-18}] {1,-12} | {2}" -f $name, $v.screen, $rec.text)
  } catch {
    Write-Host "  [$name] (vision read unavailable: $($_.Exception.Message))"
    $rec = [pscustomobject]@{ name = $name; screen = 'unknown'; text = ''; png = "$name.png" }
  }
  $timeline.Add($rec) | Out-Null
  return $rec
}
function Press([string[]]$Keys, [double]$Pace = 0.3, [double]$Hold = 0.15) {
  Assert-ExclusiveOwnership
  foreach ($k in $Keys) {
    & python $gameLink press $k --hold $Hold --pace $Pace | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GameLink press failed for: $k" }
  }
}
function Type-WordAndConfirm([string]$Word, [string]$ShotName) {
  foreach ($ch in $Word.ToLowerInvariant().ToCharArray()) {
    if ($ch -match '[a-z0-9]') { Press @([string]$ch) 0.3 0.2 }
  }
  return Shoot $ShotName
}
function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[cok-m4-memsig] no journal text at $JournalTxt"; return $null }
  $cliArgs = @('-y','tsx@4', (Join-Path $repo 'tools\dqk-protection-solve.mts'), '--journal', $JournalTxt, '--prompt', $visionText)
  if (Test-Path $CodesTxt) { $cliArgs += @('--codes', $CodesTxt) }
  $result = (& npx.cmd @cliArgs 2>$null | Out-String).Trim()
  if ($result -and $result -notmatch '\s') { return $result }
  return $null
}

@"
import sys, time
sys.path.insert(0, r'$($repo -replace "'", "''")\tools')
from dosbox_gamelink import GameLink

link = GameLink()
t0 = time.time()
link.move_mouse(-5000.0, -5000.0)
link.move_mouse(35.0, 384.0)
link.click(0, hold=0.05)
print(f'click sequence took {time.time()-t0:.3f}s')
"@ | Set-Content -LiteralPath $fastClickScript -Encoding utf8
function Invoke-FastPlayClick {
  Assert-ExclusiveOwnership
  & python $fastClickScript
  if ($LASTEXITCODE -ne 0) { throw 'fast PLAY click failed' }
}

# Self-validating near/far return-address check (ported from round 8's script — see
# cok-m4-fidelity-plan.md §12.3/§13.2/§16.1).
function Test-CallEndsAt([string]$segHex, [Nullable[int]]$off) {
  if ($null -eq $off -or $off -lt 5) { return $null }
  $readOff = ($off - 5) -band 0xFFFF
  $snap = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $segHex, $readOff) -Label ("callcheck-{0}-{1:X4}" -f $segHex, $off)
  $bytes = Get-DataBytes $snap
  if ($bytes.Length -lt 5) { return $null }
  if ($bytes[0] -eq 0x9A) { return 'far-call(9A)-MATCH' }
  if ($bytes[2] -eq 0xE8) { return 'near-call(E8)-MATCH' }
  return 'no-call-ending-here'
}

$bpCaptures = [Collections.Generic.List[object]]::new()
function Get-DetailedCapture([string]$snap, [string]$phase, [string]$key, [string]$whichTarget) {
  $csIp = Get-CsIp $snap
  $ss = Get-Reg $snap 'SS'
  $spVal = Get-Reg $snap 'ESP'
  $sp = if ($null -ne $spVal) { $spVal -band 0xFFFF } else { $null }
  $ds = Get-Reg $snap 'DS'
  $es = Get-Reg $snap 'ES'
  $ax = Get-Reg $snap 'EAX'; $bx = Get-Reg $snap 'EBX'; $cx = Get-Reg $snap 'ECX'; $dx = Get-Reg $snap 'EDX'
  $si = Get-Reg $snap 'ESI'; $di = Get-Reg $snap 'EDI'

  $stackBytes = @()
  if ($null -ne $ss -and $null -ne $sp) {
    $stackSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ss, $sp) -Label ("bp-stack-{0}" -f $script:bpCaptures.Count)
    $stackBytes = Get-DataBytes $stackSnap
  }

  $farRetIp = Get-Word16 $stackBytes 0
  $farRetCs = Get-Word16 $stackBytes 2
  $farParam1 = Get-Word16 $stackBytes 4
  $farParam2 = Get-Word16 $stackBytes 6
  $farParam3 = Get-Word16 $stackBytes 8
  $farValid = if ($null -ne $farRetCs) { Test-CallEndsAt ('{0:X4}' -f $farRetCs) $farRetIp } else { $null }

  $nearRetIp = Get-Word16 $stackBytes 0
  $nearParam1 = Get-Word16 $stackBytes 2
  $nearParam2 = Get-Word16 $stackBytes 4
  $nearParam3 = Get-Word16 $stackBytes 6
  $nearParam4 = Get-Word16 $stackBytes 8
  $nearValid = if ($csIp) { Test-CallEndsAt ('{0:X4}' -f $csIp.cs) $nearRetIp } else { $null }

  $resNameSnap = if ($null -ne $ds) {
    Invoke-DebuggerInput -Command ('D {0:X4}:5FFD' -f $ds) -Label ("bp-resname-{0:D2}" -f $script:bpCaptures.Count)
  } else { $null }
  $resNameBytes = if ($resNameSnap) { Get-DataBytes $resNameSnap } else { @() }

  # Ghidra's decompile of AddCombatantToActiveRoster (§15.4): if (*(byte*)((int)*(far*)DS:0xB20F
  # + 0x20) < 8) -- the 8-slot roster-cap gate. Read it live as an independent cross-check.
  $rosterFarPtrBytes = @()
  $rosterCountByte = $null
  if ($null -ne $ds) {
    $rosterPtrSnap = Invoke-DebuggerInput -Command ('D {0:X4}:B20F' -f $ds) -Label ("bp-rosterptr-{0:D2}" -f $script:bpCaptures.Count)
    $rosterFarPtrBytes = Get-DataBytes $rosterPtrSnap
    $rosterOff = Get-Word16 $rosterFarPtrBytes 0
    $rosterSeg = Get-Word16 $rosterFarPtrBytes 2
    if ($null -ne $rosterOff -and $null -ne $rosterSeg) {
      $countAddrOff = ($rosterOff + 0x20) -band 0xFFFF
      $countSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $rosterSeg, $countAddrOff) -Label ("bp-rostercount-{0:D2}" -f $script:bpCaptures.Count)
      $countBytes = Get-DataBytes $countSnap
      if ($countBytes.Length -ge 1) { $rosterCountByte = $countBytes[0] }
    }
  }

  $capture = [ordered]@{
    phase = $phase
    after_key = $key
    which_target = $whichTarget
    full_snapshot = $snap
    cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); phys = ('{0:X5}' -f $csIp.phys)
    ss = if ($ss) { '{0:X4}' -f $ss } else { $null }
    sp = if ($sp) { '{0:X4}' -f $sp } else { $null }
    ds = if ($ds) { '{0:X4}' -f $ds } else { $null }
    es = if ($es) { '{0:X4}' -f ($es -band 0xFFFF) } else { $null }
    ax = if ($null -ne $ax) { '{0:X4}' -f ($ax -band 0xFFFF) } else { $null }
    bx = if ($null -ne $bx) { '{0:X4}' -f ($bx -band 0xFFFF) } else { $null }
    cx = if ($null -ne $cx) { '{0:X4}' -f ($cx -band 0xFFFF) } else { $null }
    dx = if ($null -ne $dx) { '{0:X4}' -f ($dx -band 0xFFFF) } else { $null }
    si = if ($null -ne $si) { '{0:X4}' -f ($si -band 0xFFFF) } else { $null }
    di = if ($null -ne $di) { '{0:X4}' -f ($di -band 0xFFFF) } else { $null }
    stack_raw_hex = (($stackBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
    far_call_hypothesis = [ordered]@{
      ret_ip = if ($null -ne $farRetIp) { '{0:X4}' -f $farRetIp } else { $null }
      ret_cs = if ($null -ne $farRetCs) { '{0:X4}' -f $farRetCs } else { $null }
      param1 = if ($null -ne $farParam1) { '{0:X4}' -f $farParam1 } else { $null }
      param2 = if ($null -ne $farParam2) { '{0:X4}' -f $farParam2 } else { $null }
      param3 = if ($null -ne $farParam3) { '{0:X4}' -f $farParam3 } else { $null }
      call_check = $farValid
    }
    near_call_hypothesis = [ordered]@{
      ret_ip = if ($null -ne $nearRetIp) { '{0:X4}' -f $nearRetIp } else { $null }
      param1 = if ($null -ne $nearParam1) { '{0:X4}' -f $nearParam1 } else { $null }
      param2 = if ($null -ne $nearParam2) { '{0:X4}' -f $nearParam2 } else { $null }
      param3 = if ($null -ne $nearParam3) { '{0:X4}' -f $nearParam3 } else { $null }
      param4 = if ($null -ne $nearParam4) { '{0:X4}' -f $nearParam4 } else { $null }
      call_check = $nearValid
    }
    resource_name_bytes_ascii = Get-AsciiText $resNameBytes
    roster_far_ptr_raw_hex = (($rosterFarPtrBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
    roster_count_byte = if ($null -ne $rosterCountByte) { '0x{0:X2}' -f $rosterCountByte } else { $null }
  }
  $script:bpCaptures.Add($capture) | Out-Null
  Write-Host ("  [capture:{0}] CS:IP={1}:{2} phys={3} stack={4}" -f $whichTarget, $capture.cs, $capture.ip, $capture.phys, $capture.stack_raw_hex)
  Write-Host ("  [capture:{0}] near-hyp ret={1}:{2} p1={3} p2={4} p3={5} p4={6} check={7}" -f $whichTarget, $csIp.cs.ToString('X4'), $capture.near_call_hypothesis.ret_ip, $capture.near_call_hypothesis.param1, $capture.near_call_hypothesis.param2, $capture.near_call_hypothesis.param3, $capture.near_call_hypothesis.param4, $capture.near_call_hypothesis.call_check)
  Write-Host ("  [capture:{0}] far-hyp  ret={1}:{2} p1={3} p2={4} p3={5} check={6}" -f $whichTarget, $capture.far_call_hypothesis.ret_cs, $capture.far_call_hypothesis.ret_ip, $capture.far_call_hypothesis.param1, $capture.far_call_hypothesis.param2, $capture.far_call_hypothesis.param3, $capture.far_call_hypothesis.call_check)
  return $capture
}

# ===== Opportunistic memory-dump-and-signature-search handler =============================
# Called on the FIRST genuine stop seen anywhere after the calibration point (from whichever
# BPINT 16 hit happens to land first — see the header comment for why we can't predict exactly
# where). Dumps conventional memory, runs the host-side signature search, and immediately arms
# real `BP` breakpoints at any found targets (safe to do here since the guest is, by
# construction, genuinely stopped when this is called). Idempotent via $script:memDumpDone.
$script:memDumpDone = $false
$script:targets = @()          # list of @{ name; phys; seg; off }
$script:sigResults = $null
$script:dumpAttempts = [Collections.Generic.List[object]]::new()   # ROUND 10: full history, one entry per dump-and-search call (round 9 only ever kept the last)
$script:dumpSize = [Convert]::ToInt32($DumpSizeHex, 16)
function Invoke-MemDumpAndSignatureSearch([string]$pausedSnap, [string]$label) {
  if ($script:memDumpDone) { return }
  $csIp = Get-CsIp $pausedSnap
  if ($csIp) {
    Write-Host ("[cok-m4-memsig] genuine stop at {0:X4}:{1:X4} (label={2}) -- dumping memory now." -f $csIp.cs, $csIp.ip, $label)
  }
  $memDumpPath = Join-Path $out 'MEMDUMP.BIN'
  # ROUND-9 ATTEMPT-14 FIX: delete any stale/leftover MEMDUMP.BIN before issuing the command so a
  # file found afterward is unambiguously fresh from THIS invocation (rules out a prior no-op call
  # -- e.g. one issued while not genuinely stopped -- leaving a misleading 0-byte file behind that
  # we'd otherwise misread as "this attempt's" result). Also retry the MEMDUMPBIN command itself up
  # to 3x if the file comes back empty: the guest is still genuinely stopped at this point (we only
  # get here from a confirmed Get-Stopped snapshot), so a second console command should process
  # exactly like the first -- if attempt 1 raced something transient, attempt 2 should not.
  if (Test-Path -LiteralPath $memDumpPath) { Remove-Item -LiteralPath $memDumpPath -Force }
  $actualLen = 0
  for ($dumpTry = 1; $dumpTry -le 3; $dumpTry++) {
    # ROUND-9 ROOT CAUSE (confirmed by reading debug.cpp's GetHexValue): the debugger console's
    # hex-token scanner accepts isalpha/isdigit/'_' characters into a token, then separately
    # requires EVERY character to satisfy isxdigit before treating it as a hex literal. The 'x' in
    # a "0x"-prefixed value like 0xA0000 is alphabetic (so it's included in the token) but is NOT a
    # hex digit -- so `hexnumber` gets latched false and GetHexValue falls through to `return 0`.
    # MEMDUMPBIN's num argument silently parsed as 0 on every single try across attempts 14 and 15
    # (100% reproducible, not transient) -- SaveMemoryBin's fwrite loop then runs zero iterations,
    # yet still fopen()/fclose() successfully and unconditionally prints "success". Fix: pass the
    # size WITHOUT the 0x prefix -- this debugger's hex fields are implicitly hex, never decimal.
    Write-Host ("[cok-m4-memsig] MEMDUMPBIN 0000:0000 {0:X} -- writing to {1}\MEMDUMP.BIN (try {2}/3)" -f $script:dumpSize, $out, $dumpTry)
    if (Test-Path -LiteralPath $memDumpPath) { Remove-Item -LiteralPath $memDumpPath -Force }
    Invoke-DebuggerInput -Command ('MEMDUMPBIN 0000:0000 {0:X}' -f $script:dumpSize) -Label ("memdump-{0}-try{1}" -f $label, $dumpTry) | Out-Null
    $dumpDeadline = [DateTime]::UtcNow.AddSeconds(20)
    $lastLen = -1
    while ([DateTime]::UtcNow -lt $dumpDeadline) {
      if (Test-Path -LiteralPath $memDumpPath) {
        $fi = [System.IO.FileInfo]::new($memDumpPath)
        $fi.Refresh()
        $len = $fi.Length
        if ($len -eq $script:dumpSize -and $len -eq $lastLen) { break }
        $lastLen = $len
      }
      Start-Sleep -Milliseconds 300
    }
    if (Test-Path -LiteralPath $memDumpPath) {
      $fi = [System.IO.FileInfo]::new($memDumpPath)
      $fi.Refresh()
      $actualLen = $fi.Length
    } else {
      $actualLen = 0
    }
    Write-Host ("[cok-m4-memsig] MEMDUMP.BIN try {0}/3: {1} bytes (expected {2})" -f $dumpTry, $actualLen, $script:dumpSize)
    if ($actualLen -gt 0) { break }
  }
  if ($actualLen -eq 0) {
    Write-Host "[cok-m4-memsig] MEMDUMPBIN produced a 0-byte (or missing) file on all 3 tries while genuinely stopped (label=$label) -- will retry on a later stop if any occur, else this is the round's honest dead end."
    return
  }

  # ROUND 10: per-attempt filename (round 9 only ever wrote one, fixed-named, file -- with a
  # second dump now possible, keep each attempt's raw result distinctly addressable by label).
  $sigJsonPath = Join-Path $out "signature-search-$label.json"
  # ROUND-9 ROOT CAUSE (found by exact-timestamp file forensics, since no exception was ever
  # thrown so nothing "looked" broken): this `& python ...` call was UNSUPPRESSED. Any stdout the
  # Python script prints becomes part of THIS function's own implicit return value (PowerShell
  # functions return every unsuppressed pipeline output, not just the `return` statement's value).
  # Invoke-MemDumpAndSignatureSearch is itself called as a bare statement (no `| Out-Null`) inside
  # Wait-WhileLoggingHits -- so those leaked lines got concatenated onto ITS OWN `return $false`,
  # turning `$earlyHit = Wait-WhileLoggingHits ...` into a multi-element ARRAY (string lines plus
  # $false) instead of a clean boolean. A non-empty array is TRUTHY in PowerShell regardless of
  # its last element's value, so every downstream `-not $earlyHit` guard (Phase 4-7) silently
  # short-circuited from that point on, and the run jumped straight from the first genuine stop
  # to writing report.json -- with NO exception anywhere, hence no error to notice. Fix: suppress
  # the external command's output explicitly (and see the defensive `| Out-Null` added at this
  # function's own call site, so the same class of bug can't recur even if a future edit adds
  # another unsuppressed command inside this function).
  & python $searchPy $memDumpPath $sigTargetsJsonPath $sigJsonPath | Out-Null
  $results = Get-Content -LiteralPath $sigJsonPath -Raw | ConvertFrom-Json
  $script:sigResults = $results
  # ROUND 10: keep the generic fixed-name file too (backward compat with round 9's report
  # reader / anyone grepping for it), always reflecting the MOST RECENT attempt.
  Copy-Item -LiteralPath $sigJsonPath -Destination (Join-Path $out 'signature-search.json') -Force
  $script:dumpAttempts.Add([ordered]@{ label = $label; results = $results }) | Out-Null
  $script:memDumpDone = $true

  Write-Host ("[cok-m4-memsig] === dump-and-search attempt #{0} (label='{1}') ===" -f $script:dumpAttempts.Count, $label)
  # ROUND 10: track only NEWLY-found (name,phys) pairs from THIS attempt -- with multiple dump
  # attempts now possible, re-arming an already-armed BP every call would be redundant (and
  # would misleadingly re-log "armed BP" for something armed several stops ago).
  $newTargetsThisCall = @()
  foreach ($r in $results) {
    Write-Host ("[cok-m4-memsig] signature '{0}' (file 0x{1:X}): {2} match(es) in live memory" -f $r.name, $r.file_offset, $r.match_count)
    if ($r.match_count -ge 1) {
      foreach ($m in $r.matches) {
        # ROUND-9 FIX: [math]::Floor returns a System.Double -- the "X" (hex) format specifier
        # throws "Format specifier was invalid" against a double, only integer types support it.
        # Standard real-mode seg:off normalization for a linear/physical address: seg = high bits
        # (linear >> 4), off = low nibble (linear & 0xF) -- equivalent to the prior floor/mod but
        # via integer ops so the result is an [int] the {X4} formatter can actually consume.
        $seg = [int]([int64]$m.linear_offset -shr 4)
        $off = [int]([int64]$m.linear_offset -band 0xF)
        Write-Host ("    linear=0x{0:X} -> seg:off = {1:X4}:{2:X4}  (full-96-byte diff: {3} bytes differ)" -f [int64]$m.linear_offset, $seg, $off, $m.full_window_diff_byte_count)
      }
      $best = $r.matches[0]
      # Same [math]::Floor-returns-a-double bug as above -- this one is load-bearing (feeds the
      # real `BP {0:X4}:{1:X4}` arm command below), so it would have thrown there too.
      $seg = [int]([int64]$best.linear_offset -shr 4)
      $off = [int]([int64]$best.linear_offset -band 0xF)
      $phys = [int64]$best.linear_offset
      $alreadyKnown = @($script:targets | Where-Object { $_.name -eq $r.name -and $_.phys -eq $phys }).Count -gt 0
      if (-not $alreadyKnown) {
        $t = [ordered]@{ name = $r.name; phys = $phys; seg = $seg; off = $off; found_at_label = $label }
        $script:targets += $t
        $newTargetsThisCall += $t
      } else {
        Write-Host ("    (same address as an already-armed target for '{0}' -- not re-arming)" -f $r.name)
      }
    }
  }

  if ($newTargetsThisCall.Count -eq 0) {
    Write-Host ("[cok-m4-memsig] *** no NEW signature addresses found in this attempt (label='{0}'). *** cumulative targets so far: {1}" -f $label, $script:targets.Count)
  } else {
    foreach ($t in $newTargetsThisCall) {
      Invoke-DebuggerInput -Command ('BP {0:X4}:{1:X4}' -f $t.seg, $t.off) -Label ("bp-arm-{0}-{1}" -f $t.name, $label) | Out-Null
      Write-Host ("[cok-m4-memsig] armed BP {0:X4}:{1:X4} for '{2}' (phys 0x{3:X}, found at '{4}')" -f $t.seg, $t.off, $t.name, $t.phys, $label)
    }
  }
}

function Test-IsTargetHit($csIp) {
  if (-not $csIp -or $script:targets.Count -eq 0) { return $null }
  foreach ($t in $script:targets) {
    if ($csIp.phys -eq $t.phys) { return $t.name }
  }
  return $null
}

# Generic "wait for N seconds, transparently absorbing any stop we hit along the way" helper
# used through Phase 1-3 (before we've reached the boot main menu). Deliberately LIGHTWEIGHT --
# detect-and-immediately-RESUME only, NO memory dump here. ROUND 9 FINDING (Attempt 8, recorded
# not smoothed over): BPINT 16 fires CONSTANTLY during the loading-screen window (a tight
# "LOADING...PLEASE WAIT" keyboard-idle-poll loop at a stable address, confirmed live), and (a)
# a dump taken at the very first such stop (still inside Phase 2, before the title screen even
# rendered) found ZERO matches for either signature -- the combat routines are not yet resident
# in memory that early, consistent with an overlay-loaded architecture -- and (b) paying the
# full ~20s MEMDUMPBIN-plus-poll cost on that first stop stalled real-time progress badly enough
# that the ESC-skip loop never reached the boot main menu within its budget (16/16 iterations
# still showed the loading screen). So: Phase 1-3 only ever detects-and-resumes here (cheap,
# just a debugger round-trip), and the REAL dump is deferred to Wait-WhileLoggingHits' first
# stop from Phase 4 (Load Saved Game) onward, where the game is far more fully loaded and the
# target routines have a much better chance of already being resident.
function Wait-OrHandleInt16([double]$Seconds, [string]$Label) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  $n = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("wait-{0}-{1:D3}" -f $Label, $n)
    $n++
    if (Get-Stopped $snap) {
      Invoke-DebuggerInput -Command 'RUN' -Label ("wait-resume-{0}-{1:D3}" -f $Label, $n) | Out-Null
    }
  }
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  # Arm `BPINT 21 42` (lseek -- proven-reliable during the pre-boot loading burst) before the
  # very first `RUN`, exactly as every proven prior round (6-8) does. That initial wait matters
  # beyond its original arithmetic purpose (which this round doesn't need): it is an implicit
  # synchronization point, giving DOSBox-X's own DEBUGBOX->RUN transition time to settle before
  # the fixed-duration Phase 1/2 sleeps start counting -- skipping it caused real, observed
  # timing drift earlier this round (a screenshot showed the DOSBox-X BIOS POST splash, not
  # even DQK's title screen).
  & $probe -DbxExe $dbx -GameDir $mount -Exe 'DQK.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('BPINT 21 42','RUN') -NoActionScreenshots -ExtraSdlConf 'mouse_emulation=always'
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership

  $calibDeadline = [DateTime]::UtcNow.AddSeconds(30)
  $calibSnap = $null
  while ([DateTime]::UtcNow -lt $calibDeadline) {
    $s = Invoke-DebuggerInput -SnapshotOnly -Label 'calib-poll'
    if (Get-Stopped $s) { $calibSnap = $s; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $calibSnap) { throw 'calibration: BPINT 21 42 never stopped within 30s (pre-boot arm)' }
  $calibCsIp = Get-CsIp $calibSnap
  Write-Host ("[cok-m4-memsig] pre-boot calibration stop at {0:X4}:{1:X4} (synchronization only -- arithmetic value unused this round)" -f $calibCsIp.cs, $calibCsIp.ip)
  # ATTEMPT 8 FINDING: leaving `BPINT 21 42` armed (Attempt 4-5's "never fires a second time"
  # assumption, which only held from the ESC-skip loop forward) let it fire CONSTANTLY on real
  # lseeks during the "LOADING...PLEASE WAIT" screen -- 24 nominal-1s waits cost ~144 real
  # seconds and never cleared the screen. ATTEMPT 9's `BPINT 16 0` (AH=00) filter didn't help
  # because the culprit was never BPINT 16 -- it was the still-armed INT21 42 firing at a new
  # address (`08FB:274E`, `EAX=00004200`) during genuine disk I/O.
  # ATTEMPT 10 FIX: `BPDEL *` + arm `BPINT 16` immediately here at calibration -- this DID clear
  # the loading-screen stall, but introduced a NEW problem: `wait-post-enter-*`/
  # `wait-post-playclick-*` snapshots showed BPINT 16 already firing during Phase 1-2 (title
  # screen input-poll), and the guest was genuinely stopped/paused for part of
  # `Invoke-FastPlayClick`'s ~72ms-total mouse sequence -- exactly the documented "a halted
  # guest silently drops input" gotcha. Result: the PLAY click never registered, and the ESC-
  # skip loop sat on the "PLAY DEMO QUIT" title screen for all 20 iterations, never reaching
  # even the loading screen.
  # ATTEMPT 11 FIX: don't touch breakpoints at all here. Leave `BPINT 21 42` armed through
  # Phase 1-2 (it cannot fire there -- no file I/O happens while idling at the title screen or
  # during the click itself, so this is exactly as safe as every proven prior round, which also
  # always had it armed up to this same point) and do NOT arm `BPINT 16` yet either (arming
  # requires a stop, and creating one here would just reproduce Attempt 10's problem). Instead,
  # let `BPINT 21 42` catch its own NEXT natural stop -- the first real lseek of the loading
  # screen that starts right after the click -- and do the BPDEL+BPINT16 swap AT THAT stop
  # instead, after the click is already safely behind us.
  # ATTEMPT 12 BUG (self-caught before this got mistaken for another real finding): the
  # rewrite that introduced the Attempt-11 plan above ACCIDENTALLY DROPPED the `RUN` that must
  # follow the calibration stop -- the guest was STILL PAUSED (never resumed) through all of
  # Phase 1-2, which is why '01-after-play-click' showed a black/frozen frame and the "post-
  # click" poll immediately found a stop at the exact SAME address as calibration (25BD:0332)
  # -- it was never anything but the still-paused calibration stop. Restored the missing RUN.
  Invoke-DebuggerInput -Command 'RUN' -Label 'calib-resume' | Out-Null
  Assert-ExclusiveOwnership

  Start-Sleep -Seconds 4
  Assert-ExclusiveOwnership

  # --- Phase 2: launch menu -> PLAY. Deliberately zero breakpoint-driven interruption through
  # here (see the Attempt 10/11 comment above) -- pure blind sleeps, identical to every prior
  # proven round. ---------------------------------------------------------------------------
  Press @('enter') 0.2
  Start-Sleep -Seconds 1.5
  Invoke-FastPlayClick
  Start-Sleep -Seconds 1
  $rec = Shoot '01-after-play-click'

  # --- Post-click breakpoint swap: wait for BPINT 21 42's first NATURAL stop after the click
  # (expected almost immediately -- the loading screen's own real lseeks), then swap it out for
  # BPINT 16 while genuinely stopped. If no such stop occurs within budget, that's itself a
  # notable finding (would mean the loading screen doesn't do lseek-based I/O this time, or the
  # click didn't land) -- proceed to Phase 3 with whatever breakpoint state we have; the ESC-
  # skip loop's own vision checks will reveal whether we're actually progressing.
  $postClickSnap = $null
  $postClickDeadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $postClickDeadline) {
    $s = Invoke-DebuggerInput -SnapshotOnly -Label 'postclick-poll'
    if (Get-Stopped $s) { $postClickSnap = $s; break }
    Start-Sleep -Milliseconds 150
  }
  # ATTEMPT 12/13 FINDING: even swapped in HERE (safely after the click), a bare `BPINT 16`
  # (all AH) still fires CONSTANTLY through the title-screen window that follows -- confirmed
  # via `wait-skip05/06/10-*-console.txt`: CS:IP pinned at 08FB:006C/0070 (a tight polling
  # loop, a different address than the earlier lseek loop but the SAME segment 08FB) on every
  # single check, for the entire 20-iteration budget, with the screen never advancing past
  # "PLAY DEMO QUIT". This confirms DQK.EXE's idle/input-wait primitive really is `INT 16h`,
  # spun in a tight loop essentially any time it's waiting on the player -- i.e. this is not a
  # one-off quirk of the very first loading screen, it is how this whole engine idles.
  # ATTEMPT 14 test: arm `BPINT 16 0` (AH=00, blocking-read only) here instead of the bare
  # form -- isolating Attempt 9's untested idea from the confound that invalidated it there
  # (Attempt 9 left the noisy `BPINT 21 42` armed at the same time, so it never got a clean
  # trial). If the idle loop truly polls via AH=01 (check, non-blocking) and only the real
  # "player pressed something" path uses AH=00 (blocking), this should finally stay silent
  # through the idle spin while still giving us a stop the moment a real key is read.
  if ($postClickSnap) {
    $pcCsIp = Get-CsIp $postClickSnap
    if ($pcCsIp) { Write-Host ("[cok-m4-memsig] post-click natural stop at {0:X4}:{1:X4} -- swapping BPINT 21 42 for BPINT 16 0 (AH=00 only) here." -f $pcCsIp.cs, $pcCsIp.ip) }
    Invoke-DebuggerInput -Command 'BPDEL *' -Label 'postclick-bpdel-int2142' | Out-Null
    Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'postclick-arm-bpint16-ah0' | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label 'postclick-resume' | Out-Null
  } else {
    Write-Host '[cok-m4-memsig] WARN: no post-click BPINT 21 42 stop within 15s -- proceeding to Phase 3 without swapping to BPINT 16 (see report for how far we get regardless).'
  }
  Assert-ExclusiveOwnership

  # --- Phase 3: skip intro/credits until the boot main menu. Budget kept slightly above the
  # original 16 (at 20) as a safety margin now that BPINT 16 is only armed post-click. --------
  $atMenu = $false
  for ($i = 1; $i -le 20; $i++) {
    if (-not $rec) { break }
    if ($rec.text -match '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { $atMenu = $true; break }
    Press @('esc') 0.15
    Wait-OrHandleInt16 1 ("skip{0:00}" -f $i)
    $rec = Shoot ('02-skip{0:00}' -f $i)
  }
  if (-not $atMenu) { throw 'never reached the boot main menu' }
  Write-Host '[cok-m4-memsig] reached boot main menu. Memory dump is deferred to the first stop from Phase 4 (Load Saved Game) onward.'

  $distinctCs = [Collections.Generic.HashSet[string]]::new()
  $hitLog = [Collections.Generic.List[object]]::new()
  $bpHit = $null
  $earlyHit = $false
  function Wait-WhileLoggingHits([double]$Seconds, [string]$Phase) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    $n = 0
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 150
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("watch-{0}-{1:D3}" -f $Phase, $n)
      $n++
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        if ($csIp) {
          if (-not $script:memDumpDone) { Invoke-MemDumpAndSignatureSearch $snap $Phase | Out-Null }
          $hitName = Test-IsTargetHit $csIp
          $script:distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          $script:hitLog.Add([ordered]@{ phase = $Phase; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); phys = ('{0:X5}' -f $csIp.phys); target = $hitName }) | Out-Null
          Write-Host ("[cok-m4-memsig] watch-hit phase={0} {1:X4}:{2:X4} target={3}" -f $Phase, $csIp.cs, $csIp.ip, $hitName)
          if ($hitName) {
            $script:bpHit = Get-DetailedCapture $snap $Phase $null $hitName
            return $true
          }
          Invoke-DebuggerInput -Command 'RUN' -Label ("watch-resume-{0}-{1:D3}" -f $Phase, $n) | Out-Null
        }
      }
    }
    return $false
  }

  # --- Phase 4-5: Load Saved Game -> (location, if prompted) -> slot A -> Begin Adventuring.
  if (-not $earlyHit) {
    Press @('l') 0.3; $earlyHit = Wait-WhileLoggingHits 2 'after-L'
    $rec = Shoot '03-after-L'
  }
  if (-not $earlyHit -and $rec.text -match '(?i)LOAD FROM WHERE|TDQK') {
    Press @('t') 0.3; $earlyHit = Wait-WhileLoggingHits 2 'after-T'; $rec = Shoot '04-after-T'
  }
  if (-not $earlyHit -and $rec.text -match '(?i)LOAD WHICH GAME|WHICH GAME') {
    Press @('a') 0.3; $earlyHit = Wait-WhileLoggingHits 1 'after-a'
    if (-not $earlyHit) { Press @('enter') 0.3; $earlyHit = Wait-WhileLoggingHits 3 'after-slotA-enter' }
    $rec = Shoot '05-after-slotA'
  }
  $tries = 0
  while (-not $earlyHit -and $rec.text -notmatch '(?i)BEGIN ADVENTUR' -and $tries -lt 3) {
    Press @('enter') 0.3; $earlyHit = Wait-WhileLoggingHits 2 ("load-retry{0:00}" -f $tries)
    $rec = Shoot ('05b-load{0:00}' -f $tries); $tries++
  }
  if (-not $earlyHit) {
    Press @('b') 0.3; $earlyHit = Wait-WhileLoggingHits 3 'after-B'
    $rec = Shoot '06-after-B'
  }

  # --- Phase 6: journal-word protection prompt (skip cleanly if not shown). --------------
  $solvedProtection = $false
  $diskReadError = $false
  for ($j = 1; $j -le 5 -and $rec -and -not $earlyHit; $j++) {
    if ($rec.text -match '(?i)disk read error') { $diskReadError = $true; break }
    if ($rec.text -match '(?i)after the heading|what is word|word #') {
      $promptText = $rec.text
      $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
      if ($extractMatch.Success) { $promptText = $extractMatch.Value }
      $ans = Solve-Protection $promptText
      if (-not $ans) {
        Write-Host "[cok-m4-memsig] journal solve failed on first read, retrying vision read once..."
        $rec = Shoot ('06b-retry-{0:00}' -f $j)
        $promptText = $rec.text
        $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
        if ($extractMatch.Success) { $promptText = $extractMatch.Value }
        $ans = Solve-Protection $promptText
      }
      if (-not $ans) { throw "journal prompt unsolved/low-confidence: $promptText" }
      Write-Host "[cok-m4-memsig] journal solved -> '$ans'"
      $confirmRec = Type-WordAndConfirm $ans ('07-typed-{0:00}' -f $j)
      if ($confirmRec.text -notmatch [regex]::Escape($ans.ToUpperInvariant())) {
        # ROUND-9 SOFTENED (was a hard throw): the vision-OCR screenshot frequently doesn't catch
        # the typed characters' on-screen echo (rendering/capture timing, not a real submission
        # failure) -- Enter is pressed unconditionally right below regardless of this check's
        # result, so treat a non-matching echo as a non-fatal warning rather than aborting the
        # whole run right before the actual combat-route phases this investigation needs to reach.
        Write-Host "[cok-m4-memsig] WARN: typed answer '$ans' not confirmed in on-screen echo ('$($confirmRec.text)') -- continuing anyway (Enter submits regardless)."
      }
      Press @('enter') 0.3
      Wait-OrHandleInt16 3 ("post-journal-{0:00}" -f $j)
      $solvedProtection = $true
      $rec = Shoot ('08-after-journal-{0:00}' -f $j)
      continue
    }
    break
  }

  # --- ROUND 10: round 9's own §17.4 next step. Round 9's single dump-and-search happened at
  # the FIRST genuine stop after Phase 4 (Load Saved Game) -- well before combat -- and found
  # `combat_setup_entry` NOT resident there. Re-arm the idempotence guard here, now that the
  # dungeon has been reached and the journal solved, so the very next genuine debugger stop
  # (expected: DQK's own INT16 idle-wait for the next movement key, per this doc's established
  # "DQK.EXE's idle primitive is a tight INT16h loop, essentially any time it's waiting on the
  # player" finding) triggers a SECOND dump-and-search -- the closest a real halt-based technique
  # can get to the crash moment. Per the plan doc's Unicorn trace (§10.3): "No further INT21/3D
  # open calls occur anywhere after moncha.glb" -- i.e. nothing new loads from disk between here
  # and the freeze, so whatever is resident at this pre-movement idle point is architecturally
  # identical to whatever is resident during the actual "MONSTERS ATTACK!" freeze. Halting
  # literally INSIDE the freeze is not attempted because it is not possible with this technique:
  # the freeze is a pure CPU-bound retry loop with zero interrupt activity (same Unicorn
  # evidence), so a BPINT-gated halt can never trigger there -- see the bounded post-freeze
  # extra-poll after the movement loop below for the live confirmation/refutation of that claim.
  if ($RedumpNearCombat) {
    $script:memDumpDone = $false
    Write-Host '[cok-m4-memsig] ROUND 10: re-armed dump-and-search for the next genuine stop (targeting the pre-movement dungeon idle point).'
  }

  # --- Phase 7: movement, polling the debugger for a hit at either target. ---------------
  $stepIndex = 0
  foreach ($key in $MovementKeys) {
    if ($earlyHit -or $bpHit) { break }
    if ($RedumpNearCombat -and $stepIndex -gt 0) {
      $haveComboEntry = @($script:targets | Where-Object { $_.name -eq 'combat_setup_entry' }).Count -gt 0
      if (-not $haveComboEntry) {
        $script:memDumpDone = $false
        Write-Host "[cok-m4-memsig] ROUND 10: re-armed dump-and-search before key '$key' (combat_setup_entry not yet found live)."
      }
    }
    Press @($key) 0.35
    $stepIndex++
    $hitThisKey = $false
    for ($p = 0; $p -lt $StopPollTriesPerKey; $p++) {
      Start-Sleep -Milliseconds $StopPollMs
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("poll-{0:D2}-{1:D2}" -f $stepIndex, $p)
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        if ($csIp) {
          if (-not $script:memDumpDone) { Invoke-MemDumpAndSignatureSearch $snap ("move-$stepIndex") | Out-Null }
          $hitName = Test-IsTargetHit $csIp
          $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          $hitLog.Add([ordered]@{ phase = "move-$stepIndex"; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); phys = ('{0:X5}' -f $csIp.phys); target = $hitName }) | Out-Null
          if ($hitName) {
            Write-Host "[cok-m4-memsig] *** BREAKPOINT HIT ('$hitName') *** after key '$key' (step $stepIndex)"
            Get-DetailedCapture $snap "move-$stepIndex" $key $hitName | Out-Null
            $hitThisKey = $true
            break
          } else {
            Write-Host ("[cok-m4-memsig] non-target stop at {0:X4}:{1:X4} -- resuming" -f $csIp.cs, $csIp.ip)
            Invoke-DebuggerInput -Command 'RUN' -Label ("nontarget-resume-{0:D2}-{1:D2}" -f $stepIndex, $p) | Out-Null
          }
        }
      }
    }
    Assert-ExclusiveOwnership
    Shoot ("09-walk-{0:D2}-{1}" -f $stepIndex, $key) | Out-Null
    if ($hitThisKey) { $bpHit = $bpCaptures[-1]; break }
  }

  $postFreezeStops = 0
  if (-not $bpHit -and -not $earlyHit) {
    Write-Host "[cok-m4-memsig] breakpoint never hit within the scripted movement -- capturing final state anyway."
    Invoke-DebuggerInput -SnapshotOnly -Label 'final-state' | Out-Null
    Shoot '10-final-no-hit' | Out-Null

    # ROUND 10: bounded extra stop-polling into the freeze itself. This is direct LIVE
    # DOSBox-X-side evidence for/against the Unicorn-trace claim (plan doc §10.3/§10.5) that the
    # "MONSTERS ATTACK!"/"DISK READ ERROR" freeze is a pure CPU-bound retry loop with zero
    # interrupt activity -- if that claim is right, NONE of these polls should ever observe a
    # genuine stop (the debugger stays silently "(Running)" the whole time); any stop found here
    # would be new, decisive evidence the freeze DOES still service some interrupt periodically.
    if ($PostFreezeExtraPollTries -gt 0) {
      Write-Host ("[cok-m4-memsig] ROUND 10: polling {0}x for a genuine stop during the freeze itself (tests whether it EVER produces one)." -f $PostFreezeExtraPollTries)
      for ($q = 0; $q -lt $PostFreezeExtraPollTries; $q++) {
        Start-Sleep -Milliseconds $StopPollMs
        $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("postfreeze-poll-{0:D2}" -f $q)
        if (Get-Stopped $snap) {
          $postFreezeStops++
          $csIp = Get-CsIp $snap
          if ($csIp) {
            Write-Host ("[cok-m4-memsig] *** genuine stop DURING the freeze at {0:X4}:{1:X4} -- this contradicts the 'zero interrupt activity' Unicorn finding. ***" -f $csIp.cs, $csIp.ip)
            if (-not $script:memDumpDone -and $RedumpNearCombat) { Invoke-MemDumpAndSignatureSearch $snap 'postfreeze' | Out-Null }
            $hitName = Test-IsTargetHit $csIp
            $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
            $hitLog.Add([ordered]@{ phase = 'postfreeze'; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); phys = ('{0:X5}' -f $csIp.phys); target = $hitName }) | Out-Null
            if ($hitName) {
              Write-Host "[cok-m4-memsig] *** POST-FREEZE BREAKPOINT HIT ('$hitName') ***"
              Get-DetailedCapture $snap 'postfreeze' $null $hitName | Out-Null
              $bpHit = $bpCaptures[-1]
            }
            Invoke-DebuggerInput -Command 'RUN' -Label ("postfreeze-resume-{0:D2}" -f $q) | Out-Null
          }
          if ($bpHit) { break }
        }
      }
      Write-Host ("[cok-m4-memsig] post-freeze extra polling done: {0} genuine stop(s) observed out of {1} tries." -f $postFreezeStops, $PostFreezeExtraPollTries)
    }
  }

  [ordered]@{
    schema_version = 2
    title = 'CoK M4 combat-setup-entry LIVE MEMORY SIGNATURE SEARCH (round 10 -- adds a second dump-and-search near the crash + post-freeze stop polling, on top of round 9''s technique)'
    mount = $MountDir
    dump_size_bytes = $script:dumpSize
    redump_near_combat = $RedumpNearCombat
    mem_dump_captured = $script:memDumpDone
    dump_attempt_count = $script:dumpAttempts.Count
    dump_attempts = $script:dumpAttempts
    signature_search = $script:sigResults
    live_targets_found = $script:targets
    reached_boot_menu = $atMenu
    solved_protection = $solvedProtection
    disk_read_error = $diskReadError
    movement_keys = $MovementKeys
    breakpoint_hit = [bool]$bpHit
    breakpoint_hit_early = [bool]$earlyHit
    breakpoint_captures = $bpCaptures
    distinct_cs_segments_seen = @($distinctCs)
    hit_log = $hitLog
    post_freeze_extra_poll_tries = $PostFreezeExtraPollTries
    post_freeze_genuine_stops_observed = $postFreezeStops
    timeline = $timeline
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  Write-Host ""
  Write-Host "===== VERDICT ====="
  Write-Host "memory dump attempts: $($script:dumpAttempts.Count)"
  foreach ($a in $script:dumpAttempts) { Write-Host ("  attempt '$($a.label)': " + (($a.results | ForEach-Object { "$($_.name)=$($_.match_count)" }) -join ', ')) }
  Write-Host "targets found       : $($script:targets.Count) of $($sigTargets.Count) signatures"
  foreach ($t in $script:targets) { Write-Host ("  {0}: {1:X4}:{2:X4} (phys 0x{3:X}, found_at={4})" -f $t.name, $t.seg, $t.off, $t.phys, $t.found_at_label) }
  Write-Host "breakpoint hit      : $([bool]$bpHit) (early=$([bool]$earlyHit))"
  Write-Host "post-freeze stops   : $postFreezeStops of $PostFreezeExtraPollTries polls"
  Write-Host "report              : $(Join-Path $out 'report.json')"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
