# dosbox-smoke.ps1 -- quiet DOSBox launcher for native smoke tests.
#
# DOSBox is an SDL GUI process, so Start-Process -WindowStyle Hidden is not
# reliable enough on its own. Launch minimized, then re-minimize the render
# window as soon as it exists. Non-visible runs also pass DOSBox's Windows-only
# -noconsole flag so the status window does not pop over the user's desktop. The
# launcher overlays a quiet CPU config by default so ad-hoc configs cannot burn a
# host CPU core with cycles=max.
#
# Set GOLDBOX_DOSBOX_CYCLES="inherit" to keep the script's own [cpu] setting, or
# set it to a DOSBox cycles value such as "fixed 80000". Non-visible smoke runs
# default to SDL dummy video/audio and a lower fixed cycle cap so repeated tests
# do not steal focus or hammer a host core. Set GOLDBOX_DOSBOX_HEADLESS=0 to
# fall back to minimized no-active-window launches on DOSBox builds without a
# working dummy SDL backend.
# GOLDBOX_DOSBOX_PRIORITY=Normal opts into normal scheduling on a busy host;
# the default policy is BelowNormal. This changes neither cycles nor timeouts.

if (-not ([System.Management.Automation.PSTypeName]'NativeDosBoxSmokeWin32').Type) {
  Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class NativeDosBoxSmokeWin32 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr l);

  public static IntPtr FindRenderWindow(uint targetPid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != targetPid) return true;
      StringBuilder t = new StringBuilder(256);
      GetWindowText(h, t, 256);
      string title = t.ToString();
      if (title.IndexOf("DOSBox", StringComparison.OrdinalIgnoreCase) >= 0 &&
          title.IndexOf("Status", StringComparison.OrdinalIgnoreCase) < 0) {
        found = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
}

function Start-DosBoxSmoke {
  param(
    [Parameter(Mandatory)][string]$Dosbox,
    [Parameter(Mandatory)][string]$Conf,
    [switch]$Visible,
    [string]$Cycles,
    [switch]$KeepConfCycles,
    [switch]$Headless
  )

  $processPriority = $env:GOLDBOX_DOSBOX_PRIORITY
  if (-not $processPriority) { $processPriority = 'BelowNormal' }
  if ($processPriority -notin @('BelowNormal', 'Normal')) {
    throw 'GOLDBOX_DOSBOX_PRIORITY must be BelowNormal or Normal'
  }
  $processPriority = if ($processPriority -ieq 'Normal') { 'Normal' } else { 'BelowNormal' }
  $sdlPriority = if ($processPriority -eq 'Normal') { 'normal,normal' } else { 'lower,lower' }

  $headlessOptOut = $env:GOLDBOX_DOSBOX_HEADLESS -match '^(0|false|no)$'
  $useHeadless = (-not $Visible) -and (-not $headlessOptOut)
  if ($Headless) {
    $useHeadless = $true
  }

  $cycleOverride = $Cycles
  if (-not $cycleOverride) { $cycleOverride = $env:GOLDBOX_DOSBOX_CYCLES }
  if (-not $cycleOverride) {
    $cycleOverride = if ($useHeadless) { "fixed 25000" } else { "fixed 50000" }
  }
  if ($KeepConfCycles -or $cycleOverride -ieq "inherit" -or $cycleOverride -ieq "conf") {
    $cycleOverride = ""
  }

  $args = @()
  if (-not $Visible) {
    $args += "-noconsole"
  }
  $args += @("-conf", "`"$Conf`"")
  if ($cycleOverride -or $env:GOLDBOX_DOSBOX_PRIORITY) {
    $quietConf = Join-Path ([IO.Path]::GetTempPath()) ("goldbox-dosbox-smoke-{0}.conf" -f ([Guid]::NewGuid().ToString("N")))
    $cpuSection = if ($cycleOverride) { "`r`n[cpu]`r`ncycles=$cycleOverride" } else { '' }
@"
[sdl]
autolock=false
priority=$sdlPriority$cpuSection
"@ | Set-Content -Path $quietConf -Encoding ASCII
    $args += @("-conf", "`"$quietConf`"")
  }

  $workDir = Split-Path -Parent (Resolve-Path -LiteralPath $Conf)
  $style = if ($Visible) { "Normal" } elseif ($useHeadless) { "Hidden" } else { "Minimized" }
  $oldVideo = $env:SDL_VIDEODRIVER
  $oldAudio = $env:SDL_AUDIODRIVER
  try {
    if ($useHeadless) {
      $env:SDL_VIDEODRIVER = "dummy"
      $env:SDL_AUDIODRIVER = "dummy"
    }
    $p = Start-Process -FilePath $Dosbox -ArgumentList $args -WindowStyle $style -WorkingDirectory $workDir -PassThru
  } finally {
    $env:SDL_VIDEODRIVER = $oldVideo
    $env:SDL_AUDIODRIVER = $oldAudio
  }
  try { $p.PriorityClass = $processPriority } catch {
    Write-Verbose "DOSBox process priority request failed: $_"
  }

  if (-not $Visible -and -not $useHeadless) {
    $deadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $deadline) {
      $p.Refresh()
      if ($p.HasExited) { break }
      $h = [NativeDosBoxSmokeWin32]::FindRenderWindow([uint32]$p.Id)
      if ($h -ne [IntPtr]::Zero) {
        [NativeDosBoxSmokeWin32]::ShowWindow($h, 7) | Out-Null # SW_SHOWMINNOACTIVE
        [NativeDosBoxSmokeWin32]::ShowWindow($h, 6) | Out-Null # SW_MINIMIZE
        break
      }
      Start-Sleep -Milliseconds 100
    }
  }

  return $p
}

