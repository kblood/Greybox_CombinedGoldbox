# ccecl-dok-route-scan.ps1 -- broad DoK native ECL route audit.
#
# This is intentionally not part of the default serial smoke. It is a broader
# route-discovery probe for the remaining DoK natural tactical-combat gap:
# SearchLocation, vmRun1, far-pointer slot 2, and far-pointer slot 3 across
# every shipped DoK ECL block, a configurable descriptor/cell-word prefix, and
# four facings.
param(
  [switch]$Headless,
  [switch]$SearchOnly,
  [switch]$WithThiefMatrix,
  [ValidateRange(0, 255)]
  [int]$ThiefSkill = 100,
  [ValidateRange(1, 256)]
  [int]$SeedCount = 64
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
$gameMount = if (Test-Path -LiteralPath $game -PathType Container) { New-RetailStage -Source $game } else { $game }
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$summaryPath = Join-Path $build '_DOKROUTE.TXT'
$notableCsvPath = Join-Path $build '_DOKROUTE.CSV'
$seedArg = ''

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($name in @('ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCECL DoK route scan ($name absent)"
    exit 0
  }
}

function Write-ThiefMatrixSeed([string]$Path, [int]$SkillValue) {
  $seed = New-Object byte[] 216
  [Text.Encoding]::ASCII.GetBytes('GBPS').CopyTo($seed, 0)
  [BitConverter]::GetBytes([uint16]2).CopyTo($seed, 4)
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 6)
  [BitConverter]::GetBytes([uint16]6).CopyTo($seed, 8)
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 10)
  [BitConverter]::GetBytes([uint16]4).CopyTo($seed, 12)
  $seed[150] = 6
  for ($member = 0; $member -lt 6; $member++) {
    for ($skill = 0; $skill -lt 8; $skill++) {
      $seed[152 + ($member * 8) + $skill] = [byte]$SkillValue
    }
  }
  [IO.File]::WriteAllBytes($Path, $seed)
}

if ($WithThiefMatrix) {
  $seedPath = Join-Path $build 'DOKROUTE.GBP'
  Write-ThiefMatrixSeed $seedPath $ThiefSkill
  $seedArg = ' /G C:\DOKROUTE.GBP'
}

function Get-DaxEntryIds([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 2) { throw "DAX file too short: $Path" }
  $tocBytes = [BitConverter]::ToUInt16($bytes, 0)
  if ($tocBytes -le 0 -or ($tocBytes % 9) -ne 0 -or $bytes.Length -lt (2 + $tocBytes)) {
    throw "DAX TOC has invalid length in $Path"
  }
  $count = [int]($tocBytes / 9)
  $ids = New-Object System.Collections.Generic.List[int]
  for ($i = 0; $i -lt $count; $i++) {
    $ids.Add([int]$bytes[2 + ($i * 9)])
  }
  return @($ids)
}

$ecls = foreach ($file in @('ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX')) {
  @{ File = $file; Blocks = @(Get-DaxEntryIds (Join-Path $game $file)) }
}

function New-RouteScanBatch($Label, $EntrySwitch, $Prefix) {
  Remove-Item (Join-Path $build "$Prefix*.BIN"),
    (Join-Path $build "$Prefix.BAT"),
    (Join-Path $build "$Prefix.CSV") -Force -ErrorAction SilentlyContinue

  $bat = Join-Path $build "$Prefix.BAT"
  $csv = Join-Path $build "$Prefix.CSV"
  $lines = New-Object System.Collections.Generic.List[string]
  $map = New-Object System.Collections.Generic.List[string]
  $lines.Add('@echo off')
  $idx = 0
  foreach ($ecl in $ecls) {
    foreach ($block in $ecl.Blocks) {
      for ($f = 0; $f -lt 4; $f++) {
        for ($seed = 0; $seed -lt $SeedCount; $seed++) {
          $stem = ('{0}{1:D4}' -f $Prefix, $idx)
          $lines.Add("C:\CCECL D:\$($ecl.File) $block /E C:\$stem.BIN $EntrySwitch $seed /F $f /N 6 /H 1 /Z 240 /D 4$seedArg > NUL")
          $map.Add("$idx,$($ecl.File),$block,$seed,$f")
          $idx++
        }
      }
    }
  }
  $lines.Add('exit')
  [IO.File]::WriteAllLines($bat, $lines, [Text.Encoding]::ASCII)
  [IO.File]::WriteAllLines($csv, $map, [Text.Encoding]::ASCII)

  $conf = Join-Path $build "_dok_${Prefix}_scan.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\$Prefix.BAT
"@ | Set-Content $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 35000'
  try {
    if (-not $p.WaitForExit(420000)) {
      Stop-DosBoxSmoke -Process $p
      throw "CCECL DoK $Label route scan timed out"
    }
  } finally {
    Stop-DosBoxSmoke -Process $p
  }

  $rows = New-Object System.Collections.Generic.List[object]
  $missing = 0
  foreach ($line in $map) {
    $parts = $line.Split(',')
    $idx = [int]$parts[0]
    $path = Join-Path $build ('{0}{1:D4}.BIN' -f $Prefix, $idx)
    if (-not (Test-Path $path)) {
      $missing++
      continue
    }
    $b = [IO.File]::ReadAllBytes($path)
    if ($b.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') {
      $missing++
      continue
    }
    $flags = [BitConverter]::ToUInt16($b, 6)
    $status = [BitConverter]::ToUInt16($b, 8)
    $enc = [BitConverter]::ToUInt16($b, 32)
    $pc = [BitConverter]::ToUInt16($b, 124)
    if ($status -eq 3 -or $enc -gt 0 -or (($flags -band 8) -ne 0)) {
      $m0 = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 34) } else { 0 }
      $c0 = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 36) } else { 0 }
      $p0 = if ($enc -gt 0 -and $b.Length -ge 40) { [BitConverter]::ToUInt16($b, 38) } else { 0 }
      $rows.Add([pscustomobject]@{
        Entry = $Label
        File = $parts[1]
        Block = [int]$parts[2]
        Seed = [int]$parts[3]
        Facing = [int]$parts[4]
        Status = ('{0:X4}' -f $status)
        Flags = ('{0:X4}' -f $flags)
        Enc = $enc
        Pc = ('{0:X4}' -f $pc)
        Mon = ('{0:X4}' -f $m0)
        Count = ('{0:X4}' -f $c0)
        Pic = ('{0:X4}' -f $p0)
      })
    }
  }

  return [pscustomobject]@{
    Label = $Label
    Total = $map.Count
    Missing = $missing
    Rows = $rows
  }
}

