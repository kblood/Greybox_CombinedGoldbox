# trace_gateway_vga_dac_navigated.ps1 -- Part 5 follow-up to
# docs/engine/research/gateway-vga-picture-format.md Part 4. Part 4 proved (twice, reproduced)
# that the bulk DAC loader's real entry (destSeg:0x1821, GAME.OVR+0x51566..0x51585, registers
# 0x12..0x1F / 18..31 decimal) is NEVER reached during a genuinely silent, zero-keypress boot --
# a clean, bounded 100s/60-hit negative result, twice. The working theory recorded there: this
# palette only loads behind actually DISPLAYING a specific picture, which silent attract-mode
# never reaches.
#
# THIS script tests that theory with a genuinely different technique: real, bounded, scripted
# navigation (never a guessed/unbounded key search) through Gateway's own front-end screen
# sequence, discovered this round via a brand-new screenshot-only recon pass
# (tools/recon_gateway_frontend_nav.ps1, build/gateway-frontend-recon-20260717b/*.png) -- the
# FIRST time any Gateway trace in this project has used screenshots (previous docs, e.g.
# gateway-operand-parser-execution-probe.md, explicitly avoided host input/screenshots because
# no proven front-end key sequence existed yet and an UNBOUNDED guessed search would violate
# HANDOFF.md; this recon pass is bounded -- 8 plain ENTER presses, screenshot-verified at every
# step, no trial-and-error loop -- and is exactly the "actual scripted navigation" this round's
# task explicitly calls for as the untried alternative to silent boot).
#
# The recon proved, with zero save file, zero character-creation input beyond ENTER (every menu
# defaults to its first/highlighted option): boot lands directly on a colorful VGA title screen
# (no keys), then ENTER advances through: [1] a highly-saturated "GATEWAY TO THE SAVAGE FRONTIER"
# logo picture (visually consistent with needing >16 colors -- multiple distinct blue/purple/cyan
# tones), [2] a two-page credits screen (plain EGA-looking text), [3] a "GATEWAY V1.2 PLAY DEMO"
# version banner, [4] the real "CREATE NEW CHARACTER/ADD CHARACTER/LOAD SAVED GAME/..." main menu,
# [5..8] character-creation PICK RACE / GENDER / CLASS / ALIGNMENT screens (defaulting to the
# first highlighted choice each time -- no invented choice, ENTER alone). No save file needed at
# any point; this whole sequence is reachable from a bare retail install.
#
# Method: reuse Part 4's exact Phase 1 (BPINT 21 42 seek/post-read anchor on VROOMM descriptor 42)
# to resolve the LIVE destination segment fresh every run (never a hardcoded stale segment, per
# this round's task instructions), then instead of Part 4's Phase 2 (zero-keypress free run), arm
# the same destSeg:0x1821 execution breakpoint and drive the proven 8-step ENTER sequence above
# while polling for a hit after every step -- if the loader fires at ANY point in the sequence, we
# catch it and read out live CX/DS/SI plus the resulting palette table, exactly like Part 4's own
# Phase 2 capture logic.
#
# INPUT/CAPTURE MECHANISM: this project's documented focusless automation method,
# docs/engine/research/dosbox-x-gamelink-automation.md -- DOSBox-X GameLink v4 shared memory via
# tools/dosbox_gamelink.py ("press"/"screenshot"), NOT Windows SendInput/SetForegroundWindow.
# Several agents run DOSBox-X concurrently in this project; a host-focus-stealing input method
# would corrupt every other agent's own keypress delivery. The probe is launched with -GameLink
# (starts DOSBox-X minimized, `gamelink master=true`) exactly like the sibling
# trace_gateway_vga_dac_bulk_loader.ps1; debugger breakpoint/register/memory commands still go
# over the separate, already-focus-independent DosboxDebuggerInput.dll window-message channel
# (the same one every other Gateway trace script in this project already uses), per
# dosbox-x-gamelink-automation.md's own "keep debugger-console commands on the existing
# process-owned console channel; GameLink handles guest input/framebuffer" guidance. The one
# exception is this round's earlier EXPLORATORY recon pass (tools/recon_gateway_frontend_nav.ps1,
# which predates this correction and used the older host-focus Send-DosKeys path) -- that recon's
# discovered 8-step sequence is reused here, but this trace itself never steals focus.

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeksBeforeTarget = 60,
  [ValidateRange(5,90)][int]$FirstSeekTimeoutSeconds = 30,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 5,
  [ValidateRange(1,30)][int]$PerStepHitTimeoutSeconds = 8,
  [ValidateRange(200,5000)][int]$PerStepSettleMs = 1800
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Same VROOMM descriptor 42 constants as trace_gateway_vga_dac_bulk_loader.ps1's Phase 1.
$TargetSeekOffset = 0x4FD45
$TargetCodeSize = 0x1A23
$SetupBlockStart = 0x1814
$FixupWordOffset = 0x1816
$LoaderEntry = 0x1821
$RawDsWord = 0x04C7
$KnownSi = 0xA108
$KnownCx = 14
$KnownFirstRegister = 0x12

