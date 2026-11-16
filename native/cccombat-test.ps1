# cccombat-test.ps1 -- headless deterministic CCCOMBAT trace smoke.
#
# Builds CCCOMBAT.COM, runs the built-in Tier-1 encounter fixture under DOSBox,
# then runs CCECL -> GBEF -> CCCOMBAT /E and checks both exact seeded traces.
# If the local CoK/DoK MON1CHA.DAX archives, CoAB extracted data, or DQK
# MONCHA.GLB are present, it also checks the real monster-stat handoff. The
# fixture, synthetic ECL blocks, and synthetic DoK/Buck compact MONCHA archives
# are commit-safe; this test guards the native tactical loop and script-produced
# encounter handoffs.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "cccombat-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")
$cokMon = Join-Path $root "Champions of Krynn\MON1CHA.DAX"
$dokMon = Join-Path $root "Death Knights of Krynn\MON1CHA.DAX"
$coabEcl5 = Join-Path $root "coab_extracted\Data\ECL5.DAX"
$coabMon5 = Join-Path $root "coab_extracted\Data\MON5CHA.DAX"
$dqkMon = Join-Path $root "The Dark Queen of Krynn\DISK2\MONCHA.GLB"

& (Join-Path $native "build.ps1") -Target cccombat
& (Join-Path $native "build.ps1") -Target ccecl

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "cccombat.com") (Join-Path $run "CCCOMBAT.COM") -Force
Copy-Item (Join-Path $build "ccecl.com") (Join-Path $run "CCECL.COM") -Force

# Task-49 needs a three-actor routing shape, but adding another assembled /T
# fixture would exceed CCCOMBAT's 64 KiB segment.  Clone fixture 48 into a
# test-only COM and replace its three fixed-width records before DOSBox runs.
# The full old body is the locator, so this fails loudly if the fixture layout
# moves; the shipped CCCOMBAT.COM remains byte-identical to the normal build.
function New-CcombatFixtureRecord {
  param([int]$Side, [int]$Ordinal, [int[]]$Words)
  if ($Words.Count -ne 18) { throw "combat fixture record needs 18 words, got $($Words.Count)" }
  [byte[]]$record = [byte[]]::new(38)
  $record[0] = [byte]$Side
  $record[1] = [byte]$Ordinal
  for ($i = 0; $i -lt $Words.Count; $i++) {
    [BitConverter]::GetBytes([Int16]$Words[$i]).CopyTo($record, 2 + ($i * 2))
  }
  return ,$record
}

function Find-ByteSequence([byte[]]$Bytes, [byte[]]$Needle, [int]$StartAt = 0) {
  for ($start = $StartAt; $start -le ($Bytes.Length - $Needle.Length); $start++) {
    $match = $true
    for ($i = 0; $i -lt $Needle.Length; $i++) {
      if ($Bytes[$start + $i] -ne $Needle[$i]) { $match = $false; break }
    }
    if ($match) { return $start }
  }
  return -1
}

$fixture48Old = [Collections.Generic.List[byte]]::new()
$fixture48Old.AddRange((New-CcombatFixtureRecord 0 0 @(20,20,1,10,1,1,9,0,20,0,5,4,1,4,0,0,2,0)))
$fixture48Old.AddRange((New-CcombatFixtureRecord 1 0 @(1,1,20,10,1,1,0,25,1,0,6,4,1,0,0,0,1,0)))
$fixture48Old.AddRange((New-CcombatFixtureRecord 1 1 @(100,100,20,10,1,1,0,25,1,0,5,5,1,0,0,0,1,0)))
$fixture48Route = [Collections.Generic.List[byte]]::new()
$fixture48Route.AddRange((New-CcombatFixtureRecord 0 0 @(10,10,20,10,1,1,0,0,1,0,0,4,1,0,0,0,1,0)))
$fixture48Route.AddRange((New-CcombatFixtureRecord 0 1 @(30,30,1,10,1,1,99,0,1,0,3,5,1,0,0,0,1,0)))
$fixture48Route.AddRange((New-CcombatFixtureRecord 1 0 @(20,20,20,10,1,1,0,25,20,0,5,4,1,4,0,0,1,0)))
$routeCom = Join-Path $run "CCROUTE.COM"
[byte[]]$routeBytes = [IO.File]::ReadAllBytes((Join-Path $run "CCCOMBAT.COM"))
$routeOffset = Find-ByteSequence $routeBytes $fixture48Old.ToArray()
if ($routeOffset -lt 0) { throw 'CCCOMBAT fixture 48 body was not found for the task-49 route control' }
if ((Find-ByteSequence $routeBytes $fixture48Old.ToArray() ($routeOffset + 1)) -ge 0) { throw 'CCCOMBAT fixture 48 body is not unique for the task-49 route control' }
[Array]::Copy($fixture48Route.ToArray(), 0, $routeBytes, $routeOffset, $fixture48Route.Count)
[IO.File]::WriteAllBytes($routeCom, $routeBytes)
$hasRealMon = Test-Path $cokMon
if ($hasRealMon) {
  Copy-Item $cokMon (Join-Path $run "MON1CHA.DAX") -Force
}
$hasDokMon = Test-Path $dokMon
if ($hasDokMon) {
  Copy-Item $dokMon (Join-Path $run "DOKMON.DAX") -Force
}
$hasCoabMon = (Test-Path $coabEcl5) -and (Test-Path $coabMon5)
if ($hasCoabMon) {
  Copy-Item $coabEcl5 (Join-Path $run "COABECL5.DAX") -Force
  Copy-Item $coabMon5 (Join-Path $run "COABMON5.DAX") -Force
}
$hasDqkMon = Test-Path $dqkMon
if ($hasDqkMon) {
  Copy-Item $dqkMon (Join-Path $run "MONCHA.GLB") -Force
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

function ConvertTo-MonchaLiteralRle {
  param(
    [Parameter(Mandatory)][byte[]]$Raw
  )

  $compressed = [System.Collections.Generic.List[byte]]::new()
  $offset = 0
  while ($offset -lt $Raw.Length) {
    # 0x80 is the MONCHA codec's no-op, so literal controls stop at 0x7F.
    $chunk = [Math]::Min(128, $Raw.Length - $offset)
    $compressed.Add([byte]($chunk - 1))
    for ($i = 0; $i -lt $chunk; $i++) {
      $compressed.Add($Raw[$offset + $i])
    }
    $offset += $chunk
  }
  return $compressed.ToArray()
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

function Write-SyntheticHlibDataLibrary {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][byte[][]]$Members
  )

  $ptrCount = $Members.Count + 1
  $ptrBytes = $ptrCount * 4
  $payloadStart = 16 + $ptrBytes
  $starts = [System.Collections.Generic.List[int]]::new()
  $offset = $payloadStart
  foreach ($member in $Members) {
    $starts.Add($offset)
    $offset += $member.Length
  }
  $starts.Add($offset)

  [byte[]]$bytes = [byte[]]::new($offset)
  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt32]$bytes.Length).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]($ptrCount - 1)).CopyTo($bytes, 8)
  $bytes[11] = 1
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($bytes, 12)
  for ($i = 0; $i -lt $ptrCount; $i++) {
    [BitConverter]::GetBytes([UInt32]$starts[$i]).CopyTo($bytes, 16 + ($i * 4))
  }
  for ($i = 0; $i -lt $Members.Count; $i++) {
    [Array]::Copy($Members[$i], 0, $bytes, $starts[$i], $Members[$i].Length)
  }

  [IO.File]::WriteAllBytes($Path, $bytes)
}

function New-SyntheticDokMonRecord {
  param(
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [int]$IconSize = 1,
    # HP and kill-XP are read from real record offsets as of 2026-09-05
    # (cccombat.asm's .dok branch, offsets per docs/engine/research/dok-kill-xp.md).
    # Before that the engine derived HP from the monster INDEX as
    # (fx_monster & 7) + 4 and stored a hard zero XP, so a zero-filled record
    # still yielded a living monster. It no longer does -- leave $Hp at 0 and the
    # engine sees a 0-hp record. The call sites below pass the same HP the old
    # index hash produced for their ids, so existing traces stay comparable.
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
  $raw[41] = [byte]$IconSize
  $raw[40] = [byte]$Hp                     # max hp
  $raw[214] = [byte]$Hp                    # retail mirrors max hp here
  $raw[108] = [byte]$Hp                    # live/rolled hp: the XP multiplicand
  [BitConverter]::GetBytes([UInt16]$XpFlat).CopyTo($raw, 109)
  $raw[111] = [byte]$XpPerHp
  return $raw
}

function New-SyntheticBuckMonRecord {
  # Offsets are the GAME.OVR-oracled ones pinned by tools/test_buck_monster_fields.py:
  # raw[51] = 60 - THAC0, raw[55] = 60 - AC, raw[61]/[63]/[65] = attack-1 dice
  # count / sides / signed bonus.  Defaults: THAC0 15, AC 10, 1d6+0.
  param(
    [string]$Name = "BUCK MON",
    [int]$Hp = 11,
    [int]$Thac0Raw = 45,
    [int]$AcRaw = 50,
    [int]$DCount = 1,
    [int]$DSides = 6,
    [int]$DBonus = 0
  )

  [byte[]]$raw = [byte[]]::new(263)
  $nameBytes = [Text.Encoding]::ASCII.GetBytes($Name)
  $len = [Math]::Min(15, $nameBytes.Length)
  $raw[0] = [byte]$len
  [Array]::Copy($nameBytes, 0, $raw, 1, $len)
  $raw[69] = [byte]$Hp
  $raw[227] = [byte]$Hp
  $raw[51] = [byte]$Thac0Raw
  $raw[55] = [byte]$AcRaw
  $raw[61] = [byte]$DCount
  $raw[63] = [byte]$DSides
  $raw[65] = [byte]($DBonus -band 0xFF)
  return $raw
}

function New-SyntheticPoolMonRecord {
  param(
    [string]$Name = "POOL MON",
    [Parameter(Mandatory)][int]$Hp,
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [Parameter(Mandatory)][int]$Xp,
    [int]$IconSize = 1
  )

  [byte[]]$raw = [byte[]]::new(287)
  $nameBytes = [Text.Encoding]::ASCII.GetBytes($Name)
  $len = [Math]::Min(15, $nameBytes.Length)
  [Array]::Copy($nameBytes, 0, $raw, 0, $len)
  $raw[45] = [byte](60 - $Thac0)
  $raw[50] = [byte]$Hp
  $raw[108] = [byte]$IconSize
  $raw[165] = [byte]$DamageCount
  $raw[167] = [byte]$DamageSides
  $raw[169] = [byte]($DamageBonus -band 0xFF)
  $raw[186] = [byte](($Xp -shr 8) -band 0xFF)
  $raw[187] = [byte]($Xp -band 0xFF)
  $raw[275] = [byte](60 - $Ac)
  return $raw
}

# --- DQK MONCHA.GLB member, fidelity-plan §29 layout (rebuilt 2026-09-07) ------
#
#  REPLACES the pre-§29 `New-SyntheticDqkCompactMonRaw`, which is quoted here so
#  the wrong turn stays visible rather than being silently deleted. It built a
#  108-byte body on the layout §29 retired:
#
#      [byte[]]$recon = [byte[]]::new(108)
#      $recon[2] = 8                                  # old "type tag at offset 2"
#      [Array]::Copy($name, 0, $recon, 24, ...)       # name at 24; §29 puts it at 0x68
#      for ($i = 0; $i -lt 6; $i++) { $recon[40 + ($i*2)] = 10; ... }   # abilities at 40
#      $recon[55] = 60 - $Thac0 ; $recon[65] = $HitDice ; $recon[82] = $AttackCount
#      $recon[83..86] = dmgCount, dmgSides, dmgBonus, 60 - $Ac
#      ... then a hand-built "inline-RLE reconstruction" tail, and NO length word.
#
#  Two things were wrong with it under §29, and only the first is obvious:
#
#  1. The member carried no 2-byte big-endian uncompressed-length word, so
#     glb_rle_to_monraw (cccombat.asm:3194-3212) -- which now starts the RLE
#     stream at member+2 -- began decoding two bytes into the stream.
#  2. The body was not a plain record at all: it appended a second, inner RLE
#     stream that only the withdrawn staged-recovery decoder could unpick.
#
#  Measured consequence before this rewrite: the record failed every §29 sniff,
#  fill_enemy_from_mon fell through to its `.err` placeholder (cccombat.asm:1514
#  and 2074-2090), and the enemy came out HP 6 / THAC0 19 / AC 8 / 1d4 -- i.e.
#  derived from the monster id, not from the file. The run printed
#  "1 attack p0 e0 17 7 1 9 0 -" and the party won in one round.
#
#  The rebuilt record is the fixed §29 layout that sniff_dqk_mon_direct
#  (cccombat.asm:2154-2187) accepts. Offsets are into the DECOMPRESSED record,
#  i.e. past the length word; the ability block sits at DQK_L_ABIL and every stat
#  is quoted as a delta from it exactly as the assembler indexes it.
#
#  RETRACTED 2026-09-25: the attack-rate field is located and its ordinary retail
#  consumer is disassembled. DQK rates occupy A+59/A+60, each feeding one kind's
#  per-two-round allowance. The generic retail consumer starts with kind 2,
#  decrements its allowance before each attempt, and then consumes kind 1.
#  Round setup selects kind 2; AE4C advances after actors, so the first two
#  rounds use phases 0 then 1. See docs/engine/research/disasm-combat-dqk.md §10.3.
#
#  The old conclusion above was based on a candidate snake-effect counter and an
#  incomplete call graph. The overlay-0 consumer at 0x26177 resolves that. The
#  synthetic records below now put distinct rates and damage profiles through
#  the actual D0xx HLIB handoff; their first-two-round assertions are kept in
#  the DOSBox fixture harness. They are static source additions until that
#  harness can be run without taking foreground focus.
function New-SyntheticDqkFixedMonRecord {
  param(
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$HitDice,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [int]$PrimaryAttackRate = 2,
    [int]$SecondaryAttackRate = 0,
    [int]$SecondaryDamageCount = 0,
    [int]$SecondaryDamageSides = 0,
    [int]$SecondaryDamageBonus = 0,
    [string]$Name = "HYDRATEST",
    [int]$Xp = 250
  )

  $L_XP    = 0x054   # u16 LE experience award            cccombat.asm:1992
  $L_RACE  = 0x058   # 7 = plain monster                  documented, never read
  $L_ISMON = 0x066   # 1 = bestiary half                  cccombat.asm:2157
  $L_NAME  = 0x068   # 16-byte NUL-padded name            ccmon.asm:994-1007
  $L_ABIL  = 0x078   # 12-byte ability block
  $L_FIXED = 0x1A0   # minimum length accepted            cccombat.asm:2155

  [byte[]]$raw = [byte[]]::new($L_FIXED)
  [BitConverter]::GetBytes([UInt16]$Xp).CopyTo($raw, $L_XP)
  $raw[$L_RACE] = 7
  $raw[$L_ISMON] = 1
  $nameBytes = [Text.Encoding]::ASCII.GetBytes($Name)
  [Array]::Copy($nameBytes, 0, $raw, $L_NAME, [Math]::Min(16, $nameBytes.Length))
  for ($i = 0; $i -lt 12; $i++) { $raw[$L_ABIL + $i] = 10 }
  $raw[$L_ABIL + 15] = [byte](60 - $Thac0)          # THAC0 = 60 - byte   :1953-1956
  $raw[$L_ABIL + 25] = [byte]$HitDice               # HP = max(hd, (hd*9+1)>>1) :1938-1947
  $raw[$L_ABIL + 61] = [byte]$DamageCount           # -> C_DCOUNT         :1971
  $raw[$L_ABIL + 63] = [byte]$DamageSides           # -> C_DSIDES         :1973
  $raw[$L_ABIL + 65] = [byte]($DamageBonus -band 0xFF)  # signed i8       :1975
  $raw[$L_ABIL + 59] = [byte]$PrimaryAttackRate     # attack kind 1 rate / two rounds
  $raw[$L_ABIL + 60] = [byte]$SecondaryAttackRate   # attack kind 2 rate / two rounds
  $raw[$L_ABIL + 62] = [byte]$SecondaryDamageCount
  $raw[$L_ABIL + 64] = [byte]$SecondaryDamageSides
  $raw[$L_ABIL + 66] = [byte]($SecondaryDamageBonus -band 0xFF)
  $raw[$L_ABIL + 67] = [byte](60 - $Ac)             # AC = 60 - byte      :1960
  return $raw
}

# A MONCHA.GLB member is the 2-byte BIG-ENDIAN uncompressed length followed by
# the RLE stream (docs/hlib-format.md §6a; cccombat.asm:3194-3212 skips the word
# and expands from member+2; ccmon.asm:359-378 does the same).
#
# NEAR MISS worth knowing about: a 416-byte record literal-encodes to a member of
# exactly 422 bytes, and 422 is the magic span that routes a member to
# glb_raw_to_monraw -- the verbatim copy with NO length-word skip
# (cccombat.asm:3120-3128). It does not fire here, and cannot: that branch is
# gated on [mon_glib], which is set only by the Amiga GLIB header (:2951) and
# never by HLIB (:2900). If this fixture is ever ported to a GLIB container the
# record length must move off 416.
function ConvertTo-MonchaGlbMember {
  param(
    [Parameter(Mandatory)][byte[]]$Raw
  )

  $body = ConvertTo-MonchaLiteralRle $Raw
  [byte[]]$member = [byte[]]::new(2 + $body.Length)
  $member[0] = [byte](($Raw.Length -shr 8) -band 0xFF)
  $member[1] = [byte]($Raw.Length -band 0xFF)
  [Array]::Copy($body, 0, $member, 2, $body.Length)
  return $member
}

function New-SyntheticCoabMonRecord {
  param(
    [Parameter(Mandatory)][int]$Hp,
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [int]$Attack2DamageCount = 0,
    [int]$Attack2DamageSides = 0,
    [int]$Attack2DamageBonus = 0,
    [int]$HalfAttacks = 0
  )

  [byte[]]$raw = [byte[]]::new(422)
  $raw[0x78] = [byte]$Hp
  $raw[0x1a4] = [byte]$Hp
  $raw[0x199] = [byte](60 - $Thac0)
  $raw[0x19a] = [byte](60 - $Ac)
  $raw[0x19e] = [byte]$DamageCount
  $raw[0x1a0] = [byte]$DamageSides
  $raw[0x1a2] = [byte]$DamageBonus
  $raw[0x19f] = [byte]$Attack2DamageCount
  $raw[0x1a1] = [byte]$Attack2DamageSides
  $raw[0x1a3] = [byte]$Attack2DamageBonus
  $raw[0x11c] = [byte]$HalfAttacks
  [BitConverter]::GetBytes([UInt16]25).CopyTo($raw, 0x127)
  return $raw
}

function New-SyntheticCokGbprBody {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][int]$Hp,
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus,
    [Parameter(Mandatory)][int]$Xp
  )

  [byte[]]$raw = [byte[]]::new(409)
  $nameBytes = [Text.Encoding]::ASCII.GetBytes($Name)
  $raw[0] = [byte][Math]::Min($nameBytes.Length, 15)
  [Array]::Copy($nameBytes, 0, $raw, 1, $raw[0])
  $raw[98] = [byte]$Hp
  $raw[89] = [byte](60 - $Thac0)
  $raw[275] = [byte](60 - $Ac)
  $raw[269] = [byte]$DamageCount
  $raw[270] = [byte]$DamageBonus
  $raw[271] = [byte]$DamageSides
  [BitConverter]::GetBytes([UInt16]$Xp).CopyTo($raw, 304)
  return $raw
}

