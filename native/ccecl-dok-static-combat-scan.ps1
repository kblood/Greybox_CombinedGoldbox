# ccecl-dok-static-combat-scan.ps1 -- static DoK ECL combat candidate audit.
#
# Conservatively walks Gen1 ECL control flow from all five far-pointer entries
# and records whether COMBAT is reached with queued LOAD_MONSTER groups. It also
# audits the shipped DoK GEO plane-2 cell descriptors for the known seeded
# ECL2/block-51 vmRun1 cell word. This is a reachability aide for the remaining
# DoK natural-combat gap; runtime route scans still decide whether a candidate
# is naturally reachable under real host state.
param()
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$summaryPath = Join-Path $build '_DOKSTATIC.TXT'
$combatCsvPath = Join-Path $build '_DOKSTATIC_COMBAT.CSV'
$refsCsvPath = Join-Path $build '_DOKSTATIC_REFS.CSV'
$geoCsvPath = Join-Path $build '_DOKSTATIC_GEO29.CSV'

New-Item -ItemType Directory -Force $build | Out-Null

foreach ($name in @('ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: DoK static combat scan ($name absent)"
    exit 0
  }
}

$wordSets = @{
  0x00=0; 0x01=1; 0x02=1; 0x03=2; 0x04=3; 0x05=3; 0x06=3; 0x07=3
  0x08=2; 0x09=2; 0x0a=1; 0x0b=3; 0x0c=3; 0x0d=0; 0x0e=1
  0x0f=2; 0x10=2; 0x11=1; 0x12=1; 0x13=0; 0x14=4; 0x15=3
  0x16=0; 0x17=0; 0x18=0; 0x19=0; 0x1a=0; 0x1b=0; 0x1c=0
  0x1d=1; 0x1e=6; 0x1f=2; 0x20=1; 0x21=3; 0x22=2; 0x23=4
  0x24=0; 0x25=2; 0x26=2; 0x27=8; 0x28=3; 0x29=14; 0x2a=3
  0x2b=2; 0x2c=6; 0x2d=1; 0x2e=5; 0x2f=3; 0x30=3; 0x31=0
  0x32=1; 0x33=0; 0x34=2; 0x35=3; 0x36=2; 0x37=3; 0x38=1
  0x39=1; 0x3a=0; 0x3b=3; 0x3c=1; 0x3d=0; 0x3e=0; 0x3f=1; 0x40=1
}
$countAt = @{ 0x15=2; 0x25=1; 0x26=1; 0x2b=1 }
$names = @{
  0='vmRun1'; 1='SearchLocation'; 2='PreCampCheck'; 3='CampInterrupted'; 4='Initial'
}

function Expand-DaxRle([byte[]]$Comp, [int]$Expected) {
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

function Get-DaxBlocks([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 2) { throw "DAX file too short: $Path" }
  $tocBytes = [BitConverter]::ToUInt16($bytes, 0)
  if ($tocBytes -le 0 -or ($tocBytes % 9) -ne 0 -or $bytes.Length -lt (2 + $tocBytes)) {
    throw "DAX TOC has invalid length in $Path"
  }
  $base = 2 + $tocBytes
  $count = [int]($tocBytes / 9)
  $blocks = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $count; $i++) {
    $off = 2 + ($i * 9)
    $id = [int]$bytes[$off]
    $dataOff = [BitConverter]::ToUInt32($bytes, $off + 1)
    $rawSize = [BitConverter]::ToUInt16($bytes, $off + 5)
    $compSize = [BitConverter]::ToUInt16($bytes, $off + 7)
    $comp = New-Object byte[] $compSize
    [Array]::Copy($bytes, $base + [int]$dataOff, $comp, 0, $compSize)
    $blocks.Add([pscustomobject]@{
      Id = $id
      Raw = (Expand-DaxRle $comp $rawSize)
    })
  }
  return $blocks.ToArray()
}