$scans = @(
  @{ Label = 'SearchLocation'; Switch = '/J'; Prefix = 'RJ' }
)
if (-not $SearchOnly) {
  $scans += @(
    @{ Label = 'vmRun1'; Switch = '/Q'; Prefix = 'RQ' },
    @{ Label = 'slot2'; Switch = '/2'; Prefix = 'R2' },
    @{ Label = 'slot3'; Switch = '/3'; Prefix = 'R3' }
  )
}

$results = foreach ($scan in $scans) {
  New-RouteScanBatch $scan.Label $scan.Switch $scan.Prefix
}

$allRows = @($results | ForEach-Object { $_.Rows })
$queuedCombat = @($allRows | Where-Object { $_.Status -eq '0003' -and $_.Enc -gt 0 })
$emptyCombat = @($allRows | Where-Object { $_.Status -eq '0003' -and $_.Enc -eq 0 })
$queuedNoCombat = @($allRows | Where-Object { $_.Status -ne '0003' -and $_.Enc -gt 0 })
$surfaceList = ($results | ForEach-Object { $_.Label }) -join '/'
$matrixSuffix = if ($WithThiefMatrix) { " with GBPS v2 thief matrix=$ThiefSkill" } else { "" }

foreach ($result in $results) {
  Write-Output ("[SCAN] {0}: {1} routes, {2} missing/invalid, {3} notable" -f $result.Label, $result.Total, $result.Missing, $result.Rows.Count)
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('DoK broad native route scan')
$summary.Add("SeedCount=$SeedCount")
$summary.Add("WithThiefMatrix=$([bool]$WithThiefMatrix)")
if ($WithThiefMatrix) {
  $summary.Add("ThiefSkill=$ThiefSkill")
}
$summary.Add("Surfaces=$surfaceList")
$summary.Add("SearchOnly=$([bool]$SearchOnly)")
foreach ($result in $results) {
  $summary.Add(("Surface {0}: routes={1} missingInvalid={2} notable={3}" -f $result.Label, $result.Total, $result.Missing, $result.Rows.Count))
}
$summary.Add("QueuedCombat=$($queuedCombat.Count)")
$summary.Add("EmptyCombat=$($emptyCombat.Count)")
$summary.Add("QueuedNoCombat=$($queuedNoCombat.Count)")
$summary.Add("Result=No natural queued tactical combat handoff found in scanned surfaces for seeds 0..$($SeedCount - 1)$matrixSuffix")
[IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::ASCII)
if ($allRows.Count -gt 0) {
  $allRows |
    Sort-Object Entry, File, Block, Seed, Facing |
    ConvertTo-Csv -NoTypeInformation |
    Set-Content -Path $notableCsvPath -Encoding ASCII
} else {
  Set-Content -Path $notableCsvPath -Encoding ASCII -Value 'Entry,File,Block,Seed,Facing,Status,Flags,Enc,Pc,Mon,Count,Pic'
}

$invalid = @($results | Where-Object { $_.Missing -gt 0 })
if ($invalid.Count -gt 0) {
  Write-Output '[ERROR] route batches with missing or invalid GBEF outputs:'
  $invalid |
    Select-Object Label, Total, Missing |
    Format-Table -AutoSize |
    Out-String -Width 120 |
    Write-Output
  throw 'DoK route scan has incomplete route evidence; refusing to pass a no-combat audit'
}

if ($queuedCombat.Count -gt 0) {
  Write-Output '[CANDIDATE] queued tactical combat routes found:'
  $queuedCombat | Sort-Object Entry, File, Block, Seed, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
  throw 'DoK route scan found a natural queued tactical route; promote it to a GBBOOT flow test'
}

if ($emptyCombat.Count -gt 0) {
  Write-Output '[INFO] empty COMBAT yields:'
  $emptyCombat | Sort-Object Entry, File, Block, Seed, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}
if ($queuedNoCombat.Count -gt 0) {
  Write-Output '[INFO] queued-monster routes that exit before COMBAT:'
  $queuedNoCombat | Sort-Object Entry, File, Block, Seed, Facing | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
}

Write-Output ("RESULT: DoK broad route scan found no natural queued tactical combat handoff in scanned {0} surfaces for seeds 0..{1}{2}" -f $surfaceList, ($SeedCount - 1), $matrixSuffix)
