# ccfp-effects-test.ps1 -- headless smoke test for CCFP /E textured walls.
#
# For CoK and DoK, copy the needed Gen1 DAX files into a scratch DOSBox drive,
# run CCECL -> CCGEO -> CCFP /E /T /R, and verify the texture tables are dumped.
# The original game directories are not modified.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "ccfp-effects-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccecl
& (Join-Path $native "build.ps1") -Target ccgeo
& (Join-Path $native "build.ps1") -Target ccfp
& (Join-Path $native "build.ps1") -Target cchlib
& (Join-Path $native "build.ps1") -Target ccflow

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

$cases = @(
  @{ Label = "COK"; Dir = (Join-Path $root "Champions of Krynn"); Geo = 34; EffectGeo = 34 },
  @{ Label = "DOK"; Dir = (Join-Path $root "Death Knights of Krynn"); Geo = 34; EffectGeo = 34 }
)

function Assert-GbEffect([string]$Path, [int]$ExpectedGeo, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: effect file missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $geo = [BitConverter]::ToUInt16($bytes, 10)
  if ($bytes.Length -lt 32 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "GBEF" -or $geo -ne $ExpectedGeo) {
    throw "$Label failed: unexpected effect file"
  }
}

function Assert-MoveTrace([string]$Path, [int]$ExpectedLines, [int]$MaxX, [int]$MaxY, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: movement trace missing"
  }
  $lines = @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 })
  if ($lines.Count -ne $ExpectedLines) {
    throw "$Label failed: expected $ExpectedLines trace lines, got $($lines.Count)"
  }
  $distinct = @($lines | Select-Object -Unique)
  if ($distinct.Count -lt 2) {
    throw "$Label failed: movement trace never changed pose"
  }
  foreach ($line in $lines) {
    if ($line -notmatch '^(-?\d+) (-?\d+) ([0-3])$') {
      throw "$Label failed: malformed trace line '$line'"
    }
    $x = [int]$matches[1]
    $y = [int]$matches[2]
    if ($x -lt 0 -or $x -ge $MaxX -or $y -lt 0 -or $y -ge $MaxY) {
      throw "$Label failed: trace pose out of bounds '$line' for ${MaxX}x${MaxY}"
    }
  }
}

function Assert-MoveTraceExact([string]$Path, [string[]]$Expected, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: movement trace missing"
  }
  $lines = @(Get-Content $Path | Where-Object { $_.Trim().Length -gt 0 })
  if ($lines.Count -ne $Expected.Count) {
    throw "$Label failed: expected $($Expected.Count) trace lines, got $($lines.Count)"
  }
  for ($i = 0; $i -lt $Expected.Count; $i++) {
    if ($lines[$i].Trim() -ne $Expected[$i]) {
      throw "$Label failed: line $i expected '$($Expected[$i])', got '$($lines[$i])'"
    }
  }
}

function Add-GbsxTextSlot([string]$SourcePath, [string]$TargetPath, [string[]]$Text) {
  $bytes = [IO.File]::ReadAllBytes($SourcePath)
  function Set-Ascii([int]$Offset, [string]$Value) {
    [Text.Encoding]::ASCII.GetBytes($Value).CopyTo($bytes, $Offset)
  }
  function Set-U16([int]$Offset, [int]$Value) {
    [BitConverter]::GetBytes([UInt16]$Value).CopyTo($bytes, $Offset)
  }

  $scriptOffset = 2246
  $eventOffset = 2252
  $textOffset = 3532 # 2252 + 64 GBSX records * 20
  Set-Ascii $scriptOffset "GBSX"
  Set-U16 ($scriptOffset + 4) $Text.Count
  for ($i = 0; $i -lt $Text.Count; $i++) {
    $event = $eventOffset + ($i * 20)
    $slot = $textOffset + ($i * 34)
    Set-U16 $event 0x11
    Set-U16 ($event + 2) 1
    Set-U16 ($event + 4) $Text[$i].Length
    $raw = [Text.Encoding]::ASCII.GetBytes($Text[$i])
    Set-U16 $slot $raw.Length
    $raw.CopyTo($bytes, $slot + 2)
  }
  [IO.File]::WriteAllBytes($TargetPath, $bytes)
}

