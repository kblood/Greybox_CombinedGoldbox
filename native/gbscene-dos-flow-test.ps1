# gbscene-dos-flow-test.ps1 -- the pre-combat PICTURE bridge in ORDINARY play,
# under the DOS graphics set.
#
# Before round 36 `present_precombat_pictures` (native/src/gbboot.asm) let
# non-demo play through only when `graphics_requested == 2` AND an Amiga archive
# had been located, even though the DOS decode path below it (child_gb over
# BIGPIC1/PIC2/PIC4/PIC5/HEAD2/BODY2.DAX) was already complete. On a DOS install
# the engine therefore presented NO pre-combat picture at all outside the title
# demo.
#
# MEASURED BEFORE THE CHANGE, in the NON-DEMO frame (this is the null):
#   DoK area 1 entry 16, party at (10,1) facing 2 -- the encounter
#   gbdok-playable-flow-test.ps1 already proves on real data:
#     /G 1  collected 6 PICTURE records (5 after the 255 reset sentinel), presented 0
#     /G 2  collected 6,                                                 presented 5
#   demoflag is 0 on this route (choose_krynn_title_mode sets it only for CoK
#   ECL2#57 and DoK ECL1#2), so this is ordinary play. Under the demo the branch
#   is unconditional and a measurement there would prove nothing.
#
# WHAT THIS PINS, and what it refuses to accept as proof:
#   0. TERMINATION, in ORDINARY STEPPED PLAY. Added after the first version of
#      this test shipped over a hang. Its only DoK arm ran under `/X`
#      (snapshot-and-exit), which is the one mode that bypasses the promoted
#      bridge's interactive CCFP path entirely, and its CoK arm carries no
#      PICTURE record so it never entered the bridge at all. Measured on the
#      shipped build: `GBBOOT /E /G 1 /A 1 /B 16 /T 1` exited in 1.61 s before
#      the promotion and NEVER terminated after it -- killed at 60 s, 91 s and
#      301 s, and reproduced here at 90.01 s against 1.35 s for the same command
#      on the pre-promotion binary. Cause, measured not inferred: the scene tail
#      appended CCFP's ` /L`, but CCFP consults automode only at its `.gbws_wait`
#      site, reachable only when `/F` set gbwfpmode, and the scene branch never
#      emits `/F`. Standalone CCFP on the same artifacts: with `/L` 30.12 s no
#      exit, without `/L` 30.03 s no exit, with `/S` 1.04 s exit. So the stepped
#      arm below runs the NON-snapshot command and a hang fails it on the timeout.
#   1. COLLECTED vs PRESENTED, in order. For CoK, collected IDs still come from
#      CCEFX's `_GBECL.TXT` dump. For DoK, GameLink records the exact CCFP-opened
#      GBEF and GBSL for every identity-checked ACK; picture IDs are recovered
#      from those event sidecars, not from GBBOOT's scene output. `/T` can resume
#      through another combat handoff before its DOS process exits; each handoff
#      deliberately replaces `_GBPICS.BIN`. The stepped arm therefore saves each
#      distinct, complete trace while the guest runs: it requires the complete
#      initial source sequence, then a final nonempty contiguous source subsequence,
#      rather than comparing only the last handoff to an earlier effect record.
#   2. PROVENANCE, for ONE of the presented blocks -- not all of them. The final
#      scene's decoded bytes must equal what CGB produces when run standalone
#      against the retail DOS archive for the same logical block, an oracle
#      outside the bridge under test. The other presented blocks are compared to
#      NOTHING, because `_GBSCENE.GBI` is rewritten in place per picture and only
#      the last one survives the run. The headline says "1 of 5", not
#      "byte-identical", for exactly that reason.
#   3. THE PLATFORM NULL, measured by deprivation rather than by a pixel diff.
#      A straight /G 1 vs /G 2 byte compare does NOT discriminate on this route,
#      and that is a measured fact about the data, not an omission: DoK's Amiga
#      BIGPIC1.DAA does not carry logical block 112 (`CCDAA BIGPIC1.DAA /B 112`
#      fails; /B 113 succeeds), so the Amiga arm falls back to the same DOS
#      BIGPIC frame for the last picture and both sets end on identical bytes.
#      So instead: hide BIGPIC1.DAX while leaving BIGPIC1.DAA in place.
#        /G 1 must LOSE those frames  -- proving the DOS archive was the source;
#        /G 2 must KEEP one of them   -- proving /G is selecting a platform and
#                                        that /G 1's shorter list is a refusal,
#                                        not a decode failure.
#      Measured: full [112,96,113,77,112] on both sets; deprived /G 1 [96,77] vs
#      deprived /G 2 [96,113,77].
#   4. WIRING. A GBIM in build\ that nothing consumes is this repo's most-repeated
#      failure. The decoded scene pixels must appear in the composited CCFP frame
#      `_GBPIC.RAW`.
#   5. NON-VACUITY. An arm whose route carries zero PICTURE records proves
#      nothing (0 == 0 is not a pass), so it is reported and NOT counted, and the
#      run FAILS if no arm carried a record at all.
#   6. C64 IMPORT AND SELECTION. DoK's retail C64 side 1 supplies PIC70, the
#      same logical id 112 as the first and final PICTURE event on this route.
#      The optional local arm converts that user asset, requests /G 3, requires
#      the explicit imported-C64 plan, and compares those source pixels directly
#      with CCFP's final frame. A DOS fallback has the same block id but different
#      pixels, so it cannot satisfy this check.
#
# COUNTERS. Every ratio printed on the RESULT line is a real measurement. The
# first version of this script incremented each numerator on the line AFTER the
# corresponding `throw`, so all three were structurally incapable of reading
# anything but N/N and carried no information. Failures are now COLLECTED, the
# ratios are printed with their true numerators, and the run throws at the end
# listing them. A ratio below N/N is therefore reachable and visible.
#
# SKIPPING is PER ARM, not all-or-nothing. The first version bailed out of the
# whole script on the first missing file across both titles, so an absent CoK
# Amiga extraction -- the arm that measures nothing -- would take the DoK arm
# that carries 100% of the evidence down with it and `exit 0`. Each title is now
# gated on its own sources; the run only SKIPs if NO title is available.
#
# Absent local game data or Amiga extractions SKIP. A run directory that HAS the
# DOS archives and a route that DOES carry PICTURE records, but presents none,
# FAILS -- that is the regression this test exists for.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'

