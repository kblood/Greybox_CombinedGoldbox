# ccecl-buck-b50-decode.ps1 -- diagnostic-only Buck Rogers ECL2 block-50 byte dump.
#
# Reads the local Buck Rogers Countdown ECL2.DAX, expands block 50 with the same
# SSI DAX RLE used by native/src/ccecl.asm, then prints hex bytes and possible
# ECL instruction framing around a few offsets of interest. This script does not
# build or invoke DOSBox/CCECL and intentionally makes no semantic changes.
param(
  [string]$BuckPath = $env:GOLDBOX_BUCK_PATH,
  [int]$BlockId = 50,
  [int[]]$Offsets = @(0x040d, 0x0438, 0x045e, 0x048d, 0x04b1),
  [int]$Window = 24,
  [int]$CandidateRadius = 8
)

$ErrorActionPreference = 'Stop'

if (-not $BuckPath) {
  $BuckPath = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\B\BuckRogersCountdownDday\data'
}

$eclPath = Join-Path $BuckPath 'ECL2.DAX'
if (-not (Test-Path $BuckPath)) {
  Write-Output "SKIP: Buck ECL2 block decode ($BuckPath absent; set GOLDBOX_BUCK_PATH to run)"
  exit 0
}
if (-not (Test-Path $eclPath)) {
  Write-Output "SKIP: Buck ECL2 block decode (ECL2.DAX absent under $BuckPath)"
  exit 0
}

function Format-HexByte([int]$Value) {
  return ('{0:X2}' -f ($Value -band 0xff))
}

function Format-HexWord([int]$Value) {
  return ('{0:X4}' -f ($Value -band 0xffff))
}

function Read-U16LE([byte[]]$Bytes, [int]$Offset) {
  if ($Offset + 1 -ge $Bytes.Length) { throw "Read-U16LE past end at $Offset" }
  return [int]([BitConverter]::ToUInt16($Bytes, $Offset))
}

function Read-U32LE([byte[]]$Bytes, [int]$Offset) {
  if ($Offset + 3 -ge $Bytes.Length) { throw "Read-U32LE past end at $Offset" }
  return [uint32]([BitConverter]::ToUInt32($Bytes, $Offset))
}

function Expand-DaxRle([byte[]]$Comp, [int]$Expected) {
  $out = New-Object byte[] $Expected
  $i = 0
  $o = 0
  while ($i -lt $Comp.Length -and $o -lt $Expected) {
    $control = [int]$Comp[$i]
    $i++
    if ($control -lt 0x80) {
      $count = $control + 1
      for ($k = 0; $k -lt $count -and $i -lt $Comp.Length -and $o -lt $Expected; $k++) {
        $out[$o] = $Comp[$i]
        $i++
        $o++
      }
    } else {
      $count = 256 - $control
      if ($i -ge $Comp.Length) { break }
      $value = $Comp[$i]
      $i++
      for ($k = 0; $k -lt $count -and $o -lt $Expected; $k++) {
        $out[$o] = $value
        $o++
      }
    }
  }
  return [pscustomobject]@{
    Raw = $out
    Consumed = $i
    Produced = $o
    Complete = ($o -eq $Expected)
  }
}

function Get-DaxBlock([string]$Path, [int]$WantedId) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 2) { throw "DAX file too short: $Path" }
  $tocBytes = Read-U16LE $bytes 0
  if ($tocBytes -le 0 -or ($tocBytes % 9) -ne 0 -or $bytes.Length -lt (2 + $tocBytes)) {
    throw "DAX TOC has invalid length in $Path"
  }

  $base = 2 + $tocBytes
  $count = [int]($tocBytes / 9)
  for ($i = 0; $i -lt $count; $i++) {
    $entryOffset = 2 + ($i * 9)
    $id = [int]$bytes[$entryOffset]
    $dataOffset = [int](Read-U32LE $bytes ($entryOffset + 1))
    $rawSize = Read-U16LE $bytes ($entryOffset + 5)
    $compSize = Read-U16LE $bytes ($entryOffset + 7)
    $absolute = $base + $dataOffset
    if ($absolute -lt 0 -or $compSize -lt 0 -or ($absolute + $compSize) -gt $bytes.Length) {
      throw "DAX block $id points outside file bounds in $Path"
    }
    if ($id -ne $WantedId) { continue }

    $comp = New-Object byte[] $compSize
    [Array]::Copy($bytes, $absolute, $comp, 0, $compSize)
    $expanded = Expand-DaxRle $comp $rawSize
    return [pscustomobject]@{
      Id = $id
      Index = $i
      RawSize = $rawSize
      CompSize = $compSize
      DataOffset = $dataOffset
      FileOffset = $absolute
      Raw = $expanded.Raw
      Produced = $expanded.Produced
      Complete = $expanded.Complete
    }
  }

  throw "Block $WantedId not found in $Path"
}

