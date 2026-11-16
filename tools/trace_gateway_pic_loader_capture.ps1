# trace_gateway_pic_loader_capture.ps1 — capture the strict GAME.OVR:0x4687E PIC-loader's
# live arguments and return buffer on the PROVEN native picture-bearing route
# (docs/engine/research/gateway-vga-picture-format.md Parts 14-15; this round = Part 16).
#
# TECHNIQUE (single DOSBox-X DEBUGBOX+GameLink session; all established gotchas honored):
#   1. Launch DEBUGBOX GAME.EXE UseStart against the isolated stage with `BPINT 16 0`
#      (AH=00 blocking keyboard read ONLY — the AH-filtered form that stays silent through
#      AH=01 idle polling, cok-m4-memory-signature-route.ps1 Attempt 14) armed at the entry
#      break, where debugger commands are guaranteed to process (Attempt-6 finding: the
#      console dispatcher only executes commands while the CPU is genuinely halted).
#   2. Replay the proven 17-key route via GameLink, absorbing each blocking-read stop with
#      an immediate RUN (a halted guest silently drops GameLink input, so every press is
#      preceded by an ensure-running check).
#   3. At the first stop on/after the route's step 8 (steps 8-16 provably open zero files —
#      Part 15's per-keypress watermark), swap breakpoints while stopped:
#      BPDEL * ; BPINT 21 3D (file open).
#   4. Send step 17 (BEGIN ADVENTURING). Walk the deterministic open cascade
#      (ECL2→GEO2→WALLDEF/2→8X8D/2 x3→PIC→PIC2) stop by stop, reading each open's DS:DX
#      filename via the debugger's D command, until C:\PIC.dax.
#   5. At the PIC.dax open stop: MEMDUMPBIN 0000:0000 A0000 (no 0x prefix — the debugger's
#      hex scanner silently parses 0x-prefixed values as 0), scan the dump offline for BOTH
#      Part 13 signatures (tools/gateway_pic_capture_analyze.py), require the far-call
#      relocation bytes to be PATCHED vs raw GAME.OVR, and arm real BPs at the exact entry
#      (rel+0) and RETF 0Ch (rel+0x4A1) — live addresses found by byte search, never by
#      remembering a physical overlay window (the retracted Part 11/12 mistake).
#   6. At each loader BP stop, take a fresh full memory dump and extract offline: entry →
#      six argument words + [5D8F]/[5DB6] globals; RETF → same frame slots plus the
#      ss:[bp-2A] output-buffer far pointer and a 7744-byte buffer dump (7744 = Part 7/8's
#      STATIC length; recorded as such). Expected stop sequence: RETF (PIC call, already
#      in flight when the open broke), ENTRY (PIC2), RETF (PIC2).
#
# Usage:
#   pwsh tools/trace_gateway_pic_loader_capture.ps1 -OutDir build\gateway-pic-loader-capture-20260722-a

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [int]$SettleMs = 1800,
  [int]$MaxCascadeStops = 40,
  [int]$MaxLoaderStops = 16,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 300,
  # RUN-A FINDING (build/gateway-pic-loader-capture-20260722-a): a DEBUGBOX session runs the
  # guest ~50x slower in wall terms than the RunDirect native run (its dos-files.log ended
  # mid-boot-preload after the whole 16-key route had been sent — every key was eaten by
  # boot/title phases). Wall-clock pacing therefore CANNOT reproduce the route under the
  # debugger; this script now paces by the live [log] FILES oracle instead (see route loop)
  # and raises cycles to compress the wall cost of guest-time-driven waits.
  [ValidatePattern('^(fixed )?[0-9]+$')][string]$Cycles = 'fixed 100000',
  [ValidateRange(30,1200)][int]$BootGateTimeoutSec = 600,
  [ValidateRange(10,300)][int]$MilestoneTimeoutSec = 120,
  [ValidateRange(5,60)][int]$KeyStopTimeoutSec = 30
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage = (Resolve-Path -LiteralPath (Join-Path $repo $StageDir)).Path
$out = [IO.Path]::GetFullPath((Join-Path $repo $OutDir))
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$analyzer = Join-Path $repo 'tools\gateway_pic_capture_analyze.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
if (-not (Test-Path $dbx)) { throw "DOSBox-X build not found: $dbx" }
if (-not (Test-Path $helperDll)) {
  & dotnet build $helperProject --configuration Release
  if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }
}

