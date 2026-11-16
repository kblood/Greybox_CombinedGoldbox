# trace_coab_symbol_bytematch.ps1 — capture Curse of the Azure Bonds (CoAB) VROOMM descriptor
# loads for a shortlist of promoted symbol candidates in one owned DOSBox-X DEBUGBOX process, and
# byte-match each named relative offset against retail GAME.OVR bytes at its runtime destination
# segment.
#
# This targets BUILD-QUEUE.md's "Validate unresolved selector mappings with runtime CS:IP traces
# before promoting any cross-overlay symbol" leaf (nested under P1.3c), applied to CoAB-only
# candidates from build/goldbox-symbol-candidates.json. It reuses the exact technique already
# proven for Gateway (tools/trace_gateway_descriptor9_bytematch.ps1): `BPINT 21 42` seek capture,
# the debugger's own `es:[0010]`/`es:[0008]` disassembly annotation for destination segment/code
# size, and a post-read breakpoint at `CS:(EIP_at_seek+0x12)` (the same fixed delta documented for
# Pool's `Invoke-CombatEntryProbe` and Gateway's descriptor 9 -- all three titles share the same
# FBOV/VROOMM overlay-loader stub shape). CoAB is family `gen1-fbov` (same as Pool, not Gateway's
# `gen1-fbov-vga`): single `START.EXE` resident image + `GAME.OVR` overlay, no `GAME.EXE` split.
#
# This script confirms and byte-matches several CoAB descriptors in a single owned process,
# because an exploratory `BPINT 21 42` trace against the hash-locked base stage showed CoAB's
# loader performs the same "preload every GAME.OVR descriptor during ordinary silent startup"
# behavior already documented for Gateway -- all 36 descriptor seeks (bases matching
# docs/engine/research/coab-oracle-retail-map.md exactly) fire before any keypress or save file is
# needed. See docs/engine/research/coab-symbol-runtime-bytematch.md (round 1: descriptors 7/24/26,
# 5 named roles) and docs/engine/research/coab-symbol-runtime-bytematch-round2.md (round 2: adds
# descriptors 21/22/23/25, and 11 more roles onto the already-reached descriptor 24, for 16 more
# named clusters / 18 more roles in one pass).
#
# Round 3 (docs/engine/research/coab-symbol-runtime-bytematch-round3.md) extends the same target
# table to the 25 promoted-but-UNNAMED (`sub_XXXXX` placeholder) clusters in
# build/goldbox-symbol-candidates.json. These have no recovered semantic name -- the `roles` keys
# below use each cluster's own placeholder identifier (its `oracle_symbol`, e.g. `sub_30168`)
# verbatim, never an invented name. Six descriptors are new this round (12, 13, 19, 20, 29, 30);
# five roles land on descriptors already reached in rounds 1-2 (7, 21, 23, 24, 25) and cost
# nothing extra beyond more `D` dumps at the same destination segment.

