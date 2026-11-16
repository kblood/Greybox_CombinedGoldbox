# trace_cok_treasure_rng.ps1 -- seg051 RNG round 6: GameLink-driven boot into CoK's real demo
# sequence, breakpoints armed on the treasure-award chain (file 0x2d21b -> 0x2d765 -> 0x395b5)
# BEFORE any fight resolves.
#
# Rationale (see docs/engine/research/decompile-worklist.md, seg051 RNG rounds 1-5): rounds 2-5
# all kept `BPINT 21 42` armed continuously while trying to reach real gameplay, which forces a
# manual RUN after every single disk I/O and is too slow (round 5: 120 continues only reached
# "LOADING...PLEASE WAIT"). This round's fix: use BPINT 21 42 ONLY for a short boot census (to
# resolve the two target overlays' live runtime segments), then BPDEL * and arm ONLY the two
# execution breakpoints we actually care about, so the guest free-runs at full real-time speed
# (like ordinary play) until either treasure-award (file 0x2d21b) or the suspected roll primitive
# (file 0x395b5) is hit. GameLink (focusless, never SendKeys/SetForegroundWindow/SendInput) drives
# the single 'd' (Play Demo) keypress; the debugger console (process-owned, also focusless) does
# everything else. See docs/engine/research/dosbox-x-gamelink-automation.md for the hazards this
# script guards against (singleton transport contamination, halted-guest-drops-keys, one invalid
# typed command wedging the console for the rest of the session).
#
# Round-6 addendum (second revision): added an entry-byte-match check (armed segment's live memory
# vs. the retail GAME.OVR file bytes at the same relative offset) both BEFORE the free-run and
# AFTER it times out (forcing a brief stop via BPINT 8, the 18.2 Hz timer tick, which fires almost
# immediately regardless of what the guest is doing) -- this rules out the "overlay silently
# reloaded to a different segment mid-session" confound rounds 2/3 had to reason about only after
# the fact, for a null result. (Third revision: this PowerShell host is Windows PowerShell 5.1,
# which lacks [Convert]::ToHexString -- use a manual byte-array-to-hex-string join instead.)

param(
  [string]$OutDir = 'build\runtime-cok-rng-r6-20260718',
  [ValidateRange(1,80)][int]$MaxSeeks = 50,
  [ValidateRange(5,60)][int]$SeekTimeoutSeconds = 20,
  [ValidateRange(30,600)][int]$FreeRunWaitSeconds = 240,
  [ValidateRange(1,30)][int]$FreeRunPollIntervalSeconds = 5
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

function ConvertTo-HexString {
  param([byte[]]$Bytes)
  return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}

$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$gameDir = Join-Path $repo 'Champions of Krynn'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
if (-not (Test-Path -LiteralPath $dbx)) { throw "dosbox-x.exe not found: $dbx" }
if (-not (Test-Path -LiteralPath $gameDir)) { throw "CoK game dir not found: $gameDir" }
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $gameDir 'GAME.OVR'))

# Static targets, resolved this session via tools/disasm_cok.py overlays (see round-6 notes):
#   descriptor 21: ovr_base=0x2b8f2 codesz=0x21c3 -> hosts file 0x2d21b (treasure-award entry)
#                  and file 0x2d765 (percentile bracket table)
#   descriptor 24: ovr_base=0x365a6 codesz=0x37b4 -> hosts file 0x395b5 (suspected roll primitive)
$Desc21FileOfs = 0x2b8f2
$Desc21CodeSz  = 0x21c3
$Desc24FileOfs = 0x365a6
$Desc24CodeSz  = 0x37b4
$TreasureAwardEntryFile = 0x2d21b
$TreasureBracketTableFile = 0x2d765
$RollPrimitiveFile = 0x395b5
$TreasureAwardEntryRel = $TreasureAwardEntryFile - $Desc21FileOfs   # 0x1929
$TreasureBracketTableRel = $TreasureBracketTableFile - $Desc21FileOfs  # 0x1e73
$RollPrimitiveRel = $RollPrimitiveFile - $Desc24FileOfs             # 0x300f

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
$preExisting = Get-DosboxPids
if ($preExisting.Count -gt 0) { throw "dosbox-x.exe already running (pid(s): $($preExisting -join ',')) -- this round requires sole ownership" }

