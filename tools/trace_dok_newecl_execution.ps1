# trace_dok_newecl_execution.ps1 -- direct confirmation of whether DoK's CMD_NewECL handler
# (ECL opcode 0x20, GAME.OVR flat file offset 0x156F, structurally matched against
# coab_extracted/engine/ovr003.cs's CMD_NewECL by tools/trace_dok_geo_block_id.ps1's header
# comment) ever executes during the same cold-boot -> load-save -> slot-A -> begin-adventuring ->
# narrative-dismiss window tools/trace_dok_position_setter.ps1 and
# tools/trace_dok_geo_block_id.ps1 already probed.
#
# Motivation: trace_dok_geo_block_id.ps1's three reproduced live runs (build/dok-geo-block-id-
# 20260717{a-bug,b,c}/) all found the area_ptr-relative struct byte CMD_NewECL is statically known
# to write (area_ptr+0xF2) reading a constant 0 across all 13 hit checkpoints, alongside CoAB's own
# numeric field-offset analogs (+0x18A, +0x1E4) also reading 0 throughout. That is consistent with
# (but does not directly prove) the theory this project already established for CMD_Goto in
# docs/engine/research/dok-natural-route.md's Updates 3/4: a fresh, never-played save's post-load
# narrative/spawn front end routes through native boot code (the CoAB oracle's own
# sub_29758-equivalent), not through ECL-level VM commands, in this specific window. This script
# tests that directly by arming a breakpoint ON CMD_NewECL itself, rather than inferring from an
# unchanged write target.
#
# Per tools/disasm_dok.py's own DESCS table, file offset 0x156F (5487) falls inside descriptor
# index 2 (start_exe 0x4cf, fileofs 0x81d, codesz 0x315b -- range [0x81d, 0x3978)) -- the SAME
# descriptor as CMD_Goto (already resolved twice by tools/trace_dok_goto_operand.ps1, runtime
# destSeg 3854 in that script's own two runs). This script reuses that proven Phase-1 seek/
# byte-match technique (target key 0x81D) rather than re-deriving it, then arms an execution
# breakpoint at relative offset 0xD6C (flat 0x1589 - 0x81D), the instruction immediately after
# `mov byte ptr es:[di+0xf2],al` (the operand-store this round's disassembly found) -- so a hit
# there proves CMD_NewECL's own operand-decode-and-store path executed, and AL/ES:DI at that point
# give the block id and destination struct pointer directly from live registers (no separate
# dereference needed).
#
# GAMELINK COLLISION HAZARD: same safeguards as trace_dok_position_setter.ps1 / trace_dok_geo_block_id.ps1
# (Wait-DosboxExclusive / Assert-OwnDosboxProcess / Assert-GameLinkIdentity).
#
# SYNCHRONOUS/FOREGROUND ONLY.

param(
  [string]$StageDir = 'build\runtime-dok-postel-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(1,60)][int]$PerStepHitTimeoutSeconds = 10,
  [ValidateRange(5,120)][int]$SpawnHitTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$NewEclTargetKey = '0x81D'
$NewEclCodeSize = 0x315b
$NewEclEntryRelOffset = 0xD52    # 0x156F - 0x81D (CMD_NewECL function entry, push bp)
$NewEclPostWriteRelOffset = 0xD6C  # 0x1589 - 0x81D (instr immediately after write to es:[di+0xf2])

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'dok-stage-manifest.json'
$expected = @{
  'START.EXE' = '91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40'
  'GAME.OVR'  = 'fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "DoK stage hash mismatch: $name" }
}
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

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

function Send-GameLinkKeys {
  param([string[]]$Keys, [double]$Pace = 0.4, [int]$MaxAttempts = 4)
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    & python $gameLink press @Keys --pace $Pace
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host ("[dok-newecl] WARN: gamelink press attempt {0}/{1} failed for '{2}', retrying" -f $attempt, $MaxAttempts, ($Keys -join ' '))
    Start-Sleep -Milliseconds 750
  }
  throw "gamelink press failed after $MaxAttempts attempts: $($Keys -join ' ')"
}

