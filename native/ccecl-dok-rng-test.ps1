# ccecl-dok-rng-test.ps1 -- DoK CCECL RANDOM must follow the original Borland recurrence.
# Expected draws come from tools/dok_rng.py (independent of the asm). A CoK-profile
# control (same recurrence) and a generic-profile control (legacy LCG) run in the same
# DOSBox session. Env DOK_RNG_TEST_MULT overrides the model multiplier (mutation check).
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-dok-rng-test'
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'fixture escaped native/build'
}
$dosbox = Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe'
if (-not (Test-Path -LiteralPath $dosbox)) { Write-Host 'SKIP: held DOSBox unavailable'; exit 0 }
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
Push-Location $root
try {
  & (Join-Path $native 'build.ps1') -Target ccecl
  if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
  Copy-Item (Join-Path $build 'ccecl.com') (Join-Path $run 'CCECL.COM')
  # Synthetic Gen1 block: 22 zero bytes, then RANDOM max -> mem[0x9000+2*max] for max 0..255, EXIT.
  $code = New-Object System.Collections.Generic.List[byte]
  1..22 | ForEach-Object { $code.Add(0) }
  foreach ($m in 0..255) {
    $a = 0x9000 + $m * 2
    $code.AddRange([byte[]]@(8, 0, $m, 1, ($a -band 255), ($a -shr 8)))
  }
  $code.Add(0)
  $comp = New-Object System.Collections.Generic.List[byte]
  for ($i = 0; $i -lt $code.Count; $i += 128) {
    $n = [Math]::Min(128, $code.Count - $i)
    $comp.Add([byte]($n - 1)); $comp.AddRange($code.GetRange($i, $n))
  }
  $hdr = [byte[]]@(9, 0, 0, 0, 0, 0, 0, ($code.Count -band 255), ($code.Count -shr 8), ($comp.Count -band 255), ($comp.Count -shr 8))
  $dax = $hdr + $comp.ToArray()
  $cmds = @()
  foreach ($p in 'DOK', 'COK', 'GENERIC') {
    $d = Join-Path $run $p; New-Item -ItemType Directory -Path $d | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $d 'RNG.DAX'), $dax)
    if ($p -eq 'DOK') { [IO.File]::WriteAllBytes((Join-Path $d 'DKK.CFG'), [byte[]]@()) }
    if ($p -eq 'COK') { [IO.File]::WriteAllBytes((Join-Path $d 'KRYNN.CFG'), [byte[]]@()) }
    $cmds += "cd $p", '..\CCECL RNG.DAX 0 /E OUT.EFX', 'cd ..'
  }
  Set-Content -LiteralPath (Join-Path $run 'RUN.BAT') -Value (($cmds -join "`r`n") + "`r`n") -Encoding ASCII
  @"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$run"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath (Join-Path $run 'probe.conf') -Encoding ASCII
  . (Join-Path $native 'dosbox-smoke.ps1')
  $proc = Start-DosBoxSmoke -Dosbox $dosbox -Conf (Join-Path $run 'probe.conf') -Headless
  if (-not $proc.WaitForExit(60000)) { Stop-Process -Id $proc.Id -Force; throw 'DOSBox timed out' }
  # Expected values from the independent Python model (tools/dok_rng.py).
  $pyfile = Join-Path $run 'model.py'
  @"
import sys, json, os
sys.path.insert(0, r'$root\tools')
import dok_rng
mult = int(os.environ.get('DOK_RNG_TEST_MULT', '0'), 0) or dok_rng.MULTIPLIER
s = 0x1234; out = []
for m in range(256):
    s, v = dok_rng.ecl_random(s, m, mult); out.append(v)
g = 0x1234; gv = []
for m in range(256):
    g = (g * 1664525 + 1013904223) & 0xFFFFFFFF; gv.append(g % max(m, 1))
print(json.dumps({'dok': out, 'dokstate': s, 'gen': gv, 'genstate': g}))
"@ | Set-Content -LiteralPath $pyfile -Encoding ASCII
  $exp = (& python -I $pyfile) | ConvertFrom-Json
  foreach ($prof in 'DOK', 'COK', 'GENERIC') {
    $raw = [IO.File]::ReadAllBytes((Join-Path $run "$prof/OUT.EFX"))
    if ([Text.Encoding]::ASCII.GetString($raw, 0, 4) -ne 'GBEF' -or $raw[8] -ne 0) { throw "$prof VM did not exit normally" }
    if ([BitConverter]::ToUInt16($raw, 196) -ne 256) { throw "$prof query count" }
    $mem = @{}
    for ($i = 0; $i -lt 256; $i++) { $mem[[int][BitConverter]::ToUInt16($raw, 198 + $i * 2)] = [int][BitConverter]::ToUInt16($raw, 1222 + $i * 2) }
    $want = if ($prof -eq 'GENERIC') { $exp.gen } else { $exp.dok }
    $bad = 0
    for ($m = 0; $m -lt 256; $m++) { if ($mem[0x9000 + $m * 2] -ne $want[$m]) { $bad++ } }
    $wantState = if ($prof -eq 'GENERIC') { [uint32]$exp.genstate } else { [uint32]$exp.dokstate }
    $got = [BitConverter]::ToUInt32($raw, 126)
    if ($bad -ne 0) { throw "$prof RANDOM mismatch: $bad of 256 draws differ from model" }
    if ($got -ne $wantState) { throw ('{0} RNG state {1:X8} != model {2:X8}' -f $prof, $got, $wantState) }
  }
  Write-Host 'RESULT: ccecl-dok-rng-test PASS (768 draws: DoK vs tools/dok_rng.py, CoK and generic controls, final states)'
} finally { Pop-Location }