function Read-Opp([byte[]]$Raw, [ref]$Pos) {
  if ($Pos.Value -ge $Raw.Length) { return $null }
  $code = [int]$Raw[$Pos.Value]
  $high = if (($Pos.Value + 1) -lt $Raw.Length) { [int]$Raw[$Pos.Value + 1] } else { 0 }
  $Pos.Value += 2
  $val = $null
  if ($code -eq 1 -or $code -eq 2 -or $code -eq 3 -or $code -eq 0x81) {
    $val = if ($Pos.Value -lt $Raw.Length) { [int]$Raw[$Pos.Value] } else { 0 }
    $Pos.Value++
    $word = (($val -shl 8) -bor $high) -band 0xffff
  } else {
    $word = $high
  }
  if ($code -eq 0x80) {
    $Pos.Value += $high
  }
  return [pscustomobject]@{ Code = $code; Word = $word }
}

function Decode-Instruction([byte[]]$Raw, [int]$Pc) {
  if ($Pc -lt 22 -or $Pc -ge $Raw.Length) { return $null }
  $op = [int]$Raw[$Pc]
  if (-not $wordSets.ContainsKey($op)) { return $null }
  $pos = $Pc + 1
  $args = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt [int]$wordSets[$op]; $i++) {
    $p = [ref]$pos
    $a = Read-Opp $Raw $p
    $pos = $p.Value
    if ($null -eq $a) { return $null }
    $args.Add($a)
  }
  if ($countAt.ContainsKey($op)) {
    $idx = [int]$countAt[$op]
    $n = if ($idx -lt $args.Count) { [int]$args[$idx].Word } else { 0 }
    for ($i = 0; $i -lt $n; $i++) {
      $p = [ref]$pos
      $a = Read-Opp $Raw $p
      $pos = $p.Value
      if ($null -eq $a) { return $null }
      $args.Add($a)
    }
  }
  return [pscustomobject]@{ Pc = $Pc; Op = $op; Next = $pos; Args = $args.ToArray() }
}

function Target-Offset([int]$Word) {
  if ($Word -ge 0x7ffe) { return $Word - 0x7ffe }
  return $Word
}

function Queue-Key($Queue) {
  if (-not $Queue -or $Queue.Count -eq 0) { return '' }
  return (($Queue | ForEach-Object { '{0}:{1}:{2}' -f $_.Id,$_.Count,$_.Pic }) -join ',')
}

function Format-Ins($Ins) {
  $argText = if ($Ins.Args.Count -gt 0) {
    ($Ins.Args | ForEach-Object { '{0:X4}' -f ([int]$_.Word) }) -join ','
  } else {
    ''
  }
  if ($argText.Length -gt 0) {
    return ('{0:X4}:{1:X2}({2})' -f $Ins.Pc,$Ins.Op,$argText)
  }
  return ('{0:X4}:{1:X2}' -f $Ins.Pc,$Ins.Op)
}

function Is-MemOperand($Arg) {
  return $Arg.Code -eq 1 -or $Arg.Code -eq 2 -or $Arg.Code -eq 3 -or $Arg.Code -eq 0x7f
}

function Format-Arg($Arg) {
  return ('code={0:X2} word={1:X4}' -f ([int]$Arg.Code), ([int]$Arg.Word))
}

function Add-MemRef($Refs, [string]$File, [int]$Block, $Ins, [string]$Access, [int]$ArgIndex, [int]$Addr, [string]$Detail) {
  $Refs.Add([pscustomobject]@{
    File = $File
    Block = $Block
    Pc = ('{0:X4}' -f $Ins.Pc)
    Op = ('{0:X2}' -f $Ins.Op)
    Access = $Access
    Arg = $ArgIndex
    Addr = ('{0:X4}' -f ($Addr -band 0xffff))
    Detail = $Detail
  })
}

function Track-ReadArgs($Refs, [string]$File, [int]$Block, $Ins, [int[]]$Indexes, $Interest) {
  foreach ($i in $Indexes) {
    if ($i -ge $Ins.Args.Count) { continue }
    $a = $Ins.Args[$i]
    if ((Is-MemOperand $a) -and $Interest.ContainsKey([int]$a.Word)) {
      Add-MemRef $Refs $File $Block $Ins 'read' $i ([int]$a.Word) (Format-Arg $a)
    }
  }
}

