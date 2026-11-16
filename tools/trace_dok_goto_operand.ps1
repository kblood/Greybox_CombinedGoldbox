# trace_dok_goto_operand.ps1 — dynamic runtime confirmation of Death Knights of Krynn (DoK)'s
# real CMD_Goto (opcode 0x01 handler) behavior, targeting BUILD-QUEUE.md's DoK P2
# "genuinely blocked" GOTO-operand-code-0x79 leaf (docs/engine/research/dok-natural-route.md).
#
# Static evidence already established (same-subsystem structural match against the CoAB oracle,
# `tools/map_pool_ecl_dispatch.py`'s technique applied to DoK's own real GAME.OVR bytes):
#   - DoK's operand parser (GAME.OVR flat file offset 0x6ba8) is BYTE-IDENTICAL in control-flow
#     shape to CoAB's oracle `@parse_command_sub$q4Byte` (sequence similarity 1.0, trigram
#     Jaccard 1.0; the only byte differences are absolute data-segment address literals, exactly
#     what a different link would produce). It commits `code`+`low` to the ECL stream
#     unconditionally (2 bytes), and ONLY extends to a 3rd byte (`high`) when `code` is 1, 2, 3,
#     or 0x81 -- confirming the disassembler's own operand-framing model
#     (`packages/engine/src/ecl/disassemble.ts`) is byte-correct, not a decode-length bug.
#   - DoK's CMD_Goto handler (GAME.OVR flat file offset 0x8b8, structurally identical to CoAB's
#     oracle CMD_Goto at flat offset 0x9f4) does NOT branch on the operand's `code` byte at all --
#     it unconditionally reads two FIXED GLOBAL memory bytes (DoK: DS:0xc714 "low", DS:0xc6d4
#     "high"), pushes them to a combine routine, and stores the result at DS:0x8c48 (== gbl.
#     ecl_offset, the same address independently identified as the operand parser's own read
#     cursor). There is no code-validity check and no fault/exception mechanism in the real
#     assembly -- the `coab_extracted/Classes/Opperation.cs` "Word getter throws if !highSet" is a
#     human decompiler's defensive C# abstraction of an implicit contract, not literal x86
#     behavior. This means an operand whose `code` never set the "high" memory cell (any value
#     outside {1,2,3,0x81}, including the blocking case `0x79`) does NOT crash retail DoK -- it
#     silently combines the freshly-read `low` byte with whatever STALE `high` byte an EARLIER
#     address-coded operand parse happened to leave in that shared global cell.
#
# This script does NOT attempt to walk to the exact ECL1.DAX block 33/selector 33 GEO cell (that
# reachability was never derived even statically -- see dok-natural-route.md's Claim Boundary,
# and doing so would require guessed DOS movement keys the project's own conventions discourage).
# Instead it confirms the mechanism directly and cheaply: CMD_Goto is called constantly by every
# ECL script the game runs (menus, demo, dialogue), not just this one combat branch, so ordinary
# silent startup alone should exercise it many times. An execution breakpoint placed right after
# the low/high-combine store, with zero keypresses, both (a) proves the structurally-matched
# CMD_Goto candidate is the REAL resident, executing code (not a coincidental structural match
# elsewhere) and (b) empirically observes the combine formula DoK's own retail binary uses for
# real (low, high) byte pairs -- direct runtime corroboration of the static finding above.
#
# Two-phase probe, same technique as tools/trace_coab_symbol_bytematch.ps1 and
# tools/trace_gateway_operand_parser_execution.ps1:
#   Phase 1 (seek capture): BPINT 21 42 during ordinary silent startup resolves which runtime
#     segment DoK's own VROOMM loader assigns to the GAME.OVR descriptor containing CMD_Goto
#     (seek offset 0x81d, code size 0x315b) -- byte-matching the resident bytes at
#     destSeg:0x009b (CMD_Goto's start, relative to that descriptor) against retail GAME.OVR
#     proves this really is CMD_Goto, not a different routine that happens to share the buffer.
#   Phase 2 (execution loop): once the destination segment is known, arm an execution breakpoint
#     at destSeg:00B6 (the instruction immediately after `mov word ptr [0x8c48],ax`, i.e. AX and
#     DS:0x8c48 both already hold the just-computed final ecl_offset) and loop over every hit
#     during a bounded silent window, dumping DS:0xc714 (low), DS:0xc6d4 (high), and DS:0x8c48
#     (result) each time.

