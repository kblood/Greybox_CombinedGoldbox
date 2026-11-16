# gbcombat-icon-flow-test.ps1 -- tactical combat icons under BOTH graphics sets.
#
# Before round 36 `prepare_combat_graphics` hard-required `/G 2` plus an Amiga
# CPIC archive, so in DOS mode `graphics_image_ready` was never set and NO combat
# icon was drawn at all. This exercises the DOS decode path added to
# native/src/gbboot.asm alongside the pre-existing Amiga one, on the two
# encounters already proven on real data by gbcok-playable-flow-test.ps1 and
# gbdok-playable-flow-test.ps1.
#
# WHAT THIS PROVES, and what it deliberately refuses to accept as proof:
#   1. Both arms decode a nonblank icon              (4 of 4: 2 titles x /G 1,/G 2)
#   2. The two platforms' RAW icon bytes DIFFER      (per shared block id)
#   3. THE NULL -- inside ONE DOS-mode run, two DIFFERENT monster ids must
#      produce DIFFERENT RAW bytes. "Nonblank" alone is worthless here: CCFP's
#      existing /E approach marker is nonblank and identical for every monster
#      type, which is exactly the failure this check exists to catch. A generic
#      per-id placeholder would still satisfy (1) and (2) and achieve nothing.
#   4. WIRING -- the icons reach CCCOMBAT, not just the filesystem. The same
#      encounter is replayed with CPIC1.DAX removed and the composited
#      _GBCOMB.RAW must differ. A GBIM sitting in build\ that nothing consumes
#      is the "solved but unwired" failure this repo has shipped nine times.
#   5. THE TAIL-OVERFLOW BRANCH ACTUALLY EXECUTES, and only when it should.
#      build_combat_tail's `.icon_too_long` arm shipped never having been
#      observed running, and its guard was inverted: it compared
#      toolpath_len(icon) + 4 + taillen against 127 while ' /P <roster>' -- 19
#      more bytes, and the one path in the tail that is NOT shortened -- was
#      appended after it. MEASURED on the shipped build, CoK proven encounter
#      plus the supported option /C G that gbboot-test.ps1:4138 also exercises:
#        before: final tail 130, clamped at 127, tailerr=1, truncation inside
#                ' /P C:\_GBPARTY.', console 'GBBOOT: native preview failed',
#                no _GBCOMB.RAW, and NO 'combat icon omitted' note
#        after:  guard sees 12 + 4 + 95 + 19 = 130 > 127, drops the icon, final
#                tail 114 tailerr=0, note printed, _GBCOMB.RAW written
#      The overflow arm below asserts BOTH sides: adding /C G must never produce
#      a truncated tail, and at least one title must actually reach
#      `.icon_too_long`. Without that second half a build that always dropped the
#      icon would read green. The plain arms above assert the other side -- they
#      must NOT print the note, because on them the tail measures 125 of 127
#      (margin 2, not the 3 first published) with the icon kept.
#
# Absent local game data or Amiga extractions SKIP. A run directory that HAS
# CPIC1.DAX but yields no decoded icon FAILS -- that is the regression this
# test exists for.
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
    Label     = 'CoK'
    Game      = Join-Path $root 'Champions of Krynn'
    Amiga     = Join-Path $root 'amiga_extracted\ChampionsOfKrynn\disk2'
    AmigaFallback = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\ChampionsOfKrynn\data'
    DosFiles  = @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX', 'CPIC1.DAX')
    AmigaMap  = @(@{ Src = '8X8D1.DAA'; Dst = '8X8D1.DAA' }, @{ Src = 'CPIC1.DAA'; Dst = 'CPIC1.DAA' })
    Create    = '/R ICONA C /R ICONB F /R ICONC M'
    CreateAt  = @(1, 7, 2)
    CombatAt  = @(1, 1, 0)
    CombatArg = ''
  },
  @{
    Label     = 'DoK'
    Game      = Join-Path $root 'Death Knights of Krynn'
    Amiga     = Join-Path $root 'amiga_extracted\DeathKnightsOfKrynn\disk1'
    AmigaFallback = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\DeathKnightsOfKrynn\data'
    DosFiles  = @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX', 'CPIC1.DAX', 'BIGPIC1.DAX')
    AmigaMap  = @(@{ Src = '8x8d1.daa'; Dst = '8X8D1.DAA' }, @{ Src = 'CPIC1.daa'; Dst = 'CPIC1.DAA' })
    Create    = '/R ICONA C /R ICONB K /R ICONC M /R ICOND T'
    CreateAt  = @(0, 0, 2)
    CombatAt  = @(10, 1, 2)
    CombatArg = '/A 1 /B 34'
  }
)

