# Opt-in reproducible dice for DQK creation: _GBDICE.BIN in CCPARTY's current
# directory is used as if it had been passed with /D.  Absent -> timer dice.
# Expected values come from tools/dqk_character_rules.py (retail rules model),
# never from the asm output.
param([switch]$Mutate)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
$model = Join-Path $root 'tools\dqk_character_rules.py'
if (-not (Test-Path -LiteralPath $dosbox) -or -not $py -or -not (Test-Path -LiteralPath $model)) {
  Write-Output 'SKIP: CCPARTY DQK dice opt-in (DOSBox or python or rules model absent)'
  exit 0
}
& (Join-Path $native 'build.ps1') -Target ccparty | Out-Null
$bin = (Resolve-Path (Join-Path $native 'build\ccparty.com')).Path
$out = Join-Path $native 'build\ccparty-dqkdice'
$run = Join-Path $out ([Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $run | Out-Null
$fails = New-Object System.Collections.Generic.List[string]
function Check($name, $ok, $detail) {
  if ($ok) { Write-Output "ok   $name ($detail)" } else { Write-Output "FAIL $name ($detail)"; $fails.Add($name) }
}
function Hex([byte[]]$b) { ($b | ForEach-Object { $_.ToString('x2') }) -join '' }
function Model([byte[]]$dice, [string]$name, [string]$cls) {
  $o = Join-Path $run ("m-$name-$cls.qch")
  $j = & $py -I $model --create $name --class $cls --race 6 --con 15 --dice (Hex $dice) --out $o
  if ($LASTEXITCODE -ne 0) { throw 'model failed' }
  [pscustomobject]@{ bytes = [IO.File]::ReadAllBytes($o); s = (($j -join '') | ConvertFrom-Json) }
}
$n = 0
function Case([string]$cmd, [hashtable]$files, [string]$binary = $bin) {
  $script:n++
  $c = Join-Path $run ("c$script:n")
  New-Item -ItemType Directory -Force (Join-Path $c 'SAVE') | Out-Null
  Copy-Item -LiteralPath $binary -Destination (Join-Path $c 'CCPARTY.COM')
  foreach ($k in $files.Keys) { [IO.File]::WriteAllBytes((Join-Path $c $k), [byte[]]$files[$k]) }
  $bat = @('@echo off', $cmd, 'IF ERRORLEVEL 1 GOTO ERR', 'ECHO ZERO>STATUS.TXT', 'GOTO DONE', ':ERR', 'ECHO NONZERO>STATUS.TXT', ':DONE', 'EXIT') -join "`r`n"
  [IO.File]::WriteAllText((Join-Path $c 'RUN.BAT'), $bat, [Text.Encoding]::ASCII)
  $conf = @('[sdl]', 'fullscreen=false', 'autolock=false', '[cpu]', 'cycles=fixed 25000', '[autoexec]', '@echo off', "mount C `"$c`"", 'C:', 'RUN.BAT') -join "`r`n"
  [IO.File]::WriteAllText((Join-Path $c 'dosbox.conf'), $conf, [Text.Encoding]::ASCII)
  $ov = $env:SDL_VIDEODRIVER; $oa = $env:SDL_AUDIODRIVER
  try {
    $env:SDL_VIDEODRIVER = 'dummy'; $env:SDL_AUDIODRIVER = 'dummy'
    $p = Start-Process -FilePath $dosbox -ArgumentList @('-noconsole', '-conf', "`"$(Join-Path $c 'dosbox.conf')`"") -WorkingDirectory $c -WindowStyle Hidden -PassThru
  } finally { $env:SDL_VIDEODRIVER = $ov; $env:SDL_AUDIODRIVER = $oa }
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; $p.WaitForExit(2000) | Out-Null }
  $st = if (Test-Path (Join-Path $c 'STATUS.TXT')) { ([IO.File]::ReadAllText((Join-Path $c 'STATUS.TXT'))).Trim() } else { 'MISSING' }
  $q = Join-Path $c 'SAVE\LUNA.QCH'
  [pscustomobject]@{ status = $st; qch = $(if (Test-Path $q) { [IO.File]::ReadAllBytes($q) } else { $null }); gbp = (Test-Path (Join-Path $c 'ROSTER.GBP')) }
}
function Same($a, $b) { $null -ne $a -and $null -ne $b -and (Hex $a) -eq (Hex $b) }

$diceA = [byte[]](5, 9, 3, 7, 2, 8, 6, 4, 1, 0, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43)
$diceB = [byte[]](9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28)
$mA = Model $diceA 'LUNA' 'fighter'
$mB = Model $diceB 'LUNA' 'fighter'
Check 'model premise' ($mA.s.max_hp -ne $mB.s.max_hp) "A max_hp=$($mA.s.max_hp) B max_hp=$($mB.s.max_hp)"
$cmd = 'CCPARTY /Q /C LUNA F /R 6 /N 15 ROSTER.GBP > RUN.TXT'
$useBin = $bin
if ($Mutate) {
  # mutant: opt-in file name changed in the binary
  $b = [IO.File]::ReadAllBytes($bin)
  $needle = [Text.Encoding]::ASCII.GetBytes('_GBDICE.BIN')
  $idx = -1
  for ($i = 0; $i -le $b.Length - $needle.Length; $i++) {
    $m = $true
    for ($j = 0; $j -lt $needle.Length; $j++) { if ($b[$i + $j] -ne $needle[$j]) { $m = $false; break } }
    if ($m) { $idx = $i; break }
  }
  if ($idx -lt 0) { throw 'opt-in name not found in binary' }
  $b[$idx + 5] = [byte][char]'X'
  $useBin = Join-Path $run 'mutant.com'
  [IO.File]::WriteAllBytes($useBin, $b)
}
$a = Case $cmd @{ '_GBDICE.BIN' = $diceA } $useBin
$bb = Case $cmd @{ '_GBDICE.BIN' = $diceB } $useBin
Check 'A status' ($a.status -eq 'ZERO') $a.status
Check 'A QCH == model(A), all 414 bytes' (Same $a.qch $mA.bytes) $(if ($a.qch) { "maxhp=$($a.qch[0x89]) expect=$($mA.s.max_hp)" } else { 'no qch' })
Check 'B QCH == model(B), all 414 bytes' (Same $bb.qch $mB.bytes) $(if ($bb.qch) { "maxhp=$($bb.qch[0x89]) expect=$($mB.s.max_hp)" } else { 'no qch' })
Check 'A and B differ' ($a.qch -and $bb.qch -and -not (Same $a.qch $bb.qch)) 'distinct dice give distinct HP'
# /D wins over _GBDICE.BIN and equals the opt-in result for the same bytes
$d = Case ($cmd -replace 'ROSTER', '/D DICE.BIN ROSTER') @{ '_GBDICE.BIN' = $diceB; 'DICE.BIN' = $diceA } $useBin
Check '/D overrides _GBDICE.BIN' (Same $d.qch $mA.bytes) $(if ($d.qch) { "maxhp=$($d.qch[0x89])" } else { 'no qch' })
# headless GBBOOT-style form
$h = Case 'CCPARTY /G /ID 3 /C LUNA F /R 6 /N 15 ROSTER.GBP > RUN.TXT' @{ '_GBDICE.BIN' = $diceA } $useBin
Check 'headless /G /ID 3 /C uses _GBDICE.BIN' (Same $h.qch $mA.bytes) $(if ($h.qch) { "maxhp=$($h.qch[0x89])" } else { 'no qch' })
if (-not $Mutate) {
  # controls: file absent -> timer default still creates a valid character
  $c0 = Case $cmd @{}
  Check 'control: absent file still creates' ($c0.status -eq 'ZERO' -and $c0.qch -and $c0.qch.Length -eq 414 -and $c0.qch[0x89] -gt 0) $(if ($c0.qch) { "maxhp=$($c0.qch[0x89])" } else { 'no qch' })
  # control: empty file falls back to the timer, not a rejection
  $c1 = Case $cmd @{ '_GBDICE.BIN' = [byte[]]@() }
  Check 'control: empty _GBDICE.BIN falls back to timer' ($c1.status -eq 'ZERO' -and $c1.qch -and $c1.qch[0x89] -gt 0) $(if ($c1.qch) { "maxhp=$($c1.qch[0x89])" } else { 'no qch' })
  # control: explicit missing /D still rejects (behaviour unchanged)
  $c2 = Case ($cmd -replace 'ROSTER', '/D MISSING.BIN ROSTER') @{ '_GBDICE.BIN' = $diceA }
  Check 'control: explicit missing /D file still rejects' ($c2.status -eq 'NONZERO' -and -not $c2.qch -and -not $c2.gbp) "status=$($c2.status)"
}
if ($fails.Count -gt 0) { Write-Output "RESULT: CCPARTY DQK dice opt-in FAIL ($($fails.Count)): $($fails -join '; ')"; exit 1 }
Write-Output 'RESULT: CCPARTY DQK dice opt-in PASS'