function Wait-DosboxExclusive {
  param([int]$TimeoutSeconds = 480, [int]$PollSeconds = 10)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $warned = $false
  while ($true) {
    $existing = Get-Process dosbox-x -ErrorAction SilentlyContinue
    if (-not $existing) { return }
    if ([DateTime]::UtcNow -ge $deadline) {
      $pids = ($existing | Select-Object -ExpandProperty Id) -join ','
      throw ("GameLink collision-avoidance: dosbox-x already running (PID(s): {0}) after waiting {1}s." -f $pids, $TimeoutSeconds)
    }
    if (-not $warned) {
      $pids = ($existing | Select-Object -ExpandProperty Id) -join ','
      Write-Host ("[dok-newecl] WARN: dosbox-x already running (PID(s): {0}) -- waiting for exclusivity" -f $pids)
      $warned = $true
    }
    Start-Sleep -Seconds $PollSeconds
  }
}

function Assert-OwnDosboxProcess {
  param([int]$OwnPid)
  $all = Get-Process dosbox-x -ErrorAction SilentlyContinue
  $foreign = $all | Where-Object { $_.Id -ne $OwnPid }
  if ($foreign) {
    $pids = ($foreign | Select-Object -ExpandProperty Id) -join ','
    throw ("GameLink collision detected mid-session: foreign dosbox-x PID(s) appeared ({0}) alongside our own PID {1}." -f $pids, $OwnPid)
  }
}

function Assert-GameLinkIdentity {
  param([int]$ExpectedWidth = 640, [int]$ExpectedHeight = 400, [string]$Label = 'identity-check')
  $statusJson = & python $gameLink status
  if ($LASTEXITCODE -ne 0) { throw "gamelink status failed ($Label)" }
  $status = $statusJson | ConvertFrom-Json
  if ($status.frame.width -ne $ExpectedWidth -or $status.frame.height -ne $ExpectedHeight) {
    throw ("GameLink identity check failed at {0}: frame is {1}x{2}." -f $Label, $status.frame.width, $status.frame.height)
  }
  return $status
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
  $seekOffset = (($ecx -band 0xFFFF) -shl 16) -bor ($edx -band 0xFFFF)
  return [ordered]@{ ah = $ah; is_ah42 = ($ah -eq 0x42); handle = $ebx; seek_offset = $seekOffset; cs = $regs['CS']; eip = $regs['EIP'] }
}

function Get-DebuggerDataBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

function ConvertTo-HexLower { param([byte[]]$Bytes) return -join ($Bytes | ForEach-Object { $_.ToString('x2') }) }