$titles = @(
  @{
    Label    = 'DoK'
    Game     = Join-Path $root 'Death Knights of Krynn'
    Amiga    = Join-Path $root 'amiga_extracted\DeathKnightsOfKrynn\disk1'
    AmigaFallback = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\DeathKnightsOfKrynn\data'
    DosFiles = @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX',
                 'CPIC1.DAX', 'BIGPIC1.DAX', 'PIC2.DAX', 'PIC4.DAX', 'PIC5.DAX')
    AmigaMap = @(@{ Src = '8x8d1.daa'; Dst = '8X8D1.DAA' }, @{ Src = 'CPIC1.daa'; Dst = 'CPIC1.DAA' },
                 @{ Src = 'BIGPIC1.DAA'; Dst = 'BIGPIC1.DAA' })
    Create   = '/R SCNA C /R SCNB K /R SCNC M /R SCND T'
    CreateAt = @(0, 0, 2)
    EventAt  = @(10, 1, 2)
    Cmd      = '/E /X /G {0} /A 1 /B 16'
    StepCmd  = '/E /G {0} /A 1 /B 16 /T 1'
    Deprive  = 'BIGPIC1.DAX'
    C64Disk  = 'D:\Games\Emulator\C64\Goldbox\Death Knights of Krynn\Death Knights of Krynn - Side 1.D64'
    C64Picture = 'PIC70'
    C64Block = 112
  },
  @{
    Label    = 'CoK'
    Game     = Join-Path $root 'Champions of Krynn'
    Amiga    = Join-Path $root 'amiga_extracted\ChampionsOfKrynn\disk2'
    AmigaFallback = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\ChampionsOfKrynn\data'
    DosFiles = @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX',
                 'CPIC1.DAX', 'BIGPIC1.DAX', 'PIC2.DAX', 'HEAD2.DAX', 'BODY2.DAX')
    AmigaMap = @(@{ Src = '8X8D1.DAA'; Dst = '8X8D1.DAA' }, @{ Src = 'CPIC1.DAA'; Dst = 'CPIC1.DAA' },
                 @{ Src = 'BIGPIC1.DAA'; Dst = 'BIGPIC1.DAA' })
    Create   = '/R SCNA C /R SCNB F /R SCNC M'
    CreateAt = @(1, 7, 2)
    EventAt  = @(1, 1, 0)
    Cmd      = '/E /G {0} /T 1'
    StepCmd  = '/E /G {0} /T 1'
    Deprive  = 'BIGPIC1.DAX'
  }
)

if (-not (Test-Path $dosbox)) {
  Write-Output 'SKIP: GBBOOT DOS pre-combat scene flow (DOSBox.exe absent)'
  exit 0
}
if (-not (Test-Path $dbx)) {
  Write-Output 'SKIP: GBBOOT DOS pre-combat scene flow (DOSBox-X GameLink absent)'
  exit 0
}