# Same stage-integrity pins as recon_gateway_frontend_nav.ps1.
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}
$ovrPath = Join-Path $stage 'GAME.OVR'

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
Write-Host '[pic-capture] checking for an empty dosbox-x.exe process list (GameLink singleton hazard)...'
$deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
while ((Get-DosboxPids).Count -gt 0) {
  if ([DateTime]::UtcNow -ge $deadline) { throw 'timed out waiting for an exclusive dosbox-x.exe slot' }
  Start-Sleep -Seconds 5
}

$dbgStep = 0
$process = $null
function Assert-ExclusiveOwnership {
  if ($process.HasExited) { throw "owned DOSBox-X process $($process.Id) exited unexpectedly" }
  $foreign = @(Get-DosboxPids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) { throw "GameLink ownership lost; foreign PID(s): $($foreign -join ',')" }
}
function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  if (-not $Label) { $Label = 'dbg{0:D5}' -f $script:dbgStep }
  $script:dbgStep++
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $helperArgs = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $helperArgs += '--snapshot-only' } else { $helperArgs += @('--command', $Command) }
  $helperArgs += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @helperArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for ${Label}: $($status.Error)" }
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
function Get-Word16([byte[]]$b, [int]$i) {
  if ($b.Length -ge ($i + 2)) { return [int]$b[$i] -bor ([int]$b[$i + 1] -shl 8) }
  return $null
}
function Get-AsciiText([byte[]]$Bytes) {
  $sb = [Text.StringBuilder]::new()
  foreach ($b in $Bytes) {
    if ($b -ge 0x20 -and $b -le 0x7E) { $sb.Append([char]$b) | Out-Null } else { $sb.Append('.') | Out-Null }
  }
  return $sb.ToString()
}
function Get-OpenFilename([string]$Snapshot, [string]$Label) {
  $ds = Get-Reg $Snapshot 'DS'
  $edx = Get-Reg $Snapshot 'EDX'
  if ($null -eq $ds -or $null -eq $edx) { return $null }
  $dx = $edx -band 0xFFFF
  $nameSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ds, $dx) -Label $Label
  $ascii = Get-AsciiText (Get-DataBytes $nameSnap)
  $m = [regex]::Match($ascii, '^[\x20-\x7E]*?([A-Za-z]:\\[\w\\.\-]+|[\w\\.\-]+\.\w{1,3})')
  # The path is ASCIIZ at DS:DX, i.e. the very start of the dumped window.
  $terminated = $ascii -replace '\.{2,}.*$', ''
  return $terminated
}
$absorbedStops = [Collections.Generic.List[object]]::new()
function Wait-Absorb([double]$Seconds, [string]$Label, [scriptblock]$OnStop = $null) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  $n = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('absorb-{0}-{1:D3}' -f $Label, $n)
    $n++
    if (Get-Stopped $snap) {
      $csIp = Get-CsIp $snap
      $rec = [ordered]@{ label = $Label; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip) }
      $script:absorbedStops.Add($rec) | Out-Null
      Write-Host ("[pic-capture] absorbed stop at {0}:{1} during {2}" -f $rec.cs, $rec.ip, $Label)
      if ($null -ne $OnStop) { & $OnStop $snap }
      else { Invoke-DebuggerInput -Command 'RUN' -Label ('absorb-run-{0}-{1:D3}' -f $Label, $n) | Out-Null }
    }
  }
}
function Confirm-Running([string]$Label) {
  for ($t = 0; $t -lt 20; $t++) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('ensure-{0}-{1:D2}' -f $Label, $t)
    if (-not (Get-Stopped $snap)) { return }
    Invoke-DebuggerInput -Command 'RUN' -Label ('ensure-run-{0}-{1:D2}' -f $Label, $t) | Out-Null
    Start-Sleep -Milliseconds 200
  }
  throw "guest would not stay running before $Label"
}
function Press-Key([string]$Key) {
  Assert-ExclusiveOwnership
  & python $gameLink press $Key | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "GameLink press failed for: $Key" }
}
function Shoot([string]$Name) {
  Assert-ExclusiveOwnership
  $png = Join-Path $out "$Name.png"
  & python $gameLink screenshot $png | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "[pic-capture] WARN screenshot failed: $Name"; return $null }
  return (Get-FileHash -LiteralPath $png -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Invoke-MemDump([string]$CopyTo) {
  $memDumpPath = Join-Path $out 'MEMDUMP.BIN'
  for ($dumpTry = 1; $dumpTry -le 3; $dumpTry++) {
    if (Test-Path -LiteralPath $memDumpPath) { Remove-Item -LiteralPath $memDumpPath -Force }
    # NO 0x prefix: the debugger's hex scanner latches 0x-prefixed values to 0 (proven root
    # cause in cok-m4-memory-signature-route.ps1 round 9).
    Invoke-DebuggerInput -Command 'MEMDUMPBIN 0000:0000 A0000' -Label ("memdump-try$dumpTry-" + [IO.Path]::GetFileNameWithoutExtension($CopyTo)) | Out-Null
    $dumpDeadline = [DateTime]::UtcNow.AddSeconds(25)
    $lastLen = -1
    while ([DateTime]::UtcNow -lt $dumpDeadline) {
      if (Test-Path -LiteralPath $memDumpPath) {
        $len = ([IO.FileInfo]::new($memDumpPath)).Length
        if ($len -eq 0xA0000 -and $len -eq $lastLen) { break }
        $lastLen = $len
      }
      Start-Sleep -Milliseconds 300
    }
    if ((Test-Path -LiteralPath $memDumpPath) -and ([IO.FileInfo]::new($memDumpPath)).Length -eq 0xA0000) {
      Copy-Item -LiteralPath $memDumpPath -Destination $CopyTo -Force
      return $true
    }
  }
  Write-Host "[pic-capture] WARN: MEMDUMPBIN failed to produce a full 640KB dump for $CopyTo"
  return $false
}

$dosLogPath = Join-Path $out 'dos-files.log'
function Get-OpenCounts {
  # Shared-read of the live DOSBox-X [log] FILES output (DOSBox-X holds it open unbuffered).
  $counts = @{}
  if (-not (Test-Path -LiteralPath $dosLogPath)) { return $counts }
  $fs = [IO.File]::Open($dosLogPath, 'Open', 'Read', 'ReadWrite')
  try {
    $sr = New-Object IO.StreamReader($fs)
    while ($null -ne ($line = $sr.ReadLine())) {
      $m = [regex]::Match($line, 'file open command \S+ file (.+)$')
      if (-not $m.Success) { continue }
      $base = ($m.Groups[1].Value -replace '.*\\', '').ToUpperInvariant()
      $counts[$base] = 1 + $(if ($counts.ContainsKey($base)) { $counts[$base] } else { 0 })
    }
  } finally { $fs.Dispose() }
  return $counts
}
function Wait-LogGate([scriptblock]$Predicate, [string]$Label, [int]$TimeoutSec) {
  # Poll the FILES log until $Predicate (given the open-count hashtable) is true, absorbing
  # any blocking-read stop along the way so the guest keeps making progress toward the gate.
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
  $n = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    $counts = Get-OpenCounts
    if (& $Predicate $counts) { return $counts }
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('gate-{0}-{1:D3}' -f $Label, $n)
    $n++
    if (Get-Stopped $snap) {
      $csIp = Get-CsIp $snap
      Write-Host ("[pic-capture] gate {0}: absorbing stop at {1:X4}:{2:X4}" -f $Label, $csIp.cs, $csIp.ip)
      Invoke-DebuggerInput -Command 'RUN' -Label ('gate-run-{0}-{1:D3}' -f $Label, $n) | Out-Null
    }
    Start-Sleep -Milliseconds 700
  }
  return $null
}