function Decode-EclString([byte[]]$Raw, [int]$Offset, [int]$PackedLength) {
  $end = [Math]::Min($Raw.Length, $Offset + $PackedLength)
  $acc = 0
  $bits = 0
  $chars = New-Object System.Collections.Generic.List[char]
  for ($i = $Offset; $i -lt $end; $i++) {
    $acc = (($acc -shl 8) -bor [int]$Raw[$i]) -band 0xffffff
    $bits += 8
    while ($bits -ge 6) {
      $bits -= 6
      $v = ($acc -shr $bits) -band 0x3f
      if ($v -eq 0) { return -join $chars }
      if ($v -ge 1 -and $v -le 31) {
        $chars.Add([char]($v + 64)) | Out-Null
      } else {
        $chars.Add([char]$v) | Out-Null
      }
    }
  }
  return -join $chars
}

function New-OpcodeTable {
  $defs = @(
    @(0x00, 0, -1, 'EXIT'), @(0x01, 1, -1, 'GOTO'), @(0x02, 1, -1, 'GOSUB'),
    @(0x03, 2, -1, 'COMPARE'), @(0x04, 3, -1, 'ADD'), @(0x05, 3, -1, 'SUBTRACT'),
    @(0x06, 3, -1, 'DIVIDE'), @(0x07, 3, -1, 'MULTIPLY'), @(0x08, 2, -1, 'RANDOM'),
    @(0x09, 2, -1, 'SAVE'), @(0x0a, 1, -1, 'LOAD_CHARACTER'), @(0x0b, 3, -1, 'LOAD_MONSTER'),
    @(0x0c, 3, -1, 'SETUP_MONSTER'), @(0x0d, 0, -1, 'APPROACH'), @(0x0e, 1, -1, 'PICTURE'),
    @(0x0f, 2, -1, 'INPUT_NUMBER'), @(0x10, 2, -1, 'INPUT_STRING'), @(0x11, 1, -1, 'PRINT'),
    @(0x12, 1, -1, 'PRINTCLEAR'), @(0x13, 0, -1, 'RETURN'), @(0x14, 4, -1, 'COMPARE_AND'),
    @(0x15, 3, 2, 'VERTICAL_MENU'), @(0x16, 0, -1, 'IF_EQ'), @(0x17, 0, -1, 'IF_NE'),
    @(0x18, 0, -1, 'IF_LT'), @(0x19, 0, -1, 'IF_GT'), @(0x1a, 0, -1, 'IF_LE'),
    @(0x1b, 0, -1, 'IF_GE'), @(0x1c, 0, -1, 'CLEARMONSTERS'), @(0x1d, 1, -1, 'PARTYSTRENGTH'),
    @(0x1e, 6, -1, 'CHECKPARTY'), @(0x1f, 2, -1, 'UNKNOWN_1F'), @(0x20, 1, -1, 'NEWECL'),
    @(0x21, 3, -1, 'LOAD_FILES'), @(0x22, 2, -1, 'PARTY_SURPRISE'), @(0x23, 4, -1, 'SURPRISE'),
    @(0x24, 0, -1, 'COMBAT'), @(0x25, 2, 1, 'ON_GOTO'), @(0x26, 2, 1, 'ON_GOSUB'),
    @(0x27, 8, -1, 'TREASURE'), @(0x28, 3, -1, 'ROB'), @(0x29, 14, -1, 'ENCOUNTER_MENU'),
    @(0x2a, 3, -1, 'GETTABLE'), @(0x2b, 2, 1, 'HORIZONTAL_MENU'), @(0x2c, 6, -1, 'PARLAY'),
    @(0x2d, 1, -1, 'CALL'), @(0x2e, 5, -1, 'DAMAGE'), @(0x2f, 3, -1, 'AND'),
    @(0x30, 3, -1, 'OR'), @(0x31, 0, -1, 'SPRITE_OFF'), @(0x32, 1, -1, 'FIND_ITEM'),
    @(0x33, 0, -1, 'PRINT_RETURN'), @(0x34, 2, -1, 'ECL_CLOCK'), @(0x35, 3, -1, 'SAVE_TABLE'),
    @(0x36, 2, -1, 'ADD_NPC'), @(0x37, 3, -1, 'LOAD_PIECES'), @(0x38, 1, -1, 'PROGRAM'),
    @(0x39, 1, -1, 'WHO'), @(0x3a, 0, -1, 'DELAY'), @(0x3b, 3, -1, 'SPELL'),
    @(0x3c, 1, -1, 'PROTECTION'), @(0x3d, 0, -1, 'CLEAR_BOX'), @(0x3e, 0, -1, 'DUMP'),
    @(0x3f, 1, -1, 'FIND_SPECIAL'), @(0x40, 1, -1, 'DESTROY_ITEMS'),
    @(0x42, 0, -1, 'BUCK_EXT_42'), @(0x43, 1, -1, 'BUCK_EXT_43'),
    @(0x45, 2, -1, 'BUCK_EXT_45'), @(0x46, 2, -1, 'BUCK_EXT_46'),
    @(0x4b, 0, -1, 'BUCK_EXT_4B'), @(0x4c, 0, -1, 'BUCK_EXT_4C')
  )
  $table = @{}
  foreach ($d in $defs) {
    $table[[int]$d[0]] = [pscustomobject]@{
      WordSet = [int]$d[1]
      CountAt = [int]$d[2]
      Mnemonic = [string]$d[3]
    }
  }
  return $table
}

