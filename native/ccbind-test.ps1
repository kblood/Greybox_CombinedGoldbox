# ccbind-test.ps1 -- exact, versioned cold-continuation source identity.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccbind-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')
if (-not (Test-Path -LiteralPath $dosbox)) {
  throw "Required DOSBox executable is unavailable: $dosbox"
}

& (Join-Path $native 'build.ps1') -Target ccbind
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build 'ccbind.com') (Join-Path $run 'CCBIND.COM') -Force

function Invoke-Guest([string]$Name, [string]$Command, [bool]$ExpectPass) {
  Remove-Item (Join-Path $run 'STATUS.TXT') -ErrorAction SilentlyContinue
  @"
@echo off
$Command
if errorlevel 1 goto bad
echo OK>C:\STATUS.TXT
goto done
:bad
echo BAD>C:\STATUS.TXT
:done
exit
"@ | Set-Content (Join-Path $run 'RUN.BAT') -Encoding Ascii
  $conf = Join-Path $run "_$Name.conf"
@"
[sdl]
output=surface
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
C:
RUN.BAT
"@ | Set-Content $conf -Encoding Ascii
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) { try { $p.Kill() } catch {}; throw "DOSBox did not exit during CCBIND $Name" }
  $status = (Get-Content (Join-Path $run 'STATUS.TXT') -Raw).Trim()
  if (($status -eq 'OK') -ne $ExpectPass) { throw "CCBIND $Name returned $status" }
}

# Same length is intentional: source identity must not be a length-only check.
[IO.File]::WriteAllBytes((Join-Path $run 'SOURCE.BIN'), [byte[]](1..64))
[IO.File]::WriteAllBytes((Join-Path $run 'STATE.EFX'), [byte[]](0))
Invoke-Guest 'write' 'CCBIND /W C:\SOURCE.BIN C:\STATE.EFX' $true
$idn = Join-Path $run 'STATE.IDN'
$bytes = [IO.File]::ReadAllBytes($idn)
if ($bytes.Length -ne 80 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne 'GBID' -or [BitConverter]::ToUInt16($bytes,4) -ne 1 -or [BitConverter]::ToUInt16($bytes,6) -ne 16) {
  throw 'CCBIND did not write the exact versioned identity sibling'
}
Invoke-Guest 'unchanged' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $true

# /N is the opt-in direct-DAMAGE occurrence issuer. It must retain ordinary
# source identity and advance a bounded, durable token even for equal bytes.
[IO.File]::WriteAllBytes((Join-Path $run 'OP.EFX'), [byte[]](0))
Invoke-Guest 'operation-first' 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $true
$op = Join-Path $run 'OP.DOP'
$opBytes = [IO.File]::ReadAllBytes($op)
if ($opBytes.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($opBytes,0,4) -ne 'GBDO' -or
    [BitConverter]::ToUInt16($opBytes,4) -ne 1 -or [BitConverter]::ToUInt16($opBytes,6) -ne 1 -or
    [BitConverter]::ToUInt64($opBytes,8) -ne 1) {
  throw 'CCBIND /N did not write the first exact GBDO operation token'
}
Invoke-Guest 'operation-second' 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $true
$opBytes = [IO.File]::ReadAllBytes($op)
if ([BitConverter]::ToUInt64($opBytes,8) -ne 2) {
  throw 'CCBIND /N did not advance an equal-byte operation occurrence token'
}
# Exercise every carry boundary, including a high-half-only occurrence.  This
# distinguishes the u64 wire format from the former u32-plus-reserved layout.
foreach ($seed in @(
    [Convert]::ToUInt64('FFFF', 16),
    [Convert]::ToUInt64('FFFFFFFF', 16),
    [Convert]::ToUInt64('FFFFFFFFFFFF', 16),
    [Convert]::ToUInt64('100000000', 16))) {
  $seedBytes = [byte[]]$opBytes.Clone(); [BitConverter]::GetBytes($seed).CopyTo($seedBytes, 8)
  [IO.File]::WriteAllBytes($op, $seedBytes)
  Invoke-Guest "operation-carry-$($seed.ToString('X'))" 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $true
  $advanced = [IO.File]::ReadAllBytes($op)
  if ($advanced.Length -ne 16 -or [BitConverter]::ToUInt64($advanced,8) -ne ($seed + 1)) {
    throw "CCBIND /N did not preserve the u64 carry after generation $($seed.ToString('X'))"
  }
}
$opBytes = [IO.File]::ReadAllBytes($op)
Invoke-Guest 'operation-identity' 'CCBIND /V C:\SOURCE.BIN C:\OP.EFX' $true
$badOp = [byte[]]$opBytes.Clone(); [Array]::Clear($badOp, 8, 8)
[IO.File]::WriteAllBytes($op, $badOp)
Invoke-Guest 'operation-zero-generation' 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $false
if ([BitConverter]::ToString([IO.File]::ReadAllBytes($op)) -ne [BitConverter]::ToString($badOp)) {
  throw 'CCBIND /N rewrote a zero-generation operation token'
}
$badOp = [byte[]]$opBytes.Clone(); $badOp[6] = 2
[IO.File]::WriteAllBytes($op, $badOp)
Invoke-Guest 'operation-invalid-kind' 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $false
if ([BitConverter]::ToString([IO.File]::ReadAllBytes($op)) -ne [BitConverter]::ToString($badOp)) {
  throw 'CCBIND /N rewrote an operation token with an invalid kind'
}
$badOp = [byte[]]$opBytes.Clone(); [BitConverter]::GetBytes([UInt64]::MaxValue).CopyTo($badOp, 8)
[IO.File]::WriteAllBytes($op, $badOp)
Invoke-Guest 'operation-wrap' 'CCBIND /N C:\SOURCE.BIN C:\OP.EFX' $false
if ([BitConverter]::ToString([IO.File]::ReadAllBytes($op)) -ne [BitConverter]::ToString($badOp)) {
  throw 'CCBIND /N rewrote a wrapping operation token'
}
[IO.File]::WriteAllBytes($op, $opBytes)

