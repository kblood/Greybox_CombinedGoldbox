# ccformats-test.ps1 -- unified cc FORMAT-SUPPORT test harness (task #21).
#
# For each (format, game, real asset) cell, run the cc asm extractor HEADLESSLY
# under DOSBox and prove its per-member output is BYTE-IDENTICAL to the Python
# oracle (tools/format_manifest.py). One DOSBox session extracts every cell into
# per-cell out dirs; PowerShell then SHA256s the members and diffs the hashes
# against the oracle manifest. Reports a PASS/FAIL coverage line per cell.
#
# Comparison = decompressed-block bytes (DAX via CCGBC XA) / raw pointer-span
# bytes (HLIB via CCHLIB X) -- no rendering, exact + deterministic. See
# docs/engine/research/cc-format-coverage.md for the full cell list.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$root   = "$GbRoot"
$native = Join-Path $root "native"
$build  = Join-Path $native "build"
$mount  = (Join-Path $PSScriptRoot 'build\ccfmt')
$dosbox = "$GbRoot\The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
$py     = "python"
. (Join-Path $native "dosbox-smoke.ps1")

if (Test-Path $mount) { Remove-Item -Recurse -Force $mount }
New-Item -ItemType Directory -Force $mount | Out-Null

# Helper .com tools, named to match how the harness invokes them in DOS.
Copy-Item (Join-Path $build "cgbc.com")   (Join-Path $mount "ccgbc.com")  -Force
Copy-Item (Join-Path $build "cchlib.com") (Join-Path $mount "cchlib.com") -Force
Copy-Item (Join-Path $build "ccdaa.com")  (Join-Path $mount "ccdaa.com")  -Force