function Track-WriteArg($Refs, [string]$File, [int]$Block, $Ins, [int]$Index, $Interest, [string]$DetailPrefix) {
  if ($Index -ge $Ins.Args.Count) { return }
  $a = $Ins.Args[$Index]
  if ((Is-MemOperand $a) -and $Interest.ContainsKey([int]$a.Word)) {
    Add-MemRef $Refs $File $Block $Ins 'write' $Index ([int]$a.Word) ("$DetailPrefix " + (Format-Arg $a))
  }
}

function Find-MemoryReferences([byte[]]$Raw, [string]$File, [int]$Block, [int[]]$Addresses) {
  $interest = @{}
  foreach ($addr in $Addresses) { $interest[$addr -band 0xffff] = $true }
  $refs = New-Object System.Collections.Generic.List[object]
  $pc = 22
  while ($pc -lt $Raw.Length) {
    $ins = Decode-Instruction $Raw $pc
    if ($null -eq $ins) {
      $pc++
      continue
    }
    switch ($ins.Op) {
      0x03 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest }
      0x04 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'dest' }
      0x05 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'dest' }
      0x06 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'dest' }
      0x07 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'dest' }
      0x08 { Track-ReadArgs $refs $File $Block $ins @(0) $interest; Track-WriteArg $refs $File $Block $ins 1 $interest 'random-dest' }
      0x09 { Track-ReadArgs $refs $File $Block $ins @(0) $interest; Track-WriteArg $refs $File $Block $ins 1 $interest 'save-dest' }
      0x0f { Track-WriteArg $refs $File $Block $ins 1 $interest 'input-dest' }
      0x10 { Track-WriteArg $refs $File $Block $ins 1 $interest 'input-dest' }
      0x14 { Track-ReadArgs $refs $File $Block $ins @(0,1,2,3) $interest }
      0x15 { Track-WriteArg $refs $File $Block $ins 0 $interest 'menu-dest'; Track-ReadArgs $refs $File $Block $ins @(1,2) $interest }
      0x1e {
        Track-ReadArgs $refs $File $Block $ins @(0,1,2) $interest
        Track-WriteArg $refs $File $Block $ins 3 $interest 'checkparty-dest-a'
        Track-WriteArg $refs $File $Block $ins 4 $interest 'checkparty-dest-b'
        Track-WriteArg $refs $File $Block $ins 5 $interest 'checkparty-dest-c'
      }
      0x25 {
        Track-ReadArgs $refs $File $Block $ins @(0,1) $interest
      }
      0x26 {
        Track-ReadArgs $refs $File $Block $ins @(0,1) $interest
      }
      0x2a {
        Track-ReadArgs $refs $File $Block $ins @(0,1) $interest
        Track-WriteArg $refs $File $Block $ins 2 $interest 'gettable-dest'
      }
      0x2b {
        Track-WriteArg $refs $File $Block $ins 0 $interest 'menu-dest'
        Track-ReadArgs $refs $File $Block $ins @(1) $interest
      }
      0x2c {
        Track-ReadArgs $refs $File $Block $ins @(0,1,2,3,4) $interest
        Track-WriteArg $refs $File $Block $ins 5 $interest 'parlay-dest'
      }
      0x2f { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'and-dest' }
      0x30 { Track-ReadArgs $refs $File $Block $ins @(0,1) $interest; Track-WriteArg $refs $File $Block $ins 2 $interest 'or-dest' }
      0x35 {
        Track-ReadArgs $refs $File $Block $ins @(0,1,2) $interest
        if ($ins.Args.Count -ge 3 -and
            -not (Is-MemOperand $ins.Args[1]) -and
            -not (Is-MemOperand $ins.Args[2])) {
          $addr = (([int]$ins.Args[1].Word) + ([int]$ins.Args[2].Word)) -band 0xffff
          if ($interest.ContainsKey($addr)) {
            Add-MemRef $refs $File $Block $ins 'write' 2 $addr ('savetable base+offset {0}+{1}' -f (Format-Arg $ins.Args[1]), (Format-Arg $ins.Args[2]))
          }
        }
      }
      0x39 {
        Track-WriteArg $refs $File $Block $ins 0 $interest 'who-dest'
      }
      0x3b {
        Track-ReadArgs $refs $File $Block $ins @(0) $interest
        Track-WriteArg $refs $File $Block $ins 1 $interest 'spell-dest-a'
        Track-WriteArg $refs $File $Block $ins 2 $interest 'spell-dest-b'
      }
      default {
        Track-ReadArgs $refs $File $Block $ins (0..([Math]::Max(0, $ins.Args.Count - 1))) $interest
      }
    }
    if ($ins.Next -le $pc) { $pc++ } else { $pc = [int]$ins.Next }
  }
  return $refs.ToArray()
}

