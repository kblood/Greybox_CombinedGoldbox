# Isolated CCCOMBAT HLIB MONCHA declared-length and RLE integrity regression.
#
# The HLIB container uses little-endian outer/count/pointer metadata, member 0
# as the logical-id table, and member 1 as a big-endian length-prefixed MONCHA
# RLE record. Synthetic combatant bytes and expected stat pins intentionally
# match native/cccombat-glib-moncha-test.ps1.
[CmdletBinding()]
param(
  [switch]$Headless,
  [string]$ComPath,
  [string]$RepoRoot,
  [string]$RunDir
)

$ErrorActionPreference = 'Stop'
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
$root = [IO.Path]::GetFullPath($RepoRoot)
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = if ($RunDir) { [IO.Path]::GetFullPath($RunDir) } else { Join-Path $build 'cccombat-hlib-moncha-consumer-test' }
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCCOMBAT HLIB MONCHA consumer regression (DOSBox.exe absent)'
  exit 0
}
if (-not $ComPath) {
  & (Join-Path $native 'build.ps1') -Target cccombat
  if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT build failed: $LASTEXITCODE" }
  $ComPath = Join-Path $build 'cccombat.com'
}
if (-not (Test-Path -LiteralPath $ComPath -PathType Leaf)) {
  throw "CCCOMBAT binary not found: $ComPath"
}
if ($RunDir) {
  if (Test-Path -LiteralPath $run) { throw "RunDir already exists; refusing to overwrite evidence: $run" }
} else {
  $resolvedBuild = [IO.Path]::GetFullPath($build)
  if (-not $run.StartsWith($resolvedBuild + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test directory: $run"
  }
  if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path $run | Out-Null
Copy-Item -LiteralPath $ComPath -Destination (Join-Path $run 'CCCOMBAT.COM') -Force

function New-GbefCombatFixture([string]$Path) {
  [byte[]]$fx = [byte[]]::new(116)
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($fx, 0)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($fx, 4)
  [BitConverter]::GetBytes([UInt16]0x0008).CopyTo($fx, 6)
  [BitConverter]::GetBytes([UInt16]3).CopyTo($fx, 8)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx, 32)
  [BitConverter]::GetBytes([UInt16]0).CopyTo($fx, 34)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($fx, 36)
  [BitConverter]::GetBytes([UInt16]0).CopyTo($fx, 38)
  [IO.File]::WriteAllBytes($Path, $fx)
}

function New-SyntheticDqkFixedMonRecord {
  # Keep byte-for-byte aligned with the GLIB consumer fixture: HD 7 yields
  # source-derived HP 32; THAC0 1, AC -10, and damage 1d2+4 produce the pinned
  # first-round trace against the deterministic seed 4660.
  [byte[]]$raw = [byte[]]::new(422)
  [BitConverter]::GetBytes([UInt16]250).CopyTo($raw, 0x054)
  $raw[0x058] = 7
  $raw[0x066] = 1
  [Text.Encoding]::ASCII.GetBytes('RAW422 CONTROL').CopyTo($raw, 0x068)
  for ($i = 0; $i -lt 12; $i++) { $raw[0x078 + $i] = 10 }
  $raw[0x078 + 15] = 59       # THAC0 = 60 - byte = 1
  $raw[0x078 + 25] = 7         # source-derived HP = 32
  $raw[0x078 + 61] = 1         # 1d2+4
  $raw[0x078 + 63] = 2
  $raw[0x078 + 65] = 4
  $raw[0x078 + 67] = 70       # AC = 60 - byte = -10
  return ,$raw
}

function ConvertTo-MonchaRle([byte[]]$Raw) {
  $encoded = [Collections.Generic.List[byte]]::new()
  for ($offset = 0; $offset -lt $Raw.Length;) {
    $count = [Math]::Min(128, $Raw.Length - $offset)
    $encoded.Add([byte]($count - 1))
    for ($i = 0; $i -lt $count; $i++) { $encoded.Add($Raw[$offset + $i]) }
    $offset += $count
  }
  return ,$encoded.ToArray()
}

function New-HlibMonchaLibrary {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][byte[]]$Body,
    [Parameter(Mandatory)][UInt16]$DeclaredLength,
    [switch]$MissingPrefix
  )
  # HLIB pointer table is LE. Member 0 is [count=1][logical id=0][member=1].
  # The selected member has the DQK MONCHA BE u16 length before its RLE body.
  [byte[]]$idTable = @(1, 0, 0, 0, 1, 0)
  if ($MissingPrefix) {
    [byte[]]$member = $Body
  } else {
    [byte[]]$member = [byte[]]::new(2 + $Body.Length)
    $member[0] = [byte](($DeclaredLength -shr 8) -band 0xFF)
    $member[1] = [byte]($DeclaredLength -band 0xFF)
    [Array]::Copy($Body, 0, $member, 2, $Body.Length)
  }

  $member0Start = 28 # 16-byte header + three LE u32 pointer boundaries
  $member0End = $member0Start + $idTable.Length
  $member1Start = $member0End
  $member1End = $member1Start + $member.Length
  [byte[]]$file = [byte[]]::new($member1End)
  [Text.Encoding]::ASCII.GetBytes('HLIB').CopyTo($file, 0)
  [BitConverter]::GetBytes([UInt32]$file.Length).CopyTo($file, 4)
  [BitConverter]::GetBytes([UInt16]2).CopyTo($file, 8) # pointer count minus one
  $file[11] = 1
  [Text.Encoding]::ASCII.GetBytes('DATA').CopyTo($file, 12)
  foreach ($entry in @(
      @{ Index = 0; Value = $member0Start },
      @{ Index = 1; Value = $member1Start },
      @{ Index = 2; Value = $member1End }
    )) {
    [BitConverter]::GetBytes([UInt32]$entry.Value).CopyTo($file, 16 + (4 * $entry.Index))
  }
  [Array]::Copy($idTable, 0, $file, $member0Start, $idTable.Length)
  [Array]::Copy($member, 0, $file, $member1Start, $member.Length)
  [IO.File]::WriteAllBytes($Path, $file)
}

