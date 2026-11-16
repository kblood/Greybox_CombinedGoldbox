# trace_dok_geo_block_id.ps1 -- follow-up to tools/trace_dok_position_setter.ps1 (Update 5 in
# docs/engine/research/dok-natural-route.md), closing the "still not reached" gap that round left
# open: Update 5's telemetry captured cell-level x/y/facing/wallType/cellDescriptor but explicitly
# did NOT identify which GEO/ECL BLOCK NUMBER (e.g. 34 vs 33) is active at each checkpoint.
#
# NEW STATIC EVIDENCE (this round, fresh disassembly + structural match against the CoAB oracle):
# DoK's real GAME.OVR has its own CMD_NewECL handler (ECL opcode 0x20, "NEWECL -- chain to block by
# ID"). Per build/dok-ecl-dispatch-map.json's dok_dispatch table, opcode 32 (0x20) resolves to flat
# file offset 5487 (0x156F). Disassembling that function (`python tools/disasm_dok.py dis 0x156f 60`)
# shows a shape that matches coab_extracted/engine/ovr003.cs's CMD_NewECL 1:1 in the opening moves
# (vm_LoadCmdSets(1) -> decode one operand -> the freshly decoded byte ends up written through a
# pointer-plus-fixed-offset into an "area" struct, exactly CoAB's `gbl.area_ptr.LastEclBlockId =
# ...` pattern):
#
#   00156f  push bp / mov bp,sp / sub sp,2
#   001575  mov al,1 / push ax / lcall 0x41,0x2a      <- vm_LoadCmdSets(1) (operand fetch)
#   00157d  mov al, byte ptr [0xdb6c]                  <- decoded operand value (the target block id)
#   001580  les di, dword ptr [0x8c2d]                 <- ES:DI = far ptr at DGROUP:0x8C2D (DoK's own
#                                                          "area_ptr" analog -- no segment override
#                                                          prefix present, so this is a plain DS
#                                                          (DGROUP) read, same convention already
#                                                          proven for every other DoK global this
#                                                          project has located)
#   001584  mov byte ptr es:[di+0xf2], al              <- area_ptr-equivalent struct's block-id field
#                                                          (DoK's own field offset; CoAB's own
#                                                          Area1.cs lists an analogous-purpose but
#                                                          NUMERICALLY DIFFERENT offset, 0x1E4
#                                                          LastEclBlockId / 0x18A
#                                                          current_3DMap_block_id -- DoK's compiled
#                                                          Area1-equivalent struct is not assumed to
#                                                          share CoAB's exact field layout, only the
#                                                          pointer+fixed-offset ACCESS PATTERN, which
#                                                          this disassembly independently confirms)
#
# This script does NOT arm a new breakpoint on this NEWECL handler (a fresh game's initial spawn is
# expected, per coab_extracted/engine/ovr003.cs's sub_29758-equivalent boot path, to set the block id
# via a DIFFERENT native init routine that does not call CMD_NewECL at all when LastEclBlockId==0 --
# so a NEWECL-handler breakpoint would very plausibly reproduce Updates 3/4's clean "never fires in
# this window" result even though the *field* is real). Instead it reuses the ALREADY-PROVEN
# position-setter epilogue anchor from trace_dok_position_setter.ps1 (GAME.OVR flat 0x7927,
# descriptor 8 fileofs 0x6ba8) purely to get a reliable DS (DGROUP segment) resolution at each of the
# same 14 boot-to-spawn checkpoints, and at every hit ALSO dereferences DS:0x8C2D (the area_ptr field)
# and dumps a window of the pointed-to struct covering the +0xF2 write site this round found. Since
# DGROUP is one fixed data segment shared by every overlay in this Borland Large-model runtime
# (already established for Pool's own investigation and reconfirmed for DoK across ~20+ CMD_Goto
# launches), the DS resolved by the position-setter anchor is valid for this dereference too, with no
# need for a second Phase-1 segment-resolution pass.
#
# GAMELINK COLLISION HAZARD: same safeguards as trace_dok_position_setter.ps1
# (Wait-DosboxExclusive / Assert-OwnDosboxProcess / Assert-GameLinkIdentity), copied verbatim. See
# docs/engine/research/dosbox-x-gamelink-automation.md's "2026-07-17: KNOWN HAZARD" section.
#
# SYNCHRONOUS/FOREGROUND ONLY -- must be invoked as a blocking, foreground call.