# The proven-by-screenshot 8-step front-end navigation (tools/recon_gateway_frontend_nav.ps1,
# build/gateway-frontend-recon-20260717b/*.png). Every step is a bare ENTER; no invented input.
$NavSteps = @(
  @{ label = 'title-to-logo';        note = 'title screen (0 keys) -> "GATEWAY TO THE SAVAGE FRONTIER" logo picture' }
  @{ label = 'logo-to-credits1';     note = 'logo picture -> credits page 1' }
  @{ label = 'credits1-to-versionbanner'; note = 'credits page 1 (2-page credits collapses to 1 ENTER per recon) -> "GATEWAY V1.2 PLAY DEMO" banner' }
  @{ label = 'versionbanner-to-mainmenu'; note = 'version banner -> CREATE/ADD/LOAD main menu' }
  @{ label = 'mainmenu-to-pickrace'; note = 'main menu (CREATE NEW CHARACTER highlighted) -> PICK RACE' }
  @{ label = 'pickrace-to-pickgender'; note = 'PICK RACE (DWARF highlighted) -> PICK GENDER' }
  @{ label = 'pickgender-to-pickclass'; note = 'PICK GENDER (MALE highlighted) -> PICK CLASS' }
  @{ label = 'pickclass-to-pickalignment'; note = 'PICK CLASS (FIGHTER highlighted) -> PICK ALIGNMENT' }
)

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway VGA DAC navigated probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'

# MITIGATION for the documented GameLink single-global-singleton hazard
# (docs/engine/research/dosbox-x-gamelink-automation.md, "2026-07-17: KNOWN HAZARD" section,
# confirmed independently this session -- two of this script's own earlier attempts had their
# owned DOSBox-X process die outright when a concurrent agent's GameLink session collided).
# Before every GameLink interaction: (1) confirm our own launched PID is still alive, (2) confirm
# it is the ONLY dosbox-x.exe process on the machine right now (a foreign PID means either a
# collision killed ours, or -- the more dangerous silent case -- our client could be talking to
# their shared memory instead), (3) sanity-check the GameLink status program/frame fields look
# like Gateway's own boot state, not another title's. Any failure aborts rather than silently
# trusting a possibly-hijacked capture.
function Assert-OwnDosboxSession {
  param([string]$Context)
  if (-not $process -or $process.HasExited) {
    throw "session identity check failed ($Context): our own DOSBox-X process is not running -- likely killed by a concurrent GameLink collision (see dosbox-x-gamelink-automation.md KNOWN HAZARD)"
  }
  $allDosbox = @(Get-Process -Name 'dosbox-x' -ErrorAction SilentlyContinue)
  $foreign = @($allDosbox | Where-Object { $_.Id -ne $process.Id })
  if ($foreign.Count -gt 0) {
    $foreignIds = ($foreign | ForEach-Object { $_.Id }) -join ','
    throw "session identity check failed ($Context): foreign dosbox-x.exe PID(s) detected ($foreignIds) alongside our own ($($process.Id)) -- a concurrent agent's GameLink session may be colliding with ours; aborting rather than trusting a possibly-hijacked capture"
  }
}

function Send-GuestKey([string]$Key) {
  Assert-OwnDosboxSession -Context "before press '$Key'"
  & python $gameLink press $Key
  if ($LASTEXITCODE -ne 0) { throw "GameLink input failed for key '$Key': $LASTEXITCODE" }
  Assert-OwnDosboxSession -Context "after press '$Key'"
}

