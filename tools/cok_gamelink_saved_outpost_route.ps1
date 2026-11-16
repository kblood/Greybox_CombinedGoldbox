# cok_gamelink_saved_outpost_route.ps1 -- reproducible retail CoK saved-game route to the
# the first real Outpost confirmation, using only focusless GameLink input and read-only checkpoints.
#
# The script never edits retail files, saves, or RAM. It launches an owned DOSBox-X process,
# uses the shipped slot-A party, captures stage screenshots/RAM, and stops only that process.
#
# Verified prefix (2026-07-27): credits -> title ENTER -> Load Saved Game (Down, Down, Enter)
# -> A, Enter -> leave PICK CHARACTER (Escape) -> Begin Adventuring (five separately paced
# Down keys, Enter) -> original opening camp menu.
#
# Do not infer a later town/outpost/caravan state from timing alone. The route below asserts each
# recovered camp, destination, overland, and caravan boundary. Legacy fixed-count continuation
# code was removed; combat control is available only through visible menu-state gates.

param(
  [string]$OutDir = '',
  # Read-only source tree to copy into the owned runtime. Defaults to the retail CoK install;
  # accepts a separately staged save set for differential native tracing.
  [string]$GameDir = '',
  # At the verified original opening camp menu, use the observed Escape exit once and capture the
  # destination-menu handoff. Literal E was separately proved to be a no-op.
  [switch]$ExitOpeningCamp,
  # Independently probe Escape at that same verified camp menu. It is intentionally separate from
  # -ExitOpeningCamp so a negative hotkey result cannot be silently folded into a later action.
  [switch]$EscapeOpeningCamp,
  # After the verified opening-camp EXIT handoff, move the native destination-menu cursor right this many
  # places and capture it. This never activates a destination.
  [ValidateRange(0,5)][int]$DestinationRightSteps = 0,
  # Activate the cursor position captured by -DestinationRightSteps once, then capture the
  # resulting screen. Requires an explicit nonzero selection count.
  [switch]$ActivateDestination,
  # Acknowledge the captured destination dialogue one page at a time, recording every resulting
  # retail screen. Requires -ActivateDestination.
  [ValidateRange(0,8)][int]$AcknowledgeDestinationPages = 0,
  # At the verified Outpost yes/no prompt reached through opening-camp EXIT → destination LEAVE, select NO
  # once and capture the returned retail map state.
  [switch]$DeclineVerifiedOutpost,
  # From the verified native MOVE mode, issue exactly one east input and capture its immediate
  # result. Requires the explicit left-selection and Enter mode activation below.
  [switch]$MoveVerifiedOverlandEast,
  # From that same map command bar, activate its visibly selected default command once and capture
  # the resulting mode. No directional input is sent.
  [switch]$ActivateVerifiedOverlandDefault,
  # From that same map command bar, move selection one position left and capture it. No command is
  # activated; this is the prerequisite visual check for the native MOVE mode.
  [switch]$SelectVerifiedOverlandMove,
  # Activate the MOVE selection made by -SelectVerifiedOverlandMove and capture the resulting
  # native mode. No directional input is sent.
  [switch]$ActivateVerifiedOverlandMove,
  # Acknowledge the native caravan narrative reached by -MoveVerifiedOverlandEast once through
  # its visible EXIT command, then capture the immediate retail result.
  [switch]$AcknowledgeVerifiedOverlandEncounter,
  # Advance the verified “A BATTLE BEGINS…” handoff once and capture the first tactical command
  # state, without issuing a combat action.
  [switch]$EnterVerifiedCaravanCombat,
  # At that first tactical command bar, open the visible DONE menu once and capture it. No
  # secondary combat action is selected.
  [switch]$OpenVerifiedCaravanDoneMenu,
  # Probe literal A once after the DONE transition and capture the next native turn state. The
  # screen has not yet established that this maps to AUTO rather than a primary-menu hotkey.
  [switch]$ProbeVerifiedCaravanA,
  # Activate the initially highlighted Done-menu item with Enter. This is a calibration probe;
  # current evidence identifies it as SPEED, not AUTO.
  [switch]$ActivateVerifiedCaravanDoneDefault,
  # From that Done menu, move one item left and capture the selection. This is the prerequisite
  # visual probe for AUTO, which is immediately left of the initial SPEED selection.
  [switch]$SelectVerifiedCaravanAuto,
  # Activate the AUTO selection made by -SelectVerifiedCaravanAuto with Enter and capture the
  # immediate state. CoK's manual documents AUTO as computer control for the active character.
  [switch]$ActivateVerifiedCaravanAuto,
  # Drive exactly one active combatant from the verified primary row to AUTO, but only after every
  # cursor/key transition has passed the deterministic combat-menu geometry gate. This is not a
  # bulk controller: it stops after one AUTO handoff so the next turn can be classified.
  [switch]$AssignVerifiedCaravanAutoStatefully,
  # Maximum number of consecutive classified party turns to hand to AUTO. A combat can take
  # multiple rounds, so this is deliberately turns rather than the six-member party size.
  # Every turn starts from a fresh pixel-classified screen; the controller aborts rather than
  # treating this as a blind repeat.
  [ValidateRange(1,48)][int]$StatefulCaravanAutoMembers = 1,
  # After the one state-aware AUTO activation, take input-free screenshots at this cadence. This
  # never assumes that a transient post-AUTO frame is a menu or sends another combat key.
  [ValidateRange(0,60)][int]$ObserveStatefulCaravanAutoSeconds = 0,
  [ValidateRange(1,15)][int]$ObserveStatefulCaravanAutoIntervalSeconds = 3,
  # After that literal-A probe, observe the untouched native combat for a bounded period.
  # Each interval records a screenshot/checkpoint (and Area1 dump with -TraceArea1); no keypress
  # is sent by this option.
  [ValidateRange(0,120)][int]$ObserveVerifiedCaravanAutoSeconds = 0,
  [ValidateRange(1,30)][int]$ObserveVerifiedCaravanAutoIntervalSeconds = 5,
  # Leave the owned, isolated DOSBox-X session alive for a separately bounded GameLink observer.
  [switch]$KeepOpen,
  # Optional debugger commands issued while DEBUGBOX is stopped, before the retail program starts.
  # This is intentionally an expert tracing hook: callers must include a final RUN command and
  # must derive any segment/offset from the same launch configuration before interpreting a hit.
  # Game input remains focusless GameLink input; this option never enables host SendKeys.
  [ValidatePattern('^[\x20-\x7E]{1,256}$')][string[]]$DebuggerPreAction = @(),
  # Replace each route key with an owned DEBUGBOX BPINT16/GameLink edge.  The first
  # title acknowledgement is delivered while the guest is running; later keys are
  # queued at the preceding interrupt stop and must advance the GameLink frame.
  [switch]$PacedDebuggerInput,
  # Use BPINT16 only for one initial title-key calibration.  At the confirmed
  # stop the route deletes the breakpoint and resumes, then drives the existing
  # free-running GameLink route with BIOS keyboard-ring delivery records.
  [switch]$FreeRunAfterInitialBpint,
  # Stop immediately at the byte-identifiable loaded-party menu. Requires -KeepOpen so a
  # subsequent GameLink observer can take a full same-process RAM dump before any ECL action.
  [switch]$StopAfterLoadedParty,
  # Dump full GameLink RAM after the save-load anchor and each route checkpoint, then use the
  # read-only Area1 locator to report exact record/word changes within this one DOSBox process.
  [switch]$TraceArea1,
  # Read GameLink screenshots with the local Ollama vision model at specified combat decision
  # points and refuse the next key unless stable contextual menu text is present.
  [switch]$VisionGate,
  [string]$VisionModel = 'qwen3.5:4b',
  [ValidateRange(0.05, 2.0)][double]$PaceSeconds = 0.35
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$gameDir = if ($GameDir) { [IO.Path]::GetFullPath($GameDir) } else { Join-Path $repo 'Champions of Krynn' }
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$link = Join-Path $repo 'tools\dosbox_gamelink.py'
$runtimeProbe = Join-Path $repo 'tools\goldbox_runtime_probe.py'
$pacedDebuggerWorker = Join-Path $repo 'tools\cok_debugger_paced_input.py'
$debuggerHelper = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$areaLocator = Join-Path $repo 'tools\locate_coab_area1_in_ram.py'
$menuPixels = Join-Path $repo 'tools\analyze_goldbox_menu_pixels.py'
$visionLib = Join-Path $repo 'tools\dosbot\lib.ps1'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$out = if ($OutDir) { [IO.Path]::GetFullPath($OutDir) } else { Join-Path $repo "build\cok-saved-outpost-$stamp" }

foreach ($path in @($dbx, $probe, $link, $runtimeProbe, $pacedDebuggerWorker, $areaLocator, $menuPixels, (Join-Path $gameDir 'START.EXE'))) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required file not found: $path" }
}
if ($VisionGate -and -not (Test-Path -LiteralPath $visionLib -PathType Leaf)) { throw "Vision helper not found: $visionLib" }
if ($VisionGate) { . $visionLib }
if (Test-Path -LiteralPath $out) { throw "Refusing to overwrite existing output directory: $out" }
if (Get-Process dosbox-x -ErrorAction SilentlyContinue) { throw 'GameLink is a singleton; stop the existing DOSBox-X session first.' }
if ($StopAfterLoadedParty -and (-not $KeepOpen -or -not $TraceArea1)) {
  throw '-StopAfterLoadedParty requires -KeepOpen and -TraceArea1 so the claimed loaded-party baseline is exact-matched in same-process RAM.'
}
if ($PacedDebuggerInput) {
  if ($DebuggerPreAction.Count -eq 0 -or $DebuggerPreAction[-1] -ne 'RUN' -or $DebuggerPreAction -notcontains 'BPINT 16 0') {
    throw '-PacedDebuggerInput requires -DebuggerPreAction containing "BPINT 16 0" and ending in RUN.'
  }
}
if ($FreeRunAfterInitialBpint) {
  if ($PacedDebuggerInput) { throw '-FreeRunAfterInitialBpint cannot be combined with -PacedDebuggerInput.' }
  if ($DebuggerPreAction.Count -eq 0 -or $DebuggerPreAction[-1] -ne 'RUN' -or $DebuggerPreAction -notcontains 'BPINT 16 0') {
    throw '-FreeRunAfterInitialBpint requires -DebuggerPreAction containing "BPINT 16 0" and ending in RUN.'
  }
  if (-not (Test-Path -LiteralPath $debuggerHelper -PathType Leaf)) { throw "Debugger helper not built: $debuggerHelper" }
}
if ($ExitOpeningCamp -and $EscapeOpeningCamp) {
  throw 'Choose one opening-camp exit probe per run.'
}
if ($DestinationRightSteps -gt 0 -and -not $ExitOpeningCamp) {
  throw '-DestinationRightSteps requires -ExitOpeningCamp.'
}
if ($ActivateDestination -and ($DestinationRightSteps -eq 0 -or -not $ExitOpeningCamp)) {
  throw '-ActivateDestination requires -ExitOpeningCamp and a nonzero -DestinationRightSteps.'
}
if ($AcknowledgeDestinationPages -gt 0 -and -not $ActivateDestination) {
  throw '-AcknowledgeDestinationPages requires -ActivateDestination.'
}
if ($DeclineVerifiedOutpost -and (-not $ExitOpeningCamp -or -not $ActivateDestination -or $DestinationRightSteps -ne 5)) {
  throw '-DeclineVerifiedOutpost requires the verified EXIT → five-right LEAVE → activation route.'
}
if ($MoveVerifiedOverlandEast -and -not $ActivateVerifiedOverlandMove) {
  throw '-MoveVerifiedOverlandEast requires -ActivateVerifiedOverlandMove.'
}
if ($AcknowledgeVerifiedOverlandEncounter -and -not $MoveVerifiedOverlandEast) {
  throw '-AcknowledgeVerifiedOverlandEncounter requires -MoveVerifiedOverlandEast.'
}
if ($EnterVerifiedCaravanCombat -and -not $AcknowledgeVerifiedOverlandEncounter) {
  throw '-EnterVerifiedCaravanCombat requires -AcknowledgeVerifiedOverlandEncounter.'
}
if ($OpenVerifiedCaravanDoneMenu -and -not $EnterVerifiedCaravanCombat) {
  throw '-OpenVerifiedCaravanDoneMenu requires -EnterVerifiedCaravanCombat.'
}
if ($ProbeVerifiedCaravanA -and -not $OpenVerifiedCaravanDoneMenu) {
  throw '-ProbeVerifiedCaravanA requires -OpenVerifiedCaravanDoneMenu.'
}
if ($ActivateVerifiedCaravanDoneDefault -and -not $OpenVerifiedCaravanDoneMenu) {
  throw '-ActivateVerifiedCaravanDoneDefault requires -OpenVerifiedCaravanDoneMenu.'
}
if ($SelectVerifiedCaravanAuto -and -not $OpenVerifiedCaravanDoneMenu) {
  throw '-SelectVerifiedCaravanAuto requires -OpenVerifiedCaravanDoneMenu.'
}
if ($ActivateVerifiedCaravanAuto -and -not $SelectVerifiedCaravanAuto) {
  throw '-ActivateVerifiedCaravanAuto requires -SelectVerifiedCaravanAuto.'
}
if ($AssignVerifiedCaravanAutoStatefully -and (-not $EnterVerifiedCaravanCombat -or $OpenVerifiedCaravanDoneMenu)) {
  throw '-AssignVerifiedCaravanAutoStatefully requires -EnterVerifiedCaravanCombat and cannot be combined with -OpenVerifiedCaravanDoneMenu.'
}
if ($ObserveStatefulCaravanAutoSeconds -gt 0 -and -not $AssignVerifiedCaravanAutoStatefully) {
  throw '-ObserveStatefulCaravanAutoSeconds requires -AssignVerifiedCaravanAutoStatefully.'
}
if (([int][bool]$ProbeVerifiedCaravanA + [int][bool]$ActivateVerifiedCaravanDoneDefault + [int][bool]$SelectVerifiedCaravanAuto) -gt 1) {
  throw 'Choose one secondary-menu calibration probe per run.'
}
if ($ObserveVerifiedCaravanAutoSeconds -gt 0 -and -not $ProbeVerifiedCaravanA) {
  throw '-ObserveVerifiedCaravanAutoSeconds requires -ProbeVerifiedCaravanA.'
}
if ($ActivateVerifiedOverlandDefault -and -not $DeclineVerifiedOutpost) {
  throw '-ActivateVerifiedOverlandDefault requires -DeclineVerifiedOutpost.'
}
if ($SelectVerifiedOverlandMove -and -not $DeclineVerifiedOutpost) {
  throw '-SelectVerifiedOverlandMove requires -DeclineVerifiedOutpost.'
}
if ($ActivateVerifiedOverlandMove -and -not $SelectVerifiedOverlandMove) {
  throw '-ActivateVerifiedOverlandMove requires -SelectVerifiedOverlandMove.'
}
if ($ActivateVerifiedOverlandDefault -and ($MoveVerifiedOverlandEast -or $SelectVerifiedOverlandMove)) {
  throw 'The default-command probe cannot be combined with MOVE selection or a directional input.'
}
New-Item -ItemType Directory -Path $out | Out-Null
# CoK persists party and area state while this route advances.  Work from an isolated complete
# game copy so GameLink automation cannot touch the read-only retail source tree.
$runtimeGameDir = Join-Path $out 'runtime-game'
Copy-Item -LiteralPath $gameDir -Destination $runtimeGameDir -Recurse
$cokFont = Join-Path $runtimeGameDir '8X8D1.DAX'
if (-not (Test-Path -LiteralPath $cokFont -PathType Leaf)) { throw "CoK retail font not found: $cokFont" }

