<#
  Start a private native DOS Greybox session for a supported Gold Box layout.
  User assets are validated before they are copied into the persistent session.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$GamePath,
  [ValidateSet('Auto', 'CoK', 'DoK', 'Pool', 'Curse', 'Secret', 'SecretAmiga', 'Gateway', 'Treasures', 'PoD', 'NWN', 'Buck', 'Matrix', 'DQK', 'FRUA')][string]$Profile = 'Auto',
  [string]$SecretDosPath,
  [string]$DosBoxPath,
  [string]$SessionRoot,
  [switch]$PartyMenu,
  [switch]$Resume,
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
if ($Resume -and $PartyMenu) { throw 'Choose either -Resume or -PartyMenu.' }
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
if (-not $DosBoxPath) { $DosBoxPath = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe' }
. (Join-Path $native 'goldbox-profile-layout.ps1')

if ($Profile -eq 'SecretAmiga') {
  if ($PartyMenu) { throw 'SecretAmiga uses the supported DOS pregens; -PartyMenu is unavailable. No player session was created.' }
  if (-not (Test-Path -LiteralPath $DosBoxPath -PathType Leaf)) { throw "DOSBox was not found: $DosBoxPath" }
  . (Join-Path $native 'secret-player-session.ps1')
  $session = if ($Resume) {
    Get-ExistingSecretPlayerSession -AmigaSource $GamePath -DosSource $SecretDosPath -SessionRoot $SessionRoot -RequireContinuation
  } else { New-SecretPlayerSession -AmigaSource $GamePath -DosSource $SecretDosPath -SessionRoot $SessionRoot }
  & (Join-Path $native 'build.ps1') -Target all
  if ($LASTEXITCODE -ne 0) { throw 'Native engine build failed.' }
  New-Item -ItemType Directory -Force -Path $session.RuntimeMount | Out-Null
  # The all-target manifest names production tools, excluding fault probes
  # left beside them by native regression runs.
  $capacity=[IO.File]::ReadAllText((Join-Path $build 'native-capacity.json')) | ConvertFrom-Json
  foreach ($tool in $capacity.tools) {
    $name="$($tool.tool).COM"
    Copy-Item -LiteralPath (Join-Path $build $name) -Destination (Join-Path $session.RuntimeMount $name) -Force
  }
  $bootArgs=if ($Resume) { '/5 /! /A16 /9 1' } else { '/E /! /A16 /9 1' }
  $batch=Join-Path $session.RuntimeMount 'RUNGB.BAT'
  $status=Join-Path $session.RuntimeMount 'LAUNCH.OK';$failure=Join-Path $session.RuntimeMount 'LAUNCH.BAD'
@"
@echo off
if exist C:\LAUNCH.OK del C:\LAUNCH.OK
if exist C:\LAUNCH.BAD del C:\LAUNCH.BAD
D:
CD \DISK2
C:\GBBOOT $bootArgs
if errorlevel 1 goto failed
echo NATIVE_COMPLETE > C:\LAUNCH.OK
goto done
:failed
echo NATIVE_FAILURE > C:\LAUNCH.BAD
echo Greybox native launch failed. See the DOS output above.
:done
"@ | Set-Content -LiteralPath $batch -Encoding ASCII
  $conf=Join-Path $session.RuntimeMount 'RUN-GOLDBOX.CONF'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$($session.RuntimeMount)"
mount D "$($session.GameMount)"
call C:\RUNGB.BAT
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
  if ($PrepareOnly) {
    [pscustomobject]@{ Profile='SecretAmiga'; SourceRoot=$session.AmigaSourceRoot; SourceDirectory=$session.AmigaSourceRoot
      SecretDosPath=$session.DosSourceRoot; GameMount=$session.GameMount; GameMountPath=$session.GameMountPath
      RuntimeMount=$session.RuntimeMount; Conf=$conf; Batch=$batch; BootArgs=$bootArgs; GuestWorkingDirectory='D:\DISK2'
      CompletionMarker=$session.Marker; NativeSuccess=$status; NativeFailure=$failure }
    return
  }
  . (Join-Path $native 'dosbox-smoke.ps1')
  $process=Start-DosBoxSmoke -Dosbox $DosBoxPath -Conf $conf -Visible -KeepConfCycles
  Write-Host "Greybox SecretAmiga is running in DOSBox (PID $($process.Id))."
  Write-Host "Player session: $($session.GameMount)"
  Write-Host "Native completion/failure markers: $status ; $failure"
  return
}
if ($SecretDosPath) { throw '-SecretDosPath is supported only with explicit -Profile SecretAmiga. No player session was created.' }

function Test-RequiredFiles([string]$Base, [string[]]$Required) {
  foreach ($relative in $Required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Base $relative) -PathType Leaf)) { return $false }
  }
  return $true
}