param(
  [string]$StageDir = 'build\runtime-dok-postel-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(1,60)][int]$PerStepHitTimeoutSeconds = 12,
  [ValidateRange(5,120)][int]$SpawnHitTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$SetterTargetKey = '0x6BA8'
$SetterEntryRelOffset = 0xBC1
$SetterEpilogueRelOffset = 0xD7F

$PosXAddr = 0xc073
$PosYAddr = 0xc074
$FacingAddr = 0xc075
$WallTypeAddr = 0xc076
$CellDescriptorAddr = 0xc077
$PositionDirtyFlagAddr = 0xdb75

# New this round: the area_ptr far-pointer field and the NEWECL write-site offset within the struct
# it points to (see header comment for the disassembly this is derived from).
$AreaPtrFieldAddr = 0x8C2D
$AreaBlockIdStructOffset = 0xF2

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'dok-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected = @{
  'START.EXE' = '91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40'
  'GAME.OVR'  = 'fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "DoK stage hash mismatch: $name" }
}
$saveHash = (Get-FileHash -LiteralPath (Join-Path $stage 'SAVE\SAVGAMA.PTY') -Algorithm SHA256).Hash.ToLowerInvariant()
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
    Write-Host ("[dok-geo-block] WARN: gamelink press attempt {0}/{1} failed for '{2}', retrying" -f $attempt, $MaxAttempts, ($Keys -join ' '))
    Start-Sleep -Milliseconds 750
  }
  throw "gamelink press failed after $MaxAttempts attempts: $($Keys -join ' ')"
}

function Save-GameLinkScreenshot {
  param([string]$Path)
  & python $gameLink screenshot $Path
  if ($LASTEXITCODE -ne 0) { Write-Host "[dok-geo-block] WARN: gamelink screenshot failed (non-fatal): $Path" }
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
      throw ("GameLink collision-avoidance: dosbox-x already running (PID(s): {0}) after waiting " +
        "{1}s -- refusing to launch a second concurrent GameLink session (see " +
        "docs/engine/research/dosbox-x-gamelink-automation.md's 2026-07-17 KNOWN HAZARD). This is " +
        "an honest blocked result (machine contention), not a trace failure -- retry once other " +
        "agents' dosbox-x sessions clear." -f $pids, $TimeoutSeconds)
    }
    if (-not $warned) {
      $pids = ($existing | Select-Object -ExpandProperty Id) -join ','
      Write-Host ("[dok-geo-block] WARN: dosbox-x already running (PID(s): {0}) -- waiting for exclusivity before launching a GameLink session" -f $pids)
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
    throw ("GameLink collision detected mid-session: foreign dosbox-x PID(s) appeared ({0}) " +
      "alongside our own PID {1} -- per the KNOWN HAZARD doc, treat any capture from this point " +
      "on as compromised. Aborting rather than reporting a possibly-corrupted result." -f $pids, $OwnPid)
  }
}

