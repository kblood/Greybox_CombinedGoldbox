# dok-retail-hoststate-scan.ps1 -- heuristic DoK retail host-state reference scan.
#
# Scans the shipped DOS host binaries for little-endian byte occurrences of the
# memory cells that gate the known ECL2/block-51 tactical handoff. This is a
# bounded evidence-gathering pass, not proof that a byte match is executable
# code; runtime watch/debugging still has to prove any candidate writer.
param(
  [string]$GamePath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Death Knights of Krynn'),
  [string[]]$Files = @('START.EXE', 'GAME.OVR'),
  [ValidateRange(4, 64)]
  [int]$Context = 16
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$summaryPath = Join-Path $build '_DOKHOSTREF.TXT'
$csvPath = Join-Path $build '_DOKHOSTREF.CSV'

New-Item -ItemType Directory -Force $build | Out-Null

$targets = @(
  [pscustomobject]@{ Name = 'B51CombatGate'; Addr = 0x4CE9 },
  [pscustomobject]@{ Name = 'B51TrapFlag'; Addr = 0x4CE8 },
  [pscustomobject]@{ Name = 'B51TrapState'; Addr = 0x4CE5 },
  [pscustomobject]@{ Name = 'B51PriorState'; Addr = 0x4C00 },
  [pscustomobject]@{ Name = 'B51Blocker'; Addr = 0x7ED5 },
  [pscustomobject]@{ Name = 'B51DescriptorMasked'; Addr = 0xC04D },
  [pscustomobject]@{ Name = 'B51DescriptorSource'; Addr = 0xC04F },
  [pscustomobject]@{ Name = 'B51SelectorScratch'; Addr = 0x7F79 },
  [pscustomobject]@{ Name = 'B51FacingSource'; Addr = 0xC04E }
)

function Format-HexBytes([byte[]]$Bytes, [int]$Start, [int]$Length) {
  if ($Length -le 0 -or $Start -ge $Bytes.Length) { return '' }
  $s = [Math]::Max(0, $Start)
  $e = [Math]::Min($Bytes.Length, $s + $Length)
  $parts = New-Object System.Collections.Generic.List[string]
  for ($i = $s; $i -lt $e; $i++) {
    $parts.Add($Bytes[$i].ToString('X2'))
  }
  return ($parts -join ' ')
}

function Format-AsciiBytes([byte[]]$Bytes, [int]$Start, [int]$Length) {
  if ($Length -le 0 -or $Start -ge $Bytes.Length) { return '' }
  $s = [Math]::Max(0, $Start)
  $e = [Math]::Min($Bytes.Length, $s + $Length)
  $chars = New-Object System.Collections.Generic.List[string]
  for ($i = $s; $i -lt $e; $i++) {
    $b = [int]$Bytes[$i]
    if ($b -ge 32 -and $b -le 126) {
      $chars.Add([char]$b)
    } else {
      $chars.Add('.')
    }
  }
  return ($chars -join '')
}

function Get-InstructionHint([byte[]]$Bytes, [int]$Offset) {
  if ($Offset -lt $Bytes.Length) {
    $opAt = [int]$Bytes[$Offset]
    if ($opAt -eq 0xE8) {
      return [pscustomobject]@{ Hint = 'near-call-opcode-overlap'; Access = 'control-flow-immediate'; Opcode = 'E8' }
    }
    if ($opAt -eq 0xE9) {
      return [pscustomobject]@{ Hint = 'near-jump-opcode-overlap'; Access = 'control-flow-immediate'; Opcode = 'E9' }
    }
  }
  if ($Offset -ge 1) {
    $op = [int]$Bytes[$Offset - 1]
    switch ($op) {
      0xA0 { return [pscustomobject]@{ Hint = 'moffs8-read'; Access = 'read'; Opcode = 'A0' } }
      0xA1 { return [pscustomobject]@{ Hint = 'moffs16-read'; Access = 'read'; Opcode = 'A1' } }
      0xA2 { return [pscustomobject]@{ Hint = 'moffs8-write'; Access = 'write'; Opcode = 'A2' } }
      0xA3 { return [pscustomobject]@{ Hint = 'moffs16-write'; Access = 'write'; Opcode = 'A3' } }
    }
  }
  if ($Offset -ge 2 -and [int]$Bytes[$Offset - 1] -eq 0x06) {
    $op = [int]$Bytes[$Offset - 2]
    switch ($op) {
      0x80 { return [pscustomobject]@{ Hint = 'grp8-direct-memory'; Access = 'readwrite'; Opcode = '80/06' } }
      0x81 { return [pscustomobject]@{ Hint = 'grp16-direct-memory'; Access = 'readwrite'; Opcode = '81/06' } }
      0x83 { return [pscustomobject]@{ Hint = 'grp16imm8-direct-memory'; Access = 'readwrite'; Opcode = '83/06' } }
      0x88 { return [pscustomobject]@{ Hint = 'mov-r8-to-direct-memory'; Access = 'write'; Opcode = '88/06' } }
      0x89 { return [pscustomobject]@{ Hint = 'mov-r16-to-direct-memory'; Access = 'write'; Opcode = '89/06' } }
      0x8A { return [pscustomobject]@{ Hint = 'mov-direct-memory-to-r8'; Access = 'read'; Opcode = '8A/06' } }
      0x8B { return [pscustomobject]@{ Hint = 'mov-direct-memory-to-r16'; Access = 'read'; Opcode = '8B/06' } }
      0xC6 { return [pscustomobject]@{ Hint = 'mov-imm8-to-direct-memory'; Access = 'write'; Opcode = 'C6/06' } }
      0xC7 { return [pscustomobject]@{ Hint = 'mov-imm16-to-direct-memory'; Access = 'write'; Opcode = 'C7/06' } }
      0xF6 { return [pscustomobject]@{ Hint = 'test/not/neg/direct-memory8'; Access = 'readwrite'; Opcode = 'F6/06' } }
      0xF7 { return [pscustomobject]@{ Hint = 'test/not/neg/direct-memory16'; Access = 'readwrite'; Opcode = 'F7/06' } }
      0xFE { return [pscustomobject]@{ Hint = 'inc/dec-direct-memory8'; Access = 'readwrite'; Opcode = 'FE/06' } }
      0xFF { return [pscustomobject]@{ Hint = 'inc/dec/call/jmp-direct-memory16'; Access = 'readwrite'; Opcode = 'FF/06' } }
    }
  }
  $prev = if ($Offset -ge 1) { $Bytes[$Offset - 1].ToString('X2') } else { '' }
  return [pscustomobject]@{ Hint = 'raw-byte-match'; Access = 'unknown'; Opcode = $prev }
}

if (-not (Test-Path -LiteralPath $GamePath)) {
  Write-Output "SKIP: DoK retail host-state scan (game path absent: $GamePath)"
  exit 0
}

$rows = New-Object System.Collections.Generic.List[object]
$scannedFiles = New-Object System.Collections.Generic.List[string]
foreach ($file in $Files) {
  $path = Join-Path $GamePath $file
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Output "SKIP: DoK retail host-state scan ($file absent)"
    exit 0
  }
  $bytes = [IO.File]::ReadAllBytes($path)
  $scannedFiles.Add(("{0}:{1}" -f $file, $bytes.Length))
  foreach ($target in $targets) {
    $lo = [byte]($target.Addr -band 0xff)
    $hi = [byte](($target.Addr -shr 8) -band 0xff)
    for ($i = 0; $i -le ($bytes.Length - 2); $i++) {
      if ($bytes[$i] -ne $lo -or $bytes[$i + 1] -ne $hi) { continue }
      $hint = Get-InstructionHint $bytes $i
      $contextStart = [Math]::Max(0, $i - $Context)
      $contextEnd = [Math]::Min($bytes.Length, $i + 2 + $Context)
      $rows.Add([pscustomobject]@{
        File = $file
        FileSize = $bytes.Length
        Offset = ('{0:X6}' -f $i)
        Addr = ('{0:X4}' -f $target.Addr)
        Name = $target.Name
        Pattern = ('{0:X2} {1:X2}' -f $lo, $hi)
        AccessHint = $hint.Access
        InstructionHint = $hint.Hint
        OpcodeHint = $hint.Opcode
        BytesBefore = (Format-HexBytes $bytes ($i - $Context) $Context)
        MatchBytes = (Format-HexBytes $bytes $i 2)
        BytesAfter = (Format-HexBytes $bytes ($i + 2) $Context)
        AsciiContext = (Format-AsciiBytes $bytes $contextStart ($contextEnd - $contextStart))
      })
    }
  }
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK retail host-state byte-reference scan')
$summary.Add("GamePath=$GamePath")
$summary.Add("Files=$($scannedFiles -join ',')")
$summary.Add("Context=$Context")
$summary.Add("TotalHits=$($rows.Count)")
foreach ($target in $targets) {
  $addr = ('{0:X4}' -f $target.Addr)
  $hits = @($rows | Where-Object { $_.Addr -eq $addr })
  $summary.Add(("Hits_{0}_{1}={2}" -f $addr, $target.Name, $hits.Count))
}
$direct = @($rows | Where-Object { $_.InstructionHint -ne 'raw-byte-match' })
$writes = @($rows | Where-Object { $_.AccessHint -in @('write', 'readwrite') })
$gateWrites = @($writes | Where-Object { $_.Addr -eq '4CE9' })
$summary.Add("InstructionHintHits=$($direct.Count)")
$summary.Add("PotentialWriteHits=$($writes.Count)")
$summary.Add("Potential4CE9WriteHits=$($gateWrites.Count)")
if ($direct.Count -gt 0) {
  foreach ($group in ($direct | Group-Object File, Addr, AccessHint, InstructionHint | Sort-Object Count -Descending | Select-Object -First 20)) {
    $row = $group.Group[0]
    $summary.Add(("Hint count={0} file={1} addr={2} access={3} kind={4}" -f $group.Count, $row.File, $row.Addr, $row.AccessHint, $row.InstructionHint))
  }
}
if ($gateWrites.Count -gt 0) {
  $summary.Add('Result=Potential 4CE9 retail writer byte matches exist; next step is a runtime watch to prove which hit executes before ECL2 block 51 selector 29')
} elseif ((@($rows | Where-Object { $_.Addr -eq '4CE9' })).Count -gt 0) {
  $summary.Add('Result=4CE9 byte matches exist, but none match the simple direct-write instruction hints; runtime watch or deeper disassembly is still required')
} else {
  $summary.Add('Result=No 4CE9 byte matches in the scanned retail binaries; the gate source may be computed, relocated, outside START.EXE/GAME.OVR, or absent from this bounded scan')
}
$summary.Add('Caution=This scan matches raw little-endian bytes. Only the instruction hints are lightweight x86 pattern matches, and even those are not execution proof.')
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

if ($rows.Count -gt 0) {
  $rows |
    Sort-Object File, Addr, Offset |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $csvPath -Encoding ASCII
} else {
  Set-Content -Path $csvPath -Encoding ASCII -Value 'File,FileSize,Offset,Addr,Name,Pattern,AccessHint,InstructionHint,OpcodeHint,BytesBefore,MatchBytes,BytesAfter,AsciiContext'
}

Write-Output ("[DOKHOSTREF] files={0} hits={1} instructionHints={2} potentialWrites={3} potential4CE9Writes={4}" -f $Files.Count, $rows.Count, $direct.Count, $writes.Count, $gateWrites.Count)
Write-Output 'RESULT: DoK retail host-state byte-reference scan completed'
