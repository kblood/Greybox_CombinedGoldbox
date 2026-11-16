param(
  [string]$DbxExe = "build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe",
  [Parameter(Mandatory)][string]$StageDir,
  [string]$DosWorkingDir = '.',
  [string]$Exe = 'START.EXE',
  [ValidatePattern('^[A-J]$')][string]$SaveSlot = 'A',
  [Parameter(Mandatory)][string]$OutDir,
  # CoK's retail SSI/Dragonlance credit sequence needs roughly 40 seconds to
  # settle before the title menu accepts deterministic GameLink input.
  [ValidateRange(1,60)][int]$BootWaitSec = 10,
  [ValidateRange(0,10)][int]$StartupAdvanceCount = 0,
  [string]$LoadMenuKeys = 'L',
  [ValidateRange(1,30)][int]$SlotMenuWaitSec = 2,
  [string]$SlotSelectKeys = '{ENTER}',
  [ValidateRange(1,30)][int]$LoadWaitSec = 6,
  [string]$PostLoadKeys = '',
  [ValidateRange(1,30)][int]$PostLoadWaitSec = 6,
  [switch]$PostLoadCaptureEach,
  [switch]$DumpRam,
  [switch]$RequireReferencedSidecars,
  [switch]$UseHostInput,
  [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dbx = (Resolve-Path (Join-Path $repo $DbxExe)).Path
$stage = (Resolve-Path (Join-Path $repo $StageDir)).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }

$saveName = "SAVGAM$SaveSlot.DAT"
$saveCopies = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Filter $saveName)
if ($saveCopies.Count -lt 1) { throw "expected at least one $saveName below stage" }
$saveHashes = @($saveCopies | ForEach-Object {
  (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | Sort-Object -Unique)
if ($saveHashes.Count -ne 1) {
  throw "all $saveName copies must be byte-identical; found hashes: $($saveHashes -join ', ')"
}
$saveHash = $saveHashes[0]
if ($RequireReferencedSidecars) {
  $saveText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($saveCopies[0].FullName))
  $sidecarNames = @([regex]::Matches($saveText, 'CHRDATA[A-Z0-9]+') | ForEach-Object Value | Sort-Object -Unique)
  if ($sidecarNames.Count -eq 0) { throw 'save contains no CHRDATA sidecar references' }
  foreach ($saveCopy in $saveCopies) {
    foreach ($sidecarName in $sidecarNames) {
      $sidecarPath = Join-Path $saveCopy.DirectoryName ($sidecarName + '.SAV')
      if (-not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)) {
        throw "missing referenced sidecar beside $($saveCopy.FullName): $sidecarPath"
      }
    }
  }
}

$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$process = $null

function Convert-ToGuestKeys([string]$Keys) {
  $tokens = @([regex]::Matches($Keys, '\{[^}]+\}|.') | ForEach-Object Value)
  if ($tokens.Count -eq 0) { throw 'key sequence contains no tokens' }
  return @($tokens | ForEach-Object {
    $key = $_.Trim('{', '}').ToLowerInvariant()
    if ($key -eq 'return') { 'enter' } else { $key }
  })
}