# PER-ARM availability. A title whose sources are absent is dropped with a named
# SKIP line; the remaining titles still run. Only an empty list SKIPs the script.
$available = @()
foreach ($t in $titles) {
  $primaryComplete = @($t.AmigaMap | Where-Object { -not (Test-Path (Join-Path $t.Amiga $_.Src)) }).Count -eq 0
  if (-not $primaryComplete) { $t.Amiga = $t.AmigaFallback }
  $missing = @()
  foreach ($name in $t.DosFiles) {
    if (-not (Test-Path (Join-Path $t.Game $name))) { $missing += $name }
  }
  foreach ($m in $t.AmigaMap) {
    if (-not (Test-Path (Join-Path $t.Amiga $m.Src))) { $missing += ('Amiga ' + $m.Src) }
  }
  if ($missing.Count -gt 0) {
    Write-Output ("SKIP ARM: GBBOOT DOS pre-combat scene flow ({0}: {1} absent)" -f $t.Label, ($missing -join ', '))
  } else {
    $available += $t
  }
}
if ($available.Count -lt 1) {
  Write-Output 'SKIP: GBBOOT DOS pre-combat scene flow (no title has both its DOS archives and its Amiga extraction)'
  exit 0
}
$titles = $available

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Clear-Sidecars([string[]]$Names) {
  foreach ($n in $Names) { Remove-Item (Join-Path $build $n) -Force -ErrorAction SilentlyContinue }
}