# --- availability gate: SKIP only for absent sources, never for a bad result --
if (-not (Test-Path $dosbox)) {
  Write-Output 'SKIP: GBBOOT combat-icon flow (DOSBox.exe absent)'
  exit 0
}
if (-not (Test-Path $dbx)) {
  Write-Output 'SKIP: GBBOOT combat-icon flow (DOSBox-X GameLink absent)'
  exit 0
}
foreach ($t in $titles) {
  $primaryComplete = @($t.AmigaMap | Where-Object { -not (Test-Path (Join-Path $t.Amiga $_.Src)) }).Count -eq 0
  if (-not $primaryComplete -and (Test-Path $t.AmigaFallback)) { $t.Amiga = $t.AmigaFallback }
  foreach ($name in $t.DosFiles) {
    if (-not (Test-Path (Join-Path $t.Game $name))) {
      Write-Output ("SKIP: GBBOOT combat-icon flow ({0} {1} absent)" -f $t.Label, $name)
      exit 0
    }
  }
  foreach ($m in $t.AmigaMap) {
    if (-not (Test-Path (Join-Path $t.Amiga $m.Src))) {
      Write-Output ("SKIP: GBBOOT combat-icon flow ({0} Amiga {1} absent)" -f $t.Label, $m.Src)
      exit 0
    }
  }
}

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
  foreach ($n in $Names) {
    Remove-Item (Join-Path $build $n) -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -Path $build -Filter '_GBCP?.GBI' -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
}

