param(
  [Parameter(Mandatory)][string]$StageDir,
  [Parameter(Mandatory)][string]$OutDir,
  [ValidatePattern('^[0-9A-Fa-f]{1,4}:[0-9A-Fa-f]{1,4}$')][string]$BreakAddress = '3565:0008',
  [switch]$SendSlotInput
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage = (Resolve-Path (Join-Path $repo $StageDir)).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }

$saveCopies = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Filter 'SAVGAMA.DAT')
if ($saveCopies.Count -lt 1) { throw 'stage has no SAVGAMA.DAT' }
$saveHashes = @($saveCopies | ForEach-Object {
  (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | Sort-Object -Unique)
if ($saveHashes.Count -ne 1) { throw 'SAVGAMA.DAT copies differ' }

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

$process = $null
try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe START.EXE -OutDir $out `
    -Cycles 'fixed 25000' -LoadFixKb 32 -GameLink -DebuggerAction @("BP $BreakAddress", 'RUN') `
    -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }

  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Start-Sleep -Seconds 10
  & python $gameLink press esc esc esc --pace 2
  if ($LASTEXITCODE -ne 0) { throw 'startup GameLink input failed' }
  & python $gameLink press down down enter --pace 0.75
  if ($LASTEXITCODE -ne 0) { throw 'load-menu GameLink input failed' }
  if ($SendSlotInput) {
    Start-Sleep -Seconds 2
    & python $gameLink press a enter --pace 0.75
    if ($LASTEXITCODE -ne 0) { throw 'slot GameLink input failed' }
  }
  Start-Sleep -Seconds 3

  $statusPath = Join-Path $out 'validator-break-status.json'
  $snapshotPath = Join-Path $out 'validator-break-console.txt'
  & dotnet $helperDll --pid $process.Id --command 'BPDEL *' --status $statusPath --snapshot $snapshotPath
  if ($LASTEXITCODE -ne 0) { throw 'debugger snapshot command failed; breakpoint may not have fired' }
  & python $gameLink dump-memory (Join-Path $out 'validator-break.ram') --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'validator RAM dump failed' }

  $snapshot = Get-Content -LiteralPath $snapshotPath -Raw
  $eaxMatch = [regex]::Match($snapshot, '\bEAX=([0-9A-F]{8})\b')
  $csIpMatch = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  $breakParts = $BreakAddress.Split(':')
  $expectedPhysical = ([Convert]::ToUInt32($breakParts[0], 16) -shl 4) + [Convert]::ToUInt32($breakParts[1], 16)
  $actualPhysical = if ($csIpMatch.Success) {
    ([Convert]::ToUInt32($csIpMatch.Groups[1].Value, 16) -shl 4) +
      ([Convert]::ToUInt32($csIpMatch.Groups[2].Value, 16) -band 0xFFFF)
  } else { $null }
  [ordered]@{
    schema_version = 1
    title = 'Secret first save-slot validator return trace'
    stage = $stage
    save_sha256 = $saveHashes[0]
    breakpoint = $BreakAddress
    expected_physical = ('0x{0:X}' -f $expectedPhysical)
    direct_run_physical = ('0x{0:X}' -f ($expectedPhysical - 0x8420))
    loadfix_delta = '0x8420'
    breakpoint_seen = $null -ne $actualPhysical -and $actualPhysical -eq $expectedPhysical
    registers = [ordered]@{
      cs = if ($csIpMatch.Success) { $csIpMatch.Groups[1].Value } else { $null }
      ip = if ($csIpMatch.Success) { $csIpMatch.Groups[2].Value } else { $null }
      ds = if ($dsMatch.Success) { $dsMatch.Groups[1].Value } else { $null }
      al = if ($eaxMatch.Success) { [Convert]::ToUInt32($eaxMatch.Groups[1].Value, 16) -band 0xFF } else { $null }
      physical = if ($null -ne $actualPhysical) { '0x{0:X}' -f $actualPhysical } else { $null }
    }
    console = 'validator-break-console.txt'
    ram = [ordered]@{
      file = 'validator-break.ram'
      sha256 = (Get-FileHash -LiteralPath (Join-Path $out 'validator-break.ram') -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    claim_boundary = 'candidate physical breakpoint derived from measured loadfix delta; console registers must prove the hit'
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'validator-trace.json') -Encoding utf8
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
