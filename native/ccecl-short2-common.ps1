# ccecl-short2-common.ps1 -- shared helpers for the Pools of Darkness / Treasures
# CCECL short-frame (short2) flow scripts. Dot-sourced; defines functions only.
#
# One DOSBox session runs CCECL once per case, each in its own staged directory
# (a COPY of the retail ECL1.DAX / GEO1.DAX / marker .CFG, never the install),
# and each case leaves CCECL.TRC / O.EFX / O.TXT / E.TXT (CCEFX dump) behind for
# the caller to parse.

function Get-Short2Retail([string]$Leaf) {
  if (-not $script:Short2GogRoot) { $script:Short2GogRoot = 'C:\Program Files (x86)\GOG Galaxy\Games' }
  return Join-Path $script:Short2GogRoot $Leaf
}

# Stage one case directory under $Run. $Files are source-relative names copied
# from $Source; $Mutate is an optional scriptblock called with the case directory
# after the copy (used by payload-mutation controls).
function New-Short2Case([string]$Run, [string]$Name, [string]$Source, [string[]]$Files, [scriptblock]$Mutate) {
  $dir = Join-Path $Run $Name
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  foreach ($f in $Files) { Copy-Item -LiteralPath (Join-Path $Source $f) -Destination (Join-Path $dir $f) -Force }
  if ($Mutate) { & $Mutate $dir }
  return $dir
}

# Run CCECL (a .COM at $Com) and CCEFX over every case. $Cases: @{ Name; Block; Args }.
# Case directories must already exist under $Run.
function Invoke-Short2Batch([string]$Run, [string]$Com, [string]$Efx, [object[]]$Cases, [string]$Dosbox, [switch]$Headless) {
  . (Join-Path $PSScriptRoot 'dosbox-smoke.ps1')
  Copy-Item -LiteralPath $Com -Destination (Join-Path $Run 'CCECL.COM') -Force
  Copy-Item -LiteralPath $Efx -Destination (Join-Path $Run 'CCEFX.COM') -Force
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('mount C "' + $Run + '"')
  $lines.Add('C:')
  foreach ($c in $Cases) {
    $lines.Add('CD \' + $c.Name)
    $lines.Add('C:\CCECL.COM ECL1.DAX ' + $c.Block + ' ' + $c.Args + ' /E O.EFX > O.TXT')
    $lines.Add('C:\CCEFX.COM O.EFX E.TXT')
  }
  $lines.Add('exit')
  $conf = Join-Path $Run '_short2.conf'
  (@('[sdl]', 'output=surface', '[cpu]', 'cycles=fixed 25000', '[autoexec]') + $lines) | Set-Content -LiteralPath $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $Dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
  if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }
}

# Executed PCs from CCECL.TRC: every row is searched for 'PC=hhhh'.
function Get-Short2TracePcs([string]$CaseDir) {
  $trc = Join-Path $CaseDir 'CCECL.TRC'
  if (-not (Test-Path -LiteralPath $trc)) { return @() }
  $pcs = @()
  foreach ($l in (Get-Content -LiteralPath $trc)) {
    if ($l -match 'PC=([0-9A-Fa-f]{4})') { $pcs += [Convert]::ToInt32($Matches[1], 16) }
  }
  return $pcs
}

# DAX block ids from the 9-byte TOC (word0 = toc bytes; entry: id, u32 off, u16 raw, u16 comp).
function Get-Short2DaxIds([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  $n = [BitConverter]::ToUInt16($b, 0) / 9
  $ids = @()
  for ($i = 0; $i -lt $n; $i++) { $ids += [int]$b[2 + 9 * $i] }
  return $ids
}

# Payload-mutation control: repoint TOC entry $From at block $To's data span, so the
# staged archive serves a DIFFERENT retail payload under the id the case asks for.
function Set-Short2TocAlias([string]$Path, [int]$From, [int]$To) {
  $b = [IO.File]::ReadAllBytes($Path)
  $n = [BitConverter]::ToUInt16($b, 0) / 9
  $src = -1; $dst = -1
  for ($i = 0; $i -lt $n; $i++) {
    if ($b[2 + 9 * $i] -eq $From) { $dst = 2 + 9 * $i }
    if ($b[2 + 9 * $i] -eq $To) { $src = 2 + 9 * $i }
  }
  if ($src -lt 0 -or $dst -lt 0) { throw "TOC alias $From -> $To : id missing in $Path" }
  [Array]::Copy($b, $src + 1, $b, $dst + 1, 8)
  [IO.File]::WriteAllBytes($Path, $b)
}

# First GBLF operand triple from a CCEFX dump, as three ints (or $null).
function Get-Short2Gblf([string]$CaseDir) {
  $t = Get-Content -LiteralPath (Join-Path $CaseDir 'E.TXT') -Raw
  if ($t -match 'GBLF operands=([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4})') {
    return @([Convert]::ToInt32($Matches[1], 16), [Convert]::ToInt32($Matches[2], 16), [Convert]::ToInt32($Matches[3], 16))
  }
  return $null
}

# True when $Seq occurs as CONSECUTIVE executed PCs in $Pcs.
function Test-Short2PcSeq([int[]]$Pcs, [int[]]$Seq) {
  for ($i = 0; $i + $Seq.Count -le $Pcs.Count; $i++) {
    $ok = $true
    for ($j = 0; $j -lt $Seq.Count; $j++) { if ($Pcs[$i + $j] -ne $Seq[$j]) { $ok = $false; break } }
    if ($ok) { return $true }
  }
  return $false
}

# PC executed immediately after the first execution of $Pc, or -1.
function Get-Short2NextPc([int[]]$Pcs, [int]$Pc) {
  for ($i = 0; $i + 1 -lt $Pcs.Count; $i++) { if ($Pcs[$i] -eq $Pc) { return $Pcs[$i + 1] } }
  return -1
}