# --- cell spec: real container per (game, format family). Staged under short 8.3
#     names (A{nn}.DAX / G{nn}.GLB) so CoK/DoK same-named files never collide. ---
$ck = "$root\Champions of Krynn"; $dk = "$root\Death Knights of Krynn"; $dq = "$root\The Dark Queen of Krynn"
$ax = "$root\amiga_extracted"
$spec = @(
  # DOS DAX (CCGBC XA, decompressed-block byte-identity -- covers every inner type)
  @{ name="CoK DAX TITLE";    src="$ck\TITLE.DAX";    kind="dax" }
  @{ name="CoK DAX 8X8D";     src="$ck\8X8D1.DAX";    kind="dax" }
  @{ name="CoK DAX BIGPIC";   src="$ck\BIGPIC1.DAX";  kind="dax" }
  @{ name="CoK DAX GEO";      src="$ck\GEO1.DAX";     kind="dax" }
  @{ name="CoK DAX ECL";      src="$ck\ECL1.DAX";     kind="dax" }
  @{ name="CoK DAX MONCHA";   src="$ck\MON1CHA.DAX";  kind="dax" }
  @{ name="CoK DAX SPRIT";    src="$ck\SPRIT1.DAX";   kind="dax" }
  @{ name="CoK DAX PIC";      src="$ck\PIC1.DAX";     kind="dax" }
  @{ name="CoK DAX WALLDEF";  src="$ck\WALLDEF1.DAX"; kind="dax" }
  @{ name="DoK DAX TITLE";    src="$dk\TITLE.DAX";    kind="dax" }
  @{ name="DoK DAX 8X8D";     src="$dk\8X8D1.DAX";    kind="dax" }
  @{ name="DoK DAX BIGPIC";   src="$dk\BIGPIC1.DAX";  kind="dax" }
  @{ name="DoK DAX GEO";      src="$dk\GEO1.DAX";     kind="dax" }
  @{ name="DoK DAX ECL";      src="$dk\ECL1.DAX";     kind="dax" }
  @{ name="DoK DAX MONCHA";   src="$dk\MON1CHA.DAX";  kind="dax" }
  @{ name="DoK DAX SPRIT";    src="$dk\SPRIT1.DAX";   kind="dax" }
  @{ name="DoK DAX PIC";      src="$dk\PIC1.DAX";     kind="dax" }
  @{ name="DoK DAX WALLDEF";  src="$dk\WALLDEF1.DAX"; kind="dax" }
  # Amiga DAA (CCDAA /D render-RAW: imgw,imgh,planar->indices,768-pal byte-identity)
  @{ name="CoK DAA DUNGCOM";  src="$ax\ChampionsOfKrynn\disk1\DUNGCOM.DAA";   kind="daa" }
  @{ name="CoK DAA BIGPIC";   src="$ax\ChampionsOfKrynn\disk2\BIGPIC1.DAA";   kind="daa" }
  @{ name="CoK DAA SKY";      src="$ax\ChampionsOfKrynn\disk1\SKY.DAA";       kind="daa" }
  @{ name="DoK DAA DUNGCOM";  src="$ax\DeathKnightsOfKrynn\disk1\DUNGCOM.daa"; kind="daa" }
  @{ name="DoK DAA BACK";     src="$ax\DeathKnightsOfKrynn\disk1\BACK1.DAA";   kind="daa" }
  @{ name="DoK DAA BIGPIC";   src="$ax\DeathKnightsOfKrynn\disk1\BIGPIC1.DAA"; kind="daa" }
  # DQK HLIB DATA GLB (CCHLIB X, raw pointer-span byte-identity)
  @{ name="DQK GLB GEO";      src="$dq\DISK3\GEO.GLB";    kind="hlib" }
  @{ name="DQK GLB ECL";      src="$dq\DISK3\ECL.GLB";    kind="hlib" }
  @{ name="DQK GLB MONCHA";   src="$dq\DISK2\MONCHA.GLB"; kind="hlib" }
  @{ name="DQK GLB SOUNDS";   src="$dq\DISK1\SOUNDS.GLB"; kind="hlib" }
)
$cells = @(); $di = 0; $gi = 0; $ai = 0
foreach ($s in $spec) {
  if (-not (Test-Path $s.src)) { Write-Output "  (skip missing: $($s.name) -> $($s.src))"; continue }
  switch ($s.kind) {
    "dax"  { $di++; $file = "A{0:D2}.DAX" -f $di; $outdir = "OA{0:D2}" -f $di }
    "daa"  { $ai++; $file = "D{0:D2}.DAA" -f $ai; $outdir = "OD{0:D2}" -f $ai }
    default{ $gi++; $file = "G{0:D2}.GLB" -f $gi; $outdir = "OG{0:D2}" -f $gi }
  }
  $cells += @{ name=$s.name; file=$file; src=$s.src; kind=$s.kind; outdir=$outdir }
}

# Stage assets + compute oracle manifests (and member counts for the sampled loops).
foreach ($c in $cells) {
  Copy-Item $c.src (Join-Path $mount $c.file) -Force
  # DAA uses the render-RAW oracle (CCDAA /D); DAX/HLIB use container byte-identity.
  $mkind = if ($c.kind -eq "daa") { "daa-raw" } else { $c.kind }
  $manPath = Join-Path $mount ("man_" + $c.outdir + ".json")
  & $py (Join-Path $root "tools\format_manifest.py") --kind $mkind (Join-Path $mount $c.file) --out $manPath | Out-Null
  $c.manifest = Get-Content $manPath -Raw | ConvertFrom-Json
  $c.count = $c.manifest.count
  # standard (renderable) member indices -- DAA skips 8X8D/sub-frame/complex members
  $c.std = @($c.manifest.members | Where-Object { "$($_.sha256)" -notmatch '^(NOT_|DECODE_)' } | ForEach-Object { [int]$_.index })
}