function Invoke-Gbboot([string]$Run, [string]$Cmd, [string]$Log, [string]$Tag) {
  if ($Title.Label -eq 'DoK') {
    $captureRoot = Join-Path $build 'gbcombat-icon-gamelink'
    Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $Run `
      -GuestCommand "C:\GBBOOT $Cmd > C:\$Log" `
      -DosLogFile (Join-Path $build ("{0}-files.log" -f $Tag)) `
      -CaptureRoot $captureRoot -TimeoutSeconds 45 | Out-Null
    $path = Join-Path $build $Log
    if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
      throw "GBBOOT combat-icon flow produced an empty or missing console log ($Tag)"
    }
    return (Get-Content -LiteralPath $path -Raw)
  }
  $conf = Join-Path $build ("_gbicon_{0}.conf" -f $Tag)
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$Run"
D:
C:\GBBOOT $Cmd > C:\$Log
exit
"@ | Set-Content $conf -Encoding ASCII
  Remove-Item (Join-Path $build $Log) -Force -ErrorAction SilentlyContinue
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$true
  if (-not $p.WaitForExit(60000)) {
    Stop-DosBoxSmoke -Process $p
    throw "GBBOOT combat-icon flow timed out ($Tag)"
  }
  $path = Join-Path $build $Log
  if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -eq 0) {
    throw "GBBOOT combat-icon flow produced an empty or missing console log ($Tag)"
  }
  return (Get-Content $path -Raw)
}

# GBIM v1: 'GBIM' u16 version, u16 logical block, u16 flags, u16 w, u16 h,
# then w*h index bytes and a 768-byte RGB palette. Same contract CCDAA and CGB
# both emit and CCCOMBAT's load_icon_gbim consumes.
function Read-Gbim([string]$Path, [string]$Label) {
  $b = [IO.File]::ReadAllBytes($Path)
  if ($b.Length -lt (14 + 1 + 768)) { throw "$Label GBIM $Path is too short ($($b.Length) bytes)" }
  if ([Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBIM') { throw "$Label $Path is not a GBIM resource" }
  if ([BitConverter]::ToUInt16($b, 4) -ne 1) { throw "$Label $Path is not GBIM v1" }
  $flags = [BitConverter]::ToUInt16($b, 8)
  if (($flags -band 1) -eq 0) { throw "$Label $Path is not flagged row-major; CCCOMBAT would reject it" }
  $w = [BitConverter]::ToUInt16($b, 10)
  $h = [BitConverter]::ToUInt16($b, 12)
  if ($w -le 0 -or $h -le 0 -or $w -gt 304 -or $h -gt 168) {
    throw "$Label $Path has a geometry CCCOMBAT would reject: ${w}x${h}"
  }
  $n = $w * $h
  if ($b.Length -lt (14 + $n + 768)) { throw "$Label $Path is shorter than its own ${w}x${h} geometry" }
  $px = New-Object byte[] $n
  [Array]::Copy($b, 14, $px, 0, $n)
  $seen = @{}
  $nonzero = 0
  foreach ($v in $px) {
    $seen[[int]$v] = $true
    if ($v -ne 0) { $nonzero++ }
  }
  return [pscustomobject]@{
    Path     = $Path
    File     = Split-Path -Leaf $Path
    Block    = [BitConverter]::ToUInt16($b, 6)
    Flags    = $flags
    Width    = $w
    Height   = $h
    Pixels   = $px
    Distinct = $seen.Count
    NonZero  = $nonzero
    Hex      = ([BitConverter]::ToString($px)).Replace('-', '')
  }
}

function Get-IconSet([string]$Label) {
  $out = @()
  foreach ($f in (Get-ChildItem -Path $build -Filter '_GBCP?.GBI' -ErrorAction SilentlyContinue | Sort-Object Name)) {
    $out += (Read-Gbim $f.FullName $Label)
  }
  return , $out
}

$transient = @('_GBPARTY.GBP', '_GBSEED.BIN', '_GBSTEP.BIN', '_GBECL.BIN', '_GBECL.TXT',
  '_GBEVT.BIN', '_GBRES.BIN', '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT',
  '_GBCOMB.RAW', '_GBCR.BIN', '_GBSESS.GBS')

# Run one title under one graphics set and return its decoded icon set plus the
# composited tactical frame.
function Invoke-Arm($Title, [int]$Set, [string]$Run) {
  $tag = ('{0}g{1}' -f $Title.Label, $Set).ToLower()
  Clear-Sidecars $transient
  Set-Session $Title.CreateAt[0] $Title.CreateAt[1] $Title.CreateAt[2]
  $createOut = Invoke-Gbboot $Run ("/E /T 1 {0}" -f $Title.Create) ("GBIC{0}A.TXT" -f $Set) ("${tag}a")
  if ($createOut -notlike '*CCPARTY:*') {
    throw ("GBBOOT combat-icon flow ({0} /G {1}) did not create a native party" -f $Title.Label, $Set)
  }
  Clear-Sidecars @('_GBSTEP.BIN', '_GBECL.BIN', '_GBECL.TXT', '_GBEVT.BIN',
    '_GBRES.BIN', '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')
  Set-Session $Title.CombatAt[0] $Title.CombatAt[1] $Title.CombatAt[2]
  $argline = ("/E /G {0} {1} /T 1" -f $Set, $Title.CombatArg).Replace('  ', ' ')
  $combatOut = Invoke-Gbboot $Run $argline ("GBIC{0}B.TXT" -f $Set) ("${tag}b")
  if ($combatOut -like '*GBBOOT: native preview failed*') {
    throw ("GBBOOT combat-icon flow ({0} /G {1}) failed to reach native combat:`n{2}" -f $Title.Label, $Set, $combatOut)
  }
  if ($combatOut -like '*combat icon omitted*') {
    throw ("GBBOOT combat-icon flow ({0} /G {1}) dropped the icon argument: the CCCOMBAT command tail is full" -f $Title.Label, $Set)
  }
  $rawPath = Join-Path $build '_GBCOMB.RAW'
  if (-not (Test-Path $rawPath)) {
    throw ("GBBOOT combat-icon flow ({0} /G {1}) produced no _GBCOMB.RAW tactical frame" -f $Title.Label, $Set)
  }
  $raw = [IO.File]::ReadAllBytes($rawPath)
  if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200 -or
      $raw.Length -ne (4 + (320 * 200) + 768)) {
    throw ("GBBOOT combat-icon flow ({0} /G {1}) wrote a malformed tactical frame" -f $Title.Label, $Set)
  }
  $icons = Get-IconSet ("{0} /G {1}" -f $Title.Label, $Set)
  return [pscustomobject]@{ Icons = $icons; Raw = $raw; Out = $combatOut }
}

