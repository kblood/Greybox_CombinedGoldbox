# Read-only CoK saved-Area1 load watch.
#
# Uses only GameLink for game input. DEBUGBOX `BPM` watches are armed while the
# CPU is stopped at the real Load Saved Game prompt, using the live DS:[4B28]
# Area1 far pointer. This distinguishes save deserialization from a later
# progression writer; it never sends dungeon input and runs from an owned copy.
param(
  [string]$StageDir = 'build\cok-cloudsave-runtime-stage',
  [Parameter(Mandatory)][string]$OutDir,
  # Exact resident Area1 location observed by the existing selected-save route
  # after matching SAVGAMA.DAT byte-for-byte in this CoK runtime layout.
  [uint32]$Area1Physical = 0x48b50,
  [ValidateRange(10,90)][int]$CreditsSeconds = 40,
  [ValidateRange(5,60)][int]$WatchTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Absolute([string]$path) { if ([IO.Path]::IsPathRooted($path)) { [IO.Path]::GetFullPath($path) } else { [IO.Path]::GetFullPath((Join-Path $repo $path)) } }
function Manifest([string]$root) {
  @(Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{ path=$_.FullName.Substring($root.Length).TrimStart('\','/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  })
}

$stage = Resolve-Path -LiteralPath (Absolute $StageDir)
$out = Absolute $OutDir
if (Test-Path -LiteralPath $out) { throw "refusing to overwrite output: $out" }
if (Get-Process dosbox-x -ErrorAction SilentlyContinue) { throw 'GameLink is a singleton; stop the existing DOSBox-X session first.' }
New-Item -ItemType Directory -Path $out | Out-Null
$beforeManifest = Manifest $stage.Path
$runtime = Join-Path $out 'runtime-game'
Copy-Item -LiteralPath $stage.Path -Destination $runtime -Recurse

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$link = Join-Path $repo 'tools\dosbox_gamelink.py'
$areaLocator = Join-Path $repo 'tools\locate_coab_area1_in_ram.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helper = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
foreach ($path in @($dbx,$probe,$link,$areaLocator,$helperProject,(Join-Path $runtime 'START.EXE'),(Join-Path $runtime 'SAVE\SAVGAMA.DAT'))) {
  if (-not (Test-Path -LiteralPath $path)) { throw "required path missing: $path" }
}
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null; $step = 0
function Debug([string]$Command,[string]$Label,[switch]$Snapshot,[string]$Key='') {
  $status = Join-Path $out ("{0:D3}-$Label-status.json" -f $script:step)
  $text = Join-Path $out ("{0:D3}-$Label-console.txt" -f $script:step); $script:step++
  $args=@($helper,'--pid',$process.Id,'--status',$status,'--snapshot',$text)
  if ($Key) { $args += @('--key',$Key) } elseif ($Snapshot) { $args += '--snapshot-only' } else { $args += @('--command',$Command) }
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed: $Label" }
  $reply = Get-Content -Raw $status | ConvertFrom-Json
  if (-not $reply.Success) { throw "debugger rejected $Label`: $($reply.Error)" }
  Get-Content -Raw $text
}
function IsRunning([string]$text) { $text -match '(?m)^\(Running\)\s*$' }
function RegisterWord([string]$text,[string]$name) {
  $m=[regex]::Match($text,("\b" + [regex]::Escape($name) + '=([0-9A-F]{4})\b'))
  if (-not $m.Success) { throw "could not read $name from DEBUGBOX register view" }
  [Convert]::ToUInt16($m.Groups[1].Value,16)
}
function ConsoleBytes([string]$text) {
  $values=[Collections.Generic.List[byte]]::new()
  foreach ($m in [regex]::Matches($text,'(?m)^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')) {
    foreach ($h in ($m.Groups[1].Value -split '\s+')) { if ($h) { $values.Add([Convert]::ToByte($h,16)) } }
  }; ,$values.ToArray()
}
function Press([string[]]$keys) { & python $link press @keys --pace 0.35 --hold 0.05; if ($LASTEXITCODE -ne 0) { throw "GameLink input failed: $($keys -join ',')" } }
function AwaitKeyWait([string]$label,[int]$seconds=20) {
  $deadline=[DateTime]::UtcNow.AddSeconds($seconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 200
    $snap=Debug '' ("wait-" + $label) -Snapshot
    if (-not (IsRunning $snap)) {
      # Both blocking reads (AH=00) and non-blocking polls (AH=01) are valid
      # game input boundaries. A GameLink key queued while either is halted is
      # consumed only after RUN; all other INT 16 services are resumed.
      $eax=[regex]::Match($snap,'\bEAX=([0-9A-F]{8})\b')
      if ($eax.Success) {
        $ah=(([Convert]::ToUInt32($eax.Groups[1].Value,16) -shr 8) -band 0xff)
        if ($ah -eq 0 -or $ah -eq 1) { return $snap }
      }
      Debug 'RUN' ("resume-nonkey-" + $label) | Out-Null
    }
  }
  throw "did not reach an INT 16h keyboard-read/poll boundary: $label"
}
function SendAtKeyWait([string]$key,[string]$label) {
  AwaitKeyWait ("before-" + $label) | Out-Null
  Press @($key)
  Debug 'RUN' ("run-" + $label) | Out-Null
}

try {
  # DEBUGBOX starts stopped, so this BIOS input breakpoint is guaranteed armed
  # before game code runs. It gives us a safe, GameLink-only pacing point; F5
  # is "Run" in DEBUGBOX, not a pause command.
  # Match cok_gamelink_saved_outpost_route.ps1's verified retail launch; adding
  # LOADFIX -32 made this save fail the post-load exact-Area1 calibration.
  & $probe -DbxExe $dbx -GameDir $runtime -Exe START.EXE -OutDir $out -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 16','RUN') -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX launch failed' }
  $metadata=Get-Content -Raw (Join-Path $out 'probe-process.json') | ConvertFrom-Json
  $process=Get-Process -Id ([int]$metadata.process_id)
  Start-Sleep -Seconds $CreditsSeconds
  SendAtKeyWait 'enter' 'dismiss-title'
  SendAtKeyWait 'down' 'menu-down-1'
  SendAtKeyWait 'down' 'menu-down-2'
  SendAtKeyWait 'enter' 'select-load-saved-game'
  $paused=AwaitKeyWait 'load-saved-game-menu'
  $ds=RegisterWord $paused 'DS'
  # This is reported rather than used: at this menu it is a staging buffer,
  # not the address the loader later installs as the resident Area1 record.
  $ptrDump=Debug ("D {0:X4}:4B28" -f $ds) 'read-preload-area1-staging-pointer'
  $ptr=ConsoleBytes $ptrDump
  if ($ptr.Count -lt 4) { throw 'could not parse four bytes from DS:4B28 debugger dump' }
  $stagingOffset=[BitConverter]::ToUInt16($ptr,0); $stagingSegment=[BitConverter]::ToUInt16($ptr,2)
  $base=$Area1Physical
  if ($base -gt 0xfffff -or $base + 0x800 -gt 0x100000) { throw ('invalid configured resident Area1 address 0x{0:X}' -f $base) }
  & python $link dump-memory (Join-Path $out 'area1-before-load.ram') --start ('0x{0:X}' -f $base) --length 0x800
  if ($LASTEXITCODE -ne 0) { throw 'pre-load Area1 dump failed' }

  $watchWords=@(0x4c26,0x4c5c,0x4c7d); $watches=@()
  foreach ($word in $watchWords) {
    $field=(0x6a00 + $word * 2) -band 0xffff; $physical=$base + $field
    $watchSeg=[uint32][math]::Floor($physical / 16); $watchOff=[uint32]($physical % 16); $address=('{0:X4}:{1:X4}' -f $watchSeg,$watchOff)
    Debug ("BPM $address") ("arm-{0:X4}" -f $word) | Out-Null
    $watches += [ordered]@{ ecl=('0x{0:X4}' -f $word); area1_offset=('0x{0:X3}' -f $field); physical=('0x{0:X}' -f $physical); address=$address }
  }
  $listed=Debug 'BPLIST' 'verify-watches'
  foreach ($watch in $watches) { if ($listed -notmatch ('BPMEM\s+' + [regex]::Escape($watch.address))) { throw "BPM watch not registered: $($watch.address)" } }
  # Preserve the retail route's deliberately batched `A, Enter` save selection.
  # Remove only BPINT (index 3 after the three watches) first, so its repeated
  # menu polling cannot alter the original timing; the three BPM watches remain.
  Debug 'BPDEL 3' 'remove-keyboard-breakpoint-before-load' | Out-Null
  $preLoadList=Debug 'BPLIST' 'verify-watches-before-load'
  $preLoadFinalList=($preLoadList -split 'Breakpoint list:' | Select-Object -Last 1)
  if ($preLoadFinalList -match 'BPINT') { throw 'BPINT 16 remained armed before the batched slot load' }
  foreach ($watch in $watches) { if ($preLoadFinalList -notmatch ('BPMEM\s+' + [regex]::Escape($watch.address))) { throw "BPM watch lost while removing input breakpoint: $($watch.address)" } }
  Press @('a','enter')
  Debug 'RUN' 'run-load-slot-a' | Out-Null

  $stops=@(); $keyboardStops=@(); $confirmationSent=$true; $deadline=[DateTime]::UtcNow.AddSeconds($WatchTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline -and $stops.Count -lt $watches.Count) {
    Start-Sleep -Milliseconds 250; $snap=Debug '' ('poll-{0:D2}' -f $stops.Count) -Snapshot
    if (IsRunning $snap) { continue }
    $csip=[regex]::Match($snap,'\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
    & python $link dump-memory (Join-Path $out ('stop-{0:D2}.ram' -f $stops.Count)) --start ('0x{0:X}' -f $base) --length 0x800
    $stops += [ordered]@{ index=$stops.Count; cs=if($csip.Success){$csip.Groups[1].Value}else{$null}; ip=if($csip.Success){$csip.Groups[2].Value}else{$null}; console=(Split-Path -Leaf (Get-ChildItem $out -Filter '*poll-*-console.txt' | Sort-Object LastWriteTime | Select-Object -Last 1).FullName) }
    Debug 'RUN' ('continue-{0:D2}' -f ($stops.Count-1)) | Out-Null
  }
  Start-Sleep -Seconds 2
  & python $link dump-memory (Join-Path $out 'area1-after-load.ram') --start ('0x{0:X}' -f $base) --length 0x800
  if ($LASTEXITCODE -ne 0) { throw 'post-load Area1 dump failed' }
  # Calibrate the actual resident Area1 with a full same-process GameLink dump
  # rather than reusing an address from a different DOSBox launch.
  $fullAfter=Join-Path $out 'post-load-full.ram'
  $locatorOut=Join-Path $out 'post-load-area1-locator.json'
  & python $link dump-memory $fullAfter --start 0 --length 0x1000000
  if ($LASTEXITCODE -ne 0) { throw 'post-load full RAM dump failed' }
  & python $areaLocator --save (Join-Path $runtime 'SAVE\SAVGAMA.DAT') --ram $fullAfter --word 0x4c26 --word 0x4c5c --word 0x4c7d --output $locatorOut
  $locatorExit=$LASTEXITCODE
  $locator=if (Test-Path -LiteralPath $locatorOut) { Get-Content -Raw $locatorOut | ConvertFrom-Json } else { $null }
  $saved=[IO.File]::ReadAllBytes((Join-Path $runtime 'SAVE\SAVGAMA.DAT'))[1..0x800]
  $after=[IO.File]::ReadAllBytes((Join-Path $out 'area1-after-load.ram'))
  [ordered]@{ schema_version=1; title='CoK Area1 pre-load memory-write trace'; stage=$stage.Path; preload_staging_pointer=('{0:X4}:{1:X4}' -f $stagingSegment,$stagingOffset); watched_area1_physical=('0x{0:X}' -f $base); watched_area1_address_source='provisional input; never treat as valid across a different DOSBox launch configuration or session'; post_load_area1_locator_exit=$locatorExit; post_load_area1_matches=if($locator){$locator.area1_matches}else{@()}; post_load_area1_locator='post-load-area1-locator.json'; watches=$watches; keyboard_stops=$keyboardStops; confirmation_sent=$confirmationSent; stops=$stops; post_load_matches_watched_address=([System.Linq.Enumerable]::SequenceEqual([byte[]]$saved,[byte[]]$after)); source_stage_unchanged=((Manifest $stage.Path | ConvertTo-Json -Compress) -eq ($beforeManifest | ConvertTo-Json -Compress)); claim_boundary='BPM stops prove writes only at the provisional address supplied to this one run. The full post-load locator independently calibrates the actual resident Area1 in the same process. A valid restoration-watch claim requires those addresses to agree before interpreting any BPM stop.' } | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $out 'trace.json') -Encoding utf8
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id; Wait-Process -Id $process.Id -ErrorAction SilentlyContinue }
}