function Assert-ExclusiveOwnership {
  param([int]$OwnPid)
  $foreign = @(Get-DosboxPids | Where-Object { $_ -ne $OwnPid })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $OwnPid"
  }
}

$process = $null
$seekLog = [Collections.Generic.List[object]]::new()
$segDesc21 = $null
$segDesc24 = $null

function Invoke-DebuggerInput {
  param([string]$Command, [string]$Label, [switch]$SnapshotOnly)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed: $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper failed: $Label ($($status.Error))" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-CsIp {
  param([string]$Snapshot)
  $m = [regex]::Match($Snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $m.Success) { return $null }
  return [ordered]@{ cs = $m.Groups[1].Value; ip = $m.Groups[2].Value.Substring(4) }
}

function Get-Regs {
  param([string]$Snapshot)
  $reg = [regex]::Matches($Snapshot, '\b(EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP|DS|ES|SS|CS|EIP)=([0-9A-F]{4,8})\b')
  $regs = @{}
  foreach ($m in $reg) { $regs[$m.Groups[1].Value] = $m.Groups[2].Value }
  return $regs
}

function Get-DataBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

function Test-EntryByteMatch {
  param([string]$Seg, [int]$Rel, [int]$FileOffset, [string]$Label, [int]$Len = 16)
  $dump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $Seg, $Rel) -Label $Label
  $liveBytes = Get-DataBytes $dump
  if ($liveBytes.Count -lt $Len) { return [ordered]@{ ok = $false; reason = 'short dump' } }
  $expected = $overlayBytes[$FileOffset..($FileOffset + $Len - 1)]
  $liveHex = ConvertTo-HexString ([byte[]]($liveBytes[0..($Len-1)]))
  $expectedHex = ConvertTo-HexString ([byte[]]$expected)
  return [ordered]@{ ok = ($liveHex -eq $expectedHex); live = $liveHex; expected = $expectedHex }
}