function Assert-GameLinkIdentity {
  param([int]$ExpectedWidth = 640, [int]$ExpectedHeight = 400, [string]$Label = 'identity-check')
  $statusJson = & python $gameLink status
  if ($LASTEXITCODE -ne 0) { throw "gamelink status failed ($Label)" }
  $status = $statusJson | ConvertFrom-Json
  Write-Host ("[dok-geo-block]   gamelink identity ({0}): program='{1}' frame={2}x{3}" -f `
    $Label, $status.program, $status.frame.width, $status.frame.height)
  if ($status.frame.width -ne $ExpectedWidth -or $status.frame.height -ne $ExpectedHeight) {
    throw ("GameLink identity check failed at {0}: frame is {1}x{2}, expected {3}x{4} -- likely " +
      "reading a foreign session (collision hazard); aborting rather than trusting this capture." -f `
      $Label, $status.frame.width, $status.frame.height, $ExpectedWidth, $ExpectedHeight)
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
  return [ordered]@{
    ah = $ah; is_ah42 = ($ah -eq 0x42); handle = $ebx; seek_offset = $seekOffset
    cs = $regs['CS']; eip = $regs['EIP']
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

function ConvertTo-HexLower {
  param([byte[]]$Bytes)
  return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}

function Test-EntryByteMatch {
  param([string]$DestSeg, [string]$Label)
  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $DestSeg, $SetterEntryRelOffset) -Label $Label
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($SetterTargetKey, 16) + $SetterEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  return ((ConvertTo-HexLower $entryBytes) -eq (ConvertTo-HexLower $entryExpected))
}

# Dereferences the area_ptr far pointer at DS:$AreaPtrFieldAddr and dumps a window of the struct it
# points to, centred on the NEWECL write-site offset (+0xF2) this round's disassembly found. Returns
# $null (not a throw) on any implausible/null pointer so a genuine "pointer not yet initialised" case
# is distinguishable from a tooling failure.
function Get-AreaBlockIdSnapshot {
  param([string]$Ds, [string]$Label)
  $ptrDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $Ds, $AreaPtrFieldAddr) -Label "$Label-areaptr"
  $ptrBytes = Get-DebuggerDataBytes $ptrDump
  if ($ptrBytes.Count -lt 4) { return $null }
  # Far pointer layout in memory: offset_lo, offset_hi, segment_lo, segment_hi (little-endian words).
  # NOTE: bytes read from Get-DebuggerDataBytes are [byte]-typed; PowerShell's -shl on a byte operand
  # silently truncates to 8 bits (the SAME known automation bug documented in
  # tools/trace_dok_goto_operand.ps1's own header comment -- "a PowerShell -shl operating on a
  # byte-typed value and silently truncating to 0"). MUST cast to [int] before shifting.
  $ptrOffset = [uint16]([int]$ptrBytes[0] -bor ([int]$ptrBytes[1] -shl 8))
  $ptrSegment = [uint16]([int]$ptrBytes[2] -bor ([int]$ptrBytes[3] -shl 8))
  $result = [ordered]@{
    area_ptr_raw = ('{0:X2}{1:X2}{2:X2}{3:X2}' -f $ptrBytes[3], $ptrBytes[2], $ptrBytes[1], $ptrBytes[0])
    area_ptr_segment = ('{0:X4}' -f $ptrSegment)
    area_ptr_offset = ('{0:X4}' -f $ptrOffset)
    area_ptr_plausible = ($ptrSegment -ne 0 -and $ptrSegment -ne 0xFFFF)
    block_id_struct_offset = ('0x{0:X}' -f $AreaBlockIdStructOffset)
  }
  if (-not $result.area_ptr_plausible) {
    Write-Host ("[dok-geo-block]   {0}: area_ptr looks implausible (seg={1}, off={2}) -- not dereferencing" -f $Label, $result.area_ptr_segment, $result.area_ptr_offset)
    return $result
  }
  # Dump a window starting slightly before the write site so neighbouring bytes give context (e.g. a
  # length/count byte, or a second related field) without needing a second round trip.
  $windowStart = [uint16](($ptrOffset + $AreaBlockIdStructOffset - 0x10) -band 0xFFFF)
  $windowDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $result.area_ptr_segment, $windowStart) -Label "$Label-areastruct"
  $windowBytes = Get-DebuggerDataBytes $windowDump
  $result.window_start_offset = ('0x{0:X}' -f $windowStart)
  $result.window_bytes_hex = (ConvertTo-HexLower $windowBytes)
  if ($windowBytes.Count -ge 0x11) {
    $result.block_id_byte_at_offset = [int]$windowBytes[0x10]
  }
  # Second window: covers the CoAB oracle's OWN Area1.cs field offsets for the analogous concept
  # (0x18A current_3DMap_block_id, 0x1E4 LastEclBlockId) -- DoK's struct is not assumed to share
  # CoAB's exact layout (the +0xF2 write site already shows it does not), but checking these specific
  # offsets too is cheap and rules out/in the possibility that DoK's compiled struct happens to place
  # an analogous field near CoAB's own numeric offset by coincidence of similar field ordering.
  $window2Start = [uint16](($ptrOffset + 0x170) -band 0xFFFF)
  $window2Dump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $result.area_ptr_segment, $window2Start) -Label "$Label-areastruct2"
  $window2Bytes = Get-DebuggerDataBytes $window2Dump
  $result.window2_start_offset = ('0x{0:X}' -f $window2Start)
  $result.window2_bytes_hex = (ConvertTo-HexLower $window2Bytes)
  # current_3DMap_block_id (CoAB 0x18A) is window2Start(0x170) + 0x1A; LastEclBlockId (CoAB 0x1E4) is
  # window2Start(0x170) + 0x74 -- out of a single 128-byte (0x80) window, so only the first is covered
  # directly; the raw hex is recorded either way for offline cross-checking.
  if ($window2Bytes.Count -ge 0x1B) {
    $result.coab_analog_0x18A_current_3dmap_block_id = [int]$window2Bytes[0x1A]
  }
  $window3Start = [uint16](($ptrOffset + 0x1E0) -band 0xFFFF)
  $window3Dump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $result.area_ptr_segment, $window3Start) -Label "$Label-areastruct3"
  $window3Bytes = Get-DebuggerDataBytes $window3Dump
  $result.window3_start_offset = ('0x{0:X}' -f $window3Start)
  $result.window3_bytes_hex = (ConvertTo-HexLower $window3Bytes)
  # LastEclBlockId (CoAB 0x1E4) is window3Start(0x1E0) + 0x4 (a word; low byte first).
  if ($window3Bytes.Count -ge 0x6) {
    $result.coab_analog_0x1E4_lastEclBlockId_lo = [int]$window3Bytes[0x4]
    $result.coab_analog_0x1E4_lastEclBlockId_hi = [int]$window3Bytes[0x5]
  }
  return $result
}