function Invoke-Dosbox([string]$Run, [string]$Body, [string]$Tag) {
  $conf = Join-Path $build ("_gbscene_{0}.conf" -f $Tag)
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$Run"
D:
$Body
exit
"@ | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$true
  $last = $null
  $watchIndex = 0
  $watchPath = Join-Path $build '_GBPICS.BIN'
  if ($Tag -like '*d') {
    Remove-Item (Join-Path $build ("{0}-GBPI-*.BIN" -f $Tag)) -Force -ErrorAction SilentlyContinue
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  while (-not $p.HasExited -and [DateTime]::UtcNow -lt $deadline -and $p.WaitForExit(20) -eq $false) {
    if ($Tag -like '*d' -and (Test-Path $watchPath)) {
      $hex = [BitConverter]::ToString([IO.File]::ReadAllBytes($watchPath))
      if ($hex -ne $last) {
        $last = $hex
        $watchIndex++
        Copy-Item $watchPath (Join-Path $build ("{0}-GBPI-{1}.BIN" -f $Tag, $watchIndex)) -Force
      }
    }
  }
  if (-not $p.HasExited) {
    Stop-DosBoxSmoke -Process $p
    throw "GBBOOT DOS pre-combat scene flow timed out after 90s ($Tag)"
  }
}

function Invoke-Gbboot([string]$Run, [string]$Cmd, [string]$Log, [string]$Tag) {
  Remove-Item (Join-Path $build $Log) -Force -ErrorAction SilentlyContinue
  if ($Title.Label -eq 'DoK') {
    $captureRoot = Join-Path $build ("gbscene-gamelink-{0}" -f $Tag)
    if (Test-Path -LiteralPath $captureRoot) { Remove-Item -LiteralPath $captureRoot -Recurse -Force }
    New-Item -ItemType Directory -Force $captureRoot | Out-Null
    $script:latestAckCaptureRoot = $captureRoot
    $picturePrefix = if ($Tag -like '*d') { Join-Path $build $Tag } else { $null }
    if ($picturePrefix) {
      Get-ChildItem -LiteralPath $build -Filter ((Split-Path -Leaf $picturePrefix) + '-GBPI-*.BIN') -ErrorAction SilentlyContinue |
        Remove-Item -Force
    }
    Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $Run `
      -GuestCommand "C:\GBBOOT $Cmd > C:\$Log" `
      -DosLogFile (Join-Path $build ("{0}-files.log" -f $Tag)) `
      -CaptureRoot $captureRoot -TimeoutSeconds 45 -PictureTracePrefix $picturePrefix | Out-Null
    $path = Join-Path $build $Log
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
      throw "GBBOOT DOS pre-combat scene flow produced an empty or missing console log ($Tag)"
    }
    return (Get-Content -LiteralPath $path -Raw)
  }
  Invoke-Dosbox $Run ("C:\GBBOOT {0} > C:\{1}" -f $Cmd, $Log) $Tag
  $path = Join-Path $build $Log
  if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
    throw "GBBOOT DOS pre-combat scene flow produced an empty or missing console log ($Tag)"
  }
  return (Get-Content $path -Raw)
}

# The COLLECTED side, read from CCEFX's dump of the GBEF record CCECL wrote --
# deliberately NOT from anything present_precombat_pictures produced. Line shape:
#   #1F OP=0E PICTURE ARGC=01 ARGS= 0070
function Get-CollectedPictureIds([string]$Path) {
  $ids = @()
  if (-not (Test-Path $Path)) { return , $ids }
  foreach ($line in (Get-Content $Path)) {
    if ($line -match 'OP=0E\s+PICTURE\s+ARGC=([0-9A-Fa-f]{2})\s+ARGS=\s*([0-9A-Fa-f]{4})') {
      if ([Convert]::ToInt32($Matches[1], 16) -lt 1) { continue }
      $ids += [Convert]::ToInt32($Matches[2], 16)
    }
  }
  return , $ids
}

# The PRESENTED side: the engine's own GBPI replay trace.
function Get-PresentedPictureIds([string]$Path) {
  $ids = @()
  if (-not (Test-Path $Path)) { return , $ids }
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt 8 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBPI') {
    throw "GBBOOT DOS pre-combat scene flow: $Path is not a GBPI trace"
  }
  if ([BitConverter]::ToUInt16($b, 4) -ne 1) {
    throw "GBBOOT DOS pre-combat scene flow: $Path is not GBPI v1"
  }
  $n = [BitConverter]::ToUInt16($b, 6)
  if ($b.Length -ne (8 + (2 * $n))) {
    throw "GBBOOT DOS pre-combat scene flow: $Path extent does not match its count of $n"
  }
  for ($i = 0; $i -lt $n; $i++) { $ids += [BitConverter]::ToUInt16($b, 8 + (2 * $i)) }
  return , $ids
}

function Get-AckCollectedPictureIds([string]$CaptureRoot) {
  $ids = @()
  $seen = [Collections.Generic.HashSet[string]]::new()
  $runDirs = @(Get-ChildItem -LiteralPath $CaptureRoot -Directory -ErrorAction SilentlyContinue)
  if ($runDirs.Count -eq 0) { return ,$ids }
  $runDir = $runDirs | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  foreach ($record in (Get-ChildItem -LiteralPath $runDir.FullName -Filter 'ack-*.json' |
      Where-Object { $_.Name -match '^ack-\d+\.json$' } | Sort-Object Name)) {
    $ack = Get-Content -LiteralPath $record.FullName -Raw | ConvertFrom-Json
    $stem = [IO.Path]::GetFileNameWithoutExtension($record.Name)
    $effectPath = Join-Path $runDir.FullName ($stem + '-effect.bin')
    $key = if (Test-Path -LiteralPath $effectPath) {
      (Get-FileHash -LiteralPath $effectPath -Algorithm SHA256).Hash
    } else { $record.Name }
    if ($ack.sidecar) {
      $sidecarPath = Join-Path $runDir.FullName $ack.sidecar
      if (Test-Path -LiteralPath $sidecarPath) {
        $key += ':' + (Get-FileHash -LiteralPath $sidecarPath -Algorithm SHA256).Hash
      }
    }
    if (-not $seen.Add($key)) { continue }
    foreach ($picture in @($ack.picture_ids)) { $ids += [int]$picture }
  }
  return ,$ids
}

function Test-OrderedPictureSubsequence([int[]]$Needle, [int[]]$Haystack) {
  if ($Needle.Count -lt 1 -or $Needle.Count -gt $Haystack.Count) { return $false }
  for ($start = 0; $start -le ($Haystack.Count - $Needle.Count); $start++) {
    $match = $true
    for ($i = 0; $i -lt $Needle.Count; $i++) {
      if ($Needle[$i] -ne $Haystack[$start + $i]) { $match = $false; break }
    }
    if ($match) { return $true }
  }
  return $false
}

function Read-Gbim([string]$Path, [string]$Label) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt (14 + 1 + 768) -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBIM') {
    throw "$Label $Path is not a GBIM resource"
  }
  $w = [BitConverter]::ToUInt16($b, 10)
  $h = [BitConverter]::ToUInt16($b, 12)
  if ($b.Length -ne (14 + ($w * $h) + 768) -or $w -lt 1 -or $h -lt 1 -or $w -gt 304 -or $h -gt 168) {
    throw "$Label $Path has a geometry CCFP would reject: ${w}x${h}"
  }
  $px = New-Object byte[] ($w * $h)
  [Array]::Copy($b, 14, $px, 0, $w * $h)
  $seen = @{}
  $nonzero = 0
  foreach ($v in $px) { $seen[[int]$v] = $true; if ($v -ne 0) { $nonzero++ } }
  return [pscustomobject]@{
    Block = [BitConverter]::ToUInt16($b, 6); Width = $w; Height = $h; Pixels = $px
    Distinct = $seen.Count; NonZero = $nonzero
    Hex = ([BitConverter]::ToString($px)).Replace('-', '')
  }
}

# WIRING: the decoded scene has to be in the frame CCFP actually composited.
function Assert-SceneAt($Scene, [string]$FramePath, [string]$Context, [int]$Left, [int]$Top) {
  $raw = [IO.File]::ReadAllBytes($FramePath)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Context did not write a valid 320x200 RAW snapshot"
  }
  if (($Left + $Scene.Width) -gt 320 -or ($Top + $Scene.Height) -gt 200) {
    throw "$Context has invalid scene placement geometry"
  }
  for ($y = 0; $y -lt $Scene.Height; $y++) {
    for ($x = 0; $x -lt $Scene.Width; $x++) {
      if ($raw[4 + (($y + $Top) * 320) + $x + $Left] -ne $Scene.Pixels[($y * $Scene.Width) + $x]) {
        throw "$Context did not blit the decoded scene pixels at ($x,$y); the GBIM is not reaching CCFP"
      }
    }
  }
}

$transient = @('_GBPARTY.GBP', '_GBSEED.BIN', '_GBSTEP.BIN', '_GBECL.BIN', '_GBECL.TXT',
  '_GBEVT.BIN', '_GBRES.BIN', '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW',
  '_GBCR.BIN', '_GBSESS.GBS', '_GBPICS.BIN', '_GBPIC.RAW', '_GBSCENE.GBI', '_GBAMIGA.GBI')

function New-Party($Title, [int]$Set, [string]$Run) {
  Clear-Sidecars $transient
  Set-Session $Title.CreateAt[0] $Title.CreateAt[1] $Title.CreateAt[2]
  $tag = ('{0}g{1}a' -f $Title.Label, $Set).ToLower()
  $createOut = Invoke-Gbboot $Run ("/E /T 1 {0}" -f $Title.Create) ("GBSC{0}A.TXT" -f $Set) $tag
  if ($createOut -notlike '*CCPARTY:*') {
    throw ("GBBOOT DOS pre-combat scene flow ({0} /G {1}) did not create a native party" -f $Title.Label, $Set)
  }
}

function Invoke-Arm($Title, [int]$Set, [string]$Run, [string]$Suffix, [string]$CmdTemplate) {
  if (-not $CmdTemplate) { $CmdTemplate = $Title.Cmd }
  $tag = ('{0}g{1}{2}' -f $Title.Label, $Set, $Suffix).ToLower()
  Clear-Sidecars @('_GBSTEP.BIN', '_GBECL.BIN', '_GBECL.TXT', '_GBEVT.BIN', '_GBRES.BIN',
    '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN',
    '_GBPICS.BIN', '_GBPIC.RAW', '_GBSCENE.GBI', '_GBAMIGA.GBI')
  Set-Session $Title.EventAt[0] $Title.EventAt[1] $Title.EventAt[2]
  $out = Invoke-Gbboot $Run ($CmdTemplate -f $Set) ("GBSC{0}{1}.TXT" -f $Set, $Suffix.ToUpper()) $tag
  if ($out -like '*native preview failed*') {
    throw ("GBBOOT DOS pre-combat scene flow ({0} /G {1} {2}) failed the native route:`n{3}" -f
      $Title.Label, $Set, $Suffix, $out)
  }
  $plan = ''
  foreach ($line in ($out -split "`r?`n")) { if ($line -like 'graphics:*') { $plan = $line.Trim() } }
  $collected = if ($Title.Label -eq 'DoK' -and $script:latestAckCaptureRoot) {
    Get-AckCollectedPictureIds $script:latestAckCaptureRoot
  } else { Get-CollectedPictureIds (Join-Path $build '_GBECL.TXT') }
  $presented = Get-PresentedPictureIds (Join-Path $build '_GBPICS.BIN')
  $history = @()
  if ($Suffix -eq 'd') {
    foreach ($trace in (Get-ChildItem (Join-Path $build ("{0}-GBPI-*.BIN" -f $tag)) -ErrorAction SilentlyContinue | Sort-Object Name)) {
      $history += ,(Get-PresentedPictureIds $trace.FullName)
    }
  }
  $scene = $null
  $scenePath = Join-Path $build '_GBSCENE.GBI'
  if (Test-Path $scenePath) { $scene = Read-Gbim $scenePath ("{0} /G {1}" -f $Title.Label, $Set) }
  return [pscustomobject]@{
    Set = $Set; Plan = $plan; Collected = $collected; Presented = $presented
    History = $history
    Expected = @($collected | Where-Object { $_ -ne 255 })
    Scene = $scene; FramePath = (Join-Path $build '_GBPIC.RAW')
    HasFrame = (Test-Path (Join-Path $build '_GBPIC.RAW'))
  }
}