function Resolve-GoldBoxProfile([string]$Source, [string]$Requested) {
  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Game directory was not found: $Source"
  }
  $sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
  # Keep these title-specific. GBBOOT can make a best-effort generic DAX
  # guess, but a player session must prove a title marker (or the verified
  # Buck data signature) plus the ECL/GEO pair that the native /E route opens.
  $profiles = Get-GoldBoxProfileLayouts
  $candidates = foreach ($profile in $profiles) {
    [pscustomobject]@{ Name = $profile.Name; RelativePath = ''; Required = $profile.Required }
    foreach ($wrapper in @($profile.Folder, "GAME\$($profile.Folder)") + $profile.LegacyWrappers) {
      [pscustomobject]@{ Name = $profile.Name; RelativePath = $wrapper; Required = $profile.Required }
    }
  }
  $matches = foreach ($candidate in $candidates) {
    $directory = if ($candidate.RelativePath) { Join-Path $sourceRoot $candidate.RelativePath } else { $sourceRoot }
    if ((Test-Path -LiteralPath $directory -PathType Container) -and
        (Test-RequiredFiles -Base $directory -Required $candidate.Required)) {
      [pscustomobject]@{ Profile = $candidate.Name; SourceRoot = $sourceRoot; RelativePath = $candidate.RelativePath; SourceDirectory = $directory }
    }
  }
  $profileCount = @($matches.Profile | Sort-Object -Unique).Count
  if ($Requested -ne 'Auto') { $matches = @($matches | Where-Object { $_.Profile -eq $Requested }) }
  if ($matches.Count -ne 1) {
    $expected = if ($Requested -eq 'Auto') { 'a supported Gold Box title layout and its required files' } else { $Requested }
    throw "Unsupported or ambiguous Gold Box layout under '$sourceRoot'; expected $expected required files. No player session was created."
  }
  $matches[0] | Add-Member -NotePropertyName LibraryProfileCount -NotePropertyValue $profileCount
  return $matches[0]
}

# The profile is resolved before New-PlayerSession can copy anything.
$resolved = Resolve-GoldBoxProfile -Source $GamePath -Requested $Profile
if ($Resume -and $resolved.Profile -notin @('CoK', 'DoK')) {
  throw "Resume is unavailable for $($resolved.Profile): its checkpoint contract is not validated. Supported profiles: CoK, DoK. No player session was created."
}
if (-not (Test-Path -LiteralPath $DosBoxPath -PathType Leaf)) { throw "DOSBox was not found: $DosBoxPath" }
. (Join-Path $native 'retail-stage.ps1')
$gameMount = New-PlayerSession -Source $resolved.SourceRoot -SessionRoot $SessionRoot
$gameMountPath = if ($resolved.RelativePath) { Join-Path $gameMount $resolved.RelativePath } else { $gameMount }
if ($Resume -and -not (Test-Path -LiteralPath (Join-Path $gameMountPath 'GREYBOX.GBS') -PathType Leaf)) {
  throw "No checkpoint found in $gameMountPath. Save before using -Resume."
}