function Scan-Entry([byte[]]$Raw, [string]$File, [int]$Block, [int]$Slot, [int]$StartPc) {
  $work = New-Object System.Collections.Generic.Queue[object]
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $results = New-Object System.Collections.Generic.List[object]
  $work.Enqueue([pscustomobject]@{ Pc = $StartPc; Queue = @(); Path = @() })

  while ($work.Count -gt 0) {
    $s = $work.Dequeue()
    $qkey = Queue-Key $s.Queue
    $key = '{0:X4}|{1}' -f $s.Pc,$qkey
    if (-not $seen.Add($key)) { continue }
    if ($seen.Count -gt 2048) { break }
    $ins = Decode-Instruction $Raw $s.Pc
    if ($null -eq $ins) { continue }
    $path = @($s.Path + (Format-Ins $ins))

    if ($ins.Op -eq 0x00 -or $ins.Op -eq 0x13) { continue }
    if ($ins.Op -eq 0x24) {
      $results.Add([pscustomobject]@{
        File = $File
        Block = $Block
        Entry = $names[$Slot]
        CombatPc = ('{0:X4}' -f $s.Pc)
        Queued = $s.Queue.Count
        Queue = (Queue-Key $s.Queue)
        Path = ($path -join ' ')
      })
      continue
    }

    $queue = @($s.Queue)
    if ($ins.Op -eq 0x0b -and $ins.Args.Count -ge 3) {
      $queue += [pscustomobject]@{
        Id = [int]$ins.Args[0].Word
        Count = [int]$ins.Args[1].Word
        Pic = [int]$ins.Args[2].Word
      }
    } elseif ($ins.Op -eq 0x1c) {
      $queue = @()
    }

    $succ = New-Object System.Collections.Generic.List[int]
    switch ($ins.Op) {
      0x01 {
        if ($ins.Args.Count -ge 1) { $succ.Add((Target-Offset ([int]$ins.Args[0].Word))) }
      }
      0x02 {
        if ($ins.Args.Count -ge 1) { $succ.Add((Target-Offset ([int]$ins.Args[0].Word))) }
        $succ.Add([int]$ins.Next)
      }
      { $_ -ge 0x16 -and $_ -le 0x1b } {
        $guarded = Decode-Instruction $Raw ([int]$ins.Next)
        $succ.Add([int]$ins.Next)
        if ($null -ne $guarded) { $succ.Add([int]$guarded.Next) }
      }
      0x25 {
        $succ.Add([int]$ins.Next)
        for ($i = 2; $i -lt $ins.Args.Count; $i++) { $succ.Add((Target-Offset ([int]$ins.Args[$i].Word))) }
      }
      0x26 {
        $succ.Add([int]$ins.Next)
        for ($i = 2; $i -lt $ins.Args.Count; $i++) { $succ.Add((Target-Offset ([int]$ins.Args[$i].Word))) }
      }
      default {
        $succ.Add([int]$ins.Next)
      }
    }
    foreach ($pc in ($succ | Select-Object -Unique)) {
      if ($pc -ge 22 -and $pc -lt $Raw.Length) {
        $work.Enqueue([pscustomobject]@{ Pc = $pc; Queue = $queue; Path = $path })
      }
    }
  }
  return $results.ToArray()
}