function Write-SyntheticCokGbprParty {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[][]]$members = @(
    (New-SyntheticCokGbprBody -Name "ALPHA" -Hp 14 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 8 -DamageBonus 1 -Xp 100),
    (New-SyntheticCokGbprBody -Name "BETA" -Hp 0 -Thac0 16 -Ac 6 -DamageCount 1 -DamageSides 6 -DamageBonus 2 -Xp 200)
  )
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $members.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$members.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  for ($i = 0; $i -lt $members.Count; $i++) {
    $record = 16 + ($i * 410)
    $bytes[$record] = [byte]($i + 1)
    [Array]::Copy($members[$i], 0, $bytes, $record + 1, $members[$i].Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticCokSixGbprParty {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[][]]$members = @(1..6 | ForEach-Object {
    ,(New-SyntheticCokGbprBody -Name ("SIX{0}" -f $_) -Hp 14 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 8 -DamageBonus 1 -Xp 100)
  })
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $members.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$members.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  for ($i = 0; $i -lt $members.Count; $i++) {
    $record = 16 + ($i * 410)
    $bytes[$record] = [byte]($i + 1)
    [Array]::Copy($members[$i], 0, $bytes, $record + 1, $members[$i].Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function New-SyntheticDokGbprBody {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][int]$Level,
    [Parameter(Mandatory)][int]$Class,
    [Parameter(Mandatory)][int]$Hp,
    [Parameter(Mandatory)][int]$Thac0,
    [Parameter(Mandatory)][int]$Ac,
    [Parameter(Mandatory)][int]$DamageCount,
    [Parameter(Mandatory)][int]$DamageSides,
    [Parameter(Mandatory)][int]$DamageBonus
  )

  [byte[]]$raw = [byte[]]::new(409)
  $nameBytes = [Text.Encoding]::ASCII.GetBytes($Name)
  $raw[0] = [byte][Math]::Min($nameBytes.Length, 15)
  [Array]::Copy($nameBytes, 0, $raw, 1, $raw[0])
  $meta = 216
  [Text.Encoding]::ASCII.GetBytes("GBD1").CopyTo($raw, $meta)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($raw, $meta + 4)
  [BitConverter]::GetBytes([Int16]$Hp).CopyTo($raw, $meta + 6)
  [BitConverter]::GetBytes([Int16]$Ac).CopyTo($raw, $meta + 8)
  [BitConverter]::GetBytes([Int16]$DamageCount).CopyTo($raw, $meta + 10)
  [BitConverter]::GetBytes([Int16]$DamageSides).CopyTo($raw, $meta + 12)
  [BitConverter]::GetBytes([Int16]$DamageBonus).CopyTo($raw, $meta + 14)
  [BitConverter]::GetBytes([UInt16]$Level).CopyTo($raw, $meta + 16)
  $raw[($meta + 18)] = [byte]$Class
  [BitConverter]::GetBytes([Int16]$Thac0).CopyTo($raw, $meta + 20)
  [BitConverter]::GetBytes([Int16]4).CopyTo($raw, $meta + 22)
  [BitConverter]::GetBytes([Int16]$Hp).CopyTo($raw, $meta + 26)
  return $raw
}

function Write-SyntheticDokWarriorGbprParty {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[][]]$members = @(,
    (New-SyntheticDokGbprBody -Name "VETERAN" -Level 7 -Class 1 -Hp 30 -Thac0 10 -Ac 4 -DamageCount 1 -DamageSides 8 -DamageBonus 0)
  )
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $members.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$members.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 10)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($bytes, 12)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 14)
  for ($i = 0; $i -lt $members.Count; $i++) {
    $record = 16 + ($i * 410)
    $bytes[$record] = [byte]($i + 1)
    [Array]::Copy($members[$i], 0, $bytes, $record + 1, $members[$i].Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

# T4: recruited DQK NPCs (CCHOST /N rows, body +300 bit 7 = retail +0x9B&0x80,
# +301 = NPC id) are computer-controlled: retail 0x22C89 `cmp byte [+0x18C],0`
# sends such an actor to the AI turn (0x2DE10) instead of the human menu.
# Row 0 optionally carries the flag; row 1 never does.  Title id 3 = DQK.
function Write-SyntheticDqkNpcGbprParty {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][int]$Flag
  )

  [byte[][]]$members = @(
    (New-SyntheticDokGbprBody -Name "RECRUIT" -Level 7 -Class 1 -Hp 30 -Thac0 10 -Ac 4 -DamageCount 1 -DamageSides 8 -DamageBonus 0),
    (New-SyntheticDokGbprBody -Name "PLAYER" -Level 7 -Class 1 -Hp 30 -Thac0 10 -Ac 4 -DamageCount 1 -DamageSides 8 -DamageBonus 0)
  )
  $members[0][300] = [byte]$Flag
  if ($Flag -ne 0) { $members[0][301] = 115 }
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $members.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$members.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 10)
  [BitConverter]::GetBytes([UInt16]3).CopyTo($bytes, 12)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 14)
  for ($i = 0; $i -lt $members.Count; $i++) {
    $record = 16 + ($i * 410)
    $bytes[$record] = [byte]($i + 1)
    [Array]::Copy($members[$i], 0, $bytes, $record + 1, $members[$i].Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

# Two separately owned DoK members exercise the v1 bridge's current single
# Cast receipt: the first cast may proceed, while the second must reject until
# the bridge gains a bounded multi-receipt format.
function Write-SyntheticDokCasterGbprParty {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  [byte[][]]$members = @(
    (New-SyntheticDokGbprBody -Name "CASTER1" -Level 7 -Class 1 -Hp 30 -Thac0 10 -Ac 4 -DamageCount 1 -DamageSides 8 -DamageBonus 0),
    (New-SyntheticDokGbprBody -Name "CASTER2" -Level 7 -Class 1 -Hp 30 -Thac0 10 -Ac 4 -DamageCount 1 -DamageSides 8 -DamageBonus 0)
  )
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $members.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$members.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 10)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($bytes, 12)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 14)
  for ($i = 0; $i -lt $members.Count; $i++) {
    $record = 16 + ($i * 410)
    $bytes[$record] = [byte]($i + 1)
    [Array]::Copy($members[$i], 0, $bytes, $record + 1, $members[$i].Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticWgrdBlocker {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  $w = 10
  $h = 10
  [byte[]]$bytes = [byte[]]::new(6 + ($w * $h * 4))
  [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($bytes, 0)
  $bytes[4] = [byte]$w
  $bytes[5] = [byte]$h

  # Fully solid WGRD cells around the fixture party at (4,5) and (4,6).
  $solidCells = @(
    @(3, 4), @(4, 4), @(5, 4),
    @(3, 5),          @(5, 5),
    @(3, 6),          @(5, 6),
    @(3, 7), @(4, 7), @(5, 7)
  )
  foreach ($cell in $solidCells) {
    $off = 6 + ((($cell[1] * $w) + $cell[0]) * 4)
    $bytes[$off] = 1
    $bytes[$off + 1] = 1
    $bytes[$off + 2] = 1
    $bytes[$off + 3] = 1
  }

  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticDokMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  Write-SyntheticDaxBlocks $Path @(
    # -Hp 5 / -Hp 7 reproduce what the retired index hash ((fx_monster & 7) + 4)
    # gave these two ids, so HP-dependent traces are unaffected by the move to
    # real offsets. The XP terms are deliberately BOTH non-zero and unequal:
    # award = flat + perHp * hp is 13 + 3*5 = 28 and 20 + 5*7 = 55, so dropping
    # the per-hit-point term again would show up as 13/20 rather than passing.
    @{ Id = 9; Raw = (New-SyntheticDokMonRecord -Thac0 15 -Ac -5 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Hp 5 -XpFlat 13 -XpPerHp 3) },
    @{ Id = 19; Raw = (New-SyntheticDokMonRecord -Thac0 12 -Ac -5 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -IconSize 130 -Hp 7 -XpFlat 20 -XpPerHp 5) }
  )
}

function Write-SyntheticBuckMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path,
    [hashtable]$Mutate = @{}
  )

  # $Mutate: byte-offset -> value applied to BOTH records AFTER construction, so a
  # mutation can hit any offset (including ones the engine must not read).
  $g = New-SyntheticBuckMonRecord "BUCK GUARD"
  $v = New-SyntheticBuckMonRecord "BUCK VET"
  foreach ($k in $Mutate.Keys) { $g[[int]$k] = [byte]$Mutate[$k]; $v[[int]$k] = [byte]$Mutate[$k] }
  Write-SyntheticDaxBlocks $Path @(
    @{ Id = 9; Raw = $g },
    @{ Id = 19; Raw = $v }
  )
}

function Write-SyntheticPoolMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  Write-SyntheticDaxBlocks $Path @(
    @{ Id = 9; Raw = (New-SyntheticPoolMonRecord -Name "POOL GUARD" -Hp 5 -Thac0 19 -Ac 9 -DamageCount 1 -DamageSides 5 -DamageBonus 0 -Xp 14) },
    @{ Id = 19; Raw = (New-SyntheticPoolMonRecord -Name "POOL VET" -Hp 7 -Thac0 18 -Ac 7 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Xp 24) }
  )
}

function Write-SyntheticPaddedPoolMonChaDax {
  param(
    [Parameter(Mandatory)][string]$Path
  )

  $blocks = @(
    @{ Id = 9; Raw = (New-SyntheticPoolMonRecord -Name "POOL GUARD" -Hp 5 -Thac0 19 -Ac 9 -DamageCount 1 -DamageSides 5 -DamageBonus 0 -Xp 14) },
    @{ Id = 19; Raw = (New-SyntheticPoolMonRecord -Name "POOL VET" -Hp 7 -Thac0 18 -Ac 7 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Xp 24) }
  )
  $tocBytes = 9 * $blocks.Count
  $pad = 33000
  $entries = @()
  $dataSize = $pad
  foreach ($block in $blocks) {
    [byte[]]$comp = ConvertTo-DaxLiteralRle $block.Raw
    $entries += ,@{
      Id = [int]$block.Id
      Offset = $dataSize
      RawSize = $block.Raw.Length
      Comp = $comp
    }
    $dataSize += $comp.Length
  }

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

Write-SyntheticDokMonChaDax (Join-Path $run "DOKSYN.DAX")
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKSYN.DAX")
# Buck field-provenance variants: each differs from BUCKSYN.DAX in exactly the bytes named.
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKAC.DAX") @{ 55 = 56 }      # AC 10 -> 4
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKTH.DAX") @{ 51 = 40 }      # THAC0 15 -> 20
# Dice variants use 1-sided dice so every enemy hit has an exactly computable damage:
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKD1.DAX") @{ 61 = 1; 63 = 1; 65 = 7 }      # 1d1+7 = 8
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKD2.DAX") @{ 61 = 3; 63 = 1; 65 = 0 }      # 3d1+0 = 3
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKD3.DAX") @{ 61 = 2; 63 = 1; 65 = 255 }    # 2d1-1 = 1 (signed bonus)
Write-SyntheticBuckMonChaDax (Join-Path $run "BUCKCTL.DAX") @{ 100 = 77; 150 = 31; 58 = 3; 60 = 2; 64 = 9; 66 = 5; 180 = 201; 240 = 17 }
Write-SyntheticPoolMonChaDax (Join-Path $run "POOLSYN.DAX")
Write-SyntheticPaddedPoolMonChaDax (Join-Path $run "POOLPAD.DAX")
Write-SyntheticDokWarriorGbprParty (Join-Path $run "DOKWARR.GBP")
Write-SyntheticDokCasterGbprParty (Join-Path $run "DOKCAST.GBP")
Write-SyntheticDqkNpcGbprParty (Join-Path $run "NPCON.GBP") 0xB2
Write-SyntheticDqkNpcGbprParty (Join-Path $run "NPCOFF.GBP") 0
Write-SyntheticDqkNpcGbprParty (Join-Path $run "NPCLOW.GBP") 0x32
New-Item -ItemType Directory -Force (Join-Path $run "SAVE") | Out-Null
[byte[]]$dokCastWiz = [byte[]]::new(220)
$dokCastWiz[73] = 15 # raw DoK Magic Missile, right-justified prepared slot
[IO.File]::WriteAllBytes((Join-Path $run "SAVE\CHRDATA1.WIZ"), $dokCastWiz)
[IO.File]::WriteAllBytes((Join-Path $run "SAVE\CHRDATA2.WIZ"), $dokCastWiz)
[byte[]]$dokCastWizBad = [byte[]]::new(221)
[Array]::Copy($dokCastWiz, $dokCastWizBad, 220)
[IO.File]::WriteAllBytes((Join-Path $run "DOKWIZBAD.BIN"), $dokCastWizBad)
[IO.File]::WriteAllBytes((Join-Path $run "DOKWIZNONE.BIN"), [byte[]]::new(220))
Write-SyntheticWgrdBlocker (Join-Path $run "PFBOX.WGR")
Write-SyntheticWgrdBlocker (Join-Path $run "DEFFX.WGR")
Write-SyntheticDaxBlocks (Join-Path $run "COABHATT.DAX") @(
  @{ Id = 9; Raw = (New-SyntheticCoabMonRecord -Hp 30 -Thac0 1 -Ac -10 -DamageCount 1 -DamageSides 1 -DamageBonus 6 -HalfAttacks 3) }
)
Write-SyntheticDaxBlocks (Join-Path $run "COABATT2.DAX") @(
  @{ Id = 9; Raw = (New-SyntheticCoabMonRecord -Hp 30 -Thac0 1 -Ac -10 -DamageCount 0 -DamageSides 0 -DamageBonus 0 -Attack2DamageCount 10 -Attack2DamageSides 1 -Attack2DamageBonus 4) }
)
Write-SyntheticDaxBlocks (Join-Path $run "COABDUAL.DAX") @(
  @{ Id = 9; Raw = (New-SyntheticCoabMonRecord -Hp 30 -Thac0 1 -Ac -10 -DamageCount 1 -DamageSides 1 -DamageBonus 1 -Attack2DamageCount 10 -Attack2DamageSides 1 -Attack2DamageBonus 4) }
)
[byte[]]$dqkCompactIdTable = [byte[]]::new(6)
[BitConverter]::GetBytes([UInt16]1).CopyTo($dqkCompactIdTable, 0)
[BitConverter]::GetBytes([UInt16]10).CopyTo($dqkCompactIdTable, 2)
[BitConverter]::GetBytes([UInt16]1).CopyTo($dqkCompactIdTable, 4)
[byte[]]$dqkFixedRaw = New-SyntheticDqkFixedMonRecord -Thac0 1 -Ac -10 -HitDice 7 -DamageCount 1 -DamageSides 2 -DamageBonus 4
[byte[]]$dqkCompactMember = ConvertTo-MonchaGlbMember $dqkFixedRaw
Write-SyntheticHlibDataLibrary (Join-Path $run "DQKHATT.GLB") ([byte[][]]@($dqkCompactIdTable, $dqkCompactMember))

# DQK's rate counters require a genuine Gen2 ECL handoff. LOAD_FILES emits the
# CCECL D0xx provenance tag; an untagged raw .BIN cannot activate this path.
[byte[]]$dqkEclIdTable = [byte[]]::new(6)
[BitConverter]::GetBytes([UInt16]1).CopyTo($dqkEclIdTable, 0)
[BitConverter]::GetBytes([UInt16]1).CopyTo($dqkEclIdTable, 2)
[BitConverter]::GetBytes([UInt16]1).CopyTo($dqkEclIdTable, 4)
[byte[]]$dqkCompactAttackEcl = @(
  (0..19 | ForEach-Object { [byte]0 }) +
  [byte[]](0x21,0x00,0x00,0x00,0x00,        # Gen2 LOAD_FILES #0,#0 -> D000
          0x0B,0x00,0x0A,0x00,0x01,0x00,0x00, # LOAD_MONSTER #10,#1,#0
          0x24)                               # COMBAT
)
Write-SyntheticHlibDataLibrary (Join-Path $run "DQKECL.GLB") ([byte[][]]@($dqkEclIdTable, $dqkCompactAttackEcl))

# These fixed low-damage bodies retain both party members for two rounds. The
# trace checks below pin exact attempts per round and preserve zero allowances.
[byte[]]$dqkRate42Raw = New-SyntheticDqkFixedMonRecord -Thac0 0 -Ac -10 -HitDice 7 -DamageCount 1 -DamageSides 1 -DamageBonus 0 -PrimaryAttackRate 4 -SecondaryAttackRate 2 -SecondaryDamageCount 1 -SecondaryDamageSides 1 -SecondaryDamageBonus 1
[byte[]]$dqkRate36Raw = New-SyntheticDqkFixedMonRecord -Thac0 0 -Ac -10 -HitDice 7 -DamageCount 1 -DamageSides 1 -DamageBonus 0 -PrimaryAttackRate 3 -SecondaryAttackRate 6 -SecondaryDamageCount 1 -SecondaryDamageSides 1 -SecondaryDamageBonus 1
[byte[]]$dqkRate10Raw = New-SyntheticDqkFixedMonRecord -Thac0 0 -Ac -10 -HitDice 7 -DamageCount 1 -DamageSides 1 -DamageBonus 0 -PrimaryAttackRate 1 -SecondaryAttackRate 0
[byte[]]$dqkRate02Raw = New-SyntheticDqkFixedMonRecord -Thac0 0 -Ac -10 -HitDice 7 -DamageCount 1 -DamageSides 1 -DamageBonus 0 -PrimaryAttackRate 0 -SecondaryAttackRate 2 -SecondaryDamageCount 1 -SecondaryDamageSides 1 -SecondaryDamageBonus 1
# Mutate each sourced byte independently from 4/2: changing +59 to 1 gives
# 1/2; changing +60 to 0 gives 4/0. The separate 3/6 record is the retail
# odd-rate counterexample (PRINCE TALHOOK), while 1/0, 0/2 and 0/0 pin zeros.
[byte[]]$dqkRate12Raw = $dqkRate42Raw.Clone()
$dqkRate12Raw[0x78 + 59] = 1
[byte[]]$dqkRate40Raw = $dqkRate42Raw.Clone()
$dqkRate40Raw[0x78 + 60] = 0
[byte[]]$dqkRate00Raw = $dqkRate42Raw.Clone()
$dqkRate00Raw[0x78 + 59] = 0
$dqkRate00Raw[0x78 + 60] = 0
foreach ($rateFixture in @(
  @{ Name = "DQKR42"; Raw = $dqkRate42Raw },
  @{ Name = "DQKR36"; Raw = $dqkRate36Raw },
  @{ Name = "DQKR10"; Raw = $dqkRate10Raw },
  @{ Name = "DQKR02"; Raw = $dqkRate02Raw },
  @{ Name = "DQKR40"; Raw = $dqkRate40Raw },
  @{ Name = "DQKR12"; Raw = $dqkRate12Raw },
  @{ Name = "DQKR00"; Raw = $dqkRate00Raw }
)) {
  $member = ConvertTo-MonchaGlbMember $rateFixture.Raw
  Write-SyntheticHlibDataLibrary (Join-Path $run "$($rateFixture.Name).GLB") ([byte[][]]@($dqkCompactIdTable, $member))
}
Write-SyntheticCokGbprParty (Join-Path $run "DOWN.GBP")

$ecl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
[byte[]]$eclBody = @(
  0x0B,0x00,0x09,0x00,0x02,0x00,0x05, # LOAD_MONSTER #9,#2,#5
  0x0B,0x00,0x13,0x00,0x01,0x00,0x02, # LOAD_MONSTER #19,#1,#2
  0x24                                      # COMBAT
)
$ecl.AddRange($eclBody)
[IO.File]::WriteAllBytes((Join-Path $run "ENCBLK.BIN"), $ecl.ToArray())

$coabHalfEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$coabHalfEcl.Add([byte]0) }
[byte[]]$coabHalfEclBody = @(
  0x0B,0x00,0x09,0x00,0x01,0x00,0x05, # LOAD_MONSTER #9,#1,#5
  0x24                                      # COMBAT
)
$coabHalfEcl.AddRange($coabHalfEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "COABHATT.BIN"), $coabHalfEcl.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "COABATT2.BIN"), $coabHalfEcl.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "COABDUAL.BIN"), $coabHalfEcl.ToArray())

$dqkEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$dqkEcl.Add([byte]0) }
[byte[]]$dqkEclBody = @(
  0x0B,0x00,0x01,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #1,#1,#0
  0x0B,0x00,0x02,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #2,#1,#0
  0x24                                      # COMBAT
)
$dqkEcl.AddRange($dqkEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "DQKBLK.BIN"), $dqkEcl.ToArray())

$dqkDecEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$dqkDecEcl.Add([byte]0) }
[byte[]]$dqkDecEclBody = @(
  0x0B,0x00,0x10,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #16,#1,#0 (GIANT ANEMONE, raw dec-path)
  0x0B,0x00,0x11,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #17,#1,#0 (GIANT SQUID, raw dec-path)
  0x24                                      # COMBAT
)
$dqkDecEcl.AddRange($dqkDecEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "DQKDEC.BIN"), $dqkDecEcl.ToArray())

$dqkReconEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$dqkReconEcl.Add([byte]0) }
[byte[]]$dqkReconEclBody = @(
  0x0B,0x00,0x17,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #23,#1,#0 (IRON GOLEM)
  0x0B,0x00,0x12,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #18,#1,#0 (SAHUAGIN)
  0x24                                      # COMBAT
)
$dqkReconEcl.AddRange($dqkReconEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "DQKREC.BIN"), $dqkReconEcl.ToArray())

$dqkShortEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$dqkShortEcl.Add([byte]0) }
[byte[]]$dqkShortEclBody = @(
  0x0B,0x00,0x0A,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #10,#1,#0 (HYDRA, AC 5 / 16 HD read from disk)
  0x0B,0x00,0x0C,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #12,#1,#0 (UMBER HULK, AC 2 read from disk)
  0x24                                      # COMBAT
)
$dqkShortEcl.AddRange($dqkShortEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "DQKST.BIN"), $dqkShortEcl.ToArray())

$dqkNpcEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$dqkNpcEcl.Add([byte]0) }
[byte[]]$dqkNpcEclBody = @(
  0x0B,0x00,0x37,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #55,#1,#0 (BAKALI SHAMAN - a 9-HD monster, NOT an NPC)
  0x0B,0x00,0x40,0x00,0x01,0x00,0x00, # LOAD_MONSTER DQK id #64,#1,#0 (SHARKMAN - race 6 humanoid)
  0x24                                      # COMBAT
)
$dqkNpcEcl.AddRange($dqkNpcEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "DQKNPC.BIN"), $dqkNpcEcl.ToArray())

$viewEcl = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { [void]$viewEcl.Add([byte]0) }
[byte[]]$viewEclBody = @(
  0x0B,0x00,0x09,0x00,0x01,0x00,0x05, # LOAD_MONSTER #9,#1,#5
  0x24                                      # COMBAT
)
$viewEcl.AddRange($viewEclBody)
[IO.File]::WriteAllBytes((Join-Path $run "VIEWBLK.BIN"), $viewEcl.ToArray())