& (Join-Path $native 'build.ps1') -Target engine
if ($LASTEXITCODE -ne 0) { throw 'Native engine build failed.' }
# Preserve the established GREYBOX runtime for a single-title source. A shared
# library gets one C: runtime per resolved title, isolating writable sidecars.
$runtimeRoot = Join-Path $gameMount 'GREYBOX'
# The layout is chosen ONCE per (session, profile) and persisted in a sibling
# marker. Re-deciding from LibraryProfileCount on every launch moved a title's
# runtime (orphaning its _GB* sidecars) when a second title joined the library.
# 'flat' = GREYBOX, 'profiled' = GREYBOX\<Profile>.
$layoutMarker = "$gameMount.layout.$($resolved.Profile)"
if (Test-Path -LiteralPath $layoutMarker -PathType Leaf) {
  $layout = ([IO.File]::ReadAllText($layoutMarker)).Trim()
  if ($layout -notin @('flat', 'profiled')) { throw "Corrupt runtime layout marker: $layoutMarker" }
} else {
  # Unmarked session: migrate deliberately. An existing runtime stays where it
  # lives; only a fresh runtime follows the current library shape.
  $flatExists = Test-Path -LiteralPath (Join-Path $runtimeRoot 'GBBOOT.COM') -PathType Leaf
  $otherFlatOwner = @(Get-ChildItem -LiteralPath (Split-Path -Parent $gameMount) -Filter ((Split-Path -Leaf $gameMount) + '.layout.*') -File -ErrorAction SilentlyContinue |
    Where-Object { ([IO.File]::ReadAllText($_.FullName)).Trim() -eq 'flat' }).Count -gt 0
  if (Test-Path -LiteralPath (Join-Path $runtimeRoot $resolved.Profile) -PathType Container) { $layout = 'profiled' }
  elseif ($flatExists -and -not $otherFlatOwner) { $layout = 'flat' }
  elseif ($resolved.LibraryProfileCount -gt 1 -or $otherFlatOwner -or $flatExists) { $layout = 'profiled' }
  else { $layout = 'flat' }
  [IO.File]::WriteAllText($layoutMarker, $layout)
}
$runtimeMount = if ($layout -eq 'profiled') { Join-Path $runtimeRoot $resolved.Profile } else { $runtimeRoot }
New-Item -ItemType Directory -Force $runtimeMount | Out-Null
Get-ChildItem -LiteralPath $build -File | Where-Object { $_.Extension -in @('.COM', '.GBM') } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $runtimeMount $_.Name) -Force
}

$bootArgs = if ($Resume) { '/5 /!' } else { '/E /!' }
$changeDirectory = if ($resolved.RelativePath) { "CD \{0}" -f $resolved.RelativePath } else { '' }
$conf = Join-Path $runtimeMount 'RUN-GOLDBOX.CONF'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$runtimeMount"
mount D "$gameMount"
D:
$changeDirectory
C:\GBBOOT $bootArgs
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII

if ($PrepareOnly) {
  [pscustomobject]@{
    Profile = $resolved.Profile; SourceRoot = $resolved.SourceRoot; SourceDirectory = $resolved.SourceDirectory
    GameMount = $gameMount; GameMountPath = $gameMountPath; RuntimeMount = $runtimeMount; Conf = $conf; BootArgs = $bootArgs
  }
  return
}
. (Join-Path $native 'dosbox-smoke.ps1')
$process = Start-DosBoxSmoke -Dosbox $DosBoxPath -Conf $conf -Visible -KeepConfCycles
Write-Host "Greybox $($resolved.Profile) is running in DOSBox (PID $($process.Id))."
Write-Host "Player session: $gameMount"
Write-Host 'Use arrows to explore, G to switch available graphics, and Esc to leave the view.'
