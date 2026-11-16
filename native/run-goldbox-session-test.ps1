# Regression for the profile-resolving player launcher.  It uses -PrepareOnly
# to prove session ownership without opening an interactive DOSBox window.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'run-goldbox-session-test'
$sessions = Join-Path $run 'sessions'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$launcher = Join-Path $native 'run-goldbox.ps1'
. (Join-Path $native 'goldbox-profile-layout.ps1')
. (Join-Path $native 'retail-stage.ps1')
if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { throw "Required DOSBox executable is unavailable: $dosbox" }
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force $run | Out-Null

function Write-Fixture([string]$Root, [string]$Relative) {
  $path = Join-Path $Root $Relative
  New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
  [IO.File]::WriteAllBytes($path, [Text.Encoding]::ASCII.GetBytes("fixture:$Relative"))
}
function New-Source([string]$Name, [string[]]$Files) {
  $path = Join-Path $run $Name
  foreach ($file in $Files) { Write-Fixture $path $file }
  return $path
}
function Get-Fingerprint([string]$Path) {
  $fingerprint = @{}
  Get-ChildItem -LiteralPath $Path -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($Path.TrimEnd('\').Length).TrimStart('\')
    $fingerprint[$relative] = @($_.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)
  }
  return $fingerprint
}
function Assert-Fingerprint([hashtable]$Expected, [string]$Path) {
  $actual = Get-Fingerprint $Path
  if ($actual.Count -ne $Expected.Count) { throw "Profile launcher changed source file count for $Path" }
  foreach ($name in $Expected.Keys) {
    if (-not $actual.ContainsKey($name) -or $actual[$name][0] -ne $Expected[$name][0] -or $actual[$name][1] -ne $Expected[$name][1]) {
      throw "Profile launcher touched source asset $Path\$name"
    }
  }
}
function Prepare([string]$Source, [string]$Profile) {
  $result = @(& $launcher -GamePath $Source -Profile $Profile -SessionRoot $sessions -DosBoxPath $dosbox -PrepareOnly)
  $result = $result | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
  if (-not $result -or $result.Profile -ne $Profile) { throw "Could not resolve $Profile from $Source" }
  if (-not $result.RuntimeMount.StartsWith($result.GameMount + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "$Profile runtime escaped its player session" }
  foreach ($name in @('GBBOOT.COM', 'CCHOST.COM')) {
    if (-not (Test-Path -LiteralPath (Join-Path $result.RuntimeMount $name) -PathType Leaf)) { throw "$Profile runtime is missing $name" }
  }
  return $result
}

$profiles = Get-GoldBoxProfileLayouts
$fingerprints = @{}
$runs = @{}
foreach ($profile in $profiles) {
  $direct = New-Source ("{0}-source" -f $profile.Name) $profile.Required
  $fingerprints[$direct] = Get-Fingerprint $direct
  $runs[$profile.Name] = Prepare $direct $profile.Name
  foreach ($wrapper in @($profile.Folder, "GAME\$($profile.Folder)") + $profile.LegacyWrappers) {
    $nestedFiles = $profile.Required | ForEach-Object { Join-Path $wrapper $_ }
    $nested = New-Source ("{0}-{1}-nested-source" -f $profile.Name, ($wrapper -replace '[\/]', '-')) $nestedFiles
    $fingerprints[$nested] = Get-Fingerprint $nested
    $nestedRun = Prepare $nested $profile.Name
    if ($nestedRun.GameMountPath -ine (Join-Path $nestedRun.GameMount $wrapper)) { throw "$($profile.Name) $wrapper wrapper was not preserved in its session." }
    if ((Get-Content -LiteralPath $nestedRun.Conf -Raw) -notmatch [regex]::Escape("CD \$wrapper")) { throw "$($profile.Name) launcher did not enter $wrapper." }
  }
}

$cok = Join-Path $run 'CoK-source'
$dok = Join-Path $run 'DoK-source'
$cokRun = $runs['CoK']
if ($cokRun.BootArgs -ne '/E /!') { throw "Normal CoK profile launch bypassed the native Begin/Create path: $($cokRun.BootArgs)" }
if ($cokRun.RuntimeMount -ine (Join-Path $cokRun.GameMount 'GREYBOX')) { throw 'Single-title CoK did not retain the established GREYBOX runtime.' }

$sidecar = Join-Path $cokRun.RuntimeMount '_GBLOCAL.TXT'
[IO.File]::WriteAllText($sidecar, 'player state')
[IO.File]::WriteAllBytes((Join-Path $cokRun.GameMountPath 'GREYBOX.GBS'), [byte[]](71,66,83,78))
$resume = @(& $launcher -GamePath $cok -SessionRoot $sessions -DosBoxPath $dosbox -Resume -PrepareOnly)
$resume = $resume | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if (-not $resume -or $resume.GameMount -ine $cokRun.GameMount -or $resume.RuntimeMount -ine $cokRun.RuntimeMount -or $resume.BootArgs -ne '/5 /!') {
  throw 'Resume did not reopen the original private CoK session.'
}
if ([IO.File]::ReadAllText($sidecar) -ne 'player state') { throw 'Resume preparation replaced private C: state.' }
$poolSessionBefore = Get-Fingerprint $runs['Pool'].GameMount
$poolResumeRejected = $false
try {
  & $launcher -GamePath (Join-Path $run 'Pool-source') -Profile Pool -SessionRoot $sessions -DosBoxPath $dosbox -Resume -PrepareOnly | Out-Null
} catch {
  $poolResumeRejected = $_.Exception.Message -like '*Resume is unavailable for Pool*' -and $_.Exception.Message -like '*No player session was created*'
}
if (-not $poolResumeRejected) { throw 'Pool -Resume did not reject its unsupported checkpoint contract.' }
Assert-Fingerprint $poolSessionBefore $runs['Pool'].GameMount
$party = @(& $launcher -GamePath $dok -SessionRoot $sessions -DosBoxPath $dosbox -PartyMenu -PrepareOnly)
$party = $party | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if (-not $party -or $party.BootArgs -ne '/E /!') { throw 'Party menu lost interactive mode.' }

# A single source library may hold several installed titles. Each selection
# needs its own C: sidecars even though its D: snapshot is intentionally shared.
$shared = Join-Path $run 'shared-cok-pool'
$sharedCok = $profiles | Where-Object Name -eq 'CoK' | Select-Object -First 1
$sharedPool = $profiles | Where-Object Name -eq 'Pool' | Select-Object -First 1
foreach ($file in $sharedCok.Required) { Write-Fixture $shared (Join-Path 'GAME\COK' $file) }
foreach ($file in $sharedPool.Required) { Write-Fixture $shared (Join-Path 'GAME\POOLRAD' $file) }
$sharedCokRun = Prepare $shared 'CoK'
$sharedPoolRun = Prepare $shared 'Pool'
if ($sharedCokRun.GameMount -ine $sharedPoolRun.GameMount -or $sharedCokRun.RuntimeMount -ieq $sharedPoolRun.RuntimeMount) {
  throw 'Shared title library did not isolate runtime state by selected profile.'
}
[IO.File]::WriteAllText((Join-Path $sharedCokRun.RuntimeMount '_GBLOCAL.TXT'), 'cok state')
[IO.File]::WriteAllText((Join-Path $sharedPoolRun.RuntimeMount '_GBLOCAL.TXT'), 'pool state')
$sharedCokAgain = Prepare $shared 'CoK'
if ($sharedCokAgain.RuntimeMount -ine $sharedCokRun.RuntimeMount -or
    [IO.File]::ReadAllText((Join-Path $sharedCokRun.RuntimeMount '_GBLOCAL.TXT')) -ne 'cok state' -or
    [IO.File]::ReadAllText((Join-Path $sharedPoolRun.RuntimeMount '_GBLOCAL.TXT')) -ne 'pool state') {
  throw 'Re-preparing a shared title replaced another title runtime state.'
}

# Layout persistence: growing a CoK-only library with Pool must not move CoK's
# runtime folder or orphan its sidecars.
$grow = Join-Path $run 'grow-cok-library'
foreach ($file in $sharedCok.Required) { Write-Fixture $grow $file }
$growBefore = Prepare $grow 'CoK'
[IO.File]::WriteAllText((Join-Path $growBefore.RuntimeMount '_GBLOCAL.TXT'), 'grow sentinel')
foreach ($file in $sharedPool.Required) { Write-Fixture $grow $file }
$growAfter = Prepare $grow 'CoK'
if ($growAfter.RuntimeMount -ine $growBefore.RuntimeMount) {
  throw "Adding Pool moved CoK's runtime: $($growBefore.RuntimeMount) -> $($growAfter.RuntimeMount)"
}
if (-not (Test-Path -LiteralPath (Join-Path $growAfter.RuntimeMount '_GBLOCAL.TXT') -PathType Leaf) -or
    [IO.File]::ReadAllText((Join-Path $growAfter.RuntimeMount '_GBLOCAL.TXT')) -ne 'grow sentinel') {
  throw 'Adding Pool orphaned CoK _GB* sidecars.'
}

# CoK and DoK retain their own state and each supported cold-resume contract
# when selected from the same packaged-library layout.
$resumeLibrary = Join-Path $run 'shared-cok-dok'
$resumeCok = $profiles | Where-Object Name -eq 'CoK' | Select-Object -First 1
$resumeDok = $profiles | Where-Object Name -eq 'DoK' | Select-Object -First 1
foreach ($file in $resumeCok.Required) { Write-Fixture $resumeLibrary (Join-Path 'GAME\COK' $file) }
foreach ($file in $resumeDok.Required) { Write-Fixture $resumeLibrary (Join-Path 'GAME\DOK' $file) }
$resumeCokRun = Prepare $resumeLibrary 'CoK'
$resumeDokRun = Prepare $resumeLibrary 'DoK'
[IO.File]::WriteAllBytes((Join-Path $resumeCokRun.GameMountPath 'GREYBOX.GBS'), [byte[]](71,66,83,78))
[IO.File]::WriteAllBytes((Join-Path $resumeDokRun.GameMountPath 'GREYBOX.GBS'), [byte[]](71,66,83,78))
$resumeCokShared = @(& $launcher -GamePath $resumeLibrary -Profile CoK -SessionRoot $sessions -DosBoxPath $dosbox -Resume -PrepareOnly | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1)
$resumeDokShared = @(& $launcher -GamePath $resumeLibrary -Profile DoK -SessionRoot $sessions -DosBoxPath $dosbox -Resume -PrepareOnly | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1)
if (-not $resumeCokShared -or -not $resumeDokShared -or $resumeCokShared.BootArgs -ne '/5 /!' -or $resumeDokShared.BootArgs -ne '/5 /!' -or $resumeCokShared.RuntimeMount -ieq $resumeDokShared.RuntimeMount) {
  throw 'Shared CoK/DoK selection did not retain distinct cold-resume state.'
}

$ambiguous = Join-Path $run 'ambiguous-library'
foreach ($file in $sharedCok.Required) { Write-Fixture $ambiguous (Join-Path 'GAME\COK' $file) }
foreach ($file in $sharedPool.Required) { Write-Fixture $ambiguous (Join-Path 'GAME\POOLRAD' $file) }
$beforeAmbiguous = @(Get-ChildItem -LiteralPath $sessions -Force | Select-Object -ExpandProperty Name)
$ambiguousRejected = $false
try { & $launcher -GamePath $ambiguous -SessionRoot $sessions -DosBoxPath $dosbox -PrepareOnly | Out-Null } catch { $ambiguousRejected = $_.Exception.Message -like '*No player session was created*' }
if (-not $ambiguousRejected) { throw 'Ambiguous library selected a title without an explicit profile.' }
$afterAmbiguous = @(Get-ChildItem -LiteralPath $sessions -Force | Select-Object -ExpandProperty Name)
if (Compare-Object $beforeAmbiguous $afterAmbiguous) { throw 'Ambiguous library created session state.' }

$unknown = New-Source 'unknown-source' @('README.TXT')
$before = @(Get-ChildItem -LiteralPath $sessions -Force | Select-Object -ExpandProperty Name)
$failed = $false
try { & $launcher -GamePath $unknown -SessionRoot $sessions -DosBoxPath $dosbox -PrepareOnly | Out-Null } catch { $failed = $_.Exception.Message -like '*No player session was created*' }
if (-not $failed) { throw 'Unsupported source did not reject before session staging.' }
$after = @(Get-ChildItem -LiteralPath $sessions -Force | Select-Object -ExpandProperty Name)
if (Compare-Object $before $after) { throw 'Unsupported source created session state.' }

# New-RetailStage publishes its source marker before the copy loop, so a crash
# can leave a plausible owner marker beside a partial tree. New-PlayerSession
# must reject that state before the launcher can mount or replace it.
$partial = New-Source 'partial-cok-source' $sharedCok.Required
$partialMount = New-PlayerSession -Source $partial -SessionRoot $sessions
$partialMarker = $partialMount + '.complete'
Remove-Item -LiteralPath $partialMarker -Force
Remove-Item -LiteralPath (Join-Path $partialMount $sharedCok.Required[0]) -Force
$partialRejected = $false
try {
  & $launcher -GamePath $partial -Profile CoK -SessionRoot $sessions -DosBoxPath $dosbox -PrepareOnly | Out-Null
} catch {
  $partialRejected = $_.Exception.Message -like '*initial snapshot is incomplete*'
}
if (-not $partialRejected) { throw 'Launcher accepted a partial player snapshot with only its source marker.' }
$partialMissingAsset = Join-Path $partialMount $sharedCok.Required[0]
if ((Test-Path -LiteralPath $partialMarker -PathType Leaf) -or
    (Test-Path -LiteralPath $partialMissingAsset -PathType Leaf)) {
  throw 'Incomplete player snapshot rejection repaired or mounted the partial tree.'
}
foreach ($source in $fingerprints.Keys) { Assert-Fingerprint $fingerprints[$source] $source }

# SecretAmiga is explicit and composes two inputs. These authored host fixtures
# prove launcher routing and preservation; Luna tests real native authority.
$secretAmiga=Join-Path $run 'secret-amiga-source'
$secretDos=Join-Path $run 'secret-dos-source'
New-Item -ItemType Directory -Force (Join-Path $secretAmiga 'DISK1'),(Join-Path $secretAmiga 'DISK2'),$secretDos | Out-Null
$secretGlib=[Convert]::FromHexString('474c49420000003700020001444154410000001c0000002200000037000100100001' + ('00'*21))
foreach ($name in @('ECL','GEO','MONCHA','MONITM','MONSPC')) { [IO.File]::WriteAllBytes((Join-Path $secretAmiga "DISK2\$name.GLB"),$secretGlib) }
[IO.File]::WriteAllBytes((Join-Path $secretAmiga 'DISK1\ITEMS.DAT'),[byte[]]::new(2048))
foreach ($slot in 1..6) {
  $actor=[byte[]]::new(439);$actor[0]=1;$actor[1]=65;$actor[112]=10;$actor[437]=8
  [IO.File]::WriteAllBytes((Join-Path $secretDos "CHRDATA$slot.SAV"),$actor)
}
$secretBefore=Get-Fingerprint $secretAmiga;$dosBefore=Get-Fingerprint $secretDos
$secretArgs=@{ GamePath=$secretAmiga; SecretDosPath=$secretDos; Profile='SecretAmiga'; SessionRoot=$sessions; DosBoxPath=$dosbox; PrepareOnly=$true }
$secretRun=& $launcher @secretArgs | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if ($secretRun.BootArgs -ne '/E /! /A16 /9 1' -or $secretRun.GuestWorkingDirectory -ne 'D:\DISK2' -or
    $secretRun.RuntimeMount -ine (Join-Path $secretRun.GameMount 'GREYBOX')) { throw 'SecretAmiga lost its proved fresh argv or fixed C/D layout.' }
$secretConfig=[IO.File]::ReadAllText($secretRun.Conf);$secretBatch=[IO.File]::ReadAllText($secretRun.Batch)
$guestBatchName=Split-Path -Leaf $secretRun.Batch
if ($guestBatchName -notmatch '^[A-Za-z0-9_-]{1,8}\.BAT$' -or
    $secretConfig -notmatch [regex]::Escape("call C:\$guestBatchName") -or
    -not (Test-Path -LiteralPath (Join-Path $secretRun.RuntimeMount $guestBatchName) -PathType Leaf)) {
  throw 'SecretAmiga guest CALL does not resolve to an existing DOS8.3 batch.'
}
if ($secretConfig -notmatch [regex]::Escape("mount D `"$($secretRun.GameMount)`"") -or
    $secretBatch -notmatch [regex]::Escape('CD \DISK2') -or $secretBatch -notmatch 'if errorlevel 1 goto failed' -or
    $secretBatch -notmatch 'NATIVE_FAILURE' -or $secretBatch -match '/@') { throw 'SecretAmiga generated an incorrect runtime command or concealed native failures.' }
Assert-Fingerprint $secretBefore $secretAmiga;Assert-Fingerprint $dosBefore $secretDos
$secretMissing=$false
try { & $launcher @secretArgs -Resume | Out-Null } catch { $secretMissing=$_.Exception.Message -like '*No native Secret continuation candidate*' }
if (-not $secretMissing) { throw 'SecretAmiga Resume accepted no native authority candidate.' }
# A malformed candidate is a native-rejection diagnostic, not host authority.
$secretCandidate=Join-Path $secretRun.RuntimeMount '_GBPARTY.GKB'
[IO.File]::WriteAllText($secretCandidate,'invalid candidate for native rejection')
$secretPrivate=Join-Path $secretRun.RuntimeMount '_GBLOCAL.TXT';[IO.File]::WriteAllText($secretPrivate,'played private state')
$stagedFingerprint=Get-Fingerprint $secretRun.GameMountPath
[IO.File]::WriteAllText((Join-Path $secretAmiga 'DISK2\ECL.GLB'),'changed retail ECL')
[IO.File]::WriteAllText((Join-Path $secretDos 'CHRDATA1.SAV'),'changed retail actor')
# Adding another discoverable profile to the same root must not move C:.
foreach ($file in $sharedPool.Required) { Write-Fixture $secretAmiga $file }
$secretAgain=& $launcher @secretArgs | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
$secretResume=& $launcher @secretArgs -Resume | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if ($secretAgain.RuntimeMount -ine $secretRun.RuntimeMount -or $secretResume.RuntimeMount -ine $secretRun.RuntimeMount -or
    $secretResume.BootArgs -ne '/5 /! /A16 /9 1' -or [IO.File]::ReadAllText($secretPrivate) -ne 'played private state' -or
    [IO.File]::ReadAllText($secretCandidate) -ne 'invalid candidate for native rejection') { throw 'SecretAmiga reopen refreshed inputs, lost candidate state or moved runtime C:.' }
Assert-Fingerprint $stagedFingerprint $secretRun.GameMountPath
Write-Output 'RESULT: explicit SecretAmiga dual-source snapshot, strict Resume preflight, fixed runtime and native failure markers PASS'
Write-Output 'RESULT: run-goldbox all-title profile resolver + private-session preservation PASS'