function Invoke-DokGameLinkAckFlow {
  param(
    [Parameter(Mandatory)][string]$DbxExe,
    [Parameter(Mandatory)][string]$BuildDir,
    [Parameter(Mandatory)][string]$GameDir,
    [Parameter(Mandatory)][string]$GuestCommand,
    [Parameter(Mandatory)][string]$DosLogFile,
    [Parameter(Mandatory)][string]$CaptureRoot,
    [Parameter(Mandatory)][int]$TimeoutSeconds,
    [string]$PictureTracePrefix
  )

  $repo = Split-Path -Parent $PSScriptRoot
  $probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
  $client = Join-Path $repo 'tools\dosbox_gamelink.py'
  foreach ($path in @($DbxExe, $probe, $client, $BuildDir, $GameDir)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "DoK GameLink flow input absent: $path" }
  }
  # A previous ACK stage owns a short-lived DOSBox-X process. Its launcher
  # waits for process termination, but Windows can keep the image visible to
  # Get-Process briefly after the child has closed GameLink. Allow that teardown
  # window before treating the singleton as occupied; a genuinely live session
  # still fails closed after the bounded wait.
  $singletonDeadline = [DateTime]::UtcNow.AddSeconds(10)
  while (Get-Process dosbox-x -ErrorAction SilentlyContinue) {
    if ([DateTime]::UtcNow -ge $singletonDeadline) { break }
    Start-Sleep -Milliseconds 100
  }
  if (Get-Process dosbox-x -ErrorAction SilentlyContinue) {
    throw 'DoK GameLink flow requires the machine-wide GameLink singleton to be idle.'
  }

  $outcomePath = Join-Path $BuildDir '_GBCOMB.OUT'
  if (Test-Path -LiteralPath $outcomePath -PathType Leaf) {
    [byte[]]$oldOutcome = [IO.File]::ReadAllBytes($outcomePath)
    if ($oldOutcome.Length -eq 18 -and
        [Text.Encoding]::ASCII.GetString($oldOutcome, 0, 4) -eq 'GBMO' -and
        [BitConverter]::ToUInt16($oldOutcome, 4) -eq 2) {
      Remove-Item -LiteralPath $outcomePath -Force
    }
  }

  $runId = [Guid]::NewGuid().ToString('N')
  $outDir = Join-Path $CaptureRoot $runId
  New-Item -ItemType Directory -Force $outDir | Out-Null
  $logPath = Join-Path $outDir (Split-Path -Leaf $DosLogFile)
  $batchName = 'DGL' + $runId.Substring(0, 5) + '.BAT'
  $batchPath = Join-Path $BuildDir $batchName
  @('@echo off', 'D:', $GuestCommand, 'EXIT') | Set-Content -LiteralPath $batchPath -Encoding ASCII
  $probeArgs = @(
    '-NoProfile', '-File', $probe,
    '-DbxExe', $DbxExe,
    '-GameDir', $BuildDir,
    '-AdditionalMountDrive', 'D',
    '-AdditionalMountDir', $GameDir,
    '-Exe', $batchName,
    '-OutDir', $outDir,
    '-RunDirect', '-GameLink', '-NoInitialScreenshots', '-NoActionScreenshots',
    '-DosLogFile', $logPath
  )
  & pwsh @probeArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "DoK GameLink probe launch failed: $LASTEXITCODE" }

  $processRecord = Get-Content -LiteralPath (Join-Path $outDir 'probe-process.json') -Raw | ConvertFrom-Json
  $guest = Get-Process -Id ([int]$processRecord.process_id) -ErrorAction Stop
  # The route can pause many times. Give each validated ACK/page its own
  # progress window, while retaining a hard ceiling for the whole guest run.
  $ackDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $overallTimeoutSeconds = [Math]::Max(300, $TimeoutSeconds * 4)
  $overallDeadline = [DateTime]::UtcNow.AddSeconds($overallTimeoutSeconds)
  $observed = $false
  $ackIndex = 0
  $pictureTraceState = [pscustomobject]@{
    Index = 0
    Hashes = [Collections.Generic.HashSet[string]]::new()
  }
  $handledAckKeys = [Collections.Generic.HashSet[string]]::new()
  function Save-PictureTrace([switch]$Final) {
    if (-not $PictureTracePrefix) { return }
    $tracePath = Join-Path $BuildDir '_GBPICS.BIN'
    if (-not (Test-Path -LiteralPath $tracePath -PathType Leaf)) { return }
    try {
      [byte[]]$trace = [IO.File]::ReadAllBytes($tracePath)
      $valid = $trace.Length -ge 8 -and
        [Text.Encoding]::ASCII.GetString($trace, 0, 4) -eq 'GBPI' -and
        [BitConverter]::ToUInt16($trace, 4) -eq 1
      if ($valid) {
        $count = [BitConverter]::ToUInt16($trace, 6)
        $valid = $trace.Length -eq (8 + (2 * $count))
      }
      if (-not $valid) {
        if ($Final) { throw "Final GBPI trace is malformed: $tracePath" }
        return
      }
      $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($trace))
      if ($pictureTraceState.Hashes.Add($hash)) {
        $pictureTraceState.Index++
        $destination = '{0}-GBPI-{1:D3}.BIN' -f $PictureTracePrefix, $pictureTraceState.Index
        [IO.File]::WriteAllBytes($destination, $trace)
      }
    } catch {
      if ($Final) { throw }
      # The guest may be replacing the trace while it is read; retry next poll.
    }
  }
  try {
    while ([DateTime]::UtcNow -lt $overallDeadline) {
      Save-PictureTrace
      $guest.Refresh()
      if ($guest.HasExited) {
        if ($observed) { break }
        throw "DOSBox-X exited before the DoK ACK (code $($guest.ExitCode)); artifacts: $outDir"
      }
      if ([DateTime]::UtcNow -ge $ackDeadline) {
        throw "DoK GameLink ACK made no progress within ${TimeoutSeconds}s; artifacts: $outDir"
      }

      $statusLines = & python $client --timeout 0.5 status 2>$null
      if ($LASTEXITCODE -eq 0) {
        try {
          $status = ($statusLines -join "`n") | ConvertFrom-Json
          if ($status.program -match '^CCFP(?:\.COM)?$') {
            # DOS timestamps have two-second resolution and can tie. Bind the
            # framebuffer to the effect CCFP actually opened, using DOSBox's
            # file-open trace instead of guessing from host mtimes.
            $activeEffectName = $null
            if (Test-Path -LiteralPath $logPath -PathType Leaf) {
              $fileLog = Get-Content -LiteralPath $logPath
              $ccfpOpen = -1
              for ($lineIndex = $fileLog.Count - 1; $lineIndex -ge 0; $lineIndex--) {
                if ($fileLog[$lineIndex] -match 'FILES:file open command .*file .*\\?CCFP\.COM$') {
                  $ccfpOpen = $lineIndex
                  break
                }
              }
              if ($ccfpOpen -ge 0) {
                for ($lineIndex = $fileLog.Count - 1; $lineIndex -gt $ccfpOpen; $lineIndex--) {
                  if ($fileLog[$lineIndex] -match 'FILES:file open command .*file .*\\?(_GBECL|_GBEVT|_GBRES)\.BIN$') {
                    $activeEffectName = $Matches[1] + '.BIN'
                    break
                  }
                }
              }
            }
            $candidates = @()
            if ($activeEffectName) {
              $activeEffectPath = Join-Path $BuildDir $activeEffectName
              if (Test-Path -LiteralPath $activeEffectPath -PathType Leaf) {
                $candidates = @(Get-Item -LiteralPath $activeEffectPath)
              }
            }
            foreach ($candidate in $candidates) {
              [byte[]]$effect = [IO.File]::ReadAllBytes($candidate.FullName)
              $area = if ($effect.Length -ge 126) { [BitConverter]::ToUInt16($effect, 122) } else { 0 }
              $pc = if ($effect.Length -ge 126) { [BitConverter]::ToUInt16($effect, 124) } else { 0 }
              $flags = if ($effect.Length -ge 10) { [BitConverter]::ToUInt16($effect, 6) } else { 0 }
              $ackIdentity = ($area -eq 34 -and $pc -in @(151, 201, 4883, 4970)) -or
                ($area -eq 48 -and $pc -eq 1244) -or
                ($area -eq 80 -and $pc -eq 288) -or
                ($area -eq 16 -and $pc -in @(223, 328, 583, 731, 873, 1004, 1132, 1284, 1428, 1532, 1570, 1741)) -or
                ($area -eq 32 -and $pc -eq 241) -or
                ($area -eq 51 -and $pc -in @(565, 718)) -or
                ($area -eq 81 -and $pc -eq 285)
              if ($effect.Length -ne 5932 -or
                  [Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
                  [BitConverter]::ToUInt16($effect, 4) -ne 15 -or
                  [BitConverter]::ToUInt16($effect, 8) -ne 2 -or
                  -not $ackIdentity -or
                  [BitConverter]::ToUInt16($effect, 5766) -ne $pc) { continue }

              if (Test-Path -LiteralPath $outcomePath -PathType Leaf) {
                [byte[]]$outcome = [IO.File]::ReadAllBytes($outcomePath)
                if ($outcome.Length -eq 18 -and
                    [Text.Encoding]::ASCII.GetString($outcome, 0, 4) -eq 'GBMO' -and
                    [BitConverter]::ToUInt16($outcome, 4) -eq 2) { continue }
              }

              $sidecarPath = [IO.Path]::ChangeExtension($candidate.FullName, '.GBS')
              [byte[]]$sidecar = @()
              $pictures = @()
              if (Test-Path -LiteralPath $sidecarPath -PathType Leaf) {
                $sidecar = [IO.File]::ReadAllBytes($sidecarPath)
                if ($sidecar.Length -ge 8 -and
                    [Text.Encoding]::ASCII.GetString($sidecar, 0, 4) -eq 'GBSL' -and
                    [BitConverter]::ToUInt16($sidecar, 4) -in @(1, 2)) {
                  $recordCount = [BitConverter]::ToUInt16($sidecar, 6)
                  $recordsEnd = 8 + ($recordCount * 54)
                  $validExtent = $sidecar.Length -eq $recordsEnd
                  if ([BitConverter]::ToUInt16($sidecar, 4) -eq 2 -and
                      $sidecar.Length -ge ($recordsEnd + 12)) {
                    $directoryOffset = $recordsEnd
                    $tagCount = [BitConverter]::ToUInt16($sidecar, $directoryOffset + 6)
                    $payloadLength = [BitConverter]::ToUInt32($sidecar, $directoryOffset + 8)
                    $directoryEnd = $directoryOffset + 12 + (8 * $tagCount)
                    $validExtent =
                      [Text.Encoding]::ASCII.GetString($sidecar, $directoryOffset, 4) -eq 'GBPX' -and
                      [BitConverter]::ToUInt16($sidecar, $directoryOffset + 4) -eq 1 -and
                      $tagCount -gt 0 -and
                      [BitConverter]::ToUInt16($sidecar, $directoryOffset + 10) -eq 0 -and
                      $sidecar.Length -eq ($directoryEnd + $payloadLength)
                  }
                  if ($validExtent) {
                    for ($record = 0; $record -lt $recordCount; $record++) {
                      $eventOffset = 8 + ($record * 54)
                      if ([BitConverter]::ToUInt16($sidecar, $eventOffset) -eq 14 -and
                          [BitConverter]::ToUInt16($sidecar, $eventOffset + 2) -ge 1) {
                        $pictures += [BitConverter]::ToUInt16($sidecar, $eventOffset + 4)
                      }
                    }
                  } else { throw "DoK ACK sidecar extent mismatch: $sidecarPath ($outDir)" }
                } else { throw "DoK ACK sidecar header mismatch: $sidecarPath ($outDir)" }
              }
              if ($pc -eq 1741 -and (($flags -band 0x0100) -eq 0 -or $sidecar.Length -lt 8)) {
                throw "Post-combat ACK lacks its required published GBSL sidecar: effect=$($candidate.Name), flags=0x$('{0:X4}' -f $flags), sidecar=$sidecarPath"
              }
              $probeScreenshot = Join-Path $outDir 'ack-current.png'
              & python $client screenshot $probeScreenshot | Out-Null
              if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $probeScreenshot -PathType Leaf)) {
                throw "Could not capture the confirmed DoK ACK framebuffer: $outDir"
              }
              $screenHash = (Get-FileHash -LiteralPath $probeScreenshot -Algorithm SHA256).Hash
              $ackKey = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($effect)) + ':'
              if ($sidecar.Length) {
                $ackKey += [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sidecar))
              }
              $ackKey += ':' + $screenHash
              if ($handledAckKeys.Contains($ackKey)) {
                Remove-Item -LiteralPath $probeScreenshot -Force -ErrorAction SilentlyContinue
                continue
              }

              $index = '{0:D2}' -f $ackIndex
              $effectCopy = Join-Path $outDir "ack-$index-effect.bin"
              $sidecarCopy = if ($sidecar.Length) { Join-Path $outDir "ack-$index-sidecar.gbs" } else { $null }
              $screenshot = Join-Path $outDir $(if ($ackIndex -eq 0) { 'dok-ack.png' } else { "dok-ack-$index.png" })
              [IO.File]::WriteAllBytes($effectCopy, $effect)
              if ($sidecarCopy) { [IO.File]::WriteAllBytes($sidecarCopy, $sidecar) }
              Move-Item -LiteralPath $probeScreenshot -Destination $screenshot -Force
              $ackRecord = [ordered]@{
                program = $status.program
                effect = $candidate.Name
                version = 15
                status = 2
                area = $area
                pc = $pc
                flags = $flags
                sidecar = if ($sidecarCopy) { (Split-Path -Leaf $sidecarCopy) } else { $null }
                picture_ids = @($pictures)
                framebuffer = (Split-Path -Leaf $screenshot)
              }
              $ackRecord | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $outDir "ack-$index.json") -Encoding UTF8
              Write-Output "DoK GameLink ACK confirmed: program=$($status.program), $($candidate.Name) v15/status2 area=$area/PC=$pc flags=0x$('{0:X4}' -f $flags) pictures=[$($pictures -join ',')]; frame=$screenshot"
              [void]$handledAckKeys.Add($ackKey)
              $biosBeforeLines = & python $client --timeout 1 peek 0x41a 36
              if ($LASTEXITCODE -ne 0) { throw "Could not inspect BIOS keyboard queue before ACK input; artifacts: $outDir" }
              $biosBefore = ($biosBeforeLines -join "`n") | ConvertFrom-Json
              [byte[]]$biosBeforeBytes = [Convert]::FromHexString($biosBefore.hex)
              $head = [BitConverter]::ToUInt16($biosBeforeBytes, 0)
              $tail = [BitConverter]::ToUInt16($biosBeforeBytes, 2)
              if ($head -ne $tail -or $head -lt 0x1e -or $head -ge 0x3e -or
                  (($head -band 1) -ne 0) -or $tail -lt 0x1e -or $tail -ge 0x3e -or
                  (($tail -band 1) -ne 0)) {
                throw "DoK ACK BIOS keyboard ring is not empty and canonical (head=0x$('{0:X4}' -f $head), tail=0x$('{0:X4}' -f $tail)); artifacts: $outDir"
              }
              [byte[]]$biosAfterBytes = $biosBeforeBytes.Clone()
              $queueOffset = $tail - 0x1a
              $biosAfterBytes[$queueOffset] = 0x0d
              $biosAfterBytes[$queueOffset + 1] = 0x1c
              $nextTail = if (($tail + 2) -ge 0x3e) { 0x1e } else { $tail + 2 }
              [BitConverter]::GetBytes([UInt16]$nextTail).CopyTo($biosAfterBytes, 2)
              $beforeHex = [Convert]::ToHexString($biosBeforeBytes).ToLowerInvariant()
              $afterHex = [Convert]::ToHexString($biosAfterBytes).ToLowerInvariant()
              $pokeLines = & python $client --timeout 1 poke 0x41a $beforeHex $afterHex 2>&1
              $pokeExitCode = $LASTEXITCODE
              $pokeResult = $null
              if ($pokeExitCode -eq 0) {
                $pokeResult = ($pokeLines -join "`n") | ConvertFrom-Json
              }
              $biosAfterLines = & python $client --timeout 1 peek 0x41a 36
              if ($LASTEXITCODE -ne 0) { throw "Could not inspect BIOS keyboard queue after ACK input; artifacts: $outDir" }
              $biosAfter = ($biosAfterLines -join "`n") | ConvertFrom-Json
              [byte[]]$biosObservedBytes = [Convert]::FromHexString($biosAfter.hex)
              $observedHead = [BitConverter]::ToUInt16($biosObservedBytes, 0)
              $observedTail = [BitConverter]::ToUInt16($biosObservedBytes, 2)
              $keyOffset = $tail - 0x1a
              $keyWordPresent = $biosObservedBytes[$keyOffset] -eq 0x0d -and
                $biosObservedBytes[$keyOffset + 1] -eq 0x1c
              $queuedAsWritten = $observedHead -eq $head -and $observedTail -eq $nextTail
              $consumedImmediately = $observedHead -eq $nextTail -and $observedTail -eq $nextTail
              if (-not $keyWordPresent -or -not ($queuedAsWritten -or $consumedImmediately)) {
                throw "GameLink BIOS Enter insertion was not observed in the BIOS ring (poke=$pokeExitCode, head=0x$('{0:X4}' -f $observedHead), tail=0x$('{0:X4}' -f $observedTail)); artifacts: $outDir"
              }
              [ordered]@{
                before = $biosBefore.hex
                after = $biosAfter.hex
                inserted = if ($pokeResult) { $pokeResult.after } else { $afterHex }
                key = 'Enter'
                poke_exit_code = $pokeExitCode
                consumed_immediately = $consumedImmediately
                before_head = [BitConverter]::ToUInt16([Convert]::FromHexString($biosBefore.hex), 0)
                before_tail = [BitConverter]::ToUInt16([Convert]::FromHexString($biosBefore.hex), 2)
                after_head = [BitConverter]::ToUInt16([Convert]::FromHexString($biosAfter.hex), 0)
                after_tail = [BitConverter]::ToUInt16([Convert]::FromHexString($biosAfter.hex), 2)
              } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outDir "ack-$index-bios-queue.json") -Encoding UTF8
              $ackIndex++
              $observed = $true
              Save-PictureTrace
              $ackDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
              break
            }
          }
        } catch {
          $guest.Refresh()
          if ($guest.HasExited -and $observed) { break }
          Write-Warning "DoK GameLink ACK polling error: $($_.Exception.Message)"
          if ($_.Exception.Message -like 'Could not capture*' -or
              $_.Exception.Message -like 'GameLink P delivery*' -or
              $_.Exception.Message -like '*BIOS keyboard queue*' -or
              $_.Exception.Message -like 'DoK ACK BIOS*' -or
              $_.Exception.Message -like 'GameLink BIOS Enter insertion*' -or
              $_.Exception.Message -like 'DoK ACK sidecar*' -or
              $_.Exception.Message -like 'Post-combat ACK*') { throw }
        }
      }
      Start-Sleep -Milliseconds 20
    }
    if (-not $observed) { throw "Timed out waiting for CCFP with the exact DoK ACK identity; artifacts: $outDir" }
    $guest.Refresh()
    if (-not $guest.HasExited) {
      throw "DoK GameLink flow exceeded its hard ${overallTimeoutSeconds}s cap; artifacts: $outDir"
    }
    Save-PictureTrace -Final
  } finally {
    $guest.Refresh()
    if (-not $guest.HasExited) {
      Stop-Process -Id $guest.Id -Force -ErrorAction SilentlyContinue
      $guest.WaitForExit(5000) | Out-Null
    }
    Remove-Item -LiteralPath $batchPath -Force -ErrorAction SilentlyContinue
  }
}

function Stop-DosBoxSmoke {
  param(
    [Parameter(Mandatory)]$Process
  )

  $ids = New-Object System.Collections.Generic.HashSet[int]
  try { [void]$ids.Add([int]$Process.Id) } catch {}

  try {
    $all = @(Get-CimInstance Win32_Process -Filter "Name = 'DOSBox.exe' OR Name = 'dosbox.exe'")
    $pending = @([int]$Process.Id)
    while ($pending.Count -gt 0) {
      $parent = $pending[0]
      $pending = @($pending | Select-Object -Skip 1)
      foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $parent }) {
        $cid = [int]$child.ProcessId
        if ($ids.Add($cid)) { $pending += $cid }
      }
    }
  } catch {
    # Best-effort cleanup; the direct process kill below is still useful.
  }

  foreach ($id in @($ids)) {
    try {
      $p = Get-Process -Id $id -ErrorAction Stop
      if (-not $p.HasExited) {
        Stop-Process -Id $id -Force -ErrorAction Stop
        $p.WaitForExit(3000) | Out-Null
      }
    } catch {}
  }
}