function Find-GeoDescriptor([string]$File, [int]$Descriptor) {
  $hits = New-Object System.Collections.Generic.List[object]
  foreach ($block in Get-DaxBlocks (Join-Path $game $File)) {
    $raw = [byte[]]$block.Raw
    if ($raw.Length -ne 1026) { continue }
    $plane2 = 514
    for ($i = 0; $i -lt 256; $i++) {
      if ([int]$raw[$plane2 + $i] -eq $Descriptor) {
        $hits.Add([pscustomobject]@{
          File = $File
          Block = [int]$block.Id
          X = ($i % 16)
          Y = [int]($i / 16)
          Descriptor = $Descriptor
        })
      }
    }
  }
  return $hits.ToArray()
}

$all = New-Object System.Collections.Generic.List[object]
$memRefs = New-Object System.Collections.Generic.List[object]
$interestingState = @(0x4ce9, 0x4ce8, 0x4ce5, 0x4c00, 0x7f79, 0xc04e, 0xc04f)
foreach ($file in @('ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX')) {
  foreach ($block in Get-DaxBlocks (Join-Path $game $file)) {
    $raw = [byte[]]$block.Raw
    if ($raw.Length -lt 22 -or [BitConverter]::ToUInt16($raw, 0) -ne 0x1388) { continue }
    foreach ($ref in Find-MemoryReferences $raw $file ([int]$block.Id) $interestingState) { $memRefs.Add($ref) }
    for ($slot = 0; $slot -lt 5; $slot++) {
      $vaddr = [BitConverter]::ToUInt16($raw, 2 + ($slot * 4) + 2)
      $pc = Target-Offset $vaddr
      if ($pc -ge 22 -and $pc -lt $raw.Length) {
        foreach ($r in Scan-Entry $raw $file ([int]$block.Id) $slot $pc) { $all.Add($r) }
      }
    }
  }
}