# The tail-overflow arm. Same encounter, same graphics set, plus one supported
# extra option, so the only thing that changes is the length of the CCCOMBAT
# command tail. Deliberately does NOT assert success/failure itself: the caller
# decides, because both "the icon was dropped" and "the tail still fit" are legal
# outcomes and only a TRUNCATED tail is a defect.
function Invoke-OverflowArm($Title, [int]$Set, [string]$Run, [string]$Extra) {
  $tag = ('{0}g{1}ovf' -f $Title.Label, $Set).ToLower()
  Clear-Sidecars $transient
  Set-Session $Title.CreateAt[0] $Title.CreateAt[1] $Title.CreateAt[2]
  $createOut = Invoke-Gbboot $Run ("/E /T 1 {0}" -f $Title.Create) ("GBIO{0}A.TXT" -f $Set) ("${tag}a")
  if ($createOut -notlike '*CCPARTY:*') {
    throw ("GBBOOT combat-icon overflow arm ({0} /G {1}) did not create a native party" -f $Title.Label, $Set)
  }
  Clear-Sidecars @('_GBSTEP.BIN', '_GBECL.BIN', '_GBECL.TXT', '_GBEVT.BIN',
    '_GBRES.BIN', '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')
  Set-Session $Title.CombatAt[0] $Title.CombatAt[1] $Title.CombatAt[2]
  $argline = ("/E /G {0} {1} {2} /T 1" -f $Set, $Title.CombatArg, $Extra).Replace('  ', ' ')
  $out = Invoke-Gbboot $Run $argline ("GBIO{0}B.TXT" -f $Set) ("${tag}b")
  return [pscustomobject]@{
    Args    = $argline
    Out     = $out
    Dropped = ($out -like '*combat icon omitted*')
    Failed  = ($out -like '*native preview failed*')
    HasRaw  = (Test-Path (Join-Path $build '_GBCOMB.RAW'))
  }
}

$nonblank = 0
$overflowRuns = 0        # titles whose tail-overflow arm actually ran
$overflowIntact = 0      # of those, arms whose tail was NOT truncated
$overflowDropped = 0     # of those, arms that actually reached .icon_too_long
$plainKeptIcon = 0       # plain arms that did NOT drop the icon (the other side)
$plainKeptRequired = 0
$nonblankRequired = 0
$platformDiffs = 0
$platformCompared = 0
$perIdDiffs = 0
$perIdCompared = 0
$report = @()