function Set-GbsxEventOpcode([string]$Path, [int]$Slot, [int]$Opcode) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($Slot -lt 0 -or $Slot -ge 64) { throw "GBSX event slot out of range: $Slot" }
  [BitConverter]::GetBytes([UInt16]$Opcode).CopyTo($bytes, 2252 + ($Slot * 20))
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-Gbsl([string]$Path, [int]$Count, [string[]]$Text) {
  if ($Count -lt $Text.Count) { throw "GBSL count must cover every text record" }
  $bytes = [byte[]]::new(8 + ($Count * 54))
  [Text.Encoding]::ASCII.GetBytes("GBSL").CopyTo($bytes, 0)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([UInt16]$Count).CopyTo($bytes, 6)
  for ($i = 0; $i -lt $Count; $i++) {
    $record = 8 + ($i * 54)
    if ($i -lt $Text.Count) {
      [BitConverter]::GetBytes([UInt16]0x11).CopyTo($bytes, $record)
      [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, $record + 2)
      $raw = [Text.Encoding]::ASCII.GetBytes($Text[$i])
      [BitConverter]::GetBytes([UInt16]$raw.Length).CopyTo($bytes, $record + 4)
      [BitConverter]::GetBytes([UInt16]$raw.Length).CopyTo($bytes, $record + 20)
      $raw.CopyTo($bytes, $record + 22)
    } else {
      # The stream crosses two historical 64-event caps.  A picture tail also
      # confirms CCFP scans the complete source order rather than a GBSX tail.
      [BitConverter]::GetBytes([UInt16]0x0e).CopyTo($bytes, $record)
      [BitConverter]::GetBytes([UInt16]1).CopyTo($bytes, $record + 2)
      [BitConverter]::GetBytes([UInt16]($i + 1)).CopyTo($bytes, $record + 4)
    }
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Set-GbslFlag([string]$SourcePath, [string]$TargetPath) {
  # A renderer that incorrectly uses the terminal GBSX tail will show TAIL,
  # rather than the two source records retained in the sibling stream.
  Add-GbsxTextSlot $SourcePath $TargetPath @("TAIL")
  $bytes = [IO.File]::ReadAllBytes($TargetPath)
  [BitConverter]::GetBytes([UInt16]([BitConverter]::ToUInt16($bytes, 6) -bor 0x0100)).CopyTo($bytes, 6)
  [IO.File]::WriteAllBytes($TargetPath, $bytes)
}

function Add-GbesSetupTail([string]$SourcePath, [string]$TargetPath, [int]$Distance) {
  $bytes = [IO.File]::ReadAllBytes($SourcePath)
  function Set-Ascii([int]$Offset, [string]$Value) {
    [Text.Encoding]::ASCII.GetBytes($Value).CopyTo($bytes, $Offset)
  }
  function Set-U16([int]$Offset, [int]$Value) {
    [BitConverter]::GetBytes([UInt16]$Value).CopyTo($bytes, $Offset)
  }

  $flags = [BitConverter]::ToUInt16($bytes, 6)
  Set-U16 6 ($flags -bor 0x0040)
  $setupOffset = 5708 # textOffset + 64 text slots * 34
  Set-Ascii $setupOffset "GBES"
  Set-U16 ($setupOffset + 4) 9
  Set-U16 ($setupOffset + 6) 3
  Set-U16 ($setupOffset + 8) 5
  Set-U16 ($setupOffset + 10) $Distance
  [IO.File]::WriteAllBytes($TargetPath, $bytes)
}

function Add-GbclClockTail([string]$SourcePath, [string]$TargetPath, [int[]]$Slots) {
  $bytes = [IO.File]::ReadAllBytes($SourcePath)
  function Set-Ascii([int]$Offset, [string]$Value) {
    [Text.Encoding]::ASCII.GetBytes($Value).CopyTo($bytes, $Offset)
  }
  function Set-U16([int]$Offset, [int]$Value) {
    [BitConverter]::GetBytes([UInt16]$Value).CopyTo($bytes, $Offset)
  }

  Set-U16 4 9
  $flags = [BitConverter]::ToUInt16($bytes, 6)
  Set-U16 6 ($flags -bor 0x0080)
  $clockOffset = 5732
  Set-Ascii $clockOffset "GBCL"
  for ($i = 0; $i -lt 7; $i++) {
    Set-U16 ($clockOffset + 4 + ($i * 2)) $Slots[$i]
  }
  [IO.File]::WriteAllBytes($TargetPath, $bytes)
}

function Write-OpenWallGrid([string]$Path) {
  $bytes = [byte[]]::new(6 + (16 * 16 * 4))
  [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($bytes, 0)
  $bytes[4] = 16
  $bytes[5] = 16
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-RoofedWallGrid([string]$Path) {
  $cellCount = 16 * 16
  $bytes = [byte[]]::new(6 + ($cellCount * 4) + $cellCount)
  [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($bytes, 0)
  $bytes[4] = 16
  $bytes[5] = 16
  $roofBase = 6 + ($cellCount * 4)
  $bytes[$roofBase + (13 * 16) + 8] = 0x80
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-DoorWallGrid([string]$Path, [byte]$DoorFlag, [switch]$IncludeDoorTail) {
  $cellCount = 16 * 16
  $length = 6 + ($cellCount * 4) + $cellCount
  if ($IncludeDoorTail) { $length += $cellCount }
  $bytes = [byte[]]::new($length)
  [Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($bytes, 0)
  $bytes[4] = 16
  $bytes[5] = 16
  $cell = (13 * 16) + 8
  $bytes[6 + ($cell * 4)] = 1
  if ($IncludeDoorTail) {
    $doorBase = 6 + ($cellCount * 4) + $cellCount
    $bytes[$doorBase + $cell] = $DoorFlag
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Add-MenuByte([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  [void]$Bytes.Add([byte]($Value -band 0xff))
}
function Add-MenuImm([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  Add-MenuByte $Bytes 0
  Add-MenuByte $Bytes $Value
}
function Add-MenuU16([System.Collections.Generic.List[byte]]$Bytes, [int]$Value) {
  Add-MenuByte $Bytes $Value
  Add-MenuByte $Bytes ($Value -shr 8)
}
function Add-MenuVarRef([System.Collections.Generic.List[byte]]$Bytes, [int]$Address) {
  Add-MenuByte $Bytes 3
  Add-MenuU16 $Bytes $Address
}
function Write-NumericGen2Hlib([string]$Path) {
  # One-area HLIB with a true 20-byte Gen2 ECL header and producer-shaped
  # INPUT_NUMBER(metadata=3,destination=MEM[010C]) event.
  $block = [System.Collections.Generic.List[byte]]::new()
  1..20 | ForEach-Object { Add-MenuByte $block 0 }
  # Force a genuine CCFLOW status-4 checkpoint, which starts the sidecar
  # stream before the terminal numeric menu is yielded.
  for ($i = 1; $i -le 64; $i++) {
    Add-MenuByte $block 0x0e
    Add-MenuImm $block $i
  }
  Add-MenuByte $block 0x0f
  Add-MenuImm $block 3
  Add-MenuVarRef $block 0x010c
  Add-MenuByte $block 0
  $idTable = [System.Collections.Generic.List[byte]]::new()
  Add-MenuU16 $idTable 1
  Add-MenuU16 $idTable 1
  Add-MenuU16 $idTable 1
  $firstMember = 28 + $idTable.Count
  $eof = $firstMember + $block.Count
  $container = [System.Collections.Generic.List[byte]]::new()
  foreach ($b in [Text.Encoding]::ASCII.GetBytes('HLIB')) { Add-MenuByte $container $b }
  Add-MenuU16 $container $eof
  Add-MenuU16 $container ($eof -shr 16)
  Add-MenuU16 $container 2
  Add-MenuByte $container 0
  Add-MenuByte $container 1
  foreach ($b in [Text.Encoding]::ASCII.GetBytes('HLIB')) { Add-MenuByte $container $b }
  Add-MenuU16 $container 28
  Add-MenuU16 $container 0
  Add-MenuU16 $container $firstMember
  Add-MenuU16 $container 0
  Add-MenuU16 $container $eof
  Add-MenuU16 $container 0
  foreach ($b in $idTable) { Add-MenuByte $container $b }
  foreach ($b in $block) { Add-MenuByte $container $b }
  if ($container.Count -ne $eof) { throw 'numeric Gen2 HLIB extent is inconsistent' }
  [IO.File]::WriteAllBytes($Path, $container.ToArray())
}

function Write-QueuedNumericKeys([string]$Path, [string]$Digits) {
  $scan = @{ '0' = 0x0b; '1' = 0x02; '2' = 0x03; '3' = 0x04; '4' = 0x05; '5' = 0x06; '6' = 0x07; '7' = 0x08; '8' = 0x09; '9' = 0x0a }
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($b in [byte[]]@(0xb9, 0x0d, 0x1c, 0xb4, 0x05, 0xcd, 0x16)) { [void]$bytes.Add($b) }
  foreach ($line in $Digits.Split(',')) {
    foreach ($digit in $line.ToCharArray()) {
      $value = [int][char]$digit
      foreach ($b in [byte[]]@(0xb9, ($value -band 0xff), $scan[[string]$digit], 0xb4, 0x05, 0xcd, 0x16)) { [void]$bytes.Add($b) }
    }
    foreach ($b in [byte[]]@(0xb9, 0x0d, 0x1c, 0xb4, 0x05, 0xcd, 0x16)) { [void]$bytes.Add($b) }
  }
  foreach ($b in [byte[]]@(0xb8, 0x00, 0x4c, 0xcd, 0x21)) { [void]$bytes.Add($b) }
  [IO.File]::WriteAllBytes($Path, $bytes.ToArray())
}
function Invoke-HeadlessBatch([string]$Directory, [string]$BatchName, [string]$ConfName, [int]$TimeoutMs) {
  $conf = Join-Path $Directory $ConfName
  $lines = @('[sdl]', 'fullscreen=false', 'output=surface', 'autolock=false',
    '[cpu]', 'cycles=fixed 50000', '[autoexec]', "mount C `"$Directory`"", 'C:', "CALL C:\$BatchName", 'exit')
  [IO.File]::WriteAllText($conf, ($lines -join "`r`n"), [Text.Encoding]::ASCII)
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit($TimeoutMs)) { try { $p.Kill() } catch {}; throw "DOSBox timed out running $BatchName" }
}

function Invoke-NumericCcfpControl([string]$BaseRun) {
  $menuRun = Join-Path $BaseRun 'numeric-ack'
  New-Item -ItemType Directory -Force $menuRun | Out-Null
  foreach ($tool in 'CCECL', 'CCFLOW', 'CCFP') {
    Copy-Item (Join-Path $build ($tool.ToLower() + '.com')) (Join-Path $menuRun "$tool.COM") -Force
  }
  Write-NumericGen2Hlib (Join-Path $menuRun 'NUM.GLB')
  [IO.File]::WriteAllLines((Join-Path $menuRun 'FLOW.BAT'), @(
    '@ECHO OFF', 'CCFLOW C:\NUM.GLB 1 /! /E C:\NUM.EFX > C:\FLOW.TXT',
    'IF ERRORLEVEL 1 GOTO FLOWFAIL', 'ECHO FLOW_OK>C:\FLOW.OK', 'GOTO FLOWEND',
    ':FLOWFAIL', 'ECHO FLOW_FAIL>C:\FLOW.OK', ':FLOWEND'), [Text.Encoding]::ASCII)
  Invoke-HeadlessBatch $menuRun 'FLOW.BAT' '_flow.conf' 60000
  if ((Get-Content (Join-Path $menuRun 'FLOW.OK') -Raw).Trim() -ne 'FLOW_OK') {
    throw "CCFLOW did not produce numeric pending state: $(Get-Content (Join-Path $menuRun 'FLOW.TXT') -Raw)"
  }

  $pendingPath = Join-Path $menuRun 'NUM.EFX'
  $sidecarPath = Join-Path $menuRun 'NUM.GBS'
  if (-not (Test-Path $sidecarPath)) { throw 'CCFLOW numeric producer omitted NUM.GBS sidecar' }
  $pending = [IO.File]::ReadAllBytes($pendingPath)
  $side = [IO.File]::ReadAllBytes($sidecarPath)
  if ($pending.Length -ne 5932 -or [Text.Encoding]::ASCII.GetString($pending, 0, 4) -ne 'GBEF' -or
      [BitConverter]::ToUInt16($pending, 4) -ne 15 -or [BitConverter]::ToUInt16($pending, 8) -ne 2 -or
      ([BitConverter]::ToUInt16($pending, 6) -band 0x0100) -eq 0 -or
      [BitConverter]::ToUInt16($pending, 5758) -ne 0 -or [BitConverter]::ToUInt16($pending, 5760) -ne 0x0f -or
      [BitConverter]::ToUInt16($pending, 5770) -ne 0x010c -or [BitConverter]::ToUInt16($pending, 5772) -ne 0x0f) {
    throw 'CCFLOW numeric producer returned the wrong v15 pending-menu shape'
  }
  if ($side.Length -lt 62 -or [Text.Encoding]::ASCII.GetString($side, 0, 4) -ne 'GBSL' -or
      [BitConverter]::ToUInt16($side, 4) -ne 1 -or [BitConverter]::ToUInt16($side, 6) -lt 65) {
    throw 'CCFLOW did not publish a valid GBSL sidecar with the numeric menu'
  }
  $pendingHash = (Get-FileHash $pendingPath -Algorithm SHA256).Hash
  $sideHash = (Get-FileHash $sidecarPath -Algorithm SHA256).Hash

  # No guest key injection: /S must finish the real CCFLOW pending bundle.
  # Challenge the final stream row against its frozen GBEF event/text.
  # Earlier events have no inline counterpart after the capacity flush;
  # their admission checks framing, rather than historical byte equality.
  $rowSide = [byte[]]$side.Clone()
  $textSide = [byte[]]$side.Clone()
  $earlySide = [byte[]]$side.Clone()
  $finalRow = 8 + (([BitConverter]::ToUInt16($side, 6) - 1) * 54)
  $rowWord = $finalRow + 4
  [BitConverter]::GetBytes([UInt16]([BitConverter]::ToUInt16($rowSide, $rowWord) -bxor 1)).CopyTo($rowSide, $rowWord)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($textSide, ($finalRow + 20))
  $textSide[$finalRow + 22] = 4
  [BitConverter]::GetBytes([UInt16]33).CopyTo($earlySide, (8 + 20))
  foreach ($clone in @(@{ Name = 'ROWDIFF'; Bytes = $rowSide }, @{ Name = 'TXTDIFF'; Bytes = $textSide },
                      @{ Name = 'EARLYBAD'; Bytes = $earlySide })) {
    [IO.File]::WriteAllBytes((Join-Path $menuRun ($clone.Name + '.EFX')), $pending)
    [IO.File]::WriteAllBytes((Join-Path $menuRun ($clone.Name + '.GBS')), $clone.Bytes)
  }
  $autoCases = @(
    @{ Name = 'AZERO'; Source = 'NUM'; Option = '/S0'; Expected = 0 },
    @{ Name = 'A1234'; Source = 'NUM'; Option = '/S1234'; Expected = 1234 },
    @{ Name = 'AMAX'; Source = 'NUM'; Option = '/S65535'; Expected = 65535 },
    @{ Name = 'OVRFLOW'; Source = 'NUM'; Option = '/S65536'; Expected = $null },
    @{ Name = 'JUNK'; Source = 'NUM'; Option = '/S1234x'; Expected = $null },
    @{ Name = 'MISSING'; Source = 'NUM'; Option = '/S'; Expected = $null },
    @{ Name = 'ROWDIFF'; Source = 'ROWDIFF'; Option = '/S1234'; Expected = $null },
    @{ Name = 'TXTDIFF'; Source = 'TXTDIFF'; Option = '/S1234'; Expected = $null },
    @{ Name = 'EARLYBAD'; Source = 'EARLYBAD'; Option = '/S1234'; Expected = $null }
  )
  $autoBatch = [Collections.Generic.List[string]]::new()
  $autoBatch.Add('@ECHO OFF')
  $sentinel = [Text.Encoding]::ASCII.GetBytes('previous acknowledged answer')
  foreach ($case in $autoCases) {
    $name = $case.Name
    [IO.File]::WriteAllBytes((Join-Path $menuRun "$name.GMO"), $sentinel)
    $case.InputHashes = @(
      (Get-FileHash (Join-Path $menuRun ($case.Source + '.EFX')) -Algorithm SHA256).Hash,
      (Get-FileHash (Join-Path $menuRun ($case.Source + '.GBS')) -Algorithm SHA256).Hash
    )
    $autoBatch.Add("CCFP C:\$($case.Source).EFX C:\$name.GMO $($case.Option) > C:\$name.TXT")
    $autoBatch.Add("IF ERRORLEVEL 1 GOTO R$name")
    $autoBatch.Add("ECHO GUEST_OK>C:\$name.OK")
    $autoBatch.Add("GOTO D$name")
    $autoBatch.Add(":R$name")
    $autoBatch.Add("ECHO GUEST_FAIL>C:\$name.OK")
    $autoBatch.Add(":D$name")
  }
  [IO.File]::WriteAllLines((Join-Path $menuRun 'AUTO.BAT'), $autoBatch, [Text.Encoding]::ASCII)
  Invoke-HeadlessBatch $menuRun 'AUTO.BAT' '_auto.conf' 30000
  foreach ($case in $autoCases) {
    $name = $case.Name
    $guestResult = (Get-Content (Join-Path $menuRun "$name.OK") -Raw).Trim()
    $autoToken = [IO.File]::ReadAllBytes((Join-Path $menuRun "$name.GMO"))
    if ($null -eq $case.Expected) {
      if ($guestResult -ne 'GUEST_FAIL' -or
          [Convert]::ToBase64String($autoToken) -ne [Convert]::ToBase64String($sentinel)) {
        throw "$name CCFP accepted invalid automated input or replaced an acknowledged answer"
      }
    } else {
      if ($guestResult -ne 'GUEST_OK' -or $autoToken.Length -ne 18 -or
          [Text.Encoding]::ASCII.GetString($autoToken, 0, 4) -ne 'GBMO' -or
          [BitConverter]::ToUInt16($autoToken, 4) -ne 2 -or
          [BitConverter]::ToUInt16($autoToken, 6) -ne $case.Expected -or
          [BitConverter]::ToUInt16($autoToken, 8) -ne 0) {
        throw "$name CCFP no-key numeric automation did not produce the exact answer"
      }
      foreach ($pair in @(@(10, 5766), @(12, 5768), @(14, 5770), @(16, 5772))) {
        if ([BitConverter]::ToUInt16($autoToken, $pair[0]) -ne [BitConverter]::ToUInt16($pending, $pair[1])) {
          throw "$name CCFP no-key numeric identity mismatch at offset $($pair[0])"
        }
      }
    }
    if ((Get-FileHash (Join-Path $menuRun ($case.Source + '.EFX')) -Algorithm SHA256).Hash -ne $case.InputHashes[0] -or
        (Get-FileHash (Join-Path $menuRun ($case.Source + '.GBS')) -Algorithm SHA256).Hash -ne $case.InputHashes[1]) {
      throw "$name CCFP automation mutated its pending effect or stream"
    }
  }
  Write-Output '[PASS] CCFLOW -> CCFP no-key /S0/1234/65535 exact GBMO; malformed scalar, final stream row/text mismatch and earlier invalid framing retain acknowledged answers and inputs'

  $badPending = [byte[]]$pending.Clone()
  [BitConverter]::GetBytes([UInt16]1).CopyTo($badPending, 5758)
  $badPendingPath = Join-Path $menuRun 'BAD.EFX'
  $badSidecarPath = Join-Path $menuRun 'BAD.GBS'
  [IO.File]::WriteAllBytes($badPendingPath, $badPending)
  Copy-Item $sidecarPath $badSidecarPath -Force
  $badHash = (Get-FileHash $badPendingPath -Algorithm SHA256).Hash
  $badSideHash = (Get-FileHash $badSidecarPath -Algorithm SHA256).Hash

  $typedCcfpCases = @(
    @{ Name = 'TYPZERO'; Keys = 'KZERO.COM'; Input = '0'; Expected = 0 },
    @{ Name = 'TYP1234'; Keys = 'K1234.COM'; Input = '1234'; Expected = 1234 },
    @{ Name = 'TYPMAX'; Keys = 'KMAX.COM'; Input = '65535'; Expected = 65535 },
    @{ Name = 'TYPOVR'; Keys = 'KOVR.COM'; Input = '65536,0'; Expected = 0 }
  )
  foreach ($case in $typedCcfpCases) {
    Write-QueuedNumericKeys (Join-Path $menuRun $case.Keys) $case.Input
  }
  Write-QueuedNumericKeys (Join-Path $menuRun 'KEYS.COM') '750'
  [IO.File]::WriteAllLines((Join-Path $menuRun 'GOOD.BAT'), @(
    '@ECHO OFF', 'KEYS.COM', 'CCFP C:\NUM.EFX C:\NUM.GMO > C:\GOOD.TXT',
    'IF ERRORLEVEL 1 GOTO GOODFAIL', 'ECHO GUEST_OK>C:\GOOD.OK', 'GOTO GOODEND',
    ':GOODFAIL', 'ECHO GUEST_FAIL>C:\GOOD.OK', ':GOODEND'), [Text.Encoding]::ASCII)
  Invoke-HeadlessBatch $menuRun 'GOOD.BAT' '_good.conf' 30000
  if ((Get-Content (Join-Path $menuRun 'GOOD.OK') -Raw).Trim() -ne 'GUEST_OK') {
    throw "CCFP numeric UI failed after guest key queue: $(Get-Content (Join-Path $menuRun 'GOOD.TXT') -Raw)"
  }
  $token = [IO.File]::ReadAllBytes((Join-Path $menuRun 'NUM.GMO'))
  if ($token.Length -ne 18 -or [Text.Encoding]::ASCII.GetString($token, 0, 4) -ne 'GBMO' -or
      [BitConverter]::ToUInt16($token, 4) -ne 2 -or [BitConverter]::ToUInt16($token, 6) -ne 750 -or
      [BitConverter]::ToUInt16($token, 8) -ne 0) { throw 'CCFP did not write the exact free-number GBMO v2 token' }
  foreach ($pair in @(@(10, 5766), @(12, 5768), @(14, 5770), @(16, 5772))) {
    if ([BitConverter]::ToUInt16($token, $pair[0]) -ne [BitConverter]::ToUInt16($pending, $pair[1])) {
      throw "CCFP numeric GBMO identity mismatch at token offset $($pair[0])"
    }
  }
  if ((Get-FileHash $pendingPath -Algorithm SHA256).Hash -ne $pendingHash -or
      (Get-FileHash $sidecarPath -Algorithm SHA256).Hash -ne $sideHash) {
    throw 'CCFP numeric UI mutated its CCFLOW pending effect or sidecar'
  }

  $typedBatch = [Collections.Generic.List[string]]::new()
  $typedBatch.Add('@ECHO OFF')
  foreach ($case in $typedCcfpCases) {
    $name = $case.Name
    $typedBatch.Add($case.Keys)
    $typedBatch.Add("CCFP C:\NUM.EFX C:\$name.GMO > C:\$name.TXT")
    $typedBatch.Add("IF ERRORLEVEL 1 GOTO R$name")
    $typedBatch.Add("ECHO GUEST_OK>C:\$name.OK")
    $typedBatch.Add("GOTO D$name")
    $typedBatch.Add(":R$name")
    $typedBatch.Add("ECHO GUEST_FAIL>C:\$name.OK")
    $typedBatch.Add(":D$name")
  }
  [IO.File]::WriteAllLines((Join-Path $menuRun 'TYPED.BAT'), $typedBatch, [Text.Encoding]::ASCII)
  Invoke-HeadlessBatch $menuRun 'TYPED.BAT' '_typed.conf' 30000
  foreach ($case in $typedCcfpCases) {
    $name = $case.Name
    if ((Get-Content (Join-Path $menuRun "$name.OK") -Raw).Trim() -ne 'GUEST_OK') {
      throw "$name CCFP numeric input did not complete: $(Get-Content (Join-Path $menuRun "$name.TXT") -Raw)"
    }
    $typedToken = [IO.File]::ReadAllBytes((Join-Path $menuRun "$name.GMO"))
    if ($typedToken.Length -ne 18 -or [Text.Encoding]::ASCII.GetString($typedToken, 0, 4) -ne 'GBMO' -or
        [BitConverter]::ToUInt16($typedToken, 4) -ne 2 -or [BitConverter]::ToUInt16($typedToken, 6) -ne $case.Expected -or
        [BitConverter]::ToUInt16($typedToken, 8) -ne 0) { throw "$name CCFP numeric GBMO fields are wrong" }
    foreach ($pair in @(@(10, 5766), @(12, 5768), @(14, 5770), @(16, 5772))) {
      if ([BitConverter]::ToUInt16($typedToken, $pair[0]) -ne [BitConverter]::ToUInt16($pending, $pair[1])) {
        throw "$name CCFP numeric token identity mismatch at offset $($pair[0])"
      }
    }
  }
  $overflowLog = Get-Content (Join-Path $menuRun 'TYPOVR.TXT') -Raw
  if ($overflowLog -notmatch '65536' -or $overflowLog -notmatch 'Invalid choice') {
    throw 'CCFP typed overflow did not reject 65536 before accepting 0'
  }
  if ((Get-FileHash $pendingPath -Algorithm SHA256).Hash -ne $pendingHash -or
      (Get-FileHash $sidecarPath -Algorithm SHA256).Hash -ne $sideHash) {
    throw 'CCFP typed number UI mutated pending effect or sidecar'
  }
  Write-Output '[PASS] CCFLOW -> CCFP typed numeric 0/1234/65535; 65536 rejected then 0 accepted; exact GBMO identities and EFX/GBS hashes'
  Write-QueuedNumericKeys (Join-Path $menuRun 'KEYS.COM') '0'
  [IO.File]::WriteAllLines((Join-Path $menuRun 'BAD.BAT'), @(
    '@ECHO OFF', 'KEYS.COM', 'CCFP C:\BAD.EFX C:\BAD.GMO > C:\BAD.TXT',
    'IF ERRORLEVEL 1 GOTO BADFAIL', 'ECHO GUEST_OK>C:\BAD.OK', 'GOTO BADEND',
    ':BADFAIL', 'ECHO GUEST_FAIL>C:\BAD.OK', ':BADEND'), [Text.Encoding]::ASCII)
  Invoke-HeadlessBatch $menuRun 'BAD.BAT' '_bad.conf' 30000
  if ((Get-Content (Join-Path $menuRun 'BAD.OK') -Raw).Trim() -ne 'GUEST_FAIL' -or
      (Get-Content (Join-Path $menuRun 'BAD.TXT') -Raw) -notmatch 'cannot open walls file') {
    throw 'CCFP did not reject count1 numeric pending state before waiting for input'
  }
  if (Test-Path (Join-Path $menuRun 'BAD.GMO')) { throw 'CCFP published a token for count1 numeric input' }
  if ((Get-FileHash $badPendingPath -Algorithm SHA256).Hash -ne $badHash -or
      (Get-FileHash $badSidecarPath -Algorithm SHA256).Hash -ne $badSideHash) {
    throw 'CCFP count1 rejection mutated pending effect or sidecar'
  }
  Write-Output '[PASS] CCFLOW -> CCFP numeric: guest-queued 750 yields GBMO v2; count1 rejected with inputs unchanged'
}

function Assert-TextOverlayRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: CCFPVIEW.RAW missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid CCFPVIEW.RAW header/length"
  }
  $lit = 0
  for ($y = 176; $y -lt 200; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 0; $x -lt 320; $x++) {
      if ($bytes[$row + $x] -ne 0) { $lit++ }
    }
  }
  if ($lit -lt 20) {
    throw "$Label failed: expected visible text pixels in the message band"
  }
}

function Assert-NoTextOverlayRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label failed: CCFPVIEW.RAW missing" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $lit = 0
  for ($y = 176; $y -lt 200; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 0; $x -lt 320; $x++) {
      if ($bytes[$row + $x] -ne 0) { $lit++ }
    }
  }
  if ($lit -ge 20) { throw "$Label failed: malformed GBSL rendered message-band pixels" }
}

function Assert-SkyBackdropRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid RAW header/length"
  }
  if ($bytes[4 + (12 * 320) + 12] -ne 11) {
    throw "$Label failed: expected blue sky band"
  }
  if ($bytes[4 + (70 * 320) + 12] -ne 8) {
    throw "$Label failed: expected floor below sky horizon"
  }
  $sun = 0
  for ($y = 24; $y -lt 32; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 88; $x -lt 96; $x++) {
      if ($bytes[$row + $x] -eq 14) { $sun++ }
    }
  }
  if ($sun -lt 64) {
    throw "$Label failed: expected 8x8 sunrise body, found $sun yellow pixels"
  }
}

function Assert-RoofedSkyRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid RAW header/length"
  }
  if ($bytes[4 + (12 * 320) + 12] -ne 0) {
    throw "$Label failed: expected roofed black ceiling"
  }
  if ($bytes[4 + (70 * 320) + 12] -ne 8) {
    throw "$Label failed: expected floor below roofed horizon"
  }
  $sky = 0
  for ($y = 8; $y -lt 70; $y++) {
    $row = 4 + ($y * 320)
    for ($x = 8; $x -lt 176; $x++) {
      if ($bytes[$row + $x] -eq 11 -or $bytes[$row + $x] -eq 14) { $sky++ }
    }
  }
  if ($sky -ne 0) {
    throw "$Label failed: roofed cell still painted $sky sky/body pixels"
  }
}

function Assert-SetupMarkerRaw([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: CCFPVIEW.RAW missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid CCFPVIEW.RAW header/length"
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

function Assert-Mode13Raw([string]$Path, [int]$MinNonzero, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label failed: RAW output missing"
  }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + 64000 + 768) -or [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label failed: invalid RAW header/length"
  }
  $nonzero = 0
  for ($i = 4; $i -lt (4 + 64000); $i++) {
    if ($bytes[$i] -ne 0) { $nonzero++ }
  }
  if ($nonzero -lt $MinNonzero) {
    throw "$Label failed: rendered framebuffer looks empty ($nonzero nonzero pixels)"
  }
}

Invoke-NumericCcfpControl $run

foreach ($c in $cases) {
  $caseDir = Join-Path $run $c.Label
  New-Item -ItemType Directory -Force $caseDir | Out-Null
  foreach ($tool in "ccecl", "ccgeo", "ccfp") {
    Copy-Item (Join-Path $build "$tool.com") (Join-Path $caseDir ($tool.ToUpper() + ".COM")) -Force
  }
  foreach ($data in "ECL1.DAX", "GEO1.DAX", "WALLDEF1.DAX", "8X8D1.DAX") {
    Copy-Item (Join-Path $c.Dir $data) (Join-Path $caseDir $data) -Force
  }

  $conf = Join-Path $caseDir "_ccfp_effects.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCECL ECL1.DAX 34 /E C:\OUT.EFX > C:\ECL.TXT
CCGEO /B GEO1.DAX $($c.Geo) C:\WALL.BIN > C:\GEO.TXT
CCFP C:\WALL.BIN /E C:\OUT.EFX /T /R > C:\FP.TXT
CCFP C:\WALL.BIN 8 13 4 /M FFRBL > C:\MOVE.TXT
ren CCFP.MOV MOVE.MOV
exit
"@ | Set-Content -Path $conf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "DOSBox did not exit while running $($c.Label) CCFP effects smoke test"
  }

  Assert-GbEffect (Join-Path $caseDir "OUT.EFX") $c.EffectGeo $c.Label
  foreach ($out in "WALL.BIN", "RESOLVE.BIN", "TILES.BIN", "PAL.BIN") {
    $path = Join-Path $caseDir $out
    if (-not (Test-Path $path) -or (Get-Item $path).Length -le 0) {
      throw "$($c.Label) failed: $out missing or empty"
    }
  }
  $fpText = Join-Path $caseDir "FP.TXT"
  if ((Test-Path $fpText) -and ((Get-Content $fpText -Raw) -match "cannot read")) {
    throw "$($c.Label) failed: CCFP reported a texture load error"
  }
  Assert-MoveTrace (Join-Path $caseDir "MOVE.MOV") 6 16 16 "$($c.Label) CCFP /M"
  if ($c.Label -eq "COK") {
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "TEXT.EFX") @("ONE", "TWO TWO")
    Add-GbesSetupTail (Join-Path $caseDir "TEXT.EFX") (Join-Path $caseDir "TEXT.EFX") 2
    $snapConf = Join-Path $caseDir "_ccfp_text_overlay.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\WALL.BIN /E C:\TEXT.EFX /T /S > C:\SNAP.TXT
exit
"@ | Set-Content -Path $snapConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $snapConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP text-overlay smoke test"
    }
    Assert-TextOverlayRaw (Join-Path $caseDir "CCFPVIEW.RAW") "COK CCFP text overlay"
    Assert-SetupMarkerRaw (Join-Path $caseDir "CCFPVIEW.RAW") "COK CCFP GBES setup marker"
    $slotConf = Join-Path $caseDir "_ccfp_text_slot.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\WALL.BIN /E C:\TEXT.EFX /Z 1 /T /S C:\SLOT1.RAW > C:\SLOT1.TXT
exit
"@ | Set-Content -Path $slotConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $slotConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP selected-text smoke test"
    }
    Assert-TextOverlayRaw (Join-Path $caseDir "SLOT1.RAW") "COK CCFP selected text overlay"
    $defaultRaw = [IO.File]::ReadAllBytes((Join-Path $caseDir "CCFPVIEW.RAW")) -join ','
    $selectedRaw = [IO.File]::ReadAllBytes((Join-Path $caseDir "SLOT1.RAW")) -join ','
    if ($defaultRaw -eq $selectedRaw) {
      throw "COK CCFP /Z 1 did not select a distinct GBSX text record"
    }
    Write-Output "[PASS] COK: CCFP /Z selected GBSX text slot"
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "ORDER.EFX") @("PICTURE", "NARRATION")
    Set-GbsxEventOpcode (Join-Path $caseDir "ORDER.EFX") 0 0x0E
    $orderConf = Join-Path $caseDir "_ccfp_text_order.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\WALL.BIN /E C:\ORDER.EFX /T /S C:\OD.RAW > C:\OD.TXT
CCFP C:\WALL.BIN /E C:\ORDER.EFX /Z 0 /T /S C:\ORDER0.RAW > C:\ORDER0.TXT
CCFP C:\WALL.BIN /E C:\ORDER.EFX /Z 1 /T /S C:\ORDER1.RAW > C:\ORDER1.TXT
exit
"@ | Set-Content -Path $orderConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $orderConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP source-order smoke test"
    }
    $orderDefault = [IO.File]::ReadAllBytes((Join-Path $caseDir "OD.RAW")) -join ','
    $order0 = [IO.File]::ReadAllBytes((Join-Path $caseDir "ORDER0.RAW")) -join ','
    $order1 = [IO.File]::ReadAllBytes((Join-Path $caseDir "ORDER1.RAW")) -join ','
    if ($orderDefault -ne $order1 -or $orderDefault -eq $order0) {
      throw "COK CCFP default narration did not skip non-narrative GBSX text"
    }
    Write-Output "[PASS] COK: CCFP source-ordered narrative text selection"
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "ACCUM.EFX") @("ALPHA", "BRAVO")
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "CLEAR.EFX") @("ERASED", "RESET")
    Set-GbsxEventOpcode (Join-Path $caseDir "CLEAR.EFX") 1 0x12
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "BOX.EFX") @("ERASED", "CLEAR", "AFTER")
    Set-GbsxEventOpcode (Join-Path $caseDir "BOX.EFX") 1 0x3D
    Add-GbsxTextSlot (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "RETURN.EFX") @("FIRST", "RETURN", "SECOND")
    Set-GbsxEventOpcode (Join-Path $caseDir "RETURN.EFX") 1 0x33
    $pageConf = Join-Path $caseDir "_ccfp_text_page.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\WALL.BIN /E C:\ACCUM.EFX /T /S C:\ACCUM.RAW > C:\ACCUM.TXT
CCFP C:\WALL.BIN /E C:\ACCUM.EFX /Z 0 /T /S C:\ACCUM0.RAW > C:\ACCUM0.TXT
CCFP C:\WALL.BIN /E C:\ACCUM.EFX /Z 1 /T /S C:\ACCUM1.RAW > C:\ACCUM1.TXT
CCFP C:\WALL.BIN /E C:\CLEAR.EFX /T /S C:\CLEAR.RAW > C:\CLEAR.TXT
CCFP C:\WALL.BIN /E C:\CLEAR.EFX /Z 1 /T /S C:\CLEAR1.RAW > C:\CLEAR1.TXT
CCFP C:\WALL.BIN /E C:\BOX.EFX /T /S C:\BOX.RAW > C:\BOX.TXT
CCFP C:\WALL.BIN /E C:\BOX.EFX /Z 2 /T /S C:\BOX2.RAW > C:\BOX2.TXT
CCFP C:\WALL.BIN /E C:\RETURN.EFX /T /S C:\RETURN.RAW > C:\RETURN.TXT
CCFP C:\WALL.BIN /E C:\RETURN.EFX /Z 0 /T /S C:\RETURN0.RAW > C:\RETURN0.TXT
CCFP C:\WALL.BIN /E C:\RETURN.EFX /Z 2 /T /S C:\RETURN2.RAW > C:\RETURN2.TXT
exit
"@ | Set-Content -Path $pageConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $pageConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP narration-page smoke test"
    }
    $raw = @{}
    foreach ($name in "ACCUM", "ACCUM0", "ACCUM1", "CLEAR", "CLEAR1", "BOX", "BOX2", "RETURN", "RETURN0", "RETURN2") {
      $raw[$name] = [IO.File]::ReadAllBytes((Join-Path $caseDir "$name.RAW")) -join ','
    }
    if ($raw.ACCUM -eq $raw.ACCUM0 -or $raw.ACCUM -eq $raw.ACCUM1) {
      throw "COK CCFP PRINT accumulation did not retain both source records"
    }
    if ($raw.CLEAR -ne $raw.CLEAR1) {
      throw "COK CCFP PRINTCLEAR did not clear preceding narration"
    }
    if ($raw.BOX -ne $raw.BOX2) {
      throw "COK CCFP CLEAR_BOX did not clear preceding narration"
    }
    if ($raw.RETURN -ne $raw.RETURN0 -or $raw.RETURN -eq $raw.RETURN2) {
      throw "COK CCFP PRINT_RETURN did not stop the first narration page"
    }
    Write-Output "[PASS] COK: CCFP ordered narration page semantics"
    Set-GbslFlag (Join-Path $caseDir "ACCUM.EFX") (Join-Path $caseDir "SIDE.EFX")
    Write-Gbsl (Join-Path $caseDir "SIDE.GBS") 129 @("ALPHA", "BRAVO")
    Set-GbslFlag (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "NOGBS.EFX")
    Set-GbslFlag (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "SHORT.EFX")
    Set-GbslFlag (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "TRAIL.EFX")
    $sideBytes = [IO.File]::ReadAllBytes((Join-Path $caseDir "SIDE.GBS"))
    $shortBytes = [byte[]]::new($sideBytes.Length - 1)
    [Array]::Copy($sideBytes, $shortBytes, $shortBytes.Length)
    [IO.File]::WriteAllBytes((Join-Path $caseDir "SHORT.GBS"), $shortBytes)
    $trailBytes = [byte[]]::new($sideBytes.Length + 1)
    [Array]::Copy($sideBytes, $trailBytes, $sideBytes.Length)
    $trailBytes[$trailBytes.Length - 1] = 0xA5
    [IO.File]::WriteAllBytes((Join-Path $caseDir "TRAIL.GBS"), $trailBytes)
    $sideConf = Join-Path $caseDir "_ccfp_sidecar.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\WALL.BIN /E C:\SIDE.EFX /T /S C:\SIDE.RAW > C:\SIDE.TXT
CCFP C:\WALL.BIN /E C:\SIDE.EFX /Z 1 /T /S C:\SIDE1.RAW > C:\SIDE1.TXT
CCFP C:\WALL.BIN /E C:\NOGBS.EFX /T /S C:\NOGBS.RAW > C:\NOGBS.TXT
CCFP C:\WALL.BIN /E C:\SHORT.EFX /T /S C:\SHORT.RAW > C:\SHORT.TXT
CCFP C:\WALL.BIN /E C:\TRAIL.EFX /T /S C:\TRAIL.RAW > C:\TRAIL.TXT
exit
"@ | Set-Content -Path $sideConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $sideConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP GBSL sidecar smoke test"
    }
    $sideRaw = [IO.File]::ReadAllBytes((Join-Path $caseDir "SIDE.RAW")) -join ','
    if ($sideRaw -ne $raw.ACCUM) {
      throw "COK CCFP did not render the complete GBSL stream instead of the terminal GBSX tail"
    }
    $sideSlotRaw = [IO.File]::ReadAllBytes((Join-Path $caseDir "SIDE1.RAW")) -join ','
    if ($sideSlotRaw -ne $raw.ACCUM1) {
      throw "COK CCFP /Z did not select an arbitrary GBSL text record"
    }
    Assert-NoTextOverlayRaw (Join-Path $caseDir "NOGBS.RAW") "COK CCFP missing GBSL"
    Assert-NoTextOverlayRaw (Join-Path $caseDir "SHORT.RAW") "COK CCFP truncated GBSL"
    Assert-NoTextOverlayRaw (Join-Path $caseDir "TRAIL.RAW") "COK CCFP trailing GBSL"
    Write-Output "[PASS] COK: CCFP lossless 129-record GBSL narration + exact-sidecar rejection"
    Write-Output "[PASS] COK: CCFP /E /S text overlay RAW"
    Write-Output "[PASS] COK: CCFP /E /S GBES setup marker RAW"
    Write-OpenWallGrid (Join-Path $caseDir "SKY.WAL")
    Add-GbclClockTail (Join-Path $caseDir "OUT.EFX") (Join-Path $caseDir "CLOCK.EFX") @(0,0,0,5,0,0,0)
    $clockConf = Join-Path $caseDir "_ccfp_clock_overlay.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\SKY.WAL 8 13 2 /E C:\CLOCK.EFX /S C:\CLOCK.RAW > C:\CLOCK.TXT
exit
"@ | Set-Content -Path $clockConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $clockConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP clock-overlay smoke test"
    }
    Assert-TextOverlayRaw (Join-Path $caseDir "CLOCK.RAW") "COK CCFP GBCL clock overlay"
    Assert-SkyBackdropRaw (Join-Path $caseDir "CLOCK.RAW") "COK CCFP GBCL sky backdrop"
    Write-Output "[PASS] COK: CCFP /E /S GBCL clock overlay RAW"
    Write-Output "[PASS] COK: CCFP /E /S GBCL sky backdrop RAW"
    Write-RoofedWallGrid (Join-Path $caseDir "ROOF.WAL")
    $roofConf = Join-Path $caseDir "_ccfp_clock_roof.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\ROOF.WAL 8 13 2 /E C:\CLOCK.EFX /S C:\ROOF.RAW > C:\ROOF.TXT
exit
"@ | Set-Content -Path $roofConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $roofConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP roofed-clock smoke test"
    }
    Assert-TextOverlayRaw (Join-Path $caseDir "ROOF.RAW") "COK CCFP roofed GBCL clock overlay"
    Assert-RoofedSkyRaw (Join-Path $caseDir "ROOF.RAW") "COK CCFP roofed GBCL sky backdrop"
    Write-Output "[PASS] COK: CCFP /E /S GBCL roofed backdrop RAW"
    Write-DoorWallGrid (Join-Path $caseDir "BLOCK.WAL") 0x00
    Write-DoorWallGrid (Join-Path $caseDir "DOOR.WAL") 0x01 -IncludeDoorTail
    $doorConf = Join-Path $caseDir "_ccfp_door_move.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$caseDir"
C:
CCFP C:\BLOCK.WAL 8 13 0 /M F > C:\BLOCK.TXT
ren CCFP.MOV BLOCK.MOV
CCFP C:\DOOR.WAL 8 13 0 /M F > C:\DOOR.TXT
ren CCFP.MOV DOOR.MOV
exit
"@ | Set-Content -Path $doorConf -Encoding ASCII
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $doorConf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { $p.Kill() } catch {}
      throw "DOSBox did not exit while running COK CCFP door movement smoke test"
    }
    Assert-MoveTraceExact (Join-Path $caseDir "BLOCK.MOV") @("8 13 0", "8 13 0") "COK CCFP blocked wall movement"
    Assert-MoveTraceExact (Join-Path $caseDir "DOOR.MOV") @("8 13 0", "8 12 0") "COK CCFP door wall movement"
    Write-Output "[PASS] COK: CCFP /M door/gateway movement override"
  }
  Write-Output "[PASS] $($c.Label): CCFP /E /T /R textured wall tables"
  Write-Output "[PASS] $($c.Label): CCFP /M movement trace"
}

$coabData = Join-Path $root "coab_extracted\Data"
$coabFiles = @("ECL2.DAX", "GEO2.DAX", "WALLDEF2.DAX", "8X8D1.DAX", "8X8D2.DAX")
if (@($coabFiles | Where-Object { -not (Test-Path (Join-Path $coabData $_)) }).Count -eq 0) {
  $coabDir = Join-Path $run "COAB"
  New-Item -ItemType Directory -Force $coabDir | Out-Null
  foreach ($tool in "ccecl", "ccgeo", "ccfp") {
    Copy-Item (Join-Path $build "$tool.com") (Join-Path $coabDir ($tool.ToUpper() + ".COM")) -Force
  }
  foreach ($data in $coabFiles) {
    Copy-Item (Join-Path $coabData $data) (Join-Path $coabDir $data) -Force
  }

  $coabConf = Join-Path $coabDir "_ccfp_coab_area2.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$coabDir"
C:
CCECL ECL2.DAX 1 /E C:\OUT.EFX > C:\ECL.TXT
CCGEO /B GEO2.DAX 1 C:\WALL.BIN > C:\GEO.TXT
CCFP C:\WALL.BIN /E C:\OUT.EFX /T /A 2 /R > C:\FP.TXT
exit
"@ | Set-Content -Path $coabConf -Encoding ASCII

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $coabConf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "DOSBox did not exit while running CoAB CCFP /A 2 effects smoke test"
  }

  Assert-GbEffect (Join-Path $coabDir "OUT.EFX") 1 "COAB"
  foreach ($out in "WALL.BIN", "RESOLVE.BIN", "TILES.BIN", "PAL.BIN") {
    $path = Join-Path $coabDir $out
    if (-not (Test-Path $path) -or (Get-Item $path).Length -le 0) {
      throw "COAB failed: $out missing or empty"
    }
  }
  $fpText = Join-Path $coabDir "FP.TXT"
  if ((Test-Path $fpText) -and ((Get-Content $fpText -Raw) -match "cannot read")) {
    throw "COAB failed: CCFP reported a texture load error"
  }
  Write-Output "[PASS] COAB: CCFP /E /T /A 2 /R textured wall tables"
} else {
  Write-Output "SKIP: COAB CCFP /A 2 effects smoke (coab_extracted\Data ECL2/GEO2/WALLDEF2/8X8D1/8X8D2 absent)"
}

$dqkDir = Join-Path $run "DQK"
New-Item -ItemType Directory -Force $dqkDir | Out-Null
Copy-Item (Join-Path $build "ccgeo.com") (Join-Path $dqkDir "CCGEO.COM") -Force
Copy-Item (Join-Path $build "ccfp.com") (Join-Path $dqkDir "CCFP.COM") -Force
Copy-Item (Join-Path $build "cchlib.com") (Join-Path $dqkDir "CCHLIB.COM") -Force
$dqk = Join-Path $root "The Dark Queen of Krynn"
# Mount a scratch mirror, never the retail release itself: `mount D "$dqk"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dqkMount = if (Test-Path -LiteralPath $dqk -PathType Container) { New-RetailStage -Source $dqk } else { $dqk }
$dqkConf = Join-Path $dqkDir "_ccfp_dqk_move.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$dqkDir"
mount D "$dqkMount"
C:
CCGEO /B D:\DISK3\GEO.GLB 2 C:\DQK.WAL > C:\DQKGEO.TXT
CCHLIB W D:\DISK2\8X8DB.TLB 0 C:\DQK.GBW 3 > C:\DQKGBW.TXT
CCFP C:\DQK.WAL /F C:\DQK.GBW /R > C:\DQKFP.TXT
ren GBWVIEW.RAW DQKFP.RAW
CCFP C:\DQK.WAL 5 5 4 /M FFRBL > C:\DQKMOVE.TXT
exit
"@ | Set-Content -Path $dqkConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dqkConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running DQK CCFP movement smoke test"
}
$dqkWall = Join-Path $dqkDir "DQK.WAL"
if (-not (Test-Path $dqkWall)) {
  throw "DQK CCFP /M failed: CCGEO did not create DQK.WAL"
}
$dqkWallBytes = [IO.File]::ReadAllBytes($dqkWall)
if (
  $dqkWallBytes.Length -lt 6 -or
  [Text.Encoding]::ASCII.GetString($dqkWallBytes, 0, 4) -ne "WGRD" -or
  $dqkWallBytes[4] -ne 10 -or
  $dqkWallBytes[5] -ne 10
) {
  throw "DQK CCFP /M failed: DQK.WAL is not the expected 10x10 WGRD map"
}
Assert-MoveTrace (Join-Path $dqkDir "CCFP.MOV") 6 10 10 "DQK CCFP /M"
Write-Output "[PASS] DQK: CCFP /M movement trace on logical area 2 10x10 WGRD"
$dqkGbw = Join-Path $dqkDir "DQK.GBW"
if (-not (Test-Path $dqkGbw)) {
  throw "DQK CCFP /F failed: CCHLIB did not create DQK.GBW"
}
$dqkGbwBytes = [IO.File]::ReadAllBytes($dqkGbw)
if (
  $dqkGbwBytes.Length -lt 16 -or
  [Text.Encoding]::ASCII.GetString($dqkGbwBytes, 0, 4) -ne "GBWS" -or
  [BitConverter]::ToUInt16($dqkGbwBytes, 4) -ne 2 -or
  [BitConverter]::ToUInt16($dqkGbwBytes, 8) -ne 141
) {
  throw "DQK CCFP /F failed: unexpected DQK.GBW header"
}
Assert-Mode13Raw (Join-Path $dqkDir "DQKFP.RAW") 1000 "DQK CCFP /F"
Write-Output "[PASS] DQK: CCFP /F real GEO.GLB + GBWS first-person RAW"

$guardDir = Join-Path $run "guard"
New-Item -ItemType Directory -Force $guardDir | Out-Null
Copy-Item (Join-Path $build "ccfp.com") (Join-Path $guardDir "CCFP.COM") -Force
[byte[]]$bad = [byte[]]::new(16)
[Text.Encoding]::ASCII.GetBytes("WGRD").CopyTo($bad, 0)
$bad[4] = 62
$bad[5] = 62
[IO.File]::WriteAllBytes((Join-Path $guardDir "BAD.WAL"), $bad)
[byte[]]$short = [byte[]]::new(32)
[IO.File]::WriteAllBytes((Join-Path $guardDir "SHORT.WAL"), $short)

$guardConf = Join-Path $guardDir "_ccfp_guard.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$guardDir"
C:
CCFP C:\BAD.WAL /P > C:\BAD.TXT
CCFP C:\SHORT.WAL /P > C:\SHORT.TXT
exit
"@ | Set-Content -Path $guardConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $guardConf -Headless:$Headless
if (-not $p.WaitForExit(30000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCFP oversized WGRD guard smoke test"
}
$badText = Join-Path $guardDir "BAD.TXT"
if (-not (Test-Path $badText) -or ((Get-Content $badText -Raw) -notmatch "cannot open walls file")) {
  throw "CCFP oversized WGRD guard failed"
}
Write-Output "[PASS] CCFP: oversized WGRD rejected"
$shortText = Join-Path $guardDir "SHORT.TXT"
if (-not (Test-Path $shortText) -or ((Get-Content $shortText -Raw) -notmatch "cannot open walls file")) {
  throw "CCFP short legacy WGRD guard failed"
}
Write-Output "[PASS] CCFP: short legacy grid rejected"

Write-Output "RESULT: CCFP /E textured effects smoke PASS"