function Get-CheckpointSnapshot {
  param([string]$Label, [string]$ExecBp, [int]$TimeoutSeconds = 12)
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run" | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $addr = $null
  $snapshot = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snapshot = Invoke-DebuggerInput -Command '' -Label "$Label-poll" -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if ($addr -eq $ExecBp) { break }
    Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run-again" | Out-Null
    $addr = $null
  }
  if ($addr -ne $ExecBp) {
    Write-Host ("[dok-geo-block]   {0}: no setter-epilogue hit within {1}s" -f $Label, $TimeoutSeconds)
    return $null
  }
  [IO.File]::WriteAllText((Join-Path $out "$Label-hit-console.txt"), $snapshot, [Text.UTF8Encoding]::new($false))
  $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { throw "no DS in snapshot: $Label" }
  $ds = $dsMatch.Groups[1].Value
  $bpDestSeg = ($ExecBp -split ':')[0]
  $entryMatchNow = Test-EntryByteMatch -DestSeg $bpDestSeg -Label "$Label-bytematch"
  $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label "$Label-pos"
  $posBytes = Get-DebuggerDataBytes $posDump
  $flagDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PositionDirtyFlagAddr) -Label "$Label-flag"
  $flagBytes = Get-DebuggerDataBytes $flagDump
  $areaBlock = Get-AreaBlockIdSnapshot -Ds $ds -Label $Label
  # CRITICAL: resume BEFORE returning, or the caller's next keypress races a halted guest.
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-post-resume" | Out-Null
  return [ordered]@{
    label = $Label
    hit = $true
    cs_ip = $addr
    ds = $ds
    entry_byte_match_at_hit = $entryMatchNow
    pos_x_0xc073 = [int]$posBytes[0]
    pos_y_0xc074 = [int]$posBytes[1]
    facing_0xc075 = [int]$posBytes[2]
    facing_compass = @{0='N';2='E';4='S';6='W'}[[int]$posBytes[2]]
    wall_type_0xc076 = [int]$posBytes[3]
    cell_descriptor_0xc077 = [int]$posBytes[4]
    position_dirty_flag_0xdb75 = [int]$flagBytes[0]
    area_block_id = $areaBlock
  }
}

