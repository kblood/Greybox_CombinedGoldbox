# probe_cok_completed_save_step.ps1 -- strict, GameLink-only native CoK completed-save movement probe.
#
# Loads an isolated copy of a supplied CoK save through the retail UI, enters the observed command
# loop, uses the reproduced Move-menu/cancel handshake, then sends keypad-forward once. It captures
# screenshots and full Area1 snapshots and FAILS unless the native minute slot advances by exactly one.
# No retail source file or guest RAM is written.

param(
  [Parameter(Mandatory = $true)][string]$GameDir,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [ValidateRange(0.05, 2.0)][double]$PaceSeconds = 0.35
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$route = Join-Path $PSScriptRoot 'cok_gamelink_saved_outpost_route.ps1'
$link = Join-Path $PSScriptRoot 'dosbox_gamelink.py'
$locator = Join-Path $PSScriptRoot 'locate_coab_area1_in_ram.py'
$game = [IO.Path]::GetFullPath($GameDir)
$out = [IO.Path]::GetFullPath($OutDir)
$sourceSave = Join-Path $game 'SAVE\SAVGAMA.DAT'

foreach ($path in @($route, $link, $locator, $sourceSave)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required file not found: $path" }
}
if (Test-Path -LiteralPath $out) { throw "Refusing to overwrite existing output directory: $out" }
if (Get-Process dosbox-x -ErrorAction SilentlyContinue) { throw 'GameLink is a singleton; stop the existing DOSBox-X session first.' }

$sourceHashBefore = (Get-FileHash -LiteralPath $sourceSave -Algorithm SHA256).Hash
$ownedPid = $null
function Press([string]$Key) {
  & python $link press $Key --pace $PaceSeconds --hold 0.05
  if ($LASTEXITCODE -ne 0) { throw "GameLink key injection failed: $Key" }
}
function Shot([string]$Name) {
  & python $link screenshot (Join-Path $out "$Name.png")
  if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $Name" }
}
function Dump([string]$Name) {
  & python $link dump-memory (Join-Path $out "$Name.ram") --start 0 --length 0x1000000
  if ($LASTEXITCODE -ne 0) { throw "GameLink RAM dump failed: $Name" }
}

try {
  & $route -GameDir $game -OutDir $out -KeepOpen -StopAfterLoadedParty -TraceArea1 -PaceSeconds $PaceSeconds
  $ownedPid = [int](Get-Content -Raw (Join-Path $out 'probe-process.json') | ConvertFrom-Json).process_id
  Get-Process -Id $ownedPid | Out-Null

  # Retail redraw/debounce requires individually paced navigation to BEGIN ADVENTURING.
  for ($i = 0; $i -lt 5; $i++) { Press 'down'; Start-Sleep -Milliseconds 500 }
  Press 'enter'; Start-Sleep -Seconds 4
  Shot 'command-loop'; Dump 'command-loop'

  # Reproduced native handshake: open the visible Move command, cancel it, then use keypad-forward.
  # It is not treated as a semantic claim; the Area1 assertion below is the acceptance condition.
  Press 'm'; Start-Sleep -Seconds 1
  Shot 'move-menu'
  Press 'esc'; Start-Sleep -Seconds 1
  Press 'kp_8'; Start-Sleep -Seconds 3
  Shot 'after-keypad-forward'; Dump 'after-keypad-forward'

  $tracePath = Join-Path $out 'area1-step-trace.json'
  & python $locator --save (Join-Path $out 'runtime-game\SAVE\SAVGAMA.DAT') `
    --ram (Join-Path $out 'loaded-party-menu.ram') `
    --follow-ram (Join-Path $out 'command-loop.ram') `
    --follow-ram (Join-Path $out 'after-keypad-forward.ram') `
    --word 0x4bc3 --word 0x4bc4 --word 0x4bc5 `
    --word 0x4bc6 --word 0x4bc7 --word 0x4bc8 --word 0x4bc9 --word 0x4bca --word 0x4bcb --word 0x4bcc `
    --word 0x4c26 --word 0x4c28 --word 0x4c29 --word 0x4c37 --word 0x4c5c --word 0x4c7d `
    --output $tracePath
  if ($LASTEXITCODE -ne 0) { throw 'Area1 locator did not produce an exact load-time baseline' }

  $trace = Get-Content -Raw $tracePath | ConvertFrom-Json
  $before = [int]$trace.words.'0x4bc7'.value
  $after = $trace.follow_ups[-1]
  $actual = [int]$after.words.'0x4bc7'.value
  if ($after.same_area1_bytes -or $actual -ne ($before + 1)) {
    throw "Native keypad-forward readiness check failed: expected [0x4bc7] $before -> $($before + 1), got $actual."
  }
  $sourceHashAfter = (Get-FileHash -LiteralPath $sourceSave -Algorithm SHA256).Hash
  if ($sourceHashAfter -ne $sourceHashBefore) { throw 'Source SAVGAMA.DAT changed; refusing to claim a read-only probe.' }
  Write-Host "[cok-completed-step] verified native minute $before -> $actual; source save unchanged"
} finally {
  if ($ownedPid) {
    Stop-Process -Id $ownedPid -ErrorAction SilentlyContinue
    Wait-Process -Id $ownedPid -Timeout 10 -ErrorAction SilentlyContinue
  }
}
