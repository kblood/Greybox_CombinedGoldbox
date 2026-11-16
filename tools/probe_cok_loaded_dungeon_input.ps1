# probe_cok_loaded_dungeon_input.ps1 -- direct (non-debugger) input readiness probe for a copied CoK save.
#
# This distinguishes a debugger-side observation issue from a loaded save that only renders a
# first-person frame but has not reached the original exploration command loop.  It never writes
# the supplied stage: DOSBox runs from a complete copy and the source stage is SHA-256 checked.

param(
  [string]$StageDir = 'build\cok-cloudsave-runtime-stage',
  [Parameter(Mandatory)][string]$OutDir,
  # CoAB's source calls the decoded Forward special key `H`; preserve it alongside the cursor
  # scan codes so this probe can establish the title's actual keyboard contract empirically.
  [ValidatePattern('^(up|down|left|right|kp_8|kp_2|kp_4|kp_6|h)(,(up|down|left|right|kp_8|kp_2|kp_4|kp_6|h))*$')][string]$MovementKeys = 'up',
  [ValidateRange(0.10,1.00)][double]$HoldSeconds = 0.30,
  [ValidateRange(500,15000)][int]$SettleMilliseconds = 6000
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function RepoPath([string]$path) { if ([IO.Path]::IsPathRooted($path)) { [IO.Path]::GetFullPath($path) } else { [IO.Path]::GetFullPath((Join-Path $repo $path)) } }
function Manifest([string]$root) {
  $base = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\','/')
  @((Get-ChildItem -LiteralPath $base -Recurse -File | Sort-Object FullName | ForEach-Object {
    "$($_.FullName.Substring($base.Length).TrimStart('\','/')) $((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
  }))
}
function HexOffset([string]$value) { [Convert]::ToInt32($value.Substring(2),16) }

$stage = Resolve-Path -LiteralPath (RepoPath $StageDir)
$movementSequence = @($MovementKeys -split ',')
$out = RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
if (Get-Process dosbox-x -ErrorAction SilentlyContinue) { throw 'GameLink is a singleton; stop the existing DOSBox-X session first.' }
New-Item -ItemType Directory -Path $out | Out-Null
$runtime = Join-Path $out 'runtime-game'
$beforeManifest = Manifest $stage
Copy-Item -LiteralPath $stage -Destination $runtime -Recurse
$inputSave = Join-Path $out 'input-SAVGAMA.DAT'
Copy-Item -LiteralPath (Join-Path $stage 'SAVE\SAVGAMA.DAT') -Destination $inputSave

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$link = Join-Path $repo 'tools\dosbox_gamelink.py'
$locator = Join-Path $repo 'tools\locate_coab_area1_in_ram.py'
$process = $null
function Press([string[]]$keys, [double]$hold = 0.05) { & python $link press @keys --pace 0.35 --hold $hold; if ($LASTEXITCODE -ne 0) { throw "GameLink input failed: $($keys -join ', ')" } }
function Shot([string]$name) { & python $link screenshot (Join-Path $out "$name.png"); if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $name" } }
function Dump([string]$name) { $path = Join-Path $out $name; & python $link dump-memory $path | Out-Null; if ($LASTEXITCODE -ne 0) { throw "GameLink RAM dump failed: $name" }; return $path }

try {
  & $probe -DbxExe $dbx -GameDir $runtime -Exe START.EXE -OutDir $out -RunDirect -GameLink -NoInitialScreenshots -NoActionScreenshots
  $process = Get-Process -Id ([int](Get-Content (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json).process_id)
  Start-Sleep -Seconds 40
  Press @('enter'); Start-Sleep -Seconds 3
  Press @('down'); Start-Sleep -Milliseconds 400; Press @('down'); Start-Sleep -Milliseconds 400; Press @('enter'); Start-Sleep -Seconds 2
  Press @('a','enter'); Start-Sleep -Seconds 2
  Press @('esc'); Start-Sleep -Seconds 1
  Press @('down','down','down','down','down','enter'); Start-Sleep -Seconds 10
  Shot 'before-forward'
  $beforeRamPath = Dump 'before-forward.ram'
  $locatorPath = Join-Path $out 'before-forward-area1.json'
  & python $locator --save $inputSave --ram $beforeRamPath --output $locatorPath --word 0x4bc3 --word 0x4bc4 --word 0x4bc5 --word 0x4bc6 --word 0x4bc7 --word 0x4bc8 --word 0x4bc9 --word 0x4bca --word 0x4bcb --word 0x4bcc | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'could not locate the exact loaded Area1 record in direct-session RAM' }
  $area = Get-Content $locatorPath -Raw | ConvertFrom-Json
  $beforeRam = [IO.File]::ReadAllBytes($beforeRamPath)
  $before = [ordered]@{}; foreach ($entry in $area.words.PSObject.Properties) { $before[$entry.Name] = [BitConverter]::ToUInt16($beforeRam,(HexOffset $entry.Value.physical_offset)) }
  foreach ($movementKey in $movementSequence) {
    Press @($movementKey) $HoldSeconds
    Start-Sleep -Milliseconds $SettleMilliseconds
  }
  Shot 'after-forward'
  $afterRam = [IO.File]::ReadAllBytes((Dump 'after-forward.ram'))
  $after = [ordered]@{}; foreach ($entry in $area.words.PSObject.Properties) { $after[$entry.Name] = [BitConverter]::ToUInt16($afterRam,(HexOffset $entry.Value.physical_offset)) }
  $changed = @($before.Keys | Where-Object { $before[$_] -ne $after[$_] })
  $afterManifest = Manifest $stage
  $unchanged = (($beforeManifest -join "`n") -eq ($afterManifest -join "`n"))
  if (-not $unchanged) { throw 'source stage changed during direct probe' }
  [ordered]@{ schema_version=1; route='title-load-slot-a-begin-movement'; movement_keys=$movementSequence; hold_seconds=$HoldSeconds; settle_milliseconds=$SettleMilliseconds; source_stage_unchanged=$unchanged; area1_base=$area.area1_matches[0]; words_before=$before; words_after=$after; changed_words=$changed; claim_boundary='A changed pose/clock proves only this copied original session accepted the bounded movement input; it does not establish wilderness cadence.' } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $out 'direct-input-probe.json') -Encoding utf8
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id; Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue }
}