try {
  & $probe -DbxExe $dbx -GameDir $gameDir -Exe 'START.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe launch failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership -OwnPid $process.Id
  Start-Sleep -Seconds 2
  Assert-ExclusiveOwnership -OwnPid $process.Id

  # --- Phase 1: boot census via BPINT 21 42 -- resolve descriptor 21 and 24 live segments -----
  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($SeekTimeoutSeconds)
  while ((-not $segDesc21 -or -not $segDesc24) -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('seek-poll-{0:D3}' -f $seekIndex)
    if ($snap -match '(?m)^\(Running\)\s*$') { continue }
    $regs = Get-Regs $snap
    if (-not ($regs.ContainsKey('EAX') -and $regs.ContainsKey('EBX') -and $regs.ContainsKey('ECX') -and $regs.ContainsKey('EDX'))) {
      throw "seek $seekIndex : snapshot missing expected registers"
    }
    $eax = [Convert]::ToUInt32($regs['EAX'], 16)
    $ebx = [Convert]::ToUInt32($regs['EBX'], 16)
    $ecx = [Convert]::ToUInt32($regs['ECX'], 16)
    $edx = [Convert]::ToUInt32($regs['EDX'], 16)
    $ah = ($eax -shr 8) -band 0xFF
    if ($ah -ne 0x42) { throw "seek $seekIndex : stopped at AH=$('{0:X2}' -f $ah), not 0x42 -- unexpected trap" }
    $seekOffset = (($ecx -band 0xFFFF) -shl 16) -bor ($edx -band 0xFFFF)
    $destMatch = [regex]::Match($snap, 'es:\[0010\]=([0-9A-F]{4})')
    $destSeg = if ($destMatch.Success) { $destMatch.Groups[1].Value } else { $null }
    $rec = [ordered]@{ index = $seekIndex; handle = $ebx; seek_offset = ('0x{0:X}' -f $seekOffset); dest_segment = $destSeg }
    $seekLog.Add($rec) | Out-Null
    Write-Host ("[cok-rng-r6] seek {0}: handle={1} offset=0x{2:X} dest_seg={3}" -f $seekIndex, $ebx, $seekOffset, $destSeg)
    if ($ebx -eq 5 -and $seekOffset -eq $Desc21FileOfs -and $destSeg) { $segDesc21 = $destSeg }
    if ($ebx -eq 5 -and $seekOffset -eq $Desc24FileOfs -and $destSeg) { $segDesc24 = $destSeg }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label ('seek-run-{0:D3}' -f $seekIndex) | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($SeekTimeoutSeconds)
  }
  if (-not $segDesc21) { throw "descriptor 21 (fileofs 0x$('{0:X}' -f $Desc21FileOfs)) never observed in $seekIndex seeks" }
  if (-not $segDesc24) { throw "descriptor 24 (fileofs 0x$('{0:X}' -f $Desc24FileOfs)) never observed in $seekIndex seeks" }
  Write-Host ("[cok-rng-r6] RESOLVED: desc21(treasure/bracket)={0} desc24(roll primitive)={1}" -f $segDesc21, $segDesc24)

  # --- Phase 2: clear the census breakpoint, arm ONLY the two execution breakpoints we care ----
  # about, then free-run unobstructed (no more per-disk-I/O stops).
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-census-bp' | Out-Null

  # Pre-arm byte-match: confirm the resolved segments really hold the expected retail code BEFORE
  # any combat happens (rules out a wrong descriptor/segment mapping from the start).
  $preMatchTreasure = Test-EntryByteMatch -Seg $segDesc21 -Rel $TreasureAwardEntryRel -FileOffset $TreasureAwardEntryFile -Label 'prearm-bytematch-treasure'
  $preMatchRoll = Test-EntryByteMatch -Seg $segDesc24 -Rel $RollPrimitiveRel -FileOffset $RollPrimitiveFile -Label 'prearm-bytematch-roll'
  Write-Host ("[cok-rng-r6] pre-arm byte-match: treasure_entry={0} roll_primitive={1}" -f $preMatchTreasure.ok, $preMatchRoll.ok)
  if (-not $preMatchTreasure.ok) { Write-Host ("  treasure live={0} expected={1}" -f $preMatchTreasure.live, $preMatchTreasure.expected) }
  if (-not $preMatchRoll.ok) { Write-Host ("  roll live={0} expected={1}" -f $preMatchRoll.live, $preMatchRoll.expected) }

  $bpTreasureAward = '{0}:{1:X4}' -f $segDesc21, $TreasureAwardEntryRel
  $bpRollPrimitive = '{0}:{1:X4}' -f $segDesc24, $RollPrimitiveRel
  Invoke-DebuggerInput -Command "BP $bpTreasureAward" -Label 'arm-treasure-award' | Out-Null
  Invoke-DebuggerInput -Command "BP $bpRollPrimitive" -Label 'arm-roll-primitive' | Out-Null
  Invoke-DebuggerInput -Command 'BPLIST' -Label 'confirm-armed' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'resume-free-run' | Out-Null
  Assert-ExclusiveOwnership -OwnPid $process.Id

  # --- Phase 3: GameLink -- wait for the title screen, press 'd' for Play Demo ------------------
  Start-Sleep -Seconds 5
  Assert-ExclusiveOwnership -OwnPid $process.Id
  & python $gameLink screenshot (Join-Path $out 'phase3-pre-title.png') 2>&1 | Write-Host
  Start-Sleep -Seconds 3
  & python $gameLink press d --pace 0.5 2>&1 | Write-Host
  Assert-ExclusiveOwnership -OwnPid $process.Id
  Start-Sleep -Seconds 2
  & python $gameLink screenshot (Join-Path $out 'phase3-post-d.png') 2>&1 | Write-Host

  # --- Phase 4: poll for either breakpoint firing, or timeout -----------------------------------
  $deadline2 = [DateTime]::UtcNow.AddSeconds($FreeRunWaitSeconds)
  $hitAddr = $null
  $hitSnap = $null
  $pollCount = 0
  while ([DateTime]::UtcNow -lt $deadline2) {
    Start-Sleep -Seconds $FreeRunPollIntervalSeconds
    Assert-ExclusiveOwnership -OwnPid $process.Id
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('freerun-poll-{0:D3}' -f $pollCount)
    $pollCount++
    if ($snap -notmatch '(?m)^\(Running\)\s*$') {
      $addr = Get-CsIp $snap
      $addrText = if ($addr) { '{0}:{1}' -f $addr.cs, $addr.ip } else { $null }
      Write-Host ("[cok-rng-r6] STOP at poll {0}: {1}" -f $pollCount, $addrText)
      $hitAddr = $addrText
      $hitSnap = $snap
      break
    }
    if ($pollCount % 6 -eq 0) {
      & python $gameLink screenshot (Join-Path $out ("freerun-{0:D3}.png" -f $pollCount)) 2>&1 | Write-Host
    }
  }

  # --- Phase 5: if no hit, force a brief stop (BPINT 8, timer tick) and re-verify both segments -
  # still hold the expected retail bytes, ruling out a mid-session overlay reload as the reason.
  $postMatchTreasure = $null
  $postMatchRoll = $null
  if (-not $hitAddr) {
    Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-before-post-check' | Out-Null
    Invoke-DebuggerInput -Command 'BPINT 8' -Label 'arm-timer-tick' | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label 'run-to-timer-tick' | Out-Null
    $tickDeadline = [DateTime]::UtcNow.AddSeconds(5)
    $tickStopped = $false
    while ([DateTime]::UtcNow -lt $tickDeadline) {
      Start-Sleep -Milliseconds 100
      $tickSnap = Invoke-DebuggerInput -SnapshotOnly -Label 'timer-tick-poll'
      if ($tickSnap -notmatch '(?m)^\(Running\)\s*$') { $tickStopped = $true; break }
    }
    if ($tickStopped) {
      $postMatchTreasure = Test-EntryByteMatch -Seg $segDesc21 -Rel $TreasureAwardEntryRel -FileOffset $TreasureAwardEntryFile -Label 'postrun-bytematch-treasure'
      $postMatchRoll = Test-EntryByteMatch -Seg $segDesc24 -Rel $RollPrimitiveRel -FileOffset $RollPrimitiveFile -Label 'postrun-bytematch-roll'
      Write-Host ("[cok-rng-r6] post-run byte-match (segment reload check): treasure_entry={0} roll_primitive={1}" -f $postMatchTreasure.ok, $postMatchRoll.ok)
    } else {
      Write-Host '[cok-rng-r6] WARN: post-run timer-tick stop did not occur within 5s -- reload check skipped'
    }
  }

  $result = [ordered]@{
    schema_version = 1
    title = 'CoK seg051 RNG round 6 -- treasure-award chain live trace'
    game_dir = $gameDir
    static_targets = [ordered]@{
      descriptor_21 = [ordered]@{ file_ofs = ('0x{0:X}' -f $Desc21FileOfs); code_size = ('0x{0:X}' -f $Desc21CodeSz); live_segment = $segDesc21 }
      descriptor_24 = [ordered]@{ file_ofs = ('0x{0:X}' -f $Desc24FileOfs); code_size = ('0x{0:X}' -f $Desc24CodeSz); live_segment = $segDesc24 }
      treasure_award_entry = [ordered]@{ file = ('0x{0:X}' -f $TreasureAwardEntryFile); rel = ('0x{0:X}' -f $TreasureAwardEntryRel); armed_bp = $bpTreasureAward }
      treasure_bracket_table = [ordered]@{ file = ('0x{0:X}' -f $TreasureBracketTableFile); rel = ('0x{0:X}' -f $TreasureBracketTableRel) }
      roll_primitive = [ordered]@{ file = ('0x{0:X}' -f $RollPrimitiveFile); rel = ('0x{0:X}' -f $RollPrimitiveRel); armed_bp = $bpRollPrimitive }
    }
    seek_log = $seekLog
    pre_arm_byte_match = [ordered]@{ treasure_award_entry = $preMatchTreasure; roll_primitive = $preMatchRoll }
    post_run_byte_match = [ordered]@{ treasure_award_entry = $postMatchTreasure; roll_primitive = $postMatchRoll }
    free_run_poll_count = $pollCount
    hit_address = $hitAddr
    hit = ($null -ne $hitAddr)
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'cok-rng-r6-trace.json') -Encoding utf8
  if ($hitSnap) { [IO.File]::WriteAllText((Join-Path $out 'hit-console.txt'), $hitSnap, [Text.UTF8Encoding]::new($false)) }
  Write-Host ("[cok-rng-r6] RESULT: hit={0} hit_address={1} out={2}" -f $result.hit, $hitAddr, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
    Write-Host ("[cok-rng-r6] stopped pid={0}" -f $process.Id)
  }
}
