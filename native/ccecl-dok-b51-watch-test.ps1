# ccecl-dok-b51-watch-test.ps1 -- trace-watch DoK ECL2 block-51 gate writes.
#
# Uses CCECL's existing /T trace to watch the concrete block-51 gate PCs and
# sparse-memory writes around the known DoK tactical handoff. This does not
# trace original retail x86 host writes; it proves what the clean-room ECL VM
# sees after natural/probed CCECL state import.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_DOKB51WATCH.TXT'
$csvPath = Join-Path $build '_DOKB51WATCH.CSV'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: DoK block-51 watch test (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @('ECL2.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: DoK block-51 watch test ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Get-GbefWord([byte[]]$Bytes, [int]$Offset) {
  if ($Bytes.Length -lt ($Offset + 2)) { return $null }
  return [BitConverter]::ToUInt16($Bytes, $Offset)
}

function Get-MemValue([byte[]]$Bytes, [int]$Key) {
  if ($Bytes.Length -lt 2246 -or [Text.Encoding]::ASCII.GetString($Bytes, 116, 4) -ne 'GBRS') {
    return $null
  }
  $count = [BitConverter]::ToUInt16($Bytes, 196)
  for ($i = 0; $i -lt $count -and $i -lt 512; $i++) {
    $k = [BitConverter]::ToUInt16($Bytes, 198 + ($i * 2))
    if ($k -eq $Key) {
      return [BitConverter]::ToUInt16($Bytes, 1222 + ($i * 2))
    }
  }
  return $null
}

function Format-HexValue($Value) {
  if ($null -eq $Value) { return '' }
  return '{0:X4}' -f ([int]$Value -band 0xffff)
}

function Get-TraceStats([string]$Path) {
  $watchAddrs = @('4CE9', '4CE8', '4CE5', '4C00', '7F79', 'C04F', 'C04E')
  $watchPcs = @('0186', '01ED', '0203', '020E', '023F', '02D0', '0344')
  $stats = [ordered]@{}
  foreach ($pc in $watchPcs) { $stats["Pc$pc"] = 0 }
  foreach ($addr in $watchAddrs) { $stats["Write$addr"] = 0 }
  $writes = New-Object System.Collections.Generic.List[string]
  if (-not (Test-Path -LiteralPath $Path)) {
    $stats['Writes'] = ''
    return [pscustomobject]$stats
  }
  foreach ($line in [IO.File]::ReadLines($Path)) {
    foreach ($pc in $watchPcs) {
      if ($line.StartsWith("PC=$pc ")) { $stats["Pc$pc"] = [int]$stats["Pc$pc"] + 1 }
    }
    foreach ($addr in $watchAddrs) {
      $needle = "MEM[$addr]="
      if ($line.Contains($needle)) {
        $stats["Write$addr"] = [int]$stats["Write$addr"] + 1
        $writes.Add($line.Trim())
      }
    }
  }
  $stats['Writes'] = ($writes -join '; ')
  return [pscustomobject]$stats
}

Remove-Item (Join-Path $build 'B51W*.BIN'),
  (Join-Path $build 'B51W*.TRC'),
  (Join-Path $build 'B51W.BAT') -Force -ErrorAction SilentlyContinue

$bat = Join-Path $build 'B51W.BAT'
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('@echo off')
$lines.Add('C:\CCECL D:\ECL2.DAX 51 /E C:\B51W00.BIN /Q 29 /F 0 /N 6 /H 1 /Z 240 /D 4 /T > NUL')
$lines.Add('REN C:\CCECL.TRC B51W00.TRC')
$lines.Add('C:\CCECL D:\ECL2.DAX 51 /E C:\B51W01.BIN /Q 29 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 19689 1 /T > NUL')
$lines.Add('REN C:\CCECL.TRC B51W01.TRC')
for ($i = 0; $i -lt 3; $i++) {
  $facing = $i + 1
  $stem = "B51W$($i + 2)"
  $lines.Add("C:\CCECL D:\ECL2.DAX 51 /E C:\${stem}A.BIN /Q 157 /F $facing /N 6 /H 1 /Z 240 /D 4 /T > NUL")
  $lines.Add("REN C:\CCECL.TRC ${stem}A.TRC")
  $lines.Add("C:\CCECL D:\ECL2.DAX 51 /P C:\${stem}A.BIN /E C:\${stem}B.BIN /J 157 /F $facing /N 6 /H 1 /Z 240 /D 4 /T > NUL")
  $lines.Add("REN C:\CCECL.TRC ${stem}B.TRC")
  $lines.Add("C:\CCECL D:\ECL2.DAX 51 /P C:\${stem}B.BIN /E C:\${stem}C.BIN /J 29 /F $facing /N 6 /H 1 /Z 240 /D 4 /T > NUL")
  $lines.Add("REN C:\CCECL.TRC ${stem}C.TRC")
}
$lines.Add('exit')
[IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)

$conf = Join-Path $build '_dok_b51_watch.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\B51W.BAT
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 25000'
try {
  if (-not $p.WaitForExit(120000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'DoK block-51 watch test timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

# Descriptor mirrors the /Q or /J operand of the matching B51W.BAT line above,
# so the C04F/C04E assertions below check the emitted record against what this
# script ASKED for rather than against what it happened to get back.
$cases = @(
  @{ Label = 'base-q29'; Bin = 'B51W00.BIN'; Trace = 'B51W00.TRC'; Phase = 'vmRun1'; Facing = 0; Descriptor = 29 },
  @{ Label = 'seeded-q29-4ce9'; Bin = 'B51W01.BIN'; Trace = 'B51W01.TRC'; Phase = 'vmRun1'; Facing = 0; Descriptor = 29 },
  @{ Label = 'dispatch-f1-vm'; Bin = 'B51W2A.BIN'; Trace = 'B51W2A.TRC'; Phase = 'vmRun157'; Facing = 1; Descriptor = 157 },
  @{ Label = 'dispatch-f1-search157'; Bin = 'B51W2B.BIN'; Trace = 'B51W2B.TRC'; Phase = 'search157'; Facing = 1; Descriptor = 157 },
  @{ Label = 'dispatch-f1-search29'; Bin = 'B51W2C.BIN'; Trace = 'B51W2C.TRC'; Phase = 'search29'; Facing = 1; Descriptor = 29 },
  @{ Label = 'dispatch-f2-vm'; Bin = 'B51W3A.BIN'; Trace = 'B51W3A.TRC'; Phase = 'vmRun157'; Facing = 2; Descriptor = 157 },
  @{ Label = 'dispatch-f2-search157'; Bin = 'B51W3B.BIN'; Trace = 'B51W3B.TRC'; Phase = 'search157'; Facing = 2; Descriptor = 157 },
  @{ Label = 'dispatch-f2-search29'; Bin = 'B51W3C.BIN'; Trace = 'B51W3C.TRC'; Phase = 'search29'; Facing = 2; Descriptor = 29 },
  @{ Label = 'dispatch-f3-vm'; Bin = 'B51W4A.BIN'; Trace = 'B51W4A.TRC'; Phase = 'vmRun157'; Facing = 3; Descriptor = 157 },
  @{ Label = 'dispatch-f3-search157'; Bin = 'B51W4B.BIN'; Trace = 'B51W4B.TRC'; Phase = 'search157'; Facing = 3; Descriptor = 157 },
  @{ Label = 'dispatch-f3-search29'; Bin = 'B51W4C.BIN'; Trace = 'B51W4C.TRC'; Phase = 'search29'; Facing = 3; Descriptor = 29 }
)

$rows = New-Object System.Collections.Generic.List[object]
foreach ($case in $cases) {
  $binPath = Join-Path $build $case.Bin
  $tracePath = Join-Path $build $case.Trace
  $status = 'MISSING'
  $flags = ''
  $pc = ''
  $enc = ''
  $mem = @{}
  foreach ($addr in @(0x4ce9, 0x4ce8, 0x4ce5, 0x4c00, 0x7f79, 0xc04f, 0xc04e)) {
    $mem[$addr] = ''
  }
  if (Test-Path -LiteralPath $binPath) {
    $b = [IO.File]::ReadAllBytes($binPath)
    if ($b.Length -ge 2246 -and [Text.Encoding]::ASCII.GetString($b, 0, 4) -eq 'GBEF') {
      $status = Format-HexValue (Get-GbefWord $b 8)
      $flags = Format-HexValue (Get-GbefWord $b 6)
      $pc = Format-HexValue (Get-GbefWord $b 124)
      $enc = Format-HexValue (Get-GbefWord $b 32)
      foreach ($addr in @(0x4ce9, 0x4ce8, 0x4ce5, 0x4c00, 0x7f79, 0xc04f, 0xc04e)) {
        $mem[$addr] = Format-HexValue (Get-MemValue $b $addr)
      }
    }
  }
  $stats = Get-TraceStats $tracePath
  $rows.Add([pscustomobject]@{
    Label = $case.Label
    Phase = $case.Phase
    Facing = $case.Facing
    Descriptor = $case.Descriptor
    Status = $status
    Flags = $flags
    Pc = $pc
    Enc = $enc
    Mem4CE9 = $mem[0x4ce9]
    Mem4CE8 = $mem[0x4ce8]
    Mem4CE5 = $mem[0x4ce5]
    Mem4C00 = $mem[0x4c00]
    Mem7F79 = $mem[0x7f79]
    MemC04F = $mem[0xc04f]
    MemC04E = $mem[0xc04e]
    Pc0186 = $stats.Pc0186
    Pc01ED = $stats.Pc01ED
    Pc0203 = $stats.Pc0203
    Pc020E = $stats.Pc020E
    Pc023F = $stats.Pc023F
    Pc02D0 = $stats.Pc02D0
    Pc0344 = $stats.Pc0344
    Write4CE9 = $stats.Write4CE9
    Write4CE8 = $stats.Write4CE8
    Write4CE5 = $stats.Write4CE5
    Write4C00 = $stats.Write4C00
    Write7F79 = $stats.Write7F79
    WriteC04F = $stats.WriteC04F
    WriteC04E = $stats.WriteC04E
    Writes = $stats.Writes
  })
}

$gateRows = @($rows | Where-Object { $_.Mem4CE9 -eq '0001' })
$writeGateRows = @($rows | Where-Object { [int]$_.Write4CE9 -gt 0 })
$combatRows = @($rows | Where-Object { $_.Status -eq '0003' })
$search29Rows = @($rows | Where-Object { $_.Phase -eq 'search29' })
$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK block-51 CCECL trace-watch scan')
$summary.Add("Rows=$($rows.Count)")
$summary.Add("RowsWith4CE9Gate=$($gateRows.Count)")
$summary.Add("RowsWith4CE9Writes=$($writeGateRows.Count)")
$summary.Add("CombatRows=$($combatRows.Count)")
$summary.Add("Search29Rows=$($search29Rows.Count)")
$summary.Add("Search29RowsWith4CE9Gate=$(@($search29Rows | Where-Object { $_.Mem4CE9 -eq '0001' }).Count)")
$summary.Add("Search29RowsWith4CE9Writes=$(@($search29Rows | Where-Object { [int]$_.Write4CE9 -gt 0 }).Count)")
$summary.Add('Result=Only the seeded control is expected to reach the known block-51 COMBAT handoff; natural descriptor-157 dispatch traces should not write 4CE9')
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)

$rows |
  Sort-Object Label |
  ConvertTo-Csv -NoTypeInformation |
  Set-Content -Path $csvPath -Encoding ASCII

if ($writeGateRows.Count -gt 0) {
  Write-Output '[WATCH] rows with traced 4CE9 writes:'
  $writeGateRows | Select-Object Label, Phase, Facing, Status, Mem4CE9, Write4CE9, Writes | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
Write-Output ("[DOKB51WATCH] rows={0} gateRows={1} gateWriteRows={2} combatRows={3}" -f $rows.Count, $gateRows.Count, $writeGateRows.Count, $combatRows.Count)

# ===========================================================================
# Assertions -- added 2026-09-10 so this scan can report a verdict a runner
# can read. From 23ba497 on 2026-07-15 until now it exited 0 with a
# verdict-free RESULT line, and native/run-flow-suite.ps1 correctly classified
# that as FAIL under its zero-exit-without-verdict rule.
#
# The RESULT line at the bottom is the LAST statement in the file,
# $ErrorActionPreference is 'Stop' at the top, and there is no try/catch
# anywhere below this banner -- so the word PASS is reachable only if every
# throw below is cleared. Do NOT restore a verdict by appending PASS to a line
# that asserts nothing; that rule did not change, the assertions did.
#
# Each check is either derived from native/src/ccecl.asm or is a value
# native/README.md has carried since 23ba497 on 2026-07-15 and that still
# reproduces today, 83 commits to native/src later. Nothing is pinned merely
# because today's run emits it; the candidates rejected for exactly that
# reason are listed in native/README.md's status note.
# ===========================================================================
$seededLabel = 'seeded-q29-4ce9'
$vmRunRows = @($rows | Where-Object { $_.Phase -like 'vmRun*' })
$searchRows = @($rows | Where-Object { $_.Phase -like 'search*' })

# A1 NULL, one-sided. Status starts as the literal 'MISSING' and is replaced
# only when the .BIN exists, is at least 2246 bytes and opens with the GBEF
# magic -- native/src/ccecl.asm write_effects, offsets 00/04/08. If DOSBox or
# CCECL failed, every '== 0' count below goes vacuously true.
foreach ($row in $rows) {
  if ($row.Status -notmatch '^[0-9A-F]{4}$') {
    throw "A1 record-present null: case '$($row.Label)' produced no parsable GBEF record [Status='$($row.Status)']; with no record every 'no natural route' count in this scan is vacuously zero"
  }
}

# A2 NULL, one-sided. Get-TraceStats returns every counter as 0 when the .TRC
# is absent, which is indistinguishable from 'the trace ran and saw no
# MEM[4CE9] write'. 7F79 is seeded unconditionally on the Gen1 handler path
# [ccecl.asm, the C04F/7F79/C04E seeding block], so every trace must show at
# least one MEM write. The exact count is deliberately NOT pinned.
foreach ($row in $rows) {
  if ([int]$row.Write7F79 -le 0) {
    throw "A2 trace-live null: case '$($row.Label)' traced 0 MEM[7F79] writes, so its trace is absent or empty; RowsWith4CE9Writes=0 would then be vacuous rather than a finding"
  }
}

# A3 TWO-SIDED. /X 19689 1 is add_memory_seed 0x4CE9 = 1, applied by
# apply_memory_seeds on the handler path, so the seeded control's MEM[4CE9]=1
# is required by construction. RED at 0 means the /X seed stopped reaching the
# record; RED at 2 or more means a natural route acquired the gate -- the
# discovery this whole scan exists to catch, which must not pass silently.
if ($gateRows.Count -ne 1) {
  throw "A3 4CE9 gate rows: expected exactly 1 [the /X 19689 1 seeded control], got $($gateRows.Count) -- $(($gateRows | ForEach-Object { $_.Label }) -join ', '); README records RowsWith4CE9Gate=1 since 2026-07-15"
}
if ($gateRows[0].Label -ne $seededLabel) {
  throw "A3 4CE9 gate owner: the one row carrying MEM[4CE9] is '$($gateRows[0].Label)', expected the seeded control '$seededLabel'"
}
if ($gateRows[0].Mem4CE9 -ne '0001') {
  throw "A3 4CE9 seed round-trip: seeded control carries MEM[4CE9]=$($gateRows[0].Mem4CE9), expected 0001 -- /X 19689 1 asked for the value 1"
}

# A4 one-sided, made non-vacuous by A1 and A2. README since 2026-07-15:
# RowsWith4CE9Writes=0. This is the standing diagnosis that the block-51 gate
# is host-owned rather than ECL-owned.
if ($writeGateRows.Count -ne 0) {
  throw "A4 traced 4CE9 writes: expected 0 rows, got $($writeGateRows.Count) -- $(($writeGateRows | ForEach-Object { $_.Label }) -join ', '); an ECL-side write to MEM[4CE9] would overturn the host-owned-gate diagnosis and must be reviewed, not absorbed"
}

# A5 cross-instrument, two-sided in effect. The emitted GBRS sparse table and
# the per-instruction MEM[] trace are two independent instruments. A cell
# present in the record with no /X seed and no traced write means one of them
# is lying.
foreach ($row in $rows) {
  if ($row.Mem4CE9 -ne '' -and $row.Label -ne $seededLabel -and [int]$row.Write4CE9 -le 0) {
    throw "A5 record/trace disagreement: case '$($row.Label)' has MEM[4CE9]=$($row.Mem4CE9) in its GBEF record with no /X seed and 0 traced writes; the record and the trace cannot both be right"
  }
}

# A6 TWO-SIDED per row, source-derived: the Gen1 handler seeds C04F with
# [cell_descriptor] verbatim, so the record must still hold the descriptor
# this script asked for on its /Q or /J operand.
# A7 TWO-SIDED per row, source-derived: the same block seeds C04E with
# [cell_facing] shifted left once and masked to 0006h -- the Gen1
# MapDirection encoding 0=N,2=E,4=S,6=W. LIMIT, stated rather than hidden: no
# case here uses facing 4 or above, so this discriminates the shift, not the
# mask.
foreach ($row in $rows) {
  $expectC04F = '{0:X4}' -f ([int]$row.Descriptor -band 0xffff)
  if ($row.MemC04F -ne $expectC04F) {
    throw "A6 C04F descriptor seed: case '$($row.Label)' asked for descriptor $($row.Descriptor) so its record must hold MEM[C04F]=$expectC04F, got '$($row.MemC04F)'"
  }
  $expectC04E = '{0:X4}' -f ((([int]$row.Facing) * 2) -band 6)
  if ($row.MemC04E -ne $expectC04E) {
    throw "A7 C04E facing seed: case '$($row.Label)' asked for facing $($row.Facing) so its record must hold MEM[C04E]=$expectC04E [facing shl 1 and 0006h], got '$($row.MemC04E)'"
  }
}

# A8 TWO-SIDED. Status 3 is the COMBAT yield -- write_effects offset 08,
# 0=exit 1=chain 3=combat 4=halt, set by op_combat. README since 2026-07-15:
# CombatRows=1. RED at 0 means the seeded DoK tactical handoff regressed; RED
# at 2 or more means a natural route now reaches combat.
if ($combatRows.Count -ne 1) {
  throw "A8 COMBAT rows: expected exactly 1 [the seeded control], got $($combatRows.Count) -- $(($combatRows | ForEach-Object { $_.Label }) -join ', '); README records CombatRows=1 since 2026-07-15"
}
if ($combatRows[0].Label -ne $seededLabel) {
  throw "A8 COMBAT owner: the one row yielding status 0003 is '$($combatRows[0].Label)', expected the seeded control '$seededLabel'"
}

# A9 one-sided, independent of A8: status 4 is a halt, whose reasons are
# 1=bad opcode, 2=step budget, 3=sparse memory full, 4=chain follow failure --
# every one a VM defect. A8 alone cannot tell a clean exit from a halt.
foreach ($row in $rows) {
  if ($row.Status -eq '0004') {
    throw "A9 VM halt: case '$($row.Label)' ended with status 0004 [halted]; halt reasons are bad opcode, step budget, sparse memory full or chain follow failure, all defects"
  }
}

# A10 TWO-SIDED relation between two instruments, both source-derived.
# op_combat stores [opp] into [pc] and reads no operands, so the saved pc is
# exactly one byte past the COMBAT opcode; the trace PC= field is the opcode's
# own offset. README since 2026-07-15 independently records that ECL2 block 51
# vmRun1 reaches COMBAT at PC 0186.
$combatRow = $combatRows[0]
if ([int]$combatRow.Pc0186 -ne 1) {
  throw "A10 COMBAT site: case '$($combatRow.Label)' traced PC=0186 $($combatRow.Pc0186) times, expected exactly 1 -- README records the block-51 COMBAT opcode at PC 0186"
}
if ($combatRow.Pc -ne '0187') {
  throw "A10 COMBAT saved pc: case '$($combatRow.Label)' saved pc $($combatRow.Pc), expected 0187 -- op_combat stores the operand pointer and COMBAT takes no operands, so the saved pc must be the traced 0186 plus 1"
}

# A11 TWO-SIDED on the count, plus a record contract asserted for every row.
# README since 2026-07-15, from ccecl-dok-static-combat-scan.ps1: block 51
# vmRun1 reaches COMBAT after loading monster groups 1 x2 and 17 x8 -- two
# groups. The flag half is not a value but a relation: FX_HAVE_ENC 0x0008 is
# or-ed in by op_loadmonster, so a nonzero group count cannot coexist with
# that bit clear.
if ($combatRow.Enc -ne '0002') {
  throw "A11 queued encounter groups: case '$($combatRow.Label)' queued $($combatRow.Enc) groups, expected 0002 -- the static combat scan records exactly two groups, 1 x2 and 17 x8"
}
foreach ($row in $rows) {
  $encCount = [Convert]::ToInt32($row.Enc, 16)
  $flagBits = [Convert]::ToInt32($row.Flags, 16)
  if ($encCount -gt 0 -and ($flagBits -band 0x0008) -eq 0) {
    throw "A11 FX_HAVE_ENC contract: case '$($row.Label)' reports $encCount queued groups with flags $($row.Flags), but op_loadmonster or-s FX_HAVE_ENC 0x0008 in whenever it queues one"
  }
}

# A12 TWO-SIDED across the phase split, and the weakest justification in this
# set: a reproduced measurement, not a source derivation. README since
# 2026-07-15: the natural vmRun rows do reach the PC=020E gate and then fall
# away. RED if a vmRun row stops reaching it AND red if a search row starts.
foreach ($row in $vmRunRows) {
  if ([int]$row.Pc020E -le 0) {
    throw "A12 gate reach: vmRun case '$($row.Label)' never traced PC=020E; README records that the natural vmRun rows do reach that gate before falling away"
  }
}
foreach ($row in $searchRows) {
  if ([int]$row.Pc020E -ne 0) {
    throw "A12 gate reach: search case '$($row.Label)' traced PC=020E $($row.Pc020E) times, expected 0; a SearchLocation pass reaching the block-51 gate would be a new route and must be reviewed"
  }
}

Write-Output ("[DOKB51WATCH] assertions cleared: A1..A12 over {0} rows" -f $rows.Count)
Write-Output 'RESULT: DoK block-51 CCECL trace-watch scan PASS'