# A /W failure must propagate its errorlevel; GBBOOT uses that status before
# accepting a cold continuation.  The identity sibling must not be created
# from a missing source, and an existing directory makes the sibling unwritable.
Invoke-Guest 'write-missing-source' 'CCBIND /W C:\MISSING.BIN C:\MISSING.EFX' $false
if (Test-Path (Join-Path $run 'MISSING.IDN')) {
  throw 'CCBIND /W created an identity sibling for a missing source'
}
New-Item -ItemType Directory -Force (Join-Path $run 'BLOCKED.IDN') | Out-Null
Invoke-Guest 'write-blocked-output' 'CCBIND /W C:\SOURCE.BIN C:\BLOCKED.EFX' $false
Remove-Item (Join-Path $run 'BLOCKED.IDN') -Force

$changed = [byte[]](1..64); $changed[63] = 0
[IO.File]::WriteAllBytes((Join-Path $run 'SOURCE.BIN'), $changed)
Invoke-Guest 'equal-length-change' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $false
[IO.File]::WriteAllBytes((Join-Path $run 'SOURCE.BIN'), [byte[]](1..64))

# Missing, truncated, trailing and future identities must all fail closed.
Remove-Item $idn
Invoke-Guest 'missing' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $false
Invoke-Guest 'rewrite' 'CCBIND /W C:\SOURCE.BIN C:\STATE.EFX' $true
[IO.File]::WriteAllBytes($idn, [IO.File]::ReadAllBytes($idn)[0..14])
Invoke-Guest 'truncated' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $false
Invoke-Guest 'rewrite2' 'CCBIND /W C:\SOURCE.BIN C:\STATE.EFX' $true
$trailing = [byte[]](([IO.File]::ReadAllBytes($idn)) + 0); [IO.File]::WriteAllBytes($idn, $trailing)
Invoke-Guest 'trailing' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $false
Invoke-Guest 'rewrite3' 'CCBIND /W C:\SOURCE.BIN C:\STATE.EFX' $true
$future = [IO.File]::ReadAllBytes($idn); $future[4] = 2; [IO.File]::WriteAllBytes($idn, $future)
Invoke-Guest 'future' 'CCBIND /V C:\SOURCE.BIN C:\STATE.EFX' $false

Write-Host 'RESULT: CCBIND exact source identity rejection PASS'
