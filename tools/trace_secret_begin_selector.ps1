param(
  [string]$StageDir = 'build\runtime-secret-ecl3-97-host-probe-f-sidecars-in-save-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidatePattern('^[0-9A-Fa-f]{1,4}$')][string]$DGroupSegment = '250A',
  [ValidatePattern('^[0-9A-Fa-f]{1,4}$')][string]$WatchOffset = '38A2',
  [ValidateRange(0,255)][int]$ExpectedBefore = 0,
  [ValidateRange(0,255)][int]$ExpectedAfter = 97,
  [ValidateSet('up','kp_8')][string]$MovementKey = 'up',
  [switch]$TraceCursor,
  [switch]$TraceCombat,
  [switch]$AutoQuickCombat,
  [switch]$InjectCombatVictory,
  [switch]$ArmConsumedWordBpm,
  [switch]$ArmCountTeamsBpm,
  [ValidateRange(60,1800)][int]$AutoCombatTimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-RepoPath([string]$Path) {
  $candidate = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [System.IO.Path]::GetFullPath($candidate)
}

# Compute a SHA-256 hex digest via .NET directly instead of the Get-FileHash cmdlet. On at least one
# 2026-07-16 shell (this repo's Bash-tool-spawned Windows PowerShell 5.1), a stale/incompatible
# Microsoft.PowerShell.Utility module earlier on $env:PSModulePath (the PowerShell 7 Program Files
# copy, version 7.0.0.0) shadows the one that actually exports Get-FileHash (the Windows PowerShell
# v1.0 system32 copy, version 3.1.0.0), so Get-FileHash is silently "not recognized" even though the
# module name resolves. This is an environment/PATH-ordering quirk unrelated to the resume-setter
# hypothesis under test; using .NET directly sidesteps it entirely, in every PowerShell host.
function Get-Sha256Hex([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash($bytes)
  } finally {
    $sha.Dispose()
  }
  return -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
}

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$ollamaAgent = Join-Path $repo 'tools\dosbox_ollama_agent.py'
$describeScreenshots = Join-Path $repo 'tools\describe_screenshots.py'
$resumeAnalyzer = Join-Path $repo 'tools\analyze_secret_combat_resume.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$gameOvrBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))
$areaWriteFileOffset = 0x9F94
$areaWriteBytes = [byte[]]@(0x26, 0x89, 0x95, 0x00, 0x6A)
$areaSetterPrologueBytes = [byte[]]@(0x55, 0x89, 0xE5, 0x83, 0xEC, 0x02, 0xFF, 0x76, 0x08, 0x0E, 0xE8, 0x2D)
$resumeParserSegment = 0x4465
$runtimeSetterPrologueOffset = 0x0507
$runtimeSetterWriteOffset = 0x0561
if ($gameOvrBytes.Length -lt $areaWriteFileOffset + $areaWriteBytes.Length -or
    -not [Linq.Enumerable]::SequenceEqual(
      [byte[]]$gameOvrBytes[$areaWriteFileOffset..($areaWriteFileOffset + $areaWriteBytes.Length - 1)],
      $areaWriteBytes)) {
  throw 'Secret Area1 setter write bytes do not match GAME.OVR+0x9F94'
}

# Secret's candidate_secret_of_the_silver_blades_count_combat_teams body
# (tools/map_secret_runtime_symbols.py / docs/engine/research/secret-runtime-symbols.generated.md):
# an exact 84-byte function at GAME.OVR+0x3AC6D, VROOMM descriptor 26 relative +0x2B1C. It stays a
# CANDIDATE until a live CS:IP trace actually stops at this exact loaded descriptor-26 offset; this
# constant block + the arm/detect logic below is that trace attempt (BUILD-QUEUE.md "Capture a
# Secret runtime CS:IP hit at descriptor 26 +0x2B1C" leaf), not a promotion by itself.
$countTeamsFileOffset = 0x3AC6D
$countTeamsDescriptorIndex = 26
$countTeamsRelativeOffset = 0x2B1C
$countTeamsBytes = [byte[]]@(
  0x55,0x89,0xe5,0x83,0xec,0x04,0xc6,0x06,0xcc,0x87,0x00,0xc6,0x06,0xcd,0x87,0x00,0xc4,0x06,0x3c,0x7d,
  0x8c,0xc2,0x89,0x46,0xfc,0x89,0x56,0xfe,0x8b,0x46,0xfc,0x0b,0x46,0xfe,0x74,0x2c,0xc4,0x7e,0xfc,0x26,
  0x80,0xbd,0xa7,0x01,0x00,0x74,0x0f,0xc4,0x7e,0xfc,0x26,0x8a,0x85,0xa8,0x01,0x98,0x8b,0xf8,0xfe,0x85,
  0xcc,0x87,0xc4,0x7e,0xfc,0x26,0xc4,0x85,0x9d,0x01,0x8c,0xc2,0x89,0x46,0xfc,0x89,0x56,0xfe,0xeb,0xcc,
  0x89,0xec,0x5d,0xcb
)
if ($gameOvrBytes.Length -lt $countTeamsFileOffset + $countTeamsBytes.Length -or
    -not [Linq.Enumerable]::SequenceEqual(
      [byte[]]$gameOvrBytes[$countTeamsFileOffset..($countTeamsFileOffset + $countTeamsBytes.Length - 1)],
      $countTeamsBytes)) {
  throw 'Secret count_combat_teams candidate body does not match GAME.OVR+0x3AC6D'
}
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

$process = $null
$agentProcess = $null
function Send-DebuggerCommand([string]$Command, [string]$Name, [switch]$Snapshot) {
  $args = @('--pid', $process.Id, '--command', $Command, '--status', (Join-Path $out "$Name-status.json"))
  if ($Snapshot) { $args += @('--snapshot', (Join-Path $out "$Name-console.txt")) }
  & dotnet $helperDll @args
  if ($LASTEXITCODE -ne 0) { throw "debugger command failed: $Command" }
}

function Send-DebuggerKey([ValidateSet('F5','F10','F11','ENTER')][string]$Key, [string]$Name) {
  & dotnet $helperDll --pid $process.Id --key $Key --status (Join-Path $out "$Name-status.json")
  if ($LASTEXITCODE -ne 0) { throw "debugger key failed: $Key" }
}

function Read-DebuggerSnapshot([string]$Name) {
  $snapshotPath = Join-Path $out "$Name-console.txt"
  & dotnet $helperDll --pid $process.Id --snapshot-only --snapshot $snapshotPath `
    --status (Join-Path $out "$Name-status.json")
  if ($LASTEXITCODE -ne 0) { throw 'debugger snapshot failed' }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

# count_combat_teams runtime-segment discovery + arming. Unlike the resume setter (whose
# relocated-copy segment was only ever findable post-hoc), a preliminary offline scan of every RAM
# snapshot from the 2026-07-17 r4 resume-setter proof run found this 84-byte body resident
# continuously from the very first post-Begin snapshot onward, at a paragraph-aligned physical
# address (i.e. runtime IP == descriptor-relative file offset 0x2B1C, no header/thunk offset). That
# means the destination segment can be derived directly from an ordinary RAM dump instead of a
# seek-trap (contrast tools/trace_coab_symbol_bytematch.ps1's INT21/AH=42 technique) -- and because
# VROOMM was observed relocating the descriptor partway through that same run (0x362D during
# Begin/search/LOAD_MONSTER, 0x3BCE during the tactical outcome/resume window), this arms EVERY
# newly-discovered segment as the run progresses rather than assuming one fixed segment for the
# whole session.
$latin1Encoding = [System.Text.Encoding]::GetEncoding(28591)
$countTeamsNeedleString = $latin1Encoding.GetString($countTeamsBytes)
$armedCountTeamsSegments = New-Object 'System.Collections.Generic.HashSet[string]'
$countTeamsArmLog = New-Object 'System.Collections.Generic.List[object]'

function Find-CountTeamsSegments([byte[]]$Ram) {
  $ramString = $latin1Encoding.GetString($Ram)
  $hits = New-Object 'System.Collections.Generic.List[string]'
  $search = 0
  while ($true) {
    $idx = $ramString.IndexOf($countTeamsNeedleString, $search, [StringComparison]::Ordinal)
    if ($idx -lt 0) { break }
    $segmentBase = $idx - $countTeamsRelativeOffset
    if ($segmentBase -ge 0 -and ($segmentBase % 16) -eq 0) {
      $hits.Add('{0:X4}' -f ($segmentBase -shr 4))
    }
    $search = $idx + 1
  }
  return $hits
}

# Only safe to call while the debugger is confirmed stopped (BP/BPDEL/BPM typed while the CPU is
# free-running can silently fail to register -- the r2 2026-07-16 finding this whole harness now
# follows throughout). Every call site below arms strictly from a snapshot already proven stopped.
function Arm-CountTeamsSegment([string]$SegmentHex, [string]$Label) {
  if ($armedCountTeamsSegments.Contains($SegmentHex)) { return $true }
  $target = '{0}:{1:X4}' -f $SegmentHex, $countTeamsRelativeOffset
  Send-DebuggerCommand ("BP $target") "arm-count-teams-$Label"
  Send-DebuggerCommand 'BPLIST' "count-teams-armed-$Label" -Snapshot
  $armSnapshot = Get-Content -LiteralPath (Join-Path $out "count-teams-armed-$Label-console.txt") -Raw
  $armPattern = 'BP\s+{0}' -f [regex]::Escape($target)
  $confirmed = ($armSnapshot -match $armPattern) -and ($armSnapshot -notmatch '(?m)^\(Running\)\s*$')
  $armedCountTeamsSegments.Add($SegmentHex) | Out-Null
  $countTeamsArmLog.Add([ordered]@{
    segment = $SegmentHex
    target = $target
    confirmed = $confirmed
    console = "count-teams-armed-$Label-console.txt"
  })
  return $confirmed
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe START.EXE -OutDir $out `
    -Cycles 'fixed 25000' -LoadFixKb 32 -GameLink `
    -DebuggerAction @('BP 32DE:2DDF', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }

  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Start-Sleep -Seconds 10
  & python $gameLink press esc esc esc --pace 2
  if ($LASTEXITCODE -ne 0) { throw 'startup input failed' }
  & python $gameLink press down down enter --pace 0.75
  if ($LASTEXITCODE -ne 0) { throw 'load-menu input failed' }
  Start-Sleep -Seconds 2
  & python $gameLink press a enter --pace 0.75
  if ($LASTEXITCODE -ne 0) { throw 'slot input failed' }
  Start-Sleep -Seconds 3

  # Poll (instead of a single fixed-timing check) for the load-return breakpoint: on a system under
  # heavier concurrent load (e.g. other DOSBox-X automation running at the same time), the fixed
  # 10s/2s/3s sleeps above are not always enough for this 'fixed 25000'-cycle session to reach
  # 32DE:2DDF before BPLIST is read. This mirrors the polling pattern already used elsewhere in this
  # script (e.g. the cursor loop, Resolve-TargetDescriptor's post-read wait in
  # tools/trace_coab_symbol_bytematch.ps1) instead of widening the fixed sleeps for every caller.
  $loadReturnPattern = '\bCS=32DE\s+EIP=00002DDF\b'
  $loadSnapshot = $null
  $loadReturnDeadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $loadReturnDeadline) {
    Send-DebuggerCommand 'BPLIST' 'load-return' -Snapshot
    $candidate = Get-Content -LiteralPath (Join-Path $out 'load-return-console.txt') -Raw
    if ($candidate -match $loadReturnPattern) { $loadSnapshot = $candidate; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $loadSnapshot) {
    throw 'load return breakpoint was not reached'
  }

  $watchPhysical = ([Convert]::ToUInt32($DGroupSegment, 16) -shl 4) +
    [Convert]::ToUInt32($WatchOffset, 16)
  & python $gameLink dump-memory (Join-Path $out 'selector-before.bin') `
    --start ('0x{0:X}' -f $watchPhysical) --length 1
  if ($LASTEXITCODE -ne 0) { throw 'selector-before read failed' }
  $before = [IO.File]::ReadAllBytes((Join-Path $out 'selector-before.bin'))[0]
  if ($before -ne $ExpectedBefore) { throw "unexpected selector before value: $before" }

  Send-DebuggerCommand 'BPDEL *' 'clear-load-return'
  Send-DebuggerCommand ("BPM {0}:{1}" -f $DGroupSegment, $WatchOffset) 'arm-selector'
  Send-DebuggerCommand 'RUN' 'run-to-selector'
  Start-Sleep -Seconds 8
  & python $gameLink status | Set-Content -LiteralPath (Join-Path $out 'pre-begin-gamelink.json') -Encoding utf8
  & python $gameLink screenshot (Join-Path $out 'pre-begin.png')
  if ($LASTEXITCODE -ne 0) { throw 'pre-Begin capture failed' }
  & python $gameLink press esc down down down down down enter --pace 1
  if ($LASTEXITCODE -ne 0) { throw 'Begin input failed' }
  Start-Sleep -Seconds 10

  Send-DebuggerCommand 'BPLIST' 'selector-hit' -Snapshot
  & python $gameLink status | Set-Content -LiteralPath (Join-Path $out 'post-begin-gamelink.json') -Encoding utf8
  & python $gameLink screenshot (Join-Path $out 'post-begin.png')
  if ($LASTEXITCODE -ne 0) { throw 'post-Begin capture failed' }
  & python $gameLink dump-memory (Join-Path $out 'selector-hit.ram') --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'selector-hit RAM dump failed' }
  $snapshot = Get-Content -LiteralPath (Join-Path $out 'selector-hit-console.txt') -Raw
  $csIp = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  $ds = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  $ram = [IO.File]::ReadAllBytes((Join-Path $out 'selector-hit.ram'))
  $after = $ram[$watchPhysical]
  $trace = [ordered]@{
    schema_version = 1
    title = 'Secret Begin selector memory-breakpoint trace'
    stage = $stage
    load_return = '32DE:2DDF'
    watch = ("{0}:{1}" -f $DGroupSegment, $WatchOffset)
    watch_physical = ('0x{0:X}' -f $watchPhysical)
    expected_before = $ExpectedBefore
    actual_before = $before
    expected_after = $ExpectedAfter
    actual_after = $after
    value_transition_seen = $before -eq $ExpectedBefore -and $after -eq $ExpectedAfter
    debugger_stopped = $snapshot -notmatch '\(Running\)'
    registers = [ordered]@{
      cs = if ($csIp.Success) { $csIp.Groups[1].Value } else { $null }
      ip = if ($csIp.Success) { $csIp.Groups[2].Value } else { $null }
      ds = if ($ds.Success) { $ds.Groups[1].Value } else { $null }
    }
    console = 'selector-hit-console.txt'
    ram_sha256 = Get-Sha256Hex (Join-Path $out 'selector-hit.ram')
    claim_boundary = 'BPM reports a memory-change stop; instruction identity requires console CS:IP plus byte validation'
  }
  if (-not $trace.value_transition_seen -or -not $trace.debugger_stopped) {
    $trace | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'selector-trace.json') -Encoding utf8
    throw 'selector memory breakpoint did not produce the expected stopped transition'
  }

  Send-DebuggerCommand 'BPDEL *' 'clear-selector-watch'
  Send-DebuggerCommand 'BP 4674:3E62' 'arm-selector-consumer'
  Send-DebuggerCommand 'RUN' 'run-to-selector-consumer'
  Start-Sleep -Seconds 3
  Send-DebuggerCommand 'BPLIST' 'selector-consumer' -Snapshot
  & python $gameLink dump-memory (Join-Path $out 'selector-consumer.ram') --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'selector-consumer RAM dump failed' }
  $consumerSnapshot = Get-Content -LiteralPath (Join-Path $out 'selector-consumer-console.txt') -Raw
  $consumerCsIp = [regex]::Match($consumerSnapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  $consumerDs = [regex]::Match($consumerSnapshot, '\bDS=([0-9A-F]{4})\b')
  $consumerRam = [IO.File]::ReadAllBytes((Join-Path $out 'selector-consumer.ram'))
  $consumerDGroup = if ($consumerDs.Success) { [Convert]::ToUInt32($consumerDs.Groups[1].Value, 16) -shl 4 } else { 0 }
  $trace['consumer'] = [ordered]@{
    breakpoint = '4674:3E62'
    breakpoint_seen = $consumerCsIp.Success -and $consumerCsIp.Groups[1].Value -eq '4674' -and
      [Convert]::ToUInt32($consumerCsIp.Groups[2].Value, 16) -eq 0x3E62
    ds = if ($consumerDs.Success) { $consumerDs.Groups[1].Value } else { $null }
    archive_selector = if ($consumerDs.Success) { $consumerRam[$consumerDGroup + 0x7420] } else { $null }
    member_selector = if ($consumerDs.Success) { $consumerRam[$consumerDGroup + 0xA4C2] } else { $null }
    instruction = 'mov al,[A4C2]; push ax; lcall 10E3:0034'
    console = 'selector-consumer-console.txt'
  }
  if (-not $trace.consumer.breakpoint_seen -or $trace.consumer.archive_selector -ne 3 -or
      $trace.consumer.member_selector -ne 97) {
    $trace | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'selector-trace.json') -Encoding utf8
    throw 'selector consumer breakpoint did not prove archive 3/member 97'
  }

  Send-DebuggerCommand 'BPDEL *' 'clear-selector-consumer'
  Send-DebuggerCommand 'BP 407F:032C' 'arm-ecl-loader'
  Send-DebuggerCommand 'RUN' 'run-to-ecl-loader'
  Start-Sleep -Seconds 3
  Send-DebuggerCommand 'BPLIST' 'ecl-loader' -Snapshot
  $loaderSnapshot = Get-Content -LiteralPath (Join-Path $out 'ecl-loader-console.txt') -Raw
  $loaderCsIp = [regex]::Match($loaderSnapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  $trace['loader'] = [ordered]@{
    breakpoint = '407F:032C'
    breakpoint_seen = $loaderCsIp.Success -and $loaderCsIp.Groups[1].Value -eq '407F' -and
      [Convert]::ToUInt32($loaderCsIp.Groups[2].Value, 16) -eq 0x032C
    archive_read = '407F:035C mov al,[7420]'
    member_argument_read = '407F:03A0 mov al,[bp+6]'
    body_pointer = 'DS:67D2'
    console = 'ecl-loader-console.txt'
  }
  if (-not $trace.loader.breakpoint_seen) {
    $trace | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'selector-trace.json') -Encoding utf8
    throw 'ECL loader breakpoint was not reached'
  }

  Send-DebuggerCommand 'BPDEL *' 'clear-ecl-loader'
  Send-DebuggerCommand 'BP 407F:0000' 'arm-operand-parser'
  Send-DebuggerCommand 'BP 411B:0000' 'arm-relocated-operand-parser'
  Send-DebuggerCommand 'RUN' 'run-to-operand-parser'
  Start-Sleep -Seconds 5
  Send-DebuggerCommand 'BPLIST' 'operand-parser' -Snapshot
  & python $gameLink dump-memory (Join-Path $out 'operand-parser.ram') --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'operand-parser RAM dump failed' }
  $parserSnapshot = Get-Content -LiteralPath (Join-Path $out 'operand-parser-console.txt') -Raw
  $parserCsIp = [regex]::Match($parserSnapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  $parserDs = [regex]::Match($parserSnapshot, '\bDS=([0-9A-F]{4})\b')
  $parserEs = [regex]::Match($parserSnapshot, '\bES=([0-9A-F]{4})\b')
  $parserRam = [IO.File]::ReadAllBytes((Join-Path $out 'operand-parser.ram'))
  $parserDGroup = if ($parserDs.Success) { [Convert]::ToUInt32($parserDs.Groups[1].Value, 16) -shl 4 } else { 0 }
  $areaBase = if ($parserEs.Success) { [Convert]::ToUInt32($parserEs.Groups[1].Value, 16) -shl 4 } else { 0 }
  # CoAB vm_SetMemoryValue resolves 0x4B00..0x4EFF through the active Area1
  # word array: area_ptr + ((0x6A00 + logical_address * 2) & 0xFFFF).
  $consumedOffset = (0x6A00 + (0x4CCD * 2)) -band 0xFFFF
  $consumedPhysical = $areaBase + $consumedOffset
  $bodyOffset = if ($parserDs.Success) { [BitConverter]::ToUInt16($parserRam, $parserDGroup + 0x67D2) } else { 0 }
  $bodySegment = if ($parserDs.Success) { [BitConverter]::ToUInt16($parserRam, $parserDGroup + 0x67D4) } else { 0 }
  $bodyPhysical = ([uint32]$bodySegment -shl 4) + [uint32]$bodyOffset
  $trace['parser'] = [ordered]@{
    breakpoint = '407F:0000'
    breakpoint_seen = $parserCsIp.Success -and $parserCsIp.Groups[1].Value -eq '407F' -and
      [Convert]::ToUInt32($parserCsIp.Groups[2].Value, 16) -eq 0
    ds = if ($parserDs.Success) { $parserDs.Groups[1].Value } else { $null }
    es = if ($parserEs.Success) { $parserEs.Groups[1].Value } else { $null }
    area_pointer = if ($parserEs.Success) { ('{0}:0000' -f $parserEs.Groups[1].Value) } else { $null }
    consumed_word = [ordered]@{
      logical = '0x4CCD'
      resolved = if ($parserEs.Success) { ('{0}:{1:X4}' -f $parserEs.Groups[1].Value, $consumedOffset) } else { $null }
      physical = if ($parserEs.Success) { ('0x{0:X}' -f $consumedPhysical) } else { $null }
    }
    ecl_pc = if ($parserDs.Success) { [BitConverter]::ToUInt16($parserRam, $parserDGroup + 0x67E1) } else { $null }
    body_pointer = ('{0:X4}:{1:X4}' -f $bodySegment, $bodyOffset)
    body_physical = ('0x{0:X}' -f $bodyPhysical)
    header_hex = [Convert]::ToHexString($parserRam[$bodyPhysical..($bodyPhysical + 19)]).ToLowerInvariant()
    virtual_address_conversion = 'body[virtual_address - 0x8000]'
    parser_file_offset = 'GAME.OVR:0x9073'
    console = 'operand-parser-console.txt'
  }
  $trace | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'selector-trace.json') -Encoding utf8
  if (-not $trace.parser.breakpoint_seen -or -not $parserEs.Success -or
      $trace.parser.body_physical -ne '0x561C0') {
    throw 'operand parser breakpoint/header pointer did not match ECL3#97'
  }

  # Arm the resume-phase SETTER WRITE breakpoint directly at CS:0561, before the cursor loop's own
  # first RUN below, while the debugger is still confirmed stopped from the operand-parser hit just
  # validated above. This supersedes the former "arm 4465:0000 first" two-stage plan used by both
  # 2026-07-16 rejected attempts (research/secret-combat-resume-setter-breakpoint-attempt-20260716
  # .json and the -r2 follow-up): r1 diagnosed a breakpoint-registration timing bug (BP/BPDEL typed
  # while the CPU was already free-running) and fixed it; r2 live-proved that fix (BPLIST showed
  # '00. BP 4465:0000' registered and never deleted through the entire combat-outcome window) but
  # 'CS=4465 EIP=00000000' was STILL never observed live. r2's own root-cause note: segment 4465's
  # offset-0000 entry was only ever inferred by analogy with how the parser/tactical phases (411B/
  # 41B7) work -- their own offset-0000 heads were separately live-confirmed by repeated hits during
  # ordinary ECL stepping, but 4465's offset 0000 never was. Only the setter FUNCTION's own bytes
  # (prologue +0x0507, write +0x0561) were ever proven RAM-resident at segment 4465 (via
  # map_secret_runtime_setter.py scanning post-hoc RAM snapshots) -- not that anything actually
  # jumps to 4465:0000 first during resume. If resume execution reaches the setter at all, it MUST
  # pass through CS:0561 to perform the write, regardless of what offset (if any) it entered the
  # segment at -- so arm that address directly instead of assuming a dispatch-loop-head re-entry.
  #
  # IMPORTANT (2026-07-16, r3-final): the literal text used here to arm the breakpoint ('4465:0561')
  # is only ONE alias of the physical address DOSBox-X actually matches against in real mode. A first
  # r3 attempt proved this live: the debugger genuinely halted (no '(Running)', full register dump,
  # byte-exact prologue/write bytes) at this armed breakpoint, but the CPU's OWN registers reported
  # CS=43C9 EIP=00000F21 -- a different segment:offset pair whose physical address, (0x43C9<<4)+0xF21
  # = 0x44BB1, is bit-for-bit identical to (0x4465<<4)+0x0561. 43C9:0EC7 (the matching prologue
  # address) also exactly matches GAME.OVR's own file-relative vm_SetMemoryValue offset (+0xEC7 from
  # overlay 9's base) documented in research/secret-startup-input-trace.md, independently confirming
  # 43C9 -- not 4465 -- is the segment actually resident during live resume execution; 4465 was a
  # stale leftover copy from an earlier overlay-swap window, found only in post-hoc RAM scans taken
  # long after the live write had already happened. See the detection loop below: it now matches on
  # computed physical address, not on this literal arm-time segment text, so it recognizes the hit
  # under whichever alias the CPU actually reports.
  $resumeParserArmedBeforeRun = $false
  $resumeParserArmConfirmation = $null
  if (($AutoQuickCombat -or $InjectCombatVictory) -and $TraceCombat) {
    if ($parserSnapshot -match '(?m)^\(Running\)\s*$') {
      throw 'operand-parser snapshot shows the debugger still running; cannot safely arm the resume-phase breakpoint'
    }
    Send-DebuggerCommand ('BP {0:X4}:{1:X4}' -f $resumeParserSegment, $runtimeSetterWriteOffset) 'arm-outcome-resume-setter-early'
    Send-DebuggerCommand 'BPLIST' 'outcome-resume-setter-armed' -Snapshot
    $resumeParserArmSnapshot = Get-Content -LiteralPath (Join-Path $out 'outcome-resume-setter-armed-console.txt') -Raw
    $resumeParserArmPattern = 'BP\s+{0:X4}:{1:X4}' -f $resumeParserSegment, $runtimeSetterWriteOffset
    if ($resumeParserArmSnapshot -notmatch $resumeParserArmPattern -or $resumeParserArmSnapshot -match '\(Running\)') {
      throw 'resume-phase setter breakpoint was not confirmed registered by BPLIST while the debugger was stopped'
    }
    $resumeParserArmedBeforeRun = $true
    $resumeParserArmConfirmation = 'outcome-resume-setter-armed-console.txt'
  }

  # count_combat_teams (candidate_secret_of_the_silver_blades_count_combat_teams, GAME.OVR+0x3AC6D,
  # descriptor 26 +0x2B1C): derive the live destination segment(s) directly from the operand-parser
  # RAM snapshot already captured above (the debugger is confirmed stopped at this exact point, same
  # discipline as the resume-setter arm immediately above), then arm a CODE breakpoint at each
  # discovered segment:0x2B1C before any further RUN. Additional segments (if VROOMM relocates the
  # descriptor mid-run, as the offline r4-snapshot survey showed it does between LOAD_MONSTER and the
  # outcome window) are armed dynamically inside the outcome-window loop below.
  $countTeamsArmedBeforeRun = $false
  $countTeamsInitialSegments = @()
  if ($ArmCountTeamsBpm -and ($AutoQuickCombat -or $InjectCombatVictory) -and $TraceCombat) {
    if ($parserSnapshot -match '(?m)^\(Running\)\s*$') {
      throw 'operand-parser snapshot shows the debugger still running; cannot safely arm the count-teams breakpoint'
    }
    $countTeamsInitialSegments = Find-CountTeamsSegments $parserRam
    if ($countTeamsInitialSegments.Count -eq 0) {
      throw 'count-teams candidate body was not found resident in the operand-parser RAM snapshot; cannot derive an initial segment'
    }
    foreach ($segment in $countTeamsInitialSegments) {
      if (Arm-CountTeamsSegment $segment 'operand-parser') { $countTeamsArmedBeforeRun = $true }
    }
    if (-not $countTeamsArmedBeforeRun) {
      throw 'count-teams breakpoint was not confirmed registered by BPLIST while the debugger was stopped'
    }
  }

  # r4 (2026-07-17) new hypothesis, not tried by r1/r2/r3: arm a MEMORY breakpoint (BPM) on the
  # consumed word's DATA address, using the same arm-before-RUN + BPLIST-readback discipline r2
  # proved correct for the CODE breakpoint above. secret-startup-input-trace.md records exactly
  # one prior BPM attempt at this same target ("BPM 54DC:039A ... did not stop"), but that attempt
  # predates the 2026-07-16 discovery (this file, r2) that BP/BPDEL/BPM typed while the CPU is
  # already free-running can silently fail to register -- it was never re-tried with a BPLIST
  # readback proving registration while genuinely stopped. Unlike the CODE breakpoint (which r3
  # proved can be defeated by VROOMM reusing the physical paragraph range for unrelated code by
  # the time execution revisits it), the DATA address is proven stable: three independent runs
  # (2026-07-15 natural, r1, r2) all observed the SAME physical word 0x5515A transition 0->4
  # post-hoc, so whichever code performs the write, it writes there. A correctly-armed BPM sidesteps
  # the "which relocated code segment does resume actually re-enter" question entirely.
  $resumeConsumedWordArmedBeforeRun = $false
  $resumeConsumedWordArmConfirmation = $null
  $consumedWordBpmTarget = $null
  if ($ArmConsumedWordBpm -and ($AutoQuickCombat -or $InjectCombatVictory) -and $TraceCombat) {
    if (-not $parserEs.Success) { throw 'operand-parser snapshot has no ES register to derive the consumed-word BPM target' }
    if ($parserSnapshot -match '(?m)^\(Running\)\s*$') {
      throw 'operand-parser snapshot shows the debugger still running; cannot safely arm the consumed-word BPM breakpoint'
    }
    $consumedWordBpmTarget = ('{0}:{1:X4}' -f $parserEs.Groups[1].Value, $consumedOffset)
    Send-DebuggerCommand ("BPM {0}" -f $consumedWordBpmTarget) 'arm-outcome-consumed-word-bpm-early'
    Send-DebuggerCommand 'BPLIST' 'outcome-consumed-word-bpm-armed' -Snapshot
    $consumedWordArmSnapshot = Get-Content -LiteralPath (Join-Path $out 'outcome-consumed-word-bpm-armed-console.txt') -Raw
    # NOTE (r4, 2026-07-17): DOSBox-X's BPLIST labels a memory breakpoint 'BPMEM', not 'BPM', even
    # though the command used to arm it is 'BPM segment:offset' -- confirmed live this session
    # ("DEBUG: Set memory breakpoint at 54DC:039A" followed by "00. BPMEM 54DC:039A (00)" in
    # outcome-consumed-word-bpm-armed-console.txt). A first r4 sub-attempt used 'BPM\s+...' here and
    # threw a false failure even though the breakpoint had genuinely registered.
    $consumedWordArmPattern = 'BPMEM\s+{0}' -f [regex]::Escape($consumedWordBpmTarget)
    if ($consumedWordArmSnapshot -notmatch $consumedWordArmPattern -or $consumedWordArmSnapshot -match '\(Running\)') {
      throw 'consumed-word BPM breakpoint was not confirmed registered by BPLIST while the debugger was stopped'
    }
    $resumeConsumedWordArmedBeforeRun = $true
    $resumeConsumedWordArmConfirmation = 'outcome-consumed-word-bpm-armed-console.txt'
  }

  if ($TraceCursor) {
    $cursorRows = @([ordered]@{ index = 0; phase = 'begin'; ecl_pc = $trace.parser.ecl_pc })
    $movementSent = $false
    $beforeMovementStatus = $null
    $moveModeStatus = $null
    $afterMovementStatus = $null
    $needRun = $true
    $searchLocationReached = $false
    $targetReached = $false
    $loadMonsterReached = $false
    $combatReached = $false
    $combatGateCaptured = $false
    $combatContinueSent = $false
    $postLoadMonsterPc = $null
    $resumeReached = $false
    $resumePc = $null
    $consumedBefore = $null
    $consumedAfter = $null
    $postOrPc = $null
    $setterBreakpointReached = $false
    $setterWriteAliasExact = $false
    $setterWritePointer = $null
    $setterDx = $null
    $setterArmConfirmation = $null
    $resumeParserBreakpointReached = $false
    $resumeParserImageExact = $false
    $actualResumeParserSegment = $null
    $actualResumeParserOffset = $null
    $countTeamsHits = New-Object 'System.Collections.Generic.List[object]'
    for ($cursorIndex = 1; $cursorIndex -le 160; $cursorIndex++) {
      if ($needRun) { Send-DebuggerCommand 'RUN' ("cursor-run-{0:D3}" -f $cursorIndex) }
      $stopped = $false
      $pollLimit = if ($TraceCombat -and $loadMonsterReached) { 80 } else { 20 }
      for ($poll = 0; $poll -lt $pollLimit; $poll++) {
        Start-Sleep -Milliseconds 250
        $pollSnapshot = Read-DebuggerSnapshot ("cursor-poll-{0:D3}-{1:D2}" -f $cursorIndex, $poll)
        if ($pollSnapshot -notmatch '\(Running\)' -and
            $pollSnapshot -match '\bCS=(407F|411B)\s+EIP=00000000\b') {
          $stopped = $true
          break
        }
      }
      if ($stopped) {
        $pcPath = Join-Path $out ("cursor-pc-{0:D3}.bin" -f $cursorIndex)
        & python $gameLink dump-memory $pcPath --start ('0x{0:X}' -f ($parserDGroup + 0x67E1)) --length 2
        if ($LASTEXITCODE -ne 0) { throw 'cursor PC read failed' }
        $pc = [BitConverter]::ToUInt16([IO.File]::ReadAllBytes($pcPath), 0)
        $cursorRows += [ordered]@{
          index = $cursorIndex
          phase = if ($movementSent) { 'after-forward' } else { 'before-forward' }
          parser_segment = [regex]::Match($pollSnapshot, '\bCS=([0-9A-F]{4})\s+EIP=00000000\b').Groups[1].Value
          ecl_pc = $pc
        }
        if ($pc -eq 0x8142) { $searchLocationReached = $true }
        if ($pc -eq 0x82B4) { $loadMonsterReached = $true }
        if ($pc -eq 0x82BB) {
          $combatReached = $true
          break
        }
        if ($pc -eq 0x826E) {
          $targetReached = $true
          if (-not $TraceCombat) { break }
        }
        $needRun = $true
        continue
      }
      if (-not $movementSent) {
        $beforeMovementStatus = & python $gameLink status | ConvertFrom-Json
        & python $gameLink screenshot (Join-Path $out 'cursor-before-forward.png')
        & python $gameLink dump-memory (Join-Path $out 'cursor-before-forward.ram') --start 0 --length 0x100000
        if ($LASTEXITCODE -ne 0) { throw 'cursor pre-movement RAM dump failed' }
        & python $gameLink press m
        if ($LASTEXITCODE -ne 0) { throw 'Move command input failed' }
        Start-Sleep -Seconds 2
        $moveModeStatus = & python $gameLink status | ConvertFrom-Json
        & python $gameLink screenshot (Join-Path $out 'cursor-move-mode.png')
        & python $gameLink press $MovementKey
        if ($LASTEXITCODE -ne 0) { throw 'cursor forward input failed' }
        Start-Sleep -Seconds 3
        $afterMovementStatus = & python $gameLink status | ConvertFrom-Json
        & python $gameLink screenshot (Join-Path $out 'cursor-after-forward.png')
        & python $gameLink dump-memory (Join-Path $out 'cursor-after-forward.ram') --start 0 --length 0x100000
        if ($LASTEXITCODE -ne 0) { throw 'cursor post-movement capture failed' }
        $movementSent = $true
        $needRun = $false
        continue
      }
      if ($TraceCombat -and $targetReached -and -not $combatReached) {
        if (-not $combatGateCaptured) {
          & python $gameLink status | Set-Content -LiteralPath (Join-Path $out 'combat-gate-gamelink.json') -Encoding utf8
          & python $gameLink screenshot (Join-Path $out 'combat-gate.png')
          & python $gameLink dump-memory (Join-Path $out 'combat-gate.ram') --start 0 --length 0x100000
          if ($LASTEXITCODE -ne 0) { throw 'combat gate capture failed' }
          $combatGateCaptured = $true
        }
        if (-not $combatContinueSent) {
          & python $gameLink press enter
          if ($LASTEXITCODE -ne 0) { throw 'combat gate Enter failed' }
          $combatContinueSent = $true
          $needRun = $false
          continue
        }
        if ($loadMonsterReached) {
          & python $gameLink status | Set-Content -LiteralPath (Join-Path $out 'post-load-monster-gamelink.json') -Encoding utf8
          & python $gameLink screenshot (Join-Path $out 'post-load-monster.png')
          & python $gameLink dump-memory (Join-Path $out 'post-load-monster.ram') --start 0 --length 0x100000
          if ($LASTEXITCODE -ne 0) { throw 'post-LOAD_MONSTER capture failed' }
          $postLoadRam = [IO.File]::ReadAllBytes((Join-Path $out 'post-load-monster.ram'))
          $postLoadMonsterPc = [BitConverter]::ToUInt16($postLoadRam, $parserDGroup + 0x67E1)
          # COMBAT has no operands, so the VM advances directly to its resume PC before tactical play.
          if ($postLoadMonsterPc -eq 0x82BC) { $combatReached = $true }
        }
      }
      break
    }

    if ($AutoQuickCombat -or $InjectCombatVictory) {
      if (-not $TraceCombat -or -not $combatReached) {
        throw 'combat outcome control requires a proven -TraceCombat tactical checkpoint'
      }
      if (-not $resumeParserArmedBeforeRun) {
        throw 'resume-phase setter breakpoint must already be armed (see arm-outcome-resume-setter-early) before combat outcome control'
      }
      $outcomeBefore = & python $gameLink peek ('0x{0:X}' -f $consumedPhysical) 2 |
        ConvertFrom-Json
      $outcomeBeforeBytes = [Convert]::FromHexString($outcomeBefore.hex)
      $consumedBefore = [BitConverter]::ToUInt16($outcomeBeforeBytes, 0)
      if ($consumedBefore -ne 0) { throw 'consumed bit was already set before combat outcome' }

      # Do NOT type BP/BPDEL here. The resume-phase SETTER WRITE breakpoint (4465:0561) was already
      # armed and BPLIST-confirmed above, before this cursor loop's first RUN, and it has stayed
      # registered untouched all the way through tactical combat. 2D tactical combat has no ECL
      # breakpoint to stop it, so the debugger may already be genuinely free-running at this point --
      # that is expected, not an error. Both 2026-07-16 setter attempts confirm this pattern; only
      # issue RUN here if the cursor loop instead left the debugger confirmed stopped (e.g. it broke
      # exactly on the COMBAT opcode fetch); otherwise leave the already-running CPU alone.
      $preOutcomeSnapshot = Read-DebuggerSnapshot 'pre-outcome-run-state'
      if ($preOutcomeSnapshot -match '(?m)^\(Running\)\s*$') {
        Write-Host '[secret-resume] debugger already free-running into combat; resume setter breakpoint stays armed from before RUN'
      } else {
        Send-DebuggerCommand 'RUN' 'run-with-outcome-watch'
      }

      if ($InjectCombatVictory) {
        $foeCountPhysical = $parserDGroup + 0x87CD
        # The live foe count at this address varies per encounter (RNG / party position /
        # which battle triggers) -- it is NOT reliably 5 across runs (attempt 6 on
        # 2026-07-17 observed 8 here, not the previously-hardcoded '05'). Read the actual
        # resident byte first and use it as the poke's own expectation, so the sanity
        # check still guards against poking the wrong address without assuming a fixed
        # foe count. The intent (force foe count to 0 for a bounded injected victory) is
        # unchanged.
        $foeCountPeek = & python $gameLink peek ('0x{0:X}' -f $foeCountPhysical) 1 |
          ConvertFrom-Json
        $foeCountExpectedHex = $foeCountPeek.hex
        $teamCountInjection = & python $gameLink poke ('0x{0:X}' -f $foeCountPhysical) $foeCountExpectedHex '00' |
          ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'bounded foe-count victory injection failed' }
        $combatantInjections = @()
        foreach ($address in @(0x6D640, 0x6F359, 0x6F519, 0x6F6D9, 0x6F899)) {
          $combatantInjections += & python $gameLink poke ('0x{0:X}' -f $address) '01' '00' |
            ConvertFrom-Json
          if ($LASTEXITCODE -ne 0) { throw ('bounded hydra in-combat injection failed at 0x{0:X}' -f $address) }
        }
        [ordered]@{
          schema_version = 1
          purpose = 'bounded injected tactical outcome; not a natural victory'
          team_count = $teamCountInjection
          combatants = $combatantInjections
        } | ConvertTo-Json -Depth 5 | Set-Content `
          -LiteralPath (Join-Path $out 'combat-victory-injection.json') -Encoding utf8

        # D opens Done's Guard/Delay/Quit submenu; Q then clears that hero's
        # remaining actions. Complete all six party turns so battle01 recounts.
        & python $gameLink press d q d q d q d q d q d q --pace 0.35
        if ($LASTEXITCODE -ne 0) { throw 'post-injection party turn completion failed' }
      } else {
        & python $gameLink press 'alt+q'
        if ($LASTEXITCODE -ne 0) { throw 'Alt+Q auto-combat input failed' }
      }

      $agentDir = Join-Path $out 'ollama-auto-combat'
      $agentStdout = Join-Path $out 'ollama-auto-combat.stdout.log'
      $agentStderr = Join-Path $out 'ollama-auto-combat.stderr.log'
      $goal = 'Monitor SSI Gold Box combat completion. Press N only for a visible Continue Battle prompt. Press Enter only when the screen explicitly asks for Enter/Return. Otherwise wait. Stop when the 2D tactical board is gone or a visible fatal error appears.'
      $agentArgs = @(
        ('"{0}"' -f $ollamaAgent), '--output', ('"{0}"' -f $agentDir),
        '--goal', ('"{0}"' -f $goal.Replace('"','\"')),
        '--model', 'qwen3.5:4b', '--actions', 'n', 'enter', 'wait', 'stop',
        '--max-steps', '100', '--timeout', '180', '--pace', '2'
      )
      $agentProcess = Start-Process -FilePath python -ArgumentList $agentArgs -PassThru `
        -WindowStyle Hidden -RedirectStandardOutput $agentStdout -RedirectStandardError $agentStderr

      # Physical-address direct-write detection (2026-07-16, r3-final): r3 proved DOSBox-X's
      # 'BP segment:offset' command resolves to a PHYSICAL/linear address match in real mode, not a
      # literal CS-register text match -- but it ALSO proved that a single precomputed physical
      # target can go stale mid-run, because Gold Box's VROOMM overlay manager reuses that fixed
      # physical paragraph range for unrelated code. r3's own recommended next step: re-verify (or
      # re-derive) the target address's bytes immediately before relying on any hit, rather than
      # assuming a snapshot taken earlier in the run is still valid, OR single-step the entire
      # resume transition from a known-good checkpoint (judged impractical here -- 2D tactical
      # combat resolution plus the outcome/resume window is estimated at anywhere from tens of
      # thousands to millions of 8086 instructions at this harness's DOSBox-X cycle setting, far
      # beyond what a foreground/blocking keystroke-per-step harness can cover in a bounded run).
      #
      # r4 (2026-07-17) generalizes the "re-verify immediately" option: EVERY genuine debugger stop
      # observed during this window is now judged directly against the DATA the resume contract is
      # defined by -- the consumed word 0x4CCD -> 0x0004 at physical 0x5515A (proven stable across
      # three independent runs: the 2026-07-15 natural run, r1, and r2) and the ECL cursor at
      # DS:67E1 -- instead of being accepted or rejected solely by whether it matches the single
      # precomputed CODE physical target. A stop whose resident bytes turn out NOT to match the
      # setter (the exact r3 false-positive shape) is logged as a rejected candidate and the CPU is
      # resumed (RUN) so the run keeps watching until the timeout, rather than aborting the whole
      # attempt on the first false positive as r3 did. If -ArmConsumedWordBpm registered a genuine
      # memory breakpoint on the consumed word's own DATA address (see
      # arm-outcome-consumed-word-bpm-early above -- a new hypothesis r1/r2/r3 never tried with the
      # arm-before-RUN + BPLIST-readback discipline r2 proved necessary), any resulting stop is
      # caught by this same generic word/cursor check without needing to match the predicted CODE
      # target at all, sidestepping the "which relocated code segment does resume re-enter through"
      # question entirely.
      $actualResumeParserSegment = $resumeParserSegment
      $setterArmConfirmation = $resumeParserArmConfirmation
      $targetSetterPhysical = ($resumeParserSegment -shl 4) + $runtimeSetterWriteOffset
      $targetProloguePhysical = ($resumeParserSegment -shl 4) + $runtimeSetterPrologueOffset
      $rejectedCandidates = @()
      $observedStops = @()
      $hitMechanism = $null
      $writeInstructionPointer = $null
      $writeInstructionPhysical = $null
      $candidateIndex = 0
      $combatDeadline = [DateTime]::UtcNow.AddSeconds($AutoCombatTimeoutSeconds)
      while ([DateTime]::UtcNow -lt $combatDeadline) {
        Start-Sleep -Seconds 2
        $setterSnapshot = Read-DebuggerSnapshot 'outcome-area-setter-poll'
        $liveCsIp = [regex]::Match($setterSnapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
        $liveStopped = $setterSnapshot -notmatch '\(Running\)' -and $liveCsIp.Success
        $liveHitsTarget = $false
        $liveCs = $null
        $liveEip = $null
        $livePhysical = $null
        if ($liveStopped) {
          $liveCs = [Convert]::ToUInt32($liveCsIp.Groups[1].Value, 16)
          $liveEip = [Convert]::ToUInt32($liveCsIp.Groups[2].Value, 16) -band 0xFFFF
          $livePhysical = (($liveCs -shl 4) + $liveEip) -band 0xFFFFF
          $liveHitsTarget = $livePhysical -eq $targetSetterPhysical
        }

        if ($liveStopped) {
          $candidateIndex++
          $stopRamPath = Join-Path $out ("outcome-stop-{0:D3}.ram" -f $candidateIndex)
          & python $gameLink dump-memory $stopRamPath --start 0 --length 0x100000
          if ($LASTEXITCODE -ne 0) { throw 'outcome-window RAM dump failed' }
          $stopRam = [IO.File]::ReadAllBytes($stopRamPath)
          $stopWord = [BitConverter]::ToUInt16($stopRam, $consumedPhysical)
          $stopPc = [BitConverter]::ToUInt16($stopRam, $parserDGroup + 0x67E1)
          $stopPointer = '{0:X4}:{1:X4}' -f $liveCs, $liveEip
          $handled = $false

          # count_combat_teams: judge this stop against the descriptor-26 CS:IP contract directly,
          # independent of the resume-setter's own word/cursor handling below (a single stop can only
          # ever match one of these targets, so this never steals a legitimate resume-setter hit).
          # First, discover and arm any NEW resident segment found in this stop's own fresh RAM dump
          # (the same "re-verify from this stop's own RAM, not an earlier snapshot" discipline r3/r4
          # established for the setter) -- VROOMM was observed relocating descriptor 26 mid-run in the
          # offline r4-snapshot survey, and this stop is a confirmed-stopped state, so arming here is
          # safe. Then check whether this exact stop's own CS:IP lands on any armed count-teams target.
          if ($ArmCountTeamsBpm) {
            foreach ($segment in (Find-CountTeamsSegments $stopRam)) {
              Arm-CountTeamsSegment $segment ("outcome-{0:D3}" -f $candidateIndex) | Out-Null
            }
            $countTeamsHitSegment = $null
            foreach ($segment in $armedCountTeamsSegments) {
              $candidatePhysical = ([Convert]::ToUInt32($segment, 16) -shl 4) + $countTeamsRelativeOffset
              if ($candidatePhysical -eq $livePhysical) { $countTeamsHitSegment = $segment; break }
            }
            if ($countTeamsHitSegment) {
              $bodyEnd = $livePhysical + $countTeamsBytes.Length - 1
              $byteMatch = $bodyEnd -lt $stopRam.Length -and [Linq.Enumerable]::SequenceEqual(
                [byte[]]$stopRam[$livePhysical..$bodyEnd], $countTeamsBytes)
              $countTeamsHits.Add([ordered]@{
                index = $candidateIndex
                pointer = $stopPointer
                physical = ('0x{0:X}' -f $livePhysical)
                segment = $countTeamsHitSegment
                byte_match = $byteMatch
                friends_count = if ($parserDGroup + 0x87CC -lt $stopRam.Length) { $stopRam[$parserDGroup + 0x87CC] } else { $null }
                foes_count = if ($parserDGroup + 0x87CD -lt $stopRam.Length) { $stopRam[$parserDGroup + 0x87CD] } else { $null }
                ram = $stopRamPath
              })
              Write-Host ("[secret-count-teams] CS:IP hit at {0} (physical 0x{1:X}), byte_match={2}" -f $stopPointer, $livePhysical, $byteMatch)
            }
          }

          if ($stopWord -eq 4 -and ($stopPc -eq 0x82C5 -or $stopPc -eq 0x82C6)) {
            # The consumed-word/cursor pair the resume contract is defined by has already
            # transitioned while the CPU is genuinely stopped -- accepted regardless of whether the
            # stop landed on the predicted CODE physical target. This is the r4 generalization: a
            # BPM hit on the DATA address (or any other incidental stop that happens to land after
            # the write) proves the transition just as validly as the originally-assumed CODE hit.
            $resumeParserBreakpointReached = $true
            $setterBreakpointReached = $true
            $actualResumeParserSegment = $liveCs
            $actualResumeParserOffset = $liveEip
            $consumedAfter = $stopWord
            $postOrPc = $stopPc
            $hitMechanism = if ($liveHitsTarget) { 'bp_physical_match_post_write' } else { 'generalized_stop_post_write' }
            $prologueBoundsOk = $targetProloguePhysical -ge 0 -and
              ($targetProloguePhysical + $areaSetterPrologueBytes.Length) -le $stopRam.Length -and
              ($targetSetterPhysical + $areaWriteBytes.Length) -le $stopRam.Length
            $resumeParserImageExact = $liveHitsTarget -and $prologueBoundsOk -and
              [Linq.Enumerable]::SequenceEqual(
                [byte[]]$stopRam[$targetProloguePhysical..($targetProloguePhysical + $areaSetterPrologueBytes.Length - 1)],
                $areaSetterPrologueBytes) -and
              [Linq.Enumerable]::SequenceEqual(
                [byte[]]$stopRam[$targetSetterPhysical..($targetSetterPhysical + $areaWriteBytes.Length - 1)],
                $areaWriteBytes)
            $setterWritePointer = $stopPointer
            $setterWriteAliasExact = $true
            $setterDx = 4
            $consumedRam = $stopRam
            [IO.File]::WriteAllBytes((Join-Path $out 'consumed-bit-hit.ram'), $stopRam)

            # Best-effort forensic step: a memory breakpoint stops at the instruction AFTER the one
            # that performed the trapped write, so $stopPointer/$livePhysical is one instruction past
            # the actual write. Scan backward a bounded window in the SAME live snapshot for the
            # known 5-byte write opcode (26 89 95 00 6A, byte-identical to GAME.OVR+0x9F94 and to
            # every prior relocated copy map_secret_runtime_setter.py found) to pin the exact write
            # instruction's live address, rather than leaving it merely inferred.
            $writeInstructionPhysical = $null
            $writeSearchFloor = [Math]::Max(0, $livePhysical - 64)
            for ($scan = $livePhysical - 5; $scan -ge $writeSearchFloor; $scan--) {
              if ($stopRam[$scan] -eq $areaWriteBytes[0] -and $stopRam[$scan + 1] -eq $areaWriteBytes[1] -and
                  $stopRam[$scan + 2] -eq $areaWriteBytes[2] -and $stopRam[$scan + 3] -eq $areaWriteBytes[3] -and
                  $stopRam[$scan + 4] -eq $areaWriteBytes[4]) {
                $writeInstructionPhysical = $scan
                break
              }
            }
            $writeInstructionPointer = if ($null -ne $writeInstructionPhysical) {
              '{0:X4}:{1:X4}' -f $liveCs, ($writeInstructionPhysical - ($liveCs -shl 4))
            } else { $null }
            $resumeReached = $true
            $resumePc = 0x82BC
            $handled = $true
            break
          }

          if (-not $handled -and $liveHitsTarget -and $stopWord -eq 0 -and $stopPc -eq 0x82C5) {
            # Pre-write stop exactly at the predicted CODE target -- the same shape r3 first
            # captured. Re-verify bytes FRESH from this stop's own RAM dump (not an earlier
            # snapshot) before trusting it, per r3's own recommendation, then step it instead of
            # assuming success or aborting the whole run on a mismatch.
            $prologueExact = [Linq.Enumerable]::SequenceEqual(
              [byte[]]$stopRam[$targetProloguePhysical..($targetProloguePhysical + $areaSetterPrologueBytes.Length - 1)],
              $areaSetterPrologueBytes)
            $writeExact = [Linq.Enumerable]::SequenceEqual(
              [byte[]]$stopRam[$targetSetterPhysical..($targetSetterPhysical + $areaWriteBytes.Length - 1)],
              $areaWriteBytes)
            if ($prologueExact -and $writeExact) {
              $setterEsMatch = [regex]::Match($setterSnapshot, '\bES=([0-9A-F]{4})\b')
              $setterDiMatch = [regex]::Match($setterSnapshot, '\bEDI=([0-9A-F]{8})\b')
              $setterDxMatch = [regex]::Match($setterSnapshot, '\bEDX=([0-9A-F]{8})\b')
              if ($setterEsMatch.Success -and $setterDiMatch.Success -and $setterDxMatch.Success) {
                $setterEs = [Convert]::ToUInt32($setterEsMatch.Groups[1].Value, 16)
                $setterDi = [Convert]::ToUInt32($setterDiMatch.Groups[1].Value, 16) -band 0xFFFF
                $setterDxValue = [Convert]::ToUInt32($setterDxMatch.Groups[1].Value, 16) -band 0xFFFF
                $setterEffectiveOffset = ($setterDi + 0x6A00) -band 0xFFFF
                $setterPhysical = ($setterEs -shl 4) + $setterEffectiveOffset
                if ($setterPhysical -eq $consumedPhysical -and $setterDxValue -eq 4) {
                  Send-DebuggerKey 'F11' 'step-area-setter-write'
                  Start-Sleep -Milliseconds 500
                  & python $gameLink dump-memory (Join-Path $out 'consumed-bit-hit.ram') --start 0 --length 0x100000
                  if ($LASTEXITCODE -ne 0) { throw 'post-Area1-setter RAM dump failed' }
                  $consumedRam = [IO.File]::ReadAllBytes((Join-Path $out 'consumed-bit-hit.ram'))
                  $steppedWord = [BitConverter]::ToUInt16($consumedRam, $consumedPhysical)
                  $steppedPc = [BitConverter]::ToUInt16($consumedRam, $parserDGroup + 0x67E1)
                  if ($steppedWord -eq 4 -and $steppedPc -eq 0x82C5) {
                    $resumeParserBreakpointReached = $true
                    $setterBreakpointReached = $true
                    $actualResumeParserSegment = $liveCs
                    $actualResumeParserOffset = $liveEip
                    $resumeParserImageExact = $true
                    $setterWritePointer = ('{0:X4}:{1:X4}' -f $setterEs, $setterEffectiveOffset)
                    $setterWriteAliasExact = $true
                    $setterDx = $setterDxValue
                    $consumedAfter = $steppedWord
                    $postOrPc = $steppedPc
                    $hitMechanism = 'bp_physical_match_stepped'
                    $resumeReached = $true
                    $resumePc = 0x82BC
                    $handled = $true
                    break
                  }
                  $rejectedCandidates += [ordered]@{
                    index = $candidateIndex; pointer = $stopPointer; physical = ('0x{0:X}' -f $livePhysical)
                    reason = 'byte-exact setter matched and was stepped, but the word/cursor did not reach the expected 0004/0x82C5 afterward'
                    stepped_word = $steppedWord; stepped_pc = ('0x{0:X}' -f $steppedPc)
                  }
                  $handled = $true
                }
              }
            }
            if (-not $handled) {
              $rejectedCandidates += [ordered]@{
                index = $candidateIndex; pointer = $stopPointer; physical = ('0x{0:X}' -f $livePhysical)
                reason = 'stopped at the predicted CODE physical target but resident bytes did not byte-match the Area1 setter -- the r3 VROOMM-reuse false positive, re-observed and re-verified fresh rather than assumed'
                prologue_exact = $prologueExact; write_exact = $writeExact
              }
              $handled = $true
            }
          }

          if (-not $handled) {
            $observedStops += [ordered]@{
              index = $candidateIndex; pointer = $stopPointer; physical = ('0x{0:X}' -f $livePhysical)
              consumed_word = $stopWord; ecl_cursor = ('0x{0:X}' -f $stopPc)
              note = 'genuine stop observed in the outcome window; did not match the predicted CODE target and did not yet show the resume word/cursor transition'
            }
          }

          Send-DebuggerCommand 'RUN' ("outcome-resume-run-{0:D3}" -f $candidateIndex)
        }

        if ($agentProcess.HasExited) { break }
      }

      if ($agentProcess -and -not $agentProcess.HasExited) {
        Stop-Process -Id $agentProcess.Id
        Wait-Process -Id $agentProcess.Id -ErrorAction SilentlyContinue
      }
      $agentProcess = $null

      if (-not $resumeReached) {
        & python $gameLink screenshot (Join-Path $out 'auto-combat-timeout.png')
        & python $gameLink dump-memory (Join-Path $out 'auto-combat-timeout.ram') --start 0 --length 0x100000
        throw 'bounded Ollama/Quick combat did not return to ECL resume 0x82BC'
      }

      $finalResumeCursor = [BitConverter]::ToUInt16($consumedRam, $parserDGroup + 0x67E1)
      if ([BitConverter]::ToUInt16($consumedRam, $consumedPhysical) -ne 4 -or
          ($finalResumeCursor -ne 0x82C5 -and $finalResumeCursor -ne 0x82C6)) {
        throw 'resume did not prove consumed bit 0->4 and cursor EXIT 0x82C5/0x82C6'
      }

      Send-DebuggerCommand 'BPDEL *' 'clear-consumed-bit'
      Send-DebuggerCommand 'RUN' 'run-through-exit'
      Start-Sleep -Seconds 8
      & python $gameLink status | Set-Content -LiteralPath (Join-Path $out 'post-resume-gamelink.json') -Encoding utf8
      & python $gameLink screenshot (Join-Path $out 'post-resume.png')
      & python $gameLink dump-memory (Join-Path $out 'post-resume.ram') --start 0 --length 0x100000
      if ($LASTEXITCODE -ne 0) { throw 'post-resume checkpoint failed' }
      & python $describeScreenshots (Join-Path $out 'post-resume.png') --model 'qwen3.5:4b' `
        --output (Join-Path $out 'post-resume-ollama.json') --timeout 180
      if ($LASTEXITCODE -ne 0) { throw 'post-resume visual classification failed' }
    }

    $countTeamsHitsArray = @($countTeamsHits)
    $countTeamsByteMatches = @($countTeamsHitsArray | Where-Object { $_.byte_match })
    $trace['count_teams'] = [ordered]@{
      candidate_name = 'candidate_secret_of_the_silver_blades_count_combat_teams'
      arm_switch = [bool]$ArmCountTeamsBpm
      retail_file_offset = ('0x{0:X}' -f $countTeamsFileOffset)
      descriptor = $countTeamsDescriptorIndex
      descriptor_relative_offset = ('0x{0:X}' -f $countTeamsRelativeOffset)
      body_size = $countTeamsBytes.Length
      initial_segments = @($countTeamsInitialSegments)
      armed_before_run = $countTeamsArmedBeforeRun
      all_armed_segments = @($armedCountTeamsSegments)
      arm_log = @($countTeamsArmLog)
      hits = $countTeamsHitsArray
      cs_ip_hit_confirmed = ($countTeamsHitsArray.Count -gt 0)
      byte_match_confirmed = ($countTeamsByteMatches.Count -gt 0)
      promoted = ($countTeamsHitsArray.Count -gt 0 -and $countTeamsByteMatches.Count -gt 0)
      claim_boundary = 'Promotion requires the debugger to genuinely stop with CS:IP exactly at an armed descriptor-26 segment:0x2B1C address (cs_ip_hit_confirmed) AND the resident 84 bytes at that stop to equal the retail GAME.OVR+0x3AC6D candidate body exactly (byte_match_confirmed). Neither condition alone changes the candidate status.'
    }

    $trace['cursor'] = [ordered]@{
      movement = $MovementKey
      command_sequence = @('m', $MovementKey)
      movement_sent = $movementSent
      parser_relocation = '407F:0000 -> 411B:0000'
      frame_sequence_before = if ($beforeMovementStatus) { $beforeMovementStatus.frame.sequence } else { $null }
      frame_sequence_after = if ($afterMovementStatus) { $afterMovementStatus.frame.sequence } else { $null }
      move_mode_frame_sequence = if ($moveModeStatus) { $moveModeStatus.frame.sequence } else { $null }
      frame_changed = if ($beforeMovementStatus -and $afterMovementStatus) {
        $beforeMovementStatus.frame.sequence -ne $afterMovementStatus.frame.sequence
      } else { $null }
      before_ram_sha256 = if (Test-Path -LiteralPath (Join-Path $out 'cursor-before-forward.ram')) {
        Get-Sha256Hex (Join-Path $out 'cursor-before-forward.ram')
      } else { $null }
      after_ram_sha256 = if (Test-Path -LiteralPath (Join-Path $out 'cursor-after-forward.ram')) {
        Get-Sha256Hex (Join-Path $out 'cursor-after-forward.ram')
      } else { $null }
      search_location = '0x8142'
      search_location_reached = $searchLocationReached
      descriptor_3_target = '0x826E'
      target_reached = $targetReached
      load_monster = '0x82B4'
      load_monster_reached = $loadMonsterReached
      combat = '0x82BB'
      combat_reached = $combatReached
      combat_detection = 'LOAD_MONSTER 0x82B4 followed by ECL resume cursor 0x82BC and post-load-monster.png tactical checkpoint'
      post_load_monster_ecl_pc = $postLoadMonsterPc
      combat_gate_captured = $combatGateCaptured
      combat_continue_sent = $combatContinueSent
      auto_quick_combat = [bool]$AutoQuickCombat
      injected_combat_victory = [bool]$InjectCombatVictory
      combat_team_count_offsets = [ordered]@{
        source = 'GAME.OVR:0x3AC6D count_teams'
        friends = 'DS:87CC'
        foes = 'DS:87CD'
      }
      resume_reached = $resumeReached
      resume_pc = $resumePc
      consumed_before = $consumedBefore
      consumed_after = $consumedAfter
      post_or_pc = $postOrPc
      resume_setter_armed_literal = ('{0:X4}:{1:X4}' -f $resumeParserSegment, $runtimeSetterWriteOffset)
      resume_setter_target_physical = ('0x{0:X}' -f $targetSetterPhysical)
      resume_parser_armed_before_run = $resumeParserArmedBeforeRun
      resume_parser_arm_confirmation = $resumeParserArmConfirmation
      resume_parser_breakpoint_reached = $resumeParserBreakpointReached
      resume_parser_segment_observed_live = if ($actualResumeParserSegment) { '{0:X4}' -f $actualResumeParserSegment } else { $null }
      resume_parser_offset_observed_live = if ($null -ne $actualResumeParserOffset) { '{0:X4}' -f $actualResumeParserOffset } else { $null }
      resume_parser_image_exact = $resumeParserImageExact
      setter_runtime_prologue_offset = ('0x{0:X4}' -f $runtimeSetterPrologueOffset)
      setter_runtime_write_offset = ('0x{0:X4}' -f $runtimeSetterWriteOffset)
      setter_breakpoint = if ($actualResumeParserSegment -and $null -ne $actualResumeParserOffset) {
        '{0:X4}:{1:X4}' -f $actualResumeParserSegment, $actualResumeParserOffset
      } else { $null }
      setter_file_offset = 'GAME.OVR:0x9F94'
      setter_breakpoint_reached = $setterBreakpointReached
      setter_write_pointer = $setterWritePointer
      setter_write_alias_exact = $setterWriteAliasExact
      setter_dx = $setterDx
      setter_arm_confirmation = $setterArmConfirmation
      hit_mechanism = $hitMechanism
      setter_write_instruction_pointer = $writeInstructionPointer
      setter_write_instruction_physical = if ($null -ne $writeInstructionPhysical) { ('0x{0:X}' -f $writeInstructionPhysical) } else { $null }
      consumed_word_bpm_armed_before_run = $resumeConsumedWordArmedBeforeRun
      consumed_word_bpm_target = $consumedWordBpmTarget
      consumed_word_bpm_arm_confirmation = $resumeConsumedWordArmConfirmation
      rejected_candidates = $rejectedCandidates
      observed_intermediate_stops = $observedStops
      rows = $cursorRows
    }
    $trace | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $out 'selector-trace.json') -Encoding utf8
    if ($resumeReached -and $InjectCombatVictory) {
      & python $resumeAnalyzer --trace (Join-Path $out 'selector-trace.json') `
        --tactical-ram (Join-Path $out 'post-load-monster.ram') `
        --consumed-ram (Join-Path $out 'consumed-bit-hit.ram') `
        --injection (Join-Path $out 'combat-victory-injection.json') `
        --tactical-status (Join-Path $out 'post-load-monster-gamelink.json') `
        --post-status (Join-Path $out 'post-resume-gamelink.json') `
        --tactical-screenshot (Join-Path $out 'post-load-monster.png') `
        --post-screenshot (Join-Path $out 'post-resume.png') `
        --post-model-report (Join-Path $out 'post-resume-ollama.json') `
        --output (Join-Path $out 'combat-resume-proof.json') --strict
      if ($LASTEXITCODE -ne 0) { throw 'strict Secret combat-resume proof failed' }
    }
    if (-not $searchLocationReached -or -not $targetReached) {
      throw 'bounded cursor trace did not prove Secret search_location -> descriptor 3 target'
    }
    if ($TraceCombat -and -not $combatReached) {
      throw 'bounded combat trace stopped before Secret COMBAT 0x82BB'
    }
  }
} finally {
  if ($agentProcess -and -not $agentProcess.HasExited) {
    Stop-Process -Id $agentProcess.Id
    Wait-Process -Id $agentProcess.Id -ErrorAction SilentlyContinue
  }
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