$queued = @($all | Where-Object { $_.Queued -gt 0 })
$empty = @($all | Where-Object { $_.Queued -eq 0 })
Write-Output ("[STATIC] DoK COMBAT nodes reachable from Gen1 far pointers: {0} queued, {1} empty" -f $queued.Count, $empty.Count)
if ($queued.Count -gt 0) {
  Write-Output '[STATIC] queued COMBAT candidates:'
  $queued | Sort-Object File, Block, Entry, CombatPc, Queue | Select-Object File, Block, Entry, CombatPc, Queued, Queue | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  Write-Output '[STATIC] queued candidate paths:'
  $queued | Sort-Object File, Block, Entry, CombatPc, Queue | ForEach-Object {
    Write-Output ("  {0} block {1} {2} -> COMBAT {3}: {4}" -f $_.File, $_.Block, $_.Entry, $_.CombatPc, $_.Path)
  }
}
if ($empty.Count -gt 0) {
  Write-Output '[STATIC] empty COMBAT candidates:'
  $empty | Sort-Object File, Block, Entry, CombatPc | Select-Object File, Block, Entry, CombatPc | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($queued.Count -eq 0) {
  throw 'DoK static scan found no queued COMBAT candidates; expected at least the known direct tactical branches'
}
$stateRefs = @($memRefs | Sort-Object Addr, File, Block, Pc, Access)
Write-Output ("[STATIC] DoK host-state refs for queued-combat cells: {0}" -f $stateRefs.Count)
$keyStateRefs = @($stateRefs | Where-Object {
  $_.File -eq 'ECL2.DAX' -and
  $_.Block -eq 51 -and
  $_.Addr -in @('4CE9','4CE8','4CE5','4C00','C04E','C04F')
})
if ($keyStateRefs.Count -gt 0) {
  Write-Output '[STATIC] keyed host-state refs:'
  $keyStateRefs | Select-Object Addr, Access, File, Block, Pc, Op, Arg, Detail | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
$highVolumeRefs = @($stateRefs | Where-Object { $_.Addr -eq '7F79' } |
  Group-Object Addr, Access, File, Block, Op |
  Sort-Object Count -Descending)
if ($highVolumeRefs.Count -gt 0) {
  Write-Output ("[STATIC] 7F79 selector refs summarized: {0} groups, top 20 shown" -f $highVolumeRefs.Count)
  $highVolumeRefs | Select-Object -First 20 Count,
    @{Name='Addr';Expression={$_.Group[0].Addr}},
    @{Name='Access';Expression={$_.Group[0].Access}},
    @{Name='File';Expression={$_.Group[0].File}},
    @{Name='Block';Expression={$_.Group[0].Block}},
    @{Name='Op';Expression={$_.Group[0].Op}} |
    Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
$b51Gate = @($stateRefs | Where-Object { $_.File -eq 'ECL2.DAX' -and $_.Block -eq 51 -and $_.Addr -eq '4CE9' -and $_.Access -eq 'read' })
if ($b51Gate.Count -eq 0) {
  throw 'DoK static scan did not find the ECL2 block-51 4CE9 gate for the known queued vmRun1 combat path'
}
$stateWriters = @($stateRefs | Where-Object { $_.Access -eq 'write' -and $_.Addr -in @('4CE9','4CE8','4CE5') })
if ($stateWriters.Count -gt 0) {
  Write-Output '[STATIC] candidate writers for the block-51 combat state cells:'
  $stateWriters | Select-Object Addr, Access, File, Block, Pc, Op, Arg, Detail | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
$geo29 = New-Object System.Collections.Generic.List[object]
foreach ($file in @('GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX')) {
  foreach ($hit in Find-GeoDescriptor $file 29) { $geo29.Add($hit) }
}
Write-Output ("[STATIC] DoK GEO plane-2 descriptor 29 cells: {0}" -f $geo29.Count)
$resultLine = if ($geo29.Count -gt 0) {
  'Result=Descriptor 29 exists in GEO data; re-evaluate whether the ECL2 block-51 vmRun1 route is naturally reachable'
} else {
  'Result=ECL2 block-51 vmRun1 queued tactical candidate is host-state seeded, not GEO-step discoverable in this data set'
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK static combat candidate scan')
$summary.Add("CombatNodes=$($all.Count)")
$summary.Add("QueuedCombat=$($queued.Count)")
$summary.Add("EmptyCombat=$($empty.Count)")
foreach ($row in ($queued | Sort-Object File, Block, Entry, CombatPc, Queue)) {
  $summary.Add(("Queued {0} block={1} entry={2} pc={3} groups={4}" -f $row.File, $row.Block, $row.Entry, $row.CombatPc, $row.Queue))
}
$summary.Add("HostStateRefs=$($stateRefs.Count)")
$summary.Add("KeyBlock51Refs=$($keyStateRefs.Count)")
$summary.Add("Block51GateRefs=$($b51Gate.Count)")
$summary.Add("Block51StateWriters=$($stateWriters.Count)")
$summary.Add("GeoDescriptor29=$($geo29.Count)")
$summary.Add($resultLine)
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

if ($all.Count -gt 0) {
  $all |
    Sort-Object File, Block, Entry, CombatPc, Queue |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $combatCsvPath -Encoding ASCII
} else {
  Set-Content -Path $combatCsvPath -Encoding ASCII -Value 'File,Block,Entry,CombatPc,Queued,Queue,Path'
}
if ($stateRefs.Count -gt 0) {
  $stateRefs |
    Select-Object Addr, Access, File, Block, Pc, Op, Arg, Detail |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $refsCsvPath -Encoding ASCII
} else {
  Set-Content -Path $refsCsvPath -Encoding ASCII -Value 'Addr,Access,File,Block,Pc,Op,Arg,Detail'
}
if ($geo29.Count -gt 0) {
  $geo29 |
    Sort-Object File, Block, Y, X |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $geoCsvPath -Encoding ASCII
} else {
  Set-Content -Path $geoCsvPath -Encoding ASCII -Value 'File,Block,X,Y,Descriptor'
}

if ($geo29.Count -gt 0) {
  Write-Output '[STATIC] descriptor 29 GEO hits:'
  $geo29 | Sort-Object File, Block, Y, X | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'DoK GEO descriptor 29 is present; re-evaluate the ECL2 block-51 vmRun1 natural-step gap'
}
Write-Output '[STATIC] DoK GEO descriptor audit confirms the ECL2 block-51 /Q 29 combat candidate is host-state seeded, not GEO-step discoverable in this data set'
Write-Output 'RESULT: DoK static combat candidate scan PASS'