# --- build the DOSBox autoexec: extract every cell, then exit ---
$lines = @("@echo off", "mount C `"$mount`"", "C:")
foreach ($c in $cells) {
  $lines += "mkdir $($c.outdir)"
  if ($c.kind -eq "dax") {
    $lines += "ccgbc XA $($c.file) $($c.outdir)"            # one call: all blocks
    $c.attempted = $null                                    # null = compare ALL members
  } elseif ($c.kind -eq "daa") {
    # CCDAA renders one member -> fixed CCDAA.RAW; copy it per sampled standard
    # frame (first + middle + last). Render-RAW byte-identity vs the daa-raw oracle.
    $std = $c.std
    $s = @($std[0]); if ($std.Count -gt 2) { $s += $std[[int]($std.Count/2)] }; if ($std.Count -gt 1) { $s += $std[$std.Count-1] }
    $s = @($s | Sort-Object -Unique)
    foreach ($i in $s) {
      $lines += "ccdaa $($c.file) $i /D"
      $lines += ("copy CCDAA.RAW {0}\R{1:D4}.RAW" -f $c.outdir, $i)
    }
    $c.attempted = $s
  } else {
    # HLIB has no extract-all; sample members (first + middle + last) for speed,
    # since each cchlib launch is a separate DOS program load (the run must reach
    # `exit` cleanly or DOSBox never flushes the mounted-drive writes).
    $s = @(0); if ($c.count -gt 2) { $s += [int]($c.count/2) }; if ($c.count -gt 1) { $s += ($c.count-1) }
    $s = @($s | Sort-Object -Unique | Where-Object { $_ -lt $c.count })
    foreach ($i in $s) { $lines += "cchlib X $($c.file) $i $($c.outdir)" }
    $c.attempted = $s
  }
}
$lines += "exit"
$conf = Join-Path $mount "_fmt.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
$($lines -join "`r`n")
"@ | Set-Content -Path $conf -Encoding ASCII

Write-Output "== running cc extractors headlessly under DOSBox =="
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
$clean = $p.WaitForExit(240000)
if (-not $clean) { try { $p.Kill() } catch {}; Write-Output "WARN: DOSBox did NOT reach 'exit' in time -> writes NOT flushed; results invalid" }
Start-Sleep -Milliseconds 500

# --- diff extracted member hashes vs oracle manifest ---
Write-Output ""
Write-Output "== FORMAT-SUPPORT COVERAGE =="
$allPass = $true
foreach ($c in $cells) {
  $od = Join-Path $mount $c.outdir
  # oracle index -> sha256
  $oracle = @{}
  foreach ($m in $c.manifest.members) { $oracle[[int]$m.index] = $m.sha256 }
  # extracted index -> sha256  (filenames Bnnnn.* / Innnn.* / Dnnnn.*)
  $got = @{}
  if (Test-Path $od) {
    foreach ($f in Get-ChildItem $od -File) {
      if ($f.BaseName -match '(\d+)$') {
        $idx = [int]$Matches[1]
        $got[$idx] = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
      }
    }
  }
  # compare only the indices we attempted to extract (DAX=all; HLIB=sample)
  $attempt = if ($null -ne $c.attempted) { @($c.attempted) } else { @($oracle.Keys) }
  $n = $attempt.Count; $ok = 0; $bad = @()
  foreach ($idx in $attempt) {
    $idx = [int]$idx
    if ($got.ContainsKey($idx) -and $oracle.ContainsKey($idx) -and $got[$idx] -eq $oracle[$idx]) { $ok++ }
    else { $bad += $idx }
  }
  $sampled = if ($null -ne $c.attempted) { " (sampled of $($c.count))" } else { "" }
  $status = if ($ok -eq $n -and $n -gt 0) { "PASS" } else { "FAIL"; $allPass = $false }
  $extra = if ($bad.Count) { " (mismatch/missing idx: " + (($bad | Sort-Object | Select-Object -First 8) -join ',') + ")" } else { "" }
  Write-Output ("  [{0}] {1,-16} {2}/{3} members byte-identical vs oracle{4}{5}" -f $status,$c.name,$ok,$n,$sampled,$extra)
}
Write-Output ""
Write-Output ("RESULT: " + $(if ($allPass) { "ALL CELLS PASS" } else { "FAILURES PRESENT" }))