$ownedPid = $null
$script:pacedDebuggerEdge = 0
$script:freeRunBootstrapComplete = $false
function GetBiosKeyBufferPeek {
  $json = & python $link peek '0x41A' 4
  if ($LASTEXITCODE -ne 0) { throw 'GameLink BIOS keyboard-ring peek failed.' }
  return ($json | ConvertFrom-Json).hex
}
function InvokeFreeRunDebugger([string]$Command, [string]$Label) {
  $statusPath = Join-Path $out "debugger-bootstrap-$Label-status.json"
  $snapshotPath = Join-Path $out "debugger-bootstrap-$Label-console.txt"
  & dotnet $debuggerHelper --pid $ownedPid --command $Command --status $statusPath --snapshot $snapshotPath
  if ($LASTEXITCODE -ne 0) { throw "Debugger helper failed during free-run bootstrap $Label." }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "Debugger helper rejected free-run bootstrap $Label`: $($status.Error)" }
}
function SendFreeRunGameLinkKey([string]$Key) {
  $before = GetBiosKeyBufferPeek
  & python $link press $Key --pace $PaceSeconds --hold 0.05
  if ($LASTEXITCODE -ne 0) { throw "Free-running GameLink key injection failed: $Key" }
  $after = GetBiosKeyBufferPeek
  Start-Sleep -Milliseconds 500
  $settled = GetBiosKeyBufferPeek
  $record = [ordered]@{
    key = $Key; utc = [DateTime]::UtcNow.ToString('o'); bios_ring_before = $before
    bios_ring_after = $after; bios_ring_settled = $settled
    delivered = ($before -ne $after -or $before -ne $settled)
  } | ConvertTo-Json -Compress
  Add-Content -LiteralPath (Join-Path $out 'freerun-key-delivery.jsonl') -Value $record -Encoding utf8
  if ($before -eq $after -and $before -eq $settled) { throw "No BIOS keyboard-ring movement observed for free-running GameLink key: $Key" }
}
function Press([string[]]$Keys) {
  if ($FreeRunAfterInitialBpint) {
    if (-not $ownedPid) { throw 'Free-run BPINT bootstrap requested before the owned process PID was established.' }
    if (-not $script:freeRunBootstrapComplete) {
      # CoK has not reached AH=00 at boot. Deliver one normal GameLink Escape
      # while running, retain the resulting native stop, then delete BPINT while
      # genuinely halted. Re-arming after deletion is not reliable in this
      # DOSBox-X build, so the rest of this process is intentionally free-running.
      $bootstrapOut = Join-Path (Join-Path $out 'debugger-bootstrap') '001-esc'
      & python $pacedDebuggerWorker --pid $ownedPid --key 'esc' --output $bootstrapOut --running-input --timeout 15 --consume-timeout 5
      if ($LASTEXITCODE -ne 0) { throw 'Initial BPINT/GameLink bootstrap edge failed.' }
      InvokeFreeRunDebugger 'BPDEL *' 'delete-breakpoints'
      InvokeFreeRunDebugger 'RUN' 'resume'
      $script:freeRunBootstrapComplete = $true
      # The bootstrap key only proves the native input stop; the bounded
      # function-menu loop below advances credits with Escape and verifies the
      # rendered function menu before it permits any menu navigation.
      Start-Sleep -Seconds 1
      return
    }
    foreach ($key in $Keys) {
      SendFreeRunGameLinkKey $key
    }
    return
  }
  if ($PacedDebuggerInput) {
    if (-not $ownedPid) { throw 'Paced DEBUGBOX input requested before the owned process PID was established.' }
    foreach ($key in $Keys) {
      $script:pacedDebuggerEdge++
      $edgeName = '{0:D3}-{1}' -f $script:pacedDebuggerEdge, $key.ToLowerInvariant()
      $edgeOut = Join-Path (Join-Path $out 'debugger-edges') $edgeName
      $edgeArgs = @($pacedDebuggerWorker, '--pid', $ownedPid, '--key', $key, '--output', $edgeOut, '--timeout', '15', '--consume-timeout', '5')
      if ($script:pacedDebuggerEdge -eq 1) {
        # CoK has not yet called AH=00 at the title. The bootstrap edge is still
        # retained, but cannot demand a changed frame because its initial render
        # can be stale (see the r4 calibration in the improvement-loop research).
        $edgeArgs += '--running-input'
      } else {
        # A real CoK handler can advance its stopped stack before it repaints.  A
        # static frame is therefore not by itself a rejected key: require either
        # a new GameLink frame or a changed debugger register snapshot.
        $edgeArgs += '--require-progress'
      }
      & python @edgeArgs
      if ($LASTEXITCODE -ne 0) { throw "Paced DEBUGBOX/GameLink edge failed: $edgeName" }
      if ($PaceSeconds -gt 0) { Start-Sleep -Seconds $PaceSeconds }
    }
    return
  }
  & python $link press @Keys --pace $PaceSeconds --hold 0.05
  if ($LASTEXITCODE -ne 0) { throw "GameLink key injection failed: $($Keys -join ', ')" }
}
function PressRepeated([string]$Key, [int]$Count, [int]$PauseMilliseconds = 1300) {
  for ($i = 0; $i -lt $Count; $i++) {
    Press @($Key)
    Start-Sleep -Milliseconds $PauseMilliseconds
  }
}
function Shot([string]$Name) {
  & python $link screenshot (Join-Path $out "$Name.png")
  if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $Name" }
}
function AssertVisible([string]$Name, [string[]]$RequiredText) {
  if (-not $VisionGate) { return }
  $png = Join-Path $out "$Name.png"
  $observation = Invoke-Vision -Png $png -Model $VisionModel
  $observation | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out "$Name.vision.json") -Encoding utf8
  $visible = "$($observation.visible_text)"
  foreach ($required in $RequiredText) {
    if ($visible -notmatch [regex]::Escape($required)) {
      throw "Vision gate at $Name did not recognize '$required' in visible text: $visible"
    }
  }
}
function AssertAutoPixelHighlight([string]$Name) {
  # The selected EGA menu label is solid white while unselected labels are green
  # with only their mnemonic letter white.  The AUTO label's fixed 640x400 span
  # is x=272..336 on this combat row. This check is deterministic and does not
  # depend on OCR recognizing the AUTO glyph.
  $png = Join-Path $out "$Name.png"
  $report = Join-Path $out "$Name.menu-pixels.json"
  & python $menuPixels $png --expect-white 272 336 --output $report
  if ($LASTEXITCODE -ne 0) { throw "Pixel menu gate at $Name did not verify AUTO highlight" }
}
function AssertCokCombatMenu([string]$Name, [ValidateSet('movement', 'movement_active', 'primary', 'primary_short', 'done', 'done_short')][string]$Menu, [int]$WhiteStart = -1, [int]$WhiteEnd = -1) {
  $png = Join-Path $out "$Name.png"
  $args = @($menuPixels, $png, '--expect-cok-combat', $Menu)
  # Adjacent labels can move their ink edge by two DOS pixels when their mnemonic is white.
  # The profile check above still requires all six labels in their fixed row positions.
  if ($WhiteStart -ge 0 -and $WhiteEnd -ge 0) { $args += @('--expect-white', $WhiteStart, $WhiteEnd, '--expect-white-tolerance', '3') }
  & python @args
  if ($LASTEXITCODE -ne 0) {
    throw "Pixel combat-menu gate at $Name did not verify $Menu$(if ($WhiteStart -ge 0) { " with selected span $WhiteStart..$WhiteEnd" })"
  }
}
function GetCokCombatMenuProfile([string]$Name) {
  $png = Join-Path $out "$Name.png"
  $result = (& python $menuPixels $png | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0) { throw "Could not analyze combat-menu geometry at $Name" }
  return "$($result.cok_combat_profile)"
}
function TestCokCombatSelection([string]$Name, [ValidateSet('primary', 'primary_short', 'done', 'done_short')][string]$Menu, [int]$WhiteStart, [int]$WhiteEnd) {
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png '--expect-cok-combat' $Menu '--expect-white' $WhiteStart $WhiteEnd '--expect-white-tolerance' 3 *> $null
  return $LASTEXITCODE -eq 0
}
function TestCokOpeningCampMenu([string]$Name) {
  # The selected SAVE label is a solid white fill and cannot be font-decoded;
  # the remaining six labels make a discriminating, deterministic camp gate.
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --top 384 --bottom 400 --font $cokFont `
    --expect-label VIEW --expect-label MAGIC --expect-label REST --expect-label ALTER --expect-label FIX --expect-label EXIT *> $null
  return $LASTEXITCODE -eq 0
}
function TestCokFunctionMenu([string]$Name) {
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --top 384 --bottom 400 --font $cokFont --glyph-top 384 `
    --expect-label CHOOSE --expect-label A --expect-label FUNCTION *> $null
  return $LASTEXITCODE -eq 0
}
function AssertCokLoadGamePrompt([string]$Name) {
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --top 384 --bottom 400 --font $cokFont --glyph-top 384 `
    --expect-label LOAD --expect-label WHICH --expect-label GAME *> $null
  if ($LASTEXITCODE -ne 0) { throw "Expected the native LOAD WHICH GAME slot prompt at $Name." }
}
function WaitForCokFunctionMenu([string]$Prefix) {
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    $name = "$Prefix-$('{0:D2}' -f $attempt)"
    Shot $name
    if (TestCokFunctionMenu $name) { return }
    SendFreeRunGameLinkKey 'esc'
    Start-Sleep -Seconds 1
  }
  throw 'Free-running BPINT bootstrap did not settle at the verified CoK function menu.'
}
function TestCokGuarding([string]$Name) {
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --top 384 --bottom 400 --font $cokFont --expect-label GUARDING *> $null
  return $LASTEXITCODE -eq 0
}
function TestCokVictoryContinuation([string]$Name) {
  # The retail caravan victory page has a single solid-white full-width bottom instruction:
  # PRESS <ENTER>/<RETURN> TO CONTINUE.  The selected/instruction text is white, so the font
  # decoder cannot split it into words; this geometric gate deliberately identifies only that
  # continuation boundary and never acknowledges it.
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --expect-white 0 544 --expect-white-tolerance 3 *> $null
  return $LASTEXITCODE -eq 0
}
function TestCokContinueBattle([string]$Name) {
  # This is a separate post-combat decision row, not a tactical turn. In the verified caravan
  # fixture NO is the selected fifth run, but this predicate intentionally only recognizes the
  # native CONTINUE BATTLE geometry; a later one-key continuation must assert selection itself.
  $png = Join-Path $out "$Name.png"
  & python $menuPixels $png --expect-cok-combat continue_battle *> $null
  return $LASTEXITCODE -eq 0
}
function WaitForCokPartyCombatMenu([string]$Prefix, [string]$InitialStateName, [switch]$ExcludeMovementActive) {
  # Transitions after AUTO and after closing MOVE/ATTACK can briefly draw no command row while
  # the native scheduler advances a monster or resolves the completed move.  Polling must not
  # decide that a single blank frame needs a guest key.
  $stateName = $InitialStateName
  $profile = GetCokCombatMenuProfile $stateName
  $accepted = @('movement', 'movement_active', 'primary', 'primary_short')
  if ($profile -in $accepted -and (-not $ExcludeMovementActive -or $profile -ne 'movement_active')) {
    return [pscustomobject]@{ Name = $stateName; Profile = $profile }
  }
  for ($wait = 1; $wait -le 20; $wait++) {
    if (TestCokContinueBattle $stateName) {
      throw "$Prefix reached the unacknowledged native CONTINUE BATTLE boundary at $stateName."
    }
    if (TestCokVictoryContinuation $stateName) {
      throw "$Prefix reached the unacknowledged retail victory continuation at $stateName."
    }
    Start-Sleep -Seconds 2
    $stateName = "$Prefix-await-turn-{0:D2}" -f $wait
    Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
    $profile = GetCokCombatMenuProfile $stateName
    if ($profile -in $accepted -and (-not $ExcludeMovementActive -or $profile -ne 'movement_active')) {
      return [pscustomobject]@{ Name = $stateName; Profile = $profile }
    }
  }
  if (TestCokContinueBattle $stateName) {
    throw "$Prefix reached the unacknowledged native CONTINUE BATTLE boundary at $stateName."
  }
  if (TestCokVictoryContinuation $stateName) {
    throw "$Prefix reached the unacknowledged retail victory continuation at $stateName."
  }
  throw "$Prefix did not return to a recognized party combat menu within 40 seconds; inspect $stateName."
}
function AssignCokStatefulAuto([int]$Member, [string]$InitialStateName) {
  $prefix = 'verified-caravan-stateful-member-{0:D2}' -f $Member
  # AUTO can hand the clock to monsters before the next party command row is rendered.  Do not
  # send an input to that in-between frame: sample it until a known combat profile returns, or
  # preserve the unacknowledged retail victory boundary for a separate post-combat trace.
  $settled = WaitForCokPartyCombatMenu $prefix $InitialStateName
  $stateName = $settled.Name
  $initialProfile = $settled.Profile
  if ($initialProfile -eq 'movement_active') {
    # Retail/COAB movement loop: Enter exits MOVE/ATTACK without spending a step.
    # The live retail engine can keep drawing the movement prompt while it
    # resolves the preceding AUTO/guard action; that transition is asynchronous
    # and is not safe to accelerate with another keypress.
    Press @('enter') | Out-Null; Start-Sleep -Milliseconds 350
    $stateName = "$prefix-primary-after-movement-complete"
    Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
    $settled = WaitForCokPartyCombatMenu "$prefix-movement-complete" $stateName -ExcludeMovementActive
    $stateName = $settled.Name
    $initialProfile = $settled.Profile
  }
  if ($initialProfile -eq 'movement') {
    Press @('d') | Out-Null; Start-Sleep -Milliseconds 350
    $stateName = "$prefix-primary-after-movement-done"
    Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
    $initialProfile = GetCokCombatMenuProfile $stateName
    if ($initialProfile -notin @('primary', 'primary_short')) { throw "Member $Member movement DONE did not reach a primary menu, found $initialProfile" }
  }
  $primaryProfile = if ($initialProfile -eq 'primary_short') { 'primary_short' } else { 'primary' }
  $doneSpan = if ($primaryProfile -eq 'primary_short') { @(290,352) } else { @(370,432) }
  for ($i = 0; $i -lt 6; $i++) {
    if (TestCokCombatSelection $stateName $primaryProfile $doneSpan[0] $doneSpan[1]) { break }
    Press @('right') | Out-Null; Start-Sleep -Milliseconds 350
    $stateName = "$prefix-primary-selection-{0:D2}" -f ($i + 1)
    Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
    AssertCokCombatMenu $stateName $primaryProfile | Out-Null
  }
  if (-not (TestCokCombatSelection $stateName $primaryProfile $doneSpan[0] $doneSpan[1])) { throw "Member $Member primary cursor did not reach visible DONE within one complete row cycle." }
  Press @('enter') | Out-Null; Start-Sleep -Seconds 2
  $stateName = "$prefix-done-menu"
  Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
  $doneProfile = GetCokCombatMenuProfile $stateName
  if ($doneProfile -notin @('done', 'done_short')) { throw "Member $Member DONE did not reach a recognized Done menu, found $doneProfile" }
  # The five-item row is DELAY / QUIT / AUTO / SPEED / EXIT: AUTO is its third label.
  $autoSpan = if ($doneProfile -eq 'done_short') { @(178,240) } else { @(272,336) }
  for ($i = 0; $i -lt 6; $i++) {
    if (TestCokCombatSelection $stateName $doneProfile $autoSpan[0] $autoSpan[1]) { break }
    Press @('left') | Out-Null; Start-Sleep -Milliseconds 350
    $stateName = "$prefix-done-selection-{0:D2}" -f ($i + 1)
    Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
    AssertCokCombatMenu $stateName $doneProfile | Out-Null
  }
  if (-not (TestCokCombatSelection $stateName $doneProfile $autoSpan[0] $autoSpan[1])) { throw "Member $Member Done-menu cursor did not reach visible AUTO within one complete row cycle." }
  Press @('enter') | Out-Null; Start-Sleep -Seconds 3
  $stateName = "$prefix-auto-activated"
  Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
  # Quick-fight may end this character in Guarding while the engine advances an
  # opponent/other actor. Observe only; never press a key to escape Guarding.
  if (-not (GetCokCombatMenuProfile $stateName) -and (TestCokGuarding $stateName)) {
    $resumed = $false
    for ($wait = 1; $wait -le 10; $wait++) {
      Start-Sleep -Seconds 2
      $stateName = "$prefix-guarding-wait-{0:D2}" -f $wait
      Shot $stateName | Out-Null; Checkpoint $stateName | Out-Null; DumpAreaTrace $stateName | Out-Null
      if (GetCokCombatMenuProfile $stateName) { $resumed = $true; break }
      if (-not (TestCokGuarding $stateName)) { throw "Member $Member Guarding changed to an unclassified state; inspect $stateName" }
    }
    if (-not $resumed) { throw "Member $Member remained Guarding for 20 seconds; no input was sent." }
  }
  # Returning the current frame lets the next turn's entry gate wait safely through an enemy
  # phase. It also prevents the caller from assuming that six AUTO assignments finish combat.
  # AUTO ends the selected actor's phase; the next screenshot is normally a
  # visually similar primary row for the next manual party member. The caller
  # re-classifies that fresh row before it sends any further key.
  return $stateName
}
function Checkpoint([string]$Name) {
  # Bounded slices only. Their semantics remain intentionally unclaimed until a separate
  # runtime-to-DGROUP mapping identifies the live host memory.
  & python $runtimeProbe checkpoint --output $out --label $Name `
    --region lowram=0:0x10000 --region midram=0x20000:0x40000
  if ($LASTEXITCODE -ne 0) { throw "Runtime checkpoint failed: $Name" }
}
function DumpAreaTrace([string]$Name) {
  if (-not $TraceArea1) { return }
  & python $link dump-memory (Join-Path $out "$Name.ram") --start 0 --length 0x1000000
  if ($LASTEXITCODE -ne 0) { throw "GameLink full RAM dump failed: $Name" }
}