$raw422 = New-SyntheticDqkFixedMonRecord
[byte[]]$validRle = ConvertTo-MonchaRle $raw422
[byte[]]$tailRepeat = [byte[]]::new($validRle.Length + 1)
[Array]::Copy($validRle, 0, $tailRepeat, 0, $validRle.Length)
$tailRepeat[$tailRepeat.Length - 1] = 0xFF # repeat control requires a following value
[byte[]]$tailLiteral = [byte[]]::new($validRle.Length + 1)
[Array]::Copy($validRle, 0, $tailLiteral, 0, $validRle.Length)
$tailLiteral[$tailLiteral.Length - 1] = 0x01 # two-byte literal run has no payload
$noopBodyList = [Collections.Generic.List[byte]]::new()
$noopBodyList.Add(0x80) # HLIB's defined no-op control, also legal after full output
foreach ($b in $validRle) { $noopBodyList.Add($b) }
$noopBodyList.Add(0x80)
$noopBodyList.Add(0x80)
[byte[]]$noopBody = $noopBodyList.ToArray()

# This stream completes only 256 output bytes, then starts a 128-byte literal
# with four payload bytes. It is both truncated and short of the declared record.
[byte[]]$first256 = [byte[]]::new(256)
[Array]::Copy($raw422, 0, $first256, 0, $first256.Length)
$shortBody = [Collections.Generic.List[byte]]::new()
foreach ($b in (ConvertTo-MonchaRle $first256)) { $shortBody.Add($b) }
$shortBody.Add(0x7F)
foreach ($i in 0..3) { $shortBody.Add($raw422[256 + $i]) }
[byte[]]$truncatedBeforeOutput = $shortBody.ToArray()

# Exact maximum decoded size remains valid: source-pinned record followed by
# zero-filled decoded padding through MON_RAW_MAX (2048 bytes).
[byte[]]$raw2048 = [byte[]]::new(2048)
[Array]::Copy($raw422, 0, $raw2048, 0, $raw422.Length)
[byte[]]$rle2048 = ConvertTo-MonchaRle $raw2048

