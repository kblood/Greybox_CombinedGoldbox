# ccecl-effects-test.ps1 -- headless smoke test for CCECL /E effect output.
#
# Builds CCECL.COM, runs a tiny synthetic Gen1 ECL block under DOSBox, and
# verifies the emitted GBEF record. The block writes the two LOAD_PIECES area
# flags, then runs LOAD_FILES + LOAD_PIECES + EXIT. Additional synthetic blocks
# exercise LOAD_MONSTER/CLEAR_MONSTERS/ADD_NPC/COMBAT payloads and structured
# GBSX capture for visual/text events plus host-facing opcodes whose state
# mutation is not implemented in the DOS VM yet.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "ccecl-effects-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccecl

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "ccecl.com") (Join-Path $run "CCECL.COM") -Force

$bytes = New-Object System.Collections.Generic.List[byte]
1..22 | ForEach-Object { $bytes.Add(0) }

# SAVE 1 -> 0x4BE7, SAVE 1 -> 0x4BE8,
# LOAD_FILES 34,2,255, LOAD_PIECES 3,4,23, EXIT.
[byte[]]$body = @(
  0x09,0x00,0x01,0x01,0xE7,0x4B,
  0x09,0x00,0x01,0x01,0xE8,0x4B,
  0x21,0x00,0x22,0x00,0x02,0x00,0xFF,
  0x37,0x00,0x03,0x00,0x04,0x00,0x17,
  0x00
)
$bytes.AddRange($body)
$rawBlock = $bytes.ToArray()
[IO.File]::WriteAllBytes((Join-Path $run "SYN.BIN"), $rawBlock)

$comp = New-Object System.Collections.Generic.List[byte]
$comp.Add([byte]($rawBlock.Length - 1))
$comp.AddRange($rawBlock)
$dax = New-Object System.Collections.Generic.List[byte]
$dax.AddRange([BitConverter]::GetBytes([UInt16]9))
$dax.Add(34)
$dax.AddRange([byte[]]@(0,0,0,0))
$dax.AddRange([BitConverter]::GetBytes([UInt16]$rawBlock.Length))
$dax.AddRange([BitConverter]::GetBytes([UInt16]$comp.Count))
$dax.AddRange($comp.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "SYN.DAX"), $dax.ToArray())

function New-EclProgram {
  $p = New-Object System.Collections.Generic.List[byte]
  1..22 | ForEach-Object { [void]$p.Add(0) }
  return ,$p
}

function New-Gen2EclProgram {
  $p = New-Object System.Collections.Generic.List[byte]
  1..20 | ForEach-Object { [void]$p.Add(0) }
  return ,$p
}

function Add-Byte([System.Collections.Generic.List[byte]]$List, [int]$Value) {
  [void]$List.Add([byte]($Value -band 0xFF))
}

function Add-U16([System.Collections.Generic.List[byte]]$List, [int]$Value) {
  Add-Byte $List ($Value -band 0xFF)
  Add-Byte $List (($Value -shr 8) -band 0xFF)
}

function Add-U16Array([System.Collections.Generic.List[byte]]$List, [int[]]$Values, [int]$Capacity) {
  for ($i = 0; $i -lt $Capacity; $i++) {
    if ($i -lt $Values.Count) {
      Add-U16 $List $Values[$i]
    } else {
      Add-U16 $List 0
    }
  }
}

function Add-U16Pairs([System.Collections.Generic.List[byte]]$List, [int[]]$Values, [int]$Capacity) {
  for ($i = 0; $i -lt $Capacity; $i++) {
    $idx = $i * 2
    if (($idx + 1) -lt $Values.Count) {
      Add-U16 $List $Values[$idx]
      Add-U16 $List $Values[$idx + 1]
    } else {
      Add-U16 $List 0
      Add-U16 $List 0
    }
  }
}

