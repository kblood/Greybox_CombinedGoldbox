# capture_gen1_demo.ps1 -- bounded native attract-demo recorder.
#
# Launches an owned DOSBox-X DEBUGBOX/GameLink session, selects the title's real
# Demo hotkey, retains only changed framebuffers, logs DOS file activity, and
# snapshots physical RAM at a fixed cadence.  All guest input is delivered through
# tools/dosbox_gamelink.py; this script never focuses a window or uses host SendKeys.

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet(
    'champions-of-krynn',
    'curse-of-the-azure-bonds',
    'death-knights-of-krynn',
    'gateway-to-the-savage-frontier',
    'pools-of-darkness',
    'secret-of-the-silver-blades',
    'treasures-of-the-savage-frontier'
  )]
  [string]$Profile,
  [ValidateRange(10,1800)][int]$DurationSeconds = 260,
  [ValidateRange(1,30)][int]$FrameIntervalSeconds = 2,
  [ValidateRange(5,300)][int]$RamIntervalSeconds = 30,
  [ValidateRange(1,60)][int]$TitleWaitSeconds = 8,
  [string]$OutDir = '',
  [string]$GameDir = '',
  [ValidatePattern('^(AUTO|[A-Za-z0-9_.\\-]+(?: [A-Za-z0-9_.\\-]+){0,4})$')][string]$Exe = 'AUTO'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$profileRoots = @{
  'champions-of-krynn' = (Join-Path $repo 'Champions of Krynn')
  'death-knights-of-krynn' = (Join-Path $repo 'Death Knights of Krynn')
  'curse-of-the-azure-bonds' = 'C:\Program Files (x86)\GOG Galaxy\Games\Curse of the Azure Bonds'
  'secret-of-the-silver-blades' = 'C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades'
  'gateway-to-the-savage-frontier' = 'C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier'
  'pools-of-darkness' = 'C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness'
  'treasures-of-the-savage-frontier' = 'C:\Program Files (x86)\GOG Galaxy\Games\Treasures of the Savage Frontier'
}
$profileCommands = @{
  'champions-of-krynn' = 'START.EXE'
  'death-knights-of-krynn' = 'START.EXE'
  'curse-of-the-azure-bonds' = 'START.EXE'
  'secret-of-the-silver-blades' = 'START.EXE'
  'gateway-to-the-savage-frontier' = 'GAME.EXE UseStart'
  # STARTUP.EXE/START.BAT chainloads VACE and changes the debugger window title,
  # breaking the owned DEBUGBOX/GameLink session.  These are the retail startup
  # arguments used by both late Gen1 games and bypass that wrapper cleanly.
  'pools-of-darkness' = 'GAME.EXE 2 2 Helm'
  'treasures-of-the-savage-frontier' = 'GAME.EXE 2 2 Helm'
}

function Resolve-TaskPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$game = Resolve-TaskPath $(if ($GameDir) { $GameDir } else { $profileRoots[$Profile] })
$guestCommand = if ($Exe -eq 'AUTO') { $profileCommands[$Profile] } else { $Exe }
$guestExecutable = $guestCommand.Split(' ', 2)[0]
if (-not (Test-Path -LiteralPath $game -PathType Container)) {
  throw "Game directory not found for $Profile`: $game (override with -GameDir)"
}
if (-not (Test-Path -LiteralPath (Join-Path $game $guestExecutable) -PathType Leaf)) {
  throw "Executable not found: $(Join-Path $game $guestExecutable)"
}

$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$out = Resolve-TaskPath $(if ($OutDir) { $OutDir } else { "build\native-demo-$Profile-$stamp" })
if (Test-Path -LiteralPath $out) { throw "Output directory already exists: $out" }

$foreign = @(Get-Process dosbox-x -ErrorAction SilentlyContinue)
if ($foreign.Count -gt 0) {
  throw "GameLink singleton is already owned by DOSBox-X pid(s): $($foreign.Id -join ',')"
}

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
foreach ($required in @($dbx, $probe, $gameLink)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required tool not found: $required" }
}

