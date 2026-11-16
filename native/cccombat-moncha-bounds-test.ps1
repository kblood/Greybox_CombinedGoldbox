# Isolated DAX MONCHA RLE bounds regression harness.
param([switch]$Headless, [string]$ComPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'cccombat-moncha-bounds-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')
if (-not (Test-Path -LiteralPath $dosbox)) { Write-Output 'SKIP: CCCOMBAT MONCHA DAX bounds smoke (DOSBox.exe absent)'; exit 0 }
if (-not $ComPath) {
  & (Join-Path $native 'build.ps1') -Target cccombat
  if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT build failed: $LASTEXITCODE" }
  $ComPath = Join-Path $build 'cccombat.com'
}
if (-not (Test-Path -LiteralPath $ComPath)) { throw "CCCOMBAT binary not found: $ComPath" }
$resolvedRun = [IO.Path]::GetFullPath($run)
$resolvedBuild = [IO.Path]::GetFullPath($build)
if (-not $resolvedRun.StartsWith($resolvedBuild + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove unexpected test directory: $resolvedRun"
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item -LiteralPath $ComPath -Destination (Join-Path $run 'CCCOMBAT.COM') -Force

function New-Fx {
  [byte[]]$fx = [byte[]]::new(116)
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($fx,0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($fx,4)
  [BitConverter]::GetBytes([UInt16]8).CopyTo($fx,6)
  [BitConverter]::GetBytes([UInt16]3).CopyTo($fx,8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx,32)
  [BitConverter]::GetBytes([UInt16]0).CopyTo($fx,34)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx,36)
  [BitConverter]::GetBytes([UInt16]0).CopyTo($fx,38)
  return ,$fx
}
function Write-Dax([string]$Path,[int]$RawLength,[byte[]]$Compressed) {
  [byte[]]$bytes = [byte[]]::new(11 + $Compressed.Length)
  [BitConverter]::GetBytes([UInt16]9).CopyTo($bytes,0)
  $bytes[2] = 0
  [BitConverter]::GetBytes([UInt32]0).CopyTo($bytes,3)
  [BitConverter]::GetBytes([UInt16]$RawLength).CopyTo($bytes,7)
  [BitConverter]::GetBytes([UInt16]$Compressed.Length).CopyTo($bytes,9)
  [Array]::Copy($Compressed,0,$bytes,11,$Compressed.Length)
  [IO.File]::WriteAllBytes($Path,$bytes)
}
function Convert-Literal([byte[]]$Raw) {
  $out = [Collections.Generic.List[byte]]::new()
  for ($offset=0; $offset -lt $Raw.Length;) {
    $count = [Math]::Min(128,$Raw.Length-$offset)
    $out.Add([byte]($count-1))
    for ($i=0;$i -lt $count;$i++) { $out.Add($Raw[$offset+$i]) }
    $offset += $count
  }
  return ,$out.ToArray()
}
function Save-Case([string]$Name,[int]$RawLength,[byte[]]$Compressed) {
  Write-Dax (Join-Path $run "$Name.DAX") $RawLength $Compressed
  [IO.File]::WriteAllBytes((Join-Path $run "$Name.EFX"),(New-Fx))
}

[byte[]]$goodRaw = [byte[]]::new(422)
$goodRaw[0x78] = 12; $goodRaw[0x1a4] = 12
$goodRaw[0x199] = 45; $goodRaw[0x19a] = 55
$goodRaw[0x19e] = 1; $goodRaw[0x1a0] = 6
Save-Case 'GOOD' 422 (Convert-Literal $goodRaw)
[byte[]]$maxRaw = [byte[]]::new(2048)
Save-Case 'MAX2048' 2048 (Convert-Literal $maxRaw)
Save-Case 'TLIT' 422 ([byte[]]@(0x7F,0x41,0x42))
Save-Case 'MREP' 216 ([byte[]]@(0x80))
# Four 128-byte runs exceed the declared 422-byte output to 512 bytes.
$overshoot = [Collections.Generic.List[byte]]::new()
for ($i=0;$i -lt 4;$i++) { $overshoot.Add(0x80); $overshoot.Add(0x41) }
Save-Case 'OVR' 422 $overshoot.ToArray()

@'
@echo off
CCCOMBAT /E C:\GOOD.EFX C:\GOOD.DAX 4660 C:\GOOD.TRC C:\GOOD.OUT C:\GOOD.RAW > C:\GOOD.TXT
CCCOMBAT /E C:\TLIT.EFX C:\TLIT.DAX 4660 C:\TLIT.TRC C:\TLIT.OUT C:\TLIT.RAW > C:\TLIT.TXT
CCCOMBAT /E C:\MREP.EFX C:\MREP.DAX 4660 C:\MREP.TRC C:\MREP.OUT C:\MREP.RAW > C:\MREP.TXT
CCCOMBAT /E C:\OVR.EFX C:\OVR.DAX 4660 C:\OVR.TRC C:\OVR.OUT C:\OVR.RAW > C:\OVR.TXT
CCCOMBAT /E C:\MAX2048.EFX C:\MAX2048.DAX 4660 C:\MAX.TRC C:\MAX.OUT C:\MAX.RAW > C:\MAX.TXT
CCCOMBAT /E C:\GOOD.EFX C:\GOOD.DAX 4660 C:\AFTER.TRC C:\AFTER.OUT C:\AFTER.RAW > C:\AFTER.TXT
exit
'@ | Set-Content -LiteralPath (Join-Path $run 'RUN.BAT') -Encoding ASCII
$conf = Join-Path $run 'cccombat-moncha-bounds.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
RUN.BAT
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$proc = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $proc.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $proc
  throw "DOSBox timed out; owned PID $($proc.Id) was stopped."
}
$proc.Refresh()
$summary = [Collections.Generic.List[string]]::new()
$summary.Add("DOSBox exit=$($proc.ExitCode)")
foreach ($name in @('GOOD','TLIT','MREP','OVR','MAX','AFTER')) {
  $out = Join-Path $run "$name.OUT"; $trc = Join-Path $run "$name.TRC"; $txt = Join-Path $run "$name.TXT"
  $outState = if (Test-Path $out) { "out=$([IO.File]::ReadAllBytes($out).Length)B" } else { 'out=absent' }
  $trcState = if (Test-Path $trc) { "trace=$([IO.File]::ReadAllBytes($trc).Length)B" } else { 'trace=absent' }
  $diagnostic = if (Test-Path $txt) { ([IO.File]::ReadAllText($txt) -replace '\s+',' ').Trim() } else { 'stdout=absent' }
  $summary.Add("$name $outState $trcState stdout=$diagnostic")
}
$summary | Set-Content -LiteralPath (Join-Path $run 'summary.txt') -Encoding UTF8
$requiredSuccess = @('GOOD','AFTER')
foreach ($name in $requiredSuccess) {
  if (-not (Test-Path (Join-Path $run "$name.OUT")) -or -not (Test-Path (Join-Path $run "$name.TRC"))) {
    throw "CCCOMBAT MONCHA DAX bounds smoke failed: $name control produced no combat result."
  }
  $trace = [IO.File]::ReadAllText((Join-Path $run "$name.TRC"))
  foreach ($needle in @('init p0','init e0','end ')) {
    if (-not $trace.Contains($needle)) { throw "$name successful trace missing '$needle'." }
  }
  $outcome = [IO.File]::ReadAllText((Join-Path $run "$name.OUT")).Trim()
  if (@('party','enemy','draw') -notcontains $outcome) { throw "$name wrote invalid outcome '$outcome'." }
}
if ([IO.File]::ReadAllText((Join-Path $run 'GOOD.TRC')) -cne [IO.File]::ReadAllText((Join-Path $run 'AFTER.TRC')) -or
    [IO.File]::ReadAllText((Join-Path $run 'GOOD.OUT')) -cne [IO.File]::ReadAllText((Join-Path $run 'AFTER.OUT'))) {
  throw 'The valid control after the boundary cases differs from the initial combat result.'
}
foreach ($name in @('TLIT','MREP','OVR','MAX')) {
  if ((Test-Path (Join-Path $run "$name.OUT")) -or (Test-Path (Join-Path $run "$name.TRC"))) {
    throw "CCCOMBAT MONCHA DAX bounds smoke failed: $name produced success output for malformed/unsupported data."
  }
  $message = if (Test-Path (Join-Path $run "$name.TXT")) { [IO.File]::ReadAllText((Join-Path $run "$name.TXT")) } else { '' }
  if ($message.Trim() -cne 'bad effect') { throw "CCCOMBAT MONCHA DAX bounds smoke failed: $name rejection was '$($message.Trim())', expected 'bad effect'." }
}
$summary.Add('RESULT: CCCOMBAT DAX MONCHA bounds + malformed-stream rejection + 2048-byte boundary PASS')
$summary | Set-Content -LiteralPath (Join-Path $run 'summary.txt') -Encoding UTF8
$summary | ForEach-Object { Write-Output $_ }