# PROVENANCE ORACLE: decode the same logical block straight out of the retail DOS
# archive with CGB, outside the bridge under test.
function Get-DosOracleScene([string]$Run, [string]$Archive, [int]$Block, [string]$Label) {
  Remove-Item (Join-Path $build '_GBORCL.GBI') -Force -ErrorAction SilentlyContinue
  Invoke-Dosbox $Run ("C:\CGB /B {0} /I C:\_GBORCL.GBI {1}" -f $Block, $Archive) ("oracle{0}" -f $Block)
  $p = Join-Path $build '_GBORCL.GBI'
  if (-not (Test-Path $p)) {
    throw ("$Label CGB could not decode block {0} out of {1} standalone; the provenance oracle is unavailable" -f $Block, $Archive)
  }
  return (Read-Gbim $p $Label)
}

$report = @()
$failures = @()            # collected, not thrown, so the ratios below can read < N/N
$discriminating = 0        # arms whose route actually carries a PICTURE record
$dosPresented = 0          # of those, DOS-mode arms that presented every record
$dosRequired = 0
$provenanceOk = 0
$provenanceChecked = 0
$provenanceBlocks = 0      # blocks actually byte-compared against the CGB oracle
$provenanceBlocksTotal = 0 # blocks presented on those arms (the honest denominator)
$platformDiffs = 0
$platformCompared = 0
$steppedOk = 0
$steppedRequired = 0
$c64Selected = 0
$c64Required = 0