$cases = @(
  @{ Name='GOODBEF'; Kind='valid'; Label='valid source-derived control before malformed cases'; Body=$validRle; Declared=[UInt16]422 },
  @{ Name='OVERRUN'; Kind='bad'; Label='declared output overrun (421 declared, 422 decoded)'; Body=$validRle; Declared=[UInt16]421 },
  @{ Name='UNDERFL'; Kind='bad'; Label='declared output underflow (423 declared, 422 decoded)'; Body=$validRle; Declared=[UInt16]423 },
  @{ Name='TAILREP'; Kind='bad'; Label='dangling repeat token after complete valid output'; Body=$tailRepeat; Declared=[UInt16]422 },
  @{ Name='TAILLIT'; Kind='bad'; Label='dangling literal token after complete valid output'; Body=$tailLiteral; Declared=[UInt16]422 },
  @{ Name='TRUNC'; Kind='bad'; Label='truncated RLE run before complete record output'; Body=$truncatedBeforeOutput; Declared=[UInt16]422 },
  @{ Name='OVERCAP'; Kind='bad'; Label='declared output exceeds MON_RAW_MAX'; Body=$validRle; Declared=[UInt16]2049 },
  @{ Name='ZERO'; Kind='bad'; Label='zero declared output length'; Body=$validRle; Declared=[UInt16]0 },
  @{ Name='NOPREF'; Kind='bad'; Label='missing DQK big-endian length prefix'; Body=$validRle; Declared=[UInt16]422; MissingPrefix=$true },
  @{ Name='GOODAFT'; Kind='valid'; Label='valid source-derived control after malformed cases'; Body=$validRle; Declared=[UInt16]422 },
  @{ Name='NOOP'; Kind='valid'; Label='valid 0x80 HLIB no-op before and after exact output'; Body=$noopBody; Declared=[UInt16]422 },
  @{ Name='MAX2048'; Kind='valid'; Label='valid exact MON_RAW_MAX boundary with source record and zero padding'; Body=$rle2048; Declared=[UInt16]2048 }
)

$commands = [Collections.Generic.List[string]]::new()
foreach ($case in $cases) {
  $monName = "$($case.Name).GLB"
  $fxName = "$($case.Name).EFX"
  $traceName = "$($case.Name).TRC"
  $outName = "$($case.Name).OUT"
  $rawName = "$($case.Name).RAW"
  $txtName = "$($case.Name).TXT"
  New-GbefCombatFixture (Join-Path $run $fxName)
  New-HlibMonchaLibrary -Path (Join-Path $run $monName) -Body $case.Body `
    -DeclaredLength $case.Declared -MissingPrefix:([bool]$case.MissingPrefix)
  $commands.Add(('CCCOMBAT /E C:\{0} C:\{1} 4660 C:\{2} C:\{3} C:\{4} > C:\{5}' -f `
      $fxName, $monName, $traceName, $outName, $rawName, $txtName))
}

@"
@echo off
$($commands -join "`r`n")
exit
"@ | Set-Content -LiteralPath (Join-Path $run 'RUN.BAT') -Encoding ASCII
$conf = Join-Path $run 'cccombat-hlib-moncha-consumer.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
RUN.BAT
"@ | Set-Content -LiteralPath $conf -Encoding ASCII