$manyFx = [byte[]]::new(116)
[Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($manyFx, 0)
[BitConverter]::GetBytes([UInt16]2).CopyTo($manyFx, 4)     # version
[BitConverter]::GetBytes([UInt16]0x0008).CopyTo($manyFx, 6) # FX_HAVE_ENC
[BitConverter]::GetBytes([UInt16]3).CopyTo($manyFx, 8)     # COMBAT yield
[BitConverter]::GetBytes([UInt16]9).CopyTo($manyFx, 32)    # overlarge; CCCOMBAT must reject
for ($g = 0; $g -lt 8; $g++) {
  $off = 34 + ($g * 6)
  [BitConverter]::GetBytes([UInt16](9 + $g)).CopyTo($manyFx, $off)
  [BitConverter]::GetBytes([UInt16]4).CopyTo($manyFx, $off + 2)
  [BitConverter]::GetBytes([UInt16](2 + $g)).CopyTo($manyFx, $off + 4)
}
[IO.File]::WriteAllBytes((Join-Path $run "MANYFX.EFX"), $manyFx)

# Encounter capacity includes the loaded party.  A two-member fixture plus
# 31 foes, and a six-member GBPR plus 27 foes, are each one record too large.
function New-CapacityFx([int]$Copies) {
  $fx = [byte[]]::new(116)
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($fx, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($fx, 4)
  [BitConverter]::GetBytes([UInt16]0x0008).CopyTo($fx, 6)
  [BitConverter]::GetBytes([UInt16]3).CopyTo($fx, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx, 32)
  [BitConverter]::GetBytes([UInt16]9).CopyTo($fx, 34)
  [BitConverter]::GetBytes([UInt16]$Copies).CopyTo($fx, 36)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($fx, 38)
  return $fx
}
[IO.File]::WriteAllBytes((Join-Path $run "CAP2FX.EFX"), (New-CapacityFx 31))
[IO.File]::WriteAllBytes((Join-Path $run "CAP6FX.EFX"), (New-CapacityFx 27))
Write-SyntheticCokSixGbprParty (Join-Path $run "SIX.GBP")

# A MON archive is authoritative once supplied.  A valid group followed by an
# unknown id must reject the whole handoff: silently omitting the second group
# would make a smaller, easier battle and still publish a result as if it were
# complete.  DOKSYN.DAX deliberately contains only ids 9 and 19.
$mixedFx = [byte[]]::new(116)
[Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($mixedFx, 0)
[BitConverter]::GetBytes([UInt16]2).CopyTo($mixedFx, 4)
[BitConverter]::GetBytes([UInt16]0x0008).CopyTo($mixedFx, 6)
[BitConverter]::GetBytes([UInt16]3).CopyTo($mixedFx, 8)
[BitConverter]::GetBytes([UInt16]2).CopyTo($mixedFx, 32)
[BitConverter]::GetBytes([UInt16]9).CopyTo($mixedFx, 34)
[BitConverter]::GetBytes([UInt16]1).CopyTo($mixedFx, 36)
[BitConverter]::GetBytes([UInt16]5).CopyTo($mixedFx, 38)
[BitConverter]::GetBytes([UInt16]0x7fff).CopyTo($mixedFx, 40)
[BitConverter]::GetBytes([UInt16]1).CopyTo($mixedFx, 42)
[BitConverter]::GetBytes([UInt16]5).CopyTo($mixedFx, 44)
[IO.File]::WriteAllBytes((Join-Path $run "MIXEDFX.EFX"), $mixedFx)

$realMonAutoexec = ""
if ($hasRealMon) {
  $realMonAutoexec = @"
CCCOMBAT /E C:\ENCEFX.EFX C:\MON1CHA.DAX 4660 > C:\CCOMBRL.TXT
ren CCCOMB.TRC REALMON.TRC
"@
}
$dokMonAutoexec = ""
if ($hasDokMon) {
  $dokMonAutoexec = @"
CCCOMBAT /E C:\ENCEFX.EFX C:\DOKMON.DAX 4660 > C:\DOKMON.TXT
ren CCCOMB.TRC DOKMON.TRC
"@
}
$coabMonAutoexec = ""
if ($hasCoabMon) {
  $coabMonAutoexec = @"
CCECL C:\COABECL5.DAX 50 /E C:\COAB50.EFX > C:\COABCCE.TXT
CCCOMBAT /E C:\COAB50.EFX C:\COABMON5.DAX 4660 C:\COAB50.TRC C:\COAB50.OUT C:\COAB50.RAW > C:\COAB50.TXT
"@
}
$dqkMonAutoexec = ""
if ($hasDqkMon) {
  $dqkMonAutoexec = @"
CCECL C:\DQKBLK.BIN /E C:\DQKEFX.EFX > C:\CDQK.TXT
CCCOMBAT /E C:\DQKEFX.EFX C:\MONCHA.GLB 4660 > C:\DQKMON.TXT
ren CCCOMB.TRC DQKMON.TRC
CCECL C:\DQKDEC.BIN /E C:\DQKDEC.EFX > C:\CDQKD.TXT
CCCOMBAT /E C:\DQKDEC.EFX C:\MONCHA.GLB 4660 C:\DQKDEC.TRC C:\DQKDEC.OUT C:\DQKDEC.RAW > C:\DQKDEC.TXT
CCECL C:\DQKREC.BIN /E C:\DQKREC.EFX > C:\CDQKR.TXT
CCCOMBAT /E C:\DQKREC.EFX C:\MONCHA.GLB 4660 C:\DQKREC.TRC C:\DQKREC.OUT C:\DQKREC.RAW > C:\DQKREC.TXT
CCECL C:\DQKST.BIN /E C:\DQKST.EFX > C:\CDQKS.TXT
CCCOMBAT /E C:\DQKST.EFX C:\MONCHA.GLB 4660 C:\DQKST.TRC C:\DQKST.OUT C:\DQKST.RAW > C:\DQKST.TXT
CCECL C:\DQKNPC.BIN /E C:\DQKNPC.EFX > C:\CDQKN.TXT
CCCOMBAT /E C:\DQKNPC.EFX C:\MONCHA.GLB 4660 C:\DQKNPC.TRC C:\DQKNPC.OUT C:\DQKNPC.RAW > C:\DQKNPC.TXT
"@
}

$runBat = Join-Path $run "RUN.BAT"
@"
@echo off
CCCOMBAT /T 1 4660 C:\FIXTURE.TRC /R C:\FIXTURE.GBR > C:\CCCOMBAT.TXT
CCCOMBAT /T 2 4660 C:\BOUND.TRC > C:\BOUND.TXT
CCCOMBAT /T 3 4660 C:\OVERKILL.TRC > C:\OVERKILL.TXT
CCCOMBAT /T 4 4660 C:\LARGE.TRC > C:\LARGE.TXT
CCCOMBAT /T 5 4660 C:\GEN2.TRC > C:\GEN2.TXT
CCCOMBAT /T 6 4660 C:\LGMOVE.TRC > C:\LGMOVE.TXT
CCCOMBAT /T 40 4660 C:\BACKMOVE.TRC /C M4DE > C:\BACKMOVE.TXT
CCCOMBAT /T 40 4660 C:\BACKGRD.TRC /C GQQQQQQQQQQQQQQQQQQQQQQQ > C:\BACKGRD.TXT
CCCOMBAT /T 40 4660 C:\STAYADJ.TRC /C M2DE > C:\STAYADJ.TXT
CCCOMBAT /T 41 4660 C:\STEPORTH.TRC /C M44444444E > C:\STEPORTH.TXT
CCCOMBAT /T 41 4660 C:\STEPDIAG.TRC /C M11111111E > C:\STEPDIAG.TXT
CCCOMBAT /T 42 4660 C:\STEPCAP.TRC /C M11111111E > C:\STEPCAP.TXT
CCCOMBAT /T 45 4660 C:\TSPLIT.TRC /C M44DM4444E > C:\TSPLIT.TXT
CCCOMBAT /T 45 4660 C:\CMDUNSUP.TRC /C A > C:\CMDUNSUP.TXT
CCCOMBAT /T 45 4660 C:\CMDEND.TRC /C E > C:\CMDEND.TXT
CCCOMBAT /T 46 4660 C:\QUICKPART.TRC /C M44DQ > C:\QUICKPART.TXT
CCCOMBAT /T 46 4660 C:\QUICKFULL.TRC /C Q > C:\QUICKFULL.TXT
CCCOMBAT /T 46 4660 C:\FLEEDIR.TRC /C M44DF > C:\FLEEDIR.TXT
CCCOMBAT /T 46 4660 C:\FLEEMOV.TRC /C M44F > C:\FLEEMOV.TXT
CCCOMBAT /T 46 4660 C:\FLEEFULL.TRC /C F > C:\FLEEFULL.TXT
CCCOMBAT /T 47 4660 C:\DELAYLED.TRC /C M44DDM4444E > C:\DELAYLED.TXT
CCCOMBAT /T 48 4660 C:\QUICKATT.TRC /C M6DQ > C:\QUICKATT.TXT
CCROUTE /T 48 4660 C:\ROUTEHIT.TRC > C:\ROUTEHIT.TXT
CCCOMBAT /T 43 4660 C:\BUMPKILL.TRC /C M64DE > C:\BUMPKILL.TXT
CCCOMBAT /T 44 4660 C:\BUMPLIVE.TRC /C M64DE > C:\BUMPLIVE.TXT
CCCOMBAT /T 44 4660 C:\BUMPG.TRC /C M6G > C:\BUMPG.TXT
CCCOMBAT /T 7 4660 C:\BUDGET.TRC > C:\BUDGET.TXT
CCCOMBAT /T 7 4660 C:\CMDGUARD.TRC /C G > C:\CMDGUARD.TXT
CCCOMBAT /T 8 4660 C:\ROUTE.TRC > C:\ROUTE.TXT
CCCOMBAT /T 9 4660 C:\TERRAIN.TRC > C:\TERRAIN.TXT
CCCOMBAT /T 10 4660 C:\COST.TRC > C:\COST.TXT
CCCOMBAT /T 11 4660 C:\MOVE1.TRC > C:\MOVE1.TXT
CCCOMBAT /T 12 4660 C:\MISSILE.TRC > C:\MISSILE.TXT
CCCOMBAT /T 13 4660 C:\BODYLOS.TRC > C:\BODYLOS.TXT
CCCOMBAT /T 14 4660 C:\TERRLOS.TRC > C:\TERRLOS.TXT
CCCOMBAT /T 15 4660 C:\MSHORT.TRC > C:\MSHORT.TXT
CCCOMBAT /T 16 4660 C:\MMEDIUM.TRC > C:\MMEDIUM.TXT
CCCOMBAT /T 17 4660 C:\MLONG.TRC > C:\MLONG.TXT
CCCOMBAT /T 18 4660 C:\LGTLOS.TRC > C:\LGTLOS.TXT
CCCOMBAT /T 19 4660 C:\LGSLOS.TRC > C:\LGSLOS.TXT
CCCOMBAT /T 20 4660 C:\LGALLOS.TRC > C:\LGALLOS.TXT
CCCOMBAT /T 21 4660 C:\MORALEF.TRC > C:\MORALEF.TXT
CCCOMBAT /T 22 4660 C:\MORALES.TRC > C:\MORALES.TXT
CCCOMBAT /T 23 4660 C:\ROUTFLEE.TRC > C:\ROUTFLEE.TXT
CCCOMBAT /F 24 4660 C:\PFLEEOK.TRC C:\PFLEEOK.OUT > C:\PFLEEOK.TXT
CCCOMBAT /F 25 4660 C:\PFLEEBLK.TRC C:\PFLEEBLK.OUT > C:\PFLEEBLK.TXT
md C:\OUTDIR
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\BADN.TRC C:\OUTDIR /R C:\BADN.GBR > C:\BADN.TXT
if errorlevel 1 echo rejected>C:\BADN.RC
CCCOMBAT /F 24 4660 C:\BADF.TRC C:\OUTDIR /R C:\BADF.GBR > C:\BADF.TXT
if errorlevel 1 echo rejected>C:\BADF.RC
CCCOMBAT /T 24 4660 C:\CMDPFOK.TRC /C P > C:\CMDPFOK.TXT
CCCOMBAT /T 25 4660 C:\CMDPFB.TRC /C P > C:\CMDPFB.TXT
CCCOMBAT /T 26 4660 C:\HAZSTART.TRC > C:\HAZSTART.TXT
CCCOMBAT /T 27 4660 C:\HAZMOVE.TRC > C:\HAZMOVE.TXT
CCCOMBAT /T 27 4660 C:\HAZCMD.TRC /C M6E > C:\HAZCMD.TXT
CCCOMBAT /T 28 4660 C:\GUARD.TRC > C:\GUARD.TXT
CCCOMBAT /T 29 4660 C:\HAZSTAT.TRC > C:\HAZSTAT.TXT
CCCOMBAT /T 30 4660 C:\HAZSAVE.TRC > C:\HAZSAVE.TXT
CCCOMBAT /T 31 4660 C:\HELD.TRC > C:\HELD.TXT
CCCOMBAT /T 32 4660 C:\HLDGUARD.TRC > C:\HLDGUARD.TXT
CCCOMBAT /T 33 4660 C:\STATEXP.TRC > C:\STATEXP.TXT
CCCOMBAT /T 34 4660 C:\COUP.TRC > C:\COUP.TXT
CCCOMBAT /T 35 4660 C:\GEN2WAK.TRC > C:\GEN2WAK.TXT
CCCOMBAT /T 36 4660 C:\G2DIAG.TRC > C:\G2DIAG.TXT
CCCOMBAT /T 37 4660 C:\MSLEEP.TRC > C:\MSLEEP.TXT
CCCOMBAT /T 38 4660 C:\MULTI.TRC > C:\MULTI.TXT
CCCOMBAT /T 39 4660 C:\HALFATT.TRC > C:\HALFATT.TXT
CCCOMBAT /V 1 4660 C:\VIEW.RAW > C:\CCOMBV.TXT
CCECL C:\ENCBLK.BIN /E C:\ENCEFX.EFX > C:\CCECL.TXT
CCECL C:\ENCBLK.BIN /E C:\DEFFX.EFX > C:\CCDEF.TXT
CCECL C:\VIEWBLK.BIN /E C:\VIEWFX.EFX > C:\CCEVIEW.TXT
CCCOMBAT /V C:\VIEWFX.EFX 4660 C:\VIEWFX.RAW > C:\CCOMBVFX.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\GBEF.TRC C:\GBEF.OUT C:\GBEF.RAW > C:\CCOMBEFX.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\GBEFPF.TRC C:\GBEFPF.OUT /C P > C:\GBEFPF.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\GBEFW.TRC C:\GBEFW.OUT /C P /W C:\PFBOX.WGR > C:\GBEFW.TXT
CCCOMBAT /E C:\DEFFX.EFX 4660 C:\GBEFWD.TRC C:\GBEFWD.OUT /C P > C:\GBEFWD.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\DOWNP.TRC C:\DOWNP.OUT /P C:\DOWN.GBP > C:\DOWNP.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\DOKWARR.TRC C:\DOKWARR.OUT /P C:\DOKWARR.GBP > C:\DOKWARR.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\NPCON.TRC C:\NPCON.OUT /P C:\NPCON.GBP /C EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE > C:\NPCON.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\NPCOFF.TRC C:\NPCOFF.OUT /P C:\NPCOFF.GBP /C EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE > C:\NPCOFF.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\NPCLOW.TRC C:\NPCLOW.OUT /P C:\NPCLOW.GBP /C EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE > C:\NPCLOW.TXT
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\DOKCAST.TRC C:\DOKCAST.OUT /P C:\DOKCAST.GBP /C CC /R C:\DOKCAST.GBR > C:\DOKCAST.TXT
CCCOMBAT /K C:\ENCEFX.EFX 4660 C:\KCAST.TRC C:\KCAST.OUT /C CGQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ > C:\KCAST.TXT
CCCOMBAT /K C:\ENCEFX.EFX 4660 C:\KCASTCTL.TRC C:\KCASTCTL.OUT /C GQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ > C:\KCASTCTL.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\DOKSYN.DAX 4660 C:\DOKSYN.TRC C:\DOKSYN.OUT C:\DOKSYN.RAW > C:\DOKSYN.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKSYN.DAX 4660 C:\BUCKSYN.TRC C:\BUCKSYN.OUT C:\BUCKSYN.RAW > C:\BUCKSYN.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKAC.DAX 4660 C:\BUCKAC.TRC C:\BUCKAC.OUT > C:\BUCKAC.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKTH.DAX 4660 C:\BUCKTH.TRC C:\BUCKTH.OUT > C:\BUCKTH.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKD1.DAX 4660 C:\BUCKD1.TRC C:\BUCKD1.OUT > C:\BUCKD1.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKD2.DAX 4660 C:\BUCKD2.TRC C:\BUCKD2.OUT > C:\BUCKD2.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKD3.DAX 4660 C:\BUCKD3.TRC C:\BUCKD3.OUT > C:\BUCKD3.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\BUCKCTL.DAX 4660 C:\BUCKCTL.TRC C:\BUCKCTL.OUT > C:\BUCKCTL.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\POOLSYN.DAX 4660 C:\POOLSYN.TRC C:\POOLSYN.OUT C:\POOLSYN.RAW > C:\POOLSYN.TXT
CCCOMBAT /E C:\ENCEFX.EFX C:\POOLPAD.DAX 4660 C:\POOLPAD.TRC C:\POOLPAD.OUT C:\POOLPAD.RAW > C:\POOLPAD.TXT
CCECL C:\COABHATT.BIN /E C:\COABHATT.EFX > C:\COABHAT.TXT
CCCOMBAT /E C:\COABHATT.EFX C:\COABHATT.DAX 4660 C:\COABHATT.TRC C:\COABHATT.OUT > C:\COABHATC.TXT
CCECL C:\COABATT2.BIN /E C:\COABATT2.EFX > C:\COABAT2E.TXT
CCCOMBAT /E C:\COABATT2.EFX C:\COABATT2.DAX 4660 C:\COABATT2.TRC C:\COABATT2.OUT > C:\COABAT2C.TXT
CCECL C:\COABDUAL.BIN /E C:\COABDUAL.EFX > C:\COABDUAE.TXT
CCCOMBAT /E C:\COABDUAL.EFX C:\COABDUAL.DAX 4660 C:\COABDUAL.TRC C:\COABDUAL.OUT > C:\COABDUAC.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKHATT.EFX > C:\DQKHAT.TXT
CCCOMBAT /E C:\DQKHATT.EFX C:\DQKHATT.GLB 4660 C:\DQKHATT.TRC C:\DQKHATT.OUT > C:\DQKHATC.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR42.EFX > C:\DQKR42E.TXT
CCCOMBAT /E C:\DQKR42.EFX C:\DQKR42.GLB 4660 C:\DQKR42.TRC C:\DQKR42.OUT > C:\DQKR42C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR36.EFX > C:\DQKR36E.TXT
CCCOMBAT /E C:\DQKR36.EFX C:\DQKR36.GLB 4660 C:\DQKR36.TRC C:\DQKR36.OUT > C:\DQKR36C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR10.EFX > C:\DQKR10E.TXT
CCCOMBAT /E C:\DQKR10.EFX C:\DQKR10.GLB 4660 C:\DQKR10.TRC C:\DQKR10.OUT > C:\DQKR10C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR02.EFX > C:\DQKR02E.TXT
CCCOMBAT /E C:\DQKR02.EFX C:\DQKR02.GLB 4660 C:\DQKR02.TRC C:\DQKR02.OUT > C:\DQKR02C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR40.EFX > C:\DQKR40E.TXT
CCCOMBAT /E C:\DQKR40.EFX C:\DQKR40.GLB 4660 C:\DQKR40.TRC C:\DQKR40.OUT > C:\DQKR40C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR12.EFX > C:\DQKR12E.TXT
CCCOMBAT /E C:\DQKR12.EFX C:\DQKR12.GLB 4660 C:\DQKR12.TRC C:\DQKR12.OUT > C:\DQKR12C.TXT
CCECL C:\DQKECL.GLB 1 /E C:\DQKR00.EFX > C:\DQKR00E.TXT
CCCOMBAT /E C:\DQKR00.EFX C:\DQKR00.GLB 4660 C:\DQKR00.TRC C:\DQKR00.OUT > C:\DQKR00C.TXT
CCCOMBAT /K C:\DQKHATT.EFX C:\DQKHATT.GLB 4660 C:\DQKK.TRC C:\DQKK.OUT /C QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ > C:\DQKKC.TXT
CCCOMBAT /E C:\MANYFX.EFX 4660 C:\MANY.TRC C:\MANY.OUT C:\MANY.RAW > C:\MANY.TXT
CCCOMBAT /E C:\CAP2FX.EFX 4660 C:\CAP2.TRC C:\CAP2.OUT C:\CAP2.RAW > C:\CAP2.TXT
CCCOMBAT /E C:\CAP6FX.EFX 4660 C:\CAP6.TRC C:\CAP6.OUT C:\CAP6.RAW /P C:\SIX.GBP > C:\CAP6.TXT
CCCOMBAT /E C:\MIXEDFX.EFX C:\DOKSYN.DAX 4660 C:\MIXED.TRC C:\MIXED.OUT /R C:\MIXED.GBR > C:\MIXED.TXT
$realMonAutoexec
$dokMonAutoexec
$coabMonAutoexec
$dqkMonAutoexec
exit
"@ | Set-Content -Path $runBat -Encoding ASCII

$conf = Join-Path $run "_cccombat.conf"
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
RUN.BAT
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCCOMBAT smoke test"
}

function Invoke-DokCastProbe([string]$Name, [string]$Commands) {
  @"
CCCOMBAT /E C:\ENCEFX.EFX 4660 C:\$Name.TRC C:\$Name.OUT /P C:\DOKWARR.GBP /C $Commands /R C:\$Name.GBR > C:\$Name.TXT
exit
"@ | Set-Content -Path $runBat -Encoding ASCII
  $probe = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $probe.WaitForExit(60000)) {
    try { $probe.Kill() } catch {}
    throw "DOSBox did not exit while running $Name cast probe"
  }
}

$dokCastSourceBeforeProbe = [IO.File]::ReadAllBytes((Join-Path $run "SAVE\CHRDATA1.WIZ"))
[IO.File]::WriteAllBytes((Join-Path $run "SAVE\CHRDATA1.WIZ"), [IO.File]::ReadAllBytes((Join-Path $run "DOKWIZNONE.BIN")))
Invoke-DokCastProbe "DOKNONE" "CCCCCCCCCCCCCCCCCCCCCCCC"
[IO.File]::WriteAllBytes((Join-Path $run "SAVE\CHRDATA1.WIZ"), [IO.File]::ReadAllBytes((Join-Path $run "DOKWIZBAD.BIN")))
Invoke-DokCastProbe "DOKBAD" "C"

# CoK monster movement (NATIVE-TASKS Task 113): a CoK 409-byte MON record's +0xD5
# byte is the movement rate (retail GAME.OVR 0x3755D copies it to combatant
# +0x198; CalcMoves 0x14EB7 clamps outside 1..96 to 1 and doubles it to
# half-squares).  Twelve copies of one record are placed; e11 starts at (8,6)
# behind a solid wall column at col 7 (rows 0..8, gap at row 9), so its round-1
# path is a long detour whose length is cut off only by the move budget.
# Each variant differs from the others in the single +0xD5 byte.
# Mapping and derivation: docs/engine/research/cok-monster-move.md, and the
# independent expectation in tools/cok_monster_move.py.
function Invoke-CokMoveProbe([string]$Name, [int]$Mv) {
  [byte[]]$rec = [byte[]]::new(409)
  $rec[98] = 100; $rec[89] = 40; $rec[275] = 50; $rec[269] = 1; $rec[271] = 2
  $rec[213] = [byte]$Mv
  Write-SyntheticDaxBlocks (Join-Path $run "$Name.DAX") @(@{ Id = 9; Raw = $rec })
  [byte[]]$fx = [byte[]]::new(116)
  [Text.Encoding]::ASCII.GetBytes("GBEF").CopyTo($fx, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($fx, 4)
  [BitConverter]::GetBytes([UInt16]0x0008).CopyTo($fx, 6)
  [BitConverter]::GetBytes([UInt16]3).CopyTo($fx, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx, 32)
  [BitConverter]::GetBytes([UInt16]9).CopyTo($fx, 34)
  [BitConverter]::GetBytes([UInt16]12).CopyTo($fx, 36)
  [BitConverter]::GetBytes([UInt16]5).CopyTo($fx, 38)
  [IO.File]::WriteAllBytes((Join-Path $run "CKMVFX.EFX"), $fx)
  if (-not (Test-Path (Join-Path $run "CKMVWALL.WGR"))) {
    [byte[]]$wg = [byte[]]::new(6 + (10 * 10 * 4))
    [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($wg, 0)
    $wg[4] = 10; $wg[5] = 10
    for ($r = 0; $r -le 8; $r++) {
      for ($k = 0; $k -lt 4; $k++) { $wg[6 + ((($r * 10) + 7) * 4) + $k] = 1 }
    }
    [IO.File]::WriteAllBytes((Join-Path $run "CKMVWALL.WGR"), $wg)
  }
  @"
CCCOMBAT /E C:\CKMVFX.EFX C:\$Name.DAX 4660 C:\$Name.TRC C:\$Name.OUT /W C:\CKMVWALL.WGR > C:\$Name.TXT
exit
"@ | Set-Content -Path $runBat -Encoding ASCII
  $probe = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $probe.WaitForExit(60000)) {
    try { $probe.Kill() } catch {}
    throw "DOSBox did not exit while running $Name CoK movement probe"
  }
}

if ($true) {
  $cokMoveCases = @{}
  foreach ($mv in 6, 12, 1, 0, 97) {
    Invoke-CokMoveProbe "CKMV$mv" $mv
    $cokMoveCases[$mv] = @(Get-Content (Join-Path $run "CKMV$mv.TRC"))
    if ($cokMoveCases[$mv].Count -lt 10) { throw "CCCOMBAT CoK movement probe $mv produced no trace" }
  }
  $e11 = @{}
  foreach ($mv in $cokMoveCases.Keys) {
    $e11[$mv] = @($cokMoveCases[$mv] | Where-Object { $_ -match '^1 move e11 ' })
  }
  $e11Mv6 = @(
    "1 move e11 - - - - - - - 8 7",
    "1 move e11 - - - - - - - 8 8",
    "1 move e11 - - - - - - - 7 9",
    "1 move e11 - - - - - - - 6 8"
  )
  # Half-square ledger: 6 squares = 12 half-squares; the four steps cost
  # 2+2+3+3 = 10 and the next step would cross 12.  12 squares = 24 half-squares
  # carries the same detour on to (2,6).
  $e11Mv12Tail = "1 move e11 - - - - - - - 2 6"
  if (($e11[6] -join '|') -ne ($e11Mv6 -join '|')) {
    throw "CCCOMBAT CoK +0xD5=6 movement budget: expected e11 round-1 path '$($e11Mv6 -join ' / ')', got '$($e11[6] -join ' / ')'"
  }
  if ($e11[12].Count -le $e11[6].Count -or $e11[12][-1] -ne $e11Mv12Tail -or ($e11[12][0..3] -join '|') -ne ($e11Mv6 -join '|')) {
    throw "CCCOMBAT CoK +0xD5=12 movement budget: expected the +0xD5=6 path extended to '$e11Mv12Tail', got '$($e11[12] -join ' / ')'"
  }
  # Retail CalcMoves: a rate outside 1..96 becomes 1, so 0, 1 and 97 are the
  # same budget and must produce byte-identical traces.
  $mv1Hash = (Get-FileHash (Join-Path $run "CKMV1.TRC")).Hash
  foreach ($mv in 0, 97) {
    if ((Get-FileHash (Join-Path $run "CKMV$mv.TRC")).Hash -ne $mv1Hash) {
      throw "CCCOMBAT CoK +0xD5=$mv did not clamp to the 1-square budget of +0xD5=1"
    }
  }
  if ($e11[1].Count -ne 0) {
    throw "CCCOMBAT CoK +0xD5=1 let e11 detour in round 1 ($($e11[1].Count) moves)"
  }
  # Mutating +0xD5 may only change the movement: the traces share every line up to
  # the first divergence, and that line is a monster move.
  foreach ($pair in @(@(6, 12), @(1, 6))) {
    $a = $cokMoveCases[$pair[0]]; $b = $cokMoveCases[$pair[1]]
    $i = 0
    while ($i -lt $a.Count -and $i -lt $b.Count -and $a[$i] -eq $b[$i]) { $i++ }
    if ($i -ge $a.Count -or $i -ge $b.Count) { throw "CCCOMBAT CoK +0xD5 $($pair[0]) vs $($pair[1]) traces never diverge" }
    if (($a[$i] -notmatch '^\d+ move e\d+ ') -and ($b[$i] -notmatch '^\d+ move e\d+ ')) {
      throw "CCCOMBAT CoK +0xD5 $($pair[0]) vs $($pair[1]) first diverge on a non-move line: '$($a[$i])' / '$($b[$i])'"
    }
  }
  Write-Output "[PASS] CCCOMBAT: CoK monster movement from record +0xD5 (6 vs 12 budgets differ; 0/97 clamp to 1)"
}

# CoK PARTY movement (Task 113 follow-up): a saved CoK character record's +0x198
# byte (effective movement rate; retail 6 for SIR STRONGSWORD, 9 for the other
# five pregens) feeds the same CalcMoves 0x14EB7 clamp as the monster side
# (outside 1..96 -> 1).  A GBPR party runs against one CKMV1 foe e0 at (5,4);
# p0 starts at (3,2) and p1 at (3,3).  A wall column at col 4 (rows 0..$Wall) forces a
# detour south of it, and the square the party ends on is the reachable square
# beside e0 that is first in row-major order, so a bigger budget walks a
# different, longer path.  Only the +0x198 byte(s) differ between variants.
function Invoke-CokPartyMoveProbe([string]$Name, [int[]]$Mv, [int]$Wall) {
  [byte[]]$bytes = [byte[]]::new(16 + (410 * $Mv.Count))
  [Text.Encoding]::ASCII.GetBytes("GBPR").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$Mv.Count).CopyTo($bytes, 6)
  [BitConverter]::GetBytes([UInt16]410).CopyTo($bytes, 8)
  for ($i = 0; $i -lt $Mv.Count; $i++) {
    [byte[]]$body = New-SyntheticCokGbprBody -Name "RUNNER$i" -Hp 100 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 2 -DamageBonus 0 -Xp 1
    $body[407] = 100
    $body[408] = [byte]$Mv[$i]
    $bytes[16 + (410 * $i)] = [byte]($i + 1)
    [Array]::Copy($body, 0, $bytes, 17 + (410 * $i), 409)
  }
  [IO.File]::WriteAllBytes((Join-Path $run "$Name.GBP"), $bytes)
  [byte[]]$wg = [byte[]]::new(6 + (10 * 10 * 4))
  [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($wg, 0)
  $wg[4] = 10; $wg[5] = 10
  for ($r = 0; $r -le $Wall; $r++) {
    for ($k = 0; $k -lt 4; $k++) { $wg[6 + ((($r * 10) + 4) * 4) + $k] = 1 }
  }
  [IO.File]::WriteAllBytes((Join-Path $run "$Name.WGR"), $wg)
  [byte[]]$fx1 = [IO.File]::ReadAllBytes((Join-Path $run "CKMVFX.EFX"))
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx1, 36)
  [IO.File]::WriteAllBytes((Join-Path $run "CKPMFX.EFX"), $fx1)
  @"
CCCOMBAT /E C:\CKPMFX.EFX C:\CKMV1.DAX 4660 C:\$Name.TRC C:\$Name.OUT /W C:\$Name.WGR /P C:\$Name.GBP > C:\$Name.TXT
exit
"@ | Set-Content -Path $runBat -Encoding ASCII
  $probe = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $probe.WaitForExit(60000)) {
    try { $probe.Kill() } catch {}
    throw "DOSBox did not exit while running $Name CoK party movement probe"
  }
  $t = Join-Path $run "$Name.TRC"
  if (-not (Test-Path $t)) { throw "CCCOMBAT CoK party movement probe $Name produced no trace" }
  return ,@(Get-Content $t | Where-Object { $_ -match '^1 move p\d ' })
}