$OpcodeTable = New-OpcodeTable

function Read-EclOperand([byte[]]$Raw, [ref]$Pos) {
  $start = $Pos.Value
  if ($start + 1 -ge $Raw.Length) {
    return [pscustomobject]@{ Truncated = $true; Start = $start; Size = [Math]::Max(0, $Raw.Length - $start) }
  }

  $code = [int]$Raw[$start]
  $high = [int]$Raw[$start + 1]
  $Pos.Value = $start + 2
  $val = $null
  $word = $high
  if ($code -eq 0x01 -or $code -eq 0x02 -or $code -eq 0x03 -or $code -eq 0x81) {
    if ($Pos.Value -ge $Raw.Length) {
      return [pscustomobject]@{ Truncated = $true; Start = $start; Code = $code; High = $high; Size = $Pos.Value - $start }
    }
    $val = [int]$Raw[$Pos.Value]
    $Pos.Value++
    $word = (($val -shl 8) -bor $high) -band 0xffff
  }

  $text = $null
  if ($code -eq 0x80) {
    $textOffset = $Pos.Value
    $text = Decode-EclString $Raw $textOffset $high
    $Pos.Value += $high
    if ($Pos.Value -gt $Raw.Length) {
      return [pscustomobject]@{ Truncated = $true; Start = $start; Code = $code; High = $high; Word = $word; Text = $text; Size = $Pos.Value - $start }
    }
  }

  return [pscustomobject]@{
    Truncated = $false
    Start = $start
    Code = $code
    High = $high
    Val = $val
    Word = $word
    Text = $text
    Size = $Pos.Value - $start
  }
}