function Write-PartySeedSidecar([string]$Path) {
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPS")) { Add-Byte $b $ch }
  Add-U16 $b 1
  Add-U16 $b 0x0003
  Add-U16 $b 2
  Add-U16 $b 1
  Add-U16 $b 0
  Add-Byte $b 2
  Add-Byte $b 1
  Add-Byte $b 1
  Add-Byte $b 3
  Add-Byte $b 3
  Add-Byte $b 2
  Add-Byte $b 1
  Add-Byte $b 0
  Add-U16Array $b @(30, 31) 8
  Add-U16Array $b @(7) 8
  Add-U16Pairs $b @(2, 12) 4
  Add-U16Array $b @(4, 10, 6) 8
  Add-U16Array $b @(20, 50, 56) 8
  Add-U16Array $b @(8, 22) 16
  Add-U16Pairs $b @(99, 2) 4
  if ($b.Count -ne 150) {
    throw "GBPS synthetic sidecar length mismatch: $($b.Count)"
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Write-PartySeedSidecarV2([string]$Path) {
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPS")) { Add-Byte $b $ch }
  Add-U16 $b 2
  Add-U16 $b 0x0001
  Add-U16 $b 3
  Add-U16 $b 0
  Add-U16 $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-Byte $b 0
  Add-U16Array $b @() 8
  Add-U16Array $b @() 8
  Add-U16Pairs $b @() 4
  Add-U16Array $b @() 8
  Add-U16Array $b @() 8
  Add-U16Array $b @() 16
  Add-U16Pairs $b @() 4
  Add-Byte $b 3
  Add-Byte $b 0
  [int[]]$rows = @(
    10, 70, 0, 0, 0, 0, 0, 0,
    30, 50, 0, 0, 0, 0, 0, 0,
    90, 20, 0, 0, 0, 0, 0, 0
  )
  for ($i = 0; $i -lt 64; $i++) {
    Add-Byte $b $(if ($i -lt $rows.Count) { $rows[$i] } else { 0 })
  }
  if ($b.Count -ne 216) {
    throw "GBPS v2 synthetic sidecar length mismatch: $($b.Count)"
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Write-CokGbpr([string]$Path) {
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPR")) { Add-Byte $b $ch }
  Add-U16 $b 2
  Add-U16 $b 3
  Add-U16 $b 410
  Add-U16 $b 0
  Add-U16 $b 1
  Add-U16 $b 1
  $rows = @(
    @(10, 70, 0, 0, 0, 0, 0, 0),
    @(30, 50, 0, 0, 0, 0, 0, 0),
    @(90, 20, 0, 0, 0, 0, 0, 0)
  )
  for ($slot = 1; $slot -le 3; $slot++) {
    Add-Byte $b $slot
    $body = New-Object byte[] 409
    $body[0] = [byte]$slot
    # Offset 219, not 139 -- see PS_COK_THIEF_OFF in native/src/ccecl.asm and the
    # provenance beside COK_CCH_THIEF_OFF in native/src/gbboot.asm. This fixture
    # used 139 because the reader used 139; it was a golden for its own code. The
    # GBPR body here is 409 bytes (GBPR_ENTRY_SIZE 410 = 1 + 409), which is CoK's
    # record length, so 219+8 is in range.
    for ($i = 0; $i -lt 8; $i++) {
      $body[219 + $i] = [byte]$rows[$slot - 1][$i]
    }
    foreach ($byte in $body) { Add-Byte $b $byte }
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Write-CokAwardGbpr([string]$Path) {
  # Two positive CCH+F9 members make CoK GAME.OVR:4048 divide the award by
  # two. The third is present but inactive and ineligible: it is the null
  # proving roster count is neither the divisor nor the write predicate.
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPR")) { Add-Byte $b $ch }
  Add-U16 $b 1
  Add-U16 $b 3
  Add-U16 $b 410
  Add-U16 $b 0
  Add-U16 $b 0
  Add-U16 $b 0
  [UInt32[]]$xp = @(65520, 131070, 30)
  [int[]]$active = @(2, 2, 0)
  [int[]]$eligible = @(1, 1, 0)
  for ($slot = 1; $slot -le 3; $slot++) {
    Add-Byte $b $slot
    $body = New-Object byte[] 409
    $body[0] = [byte]$slot
    $body[0xF9] = [byte]$active[$slot - 1]
    $body[0x189] = [byte]$eligible[$slot - 1]
    [BitConverter]::GetBytes($xp[$slot - 1]).CopyTo($body, 0x116)
    foreach ($byte in $body) { Add-Byte $b $byte }
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Get-GbprXp([string]$Path, [int]$Member) {
  $b = [IO.File]::ReadAllBytes($Path)
  $offset = 16 + (($Member - 1) * 410) + 1 + 0x116
  return [BitConverter]::ToUInt32($b, $offset)
}

function Write-DokAwardGbpr([string]$Path, [bool]$Cache = $true) {
  # DoK divides separately for each record's positive +45h..+4Ch class slots.
  # Member 1 crosses its cached threshold; member 2 proves selected mode and
  # u32 carry; member 3 has no slots and must remain untouched.
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPR")) { Add-Byte $b $ch }
  Add-U16 $b 2
  Add-U16 $b 3
  Add-U16 $b 410
  Add-U16 $b 1
  Add-U16 $b 2
  Add-U16 $b 1
  [UInt32[]]$xp = @(90, 65530, 42)
  [int[]]$slotCounts = @(2, 1, 0)
  [UInt32[]]$thresholds = @(100, 65556, 0)
  for ($slot = 1; $slot -le 3; $slot++) {
    Add-Byte $b $slot
    $body = New-Object byte[] 409
    $body[0] = 1
    $body[1] = [byte](64 + $slot)
    for ($i = 0; $i -lt $slotCounts[$slot - 1]; $i++) { $body[0x45 + $i] = 1 }
    [BitConverter]::GetBytes($xp[$slot - 1]).CopyTo($body, 0x62)
    $body[0xC6] = 0x7F
    $body[216] = [byte][char]'G'; $body[217] = [byte][char]'B'
    $body[218] = [byte][char]'D'; $body[219] = [byte][char]'1'
    $body[220] = if ($Cache) { 5 } else { 1 }
    [BitConverter]::GetBytes($thresholds[$slot - 1]).CopyTo($body, 244)
    foreach ($byte in $body) { Add-Byte $b $byte }
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Get-DokGbprXp([string]$Path, [int]$Member) {
  $b = [IO.File]::ReadAllBytes($Path)
  return [BitConverter]::ToUInt32($b, 16 + (($Member - 1) * 410) + 1 + 0x62)
}

function Get-DokGbprReady([string]$Path, [int]$Member) {
  $b = [IO.File]::ReadAllBytes($Path)
  return $b[16 + (($Member - 1) * 410) + 1 + 0xC6]
}

function Write-DokGbpr([string]$Path) {
  $b = [System.Collections.Generic.List[byte]]::new()
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GBPR")) { Add-Byte $b $ch }
  Add-U16 $b 1
  Add-U16 $b 3
  Add-U16 $b 410
  Add-U16 $b 1
  Add-U16 $b 0
  Add-U16 $b 0
  [int[]]$moves = @(4, 10, 6)
  for ($slot = 1; $slot -le 3; $slot++) {
    Add-Byte $b $slot
    $body = New-Object byte[] 409
    $body[0] = [byte]$slot
    $body[216] = [byte][char]'G'
    $body[217] = [byte][char]'B'
    $body[218] = [byte][char]'D'
    $body[219] = [byte][char]'1'
    $body[220] = 1
    $move = $moves[$slot - 1]
    $body[238] = [byte]($move -band 0xFF)
    $body[239] = [byte](($move -shr 8) -band 0xFF)
    foreach ($byte in $body) { Add-Byte $b $byte }
  }
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Add-Imm([System.Collections.Generic.List[byte]]$List, [int]$Value) {
  Add-Byte $List 0x00
  Add-Byte $List $Value
}

function Add-Ref([System.Collections.Generic.List[byte]]$List, [int]$Addr) {
  Add-Byte $List 0x01
  Add-Byte $List ($Addr -band 0xFF)
  Add-Byte $List (($Addr -shr 8) -band 0xFF)
}

function Add-WideRef([System.Collections.Generic.List[byte]]$List, [int]$Addr) {
  Add-Byte $List 0x03
  Add-Byte $List ($Addr -band 0xFF)
  Add-Byte $List (($Addr -shr 8) -band 0xFF)
}

function Add-Str([System.Collections.Generic.List[byte]]$List, [string]$Text) {
  $raw = [Text.Encoding]::ASCII.GetBytes($Text)
  Add-Byte $List 0x80
  Add-Byte $List $raw.Length
  foreach ($b in $raw) {
    Add-Byte $List $b
  }
}

function ConvertTo-EclPackedString([string]$Text) {
  $vals = New-Object System.Collections.Generic.List[int]
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

  $out = New-Object System.Collections.Generic.List[byte]
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

function Add-PackedStr([System.Collections.Generic.List[byte]]$List, [string]$Text) {
  [byte[]]$raw = ConvertTo-EclPackedString $Text
  Add-Byte $List 0x80
  Add-Byte $List $raw.Length
  foreach ($b in $raw) {
    Add-Byte $List $b
  }
}

function Add-TargetPlaceholder([System.Collections.Generic.List[byte]]$List) {
  $offset = $List.Count
  Add-Ref $List 0
  return $offset
}

function Set-Target([System.Collections.Generic.List[byte]]$List, [int]$Offset, [int]$Vaddr) {
  $List[$Offset] = [byte]0x01
  $List[$Offset + 1] = [byte]($Vaddr -band 0xFF)
  $List[$Offset + 2] = [byte](($Vaddr -shr 8) -band 0xFF)
}

function Current-Vaddr([System.Collections.Generic.List[byte]]$List) {
  return 0x7FFE + $List.Count
}

function Compress-DaxLiteral([byte[]]$Raw) {
  $comp = New-Object System.Collections.Generic.List[byte]
  $offset = 0
  while ($offset -lt $Raw.Length) {
    $count = [Math]::Min(128, $Raw.Length - $offset)
    $comp.Add([byte]($count - 1))
    for ($i = 0; $i -lt $count; $i++) {
      $comp.Add($Raw[$offset + $i])
    }
    $offset += $count
  }
  return $comp.ToArray()
}

function New-DaxArchive([object[]]$Blocks) {
  $tocBytes = [UInt16]($Blocks.Count * 9)
  $payload = New-Object System.Collections.Generic.List[byte]
  $toc = New-Object System.Collections.Generic.List[byte]
  $offset = [UInt32]0

  foreach ($block in $Blocks) {
    [byte[]]$raw = $block.Bytes
    [byte[]]$comp = Compress-DaxLiteral $raw
    $toc.Add([byte]$block.Id)
    $toc.AddRange([BitConverter]::GetBytes([UInt32]$offset))
    $toc.AddRange([BitConverter]::GetBytes([UInt16]$raw.Length))
    $toc.AddRange([BitConverter]::GetBytes([UInt16]$comp.Length))
    $payload.AddRange($comp)
    $offset += [UInt32]$comp.Length
  }

  $dax = New-Object System.Collections.Generic.List[byte]
  $dax.AddRange([BitConverter]::GetBytes($tocBytes))
  $dax.AddRange($toc.ToArray())
  $dax.AddRange($payload.ToArray())
  return $dax.ToArray()
}

function New-HlibDataLibrary([byte[][]]$Members) {
  $pointerCount = $Members.Count + 1
  $header = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes("HLIB").CopyTo($header, 0)
  [BitConverter]::GetBytes([UInt16]($pointerCount - 1)).CopyTo($header, 8)
  [Text.Encoding]::ASCII.GetBytes("DATA").CopyTo($header, 12)

  $offset = [UInt32](16 + ($pointerCount * 4))
  $ptrs = New-Object System.Collections.Generic.List[byte]
  $payload = New-Object System.Collections.Generic.List[byte]
  foreach ($member in $Members) {
    $ptrs.AddRange([BitConverter]::GetBytes($offset))
    $payload.AddRange($member)
    $offset += [UInt32]$member.Length
  }
  $ptrs.AddRange([BitConverter]::GetBytes($offset))

  $lib = New-Object System.Collections.Generic.List[byte]
  $lib.AddRange($header)
  $lib.AddRange($ptrs.ToArray())
  $lib.AddRange($payload.ToArray())
  return $lib.ToArray()
}

function Add-BE16([System.Collections.Generic.List[byte]]$List, [int]$Value) {
  Add-Byte $List (($Value -shr 8) -band 0xFF)
  Add-Byte $List ($Value -band 0xFF)
}

function Add-BE32([System.Collections.Generic.List[byte]]$List, [int]$Value) {
  Add-Byte $List (($Value -shr 24) -band 0xFF)
  Add-Byte $List (($Value -shr 16) -band 0xFF)
  Add-Byte $List (($Value -shr 8) -band 0xFF)
  Add-Byte $List ($Value -band 0xFF)
}

function New-GlibDataLibrary([byte[][]]$Members) {
  $pointerCount = $Members.Count + 1
  $lib = New-Object System.Collections.Generic.List[byte]
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("GLIB")) { Add-Byte $lib $ch }
  Add-BE32 $lib 0
  Add-BE16 $lib ($pointerCount - 1)
  Add-BE16 $lib 1
  foreach ($ch in [Text.Encoding]::ASCII.GetBytes("DATA")) { Add-Byte $lib $ch }

  $offset = [UInt32](16 + ($pointerCount * 4))
  foreach ($member in $Members) {
    Add-BE32 $lib $offset
    $offset += [UInt32]$member.Length
  }
  Add-BE32 $lib $offset

  foreach ($member in $Members) {
    foreach ($byte in $member) { Add-Byte $lib $byte }
  }

  $bytes = $lib.ToArray()
  $bytes[4] = [byte](($bytes.Length -shr 24) -band 0xFF)
  $bytes[5] = [byte](($bytes.Length -shr 16) -band 0xFF)
  $bytes[6] = [byte](($bytes.Length -shr 8) -band 0xFF)
  $bytes[7] = [byte]($bytes.Length -band 0xFF)
  return $bytes
}

$arith = New-EclProgram
# SAVE 10->[0100], SAVE 3->[0101]
Add-Byte $arith 0x09; Add-Imm $arith 10; Add-Ref $arith 0x0100
Add-Byte $arith 0x09; Add-Imm $arith 3; Add-Ref $arith 0x0101
# DIVIDE [0100],[0101]->[0102], MULTIPLY [0101],[0102]->[0103]
Add-Byte $arith 0x06; Add-Ref $arith 0x0100; Add-Ref $arith 0x0101; Add-Ref $arith 0x0102
Add-Byte $arith 0x07; Add-Ref $arith 0x0101; Add-Ref $arith 0x0102; Add-Ref $arith 0x0103
# AND sets compare flags vs zero, so IF_EQ executes the guarded SAVE.
Add-Byte $arith 0x2F; Add-Imm $arith 0xF0; Add-Imm $arith 0x0F; Add-Ref $arith 0x0104
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 1; Add-Ref $arith 0x0106
# OR sets compare flags vs zero, so IF_GT executes the guarded SAVE.
Add-Byte $arith 0x30; Add-Imm $arith 0xF0; Add-Imm $arith 0x0F; Add-Ref $arith 0x0105
Add-Byte $arith 0x19
Add-Byte $arith 0x09; Add-Imm $arith 2; Add-Ref $arith 0x0107
# RANDOM uses the TS seed 0x1234; first value modulo 10 is 1.
Add-Byte $arith 0x08; Add-Imm $arith 10; Add-Ref $arith 0x0108
# PARTYSTRENGTH uses the conservative host default 0; 0 >= 0 passes.
Add-Byte $arith 0x1D; Add-Imm $arith 0
Add-Byte $arith 0x1B
Add-Byte $arith 0x09; Add-Imm $arith 3; Add-Ref $arith 0x0109
# PARTY_SURPRISE has no loaded DOS roster yet, so it writes the conservative
# no-ranger defaults: first output 0, second output 0.
Add-Byte $arith 0x22; Add-Ref $arith 0x0110; Add-Ref $arith 0x0111
# GETTABLE copies memory[base + byte(offset)] into dest; SAVE_TABLE writes a
# value to memory[base + offset].
Add-Byte $arith 0x09; Add-Imm $arith 0x66; Add-Ref $arith 0x0123
Add-Byte $arith 0x2A; Add-Ref $arith 0x0120; Add-Imm $arith 3; Add-Ref $arith 0x0112
Add-Byte $arith 0x35; Add-Imm $arith 0x77; Add-Ref $arith 0x0130; Add-Imm $arith 4
# SURPRISE writes its result to 0x02CB. These operands force the party-side
# d6 check to pass and the monster-side check to fail, so the result is 1.
Add-Byte $arith 0x23; Add-Imm $arith 0; Add-Imm $arith 0; Add-Imm $arith 2; Add-Imm $arith 4
# FIND_ITEM/FIND_SPECIAL have no loaded DOS party model yet, so they set the
# conservative not-found result: IF_NE passes and ordering flags stay clear.
Add-Byte $arith 0x03; Add-Imm $arith 0; Add-Imm $arith 0
Add-Byte $arith 0x40; Add-Imm $arith 31
Add-Byte $arith 0x32; Add-Imm $arith 31
Add-Byte $arith 0x1A
Add-Byte $arith 0x09; Add-Imm $arith 0x44; Add-Ref $arith 0x0115
Add-Byte $arith 0x17
Add-Byte $arith 0x09; Add-Imm $arith 0x88; Add-Ref $arith 0x0113
# LOAD_CHARACTER is a native headless no-op until a real party roster is
# available; the following FIND_SPECIAL must still use the not-found default.
Add-Byte $arith 0x0A; Add-Imm $arith 1
Add-Byte $arith 0x3F; Add-Imm $arith 12
Add-Byte $arith 0x17
Add-Byte $arith 0x09; Add-Imm $arith 0x99; Add-Ref $arith 0x0114
# SPELL has no loaded native party spell-list model yet, so it writes the
# empty-roster miss result (slot 0xFF, party index 0xFF).
Add-Byte $arith 0x3B; Add-Imm $arith 22; Add-Ref $arith 0x0116; Add-Ref $arith 0x0117
Add-Byte $arith 0x03; Add-Ref $arith 0x0116; Add-Imm $arith 0xFF
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5A; Add-Ref $arith 0x0118
Add-Byte $arith 0x03; Add-Ref $arith 0x0117; Add-Imm $arith 0xFF
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5B; Add-Ref $arith 0x0119
# CHECKPARTY writes four result cells. With no native party model loaded, the
# deterministic empty-roster result is all zero.
Add-Byte $arith 0x1E; Add-Ref $arith 0x9F40; Add-Imm $arith 12
Add-Ref $arith 0x011A; Add-Ref $arith 0x011B; Add-Ref $arith 0x011C; Add-Ref $arith 0x011D
Add-Byte $arith 0x03; Add-Ref $arith 0x011A; Add-Imm $arith 0
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5C; Add-Ref $arith 0x011E
Add-Byte $arith 0x03; Add-Ref $arith 0x011B; Add-Imm $arith 0
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5D; Add-Ref $arith 0x011F
Add-Byte $arith 0x03; Add-Ref $arith 0x011C; Add-Imm $arith 0
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5E; Add-Ref $arith 0x0120
Add-Byte $arith 0x03; Add-Ref $arith 0x011D; Add-Imm $arith 0
Add-Byte $arith 0x16
Add-Byte $arith 0x09; Add-Imm $arith 0x5F; Add-Ref $arith 0x0121
# SETUP_MONSTER records approach-art state in the GBEF setup tail; APPROACH keeps the
# current deterministic headless distance at zero until a host seed exists.
Add-Byte $arith 0x0C; Add-Imm $arith 9; Add-Imm $arith 3; Add-Imm $arith 5
Add-Byte $arith 0x0D
# PROGRAM is preserved as a host dispatch event; PROTECTION remains a native
# headless flow-preserving no-op.
Add-Byte $arith 0x38; Add-Imm $arith 61
Add-Byte $arith 0x3C; Add-Imm $arith 35
Add-Byte $arith 0x3E
Add-Byte $arith 0x09; Add-Imm $arith 0x6A; Add-Ref $arith 0x0125
# ON_GOSUB selector 1 branches to the second target, runs the subroutine, then returns.
Add-Byte $arith 0x26; Add-Imm $arith 1; Add-Imm $arith 2
$target0 = Add-TargetPlaceholder $arith
$target1 = Add-TargetPlaceholder $arith
Add-Byte $arith 0x09; Add-Imm $arith 0x55; Add-Ref $arith 0x010B
Add-Byte $arith 0x00
$subVaddr = Current-Vaddr $arith
Add-Byte $arith 0x09; Add-Imm $arith 0x4D; Add-Ref $arith 0x010A
Add-Byte $arith 0x13
Set-Target $arith $target0 $subVaddr
Set-Target $arith $target1 $subVaddr
[IO.File]::WriteAllBytes((Join-Path $run "ARITH.BIN"), $arith.ToArray())

$strength = New-EclProgram
# Default metric 0 fails this gate; /Z 77 makes the same gate pass.
Add-Byte $strength 0x1D; Add-Imm $strength 50
Add-Byte $strength 0x1B
Add-Byte $strength 0x09; Add-Imm $strength 0xC0; Add-Ref $strength 0x0140
Add-Byte $strength 0x00
[IO.File]::WriteAllBytes((Join-Path $run "STRENGTH.BIN"), $strength.ToArray())

$partySurprise = New-EclProgram
Add-Byte $partySurprise 0x22; Add-Ref $partySurprise 0x0110; Add-Ref $partySurprise 0x0111
Add-Byte $partySurprise 0x00
[IO.File]::WriteAllBytes((Join-Path $run "PARTY.BIN"), $partySurprise.ToArray())

$partyCtx = New-EclProgram
# /H makes PARTY_SURPRISE's first destination 1; branch proves it despite trace
# only recording the second write from the opcode itself.
Add-Byte $partyCtx 0x22; Add-Ref $partyCtx 0x0200; Add-Ref $partyCtx 0x0201
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0200; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA0; Add-Ref $partyCtx 0x0202
# Repeatable /I item seeds make both FIND_ITEM checks pass, then
# DESTROY_ITEMS clears only the matching seeded item type.
Add-Byte $partyCtx 0x32; Add-Imm $partyCtx 31
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA1; Add-Ref $partyCtx 0x0203
Add-Byte $partyCtx 0x40; Add-Imm $partyCtx 31
Add-Byte $partyCtx 0x32; Add-Imm $partyCtx 31
Add-Byte $partyCtx 0x17
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA2; Add-Ref $partyCtx 0x0204
Add-Byte $partyCtx 0x32; Add-Imm $partyCtx 30
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB2; Add-Ref $partyCtx 0x022E
# /N 2 lets LOAD_CHARACTER select one-based party members #1 and #2.
# /U supplies member-scoped affects for FIND_SPECIAL; /A remains party-wide.
Add-Byte $partyCtx 0x0A; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x3F; Add-Imm $partyCtx 12
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA3; Add-Ref $partyCtx 0x0205
Add-Byte $partyCtx 0x0A; Add-Imm $partyCtx 2
Add-Byte $partyCtx 0x3F; Add-Imm $partyCtx 12
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB3; Add-Ref $partyCtx 0x022F
# Party-wide /A values still drive selected fallback and CHECKPARTY.
Add-Byte $partyCtx 0x3F; Add-Imm $partyCtx 7
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAE; Add-Ref $partyCtx 0x0224
# Repeatable /S spell seeds preserve legacy member-0 order: spell 22 appears
# at member 0 slot 2 when spell 8 was seeded first. Repeatable /V supplies a
# member-scoped spell list; spell 99 appears at one-based member 2 slot 1.
Add-Byte $partyCtx 0x3B; Add-Imm $partyCtx 22; Add-Ref $partyCtx 0x0206; Add-Ref $partyCtx 0x0207
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0206; Add-Imm $partyCtx 2
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA4; Add-Ref $partyCtx 0x0208
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0207; Add-Imm $partyCtx 0
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA5; Add-Ref $partyCtx 0x0209
Add-Byte $partyCtx 0x3B; Add-Imm $partyCtx 8; Add-Ref $partyCtx 0x022A; Add-Ref $partyCtx 0x022B
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x022A; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB0; Add-Ref $partyCtx 0x022C
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x022B; Add-Imm $partyCtx 0
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB1; Add-Ref $partyCtx 0x022D
# A member-scoped /V spell returns a one-based slot plus a zero-based party
# member index.
Add-Byte $partyCtx 0x3B; Add-Imm $partyCtx 99; Add-Ref $partyCtx 0x0230; Add-Ref $partyCtx 0x0231
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0230; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB4; Add-Ref $partyCtx 0x0232
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0231; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB5; Add-Ref $partyCtx 0x0233
# An absent spell mirrors the VM's miss semantics: slot 0xFF, and the last
# scanned player index from /N 2 is 1.
Add-Byte $partyCtx 0x3B; Add-Imm $partyCtx 100; Add-Ref $partyCtx 0x0234; Add-Ref $partyCtx 0x0235
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0234; Add-Imm $partyCtx 0xFF
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB6; Add-Ref $partyCtx 0x0236
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0235; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xB7; Add-Ref $partyCtx 0x0237
# CHECKPARTY affect query: decoded query id 8001, /U 2 12 is member-scoped
# only, so party-wide locD remains 0.
Add-Byte $partyCtx 0x1E; Add-Ref $partyCtx 0x9F40; Add-Imm $partyCtx 12
Add-Ref $partyCtx 0x020A; Add-Ref $partyCtx 0x020B; Add-Ref $partyCtx 0x020C; Add-Ref $partyCtx 0x020D
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x020D; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA6; Add-Ref $partyCtx 0x020E
# CHECKPARTY affect query also scans the repeatable /A list.
Add-Byte $partyCtx 0x1E; Add-Ref $partyCtx 0x9F40; Add-Imm $partyCtx 7
Add-Ref $partyCtx 0x0225; Add-Ref $partyCtx 0x0226; Add-Ref $partyCtx 0x0227; Add-Ref $partyCtx 0x0228
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0228; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAF; Add-Ref $partyCtx 0x0229
# CHECKPARTY movement query: decoded query id 0x009F, repeated /M
# seeds -> min=4, max=10, avg=6.
Add-Byte $partyCtx 0x1E; Add-Ref $partyCtx 0x809E; Add-Imm $partyCtx 0
Add-Ref $partyCtx 0x020F; Add-Ref $partyCtx 0x0210; Add-Ref $partyCtx 0x0211; Add-Ref $partyCtx 0x0212
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x020F; Add-Imm $partyCtx 4
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA7; Add-Ref $partyCtx 0x0213
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0210; Add-Imm $partyCtx 10
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA8; Add-Ref $partyCtx 0x0214
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0211; Add-Imm $partyCtx 6
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xA9; Add-Ref $partyCtx 0x0215
# CHECKPARTY thief-skill query: decoded query id 0x00A5, repeated /K
# seeds -> min=20, max=56, avg=42.
Add-Byte $partyCtx 0x1E; Add-Ref $partyCtx 0x80A4; Add-Imm $partyCtx 0
Add-Ref $partyCtx 0x0218; Add-Ref $partyCtx 0x0219; Add-Ref $partyCtx 0x021A; Add-Ref $partyCtx 0x021B
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0218; Add-Imm $partyCtx 20
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAB; Add-Ref $partyCtx 0x021C
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0219; Add-Imm $partyCtx 56
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAC; Add-Ref $partyCtx 0x021D
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x021A; Add-Imm $partyCtx 42
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAD; Add-Ref $partyCtx 0x021E
# ENCOUNTER_MENU action value 2 only turns into monster-flee when the threshold
# exceeds party max movement. The repeated /M max 10 keeps threshold 5 on the
# COMBAT result path.
Add-Byte $partyCtx 0x29
Add-Imm $partyCtx 9
Add-Imm $partyCtx 3
Add-Imm $partyCtx 5
Add-Ref $partyCtx 0x0216
Add-Imm $partyCtx 2
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 0
Add-Imm $partyCtx 5
Add-Byte $partyCtx 0x03; Add-Ref $partyCtx 0x0216; Add-Imm $partyCtx 1
Add-Byte $partyCtx 0x16
Add-Byte $partyCtx 0x09; Add-Imm $partyCtx 0xAA; Add-Ref $partyCtx 0x0217
Add-Byte $partyCtx 0x00
[IO.File]::WriteAllBytes((Join-Path $run "PARTYCTX.BIN"), $partyCtx.ToArray())
Write-PartySeedSidecar (Join-Path $run "PARTYCTX.GBP")

$partyThiefMatrix = New-EclProgram
# GBPS v2 per-member thief matrix: skill 0 rows 10/30/90 -> min 10, max 90, avg 43.
Add-Byte $partyThiefMatrix 0x1E; Add-Ref $partyThiefMatrix 0x80A4; Add-Imm $partyThiefMatrix 0
Add-Ref $partyThiefMatrix 0x0300; Add-Ref $partyThiefMatrix 0x0301; Add-Ref $partyThiefMatrix 0x0302; Add-Ref $partyThiefMatrix 0x0303
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0300; Add-Imm $partyThiefMatrix 10
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC1; Add-Ref $partyThiefMatrix 0x0310
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0301; Add-Imm $partyThiefMatrix 90
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC2; Add-Ref $partyThiefMatrix 0x0311
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0302; Add-Imm $partyThiefMatrix 43
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC3; Add-Ref $partyThiefMatrix 0x0312
# Skill 1 rows 70/50/20 -> min 20, max 70, avg 46.
Add-Byte $partyThiefMatrix 0x1E; Add-Ref $partyThiefMatrix 0x80A5; Add-Imm $partyThiefMatrix 0
Add-Ref $partyThiefMatrix 0x0320; Add-Ref $partyThiefMatrix 0x0321; Add-Ref $partyThiefMatrix 0x0322; Add-Ref $partyThiefMatrix 0x0323
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0320; Add-Imm $partyThiefMatrix 20
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC4; Add-Ref $partyThiefMatrix 0x0330
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0321; Add-Imm $partyThiefMatrix 70
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC5; Add-Ref $partyThiefMatrix 0x0331
Add-Byte $partyThiefMatrix 0x03; Add-Ref $partyThiefMatrix 0x0322; Add-Imm $partyThiefMatrix 46
Add-Byte $partyThiefMatrix 0x16
Add-Byte $partyThiefMatrix 0x09; Add-Imm $partyThiefMatrix 0xC6; Add-Ref $partyThiefMatrix 0x0332
Add-Byte $partyThiefMatrix 0x00
[IO.File]::WriteAllBytes((Join-Path $run "THIEFMAT.BIN"), $partyThiefMatrix.ToArray())
Write-PartySeedSidecarV2 (Join-Path $run "THIEFMAT.GBP")
Write-CokGbpr (Join-Path $run "COK.GBP")
Write-DokGbpr (Join-Path $run "DOK.GBP")
Write-DokAwardGbpr (Join-Path $run "DOKAWARD.GBP")
Write-DokAwardGbpr (Join-Path $run "DOKNOCACHE.GBP") $false

$setup = New-EclProgram
Add-Byte $setup 0x0C; Add-Imm $setup 9; Add-Imm $setup 3; Add-Imm $setup 5
Add-Byte $setup 0x0D
Add-Byte $setup 0x00
[IO.File]::WriteAllBytes((Join-Path $run "SETUP.BIN"), $setup.ToArray())

$input = New-EclProgram
# INPUT_NUMBER takes its answer destination in operand 2; operand 1 is
# unused/prompt metadata. INPUT_STRING remains maxLength,destination.
Add-Byte $input 0x0F; Add-Imm $input 10; Add-Ref $input 0x0100
Add-Byte $input 0x10; Add-Imm $input 6; Add-Ref $input 0x0101
# Menus choose 0 by default, can be seeded with /C, and must skip inline
# string operands before the next SAVE.
Add-Byte $input 0x15; Add-Ref $input 0x0102; Add-Str $input "Pick"; Add-Imm $input 2; Add-Str $input "A"; Add-Str $input "B"
Add-Byte $input 0x09; Add-Imm $input 7; Add-Ref $input 0x0103
Add-Byte $input 0x2B; Add-Ref $input 0x0104; Add-Imm $input 2; Add-Str $input "L"; Add-Str $input "R"
Add-Byte $input 0x09; Add-Imm $input 8; Add-Ref $input 0x0105
Add-Byte $input 0x39; Add-Ref $input 0x0106
Add-Byte $input 0x09; Add-Imm $input 9; Add-Ref $input 0x0107
# PARLAY also chooses attitude 0 and writes the mapped first value.
Add-Byte $input 0x2C
Add-Imm $input 11
Add-Imm $input 22
Add-Imm $input 33
Add-Imm $input 44
Add-Imm $input 55
Add-Ref $input 0x0108
Add-Byte $input 0x09; Add-Imm $input 10; Add-Ref $input 0x0109
# ENCOUNTER_MENU headless chooses COMBAT and writes the COAB result code 1 by
# default; /O 2 selects the FLEE action slot below and can force monster-flee.
Add-Byte $input 0x29
Add-Imm $input 9
Add-Imm $input 3
Add-Imm $input 5
Add-Ref $input 0x010A
Add-Imm $input 0
Add-Imm $input 0
Add-Imm $input 2
Add-Imm $input 0
Add-Imm $input 0
Add-Imm $input 0
Add-Imm $input 0
Add-Imm $input 0
Add-Imm $input 5
Add-Imm $input 5
Add-Byte $input 0x09; Add-Imm $input 11; Add-Ref $input 0x010B
Add-Byte $input 0x00
[IO.File]::WriteAllBytes((Join-Path $run "INPUT.BIN"), $input.ToArray())

$bridgeLoop = New-EclProgram
Add-Byte $bridgeLoop 0x21; Add-Imm $bridgeLoop 34; Add-Imm $bridgeLoop 2; Add-Imm $bridgeLoop 255
$bridgeLoopStart = Current-Vaddr $bridgeLoop
Add-Byte $bridgeLoop 0x0E; Add-Imm $bridgeLoop 39
Add-Byte $bridgeLoop 0x21; Add-Imm $bridgeLoop 34; Add-Imm $bridgeLoop 2; Add-Imm $bridgeLoop 255
Add-Byte $bridgeLoop 0x01; Add-Ref $bridgeLoop $bridgeLoopStart
[IO.File]::WriteAllBytes((Join-Path $run "BRLOOP.BIN"), $bridgeLoop.ToArray())

$pieceLoop = New-EclProgram
Add-Byte $pieceLoop 0x21; Add-Imm $pieceLoop 34; Add-Imm $pieceLoop 2; Add-Imm $pieceLoop 255
Add-Byte $pieceLoop 0x37; Add-Imm $pieceLoop 3; Add-Imm $pieceLoop 4; Add-Imm $pieceLoop 23
$pieceLoopStart = Current-Vaddr $pieceLoop
Add-Byte $pieceLoop 0x37; Add-Imm $pieceLoop 3; Add-Imm $pieceLoop 4; Add-Imm $pieceLoop 23
Add-Byte $pieceLoop 0x01; Add-Ref $pieceLoop $pieceLoopStart
[IO.File]::WriteAllBytes((Join-Path $run "PCLOOP.BIN"), $pieceLoop.ToArray())

$memfull = New-EclProgram
0..512 | ForEach-Object {
  Add-Byte $memfull 0x09; Add-Imm $memfull ($_ -band 0xFF); Add-Ref $memfull (0x0200 + $_)
}
Add-Byte $memfull 0x00
[IO.File]::WriteAllBytes((Join-Path $run "MEMFULL.BIN"), $memfull.ToArray())

# A ninth LOAD_MONSTER must invalidate the whole pending encounter.  The
# following COMBAT is deliberately unreachable: publishing its first eight
# groups would silently turn this source encounter into an easier battle.
$encfull = New-EclProgram
1..9 | ForEach-Object {
  Add-Byte $encfull 0x0B
  Add-Imm $encfull $_
  Add-Imm $encfull 1
  Add-Imm $encfull 2
}
Add-Byte $encfull 0x24
[IO.File]::WriteAllBytes((Join-Path $run "ENCFULL.BIN"), $encfull.ToArray())

# A 32-slot interpreter call stack is an explicit contract.  The 33rd local or
# ON_GOSUB must halt before its fall-through SAVE can mutate state.
function New-CallStackProgram([int]$Depth, [int]$Opcode, [bool]$Overflow) {
  $p = New-EclProgram
  $calls = [System.Collections.Generic.List[int]]::new()
  $targets = [System.Collections.Generic.List[int]]::new()
  $overflowPc = -1
  $callBytes = if ($Opcode -eq 0x26) { 8 } else { 4 }
  function Add-Call([System.Collections.Generic.List[byte]]$List, [int]$Op) {
    Add-Byte $List $Op
    if ($Op -eq 0x26) {
      Add-Imm $List 0
      Add-Imm $List 1
    }
    return Add-TargetPlaceholder $List
  }
  [void]$calls.Add((Add-Call $p $Opcode))
  Add-Byte $p 0x00
  for ($i = 0; $i -lt ($Depth - 1); $i++) {
    [void]$targets.Add((Current-Vaddr $p))
    [void]$calls.Add((Add-Call $p $Opcode))
    if ($Overflow -and $i -eq ($Depth - 2)) {
      $overflowPc = (Current-Vaddr $p) - 0x7FFE - $callBytes
      Add-Byte $p 0x09; Add-Imm $p 0xEE; Add-Ref $p 0x0201
    }
    Add-Byte $p 0x13
  }
  [void]$targets.Add((Current-Vaddr $p))
  Add-Byte $p 0x09; Add-Imm $p 0x32; Add-Ref $p 0x0200
  Add-Byte $p 0x13
  for ($i = 0; $i -lt $calls.Count; $i++) {
    Set-Target $p $calls[$i] $targets[$i]
  }
  return @{ Bytes = $p.ToArray(); OverflowPc = $overflowPc }
}

$g32 = New-CallStackProgram 32 0x02 $false
$g33 = New-CallStackProgram 33 0x02 $true
$on32 = New-CallStackProgram 32 0x26 $false
$on33 = New-CallStackProgram 33 0x26 $true
[IO.File]::WriteAllBytes((Join-Path $run "GOSUB32.BIN"), $g32.Bytes)
[IO.File]::WriteAllBytes((Join-Path $run "GOSUB33.BIN"), $g33.Bytes)
[IO.File]::WriteAllBytes((Join-Path $run "ON32.BIN"), $on32.Bytes)
[IO.File]::WriteAllBytes((Join-Path $run "ON33.BIN"), $on33.Bytes)

$badop = New-EclProgram
Add-Byte $badop 0x44
[IO.File]::WriteAllBytes((Join-Path $run "BADOP.BIN"), $badop.ToArray())

$bridgeBadop = New-EclProgram
Add-Byte $bridgeBadop 0x21; Add-Imm $bridgeBadop 34; Add-Imm $bridgeBadop 2; Add-Imm $bridgeBadop 255
Add-Byte $bridgeBadop 0x44
[IO.File]::WriteAllBytes((Join-Path $run "BADBRG.BIN"), $bridgeBadop.ToArray())

$buckB50 = New-EclProgram
$buckB50[4] = 0x8B
$buckB50[5] = 0x84
while ($buckB50.Count -lt 0x048D) {
  Add-Byte $buckB50 0x00
}
Add-Byte $buckB50 0x16
Add-Byte $buckB50 0x29
1..8 | ForEach-Object { Add-Imm $buckB50 $_ }
1..6 | ForEach-Object { Add-Ref $buckB50 (0x0100 + $_) }
Add-Byte $buckB50 0xC9
Add-Byte $buckB50 0x7E
Add-Byte $buckB50 0x00
$buckB50Dax = New-DaxArchive @(
  [pscustomobject]@{ Id = 50; Bytes = $buckB50.ToArray() },
  [pscustomobject]@{ Id = 51; Bytes = $buckB50.ToArray() }
)
[IO.File]::WriteAllBytes((Join-Path $run "BUCKB50.DAX"), $buckB50Dax)

$scriptBadop = New-EclProgram
Add-Byte $scriptBadop 0x12
Add-PackedStr $scriptBadop "DONE"
Add-Byte $scriptBadop 0x80
[IO.File]::WriteAllBytes((Join-Path $run "BADSCR.BIN"), $scriptBadop.ToArray())

$combat = New-EclProgram
Add-Byte $combat 0x24
[IO.File]::WriteAllBytes((Join-Path $run "COMBAT.BIN"), $combat.ToArray())

$resume = New-EclProgram
Add-Byte $resume 0x24
Add-Byte $resume 0x16; Add-Byte $resume 0x20; Add-Imm $resume 7
Add-Byte $resume 0x18; Add-Byte $resume 0x20; Add-Imm $resume 8
Add-Byte $resume 0x19; Add-Byte $resume 0x20; Add-Imm $resume 9
Add-Byte $resume 0x00
[IO.File]::WriteAllBytes((Join-Path $run "RESUME.BIN"), $resume.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "ENEMY.OUT"), [Text.Encoding]::ASCII.GetBytes("enemy`r`n"))
[IO.File]::WriteAllBytes((Join-Path $run "BADTOKEN.OUT"), [Text.Encoding]::ASCII.GetBytes("fleeX`r`n"))
[IO.File]::WriteAllBytes((Join-Path $run "TRAILING.OUT"), [Text.Encoding]::ASCII.GetBytes("flee`r`nX"))
[IO.File]::WriteAllBytes((Join-Path $run "OVERSIZE.OUT"), [Text.Encoding]::ASCII.GetBytes("fleeXXXXXXXXXXXXXXXXX"))

$clockResume = New-EclProgram
Add-Byte $clockResume 0x34; Add-Imm $clockResume 9; Add-Imm $clockResume 1
Add-Byte $clockResume 0x24
Add-Byte $clockResume 0x34; Add-Imm $clockResume 5; Add-Imm $clockResume 2
Add-Byte $clockResume 0x00
[IO.File]::WriteAllBytes((Join-Path $run "CLOCKRES.BIN"), $clockResume.ToArray())

$encounter = New-EclProgram
# First monster is intentionally cleared; only the second should survive to COMBAT.
Add-Byte $encounter 0x0B; Add-Imm $encounter 9; Add-Imm $encounter 3; Add-Imm $encounter 5
Add-Byte $encounter 0x1C
Add-Byte $encounter 0x0B; Add-Imm $encounter 19; Add-Imm $encounter 1; Add-Imm $encounter 2
Add-Byte $encounter 0x36; Add-Imm $encounter 48; Add-Imm $encounter 100
Add-Byte $encounter 0x24
[IO.File]::WriteAllBytes((Join-Path $run "ENCBLK.BIN"), $encounter.ToArray())

$scriptEffects = New-EclProgram
Add-Byte $scriptEffects 0x27
1..8 | ForEach-Object { Add-Imm $scriptEffects $_ }
Add-Byte $scriptEffects 0x28
9..11 | ForEach-Object { Add-Imm $scriptEffects $_ }
Add-Byte $scriptEffects 0x0A
Add-Imm $scriptEffects 2
Add-Byte $scriptEffects 0x0A
Add-Imm $scriptEffects 9
Add-Byte $scriptEffects 0x2E
@(0x80,1,2,1,0x80) | ForEach-Object { Add-Imm $scriptEffects $_ }
Add-Byte $scriptEffects 0x3C
Add-Imm $scriptEffects 35
Add-Byte $scriptEffects 0x0E
Add-Imm $scriptEffects 39
Add-Byte $scriptEffects 0x11
Add-PackedStr $scriptEffects "HELLO"
Add-Byte $scriptEffects 0x12
Add-PackedStr $scriptEffects "CLEAR"
Add-Byte $scriptEffects 0x00
[IO.File]::WriteAllBytes((Join-Path $run "SCRIPT.BIN"), $scriptEffects.ToArray())

$scriptEffects2 = New-EclProgram
Add-Byte $scriptEffects2 0x29
63..76 | ForEach-Object { Add-Imm $scriptEffects2 $_ }
Add-Byte $scriptEffects2 0x1F
77..78 | ForEach-Object { Add-Imm $scriptEffects2 $_ }
Add-Byte $scriptEffects2 0x2D
Add-Ref $scriptEffects2 0x2E10 # known CALL: (0x2e10 - 0x7fff) & 0xffff = 0xae11
Add-Byte $scriptEffects2 0x2D
Add-Ref $scriptEffects2 0x2DCB # DoK redraw alias: (0x2dcb - 0x7fff) & 0xffff = 0xadcc
Add-Byte $scriptEffects2 0x2D
Add-Ref $scriptEffects2 0x9000 # unknown CALL: preserve raw ref operand, routine id 0x1001
Add-Byte $scriptEffects2 0x31
Add-Byte $scriptEffects2 0x33
Add-Byte $scriptEffects2 0x34
Add-Imm $scriptEffects2 5
Add-Imm $scriptEffects2 2
Add-Byte $scriptEffects2 0x38
Add-Imm $scriptEffects2 61
Add-Byte $scriptEffects2 0x3A
Add-Byte $scriptEffects2 0x3D
Add-Byte $scriptEffects2 0x3E
Add-Byte $scriptEffects2 0x00
[IO.File]::WriteAllBytes((Join-Path $run "SCRIPT2.BIN"), $scriptEffects2.ToArray())

# A filled fixed-width GBSX tail must stop at the first unrecordable host
# effect. Cover both the generic PRINT path and the distinct DAMAGE recorder.
$capPrint = New-EclProgram
1..64 | ForEach-Object {
  Add-Byte $capPrint 0x0E
  Add-Imm $capPrint 39
}
Add-Byte $capPrint 0x0E
Add-Imm $capPrint 40
[IO.File]::WriteAllBytes((Join-Path $run "CAPPRINT.BIN"), $capPrint.ToArray())

# A replay begins after an effect-capacity halt.  Keep a native LOAD_FILES
# prefix before the 64-record GBSX chunk so the resumed record proves it is not
# discarded while the next chunk begins at record zero.
$capPrefix = New-EclProgram
Add-Byte $capPrefix 0x21; Add-Imm $capPrefix 34; Add-Imm $capPrefix 2; Add-Imm $capPrefix 255
1..64 | ForEach-Object {
  Add-Byte $capPrefix 0x0E
  Add-Imm $capPrefix 39
}
Add-Byte $capPrefix 0x0E
Add-Imm $capPrefix 40
[IO.File]::WriteAllBytes((Join-Path $run "CAPPFX.BIN"), $capPrefix.ToArray())

$capDamage = New-EclProgram
1..64 | ForEach-Object {
  Add-Byte $capDamage 0x0E
  Add-Imm $capDamage 39
}
Add-Byte $capDamage 0x2E
@(0x80,1,2,1,0x80) | ForEach-Object { Add-Imm $capDamage $_ }
[IO.File]::WriteAllBytes((Join-Path $run "CAPDMG.BIN"), $capDamage.ToArray())

# The capacity check must happen before a stateful recorder runs.  AWARD_XP
# mutates GBPR before it enters the generic GBSX recorder, so this control
# catches a mask omission that would otherwise grant XP and lose its 65th event.
$capAward = New-EclProgram
1..64 | ForEach-Object {
  Add-Byte $capAward 0x0E
  Add-Imm $capAward 39
}
Add-Byte $capAward 0x41; Add-Imm $capAward 1; Add-Imm $capAward 101
[IO.File]::WriteAllBytes((Join-Path $run "CAPAWARD.BIN"), $capAward.ToArray())
Write-CokAwardGbpr (Join-Path $run "CAPAWARD.GBP")
$capAwardBefore = [IO.File]::ReadAllBytes((Join-Path $run "CAPAWARD.GBP"))

# CoK opcode 41: party-wide 101 / two positive F9 records = 50 each, then
# LOAD_CHARACTER 2 selects only the second eligible member for 5 / 2 = 2.
# The XP starts immediately below two word carries, so this checks the native
# u32 ADD/ADC equivalent rather than merely a low-word increment.
$awardXp = New-EclProgram
Add-Byte $awardXp 0x41; Add-Imm $awardXp 1; Add-Imm $awardXp 101
Add-Byte $awardXp 0x0A; Add-Imm $awardXp 2
Add-Byte $awardXp 0x41; Add-Imm $awardXp 0; Add-Imm $awardXp 5
Add-Byte $awardXp 0x00
[IO.File]::WriteAllBytes((Join-Path $run "AWARD.BIN"), $awardXp.ToArray())
Write-CokAwardGbpr (Join-Path $run "AWARD.GBP")

$buckExt = New-EclProgram
Add-Byte $buckExt 0x43
Add-Imm $buckExt 7
Add-Byte $buckExt 0x45
Add-Imm $buckExt 8
Add-Imm $buckExt 9
Add-Byte $buckExt 0x46
Add-Imm $buckExt 10
Add-Imm $buckExt 11
Add-Byte $buckExt 0x00
[IO.File]::WriteAllBytes((Join-Path $run "BUCKEXT.BIN"), $buckExt.ToArray())

$buckGuard = New-EclProgram
while ($buckGuard.Count -lt 0x19C8) {
  Add-Byte $buckGuard 0x00
}
Add-Byte $buckGuard 0x43; Add-Imm $buckGuard 12
Add-Byte $buckGuard 0x3A
Add-Byte $buckGuard 0x43; Add-Imm $buckGuard 12
Add-Byte $buckGuard 0x3A
Add-Byte $buckGuard 0x43; Add-Imm $buckGuard 12
Add-Byte $buckGuard 0x29
while ($buckGuard.Count -lt 0x1A92) {
  Add-Byte $buckGuard 0x00
}
Add-Byte $buckGuard 0x1C
Add-Byte $buckGuard 0x0B; Add-Imm $buckGuard 23; Add-Imm $buckGuard 1; Add-Imm $buckGuard 23
Add-Byte $buckGuard 0x0B; Add-Imm $buckGuard 8; Add-Imm $buckGuard 7; Add-Imm $buckGuard 8
Add-Byte $buckGuard 0x24

$buckGuardNoIsland = New-EclProgram
while ($buckGuardNoIsland.Count -lt 0x19C8) {
  Add-Byte $buckGuardNoIsland 0x00
}
Add-Byte $buckGuardNoIsland 0x43; Add-Imm $buckGuardNoIsland 12
Add-Byte $buckGuardNoIsland 0x3A
Add-Byte $buckGuardNoIsland 0x43; Add-Imm $buckGuardNoIsland 12
Add-Byte $buckGuardNoIsland 0x3A
Add-Byte $buckGuardNoIsland 0x43; Add-Imm $buckGuardNoIsland 12
Add-Byte $buckGuardNoIsland 0x24
$buckGuardDax = New-DaxArchive @(
  [pscustomobject]@{ Id = 98; Bytes = $buckGuard.ToArray() },
  [pscustomobject]@{ Id = 99; Bytes = $buckGuardNoIsland.ToArray() }
)
[IO.File]::WriteAllBytes((Join-Path $run "BUCKG43.DAX"), $buckGuardDax)

$chain34 = New-EclProgram
Add-Byte $chain34 0x09; Add-Imm $chain34 34; Add-Ref $chain34 0x0100
Add-Byte $chain34 0x20; Add-Imm $chain34 35

$chain35 = New-EclProgram
Add-Byte $chain35 0x21; Add-Ref $chain35 0x0100; Add-Imm $chain35 2; Add-Imm $chain35 255
Add-Byte $chain35 0x00

$chainDax = New-DaxArchive @(
  [pscustomobject]@{ Id = 34; Bytes = $chain34.ToArray() },
  [pscustomobject]@{ Id = 35; Bytes = $chain35.ToArray() }
)
[IO.File]::WriteAllBytes((Join-Path $run "CHAIN.DAX"), $chainDax)

$gen2Chain1 = New-Gen2EclProgram
Add-Byte $gen2Chain1 0x09; Add-Imm $gen2Chain1 44; Add-Ref $gen2Chain1 0x0100
Add-Byte $gen2Chain1 0x2D; Add-Ref $gen2Chain1 0x0001
Add-Byte $gen2Chain1 0x20; Add-Imm $gen2Chain1 2

$gen2Chain2 = New-Gen2EclProgram
Add-Byte $gen2Chain2 0x21; Add-Ref $gen2Chain2 0x0100; Add-Imm $gen2Chain2 2; Add-Imm $gen2Chain2 255
Add-Byte $gen2Chain2 0x00

$idtab = New-Object System.Collections.Generic.List[byte]
$idtab.AddRange([BitConverter]::GetBytes([UInt16]2))
$idtab.AddRange([BitConverter]::GetBytes([UInt16]1))
$idtab.AddRange([BitConverter]::GetBytes([UInt16]1))
$idtab.AddRange([BitConverter]::GetBytes([UInt16]2))
$idtab.AddRange([BitConverter]::GetBytes([UInt16]2))
$chainGlb = New-HlibDataLibrary @(
  $idtab.ToArray(),
  $gen2Chain1.ToArray(),
  $gen2Chain2.ToArray()
)
[IO.File]::WriteAllBytes((Join-Path $run "CHAIN.GLB"), $chainGlb)

$idtabBe = New-Object System.Collections.Generic.List[byte]
Add-BE16 $idtabBe 2
Add-BE16 $idtabBe 1
Add-BE16 $idtabBe 1
Add-BE16 $idtabBe 2
Add-BE16 $idtabBe 2
$chainGlib = New-GlibDataLibrary @(
  $idtabBe.ToArray(),
  $gen2Chain1.ToArray(),
  $gen2Chain2.ToArray()
)
[IO.File]::WriteAllBytes((Join-Path $run "CHAING.GLB"), $chainGlib)

# DQK's SAVE_TABLE width is selected by the base operand type. A code-1 base
# writes a byte; a code-3 base writes a word. The editor's real base is code 1.
$tableWidth = New-Gen2EclProgram
Add-Byte $tableWidth 0x0F; Add-Imm $tableWidth 3; Add-Ref $tableWidth 0x00C1
Add-Byte $tableWidth 0x35; Add-Ref $tableWidth 0x00C1; Add-Ref $tableWidth 1; Add-Imm $tableWidth 4
Add-Byte $tableWidth 0x35; Add-Ref $tableWidth 0x00C1; Add-WideRef $tableWidth 0x0200; Add-Imm $tableWidth 4
Add-Byte $tableWidth 0x2A; Add-Ref $tableWidth 1; Add-Imm $tableWidth 4; Add-Ref $tableWidth 0x00C2
Add-Byte $tableWidth 0x00
$tableWidthIdtab = New-Object System.Collections.Generic.List[byte]
Add-U16 $tableWidthIdtab 1; Add-U16 $tableWidthIdtab 1; Add-U16 $tableWidthIdtab 1
$tableWidthGlb = New-HlibDataLibrary @($tableWidthIdtab.ToArray(), $tableWidth.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "TABLEW.GLB"), $tableWidthGlb)

# DQK's 0x37 handler prefetches two operands. This fixture proves native consumes
# exactly that frame, records it, and reaches EXIT instead of entering the legacy
# three-set LOAD_PIECES reader.
$gen2Pieces = New-Gen2EclProgram
Add-Byte $gen2Pieces 0x37; Add-Imm $gen2Pieces 0x1111; Add-Imm $gen2Pieces 0x2222
Add-Byte $gen2Pieces 0x41; Add-Imm $gen2Pieces 1; Add-Imm $gen2Pieces 100
Add-Byte $gen2Pieces 0x00
$piecesIdtab = New-Object System.Collections.Generic.List[byte]
Add-U16 $piecesIdtab 1; Add-U16 $piecesIdtab 1; Add-U16 $piecesIdtab 1
$piecesGlb = New-HlibDataLibrary @($piecesIdtab.ToArray(), $gen2Pieces.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "PIECES.GLB"), $piecesGlb)

# Gen2 LOAD_PIECES takes a two-operand frame and delegates to the generic
# recorder. It needs the same pre-dispatch capacity protection as Gen1 effects.
$capGen2Pieces = New-Gen2EclProgram
1..64 | ForEach-Object {
  Add-Byte $capGen2Pieces 0x0E
  Add-Imm $capGen2Pieces 39
}
Add-Byte $capGen2Pieces 0x37; Add-Imm $capGen2Pieces 0x1111; Add-Imm $capGen2Pieces 0x2222
$capPiecesIdtab = New-Object System.Collections.Generic.List[byte]
Add-U16 $capPiecesIdtab 1; Add-U16 $capPiecesIdtab 1; Add-U16 $capPiecesIdtab 1
$capPiecesGlb = New-HlibDataLibrary @($capPiecesIdtab.ToArray(), $capGen2Pieces.ToArray())
[IO.File]::WriteAllBytes((Join-Path $run "CPPIECES.GLB"), $capPiecesGlb)

# DQK LOAD_FILES has two raw operands. Its third serialized word is tagged
# persistent CA03 state; FF must preserve it. Pin reset, contexts 1..6 and zero,
# replacement, and NEWECL in both container byte orders. Gen1 keeps a raw third
# operand even when it is zero or FF. See research/dqk-combat-context-ca03.md.
$contextCases = [Collections.Generic.List[object]]::new()
$contextCommands = [Collections.Generic.List[string]]::new()
foreach ($containerKind in @('H', 'G')) {
  foreach ($scenario in @('Fresh', 'Replace', 'Chain', '0', '1', '2', '3', '4', '5', '6')) {
    $stem = 'CTX' + $containerKind + $scenario.Substring(0, 1)
    $first = New-Gen2EclProgram
    if ($scenario -ne 'Fresh') {
      $prior = if ($scenario -match '^[0-6]$') { [int]$scenario } else { 4 }
      Add-Byte $first 0x21; Add-Imm $first 18; Add-Imm $first $prior
    }
    $final = $first
    $area = 1
    if ($scenario -eq 'Chain') {
      Add-Byte $first 0x20; Add-Imm $first 2
      $final = New-Gen2EclProgram
      $area = 2
    }
    $secondOperand = if ($scenario -eq 'Replace') { 5 } else { 255 }
    $tag = if ($scenario -eq 'Fresh') { 0 } elseif ($scenario -eq 'Replace') { 0xD005 } else { 0xD000 + $prior }
    Add-Byte $final 0x21; Add-Imm $final 22; Add-Imm $final $secondOperand
    $expectedPc = $final.Count
    Add-Byte $final 0
    $ids = [Collections.Generic.List[byte]]::new()
    $idWords = if ($area -eq 2) { @(2, 1, 1, 2, 2) } else { @(1, 1, 1) }
    foreach ($word in $idWords) {
      if ($containerKind -eq 'H') { Add-U16 $ids $word } else { Add-BE16 $ids $word }
    }
    $members = @($ids.ToArray(), $first.ToArray())
    if ($area -eq 2) { $members += ,$final.ToArray() }
    $library = if ($containerKind -eq 'H') { New-HlibDataLibrary $members } else { New-GlibDataLibrary $members }
    $sourcePath = Join-Path $run "$stem.GLB"
    [IO.File]::WriteAllBytes($sourcePath, $library)
    $contextCases.Add(@{ Stem = $stem; Source = $sourcePath; Hash = (Get-FileHash $sourcePath).Hash;
      Operand = $secondOperand; Tag = $tag; Area = $area; Pc = $expectedPc })
    $contextCommands.Add("CCECL C:\$stem.GLB 1 /E C:\$stem.EFX > C:\$stem.TXT")
    $contextCommands.Add("IF ERRORLEVEL 1 ECHO failed>C:\$stem.ERR")
  }
}
foreach ($dialect in @('GEN1', 'DOK')) {
  if ($dialect -eq 'DOK') { $contextCommands.Add('ECHO.> C:\DKK.CFG') }
  foreach ($third in @(0, 255)) {
    $stem = $dialect + $third
    $program = New-EclProgram
    Add-Byte $program 0x21; Add-Imm $program 18; Add-Imm $program 4; Add-Imm $program 7
    Add-Byte $program 0x21; Add-Imm $program 22; Add-Imm $program 255; Add-Imm $program $third
    $expectedPc = $program.Count
    Add-Byte $program 0
    $sourcePath = Join-Path $run "$stem.BIN"
    [IO.File]::WriteAllBytes($sourcePath, $program.ToArray())
    $contextCases.Add(@{ Stem = $stem; Source = $sourcePath; Hash = (Get-FileHash $sourcePath).Hash;
      Operand = 255; Tag = $third; Area = 0xFFFF; Pc = $expectedPc })
    $contextCommands.Add("CCECL C:\$stem.BIN /E C:\$stem.EFX > C:\$stem.TXT")
    $contextCommands.Add("IF ERRORLEVEL 1 ECHO failed>C:\$stem.ERR")
  }
  if ($dialect -eq 'DOK') { $contextCommands.Add('DEL C:\DKK.CFG > NUL') }
}
$contextDosCommands = $contextCommands -join "`r`n"

$conf = Join-Path $run "_ccecl_effects.conf"
$dosCommands = @"
CCECL C:\SYN.BIN /E C:\RAW.EFX > C:\CCECL_RAW.TXT
CCECL C:\SYN.DAX 34 /E C:\DAX.EFX > C:\CCECL_DAX.TXT
CCECL C:\ARITH.BIN /T /E C:\ARITH.EFX > C:\CCECL_ARITH.TXT
copy C:\CCECL.TRC C:\ARITH.TRC > NUL
CCECL C:\TABLEW.GLB 1 /L 4660 /T /E C:\TABLEW.EFX > C:\CCECL_TABLEW.TXT
copy C:\CCECL.TRC C:\TABLEW.TRC > NUL
CCECL C:\STRENGTH.BIN /T /E C:\STR0.EFX > C:\STR0.TXT
copy C:\CCECL.TRC C:\STR0.TRC > NUL
CCECL C:\STRENGTH.BIN /Z 77 /T /E C:\STRZ.EFX > C:\STRZ.TXT
copy C:\CCECL.TRC C:\STRZ.TRC > NUL
CCECL C:\PARTY.BIN /E C:\PARTY.EFX > C:\CCECL_PARTY.TXT
CCECL C:\PARTYCTX.BIN /I 30 /I 31 /A 7 /U 2 12 /M 4 /M 10 /M 6 /K 20 /K 50 /K 56 /S 8 /S 22 /V 2 99 /N 2 /H 1 /T > C:\CCECL_PARTYCTX.TXT
copy C:\CCECL.TRC C:\PARTYCTX.TRC > NUL
CCECL C:\PARTYCTX.BIN /G C:\PARTYCTX.GBP /T > C:\CCECL_PARTYG.TXT
copy C:\CCECL.TRC C:\PARTYG.TRC > NUL
CCECL C:\THIEFMAT.BIN /G C:\THIEFMAT.GBP /T > C:\CCECL_THIEFMAT.TXT
copy C:\CCECL.TRC C:\THIEFMAT.TRC > NUL
CCECL C:\THIEFMAT.BIN /B C:\COK.GBP /ID 1 /T > C:\CCECL_COKGBPR.TXT
copy C:\CCECL.TRC C:\COKGBPR.TRC > NUL
ECHO.> C:\KRYNN.CFG
CCECL C:\AWARD.BIN /B C:\AWARD.GBP /ID 1 /E C:\AWARD.EFX > C:\CCECL_AWARD.TXT
DEL C:\KRYNN.CFG > NUL
ECHO.> C:\DKK.CFG
CCECL C:\AWARD.BIN /B C:\DOKAWARD.GBP /ID 2 /E C:\DOKAWARD.EFX > C:\CCECL_DOKAWARD.TXT
CCECL C:\AWARD.BIN /B C:\DOKNOCACHE.GBP /ID 2 /E C:\DOKNOCACHE.EFX > C:\CCECL_DOKNOCACHE.TXT
DEL C:\DKK.CFG > NUL
CCECL C:\PARTYCTX.BIN /B C:\DOK.GBP /T > C:\CCECL_DOKGBPR.TXT
copy C:\CCECL.TRC C:\DOKGBPR.TRC > NUL
CCECL C:\SETUP.BIN /E C:\SETUP.EFX > C:\CCECL_SETUP.TXT
CCECL C:\SETUP.BIN /D 7 /E C:\SETUPD.EFX > C:\CCECL_SETUPD.TXT
CCECL C:\INPUT.BIN /T /E C:\INPUT.EFX > C:\CCECL_INPUT.TXT
copy C:\CCECL.TRC C:\INPUT.TRC > NUL
CCECL C:\INPUT.BIN /L 750 /T /E C:\INPUTL.EFX > C:\CCECL_INPUTL.TXT
copy C:\CCECL.TRC C:\INPUTL.TRC > NUL
CCECL C:\INPUT.BIN /W 3 /T /E C:\INPUTW.EFX > C:\CCECL_INPUTW.TXT
copy C:\CCECL.TRC C:\INPUTW.TRC > NUL
CCECL C:\INPUT.BIN /C 1 /T /E C:\INPUTC.EFX > C:\CCECL_INPUTC.TXT
copy C:\CCECL.TRC C:\INPUTC.TRC > NUL
CCECL C:\INPUT.BIN /Y 2 /T /E C:\INPUTY.EFX > C:\CCECL_INPUTY.TXT
copy C:\CCECL.TRC C:\INPUTY.TRC > NUL
CCECL C:\INPUT.BIN /O 2 /T /E C:\INPUTO.EFX > C:\CCECL_INPUTO.TXT
copy C:\CCECL.TRC C:\INPUTO.TRC > NUL
CCECL C:\BRLOOP.BIN /T /E C:\BRLOOP.EFX > C:\BRLOOP.TXT
copy C:\CCECL.TRC C:\BRLOOP.TRC > NUL
CCECL C:\PCLOOP.BIN /T /E C:\PCLOOP.EFX > C:\PCLOOP.TXT
copy C:\CCECL.TRC C:\PCLOOP.TRC > NUL
CCECL C:\MEMFULL.BIN /E C:\MEMFULL.EFX > C:\CCECL_MEMFULL.TXT
CCECL C:\ENCFULL.BIN /E C:\ENCFULL.EFX > C:\ENCFULL.TXT
CCECL C:\GOSUB32.BIN /E C:\GOSUB32.EFX > C:\GOSUB32.TXT
CCECL C:\GOSUB33.BIN /E C:\GOSUB33.EFX > C:\GOSUB33.TXT
CCECL C:\ON32.BIN /E C:\ON32.EFX > C:\ON32.TXT
CCECL C:\ON33.BIN /E C:\ON33.EFX > C:\ON33.TXT
CCECL C:\BADOP.BIN /E C:\BADOP.EFX > C:\CCECL_BADOP.TXT
CCECL C:\BADBRG.BIN /E C:\BADBRG.EFX > C:\CCECL_BADBRG.TXT
CCECL C:\BUCKB50.DAX 50 /Q 128 /F 3 /E C:\BUCKB50.EFX > C:\CCECL_BUCKB50.TXT
CCECL C:\BUCKB50.DAX 51 /Q 128 /F 3 /E C:\BUCKB51.EFX > C:\CCECL_BUCKB51.TXT
CCECL C:\BADSCR.BIN /E C:\BADSCR.EFX > C:\CCECL_BADSCR.TXT
CCECL C:\COMBAT.BIN /E C:\COMBAT.EFX > C:\CCECL_COMBAT.TXT
CCECL C:\RESUME.BIN /E C:\RESUME.EFX > C:\CCECL_RESUME0.TXT
copy C:\RESUME.EFX C:\RESBEF.EFX > NUL
CCECL C:\RESUME.BIN /R C:\RESUME.EFX party /E C:\RESPARTY.EFX > C:\CCECL_RESPARTY.TXT
CCECL C:\RESUME.BIN /R C:\RESUME.EFX C:\ENEMY.OUT /E C:\RESENEMY.EFX > C:\CCECL_RESENEMY.TXT
CCECL C:\RESUME.BIN /R C:\RESUME.EFX flee /E C:\RESFLEE.EFX > C:\CCECL_RESFLEE.TXT
CCECL C:\RESUME.BIN /R C:\RESUME.EFX C:\BADTOKEN.OUT /E C:\BADO.EFX > C:\CCECL_BADOUT.TXT
if errorlevel 1 echo rejected>C:\BADO.RC
CCECL C:\RESUME.BIN /R C:\RESUME.EFX C:\TRAILING.OUT /E C:\TRAIL.EFX > C:\CCECL_TRAIL.TXT
if errorlevel 1 echo rejected>C:\TRAIL.RC
CCECL C:\RESUME.BIN /R C:\RESUME.EFX C:\OVERSIZE.OUT /E C:\OVR.EFX > C:\CCECL_OVERSZ.TXT
if errorlevel 1 echo rejected>C:\OVR.RC
CCECL C:\RESUME.BIN /R C:\RESUME.EFX C:\MISSING.OUT /E C:\MISS.EFX > C:\CCECL_MISS.TXT
if errorlevel 1 echo rejected>C:\MISS.RC
CCECL C:\CLOCKRES.BIN /E C:\CLOCK0.EFX > C:\CCECL_CLOCK0.TXT
CCECL C:\CLOCKRES.BIN /R C:\CLOCK0.EFX party /E C:\CLOCK1.EFX > C:\CCECL_CLOCK1.TXT
CCECL C:\ENCBLK.BIN /E C:\ENCEFX.EFX > C:\CCECL_EN.TXT
CCECL C:\SCRIPT.BIN /N 3 /E C:\SCRIPT.EFX > C:\CCECL_SCRIPT.TXT
CCECL C:\SCRIPT2.BIN /E C:\SCRIPT2.EFX > C:\CCECL_SCRIPT2.TXT
CCECL C:\CAPPRINT.BIN /T /E C:\CAPPRINT.EFX > C:\CAPPR.TXT
copy C:\CCECL.TRC C:\CAPPRINT.TRC > NUL
CCECL C:\CAPPFX.BIN /E C:\CAPPFX.EFX > C:\CAPPFX.TXT
CCECL C:\CAPDMG.BIN /E C:\CAPDMG.EFX > C:\CAPDM.TXT
CCECL C:\CAPAWARD.BIN /B C:\CAPAWARD.GBP /T /E C:\CAPAWARD.EFX > C:\CAPAWD.TXT
copy C:\CCECL.TRC C:\CAPAWARD.TRC > NUL
CCECL C:\BUCKEXT.BIN /E C:\BUCKEXT.EFX > C:\CCECL_BUCKEXT.TXT
CCECL C:\BUCKG43.DAX 98 /@ 39366 /E C:\BUCKG43.EFX > C:\CCECL_BUCKG43.TXT
CCECL C:\BUCKG43.DAX 99 /@ 39366 /E C:\BUCKG99.EFX > C:\CCECL_BUCKG99.TXT
CCECL C:\CHAIN.DAX 34 /E C:\CHAIN.EFX > C:\CCECL_CHAIN.TXT
CCECL C:\CHAIN.GLB 1 /E C:\CHAINGLB.EFX > C:\CCECL_CHAINGLB.TXT
CCECL C:\CHAING.GLB 1 /E C:\CGLIB.EFX > C:\CGLIB.TXT
CCECL C:\PIECES.GLB 1 /E C:\PIECES.EFX > C:\CCECL_PIECES.TXT
CCECL C:\CPPIECES.GLB 1 /T /E C:\CPPIECES.EFX > C:\CAPPCS.TXT
copy C:\CCECL.TRC C:\CPPIECES.TRC > NUL
$contextDosCommands
"@ | Set-Content -Path (Join-Path $run "RUN.BAT") -Encoding ASCII

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
call C:\RUN.BAT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCECL effects smoke test"
}

# CCFLOW will create this private script-capacity copy only after it has accepted
# the v9 GBHD record. Exercise CCECL's replay half here without making the
# fixture itself a second host implementation.
$capReplay = [IO.File]::ReadAllBytes((Join-Path $run "CAPPFX.EFX"))
$capReplay[8] = 4; $capReplay[9] = 0       # vm status: controlled script-full replay
$capReplay[120] = 1; $capReplay[121] = 0  # GBRS state present
[IO.File]::WriteAllBytes((Join-Path $run "CAPPFX.RSM"), $capReplay)
$replayConf = Join-Path $run "_ccecl_effects_replay.conf"
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
CCECL C:\CAPPFX.BIN /R C:\CAPPFX.RSM /E C:\CAPPFX2.EFX > C:\CAPPFX2.TXT
exit
"@ | Set-Content -Path $replayConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $replayConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while replaying CCECL script-capacity state"
}

# An ordinary combat continuation and a /P state import are both closed binary
# contracts.  Future-version and appended-byte variants must fail before CCECL
# restores VM state or publishes a replacement effect.
$resumeBytes = [IO.File]::ReadAllBytes((Join-Path $run 'RESUME.EFX'))
$resumeBefore = [byte[]]$resumeBytes.Clone()
$futureResume = [byte[]]$resumeBytes.Clone()
$futureResume[4] = 0xFF; $futureResume[5] = 0xFF
[IO.File]::WriteAllBytes((Join-Path $run 'FUTURE.EFX'), $futureResume)
$trailingResume = [byte[]]::new($resumeBytes.Length + 1)
[Array]::Copy($resumeBytes, $trailingResume, $resumeBytes.Length)
[IO.File]::WriteAllBytes((Join-Path $run 'TRAILING.EFX'), $trailingResume)

@"
@echo off
CCECL C:\RESUME.BIN /R C:\FUTURE.EFX party /E C:\FUTURER.EFX > C:\FUTURER.TXT
if errorlevel 1 echo rejected>C:\FUTURER.RC
CCECL C:\RESUME.BIN /R C:\TRAILING.EFX party /E C:\TRAILR.EFX > C:\TRAILR.TXT
if errorlevel 1 echo rejected>C:\TRAILR.RC
CCECL C:\SYN.BIN /P C:\FUTURE.EFX /E C:\FUTUREP.EFX > C:\FUTUREP.TXT
if errorlevel 1 echo rejected>C:\FUTUREP.RC
CCECL C:\SYN.BIN /P C:\TRAILING.EFX /E C:\TRAILP.EFX > C:\TRAILP.TXT
if errorlevel 1 echo rejected>C:\TRAILP.RC
exit
"@ | Set-Content -Path (Join-Path $run 'REJECT.BAT') -Encoding ASCII
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
call C:\REJECT.BAT
exit
"@ | Set-Content -Path (Join-Path $run 'resume-reject.conf') -Encoding ASCII
$rejectProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf (Join-Path $run 'resume-reject.conf') -Headless:$Headless
if (-not $rejectProcess.WaitForExit(60000)) {
  try { $rejectProcess.Kill() } catch {}
  throw "DOSBox did not exit while testing rejected CCECL continuation formats"
}
if (Compare-Object $resumeBefore ([IO.File]::ReadAllBytes((Join-Path $run 'RESUME.EFX'))) -SyncWindow 0) {
  throw 'CCECL continuation-format rejection mutated the paused source state'
}
foreach ($badResume in @('FUTURER', 'TRAILR', 'FUTUREP', 'TRAILP')) {
  if ((Get-Content (Join-Path $run "$badResume.RC") -Raw).Trim() -ne 'rejected') {
    throw "CCECL continuation-format rejection did not fail $badResume"
  }
  if (Test-Path (Join-Path $run "$badResume.EFX")) {
    throw "CCECL continuation-format rejection published $badResume.EFX"
  }
}

$GbefVersion = 9
$GbefLength = 5750
$GbefScriptOffset = 2246
$GbefScriptEventOffset = 2252
$GbefScriptRecordBytes = 20
$GbefScriptTextOffset = 3532
$GbefScriptTextRecordBytes = 34
$GbefSetupOffset = 5708
$GbefHaltOffset = 5720
$GbefClockOffset = 5732

function Assert-EffectFile([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL effects smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $version = U16 4
  $flags = U16 6
  $status = U16 8
  $geo = U16 10
  $files = @((U16 12), (U16 14), (U16 16))
  $raw = @((U16 18), (U16 20), (U16 22))
  $sets = @((U16 24), (U16 26), (U16 28))
  $encCount = U16 32
  $npcCount = U16 82

  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    $version -ne $GbefVersion -or
    $flags -ne 7 -or
    $status -ne 0 -or
    $geo -ne 34 -or
    ($files -join ",") -ne "34,2,255" -or
    ($raw -join ",") -ne "3,4,23" -or
    ($sets -join ",") -ne "3,255,23" -or
    $encCount -ne 0 -or
    $npcCount -ne 0
  ) {
    throw "CCECL effects smoke failed: unexpected $Label contents"
  }
}

Assert-EffectFile (Join-Path $run "RAW.EFX") "RAW.EFX"
Assert-EffectFile (Join-Path $run "DAX.EFX") "DAX.EFX"

foreach ($case in $contextCases) {
  $stem = $case.Stem
  # DOS opens a redirection even when IF is false; only the written marker
  # denotes failure. Exact output fields below also require successful output.
  $errorPath = Join-Path $run "$stem.ERR"
  if ((Test-Path $errorPath) -and (Get-Item $errorPath).Length -gt 0) {
    throw "LOAD_FILES $stem returned a guest error"
  }
  $effect = [IO.File]::ReadAllBytes((Join-Path $run "$stem.EFX"))
  if ($effect.Length -ne $GbefLength -or [Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF') {
    throw "LOAD_FILES $stem has an invalid effect envelope"
  }
  $words = @{ 4 = 9; 6 = 1; 8 = 0; 10 = 22; 12 = 22; 14 = $case.Operand;
    16 = $case.Tag; 120 = 0; 122 = $case.Area; 124 = $case.Pc }
  foreach ($offset in $words.Keys) {
    $actual = [BitConverter]::ToUInt16($effect, $offset)
    if ($actual -ne $words[$offset]) {
      throw "LOAD_FILES $stem word at $offset expected $($words[$offset]), got $actual"
    }
  }
  if ((Get-FileHash $case.Source).Hash -ne $case.Hash) { throw "LOAD_FILES $stem mutated its source" }
}
Write-Output "RESULT: LOAD_FILES context reset, FF, replacement, HLIB/GLIB NEWECL and Gen1/DoK controls PASS ($($contextCases.Count) cases)"

function Assert-ChainEffect([string]$Path, [int]$ExpectedGeo, [int]$ExpectedFlags = 1, [int]$ExpectedFile2 = 255) {
  if (-not (Test-Path $Path)) {
    throw "CCECL chain smoke failed: $Path was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne $ExpectedFlags -or
    (U16 8) -ne 0 -or
    (U16 10) -ne $ExpectedGeo -or
    (U16 12) -ne $ExpectedGeo -or
    (U16 14) -ne 2 -or
    (U16 16) -ne $ExpectedFile2 -or
    (U16 30) -ne 0xFFFF -or
    (U16 32) -ne 0 -or
    (U16 82) -ne 0
  ) {
    throw "CCECL chain smoke failed: unexpected CHAIN.EFX contents"
  }
}

function Assert-NoScriptEffect([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL no-script smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $scriptMagic = [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4)
  if ($b.Length -ne $GbefLength -or $magic -ne "GBEF" -or (U16 4) -ne $GbefVersion -or $scriptMagic -ne "GBSX" -or (U16 ($GbefScriptOffset + 4)) -ne 0) {
    throw "CCECL no-script smoke failed: unexpected $Label script tail"
  }
}

function Assert-StableBridgeLoopEffect([string]$Path, [int]$ExpectedFlags, [int]$ExpectedScriptCount, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL stable bridge loop smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $scriptMagic = [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne $ExpectedFlags -or
    (U16 8) -ne 0 -or
    (U16 10) -ne 34 -or
    (U16 12) -ne 34 -or
    (U16 14) -ne 2 -or
    (U16 16) -ne 255 -or
    $scriptMagic -ne "GBSX" -or
    (U16 ($GbefScriptOffset + 4)) -ne $ExpectedScriptCount
  ) {
    throw "CCECL stable bridge loop smoke failed: unexpected $Label effect header"
  }
  if (($ExpectedFlags -band 0x02) -ne 0 -and ((U16 18) -ne 3 -or (U16 20) -ne 4 -or (U16 22) -ne 23 -or (U16 24) -ne 3 -or (U16 26) -ne 4 -or (U16 28) -ne 23)) {
    throw "CCECL stable bridge loop smoke failed: unexpected $Label LOAD_PIECES fields"
  }
  if ($ExpectedScriptCount -eq 16) {
    $first = $GbefScriptEventOffset
    $last = $GbefScriptEventOffset + (15 * $GbefScriptRecordBytes)
    if ((U16 $first) -ne 0x0E -or (U16 ($first + 2)) -ne 1 -or (U16 ($first + 4)) -ne 39 -or (U16 $last) -ne 0x0E -or (U16 ($last + 4)) -ne 39) {
      throw "CCECL stable bridge loop smoke failed: unexpected $Label script events"
    }
  }
}

function Assert-TraceLineLimit([string]$Path, [int]$MaxLines, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL stable bridge loop smoke failed: $Label trace was not created"
  }
  $lines = @(Get-Content $Path)
  if ($lines.Count -gt $MaxLines) {
    throw "CCECL stable bridge loop smoke failed: $Label trace had $($lines.Count) lines"
  }
}

function Assert-MemoryOverflowEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL memory overflow smoke failed: MEMFULL.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $resumeMagic = [Text.Encoding]::ASCII.GetString($b, 116, 4)
  $haltMagic = [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne 4 -or
    $resumeMagic -ne "GBRS" -or
    (U16 196) -ne 512 -or
    $haltMagic -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 3 -or
    (U16 ($GbefHaltOffset + 6)) -ne 0x0C16 -or
    (U16 ($GbefHaltOffset + 8)) -ne 0x0009 -or
    (U16 ($GbefHaltOffset + 10)) -ne 0xFFFF
  ) {
    throw "CCECL memory overflow smoke failed: overflow was not surfaced as a halt"
  }
}

function Assert-CallStackEffect([string]$Path, [int]$ExpectedStatus, [int]$ExpectedReason, [int]$ExpectedPc, [int]$ExpectedOpcode, [int]$ExpectedMemCount, [int]$ExpectedKey = 0, [int]$ExpectedValue = 0) {
  if (-not (Test-Path $Path)) { throw "CCECL call-stack smoke failed: $Path was not created" }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $ExpectedDepth = if ($ExpectedReason -eq 9) { 32 } else { 0 }
  if (
    $b.Length -ne $GbefLength -or
    [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne $ExpectedStatus -or
    [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4) -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne $ExpectedReason -or
    (U16 ($GbefHaltOffset + 6)) -ne $ExpectedPc -or
    (U16 ($GbefHaltOffset + 8)) -ne $ExpectedOpcode -or
    (U16 130) -ne $ExpectedDepth -or
    (U16 196) -ne $ExpectedMemCount
  ) { throw "CCECL call-stack smoke failed: unexpected halt/state contract in $Path" }
  if ($ExpectedMemCount -eq 1 -and ((U16 198) -ne $ExpectedKey -or (U16 1222) -ne $ExpectedValue)) {
    throw "CCECL call-stack smoke failed: deepest control mutation was not retained"
  }
}

function Assert-EncounterCapacityEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL encounter-capacity smoke failed: ENCFULL.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  if (
    $b.Length -ne $GbefLength -or
    [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne 4 -or
    ((U16 6) -band 0x0008) -ne 0 -or
    (U16 32) -ne 0 -or
    [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4) -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 8 -or
    (U16 ($GbefHaltOffset + 8)) -ne 0x000B
  ) {
    throw "CCECL encounter-capacity smoke failed: ninth group did not halt and discard the partial handoff"
  }
}

function Assert-ScriptCapacityEffect([string]$Path, [int]$ExpectedPc, [int]$ExpectedOpcode, [string]$Label, [int]$ExpectedArea = 0xFFFF, [int]$ExpectedFlags = 0x20, [int]$ExpectedVersion = $GbefVersion, [int]$ExpectedLength = $GbefLength) {
  if (-not (Test-Path $Path)) {
    throw "CCECL script-capacity smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $scriptMagic = [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4)
  $haltMagic = [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4)
  $first = $GbefScriptEventOffset
  $last = $GbefScriptEventOffset + (63 * $GbefScriptRecordBytes)
  if (
    $b.Length -ne $ExpectedLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $ExpectedVersion -or
    (U16 6) -ne $ExpectedFlags -or
    (U16 8) -ne 4 -or
    $scriptMagic -ne "GBSX" -or
    (U16 ($GbefScriptOffset + 4)) -ne 64 -or
    (U16 $first) -ne 0x0E -or
    (U16 ($first + 2)) -ne 1 -or
    (U16 ($first + 4)) -ne 39 -or
    (U16 $last) -ne 0x0E -or
    (U16 ($last + 2)) -ne 1 -or
    (U16 ($last + 4)) -ne 39 -or
    $haltMagic -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 7 -or
    (U16 ($GbefHaltOffset + 6)) -ne $ExpectedPc -or
    (U16 ($GbefHaltOffset + 8)) -ne $ExpectedOpcode -or
    (U16 ($GbefHaltOffset + 10)) -ne $ExpectedArea
  ) {
    throw "CCECL script-capacity smoke failed: $Label did not retain 64 effects and halt before the 65th"
  }
}

function Assert-BadOpcodeEffect([string]$Path, [int]$ExpectedPc = 0x0016, [int]$ExpectedOpcode = 0x0044, [int]$ExpectedArea = 0xFFFF) {
  if (-not (Test-Path $Path)) {
    throw "CCECL bad-opcode smoke failed: BADOP.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $haltMagic = [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne 4 -or
    $haltMagic -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 1 -or
    (U16 ($GbefHaltOffset + 6)) -ne $ExpectedPc -or
    (U16 ($GbefHaltOffset + 8)) -ne $ExpectedOpcode -or
    (U16 ($GbefHaltOffset + 10)) -ne $ExpectedArea
  ) {
    throw "CCECL bad-opcode smoke failed: halt diagnostic did not preserve bad opcode/pc"
  }
}

function Assert-BuckB50EncounterExtraEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL Buck block-50 encounter smoke failed: BUCKB50.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $haltMagic = [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne 0 -or
    (U16 122) -ne 50 -or
    $haltMagic -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 0
  ) {
    throw "CCECL Buck block-50 encounter smoke failed: extra operand did not carry IF skip to clean exit"
  }
}

function Assert-BridgeBadOpcodeEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL bridge bad-opcode smoke failed: BADBRG.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $haltMagic = [Text.Encoding]::ASCII.GetString($b, $GbefHaltOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne 1 -or
    (U16 8) -ne 0 -or
    (U16 10) -ne 34 -or
    (U16 12) -ne 34 -or
    (U16 14) -ne 2 -or
    (U16 16) -ne 255 -or
    $haltMagic -ne "GBHD" -or
    (U16 ($GbefHaltOffset + 4)) -ne 0
  ) {
    throw "CCECL bridge bad-opcode smoke failed: post-LOAD_FILES bad opcode was not treated as a clean bridge exit"
  }
}

function Assert-PartySurpriseEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL PARTY_SURPRISE smoke failed: PARTY.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $resumeMagic = [Text.Encoding]::ASCII.GetString($b, 116, 4)
  $scriptMagic = [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    ((U16 6) -band 0x20) -eq 0 -or
    (U16 8) -ne 0 -or
    $resumeMagic -ne "GBRS" -or
    (U16 196) -ne 2 -or
    (U16 198) -ne 0x0110 -or
    (U16 200) -ne 0x0111 -or
    (U16 1222) -ne 0 -or
    (U16 1224) -ne 0 -or
    $scriptMagic -ne "GBSX" -or
    (U16 ($GbefScriptOffset + 4)) -ne 1 -or
    (U16 $GbefScriptEventOffset) -ne 0x22 -or
    (U16 ($GbefScriptEventOffset + 2)) -ne 3 -or
    (U16 ($GbefScriptEventOffset + 4)) -ne 0x0110 -or
    (U16 ($GbefScriptEventOffset + 6)) -ne 0x0111 -or
    (U16 ($GbefScriptEventOffset + 8)) -ne 0
  ) {
    throw "CCECL PARTY_SURPRISE smoke failed: expected no-ranger memory defaults and GBSX capture"
  }
}

function Assert-SetupEffect([string]$Path, [int]$ExpectedDistance = 0) {
  if (-not (Test-Path $Path)) {
    throw "CCECL SETUP_MONSTER smoke failed: $Path was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $setupMagic = [Text.Encoding]::ASCII.GetString($b, $GbefSetupOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne 0x40 -or
    (U16 8) -ne 0 -or
    $setupMagic -ne "GBES" -or
    (U16 ($GbefSetupOffset + 4)) -ne 9 -or
    (U16 ($GbefSetupOffset + 6)) -ne 3 -or
    (U16 ($GbefSetupOffset + 8)) -ne 5 -or
    (U16 ($GbefSetupOffset + 10)) -ne $ExpectedDistance
  ) {
    throw "CCECL SETUP_MONSTER smoke failed: unexpected $Path setup tail"
  }
}

function Assert-ClockEffect([string]$Path, [int[]]$ExpectedSlots, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL clock smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $clockMagic = [Text.Encoding]::ASCII.GetString($b, $GbefClockOffset, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    ((U16 6) -band 0x80) -eq 0 -or
    $clockMagic -ne "GBCL"
  ) {
    throw "CCECL clock smoke failed: unexpected $Label clock header"
  }
  for ($i = 0; $i -lt 7; $i++) {
    if ((U16 ($GbefClockOffset + 4 + ($i * 2))) -ne $ExpectedSlots[$i]) {
      throw "CCECL clock smoke failed: $Label slot $i mismatch"
    }
  }
}

function Assert-CombatEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL combat smoke failed: COMBAT.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $resumeMagic = [Text.Encoding]::ASCII.GetString($b, 116, 4)
  if ($b.Length -ne $GbefLength -or $magic -ne "GBEF" -or (U16 4) -ne $GbefVersion -or (U16 8) -ne 3 -or (U16 32) -ne 0 -or (U16 82) -ne 0 -or $resumeMagic -ne "GBRS" -or (U16 120) -ne 1) {
    throw "CCECL combat smoke failed: unexpected COMBAT.EFX contents"
  }
}

function Assert-ResumeChain([string]$Path, [int]$ExpectedChain, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "CCECL resume smoke failed: $Label was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  if ($b.Length -ne $GbefLength -or $magic -ne "GBEF" -or (U16 4) -ne $GbefVersion -or (U16 8) -ne 1 -or (U16 30) -ne $ExpectedChain) {
    throw "CCECL resume smoke failed: unexpected $Label contents"
  }
}

function Assert-EncounterEffect([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "CCECL encounter smoke failed: ENCEFX.EFX was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne 0x18 -or
    (U16 8) -ne 3 -or
    (U16 32) -ne 1 -or
    (U16 34) -ne 19 -or
    (U16 36) -ne 1 -or
    (U16 38) -ne 2 -or
    (U16 82) -ne 1 -or
    (U16 84) -ne 48 -or
    (U16 86) -ne 100
  ) {
    throw "CCECL encounter smoke failed: unexpected ENCOUNTER.EFX contents"
  }
}

function Assert-BuckGuardEncounterEffect([string]$Path, [bool]$ExpectedQueued) {
  if (-not (Test-Path $Path)) {
    throw "CCECL Buck guard smoke failed: $Path was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $expectedFlags = if ($ExpectedQueued) { 0x28 } else { 0x20 }
  $expectedEnc = if ($ExpectedQueued) { 2 } else { 0 }
  if (
    $b.Length -ne $GbefLength -or
    $magic -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 6) -ne $expectedFlags -or
    (U16 8) -ne 3 -or
    (U16 32) -ne $expectedEnc
  ) {
    throw "CCECL Buck guard smoke failed: unexpected header/group count in $Path"
  }
  if ($ExpectedQueued) {
    if ((U16 34) -ne 23 -or (U16 36) -ne 1 -or (U16 38) -ne 23) {
      throw "CCECL Buck guard smoke failed: unexpected first queued group in $Path"
    }
    if ((U16 40) -ne 8 -or (U16 42) -ne 7 -or (U16 44) -ne 8) {
      throw "CCECL Buck guard smoke failed: unexpected second queued group in $Path"
    }
  }
}

function Assert-ScriptEffect([string]$Path, [object[]]$ExpectedEvents, [int]$ExpectedFlags = 0x20) {
  if (-not (Test-Path $Path)) {
    throw "CCECL script-effect smoke failed: $Path was not created"
  }
  $b = [IO.File]::ReadAllBytes($Path)
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  $magic = [Text.Encoding]::ASCII.GetString($b, 0, 4)
  $scriptMagic = [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4)
  if ($b.Length -ne $GbefLength -or $magic -ne "GBEF" -or (U16 4) -ne $GbefVersion -or (U16 6) -ne $ExpectedFlags -or (U16 8) -ne 0 -or $scriptMagic -ne "GBSX" -or (U16 ($GbefScriptOffset + 4)) -ne $ExpectedEvents.Count) {
    throw "CCECL script-effect smoke failed: unexpected $Path header"
  }

  function Assert-Event([int]$Index, [int]$Opcode, [int]$Argc, [int[]]$Operands) {
    $base = $GbefScriptEventOffset + ($Index * $GbefScriptRecordBytes)
    if ((U16 $base) -ne $Opcode -or (U16 ($base + 2)) -ne $Argc) {
      throw "CCECL script-effect smoke failed: event $Index header mismatch"
    }
    for ($i = 0; $i -lt $Operands.Count; $i++) {
      if ((U16 ($base + 4 + ($i * 2))) -ne $Operands[$i]) {
        throw "CCECL script-effect smoke failed: event $Index operand $i mismatch"
      }
    }
  }

  for ($i = 0; $i -lt $ExpectedEvents.Count; $i++) {
    $event = $ExpectedEvents[$i]
    Assert-Event $i $event.Opcode $event.Argc $event.Operands
    if ($event.ContainsKey("Text")) {
      $base = $GbefScriptTextOffset + ($i * $GbefScriptTextRecordBytes)
      $len = U16 $base
      $text = [Text.Encoding]::ASCII.GetString($b, $base + 2, $len)
      if ($text -ne $event.Text) {
        throw "CCECL script-effect smoke failed: event $i text mismatch"
      }
    }
  }
}

function Assert-TraceContains([string]$Path, [string[]]$Needles) {
  if (-not (Test-Path $Path)) {
    throw "CCECL arithmetic smoke failed: CCECL.TRC was not created"
  }
  $trace = Get-Content $Path -Raw
  foreach ($needle in $Needles) {
    if (-not $trace.Contains($needle)) {
      throw "CCECL arithmetic smoke failed: trace missing '$needle'"
    }
  }
}

function Assert-TraceNotContains([string]$Path, [string[]]$Needles) {
  if (-not (Test-Path $Path)) {
    throw "CCECL arithmetic smoke failed: CCECL.TRC was not created"
  }
  $trace = Get-Content $Path -Raw
  foreach ($needle in $Needles) {
    if ($trace.Contains($needle)) {
      throw "CCECL arithmetic smoke failed: trace unexpectedly contained '$needle'"
    }
  }
}

Assert-TraceContains (Join-Path $run "ARITH.TRC") @(
  "OP=06 MEM[0102]=0003",
  "OP=07 MEM[0103]=0009",
  "OP=2F MEM[0104]=0000",
  "OP=09 MEM[0106]=0001",
  "OP=30 MEM[0105]=00FF",
  "OP=09 MEM[0107]=0002",
  "OP=08 MEM[0108]=0001",
  "OP=09 MEM[0109]=0003",
  "OP=22 MEM[0111]=0000",
  "OP=09 MEM[0123]=0066",
  "OP=2A MEM[0112]=0066",
  "OP=35 MEM[0134]=0077",
  "OP=23 MEM[02CB]=0001",
  "OP=09 MEM[0113]=0088",
  "OP=09 MEM[0114]=0099",
  "OP=3B MEM[0117]=00FF",
  "OP=09 MEM[0118]=005A",
  "OP=09 MEM[0119]=005B",
  "OP=1E MEM[011D]=0000",
  "OP=09 MEM[011E]=005C",
  "OP=09 MEM[011F]=005D",
  "OP=09 MEM[0120]=005E",
  "OP=09 MEM[0121]=005F",
  "OP=09 MEM[0125]=006A",
  "OP=09 MEM[010A]=004D",
  "OP=09 MEM[010B]=0055"
)

Assert-TraceContains (Join-Path $run "TABLEW.TRC") @(
  "OP=0F MEM[00C1]=1234",
  "OP=35 MEM[0005]=0034",
  "OP=35 MEM[0204]=1234",
  "OP=2A MEM[00C2]=0034"
)
Assert-TraceNotContains (Join-Path $run "ARITH.TRC") @(
  "OP=09 MEM[0115]=0044"
)
Assert-ScriptEffect (Join-Path $run "ARITH.EFX") @(
  @{ Opcode = 0x1D; Argc = 2; Operands = @(0,0) },
  @{ Opcode = 0x22; Argc = 3; Operands = @(0x0110,0x0111,0) },
  @{ Opcode = 0x23; Argc = 5; Operands = @(0,0,2,4,1) },
  @{ Opcode = 0x38; Argc = 1; Operands = @(61) }
) 0x60
Assert-TraceNotContains (Join-Path $run "STR0.TRC") @(
  "OP=09 MEM[0140]=00C0"
)
Assert-ScriptEffect (Join-Path $run "STR0.EFX") @(
  @{ Opcode = 0x1D; Argc = 2; Operands = @(0,50) }
) 0x20
Assert-TraceContains (Join-Path $run "STRZ.TRC") @(
  "OP=09 MEM[0140]=00C0"
)
Assert-ScriptEffect (Join-Path $run "STRZ.EFX") @(
  @{ Opcode = 0x1D; Argc = 2; Operands = @(77,50) }
) 0x20
Assert-TraceContains (Join-Path $run "PARTYCTX.TRC") @(
  "OP=09 MEM[0202]=00A0",
  "OP=09 MEM[0203]=00A1",
  "OP=09 MEM[0204]=00A2",
  "OP=09 MEM[022E]=00B2",
  "OP=09 MEM[022F]=00B3",
  "OP=09 MEM[0224]=00AE",
  "OP=3B MEM[0207]=0000",
  "OP=09 MEM[0208]=00A4",
  "OP=09 MEM[0209]=00A5",
  "OP=3B MEM[022B]=0000",
  "OP=09 MEM[022C]=00B0",
  "OP=09 MEM[022D]=00B1",
  "OP=3B MEM[0231]=0001",
  "OP=09 MEM[0232]=00B4",
  "OP=09 MEM[0233]=00B5",
  "OP=3B MEM[0235]=0001",
  "OP=09 MEM[0236]=00B6",
  "OP=09 MEM[0237]=00B7",
  "OP=1E MEM[020D]=0000",
  "OP=1E MEM[0228]=0001",
  "OP=09 MEM[0229]=00AF",
  "OP=09 MEM[0213]=00A7",
  "OP=09 MEM[0214]=00A8",
  "OP=09 MEM[0215]=00A9",
  "OP=09 MEM[021C]=00AB",
  "OP=09 MEM[021D]=00AC",
  "OP=09 MEM[021E]=00AD",
  "OP=29 MEM[0216]=0001",
  "OP=09 MEM[0217]=00AA"
)
Assert-TraceNotContains (Join-Path $run "PARTYCTX.TRC") @(
  "OP=09 MEM[0205]=00A3",
  "OP=09 MEM[020E]=00A6"
)
Assert-TraceContains (Join-Path $run "PARTYG.TRC") @(
  "OP=09 MEM[0202]=00A0",
  "OP=09 MEM[0203]=00A1",
  "OP=09 MEM[0204]=00A2",
  "OP=09 MEM[022E]=00B2",
  "OP=09 MEM[022F]=00B3",
  "OP=3B MEM[0231]=0001",
  "OP=3B MEM[0235]=0001",
  "OP=1E MEM[020D]=0000",
  "OP=1E MEM[0228]=0001",
  "OP=29 MEM[0216]=0001"
)
Assert-TraceNotContains (Join-Path $run "PARTYG.TRC") @(
  "OP=09 MEM[0205]=00A3",
  "OP=09 MEM[020E]=00A6"
)
Assert-TraceContains (Join-Path $run "THIEFMAT.TRC") @(
  "OP=09 MEM[0310]=00C1",
  "OP=09 MEM[0311]=00C2",
  "OP=09 MEM[0312]=00C3",
  "OP=09 MEM[0330]=00C4",
  "OP=09 MEM[0331]=00C5",
  "OP=09 MEM[0332]=00C6"
)
Assert-TraceContains (Join-Path $run "COKGBPR.TRC") @(
  "OP=09 MEM[0310]=00C1",
  "OP=09 MEM[0311]=00C2",
  "OP=09 MEM[0312]=00C3",
  "OP=09 MEM[0330]=00C4",
  "OP=09 MEM[0331]=00C5",
  "OP=09 MEM[0332]=00C6"
)
Assert-TraceContains (Join-Path $run "DOKGBPR.TRC") @(
  "OP=09 MEM[0213]=00A7",
  "OP=09 MEM[0214]=00A8",
  "OP=09 MEM[0215]=00A9"
)
Assert-TraceContains (Join-Path $run "INPUT.TRC") @(
  "OP=0F MEM[0100]=0000",
  "OP=10 MEM[0101]=0000",
  "OP=15 MEM[0102]=0000",
  "OP=09 MEM[0103]=0007",
  "OP=2B MEM[0104]=0000",
  "OP=09 MEM[0105]=0008",
  "OP=39 MEM[0106]=0000",
  "OP=09 MEM[0107]=0009",
  "OP=2C MEM[0108]=000B",
  "OP=09 MEM[0109]=000A",
  "OP=29 MEM[010A]=0001",
  "OP=09 MEM[010B]=000B"
)
Assert-TraceContains (Join-Path $run "INPUTL.TRC") @(
  "OP=0F MEM[0100]=02EE",
  "OP=10 MEM[0101]=02EE",
  "OP=09 MEM[0107]=0009"
)
Assert-TraceContains (Join-Path $run "INPUTW.TRC") @(
  "OP=39 MEM[0106]=0003",
  "OP=09 MEM[0107]=0009"
)
Assert-TraceContains (Join-Path $run "INPUTC.TRC") @(
  "OP=15 MEM[0102]=0001",
  "OP=09 MEM[0103]=0007",
  "OP=2B MEM[0104]=0001",
  "OP=09 MEM[0105]=0008",
  "OP=39 MEM[0106]=0000"
)
Assert-TraceContains (Join-Path $run "INPUTY.TRC") @(
  "OP=2C MEM[0108]=0021",
  "OP=09 MEM[0109]=000A"
)
Assert-TraceContains (Join-Path $run "INPUTO.TRC") @(
  "OP=29 MEM[010A]=0000",
  "OP=09 MEM[010B]=000B"
)
Assert-ScriptEffect (Join-Path $run "INPUT.EFX") @(
  @{ Opcode = 0x0F; Argc = 2; Operands = @(10,0x0100) },
  @{ Opcode = 0x10; Argc = 2; Operands = @(6,0x0101) },
  @{ Opcode = 0x15; Argc = 5; Operands = @(0x0102,4,2,1,1) },
  @{ Opcode = 0x2B; Argc = 4; Operands = @(0x0104,2,1,1) },
  @{ Opcode = 0x39; Argc = 2; Operands = @(0x0106,0) },
  @{ Opcode = 0x2C; Argc = 6; Operands = @(11,22,33,44,55,0x0108) },
  @{ Opcode = 0x29; Argc = 14; Operands = @(9,3,5,0x010A,0,0,2,0) }
)
Assert-ScriptEffect (Join-Path $run "INPUTC.EFX") @(
  @{ Opcode = 0x0F; Argc = 2; Operands = @(10,0x0100) },
  @{ Opcode = 0x10; Argc = 2; Operands = @(6,0x0101) },
  @{ Opcode = 0x15; Argc = 5; Operands = @(0x0102,4,2,1,1) },
  @{ Opcode = 0x2B; Argc = 4; Operands = @(0x0104,2,1,1) },
  @{ Opcode = 0x39; Argc = 2; Operands = @(0x0106,0) },
  @{ Opcode = 0x2C; Argc = 6; Operands = @(11,22,33,44,55,0x0108) },
  @{ Opcode = 0x29; Argc = 14; Operands = @(9,3,5,0x010A,0,0,2,0) }
)
Assert-ScriptEffect (Join-Path $run "INPUTY.EFX") @(
  @{ Opcode = 0x0F; Argc = 2; Operands = @(10,0x0100) },
  @{ Opcode = 0x10; Argc = 2; Operands = @(6,0x0101) },
  @{ Opcode = 0x15; Argc = 5; Operands = @(0x0102,4,2,1,1) },
  @{ Opcode = 0x2B; Argc = 4; Operands = @(0x0104,2,1,1) },
  @{ Opcode = 0x39; Argc = 2; Operands = @(0x0106,0) },
  @{ Opcode = 0x2C; Argc = 6; Operands = @(11,22,33,44,55,0x0108) },
  @{ Opcode = 0x29; Argc = 14; Operands = @(9,3,5,0x010A,0,0,2,0) }
)
Assert-ScriptEffect (Join-Path $run "INPUTW.EFX") @(
  @{ Opcode = 0x0F; Argc = 2; Operands = @(10,0x0100) },
  @{ Opcode = 0x10; Argc = 2; Operands = @(6,0x0101) },
  @{ Opcode = 0x15; Argc = 5; Operands = @(0x0102,4,2,1,1) },
  @{ Opcode = 0x2B; Argc = 4; Operands = @(0x0104,2,1,1) },
  @{ Opcode = 0x39; Argc = 2; Operands = @(0x0106,3) },
  @{ Opcode = 0x2C; Argc = 6; Operands = @(11,22,33,44,55,0x0108) },
  @{ Opcode = 0x29; Argc = 14; Operands = @(9,3,5,0x010A,0,0,2,0) }
)
Assert-ScriptEffect (Join-Path $run "INPUTO.EFX") @(
  @{ Opcode = 0x0F; Argc = 2; Operands = @(10,0x0100) },
  @{ Opcode = 0x10; Argc = 2; Operands = @(6,0x0101) },
  @{ Opcode = 0x15; Argc = 5; Operands = @(0x0102,4,2,1,1) },
  @{ Opcode = 0x2B; Argc = 4; Operands = @(0x0104,2,1,1) },
  @{ Opcode = 0x39; Argc = 2; Operands = @(0x0106,0) },
  @{ Opcode = 0x2C; Argc = 6; Operands = @(11,22,33,44,55,0x0108) },
  @{ Opcode = 0x29; Argc = 14; Operands = @(9,3,5,0x010A,0,0,2,0) }
)
Assert-StableBridgeLoopEffect (Join-Path $run "BRLOOP.EFX") 0x21 16 "LOAD_FILES loop"
Assert-TraceLineLimit (Join-Path $run "BRLOOP.TRC") 80 "LOAD_FILES loop"
Assert-StableBridgeLoopEffect (Join-Path $run "PCLOOP.EFX") 0x03 0 "LOAD_PIECES loop"
Assert-TraceLineLimit (Join-Path $run "PCLOOP.TRC") 80 "LOAD_PIECES loop"
Assert-MemoryOverflowEffect (Join-Path $run "MEMFULL.EFX")
Assert-EncounterCapacityEffect (Join-Path $run "ENCFULL.EFX")
Assert-CallStackEffect (Join-Path $run "GOSUB32.EFX") 0 0 0 0 1 0x0200 0x32
Assert-CallStackEffect (Join-Path $run "GOSUB33.EFX") 4 9 $g33.OverflowPc 0x02 0
Assert-CallStackEffect (Join-Path $run "ON32.EFX") 0 0 0 0 1 0x0200 0x32
Assert-CallStackEffect (Join-Path $run "ON33.EFX") 4 9 $on33.OverflowPc 0x26 0
if (-not (Get-Content (Join-Path $run "ENCFULL.TXT") -Raw).Contains("encounter capacity reached; combat rejected.")) {
  throw "CCECL encounter-capacity smoke failed: ENCFULL did not name the rejected combat"
}
Assert-ScriptCapacityEffect (Join-Path $run "CAPPRINT.EFX") 0x00D6 0x000E "CAPPRINT.EFX"
Assert-ScriptCapacityEffect (Join-Path $run "CAPPFX.EFX") 0x00DD 0x000E "CAPPFX.EFX" 0xFFFF 0x21
Assert-ScriptCapacityEffect (Join-Path $run "CAPDMG.EFX") 0x00D6 0x002E "CAPDMG.EFX"
Assert-ScriptCapacityEffect (Join-Path $run "CAPAWARD.EFX") 0x00D6 0x0041 "CAPAWARD.EFX"
Assert-ScriptCapacityEffect (Join-Path $run "CPPIECES.EFX") 0x00D4 0x0037 "CPPIECES.EFX" 1 0x20 15 5932
& {
  $b = [IO.File]::ReadAllBytes((Join-Path $run "CAPPFX2.EFX"))
  function U16([int]$Offset) { [BitConverter]::ToUInt16($b, $Offset) }
  if (
    $b.Length -ne $GbefLength -or
    [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne "GBEF" -or
    (U16 4) -ne $GbefVersion -or
    (U16 8) -ne 0 -or
    (U16 6) -ne 0x21 -or
    (U16 10) -ne 34 -or
    (U16 12) -ne 34 -or
    (U16 14) -ne 2 -or
    (U16 16) -ne 255 -or
    [Text.Encoding]::ASCII.GetString($b, $GbefScriptOffset, 4) -ne "GBSX" -or
    (U16 ($GbefScriptOffset + 4)) -ne 1 -or
    (U16 ($GbefScriptOffset + 6)) -ne 0x0E -or
    (U16 ($GbefScriptOffset + 8)) -ne 1 -or
    (U16 ($GbefScriptOffset + 10)) -ne 40 -or
    (U16 ($GbefHaltOffset + 4)) -ne 0
  ) {
    throw "CCECL script-capacity replay smoke failed: resumed prefix or first new chunk was wrong"
  }
}
if (-not (Get-Content (Join-Path $run "CAPPR.TXT") -Raw).Contains("script-effect capacity reached; state saved.")) {
  throw "CCECL script-capacity smoke failed: CAPPRINT did not name the saved capacity halt"
}
Assert-TraceLineLimit (Join-Path $run "CAPPRINT.TRC") 64 "CAPPRINT"
Assert-TraceLineLimit (Join-Path $run "CAPAWARD.TRC") 64 "CAPAWARD"
Assert-TraceLineLimit (Join-Path $run "CPPIECES.TRC") 64 "CPPIECES"
if ($capAwardBefore.Length -ne ([IO.File]::ReadAllBytes((Join-Path $run "CAPAWARD.GBP")).Length) -or
    (Compare-Object $capAwardBefore ([IO.File]::ReadAllBytes((Join-Path $run "CAPAWARD.GBP"))) -SyncWindow 0)) {
  throw "CCECL script-capacity smoke failed: CAPAWARD mutated GBPR before its unrecorded 65th effect"
}
Assert-BadOpcodeEffect (Join-Path $run "BADOP.EFX")
Assert-BridgeBadOpcodeEffect (Join-Path $run "BADBRG.EFX")
Assert-BuckB50EncounterExtraEffect (Join-Path $run "BUCKB50.EFX")
Assert-BadOpcodeEffect (Join-Path $run "BUCKB51.EFX") 0x04B1 0x00C9 51
Assert-ScriptEffect (Join-Path $run "BADSCR.EFX") @(
  @{ Opcode = 0x12; Argc = 1; Operands = @(4); Text = "DONE" }
)
Assert-PartySurpriseEffect (Join-Path $run "PARTY.EFX")
Assert-SetupEffect (Join-Path $run "SETUP.EFX")
Assert-SetupEffect (Join-Path $run "SETUPD.EFX") 2
Assert-CombatEffect (Join-Path $run "COMBAT.EFX")
Assert-CombatEffect (Join-Path $run "RESUME.EFX")
Assert-ResumeChain (Join-Path $run "RESPARTY.EFX") 7 "victory branch"
Assert-ResumeChain (Join-Path $run "RESENEMY.EFX") 8 "defeat branch from outcome file"
Assert-ResumeChain (Join-Path $run "RESFLEE.EFX") 9 "flee branch"
if (Compare-Object ([IO.File]::ReadAllBytes((Join-Path $run "RESBEF.EFX"))) ([IO.File]::ReadAllBytes((Join-Path $run "RESUME.EFX"))) -SyncWindow 0) {
  throw "CCECL resume outcome rejection mutated the paused continuation"
}
foreach ($badResume in @("BADO", "TRAIL", "OVR", "MISS")) {
  if ((Get-Content (Join-Path $run "$badResume.RC") -Raw).Trim() -ne "rejected") {
    throw "CCECL resume outcome rejection did not fail $badResume"
  }
  if (Test-Path (Join-Path $run "$badResume.EFX")) {
    throw "CCECL resume outcome rejection wrote a continuation for $badResume"
  }
}
Assert-CombatEffect (Join-Path $run "CLOCK0.EFX")
Assert-ClockEffect (Join-Path $run "CLOCK0.EFX") @(0,9,0,0,0,0,0) "CLOCK0.EFX"
Assert-ClockEffect (Join-Path $run "CLOCK1.EFX") @(0,9,5,0,0,0,0) "CLOCK1.EFX"
Assert-EncounterEffect (Join-Path $run "ENCEFX.EFX")
Assert-ScriptEffect (Join-Path $run "SCRIPT.EFX") @(
  @{ Opcode = 0x27; Argc = 8; Operands = @(1,2,3,4,5,6,7,8) },
  @{ Opcode = 0x28; Argc = 3; Operands = @(9,10,11) },
  @{ Opcode = 0x2E; Argc = 7; Operands = @(0x80,1,2,1,0x80,0,0) },
  @{ Opcode = 0x0E; Argc = 1; Operands = @(39) },
  @{ Opcode = 0x11; Argc = 1; Operands = @(5); Text = "HELLO" },
  @{ Opcode = 0x12; Argc = 1; Operands = @(5); Text = "CLEAR" }
)
Assert-ScriptEffect (Join-Path $run "AWARD.EFX") @(
  @{ Opcode = 0x41; Argc = 2; Operands = @(1,101) },
  @{ Opcode = 0x41; Argc = 2; Operands = @(0,5) }
)
if ((Get-GbprXp (Join-Path $run "AWARD.GBP") 1) -ne 65570 -or
    (Get-GbprXp (Join-Path $run "AWARD.GBP") 2) -ne 131122 -or
    (Get-GbprXp (Join-Path $run "AWARD.GBP") 3) -ne 30) {
  throw "CCECL CoK award-XP smoke failed: party share, selected share, carry, or eligibility diverged"
}
Assert-ScriptEffect (Join-Path $run "DOKAWARD.EFX") @(
  @{ Opcode = 0x41; Argc = 2; Operands = @(1,101) },
  @{ Opcode = 0x41; Argc = 2; Operands = @(0,5) }
)
if ((Get-DokGbprXp (Join-Path $run "DOKAWARD.GBP") 1) -ne 140 -or
    (Get-DokGbprXp (Join-Path $run "DOKAWARD.GBP") 2) -ne 65636 -or
    (Get-DokGbprXp (Join-Path $run "DOKAWARD.GBP") 3) -ne 42 -or
    (Get-DokGbprReady (Join-Path $run "DOKAWARD.GBP") 1) -ne 1 -or
    (Get-DokGbprReady (Join-Path $run "DOKAWARD.GBP") 2) -ne 1 -or
    (Get-DokGbprReady (Join-Path $run "DOKAWARD.GBP") 3) -ne 0x7F) {
  throw "CCECL DoK award-XP smoke failed: member split, selected write, readiness, or zero-slot guard diverged"
}
if ((Get-DokGbprXp (Join-Path $run "DOKNOCACHE.GBP") 1) -ne 90 -or
    (Get-DokGbprReady (Join-Path $run "DOKNOCACHE.GBP") 1) -ne 0x7F) {
  throw "CCECL DoK award-XP wrote a roster without CCPARTY's threshold-cache capability"
}
Assert-ScriptEffect (Join-Path $run "SCRIPT2.EFX") @(
  @{ Opcode = 0x29; Argc = 14; Operands = @(63,64,65,66,67,68,69,70) },
  @{ Opcode = 0x1F; Argc = 2; Operands = @(77,78) },
  # CALL routines 0xAE11 (CoK) and 0xADCC (DoK) are widened from argc 2 to 5 by
  # extend_call_event_redraw (native/src/ccecl.asm, f015c0e 2026-09-10): operands
  # 2..4 are the pose snapshot read from MAP_X/MAP_Y/MAP_DIRECTION (0xC04B/C/D),
  # which this synthetic block never sets, hence 0,0,0. Re-derived from the record
  # contract (2 base words + 3 pose words), NOT transcribed from the engine's dump.
  # The NEXT entry -- routine 0x1001, unknown -- must stay argc 2: that pair is the
  # two-sided pin proving the widening is routine-id-conditional rather than global.
  @{ Opcode = 0x2D; Argc = 5; Operands = @(0x2E10,0xAE11,0,0,0) },
  @{ Opcode = 0x2D; Argc = 5; Operands = @(0x2DCB,0xADCC,0,0,0) },
  @{ Opcode = 0x2D; Argc = 2; Operands = @(0x9000,0x1001) },
  @{ Opcode = 0x31; Argc = 0; Operands = @() },
  @{ Opcode = 0x33; Argc = 0; Operands = @() },
  @{ Opcode = 0x34; Argc = 2; Operands = @(5,2) },
  @{ Opcode = 0x38; Argc = 1; Operands = @(61) },
  @{ Opcode = 0x3A; Argc = 0; Operands = @() },
  @{ Opcode = 0x3D; Argc = 0; Operands = @() }
) 0xA0
Assert-ScriptEffect (Join-Path $run "BUCKEXT.EFX") @(
  @{ Opcode = 0x43; Argc = 1; Operands = @(7) },
  @{ Opcode = 0x45; Argc = 2; Operands = @(8,9) },
  @{ Opcode = 0x46; Argc = 2; Operands = @(10,11) }
)
Assert-BuckGuardEncounterEffect (Join-Path $run "BUCKG43.EFX") $true
Assert-BuckGuardEncounterEffect (Join-Path $run "BUCKG99.EFX") $false
Assert-ClockEffect (Join-Path $run "SCRIPT2.EFX") @(0,0,5,0,0,0,0) "SCRIPT2.EFX"
Assert-ChainEffect (Join-Path $run "CHAIN.EFX") 34
Assert-ChainEffect (Join-Path $run "CHAINGLB.EFX") 44 0x21 0xD002
Assert-ChainEffect (Join-Path $run "CGLIB.EFX") 44 0x21 0xD002
Assert-ScriptEffect (Join-Path $run "CHAINGLB.EFX") @(
  @{ Opcode = 0x2D; Argc = 2; Operands = @(0x0001,0x0001) }
) 0x21
Assert-ScriptEffect (Join-Path $run "CGLIB.EFX") @(
  @{ Opcode = 0x2D; Argc = 2; Operands = @(0x0001,0x0001) }
) 0x21
Assert-ScriptEffect (Join-Path $run "PIECES.EFX") @(
  @{ Opcode = 0x37; Argc = 2; Operands = @(0x11,0x22) },
  @{ Opcode = 0x41; Argc = 2; Operands = @(1,100) }
)

& (Join-Path $native 'ccecl-clock-effects-test.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Synchronous timer regression failed' }
& (Join-Path $native 'ccecl-spell-test.ps1')
if ($LASTEXITCODE -ne 0) { throw 'CoK spell query regression failed' }
Write-Output "RESULT: CCECL /E raw+DAX+chain+HLIB/GLIB-chain effects smoke PASS"
Write-Output "RESULT: CCECL COMBAT resume smoke PASS"
Write-Output "RESULT: CCECL deterministic opcode smoke PASS"