function Add-Failure([string]$Text) {
  $script:failures += $Text
  $script:report += ('  FAIL: ' + $Text)
}

foreach ($t in $titles) {
  $run = Join-Path $build ('gbscene-dos-flow-test-{0}' -f $t.Label)
  if (Test-Path $run) { Remove-Item -Recurse -Force $run }
  New-Item -ItemType Directory -Force $run | Out-Null
  foreach ($name in $t.DosFiles) { Copy-Item (Join-Path $t.Game $name) (Join-Path $run $name) -Force }
  foreach ($m in $t.AmigaMap) { Copy-Item (Join-Path $t.Amiga $m.Src) (Join-Path $run $m.Dst) -Force }

  $full = @{}
  foreach ($set in @(1, 2)) {
    New-Party $t $set $run
    $arm = Invoke-Arm $t $set $run 'b'
    $full[$set] = $arm

    $col = ($arm.Expected -join ',')
    $pre = ($arm.Presented -join ',')
    if ($arm.Expected.Count -eq 0) {
      $report += ("  {0} /G {1}: route carries NO PICTURE record -- 0 of 0 is not a pass, NOT counted" -f $t.Label, $set)
      if ($arm.Presented.Count -ne 0) {
        Add-Failure ("({0} /G {1}) presented [{2}] with no source record to present" -f $t.Label, $set, $pre)
      }
      continue
    }
    $discriminating++
    if ($set -eq 1) { $dosRequired++ }
    $armOk = $true
    if ($pre -ne $col) {
      $armOk = $false
      Add-Failure ("({0} /G {1}) presented [{2}] but CCEFX's dump of the source record names [{3}]" -f
        $t.Label, $set, $pre, $col)
    }
    if ($null -eq $arm.Scene) {
      $armOk = $false
      Add-Failure ("({0} /G {1}) presented {2} record(s) but decoded no _GBSCENE.GBI" -f
        $t.Label, $set, $arm.Presented.Count)
    } elseif ($arm.Scene.Distinct -lt 4 -or $arm.Scene.NonZero -lt 256) {
      $armOk = $false
      Add-Failure ("({0} /G {1}) decoded an implausibly blank scene: distinct={2} nonzero={3}" -f
        $t.Label, $set, $arm.Scene.Distinct, $arm.Scene.NonZero)
    }
    if (-not $arm.HasFrame) {
      $armOk = $false
      Add-Failure ("({0} /G {1}) produced no _GBPIC.RAW composited frame" -f $t.Label, $set)
    }
    if ($armOk) {
      Assert-SceneAt $arm.Scene $arm.FramePath ("GBBOOT DOS pre-combat scene flow ({0} /G {1})" -f $t.Label, $set) 8 8
      if ($set -eq 1) { $dosPresented++ }
      $report += ("  {0} /G {1}: collected [{2}] presented [{3}] = {4} of {5}; final scene block {6} {7}x{8} distinct {9} nonzero {10}; blitted into _GBPIC.RAW; plan '{11}'" -f
        $t.Label, $set, $col, $pre, $arm.Presented.Count, $arm.Expected.Count,
        $arm.Scene.Block, $arm.Scene.Width, $arm.Scene.Height, $arm.Scene.Distinct, $arm.Scene.NonZero, $arm.Plan)
    }
  }

  # C64 sides are external user assets, so their absence is a named per-arm
  # skip just like an unavailable Amiga extraction. When present, this is a
  # discriminating end-to-end check: generated C64 source -> GBBOOT /G 3 ->
  # CCFP's composited final frame. Keep the imported file in $run; Invoke-Arm
  # deliberately removes only bridge outputs from $build. C64 is passed to CCFP
  # directly, so unlike the DOS/Amiga decoder path it intentionally has no
  # _GBSCENE.GBI bridge copy to inspect.
  if ($t.ContainsKey('C64Disk')) {
    if (-not (Test-Path $t.C64Disk)) {
      $report += ("  SKIP ARM: {0} /G 3 C64 scene ({1} absent)" -f $t.Label, $t.C64Disk)
    } else {
      $c64Required++
      $c64Path = Join-Path $run 'C64SCENE.GBI'
      Remove-Item $c64Path -Force -ErrorAction SilentlyContinue
      & python (Join-Path $root 'tools\c64_native_scene.py') --disk $t.C64Disk --picture $t.C64Picture --block $t.C64Block --out $c64Path
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path $c64Path)) {
        Add-Failure ("({0} /G 3) could not import {1} from {2}" -f $t.Label, $t.C64Picture, $t.C64Disk)
      } else {
        $c64Source = Read-Gbim $c64Path ("{0} C64 source" -f $t.Label)
        New-Party $t 3 $run
        $c64Arm = Invoke-Arm $t 3 $run 'e'
        $c64Ok = $true
        $expectedPlan = 'graphics: C64 -> C64 (imported C64 scene bridge with DOS fallback)'
        if ($c64Arm.Plan -ne $expectedPlan) {
          $c64Ok = $false
          Add-Failure ("({0} /G 3) plan was '{1}', expected '{2}'" -f $t.Label, $c64Arm.Plan, $expectedPlan)
        }
        if (($c64Arm.Presented -join ',') -ne ($c64Arm.Expected -join ',')) {
          $c64Ok = $false
          Add-Failure ("({0} /G 3) presented [{1}] but CCEFX's source record names [{2}]" -f
            $t.Label, ($c64Arm.Presented -join ','), ($c64Arm.Expected -join ','))
        }
        $c64After = Read-Gbim $c64Path ("{0} C64 source after /G 3" -f $t.Label)
        if ($c64After.Block -ne $t.C64Block -or $c64After.Hex -ne $c64Source.Hex) {
          $c64Ok = $false
          Add-Failure ("({0} /G 3) overwrote or changed its imported C64 block {1} during fallback" -f $t.Label, $t.C64Block)
        }
        if (-not $c64Arm.HasFrame) {
          $c64Ok = $false
          Add-Failure ("({0} /G 3) produced no _GBPIC.RAW composited frame" -f $t.Label)
        }
        if ($c64Ok) {
          Assert-SceneAt $c64Source $c64Arm.FramePath ("GBBOOT C64 imported scene flow ({0} /G 3)" -f $t.Label) 8 8
          $c64Selected++
          $report += ("  {0} /G 3 C64: imported {1} as block {2}; collected [{3}] presented [{4}]; source GBIM survives fallback and is blitted into _GBPIC.RAW; plan '{5}'" -f
            $t.Label, $t.C64Picture, $t.C64Block, ($c64Arm.Expected -join ','), ($c64Arm.Presented -join ','), $c64Arm.Plan)
        }
      }
    }
  }

  if ($full[1].Expected.Count -eq 0) {
    $report += ("  {0}: no PICTURE record on its proven encounter, so the provenance, platform and termination checks have nothing to run on" -f $t.Label)
    continue
  }

  # (0) TERMINATION in ORDINARY STEPPED PLAY -- the arm the promoted bridge hung
  # on. Invoke-Dosbox throws on its own 90 s timeout, so a hang fails here rather
  # than being invisible behind /X. Measured: 90.01 s no-exit before this fix,
  # 1.59 s after, against 1.35 s on the pre-promotion binary.
  $steppedRequired++
  New-Party $t 1 $run
  $stepped = Invoke-Arm $t 1 $run 'd' $t.StepCmd
  $stepCol = ($stepped.Expected -join ',')
  $stepHistory = @($stepped.History)
  $stepHistoryText = @($stepHistory | ForEach-Object { $_ -join ',' })
  $fullTraceSeen = $stepHistoryText -contains $stepCol
  $finalTrace = if ($stepHistory.Count -gt 0) { [int[]]$stepHistory[$stepHistory.Count - 1] } else { [int[]]$stepped.Presented }
  $finalTraceText = ($finalTrace -join ',')
  if ($stepped.Expected.Count -lt 1) {
    Add-Failure ("({0} stepped /G 1) collected no PICTURE record on the non-snapshot command '{1}'; the arm that hung is not being exercised" -f
      $t.Label, ($t.StepCmd -f 1))
  } elseif ($stepHistory.Count -lt 2 -or -not $fullTraceSeen -or
            -not (Test-OrderedPictureSubsequence $finalTrace ([int[]]$stepped.Expected))) {
    Add-Failure ("({0} stepped /G 1) replay history [{1}] neither retained the complete initial source sequence [{2}] nor ended on an ordered source subsequence (final [{3}])" -f
      $t.Label, ($stepHistoryText -join ' -> '), $stepCol, $finalTraceText)
  } else {
    $steppedOk++
    $report += ("  {0} STEPPED (non-snapshot) '{1}': terminated; replay history [{2}] retains the complete source sequence [{3}] before a later ordered source subsequence [{4}]" -f
      $t.Label, ($t.StepCmd -f 1), ($stepHistoryText -join ' -> '), $stepCol, $finalTraceText)
  }

  # (2) PROVENANCE -- the /G 1 pixels came out of the retail DOS archive.
  # ONE block of the presented list, not all of them: _GBSCENE.GBI is rewritten
  # per picture, so only the final one survives the run to be compared.
  $provenanceChecked++
  $provenanceBlocksTotal += $full[1].Presented.Count
  $oracle = Get-DosOracleScene $run $t.Deprive $full[1].Scene.Block ("{0} /G 1" -f $t.Label)
  if ($oracle.Hex -ne $full[1].Scene.Hex) {
    Add-Failure ("({0} /G 1) block {1} does not match CGB's standalone decode of {2}: the presented pixels did not come from the retail DOS archive" -f
      $t.Label, $full[1].Scene.Block, $t.Deprive)
  } else {
    $provenanceOk++
    $provenanceBlocks++
    $report += ("  {0} /G 1 PROVENANCE: block {1} (1 of the {2} presented) is byte-identical to CGB's standalone decode of {3} ({4} pixels); the other {5} presented block(s) are compared to nothing" -f
      $t.Label, $full[1].Scene.Block, $full[1].Presented.Count, $t.Deprive,
      ($oracle.Width * $oracle.Height), ($full[1].Presented.Count - 1))
  }

  # (3) THE PLATFORM NULL, by deprivation. See the header for why a straight
  # /G 1 vs /G 2 pixel diff does not discriminate on this route.
  $hidden = Join-Path $run ($t.Deprive + '.HID')
  Rename-Item (Join-Path $run $t.Deprive) ($t.Deprive + '.HID') -Force
  try {
    $bare = @{}
    foreach ($set in @(1, 2)) {
      New-Party $t $set $run
      $bare[$set] = Invoke-Arm $t $set $run 'c'
    }
  } finally {
    Rename-Item $hidden $t.Deprive -Force
  }
  $bare1 = ($bare[1].Presented -join ',')
  $bare2 = ($bare[2].Presented -join ',')
  $platformCompared++
  $extra = @($bare[2].Presented | Where-Object { $bare[1].Presented -notcontains $_ })
  if ($bare[1].Presented.Count -ge $full[1].Presented.Count) {
    Add-Failure ("({0}) presented [{1}] under /G 1 with {2} removed, no shorter than the full [{3}]: the DOS archive is not the source of those frames" -f
      $t.Label, $bare1, $t.Deprive, ($full[1].Presented -join ','))
  } elseif ($extra.Count -lt 1) {
    Add-Failure ("({0}) with {1} removed presented [{2}] under /G 1 and [{3}] under /G 2 -- the Amiga archive supplied nothing the DOS request refused, so /G is selecting nothing" -f
      $t.Label, $t.Deprive, $bare1, $bare2)
  } else {
    $platformDiffs++
    $report += ("  {0} PLATFORM NULL: with {1} hidden and its Amiga sibling still in place, /G 1 presents [{2}] and /G 2 presents [{3}]; the Amiga-only id(s) [{4}] are refused under the DOS request" -f
      $t.Label, $t.Deprive, $bare1, $bare2, ($extra -join ','))
  }
}