if ($true) {
  function ConvertTo-PartyPath([string[]]$Lines) { return (($Lines | ForEach-Object { ($_ -split ' ')[-2..-1] -join ',' }) -join ' ') }
  # Wall rows 0..4: +0x198 6 stops at (4,5); 9 and 12 continue to (5,3).
  $a6 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPA6" @(6) 4)
  $a9 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPA9" @(9) 4)
  $a97 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPA97" @(97) 4)
  $a1 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPA1" @(1) 4)
  # Wall rows 0..5: 6 cannot reach any square beside e0, 9 ends at (6,4), 12 at (5,3).
  $b6 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPB6" @(6) 5)
  $b9 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPB9" @(9) 5)
  $b12 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPB12" @(12) 5)
  # Open ground (wall only at row 0, off every path): p0 holds 1 so p1 at (3,3) is the
  # only mover; one orthogonal square, (4,3), is adjacent to e0, so 0 must act as 1.
  $c0 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPC0" @(1, 0) 0)
  $c1 = ConvertTo-PartyPath (Invoke-CokPartyMoveProbe "CKPC1" @(1, 1) 0)
  Write-Output "CKPA6=[$a6] CKPA9=[$a9] CKPA97=[$a97] CKPA1=[$a1]"
  Write-Output "CKPB6=[$b6] CKPB9=[$b9] CKPB12=[$b12] CKPC0=[$c0] CKPC1=[$c1]"
  if ($a6 -ne '3,3 3,4 4,5') { throw "CCCOMBAT CoK party +0x198=6 (wall 0..4): expected '3,3 3,4 4,5', got '$a6'" }
  if ($a9 -ne '3,3 3,4 4,5 5,5 6,4 5,3') { throw "CCCOMBAT CoK party +0x198=9 (wall 0..4): expected '3,3 3,4 4,5 5,5 6,4 5,3', got '$a9'" }
  if ($a1 -ne '') { throw "CCCOMBAT CoK party +0x198=1 moved: '$a1'" }
  if ($a97 -ne $a1) { throw "CCCOMBAT CoK party +0x198=97 did not clamp to 1: '$a97'" }
  if ($b6 -ne '') { throw "CCCOMBAT CoK party +0x198=6 (wall 0..5): expected no move, got '$b6'" }
  if ($b9 -ne '3,3 3,4 3,5 4,6 5,5 6,4') { throw "CCCOMBAT CoK party +0x198=9 (wall 0..5): expected '3,3 3,4 3,5 4,6 5,5 6,4', got '$b9'" }
  if ($b12 -ne '3,3 3,4 3,5 4,6 5,5 6,4 5,3') { throw "CCCOMBAT CoK party +0x198=12 (wall 0..5): expected the 9-path plus '5,3', got '$b12'" }
  if ($c1 -ne '4,3') { throw "CCCOMBAT CoK party p1 +0x198=1 (open): expected '4,3', got '$c1'" }
  if ($c0 -ne $c1) { throw "CCCOMBAT CoK party +0x198=0 did not clamp to 1: '$c0' vs '$c1'" }
  Write-Output "[PASS] CCCOMBAT: CoK party movement from record +0x198 (6/9/12 detours differ; 0/97 clamp to 1)"
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

function Assert-TraceLacksActiveToken([string]$Path, [string]$Token, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: trace missing"
  }
  $actual = @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 })
  foreach ($line in $actual) {
    $parts = @($line -split ' ')
    if ($parts.Count -gt 1 -and $parts[1] -eq "init") {
      continue
    }
    if ($parts -contains $Token) {
      throw "$Label failed: unexpected trace token '$Token' in '$line'"
    }
  }
}

# Buck combat-field provenance (NATIVE-TASKS item 8).  Compares a mutated fixture's
# trace against BUCKSYN's over the prefix where both runs drew identical RNG (same
# round/type/actor/target/roll), because a changed hit flips the draw stream afterwards.
function Read-BuckAttackRows([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Buck provenance: trace missing: $Path" }
  @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 } | ForEach-Object { , @($_ -split ' ') })
}
function Get-BuckPrefix($Base, $Var) {
  $n = [Math]::Min($Base.Count, $Var.Count)
  $out = @()
  for ($i = 0; $i -lt $n; $i++) {
    $b = $Base[$i]; $v = $Var[$i]
    if ($b[1] -ne 'attack' -or $v[1] -ne 'attack') {
      if (($b -join ' ') -ne ($v -join ' ')) { break } else { continue }
    }
    if (($b[0..4] -join ' ') -ne ($v[0..4] -join ' ')) { break }
    $out += , @($b, $v)
  }
  return $out
}
function Assert-BuckNeededShift([string]$Label, [string]$VarPath, [string]$ShiftActor, [int]$Shift) {
  $base = Read-BuckAttackRows (Join-Path $run "BUCKSYN.TRC")
  $var = Read-BuckAttackRows $VarPath
  $pairs = Get-BuckPrefix $base $var
  $shifted = 0; $held = 0
  foreach ($pr in $pairs) {
    $bn = [int]$pr[0][5]; $vn = [int]$pr[1][5]
    if ($pr[0][2].StartsWith($ShiftActor)) {
      if ($vn -ne ($bn + $Shift)) { throw "$Label failed: '$($pr[1] -join ' ')' needed $vn, expected base $bn + $Shift" }
      $shifted++
    } else {
      if ($vn -ne $bn) { throw "$Label failed: unrelated side moved: '$($pr[1] -join ' ')' vs base '$($pr[0] -join ' ')'" }
      $held++
    }
  }
  if ($shifted -lt 1) { throw "$Label failed: no '$ShiftActor*' attack row in the shared-RNG prefix, so the probe could not engage" }
  Write-Output "[PASS] $Label ($shifted $ShiftActor-rows shifted by $Shift, $held other-side rows unchanged, prefix $($pairs.Count) rows)"
}
function Assert-BuckEnemyDamage([string]$Label, [string]$VarPath, [int]$Expected) {
  $rows = Read-BuckAttackRows $VarPath
  $hits = @($rows | Where-Object { $_[1] -eq 'attack' -and $_[2].StartsWith('e') -and $_[6] -eq '1' })
  if ($hits.Count -lt 1) { throw "$Label failed: no enemy hit in trace, so the probe could not engage" }
  foreach ($h in $hits) {
    if ([int]$h[7] -ne $Expected) { throw "$Label failed: enemy hit '$($h -join ' ')' damage $($h[7]), expected exactly $Expected" }
  }
  Write-Output "[PASS] $Label ($($hits.Count) enemy hits all deal exactly $Expected)"
}

function Invoke-TacticalOracleParity([string]$TracePath) {
  if ($env:GOLDBOX_SKIP_TS_ORACLE -match '^(1|true|yes)$') {
    Write-Host "Skipping CCCOMBAT TypeScript oracle parity because GOLDBOX_SKIP_TS_ORACLE is set"
    return
  }
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Skipping CCCOMBAT TypeScript oracle parity because pnpm was not found"
    return
  }

  $oldTrace = $env:GOLDBOX_NATIVE_CCCOMBAT_TRACE
  try {
    $env:GOLDBOX_NATIVE_CCCOMBAT_TRACE = $TracePath
    Push-Location $root
    try {
      & pnpm --filter "@goldbox/engine" exec vitest run test/nativeCombatTrace.test.ts
      if ($LASTEXITCODE -ne 0) {
        throw "CCCOMBAT TypeScript oracle parity failed"
      }
    } finally {
      Pop-Location
    }
  } finally {
    if ($null -eq $oldTrace) {
      Remove-Item Env:GOLDBOX_NATIVE_CCCOMBAT_TRACE -ErrorAction SilentlyContinue
    } else {
      $env:GOLDBOX_NATIVE_CCCOMBAT_TRACE = $oldTrace
    }
  }
}

function Assert-CombatViewRaw([string]$Path, [int]$MinEnemy = 400, [int]$MaxEnemy = 8000, [int]$EnemyX = 136, [int]$EnemyY = 112) {
  if (-not (Test-Path $Path)) {
    # Name the file that is ACTUALLY missing. This message was the literal string
    # "VIEW.RAW missing" for every caller, and there are 13 of them -- so a failure
    # on VIEWFX.RAW reported a file that was present and 64772 bytes on disk, and
    # read as a defect in the wrong subject. Same class as the README status blocks
    # filed under the wrong script: every word was true except which thing it named.
    throw "CCCOMBAT /V smoke failed: $(Split-Path -Leaf $Path) missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768)) {
    throw "CCCOMBAT /V smoke failed: unexpected VIEW.RAW length $($bytes.Length)"
  }
  $w = [BitConverter]::ToUInt16($bytes, 0)
  $h = [BitConverter]::ToUInt16($bytes, 2)
  if ($w -ne 320 -or $h -ne 200) {
    throw "CCCOMBAT /V smoke failed: invalid VIEW.RAW header"
  }

  function Pixel([int]$X, [int]$Y) {
    return $bytes[4 + ($Y * 320) + $X]
  }

  if ((Pixel 0 0) -ne 0 -or (Pixel 8 8) -ne 8 -or (Pixel 112 136) -ne 10 -or (Pixel $EnemyX $EnemyY) -ne 12) {
    throw "CCCOMBAT /V smoke failed: expected grid/party/enemy pixels not found"
  }

  $party = 0
  $enemy = 0
  $grid = 0
  for ($i = 4; $i -lt 64004; $i++) {
    switch ($bytes[$i]) {
      8 { $grid++ }
      10 { $party++ }
      12 { $enemy++ }
    }
  }
  if ($grid -lt 2400 -or $party -lt 400 -or $enemy -lt $MinEnemy -or $enemy -gt $MaxEnemy) {
    throw "CCCOMBAT /V smoke failed: sparse framebuffer grid=$grid party=$party enemy=$enemy"
  }
}

function Assert-OutcomeFile([string]$Path, [string]$Expected, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: outcome file missing"
  }
  $actual = (Get-Content $Path -Raw).Trim()
  if ($actual -ne $Expected) {
    throw "$Label failed: expected outcome '$Expected', got '$actual'"
  }
}

function Assert-OutcomeValid([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: outcome file missing"
  }
  $actual = (Get-Content $Path -Raw).Trim()
  if ($actual -notin @("party", "enemy", "draw")) {
    throw "$Label failed: unexpected outcome '$actual'"
  }
}

function Assert-TraceDifferent([string]$LeftPath, [string]$RightPath, [string]$Label) {
  if (-not (Test-Path $LeftPath) -or -not (Test-Path $RightPath)) {
    throw "$Label failed: comparison trace missing"
  }
  $left = @(Get-Content $LeftPath | Where-Object { $_.Trim().Length -gt 0 })
  $right = @(Get-Content $RightPath | Where-Object { $_.Trim().Length -gt 0 })
  if ($left.Count -eq $right.Count) {
    $same = $true
    for ($i = 0; $i -lt $left.Count; $i++) {
      if ($left[$i] -ne $right[$i]) {
        $same = $false
        break
      }
    }
    if ($same) {
      throw "$Label failed: traces were identical"
    }
  }
}

function Assert-CombatResultFile([string]$Path, [string]$Label, [int]$ExpectedOutcome, [int]$ExpectedXp, [int[]]$ExpectedConditions, [int[]]$ExpectedHp = @(), [int[]]$ExpectedMaxHp = @()) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: result file missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBCR" -or [BitConverter]::ToUInt16($bytes, 4) -ne 1) {
    throw "$Label failed: invalid GBCR header"
  }
  $outcome = [BitConverter]::ToUInt16($bytes, 6)
  $xp = [BitConverter]::ToUInt16($bytes, 8)
  $count = [BitConverter]::ToUInt16($bytes, 10)
  if ($outcome -ne $ExpectedOutcome -or $xp -ne $ExpectedXp -or $count -ne $ExpectedConditions.Count) {
    throw "$Label failed: unexpected GBCR header fields outcome=$outcome xp=$xp count=$count"
  }
  if ($bytes.Length -ne (16 + (6 * $count))) {
    throw "$Label failed: invalid GBCR length"
  }
  for ($i = 0; $i -lt $ExpectedConditions.Count; $i++) {
    $condition = $bytes[16 + ($i * 6) + 1]
    if ($condition -ne $ExpectedConditions[$i]) {
      throw "$Label failed: unexpected condition for party record $i"
    }
    if ($ExpectedHp.Count -gt $i) {
      $hp = [BitConverter]::ToInt16($bytes, 16 + ($i * 6) + 2)
      if ($hp -ne $ExpectedHp[$i]) {
        throw "$Label failed: party record $i HP expected $($ExpectedHp[$i]), got $hp"
      }
    }
    if ($ExpectedMaxHp.Count -gt $i) {
      $maxHp = [BitConverter]::ToInt16($bytes, 16 + ($i * 6) + 4)
      if ($maxHp -ne $ExpectedMaxHp[$i]) {
        throw "$Label failed: party record $i max HP expected $($ExpectedMaxHp[$i]), got $maxHp"
      }
    }
  }
}

function Assert-RejectedEffectHandoff([string]$Stem, [string]$Label) {
  foreach ($suffix in @('.TRC', '.OUT', '.RAW', '.GBR')) {
    if (Test-Path (Join-Path $run "$Stem$suffix")) {
      throw "$Label published $Stem$suffix after rejecting the handoff"
    }
  }
  $text = Get-Content (Join-Path $run "$Stem.TXT") -Raw
  if ($text -notmatch 'bad effect') {
    throw "$Label did not report the rejected GBEF handoff"
  }
}

$fixtureExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 init e2 - - - - - - -",
  "1 attack e1 p1 19 12 1 6 6 -",
  "1 attack p0 e1 5 8 0 - 5 -",
  "1 attack e0 p1 8 12 0 - 6 -",
  "1 attack e2 p0 7 13 0 - 14 -",
  "1 attack p1 e1 18 9 1 5 0 -",
  "1 slain p1 e1 - - - - 0 0",
  "2 attack p0 e0 16 8 1 4 3 -",
  "2 attack e0 p1 2 12 0 - 6 -",
  "2 attack e2 p0 13 13 1 5 9 -",
  "2 attack p1 e0 19 9 1 4 0 -",
  "2 slain p1 e0 - - - - 0 0",
  "3 attack p0 e2 13 7 1 9 0 -",
  "3 slain p0 e2 - - - - 0 0",
  "3 end - party - - - - - -"
)

$gbefExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 init e2 - - - - - - -",
  "1 attack e1 p1 19 13 1 2 10 -",
  "1 attack p0 e0 5 6 0 - 5 -",
  "1 attack e0 p0 8 14 0 - 14 -",
  "1 attack e2 p1 7 12 0 - 10 -",
  "1 attack p1 e1 18 7 1 5 0 -",
  "1 slain p1 e1 - - - - 0 0",
  "2 attack p0 e0 16 6 1 4 1 -",
  "2 attack e0 p0 2 14 0 - 14 -",
  "2 attack e2 p1 13 12 1 4 6 -",
  "2 attack p1 e2 19 9 1 4 3 -",
  "3 attack p0 e0 13 6 1 9 0 -",
  "3 slain p0 e0 - - - - 0 0",
  "3 attack e2 p1 7 12 0 - 6 -",
  "3 attack p1 e2 14 9 1 7 0 -",
  "3 slain p1 e2 - - - - 0 0",
  "3 end - party - - - - - -"
)

# Buck's 263-byte record: source-owned HP (mirror offsets 69/227), THAC0 raw[51], AC
# raw[55] and attack-1 dice raw[61]/[63]/[65] (tools/test_buck_monster_fields.py).  The
# fixture is THAC0 15 / AC 10 / 1d6, so every enemy row's needed is 15 minus the party
# member's AC (9 against p1, 10 against p0), every p->e needed is partyTHAC0 - 10 = 5,
# and every enemy hit deals 1..6.  Re-pinned 2026-10-07 from the placeholder trace; this
# fixture used to read only HP, and the outcome flipped from party to enemy because the
# placeholder enemies (thac0 18/19, AC 10-n, d4..d7) were weaker than a real 15/10/1d6.
$buckSyntheticExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 init e2 - - - - - - -",
  "1 attack e1 p1 19 9 1 6 6 -",
  "1 attack p0 e0 5 5 1 5 6 -",
  "1 attack e0 p0 7 10 0 - 14 -",
  "1 attack e2 p1 18 9 1 3 3 -",
  "1 attack p1 e1 16 6 1 3 8 -",
  "2 attack e1 p1 2 9 0 - 3 -",
  "2 attack p0 e0 13 5 1 5 1 -",
  "2 attack e0 p0 19 10 1 2 12 -",
  "2 attack e2 p1 13 9 1 6 0 -",
  "2 slain e2 p1 - - - - 0 0",
  "3 attack e1 p0 7 10 0 - 12 -",
  "3 attack p0 e0 14 5 1 6 0 -",
  "3 slain p0 e0 - - - - 0 0",
  "3 attack e2 p0 4 10 0 - 12 -",
  "4 attack e1 p0 11 10 1 6 6 -",
  "4 attack p0 e1 9 5 1 9 0 -",
  "4 slain p0 e1 - - - - 0 0",
  "4 attack e2 p0 15 10 1 6 0 -",
  "4 slain e2 p0 - - - - 0 0",
  "4 end - enemy - - - - - -"
)

$dokSyntheticTraceContains = @(
  "1 attack e1 p1 19 9 1 6 6 -",
  "1 attack p0 e0 5 20 0 - 5 -",
  "1 attack e0 p0 8 10 0 - 14 -"
)

$coabHalfAttackExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 17 25 0 - 30 -",
  "1 attack e0 p0 12 -4 1 7 7 -",
  "1 attack e0 p0 19 -4 1 7 0 -",
  "1 slain e0 p0 - - - - 0 0",
  "1 move p1 - - - - - - - 4 5",
  "1 move p1 - - - - - - - 4 4",
  "1 move p1 - - - - - - - 4 3",
  "1 attack p1 e0 2 26 0 - 30 -",
  "2 attack e0 p1 5 -5 1 7 5 -",
  "2 attack p1 e0 8 26 0 - 30 -",
  "3 attack e0 p1 7 -5 1 7 0 -",
  "3 slain e0 p1 - - - - 0 0",
  "3 end - enemy - - - - - -"
)

$coabAttack2TraceContains = @(
  "1 attack e0 p0 12 -4 1 14 0 -"
)

$coabDualAttackExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 17 25 0 - 30 -",
  "1 attack e0 p0 12 -4 1 2 12 -",
  "1 attack e0 p0 19 -4 1 14 0 -",
  "1 slain e0 p0 - - - - 0 0",
  "1 move p1 - - - - - - - 4 5",
  "1 move p1 - - - - - - - 4 4",
  "1 move p1 - - - - - - - 4 3",
  "1 attack p1 e0 2 26 0 - 30 -",
  "2 attack e0 p1 5 -5 1 2 10 -",
  "2 attack e0 p1 8 -5 1 14 0 -",
  "2 slain e0 p1 - - - - 0 0",
  "2 end - enemy - - - - - -"
)

# --- DQK §29 fixed-layout MONCHA trace -------------------------------------
#
#  DERIVED BY HAND from the fixture bytes and the engine's rules, NOT recorded
#  from a run. Full arithmetic:
#
#  Fixture (New-SyntheticDqkFixedMonRecord, THAC0 1, AC -10, HD 7, 1d2+4):
#    e0 HP    = max(hd, (hd*9+1) >> 1) = max(7, (63+1)>>1) = 32   :1938-1947
#    e0 THAC0 = 60 - raw[0x87] = 60 - 59 =  1                     :1953-1956
#    e0 AC    = 60 - raw[0xBB] = 60 - 70 = -10                    :1960-1963
#    e0 dmg   = 1d2 + 4 -> 5 or 6                                 :1971-1977
#    e0 attacks/round = 1 (nothing on the reachable path can raise it)
#  Party is fixture1's first two records (cccombat.asm:7602-7608):
#    p0 HP 14, THAC0 15, AC 5, 1d8+1, at col 4 row 5
#    p1 HP 12, THAC0 16, AC 6, 1d6+2, at col 4 row 6
#  e0 anchors at effect_enemy_slots[0] = col 5 row 4 (cccombat.asm:7583).
#
#  needed = attacker.THAC0 - target.AC   (resolve_hit, cccombat.asm:5694-5696)
#    p0 -> e0 : 15 - (-10) = 25    p1 -> e0 : 16 - (-10) = 26
#    e0 -> p0 :  1 -    5  = -4    e0 -> p1 :  1 -    6  = -5
#  So the party cannot hit on any of the rolls the seed produces below, and e0
#  cannot miss. Chebyshev(p0,e0) = 1 so p0 is already in reach; Chebyshev(p1,e0)
#  = 2 so p1 spends round 1 closing.
#
#  RNG is the LCG state = state*1664525 + 1013904223 (mod 2^32), seeded with the
#  command-line 4660 (cccombat.asm:674-686); die(n) = (state % n) + 1 and
#  die(1) short-circuits WITHOUT drawing (cccombat.asm:688-708). Draw order,
#  1-based, with the value each draw is consumed as:
#     1,2,3  initiative die(10) in array order -> p0 2, p1 1, e0 2, so the turn
#            order is p0, e0, p1 every round (desc initiative, ties by index)
#     4  d20 17   p0 misses (17 < 25)
#     5  d20 12   e0 hits p0        6  d2 1 -> 5 dmg, p0 14 -> 9
#     7  d20  2   p1 misses after closing
#     8  d20  5   p0 misses
#     9  d20  8   e0 hits p0       10  d2 1 -> 5 dmg, p0  9 -> 4
#    11  d20 18   p1 misses
#    12  d20  9   p0 misses
#    13  d20 16   e0 hits p0       14  d2 1 -> 5 dmg, p0  4 -> 0, slain
#    15  d20  2   p1 misses
#    16  d20 13   e0 hits p1       17  d2 2 -> 6 dmg, p1 12 -> 6
#    18  d20 19   p1 misses
#    19  d20  2   e0 hits p1       20  d2 1 -> 5 dmg, p1  6 -> 1
#    21  d20 16   p1 misses
#    22  d20  7   e0 hits p1       23  d2 2 -> 6 dmg, p1  1 -> 0, slain
#  e0 always attacks the weakest foe in reach (pick_weakest_target,
#  cccombat.asm:4958-5016), which is p0 while p0 lives. Six rounds, enemy wins.
#  Overkill is reported as 0 because an HLIB monster file selects RULE_GEN2
#  (cccombat.asm:2900).
#
#  p1's one move: choose_routed_close scans grid index row*10+col from 0 and
#  takes the first REACHABLE cell that strictly beats the current distance
#  (cccombat.asm, choose_routed_close). The eight cells adjacent to e0(5,4) have
#  indices 34,35,36,44,46,54,55,56; the lowest is 34 = col 4 row 3. Unlike the
#  CoAB goldens above, p0 is still ALIVE at (4,5) here and blocks that square,
#  so the cheapest route is (4,6)->(3,5) diagonal 3 ->(3,4) orthogonal 2 ->(4,3)
#  diagonal 3 = 8 half-steps, exactly the budget (C_MOVE 4 doubled), and the
#  bound is `ja` so 8 is allowed. Gen2 diagonals cost 3, not Gen1's 4 -- under
#  Gen1 that route would cost 10 and p1 would stop at (4,4) instead.
$dqkCompactAttackExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 17 25 0 - 32 -",
  "1 attack e0 p0 12 -4 1 5 9 -",
  "1 move p1 - - - - - - - 3 5",
  "1 move p1 - - - - - - - 3 4",
  "1 move p1 - - - - - - - 4 3",
  "1 attack p1 e0 2 26 0 - 32 -",
  "2 attack p0 e0 5 25 0 - 32 -",
  "2 attack e0 p0 18 -4 1 5 4 -",
  "2 attack p1 e0 16 26 0 - 32 -",
  "3 attack p0 e0 15 25 0 - 32 -",
  "3 attack e0 p0 20 -4 1 5 0 -",
  "3 slain e0 p0 - - - - 0 0",
  "3 attack p1 e0 2 26 0 - 32 -",
  "4 attack e0 p1 13 -5 1 6 6 -",
  "4 attack p1 e0 7 26 0 - 32 -",
  "5 attack e0 p1 14 -5 1 5 1 -",
  "5 attack p1 e0 4 26 0 - 32 -",
  "6 attack e0 p1 11 -5 1 6 0 -",
  "6 slain e0 p1 - - - - 0 0",
  "6 end - enemy - - - - - -"
)
#
#  The four-attack-per-round shape this golden used to hold is quoted in full in
#  the annotation block further down, with why it is now unreachable.

$boundaryExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 15 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$overkillExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 16 0 -",
  "1 slain p0 e0 - - - - 0 1",
  "1 end - party - - - - - -"
)

$gen2OverkillExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 16 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$largeReachExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$largeMoveExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 3",
  "1 move p0 - - - - - - - 3 2",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$moveBudgetExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 4",
  "1 move p0 - - - - - - - 3 4",
  "1 move p0 - - - - - - - 4 4",
  "1 move p0 - - - - - - - 5 4",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$routedMoveExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 3",
  "1 move p0 - - - - - - - 3 3",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$terrainBlockExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "60 end - draw - - - - - -"
)

$terrainCostExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 4",
  "1 move e0 - - - - - - - 3 4",
  "1 attack e0 p0 12 10 1 1 9 -",
  "2 attack p0 e0 11 -9 1 4 0 -",
  "2 slain p0 e0 - - - - 0 0",
  "2 end - party - - - - - -"
)

$moveAllowanceExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 4",
  "2 move p0 - - - - - - - 3 4",
  "3 move p0 - - - - - - - 4 4",
  "4 move p0 - - - - - - - 5 4",
  "4 attack p0 e0 12 -9 1 4 0 -",
  "4 slain p0 e0 - - - - 0 0",
  "4 end - party - - - - - -"
)

$missileExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$missileBodyBlockedExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "60 end - draw - - - - - -"
)

$missileTerrainBlockedExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "60 end - draw - - - - - -"
)

$missileShortExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$missileMediumExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 10 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$missileLongExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 12 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$largeTargetLineExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$largeShooterLineExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$largeAllBlockedExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "60 end - draw - - - - - -"
)

$moraleFearExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 16 4 -",
  "1 status e0 e0 - - - - 4 -",
  "1 attack p0 e0 11 -11 1 16 0 -",
  "1 slain p0 e0 - - - - 0 1",
  "1 end - party - - - - - -"
)

$moraleSurrenderExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack p0 e1 12 -9 1 100 0 -",
  "1 slain p0 e1 - - - - 0 1",
  "1 flee e0 - - - - - - -",
  "1 end - party - - - - - -"
)

$partyFleeEscapedExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 party-flee - escaped - - - - - -",
  "1 end - flee - - - - - -"
)

$partyFleeBlockedExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 party-flee - blocked - - - - - -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$hazardStartExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 hazard - p0 - - - 2 8 -",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$hazardMoveExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 4",
  "1 hazard - p0 - - - 2 8 -",
  "1 hazard - p0 - - 0 held 8 -",
  "1 attack e0 p0 12 10 1 8 0 -",
  "1 slain e0 p0 - - - - 0 1",
  "1 end - enemy - - - - - -"
)

$guardReactionExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 guard p0 - - - - - - -",
  "1 move e0 - - - - - - - 4 5",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$commandGuardExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 guard p0 - - - - - - -",
  "1 move e0 - - - - - - - 5 4",
  "1 move e0 - - - - - - - 4 4",
  "1 move e0 - - - - - - - 3 4",
  "1 move e0 - - - - - - - 2 4",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$hazardStatusExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 hazard - p0 - - 0 feared 10 -",
  "1 end - enemy - - - - - -"
)

$hazardSaveExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 hazard - p0 12 1 1 feared 10 -",
  "1 attack p0 e0 11 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$heldSkipExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 hazard - p0 - - 0 held 4 -",
  "1 attack e0 p0 12 -9 1 4 0 -",
  "1 slain e0 p0 - - - - 0 1",
  "1 end - enemy - - - - - -"
)

$heldGuardExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move e0 - - - - - - - 4 5",
  "1 attack e0 p0 12 -9 1 4 0 -",
  "1 slain e0 p0 - - - - 0 1",
  "1 end - enemy - - - - - -"
)

$statusExpiryExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "3 status - p0 - - - held 10 -",
  "3 move p0 - - - - - - - 2 4",
  "3 move p0 - - - - - - - 3 4",
  "3 move p0 - - - - - - - 4 4",
  "3 move p0 - - - - - - - 5 4",
  "3 attack p0 e0 12 -9 1 4 0 -",
  "3 slain p0 e0 - - - - 0 0",
  "3 end - party - - - - - -"
)

$helplessCoupExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 30 1 50 0 -",
  "1 slain p0 e0 - - - - 0 1",
  "1 end - party - - - - - -"
)

$gen2WakeExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 30 1 1 19 -",
  "1 attack e0 p0 11 -9 1 10 0 -",
  "1 slain e0 p0 - - - - 0 0",
  "1 end - enemy - - - - - -"
)

$gen2DiagonalExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 move p0 - - - - - - - 2 2",
  "1 move p0 - - - - - - - 3 3",
  "1 attack p0 e0 12 -9 1 4 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$missileSleepExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 30 1 1 19 -",
  "1 attack e0 p0 11 -9 1 10 0 -",
  "1 slain e0 p0 - - - - 0 0",
  "1 end - enemy - - - - - -"
)

$multiAttackExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 1 2 -",
  "1 attack p0 e0 11 -9 1 1 1 -",
  "1 attack p0 e0 2 -9 1 1 0 -",
  "1 slain p0 e0 - - - - 0 0",
  "1 end - party - - - - - -"
)

$halfAttackExpected = @(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 -9 1 1 2 -",
  "1 attack p0 e0 11 -9 1 1 1 -",
  "2 attack p0 e0 2 -9 1 1 0 -",
  "2 slain p0 e0 - - - - 0 0",
  "2 end - party - - - - - -"
)

$realMonExpected = @(
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
  "1 flee e0 - - - - - - -",
  "2 attack p0 e2 16 10 1 4 14 -",
  "2 attack e2 p1 2 9 0 - 6 -",
  "2 attack p1 e2 13 11 1 6 8 -",
  "3 attack p0 e2 19 10 1 7 1 -",
  "3 attack e2 p1 13 9 1 6 0 -",
  "3 slain e2 p1 - - - - 0 0",
  "4 attack p0 e2 7 10 0 - 1 -",
  "4 attack e2 p0 14 10 1 5 9 -",
  "5 attack p0 e2 4 10 0 - 1 -",
  "5 attack e2 p0 11 10 1 8 1 -",
  "6 attack p0 e2 9 10 0 - 1 -",
  "6 attack e2 p0 16 10 1 5 0 -",
  "6 slain e2 p0 - - - - 0 0",
  "6 end - enemy - - - - - -"
)

# CORRECTED 2026-09-07.  This golden was STALE, not the engine, and it had been
# stale for two days while reading as a genuine engine failure.
#
# What happened: the array was written 2026-07-15 against a build whose .dok
# branch did not read hit points from the file at all.  It SYNTHESISED them from
# the monster id -- `mov ax,[fx_monster] / and ax,0007h / add ax,4` -- under a
# comment saying "DoK compact HP/XP are still unlocated".  Commit 132306c
# (2026-09-05) located them and replaced that with real reads of rec[40] and
# rec[108]; it did not update this array.  Verified by reading the pre-image
# directly: `git show 132306c^:native/src/cccombat.asm`.
#
# Why that moves the TARGET and not just the numbers: the encounter's three
# enemies are ids 9, 9 and 19, and pick_weakest_target reduces on lowest C_HP.
# Synthesised, that was (9&7)+4 = 5, 5 and (19&7)+4 = 7, so p0 attacked e0.  From
# the file it is 66, 66 and 39, so p0 attacks e2.  Both `needed` values are
# arithmetically correct -- they are answers about different targets.
#
# ADJUDICATED FROM THE RETAIL BYTES, re-derived here rather than taken on trust,
# using tools/dax_decode.py's rle_decode against
# "Death Knights of Krynn\MON1CHA.DAX":
#   ENCEFX.EFX  +0x20 = 02 00, then 09 00 02 00 05 00 / 13 00 01 00 02 00
#               -> 2 groups: id 9 x2, id 19 x1.  So e0,e1 = UNDEAD BEAST and
#               e2 = VAMPIRE.
#   block  9 UNDEAD BEAST  rec[31]=53 -> thac0 60-53 =  7; rec[95]=54 -> ac  6;
#                          rec[108]=66 hp; rec[89/91/90]=2/4/3 -> 2d4+3 [5,11]
#   block 19 VAMPIRE       rec[31]=48 -> thac0 60-48 = 12; rec[95]=61 -> ac -1;
#                          rec[108]=39 hp; rec[89/91/90]=1/6/3 -> 1d6+3 [4,9]
# Against fixture1 (p0 hp 14 thac0 15 ac 5 1d8+1; p1 hp 12 thac0 16 ac 6 1d6+2)
# every `needed` in the array below is thac0 - ac exactly: 7-6=1, 15-(-1)=16,
# 7-6=1, 12-5=7, 7-5=2, 15-(-1)=16, 7-5=2.  Every `hit` is roll >= needed.
# Every `hpAfter` follows: p1 12-6=6-6=0; e2 39 on the miss then 39-7=32; p0
# 14-4=10-8=2-10 -> 0.  e2 is NOT slain because 32 > 0, and the outcome is
# "enemy" because both party members are down.  Every damage value lies inside
# its byte-derived die range.
#
# The offset roles are corroborated by a test that is independently GREEN in this
# same file: Assert-RetailKillXp pins DoK HP at offset 108 and agrees with
# GHOUL 12, UNDEAD ROC 81 and SKOMP 61 -- and SKOMP is the one record of 64 where
# rec[40] and rec[108] differ (81 against 61), so it is the pin that actually
# discriminates "max at 40" from "live at 108".
#
# NOT ADJUDICABLE, and stated rather than implied: the d20 rolls (19, 8, 7, 16,
# 2, 19, 13), the exact damage values within their ranges, and the initiative
# order e1, p0, e0, e2.  Those come from the seeded RNG and no byte in the
# archive predicts them, so for those six columns this array is still a golden
# produced by the code under test.  Corroboration, not proof: the roll sequence
# and the first five damage values appear verbatim and in the same order in the
# stale array, which came from a build differing ONLY in the HP field, so the RNG
# stream is demonstrably unchanged.  The single value with no corroboration at
# all is the last damage, 10 -- it is e0's 2d4+3 where the old array had e2's
# 1d6+3, and the two consume different numbers of draws.  Treat that one cell as
# the weakest in the array.
$dokMonExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 init e2 - - - - - - -",
  "1 attack e1 p1 19 1 1 6 6 -",
  "1 attack p0 e2 8 16 0 - 39 -",
  "1 attack e0 p1 7 1 1 6 0 -",
  "1 slain e0 p1 - - - - 0 0",
  "1 attack e2 p0 16 7 1 4 10 -",
  "2 attack e1 p0 2 2 1 8 2 -",
  "2 attack p0 e2 19 16 1 7 32 -",
  "2 attack e0 p0 13 2 1 10 0 -",
  "2 slain e0 p0 - - - - 0 0",
  "2 end - enemy - - - - - -"
)

$dqkMonExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack e1 p1 12 9 1 13 0 -",
  "1 slain e1 p1 - - - - 0 0",
  "1 attack p0 e1 18 15 1 2 21 -",
  "1 attack e0 p0 16 5 1 10 4 -",
  "2 attack e1 p0 20 10 1 13 0 -",
  "2 slain e1 p0 - - - - 0 0",
  "2 end - enemy - - - - - -"
)

# ---------------------------------------------------------------------------
#  INVALIDATED 2026-08-21 by fidelity-plan §29 -- do not re-pin these.
#
#  These four DQK trace goldens were recorded from a CCCOMBAT that decompressed
#  each MONCHA.GLB member from byte 0, eating the member's 2-byte big-endian
#  uncompressed length as RLE control bytes. Every monster it loaded was
#  therefore out of phase, so every THAC0/AC/damage number woven into the lines
#  below came from the wrong offsets. cccombat.asm now skips the length word and
#  reads the fixed offsets, so these WILL fail, loudly and correctly.
#
#  They are deliberately left in place rather than deleted or re-recorded. This
#  project's rule is that a golden pinned to a bug must fail when the bug is
#  fixed, and must then be adjudicated from the raw bytes -- never re-pinned to
#  whatever the new code happens to print.
#
#  THE BLOCKER IS GONE, AND THE COUNT WAS NEVER FOUR. Replacing, verbatim, what
#  stood here from 2026-08-21 to 2026-09-07:
#
#    "BLOCKED on re-derivation: this harness cannot currently reach these
#     assertions at all. `CCECL <file>.BIN /E <file>.EFX` produces no .EFX and no
#     stdout for EVERY .BIN input in RUN.BAT (DQKDEC, DQKREC, DQKST, DQKNPC,
#     DQKBLK, DQKHATT, COABHATT, COABATT2, COABDUAL), so CCCOMBAT reports "bad or
#     unsupported GBEF combat effect file" and the run dies earlier, at
#     Assert-CombatViewRaw. Verified pre-existing: an otherwise identical run with
#     both native/src/*.asm reverted to HEAD fails at the same point with the same
#     message. The `CCECL <file>.DAX <n> /E` form still works (COAB50.EFX is
#     produced), so the fault is specific to the .BIN entry path, and it is a
#     separate defect from §29."
#
#  That diagnosis was right and the defect is fixed: commit a48282d anchored
#  CCECL's stack, which NASM had silently truncated so SP landed inside the
#  program's own code, and the `.BIN /E` path now emits .EFX. The assertions are
#  reachable.
#
#  THE FOUR-ITEM LIST ABOVE WAS NEVER A MEASURED DENOMINATOR. It was written
#  while nothing in this harness could reach ANY DQK trace assertion, so it could
#  only ever have been a reading of this one comment block's neighbourhood --
#  and the neighbourhood is not the population. The count is AT LEAST FIVE. The
#  fifth is $dqkCompactAttackExpected, ~500 lines above this block and outside
#  it, asserted against DQKHATT.TRC; it was the FIRST to fail once the .EFX path
#  worked, and its synthetic fixture was pre-§29 as well, so re-deriving its
#  lines from the fixture bytes would have re-pinned the same wrong layout.
#  $dqkMonExpected, which runs against the retail MONCHA.GLB, is a sixth
#  candidate; it is gated on $hasDqkMon and has not been adjudicated here.
#
#  $dqkCompactAttackExpected has now been rebuilt: its fixture is a §29
#  fixed-layout record (see New-SyntheticDqkFixedMonRecord) and its trace is
#  re-derived by hand from the fixture's own field values, the HP-from-hit-dice
#  formula, and the seeded LCG stream. The four goldens named below had NOT been
#  re-derived -- they load real retail ids, so their expected lines have to come
#  from the retail record bytes, which is a larger job than the synthetic one.
#
#  SUPERSEDED 2026-09-07, IN BOTH DIRECTIONS. The four ARE now derived from the
#  retail record bytes, and they were re-pinned. Read the two sections below in
#  order -- the first is the diagnosis as it stood that morning and is kept
#  because its argument is what made the fix the right shape; the second is what
#  actually happened, and it reverses the first section's conclusion for a
#  reason the first section itself named.
#
#  ONE OF THE FOUR IS NOW DIAGNOSED, AND IT STILL MUST NOT BE RE-PINNED -- but
#  for a better reason than "not yet derived" (2026-09-07, superseded hours
#  later; the condition it set, "leave it red until the rate is sourced", was
#  MET rather than waived).
#
#  $dqkShortExpected ("short-tail/canon-AC", asserted against DQKST.TRC) became
#  the suite's terminating failure once the DoK MON1CHA golden above was
#  corrected; the DoK one had been hiding it. It expects 15 lines and the engine
#  emits 16. Two facts about it are now established rather than suspected:
#
#    * It is PRE-EXISTING and untouched by the 2026-09-07 player-turn work.
#      Proven by control, not by argument: cccombat.asm from 9e7a5f2 (the
#      pre-session commit) produces a DQKST.TRC byte-identical to the current
#      build's. The case runs `/E` with no /C tape and no /K, so no interactive
#      code is reachable in it at all.
#    * The most interesting difference in it -- e0 swinging TWICE in round 1
#      where the engine now swings once -- is NOT a stale-golden artifact and
#      NOT an RNG divergence. It is the multi-attack regression this very block
#      describes two paragraphs down, and it is worse than "left assembled but
#      unreferenced": try_dqk_selected_compact and dqk_attacks_override were
#      DELETED (cccombat.asm:2000-2020). Grep the current file and the only
#      surviving mentions of either name are inside that retirement note's own
#      prose. Nothing in the DQK path reads an attack-rate field at any offset,
#      so every DQK monster is pinned at one swing per round by the default
#      `mov word [di+C_ATTACKS], 1 / mov word [di+C_HALFATT], 0`.
#
#  So re-pinning this golden to the current 16 lines would FREEZE A CAPABILITY
#  REGRESSION INTO THE SUITE -- precisely the failure this block exists to
#  prevent, and a sharper version of it than the offset-phase bug that started
#  it. The remaining columns HAVE since been adjudicated against MONCHA.GLB and
#  the seeded LCG, so the array is no longer blocked on derivation effort; it is
#  blocked on the engine being wrong. Leave it red until the rate is sourced.
#
#  MEASURED WHILE ESTABLISHING THAT, because it is wider than DQK and belongs
#  where someone will find it: the engine has exactly ONE record-sourced attack
#  rate in it, and it is CoAB's -- `movzx ax, byte [monraw+11Ch]`, commented
#  "attacksCount in half-attacks" (cccombat.asm:1800), which matches the CoAB
#  decompile's Player.attacksCount at 0x11C annotated "half-attacks count". The
#  only other non-default rate anywhere is apply_dok_party_attacks, which derives
#  a DoK PARTY member's rate from class and level in the save metadata (fighter
#  7-12 -> C_HALFATT 3, 13+ -> C_ATTACKS 2) and reads no monster archive at all.
#  CoK, DoK, DQK, Pool and Buck MONSTERS every one get the hardcoded 1. The
#  half-attacks machinery itself is real and tested (attacks_this_round encodes
#  3 => two swings on odd rounds, one on even); what is missing is the field
#  feeding it.
#
#  THE FIELD IS LOCATED, AND THIS GOLDEN IS NO LONGER BLOCKED ON FINDING IT
#  (2026-09-07). It is a PAIR of half-attack bytes at DQK record 179/180
#  (= A+59/A+60, A = ABIL 0x78), holding "number of attacks per two rounds",
#  which is the same half-attacks unit attacks_this_round already consumes.
#  Verified here, not taken on report: MONCHA.GLB decoded with the HLIB DATA
#  257-c RLE gives HYDRA 8/0 1d12 AC 5 THAC0 7 and UMBER HULK 4/2 3d4 AC 2
#  THAC0 12 -- byte-identical to the same two monsters in FRUA's MONST.GLB read
#  at the offsets hackdocs_extracted/CCHFORM.TXT documents outright (171-172
#  "Number of attacks per two rounds", 179 "60 - Base AC"), which register onto
#  DQK at a uniform +8. Two archives, two different routes, same bytes.
#  The value 1 occurs ZERO times across all four rate columns (450 fields), which
#  is the parity argument that this is a per-two-rounds figure and not a plain
#  count. Full evidence, histograms and NULLs:
#  docs/engine/research/moncha-shorttail-c4.2b-2b-2a.md, section "The attack-rate
#  field, verified across two archives".
#
#  DONE IN THE SAME SESSION, AND ALL FOUR GOLDENS ARE NOW RE-DERIVED. C_HALFATT
#  is wired from ability-relative byte +59 in cccombat.asm's .dqk_decode, and the
#  four arrays below were re-pinned to the traces that produced. Re-pinning is
#  the move this block spent its whole length arguing against, so here is what
#  changed to make it the right one, and what was measured before doing it.
#
#  THE RATE IS NOW EXTERNALLY ADJUDICATED, so the goldens are no longer being
#  asked to certify themselves. The per-record attack counts come from FRUA's
#  documented layout and two retail archives, NOT from this engine. Predicted
#  counts, and what the traces actually did:
#
#    ECL id  monster          byte179  predicted/round  observed
#    #10     HYDRA                  8        4          3, then combat ended
#    #12     UMBER HULK             4        2          2   x1
#    #16     GIANT ANEMONE         12        6          (never acted)
#    #17     GIANT SQUID           16        8          7, then combat ended
#    #18     SAHUAGIN               4        2          2   x2 rounds
#    #23     IRON GOLEM             2        1          1   x2 rounds
#    #55     BAKALI SHAMAN          4        2          2   x3 rounds
#    #64     SHARKMAN               4        2          2   x4 rounds
#
#  13 of 15 enemy turns hit the predicted count EXACTLY; the two that fall short
#  are both truncated at the instant the last party member died. Eight tentacles
#  on a giant squid and six on an anemone are also the right shape, which is a
#  weak check but not a nothing one.
#
#  AN INDEPENDENT CONTROL ON THE RECORD INDEXING, because reading the right byte
#  of the wrong record would produce exactly this kind of plausible table: all
#  EIGHT names above were recovered from MONCHA.GLB by decoding member (id-1),
#  and all eight match the monster this script's own ECL comments say that id
#  loads -- comments written long before this work and by someone else.
#
#  THE SHARPER FINDING, and the reason this block should stay long: TWO of the
#  four goldens were GREEN, and they were green because they were pinned to the
#  regression. $dqkDecExpected (29 lines) and $dqkReconExpected (14) matched the
#  engine perfectly while every DQK monster swung once per round. Measured, not
#  assumed: cccombat.asm was swapped back to its pre-change bytes (sha256
#  c44d6183...), rebuilt, re-run, and those two matched while the other two did
#  not. So the red golden was the honest one. A golden that goes green by
#  freezing a deleted capability is worse than one that stays red, and nothing
#  in this suite could tell them apart -- $dqkNpcExpected was ALSO red the whole
#  time and nobody knew, because DQKST aborted the run before it was reached.
#
#  MUTATION-TESTED BEFORE BEING TRUSTED, twice, because one mutation was too
#  weak to prove what it looked like it proved:
#    * +59 -> +58 turns the suite red (dec-path expected 14, got 29). But +58 is
#      zero in these records, so the mutant merely REPRODUCES the pre-change
#      engine. That proves the assertions bind to the feature, not to the byte.
#    * +59 -> +67 (the AC byte, 60-AC, large and nonzero) turns the suite red at
#      a DIFFERENT case first (fidelity-29 fixed-layout, expected 21 got 14) --
#      a third distinct behaviour. Together they show the pins discriminate the
#      specific offset, not just on-versus-off.
#  The source was restored by byte-exact copy and its sha256 re-checked, not by
#  a git restore.
#
#  SUPERSEDED 2026-09-25: the consumer and ordinary two-round route are now
#  disassembled in docs/engine/research/disasm-combat-dqk.md §10.3. The six
#  structurally unmatched records remain an explicit counterexample set:
#  three have a populated second profile with zero rate; three have positive
#  second rate without a valid second damage profile. The latter are rejected
#  only under a trusted D0xx HLIB handoff. Do not infer their behavior from the
#  synthetic ordinary-route controls below.
#
#  ARCHIVED PRE-IMPLEMENTATION RATIONALE, superseded by the 2026-09-25 ordinary
#  DQK kind-2/kind-1 scheduler. The pre-§29 $dqkCompactAttackExpected is retained
#  here so the retraction history stays legible.
#  It expected THREE enemy attacks in round 1 and TWO in round 2:
#      "1 attack p0 e0 17 25 0 - 32 -"
#      "1 attack e0 p0 12 -4 1 5 9 -"
#      "1 attack e0 p0 2 -4 1 5 4 -"
#      "1 attack e0 p0 8 -4 1 5 0 -"
#      "1 slain e0 p0 - - - - 0 0"
#      "1 move p1 - - - - - - - 4 3"
#      "1 attack p1 e0 18 26 0 - 32 -"
#      "2 attack e0 p1 9 -5 1 6 6 -"
#      "2 attack e0 p1 15 -5 1 6 0 -"
#      "2 slain e0 p1 - - - - 0 0"
#      "2 end - enemy - - - - - -"
#  Every stat in it is still correct under §29 -- HP 32 is exactly
#  max(7, (7*9+1)>>1), and the needed/damage columns all re-derive -- so this
#  golden was NOT invalidated by wrong offsets the way the four below were. What
#  killed it is narrower and more interesting: §29 stopped calling
#  try_dqk_selected_compact (cccombat.asm:1922-1924, 2212-2246), the only writer
#  of [dqk_attacks_override], so no DQK monster can swing more than once per
#  round any more. The multi-attack shape is unreachable, not mis-derived.
#
#  The scenario NAMES below ("dec-path", "reconstruction", "short-tail/canon-AC")
#  are themselves artefacts -- they name the six staged-recovery strategies that
#  §29 retired. The ids they load are real and still worth exercising.
#  These raw .BIN ECL fixtures do not emit the trusted D0xx LOAD_FILES tag, so
#  they deliberately keep the pre-rate one-attack goldens. Task 29's rate and
#  mutation checks above use the actual DQK HLIB handoff.
# ---------------------------------------------------------------------------
$dqkDecExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack e1 p1 12 3 1 5 7 -",
  "1 attack p0 e1 2 12 0 - 54 -",
  "1 attack e0 p0 5 2 1 4 10 -",
  "1 attack p1 e1 7 13 0 - 54 -",
  "2 attack e1 p1 18 3 1 3 4 -",
  "2 attack p0 e1 16 12 1 4 50 -",
  "2 attack e0 p0 2 2 1 1 9 -",
  "2 attack p1 e1 20 13 1 5 45 -",
  "3 attack e1 p1 2 3 0 - 4 -",
  "3 attack p0 e1 13 12 1 9 36 -",
  "3 attack e0 p0 7 2 1 2 7 -",
  "3 attack p1 e1 5 13 0 - 36 -",
  "4 attack e1 p1 4 3 1 1 3 -",
  "4 attack p0 e1 18 12 1 2 34 -",
  "4 attack e0 p0 16 2 1 3 4 -",
  "4 attack p1 e1 18 13 1 5 29 -",
  "5 attack e1 p1 8 3 1 3 0 -",
  "5 slain e1 p1 - - - - 0 0",
  "5 attack p0 e1 18 12 1 2 27 -",
  "5 attack e0 p0 8 2 1 3 1 -",
  "6 attack e1 p0 2 4 0 - 1 -",
  "6 attack p0 e1 1 12 0 - 27 -",
  "6 attack e0 p0 16 2 1 3 0 -",
  "6 slain e0 p0 - - - - 0 0",
  "6 end - enemy - - - - - -"
)