try {
  Wait-DosboxExclusive
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoActionScreenshots
  if (-not $?) { throw 'DoK DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-OwnDosboxProcess -OwnPid $process.Id

  # --- Phase 1: seek capture -> resolve descriptor 0x81D's runtime destination segment -----------
  $destinationSegment = $null
  $observedCodeSize = $null
  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while (-not $destinationSegment -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) { throw "trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex" }
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[dok-newecl] seek {0}: handle={1} offset={2}" -f $seekIndex, $fields.handle, $seekOffsetHex)
    if ($fields.handle -eq 5 -and $seekOffsetHex -eq $NewEclTargetKey) {
      $destinationMatch = [regex]::Match($snapshot, 'es:\[0010\]=([0-9A-F]{4})')
      $sizeMatch = [regex]::Match($snapshot, 'es:\[0008\]=([0-9A-F]{4})')
      if (-not $destinationMatch.Success) { throw 'seek snapshot lacks destination segment annotation' }
      $destinationSegment = $destinationMatch.Groups[1].Value
      if ($sizeMatch.Success) { $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16) }
      $seekCsMatch = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
      $loaderCs = $seekCsMatch.Groups[1].Value
      $seekEip = [Convert]::ToUInt32($seekCsMatch.Groups[2].Value, 16)
      $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)
      Invoke-DebuggerInput -Command "BP $postRead" -Label 'postread-arm' | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label 'postread-run' | Out-Null
      $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
      $postReadAddress = $null
      while ([DateTime]::UtcNow -lt $postReadDeadline) {
        Start-Sleep -Milliseconds 100
        $postReadSnapshot = Invoke-DebuggerInput -Command '' -Label 'postread-poll' -SnapshotOnly
        if ($postReadSnapshot -match '(?m)^\(Running\)\s*$') { continue }
        $postReadAddress = Get-DebuggerAddress $postReadSnapshot
        break
      }
      if ($postReadAddress -ne $postRead) { throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress" }
      break
    }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if (-not $destinationSegment) { throw "NEWECL overlay descriptor ($NewEclTargetKey) not observed within $MaxSeeks seeks" }
  if ($observedCodeSize -ne $NewEclCodeSize) { throw "observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($NewEclCodeSize.ToString('X'))" }
  Write-Host ("[dok-newecl] descriptor 0x81D runtime destination segment: {0} (code size 0x{1:X} confirmed)" -f $destinationSegment, $observedCodeSize)

  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $NewEclEntryRelOffset) -Label 'newecl-entry-bytematch-phase1'
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($NewEclTargetKey, 16) + $NewEclEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  $entryExactMatch = ((ConvertTo-HexLower $entryBytes) -eq (ConvertTo-HexLower $entryExpected))
  Write-Host ("[dok-newecl] CMD_NewECL entry byte-match (phase 1): {0}" -f $entryExactMatch)
  if (-not $entryExactMatch) { throw 'CMD_NewECL entry byte-match failed -- destSeg does not hold expected resident code' }

  # --- Phase 2: arm the post-write breakpoint ONCE, leave it armed for the whole run --------------
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $NewEclPostWriteRelOffset
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'arm-newecl-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'newecl-first-run' | Out-Null
  Start-Sleep -Milliseconds 1500

  $steps = @(
    @{ keys = @('enter'); label = 'dismiss-title' },
    @{ keys = @('enter'); label = 'dismiss-credits' },
    @{ keys = @('enter'); label = 'skip-credits' },
    @{ keys = @('down','down'); label = 'nav-load-saved-game' },
    @{ keys = @('enter'); label = 'select-load-saved-game' },
    @{ keys = @('enter'); label = 'select-death-knights' },
    @{ keys = @('enter'); label = 'select-slot-a' },
    @{ keys = @('down','down','down','down','down'); label = 'nav-begin-adventuring' },
    @{ keys = @('enter'); label = 'select-begin-adventuring' },
    @{ keys = @('enter'); label = 'narrative-1' },
    @{ keys = @('enter'); label = 'narrative-2' },
    @{ keys = @('enter'); label = 'narrative-3' },
    @{ keys = @('enter'); label = 'narrative-4' },
    @{ keys = @('enter'); label = 'narrative-5' }
  )
  $checkpoints = [System.Collections.Generic.List[object]]::new()
  foreach ($step in $steps) {
    Assert-OwnDosboxProcess -OwnPid $process.Id
    Invoke-DebuggerInput -Command 'RUN' -Label "$($step.label)-preresume" | Out-Null
    Send-GameLinkKeys -Keys $step.keys -Pace 0.4
    Assert-GameLinkIdentity -Label $step.label | Out-Null
    Write-Host ("[dok-newecl] checkpoint: {0}" -f $step.label)
    $deadline2 = [DateTime]::UtcNow.AddSeconds($PerStepHitTimeoutSeconds)
    $addr = $null
    $snap = $null
    while ([DateTime]::UtcNow -lt $deadline2) {
      Start-Sleep -Milliseconds 150
      $snap = Invoke-DebuggerInput -Command '' -Label "$($step.label)-poll" -SnapshotOnly
      if ($snap -match '(?m)^\(Running\)\s*$') { continue }
      $addr = Get-DebuggerAddress $snap
      if ($addr -eq $execBp) { break }
      Invoke-DebuggerInput -Command 'RUN' -Label "$($step.label)-run-again" | Out-Null
      $addr = $null
    }
    if ($addr -eq $execBp) {
      [IO.File]::WriteAllText((Join-Path $out "$($step.label)-hit-console.txt"), $snap, [Text.UTF8Encoding]::new($false))
      $axMatch = [regex]::Match($snap, '\bEAX=([0-9A-F]{4,8})\b')
      $esMatch = [regex]::Match($snap, '\bES=([0-9A-F]{4})\b')
      $diMatch = [regex]::Match($snap, '\bEDI=([0-9A-F]{4,8})\b')
      $ax = if ($axMatch.Success) { [Convert]::ToUInt32($axMatch.Groups[1].Value, 16) -band 0xFFFF } else { $null }
      $cp = [ordered]@{
        label = $step.label; hit = $true; cs_ip = $addr
        al_block_id = if ($null -ne $ax) { ($ax -band 0xFF) } else { $null }
        es = if ($esMatch.Success) { $esMatch.Groups[1].Value } else { $null }
        di = if ($diMatch.Success) { [Convert]::ToUInt32($diMatch.Groups[1].Value, 16) -band 0xFFFF } else { $null }
      }
      Write-Host ("[dok-newecl]   HIT: al_block_id={0} es={1} di=0x{2:X4}" -f $cp.al_block_id, $cp.es, $cp.di)
      Invoke-DebuggerInput -Command 'RUN' -Label "$($step.label)-post-resume" | Out-Null
      $checkpoints.Add([ordered]@{ label = $step.label; snapshot = $cp })
    } else {
      Write-Host ("[dok-newecl]   {0}: no CMD_NewECL hit within {1}s" -f $step.label, $PerStepHitTimeoutSeconds)
      $checkpoints.Add([ordered]@{ label = $step.label; snapshot = $null })
    }
  }

  $entryExactMatchPostNav = $null
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-exec-trap-for-reverify' | Out-Null
  $entryDump2 = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $NewEclEntryRelOffset) -Label 'newecl-entry-bytematch-postnav'
  $entryBytes2 = Get-DebuggerDataBytes $entryDump2
  $entryExactMatchPostNav = ((ConvertTo-HexLower $entryBytes2) -eq (ConvertTo-HexLower $entryExpected))
  Write-Host ("[dok-newecl] CMD_NewECL entry byte-match (post-navigation re-verify): {0}" -f $entryExactMatchPostNav)

  $anyHit = ($checkpoints | Where-Object { $_.snapshot }).Count -gt 0
  $result = [ordered]@{
    schema_version = 1
    title = 'DoK CMD_NewECL direct execution test -- does opcode 0x20 fire during boot-to-spawn?'
    profile_id = 'death-knights-of-krynn'
    stage_manifest = $manifestPath
    input_mechanism = 'GameLink (tools/dosbox_gamelink.py)'
    newecl_target_key = $NewEclTargetKey
    newecl_runtime_destination_segment = $destinationSegment
    newecl_entry_byte_match_phase1 = $entryExactMatch
    newecl_entry_byte_match_post_navigation = $entryExactMatchPostNav
    exec_bp = $execBp
    checkpoints = $checkpoints
    any_hit_anywhere = $anyHit
    claim_boundary = (
      'Direct execution test of DoKs own CMD_NewECL handler (GAME.OVR flat 0x1589, right after the ' +
      'operand-decode-and-store instruction this rounds disassembly found) across the identical ' +
      '14-checkpoint cold-boot -> load-save -> slot-A -> begin-adventuring -> narrative-dismiss ' +
      'window tools/trace_dok_position_setter.ps1 and tools/trace_dok_geo_block_id.ps1 already ' +
      'probed. A true/true entry-byte-match with zero hits is the honest negative case: CMD_NewECL ' +
      'genuinely does not execute in this window (consistent with a fresh/never-played saves post- ' +
      'load flow routing through native boot code instead, matching the same pattern already proven ' +
      'for CMD_Goto in Updates 3/4 of dok-natural-route.md) -- NOT evidence that block transitions ' +
      'never happen in DoK generally, only that this specific scripted window does not exercise them.'
    )
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'dok-newecl-execution-trace.json') -Encoding utf8
  Write-Host ("[dok-newecl] RESULT: any_hit_anywhere={0} out={1}" -f $anyHit, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