try {
  $probeArgs = @{
    DbxExe = $dbx
    GameDir = $runtimeGameDir
    Exe = 'START.EXE'
    OutDir = $out
    GameLink = $true
    ExtraSdlConf = 'mouse_emulation=always'
    NoInitialScreenshots = $true
  }
  if ($DebuggerPreAction.Count -gt 0) {
    if ($DebuggerPreAction[-1] -ne 'RUN') {
      throw '-DebuggerPreAction requires RUN as its final command so the retail route can begin.'
    }
    $probeArgs.DebuggerAction = $DebuggerPreAction
  } else {
    $probeArgs.RunDirect = $true
  }
  & $probe @probeArgs
  # The probe's optional Win32 PrintWindow capture can fail for a minimized SDL window while
  # GameLink itself is healthy. The owned process manifest, not that cosmetic capture result,
  # is the authoritative launch success signal here.
  $processManifest = Join-Path $out 'probe-process.json'
  if (-not (Test-Path -LiteralPath $processManifest -PathType Leaf)) { throw 'DOSBox-X launch produced no process manifest' }
  $ownedPid = [int](Get-Content -Raw $processManifest | ConvertFrom-Json).process_id
  Get-Process -Id $ownedPid | Out-Null

  # Let the retail SSI/Dragonlance credits settle.  They stop on their own; a single ENTER
  # then opens the function menu.  Entering sooner skips individual credit/title cards and
  # can make a later ENTER select Create New Character instead of Load Saved Game.
  # The BPINT bootstrap calibration needs two extra seconds for the packed CoK
  # title to settle before its first running-guest Enter. A host sleep after a
  # paced edge cannot advance a debugger-paused guest, so only this pre-input
  # delay is a valid paced timing boundary.
  Start-Sleep -Seconds $(if ($PacedDebuggerInput) { 42 } else { 40 })
  Press @('enter'); Start-Sleep -Seconds 3
  if ($FreeRunAfterInitialBpint) {
    WaitForCokFunctionMenu 'freerun-function-menu'
  }
  if ($PacedDebuggerInput) {
    # The BPINT surface exposes the title as a distinct input boundary. The
    # direct route's timed cursor presses used to race across it; acknowledge it
    # explicitly before applying the function-menu navigation below.
    Press @('enter')
  }
  # These three choices are intentionally individual GameLink transactions.  The original menu
  # redraw/debounces after a cursor change and can drop later keys from one batched request.
  Press @('down'); Start-Sleep -Milliseconds 400
  Press @('down'); Start-Sleep -Milliseconds 400
  Press @('enter'); Start-Sleep -Seconds 2
  if ($FreeRunAfterInitialBpint) {
    Shot 'freerun-load-game-prompt'
    AssertCokLoadGamePrompt 'freerun-load-game-prompt'
  }
  Press @('a', 'enter'); Start-Sleep -Seconds 2
  # This is the trace anchor: the selected retail save is fully resident but no opening/camp/menu
  # action has run.  Later snapshots may differ, so only this one must exact-match SAVGAMA.DAT.
  Shot 'loaded-party-menu'; Checkpoint 'loaded-party-menu'; DumpAreaTrace 'loaded-party-menu'
  if ($StopAfterLoadedParty) {
    if ($TraceArea1) {
      # The full GameLink dump was just taken at the one byte-identifiable
      # baseline. Validate it immediately rather than returning a raw blob the
      # caller must manually reinterpret; no debugger or guest pause is used.
      $baselineTraceArgs = @(
        $areaLocator,
        '--save', (Join-Path $runtimeGameDir 'SAVE\SAVGAMA.DAT'),
        '--ram', (Join-Path $out 'loaded-party-menu.ram'),
        '--word', '0x4bc3', '--word', '0x4bc4', '--word', '0x4be6',
        '--word', '0x4c26', '--word', '0x4c28', '--word', '0x4c29', '--word', '0x4c37', '--word', '0x4c5c', '--word', '0x4c7d',
        '--output', (Join-Path $out 'loaded-party-area1-trace.json')
      )
      & python @baselineTraceArgs
      if ($LASTEXITCODE -ne 0) { throw 'Loaded-party Area1 baseline did not produce one exact save match' }
    }
    Write-Host "[cok-outpost] stopped at loaded-party menu; output=$out"
    return
  }
  # A completed slot load initially leaves the native menu in its character-picker mode
  # (bottom row: PICK CHARACTER / SELECT / EXIT), even though the party roster is drawn.
  # Escape leaves that mode.  The following CHOOSE A FUNCTION menu starts on MODIFY
  # CHARACTER; five separately delivered Down edges select BEGIN ADVENTURING.  B is not a
  # live hotkey in this loaded-party context.
  Press @('esc'); Start-Sleep -Seconds 1
  Shot 'loaded-party-function-menu'; Checkpoint 'loaded-party-function-menu'; DumpAreaTrace 'loaded-party-function-menu'
  if (-not (TestCokFunctionMenu 'loaded-party-function-menu')) {
    throw 'Loading slot A did not leave PICK CHARACTER for the native CHOOSE A FUNCTION menu after Escape.'
  }
  PressRepeated 'down' 5 400
  Press @('enter')
  Start-Sleep -Seconds 3
  Shot 'opening-first-page'; Checkpoint 'opening-first-page'; DumpAreaTrace 'opening-first-page'
  # The opening artwork is visible before the retail overlay accepts its first acknowledgement.
  # Leave it settled before counting narrative pages; without this gap the early presses can be
  # discarded while it is still switching from the party menu.
  Start-Sleep -Seconds 3

  # Narrative length varies with the loaded party/state. Advance at most sixteen pages and prove
  # the real seven-command camp row before treating any following key as a camp command.
  $atOpeningCamp = $false
  for ($page = 1; $page -le 16; $page++) {
    Press @('enter'); Start-Sleep -Seconds 1
    $pageLabel = 'opening-ack-{0:D2}' -f $page
    Shot $pageLabel; Checkpoint $pageLabel; DumpAreaTrace $pageLabel
    if (TestCokOpeningCampMenu $pageLabel) {
      $atOpeningCamp = $true
      Copy-Item -LiteralPath (Join-Path $out "$pageLabel.png") -Destination (Join-Path $out 'opening-camp-menu.png')
      $pageRam = Join-Path $out "$pageLabel.ram"
      if (Test-Path -LiteralPath $pageRam -PathType Leaf) {
        Copy-Item -LiteralPath $pageRam -Destination (Join-Path $out 'opening-camp-menu.ram')
      }
      break
    }
  }
  if (-not $atOpeningCamp) { throw 'Opening narration did not reach the verified CoK camp command row within 16 acknowledgements.' }
  if ($ExitOpeningCamp) {
    # Literal E is a verified no-op here. Escape is the observed command that leaves
    # this camp row for the native destination menu.
    Press @('esc'); Start-Sleep -Seconds 2
    Shot 'opening-camp-exit'; Checkpoint 'opening-camp-exit'; DumpAreaTrace 'opening-camp-exit'
  }
  if ($EscapeOpeningCamp) {
    Press @('esc'); Start-Sleep -Seconds 2
    Shot 'opening-camp-escape'; Checkpoint 'opening-camp-escape'; DumpAreaTrace 'opening-camp-escape'
  }
  if ($ExitOpeningCamp -and $DestinationRightSteps -gt 0) {
      PressRepeated 'right' $DestinationRightSteps 350
      $destinationLabel = "destination-right-{0:D2}" -f $DestinationRightSteps
      Shot $destinationLabel; Checkpoint $destinationLabel; DumpAreaTrace $destinationLabel
      if ($ActivateDestination) {
        Press @('enter'); Start-Sleep -Seconds 2
        $arrivalLabel = "destination-right-{0:D2}-entered" -f $DestinationRightSteps
        Shot $arrivalLabel; Checkpoint $arrivalLabel; DumpAreaTrace $arrivalLabel
        for ($page = 1; $page -le $AcknowledgeDestinationPages; $page++) {
          Press @('enter'); Start-Sleep -Seconds 2
          $pageLabel = "destination-right-{0:D2}-page-{1:D2}" -f $DestinationRightSteps, $page
          Shot $pageLabel; Checkpoint $pageLabel; DumpAreaTrace $pageLabel
        }
        if ($DeclineVerifiedOutpost) {
          # The prompt visibly offers YES / NO and defaults to YES. One right selects NO; this
          # bounded operation records the map state before any movement is attempted.
          Press @('right'); Start-Sleep -Milliseconds 350
          Shot 'verified-outpost-no-selected'; Checkpoint 'verified-outpost-no-selected'; DumpAreaTrace 'verified-outpost-no-selected'
          Press @('enter'); Start-Sleep -Seconds 2
          Shot 'verified-outpost-declined'; Checkpoint 'verified-outpost-declined'; DumpAreaTrace 'verified-outpost-declined'
          if ($ActivateVerifiedOverlandDefault) {
            Press @('enter'); Start-Sleep -Seconds 2
            Shot 'verified-overland-default-enter'; Checkpoint 'verified-overland-default-enter'; DumpAreaTrace 'verified-overland-default-enter'
          }
          if ($SelectVerifiedOverlandMove) {
            Press @('left'); Start-Sleep -Seconds 2
            Shot 'verified-overland-left-selection'; Checkpoint 'verified-overland-left-selection'; DumpAreaTrace 'verified-overland-left-selection'
            if ($ActivateVerifiedOverlandMove) {
              Press @('enter'); Start-Sleep -Seconds 2
              Shot 'verified-overland-move-enter'; Checkpoint 'verified-overland-move-enter'; DumpAreaTrace 'verified-overland-move-enter'
              if ($MoveVerifiedOverlandEast) {
                Press @('right'); Start-Sleep -Seconds 2
                Shot 'verified-overland-east-step'; Checkpoint 'verified-overland-east-step'; DumpAreaTrace 'verified-overland-east-step'
                if ($AcknowledgeVerifiedOverlandEncounter) {
                  Press @('enter'); Start-Sleep -Seconds 2
                  Shot 'verified-overland-east-acknowledged'; Checkpoint 'verified-overland-east-acknowledged'; DumpAreaTrace 'verified-overland-east-acknowledged'
                  if ($EnterVerifiedCaravanCombat) {
                    Press @('enter'); Start-Sleep -Seconds 2
                    Shot 'verified-caravan-tactical-command'; Checkpoint 'verified-caravan-tactical-command'; DumpAreaTrace 'verified-caravan-tactical-command'
                    # Do not report a tactical boundary merely because the input sequence ended.
                    # This deterministic gate catches title/menu timing drift and a guest return to
                    # COMMAND.COM even when the optional Ollama vision gate is disabled.
                    $initialCombatProfile = GetCokCombatMenuProfile 'verified-caravan-tactical-command'
                    if ($initialCombatProfile -notin @('movement', 'primary', 'primary_short')) {
                      throw "Tactical entry did not show a recognized movement or primary combat menu; found $initialCombatProfile"
                    }
                    AssertVisible 'verified-caravan-tactical-command' @('DONE')
                    if ($AssignVerifiedCaravanAutoStatefully) {
                      $stateName = 'verified-caravan-tactical-command'
                      for ($member = 1; $member -le $StatefulCaravanAutoMembers; $member++) {
                        $stateName = AssignCokStatefulAuto $member $stateName
                      }
                      $elapsed = 0
                      $sample = 0
                      while ($elapsed -lt $ObserveStatefulCaravanAutoSeconds) {
                        $wait = [Math]::Min($ObserveStatefulCaravanAutoIntervalSeconds, $ObserveStatefulCaravanAutoSeconds - $elapsed)
                        Start-Sleep -Seconds $wait
                        $elapsed += $wait
                        $sample++
                        $observeLabel = 'verified-caravan-stateful-member-{0:D2}-auto-observe-{1:D2}-{2:D3}s' -f $StatefulCaravanAutoMembers, $sample, $elapsed
                        Shot $observeLabel; Checkpoint $observeLabel; DumpAreaTrace $observeLabel
                      }
                    }
                    if ($OpenVerifiedCaravanDoneMenu) {
                      Press @('d'); Start-Sleep -Seconds 2
                      Shot 'verified-caravan-done-menu'; Checkpoint 'verified-caravan-done-menu'; DumpAreaTrace 'verified-caravan-done-menu'
                      AssertVisible 'verified-caravan-done-menu' @('SPEED')
                      if ($ActivateVerifiedCaravanDoneDefault) {
                        Press @('enter'); Start-Sleep -Seconds 3
                        Shot 'verified-caravan-done-default-enter'; Checkpoint 'verified-caravan-done-default-enter'; DumpAreaTrace 'verified-caravan-done-default-enter'
                      }
                      if ($SelectVerifiedCaravanAuto) {
                        Press @('left'); Start-Sleep -Seconds 2
                        Shot 'verified-caravan-auto-selected'; Checkpoint 'verified-caravan-auto-selected'; DumpAreaTrace 'verified-caravan-auto-selected'
                        # Qwen's OCR can read the EGA AUTO glyph as MENU. Gate the stable Done-menu
                        # context here; the retained screenshot, not OCR, is the selection authority.
                        AssertVisible 'verified-caravan-auto-selected' @('SPEED')
                        AssertAutoPixelHighlight 'verified-caravan-auto-selected'
                        if ($ActivateVerifiedCaravanAuto) {
                          Press @('enter'); Start-Sleep -Seconds 3
                          Shot 'verified-caravan-auto-activated'; Checkpoint 'verified-caravan-auto-activated'; DumpAreaTrace 'verified-caravan-auto-activated'
                        }
                      }
                      if ($ProbeVerifiedCaravanA) {
                        Press @('a'); Start-Sleep -Seconds 3
                        Shot 'verified-caravan-literal-a'; Checkpoint 'verified-caravan-literal-a'; DumpAreaTrace 'verified-caravan-literal-a'
                        $elapsed = 0
                        $sample = 0
                        while ($elapsed -lt $ObserveVerifiedCaravanAutoSeconds) {
                          $wait = [Math]::Min($ObserveVerifiedCaravanAutoIntervalSeconds, $ObserveVerifiedCaravanAutoSeconds - $elapsed)
                          Start-Sleep -Seconds $wait
                          $elapsed += $wait
                          $sample++
                          $observeLabel = "verified-caravan-literal-a-observe-{0:D2}-{1:D3}s" -f $sample, $elapsed
                          Shot $observeLabel; Checkpoint $observeLabel; DumpAreaTrace $observeLabel
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  if ($TraceArea1) {
    $campTraceArgs = @(
      $areaLocator,
      '--save', (Join-Path $runtimeGameDir 'SAVE\SAVGAMA.DAT'),
      '--ram', (Join-Path $out 'loaded-party-menu.ram'),
      '--follow-ram', (Join-Path $out 'opening-first-page.ram'),
      '--follow-ram', (Join-Path $out 'opening-camp-menu.ram'),
      '--word', '0x4bc3', '--word', '0x4bc4', '--word', '0x4be6',
      '--word', '0x4c26', '--word', '0x4c28', '--word', '0x4c29', '--word', '0x4c37', '--word', '0x4c5c', '--word', '0x4c7d',
      '--output', (Join-Path $out 'area1-opening-camp-trace.json')
    )
    if ($ExitOpeningCamp) { $campTraceArgs += @('--follow-ram', (Join-Path $out 'opening-camp-exit.ram')) }
    if ($EscapeOpeningCamp) { $campTraceArgs += @('--follow-ram', (Join-Path $out 'opening-camp-escape.ram')) }
    if ($DestinationRightSteps -gt 0) {
      $campTraceArgs += @('--follow-ram', (Join-Path $out ("destination-right-{0:D2}.ram" -f $DestinationRightSteps)))
    }
    if ($ActivateDestination) {
      $campTraceArgs += @('--follow-ram', (Join-Path $out ("destination-right-{0:D2}-entered.ram" -f $DestinationRightSteps)))
      if ($AcknowledgeDestinationPages -gt 0) {
        foreach ($page in 1..$AcknowledgeDestinationPages) {
          $campTraceArgs += @('--follow-ram', (Join-Path $out ("destination-right-{0:D2}-page-{1:D2}.ram" -f $DestinationRightSteps, $page)))
        }
      }
      if ($DeclineVerifiedOutpost) {
        $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-outpost-no-selected.ram'))
        $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-outpost-declined.ram'))
        if ($ActivateVerifiedOverlandDefault) {
          $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-overland-default-enter.ram'))
        }
        if ($SelectVerifiedOverlandMove) {
          $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-overland-left-selection.ram'))
          if ($ActivateVerifiedOverlandMove) {
            $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-overland-move-enter.ram'))
            if ($MoveVerifiedOverlandEast) {
              $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-overland-east-step.ram'))
              if ($AcknowledgeVerifiedOverlandEncounter) {
                $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-overland-east-acknowledged.ram'))
                if ($EnterVerifiedCaravanCombat) {
                  $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-tactical-command.ram'))
                  if ($OpenVerifiedCaravanDoneMenu) {
                    $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-done-menu.ram'))
                    if ($ActivateVerifiedCaravanDoneDefault) {
                      $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-done-default-enter.ram'))
                    }
                    if ($SelectVerifiedCaravanAuto) {
                      $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-auto-selected.ram'))
                      if ($ActivateVerifiedCaravanAuto) {
                        $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-auto-activated.ram'))
                      }
                    }
                    if ($ProbeVerifiedCaravanA) {
                      $campTraceArgs += @('--follow-ram', (Join-Path $out 'verified-caravan-literal-a.ram'))
                      if ($ObserveVerifiedCaravanAutoSeconds -gt 0) {
                        $observed = 0
                        $sample = 0
                        while ($observed -lt $ObserveVerifiedCaravanAutoSeconds) {
                          $observed += [Math]::Min($ObserveVerifiedCaravanAutoIntervalSeconds, $ObserveVerifiedCaravanAutoSeconds - $observed)
                          $sample++
                          $campTraceArgs += @('--follow-ram', (Join-Path $out ("verified-caravan-literal-a-observe-{0:D2}-{1:D3}s.ram" -f $sample, $observed)))
                        }
                      }
                    }
                  }
                  if ($AssignVerifiedCaravanAutoStatefully) {
                    $statefulNames = @('verified-caravan-primary-after-movement-done', 'verified-caravan-stateful-done-menu', 'verified-caravan-stateful-auto-activated')
                    foreach ($selection in 1..6) {
                      $statefulNames += "verified-caravan-primary-selection-{0:D2}" -f $selection
                      $statefulNames += "verified-caravan-done-selection-{0:D2}" -f $selection
                    }
                    if ($ObserveStatefulCaravanAutoSeconds -gt 0) {
                      $observed = 0
                      $sample = 0
                      while ($observed -lt $ObserveStatefulCaravanAutoSeconds) {
                        $observed += [Math]::Min($ObserveStatefulCaravanAutoIntervalSeconds, $ObserveStatefulCaravanAutoSeconds - $observed)
                        $sample++
                        $statefulNames += 'verified-caravan-stateful-auto-observe-{0:D2}-{1:D3}s' -f $sample, $observed
                      }
                    }
                    foreach ($statefulName in $statefulNames) {
                      $statefulRam = Join-Path $out "$statefulName.ram"
                      if (Test-Path -LiteralPath $statefulRam -PathType Leaf) { $campTraceArgs += @('--follow-ram', $statefulRam) }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    & python @campTraceArgs
    if ($LASTEXITCODE -ne 0) { throw 'Opening-camp Area1 trace did not produce one exact baseline match' }
  }
  Write-Host "[cok-outpost] reached verified original opening camp menu; output=$out"
  return
} finally {
  if ($ownedPid -and -not $KeepOpen) {
    $proc = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $ownedPid
      Wait-Process -Id $ownedPid -Timeout 10 -ErrorAction SilentlyContinue
      Write-Host "[cok-outpost] stopped owned DOSBox-X pid=$ownedPid"
    }
  } elseif ($ownedPid) {
    Write-Host "[cok-outpost] leaving isolated owned DOSBox-X pid=$ownedPid open for a bounded GameLink observer"
  }
}