$report | ForEach-Object { Write-Output $_ }

if ($discriminating -lt 1) {
  throw 'GBBOOT DOS pre-combat scene flow found no route carrying a PICTURE record; every arm scored 0 of 0 and 0 of 0 is not a pass'
}
if ($dosRequired -lt 1) {
  throw 'GBBOOT DOS pre-combat scene flow never measured a DOS-mode arm on a route carrying PICTURE records; the promoted gate was not exercised'
}
if ($steppedRequired -lt 1) {
  throw 'GBBOOT DOS pre-combat scene flow never ran the non-snapshot stepped arm; the mode that hung was not exercised'
}
if ($provenanceChecked -lt 1) {
  throw 'GBBOOT DOS pre-combat scene flow never ran the CGB provenance oracle; the presented pixels were never traced to the retail DOS archive'
}
if ($platformCompared -lt 1) {
  throw 'GBBOOT DOS pre-combat scene flow never ran the deprivation comparison; the platform null was not measured'
}

$summary = ("{0}/{1} DOS arms presented every collected record, {2}/{3} non-snapshot stepped arms terminated and matched, {4}/{5} provenance arms matched covering {6} of {7} presented blocks byte-compared, {8}/{9} platform-null comparisons discriminating, {10}/{11} C64 imports selected and composited, {12} discriminating arm(s)" -f
  $dosPresented, $dosRequired, $steppedOk, $steppedRequired, $provenanceOk, $provenanceChecked,
  $provenanceBlocks, $provenanceBlocksTotal, $platformDiffs, $platformCompared, $c64Selected, $c64Required, $discriminating)

if ($failures.Count -gt 0) {
  throw ("GBBOOT DOS pre-combat scene flow FAIL ({0}); {1} failure(s):`n  - {2}" -f
    $summary, $failures.Count, ($failures -join "`n  - "))
}
Write-Output ("RESULT: GBBOOT presents pre-combat PICTURE records in ordinary DOS-mode play PASS ({0})" -f $summary)
exit 0