param(
  [string]$StageDir = 'build\runtime-coab-base-clean-20260716',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 40,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  # Optional: restrict this run to a subset of descriptor numbers (e.g. -OnlyDescriptors 12,13).
  # Added in round 3 purely as an operational batching knob -- the full cumulative $Targets table
  # below stays the single checked-in source of truth (matching round 2's convention of growing
  # one script in place), but one continuous DEBUGBOX session covering all descriptors across
  # three rounds (13 descriptors, 48 role dumps) proved unreliable in practice (the owned
  # DOSBox-X process exited mid-session at a different point on repeated attempts, not at a fixed
  # target -- an environment/session-length ceiling, not a logic bug in the seek/dump technique
  # itself). This does not change the seek/capture/dump technique; it only filters which pending
  # targets this particular invocation waits for.
  [int[]]$OnlyDescriptors = @()
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Target descriptors, keyed by GAME.OVR file offset (= INT21/AH=42h seek offset for handle 5).
# Each descriptor's `roles` are relative offsets of promoted symbol-candidate cluster starts from
# build/goldbox-symbol-candidates.json (CoAB `coab.retail_file_offset`, minus the descriptor base
# from docs/engine/research/coab-oracle-retail-map.md).
$Targets = [ordered]@{
  '0x80D8'  = [ordered]@{
    descriptor   = 7
    unit         = 'ovr008'
    code_size    = 0x2354
    roles        = [ordered]@{
      operand_parser = 0x0032   # cluster names: operand_parser, parse_command_sub (CoAB+Pool corroborated)
      bytes_to_word  = 0x06D7
      cmd_table01    = 0x0D52
      # Round 3 additions -- unnamed placeholder clusters sharing this already-reached descriptor.
      sub_30168      = 0x0168
      sub_30F16      = 0x0F16
    }
  }
  # Round 3 addition: descriptor 12 (ovr013) -- unnamed placeholder cluster sub_3B70E.
  '0xFEE7'  = [ordered]@{
    descriptor   = 12
    unit         = 'ovr013'
    code_size    = 0x31F1
    roles        = [ordered]@{
      sub_3B70E = 0x170E
    }
  }
  # Round 3 addition: descriptor 13 (ovr014) -- unnamed placeholder cluster sub_40E00.
  '0x13368' = [ordered]@{
    descriptor   = 13
    unit         = 'ovr014'
    code_size    = 0x49B8
    roles        = [ordered]@{
      sub_40E00 = 0x2E00
    }
  }
  # Round 3 addition: descriptor 19 (ovr020) -- unnamed placeholder cluster sub_572CF.
  '0x2705D' = [ordered]@{
    descriptor   = 19
    unit         = 'ovr020'
    code_size    = 0x3969
    roles        = [ordered]@{
      sub_572CF = 0x32CF
    }
  }
  # Round 3 addition: descriptor 20 (ovr021) -- unnamed placeholder cluster sub_583FA.
  '0x2AD56' = [ordered]@{
    descriptor   = 20
    unit         = 'ovr021'
    code_size    = 0x0EE1
    roles        = [ordered]@{
      sub_583FA = 0x03FA
    }
  }
  # Round 2 addition: descriptor 21 (ovr022) -- willOverload, treasureOnGround.
  '0x2BC99' = [ordered]@{
    descriptor   = 21
    unit         = 'ovr022'
    code_size    = 0x21E0
    roles        = [ordered]@{
      willOverload     = 0x006D
      treasureOnGround = 0x0F7B
      # Round 3 additions -- unnamed placeholder clusters sharing this already-reached descriptor.
      sub_59149        = 0x0149
      sub_5919E        = 0x019E
      sub_59A19        = 0x0A19
    }
  }
  # Round 2 addition: descriptor 22 (ovr023) -- item_is_scroll.
  '0x2DFB5' = [ordered]@{
    descriptor   = 22
    unit         = 'ovr023'
    code_size    = 0x6B39
    roles        = [ordered]@{
      item_is_scroll = 0x63B2
    }
  }
  # Round 2 addition: descriptor 23 (ovr024) -- odd_math.
  '0x35022' = [ordered]@{
    descriptor   = 23
    unit         = 'ovr024'
    code_size    = 0x2595
    roles        = [ordered]@{
      odd_math  = 0x16B0
      # Round 3 additions -- unnamed placeholder clusters sharing this already-reached descriptor.
      sub_641DD = 0x11DD
      sub_64245 = 0x1245
      sub_643CC = 0x13CC
      sub_6460D = 0x160D
      sub_646D9 = 0x16D9
      sub_64728 = 0x1728
    }
  }
  '0x376A5' = [ordered]@{
    descriptor   = 24
    unit         = 'ovr025'
    code_size    = 0x3413
    roles        = [ordered]@{
      count_teams      = 0x2588   # round 1 (already confirmed); re-checked this round for determinism
      # Round 2 additions -- all 10 more named clusters (11 roles: stat_bonus/stat_bonus02 are
      # two separate clusters) that round 1's doc flagged as "sharing this already-reached
      # descriptor", validated essentially for free once descriptor 24 is dumped again.
      stat_bonus       = 0x117B
      stat_bonus02     = 0x11FD
      strenghtHitBonus = 0x1317
      strenghtDamBonus = 0x13BA
      strength_bonus   = 0x1440
      clear_spell      = 0x1520
      find_affect      = 0x2345
      on_our_team      = 0x2564
      clear_actions    = 0x27E4
      offset_above_1   = 0x2FE4
      offset_equals_20 = 0x3027
      # Round 3 additions -- unnamed placeholder clusters sharing this already-reached descriptor.
      sub_66BDB        = 0x0BDB
      sub_67A59        = 0x1A59
      sub_6906C        = 0x306C
      sub_69138        = 0x3138
    }
  }
  # Round 2 addition: descriptor 25 (ovr026) -- getExtraFirstSkill, getFirstSkill, hasAnySkills.
  '0x3AC60' = [ordered]@{
    descriptor   = 25
    unit         = 'ovr026'
    code_size    = 0x13FF
    roles        = [ordered]@{
      getExtraFirstSkill = 0x12AA
      getFirstSkill      = 0x1306
      hasAnySkills       = 0x1362
      # Round 3 addition -- unnamed placeholder cluster sharing this already-reached descriptor.
      sub_6B3D1          = 0x13D1
    }
  }
  '0x3C08D' = [ordered]@{
    descriptor   = 26
    unit         = 'ovr027'
    code_size    = 0x135D
    roles        = [ordered]@{
      getStringListEntry = 0x000F
    }
  }
  # Round 3 addition: descriptor 29 (ovr030) -- unnamed placeholder cluster sub_706DC.
  '0x3D6A6' = [ordered]@{
    descriptor   = 29
    unit         = 'ovr030'
    code_size    = 0x089E
    roles        = [ordered]@{
      sub_706DC = 0x06DC
    }
  }
  # Round 3 addition: descriptor 30 (ovr031) -- four unnamed placeholder clusters.
  '0x3DFC2' = [ordered]@{
    descriptor   = 30
    unit         = 'ovr031'
    code_size    = 0x1451
    roles        = [ordered]@{
      sub_71165 = 0x0165
      sub_71573 = 0x0573
      sub_716A2 = 0x06A2
      sub_717A5 = 0x07A5
    }
  }
}

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'coab-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'CoAB symbol probe requires an unpromoted base stage' }
$expected = @{
  'START.EXE' = '42fcefd6785679568b00bc1fb5b1d81ac2773416be4a35e0363920ddf6b78acd'
  'GAME.OVR'  = 'a894282513c2af0a99081c5f888451af14d5ccca686a4a09b4057749a1da51ef'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "CoAB stage hash mismatch: $name" }
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

function Resolve-TargetDescriptor {
  param(
    [string]$TargetKey,
    [hashtable]$TargetSpec,
    [string]$SeekSnapshot,
    [hashtable]$SeekFields
  )
  $destinationMatch = [regex]::Match($SeekSnapshot, 'es:\[0010\]=([0-9A-F]{4})')
  $sizeMatch = [regex]::Match($SeekSnapshot, 'es:\[0008\]=([0-9A-F]{4})')
  if (-not $destinationMatch.Success -or -not $sizeMatch.Success) {
    throw "$TargetKey seek snapshot lacks destination segment or code-size annotation"
  }
  $destinationSegment = $destinationMatch.Groups[1].Value
  $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16)
  if ($observedCodeSize -ne $TargetSpec.code_size) {
    throw "$TargetKey observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($TargetSpec.code_size.ToString('X'))"
  }

  $loaderCs = $SeekFields.cs
  $seekEip = [Convert]::ToUInt32($SeekFields.eip, 16)
  $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)

  Invoke-DebuggerInput -Command "BP $postRead" -Label "$($TargetSpec.unit)-postread-arm" | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label "$($TargetSpec.unit)-postread-run" | Out-Null
  $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
  $postReadSnapshot = $null
  $postReadAddress = $null
  while ([DateTime]::UtcNow -lt $postReadDeadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label "$($TargetSpec.unit)-postread-poll" -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $postReadSnapshot = $snapshot
    $postReadAddress = Get-DebuggerAddress $snapshot
    break
  }
  if (-not $postReadAddress) { throw "$TargetKey timed out waiting for post-read breakpoint" }
  if ($postReadAddress -ne $postRead) {
    throw "$TargetKey expected post-read breakpoint at $postRead, stopped at $postReadAddress"
  }
  [IO.File]::WriteAllText((Join-Path $out "$($TargetSpec.unit)-postread-hit-console.txt"), $postReadSnapshot, [Text.UTF8Encoding]::new($false))

  $targetSeekOffset = [Convert]::ToInt32($TargetKey, 16)
  $roleResults = [ordered]@{}
  $allExactMatch = $true
  foreach ($role in $TargetSpec.roles.Keys) {
    $relativeOffset = $TargetSpec.roles[$role]
    $label = "$($TargetSpec.unit)-dump-$role"
    $dumpSnapshot = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $relativeOffset) -Label $label
    $lines = [regex]::Matches($dumpSnapshot, '(?m)^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    $bytes = [Collections.Generic.List[byte]]::new()
    foreach ($m in $lines) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) {
        if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) }
      }
    }
    if ($bytes.Count -lt 16) { throw "$TargetKey/$role dump exposed only $($bytes.Count) data bytes" }
    $fileOffset = $targetSeekOffset + $relativeOffset
    $expectedBytes = $overlayBytes[$fileOffset..($fileOffset + $bytes.Count - 1)]
    $observedHex = ([byte[]]$bytes.ToArray() | ForEach-Object { $_.ToString('x2') }) -join ''
    $expectedHex = ($expectedBytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $exact = $observedHex -eq $expectedHex
    if (-not $exact) { $allExactMatch = $false }
    $roleResults[$role] = [ordered]@{
      relative_offset = ('0x{0:X4}' -f $relativeOffset)
      file_offset = ('0x{0:X}' -f $fileOffset)
      runtime_address = ('{0}:{1:X4}' -f $destinationSegment, $relativeOffset)
      byte_count = $bytes.Count
      observed_hex = $observedHex
      expected_hex = $expectedHex
      exact_match = $exact
    }
    Write-Host ("[coab-symbols] {0}/{1}: runtime={2} exact_match={3}" -f $TargetSpec.unit, $role, $roleResults[$role].runtime_address, $exact)
  }

  return [ordered]@{
    target_key = $TargetKey
    descriptor = $TargetSpec.descriptor
    unit = $TargetSpec.unit
    target_seek_offset = $TargetKey
    target_code_size = ('0x{0:X}' -f $TargetSpec.code_size)
    seek_loader_cs_ip = ('{0}:{1}' -f $SeekFields.cs, $SeekFields.eip)
    post_read_breakpoint = $postRead
    runtime_destination_segment = $destinationSegment
    observed_code_size = ('0x{0:X}' -f $observedCodeSize)
    roles = $roleResults
    all_roles_exact_match = $allExactMatch
  }
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'CoAB DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  $pending = [ordered]@{}
  foreach ($key in $Targets.Keys) {
    if ($OnlyDescriptors.Count -gt 0 -and ($OnlyDescriptors -notcontains $Targets[$key].descriptor)) { continue }
    $pending[$key] = $Targets[$key]
  }
  if ($pending.Count -eq 0) { throw "OnlyDescriptors filter ($($OnlyDescriptors -join ',')) matched no targets" }
  $results = [ordered]@{}

  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($pending.Count -gt 0 -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "CoAB trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    [IO.File]::WriteAllText((Join-Path $out ('seek-hit-{0:D2}-console.txt' -f $seekIndex)), $snapshot, [Text.UTF8Encoding]::new($false))
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[coab-symbols] seek {0}: handle={1} offset={2} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $seekOffsetHex, $fields.cs, $fields.eip)
    if ($fields.handle -eq 5 -and $pending.Contains($seekOffsetHex)) {
      $targetSpecHash = @{
        descriptor = $pending[$seekOffsetHex].descriptor
        unit = $pending[$seekOffsetHex].unit
        code_size = $pending[$seekOffsetHex].code_size
        roles = $pending[$seekOffsetHex].roles
      }
      $results[$seekOffsetHex] = Resolve-TargetDescriptor -TargetKey $seekOffsetHex -TargetSpec $targetSpecHash `
        -SeekSnapshot $snapshot -SeekFields $fields
      $pending.Remove($seekOffsetHex)
      # Resolve-TargetDescriptor armed a one-shot `BP <postread>` breakpoint that stays
      # registered (the loader revisits the same fixed CS:IP for every remaining descriptor in
      # this preload pass). Clear all breakpoints and re-arm the seek trap before resuming the
      # main loop, exactly mirroring the initial `BPINT 21 42` arm sequence, or the very next
      # RUN would stop at the stale post-read breakpoint instead of the next INT 21h/AH=42 seek.
      Invoke-DebuggerInput -Command 'BPDEL *' -Label ("$($targetSpecHash.unit)-clear-postread") | Out-Null
      Invoke-DebuggerInput -Command 'BPINT 21 42' -Label ("$($targetSpecHash.unit)-rearm-seek-trap") | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
    }
    $seekIndex++
    if ($pending.Count -gt 0) {
      Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
    }
  }
  if ($pending.Count -gt 0) {
    throw "targets not observed within $MaxSeeks seeks: $($pending.Keys -join ', ')"
  }

  $allExact = $true
  foreach ($key in $results.Keys) { if (-not $results[$key].all_roles_exact_match) { $allExact = $false } }

  [ordered]@{
    schema_version = 1
    title = 'CoAB promoted symbol-candidate runtime byte-match'
    profile_id = 'curse-of-the-azure-bonds'
    stage_manifest = $manifestPath
    seeks_observed = $seekIndex
    targets = $results
    all_targets_all_roles_exact_match = $allExact
    claim = 'Runtime segments observed during ordinary silent startup VROOMM preload of all 36 GAME.OVR descriptors, no save file or keypress required. Each destination segment is a fixed shared overlay buffer reused across descriptors during the same preload pass (same shape already documented for Gateway descriptor 9/10 and Pool descriptor 8), so it is the real runtime target for that descriptor on every load, not a startup-only artifact.'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'coab-symbol-bytematch.json') -Encoding utf8

  Write-Host ("[coab-symbols] RESULT: all_targets_all_roles_exact_match={0} out={1}" -f $allExact, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