$report = [ordered]@{
  cascade_opens = @()
  loader_stops = @()
  signature_scan = $null
  final_frame_sha256 = $null
  swapped_at = $null
  key_stops = @()
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -GameLink -DebuggerAction @('BPINT 16 0','RUN') -NoActionScreenshots -NoInitialScreenshots `
    -Cycles $Cycles -DosLogFile $dosLogPath
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership

  # BOOT GATE (replaces the native run's wall-clock 3 s checkpoint, which run-a proved
  # meaningless under the debugger): the native boot ends with MUSIC.dax loaded and the 4th
  # title.dax attract pair (Part 15 timeline). Only then was the first Enter pressed.
  $bootCounts = Wait-LogGate { param($c) ($c['MUSIC.DAX'] -ge 2) -and ($c['TITLE.DAX'] -ge 8) } 'boot' $BootGateTimeoutSec
  if ($null -eq $bootCounts) { throw 'boot gate (MUSIC.DAX>=2 opens, TITLE.DAX>=8 opens) never satisfied (honest abort)' }
  Write-Host ("[pic-capture] boot gate satisfied: TITLE.DAX={0} MUSIC.DAX={1}" -f $bootCounts['TITLE.DAX'], $bootCounts['MUSIC.DAX'])
  $null = Shoot 'step-00-boot'

  $keys = @('enter','enter','enter','enter','down','kp_enter','kp_enter','right','kp_enter',
            'down','down','down','down','down','down','down')
  $script:swapped = $false
  for ($i = 1; $i -le $keys.Count; $i++) {
    $key = $keys[$i - 1]
    Confirm-Running ("step$i")
    Press-Key $key
    # Wait for THIS key's own blocking-read stop (BPINT 16 0): direct confirmation the game
    # consumed the key (run-a observed exactly one such stop per delivered key). At step 16's
    # stop — the last key before BEGIN ADVENTURING, with steps 8-16 proven to open zero
    # files — swap breakpoints while genuinely stopped: BPINT 16 0 -> BPINT 21 3D.
    $stopSeen = $false
    $stopDeadline = [DateTime]::UtcNow.AddSeconds($KeyStopTimeoutSec)
    while ([DateTime]::UtcNow -lt $stopDeadline) {
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('key{0:D2}-poll' -f $i)
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        $report.key_stops += [ordered]@{ step = $i; key = $key; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip) }
        if ($i -eq $keys.Count) {
          Write-Host "[pic-capture] step $i stop: swapping BPINT 16 0 -> BPINT 21 3D here"
          Invoke-DebuggerInput -Command 'BPDEL *' -Label 'swap-bpdel' | Out-Null
          Invoke-DebuggerInput -Command 'BPINT 21 3D' -Label 'swap-arm-int21-3d' | Out-Null
          $script:swapped = $true
          $report.swapped_at = "step$i"
        }
        Invoke-DebuggerInput -Command 'RUN' -Label ('key{0:D2}-run' -f $i) | Out-Null
        $stopSeen = $true
        break
      }
      Start-Sleep -Milliseconds 400
    }
    if (-not $stopSeen) { Write-Host "[pic-capture] WARN: no blocking-read stop for step $i within ${KeyStopTimeoutSec}s" }
    # Milestone gates from the Part 15 per-keypress open timeline.
    if ($i -eq 6) {
      $g = Wait-LogGate { param($c) $c['A.GUY'] -ge 1 } 'aguy' $MilestoneTimeoutSec
      if ($null -eq $g) { throw 'step 6 did not produce the SAVE\A.GUY open (route divergence; honest abort)' }
      Write-Host '[pic-capture] milestone: SAVE\A.GUY opened after step 6 (select character A confirmed)'
    }
    if ($i -eq 7) {
      $g = Wait-LogGate { param($c) $c['CBODY.DAX'] -ge 2 } 'cbody' $MilestoneTimeoutSec
      if ($null -eq $g) { throw 'step 7 did not produce the CHEAD/CBODY roster loads (route divergence; honest abort)' }
      Write-Host '[pic-capture] milestone: CHEAD/CBODY roster loads after step 7 confirmed'
    }
    Start-Sleep -Milliseconds $SettleMs
    $hash = Shoot ('step-{0:D2}-{1}' -f $i, $key)
    Write-Host ("[pic-capture] step {0} ({1}) frame sha256={2}" -f $i, $key, $hash)
  }
  if (-not $script:swapped) {
    throw 'no blocking-read stop occurred at step 16; cannot arm BPINT 21 3D while running (honest abort)'
  }

  # Step 17: BEGIN ADVENTURING — walk the open cascade. RUN-B PROVED the full native order
  # reproduces exactly under the debugger (ECL2 GEO2 WALLDEF/2 8X8D/2 x3 rounds, PIC at #25).
  # RUN-C PROVED arming earlier is impossible: at the 5th 8x8d.dax open (cascade #23) the
  # strict signature scan finds ZERO copies (not even an unpatched file-cache image) — the
  # loader overlay is demand-loaded between the last 8x8d pair and the PIC call. So the
  # PIC.dax open stop (inside the loader's own INT21 open) is the EARLIEST possible arm
  # point; the PIC call's entry-time args are recovered from the RETF-time frame instead
  # (at RETF, SP == entry SP, so the arg slots are identical — Part 13 frame model).
  Confirm-Running 'step17'
  Press-Key 'kp_enter'
  $armStopSnap = $null
  for ($s = 1; $s -le $MaxCascadeStops; $s++) {
    $stopSnap = $null
    $stopDeadline = [DateTime]::UtcNow.AddSeconds($(if ($s -eq 1) { 90 } else { 45 }))
    while ([DateTime]::UtcNow -lt $stopDeadline) {
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('cascade-{0:D2}-poll' -f $s)
      if (Get-Stopped $snap) { $stopSnap = $snap; break }
      Start-Sleep -Milliseconds 120
    }
    if ($null -eq $stopSnap) { Write-Host "[pic-capture] cascade: no stop within deadline at index $s"; break }
    $name = Get-OpenFilename $stopSnap ('cascade-{0:D2}-name' -f $s)
    Write-Host ("[pic-capture] cascade open #{0}: {1}" -f $s, $name)
    $report.cascade_opens += $name
    if ($name -match '(?i)\\PIC\.dax') { $armStopSnap = $stopSnap; break }
    Invoke-DebuggerInput -Command 'RUN' -Label ('cascade-{0:D2}-run' -f $s) | Out-Null
  }
  if ($null -eq $armStopSnap) { throw 'never reached the arm-point open stop (honest abort; see cascade_opens)' }

  # At the arm point: dump memory, find the loader by strict double signature.
  $picOpenDump = Join-Path $out 'dump-pic-open.bin'
  if (-not (Invoke-MemDump $picOpenDump)) { throw 'memory dump at arm point failed' }
  $scanJson = & python $analyzer scan $picOpenDump $ovrPath | Out-String
  $scanJson | Set-Content -LiteralPath (Join-Path $out 'signature-scan.json') -Encoding utf8
  $scan = $scanJson | ConvertFrom-Json
  $report.signature_scan = $scan
  Write-Host ("[pic-capture] signature scan: {0} strict match(es)" -f $scan.matches.Count)
  foreach ($m in $scan.matches) {
    Write-Host ("  linear=0x{0} patched={1} live_farcall={2}" -f $m.linear_hex, $m.relocation_patched, $m.live_farcall_hex)
  }
  $resident = @($scan.matches | Where-Object { $_.relocation_patched })
  if ($resident.Count -eq 0) {
    # Major-finding branch: PIC.dax opened but no patched loader copy is resident.
    Write-Host '[pic-capture] NO relocation-patched loader copy resident at PIC.dax open — recording and finishing.'
    Invoke-DebuggerInput -Command 'BPDEL *' -Label 'nores-bpdel' | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label 'nores-run' | Out-Null
  } else {
    $t = $resident[0]
    # Do NOT `BPDEL *` here: keeping BPINT 21 3D armed makes every subsequent file open
    # (8x8d2, PIC.dax, PIC2.dax) show up as a classified 'other' stop between the loader
    # entry/retf stops — free ordered anchors tying each loader invocation to its file.
    Invoke-DebuggerInput -Command ('BP {0}:{1}' -f $t.entry_seg, $t.entry_off) -Label 'loader-bp-entry' | Out-Null
    Invoke-DebuggerInput -Command ('BP {0}:{1}' -f $t.retf_seg, $t.retf_off) -Label 'loader-bp-retf' | Out-Null
    $entryPhys = [Convert]::ToInt64($t.linear_hex, 16)
    $retfPhys = [Convert]::ToInt64($t.retf_linear_hex, 16)
    Write-Host ("[pic-capture] armed loader BPs: entry {0}:{1} retf {2}:{3} (INT21 3D BP kept)" -f $t.entry_seg, $t.entry_off, $t.retf_seg, $t.retf_off)
    Invoke-DebuggerInput -Command 'RUN' -Label 'loader-armed-run' | Out-Null

    # Expect up to 3 loader calls past the arm point (the 8x8d pair's call, then PIC,
    # then PIC2). Terminate after 3 RETF captures or on the first poll timeout —
    # rescan-on-timeout is impossible by design: MEMDUMPBIN needs a stopped guest, and
    # a running guest processes no debugger commands at all (proven in cok-m4 attempt
    # 6), so with no stop source left there is no way to take a dump. Record the
    # timeout honestly instead.
    $retfCount = 0
    for ($j = 1; $j -le $MaxLoaderStops; $j++) {
      $stopSnap = $null
      $stopDeadline = [DateTime]::UtcNow.AddSeconds(45)
      while ([DateTime]::UtcNow -lt $stopDeadline) {
        $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('loader-{0:D2}-poll' -f $j)
        if (Get-Stopped $snap) { $stopSnap = $snap; break }
        Start-Sleep -Milliseconds 120
      }
      if ($null -eq $stopSnap) {
        Write-Host "[pic-capture] loader: no stop within 45s at index $j (retfCount=$retfCount) — recording timeout and finishing"
        $report.loader_stops += [ordered]@{ index = $j; kind = 'timeout'; retf_count_so_far = $retfCount }
        break
      }
      $csIp = Get-CsIp $stopSnap
      $kind = if ($csIp.phys -eq $entryPhys) { 'entry' } elseif ($csIp.phys -eq $retfPhys) { 'retf' } else { 'other' }
      Write-Host ("[pic-capture] loader stop #{0}: {1} at {2:X4}:{3:X4} (phys 0x{4:X})" -f $j, $kind, $csIp.cs, $csIp.ip, $csIp.phys)
      $rec = [ordered]@{ index = $j; kind = $kind; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip) }
      $ss = Get-Reg $stopSnap 'SS'
      $sp = (Get-Reg $stopSnap 'ESP') -band 0xFFFF
      $ds = Get-Reg $stopSnap 'DS'
      if ($kind -eq 'entry') {
        # Fast D-based capture (no full dump — keeps the stop brief). Stack at entry
        # (before push bp): SS:SP -> ret_off, ret_seg, then the six RETF-0Ch arg words.
        $stackSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ss, $sp) -Label ('loader-{0:D2}-stack' -f $j)
        $b = Get-DataBytes $stackSnap
        if ($b.Length -ge 16) {
          $rec.ret = ('{0:X4}:{1:X4}' -f (Get-Word16 $b 2), (Get-Word16 $b 0))
          $rec.args_hex = @(0..5 | ForEach-Object { '{0:X4}' -f (Get-Word16 $b (4 + 2 * $_)) })
          $rec.stack_first_bytes_hex = (($b | Select-Object -First 32 | ForEach-Object { $_.ToString('x2') }) -join '')
        }
        $g1 = Get-DataBytes (Invoke-DebuggerInput -Command ('D {0:X4}:5D8F' -f $ds) -Label ('loader-{0:D2}-g5d8f' -f $j))
        $g2 = Get-DataBytes (Invoke-DebuggerInput -Command ('D {0:X4}:5DB6' -f $ds) -Label ('loader-{0:D2}-g5db6' -f $j))
        if ($g1.Length -ge 2 -and $g2.Length -ge 2) {
          $rec.globals = [ordered]@{
            '5D8F_byte' = ('{0:X2}' -f $g1[0]); '5D8F_word' = ('{0:X4}' -f (Get-Word16 $g1 0))
            '5DB6_byte' = ('{0:X2}' -f $g2[0]); '5DB6_word' = ('{0:X4}' -f (Get-Word16 $g2 0))
          }
        }
        $rec.ss = ('{0:X4}' -f $ss); $rec.sp = ('{0:X4}' -f $sp); $rec.ds = ('{0:X4}' -f $ds)
        Write-Host ("[pic-capture]   entry ret={0} args=[{1}]" -f $rec.ret, ($rec.args_hex -join ' '))
      } elseif ($kind -eq 'retf') {
        # Full dump at RETF: the analyzer needs the whole low-memory image to follow
        # the ss:[bp-2A] buffer far pointer and dump the returned buffer bytes.
        $dumpPath = Join-Path $out ("dump-loader-{0:D2}-retf.bin" -f $j)
        if (Invoke-MemDump $dumpPath) {
          $bufPath = Join-Path $out ("pic-loader-buffer-{0:D2}.bin" -f $j)
          $extJson = & python $analyzer extract $dumpPath retf ('{0:X4}' -f $ss) ('{0:X4}' -f $sp) ('{0:X4}' -f $ds) $bufPath | Out-String
          $extJson | Set-Content -LiteralPath (Join-Path $out ("loader-stop-{0:D2}-retf.json" -f $j)) -Encoding utf8
          $rec.extract = $extJson | ConvertFrom-Json
          Write-Host $extJson
        }
      } else {
        # 'other' with BPINT 21 3D still armed == a file-open stop: read DS:DX name.
        $rec.open_filename = Get-OpenFilename $stopSnap ('loader-{0:D2}-name' -f $j)
        Write-Host ("[pic-capture]   file open anchor: {0}" -f $rec.open_filename)
        if ($rec.open_filename -match '(?i)\\PIC2?\.dax') {
          # A PIC/PIC2 open that did NOT come through the armed loader entry: identify
          # the caller. CS:IP is the INT 21h call site; the stack window gives the
          # near/far return chain; a fresh dump + strict scan says whether the loader
          # copy is still resident+patched while this different path runs.
          $rec.stack_window_hex = (((Get-DataBytes (Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ss, $sp) -Label ('loader-{0:D2}-callstack' -f $j))) | ForEach-Object { $_.ToString('x2') }) -join '')
          $rec.ss = ('{0:X4}' -f $ss); $rec.sp = ('{0:X4}' -f $sp); $rec.ds = ('{0:X4}' -f $ds)
          $dumpPath = Join-Path $out ("dump-open-{0:D2}.bin" -f $j)
          if (Invoke-MemDump $dumpPath) {
            $scan2Json = & python $analyzer scan $dumpPath $ovrPath | Out-String
            $scan2Json | Set-Content -LiteralPath (Join-Path $out ("signature-scan-open-{0:D2}.json" -f $j)) -Encoding utf8
            $rec.signature_scan = $scan2Json | ConvertFrom-Json
            Write-Host ("[pic-capture]   strict scan at this open: {0} match(es)" -f $rec.signature_scan.matches.Count)
          }
        }
      }
      $report.loader_stops += $rec
      if ($kind -eq 'retf') { $retfCount++ }
      if ($retfCount -ge 3) {
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'done-bpdel' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'done-run' | Out-Null
        break
      }
      Invoke-DebuggerInput -Command 'RUN' -Label ('loader-{0:D2}-run' -f $j) | Out-Null
    }
    if ($retfCount -lt 3) {
      # Loop ended without the epilogue (timeout or MaxLoaderStops): clean up BPs.
      Invoke-DebuggerInput -Command 'BPDEL *' -Label 'tail-bpdel' | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label 'tail-run' | Out-Null
    }
  }

  Start-Sleep -Seconds 10
  $report.final_frame_sha256 = Shoot 'step-17-final'
  Write-Host ("[pic-capture] final frame sha256={0} (Part 14/15 stable frame: 0c694ae97c7a1e1af6bb6696dae3f1c9cd587eb4d078503a4a00d160d79855b4)" -f $report.final_frame_sha256)
} finally {
  $report.absorbed_stops = $absorbedStops
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
Write-Host "[pic-capture] RESULT: $out"