foreach ($t in $titles) {
  $run = Join-Path $build ('gbcombat-icon-flow-test-{0}' -f $t.Label)
  if (Test-Path $run) { Remove-Item -Recurse -Force $run }
  New-Item -ItemType Directory -Force $run | Out-Null
  foreach ($name in $t.DosFiles) { Copy-Item (Join-Path $t.Game $name) (Join-Path $run $name) -Force }
  foreach ($m in $t.AmigaMap) { Copy-Item (Join-Path $t.Amiga $m.Src) (Join-Path $run $m.Dst) -Force }

  $arms = @{}
  foreach ($set in @(1, 2)) {
    $arm = Invoke-Arm $t $set $run
    $arms[$set] = $arm

    # (5, the OTHER side) the plain arm must NOT drop the icon. Invoke-Arm
    # already throws if it does; counted here so the ratio is visible and so a
    # build that dropped the icon unconditionally cannot read green below.
    $plainKeptRequired++
    if ($arm.Out -notlike '*combat icon omitted*') { $plainKeptIcon++ }

    # (1) a nonblank icon frame, for this title under this graphics set
    $nonblankRequired++
    if ($arm.Icons.Count -lt 1) {
      throw ("GBBOOT combat-icon flow ({0} /G {1}) decoded NO icon although CPIC1.DAX/DAA is present in the run directory" -f $t.Label, $set)
    }
    foreach ($ic in $arm.Icons) {
      if ($ic.Distinct -lt 4 -or $ic.NonZero -lt 64) {
        throw ("GBBOOT combat-icon flow ({0} /G {1}) icon {2} block {3} is implausibly blank: distinct={4} nonzero={5}/{6}" -f
          $t.Label, $set, $ic.File, $ic.Block, $ic.Distinct, $ic.NonZero, ($ic.Width * $ic.Height))
      }
    }
    $seenBlocks = @{}
    foreach ($ic in $arm.Icons) {
      if ($seenBlocks.ContainsKey([int]$ic.Block)) {
        throw ("GBBOOT combat-icon flow ({0} /G {1}) decoded block {2} twice: the icon series is not keyed on the monster id" -f $t.Label, $set, $ic.Block)
      }
      $seenBlocks[[int]$ic.Block] = $true
    }
    $nonblank++
    $report += ("  {0} /G {1}: {2} icon(s), blocks [{3}], geometry {4}x{5}, distinct {6}, nonzero {7}/{8}" -f
      $t.Label, $set, $arm.Icons.Count,
      (($arm.Icons | ForEach-Object { $_.Block }) -join ','),
      $arm.Icons[0].Width, $arm.Icons[0].Height,
      (($arm.Icons | ForEach-Object { $_.Distinct }) -join ','),
      (($arm.Icons | ForEach-Object { $_.NonZero }) -join ','),
      ($arm.Icons[0].Width * $arm.Icons[0].Height))

    # (3) THE NULL: two different monster ids inside this one run must not be
    # byte-identical. Only scored in DOS mode, where the new path is.
    if ($set -eq 1 -and $arm.Icons.Count -ge 2) {
      for ($i = 0; $i -lt $arm.Icons.Count; $i++) {
        for ($j = $i + 1; $j -lt $arm.Icons.Count; $j++) {
          $a = $arm.Icons[$i]; $b = $arm.Icons[$j]
          if ($a.Block -eq $b.Block) { continue }
          $perIdCompared++
          if ($a.Hex -eq $b.Hex) {
            throw ("GBBOOT combat-icon flow ({0} /G 1) drew the SAME bytes for monster ids {1} and {2}: the DOS path is a per-id placeholder, not a decode" -f
              $t.Label, $a.Block, $b.Block)
          }
          $perIdDiffs++
          $report += ("  {0} /G 1 NULL: block {1} vs block {2} RAW bytes differ" -f $t.Label, $a.Block, $b.Block)
        }
      }
    }
  }

  # (2) the two platforms' RAW icon bytes must differ for every shared block id
  $dosByBlock = @{}
  foreach ($ic in $arms[1].Icons) { $dosByBlock[[int]$ic.Block] = $ic }
  $shared = 0
  foreach ($ic in $arms[2].Icons) {
    $key = [int]$ic.Block
    if (-not $dosByBlock.ContainsKey($key)) { continue }
    $shared++
    $platformCompared++
    if ($dosByBlock[$key].Hex -eq $ic.Hex) {
      throw ("GBBOOT combat-icon flow ({0}) block {1} is byte-identical under /G 1 and /G 2: the graphics set is not selecting anything" -f $t.Label, $key)
    }
    $platformDiffs++
    $report += ("  {0} block {1}: /G 1 and /G 2 RAW bytes differ (DOS distinct={2}, Amiga distinct={3})" -f
      $t.Label, $key, $dosByBlock[$key].Distinct, $ic.Distinct)
  }
  if ($shared -lt 1) {
    throw ("GBBOOT combat-icon flow ({0}) decoded no block id under BOTH graphics sets; there is nothing to compare" -f $t.Label)
  }

  # (4) WIRING: hide the DOS source and prove the composited tactical frame
  # changes. Without this, a GBIM nobody consumes still reads green above.
  if ($t.Label -eq 'CoK') {
    $withIcons = $arms[1].Raw
    Rename-Item (Join-Path $run 'CPIC1.DAX') 'CPIC1.HID' -Force
    try {
      $bare = Invoke-Arm $t 1 $run
    } finally {
      Rename-Item (Join-Path $run 'CPIC1.HID') 'CPIC1.DAX' -Force
    }
    if ($bare.Icons.Count -ne 0) {
      throw 'GBBOOT combat-icon wiring probe still decoded an icon with the DOS CPIC source removed; the probe cannot fail'
    }
    $bareRaw = $bare.Raw
    if ($bareRaw.Length -ne $withIcons.Length) {
      throw 'GBBOOT combat-icon wiring probe changed the tactical frame size'
    }
    $diff = 0
    for ($i = 4; $i -lt (4 + 320 * 200); $i++) {
      if ($bareRaw[$i] -ne $withIcons[$i]) { $diff++ }
    }
    if ($diff -eq 0) {
      throw 'GBBOOT combat-icon WIRING FAILURE: CCCOMBAT composited the identical tactical frame with and without the decoded DOS icons; the /I handoff is not reaching the renderer'
    }
    $report += ("  CoK WIRING: {0} of 64000 tactical-frame pixels change when the DOS CPIC source is removed" -f $diff)
  }

  # (5) THE TAIL-OVERFLOW BRANCH. '/C G' is a supported CCCOMBAT script option,
  # so this changes only the tail length. A truncated tail is the defect; the
  # icon being dropped, or the tail still fitting, are both legal.
  $overflowRuns++
  $ovf = Invoke-OverflowArm $t 1 $run '/C G'
  if ($ovf.Failed -or (-not $ovf.HasRaw)) {
    throw ("GBBOOT combat-icon TAIL OVERFLOW ({0} /G 1, '{1}'): the CCCOMBAT tail was truncated and the combat did not run (failed={2}, _GBCOMB.RAW={3}, dropped-icon note={4}). The icon guard is not reserving everything appended after it." -f
      $t.Label, $ovf.Args, $ovf.Failed, $ovf.HasRaw, $ovf.Dropped)
  }
  $overflowIntact++
  if ($ovf.Dropped) {
    $overflowDropped++
    $report += ("  {0} TAIL OVERFLOW: '{1}' reached .icon_too_long -- icon dropped, combat still ran (_GBCOMB.RAW present)" -f $t.Label, $ovf.Args)
  } else {
    $report += ("  {0} TAIL OVERFLOW: '{1}' still fit under 127 bytes; icon kept, combat ran. This arm did NOT exercise .icon_too_long" -f $t.Label, $ovf.Args)
  }
}