New-Item -ItemType Directory -Path $out | Out-Null
$frames = [Collections.Generic.List[object]]::new()
$ram = [Collections.Generic.List[object]]::new()
$ownedPid = $null
$captureStatus = 'running'
$failure = $null
$startedUtc = [DateTime]::UtcNow

try {
  & $probe -DbxExe $dbx -GameDir $game -Exe $guestCommand -OutDir $out -GameLink `
    -DebuggerAction @('RUN') -NoInitialScreenshots -NoActionScreenshots `
    -DosLogFile (Join-Path $out 'dos-files.log')
  if (-not $?) { throw 'DOSBox-X probe launch failed' }

  $processMetadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $ownedPid = [int]$processMetadata.process_id
  Get-Process -Id $ownedPid | Out-Null

  Start-Sleep -Seconds $TitleWaitSeconds
  & python $gameLink press d --pace 0.25 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'GameLink Demo keypress failed' }

  $lastFrameHash = ''
  $nextRamSecond = 0
  for ($second = 0; $second -le $DurationSeconds; $second += $FrameIntervalSeconds) {
    if (-not (Get-Process -Id $ownedPid -ErrorAction SilentlyContinue)) {
      throw "Owned DOSBox-X pid $ownedPid exited at t=$second"
    }

    $frameName = 'frame-t{0:D4}.png' -f $second
    $framePath = Join-Path $out $frameName
    & python $gameLink screenshot $framePath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed at t=$second" }
    $frameHash = (Get-FileHash -LiteralPath $framePath -Algorithm SHA256).Hash
    if ($frameHash -eq $lastFrameHash -and $second -ne 0) {
      # Exact generated file inside this newly-created output directory only.
      Remove-Item -LiteralPath $framePath
    } else {
      $lastFrameHash = $frameHash
      $frames.Add([ordered]@{
        second = $second
        file = $frameName
        sha256 = $frameHash.ToLowerInvariant()
      }) | Out-Null
      Write-Host "[demo-capture] changed frame t=$second $frameName"
    }

    if ($second -ge $nextRamSecond) {
      $ramName = 'ram-t{0:D4}.bin' -f $second
      $ramPath = Join-Path $out $ramName
      & python $gameLink dump-memory $ramPath --start 0 --length 0x100000 | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "GameLink RAM dump failed at t=$second" }
      $ramHash = (Get-FileHash -LiteralPath $ramPath -Algorithm SHA256).Hash
      $ram.Add([ordered]@{
        second = $second
        file = $ramName
        start = 0
        length = 0x100000
        sha256 = $ramHash.ToLowerInvariant()
      }) | Out-Null
      Write-Host "[demo-capture] RAM checkpoint t=$second $ramName"
      $nextRamSecond += $RamIntervalSeconds
    }

    if ($second -lt $DurationSeconds) { Start-Sleep -Seconds $FrameIntervalSeconds }
  }
  $captureStatus = 'complete'
} catch {
  $captureStatus = 'failed'
  $failure = $_.Exception.Message
  throw
} finally {
  if ($ownedPid) {
    $owned = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
    if ($owned) {
      Stop-Process -Id $ownedPid
      Wait-Process -Id $ownedPid -Timeout 10 -ErrorAction SilentlyContinue
    }
  }

  $manifest = [ordered]@{
    schema_version = 1
    profile_id = $Profile
    game_dir = $game
    guest_command = $guestCommand
    started_utc = $startedUtc.ToString('o')
    finished_utc = [DateTime]::UtcNow.ToString('o')
    status = $captureStatus
    error = $failure
    input_mechanism = 'GameLink v4 shared memory'
    demo_key = 'd'
    duration_seconds = $DurationSeconds
    frame_interval_seconds = $FrameIntervalSeconds
    ram_interval_seconds = $RamIntervalSeconds
    frames = $frames
    ram_checkpoints = $ram
    dos_file_log = 'dos-files.log'
    claim_boundary = 'Full RAM is captured while free-running; CS:IP/register-to-segment attribution requires a separate breakpoint census.'
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'manifest.json') -Encoding utf8
  Write-Host "[demo-capture] status=$captureStatus output=$out"
}