function Format-EclOperand($Operand) {
  if ($Operand.Truncated) { return '<truncated>' }
  $code = [int]$Operand.Code
  $word = [int]$Operand.Word
  switch ($code) {
    0x00 { return "#{0}" -f $Operand.High }
    0x01 { return "w:{0}" -f (Format-HexWord $word) }
    0x02 { return "v2:{0}" -f (Format-HexWord $word) }
    0x03 { return "v3:{0}" -f (Format-HexWord $word) }
    0x09 { return "f:{0}" -f $Operand.High }
    0x80 {
      $text = [string]$Operand.Text
      if ($text.Length -gt 40) { $text = $text.Substring(0, 40) + '...' }
      return "txt[{0}]=""{1}""" -f $Operand.High, $text
    }
    0x81 { return "strptr:{0}" -f (Format-HexWord $word) }
    default { return "c{0:X2}:{1}" -f $code, $Operand.High }
  }
}

function Decode-EclInstructionAt([byte[]]$Raw, [int]$Offset) {
  if ($Offset -lt 0 -or $Offset -ge $Raw.Length) { return $null }
  $opcode = [int]$Raw[$Offset]
  if (-not $OpcodeTable.ContainsKey($opcode)) {
    return [pscustomobject]@{
      Offset = $Offset
      Opcode = $opcode
      Valid = $false
      Reason = 'unknown opcode'
    }
  }

  $def = $OpcodeTable[$opcode]
  $mnemonic = [string]$def.Mnemonic
  $pos = $Offset + 1
  $args = New-Object System.Collections.Generic.List[object]
  $truncated = $false
  $fixed = [int]$def.WordSet
  if ($BlockId -eq 50 -and $Offset -eq 0x048e -and $opcode -eq 0x29) {
    $fixed = 15
    $mnemonic = 'ENCOUNTER_MENU_BUCK_B50'
  }
  for ($i = 0; $i -lt $fixed; $i++) {
    $op = Read-EclOperand $Raw ([ref]$pos)
    $args.Add($op) | Out-Null
    if ($op.Truncated) { $truncated = $true; break }
  }

  if (-not $truncated -and [int]$def.CountAt -ge 0) {
    $countAt = [int]$def.CountAt
    $extra = 0
    if ($countAt -lt $args.Count -and -not $args[$countAt].Truncated) {
      $extra = [int]$args[$countAt].Word
    }
    if ($extra -gt 64) {
      return [pscustomobject]@{
        Offset = $Offset
        Opcode = $opcode
        Valid = $false
        Reason = "unreasonable count-driven operand count $extra"
      }
    }
    for ($i = 0; $i -lt $extra; $i++) {
      $op = Read-EclOperand $Raw ([ref]$pos)
      $args.Add($op) | Out-Null
      if ($op.Truncated) { $truncated = $true; break }
    }
  }

  return [pscustomobject]@{
    Offset = $Offset
    Vaddr = (0x7ffe + $Offset) -band 0xffff
    Opcode = $opcode
    Mnemonic = $mnemonic
    Args = $args.ToArray()
    Size = $pos - $Offset
    Next = $pos
    Valid = (-not $truncated -and $pos -le $Raw.Length)
    Truncated = $truncated
  }
}

function Format-InstructionCandidate($Candidate) {
  if ($null -eq $Candidate) { return '<null>' }
  if (-not $Candidate.Valid) {
    return ("{0} VA={1} OP={2} invalid: {3}" -f
      (Format-HexWord $Candidate.Offset),
      (Format-HexWord ((0x7ffe + $Candidate.Offset) -band 0xffff)),
      (Format-HexByte $Candidate.Opcode),
      $Candidate.Reason)
  }
  $args = @($Candidate.Args | ForEach-Object { Format-EclOperand $_ })
  $argText = $args -join ', '
  return ("{0} VA={1} OP={2} {3} size={4} next={5}{6}" -f
    (Format-HexWord $Candidate.Offset),
    (Format-HexWord $Candidate.Vaddr),
    (Format-HexByte $Candidate.Opcode),
    $Candidate.Mnemonic,
    $Candidate.Size,
    (Format-HexWord $Candidate.Next),
    ($(if ($argText) { " args=[$argText]" } else { '' })))
}