# DQKREC's round-2 close route crosses (4,5) before the adjacent (3,5) anchor;
# execute_route emits every entered cell, so both steps belong in the trace.
$dqkReconExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack e1 p1 12 9 1 1 11 -",
  "1 attack p0 e1 2 10 0 - 18 -",
  "1 attack e0 p0 5 2 1 32 0 -",
  "1 slain e0 p0 - - - - 0 0",
  "1 attack p1 e1 16 11 1 3 15 -",
  "2 attack e1 p1 2 9 0 - 11 -",
  "2 move e0 - - - - - - - 4 5",
  "2 move e0 - - - - - - - 3 5",
  "2 attack e0 p1 13 1 1 24 0 -",
  "2 slain e0 p1 - - - - 0 0",
  "2 end - enemy - - - - - -"
)

# Re-derived 2026-10-02 using the independent TypeScript tactical oracle,
# seed 4660 and id-table-selected MONCHA stats. Raw-BIN effects are untagged,
# so one primary swing applies; D0xx rate fixtures above exercise both kinds.
# Every attack/outcome matches the oracle. Native route emission additionally
# records both (4,5) and (3,5), as the DQKREC route contract above requires.
$dqkShortExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack e1 p1 12 6 1 6 6 -",
  "1 attack p0 e1 8 13 0 - 45 -",
  "1 attack e0 p0 7 2 1 10 4 -",
  "1 attack p1 e1 9 14 0 - 45 -",
  "2 attack e1 p0 16 7 1 6 0 -",
  "2 slain e1 p0 - - - - 0 0",
  "2 move e0 - - - - - - - 4 5",
  "2 move e0 - - - - - - - 3 5",
  "2 attack e0 p1 20 1 1 3 3 -",
  "2 attack p1 e1 2 14 0 - 45 -",
  "3 attack e1 p1 13 6 1 9 0 -",
  "3 slain e1 p1 - - - - 0 0",
  "3 end - enemy - - - - - -"
)

$dqkNpcExpected = @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 init e1 - - - - - - -",
  "1 attack e1 p1 12 0 1 5 7 -",
  "1 attack p0 e0 2 8 0 - 41 -",
  "1 attack e0 p0 5 9 0 - 14 -",
  "1 attack p1 e1 8 10 0 - 81 -",
  "2 attack e1 p1 7 0 1 4 3 -",
  "2 attack p0 e0 9 8 1 9 32 -",
  "2 attack e0 p0 15 9 1 2 12 -",
  "2 attack p1 e1 13 10 1 6 75 -",
  "3 attack e1 p1 19 0 1 2 1 -",
  "3 attack p0 e0 13 8 1 9 23 -",
  "3 attack e0 p0 7 9 0 - 12 -",
  "3 attack p1 e1 14 10 1 7 68 -",
  "4 attack e1 p1 4 0 1 1 0 -",
  "4 slain e1 p1 - - - - 0 0",
  "4 attack p0 e0 18 8 1 2 21 -",
  "4 attack e0 p0 16 9 1 1 11 -",
  "5 attack e1 p0 18 1 1 3 8 -",
  "5 attack p0 e0 8 8 1 8 13 -",
  "5 attack e0 p0 18 9 1 1 7 -",
  "6 attack e1 p0 8 1 1 5 2 -",
  "6 attack p0 e0 2 8 0 - 13 -",
  "6 attack e0 p0 1 9 0 - 2 -",
  "7 attack e1 p0 16 1 1 1 1 -",
  "7 attack p0 e0 6 8 0 - 13 -",
  "7 attack e0 p0 17 9 1 2 0 -",
  "7 slain e0 p0 - - - - 0 0",
  "7 end - enemy - - - - - -"
)

$coabMonExpected = @(
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

Assert-TraceExact (Join-Path $run "FIXTURE.TRC") $fixtureExpected "CCCOMBAT fixture smoke"
Assert-CombatResultFile (Join-Path $run "FIXTURE.GBR") "CCCOMBAT fixture result smoke" 0 50 @(0, 0) @(9, 6) @(14, 12)
Invoke-TacticalOracleParity (Join-Path $run "FIXTURE.TRC")
Assert-TraceExact (Join-Path $run "BOUND.TRC") $boundaryExpected "CCCOMBAT hp+10 boundary smoke"
Assert-TraceExact (Join-Path $run "OVERKILL.TRC") $overkillExpected "CCCOMBAT overkill smoke"
Assert-TraceExact (Join-Path $run "GEN2.TRC") $gen2OverkillExpected "CCCOMBAT Gen2 overkill smoke"
Assert-TraceExact (Join-Path $run "LARGE.TRC") $largeReachExpected "CCCOMBAT Large-footprint reach smoke"
Assert-TraceExact (Join-Path $run "LGMOVE.TRC") $largeMoveExpected "CCCOMBAT Large-footprint close-step smoke"
Assert-TraceExact (Join-Path $run "BUDGET.TRC") $moveBudgetExpected "CCCOMBAT open-grid movement-budget smoke"
Assert-TraceExact (Join-Path $run "ROUTE.TRC") $routedMoveExpected "CCCOMBAT routed open-grid movement smoke"
Assert-TraceExact (Join-Path $run "TERRAIN.TRC") $terrainBlockExpected "CCCOMBAT blocked terrain movement smoke"
Assert-TraceExact (Join-Path $run "COST.TRC") $terrainCostExpected "CCCOMBAT terrain-cost movement smoke"
Assert-TraceExact (Join-Path $run "MOVE1.TRC") $moveAllowanceExpected "CCCOMBAT per-combatant movement allowance smoke"
Assert-TraceExact (Join-Path $run "MISSILE.TRC") $missileExpected "CCCOMBAT missile range smoke"
Assert-TraceExact (Join-Path $run "BODYLOS.TRC") $missileBodyBlockedExpected "CCCOMBAT missile body line-of-fire smoke"
Assert-TraceExact (Join-Path $run "TERRLOS.TRC") $missileTerrainBlockedExpected "CCCOMBAT missile terrain line-of-fire smoke"
Assert-TraceExact (Join-Path $run "MSHORT.TRC") $missileShortExpected "CCCOMBAT missile short-range to-hit smoke"
Assert-TraceExact (Join-Path $run "MMEDIUM.TRC") $missileMediumExpected "CCCOMBAT missile medium-range to-hit smoke"
Assert-TraceExact (Join-Path $run "MLONG.TRC") $missileLongExpected "CCCOMBAT missile long-range to-hit smoke"
Assert-TraceExact (Join-Path $run "LGTLOS.TRC") $largeTargetLineExpected "CCCOMBAT Large-target line-of-fire smoke"
Assert-TraceExact (Join-Path $run "LGSLOS.TRC") $largeShooterLineExpected "CCCOMBAT Large-shooter line-of-fire smoke"
Assert-TraceExact (Join-Path $run "LGALLOS.TRC") $largeAllBlockedExpected "CCCOMBAT Large all-lines-blocked smoke"
Assert-TraceExact (Join-Path $run "MORALEF.TRC") $moraleFearExpected "CCCOMBAT morale fear/flee smoke"
Assert-TraceExact (Join-Path $run "MORALES.TRC") $moraleSurrenderExpected "CCCOMBAT morale surrender smoke"
$routedFleeLines = @(Get-Content (Join-Path $run "ROUTFLEE.TRC"))
if (($routedFleeLines | Select-Object -First 5) -join "`n" -ne (@(
  "1 init p0 - - - - - - -",
  "1 init e0 - - - - - - -",
  "1 attack p0 e0 12 8 1 1 7 -",
  "1 flee e0 - - - - - - - 6 5",
  "1 hazard - e0 - - 0 held 7 -"
) -join "`n")) {
  throw 'CCCOMBAT routed flee did not reach and apply the first-cell hold hazard in source order'
}
if (@($routedFleeLines | Where-Object { $_ -match '^\d+ flee e0 ' }).Count -ne 1) {
  throw 'CCCOMBAT continued a flee route after its mover became held'
}
if (@($routedFleeLines | Where-Object { $_ -match '^\d+ attack e0 ' }).Count -ne 0) {
  throw 'CCCOMBAT let a held fleeing actor attack after the hazard'
}
if ($routedFleeLines[-1] -ne "60 end - draw - - - - - -") {
  throw 'CCCOMBAT held-flee control did not reach its bounded terminal draw'
}
Assert-TraceExact (Join-Path $run "PFLEEOK.TRC") $partyFleeEscapedExpected "CCCOMBAT party flee escaped smoke"
Assert-OutcomeFile (Join-Path $run "PFLEEOK.OUT") "flee" "CCCOMBAT party flee escaped smoke"
Assert-TraceExact (Join-Path $run "PFLEEBLK.TRC") $partyFleeBlockedExpected "CCCOMBAT party flee blocked smoke"
Assert-OutcomeFile (Join-Path $run "PFLEEBLK.OUT") "party" "CCCOMBAT party flee blocked smoke"
foreach ($case in @("BADN", "BADF")) {
  if ((Get-Content (Join-Path $run "$case.RC") -Raw).Trim() -ne "rejected") {
    throw "CCCOMBAT required outcome publication did not fail $case"
  }
  foreach ($suffix in @(".GBR", ".OUT")) {
    if (Test-Path (Join-Path $run "$case$suffix")) {
      throw "CCCOMBAT required outcome publication wrote $case$suffix after failure"
    }
  }
}
Write-Output "[PASS] CCCOMBAT rejects failed required outcome publication before GBCR"
Assert-TraceExact (Join-Path $run "CMDPFOK.TRC") $partyFleeEscapedExpected "CCCOMBAT command party flee escaped smoke"
Assert-TraceExact (Join-Path $run "CMDPFB.TRC") $partyFleeBlockedExpected "CCCOMBAT command party flee blocked smoke"
Assert-TraceExact (Join-Path $run "HAZSTART.TRC") $hazardStartExpected "CCCOMBAT start-of-turn hazard smoke"
Assert-TraceExact (Join-Path $run "HAZMOVE.TRC") $hazardMoveExpected "CCCOMBAT move-end hazard smoke"
Assert-TraceExact (Join-Path $run "HAZCMD.TRC") $hazardMoveExpected "CCCOMBAT manual move-end hold smoke"
Assert-TraceExact (Join-Path $run "GUARD.TRC") $guardReactionExpected "CCCOMBAT guard reaction smoke"
Assert-TraceExact (Join-Path $run "CMDGUARD.TRC") $commandGuardExpected "CCCOMBAT party command guard smoke"
Assert-TraceExact (Join-Path $run "HAZSTAT.TRC") $hazardStatusExpected "CCCOMBAT status hazard smoke"
Assert-TraceExact (Join-Path $run "HAZSAVE.TRC") $hazardSaveExpected "CCCOMBAT status hazard save smoke"
Assert-TraceExact (Join-Path $run "HELD.TRC") $heldSkipExpected "CCCOMBAT held status turn-skip smoke"
Assert-TraceExact (Join-Path $run "HLDGUARD.TRC") $heldGuardExpected "CCCOMBAT held guard-disabled smoke"
Assert-TraceExact (Join-Path $run "STATEXP.TRC") $statusExpiryExpected "CCCOMBAT status expiry smoke"
Assert-TraceExact (Join-Path $run "COUP.TRC") $helplessCoupExpected "CCCOMBAT helpless coup-de-grace smoke"
Assert-TraceExact (Join-Path $run "GEN2WAK.TRC") $gen2WakeExpected "CCCOMBAT Gen2 helpless wake smoke"
Assert-TraceExact (Join-Path $run "G2DIAG.TRC") $gen2DiagonalExpected "CCCOMBAT Gen2 diagonal movement smoke"
Assert-TraceExact (Join-Path $run "MSLEEP.TRC") $missileSleepExpected "CCCOMBAT missile helpless sleep wake smoke"
Assert-TraceExact (Join-Path $run "MULTI.TRC") $multiAttackExpected "CCCOMBAT integer multi-attack smoke"
Assert-TraceExact (Join-Path $run "HALFATT.TRC") $halfAttackExpected "CCCOMBAT half-attacks smoke"
# ---------------------------------------------------------------------------
#  Retail kill-XP field pin (added 2026-09-05 with the COMB-1 fix).
#
#  SAY EXACTLY WHAT THIS DOES AND DOES NOT PROVE. It asserts that the retail
#  MON1CHA records still carry the byte values cccombat.asm's XP formula reads --
#  it pins the formula's INPUTS. It does NOT observe the engine computing an
#  award, because the assertions that would (the DoK/CoK monster handoffs later
#  in this file) are unreachable today: `CCECL <file>.BIN /E` emits no .EFX, so
#  the run dies at the Assert-CombatViewRaw below. See the note at ~:1522.
#  Do not quote this pin as evidence that kill XP is awarded correctly.
#
#  It can fail, and that is the point: it is bound to named records with an
#  expected award, so if an offset is wrong, a record moves, or someone drops the
#  per-hit-point term from the doc, the expected numbers stop matching. SKOMP is
#  in the list deliberately -- it is the ONE DoK record where b108 (61) differs
#  from b40 (81), so a build that used max HP instead of rolled HP as the
#  multiplicand computes 2596 here instead of 2276 and this pin catches it.
#  Values verified against the retail bytes on 2026-09-05; offsets and the
#  disassembled formula are docs/engine/research/dok-kill-xp.md.
# ---------------------------------------------------------------------------
function Expand-DaxRleBlock([byte[]]$Comp, [int]$Expected) {
  $out = New-Object byte[] $Expected
  $i = 0
  $o = 0
  while ($i -lt $Comp.Length -and $o -lt $Expected) {
    $c = [int]$Comp[$i]
    $i++
    if ($c -lt 0x80) {
      $cnt = $c + 1
      for ($k = 0; $k -lt $cnt -and $i -lt $Comp.Length -and $o -lt $Expected; $k++) {
        $out[$o] = $Comp[$i]
        $o++; $i++
      }
    } else {
      $cnt = 256 - $c
      if ($i -lt $Comp.Length) {
        $v = $Comp[$i]
        $i++
        for ($k = 0; $k -lt $cnt -and $o -lt $Expected; $k++) {
          $out[$o] = $v
          $o++
        }
      }
    }
  }
  return $out
}

function Get-MonChaBlocks([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 2) { throw "DAX file too short: $Path" }
  $tocBytes = [BitConverter]::ToUInt16($bytes, 0)
  if ($tocBytes -le 0 -or ($tocBytes % 9) -ne 0 -or $bytes.Length -lt (2 + $tocBytes)) {
    throw "DAX TOC has invalid length in $Path"
  }
  $base = 2 + $tocBytes
  $count = [int]($tocBytes / 9)
  $map = @{}
  for ($i = 0; $i -lt $count; $i++) {
    $off = 2 + ($i * 9)
    $id = [int]$bytes[$off]
    $dataOff = [BitConverter]::ToUInt32($bytes, $off + 1)
    $rawSize = [BitConverter]::ToUInt16($bytes, $off + 5)
    $compSize = [BitConverter]::ToUInt16($bytes, $off + 7)
    $comp = New-Object byte[] $compSize
    [Array]::Copy($bytes, $base + [int]$dataOff, $comp, 0, $compSize)
    if (-not $map.ContainsKey($id)) {
      $map[$id] = (Expand-DaxRleBlock $comp $rawSize)
    }
  }
  return $map
}

function Assert-RetailKillXp {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][int]$RecordSize,
    [Parameter(Mandatory)][int]$HpOffset,      # rolled hp: the XP multiplicand
    [Parameter(Mandatory)][int]$FlatOffset,    # u16 LE flat per-monster term
    [Parameter(Mandatory)][int]$MultOffset,    # u8 per-hit-point multiplier
    [Parameter(Mandatory)][object[]]$Expected,
    [Parameter(Mandatory)][string]$Label
  )

  $blocks = Get-MonChaBlocks $Path
  foreach ($e in $Expected) {
    if (-not $blocks.ContainsKey($e.Id)) {
      throw "$Label failed: block id $($e.Id) absent from $Path"
    }
    $raw = $blocks[$e.Id]
    if ($raw.Length -ne $RecordSize) {
      throw "$Label failed: block id $($e.Id) is $($raw.Length) bytes, expected $RecordSize"
    }
    $hp = [int]$raw[$HpOffset]
    $flat = [int][BitConverter]::ToUInt16($raw, $FlatOffset)
    $mult = [int]$raw[$MultOffset]
    $award = $flat + ($mult * $hp)
    $got = "hp=$hp flat=$flat mult=$mult award=$award"
    $want = "hp=$($e.Hp) flat=$($e.Flat) mult=$($e.Mult) award=$($e.Award)"
    if ($got -ne $want) {
      throw "$Label failed: block id $($e.Id) ($($e.Name)) expected [$want], got [$got]"
    }
    if ($award -eq $flat) {
      throw "$Label failed: block id $($e.Id) ($($e.Name)) has a zero per-hit-point term, so it cannot discriminate the multiplier"
    }
  }
  Write-Output "[PASS] $Label ($($Expected.Count) records)"
}

if ($hasDokMon) {
  Assert-RetailKillXp -Path $dokMon -RecordSize 216 -HpOffset 108 -FlatOffset 109 -MultOffset 111 -Label "CCCOMBAT retail DoK kill-XP field pin" -Expected @(
    [pscustomobject]@{ Id = 22; Name = "GHOUL";      Hp = 12; Flat = 65;   Mult = 2;  Award = 89 },
    [pscustomobject]@{ Id = 10; Name = "UNDEAD ROC"; Hp = 81; Flat = 5000; Mult = 25; Award = 7025 },
    [pscustomobject]@{ Id = 42; Name = "SKOMP";      Hp = 61; Flat = 1300; Mult = 16; Award = 2276 }
  )
} else {
  Write-Output "[SKIP] CCCOMBAT retail DoK kill-XP field pin (archive not found)"
}

if ($hasRealMon) {
  Assert-RetailKillXp -Path $cokMon -RecordSize 409 -HpOffset 283 -FlatOffset 304 -MultOffset 306 -Label "CCCOMBAT retail CoK kill-XP field pin" -Expected @(
    [pscustomobject]@{ Id = 7;  Name = "GHOUL";      Hp = 9;  Flat = 65;   Mult = 2;  Award = 83 },
    [pscustomobject]@{ Id = 25; Name = "SIVAK";      Hp = 27; Flat = 350;  Mult = 6;  Award = 512 },
    [pscustomobject]@{ Id = 21; Name = "RED DRAGON"; Hp = 33; Flat = 1950; Mult = 16; Award = 2478 }
  )
} else {
  Write-Output "[SKIP] CCCOMBAT retail CoK kill-XP field pin (archive not found)"
}

