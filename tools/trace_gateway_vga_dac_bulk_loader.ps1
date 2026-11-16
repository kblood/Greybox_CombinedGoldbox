# trace_gateway_vga_dac_bulk_loader.ps1 -- resolve the runtime DS segment (and, from it, the real
# source RGB table) for Gateway's direct-port bulk VGA DAC loader, documented in
# docs/engine/research/gateway-vga-picture-format.md Part 2 at GAME.OVR file offset 0x51566..0x51585
# ("Direct-port bulk DAC loader"). That doc explicitly left open: "The call site (which sets CX and
# SI) was not located this session" -- static disassembly THIS session (see the accompanying
# research-doc update) found the setup is not a separate call site at all: it is straight-line code
# immediately preceding the loader, at GAME.OVR+0x51559..0x51565 (relative offset 0x1814..0x1820
# inside VROOMM descriptor 42), which does:
#
#   push ds ; mov ax, 0x04C7 ; mov ds, ax ; mov si, 0xA108 ; mov cx, 0x0E ; cld
#
# CX (register count, 0x0E = 14 decimal) and SI (table offset, 0xA108) are pure immediates with NO
# fixup-table entry -- both are already known exactly from static bytes alone (verified against
# tools/vroomm_layout.py's fixup-context classifier: file offset 0x51815+1=0x51816's relative
# descriptor offset 0x1816 IS a "mov_reg_segment_immediate" fixup target, but the SI-load's operand
# offset (0x181B) is NOT in descriptor 42's fixup table). Only the DS segment (loaded via a `mov ax,
# imm16` at that SAME confirmed fixup offset, 0x1816) is genuinely unresolved: it is one of
# descriptor 42's 35 real VROOMM relocation entries, so the literal file word 0x04C7 is a
# to-be-relocated placeholder, not the real runtime segment -- this is exactly the class of gap that
# needs a live trace, per tools/vroomm_layout.py's own documented boundary ("MOV segment immediates
# with no encoded target offset" -- i.e. statically unresolvable).
#
# Method: reuse the exact seek/postread technique tools/trace_gateway_descriptor9_bytematch.ps1
# already proved for descriptor 9 (BPINT 21 42 catches every VROOMM seek; wait for descriptor 42's
# own file offset; the loader's post-read return address is a fixed CS:(EIP_at_seek + 0x12) offset).
# At that post-read stop -- reached during ordinary silent startup, zero keypresses, same as every
# other Gateway trace in this project -- dump the resident bytes at the confirmed runtime segment's
# relative offset 0x1816 as DATA (not code execution): if VROOMM applies fixups inline as part of
# this same read-and-preload pass (an open question this run answers empirically), those two bytes
# will differ from the raw file word 0x04C7 and ARE the real, fixed-up DS segment. If they still read
# back as literal 0xC7,0x04, fixups are not applied at this preload stage and this technique's answer
# is a clean, honest "not resolved this way" (falls back to the file's own findings section, not a
# guess).
#
# Once a real (fixed-up) DS segment is obtained, this script also dumps 48 bytes at
# <resolved DS>:0xA108 (CX=14 RGB triples = 42 bytes, +6 bytes margin) to recover the actual palette
# source table, and separately dumps the loader-region bytes themselves (0x1800..0x1900 relative,
# spanning the full "Direct-port bulk DAC loader" + both "direct call site" INT 10h blocks already
# documented) for archival/byte-identity cross-check against the retail GAME.OVR file.

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeksBeforeTarget = 60,
  [ValidateRange(5,90)][int]$FirstSeekTimeoutSeconds = 30,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 5,
  [ValidateRange(1,200)][int]$ExecMaxHits = 80,
  [ValidateRange(5,120)][int]$ExecFirstHitTimeoutSeconds = 30,
  [ValidateRange(1,20)][int]$ExecNextHitTimeoutSeconds = 4
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# VROOMM descriptor 42 (per tools/gen1_map.py's scan_descriptors against the hash-locked stage):
# ovr_file_offset=326981 (0x4FD45), code_size=6691 (0x1A23), fixup_size=70 (35 entries).
$TargetSeekOffset = 0x4FD45
$TargetCodeSize = 0x1A23
# Relative offsets inside descriptor 42's code body (0-based from the descriptor's own load base).
$SetupBlockStart = 0x1814   # `push ds` -- start of the CX/DS/SI setup immediately before the loader
$FixupWordOffset = 0x1816   # the `mov ax, imm16` operand word -- confirmed VROOMM fixup target
$LoaderEntry = 0x1821       # `mov dx, 0x3DA` -- first instruction of the bulk DAC loader itself
$LoaderRegionEnd = 0x18C4   # generous end bound covering both direct INT10h call sites too
$RawDsWord = 0x04C7         # literal (pre-fixup) file word at $FixupWordOffset
$KnownSi = 0xA108           # NOT a fixup target -- proven-constant table offset (static bytes only)
$KnownCx = 14                # NOT a fixup target -- proven-constant register count (static bytes only)
$KnownFirstRegister = 0x12   # BL literal immediate a few bytes into the loader (0x51571) -- registers
                              # 0x12..0x1F (18..31 decimal), 14 total, i.e. Gateway's remaining
                              # "extra DAC registers" beyond the already-proven 16/17.

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway VGA DAC bulk-loader probe requires an unpromoted base stage' }
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

  $seekIndex = 0
  $targetHit = $null
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($seekIndex -lt $MaxSeeksBeforeTarget -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "Gateway VGA DAC bulk-loader trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    [IO.File]::WriteAllText((Join-Path $out ('seek-hit-{0:D2}-console.txt' -f $seekIndex)), $snapshot, [Text.UTF8Encoding]::new($false))
    Write-Host ("[gateway-vga-dac] seek {0}: handle={1} offset=0x{2:X} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $fields.seek_offset, $fields.cs, $fields.eip)
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

  $loaderCs = $targetHit.fields.cs
  $seekEip = [Convert]::ToUInt32($targetHit.fields.eip, 16)
  $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)

  Invoke-DebuggerInput -Command "BP $postRead" -Label 'postread-arm' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'postread-run' | Out-Null
  $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
  $postReadSnapshot = $null
  $postReadAddress = $null
  while ([DateTime]::UtcNow -lt $postReadDeadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'postread-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $postReadSnapshot = $snapshot
    $postReadAddress = Get-DebuggerAddress $snapshot
    break
  }
  if (-not $postReadAddress) { throw 'timed out waiting for post-read breakpoint' }
  if ($postReadAddress -ne $postRead) {
    throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress"
  }
  [IO.File]::WriteAllText((Join-Path $out 'postread-hit-console.txt'), $postReadSnapshot, [Text.UTF8Encoding]::new($false))

  # 1) Archival dump + byte-identity check of the whole setup+loader+INT10h region, straight from
  #    the just-populated shared overlay buffer, against the retail GAME.OVR file at the matching
  #    absolute file offset ($TargetSeekOffset + relative offset).
  $regionLen = $LoaderRegionEnd - $SetupBlockStart
  $regionDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $SetupBlockStart) -Label 'region-dump'
  $regionBytes = Get-DumpBytes $regionDump
  if ($regionBytes.Count -lt 16) { throw "region dump exposed only $($regionBytes.Count) data bytes" }
  $regionFileOffset = $TargetSeekOffset + $SetupBlockStart
  $regionExpected = $overlayBytes[$regionFileOffset..($regionFileOffset + $regionBytes.Count - 1)]
  $regionObservedHex = ($regionBytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $regionExpectedHex = ($regionExpected | ForEach-Object { $_.ToString('x2') }) -join ''

  # 2) The fixup word itself: relative offset $FixupWordOffset, 2 bytes, little-endian segment value.
  $fixupWordDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $FixupWordOffset) -Label 'fixup-word-dump'
  $fixupWordBytes = Get-DumpBytes $fixupWordDump
  if ($fixupWordBytes.Count -lt 2) { throw 'fixup word dump exposed fewer than 2 bytes' }
  $observedDsWord = [int]$fixupWordBytes[0] -bor ([int]$fixupWordBytes[1] -shl 8)
  $fixupApplied = ($observedDsWord -ne $RawDsWord)

  $result = [ordered]@{
    schema_version = 1
    title = 'Gateway VGA DAC bulk-loader (descriptor 42) runtime DS-segment resolution'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    target_seek_offset = ('0x{0:X}' -f $TargetSeekOffset)
    target_code_size = ('0x{0:X}' -f $TargetCodeSize)
    seek_index_observed = $targetHit.index
    seek_loader_cs_ip = ('{0}:{1}' -f $loaderCs, $targetHit.fields.eip)
    post_read_breakpoint = $postRead
    runtime_destination_segment = $destinationSegment
    observed_code_size = ('0x{0:X}' -f $observedCodeSize)
    known_constants = [ordered]@{
      si_table_offset = ('0x{0:X}' -f $KnownSi)
      cx_register_count = $KnownCx
      first_dac_register = ('0x{0:X}' -f $KnownFirstRegister)
      last_dac_register = ('0x{0:X}' -f ($KnownFirstRegister + $KnownCx - 1))
      note = 'SI and CX are plain immediates verified NOT present in descriptor 42''s fixup table (tools/vroomm_layout.py classifier); only the DS segment word requires runtime resolution.'
    }
    region_dump = [ordered]@{
      runtime_address = ('{0}:{1:X4}' -f $destinationSegment, $SetupBlockStart)
      file_offset = ('0x{0:X}' -f $regionFileOffset)
      byte_count = $regionBytes.Count
      observed_hex = $regionObservedHex
      expected_hex = $regionExpectedHex
      exact_match_vs_retail_file = ($regionObservedHex -eq $regionExpectedHex)
    }
    fixup_word = [ordered]@{
      runtime_address = ('{0}:{1:X4}' -f $destinationSegment, $FixupWordOffset)
      raw_file_word = ('0x{0:X4}' -f $RawDsWord)
      observed_runtime_word = ('0x{0:X4}' -f $observedDsWord)
      fixup_applied_at_this_preload_pass = $fixupApplied
    }
  }

  if ($fixupApplied) {
    # The bulk loader's real DS segment is now known. Dump the RGB source table at
    # <resolvedDs>:$KnownSi (14 * 3 = 42 bytes; +6 bytes margin).
    $resolvedDs = ('{0:X4}' -f $observedDsWord)
    $tableDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $resolvedDs, $KnownSi) -Label 'palette-table-dump'
    $tableBytes = Get-DumpBytes $tableDump
    $neededBytes = $KnownCx * 3
    $registers = @()
    for ($i = 0; $i -lt $KnownCx -and ($i * 3 + 2) -lt $tableBytes.Count; $i++) {
      $r6 = $tableBytes[$i * 3]
      $g6 = $tableBytes[$i * 3 + 1]
      $b6 = $tableBytes[$i * 3 + 2]
      $registers += [ordered]@{
        register = ('0x{0:X2}' -f ($KnownFirstRegister + $i))
        r6 = $r6; g6 = $g6; b6 = $b6
        in_6bit_dac_range = ($r6 -le 63 -and $g6 -le 63 -and $b6 -le 63)
        r8 = [Math]::Round($r6 * 255.0 / 63.0)
        g8 = [Math]::Round($g6 * 255.0 / 63.0)
        b8 = [Math]::Round($b6 * 255.0 / 63.0)
      }
    }
    $result.resolved_ds_segment = $resolvedDs
    $result.palette_table = [ordered]@{
      runtime_address = ('{0}:{1:X4}' -f $resolvedDs, $KnownSi)
      byte_count_dumped = $tableBytes.Count
      needed_bytes = $neededBytes
      all_bytes_in_6bit_dac_range = (($registers | Where-Object { -not $_.in_6bit_dac_range }).Count -eq 0)
      registers = $registers
    }
    $result.claim = "Descriptor 42's DS-load fixup was applied inline during the same silent-startup VROOMM preload/read pass that populated segment ${destinationSegment}: the file's raw word 0x$($RawDsWord.ToString('X4')) was patched to 0x$($observedDsWord.ToString('X4')) by the time of the post-read stop. Dumping ${resolvedDs}:0x$($KnownSi.ToString('X')) recovers the live RGB source table for the bulk DAC loader's proven CX=$KnownCx registers (0x$($KnownFirstRegister.ToString('X'))..0x$(($KnownFirstRegister+$KnownCx-1).ToString('X')))."
  } else {
    Write-Host '[gateway-vga-dac] fixup word still raw at the preload post-read stop -- entering Phase 2 (execution-based capture)'

    # Phase 2: the data-only preload pass (like gateway-descriptor9-runtime-bytematch.md) never
    # applies this MOV-immediate fixup -- it is a raw file-to-buffer copy. The only way to observe
    # the REAL, resolved DS is to catch genuine CS:IP execution reaching $LoaderEntry, at which
    # point `mov ds, ax` / `mov si, 0xA108` / `mov cx, 0x0E` have already run for real and the CPU's
    # own DS/SI/CX registers hold the true, live values -- no memory-dump timing race involved.
    # Identity is verified by comparing the STABLE bytes of the setup+loader region (excluding the
    # 2-byte DS-immediate window, which may legitimately differ once truly fixed up) against the
    # retail file, exactly as tools/trace_gateway_operand_parser_execution.ps1 verifies identity at
    # its own execution breakpoint.
    # Clear the still-armed `BPINT 21 42` from Phase 1 first -- otherwise it keeps re-firing for
    # every remaining descriptor seek (44..51) and consumes the entire exec-hit budget on
    # already-understood VROOMM-loader stops instead of letting the loader run to completion so
    # real (post-preload) game code gets a chance to execute.
    $execBp = '{0}:{1:X4}' -f $destinationSegment, $LoaderEntry
    Invoke-DebuggerInput -Command 'BPDEL *' -Label 'exec-clear-int-bp' | Out-Null
    Invoke-DebuggerInput -Command "BP $execBp" -Label 'exec-arm' | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label 'exec-run-initial' | Out-Null

    $execHits = @()
    $matchedExecHit = $null
    $execDeadline = [DateTime]::UtcNow.AddSeconds($ExecFirstHitTimeoutSeconds)
    while ($execHits.Count -lt $ExecMaxHits -and [DateTime]::UtcNow -lt $execDeadline) {
      Start-Sleep -Milliseconds 200
      $snapshot = Invoke-DebuggerInput -Command '' -Label ('exec-poll-{0:D3}' -f $execHits.Count) -SnapshotOnly
      if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
      $addr = Get-DebuggerAddress $snapshot
      if (-not $addr) { continue }
      if ($addr -ne $execBp) {
        # Some other breakpoint (or the loader's own next INT21/AH=42 seek, since BPINT 21 42 is
        # still armed from Phase 1) stopped us; record and keep going rather than assume failure.
        $execHits += [ordered]@{ index = $execHits.Count; unexpected_address = $addr }
        Invoke-DebuggerInput -Command 'RUN' -Label ('exec-continue-unexpected-{0:D3}' -f $execHits.Count) | Out-Null
        $execDeadline = [DateTime]::UtcNow.AddSeconds($ExecNextHitTimeoutSeconds)
        continue
      }
      [IO.File]::WriteAllText((Join-Path $out ('exec-hit-{0:D3}-console.txt' -f $execHits.Count)), $snapshot, [Text.UTF8Encoding]::new($false))
      $hitFields = Get-BulkLoaderExecFields -Snapshot $snapshot
      $identityDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $SetupBlockStart) -Label ('exec-hit-{0:D3}-identity-dump' -f $execHits.Count)
      $identityBytes = Get-DumpBytes $identityDump
      $identityFileOffset = $TargetSeekOffset + $SetupBlockStart
      $identityExpected = $overlayBytes[$identityFileOffset..($identityFileOffset + $identityBytes.Count - 1)]
      # Exclude the 2-byte DS-immediate window (region-relative offset 2..3, i.e. $FixupWordOffset -
      # $SetupBlockStart) from the identity comparison -- everything else must match exactly.
      $dsWindowStart = $FixupWordOffset - $SetupBlockStart
      $isIdentityMatch = $true
      for ($bi = 0; $bi -lt [Math]::Min($identityBytes.Count, $identityExpected.Count); $bi++) {
        if ($bi -eq $dsWindowStart -or $bi -eq ($dsWindowStart + 1)) { continue }
        if ($identityBytes[$bi] -ne $identityExpected[$bi]) { $isIdentityMatch = $false; break }
      }
      $hitRecord = [ordered]@{
        index = $execHits.Count
        cs_ip = $addr
        registers = $hitFields
        identity_match_excluding_ds_window = $isIdentityMatch
      }
      $execHits += $hitRecord
      Write-Host ("[gateway-vga-dac] exec hit {0}: cs_ip={1} ds={2} si={3} cx={4} identity_match={5}" -f $hitRecord.index, $addr, $hitFields.ds, $hitFields.si, $hitFields.cx, $isIdentityMatch)
      if ($isIdentityMatch) { $matchedExecHit = $hitRecord; break }
      Invoke-DebuggerInput -Command 'RUN' -Label ('exec-continue-{0:D3}' -f $execHits.Count) | Out-Null
      $execDeadline = [DateTime]::UtcNow.AddSeconds($ExecNextHitTimeoutSeconds)
    }

    $result.phase2_execution_probe = [ordered]@{
      execution_breakpoint = $execBp
      hit_count = $execHits.Count
      hits = $execHits
      matched = [bool]$matchedExecHit
    }

    if ($matchedExecHit) {
      $resolvedDs = $matchedExecHit.registers.ds
      $resolvedSi = $matchedExecHit.registers.si
      $resolvedCx = $matchedExecHit.registers.cx
      $tableDump = Invoke-DebuggerInput -Command ('D {0}:{1}' -f $resolvedDs, $resolvedSi) -Label 'palette-table-dump-exec'
      $tableBytes = Get-DumpBytes $tableDump
      $registers = @()
      for ($i = 0; $i -lt $resolvedCx -and ($i * 3 + 2) -lt $tableBytes.Count; $i++) {
        $r6 = $tableBytes[$i * 3]; $g6 = $tableBytes[$i * 3 + 1]; $b6 = $tableBytes[$i * 3 + 2]
        $registers += [ordered]@{
          register = ('0x{0:X2}' -f ($KnownFirstRegister + $i))
          r6 = $r6; g6 = $g6; b6 = $b6
          in_6bit_dac_range = ($r6 -le 63 -and $g6 -le 63 -and $b6 -le 63)
          r8 = [Math]::Round($r6 * 255.0 / 63.0)
          g8 = [Math]::Round($g6 * 255.0 / 63.0)
          b8 = [Math]::Round($b6 * 255.0 / 63.0)
        }
      }
      $result.resolved_ds_segment = $resolvedDs
      $result.resolved_via = 'phase2_live_execution_registers'
      $result.palette_table = [ordered]@{
        runtime_address = ('{0}:{1}' -f $resolvedDs, $resolvedSi)
        byte_count_dumped = $tableBytes.Count
        needed_bytes = $resolvedCx * 3
        all_bytes_in_6bit_dac_range = (($registers | Where-Object { -not $_.in_6bit_dac_range }).Count -eq 0)
        registers = $registers
      }
      $result.claim = "Genuine CS:IP execution reached the bulk DAC loader entry ($execBp) with zero synthetic keypresses, at exec-hit index $($matchedExecHit.index), with resident bytes matching descriptor 42's retail code exactly (outside the DS-immediate window, which is expected to legitimately differ once really relocated). At that stop the live CPU registers were CX=$resolvedCx, DS=$resolvedDs, SI=$resolvedSi -- the real, resolved palette source table location. Dumping $resolvedDs`:$resolvedSi recovers the live RGB source bytes."
    } else {
      $result.claim = "Descriptor 42's DS-load fixup word still reads back as the raw, un-relocated file value (0x$($RawDsWord.ToString('X4'))) at the post-read stop for this silent-startup VROOMM preload pass -- confirming (like gateway-descriptor9-runtime-bytematch.md) that this pass is a raw file-to-buffer copy, not a real load with fixups applied. Phase 2 then armed a genuine CS:IP execution breakpoint at the loader's own entry point ($execBp) and polled up to $($execHits.Count) hit(s) with zero synthetic keypresses, but never observed a hit whose resident bytes matched descriptor 42's retail code (outside the DS-immediate window) -- i.e. execution never demonstrably reached the REAL bulk DAC loader during this run's silent-startup window. The real palette source segment remains UNLOCATED by this technique this session. This is the same class of negative result gateway-operand-parser-execution-probe.md already documented for a different descriptor (the shared overlay buffer is executed by many transient, unrelated routines during silent startup; reaching a SPECIFIC one without a save file or a mapped front-end/character-creation input sequence is not guaranteed). Falling back honestly rather than guessing."
    }
  }

  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'gateway-vga-dac-bulk-loader.json') -Encoding utf8
  Write-Host ("[gateway-vga-dac] RESULT: destination_segment={0} fixup_applied={1} out={2}" -f $destinationSegment, $fixupApplied, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