function Write-HexDump([byte[]]$Raw, [int]$Start, [int]$Length) {
  $first = [Math]::Max(0, $Start)
  $last = [Math]::Min($Raw.Length, $Start + $Length)
  for ($row = $first; $row -lt $last; $row += 16) {
    $rowEnd = [Math]::Min($last, $row + 16)
    $hex = New-Object System.Collections.Generic.List[string]
    $ascii = New-Object System.Text.StringBuilder
    for ($i = $row; $i -lt $rowEnd; $i++) {
      $b = [int]$Raw[$i]
      $hex.Add((Format-HexByte $b)) | Out-Null
      if ($b -ge 0x20 -and $b -le 0x7e) {
        [void]$ascii.Append([char]$b)
      } else {
        [void]$ascii.Append('.')
      }
    }
    Write-Output ("  {0}: {1,-47}  {2}" -f (Format-HexWord $row), ($hex -join ' '), $ascii.ToString())
  }
}

function Format-FarPointer([byte[]]$Raw, [int]$Slot) {
  $slotOffset = 2 + ($Slot * 4)
  if ($slotOffset + 3 -ge $Raw.Length) { return '<missing>' }
  $segment = Read-U16LE $Raw $slotOffset
  $vaddr = Read-U16LE $Raw ($slotOffset + 2)
  $offset = ($vaddr - 0x7ffe) -band 0xffff
  return ("seg={0} vaddr={1} offset={2}" -f (Format-HexWord $segment), (Format-HexWord $vaddr), (Format-HexWord $offset))
}

$block = Get-DaxBlock $eclPath $BlockId
$raw = [byte[]]$block.Raw

Write-Output ("BuckPath={0}" -f $BuckPath)
Write-Output ("File={0}" -f $eclPath)
Write-Output ("DAX block id={0} index={1} fileOffset={2} dataOffset={3} compSize={4} rawSize={5} produced={6} complete={7}" -f `
  $block.Id, $block.Index, (Format-HexWord $block.FileOffset), (Format-HexWord $block.DataOffset), $block.CompSize, $block.RawSize, $block.Produced, $block.Complete)

if ($raw.Length -ge 22) {
  Write-Output ("Header magic={0}" -f (Format-HexWord (Read-U16LE $raw 0)))
  Write-Output ("Header vmRun1:          {0}" -f (Format-FarPointer $raw 0))
  Write-Output ("Header SearchLocation:  {0}" -f (Format-FarPointer $raw 1))
  Write-Output ("Header PreCampCheck:    {0}" -f (Format-FarPointer $raw 2))
  Write-Output ("Header CampInterrupted: {0}" -f (Format-FarPointer $raw 3))
  Write-Output ("Header Initial:         {0}" -f (Format-FarPointer $raw 4))
}

Write-Output ''
Write-Output 'Offsets are raw decompressed block offsets; VA = 0x7FFE + offset.'

foreach ($target in $Offsets) {
  Write-Output ''
  Write-Output ("== Around offset {0} (VA {1}) ==" -f (Format-HexWord $target), (Format-HexWord ((0x7ffe + $target) -band 0xffff)))
  Write-Output 'Bytes:'
  Write-HexDump $raw ($target - $Window) (($Window * 2) + 1)

  Write-Output 'Instruction candidates:'
  $candidates = New-Object System.Collections.Generic.List[object]
  for ($start = $target - $CandidateRadius; $start -le $target + $CandidateRadius; $start++) {
    $candidate = Decode-EclInstructionAt $raw $start
    if ($null -ne $candidate) {
      $candidate | Add-Member -NotePropertyName Distance -NotePropertyValue ([Math]::Abs($start - $target))
      $candidates.Add($candidate) | Out-Null
    }
  }
  foreach ($candidate in ($candidates.ToArray() | Sort-Object Distance, Offset | Select-Object -First 12)) {
    $marker = if ($candidate.Offset -eq $target) { '*' } else { ' ' }
    Write-Output (" {0} {1}" -f $marker, (Format-InstructionCandidate $candidate))
  }
}