$loadMenuTokens = @(Convert-ToGuestKeys $LoadMenuKeys)
$slotSelectTokens = @(Convert-ToGuestKeys $SlotSelectKeys)
$postLoadTokens = if ($PostLoadKeys) { @(Convert-ToGuestKeys $PostLoadKeys) } else { @() }
try {
  $probeArgs = @{
    DbxExe = $dbx
    GameDir = $stage
    DosWorkingDir = $DosWorkingDir
    Exe = $Exe
    OutDir = $out
    Cycles = 'fixed 25000'
    NoActionScreenshots = $true
  }
  if ($UseHostInput) {
    $probeArgs.DebuggerAction = @('RUN')
  } else {
    $probeArgs.RunDirect = $true
    $probeArgs.GameLink = $true
  }
  & $probe @probeArgs
  if (-not $?) { throw 'DOSBox-X launcher probe failed' }

  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  if ($UseHostInput) {
    $renderRecord = @($metadata.windows | Where-Object role -eq 'render')
    if ($renderRecord.Count -ne 1) { throw 'expected one DOSBox-X render window' }
    $renderHwnd = [IntPtr]([int64]$renderRecord[0].hwnd)
    . (Join-Path $repo 'tools\dosbot\lib.ps1')
  }

  function Send-GuestKeys([string[]]$Keys, [double]$PaceSec = 0.0) {
    if ($UseHostInput) {
      foreach ($key in $Keys) {
        Send-DosKeys -Hwnd $renderHwnd -Keys ('{' + $key.ToUpperInvariant() + '}')
        if ($PaceSec -gt 0) { Start-Sleep -Milliseconds ([int]($PaceSec * 1000)) }
      }
    } else {
      & python $gameLink press @Keys --pace $PaceSec
      if ($LASTEXITCODE -ne 0) { throw "GameLink input failed: $LASTEXITCODE" }
    }
  }

  function Capture-GuestFrame([string]$Name) {
    $path = Join-Path $out $Name
    if ($UseHostInput) {
      Capture-DosboxPrintWindow -Hwnd $renderHwnd -OutPng $path | Out-Null
    } else {
      & python $gameLink screenshot $path
      if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $LASTEXITCODE" }
    }
  }

  function Capture-GuestRam([string]$Name) {
    if (-not $DumpRam) { return }
    if ($UseHostInput) { throw '-DumpRam requires GameLink input' }
    & python $gameLink dump-memory (Join-Path $out $Name) --start 0 --length 0x100000
    if ($LASTEXITCODE -ne 0) { throw "GameLink RAM dump failed: $LASTEXITCODE" }
  }

  Start-Sleep -Seconds $BootWaitSec
  for ($advance = 0; $advance -lt $StartupAdvanceCount; $advance++) {
    Send-GuestKeys @('esc')
    Start-Sleep -Seconds 2
    Capture-GuestFrame ('save_load_startup_{0:D2}.png' -f $advance)
  }
  Capture-GuestFrame 'save_load_00_boot.png'
  Capture-GuestRam 'save_load_00_boot.ram'
  Send-GuestKeys $loadMenuTokens 0.75
  Start-Sleep -Seconds $SlotMenuWaitSec
  Capture-GuestFrame 'save_load_01_slot_menu.png'
  Capture-GuestRam 'save_load_01_slot_menu.ram'
  Send-GuestKeys @($SaveSlot.ToLowerInvariant())
  Start-Sleep -Milliseconds 750
  Send-GuestKeys $slotSelectTokens 0.75
  Start-Sleep -Seconds $LoadWaitSec
  Capture-GuestFrame 'save_load_02_after.png'
  Capture-GuestRam 'save_load_02_after.ram'
  if ($postLoadTokens.Count -gt 0) {
    if ($PostLoadCaptureEach) {
      for ($postIndex = 0; $postIndex -lt $postLoadTokens.Count; $postIndex++) {
        Send-GuestKeys @($postLoadTokens[$postIndex])
        Start-Sleep -Milliseconds 750
        Capture-GuestFrame ('save_load_03_step_{0:D2}.png' -f $postIndex)
      }
    } else {
      Send-GuestKeys $postLoadTokens 0.75
    }
    Start-Sleep -Seconds $PostLoadWaitSec
    Capture-GuestFrame 'save_load_03_post_load.png'
    Capture-GuestRam 'save_load_03_post_load.ram'
  }

  [ordered]@{
    schema_version = 1
    title = 'Gen1 original-DOS save-load probe'
    stage = $stage
    executable = $Exe
    dos_working_directory = $DosWorkingDir
    load_menu_keys = $LoadMenuKeys
    slot_select_keys = $SlotSelectKeys
    input_mechanism = if ($UseHostInput) { 'Windows SendInput (focus-taking fallback)' } else { 'DOSBox-X GameLink v4 shared memory' }
    save = [ordered]@{
      filename = $saveName
      size = $saveCopies[0].Length
      sha256 = $saveHash
      copies = @($saveCopies | ForEach-Object {
        [IO.Path]::GetRelativePath($stage, $_.FullName).Replace('\', '/')
      } | Sort-Object)
    }
    screenshots = @('save_load_00_boot.png', 'save_load_01_slot_menu.png', 'save_load_02_after.png')
    screenshot_sha256 = [ordered]@{
      save_load_00_boot = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_00_boot.png') -Algorithm SHA256).Hash.ToLowerInvariant()
      save_load_01_slot_menu = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_01_slot_menu.png') -Algorithm SHA256).Hash.ToLowerInvariant()
      save_load_02_after = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_02_after.png') -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    ram_sha256 = if ($DumpRam) {
      [ordered]@{
        save_load_00_boot = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_00_boot.ram') -Algorithm SHA256).Hash.ToLowerInvariant()
        save_load_01_slot_menu = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_01_slot_menu.ram') -Algorithm SHA256).Hash.ToLowerInvariant()
        save_load_02_after = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_02_after.ram') -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    } else { $null }
    post_load = if ($postLoadTokens.Count -gt 0) {
      [ordered]@{
        keys = $PostLoadKeys
        capture_each = [bool]$PostLoadCaptureEach
        screenshot = 'save_load_03_post_load.png'
        screenshot_sha256 = (Get-FileHash -LiteralPath (Join-Path $out 'save_load_03_post_load.png') -Algorithm SHA256).Hash.ToLowerInvariant()
        ram = if ($DumpRam) { 'save_load_03_post_load.ram' } else { $null }
        ram_sha256 = if ($DumpRam) { (Get-FileHash -LiteralPath (Join-Path $out 'save_load_03_post_load.ram') -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
      }
    } else { $null }
    claim_boundary = 'proves only the visible result of loading a hash-identified save copy; no ECL, GEO, or combat handler is inferred'
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'save-load-probe.json') -Encoding utf8
} finally {
  if ($process -and -not $KeepRunning -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