function Capture-GuestFrame([string]$Path) {
  Assert-OwnDosboxSession -Context "before screenshot $Path"
  $shotJson = & python $gameLink screenshot $Path
  if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $LASTEXITCODE" }
  Assert-OwnDosboxSession -Context "after screenshot $Path"
  # Extra identity discriminator (dosbox-x-gamelink-automation.md's own recommendation): Gateway's
  # own DEBUGBOX/gamelink render frame is proven 640x400 (recon + this script's own step-00 hit).
  # A different resolution is a cheap, strong signal we captured a DIFFERENT agent's session.
  try {
    $shotMeta = ($shotJson | Out-String) | ConvertFrom-Json
    if ($shotMeta.width -ne 640 -or $shotMeta.height -ne 400) {
      throw "session identity check failed (frame dims): got $($shotMeta.width)x$($shotMeta.height), expected 640x400 for Gateway -- likely a foreign agent's GameLink session"
    }
  } catch [System.Management.Automation.RuntimeException] {
    throw
  } catch {
    Write-Host "[gateway-vga-dac-nav] WARN: could not parse screenshot metadata for identity check: $($_.Exception.Message)"
  }
}

$process = $null

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

function Get-DebuggerAddress {
  param([string]$Snapshot)
  $match = [regex]::Match($Snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $match.Success) { return $null }
  return '{0}:{1}' -f $match.Groups[1].Value, $match.Groups[2].Value.Substring(4)
}

function Get-SeekFields {
  param([string]$Snapshot)
  $reg = [regex]::Matches($Snapshot, '\b(EAX|EBX|ECX|EDX|CS|EIP)=([0-9A-F]{4,8})\b')
  $regs = @{}
  foreach ($m in $reg) { $regs[$m.Groups[1].Value] = $m.Groups[2].Value }
  if (-not ($regs.ContainsKey('EAX') -and $regs.ContainsKey('EBX') -and $regs.ContainsKey('ECX') -and $regs.ContainsKey('EDX') -and $regs.ContainsKey('CS') -and $regs.ContainsKey('EIP'))) {
    return $null
  }
  $eax = [Convert]::ToUInt32($regs['EAX'], 16)
  $ebx = [Convert]::ToUInt32($regs['EBX'], 16)
  $ecx = [Convert]::ToUInt32($regs['ECX'], 16)
  $edx = [Convert]::ToUInt32($regs['EDX'], 16)
  $ah = ($eax -shr 8) -band 0xFF
  return [ordered]@{
    ah = $ah
    is_ah42 = ($ah -eq 0x42)
    handle = $ebx
    seek_offset = (($ecx -band 0xFFFF) -shl 16) -bor ($edx -band 0xFFFF)
    cs = $regs['CS']
    eip = $regs['EIP']
  }
}

function Get-BulkLoaderExecFields {
  param([string]$Snapshot)
  $reg = [regex]::Matches($Snapshot, '\b(ECX|ESI|DS)=([0-9A-F]{4,8})\b')
  $regs = @{}
  foreach ($m in $reg) { $regs[$m.Groups[1].Value] = $m.Groups[2].Value }
  if (-not ($regs.ContainsKey('ECX') -and $regs.ContainsKey('ESI') -and $regs.ContainsKey('DS'))) { return $null }
  $ecx = [Convert]::ToUInt32($regs['ECX'], 16)
  $esi = [Convert]::ToUInt32($regs['ESI'], 16)
  return [ordered]@{
    cx = ($ecx -band 0xFFFF)
    si = ('{0:X4}' -f ($esi -band 0xFFFF))
    ds = $regs['DS']
  }
}