if ($perIdCompared -lt 1) {
  throw 'GBBOOT combat-icon flow never compared two different monster ids in one DOS-mode run; the per-id null was not measured and 0/0 is not a pass'
}
if ($platformCompared -lt 2) {
  throw ("GBBOOT combat-icon flow compared only {0} block id(s) across the two graphics sets; expected at least one per title" -f $platformCompared)
}
if ($overflowRuns -lt 1) {
  throw 'GBBOOT combat-icon flow never ran the tail-overflow arm; the length guard was not exercised at all'
}
if ($overflowDropped -lt 1) {
  throw ("GBBOOT combat-icon flow ran {0} tail-overflow arm(s) and NONE of them reached .icon_too_long. The branch is still unobserved: either the extra option no longer lengthens the tail past 127, or the guard cannot fire. 0 of {0} is not a pass." -f $overflowRuns)
}
if ($plainKeptIcon -ne $plainKeptRequired) {
  throw ("GBBOOT combat-icon flow: {0} of {1} plain arms kept the icon. A build that drops the icon when it fits is as wrong as one that keeps it when it does not." -f
    $plainKeptIcon, $plainKeptRequired)
}
$report | ForEach-Object { Write-Output $_ }
Write-Output ("RESULT: GBBOOT combat icons decode under BOTH graphics sets PASS ({0}/{1} nonblank arms, {2}/{3} cross-platform RAW diffs nonzero, {4}/{5} same-run per-monster-id diffs nonzero, {6}/{7} overflow arms kept an intact tail of which {8} reached .icon_too_long, {9}/{10} plain arms kept the icon)" -f
  $nonblank, $nonblankRequired, $platformDiffs, $platformCompared, $perIdDiffs, $perIdCompared,
  $overflowIntact, $overflowRuns, $overflowDropped, $plainKeptIcon, $plainKeptRequired)
exit 0