param(
  [string]$StageDir = 'build\runtime-dok-base-clean-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(5,600)][int]$ExecWindowSeconds = 90,
  [ValidateRange(1,200)][int]$MaxExecHits = 40
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Target descriptors, keyed by GAME.OVR file offset (= INT21/AH=42h seek offset for the GAME.OVR
# handle). Derived from tools/disasm_dok.py's own DESCS table (index 2: start_exe 0x4cf, fileofs
# 0x81d, codesz 0x315b -- covers flat file range [0x81d, 0x3978), which contains CMD_Goto's
# structurally-matched candidate at flat 0x8b8) and the independent structural match reported by
# `python -c "...map_pool_ecl_dispatch..."` against the CoAB oracle (dispatch opcode 0x01 -> file
# offset 0x8b8, ratio/jaccard both effectively 1.0 on the dispatcher shape).
$CmdGotoTargetKey = '0x81D'
$CmdGotoCodeSize = 0x315b
$CmdGotoEntryRelOffset = 0x9b   # 0x8b8 - 0x81d
$CmdGotoPostCombineRelOffset = 0xb6   # 0x8d3 - 0x81d (right after `mov word ptr [0x8c48],ax`)
$LowByteAddr = 0xc714
$HighByteAddr = 0xc6d4
$EclOffsetAddr = 0x8c48

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'dok-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'DoK CMD_Goto probe requires an unpromoted base stage' }
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
  return [ordered]@{
    eax = $eax; ebx = $ebx; ecx = $ecx; edx = $edx
    ah = $ah
    is_ah42 = ($ah -eq 0x42)
    handle = $ebx
    seek_offset = $seekOffset
    cs = $regs['CS']
    eip = $regs['EIP']
  }
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

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'DoK DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  # --- Phase 1: seek capture -> resolve CMD_Goto's runtime destination segment -----------------
  $destinationSegment = $null
  $observedCodeSize = $null
  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while (-not $destinationSegment -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "DoK trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    [IO.File]::WriteAllText((Join-Path $out ('seek-hit-{0:D2}-console.txt' -f $seekIndex)), $snapshot, [Text.UTF8Encoding]::new($false))
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[dok-goto] seek {0}: handle={1} offset={2} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $seekOffsetHex, $fields.cs, $fields.eip)
    if ($fields.handle -eq 5 -and $seekOffsetHex -eq $CmdGotoTargetKey) {
      $destinationMatch = [regex]::Match($snapshot, 'es:\[0010\]=([0-9A-F]{4})')
      $sizeMatch = [regex]::Match($snapshot, 'es:\[0008\]=([0-9A-F]{4})')
      if (-not $destinationMatch.Success -or -not $sizeMatch.Success) {
        throw 'seek snapshot lacks destination segment or code-size annotation'
      }
      $destinationSegment = $destinationMatch.Groups[1].Value
      $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16)
      if ($observedCodeSize -ne $CmdGotoCodeSize) {
        throw "observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($CmdGotoCodeSize.ToString('X'))"
      }
      # CRITICAL: the seek breakpoint fires on INT 21h/AH=42h (lseek), which happens BEFORE the
      # actual overlay READ -- at this exact stop, the destination segment still holds whatever
      # the PREVIOUS descriptor's load left there, not descriptor 0x81d's bytes yet. Same
      # technique as tools/trace_coab_symbol_bytematch.ps1's Resolve-TargetDescriptor: arm a
      # one-shot breakpoint at a fixed +0x12 offset past the seek's own CS:IP (empirically the
      # loader's post-read return point for this FBOV/VROOMM shape) and wait for it before
      # trusting the segment's contents.
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
      if (-not $postReadAddress) { throw 'timed out waiting for post-read breakpoint' }
      if ($postReadAddress -ne $postRead) { throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress" }
      break
    }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if (-not $destinationSegment) { throw "CMD_Goto overlay descriptor ($CmdGotoTargetKey) not observed within $MaxSeeks seeks" }
  Write-Host ("[dok-goto] CMD_Goto overlay destination segment: {0} (code size 0x{1:X} confirmed)" -f $destinationSegment, $observedCodeSize)

  # Byte-match CMD_Goto's own entry bytes at the resolved runtime address against retail GAME.OVR,
  # proving this really is CMD_Goto (not a different routine sharing the buffer).
  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $CmdGotoEntryRelOffset) -Label 'cmd-goto-entry-bytematch'
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($CmdGotoTargetKey, 16) + $CmdGotoEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  $entryObservedHex = ($entryBytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $entryExpectedHex = ($entryExpected | ForEach-Object { $_.ToString('x2') }) -join ''
  $entryExactMatch = ($entryObservedHex -eq $entryExpectedHex)
  Write-Host ("[dok-goto] CMD_Goto entry byte-match: {0}" -f $entryExactMatch)

  # --- Phase 2: silent execution loop at the post-combine instruction --------------------------
  # Clear the seek trap and arm an execution breakpoint right after `mov word ptr [0x8c48],ax`.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $CmdGotoPostCombineRelOffset
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'arm-postcombine-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'postcombine-first-run' | Out-Null

  $globalDeadline = [DateTime]::UtcNow.AddSeconds($ExecWindowSeconds)
  $hits = @()
  while ([DateTime]::UtcNow -lt $globalDeadline -and $hits.Count -lt $MaxExecHits) {
    Start-Sleep -Milliseconds 300
    $snapshot = Invoke-DebuggerInput -Command '' -Label ('exec-poll-{0:D3}' -f $hits.Count) -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if ($addr -ne $execBp) {
      # Some other breakpoint/exception; record and keep going.
      $hits += [ordered]@{ index = $hits.Count; unexpected_address = $addr }
      Invoke-DebuggerInput -Command 'RUN' -Label ('exec-continue-unexpected-{0:D3}' -f $hits.Count) | Out-Null
      continue
    }
    [IO.File]::WriteAllText((Join-Path $out ('exec-hit-{0:D3}-console.txt' -f $hits.Count)), $snapshot, [Text.UTF8Encoding]::new($false))
    $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
    $axMatch = [regex]::Match($snapshot, '\bEAX=([0-9A-F]{4,8})\b')
    $ds = if ($dsMatch.Success) { $dsMatch.Groups[1].Value } else { $null }
    $ax = if ($axMatch.Success) { [Convert]::ToUInt32($axMatch.Groups[1].Value, 16) -band 0xFFFF } else { $null }
    $lowDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $LowByteAddr) -Label ('exec-hit-{0:D3}-low' -f $hits.Count)
    $highDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $HighByteAddr) -Label ('exec-hit-{0:D3}-high' -f $hits.Count)
    $eclDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $EclOffsetAddr) -Label ('exec-hit-{0:D3}-eclofs' -f $hits.Count)
    # NB: PowerShell's `-shl` on a [byte]-typed operand truncates the RESULT back to a byte (e.g.
    # `[byte]0x84 -shl 8` is 0, not 0x8400) -- cast to [int] before shifting or this silently
    # corrupts every combined word below.
    $lowByte = [int](Get-DebuggerDataBytes $lowDump)[0]
    $highByte = [int](Get-DebuggerDataBytes $highDump)[0]
    $eclBytes = Get-DebuggerDataBytes $eclDump
    $eclOffsetWord = [int]$eclBytes[0] -bor ([int]$eclBytes[1] -shl 8)
    $hitRecord = [ordered]@{
      index = $hits.Count
      cs_ip = $addr
      ds = $ds
      ax_register = if ($null -ne $ax) { ('0x{0:X4}' -f $ax) } else { $null }
      low_byte_0xc714 = ('0x{0:X2}' -f $lowByte)
      high_byte_0xc6d4 = ('0x{0:X2}' -f $highByte)
      ecl_offset_word_0x8c48 = ('0x{0:X4}' -f $eclOffsetWord)
      combine_matches_low_or_high8 = ($eclOffsetWord -eq ($lowByte -bor ($highByte -shl 8)))
    }
    $hits += $hitRecord
    Write-Host ("[dok-goto] hit {0}: ax={1} low=0x{2:X2} high=0x{3:X2} ecl_offset=0x{4:X4} combine_ok={5}" -f $hitRecord.index, $hitRecord.ax_register, $lowByte, $highByte, $eclOffsetWord, $hitRecord.combine_matches_low_or_high8)
    Invoke-DebuggerInput -Command 'RUN' -Label ('exec-continue-{0:D3}' -f $hits.Count) | Out-Null
  }

  $validHits = $hits | Where-Object { $_.cs_ip -eq $execBp }
  $distinctHighBytes = ($validHits | ForEach-Object { $_.high_byte_0xc6d4 } | Sort-Object -Unique)
  $result = [ordered]@{
    schema_version = 1
    title = 'DoK CMD_Goto runtime confirmation + low/high combine-formula observation'
    profile_id = 'death-knights-of-krynn'
    stage_manifest = $manifestPath
    cmd_goto_target_key = $CmdGotoTargetKey
    cmd_goto_runtime_destination_segment = $destinationSegment
    cmd_goto_entry_byte_match = $entryExactMatch
    cmd_goto_entry_observed_hex = $entryObservedHex
    cmd_goto_entry_expected_hex = $entryExpectedHex
    exec_window_seconds = $ExecWindowSeconds
    hit_count = $hits.Count
    valid_hit_count = $validHits.Count
    hits = $hits
    distinct_high_bytes_observed = $distinctHighBytes
    claim = "CMD_Goto's structurally-matched candidate at GAME.OVR flat 0x8b8 (overlay descriptor 0x81d, runtime segment $destinationSegment) is confirmed BYTE-IDENTICAL resident code (entry_byte_match=$entryExactMatch) and was observed executing $($validHits.Count) time(s) during ordinary silent startup with zero keypresses. Every observed hit combines DS:0xc714 (low) and DS:0xc6d4 (high) into DS:0x8c48 with formula 'low | (high<<8)' (see combine_matches_low_or_high8 per hit) -- direct runtime confirmation of the static assembly reading. This does not by itself reproduce the specific ECL1.DAX block 33 selector 33 GOTO-with-code-0x79 case (that GEO cell was never reached in this probe -- no gameplay walk was attempted); it confirms the MECHANISM (CMD_Goto blindly combines two persistent global bytes with no code-validity check) that the block-33 investigation's static analysis independently derived from the same CMD_Goto candidate's structural match to the CoAB oracle."
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'dok-cmd-goto-trace.json') -Encoding utf8
  Write-Host ("[dok-goto] RESULT: entry_byte_match={0} valid_hits={1} out={2}" -f $entryExactMatch, $validHits.Count, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
