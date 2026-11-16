# gbboot-test.ps1 -- headless smoke test for GBBOOT.COM detection.
#
# Builds the native targets, runs GBBOOT under DOSBox in dry-run mode against the
# local Krynn game folders plus marker-only fixtures, and validates the profile
# text. With -EngineSmoke, also launches native /E map-preview cases through the
# non-interactive /X snapshot path and checks the CCECL->CCCOMBAT handoff for a
# deterministic synthetic encounter. Generated walls/snapshot files live under
# native\build\gbboot-test.
#
# No game-data folder is modified. That sentence used to stand here unqualified
# and it was FALSE: the CoK/DoK/DQK engine-smoke cases did `mount D "<retail>"`
# followed by `D:`, making the read-only GOG release the DOS child's current
# drive, and a measured run of the sibling gbflow-test.ps1 on 2026-09-05 created
# "Champions of Krynn/CCFP.MOV" and rewrote six tracked SAVE/CHRDATA*.SAV that
# way. Every retail (and *_extracted) mount below now goes through
# New-RetailStage, which mirrors the source into native\build\_retail and
# mounts the mirror instead.
#
# THAT LAST SENTENCE WAS FALSE IN THE FILE IT WAS WRITTEN IN, and became true
# only with the staging three lines above $cases. The sweep that established the
# invariant grepped for the literal `mount D "$var"`; this file's dry-run batches
# build their mount with a FORMAT STRING -- `('mount D "{0}"' -f $c.dir)` in
# Invoke-DryRunBatch -- so 24 raw retail paths in $cases (COK/DOK/DQK) and
# $engineCases (ECOK*/EDOK*/EDQK*) were never seen. THE LESSON IS THE GREP, NOT
# THE COUNT: when auditing mounts, search for the CONSTRUCTION (mount, -f,
# .Add(), here-strings) and not for one spelling of it.
#
# CALIBRATE THE RISK HONESTLY. Those 24 were low-risk, not zero-risk, and the
# defect was that the invariant was UNESTABLISHED while this comment asserted
# it -- the first case to drop /D would have inherited the hazard silently.
# Verified by reading native/src/gbboot.asm, not by running it: every one of the
# 24 invokes GBBOOT /D or /D /E, and the dry-run gate (`cmp byte [dryrun],0` /
# `jne .ok`) returns before both the EXEC branch and the native-chain branch, so
# no child process is ever launched (the diagnostic is 'dry-run: not launching
# child executable'). GBBOOT's own detect path only reads -- INT 21h AH=43h
# GetAttributes via file_exists, plus find_exists (AH=4Eh) whose only wildcard
# in the whole binary is '*.DAX' -- and every AH=3Ch/40h/41h create/write/delete
# site sits either in puts (AH=40h to STDOUT, redirected to C:) or in the native
# engine path the dry-run gate skips.
#
# STAGING CANNOT CHANGE WHAT THESE CASES DETECT, and that too is checkable by
# reading: New-RetailStage omits only DOSBOX/, tools/, docs/, Documentation/,
# __pycache__/, .git/ and *.pdf/*.ico/*.lnk, while every probe above is either a
# named game file (START.EXE, KRYNN.CFG, DQK.EXE, DISK*\*.GLB/TLB, GEO?.DAX...)
# or the '*.DAX' wildcard. None of the excluded content can match either.
# UNVERIFIED BY A RUN, stated plainly: round 37 R2 was forbidden to start DOSBox
# or touch native\build while another agent held that directory, so no session
# has re-observed the 24 expected strings, and nothing has measured the one real
# behaviour change -- the three mirrors are now built on EVERY run of this
# script, where before they were built only under -EngineSmoke. That costs one
# tree copy the first time and a directory walk thereafter.
#
# RE-CHECKED AND *NOT* OFFENDERS: the two other format-string mounts, on
# $case.Dir in Invoke-CombatHandoffBatch and $c.Dir in Invoke-MapPreviewBatch.
# Every value either expression can hold was traced back to its assignment --
# 11 New-Fixture dirs for the first, 60 New-Fixture / `Join-Path $run` dirs for
# the second -- and all of them live under native\build\gbboot-test. Retail and
# *_extracted paths appear near them only as Copy-Item SOURCES whose destination
# is scratch, and the param block offers no -GamePath-style override ($root is a
# hard literal). Worth knowing anyway: both sites Remove-Item a file INSIDE the
# case dir (CCCOMB.TRC, CCFPVIEW.RAW) and then make it current with `D:`, so
# adding a retail folder to either case list would be destructive immediately,
# not merely on a stray child write.
param(
  [switch]$EngineSmoke,
  [switch]$Headless,
  [switch]$Visible,
  [string]$CokAmigaPath = ""
)
$ErrorActionPreference = "Stop"

$useHeadless = -not $Visible
if ($Headless) {
  $useHeadless = $true
}
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "gbboot-test"
$fixtures = Join-Path $run "fixtures"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")
. (Join-Path $native "retail-stage.ps1")

& (Join-Path $native "build.ps1") -Target gbboot
& (Join-Path $native "build.ps1") -Target ccecl
& (Join-Path $native "build.ps1") -Target ccflow
& (Join-Path $native "build.ps1") -Target ccbind
& (Join-Path $native "build.ps1") -Target ccefx
& (Join-Path $native "build.ps1") -Target cchost
& (Join-Path $native "build.ps1") -Target ccmenu
& (Join-Path $native "build.ps1") -Target ccgeo
& (Join-Path $native "build.ps1") -Target ccfp
& (Join-Path $native "build.ps1") -Target cchlib
& (Join-Path $native "build.ps1") -Target cccombat
& (Join-Path $native "build.ps1") -Target gbmark
& (Join-Path $native "build.ps1") -Target gbmarkf
& (Join-Path $native "build.ps1") -Target ccdaa
& (Join-Path $native "build.ps1") -Target ccparty
& (Join-Path $native "build.ps1") -Target ccinv
& (Join-Path $native "build.ps1") -Target cgb

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "gbboot.com") (Join-Path $run "GBBOOT.COM") -Force
Copy-Item (Join-Path $build "ccecl.com") (Join-Path $run "CCECL.COM") -Force
Copy-Item (Join-Path $build "ccflow.com") (Join-Path $run "CCFLOW.COM") -Force
Copy-Item (Join-Path $build "ccbind.com") (Join-Path $run "CCBIND.COM") -Force
Copy-Item (Join-Path $build "ccefx.com") (Join-Path $run "CCEFX.COM") -Force
Copy-Item (Join-Path $build "cchost.com") (Join-Path $run "CCHOST.COM") -Force
Copy-Item (Join-Path $build "ccmenu.com") (Join-Path $run "CCMENU.COM") -Force
Copy-Item (Join-Path $build "ccgeo.com") (Join-Path $run "CCGEO.COM") -Force
Copy-Item (Join-Path $build "ccfp.com") (Join-Path $run "CCFP.COM") -Force
Copy-Item (Join-Path $build "cchlib.com") (Join-Path $run "CCHLIB.COM") -Force
Copy-Item (Join-Path $build "cccombat.com") (Join-Path $run "CCCOMBAT.COM") -Force
Copy-Item (Join-Path $build "ccdaa.com") (Join-Path $run "CCDAA.COM") -Force
Copy-Item (Join-Path $build "ccparty.com") (Join-Path $run "CCPARTY.COM") -Force
# CCINV.COM was MISSING from this list, and it is not cosmetic: GBBOOT execs
# exactly ten helper COMs (the `db '<NAME>.COM',0` strings in native\src\gbboot.asm)
# and this list carried nine.  For a CoK profile write_seed_sidecar calls
# inventory_ensure -> inventory_run -> CCINV.COM before anything else, so every
# CoK case here died at run_native_preview gate 7 with the generic "native
# preview failed (missing GEO/ECL/art/monster data or native helper COM files)".
# Measured 2026-09-10 on an unmodified native/src at HEAD: five dry-run cases
# (XSEED, XSEEDD, XSEEDAUTO, XCAFFAUTO, XCCAUTO) and the CoK engine-smoke cases
# were red for this reason, and the file is in no sweep, so nothing said so.
Copy-Item (Join-Path $build "ccinv.com") (Join-Path $run "CCINV.COM") -Force
Copy-Item (Join-Path $build "cgb.com") (Join-Path $run "CGB.COM") -Force
$gbmark = Join-Path $build "gbmark.com"
$gbmarkf = Join-Path $build "gbmarkf.com"

function New-Fixture {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string[]]$Files
  )
  $dir = Join-Path $fixtures $Name
  New-Item -ItemType Directory -Force $dir | Out-Null
  foreach ($f in $Files) {
    $path = Join-Path $dir $f
    $parent = Split-Path $path -Parent
    New-Item -ItemType Directory -Force $parent | Out-Null
    New-Item -ItemType File -Force $path | Out-Null
    # CCPARTY rejects a DQK QCH shorter than its physical field span (0x19E,
    # 2c0bd069); an empty placeholder is no longer a valid roster record.
    if ($f -like '*.QCH') { [IO.File]::WriteAllBytes($path, (New-Object byte[] 0x19E)) }
  }
  return $dir
}

function Get-U16LE([byte[]]$Bytes, [int]$Offset) {
  return ([int]$Bytes[$Offset]) -bor (([int]$Bytes[$Offset + 1]) -shl 8)
}

function Get-U32LE([byte[]]$Bytes, [int]$Offset) {
  return [BitConverter]::ToUInt32($Bytes, $Offset)
}

function ConvertTo-IntList([object]$Value) {
  $values = @($Value)
  if ($values.Count -eq 1 -and $values[0] -is [array]) {
    $values = @($values[0])
  }
  [int[]]$out = @()
  foreach ($v in $values) {
    $out += [int]$v
  }
  return ,$out
}

function Assert-GbpsWords([byte[]]$Bytes, [int]$Offset, [int]$Capacity, [object]$Expected, [string]$Label, [string]$Field) {
  [int[]]$expectedValues = ConvertTo-IntList $Expected
  for ($i = 0; $i -lt $Capacity; $i++) {
    [int]$actual = Get-U16LE $Bytes ($Offset + ($i * 2))
    [int]$expected = if ($i -lt $expectedValues.Count) { $expectedValues[$i] } else { 0 }
    if ($actual -ne $expected) {
      throw "$Label GBPS $Field[$i] expected $expected, got $actual"
    }
  }
}

function Assert-GbpsPairs([byte[]]$Bytes, [int]$Offset, [int]$Capacity, [object]$Expected, [string]$Label, [string]$Field) {
  [int[]]$expectedValues = ConvertTo-IntList $Expected
  if (($expectedValues.Count % 2) -ne 0) {
    throw "$Label GBPS expected $Field pair list has odd length"
  }
  for ($i = 0; $i -lt ($Capacity * 2); $i++) {
    [int]$actual = Get-U16LE $Bytes ($Offset + ($i * 2))
    [int]$expected = if ($i -lt $expectedValues.Count) { $expectedValues[$i] } else { 0 }
    if ($actual -ne $expected) {
      throw "$Label GBPS $Field[$i] expected $expected, got $actual"
    }
  }
}

function Assert-GbpsSidecar {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Label,
    [int]$Version = 1,
    [int]$Flags = 0,
    [int]$Count = 0,
    [int]$Ranger = 0,
    [int]$Distance = 0,
    [int[]]$Items = @(),
    [int[]]$Affects = @(),
    [int[]]$MemberAffects = @(),
    [int[]]$Moves = @(),
    [int[]]$Thieves = @(),
    [int[]]$ThiefMatrix = @(),
    [int[]]$Spells = @(),
    [int[]]$MemberSpells = @(),
    [int[]]$OwnedEffects = @()
  )

  if (-not (Test-Path $Path)) {
    throw "$Label GBPS sidecar was not created"
  }
  [byte[]]$b = [IO.File]::ReadAllBytes($Path)
  # CoK's inventory bridge appends its 32-byte ownership-query bitmap and
  # upgrades the otherwise-v5 prefix to GBPS v6.  Keep that length separate
  # from v5 so an accidental downgrade cannot be mistaken for a valid prefix.
  $expectedLength = switch ($Version) { 6 { 3160 } 5 { 3128 } 4 { 540 } 3 { 282 } 2 { 216 } default { 150 } }
  if ($b.Length -ne $expectedLength) {
    throw "$Label GBPS length expected $expectedLength, got $($b.Length)"
  }
  if ([Text.Encoding]::ASCII.GetString($b, 0, 4) -ne "GBPS") {
    throw "$Label GBPS magic mismatch"
  }
  if ((Get-U16LE $b 4) -ne $Version) {
    throw "$Label GBPS version expected $Version, got $(Get-U16LE $b 4)"
  }
  if ((Get-U16LE $b 6) -ne $Flags) {
    throw "$Label GBPS flags expected $Flags, got $(Get-U16LE $b 6)"
  }
  if ((Get-U16LE $b 8) -ne $Count) {
    throw "$Label GBPS count expected $Count, got $(Get-U16LE $b 8)"
  }
  if ((Get-U16LE $b 10) -ne $Ranger) {
    throw "$Label GBPS ranger expected $Ranger, got $(Get-U16LE $b 10)"
  }
  if ((Get-U16LE $b 12) -ne $Distance) {
    throw "$Label GBPS distance expected $Distance, got $(Get-U16LE $b 12)"
  }

  $expectedCounts = @(
    $Items.Count,
    $Affects.Count,
    [int]($MemberAffects.Count / 2),
    $Moves.Count,
    $Thieves.Count,
    $Spells.Count,
    [int]($MemberSpells.Count / 2)
  )
  for ($i = 0; $i -lt $expectedCounts.Count; $i++) {
    $actual = [int]$b[14 + $i]
    if ($actual -ne $expectedCounts[$i]) {
      throw "$Label GBPS count byte $i expected $($expectedCounts[$i]), got $actual"
    }
  }
  if ($b[21] -ne 0) {
    throw "$Label GBPS reserved byte expected 0, got $($b[21])"
  }

  Assert-GbpsWords -Bytes $b -Offset 22 -Capacity 8 -Expected (, $Items) -Label $Label -Field "item"
  Assert-GbpsWords -Bytes $b -Offset 38 -Capacity 8 -Expected (, $Affects) -Label $Label -Field "affect"
  Assert-GbpsPairs -Bytes $b -Offset 54 -Capacity 4 -Expected (, $MemberAffects) -Label $Label -Field "memberAffect"
  Assert-GbpsWords -Bytes $b -Offset 70 -Capacity 8 -Expected (, $Moves) -Label $Label -Field "move"
  Assert-GbpsWords -Bytes $b -Offset 86 -Capacity 8 -Expected (, $Thieves) -Label $Label -Field "thief"
  Assert-GbpsWords -Bytes $b -Offset 102 -Capacity 16 -Expected (, $Spells) -Label $Label -Field "spell"
  Assert-GbpsPairs -Bytes $b -Offset 134 -Capacity 4 -Expected (, $MemberSpells) -Label $Label -Field "memberSpell"
  if ($Version -ge 2) {
    [int[]]$expectedMatrix = ConvertTo-IntList $ThiefMatrix
    [int]$expectedRows = if ($expectedMatrix.Count -eq 0) { 0 } else { [Math]::Ceiling($expectedMatrix.Count / 8) }
    if ($b[150] -ne $expectedRows) {
      throw "$Label GBPS thief matrix row count expected $expectedRows, got $($b[150])"
    }
    if ($b[151] -ne 0) {
      throw "$Label GBPS thief matrix reserved byte expected 0, got $($b[151])"
    }
    for ($i = 0; $i -lt 64; $i++) {
      [int]$actual = [int]$b[152 + $i]
      [int]$expected = if ($i -lt $expectedMatrix.Count) { $expectedMatrix[$i] } else { 0 }
      if ($actual -ne $expected) {
        throw "$Label GBPS thiefMatrix[$i] expected $expected, got $actual"
      }
    }
  }
  if ($Version -ge 4) {
    # Version 4 reserves the ownership block; its flag says whether this seed
    # actually carries imported per-member effects. CoK v6 seeds inherit the
    # block even when the inventory bridge is their only extended payload.
    [int]$expectedOwnershipFlag = if ($OwnedEffects.Count -gt 0) { 1 } else { 0 }
    if ((Get-U16LE $b 282) -ne $expectedOwnershipFlag) {
      throw "$Label effect-ownership flag expected $expectedOwnershipFlag, got $(Get-U16LE $b 282)"
    }
    $want = [byte[]]::new(256)
    for ($i=0; $i -lt $OwnedEffects.Count; $i+=2) {
      $member = $OwnedEffects[$i]-1
      $id = $OwnedEffects[$i+1]
      $at = 32*$member + [int][Math]::Floor($id/8)
      $want[$at] = $want[$at] -bor (1 -shl ($id % 8))
    }
    for ($i=0; $i -lt 256; $i++) {
      if ($b[284+$i] -ne $want[$i]) { throw "$Label effect ownership byte $i differs" }
    }
  }
  Write-Output "[PASS] ${Label}: GBPS sidecar bytes"
}

function Write-SyntheticGeoDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 1
  )

  $compressed = [System.Collections.Generic.List[byte]]::new()
  $remaining = 1026
  while ($remaining -gt 0) {
    $chunk = [Math]::Min(128, $remaining)
    $compressed.Add([byte](256 - $chunk))
    $compressed.Add([byte]0)
    $remaining -= $chunk
  }

  [byte[]]$comp = $compressed.ToArray()
  [byte[]]$bytes = [byte[]]::new(11 + $comp.Length)
  # u16 toc_bytes=9, then one DAX entry:
  # { id=BlockId, dataOffset=0, rawSize=1026, compSize=len(comp) }.
  $bytes[0] = 9
  $bytes[2] = $BlockId
  $bytes[7] = 0x02
  $bytes[8] = 0x04
  $bytes[9] = [byte]($comp.Length -band 0xFF)
  $bytes[10] = [byte](($comp.Length -shr 8) -band 0xFF)
  [Array]::Copy($comp, 0, $bytes, 11, $comp.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function ConvertTo-DaxLiteralRle {
  param(
    [Parameter(Mandatory)][byte[]]$Raw
  )

  $compressed = [System.Collections.Generic.List[byte]]::new()
  $offset = 0
  while ($offset -lt $Raw.Length) {
    $chunk = [Math]::Min(128, $Raw.Length - $offset)
    $compressed.Add([byte]($chunk - 1))
    for ($i = 0; $i -lt $chunk; $i++) {
      $compressed.Add($Raw[$offset + $i])
    }
    $offset += $chunk
  }
  return $compressed.ToArray()
}

function ConvertTo-EclPackedString {
  param(
    [Parameter(Mandatory)][string]$Text
  )

  $vals = [System.Collections.Generic.List[int]]::new()
  foreach ($ch in $Text.ToCharArray()) {
    $c = [int][char]$ch
    if ($c -ge 65 -and $c -le 90) {
      $vals.Add($c - 64)
    } elseif ($c -ge 32 -and $c -le 63) {
      $vals.Add($c)
    } else {
      throw "Unsupported synthetic ECL string character: $ch"
    }
  }
  $vals.Add(0)

  $out = [System.Collections.Generic.List[byte]]::new()
  $acc = 0
  $bits = 0
  foreach ($v in $vals) {
    $acc = ($acc -shl 6) -bor $v
    $bits += 6
    while ($bits -ge 8) {
      $bits -= 8
      $out.Add([byte](($acc -shr $bits) -band 0xFF))
    }
  }
  if ($bits -gt 0) {
    $out.Add([byte](($acc -shl (8 - $bits)) -band 0xFF))
  }
  return $out.ToArray()
}

function Add-EclPackedString {
  param(
    [Parameter(Mandatory)][System.Collections.Generic.List[byte]]$List,
    [Parameter(Mandatory)][string]$Text
  )

  [byte[]]$raw = ConvertTo-EclPackedString $Text
  $List.Add([byte]0x80)
  $List.Add([byte]$raw.Length)
  foreach ($b in $raw) {
    $List.Add($b)
  }
}

function Write-SyntheticDaxBlocks {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][hashtable[]]$Blocks
  )

  $entries = @()
  $dataSize = 0
  foreach ($block in $Blocks) {
    [byte[]]$raw = $block.Raw
    [byte[]]$comp = ConvertTo-DaxLiteralRle $raw
    $entries += ,@{
      Id = [int]$block.Id
      Offset = $dataSize
      RawSize = $raw.Length
      Comp = $comp
    }
    $dataSize += $comp.Length
  }

  $tocBytes = 9 * $entries.Count
  [byte[]]$bytes = [byte[]]::new(2 + $tocBytes + $dataSize)
  [BitConverter]::GetBytes([UInt16]$tocBytes).CopyTo($bytes, 0)
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    $entryBase = 2 + ($i * 9)
    $bytes[$entryBase] = [byte]$entry.Id
    [BitConverter]::GetBytes([UInt32]$entry.Offset).CopyTo($bytes, $entryBase + 1)
    [BitConverter]::GetBytes([UInt16]$entry.RawSize).CopyTo($bytes, $entryBase + 5)
    [BitConverter]::GetBytes([UInt16]$entry.Comp.Length).CopyTo($bytes, $entryBase + 7)
    [Array]::Copy($entry.Comp, 0, $bytes, 2 + $tocBytes + $entry.Offset, $entry.Comp.Length)
  }

  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticCombatEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  [byte[]]$body = @(
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24
  )
  $ecl.AddRange($body)
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticMenuResumeEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $body = [System.Collections.Generic.List[byte]]::new()
  $body.Add([byte]0x15)
  $body.AddRange([byte[]]@(1,0x02,0x01)) # destination 0x0102
  Add-EclPackedString $body 'PICK'
  $body.AddRange([byte[]]@(0,2))
  Add-EclPackedString $body 'LEFT'
  Add-EclPackedString $body 'RIGHT'
  $body.Add([byte]0x15)
  $body.AddRange([byte[]]@(1,0x04,0x01)) # destination 0x0104
  Add-EclPackedString $body 'PICK AGAIN'
  $body.AddRange([byte[]]@(0,2))
  Add-EclPackedString $body 'FIRST'
  Add-EclPackedString $body 'SECOND'
  $body.AddRange([byte[]]@(0x21,0,$GeoBlockId,0,2,0,0xFF,0))
  $ecl.AddRange($body.ToArray())
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

# The first interactive menu forces GBBOOT through its cold-resume path.  WHO
# immediately afterwards can yield only if that resumed CCECL invocation was
# given the same validated GBPR roster, making this a host-boundary regression
# rather than a direct-CCECL fixture.
function Write-SyntheticMenuWhoResumeEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $body = [System.Collections.Generic.List[byte]]::new()
  $body.Add([byte]0x15)
  $body.AddRange([byte[]]@(1,0x02,0x01)) # destination 0x0102
  Add-EclPackedString $body 'PICK'
  $body.AddRange([byte[]]@(0,2))
  Add-EclPackedString $body 'LEFT'
  Add-EclPackedString $body 'RIGHT'
  # WHO [0106] follows the first menu only after cold resume.  Its roster
  # labels are the observable proof that /B survived the host boundary.
  $body.AddRange([byte[]]@(0x39,1,0x06,0x01))
  $body.AddRange([byte[]]@(0x21,0,$GeoBlockId,0,2,0,0xFF,0))
  $ecl.AddRange($body.ToArray())
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticNwnChainEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 79
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  [byte[]]$body = @(
    0x0B,0x00,0x2E,0x00,0x01,0x00,0x2E,
    0x20,0x00,0x1D
  )
  $ecl.AddRange($body)
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticCombatMapEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $body = [System.Collections.Generic.List[byte]]::new()
  $body.Add([byte]0x11)
  Add-EclPackedString $body "BOOTTXT"
  $body.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24
  ))
  $ecl.AddRange($body.ToArray())
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticLoadFilesEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x00
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticSetupLoadFilesEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x0C,0x00,0x09,0x00,0x03,0x00,0x05,
    0x0D,
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x00
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function Write-SyntheticCombatResumeMapEclDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [byte]$BlockId = 34,
    [byte]$GeoBlockId = 34
  )

  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  [byte[]]$body = @(
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24,
    # The verified CoK party-win resume sets the comparison as 1 >= 1.
    0x1B,
    0x21,0x00,$GeoBlockId,0x00,0x02,0x00,0xFF,
    0x00
  )
  $ecl.AddRange($body)
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function New-SyntheticCokMonRecord {
  param(
    [Parameter(Mandatory)][int]$Hp,
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [Parameter(Mandatory)][int]$Xp
  )

  [byte[]]$raw = [byte[]]::new(409)
  $raw[213] = 4  # CoK monster movement (+0xD5); 0 clamps to 1 and changes the fight
  $raw[98] = [byte]$Hp
  $raw[89] = [byte](60 - $Thac0)
  $raw[275] = [byte](60 - $Ac)
  $raw[269] = [byte]$DamageCount
  $raw[270] = [byte]$DamageBonus
  $raw[271] = [byte]$DamageSides
  [BitConverter]::GetBytes([UInt16]$Xp).CopyTo($raw, 304)
  return $raw
}

function Write-SyntheticMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  Write-SyntheticDaxBlocks $Path @(
    @{ Id = 9; Raw = (New-SyntheticCokMonRecord -Hp 4 -Thac0 21 -Ac 6 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Xp 10) },
    @{ Id = 19; Raw = (New-SyntheticCokMonRecord -Hp 18 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 10 -DamageBonus 0 -Xp 90) }
  )
}

function New-SyntheticDokMonRecord {
  param(
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    # See the twin of this builder in native/cccombat-test.ps1 for why $Hp is
    # mandatory: since 2026-09-05 cccombat.asm's .dok branch reads HP and kill-XP
    # from real record offsets (docs/engine/research/dok-kill-xp.md) instead of
    # hashing the monster index, so a zero-filled record is a 0-hp monster.
    [Parameter(Mandatory)][int]$Hp,
    [int]$XpFlat = 0,
    [int]$XpPerHp = 0
  )

  [byte[]]$raw = [byte[]]::new(216)
  $raw[31] = [byte](60 - $Thac0)
  $raw[95] = [byte](60 - $Ac)
  $raw[89] = [byte]$DamageCount
  $raw[91] = [byte]$DamageSides
  $raw[90] = [byte]$DamageBonus
  $raw[40] = [byte]$Hp                     # max hp
  $raw[214] = [byte]$Hp                    # retail mirrors max hp here
  $raw[108] = [byte]$Hp                    # live/rolled hp: the XP multiplicand
  [BitConverter]::GetBytes([UInt16]$XpFlat).CopyTo($raw, 109)
  $raw[111] = [byte]$XpPerHp
  return $raw
}

function Write-SyntheticDokMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  Write-SyntheticDaxBlocks $Path @(
    @{ Id = 9; Raw = (New-SyntheticDokMonRecord -Thac0 15 -Ac -5 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Hp 5 -XpFlat 13 -XpPerHp 3) },
    @{ Id = 19; Raw = (New-SyntheticDokMonRecord -Thac0 12 -Ac -5 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Hp 7 -XpFlat 20 -XpPerHp 5) }
  )
}

function Write-SyntheticDokGbpr {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[]]$gbpr = [byte[]]::new(16 + (2 * 410))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($gbpr, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($gbpr, 4)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($gbpr, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($gbpr, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($gbpr, 10)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($gbpr, 12) # DoK title identity
  [BitConverter]::GetBytes([UInt16]1).CopyTo($gbpr, 14) # compact schema
  $members = @(
    @{ Slot = 0x80; Name = "DOKALPHA"; Hp = 14; Ac = 5; Thac0 = 15; Sides = 8; Bonus = 1 },
    @{ Slot = 0x81; Name = "DOKBETA";  Hp = 12; Ac = 6; Thac0 = 16; Sides = 6; Bonus = 2 }
  )
  for ($i = 0; $i -lt $members.Count; $i++) {
    $m = $members[$i]
    $off = 16 + ($i * 410)
    $rec = $off + 1
    $gbpr[$off] = [byte]$m.Slot
    $gbpr[$rec] = [byte]$m.Name.Length
    [Text.Encoding]::ASCII.GetBytes([string]$m.Name).CopyTo($gbpr, $rec + 1)
    $gbpr[$rec + 16] = 12
    $gbpr[$rec + 22] = 10
    $gbpr[$rec + 31] = [byte](60 - $m.Thac0)
    $gbpr[$rec + 32] = 6
    $meta = $rec + 216
    [Text.Encoding]::ASCII.GetBytes("GBD1").CopyTo($gbpr, $meta)
    [BitConverter]::GetBytes([UInt16]1).CopyTo($gbpr, $meta + 4)
    [BitConverter]::GetBytes([Int16]$m.Hp).CopyTo($gbpr, $meta + 6)
    [BitConverter]::GetBytes([Int16]$m.Ac).CopyTo($gbpr, $meta + 8)
    [BitConverter]::GetBytes([UInt16]1).CopyTo($gbpr, $meta + 10)
    [BitConverter]::GetBytes([UInt16]$m.Sides).CopyTo($gbpr, $meta + 12)
    [BitConverter]::GetBytes([Int16]$m.Bonus).CopyTo($gbpr, $meta + 14)
    [BitConverter]::GetBytes([UInt16]3).CopyTo($gbpr, $meta + 16)
    $gbpr[$meta + 18] = 1
    $gbpr[$meta + 19] = 6
    [BitConverter]::GetBytes([UInt16]$m.Thac0).CopyTo($gbpr, $meta + 20)
    [BitConverter]::GetBytes([UInt16]4).CopyTo($gbpr, $meta + 22)
  }
  [IO.File]::WriteAllBytes($Path, $gbpr)
}

function Write-SyntheticGeoGlb {
  param(
    [Parameter(Mandatory)][string]$Path,
    [int]$MapCount = 1,
    [switch]$VisibleWalls
  )

  [byte[]]$map = [byte[]]::new(8 + (4 * 16 * 16))
  $map[0] = 16
  $map[1] = 16
  if ($VisibleWalls) {
    for ($i = 8; $i -lt (8 + (2 * 16 * 16)); $i++) {
      $map[$i] = 0x11
    }
  }

  $ptrCount = $MapCount + 1
  $dataStart = 16 + ($ptrCount * 4)
  $fileSize = $dataStart + ($map.Length * $MapCount)
  [byte[]]$bytes = [byte[]]::new($fileSize)

  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt32]$fileSize).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]($ptrCount - 1)).CopyTo($bytes, 8)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)
  for ($i = 0; $i -le $MapCount; $i++) {
    [BitConverter]::GetBytes([UInt32]($dataStart + ($map.Length * $i))).CopyTo($bytes, 16 + ($i * 4))
  }
  for ($i = 0; $i -lt $MapCount; $i++) {
    [Array]::Copy($map, 0, $bytes, $dataStart + ($map.Length * $i), $map.Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticEclGlbChain {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[]]$idtab = [byte[]]::new(10)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 2)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 4)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 6)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($idtab, 8)

  $entry = [System.Collections.Generic.List[byte]]::new()
  1..20 | ForEach-Object { [void]$entry.Add([byte]0) }
  # SAVE 2 -> [0100], then NEWECL 2.
  $entry.AddRange([byte[]]@(0x09,0x00,0x02,0x01,0x00,0x01,0x20,0x00,0x02))

  $target = [System.Collections.Generic.List[byte]]::new()
  1..20 | ForEach-Object { [void]$target.Add([byte]0) }
  # LOAD_FILES [0100], 2, 255, then EXIT. This proves chain memory survived.
  $target.AddRange([byte[]]@(0x21,0x01,0x00,0x01,0x00,0x02,0x00,0xFF,0x00))

  [byte[][]]$members = @($idtab, $entry.ToArray(), $target.ToArray())
  $ptrCount = $members.Count + 1
  $dataStart = 16 + ($ptrCount * 4)
  $fileSize = $dataStart
  foreach ($m in $members) { $fileSize += $m.Length }
  [byte[]]$bytes = [byte[]]::new($fileSize)

  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt32]$fileSize).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]($ptrCount - 1)).CopyTo($bytes, 8)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)

  $offset = $dataStart
  for ($i = 0; $i -lt $members.Count; $i++) {
    [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($i * 4))
    [Array]::Copy($members[$i], 0, $bytes, $offset, $members[$i].Length)
    $offset += $members[$i].Length
  }
  [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($members.Count * 4))
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticEclGlbPieces {
  param(
    [Parameter(Mandatory)][string]$Path,
    [int]$PieceBase = 10
  )

  [byte[]]$idtab = [byte[]]::new(6)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 2)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($idtab, 4)

  $entry = [System.Collections.Generic.List[byte]]::new()
  1..20 | ForEach-Object { [void]$entry.Add([byte]0) }
  $entry.AddRange([byte[]]@(
    0x21,0x00,0x02,0x00,0x01,0x00,0x00,
    0x37,0x00,([byte]$PieceBase),0x00,([byte]($PieceBase + 1)),0x00,([byte]($PieceBase + 2)),
    0x00
  ))

  [byte[][]]$members = @($idtab, $entry.ToArray())
  $ptrCount = $members.Count + 1
  $dataStart = 16 + ($ptrCount * 4)
  $fileSize = $dataStart
  foreach ($m in $members) { $fileSize += $m.Length }
  [byte[]]$bytes = [byte[]]::new($fileSize)

  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt32]$fileSize).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]($ptrCount - 1)).CopyTo($bytes, 8)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)

  $offset = $dataStart
  for ($i = 0; $i -lt $members.Count; $i++) {
    [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($i * 4))
    [Array]::Copy($members[$i], 0, $bytes, $offset, $members[$i].Length)
    $offset += $members[$i].Length
  }
  [BitConverter]::GetBytes([UInt32]$offset).CopyTo($bytes, 16 + ($members.Count * 4))
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Install-ExecChild {
  param(
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$Exe
  )
  $dest = Join-Path $Dir $Exe
  $parent = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force $parent | Out-Null
  Copy-Item $gbmark $dest -Force
}

$poolDir = New-Fixture -Name "pool" -Files @("START.EXE", "POOL.CFG")
$curseDir = New-Fixture -Name "curse" -Files @("START.EXE", "CURSE.CFG")
$curseDataDir = New-Fixture -Name "curse-data" -Files @("ECL1.DAX", "ECL2.DAX", "ECL3.DAX", "ECL4.DAX", "ECL5.DAX", "ECL6.DAX", "GEO2.DAX", "GEO3.DAX", "GEO4.DAX", "GEO5.DAX", "GEO6.DAX", "8X8D1.DAX", "8X8D2.DAX", "8X8D3.DAX", "WALLDEF2.DAX", "WALLDEF3.DAX")
$curseNativeDir = New-Fixture -Name "curse-native" -Files @("START.EXE", "CURSE.CFG", "TITLE.DAX", "ECL2.DAX", "ECL3.DAX", "ECL4.DAX", "ECL5.DAX", "ECL6.DAX", "GEO2.DAX", "GEO3.DAX", "GEO4.DAX", "GEO5.DAX", "GEO6.DAX")
$secretDir = New-Fixture -Name "secret" -Files @("START.EXE", "BLADES.CFG")
$gatewayDir = New-Fixture -Name "gateway" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX")
$treasuresDir = New-Fixture -Name "treasures" -Files @("GAME.EXE", "TREASURE.CFG", "ZOUNDS.DAX")
$podDir = New-Fixture -Name "pod" -Files @("GAME.EXE", "GAME.OVR", "POOL4.CFG", "ZOUNDS.DAX")
$poolGeoDir = New-Fixture -Name "pool-geo" -Files @("START.EXE", "POOL.CFG", "GEO1.DAX")
$poolArea2Dir = New-Fixture -Name "pool-area2" -Files @("START.EXE", "POOL.CFG", "GEO1.DAX", "GEO2.DAX")
$poolEclDir = New-Fixture -Name "pool-ecl" -Files @("START.EXE", "POOL.CFG", "ECL1.DAX", "GEO1.DAX")
$secretGeoDir = New-Fixture -Name "secret-geo" -Files @("START.EXE", "BLADES.CFG", "GEO1.DAX")
$secretArea2Dir = New-Fixture -Name "secret-area2" -Files @("START.EXE", "BLADES.CFG", "GEO1.DAX", "GEO2.DAX")
$secretEclDir = New-Fixture -Name "secret-ecl" -Files @("START.EXE", "BLADES.CFG", "ECL1.DAX", "GEO1.DAX")
$gatewayGeoDir = New-Fixture -Name "gateway-geo" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX", "GEO1.DAX")
$gatewayArea2Dir = New-Fixture -Name "gateway-area2" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX", "GEO1.DAX", "GEO2.DAX")
$gatewayEclDir = New-Fixture -Name "gateway-ecl" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX", "ECL1.DAX", "GEO1.DAX")
$gatewayGeo2Dir = New-Fixture -Name "gateway-geo2" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX", "GEO2.DAX")
$treasuresGeoDir = New-Fixture -Name "treasures-geo" -Files @("GAME.EXE", "TREASURE.CFG", "ZOUNDS.DAX", "GEO1.DAX")
$treasuresArea2Dir = New-Fixture -Name "treasures-area2" -Files @("GAME.EXE", "TREASURE.CFG", "ZOUNDS.DAX", "GEO1.DAX", "GEO2.DAX")
$treasuresEclDir = New-Fixture -Name "treasures-ecl" -Files @("GAME.EXE", "TREASURE.CFG", "ZOUNDS.DAX", "ECL1.DAX", "GEO1.DAX")
$podGeoDir = New-Fixture -Name "pod-geo" -Files @("GAME.EXE", "GAME.OVR", "POOL4.CFG", "ZOUNDS.DAX", "GEO1.DAX")
$podArea2Dir = New-Fixture -Name "pod-area2" -Files @("GAME.EXE", "GAME.OVR", "POOL4.CFG", "ZOUNDS.DAX", "GEO1.DAX", "GEO2.DAX")
$podEclDir = New-Fixture -Name "pod-ecl" -Files @("GAME.EXE", "GAME.OVR", "POOL4.CFG", "ZOUNDS.DAX", "ECL1.DAX", "GEO1.DAX")
$curseCfgDataDir = New-Fixture -Name "curse-cfg-data" -Files @("CURSE.CFG", "GEO2.DAX")
$poolDataDir = New-Fixture -Name "pool-data" -Files @("POOL.CFG", "GEO1.DAX")
$secretDataDir = New-Fixture -Name "secret-data" -Files @("BLADES.CFG", "GEO1.DAX")
$gatewayDataDir = New-Fixture -Name "gateway-data" -Files @("GAME.CFG", "ZOUNDS.DAX", "GEO2.DAX")
$treasuresDataDir = New-Fixture -Name "treasures-data" -Files @("TREASURE.CFG", "ZOUNDS.DAX", "GEO1.DAX")
$podDataDir = New-Fixture -Name "pod-data" -Files @("POOL4.CFG", "GEO1.DAX")
$matrixDataDir = New-Fixture -Name "matrix-data" -Files @("MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "GEO1.DAX")
$poolDataEclDir = New-Fixture -Name "pool-data-ecl" -Files @("POOL.CFG", "ECL1.DAX", "GEO1.DAX")
$secretDataEclDir = New-Fixture -Name "secret-data-ecl" -Files @("BLADES.CFG", "ECL1.DAX", "GEO1.DAX")
$gatewayDataEclDir = New-Fixture -Name "gateway-data-ecl" -Files @("GAME.CFG", "ZOUNDS.DAX", "ECL1.DAX", "GEO1.DAX")
$treasuresDataEclDir = New-Fixture -Name "treasures-data-ecl" -Files @("TREASURE.CFG", "ZOUNDS.DAX", "ECL1.DAX", "GEO1.DAX")
$podDataEclDir = New-Fixture -Name "pod-data-ecl" -Files @("POOL4.CFG", "ECL1.DAX", "GEO1.DAX")
$matrixDataEclDir = New-Fixture -Name "matrix-data-ecl" -Files @("MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "ECL1.DAX", "GEO1.DAX")
$cokDataDir = New-Fixture -Name "cok-data" -Files @("KRYNN.CFG", "ECL1.DAX", "GEO1.DAX")
$dokDataDir = New-Fixture -Name "dok-data" -Files @("DKK.CFG", "ECL1.DAX", "GEO1.DAX")
$buckGeoDir = New-Fixture -Name "buck-geo" -Files @("BUCK1.EXE", "BUCK2.EXE", "BUCK3.EXE", "GEO1.DAX")
$buckArea2Dir = New-Fixture -Name "buck-area2" -Files @("BUCK1.EXE", "BUCK2.EXE", "BUCK3.EXE", "GEO1.DAX", "GEO2.DAX")
$matrixGeoDir = New-Fixture -Name "matrix-geo" -Files @("START.EXE", "MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "GEO1.DAX")
$matrixArea2Dir = New-Fixture -Name "matrix-area2" -Files @("START.EXE", "MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "GEO1.DAX", "GEO2.DAX")
$buckEclDir = New-Fixture -Name "buck-ecl" -Files @("BUCK1.EXE", "BUCK2.EXE", "BUCK3.EXE", "ECL1.DAX", "GEO1.DAX")
$matrixEclDir = New-Fixture -Name "matrix-ecl" -Files @("START.EXE", "MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "ECL1.DAX", "GEO1.DAX")
foreach ($geoFixture in @($poolGeoDir, $secretGeoDir, $gatewayGeoDir, $treasuresGeoDir, $podGeoDir, $buckGeoDir, $matrixGeoDir)) {
  Write-SyntheticGeoDax (Join-Path $geoFixture "GEO1.DAX")
}
foreach ($area2Fixture in @($poolArea2Dir, $secretArea2Dir, $gatewayArea2Dir, $treasuresArea2Dir, $podArea2Dir, $buckArea2Dir, $matrixArea2Dir)) {
  Write-SyntheticGeoDax (Join-Path $area2Fixture "GEO1.DAX")
  Write-SyntheticGeoDax (Join-Path $area2Fixture "GEO2.DAX") 34
}
foreach ($eclFixture in @($poolEclDir, $secretEclDir, $gatewayEclDir, $treasuresEclDir, $podEclDir, $buckEclDir, $matrixEclDir)) {
  Write-SyntheticGeoDax (Join-Path $eclFixture "GEO1.DAX") 34
  Write-SyntheticLoadFilesEclDax (Join-Path $eclFixture "ECL1.DAX") 34 34
}
foreach ($dataEclFixture in @($poolDataEclDir, $secretDataEclDir, $gatewayDataEclDir, $treasuresDataEclDir, $podDataEclDir, $matrixDataEclDir)) {
  Write-SyntheticGeoDax (Join-Path $dataEclFixture "GEO1.DAX") 34
  Write-SyntheticLoadFilesEclDax (Join-Path $dataEclFixture "ECL1.DAX") 34 34
}
foreach ($dataFixture in @($poolDataDir, $secretDataDir, $treasuresDataDir, $podDataDir, $matrixDataDir)) {
  Write-SyntheticGeoDax (Join-Path $dataFixture "GEO1.DAX")
}
foreach ($krynnDataFixture in @($cokDataDir, $dokDataDir)) {
  Write-SyntheticGeoDax (Join-Path $krynnDataFixture "GEO1.DAX") 34
  Write-SyntheticLoadFilesEclDax (Join-Path $krynnDataFixture "ECL1.DAX") 34 34
}
Write-SyntheticGeoDax (Join-Path $curseCfgDataDir "GEO2.DAX") 34
Write-SyntheticGeoDax (Join-Path $gatewayDataDir "GEO2.DAX") 34
Write-SyntheticGeoDax (Join-Path $gatewayGeo2Dir "GEO2.DAX") 34
$combatCokDir = New-Fixture -Name "combat-cok" -Files @("START.EXE", "KRYNN.CFG", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatCokDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatCokDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatCokDir "MON1CHA.DAX")
$combatCokRosterDir = New-Fixture -Name "combat-cok-roster" -Files @("START.EXE", "KRYNN.CFG", "SAVE\CHRDATA1.SAV", "SAVE\CHRDATA2.SAV")
Write-SyntheticGeoDax (Join-Path $combatCokRosterDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatCokRosterDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatCokRosterDir "MON1CHA.DAX")
$combatSav1 = New-SyntheticCokMonRecord -Hp 14 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 8 -DamageBonus 1 -Xp 100
$combatSav1[407] = 14 # SAV current HP; the shared MON constructor sets max HP at 98.
$combatSav1[0] = 5
# CoK player XP is a u32 at CCH+116h.  Start immediately below a word boundary
# so the GBCR award proves the bridge propagates carry into the high word.
[BitConverter]::GetBytes([UInt32]65520).CopyTo($combatSav1, 0x116)
[Text.Encoding]::ASCII.GetBytes("ALPHA").CopyTo($combatSav1, 1)
[IO.File]::WriteAllBytes((Join-Path $combatCokRosterDir "SAVE\CHRDATA1.SAV"), $combatSav1)
$combatSav2 = New-SyntheticCokMonRecord -Hp 12 -Thac0 16 -Ac 6 -DamageCount 1 -DamageSides 6 -DamageBonus 2 -Xp 200
$combatSav2[407] = 12
$combatSav2[0] = 4
[BitConverter]::GetBytes([UInt32]131070).CopyTo($combatSav2, 0x116)
[Text.Encoding]::ASCII.GetBytes("BETA").CopyTo($combatSav2, 1)
[IO.File]::WriteAllBytes((Join-Path $combatCokRosterDir "SAVE\CHRDATA2.SAV"), $combatSav2)
$combatDokDir = New-Fixture -Name "combat-dok" -Files @("START.EXE", "DKK.CFG", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatDokDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatDokDir "ECL1.DAX")
Write-SyntheticDokMonChaDax (Join-Path $combatDokDir "MON1CHA.DAX")
$combatDokRosterDir = New-Fixture -Name "combat-dok-roster" -Files @("START.EXE", "DKK.CFG")
Write-SyntheticGeoDax (Join-Path $combatDokRosterDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatDokRosterDir "ECL1.DAX")
Write-SyntheticDokMonChaDax (Join-Path $combatDokRosterDir "MON1CHA.DAX")
$combatGatewayDir = New-Fixture -Name "combat-gateway" -Files @("GAME.EXE", "GAME.CFG", "ZOUNDS.DAX", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatGatewayDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatGatewayDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatGatewayDir "MON1CHA.DAX")
$combatPoolDir = New-Fixture -Name "combat-pool" -Files @("START.EXE", "POOL.CFG", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatPoolDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatPoolDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatPoolDir "MON1CHA.DAX")
$combatSecretDir = New-Fixture -Name "combat-secret" -Files @("START.EXE", "BLADES.CFG", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatSecretDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatSecretDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatSecretDir "MON1CHA.DAX")
$combatTreasuresDir = New-Fixture -Name "combat-treasures" -Files @("GAME.EXE", "TREASURE.CFG", "ZOUNDS.DAX", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatTreasuresDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatTreasuresDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatTreasuresDir "MON1CHA.DAX")
$combatPodDir = New-Fixture -Name "combat-pod" -Files @("GAME.EXE", "GAME.OVR", "POOL4.CFG", "ZOUNDS.DAX", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatPodDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatPodDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatPodDir "MON1CHA.DAX")
$combatBuckDir = New-Fixture -Name "combat-buck" -Files @("BUCK1.EXE", "BUCK2.EXE", "BUCK3.EXE", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatBuckDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatBuckDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatBuckDir "MON1CHA.DAX")
$combatMatrixDir = New-Fixture -Name "combat-matrix" -Files @("START.EXE", "MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatMatrixDir "GEO1.DAX") 34
Write-SyntheticCombatEclDax (Join-Path $combatMatrixDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatMatrixDir "MON1CHA.DAX")
$combatNwnDir = New-Fixture -Name "combat-nwn-dos-aol" -Files @("GAME.EXE", "GAME.CFG", "GAME.OVR", "TITLE.DAX")
Write-SyntheticGeoDax (Join-Path $combatNwnDir "GEO0.DAX") 1
Write-SyntheticCombatEclDax (Join-Path $combatNwnDir "ECL0.DAX") 1
Write-SyntheticMonChaDax (Join-Path $combatNwnDir "MONCHA.DAX")
$autoSeedDir = New-Fixture -Name "auto-seed-cok" -Files @("START.EXE", "KRYNN.CFG", "SAVE\CHRDATA1.SAV", "SAVE\CHRDATA2.SAV", "SAVE\CHRDATA3.SAV")
Write-SyntheticGeoDax (Join-Path $autoSeedDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoSeedDir "ECL1.DAX") 34 34
$autoDqkSeedDir = New-Fixture -Name "auto-seed-dqk" -Files @("DQK.EXE", "ECL.GLB", "GEO.GLB", "SAVGAMA.QSV", "SAVE\CHRDATA1.QCH", "SAVE\CHRDATA2.QCH", "SAVE\CHRDATA3.QCH", "SAVE\CHRDATA4.QCH")
$autoDqkQsv = New-Object byte[] 38
$autoDqkQsv[31] = 2
[IO.File]::WriteAllBytes((Join-Path $autoDqkSeedDir "SAVGAMA.QSV"), $autoDqkQsv)
$autoDqkSaveQchSeedDir = New-Fixture -Name "auto-seed-dqk-save-qch8" -Files @(
  "DQK.EXE", "ECL.GLB", "GEO.GLB",
  "SAVE\CHRDATA1.QCH", "SAVE\CHRDATA2.QCH", "SAVE\CHRDATA3.QCH", "SAVE\CHRDATA4.QCH",
  "SAVE\CHRDATA5.QCH", "SAVE\CHRDATA6.QCH", "SAVE\CHRDATA7.QCH", "SAVE\CHRDATA8.QCH"
)
$autoDqkCloudSeedDir = New-Fixture -Name "auto-seed-dqk-cloud" -Files @("DQK.EXE", "ECL.GLB", "GEO.GLB", "cloud_saves\SAVE\CHRDATA1.QCH", "cloud_saves\SAVE\CHRDATA2.QCH", "cloud_saves\SAVE\CHRDATA3.QCH", "cloud_saves\SAVE\CHRDATA4.QCH", "cloud_saves\SAVE\CHRDATA5.QCH")
$autoDqkCloudSlotSeedDir = New-Fixture -Name "auto-seed-dqk-cloud-slot" -Files @("DQK.EXE", "ECL.GLB", "GEO.GLB", "cloud_saves\SAVE\SAVGAMB.QSV", "cloud_saves\SAVE\CHRDATA1.QCH", "cloud_saves\SAVE\CHRDATA2.QCH")
$autoDqkCloudSlotQsv = New-Object byte[] 38
$autoDqkCloudSlotQsv[31] = 6
[IO.File]::WriteAllBytes((Join-Path $autoDqkCloudSlotSeedDir "cloud_saves\SAVE\SAVGAMB.QSV"), $autoDqkCloudSlotQsv)
$autoDqkCloudSavgameSeedDir = New-Fixture -Name "auto-seed-dqk-cloud-savgame" -Files @("DQK.EXE", "ECL.GLB", "GEO.GLB", "cloud_saves\SAVE\SAVGAME.QSV", "cloud_saves\SAVE\CHRDATA1.QCH", "cloud_saves\SAVE\CHRDATA2.QCH")
$autoDqkCloudSavgameQsv = New-Object byte[] 38
$autoDqkCloudSavgameQsv[31] = 7
[IO.File]::WriteAllBytes((Join-Path $autoDqkCloudSavgameSeedDir "cloud_saves\SAVE\SAVGAME.QSV"), $autoDqkCloudSavgameQsv)
$autoDqkCloudQchBSeedDir = New-Fixture -Name "auto-seed-dqk-cloud-qch-b" -Files @(
  "DQK.EXE", "ECL.GLB", "GEO.GLB",
  "cloud_saves\SAVE\CHRDATB1.QCH", "cloud_saves\SAVE\CHRDATB2.QCH",
  "cloud_saves\SAVE\CHRDATB3.QCH", "cloud_saves\SAVE\CHRDATB4.QCH",
  "cloud_saves\SAVE\CHRDATB5.QCH", "cloud_saves\SAVE\CHRDATB6.QCH",
  "cloud_saves\SAVE\CHRDATB7.QCH", "cloud_saves\SAVE\CHRDATB8.QCH"
)
$autoCokAffectDir = New-Fixture -Name "auto-affect-cok" -Files @("START.EXE", "KRYNN.CFG", "SAVE\CHRDATA1.SAV", "SAVE\CHRDATA1.STF", "SAVE\CHRDATA1.SFX", "SAVE\CHRDATA2.SAV", "SAVE\CHRDATA2.STF", "SAVE\CHRDATA2.SFX")
Write-SyntheticGeoDax (Join-Path $autoCokAffectDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoCokAffectDir "ECL1.DAX") 34 34
$autoSav1 = New-Object byte[] 409
$autoSav1[0] = 5
$autoSav1[1] = [byte][char]'R'
$autoSav1[2] = [byte][char]'O'
$autoSav1[3] = [byte][char]'G'
$autoSav1[4] = [byte][char]'U'
$autoSav1[5] = [byte][char]'E'
# CoK thief skills sit at record offset 219, not 139 (moved 2026-09-07 with
# COK_CCH_THIEF_OFF in native/src/gbboot.asm). These two fixtures placed the
# bytes at 139 BECAUSE the engine read 139, so they could never have adjudicated
# the offset -- they were goldens for the code under test. 219 is re-derived from
# the six retail Champions of Krynn\SAVE\CHRDATA{1..6}.SAV records: 139..146 is
# zero in 6 of 6, and 219..226 carries MOLLY's hex `34 3D 2F 28 22 16 62 00`
# (decimal 52/61/47/40/34/22/98/0 -- she is the party's only thief). The buffer
# is 409 bytes, so 219+8 is in range; under
# the old code the engine read only 147 bytes and 219 was off the end entirely.
for ($i = 0; $i -lt 8; $i++) { $autoSav1[219 + $i] = [byte](10 + $i) }
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA1.SAV"), $autoSav1)
$autoSav2 = New-Object byte[] 409
$autoSav2[0] = 6
$autoSav2[1] = [byte][char]'S'
$autoSav2[2] = [byte][char]'C'
$autoSav2[3] = [byte][char]'O'
$autoSav2[4] = [byte][char]'U'
$autoSav2[5] = [byte][char]'T'
$autoSav2[6] = [byte][char]'2'
for ($i = 0; $i -lt 8; $i++) { $autoSav2[219 + $i] = [byte](30 + $i) }
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA2.SAV"), $autoSav2)
$autoStf1 = New-Object byte[] (63 * 2)
$autoStf1[0] = 1
$autoStf1[0x2e] = 36
$autoStf1[0x34] = 1
$autoStf1[63] = 2
$autoStf1[63 + 0x2e] = 37
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA1.STF"), $autoStf1)
$autoStf2 = New-Object byte[] (63 * 2)
$autoStf2[0] = 1
$autoStf2[0x2e] = 37
$autoStf2[63] = 2
$autoStf2[63 + 0x2e] = 18
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA2.STF"), $autoStf2)
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA1.SFX"), [byte[]]@(
  0x12, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x5C, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
[IO.File]::WriteAllBytes((Join-Path $autoCokAffectDir "SAVE\CHRDATA2.SFX"), [byte[]]@(
  0x12, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x5F, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoAffectDir = New-Fixture -Name "auto-affect-dok" -Files @("START.EXE", "DKK.CFG", "SAVE\CHRDATA1.GAM", "SAVE\CHRDATA1.JNK", "SAVE\CHRDATA1.EFF", "SAVE\CHRDATA1.WIZ")
Write-SyntheticGeoDax (Join-Path $autoAffectDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoAffectDir "ECL1.DAX") 34 34
[IO.File]::WriteAllBytes((Join-Path $autoAffectDir "SAVE\CHRDATA1.EFF"), [byte[]]@(
  0x12, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x2D, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoJnk = New-Object byte[] (63 * 3)
$autoJnk[0] = 1
$autoJnk[1] = [byte][char]'A'
$autoJnk[0x2e] = 37
$autoJnk[63] = 1
$autoJnk[64] = [byte][char]'B'
$autoJnk[63 + 0x2e] = 36
$autoJnk[63 + 0x34] = 1
$autoJnk[126] = 1
$autoJnk[127] = [byte][char]'C'
$autoJnk[126 + 0x2e] = 37
[IO.File]::WriteAllBytes((Join-Path $autoAffectDir "SAVE\CHRDATA1.JNK"), $autoJnk)
$autoWiz = New-Object byte[] 220
$autoWiz[34] = 8
$autoWiz[35] = 22
$autoWiz[36] = 22
[IO.File]::WriteAllBytes((Join-Path $autoAffectDir "SAVE\CHRDATA1.WIZ"), $autoWiz)
$autoCokCloudAffectDir = New-Fixture -Name "auto-affect-cok-cloud" -Files @("START.EXE", "KRYNN.CFG", "cloud_saves\SAVE\CHRDATA1.SAV", "cloud_saves\SAVE\CHRDATA1.STF", "cloud_saves\SAVE\CHRDATA1.SFX", "cloud_saves\SAVE\CHRDATA2.SAV", "cloud_saves\SAVE\CHRDATA2.STF", "cloud_saves\SAVE\CHRDATA2.SFX")
Write-SyntheticGeoDax (Join-Path $autoCokCloudAffectDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoCokCloudAffectDir "ECL1.DAX") 34 34
$autoCloudStf1 = New-Object byte[] (63 * 2)
$autoCloudStf1[0] = 1
$autoCloudStf1[0x2e] = 44
$autoCloudStf1[63] = 2
$autoCloudStf1[63 + 0x2e] = 45
[IO.File]::WriteAllBytes((Join-Path $autoCokCloudAffectDir "cloud_saves\SAVE\CHRDATA1.STF"), $autoCloudStf1)
$autoCloudStf2 = New-Object byte[] (63 * 2)
$autoCloudStf2[0] = 1
$autoCloudStf2[0x2e] = 45
$autoCloudStf2[63] = 2
$autoCloudStf2[63 + 0x2e] = 46
[IO.File]::WriteAllBytes((Join-Path $autoCokCloudAffectDir "cloud_saves\SAVE\CHRDATA2.STF"), $autoCloudStf2)
[IO.File]::WriteAllBytes((Join-Path $autoCokCloudAffectDir "cloud_saves\SAVE\CHRDATA1.SFX"), [byte[]]@(
  0x21, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
[IO.File]::WriteAllBytes((Join-Path $autoCokCloudAffectDir "cloud_saves\SAVE\CHRDATA2.SFX"), [byte[]]@(
  0x22, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoDokCloudAffectDir = New-Fixture -Name "auto-affect-dok-cloud" -Files @("START.EXE", "DKK.CFG", "cloud_saves\SAVE\CHRDATA1.GAM", "cloud_saves\SAVE\CHRDATA1.JNK", "cloud_saves\SAVE\CHRDATA1.EFF", "cloud_saves\SAVE\CHRDATA1.WIZ")
Write-SyntheticGeoDax (Join-Path $autoDokCloudAffectDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoDokCloudAffectDir "ECL1.DAX") 34 34
$autoCloudJnk = New-Object byte[] (63 * 2)
$autoCloudJnk[0] = 1
$autoCloudJnk[1] = [byte][char]'D'
$autoCloudJnk[0x2e] = 41
$autoCloudJnk[63] = 1
$autoCloudJnk[64] = [byte][char]'E'
$autoCloudJnk[63 + 0x2e] = 42
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudAffectDir "cloud_saves\SAVE\CHRDATA1.JNK"), $autoCloudJnk)
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudAffectDir "cloud_saves\SAVE\CHRDATA1.EFF"), [byte[]]@(
  0x2A, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoCloudWiz = New-Object byte[] 220
$autoCloudWiz[34] = 14
$autoCloudWiz[35] = 15
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudAffectDir "cloud_saves\SAVE\CHRDATA1.WIZ"), $autoCloudWiz)
$autoDokCloudSlotBDir = New-Fixture -Name "auto-affect-dok-cloud-b" -Files @(
  "START.EXE", "DKK.CFG",
  "cloud_saves\SAVE\CHRDATB1.GAM", "cloud_saves\SAVE\CHRDATB2.GAM",
  "cloud_saves\SAVE\CHRDATB3.GAM", "cloud_saves\SAVE\CHRDATB4.GAM",
  "cloud_saves\SAVE\CHRDATB5.GAM", "cloud_saves\SAVE\CHRDATB6.GAM",
  "cloud_saves\SAVE\CHRDATB7.GAM", "cloud_saves\SAVE\CHRDATB8.GAM",
  "cloud_saves\SAVE\CHRDATB7.JNK", "cloud_saves\SAVE\CHRDATB7.EFF",
  "cloud_saves\SAVE\CHRDATB7.WIZ"
)
Write-SyntheticGeoDax (Join-Path $autoDokCloudSlotBDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoDokCloudSlotBDir "ECL1.DAX") 34 34
$autoCloudBJnk = New-Object byte[] 63
$autoCloudBJnk[0] = 1
$autoCloudBJnk[1] = [byte][char]'F'
$autoCloudBJnk[0x2e] = 47
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotBDir "cloud_saves\SAVE\CHRDATB7.JNK"), $autoCloudBJnk)
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotBDir "cloud_saves\SAVE\CHRDATB7.EFF"), [byte[]]@(
  0x34, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoCloudBWiz = New-Object byte[] 220
$autoCloudBWiz[34] = 16
$autoCloudBWiz[35] = 17
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotBDir "cloud_saves\SAVE\CHRDATB7.WIZ"), $autoCloudBWiz)
$autoDokCloudSlotCDir = New-Fixture -Name "auto-affect-dok-cloud-c" -Files @(
  "START.EXE", "DKK.CFG",
  "cloud_saves\SAVE\CHRDATC1.GAM", "cloud_saves\SAVE\CHRDATC2.GAM",
  "cloud_saves\SAVE\CHRDATC3.GAM", "cloud_saves\SAVE\CHRDATC4.GAM",
  "cloud_saves\SAVE\CHRDATC5.GAM", "cloud_saves\SAVE\CHRDATC6.GAM",
  "cloud_saves\SAVE\CHRDATC6.JNK", "cloud_saves\SAVE\CHRDATC6.EFF",
  "cloud_saves\SAVE\CHRDATC6.WIZ"
)
Write-SyntheticGeoDax (Join-Path $autoDokCloudSlotCDir "GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $autoDokCloudSlotCDir "ECL1.DAX") 34 34
$autoCloudCJnk = New-Object byte[] 63
$autoCloudCJnk[0] = 1
$autoCloudCJnk[1] = [byte][char]'G'
$autoCloudCJnk[0x2e] = 48
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotCDir "cloud_saves\SAVE\CHRDATC6.JNK"), $autoCloudCJnk)
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotCDir "cloud_saves\SAVE\CHRDATC6.EFF"), [byte[]]@(
  0x35, 0x00, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00
))
$autoCloudCWiz = New-Object byte[] 220
$autoCloudCWiz[34] = 18
$autoCloudCWiz[35] = 19
[IO.File]::WriteAllBytes((Join-Path $autoDokCloudSlotCDir "cloud_saves\SAVE\CHRDATC6.WIZ"), $autoCloudCWiz)
$setupDistanceDir = New-Fixture -Name "setup-distance" -Files @("START.EXE", "KRYNN.CFG", "ECL1.DAX", "GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $setupDistanceDir "GEO1.DAX") 34
Write-SyntheticSetupLoadFilesEclDax (Join-Path $setupDistanceDir "ECL1.DAX") 34 34
$combatMapDir = New-Fixture -Name "combat-map" -Files @("START.EXE", "KRYNN.CFG")
Write-SyntheticGeoDax (Join-Path $combatMapDir "GEO1.DAX") 34
Write-SyntheticCombatMapEclDax (Join-Path $combatMapDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatMapDir "MON1CHA.DAX")
$combatResumeMapDir = New-Fixture -Name "combat-resume-map" -Files @("START.EXE", "KRYNN.CFG")
Write-SyntheticGeoDax (Join-Path $combatResumeMapDir "GEO1.DAX") 34
Write-SyntheticCombatResumeMapEclDax (Join-Path $combatResumeMapDir "ECL1.DAX")
Write-SyntheticMonChaDax (Join-Path $combatResumeMapDir "MON1CHA.DAX")
$menuResumeDir = New-Fixture -Name "menu-resume-map" -Files @("START.EXE", "KRYNN.CFG")
Write-SyntheticGeoDax (Join-Path $menuResumeDir "GEO1.DAX") 34
Write-SyntheticMenuResumeEclDax (Join-Path $menuResumeDir "ECL1.DAX") 34 34
$menuResumeDokDir = New-Fixture -Name "menu-resume-dok-map" -Files @("START.EXE", "DKK.CFG")
Write-SyntheticGeoDax (Join-Path $menuResumeDokDir "GEO1.DAX") 34
Write-SyntheticMenuResumeEclDax (Join-Path $menuResumeDokDir "ECL1.DAX") 34 34
$menuResumeDokRosterDir = New-Fixture -Name "menu-resume-dok-roster-map" -Files @("START.EXE", "DKK.CFG")
Write-SyntheticGeoDax (Join-Path $menuResumeDokRosterDir "GEO1.DAX") 34
Write-SyntheticMenuWhoResumeEclDax (Join-Path $menuResumeDokRosterDir "ECL1.DAX") 34 34
$combatArea2Dir = New-Fixture -Name "combat-area2" -Files @("START.EXE", "CURSE.CFG")
Write-SyntheticGeoDax (Join-Path $combatArea2Dir "GEO2.DAX") 1
Write-SyntheticCombatEclDax (Join-Path $combatArea2Dir "ECL2.DAX") 1
Write-SyntheticMonChaDax (Join-Path $combatArea2Dir "MON2CHA.DAX")
$gameRootCokDir = New-Fixture -Name "game-root-cok" -Files @("GAME\START.EXE", "GAME\KRYNN.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootCokDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootCokDir "GAME\ECL1.DAX") 34 34
$gameRootDokDir = New-Fixture -Name "game-root-dok" -Files @("GAME\START.EXE", "GAME\DKK.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootDokDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootDokDir "GAME\ECL1.DAX") 34 34
$gameRootCokDataDir = New-Fixture -Name "game-root-cok-data" -Files @("GAME\KRYNN.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootCokDataDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootCokDataDir "GAME\ECL1.DAX") 34 34
$gameRootDokDataDir = New-Fixture -Name "game-root-dok-data" -Files @("GAME\DKK.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootDokDataDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootDokDataDir "GAME\ECL1.DAX") 34 34
$gameRootPoolDir = New-Fixture -Name "game-root-pool" -Files @("GAME\START.EXE", "GAME\POOL.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPoolDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootPoolDir "GAME\GEO2.DAX") 48
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootPoolDir "GAME\ECL1.DAX") 34 34
$gameRootCurseDir = New-Fixture -Name "game-root-curse" -Files @("GAME\START.EXE", "GAME\CURSE.CFG", "GAME\ECL2.DAX", "GAME\ECL3.DAX", "GAME\GEO2.DAX", "GAME\GEO3.DAX")
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootCurseDir "GAME\ECL2.DAX") 1 1
Write-SyntheticGeoDax (Join-Path $gameRootCurseDir "GAME\GEO2.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootCurseDir "GAME\ECL3.DAX") 16 16
Write-SyntheticGeoDax (Join-Path $gameRootCurseDir "GAME\GEO3.DAX") 16
$gameRootSecretDir = New-Fixture -Name "game-root-secret" -Files @("GAME\START.EXE", "GAME\BLADES.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootSecretDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootSecretDir "GAME\GEO2.DAX") 48
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootSecretDir "GAME\ECL1.DAX") 34 34
$gameRootGatewayDir = New-Fixture -Name "game-root-gateway" -Files @("GAME\GAME.EXE", "GAME\GAME.CFG", "GAME\ZOUNDS.DAX", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootGatewayDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootGatewayDir "GAME\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootGatewayDir "GAME\ECL1.DAX") 34 34
$gameRootTreasuresDir = New-Fixture -Name "game-root-treasures" -Files @("GAME\GAME.EXE", "GAME\TREASURE.CFG", "GAME\ZOUNDS.DAX", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootTreasuresDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootTreasuresDir "GAME\GEO2.DAX") 48
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootTreasuresDir "GAME\ECL1.DAX") 34 34
$gameRootPodDir = New-Fixture -Name "game-root-pod" -Files @("GAME\GAME.EXE", "GAME\POOL4.CFG", "GAME\GAME.OVR", "GAME\ZOUNDS.DAX", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPodDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootPodDir "GAME\GEO2.DAX") 48
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootPodDir "GAME\ECL1.DAX") 34 34
$gameRootBuckDir = New-Fixture -Name "game-root-buck" -Files @("GAME\BUCK1.EXE", "GAME\BUCK2.EXE", "GAME\BUCK3.EXE", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootBuckDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootBuckDir "GAME\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootBuckDir "GAME\ECL1.DAX") 34 34
$gameRootMatrixDir = New-Fixture -Name "game-root-matrix" -Files @("GAME\START.EXE", "GAME\MATRIX.CFG", "GAME\BUCKA.XMI", "GAME\BUCKB.XMI", "GAME\BUCKC.XMI", "GAME\ECL1.DAX", "GAME\GEO1.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootMatrixDir "GAME\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gameRootMatrixDir "GAME\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootMatrixDir "GAME\ECL1.DAX") 34 34
$gameRootPoolDataDir = New-Fixture -Name "game-root-pool-data" -Files @("GAME\POOL.CFG", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPoolDataDir "GAME\GEO1.DAX")
$gameRootPoolDataEclDir = New-Fixture -Name "game-root-pool-data-ecl" -Files @("GAME\POOL.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPoolDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootPoolDataEclDir "GAME\ECL1.DAX") 34 34
$gameRootCurseDataDir = New-Fixture -Name "game-root-curse-data" -Files @("GAME\CURSE.CFG", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootCurseDataDir "GAME\GEO2.DAX") 34
$gameRootSecretDataDir = New-Fixture -Name "game-root-secret-data" -Files @("GAME\BLADES.CFG", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootSecretDataDir "GAME\GEO1.DAX")
$gameRootSecretDataEclDir = New-Fixture -Name "game-root-secret-data-ecl" -Files @("GAME\BLADES.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootSecretDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootSecretDataEclDir "GAME\ECL1.DAX") 34 34
$gameRootGatewayDataDir = New-Fixture -Name "game-root-gateway-data" -Files @("GAME\GAME.CFG", "GAME\ZOUNDS.DAX", "GAME\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootGatewayDataDir "GAME\GEO2.DAX") 34
$gameRootGatewayDataEclDir = New-Fixture -Name "game-root-gateway-data-ecl" -Files @("GAME\GAME.CFG", "GAME\ZOUNDS.DAX", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootGatewayDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootGatewayDataEclDir "GAME\ECL1.DAX") 34 34
$gameRootTreasuresDataDir = New-Fixture -Name "game-root-treasures-data" -Files @("GAME\TREASURE.CFG", "GAME\ZOUNDS.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootTreasuresDataDir "GAME\GEO1.DAX")
$gameRootTreasuresDataEclDir = New-Fixture -Name "game-root-treasures-data-ecl" -Files @("GAME\TREASURE.CFG", "GAME\ZOUNDS.DAX", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootTreasuresDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootTreasuresDataEclDir "GAME\ECL1.DAX") 34 34
$gameRootPodDataDir = New-Fixture -Name "game-root-pod-data" -Files @("GAME\POOL4.CFG", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPodDataDir "GAME\GEO1.DAX")
$gameRootPodDataEclDir = New-Fixture -Name "game-root-pod-data-ecl" -Files @("GAME\POOL4.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootPodDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootPodDataEclDir "GAME\ECL1.DAX") 34 34
$gameRootMatrixDataDir = New-Fixture -Name "game-root-matrix-data" -Files @("GAME\MATRIX.CFG", "GAME\BUCKA.XMI", "GAME\BUCKB.XMI", "GAME\BUCKC.XMI", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootMatrixDataDir "GAME\GEO1.DAX")
$gameRootMatrixDataEclDir = New-Fixture -Name "game-root-matrix-data-ecl" -Files @("GAME\MATRIX.CFG", "GAME\BUCKA.XMI", "GAME\BUCKB.XMI", "GAME\BUCKC.XMI", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gameRootMatrixDataEclDir "GAME\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gameRootMatrixDataEclDir "GAME\ECL1.DAX") 34 34
$nwnDir = New-Fixture -Name "nwn-dos-aol" -Files @("GAME.EXE", "GAME.CFG", "GAME.OVR", "ECL0.DAX", "GEO0.DAX", "ECL1.DAX", "GEO1.DAX", "ECL2.DAX", "GEO2.DAX", "ECL3.DAX", "GEO3.DAX", "ECL7.DAX", "MONCHA.DAX", "TITLE.DAX", "8X8D.DAX", "WALLDEF.DAX")
Write-SyntheticGeoDax (Join-Path $nwnDir "GEO0.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $nwnDir "ECL0.DAX") 1 1
Write-SyntheticGeoDax (Join-Path $nwnDir "GEO1.DAX") 10
Write-SyntheticLoadFilesEclDax (Join-Path $nwnDir "ECL1.DAX") 10 10
Write-SyntheticGeoDax (Join-Path $nwnDir "GEO2.DAX") 20
Write-SyntheticLoadFilesEclDax (Join-Path $nwnDir "ECL2.DAX") 20 20
Write-SyntheticGeoDax (Join-Path $nwnDir "GEO3.DAX") 30
Write-SyntheticLoadFilesEclDax (Join-Path $nwnDir "ECL3.DAX") 30 30
Write-SyntheticCombatEclDax (Join-Path $nwnDir "ECL7.DAX") 79
Write-SyntheticMonChaDax (Join-Path $nwnDir "MONCHA.DAX")
$nwnChainDir = New-Fixture -Name "nwn-dos-aol-chain" -Files @("GAME.EXE", "GAME.CFG", "GAME.OVR", "ECL0.DAX", "GEO0.DAX", "ECL7.DAX", "MONCHA.DAX")
Write-SyntheticGeoDax (Join-Path $nwnChainDir "GEO0.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $nwnChainDir "ECL0.DAX") 1 1
Write-SyntheticNwnChainEclDax (Join-Path $nwnChainDir "ECL7.DAX") 79
Write-SyntheticMonChaDax (Join-Path $nwnChainDir "MONCHA.DAX")
$nwnDataDir = New-Fixture -Name "nwn-dos-aol-data" -Files @("GAME.CFG", "GAME.OVR", "ECL0.DAX", "GEO0.DAX")
Write-SyntheticGeoDax (Join-Path $nwnDataDir "GEO0.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $nwnDataDir "ECL0.DAX") 1 1
$poolNestedDir = New-Fixture -Name "pool-nested" -Files @("GAME\POOLRAD\START.EXE", "GAME\POOLRAD\POOL.CFG", "GAME\POOLRAD\ECL1.DAX", "GAME\POOLRAD\GEO1.DAX", "GAME\POOLRAD\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $poolNestedDir "GAME\POOLRAD\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $poolNestedDir "GAME\POOLRAD\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $poolNestedDir "GAME\POOLRAD\ECL1.DAX") 34 34
$poolNestedDataDir = New-Fixture -Name "pool-nested-data" -Files @("GAME\POOLRAD\POOL.CFG", "GAME\POOLRAD\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $poolNestedDataDir "GAME\POOLRAD\GEO1.DAX")
$poolNestedDataEclDir = New-Fixture -Name "pool-nested-data-ecl" -Files @("GAME\POOLRAD\POOL.CFG", "GAME\POOLRAD\ECL1.DAX", "GAME\POOLRAD\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $poolNestedDataEclDir "GAME\POOLRAD\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $poolNestedDataEclDir "GAME\POOLRAD\ECL1.DAX") 34 34
$curseNestedDir = New-Fixture -Name "curse-nested" -Files @("GAME\CURSE\START.EXE", "GAME\CURSE\CURSE.CFG")
$curseNestedNativeDir = New-Fixture -Name "curse-nested-native" -Files @("GAME\CURSE\START.EXE", "GAME\CURSE\CURSE.CFG", "GAME\CURSE\ECL2.DAX", "GAME\CURSE\ECL3.DAX", "GAME\CURSE\GEO2.DAX", "GAME\CURSE\GEO3.DAX")
Write-SyntheticLoadFilesEclDax (Join-Path $curseNestedNativeDir "GAME\CURSE\ECL2.DAX") 1 1
Write-SyntheticGeoDax (Join-Path $curseNestedNativeDir "GAME\CURSE\GEO2.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $curseNestedNativeDir "GAME\CURSE\ECL3.DAX") 16 16
Write-SyntheticGeoDax (Join-Path $curseNestedNativeDir "GAME\CURSE\GEO3.DAX") 16
$curseNestedDataDir = New-Fixture -Name "curse-nested-data" -Files @("GAME\CURSE\CURSE.CFG", "GAME\CURSE\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $curseNestedDataDir "GAME\CURSE\GEO2.DAX") 34
$secretNestedDir = New-Fixture -Name "secret-nested" -Files @("GAME\SECRET\START.EXE", "GAME\SECRET\BLADES.CFG", "GAME\SECRET\ECL1.DAX", "GAME\SECRET\GEO1.DAX", "GAME\SECRET\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $secretNestedDir "GAME\SECRET\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $secretNestedDir "GAME\SECRET\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $secretNestedDir "GAME\SECRET\ECL1.DAX") 34 34
$secretNestedDataDir = New-Fixture -Name "secret-nested-data" -Files @("GAME\SECRET\BLADES.CFG", "GAME\SECRET\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $secretNestedDataDir "GAME\SECRET\GEO1.DAX")
$secretNestedDataEclDir = New-Fixture -Name "secret-nested-data-ecl" -Files @("GAME\SECRET\BLADES.CFG", "GAME\SECRET\ECL1.DAX", "GAME\SECRET\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $secretNestedDataEclDir "GAME\SECRET\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $secretNestedDataEclDir "GAME\SECRET\ECL1.DAX") 34 34
$gatewayNestedDir = New-Fixture -Name "gateway-nested" -Files @("GAME\GATEWAY\GAME.EXE", "GAME\GATEWAY\GAME.CFG", "GAME\GATEWAY\ZOUNDS.DAX", "GAME\GATEWAY\ECL1.DAX", "GAME\GATEWAY\GEO1.DAX", "GAME\GATEWAY\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gatewayNestedDir "GAME\GATEWAY\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $gatewayNestedDir "GAME\GATEWAY\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gatewayNestedDir "GAME\GATEWAY\ECL1.DAX") 34 34
$gatewayNestedDataDir = New-Fixture -Name "gateway-nested-data" -Files @("GAME\GATEWAY\GAME.CFG", "GAME\GATEWAY\ZOUNDS.DAX", "GAME\GATEWAY\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gatewayNestedDataDir "GAME\GATEWAY\GEO2.DAX") 34
$gatewayNestedDataEclDir = New-Fixture -Name "gateway-nested-data-ecl" -Files @("GAME\GATEWAY\GAME.CFG", "GAME\GATEWAY\ZOUNDS.DAX", "GAME\GATEWAY\ECL1.DAX", "GAME\GATEWAY\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gatewayNestedDataEclDir "GAME\GATEWAY\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $gatewayNestedDataEclDir "GAME\GATEWAY\ECL1.DAX") 34 34
$treasuresNestedDir = New-Fixture -Name "treasures-nested" -Files @("GAME\TREASURE\GAME.EXE", "GAME\TREASURE\TREASURE.CFG", "GAME\TREASURE\ZOUNDS.DAX", "GAME\TREASURE\ECL1.DAX", "GAME\TREASURE\GEO1.DAX", "GAME\TREASURE\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $treasuresNestedDir "GAME\TREASURE\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $treasuresNestedDir "GAME\TREASURE\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $treasuresNestedDir "GAME\TREASURE\ECL1.DAX") 34 34
$treasuresNestedDataDir = New-Fixture -Name "treasures-nested-data" -Files @("GAME\TREASURE\TREASURE.CFG", "GAME\TREASURE\ZOUNDS.DAX", "GAME\TREASURE\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $treasuresNestedDataDir "GAME\TREASURE\GEO1.DAX")
$treasuresNestedDataEclDir = New-Fixture -Name "treasures-nested-data-ecl" -Files @("GAME\TREASURE\TREASURE.CFG", "GAME\TREASURE\ZOUNDS.DAX", "GAME\TREASURE\ECL1.DAX", "GAME\TREASURE\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $treasuresNestedDataEclDir "GAME\TREASURE\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $treasuresNestedDataEclDir "GAME\TREASURE\ECL1.DAX") 34 34
$podNestedDir = New-Fixture -Name "pod-nested" -Files @("GAME\DARKNESS\GAME.EXE", "GAME\DARKNESS\GAME.OVR", "GAME\DARKNESS\POOL4.CFG", "GAME\DARKNESS\ZOUNDS.DAX", "GAME\DARKNESS\ECL1.DAX", "GAME\DARKNESS\GEO1.DAX", "GAME\DARKNESS\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $podNestedDir "GAME\DARKNESS\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $podNestedDir "GAME\DARKNESS\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $podNestedDir "GAME\DARKNESS\ECL1.DAX") 34 34
$podNestedDataDir = New-Fixture -Name "pod-nested-data" -Files @("GAME\DARKNESS\POOL4.CFG", "GAME\DARKNESS\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $podNestedDataDir "GAME\DARKNESS\GEO1.DAX")
$podNestedDataEclDir = New-Fixture -Name "pod-nested-data-ecl" -Files @("GAME\DARKNESS\POOL4.CFG", "GAME\DARKNESS\ECL1.DAX", "GAME\DARKNESS\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $podNestedDataEclDir "GAME\DARKNESS\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $podNestedDataEclDir "GAME\DARKNESS\ECL1.DAX") 34 34
$buckNestedDir = New-Fixture -Name "buck-nested" -Files @("GAME\BUCK\BUCK1.EXE", "GAME\BUCK\BUCK2.EXE", "GAME\BUCK\BUCK3.EXE", "GAME\BUCK\ECL1.DAX", "GAME\BUCK\GEO1.DAX", "GAME\BUCK\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $buckNestedDir "GAME\BUCK\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $buckNestedDir "GAME\BUCK\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $buckNestedDir "GAME\BUCK\ECL1.DAX") 34 34
$matrixNestedDir = New-Fixture -Name "matrix-nested" -Files @("GAME\MATRIX\START.EXE", "GAME\MATRIX\MATRIX.CFG", "GAME\MATRIX\BUCKA.XMI", "GAME\MATRIX\BUCKB.XMI", "GAME\MATRIX\BUCKC.XMI", "GAME\MATRIX\ECL1.DAX", "GAME\MATRIX\GEO1.DAX", "GAME\MATRIX\GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $matrixNestedDir "GAME\MATRIX\GEO1.DAX") 34
Write-SyntheticGeoDax (Join-Path $matrixNestedDir "GAME\MATRIX\GEO2.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $matrixNestedDir "GAME\MATRIX\ECL1.DAX") 34 34
$matrixNestedDataDir = New-Fixture -Name "matrix-nested-data" -Files @("GAME\MATRIX\MATRIX.CFG", "GAME\MATRIX\BUCKA.XMI", "GAME\MATRIX\BUCKB.XMI", "GAME\MATRIX\BUCKC.XMI", "GAME\MATRIX\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $matrixNestedDataDir "GAME\MATRIX\GEO1.DAX")
$matrixNestedDataEclDir = New-Fixture -Name "matrix-nested-data-ecl" -Files @("GAME\MATRIX\MATRIX.CFG", "GAME\MATRIX\BUCKA.XMI", "GAME\MATRIX\BUCKB.XMI", "GAME\MATRIX\BUCKC.XMI", "GAME\MATRIX\ECL1.DAX", "GAME\MATRIX\GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $matrixNestedDataEclDir "GAME\MATRIX\GEO1.DAX") 34
Write-SyntheticLoadFilesEclDax (Join-Path $matrixNestedDataEclDir "GAME\MATRIX\ECL1.DAX") 34 34
$buckDir = New-Fixture -Name "buck" -Files @("BUCK1.EXE", "BUCK2.EXE", "BUCK3.EXE")
$matrixDir = New-Fixture -Name "matrix" -Files @("START.EXE", "MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI")
$gen1Dir = New-Fixture -Name "gen1" -Files @("START.EXE", "TITLE.DAX")
$gen1DataDir = New-Fixture -Name "gen1-data" -Files @("ECL1.DAX", "GEO1.DAX", "GEO2.DAX", "8X8D1.DAX")
Write-SyntheticGeoDax (Join-Path $gen1DataDir "GEO1.DAX")
Write-SyntheticGeoDax (Join-Path $gen1DataDir "GEO2.DAX")
$gen1Geo2DataDir = New-Fixture -Name "gen1-geo2-data" -Files @("GEO2.DAX")
Write-SyntheticGeoDax (Join-Path $gen1Geo2DataDir "GEO2.DAX")
$gen1ArtDataDir = New-Fixture -Name "gen1-art-data" -Files @("GEO1.DAX", "WALLDEF1.DAX", "8X8D1.DAX")
Write-SyntheticGeoDax (Join-Path $gen1ArtDataDir "GEO1.DAX")
$gen1ArtArea2DataDir = New-Fixture -Name "gen1-art-area2-data" -Files @("GEO2.DAX", "WALLDEF2.DAX", "8X8D1.DAX", "8X8D2.DAX")
Write-SyntheticGeoDax (Join-Path $gen1ArtArea2DataDir "GEO2.DAX")
$fruaDir = New-Fixture -Name "frua" -Files @("CKIT.EXE", "SCRIPT.GLB")
$fruaGeoDir = New-Fixture -Name "frua-geo" -Files @("CKIT.EXE", "SCRIPT.GLB", "GEO.GLB")
Write-SyntheticGeoGlb (Join-Path $fruaGeoDir "GEO.GLB")
$fruaDisk3Dir = New-Fixture -Name "frua-disk3" -Files @("CKIT.EXE", "DISK3\GEO.GLB")
Write-SyntheticGeoGlb (Join-Path $fruaDisk3Dir "DISK3\GEO.GLB")
$fruaNestedDir = New-Fixture -Name "frua-nested" -Files @("GAME\CKIT.EXE", "GAME\SCRIPT.GLB", "GAME\GEO.GLB")
Write-SyntheticGeoGlb (Join-Path $fruaNestedDir "GAME\GEO.GLB")
$fruaGeoArtDataDir = New-Fixture -Name "frua-geo-art" -Files @("CKIT.EXE", "SCRIPT.GLB", "GEO.GLB", "8X8DB.TLB", "8X8DC.TLB")
Write-SyntheticGeoGlb (Join-Path $fruaGeoArtDataDir "GEO.GLB") 3 -VisibleWalls
$fruaScriptEclDir = New-Fixture -Name "frua-script-ecl" -Files @("CKIT.EXE", "SCRIPT.GLB", "GEO.GLB")
Write-SyntheticEclGlbPieces (Join-Path $fruaScriptEclDir "SCRIPT.GLB") 1
Write-SyntheticGeoGlb (Join-Path $fruaScriptEclDir "GEO.GLB") 3 -VisibleWalls
$hlibGeoDataDir = New-Fixture -Name "hlib-geo-data" -Files @("GEO.GLB")
Write-SyntheticGeoGlb (Join-Path $hlibGeoDataDir "GEO.GLB") 3
$hlibNestedGeoDataDir = New-Fixture -Name "hlib-nested-geo-data" -Files @("GAME\GEO.GLB")
Write-SyntheticGeoGlb (Join-Path $hlibNestedGeoDataDir "GAME\GEO.GLB") 3
$hlibGeoArtDataDir = New-Fixture -Name "hlib-geo-art-data" -Files @("GEO.GLB", "8X8DB.TLB", "8X8DC.TLB")
Write-SyntheticGeoGlb (Join-Path $hlibGeoArtDataDir "GEO.GLB") 3 -VisibleWalls
$hlibGeoDbOnlyDataDir = New-Fixture -Name "hlib-geo-db-only-data" -Files @("GEO.GLB", "8X8DB.TLB")
Write-SyntheticGeoGlb (Join-Path $hlibGeoDbOnlyDataDir "GEO.GLB") 3 -VisibleWalls
$dqkFlatDir = New-Fixture -Name "dqk-flat" -Files @("DQK.EXE", "ECL.GLB", "GEO.GLB", "8X8DB.TLB", "8X8DC.TLB")
$dqkNestedDiskDir = New-Fixture -Name "dqk-nested-disk" -Files @("GAME\DQK.EXE", "GAME\DISK3\ECL.GLB", "GAME\DISK3\GEO.GLB")
$dqkDiskDataDir = New-Fixture -Name "dqk-disk-data" -Files @("DISK3\ECL.GLB", "DISK3\GEO.GLB")
$dqkNestedDiskDataDir = New-Fixture -Name "dqk-nested-disk-data" -Files @("GAME\DISK3\ECL.GLB", "GAME\DISK3\GEO.GLB")
$dqkDataDir = New-Fixture -Name "dqk-data" -Files @("ECL.GLB", "GEO.GLB", "8X8DB.TLB", "8X8DC.TLB")
$execPoolDir = New-Fixture -Name "exec-pool" -Files @("POOL.CFG")
Install-ExecChild $execPoolDir "START.EXE"
$execCurseDir = New-Fixture -Name "exec-curse" -Files @("CURSE.CFG")
Install-ExecChild $execCurseDir "START.EXE"
$execSecretDir = New-Fixture -Name "exec-secret" -Files @("BLADES.CFG")
Install-ExecChild $execSecretDir "START.EXE"
$execGatewayDir = New-Fixture -Name "exec-gateway" -Files @("GAME.CFG", "ZOUNDS.DAX")
Install-ExecChild $execGatewayDir "GAME.EXE"
$execTreasuresDir = New-Fixture -Name "exec-treasures" -Files @("TREASURE.CFG", "ZOUNDS.DAX")
Install-ExecChild $execTreasuresDir "GAME.EXE"
$execPodDir = New-Fixture -Name "exec-pod" -Files @("POOL4.CFG", "GAME.OVR", "ZOUNDS.DAX")
Install-ExecChild $execPodDir "GAME.EXE"
$execNwnDir = New-Fixture -Name "exec-nwn-dos-aol" -Files @("GAME.CFG", "GAME.OVR", "ECL0.DAX", "GEO0.DAX")
Write-SyntheticGeoDax (Join-Path $execNwnDir "GEO0.DAX") 1
Write-SyntheticLoadFilesEclDax (Join-Path $execNwnDir "ECL0.DAX") 1 1
Install-ExecChild $execNwnDir "GAME.EXE"
$execGameRootCokDir = New-Fixture -Name "exec-game-root-cok" -Files @("GAME\KRYNN.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Install-ExecChild $execGameRootCokDir "GAME\START.EXE"
$execGameRootDokDir = New-Fixture -Name "exec-game-root-dok" -Files @("GAME\DKK.CFG", "GAME\ECL1.DAX", "GAME\GEO1.DAX")
Install-ExecChild $execGameRootDokDir "GAME\START.EXE"
$execGameRootPoolDir = New-Fixture -Name "exec-game-root-pool" -Files @("GAME\POOL.CFG")
Install-ExecChild $execGameRootPoolDir "GAME\START.EXE"
$execGameRootCurseDir = New-Fixture -Name "exec-game-root-curse" -Files @("GAME\CURSE.CFG")
Install-ExecChild $execGameRootCurseDir "GAME\START.EXE"
$execGameRootSecretDir = New-Fixture -Name "exec-game-root-secret" -Files @("GAME\BLADES.CFG")
Install-ExecChild $execGameRootSecretDir "GAME\START.EXE"
$execGameRootGatewayDir = New-Fixture -Name "exec-game-root-gateway" -Files @("GAME\GAME.CFG", "GAME\ZOUNDS.DAX")
Install-ExecChild $execGameRootGatewayDir "GAME\GAME.EXE"
$execGameRootTreasuresDir = New-Fixture -Name "exec-game-root-treasures" -Files @("GAME\TREASURE.CFG", "GAME\ZOUNDS.DAX")
Install-ExecChild $execGameRootTreasuresDir "GAME\GAME.EXE"
$execGameRootPodDir = New-Fixture -Name "exec-game-root-pod" -Files @("GAME\POOL4.CFG", "GAME\GAME.OVR", "GAME\ZOUNDS.DAX")
Install-ExecChild $execGameRootPodDir "GAME\GAME.EXE"
$execGameRootBuckDir = New-Fixture -Name "exec-game-root-buck" -Files @("GAME\BUCK2.EXE", "GAME\BUCK3.EXE")
Install-ExecChild $execGameRootBuckDir "GAME\BUCK1.EXE"
$execGameRootMatrixDir = New-Fixture -Name "exec-game-root-matrix" -Files @("GAME\MATRIX.CFG", "GAME\BUCKA.XMI", "GAME\BUCKB.XMI", "GAME\BUCKC.XMI")
Install-ExecChild $execGameRootMatrixDir "GAME\START.EXE"
$execPoolNestedDir = New-Fixture -Name "exec-pool-nested" -Files @("GAME\POOLRAD\POOL.CFG")
Install-ExecChild $execPoolNestedDir "GAME\POOLRAD\START.EXE"
$execCurseNestedDir = New-Fixture -Name "exec-curse-nested" -Files @("GAME\CURSE\CURSE.CFG")
Install-ExecChild $execCurseNestedDir "GAME\CURSE\START.EXE"
$execSecretNestedDir = New-Fixture -Name "exec-secret-nested" -Files @("GAME\SECRET\BLADES.CFG")
Install-ExecChild $execSecretNestedDir "GAME\SECRET\START.EXE"
$execGatewayNestedDir = New-Fixture -Name "exec-gateway-nested" -Files @("GAME\GATEWAY\GAME.CFG", "GAME\GATEWAY\ZOUNDS.DAX")
Install-ExecChild $execGatewayNestedDir "GAME\GATEWAY\GAME.EXE"
$execTreasuresNestedDir = New-Fixture -Name "exec-treasures-nested" -Files @("GAME\TREASURE\TREASURE.CFG", "GAME\TREASURE\ZOUNDS.DAX")
Install-ExecChild $execTreasuresNestedDir "GAME\TREASURE\GAME.EXE"
$execPodNestedDir = New-Fixture -Name "exec-pod-nested" -Files @("GAME\DARKNESS\POOL4.CFG", "GAME\DARKNESS\GAME.OVR", "GAME\DARKNESS\ZOUNDS.DAX")
Install-ExecChild $execPodNestedDir "GAME\DARKNESS\GAME.EXE"
$execBuckNestedDir = New-Fixture -Name "exec-buck-nested" -Files @("GAME\BUCK\BUCK2.EXE", "GAME\BUCK\BUCK3.EXE")
Install-ExecChild $execBuckNestedDir "GAME\BUCK\BUCK1.EXE"
$execMatrixNestedDir = New-Fixture -Name "exec-matrix-nested" -Files @("GAME\MATRIX\MATRIX.CFG", "GAME\MATRIX\BUCKA.XMI", "GAME\MATRIX\BUCKB.XMI", "GAME\MATRIX\BUCKC.XMI")
Install-ExecChild $execMatrixNestedDir "GAME\MATRIX\START.EXE"
$execDqkFlatDir = New-Fixture -Name "exec-dqk-flat" -Files @("ECL.GLB", "GEO.GLB")
Install-ExecChild $execDqkFlatDir "DQK.EXE"
$execDqkNestedDiskDir = New-Fixture -Name "exec-dqk-nested-disk" -Files @("GAME\DISK3\ECL.GLB", "GAME\DISK3\GEO.GLB")
Install-ExecChild $execDqkNestedDiskDir "GAME\DQK.EXE"
$execBuckDir = New-Fixture -Name "exec-buck" -Files @("BUCK2.EXE", "BUCK3.EXE")
Install-ExecChild $execBuckDir "BUCK1.EXE"
$execMatrixDir = New-Fixture -Name "exec-matrix" -Files @("MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI")
Install-ExecChild $execMatrixDir "START.EXE"
$execFruaDir = New-Fixture -Name "exec-frua" -Files @("SCRIPT.GLB")
Install-ExecChild $execFruaDir "CKIT.EXE"
$execFruaNestedDir = New-Fixture -Name "exec-frua-nested" -Files @("GAME\SCRIPT.GLB")
Install-ExecChild $execFruaNestedDir "GAME\CKIT.EXE"
$gfxAmigaDir = New-Fixture -Name "graphics-amiga" -Files @("KRYNN.CFG", "START.EXE", "GEO1.DAX", "8X8D1.DAA")

# The three retail releases, staged ONCE for the dry-run batches below. The case
# tables used to carry `(Join-Path $root "<title>")` directly, and those raw
# paths reached `mount D` + `D:` at Invoke-DryRunBatch's mount site -- see the
# header for why the round-37 sweep did not see them and what the (low, non-zero)
# risk actually was. Both later engine-smoke blocks stage the same three sources
# again ($cokMount/$dokMount/$dqkMount); New-RetailStage is an idempotent sync,
# so the repeat is a directory walk and not a second copy.
$cokRetailMount = New-RetailStage -Source (Join-Path $root "Champions of Krynn")
$dokRetailMount = New-RetailStage -Source (Join-Path $root "Death Knights of Krynn")
$dqkRetailMount = New-RetailStage -Source (Join-Path $root "The Dark Queen of Krynn")

$cases = @(
  @{ label = "GFXAUTO"; dir = $gfxAmigaDir; args = "/G 0"; expect = "graphics: auto -> DOS (native renderer)"; extraExpect = "Generic Gold Box Gen1" },
  @{ label = "GFXDOS"; dir = $gfxAmigaDir; args = "/G 1"; expect = "graphics: DOS -> DOS (native renderer)"; extraExpect = "Generic Gold Box Gen1" },
  @{ label = "GFXAMI"; dir = $gfxAmigaDir; args = "/G 2"; expect = "graphics: Amiga -> Amiga (native resource bridge with DOS fallback)"; extraExpect = "Generic Gold Box Gen1" },
  @{ label = "GFXAMIS"; dir = $cokDataDir; args = "/G 2"; expect = "graphics: Amiga -> DOS (assets unavailable; DOS fallback)"; extraExpect = "Champions of Krynn" },
  @{ label = "GFXC64"; dir = $gfxAmigaDir; args = "/G 3"; expect = "graphics: C64 -> DOS (decoder unavailable; DOS fallback)"; extraExpect = "Generic Gold Box Gen1" },
  @{ label = "COK"; dir = $cokRetailMount; expect = "Champions of Krynn" },
  @{ label = "DOK"; dir = $dokRetailMount; expect = "Death Knights of Krynn" },
  @{ label = "DQK"; dir = $dqkRetailMount; expect = "DQK-class HLIB" },
  @{ label = "POOL"; dir = $poolDir; expect = "Pool of Radiance" },
  @{ label = "CURSE"; dir = $curseDir; expect = "Curse of the Azure Bonds" },
  @{ label = "CURSED"; dir = $curseDataDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DCOK"; dir = $cokDataDir; expect = "Champions of Krynn"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DDOK"; dir = $dokDataDir; expect = "Death Knights of Krynn"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DCURSE"; dir = $curseCfgDataDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DPOOL"; dir = $poolDataDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DSECR"; dir = $secretDataDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DGATE"; dir = $gatewayDataDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DTREAS"; dir = $treasuresDataDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DPOD"; dir = $podDataDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DMATRIX"; dir = $matrixDataDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DPOLE"; dir = $poolDataEclDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DSECE"; dir = $secretDataEclDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DGATEE"; dir = $gatewayDataEclDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DTREE"; dir = $treasuresDataEclDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DPODE"; dir = $podDataEclDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NWN"; dir = $nwnDir; expect = "Neverwinter Nights (DOS/AOL)"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "DNWN"; dir = $nwnDataDir; expect = "Neverwinter Nights (DOS/AOL)"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DMATE"; dir = $matrixDataEclDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "SECRET"; dir = $secretDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   START.EXE" },
  @{ label = "GATE"; dir = $gatewayDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   GAME.EXE UseStart" },
  @{ label = "TREAS"; dir = $treasuresDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "POD"; dir = $podDir; expect = "Pools of Darkness"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "GCOK"; dir = $gameRootCokDir; expect = "Champions of Krynn"; extraExpect = "exec:   START.EXE" },
  @{ label = "GDOK"; dir = $gameRootDokDir; expect = "Death Knights of Krynn"; extraExpect = "exec:   START.EXE" },
  @{ label = "GPOL"; dir = $gameRootPoolDir; expect = "Pool of Radiance"; extraExpect = "exec:   START.EXE" },
  @{ label = "GCUR"; dir = $gameRootCurseDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   START.EXE" },
  @{ label = "GSEC"; dir = $gameRootSecretDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   START.EXE" },
  @{ label = "GGATE"; dir = $gameRootGatewayDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   GAME.EXE UseStart" },
  @{ label = "GTREA"; dir = $gameRootTreasuresDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "GPOD"; dir = $gameRootPodDir; expect = "Pools of Darkness"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "GBUCK"; dir = $gameRootBuckDir; expect = "Buck Rogers: Countdown to Doomsday"; extraExpect = "exec:   BUCK1.EXE" },
  @{ label = "GMAT"; dir = $gameRootMatrixDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   START.EXE" },
  @{ label = "GDCOK"; dir = $gameRootCokDataDir; expect = "Champions of Krynn"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDDOK"; dir = $gameRootDokDataDir; expect = "Death Knights of Krynn"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDPOL"; dir = $gameRootPoolDataDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDCUR"; dir = $gameRootCurseDataDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDSEC"; dir = $gameRootSecretDataDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDGATE"; dir = $gameRootGatewayDataDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDTREA"; dir = $gameRootTreasuresDataDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDPOD"; dir = $gameRootPodDataDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDMAT"; dir = $gameRootMatrixDataDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDPOLE"; dir = $gameRootPoolDataEclDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDSECE"; dir = $gameRootSecretDataEclDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDGATEE"; dir = $gameRootGatewayDataEclDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDTREE"; dir = $gameRootTreasuresDataEclDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDPODE"; dir = $gameRootPodDataEclDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GDMATE"; dir = $gameRootMatrixDataEclDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NPOOL"; dir = $poolNestedDir; expect = "Pool of Radiance"; extraExpect = "exec:   START.EXE" },
  @{ label = "NDPOOL"; dir = $poolNestedDataDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDPOLE"; dir = $poolNestedDataEclDir; expect = "Pool of Radiance"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NCURSE"; dir = $curseNestedDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   START.EXE" },
  @{ label = "NCURSN"; dir = $curseNestedNativeDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   START.EXE" },
  @{ label = "NDCURSE"; dir = $curseNestedDataDir; expect = "Curse of the Azure Bonds"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NSECR"; dir = $secretNestedDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   START.EXE" },
  @{ label = "NDSECR"; dir = $secretNestedDataDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDSECE"; dir = $secretNestedDataEclDir; expect = "Secret of the Silver Blades"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NGATE"; dir = $gatewayNestedDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   GAME.EXE UseStart" },
  @{ label = "NDGATE"; dir = $gatewayNestedDataDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDGATEE"; dir = $gatewayNestedDataEclDir; expect = "Gateway to the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NTREAS"; dir = $treasuresNestedDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "NDTREAS"; dir = $treasuresNestedDataDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDTREE"; dir = $treasuresNestedDataEclDir; expect = "Treasures of the Savage Frontier"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NPOD"; dir = $podNestedDir; expect = "Pools of Darkness"; extraExpect = "exec:   GAME.EXE" },
  @{ label = "NDPOD"; dir = $podNestedDataDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDPODE"; dir = $podNestedDataEclDir; expect = "Pools of Darkness"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NBUCK"; dir = $buckNestedDir; expect = "Buck Rogers: Countdown to Doomsday"; extraExpect = "exec:   BUCK1.EXE" },
  @{ label = "NMATRIX"; dir = $matrixNestedDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   START.EXE" },
  @{ label = "NDMATRIX"; dir = $matrixNestedDataDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDMATE"; dir = $matrixNestedDataEclDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   (native /E only)" },
  @{ label = "BUCK"; dir = $buckDir; expect = "Buck Rogers: Countdown to Doomsday" },
  @{ label = "MATRIX"; dir = $matrixDir; expect = "Buck Rogers: Matrix Cubed"; extraExpect = "exec:   START.EXE" },
  @{ label = "GEN1"; dir = $gen1Dir; expect = "Generic Gold Box Gen1 DAX install" },
  @{ label = "GEND"; dir = $gen1DataDir; expect = "Generic Gold Box Gen1 DAX install"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GENDG2"; dir = $gen1Geo2DataDir; expect = "Generic Gold Box Gen1 DAX install"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GENDT"; dir = $gen1ArtDataDir; expect = "Generic Gold Box Gen1 DAX install"; extraExpect = "exec:   (native /E only)" },
  @{ label = "GENDT2"; dir = $gen1ArtArea2DataDir; expect = "Generic Gold Box Gen1 DAX install"; extraExpect = "exec:   (native /E only)" },
  @{ label = "FRUA"; dir = $fruaDir; expect = "Forgotten Realms Unlimited Adventures-style HLIB install" },
  @{ label = "FRUAD3"; dir = $fruaDisk3Dir; expect = "Forgotten Realms Unlimited Adventures-style HLIB install"; extraExpect = "exec:   CKIT.EXE" },
  @{ label = "NFRUA"; dir = $fruaNestedDir; expect = "Forgotten Realms Unlimited Adventures-style HLIB install"; extraExpect = "exec:   CKIT.EXE" },
  @{ label = "FRUAA"; dir = $fruaGeoArtDataDir; expect = "Forgotten Realms Unlimited Adventures-style HLIB install"; extraExpect = "exec:   CKIT.EXE" },
  @{ label = "FRUAB"; dir = $fruaScriptEclDir; expect = "Forgotten Realms Unlimited Adventures-style HLIB install"; extraExpect = "exec:   CKIT.EXE" },
  @{ label = "HLIBD"; dir = $hlibGeoDataDir; expect = "Generic Gold Box HLIB/GLB data dump"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NHLIBD"; dir = $hlibNestedGeoDataDir; expect = "Generic Gold Box HLIB/GLB data dump"; extraExpect = "exec:   (native /E only)" },
  @{ label = "HLIBDA"; dir = $hlibGeoArtDataDir; expect = "Generic Gold Box HLIB/GLB data dump"; extraExpect = "exec:   (native /E only)" },
  @{ label = "HLIBDB"; dir = $hlibGeoDbOnlyDataDir; expect = "Generic Gold Box HLIB/GLB data dump"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DQKF"; dir = $dqkFlatDir; expect = "DQK-class HLIB" },
  @{ label = "NDQK"; dir = $dqkNestedDiskDir; expect = "DQK-class HLIB"; extraExpect = "exec:   DQK.EXE SB220 SI7 RB330" },
  @{ label = "DQKDD"; dir = $dqkDiskDataDir; expect = "DQK-class HLIB"; extraExpect = "exec:   (native /E only)" },
  @{ label = "NDQKDD"; dir = $dqkNestedDiskDataDir; expect = "DQK-class HLIB"; extraExpect = "exec:   (native /E only)" },
  @{ label = "DQKD"; dir = $dqkDataDir; expect = "Generic Gold Box HLIB/GLB data dump"; extraExpect = "exec:   (native /E only)" }
)

$engineCases = @(
  @{ label = "ECOK"; dir = $cokRetailMount; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ECOKA2"; dir = $cokRetailMount; args = "/A 2"; expect = "native: CCECL ECL2.DAX entry 48 -> CCGEO /B GEO2.DAX" },
  @{ label = "ECOKA3"; dir = $cokRetailMount; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 80 -> CCGEO /B GEO3.DAX" },
  @{ label = "EDOK"; dir = $dokRetailMount; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDOKA2"; dir = $dokRetailMount; args = "/A 2"; expect = "native: CCECL ECL2.DAX entry 48 -> CCGEO /B GEO2.DAX" },
  @{ label = "EDOKA3"; dir = $dokRetailMount; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 80 -> CCGEO /B GEO3.DAX" },
  @{ label = "EDCOK"; dir = $cokDataDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDDOK"; dir = $dokDataDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDQK"; dir = $dqkRetailMount; expect = "native: CCECL DISK3\ECL.GLB entry 1 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA"; dir = $dqkRetailMount; args = "/A 2"; expect = "native: CCECL DISK3\ECL.GLB entry 2 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA3"; dir = $dqkRetailMount; args = "/A 3"; expect = "native: CCECL DISK3\ECL.GLB entry 3 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA4"; dir = $dqkRetailMount; args = "/A 4"; expect = "native: CCECL DISK3\ECL.GLB entry 4 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA5"; dir = $dqkRetailMount; args = "/A 5"; expect = "native: CCECL DISK3\ECL.GLB entry 5 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA7"; dir = $dqkRetailMount; args = "/A 7"; expect = "native: CCECL DISK3\ECL.GLB entry 7 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA14"; dir = $dqkRetailMount; args = "/A 14"; expect = "native: CCECL DISK3\ECL.GLB entry 14 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA18"; dir = $dqkRetailMount; args = "/A 18"; expect = "native: CCECL DISK3\ECL.GLB entry 18 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA22"; dir = $dqkRetailMount; args = "/A 22"; expect = "native: CCECL DISK3\ECL.GLB entry 22 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA26"; dir = $dqkRetailMount; args = "/A 26"; expect = "native: CCECL DISK3\ECL.GLB entry 26 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA30"; dir = $dqkRetailMount; args = "/A 30"; expect = "native: CCECL DISK3\ECL.GLB entry 30 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA42"; dir = $dqkRetailMount; args = "/A 42"; expect = "native: CCECL DISK3\ECL.GLB entry 42 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA46"; dir = $dqkRetailMount; args = "/A 46"; expect = "native: CCECL DISK3\ECL.GLB entry 46 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA50"; dir = $dqkRetailMount; args = "/A 50"; expect = "native: CCECL DISK3\ECL.GLB entry 50 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKA54"; dir = $dqkRetailMount; args = "/A 54"; expect = "native: CCECL DISK3\ECL.GLB entry 54 -> CCGEO /B DISK3\GEO.GLB"; extraExpect = "native: CCHLIB W DISK2\8X8DB.TLB + DISK2\8X8DC.TLB" },
  @{ label = "EDQKF"; dir = $dqkFlatDir; expect = "native: CCECL ECL.GLB entry 1 -> CCGEO /B GEO.GLB"; extraExpect = "native: CCHLIB W 8X8DB.TLB + 8X8DC.TLB" },
  @{ label = "EDQKD"; dir = $dqkDataDir; expect = "native: CCECL ECL.GLB entry 1 -> CCGEO /B GEO.GLB"; extraExpect = "native: CCHLIB W 8X8DB.TLB + 8X8DC.TLB" },
  @{ label = "ECOAB"; dir = $curseNativeDir; expect = "native: CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX" },
  @{ label = "ECOABA3"; dir = $curseNativeDir; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 16 -> CCGEO /B GEO3.DAX" },
  @{ label = "ECOABA4"; dir = $curseNativeDir; args = "/A 4"; expect = "native: CCECL ECL4.DAX entry 32 -> CCGEO /B GEO4.DAX" },
  @{ label = "ECOABA5"; dir = $curseNativeDir; args = "/A 5"; expect = "native: CCECL ECL5.DAX entry 49 -> CCGEO /B GEO5.DAX" },
  @{ label = "ECOABA6"; dir = $curseNativeDir; args = "/A 6"; expect = "native: CCECL ECL6.DAX entry 64 -> CCGEO /B GEO6.DAX" },
  @{ label = "ECOABD"; dir = $curseDataDir; expect = "native: CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX" },
  @{ label = "ECOABDA3"; dir = $curseDataDir; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 16 -> CCGEO /B GEO3.DAX" },
  @{ label = "ECOABDA4"; dir = $curseDataDir; args = "/A 4"; expect = "native: CCECL ECL4.DAX entry 32 -> CCGEO /B GEO4.DAX" },
  @{ label = "ECOABDA5"; dir = $curseDataDir; args = "/A 5"; expect = "native: CCECL ECL5.DAX entry 49 -> CCGEO /B GEO5.DAX" },
  @{ label = "ECOABDA6"; dir = $curseDataDir; args = "/A 6"; expect = "native: CCECL ECL6.DAX entry 64 -> CCGEO /B GEO6.DAX" },
  @{ label = "EDCURSE"; dir = $curseCfgDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EDPOOL"; dir = $poolDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EDSECR"; dir = $secretDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EDGATE"; dir = $gatewayDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EDTREAS"; dir = $treasuresDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EDPOD"; dir = $podDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EDMATRIX"; dir = $matrixDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EDPOLE"; dir = $poolDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDSECE"; dir = $secretDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDGATEE"; dir = $gatewayDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDTREE"; dir = $treasuresDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EDPODE"; dir = $podDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENWN"; dir = $nwnDir; expect = "native: CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX" },
  @{ label = "ENWNA1"; dir = $nwnDir; args = "/A 1"; expect = "native: CCECL ECL1.DAX entry 10 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENWNA2"; dir = $nwnDir; args = "/A 2"; expect = "native: CCECL ECL2.DAX entry 20 -> CCGEO /B GEO2.DAX" },
  @{ label = "ENWNA3"; dir = $nwnDir; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 30 -> CCGEO /B GEO3.DAX" },
  @{ label = "ENWNA7"; dir = $nwnDir; args = "/A 7"; expect = "native: CCECL ECL7.DAX entry 79 -> CCGEO /B GEO0.DAX" },
  @{ label = "EDNWN"; dir = $nwnDataDir; expect = "native: CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX" },
  @{ label = "EDMATE"; dir = $matrixDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENDPOOL"; dir = $poolNestedDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ENDPOLE"; dir = $poolNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENDCURSE"; dir = $curseNestedDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENDSECR"; dir = $secretNestedDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ENDSECE"; dir = $secretNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENDGATE"; dir = $gatewayNestedDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENDGATEE"; dir = $gatewayNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENDTREAS"; dir = $treasuresNestedDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ENDTREE"; dir = $treasuresNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENDPOD"; dir = $podNestedDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ENDPODE"; dir = $podNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENCURSE"; dir = $curseNestedNativeDir; expect = "native: CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX" },
  @{ label = "ENCURA3"; dir = $curseNestedNativeDir; args = "/A 3"; expect = "native: CCECL ECL3.DAX entry 16 -> CCGEO /B GEO3.DAX" },
  @{ label = "EPOOL"; dir = $poolGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EPOOLB0"; dir = $poolGeoDir; args = "/B 34"; expect = "unavailable: requested native ECL entry/archive is not present" },
  @{ label = "EPOOLA2"; dir = $poolGeoDir; args = "/A 2"; expect = "unavailable: requested native area/map is not present" },
  @{ label = "EPOOLA2G"; dir = $poolArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENPOOL"; dir = $poolNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENPOOLA2"; dir = $poolNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EPOOLDEF"; dir = $poolEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EPOOLECL"; dir = $poolEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ESECR"; dir = $secretGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ESECRA2"; dir = $secretArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENSECR"; dir = $secretNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENSECA2"; dir = $secretNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ESECRDEF"; dir = $secretEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ESECRECL"; dir = $secretEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGATE"; dir = $gatewayGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGATEA2"; dir = $gatewayArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENGATE"; dir = $gatewayNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENGATA2"; dir = $gatewayNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EGATEDEF"; dir = $gatewayEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGATEECL"; dir = $gatewayEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGATE2"; dir = $gatewayGeo2Dir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ETREAS"; dir = $treasuresGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ETREA2"; dir = $treasuresArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENTREAS"; dir = $treasuresNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENTRA2"; dir = $treasuresNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ETRESDEF"; dir = $treasuresEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ETRESECL"; dir = $treasuresEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EPOD"; dir = $podGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EPODA2"; dir = $podArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENPOD"; dir = $podNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENPODA2"; dir = $podNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EPODDEF"; dir = $podEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EPODECL"; dir = $podEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EFRUAB0"; dir = $fruaDir; args = "/B 1"; expect = "unavailable: requested native ECL entry/archive is not present" },
  @{ label = "EFRUA"; dir = $fruaGeoDir; expect = "native: CCGEO /B GEO.GLB map 0" },
  @{ label = "EFRUAD3"; dir = $fruaDisk3Dir; expect = "unavailable: no known GEO map for this profile" },
  @{ label = "ENFRUA"; dir = $fruaNestedDir; expect = "native: CCGEO /B GEO.GLB map 0" },
  @{ label = "EFRUAA"; dir = $fruaGeoArtDataDir; expect = "native: CCGEO /B GEO.GLB map 0"; extraExpect = "native: CCHLIB W 8X8DB.TLB + 8X8DC.TLB" },
  @{ label = "EFRUAB"; dir = $fruaScriptEclDir; args = "/B 1"; expect = "native: CCECL SCRIPT.GLB entry 1 -> CCGEO /B GEO.GLB" },
  @{ label = "EHLIBD"; dir = $hlibGeoDataDir; expect = "native: CCGEO /B GEO.GLB map 0" },
  @{ label = "ENHLIBD"; dir = $hlibNestedGeoDataDir; expect = "native: CCGEO /B GEO.GLB map 0" },
  @{ label = "EHLIBDA2"; dir = $hlibGeoDataDir; args = "/A 2"; expect = "native: CCGEO /B GEO.GLB map 2" },
  @{ label = "EHLIBDA"; dir = $hlibGeoArtDataDir; expect = "native: CCGEO /B GEO.GLB map 0"; extraExpect = "native: CCHLIB W 8X8DB.TLB + 8X8DC.TLB" },
  @{ label = "EHLIBDB"; dir = $hlibGeoDbOnlyDataDir; expect = "native: CCGEO /B GEO.GLB map 0"; extraExpect = "native: CCHLIB W 8X8DB.TLB" },
  @{ label = "ENDQK"; dir = $dqkNestedDiskDir; expect = "native: CCECL DISK3\ECL.GLB entry 1 -> CCGEO /B DISK3\GEO.GLB" },
  @{ label = "EDQKDD"; dir = $dqkDiskDataDir; expect = "native: CCECL DISK3\ECL.GLB entry 1 -> CCGEO /B DISK3\GEO.GLB" },
  @{ label = "ENDQKDD"; dir = $dqkNestedDiskDataDir; expect = "native: CCECL DISK3\ECL.GLB entry 1 -> CCGEO /B DISK3\GEO.GLB" },
  @{ label = "EGCOK"; dir = $gameRootCokDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDOK"; dir = $gameRootDokDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDCOK"; dir = $gameRootCokDataDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDDOK"; dir = $gameRootDokDataDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGPOL"; dir = $gameRootPoolDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGCUR"; dir = $gameRootCurseDir; expect = "native: CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX" },
  @{ label = "EGSEC"; dir = $gameRootSecretDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGGATE"; dir = $gameRootGatewayDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGTREA"; dir = $gameRootTreasuresDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGPOD"; dir = $gameRootPodDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGBUCK"; dir = $gameRootBuckDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGMAT"; dir = $gameRootMatrixDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDPOL"; dir = $gameRootPoolDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGDCUR"; dir = $gameRootCurseDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EGDSEC"; dir = $gameRootSecretDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGDGAT"; dir = $gameRootGatewayDataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EGDTR"; dir = $gameRootTreasuresDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGDPOD"; dir = $gameRootPodDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGDMAT"; dir = $gameRootMatrixDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGDPOLE"; dir = $gameRootPoolDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDSECE"; dir = $gameRootSecretDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDGATE"; dir = $gameRootGatewayDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDTREE"; dir = $gameRootTreasuresDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDPODE"; dir = $gameRootPodDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGDMATE"; dir = $gameRootMatrixDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EBUCK"; dir = $buckDir; expect = "unavailable: no known GEO map" },
  @{ label = "EBUCKG"; dir = $buckGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EBUCKA2"; dir = $buckArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENBUCK"; dir = $buckNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENBUCA2"; dir = $buckNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EBUCKDEF"; dir = $buckEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EBUCKECL"; dir = $buckEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EMATRIX"; dir = $matrixDir; expect = "unavailable: no known GEO map" },
  @{ label = "EMATG"; dir = $matrixGeoDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EMATA2"; dir = $matrixArea2Dir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENMATRIX"; dir = $matrixNestedDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "ENMATA2"; dir = $matrixNestedDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "ENDMAT"; dir = $matrixNestedDataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "ENDMATE"; dir = $matrixNestedDataEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EMATDEF"; dir = $matrixEclDir; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EMATECL"; dir = $matrixEclDir; args = "/B 34"; expect = "native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX" },
  @{ label = "EGEND"; dir = $gen1DataDir; expect = "native: CCGEO /B GEO1.DAX map 0" },
  @{ label = "EGEND2"; dir = $gen1DataDir; args = "/A 2"; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EGENDG2"; dir = $gen1Geo2DataDir; expect = "native: CCGEO /B GEO2.DAX map 0" },
  @{ label = "EGENDT"; dir = $gen1ArtDataDir; expect = "native: CCGEO /B GEO1.DAX map 0"; extraExpect = "native: CCFP /T /A 1" },
  @{ label = "EGENDT2"; dir = $gen1ArtArea2DataDir; expect = "native: CCGEO /B GEO2.DAX map 0"; extraExpect = "native: CCFP /T /A 2" }
)

$execCases = @(
  @{ label = "XPOOL"; dir = $execPoolDir; outDir = $execPoolDir; expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XCURSE"; dir = $execCurseDir; outDir = $execCurseDir; expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XSECR"; dir = $execSecretDir; outDir = $execSecretDir; expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGATE"; dir = $execGatewayDir; outDir = $execGatewayDir; expectTail = " UseStart"; expectBoot = "exec:   GAME.EXE UseStart" },
  @{ label = "XTREAS"; dir = $execTreasuresDir; outDir = $execTreasuresDir; expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XPOD"; dir = $execPodDir; outDir = $execPodDir; expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XNWN"; dir = $execNwnDir; outDir = $execNwnDir; expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XGCOK"; dir = $execGameRootCokDir; outDir = (Join-Path $execGameRootCokDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGDOK"; dir = $execGameRootDokDir; outDir = (Join-Path $execGameRootDokDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGPOL"; dir = $execGameRootPoolDir; outDir = (Join-Path $execGameRootPoolDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGCUR"; dir = $execGameRootCurseDir; outDir = (Join-Path $execGameRootCurseDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGSEC"; dir = $execGameRootSecretDir; outDir = (Join-Path $execGameRootSecretDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XGGATE"; dir = $execGameRootGatewayDir; outDir = (Join-Path $execGameRootGatewayDir "GAME"); expectTail = " UseStart"; expectBoot = "exec:   GAME.EXE UseStart" },
  @{ label = "XGTREA"; dir = $execGameRootTreasuresDir; outDir = (Join-Path $execGameRootTreasuresDir "GAME"); expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XGPOD"; dir = $execGameRootPodDir; outDir = (Join-Path $execGameRootPodDir "GAME"); expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XGBUCK"; dir = $execGameRootBuckDir; outDir = (Join-Path $execGameRootBuckDir "GAME"); expectTail = ""; expectBoot = "exec:   BUCK1.EXE" },
  @{ label = "XGMAT"; dir = $execGameRootMatrixDir; outDir = (Join-Path $execGameRootMatrixDir "GAME"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XNPOOL"; dir = $execPoolNestedDir; outDir = (Join-Path $execPoolNestedDir "GAME\POOLRAD"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XNCURSE"; dir = $execCurseNestedDir; outDir = (Join-Path $execCurseNestedDir "GAME\CURSE"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XNSECR"; dir = $execSecretNestedDir; outDir = (Join-Path $execSecretNestedDir "GAME\SECRET"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XNGATE"; dir = $execGatewayNestedDir; outDir = (Join-Path $execGatewayNestedDir "GAME\GATEWAY"); expectTail = " UseStart"; expectBoot = "exec:   GAME.EXE UseStart" },
  @{ label = "XNTREAS"; dir = $execTreasuresNestedDir; outDir = (Join-Path $execTreasuresNestedDir "GAME\TREASURE"); expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XNPOD"; dir = $execPodNestedDir; outDir = (Join-Path $execPodNestedDir "GAME\DARKNESS"); expectTail = ""; expectBoot = "exec:   GAME.EXE" },
  @{ label = "XNBUCK"; dir = $execBuckNestedDir; outDir = (Join-Path $execBuckNestedDir "GAME\BUCK"); expectTail = ""; expectBoot = "exec:   BUCK1.EXE" },
  @{ label = "XNMAT"; dir = $execMatrixNestedDir; outDir = (Join-Path $execMatrixNestedDir "GAME\MATRIX"); expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XDQK"; dir = $execDqkFlatDir; outDir = $execDqkFlatDir; expectTail = " SB220 SI7 RB330"; expectBoot = "exec:   DQK.EXE SB220 SI7 RB330" },
  @{ label = "XNDQK"; dir = $execDqkNestedDiskDir; outDir = (Join-Path $execDqkNestedDiskDir "GAME"); expectTail = " SB220 SI7 RB330"; expectBoot = "exec:   DQK.EXE SB220 SI7 RB330" },
  @{ label = "XBUCK"; dir = $execBuckDir; outDir = $execBuckDir; expectTail = ""; expectBoot = "exec:   BUCK1.EXE" },
  @{ label = "XMATRIX"; dir = $execMatrixDir; outDir = $execMatrixDir; expectTail = ""; expectBoot = "exec:   START.EXE" },
  @{ label = "XFRUA"; dir = $execFruaDir; outDir = $execFruaDir; expectTail = ""; expectBoot = "exec:   CKIT.EXE" },
  @{ label = "XNFRUA"; dir = $execFruaNestedDir; outDir = (Join-Path $execFruaNestedDir "GAME"); expectTail = ""; expectBoot = "exec:   CKIT.EXE" }
)

function Invoke-DryRunBatch {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][object[]]$BatchCases,
    [switch]$Engine
  )

  $lines = @(
    "@echo off",
    ('mount C "{0}"' -f $run),
    "C:"
  )
  foreach ($c in $BatchCases) {
    if (([string]$c.label).Length -gt 8) {
      throw "GBBOOT dry-run label '$($c.label)' exceeds DOS 8.3 redirected filename limit"
    }
    $lines += ('mount D "{0}"' -f $c.dir)
    $lines += "D:"
    if ($Engine) {
      $extraArgs = if ($c.ContainsKey("args")) { " $($c.args)" } else { "" }
      $lines += ('C:\GBBOOT /D /E{1} > C:\{0}.TXT' -f $c.label, $extraArgs)
    } else {
      $extraArgs = if ($c.ContainsKey("args")) { " $($c.args)" } else { "" }
      $lines += ('C:\GBBOOT /D{1} > C:\{0}.TXT' -f $c.label, $extraArgs)
    }
    $lines += "C:"
    $lines += "mount -u D"
  }
  $lines += "exit"

  $conf = Join-Path $run "_gbboot_$Name.conf"
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

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "DOSBox did not exit while running GBBOOT $Name smoke test"
  }
}

$detectBatchSize = 16
for ($i = 0; $i -lt $cases.Count; $i += $detectBatchSize) {
  $last = [Math]::Min($i + $detectBatchSize - 1, $cases.Count - 1)
  $batchName = "detect-{0:D2}" -f [int]($i / $detectBatchSize)
  Invoke-DryRunBatch $batchName $cases[$i..$last]
}

$engineBatchSize = 16
for ($i = 0; $i -lt $engineCases.Count; $i += $engineBatchSize) {
  $last = [Math]::Min($i + $engineBatchSize - 1, $engineCases.Count - 1)
  $batchName = "engine-detect-{0:D2}" -f [int]($i / $engineBatchSize)
  Invoke-DryRunBatch $batchName $engineCases[$i..$last] -Engine
}

$allOk = $true
foreach ($c in $cases) {
  $out = Join-Path $run "$($c.label).TXT"
  if (-not (Test-Path $out)) {
    Write-Output "[FAIL] $($c.label): no output file"
    $allOk = $false
    continue
  }
  $text = Get-Content $out -Raw
  $extraOk = -not $c.ContainsKey("extraExpect") -or $text -like "*$($c.extraExpect)*"
  if ($text -like "*$($c.expect)*" -and $text -like "*dry-run*" -and $extraOk) {
    Write-Output "[PASS] $($c.label): $($c.expect)"
  } else {
    Write-Output "[FAIL] $($c.label): expected '$($c.expect)'"
    if ($c.ContainsKey("extraExpect")) {
      Write-Output "[FAIL] $($c.label): expected extra '$($c.extraExpect)'"
    }
    Write-Output $text
    $allOk = $false
  }
}

foreach ($c in $engineCases) {
  $out = Join-Path $run "$($c.label).TXT"
  if (-not (Test-Path $out)) {
    Write-Output "[FAIL] $($c.label): no output file"
    $allOk = $false
    continue
  }
  $text = Get-Content $out -Raw
  $extraOk = -not $c.ContainsKey("extraExpect") -or $text -like "*$($c.extraExpect)*"
  if ($text -like "*$($c.expect)*" -and $text -like "*dry-run*" -and $extraOk) {
    Write-Output "[PASS] $($c.label): $($c.expect)"
  } else {
    Write-Output "[FAIL] $($c.label): expected '$($c.expect)'"
    if ($c.ContainsKey("extraExpect")) {
      Write-Output "[FAIL] $($c.label): expected extra '$($c.extraExpect)'"
    }
    Write-Output $text
    $allOk = $false
  }
}

$execLines = @(
  "@echo off",
  ('mount C "{0}"' -f $run),
  "C:"
)
foreach ($c in $execCases) {
  $execLines += ('mount D "{0}"' -f $c.dir)
  $execLines += "D:"
  $execLines += ('C:\GBBOOT > C:\{0}.TXT' -f $c.label)
  $execLines += "C:"
  $execLines += "mount -u D"
}
$execLines += "exit"

$execConf = Join-Path $run "_gbboot_exec.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
$($execLines -join "`r`n")
"@ | Set-Content -Path $execConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $execConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running GBBOOT EXEC smoke test"
}

foreach ($c in $execCases) {
  $bootOut = Join-Path $run "$($c.label).TXT"
  $childOut = Join-Path $c.outDir "GBEXEC.TXT"
  if (-not (Test-Path $bootOut)) {
    Write-Output "[FAIL] $($c.label): no GBBOOT output file"
    $allOk = $false
    continue
  }
  if (-not (Test-Path $childOut)) {
    Write-Output "[FAIL] $($c.label): child recorder did not run"
    $allOk = $false
    continue
  }
  $bootText = Get-Content $bootOut -Raw
  $childText = Get-Content $childOut -Raw
  $tailLine = ($childText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedTail = "TAIL=$($c.expectTail)"
  if ($bootText -like "*$($c.expectBoot)*" -and $bootText -like "*launching*" -and $tailLine -eq $expectedTail) {
    Write-Output "[PASS] $($c.label): EXEC child tail '$($c.expectTail)'"
  } else {
    Write-Output "[FAIL] $($c.label): expected boot '$($c.expectBoot)' and child tail '$expectedTail'"
    Write-Output $bootText
    Write-Output $childText
    $allOk = $false
  }
}

$introCokOut = Join-Path $run "XICOK.TXT"
$introDokOut = Join-Path $run "XIDOK.TXT"
$introCurseOut = Join-Path $run "XICUR.TXT"
$introPoolOut = Join-Path $run "XIPOL.TXT"
$introSecretOut = Join-Path $run "XISEC.TXT"
$introGatewayOut = Join-Path $run "XIGAT.TXT"
$introTreasuresOut = Join-Path $run "XITRE.TXT"
$introPodOut = Join-Path $run "XIPOD.TXT"
$introBuckOut = Join-Path $run "XIBUC.TXT"
$introMatrixOut = Join-Path $run "XIMAT.TXT"
$introNwnOut = Join-Path $run "XINWN.TXT"
$introCokChildOut = Join-Path $combatCokDir "GBEXEC.TXT"
$introDokChildOut = Join-Path $combatDokDir "GBEXEC.TXT"
$introCurseChildOut = Join-Path $curseNativeDir "GBEXEC.TXT"
$introPoolChildOut = Join-Path $combatPoolDir "GBEXEC.TXT"
$introSecretChildOut = Join-Path $combatSecretDir "GBEXEC.TXT"
$introGatewayChildOut = Join-Path $combatGatewayDir "GBEXEC.TXT"
$introTreasuresChildOut = Join-Path $combatTreasuresDir "GBEXEC.TXT"
$introPodChildOut = Join-Path $combatPodDir "GBEXEC.TXT"
$introBuckChildOut = Join-Path $combatBuckDir "GBEXEC.TXT"
$introMatrixChildOut = Join-Path $combatMatrixDir "GBEXEC.TXT"
$introNwnChildOut = Join-Path $nwnDir "GBEXEC.TXT"
$introMusic = Join-Path $run "COKTITLE.GBM"
if (Test-Path $introCokChildOut) { Remove-Item -Force $introCokChildOut }
if (Test-Path $introDokChildOut) { Remove-Item -Force $introDokChildOut }
if (Test-Path $introCurseChildOut) { Remove-Item -Force $introCurseChildOut }
if (Test-Path $introPoolChildOut) { Remove-Item -Force $introPoolChildOut }
if (Test-Path $introSecretChildOut) { Remove-Item -Force $introSecretChildOut }
if (Test-Path $introGatewayChildOut) { Remove-Item -Force $introGatewayChildOut }
if (Test-Path $introTreasuresChildOut) { Remove-Item -Force $introTreasuresChildOut }
if (Test-Path $introPodChildOut) { Remove-Item -Force $introPodChildOut }
if (Test-Path $introBuckChildOut) { Remove-Item -Force $introBuckChildOut }
if (Test-Path $introMatrixChildOut) { Remove-Item -Force $introMatrixChildOut }
if (Test-Path $introNwnChildOut) { Remove-Item -Force $introNwnChildOut }
Set-Content -Path $introMusic -Value "GBM1" -Encoding ASCII
$realCgb = Join-Path $run "CGB.REAL"
Copy-Item (Join-Path $run "CGB.COM") $realCgb -Force
Copy-Item $gbmarkf (Join-Path $run "CGB.COM") -Force
$introConf = Join-Path $run "_gbboot_intro_tail.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$combatCokDir"
D:
C:\GBBOOT /E > C:\XICOK.TXT
C:
mount -u D
mount D "$combatDokDir"
D:
C:\GBBOOT /E > C:\XIDOK.TXT
C:
mount -u D
mount D "$curseNativeDir"
D:
C:\GBBOOT /E > C:\XICUR.TXT
C:
mount -u D
mount D "$combatPoolDir"
D:
C:\GBBOOT /E > C:\XIPOL.TXT
C:
mount -u D
mount D "$combatSecretDir"
D:
C:\GBBOOT /E > C:\XISEC.TXT
C:
mount -u D
mount D "$combatGatewayDir"
D:
C:\GBBOOT /E > C:\XIGAT.TXT
C:
mount -u D
mount D "$combatTreasuresDir"
D:
C:\GBBOOT /E > C:\XITRE.TXT
C:
mount -u D
mount D "$combatPodDir"
D:
C:\GBBOOT /E > C:\XIPOD.TXT
C:
mount -u D
mount D "$combatBuckDir"
D:
C:\GBBOOT /E > C:\XIBUC.TXT
C:
mount -u D
mount D "$combatMatrixDir"
D:
C:\GBBOOT /E > C:\XIMAT.TXT
C:
mount -u D
mount D "$nwnDir"
D:
C:\GBBOOT /E > C:\XINWN.TXT
exit
"@ | Set-Content -Path $introConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $introConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  Copy-Item $realCgb (Join-Path $run "CGB.COM") -Force
  throw "DOSBox did not exit while running GBBOOT intro-tail smoke test"
}
Copy-Item $realCgb (Join-Path $run "CGB.COM") -Force

foreach ($introCase in @(
  @{ Label = "XICOK"; Child = $introCokChildOut; Expect = "TAIL= /A TITLE.DAX 0 /M C:\COKTITLE.GBM" },
  @{ Label = "XIDOK"; Child = $introDokChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XICUR"; Child = $introCurseChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XIPOL"; Child = $introPoolChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XISEC"; Child = $introSecretChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XIGAT"; Child = $introGatewayChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XITRE"; Child = $introTreasuresChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XIPOD"; Child = $introPodChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XIBUC"; Child = $introBuckChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XIMAT"; Child = $introMatrixChildOut; Expect = "TAIL= /A TITLE.DAX 0" },
  @{ Label = "XINWN"; Child = $introNwnChildOut; Expect = "TAIL= /A TITLE.DAX 0" }
)) {
  if (-not (Test-Path $introCase.Child)) {
    Write-Output "[FAIL] $($introCase.Label): title-frame recorder did not run"
    $allOk = $false
    continue
  }
  $introChildText = Get-Content $introCase.Child -Raw
  $introTailLine = ($introChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  if ($introTailLine -eq $introCase.Expect) {
    Write-Output "[PASS] $($introCase.Label): title-frame tail '$($introCase.Expect.Substring(5))'"
  } else {
    Write-Output "[FAIL] $($introCase.Label): expected title-frame tail '$($introCase.Expect)'"
    Write-Output $introChildText
    $allOk = $false
  }
}

$seedBootOut = Join-Path $run "XSEED.TXT"
$seedChildOut = Join-Path $combatCokDir "GBEXEC.TXT"
$seedSidecar = Join-Path $run "_GBSEED.BIN"
if (Test-Path $seedChildOut) { Remove-Item -Force $seedChildOut }
if (Test-Path $seedSidecar) { Remove-Item -Force $seedSidecar }
$realCcecl = Join-Path $run "CCECL.REAL"
Copy-Item (Join-Path $run "CCECL.COM") $realCcecl -Force
$realCcflow = Join-Path $run "CCFLOW.REAL"
Copy-Item (Join-Path $run "CCFLOW.COM") $realCcflow -Force
Copy-Item $gbmark (Join-Path $run "CCECL.COM") -Force
Copy-Item $gbmark (Join-Path $run "CCFLOW.COM") -Force
$seedConf = Join-Path $run "_gbboot_seed_tail.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$combatCokDir"
D:
C:\GBBOOT /E /X /I 30 /F 7 /U 2 12 /M 4 /M 10 /M 6 /K 20 /K 50 /K 56 /S 8 /S 22 /V 2 99 /P 2 /H 1 /Z 88 /L 77 /C 1 /Y 2 /O 2 /W 3 > C:\XSEED.TXT
exit
"@ | Set-Content -Path $seedConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $seedConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
  Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force
  throw "DOSBox did not exit while running GBBOOT CCECL seed-tail smoke test"
}
Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force

if (-not (Test-Path $seedChildOut)) {
  Write-Output "[FAIL] XSEED: CCECL recorder did not run"
  $allOk = $false
} else {
  $seedChildText = Get-Content $seedChildOut -Raw
  $seedTailLine = ($seedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedSeedTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /Z 88 /L 77 /C 1 /Y 2 /O 2 /W 3 /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($seedTailLine -eq $expectedSeedTail) {
    Write-Output "[PASS] XSEED: native CCECL seed tail"
  } else {
    Write-Output "[FAIL] XSEED: expected child tail '$expectedSeedTail'"
    if (Test-Path $seedBootOut) { Write-Output (Get-Content $seedBootOut -Raw) }
    Write-Output $seedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $seedSidecar -Label "XSEED" -Version 6 -Flags 3 -Count 2 -Ranger 1 `
  -Items @(30) -Affects @(7) -MemberAffects @(2, 12) `
  -Moves @(4, 10, 6) -Thieves @(20, 50, 56) -Spells @(8, 22) -MemberSpells @(99, 2)

$seedDistanceBootOut = Join-Path $run "XSEEDD.TXT"
$seedDistanceChildOut = Join-Path $combatCokDir "GBEXEC.TXT"
if (Test-Path $seedDistanceChildOut) { Remove-Item -Force $seedDistanceChildOut }
if (Test-Path $seedSidecar) { Remove-Item -Force $seedSidecar }
Copy-Item $gbmark (Join-Path $run "CCECL.COM") -Force
Copy-Item $gbmark (Join-Path $run "CCFLOW.COM") -Force
$seedDistanceConf = Join-Path $run "_gbboot_seed_distance_tail.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$combatCokDir"
D:
C:\GBBOOT /E /X /Q 7 > C:\XSEEDD.TXT
exit
"@ | Set-Content -Path $seedDistanceConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $seedDistanceConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
  Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force
  throw "DOSBox did not exit while running GBBOOT CCECL distance-seed tail smoke test"
}
Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force

if (-not (Test-Path $seedDistanceChildOut)) {
  Write-Output "[FAIL] XSEEDD: CCECL recorder did not run"
  $allOk = $false
} else {
  $seedDistanceChildText = Get-Content $seedDistanceChildOut -Raw
  $seedDistanceTailLine = ($seedDistanceChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedSeedDistanceTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($seedDistanceTailLine -eq $expectedSeedDistanceTail) {
    Write-Output "[PASS] XSEEDD: native CCECL encounter-distance seed tail"
  } else {
    Write-Output "[FAIL] XSEEDD: expected child tail '$expectedSeedDistanceTail'"
    if (Test-Path $seedDistanceBootOut) { Write-Output (Get-Content $seedDistanceBootOut -Raw) }
    Write-Output $seedDistanceChildText
    $allOk = $false
  }
}
# The empty CoK GBPR is still an authoritative zero-member roster, so its
# automatic count is present together with the explicitly seeded distance.
Assert-GbpsSidecar -Path $seedSidecar -Label "XSEEDD" -Version 6 -Flags 5 -Count 0 -Distance 7

$seedWhoBootOut = Join-Path $run "XSEEDW.TXT"
$seedWhoChildOut = Join-Path $combatCokDir "GBEXEC.TXT"
if (Test-Path $seedWhoChildOut) { Remove-Item -Force $seedWhoChildOut }
if (Test-Path $seedSidecar) { Remove-Item -Force $seedSidecar }
Copy-Item $gbmark (Join-Path $run "CCECL.COM") -Force
Copy-Item $gbmark (Join-Path $run "CCFLOW.COM") -Force
$seedWhoConf = Join-Path $run "_gbboot_seed_who_tail.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$combatCokDir"
D:
C:\GBBOOT /E /X /Z 88 /L 77 /C 1 /Y 2 /O 2 /W 3 > C:\XSEEDW.TXT
exit
"@ | Set-Content -Path $seedWhoConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $seedWhoConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
  Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force
  throw "DOSBox did not exit while running GBBOOT CCECL WHO-seed tail smoke test"
}
Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force

if (-not (Test-Path $seedWhoChildOut)) {
  Write-Output "[FAIL] XSEEDW: CCECL recorder did not run"
  $allOk = $false
} else {
  $seedWhoChildText = Get-Content $seedWhoChildOut -Raw
  $seedWhoTailLine = ($seedWhoChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedSeedWhoTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /Z 88 /L 77 /C 1 /Y 2 /O 2 /W 3 /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($seedWhoTailLine -eq $expectedSeedWhoTail) {
    Write-Output "[PASS] XSEEDW: native CCECL strength/input/menu/parlay/encounter/WHO seed tail"
  } else {
    Write-Output "[FAIL] XSEEDW: expected child tail '$expectedSeedWhoTail'"
    if (Test-Path $seedWhoBootOut) { Write-Output (Get-Content $seedWhoBootOut -Raw) }
    Write-Output $seedWhoChildText
    $allOk = $false
  }
}
# CoK always writes its inventory-backed v6 sidecar, including scalar-only
# requests, so CCECL receives one consistent seed transport.
Assert-GbpsSidecar -Path $seedSidecar -Label "XSEEDW" -Version 6 -Flags 1 -Count 0

$autoSeedBootOut = Join-Path $run "XSEEDAUTO.TXT"
$autoSeedChildOut = Join-Path $autoSeedDir "GBEXEC.TXT"
if (Test-Path $autoSeedChildOut) { Remove-Item -Force $autoSeedChildOut }
$autoSeedSidecar = Join-Path $run "XSEEDA.GBP"
if (Test-Path $autoSeedSidecar) { Remove-Item -Force $autoSeedSidecar }
$autoCokAffectBootOut = Join-Path $run "XCAFFECTAUTO.TXT"
$autoCokAffectChildOut = Join-Path $autoCokAffectDir "GBEXEC.TXT"
if (Test-Path $autoCokAffectChildOut) { Remove-Item -Force $autoCokAffectChildOut }
$autoCokAffectSidecar = Join-Path $run "XCAUTO.GBP"
if (Test-Path $autoCokAffectSidecar) { Remove-Item -Force $autoCokAffectSidecar }
$autoAffectBootOut = Join-Path $run "XAFFECTAUTO.TXT"
$autoAffectChildOut = Join-Path $autoAffectDir "GBEXEC.TXT"
if (Test-Path $autoAffectChildOut) { Remove-Item -Force $autoAffectChildOut }
$autoAffectSidecar = Join-Path $run "XAUTO.GBP"
if (Test-Path $autoAffectSidecar) { Remove-Item -Force $autoAffectSidecar }
$autoCokCloudAffectBootOut = Join-Path $run "XCCAUTO.TXT"
$autoCokCloudAffectChildOut = Join-Path $autoCokCloudAffectDir "GBEXEC.TXT"
if (Test-Path $autoCokCloudAffectChildOut) { Remove-Item -Force $autoCokCloudAffectChildOut }
$autoCokCloudAffectSidecar = Join-Path $run "XCCAUTO.GBP"
if (Test-Path $autoCokCloudAffectSidecar) { Remove-Item -Force $autoCokCloudAffectSidecar }
$autoDokCloudAffectBootOut = Join-Path $run "XDCAUTO.TXT"
$autoDokCloudAffectChildOut = Join-Path $autoDokCloudAffectDir "GBEXEC.TXT"
if (Test-Path $autoDokCloudAffectChildOut) { Remove-Item -Force $autoDokCloudAffectChildOut }
$autoDokCloudAffectSidecar = Join-Path $run "XDCAUTO.GBP"
if (Test-Path $autoDokCloudAffectSidecar) { Remove-Item -Force $autoDokCloudAffectSidecar }
$autoDokCloudSlotBBootOut = Join-Path $run "XDBAUTO.TXT"
$autoDokCloudSlotBChildOut = Join-Path $autoDokCloudSlotBDir "GBEXEC.TXT"
if (Test-Path $autoDokCloudSlotBChildOut) { Remove-Item -Force $autoDokCloudSlotBChildOut }
$autoDokCloudSlotBSidecar = Join-Path $run "XDBAUTO.GBP"
if (Test-Path $autoDokCloudSlotBSidecar) { Remove-Item -Force $autoDokCloudSlotBSidecar }
$autoDokCloudSlotCBootOut = Join-Path $run "XDCAUTC.TXT"
$autoDokCloudSlotCChildOut = Join-Path $autoDokCloudSlotCDir "GBEXEC.TXT"
if (Test-Path $autoDokCloudSlotCChildOut) { Remove-Item -Force $autoDokCloudSlotCChildOut }
$autoDokCloudSlotCSidecar = Join-Path $run "XDCAUTC.GBP"
if (Test-Path $autoDokCloudSlotCSidecar) { Remove-Item -Force $autoDokCloudSlotCSidecar }
$autoDqkSeedBootOut = Join-Path $run "XDQKSEED.TXT"
$autoDqkSeedChildOut = Join-Path $autoDqkSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkSeedChildOut) { Remove-Item -Force $autoDqkSeedChildOut }
$autoDqkSeedSidecar = Join-Path $run "XDQKA.GBP"
if (Test-Path $autoDqkSeedSidecar) { Remove-Item -Force $autoDqkSeedSidecar }
$autoDqkSaveQchSeedBootOut = Join-Path $run "XDQKQ8.TXT"
$autoDqkSaveQchSeedChildOut = Join-Path $autoDqkSaveQchSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkSaveQchSeedChildOut) { Remove-Item -Force $autoDqkSaveQchSeedChildOut }
$autoDqkSaveQchSeedSidecar = Join-Path $run "XDQKQ8.GBP"
if (Test-Path $autoDqkSaveQchSeedSidecar) { Remove-Item -Force $autoDqkSaveQchSeedSidecar }
$autoDqkCloudSeedBootOut = Join-Path $run "XDQKCLD.TXT"
$autoDqkCloudSeedChildOut = Join-Path $autoDqkCloudSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkCloudSeedChildOut) { Remove-Item -Force $autoDqkCloudSeedChildOut }
$autoDqkCloudSeedSidecar = Join-Path $run "XDQKC.GBP"
if (Test-Path $autoDqkCloudSeedSidecar) { Remove-Item -Force $autoDqkCloudSeedSidecar }
$autoDqkCloudSlotSeedBootOut = Join-Path $run "XDQKCLB.TXT"
$autoDqkCloudSlotSeedChildOut = Join-Path $autoDqkCloudSlotSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkCloudSlotSeedChildOut) { Remove-Item -Force $autoDqkCloudSlotSeedChildOut }
$autoDqkCloudSlotSeedSidecar = Join-Path $run "XDQKB.GBP"
if (Test-Path $autoDqkCloudSlotSeedSidecar) { Remove-Item -Force $autoDqkCloudSlotSeedSidecar }
$autoDqkCloudSavgameSeedBootOut = Join-Path $run "XDQKCLS.TXT"
$autoDqkCloudSavgameSeedChildOut = Join-Path $autoDqkCloudSavgameSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkCloudSavgameSeedChildOut) { Remove-Item -Force $autoDqkCloudSavgameSeedChildOut }
$autoDqkCloudSavgameSeedSidecar = Join-Path $run "XDQKS.GBP"
if (Test-Path $autoDqkCloudSavgameSeedSidecar) { Remove-Item -Force $autoDqkCloudSavgameSeedSidecar }
$autoDqkCloudQchBSeedBootOut = Join-Path $run "XDQKQB.TXT"
$autoDqkCloudQchBSeedChildOut = Join-Path $autoDqkCloudQchBSeedDir "GBEXEC.TXT"
if (Test-Path $autoDqkCloudQchBSeedChildOut) { Remove-Item -Force $autoDqkCloudQchBSeedChildOut }
$autoDqkCloudQchBSeedSidecar = Join-Path $run "XDQKQB.GBP"
if (Test-Path $autoDqkCloudQchBSeedSidecar) { Remove-Item -Force $autoDqkCloudQchBSeedSidecar }
if (Test-Path $seedSidecar) { Remove-Item -Force $seedSidecar }
Copy-Item $gbmark (Join-Path $run "CCECL.COM") -Force
Copy-Item $gbmark (Join-Path $run "CCFLOW.COM") -Force
$autoSeedConf = Join-Path $run "_gbboot_auto_seed_tail.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$autoSeedDir"
mount E "$autoAffectDir"
mount F "$autoCokAffectDir"
mount G "$autoDqkSeedDir"
mount H "$autoDqkCloudSeedDir"
mount I "$autoCokCloudAffectDir"
mount J "$autoDokCloudAffectDir"
mount K "$autoDokCloudSlotBDir"
mount L "$autoDqkCloudSlotSeedDir"
mount M "$autoDqkCloudSavgameSeedDir"
mount N "$autoDqkCloudQchBSeedDir"
mount O "$autoDqkSaveQchSeedDir"
mount P "$autoDokCloudSlotCDir"
D:
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XSEEDAUTO.TXT
copy C:\_GBSEED.BIN C:\XSEEDA.GBP > NUL
E:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XAFFECTAUTO.TXT
copy C:\_GBSEED.BIN C:\XAUTO.GBP > NUL
F:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XCAFFECTAUTO.TXT
copy C:\_GBSEED.BIN C:\XCAUTO.GBP > NUL
G:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKSEED.TXT
copy C:\_GBSEED.BIN C:\XDQKA.GBP > NUL
O:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKQ8.TXT
copy C:\_GBSEED.BIN C:\XDQKQ8.GBP > NUL
H:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKCLD.TXT
copy C:\_GBSEED.BIN C:\XDQKC.GBP > NUL
L:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKCLB.TXT
copy C:\_GBSEED.BIN C:\XDQKB.GBP > NUL
M:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKCLS.TXT
copy C:\_GBSEED.BIN C:\XDQKS.GBP > NUL
N:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDQKQB.TXT
copy C:\_GBSEED.BIN C:\XDQKQB.GBP > NUL
I:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XCCAUTO.TXT
copy C:\_GBSEED.BIN C:\XCCAUTO.GBP > NUL
J:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDCAUTO.TXT
copy C:\_GBSEED.BIN C:\XDCAUTO.GBP > NUL
K:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDBAUTO.TXT
copy C:\_GBSEED.BIN C:\XDBAUTO.GBP > NUL
P:
del C:\_GBPARTY.GBP > NUL
del C:\_GBSEED.BIN > NUL
C:\GBBOOT /E /X > C:\XDCAUTC.TXT
copy C:\_GBSEED.BIN C:\XDCAUTC.GBP > NUL
exit
"@ | Set-Content -Path $autoSeedConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $autoSeedConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
  Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force
  throw "DOSBox did not exit while running GBBOOT automatic CCECL party-count/affect smoke test"
}
Copy-Item $realCcecl (Join-Path $run "CCECL.COM") -Force
Copy-Item $realCcflow (Join-Path $run "CCFLOW.COM") -Force

if (-not (Test-Path $autoSeedChildOut)) {
  Write-Output "[FAIL] XSEEDAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoSeedChildText = Get-Content $autoSeedChildOut -Raw
  $autoSeedTailLine = ($autoSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoSeedTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($autoSeedTailLine -eq $expectedAutoSeedTail) {
    Write-Output "[PASS] XSEEDAUTO: native CCECL automatic party-count tail"
  } else {
    Write-Output "[FAIL] XSEEDAUTO: expected child tail '$expectedAutoSeedTail'"
    if (Test-Path $autoSeedBootOut) { Write-Output (Get-Content $autoSeedBootOut -Raw) }
    Write-Output $autoSeedChildText
    $allOk = $false
  }
}
# The automatic fixture has an empty GBPR, which is an explicit zero-member
# CoK roster rather than the old synthetic three-member fallback.
Assert-GbpsSidecar -Path $autoSeedSidecar -Label "XSEEDAUTO" -Version 6 -Flags 1 -Count 0

if (-not (Test-Path $autoDqkSeedChildOut)) {
  Write-Output "[FAIL] XDQKSEED: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkSeedChildText = Get-Content $autoDqkSeedChildOut -Raw
  $autoDqkSeedTailLine = ($autoDqkSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 80 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkSeedTailLine -eq $expectedAutoDqkSeedTail) {
    Write-Output "[PASS] XDQKSEED: native DQK QSV automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKSEED: expected child tail '$expectedAutoDqkSeedTail'"
    if (Test-Path $autoDqkSeedBootOut) { Write-Output (Get-Content $autoDqkSeedBootOut -Raw) }
    Write-Output $autoDqkSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkSeedSidecar -Label "XDQKSEED" -Flags 1 -Count 2

if (-not (Test-Path $autoDqkSaveQchSeedChildOut)) {
  Write-Output "[FAIL] XDQKQ8: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkSaveQchSeedChildText = Get-Content $autoDqkSaveQchSeedChildOut -Raw
  $autoDqkSaveQchSeedTailLine = ($autoDqkSaveQchSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkSaveQchSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 320 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkSaveQchSeedTailLine -eq $expectedAutoDqkSaveQchSeedTail) {
    Write-Output "[PASS] XDQKQ8: native DQK SAVE CHRDATA QCH automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKQ8: expected child tail '$expectedAutoDqkSaveQchSeedTail'"
    if (Test-Path $autoDqkSaveQchSeedBootOut) { Write-Output (Get-Content $autoDqkSaveQchSeedBootOut -Raw) }
    Write-Output $autoDqkSaveQchSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkSaveQchSeedSidecar -Label "XDQKQ8" -Flags 1 -Count 8

if (-not (Test-Path $autoDqkCloudSeedChildOut)) {
  Write-Output "[FAIL] XDQKCLD: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkCloudSeedChildText = Get-Content $autoDqkCloudSeedChildOut -Raw
  $autoDqkCloudSeedTailLine = ($autoDqkCloudSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkCloudSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 200 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkCloudSeedTailLine -eq $expectedAutoDqkCloudSeedTail) {
    Write-Output "[PASS] XDQKCLD: native DQK cloud_saves automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKCLD: expected child tail '$expectedAutoDqkCloudSeedTail'"
    if (Test-Path $autoDqkCloudSeedBootOut) { Write-Output (Get-Content $autoDqkCloudSeedBootOut -Raw) }
    Write-Output $autoDqkCloudSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkCloudSeedSidecar -Label "XDQKCLD" -Flags 1 -Count 5

if (-not (Test-Path $autoDqkCloudSlotSeedChildOut)) {
  Write-Output "[FAIL] XDQKCLB: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkCloudSlotSeedChildText = Get-Content $autoDqkCloudSlotSeedChildOut -Raw
  $autoDqkCloudSlotSeedTailLine = ($autoDqkCloudSlotSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkCloudSlotSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 240 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkCloudSlotSeedTailLine -eq $expectedAutoDqkCloudSlotSeedTail) {
    Write-Output "[PASS] XDQKCLB: native DQK cloud_saves SAVGAMB.QSV automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKCLB: expected child tail '$expectedAutoDqkCloudSlotSeedTail'"
    if (Test-Path $autoDqkCloudSlotSeedBootOut) { Write-Output (Get-Content $autoDqkCloudSlotSeedBootOut -Raw) }
    Write-Output $autoDqkCloudSlotSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkCloudSlotSeedSidecar -Label "XDQKCLB" -Flags 1 -Count 6

if (-not (Test-Path $autoDqkCloudSavgameSeedChildOut)) {
  Write-Output "[FAIL] XDQKCLS: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkCloudSavgameSeedChildText = Get-Content $autoDqkCloudSavgameSeedChildOut -Raw
  $autoDqkCloudSavgameSeedTailLine = ($autoDqkCloudSavgameSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkCloudSavgameSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 280 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkCloudSavgameSeedTailLine -eq $expectedAutoDqkCloudSavgameSeedTail) {
    Write-Output "[PASS] XDQKCLS: native DQK cloud_saves SAVGAME.QSV automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKCLS: expected child tail '$expectedAutoDqkCloudSavgameSeedTail'"
    if (Test-Path $autoDqkCloudSavgameSeedBootOut) { Write-Output (Get-Content $autoDqkCloudSavgameSeedBootOut -Raw) }
    Write-Output $autoDqkCloudSavgameSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkCloudSavgameSeedSidecar -Label "XDQKCLS" -Flags 1 -Count 7

if (-not (Test-Path $autoDqkCloudQchBSeedChildOut)) {
  Write-Output "[FAIL] XDQKQB: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDqkCloudQchBSeedChildText = Get-Content $autoDqkCloudQchBSeedChildOut -Raw
  $autoDqkCloudQchBSeedTailLine = ($autoDqkCloudQchBSeedChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDqkCloudQchBSeedTail = "TAIL= ECL.GLB 1 /G C:\_GBSEED.BIN /Z 320 /B C:\_GBPARTY.GBP /ID 3 /E C:\_GBECL.BIN"
  if ($autoDqkCloudQchBSeedTailLine -eq $expectedAutoDqkCloudQchBSeedTail) {
    Write-Output "[PASS] XDQKQB: native DQK cloud_saves CHRDATB QCH automatic party-count tail"
  } else {
    Write-Output "[FAIL] XDQKQB: expected child tail '$expectedAutoDqkCloudQchBSeedTail'"
    if (Test-Path $autoDqkCloudQchBSeedBootOut) { Write-Output (Get-Content $autoDqkCloudQchBSeedBootOut -Raw) }
    Write-Output $autoDqkCloudQchBSeedChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDqkCloudQchBSeedSidecar -Label "XDQKQB" -Flags 1 -Count 8

if (-not (Test-Path $autoCokAffectChildOut)) {
  Write-Output "[FAIL] XCAFFAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoCokAffectChildText = Get-Content $autoCokAffectChildOut -Raw
  $autoCokAffectTailLine = ($autoCokAffectChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoCokAffectTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($autoCokAffectTailLine -eq $expectedAutoCokAffectTail) {
    Write-Output "[PASS] XCAFFAUTO: native CCECL automatic CoK item/affect/count tail"
  } else {
    Write-Output "[FAIL] XCAFFAUTO: expected child tail '$expectedAutoCokAffectTail'"
    if (Test-Path $autoCokAffectBootOut) { Write-Output (Get-Content $autoCokAffectBootOut -Raw) }
    Write-Output $autoCokAffectChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoCokAffectSidecar -Label "XCAFFAUTO" -Version 6 -Flags 1 -Count 2 `
  -Items @(36, 37, 18) -OwnedEffects @(1, 18, 1, 92, 2, 18, 2, 95) `
  -Moves @(2, 4) -ThiefMatrix @(10, 11, 12, 13, 14, 15, 16, 17, 30, 31, 32, 33, 34, 35, 36, 37)

if (-not (Test-Path $autoAffectChildOut)) {
  Write-Output "[FAIL] XAFFAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoAffectChildText = Get-Content $autoAffectChildOut -Raw
  $autoAffectTailLine = ($autoAffectChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoAffectTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 2 /E C:\_GBECL.BIN"
  if ($autoAffectTailLine -eq $expectedAutoAffectTail) {
    Write-Output "[PASS] XAFFAUTO: native CCECL automatic item/affect/spell/count tail"
  } else {
    Write-Output "[FAIL] XAFFAUTO: expected child tail '$expectedAutoAffectTail'"
    if (Test-Path $autoAffectBootOut) { Write-Output (Get-Content $autoAffectBootOut -Raw) }
    Write-Output $autoAffectChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoAffectSidecar -Label "XAFFAUTO" -Flags 1 -Count 1 `
  -Items @(37, 36) -Affects @(18, 45) -MemberAffects @(1, 18, 1, 45) `
  -Moves @(2) -Spells @(8, 22) -MemberSpells @(8, 1, 22, 1)

if (-not (Test-Path $autoCokCloudAffectChildOut)) {
  Write-Output "[FAIL] XCCAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoCokCloudAffectChildText = Get-Content $autoCokCloudAffectChildOut -Raw
  $autoCokCloudAffectTailLine = ($autoCokCloudAffectChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoCokCloudAffectTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 1 /E C:\_GBECL.BIN"
  if ($autoCokCloudAffectTailLine -eq $expectedAutoCokCloudAffectTail) {
    Write-Output "[PASS] XCCAUTO: native CCECL automatic CoK cloud_saves item/affect/count tail"
  } else {
    Write-Output "[FAIL] XCCAUTO: expected child tail '$expectedAutoCokCloudAffectTail'"
    if (Test-Path $autoCokCloudAffectBootOut) { Write-Output (Get-Content $autoCokCloudAffectBootOut -Raw) }
    Write-Output $autoCokCloudAffectChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoCokCloudAffectSidecar -Label "XCCAUTO" -Version 6 -Flags 1 -Count 0 `
  -Items @(44, 45, 46) `
  -Moves @(4, 4)
# This cloud-only fixture has no CoK members in GBPR (CCPARTY does not import
# these placeholder cloud SAVs). Its loose SFX files must not grant effects
# to an absent party. The creation flow separately tests cloud SFX fallback
# for actual roster members.

if (-not (Test-Path $autoDokCloudAffectChildOut)) {
  Write-Output "[FAIL] XDCAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDokCloudAffectChildText = Get-Content $autoDokCloudAffectChildOut -Raw
  $autoDokCloudAffectTailLine = ($autoDokCloudAffectChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDokCloudAffectTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 2 /E C:\_GBECL.BIN"
  if ($autoDokCloudAffectTailLine -eq $expectedAutoDokCloudAffectTail) {
    Write-Output "[PASS] XDCAUTO: native CCECL automatic DoK cloud_saves item/affect/spell/count tail"
  } else {
    Write-Output "[FAIL] XDCAUTO: expected child tail '$expectedAutoDokCloudAffectTail'"
    if (Test-Path $autoDokCloudAffectBootOut) { Write-Output (Get-Content $autoDokCloudAffectBootOut -Raw) }
    Write-Output $autoDokCloudAffectChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDokCloudAffectSidecar -Label "XDCAUTO" -Flags 1 -Count 1 `
  -Items @(41, 42) -Affects @(42) -MemberAffects @(1, 42) `
  -Moves @(4) -Spells @(14, 15) -MemberSpells @(14, 1, 15, 1)

if (-not (Test-Path $autoDokCloudSlotBChildOut)) {
  Write-Output "[FAIL] XDBAUTO: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDokCloudSlotBChildText = Get-Content $autoDokCloudSlotBChildOut -Raw
  $autoDokCloudSlotBTailLine = ($autoDokCloudSlotBChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDokCloudSlotBTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 2 /E C:\_GBECL.BIN"
  if ($autoDokCloudSlotBTailLine -eq $expectedAutoDokCloudSlotBTail) {
    Write-Output "[PASS] XDBAUTO: native CCECL automatic DoK CHRDATB cloud_saves item/affect/spell/count tail"
  } else {
    Write-Output "[FAIL] XDBAUTO: expected child tail '$expectedAutoDokCloudSlotBTail'"
    if (Test-Path $autoDokCloudSlotBBootOut) { Write-Output (Get-Content $autoDokCloudSlotBBootOut -Raw) }
    Write-Output $autoDokCloudSlotBChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDokCloudSlotBSidecar -Label "XDBAUTO" -Flags 1 -Count 8 `
  -Items @(47) -Affects @(52) -MemberAffects @(7, 52) `
  -Moves @(4) -Spells @(16, 17) -MemberSpells @(16, 7, 17, 7)

if (-not (Test-Path $autoDokCloudSlotCChildOut)) {
  Write-Output "[FAIL] XDCAUTC: CCECL recorder did not run"
  $allOk = $false
} else {
  $autoDokCloudSlotCChildText = Get-Content $autoDokCloudSlotCChildOut -Raw
  $autoDokCloudSlotCTailLine = ($autoDokCloudSlotCChildText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
  $expectedAutoDokCloudSlotCTail = "TAIL= ECL1.DAX 34 /G C:\_GBSEED.BIN /B C:\_GBPARTY.GBP /ID 2 /E C:\_GBECL.BIN"
  if ($autoDokCloudSlotCTailLine -eq $expectedAutoDokCloudSlotCTail) {
    Write-Output "[PASS] XDCAUTC: native CCECL automatic DoK CHRDATC cloud_saves item/affect/spell/count tail"
  } else {
    Write-Output "[FAIL] XDCAUTC: expected child tail '$expectedAutoDokCloudSlotCTail'"
    if (Test-Path $autoDokCloudSlotCBootOut) { Write-Output (Get-Content $autoDokCloudSlotCBootOut -Raw) }
    Write-Output $autoDokCloudSlotCChildText
    $allOk = $false
  }
}
Assert-GbpsSidecar -Path $autoDokCloudSlotCSidecar -Label "XDCAUTC" -Flags 1 -Count 6 `
  -Items @(48) -Affects @(53) -MemberAffects @(6, 53) `
  -Moves @(4) -Spells @(18, 19) -MemberSpells @(18, 6, 19, 6)

$noExecConf = Join-Path $run "_gbboot_noexec.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$cokDataDir"
D:
C:\GBBOOT > C:\XCOKD.TXT
C:
mount -u D
mount D "$curseDataDir"
D:
C:\GBBOOT > C:\XCURSED.TXT
C:
mount -u D
mount D "$gen1DataDir"
D:
C:\GBBOOT > C:\XGENDD.TXT
C:
mount -u D
mount D "$poolDataEclDir"
D:
C:\GBBOOT > C:\XDPOLE.TXT
C:
mount -u D
mount D "$gameRootPoolDataDir"
D:
C:\GBBOOT > C:\XGDPOL.TXT
C:
mount -u D
mount D "$gameRootMatrixDataEclDir"
D:
C:\GBBOOT > C:\XGDMTE.TXT
C:
mount -u D
mount D "$secretNestedDataEclDir"
D:
C:\GBBOOT > C:\XNDSEC.TXT
C:
mount -u D
mount D "$gameRootDokDataDir"
D:
C:\GBBOOT > C:\XGDOKD.TXT
C:
mount -u D
mount D "$dqkDataDir"
D:
C:\GBBOOT > C:\XDQKD.TXT
C:
mount -u D
mount D "$dqkDiskDataDir"
D:
C:\GBBOOT > C:\XDQKDD.TXT
C:
mount -u D
mount D "$hlibGeoDataDir"
D:
C:\GBBOOT > C:\XHLIBD.TXT
exit
"@ | Set-Content -Path $noExecConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $noExecConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running GBBOOT native-only noexec smoke test"
}
$cokDataNoExecOut = Join-Path $run "XCOKD.TXT"
if (-not (Test-Path $cokDataNoExecOut)) {
  Write-Output "[FAIL] XCOKD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $cokDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XCOKD: CoK data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XCOKD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$noExecOut = Join-Path $run "XCURSED.TXT"
if (-not (Test-Path $noExecOut)) {
  Write-Output "[FAIL] XCURSED: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $noExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XCURSED: native-only data profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XCURSED: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$gen1NoExecOut = Join-Path $run "XGENDD.TXT"
if (-not (Test-Path $gen1NoExecOut)) {
  Write-Output "[FAIL] XGENDD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $gen1NoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XGENDD: generic data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XGENDD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$poolDataEclNoExecOut = Join-Path $run "XDPOLE.TXT"
if (-not (Test-Path $poolDataEclNoExecOut)) {
  Write-Output "[FAIL] XDPOLE: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $poolDataEclNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XDPOLE: Pool ECL data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XDPOLE: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$gameRootPoolDataNoExecOut = Join-Path $run "XGDPOL.TXT"
if (-not (Test-Path $gameRootPoolDataNoExecOut)) {
  Write-Output "[FAIL] XGDPOL: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $gameRootPoolDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XGDPOL: direct GAME data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XGDPOL: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$gameRootMatrixDataEclNoExecOut = Join-Path $run "XGDMTE.TXT"
if (-not (Test-Path $gameRootMatrixDataEclNoExecOut)) {
  Write-Output "[FAIL] XGDMTE: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $gameRootMatrixDataEclNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XGDMTE: direct GAME Matrix ECL data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XGDMTE: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$secretNestedDataEclNoExecOut = Join-Path $run "XNDSEC.TXT"
if (-not (Test-Path $secretNestedDataEclNoExecOut)) {
  Write-Output "[FAIL] XNDSEC: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $secretNestedDataEclNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XNDSEC: nested Secret ECL data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XNDSEC: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$gameRootDokDataNoExecOut = Join-Path $run "XGDOKD.TXT"
if (-not (Test-Path $gameRootDokDataNoExecOut)) {
  Write-Output "[FAIL] XGDOKD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $gameRootDokDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XGDOKD: direct GAME DoK data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XGDOKD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$dqkDataNoExecOut = Join-Path $run "XDQKD.TXT"
if (-not (Test-Path $dqkDataNoExecOut)) {
  Write-Output "[FAIL] XDQKD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $dqkDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XDQKD: DQK data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XDQKD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$dqkDiskDataNoExecOut = Join-Path $run "XDQKDD.TXT"
if (-not (Test-Path $dqkDiskDataNoExecOut)) {
  Write-Output "[FAIL] XDQKDD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $dqkDiskDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XDQKDD: DQK disk data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XDQKDD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$hlibDataNoExecOut = Join-Path $run "XHLIBD.TXT"
if (-not (Test-Path $hlibDataNoExecOut)) {
  Write-Output "[FAIL] XHLIBD: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $hlibDataNoExecOut -Raw
  if ($text -like "*exec:   (native /E only)*" -and $text -like "*no original executable is present*") {
    Write-Output "[PASS] XHLIBD: HLIB GEO data-only profile refuses plain chainload"
  } else {
    Write-Output "[FAIL] XHLIBD: expected native-only no-exec message"
    Write-Output $text
    $allOk = $false
  }
}

$nativeUnavailableConf = Join-Path $run "_gbboot_native_unavailable.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$poolGeoDir"
D:
C:\GBBOOT /E /B 34 > C:\XNBECL.TXT
exit
"@ | Set-Content -Path $nativeUnavailableConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $nativeUnavailableConf -Headless:$useHeadless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running GBBOOT unavailable native /B smoke test"
}

$nativeUnavailableOut = Join-Path $run "XNBECL.TXT"
if (-not (Test-Path $nativeUnavailableOut)) {
  Write-Output "[FAIL] XNBECL: no GBBOOT output file"
  $allOk = $false
} else {
  $text = Get-Content $nativeUnavailableOut -Raw
  if ($text -like "*unavailable: requested native ECL entry/archive is not present*" -and
      $text -like "*native preview unavailable: not launching helper chain*" -and
      $text -like "*native preview failed*" -and
      $text -notlike "*launching...*") {
    Write-Output "[PASS] XNBECL: unavailable native /B does not claim helper launch"
  } else {
    Write-Output "[FAIL] XNBECL: expected unavailable native /B no-launch diagnostic"
    Write-Output $text
    $allOk = $false
  }
}

if (-not $allOk) { exit 1 }
Write-Output "RESULT: GBBOOT dry-run detection PASS"
Write-Output "RESULT: GBBOOT EXEC chainload PASS"

if ($EngineSmoke) {
  $cokDir = Join-Path $root "Champions of Krynn"
  $cokMount = New-RetailStage -Source $cokDir
  $amigaCandidates = if ($CokAmigaPath) { @($CokAmigaPath) } else {
    @(
      (Join-Path $root "amiga_extracted\ChampionsOfKrynn\disk2"),
      'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\ChampionsOfKrynn\data'
    )
  }
  $amigaTilesDir = $null
  foreach ($candidate in $amigaCandidates) {
    $missing = @('8X8D1.DAA', 'CPIC1.DAA', 'BIGPIC1.DAA') | Where-Object {
      -not (Test-Path -LiteralPath (Join-Path $candidate $_) -PathType Leaf)
    }
    if (-not $missing) {
      $amigaTilesDir = (Resolve-Path -LiteralPath $candidate).Path
      break
    }
  }
  if (-not $amigaTilesDir) {
    throw 'GBBOOT EngineSmoke requires CoK Amiga 8X8D1.DAA, CPIC1.DAA and BIGPIC1.DAA; supply their directory with -CokAmigaPath'
  }
  Write-Output "CoK Amiga smoke source (staged read-only): $amigaTilesDir"
  $cokAmigaDir = Join-Path $fixtures "cok-amiga-engine"
  New-Item -ItemType Directory -Force $cokAmigaDir | Out-Null
  foreach ($name in @("START.EXE", "KRYNN.CFG", "ECL1.DAX", "GEO1.DAX", "WALLDEF1.DAX", "8X8D1.DAX")) {
    Copy-Item (Join-Path $cokDir $name) (Join-Path $cokAmigaDir $name) -Force
  }
  Copy-Item (Join-Path $amigaTilesDir "8X8D1.DAA") (Join-Path $cokAmigaDir "8X8D1.DAA") -Force
  Copy-Item (Join-Path $amigaTilesDir "CPIC1.DAA") (Join-Path $cokAmigaDir "CPIC1.DAA") -Force
  Copy-Item (Join-Path $amigaTilesDir "BIGPIC1.DAA") (Join-Path $cokAmigaDir "BIGPIC1.DAA") -Force
  $cokAmigaSceneDir = Join-Path $fixtures "cok-amiga-scene-engine"
  Copy-Item $cokAmigaDir $cokAmigaSceneDir -Recurse -Force
  $sceneEcl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$sceneEcl.Add([byte]0) }
  $sceneEcl.AddRange([byte[]]@(
    0x0E,0x00,0x72,
    0x21,0x00,0x22,0x00,0x02,0x00,0xFF,
    0x00
  ))
  Write-SyntheticDaxBlocks (Join-Path $cokAmigaSceneDir "ECL1.DAX") @(@{ Id = 34; Raw = $sceneEcl.ToArray() })
  # Different held releases must not reuse a mirror bound to another source.
  $amigaSourceHasher = [Security.Cryptography.SHA256]::Create()
  try {
    $amigaSourceHash = [BitConverter]::ToString($amigaSourceHasher.ComputeHash(
      [Text.Encoding]::UTF8.GetBytes($amigaTilesDir.TrimEnd('\').ToLowerInvariant())
    )).Replace('-', '').Substring(0, 16)
  } finally { $amigaSourceHasher.Dispose() }
  $amigaTilesMount = New-RetailStage -Source $amigaTilesDir -Name "gbboot-cok-amiga-$amigaSourceHash"
  $daaRaw = Join-Path $run "DAA203.RAW"
  $daaConf = Join-Path $run "_ccdaa_named_output_smoke.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$amigaTilesMount"
D:
C:\CCDAA 8X8D1.DAA 2 /D C:\DAA203.RAW
C:\CCDAA 8X8D1.DAA 2 /T C:\DAA203.GBT
C:\CCDAA 8X8D1.DAA 1 /T C:\DAA202.GBT
C:\CCDAA CPIC1.DAA /B 5 /I C:\CPIC005.GBI
C:\CCDAA CPIC1.DAA /B 2 /I C:\CPIC002.GBI
C:\CCDAA BIGPIC1.DAA /B 114 /I C:\BIG114.GBI
exit
"@ | Set-Content -Path $daaConf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $daaConf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "CCDAA named-output smoke failed: DOSBox did not exit"
  }
  [byte[]]$daaBytes = [IO.File]::ReadAllBytes($daaRaw)
  if ($daaBytes.Length -ne (4 + (45 * 8 * 8) + 768) -or (Get-U16LE $daaBytes 0) -ne 360 -or (Get-U16LE $daaBytes 2) -ne 8) {
    throw "CCDAA named-output smoke failed: invalid block-203 strip"
  }
  $gbtsPath = Join-Path $run "DAA203.GBT"
  [byte[]]$gbts = [IO.File]::ReadAllBytes($gbtsPath)
  if ($gbts.Length -ne (12 + (45 * 64) + 768) -or [Text.Encoding]::ASCII.GetString($gbts, 0, 4) -ne "GBTS" -or (Get-U16LE $gbts 4) -ne 1 -or $gbts[6] -ne 203 -or $gbts[7] -ne 1 -or (Get-U16LE $gbts 8) -ne 45 -or (Get-U16LE $gbts 10) -ne 360) {
    throw "CCDAA GBTS smoke failed: invalid header or length"
  }
  for ($i = 0; $i -lt (45 * 64); $i++) {
    if ($daaBytes[4 + $i] -ne $gbts[12 + $i]) {
      throw "CCDAA GBTS smoke failed: row-major pixel mismatch at offset $i"
    }
  }
  Write-Output "RESULT: CCDAA named RAW and row-major GBTS bridge PASS"
  $gbts202Path = Join-Path $run "DAA202.GBT"
  [byte[]]$gbts202 = [IO.File]::ReadAllBytes($gbts202Path)
  if ($gbts202.Length -ne (12 + (38 * 64) + 768) -or [Text.Encoding]::ASCII.GetString($gbts202, 0, 4) -ne "GBTS" -or $gbts202[6] -ne 202 -or $gbts202[7] -ne 1 -or (Get-U16LE $gbts202 8) -ne 38 -or (Get-U16LE $gbts202 10) -ne 304) {
    throw "CCDAA GBTS block-202 smoke failed: invalid header or length"
  }
  Write-Output "RESULT: CCDAA second logical GBTS resource PASS"
  $gbimPath = Join-Path $run "CPIC005.GBI"
  [byte[]]$gbim = [IO.File]::ReadAllBytes($gbimPath)
  if ($gbim.Length -ne (14 + (24 * 24) + 768) -or [Text.Encoding]::ASCII.GetString($gbim, 0, 4) -ne "GBIM" -or (Get-U16LE $gbim 4) -ne 1 -or (Get-U16LE $gbim 6) -ne 5 -or $gbim[8] -ne 3 -or (Get-U16LE $gbim 10) -ne 24 -or (Get-U16LE $gbim 12) -ne 24) {
    throw "CCDAA GBIM block-ID smoke failed: invalid header, dimensions, or length"
  }
  Write-Output "RESULT: CCDAA block-ID GBIM encounter resource PASS"
  [byte[]]$gbim2 = [IO.File]::ReadAllBytes((Join-Path $run "CPIC002.GBI"))
  if ([Text.Encoding]::ASCII.GetString($gbim2, 0, 4) -ne "GBIM" -or (Get-U16LE $gbim2 6) -ne 2) {
    throw "CCDAA GBIM second combat icon failed: logical ID 2 missing"
  }
  $sceneGbimPath = Join-Path $run "BIG114.GBI"
  [byte[]]$sceneGbim = [IO.File]::ReadAllBytes($sceneGbimPath)
  if ($sceneGbim.Length -ne (14 + (304 * 120) + 768) -or [Text.Encoding]::ASCII.GetString($sceneGbim, 0, 4) -ne "GBIM" -or (Get-U16LE $sceneGbim 6) -ne 114 -or (Get-U16LE $sceneGbim 10) -ne 304 -or (Get-U16LE $sceneGbim 12) -ne 120) {
    throw "CCDAA GBIM BIGPIC smoke failed: invalid block-114 scene resource"
  }
  Write-Output "RESULT: CCDAA BIGPIC GBIM scene resource PASS"
  $conf = Join-Path $run "_gbboot_engine_smoke.conf"
  $wall = Join-Path $run "_GBWALL.BIN"
  $efx = Join-Path $run "_GBECL.BIN"
  $res = Join-Path $run "_GBRES.BIN"
  $comb = Join-Path $run "_GBCOMB.TRC"
  $cout = Join-Path $run "_GBCOMB.OUT"
  $combView = Join-Path $run "_GBCOMB.RAW"
  $cres = Join-Path $run "_GBCR.BIN"
  $efxTxt = Join-Path $run "_GBECL.TXT"
  $resTxt = Join-Path $run "_GBRES.TXT"
  $gbw = Join-Path $run "_GBWSET.GBW"
  $view = Join-Path $run "_GBVIEW.RAW"
  function Assert-GbEffect([string]$Path, [int]$ExpectedGeo, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBECL.BIN was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    $geo = [BitConverter]::ToUInt16($bytes, 10)
    if ($bytes.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBEF" -or $geo -ne $ExpectedGeo) {
      throw "$Label failed: unexpected ECL effect record"
    }
  }
  function Assert-GbCombatEffect([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBECL.BIN was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 46) {
      throw "$Label failed: combat effect record is too short"
    }
    $flags = [BitConverter]::ToUInt16($bytes, 6)
    $status = [BitConverter]::ToUInt16($bytes, 8)
    $groups = [BitConverter]::ToUInt16($bytes, 32)
    if ([Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBEF" -or $status -ne 3 -or (($flags -band 0x0008) -eq 0) -or $groups -ne 2) {
      throw "$Label failed: unexpected combat effect record"
    }
  }
  function Assert-GbCombatResult([string]$Path, [string]$Label, [int]$ExpectedOutcome, [int[]]$ExpectedConditions = @(), [int[]]$ExpectedHp = @(), [int[]]$ExpectedMaxHp = @()) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: GBCR combat result sidecar was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    $version = if ($bytes.Length -ge 6) { [BitConverter]::ToUInt16($bytes, 4) } else { 0 }
    if ($bytes.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBCR" -or ($version -ne 1 -and $version -ne 2)) {
      throw "$Label failed: invalid GBCR result header"
    }
    $outcome = [BitConverter]::ToUInt16($bytes, 6)
    $count = [BitConverter]::ToUInt16($bytes, 10)
    if ($outcome -ne $ExpectedOutcome) {
      throw "$Label failed: unexpected GBCR outcome $outcome"
    }
    if ($count -le 0 -or $bytes.Length -ne (16 + (6 * $count))) {
      throw "$Label failed: invalid GBCR party record count/length"
    }
    for ($i = 0; $i -lt $ExpectedConditions.Count; $i++) {
      if ($i -ge $count) {
        throw "$Label failed: missing GBCR condition record $i"
      }
      $condition = $bytes[16 + ($i * 6) + 1]
      if ($condition -ne $ExpectedConditions[$i]) {
        throw "$Label failed: unexpected GBCR condition for party record $i"
      }
      if ($ExpectedHp.Count -gt $i) {
        $hp = [BitConverter]::ToInt16($bytes, 16 + ($i * 6) + 2)
        if ($hp -ne $ExpectedHp[$i]) {
          throw "$Label failed: GBCR record $i HP expected $($ExpectedHp[$i]), got $hp"
        }
      }
      if ($ExpectedMaxHp.Count -gt $i) {
        $maxHp = [BitConverter]::ToInt16($bytes, 16 + ($i * 6) + 4)
        if ($maxHp -ne $ExpectedMaxHp[$i]) {
          throw "$Label failed: GBCR record $i max HP expected $($ExpectedMaxHp[$i]), got $maxHp"
        }
      }
    }
  }
  function Assert-GbprCokHp([string]$Path, [string]$Label, [int[]]$ExpectedHp) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: GBPR roster sidecar was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne (16 + (410 * $ExpectedHp.Count)) -or
        [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBPR" -or
        (Get-U16LE $bytes 4) -ne 2 -or (Get-U16LE $bytes 8) -ne 410 -or
        (Get-U16LE $bytes 10) -ne 0 -or (Get-U16LE $bytes 12) -ne 1 -or
        (Get-U16LE $bytes 14) -ne 1) {
      throw "$Label failed: invalid GBPR header"
    }
    if ((Get-U16LE $bytes 6) -ne $ExpectedHp.Count) {
      throw "$Label failed: GBPR record count differs from expected HP records"
    }
    for ($i = 0; $i -lt $ExpectedHp.Count; $i++) {
      $hp = [int]$bytes[16 + ($i * 410) + 1 + 407]
      if ($hp -ne $ExpectedHp[$i]) {
        throw "$Label failed: GBPR record $i HP expected $($ExpectedHp[$i]), got $hp"
      }
    }
  }
  function Assert-GbprCokXp([string]$Path, [string]$Label, [int[]]$ExpectedXp) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: GBPR roster sidecar was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne (16 + (410 * $ExpectedXp.Count)) -or
        [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBPR" -or
        (Get-U16LE $bytes 4) -ne 2 -or (Get-U16LE $bytes 8) -ne 410 -or
        (Get-U16LE $bytes 10) -ne 0 -or (Get-U16LE $bytes 12) -ne 1 -or
        (Get-U16LE $bytes 14) -ne 1) {
      throw "$Label failed: invalid GBPR header"
    }
    if ((Get-U16LE $bytes 6) -ne $ExpectedXp.Count) {
      throw "$Label failed: GBPR record count differs from expected XP records"
    }
    for ($i = 0; $i -lt $ExpectedXp.Count; $i++) {
      $xp = Get-U32LE $bytes (16 + ($i * 410) + 1 + 0x116)
      if ($xp -ne $ExpectedXp[$i]) {
        throw "$Label failed: GBPR record $i XP expected $($ExpectedXp[$i]), got $xp"
      }
    }
  }
  function Assert-GbprDokCondition([string]$Path, [string]$ResultPath, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: GBPR roster sidecar was not created"
    }
    if (-not (Test-Path $ResultPath)) {
      throw "$Label failed: GBCR combat result was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    $result = [IO.File]::ReadAllBytes($ResultPath)
    if ($result.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($result, 0, 4) -ne "GBCR" -or (Get-U16LE $result 4) -ne 1) {
      throw "$Label failed: invalid GBCR header"
    }
    $count = Get-U16LE $result 10
    if ($result.Length -lt (16 + (6 * $count))) {
      throw "$Label failed: truncated GBCR combat result"
    }
    if ($bytes.Length -ne (16 + (410 * $count)) -or
        [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBPR" -or
        (Get-U16LE $bytes 4) -ne 2 -or (Get-U16LE $bytes 8) -ne 410 -or
        (Get-U16LE $bytes 10) -ne 1 -or (Get-U16LE $bytes 12) -ne 2 -or
        (Get-U16LE $bytes 14) -ne 1) {
      throw "$Label failed: invalid DoK GBPR header"
    }
    if ((Get-U16LE $bytes 6) -ne $count) {
      throw "$Label failed: GBPR record count differs from combat result"
    }
    for ($i = 0; $i -lt $count; $i++) {
      $resultOff = 16 + ($i * 6)
      $expectedCond = @(0, 2, 1, 8)[[int]$result[$resultOff + 1]] # GBCR enum -> GBD1 flags
      $expectedHp = [BitConverter]::ToInt16($result, $resultOff + 2)
      $expectedMaxHp = [BitConverter]::ToInt16($result, $resultOff + 4)
      if ($expectedHp -lt 0) {
        $expectedHp = 0
      }
      $meta = 16 + ($i * 410) + 1 + 216
      if ([Text.Encoding]::ASCII.GetString($bytes, $meta, 4) -ne "GBD1") {
        throw "$Label failed: missing GBD1 metadata for record $i"
      }
      $flags = Get-U16LE $bytes ($meta + 4)
      if (($flags -band 2) -eq 0) {
        throw "$Label failed: GBD1 condition flag was not set for record $i"
      }
      $cond = Get-U16LE $bytes ($meta + 24)
      if ($cond -ne $expectedCond) {
        throw "$Label failed: GBD1 condition for record $i expected $expectedCond, got $cond"
      }
      $hp = [BitConverter]::ToInt16($bytes, $meta + 6)
      if ($hp -ne $expectedHp) {
        throw "$Label failed: GBD1 HP for record $i expected $expectedHp, got $hp"
      }
      $maxHp = [BitConverter]::ToInt16($bytes, $meta + 26)
      if ($maxHp -ne $expectedMaxHp) {
        throw "$Label failed: GBD1 max HP for record $i expected $expectedMaxHp, got $maxHp"
      }
    }
  }
  function Assert-CokSaveHpXp([string]$Path, [string]$Label, [int]$ExpectedHp, [int]$ExpectedXp) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: CoK source save was not found"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 409) {
      throw "$Label failed: CoK source save has unexpected length $($bytes.Length)"
    }
    $hp = [int]$bytes[407]
    if ($hp -ne $ExpectedHp) {
      throw "$Label failed: source save HP expected $ExpectedHp, got $hp"
    }
    $xp = Get-U32LE $bytes 0x116
    if ($xp -ne $ExpectedXp) {
      throw "$Label failed: source save XP expected $ExpectedXp, got $xp"
    }
  }
  function Assert-CokFlatCombatXp([string]$Path, [string]$Label, [int]$ExpectedXp) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    $xp = Get-U16LE $bytes 304
    if ($xp -ne $ExpectedXp) {
      throw "$Label failed: static monster combat XP expected $ExpectedXp, got $xp"
    }
  }
  function Assert-GbEffectDump([string]$Path, [string]$Needle, [string]$Label, [string]$Version = '0009') {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: effect dump was not created"
    }
    $text = Get-Content $Path -Raw
    if (-not $text.Contains("GBEF v$Version") -or -not $text.Contains($Needle)) {
      throw "$Label failed: effect dump missing '$Needle'"
    }
  }
  # --- GBSX truncation guard -------------------------------------------------
  # `GBSX count=` is a SATURATING counter, not a cap.  fx_script_count in
  # native\src\ccecl.asm is only ever `inc`'d, behind `cmp ax, SCRIPTCAP / jae`
  # at each producer site, and dump_gbsx in ccefx.asm VALIDATES (`ja .bad`)
  # rather than clamps -- so the printed number is min(real_events, SCRIPTCAP)
  # and truncation is SILENT: there is no halt reason, no flag bit and no
  # marker for it.  SCRIPTCAP has gone 16 -> 32 -> 64, which is how the pins
  # authored on 2026-07-15 came to hold `GBSX count=0010` (16): each was a
  # count clamped at the then-ceiling, not an event total.
  #
  # The invariant that actually says "this trace was not truncated" is
  # count < SCRIPTCAP.  SCRIPTCAP is PARSED out of the assembler source below
  # rather than hard-coded, so raising the cap cannot leave this stale; the
  # assertion needs no measured constant, and it would have gone red on the day
  # those six pins were written.
  #
  # DO NOT "check" a count by counting the `#NN OP=` lines in the dump: that is
  # TAUTOLOGICAL.  dump_gbsx's event loop is bounded by script_count itself, so
  # it emits exactly that many lines whether or not the count saturated, and
  # can never disagree.  Measured 2026-09-10: all five re-measured cases had
  # oplines == count, INCLUDING the one that is genuinely truncated.
  function Get-ScriptCap {
    $asm = Join-Path $native 'src\ccecl.asm'
    $hits = @(Get-Content $asm | Where-Object { $_ -match '^\s*SCRIPTCAP\s+equ\s+[0-9]+\s*(;.*)?$' })
    if ($hits.Count -ne 1) {
      throw "GBSX guard failed: expected exactly one 'SCRIPTCAP equ <n>' line in $asm, found $($hits.Count)"
    }
    if ($hits[0] -notmatch '^\s*SCRIPTCAP\s+equ\s+([0-9]+)') {
      throw "GBSX guard failed: could not parse SCRIPTCAP out of $asm"
    }
    [int]$Matches[1]
  }
  function Get-GbsxCount([string]$Text, [string]$Label) {
    $m = [regex]::Match($Text, '(?m)^GBS[XL] count=([0-9A-Fa-f]{4})\s*$')
    if (-not $m.Success) {
      throw "$Label failed: effect dump has no 'GBSX count=' line to check for truncation"
    }
    [Convert]::ToInt32($m.Groups[1].Value, 16)
  }
  function Assert-GbsxNotTruncated([string]$Text, [string]$Label) {
    $cap = Get-ScriptCap
    $count = Get-GbsxCount $Text $Label
    if ($count -ge $cap) {
      throw "$Label failed: GBSX count=$count is AT/OVER SCRIPTCAP ($cap) -- the side-effect trace SATURATED, so it is silently truncated and its real event total is unknown"
    }
  }
  # The declared-truncation counterpart.  A trace that sits exactly ON the cap
  # is truncated, so its printed count is NOT a measurement of anything and
  # must never be pinned as one.  Asserting equality with the parsed SCRIPTCAP
  # (rather than <, or a literal) makes this self-retiring: the day the cap is
  # raised this goes RED and forces a re-measurement, instead of quietly
  # passing at 64 < 128 with the real total still unknown.
  function Assert-GbsxSaturatedAtCap([string]$Text, [string]$Label) {
    $cap = Get-ScriptCap
    $count = Get-GbsxCount $Text $Label
    if ($count -ne $cap) {
      throw "$Label failed: GBSX count=$count but this case is recorded as SATURATED at SCRIPTCAP ($cap). If the cap was raised, re-measure the real event total and move this case onto Assert-GbsxNotTruncated; do not pin the new number without checking it is below the new cap."
    }
  }
  # A trace whose count is STRICTLY ABOVE the cap is no longer saturated: the
  # count is a real total larger than SCRIPTCAP (GBSL sidecar records). Requiring
  # > cap keeps the saturation lesson: a changed cap forces re-measurement.
  function Assert-GbsxAboveCap([string]$Text, [string]$Label) {
    $cap = Get-ScriptCap
    $count = Get-GbsxCount $Text $Label
    if ($count -le $cap) {
      throw "$Label failed: GBSL count=$count is not above SCRIPTCAP ($cap); this case is recorded as a real total larger than the cap"
    }
  }
  function Invoke-GbbootEclOracleParity([string]$EffectPath) {
    if ($env:GOLDBOX_SKIP_TS_ORACLE -match '^(1|true|yes)$') {
      Write-Host "Skipping GBBOOT TypeScript oracle parity because GOLDBOX_SKIP_TS_ORACLE is set"
      return
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
      Write-Host "Skipping GBBOOT TypeScript oracle parity because pnpm was not found"
      return
    }

    $oldEffect = $env:GOLDBOX_NATIVE_GBEF
    try {
      $env:GOLDBOX_NATIVE_GBEF = $EffectPath
      Push-Location $root
      try {
        & pnpm --filter "@goldbox/engine" exec vitest run test/nativeGbbootEclTrace.test.ts
        if ($LASTEXITCODE -ne 0) {
          throw "GBBOOT TypeScript oracle parity failed"
        }
      } finally {
        Pop-Location
      }
    } finally {
      if ($null -eq $oldEffect) {
        Remove-Item Env:GOLDBOX_NATIVE_GBEF -ErrorAction SilentlyContinue
      } else {
        $env:GOLDBOX_NATIVE_GBEF = $oldEffect
      }
    }
  }
  function Assert-ViewRaw([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBVIEW.RAW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 64772 -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
      throw "$Label failed: unexpected RAW snapshot header or length"
    }
    Assert-RawNonblank $bytes 512 $Label
  }
  function Assert-RawNonblank([byte[]]$Bytes, [int]$MinNonzero, [string]$Label) {
    $nonzero = 0
    for ($i = 4; $i -lt (4 + 64000); $i++) {
      if ($Bytes[$i] -ne 0) { $nonzero++ }
    }
    if ($nonzero -lt $MinNonzero) {
      throw "$Label failed: rendered RAW framebuffer looks empty ($nonzero nonzero pixels)"
    }
  }
  function Assert-GbwsRenderedRaw([string]$Path, [string]$Label, [int]$MinHighColorPixels = 512) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBVIEW.RAW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 64772 -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
      throw "$Label failed: unexpected RAW snapshot header or length"
    }
    $high = 0
    for ($i = 4; $i -lt (4 + 64000); $i++) {
      $pixel = $bytes[$i]
      if ($pixel -gt 15 -and $pixel -ne 255) { $high++ }
    }
    if ($high -lt $MinHighColorPixels) {
      throw "$Label failed: GBWS frame looks like outline fallback ($high high-palette pixels)"
    }
  }
  function Assert-ClockSkyRaw([string]$Path, [string]$Label, [int]$MinSkyPixels = 4096) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBVIEW.RAW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 64772 -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
      throw "$Label failed: unexpected RAW snapshot header or length"
    }
    $sky = 0
    for ($y = 8; $y -lt 70; $y++) {
      $row = 4 + ($y * 320)
      for ($x = 8; $x -lt 176; $x++) {
        if ($bytes[$row + $x] -eq 11) { $sky++ }
      }
    }
    if ($sky -lt $MinSkyPixels) {
      throw "$Label failed: expected GBCL-driven sky band, found $sky sky pixels"
    }
  }
  function Assert-GbwsBundle {
    param(
      [Parameter(Mandatory)][string]$Path,
      [Parameter(Mandatory)][string]$Label,
      [int]$ExpectedCount = 141,
      [int]$ExpectedStartSet = -1,
      [int]$ExpectedFirstLocal = 0,
      [int]$ExpectedFirstGlobal = -1,
      [int]$ExpectedFirstWidth = -1,
      [int]$ExpectedFirstHeight = -1,
      [int]$ExpectedFirstMethod = 21,
      [int]$ExpectedFirstGroup = 1
    )
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBWSET.GBW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 40 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBWS") {
      throw "$Label failed: invalid _GBWSET.GBW header"
    }
    $version = [BitConverter]::ToUInt16($bytes, 4)
    $startSet = [BitConverter]::ToUInt16($bytes, 6)
    $count = [BitConverter]::ToUInt16($bytes, 8)
    $groups = @($bytes[10], $bytes[11], $bytes[12], $bytes[13], $bytes[14])
    if ($version -ne 2 -or $count -ne $ExpectedCount -or (($groups -join ",") -ne "10,10,9,9,9")) {
      throw "$Label failed: unexpected _GBWSET.GBW header"
    }
    if ($ExpectedStartSet -ge 0 -and $startSet -ne $ExpectedStartSet) {
      throw "$Label failed: expected GBWS start set $ExpectedStartSet, got $startSet"
    }
    if ([Text.Encoding]::ASCII.GetString($bytes, 16, 4) -ne "GBWI") {
      throw "$Label failed: first _GBWSET.GBW image record is not GBWI"
    }
    $local = [BitConverter]::ToUInt16($bytes, 20)
    $global = [BitConverter]::ToUInt16($bytes, 22)
    $width = [BitConverter]::ToUInt16($bytes, 24)
    $height = [BitConverter]::ToUInt16($bytes, 26)
    $npix = [BitConverter]::ToUInt16($bytes, 28)
    $method = $bytes[34]
    $group = $bytes[35]
    if ($ExpectedFirstGlobal -lt 0 -and $ExpectedStartSet -ge 0) {
      $ExpectedFirstGlobal = $ExpectedStartSet * 47
    }
    if (
      ($ExpectedFirstLocal -ge 0 -and $local -ne $ExpectedFirstLocal) -or
      ($ExpectedFirstGlobal -ge 0 -and $global -ne $ExpectedFirstGlobal) -or
      ($ExpectedFirstWidth -ge 0 -and $width -ne $ExpectedFirstWidth) -or
      ($ExpectedFirstHeight -ge 0 -and $height -ne $ExpectedFirstHeight) -or
      ($ExpectedFirstMethod -ge 0 -and $method -ne $ExpectedFirstMethod) -or
      ($ExpectedFirstGroup -ge 0 -and $group -ne $ExpectedFirstGroup) -or
      $npix -ne ($width * $height)
    ) {
      throw "$Label failed: unexpected first GBWI record"
    }
  }
  function Assert-SetupMarkerRaw([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBVIEW.RAW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 64772 -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
      throw "$Label failed: unexpected RAW snapshot header or length"
    }
    $red = 0
    for ($y = 80; $y -lt 108; $y++) {
      $row = 4 + ($y * 320)
      for ($x = 82; $x -lt 102; $x++) {
        if ($bytes[$row + $x] -eq 12) { $red++ }
      }
    }
    if ($red -lt 500) {
      throw "$Label failed: expected visible GBES approach marker, found $red red pixels"
    }
  }
  function Assert-CombatRaw([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: _GBCOMB.RAW was not created"
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne 64772 -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
      throw "$Label failed: unexpected combat RAW snapshot header or length"
    }
    Assert-RawNonblank $bytes 512 $Label
  }
  function Assert-GbCombatEffectDump([string]$Path, [string]$Label) {
    Assert-GbEffectDump $Path "GBEC groups=0002" $Label
    Assert-GbEffectDump $Path "@00 MONSTER id=0009 count=0002 pic=0005" $Label
    Assert-GbEffectDump $Path "@01 MONSTER id=0013 count=0001 pic=0002" $Label
    Assert-GbEffectDump $Path "GBRS flags=0001" $Label
  }
  function Assert-TraceExact([string]$Path, [string[]]$Expected, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: trace missing"
    }
    $actual = @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 })
    if ($actual.Count -ne $Expected.Count) {
      throw "$Label failed: expected $($Expected.Count) trace lines, got $($actual.Count)"
    }
    for ($i = 0; $i -lt $Expected.Count; $i++) {
      if ($actual[$i] -ne $Expected[$i]) {
        throw "$Label failed: trace line $($i + 1) expected '$($Expected[$i])', got '$($actual[$i])'"
      }
    }
  }
  function Assert-TraceContains([string]$Path, [string[]]$Expected, [string]$Label) {
    if (-not (Test-Path $Path)) {
      throw "$Label failed: trace missing"
    }
    $actual = @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 })
    foreach ($line in $Expected) {
      if (-not ($actual -contains $line)) {
        throw "$Label failed: expected trace line '$line' was not found"
      }
    }
  }
  $combatExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e1 p1 19 15 1 6 6 -",
    "1 attack p0 e0 5 9 0 - 4 -",
    "1 attack e0 p0 8 16 0 - 14 -",
    "1 attack e2 p1 7 9 0 - 6 -",
    "1 attack p1 e1 18 10 1 5 0 -",
    "1 slain p1 e1 - - - - 0 0",
    "2 attack p0 e0 16 9 1 4 0 -",
    "2 slain p0 e0 - - - - 0 0",
    "2 attack e2 p1 2 9 0 - 6 -",
    "2 attack p1 e2 13 11 1 6 12 -",
    "3 attack p0 e2 19 10 1 7 5 -",
    "3 attack e2 p1 13 9 1 6 0 -",
    "3 slain e2 p1 - - - - 0 0",
    "4 attack p0 e2 7 10 0 - 5 -",
    "4 attack e2 p0 14 10 1 5 9 -",
    "5 attack p0 e2 4 10 0 - 5 -",
    "5 attack e2 p0 11 10 1 8 1 -",
    "6 attack p0 e2 9 10 0 - 5 -",
    "6 attack e2 p0 16 10 1 5 0 -",
    "6 slain e2 p0 - - - - 0 0",
    "6 end - enemy - - - - - -"
  )
  # CoK uses the verified original RNG recurrence; retain exact CoK-specific traces.
  $combatCokExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e2 p1 3 9 0 - 12 -",
    "1 attack p0 e0 15 9 1 9 0 -",
    "1 slain p0 e0 - - - - 0 0",
    "1 attack e1 p1 6 15 0 - 12 -",
    "1 attack p1 e1 4 10 0 - 4 -",
    "2 attack e2 p1 9 9 1 2 10 -",
    "2 attack p0 e1 7 9 0 - 4 -",
    "2 attack e1 p1 13 15 0 - 10 -",
    "2 attack p1 e1 15 10 1 3 1 -",
    "3 attack e2 p1 15 9 1 2 8 -",
    "3 attack p0 e1 1 9 0 - 1 -",
    "3 attack e1 p1 14 15 0 - 8 -",
    "3 attack p1 e1 4 10 0 - 1 -",
    "4 attack e2 p1 5 9 0 - 8 -",
    "4 attack p0 e1 18 9 1 5 0 -",
    "4 slain p0 e1 - - - - 0 0",
    "4 attack p1 e2 15 11 1 8 10 -",
    "5 attack e2 p1 1 9 0 - 8 -",
    "5 attack p0 e2 14 10 1 4 6 -",
    "5 attack p1 e2 2 11 0 - 6 -",
    "6 attack e2 p1 4 9 0 - 8 -",
    "6 attack p0 e2 3 10 0 - 6 -",
    "6 attack p1 e2 12 11 1 4 2 -",
    "7 attack e2 p1 10 9 1 5 3 -",
    "7 attack p0 e2 13 10 1 4 0 -",
    "7 slain p0 e2 - - - - 0 0",
    "7 end - party - - - - - -"
  )

  $combatCokCommandExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e2 p1 3 9 0 - 12 -",
    "1 guard p0 - - - - - - -",
    "1 attack e0 p0 15 16 0 - 14 -",
    "1 attack e1 p1 12 15 0 - 12 -",
    "1 attack p1 e1 6 10 0 - 4 -",
    "2 attack e2 p1 4 9 0 - 12 -",
    "2 attack p0 e0 9 9 1 5 0 -",
    "2 slain p0 e0 - - - - 0 0",
    "2 attack e1 p1 7 15 0 - 12 -",
    "2 attack p1 e1 13 10 1 7 0 -",
    "2 slain p1 e1 - - - - 0 0",
    "3 attack e2 p1 13 9 1 5 7 -",
    "3 attack p0 e2 2 10 0 - 18 -",
    "3 attack p1 e2 1 11 0 - 18 -",
    "4 attack e2 p1 14 9 1 4 3 -",
    "4 attack p0 e2 5 10 0 - 18 -",
    "4 attack p1 e2 18 11 1 8 10 -",
    "5 attack e2 p1 15 9 1 4 0 -",
    "5 slain e2 p1 - - - - 0 0",
    "5 attack p0 e2 1 10 0 - 10 -",
    "6 attack e2 p0 14 10 1 5 9 -",
    "6 attack p0 e2 2 10 0 - 10 -",
    "7 attack e2 p0 4 10 0 - 9 -",
    "7 attack p0 e2 3 10 0 - 10 -",
    "8 attack e2 p0 12 10 1 8 1 -",
    "8 attack p0 e2 10 10 1 4 6 -",
    "9 attack e2 p0 13 10 1 7 0 -",
    "9 slain e2 p0 - - - - 0 0",
    "9 end - enemy - - - - - -"
  )

  $combatCokPartyFleeExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e2 p1 3 9 0 - 12 -",
    "1 party-flee - escaped - - - - - -",
    "1 end - flee - - - - - -"
  )

  # Item 49 records each AI route cell. Keep all intermediate moves here so a
  # future trace compression cannot silently turn a per-square route back into
  # a destination-only teleport.
  $combatRosterExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 move e2 - - - - - - - 4 5",
    "1 move e2 - - - - - - - 4 4",
    "1 move e2 - - - - - - - 4 3",
    "1 attack e2 p1 3 9 0 - 12 -",
    "1 attack p0 e2 15 10 1 9 9 -",
    "1 move e0 - - - - - - - 5 3",
    "1 move e0 - - - - - - - 4 2",
    "1 attack e0 p1 6 15 0 - 12 -",
    "1 move e1 - - - - - - - 4 4",
    "1 move e1 - - - - - - - 3 4",
    "1 move e1 - - - - - - - 2 4",
    "1 attack e1 p1 4 15 0 - 12 -",
    "1 attack p1 e0 9 10 0 - 4 -",
    "2 attack e2 p1 12 9 1 7 5 -",
    "2 attack p0 e0 13 9 1 8 0 -",
    "2 slain p0 e0 - - - - 0 0",
    "2 attack e1 p1 13 15 0 - 5 -",
    "2 attack p1 e1 15 10 1 8 0 -",
    "2 slain p1 e1 - - - - 0 0",
    "3 attack e2 p1 1 9 0 - 5 -",
    "3 attack p0 e2 14 10 1 9 0 -",
    "3 slain p0 e2 - - - - 0 0",
    "3 end - party - - - - - -"
  )
  $combatCommandExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e1 p1 19 15 1 6 6 -",
    "1 guard p0 - - - - - - -",
    "1 attack e0 p0 5 16 0 - 14 -",
    "1 attack e2 p1 8 9 0 - 6 -",
    "1 attack p1 e1 7 10 0 - 4 -",
    "2 attack e1 p1 18 15 1 3 3 -",
    "2 attack p0 e0 16 9 1 4 0 -",
    "2 slain p0 e0 - - - - 0 0",
    "2 attack e2 p1 2 9 0 - 3 -",
    "2 attack p1 e1 13 10 1 6 0 -",
    "2 slain p1 e1 - - - - 0 0",
    "3 attack p0 e2 19 10 1 7 11 -",
    "3 attack e2 p1 13 9 1 6 0 -",
    "3 slain e2 p1 - - - - 0 0",
    "4 attack p0 e2 7 10 0 - 11 -",
    "4 attack e2 p0 14 10 1 5 9 -",
    "5 attack p0 e2 4 10 0 - 11 -",
    "5 attack e2 p0 11 10 1 8 1 -",
    "6 attack p0 e2 9 10 0 - 11 -",
    "6 attack e2 p0 16 10 1 5 0 -",
    "6 slain e2 p0 - - - - 0 0",
    "6 end - enemy - - - - - -"
  )
  $combatPartyFleeExpected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 attack e1 p1 19 15 1 6 6 -",
    "1 party-flee - escaped - - - - - -",
    "1 end - flee - - - - - -"
  )
  $combatDokTraceContains = @(
    "1 attack e1 p1 19 9 1 6 6 -",
    "1 attack p0 e0 5 20 0 - 5 -",
    "1 attack e0 p0 8 10 0 - 14 -"
  )
  function Invoke-CombatHandoffSmoke(
    [string]$Slug,
    [string]$Label,
    [string]$Dir,
    [string]$ExtraArgs = "",
    [string[]]$ExpectedTrace = $combatExpected,
    [string[]]$ExpectedTraceContains = @(),
    [string]$ExpectedOutcome = "enemy",
    [int]$ExpectedResultOutcome = -1,
    [int[]]$ExpectedResultConditions = @(),
    [int[]]$ExpectedResultHp = @(),
    [int[]]$ExpectedResultMaxHp = @(),
    [switch]$PreserveRoster
  ) {
    $defaultComb = Join-Path $Dir "CCCOMB.TRC"
    $conf = Join-Path $run "_gbboot_${Slug}_combat_engine_smoke.conf"
    $cleanup = @($wall, $view, $combView, $cres, $efx, $res, $comb, $cout, $efxTxt, $resTxt, $defaultComb)
    if (-not $PreserveRoster) {
      $cleanup += (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN")
    }
    Remove-Item $cleanup -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X$ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E $Label smoke failed: DOSBox did not exit"
    }
    Assert-GbCombatEffect $efx "GBBOOT /E $Label smoke"
    Assert-GbCombatEffectDump $efxTxt "GBBOOT /E $Label smoke"
    if ($ExpectedTrace.Count -gt 0) {
      Assert-TraceExact $comb $ExpectedTrace "GBBOOT /E $Label smoke"
    }
    if ($ExpectedTraceContains.Count -gt 0) {
      Assert-TraceContains $comb $ExpectedTraceContains "GBBOOT /E $Label smoke"
    }
    if ((Get-Content $cout -Raw).Trim() -ne $ExpectedOutcome) {
      throw "GBBOOT /E $Label smoke failed: unexpected combat outcome sidecar"
    }
    if ($ExpectedResultOutcome -lt 0) {
      $ExpectedResultOutcome = switch ($ExpectedOutcome) {
        "party" { 0 }
        "enemy" { 1 }
        default { 2 }
      }
    }
    Assert-GbCombatResult $cres "GBBOOT /E $Label smoke" $ExpectedResultOutcome $ExpectedResultConditions $ExpectedResultHp $ExpectedResultMaxHp
    if (Test-Path $defaultComb) {
      throw "GBBOOT /E $Label smoke failed: trace was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E $Label handoff smoke PASS"
  }
  function Invoke-CombatHandoffBatch([hashtable[]]$Cases) {
    # Each combat flow receives a fresh DOSBox process. CCECL imports the
    # transient GBPR generated by CCPARTY; reusing one DOS shell left its
    # second launch sensitive to the previous child process's file state.
    foreach ($case in $Cases) {
      $smokeArgs = @{
        Slug = [string]$case.Slug
        Label = [string]$case.Label
        Dir = [string]$case.Dir
      }
      foreach ($name in @('ExtraArgs', 'ExpectedTrace', 'ExpectedTraceContains', 'ExpectedOutcome', 'ExpectedResultOutcome', 'ExpectedResultConditions', 'ExpectedResultHp', 'ExpectedResultMaxHp')) {
        if ($case.ContainsKey($name)) {
          $smokeArgs[$name] = $case[$name]
        }
      }
      Invoke-CombatHandoffSmoke @smokeArgs
    }
  }
  function Invoke-TitleCombatHandoffSmoke(
    [string]$Slug,
    [string]$Label,
    [string]$Dir,
    [string]$ExtraArgs,
    [string]$ExpectedTitleTail,
    [string[]]$ExpectedTrace = $combatExpected,
    [string[]]$ExpectedTraceContains = @(),
    [string]$ExpectedOutcome = "enemy",
    [int]$ExpectedResultOutcome = -1,
    [int[]]$ExpectedResultConditions = @(),
    [int[]]$ExpectedResultHp = @(),
    [int[]]$ExpectedResultMaxHp = @()
  ) {
    $defaultComb = Join-Path $Dir "CCCOMB.TRC"
    $childOut = Join-Path $Dir "GBEXEC.TXT"
    $conf = Join-Path $run "_gbboot_${Slug}_title_combat_engine_smoke.conf"
    Remove-Item $wall, $view, $combView, $cres, $efx, $res, $comb, $cout, $efxTxt, $resTxt, $defaultComb, $childOut, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue

    $realCgb = Join-Path $run "CGB.TITLECOMBAT.REAL"
    Copy-Item (Join-Path $run "CGB.COM") $realCgb -Force
    Copy-Item $gbmark (Join-Path $run "CGB.COM") -Force
    try {
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X /J$ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

      $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
      if (-not $p.WaitForExit(60000)) {
        try { $p.Kill() } catch {}
        throw "GBBOOT /E /X /J $Label smoke failed: DOSBox did not exit"
      }
    } finally {
      Copy-Item $realCgb (Join-Path $run "CGB.COM") -Force
    }

    if (-not (Test-Path $childOut)) {
      throw "GBBOOT /E /X /J $Label smoke failed: title helper was not invoked"
    }
    $childText = Get-Content $childOut -Raw
    $tailLine = ($childText -split "\r?\n" | Where-Object { $_ -like "TAIL=*" } | Select-Object -First 1)
    if ($tailLine -ne $ExpectedTitleTail) {
      throw "GBBOOT /E /X /J $Label smoke failed: expected title helper tail '$ExpectedTitleTail', got '$tailLine'"
    }

    Assert-GbCombatEffect $efx "GBBOOT /E /X /J $Label smoke"
    Assert-GbCombatEffectDump $efxTxt "GBBOOT /E /X /J $Label smoke"
    if ($ExpectedTrace.Count -gt 0) {
      Assert-TraceExact $comb $ExpectedTrace "GBBOOT /E /X /J $Label smoke"
    }
    if ($ExpectedTraceContains.Count -gt 0) {
      Assert-TraceContains $comb $ExpectedTraceContains "GBBOOT /E /X /J $Label smoke"
    }
    if ((Get-Content $cout -Raw).Trim() -ne $ExpectedOutcome) {
      throw "GBBOOT /E /X /J $Label smoke failed: unexpected combat outcome sidecar"
    }
    if ($ExpectedResultOutcome -lt 0) {
      $ExpectedResultOutcome = switch ($ExpectedOutcome) {
        "party" { 0 }
        "enemy" { 1 }
        default { 2 }
      }
    }
    Assert-GbCombatResult $cres "GBBOOT /E /X /J $Label smoke" $ExpectedResultOutcome $ExpectedResultConditions $ExpectedResultHp $ExpectedResultMaxHp
    if (Test-Path $defaultComb) {
      throw "GBBOOT /E /X /J $Label smoke failed: trace was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E /X /J $Label title-to-combat handoff smoke PASS"
  }
  function Invoke-CombatSnapshotSmoke([string]$Slug, [string]$Label, [string]$Dir, [string]$ExtraArgs = "") {
    $defaultComb = Join-Path $Dir "CCCOMB.TRC"
    $conf = Join-Path $run "_gbboot_${Slug}_combat_snapshot_engine_smoke.conf"
    Remove-Item $wall, $view, $combView, $efx, $res, $comb, $cout, $efxTxt, $resTxt, $defaultComb, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X$ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $Label smoke failed: DOSBox did not exit"
    }
    Assert-GbCombatEffect $efx "GBBOOT /E /X $Label smoke"
    Assert-GbCombatEffectDump $efxTxt "GBBOOT /E /X $Label smoke"
    Assert-CombatRaw $combView "GBBOOT /E /X $Label smoke"
    Assert-TraceExact $comb $combatCokExpected "GBBOOT /E /X $Label smoke"
    if ((Get-Content $cout -Raw).Trim() -ne "party") {
      throw "GBBOOT /E /X $Label smoke failed: unexpected combat outcome sidecar"
    }
    if (Test-Path $wall) {
      throw "GBBOOT /E /X $Label smoke failed: _GBWALL.BIN should not be created for combat-only ECL"
    }
    if (Test-Path $view) {
      throw "GBBOOT /E /X $Label smoke failed: _GBVIEW.RAW should not be created for combat-only ECL"
    }
    if (Test-Path $defaultComb) {
      throw "GBBOOT /E /X $Label smoke failed: trace was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E /X $Label combat snapshot smoke PASS"
  }
  function Invoke-CombatThenMapSmoke([string]$Slug, [string]$Label, [string]$Dir) {
    $defaultComb = Join-Path $Dir "CCCOMB.TRC"
    $conf = Join-Path $run "_gbboot_${Slug}_combat_map_engine_smoke.conf"
    Remove-Item $wall, $view, $combView, $efx, $res, $comb, $cout, $efxTxt, $resTxt, $defaultComb, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $Label smoke failed: DOSBox did not exit"
    }
    Assert-GbCombatEffect $efx "GBBOOT /E $Label smoke"
    Assert-GbCombatEffectDump $efxTxt "GBBOOT /E $Label smoke"
    Assert-GbEffectDump $efxTxt "TEXT=BOOTTXT" "GBBOOT /E $Label smoke"
    Assert-GbEffectDump $efxTxt "GBLF operands=0022 0002 00FF" "GBBOOT /E $Label smoke"
    Assert-TraceExact $comb $combatCokExpected "GBBOOT /E $Label smoke"
    if ((Get-Content $cout -Raw).Trim() -ne "party") {
      throw "GBBOOT /E $Label smoke failed: unexpected combat outcome sidecar"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E $Label smoke failed: _GBWALL.BIN was not created after combat"
    }
    Assert-CombatRaw $combView "GBBOOT /E /X $Label smoke"
    Assert-ViewRaw $view "GBBOOT /E /X $Label smoke"
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
      throw "GBBOOT /E $Label smoke failed: invalid _GBWALL.BIN header after combat"
    }
    if (Test-Path $defaultComb) {
      throw "GBBOOT /E $Label smoke failed: trace was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E $Label combat-to-map smoke PASS"
  }
  function Invoke-CombatResumeMapSmoke([string]$Slug, [string]$Label, [string]$Dir) {
    $defaultComb = Join-Path $Dir "CCCOMB.TRC"
    $conf = Join-Path $run "_gbboot_${Slug}_combat_resume_map_engine_smoke.conf"
    Remove-Item $wall, $view, $combView, $efx, $res, $comb, $cout, $efxTxt, $resTxt, $defaultComb, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $Label smoke failed: DOSBox did not exit"
    }
    Assert-GbCombatEffect $efx "GBBOOT /E $Label smoke"
    Assert-GbCombatEffectDump $efxTxt "GBBOOT /E $Label smoke"
    Assert-GbEffect $res 34 "GBBOOT /E $Label resumed smoke"
    Assert-GbEffectDump $resTxt "geo=0022" "GBBOOT /E $Label resumed smoke"
    Assert-GbEffectDump $resTxt "GBLF operands=0022 0002 00FF" "GBBOOT /E $Label resumed smoke"
    Assert-GbEffectDump $resTxt "GBRS flags=0000" "GBBOOT /E $Label resumed smoke"
    Assert-TraceExact $comb $combatCokExpected "GBBOOT /E $Label smoke"
    if ((Get-Content $cout -Raw).Trim() -ne "party") {
      throw "GBBOOT /E $Label smoke failed: unexpected combat outcome sidecar"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E $Label smoke failed: _GBWALL.BIN was not created after resumed ECL"
    }
    Assert-CombatRaw $combView "GBBOOT /E /X $Label smoke"
    Assert-ViewRaw $view "GBBOOT /E /X $Label smoke"
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
      throw "GBBOOT /E $Label smoke failed: invalid _GBWALL.BIN header after resumed ECL"
    }
    if (Test-Path $defaultComb) {
      throw "GBBOOT /E $Label smoke failed: trace was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E $Label combat-resume-map smoke PASS"
  }
  function Invoke-MapPreviewSmoke([string]$Slug, [string]$Label, [string]$Dir, [string]$ExtraArgs = "", [switch]$ExpectGbw, [switch]$AssertNoGameSnapshot) {
    $conf = Join-Path $run "_gbboot_${Slug}_rawgeo_engine_smoke.conf"
    $defaultView = Join-Path $Dir "CCFPVIEW.RAW"
    Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
    if ($AssertNoGameSnapshot) {
      Remove-Item $defaultView -ErrorAction SilentlyContinue
    }
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X $ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $Label map preview smoke failed: DOSBox did not exit"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X $Label map preview smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X $Label map preview smoke"
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
      throw "GBBOOT /E $Label map preview smoke failed: invalid _GBWALL.BIN header"
    }
    if ($ExpectGbw) {
      Assert-GbwsBundle $gbw "GBBOOT /E /X $Label map preview smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
      Assert-GbwsRenderedRaw $view "GBBOOT /E /X $Label map preview smoke"
    }
    if ($AssertNoGameSnapshot -and (Test-Path $defaultView)) {
      throw "GBBOOT /E /X $Label map preview smoke failed: default CCFPVIEW.RAW was written into the game directory"
    }
    Write-Output "RESULT: GBBOOT /E /X $Label map preview smoke PASS"
  }
  function Invoke-MapPreviewBatch([object[]]$Cases) {
    if ($Cases.Count -eq 0) { return }
    # CCFLOW wraps CCECL with nested EXEC. Give each preview its own DOSBox
    # process so the child file/PSP state cannot leak into the next title.
    $maxBatchCases = 1
    if ($Cases.Count -gt $maxBatchCases) {
      for ($i = 0; $i -lt $Cases.Count; $i += $maxBatchCases) {
        $last = [Math]::Min($i + $maxBatchCases - 1, $Cases.Count - 1)
        Invoke-MapPreviewBatch $Cases[$i..$last]
      }
      return
    }

    $lines = @(
      "@echo off",
      ('mount C "{0}"' -f $run),
      "C:"
    )
    for ($i = 0; $i -lt $Cases.Count; $i++) {
      $c = $Cases[$i]
      $id = "M{0:D2}" -f $i
      $c["_BatchId"] = $id
      $caseWall = Join-Path $run "$id.WAL"
      $caseView = Join-Path $run "$id.RAW"
      $caseGbw = Join-Path $run "$id.GBW"
      $caseText = Join-Path $run "$id.TXT"
      Remove-Item $caseWall, $caseView, $caseGbw, $caseText -ErrorAction SilentlyContinue
      if ($c.ContainsKey("AssertNoGameSnapshot") -and $c.AssertNoGameSnapshot) {
        Remove-Item (Join-Path $c.Dir "CCFPVIEW.RAW") -ErrorAction SilentlyContinue
      }

      $extraArgs = if ($c.ContainsKey("ExtraArgs")) { [string]$c.ExtraArgs } else { "" }
      $lines += ('mount D "{0}"' -f $c.Dir)
      $lines += "D:"
      $lines += "del C:\_GBWALL.BIN"
      $lines += "del C:\_GBVIEW.RAW"
      $lines += "del C:\_GBWSET.GBW"
      $lines += "del C:\_GBPARTY.GBP"
      $lines += "del C:\_GBSEED.BIN"
      $lines += ('C:\GBBOOT /E /X {0} > C:\{1}.TXT' -f $extraArgs, $id)
      $lines += "C:"
      $lines += ('if exist _GBWALL.BIN ren _GBWALL.BIN {0}.WAL' -f $id)
      $lines += ('if exist _GBVIEW.RAW ren _GBVIEW.RAW {0}.RAW' -f $id)
      $lines += ('if exist _GBWSET.GBW ren _GBWSET.GBW {0}.GBW' -f $id)
      $lines += "mount -u D"
    }
    $lines += "exit"

    $conf = Join-Path $run "_gbboot_rawgeo_batch_engine_smoke.conf"
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

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(120000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X raw map preview batch failed: DOSBox did not exit"
    }

    foreach ($c in $Cases) {
      $id = $c["_BatchId"]
      $label = [string]$c.Label
      $caseWall = Join-Path $run "$id.WAL"
      $caseView = Join-Path $run "$id.RAW"
      $caseGbw = Join-Path $run "$id.GBW"
      $caseText = Join-Path $run "$id.TXT"
      if (-not (Test-Path $caseWall)) {
        $detail = if (Test-Path $caseText) { Get-Content $caseText -Raw } else { "" }
        throw "GBBOOT /E /X $label map preview smoke failed: _GBWALL.BIN was not created. $detail"
      }
      Assert-ViewRaw $caseView "GBBOOT /E /X $label map preview smoke"
      $wallBytes = [IO.File]::ReadAllBytes($caseWall)
      if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
        throw "GBBOOT /E $label map preview smoke failed: invalid _GBWALL.BIN header"
      }
      if ($c.ContainsKey("ExpectGbw") -and $c.ExpectGbw) {
        $expectedGbwStartSet = if ($c.ContainsKey("ExpectedGbwStartSet")) { [int]$c.ExpectedGbwStartSet } else { 0 }
        $expectedGbwFirstWidth = if ($c.ContainsKey("ExpectedGbwFirstWidth")) { [int]$c.ExpectedGbwFirstWidth } else { 8 }
        $expectedGbwFirstHeight = if ($c.ContainsKey("ExpectedGbwFirstHeight")) { [int]$c.ExpectedGbwFirstHeight } else { 8 }
        Assert-GbwsBundle $caseGbw "GBBOOT /E /X $label map preview smoke" -ExpectedStartSet $expectedGbwStartSet -ExpectedFirstWidth $expectedGbwFirstWidth -ExpectedFirstHeight $expectedGbwFirstHeight
        if (-not $c.ContainsKey("AssertGbwRendered") -or $c.AssertGbwRendered) {
          Assert-GbwsRenderedRaw $caseView "GBBOOT /E /X $label map preview smoke"
        }
      }
      if ($c.ContainsKey("ExpectOutput")) {
        if (-not (Test-Path $caseText)) {
          throw "GBBOOT /E /X $label map preview smoke failed: output text was not captured"
        }
        $text = Get-Content $caseText -Raw
        if ($text -notlike "*$($c.ExpectOutput)*") {
          throw "GBBOOT /E /X $label map preview smoke missing expected output '$($c.ExpectOutput)'"
        }
      }
      if ($c.ContainsKey("AssertNoGameSnapshot") -and $c.AssertNoGameSnapshot -and (Test-Path (Join-Path $c.Dir "CCFPVIEW.RAW"))) {
        throw "GBBOOT /E /X $label map preview smoke failed: default CCFPVIEW.RAW was written into the game directory"
      }
      Write-Output "RESULT: GBBOOT /E /X $label map preview smoke PASS"
    }
  }
  function Invoke-EclMapEngineSmoke([string]$Slug, [string]$Label, [string]$Dir, [string]$ExtraArgs, [int]$ExpectedGeo, [string[]]$DumpNeedles = @(), [bool]$ExpectSetupMarker = $false, [switch]$RunTsOracle, [switch]$DokAck) {
    $conf = Join-Path $run "_gbboot_${Slug}_ecl_map_engine_smoke.conf"
    Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X $ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    if ($DokAck) {
      # Real DoK party yields the welcome ACK even under /X; answer it via focusless GameLink.
      Invoke-DokGameLinkAckFlow -DbxExe (Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe') -BuildDir $run -GameDir $Dir `
        -GuestCommand "C:\GBBOOT /E /X $ExtraArgs" `
        -DosLogFile (Join-Path $run "gbboot-${Slug}-files.log") `
        -CaptureRoot (Join-Path $run "gbboot-${Slug}-gamelink") -TimeoutSeconds 45
    } else {
      $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
      if (-not $p.WaitForExit(60000)) {
        try { $p.Kill() } catch {}
        throw "GBBOOT /E /X $Label smoke failed: DOSBox did not exit"
      }
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X $Label smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X $Label smoke"
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
      throw "GBBOOT /E $Label smoke failed: invalid _GBWALL.BIN header"
    }
    Assert-GbEffect $efx $ExpectedGeo "GBBOOT /E $Label smoke"
    foreach ($needle in $DumpNeedles) {
      if ($needle) {
        Assert-GbEffectDump $efxTxt $needle "GBBOOT /E $Label smoke"
      }
    }
    if ($RunTsOracle) {
      Invoke-GbbootEclOracleParity $efx
    }
    if ($ExpectSetupMarker) {
      Assert-SetupMarkerRaw $view "GBBOOT /E $Label smoke"
    }
    Write-Output "RESULT: GBBOOT /E /X $Label ECL map smoke PASS"
  }
  function Invoke-MenuResumeSmoke([string]$Dir, [string[]]$ExpectedWhoNames = @()) {
    $conf = Join-Path $run "_gbboot_menu_resume_engine_smoke.conf"
    $identity = Join-Path $run '_GBECL.IDN'
    Remove-Item $wall, $view, $efx, $res, $cout, $efxTxt, $resTxt, $identity, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
    if ($ExpectedWhoNames.Count -gt 0) {
      Write-SyntheticDokGbpr (Join-Path $run '_GBPARTY.GBP')
    }
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X /! /C 1 > C:\MENURES.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw 'GBBOOT menu-resume smoke did not exit'
    }
    $initial = [IO.File]::ReadAllBytes($efx)
    if ($initial.Length -ne 5920 -or [Text.Encoding]::ASCII.GetString($initial, 0, 4) -ne 'GBEF' -or
        [BitConverter]::ToUInt16($initial, 4) -ne 14 -or [BitConverter]::ToUInt16($initial, 8) -ne 2 -or
        [Text.Encoding]::ASCII.GetString($initial, 5750, 4) -ne 'GBMN' -or
        [Text.Encoding]::ASCII.GetString($initial, 5786, 4) -ne 'GBMT') {
      throw 'GBBOOT menu-resume smoke did not publish the v11 pending record'
    }
    Assert-GbEffectDump $efxTxt 'GBEF v000E' 'GBBOOT menu-resume smoke' -Version '000E'
    Assert-GbEffect $res 34 'GBBOOT menu-resume smoke'
    Assert-GbEffectDump $resTxt 'geo=0022' 'GBBOOT menu-resume smoke'
    $source = [IO.File]::ReadAllBytes((Join-Path $Dir 'ECL1.DAX'))
    $bound = [IO.File]::ReadAllBytes($identity)
    if ($bound.Length -ne (16 + $source.Length) -or
        [Text.Encoding]::ASCII.GetString($bound, 0, 4) -ne 'GBID' -or
        [BitConverter]::ToUInt16($bound, 4) -ne 1 -or
        [BitConverter]::ToUInt16($bound, 6) -ne 16 -or
        [BitConverter]::ToUInt32($bound, 8) -ne $source.Length -or
        -not ([Linq.Enumerable]::SequenceEqual([byte[]]$source, [byte[]]$bound[16..($bound.Length - 1)]))) {
      throw 'GBBOOT menu-resume smoke did not retain an exact ECL source identity sibling'
    }
    Assert-ViewRaw $view 'GBBOOT menu-resume smoke'
    if (Test-Path $cout) { throw 'GBBOOT menu-resume smoke retained a replayable menu outcome' }
    $menuOutput = Get-Content (Join-Path $run 'MENURES.TXT') -Raw
    if (([regex]::Matches($menuOutput, 'CCMENU: outcome written')).Count -ne 2) {
      throw 'GBBOOT menu-resume smoke did not execute CCMENU for both yielded menus'
    }
    foreach ($name in $ExpectedWhoNames) {
      if ($menuOutput -notmatch [regex]::Escape(". $name")) {
        throw "GBBOOT menu-resume smoke did not retain DoK roster name $name across cold resume"
      }
    }
    Write-Output 'RESULT: GBBOOT v14 menu yield/CCMENU/cold resume smoke PASS'
  }
  function Invoke-NwnChainExitSmoke([string]$Dir) {
    $conf = Join-Path $run "_gbboot_nwn_chain_exit_engine_smoke.conf"
    $outText = Join-Path $run "NWNCHAIN.TXT"
    Remove-Item $wall, $view, $efx, $comb, $cout, $combView, $cres, $efxTxt, $resTxt, $outText -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$Dir"
D:
C:\GBBOOT /E /X /A 7 > C:\NWNCHAIN.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X NWN ECL7 chain-exit smoke failed: DOSBox did not exit"
    }
    $text = Get-Content $outText -Raw
    if ($text -like "*native preview failed*") {
      throw "GBBOOT /E /X NWN ECL7 chain-exit smoke reported native preview failure"
    }
    Assert-GbEffectDump $efxTxt "status=0004 geo=FFFF chain=001D" "GBBOOT /E /X NWN ECL7 chain-exit smoke"
    Assert-GbEffectDump $efxTxt "@00 MONSTER id=002E count=0001 pic=002E" "GBBOOT /E /X NWN ECL7 chain-exit smoke"
    foreach ($path in @($wall, $view, $comb, $cout, $combView, $cres, $resTxt)) {
      if (Test-Path $path) {
        throw "GBBOOT /E /X NWN ECL7 chain-exit smoke wrote unexpected artifact $(Split-Path $path -Leaf)"
      }
    }
    Write-Output "RESULT: GBBOOT /E /X NWN ECL7 clean chain-exit smoke PASS"
  }
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$cokMount"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X CoK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X CoK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X CoK smoke"
  Assert-GbEffect $efx 34 "GBBOOT /E CoK smoke"
  Write-Output "RESULT: GBBOOT /E /X CoK engine smoke PASS"
  function Invoke-CcfpGbtsSmoke([string]$GbtsName, [string]$OutName, [string]$ExtraArgs = "") {
    $fpConf = Join-Path $run "_ccfp_gbts_$OutName.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$cokMount"
D:
C:\CCFP C:\_GBWALL.BIN /T /A 1 /U C:\$GbtsName $ExtraArgs /S C:\$OutName
exit
"@ | Set-Content -Path $fpConf -Encoding ASCII
    $proc = Start-DosBoxSmoke -Dosbox $dosbox -Conf $fpConf -Headless:$useHeadless
    if (-not $proc.WaitForExit(60000)) {
      try { $proc.Kill() } catch {}
      throw "CCFP GBTS smoke failed: DOSBox did not exit"
    }
    return Join-Path $run $OutName
  }
  $gbtsBaseView = Invoke-CcfpGbtsSmoke "MISSING.GBT" "GBTBASE.RAW"
  Assert-ViewRaw $gbtsBaseView "CCFP GBTS DOS-fallback smoke"
  [byte[]]$dosViewBytes = [IO.File]::ReadAllBytes($gbtsBaseView)
  $gbtsRealView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBTREAL.RAW"
  Assert-ViewRaw $gbtsRealView "CCFP real Amiga GBTS smoke"
  [byte[]]$gbtsRealViewBytes = [IO.File]::ReadAllBytes($gbtsRealView)
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes, [byte[]]$gbtsRealViewBytes)) {
    throw "CCFP real CoK GBTS should preserve verified DOS/Amiga block-203 parity"
  }
  $gbtsPairView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBTPAIR.RAW" "/V C:\DAA202.GBT"
  Assert-ViewRaw $gbtsPairView "CCFP two-resource GBTS smoke"
  [byte[]]$gbtsPairViewBytes = [IO.File]::ReadAllBytes($gbtsPairView)
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes, [byte[]]$gbtsPairViewBytes)) {
    throw "CCFP real CoK GBTS pair should preserve verified DOS/Amiga parity"
  }
  $gbtsToggleView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBTOGGLE.RAW" "/V C:\DAA202.GBT /J"
  Assert-ViewRaw $gbtsToggleView "CCFP live graphics toggle smoke"
  [byte[]]$gbtsToggleViewBytes = [IO.File]::ReadAllBytes($gbtsToggleView)
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes, [byte[]]$gbtsToggleViewBytes)) {
    throw "CCFP /J graphics toggle changed map pose, facing, or DOS presentation"
  }
  [byte[]]$mutatedGbts = [IO.File]::ReadAllBytes((Join-Path $run "DAA203.GBT"))
  for ($i = 12; $i -lt (12 + (45 * 64)); $i++) { $mutatedGbts[$i] = 14 }
  [IO.File]::WriteAllBytes((Join-Path $run "DAA203M.GBT"), $mutatedGbts)
  $gbtsMutView = Invoke-CcfpGbtsSmoke "DAA203M.GBT" "GBTMUT.RAW"
  Assert-ViewRaw $gbtsMutView "CCFP mutated GBTS smoke"
  [byte[]]$gbtsMutViewBytes = [IO.File]::ReadAllBytes($gbtsMutView)
  if ([Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes, [byte[]]$gbtsMutViewBytes)) {
    throw "CCFP GBTS smoke failed: altered logical block 203 did not affect rendered pixels"
  }
  [byte[]]$mutatedGbts202 = [IO.File]::ReadAllBytes($gbts202Path)
  for ($i = 12; $i -lt (12 + (38 * 64)); $i++) { $mutatedGbts202[$i] = 12 }
  $mutatedGbts202[12 + (38 * 64)] = 255
  [IO.File]::WriteAllBytes((Join-Path $run "DAA202M.GBT"), $mutatedGbts202)
  $gbtsMut202View = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBTMU202.RAW" "/V C:\DAA202M.GBT"
  Assert-ViewRaw $gbtsMut202View "CCFP mutated block-202 GBTS smoke"
  [byte[]]$gbtsMut202ViewBytes = [IO.File]::ReadAllBytes($gbtsMut202View)
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes[0..64003], [byte[]]$gbtsMut202ViewBytes[0..64003])) {
    throw "CCFP GBTS block-202 smoke unexpectedly changed unreferenced pixel indices"
  }
  if ([Linq.Enumerable]::SequenceEqual([byte[]]$dosViewBytes, [byte[]]$gbtsMut202ViewBytes)) {
    throw "CCFP GBTS smoke failed: altered logical block 202 did not affect presentation output"
  }
  # Current GBEF v9: GBES follows 64*20 events and 64*34 text records.
  # The old 3992-byte v7 allocation could not contain the marker at 5708.
  [byte[]]$setupGbef = New-Object byte[] 5750
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($setupGbef, 0)
  $setupGbef[4] = 9
  [Text.Encoding]::ASCII.GetBytes("GBES").CopyTo($setupGbef, 5708)
  $setupGbef[5712] = 9
  $setupGbef[5714] = 3
  $setupGbef[5716] = 5
  $setupGbef[5718] = 1
  [IO.File]::WriteAllBytes((Join-Path $run "SETUP5.GBE"), $setupGbef)
  $gbimFallbackView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBIMBASE.RAW" "/E C:\SETUP5.GBE /I C:\MISSING.GBI"
  $gbimRealView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "GBIMREAL.RAW" "/E C:\SETUP5.GBE /I C:\CPIC005.GBI"
  [byte[]]$gbimFallbackBytes = [IO.File]::ReadAllBytes($gbimFallbackView)
  [byte[]]$gbimRealBytes = [IO.File]::ReadAllBytes($gbimRealView)
  if ([Linq.Enumerable]::SequenceEqual([byte[]]$gbimFallbackBytes, [byte[]]$gbimRealBytes)) {
    throw "CCFP GBIM smoke failed: matched real CPIC art did not replace DOS marker"
  }
  Write-Output "RESULT: CCFP matched GBIM encounter art/fallback PASS"
  [byte[]]$pictureGbef = New-Object byte[] 5750
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($pictureGbef, 0)
  $pictureGbef[4] = 9
  [Text.Encoding]::ASCII.GetBytes("GBSX").CopyTo($pictureGbef, 2246)
  $pictureGbef[2250] = 1
  $pictureGbef[2252] = 0x0E
  $pictureGbef[2254] = 1
  $pictureGbef[2256] = 114
  [IO.File]::WriteAllBytes((Join-Path $run "PICT114.GBE"), $pictureGbef)
  $sceneView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "BIG114.RAW" "/E C:\PICT114.GBE /K C:\BIG114.GBI"
  [byte[]]$sceneViewBytes = [IO.File]::ReadAllBytes($sceneView)
  for ($y = 0; $y -lt 120; $y++) {
    for ($x = 0; $x -lt 304; $x++) {
      $expected = $sceneGbim[14 + ($y * 304) + $x]
      $actual = $sceneViewBytes[4 + (($y + 8) * 320) + $x + 8]
      if ($actual -ne $expected) {
        throw "CCFP BIGPIC scene smoke failed: pixel mismatch at ($x,$y), expected $expected got $actual"
      }
    }
  }
  $pictureGbef[2256] = 113
  [IO.File]::WriteAllBytes((Join-Path $run "PICT113.GBE"), $pictureGbef)
  $sceneFallbackView = Invoke-CcfpGbtsSmoke "DAA203.GBT" "BIGFALL.RAW" "/E C:\PICT113.GBE /K C:\BIG114.GBI"
  [byte[]]$sceneFallbackBytes = [IO.File]::ReadAllBytes($sceneFallbackView)
  if ([Linq.Enumerable]::SequenceEqual([byte[]]$sceneViewBytes[0..64003], [byte[]]$sceneFallbackBytes[0..64003])) {
    throw "CCFP BIGPIC scene smoke failed: nonmatching logical ID did not fall back to world"
  }
  Write-Output "RESULT: CCFP GBSX-selected BIGPIC scene pixels/fallback PASS"
  Copy-Item (Join-Path $run "CPIC005.GBI") (Join-Path $run "MULT0.GBI") -Force
  Copy-Item (Join-Path $run "CPIC002.GBI") (Join-Path $run "MULT1.GBI") -Force
  Copy-Item (Join-Path $run "CPIC005.GBI") (Join-Path $run "ONE0.GBI") -Force
  [byte[]]$combatIconGbef = New-Object byte[] 116
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($combatIconGbef, 0)
  $combatIconGbef[4] = 2
  $combatIconGbef[6] = 8
  $combatIconGbef[8] = 3
  $combatIconGbef[32] = 2
  $combatIconGbef[34] = 9
  $combatIconGbef[36] = 1
  $combatIconGbef[38] = 5
  $combatIconGbef[40] = 19
  $combatIconGbef[42] = 1
  $combatIconGbef[44] = 2
  [IO.File]::WriteAllBytes((Join-Path $run "COMBM.GBE"), $combatIconGbef)
  $combatIconConf = Join-Path $run "_cccombat_gbim.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
C:
CCCOMBAT /V C:\COMBM.GBE 4660 C:\COMBONE.RAW /I C:\ONE0.GBI
CCCOMBAT /V C:\COMBM.GBE 4660 C:\COMBMULT.RAW /I C:\MULT0.GBI
exit
"@ | Set-Content -Path $combatIconConf -Encoding ASCII
  $combatIconProc = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatIconConf -Headless:$useHeadless
  if (-not $combatIconProc.WaitForExit(60000)) {
    try { $combatIconProc.Kill() } catch {}
    throw "CCCOMBAT GBIM icon smoke failed: DOSBox did not exit"
  }
  [byte[]]$combatIconOne = [IO.File]::ReadAllBytes((Join-Path $run "COMBONE.RAW"))
  [byte[]]$combatIconMulti = [IO.File]::ReadAllBytes((Join-Path $run "COMBMULT.RAW"))
  if ([Linq.Enumerable]::SequenceEqual([byte[]]$combatIconOne[0..64003], [byte[]]$combatIconMulti[0..64003])) {
    throw "CCCOMBAT GBIM icon smoke failed: second cached picBlock did not change combat pixels"
  }
  Write-Output "RESULT: CCCOMBAT multi-picBlock GBIM cache/fallback PASS"
  Write-Output "RESULT: CCFP row-major GBTS consume/fallback boundary PASS"
  Invoke-MenuResumeSmoke $menuResumeDir
  Invoke-MenuResumeSmoke $menuResumeDokDir
  Invoke-MenuResumeSmoke $menuResumeDokRosterDir @('DOKALPHA', 'DOKBETA')
  Invoke-EclMapEngineSmoke "cok_amiga" "CoK /G 2 Amiga resource" $cokAmigaDir "/G 2" 34
  $gbbootGbts = Join-Path $run "_GBAMIGA.GBT"
  if (-not (Test-Path $gbbootGbts)) {
    throw "GBBOOT /E /X /G 2 failed: _GBAMIGA.GBT was not created"
  }
  [byte[]]$gbbootGbtsBytes = [IO.File]::ReadAllBytes($gbbootGbts)
  if ([Text.Encoding]::ASCII.GetString($gbbootGbtsBytes, 0, 4) -ne "GBTS" -or $gbbootGbtsBytes[6] -ne 203) {
    throw "GBBOOT /E /X /G 2 failed: invalid alternate resource bridge"
  }
  $gbbootGbts2 = Join-Path $run "_GBAMIG2.GBT"
  if (-not (Test-Path $gbbootGbts2) -or ([IO.File]::ReadAllBytes($gbbootGbts2))[6] -ne 202) {
    throw "GBBOOT /E /X /G 2 failed: second alternate resource bridge missing or invalid"
  }
  Write-Output "RESULT: GBBOOT /E /X /G 2 producer-consumer orchestration PASS"
  Invoke-EclMapEngineSmoke "cok_amiga_scene" "CoK /G 2 GBSX BIGPIC scene" $cokAmigaSceneDir "/G 2" 34
  $gbbootScene = Join-Path $run "_GBSCENE.GBI"
  if (-not (Test-Path $gbbootScene)) {
    throw "GBBOOT /E /X /G 2 scene failed: _GBSCENE.GBI was not created"
  }
  [byte[]]$gbbootSceneBytes = [IO.File]::ReadAllBytes($gbbootScene)
  if ([Text.Encoding]::ASCII.GetString($gbbootSceneBytes, 0, 4) -ne "GBIM" -or (Get-U16LE $gbbootSceneBytes 6) -ne 114 -or (Get-U16LE $gbbootSceneBytes 10) -ne 304 -or (Get-U16LE $gbbootSceneBytes 12) -ne 120) {
    throw "GBBOOT /E /X /G 2 scene failed: invalid GBSX-selected BIGPIC resource"
  }
  Write-Output "RESULT: GBBOOT GBSX-selected BIGPIC orchestration PASS"
  Invoke-EclMapEngineSmoke "cok_area2" "CoK /A 2" $cokDir "/A 2" 48
  Invoke-EclMapEngineSmoke "cok_area3" "CoK /A 3" $cokDir "/A 3" 80
  Invoke-EclMapEngineSmoke "cok_data" "CoK data-only" $cokDataDir "" 34
  Invoke-EclMapEngineSmoke "setup_distance" "CCECL /Q setup distance" $setupDistanceDir "/Q 7" 34 @("GBES setup sprite=0009 max=0003 pic=0005 distance=0002") $true
  Invoke-EclMapEngineSmoke "game_root_cok" "direct GAME CoK wrapper" $gameRootCokDir "" 34
  Invoke-EclMapEngineSmoke "game_root_dok" "direct GAME DoK wrapper" $gameRootDokDir "" 34
  Invoke-EclMapEngineSmoke "game_root_cok_data" "direct GAME CoK data-only wrapper" $gameRootCokDataDir "" 34
  Invoke-EclMapEngineSmoke "game_root_dok_data" "direct GAME DoK data-only wrapper" $gameRootDokDataDir "" 34
  Invoke-EclMapEngineSmoke "game_root_pool" "direct GAME Pool wrapper" $gameRootPoolDir "" 34
  Invoke-EclMapEngineSmoke "game_root_curse" "direct GAME Curse wrapper" $gameRootCurseDir "" 1
  Invoke-EclMapEngineSmoke "game_root_secret" "direct GAME Secret wrapper" $gameRootSecretDir "" 34
  Invoke-EclMapEngineSmoke "game_root_gateway" "direct GAME Gateway wrapper" $gameRootGatewayDir "" 34
  Invoke-EclMapEngineSmoke "game_root_treasures" "direct GAME Treasures wrapper" $gameRootTreasuresDir "" 34
  Invoke-EclMapEngineSmoke "game_root_pod" "direct GAME Pools of Darkness wrapper" $gameRootPodDir "" 34
  Invoke-EclMapEngineSmoke "game_root_buck" "direct GAME Buck Rogers Countdown wrapper" $gameRootBuckDir "" 34
  Invoke-EclMapEngineSmoke "game_root_matrix" "direct GAME Matrix Cubed wrapper" $gameRootMatrixDir "" 34
  Invoke-EclMapEngineSmoke "nested_curse" "nested Curse wrapper" $curseNestedNativeDir "" 1
  Invoke-EclMapEngineSmoke "nested_curse_area3" "nested Curse wrapper /A 3" $curseNestedNativeDir "/A 3" 16
  Invoke-EclMapEngineSmoke "nested_pool" "nested Pool wrapper" $poolNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_secret" "nested Secret wrapper" $secretNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_gateway" "nested Gateway wrapper" $gatewayNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_treasures" "nested Treasures wrapper" $treasuresNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_pod" "nested Pools of Darkness wrapper" $podNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_buck" "nested Buck Rogers Countdown wrapper" $buckNestedDir "" 34
  Invoke-EclMapEngineSmoke "nested_matrix" "nested Matrix Cubed wrapper" $matrixNestedDir "" 34

  # T1d: the REAL Matrix Cubed install must start on the retail chain
  # (ECL1 block 16 -> NEWECL 19, GEO1 block 17; docs/engine/research/
  # matrix-cubed-start-route.md), not the shared entry-34 smoke start, and
  # must be named Matrix Cubed even though it carries MON0CHA/WALLDEF1 (it used
  # to be swallowed by the Countdown data-only profile).  SKIPs without the
  # git-ignored extraction; the synthetic nested_matrix case above covers the
  # block-16-absent fallback to entry 34.
  $matrixRealSrc = $null
  $matrixRoots = @($root)
  if ($root -match '^(.*)\\.claude\worktrees\[^\]+$') { $matrixRoots += $Matches[1] }
  foreach ($mr in $matrixRoots) {
    $cand = Join-Path $mr 'matrixcubed_extracted\BuckRogers2\c\Matrix'
    if ((Test-Path (Join-Path $cand 'ECL1.DAX')) -and (Test-Path (Join-Path $cand 'GEO1.DAX')) -and (Test-Path (Join-Path $cand 'START.EXE'))) { $matrixRealSrc = $cand; break }
  }
  if (-not $matrixRealSrc) {
    Write-Output 'SKIP: GBBOOT /E /X Matrix Cubed real start route (matrixcubed_extracted absent)'
  } else {
    $matrixRealMount = New-RetailStage -Source $matrixRealSrc -Name 'matrix-real'
    $conf = Join-Path $run '_gbboot_matrix_real_start.conf'
    $mOut = Join-Path $run 'MATRIXR.TXT'
    $mW17 = Join-Path $run 'MW17.BIN'
    $mW34 = Join-Path $run 'MW34.BIN'
    Remove-Item $wall, $view, $efx, $efxTxt, $mOut, $mW17, $mW34, (Join-Path $run '_GBPARTY.GBP'), (Join-Path $run '_GBSEED.BIN') -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$matrixRealMount"
D:
C:\GBBOOT /E /X > C:\MATRIXR.TXT
copy C:\_GBWALL.BIN C:\MWBOOT.BIN > nul
C:\CCGEO /B GEO1.DAX 17 C:\MW17.BIN > nul
C:\CCGEO /B GEO1.DAX 34 C:\MW34.BIN > nul
exit
"@ | Set-Content -Path $conf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(90000)) { try { $p.Kill() } catch {}; throw 'GBBOOT Matrix real start route: DOSBox did not exit' }
    $mText = Get-Content $mOut -Raw
    if ($mText -notmatch 'game:\s+Buck Rogers: Matrix Cubed') { throw "GBBOOT Matrix real start route: install was not named Matrix Cubed: $mText" }
    if ($mText -notmatch 'CCECL ECL1\.DAX entry 16 -> CCGEO /B GEO1\.DAX') { throw "GBBOOT Matrix real start route: plan is not ECL1 entry 16: $mText" }
    Assert-GbEffectDump $efxTxt 'area=0013' 'GBBOOT Matrix real start route (NEWECL 19 reached)'
    foreach ($f in @((Join-Path $run 'MWBOOT.BIN'), $mW17, $mW34)) { if (-not (Test-Path $f)) { throw "GBBOOT Matrix real start route did not produce $(Split-Path -Leaf $f)" } }
    $b0 = [IO.File]::ReadAllBytes((Join-Path $run 'MWBOOT.BIN'))
    $b17 = [IO.File]::ReadAllBytes($mW17)
    $b34 = [IO.File]::ReadAllBytes($mW34)
    if ($b17.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($b17, 0, 4) -ne 'WGRD') { throw 'GBBOOT Matrix real start route: CCGEO control for GEO 17 is not a WGRD' }
    if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$b0, [byte[]]$b17)) { throw 'GBBOOT Matrix real start route: boot wall is not GEO1 block 17' }
    if ([Linq.Enumerable]::SequenceEqual([byte[]]$b17, [byte[]]$b34)) { throw 'GBBOOT Matrix real start route: GEO 17 and GEO 34 walls are indistinguishable, so the check cannot discriminate' }
    Write-Output 'RESULT: GBBOOT /E /X Matrix Cubed real start route (ECL1 16 -> area 19, GEO1 17) PASS'
  }

  $dokDir = Join-Path $root "Death Knights of Krynn"
  $dokMount = New-RetailStage -Source $dokDir
  # DoK with its real party yields the PARTYSTRENGTH welcome ACK and GBBOOT hands it
  # to CCFP even under /X; plain DOSBox never sends the key CCFP waits for. Drive it
  # through focusless GameLink with the identity-checked Enter helper.
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
  $dbxExe = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
  if (-not (Test-Path -LiteralPath $dbxExe)) { throw "GBBOOT /E /X DoK smoke needs DOSBox-X for the GameLink ACK: $dbxExe" }
  Invoke-DokGameLinkAckFlow -DbxExe $dbxExe -BuildDir $run -GameDir $dokMount `
    -GuestCommand 'C:\GBBOOT /E /X' `
    -DosLogFile (Join-Path $run 'gbboot-dok-smoke-files.log') `
    -CaptureRoot (Join-Path $run 'gbboot-dok-smoke-gamelink') -TimeoutSeconds 45
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X DoK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X DoK smoke"
  Assert-GbEffect $efx 34 "GBBOOT /E DoK smoke"
  Write-Output "RESULT: GBBOOT /E /X DoK engine smoke PASS"
  $dokMountA = New-RetailStage -Source $dokDir -Name 'dok_area_smoke'
  Invoke-EclMapEngineSmoke "dok_area2" "DoK /A 2" $dokMountA "/A 2" 48 -DokAck
  Invoke-EclMapEngineSmoke "dok_area3" "DoK /A 3" $dokMountA "/A 3" 80 -DokAck
  Invoke-EclMapEngineSmoke "dok_data" "DoK data-only" $dokDataDir "" 34

  Invoke-CombatHandoffBatch @(
    @{ Slug = "combat"; Label = "combat"; Dir = $combatCokDir; ExpectedTrace = $combatCokExpected; ExpectedOutcome = "party"; ExpectedResultOutcome = 0 },
    @{ Slug = "combat_command"; Label = "combat command /C G"; Dir = $combatCokDir; ExtraArgs = " /C G"; ExpectedTrace = $combatCokCommandExpected },
    @{ Slug = "combat_command_party_flee"; Label = "combat command /C P"; Dir = $combatCokDir; ExtraArgs = " /C P"; ExpectedTrace = $combatCokPartyFleeExpected; ExpectedOutcome = "flee"; ExpectedResultOutcome = 3; ExpectedResultConditions = @(3, 3) },
    @{ Slug = "combat_dok"; Label = "DoK compact combat"; Dir = $combatDokDir; ExpectedTrace = @(); ExpectedTraceContains = $combatDokTraceContains; ExpectedOutcome = "enemy" },
    @{ Slug = "pool_combat_default"; Label = "Pool default combat"; Dir = $combatPoolDir },
    @{ Slug = "secret_combat_default"; Label = "Secret default combat"; Dir = $combatSecretDir },
    @{ Slug = "gateway_combat_default"; Label = "Gateway default combat"; Dir = $combatGatewayDir },
    @{ Slug = "treasures_combat_default"; Label = "Treasures default combat"; Dir = $combatTreasuresDir },
    @{ Slug = "pod_combat_default"; Label = "Pools of Darkness default combat"; Dir = $combatPodDir },
    @{ Slug = "buck_combat_default"; Label = "Buck Rogers Countdown default combat"; Dir = $combatBuckDir },
    @{ Slug = "matrix_combat_default"; Label = "Buck Rogers Matrix default combat"; Dir = $combatMatrixDir },
    @{ Slug = "nwn_combat_default"; Label = "Neverwinter Nights default combat"; Dir = $combatNwnDir },
    @{ Slug = "nwn_area7_seeded_combat"; Label = "Neverwinter Nights /A 7 seeded combat"; Dir = $nwnDir; ExtraArgs = " /A 7" },
    @{ Slug = "pool_combat"; Label = "Pool /B 34 combat"; Dir = $combatPoolDir; ExtraArgs = " /B 34" },
    @{ Slug = "pool_combat_native_party"; Label = "Pool /B 34 native-created party combat"; Dir = $combatPoolDir; ExtraArgs = " /B 34 /R POOL_CLERIC C /R POOL_FIGHTER F /R POOL_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "secret_combat"; Label = "Secret /B 34 combat"; Dir = $combatSecretDir; ExtraArgs = " /B 34" },
    @{ Slug = "secret_combat_native_party"; Label = "Secret /B 34 native-created party combat"; Dir = $combatSecretDir; ExtraArgs = " /B 34 /R SEC_CLERIC C /R SEC_FIGHTER F /R SEC_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "gateway_combat"; Label = "Gateway /B 34 combat"; Dir = $combatGatewayDir; ExtraArgs = " /B 34" },
    @{ Slug = "gateway_combat_native_party"; Label = "Gateway /B 34 native-created party combat"; Dir = $combatGatewayDir; ExtraArgs = " /B 34 /R GATE_CLERIC C /R GATE_FIGHTER F /R GATE_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "treasures_combat"; Label = "Treasures /B 34 combat"; Dir = $combatTreasuresDir; ExtraArgs = " /B 34" },
    @{ Slug = "treasures_combat_native_party"; Label = "Treasures /B 34 native-created party combat"; Dir = $combatTreasuresDir; ExtraArgs = " /B 34 /R TREAS_CLERIC C /R TREAS_FIGHTER F /R TREAS_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "pod_combat"; Label = "Pools of Darkness /B 34 combat"; Dir = $combatPodDir; ExtraArgs = " /B 34" },
    @{ Slug = "pod_combat_native_party"; Label = "Pools of Darkness /B 34 native-created party combat"; Dir = $combatPodDir; ExtraArgs = " /B 34 /R POD_CLERIC C /R POD_FIGHTER F /R POD_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "buck_combat"; Label = "Buck Rogers Countdown /B 34 combat"; Dir = $combatBuckDir; ExtraArgs = " /B 34" },
    @{ Slug = "buck_combat_native_party"; Label = "Buck Rogers Countdown /B 34 native-created party combat"; Dir = $combatBuckDir; ExtraArgs = " /B 34 /R BUCK_CLERIC C /R BUCK_FIGHTER F /R BUCK_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "matrix_combat"; Label = "Buck Rogers Matrix /B 34 combat"; Dir = $combatMatrixDir; ExtraArgs = " /B 34" },
    @{ Slug = "matrix_combat_native_party"; Label = "Buck Rogers Matrix /B 34 native-created party combat"; Dir = $combatMatrixDir; ExtraArgs = " /B 34 /R MAT_CLERIC C /R MAT_FIGHTER F /R MAT_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) },
    @{ Slug = "nwn_combat_native_party"; Label = "Neverwinter Nights native-created party combat"; Dir = $combatNwnDir; ExtraArgs = " /R NWN_CLERIC C /R NWN_FIGHTER F /R NWN_MAGE M"; ExpectedTrace = @(); ExpectedTraceContains = @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -"); ExpectedOutcome = "enemy"; ExpectedResultOutcome = 1; ExpectedResultConditions = @(1, 1, 1); ExpectedResultHp = @(0, 0, -3); ExpectedResultMaxHp = @(8, 10, 4) }
  )
  foreach ($case in @(
    @{ Slug = "pool_title_native_party_combat"; Label = "Pool title/native-party combat"; Dir = $combatPoolDir; ExtraArgs = " /B 34 /R POOL_CLERIC C /R POOL_FIGHTER F /R POOL_MAGE M" },
    @{ Slug = "secret_title_native_party_combat"; Label = "Secret title/native-party combat"; Dir = $combatSecretDir; ExtraArgs = " /B 34 /R SEC_CLERIC C /R SEC_FIGHTER F /R SEC_MAGE M" },
    @{ Slug = "gateway_title_native_party_combat"; Label = "Gateway title/native-party combat"; Dir = $combatGatewayDir; ExtraArgs = " /B 34 /R GATE_CLERIC C /R GATE_FIGHTER F /R GATE_MAGE M" },
    @{ Slug = "treasures_title_native_party_combat"; Label = "Treasures title/native-party combat"; Dir = $combatTreasuresDir; ExtraArgs = " /B 34 /R TREAS_CLERIC C /R TREAS_FIGHTER F /R TREAS_MAGE M" },
    @{ Slug = "pod_title_native_party_combat"; Label = "Pools of Darkness title/native-party combat"; Dir = $combatPodDir; ExtraArgs = " /B 34 /R POD_CLERIC C /R POD_FIGHTER F /R POD_MAGE M" },
    @{ Slug = "buck_title_native_party_combat"; Label = "Buck Rogers Countdown title/native-party combat"; Dir = $combatBuckDir; ExtraArgs = " /B 34 /R BUCK_CLERIC C /R BUCK_FIGHTER F /R BUCK_MAGE M" },
    @{ Slug = "matrix_title_native_party_combat"; Label = "Buck Rogers Matrix title/native-party combat"; Dir = $combatMatrixDir; ExtraArgs = " /B 34 /R MAT_CLERIC C /R MAT_FIGHTER F /R MAT_MAGE M" },
    @{ Slug = "nwn_title_native_party_combat"; Label = "Neverwinter Nights title/native-party combat"; Dir = $combatNwnDir; ExtraArgs = " /R NWN_CLERIC C /R NWN_FIGHTER F /R NWN_MAGE M" }
  )) {
    Invoke-TitleCombatHandoffSmoke $case.Slug $case.Label $case.Dir $case.ExtraArgs "TAIL= /A TITLE.DAX 1" @() @("1 init p2 - - - - - - -", "6 end - enemy - - - - - -") "enemy" 1 @(1, 1, 1) @(0, 0, -3) @(8, 10, 4)
  }
  Remove-Item (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -Force -ErrorAction SilentlyContinue
  Invoke-CombatHandoffSmoke "combat_roster_writeback" "combat roster writeback" $combatCokRosterDir "" $combatRosterExpected @() "party" 0 @(0, 0) @(14, 5) @(14, 12)
  Assert-GbprCokHp (Join-Path $run "_GBPARTY.GBP") "GBBOOT /E combat roster writeback smoke" @(14, 5)
  Assert-GbprCokXp (Join-Path $run "_GBPARTY.GBP") "GBBOOT /E combat roster writeback smoke" @(65575, 131125)
  Assert-CokSaveHpXp (Join-Path $combatCokRosterDir "SAVE\CHRDATA1.SAV") "GBBOOT /E combat source-save writeback smoke" 14 65575
  Assert-CokSaveHpXp (Join-Path $combatCokRosterDir "SAVE\CHRDATA2.SAV") "GBBOOT /E combat source-save writeback smoke" 5 131125
  Assert-CokFlatCombatXp (Join-Path $combatCokRosterDir "SAVE\CHRDATA1.SAV") "GBBOOT /E combat source-save preserves static XP smoke" 100
  Assert-CokFlatCombatXp (Join-Path $combatCokRosterDir "SAVE\CHRDATA2.SAV") "GBBOOT /E combat source-save preserves static XP smoke" 200
  Write-SyntheticDokGbpr (Join-Path $run "_GBPARTY.GBP")
  Invoke-CombatHandoffSmoke "combat_dok_roster_writeback" "DoK compact roster writeback" $combatDokRosterDir "" @() @() "enemy" -PreserveRoster
  Assert-GbprDokCondition (Join-Path $run "_GBPARTY.GBP") (Join-Path $run "_GBCR.BIN") "GBBOOT /E DoK compact roster writeback smoke"
  Invoke-CombatSnapshotSmoke "combat_snapshot" "combat" $combatCokDir
  Copy-Item (Join-Path $amigaTilesDir "8X8D1.DAA") (Join-Path $combatCokDir "8X8D1.DAA") -Force
  Copy-Item (Join-Path $amigaTilesDir "CPIC1.DAA") (Join-Path $combatCokDir "CPIC1.DAA") -Force
  Invoke-CombatSnapshotSmoke "combat_amiga_snapshot" "combat Amiga CPIC" $combatCokDir " /G 2"
  $combatGbim = Join-Path $run "_GBCP0.GBI"
  $combatGbim2 = Join-Path $run "_GBCP1.GBI"
  if (-not (Test-Path $combatGbim) -or (Get-U16LE ([IO.File]::ReadAllBytes($combatGbim)) 6) -ne 5 -or
      -not (Test-Path $combatGbim2) -or (Get-U16LE ([IO.File]::ReadAllBytes($combatGbim2)) 6) -ne 2) {
    throw "GBBOOT /E /X /G 2 combat failed: deduplicated CPIC GBIM series was not produced"
  }
  Write-Output "RESULT: GBBOOT multi-icon combat CPIC orchestration PASS"
  Invoke-CombatHandoffSmoke "combat_area2" "combat MON2CHA" $combatArea2Dir
  Invoke-CombatThenMapSmoke "combat_map" "combat-to-map" $combatMapDir
  Invoke-CombatResumeMapSmoke "combat_resume_map" "combat-outcome-resume-map" $combatResumeMapDir

  $dqkDir = Join-Path $root "The Dark Queen of Krynn"
  $dqkMount = New-RetailStage -Source $dqkDir
  $hlibGeoArtSmoke = Join-Path $run "hlib-geo-art-smoke"
  New-Item -ItemType Directory -Force $hlibGeoArtSmoke | Out-Null
  Write-SyntheticGeoGlb (Join-Path $hlibGeoArtSmoke "GEO.GLB") 11 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $hlibGeoArtSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $hlibGeoArtSmoke "8X8DC.TLB") -Force
  $hlibGeoDbOnlySmoke = Join-Path $run "hlib-geo-db-only-smoke"
  New-Item -ItemType Directory -Force $hlibGeoDbOnlySmoke | Out-Null
  Write-SyntheticGeoGlb (Join-Path $hlibGeoDbOnlySmoke "GEO.GLB") 3 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $hlibGeoDbOnlySmoke "8X8DB.TLB") -Force
  $fruaGeoArtSmoke = Join-Path $run "frua-geo-art-smoke"
  New-Item -ItemType Directory -Force $fruaGeoArtSmoke | Out-Null
  New-Item -ItemType File -Force (Join-Path $fruaGeoArtSmoke "CKIT.EXE") | Out-Null
  New-Item -ItemType File -Force (Join-Path $fruaGeoArtSmoke "SCRIPT.GLB") | Out-Null
  Write-SyntheticGeoGlb (Join-Path $fruaGeoArtSmoke "GEO.GLB") 11 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $fruaGeoArtSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $fruaGeoArtSmoke "8X8DC.TLB") -Force
  $fruaScriptEclSmoke = Join-Path $run "frua-script-ecl-smoke"
  New-Item -ItemType Directory -Force $fruaScriptEclSmoke | Out-Null
  New-Item -ItemType File -Force (Join-Path $fruaScriptEclSmoke "CKIT.EXE") | Out-Null
  Write-SyntheticEclGlbPieces (Join-Path $fruaScriptEclSmoke "SCRIPT.GLB") 1
  Write-SyntheticGeoGlb (Join-Path $fruaScriptEclSmoke "GEO.GLB") 3 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $fruaScriptEclSmoke "8X8DB.TLB") -Force

  $gen1ArtSmoke = Join-Path $run "gen1-art-smoke"
  New-Item -ItemType Directory -Force $gen1ArtSmoke | Out-Null
  Copy-Item (Join-Path $cokDir "GEO1.DAX") (Join-Path $gen1ArtSmoke "GEO1.DAX") -Force
  Copy-Item (Join-Path $cokDir "WALLDEF1.DAX") (Join-Path $gen1ArtSmoke "WALLDEF1.DAX") -Force
  Copy-Item (Join-Path $cokDir "8X8D1.DAX") (Join-Path $gen1ArtSmoke "8X8D1.DAX") -Force
  $coabRawArtSmoke = Join-Path $run "coab-raw-art-smoke"
  $gatewayCoabArtSmoke = Join-Path $run "gateway-coab-art-smoke"
  $coabData = Join-Path $root "coab_extracted\Data"
  $coabMount = New-RetailStage -Source $coabData -Name 'coab-data'
  if ((Test-Path (Join-Path $coabData "GEO2.DAX")) -and (Test-Path (Join-Path $coabData "WALLDEF2.DAX")) -and (Test-Path (Join-Path $coabData "8X8D1.DAX")) -and (Test-Path (Join-Path $coabData "8X8D2.DAX"))) {
    New-Item -ItemType Directory -Force $coabRawArtSmoke | Out-Null
    Copy-Item (Join-Path $coabData "GEO2.DAX") (Join-Path $coabRawArtSmoke "GEO2.DAX") -Force
    Copy-Item (Join-Path $coabData "WALLDEF2.DAX") (Join-Path $coabRawArtSmoke "WALLDEF2.DAX") -Force
    Copy-Item (Join-Path $coabData "8X8D1.DAX") (Join-Path $coabRawArtSmoke "8X8D1.DAX") -Force
    Copy-Item (Join-Path $coabData "8X8D2.DAX") (Join-Path $coabRawArtSmoke "8X8D2.DAX") -Force
    New-Item -ItemType Directory -Force $gatewayCoabArtSmoke | Out-Null
    New-Item -ItemType File -Force (Join-Path $gatewayCoabArtSmoke "GAME.EXE") | Out-Null
    New-Item -ItemType File -Force (Join-Path $gatewayCoabArtSmoke "GAME.CFG") | Out-Null
    New-Item -ItemType File -Force (Join-Path $gatewayCoabArtSmoke "ZOUNDS.DAX") | Out-Null
    Copy-Item (Join-Path $coabData "GEO2.DAX") (Join-Path $gatewayCoabArtSmoke "GEO2.DAX") -Force
    Copy-Item (Join-Path $coabData "WALLDEF2.DAX") (Join-Path $gatewayCoabArtSmoke "WALLDEF2.DAX") -Force
    Copy-Item (Join-Path $coabData "8X8D1.DAX") (Join-Path $gatewayCoabArtSmoke "8X8D1.DAX") -Force
    Copy-Item (Join-Path $coabData "8X8D2.DAX") (Join-Path $gatewayCoabArtSmoke "8X8D2.DAX") -Force
  }

  Invoke-EclMapEngineSmoke "frua_script_ecl_override" "FRUA SCRIPT.GLB /B 1 override" $fruaScriptEclSmoke "/B 1" 2

  $defaultBroadEclCases = @(
    @{ Slug = "pool_ecl_default"; Label = "Pool default ECL start"; Dir = $poolEclDir },
    @{ Slug = "secret_ecl_default"; Label = "Secret default ECL start"; Dir = $secretEclDir },
    @{ Slug = "gateway_ecl_default"; Label = "Gateway default ECL start"; Dir = $gatewayEclDir },
    @{ Slug = "treasures_ecl_default"; Label = "Treasures default ECL start"; Dir = $treasuresEclDir },
    @{ Slug = "pod_ecl_default"; Label = "Pools of Darkness default ECL start"; Dir = $podEclDir },
    @{ Slug = "buck_ecl_default"; Label = "Buck Rogers Countdown default ECL start"; Dir = $buckEclDir },
    @{ Slug = "matrix_ecl_default"; Label = "Buck Rogers Matrix default ECL start"; Dir = $matrixEclDir }
  )
  foreach ($case in $defaultBroadEclCases) {
    Invoke-EclMapEngineSmoke $case.Slug $case.Label $case.Dir "" 34
  }
  Invoke-EclMapEngineSmoke "nwn_ecl_default" "Neverwinter Nights default ECL start" $nwnDir "" 1
  Invoke-EclMapEngineSmoke "nwn_area1" "Neverwinter Nights /A 1 ECL start" $nwnDir "/A 1" 10
  Invoke-EclMapEngineSmoke "nwn_area2" "Neverwinter Nights /A 2 ECL start" $nwnDir "/A 2" 20
  Invoke-EclMapEngineSmoke "nwn_area3" "Neverwinter Nights /A 3 ECL start" $nwnDir "/A 3" 30
  Invoke-EclMapEngineSmoke "nwn_data_ecl_default" "Neverwinter Nights data-only ECL start" $nwnDataDir "" 1
  Invoke-NwnChainExitSmoke $nwnChainDir

  $dataBroadEclCases = @(
    @{ Slug = "pool_data_ecl"; Label = "Pool data-only ECL start"; Dir = $poolDataEclDir },
    @{ Slug = "secret_data_ecl"; Label = "Secret data-only ECL start"; Dir = $secretDataEclDir },
    @{ Slug = "gateway_data_ecl"; Label = "Gateway data-only ECL start"; Dir = $gatewayDataEclDir },
    @{ Slug = "treasures_data_ecl"; Label = "Treasures data-only ECL start"; Dir = $treasuresDataEclDir },
    @{ Slug = "pod_data_ecl"; Label = "Pools of Darkness data-only ECL start"; Dir = $podDataEclDir },
    @{ Slug = "matrix_data_ecl"; Label = "Buck Rogers Matrix data-only ECL start"; Dir = $matrixDataEclDir },
    @{ Slug = "game_root_pool_data_ecl"; Label = "direct GAME Pool data-only ECL wrapper"; Dir = $gameRootPoolDataEclDir },
    @{ Slug = "game_root_secret_data_ecl"; Label = "direct GAME Secret data-only ECL wrapper"; Dir = $gameRootSecretDataEclDir },
    @{ Slug = "game_root_gateway_data_ecl"; Label = "direct GAME Gateway data-only ECL wrapper"; Dir = $gameRootGatewayDataEclDir },
    @{ Slug = "game_root_treasures_data_ecl"; Label = "direct GAME Treasures data-only ECL wrapper"; Dir = $gameRootTreasuresDataEclDir },
    @{ Slug = "game_root_pod_data_ecl"; Label = "direct GAME Pools of Darkness data-only ECL wrapper"; Dir = $gameRootPodDataEclDir },
    @{ Slug = "game_root_matrix_data_ecl"; Label = "direct GAME Matrix Cubed data-only ECL wrapper"; Dir = $gameRootMatrixDataEclDir },
    @{ Slug = "nested_pool_data_ecl"; Label = "nested Pool data-only ECL wrapper"; Dir = $poolNestedDataEclDir },
    @{ Slug = "nested_secret_data_ecl"; Label = "nested Secret data-only ECL wrapper"; Dir = $secretNestedDataEclDir },
    @{ Slug = "nested_gateway_data_ecl"; Label = "nested Gateway data-only ECL wrapper"; Dir = $gatewayNestedDataEclDir },
    @{ Slug = "nested_treasures_data_ecl"; Label = "nested Treasures data-only ECL wrapper"; Dir = $treasuresNestedDataEclDir },
    @{ Slug = "nested_pod_data_ecl"; Label = "nested Pools of Darkness data-only ECL wrapper"; Dir = $podNestedDataEclDir },
    @{ Slug = "nested_matrix_data_ecl"; Label = "nested Matrix Cubed data-only ECL wrapper"; Dir = $matrixNestedDataEclDir }
  )
  foreach ($case in $dataBroadEclCases) {
    Invoke-EclMapEngineSmoke $case.Slug $case.Label $case.Dir "" 34
  }

  Invoke-EclMapEngineSmoke "pool_ecl_override" "Pool /B 34 ECL override" $poolEclDir "/B 34" 34 -RunTsOracle
  Invoke-EclMapEngineSmoke "secret_ecl_override" "Secret /B 34 ECL override" $secretEclDir "/B 34" 34
  Invoke-EclMapEngineSmoke "gateway_ecl_override" "Gateway /B 34 ECL override" $gatewayEclDir "/B 34" 34
  Invoke-EclMapEngineSmoke "treasures_ecl_override" "Treasures /B 34 ECL override" $treasuresEclDir "/B 34" 34
  Invoke-EclMapEngineSmoke "pod_ecl_override" "Pools of Darkness /B 34 ECL override" $podEclDir "/B 34" 34
  Invoke-EclMapEngineSmoke "buck_ecl_override" "Buck Rogers Countdown /B 34 ECL override" $buckEclDir "/B 34" 34
  Invoke-EclMapEngineSmoke "matrix_ecl_override" "Buck Rogers Matrix /B 34 ECL override" $matrixEclDir "/B 34" 34
  $mapPreviewCases = @(
    @{ Slug = "pool"; Label = "Pool"; Dir = $poolGeoDir },
    @{ Slug = "pool_area2"; Label = "Pool /A 2"; Dir = $poolArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_pool_data"; Label = "direct GAME Pool data-only wrapper"; Dir = $gameRootPoolDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_pool"; Label = "nested Pool wrapper"; Dir = $poolNestedDir },
    @{ Slug = "nested_pool_area2"; Label = "nested Pool wrapper /A 2"; Dir = $poolNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "secret"; Label = "Secret"; Dir = $secretGeoDir },
    @{ Slug = "secret_area2"; Label = "Secret /A 2"; Dir = $secretArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_curse_data"; Label = "direct GAME Curse data-only wrapper"; Dir = $gameRootCurseDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "game_root_secret_data"; Label = "direct GAME Secret data-only wrapper"; Dir = $gameRootSecretDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_secret"; Label = "nested Secret wrapper"; Dir = $secretNestedDir },
    @{ Slug = "nested_secret_area2"; Label = "nested Secret wrapper /A 2"; Dir = $secretNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "gateway"; Label = "Gateway"; Dir = $gatewayGeoDir },
    @{ Slug = "gateway_area2"; Label = "Gateway /A 2"; Dir = $gatewayArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_gateway"; Label = "direct GAME Gateway wrapper"; Dir = $gameRootGatewayDir },
    @{ Slug = "game_root_gateway_data"; Label = "direct GAME Gateway data-only wrapper"; Dir = $gameRootGatewayDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_gateway"; Label = "nested Gateway wrapper"; Dir = $gatewayNestedDir },
    @{ Slug = "nested_gateway_area2"; Label = "nested Gateway wrapper /A 2"; Dir = $gatewayNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "gateway2"; Label = "Gateway GEO2"; Dir = $gatewayGeo2Dir },
    @{ Slug = "treasures"; Label = "Treasures"; Dir = $treasuresGeoDir },
    @{ Slug = "treasures_area2"; Label = "Treasures /A 2"; Dir = $treasuresArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_treasures_data"; Label = "direct GAME Treasures data-only wrapper"; Dir = $gameRootTreasuresDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_treasures"; Label = "nested Treasures wrapper"; Dir = $treasuresNestedDir },
    @{ Slug = "nested_treasures_area2"; Label = "nested Treasures wrapper /A 2"; Dir = $treasuresNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "pod"; Label = "Pools of Darkness"; Dir = $podGeoDir },
    @{ Slug = "pod_area2"; Label = "Pools of Darkness /A 2"; Dir = $podArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_pod_data"; Label = "direct GAME Pools of Darkness data-only wrapper"; Dir = $gameRootPodDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_pod"; Label = "nested Pools of Darkness wrapper"; Dir = $podNestedDir },
    @{ Slug = "nested_pod_area2"; Label = "nested Pools of Darkness wrapper /A 2"; Dir = $podNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "buck"; Label = "Buck Rogers Countdown"; Dir = $buckGeoDir },
    @{ Slug = "buck_area2"; Label = "Buck Rogers Countdown /A 2"; Dir = $buckArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_buck"; Label = "direct GAME Buck Rogers Countdown wrapper"; Dir = $gameRootBuckDir },
    @{ Slug = "nested_buck"; Label = "nested Buck Rogers Countdown wrapper"; Dir = $buckNestedDir },
    @{ Slug = "nested_buck_area2"; Label = "nested Buck Rogers Countdown wrapper /A 2"; Dir = $buckNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "matrix"; Label = "Buck Rogers Matrix"; Dir = $matrixGeoDir },
    @{ Slug = "matrix_area2"; Label = "Buck Rogers Matrix /A 2"; Dir = $matrixArea2Dir; ExtraArgs = "/A 2" },
    @{ Slug = "game_root_matrix"; Label = "direct GAME Matrix Cubed wrapper"; Dir = $gameRootMatrixDir },
    @{ Slug = "game_root_matrix_data"; Label = "direct GAME Matrix Cubed data-only wrapper"; Dir = $gameRootMatrixDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_matrix"; Label = "nested Matrix Cubed wrapper"; Dir = $matrixNestedDir },
    @{ Slug = "nested_matrix_area2"; Label = "nested Matrix Cubed wrapper /A 2"; Dir = $matrixNestedDir; ExtraArgs = "/A 2" },
    @{ Slug = "buck"; Label = "Buck Countdown"; Dir = $buckGeoDir },
    @{ Slug = "matrix"; Label = "Matrix Cubed"; Dir = $matrixGeoDir },
    @{ Slug = "cursecfgdata"; Label = "Curse marker data-only"; Dir = $curseCfgDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "pooldata"; Label = "Pool data-only"; Dir = $poolDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "secretdata"; Label = "Secret data-only"; Dir = $secretDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "gatewaydata"; Label = "Gateway data-only"; Dir = $gatewayDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "treasuresdata"; Label = "Treasures data-only"; Dir = $treasuresDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "poddata"; Label = "Pools of Darkness data-only"; Dir = $podDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_pooldata"; Label = "nested Pool data-only wrapper"; Dir = $poolNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_cursecfgdata"; Label = "nested Curse marker data-only wrapper"; Dir = $curseNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_secretdata"; Label = "nested Secret data-only wrapper"; Dir = $secretNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_gatewaydata"; Label = "nested Gateway data-only wrapper"; Dir = $gatewayNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_treasuresdata"; Label = "nested Treasures data-only wrapper"; Dir = $treasuresNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_poddata"; Label = "nested Pools of Darkness data-only wrapper"; Dir = $podNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "matrixdata"; Label = "Matrix Cubed data-only"; Dir = $matrixDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "nested_matrixdata"; Label = "nested Matrix Cubed data-only wrapper"; Dir = $matrixNestedDataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "gen1data"; Label = "Gen1 data-only"; Dir = $gen1DataDir; AssertNoGameSnapshot = $true },
    @{ Slug = "gen1data2"; Label = "Gen1 data-only /A 2"; Dir = $gen1DataDir; ExtraArgs = "/A 2" },
    @{ Slug = "gen1geo2data"; Label = "Gen1 GEO2-only data"; Dir = $gen1Geo2DataDir },
    @{ Slug = "gen1art"; Label = "Gen1 DAX data-only with texture art"; Dir = $gen1ArtSmoke }
  )
  if (Test-Path $coabRawArtSmoke) {
    $mapPreviewCases += @{ Slug = "coabrawart"; Label = "CoAB GEO2 data-only with texture art"; Dir = $coabRawArtSmoke }
    $mapPreviewCases += @{ Slug = "gateway_art2"; Label = "Gateway /A 2 with Gen1 texture art"; Dir = $gatewayCoabArtSmoke; ExtraArgs = "/A 2"; ExpectOutput = "native: CCFP /T /A 2" }
  } else {
    Write-Output "SKIP: GBBOOT /E CoAB raw texture smoke (coab_extracted\Data GEO2/WALLDEF2/8X8D1/8X8D2 absent)"
  }
  $mapPreviewCases += @(
    @{ Slug = "frua"; Label = "FRUA HLIB"; Dir = $fruaGeoDir },
    @{ Slug = "nested_frua"; Label = "nested FRUA HLIB wrapper"; Dir = $fruaNestedDir },
    @{ Slug = "fruaart"; Label = "FRUA HLIB with GBWS art"; Dir = $fruaGeoArtSmoke; ExpectGbw = $true },
    @{ Slug = "fruaartc"; Label = "FRUA HLIB /A 10 with 8X8DC GBWS art"; Dir = $fruaGeoArtSmoke; ExtraArgs = "/A 10"; ExpectGbw = $true; ExpectedGbwFirstHeight = 1; AssertGbwRendered = $false },
    @{ Slug = "hlibgeo"; Label = "HLIB GEO data-only"; Dir = $hlibGeoDataDir },
    @{ Slug = "nested_hlibgeo"; Label = "nested HLIB GEO data-only wrapper"; Dir = $hlibNestedGeoDataDir },
    @{ Slug = "hlibgeo2"; Label = "HLIB GEO data-only /A 2"; Dir = $hlibGeoDataDir; ExtraArgs = "/A 2" },
    @{ Slug = "hlibgeoart"; Label = "HLIB GEO data-only with GBWS art"; Dir = $hlibGeoArtSmoke; ExpectGbw = $true },
    @{ Slug = "hlibgeoartc"; Label = "HLIB GEO data-only /A 10 with 8X8DC GBWS art"; Dir = $hlibGeoArtSmoke; ExtraArgs = "/A 10"; ExpectGbw = $true; ExpectedGbwFirstHeight = 1; AssertGbwRendered = $false },
    @{ Slug = "hlibgeodb"; Label = "HLIB GEO data-only with primary GBWS art"; Dir = $hlibGeoDbOnlySmoke; ExpectGbw = $true }
  )
  Invoke-MapPreviewBatch $mapPreviewCases

  function Invoke-DqkEngineSmoke([string]$Slug, [string]$Label, [string]$ExtraArgs, [int]$ExpectedGeo, [string[]]$DumpNeedles, [bool]$ExpectGbw = $true, [int]$ExpectedWallW = 0, [int]$ExpectedWallH = 0, [bool]$AssertGbwRendered = $false, [bool]$AssertClockSky = $false, [bool]$GbsxSaturated = $false, [int]$ExpectedResumeGeo = 0, [string[]]$ResumeDumpNeedles = @(), [string]$DumpVersion = '0009') {
    $conf = Join-Path $run ("_gbboot_dqk_{0}_engine_smoke.conf" -f $Slug)
    Remove-Item $wall, $view, $efx, $res, $comb, $efxTxt, $resTxt, $gbw, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkMount"
D:
C:\GBBOOT /E /X$ExtraArgs
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $Label smoke failed: DOSBox did not exit"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X $Label smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X $Label smoke"
    if ($AssertClockSky) {
      Assert-ClockSkyRaw $view "GBBOOT /E /X $Label smoke"
    }
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD") {
      throw "GBBOOT /E $Label smoke failed: invalid _GBWALL.BIN header"
    }
    if ($ExpectedWallW -gt 0 -and ($wallBytes[4] -ne $ExpectedWallW -or $wallBytes[5] -ne $ExpectedWallH)) {
      throw "GBBOOT /E $Label smoke failed: expected _GBWALL.BIN ${ExpectedWallW}x${ExpectedWallH}, got $($wallBytes[4])x$($wallBytes[5])"
    }
    if ($ExpectGbw) {
      Assert-GbwsBundle $gbw "GBBOOT /E /X $Label smoke"
      if ($AssertGbwRendered) {
        Assert-GbwsRenderedRaw $view "GBBOOT /E /X $Label smoke"
      }
    } elseif (Test-Path $gbw) {
      throw "GBBOOT /E /X $Label smoke failed: _GBWSET.GBW should not be created for outline fallback"
    }
    Assert-GbEffect $efx $ExpectedGeo "GBBOOT /E $Label smoke"
    foreach ($needle in $DumpNeedles) {
      if ($needle) {
        Assert-GbEffectDump $efxTxt $needle "GBBOOT /E $Label smoke" $DumpVersion
      }
    }
    if ($ExpectedResumeGeo -gt 0) {
      Assert-GbEffect $res $ExpectedResumeGeo "GBBOOT /E $Label resumed smoke"
      foreach ($needle in $ResumeDumpNeedles) {
        if ($needle) {
          Assert-GbEffectDump $resTxt $needle "GBBOOT /E $Label resumed smoke"
        }
      }
    }
    # Wherever a case pins a `GBSX count=`, also assert the count is not a
    # saturated (silently truncated) one.  Applicability is derived from the
    # pin list rather than declared per call, so a site that pins a count can
    # never quietly skip the truncation check; cases with no GBSX chunk at all
    # print `GBSX: none` (dump_gbsx's .none arm) and pin nothing.
    if (@($DumpNeedles | Where-Object { $_ -like 'GBSX count=*' }).Count -gt 0) {
      $gbsxText = Get-Content $efxTxt -Raw
      if ($GbsxSaturated) {
        Assert-GbsxSaturatedAtCap $gbsxText "GBBOOT /E $Label smoke"
      } else {
        Assert-GbsxNotTruncated $gbsxText "GBBOOT /E $Label smoke"
      }
    }
    $mode = if ($ExpectGbw) { "CCECL+GBWS" } else { "CCECL+outline" }
    Write-Output "RESULT: GBBOOT /E /X $Label $mode engine smoke PASS"
  }

  Invoke-DqkEngineSmoke "default" "DQK" "" 2 @() $true 0 0 $true
  Invoke-DqkEngineSmoke "area2" "DQK /A 2" " /A 2" 2 @("GBLF operands=0002 0001 D001") $true 0 0 $true -DumpVersion '000F'
  Invoke-DqkEngineSmoke "area3" "DQK /A 3" " /A 3" 2 @("GBLF operands=0002 0001 D001") $true 0 0 $true -DumpVersion '000F'
  Invoke-DqkEngineSmoke "area4" "DQK /A 4" " /A 4" 4 @("GBEF v0009 flags=0021 status=0000 geo=0004", "GBLF operands=0004 0004 D004") $true 0 0 $true
  Invoke-DqkEngineSmoke "area5" "DQK /A 5" " /A 5" 2 @("GBEF v0009 flags=0021 status=0000 geo=0002", "GBLF operands=0002 0001 D001") $true 0 0 $true
  # Area 7 yields combat at GEO 14 (status 3) and resumes at GEO 62 (28x28 WGRD).
  # That route was lost at 37feee1d ("halt before script effect capacity loss"):
  # area 26's 64-event script then halted at SCRIPTCAP and GBBOOT kept HLIB on
  # direct CCECL, which has no capacity continuation.  GBBOOT now sends HLIB
  # through CCFLOW (the terminal-lossless continuation Gen1 already used), so the
  # chunked script reaches the same combat/resume route again.
  Invoke-DqkEngineSmoke "area7" "DQK /A 7" " /A 7" 14 @("GBEF v0009 flags=0179 status=0003 geo=000E", "GBLF operands=000E 0001 D001") $true 28 28 -ExpectedResumeGeo 62 -ResumeDumpNeedles @("GBEF v0009 flags=0121 status=0000 geo=003E", "GBLF operands=003E 0006 D006", "GBSL count=006E")
  Invoke-DqkEngineSmoke "area10" "DQK /A 10" " /A 10" 10 @("GBEF v0009 flags=0031 status=0000 geo=000A", "GBLF operands=000A 0002 D002", "GBSX count=0007", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001", "#01 OP=37 UNKNOWN ARGC=02 ARGS= 01DB 0000") $true 28 28
  Invoke-DqkEngineSmoke "area14" "DQK /A 14" " /A 14" 14 @("GBEF v0009 flags=0021 status=0000 geo=000E", "GBLF operands=000E 0003 D003", "GBSX count=0005", "#01 OP=2C PARLAY ARGC=01 ARGS= 0024") $true 39 20 $true
  Invoke-DqkEngineSmoke "area18" "DQK /A 18" " /A 18" 18 @("GBEF v0009 flags=0021 status=0000 geo=0012", "GBLF operands=0012 0001 D001", "GBSX count=0001", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 16 11 $false $true
  Invoke-DqkEngineSmoke "entry18" "DQK /B 18" " /B 18" 18 @("GBEF v0009 flags=0021 status=0000 geo=0012", "GBLF operands=0012 0001 D001", "GBSX count=0001", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 16 11 $false $true
  Invoke-DqkEngineSmoke "area22" "DQK /A 22" " /A 22" 22 @("GBEF v0009 flags=0021 status=0000 geo=0016", "GBLF operands=0016 0001 D001", "GBSX count=0005", "#00 OP=0E PICTURE ARGC=01 ARGS= 0089", "#03 OP=22 PARTY_SURPRISE ARGC=00") $true 27 24
  Invoke-DqkEngineSmoke "area26" "DQK /A 26" " /A 26" 26 @("GBEF v0009 flags=0121 status=0000 geo=001A", "GBLF operands=001A 00FF 0000", "GBSL count=0070", "#00 OP=37 UNKNOWN ARGC=02 ARGS= 01B9 0000") $true 22 22 
  Invoke-DqkEngineSmoke "area30" "DQK /A 30" " /A 30" 30 @("GBEF v0009 flags=0021 status=0000 geo=001E", "GBLF operands=001E 0001 D001", "GBSX count=0005", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001", "#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 003C", "#02 OP=11 PRINT ARGC=01 ARGS= 0401", "#03 OP=11 PRINT ARGC=01 ARGS= 0024", "#04 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 28 28
  Invoke-DqkEngineSmoke "area34" "DQK /A 34" " /A 34" 34 @("GBEF v0009 flags=0021 status=0000 geo=0022", "GBLF operands=0022 0001 D001", "GBSX count=0001", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 28 28
  Invoke-DqkEngineSmoke "area38" "DQK /A 38" " /A 38" 38 @("GBEF v0009 flags=0021 status=0000 geo=0026", "GBLF operands=0026 0001 D001", "GBSX count=000B", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001", "#01 OP=2C PARLAY ARGC=01 ARGS= 000B") $true 20 39
  Invoke-DqkEngineSmoke "area42" "DQK /A 42" " /A 42" 42 @("GBEF v0009 flags=0021 status=0000 geo=002A", "GBLF operands=002A 0001 D001", "GBSX count=0001", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 28 28
  Invoke-DqkEngineSmoke "area46" "DQK /A 46" " /A 46" 47 @("GBEF v0009 flags=0021 status=0000 geo=002F", "GBLF operands=002F 0001 D001", "GBSX count=0004", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 27 29
  Invoke-DqkEngineSmoke "area50" "DQK /A 50" " /A 50" 50 @("GBEF v0009 flags=0021 status=0000 geo=0032", "GBLF operands=0032 0004 D004", "GBSX count=000D", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001", "#01 OP=2C PARLAY ARGC=01 ARGS= 000B") $true 28 28
  Invoke-DqkEngineSmoke "area54" "DQK /A 54" " /A 54" 54 @("GBEF v0009 flags=0021 status=0000 geo=0036", "GBLF operands=0036 0004 D004", "GBSX count=0001") $true 23 21
  Invoke-DqkEngineSmoke "area62" "DQK /A 62" " /A 62" 62 @("GBEF v0009 flags=0021 status=0000 geo=003E", "GBLF operands=003E 0006 D006", "GBSX count=0001", "#00 OP=2D CALL ARGC=02 ARGS= 0001 0001") $true 28 28
  Invoke-DqkEngineSmoke "area66" "DQK /A 66" " /A 66" 66 @("GBEF v0009 flags=0021 status=0000 geo=0042", "GBLF operands=0042 0005 D005", "GBSX count=002C", "#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0021", "#09 OP=2D CALL ARGC=02 ARGS= 0002 0002") $true 22 34

  $dqkNestedDiskSmoke = Join-Path $run "dqk-nested-disk-smoke"
  New-Item -ItemType Directory -Force (Join-Path $dqkNestedDiskSmoke "GAME\DISK2") | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $dqkNestedDiskSmoke "GAME\DISK3") | Out-Null
  Copy-Item (Join-Path $dqkDir "DQK.EXE") (Join-Path $dqkNestedDiskSmoke "GAME\DQK.EXE") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\ECL.GLB") (Join-Path $dqkNestedDiskSmoke "GAME\DISK3\ECL.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\GEO.GLB") (Join-Path $dqkNestedDiskSmoke "GAME\DISK3\GEO.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkNestedDiskSmoke "GAME\DISK2\8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkNestedDiskSmoke "GAME\DISK2\8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_nested_disk_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkNestedDiskSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X nested disk DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X nested disk DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X nested disk DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X nested disk DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X nested disk DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X nested disk DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E nested disk DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X nested disk DQK CCECL+GBWS engine smoke PASS"

  $dqkDiskDataSmoke = Join-Path $run "dqk-disk-data-smoke"
  New-Item -ItemType Directory -Force (Join-Path $dqkDiskDataSmoke "DISK2") | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $dqkDiskDataSmoke "DISK3") | Out-Null
  Copy-Item (Join-Path $dqkDir "DISK3\ECL.GLB") (Join-Path $dqkDiskDataSmoke "DISK3\ECL.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\GEO.GLB") (Join-Path $dqkDiskDataSmoke "DISK3\GEO.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkDiskDataSmoke "DISK2\8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkDiskDataSmoke "DISK2\8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_disk_data_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkDiskDataSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X disk data DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X disk data DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X disk data DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X disk data DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X disk data DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X disk data DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E disk data DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X disk data-only DQK CCECL+GBWS engine smoke PASS"

  $dqkNestedDiskDataSmoke = Join-Path $run "dqk-nested-disk-data-smoke"
  New-Item -ItemType Directory -Force (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK2") | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK3") | Out-Null
  Copy-Item (Join-Path $dqkDir "DISK3\ECL.GLB") (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK3\ECL.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\GEO.GLB") (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK3\GEO.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK2\8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkNestedDiskDataSmoke "GAME\DISK2\8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_nested_disk_data_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkNestedDiskDataSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X nested disk data DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X nested disk data DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X nested disk data DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X nested disk data DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X nested disk data DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X nested disk data DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E nested disk data DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X nested disk data-only DQK CCECL+GBWS engine smoke PASS"

  $dqkFlatSmoke = Join-Path $run "dqk-flat-smoke"
  New-Item -ItemType Directory -Force $dqkFlatSmoke | Out-Null
  Copy-Item (Join-Path $dqkDir "DQK.EXE") (Join-Path $dqkFlatSmoke "DQK.EXE") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\ECL.GLB") (Join-Path $dqkFlatSmoke "ECL.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\GEO.GLB") (Join-Path $dqkFlatSmoke "GEO.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkFlatSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkFlatSmoke "8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_flat_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkFlatSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X flat DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X flat DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X flat DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X flat DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X flat DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X flat DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E flat DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X flat DQK CCECL+GBWS engine smoke PASS"

  $dqkDataSmoke = Join-Path $run "dqk-data-smoke"
  New-Item -ItemType Directory -Force $dqkDataSmoke | Out-Null
  Copy-Item (Join-Path $dqkDir "DISK3\ECL.GLB") (Join-Path $dqkDataSmoke "ECL.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK3\GEO.GLB") (Join-Path $dqkDataSmoke "GEO.GLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkDataSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkDataSmoke "8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_data_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkDataSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X data-only DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X data-only DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X data-only DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X data-only DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X data-only DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X data-only DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E data-only DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X data-only DQK CCECL+GBWS engine smoke PASS"

  $dqkChainSmoke = Join-Path $run "dqk-chain-smoke"
  New-Item -ItemType Directory -Force $dqkChainSmoke | Out-Null
  New-Item -ItemType File -Force (Join-Path $dqkChainSmoke "DQK.EXE") | Out-Null
  Write-SyntheticEclGlbChain (Join-Path $dqkChainSmoke "ECL.GLB")
  Write-SyntheticGeoGlb (Join-Path $dqkChainSmoke "GEO.GLB") 3 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkChainSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkChainSmoke "8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_chain_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkChainSmoke"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X chained DQK smoke failed: DOSBox did not exit"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X chained DQK smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X chained DQK smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X chained DQK smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X chained DQK smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbwsRenderedRaw $view "GBBOOT /E /X chained DQK smoke"
  Assert-GbEffect $efx 2 "GBBOOT /E chained DQK smoke"
  Write-Output "RESULT: GBBOOT /E /X chained DQK CCECL+GBWS engine smoke PASS"

  $dqkWallCSmoke = Join-Path $run "dqk-wallc-smoke"
  New-Item -ItemType Directory -Force $dqkWallCSmoke | Out-Null
  New-Item -ItemType File -Force (Join-Path $dqkWallCSmoke "DQK.EXE") | Out-Null
  Write-SyntheticEclGlbPieces (Join-Path $dqkWallCSmoke "ECL.GLB") 10
  Write-SyntheticGeoGlb (Join-Path $dqkWallCSmoke "GEO.GLB") 3 -VisibleWalls
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DB.TLB") (Join-Path $dqkWallCSmoke "8X8DB.TLB") -Force
  Copy-Item (Join-Path $dqkDir "DISK2\8X8DC.TLB") (Join-Path $dqkWallCSmoke "8X8DC.TLB") -Force
  $conf = Join-Path $run "_gbboot_dqk_wallc_engine_smoke.conf"
  Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, $gbw, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$dqkWallCSmoke"
D:
C:\GBBOOT /E /X > C:\WALLC.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "GBBOOT /E /X DQK 8X8DC smoke failed: DOSBox did not exit"
  }
  $wallCOut = Join-Path $run "WALLC.TXT"
  if (-not (Test-Path $wallCOut)) {
    throw "GBBOOT /E DQK 8X8DC smoke failed: GBBOOT output missing"
  }
  $wallCText = Get-Content $wallCOut -Raw
  if ($wallCText -like "*native preview failed*") {
    throw "GBBOOT /E DQK 8X8DC smoke failed: GBBOOT reported native preview failure"
  }
  if (-not (Test-Path $wall)) {
    throw "GBBOOT /E /X DQK 8X8DC smoke failed: _GBWALL.BIN was not created"
  }
  Assert-ViewRaw $view "GBBOOT /E /X DQK 8X8DC smoke"
  if (-not (Test-Path $gbw)) {
    throw "GBBOOT /E /X DQK 8X8DC smoke failed: _GBWSET.GBW was not created"
  }
  Assert-GbwsBundle $gbw "GBBOOT /E /X DQK 8X8DC smoke" -ExpectedStartSet 0 -ExpectedFirstWidth 8 -ExpectedFirstHeight 8
  Assert-GbEffect $efx 2 "GBBOOT /E DQK 8X8DC smoke"
  Write-Output "RESULT: GBBOOT /E /X DQK 8X8DC CCECL+GBWS engine smoke PASS"

  $coabData = Join-Path $root "coab_extracted\Data"
  $coabMount = New-RetailStage -Source $coabData -Name 'coab-data'
  $coabEcl = Join-Path $coabData "ECL2.DAX"
  $coabGeo = Join-Path $coabData "GEO2.DAX"
  $coabWalldef = Join-Path $coabData "WALLDEF2.DAX"
  $coab8x8dBoot = Join-Path $coabData "8X8D1.DAX"
  $coab8x8d = Join-Path $coabData "8X8D2.DAX"
  if ((Test-Path $coabEcl) -and (Test-Path $coabGeo) -and (Test-Path $coabWalldef) -and (Test-Path $coab8x8dBoot) -and (Test-Path $coab8x8d)) {
    $conf = Join-Path $run "_gbboot_coab_engine_smoke.conf"
    Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$coabMount"
D:
C:\GBBOOT /E /X
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X Curse smoke failed: DOSBox did not exit"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X Curse smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X Curse smoke"
    Assert-GbEffect $efx 1 "GBBOOT /E Curse smoke"
    Write-Output "RESULT: GBBOOT /E /X Curse ECL2+GEO2 textured engine smoke PASS"
  } else {
    Write-Output "SKIP: GBBOOT /E Curse engine smoke (coab_extracted\Data ECL2/GEO2/WALLDEF2/8X8D1/8X8D2 absent)"
  }

  $coabEcl3 = Join-Path $coabData "ECL3.DAX"
  $coabGeo3 = Join-Path $coabData "GEO3.DAX"
  $coabWalldef3 = Join-Path $coabData "WALLDEF3.DAX"
  $coab8x8d3 = Join-Path $coabData "8X8D3.DAX"
  if ((Test-Path $coabEcl3) -and (Test-Path $coabGeo3) -and (Test-Path $coabWalldef3) -and (Test-Path $coab8x8dBoot) -and (Test-Path $coab8x8d3)) {
    $conf = Join-Path $run "_gbboot_coab_area3_engine_smoke.conf"
    Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$coabMount"
D:
C:\GBBOOT /E /X /A 3
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X Curse /A 3 smoke failed: DOSBox did not exit"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X Curse /A 3 smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X Curse /A 3 smoke"
    Assert-GbEffect $efx 16 "GBBOOT /E Curse /A 3 smoke"
    Write-Output "RESULT: GBBOOT /E /X Curse /A 3 ECL3+GEO3 textured engine smoke PASS"
  } else {
    Write-Output "SKIP: GBBOOT /E Curse /A 3 engine smoke (coab_extracted\Data ECL3/GEO3/WALLDEF3/8X8D1/8X8D3 absent)"
  }

  foreach ($areaCase in @(
    @{ area = 4; geo = 32 },
    @{ area = 5; geo = 50 },
    @{ area = 6; geo = 64 }
  )) {
    $area = [int]$areaCase.area
    $expectedGeo = [int]$areaCase.geo
    $coabEclN = Join-Path $coabData ("ECL{0}.DAX" -f $area)
    $coabGeoN = Join-Path $coabData ("GEO{0}.DAX" -f $area)
    $coabWalldefN = Join-Path $coabData ("WALLDEF{0}.DAX" -f $area)
    $coab8x8dN = Join-Path $coabData ("8X8D{0}.DAX" -f $area)
    if ((Test-Path $coabEclN) -and (Test-Path $coabGeoN) -and (Test-Path $coabWalldefN) -and (Test-Path $coab8x8dBoot) -and (Test-Path $coab8x8dN)) {
      $conf = Join-Path $run ("_gbboot_coab_area{0}_engine_smoke.conf" -f $area)
      Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$coabMount"
D:
C:\GBBOOT /E /X /A $area
exit
"@ | Set-Content -Path $conf -Encoding ASCII

      $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
      if (-not $p.WaitForExit(60000)) {
        try { $p.Kill() } catch {}
        throw "GBBOOT /E /X Curse /A $area smoke failed: DOSBox did not exit"
      }
      if (-not (Test-Path $wall)) {
        throw "GBBOOT /E /X Curse /A $area smoke failed: _GBWALL.BIN was not created"
      }
      Assert-ViewRaw $view "GBBOOT /E /X Curse /A $area smoke"
      Assert-GbEffect $efx $expectedGeo "GBBOOT /E Curse /A $area smoke"
      Write-Output "RESULT: GBBOOT /E /X Curse /A $area ECL$area+GEO$area textured engine smoke PASS"
    } else {
      Write-Output "SKIP: GBBOOT /E Curse /A $area engine smoke (coab_extracted\Data ECL$area/GEO$area/WALLDEF$area/8X8D1/8X8D$area absent)"
    }
  }

  function Invoke-CoabBlockEngineSmoke([int]$Area, [int]$Block, [int]$ExpectedGeo, [string[]]$DumpNeedles, [bool]$GbsxSaturated = $false, [bool]$GbsxAboveCap = $false) {
    $coabEclN = Join-Path $coabData ("ECL{0}.DAX" -f $Area)
    $coabGeoN = Join-Path $coabData ("GEO{0}.DAX" -f $Area)
    $coabWalldefN = Join-Path $coabData ("WALLDEF{0}.DAX" -f $Area)
    $coab8x8dN = Join-Path $coabData ("8X8D{0}.DAX" -f $Area)
    if (-not ((Test-Path $coabEclN) -and (Test-Path $coabGeoN) -and (Test-Path $coabWalldefN) -and (Test-Path $coab8x8dBoot) -and (Test-Path $coab8x8dN))) {
      Write-Output "SKIP: GBBOOT /E Curse /A $Area /B $Block engine smoke (coab_extracted\Data ECL$Area/GEO$Area/WALLDEF$Area/8X8D1/8X8D$Area absent)"
      return
    }

    $label = "Curse /A $Area /B $Block"
    $conf = Join-Path $run ("_gbboot_coab_area{0}_block{1}_engine_smoke.conf" -f $Area, $Block)
    Remove-Item $wall, $view, $efx, $comb, $efxTxt, $resTxt, (Join-Path $run "_GBPARTY.GBP"), (Join-Path $run "_GBSEED.BIN") -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
mount D "$coabMount"
D:
C:\GBBOOT /E /X /A $Area /B $Block
exit
"@ | Set-Content -Path $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$useHeadless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "GBBOOT /E /X $label smoke failed: DOSBox did not exit"
    }
    if (-not (Test-Path $wall)) {
      throw "GBBOOT /E /X $label smoke failed: _GBWALL.BIN was not created"
    }
    Assert-ViewRaw $view "GBBOOT /E /X $label smoke"
    $wallBytes = [IO.File]::ReadAllBytes($wall)
    if ($wallBytes.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wallBytes, 0, 4) -ne "WGRD" -or $wallBytes[4] -ne 16 -or $wallBytes[5] -ne 16) {
      throw "GBBOOT /E $label smoke failed: invalid _GBWALL.BIN header"
    }
    Assert-GbEffect $efx $ExpectedGeo "GBBOOT /E $label smoke"
    foreach ($needle in $DumpNeedles) {
      if ($needle) {
        Assert-GbEffectDump $efxTxt $needle "GBBOOT /E $label smoke"
      }
    }
    if (@($DumpNeedles | Where-Object { $_ -like 'GBS[XL] count=*' }).Count -gt 0) {
      $gbsxText = Get-Content $efxTxt -Raw
      if ($GbsxAboveCap) {
        Assert-GbsxAboveCap $gbsxText "GBBOOT /E $label smoke"
      } elseif ($GbsxSaturated) {
        Assert-GbsxSaturatedAtCap $gbsxText "GBBOOT /E $label smoke"
      } else {
        Assert-GbsxNotTruncated $gbsxText "GBBOOT /E $label smoke"
      }
    }
    Write-Output "RESULT: GBBOOT /E /X $label ECL override textured engine smoke PASS"
  }

  Invoke-CoabBlockEngineSmoke 2 2 1 @("GBEF v0009 flags=0023 status=0000 geo=0001", "GBLF operands=0001 0002 00FF", "GBLP raw=0001 0002 0004 sets=0001 0002 0004", "GBSX count=0025")
  Invoke-CoabBlockEngineSmoke 2 3 3 @("GBEF v0009 flags=0123 status=0000 geo=0003", "GBLF operands=0003 0002 00FF", "GBLP raw=0001 0002 0004 sets=0001 0002 0004", "GBSL count=0006", "#04 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B")
  Invoke-CoabBlockEngineSmoke 2 4 4 @("GBEF v0009 flags=0023 status=0000 geo=0004", "GBLF operands=0004 0002 00FF", "GBLP raw=0001 0002 0004 sets=0001 0002 0004", "GBSX count=0004", "#02 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B")
  Invoke-CoabBlockEngineSmoke 3 17 17 @("GBEF v0009 flags=0123 status=0000 geo=0011", "GBLF operands=0011 0002 00FF", "GBLP raw=0003 0006 0007 sets=0003 0006 0007", "GBSL count=0015", "#03 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B")
  Invoke-CoabBlockEngineSmoke 3 21 21 @("GBEF v0009 flags=0123 status=0000 geo=0015", "GBLF operands=0015 0002 00FF", "GBLP raw=0003 0005 0007 sets=0003 0005 0007", "GBSL count=0004", "#02 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F82 0001 001B")
  # COMPLETE SIDECAR: the former saturated 64-record GBSX is now a finite
  # 86-record GBSL. The exact pin and Assert-GbsxAboveCap require both the
  # measured total and its relationship to the current SCRIPTCAP. Increasing
  # the cap can change the transport and must reopen this assertion.
  Invoke-CoabBlockEngineSmoke 4 34 33 @("GBEF v0009 flags=0123 status=0000 geo=0021", "GBLF operands=0021 0002 00FF", "GBLP raw=0003 0008 00FF sets=0003 0008 00FF", "GBSL count=0056", "#05 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B") -GbsxAboveCap $true
  Invoke-CoabBlockEngineSmoke 4 37 37 @("GBEF v0009 flags=0023 status=0003 geo=0025", "GBLF operands=0025 0002 00FF", "GBLP raw=0008 000A 000B sets=0008 000A 000B", "GBSX count=0007", "#05 OP=2B HORIZONTAL_MENU ARGC=04 ARGS= 7F79 0002 0003 0006")
  $coabBlock50Expected = @(
    "1 init p0 - - - - - - -",
    "1 init p1 - - - - - - -",
    "1 init e0 - - - - - - -",
    "1 init e1 - - - - - - -",
    "1 init e2 - - - - - - -",
    "1 init e3 - - - - - - -",
    "1 init e4 - - - - - - -",
    "1 init e5 - - - - - - -",
    "1 init e6 - - - - - - -",
    "1 move e6 - - - - - - - 7 5",
    "1 move e6 - - - - - - - 7 6",
    "1 move e6 - - - - - - - 6 7",
    "1 attack e1 p1 7 9 0 - 12 -",
    "1 attack e1 p1 18 9 1 9 3 -",
    "1 move e5 - - - - - - - 5 7",
    "1 move e5 - - - - - - - 4 7",
    "1 move e5 - - - - - - - 3 7",
    "1 attack e5 p1 15 10 1 1 2 -",
    "1 attack p0 e0 2 12 0 - 42 -",
    "1 attack e0 p0 13 10 1 7 7 -",
    "1 attack e0 p0 2 10 0 - 7 -",
    "1 attack e2 p1 13 9 1 7 0 -",
    "1 slain e2 p1 - - - - 0 0",
    "1 attack e2 p0 14 10 1 9 0 -",
    "1 slain e2 p0 - - - - 0 0",
    "1 end - enemy - - - - - -"
  )
  $coabBlock50Inputs = @(
    (Join-Path $coabData "ECL5.DAX"),
    (Join-Path $coabData "GEO5.DAX"),
    (Join-Path $coabData "WALLDEF5.DAX"),
    (Join-Path $coabData "8X8D1.DAX"),
    (Join-Path $coabData "8X8D5.DAX"),
    (Join-Path $coabData "MON5CHA.DAX")
  )
  $hasCoabBlock50Inputs = $true
  foreach ($path in $coabBlock50Inputs) {
    if (-not (Test-Path $path)) {
      $hasCoabBlock50Inputs = $false
      break
    }
  }
  if ($hasCoabBlock50Inputs) {
    Invoke-CoabBlockEngineSmoke 5 50 50 @("GBEF v0009 flags=016B status=0003 geo=0032", "GBLF operands=0032 0002 00FF", "GBLP raw=0008 00FF 00FF sets=0008 00FF 00FF", "GBEC groups=0002", "@00 MONSTER id=0039 count=0004 pic=0039", "@01 MONSTER id=0031 count=0003 pic=0031", "GBRS flags=0001 area=0032", "GBSL count=0007", "#03 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B")
    Assert-CombatRaw $combView "GBBOOT /E /X Curse /A 5 /B 50 smoke"
    Assert-TraceExact $comb $coabBlock50Expected "GBBOOT /E /X Curse /A 5 /B 50 smoke"
    if ((Get-Content $cout -Raw).Trim() -ne "enemy") {
      throw "GBBOOT /E /X Curse /A 5 /B 50 smoke failed: unexpected combat outcome sidecar"
    }
  } else {
    Write-Output "SKIP: GBBOOT /E Curse /A 5 /B 50 combat-yield map smoke (coab_extracted\Data ECL5/GEO5/WALLDEF5/8X8D1/8X8D5/MON5CHA absent)"
  }
  Invoke-CoabBlockEngineSmoke 5 51 51 @("GBEF v0009 flags=016F status=0003 geo=0033", "GBLF operands=0033 0002 00FF", "GBLP raw=000E 000F 00FF sets=000E 00FF 00FF", "GBEC groups=0001", "@00 MONSTER id=0035 count=000E pic=0035", "GBRS flags=0001 area=0033", "GBSL count=0037", "#05 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B")
  Invoke-CoabBlockEngineSmoke 5 53 53 @("GBEF v0009 flags=0127 status=0000 geo=0035", "GBLF operands=0035 0002 00FF", "GBLP raw=000E 000F 0008 sets=000E 00FF 0008", "GBSL count=000A", "#02 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F82 0001 001B")
  Invoke-CoabBlockEngineSmoke 6 66 66 @("GBEF v0009 flags=0123 status=0000 geo=0042", "GBLF operands=0042 0002 00FF", "GBLP raw=000D 0010 00FF sets=000D 0010 00FF", "GBSL count=0003")
  Invoke-CoabBlockEngineSmoke 6 67 67 @("GBEF v0009 flags=0023 status=0000 geo=0043", "GBLF operands=0043 0002 00FF", "GBLP raw=000D 0010 0003 sets=000D 0010 0003", "GBSX count=0001")
  Invoke-CoabBlockEngineSmoke 6 69 69 @("GBEF v0009 flags=0027 status=0000 geo=0045", "GBLF operands=0045 0002 00FF", "GBLP raw=0011 0012 000D sets=0011 00FF 000D", "GBSX count=0004", "#02 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F82 0001 001B")
}