try {
  Wait-DosboxExclusive
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoActionScreenshots
  if (-not $?) { throw 'DoK DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-OwnDosboxProcess -OwnPid $process.Id

  # --- Phase 1: seek capture -> resolve the setter's own runtime destination segment ------------
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
    Write-Host ("[dok-geo-block] seek {0}: handle={1} offset={2}" -f $seekIndex, $fields.handle, $seekOffsetHex)
    if ($fields.handle -eq 5 -and $seekOffsetHex -eq $SetterTargetKey) {
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
  if (-not $destinationSegment) { throw "setter overlay descriptor ($SetterTargetKey) not observed within $MaxSeeks seeks" }
  Write-Host ("[dok-geo-block] setter runtime destination segment: {0} (observed code size 0x{1:X})" -f $destinationSegment, $observedCodeSize)

  $entryExactMatch = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'setter-entry-bytematch-phase1'
  if (-not $entryExactMatch) { throw 'setter entry byte-match failed -- destSeg does not hold expected resident code' }
  Write-Host '[dok-geo-block] setter entry byte-match (phase 1): true'

  # --- Phase 2: arm the shared-epilogue execution breakpoint ONCE, leave it armed for the whole run.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $SetterEpilogueRelOffset
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'arm-epilogue-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'epilogue-first-run' | Out-Null
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
    Write-Host ("[dok-geo-block] checkpoint: {0}" -f $step.label)
    $cp = Get-CheckpointSnapshot -Label $step.label -ExecBp $execBp -TimeoutSeconds $PerStepHitTimeoutSeconds
    $checkpoints.Add([ordered]@{ label = $step.label; snapshot = $cp })
    if ($cp) {
      $ab = $cp.area_block_id
      Write-Host ("[dok-geo-block]   ds={0} x={1} y={2} facing={3}({4}) wall={5} cell={6} dirty={7} areaPtr={8}:{9} blockIdByte={10} coab18A={11} coab1E4lo/hi={12}/{13}" -f `
        $cp.ds, $cp.pos_x_0xc073, $cp.pos_y_0xc074, $cp.facing_0xc075, $cp.facing_compass, $cp.wall_type_0xc076, $cp.cell_descriptor_0xc077, $cp.position_dirty_flag_0xdb75, `
        $ab.area_ptr_segment, $ab.area_ptr_offset, $ab.block_id_byte_at_offset, $ab.coab_analog_0x18A_current_3dmap_block_id, `
        $ab.coab_analog_0x1E4_lastEclBlockId_lo, $ab.coab_analog_0x1E4_lastEclBlockId_hi)
    }
  }

  Save-GameLinkScreenshot -Path (Join-Path $out 'post-narrative-screen.png')

  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-exec-trap-for-reverify' | Out-Null
  $entryExactMatchPostNav = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'setter-entry-bytematch-postnav'
  Write-Host ("[dok-geo-block] setter entry byte-match (post-navigation re-verify): {0}" -f $entryExactMatchPostNav)
  Invoke-DebuggerInput -Command "BP $execBp" -Label 're-arm-epilogue-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 're-arm-run' | Out-Null

  Write-Host '[dok-geo-block] final extended spawn-screen wait...'
  Assert-OwnDosboxProcess -OwnPid $process.Id
  Assert-GameLinkIdentity -Label 'pre-spawn-wait' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-wait-preresume' | Out-Null
  $spawnDeadline = [DateTime]::UtcNow.AddSeconds($SpawnHitTimeoutSeconds)
  $lastPoke = [DateTime]::UtcNow
  $spawnAddr = $null
  $spawnSnapshot = $null
  while ([DateTime]::UtcNow -lt $spawnDeadline) {
    Start-Sleep -Milliseconds 150
    if ((([DateTime]::UtcNow) - $lastPoke).TotalMilliseconds -ge 4000) {
      Assert-OwnDosboxProcess -OwnPid $process.Id
      Send-GameLinkKeys -Keys @('enter') -Pace 0.2
      $lastPoke = [DateTime]::UtcNow
    }
    $spawnSnapshot = Invoke-DebuggerInput -Command '' -Label 'spawn-wait-poll' -SnapshotOnly
    if ($spawnSnapshot -match '(?m)^\(Running\)\s*$') { continue }
    $spawnAddr = Get-DebuggerAddress $spawnSnapshot
    if ($spawnAddr -eq $execBp) { break }
    Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-wait-run-again' | Out-Null
    $spawnAddr = $null
  }
  $spawnCheckpoint = $null
  if ($spawnAddr -eq $execBp) {
    [IO.File]::WriteAllText((Join-Path $out 'spawn-final-hit-console.txt'), $spawnSnapshot, [Text.UTF8Encoding]::new($false))
    $dsMatch = [regex]::Match($spawnSnapshot, '\bDS=([0-9A-F]{4})\b')
    $ds = $dsMatch.Groups[1].Value
    $spawnEntryMatch = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'spawn-final-bytematch'
    $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label 'spawn-final-pos'
    $posBytes = Get-DebuggerDataBytes $posDump
    $spawnAreaBlock = Get-AreaBlockIdSnapshot -Ds $ds -Label 'spawn-final'
    $spawnCheckpoint = [ordered]@{
      label = 'spawn-final'; hit = $true; cs_ip = $spawnAddr; ds = $ds
      entry_byte_match_at_hit = $spawnEntryMatch
      pos_x_0xc073 = [int]$posBytes[0]; pos_y_0xc074 = [int]$posBytes[1]
      facing_0xc075 = [int]$posBytes[2]
      facing_compass = @{0='N';2='E';4='S';6='W'}[[int]$posBytes[2]]
      wall_type_0xc076 = [int]$posBytes[3]; cell_descriptor_0xc077 = [int]$posBytes[4]
      area_block_id = $spawnAreaBlock
    }
    $ab = $spawnAreaBlock
    Write-Host ("[dok-geo-block] SPAWN HIT: ds={0} x={1} y={2} facing={3} entry_byte_match_at_hit={4} areaPtr={5}:{6} blockIdByte={7}" -f $ds, $spawnCheckpoint.pos_x_0xc073, $spawnCheckpoint.pos_y_0xc074, $spawnCheckpoint.facing_compass, $spawnEntryMatch, $ab.area_ptr_segment, $ab.area_ptr_offset, $ab.block_id_byte_at_offset)
    Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-final-resume' | Out-Null
  } else {
    Write-Host ("[dok-geo-block] no setter-epilogue hit within final {0}s spawn wait" -f $SpawnHitTimeoutSeconds)
  }
  Save-GameLinkScreenshot -Path (Join-Path $out 'spawn-final-screen.png')

  $anyHit = ($checkpoints | Where-Object { $_.snapshot } | Select-Object -First 1) -or $spawnCheckpoint
  $result = [ordered]@{
    schema_version = 1
    title = 'DoK live GEO/ECL block-id telemetry -- area_ptr+0xF2 dereference at the proven position-setter epilogue anchor'
    profile_id = 'death-knights-of-krynn'
    stage_manifest = $manifestPath
    save_sha256 = $saveHash
    input_mechanism = 'GameLink (tools/dosbox_gamelink.py) -- no host SendKeys, no focus-stealing window'
    telemetry_addresses = [ordered]@{
      pos_x = ('0x{0:X}' -f $PosXAddr)
      pos_y = ('0x{0:X}' -f $PosYAddr)
      facing = ('0x{0:X}' -f $FacingAddr)
      wall_type = ('0x{0:X}' -f $WallTypeAddr)
      cell_descriptor = ('0x{0:X}' -f $CellDescriptorAddr)
      position_dirty_flag = ('0x{0:X}' -f $PositionDirtyFlagAddr)
      area_ptr_field = ('0x{0:X}' -f $AreaPtrFieldAddr)
      area_block_id_struct_offset = ('0x{0:X}' -f $AreaBlockIdStructOffset)
    }
    static_evidence = 'CMD_NewECL handler located at GAME.OVR flat file offset 0x156F (build/dok-ecl-dispatch-map.json opcode 32); structurally matches coab_extracted/engine/ovr003.cs CMD_NewECL (vm_LoadCmdSets(1) -> decode operand -> write via pointer-plus-fixed-struct-offset into an area struct). DoK disassembly: LES DI,[DS:0x8C2D] then MOV ES:[DI+0xF2],AL. See tools/trace_dok_geo_block_id.ps1 header comment for the full annotated disassembly.'
    ds_resolution_anchor = [ordered]@{
      technique = 'write-side host-register SETTER shared epilogue (GAME.OVR flat 0x7927, descriptor 8 fileofs 0x6ba8), reused verbatim from tools/trace_dok_position_setter.ps1 purely for its proven DS resolution -- no new breakpoint needed for the area_ptr dereference itself'
      setter_target_key = $SetterTargetKey
      setter_runtime_destination_segment = $destinationSegment
      setter_entry_byte_match_phase1 = $entryExactMatch
      setter_entry_byte_match_post_navigation = $entryExactMatchPostNav
      exec_bp = $execBp
    }
    checkpoints = $checkpoints
    spawn_checkpoint = $spawnCheckpoint
    any_hit_anywhere = [bool]$anyHit
    gamelink_collision_safeguard = 'Wait-DosboxExclusive (pre-launch) + Assert-OwnDosboxProcess (per-checkpoint) + Assert-GameLinkIdentity (per-checkpoint, program/frame cross-check)'
    claim_boundary = (
      'Tests whether DoKs area_ptr-equivalent far pointer (DGROUP:0x8C2D) is populated with a ' +
      'plausible segment during the boot-to-spawn window, and if so, what byte value sits at its ' +
      '+0xF2 offset (the field CMD_NewECL writes the freshly-decoded target block id to, per this ' +
      'rounds disassembly). This is NOT a breakpoint on CMD_NewECL itself -- a fresh, never-played ' +
      'save is expected (per the CoAB oracles own sub_29758-equivalent boot path) to set the active ' +
      'block id via a different native init routine when LastEclBlockId==0, so CMD_NewECL may never ' +
      'fire in this specific window even though the field itself is real and populated by the time ' +
      'the party reaches the spawn screen. A populated, stable value across all checkpoints -- ' +
      'especially one matching DoKs own documented eclInitBlock:34 (apps/web/src/ui/gameData.ts) -- ' +
      'would be strong corroborating evidence this is the right field. A null/implausible pointer, ' +
      'or a value that does not resemble any real DoK ECL block id (16,17,18,32,33,34,36,48,49,50,' +
      '57,64,66,67,68,80,81,82,96,97,98,99), would be an honest negative for THIS specific offset ' +
      'guess, not proof no such field exists anywhere in DGROUP.'
    )
  }
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'dok-geo-block-id-trace.json') -Encoding utf8
  Write-Host ("[dok-geo-block] RESULT: any_hit_anywhere={0} out={1}" -f [bool]$anyHit, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
