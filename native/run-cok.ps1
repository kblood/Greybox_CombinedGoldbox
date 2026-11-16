<#
  Launch Champions of Krynn in a visible DOSBox session using Greybox's native
  DOS assembly engine. Player session and game-state files are written under a
  persistent player-session snapshot, separate from native\build test output.

  The game data is mounted as a persistent PLAYER SESSION SNAPSHOT
  (native\player-sessions by default), never the retail folder or the shared
  native\build\_retail test mirror. The source is copied only for the first
  launch, so later player saves cannot be replaced by a source refresh.

  Usage from the repository root:
    .\native\run-cok.ps1
    .\native\run-cok.ps1 -Resume

  At the Greybox first-person view: arrow keys move/turn, G switches the
  available graphics set, and Esc exits the view. DOSBox closes when GBBOOT
  exits. The native route is a work-in-progress vertical slice, not the retail
  CoK executable or a full campaign implementation.
#>
[CmdletBinding()]
param(
  [string]$GamePath,
  [string]$DosBoxPath,
  [string]$SessionRoot,
  [switch]$PartyMenu,
  [switch]$Resume,
  # Prepare the private C: runtime and DOSBox configuration, then return
  # their paths without opening the interactive player window.  This keeps
  # the launcher contract verifiable by unattended regression tests.
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
if ($Resume -and $PartyMenu) { throw 'Choose either -Resume or -PartyMenu.' }
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
if (-not $GamePath) { $GamePath = Join-Path $root 'Champions of Krynn' }
if (-not $DosBoxPath) { $DosBoxPath = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe' }
# Mount a persistent player snapshot, never the retail release itself:
# `mount D "$GamePath"` followed by `D:` makes the source folder the DOS
# child's current drive, so its stray writes would otherwise land in retail
# assets. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$gameMount = New-PlayerSession -Source $GamePath -SessionRoot $SessionRoot

foreach ($required in @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  if (-not (Test-Path (Join-Path $GamePath $required))) {
    throw "CoK game data is missing $required under: $GamePath"
  }
}
if (-not (Test-Path $DosBoxPath)) {
  throw "DOSBox was not found: $DosBoxPath"
}
if ($Resume -and -not (Test-Path -LiteralPath (Join-Path $gameMount 'GREYBOX.GBS') -PathType Leaf)) {
  throw "No camp checkpoint found in $gameMount. Save with S in CoK camp before using -Resume."
}

& (Join-Path $native 'build.ps1') -Target engine
if ($LASTEXITCODE -ne 0) { throw 'Native engine build failed' }

# The player snapshot owns both mounted drives.  Keeping C: under the session
# prevents its helpers and _GB* sidecars from racing the shared native\build
# flow fixtures or another player's session.  Refresh executable/music assets
# on launch, but never replace the session's game data or state files.
$runtimeMount = Join-Path $gameMount 'GREYBOX'
New-Item -ItemType Directory -Force $runtimeMount | Out-Null
Get-ChildItem -LiteralPath $build -File | Where-Object {
  $_.Extension -in @('.COM', '.GBM')
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $runtimeMount $_.Name) -Force
}

$conf = Join-Path $runtimeMount 'RUN-COK.CONF'
$bootArgs = if ($Resume) {
  '/5 /!'
} elseif ($PartyMenu) {
  '/E /!'
} else {
  # A fresh player session reaches CCPARTY's native Begin/Create gate. Existing
  # imported and native-created GBPR rosters are loaded there before exploration.
  '/E /!'
}
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
C:\GBBOOT $bootArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

if ($PrepareOnly) {
  [pscustomobject]@{
    GameMount = $gameMount
    RuntimeMount = $runtimeMount
    Conf = $conf
    BootArgs = $bootArgs
  }
  return
}

. (Join-Path $native 'dosbox-smoke.ps1')
$process = Start-DosBoxSmoke -Dosbox $DosBoxPath -Conf $conf -Visible -KeepConfCycles
Write-Host "Greybox CoK is running in DOSBox (PID $($process.Id))."
Write-Host "Player session: $gameMount"
Write-Host 'Use arrow keys to explore, G for graphics, C for camp, and Esc to leave the view.'
Write-Host 'In camp: R rests eight hours, S saves, and X leaves camp.'
if ($Resume) {
  Write-Host "Resuming camp from $(Join-Path $gameMount 'GREYBOX.GBS')."
} elseif ($PartyMenu) {
  Write-Host 'The native [B]egin/[C]reate party gate is enabled.'
} else {
  Write-Host 'For a new session, create characters with C, then press B to begin adventuring.'
}
