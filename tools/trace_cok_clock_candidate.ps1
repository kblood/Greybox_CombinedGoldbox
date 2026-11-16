# trace_cok_clock_candidate.ps1 -- read-only native reachability probe for CoK's recovered clock routine.
#
# Resolves VROOMM descriptor 20 at runtime through the original loader's INT 21h/AH=42 seek,
# byte-matches the resident routine against the staged retail GAME.OVR, then watches its entry
# breakpoint during a bounded idle window.  It deliberately does NOT claim wilderness cadence:
# an execution hit only proves the recovered scheduler is reached; a later route trace must tie
# it to real wilderness movement and compare the documented Area1 words before/after.

param(
  [string]$StageDir = 'build\cok-fresh-runtime-stage',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(5,90)][int]$SeekTimeoutSeconds = 35,
  [ValidateRange(5,180)][int]$ExecutionWindowSeconds = 60,
  # Drive the independently reproduced retail opening -> Throtl Leave -> Outpost confirmation
  # route while the candidate breakpoint is armed.  Every input is followed by a debugger poll.
  [switch]$DriveRetailOutpost,
  # Load a staged saved party, capture its real first-person dungeon view, then issue these bounded
  # movement keys while polling the candidate breakpoint after every key.
  [switch]$DriveLoadedDungeon,
  # Gen1's input path may distinguish the extended cursor scan codes (`up`) from the numeric
  # keypad scan codes (`kp_8`); preserve both in experiments rather than silently substituting.
  [ValidateSet('up','down','left','right','kp_8','kp_2','kp_4','kp_6')][string[]]$DungeonMovementKeys = @('right','up'),
  # Menu inputs are safely brief, but the real-time exploration loop may miss a 50ms GameLink key
  # pulse between its polls. Keep the movement hold explicit in every trace artifact.
  [ValidateRange(0.10,1.00)][double]$DungeonMovementHoldSeconds = 0.30,
  # CoK redraws the first-person pane incrementally at the saved game speed.  A short menu-style
  # wait can capture only its cleared intermediate frame, before the movement has committed.
  [ValidateRange(500,15000)][int]$DungeonMovementSettleMilliseconds = 6000,
  # After Escape leaves the cloud save's Pick Character row, five Down actions from highlighted
  # Modify select Begin Adventuring (same verified Gen1 menu contract as Secret).
  [ValidateRange(1,9)][int]$CloudBeginDownCount = 5
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function RepoPath([string]$path) {
  if ([IO.Path]::IsPathRooted($path)) { return [IO.Path]::GetFullPath($path) }
  return [IO.Path]::GetFullPath((Join-Path $repo $path))
}
function StageManifest([string]$root) {
  $rootPath = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\','/')
  return @(
    Get-ChildItem -LiteralPath $rootPath -Recurse -File | Sort-Object FullName | ForEach-Object {
      [ordered]@{
        path=$_.FullName.Substring($rootPath.Length).TrimStart('\','/')
        bytes=$_.Length
        sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      }
    }
  )
}

# `tools/disasm_cok.py::DESCS[20]`, and `GAME.OVR+0x2ADA7 - 0x2A85E`.
$descriptorFileOffset = 0x2A85E
$descriptorCodeSize = 0x1030
$clockEntryRelative = 0x549
$clockEntryFileOffset = $descriptorFileOffset + $clockEntryRelative
$clockByteCount = 165
$stage = Resolve-Path -LiteralPath (RepoPath $StageDir)
$out = RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$runtimeStage = Join-Path $out 'runtime-game'
$overlayPath = Join-Path $stage 'GAME.OVR'
$sourceOverlay = Join-Path $repo 'Champions of Krynn\GAME.OVR'
if (-not (Test-Path -LiteralPath $overlayPath)) { throw "stage has no GAME.OVR: $stage" }
if ((Get-FileHash -LiteralPath $overlayPath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $sourceOverlay -Algorithm SHA256).Hash) {
  throw 'stage GAME.OVR differs from the read-only retail source; refusing trace'
}
$overlay = [IO.File]::ReadAllBytes($overlayPath)
# Original CoK mutates its save set while a loaded party moves.  Keep the supplied
# stage as an immutable input, including when this probe drives a saved dungeon.
$stageManifestBefore = StageManifest $stage
Copy-Item -LiteralPath $stage -Destination $runtimeStage -Recurse
$inputSaveSnapshot = Join-Path $out 'input-SAVGAMA.DAT'
Copy-Item -LiteralPath (Join-Path $stage 'SAVE\SAVGAMA.DAT') -Destination $inputSaveSnapshot
$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$areaLocator = Join-Path $repo 'tools\locate_coab_area1_in_ram.py'
if (-not (Test-Path -LiteralPath $dbx)) { throw "DOSBox-X build not found: $dbx" }
if (($DriveRetailOutpost -or $DriveLoadedDungeon) -and -not (Test-Path -LiteralPath $gameLink)) { throw "GameLink helper not found: $gameLink" }
if ($DriveRetailOutpost -and $DriveLoadedDungeon) { throw 'choose only one route-driving mode' }
if (Get-Process dosbox-x -ErrorAction SilentlyContinue) { throw 'GameLink is a singleton; stop the existing DOSBox-X session first.' }
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger input helper build failed' }

$process = $null
$step = 0
function Debugger {
  param([string]$Command, [string]$Label, [switch]$Snapshot)
  if (-not $Label) { $Label = 'dbg{0:D4}' -f $script:step }; $script:step++
  $status = Join-Path $out "$Label-status.json"
  $text = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id, '--status', $status, '--snapshot', $text)
  if ($Snapshot) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label" }
  $result = Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
  if (-not $result.Success) { throw "debugger helper rejected $Label`: $($result.Error)" }
  return Get-Content -LiteralPath $text -Raw
}
function IsRunning([string]$snapshot) { return $snapshot -match '(?m)^\(Running\)\s*$' }
function Address([string]$snapshot) {
  $m = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $m.Success) { return $null }
  return '{0}:{1}' -f $m.Groups[1].Value, $m.Groups[2].Value.Substring(4)
}
function Bytes([string]$snapshot) {
  $outBytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if ($m.Success) { foreach ($h in ($m.Groups[1].Value -split '\s+')) { if ($h) { $outBytes.Add([Convert]::ToByte($h,16)) } } }
  }
  return ,$outBytes.ToArray()
}
function Seek([string]$snapshot) {
  $regs = @{}
  foreach ($m in [regex]::Matches($snapshot, '\b(EAX|EBX|ECX|EDX)=([0-9A-F]{4,8})\b')) { $regs[$m.Groups[1].Value] = [Convert]::ToUInt32($m.Groups[2].Value,16) }
  if ($regs.Count -lt 4) { return $null }
  return [ordered]@{ ah=(($regs.EAX -shr 8)-band 0xff); handle=$regs.EBX; offset=((($regs.ECX -band 0xffff) -shl 16) -bor ($regs.EDX -band 0xffff)) }
}
$script:hits = @()
$script:entry = $null
function Record-ClockStop([string]$snapshot, [string]$label) {
  if (IsRunning $snapshot) { return }
  $addr = Address $snapshot
  $script:hits += [ordered]@{ label=$label; address=$addr; target=($addr -eq $script:entry) }
  if ($addr -eq $script:entry) {
    [IO.File]::WriteAllText((Join-Path $out ('clock-hit-{0:D3}.txt' -f ($script:hits.Count-1))),$snapshot,[Text.UTF8Encoding]::new($false))
  }
  Debugger -Command 'RUN' -Label ("continue-$label") | Out-Null
}
function Drive-RouteKeys([string[]]$keys, [string]$label, [int]$waitMilliseconds = 800, [double]$holdSeconds = 0.05) {
  & python $gameLink press @keys --pace 0.35 --hold $holdSeconds
  if ($LASTEXITCODE -ne 0) { throw "GameLink route input failed: $($keys -join ', ')" }
  Start-Sleep -Milliseconds $waitMilliseconds
  Record-ClockStop (Debugger -Snapshot -Label ("route-$label")) $label
}
function Dump-GameLinkRam([string]$path) {
  & python $gameLink dump-memory $path
  if ($LASTEXITCODE -ne 0) { throw "GameLink RAM dump failed: $path" }
}
function ParseHexOffset([string]$value) {
  if ($value -notmatch '^0x[0-9a-fA-F]+$') { throw "not a hexadecimal offset: $value" }
  return [Convert]::ToInt32($value.Substring(2),16)
}
function ReadWordsAtPhysicalOffsets([byte[]]$ram, $words) {
  $result = [ordered]@{}
  foreach ($property in $words.PSObject.Properties) {
    $offset = ParseHexOffset $property.Value.physical_offset
    if ($offset + 2 -gt $ram.Length) { throw "Area1 word $($property.Name) lies beyond the RAM dump" }
    $result[$property.Name] = [BitConverter]::ToUInt16($ram,$offset)
  }
  return $result
}