Assert-CombatViewRaw (Join-Path $run "VIEW.RAW")
Assert-CombatViewRaw (Join-Path $run "VIEWFX.RAW") 400 8000 136 112
Assert-CombatViewRaw (Join-Path $run "GBEF.RAW")
Assert-TraceExact (Join-Path $run "GBEF.TRC") $gbefExpected "CCCOMBAT GBEF smoke"
Assert-OutcomeFile (Join-Path $run "GBEF.OUT") "party" "CCCOMBAT GBEF smoke"
Assert-TraceContains (Join-Path $run "GBEFPF.TRC") @(
  "1 party-flee - escaped - - - - - -",
  "1 end - flee - - - - - -"
) "CCCOMBAT GBEF party-flee baseline smoke"
Assert-OutcomeFile (Join-Path $run "GBEFPF.OUT") "flee" "CCCOMBAT GBEF party-flee baseline smoke"
Assert-TraceContains (Join-Path $run "GBEFW.TRC") @(
  "1 party-flee - blocked - - - - - -"
) "CCCOMBAT GBEF WGRD blocker smoke"
Assert-OutcomeFile (Join-Path $run "GBEFW.OUT") "party" "CCCOMBAT GBEF WGRD blocker smoke"
Assert-TraceDifferent (Join-Path $run "GBEFPF.TRC") (Join-Path $run "GBEFW.TRC") "CCCOMBAT GBEF WGRD blocker smoke"
Assert-TraceContains (Join-Path $run "GBEFWD.TRC") @(
  "1 party-flee - blocked - - - - - -"
) "CCCOMBAT GBEF default WGRD blocker smoke"
Assert-OutcomeFile (Join-Path $run "GBEFWD.OUT") "party" "CCCOMBAT GBEF default WGRD blocker smoke"
Assert-TraceDifferent (Join-Path $run "GBEFPF.TRC") (Join-Path $run "GBEFWD.TRC") "CCCOMBAT GBEF default WGRD blocker smoke"
Assert-TraceContains (Join-Path $run "DOWNP.TRC") @(
  "1 init p0 - - - - - - -",
  "1 init p1 - - - - - - -",
  "1 init e0 - - - - - - -"
) "CCCOMBAT downed GBPR party import smoke"
Assert-TraceLacksActiveToken (Join-Path $run "DOWNP.TRC") "p1" "CCCOMBAT downed GBPR party import smoke"
Assert-OutcomeFile (Join-Path $run "DOWNP.OUT") "enemy" "CCCOMBAT downed GBPR party import smoke"
# Re-pinned 2026-10-07 for the DoK per-round initiative (cccombat-dokinit-test.ps1 owns the
# turn-order/RNG-order proof against tools/dok_initiative.py).  A DoK party no longer draws the
# per-combatant d10 up front, so this legacy-LCG stream shifted; the half-attack cadence
# (2 swings in odd rounds, 1 in even rounds) is what this smoke pins.
Assert-TraceContains (Join-Path $run "DOKWARR.TRC") @(
  "1 attack p0 e1 18 1 1 1 4 -",
  "1 attack p0 e1 16 1 1 3 1 -",
  "2 attack p0 e1 16 1 1 3 0 -",
  "3 attack p0 e0 18 1 1 1 4 -",
  "3 attack p0 e0 8 1 1 3 1 -",
  "4 attack p0 e0 16 1 1 3 0 -"
) "CCCOMBAT DoK GBD1 imported warrior half-attacks smoke"
Assert-OutcomeFile (Join-Path $run "DOKWARR.OUT") "party" "CCCOMBAT DoK GBD1 imported warrior half-attacks smoke"
# T4 RED->GREEN: the flagged recruit (row 0 = p0) takes AI actions although the
# tape would End its turn; the unflagged row (p1) and a row whose +300 lacks
# bit 7 keep obeying the tape.
$npcCount = @{}
foreach ($n in @("NPCON", "NPCOFF", "NPCLOW")) {
  $lines = @(Get-Content (Join-Path $run "$n.TRC"))
  foreach ($who in @("p0", "p1")) {
    # A retail back attack (trigger_leaving_reactions) is emitted as an `attack` line straight
    # after the enemy's own `move` line; it is a reaction, not a turn the tape/AI chose, so it
    # does not count as an action by $who.  (The DQK random target pick changes which foe
    # moves past p1, so p1 can legitimately be back-attacking.)
    $cnt = 0
    for ($li = 0; $li -lt $lines.Count; $li++) {
      if ($lines[$li] -match "^[0-9]+ (attack|move) $who ") {
        if ($lines[$li] -match "^[0-9]+ attack " -and $li -gt 0 -and $lines[$li - 1] -match "^[0-9]+ move ") { continue }
        $cnt++
      }
    }
    $npcCount["$n$who"] = $cnt
  }
}
if ($npcCount["NPCONp0"] -lt 1) { throw "CCCOMBAT DQK recruit (+300=0xB2) took no AI action (p0 actions=$($npcCount['NPCONp0']))" }
if ($npcCount["NPCONp1"] -ne 0) { throw "CCCOMBAT DQK recruit control: tape-driven p1 acted (p1 actions=$($npcCount['NPCONp1']))" }
foreach ($n in @("NPCOFF", "NPCLOW")) {
  if ($npcCount["${n}p0"] -ne 0 -or $npcCount["${n}p1"] -ne 0) { throw "CCCOMBAT DQK $n control did not obey the End tape (p0=$($npcCount["${n}p0"]) p1=$($npcCount["${n}p1"]))" }
}
Write-Output "[PASS] CCCOMBAT: DQK recruited NPC (+300 bit 7) takes AI turns; unflagged and low-bit rows obey the tape (p0 actions $($npcCount['NPCONp0']))"
$dokCastTrace = Get-Content (Join-Path $run "DOKCAST.TRC") -Raw
if (($dokCastTrace | Select-String -Pattern '(?m)^[0-9]+ cast p[0-9] e[0-9] -1 -1 1 [2-5] [0-9]+ -' -AllMatches).Matches.Count -ne 1) {
  throw 'CCCOMBAT DoK Magic Missile command did not emit its automatic-hit cast result'
}
$dokCastResult = [IO.File]::ReadAllBytes((Join-Path $run "DOKCAST.GBR"))
# The caster is whoever the DoK per-round initiative puts first (it was p0 under the old
# once-per-combat d10), so the receipt's party ordinal is derived from the cast line itself.
$dokCastActor = [int](([regex]::Match($dokCastTrace, '(?m)^[0-9]+ cast p([0-9]) ')).Groups[1].Value)
if ($dokCastResult.Length -lt 16 -or [BitConverter]::ToUInt16($dokCastResult, 12) -ne (0x0f00 + $dokCastActor)) {
  throw 'CCCOMBAT DoK Magic Missile command did not publish its raw spell/party receipt'
}
if (($dokCastSourceBeforeProbe | Where-Object { $_ -eq 15 }).Count -ne 1) {
  throw 'CCCOMBAT changed a DoK source spell sidecar before CCHOST persistence'
}
if ($dokCastTrace -notmatch '(?m)^[0-9]+ reject p[0-9] C - - - - - -\r?$') {
  throw 'CCCOMBAT did not explicitly reject the second DoK caster before bridge receipt overwrite'
}
$dokBadTrace = Get-Content (Join-Path $run "DOKBAD.TRC") -Raw
if ((Get-Item (Join-Path $run "SAVE\CHRDATA1.WIZ")).Length -ne 221 -or $dokBadTrace -match '(?m)^[0-9]+ cast ' -or $dokBadTrace -notmatch '(?m)^[0-9]+ reject p0 C - - - - - -\r?$') {
  throw 'CCCOMBAT accepted an oversized DoK WIZ sidecar'
}
$dokNoneTrace = Get-Content (Join-Path $run "DOKNONE.TRC") -Raw
if ($dokNoneTrace -match '(?m)^[0-9]+ cast ' -or $dokNoneTrace -notmatch '(?m)^[0-9]+ reject p0 C - - - - - -\r?$') {
  throw 'CCCOMBAT leaked DoK WIZ handles while rejecting repeated unavailable casts'
}
$liveCastTrace = [IO.File]::ReadAllBytes((Join-Path $run 'KCAST.TRC'))
$liveCastControl = [IO.File]::ReadAllBytes((Join-Path $run 'KCASTCTL.TRC'))
if (-not [Linq.Enumerable]::SequenceEqual[byte]($liveCastTrace, $liveCastControl)) {
  throw 'CCCOMBAT unavailable live Cast changed the tactical result instead of reprompting the same actor'
}
$liveCastLines = Get-Content (Join-Path $run 'KCAST.TRC')
if ($liveCastLines -match ' cast ' -or $liveCastLines -match ' reject p[0-9] C ') {
  throw 'CCCOMBAT unavailable live Cast wrote a headless cast/reject action'
}
if (@($liveCastLines | Where-Object { $_ -match '^1 guard p0 ' }).Count -ne 1) {
  throw 'CCCOMBAT unavailable live Cast did not accept Guard from the same actor'
}
Write-Output '[PASS] CCCOMBAT unavailable live Cast reprompts the same actor without tactical mutation'
Assert-CombatViewRaw (Join-Path $run "DOKSYN.RAW") 400 8000 136 112
Assert-TraceContains (Join-Path $run "DOKSYN.TRC") $dokSyntheticTraceContains "CCCOMBAT synthetic DoK MON1CHA smoke"
Assert-OutcomeFile (Join-Path $run "DOKSYN.OUT") "enemy" "CCCOMBAT synthetic DoK MON1CHA smoke"
Assert-CombatViewRaw (Join-Path $run "BUCKSYN.RAW")
Assert-TraceExact (Join-Path $run "BUCKSYN.TRC") $buckSyntheticExpected "CCCOMBAT synthetic Buck MON0CHA HP smoke"
Assert-OutcomeFile (Join-Path $run "BUCKSYN.OUT") "enemy" "CCCOMBAT synthetic Buck MON0CHA smoke"
Assert-BuckNeededShift "CCCOMBAT Buck raw[55] AC byte drives needed (p->e rows +6)" (Join-Path $run "BUCKAC.TRC") "p" 6
Assert-BuckNeededShift "CCCOMBAT Buck raw[51] THAC0 byte drives needed (e->p rows +5)" (Join-Path $run "BUCKTH.TRC") "e" 5
Assert-BuckEnemyDamage "CCCOMBAT Buck raw[61]/[63]/[65] 1d1+7" (Join-Path $run "BUCKD1.TRC") 8
Assert-BuckEnemyDamage "CCCOMBAT Buck raw[61]/[63]/[65] 3d1+0" (Join-Path $run "BUCKD2.TRC") 3
Assert-BuckEnemyDamage "CCCOMBAT Buck raw[61]/[63]/[65] 2d1-1 (signed bonus)" (Join-Path $run "BUCKD3.TRC") 1
# Unrelated-byte control: raw[58,60,64,66,100,150,180,240] changed (60/64/66 are the unwired
# attacks-count / attack-2 dice); the trace must be byte-identical to BUCKSYN's.
$buckBaseLines = @(Get-Content (Join-Path $run "BUCKSYN.TRC") | Where-Object { $_.Trim().Length -gt 0 })
Assert-TraceExact (Join-Path $run "BUCKCTL.TRC") $buckBaseLines "CCCOMBAT Buck unrelated-byte control"
Assert-CombatViewRaw (Join-Path $run "POOLSYN.RAW")
Assert-TraceExact (Join-Path $run "POOLSYN.TRC") $gbefExpected "CCCOMBAT synthetic Pool MON1CHA smoke"
Assert-OutcomeFile (Join-Path $run "POOLSYN.OUT") "party" "CCCOMBAT synthetic Pool MON1CHA smoke"
Assert-CombatViewRaw (Join-Path $run "POOLPAD.RAW")
Assert-TraceExact (Join-Path $run "POOLPAD.TRC") $gbefExpected "CCCOMBAT padded Pool MON1CHA streaming smoke"
Assert-OutcomeFile (Join-Path $run "POOLPAD.OUT") "party" "CCCOMBAT padded Pool MON1CHA streaming smoke"
Assert-TraceExact (Join-Path $run "COABHATT.TRC") $coabHalfAttackExpected "CCCOMBAT CoAB half-attacks MONCHA smoke"
Assert-OutcomeFile (Join-Path $run "COABHATT.OUT") "enemy" "CCCOMBAT CoAB half-attacks MONCHA smoke"
Assert-TraceContains (Join-Path $run "COABATT2.TRC") $coabAttack2TraceContains "CCCOMBAT CoAB attack2 fallback MONCHA smoke"
Assert-OutcomeFile (Join-Path $run "COABATT2.OUT") "enemy" "CCCOMBAT CoAB attack2 fallback MONCHA smoke"
Assert-TraceExact (Join-Path $run "COABDUAL.TRC") $coabDualAttackExpected "CCCOMBAT CoAB dual-attack MONCHA smoke"
Assert-OutcomeFile (Join-Path $run "COABDUAL.OUT") "enemy" "CCCOMBAT CoAB dual-attack MONCHA smoke"
Assert-TraceExact (Join-Path $run "DQKHATT.TRC") $dqkCompactAttackExpected "CCCOMBAT DQK fidelity-29 fixed-layout MONCHA smoke"
# 2026-10-07: the DQK golden above was RE-DERIVED, not recaptured.  DQK computer-controlled turns now
# pick their victim uniformly at random (retail find_target / 0x2EB70 roll(count,1)), and a stored
# target on side 0 is dropped before each swing (0x2E94D).  e0 therefore draws die(2) twice (pick, then
# drop-and-repick) before each swing while p0 and p1 are both in reach, shifting every later roll.
# This independent LCG replay (state*1664525+1013904223, seed 4660) checks every d20 in the trace sits
# at the stream index that rule predicts and that the final pick lands on the traced victim.
$dqkReplay = @'
import sys, re
lines = [l.split() for l in open(sys.argv[1]).read().splitlines() if ' attack ' in l]
st = 4660; o = []
for _ in range(200):
    st = (st * 1664525 + 1013904223) & 0xFFFFFFFF; o.append(st)
pos = 3                      # three initiative d10s precede the first attack
prev_hit = None
for n, f in enumerate(lines):
    rnd, _, actor, target, roll, need, hit = int(f[0]), f[1], f[2], f[3], int(f[4]), int(f[5]), int(f[6])
    picks = 2 if (actor == 'e0' and rnd in (2, 3)) else 0
    if picks:
        a, b = pos, pos + 1
        victim = ['p0', 'p1'][o[b] % 2]
        assert victim == target, ('final repick', n, victim, target)
        pos += 2
    assert o[pos] % 20 + 1 == roll, ('d20 stream index', n, pos, o[pos] % 20 + 1, roll)
    pos += 1
    if hit: pos += 1         # one damage die follows a hit
print('DQKHATT LCG replay: %d attack rolls at predicted stream indexes' % len(lines))
'@
$dqkReplayPath = Join-Path $run "dqkhatt-replay.py"
$dqkReplay | Set-Content -LiteralPath $dqkReplayPath -Encoding ASCII
if (Get-Command python -ErrorAction SilentlyContinue) {
  python -I $dqkReplayPath (Join-Path $run "DQKHATT.TRC")
  if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT DQK random-target LCG replay of DQKHATT.TRC failed" }
}

function Assert-DqkRateKinds([string]$Name, [string[]]$Expected) {
  $path = Join-Path $run "$Name.TRC"
  $actual = [Collections.Generic.List[string]]::new()
  foreach ($line in Get-Content $path) {
    $fields = $line -split '\s+'
    if ($fields.Count -lt 9 -or $fields[1] -ne 'attack' -or $fields[2] -ne 'e0') { continue }
    $roundNumber = [int]$fields[0]
    if ($roundNumber -gt 2) { continue }
    # Synthetic primary is 1d1; secondary is 1d1+1. Their damage values
    # cannot overlap, so the trace exposes kind selection as well as allowance.
    $kind = switch ($fields[7]) {
      '1' { 'P' }
      '2' { 'S' }
      default { throw "$Name emitted an unknown DQK attack profile: $line" }
    }
    $actual.Add("$roundNumber$kind")
  }
  $got = @($actual.ToArray())
  if (($got -join ',') -cne ($Expected -join ',')) {
    throw "$Name DQK cadence mismatch: got [$($got -join ',')], expected [$($Expected -join ',')]"
  }
}

# Exact first-two-round attempt traces. DQKR12 mutates only A+59 from the 4/2
# record; DQKR40 mutates only A+60. DQKR36 is the retail odd-rate counterexample.
Assert-DqkRateKinds 'DQKR42' @('1S','1P','1P','2S','2P','2P')
Assert-DqkRateKinds 'DQKR36' @('1S','1S','1S','1P','2S','2S','2S','2P','2P')
Assert-DqkRateKinds 'DQKR10' @('2P')
Assert-DqkRateKinds 'DQKR02' @('1S','2S')
Assert-DqkRateKinds 'DQKR40' @('1P','1P','2P','2P')
Assert-DqkRateKinds 'DQKR12' @('1S','2S','2P')
Assert-DqkRateKinds 'DQKR00' @()
Write-Output '[PASS] DQK source-byte rate controls pin kind order, odd-rate phase, mutations, and zero allowances'

#  INTERACTIVE /K EQUIVALENCE.  /K is /E plus a screen and a keyboard, so the
#  simulation it runs must be the SAME simulation.  This drives the identical
#  DQKHATT fixture through /K with a tape of Q (Quick = hand this turn to the
#  AI, which is exactly what /E does with no tape at all) and requires the two
#  trace files to be byte-identical.
#
#  WHAT THIS DOES AND DOES NOT COVER.  It covers /K argument parsing, entering
#  mode 13h, render_combat_view, the whole battle running with the renderer
#  live, interactive_epilogue completing without a keypress when no human ever
#  touched it, and the text mode being restored.  It does NOT cover the command
#  bar, the move loop, or any keystroke -- the tape never runs out here, so
#  interactive_prompt is never called.  Those need synthetic input and are
#  unpinned; do not read a green tick here as "the interactive turn works".
#
#  THIS CASE HAS BEEN SEEN FAILING, on a real defect, before it was seen
#  passing -- which is the only reason it counts as evidence here.  On its
#  first run it died with "traces diverge at byte 0 (/K 0 vs /E 49)": the /K
#  trace was 606 bytes, the correct LENGTH, and entirely NUL.  Cause:
#  render_combat_view left ES on video RAM, every trace line in cccombat.asm is
#  assembled with STOSB through ES:DI, and eol_flush writes DS:DX -- so the text
#  went to the framebuffer and the file got the untouched linebuf.  The outcome
#  file said "enemy" correctly throughout.  A file of the right size, with a
#  correct sibling artifact next to it, containing nothing.
#
#  I did NOT mutation-test this case beyond that, and an earlier draft of this
#  comment claimed I had.  Two limits stated instead of measured, both true by
#  construction: do_player_move and interactive_prompt are never entered here,
#  because the Q tape never runs out, so no mutation to the move loop or the
#  command bar can turn this red; and now that ES is restored by the callee,
#  deleting the render_combat_view call from the /K arm would leave this green
#  too.  What it still guards is that /K parses, runs the same simulation to
#  the same bytes, and terminates without waiting on a keystroke nobody is
#  there to press.
$kTrace = Join-Path $run "DQKK.TRC"
$eTrace = Join-Path $run "DQKHATT.TRC"
if (-not (Test-Path $kTrace)) { throw "CCCOMBAT /K interactive-mode smoke failed: $kTrace was not produced (a hang leaves no file)" }
$kBytes = [IO.File]::ReadAllBytes($kTrace)
$eBytes = [IO.File]::ReadAllBytes($eTrace)
if ($kBytes.Length -ne $eBytes.Length) {
  throw "CCCOMBAT /K interactive-mode smoke failed: /K trace is $($kBytes.Length) bytes, /E trace is $($eBytes.Length)"
}
for ($i = 0; $i -lt $kBytes.Length; $i++) {
  if ($kBytes[$i] -ne $eBytes[$i]) {
    throw "CCCOMBAT /K interactive-mode smoke failed: traces diverge at byte $i (/K $($kBytes[$i]) vs /E $($eBytes[$i]))"
  }
}
Write-Output "[PASS] CCCOMBAT /K interactive mode reproduces the /E trace ($($kBytes.Length) bytes)"

# -- the retail back attack (fixture 40) ----------------------------------
#
#  A PAIRED test, not a golden, because a golden cannot say WHICH mechanic
#  produced a line.  Both runs use the same fixture and the same seed 4660 and
#  differ only in the tape: "M4D..." walks p0 one square west out of contact,
#  "G..." guards in place and never moves.
#
#  The signature is an ORDERING that only the leaving reaction can produce:
#  trigger_leaving_reactions resolves BEFORE the position is committed, so e0's
#  free swing is traced immediately before p0's move line.  The guard reaction
#  fires after the commit and would appear on the other side of it, and e0 is
#  not guarding in any case.
#
#  SEEN FAILING FIRST, which is the only reason to trust it.  Mutation run
#  2026-09-07: commenting out the single "call trigger_leaving_reactions" in
#  do_player_move and rebuilding (62,928 resident vs 62,936) turns this red on
#  the adjacency check -- "no e0 attack line immediately precedes p0's round-1
#  move line".  The source was restored from a byte backup and re-hashed, not
#  git-restored.  Worth recording what the SAME mutation did NOT do: the /K
#  606-byte case above stayed green, which is the measured limit of that case
#  and the reason this one exists.
#
#  It also pins the NUMBER.  e0 has THAC0 1 against p0's AC 10, so an ordinary
#  swing needs -9; the rear-AC substitution is BACK_ATTACK_AC = 2 points, so
#  the reaction must need -11.  Comparing the two traces rather than hard-coding
#  -11 means the pin follows the fixture if the fixture is ever retuned.
$bmPath = Join-Path $run "BACKMOVE.TRC"
$bgPath = Join-Path $run "BACKGRD.TRC"
foreach ($p in @($bmPath, $bgPath)) {
  if (-not (Test-Path $p)) { throw "CCCOMBAT back-attack fixture failed: $p was not produced (a hang leaves no file)" }
}
$bmLines = @(Get-Content $bmPath)
$bgLines = @(Get-Content $bgPath)

# The tape must actually have walked, or the whole case is vacuous.
if (@($bmLines | Where-Object { $_ -match '^1 move p0 ' }).Count -lt 1) {
  throw "CCCOMBAT back-attack fixture failed: the M4D tape produced no round-1 move line, so the move loop never ran"
}
# ...and the control must NOT have walked, or the pair discriminates nothing.
if (@($bgLines | Where-Object { $_ -match '^\d+ move p0 ' }).Count -ne 0) {
  throw "CCCOMBAT back-attack fixture failed: the control G tape produced a move line"
}

$reaction = $null
for ($i = 1; $i -lt $bmLines.Count; $i++) {
  if ($bmLines[$i] -match '^1 move p0 ' -and $bmLines[$i - 1] -match '^1 attack e0 p0 ') {
    $reaction = $bmLines[$i - 1]
    break
  }
}
if ($null -eq $reaction) {
  throw "CCCOMBAT back-attack fixture failed: no e0 attack line immediately precedes p0's round-1 move line"
}

$ordinary = @($bgLines | Where-Object { $_ -match '^1 attack e0 p0 ' })
if ($ordinary.Count -lt 1) {
  throw "CCCOMBAT back-attack fixture failed: the control produced no ordinary e0 attack to compare against"
}
$reactNeeded = [int]($reaction -split '\s+')[5]
$ordNeeded   = [int]($ordinary[0] -split '\s+')[5]
if (($ordNeeded - $reactNeeded) -ne 2) {
  throw "CCCOMBAT back-attack fixture failed: rear-AC delta is $($ordNeeded - $reactNeeded), expected 2 (ordinary needed $ordNeeded, back attack needed $reactNeeded)"
}
Write-Output "[PASS] CCCOMBAT back attack fires on leaving contact, at the sourced 2-point rear AC (needed $ordNeeded -> $reactNeeded)"

# -- AI and flee routes execute their selected path one square at a time -----
#
# Fixture 23 starts feared e0 adjacent to p0. Its p0 reaction must precede the
# first flee destination. STAYADJ keeps p0 adjacent to e0 after the move and
# proves no departure attack is invented. CCROUTE is the test-only fixture-48
# binary patch above: e0 closes on distant p0, then p1 kills it while it leaves
# p1's reach, so the final square cannot be committed.
$fleeRouteLines = @(Get-Content (Join-Path $run "ROUTFLEE.TRC"))
$fleeReactionAt = [Array]::IndexOf([string[]]$fleeRouteLines, '1 attack p0 e0 12 8 1 1 7 -')
$fleeMoveAt = [Array]::IndexOf([string[]]$fleeRouteLines, '1 flee e0 - - - - - - - 6 5')
if ($fleeReactionAt -lt 0 -or $fleeMoveAt -ne ($fleeReactionAt + 1)) {
  throw 'CCCOMBAT flee route did not resolve the departure reaction immediately before its first step'
}
$stayLines = @(Get-Content (Join-Path $run "STAYADJ.TRC"))
$stayMoveAt = [Array]::IndexOf([string[]]$stayLines, '1 move p0 - - - - - - - 5 5')
if ($stayMoveAt -lt 1 -or $stayLines[$stayMoveAt - 1] -match '^1 attack e0 p0 ') {
  throw 'CCCOMBAT stay-adjacent control incorrectly produced a departure reaction'
}
$routeHitLines = @(Get-Content (Join-Path $run "ROUTEHIT.TRC"))
$routeMoves = @($routeHitLines | Where-Object { $_ -match '^1 move e0 ' })
if (($routeMoves -join "`n") -ne (@(
  '1 move e0 - - - - - - - 4 4',
  '1 move e0 - - - - - - - 3 4',
  '1 move e0 - - - - - - - 2 4'
) -join "`n")) {
  throw 'CCCOMBAT AI route did not preserve the selected per-square path before its reaction'
}
$routeReactionAt = [Array]::IndexOf([string[]]$routeHitLines, '1 attack p1 e0 12 -11 1 100 0 -')
if ($routeReactionAt -lt 1 -or $routeHitLines[$routeReactionAt - 1] -ne '1 move e0 - - - - - - - 2 4') {
  throw "CCCOMBAT AI route did not resolve p1's leaving reaction at the departure square"
}
if ($routeHitLines -contains '1 move e0 - - - - - - - 1 4') {
  throw 'CCCOMBAT continued an AI route after its departure reaction killed the mover'
}
Write-Output '[PASS] CCCOMBAT applies departure reactions, hazards, and Guard per AI/flee route square'