$proc = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $proc.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $proc
  throw "DOSBox timed out; owned PID $($proc.Id) was stopped."
}
$proc.Refresh()
$failures = [Collections.Generic.List[string]]::new()
if ($proc.ExitCode -ne 0) { $failures.Add("DOSBox exited with code $($proc.ExitCode)") }
$validReference = $null
foreach ($case in $cases) {
  $stem = $case.Name
  $txtPath = Join-Path $run "$stem.TXT"
  $tracePath = Join-Path $run "$stem.TRC"
  $outPath = Join-Path $run "$stem.OUT"
  $rawPath = Join-Path $run "$stem.RAW"
  $message = if (Test-Path -LiteralPath $txtPath) { [IO.File]::ReadAllText($txtPath).Trim() } else { '<missing TXT>' }
  $traceExists = Test-Path -LiteralPath $tracePath
  $outExists = Test-Path -LiteralPath $outPath

  if ($case.Kind -eq 'bad') {
    $bad = @()
    if ($message -cne 'bad effect') { $bad += "expected exact 'bad effect', got '$message'" }
    foreach ($suffix in @('.TRC', '.OUT', '.RAW', '.GBR')) {
      if (Test-Path -LiteralPath (Join-Path $run "$stem$suffix")) { $bad += "published $stem$suffix" }
    }
    if ($bad.Count) { $failures.Add("$($case.Label): $($bad -join '; ')") }
    else { Write-Output "[PASS] $($case.Label): exact rejection, no trace/outcome artifacts" }
    continue
  }

  $bad = @()
  if (-not $traceExists -or -not $outExists -or -not (Test-Path -LiteralPath $rawPath)) {
    $bad += 'missing trace/outcome/raw control artifact'
  } else {
    $trace = [IO.File]::ReadAllText($tracePath)
    foreach ($needle in @(
        '1 attack p0 e0 17 25 0 - 32 -',
        '1 attack e0 p0 12 -4 1 5 9 -'
      )) {
      if (-not $trace.Contains($needle)) { $bad += "missing source-derived stat pin '$needle'" }
    }
    $outcome = [IO.File]::ReadAllText($outPath).Trim()
    if (@('party', 'enemy', 'draw') -notcontains $outcome) { $bad += "invalid outcome '$outcome'" }
    [byte[]]$frame = [IO.File]::ReadAllBytes($rawPath)
    if ($frame.Length -ne (4 + (320 * 200) + 768) -or
        [BitConverter]::ToUInt16($frame, 0) -ne 320 -or
        [BitConverter]::ToUInt16($frame, 2) -ne 200) {
      $bad += 'invalid 320x200 RAW frame header/length'
    } else {
      $nonZero = 0
      for ($i = 4; $i -lt (4 + (320 * 200)); $i++) { if ($frame[$i] -ne 0) { $nonZero++ } }
      if ($nonZero -lt 512) { $bad += "implausibly blank RAW frame ($nonZero nonzero pixels)" }
    }
    $hashes = @{
      trace = (Get-FileHash -LiteralPath $tracePath -Algorithm SHA256).Hash
      outcome = (Get-FileHash -LiteralPath $outPath -Algorithm SHA256).Hash
      raw = (Get-FileHash -LiteralPath $rawPath -Algorithm SHA256).Hash
    }
    if ($validReference -and ($hashes.trace -ne $validReference.trace -or
        $hashes.outcome -ne $validReference.outcome -or $hashes.raw -ne $validReference.raw)) {
      $bad += 'trace/outcome/frame differs from the first valid source-derived control'
    }
    if (-not $validReference) { $validReference = $hashes }
  }
  if ($bad.Count) { $failures.Add("$($case.Label): $($bad -join '; ')") }
  else { Write-Output "[PASS] $($case.Label): pinned trace, outcome, and frame match" }
}

$summary = [Collections.Generic.List[string]]::new()
$summary.Add("DOSBox exit=$($proc.ExitCode)")
$summary.Add("CCCOMBAT SHA256=$((Get-FileHash -LiteralPath (Join-Path $run 'CCCOMBAT.COM') -Algorithm SHA256).Hash.ToLowerInvariant())")
foreach ($case in $cases) {
  $stem = $case.Name
  $txt = if (Test-Path (Join-Path $run "$stem.TXT")) { [IO.File]::ReadAllText((Join-Path $run "$stem.TXT")).Trim() } else { '<missing TXT>' }
  $summary.Add("$stem ($($case.Kind)): trace=$([bool](Test-Path (Join-Path $run "$stem.TRC"))) outcome=$([bool](Test-Path (Join-Path $run "$stem.OUT"))) message=$txt")
}
if ($failures.Count) {
  foreach ($failure in $failures) { $summary.Add("FAIL: $failure"); Write-Output "FAIL: $failure" }
  $summary | Set-Content -LiteralPath (Join-Path $run 'summary.txt') -Encoding UTF8
  throw "CCCOMBAT HLIB MONCHA consumer regression failed with $($failures.Count) assertion(s). See $run\summary.txt"
}
$summary.Add('RESULT: CCCOMBAT HLIB MONCHA declared-length and RLE integrity regression PASS')
$summary | Set-Content -LiteralPath (Join-Path $run 'summary.txt') -Encoding UTF8
Write-Output 'RESULT: CCCOMBAT HLIB MONCHA declared-length and RLE integrity regression PASS'