function Get-DumpBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Gateway DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-OwnDosboxSession -Context 'immediately after launch'

  # --- Phase 1: seek capture -> resolve the LIVE destination segment (never a stale hardcode) ---
  $seekIndex = 0
  $targetHit = $null
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($seekIndex -lt $MaxSeeksBeforeTarget -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "Gateway VGA DAC navigated trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    Write-Host ("[gateway-vga-dac-nav] seek {0}: handle={1} offset=0x{2:X} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $fields.seek_offset, $fields.cs, $fields.eip)
    if ($fields.handle -eq 5 -and $fields.seek_offset -eq $TargetSeekOffset) {
      $targetHit = [ordered]@{ index = $seekIndex; snapshot = $snapshot; fields = $fields }
      break
    }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if (-not $targetHit) {
    throw "descriptor-42 seek (offset 0x$($TargetSeekOffset.ToString('X'))) not observed within $MaxSeeksBeforeTarget seeks"
  }

  $destinationMatch = [regex]::Match($targetHit.snapshot, 'es:\[0010\]=([0-9A-F]{4})')
  $sizeMatch = [regex]::Match($targetHit.snapshot, 'es:\[0008\]=([0-9A-F]{4})')
  if (-not $destinationMatch.Success -or -not $sizeMatch.Success) {
    throw 'descriptor-42 seek snapshot lacks destination segment or code-size annotation'
  }
  $destinationSegment = $destinationMatch.Groups[1].Value
  $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16)
  if ($observedCodeSize -ne $TargetCodeSize) {
    throw "descriptor-42 observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($TargetCodeSize.ToString('X'))"
  }
  Write-Host ("[gateway-vga-dac-nav] resolved LIVE destination segment this run: {0}" -f $destinationSegment)

  $loaderCs = $targetHit.fields.cs
  $seekEip = [Convert]::ToUInt32($targetHit.fields.eip, 16)
  $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)
  Invoke-DebuggerInput -Command "BP $postRead" -Label 'postread-arm' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'postread-run' | Out-Null
  $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
  $postReadAddress = $null
  while ([DateTime]::UtcNow -lt $postReadDeadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'postread-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $postReadAddress = Get-DebuggerAddress $snapshot
    break
  }
  if ($postReadAddress -ne $postRead) { throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress" }

  # Archival identity check: setup+loader region bytes vs retail file, same as Part 4.
  $regionDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $SetupBlockStart) -Label 'region-dump'
  $regionBytes = Get-DumpBytes $regionDump
  $regionFileOffset = $TargetSeekOffset + $SetupBlockStart
  $regionExpected = $overlayBytes[$regionFileOffset..($regionFileOffset + $regionBytes.Count - 1)]
  $regionExactMatch = ((($regionBytes | ForEach-Object { $_.ToString('x2') }) -join '') -eq (($regionExpected | ForEach-Object { $_.ToString('x2') }) -join ''))
  Write-Host ("[gateway-vga-dac-nav] setup+loader region byte match vs retail file: {0}" -f $regionExactMatch)

  # --- Phase 2: arm the REAL loader-entry execution breakpoint, THEN drive real navigation -------
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $LoaderEntry
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'exec-arm' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'exec-run-initial' | Out-Null
  Write-Host ("[gateway-vga-dac-nav] armed execution breakpoint at {0}; entering navigation loop" -f $execBp)

  # Let the (now freely running) CPU settle into the silent title-screen idle loop before the
  # first keypress -- same brief settle recon used, and consistent with Part 4's own proof that
  # nothing in this silent window reaches the loader.
  Start-Sleep -Milliseconds 3000
  try { Capture-GuestFrame (Join-Path $out 'nav-step-00-boot.png') } catch {
    Write-Host "[gateway-vga-dac-nav] WARN: initial screenshot capture failed (non-fatal): $($_.Exception.Message)"
  }

  $navResults = [System.Collections.Generic.List[object]]::new()
  $matchedHit = $null
  for ($i = 0; $i -lt $NavSteps.Count -and -not $matchedHit; $i++) {
    $step = $NavSteps[$i]
    # Check for a hit BEFORE sending the next key too (covers the loader firing during the
    # settle window after the previous key, before we get here).
    $preSnapshot = Invoke-DebuggerInput -Command '' -Label ("nav-{0:D2}-pre-poll" -f $i) -SnapshotOnly
    if ($preSnapshot -notmatch '(?m)^\(Running\)\s*$') {
      $addr = Get-DebuggerAddress $preSnapshot
      if ($addr -eq $execBp) {
        Write-Host ("[gateway-vga-dac-nav] HIT before step {0} ({1})" -f $i, $step.label)
        $matchedHit = [ordered]@{ step_index = $i; step_label = $step.label; when = 'pre-step'; snapshot = $preSnapshot }
        break
      } else {
        Write-Host ("[gateway-vga-dac-nav] WARN: unexpected stop before step {0}: {1} -- resuming" -f $i, $addr)
        Invoke-DebuggerInput -Command 'RUN' -Label ("nav-{0:D2}-unexpected-resume" -f $i) | Out-Null
      }
    }

    Send-GuestKey 'enter'
    Start-Sleep -Milliseconds $PerStepSettleMs

    $shotPath = Join-Path $out ('nav-step-{0:D2}-{1}.png' -f ($i + 1), $step.label)
    try { Capture-GuestFrame $shotPath } catch {
      Write-Host ("[gateway-vga-dac-nav] WARN: screenshot capture failed for step {0}: {1}" -f $i, $_.Exception.Message)
    }

    $stepDeadline = [DateTime]::UtcNow.AddSeconds($PerStepHitTimeoutSeconds)
    $stepHit = $null
    while ([DateTime]::UtcNow -lt $stepDeadline) {
      Start-Sleep -Milliseconds 150
      $snapshot = Invoke-DebuggerInput -Command '' -Label ("nav-{0:D2}-post-poll" -f $i) -SnapshotOnly
      if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
      $addr = Get-DebuggerAddress $snapshot
      if ($addr -eq $execBp) {
        $stepHit = [ordered]@{ step_index = $i; step_label = $step.label; when = 'post-step'; snapshot = $snapshot }
        break
      }
      Write-Host ("[gateway-vga-dac-nav] WARN: unexpected stop after step {0}: {1} -- resuming" -f $i, $addr)
      Invoke-DebuggerInput -Command 'RUN' -Label ("nav-{0:D2}-unexpected-resume2" -f $i) | Out-Null
      $stepDeadline = [DateTime]::UtcNow.AddSeconds($PerStepHitTimeoutSeconds)
    }
    $navResults.Add([ordered]@{
      step_index = $i
      step_label = $step.label
      note = $step.note
      screenshot = $shotPath
      hit = [bool]$stepHit
    })
    if ($stepHit) {
      Write-Host ("[gateway-vga-dac-nav] HIT after step {0} ({1})" -f $i, $step.label)
      $matchedHit = $stepHit
      break
    } else {
      Write-Host ("[gateway-vga-dac-nav] no hit within {0}s after step {1} ({2})" -f $PerStepHitTimeoutSeconds, $i, $step.label)
    }
  }

  $result = [ordered]@{
    schema_version = 1
    title = 'Gateway VGA DAC bulk-loader (descriptor 42) -- Part 5 navigated-picture-display probe'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    target_seek_offset = ('0x{0:X}' -f $TargetSeekOffset)
    seek_index_observed = $targetHit.index
    runtime_destination_segment = $destinationSegment
    setup_region_byte_match_vs_retail = $regionExactMatch
    execution_breakpoint = $execBp
    known_constants = [ordered]@{
      si_table_offset = ('0x{0:X}' -f $KnownSi)
      cx_register_count = $KnownCx
      first_dac_register = ('0x{0:X}' -f $KnownFirstRegister)
      last_dac_register = ('0x{0:X}' -f ($KnownFirstRegister + $KnownCx - 1))
    }
    navigation_technique = 'Bounded, screenshot-verified 8-step ENTER sequence proven this round by tools/recon_gateway_frontend_nav.ps1 (build/gateway-frontend-recon-20260717b/*.png) -- NOT a guessed/unbounded search. No save file used. Every step defaults to the first/highlighted menu choice.'
    nav_steps = $navResults
    matched = [bool]$matchedHit
  }

  if ($matchedHit) {
    $hitFields = Get-BulkLoaderExecFields -Snapshot $matchedHit.snapshot
    [IO.File]::WriteAllText((Join-Path $out 'exec-hit-console.txt'), $matchedHit.snapshot, [Text.UTF8Encoding]::new($false))
    $identityDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $SetupBlockStart) -Label 'exec-hit-identity-dump'
    $identityBytes = Get-DumpBytes $identityDump
    $identityFileOffset = $TargetSeekOffset + $SetupBlockStart
    $identityExpected = $overlayBytes[$identityFileOffset..($identityFileOffset + $identityBytes.Count - 1)]
    $dsWindowStart = $FixupWordOffset - $SetupBlockStart
    $isIdentityMatch = $true
    for ($bi = 0; $bi -lt [Math]::Min($identityBytes.Count, $identityExpected.Count); $bi++) {
      if ($bi -eq $dsWindowStart -or $bi -eq ($dsWindowStart + 1)) { continue }
      if ($identityBytes[$bi] -ne $identityExpected[$bi]) { $isIdentityMatch = $false; break }
    }
    $result.hit_details = [ordered]@{
      step_index = $matchedHit.step_index
      step_label = $matchedHit.step_label
      when = $matchedHit.when
      registers = $hitFields
      identity_match_excluding_ds_window = $isIdentityMatch
    }
    if ($hitFields -and $isIdentityMatch) {
      $resolvedDs = $hitFields.ds
      $resolvedSi = $hitFields.si
      $resolvedCx = $hitFields.cx
      $tableDump = Invoke-DebuggerInput -Command ('D {0}:{1}' -f $resolvedDs, $resolvedSi) -Label 'palette-table-dump'
      $tableBytes = Get-DumpBytes $tableDump
      $registers = @()
      for ($ri = 0; $ri -lt $resolvedCx -and ($ri * 3 + 2) -lt $tableBytes.Count; $ri++) {
        $r6 = $tableBytes[$ri * 3]; $g6 = $tableBytes[$ri * 3 + 1]; $b6 = $tableBytes[$ri * 3 + 2]
        $registers += [ordered]@{
          register = ('0x{0:X2}' -f ($KnownFirstRegister + $ri))
          r6 = $r6; g6 = $g6; b6 = $b6
          in_6bit_dac_range = ($r6 -le 63 -and $g6 -le 63 -and $b6 -le 63)
          r8 = [Math]::Round($r6 * 255.0 / 63.0)
          g8 = [Math]::Round($g6 * 255.0 / 63.0)
          b8 = [Math]::Round($b6 * 255.0 / 63.0)
        }
      }
      $result.resolved_ds_segment = $resolvedDs
      $result.palette_table = [ordered]@{
        runtime_address = ('{0}:{1}' -f $resolvedDs, $resolvedSi)
        byte_count_dumped = $tableBytes.Count
        needed_bytes = $resolvedCx * 3
        all_bytes_in_6bit_dac_range = (($registers | Where-Object { -not $_.in_6bit_dac_range }).Count -eq 0)
        registers = $registers
      }
      $result.claim = "Genuine CS:IP execution reached the bulk DAC loader entry ($execBp) during scripted, screenshot-verified front-end navigation (step '$($matchedHit.step_label)'), with resident bytes matching descriptor 42's retail code exactly outside the DS-immediate window. Live registers at that stop: CX=$resolvedCx, DS=$resolvedDs, SI=$resolvedSi. Dumping $resolvedDs`:$resolvedSi recovers the live RGB source bytes for registers 0x$($KnownFirstRegister.ToString('X'))..0x$(($KnownFirstRegister+$KnownCx-1).ToString('X'))."
    } else {
      $result.claim = "Execution reached $execBp during navigation (step '$($matchedHit.step_label)') but identity verification failed (bytes outside the DS window did not match retail descriptor-42 code, or registers were not captured) -- treating as an unconfirmed hit, not a resolved result."
    }
  } else {
    $result.claim = "The bulk DAC loader entry ($execBp) was never reached across all $($NavSteps.Count) steps of the proven front-end navigation sequence (title -> logo -> credits -> version banner -> main menu -> race/gender/class/alignment pick), each polled for up to ${PerStepHitTimeoutSeconds}s. This rules out the entire pre-game front-end and initial character-creation flow as the trigger for this specific loader, narrowing (not closing) the 'behind a specific picture' theory from Part 4 -- the picture(s) that require it, if any exist, are further into the game than this session reached (e.g. deeper in character creation past ALIGNMENT, or an actual in-world/travel BIGPIC scene, both of which would need either more navigation depth or a save file). The real DS segment and RGB values for registers 18-31 remain UNLOCATED."
  }

  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'gateway-vga-dac-navigated.json') -Encoding utf8
  Write-Host ("[gateway-vga-dac-nav] RESULT: matched={0} out={1}" -f [bool]$matchedHit, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