# -- diagonal steps cost more than orthogonal ones (fixture 41) ------------
#
#  Both runs give p0 movement 6 -- a budget of 12 half-squares -- and feed it
#  EIGHT direction keys, more than either cost model can spend, so the count
#  of move lines is decided by the charge and not by the tape.
#
#  Only the diagonal discriminates, which is why the pair is asymmetric rather
#  than tidy: a budget of move*2 charged 2 per orthogonal step and a budget of
#  move charged 1 per step both allow exactly 6 steps, so the orthogonal run
#  is a CONTROL that pins the budget, not evidence for the ratio. The diagonal
#  run is the discriminator: 4 steps at 3 half-squares each under the measured
#  model, against 6 under the old one.
#
#  MUTATION RUN 2026-09-07, so the discriminating half is measured and not
#  merely argued: setting MOVE_COST_DIAG to 2 makes the diagonal run buy 6
#  steps and this goes red, while the back-attack case above stays green.
#  Source restored from a byte backup and re-hashed, not git-restored.
#
#  The ratio is measured, not assumed. In Champions of Krynn GAME.OVR the
#  orthogonal charge is `d1 e0` (shl ax,1) at 0x155AE and the diagonal is
#  `d1 e0 01 f0` (shl then add, i.e. x3) at 0x1557C -- read out of the retail
#  bytes for this commit, not taken from a report.
$orthLines = @(Get-Content (Join-Path $run "STEPORTH.TRC"))
$diagLines = @(Get-Content (Join-Path $run "STEPDIAG.TRC"))
$orthMoves = @($orthLines | Where-Object { $_ -match '^1 move p0 ' }).Count
$diagMoves = @($diagLines | Where-Object { $_ -match '^1 move p0 ' }).Count
if ($orthMoves -ne 6) {
  throw "CCCOMBAT step-cost fixture failed: movement 6 bought $orthMoves orthogonal steps, expected 6"
}
if ($diagMoves -ne 4) {
  throw "CCCOMBAT step-cost fixture failed: movement 6 bought $diagMoves diagonal steps, expected 4 (a 1-per-step budget would give 6)"
}
Write-Output "[PASS] CCCOMBAT step cost is 3:2 diagonal:orthogonal (movement 6 buys $orthMoves orthogonal, $diagMoves diagonal)"

# -- an unaffordable step is refused, not overdrawn (fixture 42) -----------
#
#  Fixture 41 above cannot see this: movement 6 divides exactly by both step
#  costs, so nothing is ever left stranded.  Movement 4 does not -- a budget
#  of 8 buys two diagonal steps at 3 and strands 2, and the third step is
#  where the two models part company.  Retail computes the cost BEFORE
#  committing and prints "can't go there" when it cannot be paid
#  (ovr009.cs:544-546), giving 2 steps; charging first and letting the budget
#  go negative gives 3.
#
#  SEEN FAILING FIRST, measured 2026-09-07 and not merely asserted: with the
#  pre-check's `jg .blocked` deleted (63.500 bytes resident against 63.504)
#  the run produced exactly 3 move lines and threw here.  The source was
#  restored from a byte backup and its SHA-256 re-verified.
$capLines = @(Get-Content (Join-Path $run "STEPCAP.TRC"))
$capMoves = @($capLines | Where-Object { $_ -match '^1 move p0 ' }).Count
if ($capMoves -ne 2) {
  throw "CCCOMBAT step-affordability fixture failed: movement 4 bought $capMoves diagonal steps, expected 2 (an overdrawn budget buys 3)"
}
Write-Output "[PASS] CCCOMBAT refuses an unaffordable step instead of overdrawing (movement 4 buys $capMoves diagonal steps)"

# -- movement is one turn ledger; unsupported headless commands cannot auto-act --
$splitLines = @(Get-Content (Join-Path $run "TSPLIT.TRC"))
$splitMoves = @($splitLines | Where-Object { $_ -match '^1 move p0 ' }).Count
if ($splitMoves -ne 4) {
  throw "CCCOMBAT split-turn movement failed: two Move commands spent $splitMoves round-1 squares, expected the one turn budget of 4"
}
if (@($splitLines | Where-Object { $_ -match '^1 attack p0 e0 ' }).Count -ne 0) {
  throw 'CCCOMBAT split-turn movement reset its budget and reached an enemy beyond the legal fourth square'
}
$unsupported = [IO.File]::ReadAllBytes((Join-Path $run "CMDUNSUP.TRC"))
$explicitEnd = [IO.File]::ReadAllBytes((Join-Path $run "CMDEND.TRC"))
$unsupportedLines = @(Get-Content (Join-Path $run "CMDUNSUP.TRC"))
if (@($unsupportedLines | Where-Object { $_ -eq '1 reject p0 A - - - - - -' }).Count -ne 1) {
  throw 'CCCOMBAT did not record the rejected headless command'
}
$unsupportedState = [Text.Encoding]::ASCII.GetBytes((@($unsupportedLines | Where-Object { $_ -notmatch ' reject ' }) -join "`r`n") + "`r`n")
if (-not [Linq.Enumerable]::SequenceEqual[byte]($unsupportedState, $explicitEnd)) {
  throw 'CCCOMBAT rejected headless command changed the End-equivalent combat state'
}
Write-Output '[PASS] CCCOMBAT retains one movement budget and records unsupported headless commands without auto-action'

# -- Delay and Quick retain the same per-actor turn ledgers -----------------
#
# Fixture 47 splits four legal squares around Delay.  Its rotated second slot
# is still round 1, so it is the direct control for a fresh-ledger regression.
$delayLines = @(Get-Content (Join-Path $run "DELAYLED.TRC"))
$delayMoves = @($delayLines | Where-Object { $_ -match '^1 move p0 ' })
if ($delayMoves.Count -ne 4) {
  throw "CCCOMBAT Delay ledger failed: Move->Delay->Move spent $($delayMoves.Count) round-1 squares, expected 4"
}
if (@($delayLines | Where-Object { $_ -match '^1 attack p0 e0 ' }).Count -ne 0) {
  throw 'CCCOMBAT Delay ledger reset movement and reached e0 beyond the legal fourth square'
}

# Fixture 46 first walks p0 from (8,4) to (6,4).  Carried Quick has two
# squares left and therefore reaches (4,4) through two Quick steps; a fresh
# AI C_MOVE 4 allowance reaches (2,4).  The Q-only control still takes its
# untouched full allowance through four steps to (4,4).
$quickPartLines = @((Get-Content (Join-Path $run "QUICKPAR.TRC")) | Where-Object { $_ -match '^1 move p0 ' })
if ($quickPartLines.Count -ne 4) {
  throw "CCCOMBAT Quick movement ledger failed: expected two manual moves plus two carried Quick moves, got $($quickPartLines.Count)"
}
$quickPartTail = $quickPartLines[-1] -split '\s+'
if ($quickPartTail[-2] -ne '4' -or $quickPartTail[-1] -ne '4') {
  throw "CCCOMBAT Quick movement ledger failed: carried Quick ended at ($($quickPartTail[-2]),$($quickPartTail[-1])), expected (4,4)"
}
$quickFullLines = @((Get-Content (Join-Path $run "QUICKFUL.TRC")) | Where-Object { $_ -match '^1 move p0 ' })
if ($quickFullLines.Count -ne 4) {
  throw "CCCOMBAT untouched Quick control failed: expected four full-budget AI movement lines, got $($quickFullLines.Count)"
}
$quickFullTail = $quickFullLines[-1] -split '\s+'
if ($quickFullTail[-2] -ne '4' -or $quickFullTail[-1] -ne '4') {
  throw "CCCOMBAT untouched Quick control changed destination to ($($quickFullTail[-2]),$($quickFullTail[-1])), expected (4,4)"
}

# Fixture 48 kills e0 with one bump attack before Quick.  Only the second of
# p0's two attacks remains for e1; reloading attacks_this_round emits two.
$quickAttackLines = @(Get-Content (Join-Path $run "QUICKATT.TRC"))
if (@($quickAttackLines | Where-Object { $_ -match '^1 attack p0 e0 ' }).Count -ne 1) {
  throw 'CCCOMBAT Quick attack-ledger fixture did not spend exactly one pre-Quick bump attack on e0'
}
if (@($quickAttackLines | Where-Object { $_ -match '^1 attack p0 e1 ' }).Count -ne 1) {
  throw 'CCCOMBAT Quick refilled attacks after a partial player expenditure'
}
Write-Output '[PASS] CCCOMBAT carries movement and attack budgets through Delay and Quick'

# -- direct and Move-mode Flee share the player's remaining move ledger ------
#
# Fixture 46 begins at (8,4) with four squares.  Two westward moves leave two
# squares.  Flee selects the nearer east edge, so a carried ledger can reach
# only (8,4); rereading C_MOVE wrongly reaches (9,4) and exits.  The two tapes
# distinguish the command-bar F from F entered inside Move mode.  A fresh F
# control proves that the untouched action still has its full legal route.
$fleeDirect = @((Get-Content (Join-Path $run "FLEEDIR.TRC")) | Where-Object { $_ -match '^1 flee p0 ' })
$fleeMove = @((Get-Content (Join-Path $run "FLEEMOV.TRC")) | Where-Object { $_ -match '^1 flee p0 ' })
$fleeFull = @((Get-Content (Join-Path $run "FLEEFULL.TRC")) | Where-Object { $_ -match '^1 flee p0 ' })
if ($fleeDirect.Count -ne 2 -or $fleeDirect[-1] -notmatch ' 8 4$') {
  throw 'CCCOMBAT direct Flee reloaded a full movement allowance after a partial Move'
}
if ($fleeMove.Count -ne 2 -or $fleeMove[-1] -notmatch ' 8 4$') {
  throw 'CCCOMBAT Move-mode Flee reloaded a full movement allowance after a partial Move'
}
if ($fleeFull.Count -ne 1 -or $fleeFull[-1] -notmatch ' 9 4$') {
  throw 'CCCOMBAT untouched Flee no longer receives its full movement allowance'
}
Write-Output '[PASS] CCCOMBAT direct and Move-mode Flee retain the current movement ledger'

# -- a bump attack does not end the move by itself (fixtures 43 and 44) ----
#
#  A PAIRED test.  Both runs are the same three-combatant fixture, the same
#  seed and the SAME TAPE "M64D": step east into e0, then west, then end.
#  The only difference is e0's hit points -- 3 in the kill run, 100 in the
#  control -- so anything that differs between the traces is caused by
#  whether the target survived the swing, and by nothing else.
#
#  What retail does, and what this pins: an attack costs no movement and does
#  not break the move loop.  The turn ends only when the attacker's attacks
#  are spent.  p0 has two, so
#    * killing e0 on the first swing leaves one attack unspent, the loop keeps
#      running, and the "4" in the tape produces a MOVE line;
#    * a surviving e0 absorbs BOTH swings in the one command and the turn is
#      over, so there is no move line and the "4" is never read as a step.
#
#  SEEN FAILING FIRST, measured 2026-09-07 by restoring the code this
#  replaces -- one resolve_hit and an unconditional `jmp .done` (63.480 bytes
#  resident against 63.504).  The control run swung 1 time instead of 2 and
#  threw; BUMPKILL.TRC was then read directly and carried 0 round-1 move
#  lines against the 1 required, so the ordering assertion is discriminating
#  too and not merely shadowed by the throw above it.  Source restored from a
#  byte backup, SHA-256 re-verified.
$killLines = @(Get-Content (Join-Path $run "BUMPKILL.TRC"))
$liveLines = @(Get-Content (Join-Path $run "BUMPLIVE.TRC"))

$killAtt = @($killLines | Where-Object { $_ -match '^1 attack p0 e0 ' }).Count
$liveAtt = @($liveLines | Where-Object { $_ -match '^1 attack p0 e0 ' }).Count
if ($killAtt -ne 1) {
  throw "CCCOMBAT bump-attack fixture failed: the kill run swung $killAtt times, expected 1 (the drain loop must stop when the target drops)"
}
if ($liveAtt -ne 2) {
  throw "CCCOMBAT bump-attack fixture failed: the control run swung $liveAtt times, expected 2 (a surviving target absorbs every remaining attack)"
}

# The move line must come AFTER the swing, or it is some other step and the
# ordering claim is unproven.
$killAttIdx = -1
$killMoveIdx = -1
for ($i = 0; $i -lt $killLines.Count; $i++) {
  if ($killAttIdx -lt 0 -and $killLines[$i] -match '^1 attack p0 e0 ') { $killAttIdx = $i }
  if ($killMoveIdx -lt 0 -and $killLines[$i] -match '^1 move p0 ') { $killMoveIdx = $i }
}
if ($killMoveIdx -lt 0 -or $killMoveIdx -lt $killAttIdx) {
  throw "CCCOMBAT bump-attack fixture failed: killing the target did not leave move mode open (attack at line $killAttIdx, move at line $killMoveIdx)"
}
if (@($liveLines | Where-Object { $_ -match '^1 move p0 ' }).Count -ne 0) {
  throw "CCCOMBAT bump-attack fixture failed: the control run moved after spending both attacks"
}
${guardLines} = @(Get-Content (Join-Path $run "BUMPG.TRC") | Where-Object { $_ -match ' guard p0 ' })
if (@($guardLines | Where-Object { $_ -match '^1 guard p0 ' }).Count -ne 0) {
  throw 'CCCOMBAT bump-attack fixture failed: an exhausted mover could still Guard before ending its turn'
}
if (@($guardLines | Where-Object { $_ -match '^[2-9] guard p0 ' }).Count -ne 1) {
  throw "CCCOMBAT bump-attack fixture failed: the queued Guard did not survive to p0's later turn"
}
Write-Output "[PASS] CCCOMBAT bump attack drains attacks without debiting movement (kill $killAtt swing then a move; survivor $liveAtt swings and no move)"
Assert-OutcomeFile (Join-Path $run "DQKK.OUT") "enemy" "CCCOMBAT /K interactive-mode smoke"
Assert-OutcomeFile (Join-Path $run "DQKHATT.OUT") "enemy" "CCCOMBAT DQK fidelity-29 fixed-layout MONCHA smoke"
Assert-RejectedEffectHandoff 'MANY' 'CCCOMBAT overlarge group-count smoke'
Assert-RejectedEffectHandoff 'CAP2' 'CCCOMBAT two-member capacity smoke'
Assert-RejectedEffectHandoff 'CAP6' 'CCCOMBAT six-member capacity smoke'
Write-Output '[PASS] CCCOMBAT rejects overlarge group and combatant handoffs before publication'
foreach ($name in @("MIXED.TRC", "MIXED.OUT", "MIXED.GBR")) {
  if (Test-Path (Join-Path $run $name)) {
    throw "CCCOMBAT mixed valid/unknown MON encounter published $name instead of rejecting the handoff"
  }
}
if ((Get-Content (Join-Path $run "MIXED.TXT") -Raw) -notmatch "bad effect") {
  throw "CCCOMBAT mixed valid/unknown MON encounter did not report a rejected handoff"
}
Write-Output "[PASS] CCCOMBAT rejects a mixed valid/unknown MON encounter before result publication"
if ($hasRealMon) {
  Assert-TraceExact (Join-Path $run "REALMON.TRC") $realMonExpected "CCCOMBAT real MON1CHA smoke"
}
if ($hasDokMon) {
  Assert-TraceExact (Join-Path $run "DOKMON.TRC") $dokMonExpected "CCCOMBAT DoK MON1CHA smoke"
}
if ($hasCoabMon) {
  Assert-CombatViewRaw (Join-Path $run "COAB50.RAW") 400 8000
  Assert-TraceExact (Join-Path $run "COAB50.TRC") $coabMonExpected "CCCOMBAT CoAB MON5CHA smoke"
  Assert-OutcomeFile (Join-Path $run "COAB50.OUT") "enemy" "CCCOMBAT CoAB MON5CHA smoke"
}
if ($hasDqkMon) {
  Assert-TraceExact (Join-Path $run "DQKMON.TRC") $dqkMonExpected "CCCOMBAT DQK MONCHA smoke"
  foreach ($rawCase in @('DQKDEC', 'DQKREC', 'DQKST', 'DQKNPC')) {
    if ([IO.File]::ReadAllBytes((Join-Path $run "$rawCase.EFX"))[17] -ne 0) {
      throw "CCCOMBAT $rawCase must exercise the untagged primary-strike path"
    }
  }
  Assert-CombatViewRaw (Join-Path $run "DQKDEC.RAW") 400 8000 136 112
  Assert-TraceExact (Join-Path $run "DQKDEC.TRC") $dqkDecExpected "CCCOMBAT DQK MONCHA dec-path smoke"
  Assert-OutcomeFile (Join-Path $run "DQKDEC.OUT") "enemy" "CCCOMBAT DQK MONCHA dec-path smoke"
  Assert-CombatViewRaw (Join-Path $run "DQKREC.RAW") 400 8000 136 112
  Assert-TraceExact (Join-Path $run "DQKREC.TRC") $dqkReconExpected "CCCOMBAT DQK MONCHA reconstruction smoke"
  Assert-OutcomeFile (Join-Path $run "DQKREC.OUT") "enemy" "CCCOMBAT DQK MONCHA reconstruction smoke"
  Assert-CombatViewRaw (Join-Path $run "DQKST.RAW") 400 8000 136 112
  Assert-TraceExact (Join-Path $run "DQKST.TRC") $dqkShortExpected "CCCOMBAT DQK MONCHA short-tail/canon-AC smoke"
  Assert-OutcomeFile (Join-Path $run "DQKST.OUT") "enemy" "CCCOMBAT DQK MONCHA short-tail/canon-AC smoke"
  Assert-CombatViewRaw (Join-Path $run "DQKNPC.RAW") 400 8000 136 112
  Assert-TraceExact (Join-Path $run "DQKNPC.TRC") $dqkNpcExpected "CCCOMBAT DQK MONCHA NPC-framed smoke"
  Assert-OutcomeFile (Join-Path $run "DQKNPC.OUT") "enemy" "CCCOMBAT DQK MONCHA NPC-framed smoke"
}

Write-Output "[PASS] CCCOMBAT: seeded Tier-1 melee trace"
Write-Output "[PASS] CCCOMBAT: Gen1 hp+10 boundary trace"
Write-Output "[PASS] CCCOMBAT: Gen1 overkill trace"
Write-Output "[PASS] CCCOMBAT: Gen2 overkill trace"
Write-Output "[PASS] CCCOMBAT: Large-footprint melee reach trace"
Write-Output "[PASS] CCCOMBAT: Large-footprint close-step trace"
Write-Output "[PASS] CCCOMBAT: open-grid movement-budget trace"
Write-Output "[PASS] CCCOMBAT: routed open-grid movement trace"
Write-Output "[PASS] CCCOMBAT: blocked terrain movement trace"
Write-Output "[PASS] CCCOMBAT: terrain-cost movement trace"
Write-Output "[PASS] CCCOMBAT: per-combatant movement allowance trace"
Write-Output "[PASS] CCCOMBAT: missile range trace"
Write-Output "[PASS] CCCOMBAT: missile body line-of-fire trace"
Write-Output "[PASS] CCCOMBAT: missile terrain line-of-fire trace"
Write-Output "[PASS] CCCOMBAT: missile short-range to-hit trace"
Write-Output "[PASS] CCCOMBAT: missile medium-range to-hit trace"
Write-Output "[PASS] CCCOMBAT: missile long-range to-hit trace"
Write-Output "[PASS] CCCOMBAT: Large-target missile line-of-fire trace"
Write-Output "[PASS] CCCOMBAT: Large-shooter missile line-of-fire trace"
Write-Output "[PASS] CCCOMBAT: Large all-lines-blocked trace"
Write-Output "[PASS] CCCOMBAT: morale fear/flee trace"
Write-Output "[PASS] CCCOMBAT: morale surrender trace"
Write-Output "[PASS] CCCOMBAT: routed flee movement trace"
Write-Output "[PASS] CCCOMBAT: party flee escaped trace/outcome"
Write-Output "[PASS] CCCOMBAT: party flee blocked trace/outcome"
Write-Output "[PASS] CCCOMBAT: hazard start/move traces"
Write-Output "[PASS] CCCOMBAT: integer and half-attack traces"
Write-Output "[PASS] CCCOMBAT: /V tactical viewport RAW"
Write-Output "[PASS] CCCOMBAT: /V CCECL GBEF viewport RAW"
Write-Output "[PASS] CCCOMBAT: CCECL GBEF encounter trace/outcome/RAW"
Write-Output "[PASS] CCCOMBAT: CCECL GBEF /W WGRD blocker trace/outcome"
Write-Output "[PASS] CCCOMBAT: DoK GBD1 imported warrior half-attacks trace/outcome"
Write-Output "[PASS] CCCOMBAT: synthetic DoK compact MON1CHA encounter trace/outcome/RAW"
Write-Output "[PASS] CCCOMBAT: synthetic Pool 287-byte MON1CHA encounter trace/outcome/RAW"
Write-Output "[PASS] CCCOMBAT: padded Pool MON1CHA streaming trace/outcome/RAW"
Write-Output "[PASS] CCCOMBAT: CoAB MONCHA half-attacks trace/outcome"
Write-Output "[PASS] CCCOMBAT: CoAB MONCHA attack2 fallback trace/outcome"
Write-Output "[PASS] CCCOMBAT: CoAB MONCHA dual-attack trace/outcome"
Write-Output "[PASS] CCCOMBAT: DQK fidelity-29 fixed-layout MONCHA trace/outcome"
Write-Output "[PASS] CCCOMBAT: overlarge GBEF group/count rejection"
if ($hasRealMon) {
  Write-Output "[PASS] CCCOMBAT: real CoK MON1CHA encounter trace"
} else {
  Write-Output "[SKIP] CCCOMBAT: real CoK MON1CHA encounter trace (archive not found)"
}
if ($hasDokMon) {
  Write-Output "[PASS] CCCOMBAT: real DoK MON1CHA encounter trace"
} else {
  Write-Output "[SKIP] CCCOMBAT: real DoK MON1CHA encounter trace (archive not found)"
}
if ($hasCoabMon) {
  Write-Output "[PASS] CCCOMBAT: real CoAB MON5CHA block 50 encounter trace"
} else {
  Write-Output "[SKIP] CCCOMBAT: real CoAB MON5CHA block 50 encounter trace (coab_extracted data not found)"
}
if ($hasDqkMon) {
  Write-Output "[PASS] CCCOMBAT: real DQK MONCHA encounter trace"
  Write-Output "[PASS] CCCOMBAT: real DQK MONCHA raw dec-path encounter trace"
  Write-Output "[PASS] CCCOMBAT: real DQK MONCHA reconstructed encounter trace"
  Write-Output "[PASS] CCCOMBAT: real DQK MONCHA short-tail/canon-AC encounter trace"
  Write-Output "[PASS] CCCOMBAT: real DQK MONCHA NPC-framed encounter trace"
} else {
  Write-Output "[SKIP] CCCOMBAT: real DQK MONCHA encounter trace (archive not found)"
  Write-Output "[SKIP] CCCOMBAT: real DQK MONCHA raw dec-path encounter trace (archive not found)"
  Write-Output "[SKIP] CCCOMBAT: real DQK MONCHA reconstructed encounter trace (archive not found)"
  Write-Output "[SKIP] CCCOMBAT: real DQK MONCHA short-tail/canon-AC encounter trace (archive not found)"
  Write-Output "[SKIP] CCCOMBAT: real DQK MONCHA NPC-framed encounter trace (archive not found)"
}
Write-Output "RESULT: CCCOMBAT deterministic trace smoke PASS"