try {
  # START.EXE is a packed stub.  The established Gen1 DEBUGBOX path is a separate
  # 32 KiB LOADFIX command before DEBUGBOX (not a wrapper around the executable).
  & $probe -DbxExe $dbx -GameDir $runtimeStage -Exe 'START.EXE' -OutDir $out -Cycles 'fixed 25000' -LoadFixKb 32 -GameLink `
    -DebuggerAction @('BPINT 21 42','RUN') -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX launch failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  $destination = $null
  $deadline = [DateTime]::UtcNow.AddSeconds($SeekTimeoutSeconds)
  while (-not $destination -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snapshot = Debugger -Snapshot -Label 'seek-poll'
    if (IsRunning $snapshot) { continue }
    $seek = Seek $snapshot
    if ($seek -and $seek.ah -eq 0x42 -and $seek.handle -eq 5 -and $seek.offset -eq $descriptorFileOffset) {
      $seg = [regex]::Match($snapshot, 'es:\[0010\]=([0-9A-F]{4})')
      $size = [regex]::Match($snapshot, 'es:\[0008\]=([0-9A-F]{4})')
      if (-not $seg.Success -or -not $size.Success) { throw 'target seek lacks VROOMM destination annotations' }
      if ([Convert]::ToInt32($size.Groups[1].Value,16) -ne $descriptorCodeSize) { throw 'target descriptor code size mismatch' }
      $destination = $seg.Groups[1].Value
      $cs = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
      $postRead = '{0}:{1:X4}' -f $cs.Groups[1].Value, ([Convert]::ToUInt32($cs.Groups[2].Value,16) + 0x12)
      Debugger -Command "BP $postRead" -Label 'arm-postread' | Out-Null
      Debugger -Command 'RUN' -Label 'run-postread' | Out-Null
      $postDeadline = [DateTime]::UtcNow.AddSeconds(10)
      do { Start-Sleep -Milliseconds 100; $post = Debugger -Snapshot -Label 'postread-poll' } while (IsRunning $post -and [DateTime]::UtcNow -lt $postDeadline)
      if ((Address $post) -ne $postRead) { throw 'did not reach target descriptor post-read stop' }
      break
    }
    Debugger -Command 'RUN' -Label 'seek-continue' | Out-Null
  }
  if (-not $destination) { throw 'descriptor 20 was not observed in bounded VROOMM seek trace' }
  $dump = Debugger -Command ('D {0}:{1:X4}' -f $destination,$clockEntryRelative) -Label 'clock-entry-bytematch'
  $observed = Bytes $dump
  $expected = $overlay[$clockEntryFileOffset..($clockEntryFileOffset + $observed.Count - 1)]
  $byteMatch = ((($observed | ForEach-Object ToString x2) -join '') -eq (($expected | ForEach-Object ToString x2) -join ''))
  Debugger -Command 'BPDEL *' -Label 'clear-load-breakpoints' | Out-Null
  $script:entry = '{0}:{1:X4}' -f $destination,$clockEntryRelative
  Debugger -Command "BP $script:entry" -Label 'arm-clock-entry' | Out-Null
  Debugger -Command 'RUN' -Label 'run-clock-entry' | Out-Null
  $routeStarted = [DateTime]::UtcNow
  $area1Evidence = $null
  if ($DriveRetailOutpost -or $DriveLoadedDungeon) {
    # This is the same focusless, individually-paced menu path as cok_gamelink_saved_outpost_route.ps1.
    # It is an actual retail input sequence, but its Outpost prompt is not pre-labelled as a
    # wilderness cadence event; the breakpoint result stays bounded to the observed route.
    Start-Sleep -Seconds 40
    Record-ClockStop (Debugger -Snapshot -Label 'route-after-credits') 'after-credits'
    Drive-RouteKeys @('enter') 'title-enter' 3000
    Drive-RouteKeys @('down') 'load-menu-down-1' 400
    Drive-RouteKeys @('down') 'load-menu-down-2' 400
    Drive-RouteKeys @('enter') 'load-menu-enter' 2000
    Drive-RouteKeys @('a','enter') 'slot-a-enter' 2000
    if ($DriveLoadedDungeon) {
      & python $gameLink screenshot (Join-Path $out 'route-dungeon-pick-character.png')
      if ($LASTEXITCODE -ne 0) { throw 'GameLink dungeon pre-begin screenshot failed' }
      Drive-RouteKeys @('esc') 'leave-pick-character' 1000
      & python $gameLink screenshot (Join-Path $out 'route-dungeon-menu-before-begin.png')
      if ($LASTEXITCODE -ne 0) { throw 'GameLink dungeon function-menu screenshot failed' }
    }
    $beginKeys = if ($DriveLoadedDungeon) { @((1..$CloudBeginDownCount | ForEach-Object { 'down' }) + 'enter') } else { @('down','down','down','down','down','enter') }
    Drive-RouteKeys $beginKeys 'begin-adventuring' 3000
    if ($DriveRetailOutpost) {
      for ($routePage = 0; $routePage -lt 8; $routePage++) {
        Drive-RouteKeys @('enter') ("opening-page-{0:D2}" -f $routePage) 1300
      }
      for ($routeRight = 0; $routeRight -lt 5; $routeRight++) {
        Drive-RouteKeys @('right') ("town-right-{0:D2}" -f $routeRight) 450
      }
      Drive-RouteKeys @('enter') 'leave-to-outpost' 1500
      & python $gameLink screenshot (Join-Path $out 'route-outpost-confirmation.png')
      if ($LASTEXITCODE -ne 0) { throw 'GameLink route screenshot failed' }
    } else {
      # Cloud-save evidence already establishes this exact menu selection resumes into a native
      # first-person dungeon.  It is a scheduler reachability probe only, not fresh-landmark proof.
      # A loaded save can take longer than a fresh party menu to rebuild its live dungeon state.
      Start-Sleep -Seconds 10
      & python $gameLink screenshot (Join-Path $out 'route-dungeon-before.png')
      if ($LASTEXITCODE -ne 0) { throw 'GameLink dungeon pre-movement screenshot failed' }
      $beforeRamPath = Join-Path $out 'route-dungeon-before.ram'
      $locatorPath = Join-Path $out 'route-dungeon-before-area1.json'
      Dump-GameLinkRam $beforeRamPath
      & python $areaLocator --save $inputSaveSnapshot --ram $beforeRamPath --output $locatorPath `
        --word 0x4bc3 --word 0x4bc4 --word 0x4bc5 --word 0x4bc6 --word 0x4bc7 --word 0x4bc8 --word 0x4bc9 --word 0x4bca --word 0x4bcb --word 0x4bcc `
        --word 0x4c26 --word 0x4c28 --word 0x4c29 --word 0x4c37 --word 0x4c5c --word 0x4c7d | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'could not locate the exact loaded Area1 record in the pre-movement RAM dump' }
      $area1Locator = Get-Content -LiteralPath $locatorPath -Raw | ConvertFrom-Json
      $beforeRam = [IO.File]::ReadAllBytes($beforeRamPath)
      $beforeWords = ReadWordsAtPhysicalOffsets $beforeRam $area1Locator.words
      for ($moveIndex = 0; $moveIndex -lt $DungeonMovementKeys.Count; $moveIndex++) {
        Drive-RouteKeys @($DungeonMovementKeys[$moveIndex]) ("dungeon-move-{0:D2}-{1}" -f $moveIndex,$DungeonMovementKeys[$moveIndex]) $DungeonMovementSettleMilliseconds $DungeonMovementHoldSeconds
      }
      & python $gameLink screenshot (Join-Path $out 'route-dungeon-after.png')
      if ($LASTEXITCODE -ne 0) { throw 'GameLink dungeon post-movement screenshot failed' }
      $afterRamPath = Join-Path $out 'route-dungeon-after.ram'
      Dump-GameLinkRam $afterRamPath
      $afterWords = ReadWordsAtPhysicalOffsets ([IO.File]::ReadAllBytes($afterRamPath)) $area1Locator.words
      $changedWords = @($beforeWords.Keys | Where-Object { $beforeWords[$_] -ne $afterWords[$_] })
      $area1Evidence = [ordered]@{
        locator=(Split-Path -Leaf $locatorPath); physical_area1_base=$area1Locator.area1_matches[0]
        words_before=$beforeWords; words_after=$afterWords; changed_words=$changedWords
      }
    }
  } else {
    $execDeadline = [DateTime]::UtcNow.AddSeconds($ExecutionWindowSeconds)
    while ([DateTime]::UtcNow -lt $execDeadline) {
      Start-Sleep -Milliseconds 250
      Record-ClockStop (Debugger -Snapshot -Label ('exec-poll-{0:D3}' -f $script:hits.Count)) ('idle-{0:D3}' -f $script:hits.Count)
    }
  }
  $postRouteDump = Debugger -Command ('D {0}' -f $script:entry) -Label 'post-route-bytematch'
  $postRouteObserved = Bytes $postRouteDump
  $postRouteExpected = $overlay[$clockEntryFileOffset..($clockEntryFileOffset + $postRouteObserved.Count - 1)]
  $postRouteByteMatch = ((($postRouteObserved | ForEach-Object ToString x2) -join '') -eq (($postRouteExpected | ForEach-Object ToString x2) -join ''))
  # PowerShell's `if` expression enumerates a one-element array before ConvertTo-Json sees it.
  # Keep this schema field an array for both one-key and multi-key movement probes.
  $recordedDungeonMovementKeys = [Collections.Generic.List[string]]::new()
  if ($DriveLoadedDungeon) { foreach ($movementKey in $DungeonMovementKeys) { $recordedDungeonMovementKeys.Add($movementKey) } }
  $stageManifestAfter = StageManifest $stage
  $sourceStageUnchanged = (($stageManifestBefore | ConvertTo-Json -Compress -Depth 3) -eq ($stageManifestAfter | ConvertTo-Json -Compress -Depth 3))
  [ordered]@{ before=$stageManifestBefore; after=$stageManifestAfter; unchanged=$sourceStageUnchanged } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'input-stage-manifest.json') -Encoding utf8
  if (-not $sourceStageUnchanged) { throw 'input stage changed during trace; refusing to report a valid observation' }
  [ordered]@{
    schema_version=1; profile_id='champions-of-krynn'; stage=$stage.Path; runtime_stage=$runtimeStage; descriptor_file_offset=('0x{0:X}' -f $descriptorFileOffset)
    descriptor_code_size=('0x{0:X}' -f $descriptorCodeSize); runtime_segment=$destination; clock_entry_file_offset=('0x{0:X}' -f $clockEntryFileOffset)
    clock_entry_relative=('0x{0:X}' -f $clockEntryRelative); entry_byte_match=$byteMatch; execution_window_seconds=$ExecutionWindowSeconds
    route=if ($DriveRetailOutpost) { 'retail-opening-to-outpost-confirmation' } elseif ($DriveLoadedDungeon) { 'load-saved-party-and-dungeon-movement' } else { 'idle' }
    dungeon_movement_keys=$recordedDungeonMovementKeys
    cloud_begin_down_count=if ($DriveLoadedDungeon) { $CloudBeginDownCount } else { $null }
    dungeon_movement_hold_seconds=if ($DriveLoadedDungeon) { $DungeonMovementHoldSeconds } else { $null }
    dungeon_movement_settle_milliseconds=if ($DriveLoadedDungeon) { $DungeonMovementSettleMilliseconds } else { $null }
    source_stage_unchanged=$sourceStageUnchanged
    area1_evidence=$area1Evidence
    route_elapsed_seconds=[Math]::Round(([DateTime]::UtcNow - $routeStarted).TotalSeconds,3)
    post_route_entry_byte_match=$postRouteByteMatch
    execution_hits=$script:hits; target_hit_count=@($script:hits | Where-Object target).Count
    claim_boundary='A byte match proves the loaded descriptor body; a target hit proves entry execution during this bounded observed route only. Neither result alone identifies a wilderness action or landmark cadence.'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'cok-clock-candidate-trace.json') -Encoding utf8
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id; Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue }
}
