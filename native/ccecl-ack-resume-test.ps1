# Real DoK v15 ACK producer, presentation, and cold continuation regression.
# All guest input is a single BIOS-buffer P key in an isolated headless session.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $PSScriptRoot 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
foreach ($path in @($dosbox, (Join-Path $game 'ECL1.DAX'), (Join-Path $game 'DKK.CFG'))) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required ACK fixture unavailable: $path" }
}
. (Join-Path $PSScriptRoot 'dosbox-smoke.ps1')
foreach ($target in @('ccecl', 'ccflow', 'ccfp')) {
  & (Join-Path $PSScriptRoot 'build.ps1') -Target $target
  if ($LASTEXITCODE -ne 0) { throw "ACK helper build failed: $target" }
}
$run = Join-Path $build ('ccecl-ack-resume-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
foreach ($name in @('ccecl.com', 'ccflow.com', 'ccfp.com')) {
  Copy-Item -LiteralPath (Join-Path $build $name) -Destination (Join-Path $run $name)
}
foreach ($name in @('ECL1.DAX', 'DKK.CFG')) {
  Copy-Item -LiteralPath (Join-Path $game $name) -Destination (Join-Path $run $name)
}
# INT 16h/AH=05h queues scan=19h, ASCII='P'; no host keyboard/focus APIs.
[IO.File]::WriteAllBytes((Join-Path $run 'KEYS.COM'), [byte[]]@(
  0xB4,0x05,0xB9,0x50,0x19,0xCD,0x16,0xB8,0x00,0x4C,0xCD,0x21))

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Read-Bytes([string]$Name) { return ,[IO.File]::ReadAllBytes((Join-Path $run $Name)) }
function Get-Hash([string]$Name) { return (Get-FileHash -LiteralPath (Join-Path $run $Name) -Algorithm SHA256).Hash }
function Word([byte[]]$Bytes, [int]$Offset) { return [BitConverter]::ToUInt16($Bytes, $Offset) }
function Put-Word([byte[]]$Bytes, [int]$Offset, [uint16]$Value) {
  [BitConverter]::GetBytes($Value).CopyTo($Bytes, $Offset)
}
function Invoke-Guest([string[]]$Commands) {
  # A batch file avoids DOSBox's bounded autoexec buffer; every guest name is 8.3.
  Set-Content -LiteralPath (Join-Path $run 'RUN.BAT') -Encoding ASCII -Value (@('@echo off') + $Commands)
  $conf = Join-Path $run 'dosbox.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$run"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
  $process = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $process.WaitForExit(20000)) {
    Stop-DosBoxSmoke -Process $process
    throw "ACK test timed out; artifacts: $run"
  }
}
function Assert-Effect([string]$Name, [int]$Version, [int]$Area, [int]$PC) {
  $bytes = Read-Bytes $Name
  Assert-True ($bytes.Length -eq $(if ($Version -eq 15) { 5932 } else { 5750 })) "${Name}: wrong extent"
  Assert-True ([Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'GBEF') "${Name}: wrong magic"
  Assert-True ((Word $bytes 4) -eq $Version -and (Word $bytes 122) -eq $Area -and (Word $bytes 124) -eq $PC) "${Name}: wrong continuation identity"
  if ($Version -eq 15) {
    Assert-True ((Word $bytes 8) -eq 2 -and (Word $bytes 5766) -eq $PC) "${Name}: not matching ACK state"
  }
  return ,$bytes
}
function Assert-Token([string]$Name, [int]$Area, [int]$PC) {
  $bytes = Read-Bytes $Name
  Assert-True ($bytes.Length -eq 18) "${Name}: wrong token extent"
  Assert-True ([Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'GBMO') "${Name}: wrong token magic"
  $words = 4,6,8,10,12,14,16 | ForEach-Object { Word $bytes $_ }
  Assert-True (($words -join ',') -eq "2,1,1,$PC,$Area,65535,29") "${Name}: wrong token identity"
}

$sourceHash = Get-Hash 'ECL1.DAX'
Invoke-Guest @(
  'CCFLOW C:\ECL1.DAX 34 /E C:\A34.EFX > C:\P34.TXT',
  'CCFLOW C:\ECL1.DAX 16 /E C:\A16.EFX > C:\P16.TXT'
)
foreach ($case in @(@{Area=34;PC=151;Next=201;Version=15}, @{Area=16;PC=223;Next=328;Version=15})) {
  $stem = "A$($case.Area)"
  $input = Assert-Effect "$stem.EFX" 15 $case.Area $case.PC
  $fxHash = Get-Hash "$stem.EFX"
  $sideHash = Get-Hash "$stem.GBS"
  Invoke-Guest @(
    'KEYS.COM',
    "CCFP C:\$stem.EFX C:\$stem.GMO > C:\FP.TXT",
    "copy C:\$stem.GMO C:\SAVED.GMO > NUL",
    "CCECL C:\ECL1.DAX $($case.Area) /R C:\$stem.EFX C:\$stem.GMO /E C:\$stem`N.EFX > C:\RESUME.TXT",
    "CCECL C:\ECL1.DAX $($case.Area) /R C:\$stem.EFX C:\$stem.GMO /E C:\RETRY.EFX > C:\RETRY.TXT"
  )
  Assert-Token 'SAVED.GMO' $case.Area $case.PC
  $next = Assert-Effect "$stem`N.EFX" $case.Version $case.Area $case.Next
  Assert-True (-not (Test-Path (Join-Path $run "$stem.GMO"))) "${stem}: token not consumed"
  Assert-True (-not (Test-Path (Join-Path $run 'RETRY.EFX'))) "${stem}: consumed-token retry succeeded"
  Assert-True ((Get-Content (Join-Path $run 'RETRY.TXT') -Raw) -match 'bad or unsupported resume state') "${stem}: retry did not reach resume validation"
  Assert-True ((Get-Hash "$stem.EFX") -eq $fxHash -and (Get-Hash "$stem.GBS") -eq $sideHash) "${stem}: input effect/sidecar changed"
  if ($case.Version -eq 15) {
    Assert-True ([BitConverter]::ToString($input,5924,6) -eq [BitConverter]::ToString($next,5924,6)) 'Raw comparison flags changed across ACK'
    Assert-True ([BitConverter]::ToString($input,5778,4) -eq [BitConverter]::ToString($next,5778,4)) 'Comparison operands changed across ACK'
  }
}

# Keep malformed identity independent of malformed transport tokens and VM bounds.
foreach ($case in @('MISMATCH', 'TOKEN', 'HIGHPC', 'LOWPC')) {
  $effect = Read-Bytes 'A16.EFX'
  $token = Read-Bytes 'SAVED.GMO' # Last positive case is area16 / PC223.
  switch ($case) {
    'MISMATCH' { Put-Word $effect 5766 151; Put-Word $token 10 151 }
    'TOKEN' { Put-Word $token 10 151 }
    'HIGHPC' { Put-Word $effect 124 65535; Put-Word $effect 5766 65535; Put-Word $token 10 65535 }
    'LOWPC' { Put-Word $effect 124 0; Put-Word $effect 5766 0; Put-Word $token 10 0 }
  }
  [IO.File]::WriteAllBytes((Join-Path $run "$case.EFX"), $effect)
  [IO.File]::WriteAllBytes((Join-Path $run "$case.GMO"), $token)
  Copy-Item -LiteralPath (Join-Path $run 'A16.GBS') -Destination (Join-Path $run "$case.GBS")
  $before = @{}
  foreach ($extension in @('EFX','GMO','GBS')) { $before[$extension] = Get-Hash "$case.$extension" }
  Invoke-Guest @("CCECL C:\ECL1.DAX 16 /R C:\$case.EFX C:\$case.GMO /E C:\$case.OUT > C:\$case.TXT")
  Assert-True (-not (Test-Path (Join-Path $run "$case.OUT"))) "${case}: malformed resume produced output"
  $diagnostic = Get-Content (Join-Path $run "$case.TXT") -Raw
  $expected = if ($case -in @('HIGHPC','LOWPC')) { 'block too small for its header' } else { 'bad or unsupported resume state' }
  Assert-True ($diagnostic.Contains($expected)) "${case}: did not reach the expected rejection"
  foreach ($extension in @('EFX','GMO','GBS')) {
    Assert-True ((Get-Hash "$case.$extension") -eq $before[$extension]) "${case}: rejection mutated $extension"
  }
}

$malformedHash = Get-Hash 'MISMATCH.EFX'
$malformedSideHash = Get-Hash 'MISMATCH.GBS'
Invoke-Guest @('KEYS.COM', 'CCFP C:\MISMATCH.EFX C:\BADFP.GMO > C:\BADFP.TXT')
Assert-True (-not (Test-Path (Join-Path $run 'BADFP.GMO'))) 'CCFP accepted mismatched ACK identity'
Assert-True ((Get-Content (Join-Path $run 'BADFP.TXT') -Raw) -match 'cannot open walls file') 'CCFP did not execute its rejection path'
Assert-True ((Get-Hash 'MISMATCH.EFX') -eq $malformedHash) 'CCFP mutated rejected effect'
Assert-True ((Get-Hash 'MISMATCH.GBS') -eq $malformedSideHash) 'CCFP mutated rejected sidecar'
# Presentation binds identity; only CCECL knows the loaded ECL block bounds.
Invoke-Guest @('KEYS.COM', 'CCFP C:\HIGHPC.EFX C:\HIGHFP.GMO > C:\HIGHFP.TXT')
Assert-Token 'HIGHFP.GMO' 16 65535
Assert-True ((Get-Hash 'ECL1.DAX') -eq $sourceHash) 'Staged ECL source mutated'
Write-Output 'RESULT: DoK ACK PCs 151 and 223, cold resumes, raw flags, one-shot tokens, and rejection controls PASS'
Write-Output "Artifacts: $run"
